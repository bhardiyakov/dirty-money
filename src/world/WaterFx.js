// ============================================================================
// WaterFx — a água em volta de quem vadeia ou nada (jogador e NPCs) e os respingos.
//
//   ripple(x, z, …)    marola: anel claro que se abre e some (GlowBatch 'ring', aditivo). Desenhada como ELIPSE achatada no sentido
//                      norte-sul, na perspectiva dos personagens 2,5D (câmera a 56°), e centrada na linha d'água do corpo.
//   arc(x, z, fx, fz, …) onda que vai numa direção (o pedaço da frente de uma marola — GlowBatch 'arc'): a onda na frente de quem
//                      anda/nada na água e as da esteira em V, cada uma abrindo para o seu lado. Achatada como a marola.
//   bubble(x, z)       bolhas de ar estourando na superfície (quem está mergulhado).
//   splash(x, z, …)    gotas de verdade: sobem e caem com gravidade (GlowBatch 'puff', com o tom da noite). A altura vira deslocamento
//                      para o norte na tela (1 m de altura = 0,56 m), como no desenho dos personagens; ao cair, cada gota faz uma marolinha.
//   track(ent, dt, o)  segue alguém na água e emite tudo preso à ANIMAÇÃO dele:
//                        andando/nadando: ondas em ARCO na frente (na direção do movimento) e a esteira em V atrás — nada de anel
//                                 em volta do corpo (só parado, a marola lenta e larga);
//                        nadando  braçada = mão entrando na água (respingo grande, onda, som) nos pontos 0,02/0,52 do crawl;
//                                 pernadas atrás (espuma miúda); parado, bate as pernas (marolas lentas, gotas leves);
//                        vadeando passo = pé entrando (respingo, onda para a frente, som) em 0,25/0,75 do andar;
//                        mergulhado: só as bolhas da respiração subindo (e um fio delas quando ele se mexe).
//                      Os sons são de AudioFX (waterStroke/waterKick/waterWade): o jogador em cheio, NPCs pela distância.
// O resto do jogo só chama ripple(x, z, …) para mergulhos, quedas e barcos.
// ============================================================================

class WaterFx {
    constructor(scene, capacity = 160, drops = 260) {
        this.batch = new GlowBatch(scene, capacity, 'waterRipples', 'ring');
        this.n = capacity;
        this.r = [];
        for (let i = 0; i < capacity; i++) { this.batch.alloc(); this.r.push({ on: false, age: 0, life: 1, x: 0, z: 0, s0: 1, s1: 2, a: 0.5, sq: 1 }); }
        this.next = 0;
        this.dropBatch = new GlowBatch(scene, drops, 'waterDrops', 'puff');
        this.nd = drops;
        this.d = [];
        for (let i = 0; i < drops; i++) { this.dropBatch.alloc(); this.d.push({ on: false, x: 0, z: 0, h: 0, vx: 0, vz: 0, vh: 0, s: 0.1, a: 1 }); }
        this.nextD = 0;
        this.arcBatch = new GlowBatch(scene, 140, 'waterArcs', 'arc');
        this.na = 140;
        this.ar = [];
        for (let i = 0; i < this.na; i++) { this.arcBatch.alloc(); this.ar.push({ on: false, age: 0, life: 1, x: 0, z: 0, fx: 0, fz: 1, s0: 1, s1: 2, a: 0.5, sq: 1 }); }
        this.nextA = 0;
    }

    static get SQ() { return 0.83; }          // sen 56°: um círculo no chão visto pela câmera dos personagens
    static get UP() { return 0.56; }          // cos 56°: 1 m de altura sobe 0,56 m na tela

    // Uma marola em (x, z) que cresce de `s0` a `s1` (diâmetro, u) em `life` s. sq = achatamento norte-sul (1 = círculo).
    ripple(x, z, s0 = 0.8, s1 = 2.8, life = 0.9, a = 0.55, sq = WaterFx.SQ) {
        for (let k = 0; k < this.n; k++) {
            const q = this.r[(this.next + k) % this.n];
            if (q.on) continue;
            q.on = true; q.age = 0; q.life = life; q.x = x; q.z = z; q.s0 = s0; q.s1 = s1; q.a = a; q.sq = sq;
            this.next = (this.next + k + 1) % this.n;
            return;
        }
    }

