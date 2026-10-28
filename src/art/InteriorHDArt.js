// ============================================================================
// InteriorHDArt — os PINTORES em alta definição das peças de cena dos interiores (ver art/InteriorHD.js): pisos, paredes, a casca
// da sala, balcões, mesas, cadeiras, banquetas, plantas, quadros, janelas, luminárias e enfeites de parede. Cada pintor recebe os
// mesmos parâmetros da peça no ShopCtx (art/ShopArt.js) e ocupa exatamente o mesmo lugar (os layouts pintam detalhes por cima).
// Luz do noroeste: topo claro, frente mais escura, sombra macia para sudeste. Contorno marrom-escuro fino em tudo, como na arte
// de referência.
// ============================================================================

const HDA = {
    OUT: 'rgba(30,18,10,0.82)',              // contorno
    SH: [14, 9, 5],                          // cor das sombras
};

Object.assign(HDPainter.prototype, {
    // ================================================================= PISOS
    p_floor(op, kind, A, B, opt = {}) {
        const S = this.S, T = S.T, x0 = S.X(T), x1 = S.X(S.W - T), y0 = S.Y(S.D - T), y1 = S.Y(T), w = x1 - x0, h = y1 - y0, g = this.g;
        const a = HDK.C(A), b = HDK.C(B || A);
        g.beginPath(); g.rect(x0, y0, w, h); g.clip();
        if (kind === 'planks') this.fPlanks(x0, y0, w, h, a, b);
        else if (kind === 'checker') this.fChecker(x0, y0, w, h, a, b, opt.size || 16);
        else if (kind === 'marble') this.fMarble(x0, y0, w, h, a, b);
        else if (kind === 'concrete') this.fConcrete(x0, y0, w, h, a, b, opt.size || 24);
        else this.fTile(x0, y0, w, h, a, b, opt.size || 24);
    },
    // Lajota/porcelanato: cada peça num tom, rejunte com sulco e friso de luz, manchas, lascas e riscos.
    fTile(x0, y0, w, h, a, b, s) {
        const g = this.g, seed = this.S.seed, rng = Pixel.rng(seed + 101);
        for (let ty = 0; ty * s < h; ty++) for (let tx = 0; tx * s < w; tx++) {
            const x = x0 + tx * s, y = y0 + ty * s, col = HDK.t(HDK.mix(a, b, Pixel.hash(tx, ty, seed) * 0.8), 0.96 + Pixel.hash(tx, ty, seed + 5) * 0.08);
            g.fillStyle = this.lin(x, y, x + s, y + s, [[0, HDK.t(col, 1.05)], [1, HDK.t(col, 0.94)]]); g.fillRect(x, y, s, s);
        }
        this.clouds(x0, y0, w, h, 0.5, seed + 1, 2.2);
        this.grain(x0, y0, w, h, 0.2, seed % 7 + 1);
        // desgaste: pintas, riscos, manchas, lascas nos cantos
        const dark = HDK.t(a, 0.42);
        for (let ty = 0; ty * s < h; ty++) for (let tx = 0; tx * s < w; tx++) {
            const x = x0 + tx * s, y = y0 + ty * s;
            for (let k = Math.floor(rng() * 4); k > 0; k--) this.ell(x + 2 + rng() * (s - 4), y + 2 + rng() * (s - 4), 0.25 + rng() * 0.9, 0.2 + rng() * 0.5, HDK.css(dark, 0.12 + rng() * 0.22));
            if (rng() < 0.22) { const xx = x + rng() * s, yy = y + rng() * s, L = 2 + rng() * 6, an = rng() * Math.PI; this.line(xx, yy, xx + Math.cos(an) * L, yy + Math.sin(an) * L, HDK.css(dark, 0.14), 0.22); }
            if (rng() < 0.12) { const xx = x + 3 + rng() * (s - 6), yy = y + 3 + rng() * (s - 6), r = 2.5 + rng() * 5; g.fillStyle = this.rad(xx, yy, 0, r, [[0, dark, 0.13], [1, dark, 0]]); g.fillRect(xx - r, yy - r, r * 2, r * 2); }
            if (rng() < 0.1) { const cx = x + (rng() < 0.5 ? 0.6 : s - 0.6), cy = y + (rng() < 0.5 ? 0.6 : s - 0.6); this.ell(cx, cy, 0.9 + rng(), 0.7 + rng() * 0.6, HDK.css(HDK.t(a, 0.6), 0.6)); }
        }
        this.grout(x0, y0, w, h, s, s, a, 0.7, 0.85, true);
    },
    grout(x0, y0, w, h, sx, sy, a, lw = 0.6, al = 0.8, bevel = false) {
        const g = this.g;
        if (bevel) {                                     // quina das peças: luz em cima/esquerda, sombra embaixo/direita
            g.beginPath();
            for (let x = x0; x <= x0 + w + 0.01; x += sx) { g.moveTo(x - 0.75, y0); g.lineTo(x - 0.75, y0 + h); }
            for (let y = y0; y <= y0 + h + 0.01; y += sy) { g.moveTo(x0, y - 0.75); g.lineTo(x0 + w, y - 0.75); }
            g.strokeStyle = HDK.css(HDK.t(a, 0.5), 0.28); g.lineWidth = 0.9; g.stroke();
            g.beginPath();
            for (let x = x0; x <= x0 + w + 0.01; x += sx) { g.moveTo(x + 1.1, y0); g.lineTo(x + 1.1, y0 + h); }
            for (let y = y0; y <= y0 + h + 0.01; y += sy) { g.moveTo(x0, y + 1.1); g.lineTo(x0 + w, y + 1.1); }
            g.strokeStyle = 'rgba(255,250,240,0.22)'; g.lineWidth = 0.7; g.stroke();
        }
        g.beginPath();
        for (let x = x0; x <= x0 + w + 0.01; x += sx) { g.moveTo(x, y0); g.lineTo(x, y0 + h); }
        for (let y = y0; y <= y0 + h + 0.01; y += sy) { g.moveTo(x0, y); g.lineTo(x0 + w, y); }
        g.strokeStyle = HDK.css(HDK.t(a, 0.56), al); g.lineWidth = lw; g.stroke();
        g.beginPath();
        for (let x = x0; x <= x0 + w + 0.01; x += sx) { g.moveTo(x + lw * 0.85, y0); g.lineTo(x + lw * 0.85, y0 + h); }
        for (let y = y0; y <= y0 + h + 0.01; y += sy) { g.moveTo(x0, y + lw * 0.85); g.lineTo(x0 + w, y + lw * 0.85); }
        g.strokeStyle = HDK.css(HDK.t(a, 1.16), al * 0.45); g.lineWidth = lw * 0.55; g.stroke();
    },
    // Piso xadrez (vinílico/cerâmico encerado).
    fChecker(x0, y0, w, h, a, b, s) {
        const g = this.g, seed = this.S.seed, rng = Pixel.rng(seed + 77);
        for (let ty = 0; ty * s < h; ty++) for (let tx = 0; tx * s < w; tx++) {
            const x = x0 + tx * s, y = y0 + ty * s, base = (tx + ty) & 1 ? a : b, col = HDK.t(base, 0.97 + Pixel.hash(tx, ty, seed) * 0.06);
            g.fillStyle = this.lin(x, y, x + s, y + s, [[0, HDK.t(col, 1.04)], [1, HDK.t(col, 0.95)]]); g.fillRect(x, y, s, s);
        }
        this.clouds(x0, y0, w, h, 0.32, seed + 2, 2.6);
        this.grain(x0, y0, w, h, 0.12, seed % 5 + 2);
        for (let k = 0; k < (w * h) / 260; k++) { const xx = x0 + rng() * w, yy = y0 + rng() * h, L = 1.5 + rng() * 5, an = rng() * Math.PI; this.line(xx, yy, xx + Math.cos(an) * L, yy + Math.sin(an) * L, 'rgba(20,14,10,0.1)', 0.25); }
        this.grout(x0, y0, w, h, s, s, HDK.mix(a, b, 0.5), 0.35, 0.55);
    },
    // Assoalho de tábuas: cada tábua num tom, veios, nós, emendas de topo e a fresta entre as fileiras.
    fPlanks(x0, y0, w, h, a, b) {
        const g = this.g, seed = this.S.seed, rng = Pixel.rng(seed + 55), ph = 9;
        for (let y = y0; y < y0 + h; y += ph) {
            let x = x0 - Math.floor(rng() * 30);
            while (x < x0 + w) {
                const len = 34 + Math.floor(rng() * 64), col = HDK.t(HDK.mix(a, b, rng()), 0.94 + rng() * 0.1), xa = Math.max(x, x0), xb = Math.min(x + len, x0 + w);
                if (xb > xa) {
                    g.fillStyle = this.lin(0, y, 0, y + ph, [[0, HDK.t(col, 1.08)], [0.5, col], [1, HDK.t(col, 0.86)]]); g.fillRect(xa, y, xb - xa, ph);
                    // veios: linhas finas onduladas ao longo da tábua
                    const nv = 3 + Math.floor(rng() * 3), ph0 = rng() * 6, f = 0.05 + rng() * 0.08;
                    for (let k = 0; k < nv; k++) {
                        const yy = y + 1.2 + (ph - 2.4) * (k + rng() * 0.6) / nv;
                        g.beginPath(); g.moveTo(xa, yy);
                        for (let xx = xa; xx <= xb; xx += 3) g.lineTo(xx, yy + Math.sin(xx * f + ph0 + k) * 0.55);
                        g.strokeStyle = HDK.css(HDK.t(col, 0.7), 0.32 + rng() * 0.2); g.lineWidth = 0.18 + rng() * 0.16; g.stroke();
                    }
                    if (rng() < 0.12 && xb - xa > 10) { const kx = xa + 4 + rng() * (xb - xa - 8), ky = y + 2 + rng() * (ph - 4); this.ell(kx, ky, 1.6, 0.8, HDK.css(HDK.t(col, 0.62), 0.8)); this.ell(kx, ky, 0.7, 0.35, HDK.css(HDK.t(col, 0.4), 0.9)); }
                    this.line(xa, y + 0.3, xb, y + 0.3, HDK.css(HDK.t(col, 1.3), 0.45), 0.3);
                    if (x + len < x0 + w) this.line(xb, y, xb, y + ph, HDK.css(HDK.t(col, 0.42), 0.9), 0.4);
                }
                x += len;
            }
            this.line(x0, y + ph - 0.2, x0 + w, y + ph - 0.2, HDK.css(HDK.t(a, 0.38), 0.9), 0.45);
        }
        this.clouds(x0, y0, w, h, 0.3, seed + 3, 2.4);
        this.grain(x0, y0, w, h, 0.14, seed % 6 + 3);
    },
    // Mármore polido: nuvens suaves, veios que se ramificam e as juntas das placas.
    fMarble(x0, y0, w, h, a, b) {
        const g = this.g, seed = this.S.seed, rng = Pixel.rng(seed + 31);
        g.fillStyle = HDK.css(a); g.fillRect(x0, y0, w, h);
        this.clouds(x0, y0, w, h, 0.45, seed + 4, 3.4);
        this.clouds(x0, y0, w, h, 0.25, seed + 5, 1.2);
        const veins = Math.max(3, Math.round(w * h / 9000));
        for (let v = 0; v < veins; v++) {
            let x = x0 + rng() * w, y = y0 + rng() * h, an = (rng() - 0.5) * 1.2 + (rng() < 0.5 ? 0 : Math.PI);
            const n = 30 + Math.floor(rng() * 50), lw = 0.25 + rng() * 0.35, al = 0.14 + rng() * 0.16, col = HDK.mix(a, b, 0.55 + rng() * 0.3), pts = [[x, y]];
            for (let i = 0; i < n; i++) { an += (rng() - 0.5) * 0.35; x += Math.cos(an) * (2.5 + rng() * 2); y += Math.sin(an) * (1.5 + rng() * 1.5); pts.push([x, y]); }
            const path = () => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length - 1; i++) g.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2); };
            path(); g.strokeStyle = HDK.css(col, al * 0.3); g.lineWidth = lw * 7; g.stroke();
            path(); g.strokeStyle = HDK.css(col, al); g.lineWidth = lw; g.stroke();
            if (rng() < 0.6) { const k = Math.floor(pts.length * (0.3 + rng() * 0.4)); let [bx, by] = pts[k], ba = an + (rng() < 0.5 ? 0.8 : -0.8); g.beginPath(); g.moveTo(bx, by); for (let i = 0; i < 10; i++) { ba += (rng() - 0.5) * 0.4; bx += Math.cos(ba) * 2.2; by += Math.sin(ba) * 1.6; g.lineTo(bx, by); } g.strokeStyle = HDK.css(col, al * 0.7); g.lineWidth = lw * 0.6; g.stroke(); }
        }
        this.grain(x0, y0, w, h, 0.07, seed % 4 + 5);
        this.grout(x0, y0, w, h, 40, 40, a, 0.32, 0.55);
        g.fillStyle = this.lin(x0, y0, x0 + w * 0.6, y0 + h, [[0, [255, 255, 255], 0.06], [0.5, [255, 255, 255], 0], [1, [255, 255, 255], 0.04]]); g.fillRect(x0, y0, w, h);
    },
    // Cimento queimado / contrapiso: manchas, juntas, rachaduras e marcas de óleo.
    fConcrete(x0, y0, w, h, a, b, s) {
        const g = this.g, seed = this.S.seed, rng = Pixel.rng(seed + 13);
        g.fillStyle = HDK.css(HDK.mix(a, b, 0.4)); g.fillRect(x0, y0, w, h);
        this.clouds(x0, y0, w, h, 0.75, seed + 6, 2.2);
        this.clouds(x0, y0, w, h, 0.4, seed + 7, 6);
        this.grain(x0, y0, w, h, 0.38, seed % 9 + 1);
        this.grout(x0, y0, w, h, s * 2, s * 2, a, 0.4, 0.45);
        for (let k = 0; k < Math.max(3, w * h / 3000); k++) this.crack(x0 + rng() * w, y0 + rng() * h, 20 + rng() * 40, rng, a);
        for (let k = 0; k < Math.max(4, w * h / 2500); k++) { const xx = x0 + rng() * w, yy = y0 + rng() * h, r = 3 + rng() * 10; g.fillStyle = this.rad(xx, yy, 0, r, [[0, HDK.t(a, 0.4), 0.22], [0.7, HDK.t(a, 0.45), 0.08], [1, HDK.t(a, 0.5), 0]]); g.fillRect(xx - r, yy - r, r * 2, r * 2); }
    },
    crack(x, y, n, rng, a) {
        const g = this.g, pts = [[x, y]];
        for (let i = 0; i < n; i++) { x += (rng() - 0.5) * 2.2; y += 0.4 + rng() * 0.9; pts.push([x, y]); }
        const path = () => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts) g.lineTo(p[0], p[1]); };
        path(); g.strokeStyle = HDK.css(HDK.t(a, 1.25), 0.25); g.lineWidth = 0.7; g.stroke();
        path(); g.strokeStyle = HDK.css(HDK.t(a, 0.32), 0.75); g.lineWidth = 0.32; g.stroke();
    },

    // Tapete / passadeira.
    p_rug(op, r, col, edge, stripes = true) {
        const S = this.S, x = S.X(r[0]), y = S.Y(r[3]), w = S.X(r[2]) - x, h = S.Y(r[1]) - y, g = this.g;
        this.soft(x + 0.5, y + 0.8, w, h, 0.25, 1.2, 1);
        this.fillRR(x, y, w, h, 0.8, HDK.css(col));
        this.clip(x, y, w, h, () => {
            this.clouds(x, y, w, h, 0.35, S.seed + 8, 1.4);
            g.globalAlpha = 0.18; for (let yy = y + 0.5; yy < y + h; yy += 0.9) this.line(x, yy, x + w, yy, HDK.css(HDK.t(col, 0.75)), 0.25); g.globalAlpha = 1;
            this.grain(x, y, w, h, 0.4, 11);
        });
        const e = HDK.C(edge);
        this.strokeRR(x + 0.2, y + 0.2, w - 0.4, h - 0.4, 0.8, HDK.css(e), 1.8);
        if (stripes) this.strokeRR(x + 4, y + 4, w - 8, h - 8, 0.5, HDK.css(HDK.t(e, 1.25), 0.85), 0.6);
        // franja nas pontas (lados curtos)
        const vert = h > w;
        g.strokeStyle = HDK.css(HDK.t(e, 1.4), 0.8); g.lineWidth = 0.25; g.beginPath();
        if (vert) for (let xx = x + 1; xx < x + w - 1; xx += 0.8) { g.moveTo(xx, y); g.lineTo(xx, y - 1.2); g.moveTo(xx, y + h); g.lineTo(xx, y + h + 1.2); }
        else for (let yy = y + 1; yy < y + h - 1; yy += 0.8) { g.moveTo(x, yy); g.lineTo(x - 1.2, yy); g.moveTo(x + w, yy); g.lineTo(x + w + 1.2, yy); }
        g.stroke();
    },

    // ================================================================= PAREDES
    // Textura de parede num retângulo (a face da parede do fundo, já alta).
    wallMat(kind, x, y, w, h, A, B) {
        const g = this.g, a = HDK.C(A), b = HDK.C(B || A), seed = this.S.seed, rng = Pixel.rng(seed + 211);
        g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
        if (kind === 'brick') {
            g.fillStyle = HDK.css(HDK.mix(HDK.t(a, 0.62), [170, 160, 145], 0.35)); g.fillRect(x, y, w, h);          // argamassa
            this.grain(x, y, w, h, 0.4, 3);
            const bw = 11, bh = 4.6;
            for (let r = 0; y + h - (r + 1) * bh > y - bh; r++) {
                const yy = y + h - (r + 1) * bh;
                for (let k = -1; x + k * bw < x + w; k++) {
                    const xx = x + k * bw + (r % 2) * bw / 2, col = HDK.t(HDK.mix(a, b, rng()), 0.88 + rng() * 0.24);
                    this.fillRR(xx + 0.45, yy + 0.45, bw - 0.9, bh - 0.9, 0.5, this.lin(0, yy, 0, yy + bh, [[0, HDK.t(col, 1.14)], [0.3, col], [1, HDK.t(col, 0.8)]]));
                    if (rng() < 0.25) this.ell(xx + 1.5 + rng() * (bw - 3), yy + 1 + rng() * (bh - 2), 0.4 + rng() * 0.8, 0.3 + rng() * 0.4, HDK.css(HDK.t(col, 0.7), 0.6));
                    if (rng() < 0.15) this.line(xx + 1, yy + 0.9, xx + bw - 1.5, yy + 0.9, HDK.css(HDK.t(col, 1.35), 0.4), 0.3);
                }
            }
            this.clouds(x, y, w, h, 0.35, seed + 9, 1.6);
        } else if (kind === 'wood') {
            g.fillStyle = HDK.css(HDK.t(a, 0.5)); g.fillRect(x, y, w, h);
            for (let i = 0; i < w; i += 6) {
                const col = HDK.t(HDK.mix(a, b, rng()), 0.92 + rng() * 0.14);
                g.fillStyle = this.lin(x + i, 0, x + i + 5.6, 0, [[0, HDK.t(col, 1.12)], [0.5, col], [1, HDK.t(col, 0.82)]]); g.fillRect(x + i + 0.25, y, 5.5, h);
                for (let k = 0; k < 3; k++) { const xx = x + i + 1 + rng() * 3.5, ph = rng() * 6; g.beginPath(); g.moveTo(xx, y); for (let yy = y; yy <= y + h; yy += 3) g.lineTo(xx + Math.sin(yy * 0.12 + ph) * 0.4, yy); g.strokeStyle = HDK.css(HDK.t(col, 0.7), 0.35); g.lineWidth = 0.22; g.stroke(); }
                if (rng() < 0.3) this.ell(x + i + 2.8, y + rng() * h, 0.9, 1.5, HDK.css(HDK.t(col, 0.55), 0.7));
            }
            this.grain(x, y, w, h, 0.18, 4);
        } else if (kind === 'tile') {
            const s = 8;
            for (let j = 0; j < h; j += s / 2) for (let i = 0; i < w; i += s) {
                const col = HDK.mix(a, b, Pixel.hash(i, j, 2) * 0.5);
                this.fillRR(x + i + 0.25, y + j + 0.25, s - 0.5, s / 2 - 0.5, 0.6, this.lin(x + i, y + j, x + i + s, y + j + s / 2, [[0, HDK.t(col, 1.1)], [1, HDK.t(col, 0.92)]]));
                this.line(x + i + 1, y + j + 0.8, x + i + s - 2, y + j + 0.8, 'rgba(255,255,255,0.5)', 0.3);
            }
        } else if (kind === 'panel') {                                      // papel de parede listrado em cima, lambri de madeira embaixo
            const wh = Math.round(h * 0.42);
            g.fillStyle = HDK.css(a); g.fillRect(x, y, w, h - wh);
            for (let i = 0; i < w; i += 5) { g.fillStyle = HDK.css(HDK.t(a, 0.9), 0.85); g.fillRect(x + i, y, 2.5, h - wh); }
            for (let i = 0; i < w; i += 10) for (let j = 3; j < h - wh; j += 7) this.ell(x + i + 3.7, y + j + ((i / 10) % 2) * 3.5, 0.5, 0.7, HDK.css(HDK.t(a, 1.18), 0.5));
            this.clouds(x, y, w, h - wh, 0.2, seed + 10, 1.2);
            const by = y + h - wh;
            g.fillStyle = this.lin(0, by, 0, y + h, [[0, HDK.t(b, 1.05)], [1, HDK.t(b, 0.82)]]); g.fillRect(x, by, w, wh);
            for (let i = 0; i < w; i += 18) {
                this.fillRR(x + i + 2, by + 3, 14, wh - 6, 0.6, this.lin(0, by + 3, 0, by + wh - 3, [[0, HDK.t(b, 1.18)], [1, HDK.t(b, 0.95)]]));
                this.strokeRR(x + i + 2, by + 3, 14, wh - 6, 0.6, HDK.css(HDK.t(b, 0.55), 0.8), 0.4);
                this.line(x + i + 2.6, by + 3.5, x + i + 15.4, by + 3.5, HDK.css(HDK.t(b, 1.5), 0.5), 0.3);
            }
            g.fillStyle = this.lin(0, by - 2, 0, by + 1, [[0, HDK.t(b, 1.35)], [1, HDK.t(b, 0.6)]]); g.fillRect(x, by - 1.5, w, 2.5);
        } else if (kind === 'bamboo') {
            g.fillStyle = HDK.css(a); g.fillRect(x, y, w, h);
            for (let i = 0; i < w; i += 3.5) { g.fillStyle = this.lin(x + i, 0, x + i + 3.5, 0, [[0, HDK.t(a, 1.08)], [1, HDK.t(a, 0.84)]]); g.fillRect(x + i, y, 3.3, h); }
            for (let i = 0; i < w; i += 34) {
                g.fillStyle = this.lin(x + i, 0, x + i + 4, 0, [[0, HDK.t(b, 1.3)], [0.5, b], [1, HDK.t(b, 0.6)]]); g.fillRect(x + i, y, 4, h);
                for (let j = 6; j < h; j += 9) this.fillRR(x + i - 0.6, y + j, 5.2, 1.2, 0.5, HDK.css(HDK.t(b, 0.7)));
            }
            this.grain(x, y, w, h, 0.15, 5);
        } else if (kind === 'pegboard') {
            g.fillStyle = HDK.css(a); g.fillRect(x, y, w, h); this.grain(x, y, w, h, 0.2, 6);
            g.fillStyle = HDK.css(HDK.t(a, 0.45));
            for (let j = 2; j < h; j += 3) for (let i = 2; i < w; i += 3) { g.beginPath(); g.arc(x + i, y + j, 0.42, 0, Math.PI * 2); g.fill(); }
        } else if (kind === 'concrete') {
            g.fillStyle = HDK.css(HDK.mix(a, b, 0.4)); g.fillRect(x, y, w, h);
            this.clouds(x, y, w, h, 0.7, seed + 11, 1.5); this.grain(x, y, w, h, 0.4, 7);
            for (let k = 0; k < w / 25; k++) { const xx = x + rng() * w; g.fillStyle = this.lin(0, y, 0, y + h, [[0, HDK.t(a, 0.4), 0.3], [1, HDK.t(a, 0.4), 0]]); g.fillRect(xx, y, 0.6 + rng() * 1.2, h * (0.3 + rng() * 0.6)); }
            for (let k = 0; k < 3; k++) this.crack(x + rng() * w, y + rng() * h * 0.4, 14, rng, a);
        } else {                                                              // 'paint': reboco pintado com manchas
            g.fillStyle = this.lin(0, y, 0, y + h, [[0, HDK.t(a, 1.03)], [1, HDK.t(a, 0.95)]]); g.fillRect(x, y, w, h);
            this.clouds(x, y, w, h, 0.32, seed + 12, 1.5);
            this.grain(x, y, w, h, 0.16, 8);
            for (let k = 0; k < w / 40; k++) { const xx = x + rng() * w, yy = y + h * (0.3 + rng() * 0.6), r = 3 + rng() * 6; g.fillStyle = this.rad(xx, yy, 0, r, [[0, HDK.t(b, 0.8), 0.18], [1, HDK.t(b, 0.8), 0]]); g.fillRect(xx - r, yy - r, r * 2, r * 2); }
        }
        g.restore();
    },

    // Casca: parede do fundo (alta), tampas, colunas laterais de madeira, parede da frente baixa com a porta.
    p_shell(op, o) {
        const S = this.S, g = this.g, T = S.T, W = S.W, x0 = S.X(T), x1 = S.X(W - T), nY = S.nY, top = this.top, cH = Math.round(T * S.PPU);
        const cap = HDK.C(o.cap || '#7b7568'), side = HDK.C(o.side || '#72593a'), front = HDK.C(o.front || '#8a5a3c');
        // face da parede do fundo
        this.wallMat(o.n.kind, x0, top, x1 - x0, nY - top, o.n.A, o.n.B);
        if (o.n2) this.wallMat(o.n2.kind, S.X(o.n2.x0), top, S.X(o.n2.x1) - S.X(o.n2.x0), nY - top, o.n2.A, o.n2.B);
        g.fillStyle = this.lin(0, top, 0, top + 10, [[0, HDA.SH, 0.55], [1, HDA.SH, 0]]); g.fillRect(x0, top, x1 - x0, 10);          // sombra do teto
        g.fillStyle = this.lin(0, nY - 8, 0, nY, [[0, HDA.SH, 0], [1, HDA.SH, 0.32]]); g.fillRect(x0, nY - 8, x1 - x0, 8);           // pé da parede
        // rodapé (ou friso) junto ao piso
        const rail = HDK.C(o.rail || HDK.t(side, 0.8));
        g.fillStyle = this.lin(0, nY - 2.6, 0, nY, [[0, HDK.t(rail, 1.25)], [0.35, rail], [1, HDK.t(rail, 0.6)]]); g.fillRect(x0, nY - 2.6, x1 - x0, 2.6);
        this.line(x0, nY - 2.6, x1, nY - 2.6, HDK.css(HDK.t(rail, 0.5), 0.8), 0.3);
        // tampa da parede do fundo (vista de cima)
        this.slab(S.X(0), top - cH, S.X(W) - S.X(0), cH, cap);
        // colunas laterais (vigas de madeira na altura toda) e a face interna junto ao piso
        const sY = S.Y(0), sH = S.hp(0.5), fTop = sY - sH - cH;
        for (const [xa, xb, dir] of [[S.X(0), S.X(T), 1], [S.X(W - T), S.X(W), -1]]) {
            this.beam(xa, top - cH, xb - xa, fTop - (top - cH) + cH, side, dir);
            const fx = dir > 0 ? xb : xa - 5;
            g.fillStyle = this.lin(fx, 0, fx + 5, 0, dir > 0 ? [[0, HDK.t(side, 0.5), 0.95], [1, HDK.t(side, 0.5), 0]] : [[0, HDK.t(side, 0.5), 0], [1, HDK.t(side, 0.5), 0.95]]);
            g.fillRect(fx, nY, 5, S.Y(T) - nY);
        }
        // parede da frente (baixa) com o vão da porta
        const d0 = S.X(S.door.x0), d1 = S.X(S.door.x1);
        for (const [xa, xb] of [[S.X(T) - 0.01, d0], [d1, S.X(W - T) + 0.01]]) {
            if (xb - xa <= 0) continue;
            g.fillStyle = this.lin(0, sY - sH, 0, sY, [[0, HDK.t(front, 0.95)], [1, HDK.t(front, 0.6)]]); g.fillRect(xa, sY - sH, xb - xa, sH);
            this.slab(xa, fTop, xb - xa, cH, cap, front);
        }
        // porta: soleira de pedra no vão, capacho, batentes e a luz da rua entrando
        { const ty = S.Y(T); g.fillStyle = this.lin(0, ty, 0, sY, [[0, [150, 144, 132]], [1, [96, 92, 84]]]); g.fillRect(d0, ty, d1 - d0, sY - ty); this.grain(d0, ty, d1 - d0, sY - ty, 0.3, 27); }
        g.fillStyle = this.lin(0, sY, 0, sY - 44, [[0, [255, 236, 180], 0.32], [1, [255, 236, 180], 0]]); g.fillRect(d0, sY - 44, d1 - d0, 44);
        const mat = HDK.C(o.mat || '#4a3a2a'), mw = d1 - d0 - 4, mx = d0 + 2, my = sY - 20;
        this.soft(mx + 0.5, my + 0.8, mw, 16, 0.3, 1.2, 1);
        this.fillRR(mx, my, mw, 16, 1.2, HDK.css(mat));
        this.clip(mx, my, mw, 16, () => { g.globalAlpha = 0.5; for (let i = 0; i < mw; i += 1.6) this.line(mx + i, my, mx + i, my + 16, HDK.css(HDK.t(mat, 1.35)), 0.55); g.globalAlpha = 1; this.grain(mx, my, mw, 16, 0.45, 9); });
        this.strokeRR(mx, my, mw, 16, 1.2, HDK.css(HDK.t(mat, 0.5), 0.9), 0.6);
        for (const dx of [d0 - 3, d1]) this.beam(dx, fTop, 3, sY - fTop, [70, 50, 32], 1);
    },
    // Tampa de parede vista de cima: placa com friso de luz e a quina escura.
    slab(x, y, w, h, col, face = null) {
        const g = this.g;
        g.fillStyle = this.lin(0, y, 0, y + h, [[0, HDK.t(col, 1.18)], [0.15, HDK.t(col, 1.05)], [1, HDK.t(col, 0.82)]]); g.fillRect(x, y, w, h);
        this.grain(x, y, w, h, 0.25, 12);
        this.line(x, y + 0.3, x + w, y + 0.3, HDK.css(HDK.t(col, 1.45), 0.7), 0.5);
        this.line(x, y + h - 0.3, x + w, y + h - 0.3, HDK.css(HDK.t(face || col, 0.4), 0.9), 0.6);
    },
    // Viga/coluna de madeira (vertical), com veio e contorno.
    beam(x, y, w, h, col, dir = 1) {
        const g = this.g, rng = Pixel.rng(Math.round(x * 7 + y));
        g.fillStyle = this.lin(x, 0, x + w, 0, dir > 0 ? [[0, HDK.t(col, 1.2)], [0.35, col], [1, HDK.t(col, 0.6)]] : [[0, HDK.t(col, 0.6)], [0.65, col], [1, HDK.t(col, 1.2)]]);
        g.fillRect(x, y, w, h);
        this.clip(x, y, w, h, () => {
            for (let k = 0; k < Math.max(2, w / 2.2); k++) { const xx = x + 0.6 + rng() * (w - 1.2), ph = rng() * 6; g.beginPath(); g.moveTo(xx, y); for (let yy = y; yy <= y + h; yy += 4) g.lineTo(xx + Math.sin(yy * 0.05 + ph) * 0.5, yy); g.strokeStyle = HDK.css(HDK.t(col, 0.68), 0.4); g.lineWidth = 0.25; g.stroke(); }
            this.grain(x, y, w, h, 0.2, 13);
        });
        g.strokeStyle = HDA.OUT; g.lineWidth = 0.5; g.strokeRect(x + 0.25, y + 0.25, w - 0.5, h - 0.5);
    },

    // ================================================================= MÓVEIS GENÉRICOS
    // Sombra macia no piso de um móvel (base b do ShopCtx), puxada para sudeste.
    objShadow(b, a = 0.5, extra = 0) {
        this.soft(b.x - 1.5, b.y + b.h * 0.25, b.w + 3 + extra, b.h * 0.75 + 4, a * 0.5, 6, 3);           // oclusão larga em volta
        this.soft(b.x + 2.6, b.y + 2.6, b.w + 1 + extra, b.h + 1.2, a, 3, 2);                              // sombra projetada (sudeste)
        this.soft(b.x - 0.3, b.y + b.h - 1.6, b.w + 0.6, 2.6, a, 1, 1);                                    // contato sob a quina da frente
    },
    p_shadow(op, b, extra = 0) { this.objShadow(b, 0.38, extra); },
    // Material de uma face (madeira, aço, pedra, tinta) dentro do retângulo.
    faceMat(kind, x, y, w, h, col, role = 'top') {
        if (w <= 0 || h <= 0) return;
        const g = this.g, rng = Pixel.rng(Math.round(x * 13 + y * 7));
        g.save(); this.rr(x, y, w, h, Math.min(1.2, w / 4, h / 4)); g.clip();
        if (kind === 'wood') {
            if (role === 'front') {                                   // tábuas verticais
                for (let i = 0; i < w; i += 4.5) { this.line(x + i, y, x + i, y + h, HDK.css(HDK.t(col, 0.55), 0.6), 0.3); this.line(x + i + 0.4, y, x + i + 0.4, y + h, HDK.css(HDK.t(col, 1.25), 0.25), 0.2); }
            } else {
                for (let k = 0; k < h / 1.4; k++) { const yy = y + 0.6 + k * 1.4 + rng() * 0.5, ph = rng() * 6; g.beginPath(); g.moveTo(x, yy); for (let xx = x; xx <= x + w; xx += 3) g.lineTo(xx, yy + Math.sin(xx * 0.09 + ph) * 0.4); g.strokeStyle = HDK.css(HDK.t(col, 0.72), 0.3); g.lineWidth = 0.2; g.stroke(); }
            }
            this.grain(x, y, w, h, 0.18, 14);
        } else if (kind === 'steel') {
            g.globalAlpha = 0.5; for (let yy = y; yy < y + h; yy += 0.5) this.line(x, yy, x + w, yy, HDK.css(HDK.t(col, 0.86 + rng() * 0.25)), 0.22); g.globalAlpha = 1;
            g.fillStyle = this.lin(x, y, x + w, y + h, [[0, [255, 255, 255], 0], [0.35, [255, 255, 255], 0.22], [0.42, [255, 255, 255], 0.04], [0.7, [255, 255, 255], 0.12], [1, [255, 255, 255], 0]]); g.fillRect(x, y, w, h);
        } else if (kind === 'stone') {
            for (let k = 0; k < w * h / 3; k++) this.ell(x + rng() * w, y + rng() * h, 0.15 + rng() * 0.35, 0.12 + rng() * 0.25, HDK.css(HDK.t(col, rng() < 0.5 ? 0.62 : 1.25), 0.35 + rng() * 0.35));
            this.grain(x, y, w, h, 0.22, 15);
        } else {
            this.grain(x, y, w, h, 0.12, 16);
        }
        g.restore();
    },
    // Caixa no corte oblíquo (topo + frente), com materiais, friso de luz na quina e contorno.
    prism(b, top, front, o = {}) {
        const rad = o.r === undefined ? Math.min(1.3, b.w / 6, b.h / 4) : o.r;
        if (o.shadow !== false) this.objShadow(b, o.shadowA);
        const fy = b.fy - 0.8, fh = b.hp + 0.8;
        if (fh > 0.5) {
            this.fillRR(b.x, fy, b.w, fh, Math.min(rad, fh / 2), this.lin(0, fy, 0, fy + fh, [[0, HDK.t(front, 1.02)], [1, HDK.t(front, 0.66)]]));
            this.faceMat(o.frontMat || HDK.mat(front), b.x, fy, b.w, fh, front, 'front');
        }
        this.fillRR(b.x, b.top, b.w, b.h, rad, this.lin(b.x, b.top, b.x + b.w * 0.35, b.top + b.h, [[0, HDK.t(top, 1.1)], [1, HDK.t(top, 0.93)]]));
        this.faceMat(o.topMat || HDK.mat(top), b.x, b.top, b.w, b.h, top, 'top');
        if (fh > 0.5) this.line(b.x + rad * 0.6, b.fy - 0.4, b.x + b.w - rad * 0.6, b.fy - 0.4, HDK.css(HDK.t(top, 1.38), 0.75), 0.45);
        this.line(b.x + rad, b.top + 0.4, b.x + b.w - rad, b.top + 0.4, HDK.css(HDK.t(top, 1.3), 0.5), 0.35);
        this.strokeRR(b.x, b.top, b.w, b.h + b.hp, rad, HDA.OUT, 0.5);
    },
    p_blk(op, r, h, top, front) {
        const b = this.S.base(r, h);
        if (h >= 2.5 && b.w <= 24 && b.h <= 24 && b.w >= 10) return this.pillar(b, top, front);
        this.prism(b, top, front);
    },
    // Coluna redonda (mansão): fuste com caneluras, base e capitel quadrados.
    pillar(b, top, front) {
        const g = this.g, t = HDK.C(top), cx = b.x + b.w / 2, R = b.w / 2 - 1.5, y0 = b.top + 2, y1 = b.y + b.h - 2;
        this.objShadow(b, 0.5, 2);
        this.fillRR(b.x - 0.5, y1 - 2.6, b.w + 1, 4, 0.6, this.lin(0, y1 - 2.6, 0, y1 + 1.4, [[0, HDK.t(t, 1.05)], [1, HDK.t(t, 0.7)]]));
        g.fillStyle = this.lin(cx - R, 0, cx + R, 0, [[0, HDK.t(t, 0.78)], [0.3, HDK.t(t, 1.1)], [0.55, t], [1, HDK.t(t, 0.62)]]); g.fillRect(cx - R, y0, R * 2, y1 - y0);
        for (let k = -2; k <= 2; k++) this.line(cx + k * R * 0.38, y0 + 1, cx + k * R * 0.38, y1 - 2, HDK.css(HDK.t(t, 0.7), 0.5), 0.35);
        this.fillRR(b.x - 0.5, b.top - 1, b.w + 1, b.h * 0.6 + 2, 0.8, this.lin(b.x, b.top, b.x + b.w, b.top + b.h, [[0, HDK.t(t, 1.15)], [1, HDK.t(t, 0.85)]]));
        this.line(b.x + 0.5, b.top - 0.4, b.x + b.w - 0.5, b.top - 0.4, 'rgba(255,255,255,0.6)', 0.4);
        this.strokeRR(b.x - 0.5, b.top - 1, b.w + 1, b.h * 0.6 + 2, 0.8, HDA.OUT, 0.45);
        g.strokeStyle = HDA.OUT; g.lineWidth = 0.45; g.strokeRect(cx - R, y0 + b.h * 0.6, R * 2, y1 - y0 - b.h * 0.6 - 2);
        void front;
    },

    // ================================================================= BALCÃO
    p_counter(op, r, h, top, front, items = []) {
        const S = this.S, b = S.base(r, h), g = this.g, tm = HDK.mat(top), fm = HDK.mat(front);
        this.prism(b, top, front, { topMat: tm === 'paint' ? 'stone' : tm, frontMat: fm });
        // frente em painéis (almofadas verticais) e a borda boleada do tampo
        if (b.hp > 2) for (let i = 6; i < b.w - 4; i += 18) { this.line(b.x + i, b.fy + 0.8, b.x + i, b.y + b.h - 0.8, HDK.css(HDK.t(front, 0.45), 0.8), 0.45); this.line(b.x + i + 0.5, b.fy + 0.8, b.x + i + 0.5, b.y + b.h - 0.8, HDK.css(HDK.t(front, 1.3), 0.3), 0.25); }
        g.fillStyle = this.lin(0, b.fy - 1.6, 0, b.fy + 0.6, [[0, HDK.t(top, 1.0), 0], [0.6, HDK.t(top, 1.4), 0.55], [1, HDK.t(top, 0.7), 0.6]]); g.fillRect(b.x + 0.6, b.fy - 1.6, b.w - 1.2, 2.2);
        const rng = Pixel.rng(Math.round(b.x * 31 + b.y)); let px = b.x + 6;
        for (const it of items) {
            const y = b.top + 3 + Math.floor(rng() * Math.max(1, b.h - 22));
            px += this.item(it, px, y, rng) + 5;
            if (px > b.x + b.w - 8) break;
        }
    },
    // Objetos de balcão em alta. Devolve a largura usada (px da arte).
    item(it, x, y, rng) {
        const g = this.g;
        if (it === 'register') {                                  // caixa registradora
            this.soft(x + 1, y + 1.5, 20, 17, 0.45, 1.6, 1.5);
            this.fillRR(x, y + 9, 20, 9, 1.2, this.lin(0, y + 9, 0, y + 18, [[0, [74, 78, 88]], [1, [34, 36, 42]]]));
            this.fillRR(x, y, 20, 12, 1.4, this.lin(0, y, 0, y + 12, [[0, [92, 96, 108]], [1, [46, 48, 56]]]));
            this.fillRR(x + 1.6, y + 1.4, 10, 4.6, 0.6, '#0e1a14'); this.fillRR(x + 2.2, y + 2, 8.8, 3.4, 0.4, this.lin(0, y + 2, 0, y + 5.4, [[0, [120, 230, 160]], [1, [50, 160, 100]]]));
            g.fillStyle = 'rgba(200,255,220,0.8)'; for (let k = 0; k < 4; k++) g.fillRect(x + 3 + k * 1.8, y + 3.2, 1, 1.2);
            for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) this.fillRR(x + 2 + i * 2.3, y + 7 + j * 1.6, 1.8, 1.2, 0.3, j === 2 && i === 3 ? '#d84a3a' : '#c8ccd4');
            this.fillRR(x + 13, y + 1.6, 5.5, 9, 0.8, this.lin(0, y, 0, y + 10, [[0, [180, 186, 196]], [1, [120, 126, 136]]]));
            this.line(x + 1, y + 15, x + 19, y + 15, 'rgba(0,0,0,0.5)', 0.4);
            this.strokeRR(x, y, 20, 18, 1.4, HDA.OUT, 0.45);
            return 20;
        }
        if (it === 'cups') {                                      // copos de papel com a faixa da marca
            for (let k = 0; k < 4; k++) { const cx = x + 2.6 + k * 6; this.softEll(cx + 0.8, y + 6.5, 2.6, 1.2, 0.35, 1); this.fillRR(cx - 2.4, y + 1.5, 4.8, 5.4, 0.8, this.lin(cx - 2.4, 0, cx + 2.4, 0, [[0, [255, 252, 244]], [1, [206, 200, 188]]])); g.fillStyle = '#d9453a'; g.fillRect(cx - 2.4, y + 3.4, 4.8, 1.4); this.ell(cx, y + 1.6, 2.4, 1.1, '#f4f0e6'); this.ell(cx, y + 1.6, 1.8, 0.7, '#5a3420'); }
            return 24;
        }
        if (it === 'bottles') { for (let k = 0; k < 3; k++) this.bottleHD(x + 1.5 + k * 6, y + 13, ['#3f9a52', '#8a4ab0', '#d9a020'][k], 10); return 18; }
        if (it === 'tray') {                                      // bandeja com lanche
            this.soft(x + 1, y + 1, 22, 12, 0.35, 1.4, 1.5);
            this.fillRR(x, y, 22, 12, 1.6, this.lin(x, y, x + 22, y + 12, [[0, [228, 232, 238]], [1, [140, 146, 156]]])); this.strokeRR(x, y, 22, 12, 1.6, 'rgba(60,64,72,0.9)', 0.45);
            this.circ(x + 6.5, y + 6, 3.6, '#c88a40'); this.circ(x + 6.5, y + 5.4, 3.1, '#e0a858'); this.ell(x + 6.5, y + 6.6, 3.4, 0.7, '#5a2e14');
            this.fillRR(x + 12, y + 3, 7, 6, 0.8, '#d03a2a'); for (let k = 0; k < 4; k++) this.fillRR(x + 13 + k * 1.4, y + 1.4, 0.9, 3.6, 0.3, '#f2c040');
            return 22;
        }
        if (it === 'bell') { this.softEll(x + 4, y + 5.2, 3.4, 1.3, 0.4, 1); this.ell(x + 3.5, y + 4.6, 3.4, 1.2, '#7a5a20'); g.beginPath(); g.ellipse(x + 3.5, y + 4.4, 3, 3.2, 0, Math.PI, 0); g.fillStyle = this.rad(x + 2.4, y + 2.4, 0.2, 3.6, [[0, [255, 240, 170]], [1, [190, 140, 40]]]); g.fill(); this.circ(x + 3.5, y + 0.9, 0.7, '#e8c050'); return 8; }
        if (it === 'jar') { this.softEll(x + 5.5, y + 10.5, 4.6, 1.5, 0.35, 1); this.fillRR(x, y + 1.4, 9, 9.6, 1.6, 'rgba(200,228,242,0.55)'); this.fillRR(x + 0.8, y + 4.6, 7.4, 5.8, 1, '#d9a050'); for (let k = 0; k < 6; k++) this.circ(x + 2 + (k % 3) * 2.5, y + 6 + (k / 3 | 0) * 2.4, 0.8, ['#e04a3a', '#f0c040', '#5ab04a'][k % 3]); this.ell(x + 4.5, y + 1.6, 4.4, 1.2, '#8a6a40'); this.line(x + 1.5, y + 3, x + 1.5, y + 9.5, 'rgba(255,255,255,0.7)', 0.5); this.strokeRR(x, y + 1.4, 9, 9.6, 1.6, 'rgba(60,80,96,0.8)', 0.4); return 10; }
        if (it === 'cake') {
            this.softEll(x + 10, y + 11.5, 9.5, 2, 0.35, 1.2);
            this.ell(x + 9, y + 10, 9.6, 2.4, '#e8e4dc');
            this.fillRR(x + 1, y + 4, 16, 7, 1.6, this.lin(0, y + 4, 0, y + 11, [[0, [240, 220, 180]], [1, [190, 160, 110]]]));
            this.ell(x + 9, y + 4.4, 8, 2.6, '#6a3a20'); this.ell(x + 9, y + 4, 7.4, 2.1, '#8a4a2a');
            for (let k = 0; k < 5; k++) this.circ(x + 3.5 + k * 2.8, y + 3.6 + (k % 2) * 0.8, 0.8, '#d9453a');
            this.strokeRR(x + 1, y + 2, 16, 9, 1.6, HDA.OUT, 0.35);
            return 18;
        }
        if (it === 'phone') { this.soft(x + 0.8, y + 1, 8, 12, 0.4, 1, 1); this.fillRR(x, y, 8, 12, 1.4, '#20232a'); this.fillRR(x + 0.8, y + 1, 6.4, 8.4, 0.6, this.lin(x, y, x + 7, y + 9, [[0, [120, 200, 240]], [1, [40, 110, 170]]])); for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) this.fillRR(x + 1.2 + i * 2, y + 10 + j * 0.9, 1.4, 0.6, 0.2, '#6a6e78'); return 8; }
        if (it === 'money') { for (let k = 2; k >= 0; k--) { const yy = y + k * 1.4; this.soft(x + 0.6, yy + 0.8, 14, 8, 0.25, 0.8, 0.6); this.fillRR(x + k * 0.6, yy, 14, 8, 0.5, this.lin(x, yy, x + 14, yy + 8, [[0, [128, 188, 128]], [1, [80, 140, 90]]])); this.strokeRR(x + k * 0.6 + 1, yy + 1, 12, 6, 0.4, 'rgba(40,90,50,0.7)', 0.3); this.circ(x + k * 0.6 + 7, yy + 4, 1.6, 'rgba(60,110,70,0.6)'); } return 15; }
        if (it === 'scale') { this.soft(x + 1, y + 1, 14, 10, 0.4, 1, 1); this.fillRR(x, y, 14, 10, 1.2, this.lin(0, y, 0, y + 10, [[0, [236, 238, 240]], [1, [150, 154, 160]]])); this.fillRR(x + 1.6, y + 1.6, 7, 3.4, 0.4, '#1a2a1e'); g.fillStyle = '#7ae09a'; g.fillRect(x + 2.3, y + 2.4, 5, 1.6); this.ell(x + 7, y + 7.5, 5, 1.6, 'rgba(255,255,255,0.6)'); this.strokeRR(x, y, 14, 10, 1.2, HDA.OUT, 0.4); return 14; }
        return 6;
    },
    bottleHD(x, y, col, h = 9) {
        const g = this.g, c = HDK.C(col);
        this.softEll(x + 2.3, y + 0.4, 2.6, 0.9, 0.35, 0.8);
        this.fillRR(x, y - h, 3.2, h, 1, this.lin(x, 0, x + 3.2, 0, [[0, HDK.t(c, 1.35)], [0.35, c], [1, HDK.t(c, 0.55)]]));
        this.fillRR(x + 0.95, y - h - 3.4, 1.3, 3.8, 0.4, HDK.css(HDK.t(c, 0.9)));
        this.fillRR(x + 0.85, y - h - 3.8, 1.5, 0.9, 0.3, '#e8d8a0');
        this.fillRR(x + 0.2, y - h * 0.55, 2.8, h * 0.32, 0.3, '#efe6cc');
        this.line(x + 0.7, y - h + 1, x + 0.7, y - 1.2, 'rgba(255,255,255,0.55)', 0.35);
    },
    p_bottle(op, px, py, col, h = 9) { this.bottleHD(px, py, col, h); },
    p_plate(op, px, py, fancy = false) {
        this.softEll(px + 0.9, py + 1, 5.2, 4, 0.3, 1);
        this.circ(px + 0.5, py + 0.5, 5.4, fancy ? '#fbfbf6' : '#ecece6'); this.g.lineWidth = 0.35; this.g.strokeStyle = 'rgba(120,120,110,0.8)'; this.g.stroke();
        this.circ(px + 0.5, py + 0.5, 3.6, this.rad(px, py, 0, 4, [[0, fancy ? [236, 228, 210] : [214, 196, 150]], [1, fancy ? [250, 248, 240] : [232, 226, 212]]]));
        if (!fancy) { this.circ(px + 0.2, py + 0.3, 2.2, '#c8803a'); this.circ(px - 0.6, py, 0.6, '#d9453a'); this.circ(px + 1, py + 0.8, 0.6, '#3f8a3a'); }
    },
    p_glass(op, px, py, col = '#cfe4f2') {
        const c = HDK.C(col);
        this.softEll(px + 2, py + 0.6, 2.2, 0.9, 0.3, 0.8);
        this.fillRR(px, py - 5.2, 3.2, 5.4, 0.8, `rgba(${c[0]},${c[1]},${c[2]},0.6)`);
        this.ell(px + 1.6, py - 5.1, 1.6, 0.6, 'rgba(255,255,255,0.9)');
        this.line(px + 0.7, py - 4.4, px + 0.7, py - 0.8, 'rgba(255,255,255,0.8)', 0.35);
    },

    // ================================================================= MESA E ASSENTOS
    p_table(op, cx, cz, w, d, cloth = 'wood', col = null) {
        const S = this.S, g = this.g, b = S.base([cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2], 0.85), rng = Pixel.rng(Math.round(cx * 97 + cz * 31));
        this.objShadow(b, 0.45, 2);
        if (cloth === 'check' || cloth === 'white') {
            const chk = cloth === 'check', red = [206, 58, 50], wht = [246, 241, 230], sk = b.hp + 3.5, fy = b.fy - 0.8;
            // pernas aparecendo embaixo da toalha
            for (const lx of [b.x + 2, b.x + b.w - 3.6]) this.fillRR(lx, b.y + b.h + 1.4, 1.6, 2.2, 0.4, '#3a2414');
            // saia da toalha (frente), com a barra ondulada
            g.save();
            g.beginPath(); g.moveTo(b.x - 0.6, fy);
            g.lineTo(b.x + b.w + 0.6, fy); g.lineTo(b.x + b.w + 0.9, fy + sk);
            for (let xx = b.x + b.w + 0.9; xx >= b.x - 0.9; xx -= 1.5) g.lineTo(xx, fy + sk + Math.sin(xx * 1.3) * 0.5);
            g.closePath(); g.save(); g.clip();
            g.fillStyle = HDK.css(wht); g.fillRect(b.x - 1, fy, b.w + 2, sk + 1);
            if (chk) { const s = 3.4; g.fillStyle = HDK.css(red); for (let j = 0; j * s < sk + 1; j++) for (let i = 0; i * s < b.w + 2; i++) if ((i + j) % 2 === 0) g.fillRect(b.x - 1 + i * s, fy + j * s * 0.75, s, s * 0.75); }
            else for (let xx = b.x + 2; xx < b.x + b.w; xx += 3) this.line(xx, fy, xx + 0.3, fy + sk, 'rgba(150,140,125,0.35)', 0.4);
            g.fillStyle = this.lin(0, fy, 0, fy + sk, [[0, [0, 0, 0], 0.05], [1, [0, 0, 0], 0.4]]); g.fillRect(b.x - 1, fy, b.w + 2, sk + 1);
            g.restore(); g.strokeStyle = chk ? 'rgba(90,20,18,0.8)' : 'rgba(80,72,60,0.7)'; g.lineWidth = 0.45; g.stroke(); g.restore();
            // tampo coberto, sobrando um pouco nos lados
            const tx = b.x - 0.6, ty = b.top - 0.4, tw = b.w + 1.2, th = b.h + 0.4;
            this.rr(tx, ty, tw, th, 1.2); g.save(); g.clip();
            g.fillStyle = HDK.css(wht); g.fillRect(tx, ty, tw, th);
            if (chk) { const s = 3.4; g.fillStyle = HDK.css(red); for (let j = 0; j * s < th; j++) for (let i = 0; i * s < tw; i++) if ((i + j) % 2 === 0) g.fillRect(tx + i * s, ty + j * s, s, s); }
            g.fillStyle = this.lin(tx, ty, tx + tw, ty + th, [[0, [255, 255, 255], 0.16], [0.5, [255, 255, 255], 0], [1, [0, 0, 0], 0.14]]); g.fillRect(tx, ty, tw, th);
            for (let k = 0; k < 3; k++) { const yy = ty + th * (0.2 + 0.3 * k) + rng() * 2; g.fillStyle = this.lin(0, yy - 1, 0, yy + 1.2, [[0, [0, 0, 0], 0], [0.5, [0, 0, 0], 0.07], [1, [0, 0, 0], 0]]); g.fillRect(tx, yy - 1, tw, 2.2); }
            this.grain(tx, ty, tw, th, 0.18, 17);
            g.restore();
            this.strokeRR(tx, ty, tw, th, 1.2, chk ? 'rgba(90,20,18,0.75)' : 'rgba(80,72,60,0.65)', 0.4);
            if (chk) {                                            // saleiro, paliteiro e às vezes um prato
                const sx = b.x + b.w * (0.35 + rng() * 0.3), sy = b.top + b.h * (0.3 + rng() * 0.35);
                this.shaker(sx, sy, '#e8e8e0'); this.shaker(sx + 2.6, sy + 0.6, '#3a3a3a');
                if (rng() < 0.45) this.p_plate(null, Math.round(b.x + b.w * 0.3), Math.round(b.top + b.h * 0.65), false);
            }
            return;
        }
        // madeira: tampo de tábuas com veio, avental na frente e as pernas
        const wc = HDK.C(col || '#8a6238');
        for (const lx of [b.x + 1, b.x + b.w - 2.8]) this.fillRR(lx, b.y + b.h - 1, 1.8, 2.6, 0.4, HDK.css(HDK.t(wc, 0.5)));
        const fy = b.fy - 0.8, fh = b.hp + 0.8;
        this.fillRR(b.x + 0.4, fy, b.w - 0.8, fh, 0.6, this.lin(0, fy, 0, fy + fh, [[0, HDK.t(wc, 0.78)], [1, HDK.t(wc, 0.5)]]));
        this.fillRR(b.x, b.top, b.w, b.h, 1.2, this.lin(b.x, b.top, b.x + b.w, b.top + b.h, [[0, HDK.t(wc, 1.18)], [1, HDK.t(wc, 0.92)]]));
        this.clip(b.x, b.top, b.w, b.h, () => {
            const n = Math.max(2, Math.round(b.w / 9));
            for (let i = 1; i < n; i++) { const xx = b.x + b.w * i / n; this.line(xx, b.top, xx, b.top + b.h, HDK.css(HDK.t(wc, 0.55), 0.7), 0.35); }
            for (let k = 0; k < b.w / 1.3; k++) { const xx = b.x + 0.6 + k * 1.3 + rng() * 0.4, ph = rng() * 6; g.beginPath(); g.moveTo(xx, b.top); for (let yy = b.top; yy <= b.top + b.h; yy += 3) g.lineTo(xx + Math.sin(yy * 0.1 + ph) * 0.35, yy); g.strokeStyle = HDK.css(HDK.t(wc, 0.72), 0.25); g.lineWidth = 0.18; g.stroke(); }
            this.grain(b.x, b.top, b.w, b.h, 0.16, 18);
        });
        this.line(b.x + 1, b.fy - 0.4, b.x + b.w - 1, b.fy - 0.4, HDK.css(HDK.t(wc, 1.4), 0.6), 0.4);
        this.strokeRR(b.x, b.top, b.w, b.h + b.hp, 1.2, HDA.OUT, 0.5);
    },
    shaker(x, y, cap) { this.softEll(x + 0.8, y + 2.6, 1.2, 0.5, 0.35, 0.5); this.fillRR(x - 0.9, y - 1.2, 1.8, 3.6, 0.6, this.lin(x - 1, 0, x + 1, 0, [[0, [250, 252, 255]], [1, [180, 190, 200]]])); this.ell(x, y - 1.2, 0.9, 0.45, cap); },

    // Cadeira de madeira: assento de ripas, pernas e o encosto de travessas do lado `face`.
    p_chair(op, x, z, face = 's', col = '#7a5230') {
        const S = this.S, px = S.X(x), py = S.Y(z), c = HDK.C(col), dk = HDK.t(c, 0.55);
        this.soft(px - 4, py + 1.5, 13, 10, 0.5, 2.6, 2); this.soft(px - 6, py + 3.5, 12.5, 3.2, 0.4, 1.2, 1);
        const leg = (lx, ly, lh) => this.fillRR(lx, ly, 1.7, lh, 0.5, this.lin(lx, 0, lx + 1.7, 0, [[0, HDK.t(c, 0.95)], [1, dk]]));
        leg(px - 5.3, py + 3.6, 5.4); leg(px + 3.6, py + 3.6, 5.4);
        const back = (bx, by, bw, bh, vert) => {
            this.fillRR(bx, by, bw, bh, 0.6, this.lin(bx, by, bx + (vert ? bw : 0), by + (vert ? 0 : bh), [[0, HDK.t(c, 1.15)], [1, HDK.t(c, 0.7)]]));
            const g = this.g; g.save(); this.rr(bx, by, bw, bh, 0.6); g.clip();
            if (vert) for (let yy = by + 3; yy < by + bh - 1; yy += 3.2) this.line(bx, yy, bx + bw, yy, HDK.css(dk, 0.9), 0.5);
            else for (let xx = bx + 3; xx < bx + bw - 1; xx += 3) this.line(xx, by + 0.9, xx, by + bh - 0.9, HDK.css(dk, 0.9), 0.5);
            g.restore();
            this.strokeRR(bx, by, bw, bh, 0.6, HDA.OUT, 0.42);
        };
        if (face === 's') back(px - 6, py - 13, 12, 4.6, false);
        else if (face === 'e') back(px - 8, py - 11, 3, 13, true);
        else if (face === 'w') back(px + 5, py - 11, 3, 13, true);
        // assento: 3 ripas e a espessura na frente
        this.fillRR(px - 6, py + 3, 12, 2, 0.5, HDK.css(dk));
        this.fillRR(px - 6, py - 6, 12, 10, 1, this.lin(px - 6, py - 6, px + 6, py + 4, [[0, HDK.t(c, 1.2)], [1, HDK.t(c, 0.88)]]));
        for (let k = 1; k < 3; k++) this.line(px - 5.6, py - 6 + k * 3.33, px + 5.6, py - 6 + k * 3.33, HDK.css(dk, 0.75), 0.35);
        this.grain(px - 6, py - 6, 12, 10, 0.18, 19);
        this.line(px - 5, py - 5.5, px + 5, py - 5.5, HDK.css(HDK.t(c, 1.45), 0.5), 0.35);
        this.strokeRR(px - 6, py - 6, 12, 11, 1, HDA.OUT, 0.45);
        if (face === 'n') back(px - 6, py + 2, 12, 4.6, false);
    },
    // Banqueta de bar: assento estofado redondo, coluna cromada e o pé.
    p_stool(op, x, z) {
        const S = this.S, px = S.X(x) + 0.5, py = S.Y(z), g = this.g;
        this.softEll(px + 1.5, py + 4, 7, 4, 0.4, 2);
        this.ell(px, py + 9, 5.6, 1.8, this.lin(px - 5, 0, px + 5, 0, [[0, [70, 74, 84]], [1, [28, 30, 36]]]));
        this.fillRR(px - 1.2, py - 2, 2.4, 11, 0.8, this.lin(px - 1.2, 0, px + 1.2, 0, [[0, [230, 234, 240]], [0.4, [150, 156, 166]], [1, [60, 64, 72]]]));
        this.ell(px, py - 3.4, 6.6, 6.2, '#3a1a14');
        this.ell(px, py - 4.4, 6.2, 5.8, this.rad(px - 2, py - 7, 0.5, 7.5, [[0, [236, 110, 96]], [0.6, [184, 56, 44]], [1, [120, 32, 24]]]));
        g.beginPath(); g.ellipse(px, py - 4.4, 4.6, 4.2, 0, 0, Math.PI * 2); g.strokeStyle = 'rgba(90,20,14,0.5)'; g.lineWidth = 0.3; g.stroke();
        g.beginPath(); g.ellipse(px, py - 4.2, 6.4, 6.0, 0, 0, Math.PI * 2); g.strokeStyle = HDA.OUT; g.lineWidth = 0.45; g.stroke();
    },
    // Vaso com planta: cachepô de barro e folhagem em camadas.
    p_plant(op, x, z, big = true) {
        const S = this.S, px = S.X(x) + 0.5, py = S.Y(z), g = this.g, rng = Pixel.rng(Math.round(px * 17 + py * 3)), R = big ? 11 : 7.5;
        this.softEll(px + 2, py + 6.5, 8, 3.5, 0.45, 2);
        g.beginPath(); g.moveTo(px - 6, py - 1.5); g.lineTo(px + 6, py - 1.5); g.lineTo(px + 4.8, py + 8.6); g.lineTo(px - 4.8, py + 8.6); g.closePath();
        g.fillStyle = this.lin(px - 6, 0, px + 6, 0, [[0, [214, 126, 90]], [0.45, [178, 92, 58]], [1, [110, 52, 30]]]); g.fill(); g.strokeStyle = HDA.OUT; g.lineWidth = 0.45; g.stroke();
        this.ell(px, py - 1.6, 6.4, 1.9, '#c07050'); this.ell(px, py - 1.5, 5.2, 1.3, '#3a2616');
        const greens = [[46, 112, 52], [63, 138, 58], [38, 96, 46], [88, 168, 80], [52, 126, 60]];
        for (let layer = 0; layer < 3; layer++) {
            const n = big ? 16 : 10;
            for (let k = 0; k < n; k++) {
                const an = rng() * Math.PI * 2, d = (0.25 + rng() * 0.75) * R * (1 - layer * 0.22), lx = px + Math.cos(an) * d * 0.9, ly = py - 8 - (big ? 2 : 0) + Math.sin(an) * d * 0.6 - layer * 1.5;
                const col = greens[(k + layer) % greens.length], L = (big ? 4.2 : 3.2) * (1 - layer * 0.12), rot = an + (rng() - 0.5) * 0.8;
                g.save(); g.translate(lx, ly); g.rotate(rot);
                g.beginPath(); g.ellipse(0, 0, L, L * 0.42, 0, 0, Math.PI * 2);
                g.fillStyle = this.lin(-L, 0, L, 0, [[0, HDK.t(col, 0.7 + layer * 0.12)], [1, HDK.t(col, 1.05 + layer * 0.12)]]); g.fill();
                g.strokeStyle = 'rgba(20,50,20,0.5)'; g.lineWidth = 0.25; g.stroke();
                g.beginPath(); g.moveTo(-L * 0.8, 0); g.lineTo(L * 0.8, 0); g.strokeStyle = HDK.css(HDK.t(col, 1.35), 0.45); g.lineWidth = 0.2; g.stroke();
                g.restore();
            }
        }
    },

    // ================================================================= PAREDE: quadros, janelas, enfeites
    // Onde fica, na parede alta, uma peça que o layout pôs na faixa baixa (y..y+h): sobe para o meio da parede.
    wallY(y, h) { const top = this.top + 3, bot = this.S.nY - 4; return Math.max(top, Math.min(y, bot - h, top + (bot - top - h) * 0.42)); },
    p_poster(op, x, y, w, h, A, B, kind = 'plain') {
        const g = this.g, wallH = this.S.nY - this.top - 7; h = Math.min(h, wallH); y = this.wallY(y, h);
        const a = HDK.C(A), b = HDK.C(B);
        this.soft(x + 0.8, y + 1.4, w + 1, h + 1, 0.45, 1.6, 0.6);
        this.fillRR(x - 1.2, y - 1.2, w + 2.4, h + 2.4, 0.6, this.lin(0, y, 0, y + h, [[0, [92, 64, 40]], [1, [48, 30, 18]]]));
        g.fillStyle = this.lin(x, y, x + w, y + h, [[0, HDK.t(a, 1.08)], [1, HDK.t(a, 0.9)]]); g.fillRect(x, y, w, h);
        this.clip(x, y, w, h, () => {
            const cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) / 3;
            if (kind === 'burger') {
                this.ell(cx, cy - 2.5, R * 1.1, R * 0.55, '#e0a050'); this.ell(cx, cy - 3.2, R * 0.9, R * 0.28, 'rgba(255,240,200,0.5)');
                this.fillRR(cx - R * 1.15, cy - 0.6, R * 2.3, 1.6, 0.6, '#4a9a3a'); this.fillRR(cx - R * 1.1, cy + 0.8, R * 2.2, 2.4, 1, '#6a3a1a'); this.fillRR(cx - R * 1.05, cy + 3, R * 2.1, 2, 1, '#d9a050');
                g.fillStyle = HDK.css(b); g.fillRect(x + 2, y + h - 5, w - 4, 2);
            } else if (kind === 'lines') {
                g.fillStyle = HDK.css(b, 0.9); for (let j = 4; j < h - 3; j += 4) g.fillRect(x + 3, y + j, w - 6 - (j % 3) * 3, 1.3);
            } else if (kind === 'sun') {
                g.fillStyle = this.rad(cx, cy - 1, 0, R * 1.9, [[0, HDK.t(b, 1.3), 0.5], [1, b, 0]]); g.fillRect(x, y, w, h);
                for (let k = 0; k < 12; k++) { const an = k * Math.PI / 6; this.line(cx + Math.cos(an) * R * 1.15, cy - 1 + Math.sin(an) * R * 1.15, cx + Math.cos(an) * R * 1.6, cy - 1 + Math.sin(an) * R * 1.6, HDK.css(b, 0.8), 0.8); }
                this.circ(cx, cy - 1, R, this.rad(cx - R * 0.3, cy - 1 - R * 0.3, 0.2, R, [[0, HDK.t(b, 1.3)], [1, HDK.t(b, 0.85)]]));
                g.fillStyle = HDK.css(HDK.t(a, 0.45), 0.8); g.fillRect(x + 3, y + h - 4.5, w - 6, 1.2); g.fillRect(x + 6, y + h - 2.6, w - 12, 0.9);
            } else if (kind === 'fruit') {
                this.circ(x + w / 3, cy, 4, '#e8702a'); this.circ(x + 2 * w / 3, cy, 4, '#d9453a'); this.circ(cx, y + h / 3, 3, '#7ac040');
                for (const [fx, fy] of [[x + w / 3, cy], [x + 2 * w / 3, cy], [cx, y + h / 3]]) this.circ(fx - 1, fy - 1.2, 1, 'rgba(255,255,255,0.5)');
            } else if (kind === 'wanted') {
                this.circ(cx, y + h / 3, 4.2, '#2a2a2a'); this.fillRR(cx - 5, y + h / 3 + 3, 10, 6, 2, '#2a2a2a');
                g.fillStyle = HDK.css(b); g.fillRect(x + 3, y + h - 8, w - 6, 2.6); g.fillRect(x + 3, y + h - 4, w - 8, 1.6);
            } else if (kind === 'landscape') {
                g.fillStyle = this.lin(0, y, 0, y + h * 0.55, [[0, [120, 170, 220]], [1, [220, 210, 170]]]); g.fillRect(x, y, w, h * 0.55);
                this.circ(x + w - 6, y + 6, 2.6, '#f8e080');
                g.beginPath(); g.moveTo(x, y + h * 0.55); for (let xx = x; xx <= x + w; xx += 2) g.lineTo(xx, y + h * 0.5 - Math.sin((xx - x) * 0.18) * 3 - Math.sin((xx - x) * 0.07) * 4); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath();
                g.fillStyle = this.lin(0, y + h * 0.4, 0, y + h, [[0, [80, 140, 70]], [1, [40, 90, 44]]]); g.fill();
            }
            g.fillStyle = this.lin(x, y, x + w, y + h, [[0, [255, 255, 255], 0.18], [0.45, [255, 255, 255], 0], [1, [255, 255, 255], 0.06]]); g.fillRect(x, y, w, h);
            this.grain(x, y, w, h, 0.15, 20);
        });
        g.strokeStyle = HDA.OUT; g.lineWidth = 0.45; g.strokeRect(x - 1.2, y - 1.2, w + 2.4, h + 2.4);
    },
    p_window(op, x, y, w, h, day = '#7ab4d8') {
        const g = this.g; h = Math.min(h, this.S.nY - this.top - 8); y = this.wallY(y, h);
        const sky = HDK.C(day);
        this.soft(x, y + 1.2, w + 2, h + 3, 0.45, 1.6, 0.6);
        this.fillRR(x - 2, y - 2, w + 4, h + 4, 0.7, this.lin(0, y, 0, y + h, [[0, [104, 76, 50]], [1, [58, 40, 26]]]));
        g.fillStyle = this.lin(0, y, 0, y + h, [[0, HDK.t(sky, 1.18)], [1, HDK.t(sky, 0.82)]]); g.fillRect(x, y, w, h);
        this.clip(x, y, w, h, () => {
            for (let k = 0; k < 3; k++) { const cx = x + w * (0.2 + k * 0.33), cy = y + h * (0.25 + (k % 2) * 0.15); this.ell(cx, cy, w * 0.12, h * 0.07, 'rgba(255,255,255,0.45)'); }
            g.fillStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.moveTo(x + w * 0.1, y + h); g.lineTo(x + w * 0.38, y); g.lineTo(x + w * 0.52, y); g.lineTo(x + w * 0.24, y + h); g.closePath(); g.fill();
        });
        g.fillStyle = '#4a3220'; g.fillRect(x + w / 2 - 0.8, y, 1.6, h); g.fillRect(x, y + h / 2 - 0.8, w, 1.6);
        this.fillRR(x - 2.6, y + h + 1.4, w + 5.2, 2.4, 0.6, this.lin(0, y + h + 1.4, 0, y + h + 3.8, [[0, [150, 116, 80]], [1, [84, 60, 38]]]));
        g.strokeStyle = HDA.OUT; g.lineWidth = 0.45; g.strokeRect(x - 2, y - 2, w + 4, h + 4);
    },
    // Luminária pendente: fio, cúpula de metal (ou lâmpada pelada) e o halo.
    p_lamp(op, x, z, col = '#fff0b0', shade = null) {
        const S = this.S, g = this.g, px = S.X(x) + 0.5, py = S.Y(z), c = HDK.C(col);
        g.fillStyle = this.lin(0, py - 46, 0, py - 6, [[0, [20, 16, 12], 0], [0.4, [20, 16, 12], 0.85], [1, [20, 16, 12], 0.95]]); g.fillRect(px - 0.25, py - 46, 0.5, 40);
        g.save(); g.globalCompositeOperation = 'screen';
        g.fillStyle = this.rad(px, py, 0, 13, [[0, c, 0.55], [0.4, c, 0.18], [1, c, 0]]); g.fillRect(px - 13, py - 13, 26, 26);
        g.restore();
        if (shade) {
            const s = HDK.C(shade);
            g.beginPath(); g.moveTo(px - 2, py - 9); g.lineTo(px + 2, py - 9); g.lineTo(px + 7.5, py - 2.5); g.lineTo(px - 7.5, py - 2.5); g.closePath();
            g.fillStyle = this.lin(px - 7, 0, px + 7, 0, [[0, HDK.t(s, 1.35)], [0.45, s], [1, HDK.t(s, 0.5)]]); g.fill(); g.strokeStyle = HDA.OUT; g.lineWidth = 0.45; g.stroke();
            this.ell(px, py - 2.4, 7.4, 1.4, this.rad(px, py - 2, 0, 7, [[0, [255, 255, 240]], [0.5, c], [1, HDK.t(c, 0.8)]]));
            this.fillRR(px - 1, py - 10.5, 2, 2, 0.5, '#2a2420');
        } else {
            this.fillRR(px - 1.4, py - 8, 2.8, 3.2, 0.5, '#2a2420');
            this.circ(px, py - 2, 3.2, this.rad(px - 0.8, py - 2.8, 0.2, 3.6, [[0, [255, 255, 255]], [0.5, c], [1, HDK.t(c, 0.8)]]));
        }
    },
    // Enfeites de parede (relógio, quadro, ar-condicionado, placa de saída, extintor, cardápio, TV, neon, arandela…).
    p__wallItem(op, kind, x, y, H) {
        const g = this.g, wallH = this.S.nY - this.top, low = kind === 'ext';
        const yy = low ? this.S.nY - 15 : this.wallY(y, Math.min(H + 6, wallH - 6)), cy = yy + H / 2;
        if (kind === 'clock') {
            this.softEll(x + 9, cy + 1.2, 6, 6, 0.45, 1.4);
            this.circ(x + 8, cy, 6.2, this.lin(0, cy - 6, 0, cy + 6, [[0, [80, 80, 86]], [1, [30, 30, 34]]]));
            this.circ(x + 8, cy, 5.1, this.rad(x + 7, cy - 1, 0.5, 5.4, [[0, [255, 254, 248]], [1, [222, 218, 206]]]));
            for (let k = 0; k < 12; k++) { const an = k * Math.PI / 6; this.line(x + 8 + Math.cos(an) * 4.2, cy + Math.sin(an) * 4.2, x + 8 + Math.cos(an) * (k % 3 ? 4.6 : 3.7), cy + Math.sin(an) * (k % 3 ? 4.6 : 3.7), '#2a2a2a', k % 3 ? 0.25 : 0.45); }
            this.line(x + 8, cy, x + 8, cy - 3.4, '#1a1a1a', 0.5); this.line(x + 8, cy, x + 10.4, cy + 0.8, '#1a1a1a', 0.5); this.line(x + 8, cy, x + 6.2, cy + 2.6, '#c0302a', 0.25); this.circ(x + 8, cy, 0.5, '#c0302a');
        } else if (kind === 'frame' || kind === 'flag') {
            const w = 16, h = Math.min(12, H + 3), A = kind === 'flag' ? [47, 154, 82] : HDK.C(['#3a6aa0', '#c8a040', '#6a8a4a', '#a04a3a', '#4a4a6a'][x % 5]);
            this.soft(x + 0.8, yy + 1.6, w + 2, h + 2, 0.4, 1.4, 0.5);
            this.fillRR(x, yy, w + 2, h + 2, 0.5, kind === 'flag' ? '#f4f4f0' : this.lin(x, yy, x + w, yy + h, [[0, [140, 100, 60]], [1, [70, 46, 26]]]));
            if (kind === 'flag') {
                g.fillStyle = HDK.css(A); g.fillRect(x + 1, yy + 1, w, h);
                g.beginPath(); g.moveTo(x + 1 + w / 2, yy + 2); g.lineTo(x + w - 1, yy + 1 + h / 2); g.lineTo(x + 1 + w / 2, yy + h); g.lineTo(x + 3, yy + 1 + h / 2); g.closePath(); g.fillStyle = '#f2d22c'; g.fill();
                this.circ(x + 1 + w / 2, yy + 1 + h / 2, h * 0.24, '#2a4aa0');
            } else {
                g.fillStyle = this.lin(0, yy + 1, 0, yy + 1 + h, [[0, HDK.t(A, 1.25)], [1, HDK.t(A, 0.7)]]); g.fillRect(x + 1, yy + 1, w, h);
                g.beginPath(); g.moveTo(x + 1, yy + 1 + h); g.lineTo(x + 5, yy + h * 0.55); g.lineTo(x + 9, yy + h * 0.75); g.lineTo(x + 13, yy + h * 0.45); g.lineTo(x + 1 + w, yy + h * 0.7); g.lineTo(x + 1 + w, yy + 1 + h); g.closePath(); g.fillStyle = HDK.css(HDK.t(A, 0.6)); g.fill();
                this.circ(x + w - 3, yy + 4, 1.3, '#f6e6a8');
            }
            g.strokeStyle = HDA.OUT; g.lineWidth = 0.4; g.strokeRect(x, yy, w + 2, h + 2);
        } else if (kind === 'ac') {
            this.soft(x + 0.6, yy + 1.4, 26, 8, 0.35, 1.4, 1);
            this.fillRR(x, yy, 26, 8, 1.6, this.lin(0, yy, 0, yy + 8, [[0, [252, 252, 252]], [1, [196, 200, 206]]]));
            for (let k = 0; k < 4; k++) this.line(x + 2, yy + 5 + k * 0.7, x + 24, yy + 5 + k * 0.7, 'rgba(110,116,126,0.7)', 0.25);
            this.circ(x + 23, yy + 2.4, 0.6, '#3adf6a'); this.strokeRR(x, yy, 26, 8, 1.6, 'rgba(70,74,80,0.8)', 0.4);
        } else if (kind === 'exit') {
            g.save(); g.globalCompositeOperation = 'screen'; g.fillStyle = this.rad(x + 8, yy + 4, 0, 14, [[0, [80, 255, 140], 0.35], [1, [80, 255, 140], 0]]); g.fillRect(x - 6, yy - 10, 28, 28); g.restore();
            this.fillRR(x, yy, 16, 7, 0.8, this.lin(0, yy, 0, yy + 7, [[0, [50, 190, 100]], [1, [20, 120, 60]]]));
            g.fillStyle = '#f4fff6'; g.fillRect(x + 2, yy + 2.6, 4.4, 1.8); g.fillRect(x + 8, yy + 2, 6, 0.9); g.fillRect(x + 8, yy + 3.6, 6, 0.9);
            this.strokeRR(x, yy, 16, 7, 0.8, 'rgba(10,50,24,0.9)', 0.4);
        } else if (kind === 'ext') {
            this.softEll(x + 6.5, yy + H + 3, 3, 1.2, 0.4, 1);
            this.fillRR(x + 1.5, yy - 1, 8, 3.2, 0.6, '#d02a20'); this.fillRR(x + 2.4, yy - 0.2, 6, 1, 0.3, '#ffffff');
            this.fillRR(x + 3.2, yy + 2.4, 5, H + 1.2, 1.8, this.lin(x + 3.2, 0, x + 8.2, 0, [[0, [240, 90, 80]], [0.5, [200, 32, 26]], [1, [120, 14, 10]]]));
            this.fillRR(x + 4.3, yy + 1.2, 2.8, 1.8, 0.4, '#2a2a2a'); this.line(x + 7, yy + 2, x + 9.4, yy + 5, '#1a1a1a', 0.5);
        } else if (kind === 'menu') {
            const h = Math.min(14, H + 4);
            this.soft(x + 0.8, yy + 1.4, 23, h + 1, 0.4, 1.4, 0.5);
            this.fillRR(x, yy, 22, h, 0.6, '#262a28'); this.strokeRR(x, yy, 22, h, 0.6, '#8a6a48', 0.9);
            for (let k = 0; k < Math.floor((h - 3) / 2.6); k++) { g.fillStyle = 'rgba(236,232,214,0.85)'; g.fillRect(x + 2.2, yy + 2.4 + k * 2.6, 12 - (k % 3) * 2, 0.8); g.fillStyle = 'rgba(232,184,80,0.9)'; g.fillRect(x + 16, yy + 2.4 + k * 2.6, 4, 0.8); }
        } else if (kind === 'tv') {
            const h = Math.min(15, H + 4);
            this.soft(x + 0.8, yy + 1.4, 27, h + 1, 0.45, 1.6, 0.6);
            this.fillRR(x, yy, 26, h, 0.8, '#0e1012');
            g.fillStyle = this.lin(0, yy, 0, yy + h, [[0, [60, 120, 190]], [0.55, [120, 170, 220]], [0.56, [60, 140, 60]], [1, [40, 100, 44]]]); g.fillRect(x + 1, yy + 1, 24, h - 2);
            this.circ(x + 13, yy + h * 0.62, 0.9, '#ffffff');
            g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(x + 1, yy + 1); g.lineTo(x + 12, yy + 1); g.lineTo(x + 6, yy + h - 1); g.lineTo(x + 1, yy + h - 1); g.closePath(); g.fill();
            g.save(); g.globalCompositeOperation = 'screen'; g.fillStyle = this.rad(x + 13, yy + h / 2, 0, 22, [[0, [120, 170, 255], 0.18], [1, [120, 170, 255], 0]]); g.fillRect(x - 10, yy - 10, 46, h + 20); g.restore();
        } else if (kind === 'neon') {
            const col = x % 2 ? [255, 70, 190] : [70, 210, 255];
            g.save(); g.globalCompositeOperation = 'screen'; g.fillStyle = this.rad(x + 12, cy, 0, 20, [[0, col, 0.4], [1, col, 0]]); g.fillRect(x - 10, cy - 20, 44, 40); g.restore();
            g.beginPath(); for (let i = 0; i <= 24; i++) g.lineTo(x + i, cy - 1 + Math.sin(i * 0.7) * 2); g.strokeStyle = HDK.css(col, 0.5); g.lineWidth = 2; g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 0.55; g.stroke();
            this.line(x + 2, cy + 3.5, x + 22, cy + 3.5, HDK.css(col, 0.6), 1.6); this.line(x + 2, cy + 3.5, x + 22, cy + 3.5, 'rgba(255,255,255,0.9)', 0.45);
        } else if (kind === 'sconce') {
            g.save(); g.globalCompositeOperation = 'screen'; g.fillStyle = this.rad(x + 8, yy + 2, 0, 16, [[0, [255, 220, 150], 0.45], [1, [255, 220, 150], 0]]); g.fillRect(x - 8, yy - 14, 32, 34); g.restore();
            this.fillRR(x + 6, yy + 3, 4, 5, 0.6, this.lin(x + 6, 0, x + 10, 0, [[0, [210, 170, 80]], [1, [120, 90, 40]]]));
            g.beginPath(); g.moveTo(x + 4.5, yy + 3); g.lineTo(x + 11.5, yy + 3); g.lineTo(x + 10, yy - 1.5); g.lineTo(x + 6, yy - 1.5); g.closePath(); g.fillStyle = this.lin(0, yy - 1.5, 0, yy + 3, [[0, [255, 246, 220]], [1, [240, 210, 150]]]); g.fill(); g.strokeStyle = HDA.OUT; g.lineWidth = 0.35; g.stroke();
        } else if (kind === 'mirror') {
            const h = Math.min(16, wallH - 8);
            this.soft(x + 0.6, yy + 1.4, 15, h + 1, 0.4, 1.4, 1);
            this.fillRR(x, yy, 14, h, 1.6, this.lin(x, yy, x + 14, yy + h, [[0, [236, 200, 100]], [1, [150, 110, 40]]]));
            this.fillRR(x + 1.2, yy + 1.2, 11.6, h - 2.4, 1, this.lin(x, yy, x + 14, yy + h, [[0, [214, 232, 240]], [1, [150, 176, 190]]]));
            g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.moveTo(x + 3, yy + h - 2); g.lineTo(x + 7, yy + 2); g.lineTo(x + 9, yy + 2); g.lineTo(x + 5, yy + h - 2); g.closePath(); g.fill();
        } else if (kind === 'target') {
            this.soft(x + 0.6, yy + 1.2, 15, H + 1, 0.35, 1.2, 0.4);
            this.fillRR(x, yy, 14, H + 2, 0.4, '#ece6d6');
            for (let k = 4; k > 0; k--) this.circ(x + 7, cy + 1, k * 1.25, k % 2 ? '#1a1a1a' : '#ece6d6');
            this.circ(x + 7, cy + 1, 0.6, '#c0302a');
        } else if (kind === 'calendar') {
            this.soft(x + 0.6, yy + 1.2, 12, H + 1, 0.35, 1.2, 0.4);
            this.fillRR(x, yy, 11, H + 2, 0.4, '#f6f2ea'); g.fillStyle = '#c0302a'; g.fillRect(x, yy, 11, 3);
            g.fillStyle = '#8a8a8a'; for (let j = 4.5; j < H; j += 1.8) for (let i = 1.2; i < 10; i += 1.8) g.fillRect(x + i, yy + j, 0.9, 0.9);
        } else return false;
    },
});

