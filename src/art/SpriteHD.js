// ============================================================================
// SpriteHD — os SPRITES do mundo em alta definição (árvores, arbustos, guarda-sóis, pedras, tufos de grama, pássaros e bichos).
//
// Os modelos continuam os mesmos do SpriteBaker (esferas, elipsoides, cápsulas e caixas), mas o "assado" é outro:
//   • Q vezes a resolução da pixel art (1,5..3 px de textura por px da arte, pelo nível de gráfico);
//   • cor de verdade (RGBA, alfa pré-multiplicado — sem paleta de 5 tons): luz contínua do noroeste, sombra que esfria (azulada) e
//     luz que esquenta, como a rampa da pixel art, só que sem degraus;
//   • detalhe de superfície por MATERIAL, calculado no ponto 3D atingido: folhas (cada folha com a sua inclinação e o vão escuro
//     entre elas), agulhas, casca, pedra (relevo, fendas, musgo e líquen), tecido, penas, pelo, palha, plástico e metal (brilho);
//   • oclusão de ambiente (o que fica entre dois volumes escurece: o miolo da copa, a base das pedras) e o pé no chão mais escuro;
//   • contorno fino escuro na silhueta e onde uma peça encosta na outra; borda suavizada (sem serrilhado);
//   • sombra projetada MACIA no chão, no sentido da luz do mundo;
//   • um mapa de ALTURA (0..1) de cada quadro, dilatado na horizontal: é com ele que o shader das plantas entorta a copa com o vento
//     (art/PropSprites.js) — o que é alto balança mais, o pé fica parado, sem pré-assar quadros de animação.
// Config.art.spriteHD = false (ou ?pixel) volta à pixel art de paleta.
// ============================================================================

