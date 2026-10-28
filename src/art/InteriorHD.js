// ============================================================================
// InteriorHD — os INTERIORES em alta definição (lojas, casas, bancos, joalherias e o esconderijo).
//
// Os layouts continuam sendo pintados no motor de pixel art (art/ShopArt.js, 20 px/u): é ele que decide onde fica cada móvel, os
// sólidos, os pontos de uso e os enfeites. Enquanto pinta, o ShopCtx GRAVA cada chamada: as peças de cena (piso, casca da sala,
// balcão, mesa, cadeira, prateleira…) como uma operação com os seus parâmetros, e os traços soltos dos layouts (c.fr, c.disk, c.box…)
// como traços. No fim (ShopCtx.finish), a gravação é REPINTADA num canvas Q vezes maior (Q = 2..5 px de textura por pixel da arte,
// conforme Graphics.level: 40..100 px/u), na mesma ordem:
//   • cada peça de cena tem um pintor próprio aqui: materiais de verdade (lajota com rejunte e desgaste, tábua com veio, mármore com
//     veios, cimento queimado, tijolo à vista, aço escovado, granito), bordas arredondadas com contorno, sombra macia no chão;
//   • o que ainda não tem pintor próprio, e os traços soltos dos layouts, são redesenhados ampliados e suavizados (círculos redondos,
//     caixas com degradê) — sempre no mesmo lugar, para os detalhes que os layouts pintam por cima das peças continuarem encaixados;
//   • por último a luz: ambiente, poças de luz quente das lâmpadas, a "temperatura" do lugar e a vinheta.
// A parede do fundo ganha altura (sobe para o espaço vazio acima dela, como no corte de uma casa de bonecas) e quadros, janelas e
// enfeites de parede sobem junto. Coordenadas: as mesmas da arte (px de 20/u); o canvas HD é desenhado com escala Q.
// Config.art.interiorHD = false (ou ?pixel) volta à pixel art de antes.
// ============================================================================

const HDK = {
    C(c) { return typeof c === 'string' ? Pixel.hex(c) : c; },
    css(c, a = 1) { c = HDK.C(c); return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; },
    t(c, k) { c = HDK.C(c); return [Math.max(0, Math.min(255, c[0] * k)), Math.max(0, Math.min(255, c[1] * k)), Math.max(0, Math.min(255, c[2] * k))]; },
    mix(a, b, t) { a = HDK.C(a); b = HDK.C(b); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; },
    // matiz (0..360), saturação e luminosidade (0..1)
    hsl(c) {
        c = HDK.C(c); const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
        if (mx === mn) return [0, 0, l];
        const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return [h * 60, s, l];
    },
    // Que material uma cor sugere numa peça (os layouts só passam cores): madeira, metal, pedra clara ou tinta.
    mat(c) {
        const [h, s, l] = HDK.hsl(c);
        if (s < 0.1 && l > 0.55) return 'steel';
        if (h >= 12 && h <= 48 && s > 0.22 && l < 0.6) return 'wood';
        if (h >= 25 && h <= 55 && s < 0.32 && l >= 0.5) return 'stone';
        return 'paint';
    },
};