// ================================================================= PEÇAS ESPECIAIS (pizzaria, escritório dos fundos)
Object.assign(HDPainter.prototype, {
    // Tijolos num retângulo (com recorte já aplicado por quem chama): fiadas desencontradas e argamassa.
    bricks(x, y, w, h, col, rng, bw = 7.5, bh = 3.2, mortar = null) {
        const g = this.g, c = HDK.C(col);
        g.fillStyle = HDK.css(mortar || HDK.mix(HDK.t(c, 0.55), [150, 135, 120], 0.3)); g.fillRect(x, y, w, h);
        for (let r = 0; r * bh < h + bh; r++) {
            const yy = y + h - (r + 1) * bh;
            for (let k = -1; k * bw < w + bw; k++) {
                const xx = x + k * bw + (r % 2) * bw / 2, cc = HDK.t(c, 0.82 + rng() * 0.32);
                this.fillRR(xx + 0.35, yy + 0.35, bw - 0.7, bh - 0.7, 0.45, this.lin(0, yy, 0, yy + bh, [[0, HDK.t(cc, 1.15)], [0.35, cc], [1, HDK.t(cc, 0.78)]]));
                if (rng() < 0.2) this.ell(xx + 1 + rng() * (bw - 2), yy + 0.8 + rng() * (bh - 1.6), 0.35 + rng() * 0.5, 0.25 + rng() * 0.3, HDK.css(HDK.t(cc, 0.65), 0.6));
            }
        }
    },
    // Forno a lenha: base de tijolo com a boca em arco e o fogo, coifa de tijolo em degraus e a chaminé de metal.
    p_oven(op, r, h = 2.0) {
        const S = this.S, g = this.g, b = S.base(r, h), rng = Pixel.rng(Math.round(b.x * 3 + b.y)), brick = [176, 84, 50];
        const x0 = b.x, x1 = b.x + b.w, yb = b.y + b.h, frontTop = b.fy - 16, mx = b.x + b.w / 2;
        this.objShadow(b, 0.55, 3);
        // base (parede da frente, alta) com a boca
        this.clip(x0, frontTop, b.w, yb - frontTop, () => {
            this.bricks(x0, frontTop, b.w, yb - frontTop, brick, rng);
            g.fillStyle = this.lin(0, frontTop, 0, yb, [[0, [0, 0, 0], 0], [1, [0, 0, 0], 0.35]]); g.fillRect(x0, frontTop, b.w, yb - frontTop);
        });
        // coifa: três faces em degraus subindo até a chaminé (a da frente clara, as laterais em sombra)
        const ht = b.top + 3, cw = Math.min(26, b.w * 0.3), facets = [
            { p: [[x0 + 1, frontTop], [mx - cw / 2, ht], [mx + cw / 2, ht], [x1 - 1, frontTop]], k: 1.0 },
        ];
        for (const f of facets) {
            g.save(); g.beginPath(); f.p.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath(); g.clip();
            this.bricks(x0, ht, b.w, frontTop - ht, HDK.t(brick, f.k * 1.05), rng, 7, 3);
            // degraus: faixas de sombra horizontais (cada fiada recua)
            for (let yy = frontTop - 3.2; yy > ht; yy -= 6.4) { g.fillStyle = this.lin(0, yy - 1, 0, yy + 1.4, [[0, [0, 0, 0], 0], [1, [0, 0, 0], 0.22]]); g.fillRect(x0, yy - 1, b.w, 2.4); }
            // laterais em sombra: degradê dos cantos para o meio
            g.fillStyle = this.lin(x0, 0, x1, 0, [[0, [255, 230, 200], 0.12], [0.3, [0, 0, 0], 0], [0.7, [0, 0, 0], 0], [1, [0, 0, 0], 0.38]]); g.fillRect(x0, ht, b.w, frontTop - ht);
            g.restore();
            g.beginPath(); f.p.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath(); g.strokeStyle = HDA.OUT; g.lineWidth = 0.5; g.stroke();
        }
        // linhas das arestas da coifa
        this.line(x0 + 1, frontTop, mx - cw / 2, ht, 'rgba(255,220,190,0.35)', 0.5); this.line(x1 - 1, frontTop, mx + cw / 2, ht, 'rgba(0,0,0,0.35)', 0.5);
        // friso de topo da base
        this.fillRR(x0 - 0.6, frontTop - 1.6, b.w + 1.2, 2.4, 0.6, this.lin(0, frontTop - 1.6, 0, frontTop + 0.8, [[0, HDK.t(brick, 1.25)], [1, HDK.t(brick, 0.7)]]));
        // boca em arco com o fogo
        const aw = Math.min(30, b.w * 0.3), ah = Math.min(16, yb - frontTop - 2), ay = yb - 1.5;
        g.beginPath(); g.moveTo(mx - aw / 2 - 2.4, ay); g.lineTo(mx - aw / 2 - 2.4, ay - ah * 0.45); g.ellipse(mx, ay - ah * 0.45, aw / 2 + 2.4, ah * 0.55 + 2.4, 0, Math.PI, 0); g.lineTo(mx + aw / 2 + 2.4, ay); g.closePath();
        g.fillStyle = this.lin(0, ay - ah - 2, 0, ay, [[0, [214, 120, 80]], [1, [140, 60, 36]]]); g.fill(); g.strokeStyle = HDA.OUT; g.lineWidth = 0.5; g.stroke();
        for (let k = 0; k <= 8; k++) { const an = Math.PI + k * Math.PI / 8, rx = aw / 2 + 1.2, ry = ah * 0.55 + 1.2; this.line(mx + Math.cos(an) * (rx - 1.2), ay - ah * 0.45 + Math.sin(an) * (ry - 1.2), mx + Math.cos(an) * (rx + 1.2), ay - ah * 0.45 + Math.sin(an) * (ry + 1.2), 'rgba(60,24,12,0.7)', 0.35); }
        g.beginPath(); g.moveTo(mx - aw / 2, ay); g.lineTo(mx - aw / 2, ay - ah * 0.45); g.ellipse(mx, ay - ah * 0.45, aw / 2, ah * 0.55, 0, Math.PI, 0); g.lineTo(mx + aw / 2, ay); g.closePath();
        g.save(); g.clip();
        g.fillStyle = '#1a0c06'; g.fillRect(mx - aw / 2, ay - ah, aw, ah);
        g.fillStyle = this.rad(mx, ay - 2, 0.5, aw * 0.6, [[0, [255, 240, 160]], [0.25, [255, 170, 60]], [0.6, [210, 80, 20], 0.85], [1, [60, 20, 8], 0]]); g.fillRect(mx - aw / 2, ay - ah, aw, ah);
        for (let k = 0; k < 7; k++) {                                   // chamas
            const fx = mx - aw * 0.35 + k * aw * 0.11 + (rng() - 0.5) * 2, fh = ah * (0.35 + rng() * 0.45);
            g.beginPath(); g.moveTo(fx - 2, ay - 1.5); g.quadraticCurveTo(fx - 1.6, ay - fh * 0.6, fx + (rng() - 0.5) * 2, ay - fh); g.quadraticCurveTo(fx + 1.6, ay - fh * 0.5, fx + 2, ay - 1.5); g.closePath();
            g.fillStyle = this.lin(0, ay, 0, ay - fh, [[0, [255, 250, 200], 0.95], [0.5, [255, 180, 60], 0.85], [1, [230, 80, 20], 0.2]]); g.fill();
        }
        for (let k = 0; k < 3; k++) this.fillRR(mx - aw * 0.3 + k * aw * 0.2, ay - 2.4, aw * 0.18, 1.6, 0.8, '#3a1a0a');
        g.restore();
        g.save(); g.globalCompositeOperation = 'screen'; g.fillStyle = this.rad(mx, ay - ah * 0.4, 0, aw * 1.4, [[0, [255, 160, 60], 0.5], [0.5, [255, 120, 40], 0.15], [1, [255, 120, 40], 0]]); g.fillRect(mx - aw * 1.4, ay - ah * 0.4 - aw * 1.4, aw * 2.8, aw * 2.8); g.restore();
        // chaminé de metal (sai do topo da coifa e sobe pela parede)
        const px = mx - 5, py = b.top - 24, ph = 28;
        this.soft(px + 2, py + 2, 10, ph, 0.4, 2, 2);
        this.fillRR(px, py, 10, ph, 2, this.lin(px, 0, px + 10, 0, [[0, [120, 124, 132]], [0.3, [222, 226, 232]], [0.55, [150, 154, 162]], [1, [62, 64, 72]]]));
        this.ell(px + 5, py + 0.5, 5, 1.6, '#2a2c30'); this.ell(px + 5, py + 0.5, 4, 1.1, '#121316');
        this.fillRR(px - 1.6, py + ph - 3, 13.2, 3.4, 1, this.lin(px - 1.6, 0, px + 11.6, 0, [[0, [110, 114, 122]], [0.35, [210, 214, 220]], [1, [60, 62, 70]]]));
        this.strokeRR(px, py, 10, ph, 2, HDA.OUT, 0.45);
        // toras empilhadas na frente
        for (let k = 0; k < 4; k++) this.logEnd(b.x + 8.5 + k * 11, b.y + b.h + 3.2, 4.4);
    },
    logEnd(x, y, r) {
        this.softEll(x + 1, y + 1.6, r, r * 0.6, 0.4, 1);
        this.circ(x, y, r, this.rad(x - r * 0.3, y - r * 0.3, 0.2, r, [[0, [214, 170, 110]], [0.7, [168, 120, 70]], [1, [90, 56, 30]]]));
        this.g.beginPath(); this.g.arc(x, y, r * 0.6, 0, Math.PI * 2); this.g.arc(x, y, r * 0.3, 0, Math.PI * 2); this.g.strokeStyle = 'rgba(110,70,36,0.6)'; this.g.lineWidth = 0.3; this.g.stroke();
        this.g.beginPath(); this.g.arc(x, y, r, 0, Math.PI * 2); this.g.strokeStyle = '#3a2210'; this.g.lineWidth = 0.7; this.g.stroke();
    },
    // Pilha de lenha: toras deitadas, com a casca e os topos claros.
    p_logs(op, r, h = 0.6) {
        const S = this.S, b = S.base(r, h), g = this.g, rng = Pixel.rng(Math.round(b.x + b.y * 5));
        this.soft(b.x + 1.5, b.y - 2, b.w + 1, b.h + 2, 0.5, 2.5, 2);
        for (let k = 0; k < 3; k++) {
            for (let j = 0; j < 2; j++) {
                const y = b.y - 5 - k * 4 + j * 2.6 - 1, x = b.x + 0.5 + (k % 2) * 1.2, w = b.w - 2.4, rr = 1.9;
                this.fillRR(x, y, w, rr * 2, rr, this.lin(0, y, 0, y + rr * 2, [[0, [150, 104, 60]], [0.45, [110, 72, 40]], [1, [58, 36, 20]]]));
                g.save(); this.rr(x, y, w, rr * 2, rr); g.clip(); for (let i = 0; i < w; i += 1.6) this.line(x + i, y, x + i + 0.8, y + rr * 2, 'rgba(40,24,12,0.35)', 0.25); g.restore();
                this.ell(x + w - rr * 0.4, y + rr, rr * 0.7, rr, this.rad(x + w - rr * 0.4, y + rr, 0.1, rr, [[0, [226, 190, 130]], [1, [170, 120, 70]]]));
                this.strokeRR(x, y, w, rr * 2, rr, 'rgba(36,20,10,0.85)', 0.35);
                void rng;
            }
        }
    },
    // Escritório: cofre de aço (porta com segredo e alça), gravador com o monitor de 4 câmeras, câmera de parede.
    p__safeArt(op, sf) {
        const b = this.S.base(sf, 1.05), g = this.g;
        this.prism(b, [92, 98, 106], [60, 66, 74], { topMat: 'steel', frontMat: 'steel' });
        const dx = b.x + 2, dy = b.fy + 0.6, dw = b.w - 4, dh = b.hp - 1.4;
        if (dh > 2) {
            this.fillRR(dx, dy, dw, dh, 0.6, this.lin(0, dy, 0, dy + dh, [[0, [110, 116, 126]], [1, [50, 54, 62]]])); this.strokeRR(dx, dy, dw, dh, 0.6, 'rgba(10,12,16,0.8)', 0.35);
        }
        const cx = b.x + b.w / 2, cy = b.top + b.h * 0.55;
        this.circ(cx, cy, 4.2, this.rad(cx - 1, cy - 1, 0.2, 4.4, [[0, [230, 234, 240]], [1, [110, 116, 126]]])); this.circ(cx, cy, 1.4, '#2a2e34');
        for (let k = 0; k < 12; k++) { const an = k * Math.PI / 6; this.line(cx + Math.cos(an) * 3.2, cy + Math.sin(an) * 3.2, cx + Math.cos(an) * 4, cy + Math.sin(an) * 4, '#2a2e34', 0.25); }
        this.fillRR(b.x + b.w - 4.6, b.top + 3, 1.6, b.h - 6, 0.6, this.lin(0, b.top, 0, b.top + b.h, [[0, [220, 224, 230]], [1, [120, 126, 134]]]));
        for (const [rx, ry] of [[b.x + 1.6, b.top + 1.6], [b.x + b.w - 1.6, b.top + 1.6], [b.x + 1.6, b.fy - 1.6], [b.x + b.w - 1.6, b.fy - 1.6]]) this.circ(rx, ry, 0.45, '#c8ccd2');
        void g;
    },
    p__dvrArt(op, dv) {
        const b = this.S.base(dv, 1.25), g = this.g;
        this.prism(b, [38, 40, 46], [24, 26, 30], { topMat: 'paint', frontMat: 'paint' });
        for (let k = 0; k < 3; k++) { const y = b.fy + 0.8 + k * (b.hp / 3); this.line(b.x + 1, y, b.x + b.w - 1, y, 'rgba(255,255,255,0.08)', 0.3); this.circ(b.x + 2.2, y + 1, 0.5, k ? '#3adf6a' : '#ff3a3a'); }
        const mx = b.x + 1, my = b.top + 1, mw = b.w - 2, mh = b.h - 2;
        this.fillRR(mx, my, mw, mh, 0.6, '#0a0c0e');
        const cols = [[90, 138, 106], [106, 122, 154], [138, 122, 90], [90, 106, 122]];
        for (let k = 0; k < 4; k++) {
            const qx = mx + 1 + (k & 1) * (mw - 2) / 2, qy = my + 1 + (k >> 1) * (mh - 2) / 2, qw = (mw - 2) / 2 - 0.5, qh = (mh - 2) / 2 - 0.5;
            g.fillStyle = this.lin(0, qy, 0, qy + qh, [[0, HDK.t(cols[k], 1.2)], [1, HDK.t(cols[k], 0.7)]]); g.fillRect(qx, qy, qw, qh);
            this.ell(qx + qw * 0.5, qy + qh * 0.6, qw * 0.12, qh * 0.22, 'rgba(20,20,24,0.6)');
        }
        g.fillStyle = 'rgba(160,220,255,0.12)'; g.fillRect(mx, my, mw, mh);
    },
    p__camArt(op, x) {
        const S = this.S, bd = S.band(x - 0.35, x + 0.35), cx = bd.x + bd.w / 2, y = this.top + 4, g = this.g;
        this.soft(cx - 3, y + 1, 9, 6, 0.4, 1.2, 1);
        this.fillRR(cx - 1, y - 2, 2, 3.4, 0.5, '#2a2c32');
        this.fillRR(cx - 4.4, y + 0.6, 8.8, 4.4, 1.6, this.lin(0, y, 0, y + 5, [[0, [236, 238, 242]], [1, [150, 156, 166]]]));
        this.circ(cx + 2.4, y + 3.6, 1.6, '#16181c'); this.circ(cx + 2.1, y + 3.3, 0.6, '#5a7aa0');
        this.circ(cx - 2.6, y + 2.4, 0.5, '#ff3030');
        g.save(); g.globalCompositeOperation = 'screen'; g.fillStyle = this.rad(cx - 2.6, y + 2.4, 0, 3, [[0, [255, 60, 60], 0.6], [1, [255, 60, 60], 0]]); g.fillRect(cx - 6, y - 1, 7, 7); g.restore();
        this.strokeRR(cx - 4.4, y + 0.6, 8.8, 4.4, 1.6, HDA.OUT, 0.35);
    },
});

