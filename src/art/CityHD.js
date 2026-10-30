// ============================================================================
// CityHD — a CIDADE em alta definição, no mesmo estilo dos interiores (art/InteriorHD.js): ruas, calçadas, gramados, praças,
// telhados e fachadas repintados num quadro Q vezes maior que a pixel art do TileFactory, com material de verdade (asfalto com brita
// e trincas seladas, tinta de faixa gasta, lajota com rejunte e quina, folhas de grama, telha colonial com sombra, chapa ondulada,
// tijolo com argamassa), degradês, contornos finos e sombra macia.
//
// O DESENHO é o mesmo: cada ladrilho tem o mesmo tamanho no mundo (rua 8 u × 10 u, calçada 4 u, telhado 8 u, fachada 6 u = 2 baias ×
// 2 andares) e as mesmas coisas no mesmo lugar (faixas, juntas, janelas, máquinas no telhado) — as UVs do WorldBuilder são as
// mesmas (nas paredes só soma um deslocamento inteiro por prédio, para o sorteio das janelas acesas). As coordenadas dos pintores
// são as da arte (20 px/u); o canvas é desenhado com escala Q (2..4 px de textura por px da arte, pelo nível de gráfico). Tudo
// repete sem emenda: o ruído é periódico no ladrilho e o que cruza a borda é desenhado também do outro lado.
//   • pisos: aqui; telhados: art/CityHDRoofs.js; fachadas, vitrines das lojas e as janelas acesas da noite: art/CityHDFacades.js.
//   • o mar continua em pixel art animada (TileFactory.water + render/WaterPlugin.js), e o chão do mundo grande (TerrainSplat) também.
// Config.art.cityHD = false (ou ?pixel) volta à pixel art de antes.
// ============================================================================

const CityHD = {
    // Canvas na CPU (a pintura rasteriza na hora; ver InteriorHD.CTX).
    CTX: { willReadFrequently: true },
    lastMs: 0,
    get on() {
        if (typeof document === 'undefined' || (Config.art && Config.art.cityHD === false)) return false;
        return !(typeof location !== 'undefined' && /[?&]pixel\b/.test(location.search));
    },
    // px de textura por px da arte (20 px/u): 40 px/u no Low e no Medium, 60 no High e 80 no HD.
    get Q() {
        const lvl = typeof Graphics !== 'undefined' ? Graphics.level : 'high';
        return { low: 2, medium: 2, high: 3, hd: 4 }[lvl] || 3;
    },
    // Anisotrópico das texturas do chão (vistas de lado pela câmera inclinada).
    get aniso() { return typeof Graphics !== 'undefined' && Graphics.level === 'low' ? 4 : 8; },

    // ---------------------------------------------------------------- ruído periódico
    // Ruído de valor suave: (x, y) em células, repete a cada wx × wy células.
    vn(x, y, wx, wy, seed) {
        const ix = Math.floor(x), iy = Math.floor(y);
        let fx = x - ix, fy = y - iy;
        fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
        const x0 = ((ix % wx) + wx) % wx, y0 = ((iy % wy) + wy) % wy, x1 = (x0 + 1) % wx, y1 = (y0 + 1) % wy, H = Pixel.hash;
        const a = H(x0, y0, seed), b = H(x1, y0, seed), c = H(x0, y1, seed), d = H(x1, y1, seed);
        return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    },
    // Soma de oitavas (0..1). (u, v) = fração do ladrilho; cx × cy = células da 1ª oitava no ladrilho.
    fbm(u, v, cx, cy, seed, oct = 3) {
        let s = 0, a = 1, n = 0;
        for (let o = 0; o < oct; o++) { s += this.vn(u * cx, v * cy, cx, cy, seed + o * 101) * a; n += a; a *= 0.5; cx *= 2; cy *= 2; }
        return s / n;
    },

    // Células de Worley periódicas: (u, v) = fração do ladrilho, n × m células → distância à semente mais próxima (em células).
    worley(u, v, n, m, seed) {
        const x = u * n, y = v * m, cx = Math.floor(x), cy = Math.floor(y);
        let d1 = 9;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
            const gx = cx + i, gy = cy + j, wx = ((gx % n) + n) % n, wy = ((gy % m) + m) % m;
            const dx = gx + Pixel.hash(wx, wy, seed) - x, dy = gy + Pixel.hash(wx, wy, seed + 1) - y, d = dx * dx + dy * dy;
            if (d < d1) d1 = d;
        }
        return Math.sqrt(d1);
    },

    // ---------------------------------------------------------------- ladrilhos de apoio (cache por tamanho)
    _tiles: {},
    // Grão por pixel do quadro HD, em cinza 128 ± ruído (aplicado com 'overlay' não muda a média). `speck`: pontos claros e escuros
    // (a brita do asfalto, o grão do cimento).
    grainTile(W, H, seed, speck = 0) {
        const key = `g${W}x${H}_${seed}_${speck}`;
        if (this._tiles[key]) return this._tiles[key];
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const g = cv.getContext('2d', this.CTX), im = g.createImageData(W, H), d = im.data;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const h = Pixel.hash(x, y, seed), k = (y * W + x) * 4;
            let v = 128 + (h - 0.5) * 70 + (Pixel.hash(x >> 1, y >> 1, seed + 7) - 0.5) * 40;
            if (speck) { if (h > 1 - speck) v = 215 + (h - 1 + speck) / speck * 40; else if (h < speck * 1.2) v = 40; }
            d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255;
        }
        g.putImageData(im, 0, 0);
        return (this._tiles[key] = cv);
    },
    // Canvas de apoio reaproveitado (camadas de tinta gasta, máscaras).
    _aux: {},
    aux(role, W, H) {
        const c = this._aux[role] || (this._aux[role] = document.createElement('canvas'));
        if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
        const g = c.getContext('2d', this.CTX);
        g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.filter = 'none'; g.clearRect(0, 0, W, H);
        return c;
    },
    // Libera os canvases de apoio no fim da carga (as texturas já estão na placa).
    release() {
        for (const k of Object.keys(this._tiles)) { const c = this._tiles[k]; c.width = c.height = 0; }
        for (const k of Object.keys(this._aux)) { const c = this._aux[k]; c.width = c.height = 0; }
        this._tiles = {}; this._aux = {};
    },

    // ---------------------------------------------------------------- texturas
    // Pinta um ladrilho (pintor `p_<nome>` de CityTile) e devolve a textura.
    make(scene, name, ...args) {
        const t0 = performance.now(), t = this.paint(name, ...args), tex = t.toTexture(scene, name);
        this.lastMs += performance.now() - t0;
        return tex;
    },
    // Só a pintura (para os testes e a folha de conferência): devolve o CityTile.
    paint(name, ...args) {
        const size = this.SIZE[name] || [80, 80], t = new CityTile(size[0], size[1], this.Q, CityHD.seedOf(name, args));
        t['p_' + name](...args);
        return t;
    },
    seedOf(name, args) { return (name + ':' + args.join(',')).split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7); },
    // Tamanho de cada ladrilho em px da arte (o do TileFactory).
    SIZE: { road: [160, 200], zebra: [200, 60], roof: [160, 160] },
};

