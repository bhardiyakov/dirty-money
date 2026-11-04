#!/usr/bin/env node
// ============================================================================
// tests/bench.cjs — o benchmark de rota fixa do render (tools/Bench.js) nos presets Low e High, no Chromium dos testes.
//   node tests/bench.cjs                          roda e imprime as tabelas
//   node tests/bench.cjs --out base.json          ...e salva o resultado
//   node tests/bench.cjs --compare base.json      ...e mostra a diferença, cena a cena, contra um resultado salvo
//   BENCH_PRESETS=low,high,hd                     escolhe os presets (padrão: low,high)
//   BENCH_QUERY='cam=ortho'                         mais parâmetros na URL (ex.: comparar com a câmera ortográfica)
// Não é teste de passa/falha. Aqui a renderização é POR SOFTWARE (sem placa de vídeo): os números servem para comparar uma etapa
// com a anterior nesta mesma máquina, não para dizer quanto o jogo roda num computador de verdade — para isso, `?bench` no navegador.
// ============================================================================
const fs = require('fs');
const { serve, boot } = require('./lib.cjs');

(async () => {
    const args = process.argv.slice(2), arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
    const presets = (process.env.BENCH_PRESETS || 'low,high').split(',');
    const { srv, url } = await serve();
    const ctx = { url }, out = {};
    for (const p of presets) {
        const { page, close } = await boot(ctx, { query: `gfx=${p}&full${process.env.BENCH_QUERY ? '&' + process.env.BENCH_QUERY : ''}` });
        page.setDefaultTimeout(0);
        // (por software cada quadro leva muito mais: mede por número de quadros, não por segundos)
        out[p] = await page.evaluate(() => Bench.run(game, { warmS: 1, warmFrames: 6, measureS: 2, measureFrames: 16 }));
        console.log(`\n== ${p} ==\n` + await page.evaluate((R) => Bench.table(R), out[p]));
        await close();
    }
    if (arg('--out')) { fs.writeFileSync(arg('--out'), JSON.stringify(out, null, 2)); console.log(`\nsalvo em ${arg('--out')}`); }
    if (arg('--compare')) {
        const base = JSON.parse(fs.readFileSync(arg('--compare'), 'utf8'));
        console.log('\n== diferença contra ' + arg('--compare') + ' (ms med e desenhos; + = pior) ==');
        for (const p of presets) {
            if (!base[p]) continue;
            for (const s of out[p].scenes) {
                const b = base[p].scenes.find((x) => x.id === s.id);
                if (!b) continue;
                const pct = (a, z) => (z ? `${a >= z ? '+' : ''}${((a / z - 1) * 100).toFixed(0)}%` : '—');
                console.log(`[${p}] ${s.name.padEnd(26)} ms med ${String(b.msMedian).padStart(7)} → ${String(s.msMedian).padStart(7)} (${pct(s.msMedian, b.msMedian)})  desenhos ${b.drawCalls} → ${s.drawCalls} (${pct(s.drawCalls, b.drawCalls)})  tri ${b.tris} → ${s.tris}`);
            }
        }
    }
    if (ctx.browser) await ctx.browser.close();
    srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
