// ============================================================================
// WeaponArt — ícones das armas (e da mão) em PIXEL ART, desenhados em código numa grade de 80×40 px (ampliada com `pixelated` pela
// interface). Segue a folha de referência do jogo: MÃO (palma aberta), PISTOLA (estilo 1911), METRALHADORA (estilo Uzi), FUZIL
// (estilo AK-47, madeira), FACA (de caça, cabo listrado), TACO (de beisebol) — mais o REVÓLVER e a ESCOPETA no mesmo estilo.
// Todas de lado, cano/ponta para a direita, luz vinda de cima/esquerda, contorno escuro de 1 px.
// `WeaponArt.canvas(key)` devolve um canvas 80×40 (cache); chaves: fists | knife | bat | pistol | revolver | smg | shotgun | rifle | ak47.
// ============================================================================

const WeaponArt = {
    W: 80, H: 40,
    KEYS: ['fists', 'knife', 'bat', 'pistol', 'revolver', 'smg', 'shotgun', 'rifle', 'ak47'],
    _cache: {},
    has(key) { return key === 'none' || this.KEYS.includes(key); },

    canvas(key) {
        if (key === 'none') key = 'fists';
        if (this._cache[key]) return this._cache[key];
        const g = new WeaponArt.VGrid(this.W, this.H, 4);                 // HD: as mesmas formas, desenhadas em vetor 4× (estilo emoji)
        (this['_' + key] || this._pistol).call(this, g);
        return (this._cache[key] = g.render());
    },

    // ---------------------------------------------------------------- paletas [claro, base, escuro, mais escuro]
    P: {
        metal: ['#a8b0ba', '#6a717b', '#3e434b', '#24272d'],
        steel: ['#f4f8fc', '#c8d0da', '#929cab', '#5e6878'],
        wood: ['#d49a58', '#a46a34', '#744420', '#4a2810'],
        grip: ['#585d66', '#33363d', '#1f2126', '#121316'],
        skin: ['#fadcc0', '#eab48a', '#c98660', '#9c593b'],
        brass: ['#f0d07a', '#c9a23f', '#8e6e22', '#5a4410'],
        leather: ['#a8683c', '#7a4424', '#4e2a14', '#2e180a'],
    },

    // ---------------------------------------------------------------- MÃO (palma aberta, dedos levemente abertos)
    _fists(g) {
        const S = this.P.skin;
        g.poly([[28, 22], [52, 22], [55, 33], [51, 40], [31, 40], [26, 33]], S);                              // palma + punho
        g.cap(33, 22, 30, 8, 2.4, S); g.cap(38, 21, 38, 4, 2.5, S); g.cap(43, 22, 45, 6, 2.4, S); g.cap(48, 25, 53, 12, 2.1, S);   // indicador, médio, anelar, mindinho
        g.cap(29, 30, 21, 24, 2.9, S); g.cap(21, 24, 17, 16, 2.5, S);                                           // polegar (duas falanges)
        g.finish('#3a1f12');
        const c = S[3];
        g.line(31, 28, 40, 26, c); g.line(40, 26, 49, 25, c); g.line(30, 28, 35, 34, c); g.line(36, 30, 42, 32, c);   // linhas da palma
        for (const [x, y] of [[31, 15], [38, 12], [44, 13], [51, 17]]) g.px(x, y, c);                           // dobras dos dedos
        for (const [x, y] of [[30, 9], [38, 5], [45, 7], [53, 13], [17, 17]]) g.px(x, y, S[0]);                 // unhas
    },

    // ---------------------------------------------------------------- PISTOLA (1911)
    _pistol(g) {
        const M = this.P.metal, K = this.P.grip;
        g.poly([[14, 17], [34, 17], [31, 35], [18, 35]], K);                                                   // cabo
        g.rectH(17, 35, 14, 2, M);
        g.rectH(14, 17, 42, 3, this.P.metal.map((c, i) => (i < 3 ? this.P.metal[i + 1] : c)));                 // armação
        g.rectH(14, 8, 46, 9, M);                                                                              // ferrolho (slide)
        g.rectH(60, 10, 3, 6, [M[1], M[2], M[2], M[3]]);                                                       // boca do cano
        for (let x = 16; x <= 24; x += 2) g.rect(x, 11, 1, 4, M[3]);                                           // serrilhas
        g.rect(35, 11, 10, 3, M[3]); g.rect(35, 11, 10, 1, '#0d0e11');                                         // janela de ejeção
        g.rect(15, 6, 4, 2, M[2]); g.rect(56, 6, 2, 3, M[2]);                                                   // mira traseira / massa
        g.rect(38, 20, 2, 3, M[2]);                                                                            // gatilho
        for (const [x, y] of [[44, 20], [44, 21], [44, 22], [43, 23], [42, 24], [41, 24], [40, 24], [39, 24], [38, 24], [37, 24], [36, 24], [35, 23], [35, 22], [35, 21], [35, 20]]) g.px(x, y, M[3]);   // guarda-mato
        g.px(13, 9, M[3]); g.px(12, 10, M[3]);                                                                  // cão
        for (let y = 21; y < 34; y++) for (let x = 15; x < 31; x++) if (g.get(x, y) === K[1] && (x + y) % 3 === 0) g.px(x, y, K[2]);   // textura do cabo
        for (let y = 19; y < 34; y++) { const x = Math.round(14 + (y - 17) * -0.17); if (g.get(x + 1, y) === K[1]) g.px(x + 1, y, K[0]); }
        g.finish('#101216');
    },

    // ---------------------------------------------------------------- METRALHADORA (Uzi)
    _smg(g) {
        const M = this.P.metal, K = this.P.grip;
        g.rect(34, 30, 6, 8, M[2]); g.rect(34, 30, 1, 8, M[1]); g.rect(34, 37, 6, 1, M[3]);                     // carregador
        g.poly([[33, 19], [41, 19], [41, 31], [33, 31]], K);                                                    // empunhadura
        g.rectH(18, 8, 36, 11, M);                                                                              // corpo
        g.rectH(20, 6, 30, 3, [M[0], M[0], M[1], M[2]]);                                                        // tampa superior
        for (let x = 22; x < 50; x += 3) g.px(x, 7, M[3]);                                                      // ventilação
        g.rect(32, 11, 9, 3, M[3]);                                                                             // janela de ejeção
        g.rectH(54, 10, 12, 6, [M[1], M[1], M[2], M[3]]); for (let x = 56; x < 66; x += 2) g.rect(x, 10, 1, 6, M[3]);   // proteção do cano
        g.rect(66, 12, 6, 2, M[2]); g.rect(66, 12, 6, 1, M[1]);                                                 // ponta do cano
        g.rect(57, 7, 2, 3, M[2]); g.rect(55, 6, 6, 1, M[3]);                                                   // massa de mira
        g.rect(22, 4, 4, 3, M[2]); g.rect(22, 4, 4, 1, M[0]);                                                   // ferrolho/cocking
        g.rect(19, 5, 2, 2, M[2]);                                                                              // mira traseira
        for (const [x, y] of [[43, 19], [44, 20], [45, 21], [46, 22], [47, 23], [48, 23], [49, 23], [50, 22], [50, 21], [49, 20]]) g.px(x, y, M[3]);      // guarda-mato
        g.px(46, 20, M[2]);
        g.thick([[18, 9], [11, 9], [7, 13], [7, 22], [10, 26], [16, 26], [18, 20]], M[2]);                      // coronha de arame dobrada
        for (let y = 21; y < 30; y++) for (let x = 34; x < 41; x++) if (g.get(x, y) === K[1] && (x + y) % 3 === 0) g.px(x, y, K[2]);
        g.finish('#101216');
    },

    // ---------------------------------------------------------------- FUZIL (AK-47)
    _ak47(g) {
        const M = this.P.metal, W = this.P.wood, K = this.P.grip;
        g.poly([[2, 13], [20, 12], [20, 23], [8, 28], [2, 26]], W);                                              // coronha
        g.poly([[36, 19], [43, 19], [48, 25], [52, 33], [46, 35], [42, 27], [37, 23]], [K[0], K[1], K[2], K[3]]); // carregador em banana
        g.poly([[26, 19], [31, 19], [30, 30], [25, 29]], W);                                                      // empunhadura
        g.rectH(20, 10, 23, 9, M);                                                                                // receptor
        g.rect(30, 12, 7, 3, M[3]);                                                                               // janela de ejeção
        g.rect(33, 7, 4, 3, M[2]); g.rect(33, 7, 4, 1, M[0]);                                                     // alça de mira
        g.rectH(43, 13, 16, 7, W);                                                                                // guarda-mão inferior
        g.rectH(45, 10, 14, 3, [W[0], W[0], W[1], W[2]]);                                                         // guarda-mão superior
        g.rect(44, 8, 17, 2, M[1]); g.rect(44, 8, 17, 1, M[0]);                                                   // tubo de gás
        g.rect(59, 14, 11, 2, M[2]); g.rect(59, 14, 11, 1, M[1]);                                                 // cano
        g.rect(58, 10, 3, 7, M[2]);                                                                               // bloco de gás
        g.rect(65, 10, 2, 5, M[3]);                                                                               // massa de mira
        g.rect(69, 12, 4, 6, M[3]); g.rect(69, 12, 4, 1, M[2]);                                                   // freio de boca
        for (const [x, y] of [[32, 20], [33, 21], [34, 22], [35, 23], [36, 23], [37, 23], [38, 22], [38, 21], [37, 20]]) g.px(x, y, M[3]);                   // guarda-mato
        for (let y = 13; y < 26; y++) for (let x = 3; x < 20; x++) if (g.get(x, y) === W[1] && (y * 5 + x) % 7 === 0) g.px(x, y, W[2]);                       // veios da coronha
        for (let x = 46; x < 58; x++) if (g.get(x, 16) === W[1] && x % 3 === 0) g.px(x, 16, W[2]);
        for (let t = 0; t < 4; t++) g.px(40 + t * 2, 27 + t * 2 - (t > 1 ? 0 : 0), K[0]);                          // brilho do carregador
        g.finish('#101216');
    },

    // ---------------------------------------------------------------- FACA (caça, cabo listrado)
    _knife(g) {
        const S = this.P.steel, B = this.P.brass, L = this.P.leather;
        g.poly([[29, 13], [56, 12], [66, 15], [72, 19], [62, 23], [29, 22]], S);                                  // lâmina
        g.line(31, 17, 62, 17, S[2]); g.line(31, 18, 60, 18, S[3]);                                               // fuller (canal)
        g.line(30, 13, 55, 12, '#ffffff');                                                                        // brilho do dorso
        g.line(32, 22, 61, 22, S[0]);                                                                              // fio
        g.rect(26, 10, 3, 15, B[1]); g.rect(26, 10, 1, 15, B[0]); g.rect(28, 10, 1, 15, B[2]);                     // guarda de latão
        g.poly([[8, 13], [26, 13], [26, 22], [8, 22]], L);                                                         // cabo
        for (let x = 9; x < 26; x += 4) { g.rect(x, 13, 2, 9, L[2]); g.rect(x + 2, 13, 1, 9, L[0]); }              // listras
        g.rect(4, 14, 5, 7, this.P.metal[1]); g.rect(4, 14, 5, 1, this.P.metal[0]); g.rect(4, 20, 5, 1, this.P.metal[3]);   // pomo
        g.finish('#14161a');
    },

    // ---------------------------------------------------------------- TACO DE BEISEBOL
    _bat(g) {
        const W = this.P.wood, cy = 20;
        for (let x = 6; x <= 74; x++) {
            const t = Math.max(0, Math.min(1, (x - 12) / 54)), s = t * t * (3 - 2 * t);
            let hw = 1.9 + 3.3 * s; if (x > 70) hw = Math.max(0, hw * Math.sqrt(Math.max(0, 1 - (x - 70) / 5)));
            for (let y = Math.ceil(cy - hw); y <= Math.floor(cy + hw); y++) {
                const r = (y - (cy - hw)) / Math.max(1, 2 * hw);
                g.px(x, y, r < 0.28 ? W[0] : (r < 0.62 ? W[1] : (r < 0.86 ? W[2] : W[3])));
            }
        }
        g.rect(3, 17, 3, 7, W[2]); g.rect(3, 17, 3, 1, W[1]);                                                      // pomo
        g.rect(8, 18, 16, 5, '#4a4d55'); g.rect(8, 18, 16, 1, '#6a6e78'); g.rect(8, 22, 16, 1, '#2a2c32'); for (let x = 10; x <= 22; x += 4) g.rect(x, 19, 1, 3, '#3a3d44');       // fita do cabo
        for (const [x, y] of [[34, 18], [40, 21], [47, 18], [54, 22], [60, 17], [64, 21], [68, 19], [52, 17], [44, 22]]) g.px(x, y, W[2]);   // veios
        g.finish('#2a1608');
    },

    // ---------------------------------------------------------------- REVÓLVER
    _revolver(g) {
        const M = this.P.metal, W = this.P.wood;
        g.poly([[18, 21], [31, 21], [29, 36], [14, 34]], W);                                                      // cabo de madeira
        g.rectH(20, 10, 16, 11, M);                                                                              // armação
        g.rectH(36, 8, 11, 13, [M[0], M[1], M[2], M[3]]);                                                         // tambor
        for (const x of [38, 41, 44]) g.rect(x, 9, 1, 11, M[3]);                                                  // estrias do tambor
        g.rectH(47, 10, 24, 6, M);                                                                                // cano
        g.rect(47, 8, 24, 2, M[1]); g.rect(47, 8, 24, 1, M[0]);                                                   // quebra-vento (rib)
        g.rect(68, 6, 2, 3, M[3]);                                                                                // massa de mira
        g.rect(47, 16, 14, 3, M[2]);                                                                              // vareta extratora
        g.poly([[22, 10], [27, 5], [30, 7], [27, 12]], M);                                                        // cão
        for (const [x, y] of [[31, 21], [32, 22], [33, 23], [34, 24], [35, 24], [36, 24], [37, 23], [38, 22], [38, 21]]) g.px(x, y, M[3]);                    // guarda-mato
        g.rect(33, 21, 1, 3, M[2]);
        for (let y = 23; y < 34; y += 2) for (let x = 16; x < 29; x++) if (g.get(x, y) === W[1] && x % 2 === 0) g.px(x, y, W[2]);                           // veios
        g.px(21, 27, M[0]); g.px(21, 28, M[3]);                                                                    // parafuso
        g.finish('#101216');
    },

    // ---------------------------------------------------------------- ESCOPETA (pump)
    _shotgun(g) {
        const M = this.P.metal, W = this.P.wood;
        g.poly([[2, 14], [26, 13], [27, 24], [10, 30], [2, 27]], W);                                              // coronha
        g.rectH(26, 10, 14, 10, M);                                                                              // receptor
        g.rect(30, 12, 8, 3, M[3]);
        g.rectH(40, 10, 32, 3, [M[0], M[0], M[1], M[2]]);                                                         // cano
        g.rectH(40, 14, 28, 3, M);                                                                               // tubo do carregador
        g.rect(71, 8, 2, 3, '#e8e8e8');                                                                           // massa de mira
        g.rectH(46, 16, 16, 5, W);                                                                               // pump de madeira
        for (let x = 48; x < 62; x += 3) g.rect(x, 17, 1, 3, W[3]);
        for (const [x, y] of [[32, 20], [33, 21], [34, 22], [35, 23], [36, 23], [37, 23], [38, 22], [38, 21]]) g.px(x, y, M[3]);                              // guarda-mato
        for (let y = 14; y < 29; y++) for (let x = 3; x < 26; x++) if (g.get(x, y) === W[1] && (y * 3 + x) % 6 === 0) g.px(x, y, W[2]);
        g.finish('#101216');
    },

    // ---------------------------------------------------------------- FUZIL de assalto (mesmo desenho do AK: "fuzil" da referência)
    _rifle(g) { this._ak47(g); },
};

