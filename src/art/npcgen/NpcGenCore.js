// ============================================================================
// NpcGenCore — o motor do gerador de personagens 2,5D (porte para JS do gerador Python que fez os NPCs: engine.py + render.py).
//
//   primitivas SDF (esfera, elipsoide, cone arredondado, caixa arredondada, cone com tampa) → nuvem de pontos da superfície "assada"
//   por parte do corpo → pose (esqueleto rígido) → splat com z-buffer a 4× → redução para pixel art (cobertura/maioria), sombreamento
//   em 5 tons por material, linhas de contorno, contorno externo, sombra no chão e efeitos (clarão, cápsula, rastro, ondas, respingos).
//
// Saída de um quadro: CÓDIGO + ALFA por pixel (não RGB) — o jogo pinta com a paleta da variante (NpcArt), então um desenho só vira
// vários visuais (roupa, pele, cabelo). Código = material × 8 + tom (tom 0–4 = escuro → claro); material 0 = cores fixas (SPECIAL).
// Pixel do corpo debaixo d'água: alfa < 255 (o jogo mistura com a cor da água pelo alfa, como o gerador original).
//
// Unidades: 1 unidade = 1 pixel na escala 1,04 (a dos PNGs originais). Espaço do personagem: x = direita, y = frente, z = cima.
// Mundo: x = leste, y = norte, z = cima. Pés em z = 0.
//
// Escrito como UMA função (NpcGenCore(G) preenche o objeto G): o jogo também roda o gerador num Worker para o visual do jogador
// (ver NpcGenWorker), montado a partir do texto destas funções — funciona até aberto por duplo clique (file://).
// ============================================================================

