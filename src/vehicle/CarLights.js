// ============================================================================
// CarLights — luzes e fumaça de todos os carros, em poucos draw calls:
//   faróis (brilho + cone de luz no chão, à noite) | lanternas (luz de freio forte) |
//   setas piscando nas curvas | giroflex da polícia (azul/vermelho + reflexo no chão) |
//   fumaça do escapamento (ao acelerar e em marcha lenta).
// Lê o estado de cada Vehicle: braking, accelerating, signal, lightsOn, sirenOn, mode.
// Carros longe da câmera são ignorados (nada de custo para o que não se vê).
// ============================================================================

class CarLights {
    constructor(scene, maxCars = 120) {
        this.glow = new GlowBatch(scene, maxCars * 10, 'carGlow', 'glow');
        this.cones = new GlowBatch(scene, maxCars * 2, 'carCone', 'cone');
        this.puffs = new PuffSystem(scene, 420);
        this.slots = new Map();          // carro -> { hl:[2], tl:[2], sig:[2], siren:[2], pool, cone }
        this.time = 0;
        this.range = 62;                 // só processa carros até esta distância do foco
    }

    _slots(car) {
        let s = this.slots.get(car);
        if (!s) {
            s = {
                hl: [this.glow.alloc(), this.glow.alloc()],
                tl: [this.glow.alloc(), this.glow.alloc()],
                sig: [this.glow.alloc(), this.glow.alloc()],
                siren: [this.glow.alloc(), this.glow.alloc()],
                pool: this.glow.alloc(),
                beam: this.glow.alloc(),
                cone: [this.cones.alloc(), this.cones.alloc()],
                lamps: car.spec.lamps || CarSheet.lamps(car.spec.id),
                puffT: Math.random(),
            };
            this.slots.set(car, s);
        }
        return s;
    }

    // O carro saiu do jogo: devolve os quads de luz dele.
    release(car) {
        const s = this.slots.get(car);
        if (!s) return;
        for (const k of ['hl', 'tl', 'sig', 'siren']) for (const i of s[k]) this.glow.free(i);
        this.glow.free(s.pool); this.glow.free(s.beam);
        for (const i of s.cone) this.cones.free(i);
        this.slots.delete(car);
    }

