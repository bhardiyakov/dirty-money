// ============================================================================
// ItemSprites — os ícones dos itens do chão (e dos drops) em PIXEL ART, desenhados por código num atlas.
// Cada ícone vive numa célula de 40×40 px (20 px/u ⇒ 2u no mundo), com contorno escuro de 1 px e luz/sombra em
// cada peça (bevel). O atlas é uma textura NEAREST; cada item do chão é um quad achatado com o retângulo do seu ícone.
// ============================================================================

const ItemSprites = {
    CELL: 40,
    COLS: 8,

    // Ordem dos ícones no atlas (a chave é o tipo do item em Pickups.TYPES).
    KEYS: [
        'medkit', 'water', 'food', 'lootbox',
        'pistol', 'revolver', 'smg', 'ammo_pistol', 'rifle', 'ak47', 'shotgun', 'ammo_rifle',
        'cash_small', 'cash_bag', 'cash_case', 'jewels', 'necklace', 'rings', 'watch', 'coins',
        'phone_old', 'phone_new', 'jerry', 'knife', 'bat', 'backpack', 'hack', 'carkey',
        'vest', 'vest2',
    ],

    // ---------------------------------------------------------------- desenho
    _tools(p) {
        const hex = Pixel.hex;
        const col = (c) => (typeof c === 'string' ? hex(c) : c);
        const lit = (c) => Pixel.clamp(Pixel.mix(c, [255, 255, 255], 0.38));
        const dark = (c) => Pixel.clamp(Pixel.mix(c, [10, 8, 30], 0.38));
        const T = {
            R: (x, y, w, h, c) => { c = col(c); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) p.setClip(x + i, y + j, c); },
            // Retângulo com bisel: luz em cima/esquerda, sombra embaixo/direita.
            B: (x, y, w, h, c) => {
                c = col(c); T.R(x, y, w, h, c);
                T.R(x, y, w, 1, lit(c)); T.R(x, y, 1, h, lit(c));
                T.R(x, y + h - 1, w, 1, dark(c)); T.R(x + w - 1, y, 1, h, dark(c));
            },
            S: (x, y, c) => p.setClip(x, y, col(c)),
            D: (cx, cy, r, c) => { c = col(c); for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r + r * 0.6) p.setClip(cx + i, cy + j, c); },
            E: (cx, cy, rx, ry, c) => { c = col(c); for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) if ((i * i) / (rx * rx + 0.5) + (j * j) / (ry * ry + 0.5) <= 1) p.setClip(cx + i, cy + j, c); },
            L: (x0, y0, x1, y1, c) => {
                c = col(c);
                const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
                for (let k = 0; k <= n; k++) p.setClip(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), c);
            },
            // Anel (contorno de elipse) de espessura ~1,5.
            O: (cx, cy, rx, ry, c) => {
                c = col(c);
                for (let a = 0; a < Math.PI * 2; a += 0.04) {
                    const x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry);
                    p.setClip(x, y, c); p.setClip(x + 1, y, c);
                }
            },
            // Losango (gema) de raio r.
            G: (cx, cy, r, c) => { c = col(c); for (let j = -r; j <= r; j++) { const w = r - Math.abs(j); T.R(cx - w, cy + j, 2 * w + 1, 1, c); } },
            clear: (x, y) => p.set(x, y, [0, 0, 0], 0),
            // Brilhinho em cruz.
            spark: (x, y) => { const w = [255, 255, 255]; T.S(x, y, w); T.S(x - 1, y, w); T.S(x + 1, y, w); T.S(x, y - 1, w); T.S(x, y + 1, w); },
        };
        return T;
    },

    // Contorno externo de 1 px (cor escura) em volta de tudo que foi desenhado.
    _outline(p) {
        const out = [];
        const a = (x, y) => (x >= 0 && y >= 0 && x < p.w && y < p.h ? p.data[(y * p.w + x) * 4 + 3] : 0);
        for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
            if (a(x, y) > 0) continue;
            if (a(x - 1, y) > 0 || a(x + 1, y) > 0 || a(x, y - 1) > 0 || a(x, y + 1) > 0) out.push([x, y]);
        }
        for (const [x, y] of out) p.set(x, y, [20, 14, 28]);
    },

    // Desenha o ícone `key` num PixelCanvas 40×40.
    icon(key) {
        const p = new PixelCanvas(this.CELL, this.CELL);
        const t = this._tools(p), { R, B, S, D, E, L, O, G, spark, clear } = t;
        const DRAW = {
            medkit() {
                B(15, 6, 10, 5, '#7b828c'); R(17, 8, 6, 2, '#3a3f48');
                B(6, 10, 28, 22, '#4f9a62'); R(7, 28, 26, 3, '#3a7c4d');
                R(18, 15, 4, 12, '#f6f8f6'); R(13, 19, 14, 4, '#f6f8f6');
                R(9, 13, 2, 2, '#2c5e3a'); R(29, 13, 2, 2, '#2c5e3a');
            },
            water() {
                B(7, 14, 22, 12, '#4aa3ff');
                for (const x of [10, 14, 18, 22]) R(x, 15, 2, 10, '#8fcbff');
                R(8, 15, 20, 1, '#d3ecff'); R(7, 24, 22, 2, '#2f78c8');
                B(29, 16, 3, 8, '#4aa3ff'); R(32, 18, 2, 4, '#4aa3ff'); B(34, 17, 3, 6, '#dbe5f2');
            },
            food() {
                B(6, 12, 28, 20, '#c98a52'); R(8, 14, 24, 4, '#7a4f2b'); R(7, 29, 26, 2, '#a86f3c');
                R(11, 25, 18, 3, '#d99a3e'); R(11, 22, 18, 3, '#7a3d1f'); R(12, 21, 16, 1, '#f2c43b'); R(11, 19, 18, 2, '#6fc24b');
                E(20, 17, 9, 4, '#e2a449'); R(12, 16, 16, 1, '#f0bd68');
                for (const [x, y] of [[16, 15], [20, 14], [24, 16], [18, 17], [22, 17]]) S(x, y, '#fff0c0');
            },
            lootbox() {
                B(5, 17, 30, 16, '#4d3d38'); B(5, 9, 30, 9, '#6a5249'); R(6, 10, 28, 1, '#8a6c60');
                B(11, 9, 3, 24, '#7a7d88'); B(26, 9, 3, 24, '#7a7d88');
                B(17, 16, 6, 8, '#aeb4be'); R(19, 18, 2, 3, '#1b1b22');
                S(7, 20, '#8a8d98'); S(32, 20, '#8a8d98'); S(7, 29, '#8a8d98'); S(32, 29, '#8a8d98');
            },
            pistol() {
                for (let k = 0; k < 12; k++) R(10 + (k >> 2), 18 + k, 7, 1, '#2e3036');
                R(11, 19, 1, 9, '#4a4d56');
                R(18, 19, 1, 3, '#2e3036'); R(18, 22, 5, 1, '#2e3036'); R(22, 19, 1, 4, '#2e3036');
                B(7, 12, 25, 6, '#58606a'); R(8, 12, 23, 1, '#a4adb8'); R(32, 13, 2, 4, '#3d434b');
                S(31, 11, '#3d434b'); S(8, 11, '#3d434b'); R(14, 14, 6, 1, '#3d434b');
            },
            revolver() {
                for (let k = 0; k < 12; k++) R(10 + (k >> 2), 21 + k - 2, 6, 1, '#6a4330');
                B(22, 13, 14, 4, '#59616b'); B(13, 12, 11, 9, '#59616b');
                D(19, 16, 4, '#7d858f'); S(18, 15, '#2a2d33'); S(20, 15, '#2a2d33'); S(19, 17, '#2a2d33'); S(17, 17, '#2a2d33');
                R(13, 10, 3, 3, '#3a3f46'); R(23, 12, 12, 1, '#a4adb8');
                R(18, 21, 1, 3, '#3a3f46'); R(18, 24, 5, 1, '#3a3f46'); R(22, 21, 1, 4, '#3a3f46');
            },
            smg() {
                B(3, 12, 6, 4, '#2f3137'); B(9, 11, 23, 9, '#3b3e46'); R(10, 11, 21, 1, '#7b828c');
                B(9, 8, 9, 3, '#2f3137'); B(32, 13, 5, 3, '#2a2c31');
                B(17, 20, 5, 13, '#2a2c32'); for (const y of [23, 26, 29]) R(18, y, 3, 1, '#4a4d56');
                B(26, 20, 4, 6, '#2a2c32'); R(12, 14, 8, 1, '#2a2c31');
            },
            ammo_pistol() {
                B(6, 27, 28, 6, '#5b6068');
                for (let i = 0; i < 5; i++) {
                    const x = 9 + i * 5;
                    R(x, 14, 3, 13, '#d9a441'); R(x, 14, 1, 13, '#f5d57a'); R(x + 2, 14, 1, 13, '#a8782a');
                    R(x, 10, 3, 4, '#c47a35'); S(x, 10, '#e29a55');
                }
            },
            rifle() {
                B(2, 16, 8, 6, '#2f3137'); B(10, 14, 14, 6, '#3d4047'); B(12, 11, 9, 3, '#2f3137');
                B(24, 15, 8, 5, '#2f3137'); R(32, 16, 6, 2, '#2a2c31'); R(36, 14, 2, 6, '#2a2c31'); R(30, 13, 2, 3, '#2a2c31');
                B(15, 20, 5, 9, '#2a2c32'); R(11, 20, 3, 7, '#2a2c32'); R(11, 14, 12, 1, '#7b828c');
            },
            ak47() {
                B(2, 16, 9, 6, '#8a4b25'); B(11, 15, 13, 5, '#33363c'); B(12, 20, 4, 7, '#8a4b25');
                B(24, 15, 9, 5, '#9a5a2d'); R(24, 13, 9, 2, '#33363c'); R(33, 16, 5, 2, '#2a2c31'); R(35, 13, 1, 3, '#2a2c31');
                B(17, 20, 5, 5, '#2a2c32'); B(19, 24, 5, 5, '#2a2c32'); R(12, 15, 11, 1, '#7b828c'); R(4, 17, 6, 1, '#b8733a');
            },
            shotgun() {
                B(2, 17, 10, 6, '#7a4a26'); B(12, 15, 9, 6, '#3a3d44'); B(21, 15, 17, 3, '#52585f');
                R(21, 18, 15, 2, '#3a3d44'); B(24, 19, 8, 3, '#8a5a30'); R(12, 15, 8, 1, '#8a919b');
                R(15, 21, 1, 3, '#3a3d44'); R(15, 24, 4, 1, '#3a3d44'); R(18, 21, 1, 4, '#3a3d44');
            },
            ammo_rifle() {
                for (let i = 0; i < 3; i++) {
                    const x = 7 + i * 9, y = i === 1 ? 11 : 13;
                    R(x + 1, y - 3, 5, 3, '#d9a441'); R(x + 2, y - 4, 3, 1, '#c47a35');
                    B(x, y, 7, 18, '#3b3d44'); for (const dy of [4, 8, 12]) R(x + 1, y + dy, 5, 1, '#5d6068');
                    R(x, y + 18, 7, 2, '#585d65');
                }
            },
            cash_small() {
                B(7, 18, 24, 10, '#7aa468'); R(8, 22, 22, 1, '#5f8a50'); R(17, 18, 4, 10, '#e8e0c0');
                B(11, 11, 24, 10, '#8bb678'); R(12, 15, 22, 1, '#6c9a5a'); R(21, 11, 4, 10, '#e8e0c0');
            },
            cash_bag() {
                E(20, 25, 11, 10, '#8a6a42'); D(15, 22, 3, '#a8854f'); E(22, 30, 7, 3, '#74562f');
                B(16, 10, 8, 7, '#8a6a42'); R(13, 9, 14, 3, '#9a7a4c'); R(15, 14, 10, 2, '#d4ab3a');
                const g = ['XXX', 'X..', 'XXX', '..X', 'XXX'];
                g.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'X') S(18 + i, 20 + j, '#3a2a14'); }));
                R(19, 19, 1, 1, '#3a2a14'); R(19, 25, 1, 1, '#3a2a14');
            },
            cash_case() {
                B(15, 8, 10, 5, '#1f2025'); B(4, 13, 32, 20, '#2d2f35');
                R(7, 16, 26, 13, '#5f8f4f');
                for (let y = 16; y < 29; y += 3) R(7, y, 26, 1, '#8fb77a');
                R(18, 16, 4, 13, '#e8e0c0');
                R(4, 13, 3, 3, '#d9b13a'); R(33, 13, 3, 3, '#d9b13a'); R(4, 30, 3, 3, '#d9b13a'); R(33, 30, 3, 3, '#d9b13a');
                R(4, 13, 32, 1, '#6a6f78');
            },
            jewels() {
                D(14, 27, 6, '#e8b830'); D(25, 28, 6, '#f0c844'); D(19, 23, 6, '#e8b830');
                S(12, 25, '#fff1a8'); S(23, 26, '#fff1a8'); S(17, 21, '#fff1a8');
                G(23, 18, 5, '#e0243a'); G(22, 16, 2, '#ff8a96');
                G(11, 20, 4, '#6fc7ff'); G(10, 19, 1, '#e6f8ff');
                spark(7, 10); spark(31, 11); spark(26, 7);
            },
            necklace() {
                O(20, 18, 11, 12, '#f0c030');
                for (let a = 0.2; a < Math.PI; a += 0.4) S(Math.round(20 + Math.cos(a) * 11), Math.round(18 + Math.sin(a) * 12) + 1, '#b8860b');
                for (let a = 3.6; a < 5.8; a += 0.5) S(Math.round(20 + Math.cos(a) * 11), Math.round(18 + Math.sin(a) * 12), '#fff0a0');
                D(20, 33, 3, '#e8b830'); G(20, 33, 2, '#e0243a');
            },
            rings() {
                O(13, 25, 8, 7, '#f0c030'); G(13, 17, 3, '#e0243a'); G(12, 16, 1, '#ff9aa4');
                O(28, 22, 7, 6, '#cfd6de'); G(28, 15, 3, '#4aa8ff'); G(27, 14, 1, '#e6f8ff');
                spark(6, 12); spark(34, 31);
            },
            watch() {
                B(15, 3, 10, 10, '#e0a82e'); B(15, 27, 10, 10, '#e0a82e');
                for (const y of [30, 33]) { S(19, y, '#8a6310'); S(21, y, '#8a6310'); }
                D(20, 20, 11, '#e8b830'); D(20, 20, 9, '#9a7418'); D(20, 20, 8, '#f6efd2');
                for (const [x, y] of [[20, 13], [20, 27], [13, 20], [27, 20]]) R(x, y, 1, 2, '#6a5320');
                L(20, 20, 20, 15, '#2a2a2a'); L(20, 20, 24, 22, '#2a2a2a'); S(20, 20, '#c0392b');
                R(31, 19, 2, 3, '#e8b830'); S(15, 15, '#ffffff'); S(16, 14, '#ffffff');
            },
            coins() {
                for (let i = 0; i < 3; i++) {
                    const y = 30 - i * 5;
                    R(11, y, 19, 3, '#a8781e'); E(20, y, 9, 4, '#e8b830'); E(20, y - 1, 7, 3, '#f6d460');
                }
                D(30, 17, 5, '#f0c844'); D(30, 17, 3, '#f8dc78'); S(28, 15, '#ffffff');
            },
            phone_old() {
                B(22, 3, 2, 6, '#3f444c'); B(14, 8, 12, 26, '#575d66');
                B(16, 11, 8, 7, '#9fc89a'); R(17, 12, 6, 1, '#cfe8c8'); R(17, 9, 6, 1, '#2e3238');
                for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) R(16 + c * 3, 21 + r * 3, 2, 2, '#cfd3d9');
            },
            phone_new() {
                B(12, 5, 16, 30, '#1e2027'); R(14, 8, 12, 24, '#2b3a58');
                L(14, 24, 25, 13, '#4a6fa5'); L(14, 28, 25, 17, '#3a5a8c');
                S(15, 6, '#0b0b0f'); R(18, 33, 4, 1, '#8a93a3'); R(14, 8, 12, 1, '#4d5d80');
            },
            jerry() {
                B(9, 12, 22, 22, '#c82d2d'); B(9, 10, 22, 3, '#9e1f1f');
                B(12, 6, 10, 6, '#a02020'); R(14, 8, 6, 2, '#3a1010');
                B(25, 6, 6, 7, '#c82d2d'); R(26, 4, 4, 2, '#f2c43b');
                L(13, 16, 27, 30, '#e86a6a'); L(27, 16, 13, 30, '#e86a6a'); L(14, 16, 28, 30, '#e86a6a'); L(26, 16, 12, 30, '#e86a6a');
                R(11, 14, 18, 1, '#e86a6a'); R(11, 32, 18, 1, '#8c1d1d');
            },
            knife() {
                for (let x = 15; x < 36; x++) {
                    const th = Math.max(1, 6 - Math.floor(((x - 15) * 5) / 20));
                    R(x, 17, 1, th, '#d8dde4'); S(x, 17, '#ffffff'); S(x, 17 + th - 1, '#8f97a3');
                }
                B(13, 14, 3, 12, '#8a7a5a'); B(4, 17, 10, 6, '#6b3f26');
                for (const x of [6, 9, 12]) R(x, 17, 1, 6, '#3d2314');
                D(4, 20, 3, '#8a7a5a');
            },
            bat() {
                for (let x = 4; x < 37; x++) {
                    const th = 2 + Math.floor(((x - 4) / 32) * 5), y0 = 20 - (th >> 1);
                    R(x, y0, 1, th, '#c88a4a'); S(x, y0, '#e8b070'); S(x, y0 + th - 1, '#8a5a2a');
                    if (x < 12) { R(x, y0, 1, th, '#33292a'); S(x, y0, '#4a3c3d'); }
                }
                D(4, 20, 2, '#33292a'); D(36, 20, 3, '#c88a4a'); S(35, 18, '#e8b070');
            },
            backpack() {
                B(17, 5, 6, 5, '#2f4426'); B(9, 10, 22, 25, '#4a6a3a'); B(9, 10, 22, 11, '#587a46');
                R(9, 20, 22, 2, '#3a542c'); B(13, 24, 14, 9, '#41592f'); R(13, 25, 14, 1, '#2d3f24');
                B(18, 19, 4, 4, '#d9c78a'); R(8, 14, 2, 16, '#3a542c'); R(30, 14, 2, 16, '#3a542c');
            },
            hack() {
                B(7, 9, 26, 22, '#2a3140'); B(10, 12, 14, 9, '#25805a');
                R(11, 14, 12, 1, '#7be0a8'); R(11, 17, 8, 1, '#7be0a8'); R(11, 19, 10, 1, '#4fb883');
                B(26, 13, 5, 5, '#14161c'); B(26, 20, 5, 5, '#14161c');
                S(11, 24, '#ff4040'); S(14, 24, '#40ff70'); S(17, 24, '#ffd040'); R(11, 27, 18, 1, '#556070');
                L(10, 31, 6, 37, '#e04040'); L(18, 31, 18, 38, '#40a0ff'); L(26, 31, 31, 37, '#ffd040');
            },
            // Coletes à prova de balas (de frente): nível 1 azul-acinzentado, nível 2 preto tático.
            vest() { DRAW.vestShape('#5a79a8', '#3f5a86', '#7d97c0'); },
            vest2() { DRAW.vestShape('#2f333b', '#1f2227', '#555b66'); R(15, 16, 10, 8, '#c9a53a'); R(16, 17, 8, 6, '#2a2d34'); R(19, 18, 2, 4, '#c9a53a'); },
            vestShape(base, deep, hi) {
                B(8, 11, 24, 24, base); B(8, 5, 7, 8, base); B(25, 5, 7, 8, base);
                for (let j = 0; j < 5; j++) for (let i = j; i < 10 - j; i++) clear(15 + i, 5 + j);
                R(15, 11, 10, 1, deep);
                R(19, 12, 2, 23, deep); R(9, 12, 22, 1, hi);
                B(10, 26, 8, 7, deep); B(22, 26, 8, 7, deep);
                R(9, 22, 5, 2, hi); R(26, 22, 5, 2, hi);
            },
            carkey() {
                D(11, 20, 7, '#2d3036'); D(11, 20, 2, '#c8ccd4'); clear(11, 20); clear(10, 20); clear(12, 20); clear(11, 19); clear(11, 21);
                R(18, 18, 17, 4, '#c9ccd2'); R(18, 18, 17, 1, '#f2f4f7'); R(18, 21, 17, 1, '#8c929c');
                R(24, 22, 2, 3, '#c9ccd2'); R(29, 22, 2, 3, '#c9ccd2'); R(33, 22, 2, 3, '#c9ccd2');
                B(6, 29, 11, 8, '#c0392b'); S(9, 33, '#20121a');
                L(10, 27, 8, 29, '#c8ccd4');
            },
        };
        DRAW[key]();
        this._outline(p);
        return p;
    },

    // Atlas com todos os ícones: textura NEAREST sem mipmap, transparência por alfa.
    create(scene) {
        const C = this.CELL, n = this.KEYS.length, rows = Math.ceil(n / this.COLS);
        const atlas = new PixelCanvas(C * this.COLS, C * rows);
        this.rects = {};
        this.KEYS.forEach((key, i) => {
            const cx = (i % this.COLS) * C, cy = Math.floor(i / this.COLS) * C;
            atlas.blit(this.icon(key), cx, cy);
            // UV como no SpriteActor: v = 0 é o TOPO da imagem (linha 0 dos dados).
            this.rects[key] = [cx / atlas.w, cy / atlas.h, (cx + C) / atlas.w, (cy + C) / atlas.h];
        });
        const tex = atlas.toTexture(scene, { wrap: false, mips: false });
        tex.hasAlpha = true;
        this.atlas = atlas;
        const m = new BABYLON.StandardMaterial('itemAtlas', scene);
        m.diffuseTexture = tex;
        m.emissiveTexture = tex;
        m.opacityTexture = tex;
        m.specularColor = BABYLON.Color3.Black();
        m.disableLighting = true;
        m.transparencyMode = BABYLON.Material.MATERIAL_ALPHATEST;
        m.alphaCutOff = 0.5;
        m.backFaceCulling = false;
        this.material = m;
        return m;
    },

    // Quad achatado (visto de cima, norte em cima) com o ícone `key`; `size` = lado em unidades de mundo.
    quad(scene, key, size = 2) {
        if (!this.material) this.create(scene);
        const h = size / 2, [u0, vt, u1, vb] = this.rects[key];
        const mesh = new BABYLON.Mesh('item_' + key, scene);
        const vd = new BABYLON.VertexData();
        vd.positions = [-h, 0, h, h, 0, h, -h, 0, -h, h, 0, -h];
        vd.indices = [3, 1, 0, 2, 3, 0];
        vd.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
        vd.uvs = [u0, vt, u1, vt, u0, vb, u1, vb];
        vd.applyToMesh(mesh);
        mesh.material = this.material;
        mesh.isPickable = false;
        return mesh;
    },
};
