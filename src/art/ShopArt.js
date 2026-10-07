// ============================================================================
// ShopArt — o motor de pintura dos INTERIORES DAS LOJAS (pixel art por código, 20 px/u, vista de cima com corte oblíquo, no mesmo
// estilo da safe house — ver art/HouseArt.js). Cada loja é um quadro único: piso, parede do fundo (alta, com face interna),
// laterais em fita, frente baixa com o vão da porta, móveis (topo + frente), luzes e vinheta.
//
// ShopCtx guarda o quadro e as ferramentas; os LAYOUTS de cada tipo ficam em art/ShopStyles.js. Coordenadas LOCAIS da sala:
// x → leste, z → norte, origem no canto sudoeste externo; a porta fica na parede sul. `mirror` espelha o layout inteiro (variações).
// ============================================================================

class ShopCtx {
    constructor(style, v, W, D, { mirror = false, door = 0.5 } = {}) {
        this.style = style; this.v = v; this.W = W; this.D = D; this.m = mirror;
        this.T = 0.7; this.H = 2.8; this.PPU = 20; this.K = 0.22;
        const IN = this.IN = { x0: -0.4, z0: -0.8, x1: W + 0.4, z1: D + 2.9 };
        this.wpx = Math.round((IN.x1 - IN.x0) * this.PPU); this.hpxTot = Math.round((IN.z1 - IN.z0) * this.PPU);
        this.c = HouseArt._P(this.wpx, this.hpxTot);
        this.rng = Pixel.rng(Economy._h(style) * 31 + v * 977 + 5);
        const dw = 2.6, dc = mirror ? W - door * W : door * W;
        this.door = { x0: Math.round((dc - dw / 2) * 2) / 2, x1: Math.round((dc + dw / 2) * 2) / 2 };
        this.uses = []; this.obs = []; this.lights = []; this.patrons = []; this.clerk = null; this.seed = v * 131 + Economy._h(style);
        this.nY = this.Y(D - this.T); this.faceH = this.hp(this.H);
    }

    // ---------------------------------------------------------------- coordenadas
    X(x) { return Math.round((x - this.IN.x0) * this.PPU); }
    Y(z) { return Math.round((this.IN.z1 - z) * this.PPU); }
    hp(h) { return Math.round(h * this.K * this.PPU); }
    R(x0, z0, x1, z1) { return this.m ? [this.W - x1, z0, this.W - x0, z1] : [x0, z0, x1, z1]; }      // retângulo do layout → sala (espelha)
    P(x) { return this.m ? this.W - x : x; }
    t(col, k) { return HouseArt._tint(col, k); }
    mix(a, b, k) { return HouseArt._mixc(a, b, k); }
    bx(x, y, w, h, col) { this.c.box(x, y, w, h, col, this.t(col, 1.25), this.t(col, 0.7), this.t(col, 0.34)); }
    use(kind, r) { this.uses.push({ kind, x0: r[0], z0: r[1], x1: r[2], z1: r[3] }); }              // móvel de USO da casa (dormir, baú, cofre…): ver Interiors.enterHome
    // Colisor de um móvel. Na vista oblíqua o móvel desenhado ocupa a BASE + o topo deslocado para o norte (h × K u): se o colisor cobrisse só a
    // base, o jogador passaria "por dentro" do tampo quando andasse atrás do móvel. Por isso o colisor é a silhueta inteira (base + topo).
    // Paredes (`wall`) não estendem; `ShopCtx.EXTEND = false` volta ao colisor só da base (teste).
    solid(r, h, extra = {}) {
        const up = extra.wall || ShopCtx.EXTEND === false ? 0 : Math.min(0.7, h * this.K);
        this.obs.push(Object.assign({ x0: r[0], z0: r[1], x1: r[2], z1: r[3] + up, h }, extra));
    }
    light(x, z, r, col, a) { this.lights.push({ x: this.X(x), y: this.Y(z), r: r * this.PPU, col, a }); }

