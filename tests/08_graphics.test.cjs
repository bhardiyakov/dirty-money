// Gráficos High: o antisserrilhado dos personagens 2,5D (supersampling no shader — NpcArt, Config.art.npcAA) compila e é usado, e o
// MSAA da cena está ligado. (Os outros testes rodam no Low: o Chromium por software é detectado como placa fraca.)
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'graphics',
    async run(ctx, c) {
        // (o shader dos desenhos 2,5D: só a RESERVA — o jogo é 3D sem 2,5D, Char3D.no2d; ?sprites2d=1 liga os desenhos para testá-lo)
        const { page, errors, close } = await boot(ctx, { query: 'gfx=high&sprites2d=1' });
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
        c.eq(g.aa, 3, 'personagens com 3×3 amostras por pixel no High (npcAA 3: laço fixo — o 4×4 ficou só no HD)');
        c.ok(g.msaa >= 2, `MSAA da cena ligado (${g.msaa}×)`);
        c.ok(g.mats > 0 && g.ready === g.mats && g.aaDefine, `shader dos personagens com o supersampling compilado (${g.ready}/${g.mats} materiais)`);
        c.ok(g.sharp <= 1.2, `realce da ampliação brando com o antisserrilhado (${g.sharp.toFixed(2)})`);
        c.noErrors(errors, 'gráficos High');
        await close();
    },
};
