// ÁGUA (etapa 7 do upgrade visual; render/WaterPlugin.js): por padrão a água reflete o céu, o sol e as luzes da noite, e um espelho
// (MirrorTexture) mostra prédios, árvores e carros perto dela — só os que estão na tela, e só quando há água à vista. `?agua=0`: a de antes.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'agua',
    async run(ctx, c) {
        const look = () => ({
            reflect: Water.reflect, mirror: !!Water.mirror, seen: !!Water._seen,
            list: Water.mirror ? Water.mirror.renderList.length : 0, rate: Water.mirror ? Water.mirror.refreshRate : -1,
            night: NightLights.waterOn,
        });
        const a = await boot(ctx);
        await a.page.evaluate(() => { Config.time.cycleSeconds = 1e12; game.player.teleport(new BABYLON.Vector3(-335, 0, -1115)); game.camera.snapTo(game.player.position); game.dayNight.hour = 15; game.dayNight.apply(); });
        await gameWait(a.page, 1.2);
        const w = await a.page.evaluate(look);
        c.ok(w.reflect && w.mirror, 'a água reflete por padrão (céu, sol e espelho)');
        c.ok(w.seen && w.rate > 0 && w.list > 0 && w.list < 400, `com água à vista o espelho desenha ${w.list} malhas (a cada ${w.rate} quadro)`);
        c.ok(w.night, 'as luzes da noite também refletem na água');
        const p = await a.page.evaluate(() => { const q = CityGrid.center(); game.player.teleport(new BABYLON.Vector3(q.x - 60, 0, q.z + 90)); game.camera.snapTo(game.player.position); });
        await gameWait(a.page, 1.2);
        const d = await a.page.evaluate(look);
        c.ok(!d.seen && d.rate === 0, 'longe da água o espelho para');
        c.noErrors(a.errors, 'água');
        await a.close();
        const b = await boot(ctx, { query: 'agua=0' });
        const o = await b.page.evaluate(look);
        c.ok(!o.reflect && !o.mirror && !o.night, '?agua=0: a água de antes');
        c.noErrors(b.errors, 'água de antes');
        await b.close();
    },
};