const InteriorHD = {
    EXT: 26,                  // px (da arte) que a parede do fundo ganha de altura, para cima
    // Canvas na CPU: a pintura rasteriza na hora. No canvas acelerado ela fica enfileirada e é toda feita na primeira cópia entre
    // canvases (a luz, no fim), e com o navegador ocupado isso chegava a 17 s numa sala.
    CTX: { willReadFrequently: true },
    get on() {
        if (typeof document === 'undefined' || (Config.art && Config.art.interiorHD === false)) return false;
        return !(typeof location !== 'undefined' && /[?&]pixel\b/.test(location.search));
    },
    // px de textura por px da arte: pelo nível de gráfico, sem passar do maior lado que a placa aceita.
    q(w, h) {
        const lvl = typeof Graphics !== 'undefined' ? Graphics.level : 'high';
        let Q = { low: 2, medium: 3, high: 4, hd: 5 }[lvl] || 4;
        const max = this._maxTex || (this._maxTex = (typeof Graphics !== 'undefined' && Graphics.gpu ? Math.min(8192, Graphics.gpu().maxTexture || 4096) : 4096));
        const cap = Math.min(lvl === 'hd' ? 4096 : lvl === 'low' ? 2048 : 3072, max);
        while (Q > 1 && Math.max(w, h) * Q > cap) Q--;
        return Q;
    },

    // ---------------------------------------------------------------- gravação
    // Peças de cena do ShopCtx com pintor próprio (ou, sem pintor, repintadas a partir dos traços que fizeram).
    PRIMS: ['floor', 'rug', 'shell', 'shadow', 'blk', 'stool', 'chair', 'table', 'plate', 'glass', 'bottle', 'plant', 'counter', 'shelf', 'gondola',
        'cooler', 'vending', 'poster', 'window', 'lamp', '_wallItem', '_prop', '_safeArt', '_dvrArt', '_camArt', 'oven', 'logs',
        // peças próprias dos tipos de interior (art/ShopPieces.js)
        'menuBoard', 'crossSign', 'wallMirror', 'curtain', 'gymMirrors', 'barShelf', 'noren', 'gunWall', 'graffiti', 'bankSign', 'jewelSign',
        'kitchen', 'clothesRack', 'foldTable', 'mannequin', 'counterBags', 'gymRack', 'gymBench', 'gymSpot', 'dumbbellRack', 'plateTree', 'treadmill',
        'poolTable', 'jukebox', 'trucoCards', 'fruitCrate', 'wineRack', 'candle', 'tatami', 'cushion', 'sake', 'sushiBar', 'woodStool', 'lantern',
        'ammoShelf', 'showcase', 'ammoCrates', 'gunTable', 'grilleCounter', 'oldSofa', 'oldTv', 'cardboard', 'piano', 'bankSafe', 'elevator', 'lasers',
        'vaultDoor', 'monitor'],
    // Peças da parede: pintadas logo depois da casca, antes dos móveis (o que estiver na frente as cobre).
    WALL: { poster: 1, window: 1, _wallItem: 1, _camArt: 1, _cam: 1, menuBoard: 1, crossSign: 1, wallMirror: 1, curtain: 1, gymMirrors: 1, barShelf: 1,
        noren: 1, gunWall: 1, graffiti: 1, bankSign: 1, jewelSign: 1 },
    // Peças dos layouts de casa, banco e joalheria (funções do ShopStyles que recebem o ShopCtx primeiro).
    STYLE_PRIMS: ['_bed', '_fridge', '_safe', '_chest', '_tv', '_sofa', '_desk', '_cam', '_vitrine'],
    RAW: ['px', 'fr', 'bl', 'blPx', 'ln', 'ring', 'disk', 'box'],

    attach(S) {
        if (!this._styled) this._wrapStyles();
        const rec = S._hd = { ops: [], prim: 0, raw: 0, cur: null }, c = S.c;
        c._hd = rec;
        for (const k of this.RAW) {
            const f = c[k];
            c[k] = (...a) => {
                if (rec.raw === 0) { const dst = rec.prim ? rec.cur.sub : rec.ops; if (dst) dst.push({ k, a }); }
                rec.raw++;
                try { return f(...a); } finally { rec.raw--; }
            };
        }
        for (const k of this.PRIMS) {
            const f = S[k];
            if (typeof f !== 'function') continue;
            S[k] = (...a) => this._prim(rec, k, a, () => f.apply(S, a));
        }
    },
    _prim(rec, k, a, fn) {
        if (rec.prim > 0 || rec.raw > 0) return fn();
        const op = { k, a, prim: true, sub: HDPainter.prototype['p_' + k] ? null : [] };      // (os traços de dentro só servem a quem não tem pintor)
        rec.ops.push(op); rec.prim++; rec.cur = op;
        try { return (op.r = fn()); } finally { rec.prim--; rec.cur = null; }
    },
    _wrapStyles() {
        this._styled = true;
        for (const k of this.STYLE_PRIMS) {
            const f = ShopStyles[k];
            if (typeof f !== 'function') continue;
            ShopStyles[k] = function (S, ...a) { return S && S._hd ? InteriorHD._prim(S._hd, k, a, () => f.call(this, S, ...a)) : f.call(this, S, ...a); };
        }
        const grain = HouseArt._grain;
        HouseArt._grain = function (c, ...a) { const rec = c && c._hd; if (rec && rec.raw === 0) { const dst = rec.prim ? rec.cur.sub : rec.ops; if (dst) dst.push({ k: 'grain', a }); } return grain.call(this, c, ...a); };
    },

    // ---------------------------------------------------------------- repintura
    // Devolve o "canvas" que o Interiors transforma em textura (toTexture), como o PixelCanvas.
    render(S, env) {
        const t0 = performance.now(), Q = this.q(S.wpx, S.hpxTot);
        const cv = document.createElement('canvas'); cv.width = S.wpx * Q; cv.height = S.hpxTot * Q;
        const g = cv.getContext('2d', InteriorHD.CTX);
        g.setTransform(Q, 0, 0, Q, 0, 0); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.lineJoin = 'round'; g.lineCap = 'round';
        const P = new HDPainter(g, S, Q, cv);
        P.paint(S._hd.ops);
        P.post(env);
        this.lastMs = performance.now() - t0;
        return InteriorHD.wrap(cv, Q);
    },
    // O canvas HD com a mesma cara do PixelCanvas para quem faz a textura: a textura sai direto do canvas (cópia na placa, sem ler os
    // pixels de volta) e, quando a sala sai do cache (Interiors._room) e a textura é descartada, o canvas é liberado na hora — com
    // vários quadros grandes esperando o coletor de lixo, a memória de canvas do navegador estoura e pintar uma sala passava de 10 s.
    wrap(cv, Q) {
        return {
            w: cv.width, h: cv.height, hd: Q, canvas: cv,
            toTexture(scene) {
                const tex = new BABYLON.DynamicTexture('roomHD', cv, scene, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
                tex.update(false);
                tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
                tex.anisotropicFilteringLevel = 4;
                const dispose = tex.dispose.bind(tex);
                tex.dispose = () => { dispose(); cv.width = cv.height = 0; };
                return tex;
            },
        };
    },
    // Canvas de apoio reaproveitado (máscara, mapa de luz): um por papel, redimensionado quando precisa.
    _aux: {},
    aux(role, w, h) {
        const c = this._aux[role] || (this._aux[role] = document.createElement('canvas'));
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } else { const g = c.getContext('2d', InteriorHD.CTX); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.filter = 'none'; g.clearRect(0, 0, w, h); }
        return c;
    },

    // ---------------------------------------------------------------- texturas de apoio (cache)
    _tiles: {},
    // Grão por pixel (cinza 128 ± ruído): aplicado com 'overlay' não muda a média, só dá textura.
    grain(seed = 1, amp = 60, size = 192) {
        const key = 'g' + seed + '_' + amp + '_' + size;
        if (this._tiles[key]) return this._tiles[key];
        const cv = document.createElement('canvas'); cv.width = cv.height = size;
        const g = cv.getContext('2d', InteriorHD.CTX), im = g.createImageData(size, size), d = im.data;
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const n = (Pixel.hash(x, y, seed) - 0.5) * amp + (Pixel.noise(x, y, 6, seed + 3, size / 6, size / 6) - 0.5) * amp * 0.8, v = 128 + n, k = (y * size + x) * 4;
            d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255;
        }
        g.putImageData(im, 0, 0);
        return (this._tiles[key] = cv);
    },
    // Manchas grandes e macias (valor 0..255 em cinza), para "sujar" e variar superfícies.
    clouds(seed = 1, size = 128, cell = 32) {
        const key = 'c' + seed + '_' + size + '_' + cell;
        if (this._tiles[key]) return this._tiles[key];
        const cv = document.createElement('canvas'); cv.width = cv.height = size;
        const g = cv.getContext('2d', InteriorHD.CTX), im = g.createImageData(size, size), d = im.data, w = size / cell;
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const n = Pixel.noise(x, y, cell, seed, w, w) * 0.65 + Pixel.noise(x, y, cell / 2, seed + 9, w * 2, w * 2) * 0.35, v = 255 * n, k = (y * size + x) * 4;
            d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255;
        }
        g.putImageData(im, 0, 0);
        return (this._tiles[key] = cv);
    },
};