    // night: 0..1 | focus: {x, z} (centro da câmera) | cars: todos os carros (civis + polícia)
    update(dt, night, focus, cars) {
        this.time += dt;
        const g = this.glow, c = this.cones;
        const blink = Math.floor(this.time * 2.6) % 2 === 0;
        const sirenPhase = Math.floor(this.time * 5) % 2 === 0;
        const range2 = this.range * this.range;

        for (const car of cars) {
            const s = this._slots(car);
            const p = car.position;
            const dx = p.x - focus.x, dz = p.z - focus.z;
            if (dx * dx + dz * dz > range2) {                      // fora de vista: apaga tudo (uma vez, ao sair do alcance)
                if (s.dark) continue;
                s.dark = true;
                for (const i of s.hl) g.off(i);
                for (const i of s.tl) g.off(i);
                for (const i of s.sig) g.off(i);
                for (const i of s.siren) g.off(i);
                g.off(s.pool); g.off(s.beam); c.off(s.cone[0]); c.off(s.cone[1]);
                continue;
            }
            s.dark = false;

            // Vetor frente = o da imagem DESENHADA (o sprite tem 32 direções): luzes e feixes saem exatamente das lanternas do desenho,
            // sem o desvio de até ~5,6° entre o corpo físico e o sprite.
            let fx, fz;
            const vis = car.visual;
            if (vis && vis.sheet && vis.sheet.dirs && !car.spec.boat) { const a = (vis.dir * Math.PI * 2) / vis.sheet.dirs; fx = Math.sin(a); fz = Math.cos(a); }
            else { const f = car.body.getDirection(BABYLON.Axis.Z); fx = f.x; fz = f.z; const fl = hypot(fx, fz) || 1; fx /= fl; fz /= fl; }
            const rx = fz, rz = -fx;                              // direita do carro
            const L = s.lamps;
            const alive = car.mode !== 'parked' && car.mode !== 'abandoned' && !car.destroyed;

            // ---- Faróis: ligados à noite para quem está em uso (circulando, dirigido pelo jogador, viatura)
            const on = (alive || (car.controlled && !car.destroyed)) && (car.lightsOn || night > 0.3);
            const hazard = !!car.hazard && !car.destroyed;                // alarme tocando: pisca-alerta + faróis piscando
            const hI = hazard ? 0.9 : (on ? Math.min(1, (night - 0.15) / 0.5) : 0);
            const el = car.elev || 0, hy = 1.7 + el;
            for (let k = 0; k < 2; k++) {
                const sx = k === 0 ? -L.x : L.x;
                g.place(s.hl[k], p.x + fx * L.zF + rx * sx, hy, p.z + fz * L.zF + rz * sx, 1.7);
                if (hI > 0.02) g.color(s.hl[k], 1.0, 0.94, 0.75, 0.5 * hI); else g.off(s.hl[k]);
            }
            // Um cone por farol, em "V" RETO: o vértice fica na própria lâmpada e o feixe abre simetricamente ao longo do vetor
            // frente do carro (o eixo do feixe é paralelo ao do carro, sem desviar para fora). Os dois se sobrepõem à frente.
            for (let k = 0; k < 2; k++) {
                const side = k === 0 ? -1 : 1;
                if (false && hI > 0.02) {                                    // feixe em cone DESLIGADO (so o brilho do farol e a poça de luz no chão)
                    const n0 = L.zF, n1 = L.zF + 10;
                    const o0 = L.x * side, o1 = L.x * side;                     // centro do feixe: o mesmo, perto e longe (reto)
                    const hw0 = 0.65, hw1 = 3.7;                                // meia largura: ponta na lâmpada / aberto no fim
                    const cx0 = p.x + fx * n0, cz0 = p.z + fz * n0, cx1 = p.x + fx * n1, cz1 = p.z + fz * n1;
                    c.quad(s.cone[k], cx0 + rx * (o0 - hw0), 0.22, cz0 + rz * (o0 - hw0), cx0 + rx * (o0 + hw0), 0.22, cz0 + rz * (o0 + hw0),
                        cx1 + rx * (o1 - hw1), 0.22, cz1 + rz * (o1 - hw1), cx1 + rx * (o1 + hw1), 0.22, cz1 + rz * (o1 + hw1));
                    c.color(s.cone[k], 1.0, 0.88, 0.58, 0.9 * hI);
                } else c.off(s.cone[k]);
            }
            // Poça de luz no chão à frente do carro (como a dos postes): grande, macia e quente.
            if (hI > 0.02) { g.place(s.beam, p.x + fx * (L.zF - 0.8), 0.23, p.z + fz * (L.zF - 0.8), 21); g.color(s.beam, 1.0, 0.82, 0.5, 0.34 * hI); } else g.off(s.beam);   // poça morna e grande em volta do carro

            // ---- Lanternas: vermelho fraco com os faróis ligados; forte e maior ao frear.
            const braking = car.braking && (alive || car.controlled);
            const tI = braking ? 1.0 : (hI > 0.02 ? 0.5 * hI : (alive || car.controlled ? 0.18 : 0));
            for (let k = 0; k < 2; k++) {
                const sx = k === 0 ? -L.x : L.x;
                g.place(s.tl[k], p.x + fx * L.zR + rx * sx, hy, p.z + fz * L.zR + rz * sx, braking ? 2.0 : 1.2);
                // Seta traseira: o lado da curva pisca em âmbar no lugar da lanterna.
                if (hazard) {
                    g.color(s.tl[k], 1.0, 0.62, 0.08, 0.95);
                } else if (car.signal === (k === 0 ? -1 : 1) && alive) {
                    if (blink) g.color(s.tl[k], 1.0, 0.62, 0.08, 0.95); else g.off(s.tl[k]);
                } else if (tI > 0.02) g.color(s.tl[k], 1.0, 0.1, 0.07, 0.95 * tI);
                else g.off(s.tl[k]);
            }

            // ---- Setas dianteiras: lado da curva, um pouco para fora do farol.
            for (let k = 0; k < 2; k++) {
                const side = k === 0 ? -1 : 1;
                g.place(s.sig[k], p.x + fx * (L.zF - 0.45) + rx * side * (L.x + 0.62), hy, p.z + fz * (L.zF - 0.45) + rz * side * (L.x + 0.62), 0.7);
                if (hazard || (car.signal === side && blink && alive)) g.color(s.sig[k], 1.0, 0.62, 0.08, 0.95); else g.off(s.sig[k]);
            }

            // ---- Giroflex (viaturas em perseguição) + reflexo colorido no chão.
            if (car.sirenOn) {
                const A = sirenPhase ? CarLights.SIREN[0] : CarLights.SIREN[1];
                const B = sirenPhase ? CarLights.SIREN[2] : CarLights.SIREN[3];
                g.place(s.siren[0], p.x + fx * -0.1 - rx * 0.32, 2.05 + el, p.z + fz * -0.1 - rz * 0.32, 1.9);
                g.place(s.siren[1], p.x + fx * -0.1 + rx * 0.32, 2.05 + el, p.z + fz * -0.1 + rz * 0.32, 1.9);
                g.color(s.siren[0], A[0], A[1], A[2], 1);
                g.color(s.siren[1], B[0], B[1], B[2], 1);
                const col = sirenPhase ? CarLights.SIREN[4] : CarLights.SIREN[5];
                g.place(s.pool, p.x, 0.25, p.z, 11);
                g.color(s.pool, col[0], col[1], col[2], 0.16 + 0.1 * night);
            } else {
                g.off(s.siren[0]); g.off(s.siren[1]); g.off(s.pool);
            }

            // ---- Fumaça do escapamento (cano traseiro, lado esquerdo). Bicicleta não tem.
            if (alive && !car.spec.noExhaust) {
                const speed = Math.abs(car.forwardSpeed);
                const rate = car.sirenOn ? 11 : (car.accelerating ? 9 : (speed > 1 ? 2.6 : 1.4));
                s.puffT -= dt;
                if (s.puffT <= 0) {
                    s.puffT = (0.7 + Math.random() * 0.6) / rate;
                    const ex = p.x + fx * (L.zR + 0.15) - rx * 0.55, ez = p.z + fz * (L.zR + 0.15) - rz * 0.55;
                    const heavy = car.accelerating ? 1 : 0.55;
                    this.puffs.emit(ex, 0.9, ez, -fx * (1.0 + Math.random()) + (Math.random() - 0.5) * 0.9, 0.7 + Math.random() * 0.4, -fz * (1.0 + Math.random()) + (Math.random() - 0.5) * 0.9,
                        0.3 * heavy + 0.1, 0.95 + heavy * 0.7, 0.7 + Math.random() * 0.5, car.accelerating ? 0.55 : 0.32);
                }
            }

            // ---- Chuva: o carro em movimento levanta água dos pneus (leque branco-azulado que sobe e se espalha atrás das rodas).
            const W = Weather.cur;
            if ((alive || car.controlled) && W && W.k > 0.12 && !car.spec.boat) {
                const v = car.velocity, sp = hypot(v.x, v.z);
                if (sp > 2.5) {
                    s.sprayT = (s.sprayT || 0) - dt;
                    if (s.sprayT <= 0) {
                        s.sprayT = 1 / Math.min(60, sp * (0.9 + 2.2 * W.k));
                        const hl = car.halfLen, hw = car.halfW, vx = v.x / sp, vz = v.z / sp, front = Math.random() < 0.35, side = Math.random() < 0.5 ? -1 : 1;
                        const wz = front ? hl * 0.62 : -hl * 0.62, wx = side * (hw - 0.12);
                        const px = p.x + fx * wz + rx * wx, pz = p.z + fz * wz + rz * wx, spd = Math.min(sp, 22);
                        this.puffs.emit(px, 0.28, pz, -vx * spd * 0.22 + rx * side * (0.7 + Math.random() * 1.1) + (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.6 + spd * 0.03,
                            -vz * spd * 0.22 + rz * side * (0.7 + Math.random() * 1.1) + (Math.random() - 0.5) * 0.6, 0.3, 1.1 + spd * 0.06, 0.5 + Math.random() * 0.3, 0.42 + 0.25 * W.k, [0.86, 0.93, 1.0]);
                    }
                }
            }
        }
        this.puffs.update(dt);
        g.flush();
        c.flush();
    }
}

// Cores do giroflex (azul forte/fraco, vermelho fraco/forte) e do reflexo no chão (azul/vermelho): constantes, sem array novo por quadro.
CarLights.SIREN = [[0.2, 0.45, 1.0], [0.12, 0.2, 0.5], [0.5, 0.08, 0.08], [1.0, 0.18, 0.15], [0.15, 0.3, 0.9], [0.9, 0.12, 0.1]];

// ----------------------------------------------------------------------------
// PuffSystem — pool de baforadas de fumaça (cada uma é um quad do GlowBatch 'puff').
// ----------------------------------------------------------------------------
class PuffSystem {
    constructor(scene, capacity) {
        this.batch = new GlowBatch(scene, capacity, 'puffs', 'puff');
        this.n = capacity;
        for (let i = 0; i < capacity; i++) this.batch.alloc();
        this.p = [];
        for (let i = 0; i < capacity; i++) this.p.push({ on: false, age: 0, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s0: 0.3, s1: 1, a0: 0.4 });
        this.next = 0;
    }

