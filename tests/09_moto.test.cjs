// Moto e bicicleta: arrancada e freio realistas (Vehicle.accelOf), a curva que a inclinação aguenta (Config.vehicle.bikeLat), e o
// piloto COLADO na moto — no banco já deitado, no mesmo ângulo dela e na direção desenhada mais perto do rumo (RiderActor, rideBank) —,
// com os pés nas pedaleiras da moto 3D, os joelhos fechados no tanque e o desenho recortado pela carroceria (o que ela esconde daquele
// ângulo não é desenhado por cima dela: NpcGenRender pose.occ). Scooter: o clipe dela (pés no assoalho).
const fs = require('fs'), path = require('path'), vm = require('vm');
const { boot, gameWait } = require('./lib.cjs');

// O gerador dos personagens no Node (como o tools/asset_baker/bake.cjs: a mesma lista de arquivos).
function loadGen() {
    const dir = path.join(__dirname, '..', 'tools', 'asset_baker');
    const GEN = JSON.parse(fs.readFileSync(path.join(dir, 'bake.cjs'), 'utf8').match(/const GEN = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
    const cx = vm.createContext({ atob, console, Math, Float32Array, Float64Array, Int8Array, Int16Array, Int32Array, Uint8Array, Uint16Array, Uint32Array, Uint8ClampedArray });
    for (const f of GEN) vm.runInContext(fs.readFileSync(path.join(dir, 'generator', f), 'utf8'), cx, { filename: f });
    return vm.runInContext('(() => { const G = {}; NpcGenCore(G); NpcGenChar(G); NpcGenRender(G); NpcGenAnims(G); NpcGenTypes(G); NpcGenBuild(G); NpcGenMesh(G); return G; })()', cx);
}

module.exports = {
    name: 'moto',
    async run(ctx, c) {
        // 0) no gerador: a pose de pilotar casa com a malha da moto 3D (a CG 160 — assets/cars/veiculos3d.js, × Config.vehicle.scale ×
        // Bikes.SCALE = 1,17) e o recorte esconde o que a moto cobre
        const G = loadGen(), occ = G.vehOcc('moto');
        c.ok(!!occ, 'o gerador tem as carrocerias 3D para recortar o piloto (generator/veiculos_occ.js)');
        if (occ) {
            const R = G.rendererFor(G.BY_ID.protagonista, { k: 0.5 }), u = G.PPU / 0.5, K = 1.17, seat = occ.seat;
            const p = G.clipDef('ride_moto', 'none', 'protagonista', {}).poses[3], B = p.adult().B;
            // topo da pedaleira (o apoio do pé): m do modelo → unidades a partir do banco
            let top = -1;
            for (let i = 0; i < occ.P.length; i += 3) { const x = Math.abs(occ.P[i]), y = occ.P[i + 1], z = occ.P[i + 2]; if (x > 0.15 && x < 0.21 && Math.abs(y) < 0.1 && z < 0.45) top = Math.max(top, z); }
            const pegZ = (top - seat[1]) * K * u, pegY = (0 - seat[0]) * K * u;
            const foot = ['R', 'L'].map((sd) => B['foot_' + sd].t), knee = ['R', 'L'].map((sd) => B['shin_' + sd].t);
            const soleErr = Math.max(...foot.map((f) => Math.abs(f[2] - G.ANKLE_H - pegZ))) / u, fwdErr = Math.max(...foot.map((f) => Math.abs(f[1] + 3 - pegY))) / u;
            c.ok(soleErr < 0.04 && fwdErr < 0.1, `pés nas pedaleiras da moto 3D (sola ${(soleErr * 100).toFixed(1)} cm, frente ${(fwdErr * 100).toFixed(1)} cm do apoio)`);
            const kx = Math.max(...knee.map((k) => Math.abs(k[0]))) / u;
            c.ok(kx < 0.25, `joelhos fechados no tanque (${(kx * 100).toFixed(0)} cm do meio; a pose antiga abria 29 cm)`);
            const px = (q) => R.render(q, -180).alpha.reduce((a, v) => a + (v > 128 ? 1 : 0), 0);
            const q = G.clipDef('ride_moto', 'none', 'protagonista', {}).poses[3]; q.occ = null;
            const hid = px(q) - px(p);
            c.ok(hid > 15, `de frente, o tanque e o farol escondem o meio das coxas (${hid} px a menos no quadro)`);
        }

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
            const S = A && A.data.clips['ride_scooter:none'];
            return { m: M && [M.n, M.dirs], b: B && B.dirs, civ: civ && [civ.n, civ.dirs], s: S && [S.n, S.dirs] };
        });
        c.eq(JSON.stringify(clips.m), '[7,64]', 'piloto (jogador) na moto: 7 degraus de inclinação, 64 direções');
        c.eq(JSON.stringify(clips.civ), '[7,64]', 'piloto (motoboy) na moto: 7 degraus, 64 direções');
        c.eq(JSON.stringify(clips.s), '[7,64]', 'piloto na scooter: o clipe dela (pés no assoalho), 7 degraus, 64 direções');
        c.eq(clips.b, 32, 'ciclista: 32 direções');
        const sc = await page.evaluate(() => {
            const a = new RiderActor(game.scene, 'moto_scooter', 0);
            a.setRider(0, game.sprites.sheets.rider, 'ride_moto');
            const r = { scooter: a.rider && a.rider.clipName };
            const b = new RiderActor(game.scene, 'moto', 0);
            b.setRider(0, game.sprites.sheets.rider, 'ride_moto');
            r.moto = b.rider && b.rider.clipName;
            a.dispose(); b.dispose();
            return r;
        });
        c.ok(sc.scooter === 'ride_scooter' && sc.moto === 'ride_moto', `scooter toca ride_scooter, moto de rua ride_moto (${sc.scooter} / ${sc.moto})`);

        // 3) no jogo: o jogador numa moto, fazendo uma curva
        const ok = await page.evaluate(() => {
            game.player.invulnerable = true;
            const vm = game.vehicleManager, P = game.player.position, b = vm.vehicles.find((v) => v.isBike && v.spec.bike === 'moto' && !v.controlled && v.visual && v.visual.body && v.visual.body.seat);
            if (!b) return false;
            // A curva precisa de espaço: numa rua qualquer, o muro ou o carro parado do lado acabava a curva numa batida (e as amostras
            // de ré). Vira para o lado (direita +1 / esquerda -1) com a área da curva livre de obstáculos e sem outro veículo perto.
            const hit = (x, z) => CityGrid.obstaclesAround(x, z, 2).some((o) => x > o.x0 - 1.2 && x < o.x1 + 1.2 && z > o.z0 - 1.2 && z < o.z1 + 1.2);
            const clear = (q, side) => {
                const fx = q.d.dx, fz = q.d.dz, rx = fz * side, rz = -fx * side, x0 = q.point.x, z0 = q.point.z;
                if (vm.vehicles.some((v) => v !== b && v.position && Math.hypot(v.position.x - x0, v.position.z - z0) < 22)) return false;
                for (let f = 0; f <= 16; f += 2) for (let l = 0; l <= 12; l += 2) if (hit(x0 + fx * f + rx * l, z0 + fz * f + rz * l)) return false;
                return true;
            };
            let s = null, side = 1, room = false;
            for (let i = 0; i < 120 && !room; i++) {
                const q = RoadNet.randomLanePoint(45, { x: P.x, z: P.z, rMin: 0, rMax: 150 + i * 15 });
                if (!q) continue;
                s = s || q;
                for (const d of [1, -1]) if (!room && clear(q, d)) { s = q; side = d; room = true; }
            }
            if (!s) return false;
            game.player.teleport(new BABYLON.Vector3(s.point.x, 0, s.point.z));
            b.teleport(s.point.x, s.point.z, Math.atan2(s.d.dx, s.d.dz));
            b.riderVariant = null; b.mode = 'parked'; b.route = null;
            b.setRider(0); game.player.setVisible(false); b.setControlled(true); game.activeCar = b; game.mode = 'car';
            game.camera.snapTo(b.position);
            window.__b = b; window.__ax = { x: 0, z: 0.5 }; window.__side = side; window.__room = room;
            game.input.getMoveAxis = () => window.__ax;
            return true;
        });
        if (!c.ok(ok, 'achou uma moto para pilotar')) { await close(); return; }
        await gameWait(page, 1.5);
        const turn = await page.evaluate(() => { __ax.x = __side; __ax.z = 0.3; return { side: __side, room: __room }; });      // (+1 direita, -1 esquerda)
        const S = [];
        for (let k = 0; k < 4; k++) {
            await gameWait(page, 0.6);
            S.push(await page.evaluate(() => {
                const b = __b, V = b.visual, B = V.body, R = V.rider, St = V.seat, mp = R.mesh.position;
                const bb = B.bank, t = B.tilt, h = B.heading, cb = Math.cos(bb), sb = Math.sin(bb), ct = Math.cos(t), st = Math.sin(t);
                const y1 = St.y * ct - St.z * st, z1 = St.y * st + St.z * ct, x2 = (St.x || 0) * cb + y1 * sb, y2 = -(St.x || 0) * sb + y1 * cb;
                const sx = B.x + x2 * Math.cos(h) + z1 * Math.sin(h), sz = B.z - x2 * Math.sin(h) + z1 * Math.cos(h);
                const D = R.clip.dirs, drawn = (R.dir * Math.PI * 2) / D + (R._yaw || 0);      // (o giro da câmera que o sprite usou: no carro ela gira com a moto)
                let dh = drawn - h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
                const n = R.clip.frames, leanFrame = 1 - (2 * R.time) / (n - 1);          // (o degrau desenhado, contínuo: +1 = deitado para a direita)
                const lite = D > 8 && NpcArt.lite ? 2 : 1;                                // (perfil leve: só as direções pares — SpriteActor.setHeading)
                return { back: !!V._back || b.forwardSpeed < 0.3, sp: b.forwardSpeed, lat: b.forwardSpeed * (b._yaw || 0), bank: bb, lean: V._leanV, leanFrame, seat: Math.hypot(sx - mp.x, sz - mp.z), y: Math.abs(B.y - 1.5 + y2 + 0.5 - mp.y), dirErr: Math.abs(dh) * 57.3, step: (360 / D) * lite };
            }));
        }
        const last = S[S.length - 1], R = S.filter((q) => !q.back);                // (bateu e voltou de ré: o piloto desce do banco — RiderActor.walkBack)
        c.ok(R.length >= 2, `pilotando para a frente na curva (${R.length}/${S.length} amostras; curva para a ${turn.side > 0 ? 'direita' : 'esquerda'}${turn.room ? '' : ', sem achar rua com espaço'})`);
        const LAT = await page.evaluate(() => Config.vehicle.bikeLat);
        c.ok(S.every((q) => Math.abs(q.lat) <= LAT + 0.3), `curva no limite da moto (aceleração lateral ${S.map((q) => q.lat.toFixed(1)).join(' / ')} m/s² ≤ ${LAT})`);
        c.ok(S.some((q) => q.bank * turn.side > 0.1 && q.sp > 1), `a moto deita para dentro da curva (${S.map((q) => (q.bank * 57.3).toFixed(1) + '° a ' + (q.sp * 3.6).toFixed(0) + ' km/h').join(', ')})`);
        c.ok(R.every((q) => Math.abs(q.bank - q.lean * 0.5) < 0.01), 'moto e piloto no MESMO ângulo (a moto sem a mola que atrasava)');
        c.ok(R.every((q) => Math.abs(q.leanFrame - q.lean) < 0.05), `o piloto desenhado no degrau de inclinação da moto (${R.map((q) => q.leanFrame.toFixed(2) + '/' + q.lean.toFixed(2)).join(' ')})`);
        c.ok(R.every((q) => q.seat < 0.01 && q.y < 0.01), `piloto no banco da moto deitada (erro ${Math.max(0, ...R.map((q) => q.seat)).toFixed(3)} m)`);
        c.ok(R.every((q) => q.dirErr <= q.step * 0.7), `piloto na direção da moto (desvio ${Math.max(0, ...R.map((q) => q.dirErr)).toFixed(1)}°, passo ${last.step.toFixed(1)}°)`);
        c.noErrors(errors, 'moto');
        await close();
    },
};
