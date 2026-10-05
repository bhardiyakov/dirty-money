// ============================================================================
// Fireworks — fogos de artifício de verdade (alarme dos fogueteiros, ver npc/FavelaWatch.js). Cada disparo é um FOGUETE que
// sobe deixando um rastro de faíscas douradas, estoura num clarão e abre UMA esfera de estrelas verdes e amarelas, cada uma com
// uma cauda curta de cometa (único modelo, a pedido: ver imagem de referência). O código ainda sabe fazer outros tipos
// (willow, ring, spiral), mas launch() só usa a esfera verde/amarela.
// Vista de cima, a esfera aparece como um disco que se abre (a altura só muda o paralaxe e o tamanho aparente).
// Som (AudioFX.fireworkLaunch / fireworkBurst): espoleta e chiado subindo (às vezes assobio); o estouro chega com o atraso do som,
// com estalo, "bum", eco e o crepitar das estrelas — mais baixo e abafado de longe.
// Uso: game.fireworks.launch(x, z, y0, tipo?) → false se há disparos demais ao mesmo tempo. update(dt) todo quadro.
// ============================================================================

class Fireworks {
    constructor(scene) {
        this.CAP = 3200;
        this.glow = new GlowBatch(scene, this.CAP, 'fireworks', 'glow');
        this.pool = [];
        for (let i = 0; i < this.CAP; i++) this.pool.push(this.glow.alloc());
        for (const i of this.pool) this.glow.off(i);
        this.glow.flush();
        this.shells = []; this.bursts = [];
        this.maxShows = 6;
    }

    static get PALETTES() { return [[[0.28, 1, 0.34], [1, 0.92, 0.3]]]; }        // verde / amarelo

    _take(n) { return this.pool.length >= n ? this.pool.splice(this.pool.length - n, n) : null; }
    _give(ids) { for (const i of ids) { this.glow.off(i); this.pool.push(i); } }

    get busy() { return this.shells.length + this.bursts.length >= this.maxShows; }

    // Dispara um foguete de (x, z) a partir da altura y0 (a laje). tipo: 'peony'|'willow'|'ring'|'spiral' (sorteado se omitido).
    launch(x, z, y0 = 1, type = null) {
        if (this.busy) return false;
        const ids = this._take(10);
        if (!ids) return false;
        const T = 'peony';                                                              // um único modelo: esfera verde/amarela
        const rise = 7 + Math.random() * 5, a = Math.random() * Math.PI * 2, dr = Math.random() * 4;
        const S = { t: 0, T: 0.75 + Math.random() * 0.3, x0: x, z0: z, y0, x1: x + Math.cos(a) * dr, z1: z + Math.sin(a) * dr, y1: y0 + rise + 6, ids, type: T, hist: [] };
        this.shells.push(S);
        AudioFX.fireworkLaunch(x, z, S.T);                                               // espoleta + chiado da subida (às vezes assobio)
        return true;
    }

