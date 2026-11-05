// ÁRVORES 3D (etapa 5 do upgrade visual; render/Trees3D.js): por padrão, em todos os presets, as árvores e palmeiras são malhas 3D
// com thin instances (uma malha por espécie e célula), no material do jogo com vento e folhagem no shader. `?arvores=0`: as desenhadas.
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'arvores',
    async run(ctx, c) {
        const look = () => {
            const T = game.scene.meshes.filter((m) => m.material && m.material.name === 'trees3d');
            return { on: Trees3D.on, meshes: T.length, inst: T.reduce((a, m) => a + (m.thinInstanceCount || 0), 0), ready: T.filter((m) => m.material.isReady(m)).length };
        };
        const a = await boot(ctx);
        await a.page.evaluate(() => { const p = CityGrid.center(); game.player.teleport(new BABYLON.Vector3(p.x + 30, 0, p.z + 26)); game.camera.snapTo(game.player.position); });
        await a.page.waitForTimeout(3000);
        const d = await a.page.evaluate(look);
        c.ok(d.on && d.meshes > 0 && d.inst > d.meshes, `padrão: árvores 3D (${d.inst} plantas em ${d.meshes} malhas)`);
        c.noErrors(a.errors, 'árvores 3D');
        await a.close();
        const b = await boot(ctx, { query: 'arvores=0' });
        const o = await b.page.evaluate(look);
        c.ok(!o.on && o.meshes === 0, '?arvores=0: as árvores desenhadas de antes');
        c.noErrors(b.errors, 'árvores desenhadas');
        await b.close();
    },
};
