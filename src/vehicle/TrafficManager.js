// ============================================================================
// TrafficManager — o trânsito da cidade.
//   - cria carros em circulação (IA em faixas, mão direita) e carros estacionados;
//   - monta, a cada frame, a lista de OBSTÁCULOS que a IA enxerga (carros, policiais,
//     pedestres e o jogador a pé);
//   - remove da pista carros abandonados quando o jogador se afasta;
//   - conta/registra buzinas (HUD e testes).
// Todos os carros civis (circulando, estacionados, abandonados) ficam em
// vehicleManager.vehicles: qualquer um pode ser roubado.
// ============================================================================

class TrafficManager {
    constructor(scene, physics, vehicleManager, carLib, signals, shadowGenerator) {
        this.scene = scene;
        this.physics = physics;
        this.vm = vehicleManager;
        this.carLib = carLib;
        this.signals = signals;
        this.shadow = shadowGenerator;

        this.env = { obstacles: [], signals, grid: new SpatialHash(16) };       // grid: obstáculos por célula (a IA só olha a vizinhança)
        this._pool = [];          // objetos de obstáculo reaproveitados (sem lixo por frame)
        this.honks = 0;
        this.lastHonk = null;
        this._nextId = 100;
    }

    // ------------------------------------------------------------------- spawn
    // O mundo é grande: o trânsito só existe na BOLHA ACORDADA em volta da câmera (Zones.ar). Carro novo/reciclado nasce numa rua entre a
    // borda da tela no zoom máximo (Zones.sr) e a borda da bolha — fora da tela, já acordado, entrando na cena; quem sai da bolha
    // dorme e é reciclado para essa faixa (_recycle).
    focus() { return this.game ? this.game.camera.target : { x: 0, z: 0 }; }
    ring(min = Zones.sr, max = Zones.ar - 6) { const f = this.focus(); return { x: f.x, z: f.z, rMin: Math.min(min, max - 10), rMax: max }; }
    // Quantidades do Config valiam para o raio antigo (recycleDist ~205 u); na bolha menor, escala pela área para manter a densidade na tela.
    static scaled(n) { return n > 0 ? Math.max(1, Math.round(n * Math.min(1, (Zones.ar / Config.traffic.recycleDist) ** 2))) : 0; }

    // Quão "movimentado" é o lugar (0..1): aceita o ponto com essa probabilidade. Cidade cheia; favela e estradas vazias.
    _density(x, z) {
        const n = RoadPlan.nearestRoadPoint(x, z, 30);
        if (!n) return 0.2;
        switch (n.edge.cls) { case 'city': case 'ave': return 1; case 'isl': return 0.8; case 'bridge': return 0.7; case 'fav': return 0.5; case 'hwy': return 0.45; case 'trail': return 0.1; default: return 0.25; }
    }

    // Que carro aparece aqui: centro e ilha = carros de todo tipo (esportivos, SUVs, táxis); favela e estradas de terra =
    // carros velhos e populares (compactos, picapes, vans) de tinta desbotada; campo = picapes e utilitários.
    _carMix(p) {
        const n = RoadPlan.nearestRoadPoint(p.x, p.z, 30), cls = n ? n.edge.cls : 'city', r = Math.random();
        const W = (table) => { let t = Math.random() * table.reduce((s, e) => s + e[1], 0); for (const [k, w] of table) { t -= w; if (t <= 0) return k; } return table[0][0]; };
        const civil = [0, 1, 3, 4, 5, 7, 8, 9], old = [13, 14, 15, 16, 17, 18];
        if (cls === 'fav') return { model: W([['old', 34], ['hatch', 22], ['sedan', 12], ['pickup', 16], ['van', 11], ['suv', 3], ['taxi', 5]]), paint: r < 0.85 ? old[Math.floor(Math.random() * old.length)] : civil[Math.floor(Math.random() * civil.length)], old: r < 0.85 };
        if (cls === 'dirt' || cls === 'trail') return { model: W([['pickup', 36], ['old', 24], ['hatch', 12], ['van', 12], ['sedan', 7], ['suv', 9]]), paint: r < 0.6 ? old[Math.floor(Math.random() * old.length)] : civil[Math.floor(Math.random() * civil.length)], old: r < 0.6 };
        if (cls === 'hwy') return { model: W([['pickup', 24], ['suv', 20], ['sedan', 19], ['van', 14], ['hatch', 10], ['old', 6], ['sports', 6], ['taxi', 4]]), paint: r < 0.2 ? old[Math.floor(Math.random() * old.length)] : civil[Math.floor(Math.random() * civil.length)], old: r < 0.2 };
        if (cls === 'isl' || cls === 'bridge') return { model: W([['suv', 25], ['sports', 20], ['super', 6], ['sedan', 18], ['taxi', 12], ['hatch', 8], ['pickup', 6], ['van', 6]]), paint: civil[Math.floor(Math.random() * civil.length)], old: false };
        // cidade: o coração do centro tem mais táxis, sedãs e esportivos; os bairros, mais populares
        const downtown = Math.abs(p.x) < 200 && p.z > -300 && p.z < 420;
        const model = downtown ? W([['sedan', 24], ['taxi', 22], ['suv', 14], ['sports', 12], ['super', 3], ['hatch', 12], ['van', 8], ['pickup', 5], ['old', 3]]) : W([['sedan', 24], ['hatch', 24], ['suv', 14], ['pickup', 12], ['van', 10], ['old', 12], ['taxi', 8], ['sports', 4], ['super', 1]]);
        return { model, paint: model === 'taxi' ? 2 : (r < 0.1 && !downtown ? old[Math.floor(Math.random() * old.length)] : civil[Math.floor(Math.random() * civil.length)]), old: false };
    }

