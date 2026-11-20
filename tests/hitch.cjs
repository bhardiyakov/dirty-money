#!/usr/bin/env node
// ============================================================================
// tests/hitch.cjs — caça ENGASGOS atravessando a cidade: favela → centro → Lagoa → mata, o jogador levado ~1,5 m por quadro de 1/30 s
// (~45 m/s: um carro rápido entrando em bairro novo). Mede cada game._update e anota:
//   • quadros de lógica lentos (> LIMITE ms, padrão 60), com o sistema que mais gastou (Perf.lap);
//   • o que NASCEU no quadro: shaders compilados (fx), texturas, malhas, geometrias e materiais — compilar shader ou subir textura no
//     meio do jogo é o engasgo clássico numa placa de vídeo de verdade.
//   node tests/hitch.cjs                 só a lógica (CPU): o que vale para qualquer máquina
//   node tests/hitch.cjs --render 6      desenha também a cada 6 quadros (conta shaders/texturas que nascem no desenho)
//   HITCH_MS=40 node tests/hitch.cjs     outro limite
// ATENÇÃO: o Chromium daqui desenha por SOFTWARE e a placa "de mentira" é assíncrona. Com --render, a lógica do quadro seguinte pode
// ficar esperando o desenho anterior acabar (bufferSubData espera a GPU) e aparecer como um engasgo de segundos que não é dela; com
// outro Chromium rodando ao mesmo tempo (outros testes), o mesmo. Para achar engasgos de LÓGICA, rode sem --render e sozinho.
// Não é teste de passa/falha.
// ============================================================================
const { serve, boot } = require('./lib.cjs');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? +process.argv[i + 1] : d; };
const R = arg('--render', 0), LIM = +(process.env.HITCH_MS || 60);

(async () => {
    const { srv, url } = await serve(); const ctx = { url };
    const { page, close, errors } = await boot(ctx);
    page.setDefaultTimeout(0);
    const total = await page.evaluate(() => {
        Tutorial.skip(); Config.time.cycleSeconds = 1e12; game.player.invulnerable = true;
        game.gameEngine.engine.stopRenderLoop();
        const eng = game.gameEngine.engine, sc = game.scene;
        window.__cnt = () => ({ fx: Object.keys(eng._compiledEffects || {}).length, tex: eng.getLoadedTexturesCache().length, mesh: sc.meshes.length, geo: sc.geometries.length, mat: sc.materials.length });
        const pts = [['favela', CityGrid.startPos()], ['centro', CityGrid.center()], ['Lagoa', new BABYLON.Vector3(-330, 0, -560)], ['mata', new BABYLON.Vector3(-700, 0, 420)]];
        window.__route = [];
        for (let i = 0; i + 1 < pts.length; i++) {
            const a = pts[i][1], b = pts[i + 1][1], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 1.5);
            for (let k = 0; k < n; k++) window.__route.push({ x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n, leg: `${pts[i][0]} → ${pts[i + 1][0]}` });
        }
        for (let i = 0; i < 20; i++) game._update(1 / 30);                     // (aquece)
        return window.__route.length;
    });
    console.log(`${total} quadros (${(total / 30).toFixed(0)} s de jogo)${R ? `, desenhando a cada ${R}` : ', só a lógica'}…`);
    const ups = [], rens = [], slow = [], born = [];
    for (let base = 0; base < total; base += 30) {
        const chunk = await page.evaluate(([base, R]) => {
            const out = [];
            for (let k = base; k < Math.min(base + 30, window.__route.length); k++) {
                const q = window.__route[k], p = game.player;
                p.root.position.x = q.x; p.root.position.z = q.z; p.velocity.setAll(0);
                const c0 = window.__cnt();
                for (const n of Perf.order) Perf.sec[n].ms = 0;
                Perf.frameStart();
                const t0 = performance.now(); game._update(1 / 30); const t1 = performance.now();
                let rm = -1;
                if (R && k % R === 0) { game.scene.render(); rm = performance.now() - t1; }
                const c1 = window.__cnt(), d = {};
                for (const key of Object.keys(c1)) if (c1[key] !== c0[key]) d[key] = c1[key] - c0[key];
                let worst = '', wm = 0; for (const n of Perf.order) { const s = Perf.sec[n]; if (s.ms > wm) { wm = s.ms; worst = n; } }
                out.push({ k, leg: q.leg, up: t1 - t0, rm, worst, wm, d, x: Math.round(q.x), z: Math.round(q.z) });
            }
            return out;
        }, [base, R]);
        for (const f of chunk) {
            ups.push(f.up); if (f.rm >= 0) rens.push(f.rm);
            if (f.up > LIM) slow.push(f);
            if (f.d.fx > 0 || f.d.tex > 0 || f.d.mesh > 5) born.push(f);
        }
    }
    const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0; };
    console.log(`lógica por quadro: mediana ${q(ups, 0.5).toFixed(1)} ms · p95 ${q(ups, 0.95).toFixed(1)} · p99 ${q(ups, 0.99).toFixed(1)} · máx ${Math.max(...ups).toFixed(0)}${rens.length ? ` | desenho: mediana ${q(rens, 0.5).toFixed(0)} ms, máx ${Math.max(...rens).toFixed(0)}` : ''}`);
    console.log(`\nQuadros de lógica acima de ${LIM} ms: ${slow.length}`);
    for (const f of slow.sort((a, b) => b.up - a.up).slice(0, 20)) console.log(`  ${f.leg} (${f.x}, ${f.z}): ${f.up.toFixed(0)} ms — ${f.worst || '?'} ${f.wm.toFixed(0)} ms ${Object.keys(f.d).length ? JSON.stringify(f.d) : ''}`);
    const fx = born.reduce((a, f) => a + (f.d.fx || 0), 0), tex = born.reduce((a, f) => a + (f.d.tex || 0), 0);
    console.log(`\nNo caminho: ${fx} shader(s) compilado(s), ${tex} textura(s) nova(s)`);
    for (const f of born.slice(0, 20)) console.log(`  ${f.leg} (${f.x}, ${f.z}): ${JSON.stringify(f.d)} — lógica ${f.up.toFixed(0)} ms${f.rm >= 0 ? `, desenho ${f.rm.toFixed(0)} ms` : ''} (${f.worst})`);
    if (errors.length) console.log('\nerros na página:', errors.slice(0, 5));
    await close(); await ctx.browser.close(); srv.close();
})();
