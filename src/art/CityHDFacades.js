// ============================================================================
// CityHDFacades — as FACHADAS em alta definição (ver art/CityHD.js) e a LUZ das janelas à noite.
//
// Cada estilo de TileFactory.facadeStyles vira um par de ladrilhos de 120 px da arte (6 u = 2 baias × 2 andares):
//   • diffuse: a parede de dia — tijolo com argamassa, reboco, enxaimel, pedra, chapa, concreto ou pele de vidro — com as janelas
//     no mesmo lugar da pixel art (vidro refletindo o céu, caixilho, peitoril, verga, venezianas, floreiras);
//   • luz: o que se vê de cada janela com a luz da sala ACESA (todas acesas: abajur e cortina, persiana, luminária de escritório,
//     a luz que vaza na parede em volta). Quem decide qual janela está acesa, a cada hora, é o render/WindowLights.js: cada janela
//     ocupa sozinha uma célula da grade GRID do estilo (colunas × andares do ladrilho), e o sorteio é por célula.
// As vitrines das lojas (TileFactory.SHOPS: atlas 5 × 4 de 120 × 72 px) ganham letreiro com o nome escrito, vitrine e porta de vidro.
// ============================================================================

Object.assign(CityHD, {
    // Grade de janelas por tipo de fachada: [colunas, andares] no ladrilho. Cada janela fica dentro de UMA célula.
    GRID: { office: [4, 2], brick: [4, 2], house: [4, 2], timber: [4, 2], stone: [2, 2], metal: [2, 2], concrete: [2, 2] },
    // Quem mora atrás: 'office' (escritório e galpão: acende cedo, apaga depois do expediente) ou 'home' (casa: noite adentro).
    OCC: { office: 'office', metal: 'office' },

    // Fachada → { diffuse, emissive, grid, occ } (texturas já na placa).
    facade(scene, key) {
        const t0 = performance.now(), st = TileFactory.facadeStyles[key], seed = CityHD.seedOf('facade', [key]);
        const d = new CityTile(120, 120, this.Q, seed), e = new CityTile(120, 120, this.Q, seed);
        d.p_facade(key, e);
        const out = { diffuse: d.toTexture(scene, 'facade_' + key), emissive: e.toTexture(scene, 'win_' + key), grid: this.GRID[st.kind] || [2, 2], occ: this.OCC[st.kind] || 'home' };
        this.lastMs += performance.now() - t0;
        return out;
    },
    // Atlas das lojas → { diffuse, emissive }.
    shopAtlas(scene) {
        const t0 = performance.now(), CW = 120, CH = 72, COLS = 5, ROWS = 4;
        const d = new CityTile(CW * COLS, CH * ROWS, this.Q, 500), e = new CityTile(CW * COLS, CH * ROWS, this.Q, 500);
        d.p_shops(e, CW, CH, COLS);
        const out = { diffuse: d.toTexture(scene, 'shops', { wrap: false }), emissive: e.toTexture(scene, 'shops_e', { wrap: false }), cols: COLS, rows: ROWS };
        this.lastMs += performance.now() - t0;
        return out;
    },
});