// ============================================================================
// HDPainter — pinta a gravação de um ShopCtx num contexto 2D já escalado (1 unidade = 1 px da arte).
// ============================================================================
class HDPainter {
    constructor(g, S, Q, cv) {
        this.g = g; this.S = S; this.Q = Q; this.cv = cv;
        this.rng = Pixel.rng(S.seed * 13 + 7);
        this.EXT = InteriorHD.EXT;
        this.top = S.nY - S.faceH - this.EXT;           // topo da parede do fundo (alta)
    }

    // ---------------------------------------------------------------- utilidades
    rnd(a = 0, b = 1) { return a + (b - a) * this.rng(); }
    C(c, a = 1) { return HDK.css(c, a); }
    lin(x0, y0, x1, y1, stops) { const gr = this.g.createLinearGradient(x0, y0, x1, y1); for (const [o, c, a] of stops) gr.addColorStop(o, HDK.css(c, a === undefined ? 1 : a)); return gr; }
    rad(x, y, r0, r1, stops) { const gr = this.g.createRadialGradient(x, y, r0, x, y, r1); for (const [o, c, a] of stops) gr.addColorStop(o, HDK.css(c, a === undefined ? 1 : a)); return gr; }
    rr(x, y, w, h, r) {
        const g = this.g; r = Math.max(0, Math.min(r, w / 2, h / 2));
        g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    }
    fillRR(x, y, w, h, r, fill) { this.rr(x, y, w, h, r); this.g.fillStyle = fill; this.g.fill(); }
    strokeRR(x, y, w, h, r, col, lw = 0.5) { this.rr(x + lw / 2, y + lw / 2, w - lw, h - lw, r); this.g.strokeStyle = col; this.g.lineWidth = lw; this.g.stroke(); }
    ell(x, y, rx, ry, fill) { const g = this.g; g.beginPath(); g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); }
    circ(x, y, r, fill) { this.ell(x, y, r, r, fill); }
    line(x0, y0, x1, y1, col, lw = 0.5) { const g = this.g; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.strokeStyle = col; g.lineWidth = lw; g.stroke(); }
    // Sombra macia (borrada) de um retângulo arredondado — desenhada por shadowBlur com a forma fora da tela.
    soft(x, y, w, h, a = 0.35, blur = 3, r = 2, col = [14, 9, 5]) {
        const g = this.g, Q = this.Q, OFF = 40000;
        g.save();
        g.shadowColor = HDK.css(col, a); g.shadowBlur = blur * Q; g.shadowOffsetX = OFF * Q; g.shadowOffsetY = 0;
        g.fillStyle = '#000'; this.rr(x - OFF, y, w, h, r); g.fill();
        g.restore();
    }
    softEll(x, y, rx, ry, a = 0.35, blur = 3, col = [14, 9, 5]) {
        const g = this.g, Q = this.Q, OFF = 40000;
        g.save();
        g.shadowColor = HDK.css(col, a); g.shadowBlur = blur * Q; g.shadowOffsetX = OFF * Q;
        g.beginPath(); g.ellipse(x - OFF, y, rx, ry, 0, 0, Math.PI * 2); g.fillStyle = '#000'; g.fill();
        g.restore();
    }
    // Grão por pixel (overlay) num retângulo; `amt` 0..1.
    grain(x, y, w, h, amt = 0.3, seed = 1, comp = 'overlay') {
        if (amt <= 0 || w <= 0 || h <= 0) return;
        const g = this.g, Q = this.Q;
        g.save();
        g.beginPath(); g.rect(x, y, w, h); g.clip();
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = comp; g.globalAlpha = Math.min(1, amt);
        const pat = g.createPattern(InteriorHD.grain((seed >>> 0) % 3 + 1), 'repeat'), o = ((seed * 37) >>> 0) % 192;      // (3 ladrilhos para tudo, deslocados)
        g.translate(o, o * 0.61); g.fillStyle = pat;
        g.fillRect(Math.floor(x * Q) - o, Math.floor(y * Q) - o * 0.61, Math.ceil(w * Q) + 1, Math.ceil(h * Q) + 1);
        g.restore();
    }
    // Manchas grandes (nuvens) escalonadas: `scale` px da arte por célula de 32 px do ladrilho.
    clouds(x, y, w, h, amt = 0.2, seed = 1, scale = 1, comp = 'soft-light') {
        if (amt <= 0 || w <= 0 || h <= 0) return;
        const g = this.g, tile = InteriorHD.clouds((seed >>> 0) % 3 + 1);
        g.save();
        g.beginPath(); g.rect(x, y, w, h); g.clip();
        g.globalCompositeOperation = comp; g.globalAlpha = Math.min(1, amt);
        const s = scale, tw = tile.width * s, sh = ((seed * 53) >>> 0) % 97 / 97 * tw;                                  // (deslocado pela semente)
        const ox = Math.floor((x - sh) / tw) * tw + sh, oy = Math.floor((y - sh * 0.7) / tw) * tw + sh * 0.7;
        for (let yy = oy; yy < y + h; yy += tw) for (let xx = ox; xx < x + w; xx += tw) g.drawImage(tile, xx, yy, tw, tw);
        g.restore();
    }
    clip(x, y, w, h, fn) { const g = this.g; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); try { fn(); } finally { g.restore(); } }

    // ---------------------------------------------------------------- despacho
    // Peças de parede (quadros, janelas, enfeites, câmeras) são pintadas logo depois da casca da sala, antes dos móveis: o que
    // estiver na frente as cobre, como numa parede de verdade.
    // Fundo opaco no retângulo da sala (o que nenhuma peça cobrir não fica transparente — a luz do fim conta com isso).
    base() {
        const S = this.S, cH = Math.round(S.T * S.PPU), y0 = Math.max(0, this.top - cH), g = this.g;
        g.fillStyle = '#2a2420'; g.fillRect(S.X(0), y0, S.X(S.W) - S.X(0), S.Y(0) - y0);
    }
    paint(ops) {
        const WALL = InteriorHD.WALL;
        this.base();
        this.wallOps = ops.filter((o) => o.prim && WALL[o.k]);
        for (const op of ops) {
            if (op.prim && WALL[op.k]) continue;
            this.run(op);
            if (op.k === 'shell') { for (const w of this.wallOps) this.run(w); this.floorFx(); }
        }
    }
    run(op) {
        if (!op.prim) { this.raw(op); return; }
        const f = this['p_' + op.k];
        if (f) {
            const g = this.g; let ok = false;
            g.save();
            try { ok = f.call(this, op, ...op.a) !== false; } finally { g.restore(); }
            if (ok) return;
        }
        for (const s of op.sub || []) this.raw(s);           // sem pintor próprio (ou ele recusou): os traços que a peça fez, ampliados
    }

    // ---------------------------------------------------------------- traços soltos, ampliados e suavizados
    raw(op) {
        const g = this.g, a = op.a;
        switch (op.k) {
            case 'px': { const [x, y, col, al = 255] = a; g.fillStyle = HDK.css(col, al / 255); g.fillRect(x, y, 1, 1); break; }
            case 'fr': { const [x, y, w, h, col, al = 255] = a; if (w <= 0 || h <= 0) break; g.fillStyle = HDK.css(col, al / 255); g.fillRect(x, y, w, h); break; }
            case 'bl': {
                const [x, y, w, h, col, al] = a; if (w <= 0 || h <= 0) break;
                const cc = HDK.C(col);
                if (cc[0] < 32 && cc[1] < 32 && cc[2] < 32 && al < 0.5) { this.soft(x + 0.5, y + 0.5, w, h, Math.min(0.6, al * 1.5), Math.min(3, 1 + Math.min(w, h) * 0.15), 1.5); break; }      // sombra: macia
                g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = HDK.css(col, al); g.fillRect(x, y, w, h); g.restore(); break;
            }
            case 'blPx': { const [x, y, col, al] = a; g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = HDK.css(col, al); g.fillRect(x, y, 1, 1); g.restore(); break; }
            case 'ln': { const [x0, y0, x1, y1, col, al = 255] = a; g.save(); g.lineCap = 'round'; this.line(x0 + 0.5, y0 + 0.5, x1 + 0.5, y1 + 0.5, HDK.css(col, al / 255), 1); g.restore(); break; }
            case 'ring': { const [cx, cy, r, col] = a; g.beginPath(); g.arc(cx + 0.5, cy + 0.5, Math.max(0.5, r), 0, Math.PI * 2); g.strokeStyle = HDK.css(col); g.lineWidth = 0.95; g.stroke(); break; }
            case 'disk': { const [cx, cy, r, col, al = 255] = a; this.circ(cx + 0.5, cy + 0.5, r + 0.4, HDK.css(col, al / 255)); break; }
            case 'box': this.box(...a); break;
            case 'grain': { const [x, y, w, h, amt, seed] = a; this.grain(x, y, w, h, Math.min(0.6, amt / 22), seed | 0); break; }
        }
    }
    // ---------------------------------------------------------------- piso já com a casca: sombra no pé das paredes, caminho gasto, brilho
    floorFx() {
        const S = this.S, g = this.g, T = S.T, x0 = S.X(T), x1 = S.X(S.W - T), y0 = S.nY, y1 = S.Y(T), fam = ShopCtx.fam(S.style);
        g.save();
        g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
        // pé da parede do fundo e das laterais: sombra de contato larga e macia
        g.fillStyle = this.lin(0, y0, 0, y0 + 16, [[0, [16, 10, 6], 0.5], [0.35, [16, 10, 6], 0.18], [1, [16, 10, 6], 0]]); g.fillRect(x0, y0, x1 - x0, 16);
        g.fillStyle = this.lin(x0, 0, x0 + 12, 0, [[0, [16, 10, 6], 0.42], [1, [16, 10, 6], 0]]); g.fillRect(x0, y0, 12, y1 - y0);
        g.fillStyle = this.lin(x1, 0, x1 - 12, 0, [[0, [16, 10, 6], 0.42], [1, [16, 10, 6], 0]]); g.fillRect(x1 - 12, y0, 12, y1 - y0);
        g.fillStyle = this.lin(0, y1, 0, y1 - 7, [[0, [16, 10, 6], 0.3], [1, [16, 10, 6], 0]]); g.fillRect(x0, y1 - 7, x1 - x0, 7);
        // caminho gasto da porta para dentro
        const dc = S.X((S.door.x0 + S.door.x1) / 2);
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = this.rad(dc, y1, 2, (y1 - y0) * 0.55, [[0, [200, 190, 175], 0.5], [1, [255, 255, 255], 0]]);
        g.fillRect(x0, y0, x1 - x0, y1 - y0);
        g.globalCompositeOperation = 'source-over';
        // piso encerado (lajota, xadrez, mármore): as luzes do teto refletidas como manchas claras alongadas
        if (/^(checker|tile|marble)$/.test(S._floorKind || '')) {
            const tubes = /^(store|gym)$/.test(fam);
            g.globalCompositeOperation = 'screen';
            for (const L of S.lights) {
                const rx = L.r * (tubes ? 0.42 : 0.26), ry = L.r * (tubes ? 0.06 : 0.16), a = Math.min(0.5, L.a) * (tubes ? 0.5 : 0.42);
                g.save(); g.translate(L.x, L.y + 4); g.scale(1, ry / rx);
                g.fillStyle = this.rad(0, 0, 0, rx, [[0, [255, 250, 240], a], [0.5, [255, 250, 240], a * 0.35], [1, [255, 250, 240], 0]]);
                g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore();
            }
        }
        g.restore();
    }

    // ---------------------------------------------------------------- luz, temperatura e vinheta (último passo)
    post(env = {}) {
        const S = this.S, g = this.g, cv = this.cv, W = S.wpx, H = S.hpxTot, fam = ShopCtx.fam(S.style), Q = this.Q;
        const vignette = env.vignette === undefined ? 0.34 : env.vignette, lights = S.lights;
        // A sala ocupa o retângulo R (da tampa da parede do fundo até a frente); tudo dentro dele está pintado (opaco) e fora fica
        // transparente: a luz é aplicada só dentro de R e o que vazou para fora é apagado no fim.
        const cH = Math.round(S.T * S.PPU), R = [S.X(0), Math.max(0, this.top - cH), S.X(S.W), S.Y(0)];
        g.save(); g.beginPath(); g.rect(R[0], R[1], R[2] - R[0], R[3] - R[1]); g.clip();
        // mapa de luz (na resolução da arte: só degradês): ambiente um tico escuro + as lâmpadas + a vinheta, por multiplicação
        const amb = { fine: 0.62, bar: 0.58, food: 0.7, home: 0.68, home_lux: 0.76, lux: 0.82, boca: 0.56, store: 0.85, gym: 0.78, guns: 0.72, boutique: 0.78 }[fam] || 0.78;
        const gain = fam === 'store' || fam === 'gym' ? 0.7 : 1.05;
        const L = InteriorHD.aux('light', W, H), l = L.getContext('2d', InteriorHD.CTX);
        const a8 = Math.round(amb * 255); l.fillStyle = `rgb(${a8},${a8},${a8})`; l.fillRect(0, 0, W, H);
        l.globalCompositeOperation = 'lighter';
        for (const Lt of lights) {
            const k = Math.min(1, Lt.a * gain) * 255 * 0.75, R2 = Lt.r * 1.25;
            l.fillStyle = this._radOn(l, Lt.x, Lt.y, R2, [[0, [k, k, k]], [0.4, [k * 0.55, k * 0.55, k * 0.55]], [1, [0, 0, 0]]]);
            l.fillRect(Lt.x - R2, Lt.y - R2, R2 * 2, R2 * 2);
        }
        l.globalCompositeOperation = 'source-over';
        const vx = W / 2, vy = H * 0.55, vr = Math.hypot(W * 0.62, H * 0.7);
        l.save(); l.translate(vx, vy); l.scale(1, (H * 0.7) / (W * 0.62));
        const vg = l.createRadialGradient(0, 0, W * 0.62 * 0.55, 0, 0, W * 0.62 * 1.25); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${Math.min(0.9, vignette * 1.9)})`);
        l.fillStyle = vg; l.fillRect(-vr * 2, -vr * 2, vr * 4, vr * 4); l.restore();
        g.globalCompositeOperation = 'multiply'; g.drawImage(L, 0, 0, W, H);
        // brilho colorido das lâmpadas (soma suave)
        g.globalCompositeOperation = 'screen';
        for (const Lt of lights) {
            const a = Math.min(0.7, Lt.a) * 0.62, R2 = Lt.r * (1 + Math.max(0, Lt.a - 0.4));          // (luz forte — o fogo do forno — esparrama mais)
            g.fillStyle = this.rad(Lt.x, Lt.y, 0, R2, [[0, Lt.col, a], [0.35, Lt.col, a * 0.4], [1, Lt.col, 0]]);
            g.fillRect(Lt.x - R2, Lt.y - R2, R2 * 2, R2 * 2);
        }
        // temperatura do lugar
        const tint = ({ fine: [255, 196, 120], bar: [255, 180, 100], food: [255, 205, 150], home: [255, 205, 150], home_lux: [255, 215, 170], boca: [255, 190, 110],
            store: [190, 215, 255], gym: [190, 215, 255], lux: [255, 240, 225], guns: [200, 230, 225], boutique: [255, 225, 220] })[fam];
        if (tint) { g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.42; g.fillStyle = HDK.css(tint); g.fillRect(R[0], R[1], R[2] - R[0], R[3] - R[1]); g.globalAlpha = 1; }
        // cor mais viva e um pouco mais de contraste (High e HD, onde o navegador tem filtro de canvas: é uma passada a mais)
        if ('filter' in g && Q >= 4) { g.globalCompositeOperation = 'copy'; g.filter = 'saturate(1.22) contrast(1.06)'; g.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, cv.width / Q, cv.height / Q); g.filter = 'none'; }
        g.restore();
        // fora da sala: transparente
        g.clearRect(0, 0, W, R[1]); g.clearRect(0, R[3], W, H - R[3]); g.clearRect(0, R[1], R[0], R[3] - R[1]); g.clearRect(R[2], R[1], W - R[2], R[3] - R[1]);
    }
    _radOn(ctx, x, y, r, stops) { const gr = ctx.createRadialGradient(x, y, 0, x, y, r); for (const [o, c, a] of stops) gr.addColorStop(o, HDK.css(c, a === undefined ? 1 : a)); return gr; }

    // Caixa: degradê (luz em cima), cantos arredondados, contorno e friso de luz — o box() da pixel art em alta.
    box(x, y, w, h, base, hi, lo, edge) {
        if (w <= 0 || h <= 0) return;
        const r = Math.min(1.1, w / 4, h / 4);
        this.fillRR(x, y, w, h, r, this.lin(0, y, 0, y + h, [[0, hi || base], [Math.min(0.35, 2 / h), base], [1, lo ? HDK.mix(base, lo, 0.7) : base]]));
        if (hi && w > 3 && h > 3) { this.g.globalAlpha = 0.55; this.line(x + r + 0.4, y + 0.9, x + w - r - 0.4, y + 0.9, HDK.css(hi), 0.5); this.g.globalAlpha = 1; }
        if (edge) this.strokeRR(x, y, w, h, r, HDK.css(edge, 0.9), Math.min(0.6, w / 4, h / 4));
    }
}