function NpcGenCore(G) {
    'use strict';
    const sqrt = Math.sqrt, abs = Math.abs, min = Math.min, max = Math.max, floor = Math.floor, cos = Math.cos, sin = Math.sin;
    const deg = (d) => (d * Math.PI) / 180;

    // ------------------------------------------------------------------ vetores e matrizes (3×3 e 4×4, por linha)
    const V = {
        add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
        sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
        mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
        mulv: (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]],
        dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
        cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
        len: (a) => sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]),
        lerp: (a, b, s) => [a[0] * (1 - s) + b[0] * s, a[1] * (1 - s) + b[1] * s, a[2] * (1 - s) + b[2] * s],
    };
    const nrm = (v) => { const n = V.len(v); return n > 1e-12 ? [v[0] / n, v[1] / n, v[2] / n] : [v[0], v[1], v[2]]; };

    const I3 = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const Rx = (a) => { const c = cos(a), s = sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
    const Ry = (a) => { const c = cos(a), s = sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
    const Rz = (a) => { const c = cos(a), s = sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
    const mm3 = (A, B) => {
        const o = new Array(9);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
        return o;
    };
    const mv3 = (A, v) => [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2], A[6] * v[0] + A[7] * v[1] + A[8] * v[2]];
    const tmv3 = (A, v) => [A[0] * v[0] + A[3] * v[1] + A[6] * v[2], A[1] * v[0] + A[4] * v[1] + A[7] * v[2], A[2] * v[0] + A[5] * v[1] + A[8] * v[2]];      // Aᵀ v (= v @ A)
    const col3 = (A, c) => [A[c], A[3 + c], A[6 + c]];
    const fromCols = (x, y, z) => [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
    // 4×4: { R: 3×3, t: [x,y,z] } (afim; é tudo o que o esqueleto usa)
    const M4 = (R, t) => ({ R: R || I3(), t: t ? [t[0], t[1], t[2]] : [0, 0, 0] });
    const mm4 = (A, B) => ({ R: mm3(A.R, B.R), t: V.add(mv3(A.R, B.t), A.t) });
    const pt4 = (A, p) => V.add(mv3(A.R, p), A.t);

    // Rotação cuja coluna +y aponta para `fwd`, z mais ou menos para `up`.
    function lookRot(fwd, up = [0, 0, 1]) {
        const y = nrm(fwd);
        let x = V.cross(y, up);
        if (V.len(x) < 1e-6) x = abs(y[1]) < 0.9 ? V.cross(y, [0, 1, 0]) : V.cross(y, [1, 0, 0]);
        x = nrm(x);
        const z = V.cross(x, y);
        return fromCols(x, y, z);
    }

    // numpy.arange(start, stop, step) (mesma contagem e valores)
    function arange(start, stop, step) {
        const n = Math.max(0, Math.ceil((stop - start) / step)), out = new Float64Array(n);
        for (let i = 0; i < n; i++) out[i] = start + i * step;
        return out;
    }
    // numpy.round (metade → par)
    const rint = (x) => { const f = floor(x), d = x - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1); };

    // ------------------------------------------------------------------ primitivas SDF
    class Prim {
        constructor(mat, o = {}) {
            this.mat = mat;
            this.blend = o.blend || 0;
            this.tone = o.tone || 0;
            this.clump = o.clump === undefined ? -1 : o.clump;
            this.sub = !!o.sub;
        }
    }
    class Sphere extends Prim {
        constructor(c, r, mat, o) { super(mat, o); this.c = c.slice(); this.r = r; }
        sdf(x, y, z) { const dx = x - this.c[0], dy = y - this.c[1], dz = z - this.c[2]; return sqrt(dx * dx + dy * dy + dz * dz) - this.r; }
        bounds() { const r = this.r, c = this.c; return [[c[0] - r, c[1] - r, c[2] - r], [c[0] + r, c[1] + r, c[2] + r]]; }
    }
    class Ellipsoid extends Prim {
        constructor(c, rad, mat, o = {}) { super(mat, o); this.c = c.slice(); this.rad = rad.slice(); this.R = o.R || null; }
        sdf(x, y, z) {
            let qx = x - this.c[0], qy = y - this.c[1], qz = z - this.c[2];
            const R = this.R;
            if (R) { const a = qx * R[0] + qy * R[3] + qz * R[6], b = qx * R[1] + qy * R[4] + qz * R[7], c = qx * R[2] + qy * R[5] + qz * R[8]; qx = a; qy = b; qz = c; }
            const r = this.rad, ax = qx / r[0], ay = qy / r[1], az = qz / r[2];
            const k0 = sqrt(ax * ax + ay * ay + az * az), bx = ax / r[0], by = ay / r[1], bz = az / r[2], k1 = sqrt(bx * bx + by * by + bz * bz);
            return (k0 * (k0 - 1.0)) / max(k1, 1e-9);
        }
        bounds() { const r = max(this.rad[0], this.rad[1], this.rad[2]), c = this.c; return [[c[0] - r, c[1] - r, c[2] - r], [c[0] + r, c[1] + r, c[2] + r]]; }
    }
    // Cone arredondado de a (raio r1) a b (raio r2) — o "round cone" do iq.
    class RoundCone extends Prim {
        constructor(a, b, r1, r2, mat, o) {
            super(mat, o);
            this.a = a.slice(); this.b = b.slice(); this.r1 = r1; this.r2 = r2;
            const ba = V.sub(this.b, this.a);
            this.ba = ba; this.l2 = V.dot(ba, ba); this.rr = r1 - r2; this.a2 = this.l2 - this.rr * this.rr; this.il2 = 1.0 / this.l2;
        }
        sdf(x, y, z) {
            const a = this.a, ba = this.ba, l2 = this.l2, rr = this.rr, a2 = this.a2, il2 = this.il2;
            const pax = x - a[0], pay = y - a[1], paz = z - a[2];
            const yy = pax * ba[0] + pay * ba[1] + paz * ba[2], zz = yy - l2;
            const xvx = pax * l2 - yy * ba[0], xvy = pay * l2 - yy * ba[1], xvz = paz * l2 - yy * ba[2];
            const x2 = xvx * xvx + xvy * xvy + xvz * xvz, y2 = yy * yy * l2, z2 = zz * zz * l2;
            const k = Math.sign(rr) * rr * rr * x2;
            if (Math.sign(zz) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - this.r2;
            if (Math.sign(yy) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - this.r1;
            return (sqrt(max(x2 * a2 * il2, 0)) + yy * rr) * il2 - this.r1;
        }
        bounds() {
            const r = max(this.r1, this.r2), a = this.a, b = this.b;
            return [[min(a[0], b[0]) - r, min(a[1], b[1]) - r, min(a[2], b[2]) - r], [max(a[0], b[0]) + r, max(a[1], b[1]) + r, max(a[2], b[2]) + r]];
        }
    }
    class RoundBox extends Prim {
        constructor(c, half, r, mat, o = {}) { super(mat, o); this.c = c.slice(); this.half = half.slice(); this.r = r; this.R = o.R || null; this.in = V.sub(this.half, [r, r, r]); }
        sdf(x, y, z) {
            let qx = x - this.c[0], qy = y - this.c[1], qz = z - this.c[2];
            const R = this.R;
            if (R) { const a = qx * R[0] + qy * R[3] + qz * R[6], b = qx * R[1] + qy * R[4] + qz * R[7], c = qx * R[2] + qy * R[5] + qz * R[8]; qx = a; qy = b; qz = c; }
            qx = abs(qx) - this.in[0]; qy = abs(qy) - this.in[1]; qz = abs(qz) - this.in[2];
            const mx = max(qx, 0), my = max(qy, 0), mz = max(qz, 0);
            return sqrt(mx * mx + my * my + mz * mz) + min(max(qx, qy, qz), 0) - this.r;
        }
        bounds() { const e = V.len(this.half), c = this.c; return [[c[0] - e, c[1] - e, c[2] - e], [c[0] + e, c[1] + e, c[2] + e]]; }
    }
    // Cone com tampas planas entre a e b (raios ra, rb), arredondamento opcional.
    class CapCone extends Prim {
        constructor(a, b, ra, rb, mat, o = {}) {
            super(mat, o);
            const rround = o.rround || 0;
            this.rr = rround;
            const ax = nrm(V.sub(b, a));
            this.a = V.add(a, V.mul(ax, rround));
            this.b = V.sub(b, V.mul(ax, rround));
            this.ra = ra - rround;
            this.rb = rb - rround;
            this.A = a.slice(); this.B = b.slice();
            this.R0 = max(ra, rb);
            this.bv = V.sub(this.b, this.a);
            this.baba = V.dot(this.bv, this.bv);
        }
        sdf(x, y, z) {
            const a = this.a, ra = this.ra, rb = this.rb, rba = rb - ra, ba = this.bv, baba = this.baba;
            const pax = x - a[0], pay = y - a[1], paz = z - a[2];
            const papa = pax * pax + pay * pay + paz * paz;
            const paba = (pax * ba[0] + pay * ba[1] + paz * ba[2]) / baba;
            const xx = sqrt(max(papa - paba * paba * baba, 0));
            const cax = max(0.0, xx - (paba < 0.5 ? ra : rb)), cay = abs(paba - 0.5) - 0.5;
            const k = rba * rba + baba;
            const f = min(max((rba * (xx - ra) + paba * baba) / k, 0.0), 1.0);
            const cbx = xx - ra - f * rba, cby = paba - f;
            const s = cbx < 0.0 && cay < 0.0 ? -1.0 : 1.0;
            return s * sqrt(min(cax * cax + cay * cay * baba, cbx * cbx + cby * cby * baba)) - this.rr;
        }
        bounds() {
            const A = this.A, B = this.B, r = this.R0;
            return [[min(A[0], B[0]) - r, min(A[1], B[1]) - r, min(A[2], B[2]) - r], [max(A[0], B[0]) + r, max(A[1], B[1]) + r, max(A[2], B[2]) + r]];
        }
    }

    // Parte rígida do corpo: primitivas unidas (com suavização), presa a um osso.
    class Part {
        constructor(name, bone, group, prims, tex = null) { this.name = name; this.bone = bone; this.group = group; this.prims = prims; this.tex = tex; this._prep = null; }
        bounds() {
            const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
            for (const pr of this.prims) {
                if (pr.sub) continue;
                const [a, b] = pr.bounds();
                for (let k = 0; k < 3; k++) { lo[k] = min(lo[k], a[k] - pr.blend); hi[k] = max(hi[k], b[k] + pr.blend); }
            }
            return [lo.map((v) => v - 1.5), hi.map((v) => v + 1.5)];
        }
        // caixas de seleção (lo - m, hi + m) de cada primitiva
        prep() {
            if (this._prep) return this._prep;
            return (this._prep = this.prims.map((pr, i) => {
                const [lo, hi] = pr.bounds(), m = 3.0 + pr.blend;
                return { pr, i, x0: lo[0] - m, y0: lo[1] - m, z0: lo[2] - m, x1: hi[0] + m, y1: hi[1] + m, z1: hi[2] + m, cl: pr.clump >= 0 ? pr.clump : 1000 + i };
            }));
        }
        // Avalia um ponto. out = { d, mat, tone, pid, d1, d2 } (d1/d2 = melhor e 2ª melhor distância bruta entre "tufos" diferentes).
        eval(x, y, z, out, info = false) {
            let d = 1e9, mat = 0, tone = 0, pid = -1, d1 = 1e9, d2 = 1e9, c1 = -1, c2 = -1;
            for (const q of this.prep()) {
                if (!(x > q.x0 && x < q.x1 && y > q.y0 && y < q.y1 && z > q.z0 && z < q.z1)) continue;
                const pr = q.pr, di = pr.sdf(x, y, z), k = pr.blend;
                if (pr.sub) {
                    const cur = d;
                    if (k > 0) { const h = min(max(0.5 - (0.5 * (cur + di)) / k, 0), 1); d = cur * (1 - h) + -di * h + k * h * (1 - h); }
                    else d = max(cur, -di);
                    continue;
                }
                const cur = d;
                let nd;
                if (k > 0) { const h = max(k - abs(cur - di), 0) / k; nd = min(cur, di) - h * h * k * 0.25; }
                else nd = min(cur, di);
                if (di < d1) { mat = pr.mat; tone = pr.tone; pid = q.i; }
                d = nd;
                if (info) {
                    const cl = q.cl;
                    if (di < d1) { if (c1 !== cl) { d2 = d1; c2 = c1; } d1 = di; c1 = cl; }
                    else if (di < d2 && c1 !== cl) { d2 = di; c2 = cl; }
                } else d1 = min(d1, di);
            }
            out.d = d; out.mat = mat; out.tone = tone; out.pid = pid; out.d1 = d1; out.d2 = d2;
            return d;
        }
        dist(x, y, z) { return this.eval(x, y, z, Part._o); }
    }
    Part._o = {};

    // ------------------------------------------------------------------ "assar" uma parte: pontos na superfície + normal + material
    // spacing = distância entre pontos (0,2 na escala dos PNGs originais).
    function bake(part, spacing = 0.2, band = 0.75, h = 1.0) {
        const [lo, hi] = part.bounds();
        const xs = arange(lo[0], hi[0] + h, h), ys = arange(lo[1], hi[1] + h, h), zs = arange(lo[2], hi[2] + h, h);
        const o = arange(-h / 2 + spacing / 2, h / 2 - 1e-9, spacing), no = o.length;
        const tmp = {};
        let P = new Float64Array(3 << 15), D = new Float64Array(1 << 15), n = 0;
        const push = (x, y, z, d) => {
            if (n >= D.length) { const P2 = new Float64Array(P.length * 2); P2.set(P); P = P2; const D2 = new Float64Array(D.length * 2); D2.set(D); D = D2; }
            P[n * 3] = x; P[n * 3 + 1] = y; P[n * 3 + 2] = z; D[n] = d; n++;
        };
        const lim = band * spacing, lc = 0.95 * h;
        for (let i = 0; i < xs.length; i++) for (let j = 0; j < ys.length; j++) for (let k = 0; k < zs.length; k++) {
            const cx = xs[i], cy = ys[j], cz = zs[k];
            if (!(abs(part.eval(cx, cy, cz, tmp)) < lc)) continue;
            for (let a = 0; a < no; a++) for (let b = 0; b < no; b++) for (let c = 0; c < no; c++) {
                const x = cx + o[a], y = cy + o[b], z = cz + o[c];
                const d = part.eval(x, y, z, tmp);
                if (abs(d) < lim) push(x, y, z, d);
            }
        }
        if (!n) throw new Error('parte vazia ' + part.name);
        // normal por diferenças centrais, projeção na superfície, material/tom
        const e = 0.04, pos = new Float64Array(n * 3), nr = new Float64Array(n * 3), mat = new Int16Array(n), tone = new Int16Array(n);
        const pid = new Int16Array(n), d1 = new Float64Array(n), d2 = new Float64Array(n);
        let m = 0;
        for (let i = 0; i < n; i++) {
            const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
            const gx = part.eval(x + e, y, z, tmp) - part.eval(x - e, y, z, tmp);
            const gy = part.eval(x, y + e, z, tmp) - part.eval(x, y - e, z, tmp);
            const gz = part.eval(x, y, z + e, tmp) - part.eval(x, y, z - e, tmp);
            const gl = sqrt(gx * gx + gy * gy + gz * gz);
            if (!(gl > 1e-9)) continue;
            const nx = gx / gl, ny = gy / gl, nz = gz / gl, d = D[i];
            const px = x - d * nx, py = y - d * ny, pz = z - d * nz;
            part.eval(px, py, pz, tmp, true);
            pos[m * 3] = px; pos[m * 3 + 1] = py; pos[m * 3 + 2] = pz;
            nr[m * 3] = nx; nr[m * 3 + 1] = ny; nr[m * 3 + 2] = nz;
            mat[m] = tmp.mat; tone[m] = tmp.tone; pid[m] = tmp.pid; d1[m] = tmp.d1; d2[m] = tmp.d2;
            m++;
        }
        const P32 = pos.subarray(0, m * 3), N32 = nr.subarray(0, m * 3), MT = mat.subarray(0, m), TN = tone.subarray(0, m);
        if (part.tex) {
            // textura procedural (olhos, listras, cadarço…): pode trocar o material e mexe no tom
            const t2 = part.tex(P32, N32, MT, pid.subarray(0, m), d1.subarray(0, m), d2.subarray(0, m), m);
            for (let i = 0; i < m; i++) TN[i] += t2[i];
        }
        const T8 = new Int8Array(m);
        for (let i = 0; i < m; i++) T8[i] = max(-3, min(3, TN[i]));
        return { name: part.name, bone: part.bone, group: part.group, pos: new Float32Array(P32), nrm: new Float32Array(N32), mat: new Int16Array(MT), tone: T8, n: m };
    }

    // ------------------------------------------------------------------ câmera ortográfica (elevação 56°)
    class Camera {
        constructor(elevDeg = 56.0, light = [-0.42, -0.52, 0.74], scale = 1.04) {
            const t = deg(elevDeg), s = sin(t), c = cos(t);
            this.scale = scale;
            this.R = [1, 0, 0, 0, s, c, 0, c, -s];        // mundo → câmera (X direita, Y cima na tela, Z profundidade)
            this.elev = elevDeg; this.sin = s; this.cos = c;
            this.Lw = nrm(light);
            this.L = mv3(this.R, this.Lw);
        }
    }

    const hexrgb = (h) => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };

    Object.assign(G, {
        deg, V, nrm, I3, Rx, Ry, Rz, mm3, mv3, tmv3, col3, fromCols, M4, mm4, pt4, lookRot, arange, rint,
        Prim, Sphere, Ellipsoid, RoundCone, RoundBox, CapCone, Part, bake, Camera, hexrgb,
    });
    return G;
}
