// ============================================================================
// CityHDRoofs — os TELHADOS em alta definição (ver art/CityHD.js). Ladrilho de 160 px da arte = 8 u, um por estilo de
// TileFactory.roofStyles, com as mesmas peças no mesmo lugar: manta asfáltica e laje (emendas, brita, ar-condicionado, respiros),
// telha colonial (fiadas com sombra e cumeeira), chapa com junta em pé e claraboia, zinco ondulado (ferrugem, pneus e pedras
// segurando, caixa-d'água), lona esticada (rugas, cordas, pedras), laje crua (ferro de espera, varal, parabólica), laje pintada do
// Mirante (vasos, mesas com ombrelone e varal de lâmpadas nas de festa) e telhado verde.
// ============================================================================

Object.assign(CityTile.prototype, {
    p_roof(key) {
        const st = TileFactory.roofStyles[key], seed = this.seed;
        this.rng = Pixel.rng(key.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
        const f = this['_roof_' + st.kind];
        if (f) f.call(this, st, seed);
        else this.base(['#888', '#999'], 20, seed);
    },

    // ---------------------------------------------------------------- manta asfáltica e laje de concreto
    _roof_tar(st, seed) { this._roofFlat(st, seed, false); },
    _roof_concrete(st, seed) { this._roofFlat(st, seed, true); },
    _roofFlat(st, seed, conc) {
        const g = this.g, r = this.rng, b0 = HDK.C(st.base[0]);
        this.base(st.base, 40, seed, 3);
        this.clouds(0.2, 8, seed + 1, 'soft-light', 3);
        this.grain(conc ? 0.45 : 0.55, seed, conc ? 0.01 : 0.03);                  // brita da manta / poro do concreto
        // emendas: manta em faixas de 2 u (sobreposição com a borda clara e a sombra), laje em placas de 2 u
        for (let i = 0; i < 160; i += 40) {
            this.line(i + 0.4, 0, i + 0.4, 160, HDK.css(HDK.t(b0, 0.62), 0.9), 0.8);
            this.line(i + 1.2, 0, i + 1.2, 160, HDK.css(HDK.t(b0, 1.45), conc ? 0.35 : 0.22), 0.5);
            g.fillStyle = this.lin(i + 1, 0, i + 5, 0, [[0, [10, 10, 12], 0.16], [1, [10, 10, 12], 0]]); g.fillRect(i + 1, 0, 4, 160);
            if (conc) { this.line(0, i + 0.4, 160, i + 0.4, HDK.css(HDK.t(b0, 0.62), 0.9), 0.8); this.line(0, i + 1.2, 160, i + 1.2, HDK.css(HDK.t(b0, 1.45), 0.35), 0.5); }
        }
        // poças secas e marcas de água (escorrem para o ralo)
        for (let k = 0; k < 5; k++) this.stain(r() * 160, r() * 160, 6 + r() * 12, 4 + r() * 8, HDK.t(b0, 0.5), 0.2);
        if (!st.clean) {
            this._ac(14 + Math.floor(r() * 20), 18 + Math.floor(r() * 20));
            if (conc) this._ac(92 + Math.floor(r() * 16), 96 + Math.floor(r() * 16));
            this._vent(120 + Math.floor(r() * 20), 30 + Math.floor(r() * 20));
            this._vent(40 + Math.floor(r() * 20), 120 + Math.floor(r() * 20));
            this._vent(130, 130);
            this._drain(150, 150);
        } else {
            for (let k = 0; k < 3; k++) this.stain(r() * 160, r() * 160, 10 + r() * 14, 8 + r() * 10, [255, 255, 255], 0.06);
        }
    },
    // Ar-condicionado visto de cima (38 × 28): caixa com quina, grade do ventilador com as pás, aletas e o cano de cobre.
    _ac(x, y) {
        const g = this.g, w = 38, h = 28;
        this.soft(x + 2.5, y + 3, w, h, 0.5, 3.5, 2);
        this.fillRR(x, y, w, h, 2, this.lin(x, y, x + w, y + h, [[0, [236, 239, 241]], [0.5, [206, 211, 215]], [1, [168, 174, 180]]]));
        this.strokeRR(x, y, w, h, 2, 'rgba(70,76,84,0.9)', 0.55);
        this.line(x + 2, y + 1.2, x + w - 2, y + 1.2, 'rgba(255,255,255,0.8)', 0.5);
        // aletas do trocador (lado direito)
        for (let i = 0; i < 6; i++) this.line(x + 24, y + 5 + i * 3.6, x + 34, y + 5 + i * 3.6, 'rgba(110,118,126,0.85)', 0.55);
        // ventilador: aro, grade e pás
        const cx = x + 12, cy = y + 14;
        this.circ(cx, cy, 9, this.rad(cx - 2, cy - 2, 0, 10, [[0, [96, 102, 110]], [1, [52, 56, 62]]]));
        this.circ(cx, cy, 7.6, '#2a2e34');
        g.save(); g.translate(cx, cy);
        for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(0.8, 0); g.quadraticCurveTo(5, -3.4, 6.8, -0.4); g.quadraticCurveTo(4.2, 1.2, 0.8, 0.8); g.fillStyle = '#5a6068'; g.fill(); }
        g.restore();
        this.circ(cx, cy, 1.4, '#9aa0a8');
        g.beginPath(); for (let k = -6; k <= 6; k += 2) { const L = Math.sqrt(Math.max(0, 7.6 * 7.6 - k * k)); g.moveTo(cx - L, cy + k); g.lineTo(cx + L, cy + k); }
        g.strokeStyle = 'rgba(200,205,210,0.45)'; g.lineWidth = 0.28; g.stroke();
        // cano de cobre e o dreno
        g.beginPath(); g.moveTo(x + w, y + 20); g.quadraticCurveTo(x + w + 6, y + 21, x + w + 7, y + 30); g.strokeStyle = '#b06a3a'; g.lineWidth = 1.1; g.stroke();
        g.beginPath(); g.moveTo(x + w, y + 20); g.quadraticCurveTo(x + w + 6, y + 21, x + w + 7, y + 30); g.strokeStyle = 'rgba(255,210,170,0.5)'; g.lineWidth = 0.35; g.stroke();
        this.stain(x + w / 2, y + h + 4, 6, 3, [20, 24, 30], 0.18);
    },
    // Respiro (chapéu chinês) visto de cima.
    _vent(x, y) {
        this.softEll(x + 1.4, y + 1.6, 5.2, 5, 0.5, 2.2);
        this.circ(x, y, 5.2, this.rad(x - 1.6, y - 1.6, 0, 6, [[0, [210, 214, 218]], [0.7, [140, 146, 152]], [1, [96, 102, 108]]]));
        this.circ(x, y, 3.2, this.rad(x - 1, y - 1, 0, 3.4, [[0, [120, 126, 132]], [1, [70, 74, 80]]]));
        this.circ(x, y, 0.8, '#2e3238');
        this.g.beginPath(); this.g.arc(x, y, 4.3, Math.PI * 1.05, Math.PI * 1.6); this.g.strokeStyle = 'rgba(255,255,255,0.6)'; this.g.lineWidth = 0.45; this.g.stroke();
    },
    // Ralo: grelha redonda com a mancha escura em volta.
    _drain(x, y) {
        this.stain(x, y, 6, 6, [20, 20, 22], 0.25);
        this.circ(x, y, 2.6, '#3a3d42'); this.circ(x, y, 2.1, '#1c1e22');
        this.g.beginPath(); for (let k = -1.4; k <= 1.4; k += 0.7) { this.g.moveTo(x - 2, y + k); this.g.lineTo(x + 2, y + k); } this.g.strokeStyle = '#6a6e74'; this.g.lineWidth = 0.3; this.g.stroke();
    },
    // Caixa-d'água de fibra vista de cima (tampa com nervuras, brilho e sombra).
    _tank(x, y, color, R = 13) {
        const c = HDK.C(color), g = this.g;
        this.softEll(x + 3, y + 3.4, R + 0.5, R, 0.55, 4);
        this.circ(x, y, R, this.rad(x - R * 0.3, y - R * 0.3, 0, R * 1.3, [[0, HDK.t(c, 1.25)], [0.7, c], [1, HDK.t(c, 0.6)]]));
        this.circ(x, y, R * 0.8, this.rad(x - R * 0.25, y - R * 0.25, 0, R, [[0, HDK.t(c, 1.35)], [1, HDK.t(c, 0.85)]]));
        g.save(); g.translate(x, y);
        for (let k = 0; k < 12; k++) { g.rotate(Math.PI / 6); this.line(R * 0.28, 0, R * 0.78, 0, HDK.css(HDK.t(c, 0.75), 0.55), 0.35); }
        g.restore();
        this.circ(x, y, R * 0.24, HDK.css(HDK.t(c, 1.1)));
        this.circ(x, y, R * 0.24 - 0.5, HDK.css(HDK.t(c, 0.92)));
        g.beginPath(); g.arc(x, y, R * 0.9, Math.PI * 1.08, Math.PI * 1.55); g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 0.8; g.stroke();
    },

    // ---------------------------------------------------------------- telha colonial: fiadas de 8 px, peças de 14 px, cumeeira no meio
    _roof_tile(st, seed) {
        const g = this.g, cols = st.colors.map(HDK.C);
        g.fillStyle = HDK.css(HDK.t(cols[0], 0.45)); g.fillRect(0, 0, 160, 160);
        for (let row = 0; row < 20; row++) {
            const off = (row % 2) * 7, y = row * 8, south = row >= 10;
            for (let k = -1; k < 12; k++) {
                const x = k * 14 - off, base = HDK.t(Pixel.pick(cols, Pixel.hash(k + (row % 2) * 31, row, seed)), (0.92 + Pixel.hash(k, row, seed + 3) * 0.16) * (south ? 0.93 : 1));
                this.wrap(x - 1, y - 2, x + 15, y + 10, () => {
                    // telha: canal (barriga) com luz no meio, sombra nas laterais, lábio claro embaixo (a fiada de baixo encosta nele)
                    g.fillStyle = this.lin(x, 0, x + 14, 0, [[0, HDK.t(base, 0.62)], [0.3, HDK.t(base, 1.12)], [0.55, HDK.t(base, 1.02)], [1, HDK.t(base, 0.66)]]);
                    this.rr(x + 0.3, y - 0.6, 13.4, 8.8, 2.2); g.fill();
                    g.fillStyle = this.lin(0, y, 0, y + 8, [[0, [0, 0, 0], 0], [0.7, [0, 0, 0], 0], [1, [30, 10, 6], 0.32]]); g.fill();
                    this.line(x + 2.4, y + (south ? 7.3 : 0.4), x + 11.6, y + (south ? 7.3 : 0.4), HDK.css(HDK.t(base, 1.35), 0.5), 0.5);
                });
            }
            // sombra que a fiada de cima/baixo projeta (cada fiada sobrepõe a do lado da cumeeira)
            g.fillStyle = south ? this.lin(0, y, 0, y + 2.4, [[0, [30, 10, 6], 0.45], [1, [30, 10, 6], 0]]) : this.lin(0, y + 8, 0, y + 5.6, [[0, [30, 10, 6], 0.45], [1, [30, 10, 6], 0]]);
            g.fillRect(0, south ? y : y + 5.6, 160, 2.4);
        }
        this.clouds(0.38, 12, seed + 1, 'soft-light', 3);
        this.grain(0.3, seed, 0.01);
        // limo e sujeira (manchas escuras esverdeadas), mais perto da cumeeira e nas pontas
        const r = this.rng;
        for (let k = 0; k < 7; k++) this.stain(r() * 160, r() * 160, 6 + r() * 12, 4 + r() * 7, [50, 60, 30], 0.16);
        // cumeeira: fileira de capas com argamassa
        const rc = HDK.t(cols[0], 1.05);
        g.fillStyle = 'rgba(30,10,6,0.3)'; g.fillRect(0, 80.6, 160, 1.2);
        g.fillStyle = this.lin(0, 77.5, 0, 81, [[0, HDK.t(rc, 1.18)], [0.5, rc], [1, HDK.t(rc, 0.8)]]); g.fillRect(0, 77.6, 160, 3.2);
        for (let x = 0; x < 160; x += 11) this.line(x, 77.6, x, 80.8, 'rgba(70,30,20,0.35)', 0.45);
        this.line(0, 78, 160, 78, 'rgba(255,225,200,0.3)', 0.45);
    },

    // ---------------------------------------------------------------- chapa com junta em pé (galpão, garagem)
    _roof_metal(st, seed) {
        const g = this.g, a = HDK.C(st.a), b = HDK.C(st.b), hi = HDK.C(st.hi);
        for (let x = 0; x < 160; x += 10) {
            g.fillStyle = this.lin(x, 0, x + 10, 0, [[0, hi], [0.2, a], [0.55, HDK.mix(a, b, 0.5)], [0.92, b], [1, HDK.t(b, 0.7)]]); g.fillRect(x, 0, 10, 160);
            this.line(x + 0.6, 0, x + 0.6, 160, HDK.css(HDK.t(hi, 1.15), 0.9), 0.6);
            this.line(x + 1.5, 0, x + 1.5, 160, 'rgba(20,24,30,0.35)', 0.4);
        }
        this.clouds(0.32, 16, seed + 1, 'soft-light', 3);
        this.grain(0.18, seed, 0);
        g.save(); g.globalAlpha = 0.07; for (let y = 0; y < 160; y += 40) this.line(0, y, 160, y, '#000', 0.6); g.restore();      // emendas das chapas
        // parafusos ao longo das juntas
        for (let x = 0; x < 160; x += 10) for (let y = 6; y < 160; y += 26) this.circ(x + 1, y, 0.35, 'rgba(230,234,238,0.7)');
        // claraboia: placa translúcida com reflexo e o caixilho
        const sx = 100, sy = 24, sw = 40, sh = 30;
        this.soft(sx + 1.5, sy + 2, sw, sh, 0.45, 2.5, 1);
        this.fillRR(sx, sy, sw, sh, 1, this.lin(sx, sy, sx + sw, sy + sh, [[0, [214, 238, 248]], [0.45, [127, 179, 207]], [1, [56, 98, 128]]]));
        for (let i = 1; i < 4; i++) this.line(sx + i * 10, sy, sx + i * 10, sy + sh, 'rgba(40,70,92,0.55)', 0.6);
        g.save(); this.rr(sx, sy, sw, sh, 1); g.clip(); g.fillStyle = 'rgba(255,255,255,0.28)'; g.beginPath(); g.moveTo(sx + 4, sy); g.lineTo(sx + 14, sy); g.lineTo(sx + 2, sy + sh); g.lineTo(sx - 8, sy + sh); g.fill(); g.restore();
        this.strokeRR(sx, sy, sw, sh, 1, 'rgba(60,70,80,0.9)', 0.8);
        this._vent(30, 110);
        const r = this.rng;
        for (let k = 0; k < 4; k++) this.stain(r() * 160, r() * 160, 8 + r() * 10, 5 + r() * 8, HDK.t(b, 0.55), 0.16);
    },

    // ---------------------------------------------------------------- zinco ondulado da favela
    _roof_zinc(st, seed) {
        const g = this.g, a = HDK.C(st.a), b = HDK.C(st.b), hi = HDK.C(st.hi), r = this.rng;
        // ondas a cada 6 px: crista clara, vale escuro
        for (let x = 0; x < 160; x += 6) {
            g.fillStyle = this.lin(x, 0, x + 6, 0, [[0, HDK.t(b, 0.82)], [0.25, a], [0.5, hi], [0.75, a], [1, HDK.t(b, 0.82)]]); g.fillRect(x, 0, 6, 160);
        }
        // chapas: cada uma num tom (e uma mais nova, mais clara), emendas com a borda sobreposta
        for (let k = 0; k < 4; k++) {
            const y0 = -2 + k * 40, t = 0.88 + r() * 0.2;
            g.fillStyle = t > 1 ? `rgba(255,255,255,${((t - 1) * 1.4).toFixed(2)})` : `rgba(0,0,0,${((1 - t) * 1.2).toFixed(2)})`; g.fillRect(0, y0, 160, 40);
            g.fillStyle = this.lin(0, 38 + k * 40, 0, 41 + k * 40, [[0, [255, 255, 255], 0.25], [0.35, [20, 20, 25], 0.55], [1, [20, 20, 25], 0]]); g.fillRect(0, 38 + k * 40, 160, 3);
        }
        this.clouds(0.4, 14, seed + 1, 'soft-light', 3);
        this.grain(0.22, seed, 0);
        // ferrugem: manchas alaranjadas que escorrem nas ondas (morro abaixo = para baixo na textura)
        for (let k = 0; k < 9; k++) {
            const cx = r() * 160, cy = r() * 160, rad = 4 + r() * 9;
            this.stain(cx, cy, rad, rad * 0.8, [140, 70, 34], 0.45);
            this.stain(cx, cy, rad * 0.5, rad * 0.4, [96, 44, 22], 0.4);
            for (let s = 0; s < 3; s++) { const x = cx + (r() - 0.5) * rad, L = 6 + r() * 14; this.wrap(x - 2, cy, x + 2, cy + L, () => { g.fillStyle = this.lin(0, cy, 0, cy + L, [[0, [130, 64, 30], 0.4], [1, [130, 64, 30], 0]]); g.fillRect(x - 0.8, cy, 1.6, L); }); }
        }
        // pregos com arruela nas cristas, em fileiras
        for (let y = 4; y < 160; y += 40) for (let x = 3; x < 160; x += 12) this.circ(x, y, 0.45, 'rgba(60,60,64,0.8)');
        // pneus e pedras segurando a telha
        for (let k = 0; k < 6; k++) {
            const cx = 10 + r() * 140, cy = 10 + r() * 140;
            if (k % 2) { this.softEll(cx + 1.4, cy + 1.6, 4.4, 4.2, 0.55, 2); this.circ(cx, cy, 4.4, this.rad(cx - 1, cy - 1, 0, 5, [[0, [70, 70, 74]], [1, [26, 26, 30]]])); this.circ(cx, cy, 2.1, HDK.css(a)); this.circ(cx, cy, 2.1, 'rgba(0,0,0,0.35)'); g.save(); g.translate(cx, cy); for (let t = 0; t < 14; t++) { g.rotate(Math.PI / 7); this.line(2.6, 0, 4.2, 0, 'rgba(10,10,12,0.6)', 0.35); } g.restore(); }
            else this.pebble(cx, cy, 2.6 + r() * 1.6, ['#8d8a84', '#a19c92', '#6f6c68'][k % 3], r() * 3);
        }
        if (r() < 0.6) this._tank(100 + Math.floor(r() * 30), 28 + Math.floor(r() * 30), r() < 0.5 ? '#3f78b5' : '#c9ccd0');
    },

    // ---------------------------------------------------------------- lona colorida esticada
    _roof_tarp(st, seed) {
        const g = this.g, c = HDK.C(st.base), r = this.rng;
        this.base([HDK.t(c, 0.82), HDK.t(c, 0.94), c, HDK.t(c, 1.08)], 30, seed, 2);
        // rugas: dobras diagonais macias (luz de um lado, sombra do outro)
        for (let k = 0; k < 16; k++) {
            const x = r() * 160, y = r() * 160, len = 20 + r() * 40, a = 0.4 + (r() - 0.5) * 0.5;
            const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
            this.wrap(Math.min(x, ex) - 4, Math.min(y, ey) - 4, Math.max(x, ex) + 4, Math.max(y, ey) + 4, () => {
                g.save(); g.filter = `blur(${(1.4 * this.Q).toFixed(1)}px)`;
                this.line(x, y, ex, ey, 'rgba(255,255,255,0.2)', 3);
                this.line(x + 2, y + 2.4, ex + 2, ey + 2.4, 'rgba(10,10,30,0.26)', 3);
                g.restore();
            });
        }
        this.grain(0.28, seed, 0);
        // trama da lona (xadrez fininho)
        g.save(); g.globalAlpha = 0.06; g.beginPath(); for (let i = 0; i < 160; i += 1.5) { g.moveTo(i, 0); g.lineTo(i, 160); g.moveTo(0, i); g.lineTo(160, i); } g.strokeStyle = '#000'; g.lineWidth = 0.2; g.stroke(); g.restore();
        // cordas e ilhoses
        for (let i = 0; i < 160; i += 40) {
            g.fillStyle = 'rgba(20,14,10,0.3)'; g.fillRect(i + 0.6, 0, 1.6, 160);
            g.fillStyle = this.lin(i - 0.8, 0, i + 0.8, 0, [[0, [150, 130, 90]], [0.5, [220, 202, 160]], [1, [140, 120, 84]]]); g.fillRect(i - 0.8, 0, 1.6, 160);
            g.beginPath(); for (let y = 0; y < 160; y += 1.6) { g.moveTo(i - 0.8, y); g.lineTo(i + 0.8, y + 1.1); } g.strokeStyle = 'rgba(90,70,40,0.45)'; g.lineWidth = 0.25; g.stroke();
        }
        for (let k = 0; k < 7; k++) this.pebble(8 + r() * 144, 8 + r() * 144, 3 + r() * 1.5, ['#7d7d80', '#9c9ca0', '#8a857c'][k % 3], r() * 3);
    },

    // ---------------------------------------------------------------- laje crua da favela
    _roof_slab(st, seed) {
        const g = this.g, r = this.rng;
        this.base(st.base, 34, seed, 3);
        this.clouds(0.28, 8, seed + 1, 'soft-light', 3);
        this.grain(0.5, seed, 0.015);
        for (let k = 0; k < 10; k++) this.stain(r() * 160, r() * 160, 5 + r() * 10, 4 + r() * 8, [80, 76, 70], 0.22);        // umidade
        for (let k = 0; k < 3; k++) this.crack(r() * 160, r() * 160, 10, r() * 6.3, 'rgba(60,58,54,0.6)', 0.4);
        // ferros de espera enferrujados nas quinas (para o próximo andar)
        for (const [x, y] of [[6, 6], [152, 6], [6, 152], [152, 152], [80, 6], [80, 152]]) {
            for (const [dx, dy] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
                this.softEll(x + dx + 1.2, y + dy + 1.2, 1, 1, 0.5, 1);
                this.circ(x + dx, y + dy, 0.85, this.rad(x + dx - 0.3, y + dy - 0.3, 0, 1, [[0, [210, 130, 80]], [1, [110, 58, 28]]]));
            }
            this.stain(x, y + 3, 3, 4, [130, 64, 30], 0.3);
        }
        // varal com roupas penduradas
        const cl = ['#e8e3d4', '#d9453a', '#2f86d0', '#e8c22c', '#2fa36a', '#9a6bd0'];
        this.line(24, 100, 94, 100, 'rgba(40,40,44,0.9)', 0.45);
        for (let k = 0; k < 6; k++) {
            const x = 26 + k * 11, c = HDK.C(cl[k % cl.length]);
            this.soft(x + 1.5, 102, 8, 9, 0.35, 1.6, 0.8);
            this.fillRR(x, 100.6, 8, 9, 0.9, this.lin(x, 100, x + 8, 110, [[0, HDK.t(c, 1.15)], [1, HDK.t(c, 0.78)]]));
            this.line(x + 1, 100.4, x + 1, 101.6, '#c9b080', 0.5); this.line(x + 7, 100.4, x + 7, 101.6, '#c9b080', 0.5);
        }
        this._tank(34 + Math.floor(r() * 20), 30, '#3f78b5');
        // antena parabólica
        this.softEll(122, 42, 4, 3.6, 0.5, 2);
        this.circ(120, 40, 3.6, this.rad(119, 39, 0, 4, [[0, [240, 242, 244]], [1, [160, 166, 172]]]));
        this.line(112, 40, 120, 40, '#7a7f85', 0.6); this.circ(120, 40, 0.6, '#555');
    },

    // ---------------------------------------------------------------- laje pintada do Mirante
    _roof_laje(st, seed) {
        const g = this.g, r = this.rng, b0 = HDK.C(st.base[0]);
        this.base(st.base, 40, seed, 3);
        this.clouds(0.18, 10, seed + 1, 'soft-light', 2);
        this.grain(0.35, seed, 0.006);
        // tinta de piso gasta (manchas claras) e juntas
        for (let k = 0; k < 5; k++) this.stain(r() * 160, r() * 160, 8 + r() * 14, 6 + r() * 10, [230, 225, 215], 0.12);
        g.beginPath(); for (let i = 0; i < 160; i += 32) { g.moveTo(i, 0); g.lineTo(i, 160); g.moveTo(0, i); g.lineTo(160, i); }
        g.strokeStyle = HDK.css(HDK.t(b0, 0.7), 0.9); g.lineWidth = 0.7; g.stroke();
        this._tank(18 + Math.floor(r() * 16), 18 + Math.floor(r() * 16), '#3f78b5');
        // vasos de planta
        for (let k = 0; k < 5; k++) {
            const cx = 8 + r() * 144, cy = 120 + r() * 32;
            this.softEll(cx + 1.4, cy + 1.6, 5, 5, 0.5, 2);
            this.circ(cx, cy, 5, this.rad(cx - 1.4, cy - 1.4, 0, 5.5, [[0, [196, 110, 70]], [1, [120, 60, 34]]]));
            const leaf = ['#3f8a3a', '#2f7a34', '#5aa04a'][k % 3];
            for (let l = 0; l < 7; l++) { const a = l / 7 * Math.PI * 2 + r(); this.ell(cx + Math.cos(a) * 2, cy + Math.sin(a) * 2, 2.4, 1.2, HDK.css(HDK.t(HDK.C(leaf), 0.85 + r() * 0.35)), g, a); }
            this.circ(cx - 0.6, cy - 0.6, 1.4, HDK.css(HDK.t(HDK.C(leaf), 1.3)));
        }
        if (st.party) {
            const tc = ['#e8e3d4', '#e8452a', '#f2c230', '#2f86d0'];
            for (let k = 0; k < 10; k++) {                                       // cadeiras de plástico brancas
                const cx = 60 + r() * 90, cy = 30 + r() * 100;
                this.soft(cx + 1, cy + 1.2, 4, 4, 0.4, 1.2, 0.8);
                this.fillRR(cx, cy, 4, 4, 0.8, this.lin(cx, cy, cx + 4, cy + 4, [[0, [255, 255, 255]], [1, [214, 216, 218]]]));
                this.line(cx + 0.5, cy + 0.6, cx + 3.5, cy + 0.6, 'rgba(160,164,170,0.8)', 0.5);
            }
            for (let k = 0; k < 4; k++) {                                        // ombrelones (gomos alternados)
                const cx = 70 + (k % 2) * 46, cy = 50 + Math.floor(k / 2) * 46, c = HDK.C(tc[k]), R = 16;
                this.softEll(cx + 4, cy + 5, R, R * 0.95, 0.45, 5);
                for (let s = 0; s < 8; s++) {
                    const a0 = s / 8 * Math.PI * 2, a1 = (s + 1) / 8 * Math.PI * 2, lit = 0.86 + 0.24 * Math.cos(a0 + Math.PI / 8 + 2.3);
                    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R); g.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R); g.closePath();
                    g.fillStyle = HDK.css(HDK.t(s % 2 ? HDK.mix(c, [255, 255, 255], 0.75) : c, lit)); g.fill();
                }
                for (let s = 0; s < 8; s++) { const a = s / 8 * Math.PI * 2; this.line(cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R, 'rgba(40,30,30,0.3)', 0.35); }
                this.circ(cx, cy, 1.4, '#3a3a3e'); this.circ(cx - 0.4, cy - 0.4, 0.5, '#9a9aa0');
            }
            // varal de lâmpadas de festa
            const pts = []; for (let x = -2; x <= 162; x += 4) pts.push([x, 8 + Math.sin(x / 12) * 2]);
            this.curve(pts); g.strokeStyle = 'rgba(30,30,34,0.85)'; g.lineWidth = 0.4; g.stroke();
            for (let x = 0; x < 160; x += 6) { const y = 8 + Math.sin(x / 12) * 2 + 0.8, c = ['#ffd25a', '#ff7a5a', '#7ad0ff'][(x / 6) % 3]; this.circ(x, y, 1, c); this.circ(x - 0.3, y - 0.3, 0.35, 'rgba(255,255,255,0.8)'); }
        } else {
            const cl = ['#e8e3d4', '#d9453a', '#2f86d0', '#e8c22c', '#2fa36a', '#9a6bd0'];
            this.line(80, 70, 146, 70, 'rgba(40,40,44,0.9)', 0.45);
            for (let k = 0; k < 6; k++) { const x = 82 + k * 10, c = HDK.C(cl[k]); this.soft(x + 1.4, 72, 7, 9, 0.35, 1.6, 0.8); this.fillRR(x, 70.6, 7, 9, 0.9, this.lin(x, 70, x + 7, 80, [[0, HDK.t(c, 1.15)], [1, HDK.t(c, 0.78)]])); }
        }
    },

    // ---------------------------------------------------------------- telhado verde
    _roof_garden(st, seed) {
        const g = this.g, r = this.rng;
        this.base(st.base, 18, seed, 3);
        this.clouds(0.5, 9, seed + 1, 'soft-light', 2);
        // folhagem baixa: tufos arredondados
        for (let k = 0; k < 260; k++) {
            const x = r() * 160, y = r() * 160, rr = 1 + r() * 2.2, c = HDK.t(HDK.C(st.base[k % 4]), 0.8 + r() * 0.45);
            this.wrapAt(x, y, rr + 1, () => { this.circ(x + 0.4, y + 0.5, rr, 'rgba(20,40,10,0.25)'); this.circ(x, y, rr, HDK.css(c)); this.circ(x - rr * 0.3, y - rr * 0.3, rr * 0.4, HDK.css(HDK.t(c, 1.25), 0.7)); });
        }
        // caminho de lajotas no meio
        for (let x = 0; x < 160; x += 8) { this.soft(x + 1, 77.5, 7, 5, 0.35, 1.2, 0.6); this.fillRR(x + 0.5, 77, 7, 5, 0.6, this.lin(x, 77, x + 7, 82, [[0, [214, 218, 220]], [1, [160, 166, 170]]])); }
        // canteiro de madeira com flores
        const bx = 14, by = 14, bw = 44, bh = 28;
        this.soft(bx + 2, by + 2.5, bw, bh, 0.45, 3, 1.5);
        this.fillRR(bx, by, bw, bh, 1.5, this.lin(bx, by, bx + bw, by + bh, [[0, [170, 130, 90]], [1, [96, 66, 40]]]));
        this.fillRR(bx + 2.5, by + 2.5, bw - 5, bh - 5, 1, '#4a3524');
        for (let k = 0; k < 40; k++) { const x = bx + 4 + r() * (bw - 8), y = by + 4 + r() * (bh - 8); this.circ(x, y, 1.2 + r(), HDK.css(HDK.t([63, 122, 47], 0.8 + r() * 0.5))); }
        for (let k = 0; k < 14; k++) { const x = bx + 4 + r() * (bw - 8), y = by + 4 + r() * (bh - 8); this.circ(x, y, 0.8, ['#f08aa8', '#f4e35c', '#ffffff'][k % 3]); }
        this.grain(0.22, seed, 0, 'soft-light');
    },
});

