// ============================================================================
// ShopPieces — peças de cena PRÓPRIAS de cada tipo de interior (antes desenhadas à mão dentro dos layouts, art/ShopStyles.js):
// cozinha da lanchonete, letreiros e quadros de parede, araras, manequins, aparelhos da academia, prateleira de bebidas do bar, mesa
// de sinuca, jukebox, caixotes de fruta, adega, tatame, balcão de sushi, lanternas, painel de armas, vitrines, grafite, piano, cofre
// e elevador do banco… Cada uma pinta a pixel art de sempre (20 px/u) e, por ser uma chamada do ShopCtx, é gravada e repintada em
// alta definição pelo pintor de mesmo nome (art/InteriorHDPieces.js). Mesmos parâmetros, mesmo lugar, mesmos sólidos e usos.
// ============================================================================

Object.assign(ShopCtx.prototype, {
    // ---------------------------------------------------------------- parede (faixa da parede do fundo entre xa e xb, em u)
    menuBoard(xa, xb) {
        const bd = this.band(xa, xb), c = this.c;
        c.fr(bd.x, bd.y + 6, bd.w, 30, '#2a2e2c'); c.fr(bd.x, bd.y + 6, bd.w, 1, '#8a6a48');
        for (let k = 0; k < 5; k++) { c.fr(bd.x + 5, bd.y + 11 + k * 5, bd.w - 22 - (k % 3) * 6, 1, '#e8e4d0'); c.fr(bd.x + bd.w - 14, bd.y + 11 + k * 5, 8, 1, '#e0b050'); }
    },
    crossSign(xa, xb) {
        const bd = this.band(xa, xb), c = this.c;
        c.fr(bd.x + 6, bd.y + 10, bd.w - 12, 18, '#2fae8f'); c.fr(bd.x + bd.w / 2 - 2, bd.y + 12, 4, 14, '#fff'); c.fr(bd.x + bd.w / 2 - 7, bd.y + 17, 14, 4, '#fff');
    },
    wallMirror(xa, xb, frame = '#c8a040') {
        const bd = this.band(xa, xb), c = this.c;
        c.fr(bd.x, bd.y + 6, bd.w, 30, frame); c.fr(bd.x + 2, bd.y + 8, bd.w - 4, 26, '#cfe0ea'); c.fr(bd.x + 4, bd.y + 10, 3, 20, '#ffffff');
    },
    curtain(xa, xb) {
        const bd = this.band(xa, xb), c = this.c;
        c.fr(bd.x, bd.y + 4, bd.w, bd.h - 6, '#6a2a48'); for (let x = 2; x < bd.w - 2; x += 4) c.fr(bd.x + x, bd.y + 4, 1, bd.h - 6, '#8a3a60'); c.fr(bd.x, bd.y + 3, bd.w, 2, '#c8a040');
    },
    gymMirrors(xa, xb) {
        const bd = this.band(xa, xb), c = this.c;
        for (let x = bd.x + 6; x < bd.x + bd.w - 4; x += 22) { c.fr(x, bd.y + 6, 2, bd.h - 14, '#d8eef6'); c.fr(x + 5, bd.y + 10, 1, bd.h - 22, '#c4e2ee'); }
    },
    // Prateleira de garrafas do bar (fileira `tier`, 0 = de cima).
    barShelf(xa, xb, tier) {
        const bd = this.band(xa, xb), y = bd.base - bd.h + 20 + tier * 26, c = this.c;
        c.fr(bd.x, y + 12, bd.w, 3, '#3a2818'); c.fr(bd.x, y + 12, bd.w, 1, '#8a6238');
        for (let x = bd.x + 4; x < bd.x + bd.w - 6; x += 6 + (x % 3)) this.bottle(x, y + 12, ['#3f7a40', '#8a4a20', '#c8b060', '#2f4a8a', '#a03030', '#d8d0b0'][Math.floor(this.rng() * 6)], 11 + (x % 4));
    },
    noren(xa, xb) {
        const bd = this.band(xa, xb), c = this.c;
        c.fr(bd.x, bd.y + 6, bd.w, 5, '#2a1c10');
        for (let i = 0; i < bd.w - 10; i += 14) { c.fr(bd.x + 2 + i, bd.y + 11, 12, 30, '#b8282f'); c.fr(bd.x + 2 + i, bd.y + 11, 12, 1, '#e0585a'); c.fr(bd.x + 7 + i, bd.y + 20, 2, 10, '#f4ecd8'); }
    },
    gunWall(xa, xb) {
        const bd = this.band(xa, xb), c = this.c, y0 = bd.y + 10;
        const gun = (x, y, long) => { c.ln(x, y - 1, x + (long ? 28 : 11), y - 1, '#c8ccd2'); c.ln(x, y, x + (long ? 28 : 11), y, '#aeb4bc'); c.ln(x, y + 1, x + (long ? 28 : 11), y + 1, '#2a2e32'); if (long) { c.fr(x, y - 1, 8, 4, '#5a3a22'); c.fr(x + 20, y - 3, 4, 3, '#16181a'); } else { c.fr(x, y, 3, 7, '#8a8e96'); c.px(x + 4, y - 1, '#c8ccd2'); } };
        for (let x = bd.x + 8; x < bd.x + bd.w - 34; x += 46) { gun(x, y0 + 4, true); gun(x + 2, y0 + 12, true); gun(x + 6, y0 + 22, false); gun(x + 24, y0 + 22, false); gun(x + 10, y0 + 31, true); }
    },
    graffiti(xa, xb, v = 0) {
        const bd = this.band(xa, xb), c = this.c, cols = ['#e0a020', '#2f9ad0', '#d9453a', '#6ac048'];
        for (let k = 0; k < 5; k++) { const gx = bd.x + 10 + k * 36, gy = bd.y + 12 + (k % 2) * 6, col = cols[(k + v) % 4]; c.disk(gx + 6, gy + 6, 7, col); c.disk(gx + 6, gy + 6, 4, '#2a2622'); c.ln(gx - 4, gy + 18, gx + 20, gy + 14, col); c.ln(gx - 3, gy + 19, gx + 21, gy + 15, col); }
    },
    bankSign(xa, xb, P, hq = false) {
        const bd = this.band(xa, xb), c = this.c;
        if (hq) { c.fr(bd.x + 6, bd.y + 8, bd.w - 12, 20, P.b); c.fr(bd.x + 10, bd.y + 14, bd.w - 20, 5, P.acc); return; }
        c.fr(bd.x + 4, bd.y + 8, bd.w - 8, 18, P.b); c.fr(bd.x + 8, bd.y + 13, bd.w - 16, 4, P.a); c.fr(bd.x + 8, bd.y + 19, bd.w - 26, 3, P.acc);
    },
    jewelSign(xa, xb, trim) {
        const bd = this.band(xa, xb), c = this.c;
        c.fr(bd.x + 4, bd.y + 10, bd.w - 8, 16, '#16121a'); c.fr(bd.x + 6, bd.y + 12, bd.w - 12, 2, trim); c.fr(bd.x + 6, bd.y + 22, bd.w - 12, 2, trim);
        for (let k = 0; k < 5; k++) c.disk(bd.x + 14 + k * ((bd.w - 28) >> 2), bd.y + 18, 2, trim);
    },

    // ---------------------------------------------------------------- lanchonete e pizzaria
    // Cozinha da lanchonete: bancada de inox com a chapa (dois hambúrgueres e a fumaça) e a fritadeira.
    kitchen(r) {
        const pb = this.counter(r, 0.95, '#b8bcc4', '#8a8f98', []), c = this.c, gx = pb.x + 6;
        c.fr(gx, pb.top + 4, 34, pb.h - 7, '#1c1e22'); for (let i = 0; i < 34; i += 3) c.fr(gx + i, pb.top + 4, 1, pb.h - 7, '#4a4e56');
        c.disk(gx + 9, pb.top + 9, 5, '#6a3a1a'); c.disk(gx + 22, pb.top + 9, 5, '#7a4420'); c.px(gx + 8, pb.top + 7, '#a86a3a');
        for (let k = 0; k < 4; k++) { c.px(gx + 6 + k * 6, pb.top - 4 - (k % 2) * 3, '#e8ecf0', 160); c.px(gx + 7 + k * 6, pb.top - 7 - (k % 2) * 3, '#e8ecf0', 110); }
        c.box(pb.x + 52, pb.top + 3, 22, pb.h - 6, '#4a4e58', '#7a7e88', '#202226', '#0c0d10'); c.fr(pb.x + 55, pb.top + 6, 16, 8, '#e0a830');
        return pb;
    },

    // ---------------------------------------------------------------- boutique
    clothesRack(r, tees, n0) {
        const b = this.blk(r, 1.55, '#b8bcc4', '#6a6e78'), c = this.c;
        c.fr(b.x, b.top + Math.floor(b.h / 2) - 1, b.w, 2, '#e8ecf0');
        for (let x = 3, k = n0; x < b.w - 4; x += 5, k++) { const col = tees[k % tees.length]; c.box(b.x + x, b.top + 2, 4, b.h - 4 + b.hp - 4, col, this.t(col, 1.3), this.t(col, 0.7), this.t(col, 0.35)); c.px(b.x + x + 1, b.top + 1, '#c8ccd2'); }
        return b;
    },
    foldTable(r, tees, v) {
        const b = this.blk(r, 0.9, '#f4f0ea', '#a89888'), c = this.c;
        for (let k = 0; k < 6; k++) { const col = tees[(k * 5 + v) % tees.length], x = b.x + 6 + (k % 3) * Math.floor((b.w - 16) / 3), y = b.top + 4 + Math.floor(k / 3) * Math.floor(b.h / 2 - 2); c.box(x, y, 14, 8, col, this.t(col, 1.3), this.t(col, 0.7), this.t(col, 0.35)); c.fr(x + 1, y + 3, 12, 1, this.t(col, 0.8)); }
        return b;
    },
    mannequin(x, z, col) {
        const c = this.c, px = this.X(x), py = this.Y(z);
        c.bl(px - 7, py + 2, 18, 7, [8, 5, 3], 0.3); c.box(px - 9, py - 14, 18, 20, col, this.t(col, 1.3), this.t(col, 0.7), this.t(col, 0.3)); c.box(px - 6, py + 4, 12, 4, '#2a2c30', '#4a4d55', '#18191c', '#000'); c.disk(px, py - 19, 6, '#e8e4dc'); c.px(px - 2, py - 22, '#ffffff');
        this.solid([x - 0.35, z - 0.35, x + 0.35, z + 0.35], 1.8);
    },
    counterBags(r) {
        const b = this.base(r, 1.0), c = this.c;
        c.box(b.x + 4, b.top + 2, 10, 9, '#d46a9e', '#f0a0c8', '#8a3a60', '#401828'); c.box(b.x + 16, b.top + 3, 9, 8, '#f4f0ea', '#fff', '#a8a098', '#403830');
    },

    // ---------------------------------------------------------------- academia
    gymRack(cx, cz) {
        const c = this.c;
        this.rug(this.R(cx - 1.2, cz - 0.9, cx + 1.2, cz + 0.9), '#6a4c30', '#3c2a1a', false);
        for (const s of [-1, 1]) this.blk(this.R(cx + s * 0.66 - 0.06, cz - 0.16, cx + s * 0.66 + 0.06, cz + 0.16), 2.0, '#4a4e56', '#3a3d44', false);
        const b = this.base(this.R(cx - 0.85, cz + 0.05, cx + 0.85, cz + 0.12), 1.35); c.fr(b.x, b.top, b.w, 2, '#c8ccd2');
        for (const s of [-1, 1]) { const p = this.base(this.R(cx + s * 0.75 - 0.08, cz, cx + s * 0.75 + 0.08, cz + 0.12), 1.35); c.fr(p.x, p.top - 6, p.w, 12, '#18181c'); }
    },
    gymBench(cx, cz) {
        const c = this.c;
        this.rug(this.R(cx - 0.8, cz - 1.1, cx + 0.8, cz + 1.0), '#6a4c30', '#3c2a1a', false);
        this.blk(this.R(cx - 0.15, cz - 0.8, cx + 0.15, cz + 0.45), 0.45, '#1a1a20', '#2a2a32', false);
        for (const s of [-1, 1]) this.blk(this.R(cx + s * 0.46 - 0.04, cz + 0.52, cx + s * 0.46 + 0.04, cz + 0.6), 1.05, '#4a4e56', '#3a3d44', false);
        const b = this.base(this.R(cx - 0.75, cz + 0.5, cx + 0.75, cz + 0.56), 1.0); c.fr(b.x, b.top, b.w, 2, '#c8ccd2');
    },
    gymSpot(cx, cz) { this.rug(this.R(cx - 0.7, cz - 0.6, cx + 0.7, cz + 0.6), '#6a4c30', '#3c2a1a', false); },
    dumbbellRack(r) {
        const b = this.blk(r, 0.75, '#3a3d44', '#2a2d34'), c = this.c;
        for (let x = b.x + 4, k = 0; x < b.x + b.w - 6; x += 9, k++) { const rr = 2 + (k % 4); c.disk(x, b.top + 4, rr, '#18181c'); c.disk(x + 5, b.top + 4, rr, '#18181c'); c.fr(x, b.top + 4, 5, 1, '#c8ccd2'); }
        return b;
    },
    plateTree(r) {
        const b = this.blk(r, 1.2, '#2a2c32', '#3a3d44'), c = this.c;
        for (let k = 0; k < 3; k++) { c.disk(b.x + (b.w >> 1), b.top + 4 + k * 6, 6 - k, '#141418'); c.ring(b.x + (b.w >> 1), b.top + 4 + k * 6, 6 - k, '#3a3d44'); }
        return b;
    },
    treadmill(r) {
        const b = this.blk(r, 0.35, '#2a2c32', '#1a1c20', false), c = this.c;
        c.fr(b.x + 3, b.top + 3, b.w - 6, b.h - 6, '#101114'); c.fr(b.x + 2, b.top, b.w - 4, 3, '#4a4e56');
        return b;
    },

    // ---------------------------------------------------------------- bar
    poolTable(r) {
        const b = this.blk(r, 0.9, '#2f7a40', '#4a3018'), c = this.c;
        c.box(b.x, b.top, b.w, b.h, '#5a3a1c', '#8a6238', '#33220f', '#1a1008'); c.fr(b.x + 4, b.top + 4, b.w - 8, b.h - 8, '#2f8a48'); c.fr(b.x + 4, b.top + 4, b.w - 8, 1, '#3fa05a');
        for (const [bx2, by2, col] of [[30, 20, '#d9453a'], [34, 24, '#e0c030'], [34, 16, '#2f6fb5'], [38, 20, '#101010'], [38, 14, '#d9702a'], [38, 26, '#8a4ab0']]) c.disk(b.x + bx2, b.top + by2 - 6, 2, col);
        c.disk(b.x + 14, b.top + 19, 2, '#f4f1e8'); c.ln(b.x + 4, b.top + 36, b.x + 28, b.top + 22, '#d9b878');
        for (const [px, py] of [[b.x + 4, b.top + 4], [b.x + b.w - 5, b.top + 4], [b.x + 4, b.top + b.h - 5], [b.x + b.w - 5, b.top + b.h - 5], [b.x + b.w / 2 | 0, b.top + 4], [b.x + b.w / 2 | 0, b.top + b.h - 5]]) c.disk(px, py, 2, '#0a0a0a');
        return b;
    },
    jukebox(r) {
        const b = this.blk(r, 1.7, '#6a3a1c', '#a8482c'), c = this.c;
        c.disk(b.x + (b.w / 2 | 0), b.fy + 10, 6, '#e8c060'); c.disk(b.x + (b.w / 2 | 0), b.fy + 10, 3, '#a8482c'); for (let i = 0; i < b.w - 4; i += 3) c.px(b.x + 2 + i, b.fy + 20, '#7ad8e8');
        return b;
    },
    // Baralho e os tentos de palito em cima da mesa de truco (px, py = centro, em px).
    trucoCards(px, py) {
        const c = this.c;
        c.fr(px - 9, py - 4, 6, 9, '#f4f1e8'); c.fr(px - 8, py - 3, 4, 7, '#a8283a'); c.fr(px + 1, py - 2, 6, 9, '#f4f1e8'); c.px(px + 4, py + 1, '#c8102e');
        c.fr(px - 3, py + 6, 7, 9, '#f4f1e8'); c.px(px, py + 9, '#16161a'); for (let k = 0; k < 4; k++) c.fr(px + 9 + k * 2, py + 5, 1, 5, '#e8d0a0');
    },

    // ---------------------------------------------------------------- saladas e sucos
    fruitCrate(r, cols) {
        const b = this.blk(r, 0.8, '#b08850', '#8a6838'), c = this.c;
        for (let i = 3; i < b.w - 4; i += 6) for (let j = 3; j < b.h - 3; j += 6) c.disk(b.x + i, b.top + j, 3, cols[(i + j) % cols.length]);
        c.fr(b.x, b.fy + 2, b.w, 1, '#5a4020');
        return b;
    },

    // ---------------------------------------------------------------- restaurantes de luxo
    wineRack(r) {
        const b = this.base(r, 2.6), c = this.c;
        this.shadow(b); c.fr(b.x, b.top, b.w, b.hp + b.h, '#1c1008'); c.box(b.x, b.top, b.w, b.hp + 3, '#4a2c18', '#7a4a28', '#2a1608', '#100804');
        for (let j = 4; j < b.hp - 2; j += 7) for (let i = 4; i < b.w - 3; i += 7) { c.disk(b.x + i, b.top + j, 3, '#1a0a06'); c.disk(b.x + i, b.top + j, 2, ['#5a1a24', '#3a4a22', '#8a7040'][(i + j) % 3]); }
        c.box(b.x, b.top + b.hp + 2, b.w, b.h - 1, '#5a3820', '#8a5a34', '#2a1608', '#100804'); this.solid(r, 2.6);
        return b;
    },
    candle(px, py) { this.c.fr(px - 1, py, 3, 5, '#2f4a2a'); this.c.px(px, py - 2, '#ffd23a'); },
    tatami(r) {
        const c = this.c, x = this.X(r[0]), y = this.Y(r[3]), w = this.X(r[2]) - x, h = this.Y(r[1]) - y;
        c.fr(x - 2, y - 2, w + 4, h + 4, '#3a2a18');
        for (let j = 0; j < h; j += 40) for (let i = 0; i < w; i += 80) { c.fr(x + i, y + j, Math.min(80, w - i), Math.min(40, h - j), '#a8bc78'); c.fr(x + i, y + j, Math.min(80, w - i), 1, '#c8dc98'); c.fr(x + i, y + j, 1, Math.min(40, h - j), '#7a8e50'); c.fr(x + i + 1, y + j + 1, Math.min(80, w - i) - 2, 2, '#3a4a28'); }
        HouseArt._grain(c, x, y, w, h, 7, this.seed);
    },
    cushion(x, z) { const b = this.base([x - 0.5, z - 0.5, x + 0.5, z + 0.5], 0.2); this.c.box(b.x, b.y, b.w, b.h, '#b8382c', '#d8584a', '#7a2018', '#301008'); return b; },
    sake(px, py) { this.c.fr(px - 2, py, 4, 8, '#e8e0c8'); },
    // Balcão de sushi: vitrine de vidro com os peixes em bandejas e os pratinhos.
    sushiBar(r) {
        const b = this.counter(r, 1.05, '#d8c8a0', '#4a3418', []), c = this.c;
        c.fr(b.x + 2, b.top + 2, b.w - 4, b.h - 4, '#a8c8c8'); c.fr(b.x + 2, b.top + 2, b.w - 4, 2, '#d8f0f0');
        for (let i = 6; i < b.w - 8; i += 11) { c.box(b.x + i, b.top + 6, 9, 5, '#2a2a2e', '#4a4a50', '#101012', '#000'); c.fr(b.x + i + 1, b.top + 6, 7, 3, ['#e8e0d0', '#e87a5a', '#e8a8a0', '#f0c860'][(i / 11 | 0) % 4]); c.px(b.x + i + 4, b.top + 5, '#3f9a52'); }
        for (let i = 8; i < b.w - 10; i += 22) { c.disk(b.x + i, b.top + 19, 4, '#e8e4dc'); c.disk(b.x + i, b.top + 19, 2, ['#e87a5a', '#f0c860'][(i / 22 | 0) % 2]); }
        return b;
    },
    woodStool(r) { const b = this.base(r, 0.6); this.c.box(b.x, b.y - 4, b.w, b.h + 4, '#8a5a30', '#b88850', '#4a3018', '#201408'); this.solid(r, 0.6); return b; },
    lantern(x, z) {
        const c = this.c, px = this.X(x), py = this.Y(z);
        c.ln(px, this.nY - this.faceH + 4, px, py - 12, '#1a1410'); c.disk(px, py - 5, 7, '#7a2018'); c.disk(px, py - 5, 6, '#e0502a'); c.disk(px - 1, py - 6, 3, '#ffb060'); c.fr(px - 3, py - 13, 6, 2, '#2a1c10'); c.fr(px - 3, py + 1, 6, 2, '#2a1c10');
        this.light(x, z - 0.4, 5.5, [255, 150, 80], 0.5);
    },

    // ---------------------------------------------------------------- loja de armas e boca de fumo
    ammoShelf(r) {
        const b = this.base(r, 1.3), c = this.c;
        this.shadow(b);
        c.box(b.x, b.top + 4, b.w, 4, '#2a3030', '#4a5250', '#101414', '#000');
        for (let i = 4; i < b.w - 14; i += 16) { c.box(b.x + i, b.top - 6, 14, 12, '#4a6a3a', '#7a9a5a', '#2a4020', '#101a0c'); c.fr(b.x + i + 2, b.top - 3, 10, 2, '#d8d070'); c.box(b.x + i, b.top + 10, 14, 10, '#6a7a4a', '#9aaa6a', '#3a4a28', '#161e0c'); }
        this.solid(r, 1.3);
        return b;
    },
    showcase(r) {
        const b = this.blk(r, 1.0, '#a8c8c8', '#3a4440'), c = this.c;
        c.fr(b.x + 2, b.top + 2, b.w - 4, b.h - 4, '#8ab0b4'); c.fr(b.x + 2, b.top + 2, b.w - 4, 2, '#d8f0f0');
        for (let i = 6; i < b.w - 22; i += 24) { c.ln(b.x + i, b.top + 9, b.x + i + 14, b.top + 9, '#16181a'); c.fr(b.x + i, b.top + 9, 3, 8, '#16181a'); c.ln(b.x + i + 2, b.top + 19, b.x + i + 18, b.top + 19, '#16181a'); c.fr(b.x + i + 2, b.top + 19, 3, 6, '#16181a'); }
        c.fr(b.x + 1, b.fy + 3, b.w - 2, b.hp - 5, '#8ab0b4'); c.fr(b.x + 1, b.fy + 3, b.w - 2, 2, '#d8f0f0');
        return b;
    },
    ammoCrates(r) {
        const b = this.blk(r, 1.2, '#5a7a44', '#46603a'), c = this.c;
        c.fr(b.x + 2, b.fy + 3, b.w - 4, 2, '#d8d070'); c.fr(b.x + 2, b.top + 3, b.w - 4, 2, '#8aa060'); c.fr(b.x + (b.w / 2 | 0) - 1, b.top + 2, 3, b.h - 4, '#3a4a2a');
        return b;
    },
    gunTable(r) {
        const b = this.blk(r, 0.9, '#6a4a2a', '#4a3018'), c = this.c;
        for (let i = 6; i < b.w - 26; i += 30) { c.ln(b.x + i, b.top + 7, b.x + i + 22, b.top + 7, '#16181a'); c.ln(b.x + i, b.top + 8, b.x + i + 22, b.top + 8, '#2a2e32'); c.fr(b.x + i, b.top + 7, 6, 4, '#5a3a22'); c.fr(b.x + i + 6, b.top + 14, 12, 3, '#16181a'); c.fr(b.x + i + 6, b.top + 14, 3, 7, '#16181a'); }
        c.fr(b.x + b.w - 24, b.top + 6, 16, 9, '#6aa86a'); c.fr(b.x + b.w - 22, b.top + 8, 12, 1, '#3a6a3a'); c.fr(b.x + b.w - 20, b.top + 11, 10, 6, '#7ab87a');
        return b;
    },
    // Balcão da boca com a grade de ferro na frente do atendente.
    grilleCounter(r, items) {
        const b = this.counter(r, 1.0, '#6a665e', '#4a463e', items), c = this.c;
        for (let i = 3; i < b.w - 2; i += 6) { c.fr(b.x + i, b.top - 28, 2, 36, '#1c1e22'); c.fr(b.x + i, b.top - 28, 1, 36, '#4a4e56'); }
        c.fr(b.x + 2, b.top - 28, b.w - 4, 2, '#1c1e22'); c.fr(b.x + 2, b.top - 6, b.w - 4, 2, '#1c1e22');
        return b;
    },
    oldSofa(r) {
        const b = this.blk(r, 0.9, '#6a4a3a', '#4a3024'), c = this.c;
        c.fr(b.x + 3, b.top + 4, b.w - 6, 10, '#7a5646'); c.ln(b.x + 5, b.top + 20, b.x + 14, b.top + 28, '#2a1c14'); c.fr(b.x + 4, b.top + b.h - 8, 12, 4, '#a8a090');
        return b;
    },
    oldTv(r) {
        const b = this.blk(r, 0.8, '#3a3e44', '#26282c'), c = this.c;
        c.box(b.x + 3, b.top - 6, 24, 16, '#16181c', '#3a3e46', '#0a0a0c', '#000'); c.fr(b.x + 6, b.top - 3, 16, 9, '#46586a'); c.ln(b.x + 8, b.top - 1, b.x + 14, b.top + 3, '#8aa8c0');
        return b;
    },
    cardboard(px, py) { this.c.fr(px, py, 26, 12, '#8a8a7a'); this.c.fr(px, py, 26, 1, '#b8b8a8'); },

    // ---------------------------------------------------------------- casas e bancos
    piano(r) {
        const b = this.blk(r, 1.0, '#121216', '#0a0a0e'), c = this.c;
        c.fr(b.x + 3, b.top + 3, b.w - 6, 4, '#f4f4f0'); for (let i = 5; i < b.w - 5; i += 3) c.fr(b.x + i, b.top + 3, 1, 3, '#16161a');
        return b;
    },
    bankSafe(r, P) {
        const b = this.blk(r, 1.6, '#5a6068', '#3a4048'), c = this.c;
        c.disk(this.X((r[0] + r[2]) / 2), this.Y(r[3]) + 6, 5, '#9aa2ac'); c.disk(this.X((r[0] + r[2]) / 2), this.Y(r[3]) + 6, 2, P.a);
        return b;
    },
    elevator(r) {
        const b = this.blk(r, 2.6, '#8a8f98', '#5a6068'), c = this.c;
        c.fr(this.X(r[0]) + 8, this.Y(r[3]) + 10, 24, 30, '#b8c0c8'); c.fr(this.X(r[0]) + 19, this.Y(r[3]) + 10, 2, 30, '#5a6068');
        return b;
    },
    lasers(xa, xb, z0, z1) { for (let z = z0; z < z1; z += 1.1) this.c.ln(this.X(xa), this.Y(z), this.X(xb), this.Y(z), '#ff2a2a'); },
    vaultDoor(r, P) {
        const b = this.blk(r, 2.4, '#7a8088', '#4a5058'), c = this.c, vx = this.X((r[0] + r[2]) / 2), vy = this.Y(r[3]) + 4;
        c.disk(vx, vy, 13, '#9aa2ac'); c.disk(vx, vy, 10, '#6a7078'); c.disk(vx, vy, 3, P.a);
        for (let k = 0; k < 6; k++) c.ln(vx, vy, vx + Math.round(Math.cos(k) * 9), vy + Math.round(Math.sin(k) * 9), '#c8d0d8');
        return b;
    },
    monitor(px, py) { this.c.box(px - 6, py - 14, 12, 8, '#16222c', '#4a7a9a', '#0a1218', '#000'); },
});
