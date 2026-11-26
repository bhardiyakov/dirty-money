// Gráficos High: o MSAA da cena ligado e os personagens 3D (o jogo não tem mais desenhos 2,5D) com o shader low poly compilado, no
// detalhe cheio (não no modo simples). (Os outros testes rodam no Low: o Chromium por software é detectado como placa fraca.)
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'graphics',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx, { query: 'gfx=high' });
        await gameWait(page, 3);
        const g = await page.evaluate(() => {
            const mats = [...Char3D.npcs.values()].concat(game.player.char3d ? [game.player.char3d] : []).map((C) => C.polyMat).filter(Boolean);
            return { level: Graphics.level, msaa: Smooth.pp && Smooth.pp.samples, mats: mats.length, ready: mats.filter((m) => m.isReady()).length,
                safe: Char3D.safe, simple: mats.some((m) => (m.options.defines || []).includes('#define SAFE')), lodBias: Char3D.lodBias };
        });
        c.eq(g.level, 'high', 'preset High pela URL');
        c.ok(g.msaa >= 2, `MSAA da cena ligado (${g.msaa}×)`);
        c.ok(g.mats > 0 && g.ready === g.mats && !g.safe && !g.simple, `shader low poly dos personagens compilado, com o detalhe cheio (${g.ready}/${g.mats} materiais)`);
        c.ok(g.lodBias === 1, `nível de detalhe dos NPCs do High sem viés (lodBias ${g.lodBias})`);
        c.noErrors(errors, 'gráficos High');
        await close();
    },
};
