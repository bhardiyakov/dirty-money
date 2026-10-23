// Gráficos High: o antisserrilhado dos personagens 2,5D (supersampling no shader — NpcArt, Config.art.npcAA) compila e é usado, e o
// MSAA da cena está ligado. (Os outros testes rodam no Low: o Chromium por software é detectado como placa fraca.)
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'graphics',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx, { query: 'gfx=high' });
        await gameWait(page, 1.5);
        const g = await page.evaluate(() => {
            const mats = []; for (const A of Object.values(NpcArt.atlases)) for (const P of A.pages) if (P.mat) mats.push(P.mat);
            return {
                level: Graphics.level, aa: NpcArt.aa, msaa: Smooth.pp && Smooth.pp.samples, mats: mats.length,
                ready: mats.filter((m) => m.isReady()).length, aaDefine: mats.some((m) => (m.options.defines || []).includes('#define AA')),
                sharp: NpcArt._sharpOf({ data: { k: 1 } }),
            };
        });
        c.eq(g.level, 'high', 'preset High pela URL');
        c.eq(g.aa, 4, 'personagens com até 16 amostras por pixel (npcAA 4)');
        c.ok(g.msaa >= 2, `MSAA da cena ligado (${g.msaa}×)`);
        c.ok(g.mats > 0 && g.ready === g.mats && g.aaDefine, `shader dos personagens com o supersampling compilado (${g.ready}/${g.mats} materiais)`);
        c.ok(g.sharp <= 1.2, `realce da ampliação brando com o antisserrilhado (${g.sharp.toFixed(2)})`);
        c.noErrors(errors, 'gráficos High');
        await close();
    },
};
