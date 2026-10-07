// ============================================================================
// DollArt — o boneco do Inventário → Equipamento em PIXEL ART (retrato de RPG: cabelo espetado, contorno escuro, luz vinda
// da esquerda, de pé num pedestal de pedra), montado na hora a partir do que está vestido: cada peça pinta a sua parte com
// as cores de Outfit.ITEMS[*].col, a mochila muda a pose (mão na alça), a arma vai na mão direita e a bolsa de mão na esquerda.
//   Desenho numa grade de 100×200 "pixels de arte" (o EquipUI amplia por um fator inteiro, sem suavizar):
//     1) formas (polígono, elipse, cápsula) gravam em cada pixel o MATERIAL e a PEÇA (com a ordem em que foi desenhada);
//     2) sombreamento por peça: borda direita/de baixo escurece, esquerda/de cima clareia (rampa de 5 tons do material);
//        onde uma peça fica por cima de outra, a de baixo ganha uma linha escura (contorno interno);
//     3) contorno externo de 1 pixel e os detalhes finos (olhos, costuras, cadarço, corrente…) pintados por cima.
//   DollArt.render(spec) → { canvas (100×200), anchors: { encaixe: [x, y] nas coordenadas 200×400 do EquipUI } }. Cache pelo spec.
// ============================================================================

class DollRaster {
    constructor(w, h) {
        this.w = w; this.h = h;
        const n = w * h;
        this.mat = new Int16Array(n).fill(-1);      // material (índice em this.mats)
        this.part = new Int16Array(n).fill(-1);     // peça (= ordem de desenho: maior fica por cima)
        this.lv = new Int8Array(n);                 // tom fixo: 1..5 = da peça (respeita contorno), 11..15 = marcado (manda)
        this.rgb = new Int32Array(n).fill(-1);      // cor direta (ícones de arma)
        this.mats = []; this._mi = {}; this.parts = {}; this.np = 0;
        this.cur = 0; this.curMat = 0; this.fix = 0;
    }

    material(col) {
        if (this._mi[col] == null) { this._mi[col] = this.mats.length; this.mats.push(DollArt.ramp(col)); }
        return this._mi[col];
    }

    // Começa uma peça nova; com nome, continua a que já existe (braço + mão = uma peça só, sem linha entre eles).
    piece(col, name, level) {
        if (name && this.parts[name] != null) this.cur = this.parts[name];
        else { this.cur = this.np++; if (name) this.parts[name] = this.cur; }
        this.curMat = this.material(col);
        this.fix = level == null ? 0 : level + 1;
        return this;
    }

    plot(x, y) {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
        const i = y * this.w + x;
        this.mat[i] = this.curMat; this.part[i] = this.cur; this.lv[i] = this.fix; this.rgb[i] = -1;
    }

