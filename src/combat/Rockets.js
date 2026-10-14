// ============================================================================
// Rockets — os FOGUETES do RPG e do lança-foguetes (Combat.fire de uma arma com `rocket`: Weapons.rpg / Weapons.launcher).
//
//   RPG            foguete LIVRE (sem guia), rápido: vai reto para onde foi mirado. Mirado no helicóptero (a mira assistida pega quem
//                  voa), sobe até ele e explode ao passar perto (espoleta de proximidade). Um acerto derruba.
//   Lança-foguetes 4 tubos, foguete TELEGUIADO: ao mirar, TRAVA no alvo mais perto do centro da mira (helicóptero primeiro, depois
//                  veículos — anel vermelho em volta dele); o foguete sai devagar, acelera e faz a curva atrás do alvo. Um acerto
//                  derruba o helicóptero.
// Voo: em 3D de verdade (y), com chama no rabo e rastro de fumaça. Rente ao chão bate em prédio, carro e gente; subindo atrás de quem
// voa, passa por cima dos prédios. Explosão no chão = a de carro (CarDamage.boomAt: dano em área, arremessa, explode carros em
// cadeia); no ar = bola de fogo lá em cima, que só fere quem voa. Arma só depois de ARM m (perto demais, o foguete bate e não explode).
// ============================================================================

