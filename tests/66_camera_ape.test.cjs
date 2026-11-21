// CÂMERA A PÉ DEPOIS DO VEÍCULO: dirigindo, o balanço inclina a câmera nas curvas (roll). O Babylon só refaz o "para cima" da câmera
// quando esse roll MUDA — descendo do carro com ele voltando a 0, o "para cima" ficava preso no rumo daquele instante e, quando a câmera
// a pé girava, a imagem inteira ficava TORTA até dirigir de novo. Agora: (1) a câmera recalcula o "para cima" a cada quadro (a tela nunca
// fica inclinada a pé, girando para onde for); (2) ficar a pé (descer, pular do carro em movimento) ZERA a câmera como no começo do jogo
// (CompassCamera.resetFoot): o norte em cima (suave), a altura do olhar padrão, sem balanço, sem adianto, sem o zoom da velocidade.
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'camera_ape',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        page.setDefaultTimeout(0);
        await page.evaluate(() => {
            Tutorial.skip(); if (Interiors.active) Interiors.leave(game); Interiors.autoEnter = () => {};
            Config.time.cycleSeconds = 1e12; game.player.invulnerable = true; Weather.cur.set('clear', true, true);
            game.gameEngine.engine.stopRenderLoop();
            window.__step = (n, keys = {}) => {
                const inp = game.input;
                for (const k of ['w', 'a', 's', 'd', ' ']) inp.keys[k] = !!keys[k];
                for (let i = 0; i < n; i++) { game._update(1 / 60); game.scene.getPhysicsEngine()._step(1 / 60); if (typeof Vehicle !== 'undefined') Vehicle.physFrame++; }
                for (const k of ['w', 'a', 's', 'd', ' ']) inp.keys[k] = false;
            };
            // a inclinação real da IMAGEM: o "para cima" da vista contra o horizontal (0 = reta; seno do ângulo)
            window.__tiltOf = () => {
                const cam = game.camera.camera, inv = cam.getViewMatrix(true).clone().invert();
                const u = BABYLON.Vector3.TransformNormal(BABYLON.Axis.Y, inv), f = BABYLON.Vector3.TransformNormal(BABYLON.Axis.Z, inv);
                return BABYLON.Vector3.Dot(u, BABYLON.Vector3.Cross(BABYLON.Axis.Y, f).normalize());
            };
            window.__cam = () => { const C = game.camera, cam = C.camera; return { yaw: C.yaw, rotX: cam.rotation.x, fov: cam.fov, tilt: C.tiltDeg, roll: C.roll, lead: C.lead, bounce: C.bounceMul, pitch: FootCamera.pitch, userYaw: C.userYaw, chFoot: C._chFoot, resets: C.resets || 0, img: __tiltOf() }; };
            // entra num carro perto e dirige fazendo curvas (o balanço inclina a câmera)
            window.__drive = () => {
                const g = game, P = g.player.position;
                const car = g.vehicleManager.vehicles.filter((v) => !v.isBike && !v.spec.boat && !v.isChopper && !v.controlled && !v.destroyed)
                    .sort((a, b) => Math.hypot(a.position.x - P.x, a.position.z - P.z) - Math.hypot(b.position.x - P.x, b.position.z - P.z))[0];
                if (!car) return null;
                g.player.teleport(new BABYLON.Vector3(car.position.x + 2, 0, car.position.z)); car.mode = 'parked'; car.route = null;
                g.player.setVisible(false); car.setControlled(true); g.activeCar = car; g.mode = 'car';
                car.hp = car.maxHp; car.fuel = car.tank; car.engineDead = false; car.hotwire = 0; car._ccOff = false; if (car.cond) { car.cond.battery = 1; car.cond.engine = 1; car.cond.temp = 0; }
                let maxRoll = 0;
                const seg = (n, k) => { for (let i = 0; i < n; i += 5) { __step(5, k); maxRoll = Math.max(maxRoll, Math.abs(game.camera.roll)); } };
                seg(60, {}); seg(150, { w: true }); seg(90, { w: true, a: true }); seg(60, { w: true, d: true });
                return { car, id: car.spec.id, maxRoll, yaw: game.camera.yaw, img: __tiltOf() };
            };
        });
        await page.evaluate(() => __step(120));
        const foot0 = await page.evaluate(() => __cam());
        c.ok(Math.abs(foot0.img) < 1e-3, `a pé, no começo: imagem reta (${foot0.img.toFixed(5)})`);

        // ------------------------------------------------------------------ descer do carro
        const d1 = await page.evaluate(() => { const r = __drive(); if (!r) return null; window.__car = r.car; delete r.car; return r; });
        if (!d1) { c.ok(false, 'nenhum carro por perto'); await close(); return; }
        c.ok(d1.maxRoll > 0.003, `${d1.id}: dirigindo, a câmera inclina nas curvas (roll até ${d1.maxRoll.toFixed(3)} rad)`);
        const ex = await page.evaluate(() => {
            const r0 = game.camera.resets || 0;
            game._leaveVehicle(); __step(1);
            const a = __cam(); a.newResets = a.resets - r0;
            const imgs = [];
            for (let k = 0; k < 8; k++) { __step(15); imgs.push(__tiltOf()); }
            // gira a câmera a pé para vários lados (era aqui que a imagem tombava)
            for (const d of [1.3, -2.4, 0.9, 2.2]) { game.camera.turn(d); __step(20); imgs.push(__tiltOf()); }
            game.camera.resetNorth(); __step(150);
            return { a, imgs, b: __cam() };
        });
        const worst = Math.max(...ex.imgs.map(Math.abs));
        c.ok(ex.a.newResets === 1, `ao descer a câmera a pé é zerada uma vez (${ex.a.newResets})`);
        c.ok(Math.abs(ex.a.roll) < 1e-6 && Math.abs(ex.a.lead) < 1e-6 && Math.abs(ex.a.bounce - 1) < 1e-6 && ex.a.pitch === null && ex.a.userYaw === 0 && ex.a.chFoot,
            `zerada na hora: sem inclinação (${ex.a.roll}), sem adianto (${ex.a.lead.toFixed(3)}), sem balanço (${ex.a.bounce}), olhar padrão (${ex.a.pitch}), rumo do começo (${ex.a.userYaw})`);
        c.ok(worst < 1e-3, `a pé depois do carro a imagem fica reta, mesmo girando a câmera (pior: ${worst.toFixed(5)})`);
        c.ok(Math.abs(ex.b.yaw) < 0.01 && Math.abs(ex.b.rotX - foot0.rotX) < 0.01 && Math.abs(ex.b.fov - foot0.fov) < 0.02 && Math.abs(ex.b.tilt - foot0.tilt) < 0.2,
            `e volta ao enquadramento do começo: rumo ${ex.b.yaw.toFixed(3)}, inclinação ${ex.b.tilt.toFixed(1)}° (era ${foot0.tilt.toFixed(1)}°), campo ${ex.b.fov.toFixed(3)} (era ${foot0.fov.toFixed(3)})`);

        // ------------------------------------------------------------------ pular do carro em movimento
        const bj = await page.evaluate(() => {
            const r = __drive(); if (!r) return null;
            const car = r.car, r0 = game.camera.resets || 0;
            __step(40, { w: true });
            game._bail(car, Math.max(8, car.speed || 0)); __step(1);
            const a = __cam(); const imgs = [];
            for (let k = 0; k < 6; k++) { game.camera.turn(0.7); __step(20); imgs.push(__tiltOf()); }
            return { resets: a.resets - r0, roll: a.roll, pitch: a.pitch, worst: Math.max(...imgs.map(Math.abs)) };
        });
        if (bj) c.ok(bj.resets >= 1 && Math.abs(bj.roll) < 1e-6 && bj.worst < 1e-3, `pulando do carro em movimento: zerada (${bj.resets}) e reta girando (${bj.worst.toFixed(5)})`);

        // dirigindo, a inclinação das curvas continua (o balanço não foi desligado)
        const again = await page.evaluate(() => { const r = __drive(); if (!r) return null; delete r.car; return r; });
        if (again) c.ok(again.maxRoll > 0.003, `entrando de novo, o balanço das curvas continua (${again.maxRoll.toFixed(3)} rad)`);
        c.noErrors(errors, 'camera_ape');
        await close();
    },
};
