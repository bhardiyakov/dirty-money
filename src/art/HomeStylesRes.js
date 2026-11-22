// ============================================================================
// HomeStylesRes — os INTERIORES DAS RESIDÊNCIAS que dá para arrombar (crime/HomeBurglary.js), no mesmo motor das lojas e dos imóveis
// (art/ShopArt.js → art/Interior3D.js em volume). Três tipos novos × 5 variações (paleta, tamanho, espelhamento):
//   home_casa     CASA DE FAMÍLIA (subúrbio): sala com sofá e TV na frente, cozinha e jantar no fundo, o quarto do casal (cama de
//                 casal, cômoda, guarda-roupa) e o quarto das crianças (beliche, baú de brinquedos, mesinha com o notebook) separados
//                 por meias-paredes; nas variações maiores, o cofre de parede no guarda-roupa
//   home_kitnet   KITNET DE ESTUDANTE: um cômodo só — cama de solteiro, mesa gamer com dois monitores, pufe, violão, arara de roupa,
//                 frigobar, pôsteres na parede
//   home_vovo     CASA DA VOVÓ: sofá florido com paninho de crochê, TV de tubo na estante, cristaleira com a prataria, cadeira de
//                 balanço, máquina de costura, oratório na parede, cama com colcha de retalhos e a cômoda com o porta-joias
// Usos (S.use) — o que o ladrão revista: 'bed' (embaixo do colchão), 'chest' (gavetas da cômoda), 'closet' (guarda-roupa: relógio,
// bolsa, dinheiro na caixa de sapato), 'tv' (TV e videogame: pesado), 'desk' (notebook/PC), 'safe', 'cabinet' (a prataria),
// 'jewelbox' (porta-joias). Nenhuma delas vira imóvel à venda: só se entra arrombando.
// ============================================================================

