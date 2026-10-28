// ============================================================================
// ShopStyles — os LAYOUTS dos interiores (11 tipos × 5 variações). Cada função pinta um ShopCtx (art/ShopArt.js) e devolve o quadro
// pronto. As variações mudam: tamanho da sala, paleta, quantidade/posição de mesas e balcões e o espelhamento do layout.
//   burger (lanchonete) · mart (conveniência) · pharmacy · bakery · bar (rústico) · pizza · fit (saladas e sucos) ·
//   italian (luxo) · japanese (luxo) · guns (loja de armas legal da cidade) · drugs (boca de fumo: armas da favela)
// ============================================================================

const ShopStyles = {
    _cache: {},
    get(style, v, lvl = 0, empty = false) {                        // lvl = nível de reforma; empty = casa sem móveis (só as casas: art/HomeStyles.js)
        const k = this.key(style, v, lvl, empty);
        return this._cache[k] || (this._cache[k] = this[style](v, lvl, empty));
    },
    key(style, v, lvl = 0, empty = false) { return style + v + (lvl ? "r" + lvl : "") + (empty ? "e" : ""); },

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
        S.menuBoard(S.P(2.4), S.P(8.6));                                              // quadro de cardápio
        let bd = S.band(S.P(W - 13), S.P(W - 10.4)); S.poster(bd.x, bd.y + 8, bd.w, 28, '#e8c860', '#c0392b', 'burger');
        bd = S.band(S.P(W - 16.8), S.P(W - 14.2)); S.window(bd.x, bd.y + 10, bd.w, 22);
        // cozinha ao fundo
        S.kitchen(S.R(1.0, 11.6, W - 6.0, 13.1));                                     // chapa e fritadeira
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
            S.shelf(S.R(1.0, 12.2, W / 2 - 3.6, 13.3), 2.4, 4, prods, '#d8dcd8'); S.shelf(S.R(W / 2 + 3.6, 12.2, W - 1.0, 13.3), 2.4, 4, prods, '#d8dcd8');
            S.crossSign(S.P(W / 2 - 3), S.P(W / 2 + 3));                                                                  // cruz verde
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
        const rack = (r, n0) => S.clothesRack(r, tees, n0);
        rack(S.R(2.2, 7.0, 8.8, 7.8), 0 + v); rack(S.R(2.2, 4.4, 8.8, 5.2), 4 + v);
        if (W >= 24) rack(S.R(W - 9.6, 4.4, W - 4.4, 5.2), 8 + v);
        // parede de tênis (prateleiras ao fundo) e parede de bolsas/malas
        S.shelf(S.R(1.0, 12.3, W / 2 - 2.6, 13.3), 2.5, 4, ['#f0f0f4', '#2fd07a', '#e03a3a', '#2a2820', '#2f7fd0', '#1c1410', '#f2d22c'], '#e8e4dc');
        S.shelf(S.R(W / 2 + 2.6, 12.3, W - 1.0, 13.3), 2.5, 3, ['#2a2c30', '#4a5034', '#b4bdc9', '#7a4a2a', '#1b2a5a', '#d46a9e'], '#e8e4dc');
        // mesa de vitrine com peças dobradas (pilhas coloridas) e acessórios
        S.foldTable(S.R(W / 2 - 2.2, 6.6, W / 2 + 2.2, 8.4), tees, v);
        // espelhos (molduras douradas) e provador com cortina
        S.wallMirror(S.P(W - 3.0) - 1.2, S.P(W - 3.0) + 1.2);
        S.curtain(S.P(1.2), S.P(4.2));
        // manequins (cabeça e tronco vestido)
        S.mannequin(S.P(W - 2.4), 9.2, tees[(v + 3) % tees.length]); S.mannequin(S.P(W - 2.4), 7.4, tees[(v + 6) % tees.length]);
        // caixa (balcão) com sacolas da loja
        S.counter(S.R(W / 2 - 3.2, 10.0, W / 2 + 3.2, 11.3), 1.0, '#f4f0ea', '#d46a9e', ['register', 'phone']);
        S.counterBags(S.R(W / 2 + 1.0, 10.1, W / 2 + 3.0, 11.2));
        void c;
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
        const W = 24, D = 15, S = this._ctx('gym', v, W, D, 0.5);
        const pal = this._pal(v, [['#3a4048', '#2c3238'], ['#40363a', '#30282c'], ['#2f3a44', '#232c34'], ['#3c3c40', '#2c2c30'], ['#34403a', '#26302a']]);
        const acc = this._pal(v, ['#ff6a1a', '#e8c22c', '#2fb4d0', '#d94a6a', '#5ac07a']);
        S.floor('tile', '#2a2c30', '#232528', { size: 20 });
        S.shell({ n: { kind: 'paint', A: pal[0], B: pal[1] }, n2: { kind: 'tile', x0: 6.5, x1: W - 1.2, A: '#9fb8c4', B: '#86a0ac' }, rail: acc, cap: '#5a5e66', side: '#3a3e46', front: '#3a3e46', mat: '#1a1c20' });
        // espelhos na parede do fundo (faixa clara com reflexos) e cartazes
        S.gymMirrors(S.P(6.8), S.P(W - 1.4));
        { const bd = S.band(S.P(1.4), S.P(5.8)); S.poster(bd.x + 2, bd.y + 8, bd.w - 4, 26, acc, '#1a1a1e', 'lines'); }
        // piso de borracha das áreas de treino e as plataformas de madeira
        S.rug(S.R(3.0, 8.4, W - 3.2, 12.4), '#1c1e22', '#121316', false);
        // equipamento parado: gaiola (dois postes altos e a barra nos ganchos) e banco de supino (estofado ao longo de z, suporte na cabeceira)
        const rack = (cx, cz) => S.gymRack(cx, cz), bench = (cx, cz) => S.gymBench(cx, cz), curlSpot = (cx, cz) => S.gymSpot(cx, cz);
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
        S.dumbbellRack(S.R(15.6, 12.9, W - 1.4, 13.6));
        S.plateTree(S.R(1.6, 11.2, 2.4, 12.0));
        // esteiras na lateral (uma com alguém caminhando)
        for (const [z0, who] of [[4.0, ['academia_f', 'walk']], [6.2, null]]) {
            S.treadmill(S.R(W - 2.6, z0, W - 1.2, z0 + 1.8));
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
        for (let tier = 0; tier < 2; tier++) S.barShelf(S.P(1.6), S.P(W - 9), tier);
        let bd = S.band(S.P(W - 7.4), S.P(W - 4.2)); S.poster(bd.x, bd.y + 12, bd.w, 24, '#c8b078', '#5a3a1a', 'lines');
        bd = S.band(S.P(W - 3.8), S.P(W - 1.6)); S.window(bd.x, bd.y + 14, bd.w, 20, '#26425a');
        // balcão do bar + banquetas
        S.counter(S.R(2.0, 8.4, W - 9.6, 9.8), 1.05, '#9a6a3a', '#6a4426', ['bottles', 'cups', 'bell', 'tray']);
        for (let k = 0; k < 5; k++) S.stool(S.P(2.8 + k * 2.4), 7.2);
        // mesa de truco (Truco.js): quatro cadeiras, baralho e os tentos de palito em cima
        S.table(S.P(4.5), 3.6, 1.8, 1.8, 'wood', '#8a6238'); S.chair(S.P(4.5), 5.2, 's'); S.chair(S.P(4.5), 2.0, 'n'); S.chair(S.P(6.4), 3.6, S.m ? 'e' : 'w'); S.chair(S.P(2.6), 3.6, S.m ? 'w' : 'e');
        S.use('truco', S.R(2.4, 1.6, 6.6, 5.6)); S.trucoCards(S.X(S.P(4.5)), S.Y(3.6) - Math.round(0.6 * S.PPU));
        // mesa de sinuca
        { const r = S.R(W - 8.8, 2.6, W - 3.0, 5.8); S.poolTable(r); S.use('pool', r); }
        // jukebox no canto
        S.jukebox(S.R(W - 2.8, 10.4, W - 1.2, 11.8));
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
        S.oven(S.R(W - 8.8, 10.0, W - 3.2, 13.0));
        // mesa de preparo (massa) e balcão
        S.counter(S.R(2.4, 10.2, 8.8, 11.8), 0.95, '#c8ccd0', '#7a7e86', ['dough', 'base', 'board']);
        S.counter(S.R(2.0, 7.0, 9.5, 8.2), 1.0, '#a89678', '#7a5230', ['register', 'tray', 'cups']);
        // mesas de toalha xadrez
        const spots = [[W - 5.0, 4.6], [W - 9.4, 4.6], [W - 13.8, 4.6], [W - 5.0, 8.0]].slice(0, v < 2 ? 3 : 4);
        for (const [tx, tz] of spots) { S.table(S.P(tx), tz, 1.8, 1.8, 'check'); S.chair(S.P(tx), tz + 1.5, 's'); S.chair(S.P(tx), tz - 1.5, 'n'); S.chair(S.P(tx - 1.5), tz, 'e'); S.chair(S.P(tx + 1.5), tz, 'w'); }
        S.logs(S.R(W - 2.6, 9.0, W - 1.2, 10.4));       // lenha
        const bd = S.band(S.P(1.4), S.P(5.4)); S.poster(bd.x, bd.y + 8, bd.w, 30, '#e8d8a8', '#c0392b', 'sun');
        this._clerk(S, 5.5, 9.2, this.S, 12); this._patron(S, W - 9.4, 6.1, this.S, 13); if (v >= 2) this._patron(S, W - 5.0, 3.1, this.N, 14);
        S.lamp(S.P(7.0), 9.6, '#ffe2a8', '#3a3d44'); S.lamp(S.P(W - 11.6), 6.4, '#ffe2a8', '#3a3d44');                 // luminárias pendentes de metal
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
        const crate = (r, cols) => S.fruitCrate(r, cols);
        crate(S.R(W - 6.6, 11.6, W - 4.2, 13.2), ['#e8702a', '#f0a030']); crate(S.R(W - 4.0, 11.6, W - 1.6, 13.2), ['#d9453a', '#c03030']); crate(S.R(W - 6.6, 9.8, W - 4.2, 11.4), ['#7ac040', '#58a030']); crate(S.R(W - 4.0, 9.8, W - 1.6, 11.4), ['#f0d840', '#e8c030']);
        S.cooler(S.R(1.0, 11.4, 3.4, 13.3), 2.1, '#3fa34d'); S.cooler(S.R(3.6, 11.4, 6.0, 13.3), 2.1, '#e8702a');
        // balcão do bar de sucos com espremedor
        S.counter(S.R(2.0, 8.0, W - 8.4, 9.4), 1.05, '#f4f0e0', '#6aa040', ['register', 'cups', 'jar', 'juicer']);
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
        S.wineRack(S.R(1.0, 12.9, 5.6, 14.3)); S.wineRack(S.R(W - 5.6, 12.9, W - 1.0, 14.3));
        let bd = S.band(S.P(W / 2 - 3.6), S.P(W / 2 + 3.6)); S.poster(bd.x, bd.y + 10, bd.w, 28, '#3a5a3a', '#f0d870', 'landscape');
        // balcão do maître (clerk)
        S.counter(S.R(W / 2 - 3.0, 10.4, W / 2 + 3.0, 11.6), 1.05, '#3a2418', '#5a3a22', ['bottles', 'bell']);
        // mesas de toalha branca (2 colunas)
        const cols = [W / 2 - 6.2, W / 2 + 6.2], rows = v < 2 ? [8.0, 4.4] : [8.6, 5.6, 2.8];
        for (const tx of cols) for (const tz of rows) {
            S.table(tx, tz, 2.0, 2.0, 'white');
            const b = S.base([tx - 1, tz - 1, tx + 1, tz + 1], 0.85); S.plate(b.x + 9, b.top + 8, true); S.plate(b.x + b.w - 9, b.top + 8, true); S.glass(b.x + 18, b.top + 12); S.glass(b.x + b.w - 20, b.top + 12);
            S.candle(b.x + (b.w / 2 | 0), b.top + 12);
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
        S.tatami(S.R(W - 9.4, 1.8, W - 1.4, 8.6));
        { const t = S.table(S.P(W - 5.4), 5.2, 2.6, 2.0, 'wood', '#5a3a22'); S.plate(t.x + 10, t.top + 9, true); S.plate(t.x + t.w - 10, t.top + 9, true); S.sake(t.x + (t.w / 2 | 0), t.top + 6);
          for (const [cx2, cz2] of [[W - 7.8, 5.2], [W - 3.0, 5.2], [W - 5.4, 7.4], [W - 5.4, 3.0]]) { S.seats.push({ kind: 'cushion', x: S.P(cx2), z: cz2, back: null }); S.cushion(S.P(cx2), cz2); } }
        // balcão de sushi (vidro) com chef atrás
        S.sushiBar(S.R(2.0, 8.2, W - 10.8, 9.8));
        for (let k = 0; k < 5; k++) { S.seats.push({ kind: 'stool', x: S.P(3.0 + k * 2.4), z: 6.7, back: null }); S.woodStool(S.R(2.6 + k * 2.4, 6.3, 3.4 + k * 2.4, 7.1)); }
        // noren vermelho e quadro na parede
        S.noren(S.P(W - 8.0), S.P(W - 4.0));
        let bd = S.band(S.P(3.0), S.P(8.0)); S.poster(bd.x, bd.y + 10, bd.w, 24, '#e8e0c0', '#1a1a1a', 'landscape');
        S.plant(S.P(1.8), 4.4); S.plant(S.P(W - 1.8), 10.8, false);
        // lanternas de papel
        for (const [lx, lz] of [[5.0, 6.4], [W - 6.0, 6.0], [10.5, 5.0]]) S.lantern(S.P(lx), lz);
        this._clerk(S, 7.2, 10.8, this.S, 32); this._patron(S, 5.0, 6.7, this.N, 33); this._patron(S, W - 3.0, 5.2, this.WW, 34); if (v >= 2) this._patron(S, 8.6, 6.7, this.N, 35);
        return S.finish(0.4);
    },

    // ======================================================================= LOJA DE ARMAS (cidade, legal)
    guns(v) {
        const W = [22, 22, 24, 20, 24][v], D = 13.5, S = this._ctx('guns', v, W, D, 0.5);
        S.floor('concrete', ['#4a5658', '#505a54', '#46505c', '#555255', '#4a5a50'][v], '#3a4446', { size: 24 });
        S.shell({ n: { kind: 'paint', A: ['#3a4a48', '#3e4a3c', '#3a4452', '#4a4640', '#34483e'][v], B: '#2a3836' }, n2: { kind: 'pegboard', x0: 1.0, x1: W - 1.0, A: '#262c2e' }, rail: '#1a2020', cap: '#5a6258', side: '#3a4240', front: '#3a4240', mat: '#2a2c28' });
        // painel de armas (pegboard): fuzis longos e pistolas
        S.gunWall(S.P(1.0), S.P(W - 1.0));
        // prateleira de caixas de munição
        S.ammoShelf(S.R(1.0, 12.6, 6.4, 13.3));
        // balcão central com caixa + vitrines de vidro
        S.counter(S.R(W / 2 - 4.4, 8.4, W / 2 + 4.4, 9.8), 1.05, '#c0c8c4', '#3a4440', ['register', 'money', 'phone']);
        const showcase = (r) => S.showcase(r);
        const se = v >= 2 ? 6.6 : 8.4; showcase(S.R(1.8, 4.6, se, 5.9)); showcase(S.R(W - se, 4.6, W - 1.8, 5.9));
        if (v >= 2 && W >= 22) showcase(S.R(W / 2 - 2.2, 3.4, W / 2 + 2.2, 4.7));
        // pilhas de caixotes de munição
        const crates = (r) => S.ammoCrates(r);
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
        { S.graffiti(S.P(2.0), S.P(W - 2.0), v); const bd = S.band(S.P(2.0), S.P(W - 2.0));
          S.poster(bd.x + bd.w - 40, bd.y + 10, 20, 28, '#a89868', '#2a2622', 'wanted'); }
        // lâmpada pelada no fio e luz fraca
        S.lamp(W / 2, 7.6, '#ffe0a0'); S.light(W / 2, 7.4, 6.5, [255, 190, 100], 0.55); S.light(3, 3.5, 4, [255, 60, 50], 0.35);
        // mesa dos fundos: armas e dinheiro
        S.gunTable(S.R(2.0, 10.0, W - 5.2, 11.5));
        // balcão com grade de ferro
        S.grilleCounter(S.R(2.8, 7.0, W - 2.8, 8.2), ['scale', 'money', 'phone']);
        // sofá rasgado, TV, colchão
        S.oldSofa(S.R(1.2, 2.2, 3.6, 5.6));
        S.oldTv(S.R(W - 4.0, 2.6, W - 1.4, 4.6));
        S.cardboard(S.X(S.P(7.0)) - 8, S.Y(3.0) - 4);                                                                   // papelão no chão
        this._clerk(S, W / 2, 8.9, this.S, 38); this._patron(S, 4.4, 5.4, this.E, 39); this._patron(S, W - 3.2, 6.0, this.WW, 40); if (v >= 2) this._patron(S, W / 2 + 3, 4.0, this.N, 41);
        return S.finish(0.5);
    },
};
