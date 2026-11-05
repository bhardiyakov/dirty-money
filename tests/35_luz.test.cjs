// LUZ FÍSICA (etapa 2 do upgrade visual; render/Lighting.js): luz do céu (sombra fria, sol quente, personagens na sombra com a cor
// dela) e gradação discreta — ligadas por padrão. `?luz=0` desliga as duas (a luz de antes).
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'luz',
    async run(ctx, c) {
        const at = (h) => `game.dayNight.hour = ${h}; game.dayNight.apply();`;
        const look = () => ({
            pp: game.camera.camera._postProcesses.filter(Boolean).map((p) => p.name),
            shade: NpcArt._shadeC.asArray(), dark: game.gameEngine.shadowGenerator.getDarkness(),
            hemi: game.scene.getLightByName('hemi').diffuse.asArray(), sun: game.gameEngine.sun.diffuse.asArray(),
        });
        // o padrão: as duas ligadas
        const on = await boot(ctx, { query: 'gfx=high' });
        await on.page.evaluate(() => { game.weather.set('clear', true, true); game.weather.override = 1e9; Config.time.cycleSeconds = 1e12; if (game.autoQuality) game.autoQuality.off = true; game.dayNight.forceNoShadows = false; });
        await on.page.evaluate(at(13));
        await gameWait(on.page, 0.5);
        const d = await on.page.evaluate(look);
        c.ok(d.pp[d.pp.length - 1] === 'luzCor' && !d.pp.some((n) => /ssao/i.test(n)), `a gradação por último, sem oclusão (${d.pp.join(' → ')})`);
        c.ok(d.hemi[2] > d.hemi[0] && d.sun[0] > d.sun[2], `de dia, céu azulado e sol quente (céu ${d.hemi.map((v) => v.toFixed(2))}, sol ${d.sun.map((v) => v.toFixed(2))})`);
        c.ok(d.dark < 0.4, `sombra mais funda (${d.dark})`);
        c.ok(d.shade[2] > d.shade[0] && d.shade[0] < 0.66, `personagens na sombra com a cor fria dela (${d.shade.map((v) => v.toFixed(2))})`);
        await on.page.evaluate(at(17.9));
        const late = await on.page.evaluate(look);
        c.ok(late.hemi[2] - late.hemi[0] < d.hemi[2] - d.hemi[0], 'no fim da tarde a luz do céu recua (a luz dourada fica)');
        await on.page.evaluate(at(2));
        const night = await on.page.evaluate(look);
        const off0 = await on.page.evaluate(() => { const K = DayNight.KEYS[0][1]; return { hemiC: K.hemiC, sunC: K.sunC }; });
        c.ok(night.hemi.every((v, i) => Math.abs(v - off0.hemiC[i]) < 1e-3), 'de noite, a luz de sempre');
        c.noErrors(on.errors, 'luz ligada');
        await on.close();
        // tudo desligado: como antes
        const off = await boot(ctx, { query: 'gfx=high&luz=0' });
        await off.page.evaluate(() => { game.weather.set('clear', true, true); game.weather.override = 1e9; if (game.autoQuality) game.autoQuality.off = true; game.dayNight.forceNoShadows = false; });
        await off.page.evaluate(at(13));
        const o = await off.page.evaluate(look);
        c.ok(!o.pp.some((n) => /ssao|luz/i.test(n)), `?luz=0: sem pós-processamento novo (${o.pp.join(', ')})`);
        c.ok(o.shade.every((v) => Math.abs(v - 0.66) < 1e-3) && Math.abs(o.dark - 0.4) < 1e-3 && o.hemi.every((v) => Math.abs(v - 1) < 1e-3), '?luz=0: a luz e a sombra de sempre');
        c.noErrors(off.errors, 'luz desligada');
        await off.close();
    },
};
