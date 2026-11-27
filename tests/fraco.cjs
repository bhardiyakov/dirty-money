#!/usr/bin/env node
// ============================================================================
// tests/fraco.cjs — o APARELHO FRACO: custo de CPU de um quadro de 30 FPS (meta: 33 ms) no Low + celular, com a CPU desacelerada.
//   RATE=2 LOWRES=4 N=90 SC=favela,carro,centro,mata node tests/fraco.cjs
// Passo de jogo FIXO (Perf.fixedDt = 1/30): com a GPU emulada o jogo roda a ~3 FPS e, sem isso, todo temporizador dispararia a cada
// quadro (custo inflado). LOWRES=4 desenha 1/16 dos pixels: a GPU emulada (SwiftShader) roda na mesma CPU e as esperas por ela também
// são desaceleradas — assim sobra o custo de CPU que um aparelho com placa de verdade paga (as mesmas malhas e chamadas de desenho).
// Imprime média, mediana e p90 do quadro, o custo por seção (Perf) e por função embrulhada, e os quadros mais lentos.
// Outros: Q (URL, padrão gfx=low&celular), CPUL=1 (escada de processador da qualidade automática aplicada), GFX='{"dist":55}'
// (Ajustes › Gráficos avançados), FAR (distância de visão), LIB (outro checkout, para comparar com o código de antes).
// ============================================================================
const lib = require(process.env.LIB || './lib.cjs');
const Q = process.env.Q || 'gfx=low&celular', RATE = +(process.env.RATE || 1), N = +(process.env.N || 60);
(async () => {
  const { srv, url } = await lib.serve();
  const { page, close, errors } = await lib.boot({ url }, { width: 1000, height: 640, query: Q });
  page.setDefaultTimeout(0);
  const cdp = await page.context().newCDPSession(page);
  if (process.env.FAR) await page.evaluate((v) => { window.__FAR = v; }, +process.env.FAR);
  if (process.env.CPUL) await page.evaluate(() => { window.__CPUL = 1; });
  if (process.env.GFX) await page.evaluate((v) => { window.__GFX = JSON.parse(v); }, process.env.GFX);
  if (process.env.LOWRES) await page.evaluate((v) => { window.__LOWRES = v; }, +process.env.LOWRES);
  if (process.env.CF) await page.evaluate((v) => { window.__CF = v; }, +process.env.CF);
  await page.evaluate(() => {
    Tutorial.skip(); Interiors.autoEnter = () => {}; game.player.invulnerable = true; CrimeExposure._witnessSees = () => false; Config.time.cycleSeconds = 1e12; if (game.autoQuality) game.autoQuality.off = true;
    if (window.__CF !== undefined) game.renderCuller.filter = window.__CF;
    if (window.__FAR) { Config.camera.chase.far = window.__FAR; Config.camera.chase.near = Math.round(window.__FAR * 0.45); }
    if (window.__CPUL && typeof AutoQuality !== 'undefined' && AutoQuality.CPU_STEPS) for (const [id] of AutoQuality.CPU_STEPS) game.autoQuality._cpuApply(id);
    if (window.__GFX) for (const [k, v] of Object.entries(window.__GFX)) GraphicsMenu.set(k, v, game);
    if (window.__LOWRES) { const e = game.gameEngine.engine; e.setHardwareScalingLevel(e.getHardwareScalingLevel() * window.__LOWRES); }
    Perf.fixedDt = 1 / 30; game.gameEngine.engine.getDeltaTime = () => 1000 / 30;
    const B = window.__B = { on: false, frames: [], sec: {}, fn: {} };
    const W = (obj, name, label) => { const f = obj[name]; if (typeof f !== 'function') return; obj[name] = function () { if (!B.on) return f.apply(this, arguments); const t = performance.now(); try { return f.apply(this, arguments); } finally { const d = performance.now() - t; B.fn[label] = (B.fn[label] || 0) + d; const F = B._fnF || (B._fnF = {}); F[label] = +(((F[label] || 0) + d).toFixed(2)); } }; };
    const sc = game.scene;
    W(sc, '_evaluateActiveMeshes', 'evaluate');
    W(sc._renderingManager, 'render', 'draw (rendering manager)');
    W(Char3D, 'tick', 'Char3D.tick');
    W(game.renderCuller, '_candidates', 'candidatas');
    if (typeof Trees3D !== 'undefined') W(Trees3D, '_lodTick', 'Trees3D._lodTick');
    if (typeof GlowBatch !== 'undefined' && GlowBatch.flush) W(GlowBatch, 'flush', 'GlowBatch.flush');
    W(game.uiLoop, 'flush', 'ui flush');
    const fe = Perf.frameEnd.bind(Perf);
    Perf.frameEnd = function () { let snap = null; if (B.on) { snap = {}; for (const k of this.order) { const s = this.sec[k]; B.sec[k] = (B.sec[k] || 0) + s.ms; if (s.ms > 0.3) snap[k] = +s.ms.toFixed(1); } snap.__fn = Object.assign({}, B._fnF || {}); B._fnF = {}; } fe(); if (B.on) { B.frames.push(this.frameMs); (B.snaps || (B.snaps = [])).push([+this.frameMs.toFixed(1), snap]); } };
  });
  await lib.gameWait(page, 2, 200000);
  const out = {};
  for (const sc of (process.env.SC || 'favela,centro,carro,mata').split(',')) {
    await page.evaluate((sc) => {
      const P = sc === 'favela' ? CityGrid.startPos() : sc === 'mata' ? new BABYLON.Vector3(-700, 0, 420) : CityGrid.center();
      game.dayNight.hour = sc === 'noite' ? 21.5 : 15; game.dayNight.apply(); Weather.cur.set(sc === 'noite' ? 'rain' : 'clear', true, true); Weather.cur.override = 1e9;
      if (game.mode === 'car' && game.activeCar && sc !== 'carro') { game.activeCar.setControlled(false); game.mode = 'player'; game.activeCar = null; game.player.setVisible(true); game.input.keys.w = false; }
      game.player.teleport(new BABYLON.Vector3(P.x, 0, P.z)); game.camera.snapTo(game.player.position);
      if (sc === 'carro') {
        const car = game.vehicleManager.vehicles.find((v) => !v.isBike && !v.isBoat && !v.spec.boat && !v.isChopper && v.visual && v.visual.rotates);
        car.teleport(P.x + 3, P.z, 0); car.mode = 'parked'; car.route = null; game.player.setVisible(false); car.setControlled(true); game.activeCar = car; game.mode = 'car'; car.hp = car.maxHp; car.fuel = car.tank; car.engineDead = false; car.hotwire = 0;
        window.__drive = setInterval(() => { game.input.keys.w = true; game.input.keys.d = (performance.now() / 3000 | 0) % 2 === 0; }, 100);
      } else if (window.__drive) { clearInterval(window.__drive); window.__drive = null; }
      const tb = game.gameEngine.world && game.gameEngine.world.terrain; if (tb) tb.prebuild(P);
    }, sc);
    await lib.gameWait(page, 2.5, 200000);
    if (RATE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
    await page.evaluate(() => { const B = window.__B; B.frames = []; B.sec = {}; B.fn = {}; B.snaps = []; B.on = true; });
    await page.waitForFunction((n) => window.__B.frames.length >= n, N, { polling: 500 });
    const r = await page.evaluate(() => {
      const B = window.__B; B.on = false; const n = B.frames.length, f = B.frames.slice().sort((a, b) => a - b), r1 = (v) => +v.toFixed(2);
      return { n, mean: r1(f.reduce((a, b) => a + b, 0) / n), med: r1(f[n >> 1]), p90: r1(f[Math.floor(n * 0.9)]), dc: game.gameEngine.engine._drawCalls.current, act: game.scene.getActiveMeshes().length,
        sec: Object.fromEntries(Object.entries(B.sec).map(([k, v]) => [k, r1(v / n)]).filter(([, v]) => v > 0.1).sort((a, b) => b[1] - a[1])),
        fn: Object.fromEntries(Object.entries(B.fn).map(([k, v]) => [k, r1(v / n)]).sort((a, b) => b[1] - a[1])), slow: (B.snaps || []).slice().sort((a, b) => b[0] - a[0]).slice(0, 6), band: (() => { const S = (B.snaps || []).slice().sort((a, b) => b[0] - a[0]); const avg = {}; const pick = S.slice(2, Math.ceil(S.length * 0.12)); for (const [, sn] of pick) { for (const [k, v] of Object.entries(sn)) { if (k === '__fn') { for (const [f, w] of Object.entries(v)) avg['fn:' + f] = (avg['fn:' + f] || 0) + w / pick.length; } else avg[k] = (avg[k] || 0) + v / pick.length; } } const all = {}; for (const [, sn] of S) { for (const [k, v] of Object.entries(sn)) { if (k === '__fn') { for (const [f, w] of Object.entries(v)) all['fn:' + f] = (all['fn:' + f] || 0) + w / S.length; } else all[k] = (all[k] || 0) + v / S.length; } } return Object.entries(avg).map(([k, v]) => [k, +v.toFixed(2), +((all[k] || 0)).toFixed(2)]).sort((a, b) => (b[1] - b[2]) - (a[1] - a[2])).slice(0, 14); })() };
    });
    if (RATE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    out[sc] = r;
    console.log(sc, JSON.stringify(r));
  }
  console.log('erros:', errors.slice(0, 3).join(' | '));
  await close(); srv.close(); process.exit(0);
})();