    // Uma onda em (x, z) indo na direção (fx, fz): cresce de `s0` a `s1` (diâmetro do anel do qual ela é um pedaço) em `life` s.
    arc(x, z, fx, fz, s0 = 0.5, s1 = 1.6, life = 0.8, a = 0.3, sq = WaterFx.SQ) {
        const l = Math.hypot(fx, fz) || 1;
        for (let k = 0; k < this.na; k++) {
            const q = this.ar[(this.nextA + k) % this.na];
            if (q.on) continue;
            q.on = true; q.age = 0; q.life = life; q.x = x; q.z = z; q.fx = fx / l; q.fz = fz / l; q.s0 = s0; q.s1 = s1; q.a = a; q.sq = sq;
            this.nextA = (this.nextA + k + 1) % this.na;
            return;
        }
    }

    // Bolhas de ar chegando à superfície em (x, z): um "plip" miúdo (às vezes dois, colados).
    bubble(x, z, n = 1) {
        for (let i = 0; i < n; i++) {
            const bx = x + (Math.random() - 0.5) * 0.18, bz = z + (Math.random() - 0.5) * 0.18, s = 0.12 + Math.random() * 0.14;
            this.ripple(bx, bz, 0.03, s * 2.2, 0.45 + Math.random() * 0.25, 0.55);
            if (Math.random() < 0.6) this.splash(bx, bz, 1, 0.12, 0, 0, 0.02);
        }
    }

    // `n` gotas saindo de (x, z, altura h0): força `power` (m/s para cima ~2,4×power), espalhando para os lados e um pouco para (dx, dz).
    splash(x, z, n = 8, power = 1, dx = 0, dz = 0, h0 = 0.05) {
        for (let k = 0; k < n; k++) {
            let q = null;
            for (let j = 0; j < this.nd; j++) { const c = this.d[(this.nextD + j) % this.nd]; if (!c.on) { q = c; this.nextD = (this.nextD + j + 1) % this.nd; break; } }
            if (!q) return;
            const a = Math.random() * Math.PI * 2, hs = (0.25 + Math.random() * 0.9) * power;
            q.on = true; q.x = x + (Math.random() - 0.5) * 0.2; q.z = z + (Math.random() - 0.5) * 0.2; q.h = h0;
            q.vx = Math.cos(a) * hs + dx * power; q.vz = Math.sin(a) * hs + dz * power; q.vh = (1.4 + Math.random() * 1.6) * power;
            q.s = 0.09 + Math.random() * 0.1 * Math.min(1.5, power); q.a = 0.8 + Math.random() * 0.2;
        }
    }

