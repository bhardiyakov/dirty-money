// ============================================================================
// HouseArt — a arte (pixel art desenhada por código) da safe house do protagonista (ver map/SafeHouse.js e world/HouseView.js):
//   • interior()  o "corte" da casa visto de cima/em obliquo: piso, paredes, móveis e objetos, TUDO num quadro só (480×370 px,
//                 20 px/u como o resto do jogo). Os móveis mostram o topo e a frente (como na arte de referência), as paredes
//                 do fundo mostram a face interna e as da frente ficam baixas (corte de casa de bonecas).
//   • texturas de fora: tijolo, zinco, tábua, telhado, porta, vidro das janelas e a seta que marca a entrada.
// Coordenadas LOCAIS da casa (x → leste, z → norte; origem no canto sudoeste externo). O quadro do interior cobre IN.
// ============================================================================

const HouseArt = {
    PPU: Config.art.ppu,
    K: 0.22,                                             // quanto 1 u de altura "sobe" na tela (corte oblíquo)
    IN: { x0: -0.4, z0: -0.8, x1: 23.4, z1: 17.7 },      // retângulo local coberto pelo quadro do interior

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
        const W = 480, Hh = 320, c = this._P(W, Hh), rng = Pixel.rng(2718);
        const ramp = ['#838a8f', '#9aa2a7', '#b4bbc0', '#c6cdd1', '#aeb5ba', '#8e969b'];
        for (let x = 0; x < W; x++) for (let y = 0; y < Hh; y++) c.px(x, y, ramp[(x + Math.floor(y / 80)) % 6]);
        for (let s = 0; s * 40 < W; s++) c.fr(s * 40, 0, 1, Hh, '#5a6166');                 // emendas das chapas (2 m)
        for (let k = 0; k < 60; k++) {                                                      // ferrugem escorrida
            const x = Math.floor(rng() * W), y = Math.floor(rng() * Hh), len = 8 + Math.floor(rng() * 40);
            for (let j = 0; j < len; j++) c.px(x, Math.min(Hh - 1, y + j), j % 6 === 5 ? '#8a5a38' : '#a86a3e');
        }
        for (let n = 0; n < 40; n++) {                                                      // remendos de chapa
            const x = Math.floor(rng() * (W - 30)), y = Math.floor(rng() * (Hh - 20));
            if (n % 8 === 0) { c.box(x, y, 22, 14, '#b4bcc0', '#d6dcdf', '#7a8286', '#4a5156'); }
        }
        // vigas de madeira cruzando (ripas) a cada 4 m
        for (const y of [60, 140, 220, 290]) { c.fr(0, y, W, 4, '#6a4e34'); c.fr(0, y, W, 1, '#8a6a44'); c.fr(0, y + 3, W, 1, '#3a2a1c'); }
        // pneus e pedras prendendo as chapas
        const tire = (cx, cy) => { c.disk(cx, cy, 11, '#15161a'); c.disk(cx, cy, 6, '#2a2c32'); c.disk(cx, cy, 3, '#0c0d10'); c.ring(cx, cy, 10, '#3a3d46'); c.px(cx - 6, cy - 7, '#4a4d58'); c.px(cx - 5, cy - 8, '#4a4d58'); };
        const rock = (cx, cy, r) => { c.disk(cx, cy, r, '#6f6b63'); c.disk(cx - 1, cy - 1, Math.max(2, r - 3), '#8a857a'); c.px(cx - r / 2, cy - r / 2, '#b0aa9c'); };
        for (const [x, y] of [[40, 40], [210, 38], [440, 40], [70, 190], [260, 180], [380, 270], [40, 290]]) tire(x, y);
        for (const [x, y] of [[120, 120], [330, 100], [180, 270], [450, 180], [300, 40], [410, 130]]) rock(x, y, 5 + Math.floor(rng() * 3));
        // caixa-d'água (azul) no canto nordeste
        const tx = 390, ty = 78;
        c.disk(tx + 5, ty + 6, 36, '#10202c');                                              // sombra
        c.disk(tx, ty, 34, '#1f4f8a'); c.disk(tx, ty, 32, '#2a63ac'); c.disk(tx - 3, ty - 3, 26, '#3a78c4'); c.disk(tx - 6, ty - 6, 16, '#5a98dc');
        c.ring(tx, ty, 33, '#16365e'); c.ring(tx, ty, 20, '#2a5e9e'); c.disk(tx + 8, ty + 6, 6, '#16365e'); c.disk(tx + 8, ty + 6, 4, '#1f4f8a');
        c.ln(tx - 20, ty - 12, tx - 12, ty - 22, '#9cc4f0'); c.ln(tx - 18, ty - 8, tx - 10, ty - 18, '#7eaee6');
        // antena de TV + parabólica
        c.ln(60, 100, 60, 130, '#2a2c32'); c.ln(52, 108, 68, 108, '#2a2c32'); c.ln(54, 114, 66, 114, '#2a2c32'); c.ln(56, 120, 64, 120, '#2a2c32');
        c.disk(300, 240, 12, '#d6dadf'); c.disk(300, 240, 9, '#aab0b8'); c.disk(297, 237, 4, '#e8ecf0'); c.ln(300, 240, 308, 250, '#2a2c32'); c.disk(308, 250, 2, '#e0a020');
        // fios / gato e roupa no varal
        c.ln(10, 300, 200, 270, '#1a1a1e'); c.ln(200, 270, 330, 300, '#1a1a1e');
        for (let i = 0; i < 4; i++) { const x = 230 + i * 22; c.fr(x, 270 + (i % 2), 14, 16, ['#e8e0c8', '#d9453a', '#3a6fc4', '#f0c040'][i]); c.fr(x, 270 + (i % 2), 14, 1, '#ffffff'); }
        // contorno do telhado
        c.fr(0, 0, W, 3, '#5a4a3a'); c.fr(0, Hh - 3, W, 3, '#3a2e22'); c.fr(0, 0, 3, Hh, '#5a4a3a'); c.fr(W - 3, 0, 3, Hh, '#3a2e22');
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
        const T = S.T, W = S.W, D = S.D, PX = S.PX, PT = S.PT, H = S.H;
        const hpx = (h) => Math.round(h * K * PPU);
        const hex = Pixel.hex;
        const F = {}; for (const f of S.furniture) F[f.kind] = f;

        const floorX0 = X(T), floorX1 = X(W - T), floorY0 = Y(D - T), floorY1 = Y(T);        // piso (px): y0 = norte
        const partX0 = X(PX), partX1 = X(PX + PT);

        // ------------------------------------------------------------ PISO
        // Quarto/sala (oeste): tábuas de madeira velha; cozinha (leste): lajota de cimento queimado.
        const plankCols = ['#8b6a43', '#9a7549', '#7e5f3b', '#a37f52', '#86653f'];
        for (let y = floorY0; y < floorY1; y += 9) {
            const row = Math.floor((y - floorY0) / 9);
            let x = floorX0 - Math.floor(rng() * 30);
            while (x < partX1) {
                const len = 34 + Math.floor(rng() * 64), col = plankCols[Math.floor(rng() * plankCols.length)];
                const x0 = Math.max(x, floorX0), x1 = Math.min(x + len, partX1);
                if (x1 > x0) {
                    c.fr(x0, y, x1 - x0, 8, col);
                    c.fr(x0, y, x1 - x0, 1, this._tint(col, 1.14));
                    for (let n = 0; n < (x1 - x0) / 10; n++) c.fr(x0 + Math.floor(rng() * (x1 - x0)), y + 2 + Math.floor(rng() * 5), 2 + Math.floor(rng() * 6), 1, this._tint(col, 0.86));
                    c.px(x0 + 2, y + 3, '#4a3620'); c.px(x1 - 3, y + 4, '#4a3620');            // pregos
                    c.fr(x1 - 1, y, 1, 9, '#4e3a24');                                          // junta
                }
                x += len;
            }
            c.fr(floorX0, y + 8, partX1 - floorX0, 1, '#4e3a24');
        }
        const tile = 48;                                                                       // cozinha: placas de 2,4 u rachadas
        for (let y = floorY0; y < floorY1; y += 1) for (let x = partX1; x < floorX1; x += 1) {
            const tx = Math.floor((x - partX1) / tile), ty = Math.floor((y - floorY0) / tile);
            const base = [[138, 133, 120], [148, 143, 130], [132, 127, 115], [143, 138, 124]][(tx * 3 + ty * 5) % 4];
            const g = (Pixel.hash(x, y, 31) - 0.5) * 14;
            c.px(x, y, [base[0] + g, base[1] + g, base[2] + g]);
        }
        for (let tx = partX1; tx < floorX1; tx += tile) c.fr(tx, floorY0, 1, floorY1 - floorY0, '#5f5a4e');
        for (let ty = floorY0; ty < floorY1; ty += tile) c.fr(partX1, ty, floorX1 - partX1, 1, '#5f5a4e');
        const crack = (x, y, n, seed) => { const r = Pixel.rng(seed); let cx = x, cy = y; for (let i = 0; i < n; i++) { c.px(cx, cy, '#403c33'); c.px(cx + 1, cy, '#6a655a', 150); cx += Math.floor(r() * 3) - 1 + (r() < 0.4 ? 1 : 0); cy += r() < 0.7 ? 1 : 0; } };
        for (const [x, y, n, s] of [[partX1 + 40, floorY0 + 10, 50, 1], [partX1 + 100, floorY0 + 60, 70, 2], [partX1 + 20, floorY0 + 170, 40, 3], [partX1 + 120, floorY0 + 190, 55, 4]]) crack(x, y, n, s);

        // Remendos de concreto sobre as tábuas (manchas irregulares por ruído) — como na referência.
        const patch = (cx, cy, rx, ry, seed) => {
            for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
                if (x < floorX0 || x >= partX0 || y < floorY0 || y >= floorY1) continue;
                const d = Math.hypot((x - cx) / rx, (y - cy) / ry), n = Pixel.noise(x, y, 7, seed, 99, 99);
                if (d + (n - 0.5) * 0.7 > 1) continue;
                const edge = d + (n - 0.5) * 0.7 > 0.88;
                const g = (Pixel.hash(x, y, seed) - 0.5) * 16;
                c.px(x, y, edge ? [112 + g, 104 + g, 90 + g] : [148 + g, 140 + g, 124 + g]);
            }
        };
        patch(X(8.0), Y(10.6), 70, 36, 11); patch(X(9.2), Y(3.2), 62, 34, 12); patch(X(3.6), Y(9.4), 34, 24, 13);
        // Manchas escuras (óleo/umidade) e pegadas
        const stain = (cx, cy, r, col, a, seed) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = Math.hypot(x, y) / r, n = Pixel.noise(cx + x, cy + y, 5, seed, 99, 99); if (d + (n - 0.5) * 0.8 < 1) c.bl(cx + x, cy + y, 1, 1, col, a); } };
        stain(X(11.8), Y(6.6), 14, '#1c1a16', 0.28, 21); stain(X(6.0), Y(7.4), 10, '#2a1c10', 0.22, 22); stain(X(18.4), Y(9.6), 12, '#2a2418', 0.3, 23); stain(X(20.8), Y(3.8), 9, '#5a2a18', 0.2, 24);
        // Papelão e tecido largados no chão (detalhe de gente pobre)
        c.fr(X(10.6), Y(5.2), 26, 14, '#a8824e'); c.fr(X(10.6), Y(5.2), 26, 1, '#c4a066'); c.fr(X(10.6), Y(5.2) + 13, 26, 1, '#7a5a30'); c.ln(X(10.6) + 4, Y(5.2) + 5, X(10.6) + 22, Y(5.2) + 5, '#8c6a3a');

        // ------------------------------------------------------------ SOMBRA DE OCLUSÃO nas bordas do piso
        const ao = (x, y, w, h, a) => c.bl(x, y, w, h, [10, 6, 4], a);
        for (let i = 0; i < 9; i++) {                                                          // encostos: mais escuro junto à parede
            const a = 0.34 * (1 - i / 9);
            ao(floorX0, floorY0 + i, floorX1 - floorX0, 1, a);                                 // norte
            ao(floorX0 + i, floorY0, 1, floorY1 - floorY0, a * 0.8);                           // oeste
            ao(floorX1 - 1 - i, floorY0, 1, floorY1 - floorY0, a * 0.8);                       // leste
            ao(partX0 - 1 - i, floorY0, 1, floorY1 - floorY0, a * 0.7);                        // lado oeste da divisória
            ao(partX1 + i, floorY0, 1, floorY1 - floorY0, a * 0.7);                            // lado leste
        }

        // ------------------------------------------------------------ PAREDES
        const northY = Y(D - T), faceH = hpx(H);                                               // base da parede norte (px) e altura da face
        const capH = Math.round(T * PPU);
        const wallFace = (x0px, x1px, kind) => {                                               // face interna da parede norte
            const y0 = northY - faceH, w = x1px - x0px;
            if (kind === 'zinc') {
                const ramp = ['#7c8387', '#939a9f', '#adb4b8', '#bec5c9', '#a5acb0', '#889095'];
                for (let y = 0; y < faceH; y++) for (let x = 0; x < w; x++) c.px(x0px + x, y0 + y, ramp[(x + 1) % 6]);
                for (let s = 0; s * 36 < w; s++) c.fr(x0px + s * 36, y0, 1, faceH, '#555c61');
                for (let k = 0; k < 9; k++) { const rx = x0px + Math.floor(rng() * w), ry = y0 + Math.floor(rng() * faceH * 0.6), len = 5 + Math.floor(rng() * 16); for (let j = 0; j < len; j++) c.px(rx, ry + j, j % 4 === 3 ? '#8a5a38' : '#a86a3e'); }
                c.fr(x0px, y0 + faceH - 6, w, 6, '#4e3d2a'); c.fr(x0px, y0 + faceH - 6, w, 1, '#7a6040');       // rodapé de madeira
            } else {
                const cols = ['#a4513a', '#b25e41', '#97452f', '#b96a48'];
                c.fr(x0px, y0, w, faceH, '#6a4636');
                for (let r = 0; r * 7 < faceH; r++) for (let b = -1; b * 14 < w; b++) {
                    const x = x0px + b * 14 + (r % 2) * 7, col = cols[Math.floor(rng() * 4)];
                    for (let j = 1; j < 6; j++) for (let i = 1; i < 14; i++) { const X2 = x + i, Y2 = y0 + r * 7 + j; if (X2 >= x0px && X2 < x1px && Y2 < y0 + faceH) c.px(X2, Y2, j === 1 ? this._tint(col, 1.16) : (j === 5 ? this._tint(col, 0.8) : col)); }
                }
                for (const [pxx, pw] of [[14, 40], [70, 26]]) for (let j = 0; j < Math.min(faceH - 6, 28); j++) for (let i = 0; i < pw; i++) {             // reboco soltando
                    if (Pixel.hash(pxx + i, j, 8) < 0.12 + (Math.min(j, pw - i) < 2 ? 0.5 : 0)) continue;
                    c.px(x0px + pxx + i, y0 + 8 + j, Pixel.hash(i, j, 3) < 0.08 ? '#b9a98c' : '#c9b99c');
                }
            }
            this._grain(c, x0px, y0, w, faceH, 6, 17);
            c.bl(x0px, y0, w, 5, [10, 6, 4], 0.35);                                           // topo escurecido (teto)
            c.bl(x0px, northY - 7, w, 7, [10, 6, 4], 0.28);                                    // pé da parede (oclusão)
        };
        wallFace(floorX0, partX0, 'zinc');
        wallFace(partX1, floorX1, 'brick');
        // a divisória encontra a parede norte: pilar de madeira
        c.fr(partX0, northY - faceH, partX1 - partX0, faceH, '#6a4e34'); c.fr(partX0, northY - faceH, 1, faceH, '#8a6a44');

        // Janelas na parede norte (peitoril 1,0 u): moldura, vidro e luz do dia
        const winN = (a, b, curtain) => {
            const x0 = X(a), x1 = X(b), yb = northY - hpx(1.0), yt = northY - hpx(2.1);
            c.fr(x0 - 2, yt - 2, x1 - x0 + 4, yb - yt + 4, '#3a2a1c');
            c.fr(x0, yt, x1 - x0, yb - yt, '#27425e');
            for (let i = 0; i < x1 - x0; i++) for (let j = 0; j < yb - yt; j++) if (((i + j) % 14) < 3) c.px(x0 + i, yt + j, '#3f6a96');
            c.fr((x0 + x1) / 2 | 0, yt, 2, yb - yt, '#3a2a1c'); c.fr(x0, (yt + yb) / 2 | 0, x1 - x0, 2, '#3a2a1c');
            c.fr(x0 - 2, yb + 1, x1 - x0 + 4, 3, '#7a5a3a');                                    // peitoril
            if (curtain) { c.fr(x0, yt, 12, yb - yt - 4, '#c4705a'); for (let k = 0; k < 4; k++) c.fr(x0 + 2 + k * 3, yt, 1, yb - yt - 4, '#9a4a3a'); c.fr(x0, yt, 12, 1, '#e08a72'); }
        };
        winN(S.windows[1].a, S.windows[1].b, true);
        winN(S.windows[2].a, S.windows[2].b, false);

        // Tampa (cap) da parede norte e das laterais; cada cap é "levantado" pela altura da parede naquele ponto.
        const capCol = '#7b7568', capHi = '#a39c8c', capLo = '#4e493f';
        const capRow = (y, x0, x1, col = capCol) => { c.fr(x0, y, x1 - x0, 1, col); };
        // norte: fita contínua
        for (let j = 0; j < capH; j++) capRow(northY - faceH - capH + j, X(0), X(W), j === 0 ? capHi : (j === capH - 1 ? capLo : capCol));
        this._grain(c, X(0), northY - faceH - capH, X(W) - X(0), capH, 7, 4);
        // laterais (oeste e leste) e divisória: fita inclinada, mais alta ao norte e baixa ao sul
        const slantH = (z) => 0.5 + (H - 0.5) * Math.pow(Math.max(0, Math.min(1, (z - 0.4) / (D - T - 0.4))), 0.8);
        const ribbon = (xa, xb, z0, z1, col, hiCol, loCol, hFn) => {
            for (let z = z0; z <= z1; z += 0.05) {
                const y = Y(z) - hpx(hFn(z));
                for (let x = xa; x < xb; x++) c.px(x, y, x === xa ? hiCol : (x === xb - 1 ? loCol : col));
                c.px(xa, y, hiCol);
            }
        };
        const ribbonFill = (xa, xb, z0, z1, col, hiCol, loCol, hFn) => {                      // preenche também o espaço vertical entre pontos consecutivos
            let prev = null;
            for (let z = z0; z <= z1; z += 0.04) {
                const y = Y(z) - hpx(hFn(z));
                if (prev !== null && y < prev) for (let yy = y; yy <= prev; yy++) for (let x = xa; x < xb; x++) c.px(x, yy, x === xa ? hiCol : (x === xb - 1 ? loCol : col));
                for (let x = xa; x < xb; x++) c.px(x, y, x === xa ? hiCol : (x === xb - 1 ? loCol : col));
                prev = y;
            }
        };
        // face interna das paredes laterais (quase de perfil): tira escura junto ao piso, com ripas
        const sideFace = (xa, w) => { for (let z = T; z < D - T; z += 0.05) { const yb = Y(z), h = Math.max(2, Math.round(hpx(slantH(z)) * 0.18)); for (let k = 0; k < h; k++) for (let i = 0; i < w; i++) c.px(xa + i, yb - k, this._tint('#6a5238', 0.7 + 0.3 * (k / h))); } };
        sideFace(floorX0, 6); sideFace(floorX1 - 6, 6);
        ribbonFill(X(0), X(T), 0, D, '#72593a', '#a07c4e', '#4a3822', slantH);
        ribbonFill(X(W - T), X(W), 0, D, '#72593a', '#a07c4e', '#4a3822', slantH);
        // divisória: tábuas verdes (mesma cor da parede externa do quarto), cortada ao meio no vão
        const partH = (z) => 0.6 + (2.6 - 0.6) * Math.pow(Math.max(0, Math.min(1, (z - 0.4) / (D - T - 0.4))), 1.1);
        const gz0 = S.gapZ[0], gz1 = S.gapZ[1];
        for (const [za, zb] of [[T, gz0], [gz1, D - T]]) {
            ribbonFill(partX0, partX1, za, zb, '#6d8a82', '#9ec0b4', '#3e5a52', partH);
            for (let z = za; z < zb; z += 0.05) {                                               // faces laterais (perfil) com ripas
                const yb = Y(z), h = Math.max(3, Math.round(hpx(partH(z)) * 0.2));
                for (let k = 0; k < h; k++) { c.px(partX0 - 1, yb - k, '#47625a'); c.px(partX1, yb - k, '#47625a'); c.px(partX0 - 2, yb - k, '#55756c', 160); c.px(partX1 + 1, yb - k, '#55756c', 160); }
            }
        }
        // pé da divisória (extremidade sul): face de topo
        { const yb = Y(T), h = hpx(partH(T)); c.fr(partX0, yb - h, partX1 - partX0, h, '#58796f'); c.fr(partX0, yb - h, partX1 - partX0, 1, '#9ec0b4'); c.fr(partX0, yb - 1, partX1 - partX0, 1, '#2e443d'); }
        // vão da divisória: batentes de madeira
        { const ya = Y(gz1), yb = Y(gz0); c.fr(partX0 - 1, ya - 2, partX1 - partX0 + 2, 3, '#4a3624'); c.fr(partX0 - 1, yb - 1, partX1 - partX0 + 2, 3, '#4a3624'); }

        // Parede sul (frente): baixa. Face externa + cap, com o vão da porta e o vidro da janela.
        const southY = Y(0), sH = hpx(0.5);
        const sCap = (xa, xb) => {
            for (let j = 0; j < sH; j++) c.fr(xa, southY - j, xb - xa, 1, this._tint('#8a5a3c', 0.78 + 0.22 * (j / sH)));
            for (let j = 0; j < capH; j++) c.fr(xa, southY - sH - j, xb - xa, 1, j === capH - 1 ? capHi : (j === 0 ? capLo : capCol));
            this._grain(c, xa, southY - sH - capH, xb - xa, sH + capH, 6, 8);
        };
        const dx0 = X(S.door.x0), dx1 = X(S.door.x1);
        sCap(X(0), dx0); sCap(dx1, X(W));
        // janela da frente: vidro azul escuro na tampa (aparece como uma tira brilhante)
        { const a = X(S.windows[0].a), b = X(S.windows[0].b); c.fr(a, southY - sH - capH + 2, b - a, capH - 3, '#2a4d72'); c.ln(a + 3, southY - sH - 3, a + 14, southY - sH - capH + 3, '#6a9ac8'); }
        // soleira da porta: capacho e luz do dia entrando
        { const mx = dx0 + 2, my = southY - 22, mw = dx1 - dx0 - 4, mh = 18;
          c.bl(dx0, southY - 40, dx1 - dx0, 40, [255, 236, 170], 0.18);                         // luz do dia entrando
          c.fr(mx, my, mw, mh, '#5a3a22'); for (let i = 0; i < mw; i += 4) c.fr(mx + i, my, 2, mh, '#7a5230'); c.fr(mx, my, mw, 1, '#a07848'); c.fr(mx, my + mh - 1, mw, 1, '#2e1c10');
          for (let i = 0; i < 9; i++) c.px(mx + 3 + Math.floor(rng() * (mw - 6)), my + 2 + Math.floor(rng() * (mh - 4)), '#caa070'); }
        // batentes da porta (postes de madeira com altura de corte)
        for (const dx of [dx0 - 3, dx1]) { c.fr(dx, southY - sH - capH, 3, sH + capH, '#4a3624'); c.fr(dx, southY - sH - capH, 3, 1, '#8a6a44'); }

        // ------------------------------------------------------------ MÓVEIS
        // base (px) de um móvel + sombra projetada no piso (luz do noroeste → sombra para sudeste)
        const base = (f) => ({ x: X(f.x0), y: Y(f.z1), w: X(f.x1) - X(f.x0), h: Y(f.z0) - Y(f.z1), hp: hpx(f.h) });
        const shadow = (b, extra = 0) => {
            c.bl(b.x + 4, b.y + 3, b.w + 3 + extra, b.h + 1, [8, 5, 3], 0.32);
            c.bl(b.x + 7, b.y + 6, b.w + 1 + extra, b.h - 2, [8, 5, 3], 0.18);
        };

        // ----- Estante (norte, oeste): 3 tábuas com caixas, latas e velas
        {
            const f = F.shelf, b = base(f), top = b.y - b.hp, fh = b.hp + b.h;                 // face frontal de cima a baixo
            shadow(b);
            // montantes e fundo (sombra escura) — a face frontal começa onde o topo termina
            c.fr(b.x, top, b.w, b.hp + b.h, '#3a2a1a');
            const wood = '#8a6238', woodHi = '#b08650', woodLo = '#4e361f';
            const boards = [top + 1, top + Math.round(fh * 0.36), top + Math.round(fh * 0.70)];        // tábuas (y)
            // tábua de topo (superfície vista de cima/frente)
            c.box(b.x, top, b.w, 7, wood, woodHi, woodLo, '#2a1c10');
            c.box(b.x, boards[1], b.w, 6, wood, woodHi, woodLo, '#2a1c10');
            c.box(b.x, boards[2], b.w, 6, wood, woodHi, woodLo, '#2a1c10');
            c.box(b.x, top + fh - 5, b.w, 5, wood, woodHi, woodLo, '#2a1c10');
            // montantes laterais
            for (const px of [b.x, b.x + b.w - 5, b.x + (b.w / 2 | 0) - 2]) { c.box(px, top, 5, fh, '#7a5430', '#a07848', '#4a3220', '#2a1c10'); }
            const can = (x, y, col, h = 9) => { c.box(x, y - h, 7, h, col, this._tint(col, 1.3), this._tint(col, 0.7), '#201810'); c.fr(x + 1, y - h + 2, 5, 1, '#e8e4d8'); c.fr(x + 1, y - 3, 5, 1, this._tint(col, 0.55)); c.fr(x, y - h, 7, 2, '#c8ccd0'); };
            const cb = (x, y, w, h) => { c.box(x, y - h, w, h, '#b88a54', '#d4a870', '#7a5830', '#3a2810'); c.fr(x + (w / 2 | 0) - 1, y - h, 3, h, '#d8c08a'); c.fr(x + 1, y - h + 2, w - 2, 1, '#8a6238'); };
            // prateleira 1 (cima): caixas grandes
            cb(b.x + 8, boards[1], 22, 17); cb(b.x + 32, boards[1], 17, 12); can(b.x + 56, boards[1], '#c0392b'); can(b.x + 64, boards[1], '#3f7a4a'); can(b.x + 72, boards[1], '#c8ccd0', 11);
            c.box(b.x + 86, boards[1] - 13, 9, 13, '#d9d2b0', '#fff8d8', '#9a9270', '#3a3420'); c.fr(b.x + 88, boards[1] - 9, 5, 3, '#c0392b');        // pote/jarra
            // vela acesa no canto
            c.fr(b.x + 102, boards[1] - 9, 4, 9, '#e8dcc0'); c.fr(b.x + 103, boards[1] - 12, 2, 3, '#ffd23a'); c.px(b.x + 103, boards[1] - 13, '#fff2a0');
            // prateleira 2 (meio): caixas e latas
            cb(b.x + 8, boards[2], 18, 13); can(b.x + 30, boards[2], '#e0902a'); can(b.x + 38, boards[2], '#c0392b'); can(b.x + 46, boards[2], '#3a6fc4');
            cb(b.x + 58, boards[2], 24, 14); cb(b.x + 84, boards[2], 14, 9); can(b.x + 102, boards[2], '#7a8a4a', 8);
            // em cima da estante: caixa de papelão e um balde
            cb(b.x + 12, top, 26, 12); c.box(b.x + 80, top - 11, 12, 11, '#3a6fc4', '#6a9ae0', '#24497e', '#142a4a'); c.fr(b.x + 80, top - 11, 12, 2, '#1d3a66');
            // pano pendurado
            c.fr(b.x + 98, top + 8, 10, 20, '#d9453a'); c.fr(b.x + 98, top + 8, 10, 1, '#f08070'); for (let i = 0; i < 4; i++) c.px(b.x + 100 + i * 2, top + 12 + i * 3, '#8a2a20');
        }

        // ----- Pilha de caixas de papelão (norte)
        {
            const f = F.boxes, b = base(f);
            shadow(b);
            const bx = (x, y, w, h, tape) => { c.box(x, y, w, h, '#b58652', '#d6a870', '#7a5830', '#3a2810'); c.fr(x + (w / 2 | 0) - 1, y, 3, h, '#dcc590'); if (tape) c.fr(x + 2, y + h - 5, w - 4, 1, '#8a6238'); };
            bx(b.x, b.y - b.hp + 4, b.w, b.h + b.hp - 4, true);
            bx(b.x + 3, b.y - b.hp - 14, b.w - 7, 17, false);
            c.px(b.x + 8, b.y - b.hp - 8, '#3a2810'); c.fr(b.x + 6, b.y - b.hp - 9, 6, 1, '#9a2a20');
        }

        // ----- Mesinha de cabeceira: rádio, vela e caneca
        {
            const f = F.stand, b = base(f);
            shadow(b);
            c.box(b.x, b.y + b.h - b.hp + 4, b.w, b.hp, '#6a4a2a', '#8a6238', '#3e2a16', '#201408');       // frente
            c.fr(b.x + 4, b.y + b.h - b.hp + 8, b.w - 8, b.hp - 9, '#503820'); c.fr(b.x + 14, b.y + b.h - b.hp + 12, 8, 2, '#c8a860');   // gaveta
            c.box(b.x, b.y - b.hp + 2, b.w, b.h + 2, '#8a6238', '#c49a62', '#5a3c20', '#2a1c10');             // tampo
            // rádio
            const rx = b.x + 3, ry = b.y - b.hp + 5;
            c.box(rx, ry, 20, 15, '#2a3a2e', '#4a6a52', '#16221a', '#0a120c'); c.fr(rx + 2, ry + 2, 8, 6, '#c8c090'); c.fr(rx + 2, ry + 2, 8, 1, '#e8e0b0');
            for (let i = 0; i < 4; i++) c.fr(rx + 12, ry + 3 + i * 2, 6, 1, '#0a120c'); c.disk(rx + 15, ry + 11, 2, '#8a9a8a'); c.px(rx + 4, ry + 5, '#c0392b');
            c.ln(rx + 16, ry, rx + 25, ry - 9, '#c8ccd0');                                                    // antena
            // vela + pires
            const vx = b.x + 26, vy = b.y - b.hp + 12;
            c.disk(vx, vy + 3, 4, '#c8ccd0'); c.fr(vx - 2, vy - 5, 5, 8, '#e8dcc0'); c.fr(vx - 2, vy - 5, 5, 1, '#fff6d8'); c.fr(vx - 1, vy - 8, 3, 3, '#ffd23a'); c.px(vx, vy - 9, '#fff6c0'); c.px(vx, vy - 7, '#ff8a2a');
            // caneca
            const mx = b.x + 4, my = b.y - b.hp + 22;
            c.disk(mx + 4, my + 4, 5, '#e8e8e4'); c.disk(mx + 4, my + 4, 3, '#6a3a1a'); c.ring(mx + 4, my + 4, 5, '#9a9a96'); c.fr(mx + 9, my + 2, 3, 4, '#e8e8e4');
        }

        // ----- Cama: estrado de madeira, lençol bege, cobertor de lã listrado e dois travesseiros
        {
            const f = F.bed, b = base(f);
            shadow(b, 3);
            const topY = b.y - b.hp, fh = b.h + b.hp;
            // estrado/pés (face frontal sul)
            c.box(b.x, b.y + b.h - b.hp - 2, b.w, b.hp + 2, '#6a4a2a', '#8a6238', '#3e2a16', '#201408');
            for (let i = 4; i < b.w - 4; i += 9) c.fr(b.x + i, b.y + b.h - b.hp + 3, 1, b.hp - 5, '#47301a');
            // cabeceira (oeste): painel de tábuas mais alto
            c.box(b.x - 3, topY - 8, 7, b.h + 10, '#5a3e22', '#8a6238', '#33220f', '#1a1008');
            for (let j = 0; j < b.h + 8; j += 6) c.fr(b.x - 2, topY - 6 + j, 5, 1, '#33220f');
            // colchão (topo)
            c.box(b.x + 3, topY, b.w - 3, b.h, '#cdbf9f', '#ece2c4', '#9a8c6c', '#3a3020');
            // travesseiros
            for (const dz of [5, 33]) { c.box(b.x + 5, topY + dz, 24, 26, '#ece8dc', '#ffffff', '#b4ac98', '#4a4436'); c.ln(b.x + 8, topY + dz + 8, b.x + 24, topY + dz + 8, '#cfc8b6'); c.ln(b.x + 8, topY + dz + 14, b.x + 22, topY + dz + 14, '#d8d2c2'); c.px(b.x + 9, topY + dz + 19, '#b4ac98'); }
            // cobertor (cobre do meio ao pé), com listras e dobra
            const cx0 = b.x + 34, cw = b.w - 34 - 1;
            c.fr(cx0, topY + 1, cw, b.h - 2, '#7a6a48');
            for (let i = 0; i < cw; i += 8) c.fr(cx0 + i, topY + 1, 4, b.h - 2, i % 16 ? '#6a5c3c' : '#8a7a54');
            for (let j = 6; j < b.h - 2; j += 15) c.fr(cx0, topY + j, cw, 2, '#c0392b');
            c.fr(cx0 - 3, topY + 1, 4, b.h - 2, '#5a4c32'); c.fr(cx0 - 3, topY + 1, 1, b.h - 2, '#9a8a64');                                    // dobra
            c.ln(cx0 + 10, topY + 2, cx0 + 24, topY + b.h - 4, '#5a4c32'); c.ln(cx0 + 40, topY + b.h - 4, cx0 + 56, topY + 4, '#948460');       // vincos
            c.fr(cx0, topY + 1, cw, 1, '#a89870'); c.fr(cx0, topY + b.h - 2, cw, 1, '#4a3e28');
            // ponta caída do cobertor na frente
            c.fr(cx0 + 4, b.y + b.h - 2, cw - 8, 3, '#6a5c3c');
        }

        // ----- TV de tubo sobre o banco de madeira
        {
            const f = F.tv, b = base(f);
            shadow(b, 2);
            const fy = b.y + b.h - b.hp;
            // banco: tampo + pernas em X
            c.box(b.x, b.y - b.hp + 4, b.w, b.h - 6, '#8a6238', '#c49a62', '#5a3c20', '#2a1c10');
            c.box(b.x, fy - 3, b.w, 6, '#6a4a2a', '#8a6238', '#3e2a16', '#201408');
            for (const [lx, dir] of [[b.x + 4, 1], [b.x + b.w - 14, 1]]) { c.ln(lx, fy + 3, lx + 10, b.y + b.h, '#4a3220'); c.ln(lx + 10, fy + 3, lx, b.y + b.h, '#4a3220'); c.ln(lx + 1, fy + 3, lx + 11, b.y + b.h, '#5a4028'); }
            // televisão
            const tx = b.x + 8, ty = b.y - b.hp - 16, tw = b.w - 18, th = 31;
            c.box(tx, ty, tw, th, '#2a2c30', '#4a4e56', '#15171a', '#0a0b0d');
            c.fr(tx + 4, ty + 4, tw - 20, th - 10, '#16202a'); c.fr(tx + 5, ty + 5, tw - 22, th - 12, '#6a8ca0');                          // tela
            c.fr(tx + 5, ty + 5, tw - 22, 2, '#9ab8c8'); c.ln(tx + 8, ty + 10, tx + 20, ty + 7, '#b4ccd8'); c.ln(tx + 9, ty + 14, tx + 24, ty + 10, '#8aa8bc');
            c.fr(tx + 5, ty + th - 8, tw - 22, 1, '#46606e');
            c.disk(tx + tw - 8, ty + 8, 2, '#8a8e96'); c.disk(tx + tw - 8, ty + 15, 2, '#8a8e96'); c.fr(tx + tw - 13, ty + 21, 9, 1, '#0a0b0d'); c.fr(tx + tw - 13, ty + 24, 9, 1, '#0a0b0d');
            c.ln(tx + tw / 2 | 0, ty, tx + 6, ty - 14, '#c8ccd0'); c.ln(tx + tw / 2 | 0, ty, tx + tw - 4, ty - 12, '#c8ccd0');             // antena "orelha de coelho"
            c.disk(tx + 6, ty - 14, 1, '#e8ecf0'); c.disk(tx + tw - 4, ty - 12, 1, '#e8ecf0');
        }

        // ----- Fogão (cozinha, norte): tampo de aço com duas bocas e frente de armário
        {
            const f = F.stove, b = base(f);
            shadow(b);
            const topY = b.y - b.hp;
            c.box(b.x, b.y + b.h - b.hp - 1, b.w, b.hp + 1, '#d8dad6', '#ffffff', '#8c908c', '#30322e');
            c.fr(b.x + 5, b.y + b.h - b.hp + 3, b.w - 10, b.hp - 6, '#c0c2be');
            for (const kx of [b.x + 12, b.x + 24, b.x + 36, b.x + 48]) { c.disk(kx, b.y + b.h - b.hp + 1, 2, '#2a2c30'); c.px(kx, b.y + b.h - b.hp, '#d0d2d6'); }
            c.box(b.x, topY, b.w, b.h, '#9a9e9c', '#d6dad8', '#5a5e5c', '#202220');
            for (const bxx of [b.x + 14, b.x + 44]) { const by = topY + (b.h / 2 | 0) + 1; c.disk(bxx, by, 9, '#1a1c1e'); c.ring(bxx, by, 8, '#4a4e52'); c.disk(bxx, by, 4, '#2a2c30'); for (let a = 0; a < 6.28; a += 0.8) c.px(Math.round(bxx + Math.cos(a) * 6), Math.round(by + Math.sin(a) * 6), '#4aa8ff'); }
            // panela amassada em uma boca
            c.disk(b.x + 44, topY + (b.h / 2 | 0) - 2, 8, '#3a3e44'); c.disk(b.x + 44, topY + (b.h / 2 | 0) - 3, 6, '#5a5e66'); c.fr(b.x + 52, topY + (b.h / 2 | 0) - 5, 8, 2, '#2a2c30'); c.px(b.x + 40, topY + (b.h / 2 | 0) - 6, '#9a9ea6');
            // utensílios pendurados na parede (acima do fogão)
            const rail = northY - faceH + 20, rx = b.x + 4;
            c.fr(rx, rail, 58, 2, '#33302a');
            for (const [dx, h, col] of [[6, 18, '#b4b8bc'], [18, 22, '#8a8e92'], [30, 16, '#b4b8bc'], [44, 20, '#6a4a2a']]) { c.fr(rx + dx, rail + 2, 1, 3, '#33302a'); c.fr(rx + dx - 1, rail + 5, 3, h, col); c.fr(rx + dx - 2, rail + 5 + h - 3, 5, 5, col); }
        }

        // ----- Botijão de gás (P13) ao lado do fogão, com mangueira
        {
            const f = F.gas, b = base(f), cx = b.x + (b.w / 2 | 0), cy = b.y + (b.h / 2 | 0);
            c.bl(cx - 6, cy + 8, 18, 8, [8, 5, 3], 0.38);
            // corpo (cilindro visto de frente): gradiente horizontal
            const bw = 17, bh = b.hp + 6;
            for (let i = 0; i < bw; i++) { const k = 0.7 + 0.5 * Math.sin((i / (bw - 1)) * Math.PI * 0.95 + 0.25); for (let j = 0; j < bh; j++) c.px(cx - 8 + i, cy + 7 - j + 0, this._tint('#aab4b6', k * (j < 3 ? 0.78 : 1))); }
            c.fr(cx - 8, cy + 7 - bh + 7, bw, 8, '#d9702a'); c.fr(cx - 8, cy + 7 - bh + 7, bw, 1, '#f0a050'); c.fr(cx - 8, cy + 7 - bh + 14, bw, 1, '#8a4a18'); c.fr(cx - 4, cy + 7 - bh + 9, 8, 3, '#f2e4c0');
            c.ring(cx, cy + 7 - bh, 8, '#3a4244'); c.disk(cx, cy + 7 - bh, 7, '#8a9496'); c.disk(cx - 1, cy + 7 - bh - 1, 5, '#b4bec0'); c.disk(cx, cy + 7 - bh, 2, '#d9a020'); c.fr(cx - 1, cy + 7 - bh - 5, 3, 3, '#3a4244');       // topo + válvula
            c.fr(cx - 8, cy + 7 - 1, bw, 2, '#4a5254');                                                                                                                  // base
            c.ln(cx, cy + 7 - bh - 5, cx, cy + 7 - bh - 14, '#d9702a'); c.ln(cx, cy + 7 - bh - 14, cx + 4, cy + 7 - bh - 22, '#d9702a');                                 // mangueira laranja até o fogão
            c.ln(cx + 1, cy + 7 - bh - 5, cx + 1, cy + 7 - bh - 14, '#a84a14');
        }

        // ----- Bancada norte (cozinha) com garrafas, faca e tábua
        {
            const f = F.counter, b = base(f), topY = b.y - b.hp;
            shadow(b);
            c.box(b.x, b.y + b.h - b.hp - 1, b.w, b.hp + 1, '#7a6246', '#a28660', '#4a3a26', '#201a10');
            for (let i = b.w / 2 | 0; i < b.w; i += 0) { break; }
            c.fr(b.x + (b.w / 3 | 0), b.y + b.h - b.hp + 2, 1, b.hp - 3, '#33281a'); c.fr(b.x + 2 * (b.w / 3 | 0), b.y + b.h - b.hp + 2, 1, b.hp - 3, '#33281a');
            for (const kx of [b.x + 14, b.x + 14 + (b.w / 3 | 0)]) c.fr(kx, b.y + b.h - b.hp + 7, 4, 1, '#d8c890');
            c.box(b.x, topY, b.w, b.h, '#b8b4a8', '#e0dcce', '#7a766a', '#2a2820');
            for (let i = 0; i < b.w; i += 12) c.fr(b.x + i, topY + 1, 1, b.h - 2, '#9a968a');                      // azulejo/rejunte
            // tábua de cortar + faca
            c.box(b.x + 3, topY + 9, 20, 13, "#a8824e", "#c4a066", "#6a4a26", "#3a2810"); c.fr(b.x + 8, topY + 14, 8, 1, "#7a5830"); c.fr(b.x + 6, topY + 25, 14, 2, "#c8ccd0"); c.fr(b.x + 20, topY + 24, 4, 4, "#2a2c30");
            // garrafas
            const bot = (x, y, col, hi) => { c.box(x, y - 14, 8, 14, col, hi, this._tint(col, 0.6), '#101810'); c.fr(x + 2, y - 19, 4, 5, col); c.fr(x + 2, y - 20, 4, 1, '#e8e8e0'); c.fr(x + 1, y - 10, 6, 4, '#e8e0c0'); };
            bot(b.x + b.w - 20, topY + 34, "#3f9a52", "#7ad088"); bot(b.x + b.w - 10, topY + 34, "#8a4ab0", "#c08ae0");
        }

        // ----- Geladeira (norte, cozinha): duas portas, puxadores, ímãs e um bilhete
        {
            const f = F.fridge, b = base(f), topY = b.y - b.hp;
            shadow(b, 2);
            const fh = b.hp + 2;
            c.box(b.x, b.y + b.h - b.hp - 1, b.w, fh, '#d8dcd8', '#ffffff', '#8c928e', '#262a28');
            for (let j = 0; j < fh; j++) c.px(b.x + b.w - 3, b.y + b.h - b.hp - 1 + j, '#b4bab6');
            c.fr(b.x + 1, b.y + b.h - b.hp + 12, b.w - 2, 1, '#6f7672');                              // divisão freezer / geladeira
            c.fr(b.x + b.w - 8, b.y + b.h - b.hp + 3, 2, 6, '#7a807c'); c.fr(b.x + b.w - 8, b.y + b.h - b.hp + 16, 2, 11, '#7a807c');    // puxadores
            c.fr(b.x + 5, b.y + b.h - b.hp + 17, 4, 4, '#d9453a'); c.fr(b.x + 11, b.y + b.h - b.hp + 20, 4, 3, '#3a6fc4'); c.fr(b.x + 7, b.y + b.h - b.hp + 24, 8, 6, '#f2e8a0'); c.fr(b.x + 8, b.y + b.h - b.hp + 26, 6, 1, '#8a7a30');
            c.fr(b.x + 3, b.y + b.h - 3, b.w - 6, 2, '#4a504c');                                       // rodapé
            c.box(b.x, topY, b.w, b.h, '#e8ece8', '#ffffff', '#a4aaa6', '#262a28');                    // topo
            c.box(b.x + 6, topY + 8, 20, 12, '#b58652', '#d6a870', '#7a5830', '#3a2810'); c.fr(b.x + 14, topY + 8, 3, 12, '#dcc590');      // caixa em cima
            c.fr(b.x + 4, topY + 26, 14, 8, '#c8ccd0'); c.fr(b.x + 4, topY + 26, 14, 1, '#ffffff');
        }

        // ----- Cofre (parede oeste): aço verde-escuro, disco de segredo e maçaneta
        {
            const f = F.safe, b = base(f), topY = b.y - b.hp;
            shadow(b, 1);
            c.box(b.x, b.y + b.h - b.hp - 1, b.w, b.hp + 1, '#3d4a47', '#6c7d78', '#1f2826', '#0c1110');
            c.box(b.x + 3, b.y + b.h - b.hp + 2, b.w - 6, b.hp - 4, '#46564f', '#7a8c85', '#24302b', '#101816');
            const dx = b.x + 10, dy = b.y + b.h - (b.hp / 2 | 0) - 1;
            c.disk(dx, dy, 6, '#1a2220'); c.disk(dx, dy, 5, '#aeb8b4'); c.disk(dx, dy, 3, '#6e7a76'); c.ln(dx, dy, dx + 2, dy - 3, '#1a2220');
            for (let a = 0; a < 6.28; a += 0.7) c.px(Math.round(dx + Math.cos(a) * 5), Math.round(dy + Math.sin(a) * 5), '#2a3532');
            c.fr(b.x + b.w - 11, dy - 4, 3, 9, '#d6c24a'); c.fr(b.x + b.w - 11, dy - 4, 3, 1, '#fff2a0');
            for (const [rx, ry] of [[b.x + 5, b.y + b.h - b.hp + 4], [b.x + b.w - 6, b.y + b.h - b.hp + 4], [b.x + 5, b.y + b.h - 4], [b.x + b.w - 6, b.y + b.h - 4]]) c.px(rx, ry, '#9aa6a2');
            c.box(b.x, topY, b.w, b.h, '#52625c', '#869892', '#2a3632', '#0c1110');
            c.fr(b.x + 4, topY + 4, b.w - 8, 1, '#6c7d78');
            c.fr(b.x + 6, topY + 12, 14, 9, '#d9d2b0'); c.fr(b.x + 7, topY + 14, 12, 1, '#8a8264'); c.fr(b.x + 7, topY + 17, 8, 1, '#8a8264');     // papéis em cima
        }

        // ----- Pia + bancada leste: bacia de inox, torneira e louça
        {
            const f = F.sink, b = base(f), topY = b.y - b.hp;
            shadow(b);
            c.box(b.x, b.y + b.h - b.hp - 1, b.w, b.hp + 1, '#7a6246', '#a28660', '#4a3a26', '#201a10');
            c.fr(b.x + 6, b.y + b.h - b.hp + 3, b.w - 12, b.hp - 4, '#5a4630');
            c.box(b.x, topY, b.w, b.h, '#b8b4a8', '#e0dcce', '#7a766a', '#2a2820');
            // bacia
            const sx = b.x + 4, sy = topY + 26;
            c.box(sx, sy, b.w - 10, 56, '#7c8a94', '#d0dce4', '#46525a', '#1c2428'); c.fr(sx + 3, sy + 4, b.w - 16, 48, '#5a6872'); c.fr(sx + 3, sy + 4, b.w - 16, 3, '#46525a');
            c.disk(sx + (b.w - 10) / 2 | 0, sy + 28, 2, '#1c2428');
            // torneira (na parede leste)
            c.fr(b.x + b.w - 8, sy + 18, 8, 3, '#c8ccd0'); c.fr(b.x + b.w - 13, sy + 14, 4, 11, '#c8ccd0'); c.disk(b.x + b.w - 11, sy + 14, 2, '#e0e4e8'); c.px(b.x + b.w - 2, sy + 20, '#4aa8ff');
            // louça no escorredor + esponja + detergente
            c.disk(b.x + 12, topY + 12, 7, '#e8e8e4'); c.disk(b.x + 12, topY + 12, 5, '#cfd2cc'); c.ring(b.x + 12, topY + 12, 7, '#8a8c88');
            c.box(b.x + 4, topY + 100, 9, 12, '#d6c24a', '#f0e480', '#8a7a1a', '#3a3208'); c.fr(b.x + 5, topY + 102, 7, 2, '#3f9a52');
            c.box(b.x + b.w - 16, topY + 108, 9, 18, '#e0609a', '#f090c0', '#9a3466', '#4a1830'); c.fr(b.x + b.w - 14, topY + 104, 5, 4, '#e8e8e0');
            c.box(b.x + b.w - 14, topY + 66, 8, 14, '#3f9a52', '#7ad088', '#1f5a2c', '#0e2a14');
        }

        // ----- Baú de madeira com cintas de ferro (guarda-tudo) no canto da cozinha
        {
            const f = F.chest, b = base(f);
            shadow(b, 2);
            const fy = b.y + b.h - b.hp;
            c.box(b.x, fy - 1, b.w, b.hp + 1, '#7a5230', '#a87848', '#4a3018', '#1c1008');
            for (let j = 3; j < b.hp - 2; j += 5) c.fr(b.x + 2, fy + j, b.w - 4, 1, '#5a3c20');
            c.fr(b.x + 3, fy, 4, b.hp, '#4a4e56'); c.fr(b.x + b.w - 7, fy, 4, b.hp, '#4a4e56'); c.fr(b.x + 3, fy, 1, b.hp, '#8a8e96'); c.fr(b.x + b.w - 7, fy, 1, b.hp, '#8a8e96');
            c.box(b.x + (b.w / 2 | 0) - 4, fy + 2, 8, 9, '#d9a020', '#f5d060', '#8a6208', '#3a2804'); c.px(b.x + (b.w / 2 | 0), fy + 6, '#2a1c04'); c.px(b.x + (b.w / 2 | 0), fy + 7, '#2a1c04');       // fechadura
            // tampa (arredondada: faixa clara no meio)
            c.box(b.x, b.y - b.hp, b.w, b.h, '#8a6238', '#c49a62', '#5a3c20', '#2a1c10');
            for (let i = 4; i < b.w - 4; i += 7) c.fr(b.x + i, b.y - b.hp + 2, 1, b.h - 4, '#6a4a2a');
            c.fr(b.x + 3, b.y - b.hp, 4, b.h, '#4a4e56'); c.fr(b.x + b.w - 7, b.y - b.hp, 4, b.h, '#4a4e56'); c.fr(b.x + 3, b.y - b.hp, 1, b.h, '#8a8e96'); c.fr(b.x + b.w - 7, b.y - b.hp, 1, b.h, '#8a8e96');
            c.fr(b.x + 8, b.y - b.hp + 3, b.w - 16, 1, '#d4ac72');
        }

        // ------------------------------------------------------------ LUZ E FIOS
        // Fios do "gato" cruzando o teto (catenárias do canto da estante até a lâmpada e a cozinha) + cabo da lâmpada
        const bulbX = X(8.4), bulbY = Y(10.2);
        const wire = (x0, y0, x1, y1, sag, col = '#1a1410') => { const n = Math.max(2, Math.abs(x1 - x0)); for (let i = 0; i <= n; i++) { const t = i / n; c.px(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag), col); } };
        wire(X(0.7), northY - faceH + 6, bulbX, northY - faceH + 30, 10); wire(X(0.7), northY - faceH + 12, X(14.0), northY - faceH + 14, 12, '#2a2018'); wire(partX1, northY - faceH + 10, X(22.3), northY - faceH + 22, 8);
        wire(bulbX, northY - faceH + 30, bulbX, bulbY - 7, 0, '#1a1410');
        // lâmpada: soquete, bulbo e brilho
        c.fr(bulbX - 2, bulbY - 8, 5, 4, '#2a2420'); c.disk(bulbX, bulbY - 1, 4, '#fff0b0'); c.disk(bulbX, bulbY - 1, 2, '#ffffff'); c.ring(bulbX, bulbY - 1, 5, '#e0b050');
        // poça de luz quente (clareia o piso em volta da lâmpada) + vinheta escura nos cantos
        const lx = X(8.4), ly = Y(9.0);
        for (let y = 0; y < HPX; y++) for (let x = 0; x < WPX; x++) {
            const k = (y * WPX + x) * 4; if (c.data[k + 3] === 0) continue;
            const d = Math.hypot((x - lx) / 150, (y - ly) / 120), g = Math.max(0, 1 - d) , gl = g * g * 0.22;
            const vg = Math.hypot((x - WPX / 2) / (WPX * 0.62), (y - HPX * 0.55) / (HPX * 0.7)), v = Math.max(0, vg - 0.55) * 0.34;
            c.data[k] = Math.max(0, Math.min(255, c.data[k] * (1 + gl * 1.2 - v) + gl * 40));
            c.data[k + 1] = Math.max(0, Math.min(255, c.data[k + 1] * (1 + gl * 0.9 - v) + gl * 26));
            c.data[k + 2] = Math.max(0, Math.min(255, c.data[k + 2] * (1 + gl * 0.2 - v) + gl * 6));
        }
        return { canvas: c, in: IN, bulb: { x: S.world ? 8.4 : 8.4, z: 10.2 } };
    },
};
