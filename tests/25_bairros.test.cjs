// Bairros novos: o MORRO DO MIRANTE (favela do C.P.C, rival do C.V — hostil de dia, trégua na festa da madrugada), a VILA DA ROÇA (sítios,
// vila, bichos nos cercados) e o ALTO DA SERRA (vila de chalés com lojas, mansões muradas). Distritos, território no mapa e bichos.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'bairros',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        await gameWait(page, 1);
        const s = await page.evaluate(() => {
            const E = game.empire, T = Standing.territories.find((t) => t.id === 'cpc'), mid = FavelaSul.squares.find((q) => q.kind === 'quadra');
            const shops = (zone) => Interiors._doors.filter((d) => d.district === zone).length;
            return {
                cpc: FavelaSul.built, lots: FavelaSul.lots.length, alleys: FavelaSul.alleys.length, cv: FavelaPlan.lots.length,
                colors: FavelaSul.lots.filter((l) => l.facade.startsWith('vid')).length, tall: FavelaSul.lots.filter((l) => l.floors >= 3).length,
                outline: !!(T && T.poly() && T.poly().length > 10), rival: T && T.rival,
                roads: RoadPlan.edges.filter((e) => /Mirante|Rua da Laje/.test(e.name || '')).length,
                dMir: E.districtAt(mid.x0, mid.z0), dRoca: E.districtAt(Bairros.villages[0].x, Bairros.villages[0].z), dSerra: E.districtAt(Bairros.villages[1].x, Bairros.villages[1].z),
                dCv: E.districtAt(SafeHouse.spawnWorld().x, SafeHouse.spawnWorld().z),
                stats: Bairros.stats, villages: Bairros.villages.map((v) => v.id).join(','), pens: Bairros.pens.length,
                species: [...new Set(Bairros.pens.map((p) => p.sp))].sort().join(','),
                shopsRoca: shops('roca'), shopsSerra: shops('serra'), labels: WorldMap.regions.map((r) => r.name).filter((n) => /MIRANTE|ROÇA|ALTO DA SERRA/.test(n)).length,
                cpcGroups: game.gangs.groups ? game.gangs.groups.filter((g) => g.t.id === 'cpc').length : -1,
            };
        });
        c.ok(s.cpc && s.lots > 300 && s.alleys > 50, `Morro do Mirante construído (${s.lots} casas, ${s.alleys} becos; C.V: ${s.cv})`);
        c.ok(s.colors > s.lots * 0.5 && s.tall > s.lots * 0.4, `Mirante colorido e empilhado (${s.colors} coloridas, ${s.tall} com 3+ andares)`);
        c.ok(s.outline && s.rival === 'cv', 'território do C.P.C com contorno no mapa e rival do C.V');
        c.ok(s.roads >= 3, `ruas do Mirante ligadas à cidade e à rodovia (${s.roads} trechos)`);
        c.eq(s.dMir + '|' + s.dRoca + '|' + s.dSerra + '|' + s.dCv, 'mirante|roca|serra|favela', 'distritos dos bairros novos');
        c.ok(s.stats.sitios >= 8 && s.stats.mansoes >= 6 && s.stats.chales >= 3, `bairros do interior povoados (${JSON.stringify(s.stats)})`);
        c.eq(s.villages, 'roca,serra', 'as duas vilas');
        c.ok(s.pens >= 20 && s.species.split(',').length >= 4, `cercados com bichos (${s.pens}: ${s.species})`);
        c.ok(s.shopsRoca >= 2 && s.shopsSerra >= 4, `lojas com interior nas vilas (roça ${s.shopsRoca}, serra ${s.shopsSerra})`);
        c.eq(s.labels, 3, 'nomes dos bairros no mapa');
        c.ok(s.cpcGroups >= 8, `bondes do C.P.C no Mirante (${s.cpcGroups} grupos)`);

        // de dia, no Mirante: território inimigo (C.P.C hostil ao morador do C.V) e a polícia não sobe
        const day = await page.evaluate(() => {
            const q = FavelaSul.squares.find((s) => s.kind === 'quadra'), p = FavelaSul.nodeNear(q.x0 - 20, q.z0, true);
            game.dayNight.hour = 13; game.player.teleport(new BABYLON.Vector3(p.x, 0, p.z));
            return { banned: Standing.policeBanned(p.x, p.z), here: Standing.territoryAt(p.x, p.z) && Standing.territoryAt(p.x, p.z).id };
        });
        await gameWait(page, 2);
        const d2 = await page.evaluate(() => ({ hostile: game.gangs._hostile.cpc, cv: game.gangs._hostile.cv, active: game.gangs.members.filter((m) => m.faction === 'cpc').length, district: game.empire.here }));
        c.ok(day.here === 'cpc' && day.banned, 'Mirante é território do C.P.C, sem polícia');
        c.ok(d2.hostile && !d2.cv, `de dia o C.P.C é hostil ao morador do C.V (e o C.V não: ${d2.cv})`);
        c.ok(d2.active > 0, `traficantes do C.P.C em ronda perto do jogador (${d2.active})`);
        c.eq(d2.district, 'mirante', 'HUD: distrito Morro do Mirante');

        // de madrugada, na festa: trégua (o visitante curte em paz)
        const night = await page.evaluate(() => { game.dayNight.hour = 23.5; game.player.health = game.player.maxHealth || 100; NightLife.site(); game.player.teleport(new BABYLON.Vector3(NightLife.c.x, 0, NightLife.c.z - 4)); return true; });
        await gameWait(page, 2.5);
        const n2 = await page.evaluate(() => ({ on: NightLife.on, angry: game.gangs._angry.cpc, poi: CityGrid.pois.some((p) => p.name === NightLife.poiName), party: NightLife._partyList.length, dancers: NightLife._dancers.length }));
        c.ok(night && n2.on && n2.poi, 'a festa do Mirante rola de madrugada (e aparece no mapa)');
        c.ok(!n2.angry, 'na festa o C.P.C tolera o visitante');
        c.ok(n2.dancers > 5, `gente dançando no baile do Mirante (${n2.dancers})`);

        // os bichos da roça aparecem perto do cercado
        await page.evaluate(() => { const p = Bairros.pens.find((q) => q.sp === 'vaca') || Bairros.pens[0]; game.dayNight.hour = 10; game.player.teleport(new BABYLON.Vector3((p.x0 + p.x1) / 2, 0, p.z1 + 6)); });
        await gameWait(page, 2);
        const a = await page.evaluate(() => ({ n: game.livestock.animals.length, inPen: game.livestock.animals.every((q) => q.x >= q.pen.x0 - 0.01 && q.x <= q.pen.x1 + 0.01 && q.z >= q.pen.z0 - 0.01 && q.z <= q.pen.z1 + 0.01), d: game.empire.here }));
        c.ok(a.n > 3 && a.inPen, `bichos nos cercados da roça (${a.n})`);
        c.eq(a.d, 'roca', 'HUD: distrito Vila da Roça');
        c.noErrors(errors, 'bairros');
        await close();
    },
};
