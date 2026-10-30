// O CORCOVADO: o morro em 3D com o Cristo no mirante e os caminhos do chão até o topo, andando de verdade (Walkways):
//   • as escadarias do portão ao mirante, a passarela de madeira até o terraço do café, a escada do terraço e a da estação do alto —
//     sem fresta em nenhum ponto, com a altura subindo; entra-se pelo pé de um lance e, descendo, sai-se no chão pelo pé;
//   • o elevador (do chão ao terraço) e o trem (da estação do pé à do alto), com o E, nos dois sentidos;
//   • a câmera abre lá em cima; o morro é sólido para quem está no chão; o autódromo ainda acha lugar; no mapa, o complexo.
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'corcovado',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        const r = await page.evaluate(() => {
            const pl = game.player, C = Corcovado, out = {};
            out.built = C.built && !!C.net && C.net.parts.length > 20;
            out.meshes = ['corcovadoHill', 'cristoRedentor', 'corcovadoLiftCab', 'corcovadoLiftGlass'].filter((n) => game.scene.getMeshByName(n)).length;
            out.train = C._train ? C._train.length : 0;
            out.trees = C.trees;
            // cada caminho, passo a passo (0,3 u): nada segura o jogador e a altura acompanha
            const walk = (P) => {
                const a = C.W(P[0][0], P[0][1]);
                pl.teleport(new BABYLON.Vector3(a[0], 0, a[1])); pl.enterWalk(C.net, a[0], a[1], P[0][2]);
                for (let i = 0; i + 1 < P.length; i++) {
                    const A = P[i], B = P[i + 1], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
                    for (let u = 0; u <= L + 0.29; u += 0.3) {
                        u = Math.min(u, L);                                              // (a última amostra é a ponta)
                        const w = C.W(A[0] + (B[0] - A[0]) * u / L, A[1] + (B[1] - A[1]) * u / L), p = pl.position, h = A[2] + (B[2] - A[2]) * u / L;
                        p.x = w[0]; p.z = w[1]; pl._clampToDeck(p); pl._updateLevel();
                        if (!pl.walk || Math.hypot(p.x - w[0], p.z - w[1]) > 0.05 || Math.abs(pl.deckH - h) > 0.7) return `trecho ${i}, ${u.toFixed(1)} u: altura ${pl.deckH.toFixed(1)} (esperada ${h.toFixed(1)})`;
                        if (u >= L) break;
                    }
                }
                return +pl.deckH.toFixed(1);
            };
            out.routes = {
                escadaria: walk(C.STAIRS),
                madeira: walk(C.WOOD),
                cafe: walk([[24, -39.5, 11], [18, -35, 11], [14, -31, 11]].concat(C.UPPER)),
                ponte: walk([[C.LIFT.stop[0], C.LIFT.stop[1], 11], [25.6, -37.2, 11], [20, -35, 11]]),
                trem: walk([[22, 2.4, 16]].concat(C.TOPSTAIR, [[0, -10, 18]])),
            };
            // entra pelo pé andando para ele; não sobe por baixo nem de lado
            const foot = C.W(-8, -63.6);
            pl.teleport(new BABYLON.Vector3(foot[0], 0, foot[1]));
            pl.velocity.set(0, 0, 3); pl.speed = 3; pl._updateLevel();
            out.entry = !!pl.walk;
            const side = C.W(-12, -58);
            pl.teleport(new BABYLON.Vector3(side[0], 0, side[1]));
            pl.velocity.set(3, 0, 0); pl.speed = 3; pl._updateLevel();
            out.sideEntry = !!pl.walk;
            // descendo a escadaria inteira: sai no chão pelo pé
            const top = C.W(-8, -12);
            pl.teleport(new BABYLON.Vector3(top[0], 0, top[1])); pl.enterWalk(C.net, top[0], top[1], 18);
            const back = C.STAIRS.slice().reverse().concat([[-8, -67, 0]]);
            out.exit = null;
            for (let i = 0; i + 1 < back.length && !out.exit; i++) {
                const A = back[i], B = back[i + 1], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
                for (let u = 0; u <= L; u += 0.3) {
                    const w = C.W(A[0] + (B[0] - A[0]) * u / L, A[1] + (B[1] - A[1]) * u / L), p = pl.position;
                    p.x = w[0]; p.z = w[1]; pl._clampToDeck(p); pl._updateLevel();
                    if (!pl.walk) { out.exit = { z: +C.local(p.x, p.z).z.toFixed(1), h: pl.deckH, deck: pl.onDeck }; break; }
                }
            }
            // a câmera: lá em cima abre e mira o personagem no alto
            pl.teleport(new BABYLON.Vector3(top[0], 0, top[1])); pl.enterWalk(C.net, top[0], top[1], 18);
            out.zoom = C.zoomFor(pl);
            // o morro é sólido para quem está no chão
            const mid = C.W(10, -22);
            out.solid = CityGrid.obstaclesAround(mid[0], mid[1], 2).some((o) => o.x0 < mid[0] && o.x1 > mid[0] && o.z0 < mid[1] && o.z1 > mid[1]);
            out.speedway = !!Speedway.site;
            out.road = RoadPlan.edges.filter((e) => e.name === 'Estrada do Corcovado').length;
            out.forest = WorldMap.biomeAt(C.C.x + 30, C.C.z + 30) === WorldMap.B.FOREST;
            out.poi = CityGrid.pois.some((p) => p.type === 'cristo');
            return out;
        });
        c.ok(r.built && r.meshes === 4 && r.train === 2, `Corcovado montado: morro, Cristo, elevador (cabine e vidro), trem com ${r.train} carros`);
        c.ok(r.trees > 300, `mata no morro (${r.trees} copas)`);
        c.eq(r.routes.escadaria, 18, 'escadaria do portão ao mirante: contínua, sobe até 18 u');
        c.eq(r.routes.madeira, 11, 'passarela de madeira do pé ao terraço do café');
        c.eq(r.routes.cafe, 18, 'do terraço do café ao mirante');
        c.eq(r.routes.ponte, 11, 'ponte do elevador até o terraço');
        c.eq(r.routes.trem, 18, 'da estação do alto ao mirante');
        c.ok(r.entry && !r.sideEntry, 'entra pelo pé da escadaria andando para ela (de lado, não)');
        c.ok(!!r.exit && r.exit.h === 0 && !r.exit.deck && r.exit.z < -63, `descendo, sai no chão pelo pé (${JSON.stringify(r.exit)})`);
        c.ok(r.zoom > 2, `a câmera abre no mirante (${r.zoom.toFixed(2)}×)`);
        c.ok(r.solid, 'o morro é sólido para quem está no chão');
        c.ok(r.speedway && r.road >= 1 && r.forest && r.poi, 'autódromo no lugar, Estrada do Corcovado, mata em volta, ponto no mapa');

        // elevador e trem: E no pé leva ao alto; E lá em cima traz de volta
        const ride = await page.evaluate(() => {
            const pl = game.player, C = Corcovado, g = game, out = {};
            const go = () => { let n = 0; while (C.ride && n < 400) { C.update(0.25); n++; } };
            const at = () => { const q = C.local(pl.position.x, pl.position.z); return { x: +q.x.toFixed(1), z: +q.z.toFixed(1), h: +(pl.deckH || 0).toFixed(1), walk: !!pl.walk, frozen: !!pl.frozen }; };
            let w = C.W(C.LIFT.door[0], C.LIFT.door[1]);
            pl.teleport(new BABYLON.Vector3(w[0], 0, w[1]));
            out.liftPrompt = /Elevador/.test(C.prompt(g));
            C.interact(g); out.liftRiding = !!C.ride && pl.frozen; go(); out.liftTop = at(); out.cab = C._cab.position.y;
            out.liftDownPrompt = /descer/.test(C.prompt(g)); C.interact(g); go(); out.liftBottom = at();
            w = C.W(62, 2.4); pl.teleport(new BABYLON.Vector3(w[0], 0, w[1]));
            out.trainPrompt = /Trem/.test(C.prompt(g));
            C.interact(g); for (let i = 0; i < 30; i++) C.update(0.25); out.trainMid = at(); go(); out.trainTop = at();
            C.interact(g); go(); out.trainBottom = at();
            // sem passageiro, o trem vai e volta sozinho
            const u0 = C.train.u; for (let i = 0; i < 80; i++) C.update(0.25); out.shuttle = Math.abs(C.train.u - u0);
            return out;
        });
        c.ok(ride.liftPrompt && ride.liftRiding, 'E no elevador: começa a subir (o jogador fica na cabine)');
        c.ok(ride.liftTop.walk && ride.liftTop.h === 11 && !ride.liftTop.frozen && ride.cab > 11, `elevador chega ao terraço (${JSON.stringify(ride.liftTop)})`);
        c.ok(ride.liftDownPrompt && !ride.liftBottom.walk && ride.liftBottom.h === 0, `e desce até o chão (${JSON.stringify(ride.liftBottom)})`);
        c.ok(ride.trainPrompt && ride.trainMid.h > 2 && ride.trainMid.h < 14, `trem subindo a encosta (${JSON.stringify(ride.trainMid)})`);
        c.ok(ride.trainTop.walk && ride.trainTop.h === 16, `trem chega à estação do alto (${JSON.stringify(ride.trainTop)})`);
        c.ok(!ride.trainBottom.walk && ride.trainBottom.h === 0, `e desce de volta ao pé (${JSON.stringify(ride.trainBottom)})`);
        c.ok(ride.shuttle > 3, `sem passageiro, o trem vai e volta (${ride.shuttle.toFixed(1)} u)`);

        // no quadro: o mirante com o Cristo; no mapa: o complexo
        const px = await page.evaluate(async () => {
            const pl = game.player, C = Corcovado, top = C.W(2, -12);
            pl.teleport(new BABYLON.Vector3(top[0], 0, top[1])); pl.enterWalk(C.net, top[0], top[1], 18);
            game.dayNight.hour = 12; game.dayNight.apply();
            for (let i = 0; i < 8; i++) await new Promise((res) => setTimeout(res, 150));
            const statue = game.scene.getMeshByName('cristoRedentor');
            const active = game.scene.getActiveMeshes().data.includes(statue);
            const cv = document.createElement('canvas'); cv.width = cv.height = 64;
            const g = cv.getContext('2d');
            MapRenderer.drawView(g, 64, 64, C.C.x, C.C.z - 8, 4, { budget: 1e4 });
            const d = g.getImageData(32, 32, 1, 1).data;
            return { active, map: [d[0], d[1], d[2]], camY: game.camera.focus.z - pl.position.z };
        });
        c.ok(px.active, 'o Cristo está no quadro de quem está no mirante');
        c.ok(px.map[0] > 180 && px.map[1] > 170, `no mapa, o piso claro do mirante (${px.map})`);
        c.noErrors(errors, 'Corcovado');
        await close();
    },
};
