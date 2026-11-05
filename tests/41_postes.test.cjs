// POSTES E SEMÁFOROS (art/StreetFurniture.js, RoadPlan.onAsphalt): nenhum poste de rua nem de semáforo no asfalto (uma diagonal ou
// rotatória que cruza a calçada), colado num semáforo ou duplicado; o desenho novo (braço curvo, braço projetado) e as ruas mais
// iluminadas à noite (NightLights.STREET 'b'; `?ruas=antes` = a luz de antes).
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'postes',
    async run(ctx, c) {
        const a = await boot(ctx);
        const s = await a.page.evaluate(() => {
            const W = game.gameEngine.world, L = W.streetLamps, S = [];
            for (const n of CityGrid.intersections) for (const p of n.poles || []) S.push(p);
            const near = (x, z, r, list) => list.some((q) => Math.abs(q.x - x) < r && Math.abs(q.z - z) < r);
            return {
                lamps: L.length, signals: S.length,
                lampRoad: L.filter((l) => RoadPlan.onAsphalt(l.x, l.z, 0)).length,
                sigRoad: S.filter((p) => RoadPlan.onAsphalt(p.x, p.z, 0)).length,
                lampSig: L.filter((l) => near(l.x, l.z, 2.9, S)).length,
                heads: S.every((p) => p.hwNS || p.hw), sf: typeof StreetFurniture !== 'undefined',
                street: NightLights.street.along,
            };
        });
        c.ok(s.lamps > 3000 && s.signals > 1500, `${s.lamps} postes e ${s.signals} semáforos`);
        c.ok(s.lampRoad === 0 && s.sigRoad === 0, `nenhum no asfalto (${s.lampRoad} postes, ${s.sigRoad} semáforos)`);
        c.ok(s.lampSig === 0, 'nenhum poste colado num semáforo');
        c.ok(s.sf && s.heads, 'o desenho novo (braço curvo; semáforo com braço projetado sobre a pista)');
        c.ok(s.street >= 15, `as ruas mais iluminadas à noite (luz do poste: ${s.street} u ao longo da rua)`);
        // à noite o campo de luz tem os postes
        await a.page.evaluate(() => { Config.time.cycleSeconds = 1e12; const p = CityGrid.center(); game.player.teleport(new BABYLON.Vector3(p.x - 60, 0, p.z + 90)); game.camera.snapTo(game.player.position); game.dayNight.hour = 22; game.dayNight.apply(); });
        await gameWait(a.page, 0.5);
        const n = await a.page.evaluate(() => NightLights._q);
        c.ok(n > 5, `à noite: ${n} luzes no campo`);
        c.noErrors(a.errors, 'postes');
        await a.close();
        const b = await boot(ctx, { query: 'ruas=antes' });
        const o = await b.page.evaluate(() => NightLights.street.along);
        c.ok(o === 7.5, '?ruas=antes: a luz de antes');
        c.noErrors(b.errors, 'ruas de antes');
        await b.close();
    },
};
