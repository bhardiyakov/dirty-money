// Bicicleta: não tem motor nem lataria — batida não a estraga e ela nunca solta a fumaça de motor (CarDamage._smoke); só quem cai é o
// ciclista. Um carro, na mesma batida, perde vida.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'bicicleta',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        await gameWait(page, 1);
        const r = await page.evaluate(() => {
            const vm = game.vehicleManager;
            let b = vm.vehicles.find((v) => v.isBike && v.spec.bike === 'bike');
            const pl = game.player;
            for (let i = 0; i < 20 && !b; i++) { game.traffic._spawnBike('bicycle', 'parked', null, { x: pl.position.x, z: pl.position.z, rMin: 0, rMax: 400 }); b = vm.vehicles.find((v) => v.isBike && v.spec.bike === 'bike'); }
            const car = vm.vehicles.find((v) => !v.isBike && !v.destroyed);
            if (!b || !car) return null;
            const hp0 = b.hp, c0 = car.hp;
            for (let i = 0; i < 6; i++) { b._crashCd = 0; b._impact(Config.crash.minDv + 9, 1, 0); }
            car._impact(Config.crash.minDv + 9, 1, 0);
            const hp1 = b.hp;
            b.hp = b.maxHp * 0.1;                                            // (mesmo muito estragada por tiro: sem fumaça de motor)
            b._smokeT = 0; let smoked = false;
            const sm = game.carDamage && game.carDamage._smoke;
            if (sm) { game.carDamage._smoke = function (cc) { if (cc === b) smoked = true; return sm.apply(this, arguments); }; game.carDamage.update(0.1); game.carDamage._smoke = sm; }
            return { hp0, hp1, crashHp: car.hp < c0, smoked, hasDmg: !!sm };
        });
        if (c.ok(!!r, 'achou uma bicicleta e um carro')) {
            c.ok(r.hasDmg, 'CarDamage do jogo encontrado');
            c.ok(r.crashHp, 'o carro perde vida na batida');
            c.ok(r.hp1 === r.hp0, 'seis batidas fortes seguidas não tiram vida da bicicleta');
            c.ok(!r.smoked, 'bicicleta não solta fumaça de motor');
        }
        const hit = await page.evaluate(() => {
            const b = game.vehicleManager.vehicles.find((v) => v.isBike && v.spec.bike === 'bike');
            b.hp = b.maxHp; b._crashCd = 0; b._impact(Config.crash.minDv + 12, 1, 0);
            return { hp: b.hp, max: b.maxHp };
        });
        c.ok(hit.hp === hit.max, `batida forte não estraga a bicicleta (${hit.hp}/${hit.max})`);
        c.noErrors(errors, 'bicicleta');
        await close();
    },
};