    // color: [r,g,b] da baforada (padrão: cinza do escapamento); fumaça de motor quebrado/fogo usa tons escuros.
    emit(x, y, z, vx, vy, vz, s0, s1, life, alpha, color = null) {
        for (let k = 0; k < this.n; k++) {
            const q = this.p[(this.next + k) % this.n];
            if (q.on) continue;
            q.on = true; q.age = 0; q.life = life; q.c = color;
            q.x = x; q.y = y; q.z = z; q.vx = vx; q.vy = vy; q.vz = vz; q.s0 = s0; q.s1 = s1; q.a0 = alpha;
            this.next = (this.next + k + 1) % this.n;
            return;
        }
    }

    update(dt) {
        const b = this.batch;
        for (let i = 0; i < this.n; i++) {
            const q = this.p[i];
            if (!q.on) continue;
            q.age += dt;
            if (q.age >= q.life) { q.on = false; b.off(i); continue; }
            const t = q.age / q.life;
            const damp = Math.exp(-1.8 * dt);
            q.vx *= damp; q.vz *= damp; q.vy *= Math.exp(-0.6 * dt);
            q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
            const size = q.s0 + (q.s1 - q.s0) * Math.sqrt(t);
            b.place(i, q.x, q.y, q.z, size);
            const a = q.a0 * (1 - t) * (1 - t * 0.4);
            const c = q.c;
            if (c) b.color(i, c[0], c[1], c[2], a); else b.color(i, 0.8, 0.8, 0.82, a);
        }
        b.flush();
    }
}
