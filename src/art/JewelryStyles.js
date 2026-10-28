// ============================================================================
// JewelryStyles — o interior das JOALHERIAS (crime/Heists.js converte algumas lojas da cidade), no mesmo motor de pintura das lojas
// (art/ShopArt.js). Piso de mármore, paredes de painel escuro com friso dourado, VITRINES de vidro com joias sobre veludo (pontos de
// uso 'case': quebrar no assalto), balcão do joalheiro ao fundo, segurança de terno na porta e o escritório com cofre e gravador das
// câmeras (ShopCtx._backOffice). A variação muda a paleta (ouro, prata, rosé) e o espelhamento.
// ============================================================================

Object.assign(ShopStyles, {
    JEWEL_PAL: [
        { wall: ['#2a2430', '#221c28'], trim: '#c8a040', floor: ['#ece8e2', '#d4cec6'], velvet: '#4a1a3a' },
        { wall: ['#1e2630', '#18202a'], trim: '#b8c4d0', floor: ['#e8eaee', '#cfd4dc'], velvet: '#1a2a4a' },
        { wall: ['#30242a', '#281e22'], trim: '#e0a888', floor: ['#f0e6e0', '#dccfc6'], velvet: '#3a1a22' },
    ],

    // Vitrine: base de madeira escura, tampo de vidro, joias sobre o veludo e o brilho do vidro.
    _vitrine(S, r, P, seed) {
        const c = S.c, b = S.base(r, 0.95), rng = Pixel.rng(seed);
        S.shadow(b);
        c.box(b.x, b.fy - 1, b.w, b.hp + 1, '#3a2c24', '#5a4434', '#1e1610', '#0a0806');
        c.fr(b.x + 1, b.fy + 1, b.w - 2, 1, P.trim);
        c.box(b.x, b.top, b.w, b.h, '#bcd8e8', '#ffffff', '#7a98a8', '#2a3a44');
        c.fr(b.x + 2, b.top + 2, b.w - 4, b.h - 4, P.velvet);
        const gems = ['#fff8d0', '#e8f4ff', '#ff4a6a', '#4ab0ff', '#3ae08a', '#ffd23a'];
        for (let x = b.x + 5; x < b.x + b.w - 5; x += 7) for (let y = b.top + 5; y < b.top + b.h - 4; y += 7) {
            const k = rng();
            if (k < 0.35) { c.ring(x, y, 2, P.trim); c.px(x, y - 2, gems[Math.floor(rng() * gems.length)]); }          // anel
            else if (k < 0.6) { for (let i = -3; i <= 3; i++) c.px(x + i, y + Math.round(Math.abs(i) * 0.6), P.trim); c.disk(x, y + 3, 1, gems[Math.floor(rng() * gems.length)]); }      // colar
            else if (k < 0.8) { c.box(x - 2, y - 2, 5, 4, '#e8e4dc', '#ffffff', '#a8a49c', '#403c38'); c.px(x, y - 1, '#2a2a2a'); }      // relógio
            else c.disk(x, y, 1, gems[Math.floor(rng() * gems.length)]);
        }
        for (let i = 0; i < Math.min(b.w, b.h) - 4; i += 2) c.px(b.x + 3 + i, b.top + 2 + i, '#ffffff', 90);      // reflexo do vidro
        S.solid(r, 0.95); S.use('case', r);
        return b;
    },

    jewelry(v) {
        const P = this.JEWEL_PAL[v % 3], W = 22, D = 14, S = this._ctx('jewelry', v, W, D, 0.5), c = S.c;
        S.floor('marble', P.floor[0], P.floor[1]);
        S.shell({ n: { kind: 'panel', A: P.wall[0], B: P.wall[1] }, rail: P.trim, cap: '#5a5048', side: S.t(P.wall[0], 0.8), front: S.t(P.wall[0], 0.7), mat: P.velvet });
        // letreiro dourado e espelhos com moldura
        S.jewelSign(S.P(8), S.P(14), P.trim);
        for (const xx of [S.P(3.2), S.P(W - 3.2)]) S.wallMirror(xx - 1, xx + 1, P.trim);
        void c;
        // vitrines: fileira na parede esquerda, na direita e a ilha do meio (o variante 2 tem uma vitrine a mais)
        let n = 0;
        for (const z of [3.0, 5.6, 8.2]) { this._vitrine(S, S.R(1.0, z, 2.6, z + 1.8), P, v * 97 + n++); }
        for (const z of [3.0, 5.6]) { this._vitrine(S, S.R(W - 2.6, z, W - 1.0, z + 1.8), P, v * 97 + n++); }
        this._vitrine(S, S.R(W / 2 - 3.2, 5.4, W / 2 - 0.4, 6.8), P, v * 97 + n++);
        this._vitrine(S, S.R(W / 2 + 0.4, 5.4, W / 2 + 3.2, 6.8), P, v * 97 + n++);
        if (v === 2) this._vitrine(S, S.R(W - 2.6, 8.2, W - 1.0, 10.0), P, v * 97 + n++);
        // balcão do joalheiro (com balança e lupa) e o tapete da entrada
        S.counter(S.R(W / 2 - 4.2, 9.9, W / 2 + 4.2, 11.2), 1.05, '#ece8e2', '#2a2024', ['scale', 'register', 'phone']);
        S.rug(S.R(W / 2 - 2.6, 1.0, W / 2 + 2.6, 3.4), P.velvet, P.trim, false);
        S.plant(S.P(1.8), 11.6, false); S.plant(S.P(W - 1.8), 11.6, false);
        this._clerk(S, W / 2, 11.9, this.S, 30);
        // segurança de terno ao lado da porta e um casal de clientes
        S.patrons.push({ x: S.P(W / 2 + 2.6), z: 1.6, face: this._face(S, this.N), variant: 0, type: 'civil_executivo', guard: true });
        this._patron(S, W / 2 - 1.6, 4.4, this.N, 28 + v); if (v !== 1) this._patron(S, 3.6, 7.0, this.WW, 31);
        S.light(4, 6, 7, [255, 250, 235], 0.42); S.light(W - 4, 5, 7, [255, 250, 235], 0.42); S.light(W / 2, 6, 6, [255, 245, 220], 0.4); S.light(W / 2, 11, 6, [255, 230, 190], 0.32);
        return S.finish(0.26);
    },
});
ShopCtx.ROBBABLE.push('jewelry');