    // ---------------------------------------------------------------- piso
    floor(kind, A, B, opt = {}) {
        const c = this.c, T = this.T, x0 = this.X(T), x1 = this.X(this.W - T), y0 = this.Y(this.D - T), y1 = this.Y(T), rng = this.rng;
        const a = Pixel.hex(A), b = Pixel.hex(B || A);
        if (kind === 'planks') {
            for (let y = y0; y < y1; y += 9) {
                let x = x0 - Math.floor(rng() * 30);
                while (x < x1) {
                    const len = 34 + Math.floor(rng() * 64), col = this.mix(a, b, rng());
                    const xa = Math.max(x, x0), xb = Math.min(x + len, x1);
                    if (xb > xa) { c.fr(xa, y, xb - xa, 8, col); c.fr(xa, y, xb - xa, 1, this.t(col, 1.14)); c.fr(xb - 1, y, 1, 9, this.t(col, 0.55)); }
                    x += len;
                }
                c.fr(x0, y + 8, x1 - x0, 1, this.t(a, 0.55));
            }
        } else if (kind === 'checker') {
            const s = opt.size || 16;
            for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
                const k = (Math.floor((x - x0) / s) + Math.floor((y - y0) / s)) & 1, g = (Pixel.hash(x, y, this.seed) - 0.5) * 12;
                const base = k ? a : b; c.px(x, y, [base[0] + g, base[1] + g, base[2] + g]);
                if ((x - x0) % s === 0 || (y - y0) % s === 0) c.px(x, y, this.t(base, 0.8));
            }
        } else if (kind === 'tile' || kind === 'concrete') {
            const s = opt.size || 24;
            for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
                const tx = Math.floor((x - x0) / s), ty = Math.floor((y - y0) / s), base = this.mix(a, b, Pixel.hash(tx, ty, this.seed) * 0.8), g = (Pixel.hash(x, y, this.seed + 3) - 0.5) * (kind === 'concrete' ? 18 : 8);
                c.px(x, y, [base[0] + g, base[1] + g, base[2] + g]);
                if ((x - x0) % s === 0 || (y - y0) % s === 0) c.px(x, y, this.t(base, 0.72));
            }
            if (kind === 'concrete') for (let n = 0; n < 5; n++) { let cx = x0 + Math.floor(rng() * (x1 - x0)), cy = y0 + Math.floor(rng() * (y1 - y0)); for (let i = 0; i < 40; i++) { c.px(cx, cy, '#403c33'); cx += Math.floor(rng() * 3) - 1; cy += rng() < 0.7 ? 1 : 0; } }
        } else if (kind === 'marble') {
            const s = 40;
            for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
                const n = Pixel.noise(x, y, 22, this.seed, 99, 99), n2 = Pixel.noise(x + 50, y, 9, this.seed + 1, 99, 99), g = (Pixel.hash(x, y, 4) - 0.5) * 6;
                let col = this.mix(a, b, Math.abs(n - 0.5) < 0.009 ? 0.45 : (n2 > 0.74 ? 0.1 : 0));
                c.px(x, y, [col[0] + g, col[1] + g, col[2] + g]);
                if ((x - x0) % s === 0 || (y - y0) % s === 0) c.px(x, y, this.t(a, 0.82));
            }
        }
    }

    // Faixa de tapete/passadeira (retângulo local).
    rug(r, col, edge, stripes = true) {
        const c = this.c, x = this.X(r[0]), y = this.Y(r[3]), w = this.X(r[2]) - x, h = this.Y(r[1]) - y;
        c.fr(x, y, w, h, col); c.fr(x, y, w, 2, edge); c.fr(x, y + h - 2, w, 2, edge); c.fr(x, y, 2, h, edge); c.fr(x + w - 2, y, 2, h, edge);
        if (stripes) { c.fr(x + 5, y + 5, w - 10, 1, this.t(edge, 1.2)); c.fr(x + 5, y + h - 6, w - 10, 1, this.t(edge, 1.2)); }
        HouseArt._grain(c, x, y, w, h, 7, this.seed);
    }

    // ---------------------------------------------------------------- paredes
    // Textura de parede em um retângulo de pixels.
    wallTex(kind, x, y, w, h, A, B) {
        const c = this.c, a = Pixel.hex(A), b = Pixel.hex(B || A), rng = this.rng;
        if (kind === 'brick') {
            c.fr(x, y, w, h, this.t(a, 0.55));
            for (let r = 0; r * 7 < h; r++) for (let bb = -1; bb * 14 < w; bb++) {
                const bxp = x + bb * 14 + (r % 2) * 7, col = this.mix(a, b, rng());
                for (let j = 1; j < 6; j++) for (let i = 1; i < 14; i++) { const X = bxp + i, Y = y + r * 7 + j; if (X >= x && X < x + w && Y < y + h) c.px(X, Y, j === 1 ? this.t(col, 1.16) : (j === 5 ? this.t(col, 0.8) : col)); }
            }
        } else if (kind === 'wood') {
            for (let i = 0; i < w; i += 6) { const col = this.mix(a, b, rng()); c.fr(x + i, y, 5, h, col); c.fr(x + i, y, 1, h, this.t(col, 1.18)); c.fr(x + i + 5, y, 1, h, this.t(col, 0.5)); if (rng() < 0.5) c.px(x + i + 2, y + Math.floor(rng() * h), this.t(col, 0.6)); }
        } else if (kind === 'tile') {
            for (let j = 0; j < h; j += 8) for (let i = 0; i < w; i += 8) { const col = this.mix(a, b, Pixel.hash(i, j, 2) * 0.5); c.fr(x + i, y + j, 8, 8, col); c.fr(x + i, y + j, 8, 1, this.t(col, 0.82)); c.fr(x + i, y + j, 1, 8, this.t(col, 0.82)); c.px(x + i + 1, y + j + 1, this.t(col, 1.2)); }
        } else if (kind === 'panel') {                                    // papel de parede listrado em cima + lambri de madeira embaixo
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) c.px(x + i, y + j, (Math.floor(i / 5) & 1) ? a : this.t(a, 0.9));
            const wh = Math.round(h * 0.38);
            c.fr(x, y + h - wh, w, wh, b); for (let i = 0; i < w; i += 18) { c.fr(x + i, y + h - wh + 3, 15, wh - 7, this.t(b, 1.12)); c.fr(x + i, y + h - wh + 3, 15, 1, this.t(b, 1.4)); c.fr(x + i, y + h - 5, 15, 1, this.t(b, 0.6)); }
            c.fr(x, y + h - wh - 2, w, 3, this.t(b, 0.7));
        } else if (kind === 'bamboo') {
            c.fr(x, y, w, h, a);
            for (let i = 0; i < w; i += 7) { for (let j = 0; j < h; j++) c.px(x + i, y + j, (i / 7) % 3 ? this.t(a, 0.9) : this.t(a, 0.82)); }
            for (let i = 0; i < w; i += 34) { c.fr(x + i, y, 4, h, b); c.fr(x + i, y, 1, h, this.t(b, 1.3)); c.fr(x + i + 3, y, 1, h, this.t(b, 0.6)); for (let j = 6; j < h; j += 17) c.fr(x + i - 1, y + j, 6, 2, this.t(b, 0.7)); }
        } else if (kind === 'pegboard') {
            c.fr(x, y, w, h, a);
            for (let j = 3; j < h; j += 6) for (let i = 3; i < w; i += 6) c.px(x + i, y + j, this.t(a, 0.55));
        } else if (kind === 'concrete') {
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const n = Pixel.noise(x + i, y + j, 9, this.seed, 99, 99); const col = this.mix(a, b, n); const g = (Pixel.hash(i, j, 6) - 0.5) * 12; c.px(x + i, y + j, [col[0] + g, col[1] + g, col[2] + g]); }
            for (let k = 0; k < 8; k++) { let cx = x + Math.floor(rng() * w), cy = y + Math.floor(rng() * h * 0.5); for (let i = 0; i < 24; i++) { c.px(cx, cy, this.t(a, 0.45)); cy++; cx += Math.floor(rng() * 3) - 1; } }
        } else {                                                           // 'paint': tinta lisa com manchas
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const n = Pixel.noise(x + i, y + j, 11, this.seed, 99, 99), col = this.mix(a, b, n * 0.6), g = (Pixel.hash(i, j, 8) - 0.5) * 7; c.px(x + i, y + j, [col[0] + g, col[1] + g, col[2] + g]); }
            for (let k = 0; k < 4; k++) { const cx = x + Math.floor(rng() * w), cy = y + Math.floor(rng() * h * 0.6), r = 3 + Math.floor(rng() * 5); c.bl(cx - r, cy - r, r * 2, r * 2, this.t(a, 0.6), 0.25); }
        }
    }

    // Casca da sala: parede norte alta, laterais em fita, frente baixa com a porta.
    shell(o) {
        const c = this.c, T = this.T, W = this.W, D = this.D, H = this.H, x0 = this.X(T), x1 = this.X(W - T), nY = this.nY, faceH = this.faceH;
        const cap = o.cap || '#7b7568', cH = Math.round(T * this.PPU);
        this.wallTex(o.n.kind, x0, nY - faceH, x1 - x0, faceH, o.n.A, o.n.B);
        if (o.n2) this.wallTex(o.n2.kind, this.X(o.n2.x0), nY - faceH, this.X(o.n2.x1) - this.X(o.n2.x0), faceH, o.n2.A, o.n2.B);
        HouseArt._grain(c, x0, nY - faceH, x1 - x0, faceH, 5, this.seed);
        c.bl(x0, nY - faceH, x1 - x0, 5, [10, 6, 4], 0.35); c.bl(x0, nY - 7, x1 - x0, 7, [10, 6, 4], 0.28);
        if (o.rail) { c.fr(x0, nY - 8, x1 - x0, 3, this.t(o.rail, 0.9)); c.fr(x0, nY - 8, x1 - x0, 1, this.t(o.rail, 1.3)); }
        for (let j = 0; j < cH; j++) c.fr(this.X(0), nY - faceH - cH + j, this.X(W) - this.X(0), 1, j === 0 ? this.t(cap, 1.3) : (j === cH - 1 ? this.t(cap, 0.6) : cap));
        // laterais: face interna (listra junto ao piso) + fita da tampa inclinada
        const side = o.side || '#72593a';
        const slant = (z) => 0.5 + (H - 0.5) * Math.pow(Math.max(0, Math.min(1, (z - 0.4) / (D - T - 0.4))), 0.8);
        for (const [xa, dir] of [[this.X(T), 1], [this.X(W - T) - 6, -1]]) for (let z = T; z < D - T; z += 0.05) { const yb = this.Y(z), h = Math.max(2, Math.round(this.hp(slant(z)) * 0.18)); for (let k = 0; k < h; k++) for (let i = 0; i < 6; i++) c.px(xa + i, yb - k, this.t(side, 0.62 + 0.3 * (k / h))); }
        for (const [xa, xb] of [[this.X(0), this.X(T)], [this.X(W - T), this.X(W)]]) {
            let prev = null;
            for (let z = 0; z <= D; z += 0.04) { const y = this.Y(z) - this.hp(slant(z)); if (prev !== null && y < prev) for (let yy = y; yy <= prev; yy++) for (let x = xa; x < xb; x++) c.px(x, yy, x === xa ? this.t(side, 1.3) : (x === xb - 1 ? this.t(side, 0.6) : side)); for (let x = xa; x < xb; x++) c.px(x, y, x === xa ? this.t(side, 1.3) : (x === xb - 1 ? this.t(side, 0.6) : side)); prev = y; }
        }
        // frente (sul): baixa, com o vão da porta
        const sY = this.Y(0), sH = this.hp(0.5), d0 = this.X(this.door.x0), d1 = this.X(this.door.x1), front = o.front || '#8a5a3c';
        const sCap = (xa, xb) => { for (let j = 0; j < sH; j++) c.fr(xa, sY - j, xb - xa, 1, this.t(front, 0.78 + 0.22 * (j / sH))); for (let j = 0; j < cH; j++) c.fr(xa, sY - sH - j, xb - xa, 1, j === cH - 1 ? this.t(cap, 1.3) : (j === 0 ? this.t(cap, 0.6) : cap)); };
        sCap(this.X(0), d0); sCap(d1, this.X(W));
        c.bl(d0, sY - 40, d1 - d0, 40, [255, 236, 170], 0.16);                                              // luz da rua entrando
        const mw = d1 - d0 - 4, mx = d0 + 2, my = sY - 20;
        c.fr(mx, my, mw, 16, o.mat || '#4a3a2a'); for (let i = 0; i < mw; i += 4) c.fr(mx + i, my, 2, 16, this.t(o.mat || '#4a3a2a', 1.3)); c.fr(mx, my, mw, 1, '#a07848');
        for (const dx of [d0 - 3, d1]) { c.fr(dx, sY - sH - cH, 3, sH + cH, '#3a2a1c'); c.fr(dx, sY - sH - cH, 3, 1, '#8a6a44'); }
        // colisão das paredes
        const d = this.door;
        this.solid([0, 0, d.x0, T], H, { wall: 1 }); this.solid([d.x1, 0, W, T], H, { wall: 1 }); this.solid([0, D - T, W, D], H, { wall: 1 });
        this.solid([0, T, T, D - T], H, { wall: 1 }); this.solid([W - T, T, W, D - T], H, { wall: 1 });
    }

    // Região da face da parede norte (px) para decorar: devolve { x, y, w, h } entre as posições locais xa..xb.
    band(xa, xb) { const x0 = this.X(Math.min(xa, xb)), x1 = this.X(Math.max(xa, xb)); return { x: x0, y: this.nY - this.faceH, w: x1 - x0, h: this.faceH, base: this.nY }; }

    // ---------------------------------------------------------------- objetos 3D simples
    base(r, h) { return { x: this.X(r[0]), y: this.Y(r[3]), w: this.X(r[2]) - this.X(r[0]), h: this.Y(r[1]) - this.Y(r[3]), hp: this.hp(h), get top() { return this.y - this.hp; }, get fy() { return this.y + this.h - this.hp; } }; }
    shadow(b, extra = 0) { this.c.bl(b.x + 4, b.y + 3, b.w + 3 + extra, b.h + 1, [8, 5, 3], 0.32); this.c.bl(b.x + 7, b.y + 6, b.w + 1 + extra, b.h - 2, [8, 5, 3], 0.18); }
    // Caixa com topo e frente (corte oblíquo). Registra o sólido.
    blk(r, h, top, front, solid = true) {
        const b = this.base(r, h), c = this.c;
        this.shadow(b);
        c.box(b.x, b.fy - 1, b.w, b.hp + 1, front, this.t(front, 1.25), this.t(front, 0.7), this.t(front, 0.3));
        c.box(b.x, b.top, b.w, b.h, top, this.t(top, 1.25), this.t(top, 0.72), this.t(top, 0.3));
        if (solid) this.solid(r, h);
        return b;
    }

    // ---------------------------------------------------------------- peças de cena
    stool(x, z) {
        const c = this.c, px = this.X(x), py = this.Y(z), b = { x: px - 7, y: py - 7 };
        c.bl(px - 5, py - 2, 14, 12, [8, 5, 3], 0.3);
        c.fr(px - 1, py - 2, 3, 12, '#3a3d44'); c.fr(px - 5, py + 8, 11, 2, '#2a2c32');
        c.disk(px, py - 4, 7, '#2a2c30'); c.disk(px, py - 5, 6, '#b8382c'); c.disk(px - 1, py - 6, 3, '#d8584a'); c.ring(px, py - 5, 6, '#7a2018');
        this.solid([x - 0.35, z - 0.35, x + 0.35, z + 0.35], 0.7);
    }
    chair(x, z, face = 's', col = '#7a5230') {
        const c = this.c, px = this.X(x), py = this.Y(z);
        c.bl(px - 6, py - 1, 15, 10, [8, 5, 3], 0.3);
        c.box(px - 6, py - 6, 12, 11, col, this.t(col, 1.25), this.t(col, 0.7), this.t(col, 0.3));                 // assento
        c.fr(px - 5, py + 5, 2, 4, this.t(col, 0.6)); c.fr(px + 3, py + 5, 2, 4, this.t(col, 0.6));
        if (face === 's') c.box(px - 6, py - 13, 12, 4, this.t(col, 0.9), this.t(col, 1.3), this.t(col, 0.6), this.t(col, 0.3));        // encosto ao norte
        else if (face === 'n') c.box(px - 6, py + 2, 12, 4, this.t(col, 0.9), this.t(col, 1.3), this.t(col, 0.6), this.t(col, 0.3));
        else if (face === 'e') c.box(px - 8, py - 11, 3, 13, this.t(col, 0.9), this.t(col, 1.3), this.t(col, 0.6), this.t(col, 0.3));
        else c.box(px + 5, py - 11, 3, 13, this.t(col, 0.9), this.t(col, 1.3), this.t(col, 0.6), this.t(col, 0.3));
        this.solid([x - 0.4, z - 0.4, x + 0.4, z + 0.4], 0.6);
    }
    // Mesa: toalha 'check' (xadrez vermelho), 'white' (toalha branca com pratos), 'wood' (madeira) ou 'round'.
    table(cx, cz, w, d, cloth = 'wood', col = null) {
        const r = [cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2], b = this.base(r, 0.85), c = this.c;
        this.shadow(b);
        if (cloth === 'check') {
            c.box(b.x, b.fy - 1, b.w, b.hp + 3, '#c43a34', '#e8e0d0', '#7a1f1c', '#401010');
            c.box(b.x, b.top, b.w, b.h, '#f4efe4', '#ffffff', '#c8c0b0', '#401010');
            for (let j = 0; j < b.h - 2; j += 4) for (let i = 0; i < b.w - 2; i += 4) if (((i + j) / 4) % 2 === 0) c.fr(b.x + 1 + i, b.top + 1 + j, 4, 4, '#d0403a');
            c.fr(b.x, b.top + b.h - 1, b.w, 1, '#8a2420');
        } else if (cloth === 'white') {
            c.box(b.x, b.fy - 1, b.w, b.hp + 4, '#e8e6e0', '#ffffff', '#a8a49a', '#403c34');
            for (let i = 4; i < b.w - 2; i += 5) c.fr(b.x + i, b.fy + 2, 1, b.hp, '#c8c4b8');
            c.box(b.x, b.top, b.w, b.h, '#f4f2ec', '#ffffff', '#d0ccc0', '#403c34');
        } else {
            const wc = col || '#8a6238';
            c.box(b.x, b.fy - 1, b.w, b.hp + 1, this.t(wc, 0.7), this.t(wc, 0.95), this.t(wc, 0.5), '#201408');
            c.box(b.x, b.top, b.w, b.h, wc, this.t(wc, 1.3), this.t(wc, 0.7), '#201408');
            for (let i = 6; i < b.w - 4; i += 9) c.fr(b.x + i, b.top + 2, 1, b.h - 4, this.t(wc, 0.8));
        }
        this.solid(r, 0.85);
        return b;
    }
    plate(px, py, fancy = false) { const c = this.c; c.disk(px, py, 5, fancy ? '#fafaf5' : '#e8e8e4'); c.ring(px, py, 5, '#a8a8a0'); c.disk(px, py, 2, fancy ? '#e8e0d0' : '#c8b88a'); }
    glass(px, py, col = '#cfe4f2') { const c = this.c; c.fr(px, py - 5, 3, 5, col); c.fr(px, py - 5, 3, 1, '#ffffff'); c.px(px + 1, py, '#9ab0c0'); }
    bottle(px, py, col, h = 9) { const c = this.c; c.fr(px, py - h, 3, h, col); c.fr(px, py - h, 1, h, this.t(col, 1.4)); c.fr(px + 1, py - h - 3, 1, 3, col); c.px(px + 1, py - h - 3, '#e8e0c0'); c.fr(px, py - 4, 3, 2, '#e8e0c0'); }

    // Vaso de planta grande.
    plant(x, z, big = true) {
        const c = this.c, px = this.X(x), py = this.Y(z);
        c.bl(px - 6, py + 4, 16, 8, [8, 5, 3], 0.3);
        c.box(px - 6, py - 2, 12, 11, '#a85a3a', '#d08060', '#6a3420', '#301810');
        for (let k = 0; k < 9; k++) { const a = k * 0.7, r = big ? 11 : 7; c.disk(px + Math.round(Math.cos(a) * r * 0.6), py - 8 - Math.round(Math.sin(a) * r * 0.5) - (k % 3) * 2, 4, k % 2 ? '#3f8a3a' : '#2f7030'); }
        c.disk(px, py - 12, 4, '#58a850');
        this.solid([x - 0.5, z - 0.5, x + 0.5, z + 0.5], 1.2);
    }

    // Balcão: rect local, altura, cor do tampo e da frente; `items` pinta coisas em cima. Devolve a base.
    counter(r, h, top, front, items = []) {
        const b = this.blk(r, h, top, front), c = this.c, rng = this.rng;
        for (let i = 6; i < b.w - 4; i += 18) c.fr(b.x + i, b.fy + 3, 1, b.hp - 4, this.t(front, 0.6));
        c.fr(b.x + 1, b.top + b.h - 3, b.w - 2, 1, this.t(top, 1.4));
        let px = b.x + 6;
        for (const it of items) {
            const y = b.top + 5 + Math.floor(rng() * Math.max(1, b.h - 24));
            if (it === 'register') { c.box(px, y, 20, 14, '#3a3d44', '#6a6e78', '#1c1e22', '#0c0d10'); c.fr(px + 2, y + 2, 10, 5, '#7ac0a0'); c.fr(px + 14, y + 3, 4, 8, '#9a9ea8'); c.fr(px, y + 14, 20, 4, '#4a4e58'); px += 26; }
            else if (it === 'cups') { for (let k = 0; k < 4; k++) { c.fr(px + k * 6, y, 5, 7, '#f4f1e8'); c.fr(px + k * 6, y, 5, 2, '#d9453a'); } px += 28; }
            else if (it === 'bottles') { this.bottle(px, y + 12, '#3f9a52'); this.bottle(px + 6, y + 12, '#8a4ab0'); this.bottle(px + 12, y + 12, '#d9a020'); px += 20; }
            else if (it === 'tray') { c.box(px, y, 22, 12, '#b8bcc4', '#e8ecf0', '#6a6e78', '#2a2c32'); c.disk(px + 6, y + 6, 3, '#d9a050'); c.disk(px + 15, y + 6, 3, '#c0392b'); px += 28; }
            else if (it === 'bell') { c.disk(px + 3, y + 3, 3, '#d9b030'); c.px(px + 3, y, '#fff2a0'); px += 10; }
            else if (it === 'jar') { c.box(px, y, 9, 11, '#cfe4f2', '#ffffff', '#8aa8b8', '#405060'); c.fr(px + 1, y + 4, 7, 6, '#d9a050'); px += 14; }
            else if (it === 'cake') { c.box(px, y, 18, 12, '#e8d8b0', '#fff4d0', '#a89868', '#403820'); c.fr(px + 1, y + 1, 16, 4, '#8a4a2a'); c.disk(px + 5, y + 2, 1, '#d9453a'); c.disk(px + 12, y + 2, 1, '#d9453a'); px += 24; }
            else if (it === 'phone') { c.box(px, y, 8, 12, '#2a2c32', '#5a5e68', '#101216', '#000'); c.fr(px + 1, y + 1, 6, 8, '#6ac0e8'); px += 14; }
            else if (it === 'money') { c.fr(px, y, 14, 8, '#6aa86a'); c.fr(px + 2, y + 2, 10, 1, '#3a6a3a'); c.fr(px + 1, y + 6, 12, 1, '#4a8a4a'); px += 20; }
            else if (it === 'scale') { c.box(px, y, 14, 10, '#c8ccd0', '#fff', '#7a7e84', '#2a2c30'); c.fr(px + 2, y + 2, 6, 3, '#6a7a60'); px += 20; }
        }
        return b;
    }

    // Prateleira de parede alta (encostada ao fundo): tábuas + produtos (paletas de cor). tiers = nº de prateleiras.
    shelf(r, h, tiers, prods, wood = '#7a5430') {
        const b = this.base(r, h), c = this.c, rng = this.rng, fh = b.hp + b.h, top = b.top;
        this.shadow(b);
        c.fr(b.x, top, b.w, fh, this.t(wood, 0.35));
        for (let t = 0; t < tiers; t++) {
            const by = top + Math.round((fh - 5) * (t + 1) / tiers) - 5;
            // produtos desta prateleira
            let x = b.x + 5;
            while (x < b.x + b.w - 9) {
                const pc = prods[Math.floor(rng() * prods.length)], pw = 5 + Math.floor(rng() * 6), ph = 7 + Math.floor(rng() * 8), kind = rng();
                if (kind < 0.3) { c.fr(x, by - ph, 3, ph, pc); c.fr(x, by - ph, 1, ph, this.t(pc, 1.4)); c.fr(x + 1, by - ph - 3, 1, 3, pc); }
                else { c.box(x, by - ph, pw, ph, pc, this.t(pc, 1.3), this.t(pc, 0.65), this.t(pc, 0.3)); c.fr(x + 1, by - ph + 2, Math.max(1, pw - 2), 1, '#f4f1e8'); }
                x += (kind < 0.3 ? 4 : pw) + 1 + Math.floor(rng() * 2);
            }
            c.box(b.x, by, b.w, 5, wood, this.t(wood, 1.3), this.t(wood, 0.65), this.t(wood, 0.25));
        }
        for (const px of [b.x, b.x + b.w - 4]) c.box(px, top, 4, fh, this.t(wood, 0.85), this.t(wood, 1.3), this.t(wood, 0.55), this.t(wood, 0.25));
        this.solid(r, h);
        return b;
    }

    // Gôndola de loja (corredor de prateleiras com produtos), vista de cima: topo com caixas e frente com 3 fileiras.
    gondola(r, h, prods, body = '#c8ccd0') {
        const b = this.base(r, h), c = this.c, rng = this.rng;
        this.shadow(b);
        c.box(b.x, b.fy - 1, b.w, b.hp + 1, this.t(body, 0.6), this.t(body, 0.9), this.t(body, 0.4), '#202428');
        const rows = 3;
        for (let t = 0; t < rows; t++) {
            const by = b.fy + 1 + Math.round(b.hp * (t + 1) / rows) - 3;
            let x = b.x + 2;
            while (x < b.x + b.w - 5) { const pc = prods[Math.floor(rng() * prods.length)], pw = 3 + Math.floor(rng() * 4), ph = 5 + Math.floor(rng() * 3); c.box(x, by - ph + 2, pw, ph, pc, this.t(pc, 1.35), this.t(pc, 0.65), this.t(pc, 0.3)); x += pw + 1; }
            c.fr(b.x + 1, by + 2, b.w - 2, 1, this.t(body, 1.1));
        }
        c.box(b.x, b.top, b.w, b.h, body, this.t(body, 1.25), this.t(body, 0.7), '#202428');
        for (let k = 0; k < b.w / 6; k++) { const pc = prods[Math.floor(rng() * prods.length)]; c.box(b.x + 2 + k * 6, b.top + 3 + (k % 2) * 4, 5, b.h - 8 - (k % 2) * 4, pc, this.t(pc, 1.3), this.t(pc, 0.65), this.t(pc, 0.3)); }
        this.solid(r, h);
        return b;
    }

    // Geladeira de bebidas (porta de vidro), encostada na parede ou solta. col = cor da marca.
    cooler(r, h, col = '#2f86d0') {
        const b = this.base(r, h), c = this.c, rng = this.rng;
        this.shadow(b, 2);
        c.box(b.x, b.fy - 1, b.w, b.hp + 1, '#d8dce0', '#ffffff', '#8c9296', '#262a2e');
        c.fr(b.x + 2, b.fy + 2, b.w - 4, 5, col); c.fr(b.x + 2, b.fy + 2, b.w - 4, 1, this.t(col, 1.4));
        const gy = b.fy + 8, gh = b.hp - 10;
        c.fr(b.x + 2, gy, b.w - 4, gh, '#1c2a36');
        for (let t = 0; t < 3; t++) for (let i = 0; i < b.w - 8; i += 4) { const pc = ['#d9453a', '#3f9a52', '#e0a020', '#2f86d0', '#8a4ab0'][Math.floor(rng() * 5)]; c.fr(b.x + 4 + i, gy + 1 + t * Math.floor(gh / 3), 3, Math.max(3, Math.floor(gh / 3) - 2), pc); }
        c.fr(b.x + 2, gy, 2, gh, '#9ad8f0'); c.fr(b.x + b.w - 5, gy, 1, gh, '#c8ecf8');
        c.box(b.x, b.top, b.w, b.h, '#e8ecf0', '#ffffff', '#a4a8ac', '#262a2e');
        this.solid(r, h);
        return b;
    }
    vending(r, h, col = '#c0302a') {
        const b = this.base(r, h), c = this.c, rng = this.rng;
        this.shadow(b, 2);
        c.box(b.x, b.fy - 1, b.w, b.hp + 1, col, this.t(col, 1.3), this.t(col, 0.6), '#200808');
        c.fr(b.x + 3, b.fy + 3, b.w - 12, b.hp - 12, '#16222c');
        for (let t = 0; t < 4; t++) for (let i = 0; i < b.w - 16; i += 5) c.fr(b.x + 5 + i, b.fy + 5 + t * 7, 3, 5, ['#c0392b', '#e8e0d0', '#3a6fc4', '#3f9a52'][Math.floor(rng() * 4)]);
        c.fr(b.x + b.w - 8, b.fy + 4, 5, 14, '#3a3d44'); for (let k = 0; k < 4; k++) c.px(b.x + b.w - 6, b.fy + 6 + k * 3, '#7ad088');
        c.fr(b.x + 4, b.fy + b.hp - 7, b.w - 8, 5, '#0c0c10');
        c.box(b.x, b.top, b.w, b.h, this.t(col, 0.95), this.t(col, 1.3), this.t(col, 0.6), '#200808');
        this.solid(r, h);
        return b;
    }

    // Quadro/cartaz na face da parede norte: rect em px dentro da banda.
    poster(x, y, w, h, A, B, kind = 'plain') {
        const c = this.c;
        c.fr(x - 1, y - 1, w + 2, h + 2, '#2a1c10'); c.fr(x, y, w, h, A); c.fr(x, y, w, 1, this.t(A, 1.3));
        if (kind === 'burger') { c.disk(x + w / 2 | 0, y + h / 2 | 0, Math.min(w, h) / 3 | 0, '#d9a050'); c.fr(x + 3, y + (h / 2 | 0), w - 6, 3, '#3f8a3a'); c.fr(x + 3, y + (h / 2 | 0) + 3, w - 6, 3, '#6a3a1a'); }
        else if (kind === 'lines') { for (let j = 4; j < h - 3; j += 4) c.fr(x + 3, y + j, w - 6 - (j % 3) * 3, 1, B); }
        else if (kind === 'sun') { c.disk(x + w / 2 | 0, y + h / 2 | 0, Math.min(w, h) / 3 | 0, B); }
        else if (kind === 'fruit') { c.disk(x + w / 3 | 0, y + h / 2 | 0, 4, '#e8702a'); c.disk(x + 2 * w / 3 | 0, y + h / 2 | 0, 4, '#d9453a'); c.disk(x + w / 2 | 0, y + h / 3 | 0, 3, '#7ac040'); }
        else if (kind === 'wanted') { c.disk(x + w / 2 | 0, y + h / 3 | 0, 4, '#2a2a2a'); c.fr(x + 3, y + h - 8, w - 6, 3, B); c.fr(x + 3, y + h - 4, w - 8, 2, B); }
        else if (kind === 'landscape') { c.fr(x + 1, y + h / 2 | 0, w - 2, h / 2 - 1 | 0, '#3f7a40'); c.disk(x + w - 6, y + 6, 3, '#f0d870'); c.ln(x + 1, y + h - 3, x + w / 2 | 0, y + h / 2 | 0, '#2f5a30'); }
    }
    // Janela na banda norte.
    window(x, y, w, h, day = '#7ab4d8') {
        const c = this.c;
        c.fr(x - 2, y - 2, w + 4, h + 4, '#3a2a1c'); c.fr(x, y, w, h, day);
        for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) if (((i + j) % 14) < 3) c.px(x + i, y + j, this.t(day, 1.25));
        c.fr(x + (w / 2 | 0), y, 2, h, '#3a2a1c'); c.fr(x, y + (h / 2 | 0), w, 2, '#3a2a1c'); c.fr(x - 2, y + h + 2, w + 4, 3, '#7a5a3a');
    }
    // Luminária pendente: soquete + bulbo + cabo até o teto (banda) e luz.
    lamp(x, z, col = '#fff0b0', shade = null) {
        const c = this.c, px = this.X(x), py = this.Y(z);
        c.ln(px, shade ? py - 9 - 14 : this.nY - this.faceH + 4, px, py - 8, '#1a1410');
        if (shade) { c.box(px - 8, py - 9, 17, 6, shade, this.t(shade, 1.3), this.t(shade, 0.6), '#201810'); c.fr(px - 5, py - 3, 11, 2, col); }
        else { c.fr(px - 2, py - 8, 5, 4, '#2a2420'); c.disk(px, py - 1, 4, col); c.disk(px, py - 1, 2, '#ffffff'); }
    }

    // Ponto livre (raio do jogador) mais perto da porta, por dentro: onde o jogador aparece ao entrar.
    free(x, z, r = Config.player.radius + 0.05) {
        if (x < r || z < r || x > this.W - r || z > this.D - r) return false;
        for (const o of this.obs) { const cx = Math.max(o.x0, Math.min(x, o.x1)), cz = Math.max(o.z0, Math.min(z, o.z1)); if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return false; }
        return true;
    }
    // Onde o jogador aparece ao entrar: já no meio da loja, de frente para o balcão (3,4 u antes do atendente), longe da porta.
    // Só vale um ponto ALCANÇÁVEL a pé a partir da porta (varredura em grade), para nunca nascer preso atrás de móveis.
    _spawn() {
        const dc = (this.door.x0 + this.door.x1) / 2, cl = this.clerk, st = 0.25, nx = Math.ceil(this.W / st), nz = Math.ceil(this.D / st);
        const tx = cl ? cl.x : dc, tz = cl ? Math.max(4.2, cl.z - 3.4) : 4.2;
        let start = null;
        for (let z = 0.9; z < 3.5 && !start; z += st) for (let dx = -1.2; dx <= 1.2 && !start; dx += st) if (this.free(dc + dx, z)) start = [dc + dx, z];
        if (!start) return { x: dc, z: 3.8 };
        const seen = new Uint8Array(nx * nz), q = [[Math.floor(start[0] / st), Math.floor(start[1] / st)]];
        seen[q[0][1] * nx + q[0][0]] = 1;
        let best = null, bd = 1e9;
        while (q.length) {
            const [x, z] = q.pop(), px = (x + 0.5) * st, pz = (z + 0.5) * st;
            if (pz >= 3.8) { const d = hypot(px - tx, pz - tz); if (d < bd) { bd = d; best = { x: px, z: pz }; } }
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const X = x + dx, Z = z + dz;
                if (X < 0 || Z < 0 || X >= nx || Z >= nz || seen[Z * nx + X] || !this.free((X + 0.5) * st, (Z + 0.5) * st)) continue;
                seen[Z * nx + X] = 1; q.push([X, Z]);
            }
        }
        return best || { x: start[0], z: start[1] };
    }

    // ---------------------------------------------------------------- iluminação e vinheta (últimos passos)
    finish(vignette = 0.34) {
        const c = this.c, WP = this.wpx, HP = this.hpxTot;
        const lights = this.lights;
        for (let y = 0; y < HP; y++) for (let x = 0; x < WP; x++) {
            const k = (y * WP + x) * 4; if (c.data[k + 3] === 0) continue;
            let add0 = 0, add1 = 0, add2 = 0, mul = 1;
            for (const L of lights) {
                const d = hypot(x - L.x, y - L.y) / L.r; if (d >= 1) continue;
                const g = (1 - d) * (1 - d) * L.a;
                mul += g * 0.9; add0 += g * L.col[0] * 0.2; add1 += g * L.col[1] * 0.2; add2 += g * L.col[2] * 0.2;
            }
            const vg = hypot((x - WP / 2) / (WP * 0.62), (y - HP * 0.55) / (HP * 0.7)), v = Math.max(0, vg - 0.55) * vignette;
            c.data[k] = Math.max(0, Math.min(255, c.data[k] * (mul - v) + add0));
            c.data[k + 1] = Math.max(0, Math.min(255, c.data[k + 1] * (mul - v) + add1));
            c.data[k + 2] = Math.max(0, Math.min(255, c.data[k + 2] * (mul - v) + add2));
        }
        return {
            canvas: c, in: this.IN, W: this.W, D: this.D, obs: this.obs, door: this.door, clerk: this.clerk, patrons: this.patrons,
            spawn: this._spawn(), uses: this.uses,
        };
    }
}
