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
            c.noErrors(errors, 'normal');
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
