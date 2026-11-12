// DESEMPENHO NO PC (docs/otimizacao.md, "novembro/2026"):
//   • os acabamentos da cidade em pedaços de 64 u (Config.world.trimChunk): só os que tocam a tela são processados;
//   • vegetação rasteira (Trees3D.COVER) fora do mapa de sombras, cascalho com 180 triângulos (eram 720); as árvores continuam projetando;
//   • vídeo integrado reconhecido (Graphics.MID_GPU → Medium no automático) e o teto de pixels do preset (maxPx);
//   • os efeitos de tela numa variante própria do shader da gradação: em repouso roda a de sempre;
//   • o AutoQuality desce ATÉ O FIM (resolução, sem MSAA, sem paralaxe, sem sombras, sem rasteiras), guarda o degrau e a sessão
//     seguinte começa um acima; nos testes (navegador automatizado) só valem os dois degraus de sombra;
//   • SEM PLACA DE VÍDEO (o navegador desenhando pelo processador — "Microsoft Basic Render Driver", SwiftShader): o automático
//     escolhe o Low, o AutoQuality já começa a 70% e vai até 45%, e há o passo a passo para ligar a placa;
//   • a 1 FPS (todo quadro com mais de meio segundo) o AutoQuality desce — antes esses quadros eram ignorados; uma volta do segundo
//     plano não conta.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'desempenho',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx, { query: 'gfx=medium' });
        page.setDefaultTimeout(0);
        await page.evaluate(() => { Tutorial.skip(); game.gps = null; game.player.invulnerable = true; Config.time.cycleSeconds = 1e12; game.autoQuality.off = true; });

        // 1) o mundo: pedaços de acabamento menores; rasteiras sem sombra e com menos polígonos
        const w = await page.evaluate(() => {
            const sc = game.scene, trim = sc.meshes.filter((m) => /^world_trim@/.test(m.name));
            const side = trim.map((m) => { const b = m.getBoundingInfo().boundingBox; return Math.max(b.maximumWorld.x - b.minimumWorld.x, b.maximumWorld.z - b.minimumWorld.z); }).sort((a, b) => a - b);
            const cast = new Set(game.gameEngine.shadowGenerator.getShadowMap().renderList);
            const veg = sc.meshes.filter((m) => m.material && m.material.name === 'trees3d'), model = (m) => (m.name.match(/_([a-zA-Z]+)@/) || [])[1];
            const cover = veg.filter((m) => Trees3D.COVER.has(model(m))), trees = veg.filter((m) => /^world_veg/.test(m.name) && !Trees3D.COVER.has(model(m)));
            const peb = veg.find((m) => model(m) === 'pebbles');
            return { trim: trim.length, chunk: Config.world.trimChunk, median: side[side.length >> 1] || 0, cover: cover.length, coverCast: cover.filter((m) => cast.has(m)).length,
                treeCast: trees.filter((m) => cast.has(m)).length, trees: trees.length, peb: peb ? peb.getTotalIndices() / 3 : -1, listed: Trees3D._cover.length };
        });
        c.ok(w.chunk === 64 && w.trim > 450 && w.median <= 80, `acabamentos em pedaços de ${w.chunk} u (${w.trim} malhas, lado mediano ${w.median.toFixed(0)} u)`);
        c.ok(w.cover > 0 && w.coverCast === 0 && w.listed >= w.cover, `vegetação rasteira fora do mapa de sombras (${w.cover} malhas, ${w.coverCast} projetando)`);
        c.ok(w.trees > 0 && w.treeCast > w.trees * 0.5, `as árvores e arbustos da cidade continuam projetando sombra (${w.treeCast} de ${w.trees} malhas; as demais já não projetavam)`);
        c.ok(w.peb > 0 && w.peb <= 200, `cascalho leve (${w.peb} triângulos por punhado; eram 720)`);

        // 2) placa de vídeo: integrado → Medium no automático; o teto de pixels do preset
        const gfx = await page.evaluate(() => {
            const mid = ['ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'ANGLE (AMD, AMD Radeon(TM) Vega 8 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'];
            const card = ['ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'ANGLE (AMD, AMD Radeon RX 6600 XT Direct3D11 vs_5_0 ps_5_0, D3D11)', 'ANGLE (Intel, Intel(R) Arc(TM) A750 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)'];
            const ge = game.gameEngine, e = ge.engine, P = Config.perf, px = () => e.getRenderWidth() * e.getRenderHeight(), p0 = px(), keep = P.maxPixels;
            P.maxPixels = 300000; ge.resize(); const p1 = px();
            P.maxPixels = keep; ge.resize();
            const warp = 'ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11)';
            return { mid: mid.filter((s) => Graphics.MID_GPU.test(s)).length, card: card.filter((s) => Graphics.MID_GPU.test(s) || Graphics.WEAK_GPU.test(s) || Graphics.SOFT_GPU.test(s)).length, soft: Graphics.software, budget: keep,
                warp: Graphics.WEAK_GPU.test(warp) && Graphics.SOFT_GPU.test(warp), help: Graphics.softwareHelp().length, hint: Hints.list.findIndex((h) => h.id === 'softgpu'),
                budgets: ['low', 'medium', 'high', 'hd'].map((k) => Graphics.PRESETS[k].maxPx || 0), p0, p1, p2: px() };
        });
        c.ok(gfx.mid === 4 && gfx.card === 0, `vídeo integrado reconhecido (${gfx.mid}/4), placas dedicadas não (${gfx.card})`);
        c.ok(gfx.warp && gfx.soft && gfx.help >= 3 && gfx.hint === 0, `sem placa de vídeo: o "Microsoft Basic Render Driver" é reconhecido (Low no automático), com ${gfx.help} passos para ligar a placa e a dica em primeiro`);
        c.ok(gfx.budget > 0 && gfx.budgets[0] < gfx.budgets[1] && gfx.budgets[1] < gfx.budgets[2] && gfx.budgets[3] === 0, `teto de pixels por preset (${gfx.budgets.map((b) => (b / 1e6).toFixed(1)).join(' / ')} Mpx)`);
        c.ok(gfx.p1 <= 300000 * 1.04 && gfx.p1 < gfx.p0 && gfx.p2 === gfx.p0, `acima do teto a tela é desenhada menor (${gfx.p0} → ${gfx.p1} px) e volta (${gfx.p2})`);

        // 3) efeitos de tela: em repouso, o shader de sempre; com um impacto, a variante com efeitos; depois volta
        const fx0 = await page.evaluate(() => {
            window._fxSeen = false;
            const o = Lighting.fx.bind(Lighting); Lighting.fx = (on) => { o(on); if (Lighting._fxOn) window._fxSeen = true; };
            return { grade: !!Lighting.grade, on: Lighting._fxOn, ready: !!(Lighting._fxEffect && Lighting._fxEffect.isReady()), last: game.camera.camera._postProcesses.filter(Boolean).map((p) => p.name).pop() };
        });
        c.ok(fx0.grade && !fx0.on && fx0.ready && fx0.last === 'luzCor', 'em repouso roda a gradação sem os efeitos (a variante com efeitos já compilada)');
        await page.evaluate(() => game.camera.shake(0.9));
        await gameWait(page, 2.2, 90000);
        const fx1 = await page.evaluate(() => ({ seen: window._fxSeen, on: Lighting._fxOn, hit: ScreenFx.hit }));
        c.ok(fx1.seen && !fx1.on && fx1.hit === 0, 'o impacto liga a variante com efeitos e ela sai sozinha');
        c.noErrors(errors, 'gradação com e sem efeitos');

        // 4) AutoQuality: por software para nas sombras; com placa de verdade desce até o fim, guarda e retoma um degrau acima
        const aq = await page.evaluate(() => {
            const q = game.autoQuality, S = AutoQuality.STEPS, out = { steps: S.map((s) => s[0]), softNow: !q.gpuSteps };
            Config.perf.fpsCap = 30;
            q.off = false; q.level = 0; q.gpuSteps = false; out.soft = [];
            for (let i = 0; i < 3; i++) { q._down(); out.soft.push(q.off ? 'fim' : S[q.level - 1][0]); }
            out.softStops = out.soft.join() === 'shadow512,noShadow,fim' && Config.perf.autoScale === 1 && (!Smooth.pp || Smooth.pp.samples > 1);
            const e = game.gameEngine.engine, lv0 = e.getHardwareScalingLevel(), F = Object.values(game.gameEngine.world.mats.facades);
            out.pom0 = F.filter((m) => m.useParallaxOcclusion).length; out.msaa0 = Smooth.pp ? Smooth.pp.samples : 0; out.cover0 = Trees3D._cover.filter((m) => m.isVisible).length;
            q.off = false; q.gpuSteps = true; q.level = 0; out.seen = []; out.skip45 = q.skip.has('scale45');
            for (let i = 0; i < 7; i++) { q._down(); out.seen.push(q.level); }
            out.msaa = Smooth.pp ? Smooth.pp.samples : 0; out.pom = F.filter((m) => m.useParallaxOcclusion).length;
            out.scale = Config.perf.autoScale; out.lv = e.getHardwareScalingLevel() / lv0;
            out.coverOn = Trees3D.coverOn; out.cover = Trees3D._cover.filter((m) => m.isVisible).length;
            out.noShadow = !!game.dayNight.forceNoShadows; out.mirror = Water._rate;
            out.saved = (Store.getJSON('autoQuality', null) || {}).level;
            q._down(); out.end = q.off;
            const r = new AutoQuality(game); out.auto = AutoQuality.automated && !r.gpuSteps && !r.soft;
            r.gpuSteps = true; r._resume(); out.resume = r.level;
            // sem placa de vídeo: de saída a 70% e, se preciso, até 45%
            const w = new AutoQuality(game); w.gpuSteps = true; w.soft = true; w.skip.delete('scale45'); w.level = 0; w._remember = () => {};
            w._floor('scale70'); out.floor = S[w.level - 1][0]; out.floorScale = Config.perf.autoScale;
            for (let i = 0; i < 4 && !w.off; i++) w._down();
            out.softEnd = S[w.level - 1][0]; out.softScale = Config.perf.autoScale;
            // quadros de 1 s seguidos: desce; um quadro longo isolado entre quadros bons: não
            const mk = () => { const t = new AutoQuality(game); t.gpuSteps = true; t.off = false; t.cool = 0; t.n = 0; t._down = () => { t.n2 = (t.n2 || 0) + 1; }; return t; };
            const crawl = mk(); for (let i = 0; i < 12; i++) crawl.tick(1.0, false);
            const back = mk(); for (let i = 0; i < 90; i++) back.tick(0.033, false); back.tick(3, false); for (let i = 0; i < 90; i++) back.tick(0.033, false);
            out.crawl = crawl.n2 || 0; out.back = back.n2 || 0;
            q.off = true;
            return out;
        });
        c.ok(aq.softNow && aq.softStops && aq.auto, `nos testes (navegador automatizado): só os degraus de sombra, sem mexer na resolução nem no MSAA (${aq.soft.join(' → ')})`);
        c.ok(aq.steps.length === 8 && aq.skip45 && aq.seen.join() === '1,2,3,4,5,6,7' && aq.end, `com placa de vídeo desce 7 degraus e para (${aq.seen.join(' → ')}; os 45% ficam para quem não tem placa)`);
        c.ok(aq.noShadow && aq.msaa0 > 1 && aq.msaa === 1 && aq.pom0 > 0 && aq.pom === 0, `sem sombras, sem MSAA (${aq.msaa0}× → ${aq.msaa}×) e sem paralaxe nas fachadas (${aq.pom0} → ${aq.pom})`);
        c.ok(Math.abs(aq.scale - 0.58) < 1e-6 && Math.abs(aq.lv - 1 / 0.58) < 0.02, `resolução a ${Math.round(aq.scale * 100)}% (escala do motor ×${aq.lv.toFixed(2)})`);
        c.ok(!aq.coverOn && aq.cover0 > 0 && aq.cover === 0 && aq.mirror >= 3, `sem vegetação rasteira (${aq.cover0} → ${aq.cover} malhas à vista) e o espelho da água a cada ${aq.mirror} quadros`);
        c.ok(aq.saved === 7 && aq.resume === 6, `o degrau fica guardado (${aq.saved}) e a sessão seguinte começa um acima (${aq.resume})`);
        c.ok(aq.floor === 'scale70' && Math.abs(aq.floorScale - 0.7) < 1e-6 && aq.softEnd === 'scale45' && Math.abs(aq.softScale - 0.45) < 1e-6, `sem placa de vídeo: começa em ${aq.floor} (${Math.round(aq.floorScale * 100)}%) e vai até ${aq.softEnd} (${Math.round(aq.softScale * 100)}%)`);
        c.ok(aq.crawl >= 1 && aq.back === 0, `a 1 FPS ele desce (${aq.crawl} degrau(s) em 12 quadros de 1 s); uma volta do segundo plano não conta (${aq.back})`);

        // 5) o jogo segue desenhando nessa configuração mínima, sem erro
        await gameWait(page, 2, 90000);
        const live = await page.evaluate(() => ({ w: game.gameEngine.engine.getRenderWidth(), h: game.gameEngine.engine.getRenderHeight(), hp: game.player.hp }));
        c.ok(live.w > 300 && live.h > 150 && live.hp > 0, `no degrau mais baixo o jogo continua rodando (${live.w}×${live.h})`);
        c.noErrors(errors, 'qualidade adaptativa até o fim');
        await close();
    },
};
