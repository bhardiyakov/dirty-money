#!/usr/bin/env node
// ============================================================================
// tests/run.cjs — roda os testes do jogo no Chromium (sem placa de vídeo, como no CI).
//   node tests/run.cjs              todos (o teste de longa duração com SOAK_SECONDS, padrão 240 s de jogo por cenário)
//   node tests/run.cjs --quick      versão curta (CI): longa duração de 60 s por cenário
//   node tests/run.cjs smoke doors  só os que têm esses nomes
//   node tests/run.cjs --shard=2/8  só a parte 2 de 8 (o CI roda as 8 em paralelo: a suíte inteira não cabe em 60 min num job só).
//                                   As partes são repartidas pelo TEMPO de cada teste (PESO, segundos no CI): o mais lento vai para a
//                                   parte mais vazia, e as partes terminam juntas. Teste novo sem peso conta PESO_PADRAO.
// Cada arquivo tests/NN_nome.test.cjs exporta { name, run(ctx, check) }. Sai com código 1 se algum falhar.
// ============================================================================
const fs = require('fs'), path = require('path');
const { serve, Check } = require('./lib.cjs');

// Tempo de cada teste no CI (s, --quick), para repartir as partes. (Medido no runner do GitHub; os que faltam, pela máquina dos testes.)
const PESO = {
    soak: 1250, low_poly: 1150, personagens3d: 750, doors: 410, telhados: 330, fachadas: 330, chao_luz: 240, poligonos_resto: 220, dano_carros: 150, ceu_clima_voo: 170, poligonos: 300, camera: 250, aggression: 230,
    pelada: 225, corrida: 215, lojas: 200, racha: 140, modo_seguro: 125, sprites_hd: 85, roupa: 80, graphics: 75, chuva: 65,
    fumaca: 61, moto: 55, medicao: 52, aeroporto: 51, assalto: 51, armas: 42, icones: 35, smoke: 34, perseguicao_furtividade: 34,
    bicicleta: 31, flagrante: 31, tutorial: 30, mobile: 28, barraco: 22, systems: 21,
};
const PESO_PADRAO = 120;
// Parte k de n: o mais lento primeiro, sempre na parte com menos tempo somado (empate: a de menor número) — determinístico.
function shard(tests, k, n) {
    const parts = Array.from({ length: n }, () => ({ t: 0, names: new Set() }));
    const order = tests.slice().sort((a, b) => ((PESO[b.name] || PESO_PADRAO) - (PESO[a.name] || PESO_PADRAO)) || a.name.localeCompare(b.name));
    for (const t of order) {
        let best = parts[0];
        for (const p of parts) if (p.t < best.t) best = p;
        best.t += PESO[t.name] || PESO_PADRAO; best.names.add(t.name);
    }
    const mine = parts[k - 1];
    return { list: tests.filter((t) => mine.names.has(t.name)), secs: mine.t };
}

(async () => {
    const args = process.argv.slice(2), quick = args.includes('--quick'), only = args.filter((a) => !a.startsWith('--'));
    if (quick && !process.env.SOAK_SECONDS) process.env.SOAK_SECONDS = '60';
    const files = fs.readdirSync(__dirname).filter((f) => /^\d+_.+\.test\.cjs$/.test(f)).sort();
    let tests = files.map((f) => require(path.join(__dirname, f))).filter((t) => !only.length || only.some((o) => t.name.includes(o)));
    const sh = (args.find((a) => a.startsWith('--shard=')) || '').match(/^--shard=(\d+)\/(\d+)$/);
    if (sh) {
        const k = +sh[1], n = +sh[2], r = shard(tests, k, n);
        tests = r.list;
        console.log(`parte ${k}/${n}: ${tests.map((t) => t.name).join(', ')} (~${Math.round(r.secs / 60)} min estimados)`);
    }
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
