// ============================================================================
// HomeStyles — os INTERIORES DOS IMÓVEIS (economy/RealEstate.js), pintados no mesmo motor das lojas (art/ShopArt.js, vista de
// cima). Quatro padrões × 5 variações (paleta/tamanho/espelhamento), do simples ao luxo:
//   home_simple     barraco, casa popular, kitnet           (madeira/cimento, cama, mesa, TV, geladeira)
//   home_apto       apartamento e alto padrão               (quarto, cozinha, sala com sofá e TV, jantar)
//   home_cobertura  cobertura frente-mar                    (mármore, janelões azuis, sofá em L, bar)
//   home_mansion    mansão / cobertura de luxo da ilha      (salão com colunas, piano, bar, suíte)
// Cada sala marca os móveis de USO (S.use): 'bed' (dormir e salvar), 'fridge', 'safe', 'chest' (StashUI) e 'desk' (notebook →
// ficha do imóvel: mercado, mudar-se, vender). Interiors.enterHome monta a sala no palco; sem atendente nem fregueses.
// `empty` = imóvel comprado SEM MÓVEIS: só piso, paredes e janelas (e as colunas da mansão); os móveis vêm do modo decoração
// (world/HomeDecor.js — cama, geladeira, baú, cofre e notebook também são vendidos lá).
// ============================================================================

