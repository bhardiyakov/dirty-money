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
        // Memória dos atlas dos personagens (os testes rodam no Low): páginas em meia resolução e o protagonista prendendo só o que usa.
        const m = await page.evaluate(() => {
            // 2×2 → 1: fica o pixel mais opaco, inteiro (material ≥ 8 conta como opaco; senão o 2º byte é o alfa)
            const src = new Uint8Array([0, 0, 3, 200, 9, 40, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 255]);     // 5×2: blocos [vazio, (3,200)] [(9,40)] [(2,255)]
            const h = AtlasDecoder.halve(src, 5, 2);
            let half = 0, full = 0, bytesOk = true, sum = 0;
            for (const A of Object.values(NpcArt.atlases)) for (const P of A.pages) if (P.tex && !A.live) {
                if (P.hs === 2) half++; else full++;
                const sz = P.tex.getSize(); if (sz.width !== Math.ceil(P.w / (P.hs || 1)) || sz.height !== Math.ceil(P.h / (P.hs || 1))) bytesOk = false;
            }
            for (const P of NpcArt._live) sum += NpcArt._bytes(P);
            const pin = NpcArt._pins(), need = NpcArt._heroNeeds(pin), held = [];
            for (const id of pin) { const A = NpcArt.atlases[id]; if (A) for (const P of A.pages) if (NpcArt._heroHolds(P, pin, need)) held.push(P.g); }
            return { h: Array.from(h.data), hs: h.hs, half, full, bytesOk, resOk: sum === NpcArt._res, low: Graphics.level === 'low', npcHalf: NpcArt.half, held, water: need.groups.has('water'), arms: need.arms };
        });
        c.eq(JSON.stringify(m.h), JSON.stringify([3, 200, 9, 40, 2, 255]), 'meia resolução: cada bloco 2×2 guarda o pixel mais opaco, inteiro');
        if (m.low) {
            c.ok(m.npcHalf && m.half > 0 && m.full === 0, `Low: páginas dos personagens em meia resolução (${m.half} na GPU)`);
            c.ok(m.bytesOk && m.resOk, 'Low: textura com metade do lado e a memória contada pelo tamanho real');
        } else c.note('o preset não é o Low: meia resolução não testada');
        c.ok(!m.held.includes('gym') && (m.water || !m.held.includes('water')), `protagonista: academia${m.water ? '' : ' e natação'} fora dos presos longe delas (${[...new Set(m.held)].join(', ')})`);
        c.noErrors(errors, 'medição');
        await close();
    },
};
