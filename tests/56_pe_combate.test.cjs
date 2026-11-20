// A PÉ E COMBATE (item 2): o personagem ARRANCA até o trote em ~0,25 s e dá MEIA-VOLTA parado em ~0,17 s (Player._landVelocity,
// Config.player.startAccel/turnRateStand); a AJUDA DE MIRA (controle/celular — Aim._assist/_lockOn, Ajustes › Ajuda de mira) puxa o
// retículo para quem está perto dele e, com o LT parado, trava no alvo à frente — o mouse segue manual; cada bala que pega mostra o
// MARCADOR (✕; vermelho ao derrubar); o tiro dá o TRANCO da câmera contra ele; a ESQUIVA PERFEITA (rolar e o golpe passar por dentro)
// desacelera o tempo e o próximo golpe é CONTRA-ATAQUE (× dano). A lógica anda em passos fixos (o Chromium por software desenha devagar).
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'pe_combate',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        page.setDefaultTimeout(0);

        // --- arrancada e meia-volta (a locomoção de terra, sozinha)
        const mv = await page.evaluate(() => {
            Tutorial.skip(); Config.time.cycleSeconds = 1e12; game.player.invulnerable = true;
            const p = game.player, P = Config.player, dt = 1 / 60, dir = new BABYLON.Vector3(0, 0, 1);
            p.velocity.setAll(0); p.root.rotation.y = 0; p.skidding = false;
            let t = 0;
            while (Math.hypot(p.velocity.x, p.velocity.z) < P.jogSpeed * 0.95 && t < 3) { p._landVelocity(dir, P.jogSpeed, dt, false); t += dt; }
            const start = t;
            p.velocity.setAll(0); p.root.rotation.y = 0;
            const back = new BABYLON.Vector3(0, 0, -1);
            t = 0;
            while (Math.abs(CompassCamera.wrap(p.root.rotation.y - Math.PI)) > 0.1 && t < 3) { p._landVelocity(back, P.jogSpeed, dt, false); t += dt; }
            const turn = t;
            // correndo e invertendo: ainda derrapa (o pique continua pesado)
            p.velocity.set(0, 0, 12); p.root.rotation.y = 0; p.skidding = false;
            p._landVelocity(back, P.sprintSpeed, dt, false);
            const skid = p.skidding;
            p.velocity.setAll(0); p.skidding = false;
            return { start, turn, skid };
        });
        c.ok(mv.start <= 0.35, `arranca até o trote em ${mv.start.toFixed(2)} s`);
        c.ok(mv.turn <= 0.22, `meia-volta parado em ${mv.turn.toFixed(2)} s`);
        c.ok(mv.skid, 'correndo forte e invertendo, ainda derrapa');

        // --- um pedestre parado à frente, a pistola na mão (render parado: a câmera e a tela ficam fixas)
        const ok = await page.evaluate(() => {
            const p = game.player, P = p.position;
            const n = game.npcManager.npcs.filter((m) => m.alive && !m.rag && !m.free && m.index >= 0 && m.state === 'WANDER')
                .sort((a, b) => Math.hypot(a.position.x - P.x, a.position.z - P.z) - Math.hypot(b.position.x - P.x, b.position.z - P.z))[0];
            if (!n) return null;
            n.setSpeed(0); n.fsm.setState({ name: 'IDLE', update() {} });
            game.player.teleport(new BABYLON.Vector3(n.position.x - 7, 0, n.position.z));
            p.root.rotation.y = Math.PI / 2;                                  // (de frente para ele: leste)
            game.inventory.give && game.inventory.give('pistol', 60);
            if (!game.inventory.owned('pistol')) return 'sem pistola';
            game.equipWeapon('pistol'); p.action = null;
            game.gameEngine.engine.stopRenderLoop();
            game.camera.snapTo(p.position);
            for (let i = 0; i < 4; i++) game._update(1 / 30);
            game.scene.activeCamera.getViewMatrix(true); game.scene.updateTransformMatrix(true);
            window._foe = n;
            return { los: MapGeo.hasLineOfSight(P.x, P.z, n.position.x, n.position.z) };
        });
        if (!c.ok(ok && ok.los, `pedestre à frente, à vista, com a pistola (${JSON.stringify(ok)})`)) { await close(); return; }

        const am = await page.evaluate(() => {
            const A = game.aim, n = window._foe, out = {};
            const q = A._aimAt(n, 'person', 0);
            out.q = q;
            // ímã: o retículo ao lado dele vem para perto (e passa a pegar nele)
            const src = { x: q.x + 34, y: q.y + 10, kind: 'stick' }, d0 = Math.hypot(src.x - q.x, src.y - q.y);
            const r = A._assist(src);
            out.pull = { d0, d1: Math.hypot(r.x - q.x, r.y - q.y), pickRaw: A._pick(src.x, src.y) === n, pick: A._pick(r.x, r.y) === n };
            // trava: LT parado, o alvo mais perto à frente
            A._lock = null;
            const L = A._lockOn();
            out.lock = { got: !!L, on: A._lock === n, pick: L ? A._pick(L.x, L.y) === n : false };
            // desligado em Ajustes: nada muda
            game.menu.settings.aimHelp = false;
            const off = A._assist(src);
            out.off = off.x === src.x && off.y === src.y && !A._help();
            game.menu.settings.aimHelp = true;
            // mouse: sempre manual (o cursor é a mira)
            const inp = game.input, keep = { pad: inp.usingPad, touch: inp.touchAim, mx: inp.mouseX, my: inp.mouseY };
            inp.usingPad = false; inp.touchAim = null; inp.mouseX = src.x; inp.mouseY = src.y;
            const m = A._reticle(1 / 30);
            out.mouse = !!m && m.kind === 'mouse' && m.x === src.x && m.y === src.y;
            Object.assign(inp, { usingPad: keep.pad, touchAim: keep.touch, mouseX: keep.mx, mouseY: keep.my });
            out.row = PauseMenu.SET_KEYS.includes('aimHelp');
            return out;
        });
        c.ok(am.pull.d1 < am.pull.d0 * 0.6 && am.pull.pick, `ajuda de mira: o retículo a ${am.pull.d0.toFixed(0)} px vem para ${am.pull.d1.toFixed(0)} px do alvo e pega nele`);
        c.ok(am.lock.got && am.lock.on && am.lock.pick, 'LT parado: trava no pedestre à frente');
        c.ok(am.off, 'Ajustes › Ajuda de mira desligada: o retículo fica onde está');
        c.ok(am.mouse, 'no mouse a mira é manual (o cursor é a mira)');
        c.ok(am.row, 'Ajustes › Ajuda de mira existe');

        // --- tranco da câmera no tiro e o marcador de acerto
        const hk = await page.evaluate(() => {
            const p = game.player, n = window._foe, P = p.position, A = game.aim, cam = game.camera, out = {};
            n.hp = n.maxHp = 400;
            const ang = Math.atan2(n.position.x - P.x, n.position.z - P.z);
            p.root.rotation.y = ang;
            cam._kvx = 0; cam._kvz = 0; cam._shake = 0;
            game._fireCd = 0; game.reloading = 0;
            game._onAttack('shoot');
            out.kick = { shake: cam._shake, back: -(cam._kvx * Math.sin(ang) + cam._kvz * Math.cos(ang)) };
            const h0 = A.hits, k0 = A.kills;
            for (let i = 0; i < 40 && A.hits === h0; i++) game.combat.update(1 / 60);
            out.hit = A.hits > h0; out.mark = document.getElementById('hitMark').className;
            // derrubou: o marcador vermelho
            n.hp = 1;
            A._markT = 0;
            game.combat.fire({ x: P.x, z: P.z, angle: ang, owner: 'player', ref: p }, 'pistol');
            for (let i = 0; i < 40 && A.kills === k0; i++) game.combat.update(1 / 60);
            out.kill = A.kills > k0; out.markK = document.getElementById('hitMark').className;
            return out;
        });
        c.ok(hk.kick.shake > 0 && hk.kick.back > 0, `o tiro dá o tranco da câmera para trás (${hk.kick.shake.toFixed(3)}, ${hk.kick.back.toFixed(2)})`);
        c.ok(hk.hit && hk.mark === 'on', `acertou: o marcador ✕ na mira (${hk.mark})`);
        c.ok(hk.kill && hk.markK === 'kill', `derrubou: o marcador vermelho (${hk.markK})`);

        // --- esquiva perfeita e o contra-ataque
        const pd = await page.evaluate(() => {
            const p = game.player, out = {};
            const n = game.npcManager.npcs.filter((m) => m.alive && !m.rag && !m.free && m.index >= 0 && m !== window._foe)
                .sort((a, b) => Math.hypot(a.position.x - p.position.x, a.position.z - p.position.z) - Math.hypot(b.position.x - p.position.x, b.position.z - p.position.z))[0];
            n.setSpeed(0); n.fsm.setState({ name: 'IDLE', update() {} });
            p.teleport(new BABYLON.Vector3(n.position.x - 0.9, 0, n.position.z));
            p.action = null; p._rollCd = 0; p.stamina = 999; p.hp = p.maxHp;
            game.timeScale = 1; game._slowUntil = 0; game._counterUntil = 0; game._pdCool = 0;
            const hp0 = p.hp, d0 = game.perfectDodges || 0;
            // o golpe dele, mirado no jogador; o jogador rola para trás no mesmo instante
            const P = p.position, N = n.position;
            game.combat.strike({ position: N, heading: () => Math.atan2(P.x - N.x, P.z - N.z), ok: () => true }, 'punch', { source: 'npc', ref: n, foe: p });
            out.rolled = p.startRoll(-1, 0);
            const T = Config.tactics.rollIframes;
            for (let t = 0; t < T[0] + 0.01; t += 1 / 120) p._updateRoll(1 / 120);
            for (let i = 0; i < 30; i++) game.combat._updateStrikes(1 / 60);
            out.dodges = (game.perfectDodges || 0) - d0;
            out.slow = game.timeScale < 1;
            out.window = game._counterUntil > performance.now() / 1000;
            out.hurt = p.hp < hp0;
            // o próximo golpe do jogador sai como contra-ataque
            p.roll = null; p.action = null;
            game._onAttack('punch');
            const L = game.combat.strikes || [];
            out.counter = !!(L.length && L[L.length - 1].counter);
            // contra-ataque × golpe normal: o dano
            const M = Melee.punch, hit = (counter) => { n.hp = n.maxHp = 500; game.combat._land({ who: { position: P }, M, kind: 'punch', dmgMul: 1, source: 'player', counter, onHit: null }, n, N.x, N.z); return 500 - n.hp; };
            out.dmg = { normal: hit(false), counter: hit(true) };
            game.timeScale = 1; game._slowUntil = 0;
            return out;
        });
        c.ok(pd.rolled && pd.dodges === 1 && !pd.hurt, `rolou na hora do soco: esquiva perfeita, sem apanhar (${JSON.stringify({ d: pd.dodges, hurt: pd.hurt })})`);
        c.ok(pd.slow && pd.window, 'a esquiva perfeita desacelera o tempo e abre o contra-ataque');
        c.ok(pd.counter, 'o golpe seguinte sai como contra-ataque');
        c.ok(pd.dmg.counter > pd.dmg.normal * 1.3, `contra-ataque dói mais (${pd.dmg.counter.toFixed(1)} × ${pd.dmg.normal.toFixed(1)})`);
        c.noErrors(errors, 'pe_combate');
        await close();
    },
};
