// ============================================================================
// CarDamage — o que acontece com um carro conforme ele perde vida (hp, em Vehicle):
//   hp < 35%   fumaça saindo do capô (mais densa e escura quanto menos vida)
//   hp = 0     PEGA FOGO: chamas e fumaça preta; motor morto; explode depois de alguns segundos
//   explosão   clarão + bolas de fogo + estouro; dano em área (jogador, pedestres, policiais e outros carros,
//              que podem pegar fogo também = reação em cadeia); tremor de câmera; sobra a CARCAÇA carbonizada
//   carcaça    fumega por um tempo e some (fora da tela) depois de Config.crash.wreckLife s
// As fases de AMASSADO do sprite (limpo → 1 → 2 → 3) vêm do Vehicle/CarSheet pela fração de vida.
// Quem causou o dano fica em car.lastHitBy: se foi o jogador (ou o carro dele), as mortes pela explosão
// são crime dele (procurado, polícia ouve).
// ============================================================================

class CarDamage {
    constructor(game) {
        this.g = game;
        this.fire = new GlowBatch(game.scene, 140, 'carFire', 'glow');   // chamas e clarões (aditivo)
        this.flames = new Map();       // carro -> [3 chamas + brilho no chão]
        this.booms = [];               // explosões em andamento
        this.time = 0;
    }

    get puffs() { return this.g.carLights.puffs; }

    // Todos os carros do jogo (civis + polícia).
    allCars() {
        const g = this.g;
        const civ = g.vehicleManager ? g.vehicleManager.vehicles.concat(g.vehicleManager.boats) : [];
        return g.policeManager ? civ.concat(g.policeManager.cars) : civ;
    }

    update(dt) {
        this.time += dt;
        const f = this.g.camera.target;
        for (const car of this.allCars()) {
            const near = Math.hypot(car.position.x - f.x, car.position.z - f.z) < 75;
            if (car.burning > 0) this._burn(car, dt, near);
            else if (car.wrecked) this._wreck(car, dt, near);
            else if (car.hp > 0 && car.hp / car.maxHp < Config.crash.smokeBelow) this._smoke(car, dt, near);
        }
        this._updateBooms(dt);
        this.fire.flush();
    }

    // Ponto sobre o capô (frente do carro), com leve sorteio.
    _hood(car, back = 0.9) {
        const p = car.position, d = car.body.getDirection(BABYLON.Axis.Z);
        const l = Math.hypot(d.x, d.z) || 1, fx = d.x / l, fz = d.z / l;
        const s = car.halfLen - back, j = (Math.random() - 0.5) * 0.9;
        return { x: p.x + fx * s - fz * j, z: p.z + fz * s + fx * j };
    }

    // ------------------------------------------------------------------ fumaça
    _smoke(car, dt, near) {
        const g = this.g;
        if (car === g.activeCar && !car._warnedSmoke) { car._warnedSmoke = true; g._flash('O motor está soltando fumaça! O carro está quase acabando'); }
        if (!near) return;
        const sev = 1 - (car.hp / car.maxHp) / Config.crash.smokeBelow;       // 0..1
        car._smokeT = (car._smokeT || 0) - dt;
        if (car._smokeT > 0) return;
        car._smokeT = (0.5 + Math.random() * 0.5) / (3 + sev * 7);
        const h = this._hood(car);
        const dark = sev > 0.5 ? [0.2, 0.2, 0.22] : [0.62, 0.62, 0.65];
        this.puffs.emit(h.x, 1.3, h.z, 0.5 + Math.random() * 0.6, 1.1 + Math.random() * 0.8, (Math.random() - 0.5) * 0.8,
            0.35, 1.1 + sev * 0.9, 1.0 + Math.random() * 0.7, 0.35 + 0.3 * sev, dark);
    }

    // ------------------------------------------------------------ pegando fogo
    _burn(car, dt, near) {
        const g = this.g;
        if (!car._ignited) {
            car._ignited = true;
            if (car === g.activeCar) g._flash('O CARRO ESTÁ PEGANDO FOGO! Saia (F) antes que exploda!');
            if (g.npcManager) g.npcManager.alertViolence(car.position, 22);      // todo mundo se afasta
        }
        car.burning -= dt;
        if (car.burning <= 0) { this._explode(car); return; }

        let slots = this.flames.get(car);
        if (!slots) { slots = [this.fire.alloc(), this.fire.alloc(), this.fire.alloc(), this.fire.alloc()]; this.flames.set(car, slots); }
        if (!near) { for (const i of slots) this.fire.off(i); return; }

        // Chamas tremulando sobre o capô e o motor + clarão alaranjado no chão em volta.
        const p = car.position;
        for (let k = 0; k < 3; k++) {
            const h = this._hood(car, 0.3 + k * 0.9);
            this.fire.place(slots[k], h.x, 1.5 + Math.random() * 0.5, h.z, 1.5 + Math.random() * 1.5);
            this.fire.color(slots[k], 1.0, 0.3 + Math.random() * 0.45, 0.05, 0.85);
        }
        this.fire.place(slots[3], p.x, 0.3, p.z, 9 + Math.sin(this.time * 14) * 1.2);
        this.fire.color(slots[3], 1.0, 0.42, 0.1, 0.17 + 0.05 * Math.sin(this.time * 11));

        // Fumaça preta densa.
        car._smokeT = (car._smokeT || 0) - dt;
        if (car._smokeT <= 0) {
            car._smokeT = 0.07;
            const h = this._hood(car, 0.4);
            this.puffs.emit(h.x, 1.6, h.z, (Math.random() - 0.5) * 1.2 + 0.6, 2.2 + Math.random(), (Math.random() - 0.5) * 1.2,
                0.5, 2.3, 1.3 + Math.random() * 0.6, 0.65, [0.1, 0.1, 0.11]);
        }
    }