// ============================================================================
// CityTile — um ladrilho HD. `g` desenha em px da arte (escala Q já aplicada).
// ============================================================================
class CityTile {
    constructor(w, h, Q, seed) {
        this.w = w; this.h = h; this.Q = Q; this.seed = seed >>> 0;
        this.rng = Pixel.rng(this.seed * 13 + 5);
        this.cv = document.createElement('canvas'); this.cv.width = w * Q; this.cv.height = h * Q;
        this.g = this.cv.getContext('2d', CityHD.CTX);
        this.reset(this.g);
    }
    reset(g) { g.setTransform(this.Q, 0, 0, this.Q, 0, 0); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.lineJoin = 'round'; g.lineCap = 'round'; }

    // A textura do Babylon (filtro trilinear sempre: é arte em alta, não pixel art). O canvas é liberado depois do envio à placa.
    toTexture(scene, name, { wrap = true, aniso = CityHD.aniso } = {}) {
        const tex = new BABYLON.DynamicTexture('hd_' + name, this.cv, scene, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
        tex.update(false);
        const mode = wrap ? BABYLON.Texture.WRAP_ADDRESSMODE : BABYLON.Texture.CLAMP_ADDRESSMODE;
        tex.wrapU = tex.wrapV = mode;
        tex.anisotropicFilteringLevel = aniso;
        this.cv.width = this.cv.height = 0;
        return tex;
    }

    // ---------------------------------------------------------------- utilidades de desenho
    r(a = 0, b = 1) { return a + (b - a) * this.rng(); }
    C(c, a = 1) { return HDK.css(c, a); }
    lin(x0, y0, x1, y1, stops, g = this.g) { const gr = g.createLinearGradient(x0, y0, x1, y1); for (const [o, c, a] of stops) gr.addColorStop(o, HDK.css(c, a === undefined ? 1 : a)); return gr; }
    rad(x, y, r0, r1, stops, g = this.g) { const gr = g.createRadialGradient(x, y, r0, x, y, r1); for (const [o, c, a] of stops) gr.addColorStop(o, HDK.css(c, a === undefined ? 1 : a)); return gr; }
    rr(x, y, w, h, r, g = this.g) {
        r = Math.max(0, Math.min(r, w / 2, h / 2));
        g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    }
    fillRR(x, y, w, h, r, fill, g = this.g) { this.rr(x, y, w, h, r, g); g.fillStyle = fill; g.fill(); }
    strokeRR(x, y, w, h, r, col, lw = 0.5, g = this.g) { this.rr(x + lw / 2, y + lw / 2, w - lw, h - lw, r, g); g.strokeStyle = col; g.lineWidth = lw; g.stroke(); }
    ell(x, y, rx, ry, fill, g = this.g, rot = 0) { g.beginPath(); g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); }
    circ(x, y, r, fill, g = this.g) { this.ell(x, y, r, r, fill, g); }
    line(x0, y0, x1, y1, col, lw = 0.5, g = this.g) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.strokeStyle = col; g.lineWidth = lw; g.stroke(); }
    poly(pts, g = this.g) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); }
    // Curva suave por pontos (quadráticas pelos pontos médios).
    curve(pts, g = this.g) {
        g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length - 1; i++) g.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
        const L = pts[pts.length - 1]; g.lineTo(L[0], L[1]);
    }
    // Sombra macia (borrada) de um retângulo arredondado — shadowBlur com a forma fora da tela (como o InteriorHD).
    soft(x, y, w, h, a = 0.35, blur = 3, r = 2, col = [14, 10, 8], g = this.g) {
        const OFF = 40000, Q = this.Q;
        g.save();
        g.shadowColor = HDK.css(col, a); g.shadowBlur = blur * Q; g.shadowOffsetX = OFF * Q; g.shadowOffsetY = 0;
        g.fillStyle = '#000'; this.rr(x - OFF, y, w, h, r, g); g.fill();
        g.restore();
    }
    softEll(x, y, rx, ry, a = 0.35, blur = 3, col = [14, 10, 8], g = this.g) {
        const OFF = 40000, Q = this.Q;
        g.save();
        g.shadowColor = HDK.css(col, a); g.shadowBlur = blur * Q; g.shadowOffsetX = OFF * Q;
        g.beginPath(); g.ellipse(x - OFF, y, rx, ry, 0, 0, Math.PI * 2); g.fillStyle = '#000'; g.fill();
        g.restore();
    }

    // Repete o desenho do outro lado das bordas que o retângulo (x0, y0)–(x1, y1) cruza: o ladrilho fica sem emenda.
    wrap(x0, y0, x1, y1, fn) {
        const g = this.g, w = this.w, h = this.h;
        for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
            if (x1 + ox < 0 || x0 + ox > w || y1 + oy < 0 || y0 + oy > h) continue;
            if (ox || oy) { g.save(); g.translate(ox, oy); try { fn(); } finally { g.restore(); } } else fn();
        }
    }
    wrapAt(x, y, r, fn) { this.wrap(x - r, y - r, x + r, y + r, fn); }

    // ---------------------------------------------------------------- camadas de ruído (periódicas no ladrilho)
    // Campo calculado numa grade `res` px por px da arte (com 1 px de margem dos vizinhos, para o borrão da ampliação não marcar a
    // borda) e esticado sobre o ladrilho com suavização. fn(u, v) → [r, g, b] ou cinza 0..1; `a` = alfa 0..1 opcional.
    field(res, fn, comp = 'source-over', alpha = 1) {
        const rw = Math.max(2, Math.round(this.w * res)), rh = Math.max(2, Math.round(this.h * res));
        const cv = CityHD.aux('field', rw + 2, rh + 2), c = cv.getContext('2d', CityHD.CTX), im = c.createImageData(rw + 2, rh + 2), d = im.data;
        for (let y = -1; y <= rh; y++) for (let x = -1; x <= rw; x++) {
            const u = (((x + 0.5) / rw) % 1 + 1) % 1, v = (((y + 0.5) / rh) % 1 + 1) % 1, o = ((y + 1) * (rw + 2) + x + 1) * 4, val = fn(u, v);
            if (typeof val === 'number') { const k = Math.max(0, Math.min(255, val * 255)); d[o] = d[o + 1] = d[o + 2] = k; d[o + 3] = 255; }
            else { d[o] = val[0]; d[o + 1] = val[1]; d[o + 2] = val[2]; d[o + 3] = val.length > 3 ? val[3] * 255 : 255; }
        }
        c.putImageData(im, 0, 0);
        const g = this.g;
        g.save(); g.globalCompositeOperation = comp; g.globalAlpha = alpha;
        g.drawImage(cv, 1, 1, rw, rh, 0, 0, this.w, this.h);
        g.restore();
    }
    // Base de cor: paleta mapeada por ruído suave (manchas), em degradê contínuo entre as cores.
    base(pal, cell = 16, seed = this.seed, oct = 3, res = 0.5) {
        const P = pal.map(HDK.C), n = P.length - 1, cx = Math.max(1, Math.round(this.w / cell)), cy = Math.max(1, Math.round(this.h / cell));
        this.field(res, (u, v) => {
            let t = CityHD.fbm(u, v, cx, cy, seed, oct);
            t = Math.max(0, Math.min(0.9999, (t - 0.2) / 0.6)) * n;
            const i = Math.floor(t), f = t - i, a = P[i], b = P[Math.min(n, i + 1)];
            return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
        });
    }
    // Manchas grandes e macias (luz/sombra) por cima: soft-light ou multiply.
    clouds(amt, cell = 20, seed = this.seed + 3, comp = 'soft-light', oct = 2) {
        const cx = Math.max(1, Math.round(this.w / cell)), cy = Math.max(1, Math.round(this.h / cell));
        this.field(0.5, (u, v) => CityHD.fbm(u, v, cx, cy, seed, oct), comp, amt);
    }
    // RELEVO: um campo de altura periódico (fn(u, v) → 0..1) iluminado pelo noroeste e aplicado por cima ('overlay'): o lado virado
    // para a luz clareia, o de trás escurece, e os vãos (altura baixa) ganham a sombra de oclusão. res = px por px da arte.
    relief(fn, amt = 0.6, res = 1, ao = 0.35, bump = 6, alpha = 1) {
        const rw = Math.max(2, Math.round(this.w * res)), rh = Math.max(2, Math.round(this.h * res)), H = new Float32Array(rw * rh);
        for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) H[y * rw + x] = fn((x + 0.5) / rw, (y + 0.5) / rh);
        const lm = Math.hypot(0.5, 0.6, 0.62), L0 = -0.5 / lm, L1 = -0.6 / lm, L2 = 0.62 / lm;
        this.field(res, (u, v) => {
            const x = Math.min(rw - 1, Math.floor(u * rw)), y = Math.min(rh - 1, Math.floor(v * rh));
            const hx = H[y * rw + (x + 1) % rw] - H[y * rw + (x - 1 + rw) % rw], hy = H[((y + 1) % rh) * rw + x] - H[((y - 1 + rh) % rh) * rw + x];
            const nx = -hx * bump * res, ny = -hy * bump * res, nm = Math.sqrt(nx * nx + ny * ny + 1);
            const l = (nx * L0 + ny * L1 + L2) / nm;
            return Math.max(0, Math.min(1, 0.5 + (l - L2) * amt * 1.6 - (1 - H[y * rw + x]) * ao * 0.5 + ao * 0.18));
        }, 'overlay', alpha);
    }
    // Grão por pixel do quadro HD (o ladrilho tem o tamanho exato do canvas: repete sem emenda).
    grain(amt = 0.3, seed = 1, speck = 0, comp = 'overlay') {
        if (amt <= 0) return;
        const g = this.g, W = this.cv.width, H = this.cv.height;
        g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = comp; g.globalAlpha = Math.min(1, amt);
        g.drawImage(CityHD.grainTile(W, H, seed % 4 + 1, speck), 0, 0);
        g.restore();
    }
    // Camada pintada à parte e GASTA (tinta de faixa, reboco descascando): fn desenha no contexto dado; os buracos saem do ruído.
    // wear 0..1 = quanto some; depois a camada é aplicada com o grão do piso por cima (a tinta pega a textura do chão).
    layer(fn, wear = 0.3, seed = this.seed + 11, cell = 3, alpha = 1) {
        const W = this.cv.width, H = this.cv.height, cv = CityHD.aux('layer', W, H), lg = cv.getContext('2d', CityHD.CTX);
        this.reset(lg);
        const g0 = this.g; this.g = lg;
        try { fn(lg); } finally { this.g = g0; }
        if (wear > 0) {
            // máscara de desgaste: manchas (ruído médio) + falhas miúdas (por pixel)
            const cx = Math.max(1, Math.round(this.w / cell)), cy = Math.max(1, Math.round(this.h / cell));
            const m = CityHD.aux('mask', W, H), mg = m.getContext('2d', CityHD.CTX), im = mg.createImageData(W, H), d = im.data;
            const th = 1 - wear;
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                const u = x / W, v = y / H, n = CityHD.vn(u * cx, v * cy, cx, cy, seed) * 0.62 + CityHD.vn(u * cx * 4, v * cy * 4, cx * 4, cy * 4, seed + 5) * 0.28 + Pixel.hash(x, y, seed) * 0.1;
                const a = Math.max(0, Math.min(1, (n - th + 0.08) / 0.16));
                d[(y * W + x) * 4 + 3] = a * 255;
            }
            mg.putImageData(im, 0, 0);
            lg.save(); lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalCompositeOperation = 'destination-out'; lg.drawImage(m, 0, 0); lg.restore();
        }
        const g = this.g;
        g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = alpha; g.drawImage(cv, 0, 0); g.restore();
    }

    // Rachadura: caminhada torta com galhos; escura com a borda clara de um lado.
    crack(x, y, n, dir, col, lw = 0.45) {
        const pts = [[x, y]], r = this.rng;
        let an = dir;
        for (let i = 0; i < n; i++) { an += (r() - 0.5) * 0.9; x += Math.cos(an) * (1.2 + r() * 1.6); y += Math.sin(an) * (1.2 + r() * 1.6); pts.push([x, y]); }
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        const br = [];
        if (r() < 0.6) { const k = 1 + Math.floor(r() * (pts.length - 2)); let [bx, by] = pts[k], ba = an + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.6); const q = [[bx, by]]; for (let i = 0; i < 4 + r() * 5; i++) { ba += (r() - 0.5) * 0.8; bx += Math.cos(ba) * 1.4; by += Math.sin(ba) * 1.4; q.push([bx, by]); } br.push(q); }
        this.wrap(Math.min(...xs) - 6, Math.min(...ys) - 6, Math.max(...xs) + 6, Math.max(...ys) + 6, () => {
            const g = this.g;
            g.save(); g.translate(0.35, 0.35); this.poly(pts); g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = lw * 0.8; g.stroke(); g.restore();
            this.poly(pts); g.strokeStyle = col; g.lineWidth = lw; g.stroke();
            for (const q of br) { this.poly(q); g.strokeStyle = col; g.lineWidth = lw * 0.6; g.stroke(); }
        });
    }
    // Mancha macia (óleo, umidade, sujeira) com borda irregular.
    stain(x, y, rx, ry, col, a = 0.25, comp = 'source-over') {
        const g = this.g;
        this.wrapAt(x, y, Math.max(rx, ry) * 1.3, () => {
            g.save(); g.globalCompositeOperation = comp; g.translate(x, y); g.scale(1, ry / rx);
            for (let k = 0; k < 3; k++) {
                const ox = (this.rng() - 0.5) * rx * 0.6, oy = (this.rng() - 0.5) * rx * 0.6, rr = rx * (0.55 + this.rng() * 0.45);
                g.fillStyle = this.rad(ox, oy, 0, rr, [[0, col, a], [0.6, col, a * 0.55], [1, col, 0]]);
                g.fillRect(ox - rr, oy - rr, rr * 2, rr * 2);
            }
            g.restore();
        });
    }
    // Pedrinha/seixo visto de cima: corpo com degradê, brilho em cima à esquerda e sombra para sudeste.
    pebble(x, y, r, col, rot = 0) {
        const c = HDK.C(col);
        this.wrapAt(x, y, r * 2, () => {
            this.ell(x + r * 0.35, y + r * 0.4, r * 1.05, r * 0.8, 'rgba(20,14,10,0.35)', this.g, rot);
            this.ell(x, y, r, r * 0.78, this.rad(x - r * 0.35, y - r * 0.35, 0, r * 1.3, [[0, HDK.t(c, 1.3)], [0.55, c], [1, HDK.t(c, 0.62)]]), this.g, rot);
        });
    }
}