Object.assign(CityTile.prototype, {
    // Pinta a fachada `key` neste ladrilho (de dia) e a luz das janelas no ladrilho `e`.
    p_facade(key, e) {
        const st = TileFactory.facadeStyles[key];
        this.E = e; e.g.fillStyle = '#000'; e.g.fillRect(0, 0, 120, 120);
        this.rng = Pixel.rng(this.seed);
        this.win = 0;
        const G = CityHD.GRID[st.kind] || [2, 2]; this.cellW = 120 / G[0]; this.cellH = 120 / G[1];
        const f = this['_fac_' + st.kind] || this._fac_concrete;
        f.call(this, st);
        this.grain(0.18, this.seed + 9, 0, 'soft-light');
    },

    // ---------------------------------------------------------------- vidro (de dia) e a sala acesa (à noite)
    // Vidro refletindo o céu: degradê, reflexo diagonal e a sombra da verga no alto. `A`/`B` = cores do vidro.
    _glass(x, y, w, h, A, B, o = {}) {
        const g = this.g, a = HDK.C(A), b = HDK.C(B);
        g.fillStyle = this.lin(x, y, x + w * 0.4, y + h, [[0, HDK.mix(b, [255, 255, 255], 0.15)], [0.45, HDK.mix(a, b, 0.45)], [1, HDK.t(a, 0.7)]]); g.fillRect(x, y, w, h);
        // o fundo da sala aparecendo (mais escuro embaixo) e, às vezes, a cortina atrás do vidro
        g.fillStyle = this.lin(0, y, 0, y + h, [[0, [10, 14, 22], 0], [1, [10, 14, 22], 0.35]]); g.fillRect(x, y, w, h);
        if (o.curtain) { const c = HDK.C(o.curtain); g.fillStyle = HDK.css(HDK.t(c, 0.7), 0.45); g.fillRect(x, y, Math.min(w * 0.28, 5), h); g.fillRect(x + w - Math.min(w * 0.28, 5), y, Math.min(w * 0.28, 5), h); }
        // reflexos diagonais do céu
        g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
        const step = o.step || 16;
        for (let s = -h; s < w + h; s += step) {
            g.fillStyle = 'rgba(255,255,255,0.2)'; g.beginPath(); g.moveTo(x + s, y); g.lineTo(x + s + 3, y); g.lineTo(x + s + 3 - h * 0.8, y + h); g.lineTo(x + s - h * 0.8, y + h); g.fill();
            g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.moveTo(x + s + 4.5, y); g.lineTo(x + s + 6, y); g.lineTo(x + s + 6 - h * 0.8, y + h); g.lineTo(x + s + 4.5 - h * 0.8, y + h); g.fill();
        }
        g.fillStyle = this.lin(0, y, 0, y + Math.min(4, h * 0.3), [[0, [0, 0, 0], 0.4], [1, [0, 0, 0], 0]]); g.fillRect(x, y, w, Math.min(4, h * 0.3));
        g.restore();
    },
    // A sala acesa atrás da janela (no ladrilho de luz). kind: 'home' | 'office' | 'shed'. Cada janela sorteia o que tem dentro.
    _room(x, y, w, h, kind = 'home') {
        const E = this.E, g = E.g, i = this.win++, v = Pixel.hash(i, 7, this.seed), v2 = Pixel.hash(i, 11, this.seed);
        g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
        if (kind === 'office') {
            // luz fria de luminária: forro claro, faixas das luminárias, divisórias e monitores embaixo
            g.fillStyle = E.lin(0, y, 0, y + h, [[0, [236, 244, 255]], [0.5, [196, 214, 236]], [1, [120, 140, 168]]]); g.fillRect(x, y, w, h);
            for (let lx = x + 3 + v * 4; lx < x + w - 2; lx += 9) E.fillRR(lx, y + 1.5, 6, 1.4, 0.5, 'rgba(255,255,255,0.95)');
            if (v2 < 0.5) for (let py = y + 1; py < y + h * (0.35 + v * 0.3); py += 1.6) E.line(x, py, x + w, py, 'rgba(60,70,90,0.35)', 0.45);       // persiana meio baixada
            for (let k = 0; k < Math.floor(w / 8); k++) {
                const dx = x + 2 + k * 8 + v2 * 3, dy = y + h - 5;
                E.fillRR(dx, dy, 6, 5.5, 0.5, 'rgba(40,50,66,0.75)');
                if (Pixel.hash(i, k, this.seed + 5) < 0.6) E.fillRR(dx + 1.2, dy - 2.4, 3.4, 2.4, 0.3, 'rgba(150,210,255,0.95)');
            }
        } else if (kind === 'shed') {
            g.fillStyle = E.lin(0, y, 0, y + h, [[0, [255, 236, 190]], [1, [210, 170, 110]]]); g.fillRect(x, y, w, h);
            for (let lx = x + 4 + v * 6; lx < x + w; lx += 14) { g.fillStyle = E.rad(lx, y + h * 0.4, 0, 7, [[0, [255, 255, 240], 1], [1, [255, 255, 240], 0]]); g.fillRect(lx - 7, y, 14, h); }
        } else {
            // casa: abajur/lustre (mancha quente), parede da sala, e a cortina, a persiana ou o vulto de um móvel
            const warm = v < 0.62 ? [255, 196, 112] : v < 0.85 ? [255, 222, 168] : [255, 168, 92];
            g.fillStyle = E.lin(0, y, 0, y + h, [[0, HDK.t(warm, 0.75)], [0.35, warm], [1, HDK.t(warm, 0.55)]]); g.fillRect(x, y, w, h);
            const lx = x + w * (0.3 + v2 * 0.4), ly = y + h * (0.25 + v * 0.3);
            g.fillStyle = E.rad(lx, ly, 0, Math.max(w, h) * 0.6, [[0, [255, 250, 225], 0.9], [0.4, [255, 236, 190], 0.35], [1, [255, 236, 190], 0]]); g.fillRect(x, y, w, h);
            const style = Math.floor(v2 * 4);
            const cc = [[178, 56, 48], [48, 120, 130], [200, 170, 120], [120, 70, 140], [60, 110, 60]][Math.floor(v * 5)];
            if (style === 0) {                                   // cortinas abertas dos lados, com pregas
                const cw = w * 0.26;
                for (const cx of [x, x + w - cw]) {
                    g.fillStyle = HDK.css(HDK.t(cc, 0.8), 0.92); g.fillRect(cx, y, cw, h);
                    for (let px = cx + 0.8; px < cx + cw; px += 1.6) E.line(px, y, px, y + h, 'rgba(255,230,190,0.25)', 0.5);
                }
                g.fillStyle = HDK.css(HDK.t(cc, 0.6)); g.fillRect(x, y, w, 2.2);
            } else if (style === 1) {                            // persiana de PVC
                for (let py = y + 0.8; py < y + h; py += 1.5) E.line(x, py, x + w, py, 'rgba(90,60,30,0.4)', 0.5);
            } else if (style === 2) {                            // cortina fina (voal) fechada
                g.fillStyle = 'rgba(255,245,230,0.35)'; g.fillRect(x, y, w, h);
                for (let px = x + 1; px < x + w; px += 2.2) E.line(px, y, px, y + h, 'rgba(160,120,80,0.18)', 0.7);
            } else {                                             // vulto: planta no peitoril ou o encosto do sofá
                if (v < 0.5) { for (let l = 0; l < 6; l++) { const a = -Math.PI / 2 + (l - 2.5) * 0.4; E.ell(x + w * 0.75 + Math.cos(a) * 2.5, y + h - 4 + Math.sin(a) * 3, 2.2, 0.9, 'rgba(40,40,20,0.8)', g, a); } E.fillRR(x + w * 0.75 - 1.6, y + h - 3, 3.2, 3, 0.4, 'rgba(60,30,20,0.85)'); }
                else E.fillRR(x - 1, y + h * 0.7, w + 2, h * 0.4, 1.5, 'rgba(70,40,30,0.7)');
            }
        }
        g.restore();
        // luz que vaza na parede em volta (fica dentro da célula da janela)
        g.save(); g.globalCompositeOperation = 'lighter';
        if (this.cellW) { const cw = this.cellW, ch = this.cellH, c0 = Math.floor((x + w / 2) / cw) * cw, r0 = Math.floor((y + h / 2) / ch) * ch; g.beginPath(); g.rect(c0 + 0.5, r0 + 0.5, cw - 1, ch - 1); g.clip(); }
        const cx = x + w / 2, cy = y + h / 2, R = Math.max(w, h) * 0.5 + 3;
        g.translate(cx, cy); g.scale((w / 2 + 3) / R, (h / 2 + 3) / R);
        g.fillStyle = E.rad(0, 0, R * 0.7, R * 1.12, [[0, kind === 'office' ? [70, 80, 96] : [96, 70, 36], 0.55], [1, [0, 0, 0], 0]]);
        g.fillRect(-R * 1.2, -R * 1.2, R * 2.4, R * 2.4);
        g.restore();
    },
    // Caixilho escuro por cima da sala acesa (o mesmo desenho do de dia).
    _frameE(lines, lw = 0.9) { const g = this.E.g; g.beginPath(); for (const [x0, y0, x1, y1] of lines) { g.moveTo(x0, y0); g.lineTo(x1, y1); } g.strokeStyle = 'rgba(8,6,4,0.95)'; g.lineWidth = lw; g.stroke(); },
    // Peitoril de pedra com sombra embaixo.
    _sill(x, y, w, col) {
        const c = HDK.C(col);
        this.soft(x + 0.6, y + 1.6, w, 2.4, 0.45, 1.6, 0.6);
        this.fillRR(x, y, w, 2.6, 0.6, this.lin(0, y, 0, y + 2.6, [[0, HDK.t(c, 1.08)], [0.4, c], [1, HDK.t(c, 0.72)]]));
        this.line(x + 0.6, y + 0.4, x + w - 0.6, y + 0.4, 'rgba(255,255,255,0.45)', 0.4);
    },
    // Escorrido de sujeira embaixo do peitoril.
    _drip(x, y, w, h = 9) {
        const g = this.g;
        for (let k = 0; k < 3; k++) { const px = x + w * (0.15 + k * 0.33) + this.r(-1, 1), L = h * this.r(0.5, 1); g.fillStyle = this.lin(0, y, 0, y + L, [[0, [40, 34, 30], 0.18], [1, [40, 34, 30], 0]]); g.fillRect(px - 1.2, y, 2.4, L); }
    },

    // ---------------------------------------------------------------- pele de vidro (escritórios, hospital)
    _fac_office(st) {
        const g = this.g, frame = HDK.C(st.frame), span = HDK.C(st.span);
        for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) {
            const ox = cx * 60, oy = cy * 60, gx = ox + 4, gy = oy + 6, gw = 52, gh = 36;
            // montantes de alumínio (moldura) com luz de um lado
            g.fillStyle = this.lin(ox, oy, ox + 60, oy + 60, [[0, HDK.t(frame, 1.15)], [1, HDK.t(frame, 0.85)]]); g.fillRect(ox, oy, 60, 60);
            for (const px of [ox + 0.8, ox + 59.2]) this.line(px, oy, px, oy + 46, 'rgba(255,255,255,0.18)', 0.5);
            // dois vãos de vidro (cada um sozinho numa célula de 30 px) com a travessa no terço de cima
            for (const [x0, x1] of [[gx, gx + 25], [gx + 27, gx + 52]]) {
                this._glass(x0, gy, x1 - x0, gh, st.glassA, st.glassB, { step: 18 });
                this._room(x0, gy, x1 - x0, gh, 'office');
                this.line(x0, gy + 17, x1, gy + 17, HDK.css(frame), 1.1); this.line(x0, gy + 17.7, x1, gy + 17.7, 'rgba(255,255,255,0.25)', 0.35);
                this._frameE([[x0, gy + 17, x1, gy + 17]], 1.1);
            }
            this.line(gx + 26, gy, gx + 26, gy + gh, HDK.css(HDK.t(frame, 0.8)), 2);
            this.line(gx + 25.4, gy, gx + 25.4, gy + gh, 'rgba(255,255,255,0.22)', 0.4);
            this.strokeRR(gx - 0.4, gy - 0.4, gw + 0.8, gh + 0.8, 0.4, HDK.css(HDK.t(frame, 0.6)), 0.8);
            // peitoril (spandrel) de vidro opaco com a luz no topo e a laje escura embaixo
            g.fillStyle = this.lin(0, oy + 46, 0, oy + 59, [[0, HDK.t(span, 1.25)], [0.15, span], [1, HDK.t(span, 0.8)]]); g.fillRect(ox, oy + 46, 60, 13);
            for (let s = -14; s < 60; s += 18) { g.fillStyle = 'rgba(255,255,255,0.07)'; g.beginPath(); g.moveTo(ox + s, oy + 46); g.lineTo(ox + s + 4, oy + 46); g.lineTo(ox + s - 6, oy + 59); g.lineTo(ox + s - 10, oy + 59); g.fill(); }
            this.line(ox, oy + 46.4, ox + 60, oy + 46.4, 'rgba(255,255,255,0.3)', 0.5);
            g.fillStyle = 'rgb(10,14,20)'; g.fillRect(ox, oy + 59, 60, 1);
        }
    },

    // ---------------------------------------------------------------- tijolo aparente
    _fac_brick(st) {
        const g = this.g, cols = st.brick.map(HDK.C), mortar = HDK.C(st.mortar), trim = HDK.C(st.trim), seed = this.seed;
        g.fillStyle = HDK.css(mortar); g.fillRect(0, 0, 120, 120);
        // tijolos (8 × 4 com junta de 1): cada um num tom, com a aresta de cima clara e a de baixo escura
        for (let row = 0; row < 30; row++) {
            const off = (row % 2) * 4, y = row * 4;
            for (let k = -1; k < 16; k++) {
                const x = k * 8 - off, base = HDK.t(Pixel.pick(cols, Pixel.hash(k + (row % 2) * 40, row, seed)), 0.92 + Pixel.hash(k, row, seed + 3) * 0.16);
                this.wrap(x, y, x + 8, y + 4, () => {
                    this.fillRR(x + 0.2, y + 0.2, 7.2, 3.2, 0.5, this.lin(0, y, 0, y + 3.4, [[0, HDK.mix(base, [255, 230, 200], 0.16)], [0.35, base], [1, HDK.t(base, 0.82)]]));
                });
            }
        }
        this.grain(0.4, seed, 0.03);
        this.clouds(0.3, 16, seed + 1, 'soft-light', 2);
        // janelas: moldura clara, vidro, cruzeta, peitoril e verga
        for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) for (const wx of [9, 35]) {
            const x = cx * 60 + wx, y = cy * 60 + 12, w = 16, h = 26;
            this.fillRR(x - 2.4, y - 5, w + 4.8, 3, 0.4, this.lin(0, y - 5, 0, y - 2, [[0, HDK.t(trim, 1.02)], [1, HDK.t(trim, 0.78)]]));        // verga
            this.soft(x - 1, y - 1, w + 2, h + 2, 0.35, 1.2, 0.4);
            this.fillRR(x - 1.2, y - 1.2, w + 2.4, h + 2.4, 0.4, HDK.css(trim));
            this._glass(x, y, w, h, '#27384d', '#5a7a9c', { step: 13, curtain: Pixel.hash(x, y, seed) < 0.4 ? '#c0503a' : null });
            this._room(x, y, w, h, 'home');
            const L = [[x, y + 12, x + w, y + 12], [x + 8, y, x + 8, y + h]];
            g.beginPath(); for (const [a, b, c, d] of L) { g.moveTo(a, b); g.lineTo(c, d); } g.strokeStyle = HDK.css(trim); g.lineWidth = 1; g.stroke();
            this._frameE(L, 1);
            g.fillStyle = this.lin(0, y, 0, y + 2, [[0, [0, 0, 0], 0.35], [1, [0, 0, 0], 0]]); g.fillRect(x, y, w, 2);
            this._sill(x - 3, y + h + 1, w + 6, trim);
            this._drip(x - 2, y + h + 4, w + 4, 6);
        }
        // linha do andar (cinta de concreto)
        for (const fy of [57, 117]) { g.fillStyle = this.lin(0, fy, 0, fy + 3, [[0, HDK.t(trim, 0.9)], [1, HDK.t(trim, 0.6)]]); g.fillRect(0, fy, 120, 3); this.line(0, fy + 0.3, 120, fy + 0.3, 'rgba(255,255,255,0.35)', 0.4); }
    },

    // ---------------------------------------------------------------- casa de reboco pintado com venezianas e floreira
    _fac_house(st) {
        const g = this.g, wall = HDK.C(st.wall), trim = HDK.C(st.trim), shut = HDK.C(st.shutter), seed = this.seed;
        this.base([HDK.t(wall, 0.95), wall, HDK.t(wall, 1.04)], 30, seed, 3);
        this.clouds(0.32, 10, seed + 1, 'soft-light', 3);
        this.grain(0.38, seed, 0.006);
        // marcas do tempo: umidade no pé de cada andar e manchas
        for (const fy of [58, 118]) { g.fillStyle = this.lin(0, fy - 9, 0, fy, [[0, [60, 50, 40], 0], [1, [60, 50, 40], 0.16]]); g.fillRect(0, fy - 9, 120, 9); }
        for (let k = 0; k < 4; k++) this.stain(this.r(0, 120), this.r(0, 120), this.r(4, 9), this.r(3, 7), HDK.t(wall, 0.6), 0.12);
        for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) for (const wx of [8, 36]) {
            const x = cx * 60 + wx, y = cy * 60 + 13, w = 16, h = 24;
            this.soft(x - 2, y - 1, w + 4, h + 3, 0.3, 1.4, 0.6);
            this.fillRR(x - 1.4, y - 1.4, w + 2.8, h + 2.8, 0.6, this.lin(x, y, x + w, y + h, [[0, HDK.t(trim, 1.02)], [1, HDK.t(trim, 0.86)]]));
            this._glass(x, y, w, h, '#35506b', '#7aa0c2', { step: 13 });
            this._room(x, y, w, h, 'home');
            const L = [[x, y + 11, x + w, y + 11], [x + 7.5, y, x + 7.5, y + h], [x + 8.5, y, x + 8.5, y + h]];
            g.beginPath(); for (const [a, b, c, d] of L) { g.moveTo(a, b); g.lineTo(c, d); } g.strokeStyle = HDK.css(trim); g.lineWidth = 0.9; g.stroke();
            this._frameE(L, 0.9);
            // venezianas abertas (palhetas com sombra) dos dois lados
            for (const sx of [x - 6.2, x + w + 1.2]) {
                this.soft(sx + 0.5, y - 0.6, 5, h + 2, 0.4, 1, 0.4);
                this.fillRR(sx, y - 1, 5, h + 2, 0.4, this.lin(sx, 0, sx + 5, 0, [[0, HDK.t(shut, 1.15)], [1, HDK.t(shut, 0.85)]]));
                for (let j = 1; j < h; j += 2.4) { this.line(sx + 0.6, y + j, sx + 4.4, y + j, HDK.css(HDK.t(shut, 0.55), 0.8), 0.5); this.line(sx + 0.6, y + j + 0.6, sx + 4.4, y + j + 0.6, HDK.css(HDK.t(shut, 1.3), 0.5), 0.3); }
            }
            // floreira de madeira com flores
            this.soft(x - 1.4, y + h + 2, w + 4, 4, 0.4, 1.4, 0.6);
            this.fillRR(x - 2, y + h + 1, w + 4, 4, 0.5, this.lin(0, y + h + 1, 0, y + h + 5, [[0, [150, 104, 66]], [1, [92, 60, 36]]]));
            for (let k = 0; k < 9; k++) { const fx = x - 1 + k * 2.1, fy = y + h + 0.6 + Pixel.hash(k, x, seed) * 0.8; this.circ(fx, fy, 1.2, '#3f7a34'); this.circ(fx + 0.2, fy - 0.6, 0.85, ['#e8456a', '#f2d34a', '#f08aa8', '#ffffff'][Math.floor(Pixel.hash(k, wx, seed) * 4)]); }
            this._drip(x, y + h + 5, w, 8);
        }
        for (const fy of [58, 118]) { g.fillStyle = this.lin(0, fy, 0, fy + 2, [[0, HDK.t(wall, 0.72)], [1, HDK.t(wall, 0.5)]]); g.fillRect(0, fy, 120, 2); }
    },

    // ---------------------------------------------------------------- enxaimel (chalé da serra)
    _fac_timber(st) {
        const g = this.g, wall = HDK.C(st.wall), beam = HDK.C(st.beam), seed = this.seed;
        this.base([HDK.t(wall, 0.95), wall, HDK.t(wall, 1.03)], 30, seed, 3);
        this.clouds(0.25, 10, seed + 1, 'soft-light', 3);
        this.grain(0.35, seed, 0.004);
        const bar = (x0, y0, x1, y1, wd) => {
            g.save(); g.translate(0.5, 0.7); this.line(x0, y0, x1, y1, 'rgba(30,20,10,0.35)', wd); g.restore();
            this.line(x0, y0, x1, y1, HDK.css(beam), wd);
            g.save(); g.translate(-wd * 0.3, -wd * 0.3); this.line(x0, y0, x1, y1, HDK.css(HDK.mix(beam, [255, 230, 200], 0.18), 0.6), wd * 0.25); g.restore();
        };
        for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) {
            const ox = cx * 60, oy = cy * 60;
            bar(ox + 3, oy + 6, ox + 27, oy + 55, 3); bar(ox + 56, oy + 6, ox + 32, oy + 55, 3);         // diagonais (mãos-francesas)
            bar(ox, oy + 2, ox + 60, oy + 2, 4); bar(ox, oy + 57.5, ox + 60, oy + 57.5, 5);
            bar(ox + 1.5, oy, ox + 1.5, oy + 60, 3); bar(ox + 30, oy, ox + 30, oy + 60, 4); bar(ox + 58.5, oy, ox + 58.5, oy + 60, 3);
            for (const wx of [8, 37]) {
                const x = ox + wx, y = oy + 18, w = 15, h = 18;
                this.fillRR(x - 1.4, y - 1.4, w + 2.8, h + 2.8, 0.4, HDK.css(beam));
                this._glass(x, y, w, h, st.glass, '#7aa0c2', { step: 12 });
                this._room(x, y, w, h, 'home');
                const L = [[x + 7.5, y, x + 7.5, y + h], [x, y + 8, x + w, y + 8]];
                g.beginPath(); for (const [a, b, c, d] of L) { g.moveTo(a, b); g.lineTo(c, d); } g.strokeStyle = HDK.css(beam); g.lineWidth = 1; g.stroke();
                this._frameE(L, 1);
                for (const sx of [x - 5.2, x + w + 1.2]) {                                              // venezianas de madeira
                    this.fillRR(sx, y - 1, 4, h + 2, 0.4, this.lin(sx, 0, sx + 4, 0, [[0, HDK.mix(beam, [255, 255, 255], 0.22)], [1, HDK.t(beam, 1.05)]]));
                    for (let j = 1; j < h; j += 2.2) this.line(sx + 0.5, y + j, sx + 3.5, y + j, 'rgba(20,10,4,0.45)', 0.45);
                }
                this.fillRR(x - 2, y + h + 1, w + 4, 3, 0.4, this.lin(0, y + h + 1, 0, y + h + 4, [[0, [110, 74, 44]], [1, [70, 44, 26]]]));
                for (let k = 0; k < 9; k++) { const fx = x - 1 + k * 2, fy = y + h + 0.5; this.circ(fx, fy, 1.1, '#3f6a30'); this.circ(fx + 0.2, fy - 0.5, 0.8, ['#d9455a', '#f2d34a', '#e86aa0', '#8a5ad0'][Math.floor(Pixel.hash(k, wx + cy, seed) * 4)]); }
            }
        }
    },

    // ---------------------------------------------------------------- casarão de pedra
    _fac_stone(st) {
        const g = this.g, cols = st.stone.map(HDK.C), mortar = HDK.C(st.mortar), trim = HDK.C(st.trim), seed = this.seed;
        g.fillStyle = HDK.css(mortar); g.fillRect(0, 0, 120, 120);
        for (let row = 0; row < 20; row++) {
            const y = row * 6, bw = 9 + (row % 3);
            let x = -Math.floor(Pixel.hash(row, 0, seed) * bw);
            for (let k = 0; x < 120; k++) {
                const w = bw + Math.floor(Pixel.hash(k, row, seed + 1) * 4) - 1, base = HDK.t(Pixel.pick(cols, Pixel.hash(k, row, seed)), 0.92 + Pixel.hash(k, row, seed + 4) * 0.16), x0 = x;
                this.wrap(x0, y, x0 + w, y + 6, () => {
                    this.fillRR(x0 + 0.4, y + 0.4, w - 0.8, 5.2, 1.4, this.rad(x0 + w * 0.35, y + 1.5, 0, w, [[0, HDK.t(base, 1.12)], [0.6, base], [1, HDK.t(base, 0.78)]]));
                });
                x += w;
            }
        }
        this.grain(0.45, seed, 0.02);
        this.clouds(0.3, 14, seed + 1, 'soft-light', 2);
        for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) {
            const ox = cx * 60, oy = cy * 60;
            g.fillStyle = this.lin(0, oy, 0, oy + 5, [[0, HDK.t(trim, 1.02)], [0.7, HDK.t(trim, 0.88)], [1, HDK.t(trim, 0.55)]]); g.fillRect(ox, oy, 60, 5);   // cornija
            this.line(ox, oy + 5.2, ox + 60, oy + 5.2, 'rgba(20,16,12,0.35)', 0.8);
            const x = ox + 10, y = oy + 12, w = 40, h = 30;
            this.soft(x - 2, y - 1.5, w + 4, h + 4, 0.35, 1.6, 0.6);
            this.fillRR(x - 2.4, y - 2.4, w + 4.8, h + 4.8, 0.6, this.lin(x, y, x + w, y + h, [[0, HDK.t(trim, 1.04)], [1, HDK.t(trim, 0.84)]]));
            this._glass(x, y, w, h, st.glass, '#8fb6d4', { step: 22 });
            this._room(x, y, w, h, 'home');
            const L = [[x + 13, y, x + 13, y + h], [x + 26.5, y, x + 26.5, y + h], [x, y + 10, x + w, y + 10]];
            g.beginPath(); for (const [a, b, c, d] of L) { g.moveTo(a, b); g.lineTo(c, d); } g.strokeStyle = HDK.css(trim); g.lineWidth = 1.2; g.stroke();
            this._frameE(L, 1.2);
            this._sill(x - 4, y + h + 2, w + 8, trim);
        }
    },

    // ---------------------------------------------------------------- galpão de chapa ondulada (também celeiro e madeira do campo)
    _fac_metal(st) {
        const g = this.g, a = HDK.C(st.a), b = HDK.C(st.b), hi = HDK.C(st.hi), seed = this.seed;
        for (let x = 0; x < 120; x += 6) { g.fillStyle = this.lin(x, 0, x + 6, 0, [[0, hi], [0.3, a], [0.7, b], [1, HDK.t(b, 0.85)]]); g.fillRect(x, 0, 6, 120); }
        this.clouds(0.3, 14, seed + 1, 'soft-light', 2);
        this.grain(0.25, seed, 0);
        for (let k = 0; k < 5; k++) { const x = this.r(0, 120), y = this.r(0, 60), L = this.r(10, 26); this.wrap(x - 2, y, x + 2, y + L, () => { g.fillStyle = this.lin(0, y, 0, y + L, [[0, [138, 90, 58], 0.55], [1, [138, 90, 58], 0]]); g.fillRect(x - 1, y, 2, L); }); }
        for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) {
            const ox = cx * 60, oy = cy * 60;
            // janela-fita no alto (vidro aramado), caixilho em 4
            this.soft(ox + 5.4, oy + 13.6, 49, 10.4, 0.4, 1.2, 0.4);
            this.fillRR(ox + 5, oy + 13, 50, 11, 0.4, '#4a5560');
            this._glass(ox + 6, oy + 14, 48, 9, '#27323d', '#7f93a5', { step: 14 });
            this._room(ox + 6, oy + 14, 48, 9, 'shed');
            const L = [18, 30, 42].map((vx) => [ox + vx, oy + 14, ox + vx, oy + 23]);
            g.beginPath(); for (const [p, q, r2, s] of L) { g.moveTo(p, q); g.lineTo(r2, s); } g.strokeStyle = '#51606e'; g.lineWidth = 1; g.stroke();
            this._frameE(L, 1);
            g.fillStyle = this.lin(0, oy + 57, 0, oy + 60, [[0, HDK.t(a, 0.7)], [1, HDK.t(a, 0.4)]]); g.fillRect(ox, oy + 57.5, 60, 2.5);
        }
    },

    // ---------------------------------------------------------------- concreto aparente com janela em fita
    _fac_concrete(st) {
        const g = this.g, wall = HDK.C(st.wall), seed = this.seed;
        this.base([HDK.t(wall, 0.94), wall, HDK.t(wall, 1.05)], 30, seed, 3);
        this.clouds(0.38, 10, seed + 1, 'soft-light', 3);
        this.grain(0.42, seed, 0.012);
        for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) {
            const ox = cx * 60, oy = cy * 60;
            // painéis: junta vertical, furos dos tirantes da fôrma e a laje embaixo
            this.line(ox + 0.4, oy, ox + 0.4, oy + 60, HDK.css(HDK.t(wall, 0.62)), 0.8);
            this.line(ox + 1.2, oy, ox + 1.2, oy + 60, 'rgba(255,255,255,0.22)', 0.4);
            for (const [px, py] of [[8, 4], [30, 4], [52, 4], [8, 42], [30, 42], [52, 42]]) { this.circ(ox + px, oy + py, 0.8, HDK.css(HDK.t(wall, 0.55))); this.circ(ox + px - 0.2, oy + py - 0.2, 0.35, HDK.css(HDK.t(wall, 0.4))); }
            this.soft(ox + 2.4, oy + 9.6, 56, 27, 0.35, 1.4, 0.4);
            this.fillRR(ox + 1.6, oy + 9.2, 56.8, 27.6, 0.4, HDK.css(HDK.t(wall, 0.5)));
            this._glass(ox + 2, oy + 10, 56, 26, st.glass, '#6f8aa6', { step: 20 });
            this._room(ox + 2, oy + 10, 56, 26, 'home');
            const L = [16, 30, 44].map((vx) => [ox + vx, oy + 10, ox + vx, oy + 36]);
            g.beginPath(); for (const [p, q, r2, s] of L) { g.moveTo(p, q); g.lineTo(r2, s); } g.strokeStyle = HDK.css(HDK.t(wall, 0.72)); g.lineWidth = 1.1; g.stroke();
            this._frameE(L, 1.1);
            this._sill(ox + 1, oy + 36.4, 58, HDK.t(wall, 1.05));
            this._drip(ox + 4, oy + 39, 52, 10);
            g.fillStyle = this.lin(0, oy + 57, 0, oy + 60, [[0, HDK.t(wall, 0.85)], [1, HDK.t(wall, 0.55)]]); g.fillRect(ox, oy + 57.5, 60, 2.5);
        }
    },

    // ---------------------------------------------------------------- vitrines das lojas (térreo do comércio)
    p_shops(e, CW, CH, COLS) {
        this.E = e; e.g.fillStyle = '#000'; e.g.fillRect(0, 0, e.w, e.h);
        const g = this.g, eg = e.g, H = HDK.C;
        TileFactory.SHOPS.forEach((S, i) => {
            const ox = (i % COLS) * CW, oy = Math.floor(i / COLS) * CH, r = Pixel.rng(500 + i * 37);
            const wall = H(S.wall), sign = H(S.sign), glass = H(S.glass);
            g.save(); g.beginPath(); g.rect(ox, oy, CW, CH); g.clip();
            eg.save(); eg.beginPath(); eg.rect(ox, oy, CW, CH); eg.clip();
            // parede com reboco e rodapé de granito
            g.fillStyle = this.lin(0, oy, 0, oy + CH, [[0, HDK.t(wall, 1.04)], [1, HDK.t(wall, 0.88)]]); g.fillRect(ox, oy, CW, CH);
            g.fillStyle = this.lin(0, oy + 62, 0, oy + 72, [[0, HDK.t(wall, 0.5)], [1, HDK.t(wall, 0.36)]]); g.fillRect(ox, oy + 62, CW, 10);
            this.line(ox, oy + 62.3, ox + CW, oy + 62.3, 'rgba(255,255,255,0.25)', 0.4);
            // letreiro: caixa de luz com borda, o ícone e o NOME escrito
            this.soft(ox + 1, oy + 1.5, CW - 2, 17, 0.45, 1.6, 0.8);
            this.fillRR(ox + 0.5, oy + 0.5, CW - 1, 16.5, 1, this.lin(0, oy, 0, oy + 17, [[0, HDK.mix(sign, [255, 255, 255], 0.3)], [0.15, sign], [1, HDK.t(sign, 0.7)]]));
            this.strokeRR(ox + 0.5, oy + 0.5, CW - 1, 16.5, 1, 'rgba(0,0,0,0.45)', 0.6);
            e.fillRR(ox + 1, oy + 1, CW - 2, 15.5, 1, HDK.css(HDK.mix(sign, [255, 255, 255], 0.2), 0.75));
            const name = S.name, fs0 = 9.5;
            g.font = `800 ${fs0}px Outfit, "Arial Black", Arial, sans-serif`;
            const avail = CW - 30, tw = g.measureText(name).width, fs = tw > avail ? fs0 * avail / tw : fs0;
            for (const [G, fill, shadow] of [[g, '#fbf8ee', 'rgba(0,0,0,0.5)'], [eg, '#fffdf0', null]]) {
                G.save(); G.font = `800 ${fs}px Outfit, "Arial Black", Arial, sans-serif`; G.textBaseline = 'middle'; G.textAlign = 'center';
                const tx = ox + 24 + avail / 2, ty = oy + 9;
                if (shadow) { G.fillStyle = shadow; G.fillText(name, tx + 0.5, ty + 0.6); }
                G.fillStyle = fill; G.fillText(name, tx, ty); G.restore();
            }
            this._shopIcon(S.icon, ox + 10, oy + 3.5, sign);
            e.circ(ox + 15, oy + 8.5, 6.2, HDK.css(HDK.mix(sign, [255, 255, 255], 0.45), 0.9));
            this._shopIcon.call(e, S.icon, ox + 10, oy + 3.5, sign);
            if (S.id === 'oficina') {
                // portão de enrolar com as lâminas e a luz da oficina escapando embaixo
                this.soft(ox + 13, oy + 21, 94, 42, 0.4, 1.5, 0.5);
                g.fillStyle = this.lin(0, oy + 22, 0, oy + 62, [[0, [178, 184, 190]], [1, [118, 124, 132]]]); g.fillRect(ox + 14, oy + 22, 92, 40);
                for (let y = oy + 24; y < oy + 62; y += 2.5) { this.line(ox + 14, y, ox + 106, y, 'rgba(70,74,82,0.6)', 0.5); this.line(ox + 14, y + 0.6, ox + 106, y + 0.6, 'rgba(255,255,255,0.35)', 0.35); }
                g.fillStyle = 'rgba(30,30,34,0.85)'; g.fillRect(ox + 14, oy + 58, 92, 4);
                e.g.fillStyle = 'rgba(255,184,102,0.9)'; e.g.fillRect(ox + 14, oy + 57.5, 92, 4.5);
                e.g.fillStyle = e.lin(0, oy + 62, 0, oy + 72, [[0, [255, 184, 102], 0.5], [1, [255, 184, 102], 0]]); e.g.fillRect(ox + 10, oy + 62, 100, 10);
            } else {
                // duas vitrines e a porta de vidro, com a mercadoria lá dentro
                for (const wx of [6, 76]) {
                    const x = ox + wx, y = oy + 22, w = 38, h = 36;
                    this.soft(x - 1, y - 0.5, w + 2, h + 2, 0.4, 1.4, 0.5);
                    this.fillRR(x - 1.2, y - 1.2, w + 2.4, h + 2.4, 0.5, '#2a2e34');
                    this._glass(x, y, w, h, HDK.t(glass, 0.8), HDK.mix(glass, [255, 255, 255], 0.4), { step: 16 });
                    e.g.fillStyle = e.lin(0, y, 0, y + h, [[0, [255, 236, 190]], [1, [230, 180, 110]]]); e.g.fillRect(x, y, w, h);
                    e.g.fillStyle = e.rad(x + w / 2, y + 4, 0, w * 0.7, [[0, [255, 255, 240], 0.9], [1, [255, 255, 240], 0]]); e.g.fillRect(x, y, w, h);
                    // prateleiras e produtos (de dia: vistos através do vidro; à noite: contra a luz)
                    for (let s = 0; s < 2; s++) {
                        const sy = y + 14 + s * 12;
                        g.fillStyle = 'rgba(30,30,34,0.35)'; g.fillRect(x + 1, sy + 5, w - 2, 1);
                        e.g.fillStyle = 'rgba(80,60,40,0.8)'; e.g.fillRect(x + 1, sy + 5, w - 2, 1);
                        for (let px = x + 2; px < x + w - 4; px += 4 + r() * 3) {
                            const pw = 2.4 + r() * 2.4, ph = 3 + r() * 2.5, c = H(['#c9453a', '#d9b050', '#2f86d0', '#e8e3d4', '#3fa34d', '#d46a9e'][Math.floor(r() * 6)]);
                            this.fillRR(px, sy + 5 - ph, pw, ph, 0.4, HDK.css(HDK.t(c, 0.8), 0.7));
                            e.fillRR(px, sy + 5 - ph, pw, ph, 0.4, HDK.css(HDK.t(c, 0.95)));
                        }
                    }
                    this.line(x - 1, y + h + 1.6, x + w + 1, y + h + 1.6, 'rgba(255,255,255,0.3)', 0.5);
                }
                const dx = ox + 50, dy = oy + 22;
                this.fillRR(dx, dy, 20, 50, 0.5, '#2a2e34');
                this._glass(dx + 2, dy + 2, 16, 46, HDK.t(glass, 0.6), HDK.mix(glass, [255, 255, 255], 0.3), { step: 14 });
                e.g.fillStyle = e.lin(0, dy, 0, dy + 48, [[0, [255, 200, 130], 0.85], [1, [255, 170, 90], 0.4]]); e.g.fillRect(dx + 2, dy + 2, 16, 46);
                this.fillRR(dx + 15.6, dy + 23, 1.4, 7, 0.6, this.lin(0, dy + 23, 0, dy + 30, [[0, [235, 238, 242]], [1, [150, 156, 164]]]));        // puxador
                e.fillRR(dx + 15.6, dy + 23, 1.4, 7, 0.6, 'rgba(0,0,0,0.9)');
            }
            g.restore(); eg.restore();
        });
        this.grain(0.15, this.seed + 9, 0, 'soft-light');
    },
    // Ícone do letreiro (no quadro 10 × 10 a partir de x, y). Chamado também com `this` = o ladrilho de luz.
    _shopIcon(icon, ix, iy, sign) {
        const W = '#ffffff', S = HDK.css(sign);
        const R = (x, y, w, h, c, r = 0.4) => this.fillRR(ix + x, iy + y, w, h, r, c);
        const D = (x, y, rr, c) => this.circ(ix + x, iy + y, rr, c);
        if (icon === 'cross') { R(3.2, 0, 3.6, 10, W); R(0, 3.2, 10, 3.6, W); }
        else if (icon === 'cup') { R(0.5, 1.5, 7.5, 7.5, '#f4f1e8', 1); R(7.8, 3, 2.2, 3.5, '#f4f1e8', 1); R(1.5, 2.5, 5.5, 2, S); }
        else if (icon === 'cart') { R(0, 1, 10, 1, W); R(1, 3, 8, 4, W, 0.6); D(2.2, 9, 1.1, W); D(7.8, 9, 1.1, W); }
        else if (icon === 'shirt') { R(2, 0, 6, 3, W); R(0, 2, 10, 3, W, 0.8); R(2, 4.5, 6, 5, W); }
        else if (icon === 'coin') { D(5, 5, 5, '#f5d44a'); D(5, 5, 3.4, '#c9a526'); }
        else if (icon === 'phone') { R(2, 0, 6, 10, '#1c1f26', 1); R(3, 1, 4, 7, '#5fd0f0'); }
        else if (icon === 'wrench') { R(0, 4, 10, 2, '#2a2a2e', 1); R(7, 1, 3, 8, '#2a2a2e', 1); }
        else if (icon === 'gun') { R(0, 2, 10, 3, '#f4f1e8', 0.6); R(1, 4.5, 3, 4.5, '#f4f1e8', 0.6); }
        else if (icon === 'pizza') { D(5, 5, 5, '#f0c860'); D(4, 4, 1, '#c0392b'); D(7, 7, 1, '#c0392b'); D(3, 7, 0.8, '#3f8a3a'); }
        else if (icon === 'leaf') { D(5, 5, 5, '#e8f4d0'); this.ell(ix + 5, iy + 5, 2.2, 4, '#3fa34d', this.g, 0.5); }
        else if (icon === 'fork') { R(1, 0, 1, 9, W); R(4, 0, 1, 9, W); R(7, 0, 2, 9, W); R(0, 0, 9, 3, W); }
        else if (icon === 'fish') { this.ell(ix + 4, iy + 5, 4, 2.6, W); R(7, 3, 3, 4, W); }
        else if (icon === 'smoke') { D(5, 5, 4, '#9a9a9a'); D(5, 4, 2, '#c9c9c9'); }
        else if (icon === 'dumbbell') { R(0, 2, 2, 6, W); R(2, 3, 1, 4, W); R(3, 4, 4, 2, W); R(7, 3, 1, 4, W); R(8, 2, 2, 6, W); }
    },
});