    // avoid: { x, z, r } — não nascer a menos de r desse ponto (carro novo no lugar de uma carcaça, fora da tela).
    // near: { x, z, rMin, rMax } (padrão: o anel em volta do foco).
    _spawnCar(mode, avoid = null, near = this.ring()) {
        const id = this._nextId++;
        let place = null;
        for (let tries = 0; tries < 60 && !place; tries++) {
            const cand = mode === 'drive' ? RoadNet.randomLanePoint(14, near) : this._randomCurbSlot(near);
            if (!cand || !this._clear(cand.point.x, cand.point.z, mode === 'drive' ? 10 : 7)) continue;
            if (avoid && hypot(cand.point.x - avoid.x, cand.point.z - avoid.z) < avoid.r) continue;
            if (Math.random() > this._density(cand.point.x, cand.point.z)) continue;
            place = cand;
        }
        if (!place) return null;
        const d = place.d;
        const mix = this._carMix(place.point), old = mix.old;
        const model = this.carLib.variantOf(mix.model);                                              // classe -> modelo especifico (6 compactos, 7 antigos, 5 SUVs...)
        const sheet = this.carLib.sheet(model);                                                       // (atlas: todos prontos)
        const paint = (old || mix.model === 'taxi') ? mix.paint : this.carLib.randomPaint(model);     // cor de fabrica sorteada do modelo
        const car = new TrafficCar(this.scene, this.physics, place.point, id, sheet, paint, Math.atan2(d.dx, d.dz), this);
        if (old) { car.hp = Math.round(car.hp * 0.7); car.old = true; }                        // carro velho: já nasce judiado
        if (this.shadow) this.shadow.addShadowCaster(car.body);
        this.vm.vehicles.push(car);
        car.baseMode = mode;
        if (mode === 'drive') car.startRoute(place.point.x, place.point.z, d, place);
        else car.park();
        return car;
    }

    // Bicicleta ('bicycle') ou moto (Bikes.MOTOS): circulando (com piloto, pela IA de trânsito) ou estacionada no meio-fio
    // (sem piloto, só o veículo). avoid/near: como em _spawnCar.
    _spawnBike(kind, mode, avoid = null, near = this.ring(), courier = false) {
        const id = this._nextId++;
        let place = null;
        for (let tries = 0; tries < 60 && !place; tries++) {
            const cand = mode === 'drive' ? RoadNet.randomLanePoint(14, near) : this._randomCurbSlot(near);
            if (!cand || !this._clear(cand.point.x, cand.point.z, mode === 'drive' ? 8 : 5)) continue;
            if (avoid && hypot(cand.point.x - avoid.x, cand.point.z - avoid.z) < avoid.r) continue;
            if (Math.random() > this._density(cand.point.x, cand.point.z)) continue;
            place = cand;
        }
        if (!place) return null;
        const d = place.d, civ = this.sprites.civilianVariants;
        // paint 4 só dá a cor do corpo 3D (embaixo do sprite); a cor do quadro/roupa vem da variante de paleta.
        const bike = new TrafficCar(this.scene, this.physics, place.point, id, Bikes.sheet(this.sprites, kind, mode === 'drive' ? 'ride' : 'park', courier ? 'courier' : 'rider'), 4, Math.atan2(d.dx, d.dz), this);
        bike.baseMode = mode;
        bike.frameVariant = 2 + (id * 5) % civ;
        bike.setRider(mode === 'drive' ? 2 + (id * 7) % civ : null);
        if (this.shadow) this.shadow.addShadowCaster(bike.body);
        this.vm.vehicles.push(bike);
        if (mode === 'drive') bike.startRoute(place.point.x, place.point.z, d, place); else bike.park();
        return bike;
    }