    // Segue alguém (ent guarda o estado em ent._wfx). o = { x, z, depth, speed, swimming, heading, actor, wl (água no corpo, m),
    // who: 'player' | 'npc', wadeSound (false: os passos já soam pelo Footsteps) }.
    track(ent, dt, o) {
        const s = ent._wfx || (ent._wfx = { cd: Math.random() * 0.5, wake: 0, kick: 0, kn: 0, ph: null });
        if (!(o.depth > 0)) { s.ph = null; return; }
        const fx = Math.sin(o.heading || 0), fz = Math.cos(o.heading || 0), rx = fz, rz = -fx;
        const sw = !!o.swimming, moving = o.speed > 0.35, U = WaterFx.UP;
        const lift = sw ? 0.1 : U * (o.wl || 0.4);                           // centro das marolas: na linha d'água do corpo
        const npc = o.who !== 'player', vol = npc ? 0.6 : 1;
        const x = o.x, z = o.z;

        // mergulhado: debaixo d'água não há onda nem respingo — só as bolhas da respiração (perto da cabeça; mexendo, um fio delas)
        if (o.diving) {
            s.ph = null;
            s.cd -= dt;
            if (s.cd <= 0) {
                s.cd = moving ? 0.22 + Math.random() * 0.25 : 0.45 + Math.random() * 0.6;
                const burst = Math.random() < 0.18;
                this.bubble(x + fx * 0.55, z + fz * 0.55 + 0.05, burst ? 3 : 1);
            }
            return;
        }

        // onda na FRENTE (na direção do movimento): a cada ~0,4 m, um arco que abre para a frente
        if (moving) { s.bow = (s.bow || 0) + o.speed * dt; s.wake += o.speed * dt; }
        if (moving && s.bow >= 0.4) {
            s.bow = 0;
            const ahead = sw ? 0.75 : 0.3;
            this.arc(x + fx * ahead, z + fz * ahead + lift, fx, fz, 0.5, 1.5 + o.speed * 0.25, 0.8, sw ? 0.32 : 0.28);
        }
        // esteira em V: a cada ~0,8 m, duas ondas nos lados de trás, cada uma abrindo para fora (o V se forma com elas ficando no lugar)
        if (s.wake >= 0.8) {
            s.wake = 0;
            for (const sd of [-1, 1]) this.arc(x - fx * 0.3 + rx * sd * 0.3, z - fz * 0.3 + rz * sd * 0.3 + lift, rx * sd - fx * 0.35, rz * sd - fz * 0.35, 0.35, 1.3 + o.speed * 0.3, 1.1, sw ? 0.22 : 0.2);
        }
        // parado: a marola lenta e larga em volta do corpo (andando não — as ondas são as da frente e da esteira)
        s.cd -= dt;
        if (!moving && s.cd <= 0) {
            s.cd = sw ? 1.0 : 1.3;
            this.ripple(x, z + lift, sw ? 0.9 : 0.55, sw ? 3.0 : 2.5, 1.6, 0.3);
        } else if (moving) s.cd = Math.min(s.cd, 0.4);
        // nadando em frente: pernadas (espuma miúda atrás) — som baixinho a cada duas
        if (sw && moving) {
            s.kick -= dt;
            if (s.kick <= 0) {
                s.kick = 0.15;
                this.splash(x - fx * 0.95 + rx * (Math.random() - 0.5) * 0.3, z - fz * 0.95 + rz * (Math.random() - 0.5) * 0.3 + 0.04, 2, 0.45, -fx * 0.4, -fz * 0.4);
                if ((s.kn = (s.kn + 1) % 2) === 0) AudioFX.waterKick(x, z, vol);
            }
        }
        // eventos presos à animação
        const a = o.actor, c = a && a.clip, name = a && a.clipName || '';
        if (!c || !c.loop || !c.frames) { s.ph = null; return; }
        const ph = (a.time / c.frames) % 1, p0 = s.ph;
        s.ph = ph;
        if (p0 == null) return;
        const crossed = (m) => (ph >= p0 ? (p0 < m && ph >= m) : (p0 < m || ph >= m));
        if (sw && /^swim$/.test(name)) {
            [[0.02, 1], [0.52, -1]].forEach(([m, sd]) => {                     // mão entrando na água (direita, esquerda)
                if (!crossed(m)) return;
                const hx = x + fx * 0.7 + rx * sd * 0.32, hz = z + fz * 0.7 + rz * sd * 0.32 + 0.06;
                this.splash(hx, hz, 10, 1.15, fx * 0.5, fz * 0.5);
                this.arc(hx, hz, fx, fz, 0.3, 1.5, 0.75, 0.34);
                AudioFX.waterStroke(hx, hz, vol);
            });
        } else if (sw) {                                                     // boiando: as pernas batem devagar
            for (const m of [0.25, 0.75]) if (crossed(m)) {
                this.splash(x + (Math.random() - 0.5) * 0.6, z + 0.1, 2, 0.4);
                if (Math.random() < 0.5) AudioFX.waterKick(x, z, vol * 0.7);
            }
        } else if (/^(walk|run)/.test(name)) {                               // vadeando: pé entrando na água
            [[0.25, 1], [0.75, -1]].forEach(([m, sd]) => {
                if (!crossed(m)) return;
                const run = /^run/.test(name), d01 = Math.min(1, o.depth / Config.water.wadeDepth);
                const px = x + fx * 0.25 + rx * sd * 0.14, pz = z + fz * 0.25 + rz * sd * 0.14 + lift * 0.5;
                this.splash(px, pz, run ? 8 : 5, (run ? 1.0 : 0.7) * (1 - 0.35 * d01), fx * 0.5, fz * 0.5, 0.05);
                this.arc(px, pz, fx, fz, 0.25, 1.2 + 0.5 * d01, 0.7, 0.3);
                if (o.wadeSound !== false) AudioFX.waterWade(px, pz, d01, run, vol);
            });
        }
    }

