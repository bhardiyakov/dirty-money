// DANO DOS CARROS À LA GTA (vehicle/CarParts.js + art/CarArt3D.js + tools/carros3d/parts.js): cada modelo tem as peças dele (portas,
// capô, porta-malas, para-choques) com a dobradiça no lugar; a porta do modelo abre ao entrar/sair; a batida amassa a região (Vice City:
// exagerado), destrava e arranca peças, quebra farol e lanterna; a explosão arranca o resto; o destroço quica, para e some; o conserto
// devolve tudo; o capô e o porta-malas abrem no E do CarCare. Confere também o shader pronto e nenhum erro.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'dano_carros',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        page.setDefaultTimeout(0);
        await page.evaluate(() => { Tutorial.skip(); game.player.invulnerable = true; Config.time.cycleSeconds = 1e12; game.dayNight.hour = 12; game.dayNight.apply(); game.weather.set('clear', true, true); game.weather.override = 1e9; });
        await gameWait(page, 2, 200000);

        // 1) os modelos: quantos carros têm peças, e as do carro escolhido (o estacionado mais perto)
        const a = await page.evaluate(() => {
            const defs = CarArt3D._defs || {}, ids = Object.keys(defs), withParts = ids.filter((id) => defs[id].parts && Object.keys(defs[id].parts).length >= 3);
            const P = game.player.position, list = game.vehicleManager.vehicles;
            let car = null, bd = 1e9;
            for (const v of list) { if (!v.visual || !v.visual.pa || v.isBike || v.wrecked || v.mode !== 'parked' || !CarParts.parts(v)) continue; const d = Math.hypot(v.position.x - P.x, v.position.z - P.z); if (d < bd) { bd = d; car = v; } }
            if (!car) return { err: 'sem carro estacionado com peças' };
            window.__car = car;
            game.player.teleport(new BABYLON.Vector3(car.position.x + 3.5, 0, car.position.z + 3.5));
            const parts = Object.keys(CarParts.parts(car)).map(Number);
            return { n: ids.length, withParts: withParts.length, model: car.spec.id, parts };
        });
        if (a.err) { c.ok(false, a.err); await close(); return; }
        c.ok(a.withParts >= 30, `modelos com portas/capô/porta-malas/para-choques: ${a.withParts} de ${a.n}`);
        c.ok([7, 9, 10, 13, 14].every((k) => a.parts.includes(k)), `o ${a.model} tem capô, as duas portas da frente e os dois para-choques (${a.parts.join(', ')})`);

        // 2) a porta do modelo abre ao entrar e fecha depois (CarDoors → CarParts)
        await page.evaluate(() => game.doors.set(window.__car, -1, true));
        await gameWait(page, 1.2, 100000);
        const d1 = await page.evaluate(() => window.__car.visual.pa[0]);
        // (a malha do modelo nasce quando o carro aparece na tela: o shader com as peças compilado e pronto)
        const ready = await page.evaluate(() => { const m = CarArt3D._models[window.__car.visual.modelId], e = m && m.mesh.material && m.mesh.material.getEffect(); return !!(e && e.isReady()); });
        c.ok(ready, 'o shader dos carros com as peças está pronto');
        await page.evaluate(() => game.doors.set(window.__car, -1, false));
        await gameWait(page, 1.5, 100000);
        const d2 = await page.evaluate(() => window.__car.visual.pa[0]);
        c.ok(d1 > 0.8 && d2 < 0.05, `a porta do motorista do modelo abre (${d1.toFixed(2)} rad) e fecha (${d2.toFixed(2)})`);

        // 3) batida de frente forte e depois de lado: a região amassa, peças destravam/caem, faróis quebram
        const b = await page.evaluate(() => {
            const car = window.__car, f = car.body.getDirection(BABYLON.Axis.Z);
            game._onCarImpact(car, 12, car.maxHp * 0.45, -f.x * 12, -f.z * 12);
            const S = car._parts, front = { zone: S.zone.slice(), st13: S.st[13], st7: S.st[7], lamps: S.lamps };
            game._onCarImpact(car, 10, car.maxHp * 0.3, -f.z * 10, f.x * 10);
            return { front, zone: S.zone.slice(), debris: CarParts.debris.length, loose: Array.from(S.st).filter((x) => x === 1).length, gone: Array.from(S.st).filter((x) => x === 2).length };
        });
        await gameWait(page, 0.6, 100000);
        const b2 = await page.evaluate(() => { const v = window.__car.visual; return { pc: Array.from(v.pc), gone: v.gone, lampBits: v.lampBits, ib: v.dent }; });
        c.ok(b.front.zone[0] > 0.5 && b.front.zone[1] < 0.05, `a frente amassa e a traseira não (frente ${b.front.zone[0].toFixed(2)}, trás ${b.front.zone[1].toFixed(2)})`);
        c.ok(b.front.st13 >= 1 || b.front.st7 >= 1, `a batida de frente solta o para-choque ou o capô (para-choque ${b.front.st13}, capô ${b.front.st7})`);
        c.ok(b.front.lamps & (32768 | 65536), `os faróis quebram na batida de frente (bits ${b.front.lamps})`);
        c.ok(b.zone[2] + b.zone[3] > 0.3, `a batida de lado amassa a lateral (esq. ${b.zone[2].toFixed(2)}, dir. ${b.zone[3].toFixed(2)})`);
        c.ok(b.loose + b.gone >= 2, `peças soltas ${b.loose} e caídas ${b.gone} depois das duas batidas`);
        c.ok(b2.pc[0] > 0.5 && b2.lampBits > 0 && (b.gone === 0 || b2.gone > 0), `o carro desenha o amassado (${b2.pc.map((x) => x.toFixed(2)).join(', ')}), as peças que caíram (${b2.gone}) e os faróis quebrados (${b2.lampBits})`);

        // 4) a explosão arranca peças: destroços voam, quicam, param e somem (≈10 s)
        const e1 = await page.evaluate(() => { const n0 = CarParts.debris.length; CarParts.explode(window.__car); return { n0, n: CarParts.debris.length, zone: window.__car._parts.zone.slice() }; });
        c.ok(e1.n > e1.n0 && e1.zone.every((z) => z >= 0.5), `a explosão arranca peças (${e1.n0} → ${e1.n} destroços) e amassa tudo (${e1.zone.map((x) => x.toFixed(2)).join(', ')})`);
        await gameWait(page, 3, 150000);
        const e2 = await page.evaluate(() => {
            const D = CarParts.debris, car = window.__car, R = (x, z) => (typeof Relief !== 'undefined' ? Relief.at(x, z) : 0);
            return { n: D.length, still: D.filter((b) => b.still).length, low: D.filter((b) => b.y - R(b.x, b.z) < 1.2).length, drawn: CarArt3D.debris === D };
        });
        c.ok(e2.n > 0 && e2.low === e2.n && e2.drawn, `os destroços caem no chão (${e2.low} de ${e2.n} perto do chão, ${e2.still} parados) e são desenhados`);
        await page.evaluate(() => { for (const b of CarParts.debris) b.t = Math.max(b.t, CarParts.LIFE - 0.3); });
        await gameWait(page, 0.6, 100000);
        const e3 = await page.evaluate(() => CarParts.debris.length);
        c.ok(e3 === 0, `os destroços somem depois de ${10} s (restam ${e3})`);

        // 5) o conserto devolve as peças (carro novo em folha) e o capô abre no E do CarCare
        const r = await page.evaluate(() => {
            const P = game.player.position, list = game.vehicleManager.vehicles;
            let car = null, bd = 1e9;
            for (const v of list) { if (v === window.__car || !v.visual || !v.visual.pa || v.isBike || v.wrecked || v.mode !== 'parked' || !CarParts.parts(v)) continue; const d = Math.hypot(v.position.x - P.x, v.position.z - P.z); if (d < bd) { bd = d; car = v; } }
            if (!car) return { err: 'sem 2º carro' };
            window.__car2 = car;
            const f = car.body.getDirection(BABYLON.Axis.Z);
            game._onCarImpact(car, 12, car.maxHp * 0.4, -f.x * 12, -f.z * 12);
            const hit = car._parts.zone[0];
            car.hp = car.maxHp; car.dent = 0;                              // (o mecânico consertou)
            return { hit };
        });
        if (r.err) c.ok(false, r.err);
        else {
            await gameWait(page, 0.3, 100000);
            const r2 = await page.evaluate(() => { const car = window.__car2, S = car._parts; return { zone: S.zone.slice(), st: Array.from(S.st).reduce((a, b) => a + b, 0), lamps: S.lamps, pc: Array.from(car.visual.pc), gone: car.visual.gone }; });
            c.ok(r.hit > 0.3 && r2.zone.every((z) => z === 0) && r2.st === 0 && r2.lamps === 0 && r2.pc.every((z) => z === 0) && r2.gone === 0, `o conserto devolve as peças e a lataria (amassado ${r.hit.toFixed(2)} → ${r2.zone.join(', ')}, peças fora ${r2.st}, faróis ${r2.lamps})`);
            await page.evaluate(() => { const car = window.__car2; game.player.teleport(new BABYLON.Vector3(car.position.x + 2.5, 0, car.position.z + 2.5)); CarParts.lid(game, car, 'hood'); });
            await gameWait(page, 1.2, 100000);
            const h = await page.evaluate(() => window.__car2.visual.pb[0]);
            c.ok(h > 0.5, `o capô abre no E do CarCare (${h.toFixed(2)} rad)`);
        }
        c.noErrors(errors, 'dano dos carros');
        await close();
    },
};