Object.assign(ShopStyles, {
    // ---- peças de residência (sobre um ShopCtx) ----
    _wardrobe(S, r, wood) {
        const b = S.blk(r, 2.1, S.t(wood, 1.1), wood), c = S.c;
        const n = Math.max(2, Math.round(b.w / 26));
        for (let i = 1; i < n; i++) c.fr(b.x + Math.round(b.w * i / n), b.fy + 2, 1, b.hp - 3, S.t(wood, 0.55));
        for (let i = 0; i < n; i++) { const mx = b.x + Math.round(b.w * (i + 0.5) / n); c.fr(mx - 1, b.fy + (b.hp >> 1) - 3, 2, 6, '#d9b030'); }
        c.fr(b.x + 2, b.top + 2, b.w - 4, 1, S.t(wood, 1.35));
        return b;
    },
    _bunk(S, r, sheetA, sheetB, wood) {
        const b = S.blk(r, 1.7, sheetA, wood), c = S.c;
        c.fr(b.x + 3, b.top + 3, 12, 9, '#f6f2ea'); c.fr(b.x + 2, b.top + 16, b.w - 4, b.h - 18, S.t(sheetA, 0.9));
        const my = b.fy + Math.round(b.hp * 0.45);
        c.fr(b.x + 2, my, b.w - 4, Math.round(b.hp * 0.3), sheetB); c.fr(b.x + 2, my, b.w - 4, 1, S.t(sheetB, 1.3));          // a cama de baixo, entre os montantes
        for (const px of [b.x, b.x + b.w - 3]) c.fr(px, b.fy, 3, b.hp, S.t(wood, 0.8));
        for (let j = 4; j < b.hp - 4; j += 5) c.fr(b.x + b.w - 8, b.fy + j, 5, 1, S.t(wood, 1.2));                            // a escadinha
        return b;
    },
    _cabinet(S, r) {
        const b = S.blk(r, 1.8, '#6a4424', '#5a3a1c'), c = S.c;
        c.fr(b.x + 3, b.fy + 3, b.w - 6, b.hp - 12, '#9ab8c0'); c.fr(b.x + 3, b.fy + 3, b.w - 6, 1, '#e0f0f4');
        for (let t = 0; t < 3; t++) { const y = b.fy + 6 + t * Math.round((b.hp - 16) / 3); c.fr(b.x + 4, y + 5, b.w - 8, 1, '#5a3a1c'); for (let i = 6; i < b.w - 8; i += 7) c.disk(b.x + i, y + 2, 2, t === 1 ? '#e8e4dc' : '#c8ccd0'); }
        c.fr(b.x + (b.w >> 1), b.fy + 3, 1, b.hp - 12, '#5a3a1c');
        return b;
    },
    _pcDesk(S, r) {
        const b = S.blk(r, 0.78, '#26282e', '#1a1c20'), c = S.c;
        for (const k of [0, 1]) { const mx = b.x + 4 + k * Math.round((b.w - 8) / 2); c.box(mx, b.top + 2, Math.round((b.w - 12) / 2), 11, '#16181c', '#3a3e48', '#0a0a0c', '#000'); c.fr(mx + 2, b.top + 4, Math.round((b.w - 12) / 2) - 4, 6, k ? '#5ae0a8' : '#8a6aff'); }
        c.fr(b.x + 6, b.top + b.h - 8, b.w - 22, 3, '#3a3e48'); c.fr(b.x + 6, b.top + b.h - 8, b.w - 22, 1, '#ff3ab0');           // teclado com a fita de LED
        c.box(b.x + b.w - 12, b.fy - 14, 9, 14, '#1a1c20', '#ff3ab0', '#0a0a0c', '#000');                                      // o gabinete aceso
        return b;
    },
    _beanbag(S, x, z, col) {
        const c = S.c, px = S.X(S.P(x)), py = S.Y(z);
        c.bl(px - 9, py + 2, 22, 9, [8, 5, 3], 0.3);
        c.disk(px, py - 4, 10, S.t(col, 0.8)); c.disk(px - 1, py - 6, 8, col); c.disk(px - 3, py - 8, 3, S.t(col, 1.35));
        S.solid([S.P(x) - 0.55, z - 0.55, S.P(x) + 0.55, z + 0.55], 0.6);
    },
    _guitar(S, x, z) {
        const c = S.c, px = S.X(S.P(x)), py = S.Y(z);
        c.fr(px - 1, py - 30, 3, 18, '#3a2410'); c.fr(px - 2, py - 33, 5, 4, '#1a1008');
        c.disk(px, py - 8, 6, '#b8742a'); c.disk(px, py - 14, 5, '#c8843a'); c.disk(px, py - 10, 2, '#1a1008');
        S.solid([S.P(x) - 0.3, z - 0.3, S.P(x) + 0.3, z + 0.3], 1.1);
    },
    _rack(S, r, cols) {
        const b = S.blk(r, 1.6, '#8a8e94', '#5a5e64', true), c = S.c;
        for (let i = 3, k = 0; i < b.w - 4; i += 5, k++) { const col = cols[k % cols.length]; c.box(b.x + i, b.fy + 2, 4, b.hp - 6, col, S.t(col, 1.25), S.t(col, 0.7), S.t(col, 0.35)); }
        return b;
    },
    _rocker(S, x, z, col) {
        const c = S.c, px = S.X(S.P(x)), py = S.Y(z);
        c.bl(px - 8, py + 2, 18, 6, [8, 5, 3], 0.3);
        c.box(px - 7, py - 14, 14, 8, col, S.t(col, 1.25), S.t(col, 0.7), S.t(col, 0.3));
        c.box(px - 7, py - 6, 14, 6, S.t(col, 1.1), S.t(col, 1.3), S.t(col, 0.75), S.t(col, 0.3));
        c.ln(px - 9, py + 1, px + 9, py + 1, S.t(col, 0.55)); c.ln(px - 9, py + 2, px + 9, py + 2, S.t(col, 0.45));      // os arcos do balanço
        S.solid([S.P(x) - 0.45, z - 0.45, S.P(x) + 0.45, z + 0.45], 1.0);
    },
    _sewing(S, r) {
        const b = S.blk(r, 0.8, '#6a4a2a', '#4a3018'), c = S.c;
        c.box(b.x + 6, b.top - 6, b.w - 14, 9, '#2a2c30', '#4a4e56', '#16181c', '#000'); c.fr(b.x + 8, b.top - 4, 6, 2, '#d9b030');
        c.fr(b.x + 4, b.fy + 3, b.w - 8, b.hp - 4, '#3a2a18');
        return b;
    },
    _altar(S, xa) {
        const bd = S.band(S.P(xa), S.P(xa + 0.9)), c = S.c, x = bd.x + 2, y = bd.y + 10;
        c.box(x, y, bd.w - 4, 18, '#7a4a24', '#a8743c', '#4a2a10', '#1a0c04');
        c.fr(x + (bd.w >> 1) - 4, y + 4, 4, 10, '#4a7ad8'); c.disk(x + (bd.w >> 1) - 2, y + 4, 2, '#f0d8b8');                 // o santo
        c.disk(x + 3, y + 15, 1, '#ffd060'); c.disk(x + bd.w - 8, y + 15, 1, '#ffd060');                                       // velinhas
    },
    _toybox(S, r) {
        const b = S.blk(r, 0.6, '#d84a3a', '#b03a2c'), c = S.c;
        c.fr(b.x + 3, b.top + 3, 5, 5, '#f0c830'); c.disk(b.x + b.w - 8, b.top + 5, 3, '#3a8ad8'); c.fr(b.x + 10, b.top + 4, 6, 3, '#4ab858');
        c.fr(b.x + 2, b.fy + (b.hp >> 1), b.w - 4, 1, '#f0c830');
        return b;
    },
    // Cômoda (gavetas) com o porta-joias em cima.
    _dresser(S, r, wood, jewel = true) {
        const b = S.blk(r, 0.85, S.t(wood, 1.1), wood), c = S.c;
        for (let k = 1; k < 3; k++) c.fr(b.x + 2, b.fy + Math.round(b.hp * k / 3), b.w - 4, 1, S.t(wood, 0.55));
        for (let k = 0; k < 3; k++) c.fr(b.x + (b.w >> 1) - 2, b.fy + Math.round(b.hp * (k + 0.5) / 3), 4, 1, '#d9b030');
        if (jewel) { const jx = b.x + b.w - 12, jy = b.top + 3; c.box(jx, jy, 9, 6, '#a83a5a', '#d8607a', '#6a1a32', '#2a0814'); c.fr(jx + 3, jy + 1, 3, 1, '#f0d060'); }
        c.box(b.x + 3, b.top + 2, 6, 7, '#e8e4dc', '#ffffff', '#b8b4ac', '#5a5650');                                            // porta-retrato
        return b;
    },
    _halfWall(S, r, col) {
        const b = S.blk(r, 1.15, S.t(col, 1.15), col), c = S.c;
        c.fr(b.x, b.fy + b.hp - 3, b.w, 3, S.t(col, 0.6));                                                                   // rodapé
        return b;
    },

    // ======================================================================= CASA DE FAMÍLIA (subúrbio)
    home_casa(v) {
        const W = 16.5 + (v % 3), D = 12, S = this._ctx('home_casa', v, W, D, 0.5), T = S.T;
        const pal = this._pal(v, [['#e8dcc0', '#d4c4a0', '#9a7448'], ['#d4e0d8', '#bccabe', '#8a6a48'], ['#ecd4c8', '#d8bcae', '#7a5236'], ['#dcd8e8', '#c4bfd6', '#6a5a7a'], ['#e4e0c4', '#cec8a6', '#8a7a4a']]);
        S.floor(v % 2 ? 'tile' : 'planks', v % 2 ? '#d8d0c0' : pal[2], v % 2 ? '#c4baa6' : '#b08a5a', { size: 20 });
        S.shell({ n: { kind: 'paint', A: pal[0], B: pal[1] }, cap: '#8a8478', side: '#9a8a70', front: '#7a6a58', mat: '#4a3a2a', rail: pal[2] });
        this._windowN(S, 1.6, 3.6, 24); this._windowN(S, W / 2 - 1.2, W / 2 + 1.2, 24); this._windowN(S, W - 3.6, W - 1.6, 24, '#9ac4e0');
        // quarto do casal (oeste, no fundo), atrás da meia-parede
        this._halfWall(S, S.R(5.6, 6.0, 5.85, D - T - 1.6), pal[1]);
        this._halfWall(S, S.R(T, 6.0, 3.2, 6.25), pal[1]);
        this._bed(S, S.R(T + 0.3, D - T - 3.3, T + 2.9, D - T - 0.2), v % 2 ? '#e8d8c8' : '#d8dce8', '#6a4a2a', true); S.use('bed', S.R(T, D - T - 3.9, T + 3.4, D - T));
        this._dresser(S, S.R(T + 3.3, D - T - 0.9, T + 4.9, D - T - 0.2), '#8a6438'); S.use('chest', S.R(T + 3.0, D - T - 1.6, T + 5.2, D - T));
        this._wardrobe(S, S.R(T + 0.1, 6.4, T + 0.85, 8.4), '#8a6438'); S.use('closet', S.R(T, 6.3, T + 1.6, 8.6));
        if (v >= 2) { this._safe(S, S.R(T + 0.95, 6.4, T + 1.6, 7.0)); S.use('safe', S.R(T + 0.9, 6.3, T + 2.2, 7.4)); }
        // quarto das crianças (leste, no fundo)
        this._halfWall(S, S.R(W - 5.85, 6.0, W - 5.6, D - T - 1.6), pal[1]);
        this._halfWall(S, S.R(W - 3.2, 6.0, W - T, 6.25), pal[1]);
        this._bunk(S, S.R(W - T - 2.1, D - T - 3.0, W - T - 0.1, D - T - 0.2), '#7ab4e8', '#e87a9a', '#a87a4a'); S.use('bed', S.R(W - T - 2.6, D - T - 3.6, W - T, D - T));
        this._toybox(S, S.R(W - T - 3.4, D - T - 0.8, W - T - 2.3, D - T - 0.2));
        this._desk(S, S.R(W - T - 0.85, 6.5, W - T - 0.1, 8.2)); S.use('desk', S.R(W - T - 1.6, 6.3, W - T, 8.5));
        S.chair(S.P(W - T - 1.4), 7.3, 'e');
        // cozinha e jantar (fundo, no meio)
        S.counter(S.R(W / 2 - 2.4, D - T - 0.85, W / 2 + 1.2, D - T - 0.1), 0.95, '#d8d4cc', '#a8a49a', ['cups', 'jar']);
        this._fridge(S, S.R(W / 2 + 1.35, D - T - 0.95, W / 2 + 2.3, D - T - 0.1)); S.use('fridge', S.R(W / 2 + 1.0, D - T - 1.6, W / 2 + 2.6, D - T));
        this._dining(S, W / 2 - 0.4, 7.6, 1.8, 1.0, '#8a6238', 4);
        // sala (frente): sofá de costas para a porta, a TV na estante, tapete
        S.rug(S.R(W / 2 - 4.6, 2.4, W / 2 - 1.6, 5.4), pal[1], S.t(pal[1], 0.6));
        this._sofa(S, S.R(W / 2 - 4.8, 2.5, W / 2 - 1.8, 3.5), v % 2 ? '#6a7a4a' : '#7a4a3a', 'n');
        S.table(W / 2 - 3.3, 4.2, 1.2, 0.6, 'wood', '#7a5a3a');
        this._tv(S, S.R(T + 0.1, 3.0, T + 0.7, 4.8), true); S.use('tv', S.R(T, 2.8, T + 1.4, 5.0));
        S.plant(S.P(W / 2 + 3.2), 1.6); S.plant(S.P(W - T - 1.0), 4.6, false);
        S.lamp(W / 2, 5.4, '#fff0b0', '#c8b890');
        S.light(W / 2, 4.5, 7, [255, 228, 180], 0.5); S.light(T + 2.5, D - 3, 4.5, [255, 210, 150], 0.35); S.light(W - 3, D - 3, 4.5, [210, 225, 255], 0.3);
        return S.finish();
    },

    // ======================================================================= KITNET DE ESTUDANTE
    home_kitnet(v) {
        const W = 9.5 + (v % 2), D = 8.5, S = this._ctx('home_kitnet', v, W, D, 0.3), T = S.T;
        const pal = this._pal(v, [['#c8ccd4', '#b0b6c0', '#3a3e48'], ['#d8c8b8', '#c4b2a0', '#4a3a2a'], ['#bcc8bc', '#a6b4a6', '#2a3a2a'], ['#d0c0d4', '#bcaac0', '#3a2a40'], ['#c8d0d8', '#b2bcc6', '#2a3440']]);
        S.floor(v % 2 ? 'concrete' : 'planks', v % 2 ? '#8a8a86' : '#9a7a52', v % 2 ? '#76766e' : '#8a6a46', { size: 22 });
        S.shell({ n: { kind: 'paint', A: pal[0], B: pal[1] }, cap: '#7b7568', side: '#8a7a68', front: '#6a5a4a', mat: '#2a2a32' });
        this._windowN(S, W - 3.2, W - 1.4, 22, '#9ac4e0');
        { const bd = S.band(S.P(1.4), S.P(4.6)), c = S.c;                                                                   // pôsteres
          S.poster(bd.x + 4, bd.y + 8, 22, 30, '#2a2a3a', '#ff3ab0'); S.poster(bd.x + 32, bd.y + 12, 26, 20, '#3a6a9a', '#f0d060'); void c; }
        this._bed(S, S.R(T + 0.2, D - T - 2.4, T + 2.1, D - T - 0.1), pal[0], '#4a4a52'); S.use('bed', S.R(T, D - T - 2.9, T + 2.6, D - T));
        this._pcDesk(S, S.R(W - T - 2.6, D - T - 0.85, W - T - 0.1, D - T - 0.1)); S.use('desk', S.R(W - T - 3.0, D - T - 1.6, W - T, D - T));
        S.chair(S.P(W - T - 1.35), D - T - 1.5, 's', '#2a2a32');
        this._tv(S, S.R(W - T - 0.6, 3.0, W - T - 0.1, 4.4)); S.use('tv', S.R(W - T - 1.3, 2.8, W - T, 4.6));
        this._beanbag(S, W - T - 2.0, 3.6, v % 2 ? '#d84a6a' : '#4a8ad8');
        this._guitar(S, T + 2.6, D - T - 0.5);
        this._rack(S, S.R(T + 0.1, 2.6, T + 0.7, 4.4), ['#2a2a32', '#d84a3a', '#e8e4dc', '#3a6a9a', '#4a8a4a']); S.use('closet', S.R(T, 2.4, T + 1.4, 4.6));
        this._chest(S, S.R(T + 0.1, 4.7, T + 0.8, 5.5)); S.use('chest', S.R(T, 4.5, T + 1.5, 5.8));
        this._fridge(S, S.R(W / 2 - 0.2, D - T - 0.7, W / 2 + 0.5, D - T - 0.1));
        S.lamp(W / 2, 4.2, '#d8e8ff', '#3a3e48');
        S.light(W / 2, 4.2, 5, [230, 235, 255], 0.4); S.light(W - 2, D - 2, 3.5, [200, 120, 255], 0.35);
        return S.finish();
    },

    // ======================================================================= CASA DA VOVÓ
    home_vovo(v) {
        const W = 13.5 + (v % 2), D = 10.5, S = this._ctx('home_vovo', v, W, D, 0.5), T = S.T;
        const pal = this._pal(v, [['#e8d8b8', '#d4c098', '#8a6a44'], ['#dcc8d0', '#c8b0b8', '#7a5a44'], ['#d8dcc0', '#c2c6a4', '#7a6a44'], ['#e4ccb4', '#cfb498', '#6a4a30'], ['#d4d8d0', '#bec4ba', '#8a6a48']]);
        S.floor('tile', v % 2 ? '#c87a5a' : '#b8a888', v % 2 ? '#a86448' : '#a49474', { size: 18 });                      // ladrilho hidráulico
        S.shell({ n: { kind: 'paint', A: pal[0], B: pal[1] }, cap: '#8a7a68', side: '#8a6a48', front: '#7a5a3c', mat: '#5a3a2a' });
        this._windowN(S, 1.8, 3.6, 22); this._windowN(S, W - 3.6, W - 1.8, 22);
        this._altar(S, W / 2 - 0.45);
        // quarto (oeste)
        this._halfWall(S, S.R(4.6, 5.0, 4.85, D - T - 1.4), pal[1]);
        this._bed(S, S.R(T + 0.3, D - T - 3.0, T + 2.5, D - T - 0.2), '#d86a4a', '#5a3a1c'); S.use('bed', S.R(T, D - T - 3.6, T + 3.0, D - T));
        this._dresser(S, S.R(T + 2.7, D - T - 0.8, T + 4.2, D - T - 0.2), '#6a4424'); S.use('jewelbox', S.R(T + 2.4, D - T - 1.5, T + 4.5, D - T));
        this._wardrobe(S, S.R(T + 0.1, 5.4, T + 0.8, 7.0), '#6a4424'); S.use('closet', S.R(T, 5.3, T + 1.5, 7.2));
        // sala: sofá florido, TV de tubo, cristaleira, cadeira de balanço, máquina de costura
        S.rug(S.R(W - T - 4.6, 2.2, W - T - 1.0, 4.6), '#f0e8d8', '#c8b8a0');                                              // o paninho de crochê
        this._sofa(S, S.R(W - T - 4.4, 2.3, W - T - 1.2, 3.3), v % 2 ? '#c87a8a' : '#8aa86a', 'n');
        this._tv(S, S.R(W - T - 3.5, 5.0, W - T - 2.1, 5.6)); S.use('tv', S.R(W - T - 3.8, 4.8, W - T - 1.8, 6.2));
        this._cabinet(S, S.R(W - T - 0.85, 5.0, W - T - 0.1, 7.2)); S.use('cabinet', S.R(W - T - 1.6, 4.8, W - T, 7.4));
        this._rocker(S, T + 1.5, 2.2, '#8a5a30');
        this._sewing(S, S.R(W - T - 2.6, D - T - 0.75, W - T - 1.2, D - T - 0.1));
        this._dining(S, W / 2 + 0.8, 8.0, 1.4, 0.9, '#6a4424', 2);
        S.plant(S.P(W - T - 0.9), 1.4); S.plant(S.P(5.4), 4.2, false);
        S.lamp(W / 2 + 0.8, 4.6, '#ffe8a0', '#a87a4a');
        S.light(W / 2, 4.5, 6, [255, 215, 150], 0.5); S.light(T + 2, D - 2.5, 4, [255, 200, 140], 0.35);
        return S.finish();
    },
});

// Cada peça nova é UMA peça na gravação do interior HD/3D (art/InteriorHD.js): repintada pelos próprios traços e com o volume dos
// sólidos dela; o oratório é enfeite da parede do fundo.
if (typeof InteriorHD !== 'undefined') {
    for (const k of ['_wardrobe', '_bunk', '_cabinet', '_pcDesk', '_beanbag', '_guitar', '_rack', '_rocker', '_sewing', '_altar', '_toybox', '_dresser', '_halfWall']) if (!InteriorHD.STYLE_PRIMS.includes(k)) InteriorHD.STYLE_PRIMS.push(k);
    InteriorHD.WALL._altar = 1;
}