Object.assign(ShopStyles, {
    // ---- reformas (nível 1..3): piso e parede melhores, plantas e luz mais quente ----
    _rf(lvl, args) {
        if (lvl >= 3) return ['marble', '#efece4', '#a8a398'];
        if (lvl === 2) return ['tile', '#dcd2bc', '#c8bca2', { size: 20 }];
        if (lvl === 1) return ['planks', '#a88a60', '#b89a6c'];
        return args;
    },
    _rw(lvl, n) { return lvl >= 2 ? { kind: 'panel', A: '#e6dcc8', B: lvl >= 3 ? '#6a4a30' : '#9a7a50' } : (lvl === 1 && n.kind === 'wood' ? { kind: 'paint', A: n.A, B: n.B } : n); },
    _reformDecor(S, lvl, W, D) {
        if (lvl <= 0) return;
        const spots = [[1.4, 1.4], [W - 1.4, 1.4], [W - 1.4, D / 2], [1.4, D / 2], [W / 2, D - 1.3], [W / 2 - 3, 1.4], [W / 2 + 3, 1.4]];
        let n = 0;
        for (const [x, z] of spots) { if (n >= lvl + 1) break; if (S.free(S.P(x), z, 0.9)) { S.plant(S.P(x), z, lvl >= 2); n++; } }
        S.light(W / 2, D / 2, 8 + lvl * 2, [255, 225, 170], 0.12 + lvl * 0.08);
        if (lvl >= 3) { S.lamp(W / 2, D / 2 - 1.5, '#ffe8b0', '#c8a860'); S.light(W / 2, D / 2 - 1.5, 7, [255, 215, 140], 0.3); }
    },

    // ---- peças de casa (sobre um ShopCtx) ----
    _bed(S, r, sheet, wood, big = false) {
        const b = S.blk(r, 0.7, sheet, wood), c = S.c;
        const pw = big ? 18 : 14;
        c.box(b.x + 3, b.top + 3, pw, 11, '#f6f2ea', '#ffffff', '#c4bcae', '#4a4436'); if (b.w > 70) c.box(b.x + b.w - pw - 3, b.top + 3, pw, 11, '#f6f2ea', '#ffffff', '#c4bcae', '#4a4436');
        c.fr(b.x + 2, b.top + 20, b.w - 4, 2, S.t(sheet, 0.8)); c.fr(b.x + 2, b.top + 21 + 8, b.w - 4, b.h - 31, S.t(sheet, 0.92));       // lençol dobrado
        for (let j = 0; j < b.h - 32; j += 8) c.fr(b.x + 4, b.top + 32 + j, b.w - 8, 1, S.t(sheet, 0.78));
        return b;
    },
    _fridge(S, r) {
        const b = S.blk(r, 1.9, '#e8ecef', '#cfd6dc'), c = S.c;
        c.fr(b.x + b.w - 5, b.top + 4, 2, 10, '#8a9096'); c.fr(b.x + 2, b.top + 4, b.w - 4, 1, '#9aa2a8'); c.fr(b.x + 2, b.top + (b.h >> 1), b.w - 4, 1, '#9aa2a8');
        return b;
    },
    _safe(S, r) {
        const b = S.blk(r, 0.9, '#3a4048', '#2a3036'), c = S.c;
        c.disk(b.x + (b.w >> 1), b.top + (b.h >> 1), Math.max(3, Math.min(b.w, b.h) / 4 | 0), '#6a727c'); c.disk(b.x + (b.w >> 1), b.top + (b.h >> 1), 2, '#d9b030'); c.fr(b.x + 2, b.top + 2, b.w - 4, 1, '#5a626c');
        return b;
    },
    _chest(S, r) {
        const b = S.blk(r, 0.7, '#8a5a30', '#6a4220'), c = S.c;
        c.fr(b.x + 3, b.top, 2, b.h, '#3a3d44'); c.fr(b.x + b.w - 5, b.top, 2, b.h, '#3a3d44'); c.fr(b.x + (b.w >> 1) - 2, b.top + (b.h >> 1) - 2, 4, 5, '#d9b030');
        return b;
    },
    _tv(S, r, big = false) {
        const b = S.blk(r, big ? 1.0 : 0.7, '#2a2c32', '#1e2024'), c = S.c;
        c.fr(b.x + 3, b.top + 2, b.w - 6, b.h - 4, '#16222c'); c.fr(b.x + 5, b.top + 4, b.w - 10, b.h - 8, '#4a7a9a'); c.ln(b.x + 6, b.top + 5, b.x + b.w - 10, b.top + 4, '#9ac8e0');
        return b;
    },
    _sofa(S, r, col, back = 'n') {
        const b = S.blk(r, 0.8, col, S.t(col, 0.7)), c = S.c;
        const bk = S.t(col, 0.82);
        if (back === 'n') c.box(b.x, b.top, b.w, 7, bk, S.t(col, 1.1), S.t(col, 0.6), S.t(col, 0.3)); else c.box(b.x, b.top + b.h - 7, b.w, 7, bk, S.t(col, 1.1), S.t(col, 0.6), S.t(col, 0.3));
        const n = Math.max(2, Math.round(b.w / 22));
        for (let i = 1; i < n; i++) c.fr(b.x + Math.round(b.w * i / n), b.top + 8, 1, b.h - 9, S.t(col, 0.6));
        c.box(b.x + 3, b.top + (back === 'n' ? 9 : 1), 10, 8, S.t(col, 1.3), S.t(col, 1.5), S.t(col, 1.0), S.t(col, 0.4));
        return b;
    },
    _desk(S, r) {
        const b = S.blk(r, 0.8, '#7a5a3a', '#5a3e24'), c = S.c;
        c.box(b.x + 4, b.top + 3, 22, 14, '#2a2c32', '#6a6e78', '#101216', '#000'); c.fr(b.x + 6, b.top + 5, 18, 8, '#6ac0e8'); c.fr(b.x + 8, b.top + 7, 10, 1, '#fff'); c.fr(b.x + 4, b.top + 18, 22, 3, '#3a3d44');
        return b;
    },
    _dining(S, cx, cz, w, d, wood, n = 4) {
        S.table(cx, cz, w, d, 'wood', wood);
        const side = Math.ceil(n / 2);
        for (let i = 0; i < side; i++) { const x = cx - w / 2 + (i + 0.5) * w / side; S.chair(x, cz + d / 2 + 0.7, 'n'); S.chair(x, cz - d / 2 - 0.7, 's'); }
    },
    // Sala vazia (sem móveis): só a luz do teto.
    _emptyHome(S, W, D, finishShade) {
        S.light(W / 2, D / 2, Math.max(W, D) * 0.45, [255, 228, 180], 0.4);
        return finishShade === undefined ? S.finish() : S.finish(finishShade);
    },
    _windowN(S, xa, xb, h = 24, day = '#7ab4d8') { const bd = S.band(S.P(xa), S.P(xb)); S.window(bd.x + 2, bd.y + Math.max(2, (bd.h - h) / 2 | 0), bd.w - 4, h, day); },

    // ======================================================================= SIMPLES (barraco / casa popular / kitnet)
    home_simple(v, lvl = 0, empty = false) {
        const W = 11.5 + (v % 3), D = 9.5, S = this._ctx('home_simple', v, W, D, 0.5), T = S.T;
        const pal = this._pal(v, [['#9aa89a', '#84927f', '#8a6a44'], ['#c8b890', '#b4a47c', '#7a5a38'], ['#a8b4c0', '#909ca8', '#6a4a30'], ['#c4a898', '#b09484', '#7a5236'], ['#b8c0a8', '#a0a890', '#6a5a3a']]);
        S.floor(...this._rf(lvl, [v % 2 ? 'concrete' : 'planks', v % 2 ? '#8a8a82' : pal[2], v % 2 ? '#74746c' : '#9a7a50', { size: 24 }]));
        S.shell({ n: this._rw(lvl, { kind: v % 2 ? 'paint' : 'wood', A: pal[0], B: pal[1] }), cap: '#7b7568', side: '#8a6a48', front: '#8a5a3c', mat: '#4a3a2a' });
        this._windowN(S, 2.0, 4.0, 22); this._windowN(S, W - 4.6, W - 2.4, 22, '#9ac4e0');
        if (empty) return this._emptyHome(S, W, D);
        S.rug(S.R(W / 2 - 2.0, 3.0, W / 2 + 2.0, 5.6), pal[1], S.t(pal[1], 0.6));
        const bed = this._bed(S, S.R(T + 0.2, D - T - 3.0, T + 2.3, D - T - 0.1), v % 2 ? '#d8c8a8' : '#cfd8dc', '#6a4a2a'); S.use('bed', S.R(T, D - T - 3.4, T + 2.8, D - T));
        this._chest(S, S.R(T + 0.3, D - T - 3.8, T + 1.6, D - T - 3.1)); S.use('chest', S.R(T, D - T - 4.3, T + 2.1, D - T - 2.8));
        const fr = this._fridge(S, S.R(W - T - 1.0, D - T - 0.95, W - T - 0.1, D - T - 0.1)); S.use('fridge', S.R(W - T - 1.6, D - T - 1.6, W - T, D - T));
        S.counter(S.R(W - T - 4.3, D - T - 0.8, W - T - 1.15, D - T - 0.1), 0.95, '#b8b4a8', '#8a8478', ['cups', 'jar']);
        this._safe(S, S.R(W - T - 0.95, 3.1, W - T - 0.1, 3.95)); S.use('safe', S.R(W - T - 1.6, 2.6, W - T, 4.5));
        this._tv(S, S.R(T + 0.1, 4.0, T + 0.7, 5.3));
        this._dining(S, W / 2 + 1.6, 5.2, 1.4, 1.2, '#8a6a48', 2);
        this._desk(S, S.R(W - T - 2.4, T + 0.1, W - T - 0.5, T + 0.8)); S.use('desk', S.R(W - T - 3.0, T, W - T, T + 1.5));
        S.plant(S.P(T + 1.0), T + 1.0, false);
        S.light(W / 2, D / 2, 6, [255, 220, 150], 0.5); S.light(W - 2, 2, 4, [200, 220, 255], 0.2);
        this._reformDecor(S, lvl, W, D);
        return S.finish();
    },

    // ======================================================================= APARTAMENTO (médio e alto padrão)
    home_apto(v, lvl = 0, empty = false) {
        const W = 17 + (v % 3) * 1.5, D = 11.5, S = this._ctx('home_apto', v, W, D, 0.14), T = S.T;
        const pal = this._pal(v, [['#e6dcc8', '#d4c8b0', '#a07848'], ['#d8e0e4', '#c4ced4', '#8a6a48'], ['#e8d8d0', '#d6c4bb', '#6a4a30'], ['#d4dccc', '#bfc9b6', '#9a7a50'], ['#e0dce8', '#cbc6d8', '#7a5a3a']]);
        S.floor(...this._rf(lvl, ['planks', pal[2], '#b08a5a']));
        S.shell({ n: this._rw(lvl, { kind: 'panel', A: pal[0], B: pal[2] }), cap: '#8a8478', side: '#9a8a70', front: '#7a6a58', mat: '#3a3a44', rail: pal[2] });
        this._windowN(S, 2.6, 5.4, 26); this._windowN(S, W / 2 - 1.4, W / 2 + 1.6, 26); this._windowN(S, W - 6.0, W - 3.0, 26, '#9ac4e0');
        if (empty) return this._emptyHome(S, W, D);
        // quarto (noroeste)
        S.rug(S.R(T + 3.2, D - T - 4.2, T + 6.6, D - T - 0.6), '#7a8aa0', '#4a5a70');
        this._bed(S, S.R(T + 0.3, D - T - 3.4, T + 2.9, D - T - 0.2), '#e6e0d4', '#5a3e24', true); S.use('bed', S.R(T, D - T - 4.0, T + 3.4, D - T));
        S.blk(S.R(T + 3.0, D - T - 0.8, T + 3.7, D - T - 0.2), 0.6, '#8a6a44', '#5a3e24'); S.blk(S.R(T - 0.2 + 0.0, D - T - 4.4, T + 0.5, D - T - 3.5), 0.6, '#8a6a44', '#5a3e24');
        this._chest(S, S.R(T + 0.5, D - T - 4.6, T + 2.7, D - T - 3.9)); S.use('chest', S.R(T, D - T - 5.3, T + 3.2, D - T - 3.6));
        S.blk(S.R(T + 0.1, 3.3, T + 0.9, 5.7), 2.1, '#8a6a44', '#6a4a2c');                                         // guarda-roupa
        this._safe(S, S.R(T + 0.1, 6.0, T + 0.95, 6.9)); S.use('safe', S.R(T, 5.7, T + 1.6, 7.2));
        // cozinha (nordeste)
        S.counter(S.R(W - T - 6.2, D - T - 0.9, W - T - 1.15, D - T - 0.1), 0.95, '#d8d4cc', '#a8a49a', ['cups', 'tray', 'jar']);
        this._fridge(S, S.R(W - T - 1.0, D - T - 2.2, W - T - 0.1, D - T - 1.05)); S.use('fridge', S.R(W - T - 1.7, D - T - 3.0, W - T, D - T - 0.8));
        // jantar e sala
        this._dining(S, W - 6.2, D / 2 - 0.4, 2.2, 1.1, '#8a6238', 4);
        S.rug(S.R(W / 2 - 3.2, 2.7, W / 2 + 2.8, 6.2), pal[1], S.t(pal[1], 0.6));
        this._sofa(S, S.R(W / 2 - 2.4, 2.6, W / 2 + 0.6, 3.7), '#7a4a3a', 'n');
        S.table(W / 2 - 0.9, 4.5, 1.5, 0.8, 'wood', '#7a5a3a');
        this._tv(S, S.R(W / 2 - 2.2, 6.1, W / 2 + 0.4, 6.7), true);
        this._desk(S, S.R(W - T - 2.2, 2.6, W - T - 0.2, 3.5)); S.use('desk', S.R(W - T - 3.0, 2.0, W - T, 4.2));
        S.plant(S.P(W - T - 1.0), 5.0); S.plant(S.P(T + 5.0), 1.2, false);
        S.lamp(W / 2, 4.6, '#fff0b0', '#c8b890');
        S.light(W / 2, 4, 8, [255, 230, 180], 0.5); S.light(T + 3, D - 3, 5, [255, 210, 150], 0.4); S.light(W - 3, D - 2, 5, [255, 240, 210], 0.35);
        this._reformDecor(S, lvl, W, D);
        return S.finish();
    },

    // ======================================================================= COBERTURA FRENTE-MAR
    home_cobertura(v, lvl = 0, empty = false) {
        const W = 22 + (v % 3), D = 13.5, S = this._ctx('home_cobertura', v, W, D, 0.12), T = S.T;
        S.floor(...this._rf(lvl, ['marble', v % 2 ? '#ecebe6' : '#e6e2da', '#b8b4aa']));
        S.shell({ n: this._rw(lvl, { kind: 'paint', A: '#e8e4dc', B: '#d8d2c6' }), cap: '#9a948a', side: '#a89c88', front: '#8a7e6e', mat: '#2a2a32', rail: '#c8a860' });
        for (let k = 0; k < 4; k++) this._windowN(S, 2.0 + k * ((W - 4.8) / 4), 2.0 + k * ((W - 4.8) / 4) + (W - 4.8) / 4 - 0.8, 30, '#5aa8d8');      // janelões com vista do mar
        if (empty) return this._emptyHome(S, W, D, 0.24);
        S.rug(S.R(W / 2 - 4.8, 3.2, W / 2 + 4.2, 8.4), '#2f4a68', '#c8a860');
        this._sofa(S, S.R(W / 2 - 4.0, 3.4, W / 2 - 0.4, 4.6), '#e8e0d0', 'n'); this._sofa(S, S.R(W / 2 - 4.4, 4.8, W / 2 - 3.3, 7.8), '#e8e0d0', 'n');
        S.table(W / 2 - 1.4, 5.8, 2.0, 1.0, 'wood', '#3a3a40');
        this._tv(S, S.R(W / 2 - 3.6, 8.4, W / 2 + 0.6, 9.0), true);
        S.plant(S.P(T + 1.0), 4.0); S.plant(S.P(W / 2 + 5.0), 3.4);
        // suíte (noroeste)
        S.rug(S.R(T + 3.0, D - T - 4.8, T + 6.8, D - T - 0.4), '#c8b8a0', '#9a8a70');
        this._bed(S, S.R(T + 0.4, D - T - 3.6, T + 3.2, D - T - 0.2), '#f2ece0', '#3a2a1c', true); S.use('bed', S.R(T, D - T - 4.2, T + 3.7, D - T));
        this._chest(S, S.R(T + 0.6, D - T - 4.8, T + 2.9, D - T - 4.1)); S.use('chest', S.R(T, D - T - 5.6, T + 3.4, D - T - 3.9));
        this._safe(S, S.R(T + 0.1, 7.2, T + 0.95, 8.1)); S.use('safe', S.R(T, 6.9, T + 1.6, 8.4));
        // bar e cozinha (leste)
        S.counter(S.R(W - T - 7.5, 4.0, W - T - 6.3, 8.4), 1.1, '#2a2a30', '#6a5a3a', ['bottles', 'cups']);
        S.counter(S.R(W - T - 4.2, D - T - 0.95, W - T - 1.15, D - T - 0.1), 0.95, '#d8d4cc', '#a8a49a', ['jar']);
        this._fridge(S, S.R(W - T - 1.0, D - T - 2.4, W - T - 0.1, D - T - 1.05)); S.use('fridge', S.R(W - T - 1.7, D - T - 3.2, W - T, D - T - 0.8));
        for (let k = 0; k < 4; k++) S.stool(S.P(W - T - 5.6), 4.6 + k * 1.0);
        this._dining(S, W - 5.4, 10.6, 3.2, 1.2, '#4a3a2a', 6);
        this._desk(S, S.R(W - T - 2.4, 3.0, W - T - 0.3, 3.9)); S.use('desk', S.R(W - T - 3.0, 2.4, W - T, 4.5));
        S.plant(S.P(W - T - 1.0), 7.0);
        S.lamp(W / 2, 6, '#ffe8b0', '#2a2a30');
        S.light(W / 2, 6, 10, [255, 235, 190], 0.55); S.light(5, D - 3, 6, [255, 215, 160], 0.4); S.light(W - 4, 5, 6, [255, 200, 120], 0.35);
        this._reformDecor(S, lvl, W, D);
        return S.finish(0.24);
    },

    // ======================================================================= MANSÃO / COBERTURA DE LUXO
    home_mansion(v, lvl = 0, empty = false) {
        const W = 26 + (v % 3) * 1.5, D = 14.5, S = this._ctx('home_mansion', v, W, D, 0.5), T = S.T;
        S.floor(...this._rf(lvl, ['marble', '#efece4', '#a8a398']));
        S.shell({ n: { kind: 'panel', A: '#e4dccc', B: '#6a4a30' }, cap: '#a89c88', side: '#6a4a30', front: '#5a4030', mat: '#6a1a24', rail: '#c8a860' });
        for (let k = 0; k < 5; k++) this._windowN(S, 2.2 + k * ((W - 5) / 5), 2.2 + k * ((W - 5) / 5) + (W - 5) / 5 - 1.0, 30, '#4a9ad0');
        const columns = () => { for (const cx of [W / 2 - 7.2, W / 2 + 7.2]) { S.blk(S.R(cx - 0.45, 4.0, cx + 0.45, 4.9), 3.0, '#f0ece4', '#cfc8ba'); S.blk(S.R(cx - 0.45, 9.2, cx + 0.45, 10.1), 3.0, '#f0ece4', '#cfc8ba'); } };
        if (empty) { columns(); return this._emptyHome(S, W, D, 0.22); }
        // salão: tapete grande, dois sofás, piano de cauda e colunas
        S.rug(S.R(W / 2 - 6.0, 3.6, W / 2 + 6.0, 9.4), '#6a1a24', '#c8a860');
        this._sofa(S, S.R(W / 2 - 5.0, 4.0, W / 2 - 1.6, 5.2), '#2a3a52', 'n'); this._sofa(S, S.R(W / 2 + 1.6, 4.0, W / 2 + 5.0, 5.2), '#2a3a52', 'n');
        S.table(W / 2, 6.4, 2.6, 1.2, 'wood', '#2a2a30');
        S.piano(S.R(W / 2 - 1.8, 9.4, W / 2 + 1.8, 11.6));
        columns();
        this._tv(S, S.R(W / 2 - 2.6, 12.0, W / 2 + 2.6, 12.7), true);
        S.plant(S.P(T + 1.2), 3.6); S.plant(S.P(W - T - 1.2), 3.6); S.plant(S.P(T + 1.2), 8.6); S.plant(S.P(W - T - 1.2), 8.6);
        // suíte (oeste) com cofre e baú
        S.rug(S.R(T + 3.2, D - T - 5.2, T + 7.4, D - T - 0.5), '#c8b8a0', '#6a4a30');
        this._bed(S, S.R(T + 0.4, D - T - 3.8, T + 3.4, D - T - 0.2), '#f4eee2', '#2a1c10', true); S.use('bed', S.R(T, D - T - 4.4, T + 3.9, D - T));
        this._chest(S, S.R(T + 0.6, D - T - 5.0, T + 3.0, D - T - 4.3)); S.use('chest', S.R(T, D - T - 5.8, T + 3.5, D - T - 4.1));
        this._safe(S, S.R(T + 0.1, 8.2, T + 1.0, 9.1)); S.use('safe', S.R(T, 7.9, T + 1.7, 9.4));
        // bar/cozinha/jantar (leste)
        S.counter(S.R(W - T - 8.5, D - T - 0.95, W - T - 1.15, D - T - 0.1), 0.95, '#2a2a30', '#6a5a3a', ['bottles', 'cups', 'tray']);
        this._fridge(S, S.R(W - T - 1.0, D - T - 2.4, W - T - 0.1, D - T - 1.05)); S.use('fridge', S.R(W - T - 1.7, D - T - 3.2, W - T, D - T - 0.8));
        this._dining(S, W - 6.0, 6.2, 4.0, 1.3, '#3a2a1c', 6);
        this._desk(S, S.R(W - T - 2.6, 9.0, W - T - 0.4, 9.9)); S.use('desk', S.R(W - T - 3.3, 8.4, W - T, 10.5));
        S.lamp(W / 2 - 3.5, 8, '#ffe8b0', '#c8a860'); S.lamp(W / 2 + 3.5, 8, '#ffe8b0', '#c8a860');
        S.light(W / 2, 6, 11, [255, 235, 190], 0.55); S.light(5, D - 3, 6, [255, 215, 160], 0.4); S.light(W - 5, D - 3, 7, [255, 220, 170], 0.4);
        this._reformDecor(S, lvl, W, D);
        return S.finish(0.22);
    },
});