// ============================================================================
// Casas de máquinas e caixas de ar-condicionado no alto dos prédios (antes: caixas cinza lisas). A tampa (60 × 60 px, esticada
// sobre a caixa: só retas, nada que entorte) e a lateral (40 × 30 px = 2 u de largura, a altura toda da caixa; repete na horizontal).
// ============================================================================
Object.assign(CityHD, {
    SIZE: Object.assign(CityHD.SIZE, { machtop: [60, 60], machside: [40, 30] }),
    machine(scene) {
        const t0 = performance.now();
        const top = this.paint('machtop', 1), side = this.paint('machside', 2);
        const out = { top: top.toTexture(scene, 'machtop', { wrap: false }), side: side.toTexture(scene, 'machside') };
        out.side.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        this.lastMs += performance.now() - t0;
        return out;
    },
});

Object.assign(CityTile.prototype, {
    p_machtop() {
        const g = this.g, W = 60, r = this.rng;
        g.fillStyle = this.lin(0, 0, W, W, [[0, [214, 219, 223]], [0.5, [184, 190, 196]], [1, [150, 157, 164]]]); g.fillRect(0, 0, W, W);
        this.clouds(0.3, 14, this.seed + 1, 'soft-light', 2);
        this.grain(0.22, this.seed, 0);
        // chapas com junta (frisos) e a aba em volta
        for (let x = 15; x < W; x += 15) { this.line(x, 3, x, W - 3, 'rgba(90,96,104,0.7)', 0.7); this.line(x + 0.8, 3, x + 0.8, W - 3, 'rgba(255,255,255,0.45)', 0.4); }
        this.strokeRR(0.4, 0.4, W - 0.8, W - 0.8, 1, 'rgba(60,66,74,0.95)', 0.8);
        this.strokeRR(1.6, 1.6, W - 3.2, W - 3.2, 0.8, 'rgba(255,255,255,0.55)', 0.6);
        g.fillStyle = this.lin(0, W - 6, 0, W, [[0, [40, 44, 50], 0], [1, [40, 44, 50], 0.28]]); g.fillRect(0, W - 6, W, 6);
        for (let k = 4; k < W; k += 8) for (const [x, y] of [[k, 3], [k, W - 3], [3, k], [W - 3, k]]) this.circ(x, y, 0.45, 'rgba(70,74,80,0.85)');
        // grelha de exaustão (venezianas) e manchas de ferrugem/água
        const gx = 20, gy = 18, gw = 22, gh = 16;
        this.soft(gx + 0.8, gy + 1, gw, gh, 0.45, 1.4, 0.6);
        this.fillRR(gx, gy, gw, gh, 0.8, '#3a3f46');
        for (let y = gy + 1.6; y < gy + gh - 1; y += 2) { this.line(gx + 1.2, y, gx + gw - 1.2, y, '#8a9098', 0.9); this.line(gx + 1.2, y + 0.5, gx + gw - 1.2, y + 0.5, 'rgba(255,255,255,0.4)', 0.3); }
        for (let k = 0; k < 3; k++) this.stain(r() * W, r() * W, 4 + r() * 6, 3 + r() * 4, [120, 80, 50], 0.12);
    },
    p_machside() {
        const g = this.g, W = 40, H = 30;
        g.fillStyle = this.lin(0, 0, 0, H, [[0, [206, 211, 216]], [1, [160, 166, 172]]]); g.fillRect(0, 0, W, H);
        this.clouds(0.25, 10, this.seed + 1, 'soft-light', 2);
        this.grain(0.2, this.seed, 0);
        // montantes a cada 1 u, rufo claro no alto e sujeira escorrendo embaixo
        for (const x of [0, 20, 40]) { this.line(x, 0, x, H, 'rgba(70,76,84,0.9)', 1.2); this.line(x + 1, 0, x + 1, H, 'rgba(255,255,255,0.4)', 0.4); }      // (montante na divisa: metade de cada lado)
        g.fillStyle = this.lin(0, 0, 0, 2.4, [[0, [250, 252, 254]], [1, [170, 176, 182]]]); g.fillRect(0, 0, W, 2.4);
        g.fillStyle = this.lin(0, H - 9, 0, H, [[0, [50, 46, 40], 0], [1, [50, 46, 40], 0.35]]); g.fillRect(0, H - 9, W, 9);
        // um painel de veneziana e uma portinhola de inspeção
        const lx = 4, ly = 6, lw = 13, lh = 16;
        this.fillRR(lx, ly, lw, lh, 0.6, '#3a3f46');
        for (let y = ly + 1.2; y < ly + lh - 0.8; y += 1.8) { this.line(lx + 0.8, y, lx + lw - 0.8, y, '#9aa0a8', 0.8); this.line(lx + 0.8, y + 0.5, lx + lw - 0.8, y + 0.5, 'rgba(255,255,255,0.35)', 0.3); }
        this.strokeRR(24.5, 6, 11, 18, 0.6, 'rgba(70,76,84,0.9)', 0.6);
        this.line(25.2, 6.6, 34.8, 6.6, 'rgba(255,255,255,0.45)', 0.35);
        this.fillRR(33, 14, 1.2, 3, 0.4, '#5a6068');
    },
});
