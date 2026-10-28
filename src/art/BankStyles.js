// ============================================================================
// BankStyles — interiores dos BANCOS, no mesmo motor de pintura das lojas (art/ShopArt.js). Design modular:
//   bank_branch   UM layout de agência (as 7 agências): a variação `v` é a MARCA (0 Inaú, 1 Brascor, 2 Nacional) e só troca a
//                 paleta das paredes/balcões e a posição das câmeras — o mesmo quadro serve a todas as agências da marca (cache).
//   bank_hq       UM layout de SEDE (as 3 sedes), maior: hall de mármore, guarita, elevador, área executiva e o COFRE atrás de um
//                 corredor de laser.
// Pontos de ação (S.use): 'atm' caixa eletrônico · 'safe' cofre de caixa · 'terminal' terminal do gerente · 'vault' cofre da sede.
// ============================================================================

Object.assign(ShopStyles, {
    BANK_PAL: [
        { a: '#ec7000', b: '#0b2a5c', floor: ['#e6e8ec', '#c9ced8'], acc: '#ffffff' },     // Inaú: laranja e azul-escuro
        { a: '#cc092f', b: '#f4f4f4', floor: ['#ecebe8', '#d4d0ca'], acc: '#2a2a2a' },     // Brascor: vermelho e branco
        { a: '#f6c700', b: '#1d4c9c', floor: ['#e8e6dc', '#cfcab8'], acc: '#ffffff' },     // Nacional: amarelo e azul
    ],

    // Câmera de segurança pintada na faixa da parede do fundo.
    _cam(S, x, col) { const bd = S.band(S.P(x - 0.4), S.P(x + 0.4)); S.c.box(bd.x, bd.y + 4, bd.w, 6, '#2a2c32', '#4a4e58', '#16181c', '#0a0b0d'); S.c.disk(bd.x + (bd.w >> 1), bd.y + 12, 2, col); },

    bank_branch(v) {
        const P = this.BANK_PAL[v % 3], W = 22, D = 14, S = this._ctx('bank_branch', v, W, D, 0.5);
        S.floor('tile', P.floor[0], P.floor[1], { size: 22 });
        S.shell({ n: { kind: 'paint', A: P.a, B: S.t(P.a, 0.85) }, n2: { kind: 'paint', x0: 0.7, x1: 7.5, A: P.b, B: S.t(P.b, 0.85) }, rail: P.b, cap: '#8a8f98', side: S.t(P.b, 0.8), front: S.t(P.b, 0.7), mat: P.b });
        S.bankSign(S.P(9), S.P(15), P);                                                                            // letreiro
        for (const x of [[3, 18], [6, 15], [4, 19]][v % 3]) this._cam(S, x, '#ff3030');
        // caixas (guichês) com vidro e o cofre de caixa atrás
        S.counter(S.R(5.0, 8.6, W - 3.0, 9.9), 1.15, '#e8ecef', P.b, ['register', 'phone', 'register', 'register']);
        const safe = S.R(W - 6.2, 11.4, W - 3.6, 13.1); S.bankSafe(safe, P); S.use('safe', safe);
        // caixas eletrônicos na parede esquerda (frente)
        for (const z of [3.2, 5.6]) { const r = S.R(1.0, z, 2.6, z + 1.6); S.vending(r, 1.9, P.a); S.use('atm', r); }
        // mesa do gerente com o terminal
        const desk = S.R(W - 5.6, 3.0, W - 2.4, 4.6); S.counter(desk, 0.85, '#8a6238', '#5a3a1c', ['phone']); S.use('terminal', desk); S.chair(S.P(W - 4.0), 5.4, 's');
        S.monitor(S.X(S.P(W - 4.4)), S.Y(4.6));                                                                  // monitor
        // fila: postes com fita
        for (let i = 0; i < 4; i++) S.stool(S.P(7 + i * 2.2), 6.6);
        S.plant(S.P(W - 1.6), 7.4);
        this._clerk(S, 8.0, 11.0, this.S, 3); this._clerk(S, 12.5, 11.0, this.S, 4);
        this._patron(S, 7.0, 5.8, this.N, 5); if (v !== 1) this._patron(S, W - 4.0, 5.6, this.S, 6);
        S.light(W / 2, 9, 9, [235, 240, 255], 0.4); S.light(4, 4, 4, [255, 200, 140], 0.25);
        return S.finish(0.28);
    },

    bank_hq(v) {
        const P = this.BANK_PAL[v % 3], W = 30, D = 20, S = this._ctx('bank_hq', v, W, D, 0.5);
        S.floor('marble', P.floor[0], P.floor[1]);
        S.shell({ n: { kind: 'panel', A: S.t(P.b, 1.1), B: P.b }, n2: { kind: 'paint', x0: 11, x1: 19, A: P.a, B: S.t(P.a, 0.85) }, rail: P.a, cap: '#6a6e78', side: S.t(P.b, 0.8), front: S.t(P.b, 0.7), mat: P.b });
        S.bankSign(S.P(12), S.P(18), P, true);
        for (const x of [3, 9, 21, 27]) this._cam(S, x, '#ff3030');
        // guarita na entrada
        const guard = S.R(W / 2 + 2.6, 1.4, W / 2 + 5.0, 2.8); S.counter(guard, 1.1, '#3a4048', '#2a3036', ['phone']);
        // hall: guichês
        S.counter(S.R(4, 9.0, 13, 10.3), 1.15, '#eef0f2', P.b, ['register', 'register', 'phone']);
        // elevadores (os andares de cima)
        S.elevator(S.R(1.0, 14.5, 4.4, 19.1));
        // área executiva com o terminal
        const desk = S.R(W - 8.6, 5.0, W - 4.0, 6.8); S.counter(desk, 0.85, '#5a3a1c', '#3a2410', ['phone']); S.use('terminal', desk); S.chair(S.P(W - 6.3), 7.6, 's');
        S.table(S.P(W - 6.3), 10.6, 3.2, 1.6, 'white'); S.chair(S.P(W - 8.4), 10.6, 'e'); S.chair(S.P(W - 4.2), 10.6, 'w');
        // corredor do cofre (laser) e o COFRE
        S.lasers(S.P(W / 2 - 3), S.P(W / 2 + 3), 13.2, 18.5);
        S.vaultDoor(S.R(W / 2 - 3.2, 18.4, W / 2 + 3.2, 19.3), P); S.use('vault', S.R(W / 2 - 3.2, 17.6, W / 2 + 3.2, 19.3));
        S.plant(S.P(2), 3); S.plant(S.P(W - 2), 3); S.plant(S.P(2), 11);
        this._clerk(S, 7, 11.4, this.S, 3); this._clerk(S, 10.5, 11.4, this.S, 4);
        this._patron(S, W / 2 + 3.8, 3.4, this.S, 30); this._patron(S, W - 6.3, 7.6, this.N, 28); this._patron(S, 8, 7.8, this.N, 6);
        S.light(W / 2, 10, 12, [235, 240, 255], 0.42); S.light(W / 2, 17, 6, [255, 60, 60], 0.25);
        return S.finish(0.3);
    },
});
