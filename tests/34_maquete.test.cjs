// O MAPA do jogo no visual de maquete (render/Diorama.js no preset High): os materiais do mundo saem da fábrica do Diorama — PBR fosco de cor
// sólida, as fachadas com as janelas como vidro, as faixas de pedestre e as lojas com a arte —, o terreno com a paleta por bioma, as árvores
// 3D facetadas, sombra PCF de qualidade alta, e a câmera do jogo continua a de sempre (presa ao personagem).
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'maquete',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx, { query: 'gfx=high' });
        await gameWait(page, 1);
        const s = await page.evaluate(() => {
            const M = game.gameEngine.world.mats, plug = (m, n) => !!(m && m.pluginManager && m.pluginManager.getPlugin(n));
            const fac = Object.values(M.facades)[0], roof = Object.values(M.roofs)[0];
            const tree = game.scene.meshes.find((m) => /_(oak|jungle|palm|juca)@/.test(m.name) && m.getTotalVertices());
            let flat = false;
            if (tree) { const n = tree.getIndices(); flat = n.every((v, i) => v === i); }                  // (cada triângulo com os próprios vértices)
            const terr = game.scene.getMaterialByName('terrain');
            return {
                on: Diorama.on, style: Config.render.style, cam: game.camera.camera.getClassName(),
                road: M.road.getClassName() === 'PBRMaterial' && M.road.metallic === 0 && M.road.roughness >= 0.8 && M.road.directIntensity === Diorama.GAME.direct && plug(M.road, 'DioramaSolid') && !M.road.bumpTexture,
                facade: plug(fac, 'DioramaSolid') && fac.pluginManager.getPlugin('DioramaSolid').win !== null && plug(fac, 'WindowLights'),
                roof: plug(roof, 'DioramaSolid'),
                zebra: !plug(M.zebra, 'DioramaSolid') && !!M.zebra.albedoTexture, shop: !plug(M.shop, 'DioramaSolid'),
                water: M.water.roughness <= 0.1 && plug(M.water, 'DioramaSolid'),
                terrain: !!terr && terr.getClassName() === 'PBRMaterial' && plug(terr, 'TerrainSplat') && !plug(terr, 'DioramaSolid'),
                tree: !!tree, flat,
                pcf: game.gameEngine.shadowGenerator.usePercentageCloserFiltering && game.gameEngine.shadowGenerator.filteringQuality === BABYLON.ShadowGenerator.QUALITY_HIGH,
            };
        });
        c.ok(s.on && s.style === 'diorama', 'o preset High abre na maquete (Config.render.style = diorama)');
        c.eq(s.cam, 'FreeCamera', 'a câmera do jogo continua a CompassCamera (FreeCamera presa ao personagem)');
        c.ok(s.road && s.roof && s.water, 'ruas, telhados e água: PBR fosco de cor sólida, sem mapa de normais (Diorama.surface)');
        c.ok(s.facade, 'fachadas: cor sólida com as janelas como vidro, e as luzes da noite');
        c.ok(s.zebra && s.shop, 'faixas de pedestre e lojas mantêm a arte (informação)');
        c.ok(s.terrain, 'terreno: a paleta por bioma no TerrainSplat');
        c.ok(s.tree && s.flat, 'árvores 3D low-poly facetadas');
        c.ok(s.pcf, 'sombra PCF de qualidade alta');
        c.noErrors(errors, 'maquete');
        await close();
    },
};
