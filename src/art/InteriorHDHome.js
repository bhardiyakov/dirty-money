// ============================================================================
// InteriorHDHome — o ESCONDERIJO (o barraco do protagonista, map/SafeHouse.js) em alta definição. A pixel art dele é um quadro só
// (art/HouseArt.interior); aqui ele é repintado peça a peça no mesmo enquadramento (HouseArt.IN, 20 px/u da arte × Q): contrapiso
// rachado e manchado, parede de zinco e de bloco sem reboco (alta, como nas lojas), janela tapada com plástico, colchão nos paletes,
// armário velho de porta empenada, botijão e fogareiro, geladeira amassada, caixote, balde da goteira, varal e a lâmpada pelada.
// ============================================================================

Object.assign(InteriorHD, {
    // Devolve o "canvas" HD do esconderijo (mesma interface do PixelCanvas para o Interiors).
    safehouse() {
        const t0 = performance.now(), SH = SafeHouse, IN = HouseArt.IN, PPU = 20, K = HouseArt.K;
        const S = {
            style: 'home_simple', seed: 8080, W: SH.W, D: SH.D, T: SH.T, H: SH.H, PPU, K, IN, m: false,
            wpx: Math.round((IN.x1 - IN.x0) * PPU), hpxTot: Math.round((IN.z1 - IN.z0) * PPU), door: { x0: SH.door.x0, x1: SH.door.x1 }, lights: [],
            X(x) { return Math.round((x - IN.x0) * PPU); }, Y(z) { return Math.round((IN.z1 - z) * PPU); }, hp(h) { return Math.round(h * K * PPU); },
            P(x) { return x; }, R(x0, z0, x1, z1) { return [x0, z0, x1, z1]; },
            base(r, h) { const X = this.X.bind(this), Y = this.Y.bind(this); return { x: X(r[0]), y: Y(r[3]), w: X(r[2]) - X(r[0]), h: Y(r[1]) - Y(r[3]), hp: Math.max(2, this.hp(h)), get top() { return this.y - this.hp; }, get fy() { return this.y + this.h - this.hp; } }; },
            band(xa, xb) { const x0 = this.X(Math.min(xa, xb)), x1 = this.X(Math.max(xa, xb)); return { x: x0, y: this.nY - this.faceH, w: x1 - x0, h: this.faceH, base: this.nY }; },
        };
        S.nY = S.Y(S.D - S.T); S.faceH = S.hp(S.H);
        S.lights.push({ x: S.X(4.6), y: S.Y(4.6) + 12, r: 95, col: [255, 214, 140], a: 0.6 });
        S.lights.push({ x: S.X((SH.door.x0 + SH.door.x1) / 2), y: S.Y(0.3), r: 44, col: [255, 236, 190], a: 0.35 });
        const Q = this.q(S.wpx, S.hpxTot), cv = document.createElement('canvas'); cv.width = S.wpx * Q; cv.height = S.hpxTot * Q;
        const g = cv.getContext('2d', InteriorHD.CTX);
        g.setTransform(Q, 0, 0, Q, 0, 0); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.lineJoin = 'round'; g.lineCap = 'round';
        const P = new HDPainter(g, S, Q, cv);
        P.safehouse();
        P.post({ vignette: 0.5 });
        this.lastMs = performance.now() - t0;
        return this.wrap(cv, Q);
    },
});