    // Entregador de aplicativo: moto circulando com piloto de baú vermelho, guiada por Couriers (restaurante → cliente).
    _spawnCourier(avoid = null, near = this.ring()) {
        const bike = this._spawnBike('moto', 'drive', avoid, near, true);              // (a moto de rua com o baú)
        if (!bike) return null;
        Couriers.make(bike);
        return bike;
    }

    // Carcaça que cumpriu o papel (fora da tela): some, e entra outro veículo no lugar, longe do jogador.
    removeWreck(car) {
        const i = this.vm.vehicles.indexOf(car);
        if (i < 0) return;
        this.vm.vehicles.splice(i, 1);
        if (car.clearDeadDriver) car.clearDeadDriver();
        if (this.game && this.game.doors) this.game.doors.reset(car);
        if (this.game) this.game.carLights.release(car);
        car.dispose(this.shadow);
        const f = this.focus();
        const avoid = { x: f.x, z: f.z, r: 90 };
        if (car.courier) this._spawnCourier(avoid);
        else if (car.isBike) this._spawnBike(car.spec.id, car.baseMode || 'drive', avoid);
        else this._spawnCar(car.baseMode || 'drive', avoid);
    }

    spawn(count = Config.traffic.count, parked = Config.traffic.parked) {
        const T = Config.traffic, S = TrafficManager.scaled, r = this.ring(40);
        for (let i = 0; i < S(count); i++) this._spawnCar('drive', null, r);
        for (let i = 0; i < S(parked); i++) this._spawnCar('parked', null, r);
        if (this.sprites) {
            for (let i = 0; i < S(T.motos); i++) this._spawnBike(Bikes.pickMoto(), 'drive', null, r);
            for (let i = 0; i < S(T.motosParked); i++) this._spawnBike(Bikes.pickMoto(), 'parked', null, r);
            for (let i = 0; i < S(T.bicycles); i++) this._spawnBike('bicycle', 'drive', null, r);
            for (let i = 0; i < S(T.bicyclesParked); i++) this._spawnBike('bicycle', 'parked', null, r);
            for (let i = 0; i < S(T.couriers || 0); i++) this._spawnCourier(null, r);
        }
    }

    // Nenhum carro/sólido num raio r do ponto?
    _clear(x, z, r) {
        for (const c of this.vm.vehicles) {
            const p = c.position;
            if (hypot(p.x - x, p.z - z) < r) return false;
        }
        return true;
    }

    // Vaga no meio-fio, à direita do sentido de circulação (mão direita), longe de cruzamentos.
    _randomCurbSlot(near = null) {
        const P = RoadPlan;
        let e;
        if (near) {
            const S = P.CELL, i = Math.floor((near.x - near.rMax) / S) + Math.floor(Math.random() * (Math.floor((near.x + near.rMax) / S) - Math.floor((near.x - near.rMax) / S) + 1));
            const j = Math.floor((near.z - near.rMax) / S) + Math.floor(Math.random() * (Math.floor((near.z + near.rMax) / S) - Math.floor((near.z - near.rMax) / S) + 1));
            const c = P._eg.get(P._key(i, j));
            if (!c || !c.length) return null;
            e = c[Math.floor(Math.random() * c.length)];
        } else e = P.randomEdge();
        if (!e || e.len < 36 || e.cls === 'trail') return null;
        const fav = e.cls === 'fav', fwd = Math.random() < 0.5, off = fav ? e.w / 2 + 0.8 : e.w / 2 - 0.1, t = 17 + Math.random() * (e.len - 34), p = P.at(e, t);
        if (P.inTunnel(e, t)) return null;                                             // (no túnel o meio-fio é a parede)
        const d = { dx: fwd ? p.tx : -p.tx, dz: fwd ? p.tz : -p.tz }, x = p.x + d.dz * off, z = p.z - d.dx * off;           // no meio-fio à direita de quem anda (rua do morro: fora da pista estreita)
        if (fav && !FavelaPlan.roomForCar(x, z, d.dx, d.dz)) return null;
        if (near) { const r = hypot(x - near.x, z - near.z); if (r < near.rMin || r > near.rMax) return null; }
        if (CityGrid.intersectionNear(x, z, 17)) return null;
        return { point: { x, z }, d };
    }

