// TRÂNSITO DETALHADO (art/RoadArt.js, world/StreetDetail.js, world/RoadWorks.js): o asfalto gasto e a pintura do chão, as placas que
// caem com a batida, o quebra-molas (tranco, freada; a IA reduz antes), os pontos de ônibus, as defensas, os postes com fiação e as
// OBRAS na pista (a faixa fechada: o trânsito não entra nela — reduz e passa pela faixa ao lado — e o carro arremessa os cones).
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'transito',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        page.setDefaultTimeout(0);
        const st = await page.evaluate(() => { Tutorial.skip(); game.player.invulnerable = true; Config.time.cycleSeconds = 1e12; game.dayNight.hour = 13; game.dayNight.apply(); Config.roadworks.max = 0; return Object.assign({ fallen: game.gameEngine.world.street.signs.length }, StreetDetail.stats); });
        c.ok(st.decals > 1500, `asfalto gasto e pintura no chão: ${st.decals} marcas`);
        c.ok(st.signs > 60 && st.names > 30, `${st.signs} placas de trânsito e ${st.names} esquinas com nome de rua`);
        c.ok(st.bumps >= 5 && st.stops >= 8, `${st.bumps} quebra-molas e ${st.stops} pontos de ônibus`);
        c.ok(st.rails > 5 && st.poles > 40 && st.bins > 40, `${st.rails} defensas, ${st.poles} postes com fiação, ${st.bins} lixeiras`);

        // um carro do jogador na faixa, `back` u antes do ponto (x, z) da via, andando a `v` m/s
        const drive = (fn, back, v) => page.evaluate(([src, back, v]) => {
            const o = eval('(' + src + ')')(), n = RoadPlan.nearestRoadPoint(o.x, o.z, 12), e = n.edge, dir = o.dir || 1;
            const P = RoadPlan.at(e, n.s - dir * back), tx = P.tx * dir, tz = P.tz * dir, lane = e.w / 4, x = P.x + tz * lane, z = P.z - tx * lane;
            if (game.activeCar) { game.activeCar.setControlled(false); game.activeCar = null; game.mode = 'player'; }
            game.player.teleport(new BABYLON.Vector3(x, 0, z));
            const b = game.vehicleManager.vehicles.find((q) => !q.isBike && !q.controlled && q.visual && q.visual.lampGeom && !q.wrecked);
            b.teleport(x, z, Math.atan2(tx, tz)); b.mode = 'parked'; b.route = null; b.hp = b.maxHp || 100;
            game.player.setVisible(false); b.setControlled(true); game.activeCar = b; game.mode = 'car'; game.camera.snapTo(b.position);
            b.phys.setLinearVelocity(new BABYLON.Vector3(tx * v, 0, tz * v));
            window._car = b; window._j = 0;
            if (!StreetDetail._j0) { StreetDetail._j0 = StreetDetail._jolt; StreetDetail._jolt = function (car, sp, k0, g) { if (car === window._car && k0 >= 1) window._j++; return StreetDetail._j0.call(this, car, sp, k0, g); }; }
            return { x, z, tx, tz };
        }, [fn.toString(), back, v]);
        // segura o acelerador por `t` s (o carro do jogador não tem motorista: a velocidade é mantida à força, só na reta)
        const hold = (v, t) => page.evaluate(([v, t]) => new Promise((res) => {
            const b = window._car, f = new BABYLON.Vector3(), o = game._update.bind(game); let el = 0, minV = 99;
            game._update = (dt) => { el += dt; if (el < t * 0.35) { b.fwdToRef(f); const pv = b.phys.getLinearVelocity(); b.phys.setLinearVelocity(new BABYLON.Vector3(f.x * v, pv.y, f.z * v)); } minV = Math.min(minV, Math.abs(b.speed || 0)); if (el >= t) { game._update = o; res({ minV, j: window._j, hp: b.hp }); } return o(dt); };
        }), [v, t]);

        // 1) quebra-molas: tranco e freada
        await drive(() => { const b = StreetDetail.bumps.find((o) => CityGrid.inCity(o.x, o.z)) || StreetDetail.bumps[0]; return { x: b.x, z: b.z }; }, 14, 12);
        const hb = await hold(12, 3);
        c.ok(hb.j >= 1, `passou o quebra-molas a ~43 km/h: tranco (${hb.j}×)`);
        // a IA enxerga a lombada à frente (e não a de lado)
        const ah = await page.evaluate(() => { const b = StreetDetail.bumps[0]; return { ahead: StreetDetail.bumpAhead(b.x - b.tx * 15, b.z - b.tz * 15, b.tx, b.tz, 24), side: StreetDetail.bumpAhead(b.x - b.tz * 15, b.z + b.tx * 15, b.tx, b.tz, 24) }; });
        c.ok(Math.abs(ah.ahead - 15) < 1.5 && ah.side < 0, `a IA vê o quebra-molas a ${ah.ahead.toFixed(1)} u à frente (e não o de outra rua)`);

        // 2) placa: o carro derruba
        const sg = await page.evaluate(() => {
            const S = game.gameEngine.world.street.signs.find((s) => s.alive && CityGrid.inCity(s.x, s.z)) || game.gameEngine.world.street.signs.find((s) => s.alive);
            const b = window._car; b.teleport(S.x - S.fx * 0.2 - 3, S.z, Math.PI / 2);
            b.phys.setLinearVelocity(new BABYLON.Vector3(9, 0, 0)); window._S = S;
            return { kind: S.kind };
        });
        await gameWait(page, 1.2, 30000);
        const sg2 = await page.evaluate(() => ({ alive: window._S.alive, falling: game.gameEngine.world.street.falling.length }));
        c.ok(!sg2.alive && sg2.falling > 0, `a placa (${sg.kind}) caiu com a batida`);

        // 3) obra na pista: a IA não entra na faixa fechada; o carro do jogador arremessa os cones
        const w = await page.evaluate(() => {
            if (game.activeCar) { game.activeCar.setControlled(false); game.activeCar = null; game.mode = 'player'; game.player.setVisible(true); }
            const s0 = game.player.position, e = RoadPlan.edges.filter((q) => (q.cls === 'city' || q.cls === 'ave') && q.len > 75 && !q.layer).sort((a, b) => Math.hypot((a.a.x + a.b.x) / 2 - s0.x, (a.a.z + a.b.z) / 2 - s0.z) - Math.hypot((b.a.x + b.b.x) / 2 - s0.x, (b.a.z + b.b.z) / 2 - s0.z))[0];
            const W = RoadWorks.spawn(e, e.len / 2 + 12, 1);
            // um carro do trânsito na mesma faixa, 45 u antes
            const P = RoadPlan.at(e, Math.max(e.cutA + 4, e.len / 2 - 30)), lane = e.w / 4, x = P.x + P.tz * lane, z = P.z - P.tx * lane;
            game.player.teleport(new BABYLON.Vector3(x - P.tz * 8, 0, z + P.tx * 8)); game.camera.snapTo(game.player.position);
            for (const v of game.vehicleManager.vehicles) if (!v.controlled && v.mode === 'drive' && Math.hypot(v.position.x - x, v.position.z - z) < 60) v.teleport(v.position.x + 400, v.position.z + 400, 0);
            const t = game.vehicleManager.vehicles.find((v) => v instanceof TrafficCar && v.mode === 'drive' && !v.controlled && !v.isBike && !v.courier && !v.wrecked);
            t.teleport(x, z, Math.atan2(P.tx, P.tz)); t.startRoute(x, z, { dx: P.tx, dz: P.tz }, { e, fwd: true });
            window._t = t; window._W = W; window._in = 0; window._det = 0; window._maxAl = -99;
            const o = game._update.bind(game);
            game._update = (dt) => {
                const r = o(dt), p = t.position, al = (p.x - W.x) * W.tx + (p.z - W.z) * W.tz, lat = (p.x - W.x) * W.tz - (p.z - W.z) * W.tx;
                if (Math.abs(al) < W.L / 2 - 1 && Math.abs(lat) < 0.9) window._in++;
                if (t.detour) window._det++;
                window._maxAl = Math.max(window._maxAl, al);
                return r;
            };
            return { cones: W.cones.length, L: W.L, obs: !!W.obs };
        });
        await gameWait(page, 16, 150000);
        const wr = await page.evaluate(() => ({ inside: window._in, det: window._det, al: window._maxAl, reason: window._t.reason, root: window._t.root, inObs: game.traffic ? game.traffic.env.obstacles.some((o) => o.ref === window._W) : null }));
        c.ok(w.cones >= 8 && w.obs, `obra montada: ${w.cones} cones e cavaletes, ${w.L.toFixed(0)} u de faixa fechada`);
        c.ok(wr.inside === 0 && (wr.al > 0 || wr.det > 0 || wr.root === 'carro'), `o trânsito não entra na faixa da obra (desviou: ${wr.det > 0}, passou: ${wr.al > 0}, ${JSON.stringify(wr)})`);
        // o jogador passa por cima dos cones
        await drive(() => { const W = window._W; return { x: W.x - W.tz * 0.0, z: W.z, dir: 1 }; }, 0, 0);
        const kn = await page.evaluate(() => {
            const W = window._W, b = window._car, k = W.cones.find((q) => !q.heavy), lane = 0;
            b.teleport(k.x - W.tx * 5, k.z - W.tz * 5, Math.atan2(W.tx, W.tz)); b.phys.setLinearVelocity(new BABYLON.Vector3(W.tx * 10, 0, W.tz * 10)); window._k = k;
            return true;
        });
        await gameWait(page, 1.5, 30000);
        const kn2 = await page.evaluate(() => ({ up: window._k.up }));
        c.ok(kn && !kn2.up, 'o carro arremessa o cone da obra');
        c.noErrors(errors, 'transito');
        await close();
    },
};
