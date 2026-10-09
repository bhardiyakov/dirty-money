// ============================================================================
// ShopStyles — os LAYOUTS dos interiores (11 tipos × 5 variações). Cada função pinta um ShopCtx (art/ShopArt.js) e devolve o quadro
// pronto. As variações mudam: tamanho da sala, paleta, quantidade/posição de mesas e balcões e o espelhamento do layout.
//   burger (lanchonete) · mart (conveniência) · pharmacy · bakery · bar (rústico) · pizza · fit (saladas e sucos) ·
//   italian (luxo) · japanese (luxo) · guns (loja de armas legal da cidade) · drugs (boca de fumo: armas da favela)
// ============================================================================

const ShopStyles = {
    _cache: {},
    get(style, v, lvl = 0) {                                       // lvl = nível de reforma (só as casas usam: art/HomeStyles.js)
        const k = style + v + (lvl ? "r" + lvl : "");
        return this._cache[k] || (this._cache[k] = this[style](v, lvl));
    },

    _ctx(style, v, W, D, door = 0.5) { return new ShopCtx(style, v, W, D, { mirror: !!(v & 1), door }); },
    _face(S, f) { return S.m && Math.abs(f) === Math.PI / 2 ? -f : f; },
    _clerk(S, x, z, face, variant) { S.clerk = { x: S.P(x), z, face: this._face(S, face), variant }; },
    _patron(S, x, z, face, variant) { S.patrons.push({ x: S.P(x), z, face: this._face(S, face), variant }); },
    _pal(v, list) { return list[v % list.length]; },
    N: 0, E: Math.PI / 2, S: Math.PI, WW: -Math.PI / 2,

    // ======================================================================= LANCHONETE / HAMBÚRGUER
    burger(v) {
        const W = [22, 22, 24, 20, 24][v], D = 13.5, S = this._ctx('burger', v, W, D);
        const pal = this._pal(v, [['#d6c6a4', '#c0ae88'], ['#d8cfa0', '#c4b888'], ['#b9c8b4', '#a2b49c'], ['#dcb0a4', '#c49488'], ['#cfc6b8', '#b8ae9e']]);
        const fl = this._pal(v, [['#e8e2d4', '#3c3c44'], ['#ecdcb8', '#8a6a48'], ['#dfe6dc', '#4a5a50'], ['#f0d8d0', '#6a4a48'], ['#e8e4dc', '#44464e']]);
        S.floor('checker', fl[0], fl[1], { size: 16 });
        S.shell({ n: { kind: 'paint', A: pal[0], B: pal[1] }, n2: { kind: 'tile', x0: 0.7, x1: W - 6.4, A: '#eef0ec', B: '#d6dad6' }, rail: '#8a8f98', cap: '#7b7568', side: '#8a6a48', front: '#8a5a3c', mat: '#6a2a24' });
        let bd = S.band(S.P(2.4), S.P(8.6));                                         // quadro de cardápio
        S.c.fr(bd.x, bd.y + 6, bd.w, 30, '#2a2e2c'); S.c.fr(bd.x, bd.y + 6, bd.w, 1, '#8a6a48'); for (let k = 0; k < 5; k++) { S.c.fr(bd.x + 5, bd.y + 11 + k * 5, bd.w - 22 - (k % 3) * 6, 1, '#e8e4d0'); S.c.fr(bd.x + bd.w - 14, bd.y + 11 + k * 5, 8, 1, '#e0b050'); }
        bd = S.band(S.P(W - 13), S.P(W - 10.4)); S.poster(bd.x, bd.y + 8, bd.w, 28, '#e8c860', '#c0392b', 'burger');
        bd = S.band(S.P(W - 16.8), S.P(W - 14.2)); S.window(bd.x, bd.y + 10, bd.w, 22);
        // cozinha ao fundo
        const prep = S.R(1.0, 11.6, W - 6.0, 13.1); const pb = S.counter(prep, 0.95, '#b8bcc4', '#8a8f98', []);
        const gx = pb.x + 6; S.c.fr(gx, pb.top + 4, 34, pb.h - 7, '#1c1e22'); for (let i = 0; i < 34; i += 3) S.c.fr(gx + i, pb.top + 4, 1, pb.h - 7, '#4a4e56');
        S.c.disk(gx + 9, pb.top + 9, 5, '#6a3a1a'); S.c.disk(gx + 22, pb.top + 9, 5, '#7a4420'); S.c.px(gx + 8, pb.top + 7, '#a86a3a');
        for (let k = 0; k < 4; k++) { S.c.px(gx + 6 + k * 6, pb.top - 4 - (k % 2) * 3, '#e8ecf0', 160); S.c.px(gx + 7 + k * 6, pb.top - 7 - (k % 2) * 3, '#e8ecf0', 110); }       // fumaça
        S.c.box(pb.x + 52, pb.top + 3, 22, pb.h - 6, '#4a4e58', '#7a7e88', '#202226', '#0c0d10'); S.c.fr(pb.x + 55, pb.top + 6, 16, 8, '#e0a830');       // fritadeira
        S.vending(S.R(W - 3.6, 10.5, W - 1.2, 13.1), 2.0, '#c0302a');
        // balcão de atendimento, banquetas e mesas
        S.counter(S.R(2.0, 7.0, W - 6.4, 8.4), 1.0, '#a89678', '#8a5a30', ['register', 'cups', 'tray', 'bell']);
        for (let k = 0; k < (v < 3 ? 4 : 5); k++) S.stool(S.P(3.0 + k * 2.4), 5.8);
        S.table(S.P(W - 5.6), 4.4, 1.7, 1.7, 'wood', '#a87848'); S.chair(S.P(W - 5.6), 5.9, 's'); S.chair(S.P(W - 5.6), 2.9, 'n'); S.chair(S.P(W - 7.6), 4.4, 'e');
        if (v !== 3) { S.table(S.P(3.6), 2.9, 1.7, 1.7, 'wood', '#a87848'); S.chair(S.P(3.6), 4.3, 's'); S.chair(S.P(3.6), 1.5, 'n'); }
        S.plant(S.P(W - 1.8), 7.6, false);
        this._clerk(S, 6.0, 9.9, this.S, 0); this._patron(S, 5.4, 5.8, this.N, 1); if (v & 2 && v !== 3) this._patron(S, 3.6, 4.3, this.S, 2);
        S.light(6, 9, 6, [255, 220, 150], 0.5); S.light(W - 8, 4, 6, [255, 230, 190], 0.35); S.light(W - 2.4, 8, 3, [255, 80, 60], 0.3);
        return S.finish();
    },

    // ======================================================================= CONVENIÊNCIA e FARMÁCIA (mesma planta, outra pele)
    mart(v) { return this._mart(v, false); },
    pharmacy(v) { return this._mart(v, true); },
    _mart(v, ph) {
        const W = [22, 24, 22, 20, 24][v], D = 13.5, S = this._ctx(ph ? 'pharmacy' : 'mart', v, W, D, 0.42);
        const wallA = ph ? ['#e4eee8', '#cfe0d6'] : this._pal(v, [['#d4dce4', '#c0cad4'], ['#dcdcd0', '#c8c8bc'], ['#cfe0d8', '#b8d0c4'], ['#e0d4d0', '#ccbcb8'], ['#d0d8e8', '#bcc6dc']]);
        S.floor('checker', ph ? '#e8ece8' : '#dcdfe2', ph ? '#b4c8bc' : '#b4bcc4', { size: 20 });
        S.shell({ n: { kind: 'paint', A: wallA[0], B: wallA[1] }, rail: ph ? '#2fae8f' : '#2fa36a', cap: '#8a8f98', side: '#7a8088', front: '#7a8088', mat: ph ? '#2a6a58' : '#2a5a3a' });
        const prods = ph ? ['#e8f0ec', '#2fae8f', '#f0d060', '#d9453a', '#7ab0e0', '#ffffff'] : ['#d9453a', '#e0a020', '#3f9a52', '#2f86d0', '#8a4ab0', '#e8e0d0', '#d46a9e'];
        if (ph) {
            const bd0 = S.band(S.P(W / 2 - 3), S.P(W / 2 + 3));
            S.shelf(S.R(1.0, 12.2, W / 2 - 3.6, 13.3), 2.4, 4, prods, '#d8dcd8'); S.shelf(S.R(W / 2 + 3.6, 12.2, W - 1.0, 13.3), 2.4, 4, prods, '#d8dcd8');
            S.c.fr(bd0.x + 6, bd0.y + 10, bd0.w - 12, 18, '#2fae8f'); S.c.fr(bd0.x + bd0.w / 2 - 2, bd0.y + 12, 4, 14, '#fff'); S.c.fr(bd0.x + bd0.w / 2 - 7, bd0.y + 17, 14, 4, '#fff');       // cruz verde
            S.counter(S.R(W / 2 - 3.4, 10.0, W / 2 + 3.4, 11.4), 1.0, '#e8ece8', '#2fae8f', ['register', 'jar', 'phone']);
            this._clerk(S, W / 2, 11.9, this.S, 3);
            S.gondola(S.R(2.4, 6.4, 8.6, 7.6), 1.5, prods, '#e0e4e0'); S.gondola(S.R(W - 8.6, 6.4, W - 2.4, 7.6), 1.5, prods, '#e0e4e0');
            S.cooler(S.R(W - 3.4, 3.0, W - 1.2, 5.2), 1.9, '#2fae8f');
        } else {
            const nCool = v < 2 ? 5 : 4, cw = 2.3;
            for (let k = 0; k < nCool; k++) S.cooler(S.R(1.0 + k * (cw + 0.1), 11.4, 1.0 + k * (cw + 0.1) + cw, 13.3), 2.2, ['#2f86d0', '#d9453a', '#3f9a52', '#e0a020', '#8a4ab0'][(k + v) % 5]);
            S.shelf(S.R(1.0 + nCool * (cw + 0.1) + 0.4, 12.2, W - 6.0, 13.3), 2.4, 3, prods, '#9aa0a8');
            S.gondola(S.R(2.4, 7.0, 10.6, 8.2), 1.5, prods); S.gondola(S.R(2.4, 4.4, 10.6, 5.6), 1.5, prods); S.gondola(S.R(12.4, 7.0, W - 8.0, 8.2), 1.5, prods);
            S.counter(S.R(W - 7.4, 5.4, W - 1.4, 6.7), 1.0, '#e8ecee', '#3a6a52', ['register', 'phone', 'jar']);
            S.vending(S.R(W - 3.2, 9.6, W - 1.2, 12.0), 2.0, '#2f6fb5');
            this._clerk(S, W - 4.4, 7.7, this.S, 4);
        }
        const bd = S.band(S.P(W - 13), S.P(W - 9)); S.poster(bd.x, bd.y + 10, bd.w, 26, ph ? '#2fae8f' : '#e8c860', ph ? '#fff' : '#c0392b', ph ? 'lines' : 'sun');
        S.light(W / 2, 8, 8, [220, 235, 255], 0.38); S.light(W / 2, 3, 5, [220, 235, 255], 0.2);
        if (v >= 2) this._patron(S, 6.6, 3.3, this.N, 5 + v);
        return S.finish();
    },

    // ======================================================================= BOUTIQUE (roupas, tênis, acessórios, bolsas e malas)
    clothes(v) {
        const W = [22, 24, 22, 24, 26][v], D = 13.5, S = this._ctx('clothes', v, W, D, 0.5), c = S.c;
        const wall = this._pal(v, [['#e8d6de', '#d4bcc8'], ['#dcdce6', '#c4c4d4'], ['#e6dccc', '#d0c2ac'], ['#d6e2dc', '#bccec4'], ['#ece4d8', '#d8ccbc']]);
        S.floor('planks', ['#c8a882', '#b89a78', '#d0b894', '#a88a6a', '#c0a080'][v], '#8a6a4a', { size: 18 });
        S.shell({ n: { kind: 'paint', A: wall[0], B: wall[1] }, rail: '#d46a9e', cap: '#8a7a80', side: '#8a7078', front: '#7a6068', mat: '#5a3a48' });
        const tees = ['#e8742c', '#eceae4', '#1f1f24', '#f2d22c', '#3a3d46', '#2e1c14', '#2f6fd0', '#d9453a', '#4a5034', '#e86aa0', '#22252e', '#2fd07a'];
        // arara: barra de metal com cabides e peças penduradas (cores variadas), vista de cima
        const rack = (r, n0) => {
            const b = S.blk(r, 1.55, '#b8bcc4', '#6a6e78');
            c.fr(b.x, b.top + Math.floor(b.h / 2) - 1, b.w, 2, '#e8ecf0');
            for (let x = 3, k = n0; x < b.w - 4; x += 5, k++) {
                const col = tees[k % tees.length];
                c.box(b.x + x, b.top + 2, 4, b.h - 4 + b.hp - 4, col, S.t(col, 1.3), S.t(col, 0.7), S.t(col, 0.35));
                c.px(b.x + x + 1, b.top + 1, '#c8ccd2');
            }
        };
        rack(S.R(2.2, 7.0, 8.8, 7.8), 0 + v); rack(S.R(2.2, 4.4, 8.8, 5.2), 4 + v);
        if (W >= 24) rack(S.R(W - 9.6, 4.4, W - 4.4, 5.2), 8 + v);
        // parede de tênis (prateleiras ao fundo) e parede de bolsas/malas
        S.shelf(S.R(1.0, 12.3, W / 2 - 2.6, 13.3), 2.5, 4, ['#f0f0f4', '#2fd07a', '#e03a3a', '#2a2820', '#2f7fd0', '#1c1410', '#f2d22c'], '#e8e4dc');
        S.shelf(S.R(W / 2 + 2.6, 12.3, W - 1.0, 13.3), 2.5, 3, ['#2a2c30', '#4a5034', '#b4bdc9', '#7a4a2a', '#1b2a5a', '#d46a9e'], '#e8e4dc');
        // mesa de vitrine com peças dobradas (pilhas coloridas) e acessórios
        { const b = S.blk(S.R(W / 2 - 2.2, 6.6, W / 2 + 2.2, 8.4), 0.9, '#f4f0ea', '#a89888');
          for (let k = 0; k < 6; k++) { const col = tees[(k * 5 + v) % tees.length], x = b.x + 6 + (k % 3) * Math.floor((b.w - 16) / 3), y = b.top + 4 + Math.floor(k / 3) * Math.floor(b.h / 2 - 2); c.box(x, y, 14, 8, col, S.t(col, 1.3), S.t(col, 0.7), S.t(col, 0.35)); c.fr(x + 1, y + 3, 12, 1, S.t(col, 0.8)); } }
        // espelhos (molduras douradas) e provador com cortina
        for (const xx of [S.P(W - 3.0)]) { const bd = S.band(xx - 1.2, xx + 1.2); c.fr(bd.x, bd.y + 6, bd.w, 30, '#c8a040'); c.fr(bd.x + 2, bd.y + 8, bd.w - 4, 26, '#cfe0ea'); c.fr(bd.x + 4, bd.y + 10, 3, 20, '#ffffff'); }
        { const bd = S.band(S.P(1.2), S.P(4.2)); c.fr(bd.x, bd.y + 4, bd.w, bd.h - 6, '#6a2a48'); for (let x = 2; x < bd.w - 2; x += 4) c.fr(bd.x + x, bd.y + 4, 1, bd.h - 6, '#8a3a60'); c.fr(bd.x, bd.y + 3, bd.w, 2, '#c8a040'); }
        // manequins (cabeça e tronco vestido)
        const mannequin = (x, z, col) => { const px = S.X(x), py = S.Y(z); c.bl(px - 7, py + 2, 18, 7, [8, 5, 3], 0.3); c.box(px - 9, py - 14, 18, 20, col, S.t(col, 1.3), S.t(col, 0.7), S.t(col, 0.3)); c.box(px - 6, py + 4, 12, 4, '#2a2c30', '#4a4d55', '#18191c', '#000'); c.disk(px, py - 19, 6, '#e8e4dc'); c.px(px - 2, py - 22, '#ffffff'); S.solid([x - 0.35, z - 0.35, x + 0.35, z + 0.35], 1.8); };
        mannequin(S.P(W - 2.4), 9.2, tees[(v + 3) % tees.length]); mannequin(S.P(W - 2.4), 7.4, tees[(v + 6) % tees.length]);
        // caixa (balcão) com sacolas da loja
        S.counter(S.R(W / 2 - 3.2, 10.0, W / 2 + 3.2, 11.3), 1.0, '#f4f0ea', '#d46a9e', ['register', 'phone']);
        { const b = S.base(S.R(W / 2 + 1.0, 10.1, W / 2 + 3.0, 11.2), 1.0); c.box(b.x + 4, b.top + 2, 10, 9, '#d46a9e', '#f0a0c8', '#8a3a60', '#401828'); c.box(b.x + 16, b.top + 3, 9, 8, '#f4f0ea', '#fff', '#a8a098', '#403830'); }
        S.rug(S.R(W / 2 - 3.4, 2.0, W / 2 + 3.4, 5.6), '#d46a9e', '#8a3a60', false);
        S.plant(S.P(1.8), 2.6, false); S.plant(S.P(W - 1.8), 2.6, false);
        this._clerk(S, W / 2, 11.9, this.S, 12); if (v & 1) this._patron(S, 5.5, 6.1, this.N, 9 + v);
        S.light(W / 2, 8.5, 8, [255, 236, 220], 0.42); S.light(W / 2, 3.5, 6, [255, 230, 240], 0.28); S.light(S.P(W - 3), 11, 3, [255, 220, 150], 0.25);
        return S.finish(0.3);
    },

    // ======================================================================= PADARIA
    bakery(v) {
        const W = [20, 22, 20, 22, 24][v], D = 13, S = this._ctx('bakery', v, W, D, 0.45);
        S.floor('checker', '#efe2c4', '#c8a070', { size: 16 });
        S.shell({ n: { kind: 'paint', A: '#e8d2a8', B: '#d4b888' }, rail: '#8a5a30', cap: '#7b6a50', side: '#8a6238', front: '#8a5a30', mat: '#7a4a2a' });
        S.shelf(S.R(1.0, 12.1, W - 7.0, 13.2), 2.4, 3, ['#d9a050', '#b87838', '#e8c880', '#8a5a30', '#f0e0b0'], '#8a5a30');
        const bd = S.band(S.P(W - 6.2), S.P(W - 2.6)); S.window(bd.x, bd.y + 10, bd.w, 22, '#a8d0e8');
        S.counter(S.R(2.0, 7.6, W - 7.0, 9.0), 1.0, '#e0d8c4', '#a86a3a', ['register', 'cake', 'tray', 'cups']);
        S.counter(S.R(W - 5.6, 10.2, W - 1.2, 11.6), 1.0, '#e0d8c4', '#a86a3a', ['cake', 'jar']);
        S.table(S.P(W - 5.0), 4.2, 1.6, 1.6, 'wood', '#b88850'); S.chair(S.P(W - 5.0), 5.6, 's'); S.chair(S.P(W - 5.0), 2.8, 'n');
        S.table(S.P(W - 9.2), 4.2, 1.6, 1.6, 'wood', '#b88850'); S.chair(S.P(W - 9.2), 5.6, 's'); S.chair(S.P(W - 9.2), 2.8, 'n');
        S.plant(S.P(1.8), 4.2);
        this._clerk(S, 6.0, 10.5, this.S, 6); this._patron(S, W - 9.2, 5.6, this.N, 7);
        S.light(7, 9, 6, [255, 210, 140], 0.5);
        return S.finish();
    },

    // ======================================================================= ACADEMIA
    // Recepção na entrada (diária, mensalidade e suplementos). Fundo da sala: três ESTAÇÕES do jogador (uses 'gym_squat', 'gym_bench',
    // 'gym_curl' → minigames/Gym.js) ao lado de estações iguais com frequentadores treinando (patron.type = tipo do gerador e .anim = o
    // exercício e a faixa de peso — Interiors anima: séries e descanso), esteira com gente andando, prateleira de halteres, espelhos.
    // O banco e a gaiola desenhados aqui são os de quem está parado; quem treina traz os seus no próprio sprite (por cima).
    gym(v) {
        const W = 24, D = 15, S = this._ctx('gym', v, W, D, 0.5), c = S.c;
        const pal = this._pal(v, [['#3a4048', '#2c3238'], ['#40363a', '#30282c'], ['#2f3a44', '#232c34'], ['#3c3c40', '#2c2c30'], ['#34403a', '#26302a']]);
        const acc = this._pal(v, ['#ff6a1a', '#e8c22c', '#2fb4d0', '#d94a6a', '#5ac07a']);
        S.floor('tile', '#2a2c30', '#232528', { size: 20 });
        S.shell({ n: { kind: 'paint', A: pal[0], B: pal[1] }, n2: { kind: 'tile', x0: 6.5, x1: W - 1.2, A: '#9fb8c4', B: '#86a0ac' }, rail: acc, cap: '#5a5e66', side: '#3a3e46', front: '#3a3e46', mat: '#1a1c20' });
        // espelhos na parede do fundo (faixa clara com reflexos) e cartazes
        { const bd = S.band(S.P(6.8), S.P(W - 1.4)); for (let x = bd.x + 6; x < bd.x + bd.w - 4; x += 22) { c.fr(x, bd.y + 6, 2, bd.h - 14, '#d8eef6'); c.fr(x + 5, bd.y + 10, 1, bd.h - 22, '#c4e2ee'); } }
        { const bd = S.band(S.P(1.4), S.P(5.8)); S.poster(bd.x + 2, bd.y + 8, bd.w - 4, 26, acc, '#1a1a1e', 'lines'); }
        // piso de borracha das áreas de treino e as plataformas de madeira
        S.rug(S.R(3.0, 8.4, W - 3.2, 12.4), '#1c1e22', '#121316', false);
        const plat = (x0, z0, x1, z1) => S.rug(S.R(x0, z0, x1, z1), '#6a4c30', '#3c2a1a', false);
        // equipamento parado: gaiola (dois postes altos e a barra nos ganchos) e banco de supino (estofado ao longo de z, suporte na cabeceira)
        const rack = (cx, cz) => {
            plat(cx - 1.2, cz - 0.9, cx + 1.2, cz + 0.9);
            for (const s of [-1, 1]) S.blk(S.R(cx + s * 0.66 - 0.06, cz - 0.16, cx + s * 0.66 + 0.06, cz + 0.16), 2.0, '#4a4e56', '#3a3d44', false);
            const b = S.base(S.R(cx - 0.85, cz + 0.05, cx + 0.85, cz + 0.12), 1.35); c.fr(b.x, b.top, b.w, 2, '#c8ccd2');
            for (const s of [-1, 1]) { const p = S.base(S.R(cx + s * 0.75 - 0.08, cz, cx + s * 0.75 + 0.08, cz + 0.12), 1.35); c.fr(p.x, p.top - 6, p.w, 12, '#18181c'); }
        };
        const bench = (cx, cz) => {
            plat(cx - 0.8, cz - 1.1, cx + 0.8, cz + 1.0);
            S.blk(S.R(cx - 0.15, cz - 0.8, cx + 0.15, cz + 0.45), 0.45, '#1a1a20', '#2a2a32', false);
            for (const s of [-1, 1]) S.blk(S.R(cx + s * 0.46 - 0.04, cz + 0.52, cx + s * 0.46 + 0.04, cz + 0.6), 1.05, '#4a4e56', '#3a3d44', false);
            const b = S.base(S.R(cx - 0.75, cz + 0.5, cx + 0.75, cz + 0.56), 1.0); c.fr(b.x, b.top, b.w, 2, '#c8ccd2');
        };
        const curlSpot = (cx, cz) => plat(cx - 0.7, cz - 0.6, cx + 0.7, cz + 0.6);
        // estações: [x, z, use, frequentador (tipo, faixa, face) | null]
        const ST = [
            [5.2, 10.4, 'gym_squat', null], [8.6, 10.4, 'gym_squat', ['academia_m', 'w3']],
            [12.0, 10.0, 'gym_bench', null], [14.6, 10.0, 'gym_bench', ['academia_m', 'w2']],
            [18.0, 9.8, 'gym_curl', null], [20.0, 9.8, 'gym_curl', ['academia_f', 'w1']],
        ];
        ST.forEach(([x, z, use, who], i) => {
            if (use === 'gym_squat') rack(x, z); else if (use === 'gym_bench') bench(x, z); else curlSpot(x, z);
            if (!who) { S.use(use, S.R(x - 0.9, z - 0.9, x + 0.9, z + 0.9)); const u = S.uses[S.uses.length - 1]; u.px = S.P(x); u.pz = z; u.face = use === 'gym_bench' ? this.N : this.S; }
            else {
                const face = use === 'gym_bench' ? this.N : this.S;
                S.patrons.push({ x: S.P(x), z, face: this._face(S, face), variant: 3 + i * 5 + v, type: who[0], anim: { clip: use, w: who[1] } });
            }

        });
        // prateleira de halteres no fundo e árvore de anilhas
        { const r = S.R(15.6, 12.9, W - 1.4, 13.6), b = S.blk(r, 0.75, '#3a3d44', '#2a2d34');
          for (let x = b.x + 4, k = 0; x < b.x + b.w - 6; x += 9, k++) { const rr = 2 + (k % 4); c.disk(x, b.top + 4, rr, '#18181c'); c.disk(x + 5, b.top + 4, rr, '#18181c'); c.fr(x, b.top + 4, 5, 1, '#c8ccd2'); } }
        { const r = S.R(1.6, 11.2, 2.4, 12.0), b = S.blk(r, 1.2, '#2a2c32', '#3a3d44'); for (let k = 0; k < 3; k++) { c.disk(b.x + (b.w >> 1), b.top + 4 + k * 6, 6 - k, '#141418'); c.ring(b.x + (b.w >> 1), b.top + 4 + k * 6, 6 - k, '#3a3d44'); } }
        // esteiras na lateral (uma com alguém caminhando)
        for (const [z0, who] of [[4.0, ['academia_f', 'walk']], [6.2, null]]) {
            const r = S.R(W - 2.6, z0, W - 1.2, z0 + 1.8), b = S.blk(r, 0.35, '#2a2c32', '#1a1c20', false);
            c.fr(b.x + 3, b.top + 3, b.w - 6, b.h - 6, '#101114'); c.fr(b.x + 2, b.top, b.w - 4, 3, '#4a4e56');
            S.solid(S.R(W - 2.6, z0, W - 1.2, z0 + 0.3), 1.2);
            if (who) S.patrons.push({ x: S.P(W - 1.9), z: z0 + 1.0, face: this._face(S, this.N), variant: 7 + v, type: who[0], anim: { clip: 'walk', w: 'none' } });
        }
        // recepção (diária, mensalidade, suplementos) e o bebedouro
        S.counter(S.R(1.2, 3.0, 6.2, 4.0), 1.05, '#2a2c32', acc, ['register', 'cups']);
        S.cooler(S.R(1.2, 6.0, 2.4, 6.8), 1.9, acc);
        S.plant(S.P(1.6), 13.6, false);
        this._clerk(S, 3.6, 4.8, this.S, 6);
        S.light(6, 10, 7, [235, 245, 255], 0.45); S.light(16, 10, 7, [235, 245, 255], 0.45); S.light(4, 4, 5, [255, 230, 190], 0.3);
        return S.finish(0.36);
    },

    // ======================================================================= BAR (rústico)
    bar(v) {
        const W = [22, 24, 22, 24, 22][v], D = 14, S = this._ctx('bar', v, W, D, 0.4);
        S.floor('planks', ['#7a5a38', '#80603c', '#6e5030', '#876540', '#74562f'][v], '#946c44');
        S.shell({ n: { kind: 'wood', A: '#7a5636', B: '#5e4228' }, rail: '#3a2818', cap: '#4a3a28', side: '#5a4028', front: '#5a4028', mat: '#3a2a1c' });
        // prateleiras de garrafas
        for (let tier = 0; tier < 2; tier++) {
            const bd = S.band(S.P(1.6), S.P(W - 9)), y = bd.base - bd.h + 20 + tier * 26;
            S.c.fr(bd.x, y + 12, bd.w, 3, '#3a2818'); S.c.fr(bd.x, y + 12, bd.w, 1, '#8a6238');
            for (let x = bd.x + 4; x < bd.x + bd.w - 6; x += 6 + (x % 3)) S.bottle(x, y + 12, ['#3f7a40', '#8a4a20', '#c8b060', '#2f4a8a', '#a03030', '#d8d0b0'][Math.floor(S.rng() * 6)], 11 + (x % 4));
        }
        let bd = S.band(S.P(W - 7.4), S.P(W - 4.2)); S.poster(bd.x, bd.y + 12, bd.w, 24, '#c8b078', '#5a3a1a', 'lines');
        bd = S.band(S.P(W - 3.8), S.P(W - 1.6)); S.window(bd.x, bd.y + 14, bd.w, 20, '#26425a');
        // balcão do bar + banquetas
        S.counter(S.R(2.0, 8.4, W - 9.6, 9.8), 1.05, '#9a6a3a', '#6a4426', ['bottles', 'cups', 'bell', 'tray']);
        for (let k = 0; k < 5; k++) S.stool(S.P(2.8 + k * 2.4), 7.2);
        S.table(S.P(4.5), 3.6, 1.8, 1.8, 'wood', '#8a6238'); S.chair(S.P(4.5), 5.2, 's'); S.chair(S.P(4.5), 2.0, 'n'); S.chair(S.P(6.4), 3.6, 'w');
        // mesa de sinuca
        { const r = S.R(W - 8.8, 2.6, W - 3.0, 5.8), b = S.blk(r, 0.9, '#2f7a40', '#4a3018'); const c = S.c; S.use('pool', r);
          c.box(b.x, b.top, b.w, b.h, '#5a3a1c', '#8a6238', '#33220f', '#1a1008'); c.fr(b.x + 4, b.top + 4, b.w - 8, b.h - 8, '#2f8a48'); c.fr(b.x + 4, b.top + 4, b.w - 8, 1, '#3fa05a');
          for (const [bx2, by2, col] of [[30, 20, '#d9453a'], [34, 24, '#e0c030'], [34, 16, '#2f6fb5'], [38, 20, '#101010'], [38, 14, '#d9702a'], [38, 26, '#8a4ab0']]) c.disk(b.x + bx2, b.top + by2 - 6, 2, col);
          c.disk(b.x + 14, b.top + 19, 2, '#f4f1e8'); c.ln(b.x + 4, b.top + 36, b.x + 28, b.top + 22, '#d9b878');
          for (const [px, py] of [[b.x + 4, b.top + 4], [b.x + b.w - 5, b.top + 4], [b.x + 4, b.top + b.h - 5], [b.x + b.w - 5, b.top + b.h - 5], [b.x + b.w / 2 | 0, b.top + 4], [b.x + b.w / 2 | 0, b.top + b.h - 5]]) c.disk(px, py, 2, '#0a0a0a'); }
        // jukebox no canto
        { const r = S.R(W - 2.8, 10.4, W - 1.2, 11.8), b = S.blk(r, 1.7, '#6a3a1c', '#a8482c'); S.c.disk(b.x + (b.w / 2 | 0), b.fy + 10, 6, '#e8c060'); S.c.disk(b.x + (b.w / 2 | 0), b.fy + 10, 3, '#a8482c'); for (let i = 0; i < b.w - 4; i += 3) S.c.px(b.x + 2 + i, b.fy + 20, '#7ad8e8'); }
        S.plant(S.P(1.8), 12.4, false);
        this._clerk(S, 6.0, 10.8, this.S, 8); this._patron(S, 5.6, 7.2, this.N, 9); this._patron(S, W - 6, 6.5, this.S, 10); if (v & 2) this._patron(S, 4.5, 5.2, this.S, 11);
        S.light(7, 9, 6, [255, 190, 110], 0.5); S.light(W - 6, 4, 5, [255, 220, 150], 0.35);
        return S.finish(0.4);
    },

    // ======================================================================= PIZZARIA SIMPLES
    pizza(v) {
        const W = [22, 22, 24, 22, 20][v], D = 13.5, S = this._ctx('pizza', v, W, D, 0.5);
        S.floor('tile', ['#b8a890', '#c0b098', '#b0a088', '#c4b49c', '#b4a48c'][v], '#8a7a66', { size: 24 });
        S.shell({ n: { kind: 'brick', A: '#b0583a', B: '#8a4228' }, n2: { kind: 'paint', x0: 0.7, x1: 8.5, A: '#d4c4a0', B: '#bfae88' }, rail: '#5a3a28', cap: '#6a5a48', side: '#7a5030', front: '#6a4028', mat: '#6a2a24' });
        // forno de tijolo à direita
        { const r = S.R(W - 8.8, 10.0, W - 3.2, 13.0), b = S.blk(r, 2.0, '#a05030', '#b8603a'), c = S.c;
          for (let j = 0; j < b.hp; j += 6) c.fr(b.x + 1, b.fy + j, b.w - 2, 1, '#6a3420'); for (let i = 0; i < b.w; i += 10) c.fr(b.x + i, b.fy, 1, b.hp, '#6a3420');
          const mx = b.x + (b.w / 2 | 0), my = b.fy + b.hp - 4; c.disk(mx, my - 4, 11, '#2a1810'); c.fr(mx - 11, my - 4, 22, 8, '#2a1810'); c.disk(mx, my - 4, 8, '#e8782a'); c.fr(mx - 8, my - 4, 16, 6, '#e8782a'); c.disk(mx - 1, my - 4, 4, '#ffd060'); c.fr(mx - 3, my - 1, 8, 3, '#ffd060');
          c.box(b.x + (b.w / 2 | 0) - 5, b.top - 24, 10, 28, '#6a6e78', '#9a9ea8', '#3a3e46', '#1a1c20');                                             // chaminé
          c.disk(mx, my - 6, 2, '#fff2a0'); S.light(S.P(W - 6), 9.4, 4.5, [255, 140, 50], 0.7);
          for (let k = 0; k < 4; k++) c.box(b.x + 4 + k * 11, b.fy + b.hp + 1, 9, 5, '#7a5230', '#a87848', '#4a3018', '#201408'); }
        // mesa de preparo (massa) e balcão
        { const b = S.counter(S.R(2.4, 10.2, 8.8, 11.8), 0.95, '#c8ccd0', '#7a7e86', []); const c = S.c;
          c.disk(b.x + 22, b.top + 12, 9, '#e8d8a8'); c.disk(b.x + 22, b.top + 12, 7, '#f0e4bc'); c.disk(b.x + 52, b.top + 11, 8, '#d8c890'); c.fr(b.x + 80, b.top + 6, 18, 10, '#d4b070'); c.ln(b.x + 66, b.top + 20, b.x + 80, b.top + 6, '#7a5230'); }
        S.counter(S.R(2.0, 7.0, 9.5, 8.2), 1.0, '#a89678', '#7a5230', ['register', 'tray', 'cups']);
        // mesas de toalha xadrez
        const spots = [[W - 5.0, 4.6], [W - 9.4, 4.6], [W - 13.8, 4.6], [W - 5.0, 8.0]].slice(0, v < 2 ? 3 : 4);
        for (const [tx, tz] of spots) { S.table(S.P(tx), tz, 1.8, 1.8, 'check'); S.chair(S.P(tx), tz + 1.5, 's'); S.chair(S.P(tx), tz - 1.5, 'n'); S.chair(S.P(tx - 1.5), tz, 'e'); S.chair(S.P(tx + 1.5), tz, 'w'); }
        { const b = S.base(S.R(W - 2.6, 9.0, W - 1.2, 10.4), 0.6); S.shadow(b); for (let k = 0; k < 3; k++) S.c.box(b.x + 1, b.y - 6 - k * 4, b.w - 2, 6, '#8a5a30', '#b88850', '#4a3018', '#201408'); S.solid(S.R(W - 2.6, 9.0, W - 1.2, 10.4), 0.9); }       // lenha
        const bd = S.band(S.P(1.4), S.P(5.4)); S.poster(bd.x, bd.y + 8, bd.w, 30, '#e8d8a8', '#c0392b', 'sun');
        this._clerk(S, 5.5, 9.2, this.S, 12); this._patron(S, W - 9.4, 6.1, this.S, 13); if (v >= 2) this._patron(S, W - 5.0, 3.1, this.N, 14);
        S.light(5.5, 9, 6, [255, 210, 150], 0.45); S.light(W - 9, 5, 7, [255, 220, 170], 0.3);
        return S.finish();
    },

    // ======================================================================= SALADAS & SUCOS FIT
    fit(v) {
        const W = [20, 22, 20, 22, 24][v], D = 13, S = this._ctx('fit', v, W, D, 0.5);
        S.floor('planks', '#d8c098', '#e6d0a8');
        S.shell({ n: { kind: 'paint', A: ['#d8e8b8', '#e0eec8', '#c8e0c0', '#e8e8c0', '#d0e8d8'][v], B: '#bcd498' }, rail: '#4a8a40', cap: '#8a9a70', side: '#9a7a50', front: '#7a9a50', mat: '#4a7a3a' });
        let bd = S.band(S.P(2.0), S.P(6.4)); S.poster(bd.x, bd.y + 8, bd.w, 32, '#f4f0d0', '#e8702a', 'fruit');
        bd = S.band(S.P(W - 7.4), S.P(W - 2.8)); S.window(bd.x, bd.y + 10, bd.w, 24, '#9ad0e8');
        // caixotes de fruta encostados na parede
        const crate = (r, cols) => { const b = S.blk(r, 0.8, '#b08850', '#8a6838'), c = S.c; for (let i = 3; i < b.w - 4; i += 6) for (let j = 3; j < b.h - 3; j += 6) c.disk(b.x + i, b.top + j, 3, cols[(i + j) % cols.length]); c.fr(b.x, b.fy + 2, b.w, 1, '#5a4020'); };
        crate(S.R(W - 6.6, 11.6, W - 4.2, 13.2), ['#e8702a', '#f0a030']); crate(S.R(W - 4.0, 11.6, W - 1.6, 13.2), ['#d9453a', '#c03030']); crate(S.R(W - 6.6, 9.8, W - 4.2, 11.4), ['#7ac040', '#58a030']); crate(S.R(W - 4.0, 9.8, W - 1.6, 11.4), ['#f0d840', '#e8c030']);
        S.cooler(S.R(1.0, 11.4, 3.4, 13.3), 2.1, '#3fa34d'); S.cooler(S.R(3.6, 11.4, 6.0, 13.3), 2.1, '#e8702a');
        // balcão do bar de sucos com espremedor
        { const b = S.counter(S.R(2.0, 8.0, W - 8.4, 9.4), 1.05, '#f4f0e0', '#6aa040', ['register', 'cups', 'jar']); const c = S.c;
          const mx = b.x + b.w - 26; c.box(mx, b.top + 2, 14, 18, '#c8ccd0', '#f4f6f8', '#7a7e86', '#2a2c32'); c.fr(mx + 2, b.top + 4, 10, 8, '#f0a030'); c.fr(mx + 2, b.top + 12, 10, 3, '#3a3d44'); }
        S.table(S.P(W - 5.0), 5.0, 1.6, 1.6, 'wood', '#d8b880'); S.stool(S.P(W - 6.8), 5.0); S.stool(S.P(W - 3.2), 5.0);
        S.table(S.P(W - 10.0), 4.2, 1.6, 1.6, 'wood', '#d8b880'); S.stool(S.P(W - 11.8), 4.2); S.stool(S.P(W - 8.2), 4.2);
        S.plant(S.P(1.8), 5.4); S.plant(S.P(W - 1.8), 6.4, false);
        this._clerk(S, 6.0, 10.2, this.S, 15); if (v >= 1) this._patron(S, W - 5.0, 3.6, this.N, 16);
        S.light(7, 9, 6, [255, 245, 200], 0.4); S.light(W - 6, 5, 6, [255, 245, 210], 0.3);
        return S.finish(0.26);
    },

    // ======================================================================= RESTAURANTE ITALIANO (luxo)
    italian(v) {
        const W = [24, 24, 26, 24, 26][v], D = 15, S = this._ctx('italian', v, W, D, 0.5);
        S.floor('marble', '#ece8e0', '#8a8478');
        S.rug(S.R(W / 2 - 1.5, 1.3, W / 2 + 1.5, D - 0.9), '#7a1f24', '#d4a84a');
        S.shell({ n: { kind: 'panel', A: ['#6a2028', '#5a2a30', '#2a3a2e', '#4a2a40', '#6a3a28'][v], B: '#4a2c1c' }, rail: '#2a1810', cap: '#3a2a20', side: '#3a2418', front: '#3a2418', mat: '#5a1a1e' });
        // adegas de vinho nas laterais da parede norte
        const rack = (r) => { const b = S.base(r, 2.6), c = S.c; S.shadow(b); c.fr(b.x, b.top, b.w, b.hp + b.h, '#1c1008'); c.box(b.x, b.top, b.w, b.hp + 3, '#4a2c18', '#7a4a28', '#2a1608', '#100804');
            for (let j = 4; j < b.hp - 2; j += 7) for (let i = 4; i < b.w - 3; i += 7) { c.disk(b.x + i, b.top + j, 3, '#1a0a06'); c.disk(b.x + i, b.top + j, 2, ['#5a1a24', '#3a4a22', '#8a7040'][(i + j) % 3]); }
            c.box(b.x, b.top + b.hp + 2, b.w, b.h - 1, '#5a3820', '#8a5a34', '#2a1608', '#100804'); S.solid(r, 2.6); };
        rack(S.R(1.0, 12.9, 5.6, 14.3)); rack(S.R(W - 5.6, 12.9, W - 1.0, 14.3));
        let bd = S.band(S.P(W / 2 - 3.6), S.P(W / 2 + 3.6)); S.poster(bd.x, bd.y + 10, bd.w, 28, '#3a5a3a', '#f0d870', 'landscape');
        // balcão do maître (clerk)
        S.counter(S.R(W / 2 - 3.0, 10.4, W / 2 + 3.0, 11.6), 1.05, '#3a2418', '#5a3a22', ['bottles', 'bell']);
        // mesas de toalha branca (2 colunas)
        const cols = [W / 2 - 6.2, W / 2 + 6.2], rows = v < 2 ? [8.0, 4.4] : [8.6, 5.6, 2.8];
        for (const tx of cols) for (const tz of rows) {
            S.table(tx, tz, 2.0, 2.0, 'white');
            const b = S.base([tx - 1, tz - 1, tx + 1, tz + 1], 0.85); S.plate(b.x + 9, b.top + 8, true); S.plate(b.x + b.w - 9, b.top + 8, true); S.glass(b.x + 18, b.top + 12); S.glass(b.x + b.w - 20, b.top + 12);
            S.c.fr(b.x + (b.w / 2 | 0) - 1, b.top + 12, 3, 5, '#2f4a2a'); S.c.px(b.x + (b.w / 2 | 0), b.top + 10, '#ffd23a');
            S.chair(tx, tz + 1.8, 's', '#5a2a1c'); S.chair(tx, tz - 1.8, 'n', '#5a2a1c');
        }
        S.plant(S.P(1.8), 6.0); S.plant(S.P(W - 1.8), 6.0);
        // lustres
        for (const [lx, lz] of [[W / 2 - 6.2, 7.4], [W / 2 + 6.2, 7.4], [W / 2, 4.6]]) { S.lamp(lx, lz, '#ffe8a0', '#c8a040'); S.light(lx, lz - 0.6, 5, [255, 220, 140], 0.5); }
        this._clerk(S, W / 2, 12.5, this.S, 28); this._patron(S, cols[0], rows[0] + 1.8, this.N, 29); this._patron(S, cols[1], rows[rows.length - 1] - 1.8, this.S, 30); if (v >= 3) this._patron(S, cols[0], rows[1] - 1.8, this.S, 31);
        return S.finish(0.42);
    },

    // ======================================================================= RESTAURANTE JAPONÊS (luxo)
    japanese(v) {
        const W = [24, 24, 26, 24, 26][v], D = 14, S = this._ctx('japanese', v, W, D, 0.35);
        S.floor('planks', '#a88454', '#b8925e');
        S.shell({ n: { kind: 'bamboo', A: '#d8d0a0', B: '#6a9a4a' }, rail: '#4a3a20', cap: '#6a5a38', side: '#5a7a3a', front: '#5a7a3a', mat: '#7a5a30' });
        // tatami + mesa baixa (à direita)
        { const r = S.R(W - 9.4, 1.8, W - 1.4, 8.6), c = S.c, x = S.X(r[0]), y = S.Y(r[3]), w = S.X(r[2]) - x, h = S.Y(r[1]) - y;
          c.fr(x - 2, y - 2, w + 4, h + 4, '#3a2a18'); for (let j = 0; j < h; j += 40) for (let i = 0; i < w; i += 80) { c.fr(x + i, y + j, Math.min(80, w - i), Math.min(40, h - j), '#a8bc78'); c.fr(x + i, y + j, Math.min(80, w - i), 1, '#c8dc98'); c.fr(x + i, y + j, 1, Math.min(40, h - j), '#7a8e50'); c.fr(x + i + 1, y + j + 1, Math.min(80, w - i) - 2, 2, '#3a4a28'); }
          HouseArt._grain(c, x, y, w, h, 7, S.seed); }
        { const t = S.table(S.P(W - 5.4), 5.2, 2.6, 2.0, 'wood', '#5a3a22'); S.plate(t.x + 10, t.top + 9, true); S.plate(t.x + t.w - 10, t.top + 9, true); S.c.fr(t.x + (t.w / 2 | 0) - 2, t.top + 6, 4, 8, '#e8e0c8');
          for (const [cx2, cz2] of [[W - 7.8, 5.2], [W - 3.0, 5.2], [W - 5.4, 7.4], [W - 5.4, 3.0]]) { const b = S.base([S.P(cx2) - 0.5, cz2 - 0.5, S.P(cx2) + 0.5, cz2 + 0.5], 0.2); S.c.box(b.x, b.y, b.w, b.h, '#b8382c', '#d8584a', '#7a2018', '#301008'); } }
        // balcão de sushi (vidro) com chef atrás
        { const b = S.counter(S.R(2.0, 8.2, W - 10.8, 9.8), 1.05, '#d8c8a0', '#4a3418', []); const c = S.c;
          c.fr(b.x + 2, b.top + 2, b.w - 4, b.h - 4, '#a8c8c8'); c.fr(b.x + 2, b.top + 2, b.w - 4, 2, '#d8f0f0');
          for (let i = 6; i < b.w - 8; i += 11) { c.box(b.x + i, b.top + 6, 9, 5, '#2a2a2e', '#4a4a50', '#101012', '#000'); c.fr(b.x + i + 1, b.top + 6, 7, 3, ['#e8e0d0', '#e87a5a', '#e8a8a0', '#f0c860'][(i / 11 | 0) % 4]); c.px(b.x + i + 4, b.top + 5, '#3f9a52'); }
          for (let i = 8; i < b.w - 10; i += 22) { c.disk(b.x + i, b.top + 19, 4, '#e8e4dc'); c.disk(b.x + i, b.top + 19, 2, ['#e87a5a', '#f0c860'][(i / 22 | 0) % 2]); } }
        for (let k = 0; k < 5; k++) { const b = S.base(S.R(2.6 + k * 2.4, 6.3, 3.4 + k * 2.4, 7.1), 0.6); S.c.box(b.x, b.y - 4, b.w, b.h + 4, '#8a5a30', '#b88850', '#4a3018', '#201408'); S.solid(S.R(2.6 + k * 2.4, 6.3, 3.4 + k * 2.4, 7.1), 0.6); }
        // noren vermelho e quadro na parede
        let bd = S.band(S.P(W - 8.0), S.P(W - 4.0)); S.c.fr(bd.x, bd.y + 6, bd.w, 5, '#2a1c10'); for (let i = 0; i < bd.w - 10; i += 14) { S.c.fr(bd.x + 2 + i, bd.y + 11, 12, 30, '#b8282f'); S.c.fr(bd.x + 2 + i, bd.y + 11, 12, 1, '#e0585a'); S.c.fr(bd.x + 7 + i, bd.y + 20, 2, 10, '#f4ecd8'); }
        bd = S.band(S.P(3.0), S.P(8.0)); S.poster(bd.x, bd.y + 10, bd.w, 24, '#e8e0c0', '#1a1a1a', 'landscape');
        S.plant(S.P(1.8), 4.4); S.plant(S.P(W - 1.8), 10.8, false);
        // lanternas de papel
        for (const [lx, lz] of [[5.0, 6.4], [W - 6.0, 6.0], [10.5, 5.0]]) { const px = S.X(S.P(lx)), py = S.Y(lz); S.c.ln(px, S.nY - S.faceH + 4, px, py - 12, '#1a1410'); S.c.disk(px, py - 5, 7, '#7a2018'); S.c.disk(px, py - 5, 6, '#e0502a'); S.c.disk(px - 1, py - 6, 3, '#ffb060'); S.c.fr(px - 3, py - 13, 6, 2, '#2a1c10'); S.c.fr(px - 3, py + 1, 6, 2, '#2a1c10'); S.light(S.P(lx), lz - 0.4, 5.5, [255, 150, 80], 0.5); }
        this._clerk(S, 7.2, 10.8, this.S, 32); this._patron(S, 5.0, 6.7, this.N, 33); this._patron(S, W - 3.0, 5.2, this.WW, 34); if (v >= 2) this._patron(S, 8.6, 6.7, this.N, 35);
        return S.finish(0.4);
    },

    // ======================================================================= LOJA DE ARMAS (cidade, legal)
    guns(v) {
        const W = [22, 22, 24, 20, 24][v], D = 13.5, S = this._ctx('guns', v, W, D, 0.5);
        S.floor('concrete', ['#4a5658', '#505a54', '#46505c', '#555255', '#4a5a50'][v], '#3a4446', { size: 24 });
        S.shell({ n: { kind: 'paint', A: ['#3a4a48', '#3e4a3c', '#3a4452', '#4a4640', '#34483e'][v], B: '#2a3836' }, n2: { kind: 'pegboard', x0: 1.0, x1: W - 1.0, A: '#262c2e' }, rail: '#1a2020', cap: '#5a6258', side: '#3a4240', front: '#3a4240', mat: '#2a2c28' });
        // painel de armas (pegboard): fuzis longos e pistolas
        { const bd = S.band(S.P(1.0), S.P(W - 1.0)), c = S.c, y0 = bd.y + 10;
          const gun = (x, y, long) => { c.ln(x, y - 1, x + (long ? 28 : 11), y - 1, '#c8ccd2'); c.ln(x, y, x + (long ? 28 : 11), y, '#aeb4bc'); c.ln(x, y + 1, x + (long ? 28 : 11), y + 1, '#2a2e32'); if (long) { c.fr(x, y - 1, 8, 4, '#5a3a22'); c.fr(x + 20, y - 3, 4, 3, '#16181a'); } else { c.fr(x, y, 3, 7, '#8a8e96'); c.px(x + 4, y - 1, '#c8ccd2'); } };
          for (let x = bd.x + 8; x < bd.x + bd.w - 34; x += 46) { gun(x, y0 + 4, true); gun(x + 2, y0 + 12, true); gun(x + 6, y0 + 22, false); gun(x + 24, y0 + 22, false); gun(x + 10, y0 + 31, true); } }
        // prateleira de caixas de munição
        { const b = S.base(S.R(1.0, 12.6, 6.4, 13.3), 1.3); S.shadow(b); const c = S.c;
          c.box(b.x, b.top + 4, b.w, 4, '#2a3030', '#4a5250', '#101414', '#000');
          for (let i = 4; i < b.w - 14; i += 16) { c.box(b.x + i, b.top - 6, 14, 12, '#4a6a3a', '#7a9a5a', '#2a4020', '#101a0c'); c.fr(b.x + i + 2, b.top - 3, 10, 2, '#d8d070'); c.box(b.x + i, b.top + 10, 14, 10, '#6a7a4a', '#9aaa6a', '#3a4a28', '#161e0c'); }
          S.solid(S.R(1.0, 12.6, 6.4, 13.3), 1.3); }
        // balcão central com caixa + vitrines de vidro
        S.counter(S.R(W / 2 - 4.4, 8.4, W / 2 + 4.4, 9.8), 1.05, '#c0c8c4', '#3a4440', ['register', 'money', 'phone']);
        const showcase = (r) => { const b = S.blk(r, 1.0, '#a8c8c8', '#3a4440'), c = S.c; c.fr(b.x + 2, b.top + 2, b.w - 4, b.h - 4, '#8ab0b4'); c.fr(b.x + 2, b.top + 2, b.w - 4, 2, '#d8f0f0');
            for (let i = 6; i < b.w - 22; i += 24) { c.ln(b.x + i, b.top + 9, b.x + i + 14, b.top + 9, '#16181a'); c.fr(b.x + i, b.top + 9, 3, 8, '#16181a'); c.ln(b.x + i + 2, b.top + 19, b.x + i + 18, b.top + 19, '#16181a'); c.fr(b.x + i + 2, b.top + 19, 3, 6, '#16181a'); }
            c.fr(b.x + 1, b.fy + 3, b.w - 2, b.hp - 5, '#8ab0b4'); c.fr(b.x + 1, b.fy + 3, b.w - 2, 2, '#d8f0f0'); };
        const se = v >= 2 ? 6.6 : 8.4; showcase(S.R(1.8, 4.6, se, 5.9)); showcase(S.R(W - se, 4.6, W - 1.8, 5.9));
        if (v >= 2 && W >= 22) showcase(S.R(W / 2 - 2.2, 3.4, W / 2 + 2.2, 4.7));
        // pilhas de caixotes de munição
        const crates = (r) => { const b = S.blk(r, 1.2, '#5a7a44', '#46603a'), c = S.c; c.fr(b.x + 2, b.fy + 3, b.w - 4, 2, '#d8d070'); c.fr(b.x + 2, b.top + 3, b.w - 4, 2, '#8aa060'); c.fr(b.x + (b.w / 2 | 0) - 1, b.top + 2, 3, b.h - 4, '#3a4a2a'); };
        crates(S.R(W - 4.6, 10.4, W - 1.2, 12.6)); crates(S.R(W - 3.4, 8.4, W - 1.2, 10.0));
        const bd2 = S.band(S.P(W - 4.4), S.P(W - 2.2)); void bd2;
        this._clerk(S, W / 2, 10.9, this.S, 36); if (v >= 1) this._patron(S, W / 2 - 5, 3.2, this.N, 37);
        S.light(W / 2, 9, 7, [210, 235, 230], 0.4); S.light(W / 2, 4, 5, [230, 245, 240], 0.25);
        return S.finish(0.4);
    },

    // ======================================================================= BOCA DE FUMO (favela: armas e mercado clandestino)
    drugs(v) {
        const W = [20, 20, 22, 20, 22][v], D = 12.5, S = this._ctx('drugs', v, W, D, 0.5);
        S.floor('concrete', '#6e6a62', '#58544c', { size: 28 });
        S.shell({ n: { kind: 'concrete', A: ['#7a756a', '#6c7268', '#80746a', '#6a6e74', '#7a7466'][v], B: '#575248' }, rail: '#3a362e', cap: '#4a463e', side: '#4a463a', front: '#3a362e', mat: '#2a2622' });
        // grafite e cartazes na parede
        { const bd = S.band(S.P(2.0), S.P(W - 2.0)), c = S.c; const cols = ['#e0a020', '#2f9ad0', '#d9453a', '#6ac048'];
          for (let k = 0; k < 5; k++) { const gx = bd.x + 10 + k * 36, gy = bd.y + 12 + (k % 2) * 6, col = cols[(k + v) % 4]; c.disk(gx + 6, gy + 6, 7, col); c.disk(gx + 6, gy + 6, 4, '#2a2622'); c.ln(gx - 4, gy + 18, gx + 20, gy + 14, col); c.ln(gx - 3, gy + 19, gx + 21, gy + 15, this.t ? col : col); }
          S.poster(bd.x + bd.w - 40, bd.y + 10, 20, 28, '#a89868', '#2a2622', 'wanted'); }
        // lâmpada pelada no fio e luz fraca
        S.lamp(W / 2, 7.6, '#ffe0a0'); S.light(W / 2, 7.4, 6.5, [255, 190, 100], 0.55); S.light(3, 3.5, 4, [255, 60, 50], 0.35);
        // mesa dos fundos: armas e dinheiro
        { const b = S.blk(S.R(2.0, 10.0, W - 5.2, 11.5), 0.9, '#6a4a2a', '#4a3018'), c = S.c;
          for (let i = 6; i < b.w - 26; i += 30) { c.ln(b.x + i, b.top + 7, b.x + i + 22, b.top + 7, '#16181a'); c.ln(b.x + i, b.top + 8, b.x + i + 22, b.top + 8, '#2a2e32'); c.fr(b.x + i, b.top + 7, 6, 4, '#5a3a22'); c.fr(b.x + i + 6, b.top + 14, 12, 3, '#16181a'); c.fr(b.x + i + 6, b.top + 14, 3, 7, '#16181a'); }
          c.fr(b.x + b.w - 24, b.top + 6, 16, 9, '#6aa86a'); c.fr(b.x + b.w - 22, b.top + 8, 12, 1, '#3a6a3a'); c.fr(b.x + b.w - 20, b.top + 11, 10, 6, '#7ab87a'); }
        // balcão com grade de ferro
        { const b = S.counter(S.R(2.8, 7.0, W - 2.8, 8.2), 1.0, '#6a665e', '#4a463e', ['scale', 'money', 'phone']); const c = S.c;
          for (let i = 3; i < b.w - 2; i += 6) { c.fr(b.x + i, b.top - 28, 2, 36, '#1c1e22'); c.fr(b.x + i, b.top - 28, 1, 36, '#4a4e56'); }
          c.fr(b.x + 2, b.top - 28, b.w - 4, 2, '#1c1e22'); c.fr(b.x + 2, b.top - 6, b.w - 4, 2, '#1c1e22'); }
        // sofá rasgado, TV, colchão
        { const b = S.blk(S.R(1.2, 2.2, 3.6, 5.6), 0.9, '#6a4a3a', '#4a3024'), c = S.c; c.fr(b.x + 3, b.top + 4, b.w - 6, 10, '#7a5646'); c.ln(b.x + 5, b.top + 20, b.x + 14, b.top + 28, '#2a1c14'); c.fr(b.x + 4, b.top + b.h - 8, 12, 4, '#a8a090'); }
        { const b = S.blk(S.R(W - 4.0, 2.6, W - 1.4, 4.6), 0.8, '#3a3e44', '#26282c'), c = S.c; c.box(b.x + 3, b.top - 6, 24, 16, '#16181c', '#3a3e46', '#0a0a0c', '#000'); c.fr(b.x + 6, b.top - 3, 16, 9, '#46586a'); c.ln(b.x + 8, b.top - 1, b.x + 14, b.top + 3, '#8aa8c0'); }
        { const r = S.R(W - 7.6, 4.8, W - 4.6, 6.0), b = S.base(r, 0.3); void b; }
        S.c.fr(S.X(S.P(7.0)) - 8, S.Y(3.0) - 4, 26, 12, '#8a8a7a'); S.c.fr(S.X(S.P(7.0)) - 8, S.Y(3.0) - 4, 26, 1, '#b8b8a8');           // papelão no chão
        this._clerk(S, W / 2, 8.9, this.S, 38); this._patron(S, 4.4, 5.4, this.E, 39); this._patron(S, W - 3.2, 6.0, this.WW, 40); if (v >= 2) this._patron(S, W / 2 + 3, 4.0, this.N, 41);
        return S.finish(0.5);
    },
};
