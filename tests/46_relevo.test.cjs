// RELEVO DE VERDADE (map/Relief.js, Config.relief): o morro da favela em 3D — o chão (malhas do mundo e do terreno), as casas
// niveladas, o personagem 2,5D, o carro 3D e a câmera ficam na altura do chão (a física segue no plano); o Corcovado com o Cristo acima
// de 300 m e o Pão de Açúcar alto (etapa 2). `?relevo=0`: tudo plano.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'relevo',
    async run(ctx, c) {
        const probe = (page) => page.evaluate(() => {
            Tutorial.skip(); game.player.invulnerable = true;
            const s = CityGrid.startPos();
            // o ponto mais alto da favela perto do começo (até 220 m)
            let best = null;
            for (let k = 0; k < 400; k++) { const a = k * 2.4, r = (k % 20) * 11, x = s.x + Math.sin(a) * r, z = s.z + Math.cos(a) * r; if (!MapGeo.isLand(x, z)) continue; const h = WorldMap.heightAt(x, z); if (!best || h > best.h) best = { x, z, h }; }
            game.player.teleport(new BABYLON.Vector3(best.x, 0, best.z)); game.camera.snapTo(game.player.position);
            return best;
        });
        const look = (page) => page.evaluate(() => {
            const p = game.player.position, m = game.player.actor.mesh, a = m.getAbsolutePosition();
            // o chão desenhado embaixo dele: um raio de cima nas malhas do mundo/terreno
            const sc = game.gameEngine.scene, ray = new BABYLON.Ray(new BABYLON.Vector3(p.x + 0.3, 400, p.z + 0.3), new BABYLON.Vector3(0, -1, 0), 800);
            const hit = sc.pickWithRay(ray, (q) => /^(world_|terr_)/.test(q.name) && q.isEnabled() && !/veg|trees|shadow/.test(q.name), false);
            return { rel: Relief.at(p.x, p.z), sprite: a.y, cam: game.camera.lift || 0, ground: hit && hit.hit ? hit.pickedPoint.y : null, ground2: hit && hit.pickedMesh && hit.pickedMesh.name };
        });
        let { page, errors, close } = await boot(ctx);
        page.setDefaultTimeout(0);
        const b = await probe(page);
        await gameWait(page, 2, 60000);
        const L = await look(page);
        c.ok(b.h > 8 && Math.abs(L.rel - b.h) < 0.5, `o morro da favela tem altura de verdade (${b.h.toFixed(1)} m)`);
        c.ok(L.ground !== null && Math.abs(L.ground - L.rel) < 1.5, `o chão desenhado está na altura do morro (${L.ground && L.ground.toFixed(1)} m, ${L.ground2})`);
        c.ok(Math.abs(L.sprite - L.rel - 0.5) < 1.2, `o personagem fica no chão do morro (${L.sprite.toFixed(1)} m)`);
        c.ok(Math.abs(L.cam - L.rel) < 1, `a câmera sobe junto (${L.cam.toFixed(1)} m)`);
        // etapa 2: o Corcovado com o Cristo acima de 300 m e o Pão de Açúcar alto
        const M = await page.evaluate(() => {
            const st = game.scene.getMeshByName('cristoRedentor'), pao = game.scene.getMeshByName('paoDeAcucar');
            const top = (m) => { m.computeWorldMatrix(true); m.refreshBoundingInfo(); return m.getBoundingInfo().boundingBox.maximumWorld.y; };
            return { cristo: st ? top(st) : 0, plato: Relief.at(Corcovado.C.x, Corcovado.C.z), pao: pao ? top(pao) : 0, bonde: Landmarks.BONDE.b[2] };
        });
        c.ok(M.plato >= 295 && M.cristo >= 300, `o Cristo no alto do Corcovado: platô a ${M.plato.toFixed(0)} m, o Cristo a ${M.cristo.toFixed(0)} m`);
        c.ok(M.pao >= 100 && M.bonde > M.pao, `o Pão de Açúcar com ${M.pao.toFixed(0)} m e a estação do bondinho no alto (${M.bonde} m)`);
        c.noErrors(errors, 'relevo');
        await close();
        ({ page, errors, close } = await boot(ctx, { query: 'relevo=0' }));
        await probe(page);
        await gameWait(page, 1, 60000);
        const F = await look(page);
        c.ok(F.rel === 0 && F.cam === 0 && Math.abs(F.sprite - 0.5) < 0.6, '`?relevo=0`: o chão plano de antes');
        c.noErrors(errors, 'relevo=0');
        await close();
    },
};
