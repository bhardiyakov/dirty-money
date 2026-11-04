// A MEDIÇÃO de desempenho (etapa 0 do upgrade visual): o painel `?perf` (core/RenderStats.js) aparece e traz o lado do render —
// desenhos, triângulos, malhas, memória de vídeo —, e o benchmark de rota fixa (tools/Bench.js) mede uma cena e devolve tudo como
// estava (teto de FPS, relógio, AutoQuality, hora).
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'medicao',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx, { query: 'perf' });
        await page.waitForTimeout(1500);
        const s = await page.evaluate(() => ({ hud: !!document.getElementById('perfHud'), snap: RenderStats.snapshot() }));
        c.ok(s.hud, 'o painel ?perf aparece');
        c.ok(s.snap && s.snap.drawCalls > 0 && s.snap.tris > 0 && s.snap.activeMeshes > 0 && s.snap.texMB > 0 && s.snap.geoMB > 0,
            `retrato do render: ${s.snap && s.snap.drawCalls} desenhos, ${s.snap && Math.round(s.snap.tris / 1000)} mil triângulos, ${s.snap && Math.round(s.snap.texMB)} MB de textura`);
        page.setDefaultTimeout(0);
        const r = await page.evaluate(async () => {
            const before = { cap: Config.perf.fpsCap, cycle: Config.time.cycleSeconds, aq: game.autoQuality.off, hour: Math.round(game.dayNight.hour * 100) };
            const R = await Bench.run(game, { only: ['centro'], warmS: 0.5, warmFrames: 3, measureS: 1, measureFrames: 6 });
            const after = { cap: Config.perf.fpsCap, cycle: Config.time.cycleSeconds, aq: game.autoQuality.off, hour: Math.round(game.dayNight.hour * 100) };
            return { R, before, after, table: Bench.table(R) };
        });
        const sc = r.R && r.R.scenes[0];
        c.ok(sc && sc.frames >= 6 && sc.fps > 0 && sc.drawCalls > 0 && sc.tris > 0, `benchmark: a cena do centro medida (${sc && sc.frames} quadros, ${sc && sc.fps} FPS)`);
        c.eq(JSON.stringify(r.after), JSON.stringify(r.before), 'depois do benchmark: teto de FPS, relógio, AutoQuality e hora como estavam');
        c.ok(/Centro/.test(r.table) && /desenhos/.test(r.table), 'a tabela do benchmark sai em texto');
        c.noErrors(errors, 'medição');
        await close();
    },
};
