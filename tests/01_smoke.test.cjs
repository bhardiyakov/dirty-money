// Fumaça: o jogo abre, sai do esconderijo, todas as abas do menu, o celular e as janelas principais abrem sem erro.
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'smoke',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        c.noErrors(errors, 'abrir o jogo');
        const st = await page.evaluate(() => ({ mode: game.mode, hp: game.player.hp, npcs: game.npcManager ? game.npcManager.npcs.length : 0, cars: game.vehicleManager ? game.vehicleManager.vehicles.length : 0 }));
        c.eq(st.mode, 'player', 'jogador a pé ao sair de casa');
        c.ok(st.hp > 0, 'jogador vivo');
        c.note(`${st.npcs} pedestres, ${st.cars} veículos`);
        for (const tab of ['map', 'inventory', 'status', 'careers', 'business', 'empire', 'guide', 'save', 'settings']) {
            await page.evaluate((t) => game.menu.open(t), tab);
            await page.waitForTimeout(400);
            const ok = await page.evaluate((t) => game.menu.isOpen && game.menu.tab === t, tab);
            c.ok(ok, `aba ${tab} abre`);
        }
        await page.evaluate(() => game.menu.close());
        c.noErrors(errors, 'abas do menu');
        await page.evaluate(() => { Phone.toggle(true); for (const t of ['msgs', 'contacts', 'agenda', 'news']) { Phone.tab = t; Phone._render(); } Phone.toggle(false); });
        c.noErrors(errors, 'celular');
        await page.waitForTimeout(3000);
        c.noErrors(errors, 'alguns segundos de jogo');
        await close();
    },
};