// ----------------------------------------------------------------------------- grade de pixels
WeaponArt.Grid = class {
    constructor(w, h) { this.w = w; this.h = h; this.d = new Array(w * h).fill(null); }
    get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.d[y * this.w + x]; }
    px(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c; }
    rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
    line(x0, y0, x1, y1, c) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let i = 0; i <= n; i++) this.px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c); }
    thick(pts, c) { for (let i = 1; i < pts.length; i++) { this.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], c); this.line(pts[i - 1][0] + 1, pts[i - 1][1], pts[i][0] + 1, pts[i][1], c); } }
    // retângulo sombreado na vertical com a paleta [claro, base, escuro, mais escuro]: 1 linha clara, miolo base, 2 linhas escuras
    rectH(x, y, w, h, P) {
        for (let j = 0; j < h; j++) {
            const c = j === 0 ? P[0] : (j >= h - 1 ? P[3] : (j >= h - 3 && h > 5 ? P[2] : P[1]));
            for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
        }
    }
    // polígono preenchido com sombreado simples: luz de cima/esquerda (paleta como acima)
    poly(pts, P) {
        let y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9;
        for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); }
        for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
            const xs = [];
            for (let i = 0; i < pts.length; i++) {
                const a = pts[i], b = pts[(i + 1) % pts.length];
                if ((a[1] <= y + 0.5 && b[1] > y + 0.5) || (b[1] <= y + 0.5 && a[1] > y + 0.5)) xs.push(a[0] + (y + 0.5 - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
            }
            xs.sort((m, n) => m - n);
            for (let k = 0; k + 1 < xs.length; k += 2) {
                const xa = Math.round(xs[k]), xb = Math.round(xs[k + 1]) - 1;
                for (let x = xa; x <= xb; x++) {
                    const rx = (x - xa) / Math.max(1, xb - xa), ry = (y - y0) / Math.max(1, y1 - y0);
                    this.px(x, y, rx < 0.14 || ry < 0.1 ? P[0] : (rx > 0.84 || ry > 0.86 ? P[2] : P[1]));
                }
            }
        }
    }
    // cápsula (segmento grosso com pontas redondas), sombreada pela luz de cima/esquerda
    cap(ax, ay, bx, by, r, P) {
        const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
        for (let y = Math.floor(Math.min(ay, by) - r - 1); y <= Math.ceil(Math.max(ay, by) + r + 1); y++) for (let x = Math.floor(Math.min(ax, bx) - r - 1); x <= Math.ceil(Math.max(ax, bx) + r + 1); x++) {
            let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = Math.max(0, Math.min(1, t));
            const cx = ax + dx * t, cy = ay + dy * t, d = hypot(x - cx, y - cy);
            if (d > r) continue;
            const lx = (x - cx) * -0.7 + (y - cy) * -0.7, k = lx / r;        // >0: lado da luz
            this.px(x, y, k > 0.35 ? P[0] : (k < -0.45 ? P[2] : P[1]));
        }
    }
    // contorno escuro de 1 px em volta de tudo que foi desenhado
    finish(color) {
        const add = [];
        for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
            if (this.d[y * this.w + x]) continue;
            if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push(y * this.w + x);
        }
        for (const i of add) this.d[i] = color;
    }
    render() {
        const c = document.createElement('canvas'); c.width = this.w; c.height = this.h;
        const x = c.getContext('2d');
        for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) { const col = this.d[j * this.w + i]; if (col) { x.fillStyle = col; x.fillRect(i, j, 1, 1); } }
        return c;
    }
};

