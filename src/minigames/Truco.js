// ============================================================================
// Truco — TRUCO PAULISTA nas mesas dos bares, apostado. Mini-jogo em "outro mundo" (como a sinuca): enquanto a partida está aberta,
// o jogo 3D para por completo e o truco roda no próprio canvas em tela cheia.
//   • Regras (truco paulista): baralho de 40 cartas (sem 8, 9, 10 e coringas), força 4 5 6 7 Q J K A 2 3. A VIRA define a manilha (a
//     carta seguinte; vira 3 → manilha 4), que ganha de todas, pelo naipe: ♣ zap > ♥ copas > ♠ espadas > ♦ pica-fumo. Três cartas
//     por jogador, a mão é melhor de três rodadas (empate: quem fizer a primeira, ou quem desempatar depois), vale 1 ponto.
//     TRUCO pede 3; quem responde aceita, corre (o outro leva o que valia) ou aumenta (SEIS, NOVE, DOZE) — a mesma dupla não aumenta
//     duas vezes seguidas. Da segunda rodada em diante pode jogar a carta ENCOBERTA (virada para baixo: não vale nada).
//     MÃO DE ONZE: a dupla com 11 vê as cartas do parceiro e decide jogar (vale 3) ou correr (o adversário leva 1); sem truco.
//     MÃO DE FERRO (11 × 11): todo mundo joga às cegas, quem levar ganha o jogo. Jogo até 12 pontos.
//   • 1 × 1 (você contra um) ou 2 × 2 (você e um parceiro da casa contra uma dupla). Jogo no sentido anti-horário (para a direita).
//   • IA: simula a mão (Monte Carlo: sorteia as cartas que ela não vê e joga o resto até o fim) para escolher a carta, pedir truco,
//     aceitar, correr ou aumentar pela conta certa (aceitar vale a pena se 2p − 1 > −valor/proposta). Blefa, e os melhores
//     desconfiam de quem pede truco toda hora (lembram dos seus blefes revelados). Quanto maior a aposta, melhor a mesa.
//   • Desenho em HD (na resolução da tela): cartas pintadas à mão no canvas (naipes em curvas, valete/dama/rei com figura espelhada),
//     verso trabalhado, mesa de madeira com pano, garrafas, copos e os TENTOS de palito de fósforo; animações de dar as cartas, virar,
//     jogar, recolher, o grito de TRUCO! (a mesa treme) e os balões de fala.
//   • Controles: clique na carta (ou 1 2 3) · T pede truco/aumenta · A aceita · C corre · X encobre a próxima · ESC desiste.
// ============================================================================

