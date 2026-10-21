// Primeiros passos: um jogo novo começa no passo 1 e cada passo conclui pelo jeito normal de jogar (conversar, celular, comer…).
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'tutorial',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        await page.waitForTimeout(1500);
        const s0 = await page.evaluate(() => ({ step: Tutorial.step, done: Tutorial.done, card: !!document.getElementById('tutCard') && document.getElementById('tutCard').style.display !== 'none', gps: game.gps && game.gps.label }));
        c.ok(s0.step === 0 && !s0.done, 'jogo novo começa nos primeiros passos');
        c.ok(s0.card, 'cartão do objetivo na tela');
        c.ok(/Rosa/.test(s0.gps || ''), `GPS marca a Dona Rosa (${s0.gps})`);
        const talk = async (id) => {
            await page.evaluate((id) => { const A = Personas._anchors(game)[id]; game.dayNight.hour = 3; game.player.teleport(new BABYLON.Vector3(A.x + 1.2, 0, A.z)); game.camera.snapTo(A); }, id);
            await page.waitForFunction((id) => !!Personas.actors[id], id, { timeout: 30000 }).catch(() => {});
            return page.evaluate((id) => { const ok = Personas.interact(game); if (Personas._mp && Personas._mp.open) Personas._mp.close(); return ok; }, id);
        };
        const stepAfter = async () => { await page.waitForTimeout(2500); return page.evaluate(() => Tutorial.step); };
        c.ok(await talk('rosa'), 'Dona Rosa aparece (mesmo de madrugada) e dá para conversar');
        c.eq(await stepAfter(), 1, 'passo 1 (Dona Rosa) concluído');
        c.ok(await talk('ze'), 'Seu Zé aparece e dá para conversar');
        c.eq(await stepAfter(), 2, 'passo 2 (Seu Zé) concluído');
        await page.waitForTimeout(1500);
        await page.evaluate(() => { Phone.toggle(true); Phone.tab = 'msgs'; Phone.thread = 'neguinho'; Phone._render(); Phone.toggle(false); });
        c.eq(await stepAfter(), 3, 'passo 3 (celular) concluído');
        await page.waitForTimeout(1500);
        await page.evaluate(() => Physique.eat(400));
        c.eq(await stepAfter(), 4, 'passo 4 (comer) concluído');
        await page.waitForTimeout(1500);
        await page.evaluate(() => { const P = game.player.position; WorldMemory.crime('theft', P.x, P.z); });
        c.eq(await stepAfter(), 5, 'passo 5 (furto) concluído');
        await page.waitForTimeout(1500);
        const kits0 = await page.evaluate(() => game.inventory.medkits || 0);
        await page.evaluate(() => { const T = Phone.threads.dentinho || []; const m = T.slice().reverse().find((q) => q.actions && !q.done); if (m) Phone._act(m, 'rivalNo'); });
        await page.waitForTimeout(2500);
        const end = await page.evaluate(() => ({ done: Tutorial.done, kits: game.inventory.medkits || 0, save: JSON.stringify(SaveGame.snapshot(game).tutorial) }));
        c.ok(end.done, 'primeiros passos concluídos');
        c.eq(end.kits, kits0 + 1, 'recompensa final (kit médico)');
        c.eq(end.save, JSON.stringify({ step: 6, done: true }), 'estado salvo');
        c.noErrors(errors, 'tutorial');
        await close();
    },
};