    // ---------------------------------------------------------------- obstáculos
    _push(i, kind, x, z, vx, vz, ref, half, hw) {
        let o = this._pool[i];
        if (!o) o = this._pool[i] = {};
        o.kind = kind; o.x = x; o.z = z; o.vx = vx; o.vz = vz; o.ref = ref; o.half = half; o.hw = hw; o.layer = (ref && ref.layer) || 0;
        return o;
    }

    // Grade de obstáculos (carros e pedestres) que a IA consulta. Refeita a cada quadro, sem closures nem objetos novos (pool), e
    // sem ler a velocidade no Havok de quem está estacionado (é zero) — com ~140 carros era ~0,8 ms por quadro.
    _buildObstacles(game) {
        const out = this.env.obstacles, G = this.env.grid;
        G.clear();
        let n = 0;
        const car = (c) => {
            const p = c.position, still = (c.mode === 'parked' && !c.controlled) || c._asleep;
            // Velocidade: ler no Havok custa ~2 µs (e cria um array); longe da tela a IA é grosseira (roda a cada 5 quadros), então
            // vale a última lida (c._vel) — perto da tela, a de agora.
            const v = still ? null : (Zones.near(p.x, p.z, 60) ? c.velocity : c._vel);
            const o = this._push(n, 'car', p.x, p.z, v ? v.x : 0, v ? v.z : 0, c, c.halfLen, c.halfW);
            out[n++] = o; G.insert(o, o.x, o.z);
        };
        const ped = (e) => {
            const p = e.position, o = this._push(n, 'ped', p.x, p.z, 0, 0, e, 0.4, 0.4);
            o.layer = Vehicle.layerOfLevel(Vehicle.levelOf(e));          // (no viaduto: camada 1 | nadando sob a ponte: -1, ninguém da pista o vê)
            out[n++] = o; G.insert(o, o.x, o.z);
        };
        for (const c of this.vm.vehicles) car(c);
        if (game.policeManager) {
            for (const c of game.policeManager.cars) car(c);
            for (const o of game.policeManager.officers) ped(o);
        }
        if (game.npcManager) for (const npc of game.npcManager.npcs) if (npc.alive) ped(npc);
        if (game.mode !== 'car') ped(game.player);
        out.length = n;
    }

    // ------------------------------------------------------------------- frame
    update(dt, game) {
        this.game = game;
        this._buildObstacles(game);
        const env = this.env;
        const pp = game.mode === 'car' && game.activeCar ? game.activeCar.position : game.player.position;

        // Zonas (ver core/Spatial.js): carro comum na tela roda a IA todo quadro; perto da tela, a cada 2; longe ("dormindo"), a cada 5,
        // com o dt somado. A física do Havok continua andando todo quadro com a velocidade que a IA deixou. Fora da bolha: dorme (abaixo).
        let asleepN = 0;
        for (const car of this.vm.vehicles) {
            const calm = !car.controlled && !car.hold && !car.wrecked && !(car.burning > 0) && !car.tumble && car.mode !== 'abandoned' && !car.ignoreSignals;
            // Fora da BOLHA ACORDADA (2× a visão máxima): dorme — sem IA, sem física, sem sprite. Acorda ao entrar nela (fora da tela).
            if (calm && Zones.asleep(car.position.x, car.position.z)) { if (car._asleep) car.sleepTick(); else car.sleep(); asleepN++; continue; }
            if (car._asleep) car.wake();
            if (calm) {
                const tier = Zones.tier(car.position.x, car.position.z);
                if (tier > 0) {
                    car._lodDt = (car._lodDt || 0) + dt;
                    if (!Zones.every(car.id, tier, car.mode === 'parked' ? 6 : 2, car.mode === 'parked' ? 15 : 5)) continue;      // estacionado: quase nada a fazer
                    const d = Math.min(car._lodDt, car.mode === 'parked' ? 0.5 : 0.2);
                    if (car.courier) Couriers.update(car, d);
                    car.update(d, env); car._lodDt = 0;
                    continue;
                }
                car._lodDt = 0;
            }
            if (car.courier) Couriers.update(car, dt);
            car.update(dt, env);

            // Carro largado na pista: some (vira estacionado em outra vaga) quando o jogador se afasta.
            if (car.mode === 'abandoned' && !car.keep && hypot(car.position.x - pp.x, car.position.z - pp.z) > Config.traffic.abandonDist) {      // (seus carros e os de vitrine: Garage/Dealers cuidam)
                this._relocate(car, 'parked');
            }
            // Preso por tempo demais sem motivo: reposiciona longe do jogador.
            if (car.mode === 'drive' && !car.keep && car.stuck > 25 && hypot(car.position.x - pp.x, car.position.z - pp.z) > 30) {
                this._relocate(car, 'drive');
            }
        }
        this._asleepN = asleepN;
        this._recycle(dt, pp);
    }

