// ============================================================================
// CarDamage — o que acontece com um carro conforme ele perde vida (hp, em Vehicle):
//   hp < 35%   fumaça saindo do capô (mais densa e escura quanto menos vida)
//   hp = 0     PEGA FOGO: chamas e fumaça preta; motor morto; explode depois de alguns segundos
//   explosão   clarão + bolas de fogo + estouro; dano em área (jogador, pedestres, policiais e outros carros,
//              que podem pegar fogo também = reação em cadeia); tremor de câmera; sobra a CARCAÇA carbonizada
//   carcaça    CONTINUA EM CHAMAS por Config.crash.wreckBurn s (o fogo vai baixando), fumega e some (fora da tela) depois
// O fogo é o FireField: partículas de chama (GlowBatch 'flame' — línguas de fogo com turbulência e cor pelo calor) que sobem do carro,
// brasas, o clarão no chão e a fumaça preta em coluna.
// As fases de AMASSADO do sprite (limpo → 1 → 2 → 3) vêm do Vehicle/CarSheet pela fração de vida.
// Quem causou o dano fica em car.lastHitBy: se foi o jogador (ou o carro dele), as mortes pela explosão
// são crime dele (procurado, polícia ouve).
// ============================================================================

// ---------------------------------------------------------------------------- partículas de chama
// Cada chama nasce num ponto do carro, sobe (a altura vira deslocamento para o norte na tela — 1 m sobe 0,56 m, como nos personagens
// 2,5D), cresce, balança com o vento e esfria (calor → cor) até sumir. Brasas: chamas minúsculas, quentes e rápidas.
class FireField {
    constructor(scene, cap = 1100) {
        this.b = new GlowBatch(scene, cap, 'fireFlames', 'flame');
        this.n = cap; this.p = []; this.next = 0; this.time = 0;
        for (let i = 0; i < cap; i++) { this.b.alloc(); this.p.push({ on: false }); }
    }
    // Uma chama em (x, z), nascendo a h0 m de altura: tamanho (m), vida (s), calor inicial (0..1), subida (m/s) e empurrão (vx, vz).
    emit(x, z, h0 = 0.6, size = 1.2, life = 0.75, heat = 0.95, rise = 1.6, vx = 0, vz = 0) {
        for (let k = 0; k < this.n; k++) {
            const q = this.p[(this.next + k) % this.n];
            if (q.on) continue;
            this.next = (this.next + k + 1) % this.n;
            q.on = true; q.x = x; q.z = z; q.h = h0; q.s = size; q.life = life; q.age = 0; q.heat = heat; q.rise = rise;
            q.vx = vx + (Math.random() - 0.5) * 0.35; q.vz = vz + (Math.random() - 0.5) * 0.35; q.seed = Math.random();
            return;
        }
    }
    update(dt) {
        this.time += dt;
        const b = this.b, U = 0.56, wind = 0.25 * Math.sin(this.time * 0.37);
        let any = false;
        for (let i = 0; i < this.n; i++) {
            const q = this.p[i];
            if (!q.on) continue;
            q.age += dt;
            if (q.age >= q.life) { q.on = false; b.off(i); continue; }
            any = true;
            const u = q.age / q.life;
            q.h += q.rise * dt * (1 - 0.4 * u); q.x += (q.vx + wind) * dt; q.z += q.vz * dt;
            q.vx *= 1 - 1.5 * dt; q.vz *= 1 - 1.5 * dt;
            const s = q.s * (0.55 + 0.75 * Math.sqrt(u)) * (1 - 0.35 * u * u), w = s * 0.5, H = s * 1.45;
            const zb = q.z + q.h * U - s * 0.15, zt = zb + H, y = 1.25 + q.h;
            b.quad(i, q.x - w, y, zt, q.x + w, y, zt, q.x - w, y, zb, q.x + w, y, zb);
            b.color(i, q.heat * (1 - 0.75 * u), q.seed, 0, Math.min(1, Math.sin(Math.PI * Math.min(1, u * 1.15)) * 1.4) * 0.9);
        }
        b.material.setFloat('time', this.time);
        if (any || this._was) b.flush();
        this._was = any;
    }
}