    rect(x, y, w, h) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.plot(x + i, y + j); return this; }

    ellipse(cx, cy, rx, ry) {
        for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
            const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
            if (dx * dx + dy * dy <= 1) this.plot(x, y);
        }
        return this;
    }

    // Polígono (par-ímpar, pelo centro dos pixels): aceita formas côncavas, como o cabelo.
    poly(pts) {
        const ys = pts.map((p) => p[1]);
        for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
            const cy = y + 0.5, xs = [];
            for (let i = 0; i < pts.length; i++) {
                const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
                if ((ay <= cy) !== (by <= cy)) xs.push(ax + (cy - ay) / (by - ay) * (bx - ax));
            }
            xs.sort((a, b) => a - b);
            for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.ceil(xs[k] - 0.5); x + 0.5 <= xs[k + 1]; x++) this.plot(x, y);
        }
        return this;
    }

    // Cápsula (segmento grosso), com raio variando de r0 a r1: braços, alças, taco.
    capsule(x0, y0, x1, y1, r0, r1 = r0) {
        const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1, R = Math.max(r0, r1);
        for (let y = Math.floor(Math.min(y0, y1) - R); y <= Math.ceil(Math.max(y0, y1) + R); y++)
            for (let x = Math.floor(Math.min(x0, x1) - R); x <= Math.ceil(Math.max(x0, x1) + R); x++) {
                const px = x + 0.5, py = y + 0.5, t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L2));
                const ex = px - (x0 + dx * t), ey = py - (y0 + dy * t), rr = r0 + (r1 - r0) * t;
                if (ex * ex + ey * ey <= rr * rr) this.plot(x, y);
            }
        return this;
    }

    partAt(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : this.part[y * this.w + x]; }
    is(x, y, name) { return this.parts[name] != null && this.partAt(x, y) === this.parts[name]; }

    // Força o tom de um pixel já pintado (dobras, costuras, brilho); com `name`, só se for daquela peça.
    mark(x, y, L, name) {
        if (this.partAt(x, y) < 0 || (name && !this.is(x, y, name))) return;
        this.lv[y * this.w + x] = 11 + L;
    }
    markLine(x0, y0, x1, y1, L, name) {
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
        for (let i = 0; i <= n; i++) this.mark(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), L, name);
    }

    // Imagem (ícone de arma) reduzida para a grade: vira uma peça de cores diretas, com contorno como o resto.
    image(img, x, y, w, h) {
        const b = DollRaster.trim(img), c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, b[0], b[1], b[2], b[3], 0, 0, w, h);
        const d = ctx.getImageData(0, 0, w, h).data, id = this.np++;
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
            const o = (j * w + i) * 4, px = x + i, py = y + j;
            if (d[o + 3] < 110 || px < 0 || py < 0 || px >= this.w || py >= this.h) continue;
            const k = py * this.w + px;
            this.part[k] = id; this.mat[k] = 0; this.lv[k] = 0; this.rgb[k] = (d[o] << 16) | (d[o + 1] << 8) | d[o + 2];
        }
    }

    // Caixa [x, y, w, h] do que não é transparente numa imagem (ícones têm margem).
    static trim(img) {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        return x1 < 0 ? [0, 0, img.width, img.height] : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
    }

    // Formas → pixels RGBA (sombreamento + contornos).
    bake() {
        const { w, h } = this, P = this.part, data = new Uint8ClampedArray(w * h * 4), OUT = DollArt.OUT;
        const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : P[y * w + x]);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = y * w + x, p = P[i], o = i * 4;
            if (p < 0) {
                if (at(x - 1, y) >= 0 || at(x + 1, y) >= 0 || at(x, y - 1) >= 0 || at(x, y + 1) >= 0) { data[o] = OUT[0]; data[o + 1] = OUT[1]; data[o + 2] = OUT[2]; data[o + 3] = 255; }
                continue;
            }
            let c;
            if (this.rgb[i] >= 0) { const v = this.rgb[i]; c = [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
            else {
                const lv = this.lv[i];
                let L;
                if (lv >= 11) L = lv - 11;
                else if (at(x - 1, y) > p || at(x + 1, y) > p || at(x, y - 1) > p || at(x, y + 1) > p) L = 0;   // outra peça por cima
                else if (lv) L = lv - 1;
                else if (at(x + 1, y) !== p || at(x, y + 1) !== p) L = 1;
                else if (at(x - 1, y) !== p || at(x, y - 1) !== p) L = 3;
                else if (at(x + 2, y) !== p) L = 1;
                else L = 2;
                c = this.mats[this.mat[i]][L];
            }
            data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
        }
        return data;
    }
}