const Rockets = {
    MAX: 12,
    ARM: 4,                 // m percorridos até a ogiva armar
    DEF: {
        rpg: { speed: 40, top: 40, accel: 0, turn: 0, life: 4, bl: 1.3, prox: 3.0, airR: 7, len: 0.9, col: [0.3, 0.38, 0.18] },
        launcher: { speed: 20, top: 46, accel: 55, turn: 3.2, life: 6, bl: 1.15, prox: 3.4, airR: 6.5, len: 0.75, col: [0.33, 0.37, 0.24], homing: true },
    },
    LOCK_CONE: 0.55,        // rad para cada lado da mira: o lança-foguetes trava no alvo
    LOCK_R: 150,            // m: alcance da trava
    list: [],
    lock: null,             // alvo travado agora (lança-foguetes na mão): { ref, kind }

    init(game) {
        this.g = game;
        const sc = game.scene;
        this.body = new GlowBatch(sc, this.MAX, 'rocketBody', 'dash');      // o foguete (cápsula escura ao longo do voo)
        this.fx = new GlowBatch(sc, this.MAX * 2, 'rocketFx', 'glow');      // chama do motor + halo
        this.ring = new GlowBatch(sc, 2, 'rocketLock', 'ring');             // a trava do lança-foguetes
        for (let i = 0; i < this.MAX; i++) this.body.alloc();
        for (let i = 0; i < this.MAX * 2; i++) this.fx.alloc();
        for (let i = 0; i < 2; i++) this.ring.alloc();
        this._free = [];
        for (let i = this.MAX - 1; i >= 0; i--) this._free.push(i);
        this.list = [];
        this.lock = null; this._lockT = 0;
        this._heliPrev = null;
    },

    // ------------------------------------------------------------------ alvos
    // Quem voa: o helicóptero da polícia e os outros helicópteros (Chopper) no ar. Posição 3D (y = altura).
    _air(fn) {
        const g = this.g, h = g.policeManager && g.policeManager.heli;
        if (h && h.alive) fn(h, h.alt, 'heli');
        if (g.choppers) for (const c of g.choppers) if (c.alive && !c.pilot && c.flying) fn(c, c.alt, 'chopper');      // (o que o jogador pilota não)
    },
    _altOf(t) { return t.alt !== undefined ? t.alt : 1.0; },
    // Alvo da trava do lança-foguetes a partir de (x, z) olhando para `angle`: helicóptero > viatura > outro veículo, no cone.
    lockTarget(x, z, angle) {
        const g = this.g;
        let best = null, bs = Infinity;
        const consider = (t, w, kind, needSight) => {
            const p = t.position, dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz);
            if (d > this.LOCK_R || d < 6) return;
            const da = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - angle), Math.cos(Math.atan2(dx, dz) - angle)));
            if (da > this.LOCK_CONE) return;
            const s = (da * 30 + d * 0.08) * w;
            if (s >= bs) return;
            if (needSight && !MapGeo.hasLineOfSight(x, z, p.x, p.z)) return;
            bs = s; best = { ref: t, kind };
        };
        this._air((t, alt, kind) => consider(t, 0.35, kind, false));
        if (g.policeManager) for (const c of g.policeManager.cars) if (!c.wrecked && c.body) consider(c, 0.8, 'car', true);
        if (g.vehicleManager) for (const c of g.vehicleManager.vehicles) if (!c.wrecked && c.body && c !== g.activeCar && !c.isBike) consider(c, 1.4, 'car', true);
        return best;
    },

    // ------------------------------------------------------------------ disparo
    // Chamado pelo Combat.fire: (mx, mz) = boca do tubo; angle = mira. target: o que a mira assistida pegou (RPG) ou a trava.
    fire(shooter, key, mx, mz) {
        const D = this.DEF[key], g = this.g;
        if (!D || !this._free.length) return 0;
        const i = this._free.pop(), W = Weapons[key];
        const a = shooter.angle + (Math.random() - 0.5) * W.spread;
        let target = null;
        if (D.homing) target = this.lock || this.lockTarget(shooter.x, shooter.z, shooter.angle);
        else {                                                          // RPG: mirou em quem voa? (a reta passa perto dele) — sobe até lá
            this._air((t, alt, kind) => {
                const d0 = Math.hypot(t.position.x - shooter.x, t.position.z - shooter.z), v = this._vel(t), tt = Math.min(2.5, d0 / D.speed);
                const dx = t.position.x + v.x * tt - shooter.x, dz = t.position.z + v.z * tt - shooter.z, d = Math.hypot(dx, dz);      // (onde ele vai estar)
                const da = Math.atan2(Math.sin(Math.atan2(dx, dz) - a), Math.cos(Math.atan2(dx, dz) - a));
                if (!target && d < 130 && Math.abs(da) * d < 7) target = { ref: t, kind };
            });
        }
        const o = {
            i, key, D, x: mx, z: mz, y: 1.45, px: mx, pz: mz, py: 1.45, dir: a, sp: D.speed, t: 0, trav: 0, owner: shooter.owner,
            dmg: W.dmg * (shooter.dmgMul || 1), target, air: !!(target && target.kind !== 'car'), smoke: 0,
        };
        this.list.push(o);
        // tranco: sopro de fumaça para trás do tubo (o "backblast") e o clarão na frente
        const P = g.carLights && g.carLights.puffs, bx = -Math.sin(a), bz = -Math.cos(a);
        if (P) for (let k = 0; k < 10; k++) P.emit(shooter.x + bx * (0.6 + k * 0.35), 1.5, shooter.z + bz * (0.6 + k * 0.35), bx * (3 + Math.random() * 3) + (Math.random() - 0.5) * 2, 0.4 + Math.random() * 0.6, bz * (3 + Math.random() * 3) + (Math.random() - 0.5) * 2, 0.5, 2.6 + Math.random(), 1.2 + Math.random() * 0.8, 0.45, [0.72, 0.71, 0.68]);
        if (g.camera && shooter.owner === 'player') g.camera.shake(0.45);
        return 1;
    },

    // ------------------------------------------------------------------ quadro
    update(dt) {
        if (!this.g) return;
        this._updateLock(dt);
        for (let n = this.list.length - 1; n >= 0; n--) {
            const o = this.list[n], D = o.D;
            o.t += dt;
            o.px = o.x; o.pz = o.z; o.py = o.y;
            if (D.accel) o.sp = Math.min(D.top, o.sp + D.accel * dt);
            // guia: vira (até `turn` rad/s) para onde o alvo VAI estar; subindo/descendo até a altura dele
            const T = o.target && o.target.ref;
            if (T && (T.alive === false || T.wrecked)) o.target = null;
            if (o.target) {
                const p = T.position, d = Math.hypot(p.x - o.x, p.z - o.z), tt = Math.min(2, d / Math.max(10, o.sp));
                const v = this._vel(T), ax = p.x + v.x * tt, az = p.z + v.z * tt;
                if (D.turn) {
                    let da = Math.atan2(ax - o.x, az - o.z) - o.dir;
                    da = Math.atan2(Math.sin(da), Math.cos(da));
                    const k = o.t < 0.15 ? 0.3 : 1;                                     // (sai do tubo reto e só depois faz a curva)
                    o.dir += Math.max(-D.turn * k * dt, Math.min(D.turn * k * dt, da));
                }
                if (o.air) {                                                            // sobe em rampa: chega à altura dele junto com a distância
                    const left = Math.max(0.12, d / Math.max(10, o.sp));
                    o.y += (this._altOf(T) - o.y) * Math.min(1, dt / left);
                }
            }
            const step = o.sp * dt;
            o.x += Math.sin(o.dir) * step; o.z += Math.cos(o.dir) * step;
            o.trav += step;
            if (this._collide(o)) { this._drop(n); continue; }
            if (o.t >= D.life) { this._explode(o, o.x, o.y, o.z, null); this._drop(n); continue; }
            this._draw(o, dt);
        }
        this.body.flush(); this.fx.flush();
    },

    // Velocidade de um alvo (helicóptero: vx/vz; carro: a do corpo físico).
    _vel(t) {
        if (t.vx !== undefined) return { x: t.vx || 0, z: t.vz || 0 };
        if (t.velocity) return { x: t.velocity.x || 0, z: t.velocity.z || 0 };
        return { x: 0, z: 0 };
    },

    // Bateu em algo neste quadro? (explode — ou, ainda desarmado, só bate)
    _collide(o) {
        const g = this.g, D = o.D, armed = o.trav >= this.ARM;
        // quem voa: espoleta de proximidade (3D)
        let air = null;
        this._air((t, alt, kind) => {
            if (air) return;
            const p = t.position;
            if (this._segDist3(o, p.x, alt, p.z) < D.prox + (kind === 'heli' ? 0.4 : 0)) air = t;
        });
        if (air) { this._explode(o, o.x, o.y, o.z, air); return true; }
        if (o.y > 3.2) return false;                                         // (lá em cima: só quem voa)
        // gente (o atirador não)
        const sx = o.x - o.px, sz = o.z - o.pz, sl2 = sx * sx + sz * sz || 1e-6;
        const hitBody = (t, r) => {
            const p = t.position, u = Math.max(0, Math.min(1, ((p.x - o.px) * sx + (p.z - o.pz) * sz) / sl2));
            return (o.px + sx * u - p.x) ** 2 + (o.pz + sz * u - p.z) ** 2 < r * r;
        };
        const people = [];
        if (g.npcManager) people.push(...g.npcManager.npcs);
        if (g.policeManager) people.push(...g.policeManager.officers);
        if (g.gangs) people.push(...g.gangs.members);
        if (o.owner !== 'player' && g.player && g.mode === 'player') people.push(g.player);
        for (const t of people) {
            if (!t.alive || (t.actor && t.actor.visible === false) || !hitBody(t, 0.6)) continue;
            if (!armed) { this._dud(o, t); return true; }
            this._explode(o, o.x, o.y, o.z, t);
            return true;
        }
        // carros (o retângulo de cada um)
        for (let k = 1; k <= 2; k++) {
            const x = o.px + sx * k / 2, z = o.pz + sz * k / 2, car = g.combat._carAt(x, z, 0.15);
            if (!car || car === (g.mode === 'car' ? g.activeCar : null) && o.owner === 'player') continue;
            if (!armed) { this._dud(o, car, x, z, true); return true; }
            this._explode(o, x, o.y, z, car, false, true);
            return true;
        }
        // prédios e muros altos (subindo atrás de quem voa, passa por cima)
        const dist = Math.sqrt(sl2), ns = Math.max(1, Math.ceil(dist / 0.7));
        for (let k = 1; k <= ns; k++) {
            const x = o.px + sx * k / ns, z = o.pz + sz * k / ns;
            for (const b of CityGrid.obstaclesNear(x, z)) {
                if (b.h > 1.6 && b.h > o.y - 0.3 && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) {
                    const bx = x - sx / ns * 0.8, bz = z - sz / ns * 0.8;           // (explode do lado de cá da parede)
                    if (!armed) { this._dud(o, null, bx, bz); return true; }
                    this._explode(o, bx, o.y, bz, null);
                    return true;
                }
            }
        }
        // caiu na água / saiu do mapa
        if (o.y < 2 && !MapGeo.isLand(o.x, o.z) && MapGeo.waterDepth && MapGeo.waterDepth(o.x, o.z) > 0.3 && o.t > 0.6) { this._explode(o, o.x, 0.3, o.z, null, true); return true; }
        return false;
    },
    // Distância (3D) do trecho percorrido neste quadro até o ponto (x, y, z).
    _segDist3(o, x, y, z) {
        const sx = o.x - o.px, sy = o.y - o.py, sz = o.z - o.pz, l2 = sx * sx + sy * sy + sz * sz || 1e-6;
        const u = Math.max(0, Math.min(1, ((x - o.px) * sx + (y - o.py) * sy + (z - o.pz) * sz) / l2));
        return Math.hypot(o.px + sx * u - x, o.py + sy * u - y, o.pz + sz * u - z);
    },

    // Ainda desarmado (perto demais de quem atirou): bate, solta faíscas e cai — machuca só quem levou a pancada.
    _dud(o, t, x = o.x, z = o.z, car = false) {
        const g = this.g;
        if (t && car && t.takeDamage) t.takeDamage(30, o.owner);
        else if (t && t.takeDamage) t.takeDamage(45, { x: o.px, z: o.pz }, o.owner, { dx: Math.sin(o.dir), dz: Math.cos(o.dir), power: 6 });
        for (let k = 0; k < 8; k++) g.combat.spark(x + (Math.random() - 0.5), 0.6 + Math.random(), z + (Math.random() - 0.5), [1, 0.8, 0.4]);
        AudioFX.thud(x, z);
    },

    // BUM. hit = quem levou o foguete na cara (dano cheio); quem voa perto leva o da onda de choque.
    _explode(o, x, y, z, hit, water = false, car = false) {
        const g = this.g, D = o.D, src = o.owner === 'player' ? 'player' : 'env';
        // quem voa: acerto direto ou estilhaços (a explosão lá em cima)
        this._air((t, alt) => {
            const d = t === hit ? 0 : Math.hypot(t.position.x - x, alt - y, t.position.z - z);
            if (d > D.airR) return;
            const dmg = t === hit ? o.dmg : o.dmg * 0.75 * (1 - d / D.airR);
            if (t.lastHitBy !== undefined && src === 'player') t.lastHitBy = 'player';
            t.takeDamage(dmg, { x, z }, o.owner);
        });
        if (y > 4) {                                                          // no ar: bola de fogo lá em cima, ninguém no chão se machuca
            this._airBoom(x, y, z, D.bl);
            if (src === 'player') {
                g.wanted.reportCrime();
                if (g.policeManager) g.policeManager.alertNear({ x, z }, 110);
            }
            if (g.npcManager) g.npcManager.alertViolence({ x, z }, 45);
            return;
        }
        if (hit && car && hit.takeDamage && !hit.wrecked) {                   // carro atingido em cheio: explode na hora
            hit.takeDamage(Math.max(o.dmg, hit.hp || 0) + 1, src);
            if (hit.burning > 0) hit.burning = 0.02;
        }
        if (water) {                                                          // na água: chafariz e a onda de choque menor
            if (typeof Throwables !== 'undefined') Throwables._splash(x, z, 3);
            AudioFX._burst(x, z, { vol: 0.8, dur: 0.7, f0: 600, f1: 50, maxDist: 180 });
            g.carDamage._blast(x, z, Config.crash.explosionR * 0.5 * D.bl, src, null, D.bl * 0.5);
            if (src === 'player') g.wanted.reportCrime();
            return;
        }
        g.carDamage.boomAt(x, z, src, D.bl, false);
    },

    // Explosão no ar: clarão, bola de fogo, brasas e fumaça na altura `y`.
    _airBoom(x, y, z, bl) {
        const g = this.g, F = g.carDamage && g.carDamage.flameFx, P = g.carLights && g.carLights.puffs;
        for (let i = 0; i < 18; i++) g.combat.spark(x + (Math.random() - 0.5) * 3, y + (Math.random() - 0.5) * 3, z + (Math.random() - 0.5) * 3, [1, 0.5 + Math.random() * 0.4, 0.15], 0.35);
        if (F) for (let i = 0; i < 40 * bl; i++) {
            const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 6;
            F.emit(x + Math.sin(a) * 0.5, z + Math.cos(a) * 0.5, y - 1 + Math.random() * 2, 1.6 + Math.random() * 2.2, 0.45 + Math.random() * 0.5, 1.0, 1.5 + Math.random() * 2.5, Math.sin(a) * s, Math.cos(a) * s);
        }
        if (P) for (let i = 0; i < 16; i++) {
            const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 4;
            P.emit(x, y, z, Math.sin(a) * s, (Math.random() - 0.3) * 3, Math.cos(a) * s, 1.4, 4.2 + Math.random() * 2, 2.2 + Math.random() * 1.4, 0.6, [0.14, 0.13, 0.13]);
        }
        AudioFX.explosion(x, z);
        const c = g.camera && g.camera.target, fd = c ? Math.hypot(x - c.x, z - c.z) : 99;
        if (fd < 90) g.camera.shake(1.2 * (1 - fd / 90));
    },

    // Desenho: o corpo (cápsula escura ao longo do voo), a chama do motor e o rastro de fumaça.
    _draw(o, dt) {
        const g = this.g, D = o.D, fx = Math.sin(o.dir), fz = Math.cos(o.dir), rx = fz, rz = -fx, L = D.len, w = 0.17, y = o.y;
        const hx = o.x + fx * L * 0.5, hz = o.z + fz * L * 0.5, tx = o.x - fx * L * 0.5, tz = o.z - fz * L * 0.5;
        // (subindo: a ponta mais alta que o rabo)
        const dy = (o.y - o.py) / Math.max(1e-3, o.sp * dt) * L * 0.5;
        this.body.quad(o.i, tx - rx * w, y - dy, tz - rz * w, tx + rx * w, y - dy, tz + rz * w, hx - rx * w, y + dy, hz - rz * w, hx + rx * w, y + dy, hz + rz * w);
        this.body.color(o.i, D.col[0], D.col[1], D.col[2], 1);
        const fl = 0.75 + Math.random() * 0.5, j = o.i * 2;
        this.fx.place(j, tx - fx * 0.25, y - dy + 0.02, tz - fz * 0.25, 0.7 * fl);
        this.fx.color(j, 1.0, 0.75, 0.35, 0.95);
        this.fx.place(j + 1, tx - fx * 0.5, y - dy, tz - fz * 0.5, 2.2 * fl);
        this.fx.color(j + 1, 1.0, 0.45, 0.12, 0.35);
        // fumaça: um sopro a cada ~0,35 m
        const P = g.carLights && g.carLights.puffs;
        o.smoke += o.sp * dt;
        if (P) while (o.smoke >= 0.35) {
            o.smoke -= 0.35;
            const back = o.smoke;
            P.emit(tx - fx * back + (Math.random() - 0.5) * 0.12, y - dy, tz - fz * back + (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.5, 0.25, (Math.random() - 0.5) * 0.5, 0.35, 1.6 + Math.random() * 0.6, 1.6 + Math.random() * 1.2, 0.42, [0.8, 0.79, 0.77]);
        }
    },
    _drop(n) {
        const o = this.list[n];
        this.body.off(o.i); this.fx.off(o.i * 2); this.fx.off(o.i * 2 + 1);
        this._free.push(o.i);
        this.list.splice(n, 1);
    },

    // Trava do lança-foguetes: com ele na mão, procura o alvo à frente (~7×/s) e marca com um anel vermelho que pulsa.
    _updateLock(dt) {
        const g = this.g, p = g.player, R = this.ring;
        const on = p && p.alive && g.mode === 'player' && p.weapon === 'launcher' && !g.inventoryOpen;
        if (!on) { if (this.lock) { this.lock = null; R.off(0); R.off(1); R.flush(); } return; }
        this._lockT -= dt;
        if (this._lockT <= 0) {
            this._lockT = 0.15;
            const ang = g.aim && g.aim.active && g.aim.heading !== undefined ? g.aim.heading : p.root.rotation.y;
            const was = this.lock && this.lock.ref;
            this.lock = this.lockTarget(p.position.x, p.position.z, ang);
            if (this.lock && this.lock.ref !== was) AudioFX.blip(this.lock.kind === 'car' ? 980 : 1320, 0.08, 0.12);     // bipe de trava
        }
        const L = this.lock;
        if (!L) { R.off(0); R.off(1); R.flush(); return; }
        const t = L.ref, y = L.kind === 'car' ? 0.25 : this._altOf(t), s = (L.kind === 'car' ? 6 : 9) * (1 + 0.08 * Math.sin(performance.now() / 90));
        R.place(0, t.position.x, y, t.position.z, s); R.color(0, 1.0, 0.18, 0.12, 0.85);
        R.place(1, t.position.x, y, t.position.z, s * 0.62); R.color(1, 1.0, 0.3, 0.2, 0.5);
        R.flush();
    },

    clear() {
        for (let n = this.list.length - 1; n >= 0; n--) this._drop(n);
        this.lock = null;
        if (this.ring) { this.ring.off(0); this.ring.off(1); this.ring.flush(); }
        if (this.body) { this.body.flush(); this.fx.flush(); }
    },
};
