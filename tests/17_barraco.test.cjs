// Começo do jogo: o barraco (safe house) é pequeno e precário e o personagem está quebrado — só os punhos, nada no bolso, R$ 200 na
// conta do banco, umas mudas de roupa no armário (que abre o Equipamento) e um pouco de comida na geladeira.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'barraco',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx, { outside: false });
        await gameWait(page, 1);
        const s = await page.evaluate(() => {
            const inv = game.inventory, S = SafeHouse, f = (k) => S.furniture.find((q) => q.kind === k);
            const inRoom = S.furniture.every((q) => q.x0 >= S.T - 0.01 && q.z0 >= S.T - 0.01 && q.x1 <= S.W - S.T + 0.01 && q.z1 <= S.D - S.T + 0.01);
            return {
                inside: !!(Interiors.active && Interiors.active.shop.safehouse), area: S.W * S.D, inRoom,
                cash: inv.cash, clean: inv.clean, bank: Banks.account,
                guns: Object.keys(inv.weapons).filter((k) => k !== 'fists' && inv.weapons[k].owned),
                fridge: game.stash.boxes.fridge, spare: Outfit.STARTER.filter((id) => Outfit.owned.has(id) && !Object.values(Outfit.worn).includes(id)).length,
                uses: S.furniture.filter((q) => q.use).map((q) => q.use).sort().join(','), wardrobe: !!f('wardrobe'),
            };
        });
        c.ok(s.inside, 'jogo novo começa dentro do barraco');
        c.ok(s.area < 80 && s.inRoom, `barraco de um cômodo só (${s.area.toFixed(0)} m², móveis dentro das paredes)`);
        c.ok(s.cash === 0 && s.clean === 0 && s.bank === 200, `quebrado: nada no bolso e R$ 200 na conta (${s.cash}/${s.clean}/${s.bank})`);
        c.eq(s.guns.length, 0, 'sem armas: só os punhos');
        c.ok(s.fridge.food > 0 && s.fridge.water > 0, 'um pouco de comida e água na geladeira');
        c.ok(s.spare >= 3, `mudas de roupa no armário (${s.spare})`);
        c.eq(s.uses, 'bed,chest,fridge,safe,wardrobe', 'colchão, caixote, geladeira, lata escondida e armário funcionam');
        // o armário abre o Equipamento (trocar de roupa)
        await page.evaluate(() => { const o = Interiors.STAGE, f = SafeHouse.furniture.find((q) => q.kind === 'wardrobe'); game.player.teleport(new BABYLON.Vector3(o.x + (f.x0 + f.x1) / 2, 0, o.z + f.z0 - 0.6)); });
        await gameWait(page, 0.3);
        const opened = await page.evaluate(() => { const p = Interiors.prompt(game); Interiors.interact(game); return { p, open: game.menu.isOpen, tab: game.menu.tab, view: game.menu.invView }; });
        c.ok(/armário/.test(opened.p) && opened.open && opened.tab === 'inventory' && opened.view === 'equip', 'o armário abre a tela de equipamento (trocar de roupa)');
        await page.evaluate(() => game.menu.close());
        c.noErrors(errors, 'barraco');
        await close();
    },
};
