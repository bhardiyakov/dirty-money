// PRÉDIOS COM VOLUME (etapa 4 do upgrade visual; art/Facades3D.js): por padrão, as fachadas com o relevo das janelas e a paralaxe
// (o vidro recuado) e os telhados 3D (cornija, caixas-d'água, condensadoras, antenas; caixa-d'água 3D nos barracos). `?predios=0`:
// os prédios de antes.
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'predios',
    async run(ctx, c) {
        const look = () => {
            const F = Object.values(game.gameEngine.world.mats.facades);
            return {
                mode: Facades3D.mode, roofs: Facades3D.roofs, n: F.length,
                bump: F.filter((m) => m.bumpTexture && m.bumpTexture.isReady()).length, pom: F.filter((m) => m.useParallaxOcclusion).length,
                tris: game.scene.meshes.filter((m) => /^world_trim/.test(m.name)).reduce((s, m) => s + (m.getTotalIndices() || 0) / 3, 0),
            };
        };
        const a = await boot(ctx);
        const d = await a.page.evaluate(look);
        c.ok(d.mode === 'recuo' && d.roofs, `padrão: janelas recuadas e telhados 3D (${d.mode}, telhado ${d.roofs})`);
        c.ok(d.n > 0 && d.bump === d.n && d.pom === d.n, `relevo e paralaxe em todas as fachadas (${d.bump}/${d.n})`);
        c.noErrors(a.errors, 'prédios com volume');
        await a.close();
        const b = await boot(ctx, { query: 'predios=0' });
        const o = await b.page.evaluate(look);
        c.ok(!o.mode && !o.roofs && o.bump === 0 && o.pom === 0, '?predios=0: as fachadas de antes');
        c.ok(d.tris > o.tris, `os telhados 3D somam peças (${Math.round(o.tris / 1000)} → ${Math.round(d.tris / 1000)} mil triângulos de acabamento)`);
        c.noErrors(b.errors, 'prédios de antes');
        await b.close();
    },
};
