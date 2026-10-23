// Agressividade dos pedestres (npc/Temper.js, FightState) e briga de trânsito (npc/RoadRage.js): as taxas de quem revida, as regras
// (mão livre × faca/arma), o revide no jogo com cada arma, golpe de pedestre em pedestre e uma batida que vira briga.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'aggression',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        await page.evaluate(() => {
            window.__mk = (i, id) => ({ id: i, actor: { sheet: { isNpc: true, id, atlasList: () => [id] }, npcRow: 3 }, position: { x: 0, z: 0 } });
            window.__G = (d) => ({ empire: { districtAt: () => d } });
        });

        // 1) taxas (fichas sintéticas: o sorteio é fixo por pessoa)
        const r = await page.evaluate(() => {
            const frac = (id, d, f, g = () => true) => { let n = 0, m = 0; for (let i = 0; i < 4000; i++) { const p = Temper.profile(__mk(i, id), __G(d)); if (!g(p)) continue; m++; if (f(p)) n++; } return n / (m || 1); };
            const has = (id, k) => !!(NpcArt.atlases[id] && NpcArt.atlases[id].data.clips[k]);
            return {
                men: frac('civil_mano', 'centro', (p) => p.fighter), menOld: frac('civil_repartido', 'centro', (p) => p.fighter),
                womenCenter: frac('civil_chanel', 'centro', (p) => p.fighter), womenPeri: frac('civil_chanel', 'favela', (p) => p.fighter),
                menArmed: frac('civil_mano', 'centro', (p) => !!p.weapon, (p) => p.fighter), menArmedPeri: frac('civil_mano', 'favela', (p) => !!p.weapon, (p) => p.fighter),
                womenWeapon: frac('civil_chanel', 'favela', (p) => p.weapon === 'knife' || p.weapon === 'bat', (p) => p.fighter),
                menWeapons: ['stab:knife', 'shoot:pistol', 'run:pistol'].every((k) => has('civil_mano', k)), womenWeapons: ['stab:knife', 'swing:bat', 'run:bat'].every((k) => has('civil_chanel', k)),
                lazy: NpcArt.atlases.civil_mano && NpcArt.atlases.civil_mano.pages.some((P) => P.g === 'arm'),
            };
        });
        c.ok(Math.abs(r.men - 0.6) < 0.04, `60% dos homens revidam (${(r.men * 100).toFixed(1)}%)`);
        c.ok(r.menOld < r.men * 0.6, `idosos revidam menos (${(r.menOld * 100).toFixed(1)}%)`);
        c.ok(Math.abs(r.womenCenter - 0.1) < 0.03 && Math.abs(r.womenPeri - 0.4) < 0.04, `mulheres revidam mais na periferia (${(r.womenCenter * 100).toFixed(1)}% → ${(r.womenPeri * 100).toFixed(1)}%)`);
        c.ok(r.menWeapons && r.womenWeapons, 'atlas dos civis com faca e revólver (homens) / faca e taco (mulheres)');
        c.ok(r.lazy, 'clipes armados dos civis em páginas à parte (grupo arm)');
        if (r.menWeapons) c.ok(r.menArmed > 0.3 && r.menArmedPeri > r.menArmed, `homens que revidam armados: ${(r.menArmed * 100).toFixed(0)}%, na periferia ${(r.menArmedPeri * 100).toFixed(0)}%`);
        if (r.womenWeapons) c.eq(r.womenWeapon, 1, 'mulheres revidam sempre com faca ou taco');

        // 2) as regras: mão livre × faca/arma (o perfil forçado)
        const q = await page.evaluate(() => {
            const n = __mk(1, 'civil_mano'), T = Temper.of(n), near = { position: { x: 2, z: 0 } }, far = { position: { x: 12, z: 0 } }, g = __G('centro');
            const w = (R) => (R ? R.weapon : null);
            const at = (rr, ww) => { T.r = rr; T.w = ww; return ['hand', 'blade', 'gun'].map((a) => w(Temper.reply(n, a, far, g))).concat([w(Temper.reply(n, 'gun', near, g))]); };
            const f = __mk(2, 'civil_chanel'), F = Temper.of(f); F.r = 0.01; F.w = 0.1;
            return { calm: at(0.9, 0.5), fists: at(0.1, 0.9), knife: at(0.1, 0.3), pistol: at(0.1, 0.05), woman: w(Temper.reply(f, 'hand', far, g)), car: w(Temper.reply(n, null, far, g)) };
        });
        c.eq(JSON.stringify(q.calm), '[null,null,null,null]', 'quem não é de briga não revida nada');
        c.eq(JSON.stringify(q.fists), '["none",null,null,null]', 'desarmado: revida só a mão livre');
        if (r.menWeapons) {
            c.eq(JSON.stringify(q.knife), '["none","knife",null,"knife"]', 'de faca: revida soco no braço, faca com faca, arma de fogo só colado');
            c.eq(JSON.stringify(q.pistol), '["none","pistol","pistol","pistol"]', 'de revólver: revida tudo');
        }
        if (r.womenWeapons) c.ok(q.woman === 'bat' || q.woman === 'knife', `mulher revida com faca ou taco (${q.woman})`);
        c.eq(q.car, null, 'atropelamento/explosão: ninguém revida');

        // 3) no jogo: o jogador bate e o pedestre revida com o que tem
        const scene = (rr, ww, kind, sex = 'm') => page.evaluate(([rr, ww, kind, sex]) => {
            const pl = game.player, P = pl.position;
            const n = game.npcManager.npcs.find((m) => m.alive && !m.rag && !m.free && m.index >= 0 && !m._rage && m.state === 'WANDER' && Temper.typeOf(m) && Temper.of(m).sex === sex && !Temper.of(m).old && !m.__used);
            if (!n) return null;
            n.__used = true;
            const p = game.nav.closestPoint(new BABYLON.Vector3(P.x + 1.6, 0, P.z));
            game.nav.crowd.agentTeleport(n.index, p); n.transform.position.copyFrom(p);
            Object.assign(Temper.of(n), { r: rr, w: ww });
            n.hp = n.maxHp;
            n.takeDamage(5, { x: P.x, z: P.z }, 'player', null, kind);
            window.__n = n;
            return { id: n.id, st: n.state };
        }, [rr, ww, kind, sex]);
        const after = () => page.evaluate(() => ({ st: __n.state, w: __n.fsm.current && __n.fsm.current.weapon, clip: __n.actor.clipName, shots: game.combat.shots.npc }));
        await page.evaluate(() => { game.player.invulnerable = true; game.player.weapon = 'none'; });
        if (await scene(0.1, 0.9, 'punch')) { await gameWait(page, 1.2); const a = await after(); c.ok(a.st === 'FIGHT' && a.w === 'none', `soco num homem que revida: briga no braço (${a.st}/${a.w})`); }
        if (await scene(0.1, 0.9, 'stab')) { await gameWait(page, 1.2); const a = await after(); c.ok(a.st === 'FLEE', `facada num desarmado: foge (${a.st})`); }
        if (r.menWeapons) {
            if (await scene(0.1, 0.3, 'stab')) { await gameWait(page, 1.2); const a = await after(); c.ok(a.st === 'FIGHT' && a.w === 'knife', `facada num homem de faca: briga de faca (${a.st}/${a.w})`); }
            const s0 = await page.evaluate(() => game.combat.shots.npc);
            if (await scene(0.1, 0.05, 'gun')) { await gameWait(page, 3.5); const a = await after(); c.ok(a.st === 'FIGHT' && a.w === 'pistol' && a.shots > s0, `tiro num homem de revólver: troca tiro (${a.st}/${a.w}, ${a.shots - s0} tiros)`); }
        }
        if (r.menWeapons) {                                                      // atirou NA DIREÇÃO dele (sem acertar): também é ataque com arma
            const sh = await page.evaluate(() => {
                const P = game.player.position, n = game.npcManager.npcs.find((m) => m.alive && !m.rag && !m.free && m.index >= 0 && m.state === 'WANDER' && Temper.typeOf(m) && Temper.of(m).sex === 'm' && !Temper.of(m).old && !m.__used);
                if (!n) return null;
                n.__used = true;
                const p = game.nav.closestPoint(new BABYLON.Vector3(P.x + 5, 0, P.z)); game.nav.crowd.agentTeleport(n.index, p); n.transform.position.copyFrom(p);
                Object.assign(Temper.of(n), { r: 0.1, w: 0.05 }); n.hp = n.maxHp;
                const k = Temper.onPlayerShot(game, P, Math.atan2(p.x - P.x, p.z - P.z));
                return { k, st: n.state, w: n.fsm.current && n.fsm.current.weapon };
            });
            if (sh) c.ok(sh.k >= 1 && sh.st === 'FIGHT' && sh.w === 'pistol', `tiro na direção de um homem de revólver: ele saca (${sh.st}/${sh.w})`);
        }
        await page.evaluate(() => { for (const n of game.npcManager.npcs) if (n.state === 'FIGHT' || n.state === 'HURT') n.panic(n.position, true); });      // (sem tiro por perto: ele assustaria a próxima)
        await gameWait(page, 0.5);
        if (r.womenWeapons && await scene(0.01, 0.1, 'punch', 'f')) { await gameWait(page, 1.2); const a = await after(); c.ok(a.st === 'FIGHT' && a.w === 'bat', `soco numa mulher que revida: ela vem de taco (${a.st}/${a.w})`); }
        await page.evaluate(() => { for (const n of game.npcManager.npcs) if (n.state === 'FIGHT' || n.state === 'HURT') n.panic(n.position, true); });

        // 4) golpe de pedestre em pedestre acerta (briga de rua: antes só o jogador levava)
        const pair = await page.evaluate(() => {
            const P = game.player.position, L = game.npcManager.npcs.filter((m) => m.alive && !m.rag && !m.free && m.index >= 0 && m.state === 'WANDER' && !m.__used).slice(0, 2);
            if (L.length < 2) return null;
            L.forEach((m, i) => { const p = game.nav.closestPoint(new BABYLON.Vector3(P.x - 3 - i, 0, P.z + 2)); game.nav.crowd.agentTeleport(m.index, p); m.transform.position.copyFrom(p); m.hp = m.maxHp; });
            L[0].fsm.setState(new FightState(L[0], L[1])); L[1].fsm.setState(new FightState(L[1], L[0]));
            window.__pair = L;
            return true;
        });
        if (pair) {
            await gameWait(page, 4);
            const hp = await page.evaluate(() => __pair.map((m) => m.hp / m.maxHp));
            c.ok(hp.some((h) => h < 1), `golpe de pedestre em pedestre acerta (vida ${hp.map((h) => Math.round(h * 100) + '%').join(' / ')})`);
        }

        // 5) batida que vira briga de trânsito: a chance (≥ 40% das batidas; mais com moto) e dois carros do trânsito encostados perto do jogador
        const ch = await page.evaluate(() => ({ car: RoadRage.chanceOf({ veh: {} }, { veh: {} }), moto: RoadRage.chanceOf({ veh: { isBike: true } }, { veh: {} }) }));
        c.ok(ch.car >= 0.4 && ch.moto > ch.car, `batidas que viram briga: ${ch.car * 100}% (com moto ${ch.moto * 100}%)`);
        // 5) batida que vira briga de trânsito: dois carros do trânsito encostados perto do jogador
        const rr = await page.evaluate(() => {
            Config.roadRage.chance = 1; Config.roadRage.motoChance = 1; Config.roadRage.argue = [0.6, 0.9];
            const pl = game.player.position;
            const cars = game.vehicleManager.vehicles.filter((v) => !v.isBike && !v.isBoat && v.mode === 'drive' && v.driver !== false && !v.controlled && !v.role && typeof DoorSheet !== 'undefined' && DoorSheet.SPEC[v.spec.id]);
            if (cars.length < 2) return { skip: 'menos de 2 carros' };
            const A = cars[0], B = cars[1], f = A.fwdToRef(new BABYLON.Vector3()), h = Math.atan2(f.x, f.z), p = A.position;
            B.teleport(p.x - f.x * (A.halfLen + B.halfLen + 0.2), p.z - f.z * (A.halfLen + B.halfLen + 0.2), h);
            game.player.teleport(new BABYLON.Vector3(p.x + f.z * 6, 0, p.z - f.x * 6));
            game.camera.snapTo(game.player.position);
            const inc = RoadRage._crash(game, A, f.x * 6, f.z * 6);
            window.__inc = inc; window.__AB = [A, B];
            const o = RoadRage._contact(game, A, f.x * 6, f.z * 6);
            return { inc: !!inc, ab: [A.mode, B.mode], why: inc ? '' : `contato ${o === B ? 'B' : o ? 'outro: ' + (o.mode || '?') : 'nenhum'}, câmera a ${Math.round(hypot(p.x - game.camera.target.x, p.z - game.camera.target.z))} m` };
        });
        if (rr.skip) c.note('briga de trânsito: ' + rr.skip);
        else {
            c.ok(rr.inc, `batida entre dois carros abre a briga (chance 100%) ${rr.why}`);
        }
        if (!rr.skip && rr.inc) {
            await gameWait(page, 3);
            const s1 = await page.evaluate(() => __inc.parties.map((P) => ({ npc: !!P.npc, st: P.npc && P.npc.state, ph: P.state && P.state.phase, stay: P.stay, free: !!(P.npc && P.npc.free) })));
            c.ok(s1.some((p) => p.npc && p.st === 'RAGE' && p.free), `um motorista desceu para a pista (${JSON.stringify(s1)})`);
            let seen = new Set(), done = false;
            for (let k = 0; k < 12 && !done; k++) {
                await gameWait(page, 3);
                const s = await page.evaluate(() => ({ ph: __inc.parties.map((P) => P.state && P.state.phase), open: RoadRage.list.includes(__inc), modes: __AB.map((v) => v.mode), hp: __AB.map((v) => v.hp / v.maxHp) }));
                for (const p of s.ph) if (p) seen.add(p);
                if (!s.open) { done = true; c.note(`fim da briga: fases ${[...seen].join(' → ')}; carros ${s.modes.join('/')}`); }
            }
            c.ok(seen.has('argue') || seen.has('fight'), `tirou satisfação (fases: ${[...seen].join(', ')})`);
            c.ok(done, 'a briga termina e cada um segue o seu caminho');
            let back = null;                                                      // (quem perdeu ainda corre até a calçada — até 6 s — antes de virar pedestre)
            for (let k = 0; k < 6; k++) {
                back = await page.evaluate(() => ({ rage: game.npcManager.npcs.filter((n) => n._rage).length, free: game.npcManager.npcs.filter((n) => n.free && n.state === 'RAGE').length }));
                if (!back.rage && !back.free) break;
                await gameWait(page, 2);
            }
            c.ok(back.rage === 0 && back.free === 0, `pedestres emprestados voltaram ao pool (${back.rage} ainda na briga)`);
        }
        await page.evaluate(() => { game.player.invulnerable = false; });
        c.noErrors(errors, 'agressividade');
        await close();
    },
};