    // Compatível com o código antigo: só o jogador (game.js usa track + update).
    follow(dt, pos, depth, speed, swimming) {
        this.track(this, dt, { x: pos.x, z: pos.z, depth, speed, swimming, heading: 0, who: 'player' });
        this.update(dt);
    }

    update(dt) {
        const b = this.batch;
        for (let i = 0; i < this.n; i++) {
            const q = this.r[i];
            if (!q.on) continue;
            q.age += dt;
            if (q.age >= q.life) { q.on = false; b.off(i); continue; }
            const t = q.age / q.life, s = (q.s0 + (q.s1 - q.s0) * Math.sqrt(t)) / 2, sz = s * q.sq;
            b.quad(i, q.x - s, 0.2, q.z + sz, q.x + s, 0.2, q.z + sz, q.x - s, 0.2, q.z - sz, q.x + s, 0.2, q.z - sz);
            b.color(i, 0.75, 0.92, 1.0, q.a * (1 - t) * (1 - t * 0.3));
        }
        b.flush();
        // ondas em arco: o quad girado para a direção da onda (a borda v = 0 vai na frente) e achatado norte-sul como as marolas
        const A = this.arcBatch;
        let anyA = false;
        for (let i = 0; i < this.na; i++) {
            const q = this.ar[i];
            if (!q.on) continue;
            q.age += dt;
            if (q.age >= q.life) { q.on = false; A.off(i); continue; }
            anyA = true;
            const t = q.age / q.life, s = (q.s0 + (q.s1 - q.s0) * Math.sqrt(t)) / 2, ax = q.fx * s, az = q.fz * s * q.sq, bx = q.fz * s, bz = -q.fx * s * q.sq;
            A.quad(i, q.x + ax - bx, 0.2, q.z + az - bz, q.x + ax + bx, 0.2, q.z + az + bz, q.x - ax - bx, 0.2, q.z - az - bz, q.x - ax + bx, 0.2, q.z - az + bz);
            A.color(i, 0.75, 0.92, 1.0, q.a * (1 - t) * (1 - t * 0.3));
        }
        if (anyA || this._arcsOn) A.flush();
        this._arcsOn = anyA;
        // gotas: balística simples; ao bater na água somem (metade deixa uma marolinha)
        const D = this.dropBatch, U = WaterFx.UP, g = 9.8;
        let any = false;
        for (let i = 0; i < this.nd; i++) {
            const q = this.d[i];
            if (!q.on) continue;
            q.vh -= g * dt; q.h += q.vh * dt; q.x += q.vx * dt; q.z += q.vz * dt;
            q.vx *= 1 - 0.6 * dt; q.vz *= 1 - 0.6 * dt;
            if (q.h <= 0 && q.vh < 0) {
                q.on = false; D.off(i);
                if (Math.random() < 0.35) this.ripple(q.x, q.z, 0.05, 0.3 + q.s * 1.5, 0.35, 0.18);        // (marolinha da gota: miúda e fraca)
                continue;
            }
            any = true;
            D.place(i, q.x, 0.55 + q.h * 2.2, q.z + q.h * U, q.s);
            D.color(i, 1.25, 1.35, 1.4, q.a);                                  // (acima de 1: o disco do puff escurece na borda)
        }
        if (any || this._dropsOn) D.flush();
        this._dropsOn = any;
    }
}
