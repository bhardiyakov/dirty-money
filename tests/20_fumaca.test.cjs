// Fumaça e água dos veículos (CarLights / PuffSystem / SkidMarks): a fumaça do escapamento nasce na boca do cano (carro 3D: embaixo
// do para-choque, à esquerda — CarArt3D.lampGeom ex/ey/ez), também no carro do jogador pego estacionado; é um billboard macio (sem
// disco recortado). Na chuva os pneus levantam ÁGUA (jorros da WaterSpray e gotas), não fumaça — carro, moto e bicicleta — e o pneu
// cantando no asfalto molhado espirra água em vez de soltar fumaça.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'fumaca',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        await page.evaluate(() => { Tutorial.skip(); Weather.cur.set('clear', true, true); });
        const car = await page.evaluate(() => {
            const vm = game.vehicleManager, P = game.player.position;
            const b = vm.vehicles.find((v) => !v.isBike && v.visual && v.visual.lampGeom && v.visual.lampGeom.ex != null && !v.controlled);
            if (!b) return null;
            const s = RoadNet.randomLanePoint(30, { x: P.x, z: P.z, rMin: 0, rMax: 200 });
            game.player.teleport(new BABYLON.Vector3(s.point.x, 0, s.point.z));
            b.teleport(s.point.x, s.point.z, Math.atan2(s.d.dx, s.d.dz)); b.mode = 'parked'; b.route = null;
            game.player.setVisible(false); b.setControlled(true); game.activeCar = b; game.mode = 'car'; game.camera.snapTo(b.position);
            for (const q of game.carLights.puffs.p) q.on = false;
            return true;
        });
        if (c.ok(!!car, 'achou um carro 3D')) {
            await gameWait(page, 0.3, 30000);
            // Quadro a quadro (requestAnimationFrame) até aparecer a baforada recém-saída (até 0,15 s) perto da boca do cano. Olhar num
            // instante qualquer não serve: na marcha lenta sai uma a cada 0,19–0,31 s e, com o Chromium lento no fim da bateria, um
            // quadro passa de 0,1 s — a mais nova podia já ter mais de 0,3 s e o teste falhava sem nada errado.
            const ex = await page.waitForFunction(() => {
                const b = game.activeCar, G = b.visual.lampGeom, f = b.fwdToRef(new BABYLON.Vector3()), rx = f.z, rz = -f.x;
                const X = b.position.x + f.x * G.ez + rx * G.ex, Z = b.position.z + f.z * G.ez + rz * G.ex;
                // a baforada nova mais perto da boca do cano — a mais nova de todas pode ser de outro carro por perto
                const near = (q) => Math.hypot(q.x - X, q.z - Z);
                const young = game.carLights.puffs.p.filter((q) => q.on && q.age < 0.15).sort((a, q) => near(a) - near(q))[0];
                return young && near(young) < 1.5 ? { d: near(young), y: young.y, ey: G.ey, age: young.age, n: game.carLights.puffs.live } : null;
            }, null, { polling: 'raf', timeout: 30000 }).then((h) => h.jsonValue()).catch(() => null);
            c.ok(!!ex, 'o carro do jogador (pego estacionado, motor ligado) solta fumaça do escapamento');
            if (ex) c.ok(ex.d < 0.6 && Math.abs(ex.y - ex.ey) < 0.3, `a fumaça sai da boca do cano (${ex.d.toFixed(2)} m dela, altura ${ex.y.toFixed(2)}/${ex.ey.toFixed(2)} m)`);
            c.ok(await page.evaluate(() => game.carLights.puffs.mesh.material.getClassName() === 'ShaderMaterial' && !!BABYLON.Effect.ShadersStore.smokePuffFragmentShader), 'fumaça desenhada pelo shader macio (billboard)');
        }
        // chuva: água, não fumaça
        const rain = await page.evaluate(() => {
            Weather.cur.set('storm', true, true);
            const P = game.player.position, sp = game.waterFx.spray, pf = game.carLights.puffs;
            const before = { s: sp.live, p: pf.live };
            for (let i = 0; i < 40; i++) SkidMarks.smoke(game, P.x, P.z, 8, 0, 0.95);
            return { spray: sp.live - before.s, puffs: pf.live - before.p };
        });
        c.ok(rain.spray > 0 && rain.puffs === 0, `pneu cantando no molhado espirra água, sem fumaça (${rain.spray} jorros, ${rain.puffs} baforadas)`);
        await gameWait(page, 2.5, 60000);
        const moving = await page.evaluate(() => {
            const out = {};
            for (const kind of ['car', 'moto', 'bike']) {
                const vm = game.vehicleManager, P = game.player.position;
                let b = vm.vehicles.find((v) => !v.controlled && (kind === 'car' ? !v.isBike && !v.spec.boat : kind === 'moto' ? v.isBike && v.spec.bike !== 'bike' : v.spec.bike === 'bike'));
                if (!b && kind !== 'car') { game.traffic._spawnBike(kind === 'bike' ? 'bicycle' : 'moto', 'parked', null, { x: P.x, z: P.z, rMin: 0, rMax: 400 }); b = vm.vehicles.find((v) => !v.controlled && (kind === 'moto' ? v.isBike && v.spec.bike !== 'bike' : v.spec.bike === 'bike')); }
                if (!b) { out[kind] = null; continue; }
                const sp = game.waterFx.spray, n0 = sp.live, pf = game.carLights.puffs, f = b.fwdToRef(new BABYLON.Vector3());
                const v = b.velocity, vx = v.x, vz = v.z, mode = b.mode, pos = b.position.clone();
                b.mode = 'drive'; b.velocity.x = f.x * 9; b.velocity.z = f.z * 9;
                game.camera.snapTo(b.position);
                const s = game.carLights._slots(b); s.sprayT = 0;
                const tint0 = pf.p.filter((q) => q.on && q.c && q.c[2] > 0.99 && q.c[0] < 0.9).length;
                game.carLights.update(0.02, 0, b.position, [b]);
                const tint1 = pf.p.filter((q) => q.on && q.c && q.c[2] > 0.99 && q.c[0] < 0.9).length;
                out[kind] = { spray: sp.live > n0 || sp.p.some((q) => q.on && Math.hypot(q.x - b.position.x, q.z - b.position.z) < 4), blueSmoke: tint1 - tint0 };
                b.velocity.x = vx; b.velocity.z = vz; b.mode = mode; b.position.copyFrom(pos);
            }
            return out;
        });
        for (const k of ['car', 'moto', 'bike']) {
            const m = moving[k];
            if (c.ok(!!m, `achou ${k}`)) c.ok(m.spray && m.blueSmoke === 0, `${k} na chuva levanta jorros de água (não fumaça azulada)`);
        }
        c.noErrors(errors, 'fumaca');
        await close();
    },
};
