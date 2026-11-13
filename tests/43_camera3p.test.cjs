// CÂMERA EM 3ª PESSOA (core/camera.js, Config.camera.chase / footFollow): dirigindo, a câmera desce para trás do veículo (mais baixa e
// perto, numa inclinação em que os personagens 2,5D ainda ficam bem, com a névoa de distância); A PÉ, a mesma perspectiva, mais perto (`?ape=alto` = a alta
// a pé); `?persegue=0` = a câmera alta de antes em tudo. A pé, andando numa direção
// ela gira sozinha para as costas do personagem — sem mudar para onde ele anda (a base do andar fica travada enquanto a tecla é a mesma).
// Os carros perto da câmera ganham a sombra de contato (CarArt3D._ct).
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'camera3p',
    async run(ctx, c) {
        const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
        // num trecho de rua: o jogador ali e um carro parado na faixa, virado para o rumo dela
        const place = () => {
            Tutorial.skip(); game.gps = null; game.player.invulnerable = true; Config.time.cycleSeconds = 1e12; game.dayNight.hour = 14; game.dayNight.apply();
            const P = game.player.position, R0 = Math.random; let sd = 4242;
            Math.random = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
            let s = null; for (let k = 0; k < 40 && !s; k++) s = RoadNet.randomLanePoint(20, { x: P.x, z: P.z, rMin: 0, rMax: 200 });
            Math.random = R0;
            game.player.teleport(new BABYLON.Vector3(s.point.x, 0, s.point.z)); game.camera.snapTo(game.player.position);
            return { x: s.point.x, z: s.point.z, h: Math.atan2(s.d.dx, s.d.dz) };
        };
        const drive = (L) => {
            const b = game.vehicleManager.vehicles.find((v) => !v.isBike && !v.controlled && v.visual && v.visual.lampGeom);
            b.teleport(L.x, L.z, L.h); b.mode = 'parked'; b.route = null;
            game.player.setVisible(false); b.setControlled(true); game.activeCar = b; game.mode = 'car'; game.camera.snapTo(b.position);
            return true;
        };
        const cam = () => page.evaluate(() => {
            const C = game.camera, cam = C.camera, v = game.mode === 'car' && game.activeCar;
            const uv = v ? C.screenUV(v.position.x, v.position.z, 1) : null;
            return { chase: C.chase, tilt: C.tiltDeg, want: Config.camera.chase.tilt, y: cam.position.y - (C.lift || 0), v: uv ? uv.v : null, fog: game.gameEngine.scene.fogDensity, ct: CarArt3D._ct ? CarArt3D._ct.n : 0 };
        });

        let { page, errors, close } = await boot(ctx, { query: process.env.Q || '' });
        const L = await page.evaluate(place);
        await page.evaluate(drive, L);
        await gameWait(page, 3, 90000);
        const d = await cam();
        c.ok(d.chase > 0.97 && Math.abs(d.tilt - d.want) < 1.5, `dirigindo, a câmera desce para trás do carro (perseguição ${d.chase.toFixed(2)}, inclinação ${d.tilt.toFixed(1)}° — a dela: ${d.want}°)`);
        c.ok(d.y < 16 && d.v > 0.55 && d.v < 0.95, `mais baixa e perto: a ${d.y.toFixed(1)} m do chão, o carro na metade de baixo da tela (v ${d.v && d.v.toFixed(2)})`);
        c.ok(d.fog < -500, 'névoa de distância (do olho) na perseguição');
        c.ok(d.ct >= 1, `sombra de contato debaixo dos carros perto (${d.ct})`);
        // desce do carro: a pé, a MESMA perspectiva (Config.camera.chase.foot) — atrás do personagem, na mesma inclinação, mais perto
        await page.evaluate(() => { const b = game.activeCar; b.setControlled(false); game.activeCar = null; game.mode = 'player'; game.player.setVisible(true); game.player.teleport(new BABYLON.Vector3(b.position.x + 3, 0, b.position.z)); });
        await gameWait(page, 4, 120000);
        const f = await cam(), fp = await page.evaluate(() => { const C = game.camera, uv = C.screenUV(game.player.position.x, game.player.position.z, 1); return { v: uv.v, d: C.dist }; });
        const fp3 = await page.evaluate(() => FootCamera.pitchDeg);
        c.ok(f.chase === 1 && Math.abs(f.tilt - fp3) < 0.5 && f.fog < -500, `a pé, a câmera de 3ª pessoa: perseguição ${f.chase.toFixed(2)}, olhar a ${f.tilt.toFixed(1)}° (a dela: ${fp3}°, independente da de dirigir)`);
        c.ok(f.y < 16 && fp.v > 0.5 && fp.v < 0.95 && fp.d < d.y / Math.sin(d.tilt * Math.PI / 180) + 1, `a pé, atrás e perto: a ${f.y.toFixed(1)} m do chão, o personagem na metade de baixo da tela (v ${fp.v.toFixed(2)})`);

        // a pé (3ª pessoa, FootCamera): segurar "direita" (D) — ele anda para a direita da tela e a câmera vai aos poucos para as costas dele,
        // sem ele mudar de rumo (a base do andar fica travada enquanto ele segura a mesma direção)
        const s0 = await page.evaluate((L) => {
            game.player.teleport(new BABYLON.Vector3(L.x, 0, L.z)); game.camera.snapTo(game.player.position);
            game.camera.turn(wrapA(L.h - Math.PI / 2 - game.camera.userYaw)); game.camera._lookIdle = 9; FootCamera.idle = 9;
            function wrapA(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
            return { yaw: game.camera.yaw };
        }, L);
        await page.keyboard.down('d');
        // (tetos reais folgados: com os bonecos 3D o navegador de teste — desenho por software — chega a ~1 quadro/s; o que se mede são
        // os segundos de JOGO)
        await gameWait(page, 0.6, 90000);
        const w0 = await page.evaluate(() => Math.atan2(game.player.velocity.x, game.player.velocity.z));
        await gameWait(page, 3, 420000);
        const w1 = await page.evaluate(() => ({ h: Math.atan2(game.player.velocity.x, game.player.velocity.z), yaw: game.camera.yaw, sp: game.player.speed }));
        await page.keyboard.up('d');
        c.ok(Math.abs(wrap(w1.h - w0)) < 0.15, `segurando a mesma tecla, o rumo não muda com a câmera girando (${(wrap(w1.h - w0) * 57.3).toFixed(0)}°)`);
        c.ok(Math.abs(wrap(w1.yaw - w1.h)) < 0.2 && Math.abs(wrap(s0.yaw - w1.h)) > 1, `a câmera foi para as costas dele (de ${(wrap(s0.yaw - w1.h) * 57.3).toFixed(0)}° para ${(wrap(w1.yaw - w1.h) * 57.3).toFixed(0)}°)`);
        // entrando numa loja vindo da câmera de perseguição a pé: a câmera de cima e os personagens SEM a névoa de distância (eles ficavam
        // todos da cor do céu — a névoa ficava ligada nos personagens, cujo relógio só anda lá fora)
        await page.evaluate(() => { Interiors.index(); const dd = Interiors._doors.find((s) => s.style === 'conv') || Interiors._doors[0]; game.player.teleport(new BABYLON.Vector3(dd.x, 0, dd.z)); Interiors.enter(game, dd); });
        await gameWait(page, 1.5, 60000);
        const inn = await page.evaluate(() => ({ flat: game.camera.flat, chase: game.camera.chase, fog: NpcArt._fogP.z, i3d: Interiors.is3d }));
        // (sala 3D — art/Interior3D.js: a câmera de 3ª pessoa também lá dentro; a sala pintada: a de cima, sem perseguição nem névoa)
        if (inn.i3d) c.ok(!inn.flat && inn.chase > 0.5, `dentro da loja 3D: câmera de 3ª pessoa atrás dele (${JSON.stringify(inn)})`);
        else c.ok(inn.flat && inn.chase === 0 && inn.fog === 0, `dentro da loja: câmera de cima, sem perseguição nem névoa nos personagens (${JSON.stringify(inn)})`);
        c.noErrors(errors, 'camera3p');
        await close();

        // ?persegue=0: dirigindo, a câmera alta de antes
        ({ page, errors, close } = await boot(ctx, { query: 'persegue=0' }));
        const L2 = await page.evaluate(place);
        await page.evaluate(drive, L2);
        await gameWait(page, 2, 60000);
        const o = await cam();
        c.ok(o.chase === 0 && Math.abs(o.tilt - 56) < 0.5, `?persegue=0: a câmera alta de antes também dirigindo (${o.tilt.toFixed(1)}°)`);
        // e a pé também (a perseguição desligada inteira)
        await page.evaluate(() => { const b = game.activeCar; b.setControlled(false); game.activeCar = null; game.mode = 'player'; game.player.setVisible(true); });
        await gameWait(page, 2, 60000);
        const oa = await cam();
        c.ok(oa.chase === 0, `?persegue=0: a pé, a câmera alta (perseguição ${oa.chase.toFixed(2)})`);
        c.noErrors(errors, 'camera3p ?persegue=0');
        await close();
    },
};
