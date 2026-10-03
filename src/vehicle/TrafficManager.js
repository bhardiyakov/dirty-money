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

        this.env = { obstacles: [], signals };
        this._pool = [];          // objetos de obstáculo reaproveitados (sem lixo por frame)
        this.honks = 0;
        this.lastHonk = null;
        this._nextId = 100;
    }

    // ------------------------------------------------------------------- spawn
    // O mundo é grande: carros só nascem PERTO do foco (câmera), numa rua entre spawnMin e spawnMax dele (fora da tela).
    focus() { return this.game ? this.game.camera.target : { x: 0, z: 0 }; }
    ring(min = Config.traffic.spawnMin, max = Config.traffic.spawnMax) { const f = this.focus(); return { x: f.x, z: f.z, rMin: min, rMax: max }; }

    // Quão "movimentado" é o lugar (0..1): aceita o ponto com essa probabilidade. Cidade cheia; favela e estradas vazias.
    _density(x, z) {
        const n = RoadPlan.nearestRoadPoint(x, z, 30);
        if (!n) return 0.2;
        switch (n.edge.cls) { case 'city': case 'ave': return 1; case 'isl': return 0.8; case 'bridge': return 0.7; case 'fav': return 0.5; case 'hwy': return 0.45; default: return 0.25; }
    }

    // Que carro aparece aqui: centro e ilha = carros de todo tipo (esportivos, SUVs, táxis); favela e estradas de terra =
    // carros velhos e populares (compactos, picapes, vans) de tinta desbotada; campo = picapes e utilitários.
    _carMix(p) {
        const n = RoadPlan.nearestRoadPoint(p.x, p.z, 30), cls = n ? n.edge.cls : 'city', r = Math.random();
        const W = (table) => { let t = Math.random() * table.reduce((s, e) => s + e[1], 0); for (const [k, w] of table) { t -= w; if (t <= 0) return k; } return table[0][0]; };
        const civil = [0, 1, 3, 4, 5, 7, 8, 9], old = [13, 14, 15, 16, 17, 18];
        if (cls === 'fav') return { model: W([['hatch', 30], ['sedan', 25], ['pickup', 20], ['van', 15], ['suv', 4], ['taxi', 6]]), paint: r < 0.85 ? old[Math.floor(Math.random() * old.length)] : civil[Math.floor(Math.random() * civil.length)], old: r < 0.85 };
        if (cls === 'dirt') return { model: W([['pickup', 40], ['hatch', 20], ['van', 15], ['sedan', 15], ['suv', 10]]), paint: r < 0.6 ? old[Math.floor(Math.random() * old.length)] : civil[Math.floor(Math.random() * civil.length)], old: r < 0.6 };
        if (cls === 'hwy') return { model: W([['pickup', 25], ['suv', 20], ['sedan', 20], ['van', 15], ['hatch', 10], ['sports', 6], ['taxi', 4]]), paint: r < 0.2 ? old[Math.floor(Math.random() * old.length)] : civil[Math.floor(Math.random() * civil.length)], old: r < 0.2 };
        if (cls === 'isl' || cls === 'bridge') return { model: W([['suv', 25], ['sports', 20], ['super', 6], ['sedan', 18], ['taxi', 12], ['hatch', 8], ['pickup', 6], ['van', 6]]), paint: civil[Math.floor(Math.random() * civil.length)], old: false };
        // cidade: o coração do centro tem mais táxis, sedãs e esportivos; os bairros, mais populares
        const downtown = Math.abs(p.x) < 200 && p.z > -300 && p.z < 420;
        const model = downtown ? W([['sedan', 25], ['taxi', 22], ['suv', 14], ['sports', 12], ['super', 3], ['hatch', 12], ['van', 8], ['pickup', 5]]) : W([['sedan', 28], ['hatch', 24], ['suv', 14], ['pickup', 12], ['van', 10], ['taxi', 8], ['sports', 4], ['super', 1]]);
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
            if (avoid && Math.hypot(cand.point.x - avoid.x, cand.point.z - avoid.z) < avoid.r) continue;
            if (Math.random() > this._density(cand.point.x, cand.point.z)) continue;
            place = cand;
        }
        if (!place) return null;
        const d = place.d;
        const mix = this._carMix(place.point), old = mix.old;
        const model = this.carLib.variantOf(mix.model);                                              // classe -> modelo especifico (3 compactos, 4 sedas, 4 SUVs...)
        const paint = (old || mix.model === 'taxi') ? mix.paint : this.carLib.randomPaint(model);     // cor de fabrica sorteada do modelo
        const car = new TrafficCar(this.scene, this.physics, place.point, id, this.carLib.sheet(model), paint, Math.atan2(d.dx, d.dz), this);
        if (old) { car.hp = Math.round(car.hp * 0.7); car.old = true; }                        // carro velho: já nasce judiado
        if (this.shadow) this.shadow.addShadowCaster(car.body);
        this.vm.vehicles.push(car);
        car.baseMode = mode;
        if (mode === 'drive') car.startRoute(place.point.x, place.point.z, d);
        else car.park();
        return car;
    }

    // Bicicleta ('bicycle') ou moto ('moto'): circulando (com piloto, pela IA de trânsito) ou estacionada no meio-fio
    // (sem piloto, só o veículo). avoid/near: como em _spawnCar.
    _spawnBike(kind, mode, avoid = null, near = this.ring()) {
        const id = this._nextId++;
        let place = null;
        for (let tries = 0; tries < 60 && !place; tries++) {
            const cand = mode === 'drive' ? RoadNet.randomLanePoint(14, near) : this._randomCurbSlot(near);
            if (!cand || !this._clear(cand.point.x, cand.point.z, mode === 'drive' ? 8 : 5)) continue;
            if (avoid && Math.hypot(cand.point.x - avoid.x, cand.point.z - avoid.z) < avoid.r) continue;
            if (Math.random() > this._density(cand.point.x, cand.point.z)) continue;
            place = cand;
        }
        if (!place) return null;
        const d = place.d, civ = this.sprites.civilianVariants;
        // paint 4 só dá a cor do corpo 3D (embaixo do sprite); a cor do quadro/roupa vem da variante de paleta.
        const bike = new TrafficCar(this.scene, this.physics, place.point, id, Bikes.sheet(this.sprites, kind, mode === 'drive' ? 'ride' : 'park'), 4, Math.atan2(d.dx, d.dz), this);
        bike.baseMode = mode;
        bike.frameVariant = 2 + (id * 5) % civ;
        bike.setRider(mode === 'drive' ? 2 + (id * 7) % civ : null);
        if (this.shadow) this.shadow.addShadowCaster(bike.body);
        this.vm.vehicles.push(bike);
        if (mode === 'drive') bike.startRoute(place.point.x, place.point.z, d); else bike.park();
        return bike;
    }

    // Carcaça que cumpriu o papel (fora da tela): some, e entra outro veículo no lugar, longe do jogador.
    removeWreck(car) {
        const i = this.vm.vehicles.indexOf(car);
        if (i < 0) return;
        this.vm.vehicles.splice(i, 1);
        if (this.game && this.game.doors) this.game.doors.reset(car);
        if (this.game) this.game.carLights.release(car);
        car.dispose(this.shadow);
        const f = this.focus();
        const avoid = { x: f.x, z: f.z, r: 90 };
        if (car.isBike) this._spawnBike(car.spec.id, car.baseMode || 'drive', avoid);
        else this._spawnCar(car.baseMode || 'drive', avoid);
    }

    spawn(count = Config.traffic.count, parked = Config.traffic.parked) {
        for (let i = 0; i < count; i++) this._spawnCar('drive', null, this.ring(40, Config.traffic.spawnMax));
        for (let i = 0; i < parked; i++) this._spawnCar('parked', null, this.ring(40, Config.traffic.spawnMax));
        const T = Config.traffic;
        if (this.sprites) {
            const r = this.ring(40, Config.traffic.spawnMax);
            for (let i = 0; i < T.motos; i++) this._spawnBike('moto', 'drive', null, r);
            for (let i = 0; i < T.motosParked; i++) this._spawnBike('moto', 'parked', null, r);
            for (let i = 0; i < T.bicycles; i++) this._spawnBike('bicycle', 'drive', null, r);
            for (let i = 0; i < T.bicyclesParked; i++) this._spawnBike('bicycle', 'parked', null, r);
        }
    }

    // Nenhum carro/sólido num raio r do ponto?
    _clear(x, z, r) {
        for (const c of this.vm.vehicles) {
            const p = c.position;
            if (Math.hypot(p.x - x, p.z - z) < r) return false;
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
        if (!e || e.len < 36) return null;
        const side = Math.random() < 0.5 ? 1 : -1, off = e.w / 2 - 0.1, t = 17 + Math.random() * (e.len - 34);
        let x, z, d;
        if (e.v) { x = e.a.x + side * off; z = e.a.z + t; d = side > 0 ? { dx: 0, dz: 1 } : { dx: 0, dz: -1 }; }          // lado leste: sentido norte
        else { z = e.a.z + side * off; x = e.a.x + t; d = side > 0 ? { dx: -1, dz: 0 } : { dx: 1, dz: 0 }; }              // lado norte: sentido oeste
        if (near) { const r = Math.hypot(x - near.x, z - near.z); if (r < near.rMin || r > near.rMax) return null; }
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

    _buildObstacles(game) {
        let n = 0;
        const out = this.env.obstacles;
        const add = (kind, x, z, vx, vz, ref, half = 0.4, hw = 0.4) => { out[n] = this._push(n, kind, x, z, vx, vz, ref, half, hw); n++; };

        for (const c of this.vm.vehicles) {
            const p = c.position, v = c.velocity;
            add('car', p.x, p.z, v.x, v.z, c, c.halfLen, c.halfW);
        }
        if (game.policeManager) {
            for (const c of game.policeManager.cars) { const p = c.position, v = c.velocity; add('car', p.x, p.z, v.x, v.z, c, c.halfLen, c.halfW); }
            for (const o of game.policeManager.officers) add('ped', o.position.x, o.position.z, 0, 0, o);
        }
        if (game.npcManager) for (const npc of game.npcManager.npcs) if (npc.alive) add('ped', npc.position.x, npc.position.z, 0, 0, npc);
        if (game.mode !== 'car') add('ped', game.player.position.x, game.player.position.z, 0, 0, game.player);

        out.length = n;
    }

    // ------------------------------------------------------------------- frame
    update(dt, game) {
        this.game = game;
        this._buildObstacles(game);
        const env = this.env;
        const pp = game.mode === 'car' && game.activeCar ? game.activeCar.position : game.player.position;

        // LOD de simulação: carro de trânsito comum longe da tela (> 100 u do foco; a tela mostra ~60 u) roda a IA em 1 de cada 2
        // quadros, com o dt acumulado. A física do Havok continua andando todo quadro com a velocidade que a IA deixou.
        const fx = pp.x, fz = pp.z, farSq = 100 * 100;
        for (const car of this.vm.vehicles) {
            const calm = !car.controlled && !car.hold && !car.wrecked && !(car.burning > 0) && car.mode !== 'abandoned' && !car.ignoreSignals && !car.isBike;
            if (calm) {
                const dx = car.position.x - fx, dz = car.position.z - fz;
                if (dx * dx + dz * dz > farSq) {
                    car._lodDt = (car._lodDt || 0) + dt;
                    if ((car._lodTick = !car._lodTick)) continue;          // quadro ímpar: só acumula
                    car.update(car._lodDt, env); car._lodDt = 0;
                    continue;
                }
                car._lodDt = 0;
            }
            car.update(dt, env);

            // Carro largado na pista: some (vira estacionado em outra vaga) quando o jogador se afasta.
            if (car.mode === 'abandoned' && Math.hypot(car.position.x - pp.x, car.position.z - pp.z) > Config.traffic.abandonDist) {
                this._relocate(car, 'parked');
            }
            // Preso por tempo demais sem motivo: reposiciona longe do jogador.
            if (car.mode === 'drive' && car.stuck > 25 && Math.hypot(car.position.x - pp.x, car.position.z - pp.z) > 30) {
                this._relocate(car, 'drive');
            }
        }
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
            if (this.game && this.game.doors) this.game.doors.reset(car);        // (porta aberta/alarme não vão junto)
            if (mode === 'drive') { car.mode = 'drive'; car.startRoute(cand.point.x, cand.point.z, cand.d); }
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
        this._recT = 1 / Config.traffic.relocPerSec;
        const T = Config.traffic, far2 = T.recycleDist * T.recycleDist;
        for (const car of this.vm.vehicles) {
            if (car.controlled || car.hold || car.wrecked || car.burning > 0 || car.mode === 'abandoned') continue;
            const dx = car.position.x - pp.x, dz = car.position.z - pp.z;
            if (dx * dx + dz * dz < far2) continue;
            const mode = car.baseMode === 'parked' ? 'parked' : 'drive';
            const fresh = car.isBike ? this._spawnBike(car.spec.id, mode) : this._spawnCar(mode);
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
