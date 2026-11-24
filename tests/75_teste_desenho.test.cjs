// TESTE DE DESENHO NA ABERTURA (core/GpuCheck.js): um plano de material padrão, com a luz, a névoa e os plugins do jogo, desenhado
// numa cena descartável antes do mundo. Num notebook (Iris Xe, Direct3D 11) esses materiais não apareciam — só o céu e o jogador.
//   • aqui ele desenha: modo normal, sem custo de modo compatível;
//   • `?desenho=simular` finge que o 1º desenho falhou: o jogo passa à 1ª saída (sem compilação paralela, se a placa tem; senão sem
//     uniform buffers) e o mundo aparece nela;
//   • `?ubo=0` força esse modo direto; o diagnóstico conta o resultado.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'teste_desenho',
    async run(ctx, c) {
        // quanto da tela tem desenho de verdade (não é a cor de limpeza): pontos de uma grade, fora do miolo (o jogador)
        const look = (page) => page.evaluate(async () => {
            await new Promise((r) => { const o = game.scene.onAfterRenderObservable.add(() => { game.scene.onAfterRenderObservable.remove(o); r(); }); });
            const eng = game.gameEngine.engine, w = eng.getRenderWidth(), h = eng.getRenderHeight();
            game.scene.render();
            const d = await eng.readPixels(0, 0, w, h), cc = game.scene.clearColor.asArray().map((v) => v * 255);
            let n = 0, drawn = 0;
            for (let j = 1; j < 10; j++) for (let i = 1; i < 10; i++) {
                if (i >= 4 && i <= 6 && j >= 4 && j <= 6) continue;
                const k = ((Math.floor(h * j / 10) * w) + Math.floor(w * i / 10)) * 4;
                n++; if (Math.abs(d[k] - cc[0]) > 8 || Math.abs(d[k + 1] - cc[1]) > 8 || Math.abs(d[k + 2] - cc[2]) > 8) drawn++;
            }
            return { n, drawn, ubo: eng.supportsUniformBuffers, par: !!eng.getCaps().parallelShaderCompile, had: GpuCheck.hadParallel, r: GpuCheck.result, label: GpuCheck.label };
        });

        // 1) normal: o teste desenha e o jogo segue com uniform buffers
        {
            const { page, errors, close } = await boot(ctx, { width: 900, height: 500, query: 'gfx=low' });
            page.setDefaultTimeout(0);
            await page.evaluate(() => { Tutorial.skip(); Config.time.cycleSeconds = 1e12; game.dayNight.hour = 13; game.dayNight.apply(); if (game.autoQuality) game.autoQuality.off = true; });
            await gameWait(page, 1, 120000);
            const a = await look(page);
            c.ok(a.r && a.r.mode === 'ok' && a.r.tries.length === 1 && a.r.tries[0][1] === 'vermelho' && a.ubo && a.par === a.had, `teste de desenho: ${a.label} em ${a.r && a.r.ms} ms (com a compilação paralela: ${a.had ? 'sim' : 'a placa não tem'}), uniform buffers ligados`);
            c.ok(a.drawn >= a.n * 0.8, `a cidade aparece (${a.drawn}/${a.n} pontos com desenho)`);
            // a placa REINICIOU o jogo (contexto perdido): anotado entre aberturas; a próxima abertura desta placa compila sem
            // paralelismo; o diagnóstico mostra; e "WebGL not supported" na carga abre a tela que explica o que fazer
            const r = await page.evaluate(() => {
                const probe = Diag.probeGL();
                Store.remove('gpuLost');
                game.gameEngine.canvas.dispatchEvent(new Event('webglcontextlost'));
                const L = Store.getJSON('gpuLost', []), shown = !!document.getElementById('ctxLost');
                const ov = document.getElementById('ctxLost'); if (ov) ov.remove();
                const caps = { parallelShaderCompile: {} }, fake = { getCaps: () => caps, _gl: null, disableUniformBuffers: false };
                const keep = GpuCheck.result; const res = GpuCheck.run(fake); GpuCheck.result = keep;
                const rep = Diag.report(game);
                Diag.fatal(new Error('WebGL not supported'));
                const box = document.getElementById('dmDiag'), title = box ? box.textContent : ''; if (box) box.remove();
                Store.remove('gpuLost');
                return { probe, n: L.length, gpu: L[0] && L[0].gpu === SafeMode._gpu(), shown, mode: res.mode, why: res.tries.map((t) => t[0]).join(), par: caps.parallelShaderCompile, rep: /a placa reiniciou o jogo: 1×/.test(rep), title: /não liberou a placa de vídeo/.test(title) && /chrome:\/\/gpu/.test(title) };
            });
            c.ok(/WebGL 2: sim/.test(r.probe), `o diagnóstico testa o WebGL do navegador (${r.probe})`);
            c.ok(r.n === 1 && r.gpu && r.shown && r.rep, 'a placa reiniciou o jogo: anotado (com a placa), aviso na tela e no diagnóstico');
            c.ok(r.mode === 'forçado' && r.par === undefined && /reiniciou o jogo 1×/.test(r.why), `na próxima abertura desta placa: ${r.why}`);
            c.ok(r.title, '"WebGL not supported" na carga: a tela explica (fechar o navegador, aceleração gráfica, chrome://gpu, outro navegador)');
            // placa Intel no Direct3D 11 (o notebook Iris Xe): já abre sem compilação paralela; as outras, não
            const np = await page.evaluate(() => ({
                iris: GpuCheck.noParallelFor('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)'),
                uhd: GpuCheck.noParallelFor('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)'),
                nv: GpuCheck.noParallelFor('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)'),
                mac: GpuCheck.noParallelFor('ANGLE (Intel Inc., Intel(R) Iris(TM) Plus Graphics, OpenGL 4.1)'),
                sw: GpuCheck.noParallelFor(SafeMode._gpu()),
            }));
            c.ok(np.iris && np.uhd && !np.nv && !np.mac && !np.sw, 'Intel no Direct3D 11 (Iris Xe, UHD) abre sem compilação paralela; NVIDIA, Mac e o navegador dos testes não');
            c.noErrors(errors.filter((e) => !/PLACA|WebGL not supported|falha na carga/.test(e)), 'normal');
            await close();
        }

        // 2) o 1º desenho "falha": modo sem uniform buffers, e o mundo aparece nele (dentro do esconderijo também)
        {
            const { page, errors, close } = await boot(ctx, { width: 900, height: 500, query: 'gfx=low&desenho=simular', outside: false });
            page.setDefaultTimeout(0);
            await page.evaluate(() => { Tutorial.skip(); Config.time.cycleSeconds = 1e12; game.dayNight.hour = 13; game.dayNight.apply(); if (game.autoQuality) game.autoQuality.off = true; });
            await gameWait(page, 1, 120000);
            const inside = await look(page);
            await page.evaluate(() => { if (Interiors.active) Interiors.leave(game); });
            await page.waitForFunction(() => !Interiors.active && !Interiors.busy, null, { timeout: 120000 });
            await gameWait(page, 1, 120000);
            const out = await look(page);
            const t = inside.r ? inside.r.tries.map((x) => x.join(': ')).join(' · ') : '';
            // (com a compilação paralela na placa, a 1ª saída é sem ela — o notebook Iris Xe: o Firefox, sem ela, desenhava; o Chrome, não)
            const want = inside.had ? 'sem compilação paralela' : 'sem UBO';
            const applied = inside.had ? !inside.par && inside.ubo : !inside.ubo;
            c.ok(inside.r && inside.r.mode === want && applied && inside.r.tries[1][1] === 'vermelho', `falha simulada: ${t} → modo «${want}»`);
            c.ok(inside.drawn >= inside.n * 0.8 && out.drawn >= out.n * 0.8, `nesse modo o esconderijo (${inside.drawn}/${inside.n}) e a rua (${out.drawn}/${out.n}) aparecem`);
            const dg = await page.evaluate(() => Diag.report(game));
            c.ok(dg.includes('teste de desenho: modo compatível «' + want + '»'), 'o diagnóstico conta o modo compatível');
            c.noErrors(errors, 'sem UBO');
            await close();
        }
    },
};
