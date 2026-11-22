// POPULAÇÃO EM VOLTA DO JOGADOR (NPCManager: _recycle/_hidden/_fillView, StreetLife.density/_extras, TrafficManager._rainCars):
//   • todos os pedestres vivem no RAIO do jogador — chegando num lugar novo, a gente aparece em volta dele (escondida: fora da tela ou
//     ao fundo) e não lá longe;
//   • de dia há pelo menos ~10 pedestres NA TELA (a pé, a câmera de 3ª pessoa) — o rush põe mais, a madrugada e a chuva, menos;
//   • fim de semana não tem rush (ninguém indo trabalhar) e a noite de sexta e sábado enche; com sol a praia enche e no fim de semana LOTA;
//   • chuva: a rua esvazia e o trânsito engrossa (carros a mais).
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'populacao',
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
            window.__count = () => {
                const M = game.npcManager, P = game.player.position; M._vw = null;
                let vis = 0, inR = 0, all = 0;
                for (const q of M.npcs) { if (!q.alive) continue; all++; if (M._inView(q.position.x, q.position.z)) vis++; if (Math.hypot(q.position.x - P.x, q.position.z - P.z) < Config.npc.recycleDist + 5) inR++; }
                return { vis, inR, all, want: M.visTarget() };
            };
        });
        // passos fixos de jogo (lógica + física), devolvendo o controle ao navegador entre eles (o crowd dos pedestres roda num Worker)
        const step = async (secs) => { for (let t = 0; t < secs * 6; t++) { await page.evaluate(() => { for (let i = 0; i < 10; i++) { game._update(1 / 60); const ph = game.scene.getPhysicsEngine(); if (ph) ph._step(1 / 60); } }); await page.waitForTimeout(15); } };

        // ------------------------------------------------------------------ chegando num lugar: a gente em volta, e na tela
        const day = await page.evaluate(() => { Economy.day = 1; game.dayNight.hour = 14; return __goto('commercial'); });      // (terça, 14h)
        c.ok(day, 'achou uma rua comercial');
        await step(8);
        const S = [];
        for (let k = 0; k < 6; k++) { await page.evaluate((k) => { if (k % 2) game.camera.turn(Math.PI / 2); }, k); await step(1.5); S.push(await page.evaluate(() => __count())); }
        const avg = S.reduce((a, q) => a + q.vis, 0) / S.length, minIn = Math.min(...S.map((q) => q.inR / q.all));
        c.ok(minIn > 0.9, `todos os pedestres no raio do jogador (${S.map((q) => `${q.inR}/${q.all}`).join(' ')})`);
        c.ok(avg >= S[0].want * 0.8 && S.filter((q) => q.vis >= S[0].want * 0.6).length >= 5, `de dia, na tela: ${S.map((q) => q.vis).join(' ')} pedestres (meta ${S[0].want}; média ${avg.toFixed(1)}), girando a câmera`);

        // ------------------------------------------------------------------ hora, fim de semana, chuva
        const dn = await page.evaluate(() => {
            const D = (h, rain = 0, day = 1) => +StreetLife.density(h, rain, day).toFixed(2), M = game.npcManager, T = (h, k) => { game.dayNight.hour = h; Weather.cur.k = k; return M.visTarget(); };
            const k0 = Weather.cur.k;
            const out = { rush: D(8), noon: D(14), night: D(3), late: D(23), rain: D(14, 1), satRush: D(8, 0, 5), friNight: D(23, 0, 4), tueNight: D(23, 0, 1),
                tRush: T(8, 0), tDay: T(14, 0), tNight: T(3, 0), tRain: T(14, 1) };
            Weather.cur.k = k0; game.dayNight.hour = 14;
            return out;
        });
        c.ok(dn.rush > dn.noon && dn.noon > dn.night && dn.night < 0.5, `o horário muda quanta gente há: rush ${dn.rush} · tarde ${dn.noon} · madrugada ${dn.night}`);
        c.ok(dn.satRush < dn.rush * 0.9 && dn.friNight > dn.tueNight * 1.3, `fim de semana sem rush (sábado 8h ${dn.satRush} × terça ${dn.rush}); sexta à noite cheia (${dn.friNight} × terça ${dn.tueNight})`);
        c.ok(dn.rain < dn.noon * 0.7, `chuva esvazia a rua (${dn.rain} × ${dn.noon})`);
        c.ok(dn.tDay >= 10 && dn.tRush >= dn.tDay && dn.tNight < dn.tDay && dn.tRain < dn.tDay, `na tela, pelo menos: tarde ${dn.tDay} · rush ${dn.tRush} · madrugada ${dn.tNight} · chuva ${dn.tRain}`);

        // ------------------------------------------------------------------ praia: sol enche, fim de semana lota, chuva esvazia
        const beach = await page.evaluate(() => {
            const b = (CityGrid.blocks || []).find((q) => q.biome === 'beach');
            if (!b) return null;
            const p = game.nav.closestPoint(new BABYLON.Vector3((b.slab[0] + b.slab[2]) / 2, 0, (b.slab[1] + b.slab[3]) / 2), 40);
            game.player.teleport(new BABYLON.Vector3(p.x, 0, p.z)); game.camera.snapTo(game.player.position);
            const want = (day, k) => { Economy.day = day; Weather.cur.k = k; game.dayNight.hour = 12; StreetLife._exT = 0; StreetLife._extras(game, 0.1, StreetLife.density(12, k, day)); return { want: StreetLife.extrasWant, beach: StreetLife.beach }; };
            const out = { wk: want(1, 0), sat: want(5, 0), sun: want(6, 0), rain: want(5, 1) };
            Weather.cur.k = 0; Economy.day = 1;
            return out;
        });
        if (beach) c.ok(beach.sat.want > beach.wk.want * 1.5 && beach.sat.beach === 'lotada' && beach.sun.beach === 'lotada' && beach.wk.beach === 'cheia' && !beach.rain.beach,
            `praia ao meio-dia de sol: dia de semana ${beach.wk.want} a mais (${beach.wk.beach}), sábado ${beach.sat.want} (${beach.sat.beach}), domingo ${beach.sun.want}; chovendo ${beach.rain.want}`);
        else c.ok(false, 'nenhum quarteirão de praia');

        // ------------------------------------------------------------------ chuva: trânsito mais pesado
        const tr = await page.evaluate(() => {
            const T = game.traffic, W = Weather.cur, n0 = game.vehicleManager.vehicles.filter((v) => v.mode === 'drive' && !v.controlled).length;
            W.k = 1;
            for (let i = 0; i < 40; i++) { T._rcT = 0; T._rainCars(1); }
            const wantRain = T.rainWant, extra = (T.rainList || []).length, n1 = game.vehicleManager.vehicles.filter((v) => v.mode === 'drive' && !v.controlled).length;
            W.k = 0;
            for (let i = 0; i < 80; i++) { T._rcT = 0; T._rainCars(1); for (const c of T.rainList || []) c._asleep = true; }
            return { n0, n1, wantRain, extra, after: (T.rainList || []).length, wantDry: T.rainWant };
        });
        c.ok(tr.wantRain > 0 && tr.extra === tr.wantRain && tr.n1 > tr.n0, `chuva forte: o trânsito engrossa (${tr.n0} → ${tr.n1} carros rodando, ${tr.extra} a mais)`);
        c.ok(tr.wantDry === 0 && tr.after === 0, `parou de chover: os carros a mais saem, longe da tela (sobraram ${tr.after})`);

        // madrugada: a rua quase vazia na tela
        await page.evaluate(() => { game.dayNight.hour = 3; Economy.day = 1; __goto('commercial'); });
        await step(8);
        const night = []; for (let k = 0; k < 3; k++) { await step(1); night.push(await page.evaluate(() => __count())); }
        const nAvg = night.reduce((a, q) => a + q.vis, 0) / night.length;
        c.ok(nAvg < avg, `de madrugada, menos gente na tela (${night.map((q) => q.vis).join(' ')}; de dia, média ${avg.toFixed(1)})`);
        c.noErrors(errors, 'populacao');
        await close();
    },
};
