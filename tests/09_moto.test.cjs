// Moto e bicicleta: arrancada e freio realistas (Vehicle.accelOf), a curva que a inclinação aguenta (Config.vehicle.bikeLat), e o
// piloto COLADO na moto — no banco já deitado, no mesmo ângulo dela e na direção desenhada mais perto do rumo (RiderActor, rideBank).
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'moto',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);

        // 1) arrancada e freio de cada modelo (integrado com a mesma conta do Vehicle.drive)
        const acc = await page.evaluate(() => {
            const out = {};
            for (const [id, spec] of Object.entries(Bikes.MODELS)) {
                let v = 0, t = 0, t100 = null;
                const dt = 0.005, top = spec.maxSpeed;
                while (t < 40 && v < top - 0.05) { v = Math.min(top, v + Vehicle.accelOf(spec, v, top) * dt); t += dt; if (t100 === null && v >= 27.78) t100 = t; }
                out[id] = { t100: t100 && +t100.toFixed(1), a0: +Vehicle.accelOf(spec, 0, top).toFixed(2), brake: +Vehicle.accelOf(spec, 20, top, -1, true).toFixed(1), hasT: !!spec.t100 };
            }
            return out;
        });
        c.ok(Object.values(acc).every((a) => a.hasT), 'toda moto/bicicleta tem a arrancada do modelo (t100)');
        c.ok(acc.moto.t100 >= 6 && acc.moto.t100 <= 10, `moto de rua: 0–100 em ${acc.moto.t100} s (antes ~1,7 s)`);
        c.ok(acc.moto_esportiva.t100 >= 2.5 && acc.moto_esportiva.t100 <= 4.5, `esportiva: 0–100 em ${acc.moto_esportiva.t100} s (antes ~1 s)`);
        c.ok(acc.bicycle.a0 <= 2, `bicicleta arranca a ${acc.bicycle.a0} m/s² (pedalando)`);
        c.ok(Object.values(acc).every((a) => a.brake <= 11), `freio até ~1 g (${Object.entries(acc).map(([k, a]) => k + ' ' + a.brake).join(', ')})`);

        // 2) os clipes do piloto: moto em 7 degraus de inclinação e 64 direções; bicicleta em 32
        const clips = await page.evaluate(() => {
            const A = NpcArt.atlases.protagonista, M = A && A.data.clips['ride_moto:none'], B = A && A.data.clips['ride_bike:none'];
            const civ = NpcArt.atlases.civil_motoboy && NpcArt.atlases.civil_motoboy.data.clips['ride_moto:none'];
            return { m: M && [M.n, M.dirs], b: B && B.dirs, civ: civ && [civ.n, civ.dirs] };
        });
        c.eq(JSON.stringify(clips.m), '[7,64]', 'piloto (jogador) na moto: 7 degraus de inclinação, 64 direções');
        c.eq(JSON.stringify(clips.civ), '[7,64]', 'piloto (motoboy) na moto: 7 degraus, 64 direções');
        c.eq(clips.b, 32, 'ciclista: 32 direções');

        // 3) no jogo: o jogador numa moto, fazendo uma curva
        const ok = await page.evaluate(() => {
            game.player.invulnerable = true;
            const vm = game.vehicleManager, P = game.player.position, b = vm.vehicles.find((v) => v.isBike && v.spec.bike === 'moto' && !v.controlled && v.visual && v.visual.body && v.visual.body.seat);
            if (!b) return false;
            const s = RoadNet.randomLanePoint(45, { x: P.x, z: P.z, rMin: 0, rMax: 150 });
            game.player.teleport(new BABYLON.Vector3(s.point.x, 0, s.point.z));
            b.teleport(s.point.x, s.point.z, Math.atan2(s.d.dx, s.d.dz));
            b.riderVariant = null; b.mode = 'parked'; b.route = null;
            b.setRider(0); game.player.setVisible(false); b.setControlled(true); game.activeCar = b; game.mode = 'car';
            game.camera.snapTo(b.position);
            window.__b = b; window.__ax = { x: 0, z: 0.5 };
            game.input.getMoveAxis = () => window.__ax;
            return true;
        });
        if (!c.ok(ok, 'achou uma moto para pilotar')) { await close(); return; }
        await gameWait(page, 1.5);
        await page.evaluate(() => { __ax.x = 1; __ax.z = 0.3; });
        const S = [];
        for (let k = 0; k < 4; k++) {
            await gameWait(page, 0.6);
            S.push(await page.evaluate(() => {
                const b = __b, V = b.visual, B = V.body, R = V.rider, St = V.seat, mp = R.mesh.position;
                const bb = B.bank, t = B.tilt, h = B.heading, cb = Math.cos(bb), sb = Math.sin(bb), ct = Math.cos(t), st = Math.sin(t);
                const y1 = St.y * ct - St.z * st, z1 = St.y * st + St.z * ct, x2 = (St.x || 0) * cb + y1 * sb, y2 = -(St.x || 0) * sb + y1 * cb;
                const sx = B.x + x2 * Math.cos(h) + z1 * Math.sin(h), sz = B.z - x2 * Math.sin(h) + z1 * Math.cos(h);
                const D = R.clip.dirs, drawn = (R.dir * Math.PI * 2) / D + (CompassCamera.yaw || 0);
                let dh = drawn - h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
                const n = R.clip.frames, leanFrame = 1 - (2 * R.time) / (n - 1);          // (o degrau desenhado, contínuo: +1 = deitado para a direita)
                return { sp: b.forwardSpeed, lat: b.forwardSpeed * (b._yaw || 0), bank: bb, lean: V._leanV, leanFrame, seat: Math.hypot(sx - mp.x, sz - mp.z), y: Math.abs(B.y - 1.5 + y2 + 0.5 - mp.y), dirErr: Math.abs(dh) * 57.3, step: 360 / D };
            }));
        }
        const last = S[S.length - 1];
        c.ok(S.every((q) => Math.abs(q.lat) <= 8.5 + 0.3), `curva no limite da inclinação (aceleração lateral ${S.map((q) => q.lat.toFixed(1)).join(' / ')} m/s² ≤ 8,5)`);
        c.ok(last.bank > 0.1, `a moto deita para dentro da curva (${(last.bank * 57.3).toFixed(1)}°)`);
        c.ok(S.every((q) => Math.abs(q.bank - q.lean * 0.5) < 0.01), 'moto e piloto no MESMO ângulo (a moto sem a mola que atrasava)');
        c.ok(S.every((q) => Math.abs(q.leanFrame - q.lean) < 0.05), `o piloto desenhado no degrau de inclinação da moto (${S.map((q) => q.leanFrame.toFixed(2) + '/' + q.lean.toFixed(2)).join(' ')})`);
        c.ok(S.every((q) => q.seat < 0.01 && q.y < 0.01), `piloto no banco da moto deitada (erro ${Math.max(...S.map((q) => q.seat)).toFixed(3)} m)`);
        c.ok(S.every((q) => q.dirErr <= q.step * 0.7), `piloto na direção da moto (desvio ${Math.max(...S.map((q) => q.dirErr)).toFixed(1)}°, passo ${last.step.toFixed(1)}°)`);
        c.noErrors(errors, 'moto');
        await close();
    },
};