class CarDamage {
    constructor(game) {
        this.g = game;
        this.fire = new GlowBatch(game.scene, 140, 'carFire', 'glow');   // clarões (aditivo): o brilho do fogo no chão e o da explosão
        this.flameFx = new FireField(game.scene);                      // as chamas de verdade (línguas de fogo subindo)
        this.groundFires = [];                                         // fogo no chão sem carro (helicóptero que caiu): { x, z, t, dur }
        this.booms = [];               // explosões em andamento
        this.time = 0;
    }

    get puffs() { return this.g.carLights.puffs; }

    // Todos os veículos (civis, barcos, polícia) numa lista REAPROVEITADA: antes eram 2 arrays novos de ~200 itens a cada chamada,
    // várias vezes por quadro (dano, colisões, luzes). Quem chama só percorre na hora; não guarde a lista.
    allCars() {
        const g = this.g, out = this._all || (this._all = []);
        out.length = 0;
        if (g.vehicleManager) { for (const c of g.vehicleManager.vehicles) out.push(c); for (const c of g.vehicleManager.boats) out.push(c); }
        if (g.policeManager) for (const c of g.policeManager.cars) out.push(c);
        return out;
    }

    update(dt) {
        this.time += dt;
        const f = this.g.camera.target;
        for (const car of this.allCars()) {
            const near = hypot(car.position.x - f.x, car.position.z - f.z) < 75;
            if (car.burning > 0) this._burn(car, dt, near);
            else if (car.wrecked) this._wreck(car, dt, near);
            else if (car.hp > 0 && car.hp / car.maxHp < Config.crash.smokeBelow) this._smoke(car, dt, near);
        }
        this._updateGroundFires(dt);
        this._updateBooms(dt);
        this.flameFx.update(dt);
        this.fire.flush();
    }

    // Pontos do carro em chamas (no espaço dele: frente u, lado v, m): o motor primeiro; a carcaça, inteira.
    _carPoint(car, u, v) {
        const p = car.position, d = car.fwdToRef(this._hd2 || (this._hd2 = new BABYLON.Vector3()));
        const l = hypot(d.x, d.z) || 1, fx = d.x / l, fz = d.z / l;
        return { x: p.x + fx * u + fz * v, z: p.z + fz * u - fx * v };
    }
    // Chamas de um carro com intensidade I (0..1): rate chamas/s espalhadas entre a frente (u0) e a traseira (u1).
    _flames(car, dt, I, u0, u1, rate) {
        car._flameAcc = (car._flameAcc || 0) + dt * rate * I;
        const hw = (car.halfW || 1) * 0.75, F = this.flameFx;
        while (car._flameAcc >= 1) {
            car._flameAcc -= 1;
            const P = this._carPoint(car, u1 + Math.random() * (u0 - u1), (Math.random() * 2 - 1) * hw);
            F.emit(P.x, P.z, 0.35 + Math.random() * 0.5, (1.0 + Math.random() * 0.9) * (0.55 + 0.45 * I), 0.55 + Math.random() * 0.45, 0.8 + 0.2 * Math.random(), 1.3 + Math.random() * 1.2);
            if (Math.random() < 0.12) {                                                                  // brasa subindo
                const E = this._carPoint(car, u1 + Math.random() * (u0 - u1), (Math.random() * 2 - 1) * hw);
                F.emit(E.x, E.z, 1.0, 0.16 + Math.random() * 0.1, 1.1 + Math.random() * 0.6, 1.0, 3.2 + Math.random() * 1.8, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6);
            }
        }
    }
    // Brilho alaranjado do fogo no chão (tremulando) — slot próprio do carro.
    _glow(car, I) {
        if (car._glowSlot == null) car._glowSlot = this.fire.alloc();
        const p = car.position, fl = Math.sin(this.time * 13 + car.id) * 0.5 + Math.sin(this.time * 7.3) * 0.5;
        this.fire.place(car._glowSlot, p.x, 0.3, p.z, (6 + 5 * I) + fl * 1.2);
        this.fire.color(car._glowSlot, 1.0, 0.42, 0.1, (0.1 + 0.12 * I) + 0.04 * fl);
    }
    _glowOff(car) { if (car._glowSlot != null) { this.fire.free(car._glowSlot); car._glowSlot = null; } }
    // Perto do fogo: queima quem encostar (o jogador a pé).
    _scorch(x, z, r, I, dt) {
        const g = this.g, pl = g.player;
        if (!pl.alive || g.mode !== 'player' || I < 0.25) return;
        if (hypot(pl.position.x - x, pl.position.z - z) > r) return;
        pl.takeDamage(12 * I * dt, true);
        if (!this._scorchMsg || this.time - this._scorchMsg > 4) { this._scorchMsg = this.time; g._flash('Você está se queimando! Saia de perto do fogo'); }
    }

