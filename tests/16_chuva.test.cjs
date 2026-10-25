// Chuva na cena 3D (render/RainFx.js): os riscos são geometria da cena (passam pelo MSAA do gráfico suave), os pingos batendo no
// chão só aparecem na chuva forte e na tempestade, e nada disso aparece dentro das lojas.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'chuva',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx, { query: 'gfx=high' });
        await gameWait(page, 1);
        const state = async (s) => {
            await page.evaluate((s) => Weather.cur.set(s, true, true), s);
            await gameWait(page, 0.5);
            return page.evaluate(() => {
                const fx = Weather.cur.fx, pp = Smooth.pp, cam = game.camera.camera;
                return {
                    drops: !!fx && fx.drops.isEnabled(), hits: !!fx && fx.hits.isEnabled(),
                    group: fx && fx.drops.renderingGroupId, msaa: !!pp && pp.name === 'msaa' && cam._postProcesses[0] === pp && pp.samples > 1,
                    inScene: !!fx && game.scene.meshes.includes(fx.drops),
                };
            });
        };
        const clear = await state('clear'), drizzle = await state('drizzle'), rain = await state('rain'), storm = await state('storm');
        c.ok(!clear.drops && !clear.hits, 'céu limpo: sem chuva');
        c.ok(drizzle.drops && !drizzle.hits, 'garoa: chove, mas sem pingos batendo no chão');
        c.ok(rain.drops && rain.hits && storm.drops && storm.hits, 'chuva forte e tempestade: chuva e pingos no chão');
        c.ok(storm.inScene && storm.group === 1, 'a chuva é geometria da cena 3D (testa a profundidade do mundo)');
        c.ok(storm.msaa, 'o gráfico suave desenha a cena (e a chuva) com MSAA');
        await page.evaluate(() => { Interiors.index(); const d = Interiors._doors.find((s) => s.style === 'bar') || Interiors._doors[0]; game.player.teleport(new BABYLON.Vector3(d.x, 0, d.z)); Interiors.enter(game, d); });
        await page.waitForFunction(() => Interiors.active && !Interiors.busy, null, { timeout: 60000 }).catch(() => {});
        await gameWait(page, 0.5);
        const inside = await page.evaluate(() => ({ drops: Weather.cur.fx.drops.isEnabled(), hits: Weather.cur.fx.hits.isEnabled() }));
        c.ok(!inside.drops && !inside.hits, 'dentro da loja não chove');
        c.noErrors(errors, 'chuva');
        await close();
    },
};
