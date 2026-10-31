// O visual de city builder (render/Diorama.js, diorama.html): a página abre sem erro, com a câmera presa entre 30° e 60°, sol + céu,
// sombra PCF de alta qualidade, PBR fosco de cor sólida, SSAO2 antes do pipeline padrão (ACES + FXAA), névoa EXP e o Havok ligado.
const { playwright } = require('./lib.cjs');

module.exports = {
    name: 'diorama',
    async run(ctx, c) {
        const { chromium } = playwright();
        const browser = ctx.browser || (ctx.browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }));
        const bctx = await browser.newContext({ viewport: { width: 800, height: 450 }, deviceScaleFactor: 1 });
        const page = await bctx.newPage(), errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
        await page.goto(ctx.url + '/diorama.html?lite');
        await page.waitForFunction(() => window.dioramaReady, null, { timeout: 300000 });
        const s = await page.evaluate(() => {
            const cam = D.camera, sg = D.shadows, p = D.pipeline, ip = p.imageProcessing, deg = 180 / Math.PI;
            const pbr = D.scene.materials.filter((m) => m.getClassName() === 'PBRMaterial');
            return {
                beta: [Math.round(cam.lowerBetaLimit * deg), Math.round(cam.upperBetaLimit * deg)], inertia: cam.inertia > 0.5 && cam.panningInertia > 0.5, map: cam.mapPanning,
                hemi: D.hemi.intensity, pcf: sg.usePercentageCloserFiltering && sg.filteringQuality === BABYLON.ShadowGenerator.QUALITY_HIGH, size: sg.mapSize,
                matte: pbr.filter((m) => m.name.startsWith('toy_')).every((m) => m.metallic === 0 && m.roughness >= 0.8 || m.roughness <= 0.4),
                textured: pbr.some((m) => m.albedoTexture), water: !!D.scene.getMaterialByName('toyWater') && D.scene.getMaterialByName('toyWater').roughness <= 0.1,
                ssao: !!D.ssao && D.ssao.totalStrength > 0, first: cam._postProcesses[0] && cam._postProcesses[0].name, fxaa: p.fxaaEnabled,
                aces: ip.toneMappingEnabled && ip.toneMappingType === BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES,
                fog: D.scene.fogMode === BABYLON.Scene.FOGMODE_EXP, phys: !!D.scene.getPhysicsEngine(),
            };
        });
        c.eq(JSON.stringify(s.beta), '[30,60]', 'câmera presa entre 30° e 60° a partir da vertical');
        c.ok(s.inertia && s.map, 'giro, zoom e pan com inércia; pan no plano do chão');
        c.ok(s.hemi >= 0.8 && s.pcf && s.size >= 2048, `céu forte (${s.hemi}) e sombra PCF de alta qualidade (${s.size})`);
        c.ok(s.matte && !s.textured && s.water, 'PBR fosco de cor sólida, sem textura; água lisa');
        c.ok(s.ssao && /SSAO/i.test(s.first || ''), `SSAO2 ligado e antes do pipeline padrão (1º pós: ${s.first})`);
        c.ok(s.fxaa && s.aces && s.fog, 'FXAA, tone mapping ACES e névoa EXP');
        c.ok(s.phys, 'Havok ligado (prédios estáticos, carros dinâmicos)');
        c.ok(!errors.length, `sem erros de JavaScript (${errors.slice(0, 2).join(' | ')})`);
        await bctx.close();
    },
};
