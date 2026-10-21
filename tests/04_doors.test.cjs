// Todas as portas: entra e sai de cada loja da cidade em três horários (madrugada, dia, noite) — nenhuma pode quebrar.
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'doors',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        const r = await page.evaluate(() => {
            Interiors.index();
            const fails = {}; let n = 0;
            for (const hour of [4, 12, 20]) for (const shop of Interiors._doors) {
                game.dayNight.hour = hour; n++;
                try {
                    if (Interiors.active) Interiors._doLeave(game);
                    Interiors._doEnter(game, shop);
                    for (let k = 0; k < 20; k++) Interiors.update(0.1, game);
                } catch (e) {
                    const key = shop.style + ': ' + e.message;
                    if (!fails[key]) fails[key] = { n: 0, hour, at: (e.stack || '').split('\n')[1] };
                    fails[key].n++;
                    Interiors.active = null;
                }
            }
            if (Interiors.active) Interiors._doLeave(game);
            return { n, fails };
        });
        c.note(`${r.n} entradas em loja`);
        for (const [k, v] of Object.entries(r.fails)) c.ok(false, `${k} (${v.n}×, ${v.hour}h) ${v.at || ''}`);
        c.noErrors(errors, 'lojas');
        await close();
    },
};