// Objetos novos de balcão (pizzaria): bola de massa, disco de pizza com molho e tábua com faca e calabresa.
(function () {
    const item = HDPainter.prototype.item;
    HDPainter.prototype.item = function (it, x, y, rng) {
        if (it === 'dough') {
            this.softEll(x + 10, y + 9.5, 8.5, 5, 0.3, 1.4);
            this.circ(x + 9, y + 8, 8.2, this.rad(x + 7, y + 5.5, 0.5, 9, [[0, [255, 248, 226]], [0.7, [236, 214, 168]], [1, [206, 176, 124]]]));
            for (let k = 0; k < 14; k++) this.circ(x + 3 + rng() * 12, y + 3 + rng() * 10, 0.25 + rng() * 0.3, 'rgba(255,255,255,0.75)');
            return 20;
        }
        if (it === 'base') {
            this.softEll(x + 9, y + 8.5, 8, 5, 0.3, 1.4);
            this.circ(x + 8, y + 7, 8, this.rad(x + 8, y + 7, 5, 8, [[0, [230, 196, 130]], [1, [196, 150, 90]]]));
            this.circ(x + 8, y + 7, 6.2, this.rad(x + 7, y + 6, 0.5, 6.4, [[0, [214, 70, 40]], [1, [170, 40, 24]]]));
            for (let k = 0; k < 9; k++) { const a = rng() * 6.28, d = rng() * 4.5; this.ell(x + 8 + Math.cos(a) * d, y + 7 + Math.sin(a) * d, 1.1 + rng() * 0.8, 0.8 + rng() * 0.6, 'rgba(250,236,190,0.92)'); }
            for (let k = 0; k < 3; k++) { const a = rng() * 6.28, d = 1 + rng() * 3.5; this.ell(x + 8 + Math.cos(a) * d, y + 7 + Math.sin(a) * d, 0.9, 0.5, '#3f8a3a'); }
            return 18;
        }
        if (it === 'juicer') {                                    // espremedor de laranja com o copo cheio
            this.soft(x + 1, y + 1.5, 14, 18, 0.45, 1.4, 1.5);
            this.fillRR(x, y + 9, 14, 9, 1.4, this.lin(x, 0, x + 14, 0, [[0, [230, 234, 240]], [1, [130, 136, 146]]]));
            this.fillRR(x + 1.5, y, 11, 10, 2.4, this.lin(x, 0, x + 14, 0, [[0, [250, 252, 255]], [1, [160, 166, 176]]]));
            this.circ(x + 7, y + 4.5, 3.6, this.rad(x + 6, y + 3.5, 0.3, 3.8, [[0, [255, 200, 90]], [1, [230, 130, 30]]]));
            for (let k = 0; k < 6; k++) { const an = k * Math.PI / 3; this.line(x + 7, y + 4.5, x + 7 + Math.cos(an) * 3.2, y + 4.5 + Math.sin(an) * 3.2, 'rgba(255,240,200,0.7)', 0.3); }
            this.fillRR(x + 4.6, y + 12, 4.8, 5.4, 0.6, 'rgba(220,236,246,0.6)'); this.fillRR(x + 5, y + 13.4, 4, 3.6, 0.4, '#f0a030');
            this.strokeRR(x, y, 14, 18, 1.4, HDA.OUT, 0.4);
            return 16;
        }
        if (it === 'board') {
            this.soft(x + 9, y + 2, 19, 10, 0.35, 1.2, 1.2);
            this.fillRR(x + 8, y + 1, 18, 10, 1.4, this.lin(x + 8, y, x + 26, y + 11, [[0, [226, 186, 120]], [1, [176, 130, 74]]]));
            this.g.save(); this.rr(x + 8, y + 1, 18, 10, 1.4); this.g.clip(); for (let k = 0; k < 7; k++) this.line(x + 8, y + 2 + k * 1.4, x + 26, y + 2.4 + k * 1.4, 'rgba(120,80,40,0.25)', 0.2); this.g.restore();
            this.strokeRR(x + 8, y + 1, 18, 10, 1.4, 'rgba(80,50,24,0.8)', 0.35);
            for (let k = 0; k < 6; k++) { const px = x + 11.5 + (k % 3) * 4.4 + rng(), py = y + 3.8 + (k / 3 | 0) * 4 + rng() * 0.6; this.circ(px, py, 1.6, '#b83a2c'); this.circ(px - 0.3, py - 0.3, 0.5, 'rgba(255,220,200,0.6)'); }
            this.line(x + 1, y + 14.5, x + 12, y + 3.5, '#d8dce2', 1.1); this.line(x + 1.2, y + 14.2, x + 4.6, y + 10.8, '#3a2414', 1.4);
            return 28;
        }
        return item.call(this, it, x, y, rng);
    };
})();

