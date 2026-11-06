// POSTURA E INTERRUPÇÃO (combat/Posture.js, FightState, Config.posture): o NPC SEGURA o golpe antes de soltar (antecipação) e acertá-lo
// aí CANCELA o golpe; equilíbrio zerado por soco = ATORDOADO; o chute no atordoado ARREMESSA; arremessado contra a parede fica PRENSADO
// (dano extra); ao levantar ganha um instante sem levar golpe; caído, a bala de longe passa por cima; o tremor da câmera vai na direção
// do golpe; no grupo, no máximo `tokens` atacam ao mesmo tempo.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'postura',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        page.setDefaultTimeout(0);
        // um pedestre brigando com o jogador, a 1,3 m na frente dele
        const setup = () => page.evaluate(() => {
            Tutorial.skip(); game.player.invulnerable = true; Config.time.cycleSeconds = 1e12; game.dayNight.hour = 13; game.dayNight.apply();
            const p = game.player.position, n = game.npcManager.npcs.filter((m) => m.alive && !m.rag && !m.free && m.index >= 0)
                .sort((a, b) => Math.hypot(a.position.x - p.x, a.position.z - p.z) - Math.hypot(b.position.x - p.x, b.position.z - p.z))[0];
            const q = n.nav.closestPoint(new BABYLON.Vector3(p.x + 1.3, 0, p.z)); n.nav.crowd.agentTeleport(n.index, q);
            game.player.root.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
            n._hitBy = 'player'; n.hp = n.maxHp; n._poise = null;
            n.fsm.setState(new FightState(n, game.player, { weapon: 'none' }));
            window._n = n; window._S = n.fsm.current;
            return true;
        });
        const punch = () => page.evaluate(() => { game.player.root.rotation.y = Math.atan2(_n.position.x - game.player.position.x, _n.position.z - game.player.position.z); game._tryPrimary(); });

        // 1) antecipação: o golpe começa segurado; acertado aí, é cancelado
        await setup();
        const w = await page.evaluate(() => { _S.cd = 0; _S._attack(game); return { windup: _S.windup, clip: _S.clip }; });
        c.ok(w.windup >= 0.2 && !!w.clip, `o NPC segura o golpe antes de soltar (${w.windup.toFixed(2)} s de antecipação)`);
        await page.evaluate(() => { _S.windup = 5; });                       // (segura bastante: o soco do jogador chega no meio)
        await punch(); await gameWait(page, 0.6, 30000);
        const it = await page.evaluate(() => ({ windup: _S.interrupts ? 0 : _S.windup, attackT: _S.interrupts ? 0 : _S.attackT, hp: _n.hp, max: _n.maxHp, kx: Math.abs(game.camera._kvx || 0) + Math.abs(game.camera._kx || 0) + Math.abs(game.camera._kvz || 0) + Math.abs(game.camera._kz || 0) }));
        c.ok(it.hp < it.max && it.windup <= 0 && it.attackT <= 0, `acertado segurando o golpe: interrompido (vida ${Math.round(it.hp)}/${it.max})`);

        // 2) equilíbrio zerado por soco: atordoado
        await setup();
        await page.evaluate(() => { _n._poise = 3; _S.cd = 9; });
        await punch(); await gameWait(page, 0.6, 30000);
        const st = await page.evaluate(() => ({ stun: _S.stun, name: _n.fsm.current.name }));
        c.ok(st.name === 'FIGHT' && st.stun > 0, `equilíbrio zerado por soco: atordoado (${st.stun.toFixed(2)} s)`);
        // 3) o chute no atordoado arremessa
        await page.evaluate(() => { game.player.root.rotation.y = Math.atan2(_n.position.x - game.player.position.x, _n.position.z - game.player.position.z); game.player.combo = null; game.input.justPressed = game.input.justPressed || {}; game.combat.strike({ position: game.player.position, heading: () => game.player.root.rotation.y, ok: () => true }, 'kick', { source: 'player', ref: game.player }); });
        await gameWait(page, 0.5, 30000);
        const kn = await page.evaluate(() => ({ rag: !!_n.rag, power: _n.rag && _n.rag.power, knock: Config.posture.knock }));
        c.ok(kn.rag && kn.power >= kn.knock * 0.85, `o chute no atordoado arremessa (força ${kn.power && kn.power.toFixed(1)})`);

        // 4) prensado: arremessado contra uma parede, dano extra e mais tempo caído (outro pedestre: o do chute pode ter morrido)
        await setup();
        const wall = await page.evaluate(() => {
            const n = _n; if (n.rag) { n.rag._finish(false); }
            // procura uma parede perto: anda de 0,5 em 0,5 m em 8 direções até MapGeo.resolveCircle empurrar
            const p = n.position; let hit = null;
            for (let k = 0; k < 16 && !hit; k++) { const a = k / 16 * Math.PI * 2; for (let r = 1; r < 12; r += 0.5) { const q = new BABYLON.Vector3(p.x + Math.sin(a) * r, 0, p.z + Math.cos(a) * r); if (MapGeo.resolveCircle(q, 0.45)) { hit = { a, r }; break; } } }
            if (!hit) return null;
            n.hp = 400; const h0 = n.hp;                                       // (vida de sobra: o prensado não mata — o resto do teste usa ele caído)
            n.ragdoll({ x: p.x - Math.sin(hit.a), z: p.z - Math.cos(hit.a) }, { dx: Math.sin(hit.a), dz: Math.cos(hit.a), power: 11, by: 'player' }, false);
            window._h0 = h0; window._wr = hit.r;
            return hit;
        });
        if (c.ok(!!wall, 'achou uma parede perto para o teste do prensado')) {
            await gameWait(page, 1.5, 60000);
            const sp = await page.evaluate(() => ({ splat: !!(_n.rag && _n.rag.splatted), hp: _n.hp, h0: window._h0, r: window._wr }));
            c.ok(sp.splat && sp.hp < sp.h0, `arremessado contra a parede (a ${sp.r} m): prensado, perdeu ${Math.round(sp.h0 - sp.hp)} de vida`);
            // 5) caído: a bala de longe passa por cima
            const pr = await page.evaluate(() => {
                const pl = game.player.position, n = _n;
                game.player.teleport(new BABYLON.Vector3(n.position.x + 12, 0, n.position.z));
                const T = game.combat._collectTargets(), far = T.some((o) => o.ref === n);
                game.player.teleport(new BABYLON.Vector3(n.position.x + 2, 0, n.position.z));
                const near = game.combat._collectTargets().some((o) => o.ref === n);
                return { prone: Posture.prone(n), far, near, phase: n.rag && n.rag.phase, alive: n.alive };
            });
            c.ok(pr.prone && !pr.far && pr.near, `caído: a bala de longe passa por cima (de perto ainda pega) — ${JSON.stringify(pr)}`);
            // 6) ao levantar: um instante sem levar golpe
            await page.evaluate(() => { if (_n.rag) _n.rag._finish(false); });
            const ifr = await page.evaluate(() => _n._ifr || 0);
            c.ok(ifr > 0.3, `levantou: ${ifr.toFixed(2)} s sem levar golpe`);
        }
        c.ok(it.kx > 0, 'o tremor da câmera vai na direção do golpe (tranco direcional)');

        // 7) grupo: três brigando — no máximo Config.posture.tokens atacam ao mesmo tempo
        const g3 = await page.evaluate(() => {
            const p = game.player.position, L = game.npcManager.npcs.filter((m) => m.alive && !m.rag && !m.free && m.index >= 0)
                .sort((a, b) => Math.hypot(a.position.x - p.x, a.position.z - p.z) - Math.hypot(b.position.x - p.x, b.position.z - p.z)).slice(0, 3);
            L.forEach((n, i) => { const a = i * 2.1; const q = n.nav.closestPoint(new BABYLON.Vector3(p.x + Math.sin(a) * 2.5, 0, p.z + Math.cos(a) * 2.5)); n.nav.crowd.agentTeleport(n.index, q); n._hitBy = 'player'; n.hp = n.maxHp; n.fsm.setState(new FightState(n, game.player, { weapon: 'none' })); });
            window._g = L; window._max = 0;
            const o = game._update.bind(game);
            game._update = (dt) => { const r = o(dt); window._max = Math.max(window._max, FightState.attackers(game.player)); return r; };
            return L.length;
        });
        await gameWait(page, 4, 150000);
        const mx = await page.evaluate(() => ({ max: window._max, tok: Config.posture.tokens }));
        c.ok(g3 === 3 && mx.max >= 1 && mx.max <= mx.tok, `três brigando: no máximo ${mx.max} atacam ao mesmo tempo (limite ${mx.tok})`);
        c.noErrors(errors, 'postura');
        await close();
    },
};