const DollArt = {
    W: 100, H: 200,
    OUT: [16, 12, 22],
    HAIR: '#6b4428',
    _cache: new Map(),

    // 0 contorno interno | 1 sombra (fria) | 2 base | 3 luz (quente) | 4 brilho
    ramp(col) {
        const c = Pixel.hex(col), mix = Pixel.mix, cl = Pixel.clamp, sc = Pixel.scale;
        return [
            cl(mix(sc(c, 0.34), [14, 10, 24], 0.45)),
            cl(mix(sc(c, 0.7), [36, 30, 64], 0.2)),
            cl(c),
            cl(mix(sc(c, 1.1), [255, 240, 214], 0.17)),
            cl(mix(c, [255, 250, 238], 0.45)),
        ];
    },

    // Dígitos 3×5 (número da camisa de time).
    DIGITS: { 0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'] },

    // spec: cores (skin, hair, shirt, sleeve, forearm, pants, shoes), peças (top, legs, shoe), acessórios (eyes, neck, wrist,
    // gloves: bool), bag ('pack'|'tactical'|'cross'|'briefcase'|'duffel'|'suitcase'|null), vest (0|1|2), weapon (id|null),
    // icon (canvas da arma de fogo, ou null).
    render(s) {
        const key = JSON.stringify(s, (k, v) => (k === 'icon' ? undefined : v));
        const hit = this._cache.get(key);
        if (hit) return hit;

        const r = new DollRaster(this.W, this.H), A = {};
        const skin = s.skin, hair = s.hair || this.HAIR, top = s.top, legs = s.legs, shoe = s.shoe;
        const sleeveT = s.sleeve === skin ? 'tank' : s.forearm === skin ? 'short' : 'long';
        const pack = s.bag === 'pack' || s.bag === 'tactical', armed = !!s.weapon;
        const boot = shoe === 'coturno', high = shoe === 'tenis_basquete', flip = shoe === 'chinelo', dress = shoe === 'sapato_social';
        const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        const GLOVE = '#2e241e', GOLD = '#d4a232';

        // ---------------------------------------------------------------- pedestal de pedra e mato
        const STONE = '#5a5d6a';
        r.piece(STONE, 'pedSide', 1).ellipse(50, 191, 41, 9);
        r.piece(STONE, 'pedTop', 2).ellipse(50, 186, 41, 9);
        r.piece(STONE, 'pedTop', 1).ellipse(51, 185.5, 23, 3.5);                     // sombra dos pés
        for (let a = 3.3; a < 4.9; a += 0.04) r.mark(Math.round(50 + 39.5 * Math.cos(a)), Math.round(186 + 8 * Math.sin(a)), 3, 'pedTop');
        for (let a = 0.35; a < 2.8; a += 0.05) r.mark(Math.round(50 + 40 * Math.cos(a)), Math.round(191 + 8 * Math.sin(a)), 0, 'pedSide');
        r.markLine(17, 186, 22, 188, 1, 'pedTop'); r.markLine(22, 188, 26, 187, 1, 'pedTop'); r.markLine(70, 190, 75, 188, 1, 'pedTop'); r.markLine(75, 188, 78, 189, 1, 'pedTop');
        for (const [x, y] of [[29, 191], [64, 193], [84, 184], [44, 192]]) { r.mark(x, y, 1, 'pedTop'); r.mark(x + 1, y, 1, 'pedTop'); r.mark(x, y - 1, 3, 'pedTop'); }
        for (const [x, y] of [[30, 196], [57, 199], [73, 196]]) { r.mark(x, y, 0, 'pedSide'); r.mark(x + 1, y, 0, 'pedSide'); }
        const GRASS = '#4c9a3c';
        r.piece(GRASS, 'grassL').poly([[15, 186], [16, 179], [18, 186]]).poly([[17, 186], [19, 176], [21, 186]]).poly([[20, 186], [23, 180], [23, 186]]);
        r.piece(GRASS, 'grassR').poly([[77, 194], [77, 188], [80, 194]]).poly([[79, 194], [81, 186], [83, 194]]).poly([[82, 194], [85, 189], [85, 194]]);

        // ---------------------------------------------------------------- mochila (atrás do corpo)
        const PACK = s.bag === 'tactical' ? '#434a33' : '#7a5634', STRAP = s.bag === 'tactical' ? '#2b2f22' : '#4a3221';
        if (s.bag === 'pack') {
            r.piece(PACK, 'pack').poly([[24, 62], [35, 58], [41, 62], [41, 112], [38, 117], [22, 117], [19, 112], [19, 70]]);
            r.piece(PACK, 'flap').poly([[22, 62], [35, 58], [40, 62], [39, 78], [20, 78], [19, 70]]);
            r.piece(PACK, 'pocket').rect(21, 93, 14, 17);
            A.bag = [24, 90];
        } else if (s.bag === 'tactical') {
            r.piece(PACK, 'pack').poly([[27, 58], [73, 58], [76, 64], [76, 116], [24, 116], [24, 64]]);
            r.piece(PACK, 'pocketL').rect(21, 76, 7, 24);
            r.piece(PACK, 'pocketR').rect(72, 76, 7, 24);
            A.bag = [24, 84];
        }

        // ---------------------------------------------------------------- calçados (antes da calça: a barra cai por cima)
        const cL = 36.5, cR = 63.5;
        const shoeTop = boot ? 158 : high ? 163 : dress ? 175 : 171;
        const drawShoe = (c, side) => {
            const o = side * 1.5, nm = 'shoe' + side;
            if (flip) {
                r.piece(skin, 'foot' + side).poly([[c - 5, 171], [c + 5, 171], [c + 7 + o, 180], [c + 7 + o, 184], [c - 7 + o, 184], [c - 7 + o, 180]]);
                r.piece(s.shoes, nm).rect(Math.round(c - 9 + o), 184, 19, 3);
                return;
            }
            r.piece(s.shoes, nm).poly([[c - 6.5, shoeTop], [c + 6.5, shoeTop], [c + 7.5, 176], [c + 9.5 + o, 181], [c + 9.5 + o, 186], [c - 9.5 + o, 186], [c - 9.5 + o, 181], [c - 7.5, 176]]);
            if (dress) { r.mark(Math.round(c - 4 + o), 179, 4, nm); r.mark(Math.round(c - 3 + o), 179, 4, nm); r.mark(Math.round(c - 5 + o), 180, 3, nm); return; }
            const SOLE = boot ? '#1c1a16' : '#e9e6de';
            r.piece(SOLE, 'sole' + side).rect(Math.round(c - 9.5 + o), 183, 19, 3);
            if (!boot) r.piece(SOLE, 'toe' + side).ellipse(c + o, 182, 7.5, 2.6);
        };
        if (!boot) { drawShoe(cL, -1); drawShoe(cR, 1); }

        // ---------------------------------------------------------------- calça / bermuda
        const ank = boot ? 166 : high ? 168 : dress ? 176 : 173;
        if (legs === 'bermuda') {
            r.piece(skin, 'legL').capsule(38, 136, 37, 170, 5.6, 4.6);
            r.piece(skin, 'legR').capsule(62, 136, 63, 170, 5.6, 4.6);
            r.piece(s.pants, 'pants').poly([[34, 97], [66, 97], [67, 104], [71, 141], [54, 142], [50, 117], [46, 142], [29, 141], [33, 104]]);
            r.piece(s.pants, 'cuffL').poly([[29.5, 137], [46.5, 137], [46, 142], [29, 141]]);
            r.piece(s.pants, 'cuffR').poly([[53.5, 137], [70.5, 137], [71, 141], [54, 142]]);
        } else if (legs === 'calca_moletom') {
            r.piece(s.pants, 'pants').poly([[34, 97], [66, 97], [67, 104], [70, 138], [69, ank - 6], [57, ank - 6], [54, 138], [50, 117], [46, 138], [43, ank - 6], [31, ank - 6], [30, 138], [33, 104]]);
            r.piece(s.pants, 'cuffL').rect(31, ank - 7, 12, 7);
            r.piece(s.pants, 'cuffR').rect(57, ank - 7, 12, 7);
        } else {
            const slim = legs === 'calca_social' ? 1 : 0;
            r.piece(s.pants, 'pants').poly([[34, 97], [66, 97], [67, 104], [70 - slim, 138], [72 - slim, ank], [55 + slim, ank], [54, 138], [50, 117], [46, 138], [45 - slim, ank], [28 + slim, ank], [30 + slim, 138], [33, 104]]);
            if (legs === 'calca_cargo') { r.piece(s.pants, 'cargoL').rect(28, 122, 7, 13); r.piece(s.pants, 'cargoR').rect(65, 122, 7, 13); }
        }
        if (boot) { drawShoe(cL, -1); drawShoe(cR, 1); }
        A.legs = [63, 140]; A.shoes = [36, 178];

        // dobras da calça
        if (legs !== 'bermuda') {
            for (const [x0, x1] of [[33, 44], [56, 68]]) {
                r.markLine(x0 + 2, 121, x0 + 5, 125, 1, 'pants'); r.markLine(x1 - 1, 146, x1 - 4, 150, 1, 'pants');
                r.markLine(x0 + 1, ank - 9, x0 + 6, ank - 7, 1, 'pants'); r.markLine(x0 + 7, ank - 5, x1 - 2, ank - 4, 1, 'pants');
            }
            if (legs === 'calca_jeans') {
                for (let y = 108; y < 160; y++) { if ((y >> 2) % 3) { r.mark(38, y, 3, 'pants'); r.mark(60, y, 3, 'pants'); } }
                for (const [x, y, w] of [[35, 132, 5], [61, 119, 4], [63, 150, 3]]) for (let j = 0; j < 3; j += 2) for (let i = 1; i < w - 1; i++) r.mark(x + i, y + j, 3, 'pants');
            }
            if (legs === 'calca_social') { r.markLine(38, 104, 37, ank - 1, 3, 'pants'); r.markLine(62, 104, 63, ank - 1, 3, 'pants'); }
        }

        // ---------------------------------------------------------------- pescoço e tronco
        r.piece(skin, 'neck', 1).rect(45, 44, 10, 12);
        const T = [[33, 56], [42, 53], [58, 53], [67, 56], [68, 64], [66, 82], [67, 103], [33, 103], [34, 82], [32, 64]];
        const suit = top === 'terno', jacket = top === 'jaqueta_laranja' || top === 'jaqueta_couro';
        if (sleeveT === 'tank') {
            r.piece(skin, 'chest').poly(T);
            r.piece(s.shirt, 'shirt').poly([[39, 54], [44, 53], [46, 61], [54, 61], [56, 53], [61, 54], [63, 64], [66, 82], [67, 103], [33, 103], [34, 82], [37, 64]]);
        } else if (top === 'colete_carga') {
            r.piece(s.sleeve, 'under').poly(T);
            r.piece(skin, 'neck', 1).ellipse(50, 53, 5, 3);
            r.piece(s.shirt, 'shirt').poly([[36, 56], [43, 54], [46, 64], [54, 64], [57, 54], [64, 56], [66, 82], [67, 103], [33, 103], [34, 82]]);
            for (const [x, y, h] of [[37, 70, 9], [54, 70, 9], [37, 84, 10], [54, 84, 10]]) r.piece(s.shirt).rect(x, y, 9, h);
        } else {
            r.piece(s.shirt, 'shirt').poly(suit ? T.map(([x, y]) => [x, y === 103 ? 107 : y]) : T);
            if (!suit) r.piece(skin, 'neck', 1).ellipse(50, 53, 5.5, 3.5);
        }
        if (jacket) {
            r.piece('#2a2b31', 'inner').poly([[45, 54], [55, 54], [54, 103], [46, 103]]);
            r.piece(skin, 'neck', 1).ellipse(50, 53, 4.5, 3);
            r.piece(s.shirt, 'collarL').poly([[41, 52], [46, 51], [48, 60], [43, 62]]);
            r.piece(s.shirt, 'collarR').poly([[59, 52], [54, 51], [52, 60], [57, 62]]);
            r.piece(s.shirt, 'hem').rect(33, 99, 13, 5).rect(54, 99, 14, 5);
        } else if (top === 'moletom_capuz') {
            r.piece(s.shirt, 'hoodL').poly([[37, 56], [41, 48], [46, 47], [46, 57]]);
            r.piece(s.shirt, 'hoodR').poly([[63, 56], [59, 48], [54, 47], [54, 57]]);
            r.piece(s.shirt, 'kanga').poly([[40, 84], [60, 84], [62, 98], [38, 98]]);
            r.piece(s.shirt, 'hem').rect(33, 99, 35, 5);
        } else if (top === 'camisa_time') {
            r.piece(s.sleeve, 'vneck').poly([[44, 53], [56, 53], [50, 61]]);
            r.piece(skin, 'neck', 1).poly([[46, 53], [54, 53], [50, 58]]);
        } else if (suit) {
            r.piece('#eeeeea', 'shirtW').poly([[44, 52], [56, 52], [52, 77], [48, 77]]);
            r.piece('#b3262d', 'tie').poly([[48.5, 55], [51.5, 55], [52.5, 59], [53, 72], [50, 77], [47, 72], [47.5, 59]]);
            r.piece(s.shirt, 'lapelL').poly([[42, 52], [46, 52], [49.5, 78], [40, 64]]);
            r.piece(s.shirt, 'lapelR').poly([[58, 52], [54, 52], [50.5, 78], [60, 64]]);
        }
        // dobras do tronco
        r.markLine(36, 66, 39, 72, 1, 'shirt'); r.markLine(64, 66, 61, 73, 1, 'shirt'); r.markLine(37, 92, 41, 98, 1, 'shirt'); r.markLine(62, 90, 59, 97, 1, 'shirt');
        r.markLine(35, 60, 37, 59, 3, 'shirt');
        A.top = [40, 74]; A.neck = [50, 61];

        // colete à prova de balas
        if (s.vest) {
            const VC = s.vest === 2 ? '#2b3240' : '#3d4552';
            r.piece(VC, 'vest').poly([[36, 57], [43, 55], [46, 62], [54, 62], [57, 55], [64, 57], [65, 97], [35, 97]]);
            r.piece(VC, 'plate').rect(40, 66, 20, 24);
        }
        A.vest = [60, 72];

        // alças da bolsa (por cima da roupa)
        if (s.bag === 'pack') r.piece(STRAP, 'strapL').capsule(40.5, 53, 39.5, 94, 2.2, 2);
        else if (s.bag === 'tactical') {
            r.piece(STRAP, 'strapL').capsule(41, 53, 40, 96, 2.4);
            r.piece(STRAP, 'strapR').capsule(59, 53, 60, 96, 2.4);
            r.piece(STRAP, 'sternum').rect(41, 74, 18, 3);
        } else if (s.bag === 'cross') {
            r.piece('#4a3020', 'strapX').capsule(62, 54, 33, 99, 1.8);
            r.piece('#7a4f2e', 'xbag').rect(18, 95, 18, 16);
            r.piece('#7a4f2e', 'xflap').rect(18, 95, 18, 8);
            A.bag = [26, 104];
        }

        // ---------------------------------------------------------------- cabeça
        r.piece(skin, 'earL').ellipse(38.2, 37.5, 2.4, 3.8);
        r.piece(skin, 'earR').ellipse(61.8, 37.5, 2.4, 3.8);
        r.piece(skin, 'face').poly([[39, 25], [61, 25], [62, 36], [60, 43], [55, 48], [50, 50], [45, 48], [40, 43], [38, 36]]);
        r.piece(hair, 'hair').poly([
            [37.5, 39], [36, 31], [32.5, 28], [35.5, 24], [31, 18], [37.5, 18.5], [35, 11], [42.5, 14], [43.5, 5.5], [48.5, 11], [53, 3.5], [56, 11],
            [62.5, 6.5], [61.5, 14], [68.5, 12], [64.5, 19], [69.5, 22.5], [64.5, 26], [64, 32], [62.5, 39],
            [61, 33], [60, 28], [58, 31], [56, 26], [53.5, 30], [51, 26], [48, 30.5], [46, 25.5], [43.5, 30], [41.5, 27], [40.5, 33],
        ]);
        // sombra do cabelo na testa e no queixo/pescoço
        for (let y = 20; y < 48; y++) for (let x = 36; x < 64; x++) if (r.is(x, y, 'face') && r.is(x, y - 1, 'hair')) r.mark(x, y, 1);
        // mechas (risco escuro) e brilho
        for (const [x0, y0, x1, y1] of [[36, 12, 41, 19], [44, 7, 46, 15], [54, 6, 53, 14], [62, 9, 59, 16], [67, 14, 62, 20], [34, 20, 38, 23], [48, 17, 50, 22], [57, 17, 56, 22]]) r.markLine(x0, y0, x1, y1, 1, 'hair');
        for (const [x0, y0, x1, y1] of [[39, 15, 42, 18], [45, 9, 46, 13], [51, 12, 53, 9], [38, 21, 41, 22]]) r.markLine(x0, y0, x1, y1, 4, 'hair');
        // nariz e bochecha
        r.mark(52, 38, 1, 'face'); r.mark(52, 39, 1, 'face'); r.mark(52, 40, 1, 'face'); r.mark(49, 42, 1, 'face'); r.mark(50, 42, 1, 'face'); r.mark(51, 42, 0, 'face');
        r.mark(50, 39, 3, 'face'); r.mark(50, 40, 3, 'face');
        for (const [x, y] of [[41, 41], [42, 41], [58, 41], [57, 41]]) r.mark(x, y, 3, 'face');
        A.eyes = [44, 36];

        // ---------------------------------------------------------------- bolsas de mão (na mão esquerda da tela)
        const hl = [27, 108];
        if (s.bag === 'briefcase') { r.piece('#c3c9d2', 'case').rect(15, 114, 24, 17); r.piece('#2a2c33', 'handle').rect(23, 110, 8, 4); A.bag = [27, 122]; }
        else if (s.bag === 'duffel') { r.piece('#55603e', 'duffel').ellipse(26, 123, 15, 9); r.piece('#2f331f', 'dstrap').capsule(21, 116, 27, 108, 1.4).capsule(33, 116, 27, 108, 1.4); A.bag = [26, 123]; }
        else if (s.bag === 'suitcase') { r.piece('#8a8f98', 'pole').rect(26, 110, 3, 20); r.piece('#3a5f9a', 'suit').rect(13, 128, 24, 51); r.piece('#111216', 'wheels').ellipse(16, 181, 2.5, 2.5).ellipse(33, 181, 2.5, 2.5); A.bag = [25, 150]; }
        if (!A.bag) A.bag = [34, 104];

        // ---------------------------------------------------------------- braços
        const arm = (id, sh, el, wr, hd, bent) => {
            const up = 'arm' + id, fo = bent ? up + 'f' : up;
            if (sleeveT === 'long') r.piece(s.sleeve, 'slv' + id).capsule(sh[0], sh[1], el[0], el[1], 4.4, 3.9);
            else {
                r.piece(skin, up).capsule(sh[0], sh[1], el[0], el[1], 4, 3.6);
                if (sleeveT === 'short') {
                    const e = lerp(sh, el, 0.62);
                    r.piece(s.sleeve, 'slv' + id).capsule(sh[0], sh[1], e[0], e[1], 4.9, 4.6);
                    if (jacket) { const e2 = lerp(sh, el, 0.5); r.piece(s.sleeve, 'roll' + id).capsule(e2[0], e2[1], e[0], e[1], 5, 4.7); }
                }
            }
            if (sleeveT === 'long') {
                r.piece(s.forearm, bent ? 'slvf' + id : 'slv' + id).capsule(el[0], el[1], wr[0], wr[1], 3.9, 3.4);
                const c0 = lerp(el, wr, 0.8);
                r.piece(s.forearm, 'cuff' + id).capsule(c0[0], c0[1], wr[0], wr[1], 3.7, 3.6);
            } else r.piece(skin, fo).capsule(el[0], el[1], wr[0], wr[1], 3.6, 3);
            if (hd) r.piece(s.gloves ? GLOVE : skin, s.gloves ? 'glv' + id : sleeveT === 'long' ? 'hand' + id : fo).ellipse(hd[0], hd[1], 3.6, 4.3);
        };
        // esquerda da tela: mão na alça da mochila, ou braço solto (segurando a bolsa de mão)
        if (pack) arm('L', [35, 58], [29, 84], [37, 69], [39.5, 64], true);
        else arm('L', [35, 58], [29, 82], [27, 103], hl, false);
        // direita da tela: arma na mão, ou mão no bolso
        let hr, wr;
        if (armed) {
            hr = [73, 108]; wr = [73, 103];
            if (s.weapon === 'bat') r.piece('#9a6a3a', 'bat').capsule(74, 110, 88, 152, 1.6, 3.2);
            else if (s.weapon === 'knife') { r.piece('#cfd6df', 'blade').poly([[71.5, 112], [75, 112], [74.5, 125], [73, 128]]); r.piece('#2a2c33', 'hilt').rect(71, 111, 5, 3); }
            else if (s.icon) {
                const long = ['rifle', 'ak47', 'shotgun', 'smg'].includes(s.weapon), w = long ? 32 : 22, tb = DollRaster.trim(s.icon), h = Math.max(5, Math.round(w * tb[3] / tb[2]));
                r.image(s.icon, Math.round(hr[0] - w * 0.12), Math.round(hr[1] - h * 0.55), w, h);
            }
            arm('R', [65, 58], [71, 82], wr, hr, false);
            A.weapon = s.weapon === 'bat' ? [82, 136] : s.weapon === 'knife' ? [74, 120] : [hr[0] + 10, hr[1]];
        } else {
            hr = [64, 104]; wr = [66, 99];
            arm('R', [65, 58], [71, 81], wr, hr, false);
            r.piece(s.pants, legs === 'bermuda' ? 'pants' : 'pants').poly([[58, 105], [70, 103], [70, 109], [58, 109]]);     // borda do bolso por cima da mão
            A.weapon = [72, 104];
        }
        A.hands = [hr[0], hr[1]];
        const el = armed ? [71, 82] : [71, 81], w0 = lerp(el, wr, 0.8), w1 = lerp(el, wr, 0.9);
        if (s.wrist) r.piece(GOLD, 'watch').capsule(w0[0], w0[1], w1[0], w1[1], 3.5);
        A.wrist = [Math.round((w0[0] + w1[0]) / 2), Math.round((w0[1] + w1[1]) / 2)];

        // ---------------------------------------------------------------- pixels → detalhes finos
        const W = this.W, D = r.bake();
        const px = (x, y, col) => {
            if (x < 0 || y < 0 || x >= W || y >= this.H) return;
            const c = typeof col === 'string' ? Pixel.hex(col) : col, o = (y * W + x) * 4;
            D[o] = c[0]; D[o + 1] = c[1]; D[o + 2] = c[2]; D[o + 3] = 255;
        };
        const row = (x0, x1, y, col) => { for (let x = x0; x <= x1; x++) px(x, y, col); };
        const R = (col) => this.ramp(col);

        // rosto: sobrancelhas (confiantes), olhos, boca de canto
        const HD = R(hair)[0], EYE = '#24170f', WHITE = '#f1ece2', LIP = R(skin)[0];
        if (s.eyes) {
            const LENS = '#101318';
            row(40, 59, 35, LENS); row(40, 46, 36, LENS); row(53, 59, 36, LENS); row(41, 46, 37, LENS); row(53, 58, 37, LENS); row(42, 45, 38, LENS); row(54, 57, 38, LENS);
            px(47, 35, LENS); px(52, 35, LENS); row(48, 51, 35, '#3a3f4a');
            px(41, 36, '#7d8aa3'); px(42, 36, '#7d8aa3'); px(41, 37, '#4a5468'); px(54, 36, '#7d8aa3'); px(55, 36, '#7d8aa3'); px(54, 37, '#4a5468');
            row(41, 44, 33, HD); row(55, 58, 33, HD);
        } else {
            row(41, 44, 33, HD); row(44, 46, 34, HD); row(54, 56, 34, HD); row(56, 59, 33, HD); px(41, 32, HD); px(59, 32, HD);
            row(41, 45, 35, EYE); row(55, 59, 35, EYE);
            px(42, 36, WHITE); px(43, 36, EYE); px(44, 36, EYE); px(45, 36, WHITE); px(43, 37, EYE); px(44, 37, EYE);
            px(55, 36, WHITE); px(56, 36, EYE); px(57, 36, EYE); px(58, 36, WHITE); px(56, 37, EYE); px(57, 37, EYE);
            px(43, 36, '#5a3b26'); px(56, 36, '#5a3b26');
        }
        row(47, 50, 45, LIP); px(51, 44, LIP); px(52, 44, LIP); px(46, 44, LIP);
        row(48, 50, 46, R(skin)[3]);

        // corrente
        if (s.neck) {
            for (let x = 43; x <= 57; x++) {
                const t = (x - 50) / 7, y = Math.round(55 + 7 * (1 - t * t)), y2 = Math.round(55 + 7 * (1 - ((x + 1 - 50) / 7) ** 2));
                px(x, y, x % 2 ? '#ffe28a' : '#b07c1e');
                if (x < 57 && Math.abs(y2 - y) > 1) px(x, Math.round((y + y2) / 2), '#d9a632');
            }
            px(49, 63, '#ffe28a'); px(50, 63, '#d9a632'); px(49, 64, '#d9a632'); px(50, 64, '#9a6a18');
        }

        // estampas e acabamentos da parte de cima
        if (top === 'camiseta_branca') {
            const P = [[44, 70], [45, 69], [47, 69], [48, 70], [50, 70], [52, 69], [53, 70], [55, 71], [46, 72], [49, 72], [51, 72], [54, 73], [47, 74], [52, 75], [45, 76], [50, 76]];
            for (const [x, y] of P) px(x, y, '#9aa3b6');
            row(46, 54, 71, '#8790a6'); row(48, 52, 73, '#8790a6');
        } else if (top === 'camisa_time') {
            const C = R(s.sleeve)[2], dg = (d, x0) => this.DIGITS[d].forEach((ln, j) => [...ln].forEach((b, i) => { if (b === '1') { px(x0 + i * 2, 70 + j * 2, C); px(x0 + i * 2 + 1, 70 + j * 2, C); px(x0 + i * 2, 71 + j * 2, C); px(x0 + i * 2 + 1, 71 + j * 2, C); } }));
            dg(1, 43); dg(0, 51);
            px(38, 62, '#ffffff'); px(39, 62, C); px(38, 63, C); px(39, 63, '#ffffff');
        } else if (top === 'moletom_capuz') {
            const SC = '#d9d9de';
            for (const [x0, x1] of [[47, 46], [53, 54]]) for (let y = 57; y <= 70; y++) px(Math.round(x0 + (x1 - x0) * (y - 57) / 13), y, SC);
            px(46, 71, '#a9a9b0'); px(54, 71, '#a9a9b0');
        } else if (jacket) {
            const Z = top === 'jaqueta_couro' ? '#8a8f98' : '#c4c8cf';
            for (let y = 62; y < 99; y += 2) { px(44, y, Z); px(56, y, Z); }
            if (top === 'jaqueta_couro') { px(39, 70, '#d0d4da'); px(60, 70, '#d0d4da'); }
        } else if (suit) {
            px(50, 84, '#0e0f12'); px(50, 92, '#0e0f12'); row(59, 61, 66, '#eeeeea'); px(60, 65, '#eeeeea');
        } else if (top === 'colete_carga') {
            for (const [x, y] of [[37, 70], [54, 70], [37, 84], [54, 84]]) { row(x + 1, x + 7, y + 2, R(s.shirt)[1]); px(x + 4, y + 3, '#c9a45a'); }
            for (let y = 66; y < 102; y += 2) px(50, y, '#1d1f22');
        }
        if (s.vest) {
            row(43, 56, 70, '#596172'); row(43, 56, 71, '#596172'); row(44, 55, 72, '#4a5160');
            px(47, 71, '#e6e6e6'); px(48, 71, '#e6e6e6'); px(50, 71, '#e6e6e6'); px(52, 71, '#e6e6e6');
            if (s.vest === 2) row(44, 55, 86, '#596172');
        }

        // bolsas
        if (s.bag === 'pack') { px(29, 77, '#c9a45a'); px(30, 77, '#c9a45a'); px(29, 78, '#8a6a2a'); row(23, 32, 97, R(PACK)[1]); px(39, 84, '#c9a45a'); px(40, 84, '#c9a45a'); }
        else if (s.bag === 'tactical') { for (let y = 80; y < 98; y += 4) { row(22, 26, y, R(PACK)[1]); row(73, 77, y, R(PACK)[1]); } px(49, 75, '#c9c9c9'); px(50, 75, '#c9c9c9'); }
        else if (s.bag === 'cross') { px(26, 101, '#e8c24a'); px(27, 101, '#e8c24a'); px(26, 102, '#a8862a'); }
        else if (s.bag === 'briefcase') { row(16, 37, 120, '#8d939c'); px(20, 116, '#2a2c33'); px(33, 116, '#2a2c33'); }
        else if (s.bag === 'duffel') { row(15, 37, 120, '#c9a45a'); }
        else if (s.bag === 'suitcase') { for (let y = 134; y < 176; y += 6) row(15, 34, y, '#2c4a7a'); }

        // calçados: cadarço e detalhes
        for (const [c, side] of [[cL, -1], [cR, 1]]) {
            const o = side * 1.5, x = Math.round(c);
            if (flip) { px(x - 1 + Math.round(o), 177, s.shoes); px(x + Math.round(o), 176, s.shoes); px(x + 1 + Math.round(o), 177, s.shoes); px(x - 2 + Math.round(o), 178, s.shoes); px(x + 2 + Math.round(o), 178, s.shoes); continue; }
            if (dress) continue;
            const LACE = boot ? '#b08a50' : high ? '#f4f2ec' : '#c9ccd4', y0 = Math.max(ank, shoeTop) + 1;
            for (let y = y0; y < 180; y += 2) { px(x - 1, y, LACE); px(x, y, LACE); px(x + 1, y, LACE); px(x, y + 1, R(s.shoes)[0]); }
            if (high) { px(x - side * 5, 168, '#f4f2ec'); px(x - side * 5, 169, '#f4f2ec'); }
            if (shoe === 'tenis_corrida') { px(x - 4, 179, '#ffffff'); px(x - 3, 180, '#ffffff'); px(x + 3, 179, '#ffffff'); px(x + 4, 180, '#ffffff'); }
        }

        // jeans: fios brancos nos rasgos
        if (legs === 'calca_jeans') for (const [x, y, w] of [[35, 133, 5], [61, 120, 4], [63, 151, 3]]) for (let i = 0; i < w; i++) px(x + i, y + 1, i === 1 ? '#b9bcc6' : '#e8e6e0');

        // relógio
        if (s.wrist) { px(A.wrist[0], A.wrist[1], '#fff6d0'); px(A.wrist[0] - 1, A.wrist[1], '#fff6d0'); }

        const cv = document.createElement('canvas'); cv.width = W; cv.height = this.H;
        cv.getContext('2d').putImageData(new ImageData(D, W, this.H), 0, 0);
        const anchors = {};
        for (const [k, v] of Object.entries(A)) anchors[k] = [v[0] * 2, v[1] * 2];
        const out = { canvas: cv, anchors };
        if (this._cache.size > 24) this._cache.clear();
        this._cache.set(key, out);
        return out;
    },
};