// ================================================================= LOJA: geladeiras, máquinas, prateleiras, gôndolas
// Peças altas encostadas na parede mostram a FRENTE no lugar do topo (como a boca do forno): uma faixa fina do tampo em cima e,
// logo abaixo, a porta de vidro, as prateleiras, a máquina — o que o jogador reconhece de cima.
Object.assign(HDPainter.prototype, {
    // Um produto de prateleira em pé (base em yb): garrafa, caixa, lata, pote, pão, tênis, remédio.
    product(x, yb, w, h, col, kind, rng) {
        const c = HDK.C(col), g = this.g;
        if (kind === 'bottle') {
            this.fillRR(x, yb - h, w, h, Math.min(1, w / 2), this.lin(x, 0, x + w, 0, [[0, HDK.t(c, 1.35)], [0.4, c], [1, HDK.t(c, 0.55)]]));
            this.fillRR(x + w * 0.3, yb - h - 2.4, w * 0.4, 2.8, 0.3, HDK.css(HDK.t(c, 0.85)));
            this.fillRR(x + 0.2, yb - h * 0.55, w - 0.4, h * 0.3, 0.2, 'rgba(245,238,220,0.92)');
        } else if (kind === 'can') {
            this.fillRR(x, yb - h, w, h, 0.5, this.lin(x, 0, x + w, 0, [[0, HDK.t(c, 1.4)], [0.45, c], [1, HDK.t(c, 0.5)]]));
            this.ell(x + w / 2, yb - h, w / 2, 0.5, '#d8dce2');
        } else if (kind === 'bread') {
            this.fillRR(x, yb - h * 0.7, w, h * 0.7, h * 0.3, this.lin(0, yb - h * 0.7, 0, yb, [[0, [232, 178, 96]], [0.5, HDK.t(c, 1.05)], [1, HDK.t(c, 0.7)]]));
            for (let k = 1; k < 3; k++) this.line(x + w * k / 3 - 0.6, yb - h * 0.62, x + w * k / 3 + 0.6, yb - h * 0.2, 'rgba(120,70,30,0.6)', 0.35);
            this.ell(x + w * 0.35, yb - h * 0.55, w * 0.18, h * 0.08, 'rgba(255,240,200,0.6)');
            return;
        } else if (kind === 'shoe') {
            this.fillRR(x, yb - h * 0.55, w + 1, h * 0.55, h * 0.25, this.lin(0, yb - h * 0.55, 0, yb, [[0, HDK.t(c, 1.2)], [1, HDK.t(c, 0.75)]]));
            this.fillRR(x, yb - 1, w + 1.2, 1, 0.4, '#f4f4f0'); this.line(x + w * 0.3, yb - h * 0.5, x + w * 0.7, yb - h * 0.35, 'rgba(255,255,255,0.7)', 0.3);
            return;
        } else {                                                  // caixa / remédio / pote
            this.fillRR(x, yb - h, w, h, 0.4, this.lin(x, 0, x + w, 0, [[0, HDK.t(c, 1.2)], [0.6, c], [1, HDK.t(c, 0.7)]]));
            if (h > 4) g.fillStyle = 'rgba(250,246,236,0.85)', g.fillRect(x + 0.5, yb - h * 0.62, w - 1, Math.max(0.8, h * 0.18));
            if (kind === 'med') { g.fillStyle = '#d9453a'; g.fillRect(x + w / 2 - 0.25, yb - h * 0.85, 0.5, 1.6); g.fillRect(x + w / 2 - 0.8, yb - h * 0.85 + 0.55, 1.6, 0.5); }
        }
        g.strokeStyle = 'rgba(20,14,10,0.45)'; g.lineWidth = 0.22; g.strokeRect(x, yb - h, w, h);
    },
    prodKind(rng) {
        const st = this.S.style;
        if (st === 'bakery') return 'bread';
        if (st === 'clothes') return 'shoe';
        if (st === 'pharmacy') return rng() < 0.75 ? 'med' : 'bottle';
        const r = rng(); return r < 0.32 ? 'bottle' : r < 0.5 ? 'can' : 'box';
    },
    // Geladeira de bebidas: porta de vidro, faixa da marca, prateleiras de garrafas e latas, puxador.
    p_cooler(op, r, h, col = '#2f86d0') {
        const S = this.S, b = S.base(r, h), g = this.g, c = HDK.C(col), rng = Pixel.rng(Math.round(b.x * 7 + b.y * 3));
        this.objShadow(b, 0.5, 2);
        const x = b.x, y = b.top, w = b.w, H = b.h + b.hp;
        this.fillRR(x, y, w, H, 1.2, this.lin(x, 0, x + w, 0, [[0, [246, 248, 250]], [0.5, [214, 220, 226]], [1, [150, 156, 162]]]));
        this.fillRR(x + 0.5, y + 0.5, w - 1, 3, 0.8, this.lin(0, y, 0, y + 3.5, [[0, [255, 255, 255]], [1, [200, 206, 212]]]));        // tampo
        this.fillRR(x + 1.2, y + 4, w - 2.4, 4.4, 0.6, this.lin(0, y + 4, 0, y + 8.4, [[0, HDK.t(c, 1.3)], [1, HDK.t(c, 0.8)]]));       // marca
        g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(x + w / 2 - w * 0.2, y + 5.7, w * 0.4, 1.1);
        const gx = x + 1.6, gy = y + 9.4, gw = w - 3.2, gh = H - 12;
        if (gh > 4) {
            g.fillStyle = this.lin(0, gy, 0, gy + gh, [[0, [22, 36, 48]], [1, [12, 20, 28]]]); g.fillRect(gx, gy, gw, gh);
            const rows = Math.max(2, Math.round(gh / 9));
            this.clip(gx, gy, gw, gh, () => {
                for (let t = 0; t < rows; t++) {
                    const yb = gy + (t + 1) * gh / rows - 1;
                    for (let xx = gx + 0.8; xx < gx + gw - 2; xx += 2.6) { const pc = ['#d9453a', '#3f9a52', '#e0a020', '#2f86d0', '#8a4ab0', '#f0f0f0'][Math.floor(rng() * 6)]; this.product(xx, yb, 2.1, gh / rows - 3 - rng() * 1.5, pc, rng() < 0.55 ? 'bottle' : 'can', rng); }
                    g.fillStyle = 'rgba(200,230,255,0.5)'; g.fillRect(gx, yb, gw, 0.7);
                }
                g.save(); g.globalCompositeOperation = 'screen'; g.fillStyle = this.lin(0, gy, 0, gy + gh, [[0, [140, 200, 255], 0.35], [1, [140, 200, 255], 0.05]]); g.fillRect(gx, gy, gw, gh); g.restore();
                g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.moveTo(gx + gw * 0.15, gy + gh); g.lineTo(gx + gw * 0.45, gy); g.lineTo(gx + gw * 0.6, gy); g.lineTo(gx + gw * 0.3, gy + gh); g.closePath(); g.fill();
            });
            this.strokeRR(gx, gy, gw, gh, 0.4, 'rgba(110,116,124,0.9)', 0.6);
            this.fillRR(x + w - 3.2, gy + gh * 0.3, 1, gh * 0.4, 0.4, '#8a9096');
        }
        this.strokeRR(x, y, w, H, 1.2, HDA.OUT, 0.5);
    },
    // Máquina de salgadinhos/bebidas — ou, no banco, o caixa eletrônico.
    p_vending(op, r, h, col = '#c0302a') {
        const S = this.S, b = S.base(r, h), g = this.g, c = HDK.C(col), rng = Pixel.rng(Math.round(b.x * 5 + b.y));
        this.objShadow(b, 0.5, 2);
        const x = b.x, y = b.top, w = b.w, H = b.h + b.hp;
        this.fillRR(x, y, w, H, 1.4, this.lin(x, 0, x + w, 0, [[0, HDK.t(c, 1.25)], [0.6, c], [1, HDK.t(c, 0.6)]]));
        this.fillRR(x + 0.6, y + 0.6, w - 1.2, 2.8, 0.8, HDK.css(HDK.t(c, 1.35), 0.9));
        if (/^bank/.test(S.style)) {                               // caixa eletrônico
            this.fillRR(x + 2, y + 5, w - 4, H * 0.32, 0.8, '#0c1218');
            this.fillRR(x + 2.8, y + 5.8, w - 5.6, H * 0.32 - 1.6, 0.4, this.lin(0, y + 5, 0, y + 5 + H * 0.3, [[0, [60, 140, 220]], [1, [24, 70, 140]]]));
            g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(x + 4, y + 8, w - 8, 1); g.fillRect(x + 4, y + 10.5, (w - 8) * 0.6, 0.8);
            const ky = y + 7 + H * 0.32;
            for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) this.fillRR(x + 3 + i * 2.6, ky + j * 2.1, 2, 1.5, 0.3, j === 3 && i === 2 ? '#3ab04a' : '#c8ccd4');
            this.fillRR(x + w - 7, ky, 4.4, 1.2, 0.3, '#16181c'); this.fillRR(x + 3, ky + 9.5, w - 6, 1.6, 0.4, '#16181c');
            g.fillStyle = 'rgba(160,255,190,0.9)'; g.fillRect(x + w - 6.6, ky + 0.3, 3.6, 0.5);
        } else {
            const gx = x + 1.8, gy = y + 4.2, gw = w * 0.66, gh = H - 11;
            g.fillStyle = '#121a22'; g.fillRect(gx, gy, gw, gh);
            this.clip(gx, gy, gw, gh, () => {
                const rows = Math.max(3, Math.round(gh / 6));
                for (let t = 0; t < rows; t++) {
                    const yb = gy + (t + 1) * gh / rows - 0.8;
                    for (let xx = gx + 0.8; xx < gx + gw - 2.5; xx += 3.3) { const pc = ['#c0392b', '#e8e0d0', '#3a6fc4', '#3f9a52', '#e0a020'][Math.floor(rng() * 5)]; this.product(xx, yb, 2.6, gh / rows - 2.2, pc, rng() < 0.4 ? 'bottle' : 'box', rng); }
                    this.line(gx, yb + 0.3, gx + gw, yb + 0.3, 'rgba(180,190,200,0.7)', 0.4);
                }
                g.fillStyle = 'rgba(255,255,255,0.16)'; g.beginPath(); g.moveTo(gx + gw * 0.1, gy + gh); g.lineTo(gx + gw * 0.4, gy); g.lineTo(gx + gw * 0.55, gy); g.lineTo(gx + gw * 0.25, gy + gh); g.closePath(); g.fill();
            });
            const px = x + w * 0.72 + 0.6, pw = w * 0.28 - 2.4;
            this.fillRR(px, gy, pw, gh * 0.55, 0.5, '#2a2d34');
            for (let k = 0; k < 4; k++) this.circ(px + pw / 2, gy + 2 + k * 2.6, 0.55, '#7ad088');
            this.fillRR(px, gy + gh * 0.62, pw, 2.4, 0.4, '#16181c');
            this.fillRR(x + 2, y + H - 5.8, w - 4, 3.6, 0.6, '#0c0c10');
        }
        this.strokeRR(x, y, w, H, 1.4, HDA.OUT, 0.5);
    },
    // Estante de parede: fundo escuro, prateleiras de madeira/metal com produtos e as colunas laterais.
    p_shelf(op, r, h, tiers, prods, wood = '#7a5430') {
        const S = this.S, b = S.base(r, h), g = this.g, wd = HDK.C(wood), fh = b.hp + b.h, top = b.top, rng = Pixel.rng(Math.round(b.x * 11 + b.y));
        this.objShadow(b, 0.45, 1);
        g.fillStyle = this.lin(0, top, 0, top + fh, [[0, HDK.t(wd, 0.32)], [1, HDK.t(wd, 0.22)]]); g.fillRect(b.x, top, b.w, fh);
        for (let t = 0; t < tiers; t++) {
            const by = top + Math.round((fh - 5) * (t + 1) / tiers) - 5, prev = t ? top + Math.round((fh - 5) * t / tiers) - 5 + 3 : top + 2, room = by - prev;
            g.fillStyle = this.lin(0, prev, 0, by, [[0, [0, 0, 0], 0.35], [1, [0, 0, 0], 0]]); g.fillRect(b.x + 3, prev, b.w - 6, room);
            let x = b.x + 4.5;
            while (x < b.x + b.w - 8) {
                const kind = this.prodKind(rng), pw = kind === 'bottle' ? 2.6 : kind === 'can' ? 2.4 : kind === 'bread' ? 6 + rng() * 3 : kind === 'shoe' ? 5.5 : 4 + rng() * 4;
                const ph = Math.min(room - 1, kind === 'bottle' ? 8 + rng() * 4 : kind === 'bread' ? 4 + rng() * 2 : kind === 'shoe' ? 4.2 : 5 + rng() * 6);
                this.product(x, by, pw, Math.max(2, ph), prods[Math.floor(rng() * prods.length)], kind, rng);
                x += pw + 0.8 + rng() * 1.2;
            }
            this.fillRR(b.x + 0.5, by, b.w - 1, 4.4, 0.6, this.lin(0, by, 0, by + 4.4, [[0, HDK.t(wd, 1.35)], [0.3, wd], [1, HDK.t(wd, 0.6)]]));
            this.line(b.x + 1, by + 4.4, b.x + b.w - 1, by + 4.4, 'rgba(0,0,0,0.4)', 0.6);
        }
        for (const px of [b.x, b.x + b.w - 3.6]) this.fillRR(px, top, 3.6, fh, 0.6, this.lin(px, 0, px + 3.6, 0, [[0, HDK.t(wd, 1.25)], [1, HDK.t(wd, 0.6)]]));
        this.strokeRR(b.x, top, b.w, fh, 0.6, HDA.OUT, 0.5);
    },
    // Gôndola (ilha de prateleiras): produtos no tampo e três fileiras na frente.
    p_gondola(op, r, h, prods, body = '#c8ccd0') {
        const S = this.S, b = S.base(r, h), g = this.g, bd = HDK.C(body), rng = Pixel.rng(Math.round(b.x * 13 + b.y));
        this.objShadow(b, 0.48, 1);
        const fy = b.fy - 0.8, fh = b.hp + 0.8;
        this.fillRR(b.x, fy, b.w, fh, 0.6, this.lin(0, fy, 0, fy + fh, [[0, HDK.t(bd, 0.75)], [1, HDK.t(bd, 0.45)]]));
        this.clip(b.x + 0.6, fy, b.w - 1.2, fh, () => {
            for (let t = 0; t < 3; t++) {
                const yb = fy + (t + 1) * fh / 3 - 0.3;
                for (let x = b.x + 1.2; x < b.x + b.w - 3; x += 2.8 + rng()) this.product(x, yb, 2.2 + rng() * 0.8, fh / 3 - 0.8, prods[Math.floor(rng() * prods.length)], this.prodKind(rng), rng);
                this.line(b.x, yb + 0.2, b.x + b.w, yb + 0.2, HDK.css(HDK.t(bd, 1.2), 0.9), 0.5);
            }
        });
        this.fillRR(b.x, b.top, b.w, b.h, 1, this.lin(b.x, b.top, b.x + b.w, b.top + b.h, [[0, HDK.t(bd, 1.12)], [1, HDK.t(bd, 0.9)]]));
        this.clip(b.x + 1, b.top + 1, b.w - 2, b.h - 2, () => {
            for (let x = b.x + 1.6; x < b.x + b.w - 3; x += 3.6 + rng() * 0.6) {
                const pc = HDK.C(prods[Math.floor(rng() * prods.length)]), ph = b.h - 3 - (rng() < 0.5 ? 2 : 0);
                this.fillRR(x, b.top + 1.5, 3, ph, 0.5, this.lin(x, 0, x + 3, 0, [[0, HDK.t(pc, 1.3)], [1, HDK.t(pc, 0.7)]]));
                this.ell(x + 1.5, b.top + 2.2, 1.2, 0.6, 'rgba(255,255,255,0.45)');
            }
        });
        this.line(b.x + 1, b.fy - 0.4, b.x + b.w - 1, b.fy - 0.4, HDK.css(HDK.t(bd, 1.4), 0.8), 0.4);
        this.strokeRR(b.x, b.top, b.w, b.h + b.hp, 1, HDA.OUT, 0.5);
    },

    // ================================================================= OBJETOS DE CANTO (ShopCtx._prop)
    p__prop(op, kind, r, side) {
        const S = this.S, g = this.g, H = { bin: 0.9, baskets: 0.7, wet: 0.8, boxes: 0.9, water: 1.5, plant: 1.2, highchair: 1.0, crates: 1.1, coat: 1.8, umbrella: 0.9, bench: 0.5, bags: 0.6, towels: 0.8, ammo: 0.8, posts: 1.0 }[kind] || 1;
        const cx = (r[0] + r[2]) / 2, cz = (r[1] + r[3]) / 2;
        if (kind === 'plant') { this.p_plant(op, cx, cz, (r[2] - r[0]) > 0.9); return; }
        const b = S.base(r, H), mx = b.x + b.w / 2, rng = Pixel.rng(Math.round(b.x * 3 + b.y * 7));
        if (kind === 'bin') {                                      // lixeira de pedal com o símbolo de reciclável
            this.objShadow(b, 0.5);
            this.fillRR(b.x + 1, b.fy - 0.5, b.w - 2, b.hp + 1, 1, this.lin(b.x, 0, b.x + b.w, 0, [[0, [96, 102, 112]], [0.4, [70, 74, 82]], [1, [34, 36, 42]]]));
            for (let i = 3; i < b.w - 3; i += 2.4) this.line(b.x + i, b.fy + 0.6, b.x + i, b.y + b.h - 0.6, 'rgba(0,0,0,0.25)', 0.3);
            this.fillRR(b.x, b.top, b.w, b.h, 1.4, this.lin(b.x, b.top, b.x + b.w, b.top + b.h, [[0, [110, 116, 126]], [1, [56, 60, 68]]]));
            this.fillRR(b.x + 2.4, b.top + 2.4, b.w - 4.8, b.h - 4.8, 1, '#16181c');
            this.circ(mx, b.top + b.h / 2, 1.8, '#2a8a4a'); this.circ(mx, b.top + b.h / 2, 1, '#16181c');
            this.strokeRR(b.x, b.top, b.w, b.h + b.hp, 1.4, HDA.OUT, 0.45);
        } else if (kind === 'baskets') {                           // pilha de cestinhas vermelhas
            this.objShadow(b, 0.45);
            for (let k = 0; k < 4; k++) { const yy = b.top - 6 + k * 1.6; this.fillRR(b.x, yy, b.w, b.h, 1.2, this.lin(0, yy, 0, yy + b.h, [[0, [236, 80, 70]], [1, [150, 28, 22]]])); this.strokeRR(b.x, yy, b.w, b.h, 1.2, 'rgba(60,10,8,0.8)', 0.4); }
            const yy = b.top - 6 + 4.8; g.save(); this.rr(b.x + 2, yy + 2, b.w - 4, b.h - 4, 0.8); g.clip(); g.fillStyle = '#6a1210'; g.fillRect(b.x, yy, b.w, b.h); for (let i = 0; i < b.w; i += 1.8) this.line(b.x + i, yy, b.x + i, yy + b.h, 'rgba(200,60,50,0.6)', 0.4); g.restore();
            this.line(b.x + 2, b.top - 6.6, b.x + b.w - 2, b.top - 6.6, '#2a2c30', 0.7);
        } else if (kind === 'wet') {                               // placa de piso molhado
            const py = b.fy + b.hp;
            this.softEll(mx + 2, py, 6, 2, 0.4, 1.4);
            g.beginPath(); g.moveTo(mx - 1.6, py - 15); g.lineTo(mx + 1.6, py - 15); g.lineTo(mx + 5.4, py); g.lineTo(mx - 5.4, py); g.closePath();
            g.fillStyle = this.lin(mx - 5, 0, mx + 5, 0, [[0, [255, 226, 70]], [1, [214, 168, 20]]]); g.fill(); g.strokeStyle = HDA.OUT; g.lineWidth = 0.45; g.stroke();
            g.beginPath(); g.moveTo(mx, py - 11.5); g.lineTo(mx + 2.6, py - 7); g.lineTo(mx - 2.6, py - 7); g.closePath(); g.fillStyle = '#1a1a1a'; g.fill();
            g.fillStyle = '#1a1a1a'; g.fillRect(mx - 3.4, py - 4.6, 6.8, 0.8); g.fillRect(mx - 2.6, py - 3, 5.2, 0.6);
        } else if (kind === 'boxes' || kind === 'ammo') {          // caixas de papelão (ou de munição, verde-oliva)
            this.objShadow(b, 0.5, 1);
            const ammo = kind === 'ammo', col = ammo ? [84, 102, 64] : [184, 138, 84];
            const box = (x, y, w, d, hh) => {
                this.fillRR(x, y + d - 0.6, w, hh + 0.6, 0.5, this.lin(0, y + d, 0, y + d + hh, [[0, HDK.t(col, 0.86)], [1, HDK.t(col, 0.6)]]));
                this.fillRR(x, y, w, d, 0.6, this.lin(x, y, x + w, y + d, [[0, HDK.t(col, 1.18)], [1, HDK.t(col, 0.95)]]));
                if (ammo) { g.fillStyle = '#e0c040'; g.fillRect(x + 1.5, y + d + hh * 0.35, w * 0.5, 1); this.fillRR(x + w / 2 - 1.6, y + 0.8, 3.2, 1.2, 0.3, '#2a3218'); }
                else { g.fillStyle = 'rgba(220,200,150,0.9)'; g.fillRect(x + w / 2 - 0.9, y, 1.8, d); g.fillRect(x + w / 2 - 0.9, y + d, 1.8, hh * 0.5); }
                this.strokeRR(x, y, w, d + hh, 0.6, 'rgba(50,34,18,0.8)', 0.4);
            };
            box(b.x, b.top + 2, b.w - 4, b.h - 2, b.hp); box(b.x + 5, b.top - 5, b.w - 9, b.h - 3, 5);
        } else if (kind === 'water') {                             // bebedouro de galão
            this.objShadow(b, 0.5);
            this.fillRR(b.x + 1, b.fy - 0.6, b.w - 2, b.hp + 1, 0.8, this.lin(b.x, 0, b.x + b.w, 0, [[0, [252, 252, 252]], [1, [170, 178, 186]]]));
            this.circ(b.x + 3.5, b.fy + 2, 0.9, '#2f6fd0'); this.circ(b.x + b.w - 3.5, b.fy + 2, 0.9, '#d03a2a');
            this.fillRR(b.x, b.top, b.w, b.h, 1, this.lin(b.x, b.top, b.x + b.w, b.top + b.h, [[0, [255, 255, 255]], [1, [196, 202, 210]]]));
            const r2 = Math.min(b.w, b.h) / 2 - 0.8, cy = b.top + b.h / 2 - 1.5;
            this.circ(mx, cy, r2, this.rad(mx - r2 * 0.4, cy - r2 * 0.4, 0.3, r2, [[0, [200, 236, 255], 0.95], [0.6, [90, 168, 224], 0.85], [1, [40, 110, 180], 0.9]]));
            this.circ(mx, cy, r2 * 0.35, '#3a78c4'); this.circ(mx - r2 * 0.4, cy - r2 * 0.4, r2 * 0.18, 'rgba(255,255,255,0.8)');
            this.strokeRR(b.x, b.top, b.w, b.h + b.hp, 1, HDA.OUT, 0.45);
        } else if (kind === 'highchair') {
            this.objShadow(b, 0.45);
            this.prism(b, [216, 168, 104], [200, 152, 96], { shadow: false, topMat: 'wood', frontMat: 'wood' });
            this.fillRR(b.x + 2, b.top + 2, b.w - 4, b.h - 4, 0.8, '#f0d0a0');
        } else if (kind === 'crates') {                            // engradados de cerveja empilhados
            this.objShadow(b, 0.5);
            for (let k = 0; k < 2; k++) { const yy = b.fy - k * 6, cc = k ? [216, 160, 32] : [200, 50, 40]; this.fillRR(b.x, yy, b.w, b.hp + 1 - k * 2, 0.6, this.lin(0, yy, 0, yy + b.hp, [[0, HDK.t(cc, 1.15)], [1, HDK.t(cc, 0.6)]])); this.strokeRR(b.x, yy, b.w, b.hp + 1 - k * 2, 0.6, 'rgba(40,10,4,0.8)', 0.4); }
            const ty = b.top - 8;
            this.fillRR(b.x, ty, b.w, b.h, 1, this.lin(b.x, ty, b.x + b.w, ty + b.h, [[0, [240, 192, 64]], [1, [176, 120, 16]]]));
            for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) { const px = b.x + 2.5 + i * (b.w - 5) / 3.4, py = ty + 2.5 + j * (b.h - 5) / 1.4; this.circ(px, py, 1.3, '#4a2a10'); this.circ(px - 0.3, py - 0.3, 0.5, '#f4e0a0'); }
            this.strokeRR(b.x, ty, b.w, b.h, 1, 'rgba(60,30,4,0.8)', 0.4);
        } else if (kind === 'coat') {                              // cabideiro com casacos
            const py = b.fy + b.hp;
            this.softEll(mx + 1.5, py, 5, 1.8, 0.4, 1.2);
            this.ell(mx, py - 0.5, 4.6, 1.4, '#3a2010');
            this.fillRR(mx - 0.8, py - 31, 1.6, 31, 0.6, this.lin(mx - 1, 0, mx + 1, 0, [[0, [120, 80, 50]], [1, [60, 36, 20]]]));
            for (const [dx, cc] of [[-5.6, [42, 44, 56]], [2.2, [106, 58, 42]]]) { this.fillRR(mx + dx, py - 28, 4.6, 15, 1.6, this.lin(mx + dx, 0, mx + dx + 4.6, 0, [[0, HDK.t(cc, 1.3)], [1, HDK.t(cc, 0.6)]])); this.strokeRR(mx + dx, py - 28, 4.6, 15, 1.6, HDA.OUT, 0.35); }
            this.circ(mx, py - 31.5, 1.6, '#c8a040');
        } else if (kind === 'umbrella') {
            this.objShadow(b, 0.45);
            this.fillRR(b.x + 1, b.fy - 0.5, b.w - 2, b.hp + 1, 0.8, this.lin(b.x, 0, b.x + b.w, 0, [[0, [90, 94, 104]], [1, [30, 32, 38]]]));
            this.ell(mx, b.top + b.h / 2, b.w / 2 - 0.5, b.h / 2 - 0.5, '#1a1c20');
            for (const [dx, cc] of [[-2.4, '#c8302a'], [0.4, '#2a4a8a'], [2.8, '#2a2c30']]) { this.line(mx + dx, b.top + b.h / 2, mx + dx * 1.2, b.top - 7, cc, 1.2); this.circ(mx + dx * 1.2, b.top - 7.4, 0.7, '#c8a040'); }
        } else if (kind === 'bench') {
            this.objShadow(b, 0.45);
            const lux = ShopCtx.fam(S.style) === 'lux', cc = lux ? [58, 62, 72] : [138, 90, 58];
            this.prism(b, cc, HDK.t(cc, 0.75), { shadow: false, topMat: lux ? 'paint' : 'wood', frontMat: lux ? 'paint' : 'wood' });
            if (!lux) for (let i = 1; i < 4; i++) this.line(b.x + 0.6, b.top + b.h * i / 4, b.x + b.w - 0.6, b.top + b.h * i / 4, 'rgba(40,24,12,0.5)', 0.35);
        } else if (kind === 'bags') {                              // sacolas da loja
            const cols = [[212, 106, 158], [244, 240, 234], [42, 44, 50]];
            for (let k = 0; k < 3; k++) {
                const x = b.x + k * b.w / 3.2, y = b.fy - 4 + (k % 2) * 2;
                this.soft(x + 1.5, y + 9, 9, 3, 0.35, 1, 1);
                this.fillRR(x, y, 9, 11, 0.6, this.lin(x, 0, x + 9, 0, [[0, HDK.t(cols[k], 1.2)], [1, HDK.t(cols[k], 0.75)]]));
                g.beginPath(); g.moveTo(x + 2, y + 0.4); g.quadraticCurveTo(x + 4.5, y - 4, x + 7, y + 0.4); g.strokeStyle = '#3a2a30'; g.lineWidth = 0.5; g.stroke();
                this.strokeRR(x, y, 9, 11, 0.6, HDA.OUT, 0.35);
            }
        } else if (kind === 'towels') {
            this.objShadow(b, 0.45);
            this.prism(b, [90, 106, 122], [70, 84, 98], { shadow: false });
            for (let k = 0; k < 4; k++) { const cc = [[244, 244, 240], [58, 160, 216], [244, 244, 240], [232, 90, 80]][k], px = b.x + 3 + k * (b.w - 5) / 4; this.ell(px + 1, b.top + b.h / 2, 2.6, b.h / 2 - 1, this.lin(px - 2, 0, px + 3, 0, [[0, HDK.t(cc, 1.05)], [1, HDK.t(cc, 0.75)]])); }
        } else if (kind === 'posts') {                             // postes de fila com a fita
            const n = 3, py = b.fy + b.hp;
            const pxs = []; for (let k = 0; k < n; k++) pxs.push(b.x + 2 + k * (b.w - 4) / (n - 1));
            for (const px of pxs) this.softEll(px + 1.5, py, 2.6, 1, 0.4, 0.8);
            for (let k = 0; k < n - 1; k++) { g.beginPath(); g.moveTo(pxs[k], py - 13.5); g.quadraticCurveTo((pxs[k] + pxs[k + 1]) / 2, py - 7, pxs[k + 1], py - 13.5); g.strokeStyle = '#8a1018'; g.lineWidth = 1.4; g.stroke(); g.strokeStyle = 'rgba(255,120,120,0.5)'; g.lineWidth = 0.4; g.stroke(); }
            for (const px of pxs) { this.ell(px, py - 0.5, 2.4, 0.9, '#6a6e76'); this.fillRR(px - 0.8, py - 16, 1.6, 16, 0.6, this.lin(px - 1, 0, px + 1, 0, [[0, [240, 244, 248]], [1, [120, 126, 136]]])); this.circ(px, py - 16.5, 1.4, '#e8ecf0'); }
        } else return false;
    },
});

