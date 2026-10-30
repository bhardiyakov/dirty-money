// O COMPLEXO DO MARACANÃ: por fora (estádio com o vão do portão sul, estacionamento, estação, passarela andável, Maracanãzinho,
// parque aquático, no mapa) e por dentro, como as lojas (Interiors): a porta do portão sul, o saguão com a bilheteria (o ingresso
// libera as catracas), a lanchonete (cardápio do estádio), a arquibancada (assistir ao jogo), o jogo rolando (jogadores, bola, gol,
// placar) e a saída de volta ao portão.
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'maracana',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        const s = await page.evaluate(() => {
            const M = Maracana, S = M.S, out = {}, g = M.E(1, -Math.PI / 2);
            const solidAt = (x, z) => CityGrid.obstaclesAround(x, z, 0.5).some((o) => !o.stair && o.x0 < x && o.x1 > x && o.z0 < z && o.z1 > z);
            out.built = M.built && Landmarks.stadium === S;
            out.pitch = !!game.scene.getMeshByName('stadiumPitch');
            out.gateOpen = !solidAt(g[0], g[1] + 1.0) && !solidAt(g[0], g[1] - 1.0);
            out.ringSolid = solidAt(...M.E(1.02, 0)) && solidAt(...M.E(1.02, Math.PI * 0.6));
            out.inside = solidAt(S.x, S.z);
            out.dome = solidAt(M.DOME.x, M.DOME.z);
            Interiors.index();
            const d = M.door();
            out.door = !!d && Interiors.shopNear(d.x, d.z) === d;
            out.road = RoadPlan.edges.filter((e) => e.name === 'Av. do Estádio').length;
            out.speedway = !!Speedway.site;
            out.grass = WorldMap.biomeAt(-470, 30) === WorldMap.B.GRASS;
            out.label = WorldMap.regions.some((r) => r.name === 'MARACANÃ');
            out.closedAt3 = !Economy.isOpen('stadium', 3) && Economy.isOpen('stadium', 16);
            // a passarela da estação: da plataforma, sobe, atravessa os trilhos e desce na esplanada (sem fresta)
            const pl = game.player, B = M.BRIDGE.pts, path = [[B[0][0], B[0][1], 0], [B[1][0], B[1][1], M.BRIDGE.h], [B[2][0], B[2][1], M.BRIDGE.h], [B[3][0], B[3][1], 0], [B[3][0] + (B[3][0] - B[2][0]) * 0.3, B[3][1] + (B[3][1] - B[2][1]) * 0.3, 0]];
            pl.teleport(new BABYLON.Vector3(B[0][0], 0, B[0][1])); pl.enterWalk(M.net, B[0][0], B[0][1], 0.01);
            out.bridge = 'ok';
            for (let i = 0; i + 1 < path.length && out.bridge === 'ok'; i++) {
                const A = path[i], C = path[i + 1], L = Math.hypot(C[0] - A[0], C[1] - A[1]);
                for (let u = 0; u <= L; u += 0.3) {
                    const x = A[0] + (C[0] - A[0]) * u / L, z = A[1] + (C[1] - A[1]) * u / L, p = pl.position, h = A[2] + (C[2] - A[2]) * u / L;
                    p.x = x; p.z = z; pl._clampToDeck(p); pl._updateLevel();
                    if (i < 2 && (!pl.walk || Math.hypot(p.x - x, p.z - z) > 0.05 || Math.abs(pl.deckH - h) > 0.7)) { out.bridge = `trecho ${i}, ${u.toFixed(1)} u: altura ${pl.deckH.toFixed(1)} (esperada ${h.toFixed(1)})`; break; }
                    if (!pl.walk) break;
                }
            }
            out.bridgeTop = M.BRIDGE.h;
            out.bridgeExit = !pl.walk;                                                     // (desceu a escada da esplanada: de volta ao chão)
            // no mapa: a cobertura branca e o gramado
            const cv = document.createElement('canvas'); cv.width = cv.height = 64;
            const px = (x, z) => { const ctx = cv.getContext('2d'); MapRenderer.drawView(ctx, 64, 64, x, z, 3, { budget: 1e4 }); return Array.from(ctx.getImageData(32, 32, 1, 1).data.slice(0, 3)); };
            out.mapRoof = px(...M.E(0.85, Math.PI / 2));
            out.mapPitch = px(S.x + 2, S.z + 1);
            return out;
        });
        c.ok(s.built && s.pitch, 'o complexo do Maracanã montado (estádio, gramado)');
        c.ok(s.gateOpen && s.ringSolid && s.inside && s.dome, 'o anel é sólido, com o vão do portão sul; Maracanãzinho sólido');
        c.ok(s.door, 'o portão sul é uma porta (Interiors)');
        c.ok(s.road >= 1 && s.speedway && s.grass && s.label, 'Av. do Estádio, o autódromo no lugar, gramado em volta, nome no mapa');
        c.ok(s.closedAt3, 'o estádio abre de dia e fecha de madrugada');
        c.eq(s.bridge, 'ok', 'passarela da estação: sobe da plataforma e atravessa os trilhos sem fresta');
        c.ok(s.bridgeExit, 'e desce na esplanada, de volta ao chão');
        c.ok(s.mapRoof[0] > 200 && s.mapRoof[1] > 200 && s.mapRoof[2] > 200, `no mapa, a cobertura branca (${s.mapRoof})`);
        c.ok(s.mapPitch[1] > s.mapPitch[0] + 40, `no mapa, o gramado (${s.mapPitch})`);

        // por dentro
        const r = await page.evaluate(() => {
            const g = game, M = Maracana, d = M.door(), pl = g.player, o = Interiors.STAGE, out = {}, txt = (h) => (h || '').replace(/<[^>]+>/g, ' ');
            g.dayNight.hour = 16; g.dayNight.apply(); g.wanted.level = 0;
            pl.teleport(new BABYLON.Vector3(d.x, 0, d.z));
            out.check = Interiors.check(g, d).ok;
            // o vão do portão: andando do pátio para dentro, chega à soleira (doorHit) sem bater no anel
            let hit = null;
            for (let z = d.ez - 3; z < d.ez + 1.2 && !hit; z += 0.2) { pl.position.x = d.x; pl.position.z = z; hit = Interiors.doorHit(pl.position.x, pl.position.z); if (CityGrid.obstaclesAround(d.x, z, 0.5).some((s) => !s.stair && s.x0 < d.x + 0.35 && s.x1 > d.x - 0.35 && s.z0 < z + 0.35 && s.z1 > z - 0.35)) break; }
            out.walkIn = hit === d;
            Interiors._doEnter(g, d);
            out.active = !!(Interiors.active && Interiors.active.shop.stadium);
            out.room = Interiors.active.data.W === M.W;
            out.players = M._players.filter((p) => p.actor.mesh.isEnabled()).length;
            out.ball = M._ball.isEnabled();
            out.fans = Interiors._actors.filter((a) => a.mesh.isEnabled()).length;
            const at = (x, z) => { pl.position.x = o.x + x; pl.position.z = o.z + z; };
            at(30, 8.6); out.closed = /CATRACA FECHADA/.test(txt(Interiors.prompt(g)));
            out.gates = Interiors.obstacles.filter((s) => s.gate).length;
            at(7, 4.4); out.ticketPrompt = /comprar ingresso/.test(txt(Interiors.prompt(g)));
            g.inventory.cash = 100; Interiors.interact(g);
            out.paid = 100 - g.inventory.cash; out.gatesAfter = Interiors.obstacles.filter((s) => s.gate).length;
            at(52.9, 4.6); out.menu = /cardápio/.test(txt(Interiors.prompt(g))); Interiors.interact(g); out.shopUI = g.shopUI.open; g.shopUI.close();
            out.stock = Economy.STYLES.stadium.stock.map((x) => x[0]).join(',');
            at(30, 20); out.watchPrompt = /assistir ao jogo/.test(txt(Interiors.prompt(g)));
            const h0 = g.dayNight.hour; Interiors.interact(g); for (let i = 0; i < 40; i++) M.tick(0.25, g);
            out.hours = +(((g.dayNight.hour - h0) + 24) % 24).toFixed(2);
            // a bola anda e os jogadores correm atrás dela
            const b0 = { x: M._ballP.x, z: M._ballP.z }, p0 = M._players.map((p) => [p.x, p.z]);
            M._ballP.vx = 4; M._ballP.vz = 2; for (let i = 0; i < 12; i++) M.tick(0.1, g);
            out.ballMoved = Math.hypot(M._ballP.x - b0.x, M._ballP.z - b0.z) > 0.5;
            out.playersMoved = M._players.filter((p, i) => Math.hypot(p.x - p0[i][0], p.z - p0[i][1]) > 0.3).length;
            const sc = M.score[0] + M.score[1]; M._ballP.x = M.W / 2; M._ballP.z = M.D - 0.1; M._ballP.vx = 0; M._ballP.vz = 1; M._goalT = 0; M.tick(0.05, g);
            out.goal = M.score[0] + M.score[1] - sc;
            Interiors._doLeave(g);
            out.back = Math.hypot(pl.position.x - d.x, pl.position.z - d.z) < 0.5;
            out.cleared = !Interiors.active && !M._players[0].actor.mesh.isEnabled() && !M._ball.isEnabled();
            g.dayNight.hour = 3; out.night = !Interiors.check(g, d).ok;
            return out;
        });
        c.ok(r.walkIn, 'o vão do portão sul é aberto: andando, chega à soleira');
        c.ok(r.check && r.active && r.room, 'entra pelo portão sul: a sala do estádio');
        c.ok(r.players === 8 && r.ball && r.fans >= 15, `o jogo rolando (${r.players} jogadores, bola) e a torcida (${r.fans})`);
        c.ok(r.closed && r.gates === 6, 'sem ingresso, as catracas estão fechadas');
        c.ok(r.ticketPrompt && r.paid === 40 && r.gatesAfter === 0, `ingresso na bilheteria (R$ ${r.paid}): as catracas liberam`);
        c.ok(r.menu && r.shopUI && /hotdog/.test(r.stock), `lanchonete do estádio (${r.stock})`);
        c.ok(r.watchPrompt && r.hours === 1.5, `assistir ao jogo da arquibancada (+${r.hours} h)`);
        c.ok(r.ballMoved && r.playersMoved >= 4, `a bola rola e os jogadores correm atrás dela (${r.playersMoved})`);
        c.eq(r.goal, 1, 'gol na rede: o placar sobe');
        c.ok(r.back && r.cleared, 'saindo, volta ao portão e o jogo some');
        c.ok(r.night, 'de madrugada o portão está fechado');
        c.noErrors(errors, 'Maracanã');
        await close();
    },
};
