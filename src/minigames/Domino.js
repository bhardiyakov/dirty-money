// ============================================================================
// Domino — dominó de bar em DUPLA (você e um parceiro da casa contra uma dupla), apostado. Mini-jogo em "outro mundo".
//   • 28 pedras (duplo-seis), 7 para cada um. A primeira mão abre com o duplo-seis; as outras, quem ganhou a anterior. Jogo no
//     sentido anti-horário; quem não tem pedra que encaixe numa das pontas PASSA ("toque").
//   • Batida (alguém acabou as pedras): a dupla dele marca a soma das pedras que sobraram na mão dos dois adversários. Mão
//     FECHADA (ninguém consegue jogar): ganha a dupla com menos pontos na mão e marca os da outra. Quem fizer 50 leva a aposta.
//   • IA: joga a pedra que mais ajuda — tira as pedras pesadas e as buchas (duplas) cedo, segura a ponta que o parceiro tem,
//     e LEMBRA de quem passou em qual número para fechar as pontas dele. Os melhores contam as pedras que já saíram.
//   • Desenho em HD: pedras de marfim com pintas (pintadas uma vez, na resolução da tela), a fila que serpenteia na mesa
//     (as buchas atravessadas), a pedra que desliza da mão até a ponta, a mesa de bar do truco.
// ============================================================================