const Truco = {
    active: false,
    RANKS: ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'],
    SUITS: ['♦', '♠', '♥', '♣'],                       // ordem de força das manilhas: pica-fumo, espadilha, copas, zap
    SUIT_NAMES: ['ouros', 'espadas', 'copas', 'paus'],
    MANILHA_NAMES: ['Pica-fumo', 'Espadilha', 'Copas', 'Zap'],
    RAISE: { 1: 3, 3: 6, 6: 9, 9: 12 },
    CALL_NAME: { 3: 'TRUCO', 6: 'SEIS', 9: 'NOVE', 12: 'DOZE' },
    GOAL: 12,
    _goal() { return (this.custom && this.custom.goal) || this.GOAL; },

    STAKES: [
        { bet: 50, name: 'Seu Zé da Quitanda', emo: '👴', duo: ['Seu Zé', '👴', 'Tonhão', '🧔'], mate: ['Juninho', '🧒'], desc: 'Joga para passar o tempo. Pede truco com qualquer coisa.' },
        { bet: 300, name: 'Tião Pé-de-Cana', emo: '🧔', duo: ['Tião', '🧔', 'Bira', '👨‍🦲'], mate: ['Careca', '👨‍🦲'], desc: 'Grita alto, mas corre fácil.' },
        { bet: 1500, name: 'Dona Cida', emo: '👵', duo: ['Dona Cida', '👵', 'Dona Lurdes', '👩‍🦳'], mate: ['Dona Neide', '👩‍🦱', 'f'], desc: 'Conta as cartas e não cai em blefe bobo.' },
        { bet: 8000, name: 'Mestre Bigode', emo: '👨‍🦳', duo: ['Bigode', '👨‍🦳', 'Baiano', '🧑‍🦱'], mate: ['Marreta', '🧔‍♂️'], desc: 'Lê a mesa e blefa na hora certa.' },
        { bet: 30000, name: 'O Professor', emo: '🎩', duo: ['O Professor', '🎩', 'Doutor', '🕵️'], mate: ['Mão-Leve', '😎'], desc: 'Calcula tudo. Dizem que nunca correu de um truco.' },
    ],
    // mc: mãos simuladas por decisão (0 = só a heurística) · noise: erro na avaliação · bluff: vontade de blefar · read: quanto
    // desconfia de quem pede truco toda hora · callK: confiança que pede para trucar
    SKILL: [
        { mc: 0, noise: 0.22, bluff: 0.16, read: 0, callK: 0.6 },
        { mc: 40, noise: 0.14, bluff: 0.1, read: 0.25, callK: 0.66 },
        { mc: 90, noise: 0.08, bluff: 0.12, read: 0.55, callK: 0.7 },
        { mc: 160, noise: 0.04, bluff: 0.14, read: 0.8, callK: 0.72 },
        { mc: 260, noise: 0.02, bluff: 0.15, read: 1, callK: 0.74 },
    ],

    // ------------------------------------------------------------------ abrir / fechar
    open(game, shop) {
        if (this.active) return;
        this.g = game; this.shop = shop; this.active = true; this.phase = 'setup'; this.duo = !!this.duo;
        this._build();
        this.root.style.display = 'block';
        this._resize();
        this._reset();
        this._renderSetup();
        this._last = performance.now();
        const loop = (t) => { if (!this.active) return; this._frame(Math.min(0.05, (t - this._last) / 1000)); this._last = t; this._raf = requestAnimationFrame(loop); };
        this._raf = requestAnimationFrame(loop);
    },

    close() {
        this.active = false;
        this._gen = (this._gen || 0) + 1;                                  // (a partida em andamento para no próximo await)
        cancelAnimationFrame(this._raf);
        if (this.root) this.root.style.display = 'none';
        const g = this.g;
        if (g) { g.input.justPressed = {}; if (g.input.keys) for (const k of Object.keys(g.input.keys)) g.input.keys[k] = false; }
    },

    _reset() {
        this.sprites = []; this.tweens = []; this.bubbles = []; this.banner = null; this.shake = 0; this.fx = [];
        this.hands = []; this.played = []; this.piles = []; this.results = []; this.score = [0, 0]; this.value = 1; this.raiser = null;
        this.vira = null; this.man = -1; this.turn = -1; this.wait = null; this.ask = null; this.hover = -1; this.cover = false; this.seatsN = this.duo ? 4 : 2;
    },

    // ------------------------------------------------------------------ DOM
    _build() {
        if (this.root) return;
        const st = document.createElement('style');
        st.textContent = `
            #truco { position: fixed; inset: 0; z-index: 90; display: none; background: #0b0705; font-family: var(--font); color: var(--tx); user-select: none; touch-action: none; }
            #truco canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
            #truco .tr-top { position: absolute; left: 0; top: 0; display: flex; justify-content: flex-start; align-items: flex-start; gap: 10px; padding: 12px 16px; pointer-events: none; }
            #truco .tr-chip { padding: 8px 16px; border-radius: 16px; background: var(--glass); border: 1px solid var(--line-2); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); text-align: center; min-width: 92px; }
            #truco .tr-chip b { display: block; font: 800 18px var(--font-d); } #truco .tr-chip small { font-size: 11px; color: var(--tx-2); }
            #truco .tr-chip.us b { color: #86efac; } #truco .tr-chip.them b { color: #fda4af; } #truco .tr-chip.val b { color: var(--gold); }
            #truco .tr-chip.pot b { color: #86efac; }
            #truco .tr-act { position: absolute; right: 16px; bottom: 16px; display: flex; flex-direction: column; gap: 8px; align-items: stretch; }
            #truco .tr-act button { min-width: 132px; }
            #truco .tr-btn-truco { font: 800 18px var(--font-d) !important; letter-spacing: 0.04em; color: #1a0d00 !important; background: linear-gradient(180deg, #fde047, #f59e0b) !important; border-color: #b45309 !important;
                box-shadow: 0 4px 18px rgba(245,158,11,0.35); }
            #truco .tr-btn-truco[disabled], #truco .tr-act button[disabled] { opacity: 0.35; cursor: not-allowed; filter: grayscale(0.6); box-shadow: none; }
            #truco .tr-btn-cover.on { border-color: var(--gold) !important; box-shadow: 0 0 0 1px var(--gold); color: var(--gold) !important; }
            #truco .tr-bot { position: absolute; left: 16px; bottom: 16px; display: flex; gap: 8px; align-items: center; }
            #truco .tr-help { font-size: 12px; color: var(--tx-3); max-width: 46vw; }
            #truco .tr-ask { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: none; padding: 18px 22px 16px; border-radius: 22px; background: var(--glass-2);
                border: 1px solid var(--gold); box-shadow: 0 0 0 1px rgba(251,191,36,0.4), 0 18px 60px rgba(0,0,0,0.6); text-align: center; animation: modalIn .18s ease-out; min-width: 300px; }
            #truco .tr-ask h3 { font: 800 30px var(--font-d); color: var(--gold); letter-spacing: 0.04em; margin-bottom: 2px; }
            #truco .tr-ask p { font-size: 13px; color: var(--tx-2); margin-bottom: 12px; line-height: 1.45; }
            #truco .tr-ask .row { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
            #truco .tr-modal { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(5,4,3,0.55); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); padding: 16px; }
            #truco .tr-box { width: min(640px, 96vw); max-height: 94vh; overflow: auto; padding: 22px 24px; border-radius: 22px; background: var(--glass-2); border: 1px solid var(--line-2); box-shadow: var(--shadow); animation: modalIn .2s ease-out; }
            #truco .tr-box h2 { font: 800 26px var(--font-d); text-align: center; margin-bottom: 4px; }
            #truco .tr-box p.sub { text-align: center; font-size: 13px; color: var(--tx-2); margin-bottom: 12px; line-height: 1.5; }
            #truco .tr-mode { display: flex; gap: 8px; justify-content: center; margin-bottom: 6px; }
            #truco .tr-mode button { flex: 1; max-width: 220px; padding: 10px 12px; border-radius: 14px; cursor: pointer; background: var(--card); border: 1px solid var(--line-2); color: var(--tx); font: 700 14px var(--font-d); }
            #truco .tr-mode button small { display: block; font: 500 11px var(--font); color: var(--tx-3); margin-top: 2px; }
            #truco .tr-mode button.on { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold); background: var(--card-h); }
            #truco .tr-opp { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 11px 14px; margin-top: 8px; border-radius: 14px; cursor: pointer;
                background: var(--card); border: 1px solid var(--line-2); color: var(--tx); font: inherit; transition: background .15s, border-color .15s; }
            #truco .tr-opp:hover:not([disabled]), #truco .tr-opp:focus-visible { background: var(--card-h); border-color: var(--gold); }
            #truco .tr-opp[disabled] { opacity: 0.4; cursor: not-allowed; }
            #truco .tr-opp .av { font-family: var(--emoji); font-size: 28px; white-space: nowrap; }
            #truco .tr-opp .t { flex: 1; min-width: 0; } #truco .tr-opp .t b { font: 700 15px var(--font-d); } #truco .tr-opp .t small { display: block; font-size: 12px; color: var(--tx-2); margin-top: 2px; }
            #truco .tr-opp .lv { color: var(--gold); letter-spacing: 1px; font-size: 12px; }
            #truco .tr-opp .bet { text-align: right; font: 800 16px var(--font-d); color: #86efac; white-space: nowrap; } #truco .tr-opp .bet small { display: block; font: 500 11px var(--font); color: var(--tx-3); }
            #truco .tr-rules { margin-top: 14px; font-size: 12px; line-height: 1.6; color: var(--tx-3); }
            #truco .tr-end { text-align: center; } #truco .tr-end .big { font: 800 44px var(--font-d); margin: 4px 0 2px; }
            #truco .tr-end .row { display: flex; gap: 10px; justify-content: center; margin-top: 18px; flex-wrap: wrap; }
            @media (max-height: 560px) { #truco .tr-top { padding: 6px 10px; } #truco .tr-chip { padding: 5px 10px; min-width: 70px; } #truco .tr-chip b { font-size: 15px; }
                #truco .tr-act button { min-width: 104px; padding: 7px 10px; } #truco .tr-help { display: none; } }`;
        document.head.appendChild(st);
        const r = this.root = document.createElement('div');
        r.id = 'truco';
        r.innerHTML = `<canvas></canvas>
            <div class="tr-top"><div class="tr-chip us" id="trUs"></div><div class="tr-chip val" id="trVal"></div><div class="tr-chip pot" id="trPot"></div><div class="tr-chip them" id="trThem"></div></div>
            <div class="tr-act"><button class="ui-btn tr-btn-cover" id="trCover">Encobrir <small>(X)</small></button><button class="ui-btn tr-btn-truco" id="trTruco">TRUCO!</button><button class="ui-btn pri" id="trSkip" style="display:none">⏩ Pular para o resultado</button></div>
            <div class="tr-bot"><button class="ui-btn" id="trQuit">Desistir</button><span class="tr-help" id="trHelp">Clique numa carta (ou 1 2 3) para jogar · T pede truco · X encobre</span></div>
            <div class="tr-ask" id="trAsk"></div>
            <div class="tr-modal" id="trModal"></div>`;
        document.body.appendChild(r);
        this.cv = r.querySelector('canvas'); this.ctx = this.cv.getContext('2d');
        this.$ = (id) => document.getElementById(id);
        this._emoji = (getComputedStyle(document.documentElement).getPropertyValue('--emoji') || '').trim() || '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        window.addEventListener('resize', () => { if (this.active) this._resize(); });
        this.cv.addEventListener('pointermove', (e) => this._pMove(e));
        this.cv.addEventListener('pointerdown', (e) => this._pDown(e));
        this.cv.addEventListener('contextmenu', (e) => { e.preventDefault(); });
        this.$('trTruco').addEventListener('click', () => this._humanTruco());
        this.$('trCover').addEventListener('click', () => this._toggleCover());
        this.$('trQuit').addEventListener('click', () => this._quit());
        this.$('trSkip').addEventListener('click', () => { if (this.watching) { this.fast = true; this._msg('Acelerando a partida…'); } });
        window.addEventListener('keydown', (e) => this._key(e), true);
    },

    _resize() {
        const dpr = Math.min(2.5, window.devicePixelRatio || 1), w = window.innerWidth, h = window.innerHeight;
        this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); this.dpr = dpr; this.vw = w; this.vh = h;
        const small = h < 560;
        this.cw = Math.round(Math.max(58, Math.min(132, Math.min(h * 0.145, w * 0.11)))); this.ch = Math.round(this.cw * 1.5);
        this.tw = Math.min(w - 24, h * 1.62); this.th = Math.min(h - (small ? 70 : 110), this.tw * 0.6);
        this.cx = w / 2; this.cy = (small ? 40 : 62) + (h - (small ? 40 : 62)) / 2 - this.ch * 0.18;
        this._bg = null; this._cards = new Map();
        for (const s of this.sprites || []) this._place(s, true);
    },

    // ------------------------------------------------------------------ mesas e jogadores
    _seatOf(i) {                                                          // posição do lugar i ao redor da mesa: 'S' 'E' 'N' 'W'
        return this.duo ? ['S', 'E', 'N', 'W'][i] : ['S', 'N'][i];
    },
    _team(i) { return i % 2; },
    _seatXY(i) {                                                          // onde fica o avatar
        const S = this._seatOf(i), cx = this.cx, cy = this.cy, tw = this.tw, th = this.th;
        return S === 'S' ? { x: cx, y: cy + th / 2 + 6 } : S === 'N' ? { x: cx, y: cy - th / 2 + 4 } : S === 'E' ? { x: cx + tw / 2 - 40, y: cy - 6 } : { x: cx - tw / 2 + 40, y: cy - 6 };
    },
    _playXY(i) {                                                          // onde cai a carta jogada
        const S = this._seatOf(i), cx = this.cx, cy = this.cy, cw = this.cw, ch = this.ch;
        return S === 'S' ? { x: cx, y: cy + ch * 0.46 } : S === 'N' ? { x: cx, y: cy - ch * 0.52 } : S === 'E' ? { x: cx + cw * 1.12, y: cy } : { x: cx - cw * 1.12, y: cy };
    },
    _deckXY() { return { x: this.cx - this.tw * 0.255, y: this.cy - this.th * 0.12 }; },
    _pileXY(i, k) {                                                       // as rodadas já jogadas: um montinho por jogador, uma carta por rodada
        const S = this._seatOf(i), P = this._playXY(i), cw = this.cw, ch = this.ch, d = k * cw * 0.24;
        return S === 'S' ? { x: P.x + cw * 1.55 + d, y: P.y + ch * 0.18 } : S === 'N' ? { x: P.x - cw * 1.55 - d, y: P.y - ch * 0.18 }
            : S === 'E' ? { x: P.x + cw * 0.25, y: P.y + ch * 0.95 + d * 0.6 } : { x: P.x - cw * 0.25, y: P.y - ch * 0.95 - d * 0.6 };
    },
    _handXY(i, k, n) {                                                    // a mão de cada um (a sua, grande e em leque, embaixo)
        const S = this._seatOf(i), o = k - (n - 1) / 2, cw = this.cw, ch = this.ch;
        if (S === 'S') return { x: this.cx + o * cw * 0.98, y: this.vh - ch * 0.5 - 8 + Math.abs(o) * 7, r: o * 0.07, s: 1 };
        const A = this._seatXY(i), sc = 0.56;
        if (S === 'N') return { x: A.x + o * cw * sc * 0.5 + cw * 1.15, y: A.y + 4, r: Math.PI + o * 0.12, s: sc };
        if (S === 'E') return { x: A.x - 4, y: A.y + o * cw * sc * 0.5 + ch * 0.62, r: -Math.PI / 2 + o * 0.12, s: sc };
        return { x: A.x + 4, y: A.y + o * cw * sc * 0.5 + ch * 0.62, r: Math.PI / 2 + o * 0.12, s: sc };
    },
    _people() {
        if (this.watching) return this.watching.people;
        const L = this.lvl != null ? this.STAKES[this.lvl] : this.STAKES[0];
        if (this.custom) return [{ name: 'Você', emo: '🙂' }, { name: this.custom.name, emo: this.custom.emo }];
        if (!this.duo) return [{ name: 'Você', emo: '🙂' }, { name: L.name, emo: L.emo }];
        return [{ name: 'Você', emo: '🙂' }, { name: L.duo[0], emo: L.duo[1] }, { name: L.mate[0], emo: L.mate[1], f: L.mate[2] === 'f' }, { name: L.duo[2], emo: L.duo[3] }];
    },

    // ------------------------------------------------------------------ cartas
    _deck() {
        const d = [];
        for (let r = 0; r < 10; r++) for (let s = 0; s < 4; s++) d.push({ r, s, id: r * 4 + s });
        for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
        return d;
    },
    _pow(c, man = this.man) { return c.r === man ? 10 + c.s : c.r; },       // 0–9 pela força, manilhas 10–13
    _isMan(c) { return c.r === this.man; },
    _name(c) {
        if (this._isMan(c)) return this.MANILHA_NAMES[c.s];
        const n = { Q: 'dama', J: 'valete', K: 'rei', A: 'ás' }[this.RANKS[c.r]] || this.RANKS[c.r];
        return `${n} de ${this.SUIT_NAMES[c.s]}`;
    },

    // ------------------------------------------------------------------ partida
    _renderSetup() {
        const cash = this.g.inventory.cash;
        this.phase = 'setup';
        this.$('trAsk').style.display = 'none';
        this.$('trModal').style.display = 'flex';
        const duo = this.duo;
        this.$('trModal').innerHTML = `<div class="tr-box"><h2>🃏 Truco paulista</h2>
            <p class="sub">${this.shop ? this.shop.name + ' · ' : ''}Escolha a mesa. Quanto maior a aposta, mais esperto o adversário.<br>Você tem <b style="color:#86efac">${brl(cash)}</b> (dinheiro vivo).</p>
            <div class="tr-mode"><button id="trSolo" class="${duo ? '' : 'on'}">🙂 Sozinho · 1 × 1<small>você contra um</small></button><button id="trDuo" class="${duo ? 'on' : ''}">🤝 Em dupla · 2 × 2<small>você e um parceiro da casa</small></button></div>
            ${this.STAKES.map((o, i) => `<button class="tr-opp" data-i="${i}" ${cash < o.bet ? 'disabled' : ''}><span class="av">${duo ? o.duo[1] + o.duo[3] : o.emo}</span>
                <span class="t"><b>${duo ? o.duo[0] + ' e ' + o.duo[2] : o.name}</b> <span class="lv">${'★'.repeat(i + 1)}${'☆'.repeat(4 - i)}</span><small>${o.desc}${duo ? ` ${o.mate[2] === 'f' ? 'Sua parceira' : 'Seu parceiro'}: <b>${o.mate[1]} ${o.mate[0]}</b>.` : ''}${this._recordTxt(i, duo)}</small></span>
                <span class="bet">${brl(o.bet)}<small>prêmio ${brl(o.bet * 2)}</small></span></button>`).join('')}
            <div class="tr-rules"><b>Como joga:</b> 40 cartas, força <b>4 5 6 7 Q J K A 2 3</b>. A <b>vira</b> define a manilha (a carta seguinte), que ganha de todas: ♣ <b>zap</b> &gt; ♥ copas &gt; ♠ espadilha &gt; ♦ pica-fumo.
            Três cartas, melhor de três rodadas; a mão vale 1. <b>Truco</b> pede 3 — o outro lado aceita, <b>corre</b> (você leva o que valia) ou aumenta para 6, 9, 12.
            Empate na rodada: vale quem fez a primeira (ou desempata a seguinte). Da 2ª rodada em diante dá para jogar a carta <b>encoberta</b>.
            <b>Mão de onze:</b> quem tem 11 vê as cartas do parceiro e decide se joga (vale 3). <b>Mão de ferro</b> (11 × 11): todos jogam às cegas. Ganha quem fizer 12.<br>
            <b>Controles:</b> clique na carta ou 1 2 3 · <b>T</b> truco / aumentar · <b>A</b> aceitar · <b>C</b> correr · <b>X</b> encobrir · ESC desistir.</div>
            <div style="display:flex;justify-content:center;margin-top:14px"><button class="ui-btn" id="trLeave">Voltar ao bar</button></div></div>`;
        this.$('trLeave').onclick = () => this.close();
        this.$('trSolo').onclick = () => { this.duo = false; this._reset(); this._renderSetup(); };
        this.$('trDuo').onclick = () => { this.duo = true; this._reset(); this._renderSetup(); };
        for (const b of this.$('trModal').querySelectorAll('.tr-opp')) b.onclick = () => this._startMatch(+b.dataset.i);
        this._hud();
    },

    // Histórico contra esta mesa (WorldMemory): "você 3 × 1 ele" e a provocação.
    // Partida de torneio (BarGames.Tourney): 1 × 1, sem aposta, até `goal` pontos, contra um adversário com nome.
    tournament(game, shop, { lvl, name, emo, goal = 6, onEnd }) {
        if (this.active) return;
        this.duo = false;
        this.open(game, shop);
        this.custom = { name, emo, goal, onEnd };
        this.lvl = lvl; this.opp = this.STAKES[lvl]; this.sk = this.SKILL[lvl]; this.bet = 0;
        this._reset();
        this.$('trModal').style.display = 'none';
        this.phase = 'play';
        this.bluffSeen = this.bluffSeen || { calls: 0, weak: 0 };
        const gen = this._gen = (this._gen || 0) + 1;
        this._match(gen).catch((e) => { if (e !== this.CANCEL) console.error('[TRUCO]', e); });
        this._hud();
    },
    _recordTxt(lvl, duo) {
        if (typeof WorldMemory === 'undefined') return '';
        const k = this._oppKey(lvl, duo), r = WorldMemory.record('truco', k);
        if (!r.w && !r.l) return '';
        const t = WorldMemory.taunt('truco', k);
        return `<br><b style="color:${r.w >= r.l ? '#86efac' : '#fda4af'}">Você ${r.w} × ${r.l}</b>${t ? ` · <i>“${t}”</i>` : ''}`;
    },
    _startMatch(lvl, bet = null) {
        const o = this.STAKES[lvl], inv = this.g.inventory;
        bet = bet || o.bet;
        if (inv.cash < bet) return;
        inv.cash -= bet;
        this.lvl = lvl; this.opp = o; this.sk = this.SKILL[lvl]; this.bet = bet;
        this._reset();
        this.$('trModal').style.display = 'none';
        this.phase = 'play';
        this.bluffSeen = this.bluffSeen || { calls: 0, weak: 0 };          // o que a mesa lembra dos seus truques (blefes revelados)
        AudioFX.blip(520, 0.08, 0.15);
        const gen = this._gen = (this._gen || 0) + 1;
        this._match(gen).catch((e) => { if (e !== this.CANCEL) console.error('[TRUCO]', e); });
        this._hud();
        const tt = typeof WorldMemory !== 'undefined' ? WorldMemory.taunt('truco', this._oppKey()) : '';
        if (tt) setTimeout(() => { if (this.active && this._gen === gen) this._say(1, tt, 2200); }, 600);
    },
    _oppKey(lvl = this.lvl, duo = this.duo) { const o = this.STAKES[lvl]; return duo ? o.duo[0] + ' e ' + o.duo[2] : o.name; },
    CANCEL: { cancel: true },

    // Assistir uma partida do bar (BarGames): todo mundo é a IA, cada lado com o nível dele. opts: { people (por lugar), duo, lvl: [lado A,
    // lado B], onEnd(lado vencedor), bet }. O resultado é o da partida de verdade.
    watch(game, shop, opts) {
        if (this.active) return;
        this.duo = !!opts.duo; this.watching = opts;
        this.open(game, shop);
        this.lvl = Math.max(opts.lvl[0], opts.lvl[1]); this.opp = this.STAKES[this.lvl];
        this.skT = [this.SKILL[opts.lvl[0]], this.SKILL[opts.lvl[1]]]; this.sk = this.skT[1]; this.bet = 0;
        this._reset(); this.fast = false;
        this.$('trModal').style.display = 'none';
        this.phase = 'play';
        const gen = this._gen = (this._gen || 0) + 1;
        this._match(gen).catch((e) => { if (e !== this.CANCEL) console.error('[TRUCO]', e); });
        this._hud();
    },
    _endWatch(winner) {
        const W = this.watching; this.watching = null; this.skT = null; this.fast = false;
        const b = W.bet, names = (t) => this._teamSeats(t).map((i) => W.people[i].name).join(' e ');
        if (W.onEnd) W.onEnd(winner);
        const won = b && b.side === winner;
        this.$('trModal').style.display = 'flex';
        this.$('trModal').innerHTML = `<div class="tr-box tr-end"><div style="font-family:var(--emoji);font-size:42px">${this._teamSeats(winner).map((i) => W.people[i].emo).join('')}</div>
            <div class="big" style="color:#fde047">${names(winner)} ${this._teamSeats(winner).length > 1 ? 'venceram' : 'venceu'}</div>
            <p class="sub">Placar final: <b>${this.score[winner]} × ${this.score[1 - winner]}</b>.${b ? (won ? ` Sua aposta pagou <b style="color:#86efac">+${brl(Math.round(b.bet * b.odds))}</b>.` : ` Você perdeu a aposta de ${brl(b.bet)}.`) : ''}</p>
            <div class="row"><button class="ui-btn pri" id="trBack">Voltar ao bar</button></div></div>`;
        this.$('trBack').onclick = () => this.close();
        this.phase = 'end';
        this._hud();
    },

    async _match(gen) {
        this.score = [0, 0];
        this.dealer = Math.floor(Math.random() * this.seatsN);
        await this._sleep(gen, 300);
        while (this.score[0] < this._goal() && this.score[1] < this._goal()) {
            await this._hand(gen);
            this._hud();
        }
        if (this.watching) this._endWatch(this.score[0] >= this._goal() ? 0 : 1);
        else this._end(this.score[0] >= this._goal() ? 0 : 1);
    },

    _sleep(gen, ms) {
        if (this.fast) ms = 0;
        return new Promise((ok, no) => { const t0 = performance.now(); this.fx.push({ wake: t0 + ms, ok: () => (gen === this._gen ? ok() : no(this.CANCEL)) }); });
    },
    _check(gen) { if (gen !== this._gen) throw this.CANCEL; },

    // ------------------------------------------------------------------ uma mão
    async _hand(gen) {
        const n = this.seatsN;
        this.dealer = (this.dealer + 1) % n;
        await this._clearTable(gen);
        const deck = this._deck();
        this.value = 1; this.raiser = null; this.results = []; this.hands = []; this.played = []; this.piles = [];
        for (let i = 0; i < n; i++) { this.hands.push([]); this.piles.push([]); }
        const s0 = this.score[0], s1 = this.score[1];
        this.ferro = s0 === this._goal() - 1 && s1 === this._goal() - 1;
        this.onze = this.ferro ? null : s0 === this._goal() - 1 ? 0 : s1 === this._goal() - 1 ? 1 : null;
        this.revealMate = false; this.calls = [];
        // o baralho chega no canto, embaralha e dá as cartas (uma de cada vez, a partir do jogador à direita de quem dá)
        const D = this._deckXY(), deckSp = this.deckSp = this._sprite(null, D.x, D.y, -0.08, 0.86);
        deckSp.stack = 34; deckSp.z = 1;
        await this._shuffleAnim(gen, deckSp);
        this._say(this.dealer, ['Embaralhei!', 'Corta aí.', 'Vamos lá.', 'Dando as cartas…'][Math.floor(Math.random() * 4)], 900);
        for (let k = 0; k < 3; k++) for (let j = 0; j < n; j++) {
            const i = (this.dealer + 1 + j) % n, c = deck.pop(), sp = this._sprite(c, D.x, D.y, -0.08, 0.86);
            sp.owner = i; sp.z = 40 + k;
            this.hands[i].push(sp); deckSp.stack--;
            this.hands[i].forEach((q) => this._place(q));
            AudioFX._burst && AudioFX._burst(AudioFX.listener.x, AudioFX.listener.z, { vol: 0.12, dur: 0.06, f0: 5200, f1: 2600, type: 'highpass', q: 0.7, maxDist: 1e9 });
            await this._sleep(gen, 70);
        }
        await this._sleep(gen, 420);
        // a vira: debaixo do monte, atravessada, virada para cima
        const v = deck.pop(); this.vira = v; this.man = (v.r + 1) % 10;
        const vs = this.viraSp = this._sprite(v, D.x, D.y, -0.08, 0.86); vs.z = 0;
        this._tween(vs, { x: D.x + this.cw * 0.42, y: D.y + this.ch * 0.05, r: Math.PI / 2 - 0.1 }, 0.35, 'out');
        this._flip(vs, true, 0.3, 0.12);
        await this._sleep(gen, 520);
        // suas cartas viram (na mão de ferro, ninguém vê as próprias)
        if (!this.ferro) { this.hands[0].forEach((sp, k) => this._flip(sp, true, 0.26, k * 0.08)); await this._sleep(gen, 450); }
        this._msg(this.ferro ? 'MÃO DE FERRO! Todo mundo joga às cegas — quem levar, ganha o jogo.' : `Vira: ${this._viraTxt()} · manilha: ${this.RANKS[this.man]}`);
        this._hud();
        let leader = (this.dealer + 1) % n;
        this.round = 0; this.turn = leader; this.played = [];
        // mão de onze: a dupla com 11 decide se joga (vale 3) ou corre (o outro leva 1)
        if (this.onze != null) {
            const go = await this._onzeDecide(gen, this.onze);
            if (!go) { await this._award(gen, 1 - this.onze, 1, `${this._teamName(this.onze)} correu da mão de onze`); return; }
            this.value = 3; this._hud();
        }
        for (let r = 0; r < 3; r++) {
            this.round = r; this.played = [];
            for (let k = 0; k < n; k++) {
                const i = (leader + k) % n;
                const res = await this._turn(gen, i);
                if (res === 'ended') return;
            }
            await this._sleep(gen, 380);
            const rw = this._roundWinner(this.played);
            this.results.push(rw.team);
            await this._roundEnd(gen, rw);
            const d = this._decide(this.results);
            if (d != null) {
                if (d === 'none') { await this._award(gen, null, 0, 'tudo empatado — ninguém pontua'); return; }
                await this._award(gen, d, this.value, this.value > 1 ? `valendo ${this.value}` : '');
                return;
            }
            if (rw.seat != null) leader = rw.seat;
        }
    },

    _viraTxt() { const v = this.vira; return v ? this.RANKS[v.r] + ' ' + this.SUITS[v.s] : ''; },
    _teamName(t) {
        if (this.watching) return this._teamSeats(t).map((i) => this._people()[i].name).join(' e ');
        return t === 0 ? (this.duo ? 'Sua dupla' : 'Você') : (this.duo ? 'A dupla de lá' : this._people()[1].name);
    },
    _sideShort(t) { return this.watching ? this._people()[this._teamSeats(t)[0]].name.split(' ')[0] : t === 0 ? (this.duo ? 'nós' : 'você') : this._themLabel().toLowerCase(); },

    // Melhor carta da rodada: maior força; se a maior empata entre as duplas, a rodada empata ("cangou"). Encoberta não vale nada.
    _roundWinner(plays) {
        let best = -1, seat = null, team = null, tie = false;
        for (const p of plays) {
            const v = p.covered ? -1 : this._pow(p.sp.c);
            if (v > best) { best = v; seat = p.seat; team = this._team(p.seat); tie = false; }
            else if (v === best && v >= 0 && this._team(p.seat) !== team) tie = true;
        }
        if (best < 0) return { team: 't', seat: plays[0].seat, best };          // (todas encobertas: empate)
        return tie ? { team: 't', seat, best } : { team, seat, best };
    },
    // Quem leva a mão pelas rodadas (0/1/'t'): null = ainda não decidiu; 'none' = três empates.
    _decide(res) {
        if (res.length < 2) return null;
        const [a, b, c] = res;
        if (res.length === 2) {
            if (a !== 't' && a === b) return a;
            if (a === 't' && b !== 't') return b;
            if (a !== 't' && b === 't') return a;
            return null;
        }
        if (a === 't' && b === 't') return c === 't' ? 'none' : c;
        return c === 't' ? (a === 't' ? b : a) : c;
    },

    // ------------------------------------------------------------------ a vez de cada um
    async _turn(gen, i) {
        this.turn = i; this._hud();
        for (;;) {
            this._check(gen);
            if (i === 0 && !this.watching) {
                const act = await this._waitHuman(gen);
                if (act.type === 'truco') { const r = await this._truco(gen, 0); if (r === 'ended') return 'ended'; continue; }
                await this._playCard(gen, 0, act.k, act.covered);
                return 'ok';
            }
            await this._sleep(gen, 380 + Math.random() * 520);
            if (this._canCall(this._team(i)) && this._aiWantsTruco(i)) {
                const r = await this._truco(gen, i); if (r === 'ended') return 'ended';
                await this._sleep(gen, 300);
            }
            const ch = this._aiChoose(i);
            await this._playCard(gen, i, ch.k, ch.covered);
            return 'ok';
        }
    },

    _canCall(team) { return this.onze == null && !this.ferro && this.value < 12 && this.raiser !== team && this.phase === 'play'; },

    async _playCard(gen, i, k, covered) {
        const sp = this.hands[i].splice(k, 1)[0];
        covered = !!covered && this.round > 0 && !this.ferro;
        const P = this._playXY(i);
        sp.z = 100 + this.played.length;
        this.played.push({ seat: i, sp, covered });
        sp.covered = covered;
        const rot = (Math.random() - 0.5) * 0.22 + (this._seatOf(i) === 'E' || this._seatOf(i) === 'W' ? Math.PI / 2 : 0);
        this._tween(sp, { x: P.x, y: P.y, r: rot, s: 1, lift: 0 }, 0.32, 'out');
        if (covered) this._flip(sp, false, 0.2, 0); else this._flip(sp, true, 0.24, 0.04);
        this.hands[i].forEach((s) => this._place(s));
        this.cover = false;
        AudioFX._burst && AudioFX._burst(AudioFX.listener.x, AudioFX.listener.z, { vol: 0.16, dur: 0.08, f0: 4200, f1: 1400, type: 'bandpass', q: 0.9, maxDist: 1e9 });
        if (covered) this._say(i, 'Encobri.', 900);
        else if (this._isMan(sp.c) && sp.c.s === 3 && Math.random() < 0.7) this._say(i, i === 0 ? 'ZAP!' : ['Toma o zap!', 'ZAP na mesa!', 'Zapeei!'][Math.floor(Math.random() * 3)], 1100);
        this._hud();
        await this._sleep(gen, 360);
    },

    async _roundEnd(gen, rw) {
        // a carta que ganhou brilha; a rodada vai para os montinhos de cada um
        const win = this.played.find((p) => p.seat === rw.seat);
        if (rw.team === 't') { this._msg('Empatou a rodada! (cangou)'); for (const p of this.played) if (!p.covered && this._pow(p.sp.c) === rw.best) p.sp.glow = 1; }
        else { if (win) win.sp.glow = 1; this._msg(`${this.watching ? this._people()[rw.seat].name + ' fez' : rw.team === 0 ? (rw.seat === 0 ? 'Você fez' : 'Sua dupla fez') : (this._people()[rw.seat].name + ' fez')} a ${['primeira', 'segunda', 'terceira'][this.round]}${win && !win.covered ? ' com ' + this._name(win.sp.c) : ''}`); }
        AudioFX.blip(rw.team === 0 ? 760 : rw.team === 't' ? 500 : 300, 0.1, 0.12);
        await this._sleep(gen, 950);
        for (const p of this.played) {
            const Q = this._pileXY(p.seat, this.piles[p.seat].length);
            p.sp.glow = 0; p.sp.z = 10 + this.round;
            this.piles[p.seat].push(p.sp);
            this._tween(p.sp, { x: Q.x, y: Q.y, s: 0.5, r: p.sp.r * 0.3 + (Math.random() - 0.5) * 0.15 }, 0.36, 'inout');
        }
        this.played = [];
        await this._sleep(gen, 420);
    },

    async _award(gen, team, pts, why) {
        this.phase = 'award';
        // o que ainda estava na mão aparece para todo mundo (só no fim da mão; quem correu não mostra)
        if (team != null && pts > 0) {
            this.score[team] = Math.min(this._goal(), this.score[team] + pts);
            this._banner(`+${pts} ${this._sideShort(team).toUpperCase()}`, team === 0 ? '#86efac' : '#fda4af', 1.4);
            this._msg(`${this._teamName(team)} leva ${pts} ${pts === 1 ? 'ponto' : 'pontos'}${why ? ' — ' + why : ''}`);
            AudioFX.blip(team === 0 ? 880 : 220, 0.16, 0.16);
            if (team === 0) setTimeout(() => AudioFX.blip(1180, 0.14, 0.14), 120);
        } else this._msg(why || 'Ninguém pontua.');
        this._learnBluffs();
        this._hud();
        await this._sleep(gen, 1500);
        this.phase = 'play';
    },

    async _clearTable(gen) {
        const D = this._deckXY(), all = this.sprites.filter((s) => !s.dead);
        if (!all.length) return;
        for (const s of all) { this._tween(s, { x: D.x, y: D.y, r: -0.08, s: 0.86, a: 0 }, 0.34, 'in', Math.random() * 0.1); this._flip(s, false, 0.16, 0); }
        await this._sleep(gen, 480);
        this.sprites = [];
    },

    async _shuffleAnim(gen, deckSp) {
        // embaralha: duas metades saem para os lados e voltam intercaladas (o "riffle"), três vezes
        const D = this._deckXY(), L = this._sprite(null, D.x, D.y, -0.08, 0.86), R = this._sprite(null, D.x, D.y, -0.08, 0.86);
        L.stack = R.stack = 16; L.z = R.z = 2; deckSp.a = 0;
        for (let k = 0; k < 3; k++) {
            this._tween(L, { x: D.x - this.cw * 0.42, r: -0.3 }, 0.14, 'out'); this._tween(R, { x: D.x + this.cw * 0.42, r: 0.15 }, 0.14, 'out');
            await this._sleep(gen, 150);
            AudioFX._burst && AudioFX._burst(AudioFX.listener.x, AudioFX.listener.z, { vol: 0.14, dur: 0.22, f0: 6000, f1: 2000, type: 'highpass', q: 0.5, maxDist: 1e9 });
            this._tween(L, { x: D.x, r: -0.08 }, 0.18, 'inout'); this._tween(R, { x: D.x, r: -0.08 }, 0.18, 'inout');
            await this._sleep(gen, 200);
        }
        L.dead = R.dead = true; deckSp.a = 1;
    },

    // ------------------------------------------------------------------ truco
    async _truco(gen, caller) {
        let team = this._team(caller), prop = this.RAISE[this.value], who = caller;
        this.calls.push({ team, seat: caller, prop, round: this.round });
        while (true) {
            this._check(gen);
            this._shout(who, prop);
            await this._sleep(gen, 900);
            const other = 1 - team;
            const resp = other === 0 && !this.watching ? await this._askHuman(gen, prop, who) : await this._aiRespond(gen, other, prop, who);
            if (resp.type === 'run') {
                this._say(resp.seat, ['Corro!', 'Tô fora.', 'Pode levar…', 'Corri, corri.'][Math.floor(Math.random() * 4)], 1200);
                await this._sleep(gen, 700);
                await this._award(gen, team, this.value, `${this._teamName(other)} correu`);
                return 'ended';
            }
            if (resp.type === 'accept') {
                this._say(resp.seat, ['Desce!', 'Aceito!', 'Bora!', 'Manda ver!'][Math.floor(Math.random() * 4)], 1100);
                this.value = prop; this.raiser = team; this._hud();
                AudioFX.blip(640, 0.08, 0.12);
                await this._sleep(gen, 650);
                return 'ok';
            }
            // aumentou: aceita o que foi pedido e pede mais — agora quem pediu antes é que responde
            this.value = prop; this.raiser = other; team = other; who = resp.seat; prop = this.RAISE[this.value];
            this.calls.push({ team, seat: who, prop, round: this.round });
            this._hud();
        }
    },

    _askHuman(gen, prop, who) {
        const box = this.$('trAsk'), canRaise = this.RAISE[prop] && prop < 12;
        const mate = this.duo ? this._mateHint(prop) : '';
        box.innerHTML = `<h3>${this.CALL_NAME[prop]}!</h3><p>${this._people()[who].name} pediu <b>${this.CALL_NAME[prop].toLowerCase()}</b> — valendo <b>${prop}</b>.<br>Correr dá ${this.value} ${this.value === 1 ? 'ponto' : 'pontos'} para eles.${mate}</p>
            <div class="row"><button class="ui-btn pri" id="trAcc">Aceitar <small>(A)</small></button>${canRaise ? `<button class="ui-btn tr-btn-truco" id="trRaise">${this.CALL_NAME[this.RAISE[prop]]}! <small>(T)</small></button>` : ''}<button class="ui-btn" id="trRun">Correr <small>(C)</small></button></div>`;
        box.style.display = 'block';
        return new Promise((ok, no) => {
            const done = (type) => { box.style.display = 'none'; this.ask = null; if (gen !== this._gen) return no(this.CANCEL); ok({ type, seat: 0 }); };
            this.ask = { done, canRaise };
            this.$('trAcc').onclick = () => done('accept');
            this.$('trRun').onclick = () => done('run');
            if (canRaise) this.$('trRaise').onclick = () => done('raise');
            this._hud();
        });
    },

    // O parceiro (2 × 2) dá a dica pelo olhar: forte, médio ou fraco (pela própria mão).
    _mateHint(prop) {
        const H = this.hands[2] || [];
        const st = H.reduce((s, sp) => s + this._pow(sp.c), 0) / Math.max(1, H.length);
        const man = H.some((sp) => this._isMan(sp.c));
        const m = this._people()[2].f ? 'Sua parceira' : 'Seu parceiro';
        const t = man || st > 8 ? [`😏 ${m} dá uma piscadinha: <b>pode aceitar</b>.`, `😏 ${m} bate na mesa: <b>tá forte!</b>`] : st > 5.5 ? [`🤔 ${m} dá de ombros: <b>médio</b>.`] : [`😬 ${m} faz careta: <b>tô fraco</b>.`];
        return '<br>' + t[Math.floor(Math.random() * t.length)];
    },

    async _onzeDecide(gen, team) {
        if (team === 0 && !this.watching) {
            // vê as cartas do parceiro (2 × 2)
            if (this.duo) { this.revealMate = true; this.hands[2].forEach((sp, k) => this._flip(sp, true, 0.26, k * 0.08)); await this._sleep(gen, 400); }
            const box = this.$('trAsk');
            box.innerHTML = `<h3>MÃO DE ONZE</h3><p>${this.duo ? 'Você vê as cartas do seu parceiro. ' : ''}Jogar vale <b>3 pontos</b> (sem truco). Correr dá <b>1 ponto</b> para eles.</p>
                <div class="row"><button class="ui-btn pri" id="trAcc">Jogar <small>(A)</small></button><button class="ui-btn" id="trRun">Correr <small>(C)</small></button></div>`;
            box.style.display = 'block';
            const r = await new Promise((ok, no) => {
                const done = (type) => { box.style.display = 'none'; this.ask = null; if (gen !== this._gen) return no(this.CANCEL); ok(type); };
                this.ask = { done, canRaise: false };
                this.$('trAcc').onclick = () => done('accept');
                this.$('trRun').onclick = () => done('run');
                this._hud();
            });
            if (this.duo) { this.hands[2].forEach((sp) => this._flip(sp, false, 0.2, 0)); this.revealMate = false; }
            return r === 'accept';
        }
        await this._sleep(gen, 900);
        const seats = this._teamSeats(team), p = Math.max(...seats.map((i) => this._winProb(i, { value: 3 })));
        const go = p + (Math.random() - 0.5) * this._skOf(seats[0]).noise > 0.42;
        this._say(seats[0], go ? 'Vamos jogar essa.' : 'Essa não dá… corremos.', 1300);
        await this._sleep(gen, 900);
        return go;
    },
    _teamSeats(team) { return this.duo ? [team, team + 2] : [team]; },
    _skOf(i) { return this.skT ? this.skT[this._team(i)] : this.sk; },          // (assistindo: cada lado com o nível dele)

    // ------------------------------------------------------------------ IA
    // O que o jogador i sabe: a própria mão, as cartas na mesa e nos montinhos (abertas), a vira. O resto é sorteado.
    _known(i) {
        const seen = new Set([this.vira.id]);
        for (const sp of this.hands[i]) seen.add(sp.c.id);
        for (const pile of this.piles) for (const sp of pile) seen.add(sp.c.id);
        for (const p of this.played) if (!p.covered) seen.add(p.sp.c.id);
        if (this.revealMate && i === 2) for (const sp of this.hands[0]) seen.add(sp.c.id);
        const unknown = [];
        for (let r = 0; r < 10; r++) for (let s = 0; s < 4; s++) if (!seen.has(r * 4 + s)) unknown.push({ r, s, id: r * 4 + s });
        // encobertas: são cartas que existem, mas ninguém sabe quais — continuam no sorteio (tiradas das mãos de quem jogou)
        return unknown;
    },

    // Chance de a dupla de i ganhar a mão (Monte Carlo). opts: { first: carta que i joga agora (índice) | null, covered, bias: dupla
    // que pediu truco (as mãos dela são sorteadas mais fortes, conforme a desconfiança) }.
    _winProb(i, opts = {}) {
        const sk = this._skOf(i), N = Math.max(24, sk.mc || 30), man = this.man, n = this.seatsN, myTeam = this._team(i);
        const unknown = this._known(i);
        let win = 0, tot = 0;
        for (let it = 0; it < N; it++) {
            // sorteia as mãos que i não vê
            const pool = unknown.slice();
            for (let k = pool.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [pool[k], pool[j]] = [pool[j], pool[k]]; }
            const H = [];
            for (let s = 0; s < n; s++) {
                if (s === i) H.push(this.hands[s].map((sp) => sp.c));
                else if (this.revealMate && i === 2 && s === 0) H.push(this.hands[0].map((sp) => sp.c));
                else { const m = this.hands[s].length; H.push(pool.splice(0, m)); }
            }
            let w = 1;
            if (opts.bias != null) {                                     // quem trucou deve ter mão boa (o quanto eu acredito nisso)
                const belief = this._belief(sk), str = this._teamStrength(H, opts.bias, i);
                w = (1 - belief) + belief * (0.15 + 1.7 * str * str);
            }
            const r = this._simHand(H, i, opts, man);
            win += w * (r === myTeam ? 1 : r === 'none' ? 0.5 : 0); tot += w;
        }
        return tot ? win / tot : 0.5;
    },
    _teamStrength(H, team, me) {
        let s = 0, k = 0;
        for (const i of this._teamSeats(team)) { if (i === me) continue; for (const c of H[i]) { s += this._pow(c) / 13; k++; } }
        return k ? s / k : 0.5;
    },
    // O quanto a IA acredita que quem pede truco tem jogo (os mais espertos lembram dos seus blefes).
    _belief(sk = this.sk) {
        const B = (this.watching ? null : this.bluffSeen) || { calls: 0, weak: 0 };
        const rate = B.calls >= 2 ? B.weak / B.calls : 0.3;
        return Math.max(0, Math.min(1, sk.read * (1 - rate) * 0.9 + (1 - sk.read) * 0.25));
    },

    // Simula o resto da mão com todos jogando "no guloso" (o que se joga numa mesa de bar) e devolve a dupla que leva.
    _simHand(H0, me, opts, man) {
        const n = this.seatsN, H = H0.map((h) => h.slice()), res = this.results.slice();
        let plays = this.played.map((p) => ({ seat: p.seat, c: p.covered ? null : p.sp.c }));
        // tira das mãos sorteadas as cartas já jogadas encobertas (o jogador já não tem aquela carta)
        let leader = plays.length ? plays[0].seat : null;
        let seat = this.turn >= 0 ? this.turn : me, round = this.round || 0;
        if (leader == null) leader = seat;
        let first = true;
        for (let guard = 0; guard < 16; guard++) {
            if (plays.length === n) {
                const rw = this._simRound(plays, man);
                res.push(rw.team);
                const d = this._decide(res);
                if (d != null) return d;
                if (rw.seat != null) leader = rw.seat;
                plays = []; round++; seat = leader;
                if (round > 2) return 'none';
                continue;
            }
            const hand = H[seat];
            if (!hand.length) return 'none';
            let k;
            if (first && seat === me && opts.first != null) k = Math.min(opts.first, hand.length - 1);
            else k = this._greedy(hand, plays, seat, round, man, res);
            const c = hand.splice(k, 1)[0];
            const cov = first && seat === me && opts.covered;
            plays.push({ seat, c: cov ? null : c });
            if (seat === me) first = false;
            seat = (seat + 1) % n;
        }
        return 'none';
    },
    _simRound(plays, man) {
        let best = -1, seat = null, team = null, tie = false;
        for (const p of plays) {
            const v = p.c ? this._pow(p.c, man) : -1;
            if (v > best) { best = v; seat = p.seat; team = this._team(p.seat); tie = false; }
            else if (v === best && v >= 0 && this._team(p.seat) !== team) tie = true;
        }
        if (best < 0) return { team: 't', seat: plays[0].seat };
        return tie ? { team: 't', seat } : { team, seat };
    },
    // Jogada "de boteco": parceiro ganhando com carta boa → a mais fraca; dá para ganhar → a mais fraca que ganha; senão a mais
    // fraca. Abrindo a rodada: a mais forte que não é manilha (guarda as manilhas), na primeira; depois a mais forte.
    _greedy(hand, plays, seat, round, man, res) {
        const P = (c) => this._pow(c, man);
        let lo = 0; for (let k = 1; k < hand.length; k++) if (P(hand[k]) < P(hand[lo])) lo = k;
        let hi = 0; for (let k = 1; k < hand.length; k++) if (P(hand[k]) > P(hand[hi])) hi = k;
        if (!plays.length) {
            if (round === 0) { let b = -1; for (let k = 0; k < hand.length; k++) if (P(hand[k]) < 10 && (b < 0 || P(hand[k]) > P(hand[b]))) b = k; return b >= 0 && P(hand[b]) >= 5 ? b : (P(hand[hi]) >= 10 && hand.length > 1 ? lo : hi); }
            return res && res[res.length - 1] === this._team(seat) ? lo : hi;
        }
        let best = -1, bt = null;
        for (const p of plays) { const v = p.c ? P(p.c) : -1; if (v > best) { best = v; bt = this._team(p.seat); } }
        const n = this.seatsN, last = plays.length === n - 1;
        if (bt === this._team(seat) && (best >= 8 || last)) return lo;
        let win = -1; for (let k = 0; k < hand.length; k++) if (P(hand[k]) > best && (win < 0 || P(hand[k]) < P(hand[win]))) win = k;
        if (win >= 0) return win;
        return lo;
    },

    // Qual carta jogar: os melhores simulam cada opção (e a encoberta); os fracos jogam no guloso com uns vacilos.
    _aiChoose(i) {
        const hand = this.hands[i], sk = this._skOf(i);
        if (this.ferro || hand.length === 1) return { k: Math.floor(Math.random() * hand.length) * (this.ferro ? 1 : 0), covered: false };
        const cards = hand.map((sp) => sp.c), plays = this.played.map((p) => ({ seat: p.seat, c: p.covered ? null : p.sp.c }));
        const g = this._greedy(cards, plays, i, this.round, this.man, this.results);
        if (!sk.mc || Math.random() < sk.noise) return { k: Math.random() < sk.noise * 0.5 ? Math.floor(Math.random() * hand.length) : g, covered: false };
        let best = { k: g, covered: false, p: -1 };
        for (let k = 0; k < hand.length; k++) {
            const p = this._winProb(i, { first: k }) + (k === g ? 0.01 : 0) - this._pow(cards[k]) * 0.0015;     // (empate: guarda a carta forte)
            if (p > best.p) best = { k, covered: false, p };
        }
        if (this.round > 0) {                                                  // encobrir a mais fraca, se não muda nada
            let lo = 0; for (let k = 1; k < hand.length; k++) if (this._pow(cards[k]) < this._pow(cards[lo])) lo = k;
            const p = this._winProb(i, { first: lo, covered: true }) + 0.005;
            if (p > best.p + 0.02) best = { k: lo, covered: true, p };
        }
        return best;
    },

    _strengthHeur(i) {
        const H = this.hands[i].map((sp) => sp.c);
        if (!H.length) return 0.5;
        let s = 0; for (const c of H) s += this._pow(c) >= 10 ? 1 : this._pow(c) / 12;
        const won = this.results.filter((t) => t === this._team(i)).length, lost = this.results.filter((t) => t !== 't' && t !== this._team(i)).length;
        return Math.max(0, Math.min(1, s / H.length * 0.9 + won * 0.25 - lost * 0.25));
    },

    _aiWantsTruco(i) {
        const sk = this._skOf(i), prop = this.RAISE[this.value];
        if (!prop) return false;
        const p = (sk.mc ? this._winProb(i) : this._strengthHeur(i)) + (Math.random() - 0.5) * sk.noise * 2;
        // quanto mais perto do fim (o adversário com muitos pontos), mais vale arriscar
        const need = sk.callK - (this.score[1 - this._team(i)] >= 9 ? 0.06 : 0);
        if (p > need) return Math.random() < 0.85;
        // blefe: com a mesa a favor (já ganhou a primeira) ou com a mão parecendo boa
        const won = this.results[0] === this._team(i);
        return Math.random() < sk.bluff * (won ? 1.6 : 0.6) * (p > 0.3 ? 1 : 0.5) / Math.max(1, this.calls.filter((c) => c.team === this._team(i)).length);
    },

    // A dupla que recebe o truco decide (o melhor dos dois fala por ela).
    async _aiRespond(gen, team, prop, who) {
        await this._sleep(gen, 600 + Math.random() * 600);
        const seats = this._teamSeats(team), sk = this._skOf(seats[0]);
        let p = -1, seat = seats[0];
        for (const i of seats) {
            const q = (sk.mc ? this._winProb(i, { bias: 1 - team }) : this._strengthHeur(i) * 0.9) + (Math.random() - 0.5) * sk.noise * 2;
            if (q > p) { p = q; seat = i; }
        }
        // aceitar vale a pena se o esperado aceitando (prop·(2p − 1)) for melhor que correr (−valor atual)
        const thr = (1 - this.value / prop) / 2 + (sk.mc ? 0.04 : 0.1);
        const next = this.RAISE[prop];
        if (next && prop < 12 && p > 0.74 + (Math.random() - 0.5) * 0.1) return { type: 'raise', seat };
        if (p > thr) return { type: 'accept', seat };
        return { type: 'run', seat };
    },

    // Fim da mão: quem pediu truco mostrando carta fraca entra na conta dos blefes (o que a mesa viu).
    _learnBluffs() {
        const B = this.bluffSeen; if (!B || this.watching) { this.calls = []; return; }
        for (const c of this.calls || []) {
            if (c.team !== 0) continue;
            const mine = this.piles[c.seat] || [];
            if (!mine.length) continue;
            B.calls++;
            const st = mine.reduce((s, sp) => s + (sp.covered ? 0 : this._pow(sp.c)), 0) / mine.length;
            if (st < 6) B.weak++;
        }
        this.calls = [];
    },

    // ------------------------------------------------------------------ vez do jogador
    _waitHuman(gen) {
        this.cover = false;
        return new Promise((ok, no) => {
            this.wait = { done: (act) => { this.wait = null; this._hud(); if (gen !== this._gen) return no(this.CANCEL); ok(act); } };
            this._hud();
        });
    },
    _humanPlay(k) {
        if (!this.wait || this.ask || k < 0 || k >= this.hands[0].length) return;
        this.wait.done({ type: 'play', k, covered: this.cover && this.round > 0 && !this.ferro });
    },
    _humanTruco() {
        if (this.ask) { if (this.ask.canRaise) this.ask.done('raise'); return; }
        if (!this.wait || !this._canCall(0)) return;
        this.wait.done({ type: 'truco' });
    },
    _toggleCover() {
        if (!this.wait || this.round === 0 || this.ferro) return;
        this.cover = !this.cover; this._hud();
    },

    _key(e) {
        if (!this.active) return;
        const k = e.key.toLowerCase();
        e.stopPropagation();
        if (k === 'escape') { e.preventDefault(); this._quit(); return; }
        if (this.phase === 'setup' || this.phase === 'end') return;
        if (this.ask) {
            if (k === 'a' || k === 'enter') { e.preventDefault(); this.ask.done('accept'); }
            else if (k === 'c') { e.preventDefault(); this.ask.done('run'); }
            else if ((k === 't' || k === 'r') && this.ask.canRaise) { e.preventDefault(); this.ask.done('raise'); }
            return;
        }
        if (k >= '1' && k <= '3') { e.preventDefault(); this._humanPlay(+k - 1); }
        else if (k === 't') { e.preventDefault(); this._humanTruco(); }
        else if (k === 'x') { e.preventDefault(); this._toggleCover(); }
        else if (k === 'arrowleft' || k === 'arrowright') { e.preventDefault(); const n = this.hands[0] ? this.hands[0].length : 0; if (n) this.hover = ((this.hover < 0 ? 0 : this.hover) + (k === 'arrowleft' ? n - 1 : 1)) % n; }
        else if (k === 'enter' || k === ' ') { e.preventDefault(); if (this.hover >= 0) this._humanPlay(this.hover); }
    },

    _quit() {
        if (this.phase === 'setup' || this.phase === 'end') { this.close(); return; }
        if (this.watching) { this.watching = null; this.skT = null; this.fast = false; this.close(); return; }      // (a partida segue no salão)
        if (!this._quitT || performance.now() - this._quitT > 2500) { this._quitT = performance.now(); this._msg('Desistir perde a aposta — clique/ESC de novo para confirmar'); return; }
        this._gen++;
        this.$('trAsk').style.display = 'none'; this.ask = null; this.wait = null;
        this._end(1, true);
    },

    _end(winner, quit = false) {
        if (this.custom) {                                                  // partida de torneio (BarGames): sem aposta, o torneio decide
            const C = this.custom; this.custom = null; this.phase = 'end';
            this.$('trModal').style.display = 'flex';
            this.$('trModal').innerHTML = `<div class="tr-box tr-end"><div style="font-family:var(--emoji);font-size:44px">${winner === 0 ? '🏆' : C.emo}</div>
                <div class="big" style="color:${winner === 0 ? '#86efac' : '#fb7185'}">${winner === 0 ? 'Você passou!' : 'Você caiu'}</div>
                <p class="sub">${quit ? 'Você desistiu.' : `Placar: <b>${this.score[0]} × ${this.score[1]}</b> contra ${C.name}.`}</p>
                <div class="row"><button class="ui-btn pri" id="trBack">Continuar</button></div></div>`;
            this.$('trBack').onclick = () => { this.close(); if (C.onEnd) C.onEnd(winner === 0); };
            this._hud();
            return;
        }
        this.phase = 'end';
        const won = winner === 0, o = this.opp, g = this.g, bet = this.bet || o.bet;
        if (typeof WorldMemory !== 'undefined') WorldMemory.onGame('truco', this.shop, this._oppKey(), won, bet);
        if (won) {
            g.inventory.cash += bet * 2;
            const A = g.achievements; if (A) { A.bump('trucoWins'); if (this.lvl === 4) A.bump('trucoBoss'); }
            AudioFX.blip(880, 0.12, 0.2); setTimeout(() => AudioFX.blip(1320, 0.18, 0.2), 140);
        } else AudioFX.blip(140, 0.4, 0.2);
        const them = this.duo ? `${o.duo[0]} e ${o.duo[2]}` : o.name;
        this.$('trAsk').style.display = 'none';
        this.$('trModal').style.display = 'flex';
        this.$('trModal').innerHTML = `<div class="tr-box tr-end"><div style="font-family:var(--emoji);font-size:46px">${won ? '🏆' : (this.duo ? o.duo[1] + o.duo[3] : o.emo)}</div>
            <div class="big" style="color:${won ? '#86efac' : '#fb7185'}">${won ? (this.duo ? 'Vocês venceram!' : 'Você venceu!') : (this.duo ? 'Vocês perderam' : 'Você perdeu')}</div>
            <p class="sub">${quit ? 'Você desistiu da partida.' : `Placar final: <b>${this.score[0]} × ${this.score[1]}</b>.`} ${won ? `Prêmio: <b style="color:#86efac">+${brl(bet * 2)}</b>` : `A aposta de ${brl(bet)} ficou com ${them}.`}</p>
            ${!quit ? `<p class="sub" style="font-style:italic">${won ? `${this.duo ? o.duo[1] : o.emo} “Revanche! Dobro ou nada: ${brl(bet * 2)}.”` : `Você pode pedir a revanche pela mesma aposta (${brl(bet)}).`}</p>` : ''}
            <div class="row">${!quit ? `<button class="ui-btn pri" id="trRematch" ${g.inventory.cash < (won ? bet * 2 : bet) ? 'disabled' : ''}>${won ? `Aceitar revanche (${brl(bet * 2)})` : `Pedir revanche (${brl(bet)})`}</button>` : ''}<button class="ui-btn ${quit ? 'pri' : ''}" id="trAgain">Outra mesa</button><button class="ui-btn" id="trBack">Voltar ao bar</button></div></div>`;
        if (this.$('trRematch')) this.$('trRematch').onclick = () => { const L = this.lvl; this._reset(); this._startMatch(L, won ? bet * 2 : bet); };
        this.$('trAgain').onclick = () => { this._reset(); this._renderSetup(); };
        this.$('trBack').onclick = () => this.close();
        this._hud();
    },

    // ------------------------------------------------------------------ HUD
    _hud() {
        if (!this.root) return;
        const playing = this.phase !== 'setup' && this.phase !== 'end', T = this.$('trTruco'), C = this.$('trCover');
        this.$('trUs').innerHTML = `<b>${this.score[0]}</b><small>${this._sideShort(0)}</small>`;
        this.$('trThem').innerHTML = `<b>${this.score[1]}</b><small>${this._sideShort(1)}</small>`;
        this.$('trVal').innerHTML = `<b>${this.value === 1 ? '1' : this.value}</b><small>${this.ferro ? 'mão de ferro' : this.onze != null ? 'mão de onze' : this.value === 1 ? 'vale a mão' : this.CALL_NAME[this.value].toLowerCase()}</small>`;
        const wb = this.watching && this.watching.bet;
        if (this.custom) { this.$('trPot').innerHTML = `<b>🏆</b><small>torneio · até ${this._goal()}</small>`; }
        else this.$('trPot').innerHTML = this.watching ? `<b>${wb ? brl(Math.round(wb.bet * wb.odds)) : '—'}</b><small>${wb ? 'sua aposta paga' : 'assistindo'}</small>` : `<b>${this.opp ? brl((this.bet || this.opp.bet) * 2) : '—'}</b><small>na mesa</small>`;
        for (const id of ['trUs', 'trThem', 'trVal', 'trPot']) this.$(id).style.visibility = playing ? 'visible' : 'hidden';
        this.$('trCover').parentElement.style.visibility = playing ? 'visible' : 'hidden';
        const myTurn = !!this.wait && !this.ask, W = !!this.watching;
        this.$('trSkip').style.display = W && playing ? '' : 'none'; T.style.display = C.style.display = W ? 'none' : '';
        this.$('trQuit').textContent = W ? 'Sair (a partida segue)' : 'Desistir';
        const prop = this.RAISE[this.value];
        T.textContent = (prop ? this.CALL_NAME[prop] : 'DOZE') + '!';
        T.disabled = !(myTurn && this._canCall(0));
        C.disabled = !(myTurn && this.round > 0 && !this.ferro);
        C.classList.toggle('on', !!this.cover);
        this.$('trHelp').textContent = !playing ? '' : this.ferro ? 'Mão de ferro: escolha uma carta às cegas' : myTurn ? 'Sua vez: clique numa carta (ou 1 2 3)' + (this._canCall(0) ? ' · T pede ' + (prop ? this.CALL_NAME[prop].toLowerCase() : '') : '') + (this.round > 0 ? ' · X encobre' : '') : '';
    },
    _msg(t) { this.msgT = { text: t, t: 0 }; },
    // Como chamar o outro lado: "eles" (dupla) ou o apelido do adversário (sem o Seu/Dona/Mestre/O).
    _themLabel() {
        if (this.duo || this.lvl == null) return 'Eles';
        const w = this._people()[1].name.split(/\s+/).filter((t) => !/^(seu|dona|mestre|o|a|da|do|de)$/i.test(t));
        return w[0] || 'Ele';
    },

    // ------------------------------------------------------------------ sprites e animação
    _sprite(c, x, y, r = 0, s = 1) {
        const sp = { c, x, y, r, s, face: 0, a: 1, z: 0, glow: 0, lift: 0, stack: 0 };
        this.sprites.push(sp);
        return sp;
    },
    // Põe a carta onde ela deve estar (mão de quem é dono): usado depois de dar e quando a mão muda.
    _place(sp, snap = false) {
        if (sp.owner == null) return;
        const H = this.hands[sp.owner]; if (!H) return;
        const k = H.indexOf(sp); if (k < 0) return;
        const P = this._handXY(sp.owner, k, H.length);
        if (snap) { sp.x = P.x; sp.y = P.y; sp.r = P.r; sp.s = P.s; return; }
        this._tween(sp, { x: P.x, y: P.y, r: P.r, s: P.s }, 0.34, 'out');
    },
    _tween(o, to, dur, ease = 'out', delay = 0) {
        this.tweens = this.tweens.filter((t) => !(t.o === o && Object.keys(to).some((k) => k in t.to)));
        const from = {}; for (const k of Object.keys(to)) from[k] = o[k];
        this.tweens.push({ o, from, to, dur, ease, t: -delay });
    },
    _flip(sp, up, dur = 0.25, delay = 0) { this._tween(sp, { face: up ? 1 : 0 }, dur, 'inout', delay); },
    _ease(e, t) { return e === 'in' ? t * t * t : e === 'inout' ? (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) : 1 - Math.pow(1 - t, 3); },

    _say(i, text, ms = 1200) { this.bubbles = this.bubbles.filter((b) => b.i !== i); this.bubbles.push({ i, text, t: 0, life: ms / 1000 }); },
    _shout(i, prop) {
        const name = this.CALL_NAME[prop];
        const lines = { 3: ['TRUCO!', 'TRUCO, LADRÃO!', 'TRUUUCO!'], 6: ['SEIS!', 'SEIS, MARRECO!'], 9: ['NOVE!', 'NOVE, VAGABUNDO!'], 12: ['DOZE!', 'DOZE E ACABOU!'] }[prop] || [name + '!'];
        this._say(i, lines[Math.floor(Math.random() * lines.length)], 1500);
        this._banner(name + '!', '#fde047', 1.3, i);
        this.shake = 1;
        AudioFX.thud && AudioFX.thud(AudioFX.listener.x, AudioFX.listener.z);
        AudioFX.blip(160, 0.22, 0.2);
    },
    _banner(text, col, life = 1.3, from = null) { this.banner = { text, col, t: 0, life, from }; },

    // ------------------------------------------------------------------ entrada (mouse / toque)
    _cardAt(x, y) {
        const H = this.hands[0]; if (!H) return -1;
        for (let k = H.length - 1; k >= 0; k--) {
            const sp = H[k], dx = x - sp.x, dy = y - (sp.y - sp.lift), c = Math.cos(-sp.r), s = Math.sin(-sp.r);
            const lx = dx * c - dy * s, ly = dx * s + dy * c;
            if (Math.abs(lx) < this.cw * sp.s / 2 && Math.abs(ly) < this.ch * sp.s / 2) return k;
        }
        return -1;
    },
    _pMove(e) { const r = this.cv.getBoundingClientRect(); const k = this._cardAt(e.clientX - r.left, e.clientY - r.top); if (k !== this.hover) this.hover = k; this.cv.style.cursor = k >= 0 && this.wait ? 'pointer' : 'default'; },
    _pDown(e) {
        const r = this.cv.getBoundingClientRect(), k = this._cardAt(e.clientX - r.left, e.clientY - r.top);
        if (k < 0 || !this.wait) return;
        if (e.button === 2 && this.round > 0 && !this.ferro) this.cover = true;                 // botão direito: joga encoberta
        this._humanPlay(k);
    },
    // Controle (PadNav): ← → escolhem a carta, A joga, Y truco/aumenta, X encobre, B corre (quando perguntam) / desiste.
    pad(btn) {
        if (!this.active) return;
        const send = (key) => this._key({ key, stopPropagation() {}, preventDefault() {} });
        if (btn === 'left') send('ArrowLeft'); else if (btn === 'right') send('ArrowRight');
        else if (btn === 'a') { if (this.ask) send('a'); else send('Enter'); }
        else if (btn === 'y') send('t'); else if (btn === 'x') send('x');
        else if (btn === 'b') send(this.ask ? 'c' : 'Escape');
    },

    // ------------------------------------------------------------------ quadro
    _frame(dt) {
        const now = performance.now();
        for (const f of this.fx.slice()) if (now >= f.wake) { this.fx.splice(this.fx.indexOf(f), 1); f.ok(); }
        for (const t of this.tweens) {
            t.t += dt;
            if (t.t < 0) continue;
            const u = Math.min(1, t.t / t.dur), e = this._ease(t.ease, u);
            for (const k of Object.keys(t.to)) t.o[k] = t.from[k] + (t.to[k] - t.from[k]) * e;
        }
        this.tweens = this.tweens.filter((t) => t.t < t.dur);
        // sua mão: a carta sob o mouse sobe
        const H = this.hands[0] || [];
        H.forEach((sp, k) => { const want = (k === this.hover && this.wait) ? this.ch * 0.16 : 0; sp.lift += (want - sp.lift) * Math.min(1, dt * 14); });
        for (const b of this.bubbles) b.t += dt;
        this.bubbles = this.bubbles.filter((b) => b.t < b.life);
        if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.life) this.banner = null; }
        if (this.msgT) this.msgT.t += dt;
        this.shake = Math.max(0, this.shake - dt * 2.4);
        this._draw(now / 1000);
    },

    // ------------------------------------------------------------------ desenho
    _draw(time) {
        const x = this.ctx, d = this.dpr, w = this.vw, h = this.vh;
        x.setTransform(d, 0, 0, d, 0, 0);
        const sh = this.shake * this.shake * 7;
        x.save();
        if (sh) x.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
        x.drawImage(this._background(), 0, 0, w, h);
        this._drawTentos(x);
        this._drawLabels(x);
        const list = this.sprites.filter((s) => !s.dead && s.a > 0.01).sort((a, b) => a.z - b.z);
        const H0 = this.hands[0] || [];
        for (const sp of list) if (!H0.includes(sp)) this._drawSprite(x, sp, time);
        this._drawSeats(x, time);
        for (const sp of H0) this._drawSprite(x, sp, time, H0.indexOf(sp));
        this._drawBubbles(x);
        x.restore();
        this._drawBanner(x);
        this._drawMsg(x);
    },

    _drawSprite(x, sp, time, handK = -1) {
        const cw = this.cw * sp.s, chh = this.ch * sp.s;
        x.save();
        x.globalAlpha = sp.a;
        x.translate(sp.x, sp.y - (sp.lift || 0));
        x.rotate(sp.r);
        // virando: a carta "fecha" na largura até a metade e abre do outro lado
        const f = sp.face, sx = Math.abs(Math.cos(f * Math.PI)), showFace = f > 0.5 && sp.c;
        const lift = Math.sin(f * Math.PI) * 0.08;
        x.scale(Math.max(0.02, sx) * (1 + lift), 1 + lift);
        // sombra (uma imagem desfocada pronta: blur por quadro em ~20 cartas pesa)
        const so = (sp.lift ? 6 + sp.lift * 0.25 : 3) * sp.s + lift * 30, SH = this._shadowImg(), pad = this.cw * 0.12 * sp.s;
        x.globalAlpha = sp.a * 0.42; x.drawImage(SH, -cw / 2 + so * 0.6 - pad, -chh / 2 + so - pad, cw + pad * 2, chh + pad * 2); x.globalAlpha = sp.a;
        if (sp.stack) {                                                      // o monte: as bordas das cartas de baixo
            for (let k = Math.min(6, Math.ceil(sp.stack / 6)); k > 0; k--) { x.drawImage(this._cardImg(null), -cw / 2 - k * 0.9, -chh / 2 + k * 1.1, cw, chh); }
        }
        x.drawImage(this._cardImg(showFace ? sp.c : null), -cw / 2, -chh / 2, cw, chh);
        if (showFace && this._isMan(sp.c) && (handK >= 0 || sp.glow)) {          // manilha: um brilho dourado discreto
            x.strokeStyle = 'rgba(251,191,36,' + (0.55 + 0.25 * Math.sin(time * 4)) + ')'; x.lineWidth = 2.2; this._rr(x, -cw / 2 + 1, -chh / 2 + 1, cw - 2, chh - 2, cw * 0.08); x.stroke();
        }
        if (sp.glow) { x.save(); x.shadowColor = '#fde047'; x.shadowBlur = 26; x.strokeStyle = 'rgba(253,224,71,0.95)'; x.lineWidth = 3; this._rr(x, -cw / 2, -chh / 2, cw, chh, cw * 0.08); x.stroke(); x.restore(); }
        if (handK >= 0 && this.wait && k_hover(this, handK)) { x.strokeStyle = this.cover && this.round > 0 ? 'rgba(148,163,184,0.95)' : 'rgba(134,239,172,0.95)'; x.lineWidth = 2.5; this._rr(x, -cw / 2 - 2, -chh / 2 - 2, cw + 4, chh + 4, cw * 0.09); x.stroke(); }
        x.restore();
        function k_hover(T, k) { return T.hover === k; }
    },

    _drawSeats(x, time) {
        if (this.phase === 'setup') return;
        const P = this._people();
        for (let i = 0; i < this.seatsN; i++) {
            if (i === 0 && !this.watching) continue;
            const A = this._seatXY(i), r = Math.max(20, this.cw * 0.3), turn = this.turn === i && this.phase === 'play';
            x.save();
            x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = 12;
            const g = x.createRadialGradient(A.x - r * 0.3, A.y - r * 0.3, r * 0.2, A.x, A.y, r);
            g.addColorStop(0, this._team(i) === 0 ? '#2f5d47' : '#5d2f3a'); g.addColorStop(1, this._team(i) === 0 ? '#163126' : '#2e141b');
            x.fillStyle = g; x.beginPath(); x.arc(A.x, A.y, r, 0, Math.PI * 2); x.fill();
            x.shadowBlur = 0;
            x.lineWidth = turn ? 3 : 1.5; x.strokeStyle = turn ? 'rgba(253,224,71,' + (0.7 + 0.3 * Math.sin(time * 6)) + ')' : 'rgba(255,255,255,0.25)'; x.stroke();
            x.font = `${Math.round(r * 1.15)}px ${this._emoji}`; x.textAlign = 'center'; x.textBaseline = 'middle';
            x.fillText(P[i].emo, A.x, A.y + r * 0.06);
            x.font = `700 ${Math.max(11, Math.round(r * 0.48))}px system-ui, sans-serif`;
            const label = P[i].name + (this.duo && i === 2 && !this.watching ? (P[i].f ? ' (parceira)' : ' (parceiro)') : ''), tw = x.measureText(label).width + 16, ly = this._seatOf(i) === 'N' ? A.y - r - 14 : A.y + r + 14;
            x.fillStyle = 'rgba(10,8,6,0.72)'; this._rr(x, A.x - tw / 2, ly - 10, tw, 20, 10); x.fill();
            x.fillStyle = this._team(i) === 0 ? '#bbf7d0' : '#fecdd3'; x.fillText(label, A.x, ly + 0.5);
            x.restore();
        }
    },

    _drawBubbles(x) {
        for (const b of this.bubbles) {
            const A = b.i === 0 ? { x: this.cx - this.cw * 2.2, y: this.vh - this.ch * 1.15 } : this._seatXY(b.i), k = Math.min(1, b.t / 0.12), out = Math.max(0, (b.t - b.life + 0.25) / 0.25);
            const S = b.i === 0 ? 'S' : this._seatOf(b.i);
            x.save(); x.globalAlpha = (1 - out);
            x.font = `800 ${Math.max(13, Math.round(this.cw * 0.17))}px system-ui, sans-serif`;
            const tw = x.measureText(b.text).width + 22, th = Math.max(26, this.cw * 0.3);
            let bx = A.x - tw / 2, by = A.y - this.cw * 0.45 - th;
            if (S === 'N') { bx = A.x - tw - Math.max(20, this.cw * 0.3) - 12; by = A.y - th / 2; }          // (ao lado: embaixo fica a mensagem)
            if (S === 'E') { bx = A.x - tw - this.cw * 0.38; by = A.y - th - 8; } if (S === 'W') { bx = A.x + this.cw * 0.38; by = A.y - th - 8; }
            const sc = 0.6 + 0.4 * k; x.translate(bx + tw / 2, by + th / 2); x.scale(sc, sc); x.translate(-(bx + tw / 2), -(by + th / 2));
            x.shadowColor = 'rgba(0,0,0,0.5)'; x.shadowBlur = 10; x.fillStyle = '#fffaf0'; this._rr(x, bx, by, tw, th, th / 2); x.fill();
            x.shadowBlur = 0; x.fillStyle = /!$/.test(b.text) && b.text === b.text.toUpperCase() ? '#b91c1c' : '#1f1308'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(b.text, bx + tw / 2, by + th / 2 + 0.5);
            x.restore();
        }
    },

    _drawBanner(x) {
        const B = this.banner; if (!B) return;
        const t = B.t, k = Math.min(1, t / 0.18), out = Math.max(0, (t - B.life + 0.3) / 0.3), sc = 2.4 - 1.4 * (1 - Math.pow(1 - k, 3)) + Math.sin(t * 30) * 0.03 * (1 - k);
        x.save(); x.globalAlpha = 1 - out;
        x.translate(this.cx, this.cy - this.ch * 0.05); x.rotate(-0.06); x.scale(sc, sc);
        x.font = `900 ${Math.round(this.cw * 0.62)}px Impact, "Arial Black", system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.lineJoin = 'round'; x.lineWidth = this.cw * 0.09; x.strokeStyle = '#2a0f00'; x.strokeText(B.text, 0, 0);
        const g = x.createLinearGradient(0, -this.cw * 0.3, 0, this.cw * 0.3); g.addColorStop(0, '#fff7c2'); g.addColorStop(0.5, B.col); g.addColorStop(1, '#c2410c');
        x.fillStyle = g; x.shadowColor = 'rgba(251,191,36,0.6)'; x.shadowBlur = 30; x.fillText(B.text, 0, 0);
        x.restore();
    },

    _drawMsg(x) {
        const M = this.msgT; if (!M || M.t > 4.2 || this.phase === 'setup') return;
        const a = Math.min(1, M.t / 0.2) * Math.min(1, (4.2 - M.t) / 0.5);
        x.save(); x.globalAlpha = a;
        x.font = `600 ${this.vh < 560 ? 12 : 14}px system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
        const tw = Math.min(this.vw - 24, x.measureText(M.text).width + 36), N = this._seatXY(this.duo ? 2 : 1), y = N.y + Math.max(20, this.cw * 0.3) + this.cw * 0.62;
        x.fillStyle = 'rgba(16,13,10,0.82)'; this._rr(x, this.cx - tw / 2, y - 16, tw, 32, 16); x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.12)'; x.stroke();
        x.fillStyle = '#f5efe3'; x.fillText(M.text, this.cx, y + 0.5, tw - 24);
        x.restore();
    },

    // Vira e manilha escritas ao lado do monte; o placar em palitos de fósforo (tentos) em cada lado da mesa.
    _drawLabels(x) {
        if (!this.vira || this.phase === 'setup') return;
        const D = this._deckXY();
        x.save();
        x.font = `700 ${Math.max(11, Math.round(this.cw * 0.13))}px system-ui, sans-serif`; x.textAlign = 'center';
        x.fillStyle = 'rgba(255,248,230,0.75)';
        x.fillText(`manilha: ${this.RANKS[this.man]}`, D.x + this.cw * 0.25, D.y + this.ch * 0.72);
        x.restore();
    },
    _drawTentos(x) {
        if (this.phase === 'setup') return;
        const L = this.cw * 0.5;
        const spots = [{ x: this.cx - this.tw * 0.33, y: this.cy + this.th * 0.33, t: 0 }, { x: this.cx + this.tw * 0.25, y: this.cy - this.th * 0.33, t: 1 }];
        for (const S of spots) {
            const n = this.score[S.t];
            x.save(); x.translate(S.x, S.y);
            // cada 3 tentos num feixe (como se marca no bar): 4 feixes = 12
            for (let k = 0; k < n; k++) {
                const g = Math.floor(k / 3), j = k % 3, px = g * L * 0.62 + j * L * 0.13, py = 0, rot = -0.12 + j * 0.12 + (S.t ? 0.04 : -0.03);
                x.save(); x.translate(px, py); x.rotate(Math.PI / 2 + rot);
                x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(-L / 2 + 1.5, -1.6 + 2, L, 3.2);
                const wood = x.createLinearGradient(0, -1.6, 0, 1.6); wood.addColorStop(0, '#f1d9a6'); wood.addColorStop(1, '#c79a5b');
                x.fillStyle = wood; x.fillRect(-L / 2, -1.6, L, 3.2);
                const hd = x.createRadialGradient(-L / 2, -0.6, 0.5, -L / 2, 0, 4.4); hd.addColorStop(0, '#ff7a5c'); hd.addColorStop(1, '#8f1d12');
                x.fillStyle = hd; x.beginPath(); x.ellipse(-L / 2, 0, 4.2, 3, 0, 0, Math.PI * 2); x.fill();
                x.restore();
            }
            x.font = `800 ${Math.max(11, Math.round(this.cw * 0.14))}px system-ui, sans-serif`; x.fillStyle = S.t === 0 ? 'rgba(187,247,208,0.85)' : 'rgba(254,205,211,0.85)';
            x.textAlign = 'left'; x.fillText(`${this._sideShort(S.t).toUpperCase()} ${n}`, 0, -L * 0.75);
            x.restore();
        }
    },

    _rr(x, X, Y, W, H, R) { x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R); x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath(); },

    // Fundo (pintado uma vez por tamanho de tela): parede escura do bar, a mesa de madeira com o pano, a luz da luminária e os
    // copos, garrafas e o pratinho de amendoim.
    _background() {
        if (this._bg) return this._bg;
        const d = this.dpr, w = this.vw, h = this.vh, c = document.createElement('canvas');
        c.width = Math.round(w * d); c.height = Math.round(h * d);
        const x = c.getContext('2d'); x.scale(d, d);
        // chão / parede
        const bg = x.createRadialGradient(w / 2, h * 0.45, h * 0.1, w / 2, h * 0.5, Math.max(w, h) * 0.8);
        bg.addColorStop(0, '#3a2414'); bg.addColorStop(0.55, '#1c110a'); bg.addColorStop(1, '#070403');
        x.fillStyle = bg; x.fillRect(0, 0, w, h);
        const rng = this._rng(7);
        for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(${rng() < 0.5 ? '255,220,170' : '0,0,0'},${0.015 + rng() * 0.03})`; x.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 1 + rng() * 3); }
        // a mesa
        const tw = this.tw, th = this.th, X = this.cx - tw / 2, Y = this.cy - th / 2, R = Math.min(tw, th) * 0.16;
        x.save(); x.shadowColor = 'rgba(0,0,0,0.75)'; x.shadowBlur = 40; x.shadowOffsetY = 18; x.fillStyle = '#3b2010'; this._rr(x, X, Y, tw, th, R); x.fill(); x.restore();
        // madeira: tábuas com veios
        x.save(); this._rr(x, X, Y, tw, th, R); x.clip();
        const planks = 7, ph = th / planks;
        for (let k = 0; k < planks; k++) {
            const base = ['#7a4a26', '#83502a', '#744523', '#8a5730', '#7d4c27', '#6f4221', '#86532d'][k];
            const g = x.createLinearGradient(0, Y + k * ph, 0, Y + (k + 1) * ph); g.addColorStop(0, this._shade(base, 1.12)); g.addColorStop(1, this._shade(base, 0.82));
            x.fillStyle = g; x.fillRect(X, Y + k * ph, tw, ph);
            x.strokeStyle = 'rgba(30,14,4,0.55)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(X, Y + k * ph + 0.5); x.lineTo(X + tw, Y + k * ph + 0.5); x.stroke();
            for (let v = 0; v < 9; v++) {                                 // veios
                x.strokeStyle = `rgba(${rng() < 0.5 ? '40,20,6' : '160,110,60'},${0.12 + rng() * 0.16})`; x.lineWidth = 0.6 + rng() * 1.1;
                const y0 = Y + k * ph + rng() * ph; x.beginPath(); x.moveTo(X, y0);
                for (let s = 1; s <= 12; s++) x.lineTo(X + (tw * s) / 12, y0 + Math.sin(s * 0.9 + rng() * 2) * ph * 0.06);
                x.stroke();
            }
            for (let n = 0; n < 2; n++) { const kx = X + rng() * tw, ky = Y + k * ph + ph * (0.3 + rng() * 0.4); const kg = x.createRadialGradient(kx, ky, 0, kx, ky, ph * 0.22); kg.addColorStop(0, 'rgba(40,18,6,0.55)'); kg.addColorStop(1, 'rgba(40,18,6,0)'); x.fillStyle = kg; x.beginPath(); x.ellipse(kx, ky, ph * 0.3, ph * 0.12, 0, 0, Math.PI * 2); x.fill(); }
        }
        // marcas de copo e arranhões
        for (let i = 0; i < 6; i++) { x.strokeStyle = 'rgba(30,14,4,0.22)'; x.lineWidth = 2; x.beginPath(); x.arc(X + tw * (0.1 + rng() * 0.8), Y + th * (0.1 + rng() * 0.8), 10 + rng() * 8, 0, Math.PI * (1.2 + rng() * 0.8)); x.stroke(); }
        x.restore();
        // borda envernizada
        x.save(); x.lineWidth = Math.max(6, tw * 0.012); const eg = x.createLinearGradient(0, Y, 0, Y + th); eg.addColorStop(0, '#b77a43'); eg.addColorStop(0.5, '#5a3016'); eg.addColorStop(1, '#2c160a');
        x.strokeStyle = eg; this._rr(x, X + x.lineWidth / 2, Y + x.lineWidth / 2, tw - x.lineWidth, th - x.lineWidth, R); x.stroke(); x.restore();
        // pano verde no meio (o "feltro" do truco), com a costura
        const fw = tw * 0.62, fh = th * 0.62, FX = this.cx - fw / 2, FY = this.cy - fh / 2, FR = Math.min(fw, fh) * 0.18;
        x.save(); x.shadowColor = 'rgba(0,0,0,0.45)'; x.shadowBlur = 14; x.shadowOffsetY = 4;
        const fg = x.createRadialGradient(this.cx, this.cy, 10, this.cx, this.cy, Math.max(fw, fh) * 0.7); fg.addColorStop(0, '#1f7a4a'); fg.addColorStop(1, '#0f4a2c');
        x.fillStyle = fg; this._rr(x, FX, FY, fw, fh, FR); x.fill(); x.restore();
        x.save(); this._rr(x, FX, FY, fw, fh, FR); x.clip();
        for (let i = 0; i < 2200; i++) { x.fillStyle = `rgba(${rng() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + rng() * 0.04})`; x.fillRect(FX + rng() * fw, FY + rng() * fh, 1, 1); }
        x.restore();
        x.setLineDash([5, 4]); x.strokeStyle = 'rgba(232,214,160,0.45)'; x.lineWidth = 1.2; this._rr(x, FX + 7, FY + 7, fw - 14, fh - 14, FR * 0.85); x.stroke(); x.setLineDash([]);
        // brasão no pano
        x.save(); x.globalAlpha = 0.1; x.fillStyle = '#e9d9a0'; x.font = `900 ${Math.round(fh * 0.22)}px Georgia, serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('♣ ♥ ♠ ♦', this.cx, this.cy); x.restore();
        // copos, garrafas e amendoim nos cantos
        this._bottle(x, X + tw * 0.08, Y + th * 0.18, th * 0.11);
        this._glass(x, X + tw * 0.14, Y + th * 0.26, th * 0.055);
        this._glass(x, X + tw * 0.9, Y + th * 0.72, th * 0.055);
        this._bottle(x, X + tw * 0.94, Y + th * 0.82, th * 0.11);
        this._peanuts(x, X + tw * 0.9, Y + th * 0.16, th * 0.07, rng);
        this._ashtray(x, X + tw * 0.07, Y + th * 0.86, th * 0.06);
        // luz da luminária (quente no meio, escuro nos cantos)
        const L = x.createRadialGradient(this.cx, this.cy - th * 0.1, th * 0.1, this.cx, this.cy, Math.max(w, h) * 0.65);
        L.addColorStop(0, 'rgba(255,214,150,0.14)'); L.addColorStop(0.45, 'rgba(255,190,120,0.04)'); L.addColorStop(1, 'rgba(0,0,0,0.55)');
        x.fillStyle = L; x.fillRect(0, 0, w, h);
        return (this._bg = c);
    },
    _rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); },
    _shade(hex, k) { const n = parseInt(hex.slice(1), 16), r = Math.min(255, ((n >> 16) & 255) * k), g = Math.min(255, ((n >> 8) & 255) * k), b = Math.min(255, (n & 255) * k); return `rgb(${r | 0},${g | 0},${b | 0})`; },
    _bottle(x, X, Y, r) {                                                  // garrafa de cerveja (vista de cima, deitada um pouco)
        x.save(); x.translate(X, Y);
        x.fillStyle = 'rgba(0,0,0,0.4)'; x.beginPath(); x.ellipse(r * 0.25, r * 0.3, r * 0.75, r * 0.75, 0, 0, Math.PI * 2); x.fill();
        const g = x.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r * 0.7); g.addColorStop(0, '#d98a2b'); g.addColorStop(0.6, '#7a3f0c'); g.addColorStop(1, '#3a1a04');
        x.fillStyle = g; x.beginPath(); x.arc(0, 0, r * 0.62, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#e8e2d0'; x.beginPath(); x.arc(0, 0, r * 0.3, 0, Math.PI * 2); x.fill();          // rótulo do gargalo
        x.fillStyle = '#c9a227'; x.beginPath(); x.arc(0, 0, r * 0.2, 0, Math.PI * 2); x.fill();           // tampinha
        for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; x.fillStyle = '#8a6a10'; x.beginPath(); x.arc(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2, r * 0.035, 0, Math.PI * 2); x.fill(); }
        x.fillStyle = 'rgba(255,255,255,0.35)'; x.beginPath(); x.ellipse(-r * 0.32, -r * 0.3, r * 0.12, r * 0.06, -0.7, 0, Math.PI * 2); x.fill();
        x.restore();
    },
    _glass(x, X, Y, r) {                                                   // copo americano com cerveja e espuma
        x.save(); x.translate(X, Y);
        x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.arc(r * 0.3, r * 0.35, r * 1.05, 0, Math.PI * 2); x.fill();
        x.strokeStyle = 'rgba(230,240,240,0.7)'; x.lineWidth = r * 0.12;
        const g = x.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r); g.addColorStop(0, '#fff6d8'); g.addColorStop(0.55, '#f2e2b0'); g.addColorStop(1, '#d8b65a');
        x.fillStyle = g; x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.fill(); x.stroke();
        for (let k = 0; k < 9; k++) { x.fillStyle = 'rgba(255,255,255,0.6)'; x.beginPath(); x.arc((Math.sin(k * 2.3) * 0.55) * r, (Math.cos(k * 1.7) * 0.55) * r, r * 0.08, 0, Math.PI * 2); x.fill(); }
        x.restore();
    },
    _peanuts(x, X, Y, r, rng) {
        x.save(); x.translate(X, Y);
        x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.arc(r * 0.25, r * 0.3, r * 1.15, 0, Math.PI * 2); x.fill();
        const g = x.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.1); g.addColorStop(0, '#f4f4f0'); g.addColorStop(1, '#b8b8b0');
        x.fillStyle = g; x.beginPath(); x.arc(0, 0, r * 1.1, 0, Math.PI * 2); x.fill();
        for (let k = 0; k < 16; k++) { const a = rng() * Math.PI * 2, d = rng() * r * 0.75; x.fillStyle = rng() < 0.5 ? '#c98a4a' : '#a8692e'; x.beginPath(); x.ellipse(Math.cos(a) * d, Math.sin(a) * d, r * 0.17, r * 0.11, rng() * 3, 0, Math.PI * 2); x.fill(); }
        x.restore();
    },
    _ashtray(x, X, Y, r) {
        x.save(); x.translate(X, Y);
        x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.arc(r * 0.25, r * 0.3, r * 1.2, 0, Math.PI * 2); x.fill();
        const g = x.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r * 1.2); g.addColorStop(0, '#9fb3c2'); g.addColorStop(1, '#3d4c57');
        x.fillStyle = g; x.beginPath(); x.arc(0, 0, r * 1.2, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#2b3238'; x.beginPath(); x.arc(0, 0, r * 0.82, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#e8e2d0'; x.save(); x.rotate(0.5); x.fillRect(-r * 0.1, -r * 0.08, r * 1.1, r * 0.16); x.fillStyle = '#d07a2a'; x.fillRect(-r * 0.1, -r * 0.08, r * 0.3, r * 0.16); x.restore();
        x.restore();
    },

    // ------------------------------------------------------------------ cartas em HD
    // Cada carta é pintada uma vez, na resolução da tela, num canvas (o cache é refeito quando a tela muda de tamanho).
    _cardImg(c) {
        const key = c ? c.id : 'back', m = this._cards || (this._cards = new Map());
        let img = m.get(key);
        if (img) return img;
        const d = this.dpr * 1.25, W = Math.round(this.cw * d), H = Math.round(this.ch * d);
        img = document.createElement('canvas'); img.width = W; img.height = H;
        const x = img.getContext('2d'); x.scale(W / 100, H / 150);               // a carta é desenhada num quadro de 100 × 150
        if (c) this._paintFace(x, c); else this._paintBack(x);
        m.set(key, img);
        return img;
    },
    _shadowImg() {
        const m = this._cards || (this._cards = new Map());
        let img = m.get('shadow'); if (img) return img;
        const W = Math.round(this.cw * 1.24), H = Math.round(this.ch + this.cw * 0.24), pad = this.cw * 0.12;
        img = document.createElement('canvas'); img.width = W; img.height = H;
        const x = img.getContext('2d'); x.filter = `blur(${Math.max(2, this.cw * 0.045)}px)`; x.fillStyle = '#000';
        this._rr(x, pad, pad, this.cw, this.ch, this.cw * 0.08); x.fill();
        m.set('shadow', img);
        return img;
    },
    _paintBack(x) {
        this._rr(x, 0.5, 0.5, 99, 149, 8); x.fillStyle = '#fbf7ee'; x.fill();
        x.strokeStyle = '#c9bfa6'; x.lineWidth = 0.8; x.stroke();
        const g = x.createLinearGradient(0, 0, 100, 150); g.addColorStop(0, '#b3203a'); g.addColorStop(0.5, '#8e1830'); g.addColorStop(1, '#6a0f22');
        this._rr(x, 6, 6, 88, 138, 5); x.fillStyle = g; x.fill();
        x.save(); this._rr(x, 6, 6, 88, 138, 5); x.clip();
        x.strokeStyle = 'rgba(255,230,200,0.28)'; x.lineWidth = 0.7;
        for (let k = -150; k < 250; k += 7) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + 150, 150); x.stroke(); x.beginPath(); x.moveTo(k + 150, 0); x.lineTo(k, 150); x.stroke(); }
        x.restore();
        x.strokeStyle = 'rgba(255,236,200,0.75)'; x.lineWidth = 1.2; this._rr(x, 10, 10, 80, 130, 4); x.stroke();
        // medalhão central
        x.save(); x.translate(50, 75);
        const mg = x.createRadialGradient(-4, -6, 2, 0, 0, 22); mg.addColorStop(0, '#fff3d6'); mg.addColorStop(1, '#e2c58a');
        x.fillStyle = mg; x.beginPath(); x.ellipse(0, 0, 21, 27, 0, 0, Math.PI * 2); x.fill();
        x.strokeStyle = '#7a1424'; x.lineWidth = 1.4; x.stroke();
        x.fillStyle = '#8e1830';
        this._suit(x, 3, 0, -11, 9); this._suit(x, 2, 0, 11, 9); this._suit(x, 1, -10, 0, 8); this._suit(x, 0, 10, 0, 8);
        x.restore();
    },
    _paintFace(x, c) {
        const red = c.s === 0 || c.s === 2, ink = red ? '#c8102e' : '#16161a', R = this.RANKS[c.r];
        this._rr(x, 0.5, 0.5, 99, 149, 8);
        const g = x.createLinearGradient(0, 0, 100, 150); g.addColorStop(0, '#fffef9'); g.addColorStop(1, '#f1ead9');
        x.fillStyle = g; x.fill(); x.strokeStyle = '#bdb196'; x.lineWidth = 0.9; x.stroke();
        x.strokeStyle = 'rgba(160,140,100,0.35)'; x.lineWidth = 0.5; this._rr(x, 4, 4, 92, 142, 6); x.stroke();
        // cantos: valor e naipe (o de baixo, de ponta-cabeça)
        const corner = () => {
            x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
            x.font = `700 ${R === 'Q' || R === 'J' || R === 'K' ? 21 : 23}px Georgia, "Times New Roman", serif`; x.fillText(R, 12.5, 25);
            this._suit(x, c.s, 12.5, 35, 9, ink);
        };
        corner(); x.save(); x.translate(100, 150); x.rotate(Math.PI); corner(); x.restore();
        if (R === 'J' || R === 'Q' || R === 'K') { this._paintCourt(x, c, R, ink); return; }
        if (R === 'A') {
            const big = c.s === 1 ? 46 : 36;                                  // o ás de espadas, grande e enfeitado (a "espadilha")
            if (c.s === 1) { x.strokeStyle = ink; x.lineWidth = 0.9; for (let k = 0; k < 2; k++) { x.beginPath(); x.ellipse(50, 75, 27 + k * 5, 34 + k * 5, 0, 0, Math.PI * 2); x.stroke(); } }
            this._suit(x, c.s, 50, 75, big, ink);
            return;
        }
        // pips
        const n = +R, L = {
            2: [[50, 34], [50, 116, 1]], 3: [[50, 32], [50, 75], [50, 118, 1]], 4: [[30, 34], [70, 34], [30, 116, 1], [70, 116, 1]],
            5: [[30, 34], [70, 34], [50, 75], [30, 116, 1], [70, 116, 1]], 6: [[30, 34], [70, 34], [30, 75], [70, 75], [30, 116, 1], [70, 116, 1]],
            7: [[30, 34], [70, 34], [50, 54], [30, 75], [70, 75], [30, 116, 1], [70, 116, 1]],
        }[n];
        for (const [px, py, flip] of L) { x.save(); x.translate(px, py); if (flip) x.rotate(Math.PI); this._suit(x, c.s, 0, 0, 19, ink); x.restore(); }
    },
    // Figuras (valete, dama, rei): moldura colorida e a figura espelhada (metade de cima, a de baixo girada), como no baralho de bar.
    _paintCourt(x, c, R, ink) {
        const red = c.s === 0 || c.s === 2;
        const robe = red ? ['#c8102e', '#f2b705', '#1f4fa0'] : ['#1f4fa0', '#f2b705', '#c8102e'];
        x.save();
        this._rr(x, 22, 14, 56, 122, 3); x.fillStyle = '#fbf3dc'; x.fill();
        x.strokeStyle = ink; x.lineWidth = 1.1; x.stroke();
        this._rr(x, 22, 14, 56, 122, 3); x.clip();
        const half = () => {
            // fundo da metade
            x.fillStyle = 'rgba(242,183,5,0.16)'; x.fillRect(22, 14, 56, 61);
            // manto
            x.fillStyle = robe[0]; x.beginPath(); x.moveTo(26, 75); x.quadraticCurveTo(30, 50, 50, 46); x.quadraticCurveTo(70, 50, 74, 75); x.closePath(); x.fill();
            x.fillStyle = robe[1]; x.beginPath(); x.moveTo(44, 75); x.lineTo(50, 50); x.lineTo(56, 75); x.closePath(); x.fill();
            x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 0.6;
            for (let k = 0; k < 5; k++) { x.beginPath(); x.moveTo(30 + k * 2, 74); x.quadraticCurveTo(36 + k * 2, 60, 46, 52); x.stroke(); }
            x.fillStyle = robe[2]; x.fillRect(26, 70, 48, 5);
            // gola
            x.fillStyle = '#fffaf0'; x.beginPath(); x.ellipse(50, 47, 10, 3.4, 0, 0, Math.PI * 2); x.fill(); x.stroke();
            // rosto
            const sk = x.createRadialGradient(48, 34, 1, 50, 36, 10); sk.addColorStop(0, '#fde2c4'); sk.addColorStop(1, '#e5b890');
            x.fillStyle = sk; x.beginPath(); x.ellipse(50, 36, 7.5, 9, 0, 0, Math.PI * 2); x.fill(); x.strokeStyle = 'rgba(80,40,20,0.6)'; x.stroke();
            x.fillStyle = '#2a1a10'; x.beginPath(); x.arc(47.3, 35, 0.9, 0, Math.PI * 2); x.arc(52.7, 35, 0.9, 0, Math.PI * 2); x.fill();
            x.strokeStyle = '#a0402a'; x.lineWidth = 0.8; x.beginPath(); x.arc(50, 39.5, 2.2, 0.2, Math.PI - 0.2); x.stroke();
            if (R === 'K') {                                                // rei: barba, coroa de três pontas e o cetro
                x.fillStyle = '#6b4a2a'; x.beginPath(); x.moveTo(43, 38); x.quadraticCurveTo(50, 50, 57, 38); x.quadraticCurveTo(50, 44, 43, 38); x.fill();
                x.fillStyle = '#f2b705'; x.beginPath(); x.moveTo(42, 29); x.lineTo(42, 21); x.lineTo(46, 25); x.lineTo(50, 18); x.lineTo(54, 25); x.lineTo(58, 21); x.lineTo(58, 29); x.closePath(); x.fill();
                x.strokeStyle = '#8a5a00'; x.lineWidth = 0.7; x.stroke();
                x.fillStyle = '#c8102e'; x.beginPath(); x.arc(50, 25.5, 1.4, 0, Math.PI * 2); x.fill();
                x.strokeStyle = '#8a5a00'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(64, 74); x.lineTo(68, 40); x.stroke();
                x.fillStyle = '#f2b705'; x.beginPath(); x.arc(68, 39, 2.6, 0, Math.PI * 2); x.fill();
            } else if (R === 'Q') {                                         // dama: cabelo, tiara e uma flor
                x.fillStyle = '#4a2a14'; x.beginPath(); x.ellipse(50, 33, 9.5, 8, 0, Math.PI, 0); x.fill();
                x.beginPath(); x.moveTo(41, 33); x.quadraticCurveTo(39, 44, 43, 48); x.lineTo(44, 36); x.fill(); x.beginPath(); x.moveTo(59, 33); x.quadraticCurveTo(61, 44, 57, 48); x.lineTo(56, 36); x.fill();
                x.fillStyle = '#f2b705'; x.beginPath(); x.moveTo(43, 27); x.quadraticCurveTo(50, 20, 57, 27); x.lineTo(55, 28.5); x.quadraticCurveTo(50, 24, 45, 28.5); x.closePath(); x.fill();
                x.fillStyle = robe[2]; x.beginPath(); x.arc(50, 23.5, 1.4, 0, Math.PI * 2); x.fill();
                for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; x.fillStyle = '#c8102e'; x.beginPath(); x.arc(33 + Math.cos(a) * 2.4, 60 + Math.sin(a) * 2.4, 1.8, 0, Math.PI * 2); x.fill(); }
                x.fillStyle = '#f2b705'; x.beginPath(); x.arc(33, 60, 1.3, 0, Math.PI * 2); x.fill();
                x.strokeStyle = '#2f7a40'; x.lineWidth = 0.9; x.beginPath(); x.moveTo(33, 62); x.lineTo(35, 74); x.stroke();
            } else {                                                         // valete: chapéu com pena e a espada/lança
                x.fillStyle = '#5a3416'; x.beginPath(); x.ellipse(50, 30, 9, 4, 0, Math.PI, 0); x.fill();
                x.fillStyle = robe[0]; x.beginPath(); x.ellipse(50, 27, 11, 3.6, -0.08, 0, Math.PI * 2); x.fill(); x.fillRect(43, 20, 14, 7);
                x.strokeStyle = '#f2b705'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(56, 22); x.quadraticCurveTo(66, 12, 70, 20); x.stroke();
                x.strokeStyle = '#7c7c86'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(33, 74); x.lineTo(30, 38); x.stroke();
                x.fillStyle = '#c0c0c8'; x.beginPath(); x.moveTo(30, 33); x.lineTo(28, 39); x.lineTo(32, 39); x.closePath(); x.fill();
            }
        };
        half();
        x.save(); x.translate(100, 150); x.rotate(Math.PI); half(); x.restore();
        x.strokeStyle = ink; x.lineWidth = 0.6; x.beginPath(); x.moveTo(22, 75); x.lineTo(78, 75); x.stroke();
        x.restore();
        // naipe pequeno no canto da moldura (como nas cartas de verdade)
        this._suit(x, c.s, 72, 22, 8, ink);
        x.save(); x.translate(100, 150); x.rotate(Math.PI); this._suit(x, c.s, 72, 22, 8, ink); x.restore();
    },
    // Naipes em curvas (sem fonte): 0 ♦ ouros · 1 ♠ espadas · 2 ♥ copas · 3 ♣ paus. (x, y) = centro, s = altura.
    _suit(x, s, X, Y, S, col) {
        const red = s === 0 || s === 2;
        x.save(); x.translate(X, Y); x.scale(S / 20, S / 20);
        x.fillStyle = col || (red ? '#c8102e' : '#16161a');
        x.beginPath();
        if (s === 0) { x.moveTo(0, -10); x.quadraticCurveTo(5, -4, 8, 0); x.quadraticCurveTo(5, 4, 0, 10); x.quadraticCurveTo(-5, 4, -8, 0); x.quadraticCurveTo(-5, -4, 0, -10); }
        else if (s === 2) { x.moveTo(0, 9); x.bezierCurveTo(-3, 5, -10, 1, -10, -4); x.bezierCurveTo(-10, -9, -3, -10, 0, -5); x.bezierCurveTo(3, -10, 10, -9, 10, -4); x.bezierCurveTo(10, 1, 3, 5, 0, 9); }
        else if (s === 1) {
            x.moveTo(0, -10); x.bezierCurveTo(3, -5, 10, -2, 10, 3); x.bezierCurveTo(10, 7, 5, 8, 1.5, 5); x.quadraticCurveTo(2, 8, 4, 10); x.lineTo(-4, 10); x.quadraticCurveTo(-2, 8, -1.5, 5);
            x.bezierCurveTo(-5, 8, -10, 7, -10, 3); x.bezierCurveTo(-10, -2, -3, -5, 0, -10);
        } else {
            x.arc(0, -4.8, 4.6, 0, Math.PI * 2); x.moveTo(-1, 1); x.arc(-4.8, 1.6, 4.6, 0, Math.PI * 2); x.moveTo(9.4, 1.6); x.arc(4.8, 1.6, 4.6, 0, Math.PI * 2);
            x.moveTo(-1.4, 2); x.quadraticCurveTo(-1, 7, -4, 10); x.lineTo(4, 10); x.quadraticCurveTo(1, 7, 1.4, 2); x.closePath();
        }
        x.fill();
        x.restore();
    },
};
