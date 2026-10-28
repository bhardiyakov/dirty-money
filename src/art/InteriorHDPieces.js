// ============================================================================
// InteriorHDPieces — os pintores em alta definição das peças próprias de cada tipo de interior (art/ShopPieces.js): letreiros e
// quadros de parede, cozinha, araras e manequins, aparelhos de academia, prateleira de bebidas, sinuca, jukebox, caixotes de fruta,
// adega, tatame e balcão de sushi, lanternas, painel e vitrines de armas, grafite, piano, cofre, elevador e porta do cofre do banco.
// Mesmos parâmetros e mesmo lugar que a pixel art; as peças de parede sobem para a parede alta (HDPainter.wallY).
// ============================================================================

Object.assign(HDPainter.prototype, {
    // Retângulo na parede alta para uma peça de parede de largura w que queria a altura hw.
    wallBox(x, w, hw) {
        const top = this.top + 3, bot = this.S.nY - 4, h = Math.min(hw, bot - top);
        return { x, y: top + (bot - top - h) * 0.42, w, h };
    },
    glow(x, y, r, col, a) { const g = this.g; g.save(); g.globalCompositeOperation = 'screen'; g.fillStyle = this.rad(x, y, 0, r, [[0, col, a], [1, col, 0]]); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); },
    frameShadow(x, y, w, h) { this.soft(x + 0.8, y + 1.4, w + 1, h + 1, 0.45, 1.6, 0.6); },

    // ================================================================= PAREDE
    p_menuBoard(op, xa, xb) {
        const bd = this.S.band(xa, xb), g = this.g, B = this.wallBox(bd.x, bd.w, 30), rng = Pixel.rng(bd.x);
        this.frameShadow(B.x, B.y, B.w, B.h);
        this.fillRR(B.x - 1.4, B.y - 1.4, B.w + 2.8, B.h + 2.8, 0.8, this.lin(0, B.y, 0, B.y + B.h, [[0, [150, 112, 72]], [1, [96, 66, 40]]]));
        g.fillStyle = this.lin(0, B.y, 0, B.y + B.h, [[0, [44, 50, 48]], [1, [30, 34, 32]]]); g.fillRect(B.x, B.y, B.w, B.h);
        this.grain(B.x, B.y, B.w, B.h, 0.3, 21);
        g.fillStyle = 'rgba(236,232,214,0.9)'; g.fillRect(B.x + B.w * 0.25, B.y + 2, B.w * 0.5, 1.4);
        const rows = Math.floor((B.h - 6) / 3.2);
        for (let k = 0; k < rows; k++) {
            const yy = B.y + 5.5 + k * 3.2, L = (B.w - 18) * (0.55 + rng() * 0.4);
            g.fillStyle = 'rgba(236,232,214,0.82)'; g.fillRect(B.x + 3, yy, L, 0.9);
            g.fillStyle = 'rgba(120,120,110,0.7)'; for (let xx = B.x + 4 + L; xx < B.x + B.w - 11; xx += 1.6) g.fillRect(xx, yy + 0.4, 0.5, 0.4);
            g.fillStyle = 'rgba(240,190,80,0.95)'; g.fillRect(B.x + B.w - 9, yy, 6, 0.9);
        }
        g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(B.x, B.y, B.w * 0.4, B.h);
        this.strokeRR(B.x - 1.4, B.y - 1.4, B.w + 2.8, B.h + 2.8, 0.8, HDA.OUT, 0.45);
    },
    p_crossSign(op, xa, xb) {
        const bd = this.S.band(xa, xb), g = this.g, B = this.wallBox(bd.x + 6, bd.w - 12, 18), cx = B.x + B.w / 2, cy = B.y + B.h / 2;
        this.glow(cx, cy, B.w * 0.75, [80, 255, 190], 0.35);
        this.frameShadow(B.x, B.y, B.w, B.h);
        this.fillRR(B.x, B.y, B.w, B.h, 1.2, this.lin(0, B.y, 0, B.y + B.h, [[0, [70, 214, 170]], [1, [30, 150, 116]]]));
        const s = Math.min(B.h * 0.75, 14);
        this.fillRR(cx - s * 0.18, cy - s / 2, s * 0.36, s, 0.5, '#ffffff'); this.fillRR(cx - s / 2, cy - s * 0.18, s, s * 0.36, 0.5, '#ffffff');
        g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(B.x + 1, B.y + 1, B.w - 2, B.h * 0.35);
        this.strokeRR(B.x, B.y, B.w, B.h, 1.2, 'rgba(10,60,44,0.9)', 0.5);
    },
    p_wallMirror(op, xa, xb, frame = '#c8a040') {
        const bd = this.S.band(xa, xb), g = this.g, B = this.wallBox(bd.x, bd.w, 30), f = HDK.C(frame);
        this.frameShadow(B.x, B.y, B.w, B.h);
        this.fillRR(B.x, B.y, B.w, B.h, 1.4, this.lin(B.x, B.y, B.x + B.w, B.y + B.h, [[0, HDK.t(f, 1.3)], [0.5, f], [1, HDK.t(f, 0.6)]]));
        this.fillRR(B.x + 2, B.y + 2, B.w - 4, B.h - 4, 0.8, this.lin(B.x, B.y, B.x + B.w, B.y + B.h, [[0, [222, 236, 244]], [1, [140, 168, 184]]]));
        g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.moveTo(B.x + 4, B.y + B.h - 3); g.lineTo(B.x + B.w * 0.45, B.y + 3); g.lineTo(B.x + B.w * 0.62, B.y + 3); g.lineTo(B.x + 4 + B.w * 0.17, B.y + B.h - 3); g.closePath(); g.fill();
        this.strokeRR(B.x, B.y, B.w, B.h, 1.4, HDA.OUT, 0.45);
    },
    p_curtain(op, xa, xb) {
        const bd = this.S.band(xa, xb), g = this.g, top = this.top + 2, bot = this.S.nY - 1, w = bd.w;
        this.soft(bd.x + 1, top + 2, w, bot - top, 0.4, 2, 1);
        g.fillStyle = this.lin(0, top, 0, bot, [[0, [120, 48, 84]], [1, [80, 30, 56]]]); g.fillRect(bd.x, top + 2, w, bot - top - 2);
        for (let i = 0; i < w; i += 3.4) { g.fillStyle = this.lin(bd.x + i, 0, bd.x + i + 3.4, 0, [[0, [255, 200, 230], 0.18], [0.5, [0, 0, 0], 0], [1, [0, 0, 0], 0.3]]); g.fillRect(bd.x + i, top + 2, 3.4, bot - top - 2); }
        this.fillRR(bd.x - 1, top, w + 2, 2.2, 0.8, this.lin(0, top, 0, top + 2.2, [[0, [240, 210, 120]], [1, [150, 110, 40]]]));
        g.strokeStyle = HDA.OUT; g.lineWidth = 0.45; g.strokeRect(bd.x, top + 2, w, bot - top - 2);
    },
    p_gymMirrors(op, xa, xb) {
        const bd = this.S.band(xa, xb), g = this.g, top = this.top + 4, bot = this.S.nY - 4, n = Math.max(1, Math.round(bd.w / 44));
        for (let k = 0; k < n; k++) {
            const x = bd.x + 2 + k * (bd.w - 4) / n, w = (bd.w - 4) / n - 2;
            this.fillRR(x, top, w, bot - top, 0.6, '#5a5e66');
            this.fillRR(x + 0.8, top + 0.8, w - 1.6, bot - top - 1.6, 0.4, this.lin(x, top, x + w, bot, [[0, [196, 220, 232]], [1, [120, 146, 160]]]));
            g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(x + w * 0.1, bot - 1); g.lineTo(x + w * 0.4, top + 1); g.lineTo(x + w * 0.5, top + 1); g.lineTo(x + w * 0.2, bot - 1); g.closePath(); g.fill();
        }
    },
    p_barShelf(op, xa, xb, tier) {
        const bd = this.S.band(xa, xb), g = this.g, top = this.top + 3, bot = this.S.nY - 3, y = top + (bot - top) * (tier ? 0.86 : 0.42), rng = Pixel.rng(bd.x * 3 + tier * 77);
        const cols = ['#3f7a40', '#8a4a20', '#c8b060', '#2f4a8a', '#a03030', '#d8d0b0', '#5a2a40'];
        for (let x = bd.x + 3; x < bd.x + bd.w - 4; x += 3.6 + rng() * 1.4) this.bottleHD(x, y, cols[Math.floor(rng() * cols.length)], 7 + rng() * 3);
        this.soft(bd.x, y + 1.6, bd.w, 2, 0.45, 1.2, 0.5);
        this.fillRR(bd.x, y, bd.w, 2.4, 0.5, this.lin(0, y, 0, y + 2.4, [[0, [150, 104, 60]], [1, [70, 44, 24]]]));
        this.line(bd.x, y + 0.3, bd.x + bd.w, y + 0.3, 'rgba(255,220,170,0.5)', 0.4);
    },
    p_noren(op, xa, xb) {
        const bd = this.S.band(xa, xb), g = this.g, top = this.top + 3, bot = this.S.nY + 4;
        this.fillRR(bd.x - 1, top, bd.w + 2, 2.4, 1, this.lin(0, top, 0, top + 2.4, [[0, [110, 76, 44]], [1, [50, 32, 18]]]));
        for (let i = 0; i < bd.w - 10; i += 14) {
            const x = bd.x + 2 + i;
            this.soft(x + 0.8, top + 2.6, 12, bot - top - 2, 0.35, 1.4, 0.5);
            g.fillStyle = this.lin(x, 0, x + 12, 0, [[0, [214, 60, 60]], [0.5, [184, 40, 47]], [1, [130, 24, 30]]]); g.fillRect(x, top + 2.4, 12, bot - top - 2.4);
            g.fillStyle = 'rgba(244,236,216,0.95)'; this.circ(x + 6, top + (bot - top) * 0.45, 2.6, 'rgba(244,236,216,0.95)'); this.circ(x + 6, top + (bot - top) * 0.45, 1.4, '#b8282f');
            g.strokeStyle = 'rgba(60,8,10,0.7)'; g.lineWidth = 0.35; g.strokeRect(x, top + 2.4, 12, bot - top - 2.4);
        }
    },
    // Fuzis e pistolas pendurados no painel perfurado.
    p_gunWall(op, xa, xb) {
        const bd = this.S.band(xa, xb), g = this.g, top = this.top + 4, bot = this.S.nY - 3, rows = [top + 3, top + (bot - top) * 0.38, top + (bot - top) * 0.7];
        const rifle = (x, y, L) => {
            this.soft(x + 0.6, y + 0.8, L, 3, 0.4, 0.8, 0.5);
            this.fillRR(x, y - 0.4, L * 0.28, 2.6, 0.8, this.lin(0, y, 0, y + 2.6, [[0, [140, 92, 54]], [1, [80, 50, 28]]]));
            this.fillRR(x + L * 0.26, y - 0.2, L * 0.5, 1.8, 0.4, this.lin(0, y, 0, y + 1.8, [[0, [100, 104, 112]], [1, [36, 38, 44]]]));
            this.fillRR(x + L * 0.74, y + 0.2, L * 0.26, 0.9, 0.3, '#2a2c32');
            this.fillRR(x + L * 0.42, y + 1.4, 1.4, 2.6, 0.3, '#1a1c20'); this.fillRR(x + L * 0.5, y - 1.4, L * 0.16, 1.2, 0.4, '#1a1c20');
        };
        const pistol = (x, y) => { this.soft(x + 0.6, y + 0.8, 7, 4, 0.4, 0.8, 0.5); this.fillRR(x, y, 7, 1.8, 0.5, this.lin(0, y, 0, y + 1.8, [[0, [150, 156, 166]], [1, [60, 64, 72]]])); this.fillRR(x + 0.6, y + 1.4, 1.8, 3, 0.5, '#2a2420'); };
        for (let x = bd.x + 6; x < bd.x + bd.w - 34; x += 46) { rifle(x, rows[0], 28); rifle(x + 2, rows[1], 28); pistol(x + 6, rows[2]); pistol(x + 22, rows[2]); }
        void g;
    },
    p_graffiti(op, xa, xb, v = 0) {
        const bd = this.S.band(xa, xb), g = this.g, top = this.top + 3, bot = this.S.nY - 2, cols = [[224, 160, 32], [47, 154, 208], [217, 69, 58], [106, 192, 72]], rng = Pixel.rng(bd.x + v);
        for (let k = 0; k < 5; k++) {
            const gx = bd.x + 10 + k * 36, gy = top + (bot - top) * (0.3 + (k % 2) * 0.25), col = cols[(k + v) % 4];
            g.save(); g.globalAlpha = 0.9;
            this.circ(gx + 6, gy, 7.4, HDK.css(HDK.t(col, 0.6))); this.circ(gx + 6, gy, 6.4, HDK.css(col)); this.circ(gx + 6, gy, 3.6, '#2a2622'); this.circ(gx + 4.5, gy - 2, 1.4, 'rgba(255,255,255,0.6)');
            g.beginPath(); g.moveTo(gx - 4, gy + 10); g.bezierCurveTo(gx + 2, gy + 6, gx + 12, gy + 12, gx + 21, gy + 7); g.strokeStyle = HDK.css(col); g.lineWidth = 2; g.stroke(); g.strokeStyle = 'rgba(20,16,12,0.7)'; g.lineWidth = 0.4; g.stroke();
            for (let d = 0; d < 3; d++) { const dx = gx + rng() * 14, dy = gy + 7 + rng() * 3; this.line(dx, dy, dx, dy + 2 + rng() * 4, HDK.css(col, 0.8), 0.5); }
            g.restore();
        }
    },
    p_bankSign(op, xa, xb, P, hq = false) {
        const bd = this.S.band(xa, xb), g = this.g, B = this.wallBox(bd.x + (hq ? 6 : 4), bd.w - (hq ? 12 : 8), hq ? 22 : 18), a = HDK.C(P.a), b = HDK.C(P.b), acc = HDK.C(P.acc);
        this.frameShadow(B.x, B.y, B.w, B.h);
        this.fillRR(B.x, B.y, B.w, B.h, 1.4, this.lin(0, B.y, 0, B.y + B.h, [[0, HDK.t(b, 1.2)], [1, HDK.t(b, 0.8)]]));
        this.fillRR(B.x + 3, B.y + B.h * 0.28, B.h * 0.44, B.h * 0.44, 1, HDK.css(a));
        g.fillStyle = HDK.css(acc); g.fillRect(B.x + 6 + B.h * 0.44, B.y + B.h * 0.32, B.w * 0.55, B.h * 0.16); g.fillRect(B.x + 6 + B.h * 0.44, B.y + B.h * 0.58, B.w * 0.35, B.h * 0.1);
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(B.x + 1, B.y + 1, B.w - 2, B.h * 0.35);
        this.glow(B.x + B.w / 2, B.y + B.h / 2, B.w * 0.55, a, 0.18);
        this.strokeRR(B.x, B.y, B.w, B.h, 1.4, HDA.OUT, 0.45);
    },
    p_jewelSign(op, xa, xb, trim) {
        const bd = this.S.band(xa, xb), g = this.g, B = this.wallBox(bd.x + 4, bd.w - 8, 16), t = HDK.C(trim);
        this.frameShadow(B.x, B.y, B.w, B.h);
        this.fillRR(B.x, B.y, B.w, B.h, 0.8, this.lin(0, B.y, 0, B.y + B.h, [[0, [34, 28, 40]], [1, [16, 12, 20]]]));
        for (const yy of [B.y + 1.6, B.y + B.h - 2.4]) { g.fillStyle = this.lin(B.x, 0, B.x + B.w, 0, [[0, HDK.t(t, 0.7)], [0.5, HDK.t(t, 1.35)], [1, HDK.t(t, 0.7)]]); g.fillRect(B.x + 2, yy, B.w - 4, 0.8); }
        const n = 7;
        for (let k = 0; k < n; k++) { const x = B.x + B.w * (0.18 + 0.64 * k / (n - 1)); this.fillRR(x - 1.4, B.y + B.h * 0.32, 2.8, B.h * 0.36, 0.5, this.lin(0, B.y, 0, B.y + B.h, [[0, HDK.t(t, 1.4)], [1, HDK.t(t, 0.7)]])); }
        this.glow(B.x + B.w / 2, B.y + B.h / 2, B.w * 0.5, t, 0.16);
        this.strokeRR(B.x, B.y, B.w, B.h, 0.8, HDA.OUT, 0.45);
    },

    // ================================================================= LANCHONETE
    p_kitchen(op, r) {
        const S = this.S, pb = S.base(r, 0.95), g = this.g;
        this.p_counter(op, r, 0.95, '#b8bcc4', '#8a8f98', []);
        const gx = pb.x + 6, gy = pb.top + 3, gw = 34, gh = pb.h - 6;
        this.fillRR(gx - 1, gy - 1, gw + 2, gh + 2, 1, '#2a2c30');
        g.fillStyle = this.lin(gx, gy, gx + gw, gy + gh, [[0, [56, 58, 64]], [1, [22, 24, 28]]]); g.fillRect(gx, gy, gw, gh);
        for (let i = 2; i < gw; i += 2.4) this.line(gx + i, gy + 0.5, gx + i, gy + gh - 0.5, 'rgba(90,94,104,0.6)', 0.35);
        g.save(); g.globalCompositeOperation = 'screen'; g.fillStyle = this.rad(gx + gw * 0.4, gy + gh * 0.55, 0, gw * 0.6, [[0, [255, 120, 40], 0.3], [1, [255, 120, 40], 0]]); g.fillRect(gx, gy, gw, gh); g.restore();
        for (const [bx, by, c] of [[gx + 8, gy + 6, [120, 64, 30]], [gx + 20, gy + 5.4, [134, 72, 34]], [gx + 14, gy + gh - 5, [110, 58, 26]]]) {
            this.softEll(bx + 0.8, by + 0.8, 4.4, 3.6, 0.5, 0.8);
            this.ell(bx, by, 4.4, 3.6, this.rad(bx - 1.2, by - 1.2, 0.3, 4.6, [[0, HDK.t(c, 1.35)], [0.7, c], [1, HDK.t(c, 0.6)]]));
            for (let k = 0; k < 3; k++) this.line(bx - 3 + k * 2.2, by - 2.4, bx - 2 + k * 2.2, by + 2.4, 'rgba(40,18,6,0.55)', 0.4);
        }
        for (let k = 0; k < 5; k++) { const sx = gx + 4 + k * 6.5, sy = gy - 4 - (k % 2) * 3; g.save(); g.globalAlpha = 0.35; this.ell(sx, sy, 3.2, 2.2, 'rgba(240,244,248,1)'); this.ell(sx + 1.4, sy - 3, 2.4, 1.8, 'rgba(240,244,248,1)'); g.restore(); }
        const fx = pb.x + 52, fy = pb.top + 3, fw = 22, fh = pb.h - 6;
        this.fillRR(fx, fy, fw, fh, 1.2, this.lin(fx, fy, fx + fw, fy + fh, [[0, [130, 134, 144]], [1, [56, 60, 68]]]));
        for (let k = 0; k < 2; k++) { const bx = fx + 2 + k * 10, by = fy + 2.4; this.fillRR(bx, by, 8.6, fh - 6, 0.6, this.lin(0, by, 0, by + fh - 6, [[0, [236, 190, 70]], [1, [200, 140, 30]]])); for (let i = 1; i < 4; i++) this.line(bx + i * 2.2, by, bx + i * 2.2, by + fh - 6, 'rgba(120,80,10,0.4)', 0.3); this.fillRR(bx + 3, by - 2.4, 2.6, 3, 0.5, '#1a1a1c'); }
        this.strokeRR(fx, fy, fw, fh, 1.2, HDA.OUT, 0.45);
    },

    // ================================================================= BOUTIQUE
    p_clothesRack(op, r, tees, n0) {
        const S = this.S, b = S.base(r, 1.55), g = this.g;
        this.objShadow(b, 0.45, 1);
        const by = b.top + b.h / 2;
        for (const px of [b.x + 1, b.x + b.w - 2.6]) this.fillRR(px, b.top - 2, 1.6, b.h + b.hp + 2, 0.6, this.lin(px, 0, px + 1.6, 0, [[0, [236, 240, 246]], [1, [110, 116, 126]]]));
        for (let x = 3, k = n0; x < b.w - 4; x += 5, k++) {
            const col = HDK.C(tees[k % tees.length]), px = b.x + x, gh = b.h - 4 + b.hp - 4;
            g.beginPath(); g.moveTo(px + 2, by - 1.6); g.lineTo(px - 0.2, by + 0.6); g.lineTo(px + 4.2, by + 0.6); g.closePath(); g.strokeStyle = '#c8ccd2'; g.lineWidth = 0.35; g.stroke();
            g.beginPath(); g.moveTo(px - 0.4, by + 0.6); g.lineTo(px + 4.4, by + 0.6); g.lineTo(px + 4.8, by + gh * 0.45); g.lineTo(px + 4.2, b.top + 2 + gh); g.lineTo(px - 0.2, b.top + 2 + gh); g.lineTo(px - 0.8, by + gh * 0.45); g.closePath();
            g.fillStyle = this.lin(px, 0, px + 4.4, 0, [[0, HDK.t(col, 1.25)], [0.5, col], [1, HDK.t(col, 0.62)]]); g.fill(); g.strokeStyle = 'rgba(20,14,12,0.6)'; g.lineWidth = 0.3; g.stroke();
        }
        this.fillRR(b.x, by - 1.8, b.w, 1.2, 0.6, this.lin(0, by - 1.8, 0, by - 0.6, [[0, [250, 252, 255]], [1, [140, 146, 156]]]));
    },
    p_foldTable(op, r, tees, v) {
        const S = this.S, b = S.base(r, 0.9);
        this.prism(b, [244, 240, 234], [168, 152, 136], { topMat: 'paint' });
        for (let k = 0; k < 6; k++) {
            const col = HDK.C(tees[(k * 5 + v) % tees.length]), x = b.x + 6 + (k % 3) * Math.floor((b.w - 16) / 3), y = b.top + 4 + Math.floor(k / 3) * Math.floor(b.h / 2 - 2);
            for (let l = 2; l >= 0; l--) { const yy = y + l * 0.9; this.soft(x + 0.6, yy + 1, 14, 8, 0.3, 0.8, 1); this.fillRR(x, yy, 14, 8, 1, this.lin(x, yy, x, yy + 8, [[0, HDK.t(col, 1.25 - l * 0.08)], [1, HDK.t(col, 0.82 - l * 0.08)]])); }
            this.line(x + 1, y + 3.4, x + 13, y + 3.4, HDK.css(HDK.t(col, 0.65), 0.8), 0.35); this.strokeRR(x, y, 14, 8, 1, 'rgba(20,14,12,0.55)', 0.3);
        }
    },
    p_mannequin(op, x, z, col) {
        const S = this.S, px = S.X(x) + 0.5, py = S.Y(z), c = HDK.C(col), g = this.g;
        this.softEll(px + 2, py + 6, 8, 3.4, 0.45, 1.6);
        this.ell(px, py + 6, 6, 2, this.lin(px - 6, 0, px + 6, 0, [[0, [80, 84, 92]], [1, [24, 26, 30]]]));
        this.fillRR(px - 0.6, py, 1.2, 6, 0.4, '#3a3d44');
        g.beginPath(); g.moveTo(px - 8.5, py - 12); g.quadraticCurveTo(px - 9.5, py - 2, px - 6.5, py + 4.5); g.lineTo(px + 6.5, py + 4.5); g.quadraticCurveTo(px + 9.5, py - 2, px + 8.5, py - 12); g.quadraticCurveTo(px, py - 15.5, px - 8.5, py - 12); g.closePath();
        g.fillStyle = this.lin(px - 9, 0, px + 9, 0, [[0, HDK.t(c, 1.3)], [0.45, c], [1, HDK.t(c, 0.58)]]); g.fill(); g.strokeStyle = HDA.OUT; g.lineWidth = 0.45; g.stroke();
        this.fillRR(px - 1.2, py - 16.5, 2.4, 3, 0.8, '#d8d4cc');
        this.circ(px, py - 19, 5.4, this.rad(px - 1.8, py - 21, 0.5, 6, [[0, [255, 254, 250]], [1, [196, 190, 180]]])); g.beginPath(); g.arc(px, py - 19, 5.4, 0, Math.PI * 2); g.strokeStyle = HDA.OUT; g.lineWidth = 0.4; g.stroke();
    },
    p_counterBags(op, r) {
        const b = this.S.base(r, 1.0), g = this.g;
        for (const [x, y, w, h, c] of [[b.x + 4, b.top + 2, 10, 9, [212, 106, 158]], [b.x + 16, b.top + 3, 9, 8, [244, 240, 234]]]) {
            this.soft(x + 0.8, y + 1, w, h, 0.4, 1, 1);
            this.fillRR(x, y, w, h, 0.6, this.lin(x, 0, x + w, 0, [[0, HDK.t(c, 1.15)], [1, HDK.t(c, 0.78)]]));
            g.beginPath(); g.moveTo(x + 2, y + 0.4); g.quadraticCurveTo(x + w / 2, y - 3.4, x + w - 2, y + 0.4); g.strokeStyle = '#3a2a30'; g.lineWidth = 0.45; g.stroke();
            this.strokeRR(x, y, w, h, 0.6, HDA.OUT, 0.35);
        }
    },

    // ================================================================= ACADEMIA
    mat(cx, cz, w, d) {                                        // plataforma de madeira com borda de borracha
        const S = this.S, r = S.R(cx - w, cz - d, cx + w, cz + d), x = S.X(r[0]), y = S.Y(r[3]), W = S.X(r[2]) - x, H = S.Y(r[1]) - y;
        this.soft(x + 0.6, y + 1, W, H, 0.35, 1.4, 1);
        this.fillRR(x, y, W, H, 1, '#2a2c30');
        this.fillRR(x + 2, y + 2, W - 4, H - 4, 0.6, this.lin(x, y, x + W, y + H, [[0, [140, 104, 66]], [1, [96, 68, 40]]]));
        this.clip(x + 2, y + 2, W - 4, H - 4, () => { for (let yy = y + 2; yy < y + H; yy += 3) this.line(x + 2, yy, x + W - 2, yy, 'rgba(40,24,10,0.45)', 0.3); this.grain(x, y, W, H, 0.2, 22); });
    },
    plate(x, y, r, col = [24, 24, 28]) { this.ell(x, y, r * 0.42, r, this.lin(x - r * 0.4, 0, x + r * 0.4, 0, [[0, HDK.t(col, 2.2)], [0.5, col], [1, HDK.t(col, 0.6)]])); this.g.beginPath(); this.g.ellipse(x, y, r * 0.42, r, 0, 0, Math.PI * 2); this.g.strokeStyle = 'rgba(0,0,0,0.8)'; this.g.lineWidth = 0.3; this.g.stroke(); },
    bar(x0, x1, y) { this.fillRR(x0, y - 0.6, x1 - x0, 1.2, 0.5, this.lin(0, y - 0.6, 0, y + 0.6, [[0, [240, 244, 250]], [1, [120, 126, 136]]])); },
    p_gymRack(op, cx, cz) {
        const S = this.S;
        this.mat(cx, cz, 1.2, 0.9);
        for (const s of [-1, 1]) { const b = S.base(S.R(cx + s * 0.66 - 0.06, cz - 0.16, cx + s * 0.66 + 0.06, cz + 0.16), 2.0); this.soft(b.x + 1, b.y + 1, b.w + 1, b.h, 0.45, 1.2, 0.5); this.fillRR(b.x - 0.4, b.top, b.w + 0.8, b.h + b.hp, 0.5, this.lin(b.x, 0, b.x + b.w, 0, [[0, [110, 116, 126]], [1, [40, 42, 48]]])); this.strokeRR(b.x - 0.4, b.top, b.w + 0.8, b.h + b.hp, 0.5, HDA.OUT, 0.35); }
        const b = S.base(S.R(cx - 0.85, cz + 0.05, cx + 0.85, cz + 0.12), 1.35);
        this.bar(b.x - 1, b.x + b.w + 1, b.top + 1);
        for (const s of [-1, 1]) { const p = S.base(S.R(cx + s * 0.75 - 0.08, cz, cx + s * 0.75 + 0.08, cz + 0.12), 1.35); this.plate(p.x + p.w / 2, p.top + 1, 6); this.plate(p.x + p.w / 2 + s * 1.6, p.top + 1, 5, [40, 40, 48]); }
    },
    p_gymBench(op, cx, cz) {
        const S = this.S;
        this.mat(cx, cz - 0.05, 0.8, 1.05);
        const pad = S.base(S.R(cx - 0.15, cz - 0.8, cx + 0.15, cz + 0.45), 0.45);
        this.soft(pad.x + 1, pad.y + 1, pad.w + 1, pad.h, 0.45, 1.4, 1);
        this.fillRR(pad.x - 1, pad.top, pad.w + 2, pad.h + pad.hp, 1.4, this.lin(pad.x, 0, pad.x + pad.w, 0, [[0, [70, 70, 80]], [0.5, [34, 34, 40]], [1, [16, 16, 20]]]));
        for (let y = pad.top + 3; y < pad.top + pad.h; y += 4) this.line(pad.x - 0.6, y, pad.x + pad.w + 0.6, y, 'rgba(255,255,255,0.08)', 0.35);
        this.strokeRR(pad.x - 1, pad.top, pad.w + 2, pad.h + pad.hp, 1.4, HDA.OUT, 0.4);
        for (const s of [-1, 1]) { const u = S.base(S.R(cx + s * 0.46 - 0.04, cz + 0.52, cx + s * 0.46 + 0.04, cz + 0.6), 1.05); this.fillRR(u.x - 0.3, u.top, u.w + 0.6, u.h + u.hp, 0.4, this.lin(u.x, 0, u.x + u.w, 0, [[0, [130, 136, 146]], [1, [50, 52, 58]]])); }
        const b = S.base(S.R(cx - 0.75, cz + 0.5, cx + 0.75, cz + 0.56), 1.0);
        this.bar(b.x - 2, b.x + b.w + 2, b.top + 1); this.plate(b.x - 0.5, b.top + 1, 5); this.plate(b.x + b.w + 0.5, b.top + 1, 5);
    },
    p_gymSpot(op, cx, cz) { this.mat(cx, cz, 0.7, 0.6); },
    p_dumbbellRack(op, r) {
        const S = this.S, b = S.base(r, 0.75);
        this.prism(b, [58, 61, 68], [40, 43, 50], { topMat: 'paint' });
        for (let x = b.x + 4, k = 0; x < b.x + b.w - 6; x += 9, k++) {
            const rr = 2 + (k % 4) * 0.7, y = b.top + b.h / 2;
            this.softEll(x + 3.4, y + 1.2, 4.6, 1.6, 0.4, 0.8);
            this.fillRR(x, y - 0.5, 6, 1, 0.4, '#c8ccd2');
            for (const hx of [x, x + 6]) { this.fillRR(hx - 1.2, y - rr, 2.4, rr * 2, 0.6, this.lin(hx - 1.2, 0, hx + 1.2, 0, [[0, [80, 82, 90]], [1, [16, 16, 20]]])); }
        }
    },
    p_plateTree(op, r) {
        const S = this.S, b = S.base(r, 1.2), cx = b.x + b.w / 2;
        this.objShadow(b, 0.45);
        this.fillRR(cx - 0.8, b.top - 3, 1.6, b.h + b.hp + 3, 0.5, this.lin(cx - 0.8, 0, cx + 0.8, 0, [[0, [150, 156, 166]], [1, [50, 52, 58]]]));
        for (let k = 0; k < 3; k++) { const y = b.top + 3 + k * 6, R = 6 - k; this.circ(cx, y, R, this.rad(cx - R * 0.3, y - R * 0.3, 0.3, R, [[0, [70, 70, 78]], [1, [16, 16, 20]]])); this.g.beginPath(); this.g.arc(cx, y, R * 0.75, 0, Math.PI * 2); this.g.strokeStyle = 'rgba(120,124,134,0.6)'; this.g.lineWidth = 0.3; this.g.stroke(); this.circ(cx, y, 0.9, '#c8ccd2'); }
    },
    p_treadmill(op, r) {
        const S = this.S, b = S.base(r, 0.35), g = this.g;
        this.objShadow(b, 0.45);
        this.fillRR(b.x, b.top, b.w, b.h + b.hp, 1.2, this.lin(b.x, 0, b.x + b.w, 0, [[0, [70, 74, 84]], [1, [26, 28, 32]]]));
        this.fillRR(b.x + 2.4, b.top + 3, b.w - 4.8, b.h - 4, 0.6, '#121316');
        for (let y = b.top + 4; y < b.top + b.h - 1; y += 1.6) this.line(b.x + 2.6, y, b.x + b.w - 2.6, y, 'rgba(255,255,255,0.05)', 0.3);
        this.fillRR(b.x + 1, b.top - 2.4, b.w - 2, 4, 1, this.lin(0, b.top - 2.4, 0, b.top + 1.6, [[0, [90, 96, 108]], [1, [40, 44, 50]]]));
        this.fillRR(b.x + b.w / 2 - 4, b.top - 1.8, 8, 2.6, 0.4, '#1a2a3a'); g.fillStyle = '#4ad08a'; g.fillRect(b.x + b.w / 2 - 3, b.top - 1.2, 3, 0.6);
        this.strokeRR(b.x, b.top - 2.4, b.w, b.h + b.hp + 2.4, 1.2, HDA.OUT, 0.45);
    },

    // ================================================================= BAR
    p_poolTable(op, r) {
        const S = this.S, b = S.base(r, 0.9), g = this.g;
        this.objShadow(b, 0.55, 2);
        this.fillRR(b.x, b.fy - 0.8, b.w, b.hp + 0.8, 0.8, this.lin(0, b.fy, 0, b.fy + b.hp, [[0, [96, 62, 30]], [1, [48, 30, 14]]]));
        this.fillRR(b.x, b.top, b.w, b.h, 1.8, this.lin(b.x, b.top, b.x + b.w, b.top + b.h, [[0, [150, 104, 60]], [1, [84, 54, 26]]]));
        this.clip(b.x, b.top, b.w, b.h, () => this.faceMat('wood', b.x, b.top, b.w, b.h, [120, 80, 44], 'top'));
        const fx = b.x + 4, fy = b.top + 4, fw = b.w - 8, fh = b.h - 8;
        this.fillRR(fx, fy, fw, fh, 0.8, this.rad(fx + fw / 2, fy + fh / 2, 2, Math.max(fw, fh) * 0.7, [[0, [60, 160, 90]], [1, [26, 100, 52]]]));
        this.grain(fx, fy, fw, fh, 0.18, 23);
        this.line(fx + 0.8, fy + 0.8, fx + fw - 0.8, fy + 0.8, 'rgba(0,0,0,0.3)', 0.8);
        for (const [px, py] of [[fx, fy], [fx + fw, fy], [fx, fy + fh], [fx + fw, fy + fh], [fx + fw / 2, fy], [fx + fw / 2, fy + fh]]) this.circ(px, py, 1.9, this.rad(px, py, 0, 2, [[0, [0, 0, 0]], [1, [20, 14, 8]]]));
        const balls = [[30, 20, [217, 69, 58]], [34, 24, [224, 192, 48]], [34, 16, [47, 111, 181]], [38, 20, [16, 16, 16]], [38, 14, [217, 112, 42]], [38, 26, [138, 74, 176]]];
        for (const [bx2, by2, col] of balls) { const x = b.x + bx2 + 0.5, y = b.top + by2 - 5.5; this.softEll(x + 0.6, y + 0.8, 1.6, 1, 0.5, 0.5); this.circ(x, y, 1.7, this.rad(x - 0.6, y - 0.6, 0.1, 1.8, [[0, HDK.t(col, 1.6)], [0.6, col], [1, HDK.t(col, 0.55)]])); }
        { const x = b.x + 14.5, y = b.top + 19.5; this.softEll(x + 0.6, y + 0.8, 1.6, 1, 0.5, 0.5); this.circ(x, y, 1.7, this.rad(x - 0.6, y - 0.6, 0.1, 1.8, [[0, [255, 255, 255]], [1, [190, 186, 176]]])); }
        g.save(); g.lineCap = 'round';
        this.line(b.x + 4, b.top + 36, b.x + 12.5, b.top + 21.5, '#e8cf98', 1.0); this.line(b.x + 2, b.top + 39.5, b.x + 6, b.top + 32.5, '#4a2a14', 1.4); g.restore();
        this.strokeRR(b.x, b.top, b.w, b.h + b.hp, 1.8, HDA.OUT, 0.5);
    },
    p_jukebox(op, r) {
        const S = this.S, b = S.base(r, 1.7), g = this.g, x = b.x, y = b.top, w = b.w, H = b.h + b.hp;
        this.objShadow(b, 0.5);
        this.glow(x + w / 2, y + H * 0.5, w * 1.4, [255, 120, 200], 0.25);
        g.beginPath(); g.moveTo(x, y + H); g.lineTo(x, y + w * 0.5); g.arc(x + w / 2, y + w * 0.5, w / 2, Math.PI, 0); g.lineTo(x + w, y + H); g.closePath();
        g.fillStyle = this.lin(x, 0, x + w, 0, [[0, [190, 96, 50]], [0.5, [150, 64, 34]], [1, [90, 36, 18]]]); g.fill(); g.strokeStyle = HDA.OUT; g.lineWidth = 0.5; g.stroke();
        g.beginPath(); g.moveTo(x + 2.4, y + H - 2); g.lineTo(x + 2.4, y + w * 0.5); g.arc(x + w / 2, y + w * 0.5, w / 2 - 2.4, Math.PI, 0); g.lineTo(x + w - 2.4, y + H - 2);
        g.strokeStyle = this.lin(x, y, x + w, y + H, [[0, [255, 230, 120]], [0.5, [255, 120, 200]], [1, [120, 220, 255]]]); g.lineWidth = 1.2; g.stroke();
        this.fillRR(x + 4, y + w * 0.4, w - 8, w * 0.45, 1, this.lin(0, y, 0, y + w, [[0, [60, 40, 30]], [1, [20, 12, 8]]]));
        this.circ(x + w / 2, y + w * 0.62, w * 0.16, this.rad(x + w / 2, y + w * 0.62, 0, w * 0.17, [[0, [255, 230, 140]], [1, [190, 140, 40]]]));
        for (let i = 0; i < w - 6; i += 2) this.circ(x + 3 + i, y + H - 4, 0.45, i % 4 ? '#7ad8e8' : '#ffd060');
    },
    p_trucoCards(op, px, py) {
        const g = this.g;
        const card = (x, y, rot, red) => { g.save(); g.translate(x + 3, y + 4.5); g.rotate(rot); this.soft(-2.4, -3.6, 6, 9, 0.35, 0.8, 0.6); this.fillRR(-3, -4.5, 6, 9, 0.7, '#f6f3ea'); if (red) { this.fillRR(-2.2, -3.7, 4.4, 7.4, 0.4, '#a8283a'); for (let k = 0; k < 3; k++) this.line(-2, -3 + k * 2.6, 2, -1.6 + k * 2.6, 'rgba(255,255,255,0.3)', 0.3); } else { this.circ(0, 0, 1, '#c8102e'); } this.strokeRR(-3, -4.5, 6, 9, 0.7, 'rgba(40,30,20,0.6)', 0.25); g.restore(); };
        card(px - 9, py - 4, -0.15, true); card(px + 1, py - 2, 0.2, false); card(px - 3, py + 6, 0.05, false);
        for (let k = 0; k < 4; k++) { this.line(px + 9.5 + k * 2, py + 5, px + 9.7 + k * 2, py + 10, '#e8d0a0', 0.6); this.circ(px + 9.5 + k * 2, py + 5, 0.45, '#c0392b'); }
    },

    // ================================================================= SALADAS E SUCOS
    p_fruitCrate(op, r, cols) {
        const S = this.S, b = S.base(r, 0.8), g = this.g, rng = Pixel.rng(Math.round(b.x + b.y * 3));
        this.prism(b, [176, 136, 80], [138, 104, 56], { topMat: 'wood', frontMat: 'wood' });
        for (let i = 0; i < b.hp; i += 2.2) this.line(b.x + 0.6, b.fy + i, b.x + b.w - 0.6, b.fy + i, 'rgba(60,40,16,0.5)', 0.3);
        this.fillRR(b.x + 1.4, b.top + 1.4, b.w - 2.8, b.h - 2.8, 0.6, '#3a2814');
        const fr = [];
        for (let i = 3; i < b.w - 3; i += 4.6) for (let j = 3; j < b.h - 2; j += 4.6) fr.push([b.x + i + rng() * 1.2, b.top + j + rng() * 1.2]);
        for (const [fx, fy] of fr) {
            const c = HDK.C(cols[Math.floor(rng() * cols.length)]), R = 2.5 + rng() * 0.4;
            this.circ(fx + 0.5, fy + 0.6, R, 'rgba(0,0,0,0.35)');
            this.circ(fx, fy, R, this.rad(fx - R * 0.35, fy - R * 0.35, 0.2, R, [[0, HDK.t(c, 1.45)], [0.6, c], [1, HDK.t(c, 0.6)]]));
            if (rng() < 0.5) this.line(fx, fy - R + 0.3, fx + 0.5, fy - R - 0.4, '#4a3010', 0.35);
        }
        void g;
    },

    // ================================================================= RESTAURANTES DE LUXO
    p_wineRack(op, r) {
        const S = this.S, b = S.base(r, 2.6), g = this.g, H = b.hp + b.h, rng = Pixel.rng(Math.round(b.x * 5 + b.y));
        this.objShadow(b, 0.5, 1);
        this.fillRR(b.x, b.top, b.w, H, 0.8, this.lin(b.x, 0, b.x + b.w, 0, [[0, [96, 58, 32]], [0.5, [74, 44, 24]], [1, [40, 22, 10]]]));
        const ix = b.x + 2, iy = b.top + 2, iw = b.w - 4, ih = H - 6;
        g.fillStyle = '#140a04'; g.fillRect(ix, iy, iw, ih);
        this.clip(ix, iy, iw, ih, () => {
            for (let y = iy + 3.4; y < iy + ih; y += 6.4) for (let x = ix + 3.4 + ((Math.round((y - iy) / 6.4)) % 2) * 3.2; x < ix + iw; x += 6.4) {
                const c = [[90, 26, 36], [58, 74, 34], [138, 112, 64]][Math.floor(rng() * 3)];
                this.circ(x, y, 2.6, '#060302'); this.circ(x, y, 2.1, this.rad(x - 0.6, y - 0.6, 0.1, 2.2, [[0, HDK.t(c, 1.8)], [0.6, c], [1, HDK.t(c, 0.5)]])); this.circ(x, y, 0.8, 'rgba(230,210,170,0.85)');
            }
            g.strokeStyle = 'rgba(120,76,40,0.9)'; g.lineWidth = 0.6;
            for (let k = -ih; k < iw + ih; k += 6.4) { g.beginPath(); g.moveTo(ix + k, iy); g.lineTo(ix + k + ih, iy + ih); g.moveTo(ix + k + ih, iy); g.lineTo(ix + k, iy + ih); g.stroke(); }
        });
        this.fillRR(b.x - 0.6, b.top + H - 4, b.w + 1.2, 4, 0.6, this.lin(0, b.top + H - 4, 0, b.top + H, [[0, [138, 90, 52]], [1, [60, 36, 18]]]));
        this.fillRR(b.x - 0.6, b.top - 1, b.w + 1.2, 2.6, 0.6, this.lin(0, b.top - 1, 0, b.top + 1.6, [[0, [150, 100, 58]], [1, [70, 42, 20]]]));
        this.strokeRR(b.x, b.top - 1, b.w, H + 1, 0.8, HDA.OUT, 0.5);
    },
    p_candle(op, px, py) {
        this.glow(px + 0.5, py - 1.5, 9, [255, 200, 110], 0.45);
        this.softEll(px + 1, py + 4.8, 2.2, 0.8, 0.4, 0.6);
        this.fillRR(px - 1.4, py + 1, 3.8, 4, 1, this.lin(px - 1.4, 0, px + 2.4, 0, [[0, [80, 120, 70]], [1, [30, 56, 30]]]));
        this.fillRR(px - 0.4, py - 0.8, 1.8, 2.2, 0.5, '#f6f0dc');
        this.ell(px + 0.5, py - 2.2, 0.7, 1.4, this.rad(px + 0.5, py - 1.8, 0, 1.4, [[0, [255, 255, 220]], [0.6, [255, 200, 60]], [1, [255, 140, 30]]]));
    },
    p_tatami(op, r) {
        const S = this.S, g = this.g, x = S.X(r[0]), y = S.Y(r[3]), w = S.X(r[2]) - x, h = S.Y(r[1]) - y;
        this.soft(x, y, w + 2, h + 2, 0.35, 2, 1);
        this.fillRR(x - 2, y - 2, w + 4, h + 4, 0.8, this.lin(0, y, 0, y + h, [[0, [80, 58, 34]], [1, [46, 32, 18]]]));
        for (let j = 0; j < h; j += 40) for (let i = 0; i < w; i += 80) {
            const mw = Math.min(80, w - i), mh = Math.min(40, h - j), mx = x + i, my = y + j;
            g.fillStyle = this.lin(mx, my, mx + mw, my + mh, [[0, [184, 200, 128]], [1, [150, 168, 100]]]); g.fillRect(mx + 0.4, my + 0.4, mw - 0.8, mh - 0.8);
            this.clip(mx, my, mw, mh, () => { for (let yy = my + 0.6; yy < my + mh; yy += 0.8) this.line(mx, yy, mx + mw, yy, 'rgba(90,110,50,0.22)', 0.25); this.grain(mx, my, mw, mh, 0.15, 24); });
            g.fillStyle = this.lin(0, my, 0, my + 2.2, [[0, [40, 50, 30]], [1, [70, 84, 44]]]); g.fillRect(mx + 0.4, my + 0.4, mw - 0.8, 2.2); g.fillRect(mx + 0.4, my + mh - 2.6, mw - 0.8, 2.2);
        }
    },
    p_cushion(op, x, z) {
        const S = this.S, b = S.base([x - 0.5, z - 0.5, x + 0.5, z + 0.5], 0.2);
        this.soft(b.x + 1, b.y + 1.4, b.w, b.h, 0.4, 1.4, 2);
        this.fillRR(b.x, b.y, b.w, b.h, 3, this.rad(b.x + b.w * 0.4, b.y + b.h * 0.4, 1, b.w * 0.8, [[0, [226, 96, 80]], [0.7, [184, 56, 44]], [1, [120, 28, 20]]]));
        this.strokeRR(b.x + 2, b.y + 2, b.w - 4, b.h - 4, 2, 'rgba(255,200,180,0.35)', 0.3);
        this.circ(b.x + b.w / 2, b.y + b.h / 2, 1, '#7a2018');
        for (const [cx, cy] of [[b.x + 1, b.y + 1], [b.x + b.w - 1, b.y + 1], [b.x + 1, b.y + b.h - 1], [b.x + b.w - 1, b.y + b.h - 1]]) this.circ(cx, cy, 0.8, '#d9b030');
        this.strokeRR(b.x, b.y, b.w, b.h, 3, HDA.OUT, 0.4);
    },
    p_sake(op, px, py) {
        this.softEll(px + 1, py + 8.4, 2.6, 1, 0.4, 0.6);
        this.fillRR(px - 2, py + 1.6, 4, 6.6, 1.6, this.lin(px - 2, 0, px + 2, 0, [[0, [255, 252, 244]], [1, [196, 190, 176]]]));
        this.fillRR(px - 0.8, py - 0.2, 1.6, 2.4, 0.5, '#e8e0c8'); this.line(px - 1.6, py + 4.6, px + 1.6, py + 4.6, '#3a5a8a', 0.6);
        for (const dx of [-5, 4]) { this.ell(px + dx, py + 7, 1.4, 0.9, '#f4f0e4'); this.ell(px + dx, py + 6.9, 1, 0.55, '#d8d0b8'); }
    },
    p_sushiBar(op, r) {
        const S = this.S, b = S.base(r, 1.05), g = this.g;
        this.p_counter(op, r, 1.05, '#d8c8a0', '#4a3418', []);
        const gx = b.x + 2, gy = b.top + 2, gw = b.w - 4, gh = b.h - 4;
        this.fillRR(gx, gy, gw, gh, 0.6, this.lin(gx, gy, gx, gy + gh, [[0, [200, 228, 228]], [1, [150, 184, 186]]]));
        const fish = [[244, 236, 220], [232, 122, 90], [232, 168, 160], [240, 200, 96]];
        for (let i = 6; i < b.w - 8; i += 11) {
            const tx = b.x + i, ty = b.top + 5.5;
            this.soft(tx + 0.5, ty + 0.8, 9, 5, 0.35, 0.6, 0.5);
            this.fillRR(tx, ty, 9, 5, 0.6, '#1e1e22');
            const c = fish[(i / 11 | 0) % 4];
            for (let k = 0; k < 3; k++) { this.fillRR(tx + 0.8 + k * 2.6, ty + 0.8, 2.3, 3.2, 0.8, this.lin(0, ty, 0, ty + 4, [[0, HDK.t(c, 1.12)], [1, HDK.t(c, 0.82)]])); this.line(tx + 1 + k * 2.6, ty + 1.6, tx + 2.8 + k * 2.6, ty + 3.2, 'rgba(255,255,255,0.5)', 0.25); }
            this.ell(tx + 4.5, ty - 0.2, 1.2, 0.5, '#3f9a52');
        }
        for (let i = 8; i < b.w - 10; i += 22) { const px = b.x + i + 0.5, py = b.top + 19.5; this.softEll(px + 0.8, py + 0.8, 4, 3, 0.35, 0.8); this.circ(px, py, 4, '#f2eee6'); this.circ(px, py, 2.6, '#e4ded2'); for (let k = 0; k < 3; k++) { const c = fish[(k + i) % 4]; this.circ(px - 1.4 + k * 1.4, py, 0.9, '#f8f6f0'); this.ell(px - 1.4 + k * 1.4, py - 0.3, 0.8, 0.5, HDK.css(c)); } }
        g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.moveTo(gx + gw * 0.05, gy + gh); g.lineTo(gx + gw * 0.12, gy); g.lineTo(gx + gw * 0.17, gy); g.lineTo(gx + gw * 0.1, gy + gh); g.closePath(); g.fill();
        this.strokeRR(gx, gy, gw, gh, 0.6, 'rgba(60,90,96,0.8)', 0.4);
    },
    p_woodStool(op, r) {
        const S = this.S, b = S.base(r, 0.6);
        this.soft(b.x + 1.4, b.y + 1, b.w + 1, b.h + 3, 0.45, 1.6, 2);
        for (const lx of [b.x + 1, b.x + b.w - 2.6]) this.fillRR(lx, b.y + b.h - 3, 1.6, 3.6, 0.4, '#4a3018');
        this.ell(b.x + b.w / 2, b.y + b.h / 2 - 2, b.w / 2, b.h / 2 + 0.5, '#4a3018');
        this.ell(b.x + b.w / 2, b.y + b.h / 2 - 2.8, b.w / 2, b.h / 2, this.rad(b.x + b.w * 0.35, b.y + b.h * 0.2, 0.4, b.w * 0.7, [[0, [200, 150, 96]], [1, [128, 84, 44]]]));
        this.g.beginPath(); this.g.ellipse(b.x + b.w / 2, b.y + b.h / 2 - 2.8, b.w / 2, b.h / 2, 0, 0, Math.PI * 2); this.g.strokeStyle = HDA.OUT; this.g.lineWidth = 0.4; this.g.stroke();
    },
    p_lantern(op, x, z) {
        const S = this.S, g = this.g, px = S.X(x) + 0.5, py = S.Y(z);
        g.fillStyle = this.lin(0, py - 40, 0, py - 12, [[0, [20, 16, 12], 0], [1, [20, 16, 12], 0.9]]); g.fillRect(px - 0.25, py - 40, 0.5, 28);
        this.glow(px, py - 5, 16, [255, 140, 70], 0.5);
        this.fillRR(px - 3.4, py - 13.4, 6.8, 2.2, 0.6, '#2a1c10'); this.fillRR(px - 3.4, py + 1, 6.8, 2.2, 0.6, '#2a1c10');
        this.ell(px, py - 5, 6.6, 7.2, this.rad(px - 1.4, py - 6.4, 0.5, 7.4, [[0, [255, 214, 140]], [0.45, [240, 110, 50]], [1, [150, 36, 20]]]));
        for (let k = -2; k <= 2; k++) { this.g.beginPath(); this.g.ellipse(px, py - 5, Math.abs(k) * 1.5 + 0.2, 7.1, 0, -Math.PI / 2, Math.PI / 2, k < 0); this.g.strokeStyle = 'rgba(120,30,14,0.35)'; this.g.lineWidth = 0.3; this.g.stroke(); }
        for (let k = 1; k < 4; k++) this.line(px - 6.2, py - 12 + k * 3.5, px + 6.2, py - 12 + k * 3.5, 'rgba(120,30,14,0.3)', 0.3);
        this.g.beginPath(); this.g.ellipse(px, py - 5, 6.6, 7.2, 0, 0, Math.PI * 2); this.g.strokeStyle = HDA.OUT; this.g.lineWidth = 0.4; this.g.stroke();
    },

    // ================================================================= ARMAS E BOCA
    p_ammoShelf(op, r) {
        const S = this.S, b = S.base(r, 1.3);
        this.objShadow(b, 0.5);
        this.fillRR(b.x, b.top + 4, b.w, 4, 0.5, this.lin(0, b.top + 4, 0, b.top + 8, [[0, [80, 88, 86]], [1, [24, 28, 28]]]));
        for (let i = 4; i < b.w - 14; i += 16) {
            for (const [yy, hh, c] of [[b.top + 10, 10, [106, 122, 74]], [b.top - 6, 12, [74, 106, 58]]]) {
                this.soft(b.x + i + 0.6, yy + 1, 14, hh, 0.4, 0.8, 0.5);
                this.fillRR(b.x + i, yy, 14, hh, 0.6, this.lin(0, yy, 0, yy + hh, [[0, HDK.t(c, 1.2)], [1, HDK.t(c, 0.7)]]));
                this.fillRR(b.x + i + 2, yy + hh * 0.3, 10, 1.8, 0.3, '#d8d070'); this.fillRR(b.x + i + 5, yy + 0.8, 4, 1, 0.3, '#2a3218');
                this.strokeRR(b.x + i, yy, 14, hh, 0.6, 'rgba(20,26,12,0.8)', 0.35);
            }
        }
    },
    p_showcase(op, r) {
        const S = this.S, b = S.base(r, 1.0), g = this.g;
        this.objShadow(b, 0.5, 1);
        this.fillRR(b.x, b.fy - 0.8, b.w, b.hp + 0.8, 0.6, this.lin(0, b.fy, 0, b.fy + b.hp, [[0, [70, 80, 78]], [1, [30, 36, 34]]]));
        this.fillRR(b.x + 1, b.fy + 0.6, b.w - 2, b.hp - 1.4, 0.4, 'rgba(160,200,204,0.5)');
        this.fillRR(b.x, b.top, b.w, b.h, 0.8, this.lin(b.x, b.top, b.x + b.w, b.top + b.h, [[0, [206, 230, 230]], [1, [136, 168, 172]]]));
        this.fillRR(b.x + 1.6, b.top + 1.6, b.w - 3.2, b.h - 3.2, 0.4, '#28302e');
        for (let i = 6; i < b.w - 22; i += 24) {
            const gx = b.x + i, y1 = b.top + 8, y2 = b.top + 18;
            this.fillRR(gx, y1, 15, 2, 0.5, this.lin(0, y1, 0, y1 + 2, [[0, [170, 176, 186]], [1, [60, 64, 72]]])); this.fillRR(gx, y1 + 1, 3.6, 4.8, 0.8, '#5a3a22');
            this.fillRR(gx + 2, y2, 9, 1.8, 0.4, this.lin(0, y2, 0, y2 + 1.8, [[0, [160, 166, 176]], [1, [50, 54, 62]]])); this.fillRR(gx + 2.4, y2 + 1.2, 2, 3.4, 0.5, '#2a2420');
            this.fillRR(gx + 14, y2 - 1, 5, 3, 0.4, '#4a6a3a');
        }
        g.fillStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.moveTo(b.x + b.w * 0.08, b.top + b.h); g.lineTo(b.x + b.w * 0.22, b.top); g.lineTo(b.x + b.w * 0.3, b.top); g.lineTo(b.x + b.w * 0.16, b.top + b.h); g.closePath(); g.fill();
        this.strokeRR(b.x, b.top, b.w, b.h + b.hp, 0.8, HDA.OUT, 0.5);
    },
    p_ammoCrates(op, r) {
        const S = this.S, b = S.base(r, 1.2), g = this.g;
        this.prism(b, [96, 126, 72], [70, 96, 58], { topMat: 'wood', frontMat: 'wood' });
        g.fillStyle = '#d8d070'; g.fillRect(b.x + 3, b.fy + b.hp * 0.35, b.w * 0.4, 1);
        this.fillRR(b.x + b.w / 2 - 1.4, b.top + 1.5, 2.8, b.h - 3, 0.4, 'rgba(40,52,30,0.85)');
        for (const [cx, cy] of [[b.x + 2.4, b.top + 2.4], [b.x + b.w - 2.4, b.top + 2.4], [b.x + 2.4, b.fy - 2.4], [b.x + b.w - 2.4, b.fy - 2.4]]) this.circ(cx, cy, 0.6, '#2a3218');
        g.font = 'bold 3px sans-serif'; g.fillStyle = 'rgba(230,226,190,0.7)'; g.fillText('7.62', b.x + 3, b.top + b.h * 0.65);
    },
    p_gunTable(op, r) {
        const S = this.S, b = S.base(r, 0.9);
        this.prism(b, [106, 74, 42], [74, 48, 24], { topMat: 'wood', frontMat: 'wood' });
        for (let i = 6; i < b.w - 26; i += 30) {
            const x = b.x + i, y = b.top + 7;
            this.soft(x + 0.6, y + 0.8, 23, 3, 0.4, 0.8, 0.5);
            this.fillRR(x, y - 0.4, 7, 3, 0.8, this.lin(0, y, 0, y + 3, [[0, [140, 92, 54]], [1, [80, 50, 28]]]));
            this.fillRR(x + 6, y, 16, 1.8, 0.4, this.lin(0, y, 0, y + 1.8, [[0, [100, 104, 112]], [1, [30, 32, 38]]]));
            this.fillRR(x + 9, y + 1.4, 1.4, 3, 0.3, '#16181a');
            const py = b.top + 14; this.soft(x + 6.6, py + 0.8, 12, 7, 0.4, 0.8, 0.5);
            this.fillRR(x + 6, py, 12, 2.6, 0.5, this.lin(0, py, 0, py + 2.6, [[0, [120, 126, 136]], [1, [30, 32, 38]]])); this.fillRR(x + 6.2, py + 2, 2.8, 5, 0.6, '#2a2420');
        }
        for (let k = 0; k < 3; k++) { const x = b.x + b.w - 24 + k * 1.2, y = b.top + 6 + k * 1.6; this.soft(x + 0.6, y + 0.8, 16, 9, 0.3, 0.8, 0.5); this.fillRR(x, y, 16, 9, 0.5, this.lin(x, y, x + 16, y + 9, [[0, [130, 190, 130]], [1, [76, 136, 86]]])); this.strokeRR(x + 1, y + 1, 14, 7, 0.4, 'rgba(40,90,50,0.7)', 0.3); }
    },
    p_grilleCounter(op, r, items) {
        const S = this.S, b = S.base(r, 1.0), g = this.g;
        this.p_counter(op, r, 1.0, '#6a665e', '#4a463e', items);
        for (let i = 3; i < b.w - 2; i += 6) { this.soft(b.x + i + 1.2, b.top - 27, 2, 36, 0.3, 0.8, 0.5); this.fillRR(b.x + i, b.top - 28, 1.8, 36, 0.8, this.lin(b.x + i, 0, b.x + i + 1.8, 0, [[0, [110, 114, 124]], [0.4, [52, 54, 60]], [1, [20, 22, 26]]])); }
        for (const yy of [b.top - 28, b.top - 6]) this.fillRR(b.x + 2, yy, b.w - 4, 2, 0.6, this.lin(0, yy, 0, yy + 2, [[0, [90, 94, 104]], [1, [20, 22, 26]]]));
        g.fillStyle = 'rgba(160,80,40,0.25)'; for (let i = 3; i < b.w - 2; i += 12) g.fillRect(b.x + i, b.top - 20, 1.8, 4);
    },
    p_oldSofa(op, r) {
        const S = this.S, b = S.base(r, 0.9), g = this.g;
        this.p__sofa(op, r, '#6a4a3a', b.w > b.h ? 'n' : 'n');
        g.fillStyle = '#e8dcc0'; this.ell(b.x + b.w * 0.6, b.top + b.h * 0.55, 2.4, 1.6, '#d8ccb0'); this.line(b.x + 5, b.top + 20, b.x + 14, b.top + 28, '#2a1c14', 0.6);
        this.fillRR(b.x + 4, b.top + b.h - 8, 12, 4, 1.2, '#a8a090');
    },
    p_oldTv(op, r) {
        const S = this.S, b = S.base(r, 0.8), g = this.g;
        this.prism(b, [58, 62, 68], [38, 40, 44], { topMat: 'paint' });
        const x = b.x + 3, y = b.top - 6;
        this.soft(x + 1, y + 1.4, 24, 16, 0.45, 1.4, 2);
        this.fillRR(x, y, 24, 16, 2.4, this.lin(x, y, x + 24, y + 16, [[0, [70, 72, 80]], [1, [20, 20, 24]]]));
        this.fillRR(x + 2.6, y + 2.4, 16, 10.4, 2, this.rad(x + 10, y + 7, 1, 10, [[0, [120, 150, 170]], [1, [40, 56, 70]]]));
        for (let k = 0; k < 10; k += 1.2) this.line(x + 2.8, y + 2.6 + k, x + 18.4, y + 2.6 + k, 'rgba(0,0,0,0.12)', 0.25);
        this.circ(x + 21, y + 5, 1, '#8a8e96'); this.circ(x + 21, y + 9, 1, '#8a8e96');
        this.line(x + 8, y, x + 4, y - 5, '#2a2c30', 0.4); this.line(x + 12, y, x + 16, y - 5, '#2a2c30', 0.4);
        this.glow(x + 10, y + 7, 18, [120, 160, 220], 0.15);
        void g;
    },
    p_cardboard(op, px, py) {
        this.soft(px + 0.6, py + 0.8, 26, 12, 0.3, 1, 0.5);
        this.fillRR(px, py, 26, 12, 0.4, this.lin(px, py, px + 26, py + 12, [[0, [190, 160, 112]], [1, [150, 120, 78]]]));
        this.line(px + 13, py, px + 13, py + 12, 'rgba(90,60,30,0.5)', 0.4); this.line(px, py + 6, px + 26, py + 6.4, 'rgba(90,60,30,0.3)', 0.3);
        this.grain(px, py, 26, 12, 0.3, 25);
    },

    // ================================================================= CASAS E BANCOS
    p_piano(op, r) {
        const S = this.S, b = S.base(r, 1.0), g = this.g;
        this.objShadow(b, 0.55, 2);
        this.fillRR(b.x, b.fy - 0.8, b.w, b.hp + 0.8, 0.8, '#08080a');
        g.beginPath(); g.moveTo(b.x, b.top + 8); g.lineTo(b.x, b.top + b.h); g.lineTo(b.x + b.w, b.top + b.h); g.lineTo(b.x + b.w, b.top + 8); g.quadraticCurveTo(b.x + b.w, b.top - 2, b.x + b.w * 0.6, b.top - 4); g.quadraticCurveTo(b.x + b.w * 0.2, b.top - 2, b.x, b.top + 8); g.closePath();
        g.fillStyle = this.lin(b.x, b.top, b.x + b.w, b.top + b.h, [[0, [56, 56, 64]], [0.3, [18, 18, 22]], [1, [6, 6, 8]]]); g.fill(); g.strokeStyle = HDA.OUT; g.lineWidth = 0.5; g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.moveTo(b.x + b.w * 0.2, b.top + 2); g.lineTo(b.x + b.w * 0.5, b.top + 1); g.lineTo(b.x + b.w * 0.3, b.top + b.h * 0.6); g.closePath(); g.fill();
        const ky = b.top + b.h - 6;
        this.fillRR(b.x + 3, ky, b.w - 6, 4.4, 0.4, '#f6f4ee');
        for (let i = 5; i < b.w - 5; i += 2.2) { this.line(b.x + i, ky, b.x + i, ky + 4.4, 'rgba(60,60,60,0.5)', 0.2); if (Math.round(i / 2.2) % 7 !== 2 && Math.round(i / 2.2) % 7 !== 6) this.fillRR(b.x + i + 0.7, ky, 1.1, 2.6, 0.2, '#141418'); }
    },
    p_bankSafe(op, r, P) {
        const S = this.S, b = S.base(r, 1.6), a = HDK.C(P.a);
        this.prism(b, [90, 96, 104], [58, 64, 72], { topMat: 'steel', frontMat: 'steel' });
        const cx = S.X((r[0] + r[2]) / 2) + 0.5, cy = S.Y(r[3]) + 6.5;
        this.circ(cx, cy, 5.6, '#2a2e34'); this.circ(cx, cy, 4.8, this.rad(cx - 1.4, cy - 1.4, 0.3, 5, [[0, [220, 226, 232]], [1, [110, 118, 128]]])); this.circ(cx, cy, 2, HDK.css(a));
        for (let k = 0; k < 6; k++) { const an = k * Math.PI / 3; this.line(cx + Math.cos(an) * 2.4, cy + Math.sin(an) * 2.4, cx + Math.cos(an) * 4.4, cy + Math.sin(an) * 4.4, 'rgba(40,44,50,0.8)', 0.5); }
    },
    p_elevator(op, r) {
        const S = this.S, b = S.base(r, 2.6), g = this.g, x0 = S.X(r[0]), y0 = S.Y(r[3]);
        this.prism(b, [138, 143, 152], [90, 96, 104], { topMat: 'steel', frontMat: 'steel' });
        const dx = x0 + 8, dy = y0 + 10;
        this.fillRR(dx - 1.4, dy - 1.4, 26.8, 32.8, 0.6, '#5a6068');
        for (const [x, w] of [[dx, 11.6], [dx + 12.4, 11.6]]) { g.fillStyle = this.lin(x, 0, x + w, 0, [[0, [210, 216, 224]], [0.4, [170, 178, 188]], [1, [130, 136, 146]]]); g.fillRect(x, dy, w, 30); for (let yy = dy; yy < dy + 30; yy += 0.6) this.line(x, yy, x + w, yy, 'rgba(255,255,255,0.06)', 0.2); }
        this.line(dx + 12, dy, dx + 12, dy + 30, '#3a3e44', 0.8);
        this.fillRR(dx + 8, dy - 6, 8, 3.4, 0.4, '#16181c'); g.fillStyle = '#ff7a30'; g.fillRect(dx + 10, dy - 5.2, 1.6, 1.8); g.fillRect(dx + 12.6, dy - 5.2, 1.6, 1.8);
        this.circ(dx + 27, dy + 14, 1, '#c8ccd2'); this.circ(dx + 27, dy + 17, 1, '#c8ccd2');
    },
    p_lasers(op, xa, xb, z0, z1) {
        const S = this.S, g = this.g;
        for (let z = z0; z < z1; z += 1.1) {
            const y = S.Y(z) + 0.5, x0 = S.X(xa) + 0.5, x1 = S.X(xb) + 0.5;
            g.save(); g.globalCompositeOperation = 'screen';
            this.line(x0, y, x1, y, 'rgba(255,40,40,0.25)', 2.6); this.line(x0, y, x1, y, 'rgba(255,60,60,0.9)', 0.6); this.line(x0, y, x1, y, 'rgba(255,220,220,0.9)', 0.2);
            g.restore();
            for (const x of [x0, x1]) { this.fillRR(x - 1, y - 1.4, 2, 2.8, 0.5, '#2a2c32'); this.circ(x, y, 0.5, '#ff3030'); }
        }
    },
    p_vaultDoor(op, r, P) {
        const S = this.S, b = S.base(r, 2.4), a = HDK.C(P.a), vx = S.X((r[0] + r[2]) / 2) + 0.5, vy = S.Y(r[3]) + 4.5, g = this.g;
        this.prism(b, [122, 128, 136], [74, 80, 88], { topMat: 'steel', frontMat: 'steel' });
        this.softEll(vx + 1.5, vy + 2, 14, 13, 0.5, 2);
        this.circ(vx, vy, 13.6, this.lin(vx - 13, vy - 13, vx + 13, vy + 13, [[0, [200, 206, 214]], [1, [100, 106, 116]]]));
        for (let k = 0; k < 12; k++) { const an = k * Math.PI / 6; this.circ(vx + Math.cos(an) * 12, vy + Math.sin(an) * 12, 0.7, '#5a6068'); }
        this.circ(vx, vy, 10, this.rad(vx - 3, vy - 3, 1, 10.5, [[0, [150, 156, 166]], [1, [80, 86, 96]]]));
        for (let k = 0; k < 6; k++) { const an = k * Math.PI / 3 + 0.2; g.save(); g.lineCap = 'round'; this.line(vx, vy, vx + Math.cos(an) * 8.6, vy + Math.sin(an) * 8.6, '#d8dee6', 1.2); g.restore(); this.circ(vx + Math.cos(an) * 8.6, vy + Math.sin(an) * 8.6, 1, '#e8ecf0'); }
        this.circ(vx, vy, 3.2, HDK.css(a)); this.circ(vx - 0.8, vy - 0.8, 1, 'rgba(255,255,255,0.6)');
        g.beginPath(); g.arc(vx, vy, 13.6, 0, Math.PI * 2); g.strokeStyle = HDA.OUT; g.lineWidth = 0.5; g.stroke();
    },
    p_monitor(op, px, py) {
        const x = px - 6, y = py - 14;
        this.soft(x + 0.8, y + 1, 12, 9, 0.4, 1, 1);
        this.fillRR(x + 4.6, y + 7, 2.8, 2.6, 0.4, '#2a2c32');
        this.fillRR(x, y, 12, 8, 0.8, '#16181c'); this.fillRR(x + 0.8, y + 0.8, 10.4, 6.4, 0.4, this.lin(x, y, x + 12, y + 8, [[0, [90, 150, 200]], [1, [30, 70, 110]]]));
        this.g.fillStyle = 'rgba(255,255,255,0.8)'; this.g.fillRect(x + 2, y + 2, 6, 0.6); this.g.fillRect(x + 2, y + 3.4, 4, 0.5);
    },
});