const SpriteHD = {
    get on() {
        if (typeof document === 'undefined' || (Config.art && Config.art.spriteHD === false)) return false;
        return !(typeof location !== 'undefined' && /[?&]pixel\b/.test(location.search));
    },
    // px de textura por px da arte (20 px/u).
    get Q() {
        const lvl = typeof Graphics !== 'undefined' ? Graphics.level : 'high';
        return { low: 1.5, medium: 2, high: 2, hd: 3 }[lvl] || 2;
    },
    lastMs: 0,

    // ---------------------------------------------------------------- campos de ruído (256², repetem)
    // f: ruído de valor em 3 oitavas (0..1) | w: células de Worley (16 por lado): [dx, dy (do centro da célula até o pixel, em células),
    // F2 − F1, sorteio da célula] por pixel.
    _fields: null,
    fields() {
        if (this._fields) return this._fields;
        const N = 256, f = new Float32Array(N * N), w = new Float32Array(N * N * 4), G = 16, cs = N / G;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            f[y * N + x] = Pixel.noise(x, y, 32, 11, 8, 8) * 0.55 + Pixel.noise(x, y, 16, 12, 16, 16) * 0.3 + Pixel.noise(x, y, 8, 13, 32, 32) * 0.15;
            const cx = Math.floor(x / cs), cy = Math.floor(y / cs);
            let d1 = 1e9, d2 = 1e9, id = 0, ox = 0, oy = 0;
            for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
                const gx = cx + i, gy = cy + j, wx = ((gx % G) + G) % G, wy = ((gy % G) + G) % G;
                const px = (gx + 0.15 + 0.7 * Pixel.hash(wx, wy, 21)) * cs, py = (gy + 0.15 + 0.7 * Pixel.hash(wx, wy, 22)) * cs;
                const ex = px - x - 0.5, ey = py - y - 0.5, d = Math.sqrt(ex * ex + ey * ey);
                if (d < d1) { d2 = d1; d1 = d; id = Pixel.hash(wx, wy, 23); ox = x + 0.5 - px; oy = y + 0.5 - py; } else if (d < d2) d2 = d;
            }
            const o = (y * N + x) * 4;
            w[o] = ox / cs; w[o + 1] = oy / cs; w[o + 2] = (d2 - d1) / cs; w[o + 3] = id;
        }
        return (this._fields = { N, f, w });
    },
    // amostra (vizinho mais próximo, repetindo) do ruído em (u, v) medidos em "ladrilhos" de 256 px
    _f(u, v) { const F = this._fields, N = F.N, x = ((Math.floor(u * N) % N) + N) % N, y = ((Math.floor(v * N) % N) + N) % N; return F.f[y * N + x]; },
    _w(u, v) { const F = this._fields, N = F.N, x = ((Math.floor(u * N) % N) + N) % N, y = ((Math.floor(v * N) % N) + N) % N; return (y * N + x) * 4; },

    // ---------------------------------------------------------------- assado
    // prims: modelo do SpriteBaker | o: { size (px da arte), ppu, q, heading, elev, shadow, shadowLen, colors, tex, seed, outline }
    //   colors: { slot: '#rrggbb' } ou uma LISTA delas (a geometria é feita uma vez e pintada com cada paleta: bichos)
    //   tex: { slot: material } — 'leaf' 'needle' 'grass' 'bark' 'rock' 'fabric' 'feather' 'fur' 'hay' 'plastic' 'metal' 'petal' 'paper' 'flat'
    // Devolve { N, rgba (Uint8Array N×N×4, pré-multiplicado; ou lista, uma por paleta), hgt (Uint8Array N×N: altura 0..255) }.
    bake(prims, o = {}) {
        const t0 = performance.now(), q = o.q || this.Q, N = Math.round((o.size || 64) * q), PPU = (o.ppu || Config.art.ppu) * q, NN = N * N, half = N / 2;
        const heading = o.heading || 0, elev = o.elev || 0, L = SpriteBaker.LIGHT;
        this.fields();
        let sc = this._scratch && this._scratch.N === N ? this._scratch : null;
        if (!sc) sc = this._scratch = { N, depth: new Float32Array(NN), hgt: new Float32Array(NN), mat: new Uint8Array(NN), lvl: new Float32Array(NN), pid: new Int32Array(NN), nrm: new Float32Array(NN * 3), pos: new Float32Array(NN * 3), cov: new Float32Array(NN), sh: new Float32Array(NN), tmp: new Float32Array(NN) };
        const { depth, hgt, mat, lvl, pid, nrm, pos, cov, sh, tmp } = sc;
        depth.fill(-1e9); mat.fill(0); pid.fill(-1); hgt.fill(0);
        const hs = Math.sin(heading), hc = Math.cos(heading);

        // ---- geometria: profundidade, peça, normal e o ponto 3D (no espaço do MODELO, para o detalhe girar junto) de cada pixel
        let hit = null;
        if (elev) {
            hit = SpriteBaker._march(prims, N, PPU, heading, elev, depth, mat, lvl, { nrm, pid });
            for (let i = 0; i < NN; i++) if (mat[i]) { hgt[i] = Math.max(0, hit[i * 3 + 1]); pos[i * 3] = hit[i * 3]; pos[i * 3 + 1] = hit[i * 3 + 1]; pos[i * 3 + 2] = hit[i * 3 + 2]; }
        } else this._raster(prims, N, PPU, heading, depth, mat, pid, nrm, pos, hgt);
        // de volta ao espaço do modelo (−heading), para o detalhe e as normais do material
        if (heading) for (let i = 0; i < NN; i++) {
            if (!mat[i]) continue;
            const j = i * 3, x = pos[j], z = pos[j + 2];
            pos[j] = x * hc - z * hs; pos[j + 2] = x * hs + z * hc;
        }

        // caixa do que foi desenhado (o resto do quadro é vazio: as passadas seguintes só olham aqui dentro, com folga)
        let bx0 = N, by0 = N, bx1 = -1, by1 = -1;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (mat[y * N + x]) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
        if (bx1 < 0) { bx0 = by0 = 0; bx1 = by1 = 0; }
        sc.box = [bx0, by0, bx1, by1];
        // ---- oclusão de ambiente (8 direções × 2 raios na profundidade) e o pé escuro junto ao chão
        const r1 = Math.max(2, Math.round(0.16 * PPU)), r2 = Math.max(3, Math.round(0.42 * PPU)), dirs = [[1, 0], [0.7, 0.7], [0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.7], [0, -1], [0.7, -0.7]];
        tmp.fill(1);
        for (let y = by0 & ~1; y <= by1; y += 2) for (let x = bx0 & ~1; x <= bx1; x += 2) {   // (em meia resolução: um valor por bloco 2×2)
            let i = y * N + x;
            if (!mat[i]) { if (x + 1 < N && mat[i + 1]) i++; else if (y + 1 < N && mat[i + N]) i += N; else if (x + 1 < N && y + 1 < N && mat[i + N + 1]) i += N + 1; else continue; }
            let occ = 0;
            const d = depth[i];
            for (const [dx, dy] of dirs) for (const [r, w] of [[r1, 0.6], [r2, 0.4]]) {
                const sx = Math.round(x + dx * r), sy = Math.round(y + dy * r);
                if (sx < 0 || sy < 0 || sx >= N || sy >= N) continue;
                const j = sy * N + sx;
                if (!mat[j]) continue;
                occ += w * Math.min(1, Math.max(0, depth[j] - d - 0.03) / (r / PPU * 1.4));
            }
            const a = 1 - 0.6 * Math.min(1, occ / 4.2), b = y * N + x;
            tmp[b] = a; if (x + 1 < N) tmp[b + 1] = a; if (y + 1 < N) { tmp[b + N] = a; if (x + 1 < N) tmp[b + N + 1] = a; }
        }

        // ---- cor de cada paleta
        const pals = Array.isArray(o.colors) ? o.colors : [o.colors || {}];
        const outs = pals.map((pal) => this._shade(o, pal, N, PPU, L, elev));
        // ---- borda suave, contorno, sombra projetada
        const shadowOn = o.shadow !== false;
        if (shadowOn) this._castShadow(N, PPU, L, o.shadowLen || SpriteBaker.SHADOW_LEN, elev, hit);
        else { sh.fill(0); sc.sbox = null; }
        // cobertura suavizada (tenda 3×3) da máscara
        cov.fill(0);
        for (let y = Math.max(0, by0 - 1); y <= Math.min(N - 1, by1 + 1); y++) for (let x = Math.max(0, bx0 - 1); x <= Math.min(N - 1, bx1 + 1); x++) {
            let s = 0;
            for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
                const X = x + i, Y = y + j;
                if (X < 0 || Y < 0 || X >= N || Y >= N || !mat[Y * N + X]) continue;
                s += (i ? 1 : 2) * (j ? 1 : 2);
            }
            cov[y * N + x] = s / 16;
        }
        const res = outs.map((C) => this._compose(N, C));
        // ---- altura normalizada (para o vento)
        let hmax = 0.3;
        for (let i = 0; i < NN; i++) if (mat[i] && hgt[i] > hmax) hmax = hgt[i];
        const h8 = new Uint8Array(NN);
        for (let i = 0; i < NN; i++) if (mat[i]) h8[i] = Math.min(255, Math.round(hgt[i] / hmax * 255));
        this.lastMs += performance.now() - t0;
        return { N, rgba: Array.isArray(o.colors) ? res : res[0], hgt: h8, hmax };
    },

    // Rasterização vista de cima (como o SpriteBaker.bake), guardando também a normal, a peça e o ponto 3D.
    _raster(prims, N, PPU, heading, depth, mat, pid, nrm, pos, hgt) {
        const half = N / 2, hs = Math.sin(heading), hc = Math.cos(heading), rotP = (p) => [p[0] * hc + p[2] * hs, p[1], -p[0] * hs + p[2] * hc];
        const put = (i, y, nx, ny, nz, m, k, wx, wz) => {
            if (y <= depth[i]) return;
            depth[i] = y; hgt[i] = Math.max(0, y); mat[i] = m; pid[i] = k;
            nrm[i * 3] = nx; nrm[i * 3 + 1] = ny; nrm[i * 3 + 2] = nz;
            pos[i * 3] = wx; pos[i * 3 + 1] = y; pos[i * 3 + 2] = wz;
        };
        const sphere = (cx, cy, cz, r, m, k, flat) => {
            const r2 = r * r;
            const px0 = Math.max(0, Math.floor(half + (cx - r) * PPU)), px1 = Math.min(N - 1, Math.ceil(half + (cx + r) * PPU));
            const py0 = Math.max(0, Math.floor(half - (cz + r) * PPU)), py1 = Math.min(N - 1, Math.ceil(half - (cz - r) * PPU));
            for (let py = py0; py <= py1; py++) {
                const wz = (half - (py + 0.5)) / PPU, dz = wz - cz;
                for (let px = px0; px <= px1; px++) {
                    const wx = (px + 0.5 - half) / PPU, dx = wx - cx, d2 = dx * dx + dz * dz;
                    if (d2 > r2) continue;
                    const dy = Math.sqrt(r2 - d2);
                    if (flat) put(py * N + px, cy + dy, 0, 1, 0, m, k, wx, wz);
                    else put(py * N + px, cy + dy, dx / r, dy / r, dz / r, m, k, wx, wz);
                }
            }
        };
        prims.forEach((p, k) => {
            if (p.t === 'c') {
                const a = rotP(p.a), b = rotP(p.b), len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(2, Math.ceil(len / Math.max(p.r * 0.3, 0.7 / PPU)));      // (passo ≥ ~1 px)
                for (let i = 0; i <= n; i++) { const t = i / n; sphere(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, p.r, p.mat, k, p.flat); }
            } else if (p.t === 's') { const c = rotP(p.c); sphere(c[0], c[1], c[2], p.r, p.mat, k, p.flat); }
            else if (p.t === 'e') {
                const c = rotP(p.c), rot = (p.rot || 0) + heading, s = Math.sin(rot), co = Math.cos(rot), sn = -s, ex = Math.max(p.r[0], p.r[2]);
                const px0 = Math.max(0, Math.floor(half + (c[0] - ex) * PPU)), px1 = Math.min(N - 1, Math.ceil(half + (c[0] + ex) * PPU));
                const py0 = Math.max(0, Math.floor(half - (c[2] + ex) * PPU)), py1 = Math.min(N - 1, Math.ceil(half - (c[2] - ex) * PPU));
                for (let py = py0; py <= py1; py++) {
                    const wz = (half - (py + 0.5)) / PPU, dz = wz - c[2];
                    for (let px = px0; px <= px1; px++) {
                        const wx = (px + 0.5 - half) / PPU, dx = wx - c[0], lx = dx * co + dz * sn, lz = -dx * sn + dz * co;
                        const u = lx / p.r[0], w = lz / p.r[2], qq = u * u + w * w;
                        if (qq > 1) continue;
                        const v = Math.sqrt(1 - qq), gx = u / p.r[0], gy = v / p.r[1], gz = w / p.r[2], gm = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
                        if (p.flat) put(py * N + px, c[1] + p.r[1] * v, 0, 1, 0, p.mat, k, wx, wz);
                        else put(py * N + px, c[1] + p.r[1] * v, (gx * co + gz * s) / gm, gy / gm, (-gx * s + gz * co) / gm, p.mat, k, wx, wz);
                    }
                }
            } else {
                const c = rotP(p.c), rot = (p.rot || 0) + heading, s = Math.sin(rot), co = Math.cos(rot), sn = -s, b = Math.min(p.bevel, p.h[0], p.h[1], p.h[2]);
                const ex = Math.hypot(p.h[0], p.h[2]), ix = p.h[0] - b, iz = p.h[2] - b;
                const px0 = Math.max(0, Math.floor(half + (c[0] - ex) * PPU)), px1 = Math.min(N - 1, Math.ceil(half + (c[0] + ex) * PPU));
                const py0 = Math.max(0, Math.floor(half - (c[2] + ex) * PPU)), py1 = Math.min(N - 1, Math.ceil(half - (c[2] - ex) * PPU));
                for (let py = py0; py <= py1; py++) {
                    const wz = (half - (py + 0.5)) / PPU, dz = wz - c[2];
                    for (let px = px0; px <= px1; px++) {
                        const wx = (px + 0.5 - half) / PPU, dx = wx - c[0], lx = dx * co + dz * sn, lz = -dx * sn + dz * co;
                        const cx = lx < -ix ? -ix : (lx > ix ? ix : lx), cz = lz < -iz ? -iz : (lz > iz ? iz : lz), ox = lx - cx, oz = lz - cz, dist = Math.sqrt(ox * ox + oz * oz);
                        if (dist > b) continue;
                        const dy = Math.sqrt(Math.max(0, b * b - dist * dist)), gx = b > 1e-6 ? ox / b : 0, gz = b > 1e-6 ? oz / b : 0, gy = b > 1e-6 ? dy / b : 1;
                        if (p.flat) put(py * N + px, c[1] + p.h[1] - b + dy, 0, 1, 0, p.mat, k, wx, wz);
                        else put(py * N + px, c[1] + p.h[1] - b + dy, gx * co + gz * s, gy, -gx * s + gz * co, p.mat, k, wx, wz);
                    }
                }
            }
        });
    },

    // Cor de cada pixel coberto (luz, material, oclusão, contorno) numa paleta. Devolve Float32Array N×N×3 (0..255).
    _shade(o, pal, N, PPU, L, elev) {
        const sc = this._scratch, { depth, mat, pid, nrm, pos, tmp, hgt } = sc, NN = N * N, out = new Float32Array(NN * 3), tex = o.tex || {}, seed = (o.seed || 1) * 0.137;
        const base = {}, H = (c) => (typeof c === 'string' ? Pixel.hex(c) : c);
        for (const k of Object.keys(pal)) base[k] = H(pal[k]);
        // câmera: de cima (0,1,0) ou inclinada (vinda do sul e de cima)
        const e = elev * Math.PI / 180, V = elev ? [0, Math.sin(e), -Math.cos(e)] : [0, 1, 0];
        const Hv = [L[0] + V[0], L[1] + V[1], L[2] + V[2]], hm = Math.hypot(Hv[0], Hv[1], Hv[2]); Hv[0] /= hm; Hv[1] /= hm; Hv[2] /= hm;
        for (let i = 0; i < NN; i++) {
            const m = mat[i];
            if (!m) continue;
            const j = i * 3, b = base[m] || [200, 0, 200], kind = tex[m] || 'plain';
            let nx = nrm[j], ny = nrm[j + 1], nz = nrm[j + 2];
            const px = pos[j], py = pos[j + 1], pz = pos[j + 2];
            // coordenadas do detalhe: o plano mais de frente para a normal (sem esticar nas laterais)
            const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
            const U = ay >= ax && ay >= az ? px : (ax >= az ? pz : px), Vv = ay >= ax && ay >= az ? pz : py;
            let k = 1, r = b[0], g = b[1], bl = b[2], spec = 0, flat = false;
            switch (kind) {
                case 'leaf': case 'needle': {
                    // cada folha é uma cúpula pequena: a normal pende do centro para a borda (luz de um lado, sombra do outro), o vão
                    // entre as folhas escurece e cada uma tem a sua inclinação e o seu tom
                    const s = kind === 'needle' ? 0.07 : 0.11, w = this._w(U / s / 16 + seed, Vv / s / 16 + seed * 1.7), F = this._fields.w;
                    const dx = F[w], dy = F[w + 1], id = F[w + 3], id2 = (id * 7.31) % 1, id3 = (id * 13.7) % 1, d = Math.sqrt(dx * dx + dy * dy);
                    const tilt = kind === 'needle' ? 1.1 : 1.5;
                    nx += dx * tilt + (id2 - 0.5) * 0.5; nz += dy * tilt + (id3 - 0.5) * 0.5;
                    const dome = Math.max(0, 1 - (d / 0.62) * (d / 0.62));
                    k *= 0.58 + 0.42 * Math.sqrt(dome);                                                           // vão escuro entre as folhas
                    k *= 0.88 + 0.24 * id;
                    const cl = this._f(U / 4 + seed, Vv / 4);                                                      // tufos maiores (~0,5 u): miolo mais escuro
                    k *= 0.8 + 0.32 * cl;
                    if (id > 0.82) { r += 18; g += 16; bl -= 6; }                                                  // folhas novas, mais amarelas
                    else if (id < 0.12) { r -= 10; g -= 4; bl += 8; }
                    break;
                }
                case 'bark': { const f = this._f(U * 2.1 + seed, Vv * 0.31 + seed); k *= 0.72 + 0.4 * f; break; }      // sulcos finos ao longo do tronco
                case 'rock': {
                    const s1 = 2.6, f0 = this._f(U / s1, Vv / s1), fx = this._f(U / s1 + 2 / 256, Vv / s1) - f0, fz = this._f(U / s1, Vv / s1 + 2 / 256) - f0;
                    nx -= fx * 14; nz += fz * 14;                                                                 // relevo: bossas de ~0,3 u (gradiente do ruído)
                    const f2 = this._f(U / 0.8 + 0.31, Vv / 0.8 + 0.77);                                          // grão (~0,1 u)
                    k *= 0.82 + 0.3 * f0 + 0.14 * (f2 - 0.5);
                    const ridge = 1 - Math.abs(2 * this._f(U / 2.2 + 0.5, Vv / 2.2 + 0.2) - 1);                    // fendas
                    if (ridge > 0.9) k *= 0.45 + (1 - ridge) * 4;
                    const up = ny, moss = this._f(U / 4 + 0.13, Vv / 4 + 0.61);
                    if (up > 0.5 && moss > 0.56) { const t = Math.min(1, (moss - 0.56) * 6) * Math.min(1, (up - 0.5) * 3) * 0.75; r += (78 - r) * t; g += (108 - g) * t; bl += (52 - bl) * t; }
                    const w = this._w(U / 0.05 / 16, Vv / 0.05 / 16), F = this._fields.w;
                    if (F[w + 3] > 0.94 && F[w] * F[w] + F[w + 1] * F[w + 1] < 0.1225) { r += (196 - r) * 0.5; g += (204 - g) * 0.5; bl += (170 - bl) * 0.5; }      // líquen
                    break;
                }
                case 'fabric': { k *= 0.95 + 0.07 * this._f(U / 2.4, Vv / 2.4); spec = 0.06; break; }
                case 'feather': { const f = this._f(U * 8 + seed, Vv * 2); k *= 0.84 + 0.26 * f; break; }
                case 'grass': { const h = Pixel.hash(pid[i], 3, 7); k *= 0.9 + 0.4 * h; if (h > 0.8) { r += 16; g += 14; } else if (h < 0.15) { r -= 8; bl += 6; } k *= 0.85 + 0.35 * Math.min(1, py / 0.4); ny += 0.6; break; }
                case 'fur': { const f = this._f(U * 4 + seed, Vv * 4 + seed); k *= 0.86 + 0.24 * f; break; }
                case 'hay': { const f = this._f(U * 1.2, Vv * 7); k *= 0.74 + 0.4 * f; if (f > 0.7) { r += 16; g += 14; } break; }
                case 'plastic': { k *= 0.9 + 0.14 * this._f(U * 1.5, Vv * 1.5); spec = 0.5; break; }
                case 'metal': { k *= 0.94 + 0.08 * this._f(U * 0.5, Vv * 4); spec = 0.7; break; }
                case 'petal': { k *= 0.92 + 0.12 * this._f(U * 4, Vv * 4); spec = 0.08; break; }
                case 'paper': flat = true; k *= 0.94 + 0.08 * this._f(U * 2, Vv * 2); break;
                case 'flat': flat = true; break;
                default: k *= 0.94 + 0.1 * this._f(U * 0.8 + seed, Vv * 0.8);
            }
            const nm = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nm; ny /= nm; nz /= nm;
            const l = flat ? 0.55 : nx * L[0] + ny * L[1] + nz * L[2];
            const lt = Math.max(0, Math.min(1, (l + 0.18) / 1.12));
            let f = (0.56 + 0.64 * lt) * k * tmp[i];
            if (!flat) f *= 0.8 + 0.2 * Math.min(1, hgt[i] / 0.35);                                                // o pé, junto ao chão, mais escuro
            r *= f; g *= f; bl *= f;
            const cool = Math.max(0, 0.55 - lt) * 0.55;                                                           // sombra esfria
            r += (r * 0.78 - r) * cool; g += (g * 0.86 - g) * cool; bl += (bl * 1.18 + 6 - bl) * cool;
            const warm = Math.max(0, lt - 0.78) * 1.6;                                                             // luz esquenta
            r += (r * 1.06 + 22 - r) * warm * 0.5; g += (g * 1.04 + 16 - g) * warm * 0.5; bl += (bl * 0.98 - bl) * warm * 0.5;
            if (spec) { const sp = Math.pow(Math.max(0, nx * Hv[0] + ny * Hv[1] + nz * Hv[2]), 28) * spec * 255; r += sp; g += sp; bl += sp * 0.95; }
            out[j] = r; out[j + 1] = g; out[j + 2] = bl;
        }
        // contorno: silhueta (vizinho vazio) e encontro de peças com degrau na profundidade
        const edge = new Float32Array(NN);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const i = y * N + x;
            if (!mat[i]) continue;
            let e = 0;
            const d = depth[i], p = pid[i];
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const X = x + dx, Y = y + dy;
                if (X < 0 || Y < 0 || X >= N || Y >= N) continue;
                const j = Y * N + X;
                if (!mat[j]) e = Math.max(e, 1);
                else if (depth[j] - d > 0.12 && pid[j] !== p) e = Math.max(e, 0.55);
                else if (mat[j] !== mat[i] && pid[j] === p) e = Math.max(e, 0.25);                                 // costura (gomos do guarda-sol)
            }
            edge[i] = e;
        }
        // (folhas de grama e agulhas são finas demais para contorno cheio: só um toque)
        const OL = { grass: 0.25, needle: 0.7 };
        if (o.outline !== false) for (let i = 0; i < NN; i++) if (edge[i]) { const j = i * 3, e = edge[i] * (OL[tex[mat[i]]] || 1), k = 1 - 0.5 * e; out[j] = out[j] * k + 6 * e; out[j + 1] = out[j + 1] * k + 4 * e; out[j + 2] = out[j + 2] * k + 10 * e; }
        return out;
    },

    // Sombra projetada no chão (máscara 0..1 em sc.sh): cada pixel coberto cai no chão deslocado pela luz; depois é borrada.
    _castShadow(N, PPU, L, len, elev, hit) {
        const sc = this._scratch, { mat, hgt, sh, tmp } = sc, NN = N * N, half = N / 2;
        sh.fill(0); sc.sbox = null;
        if (elev && hit) {
            const kx = (-L[0] / L[1]) * len, kz = (-L[2] / L[1]) * len, sn = Math.sin(elev * Math.PI / 180);
            for (let i = 0; i < NN; i++) {
                if (!mat[i]) continue;
                const h = Math.max(0, hit[i * 3 + 1]), gx = hit[i * 3] + kx * h, gz = hit[i * 3 + 2] + kz * h;
                const sx = Math.round(half + gx * PPU - 0.5), sy = Math.round(half - gz * sn * PPU - 0.5);
                if (sx >= 0 && sy >= 0 && sx < N && sy < N) sh[sy * N + sx] = 1;
            }
        } else {
            const kx = (-L[0] / L[1]) * len * PPU, kz = (-L[2] / L[1]) * len * PPU;
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                const i = y * N + x;
                if (!mat[i]) continue;
                const h = hgt[i], sx = Math.round(x + kx * h), sy = Math.round(y - kz * h);
                if (sx >= 0 && sy >= 0 && sx < N && sy < N) sh[sy * N + sx] = 1;
            }
        }
        // sombra de contato: a própria base também escurece o chão em volta (o objeto "assenta"; pedras e fardos ganham peso)
        for (let i = 0; i < NN; i++) if (mat[i] && hgt[i] < 0.6) sh[i] = Math.max(sh[i], 0.9);
        // fecha os buracos (projeção esparsa) e borra: 2 passadas de caixa 5×5 separável, só na caixa da sombra
        let x0 = N, y0 = N, x1 = -1, y1 = -1;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (sh[y * N + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (x1 < 0) return;
        const R = Math.max(1, Math.round(PPU * 0.06));
        x0 = Math.max(0, x0 - 2 * R); y0 = Math.max(0, y0 - 2 * R); x1 = Math.min(N - 1, x1 + 2 * R); y1 = Math.min(N - 1, y1 + 2 * R);
        sc.sbox = [x0, y0, x1, y1];
        for (let pass = 0; pass < 2; pass++) {
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { let s = 0, n = 0; for (let i = -R; i <= R; i++) { const X = x + i; if (X >= 0 && X < N) { s += sh[y * N + X]; n++; } } tmp[y * N + x] = s / n; }
            // (fora da caixa a sombra é zero: o tmp ali ainda é a oclusão, 1 = livre — lido, virava uma faixa reta de sombra em cima e
            // embaixo de cada sprite)
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { let s = 0, n = 0; for (let j = -R; j <= R; j++) { const Y = y + j; if (Y >= 0 && Y < N) { if (Y >= y0 && Y <= y1) s += tmp[Y * N + x]; n++; } } sh[y * N + x] = Math.min(1, s / n * (pass ? 1.15 : 1.6)); }
        }
    },

    // Junta objeto (cor, cobertura suavizada) e sombra: RGBA pré-multiplicado.
    _compose(N, C) {
        const sc = this._scratch, { mat, cov, sh } = sc, NN = N * N, out = new Uint8Array(NN * 4), SA = 0.4, SC = [8, 10, 22];
        const bb = sc.box, sb = sc.sbox || bb, X0 = Math.max(0, Math.min(bb[0], sb[0]) - 1), Y0 = Math.max(0, Math.min(bb[1], sb[1]) - 1), X1 = Math.min(N - 1, Math.max(bb[2], sb[2]) + 1), Y1 = Math.min(N - 1, Math.max(bb[3], sb[3]) + 1);
        for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
            const i = y * N + x, a = cov[i];
            let r = 0, g = 0, b = 0;
            if (a > 0) {
                if (mat[i]) { r = C[i * 3]; g = C[i * 3 + 1]; b = C[i * 3 + 2]; }
                else {                                                                                                // borda de fora: a cor dos vizinhos cobertos
                    let s = 0;
                    for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
                        const X = x + k, Y = y + j;
                        if (X < 0 || Y < 0 || X >= N || Y >= N) continue;
                        const n = Y * N + X;
                        if (!mat[n]) continue;
                        r += C[n * 3]; g += C[n * 3 + 1]; b += C[n * 3 + 2]; s++;
                    }
                    if (s) { r /= s; g /= s; b /= s; }
                }
            }
            const sa = SA * sh[i] * (1 - a), A = a + sa;
            const o = i * 4;
            out[o] = Math.max(0, Math.min(255, r * a + SC[0] * sa));
            out[o + 1] = Math.max(0, Math.min(255, g * a + SC[1] * sa));
            out[o + 2] = Math.max(0, Math.min(255, b * a + SC[2] * sa));
            out[o + 3] = Math.min(255, A * 255);
        }
        return out;
    },

    // Mapa do VENTO de um quadro: a altura dilatada (máximo) rx px para os lados e rz px para cima/baixo e borrada — assim o ponto
    // logo fora da copa, do lado para onde ela vai, já "sabe" a altura dela (o shader amostra de volta), e a copa não perde a borda.
    swayMap(hgt, N, rx, rz) {
        const a = new Float32Array(N * N), b = new Float32Array(N * N);
        for (let i = 0; i < N * N; i++) a[i] = hgt[i] / 255;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let m = 0; for (let i = -rx; i <= rx; i++) { const X = x + i; if (X >= 0 && X < N) { const v = a[y * N + X] * (1 - 0.25 * Math.abs(i) / rx); if (v > m) m = v; } } b[y * N + x] = m; }
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let m = 0; for (let j = -rz; j <= rz; j++) { const Y = y + j; if (Y >= 0 && Y < N) { const v = b[Y * N + x] * (1 - 0.25 * Math.abs(j) / rz); if (v > m) m = v; } } a[y * N + x] = m; }
        const R = 2;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let s = 0, n = 0; for (let i = -R; i <= R; i++) { const X = x + i; if (X >= 0 && X < N) { s += a[y * N + X]; n++; } } b[y * N + x] = s / n; }
        const out = new Uint8Array(N * N);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let s = 0, n = 0; for (let j = -R; j <= R; j++) { const Y = y + j; if (Y >= 0 && Y < N) { s += b[Y * N + x]; n++; } } out[y * N + x] = Math.round(s / n * 255); }
        return out;
    },

    // Textura RGBA (pré-multiplicada) de um atlas, com mipmaps (WebGL 2) e filtro trilinear.
    texture(scene, data, W, H, { mips = true, name = 'spriteHD' } = {}) {
        const gl2 = scene.getEngine().webGLVersion >= 2, mm = mips && gl2;
        const tex = BABYLON.RawTexture.CreateRGBATexture(data, W, H, scene, mm, false, mm ? BABYLON.Texture.TRILINEAR_SAMPLINGMODE : BABYLON.Texture.BILINEAR_SAMPLINGMODE);
        tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        tex.anisotropicFilteringLevel = 4;
        tex.name = name;
        return tex;
    },

    // Material de sprite RGBA (pássaros, bichos): a cor do atlas × a luz ambiente compartilhada dos sprites (dia/noite) × o brilho
    // do vértice (verde da cor do vértice, como no SpriteMaterial).
    material(scene, name, atlas) {
        if (!BABYLON.Effect.ShadersStore.spriteRgbaVertexShader) {
            BABYLON.Effect.ShadersStore.spriteRgbaVertexShader = `
                precision highp float;
                attribute vec3 position;
                attribute vec2 uv;
                attribute vec4 color;
                uniform mat4 worldViewProjection;
                varying vec2 vUV;
                varying float vShade;
                void main(void) { vUV = uv; vShade = color.g; gl_Position = worldViewProjection * vec4(position, 1.0); }`;
            BABYLON.Effect.ShadersStore.spriteRgbaFragmentShader = `
                precision highp float;
                varying vec2 vUV;
                varying float vShade;
                uniform sampler2D atlas;
                uniform vec3 tint;
                void main(void) {
                    vec4 c = texture2D(atlas, vUV);
                    if (c.a < 0.01) discard;
                    gl_FragColor = vec4(c.rgb * tint * vShade, c.a);
                }`;
        }
        const m = new BABYLON.ShaderMaterial(name, scene, { vertex: 'spriteRgba', fragment: 'spriteRgba' }, {
            attributes: ['position', 'uv', 'color'], uniforms: ['worldViewProjection', 'tint'], samplers: ['atlas'], needAlphaBlending: true,
        });
        m.setTexture('atlas', atlas);
        m.setColor3('tint', SpriteMaterial.sharedTint());
        m.alphaMode = BABYLON.Engine.ALPHA_PREMULTIPLIED;
        m.backFaceCulling = false;
        return m;
    },
};