    // ---------------------------------------------------------------- estouro
    _burst(x, y, z, type) {
        const pal = Fireworks.PALETTES[0];
        const cfg = {
            peony:  { n: 72, trail: 4, speed: 12.5, drag: 1.5, grav: 3.2, life: 1.9, size: 1.0, spin: 0, tail: 0.04 },
            willow: { n: 48, trail: 8, speed: 9.5, drag: 2.0, grav: 6.5, life: 2.9, size: 0.8, spin: 0, tail: 0.075 },
            ring:   { n: 48, trail: 6, speed: 13.5, drag: 1.4, grav: 2.4, life: 1.9, size: 0.9, spin: 0, tail: 0.05 },
            spiral: { n: 66, trail: 7, speed: 12.5, drag: 1.2, grav: 2.0, life: 2.2, size: 0.85, spin: 2.6, tail: 0.06 },
        }[type];
        const per = cfg.trail + 1, need = cfg.n * per + 2;
        const ids = this._take(need);
        if (!ids) return;
        const parts = [], tilt = Math.random() * 1.2, arms = 3;
        for (let i = 0; i < cfg.n; i++) {
            let vx, vy, vz, th, col;
            if (type === 'ring') {
                th = i / cfg.n * Math.PI * 2;
                const cx = Math.cos(th), cz = Math.sin(th);
                vx = cx * cfg.speed; vz = cz * cfg.speed * Math.cos(tilt); vy = cz * cfg.speed * Math.sin(tilt);
                col = pal[0];
            } else if (type === 'spiral') {
                const arm = i % arms, k = Math.floor(i / arms), f = (k + 1) / (cfg.n / arms);
                th = arm / arms * Math.PI * 2 + k * 0.12;
                const s = cfg.speed * (0.35 + 0.65 * f);
                vx = Math.cos(th) * s; vz = Math.sin(th) * s; vy = (Math.random() - 0.5) * 2;
                col = f > 0.6 ? pal[1] : pal[0];
            } else {                                         // esfera: direções uniformes
                const u = Math.random() * 2 - 1, ph = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), s = cfg.speed * (0.78 + Math.random() * 0.3);
                vx = r * Math.cos(ph) * s; vz = r * Math.sin(ph) * s; vy = u * s;
                col = type === 'willow' ? (i % 4 ? [1, 0.72, 0.22] : [1, 0.92, 0.55]) : (i % 3 ? pal[0] : pal[1]);
            }
            const p = { x, y, z, vx, vy, vz, col, life: cfg.life * (0.85 + Math.random() * 0.3), ph: Math.random() * 6.28, ids: ids.slice(i * per, (i + 1) * per) };
            parts.push(p);
        }
        const flash = ids[need - 2], core = ids[need - 1];
        this.bursts.push({ parts, cfg, ids, age: 0, hz: 0, x, y, z, flash, core, pal, per });
        AudioFX.fireworkBurst(x, z, y);                                                  // estalo + bum + eco + crepitar (com o atraso do som)
    }

    update(dt) {
        const G = this.glow;
        // Sem fogos no ar: a malha (3.200 quads) nem vai para a GPU.
        const busy = this.shells.length + this.bursts.length > 0;
        if (G.mesh.isVisible !== busy) G.mesh.isVisible = busy;
        if (!busy) return;
        // foguetes subindo
        for (let s = this.shells.length - 1; s >= 0; s--) {
            const S = this.shells[s];
            S.t += dt;
            const e = Math.min(1, S.t / S.T), e2 = 1 - (1 - e) * (1 - e);                 // desacelera no fim
            const x = S.x0 + (S.x1 - S.x0) * e2, z = S.z0 + (S.z1 - S.z0) * e2, y = S.y0 + (S.y1 - S.y0) * e2 + Math.sin(S.t * 30) * 0.05;
            const H = S.hist, h = H.length >= S.ids.length ? H.pop() : [0, 0, 0];      // rastro: reaproveita a posição mais velha
            h[0] = x; h[1] = y; h[2] = z; H.unshift(h);
            for (let k = 0; k < S.ids.length; k++) {
                const h = S.hist[Math.min(k, S.hist.length - 1)], f = k / S.ids.length;
                if (!h || k >= S.hist.length) { G.off(S.ids[k]); continue; }
                G.place(S.ids[k], h[0] + (Math.random() - 0.5) * 0.25 * f, h[1], h[2] + (Math.random() - 0.5) * 0.25 * f, 0.9 - f * 0.55);
                G.color(S.ids[k], 1, 0.62 - f * 0.25, 0.2, (1 - f) * 0.95);
            }
            if (S.t >= S.T) { this._give(S.ids); this.shells.splice(s, 1); this._burst(x, y, z, S.type); }
        }
        // estouros
        for (let b = this.bursts.length - 1; b >= 0; b--) {
            const B = this.bursts[b], C = B.cfg;
            B.age += dt; B.hz += dt;
            const sample = B.hz >= 0.045; if (sample) B.hz = 0;
            // clarão do estouro e núcleo que esmaece
            const fl = Math.max(0, 1 - B.age / 0.28);
            G.place(B.flash, B.x, B.y, B.z, 15 * (0.5 + B.age * 2)); G.color(B.flash, 1, 0.85, 0.6, 0.55 * fl * fl);
            const cr = Math.max(0, 1 - B.age / 0.9);
            G.place(B.core, B.x, B.y, B.z, 3.2 * cr + 0.5); G.color(B.core, B.pal[1][0], B.pal[1][1], B.pal[1][2], 0.7 * cr);
            let alive = 0;
            const drag = Math.exp(-C.drag * dt);
            for (const p of B.parts) {
                if (B.age >= p.life) { for (const id of p.ids) G.off(id); continue; }
                alive++;
                if (C.spin) { const w = C.spin * dt, c = Math.cos(w), s = Math.sin(w), vx = p.vx * c - p.vz * s; p.vz = p.vx * s + p.vz * c; p.vx = vx; }
                p.vx *= drag; p.vz *= drag; p.vy = p.vy * drag - C.grav * dt;
                p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
                const r = B.age / p.life, fade = r < 0.55 ? 1 : Math.max(0, 1 - (r - 0.55) / 0.45), tw = 0.8 + 0.2 * Math.sin(B.age * 38 + p.ph);
                const hot = Math.max(0, 1 - B.age / 0.5);                                  // cabeça branca-quente no começo
                for (let k = 0; k < B.per; k++) {
                    const f = k / B.per, id = p.ids[k];
                    G.place(id, p.x - p.vx * k * C.tail, p.y - p.vy * k * C.tail, p.z - p.vz * k * C.tail, C.size * (1 - f * 0.6));
                    const a = fade * tw * Math.pow(1 - f, 1.4) * (k === 0 ? 1 : 0.75), w = k === 0 ? hot * 0.8 : 0;
                    G.color(id, p.col[0] + (1 - p.col[0]) * w, p.col[1] + (1 - p.col[1]) * w, p.col[2] + (1 - p.col[2]) * w, a);
                }
            }
            if (!alive && B.age > 0.9) { this._give(B.ids); this.bursts.splice(b, 1); }
        }
        G.flush();
    }
}
memoStatics(Fireworks, 'PALETTES');