Object.assign(HDPainter.prototype, {
    safehouse() {
        const S = this.S, SH = SafeHouse, g = this.g, T = S.T, W = S.W, D = S.D, X = (x) => S.X(x), Y = (z) => S.Y(z), F = {};
        for (const f of SH.furniture) F[f.kind] = f;
        const x0 = X(T), x1 = X(W - T), y0 = S.nY, y1 = Y(T), cut = X(SH.MAT_CUT), top = this.top, cH = Math.round(T * S.PPU), rng = Pixel.rng(8080);
        this.base();
        // ---------------------------------------------------------------- piso: contrapiso de cimento grosso, rachado e manchado
        g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
        this.fConcrete(x0, y0, x1 - x0, y1 - y0, [124, 118, 104], [96, 90, 78], 40);
        for (const [x, z, n, s] of [[4.0, 6.6, 60, 1], [6.2, 4.6, 40, 2], [2.6, 4.4, 34, 3], [8.6, 3.4, 30, 4]]) this.crack(X(x), Y(z), n, Pixel.rng(s), [118, 112, 100]);
        const stain = (cx, cy, r, col, a) => { g.fillStyle = this.rad(cx, cy, 0, r, [[0, col, a], [0.6, col, a * 0.6], [1, col, 0]]); g.fillRect(cx - r, cy - r, r * 2, r * 2); };
        stain(X(4.65), Y(3.55), 18, [24, 34, 44], 0.45);                  // chão molhado em volta do balde
        stain(X(1.4), Y(4.6), 14, [28, 40, 24], 0.4);                     // mofo no canto do colchão
        stain(X(6.0), Y(5.6), 12, [42, 28, 14], 0.4);                     // gordura do fogareiro
        stain(X(7.4), Y(1.5), 11, [70, 50, 26], 0.35);                    // barro que entra pela porta
        g.restore();
        this.floorFx();
        // papelão na entrada e um par de chinelos
        { const x = X(6.7), y = Y(1.3); this.soft(x + 0.6, y + 0.8, 28, 16, 0.3, 1, 0.5); this.fillRR(x, y, 28, 16, 0.4, this.lin(x, y, x + 28, y + 16, [[0, [196, 160, 100]], [1, [150, 116, 66]]])); this.line(x + 4, y + 6, x + 24, y + 6, 'rgba(110,80,40,0.6)', 0.4); this.line(x + 8, y + 10, x + 20, y + 11, 'rgba(110,80,40,0.6)', 0.4); this.grain(x, y, 28, 16, 0.3, 26); }
        { const x = X(5.3), y = Y(2.0); for (const [dx, dy] of [[0, 0], [6, 2]]) { this.soft(x + dx + 0.5, y + dy + 0.6, 4, 9, 0.35, 0.6, 2); this.fillRR(x + dx, y + dy, 4, 9, 2, this.lin(x + dx, 0, x + dx + 4, 0, [[0, [70, 150, 230]], [1, [30, 100, 190]]])); this.line(x + dx + 2, y + dy + 1.6, x + dx + 0.6, y + dy + 3.6, '#e8e8e8', 0.4); this.line(x + dx + 2, y + dy + 1.6, x + dx + 3.4, y + dy + 3.6, '#e8e8e8', 0.4); } }

        // ---------------------------------------------------------------- parede do fundo (alta): zinco a oeste, bloco sem reboco a leste
        this.zinc(x0, top, cut - x0, y0 - top, rng);
        g.save(); g.beginPath(); g.rect(cut, top, x1 - cut, y0 - top); g.clip();
        this.blocks(cut, top, x1 - cut, y0 - top, rng);
        g.restore();
        this.fillRR(cut - 0.6, top, 1.6, y0 - top, 0.4, '#3a3630');                                                  // emenda
        g.fillStyle = this.lin(0, top, 0, top + 9, [[0, HDA.SH, 0.6], [1, HDA.SH, 0]]); g.fillRect(x0, top, x1 - x0, 9);
        // mofo subindo do pé e a mancha da goteira escorrendo do teto
        for (let x = x0; x < x1; x += 1.2) { const h = 2 + Pixel.noise(x, 0, 6, 5, 99, 99) * 7; g.fillStyle = this.lin(0, y0 - h, 0, y0, [[0, [40, 52, 34], 0], [1, [40, 52, 34], 0.55]]); g.fillRect(x, y0 - h, 1.3, h); }
        { const lx = X(4.65); g.fillStyle = this.lin(0, top, 0, y0, [[0, [30, 34, 40], 0.4], [1, [30, 34, 40], 0.1]]); g.beginPath(); g.moveTo(lx - 3, top); for (let yy = top; yy <= y0; yy += 2) g.lineTo(lx - 3 + Math.sin(yy * 0.4) * 1.2, yy); g.lineTo(lx + 3, y0); for (let yy = y0; yy >= top; yy -= 2) g.lineTo(lx + 3 + Math.sin(yy * 0.5) * 1.2, yy); g.closePath(); g.fill(); }
        // janela do fundo, sem vidro, tapada com plástico leitoso preso com fita
        { const w = SH.windows.find((q) => q.wall === 'N'), wx0 = X(w.a), wx1 = X(w.b), H = y0 - top, yb = y0 - H * w.y0 / S.H, yt = y0 - H * w.y1 / S.H;
          this.soft(wx0, yt + 1, wx1 - wx0 + 2, yb - yt + 2, 0.45, 1.4, 0.5);
          this.fillRR(wx0 - 2, yt - 2, wx1 - wx0 + 4, yb - yt + 4, 0.6, this.lin(0, yt, 0, yb, [[0, [90, 66, 42]], [1, [52, 38, 24]]]));
          g.fillStyle = this.lin(wx0, yt, wx1, yb, [[0, [196, 212, 218]], [1, [140, 160, 170]]]); g.fillRect(wx0, yt, wx1 - wx0, yb - yt);
          this.clip(wx0, yt, wx1 - wx0, yb - yt, () => { for (let k = 0; k < 4; k++) this.line(wx0 + k * 7, yt, wx0 + k * 7 + 10, yb, 'rgba(255,255,255,0.35)', 0.8); this.line(wx0 + 2, yt + 1, wx1 - 3, yb - 2, 'rgba(90,110,120,0.6)', 0.4); });
          this.fillRR(wx0 - 1, yt - 0.5, 6, 2, 0.3, 'rgba(232,214,150,0.95)'); this.fillRR(wx1 - 5, yb - 1.5, 6, 2, 0.3, 'rgba(232,214,150,0.95)'); }
        // varal de parede a parede, com uma toalha e uma camiseta
        { const ya = top + (y0 - top) * 0.3, xa = x0 + 2, xb = x1 - 2, sag = (x) => ya + Math.sin((x - xa) / (xb - xa) * Math.PI) * 6;
          g.beginPath(); g.moveTo(xa, ya); g.quadraticCurveTo((xa + xb) / 2, ya + 12, xb, ya); g.strokeStyle = '#1a1410'; g.lineWidth = 0.4; g.stroke();
          for (const [xx, w, h, c] of [[X(3.0), 14, 18, [217, 69, 58]], [X(6.0), 12, 14, [232, 228, 216]]]) {
            const yy = sag(xx + w / 2) - 0.5;
            this.soft(xx + 1, yy + 1.4, w, h, 0.4, 1.4, 0.5);
            g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + w, yy); g.lineTo(xx + w + 0.6, yy + h); for (let k = 0; k <= 6; k++) g.lineTo(xx + w - k * w / 6, yy + h + (k % 2 ? 0.8 : -0.2)); g.closePath();
            g.fillStyle = this.lin(xx, 0, xx + w, 0, [[0, HDK.t(c, 1.15)], [0.5, c], [1, HDK.t(c, 0.75)]]); g.fill(); g.strokeStyle = HDA.OUT; g.lineWidth = 0.35; g.stroke();
            for (let k = 1; k < 4; k++) this.line(xx + w * k / 4, yy + 1, xx + w * k / 4 + 0.4, yy + h - 1, 'rgba(0,0,0,0.12)', 0.5);
            for (const px of [xx + 2, xx + w - 2]) this.fillRR(px - 0.6, yy - 1.4, 1.2, 2.6, 0.3, '#d8b030');
          } }
        // tampa da parede do fundo, colunas laterais (tábua a oeste, zinco a leste)
        this.slab(X(0), top - cH, X(W) - X(0), cH, [114, 108, 96]);
        const sY = Y(0), sH = S.hp(0.5), fTop = sY - sH - cH;
        this.beam(X(0), top - cH, X(T) - X(0), fTop - top + 2 * cH, [106, 90, 68], 1);
        this.clip(X(W - T), top - cH, X(W) - X(W - T), fTop - top + 2 * cH, () => this.zinc(X(W - T), top - cH, X(W) - X(W - T), fTop - top + 2 * cH, rng));
        g.strokeStyle = HDA.OUT; g.lineWidth = 0.5; g.strokeRect(X(W - T), top - cH, X(W) - X(W - T), fTop - top + 2 * cH);
        for (const [fx, dir] of [[X(T), 1], [X(W - T) - 5, -1]]) { g.fillStyle = this.lin(fx, 0, fx + 5, 0, dir > 0 ? [[0, [30, 24, 18], 0.8], [1, [30, 24, 18], 0]] : [[0, [30, 24, 18], 0], [1, [30, 24, 18], 0.8]]); g.fillRect(fx, y0, 5, y1 - y0); }
        // parede da frente (baixa): zinco/bloco, a janela de plástico, o vão da porta
        const d0 = X(SH.door.x0), d1 = X(SH.door.x1);
        for (const [xa, xb] of [[X(T), d0], [d1, X(W - T)]]) {
            if (xb <= xa) continue;
            g.fillStyle = this.lin(0, sY - sH, 0, sY, [[0, [140, 136, 126]], [1, [90, 86, 78]]]); g.fillRect(xa, sY - sH, xb - xa, sH);
            this.slab(xa, fTop, xb - xa, cH, [114, 108, 96]);
        }
        { const w = SH.windows.find((q) => q.wall === 'S'), a = X(w.a), b = X(w.b); this.fillRR(a, fTop + 2, b - a, cH - 3, 0.4, this.lin(0, fTop, 0, fTop + cH, [[0, [196, 212, 218]], [1, [140, 160, 170]]])); this.strokeRR(a, fTop + 2, b - a, cH - 3, 0.4, 'rgba(60,40,24,0.9)', 0.6); }
        { const ty = Y(T); g.fillStyle = this.lin(0, ty, 0, sY, [[0, [150, 144, 132]], [1, [96, 92, 84]]]); g.fillRect(d0, ty, d1 - d0, sY - ty); this.grain(d0, ty, d1 - d0, sY - ty, 0.3, 27); }
        g.fillStyle = this.lin(0, sY, 0, sY - 34, [[0, [255, 236, 180], 0.32], [1, [255, 236, 180], 0]]); g.fillRect(d0, sY - 34, d1 - d0, 34);
        for (const dx of [d0 - 3, d1]) this.beam(dx, fTop, 3, sY - fTop, [74, 54, 36], 1);

        // ---------------------------------------------------------------- móveis
        const B = (f) => S.base([f.x0, f.z0, f.x1, f.z1], f.h);
        // colchão de espuma em cima de dois paletes, cobertor xadrez embolado e travesseiro achatado
        { const b = B(F.bed), t = b.top;
          this.objShadow(b, 0.55, 2);
          this.fillRR(b.x, b.fy - 0.8, b.w, b.hp + 0.8, 0.5, this.lin(0, b.fy, 0, b.fy + b.hp, [[0, [196, 160, 102]], [1, [110, 84, 48]]]));
          for (let i = 2; i < b.w - 2; i += 6) this.fillRR(b.x + i, b.fy + 0.6, 2.6, b.hp - 1.2, 0.3, '#3a2a18');
          this.fillRR(b.x + 1, t, b.w - 2, b.h - 1, 2.4, this.lin(b.x, t, b.x + b.w, t + b.h, [[0, [236, 222, 160]], [1, [196, 178, 112]]]));
          for (const [sx, sz, r] of [[0.35, 0.3, 8], [0.6, 0.75, 10], [0.3, 0.8, 6]]) { const cx = b.x + b.w * sx, cy = t + b.h * sz; g.fillStyle = this.rad(cx, cy, 0, r, [[0, [138, 116, 64], 0.5], [0.7, [138, 116, 64], 0.25], [1, [138, 116, 64], 0]]); g.fillRect(cx - r, cy - r, r * 2, r * 2); }
          this.soft(b.x + 4.6, t + 4, b.w - 8, 13, 0.3, 1.2, 4);
          this.fillRR(b.x + 4, t + 3, b.w - 8, 13, 4, this.rad(b.x + b.w * 0.4, t + 7, 1, b.w * 0.6, [[0, [250, 248, 240]], [1, [196, 190, 172]]]));
          const cy = t + b.h * 0.45;
          g.save(); g.beginPath(); g.moveTo(b.x + 2.5, cy + 3);
          for (let x = b.x + 2.5; x <= b.x + b.w - 2.5; x += 2) g.lineTo(x, cy + 3 + Math.sin((x - b.x) * 0.35) * 2);
          g.lineTo(b.x + b.w - 2.5, t + b.h - 3); g.lineTo(b.x + 2.5, t + b.h - 3); g.closePath(); g.clip();
          const s = 4.6; for (let j = 0; j * s < b.h; j++) for (let i = 0; i * s < b.w; i++) { g.fillStyle = (i + j) % 2 ? '#7a3a34' : '#a85848'; g.fillRect(b.x + i * s, cy + j * s - 2, s, s); }
          for (let k = 0; k < 5; k++) { const yy = cy + 4 + k * 5; g.fillStyle = this.lin(0, yy - 1.4, 0, yy + 1.6, [[0, [0, 0, 0], 0], [0.5, [0, 0, 0], 0.22], [1, [0, 0, 0], 0]]); g.fillRect(b.x, yy - 1.4, b.w, 3); }
          g.restore();
          this.strokeRR(b.x, t, b.w, b.h + b.hp, 2, HDA.OUT, 0.5); }
        // lata escondida (leite em pó, enferrujada)
        { const b = B(F.tin), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
          this.softEll(cx + 1.2, cy + 1.4, 5.2, 4, 0.5, 1.2);
          this.circ(cx, cy, 5, '#5a5448'); this.circ(cx, cy, 4.4, this.rad(cx - 1.4, cy - 1.4, 0.3, 4.6, [[0, [236, 232, 220]], [1, [170, 164, 150]]])); this.circ(cx, cy, 3.4, 'rgba(120,116,104,0.5)');
          for (const [dx, dy] of [[-2.6, -2], [2, 2.4], [1.4, -3]]) this.circ(cx + dx, cy + dy, 0.8, 'rgba(154,90,50,0.8)'); }
        // armário velho: porta empenada entreaberta, as poucas mudas no cabide, caixa de papelão em cima e o espelhinho rachado
        { const b = B(F.wardrobe), t = b.top, H = b.h + b.hp;
          this.objShadow(b, 0.55, 3);
          this.fillRR(b.x, t, b.w, H, 0.8, this.lin(b.x, 0, b.x + b.w, 0, [[0, [138, 100, 60]], [1, [84, 58, 32]]]));
          this.faceMat('wood', b.x, t, b.w, H, [122, 86, 52], 'front');
          const ox = b.x + b.w / 2, iy = t + 6, ih = H - 9;
          this.fillRR(ox, iy, b.w / 2 - 2, ih, 0.4, '#1c140c');
          const hang = [[232, 224, 208], [47, 111, 191], [192, 57, 43], [58, 61, 70], [90, 122, 154]];
          this.line(ox + 0.6, iy + 2, ox + b.w / 2 - 2.6, iy + 2, '#8a8e96', 0.5);
          hang.forEach((c, i) => { const hx = ox + 1.6 + i * (b.w / 2 - 4) / hang.length; this.fillRR(hx, iy + 2.4, 3.2, ih * (0.55 + (i % 2) * 0.2), 0.8, this.lin(hx, 0, hx + 3.2, 0, [[0, HDK.t(c, 1.2)], [1, HDK.t(c, 0.7)]])); });
          g.beginPath(); g.moveTo(ox, iy - 0.6); g.lineTo(ox + b.w * 0.16, iy + 1.4); g.lineTo(ox + b.w * 0.16, iy + ih + 0.4); g.lineTo(ox, iy + ih + 0.6); g.closePath(); g.fillStyle = this.lin(ox, 0, ox + b.w * 0.16, 0, [[0, [150, 110, 66]], [1, [100, 70, 40]]]); g.fill(); g.strokeStyle = HDA.OUT; g.lineWidth = 0.35; g.stroke();
          this.fillRR(b.x + 2, iy, b.w / 2 - 3, ih, 0.4, this.lin(b.x, 0, b.x + b.w / 2, 0, [[0, [156, 116, 72]], [1, [112, 80, 46]]])); this.circ(b.x + b.w / 2 - 2.6, iy + ih / 2, 0.7, '#d8b030');
          this.fillRR(b.x + 5, iy + 3, 5, 4, 0.3, this.lin(0, iy, 0, iy + 4, [[0, [214, 222, 228]], [1, [150, 160, 168]]])); this.line(b.x + 5.6, iy + 3.4, b.x + 9.2, iy + 6.4, 'rgba(60,66,72,0.8)', 0.3);
          this.soft(b.x + 4.6, t - 5.4, 16, 10, 0.4, 1, 0.5); this.fillRR(b.x + 4, t - 6, 16, 10, 0.5, this.lin(b.x + 4, t - 6, b.x + 20, t + 4, [[0, [220, 176, 120]], [1, [170, 128, 76]]])); this.line(b.x + 4, t - 2, b.x + 20, t - 2, 'rgba(120,84,40,0.6)', 0.4);
          this.strokeRR(b.x, t, b.w, H, 0.8, HDA.OUT, 0.5); }
        // botijão de gás (P13 laranja) com a mangueira até o fogareiro
        { const b = B(F.gas), cx = b.x + b.w / 2, cy = b.y + b.h / 2 - 2;
          this.softEll(cx + 1.6, cy + 3, 5.4, 3.6, 0.5, 1.4);
          this.circ(cx, cy, 5.2, this.rad(cx - 1.6, cy - 1.6, 0.3, 5.4, [[0, [250, 160, 80]], [0.7, [200, 96, 32]], [1, [130, 56, 16]]]));
          this.circ(cx, cy, 2.2, '#3a3d46'); this.circ(cx, cy, 1, '#9aa0a8');
          g.beginPath(); g.moveTo(cx + 1, cy); g.quadraticCurveTo(cx + 6, cy + 4, cx + 9, cy - 1); g.strokeStyle = '#2a2c30'; g.lineWidth = 0.8; g.stroke(); }
        // fogareiro de duas bocas em cima de um caixote, com a panela de arroz
        { const b = B(F.stove), t = b.top;
          this.objShadow(b, 0.5, 1);
          this.fillRR(b.x, b.fy - 0.8, b.w, b.hp + 0.8, 0.4, this.lin(0, b.fy, 0, b.fy + b.hp, [[0, [196, 160, 102]], [1, [110, 84, 48]]]));
          for (let j = 1.6; j < b.hp; j += 2.6) this.line(b.x + 0.6, b.fy + j, b.x + b.w - 0.6, b.fy + j, '#3a2a18', 0.5);
          this.fillRR(b.x + 1.5, t, b.w - 3, b.h - 1, 1, this.lin(b.x, t, b.x + b.w, t + b.h, [[0, [92, 96, 104]], [1, [36, 38, 42]]]));
          for (const bx of [b.x + 8, b.x + b.w - 9]) { const by = t + b.h / 2; this.circ(bx, by, 4.2, '#1a1b1e'); g.beginPath(); g.arc(bx, by, 3, 0, Math.PI * 2); g.strokeStyle = '#4a4e56'; g.lineWidth = 0.5; g.stroke(); }
          const px = b.x + b.w - 9, py = t + b.h / 2 - 1;
          this.circ(px + 0.6, py + 0.8, 5.4, 'rgba(0,0,0,0.4)'); this.circ(px, py, 5.2, this.lin(px - 5, 0, px + 5, 0, [[0, [220, 224, 230]], [1, [110, 116, 126]]])); this.circ(px, py, 4, this.rad(px, py, 0.5, 4, [[0, [250, 248, 238]], [1, [214, 206, 186]]]));
          for (let k = 0; k < 10; k++) this.circ(px - 2.4 + rng() * 4.8, py - 2.4 + rng() * 4.8, 0.35, 'rgba(255,255,255,0.9)');
          this.fillRR(px + 5, py - 1, 4.4, 1.6, 0.5, '#2a2c30');
          g.save(); g.globalAlpha = 0.3; for (let k = 0; k < 3; k++) this.ell(px - 1 + k * 1.4, py - 7 - k * 3, 2.4, 1.6, '#f4f6f8'); g.restore(); }
        // geladeira pequena e velha: amassada, ferrugem no pé, ímã de pizzaria e o pote de sorvete (feijão dentro)
        { const f = F.fridge, r = [f.x0, f.z0, f.x1, f.z1];
          this.p__fridge(null, r);
          const b = S.base(r, 1.9), x = b.x, y = b.top, w = b.w, H = b.h + b.hp;
          g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgba(232,222,190,0.7)'; g.fillRect(x, y, w, H); g.restore();
          for (let i = 1; i < w - 1; i += 1.4) if (Pixel.hash(i, 3, 7) < 0.5) this.ell(x + i, y + H - 1.2, 0.8, 1.4, 'rgba(154,90,50,0.8)');
          g.fillStyle = this.rad(x + 8, y + 9, 0, 5, [[0, [60, 58, 50], 0.3], [1, [60, 58, 50], 0]]); g.fillRect(x + 3, y + 4, 10, 10);
          this.soft(x + 4.6, y - 4.4, 12, 8, 0.4, 0.8, 1); this.fillRR(x + 4, y - 5, 12, 8, 1.2, this.lin(x + 4, 0, x + 16, 0, [[0, [252, 252, 250]], [1, [196, 196, 190]]])); this.ell(x + 10, y - 4.6, 5.4, 1.4, '#e8e8e4'); }
        // caixote de feira (o baú): ripas, uma sacola e um par de tênis velho dentro
        { const b = B(F.chest), t = b.top;
          this.objShadow(b, 0.5, 1);
          this.fillRR(b.x, b.fy - 0.8, b.w, b.hp + 0.8, 0.4, this.lin(0, b.fy, 0, b.fy + b.hp, [[0, [210, 170, 112]], [1, [120, 90, 50]]]));
          this.fillRR(b.x + 0.6, t, b.w - 1.2, b.h - 1, 0.6, '#3a2a18');
          for (let j = 0; j < b.h - 1; j += 5) this.fillRR(b.x + 0.6, t + j, b.w - 1.2, 2.2, 0.4, this.lin(0, t + j, 0, t + j + 2.2, [[0, [214, 176, 120]], [1, [160, 124, 76]]]));
          this.fillRR(b.x + 4, t + 3, 9, 7, 1.4, this.lin(b.x + 4, t + 3, b.x + 13, t + 10, [[0, [250, 250, 248]], [1, [200, 200, 196]]]));
          for (const dx of [15, 18]) { this.fillRR(b.x + dx, t + 6, 3, 5, 1.2, this.lin(0, t + 6, 0, t + 11, [[0, [250, 250, 252]], [1, [170, 170, 176]]])); this.fillRR(b.x + dx, t + 10, 3, 1, 0.4, '#5a5a60'); }
          this.strokeRR(b.x, t, b.w, b.h + b.hp, 0.6, HDA.OUT, 0.5); }
        // balde azul pegando a goteira
        { const b = B(F.bucket), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
          this.softEll(cx + 1.4, cy + 1.6, 5.4, 4, 0.5, 1.2);
          this.circ(cx, cy, 5.2, this.lin(cx - 5, 0, cx + 5, 0, [[0, [70, 130, 210]], [1, [24, 70, 150]]]));
          this.circ(cx, cy, 4.2, this.rad(cx - 1, cy - 1, 0.5, 4.4, [[0, [130, 180, 214]], [1, [70, 118, 160]]]));
          for (const rr of [1.2, 2.4, 3.4]) { g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.strokeStyle = 'rgba(220,240,255,0.5)'; g.lineWidth = 0.25; g.stroke(); }
          for (const dy of [-9, -6]) this.ell(cx, cy + dy, 0.5, 0.8, 'rgba(160,200,230,0.9)'); }

        // ---------------------------------------------------------------- a lâmpada pelada no fio de gambiarra
        const bx = X(4.6) + 0.5, by = Y(4.6);
        g.fillStyle = this.lin(0, top, 0, by - 6, [[0, [26, 20, 16], 0.9], [1, [26, 20, 16], 0.95]]); g.fillRect(bx - 0.25, top + 2, 0.5, by - 6 - top - 2);
        g.beginPath(); g.moveTo(x0, top + 3); g.quadraticCurveTo((x0 + bx) / 2, top + 14, bx, top + 3); g.strokeStyle = '#1a1410'; g.lineWidth = 0.45; g.stroke();
        this.glow(bx, by - 1, 22, [255, 220, 140], 0.55);
        this.fillRR(bx - 1.4, by - 7.4, 2.8, 3, 0.4, '#2a2420');
        this.ell(bx, by - 1.6, 3, 3.6, this.rad(bx - 0.8, by - 2.4, 0.2, 3.8, [[0, [255, 255, 255]], [0.4, [255, 244, 190]], [1, [230, 180, 80]]]));
    },
    // Chapa de zinco ondulada, com as emendas e a ferrugem escorrida.
    zinc(x, y, w, h, rng) {
        const g = this.g;
        g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
        g.fillStyle = '#7a8287'; g.fillRect(x, y, w, h);
        for (let i = 0; i < w; i += 2) { g.fillStyle = this.lin(x + i, 0, x + i + 2, 0, [[0, [176, 184, 188]], [0.45, [136, 144, 149]], [1, [96, 104, 108]]]); g.fillRect(x + i, y, 2, h); }
        for (let s = x; s < x + w; s += 30) this.line(s, y, s, y + h, 'rgba(60,66,70,0.9)', 0.7);
        for (let k = 0; k < w * h / 140; k++) { const rx = x + rng() * w, ry = y + rng() * h * 0.6, len = 4 + rng() * 14; g.fillStyle = this.lin(0, ry, 0, ry + len, [[0, [168, 100, 56], 0.7], [1, [168, 100, 56], 0]]); g.fillRect(rx, ry, 0.8 + rng() * 1.2, len); }
        this.clouds(x, y, w, h, 0.35, 31, 1.4);
        g.restore();
    },
    // Bloco de concreto sem reboco: fiadas desencontradas, argamassa escorrida.
    blocks(x, y, w, h, rng) {
        const g = this.g, cols = [[142, 138, 130], [154, 149, 140], [132, 128, 120], [163, 158, 148]];
        g.fillStyle = '#5c5850'; g.fillRect(x, y, w, h);
        const bw = 16, bh = 6.4;
        for (let r = 0; y + h - (r + 1) * bh > y - bh; r++) {
            const yy = y + h - (r + 1) * bh;
            for (let k = -1; x + k * bw < x + w; k++) {
                const xx = x + k * bw + (r % 2) * bw / 2, c = cols[Math.floor(rng() * cols.length)];
                this.fillRR(xx + 0.5, yy + 0.5, bw - 1, bh - 1, 0.4, this.lin(0, yy, 0, yy + bh, [[0, HDK.t(c, 1.1)], [1, HDK.t(c, 0.86)]]));
                for (let p = 0; p < 4; p++) this.circ(xx + 1.5 + rng() * (bw - 3), yy + 1 + rng() * (bh - 2), 0.25 + rng() * 0.3, 'rgba(60,58,52,0.45)');
            }
        }
        this.grain(x, y, w, h, 0.35, 32);
    },
});
