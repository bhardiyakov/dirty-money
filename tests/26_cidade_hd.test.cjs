// A cidade em alta definição (art/CityHD*.js) e as janelas acesas à noite (render/WindowLights.js):
//   • pisos, telhados, fachadas e lojas saem do quadro HD (Q vezes a pixel art), sem erro e em tempo razoável;
//   • os ladrilhos repetem sem emenda (a borda do ladrilho não destoa do miolo);
//   • cada janela de fachada cabe numa célula da grade (o sorteio da luz é por célula);
//   • à noite as janelas ACENDEM de verdade (o quadro fica mais claro com a luz ligada — com os materiais do mundo congelados o
//     emissivo antigo nunca acendia), de dia ficam apagadas, e a fração acesa segue a hora (madrugada < começo da noite);
//   • Config.art.cityHD = false volta às texturas de pixel art.
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'cidade_hd',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        const r = await page.evaluate(() => {
            const out = { errs: [] }, W = game.gameEngine.world, M = W.mats;
            out.on = CityHD.on; out.Q = CityHD.Q; out.ms = Math.round(CityHD.lastMs);
            const size = (t) => { const s = t.getSize(); return s.width + '×' + s.height; };
            out.road = size(M.road.diffuseTexture); out.roof = size(M.roofs.zinc0.diffuseTexture); out.facade = size(M.facades.brick0.diffuseTexture);
            out.cls = M.facades.brick0.diffuseTexture.getClassName();
            out.plugins = Object.keys(M.facades).filter((k) => !M.facades[k].pluginManager || !M.facades[k].pluginManager.getPlugin('WindowLights'));
            out.shopPlugin = !!(M.shop.pluginManager && M.shop.pluginManager.getPlugin('WindowLights'));
            out.machine = !!M.machtop;
            // costura: a diferença entre a última e a primeira coluna (e linha) do ladrilho, contra a diferença entre vizinhas do miolo
            const seam = (t, vert = true) => {
                const g = t.cv.getContext('2d'), Wd = t.cv.width, Hd = t.cv.height, d = g.getImageData(0, 0, Wd, Hd).data;
                const px = (x, y) => { const i = (y * Wd + x) * 4; return d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; };
                let edge = 0, mid = 0;
                for (let y = 0; y < Hd; y++) { edge += Math.abs(px(Wd - 1, y) - px(0, y)); for (const x of [Wd >> 2, Wd >> 1, (3 * Wd) >> 2]) mid += Math.abs(px(x, y) - px(x + 1, y)) / 3; }
                if (vert) for (let x = 0; x < Wd; x++) { edge += Math.abs(px(x, Hd - 1) - px(x, 0)); for (const y of [Hd >> 2, Hd >> 1, (3 * Hd) >> 2]) mid += Math.abs(px(x, y) - px(x, y + 1)) / 3; }
                const n = Hd + (vert ? Wd : 0);
                return { edge: edge / n, mid: mid / n };
            };
            out.seams = [];
            for (const [name, ...a] of [['asphalt', 11], ['grass', 51], ['sand', 61], ['earth', 181], ['dirt', 101], ['rock', 111], ['concrete', 71], ['roof', 'tar0'], ['roof', 'zinc0'], ['roof', 'tile0'], ['roof', 'tarp1'], ['roof', 'slab0'], ['machside', 2]]) {
                try { const s = seam(CityHD.paint(name, ...a), name !== 'machside'); if (s.edge > s.mid * 2.5 + 6) out.seams.push(`${name} ${a.join()}: borda ${s.edge.toFixed(1)} × miolo ${s.mid.toFixed(1)}`); }
                catch (e) { out.errs.push(name + ': ' + e.message); }
            }
            CityHD.release();
            // janelas na grade: cada janela sorteada pela célula; nenhuma janela de pixel acesa pode atravessar a divisa de duas células
            out.cells = [];
            for (const key of Object.keys(TileFactory.facadeStyles)) {
                try {
                    const st = TileFactory.facadeStyles[key], G = CityHD.GRID[st.kind], d = new CityTile(120, 120, 1, 7), e = new CityTile(120, 120, 1, 7);
                    d.p_facade(key, e);
                    const D = e.g.getImageData(0, 0, 120, 120).data, bright = (x, y) => { const i = (y * 120 + x) * 4; return D[i] + D[i + 1] + D[i + 2] > 240; };
                    let cross = 0;
                    for (let k = 1; k < G[0]; k++) { const x = Math.round(k * 120 / G[0]); for (let y = 0; y < 120; y++) if (bright(x - 1, y) && bright(x, y)) cross++; }
                    for (let k = 1; k < G[1]; k++) { const y = Math.round(k * 120 / G[1]); for (let x = 0; x < 120; x++) if (bright(x, y - 1) && bright(x, y)) cross++; }
                    if (cross) out.cells.push(`${key}: ${cross} px de janela acesa na divisa das células`);
                } catch (e) { out.errs.push(key + ': ' + e.message); }
            }
            // a fração acesa segue a hora
            WindowLights.update(1, 21); const f21 = WindowLights.state[1];
            WindowLights.update(1, 3.5); const f3 = WindowLights.state[1], o3 = WindowLights.state[3];
            WindowLights.update(1, 18); const o18 = WindowLights.state[3];
            out.frac = { f21, f3, o3, o18 };
            game.dayNight.apply();
            return out;
        });
        c.ok(r.on, 'cidade em alta definição ligada');
        c.ok(!r.errs.length, `os pintores da cidade rodam sem erro (${r.errs.slice(0, 3).join(' | ')})`);
        c.ok(r.Q >= 2, `quadro HD ${r.Q}× a pixel art`);
        c.eq(r.road, `${160 * r.Q}×${200 * r.Q}`, 'textura da rua em alta');
        c.eq(r.roof, `${160 * r.Q}×${160 * r.Q}`, 'textura do telhado em alta');
        c.eq(r.facade, `${120 * r.Q}×${120 * r.Q}`, 'textura da fachada em alta');
        c.ok(r.ms < 6000, `texturas da cidade pintadas em ${r.ms} ms`);
        c.note(`cidade HD: ${r.ms} ms (Q = ${r.Q}), fachada ${r.facade} (${r.cls})`);
        c.ok(!r.plugins.length && r.shopPlugin, `luz das janelas em todas as fachadas e nas lojas (${r.plugins.join(', ')})`);
        c.ok(r.machine, 'casas de máquinas do telhado com textura HD');
        c.ok(!r.seams.length, `ladrilhos sem emenda (${r.seams.join(' | ')})`);
        c.ok(!r.cells.length, `cada janela numa célula da grade (${r.cells.slice(0, 3).join(' | ')})`);
        c.ok(r.frac.f3 < r.frac.f21 && r.frac.o3 < r.frac.o18, `fração acesa pela hora: casas 21h ${r.frac.f21.toFixed(2)} > 3h30 ${r.frac.f3.toFixed(2)}, escritórios 18h ${r.frac.o18.toFixed(2)} > 3h30 ${r.frac.o3.toFixed(2)}`);

        // no jogo: na favela à noite, o quadro com as janelas acesas é bem mais claro que com elas apagadas; de dia, apagadas
        const lum = await page.evaluate(async () => {
            if (Interiors.active) Interiors.leave(game);
            if (Weather.cur) Weather.cur.set('clear', true, true);
            game.player.teleport(new BABYLON.Vector3(-449, 0, 577));
            game.dayNight.hour = 21; game.dayNight.apply();
            await new Promise((res) => setTimeout(res, 2500));
            game.dayNight.hour = 21; game.dayNight.apply();
            const eng = game.gameEngine.engine, w = eng.getRenderWidth(), h = eng.getRenderHeight();
            const L = async () => { game.scene.render(); const d = await eng.readPixels(0, 0, w, h); let s = 0, n = 0; for (let i = 0; i < d.length; i += 16) { s += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; n++; } return s / n; };
            const on = await L(), keep = WindowLights.state[0];
            WindowLights.state[0] = 0; const off = await L(); WindowLights.state[0] = keep;
            game.dayNight.hour = 13; game.dayNight.apply();
            return { on, off, day: WindowLights.state[0] };
        });
        c.ok(lum.on > lum.off * 1.06 + 0.5, `janelas acesas à noite: quadro ${lum.on.toFixed(1)} com a luz, ${lum.off.toFixed(1)} sem`);
        c.eq(lum.day, 0, 'de dia as janelas ficam apagadas');

        // pixel art de volta com Config.art.cityHD = false
        const px = await page.evaluate(() => {
            Config.art.cityHD = false;
            try {
                const T = TileFactory.create(game.scene), road = T.road.getSize().width, grid = T.facades.brick0.grid.join(), cls = T.facades.brick0.diffuse.getClassName();
                const all = [];
                const walk = (o) => { for (const k of Object.keys(o)) { const v = o[k]; if (v instanceof BABYLON.BaseTexture) all.push(v); else if (Array.isArray(v) || (v && typeof v === 'object' && !(v instanceof Uint8Array))) walk(v); } };
                walk(T); for (const t of all) t.dispose();
                return { road, grid, cls, machine: T.machine };
            } finally { Config.art.cityHD = true; }
        });
        c.ok(px.road === 160 && px.grid === '0,0' && px.cls !== 'DynamicTexture' && px.machine === null, `Config.art.cityHD = false volta à pixel art (rua ${px.road} px, ${px.cls})`);
        c.noErrors(errors, 'cidade HD');
        await close();
    },
};
