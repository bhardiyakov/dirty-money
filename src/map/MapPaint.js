// ============================================================================
// MapPaint — o TERRENO do mapa (pausa e GPS) pintado em alta definição, no estilo de um mapa ilustrado:
//   • o mar com degradê de profundidade (turquesa no raso → azul-marinho no fundo), a espuma e a segunda linha de arrebentação;
//   • a costa e as divisas de bioma CURVAS (sem a escada das células de 4 u): o campo de terra/água e as cores são interpolados e o
//     contorno é entortado por ruído;
//   • relevo sombreado (luz do noroeste) com o oco dos vales mais escuro; o paredão de pedra com as fendas;
//   • texturas por bioma: copas de árvore na mata (e soltas no gramado), os talhões das fazendas com as fileiras do plantio (os
//     mesmos talhões de 28×36 u do chão em 3D: TerrainBuilder._idFor), ondinhas na areia, poças no pântano, moitas no cerrado.
// O que é construído (ruas, quarteirões, prédios, marcos) é vetorial, por cima (MapRenderer.drawView).
//
// Níveis de detalhe: o mundo inteiro a 0,25 px/u (pintado uma vez, no começo: é o "rascunho") e LADRILHOS de 512 px a 0,5, 1, 2, 4
// e 8 px/u, pintados quando aparecem na tela (no máximo `budget` ms por desenho: o que falta sai do rascunho, ampliado, até ficar
// pronto) e guardados (os MAX_TILES usados por último).
//   drawTerrain(ctx, W, H, cx, cz, k, { budget, res, defer }) → true se ainda falta ladrilho; `res` = px reais por u (com o
//   devicePixelRatio), para escolher o nível. O mapa da pausa (redesenhado a cada quadro) pinta ali mesmo, até `budget` ms; o GPS
//   passa `defer`: só anota o que falta e a pintura segue aos poucos em work(ms), a cada quadro — a camada dele é refeita só quando um
//   ladrilho fica pronto (refazer a camada inteira a cada quadro custa caro).
// ============================================================================