    // Ponto sobre o capô (frente do carro), com leve sorteio.
    _hood(car, back = 0.9) {
        const p = car.position, d = car.fwdToRef(this._hd || (this._hd = new BABYLON.Vector3()));
        const l = hypot(d.x, d.z) || 1, fx = d.x / l, fz = d.z / l;
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

        if (!near) { this._glowOff(car); return; }

        // Chamas subindo do motor (e, perto de estourar, já tomando a cabine) + o clarão alaranjado no chão em volta.
        const hl = car.halfLen || 2, grow = 1 - Math.max(0, car.burning) / (Config.crash.burnTime[1] || 6);
        this._flames(car, dt, 0.75 + 0.25 * grow, hl * 0.95, hl * (0.15 - 0.6 * grow), 70);
        this._glow(car, 0.7 + 0.3 * grow);

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

        // A carcaça vai continuar EM CHAMAS por muito tempo (as chamas baixam aos poucos — _wreck).
        const [wa, wb] = Config.crash.wreckBurn;
        car.wreckBurn = (wa + Math.random() * (wb - wa)) * (car.spec.fire === false ? 0 : car.isBike ? 0.45 : 1);

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
        this._burst(x, z, 1);
        AudioFX.explosion(x, z);
        const fd = hypot(x - g.camera.target.x, z - g.camera.target.z);
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
    // fire: false = sem destroços queimando depois (granada).
    boomAt(x, z, src = 'env', bl = 1.5, fire = true) {
        const g = this.g;
        const b = { x, z, t: 0, ids: [this.fire.alloc(), this.fire.alloc(), this.fire.alloc(), this.fire.alloc(), this.fire.alloc()], off: [] };
        for (let i = 0; i < 4; i++) b.off.push([(Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5]);
        this.booms.push(b);
        for (let i = 0; i < 22; i++) {
            const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 6;
            this.puffs.emit(x, 1.2, z, Math.sin(a) * s, 1.5 + Math.random() * 3, Math.cos(a) * s, 1.2, 4.6 + Math.random() * 2, 2 + Math.random() * 1.5, 0.62, [0.13, 0.13, 0.14]);
        }
        for (let i = 0; i < 16; i++) g.combat.spark(x + (Math.random() - 0.5) * 6, 0.8 + Math.random() * 3, z + (Math.random() - 0.5) * 6, [1, 0.45 + Math.random() * 0.4, 0.12]);
        this._burst(x, z, 1.4);
        if (fire) this.groundFires.push({ x, z, t: 0, dur: 45 + Math.random() * 20 });   // (os destroços ficam queimando no chão)
        AudioFX.explosion(x, z);
        const fd = hypot(x - g.camera.target.x, z - g.camera.target.z);
        if (fd < 90) g.camera.shake(1.8 * (1 - fd / 90));
        this._blast(x, z, Config.crash.explosionR * bl, src, null, bl);
        if (src === 'player') {
            g.wanted.reportCrime();
            if (g.policeManager) g.policeManager.alertNear({ x, z }, 110);
        }
        if (g.npcManager) g.npcManager.alertViolence({ x, z }, 55);
    }

    // A bola de fogo da explosão: chamas grandes saindo para todos os lados e subindo, e uma chuva de brasas.
    _burst(x, z, k = 1) {
        const F = this.flameFx;
        for (let i = 0; i < 46 * k; i++) {
            const a = Math.random() * Math.PI * 2, s = (2 + Math.random() * 5) * k;
            F.emit(x + Math.sin(a) * 0.6, z + Math.cos(a) * 0.6, 0.4 + Math.random() * 0.8, (2.2 + Math.random() * 2.4) * k, 0.55 + Math.random() * 0.6, 1.0, 2.5 + Math.random() * 3, Math.sin(a) * s, Math.cos(a) * s);
        }
        for (let i = 0; i < 26 * k; i++) {
            const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 7;
            F.emit(x, z, 0.8, 0.18 + Math.random() * 0.12, 1.0 + Math.random() * 0.9, 1.0, 4 + Math.random() * 4, Math.sin(a) * s, Math.cos(a) * s);
        }
    }

    // Fogo no chão sem carro (destroços do helicóptero): chamas espalhadas que baixam até apagar, o brilho e a fumaça.
    _updateGroundFires(dt) {
        const f = this.g.camera.target;
        for (let i = this.groundFires.length - 1; i >= 0; i--) {
            const G = this.groundFires[i];
            G.t += dt;
            const I = Math.max(0, 1 - G.t / G.dur);
            if (I <= 0) { if (G.slot != null) this.fire.free(G.slot); this.groundFires.splice(i, 1); continue; }
            if (hypot(G.x - f.x, G.z - f.z) > 75) continue;
            G.acc = (G.acc || 0) + dt * 60 * I;
            while (G.acc >= 1) { G.acc -= 1; const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 2.4; this.flameFx.emit(G.x + Math.sin(a) * r, G.z + Math.cos(a) * r, 0.1, (0.9 + Math.random()) * (0.5 + 0.5 * I), 0.5 + Math.random() * 0.4, 0.9, 1.3 + Math.random()); }
            if (G.slot == null) G.slot = this.fire.alloc();
            this.fire.place(G.slot, G.x, 0.3, G.z, 7 + 4 * I + Math.sin(this.time * 12) * 1.1);
            this.fire.color(G.slot, 1.0, 0.42, 0.1, 0.1 + 0.12 * I);
            G.sm = (G.sm || 0) - dt;
            if (G.sm <= 0) { G.sm = 0.12 / Math.max(0.2, I); this.puffs.emit(G.x + (Math.random() - 0.5) * 2, 1.4, G.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5), 2 + Math.random(), (Math.random() - 0.5), 0.5, 2.2, 1.4, 0.55 * I + 0.1, [0.1, 0.1, 0.11]); }
            this._scorch(G.x, G.z, 2.6, I, dt);
        }
    }

    // Dano em área: jogador, pedestres, policiais e outros carros (reação em cadeia).
    _blast(x, z, R, src, srcCar, bl = 1) {
        const g = this.g;
        const fall = (d) => Math.max(0, 1 - d / R);
        const from = { x, z };

        const pl = g.player;
        if (pl.alive) {
            const pp = g.mode === 'car' && g.activeCar ? g.activeCar.position : pl.position;
            const d = hypot(pp.x - x, pp.z - z), k = fall(d);
            if (k > 0) {
                pl.takeDamage(95 * k * bl);
                if (g.mode !== 'car') {
                    const l = d || 1;
                    if (k > 0.3 && pl.ragdoll && !pl.rag) pl.ragdoll({ dx: (pp.x - x) / l, dz: (pp.z - z) / l, power: 5 + 9 * k, kind: 'hit', lethal: !pl.alive || pl.hp <= 0 });   // jogado longe
                    else { pl.velocity.x += (pp.x - x) / l * 9 * k; pl.velocity.z += (pp.z - z) / l * 9 * k; }
                }
            }
        }
        // pessoas: dano e o ARREMESSO para longe do centro (ragdoll — quem sobrevive é jogado no chão)
        const push = (e, dmg) => {
            const dx = e.position.x - x, dz = e.position.z - z, d = hypot(dx, dz) || 1, k = fall(d);
            if (k > 0) e.takeDamage(dmg(k) * bl, from, src, k > 0.25 ? { dx: dx / d, dz: dz / d, power: 5 + 9 * k } : undefined);
        };
        if (g.npcManager) for (const n of g.npcManager.npcs) if (n.alive) push(n, (k) => 230 * k + 20);
        if (g.policeManager) for (const o of g.policeManager.officers) if (o.alive) push(o, (k) => 190 * k + 15);
        if (g.gangs) for (const o of g.gangs.members) if (o.alive) push(o, (k) => 200 * k + 15);
        for (const c of this.allCars().slice()) {           // (cópia: uma explosão em cadeia pede allCars() de novo no meio)
            if (c === srcCar || c.wrecked) continue;
            const dx = c.position.x - x, dz = c.position.z - z, d = hypot(dx, dz), k = fall(d);
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
        const g = this.g, burn = car.wreckBurn || 0, smokeEnd = burn + 40;
        // EM CHAMAS: forte nos primeiros ~25 s, depois baixando devagar até só brasa/fumaça no fim do wreckBurn
        const I = burn > 0 && car.wreckT < burn ? Math.min(1, 1.15 - 0.85 * Math.pow(car.wreckT / burn, 1.4)) * (car.wreckT < 25 ? 1 : 1 - 0.25 * (car.wreckT - 25) / Math.max(1, burn - 25)) : 0;
        if (I > 0 && near) {
            const hl = car.halfLen || 2;
            this._flames(car, dt, I, hl * 0.95, -hl * 0.9, 90);
            this._glow(car, I);
            this._scorch(car.position.x, car.position.z, (car.halfLen || 2) + 0.6, I, dt);
        } else this._glowOff(car);
        if (near && car.wreckT < smokeEnd && car.spec.fire !== false) {      // (bicicleta caída não fumega)
            car._smokeT = (car._smokeT || 0) - dt;
            if (car._smokeT <= 0) {
                const k = I > 0 ? 0.6 + 0.4 * I : Math.max(0, 1 - (car.wreckT - burn) / 40) * 0.6;
                car._smokeT = I > 0 ? 0.06 + 0.1 * (1 - I) : (0.25 + (1 - k) * 0.7) + Math.random() * 0.2;
                const h = this._hood(car, 0.5 + Math.random() * (car.halfLen || 2));
                this.puffs.emit(h.x, 1.2, h.z, 0.4 + Math.random() * 0.5, 1.8 + Math.random() + I, (Math.random() - 0.5) * 0.7,
                    0.5, 1.8 + 1.2 * I, 1.5 + Math.random() * 0.8, 0.45 * k + 0.12, I > 0 ? [0.09, 0.09, 0.1] : [0.16, 0.16, 0.17]);
            }
        }
        // Some fora da tela depois de um tempo (vira outro carro novo / outra viatura de patrulha). Moto SUA só caída (dá para levantar)
        // não some: quem cuida dela é a Garagem (longe, volta de pé para a vaga).
        if (car.wreckT > Math.max(Config.crash.wreckLife, burn + 25) && !(car.canRaise && (car.keep || car.ownedRec))) {
            const f = g.camera.target;
            if (hypot(car.position.x - f.x, car.position.z - f.z) > 75) this._removeWreck(car);
        }
    }

    _removeWreck(car) {
        const g = this.g;
        this._glowOff(car);
        if (car.isBoat) g.boats.removeWreck(car);
        else if (g.vehicleManager && g.vehicleManager.vehicles.includes(car)) g.traffic.removeWreck(car);
        else if (g.policeManager) g.policeManager.removeWreck(car);
    }
}