const Domino = {
    active: false,
    GOAL: 50,
    STAKES: [
        { bet: 100, name: 'Os aposentados da praça', lvl: 0, desc: 'Jogam devagar e esquecem quem passou.' },
        { bet: 600, name: 'Dupla do boteco', lvl: 1, desc: 'Sabem tirar as pedras grandes cedo.' },
        { bet: 3000, name: 'Os campeões do bairro', lvl: 2, desc: 'Contam as pedras e fecham a sua ponta.' },
        { bet: 12000, name: 'Mesa dos bicheiros', lvl: 3, desc: 'Não erram uma. Dizem que leem pensamento.' },
    ],
    NOISE: [0.35, 0.18, 0.06, 0.0],

    open(game, shop) {
        if (this.active) return;
        this.g = game; this.shop = shop; this.active = true; this.phase = 'setup';
        for (const k of ['_rr', '_rng', '_shade', '_bottle', '_glass', '_peanuts', '_ashtray', '_background']) this[k] = Truco[k];
        this._build();
        this.root.style.display = 'block';
        this._resize();
        this._setup();
        this._last = performance.now();
        const loop = (t) => { if (!this.active) return; this._frame(Math.min(0.05, (t - this._last) / 1000)); this._last = t; this._raf = requestAnimationFrame(loop); };
        this._raf = requestAnimationFrame(loop);
    },
    close() {
        this.active = false; this._gen = (this._gen || 0) + 1;
        cancelAnimationFrame(this._raf);
        if (this.root) this.root.style.display = 'none';
        const g = this.g; if (g) { g.input.justPressed = {}; if (g.input.keys) for (const k of Object.keys(g.input.keys)) g.input.keys[k] = false; }
    },

    _build() {
        if (this.root) return;
        const st = document.createElement('style');
        st.textContent = `
            #domino { position: fixed; inset: 0; z-index: 90; display: none; background: #0b0705; font-family: var(--font); color: var(--tx); user-select: none; }
            #domino canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
            #domino .do-top { position: absolute; left: 16px; top: 16px; display: flex; gap: 8px; pointer-events: none; }
            #domino .do-chip { padding: 8px 14px; border-radius: 16px; background: var(--glass); border: 1px solid var(--line-2); text-align: center; min-width: 80px; }
            #domino .do-chip b { display: block; font: 800 18px var(--font-d); } #domino .do-chip small { font-size: 11px; color: var(--tx-2); }
            #domino .do-chip.us b { color: #86efac; } #domino .do-chip.them b { color: #fda4af; }
            #domino .do-quit { position: absolute; left: 16px; bottom: 16px; }
            #domino .do-help { position: absolute; right: 16px; bottom: 20px; font-size: 12px; color: var(--tx-3); }
            #domino .do-modal { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(5,4,3,0.55); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); padding: 16px; }
            #domino .do-box { width: min(560px, 96vw); max-height: 94vh; overflow: auto; padding: 22px 24px; border-radius: 22px; background: var(--glass-2); border: 1px solid var(--line-2); box-shadow: var(--shadow); text-align: center; }
            #domino .do-box h2 { font: 800 26px var(--font-d); margin-bottom: 4px; } #domino .do-box p { font-size: 13px; color: var(--tx-2); line-height: 1.5; margin-bottom: 10px; }
            #domino .do-opt { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 11px 14px; margin-top: 8px; border-radius: 14px; cursor: pointer; background: var(--card); border: 1px solid var(--line-2); color: var(--tx); font: inherit; }
            #domino .do-opt:hover:not([disabled]) { border-color: var(--gold); background: var(--card-h); } #domino .do-opt[disabled] { opacity: 0.4; cursor: not-allowed; }
            #domino .do-opt .t { flex: 1; } #domino .do-opt b { font: 700 15px var(--font-d); } #domino .do-opt small { display: block; font-size: 12px; color: var(--tx-2); }
            #domino .do-opt .v { font: 800 16px var(--font-d); color: #86efac; text-align: right; }
            #domino .do-big { font: 800 40px var(--font-d); margin: 4px 0; }`;
        document.head.appendChild(st);
        const r = this.root = document.createElement('div');
        r.id = 'domino';
        r.innerHTML = `<canvas></canvas><div class="do-top"><div class="do-chip us" id="doUs"></div><div class="do-chip" id="doPot"></div><div class="do-chip them" id="doThem"></div></div>
            <button class="ui-btn do-quit" id="doQuit">Sair</button><div class="do-help" id="doHelp"></div><div class="do-modal" id="doModal"></div>`;
        document.body.appendChild(r);
        this.cv = r.querySelector('canvas'); this.ctx = this.cv.getContext('2d');
        this.$ = (id) => document.getElementById(id);
        this._emoji = (getComputedStyle(document.documentElement).getPropertyValue('--emoji') || '').trim() || 'sans-serif';
        window.addEventListener('resize', () => { if (this.active) this._resize(); });
        this.$('doQuit').onclick = () => this._quit();
        this.cv.addEventListener('pointermove', (e) => { const r2 = this.cv.getBoundingClientRect(); this.mouse = { x: e.clientX - r2.left, y: e.clientY - r2.top }; });
        this.cv.addEventListener('pointerdown', (e) => { const r2 = this.cv.getBoundingClientRect(); this._click(e.clientX - r2.left, e.clientY - r2.top); });
        window.addEventListener('keydown', (e) => { if (!this.active) return; e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); this._quit(); } }, true);
    },
    _resize() {
        const dpr = Math.min(2.5, window.devicePixelRatio || 1), w = window.innerWidth, h = window.innerHeight;
        this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); this.dpr = dpr; this.vw = w; this.vh = h;
        this.cw = Math.round(Math.max(58, Math.min(132, Math.min(h * 0.145, w * 0.11)))); this.ch = this.cw * 1.5;
        this.tw = Math.min(w - 24, h * 1.62); this.th = Math.min(h - 110, this.tw * 0.6);
        this.cx = w / 2; this.cy = 40 + (h - 40) / 2 - 30;
        this.T = Math.round(Math.max(18, Math.min(34, this.th * 0.055)));       // meia pedra (quadrado de um número), em px
        this._bg = null; this._tiles = new Map();
        if (this.chain) this._layout();
    },

    // ------------------------------------------------------------------ mesa
    _setup() {
        this.phase = 'setup'; this.hands = null; this.chain = null;
        const cash = this.g.inventory.cash, M = this.$('doModal');
        M.style.display = 'flex';
        M.innerHTML = `<div class="do-box"><h2>🁣 Dominó em dupla</h2><p>${this.shop ? this.shop.name + ' · ' : ''}Você e um parceiro da casa contra uma dupla. Batida: marca a soma da mão dos adversários. Fechou: ganha quem tem menos. Até ${this.GOAL} pontos.<br>Você tem <b style="color:#86efac">${brl(cash)}</b>.</p>
            ${this.STAKES.map((o, i) => `<button class="do-opt" data-i="${i}" ${cash < o.bet ? 'disabled' : ''}><span class="t"><b>${o.name} · ${'★'.repeat(i + 1)}</b><small>${o.desc}</small></span><span class="v">${brl(o.bet)}<small style="display:block;color:var(--tx-3)">prêmio ${brl(o.bet * 2)}</small></span></button>`).join('')}
            <div style="margin-top:14px"><button class="ui-btn" id="doLeave">Voltar ao bar</button></div></div>`;
        this.$('doLeave').onclick = () => this.close();
        for (const b of M.querySelectorAll('.do-opt')) b.onclick = () => this._start(+b.dataset.i);
        this._hud();
    },
    _start(lvl) {
        const o = this.STAKES[lvl], inv = this.g.inventory;
        if (inv.cash < o.bet) return;
        inv.cash -= o.bet;
        this.lvl = lvl; this.bet = o.bet; this.score = [0, 0]; this.lastWinner = null;
        const names = (typeof BarGames !== 'undefined' ? BarGames.NAMES : [['Zé', '🧔'], ['Tião', '👨‍🦳'], ['Bira', '👨‍🦲']]).slice().sort(() => Math.random() - 0.5);
        this.people = [{ name: 'Você', emo: '🙂' }, { name: names[0][0], emo: names[0][1] }, { name: names[1][0], emo: names[1][1] }, { name: names[2][0], emo: names[2][1] }];
        this.$('doModal').style.display = 'none';
        this.phase = 'play';
        const gen = this._gen = (this._gen || 0) + 1;
        this._match(gen).catch((e) => { if (e !== this.CANCEL) console.error('[DOMINÓ]', e); });
        this._hud();
        AudioFX.blip(520, 0.08, 0.15);
    },
    CANCEL: { cancel: true },
    _sleep(gen, ms) { return new Promise((ok, no) => setTimeout(() => (gen === this._gen && this.active ? ok() : no(this.CANCEL)), ms)); },
    _team(i) { return i % 2; },

    async _match(gen) {
        while (this.score[0] < this.GOAL && this.score[1] < this.GOAL) await this._hand(gen);
        this._end(this.score[0] >= this.GOAL ? 0 : 1);
    },

    async _hand(gen) {
        // embaralha e dá 7 para cada um
        const all = []; for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) all.push({ a, b });
        for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
        this.hands = [0, 1, 2, 3].map((i) => all.slice(i * 7, i * 7 + 7));
        this.hands.forEach((h) => h.sort((p, q) => (p.a + p.b) - (q.a + q.b)));
        this.chain = []; this.ends = null; this.passes = [new Set(), new Set(), new Set(), new Set()]; this.played = []; this.fly = null; this.msg = '';
        this.shuffleT = 1.1; this._hud();
        await this._sleep(gen, 1200);
        let turn;
        if (this.lastWinner == null) { turn = this.hands.findIndex((h) => h.some((t) => t.a === 6 && t.b === 6)); this.msg = `${this.people[turn].name} sai com o duplo-seis`; }
        else turn = this.lastWinner;
        let passRun = 0, first = this.lastWinner == null;
        while (true) {
            this.turn = turn; this._hud();
            const moves = this._moves(turn);
            if (first) { const k = this.hands[turn].findIndex((t) => t.a === 6 && t.b === 6); moves.length = 0; moves.push({ k, side: 'r' }); first = false; }
            if (!moves.length) {
                passRun++;
                if (this.ends) { this.passes[turn].add(this.ends[0]); this.passes[turn].add(this.ends[1]); }
                this._say(turn, this._pick(['Passo.', 'Toque!', 'Não tenho…', 'Passou.']));
                AudioFX.blip(260, 0.06, 0.08);
                await this._sleep(gen, 750);
                if (passRun >= 4) return this._close(gen);
            } else {
                passRun = 0;
                const mv = turn === 0 ? await this._human(gen, moves) : (await this._sleep(gen, 650 + Math.random() * 600), this._ai(turn, moves));
                await this._play(gen, turn, mv);
                if (!this.hands[turn].length) return this._batida(gen, turn);
            }
            turn = (turn + 1) % 4;
        }
    },
    _pick(a) { return a[Math.floor(Math.random() * a.length)]; },
    _fits(t, n) { return t.a === n || t.b === n; },
    _moves(i) {
        const H = this.hands[i], out = [];
        if (!this.ends) { H.forEach((t, k) => out.push({ k, side: 'r' })); return out; }
        H.forEach((t, k) => {
            if (this._fits(t, this.ends[0])) out.push({ k, side: 'l' });
            if (this._fits(t, this.ends[1]) && !(this.ends[0] === this.ends[1] && this._fits(t, this.ends[0]))) out.push({ k, side: 'r' });
        });
        return out;
    },
    // IA: pontua cada jogada — pedra pesada e bucha saem cedo, fecha o número em que o adversário passou, abre o que o parceiro tem
    // (os bons contam quantas pedras de cada número ainda faltam sair).
    _ai(i, moves) {
        const lv = this.STAKES[this.lvl].lvl, noise = this.NOISE[lv], H = this.hands[i];
        const opp = [(i + 1) % 4, (i + 3) % 4], mate = (i + 2) % 4;
        let best = moves[0], bs = -1e9;
        for (const m of moves) {
            const t = H[m.k], end = this.ends ? (m.side === 'l' ? this.ends[0] : this.ends[1]) : t.a, out = t.a === end ? t.b : t.a;
            const other = this.ends ? (m.side === 'l' ? this.ends[1] : this.ends[0]) : t.b;
            let s = (t.a + t.b) * 0.5 + (t.a === t.b ? 3 : 0);
            if (lv >= 1) { for (const o of opp) { if (this.passes[o].has(out)) s += 4; if (this.passes[o].has(other)) s += 1.5; } if (this.passes[mate].has(out)) s -= 3; }
            if (lv >= 2) {                                                // conta: quantas pedras com `out` ainda estão fora da mesa e da minha mão
                const seen = this.chain.filter((c) => c.t.a === out || c.t.b === out).length + H.filter((q) => q !== t && (q.a === out || q.b === out)).length;
                s += (7 - seen) < 2 ? 3 : 0;                               // quase ninguém mais tem: ponta morta para eles
                s += H.filter((q) => q !== t && (q.a === out || q.b === out)).length * 1.5;     // fico com o controle desse número
            }
            s += (Math.random() - 0.5) * noise * 20;
            if (s > bs) { bs = s; best = m; }
        }
        return best;
    },
    _human(gen, moves) {
        this.want = { moves, pick: null };
        this.$('doHelp').textContent = 'Sua vez: clique numa pedra que encaixe (as que servem brilham)';
        return new Promise((ok, no) => { this.want.done = (m) => { this.want = null; this.$('doHelp').textContent = ''; if (gen !== this._gen) return no(this.CANCEL); ok(m); }; });
    },
    _click(x, y) {
        const W = this.want; if (!W) return;
        if (W.pick != null) {                                          // escolhendo a ponta (a pedra serve nas duas)
            for (const s of ['l', 'r']) { const P = this._endSpot(s); if (P && Math.hypot(P.x - x, P.y - y) < this.T * 1.6) { const m = W.moves.find((q) => q.k === W.pick && q.side === s); if (m) return W.done(m); } }
            W.pick = null;
        }
        const k = this._handHit(x, y); if (k < 0) return;
        const ms = W.moves.filter((m) => m.k === k);
        if (!ms.length) { this.msg = 'Essa pedra não encaixa em nenhuma ponta'; return; }
        if (ms.length === 1) W.done(ms[0]); else W.pick = k;
    },

    async _play(gen, i, m) {
        const t = this.hands[i].splice(m.k, 1)[0], from = this._handXY(i, m.k, this.hands[i].length + 1);
        let link;
        if (!this.ends) { link = { t, a: t.a, b: t.b }; this.chain.push(link); this.ends = [t.a, t.b]; this.root0 = link; }
        else if (m.side === 'l') { const e = this.ends[0], a = t.a === e ? t.b : t.a; link = { t, a, b: e }; this.chain.unshift(link); this.ends[0] = a; }
        else { const e = this.ends[1], b = t.a === e ? t.b : t.a; link = { t, a: e, b }; this.chain.push(link); this.ends[1] = b; }
        this._layout();
        link.fly = { x: from.x, y: from.y, r: from.r, t: 0 };
        this.played.push({ i, t });
        if (t.a === t.b && Math.random() < 0.5) this._say(i, this._pick(['Bucha!', 'Lá vai a bucha.', `Duplo-${t.a}!`]));
        AudioFX._burst && AudioFX._burst(AudioFX.listener.x, AudioFX.listener.z, { vol: 0.32, dur: 0.07, f0: 3600, f1: 900, type: 'bandpass', q: 1.2, maxDist: 1e9 });
        await this._sleep(gen, 420);
    },
    async _batida(gen, i) {
        const T = this._team(i), pts = [0, 1, 2, 3].filter((j) => this._team(j) !== T).reduce((s, j) => s + this._sum(j), 0);
        this._say(i, this._pick(['Bati!', 'BATI! Conta aí!', 'Acabou!']), 1800);
        this.msg = `${this.people[i].name} bateu! ${T === 0 ? 'Vocês marcam' : 'Eles marcam'} ${pts} pontos.`;
        this.score[T] += pts; this.lastWinner = i;
        AudioFX.blip(T === 0 ? 880 : 240, 0.16, 0.15);
        this.reveal = true; this._hud();
        await this._sleep(gen, 2600); this.reveal = false;
    },
    async _close(gen) {
        const s = [this._sum(0) + this._sum(2), this._sum(1) + this._sum(3)];
        const T = s[0] === s[1] ? null : s[0] < s[1] ? 0 : 1;
        this.msg = T == null ? `Fechou empatado (${s[0]} × ${s[1]}): ninguém marca.` : `Fechou! ${T === 0 ? 'Vocês têm menos' : 'Eles têm menos'} (${s[0]} × ${s[1]}) e marcam ${s[1 - T]}.`;
        if (T != null) { this.score[T] += s[1 - T]; this.lastWinner = T === 0 ? 0 : 1; }
        this.reveal = true; this._hud();
        await this._sleep(gen, 2800); this.reveal = false;
    },
    _sum(i) { return this.hands[i].reduce((s, t) => s + t.a + t.b, 0); },
    _say(i, text, ms = 1500) { this.bubble = { i, text, t: performance.now(), ms }; },

    _hud() {
        const playing = this.phase === 'play';
        this.$('doUs').innerHTML = `<b>${this.score ? this.score[0] : 0}</b><small>nós</small>`;
        this.$('doThem').innerHTML = `<b>${this.score ? this.score[1] : 0}</b><small>eles</small>`;
        this.$('doPot').innerHTML = `<b style="color:#86efac">${brl((this.bet || 0) * 2)}</b><small>até ${this.GOAL}</small>`;
        this.$('doUs').parentElement.style.visibility = playing ? 'visible' : 'hidden';
        this.$('doQuit').textContent = playing ? 'Desistir' : 'Sair';
    },
    _quit() {
        if (this.phase !== 'play') { this.close(); return; }
        if (!this._qT || performance.now() - this._qT > 2500) { this._qT = performance.now(); this.msg = 'Desistir perde a aposta — clique/ESC de novo para confirmar'; return; }
        this._gen++; this.want = null; this._end(1, true);
    },
    _end(T, quit = false) {
        this.phase = 'end'; this._hud();
        const won = T === 0;
        if (won) { this.g.inventory.cash += this.bet * 2; AudioFX.blip(880, 0.12, 0.2); setTimeout(() => AudioFX.blip(1320, 0.18, 0.2), 140); }
        else AudioFX.blip(160, 0.35, 0.2);
        if (typeof WorldMemory !== 'undefined') WorldMemory.onGame('domino', this.shop, this.STAKES[this.lvl].name, won, this.bet);
        const M = this.$('doModal'); M.style.display = 'flex';
        M.innerHTML = `<div class="do-box"><div style="font-family:var(--emoji);font-size:44px">${won ? '🏆' : '🁣'}</div>
            <div class="do-big" style="color:${won ? '#86efac' : '#fb7185'}">${won ? 'Vocês venceram!' : quit ? 'Você desistiu' : 'Vocês perderam'}</div>
            <p>${quit ? '' : `Placar: <b>${this.score[0]} × ${this.score[1]}</b>. `}${won ? `Prêmio: <b style="color:#86efac">+${brl(this.bet * 2)}</b>` : `A aposta de ${brl(this.bet)} ficou na mesa.`}</p>
            <button class="ui-btn pri" id="doAgain">Jogar de novo</button> <button class="ui-btn" id="doBack">Voltar ao bar</button></div>`;
        this.$('doAgain').onclick = () => this._setup();
        this.$('doBack').onclick = () => this.close();
    },

    // ------------------------------------------------------------------ a fila na mesa (serpenteia)
    // A partir da pedra de saída, a ponta direita anda para a direita e a esquerda para a esquerda; chegando perto da borda do
    // pano, dobram (a direita desce e volta; a esquerda sobe e volta). Buchas (duplas) atravessadas.
    _layout() {
        const T = this.T, L = 2 * T, lim = this.tw * 0.31, rowH = 2 * T + 8, i0 = this.chain.indexOf(this.root0), R0 = this.root0;
        R0.x = this.cx; R0.y = this.cy; R0.vert = R0.t.a === R0.t.b; R0.dir = 1; R0.flip = false;
        const half = (R0.vert ? T : L) / 2 + 2;
        // ramo direito (índices maiores) anda para a direita e desce nas voltas; o esquerdo, para a esquerda e sobe
        const go = (list, dir, rightBranch) => {
            let x = this.cx + dir * half, y = this.cy, dx = dir;
            for (const c of list) {
                const w = c.t.a === c.t.b ? T : L;
                if (dx > 0 ? x + w > this.cx + lim : x - w < this.cx - lim) { y += dir * rowH; dx = -dx; }
                c.x = x + dx * w / 2; c.y = y; c.vert = c.t.a === c.t.b; c.dir = dx;
                c.flip = rightBranch !== (dx > 0);                       // (o número que encosta na vizinha fica do lado dela)
                x += dx * (w + 2);
            }
        };
        go(this.chain.slice(i0 + 1), 1, true);
        go(this.chain.slice(0, i0).reverse(), -1, false);
    },
    _endSpot(side) {
        if (!this.chain || !this.chain.length) return null;
        const c = side === 'l' ? this.chain[0] : this.chain[this.chain.length - 1], T = this.T;
        const dir = c === this.root0 ? (side === 'l' ? -1 : 1) : c.dir;
        return { x: c.x + dir * (c.vert ? T : 2 * T), y: c.y };
    },

    // ------------------------------------------------------------------ as mãos
    _seatXY(i) {
        const cx = this.cx, cy = this.cy, tw = this.tw, th = this.th;
        return [{ x: cx, y: this.vh - this.T * 2.6 }, { x: cx + tw / 2 - 40, y: cy }, { x: cx, y: cy - th / 2 + 4 }, { x: cx - tw / 2 + 40, y: cy }][i];
    },
    _handXY(i, k, n) {
        const S = this._seatXY(i), T = this.T, o = k - (n - 1) / 2;
        if (i === 0) return { x: S.x + o * T * 1.25, y: S.y, r: 0, s: 1.25 };
        if (i === 2) return { x: S.x + o * T * 0.8 + T * 3, y: S.y + 6, r: 0, s: 0.75 };
        return { x: S.x + (i === 1 ? -T * 1.6 : T * 1.6), y: S.y + o * T * 0.8 + T * 2.2, r: Math.PI / 2, s: 0.75 };
    },
    _handHit(x, y) {
        if (!this.hands) return -1;
        const H = this.hands[0], T = this.T;
        for (let k = 0; k < H.length; k++) { const P = this._handXY(0, k, H.length); if (Math.abs(x - P.x) < T * 0.62 * P.s && Math.abs(y - P.y) < T * 1.05 * P.s) return k; }
        return -1;
    },

    // ------------------------------------------------------------------ desenho
    _frame(dt) {
        const x = this.ctx, d = this.dpr;
        x.setTransform(d, 0, 0, d, 0, 0);
        x.drawImage(this._background(), 0, 0, this.vw, this.vh);
        if (this.phase === 'setup' || !this.hands) return;
        const T = this.T, time = performance.now() / 1000;
        // embaralhando: as pedras viradas girando no meio da mesa
        if (this.shuffleT > 0) {
            this.shuffleT -= dt;
            for (let k = 0; k < 28; k++) { const a = k * 2.4 + time * (1.6 + (k % 3) * 0.3), r = T * (1.2 + (k % 5) * 0.6); this._tile(x, this.cx + Math.cos(a) * r * 1.6, this.cy + Math.sin(a) * r, a, null, 1, false); }
        }
        // a fila (cada pedra nova desliza da mão até o lugar)
        for (const c of this.chain || []) {
            let px = c.x, py = c.y, r = c.vert ? 0 : -Math.PI / 2;            // (bucha em pé, atravessada na fila; as outras deitadas)
            if (c.fly && c.fly.t < 1) {
                c.fly.t = Math.min(1, c.fly.t + dt / 0.38); const e = 1 - Math.pow(1 - c.fly.t, 3);
                px = c.fly.x + (c.x - c.fly.x) * e; py = c.fly.y + (c.y - c.fly.y) * e - Math.sin(e * Math.PI) * T * 1.2; r = c.fly.r + (r - c.fly.r) * e;
            }
            this._tile(x, px, py, r, c.vert || !c.flip ? [c.a, c.b] : [c.b, c.a], 1, false);
        }
        // pontas: quando a sua pedra serve nas duas, as duas pontas piscam
        if (this.want && this.want.pick != null) for (const s of ['l', 'r']) { const P = this._endSpot(s); if (P) { x.strokeStyle = `rgba(253,224,71,${0.5 + 0.4 * Math.sin(time * 6)})`; x.lineWidth = 3; x.beginPath(); x.arc(P.x, P.y, T * 0.95, 0, Math.PI * 2); x.stroke(); } }
        // as mãos (a sua aberta embaixo; as outras viradas, ou abertas no fim da mão)
        for (let i = 0; i < 4; i++) {
            const H = this.hands[i];
            H.forEach((t, k) => {
                const P = this._handXY(i, k, H.length), can = i === 0 && this.want && this.want.moves.some((m) => m.k === k), sel = this.want && this.want.pick === k;
                const up = (i === 0) || this.reveal;
                this._tile(x, P.x, P.y - (sel ? T * 0.4 : can ? T * 0.15 : 0), P.r, up ? [t.a, t.b] : null, P.s, can || sel);
            });
            if (i !== 0) this._avatar(x, i, time);
        }
        // balão e mensagem
        const B = this.bubble;
        if (B && performance.now() - B.t < B.ms) {
            const S = B.i === 0 ? { x: this.cx - T * 6, y: this.vh - T * 5 } : this._seatXY(B.i);
            x.save(); x.font = '800 15px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
            const tw = x.measureText(B.text).width + 22, by = B.i === 2 ? S.y + 44 : S.y - 44;
            x.fillStyle = '#fffaf0'; this._rr(x, S.x - tw / 2, by - 15, tw, 30, 15); x.fill(); x.fillStyle = '#1f1308'; x.fillText(B.text, S.x, by + 1); x.restore();
        }
        if (this.msg) {
            x.save(); x.font = '600 14px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
            const tw = Math.min(this.vw - 24, x.measureText(this.msg).width + 36), y = this.cy - this.th * 0.36;
            x.fillStyle = 'rgba(16,13,10,0.85)'; this._rr(x, this.cx - tw / 2, y - 16, tw, 32, 16); x.fill();
            x.fillStyle = '#f5efe3'; x.fillText(this.msg, this.cx, y + 0.5, tw - 20); x.restore();
        }
    },
    _avatar(x, i, time) {
        const S = this._seatXY(i), r = Math.max(20, this.cw * 0.28), on = this.turn === i && this.phase === 'play';
        x.save();
        x.fillStyle = this._team(i) === 0 ? '#1f4d3a' : '#4d1f2a'; x.beginPath(); x.arc(S.x, S.y, r, 0, Math.PI * 2); x.fill();
        x.lineWidth = on ? 3 : 1.5; x.strokeStyle = on ? `rgba(253,224,71,${0.7 + 0.3 * Math.sin(time * 6)})` : 'rgba(255,255,255,0.3)'; x.stroke();
        x.font = `${Math.round(r * 1.15)}px ${this._emoji}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(this.people[i].emo, S.x, S.y + r * 0.05);
        x.font = '700 12px system-ui, sans-serif'; x.fillStyle = this._team(i) === 0 ? '#bbf7d0' : '#fecdd3';
        x.fillText(this.people[i].name + (i === 2 ? ' (parceiro)' : ''), S.x, i === 2 ? S.y - r - 10 : S.y + r + 12);
        x.restore();
    },
    // Uma pedra: em pé (r = 0: o número a em cima), girada por r. faces = [a, b] ou null (virada).
    _tile(x, X, Y, r, faces, s, glow) {
        const T = this.T * s, img = this._tileImg(faces);
        x.save(); x.translate(X, Y); x.rotate(r);
        x.fillStyle = 'rgba(0,0,0,0.35)'; this._rr(x, -T / 2 + 2, -T + 3, T, 2 * T, T * 0.14); x.fill();
        x.drawImage(img, -T / 2, -T, T, 2 * T);
        if (glow) { x.strokeStyle = 'rgba(134,239,172,0.95)'; x.lineWidth = 2.5; this._rr(x, -T / 2 - 1, -T - 1, T + 2, 2 * T + 2, T * 0.16); x.stroke(); }
        x.restore();
    },
    _tileImg(faces) {
        const key = faces ? faces.join('') : 'back', m = this._tiles || (this._tiles = new Map());
        let img = m.get(key); if (img) return img;
        const d = this.dpr * 1.6, W = Math.round(this.T * d), H = W * 2;
        img = document.createElement('canvas'); img.width = W; img.height = H;
        const x = img.getContext('2d'); x.scale(W / 50, H / 100);
        this._rr(x, 0.5, 0.5, 49, 99, 7);
        if (!faces) { const g = x.createLinearGradient(0, 0, 50, 100); g.addColorStop(0, '#2f3b4a'); g.addColorStop(1, '#141b24'); x.fillStyle = g; x.fill(); x.strokeStyle = '#0a0e14'; x.lineWidth = 1; x.stroke();
            x.strokeStyle = 'rgba(255,255,255,0.12)'; x.beginPath(); x.moveTo(8, 50); x.lineTo(42, 50); x.stroke(); m.set(key, img); return img; }
        const g = x.createLinearGradient(0, 0, 50, 100); g.addColorStop(0, '#fffdf3'); g.addColorStop(1, '#e9e1c8');
        x.fillStyle = g; x.fill(); x.strokeStyle = '#a89c78'; x.lineWidth = 1; x.stroke();
        x.fillStyle = 'rgba(255,255,255,0.6)'; this._rr(x, 3, 3, 44, 8, 4); x.fill();                      // brilho do marfim
        x.strokeStyle = '#6b6047'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(6, 50); x.lineTo(44, 50); x.stroke();
        x.fillStyle = '#b8a36a'; x.beginPath(); x.arc(25, 50, 2.2, 0, Math.PI * 2); x.fill();               // o pino de latão no meio
        const P = { 0: [], 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
        faces.forEach((n, half) => {
            const cy = half ? 75 : 25;
            for (const [px, py] of P[n]) {
                const X = 25 + px * 12, Y = cy + py * 12;
                const pg = x.createRadialGradient(X - 1, Y - 1, 0.5, X, Y, 4.6); pg.addColorStop(0, '#3a3a3a'); pg.addColorStop(1, '#050505');
                x.fillStyle = pg; x.beginPath(); x.arc(X, Y, 4.4, 0, Math.PI * 2); x.fill();
            }
        });
        m.set(key, img);
        return img;
    },
};
