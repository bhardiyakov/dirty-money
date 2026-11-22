// A RUA CALMA E ESPONTÂNEA (npc/StreetIdle.js, NPC.offRoad/trafficWait, Config.chaos): pedestre na calçada (nunca parado na pista,
// atravessa na faixa com o sinal — correndo também), gente sentada nos bancos (praças e parques ganharam bancos), esperando no ponto
// (e embarcando quando o ônibus para), rodinhas de conversa, mendigos no centro e na periferia (E: uma moeda) — e menos briga,
// figura e correria.
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'rua_calma',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        page.setDefaultTimeout(0);
        await page.evaluate(() => {
            Tutorial.skip(); if (Interiors.active) Interiors.leave(game); Interiors.autoEnter = () => {};
            Config.time.cycleSeconds = 1e12; game.player.invulnerable = true; Weather.cur.set('clear', true, true);
            game.gameEngine.engine.stopRenderLoop();
            window.__goto = (biome) => {
                const P = game.player.position;
                for (let i = 0; i < 300; i++) {
                    const q = RoadNet.randomLanePoint(30, { x: P.x, z: P.z, rMin: 0, rMax: 1200 }); if (!q) continue;
                    const b = CityGrid._blockAtPoint(q.point.x + 8, q.point.z);
                    if (!b || b.biome !== biome) continue;
                    const s = game.nav.closestPoint(new BABYLON.Vector3(q.point.x + 6, 0, q.point.z));
                    game.player.teleport(new BABYLON.Vector3(s.x, 0, s.z)); game.camera.snapTo(game.player.position);
                    return true;
                }
                return false;
            };
            window.__road = () => { let road = 0, n = 0; for (const q of game.npcManager.npcs) { if (!q.alive || q.rag || q.state === 'FLEE') continue; n++; const E = RoadPlan.nearestRoadPoint(q.position.x, q.position.z, 8); if (E && CityGrid.URBAN_CLS.has(E.edge.cls) && RoadPlan.onAsphalt(q.position.x, q.position.z, 0) && !CityGrid.inCrosswalk(q.position.x, q.position.z, 0.6)) { road++; (window.__rw || (window.__rw = [])).push(q.state + (q.free ? '/free' : '') + '@' + (CityGrid._blockAtPoint(q.position.x, q.position.z) || {}).biome + ':' + (game.nav.walk(q.position.x, q.position.z) ? 'nav' : 'off') + ':' + ((RoadPlan.nearestRoadPoint(q.position.x, q.position.z, 8) || {}).edge || {}).cls); } } return { road, n }; };
            window.__st = () => { const o = {}; for (const q of game.npcManager.npcs) if (q.alive) o[q.state] = (o[q.state] || 0) + 1; return o; };
        });
        const step = async (secs) => { for (let t = 0; t < secs * 6; t++) { await page.evaluate(() => { for (let i = 0; i < 10; i++) { game._update(1 / 60); const ph = game.scene.getPhysicsEngine(); if (ph) ph._step(1 / 60); } }); await page.waitForTimeout(15); } };

        // ------------------------------------------------------------------ bancos e pontos
        const seats = await page.evaluate(() => { const S = StreetIdle._seatsBuild(); return { bench: S.filter((s) => s.kind === 'bench').length, stop: S.filter((s) => s.kind === 'stop').length, plazaBenches: CityGrid.blocks.filter((b) => (b.biome === 'plaza' || b.biome === 'park') && (b.pieces || []).some((p) => p.kind === 'bench')).length };
        });
        c.ok(seats.plazaBenches >= 5 && seats.bench >= 40 && seats.stop >= 20, `bancos nas praças e parques (${seats.plazaBenches} quarteirões com banco; ${seats.bench} lugares) e nos pontos de ônibus (${seats.stop} lugares)`);
        const lane = await page.evaluate(() => { let bad = 0, n = 0; const P = game.player.position; for (let i = 0; i < 30; i++) { const q = RoadNet.randomLanePoint(30, { x: P.x, z: P.z, rMin: 0, rMax: 400 }); if (!q) continue; const e = RoadPlan.nearestRoadPoint(q.point.x, q.point.z, 3); if (!e || !CityGrid.URBAN_CLS.has(e.edge.cls)) continue; n++; if (NPC.offRoad(q.point.x, q.point.z)) bad++; } return { bad, n }; });
        c.ok(lane.bad === 0, `o meio da pista da cidade não é lugar de pedestre (NPC.offRoad: ${lane.bad}/${lane.n})`);

        // ------------------------------------------------------------------ uma tarde na praça e no comércio
        const S = [], R = [];
        for (const [b, h] of [['plaza', 10], ['commercial', 15]]) {
            await page.evaluate(([b, h]) => { game.dayNight.hour = h; __goto(b); }, [b, h]);
            for (let k = 0; k < 4; k++) { await step(8); S.push(await page.evaluate(() => __st())); R.push(await page.evaluate(() => __road())); }
        }
        const stats = await page.evaluate(() => Object.assign({}, StreetIdle.stats));
        const peak = (k) => Math.max(...S.map((o) => o[k] || 0));
        c.ok(stats.sit >= 2 && peak('SIT') >= 1, `gente sentada nos bancos (${stats.sit} sentaram; até ${peak('SIT')} ao mesmo tempo)`);
        c.ok(stats.chat >= 2 && peak('CHAT') >= 2, `rodinhas de conversa (${stats.chat} rodinhas; até ${peak('CHAT')} pessoas conversando)`);
        c.ok(stats.beg >= 1 && peak('BEG') >= 1, `mendigos no centro/comércio (${stats.beg})`);
        const worst = Math.max(...R.map((r) => r.road)), who = await page.evaluate(() => (window.__rw || []).slice(0, 8).join(', '));
        c.ok(worst <= 1, `pedestres na calçada: na pista das ruas da cidade, fora da faixa, no pior momento ${worst} de ${R[0].n} (${R.map((r) => r.road).join(' ')}${who ? ' — ' + who : ''})`);

        // ------------------------------------------------------------------ ponto de ônibus: espera e embarca
        const bus = await page.evaluate(() => {
            const P = game.player.position, st = StreetIdle.stopNear(P.x, P.z, 2000), M = game.npcManager;
            const n = M.npcs.find((q) => StreetIdle._free(q));
            if (!st || !n) return null;
            const p = game.nav.closestPoint(new BABYLON.Vector3(st.x, 0, st.z), 4);
            n.relocate(p, null, 'casual'); n._idleAt = 0;
            const S = new BusWaitState(n, st); n.fsm.setState(S);
            for (let i = 0; i < 60 && S.phase === 'go'; i++) { n.update(0.1); S.update(0.1); }
            S.phase = 'wait'; S.t = 0;
            const b0 = StreetIdle.stats.boarded;
            StreetIdle.onBus({ position: new BABYLON.Vector3(st.cx, 0, st.cz), destroyed: false }, st);
            const boarding = S.phase === 'board';
            for (let i = 0; i < 80 && StreetIdle.stats.boarded === b0; i++) { n.update(0.1); if (n.fsm.current === S) S.update(0.1); }
            return { boarding, boarded: StreetIdle.stats.boarded - b0, after: n.fsm.name, far: Math.hypot(n.position.x - st.x, n.position.z - st.z) };
        });
        if (bus) c.ok(bus.boarding && bus.boarded === 1 && bus.far > 15, `no ponto: o ônibus para, quem espera embarca e some dali (${bus.boarded}; reapareceu a ${bus.far.toFixed(0)} m)`);
        else c.ok(false, 'sem ponto de ônibus para o teste');

        // ------------------------------------------------------------------ uma moeda para o mendigo
        const alms = await page.evaluate(() => {
            const n = StreetIdle.beggars.find((q) => q.alive);
            if (!n) return null;
            const P = game.player; P.teleport(new BABYLON.Vector3(n.position.x + 1, 0, n.position.z));
            const c0 = game.inventory.cash = Math.max(game.inventory.cash, 50), a0 = StreetIdle.stats.alms;
            const pr = StreetIdle.prompt(game), ok = StreetIdle.interact(game);
            return { pr: /moeda/.test(pr), ok, paid: c0 - game.inventory.cash, alms: StreetIdle.stats.alms - a0, again: StreetIdle.prompt(game) };
        });
        if (alms) c.ok(alms.pr && alms.ok && alms.paid === 5 && alms.alms === 1 && !alms.again, `E perto do mendigo dá R$ ${alms.paid} (uma vez)`);
        else c.ok(false, 'nenhum mendigo por perto');

        // ------------------------------------------------------------------ menos caos
        const C = await page.evaluate(() => ({ every: Config.chaos.every, bumpCd: Config.chaos.bumpCd, herd: Config.npc.herdChance, ring: Config.chaos.ring.join }));
        c.ok(C.every[0] >= 60 && C.bumpCd >= 12 && C.herd <= 0.4 && C.ring <= 0.06, `menos caos: figuras a cada ${C.every.join('–')} s, esbarrão-cena a cada ${C.bumpCd} s, pânico contagia ${(C.herd * 100).toFixed(0)}%`);
        c.noErrors(errors, 'rua_calma');
        await close();
    },
};