const MapPaint = {
    PX: 512,
    LEVELS: [0.5, 1, 2, 4, 8],
    WORLD_PPU: 0.25,
    MAX_TILES: 60,
    _tiles: new Map(),
    _want: [],                // ladrilhos que o último desenho adiado (GPS) pediu: [lvl, i, j], o mais perto do centro primeiro

    // Cores de base por bioma (WorldMap.B); a fazenda tem a cor de cada talhão (FARM).
    BASE: {
        1: [232, 214, 160], 2: [104, 162, 72], 3: [52, 112, 50], 4: [196, 166, 92], 5: [92, 122, 78], 6: [140, 134, 124],
        7: [170, 136, 100], 8: [170, 160, 98], 9: [150, 152, 156], 10: [112, 172, 90],
    },
    FARM: [[160, 122, 82], [126, 164, 76], [208, 180, 102]],         // arado, verde, trigo
    // Mar: [profundidade (u), r, g, b]
    SEA: [[0, 104, 206, 206], [5, 66, 172, 196], [18, 40, 128, 176], [48, 28, 90, 148], [120, 20, 62, 120]],

    // ------------------------------------------------------------------ desenho
    drawTerrain(ctx, W, H, cx, cz, k, o = {}) {
        const WD = Config.world, t0 = performance.now(), budget = o.budget || 14, res = o.res || k;
        const vx0 = cx - W / 2 / k, vx1 = cx + W / 2 / k, vz0 = cz - H / 2 / k, vz1 = cz + H / 2 / k;
        const X = (x) => W / 2 + (x - cx) * k, Y = (z) => H / 2 - (z - cz) * k;
        const world = this.world();
        ctx.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = k > 1.2 ? 'high' : 'medium';
        ctx.fillStyle = 'rgb(20,62,120)'; ctx.fillRect(0, 0, W, H);
        const wp = this.WORLD_PPU;
        const fromWorld = (x0, zt, w, h, dx, dy, dw, dh) => ctx.drawImage(world, (x0 - WD.minX) * wp, (WD.maxZ - zt) * wp, w * wp, h * wp, dx, dy, dw, dh);
        const lvl = this.LEVELS.find((p) => p >= res * 0.8) || this.LEVELS[this.LEVELS.length - 1];
        if (res < 0.3) {
            const x0 = Math.max(WD.minX, vx0), x1 = Math.min(WD.maxX, vx1), z0 = Math.max(WD.minZ, vz0), z1 = Math.min(WD.maxZ, vz1);
            if (x1 > x0 && z1 > z0) fromWorld(x0, z1, x1 - x0, z1 - z0, X(x0), Y(z1), (x1 - x0) * k, (z1 - z0) * k);
            return false;
        }
        const T = this.PX / lvl, nt = Math.ceil((WD.maxX - WD.minX) / T), mt = Math.ceil((WD.maxZ - WD.minZ) / T);
        const i0 = Math.max(0, Math.floor((vx0 - WD.minX) / T)), i1 = Math.min(nt - 1, Math.floor((vx1 - WD.minX) / T));
        const j0 = Math.max(0, Math.floor((WD.maxZ - vz1) / T)), j1 = Math.min(mt - 1, Math.floor((WD.maxZ - vz0) / T));
        let pending = false;
        const want = [];
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
            const x0 = WD.minX + i * T, zt = WD.maxZ - j * T;
            const dx = Math.floor(X(x0)), dy = Math.floor(Y(zt)), dw = Math.floor(X(x0 + T)) - dx, dh = Math.floor(Y(zt - T)) - dy;
            let tile = this._tiles.get(lvl + ':' + i + ',' + j);
            if ((!tile || tile.img) && !o.defer && performance.now() - t0 < budget) tile = this._tile(lvl, i, j, t0 + budget);
            if (tile && !tile.img) { tile.used = performance.now(); ctx.drawImage(tile.canvas, dx, dy, dw + 1, dh + 1); continue; }
            pending = true;
            fromWorld(x0, zt, T, T, dx, dy, dw + 1, dh + 1);
            if (o.defer) want.push([lvl, i, j, (x0 + T / 2 - cx) ** 2 + (zt - T / 2 - cz) ** 2]);
        }
        if (o.defer) this._want = want.sort((a, b) => a[3] - b[3]);
        return pending;
    },

    // Pinta, por até `ms`, os ladrilhos que o último desenho adiado pediu. true = algum ficou pronto (hora de refazer a camada).
    work(ms) {
        if (!this._want.length) return false;
        const until = performance.now() + ms;
        let done = false;
        while (this._want.length && performance.now() < until) {
            const [l, i, j] = this._want[0];
            if (!this._tile(l, i, j, until).img) { this._want.shift(); done = true; }
        }
        return done;
    },

    // O mundo inteiro (o rascunho, WORLD_PPU px/u).
    world() {
        if (this._world) return this._world;
        const WD = Config.world, p = this.WORLD_PPU, w = Math.round((WD.maxX - WD.minX) * p), h = Math.round((WD.maxZ - WD.minZ) * p);
        const t0 = performance.now(), cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const g = cv.getContext('2d'), img = g.createImageData(w, h);
        this._paint(img, w, h, WD.minX, WD.maxZ, p);
        g.putImageData(img, 0, 0);
        this.stats = Object.assign(this.stats || {}, { worldMs: +(performance.now() - t0).toFixed(0) });
        return (this._world = cv);
    },

    // Pinta o ladrilho (lvl, i, j) de 32 em 32 linhas até a hora `until` (o que falta continua no próximo desenho: nenhum quadro paga
    // um ladrilho inteiro). Devolve o ladrilho (img = null quando pronto).
    _tile(lvl, i, j, until = Infinity) {
        const WD = Config.world, T = this.PX / lvl, key = lvl + ':' + i + ',' + j, t0 = performance.now();
        let tile = this._tiles.get(key);
        if (!tile) {
            const cv = document.createElement('canvas');
            cv.width = cv.height = this.PX;
            tile = { canvas: cv, img: cv.getContext('2d').createImageData(this.PX, this.PX), row: 0, ms: 0, used: t0 };
            this._tiles.set(key, tile);
            if (this._tiles.size > this.MAX_TILES) {                             // fora o usado há mais tempo
                let old = null; for (const [k, t] of this._tiles) if (k !== key && (!old || t.used < old[1].used)) old = [k, t];
                this._tiles.delete(old[0]);
            }
        }
        if (!tile.img) return tile;
        do {
            const r1 = Math.min(this.PX, tile.row + 32);
            this._paint(tile.img, this.PX, this.PX, WD.minX + i * T, WD.maxZ - j * T, lvl, tile.row, r1);
            tile.row = r1;
        } while (tile.row < this.PX && performance.now() < until);
        tile.ms += performance.now() - t0;
        if (tile.row >= this.PX) {
            tile.canvas.getContext('2d').putImageData(tile.img, 0, 0);
            tile.img = null;
            const S = (this.stats = this.stats || {});
            S.tiles = (S.tiles || 0) + 1; S.tileMs = +(((S.tileMs || 0) * (S.tiles - 1) + tile.ms) / S.tiles).toFixed(1);
        }
        return tile;
    },

    // ------------------------------------------------------------------ preparo (uma vez)
    // Por célula: terra (0/1), profundidade, cor de base (com a variação lenta) e o brilho do relevo.
    _prep() {
        if (this._cells) return this._cells;
        const M = WorldMap, B = M.B, nx = M.nx, nz = M.nz, N = nx * nz, c = Config.world.cell, Hh = M.h;
        const land = new Float32Array(N), dep = new Float32Array(N), col = new Float32Array(N * 3), shade = new Float32Array(N);
        // relevo médio em volta (caixa 9×9, separável): abaixo dele = vale (mais escuro), acima = crista (mais claro)
        const tmp = new Float32Array(N), avg = new Float32Array(N), R = 4;
        for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { let s = 0; for (let d = -R; d <= R; d++) s += Hh[j * nx + Math.max(0, Math.min(nx - 1, i + d))]; tmp[j * nx + i] = s / (2 * R + 1); }
        for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { let s = 0; for (let d = -R; d <= R; d++) s += tmp[Math.max(0, Math.min(nz - 1, j + d)) * nx + i]; avg[j * nx + i] = s / (2 * R + 1); }
        const h = (i, j) => Hh[Math.max(0, Math.min(nz - 1, j)) * nx + Math.max(0, Math.min(nx - 1, i))];
        const L = [-0.5, 0.7, 0.5], ll = Math.hypot(...L); L[0] /= ll; L[1] /= ll; L[2] /= ll;      // (o sol do noroeste, como nos mapas)
        for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
            const k = j * nx + i, b = M.biome[k];
            land[k] = b === B.SEA ? 0 : 1; dep[k] = M.dist[k]; shade[k] = 1;
            if (b === B.SEA) continue;
            const gx = (h(i + 1, j) - h(i - 1, j)) / (2 * c), gz = (h(i, j + 1) - h(i, j - 1)) / (2 * c), il = 1 / Math.hypot(gx, 1, gz);
            const lam = (-gx * L[0] + L[1] - gz * L[2]) * il;
            let s = 1 + (lam - L[1]) * 1.35;
            s *= 1 + Math.max(-0.2, Math.min(0.12, (Hh[k] - avg[k]) * 0.035));
            if (M.flags[k] & 1) s *= 0.82;
            shade[k] = Math.max(0.5, Math.min(1.38, s));
            const base = this.BASE[b] || this.BASE[2], v = 0.93 + 0.14 * M._fbm(i / 13, j / 13, 2, 91);
            col[k * 3] = base[0] * v; col[k * 3 + 1] = base[1] * v; col[k * 3 + 2] = base[2] * v;
        }
        // a terra suavizada (binomial 5×5): a linha d'água (0,5) corre curva, sem os degraus das células em diagonal
        const soft = new Float32Array(N), K5 = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16];
        for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { let s = 0; for (let d = -2; d <= 2; d++) s += land[j * nx + Math.max(0, Math.min(nx - 1, i + d))] * K5[d + 2]; tmp[j * nx + i] = s; }
        for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { let s = 0; for (let d = -2; d <= 2; d++) s += tmp[Math.max(0, Math.min(nz - 1, j + d)) * nx + i] * K5[d + 2]; soft[j * nx + i] = s; }
        return (this._cells = { land, soft, dep, col, shade });
    },

    // O degradê do mar por profundidade, de 0,25 em 0,25 u (SEA).
    _seaLut() {
        if (this._sl) return this._sl;
        const S = this.SEA, n = Math.ceil(S[S.length - 1][0] * 4), out = new Float32Array((n + 1) * 3);
        for (let q = 0; q <= n; q++) {
            const dd = q / 4; let a = 0; while (a < S.length - 2 && dd > S[a + 1][0]) a++;
            const A = S[a], B = S[a + 1], t = Math.max(0, Math.min(1, (dd - A[0]) / (B[0] - A[0])));
            for (let c = 0; c < 3; c++) out[q * 3 + c] = A[c + 1] + (B[c + 1] - A[c + 1]) * t;
        }
        return (this._sl = out);
    },

    // Ruído suave ladrilhável 256×256 (grade a cada 8 texels), 0..1.
    _noise() {
        if (this._nz) return this._nz;
        const S = 256, G = 32, lat = new Float32Array(G * G), out = new Float32Array(S * S);
        for (let i = 0; i < G * G; i++) lat[i] = Pixel.hash(i % G, Math.floor(i / G), 4242);
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
            const gx = x / 8, gy = y / 8, ix = Math.floor(gx), iy = Math.floor(gy);
            let fx = gx - ix, fy = gy - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
            const a = lat[iy * G + ix], b = lat[iy * G + (ix + 1) % G], c = lat[((iy + 1) % G) * G + ix], d = lat[((iy + 1) % G) * G + (ix + 1) % G];
            out[y * S + x] = (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
        }
        return (this._nz = out);
    },

    // Copas de árvore vistas de cima num ladrilho de 64 u (4 texels/u). Luz do noroeste, a borda de cada copa mais escura.
    //   dense: a mata fechada — o brilho de cada texel (as frestas entre as copas escuras);
    //   solta: árvores no gramado — 1 = chão, < 1 = a sombra delas no chão (para o sudeste), ≥ 2 = copa (2 + o brilho).
    _crowns(dense) {
        const key = dense ? '_ctD' : '_ctS';
        if (this[key]) return this[key];
        const S = 256, U = 4, out = new Float32Array(S * S).fill(dense ? 0.52 : 1), rng = Pixel.rng(dense ? 717 : 718);
        const list = [], step = dense ? 2.7 : 9.5;
        for (let gz = 0; gz < 64; gz += step) for (let gx = 0; gx < 64; gx += step) {
            if (!dense && rng() < 0.35) continue;
            list.push({ x: gx + rng() * step, z: gz + rng() * step, r: (dense ? 1.5 : 1.3) + rng() * (dense ? 0.9 : 1.1), t: 0.9 + rng() * 0.2 });
        }
        list.sort((a, b) => b.z - a.z);
        const put = (x, z, v, mul) => { const i = ((Math.floor(x * U) % S) + S) % S, j = ((Math.floor(z * U) % S) + S) % S; out[j * S + i] = mul ? out[j * S + i] * v : v; };
        if (!dense) for (const t of list) {                                       // sombra no chão (sudeste)
            const r = t.r * 1.05;
            for (let dz = -r; dz <= r; dz += 1 / U) for (let dx = -r; dx <= r; dx += 1 / U) if (dx * dx + dz * dz <= r * r) put(t.x + dx + 0.7, t.z + dz - 0.7, 0.78, true);
        }
        for (const t of list) {
            const r = t.r;
            for (let dz = -r; dz <= r; dz += 1 / U) for (let dx = -r; dx <= r; dx += 1 / U) {
                const d2 = (dx * dx + dz * dz) / (r * r);
                if (d2 > 1) continue;
                const lit = (-dx * 0.62 + dz * 0.62) / r, rim = d2 > 0.72 ? 0.86 : 1;           // (z do texel cresce para o norte)
                put(t.x + dx, t.z + dz, (dense ? 0 : 2) + (0.8 + 0.26 * lit + 0.14 * (1 - d2)) * rim * t.t, false);
            }
        }
        return (this[key] = out);
    },

    // ------------------------------------------------------------------ pintura
    // Pinta a janela do mundo com canto noroeste (x0, zTop), w×h px a `ppu` px/u, no ImageData (as linhas y0 até y1).
    _paint(img, w, h, x0, zTop, ppu, y0 = 0, y1 = h) {
        const C = this._prep(), M = WorldMap, B = M.B, WD = Config.world, c = WD.cell, nx = M.nx, nz = M.nz;
        const land = C.land, soft = C.soft, dep = C.dep, col = C.col, shade = C.shade, bio = M.biome, d32 = new Uint32Array(img.data.buffer);      // (1 escrita por pixel: ABGR)
        const NZ = this._noise(), CD = this._crowns(true), CS = this._crowns(false), FARM = this.FARM;
        const hd = ppu >= 2, mid = ppu >= 1, inv = 1 / ppu, SL = this._seaLut(), SN = SL.length / 3 - 1;
        let fpi = 1e9, fpj = 1e9, fF = FARM[0];                                    // (talhão do pixel anterior: o hash só quando muda)
        const N2 = (u, v) => {                                                    // ruído bilinear em texels (período 256)
            const iu = Math.floor(u), iv = Math.floor(v), fu = u - iu, fv = v - iv, a = iu & 255, b = (iv & 255) << 8, a1 = (a + 1) & 255, b1 = ((iv + 1) & 255) << 8;
            const r0 = NZ[b + a] + (NZ[b + a1] - NZ[b + a]) * fu, r1 = NZ[b1 + a] + (NZ[b1 + a1] - NZ[b1 + a]) * fu;
            return r0 + (r1 - r0) * fv;
        };
        const NF = (u, v) => NZ[((Math.floor(v) & 255) << 8) + (Math.floor(u) & 255)];
        const CR = (T, x, z) => T[((Math.floor(z * 4) & 255) << 8) + (Math.floor(x * 4) & 255)];
        for (let py = y0; py < y1; py++) {
            const z = zTop - (py + 0.5) * inv, fz = (z - WD.minZ) / c - 0.5, jj = Math.floor(fz), tz = fz - jj;
            const j0 = Math.max(0, Math.min(nz - 1, jj)) * nx, j1 = Math.max(0, Math.min(nz - 1, jj + 1)) * nx;
            const gj = Math.floor((z - WD.minZ) / c);
            for (let px = 0; px < w; px++) {
                const x = x0 + (px + 0.5) * inv, fx = (x - WD.minX) / c - 0.5, ii = Math.floor(fx), tx = fx - ii;
                const i0 = Math.max(0, Math.min(nx - 1, ii)), i1 = Math.max(0, Math.min(nx - 1, ii + 1));
                const k00 = j0 + i0, k10 = j0 + i1, k01 = j1 + i0, k11 = j1 + i1;
                const w00 = (1 - tx) * (1 - tz), w10 = tx * (1 - tz), w01 = (1 - tx) * tz, w11 = tx * tz;
                const l00 = land[k00] * w00, l10 = land[k10] * w10, l01 = land[k01] * w01, l11 = land[k11] * w11, Ls = l00 + l10 + l01 + l11;
                const nM = N2(x * 0.9, z * 0.9), nF = NF(x * 7.3 + 31, z * 7.3 + 17);
                const edge = soft[k00] * w00 + soft[k10] * w10 + soft[k01] * w01 + soft[k11] * w11 + (nM - 0.5) * 0.3 + (nF - 0.5) * 0.04;
                let r, g, b;
                if (edge >= 0.5) {
                    // ---- terra
                    const s = shade[k00] * w00 + shade[k10] * w10 + shade[k01] * w01 + shade[k11] * w11;
                    if (Ls > 1e-4) {
                        r = (col[k00 * 3] * l00 + col[k10 * 3] * l10 + col[k01 * 3] * l01 + col[k11 * 3] * l11) / Ls;
                        g = (col[k00 * 3 + 1] * l00 + col[k10 * 3 + 1] * l10 + col[k01 * 3 + 1] * l01 + col[k11 * 3 + 1] * l11) / Ls;
                        b = (col[k00 * 3 + 2] * l00 + col[k10 * 3 + 2] * l10 + col[k01 * 3 + 2] * l01 + col[k11 * 3 + 2] * l11) / Ls;
                    } else { r = 224; g = 208; b = 154; }                                // (ponta de areia entre células de mar)
                    // o bioma deste pixel: a célula num ponto sacudido pelo ruído (divisas orgânicas); se cair no mar, a de mais peso
                    let bb = bio[k00];
                    if (bb !== bio[k10] || bb !== bio[k01] || bb !== bio[k11]) {
                        const nA = N2(x * 1.9 + 77, z * 1.9 + 13), nB = N2(x * 1.9 + 151, z * 1.9 + 201);
                        const si = Math.max(0, Math.min(nx - 1, Math.round(fx + (nA - 0.5) * 2.2))), sj = Math.max(0, Math.min(nz - 1, Math.round(fz + (nB - 0.5) * 2.2)));
                        bb = bio[sj * nx + si];
                        if (bb === B.SEA) { let kk = k00, wm = l00; if (l10 > wm) { kk = k10; wm = l10; } if (l01 > wm) { kk = k01; wm = l01; } if (l11 > wm) kk = k11; bb = bio[kk]; }
                    }
                    let f = 1;
                    switch (bb) {
                        case B.FOREST:
                            f = hd ? CR(CD, x, z) * (0.94 + 0.12 * nM) : 0.86 + 0.2 * nF;
                            break;
                        case B.GRASS: case B.RESORT: {
                            const p = N2(x * 0.22 + 9, z * 0.22 + 3);                   // manchas de capim mais claro e mais escuro
                            r *= 0.94 + 0.16 * p; g *= 0.96 + 0.1 * p;
                            f = 0.95 + (nF - 0.5) * 0.12;
                            const cv = hd ? CR(CS, x, z) : 1;
                            if (cv >= 2) { r = 60; g = 122; b = 54; f = cv - 2; }          // copa solta
                            else f *= cv;
                            break;
                        }
                        case B.FARM: {                                                   // talhão de 7×9 células: arado / verde / trigo
                            const gi = Math.floor((x - WD.minX) / c), pi = Math.floor(gi / 7), pj = Math.floor(gj / 9);
                            if (pi !== fpi || pj !== fpj) { fpi = pi; fpj = pj; const v = Pixel.hash(pi, pj, 77); fF = FARM[v < 0.34 ? 0 : (v < 0.68 ? 1 : 2)]; }
                            r = fF[0]; g = fF[1]; b = fF[2];
                            f = 0.97 + (nF - 0.5) * 0.08;
                            if (hd) f *= 0.93 + 0.09 * Math.sin(z * 4.83);                // fileiras do plantio (a cada 1,3 u)
                            if (mid) {
                                const ex = (x - WD.minX) - Math.floor(gi / 7) * 7 * c, ez = (z - WD.minZ) - Math.floor(gj / 9) * 9 * c;
                                if (ex < 0.6 || ez < 0.6) f *= 0.8;                         // a divisa (trilha entre os talhões)
                            }
                            break;
                        }
                        case B.ROCK: {
                            const cr = Math.abs(N2(x * 1.6 + 40, z * 1.6 + 90) * 2 - 1);      // fendas (ruído "de crista")
                            f = (0.9 + 0.2 * N2(x * 0.5, z * 0.5)) * (cr < 0.045 && nM > 0.45 ? 0.8 : 1) + (nF - 0.5) * 0.14;
                            break;
                        }
                        case B.SAND:
                            f = 1 + 0.035 * Math.sin((x * 0.9 + z * 0.35 + nM * 6) * 2.4) + (nF - 0.5) * 0.06;
                            break;
                        case B.SWAMP: {
                            const pd = N2(x * 0.55 + 300, z * 0.55 + 120);                      // poças d'água parada
                            if (pd > 0.64) { const t = Math.min(0.75, (pd - 0.64) * 6); r += (66 - r) * t; g += (104 - g) * t; b += (104 - b) * t; }
                            f = 0.94 + (nF - 0.5) * 0.18;
                            break;
                        }
                        case B.SCRUB: {                                                  // moitas baixas (as copas soltas, menores)
                            f = 0.95 + (nF - 0.5) * 0.14;
                            const cv = hd ? CR(CS, x * 1.7, z * 1.7) : 1;
                            if (cv >= 2) { r = 104; g = 118; b = 62; f = cv - 2; } else f *= cv;
                            break;
                        }
                        default:
                            f = 0.96 + (nF - 0.5) * 0.1;
                    }
                    f *= bb === B.FARM ? 1 + (s - 1) * 0.6 : s;                          // (o talhão é plano: relevo mais suave)
                    r *= f; g *= f; b *= f;
                    if (edge < 0.6) {                                                    // beira d'água: areia molhada / barranco
                        const t = 1 - (edge - 0.5) / 0.1, k = bb === B.SAND ? 0.82 : 0.86;
                        const m = 1 - (1 - k) * t; r *= m; g *= m; b *= m;
                    }
                } else {
                    // ---- água
                    const dd = dep[k00] * w00 + dep[k10] * w10 + dep[k01] * w01 + dep[k11] * w11 + (nM - 0.5) * 3;
                    const q = Math.max(0, Math.min(SN, Math.round(dd * 4))) * 3;
                    r = SL[q]; g = SL[q + 1]; b = SL[q + 2];
                    if (hd) { const wv = 1 + (N2(x * 0.45 + 60, z * 1.3) - 0.5) * 0.09 + (nF - 0.5) * 0.03; r *= wv; g *= wv; b *= wv; }      // ondulação
                    let foam = edge > 0.38 ? (edge - 0.38) / 0.12 * 0.8 : 0;                     // espuma na beira
                    const br = dd - 4.5 - (nM - 0.5) * 3;                                        // a arrebentação
                    if (mid && dd < 9 && br > -0.9 && br < 0.9) foam = Math.max(foam, (1 - Math.abs(br) / 0.9) * 0.32 * (N2(x * 2 + 5, z * 2 + 9) > 0.42 ? 1 : 0.3));
                    if (foam > 0) { r += (240 - r) * foam; g += (250 - g) * foam; b += (250 - b) * foam; }
                }
                d32[py * w + px] = 0xff000000 | ((b > 255 ? 255 : b < 0 ? 0 : b) << 16) | ((g > 255 ? 255 : g < 0 ? 0 : g) << 8) | (r > 255 ? 255 : r < 0 ? 0 : r);
            }
        }
    },
};
