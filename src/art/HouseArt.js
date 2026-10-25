// ============================================================================
// HouseArt — a arte (pixel art desenhada por código) da safe house do protagonista (ver map/SafeHouse.js e world/HouseView.js):
//   • interior()  o "corte" do barraco visto de cima/em obliquo: piso, paredes, móveis e objetos, TUDO num quadro só (~210×220 px,
//                 20 px/u como o resto do jogo). Os móveis mostram o topo e a frente (como na arte de referência), as paredes
//                 do fundo mostram a face interna e as da frente ficam baixas (corte de casa de bonecas).
//   • texturas de fora: tijolo, zinco, tábua, telhado, porta, vidro das janelas e a seta que marca a entrada.
// Coordenadas LOCAIS da casa (x → leste, z → norte; origem no canto sudoeste externo). O quadro do interior cobre IN.
// ============================================================================

const HouseArt = {
    PPU: Config.art.ppu,
    K: 0.22,                                             // quanto 1 u de altura "sobe" na tela (corte oblíquo)
    get IN() { return { x0: -0.4, z0: -0.8, x1: SafeHouse.W + 0.4, z1: SafeHouse.D + 2.7 }; },      // retângulo local coberto pelo quadro do interior

    // ----------------------------------------------------------------- ferramentas
    _P(w, h) {
        const c = new PixelCanvas(w, h);
        const hex = Pixel.hex;
        c.px = (x, y, col, a = 255) => { if (x >= 0 && y >= 0 && x < c.w && y < c.h) c.set(x, y, typeof col === 'string' ? hex(col) : col, a); };
        c.fr = (x, y, w2, h2, col, a = 255) => { const cc = typeof col === 'string' ? hex(col) : col; for (let j = 0; j < h2; j++) for (let i = 0; i < w2; i++) c.px(x + i, y + j, cc, a); };
        // mistura `col` com alfa `a` (0..1) sobre o que já está desenhado
        c.bl = (x, y, w2, h2, col, a) => {
            const cc = typeof col === 'string' ? hex(col) : col;
            for (let j = 0; j < h2; j++) for (let i = 0; i < w2; i++) {
                const X = x + i, Y = y + j;
                if (X < 0 || Y < 0 || X >= c.w || Y >= c.h) continue;
                const k = (Y * c.w + X) * 4;
                if (c.data[k + 3] === 0) continue;
                c.data[k] += (cc[0] - c.data[k]) * a; c.data[k + 1] += (cc[1] - c.data[k + 1]) * a; c.data[k + 2] += (cc[2] - c.data[k + 2]) * a;
            }
        };
        c.blPx = (X, Y, col, a) => { c.bl(X, Y, 1, 1, col, a); };
        c.ln = (x0, y0, x1, y1, col, a = 255) => {            // linha (Bresenham)
            const cc = typeof col === 'string' ? hex(col) : col;
            let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
            for (let n = 0; n < 4000; n++) {
                c.px(x0, y0, cc, a);
                if (x0 === x1 && y0 === y1) break;
                const e2 = 2 * err;
                if (e2 >= dy) { err += dy; x0 += sx; }
                if (e2 <= dx) { err += dx; y0 += sy; }
            }
        };
        c.ring = (cx, cy, r, col) => { for (let a = 0; a < 6.3; a += 0.5 / Math.max(2, r)) c.px(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), col); };
        c.disk = (cx, cy, r, col, a = 255) => { const cc = typeof col === 'string' ? hex(col) : col; for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r + r * 0.4) c.px(cx + i, cy + j, cc, a); };
        // retângulo com contorno escuro de 1 px, luz em cima/esquerda e sombra embaixo/direita
        c.box = (x, y, w2, h2, base, hi, lo, edge) => {
            c.fr(x, y, w2, h2, base);
            if (hi) { c.fr(x + 1, y + 1, w2 - 2, 1, hi); c.fr(x + 1, y + 1, 1, h2 - 2, hi); }
            if (lo) { c.fr(x + 1, y + h2 - 2, w2 - 2, 1, lo); c.fr(x + w2 - 2, y + 1, 1, h2 - 2, lo); }
            if (edge) { c.fr(x, y, w2, 1, edge); c.fr(x, y + h2 - 1, w2, 1, edge); c.fr(x, y, 1, h2, edge); c.fr(x + w2 - 1, y, 1, h2, edge); }
        };
        return c;
    },

    _tint(col, k) { const c = typeof col === 'string' ? Pixel.hex(col) : col; return Pixel.clamp(Pixel.scale(c, k)); },
    _mixc(a, b, t) { return Pixel.clamp(Pixel.mix(typeof a === 'string' ? Pixel.hex(a) : a, typeof b === 'string' ? Pixel.hex(b) : b, t)); },

    // Texturas "de papel": granulado por pixel (clareia/escurece) para quebrar áreas lisas.
    _grain(c, x, y, w, h, amt, seed) {
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
            const X = x + i, Y = y + j, k = (Y * c.w + X) * 4;
            if (X < 0 || Y < 0 || X >= c.w || Y >= c.h || c.data[k + 3] === 0) continue;
            const g = (Pixel.hash(X, Y, seed) - 0.5) * 2 * amt;
            c.data[k] = Math.max(0, Math.min(255, c.data[k] + g)); c.data[k + 1] = Math.max(0, Math.min(255, c.data[k + 1] + g)); c.data[k + 2] = Math.max(0, Math.min(255, c.data[k + 2] + g));
        }
    },

    // ================================================================= texturas de fora
    // Tijolo à vista com reboco desbotado e manchas (tile 64×64 = 3,2 u).
    brick() {
        const c = this._P(64, 64), rng = Pixel.rng(311);
        const cols = ['#a4513a', '#b25e41', '#97452f', '#b96a48', '#a85a3c'];
        c.fr(0, 0, 64, 64, '#6a4636');
        for (let r = 0; r < 8; r++) {
            const off = (r % 2) * 8;
            for (let b = -1; b < 5; b++) {
                const x = b * 16 + off, col = cols[Math.floor(rng() * cols.length)];
                c.fr(x + 1, r * 8 + 1, 15, 7, col);
                c.fr(x + 1, r * 8 + 1, 15, 1, this._tint(col, 1.18));
                c.fr(x + 1, r * 8 + 7, 15, 1, this._tint(col, 0.8));
                if (rng() < 0.3) c.fr(x + 2 + Math.floor(rng() * 10), r * 8 + 2 + Math.floor(rng() * 4), 2 + Math.floor(rng() * 3), 1, this._tint(col, 0.72));
            }
        }
        for (const [px, py, w, h] of [[6, 10, 22, 14], [40, 36, 20, 16], [0, 48, 14, 10]]) {          // reboco desbotado que caiu em pedaços
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
                const edge = Pixel.hash(px + i, py + j, 9) < 0.18 + (Math.min(i, j, w - 1 - i, h - 1 - j) < 2 ? 0.55 : 0);
                if (edge) continue;
                c.px(px + i, py + j, Pixel.hash(px + i, py + j, 4) < 0.1 ? '#b9a98c' : '#c9b99c');
            }
        }
        this._grain(c, 0, 0, 64, 64, 9, 2);
        return c;
    },

    // Zinco ondulado (chapas verticais) com ferrugem e pregos.
    zinc() {
        const c = this._P(64, 64);
        const ramp = ['#7f868b', '#98a0a5', '#b6bdc1', '#c8cfd3', '#b0b7bb', '#8f979c'];
        for (let x = 0; x < 64; x++) for (let y = 0; y < 64; y++) c.px(x, y, ramp[x % 6]);
        for (let s = 0; s < 4; s++) {                                  // costuras das chapas
            c.fr(s * 16, 0, 1, 64, '#5f666b');
        }
        const rng = Pixel.rng(77);
        for (let k = 0; k < 14; k++) {                                 // ferrugem escorrida
            const x = Math.floor(rng() * 64), y = Math.floor(rng() * 40), len = 6 + Math.floor(rng() * 22);
            for (let j = 0; j < len; j++) c.px(x, y + j, j % 5 === 4 ? '#8a5a38' : '#a86a3e', 255);
            c.px(x + 1, y, '#8a5a38');
        }
        for (let s = 0; s < 4; s++) for (const y of [6, 38]) { c.px(s * 16 + 3, y, '#4a4f54'); c.px(s * 16 + 11, y + 1, '#4a4f54'); }
        this._grain(c, 0, 0, 64, 64, 7, 5);
        return c;
    },

    // Tábuas horizontais pintadas de verde-água desbotado (quarto) — madeira velha.
    plank() {
        const c = this._P(64, 64), rng = Pixel.rng(509);
        const cols = ['#6d8a82', '#7b9a90', '#648178', '#85a399'];
        for (let r = 0; r < 6; r++) {
            const y = r * 11, col = cols[Math.floor(rng() * cols.length)], dark = this._tint(col, 0.62);
            c.fr(0, y, 64, 10, col);
            c.fr(0, y, 64, 1, this._tint(col, 1.15));
            c.fr(0, y + 10, 64, 1, '#33413e');
            for (let n = 0; n < 6; n++) c.fr(Math.floor(rng() * 56), y + 2 + Math.floor(rng() * 6), 3 + Math.floor(rng() * 8), 1, dark);
            const nx = 4 + Math.floor(rng() * 20); c.px(nx, y + 4, '#2e3835'); c.px(nx + 30, y + 5, '#2e3835');
            for (let n = 0; n < 5; n++) c.px(Math.floor(rng() * 64), y + 1 + Math.floor(rng() * 8), '#b8a98a');      // tinta descascada
        }
        this._grain(c, 0, 0, 64, 64, 8, 3);
        return c;
    },

    // Porta da frente: madeira pintada de turquesa, tábuas verticais, tinta descascada, trinco amarelo. 44×44 (2,2 u).
    door() {
        const c = this._P(44, 44), rng = Pixel.rng(41);
        c.fr(0, 0, 44, 44, '#1e5f66');
        for (let p = 0; p < 8; p++) {
            const x = 2 + p * 5, col = p % 2 ? '#2f8f94' : '#34999e';
            c.fr(x, 2, 4, 40, col); c.fr(x, 2, 1, 40, '#4fb4b6'); c.fr(x + 3, 2, 1, 40, '#1f6a70');
        }
        c.fr(0, 0, 44, 2, '#3a2a1c'); c.fr(0, 42, 44, 2, '#3a2a1c'); c.fr(0, 0, 2, 44, '#3a2a1c'); c.fr(42, 0, 2, 44, '#3a2a1c');
        c.fr(2, 19, 40, 2, '#1a4d52'); c.fr(2, 33, 40, 2, '#1a4d52');                                      // travessas
        for (let n = 0; n < 26; n++) c.px(2 + Math.floor(rng() * 40), 2 + Math.floor(rng() * 40), n % 3 ? '#8a6a44' : '#cdb98a');   // lascas de tinta
        c.fr(34, 24, 3, 6, '#e8c24a'); c.fr(34, 24, 3, 1, '#fff0a8'); c.px(35, 27, '#7a5a1a');            // maçaneta
        return c;
    },

    // Janela: moldura de madeira, vidro azul-escuro com reflexo e um pano de cortina. 40×24.
    window() {
        const c = this._P(40, 24);
        c.fr(0, 0, 40, 24, '#4a3624');
        c.fr(2, 2, 17, 20, '#1d3550'); c.fr(21, 2, 17, 20, '#1d3550');
        for (const x of [2, 21]) { c.ln(x + 2, 19, x + 9, 4, '#3f6a96'); c.ln(x + 5, 19, x + 12, 4, '#2c5078'); c.fr(x, 2, 17, 1, '#2c4a6a'); }
        c.fr(19, 0, 2, 24, '#6a4e34'); c.fr(0, 11, 40, 1, '#3a2a1c');
        c.fr(0, 0, 40, 1, '#7a5a3a'); c.fr(0, 23, 40, 1, '#2a1c10');
        c.fr(2, 2, 6, 10, '#c4705a'); c.fr(2, 2, 6, 1, '#e08a72'); c.px(4, 6, '#f2c8b4'); c.px(6, 9, '#f2c8b4');    // cortina de pano
        return c;
    },

    // Seta que marca a entrada (aponta para o norte/cima da textura), com contorno escuro. 24×30.
    arrow() {
        const c = this._P(24, 30);
        const body = '#ffd23a', hi = '#fff3a0', lo = '#d48a12', ed = '#3a2208';
        const shape = (x, y) => {                                    // x,y em px; seta apontando para cima
            if (y >= 3 && y < 15) return Math.abs(x - 11.5) <= (y - 3) * 1.0 + 0.6;       // ponta
            if (y >= 15 && y < 27) return Math.abs(x - 11.5) <= 4.6;                       // haste
            return false;
        };
        for (let y = 0; y < 30; y++) for (let x = 0; x < 24; x++) {
            if (shape(x, y)) { c.px(x, y, body); continue; }
            if (shape(x - 1, y) || shape(x + 1, y) || shape(x, y - 1) || shape(x, y + 1)) c.px(x, y, ed);
        }
        for (let y = 0; y < 30; y++) for (let x = 0; x < 24; x++) {
            if (!shape(x, y)) continue;
            if (!shape(x - 1, y) || !shape(x, y - 1)) c.px(x, y, hi);
            else if (!shape(x + 1, y) || !shape(x, y + 1)) c.px(x, y, lo);
        }
        return c;
    },

    // Telhado visto de cima (24×16 u = 480×320 px): chapas de zinco, pedras e pneus segurando, caixa-d'água azul, antena.
    roof() {
        // zinco do barraco (o quadro cobre o telhado inteiro, com o beiral): chapas velhas, ferrugem, pneus e pedras segurando
        const S = SafeHouse, W = Math.round((S.W + 1) * 20), Hh = Math.round((S.D + 0.45) * 20), c = this._P(W, Hh), rng = Pixel.rng(2718);
        const ramp = ['#7b8287', '#929a9f', '#acb3b8', '#bec5c9', '#a6adb2', '#868e93'];
        for (let x = 0; x < W; x++) for (let y = 0; y < Hh; y++) c.px(x, y, ramp[(x + Math.floor(y / 60)) % 6]);
        for (let s = 0; s * 40 < W; s++) c.fr(s * 40, 0, 1, Hh, '#565d62');                 // emendas das chapas (2 m)
        for (let k = 0; k < 26; k++) {                                                      // ferrugem escorrida
            const x = Math.floor(rng() * W), y = Math.floor(rng() * Hh), len = 6 + Math.floor(rng() * 26);
            for (let j = 0; j < len; j++) c.px(x, Math.min(Hh - 1, y + j), j % 6 === 5 ? '#8a5a38' : '#a86a3e');
        }
        c.box(Math.round(W * 0.58), Math.round(Hh * 0.3), 26, 16, '#a0683e', '#c08050', '#6a4426', '#3a2414');      // chapa remendada (ferrugem)
        for (const f of [0.3, 0.7]) { const y = Math.round(Hh * f); c.fr(0, y, W, 3, '#6a4e34'); c.fr(0, y, W, 1, '#8a6a44'); }
        const tire = (cx, cy) => { c.disk(cx, cy, 9, '#15161a'); c.disk(cx, cy, 5, '#2a2c32'); c.disk(cx, cy, 2, '#0c0d10'); c.ring(cx, cy, 8, '#3a3d46'); };
        const rock = (cx, cy, r) => { c.disk(cx, cy, r, '#6f6b63'); c.disk(cx - 1, cy - 1, Math.max(2, r - 3), '#8a857a'); };
        for (const [fx, fy] of [[0.1, 0.15], [0.48, 0.12], [0.2, 0.82], [0.8, 0.85]]) tire(Math.round(W * fx), Math.round(Hh * fy));
        for (const [fx, fy] of [[0.35, 0.5], [0.66, 0.6], [0.9, 0.35], [0.08, 0.5]]) rock(Math.round(W * fx), Math.round(Hh * fy), 4 + Math.floor(rng() * 3));
        // caixa-d'água pequena (azul, 500 L) no canto nordeste
        const tx = W - 26, ty = 24;
        c.disk(tx + 3, ty + 4, 17, '#10202c'); c.disk(tx, ty, 16, '#1f4f8a'); c.disk(tx - 2, ty - 2, 12, '#3a78c4'); c.ring(tx, ty, 15, '#16365e'); c.disk(tx + 4, ty + 3, 3, '#16365e');
        // o "gato" da luz chegando pelo telhado
        c.ln(0, Hh - 30, Math.round(W * 0.45), Math.round(Hh * 0.5), '#1a1a1e'); c.ln(Math.round(W * 0.45), Math.round(Hh * 0.5), W, Math.round(Hh * 0.42), '#1a1a1e');
        c.fr(0, 0, W, 2, '#5a4a3a'); c.fr(0, Hh - 2, W, 2, '#3a2e22'); c.fr(0, 0, 2, Hh, '#5a4a3a'); c.fr(W - 2, 0, 2, Hh, '#3a2e22');
        this._grain(c, 0, 0, W, Hh, 8, 1);
        return c;
    },

    // ================================================================= interior
    // Devolve { canvas, in: IN } — o corte da casa. Textura com alfa (fora do desenho fica transparente).
    interior() {
        const S = SafeHouse, IN = this.IN, PPU = this.PPU, K = this.K;
        const WPX = Math.round((IN.x1 - IN.x0) * PPU), HPX = Math.round((IN.z1 - IN.z0) * PPU);
        const c = this._P(WPX, HPX), rng = Pixel.rng(8080);
        const X = (x) => Math.round((x - IN.x0) * PPU), Y = (z) => Math.round((IN.z1 - z) * PPU);
        const T = S.T, W = S.W, D = S.D, H = S.H, CUT = S.MAT_CUT;
        const hpx = (h) => Math.round(h * K * PPU);
        const F = {}; for (const f of S.furniture) F[f.kind] = f;
        const floorX0 = X(T), floorX1 = X(W - T), floorY0 = Y(D - T), floorY1 = Y(T);        // piso (px): y0 = norte

        // ------------------------------------------------------------ PISO: contrapiso de cimento grosso, rachado e manchado
        for (let y = floorY0; y < floorY1; y++) for (let x = floorX0; x < floorX1; x++) {
            const n = Pixel.noise(x, y, 9, 61, 99, 99), g = (Pixel.hash(x, y, 33) - 0.5) * 16 + (n - 0.5) * 22;
            c.px(x, y, [118 + g, 112 + g, 100 + g]);
        }
        const crack = (x, y, n, seed) => { const r = Pixel.rng(seed); let cx = x, cy = y; for (let i = 0; i < n; i++) { c.px(cx, cy, '#3e3a32'); c.px(cx + 1, cy, '#5e594e', 150); cx += Math.floor(r() * 3) - 1; cy += r() < 0.75 ? 1 : 0; } };
        for (const [x, z, n, s] of [[4.0, 6.6, 60, 1], [6.2, 4.6, 40, 2], [2.6, 4.4, 34, 3], [8.6, 3.4, 30, 4]]) crack(X(x), Y(z), n, s);
        const stain = (cx, cy, r, col, a, seed) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = hypot(x, y) / r, n = Pixel.noise(cx + x, cy + y, 5, seed, 99, 99); if (d + (n - 0.5) * 0.8 < 1) c.bl(cx + x, cy + y, 1, 1, col, a); } };
        stain(X(4.65), Y(3.55), 16, '#20242a', 0.32, 21);                                     // chão molhado em volta do balde
        stain(X(1.4), Y(4.6), 12, '#1c2418', 0.3, 22);                                        // mofo no canto do colchão
        stain(X(6.0), Y(5.6), 10, '#2a1c10', 0.28, 23);                                       // gordura do fogareiro
        stain(X(7.4), Y(1.5), 9, '#3a2a18', 0.22, 24);                                        // barro que entra pela porta
        // papelão na entrada (capacho improvisado) e um chinelo largado
        { const x = X(6.7), y = Y(1.3); c.fr(x, y, 28, 16, '#a8824e'); c.fr(x, y, 28, 1, '#c4a066'); c.fr(x, y + 15, 28, 1, '#7a5a30'); c.ln(x + 4, y + 6, x + 24, y + 6, '#8c6a3a'); c.ln(x + 8, y + 10, x + 20, y + 11, '#8c6a3a'); }
        { const x = X(5.3), y = Y(2.0); c.fr(x, y, 4, 9, '#2f7fd0'); c.fr(x + 6, y + 2, 4, 9, '#2f7fd0'); c.px(x + 1, y + 2, '#e8e8e8'); c.px(x + 7, y + 4, '#e8e8e8'); }
        // sombra de oclusão junto às paredes
        for (let i = 0; i < 8; i++) {
            const a = 0.38 * (1 - i / 8);
            c.bl(floorX0, floorY0 + i, floorX1 - floorX0, 1, [10, 6, 4], a);
            c.bl(floorX0 + i, floorY0, 1, floorY1 - floorY0, [10, 6, 4], a * 0.8);
            c.bl(floorX1 - 1 - i, floorY0, 1, floorY1 - floorY0, [10, 6, 4], a * 0.8);
        }

        // ------------------------------------------------------------ PAREDE DO FUNDO (norte): zinco a oeste, bloco sem reboco a leste
        const northY = Y(D - T), faceH = hpx(H), capH = Math.round(T * PPU), y0w = northY - faceH;
        {
            const x0 = floorX0, x1 = X(CUT), ramp = ['#727a7e', '#899095', '#a1a8ac', '#b0b7bb', '#979ea2', '#7d8589'];
            for (let y = 0; y < faceH; y++) for (let x = x0; x < x1; x++) c.px(x, y0w + y, ramp[(x + 1) % 6]);
            for (let s = x0; s < x1; s += 30) c.fr(s, y0w, 1, faceH, '#4e5559');
            for (let k = 0; k < 8; k++) { const rx = x0 + Math.floor(rng() * (x1 - x0)), ry = y0w + Math.floor(rng() * faceH * 0.5), len = 4 + Math.floor(rng() * 10); for (let j = 0; j < len; j++) c.px(rx, ry + j, j % 4 === 3 ? '#7a4a2a' : '#9a5a32'); }
        }
        {
            const x0 = X(CUT), x1 = floorX1, cols = ['#8e8a82', '#9a958c', '#848078', '#a39e94'];
            c.fr(x0, y0w, x1 - x0, faceH, '#5c5850');
            for (let r = 0; r * 6 < faceH; r++) for (let b = -1; b * 16 < x1 - x0; b++) {
                const bx = x0 + b * 16 + (r % 2) * 8, col = cols[Math.floor(rng() * 4)];
                for (let j = 1; j < 5; j++) for (let i = 1; i < 16; i++) { const px = bx + i, py = y0w + r * 6 + j; if (px >= x0 && px < x1 && py < northY) c.px(px, py, j === 1 ? this._tint(col, 1.12) : col); }
            }
        }
        this._grain(c, floorX0, y0w, floorX1 - floorX0, faceH, 6, 17);
        c.fr(X(CUT), y0w, 2, faceH, '#3a3630');                                               // emenda zinco/bloco
        // mofo subindo do pé da parede e a mancha da goteira escorrendo do teto (em cima do balde)
        for (let x = floorX0; x < floorX1; x++) { const h = 2 + Math.floor(Pixel.noise(x, 0, 6, 5, 99, 99) * 6); c.bl(x, northY - h, 1, h, [40, 52, 34], 0.45); }
        { const lx = X(4.65); for (let j = 0; j < faceH; j++) c.bl(lx - 3 + Math.round(Math.sin(j * 0.6)), y0w + j, 6, 1, [30, 34, 40], 0.35); }
        c.bl(floorX0, y0w, floorX1 - floorX0, 4, [10, 6, 4], 0.4);
        c.bl(floorX0, northY - 6, floorX1 - floorX0, 6, [10, 6, 4], 0.3);
        // janela do fundo: sem vidro, tapada com plástico leitoso preso com fita
        {
            const w = S.windows.find((q) => q.wall === 'N'), x0 = X(w.a), x1 = X(w.b), yb = northY - hpx(w.y0), yt = northY - hpx(w.y1);
            c.fr(x0 - 2, yt - 2, x1 - x0 + 4, yb - yt + 4, '#3a2a1c');
            c.fr(x0, yt, x1 - x0, yb - yt, '#9fb0b8');
            for (let i = 0; i < x1 - x0; i++) for (let j = 0; j < yb - yt; j++) if (Pixel.hash(i, j, 5) < 0.25) c.px(x0 + i, yt + j, '#c8d4da');
            c.ln(x0 + 2, yt + 1, x1 - 3, yb - 2, '#7d8e96'); c.fr(x0, yt, 5, 2, '#d8c890'); c.fr(x1 - 5, yb - 2, 5, 2, '#d8c890');      // dobra + fita
        }
        // tampa (cap) da parede norte e as laterais inclinadas
        for (let j = 0; j < capH; j++) c.fr(X(0), y0w - capH + j, X(W) - X(0), 1, j === 0 ? '#9a9486' : (j === capH - 1 ? '#4a463c' : '#726c60'));
        const slantH = (z) => 0.5 + (H - 0.5) * Math.pow(Math.max(0, Math.min(1, (z - 0.4) / (D - T - 0.4))), 0.8);
        const ribbon = (xa, xb, col, hi, lo) => {
            let prev = null;
            for (let z = 0; z <= D; z += 0.04) {
                const y = Y(z) - hpx(slantH(z));
                if (prev !== null && y < prev) for (let yy = y; yy <= prev; yy++) for (let x = xa; x < xb; x++) c.px(x, yy, x === xa ? hi : (x === xb - 1 ? lo : col));
                for (let x = xa; x < xb; x++) c.px(x, y, x === xa ? hi : (x === xb - 1 ? lo : col));
                prev = y;
            }
        };
        ribbon(X(0), X(T), '#6a5a44', '#8a7658', '#463a2a');                                  // oeste: tábua
        ribbon(X(W - T), X(W), '#7a8084', '#a0a6aa', '#50565a');                              // leste: zinco
        // parede da frente (sul), baixa: com o vão da porta e a janela de plástico
        const southY = Y(0), sH = hpx(0.5);
        const sCap = (xa, xb, col) => {
            for (let j = 0; j < sH; j++) c.fr(xa, southY - j, xb - xa, 1, this._tint(col, 0.78 + 0.22 * (j / sH)));
            for (let j = 0; j < capH; j++) c.fr(xa, southY - sH - j, xb - xa, 1, j === capH - 1 ? '#9a9486' : (j === 0 ? '#4a463c' : '#726c60'));
        };
        const dx0 = X(S.door.x0), dx1 = X(S.door.x1);
        sCap(X(0), Math.min(dx0, X(CUT)), '#8a9095'); sCap(X(CUT), dx0, '#8e8a82'); sCap(dx1, X(W), '#8e8a82');
        { const w = S.windows.find((q) => q.wall === 'S'), a = X(w.a), b = X(w.b); c.fr(a, southY - sH - capH + 2, b - a, capH - 3, '#9fb0b8'); }
        c.bl(dx0, southY - 30, dx1 - dx0, 30, [255, 236, 170], 0.16);                         // luz do dia entrando pela porta
        for (const dx of [dx0 - 3, dx1]) { c.fr(dx, southY - sH - capH, 3, sH + capH, '#4a3624'); c.fr(dx, southY - sH - capH, 3, 1, '#8a6a44'); }

        // ------------------------------------------------------------ MÓVEIS
        const base = (f) => ({ x: X(f.x0), y: Y(f.z1), w: X(f.x1) - X(f.x0), h: Y(f.z0) - Y(f.z1), hp: Math.max(2, hpx(f.h)) });
        const shadow = (b, extra = 0) => { c.bl(b.x + 3, b.y + 3, b.w + 2 + extra, b.h + 1, [8, 5, 3], 0.34); };

        // ----- Colchão de espuma fino, manchado, em cima de dois paletes; cobertor embolado e um travesseiro achatado
        {
            const b = base(F.bed), top = b.y - b.hp;
            shadow(b, 2);
            c.box(b.x, b.y + b.h - b.hp - 1, b.w, b.hp + 1, '#9a7a4e', '#c4a066', '#5a4426', '#2a1c10');       // paletes (frente)
            for (let i = 2; i < b.w - 2; i += 6) c.fr(b.x + i, b.y + b.h - b.hp, 3, b.hp - 1, '#3a2a18');
            c.box(b.x + 1, top, b.w - 2, b.h - 1, '#d8c890', '#ece0a8', '#a89660', '#4a4026');                   // colchão
            for (const [sx, sz, r] of [[0.35, 0.3, 7], [0.6, 0.75, 9], [0.3, 0.8, 5]]) stain(b.x + Math.round(b.w * sx), top + Math.round(b.h * sz), r, '#8a7440', 0.4, 31 + r);
            c.box(b.x + 4, top + 3, b.w - 8, 13, '#e4e0d4', '#f4f2ea', '#b0aa98', '#5a5444');                    // travesseiro (cabeceira ao norte)
            const cy = top + Math.round(b.h * 0.45);                                                             // cobertor xadrez embolado
            for (let y = cy; y < top + b.h - 4; y++) for (let x = b.x + 3; x < b.x + b.w - 3; x++) {
                const wav = Math.sin((x - b.x) * 0.35 + y * 0.2) * 2;
                if (y < cy + 3 + wav) continue;
                c.px(x, y, ((Math.floor((x - b.x) / 5) + Math.floor((y - cy) / 5)) % 2) ? '#7a3a34' : '#9a5040');
            }
            c.ln(b.x + 3, cy + 6, b.x + b.w - 4, cy + 3, '#5a2a24');
        }
        // ----- Lata escondida (leite em pó, enferrujada) encostada no colchão
        { const b = base(F.tin); shadow(b); c.disk(b.x + (b.w >> 1), b.y + (b.h >> 1), 5, '#b8b4a8'); c.disk(b.x + (b.w >> 1), b.y + (b.h >> 1), 4, '#d4d0c4'); c.ring(b.x + (b.w >> 1), b.y + (b.h >> 1), 5, '#5a5448'); c.px(b.x + 3, b.y + 3, '#9a5a32'); c.px(b.x + 6, b.y + 7, '#9a5a32'); }
        // ----- Armário velho de madeira, porta empenada entreaberta mostrando as poucas mudas de roupa nos cabides
        {
            const b = base(F.wardrobe), top = b.y - b.hp;
            shadow(b, 3);
            c.box(b.x, b.y + b.h - b.hp - 1, b.w, b.hp + 1, '#6a4a2a', '#8a6238', '#3e2a16', '#1c1208');       // frente
            const ox = b.x + (b.w >> 1);
            const hang = ['#e8e0d0', '#2f6fbf', '#c0392b', '#3a3d46', '#5a7a9a'];                              // camisetas, moletom, bermuda
            for (let i = 0; i < hang.length; i++) c.fr(ox + 2 + i * 3, b.y + b.h - b.hp + 1, 3, b.hp - 2, hang[i]);
            c.fr(ox, b.y + b.h - b.hp, 2, b.hp, '#2a1c10');
            c.box(b.x, top, b.w, b.h, '#7a5634', '#9a7448', '#4e3620', '#1c1208');                             // tampo
            c.box(b.x + 4, top - 6, 16, 10, '#b58652', '#d6a870', '#7a5830', '#3a2810');                        // caixa de papelão em cima
            c.fr(b.x + 26, top + 4, 6, 3, '#c8ccd0');                                                            // espelhinho rachado
            c.px(b.x + 28, top + 5, '#ffffff'); c.ln(b.x + 27, top + 4, b.x + 30, top + 6, '#5a6066');
        }
        // ----- Botijão de gás (P13 laranja)
        { const b = base(F.gas), cx = b.x + (b.w >> 1), cy = b.y + (b.h >> 1); shadow(b); c.disk(cx, cy, 5, '#c06020'); c.disk(cx - 1, cy - 1, 3, '#e8883a'); c.disk(cx, cy, 2, '#3a3d46'); c.ln(cx, cy, cx + 7, cy + 3, '#2a2c30'); }
        // ----- Fogareiro de duas bocas em cima de um caixote, com uma panela de arroz
        {
            const b = base(F.stove), top = b.y - b.hp;
            shadow(b, 1);
            c.box(b.x, b.y + b.h - b.hp - 1, b.w, b.hp + 1, '#9a7a4e', '#c4a066', '#5a4426', '#2a1c10');       // caixote
            for (let j = 2; j < b.hp; j += 3) c.fr(b.x + 1, b.y + b.h - b.hp + j, b.w - 2, 1, '#3a2a18');
            c.box(b.x + 2, top, b.w - 4, b.h - 1, '#3a3d42', '#5a5e64', '#202226', '#101114');                 // fogareiro
            c.ring(b.x + 8, top + (b.h >> 1), 4, '#1a1b1e'); c.ring(b.x + b.w - 9, top + (b.h >> 1), 4, '#1a1b1e');
            c.disk(b.x + b.w - 9, top + (b.h >> 1) - 1, 5, '#8a8e94'); c.disk(b.x + b.w - 9, top + (b.h >> 1) - 1, 3, '#e8e4d8'); c.fr(b.x + b.w - 3, top + (b.h >> 1) - 2, 4, 2, '#2a2c30');
        }
        // ----- Geladeira pequena e velha: amassada, ferrugem no pé, ímã de pizzaria e um pote em cima
        {
            const b = base(F.fridge), top = b.y - b.hp;
            shadow(b, 2);
            c.box(b.x, b.y + b.h - b.hp - 1, b.w, b.hp + 1, '#d4d2c4', '#f0eee2', '#8e8c80', '#2a2a24');
            for (let i = 2; i < b.w - 2; i++) if (Pixel.hash(i, 3, 7) < 0.4) c.px(b.x + i, b.y + b.h - 2, '#9a5a32');
            c.fr(b.x + b.w - 5, b.y + b.h - b.hp + 1, 2, b.hp - 3, '#7a7e7a');
            c.box(b.x, top, b.w, b.h, '#e2e0d4', '#f6f4ea', '#a6a498', '#2a2a24');
            c.bl(b.x + 6, top + 4, 8, 5, [90, 88, 78], 0.25);                                                    // amassado
            c.fr(b.x + 18, top + 6, 5, 5, '#d9453a'); c.px(b.x + 20, top + 8, '#f0d040');                       // ímã
            c.box(b.x + 4, top + 12, 12, 8, '#e8e8e4', '#ffffff', '#b4b4ae', '#5a5a54');                        // pote de sorvete (feijão dentro)
        }
        // ----- Caixote de feira (o "baú"): ripas, uma sacola e um par de tênis velho dentro
        {
            const b = base(F.chest), top = b.y - b.hp;
            shadow(b, 1);
            c.box(b.x, b.y + b.h - b.hp - 1, b.w, b.hp + 1, '#b08a54', '#d0aa70', '#6a5030', '#2a1c10');
            c.fr(b.x + 1, top, b.w - 2, b.h - 1, '#3a2a18');
            for (let j = 0; j < b.h - 1; j += 5) c.fr(b.x + 1, top + j, b.w - 2, 2, '#b08a54');
            c.fr(b.x + 4, top + 3, 9, 7, '#e8e6e0'); c.fr(b.x + 4, top + 3, 9, 1, '#ffffff');                   // sacola
            c.fr(b.x + 15, top + 6, 6, 4, '#f0f0f4'); c.fr(b.x + 15, top + 9, 6, 1, '#8a8a8e');                 // tênis
        }
        // ----- Balde azul pegando a goteira (anel d'água)
        { const b = base(F.bucket), cx = b.x + (b.w >> 1), cy = b.y + (b.h >> 1); shadow(b); c.disk(cx, cy, 5, '#2a5ea8'); c.disk(cx, cy, 4, '#3a78c4'); c.disk(cx, cy, 3, '#5a8fb8'); c.ring(cx, cy, 2, '#9cc4e0'); c.px(cx, cy - 9, '#9cc4e0'); c.px(cx, cy - 6, '#9cc4e0'); }
        // ----- Varal improvisado: um fio de parede a parede com uma toalha e uma camiseta
        {
            const ya = y0w + 10, xa = floorX0 + 2, xb = floorX1 - 2;
            for (let x = xa; x <= xb; x++) c.px(x, ya + Math.round(Math.sin((x - xa) / (xb - xa) * Math.PI) * 6), '#1a1410');
            const sag = (x) => ya + Math.round(Math.sin((x - xa) / (xb - xa) * Math.PI) * 6);
            c.fr(X(3.0), sag(X(3.0)), 14, 18, '#d9453a'); c.fr(X(3.0), sag(X(3.0)), 14, 1, '#f08070');
            c.fr(X(6.0), sag(X(6.0)), 12, 14, '#e8e4d8'); c.fr(X(6.0), sag(X(6.0)), 12, 1, '#ffffff');
        }

        // ------------------------------------------------------------ LUZ: lâmpada pelada pendurada num fio de gambiarra
        const bulbX = X(4.6), bulbY = Y(4.6);
        for (let y = y0w + 2; y < bulbY - 6; y++) c.px(bulbX, y, '#1a1410');
        for (let i = 0; i <= 40; i++) { const t = i / 40; c.px(Math.round(floorX0 + (bulbX - floorX0) * t), Math.round(y0w + 3 + Math.sin(t * Math.PI) * 8), '#1a1410'); }
        c.fr(bulbX - 2, bulbY - 7, 5, 3, '#2a2420'); c.disk(bulbX, bulbY - 1, 3, '#fff0b0'); c.px(bulbX, bulbY - 1, '#ffffff'); c.ring(bulbX, bulbY - 1, 4, '#e0b050');
        // poça de luz amarela fraca e cantos bem escuros
        for (let y = 0; y < HPX; y++) for (let x = 0; x < WPX; x++) {
            const k = (y * WPX + x) * 4; if (c.data[k + 3] === 0) continue;
            const d = hypot((x - bulbX) / 95, (y - bulbY - 12) / 80), g = Math.max(0, 1 - d), gl = g * g * 0.2;
            const vg = hypot((x - WPX / 2) / (WPX * 0.6), (y - HPX * 0.55) / (HPX * 0.68)), v = Math.max(0, vg - 0.5) * 0.45;
            c.data[k] = Math.max(0, Math.min(255, c.data[k] * (1 + gl * 1.2 - v) + gl * 36));
            c.data[k + 1] = Math.max(0, Math.min(255, c.data[k + 1] * (1 + gl * 0.9 - v) + gl * 22));
            c.data[k + 2] = Math.max(0, Math.min(255, c.data[k + 2] * (1 + gl * 0.2 - v) + gl * 4));
        }
        return { canvas: c, in: IN, bulb: { x: 4.6, z: 4.6 } };
    },
};
