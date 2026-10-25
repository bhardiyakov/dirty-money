// Câmera 360° (CompassCamera.turn, Game._look): o botão direito do mouse arrastando (com arma de fogo na mão ele é a mira — aí o do meio
// arrastando gira), o analógico direito (a não ser mirando com LT) e o dedo arrastado no lado direito da tela do celular. A pé ela fica
// para onde foi girada e o andar segue a tela; dirigindo é uma olhada em volta que volta para trás do veículo; nos interiores, norte.
const { boot, gameWait, leave } = require('./lib.cjs');

module.exports = {
    name: 'camera',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx, { outside: false });
        const cam = () => page.evaluate(() => ({ yaw: game.camera.yaw, user: game.camera.userYaw, look: game.camera.lookYaw, cy: CompassCamera.yaw, flat: game.camera.flat }));
        const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
        const K = await page.evaluate(() => ({ mouse: Config.camera.lookMouse, touch: Config.camera.lookTouch, pad: Config.camera.lookPad }));
        // arrasto do mouse com um botão (o centro da tela é o jogo)
        const drag = async (button, dx) => {
            await page.mouse.move(640, 300); await page.mouse.down({ button });
            for (let i = 1; i <= 8; i++) await page.mouse.move(640 + (dx * i) / 8, 300);
            await page.mouse.up({ button });
            await gameWait(page, 0.15);
        };
        await page.evaluate(() => { Tutorial.skip(); game.gps = null; game.player.invulnerable = true; game.player.weapon = 'none'; });

        // 1) dentro da safe house a câmera não gira (a arte é pintada para o norte)
        const in0 = await cam();
        await drag('right', 200);
        const in1 = await cam();
        c.ok(in0.flat && Math.abs(in1.yaw) < 1e-6 && Math.abs(in1.user) < 1e-6, `nos interiores, norte em cima (giro ${in1.yaw.toFixed(3)})`);
        await leave(page);
        await gameWait(page, 0.5);

        // 2) a pé: botão direito arrastando gira (+ = para a direita) e fica; o do meio também
        const a0 = await cam();
        await drag('right', 200);
        const a1 = await cam();
        c.ok(Math.abs(wrap(a1.yaw - a0.yaw) - 200 * K.mouse) < 0.05 && Math.abs(a1.cy - a1.yaw) < 1e-6, `botão direito arrastando 200 px gira ${(wrap(a1.yaw - a0.yaw) * 57.3).toFixed(0)}° (esperado ${(200 * K.mouse * 57.3).toFixed(0)}°)`);
        await gameWait(page, 1);
        const a2 = await cam();
        c.ok(Math.abs(wrap(a2.yaw - a1.yaw)) < 0.01, 'a pé, a câmera fica para onde foi girada');
        await drag('middle', -100);
        const a3 = await cam();
        c.ok(Math.abs(wrap(a3.yaw - a2.yaw) + 100 * K.mouse) < 0.05, `botão do meio arrastando também gira (${(wrap(a3.yaw - a2.yaw) * 57.3).toFixed(0)}°)`);

        // 3) andar segue a tela: W leva para a "frente" da câmera girada (numa rua, com a câmera girada para o rumo dela: nada no caminho)
        const mv = await page.evaluate(() => {
            const P = game.player.position, s = RoadNet.randomLanePoint(30, { x: P.x, z: P.z, rMin: 0, rMax: 150 });
            if (s) { game.player.teleport(new BABYLON.Vector3(s.point.x, 0, s.point.z)); game.camera.snapTo(game.player.position); game.camera.turn(Math.atan2(s.d.dx, s.d.dz) - game.camera.userYaw); }
            const p = game.player.position, f = game.camera.getGroundBasis().forward;
            return { x0: p.x, z0: p.z, f: { x: f.x, z: f.z }, yaw: game.camera.yaw };
        });
        await gameWait(page, 0.3);
        await page.keyboard.down('w'); await gameWait(page, 0.8); await page.keyboard.up('w');
        const mv1 = await page.evaluate(() => ({ x: game.player.position.x, z: game.player.position.z }));
        const dx = mv1.x - mv.x0, dz = mv1.z - mv.z0, dl = Math.hypot(dx, dz) || 1, dot = (dx * mv.f.x + dz * mv.f.z) / dl;
        c.ok(dl > 1 && dot > 0.85, `W anda para cima da TELA girada a ${(mv.yaw * 57.3).toFixed(0)}° (${dl.toFixed(1)} m, alinhado ${dot.toFixed(2)})`);

        // 4) com arma de fogo na mão o botão direito é a mira (não gira); o do meio gira
        await page.evaluate(() => { game.player.weapon = 'pistol'; });
        await gameWait(page, 0.2);
        const g0 = await cam();
        await drag('right', 150);
        const g1 = await cam();
        await drag('middle', 150);
        const g2 = await cam();
        c.ok(Math.abs(wrap(g1.yaw - g0.yaw)) < 0.01, 'com arma de fogo, o botão direito arrastando é a mira (não gira)');
        c.ok(Math.abs(wrap(g2.yaw - g1.yaw) - 150 * K.mouse) < 0.05, 'com arma de fogo, o botão do meio arrastando gira');

        // 5) controle: o analógico direito gira; mirando (LT com a arma) ele aponta e a câmera fica
        await page.evaluate(() => {
            window.__pad = { b: {}, ax: [0, 0, 0, 0] };
            const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', connected: true, mapping: 'standard', index: 0,
                get axes() { return window.__pad.ax; }, get buttons() { return Array.from({ length: 17 }, (_, i) => ({ pressed: !!window.__pad.b[i], value: window.__pad.b[i] ? 1 : 0 })); } };
            window.__padGet = navigator.getGamepads; navigator.getGamepads = () => [pad];
            game.input._lastPadCheck = 0;
        });
        await gameWait(page, 0.2);
        const p0 = await cam();
        await page.evaluate(() => { window.__pad.ax[2] = 1; });
        const tp = await gameWait(page, 0.5);
        await page.evaluate(() => { window.__pad.ax[2] = 0; });
        const p1 = await cam();
        const want = K.pad * tp;
        c.ok(wrap(p1.yaw - p0.yaw) > want * 0.6, `controle: analógico direito → gira ${(wrap(p1.yaw - p0.yaw) * 57.3).toFixed(0)}° em ${tp.toFixed(2)} s`);
        await page.evaluate(() => { window.__pad.b[6] = true; window.__pad.ax[2] = 1; });      // LT + analógico direito
        await gameWait(page, 0.5);
        const p2 = await cam();
        const aim = await page.evaluate(() => ({ src: game.aim.source, stick: game.input.stickAim }));
        await gameWait(page, 0.3);
        const p3 = await cam();
        await page.evaluate(() => { window.__pad.b = {}; window.__pad.ax = [0, 0, 0, 0]; });
        await gameWait(page, 0.3);
        await page.evaluate(() => { navigator.getGamepads = () => []; game.input._lastPadCheck = 0; });
        await gameWait(page, 0.2);
        await page.evaluate(() => { navigator.getGamepads = window.__padGet; game.player.weapon = 'none'; });
        c.ok(aim.stick && aim.src === 'stick' && Math.abs(wrap(p3.yaw - p2.yaw)) < 0.01, `controle: mirando com LT, o analógico direito aponta e a câmera fica (${JSON.stringify(aim)})`);

        // 6) de moto: a olhada em volta volta para trás dela; ao descer, a câmera fica de onde estava
        const rode = await page.evaluate(() => {
            const vm = game.vehicleManager, P = game.player.position;
            const b = vm.vehicles.find((v) => v.isBike && v.spec.bike === 'moto' && !v.controlled && v.visual && v.visual.body && v.visual.body.seat);
            const s = b && RoadNet.randomLanePoint(30, { x: P.x, z: P.z, rMin: 0, rMax: 150 });
            if (!s) return null;
            game.player.teleport(new BABYLON.Vector3(s.point.x, 0, s.point.z));
            b.teleport(s.point.x, s.point.z, Math.atan2(s.d.dx, s.d.dz));
            b.riderVariant = null; b.mode = 'parked'; b.route = null;
            b.setRider(0); game.player.setVisible(false); b.setControlled(true); game.activeCar = b; game.mode = 'car';
            game.camera.snapTo(b.position);
            return { h: Math.atan2(s.d.dx, s.d.dz) };
        });
        if (c.ok(!!rode, 'achou uma moto')) {
            await gameWait(page, 2.5);                                       // (a câmera vai para trás dela)
            const m0 = await cam();
            c.ok(Math.abs(wrap(m0.yaw - rode.h)) < 0.15, `na moto, a câmera vai para trás dela (${(wrap(m0.yaw - rode.h) * 57.3).toFixed(0)}°)`);
            await drag('right', 200);
            const m1 = await cam();
            c.ok(Math.abs(wrap(m1.yaw - m0.yaw) - 200 * K.mouse) < 0.08 && Math.abs(m1.look) > 0.8, `olhada em volta na moto (${(wrap(m1.yaw - m0.yaw) * 57.3).toFixed(0)}°)`);
            // segurando o botão parado: a olhada fica onde está (só volta depois de soltar)
            await page.mouse.move(640, 300); await page.mouse.down({ button: 'right' });
            for (let i = 1; i <= 8; i++) await page.mouse.move(640 + (120 * i) / 8, 300);
            const h0 = await cam();
            await gameWait(page, 3);
            const h1 = await cam();
            await page.mouse.up({ button: 'right' });
            c.ok(Math.abs(wrap(h1.yaw - h0.yaw)) < 0.05 && Math.abs(h1.look) > 1, `segurando o giro parado, a câmera não volta sozinha (${(wrap(h1.yaw - h0.yaw) * 57.3).toFixed(0)}°)`);
            await gameWait(page, 5);                                          // (soltou: espera lookHold e volta suave — a olhada era maior)
            const m2 = await cam();
            c.ok(Math.abs(wrap(m2.yaw - rode.h)) < 0.2, `sem mexer, a câmera volta para trás da moto (${(wrap(m2.yaw - rode.h) * 57.3).toFixed(0)}°)`);
            await drag('right', -150);
            const m3 = await cam();
            await page.evaluate(() => { game._leaveVehicle(); });
            await gameWait(page, 1);
            const m4 = await cam();
            c.ok(Math.abs(wrap(m4.yaw - m3.yaw)) < 0.15 && Math.abs(wrap(m4.user - m3.yaw)) < 0.15, `desceu: a pé, a câmera fica de onde estava (${(m3.yaw * 57.3).toFixed(0)}° → ${(m4.yaw * 57.3).toFixed(0)}°)`);
        }

        // 7) entrar numa loja: norte em cima; sair: a direção de antes
        const before = await cam();
        await page.evaluate(() => { Interiors.index(); const d = Interiors._doors.find((s) => s.style === 'bar') || Interiors._doors[0]; game.player.teleport(new BABYLON.Vector3(d.x, 0, d.z)); Interiors.enter(game, d); });
        await page.waitForFunction(() => Interiors.active && !Interiors.busy, null, { timeout: 60000 }).catch(() => {});
        await gameWait(page, 0.3);
        const shop = await cam();
        await leave(page);
        await gameWait(page, 0.3);
        const after = await cam();
        c.ok(shop.flat && Math.abs(shop.yaw) < 1e-6, 'na loja, norte em cima');
        c.ok(Math.abs(wrap(after.yaw - before.yaw)) < 0.05, `saiu da loja: a câmera volta para onde estava (${(before.yaw * 57.3).toFixed(0)}° → ${(after.yaw * 57.3).toFixed(0)}°)`);
        c.noErrors(errors, 'câmera');
        await close();

        // 8) celular: um dedo arrastado no lado direito gira; no esquerdo é o joystick (não gira); dois dedos = pinça (zoom, não gira)
        const M = await boot(ctx, { touch: true, width: 844, height: 390 });
        const tp2 = M.page;
        await tp2.evaluate(() => { Tutorial.skip(); game.player.invulnerable = true; });
        // (os créditos de abertura — #studio — ainda podem estar por cima, pegando o toque, logo depois de carregar)
        await tp2.waitForFunction(() => { const s = document.getElementById('studio'); return !s || s.classList.contains('out') || getComputedStyle(s).display === 'none'; }, null, { timeout: 30000 }).catch(() => {});
        const cdp = await tp2.context().newCDPSession(tp2);
        const touch = async (fingers) => {                                   // fingers: [[x0, y0, x1, y1], ...]
            const at = (k) => fingers.map((f, i) => ({ x: f[0] + (f[2] - f[0]) * k, y: f[1] + (f[3] - f[1]) * k, id: i + 1 }));
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
            for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i / 8) });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await gameWait(tp2, 0.2);
        };
        const tcam = () => tp2.evaluate(() => ({ yaw: game.camera.yaw, view: game.camera.viewHalf }));
        const t0 = await tcam();
        await touch([[560, 120, 680, 120]]);                                 // lado direito, longe dos botões
        const t1 = await tcam();
        c.ok(Math.abs(wrap(t1.yaw - t0.yaw) - 120 * K.touch) < 0.06, `celular: arrastar no lado direito gira ${(wrap(t1.yaw - t0.yaw) * 57.3).toFixed(0)}° (esperado ${(120 * K.touch * 57.3).toFixed(0)}°)`);
        await touch([[150, 300, 250, 300]]);                                 // lado esquerdo: o joystick
        const t2 = await tcam();
        c.ok(Math.abs(wrap(t2.yaw - t1.yaw)) < 0.01, 'celular: no lado esquerdo (joystick) não gira');
        await touch([[520, 150, 470, 150], [640, 150, 700, 150]]);           // pinça abrindo
        const t3 = await tcam();
        c.ok(Math.abs(wrap(t3.yaw - t2.yaw)) < 0.01 && t3.view < t2.view, `celular: dois dedos dão zoom e não giram (meia-altura ${t2.view.toFixed(1)} → ${t3.view.toFixed(1)})`);
        c.noErrors(M.errors, 'câmera no celular');
        await M.close();
    },
};