    // Reposiciona o veículo numa via/vaga do anel em volta do foco (fora da tela). Devolve true se achou lugar.
    _relocate(car, mode, near = this.ring()) {
        for (let tries = 0; tries < 40; tries++) {
            const cand = mode === 'drive' ? RoadNet.randomLanePoint(14, near) : this._randomCurbSlot(near);
            if (!cand || !this._clear(cand.point.x, cand.point.z, 9)) continue;
            if (Math.random() > this._density(cand.point.x, cand.point.z)) continue;
            car.teleport(cand.point.x, cand.point.z, Math.atan2(cand.d.dx, cand.d.dz));
            car.stuck = 0; car.blocked = 0;
            if (car.clearDeadDriver) car.clearDeadDriver();                     // (outro carro, outro motorista: sem corpo nem buzina presa)
            car.fixGlass();
            if (this.game && this.game.doors) this.game.doors.reset(car);        // (porta aberta/alarme não vão junto)
            if (mode === 'drive') { car.mode = 'drive'; car.startRoute(cand.point.x, cand.point.z, cand.d, cand); }
            else car.park();
            return true;
        }
        return false;
    }

    // Recicla o trânsito: quem ficou para trás (> recycleDist do jogador) é trocado por OUTRO veículo, do tipo certo para o
    // lugar onde aparece (carro de luxo no centro, calhambeque na favela), numa via perto do jogador, fora da tela.
    _recycle(dt, pp) {
        this._recT = (this._recT || 0) - dt;
        if (this._recT > 0) return;
        this._recT = 1 / Config.traffic.relocPerSec / ((this._asleepN || 0) > 6 ? 4 : 1);      // muitos adormecidos (teleporte, respawn): repovoa 4× mais rápido, 1 por vez
        const far = Zones.ar + 10, far2 = far * far;                         // saiu da bolha acordada (e um pouco mais): recicla
        for (const car of this.vm.vehicles) {
            if (car.controlled || car.hold || car.keep || car.wrecked || car.burning > 0 || car.mode === 'abandoned') continue;      // (keep: seus carros e os de vitrine)
            if (!car._asleep) {                                                 // adormecido = saiu da bolha (fica parado na borda): recicla já
                const dx = car.position.x - pp.x, dz = car.position.z - pp.z;
                if (dx * dx + dz * dz < far2) continue;
            }
            const mode = car.baseMode === 'parked' ? 'parked' : 'drive';
            const fresh = car.courier ? this._spawnCourier() : car.isBike ? this._spawnBike(car.spec.id, mode) : this._spawnCar(mode);
            if (!fresh) { this._relocate(car, mode); return; }                 // sem lugar para o novo: ao menos reposiciona este
            const i = this.vm.vehicles.indexOf(car);
            if (i >= 0) this.vm.vehicles.splice(i, 1);
            if (this.game && this.game.doors) this.game.doors.reset(car);
            if (this.game) this.game.carLights.release(car);
            car.dispose(this.shadow);
            return;                                                             // um por vez (sem engasgo)
        }
    }

    onHonk(car, why, info) {
        this.honks++;
        const p = car.position;
        this.lastHonk = { id: car.id, why, reason: car.reason, at: [+p.x.toFixed(0), +p.z.toFixed(0)], info, t: performance.now() };
        (this.honkLog || (this.honkLog = [])).push(this.lastHonk);
        if (this.honkLog.length > 60) this.honkLog.shift();
    }
}
