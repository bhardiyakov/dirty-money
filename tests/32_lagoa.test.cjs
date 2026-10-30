// A LAGOA (map/Lagoa.js): o espelho d'água doce de beira lisa (aterro), a orla com pista e ciclovia, a Av. Epitácio Pessoa em volta
// ligada às estradas e à cidade, os prédios de luxo (o m² mais caro da cidade), quadras e clube, quiosques e ambulantes que vendem,
// corredores e ciclistas de verdade, pedalinhos e caiaques nos deques — e a água sem onda, sem espuma e sem areia.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'lagoa',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        const s = await page.evaluate(() => {
            const L = Lagoa, out = {}, N = L.N;
            out.built = L.built;
            // a beira: água dentro, terra fora, sem praia (orla de grama), e a forma é lisa (o raio muda devagar)
            let ok = 0, smooth = 0;
            for (let i = 0; i < N; i += 6) {
                const a = L.at(i, -4), b = L.at(i, 4);
                if (!WorldMap.isLand(a[0], a[1]) && WorldMap.isLand(b[0], b[1])) ok++;
                const R = (k) => L.R(k / N * Math.PI * 2);
                smooth = Math.max(smooth, Math.abs(R(i + 1) - 2 * R(i) + R(i - 1)));                 // (curvatura: sem quina nem recorte miúdo)
            }
            out.shore = ok / Math.ceil(N / 6); out.smooth = smooth;
            const B = WorldMap.B, bio = [];
            for (let i = 0; i < N; i += 20) { const p = L.at(i, 6); bio.push(WorldMap.biomeAt(p[0], p[1])); }
            out.noSand = bio.every((b) => b !== B.SAND && b !== B.SWAMP);
            out.lake = !WorldMap.isSea[WorldMap.index(L.C.x, L.C.z)];
            // a avenida em volta e as ligações
            const names = new Set(RoadPlan.edges.map((e) => e.name));
            out.roads = ['Av. Epitácio Pessoa', 'Av. Borges de Medeiros', 'Rua Jardim Botânico', 'Rua Fonte da Saudade', 'Rua Mário Ribeiro'].filter((n) => names.has(n)).length;
            let onRing = 0;
            for (let i = 0; i < N; i += 12) { const p = L.at(i, L.RING), q = RoadPlan.nearestRoadPoint(p[0], p[1], 6); if (q && q.edge.name === 'Av. Epitácio Pessoa') onRing++; }
            out.ring = onRing / (N / 12);
            out.r7 = RoadPlan.edges.filter((e) => e.name === 'Rodovia da Lagoa').length;
            // os prédios: quarteirões de verdade (lotes com sólido, fachada de luxo), piscinas, quadras, clube
            out.blocks = L.blocks.length; out.towers = L.blocks.reduce((n, b) => n + b.lots.filter((l) => l.lagoa).length, 0);
            out.lux = L.blocks.every((b) => b.lots.every((l) => /^lux/.test(l.facade)));
            out.solid = L.blocks.filter((b) => b.lots.length).every((b) => { const l = b.lots[0], x = (l.x0 + l.x1) / 2, z = (l.z0 + l.z1) / 2; return CityGrid.obstaclesAround(x, z, 1).some((o) => o.x0 < x && o.x1 > x && o.z0 < z && o.z1 > z); });
            out.pools = L.blocks.reduce((n, b) => n + b.lots.filter((l) => l.pool).length, 0);
            out.courts = L.courts.map((q) => q.kind).sort().join(',');
            out.club = L.blocks.some((b) => b.club && b.pieces.some((p) => p.kind === 'pool'));
            out.inGrid = L.blocks.every((b) => CityGrid.blocks.includes(b)) && CityGrid._blockAtPoint((L.blocks[0].slab[0] + L.blocks[0].slab[2]) / 2, (L.blocks[0].slab[1] + L.blocks[0].slab[3]) / 2) === L.blocks[0];
            // imóveis: a Lagoa é o m² mais caro da cidade
            const lag = RealEstate.list.filter((p) => p.lagoa), rest = RealEstate.list.filter((p) => !p.lagoa);
            out.estate = lag.length; out.ppm = lag.length ? RealEstate.pricePerM2(lag[0]) : 0; out.ppmRest = Math.max(...rest.map((p) => RealEstate.pricePerM2(p)));
            out.region = lag.length ? lag[0].region : '';
            // orla: deques andáveis, trilha de corrida, pontos no mapa, barracas
            const d = L.decks[0]; out.deck = L.decks.length === 4 && MapGeo.onDock(d.r[0] + 6, (d.r[1] + d.r[3]) / 2);
            out.jog = CityGrid.jogPaths.some((j) => j.lagoa);
            out.pois = ['lagoa', 'quadra', 'clube'].filter((t) => CityGrid.pois.some((p) => p.type === t) && PauseMenu.POI_TYPES[t]).length;
            out.stands = [Stands.list.filter((x) => /^lagoa_quiosque/.test(x.id)).length, Stands.list.filter((x) => /^lagoa_ambulante/.test(x.id)).length];
            // a água: parada (sem onda), barcos sem motor
            out.waves = [Waves.open(L.C.x, L.C.z, 8), Waves.open(300, 300, 20)];
            out.boats = game.vehicleManager.boats.filter((b) => L.water(b.position.x, b.position.z)).map((b) => b.spec.id).sort().join(',');
            out.quiet = EngineAudio.profileOf(game.vehicleManager.boats.find((b) => b.spec.id === 'pedalinho')) === null;
            out.speedway = !!Speedway.site;
            return out;
        });
        c.ok(s.built && s.shore > 0.95 && s.smooth < 0.6, `a beira lisa do aterro: água dentro, terra fora (${(s.shore * 100).toFixed(0)}%, 2ª diferença máx. ${s.smooth.toFixed(3)} u)`);
        c.ok(s.noSand && s.lake, 'orla de grama, sem praia nem brejo; água de lago (doce)');
        c.ok(s.roads === 5 && s.ring > 0.9 && s.r7 > 2, `Av. Epitácio Pessoa em volta (${(s.ring * 100).toFixed(0)}%) e as 4 ligações; a Rodovia da Lagoa contorna`);
        c.ok(s.blocks >= 20 && s.towers >= 18 && s.lux && s.solid && s.inGrid, `prédios de luxo em quarteirões de verdade (${s.blocks} quarteirões, ${s.towers} torres)`);
        c.ok(s.pools >= 8, `piscinas nas coberturas (${s.pools})`);
        c.eq(s.courts, 'basket,futsal,play', 'quadras de futsal e de basquete e o parquinho');
        c.ok(s.club, 'o clube com a piscina');
        c.ok(s.estate >= 4 && s.ppm > s.ppmRest && s.region === 'Lagoa', `o metro quadrado mais caro da cidade (R$ ${s.ppm}/m² contra R$ ${s.ppmRest}/m²)`);
        c.ok(s.deck && s.jog && s.pois === 3, 'deques andáveis, a pista é trilha de corrida, pontos no mapa (Lagoa, quadras, clube)');
        c.ok(s.stands[0] >= 5 && s.stands[1] >= 3, `quiosques (${s.stands[0]}) e ambulantes (${s.stands[1]}) na orla`);
        c.ok(s.waves[0] === 0 && s.waves[1] > 0.5, 'a Lagoa não tem onda (o mar tem)');
        c.ok(/caiaque/.test(s.boats) && /pedalinho/.test(s.boats) && !/lancha|jetski|barco/.test(s.boats) && s.quiet, `pedalinhos e caiaques, sem motor (${s.boats})`);
        c.ok(s.speedway, 'o autódromo continua achando lugar');

        // gente: quiosque que vende, ciclistas de verdade na ciclovia, corredores na pista
        const g = await page.evaluate(() => {
            const L = Lagoa, gm = game, pl = gm.player, out = {}, N_ = L.N;
            gm.dayNight.hour = 9; gm.dayNight.apply();
            const k = Stands.list.find((x) => x.id === 'lagoa_quiosque0');
            pl.teleport(new BABYLON.Vector3(k.x - 2.6, 0, k.z));
            out.kiosk = /Quiosque da Lagoa/.test(Stands.prompt(gm));
            gm.inventory.cash = 100; Stands.interact(gm); out.bought = Stands.buy(gm, 'coco') && gm.inventory.cash === 92;
            if (Stands._p && Stands._p.open && Stands._p.close) Stands._p.close();
            const p = L.at(0, 12); pl.teleport(new BABYLON.Vector3(p[0], 0, p[1])); gm.camera.snapTo(pl.position);
            L._t = 0; L.update(0.6, gm);
            out.bikes = L.bikes.length;
            out.real = L.bikes.every((b) => gm.vehicleManager.vehicles.includes(b) && b.isBike && b.mode === 'drive');
            out.lane = L.bikes.every((b) => { const d = L.sd(b.position.x, b.position.z); return d > L.CICLO[0] - 0.6 && d < L.CICLO[1] + 0.6; });
            out.dirs = new Set(L.bikes.map((b) => b.route.dir)).size;
            window.__bk = L.bikes.map((b) => [b.position.x, b.position.z]);
            out.dens = gm.npcManager._density(p[0], p[1]);
            const t = L.at(N_ / 3, 5), j = CityGrid.jogNear(t[0], t[1], 300); out.jogHere = !!(j && j.path.lagoa);
            return out;
        });
        await gameWait(page, 3);
        const m = await page.evaluate(() => {
            const L = Lagoa, moved = L.bikes.filter((b, i) => Math.hypot(b.position.x - __bk[i][0], b.position.z - __bk[i][1]) > 2).length;
            const lane = L.bikes.every((b) => { const d = L.sd(b.position.x, b.position.z); return d > L.CICLO[0] - 1 && d < L.CICLO[1] + 1; });
            // longe: os ciclistas vão embora
            game.player.teleport(new BABYLON.Vector3(0, 0, 0)); game.camera.snapTo(game.player.position); L._t = 0; L.update(0.6, game);
            return { moved, lane, away: L.bikes.length };
        });
        c.ok(g.kiosk && g.bought, 'o quiosque da Lagoa vende (água de coco)');
        c.ok(g.bikes === Lagoa_BIKES && g.real && g.lane && g.dirs === 2, `ciclistas de verdade na ciclovia, nos dois sentidos (${g.bikes})`);
        c.ok(m.moved >= 6 && m.lane, `e eles pedalam sem sair da ciclovia (${m.moved} andaram)`);
        c.ok(m.away === 0, 'longe, os ciclistas somem');
        c.ok(g.dens === 1 && g.jogHere, `orla movimentada; a pista é a trilha de corrida mais perto (${g.dens}, ${g.jogHere})`);
        c.noErrors(errors, 'Lagoa');
        await close();
    },
};
const Lagoa_BIKES = 8;
