// LUZ DE VERDADE À NOITE (etapa 6 do upgrade visual; render/NightLights.js): por padrão, à noite, o campo de luz dos postes, lojas e
// faróis é desenhado e os materiais do mundo e os personagens o leem; as poças pintadas das lojas saem. `?noite=0`: as de antes.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'noite',
    async run(ctx, c) {
        const look = () => {
            const W = game.gameEngine.world, M = W.mats, P = typeof NightLights !== 'undefined' && NightLights.P;
            const plug = ['road', 'sidewalk', 'grass'].filter((k) => M[k] && M[k].pluginManager && M[k].pluginManager.getPlugin && M[k].pluginManager.getPlugin('NightLight'));
            return {
                on: NightLights.on, tex: !!NightLights.tex, w: P ? +P.w.toFixed(2) : 0, srcs: NightLights._q, plug: plug.length,
                shopPools: W.shopGlow ? W.shopGlow.batches.some((b) => b.mesh.layerMask !== 0) : null,
            };
        };
        const a = await boot(ctx);
        await a.page.evaluate(() => { Config.time.cycleSeconds = 1e12; const p = CityGrid.center(); game.player.teleport(new BABYLON.Vector3(p.x - 60, 0, p.z + 90)); game.camera.snapTo(game.player.position); game.dayNight.hour = 13; game.dayNight.apply(); });
        await gameWait(a.page, 0.5);
        const day = await a.page.evaluate(look);
        c.ok(day.on && day.tex && day.w === 0, `de dia o campo de luz fica parado (força ${day.w})`);
        await a.page.evaluate(() => { game.dayNight.hour = 22; game.dayNight.apply(); });
        await gameWait(a.page, 0.5);
        const night = await a.page.evaluate(look);
        c.ok(night.w > 0.3 && night.srcs > 5, `à noite: ${night.srcs} luzes no campo (força ${night.w})`);
        c.ok(night.plug === 3, 'o chão (rua, calçada, grama) lê o campo de luz');
        c.ok(night.shopPools === false, 'as poças pintadas das lojas saíram');
        c.noErrors(a.errors, 'luz da noite');
        await a.close();
        const b = await boot(ctx, { query: 'noite=0' });
        const o = await b.page.evaluate(look);
        c.ok(!o.on && !o.tex && o.shopPools === true, '?noite=0: as poças pintadas de antes');
        c.noErrors(b.errors, 'noite de antes');
        await b.close();
    },
};
