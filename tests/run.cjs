#!/usr/bin/env node
// ============================================================================
// tests/run.cjs — roda os testes do jogo no Chromium (sem placa de vídeo, como no CI).
//   node tests/run.cjs              todos (o teste de longa duração com SOAK_SECONDS, padrão 240 s de jogo por cenário)
//   node tests/run.cjs --quick      versão curta (CI): longa duração de 60 s por cenário
//   node tests/run.cjs smoke doors  só os que têm esses nomes
// Cada arquivo tests/NN_nome.test.cjs exporta { name, run(ctx, check) }. Sai com código 1 se algum falhar.
// ============================================================================
const fs = require('fs'), path = require('path');
const { serve, Check } = require('./lib.cjs');

(async () => {
    const args = process.argv.slice(2), quick = args.includes('--quick'), only = args.filter((a) => !a.startsWith('--'));
    if (quick && !process.env.SOAK_SECONDS) process.env.SOAK_SECONDS = '60';
    const files = fs.readdirSync(__dirname).filter((f) => /^\d+_.+\.test\.cjs$/.test(f)).sort();
    const tests = files.map((f) => require(path.join(__dirname, f))).filter((t) => !only.length || only.some((o) => t.name.includes(o)));
    const { srv, url } = await serve();
    const ctx = { url, quick };
    const results = [];
    for (const t of tests) {
        const c = new Check(t.name), t0 = Date.now();
        process.stdout.write(`▶ ${t.name} … `);
        try { await t.run(ctx, c); } catch (e) { c.fails.push('exceção: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e)); }
        const s = ((Date.now() - t0) / 1000).toFixed(0);
        console.log(c.fails.length ? `✗ (${s}s)` : `✓ (${s}s)`);
        for (const n of c.notes) console.log(`    · ${n}`);
        for (const f of c.fails) console.log(`    ✗ ${f}`);
        results.push(c);
    }
    if (ctx.browser) await ctx.browser.close();
    srv.close();
    const bad = results.filter((r) => r.fails.length);
    console.log(`\n${results.length - bad.length}/${results.length} testes passaram${bad.length ? ' — falharam: ' + bad.map((b) => b.name).join(', ') : ''}`);
    process.exit(bad.length ? 1 : 0);
})();