// ============================================================================
// Pisos (ladrilhos de 80 px = 4 u, salvo indicação). Luz do noroeste, como nos interiores.
// ============================================================================
Object.assign(CityTile.prototype, {
    // ---------------------------------------------------------------- asfalto
    _asphalt(seed, worn = 0.5) {
        this.base(['#2d3036', '#31343a', '#35383f', '#393c43', '#3e4148'], 30, seed, 3);
        this.clouds(0.22, 5, seed + 1, 'soft-light', 2);                       // mosqueado do agregado
        this.grain(0.6, seed, 0.022);                                           // brita: pontos claros e escuros no quadro HD
        this.grain(0.3, seed + 2, 0, 'soft-light');
        // remendos e trincas seladas com piche (brilho escuro), poucas: o ladrilho repete a cada poucos metros
        const r = this.rng;
        for (let k = 0; k < Math.max(1, (this.w * this.h) / 9000) * worn; k++) {
            const x = r() * this.w, y = r() * this.h, w = 10 + r() * 18, h = 7 + r() * 12;
            this.wrap(x - 2, y - 2, x + w + 2, y + h + 2, () => {
                this.fillRR(x, y, w, h, 1.2, 'rgba(18,19,23,0.13)');
                this.strokeRR(x, y, w, h, 1.2, 'rgba(12,12,15,0.22)', 0.45);
                this.line(x + 1, y + 0.5, x + w - 1, y + 0.5, 'rgba(255,255,255,0.05)', 0.4);
            });
        }
        for (let k = 0; k < Math.max(2, (this.w * this.h) / 3200) * worn; k++) {
            const x = r() * this.w, y = r() * this.h, n = 8 + r() * 14, dir = r() * Math.PI * 2;
            if (r() < 0.45) {                                                    // trinca selada: faixa preta lisa e larga, sinuosa
                const pts = [[x, y]]; let a = dir, px = x, py = y;
                for (let i = 0; i < n; i++) { a += (r() - 0.5) * 0.7; px += Math.cos(a) * 2; py += Math.sin(a) * 2; pts.push([px, py]); }
                const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
                this.wrap(Math.min(...xs) - 3, Math.min(...ys) - 3, Math.max(...xs) + 3, Math.max(...ys) + 3, () => {
                    this.curve(pts); this.g.strokeStyle = 'rgba(14,14,17,0.75)'; this.g.lineWidth = 1.3; this.g.stroke();
                    this.g.save(); this.g.translate(-0.25, -0.3); this.curve(pts); this.g.strokeStyle = 'rgba(160,170,185,0.08)'; this.g.lineWidth = 0.4; this.g.stroke(); this.g.restore();
                });
            } else this.crack(x, y, n, dir, 'rgba(10,10,12,0.7)', 0.4);
        }
        for (let k = 0; k < Math.max(1, (this.w * this.h) / 5000) * worn; k++) this.stain(r() * this.w, r() * this.h, 3 + r() * 6, 2 + r() * 4, [12, 12, 16], 0.22);
    },
    p_asphalt(seed) { this._asphalt(seed, 0.7); },

    // Rua: 160 px ao longo (8 u) × 200 px de largura (10 u); pista de 5 u em cada sentido. Faixas no mesmo lugar da pixel art.
    p_road(seed) {
        this._asphalt(seed, 0.3);
        const g = this.g, W = this.w;
        // trilhas de pneu: duas faixas lisas e um pouco mais escuras por pista, e o fio de óleo no meio da pista
        for (const cy of [50, 150]) {
            for (const o of [-17, 17]) {
                g.fillStyle = this.lin(0, cy + o - 8, 0, cy + o + 8, [[0, [14, 15, 19], 0], [0.5, [14, 15, 19], 0.24], [1, [14, 15, 19], 0]]);
                g.fillRect(0, cy + o - 8, W, 16);
            }
            g.fillStyle = this.lin(0, cy - 5, 0, cy + 5, [[0, [8, 8, 10], 0], [0.5, [8, 8, 10], 0.2], [1, [8, 8, 10], 0]]);
            g.fillRect(0, cy - 5, W, 10);
            for (let k = 0; k < 7; k++) this.stain(this.r(0, W), cy + this.r(-3, 3), this.r(1.5, 4), this.r(1, 2.2), [6, 6, 8], 0.35);
        }
        // sarjeta: o asfalto escurece e junta sujeira perto do meio-fio
        g.fillStyle = this.lin(0, 0, 0, 9, [[0, [20, 18, 16], 0.45], [1, [20, 18, 16], 0]]); g.fillRect(0, 0, W, 9);
        g.fillStyle = this.lin(0, 200, 0, 191, [[0, [20, 18, 16], 0.45], [1, [20, 18, 16], 0]]); g.fillRect(0, 191, W, 9);
        // tinta: linhas de bordo brancas e o tracejado amarelo do meio (4 u de traço, 4 u de vão), gastas
        this.layer((lg) => {
            lg.fillStyle = 'rgba(232,234,236,0.95)'; lg.fillRect(0, 10, W, 2.2); lg.fillRect(0, 187.8, W, 2.2);
            this.fillRR(0.6, 98, 78.8, 3, 0.8, this.lin(0, 98, 0, 101, [[0, [252, 205, 70]], [1, [226, 168, 34]]]));
        }, 0.24, seed + 21, 2.5);
        this.grain(0.35, seed + 3, 0, 'soft-light');
        // tachões refletivos no vão do tracejado
        for (const x of [104, 136]) {
            this.soft(x - 1.6, 98.6, 3.2, 2.2, 0.5, 0.8, 0.6);
            this.fillRR(x - 1.5, 98.3, 3, 2.2, 0.7, this.lin(0, 98.3, 0, 100.5, [[0, [255, 236, 150]], [1, [196, 150, 40]]]));
            this.line(x - 0.9, 98.8, x + 0.9, 98.8, 'rgba(255,255,255,0.8)', 0.35);
        }
    },

    // Faixa de pedestres: 200 px atravessando a rua (10 u) × 60 px (3 u). Barras de 0,5 u a cada 1 u, gastas nas trilhas dos pneus.
    p_zebra(seed) {
        this._asphalt(seed, 0.35);
        const g = this.g;
        this.layer(() => {
            for (let x = 10; x < 190; x += 20) this.fillRR(x + 0.3, 3, 9.4, 54, 0.6, 'rgba(236,238,240,0.96)');
        }, 0.2, seed + 31, 2.5);
        // mais gasta onde os pneus passam (x ≈ 2,5 u e 7,5 u): o asfalto volta a aparecer
        for (const cx of [50, 150]) {
            g.save(); g.beginPath(); g.rect(cx - 16, 0, 32, 60); g.clip();
            this._asphaltDust(cx, seed);
            g.restore();
        }
        this.grain(0.3, seed + 4, 0, 'soft-light');
        this.clouds(0.25, 12, seed + 5, 'multiply', 2);
    },
    _asphaltDust(cx, seed) {
        const g = this.g;
        g.fillStyle = this.lin(cx - 16, 0, cx + 16, 0, [[0, [52, 54, 60], 0], [0.5, [52, 54, 60], 0.35], [1, [52, 54, 60], 0]]);
        g.fillRect(cx - 16, 0, 32, 60);
        for (let k = 0; k < 40; k++) { const x = cx + this.r(-12, 12), y = this.r(2, 58); this.ell(x, y, this.r(0.4, 1.6), this.r(0.3, 1), `rgba(44,46,52,${this.r(0.4, 0.8).toFixed(2)})`); }
    },

    // ---------------------------------------------------------------- calçada: placas de concreto de 1 u com junta e quina
    p_sidewalk(seed) {
        const g = this.g, s = 20, tones = ['#bcc0c5', '#b5b9bf', '#c2c6cb', '#b0b4ba'].map(HDK.C);
        for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
            const x = tx * s, y = ty * s, c = Pixel.pick(tones, Pixel.hash(tx, ty, seed));
            g.fillStyle = this.lin(x, y, x + s, y + s, [[0, HDK.t(c, 1.05)], [1, HDK.t(c, 0.95)]]); g.fillRect(x, y, s, s);
        }
        this.clouds(0.4, 14, seed + 1, 'soft-light', 3);
        this.grain(0.42, seed, 0.01);
        // juntas: sulco escuro, quina clara do lado de cima/esquerda de cada placa
        g.beginPath(); for (let i = 0; i <= 80; i += s) { g.moveTo(i, 0); g.lineTo(i, 80); g.moveTo(0, i); g.lineTo(80, i); }
        g.strokeStyle = 'rgba(96,100,108,0.95)'; g.lineWidth = 0.9; g.stroke();
        g.beginPath(); for (let i = 0; i <= 80; i += s) { g.moveTo(i + 0.95, 0); g.lineTo(i + 0.95, 80); g.moveTo(0, i + 0.95); g.lineTo(80, i + 0.95); }
        g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 0.55; g.stroke();
        g.beginPath(); for (let i = s; i <= 80; i += s) { g.moveTo(i - 0.85, 0); g.lineTo(i - 0.85, 80); g.moveTo(0, i - 0.85); g.lineTo(80, i - 0.85); }
        g.strokeStyle = 'rgba(70,74,82,0.22)'; g.lineWidth = 0.7; g.stroke();
        // vida: chiclete, manchas, uma lasca e uma trinca
        const r = this.rng;
        for (let k = 0; k < 9; k++) { const x = r() * 80, y = r() * 80; this.wrapAt(x, y, 2, () => { this.ell(x, y, 0.55 + r() * 0.4, 0.45 + r() * 0.3, 'rgba(70,72,78,0.55)'); this.ell(x - 0.15, y - 0.15, 0.25, 0.2, 'rgba(255,255,255,0.15)'); }); }
        for (let k = 0; k < 3; k++) this.stain(r() * 80, r() * 80, 3 + r() * 5, 2 + r() * 3, [70, 66, 60], 0.14);
        this.crack(r() * 80, r() * 80, 7, r() * 6.3, 'rgba(70,74,82,0.6)', 0.35);
    },

    // ---------------------------------------------------------------- grama: base em manchas + folhas, trevos e florzinhas
    p_grass(seed) {
        this.base(['#3f7a2f', '#4c8a37', '#57973f', '#62a347', '#6dae50'], 18, seed, 3);
        this.clouds(0.45, 9, seed + 1, 'soft-light', 2);
        // relevo: touceiras (cúpulas de ~0,4 u) sobre ondulação suave do terreno e o fiapo das folhas; os vãos entre as touceiras afundam
        const cw = Math.round(this.w / 9), ch = Math.round(this.h / 9);
        this.relief((u, v) => {
            const c = Math.max(0, 1 - CityHD.worley(u, v, cw, ch, seed + 5) / 0.75);
            return 0.38 * c * c * (3 - 2 * c) + 0.42 * CityHD.fbm(u, v, 3, 3, seed + 7, 2) + 0.2 * Pixel.hash(Math.floor(u * this.w * 2), Math.floor(v * this.h * 0.7), seed);
        }, 0.42, Math.min(3, this.Q), 0.28, 3, 0.8);
        const g = this.g, r = this.rng;
        // folhas: traços curtos em vários verdes (agrupados por cor), cada um com a sombra do lado de baixo e o fio de luz por cima
        const cols = ['#2f5f24', '#3b7029', '#4f8c36', '#6aa64a', '#86bd5c', '#a5d06e'];
        const buckets = cols.map(() => []);
        const N = Math.round(this.w * this.h * 0.36);
        for (let i = 0; i < N; i++) {
            const x = r() * this.w, y = r() * this.h, L = 1.2 + r() * 2.4, a = -Math.PI / 2 + (r() - 0.5) * 1.6, ci = Math.min(cols.length - 1, Math.floor(Math.pow(r(), 0.8) * cols.length));
            buckets[ci].push([x, y, x + Math.cos(a) * L, y + Math.sin(a) * L]);
        }
        const blades = (B, dx, dy, col, lw, al) => {
            this.wrap(-4, -4, this.w + 4, this.h + 4, () => {
                g.beginPath(); for (const [x0, y0, x1, y1] of B) { g.moveTo(x0 + dx, y0 + dy); g.quadraticCurveTo((x0 + x1) / 2 + 0.3 + dx, (y0 + y1) / 2 + dy, x1 + dx, y1 + dy); }
                g.strokeStyle = col; g.lineWidth = lw; g.globalAlpha = al; g.stroke(); g.globalAlpha = 1;
            });
        };
        buckets.forEach((B, ci) => {
            blades(B, 0.28, 0.32, '#1c3a14', ci < 2 ? 0.5 : 0.4, 0.28);                                   // sombra da folha no chão
            blades(B, 0, 0, cols[ci], ci < 2 ? 0.42 : 0.32, ci < 2 ? 0.55 : 0.85);
            if (ci >= 3) blades(B, -0.1, -0.12, '#d8f0a8', 0.12, 0.35);                                    // fio de luz (noroeste)
        });
        // trevos e florzinhas (poucos), com sombrinha
        for (let k = 0; k < 6; k++) { const x = r() * this.w, y = r() * this.h; this.wrapAt(x, y, 3, () => { this.ell(x + 0.35, y + 0.4, 1.4, 1.1, 'rgba(20,40,10,0.3)'); for (let p = 0; p < 3; p++) { const a = p * 2.1 + r(); this.circ(x + Math.cos(a) * 0.7, y + Math.sin(a) * 0.7, 0.62, '#4f9a3c'); this.circ(x + Math.cos(a) * 0.7 - 0.15, y + Math.sin(a) * 0.7 - 0.15, 0.3, 'rgba(160,220,120,0.5)'); } this.circ(x, y, 0.25, '#7fc05a'); }); }
        const fl = ['#f4e35c', '#f7f7fa', '#f08aa8', '#c9a0f0'];
        for (let k = 0; k < 7; k++) {
            const x = r() * this.w, y = r() * this.h, c = fl[k % fl.length];
            this.wrapAt(x, y, 2, () => { this.circ(x + 0.3, y + 0.35, 0.9, 'rgba(20,40,10,0.3)'); for (let p = 0; p < 5; p++) { const a = p * 1.2566; this.circ(x + Math.cos(a) * 0.45, y + Math.sin(a) * 0.45, 0.32, c); } this.circ(x, y, 0.22, '#e8a020'); });
        }
        this.grain(0.25, seed + 2, 0, 'soft-light');
    },

    // ---------------------------------------------------------------- areia: grão fino, ondulações do vento, conchinhas
    p_sand(seed) {
        this.base(['#d6c387', '#dccb91', '#e3d39c', '#e9dba8', '#efe3b6'], 20, seed, 3);
        this.clouds(0.35, 8, seed + 1, 'soft-light', 2);
        this.grain(0.5, seed, 0.012);
        const g = this.g, r = this.rng;
        for (let k = 0; k < 9; k++) {                                            // ondulações: arco claro com a sombra embaixo
            const cx = r() * 80, cy = r() * 80, len = 12 + r() * 22, amp = 0.8 + r() * 1.2, ph = r() * 6;
            const pts = []; for (let i = 0; i <= len; i += 2) pts.push([cx + i, cy + Math.sin(i * 0.25 + ph) * amp]);
            this.wrap(cx - 2, cy - 4, cx + len + 2, cy + 4, () => {
                this.curve(pts); g.strokeStyle = 'rgba(255,248,220,0.55)'; g.lineWidth = 0.6; g.stroke();
                g.save(); g.translate(0, 0.7); this.curve(pts); g.strokeStyle = 'rgba(150,120,60,0.28)'; g.lineWidth = 0.7; g.stroke(); g.restore();
            });
        }
        for (let k = 0; k < 6; k++) { const x = r() * 80, y = r() * 80; this.pebble(x, y, 0.45 + r() * 0.5, r() < 0.5 ? '#f3ede0' : '#c9a982', r() * 3); }
        for (let k = 0; k < 3; k++) this.stain(r() * 80, r() * 80, 4 + r() * 6, 3 + r() * 4, [150, 120, 70], 0.12);
    },

    // ---------------------------------------------------------------- concreto (pátio, estacionamento, quadra)
    p_concrete(seed) {
        this.base(['#7c8084', '#83878b', '#8a8e92', '#919599', '#989ca0'], 22, seed, 3);
        this.clouds(0.5, 10, seed + 1, 'soft-light', 3);
        this.grain(0.45, seed, 0.012);
        const g = this.g, r = this.rng;
        // marcas da régua (desempeno) e juntas de dilatação na borda do ladrilho (4 u)
        g.save(); g.globalAlpha = 0.08; for (let y = 2; y < 80; y += 3.4) this.line(0, y + r() * 0.6, 80, y + r() * 0.6, '#ffffff', 0.35); g.restore();
        g.beginPath(); for (const i of [0, 80]) { g.moveTo(0, i); g.lineTo(80, i); g.moveTo(i, 0); g.lineTo(i, 80); }        // (nas duas bordas: a junta fica inteira na divisa)
        g.strokeStyle = 'rgba(60,62,66,0.95)'; g.lineWidth = 1.2; g.stroke();
        this.line(0, 1, 80, 1, 'rgba(255,255,255,0.22)', 0.5); this.line(1, 0, 1, 80, 'rgba(255,255,255,0.22)', 0.5);
        for (let k = 0; k < 4; k++) this.stain(r() * 80, r() * 80, 3 + r() * 5, 2.5 + r() * 4, [40, 42, 46], 0.3);
        this.crack(r() * 80, r() * 80, 9, r() * 6.3, 'rgba(50,52,56,0.7)', 0.35);
    },

    // ---------------------------------------------------------------- praça: lajotas de pedra de 2 u em xadrez de dois tons
    p_plaza(seed) {
        const g = this.g, A = ['#a19fa6', '#a7a5ac'].map(HDK.C), B = ['#908e97', '#96949d'].map(HDK.C);
        for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
            const x = tx * 40, y = ty * 40, P = (tx + ty) % 2 ? B : A, c = HDK.mix(P[0], P[1], Pixel.hash(tx, ty, seed));
            g.fillStyle = this.lin(x, y, x + 40, y + 40, [[0, HDK.t(c, 1.07)], [1, HDK.t(c, 0.94)]]); g.fillRect(x, y, 40, 40);
        }
        this.clouds(0.45, 12, seed + 1, 'soft-light', 3);
        this.grain(0.5, seed, 0.02);                                             // granito: pintas claras e escuras
        g.beginPath(); for (let i = 0; i <= 80; i += 40) { g.moveTo(i, 0); g.lineTo(i, 80); g.moveTo(0, i); g.lineTo(80, i); }
        g.strokeStyle = 'rgba(84,82,92,1)'; g.lineWidth = 1.1; g.stroke();
        g.beginPath(); for (let i = 0; i <= 80; i += 40) { g.moveTo(i + 1.2, 0); g.lineTo(i + 1.2, 80); g.moveTo(0, i + 1.2); g.lineTo(80, i + 1.2); }
        g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 0.6; g.stroke();
        g.beginPath(); for (let i = 40; i <= 80; i += 40) { g.moveTo(i - 1, 0); g.lineTo(i - 1, 80); g.moveTo(0, i - 1); g.lineTo(80, i - 1); }
        g.strokeStyle = 'rgba(50,48,58,0.25)'; g.lineWidth = 0.8; g.stroke();
        const r = this.rng;
        for (let k = 0; k < 3; k++) this.stain(r() * 80, r() * 80, 4 + r() * 6, 3 + r() * 4, [60, 56, 60], 0.12);
        for (let k = 0; k < 2; k++) { const x = (Math.floor(r() * 2) * 40) + (r() < 0.5 ? 1 : 39), y = Math.floor(r() * 2) * 40 + 1 + r() * 38; this.ell(x, y, 1.2, 0.9, 'rgba(60,58,66,0.45)'); }
    },

    // ---------------------------------------------------------------- terra (favela): chão batido, remendos de cimento, caco de tijolo
    p_earth(seed) {
        this.base(['#7d6850', '#8c765b', '#9a8468', '#a48e72', '#ae987c'], 18, seed, 3);
        this.clouds(0.5, 8, seed + 1, 'soft-light', 2);
        this.grain(0.5, seed, 0.02);
        const g = this.g, r = this.rng;
        for (let k = 0; k < 3; k++) {                                            // remendo de cimento (borda irregular, mais claro e liso)
            const cx = r() * 80, cy = r() * 80, rad = 4 + r() * 6, pts = [];
            for (let a = 0; a < 12; a++) { const an = a / 12 * Math.PI * 2, rr = rad * (0.7 + r() * 0.45); pts.push([cx + Math.cos(an) * rr, cy + Math.sin(an) * rr * 0.8]); }
            pts.push(pts[0], pts[1]);
            this.wrapAt(cx, cy, rad * 1.3, () => {
                g.save(); g.translate(0.4, 0.5); this.curve(pts); g.fillStyle = 'rgba(60,48,36,0.3)'; g.fill(); g.restore();
                this.curve(pts); g.fillStyle = this.lin(cx - rad, cy - rad, cx + rad, cy + rad, [[0, [158, 154, 146]], [1, [128, 124, 118]]]); g.fill();
            });
        }
        this.grain(0.25, seed + 3, 0, 'soft-light');
        for (let k = 0; k < 26; k++) this.pebble(r() * 80, r() * 80, 0.35 + r() * 0.6, ['#6e5a44', '#9c8a72', '#b8a88e', '#8a8580'][k % 4], r() * 3);
        for (let k = 0; k < 9; k++) {                                            // cacos de tijolo e de telha
            const x = r() * 80, y = r() * 80, w = 1 + r() * 1.6, h = 0.7 + r() * 0.8, a = r() * 3;
            this.wrapAt(x, y, 3, () => { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = 'rgba(40,24,16,0.4)'; g.fillRect(-w / 2 + 0.3, -h / 2 + 0.35, w, h); g.fillStyle = this.lin(0, -h / 2, 0, h / 2, [[0, [196, 104, 76]], [1, [150, 74, 52]]]); g.fillRect(-w / 2, -h / 2, w, h); g.restore(); });
        }
        for (let k = 0; k < 4; k++) this.stain(r() * 80, r() * 80, 3 + r() * 5, 2 + r() * 4, [50, 38, 26], 0.22);
    },

    // ---------------------------------------------------------------- terra batida de estrada / trilha: pedrinhas e marcas
    p_dirt(seed) {
        this.base(['#6f5436', '#7d5f3d', '#8a6a45', '#94724a', '#a07c52'], 18, seed, 3);
        this.clouds(0.5, 8, seed + 1, 'soft-light', 2);
        this.grain(0.5, seed, 0.02);
        const g = this.g, r = this.rng;
        for (let k = 0; k < 3; k++) {                                            // marcas de pneu: dois sulcos paralelos curtos
            const x = r() * 80, y = r() * 80, len = 14 + r() * 16, a = (r() - 0.5) * 0.4;
            this.wrap(x - 4, y - 6, x + len + 4, y + 6, () => {
                g.save(); g.translate(x, y); g.rotate(a);
                for (const o of [-2.6, 2.6]) { g.fillStyle = this.lin(0, o - 0.9, 0, o + 0.9, [[0, [60, 42, 26], 0], [0.5, [60, 42, 26], 0.32], [1, [60, 42, 26], 0]]); g.fillRect(0, o - 0.9, len, 1.8); }
                g.restore();
            });
        }
        for (let k = 0; k < 34; k++) this.pebble(r() * 80, r() * 80, 0.3 + r() * 0.65, ['#b99a70', '#5a4430', '#9a8a78', '#c9b89c'][k % 4], r() * 3);
        for (let k = 0; k < 5; k++) {                                            // tufos de capim na beira
            const x = r() * 80, y = r() * 80;
            this.wrapAt(x, y, 3, () => { for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.32; this.line(x, y, x + Math.cos(a) * (1.4 + r()), y + Math.sin(a) * (1.4 + r()), i % 2 ? '#6f8a3a' : '#8aa04a', 0.32); } });
        }
    },

    // ---------------------------------------------------------------- pedra (morro, encosta, viaduto de pedra)
    // ---------------------------------------------------------------- chão do mundo grande (render/TerrainSplat.js)
    // Mata: grama escura e úmida com relevo, folhas secas caídas (marrons, laranja) e gravetos.
    p_forest(seed) {
        this.base(['#2a5523', '#2f6127', '#356a2c', '#3d7232', '#47803a'], 18, seed, 3);
        this.clouds(0.5, 9, seed + 1, 'soft-light', 2);
        const cw = Math.round(this.w / 10), ch = Math.round(this.h / 10);
        this.relief((u, v) => { const c = Math.max(0, 1 - CityHD.worley(u, v, cw, ch, seed + 5) / 0.8); return 0.45 * c * c * (3 - 2 * c) + 0.55 * CityHD.fbm(u, v, 4, 4, seed + 7, 3); }, 0.4, Math.min(3, this.Q), 0.35, 2.2, 0.8);
        const g = this.g, r = this.rng;
        for (let k = 0; k < Math.round(this.w * this.h * 0.1); k++) { const x = r() * this.w, y = r() * this.h, a = r() * Math.PI; this.wrapAt(x, y, 3, () => this.line(x, y, x + Math.cos(a) * 1.6, y + Math.sin(a) * 1.6 - 0.6, ['#244a1f', '#2f6127', '#4f8a40'][k % 3], 0.35)); }
        const leaf = [[138, 106, 58], [168, 128, 63], [109, 82, 48], [190, 120, 50]];
        for (let k = 0; k < 70; k++) {
            const x = r() * this.w, y = r() * this.h, a = r() * Math.PI, c = leaf[k % 4];
            this.wrapAt(x, y, 2, () => { this.ell(x + 0.3, y + 0.35, 0.95, 0.45, 'rgba(10,20,6,0.3)', g, a); this.ell(x, y, 0.9, 0.42, HDK.css(HDK.t(c, 0.85 + r() * 0.3)), g, a); this.line(x - Math.cos(a) * 0.7, y - Math.sin(a) * 0.7, x + Math.cos(a) * 0.7, y + Math.sin(a) * 0.7, 'rgba(60,40,20,0.5)', 0.12); });
        }
        for (let k = 0; k < 5; k++) { const x = r() * this.w, y = r() * this.h, a = r() * Math.PI, L = 3 + r() * 4; this.wrapAt(x, y, L, () => { this.line(x + 0.3, y + 0.4, x + Math.cos(a) * L + 0.3, y + Math.sin(a) * L + 0.4, 'rgba(10,15,5,0.35)', 0.6); this.line(x, y, x + Math.cos(a) * L, y + Math.sin(a) * L, '#5a4028', 0.45); }); }
        this.grain(0.3, seed + 2, 0.01, 'soft-light');
    },
    // Cerrado (mato seco): capim amarelado em tufos com relevo, terra aparecendo e gravetos.
    p_scrub(seed) {
        this.base(['#8e8546', '#9a904d', '#a39a55', '#b0a65e', '#bab067'], 18, seed, 3);
        this.clouds(0.45, 9, seed + 1, 'soft-light', 2);
        const g = this.g, r = this.rng;
        for (let k = 0; k < 10; k++) this.stain(r() * this.w, r() * this.h, 3 + r() * 5, 2 + r() * 4, [138, 109, 74], 0.4);       // terra
        const cw = Math.round(this.w / 8), ch = Math.round(this.h / 8);
        this.relief((u, v) => { const c = Math.max(0, 1 - CityHD.worley(u, v, cw, ch, seed + 5) / 0.75); return 0.45 * c * c * (3 - 2 * c) + 0.55 * CityHD.fbm(u, v, 3, 3, seed + 7, 2); }, 0.4, Math.min(3, this.Q), 0.3, 2.2, 0.8);
        const cols = ['#6e6a35', '#8a8040', '#c8bb6a', '#d8cf86', '#e8dea0'], B = cols.map(() => []);
        for (let k = 0; k < Math.round(this.w * this.h * 0.22); k++) { const x = r() * this.w, y = r() * this.h, a = -Math.PI / 2 + (r() - 0.5) * 1.8, L = 1.4 + r() * 2.4; B[Math.floor(r() * cols.length)].push([x, y, x + Math.cos(a) * L, y + Math.sin(a) * L]); }
        B.forEach((L, ci) => this.wrap(-4, -4, this.w + 4, this.h + 4, () => {
            g.beginPath(); for (const [x0, y0, x1, y1] of L) { g.moveTo(x0 + 0.3, y0 + 0.35); g.lineTo(x1 + 0.3, y1 + 0.35); } g.strokeStyle = 'rgba(60,50,20,0.25)'; g.lineWidth = 0.4; g.stroke();
            g.beginPath(); for (const [x0, y0, x1, y1] of L) { g.moveTo(x0, y0); g.lineTo(x1, y1); } g.strokeStyle = cols[ci]; g.lineWidth = 0.3; g.stroke();
        }));
        for (let k = 0; k < 14; k++) this.pebble(r() * this.w, r() * this.h, 0.35 + r() * 0.5, ['#8a6d4a', '#a89070', '#6e5a40'][k % 3], r() * 3);
        this.grain(0.3, seed + 2, 0.01, 'soft-light');
    },
    // Brejo: lama verde-escura com poças d'água (brilho do céu e borda úmida), algas e talos de junco cortados.
    p_swamp(seed) {
        this.base(['#2f4630', '#364e33', '#3f5a3a', '#4a6640', '#566f46'], 16, seed, 3);
        this.clouds(0.5, 8, seed + 1, 'soft-light', 2);
        this.relief((u, v) => CityHD.fbm(u, v, 4, 4, seed + 7, 3), 0.4, Math.min(3, this.Q), 0.4, 3, 0.8);
        const g = this.g, r = this.rng;
        for (let k = 0; k < 6; k++) {                                                           // poças
            const cx = r() * this.w, cy = r() * this.h, rx = 3 + r() * 6, ry = 2 + r() * 4, pts = [];
            for (let a = 0; a < 14; a++) { const t = a / 14 * Math.PI * 2, f = 0.75 + r() * 0.35; pts.push([cx + Math.cos(t) * rx * f, cy + Math.sin(t) * ry * f]); }
            pts.push(pts[0], pts[1]);
            this.wrapAt(cx, cy, rx * 1.3, () => {
                g.save(); g.translate(0, -0.4); this.curve(pts); g.fillStyle = 'rgba(30,40,20,0.5)'; g.fill(); g.restore();
                this.curve(pts); g.fillStyle = this.lin(cx - rx, cy - ry, cx + rx, cy + ry, [[0, [96, 128, 140]], [0.5, [44, 74, 90]], [1, [30, 52, 64]]]); g.fill();
                g.save(); this.curve(pts); g.clip(); this.line(cx - rx * 0.6, cy - ry * 0.3, cx + rx * 0.2, cy - ry * 0.6, 'rgba(220,240,255,0.45)', 0.5); g.restore();
            });
        }
        for (let k = 0; k < 60; k++) { const x = r() * this.w, y = r() * this.h; this.wrapAt(x, y, 1, () => this.circ(x, y, 0.3 + r() * 0.35, ['#8aa457', '#a8c060', '#6a8a40'][k % 3])); }
        for (let k = 0; k < 18; k++) { const x = r() * this.w, y = r() * this.h; this.wrapAt(x, y, 2, () => { this.circ(x + 0.3, y + 0.35, 0.45, 'rgba(10,20,10,0.4)'); this.circ(x, y, 0.4, '#7c9440'); this.circ(x - 0.1, y - 0.1, 0.18, '#b6c070'); }); }
        this.grain(0.3, seed + 2, 0.01, 'soft-light');
    },
    // Plantação: fileiras a cada 0,4 u. kind 0 = terra arada (sulco e camalhão com relevo) com brotos; 1 = lavoura verde madura; 2 = trigo.
    p_farm(seed, kind) {
        const P = [['#6e5032', '#7a5a3a', '#8a6845', '#94724a'], ['#3f6a2a', '#4a7a30', '#528c36', '#5c9a3c'], ['#a8892e', '#bd9c40', '#c9a94a', '#d6b756']][kind];
        this.base(P, 20, seed, 3);
        this.clouds(0.35, 10, seed + 1, 'soft-light', 2);
        const rows = Math.round(this.h / 8);
        this.relief((u, v) => { const t = (v * rows) % 1, ridge = 0.5 + 0.5 * Math.cos((t - 0.5) * Math.PI * 2); return 0.6 * ridge + 0.4 * CityHD.fbm(u, v, 6, 6, seed + 3, 2); }, kind ? 0.22 : 0.32, Math.min(3, this.Q), kind ? 0.12 : 0.2, 2, 0.75);
        const g = this.g, r = this.rng;
        if (kind === 0) {
            for (let y = 4; y < this.h; y += 8) for (let x = 2 + r() * 3; x < this.w; x += 5 + r() * 3) this.wrapAt(x, y, 2, () => { for (let l = 0; l < 3; l++) { const a = -Math.PI / 2 + (l - 1) * 0.7; this.line(x, y, x + Math.cos(a) * 1.1, y + Math.sin(a) * 1.1, '#6fae48', 0.35); } });
            for (let k = 0; k < 24; k++) this.pebble(r() * this.w, r() * this.h, 0.3 + r() * 0.4, '#a58660', r() * 3);
        } else {
            const leafC = kind === 1 ? ['#3a6a28', '#5ca040', '#7cc050', '#9ad068'] : ['#8e7430', '#c9a94a', '#e2c868', '#f2dc8a'];
            for (let y = 4; y < this.h; y += 8) for (let x = r() * 2; x < this.w; x += 1.6 + r() * 1.2) {
                const c = leafC[Math.floor(r() * leafC.length)], L = 2 + r() * 2;
                this.wrapAt(x, y, 4, () => {
                    for (let l = 0; l < 3; l++) { const a = -Math.PI / 2 + (r() - 0.5) * 1.4; this.line(x + 0.3, y + 0.4, x + Math.cos(a) * L + 0.3, y + Math.sin(a) * L + 0.4, 'rgba(30,30,10,0.25)', 0.45); this.line(x, y, x + Math.cos(a) * L, y + Math.sin(a) * L, c, 0.38); }
                    if (kind === 2 && r() < 0.6) this.ell(x, y - L, 0.35, 0.8, '#f0d878', g, (r() - 0.5) * 0.6);
                });
            }
        }
        this.grain(0.3, seed + 2, 0.01, 'soft-light');
    },

    p_rock(seed) {
        this.base(['#5f5d5a', '#6f6d69', '#7c7a75', '#86837d', '#908d86'], 22, seed, 4);
        this.clouds(0.4, 9, seed + 1, 'soft-light', 3);
        // relevo FORTE: blocos de pedra (Worley) com bossas, estratos e fendas fundas — o lado do noroeste claro, o de trás e as fendas
        // escuros; a sombra de oclusão enche as juntas
        const cw = Math.round(this.w / 26), ch = Math.round(this.h / 18);
        this.relief((u, v) => {
            const blk = Math.min(1, CityHD.worley(u, v, cw, ch, seed + 9) / 0.7), f = CityHD.fbm(u, v, 5, 5, seed + 3, 4);
            const crack = 1 - Math.abs(2 * CityHD.fbm(u, v, 3, 3, seed + 11, 3) - 1);
            return Math.max(0, 0.5 * (1 - blk * blk) + 0.5 * f - 0.3 * Math.pow(crack, 12));
        }, 0.5, Math.min(3, this.Q), 0.55, 3.2, 0.85);
        this.grain(0.45, seed, 0.015);
        const g = this.g, r = this.rng;
        for (let k = 0; k < 5; k++) this.crack(r() * 80, r() * 80, 6, r() * 6.3, 'rgba(26,24,22,0.7)', 0.4);
        for (let k = 0; k < 12; k++) this.pebble(r() * 80, r() * 80, 0.4 + r() * 0.8, ['#9a968c', '#7a766e', '#aaa79f'][k % 3], r() * 3);
        for (let k = 0; k < 4; k++) this.stain(r() * 80, r() * 80, 4 + r() * 5, 3 + r() * 4, [70, 98, 46], 0.2);       // musgo
        void g;
    },
});