// ----------------------------------------------------------------------------- versão vetorial em HD (interface moderna)
// Mesma API da Grid, mas cada primitiva vira um caminho suave do Canvas 2D em escala `k`, com gradiente da paleta
// [claro, base, escuro, mais escuro], brilho no topo e contorno arredondado — o visual de um emoji. Os detalhes de textura
// pixel a pixel (que leem `get`) simplesmente não aparecem.
WeaponArt.VGrid = class {
    constructor(w, h, k) { this.w = w; this.h = h; this.k = k; this.ops = []; this.outline = '#101216'; }
    get() { return null; }
    px(x, y, c) { this.ops.push(['dot', x, y, c]); }
    rect(x, y, w, h, c) { this.ops.push(['rect', x, y, w, h, c]); }
    line(x0, y0, x1, y1, c) { this.ops.push(['line', [[x0, y0], [x1, y1]], 1, c]); }
    thick(pts, c) { this.ops.push(['line', pts, 2.2, c]); }
    rectH(x, y, w, h, P) { this.ops.push(['rectH', x, y, w, h, P]); }
    poly(pts, P) { this.ops.push(['poly', pts, P]); }
    cap(ax, ay, bx, by, r, P) { this.ops.push(['cap', ax, ay, bx, by, r, P]); }
    finish(color) { this.outline = color; }
    _grad(x, y0, y1, P) {
        const g = x.createLinearGradient(0, y0, 0, y1);
        g.addColorStop(0, P[0]); g.addColorStop(0.28, P[1]); g.addColorStop(0.78, P[2] || P[1]); g.addColorStop(1, P[3] || P[2] || P[1]);
        return g;
    }
    render() {
        const k = this.k, W = this.w * k, H = this.h * k, pad = 3 * k;
        const body = document.createElement('canvas'); body.width = W; body.height = H;
        const x = body.getContext('2d');
        x.scale(k, k); x.lineJoin = 'round'; x.lineCap = 'round';
        for (const o of this.ops) {
            const t = o[0];
            if (t === 'poly') {
                const pts = o[1]; let y0 = 1e9, y1 = -1e9;
                for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
                x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath();
                x.fillStyle = this._grad(x, y0, y1 + 1, o[2]); x.fill();
                x.strokeStyle = o[2][1]; x.lineWidth = 0.6; x.stroke();
            } else if (t === 'rectH') {
                const [, rx, ry, rw, rh, P] = o;
                x.beginPath(); x.roundRect(rx, ry, rw, rh, Math.min(rh, rw) * 0.28);
                x.fillStyle = this._grad(x, ry, ry + rh, P); x.fill();
            } else if (t === 'cap') {
                const [, ax, ay, bx, by, r, P] = o;
                x.strokeStyle = P[2]; x.lineWidth = r * 2; x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
                x.strokeStyle = P[1]; x.lineWidth = r * 1.55; x.beginPath(); x.moveTo(ax - 0.3, ay - 0.3); x.lineTo(bx - 0.3, by - 0.3); x.stroke();
                x.strokeStyle = P[0]; x.lineWidth = r * 0.55; x.beginPath(); x.moveTo(ax - r * 0.4, ay - r * 0.35); x.lineTo(bx - r * 0.4, by - r * 0.35); x.stroke();
            } else if (t === 'rect') {
                const [, rx, ry, rw, rh, c] = o;
                x.fillStyle = c; x.beginPath(); x.roundRect(rx, ry, rw, rh, Math.min(rw, rh) * 0.35); x.fill();
            } else if (t === 'line') {
                const [, pts, lw, c] = o;
                x.strokeStyle = c; x.lineWidth = lw; x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0] + 0.5, p[1] + 0.5) : x.moveTo(p[0] + 0.5, p[1] + 0.5))); x.stroke();
            } else if (t === 'dot') {
                x.fillStyle = o[3]; x.beginPath(); x.arc(o[1] + 0.5, o[2] + 0.5, 0.75, 0, Math.PI * 2); x.fill();
            }
        }
        // brilho suave na metade de cima (o "vidrado" dos emojis)
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.globalCompositeOperation = 'source-atop';
        const gl = x.createLinearGradient(0, 0, 0, H); gl.addColorStop(0, 'rgba(255,255,255,0.22)'); gl.addColorStop(0.45, 'rgba(255,255,255,0.04)'); gl.addColorStop(1, 'rgba(0,0,0,0.12)');
        x.fillStyle = gl; x.fillRect(0, 0, W, H);
        x.globalCompositeOperation = 'source-over';
        // contorno arredondado: a silhueta dilatada, pintada na cor do contorno, por trás
        const out = document.createElement('canvas'); out.width = W + pad * 2; out.height = H + pad * 2;
        const o = out.getContext('2d'), r = 1.1 * k;
        for (let a = 0; a < 16; a++) o.drawImage(body, pad + Math.cos(a / 16 * Math.PI * 2) * r, pad + Math.sin(a / 16 * Math.PI * 2) * r);
        o.globalCompositeOperation = 'source-in'; o.fillStyle = this.outline; o.fillRect(0, 0, out.width, out.height);
        o.globalCompositeOperation = 'source-over'; o.drawImage(body, pad, pad);
        // recorta de volta para W×H (mantém o 2:1 e o encaixe dos ícones antigos)
        const fin = document.createElement('canvas'); fin.width = W; fin.height = H;
        fin.getContext('2d').drawImage(out, 0, 0, out.width, out.height, 0, 0, W, H);
        return fin;
    }
};