    // --------------------------------------------------------------- explosão
    _explode(car) {
        const g = this.g, p = car.position, x = p.x, z = p.z;
        const playersCar = car === g.activeCar;
        const src = (playersCar || car.lastHitBy === 'player') ? 'player' : (car.lastHitBy === 'police' ? 'police' : 'env');

        // Libera as chamas deste carro.
        const slots = this.flames.get(car);
        if (slots) { for (const i of slots) this.fire.free(i); this.flames.delete(car); }

        if (playersCar) g._ejectPlayer(car);                      // o jogador é jogado para fora ANTES do estouro
        car.burning = 0;
        car.wrecked = true;
        car.wreckT = 0;
        car.engineDead = true;
        if (car.mode !== undefined) car.mode = 'wreck';           // (depois do eject: sair do carro o marcaria "abandonado")
        car.hp = 0; car.dent = 3;

        // Clarão, bolas de fogo, fumaça e faíscas.
        const b = { x, z, t: 0, ids: [this.fire.alloc(), this.fire.alloc(), this.fire.alloc(), this.fire.alloc(), this.fire.alloc()], off: [] };
        for (let i = 0; i < 4; i++) b.off.push([(Math.random() - 0.5) * 3.6, (Math.random() - 0.5) * 3.6]);
        this.booms.push(b);
        for (let i = 0; i < 14; i++) {
            const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 4;
            this.puffs.emit(x, 1.2, z, Math.sin(a) * s, 1.5 + Math.random() * 2.5, Math.cos(a) * s, 1.0, 3.8 + Math.random() * 1.6, 1.8 + Math.random() * 1.2, 0.6, [0.13, 0.13, 0.14]);
        }
        for (let i = 0; i < 9; i++) g.combat.spark(x + (Math.random() - 0.5) * 4, 0.8 + Math.random() * 2, z + (Math.random() - 0.5) * 4, [1, 0.45 + Math.random() * 0.4, 0.12]);
        AudioFX.explosion(x, z);
        const fd = Math.hypot(x - g.camera.target.x, z - g.camera.target.z);
        if (fd < 70) g.camera.shake(1.3 * (1 - fd / 70));

        const bl = car.spec.blast || 1;                          // moto explode menos que um carro
        this._blast(x, z, Config.crash.explosionR * bl, src, car, bl);

        // Consequências para o procurado.
        if (src === 'player') {
            g.wanted.reportCrime();
            if (g.policeManager) {
                g.policeManager.alertNear(p, 90);                              // a polícia ouve e vai ao local
                if (car.role && car.role !== 'block') g.wanted.addStars(1, 'kill');   // destruiu uma viatura/veículo militar
            }
        }
        if (g.npcManager) g.npcManager.alertViolence(p, 45);
    }

