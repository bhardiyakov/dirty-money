// FAVELA E ROÇA DA REFERÊNCIA (world/FavelaDetail.js, art/RuralArt.js, CityHD._fac_fav): os barracos de tijolo baiano e reboco
// descascado, as ruas e becos de terra, gatonet, ar-condicionado, ferros de laje, varais, a fiação do gato puxada para as casas,
// pedras com mato e lixo; na roça, a terra vermelha, as plantações em 3D, trator ou carroça, colheita, lenha, forno, colmeias, curral
// coberto e bichos soltos no campo aberto.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'favela_roca',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        page.setDefaultTimeout(0);
        const r = await page.evaluate(() => {
            Tutorial.skip();
            const lots = []; for (const b of CityGrid.blocks) if (b.district === 'favela' && b.id && b.id.startsWith('favela:')) for (const l of b.lots) if (!l.safehouse) lots.push(l);
            const pieces = {}; for (const b of CityGrid.blocks.concat(CityGrid.extraBlocks || [])) for (const p of b.pieces || []) pieces[p.kind] = (pieces[p.kind] || 0) + 1;
            const sc = game.gameEngine.scene;
            return {
                st: FavelaDetail.stats, lots: lots.length, fav: lots.filter((l) => /^fav\d/.test(l.facade)).length,
                favSurf: RoadPlan.CLASS.fav.surface, dirtTex: GroundPhotos.SET.dirt.id, pieces,
                loose: Bairros.pens.filter((p) => p.loose).length, favFacade: !!(game.gameEngine.world.mats.facades.fav1),
                caipira: TileFactory.facadeStyles.caipira0.kind,
            };
        });
        const S = r.st;
        c.ok(r.lots > 100 && r.fav / r.lots > 0.9, `barracos de tijolo e reboco: ${r.fav} de ${r.lots} com a fachada da favela`);
        c.ok(r.favFacade, 'a fachada da favela foi gerada (tijolo baiano + reboco pintado)');
        c.ok(r.favSurf === 'earth', 'as ruas da favela são de terra batida (sem asfalto nem cimento)');
        c.ok(S.dishes > 200 && S.acs > 100 && S.rebar > 50 && S.lines > 30, `gatonet e lajes: ${S.dishes} antenas, ${S.acs} ar-condicionados, ${S.rebar} lajes com ferro, ${S.lines} varais`);
        c.ok(S.drops > 200 && S.across > 100, `fiação embolada: ${S.drops} fios do gato até as casas, ${S.across} cruzando os becos`);
        c.ok(S.stones > 500 && S.tufts > 500 && S.bags > 200 && S.debris > 20, `chão: ${S.stones} pedras, ${S.tufts} tufos de mato, ${S.bags} sacos de lixo, ${S.debris} montes de entulho`);
        const P = r.pieces;
        c.ok((P.tractor || 0) + (P.cart || 0) >= 5 && P.harvest >= 5 && P.firewood >= 5 && P.shed >= 5, `roça: ${P.tractor || 0} tratores, ${P.cart || 0} carroças, ${P.harvest} colheitas, ${P.firewood} lenhas, ${P.oven || 0} fornos, ${P.hives || 0} colmeias, ${P.shed} currais`);
        c.ok(P.crops >= 8, `${P.crops} plantações (milho, couve, tomate, alface, mandioca) em leiras de terra vermelha`);
        c.ok(/red/.test(r.dirtTex) && r.caipira === 'fav', `terra vermelha nas estradas (${r.dirtTex}) e casa humilde de reboco gasto`);
        c.ok(r.loose >= 3, `${r.loose} grupos de bichos soltos no campo aberto`);
        // o trator tem corpo físico: o jogador a pé não atravessa
        const t = await page.evaluate(() => {
            let tr = null; for (const b of CityGrid.extraBlocks || []) for (const p of b.pieces || []) if (!tr && p.kind === 'tractor') tr = p;
            if (!tr) return null;
            const o = CityGrid.obstaclesAround(tr.x, tr.z, 0.5).some((q) => tr.x > q.x0 && tr.x < q.x1 && tr.z > q.z0 && tr.z < q.z1);
            const col = game.gameEngine.world.colliders.some((q) => q.node.name.startsWith('roca_tractor'));
            return { o, col };
        });
        c.ok(t && t.o && t.col, 'o trator é sólido (quem anda e a física)');
        // a vista da favela e da roça renderiza sem erro
        await page.evaluate(() => { const a = FavelaPlan.alleys[3].pts[0]; game.player.teleport(new BABYLON.Vector3(a[0], 0, a[1])); game.camera.snapTo(game.player.position); });
        await gameWait(page, 2, 60000);
        await page.evaluate(() => { const p = Bairros.pens.find((q) => q.loose); game.player.teleport(new BABYLON.Vector3((p.x0 + p.x1) / 2, 0, p.z0 - 3)); game.camera.snapTo(game.player.position); });
        await gameWait(page, 2, 60000);
        c.noErrors(errors, 'favela_roca');
        await close();
    },
};