// ================================================================= CASAS, BANCO E JOALHERIA (peças dos layouts)
Object.assign(HDPainter.prototype, {
    // Cama: estrado de madeira, colchão, lençol, travesseiros e a manta dobrada.
    p__bed(op, r, sheet, wood, big = false) {
        const S = this.S, b = S.base(r, 0.7), g = this.g, sh = HDK.C(sheet), wd = HDK.C(wood);
        this.objShadow(b, 0.5, 2);
        this.fillRR(b.x, b.fy - 0.8, b.w, b.hp + 0.8, 0.8, this.lin(0, b.fy, 0, b.fy + b.hp, [[0, HDK.t(wd, 1.0)], [1, HDK.t(wd, 0.6)]]));
        this.fillRR(b.x - 0.6, b.top - 2.2, b.w + 1.2, 4.2, 1, this.lin(0, b.top - 2.2, 0, b.top + 2, [[0, HDK.t(wd, 1.3)], [1, HDK.t(wd, 0.75)]]));       // cabeceira
        this.fillRR(b.x + 0.6, b.top + 1, b.w - 1.2, b.h - 1, 1.6, this.lin(b.x, b.top, b.x + b.w, b.top + b.h, [[0, HDK.t(sh, 1.12)], [1, HDK.t(sh, 0.9)]]));
        const pw = big ? 18 : 14, two = b.w > 70;
        for (const px of two ? [b.x + 3, b.x + b.w - pw - 3] : [b.x + 3]) {
            this.soft(px + 0.6, b.top + 4, pw, 11, 0.35, 1.2, 3);
            this.fillRR(px, b.top + 3, pw, 11, 3, this.rad(px + pw * 0.4, b.top + 6, 1, pw * 0.7, [[0, [255, 255, 255]], [1, [214, 208, 196]]]));
            this.line(px + 2, b.top + 8.5, px + pw - 2, b.top + 8.5, 'rgba(160,150,136,0.5)', 0.35);
        }
        const by = b.top + 19;
        this.fillRR(b.x + 0.4, by, b.w - 0.8, b.y + b.h - by - 1, 1.4, this.lin(0, by, 0, b.y + b.h, [[0, HDK.t(sh, 0.98)], [1, HDK.t(sh, 0.8)]]));
        this.line(b.x + 1, by + 0.5, b.x + b.w - 1, by + 0.5, HDK.css(HDK.t(sh, 1.25), 0.8), 0.6);
        this.fillRR(b.x + 0.4, by + 1.6, b.w - 0.8, 3, 0.6, HDK.css(HDK.t(sh, 0.72), 0.9));
        g.save(); this.rr(b.x + 0.4, by, b.w - 0.8, b.y + b.h - by - 1, 1.4); g.clip();
        for (let k = 0; k < 4; k++) { const yy = by + 7 + k * ((b.y + b.h - by) / 4.5); g.fillStyle = this.lin(0, yy - 1, 0, yy + 1.4, [[0, [0, 0, 0], 0], [0.5, [0, 0, 0], 0.08], [1, [0, 0, 0], 0]]); g.fillRect(b.x, yy - 1, b.w, 2.4); }
        g.restore();
        this.strokeRR(b.x, b.top - 2.2, b.w, b.h + b.hp + 2.2, 1, HDA.OUT, 0.5);
    },
    // Geladeira (de casa): frente com as duas portas e os puxadores.
    p__fridge(op, r) {
        const S = this.S, b = S.base(r, 1.9), g = this.g, x = b.x, y = b.top, w = b.w, H = b.h + b.hp;
        this.objShadow(b, 0.5, 2);
        this.fillRR(x, y, w, H, 1.6, this.lin(x, 0, x + w, 0, [[0, [252, 252, 252]], [0.55, [222, 228, 234]], [1, [160, 168, 176]]]));
        this.fillRR(x + 0.5, y + 0.5, w - 1, 2.6, 1, 'rgba(255,255,255,0.9)');
        this.line(x + 1, y + H * 0.38, x + w - 1, y + H * 0.38, 'rgba(110,118,126,0.9)', 0.5);
        this.fillRR(x + w - 3.2, y + 4.5, 1.2, H * 0.22, 0.5, '#8a9096'); this.fillRR(x + w - 3.2, y + H * 0.45, 1.2, H * 0.3, 0.5, '#8a9096');
        this.circ(x + 3, y + H * 0.5, 0.9, '#d9453a'); this.fillRR(x + 2, y + H * 0.6, 3, 4, 0.3, '#f4f0e0');
        this.strokeRR(x, y, w, H, 1.6, HDA.OUT, 0.5);
        void g;
    },
    p__safe(op, r) {
        const S = this.S, b = S.base(r, 0.9);
        this.prism(b, [58, 64, 72], [42, 48, 54], { topMat: 'steel', frontMat: 'steel' });
        const cx = b.x + b.w / 2, cy = b.top + b.h / 2, R = Math.max(2.4, Math.min(b.w, b.h) / 4);
        this.circ(cx, cy, R + 0.8, '#2a2e34'); this.circ(cx, cy, R, this.rad(cx - R * 0.3, cy - R * 0.3, 0.2, R, [[0, [200, 206, 214]], [1, [100, 108, 118]]])); this.circ(cx, cy, R * 0.4, '#d9b030');
        for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4; this.line(cx + Math.cos(an) * R * 0.6, cy + Math.sin(an) * R * 0.6, cx + Math.cos(an) * R * 0.95, cy + Math.sin(an) * R * 0.95, 'rgba(30,34,40,0.8)', 0.25); }
    },
    // Baú de madeira com cintas de ferro e o cadeado.
    p__chest(op, r) {
        const S = this.S, b = S.base(r, 0.7), g = this.g;
        this.prism(b, [146, 96, 52], [110, 68, 34], { topMat: 'wood', frontMat: 'wood' });
        for (const px of [b.x + 3, b.x + b.w - 5]) { g.fillStyle = this.lin(px, 0, px + 2, 0, [[0, [120, 124, 134]], [1, [48, 52, 60]]]); g.fillRect(px, b.top, 2, b.h + b.hp); }
        this.fillRR(b.x + b.w / 2 - 2, b.top + b.h / 2 - 2.5, 4, 5, 0.6, this.lin(0, b.top, 0, b.top + b.h, [[0, [255, 220, 100]], [1, [180, 130, 30]]])); this.circ(b.x + b.w / 2, b.top + b.h / 2, 0.6, '#3a2a10');
    },
    // Rack com a TV de tela plana (de cima: a tela acesa no tampo).
    p__tv(op, r, big = false) {
        const S = this.S, b = S.base(r, big ? 1.0 : 0.7), g = this.g;
        this.prism(b, [44, 46, 52], [30, 32, 36], { topMat: 'paint' });
        this.fillRR(b.x + 2, b.top + 1.2, b.w - 4, b.h - 2.4, 0.6, '#0c0e10');
        this.fillRR(b.x + 3, b.top + 2, b.w - 6, b.h - 4, 0.4, this.lin(0, b.top, 0, b.top + b.h, [[0, [90, 150, 210]], [0.55, [60, 110, 170]], [0.56, [50, 120, 60]], [1, [30, 80, 40]]]));
        g.fillStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.moveTo(b.x + 3, b.top + 2); g.lineTo(b.x + b.w * 0.45, b.top + 2); g.lineTo(b.x + b.w * 0.3, b.top + b.h - 2); g.lineTo(b.x + 3, b.top + b.h - 2); g.closePath(); g.fill();
        g.save(); g.globalCompositeOperation = 'screen'; g.fillStyle = this.rad(b.x + b.w / 2, b.top + b.h / 2, 0, b.w * 0.8, [[0, [120, 170, 255], 0.22], [1, [120, 170, 255], 0]]); g.fillRect(b.x - b.w * 0.3, b.top - b.w * 0.6, b.w * 1.6, b.w * 1.4); g.restore();
    },
    // Sofá: assento, encosto do lado `back`, braços e almofadas.
    p__sofa(op, r, col, back = 'n') {
        const S = this.S, b = S.base(r, 0.8), g = this.g, c = HDK.C(col);
        if (b.h > b.w * 1.25) return this.sofaV(b, c);
        this.objShadow(b, 0.5, 2);
        this.fillRR(b.x, b.fy - 1, b.w, b.hp + 1, 1, this.lin(0, b.fy, 0, b.fy + b.hp, [[0, HDK.t(c, 0.8)], [1, HDK.t(c, 0.5)]]));
        this.fillRR(b.x, b.top, b.w, b.h, 2, this.lin(b.x, b.top, b.x + b.w, b.top + b.h, [[0, HDK.t(c, 1.08)], [1, HDK.t(c, 0.82)]]));
        const bk = back === 'n' ? [b.x, b.top, b.w, 7] : [b.x, b.top + b.h - 7, b.w, 7];
        this.fillRR(...bk, 2, this.lin(0, bk[1], 0, bk[1] + 7, [[0, HDK.t(c, 0.95)], [1, HDK.t(c, 0.68)]]));
        const n = Math.max(2, Math.round(b.w / 22)), sy = back === 'n' ? b.top + 7.5 : b.top + 0.8, sh = b.h - 8.3;
        for (let i = 0; i < n; i++) { const sx = b.x + 2 + i * (b.w - 4) / n; this.fillRR(sx + 0.4, sy, (b.w - 4) / n - 0.8, sh, 1.6, this.lin(sx, sy, sx, sy + sh, [[0, HDK.t(c, 1.18)], [1, HDK.t(c, 0.9)]])); this.strokeRR(sx + 0.4, sy, (b.w - 4) / n - 0.8, sh, 1.6, HDK.css(HDK.t(c, 0.5), 0.6), 0.3); }
        for (const ax of [b.x, b.x + b.w - 3]) this.fillRR(ax, b.top + 0.5, 3, b.h - 1, 1.4, this.lin(ax, 0, ax + 3, 0, [[0, HDK.t(c, 1.1)], [1, HDK.t(c, 0.7)]]));
        const px = b.x + 4, py = back === 'n' ? b.top + 8.5 : b.top + 1.5;
        this.fillRR(px, py, 9, 7, 2, this.rad(px + 3.5, py + 2.5, 0.5, 7, [[0, HDK.t(c, 1.55)], [1, HDK.t(c, 1.05)]]));
        this.strokeRR(b.x, b.top, b.w, b.h + b.hp, 2, HDA.OUT, 0.5);
        void g;
    },
    // Sofá comprido no sentido norte-sul (encostado numa parede lateral): encosto do lado da parede mais perto.
    sofaV(b, c) {
        const S = this.S, west = b.x + b.w / 2 < S.X(S.W / 2), g = this.g;
        this.objShadow(b, 0.5, 2);
        this.fillRR(b.x, b.fy - 1, b.w, b.hp + 1, 1, this.lin(0, b.fy, 0, b.fy + b.hp, [[0, HDK.t(c, 0.8)], [1, HDK.t(c, 0.5)]]));
        this.fillRR(b.x, b.top, b.w, b.h, 2, this.lin(b.x, b.top, b.x + b.w, b.top + b.h, [[0, HDK.t(c, 1.08)], [1, HDK.t(c, 0.82)]]));
        const bx = west ? b.x : b.x + b.w - 7;
        this.fillRR(bx, b.top, 7, b.h, 2, this.lin(bx, 0, bx + 7, 0, west ? [[0, HDK.t(c, 0.7)], [1, HDK.t(c, 0.98)]] : [[0, HDK.t(c, 0.98)], [1, HDK.t(c, 0.7)]]));
        const n = Math.max(2, Math.round(b.h / 22)), sx = west ? b.x + 7.5 : b.x + 0.8, sw = b.w - 8.3;
        for (let i = 0; i < n; i++) { const sy = b.top + 3 + i * (b.h - 6) / n; this.fillRR(sx, sy + 0.4, sw, (b.h - 6) / n - 0.8, 1.6, this.lin(sx, sy, sx + sw, sy, [[0, HDK.t(c, 1.18)], [1, HDK.t(c, 0.9)]])); this.strokeRR(sx, sy + 0.4, sw, (b.h - 6) / n - 0.8, 1.6, HDK.css(HDK.t(c, 0.5), 0.6), 0.3); }
        for (const ay of [b.top, b.top + b.h - 3]) this.fillRR(b.x + 0.5, ay, b.w - 1, 3, 1.4, this.lin(0, ay, 0, ay + 3, [[0, HDK.t(c, 1.1)], [1, HDK.t(c, 0.7)]]));
        this.strokeRR(b.x, b.top, b.w, b.h + b.hp, 2, HDA.OUT, 0.5);
        void g;
    },
    // Escrivaninha com o notebook aberto.
    p__desk(op, r) {
        const S = this.S, b = S.base(r, 0.8);
        this.prism(b, [122, 90, 58], [90, 62, 36], { topMat: 'wood', frontMat: 'wood' });
        const x = b.x + 4, y = b.top + 3;
        this.soft(x + 1, y + 1, 22, 18, 0.4, 1.2, 1);
        this.fillRR(x, y, 22, 13, 1, '#2a2c32'); this.fillRR(x + 1.2, y + 1.2, 19.6, 10.4, 0.5, this.lin(x, y, x + 22, y + 13, [[0, [120, 200, 240]], [1, [40, 120, 180]]]));
        this.g.fillStyle = 'rgba(255,255,255,0.85)'; this.g.fillRect(x + 3, y + 3.5, 10, 0.9); this.g.fillRect(x + 3, y + 5.5, 7, 0.7);
        this.fillRR(x - 0.5, y + 13.5, 23, 5, 1, this.lin(0, y + 13.5, 0, y + 18.5, [[0, [180, 186, 196]], [1, [110, 116, 126]]]));
        for (let j = 0; j < 3; j++) for (let i = 0; i < 9; i++) this.g.fillRect(x + 1.2 + i * 2.3, y + 14.4 + j * 1.2, 1.7, 0.8);
        this.strokeRR(x, y, 22, 18.5, 1, HDA.OUT, 0.4);
    },
    // Câmera de banco (com a cor do LED).
    p__cam(op, x, col) { this.p__camArt(op, x); },
    // Vitrine da joalheria: base de madeira, veludo, joias e o reflexo do vidro.
    p__vitrine(op, r, P, seed) {
        const S = this.S, b = S.base(r, 0.95), g = this.g, rng = Pixel.rng(seed), trim = HDK.C(P.trim), vel = HDK.C(P.velvet);
        this.objShadow(b, 0.5, 1);
        this.fillRR(b.x, b.fy - 0.8, b.w, b.hp + 0.8, 0.6, this.lin(0, b.fy, 0, b.fy + b.hp, [[0, [70, 52, 40]], [1, [30, 22, 16]]]));
        this.line(b.x + 0.6, b.fy + 0.8, b.x + b.w - 0.6, b.fy + 0.8, HDK.css(trim), 0.5);
        this.fillRR(b.x, b.top, b.w, b.h, 0.8, this.lin(b.x, b.top, b.x + b.w, b.top + b.h, [[0, [214, 236, 246]], [1, [130, 160, 176]]]));
        this.fillRR(b.x + 1.6, b.top + 1.6, b.w - 3.2, b.h - 3.2, 0.5, this.rad(b.x + b.w / 2, b.top + b.h / 2, 1, Math.max(b.w, b.h) * 0.7, [[0, HDK.t(vel, 1.3)], [1, HDK.t(vel, 0.75)]]));
        const gems = [[255, 248, 208], [232, 244, 255], [255, 74, 106], [74, 176, 255], [58, 224, 138], [255, 210, 58]];
        for (let x = b.x + 4.5; x < b.x + b.w - 4; x += 6.5) for (let y = b.top + 4.5; y < b.top + b.h - 3.5; y += 6.5) {
            const k = rng(), gem = gems[Math.floor(rng() * gems.length)];
            if (k < 0.35) { g.beginPath(); g.arc(x, y, 1.8, 0, Math.PI * 2); g.strokeStyle = HDK.css(trim); g.lineWidth = 0.6; g.stroke(); this.circ(x, y - 1.8, 0.8, HDK.css(gem)); }
            else if (k < 0.6) { g.beginPath(); g.moveTo(x - 3, y - 1); g.quadraticCurveTo(x, y + 3.2, x + 3, y - 1); g.strokeStyle = HDK.css(trim); g.lineWidth = 0.4; g.stroke(); this.circ(x, y + 1.9, 0.9, HDK.css(gem)); }
            else if (k < 0.8) { this.fillRR(x - 1.8, y - 1.6, 3.6, 3.2, 1, '#e8e4dc'); this.circ(x, y, 1, '#f8f8f4'); this.line(x, y, x + 0.6, y - 0.6, '#2a2a2a', 0.2); }
            else this.circ(x, y, 0.9, HDK.css(gem));
            if (rng() < 0.3) { g.save(); g.globalCompositeOperation = 'screen'; this.circ(x + 0.6, y - 0.8, 1.6, 'rgba(255,255,255,0.35)'); g.restore(); }
        }
        g.fillStyle = 'rgba(255,255,255,0.2)'; g.beginPath(); g.moveTo(b.x + b.w * 0.1, b.top + b.h); g.lineTo(b.x + b.w * 0.5, b.top); g.lineTo(b.x + b.w * 0.62, b.top); g.lineTo(b.x + b.w * 0.22, b.top + b.h); g.closePath(); g.fill();
        this.strokeRR(b.x, b.top, b.w, b.h + b.hp, 0.8, HDA.OUT, 0.5);
    },
});
