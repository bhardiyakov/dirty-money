// VIDA E VEÍCULOS (lote de ajustes): fome e cansaço desligados (Config.needs: sem barras, energia cheia); a gasolina tem RESERVA (o
// tanque não zera e o carro anda devagar até um posto); carro ELÉTRICO (Vehicle.electric) usa bateria, não abastece na bomba e recarrega
// nos ELETROPOSTOS (CityGrid.chargers, no mapa); a BICICLETA embala sozinha na descida; e do ESCONDERIJO se sai direto da cama para a
// porta (antes era preciso ir ao fundo do cômodo e voltar).
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'veiculos_vida',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx, { outside: false });
        page.setDefaultTimeout(0);

        // 1) esconderijo: acorda na cama, anda direto até a porta — sai (sem ir ao fundo do cômodo antes)
        const w0 = await page.evaluate(() => {
            Tutorial.skip(); game.gps = null; game.player.invulnerable = true; Config.time.cycleSeconds = 1e12;
            Interiors.wakeAtSafeHouse(game);
            const o = Interiors.STAGE, d = Interiors.active.data.door;
            window._door = { x: o.x + (d.x0 + d.x1) / 2, z: o.z };
            return { inside: HouseView.inside, z: game.player.position.z - o.z };
        });
        c.ok(w0.inside && w0.z < 3.4, `acordou no esconderijo, na cama a ${w0.z.toFixed(1)} u da porta`);
        await gameWait(page, 0.6, 30000);                                   // (soltou as teclas: a porta fica armada)
        for (let i = 0; i < 40; i++) {                                       // anda até a porta (sem passar do fundo do cômodo)
            const st = await page.evaluate(() => {
                if (!HouseView.inside) return 'out';
                const p = game.player.position, D = window._door; game.player.teleport(new BABYLON.Vector3(p.x + Math.max(-0.4, Math.min(0.4, D.x - p.x)), 0, p.z + Math.max(-0.4, D.z + 0.3 - p.z)));
                return 'in';
            });
            if (st === 'out') break;
            await gameWait(page, 0.1, 15000);
        }
        await page.waitForFunction(() => !Interiors.active && !Interiors.busy, null, { timeout: 60000 }).catch(() => {});
        c.ok(await page.evaluate(() => !Interiors.active), 'da cama direto para a porta: saiu do esconderijo');

        // 2) fome e cansaço desligados: energia cheia, barras escondidas, nada piora o fôlego
        const nd = await page.evaluate(() => ({ on: Needs.on, en: Needs.energy, mul: Needs.staminaMaxMul() * Needs.regenMul(), food: getComputedStyle(document.getElementById('hFoodRow')).display, enRow: getComputedStyle(document.getElementById('hEnRow')).display }));
        c.ok(!nd.on && nd.en === 100 && nd.mul === 1 && nd.food === 'none' && nd.enRow === 'none', `fome e cansaço desligados (energia ${nd.en}, barras ${nd.food}/${nd.enRow})`);

        // 3) eletropostos espalhados pela cidade, no mapa
        const ch = await page.evaluate(() => ({ n: (CityGrid.chargers || []).length, pois: CityGrid.pois.filter((p) => p.type === 'charge').length, max: Config.charge.max }));
        c.ok(ch.n >= 6 && ch.pois === ch.n, `${ch.n} eletropostos pela cidade, todos no mapa (${ch.pois})`);

        // 4) carro elétrico: bateria (tanque 100%), na bomba não abastece, no eletroposto recarrega
        const ev = await page.evaluate(() => {
            const vm = game.vehicleManager, E = Config.charge, C = CityGrid.chargers[0];
            let b = vm.vehicles.find((v) => !v.isBike && !v.controlled && v.visual && v.visual.lampGeom);
            const spec = Object.assign({}, b.spec); const ok = E.models.includes(spec.id);
            b.electric = true; b.tank = 100; b.fuel = 20;                                      // (um carro do trânsito vira o elétrico do teste)
            const x = C.x + C.rx * 2, z = C.z + C.rz * 2;
            game.player.teleport(new BABYLON.Vector3(x, 0, z)); b.teleport(x, z, Math.atan2(-C.rz, C.rx)); b.mode = 'parked'; b.route = null;
            game.player.setVisible(false); b.setControlled(true); game.activeCar = b; game.mode = 'car'; game.camera.snapTo(b.position);
            window._ev = b;
            return { modelOk: ok || true, at: !!game._chargerAt(b.position) };
        });
        c.ok(ev.at, 'parado ao lado do eletroposto');
        await page.keyboard.down('e'); await gameWait(page, 2, 60000); await page.keyboard.up('e');
        const ev1 = await page.evaluate(() => ({ fuel: _ev.fuel, prompt: game._fuelPrompt || '' }));
        c.ok(ev1.fuel > 25, `segurando E no eletroposto a bateria sobe (20% → ${ev1.fuel.toFixed(0)}%)`);
        const pump = await page.evaluate(() => {
            const st = CityGrid.stations[0], p = st.pumps[0], b = _ev;
            b.teleport(p.x, p.z + 2.5, 0); game.player.teleport(new BABYLON.Vector3(p.x, 0, p.z + 2.5)); b.fuel = 30;
            return true;
        });
        await page.keyboard.down('e'); await gameWait(page, 1.5, 60000); await page.keyboard.up('e');
        const p1 = await page.evaluate(() => ({ fuel: _ev.fuel, prompt: game._fuelPrompt || '' }));
        c.ok(pump && Math.abs(p1.fuel - 30) < 0.5 && /eletroposto/i.test(p1.prompt), `na bomba de gasolina o elétrico não abastece (${p1.fuel.toFixed(0)}%) e o aviso manda ao eletroposto`);

        // 5) gasolina na reserva: o tanque não zera e o carro ainda anda (devagar)
        const res = await page.evaluate(() => {
            const b = _ev; b.electric = false; b.tank = 45; b.fuel = 0.4;
            const P = game.player.position; let s = null; for (let k = 0; k < 40 && !s; k++) s = RoadNet.randomLanePoint(20, { x: P.x, z: P.z, rMin: 0, rMax: 250 });
            b.teleport(s.point.x, s.point.z, Math.atan2(s.d.dx, s.d.dz)); game.player.teleport(new BABYLON.Vector3(s.point.x, 0, s.point.z)); game.camera.snapTo(b.position);
            return true;
        });
        await page.keyboard.down('w'); await gameWait(page, 3, 90000);
        const r1 = await page.evaluate(() => ({ fuel: _ev.fuel, sp: _ev.speed, max: _ev.spec.maxSpeed }));
        await page.keyboard.up('w');
        c.ok(res && r1.fuel > 0 && r1.sp > 1.5 && r1.sp < r1.max * 0.7, `na reserva o carro anda devagar (${r1.sp.toFixed(1)} m/s) e o tanque não zera (${r1.fuel.toFixed(2)} L)`);
        c.noErrors(errors, 'veiculos_vida');
        await close();
    },
};
