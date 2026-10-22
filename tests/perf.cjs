#!/usr/bin/env node
// ============================================================================
// tests/perf.cjs — mede o custo por sistema (Perf.lap) nos cenários mais pesados, com "Vida da cidade" alta e baixa.
//   node tests/perf.cjs            (PERF_SECONDS = segundos de jogo por cenário, padrão 20)
// Não é teste de passa/falha: imprime a tabela (ms de CPU por quadro, média) para comparar antes/depois de uma mudança.
// O Chromium daqui renderiza por software, então o "render" é muito mais caro que num celular com GPU; os sistemas de jogo
// (JavaScript) dão uma boa ideia relativa.
// ============================================================================
const { serve, boot, gameWait } = require('./lib.cjs');

const SCENES = {
    'baile + tiroteio na boca': async (page) => page.evaluate(() => {
        game.dayNight.hour = 22.5; const h = SafeHouse.spawnWorld(); game.player.teleport(new BABYLON.Vector3(h.x + 6, 0, h.z)); game.camera.snapTo(h);
        Economy.day = 6; Phone.rival.l = 1; RivalArc._maybeStart(game);
        const b = RivalArc.bocas[0]; if (b) { b.x = h.x + 18; b.z = h.z; b.G = null; RivalArc.phase = 2; RivalArc.provoked = 999; }
        game.player.hp = 1e6;
    }),
    'bloco de carnaval no centro': async (page) => page.evaluate(() => {
        game.empire.season.idx = 1; game.empire.season.day = 0; Economy.day = 30; game.dayNight.hour = 16;
        Interiors.index(); const d = Interiors._doors.find((q) => q.style === 'mart' && game.empire.districtAt(q.x, q.z) === 'centro') || Interiors._doors[0];
        game.player.teleport(new BABYLON.Vector3(d.x, 0, d.z)); game.camera.snapTo(d);
    }),
    'bar lotado em dia de jogo': async (page) => {
        await page.evaluate(() => { Economy.day = 13; game.dayNight.hour = 16.5; Interiors.index(); const b = Interiors._doors.find((s) => s.style === 'bar'); game.player.teleport(new BABYLON.Vector3(b.x, 0, b.z)); Interiors.enter(game, b); });
        await page.waitForFunction(() => Interiors.active && !Interiors.busy, null, { timeout: 60000 });
    },
    'festa junina no morro': async (page) => page.evaluate(() => {
        if (Interiors.active) Interiors._doLeave(game);
        Economy.day = 9; game.dayNight.hour = 20; const h = SafeHouse.spawnWorld(); game.player.teleport(new BABYLON.Vector3(h.x + 6, 0, h.z)); game.camera.snapTo(h);
    }),
};

(async () => {
    const secs = +(process.env.PERF_SECONDS || 20);
    const { srv, url } = await serve();
    const ctx = { url };
    const rows = [];
    for (const life of ['alta', 'baixa']) {
        const { page, close } = await boot(ctx);
        await page.evaluate((life) => { game.menu.settings.life = life; game.menu.settings.hints = false; Tutorial.done = true; }, life);
        for (const [name, setup] of Object.entries(SCENES)) {
            await setup(page);
            await gameWait(page, 4);
            await page.evaluate(() => { for (const s of Object.values(Perf.sec)) s.avg = 0; Perf.frameAvg = 0; window.__pf = { n: 0, sum: {} }; clearInterval(window.__pfi);
                window.__pfi = setInterval(() => { const P = window.__pf; P.n++; for (const [k, s] of Object.entries(Perf.sec)) P.sum[k] = (P.sum[k] || 0) + s.avg; P.sum.__frame = (P.sum.__frame || 0) + Perf.frameAvg; }, 250); });
            await gameWait(page, secs);
            const r = await page.evaluate(() => { clearInterval(window.__pfi); const P = window.__pf, out = {}; for (const [k, v] of Object.entries(P.sum)) out[k] = v / Math.max(1, P.n); const extra = { npcs: game.npcManager.npcs.length, crew: RivalArc.members.length, fest: Calendar.fest ? Calendar.fest.kind + ':' + Calendar.fest.actors.length : '-', shop: typeof ShopLife !== 'undefined' && ShopLife.active ? ShopLife.agents.length : 0, meshes: game.scene.meshes.length, mats: game.scene.materials.length }; return { out, extra }; });
            rows.push({ life, name, ...r });
        }
        await close();
    }
    srv.close(); await ctx.browser.close();
    for (const r of rows) {
        const top = Object.entries(r.out).filter(([k]) => k !== '__frame' && !/render|física|bake/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ');
        console.log(`[${r.life}] ${r.name}: quadro ${r.out.__frame.toFixed(1)} ms | ${top} | ${JSON.stringify(r.extra)}`);
    }
})();