// ============================================================================
// O barraco do protagonista por fora (world/HouseView.js; antes as texturas de pixel art do HouseArt): bloco de tijolo com o
// reboco caído, zinco ondulado, tábua pintada, porta, janela e o telhado de zinco com pneus, pedras e a caixa-d'água. Mesmos
// tamanhos e o mesmo desenho do HouseArt.
// ============================================================================
Object.assign(CityHD, {
    SIZE: Object.assign(CityHD.SIZE, { hsBrick: [64, 64], hsZinc: [64, 64], hsPlank: [64, 64], hsDoor: [44, 44], hsWindow: [40, 24] }),
    // Textura `name` (brick, zinc, plank, door, window, roof) do barraco.
    house(scene, name, wrap = true) {
        const t0 = performance.now(), key = 'hs' + name[0].toUpperCase() + name.slice(1);
        if (name === 'roof') this.SIZE.hsRoof = [Math.round((SafeHouse.W + 1) * 20), Math.round((SafeHouse.D + 0.45) * 20)];
        const tex = this.paint(key).toTexture(scene, key, { wrap, aniso: wrap ? this.aniso : 4 });
        this.release();
        this.lastMs += performance.now() - t0;
        return tex;
    },
});

Object.assign(CityTile.prototype, {
    p_hsBrick() {
        const g = this.g, r = Pixel.rng(311), cols = ['#a4513a', '#b25e41', '#97452f', '#b96a48', '#a85a3c'].map(HDK.C);
        g.fillStyle = '#6a4636'; g.fillRect(0, 0, 64, 64);
        for (let row = 0; row < 8; row++) {
            const off = (row % 2) * 8;
            for (let b = -1; b < 5; b++) {
                const x = b * 16 + off, y = row * 8, col = cols[Math.floor(r() * cols.length)];
                this.wrap(x, y, x + 16, y + 8, () => this.fillRR(x + 0.7, y + 0.7, 14.6, 6.6, 1, this.lin(0, y, 0, y + 8, [[0, HDK.t(col, 1.18)], [0.3, col], [1, HDK.t(col, 0.76)]])));
            }
        }
        this.grain(0.45, 3, 0.03);
        this.clouds(0.3, 16, this.seed + 1, 'soft-light', 2);
        // reboco desbotado que sobrou em pedaços (borda irregular e sombra da espessura)
        for (const [px, py, w, h] of [[6, 10, 22, 14], [40, 36, 20, 16], [0, 48, 14, 10]]) {
            const pts = [], n = 18;
            for (let k = 0; k < n; k++) {
                const t = k / n, side = Math.floor(t * 4), f = (t * 4) % 1, j = (Pixel.hash(px + k, py, 5) - 0.5) * 3;
                const p = side === 0 ? [px + f * w, py + j] : side === 1 ? [px + w + j, py + f * h] : side === 2 ? [px + w - f * w, py + h + j] : [px + j, py + h - f * h];
                pts.push(p);
            }
            pts.push(pts[0], pts[1]);
            this.wrap(px - 3, py - 3, px + w + 3, py + h + 3, () => {
                g.save(); g.translate(0.5, 0.6); this.curve(pts); g.fillStyle = 'rgba(40,24,16,0.4)'; g.fill(); g.restore();
                this.curve(pts); g.fillStyle = this.lin(px, py, px + w, py + h, [[0, [214, 198, 166]], [1, [184, 168, 138]]]); g.fill();
            });
        }
        this.grain(0.3, 4, 0.01, 'soft-light');
    },
    p_hsZinc() {
        const g = this.g, r = Pixel.rng(77);
        for (let x = 0; x < 64; x += 6.4) { g.fillStyle = this.lin(x, 0, x + 6.4, 0, [[0, [127, 134, 139]], [0.3, [182, 189, 193]], [0.5, [200, 207, 211]], [0.75, [152, 160, 165]], [1, [127, 134, 139]]]); g.fillRect(x, 0, 6.4, 64); }
        for (let s = 0; s <= 64; s += 16) { this.line(s, 0, s, 64, 'rgba(70,76,82,0.9)', 0.8); this.line(s + 0.8, 0, s + 0.8, 64, 'rgba(255,255,255,0.35)', 0.35); }
        this.clouds(0.3, 16, this.seed + 1, 'soft-light', 2);
        for (let k = 0; k < 14; k++) {
            const x = r() * 64, y = r() * 40, L = 6 + r() * 22;
            this.wrap(x - 2, y, x + 2, y + L, () => { g.fillStyle = this.lin(0, y, 0, y + L, [[0, [150, 92, 50], 0.75], [1, [150, 92, 50], 0]]); g.fillRect(x - 0.7, y, 1.4, L); });
            this.stain(x, y, 1.6, 1.2, [120, 70, 36], 0.6);
        }
        for (let s = 0; s < 4; s++) for (const y of [6, 38]) { this.circ(s * 16 + 3, y, 0.5, '#3e4348'); this.circ(s * 16 + 11, y + 1, 0.5, '#3e4348'); }
        this.grain(0.25, 5, 0);
    },
    p_hsPlank() {
        const g = this.g, r = Pixel.rng(509), cols = ['#6d8a82', '#7b9a90', '#648178', '#85a399'].map(HDK.C), ph = 64 / 6;
        for (let k = 0; k < 6; k++) {
            const y = k * ph, col = cols[Math.floor(r() * cols.length)];
            g.fillStyle = this.lin(0, y, 0, y + ph, [[0, HDK.t(col, 1.15)], [0.2, col], [1, HDK.t(col, 0.8)]]); g.fillRect(0, y, 64, ph);
            for (let n = 0; n < 5; n++) { const yy = y + 2 + r() * (ph - 4), x = r() * 50; this.line(x, yy, x + 8 + r() * 16, yy + (r() - 0.5) * 0.6, HDK.css(HDK.t(col, 0.6), 0.6), 0.35); }   // veio
            for (let n = 0; n < 4; n++) { const x = r() * 60, yy = y + 1.5 + r() * (ph - 4); this.ell(x, yy, 1.2 + r() * 1.6, 0.6 + r() * 0.5, 'rgba(190,172,136,0.85)'); }      // tinta descascada
            const nx = 4 + r() * 20; this.circ(nx, y + ph / 2, 0.55, '#2e3835'); this.circ(nx + 30, y + ph / 2 + 0.5, 0.55, '#2e3835');           // pregos
            this.line(0, y + ph - 0.4, 64, y + ph - 0.4, '#33413e', 0.9);
        }
        this.grain(0.35, 3, 0.01);
    },
    p_hsDoor() {
        const g = this.g, r = Pixel.rng(41);
        g.fillStyle = '#1e5f66'; g.fillRect(0, 0, 44, 44);
        for (let p = 0; p < 8; p++) { const x = 2 + p * 5, c = HDK.C(p % 2 ? '#2f8f94' : '#34999e'); g.fillStyle = this.lin(x, 0, x + 5, 0, [[0, HDK.t(c, 1.25)], [0.3, c], [1, HDK.t(c, 0.72)]]); g.fillRect(x, 2, 5, 40); }
        for (const y of [19, 33]) { this.soft(2, y + 0.5, 40, 2.2, 0.4, 1, 0.3); g.fillStyle = this.lin(0, y, 0, y + 2.2, [[0, [60, 140, 146]], [1, [26, 77, 82]]]); g.fillRect(2, y, 40, 2.2); }
        g.fillStyle = '#3a2a1c'; g.fillRect(0, 0, 44, 2); g.fillRect(0, 42, 44, 2); g.fillRect(0, 0, 2, 44); g.fillRect(42, 0, 2, 44);
        this.line(2, 2.3, 42, 2.3, 'rgba(0,0,0,0.4)', 0.6);
        for (let n = 0; n < 26; n++) this.ell(3 + r() * 38, 3 + r() * 38, 0.5 + r() * 1.1, 0.3 + r() * 0.6, n % 3 ? 'rgba(138,106,68,0.9)' : 'rgba(205,185,138,0.9)');   // lascas de tinta
        this.soft(34.4, 24.6, 3, 6, 0.5, 0.8, 0.8);
        this.fillRR(34, 24, 3, 6, 1, this.lin(34, 24, 37, 30, [[0, [255, 240, 168]], [0.4, [232, 194, 74]], [1, [122, 90, 26]]]));          // maçaneta
        this.grain(0.3, 2, 0.01);
    },
    p_hsWindow() {
        const g = this.g;
        g.fillStyle = this.lin(0, 0, 0, 24, [[0, [122, 90, 58]], [1, [58, 42, 28]]]); g.fillRect(0, 0, 40, 24);
        for (const x of [2, 21]) { this._glass(x, 2, 17, 20, '#1d3550', '#4a74a0', { step: 12 }); }
        this.fillRR(2, 2, 6, 10, 0.8, this.lin(2, 2, 8, 12, [[0, [232, 140, 116]], [1, [176, 96, 76]]]));                                  // cortina de pano
        for (let x = 3; x < 8; x += 1.2) this.line(x, 2, x, 12, 'rgba(120,50,40,0.4)', 0.4);
        this.circ(4, 6, 0.4, '#f2c8b4'); this.circ(6, 9, 0.4, '#f2c8b4');
        g.fillStyle = '#6a4e34'; g.fillRect(19, 0, 2, 24); g.fillStyle = '#3a2a1c'; g.fillRect(0, 11, 40, 1);
        this.line(0, 0.4, 40, 0.4, 'rgba(255,220,180,0.4)', 0.6); this.line(0, 23.5, 40, 23.5, 'rgba(20,12,6,0.9)', 1);
    },
    p_hsRoof() {
        const g = this.g, W = this.w, H = this.h, r = Pixel.rng(2718);
        for (let x = 0; x < W; x += 6) { g.fillStyle = this.lin(x, 0, x + 6, 0, [[0, [123, 130, 135]], [0.3, [168, 175, 180]], [0.5, [190, 197, 201]], [0.78, [146, 154, 159]], [1, [123, 130, 135]]]); g.fillRect(x, 0, 6, H); }
        for (let s = 0; s * 40 < W; s++) { const x = s * 40; this.line(x, 0, x, H, 'rgba(70,76,80,0.9)', 0.9); this.line(x + 0.9, 0, x + 0.9, H, 'rgba(255,255,255,0.3)', 0.4); }
        this.clouds(0.35, 20, this.seed + 1, 'soft-light', 3);
        for (let k = 0; k < 26; k++) {
            const x = r() * W, y = r() * H, L = 6 + r() * 26;
            g.fillStyle = this.lin(0, y, 0, y + L, [[0, [150, 92, 50], 0.7], [1, [150, 92, 50], 0]]); g.fillRect(x - 0.8, y, 1.6, L);
            this.stain(x, y, 2, 1.5, [120, 70, 36], 0.55);
        }
        const px = W * 0.58, py = H * 0.3;                                                                                                  // chapa remendada (ferrugem)
        this.soft(px + 1, py + 1.2, 26, 16, 0.5, 1.4, 0.8);
        this.fillRR(px, py, 26, 16, 0.8, this.lin(px, py, px + 26, py + 16, [[0, [192, 128, 80]], [0.5, [160, 104, 62]], [1, [106, 68, 38]]]));
        for (const f of [0.3, 0.7]) {                                                                                                       // ripas por cima
            const y = H * f; this.soft(0, y + 1, W, 3, 0.45, 1.2, 0.3);
            g.fillStyle = this.lin(0, y, 0, y + 3, [[0, [138, 106, 68]], [1, [86, 62, 40]]]); g.fillRect(0, y, W, 3);
        }
        for (const [fx, fy] of [[0.1, 0.15], [0.48, 0.12], [0.2, 0.82], [0.8, 0.85]]) {                                                     // pneus
            const cx = W * fx, cy = H * fy;
            this.softEll(cx + 2, cy + 2.4, 9, 9, 0.55, 3);
            this.circ(cx, cy, 9, this.rad(cx - 2, cy - 2, 0, 10, [[0, [64, 66, 72]], [1, [18, 19, 22]]]));
            this.circ(cx, cy, 4.6, this.rad(cx - 1, cy - 1, 0, 5, [[0, [52, 54, 60]], [1, [12, 13, 16]]]));
            g.save(); g.translate(cx, cy); for (let t = 0; t < 22; t++) { g.rotate(Math.PI / 11); this.line(5.6, 0, 8.6, 0, 'rgba(0,0,0,0.5)', 0.45); } g.restore();
        }
        for (const [fx, fy] of [[0.35, 0.5], [0.66, 0.6], [0.9, 0.35], [0.08, 0.5]]) this.pebble(W * fx, H * fy, 4 + r() * 3, ['#8a857a', '#6f6b63', '#9a958a'][Math.floor(r() * 3)], r() * 3);
        this._tank(W - 26, 24, '#2f6ab0', 16);
        g.beginPath(); g.moveTo(0, H - 30); g.quadraticCurveTo(W * 0.25, H * 0.62, W * 0.45, H * 0.5); g.quadraticCurveTo(W * 0.72, H * 0.4, W, H * 0.42);      // o "gato" da luz
        g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.4; g.stroke(); g.strokeStyle = '#1a1a1e'; g.lineWidth = 0.7; g.stroke();
        g.strokeStyle = '#4a3a2a'; g.lineWidth = 2.4; g.strokeRect(1.2, 1.2, W - 2.4, H - 2.4);
        this.grain(0.25, 1, 0.01);
    },
});
