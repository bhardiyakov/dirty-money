// O RESTO EM POLÍGONOS: as vitrines das lojas (render/Shops3D.js — a frente de loja, a sala atrás do vidro, o letreiro de luz; só o
// nome é textura), as superfícies desenhadas no shader (render/ProcSurf.js — o calçadão, o gramado do estádio, o barraco por fora), os
// esconderijos e as casas de máquinas em 3D, a seta de saída e a sombra do avião em polígonos, a porta do carro 3D em 3D, e os atlas 2D
// de carros e de personagens fora da placa de vídeo (todos são 3D). Confere: nenhuma das texturas antigas, os plugins nos materiais e o
// shader pronto, os números das peças, que a vitrine ACENDE à noite e que a porta do carro abre em 3D.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'poligonos_resto',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx, { query: 'gfx=high' });
        page.setDefaultTimeout(0);
        await page.evaluate(() => { Tutorial.skip(); game.player.invulnerable = true; Config.time.cycleSeconds = 1e12; game.dayNight.hour = 11; game.dayNight.apply(); game.weather.set('clear', true, true); game.weather.override = 1e9; });
        await gameWait(page, 2, 200000);
        const a = await page.evaluate(() => {
            const sc = game.scene, M = game.gameEngine.world.mats, names = sc.textures.map((t) => t.name);
            const OLD = /^(shops|shops_e|hd_shops|hd_shops_e|calcadaoTex|stadiumPitchTex|exitArrowTex|machtop|machside|hideAtlas|hsBrick|hsZinc|hsPlank|hd_hsBrick|hd_hsZinc|hd_hsPlank|hd_hsRoof|hd_hsDoor|hd_hsWindow|speedwayCrowd|planeShadowTex)$/;
            const shopM = sc.meshes.filter((m) => /^world_shop(3|glass|text)@/.test(m.name));
            const big = sc.textures.filter((t) => { const s = t.getSize ? t.getSize() : { width: 0, height: 0 }; return s.width * s.height >= 1024 * 1024; }).map((t) => t.name || '(sem nome)');
            const plug = (m, n) => !!(m && m.pluginManager && m.pluginManager.getPlugin(n));
            const hs = ['hsBrick', 'hsZinc', 'hsPlank', 'hsRoofTop', 'hsGlass', 'hsDoor'].map((n) => sc.getMaterialByName(n)).filter(Boolean);
            const text = sc.textures.find((t) => t.name === 'shopText'), ts = text && text.getSize();
            return {
                shops: Shops3D.on && Shops3D.stats ? Shops3D.stats.shops : 0, old: names.filter((n) => OLD.test(n)), big,
                shopMeshes: shopM.length, shopKinds: new Set(shopM.map((m) => m.name.split('@')[0])).size,
                shopReady: shopM.filter((m) => m.isVisible && !m.material.isReady(m)).length,
                glow: plug(M.shop3, 'ShopGlow'), textLights: plug(M.shoptext, 'WindowLights'), textMB: ts ? +(ts.width * ts.height * 2 * 1.33 / 1048576).toFixed(2) : -1,
                calc: plug(M.calcadao, 'ProcSurf') && !M.calcadao.diffuseTexture, pitch: plug(M.stadiumPitch, 'ProcSurf') && !M.stadiumPitch.diffuseTexture,
                house: hs.length === 6 && hs.every((m) => plug(m, 'ProcSurf') && !m.diffuseTexture),
                hideTop: sc.meshes.filter((m) => /^world_hide_top/.test(m.name)).length, machTex: sc.meshes.filter((m) => /^world_mach(top|side)/.test(m.name)).length,
                charAtlas: CharArt.tex ? CharArt.tex.getSize().width : -1, hud: !!CharArt.image('rider', 'park_moto:none', 0, 1),
                carBatch: !!CarArt.cars,
            };
        });
        c.ok(a.shops > 100 && a.shopMeshes > 0 && a.shopKinds === 3 && a.shopReady === 0, `vitrines em polígonos: ${a.shops} lojas em ${a.shopMeshes} malhas (sólido, vidro, letreiro), shader pronto`);
        c.ok(a.glow && a.textLights && a.textMB > 0 && a.textMB < 2, `a luz da noite na frente da loja e no letreiro; o atlas só de nomes tem ${a.textMB} MB`);
        c.ok(a.old.length === 0, `nenhuma textura antiga (vitrines, calçadão, gramado, seta, casas de máquinas, esconderijos, barraco, torcida): ${a.old.join(', ') || 'nenhuma'}`);
        c.ok(a.calc && a.pitch && a.house, `calçadão, gramado e o barraco desenhados no shader, sem textura`);
        c.ok(a.hideTop === 0 && a.machTex === 0, `esconderijos e casas de máquinas em 3D (sem o topo pintado: ${a.hideTop}, sem a chapa pintada: ${a.machTex})`);
        c.ok(a.charAtlas === 1 && a.hud && !a.carBatch, `atlas 2D de personagens e de carros fora da placa (personagens: ${a.charAtlas} px de largura, lote de carros 2D: ${a.carBatch}); a miniatura do HUD sai da CPU`);
        c.ok(!a.big.some((n) => /charArt|carArt|shops/.test(n)), `sem atlas grande de desenho na placa (${a.big.join(', ')})`);

        // a vitrine acende à noite: a câmera de frente para a loja mais perto, com e sem a luz
        const lum = await page.evaluate(() => {
            const P = game.player.position; let best = null, bd = 1e9;
            for (const blk of CityGrid.blocks) for (const l of blk.lots) for (const s of l.shops || []) {
                const m = s.a + 3, x = s.side === 'W' ? l.x0 : s.side === 'E' ? l.x1 : m, z = s.side === 'S' ? l.z0 : s.side === 'N' ? l.z1 : m;
                const d = Math.hypot(x - P.x, z - P.z); if (d < bd) { bd = d; best = { l, s, x, z }; }
            }
            const { l, s, x, z } = best, A = WorldBuilder.lotAnchor(l), gy = A ? A.h : 0, n = s.side === 'S' ? [0, -1] : s.side === 'N' ? [0, 1] : s.side === 'W' ? [-1, 0] : [1, 0];
            game.player.teleport(new BABYLON.Vector3(x + n[0] * 5, 0, z + n[1] * 5));
            game.dayNight.hour = 21.5; game.dayNight.apply();
            const sc = game.scene, cam = new BABYLON.FreeCamera('fcam', new BABYLON.Vector3(x + n[0] * 6, gy + 1.7, z + n[1] * 6), sc);
            cam.setTarget(new BABYLON.Vector3(x, gy + 1.5, z)); cam.minZ = 0.1; const old = sc.activeCamera; sc.activeCamera = cam;
            const eng = game.gameEngine.engine, gl = eng._gl, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4);
            const shot = () => { sc.render(); sc.render(); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); let t = 0; for (let i = 0; i < px.length; i += 16) t += px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11; return t / (px.length / 16); };
            const S = WindowLights.state, keep = Array.from(S), upd = WindowLights.update;
            WindowLights.update = () => {};
            S[0] = 1; const on = shot();
            S[0] = 0; const off = shot();
            WindowLights.update = upd; S.set(keep);
            sc.activeCamera = old; cam.dispose();
            game.dayNight.hour = 11; game.dayNight.apply();
            return { on, off, kind: TileFactory.SHOPS[s.kind].id };
        });
        c.ok(lum.on > lum.off * 1.08, `à noite a vitrine e o letreiro acendem (${lum.kind}: brilho ${lum.off.toFixed(1)} → ${lum.on.toFixed(1)})`);

        // a porta do carro 3D abre em 3D (a folha na cor do carro e o vão com o interior)
        const d = await page.evaluate(() => {
            const P = game.player.position, list = (game.vehicleManager && game.vehicleManager.vehicles) || [];
            let car = null, bd = 1e9;
            for (const v of list) { if (!v.visual || v.isBike || v.wrecked || v.mode !== 'parked') continue; const dd = Math.hypot(v.position.x - P.x, v.position.z - P.z); if (dd < bd) { bd = dd; car = v; } }
            if (!car) return { err: 'sem carro estacionado' };
            window.__dcar = car;
            game.doors.set(car, 1, true);
            return { is3d: CarDoors.is3d(car) };
        });
        await gameWait(page, 1.2, 100000);
        const d2 = await page.evaluate(() => { const S = game.doors._m3; return S ? { leaf: S.leaf.thinInstanceCount, gap: S.gap.thinInstanceCount, batch: !!CarArt.cars } : { leaf: 0, gap: 0 }; });
        c.ok(d.is3d && d2.leaf >= 1 && d2.gap >= 1 && !d2.batch, `a porta do carro 3D abre em polígonos (${d2.leaf} folha, ${d2.gap} vão; sem o atlas 2D: ${!d2.batch})`);
        c.noErrors(errors, 'polígonos');
        await close();
    },
};
