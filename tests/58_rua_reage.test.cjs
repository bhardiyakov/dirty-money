// A RUA REAGE (item 5 — npc/StreetReact.js, NPC.dodge, TrafficCar._scared): o pedestre na frente do carro do jogador PULA para fora da
// trajetória depois do tempo de reação (e foge); tarde demais ou travado de susto, não pula; a BUZINA tira da frente na hora e o carro
// parado à frente buzina de volta; o TIRO deixa os motoristas que ouvem em pânico. Lógica em passos fixos (o render fica parado).
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'rua_reage',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        page.setDefaultTimeout(0);
        const ok = await page.evaluate(() => {
            Tutorial.skip(); Config.time.cycleSeconds = 1e12; game.player.invulnerable = true;
            game.gameEngine.engine.stopRenderLoop();
            const vm = game.vehicleManager, car = vm.vehicles.find((v) => !v.isBike && !v.spec.boat && !v.isChopper && !v.controlled && !v.destroyed && !v.role);
            if (!car) return null;
            game.player.setVisible(false); car.setControlled(true); game.activeCar = car; game.mode = 'car';
            window._car = car;
            // põe o carro a `d` m atrás do pedestre `n`, apontado para ele, a `sp` m/s (sem andar: só a velocidade conta para a reação)
            window._aim = (n, d, sp, side = 0) => {
                const a = Math.random() * Math.PI * 2, P = n.position, x = P.x - Math.sin(a) * d + Math.cos(a) * side, z = P.z - Math.cos(a) * d - Math.sin(a) * side;
                car.teleport(x, z, a); const lv = new BABYLON.Vector3(Math.sin(a) * sp, 0, Math.cos(a) * sp); car.phys.setLinearVelocity(lv); car._cmd = lv.clone();
                return a;
            };
            window._still = (n) => { n._dodge = null; n._carSeen = 0; n.setSpeed(0); n.fsm.setState({ name: 'IDLE', update() {} }); };
            window._peds = () => { const P = game.player.position; return game.npcManager.npcs.filter((m) => m.alive && !m.rag && !m.free && m.index >= 0 && !m._rage).sort((a, b) => Math.hypot(a.position.x - P.x, a.position.z - P.z) - Math.hypot(b.position.x - P.x, b.position.z - P.z)); };
            return true;
        });
        if (!c.ok(!!ok, 'um carro para o jogador')) { await close(); return; }

        // --- sai da frente: tenta alguns pedestres (um com espaço dos lados) e confere que pulou, andou de lado e fugiu
        const dg = await page.evaluate(() => {
            const R = Config.react, keep = R.freeze; R.freeze = 0;
            const out = { tries: 0 };
            for (const n of window._peds().slice(0, 8)) {
                out.tries++;
                window._still(n);
                const a = window._aim(n, 16, 15), x0 = n.position.x, z0 = n.position.z, d0 = StreetReact.stats.dodges;
                let t = 0; while (!n._dodge && t < 1.5) { StreetReact._t = 0; StreetReact.update(game, 0.1); t += 0.1; }
                out.react = t; out.started = !!n._dodge && StreetReact.stats.dodges > d0;
                for (let i = 0; i < 30 && n._dodge; i++) n.update(1 / 30);
                const dx = n.position.x - x0, dz = n.position.z - z0;
                out.side = Math.abs(dx * Math.cos(a) - dz * Math.sin(a)); out.along = dx * Math.sin(a) + dz * Math.cos(a);
                out.flee = n.fsm.name === 'FLEE';
                if (out.started && out.side > 1) break;
            }
            R.freeze = keep;
            return out;
        });
        c.ok(dg.started && dg.react >= 0.15 && dg.react <= 0.6, `o carro vindo: o pedestre reage em ${dg.react.toFixed(2)} s (tentativa ${dg.tries})`);
        c.ok(dg.side > 1 && Math.abs(dg.along) < 1, `pula de lado, para fora da trajetória (${dg.side.toFixed(1)} m de lado, ${dg.along.toFixed(1)} m na direção do carro)`);
        c.ok(dg.flee, 'e sai correndo');

        // --- tarde demais / travou / devagar
        const no = await page.evaluate(() => {
            const R = Config.react, out = {}, n = window._peds()[3] || window._peds()[0];
            const run = (d, sp, freeze) => { const k = R.freeze; R.freeze = freeze; window._still(n); window._aim(n, d, sp); for (let t = 0; t < 1.2; t += 0.1) { StreetReact._t = 0; StreetReact.update(game, 0.1); } R.freeze = k; const r = !!n._dodge; n._dodge = null; return r; };
            out.late = run(2.6, 15, 0); out.froze = run(16, 15, 1); out.slow = run(16, 3, 0);
            return out;
        });
        c.ok(!no.late, 'colado no para-choque, não dá tempo de pular');
        c.ok(!no.froze, 'travado de susto (freeze), não pula');
        c.ok(!no.slow, 'carro devagar (manobrando) não assusta');

        // --- buzina: na frente sai na hora; o carro parado à frente buzina de volta
        const hn = await page.evaluate(() => {
            const R = Config.react, out = {}, car = window._car, n = window._peds()[1] || window._peds()[0];
            window._still(n); window._aim(n, 9, 0);
            const h0 = StreetReact.stats.hornDodges; StreetReact.onHorn(game, car);
            out.dodge = StreetReact.stats.hornDodges > h0 && !!n._dodge; n._dodge = null;
            // um carro da cidade parado 10 m à frente, na mesma direção
            const f = car.fwdToRef(new BABYLON.Vector3()), o = game.vehicleManager.vehicles.find((v) => v !== car && !v.isBike && !v.spec.boat && !v.isChopper && !v.controlled && !v.role && v.aiUpdate && !v.destroyed);
            if (o) {
                o.teleport(car.position.x + f.x * 10, car.position.z + f.z * 10, Math.atan2(f.x, f.z)); o.phys.setLinearVelocity(BABYLON.Vector3.Zero()); o.mode = 'drive'; o.reason = '';
                const k = R.hornBack; R.hornBack = 1; const b0 = StreetReact.stats.hornBack; StreetReact.onHorn(game, car); R.hornBack = k;
                out.back = StreetReact.stats.hornBack > b0;
            }
            return out;
        });
        c.ok(hn.dodge, 'buzina: quem está na frente sai do caminho na hora');
        c.ok(hn.back, 'o carro parado na frente buzina de volta');

        // --- tiro: os motoristas que ouvem entram em pânico
        const sh = await page.evaluate(() => {
            const vm = game.vehicleManager, P = window._car.position;
            const o = vm.vehicles.find((v) => v !== window._car && !v.isBike && !v.spec.boat && !v.isChopper && !v.controlled && !v.role && v.aiUpdate && !v.destroyed && v.driver !== false && !v.driverDead);
            if (o) { o.teleport(P.x + 15, P.z, 0); o.mode = 'drive'; o._scared = 0; }
            const near = vm.vehicles.filter((v) => !v.controlled && v.mode === 'drive' && !v.role && v.aiUpdate && Math.hypot(v.position.x - P.x, v.position.z - P.z) < Config.react.shotRadius && v.driver !== false && !v.driverDead);
            const s0 = StreetReact.stats.scared;
            game.npcManager.alertShot(P);
            return { near: near.length, scared: near.filter((v) => v._scared > 0).length, stat: StreetReact.stats.scared - s0 };
        });
        c.ok(sh.near > 0 && sh.scared === sh.near && sh.stat > 0, `tiro: os ${sh.near} motoristas por perto entram em pânico (${sh.scared})`);
        c.noErrors(errors, 'rua_reage');
        await close();
    },
};