    // Explosão avulsa (helicóptero que caiu): mesmo clarão/fogo/fumaça/dano em área da explosão de carro, sem carro. bl = potência.
    boomAt(x, z, src = 'env', bl = 1.5) {
        const g = this.g;
        const b = { x, z, t: 0, ids: [this.fire.alloc(), this.fire.alloc(), this.fire.alloc(), this.fire.alloc(), this.fire.alloc()], off: [] };
        for (let i = 0; i < 4; i++) b.off.push([(Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5]);
        this.booms.push(b);
        for (let i = 0; i < 22; i++) {
            const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 6;
            this.puffs.emit(x, 1.2, z, Math.sin(a) * s, 1.5 + Math.random() * 3, Math.cos(a) * s, 1.2, 4.6 + Math.random() * 2, 2 + Math.random() * 1.5, 0.62, [0.13, 0.13, 0.14]);
        }
        for (let i = 0; i < 16; i++) g.combat.spark(x + (Math.random() - 0.5) * 6, 0.8 + Math.random() * 3, z + (Math.random() - 0.5) * 6, [1, 0.45 + Math.random() * 0.4, 0.12]);
        AudioFX.explosion(x, z);
        const fd = Math.hypot(x - g.camera.target.x, z - g.camera.target.z);
        if (fd < 90) g.camera.shake(1.8 * (1 - fd / 90));
        this._blast(x, z, Config.crash.explosionR * bl, src, null, bl);
        if (src === 'player') {
            g.wanted.reportCrime();
            if (g.policeManager) g.policeManager.alertNear({ x, z }, 110);
        }
        if (g.npcManager) g.npcManager.alertViolence({ x, z }, 55);
    }

    // Dano em área: jogador, pedestres, policiais e outros carros (reação em cadeia).
    _blast(x, z, R, src, srcCar, bl = 1) {
        const g = this.g;
        const fall = (d) => Math.max(0, 1 - d / R);
        const from = { x, z };

        const pl = g.player;
        if (pl.alive) {
            const pp = g.mode === 'car' && g.activeCar ? g.activeCar.position : pl.position;
            const d = Math.hypot(pp.x - x, pp.z - z), k = fall(d);
            if (k > 0) {
                pl.takeDamage(95 * k * bl);
                if (g.mode !== 'car') {
                    const l = d || 1;
                    pl.velocity.x += (pp.x - x) / l * 9 * k; pl.velocity.z += (pp.z - z) / l * 9 * k;
                }
            }
        }
        if (g.npcManager) for (const n of g.npcManager.npcs) {
            if (!n.alive) continue;
            const k = fall(Math.hypot(n.position.x - x, n.position.z - z));
            if (k > 0) n.takeDamage((230 * k + 20) * bl, from, src);
        }
        if (g.policeManager) for (const o of g.policeManager.officers) {
            if (!o.alive) continue;
            const k = fall(Math.hypot(o.position.x - x, o.position.z - z));
            if (k > 0) o.takeDamage((190 * k + 15) * bl, from, src);
        }
        for (const c of this.allCars()) {
            if (c === srcCar || c.wrecked) continue;
            const dx = c.position.x - x, dz = c.position.z - z, d = Math.hypot(dx, dz), k = fall(d);
            if (k <= 0) continue;
            c.takeDamage((90 * k * k + 6) * bl, src === 'player' ? 'player' : 'env');
            if (c.role !== 'block') {                                      // (viaturas de bloqueio são estáticas)
                const v = c.phys.getLinearVelocity(), l = d || 1;
                c.phys.setLinearVelocity(new BABYLON.Vector3(v.x + dx / l * 8 * k, v.y + 1.5 * k, v.z + dz / l * 8 * k));
            }
        }
    }

    // Animação das explosões (clarão + bolas de fogo): ~1,2 s.
    _updateBooms(dt) {
        for (let i = this.booms.length - 1; i >= 0; i--) {
            const b = this.booms[i];
            b.t += dt;
            const F = this.fire, t = b.t, T = 1.25;
            if (t >= T) { for (const id of b.ids) F.free(id); this.booms.splice(i, 1); continue; }
            // Clarão branco-amarelo que cresce rápido e some.
            const fl = b.ids[0];
            F.place(fl, b.x, 2.2, b.z, 6 + 14 * Math.min(1, t / 0.22));
            F.color(fl, 1.0, 0.92, 0.65, Math.max(0, 1 - t / 0.4));
            // Bolas de fogo: crescem e esfriam (amarelo → laranja → vermelho escuro).
            for (let k = 0; k < 4; k++) {
                const id = b.ids[k + 1], u = t / T;
                const grow = Math.sin(Math.min(1, u * 1.15) * Math.PI * 0.85);
                F.place(id, b.x + b.off[k][0] * (0.4 + u), 1.6 + k * 0.2, b.z + b.off[k][1] * (0.4 + u), (4 + (k % 2) * 2.5) * Math.max(0.05, grow));
                F.color(id, 1.0, Math.max(0.12, 0.8 - u * 0.7), Math.max(0.03, 0.2 - u * 0.17), 0.9 * (1 - u * u));
            }
        }
    }

    // ----------------------------------------------------------------- carcaça
    _wreck(car, dt, near) {
        car.wreckT += dt;
        const g = this.g;
        if (near && car.wreckT < 40 && car.spec.fire !== false) {            // (bicicleta caída não fumega)
            car._smokeT = (car._smokeT || 0) - dt;
            if (car._smokeT <= 0) {
                const k = 1 - car.wreckT / 40;
                car._smokeT = (0.25 + (1 - k) * 0.7) + Math.random() * 0.2;
                const h = this._hood(car, 0.5);
                this.puffs.emit(h.x, 1.0, h.z, 0.5 + Math.random() * 0.4, 1.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6,
                    0.5, 1.8, 1.4 + Math.random() * 0.6, 0.5 * k + 0.12, [0.16, 0.16, 0.17]);
            }
        }
        // Some fora da tela depois de um tempo (vira outro carro novo / outra viatura de patrulha).
        if (car.wreckT > Config.crash.wreckLife) {
            const f = g.camera.target;
            if (Math.hypot(car.position.x - f.x, car.position.z - f.z) > 75) this._removeWreck(car);
        }
    }

    _removeWreck(car) {
        const g = this.g;
        if (car.isBoat) g.boats.removeWreck(car);
        else if (g.vehicleManager && g.vehicleManager.vehicles.includes(car)) g.traffic.removeWreck(car);
        else if (g.policeManager) g.policeManager.removeWreck(car);
    }
}
