// ============================================================================
// BarGames — a mesa do bar não fica parada: dois fregueses jogam SINUCA (um debruçado na tacada, o outro esperando com o copo),
// dois ou quatro jogam TRUCO na mesa de madeira (sentados, gritando TRUCO!, SEIS!, "Desce!"). Cada partida tem nome, nível e
// um tempo; no fim o vencedor comemora, cobra o perdedor e os dois vão embora (a mesa fica livre para você).
//   Perto da mesa ocupada, E abre a APOSTA: escolha um lado e quanto (as odds saem do nível de cada um — o favorito paga menos).
//     • Assistir de perto: a partida abre em tela cheia (Truco.watch / Pool.watch) com a IA jogando os dois lados; o resultado é o
//       de verdade.
//     • Esperar o resultado: a partida segue no salão; quando acabar, você recebe (ou não).
//     • Desafiar o vencedor: eles te dão a mesa — você joga (o mini-jogo normal).
// Os jogadores são agentes do ShopLife (papel 'gamer': BarGames.updateAgent anima). O assalto os trata como fregueses.
// ============================================================================

const BarGames = {
    NAMES: [['Zé Grilo', '🧔'], ['Tião Bigode', '👨‍🦳'], ['Bira', '👨‍🦲'], ['Careca', '👨‍🦲'], ['Baiano', '🧑‍🦱'], ['Paraíba', '👨'], ['Juca', '🧑'], ['Dentinho', '😁'],
        ['Seu Lino', '👴'], ['Marquinho', '🧑‍🦱'], ['Neguinho', '😎'], ['Gordo', '🧔‍♂️'], ['Lurdinha', '👩'], ['Dona Zica', '👵'], ['Cidinha', '👩‍🦱'], ['Pé de Pano', '🤠']],
    AMOUNTS: [50, 200, 1000, 5000],
    matches: { pool: null, truco: null },
    bets: [],                        // apostas esperando o fim da partida (no salão)

    // ShopLife.enter num bar: talvez já tenha gente jogando (mais à noite e no fim de semana).
    onEnter(L) {
        this.matches = { pool: null, truco: null };
        if (L.family !== 'bar' || !L.points) return;
        const h = L.game.dayNight.hour, busy = h >= 18 || h < 2 ? 0.85 : h >= 11 ? 0.45 : 0.15;
        if (L.points.pool.length >= 2 && Math.random() < busy) this._start(L, 'pool', Math.random() * 0.6);
        if (this._trucoSeats(L).length >= 2 && Math.random() < busy) this._start(L, 'truco', Math.random() * 0.6);
        this._spawnT = 20 + Math.random() * 40;
    },
    onLeave() {
        // apostas no salão: quem sai antes do fim perde a chance de ver, mas o resultado vale (paga ao voltar? não: resolve agora)
        for (const b of this.bets.slice()) this._settle(b, Math.random() < b.p ? b.side : 1 - b.side, true);
        this.matches = { pool: null, truco: null };
    },
    // Assalto no bar: a partida acaba ali (as apostas voltam), os jogadores viram fregueses comuns (reféns).
    abort(L) {
        const g = window.game;
        for (const b of this.bets.slice()) { this.bets.splice(this.bets.indexOf(b), 1); if (g) g.inventory.cash += b.bet; }
        for (const kind of ['pool', 'truco']) {
            const m = this.matches[kind]; if (!m || !m.agents) continue;
            m.over = true;
            for (const a of m.agents) { if (!a.gm) continue; if (!a.seat && a.gm.spot) a.gm.spot.taken = null; a.gm = null; a.role = 'customer'; a.plan = []; }
        }
        this.matches = { pool: null, truco: null };
    },
    busy(kind) { const m = this.matches[kind]; return !!(m && !m.over); },

    _trucoSeats(L) {
        const u = (L.data.uses || []).find((q) => q.kind === 'truco'); if (!u) return [];
        return L.points.seats.filter((s) => s.table && s.x > u.x0 - 0.2 && s.x < u.x1 + 0.2 && s.z > u.z0 - 0.2 && s.z < u.z1 + 0.2);
    },
    _names(n) {
        const pool = this.NAMES.slice().sort(() => Math.random() - 0.5);
        return pool.slice(0, n).map(([name, emo]) => ({ name, emo, lvl: Math.floor(Math.random() * 4) }));
    },

    _start(L, kind, progress = 0) {
        const types = (L.cast && L.cast.customers.length ? L.cast.customers : ['loja_homem', 'loja_jovem']).filter((t) => NpcArt.atlases[t]);
        if (!types.length) return;
        let spots, n;
        if (kind === 'pool') {
            const P = L.points.pool.slice();
            if (P.length < 2) return;
            P.sort((a, b) => a.x - b.x);                                   // um de cada lado da mesa
            spots = [P[0], P[P.length - 1]]; n = 2;
            if (spots.some((s) => s.taken && s.taken.role !== 'customer')) return;
            for (const s of spots) if (s.taken) L.abandon(s.taken);      // (quem estava só olhando cede o lugar)
        } else {
            const S = this._trucoSeats(L).filter((s) => !s.taken);
            if (S.length < 2) return;
            n = S.length >= 4 ? 4 : 2; spots = S.slice(0, n);
        }
        const people = this._names(n);
        const m = { kind, people, agents: [], t: 0, dur: (kind === 'pool' ? 110 : 160) + Math.random() * 90, over: false, duo: n === 4, turn: 0, turnT: 3 };
        m.t = m.dur * progress;
        // os lados: sinuca 1 × 1; truco 1 × 1 ou 2 × 2 (parceiros sentados frente a frente: 0 e 2 contra 1 e 3)
        m.sides = m.duo ? [[0, 2], [1, 3]] : [[0], [1]];
        m.lvl = m.sides.map((s) => Math.round(s.reduce((a, i) => a + people[i].lvl, 0) / s.length));
        const pA = Math.max(0.18, Math.min(0.82, 0.5 + 0.11 * (m.lvl[0] - m.lvl[1])));
        m.p = [pA, 1 - pA];
        m.odds = m.p.map((p) => Math.max(1.15, Math.round((0.94 / p) * 10) / 10));
        spots.forEach((spot, i) => {
            const a = L.createAgent('gamer', types[Math.floor(Math.random() * types.length)], (Math.random() * 1e6) | 0);
            a.gm = { m, i, spot }; spot.taken = a; if (kind === 'truco') a.seat = spot;
            L.place(a, spot.x, spot.z, spot.heading);
            L.playAnim(a, kind === 'truco' ? 'sit_table' : 'idle');
            m.agents.push(a);
        });
        this.matches[kind] = m;
    },

    // ShopLife.update (num bar): a partida anda; novas começam de vez em quando.
    update(L, dt) {
        if (L.family !== 'bar') return;
        for (const kind of ['pool', 'truco']) {
            const m = this.matches[kind]; if (!m || m.over) continue;
            m.t += dt;
            if (m.t >= m.dur) this._finish(L, m, Math.random() < m.p[0] ? 0 : 1);
        }
        this._spawnT -= dt;
        if (this._spawnT <= 0) {
            this._spawnT = 40 + Math.random() * 60;
            const h = L.game.dayNight.hour;
            if (h >= 10 || h < 3) for (const kind of ['pool', 'truco']) if (!this.busy(kind) && !(this.matches[kind] && this.matches[kind].over) && Math.random() < 0.5 && !(typeof Pool !== 'undefined' && Pool.active)) { this._start(L, kind, 0); break; }
        }
    },

    // Cada jogador: sinuca = a vez de um (debruçado na tacada, de frente para a mesa), o outro espera de copo na mão; truco =
    // sentado jogando, com os gritos.
    updateAgent(L, a, dt) {
        const g = a.gm; if (!g) return;
        const m = g.m;
        if (m.over) return;
        if (m.kind === 'pool') {
            if (g.i === 0) {                                             // (o primeiro jogador conta a vez dos dois)
                m.turnT -= dt;
                if (m.turnT <= 0) {
                    m.turn = Math.random() < 0.65 ? 1 - m.turn : m.turn; m.turnT = 5 + Math.random() * 6;
                    const sh = m.agents[m.turn];
                    if (sh && sh.actor && Math.random() < 0.35) Bubbles.say(sh.actor, this._pick(['Essa é minha!', 'Bola sete no canto…', 'Olha o efeito!', 'Vai, vai, vai…', 'Ih, errei!', 'Caçapa do meio, cantada!']), { ms: 2200 });
                }
            }
            const mine = m.turn === g.i;
            a.targetHeading = mine ? g.spot.heading : g.spot.heading + 0.6;
            L.playAnim(a, mine ? 'work' : 'drink');
        } else {
            L.playAnim(a, 'sit_table');
            a.targetHeading = g.spot.heading;
            if (g.i === 0) {
                m.turnT -= dt;
                if (m.turnT <= 0) {
                    m.turnT = 4 + Math.random() * 7;
                    const who = m.agents[Math.floor(Math.random() * m.agents.length)], r = Math.random();
                    const line = r < 0.22 ? this._pick(['TRUCO!', 'TRUCO, LADRÃO!', 'SEIS!', 'NOVE, MARRECO!']) : r < 0.5 ? this._pick(['Desce!', 'Corri…', 'Zap na mesa!', 'Manilha!', 'Cangou!', 'Encobri.']) : r < 0.7 ? this._pick(['Hahaha!', 'Tá roubando!', 'Embaralha direito aí!', 'Vamos, parceiro!']) : '';
                    if (line && who.actor) Bubbles.say(who.actor, line, { tone: /!$/.test(line) && line === line.toUpperCase() ? 'shout' : 'talk', ms: 2000 });
                }
            }
        }
    },
    _pick(a) { return a[Math.floor(Math.random() * a.length)]; },

    // Fim da partida: comemora, paga as apostas, levanta.
    _finish(L, m, winSide, quiet = false) {
        if (m.over) return;
        m.over = true; m.winner = winSide;
        const W = m.sides[winSide].map((i) => m.agents[i]).filter(Boolean), Lo = m.sides[1 - winSide].map((i) => m.agents[i]).filter(Boolean);
        if (!quiet) {
            if (W[0] && W[0].actor) Bubbles.say(W[0].actor, this._pick(['Ganhei! Paga aí!', 'É ruim, hein? Pode passar o dinheiro!', 'Freguês!', 'Mais uma vítima!']), { tone: 'shout', ms: 2600 });
            if (Lo[0] && Lo[0].actor) setTimeout(() => { if (Lo[0].actor) Bubbles.say(Lo[0].actor, this._pick(['Sorte…', 'Amanhã eu te pego.', 'Tá bom, tá bom…', 'Revanche!']), { ms: 2400 }); }, 1300);
        }
        for (const b of this.bets.slice()) if (b.m === m) this._settle(b, winSide);
        setTimeout(() => this._release(L, m), quiet ? 0 : 2600);
    },
    _release(L, m) {
        for (const a of m.agents) {
            if (!a.gm) continue;
            if (!a.seat && a.gm.spot) a.gm.spot.taken = null;               // (a cadeira do truco: o standUp solta)
            a.gm = null; a.role = 'customer'; a.plan = [];
            if (L.active && L.agents.includes(a)) { if (a.seat) L.standUp(a); else L.abandon(a); }
        }
        if (this.matches[m.kind] === m) this.matches[m.kind] = { over: true, kind: m.kind };        // (a mesa fica livre um tempo)
        setTimeout(() => { if (this.matches[m.kind] && this.matches[m.kind].over && !this.matches[m.kind].people) this.matches[m.kind] = null; }, 30000);
    },
    _settle(b, winSide, away = false) {
        this.bets.splice(this.bets.indexOf(b), 1);
        const g = window.game; if (!g) return;
        const m = b.m, who = m.sides[b.side].map((i) => m.people[i].name).join(' e ');
        if (winSide === b.side) {
            const pay = Math.round(b.bet * b.odds);
            g.inventory.cash += pay;
            g._flash(`💰 Aposta: ${who} ${m.sides[b.side].length > 1 ? 'ganharam' : 'ganhou'}! Você recebe ${brl(pay)}`);
            AudioFX.blip(880, 0.12, 0.18);
        } else {
            g._flash(`💸 Aposta perdida: ${who} ${m.sides[b.side].length > 1 ? 'perderam' : 'perdeu'} (${brl(b.bet)})${away ? ' — você saiu antes do fim' : ''}`);
            AudioFX.blip(200, 0.25, 0.15);
        }
        if (typeof WorldMemory !== 'undefined' && winSide === b.side && b.bet >= 1000) WorldMemory.log('bigwin', { game: 'aposta', value: Math.round(b.bet * b.odds), place: g && Interiors.active ? Interiors.active.shop.name : '' });
    },

    // ------------------------------------------------------------------ a mesa de jogos (a de madeira, com 4 cadeiras)
    // E abre o menu: truco, dominó, porrinha — e, se tiver gente jogando, apostar; no sábado à noite, o torneio de truco.
    tablePrompt() {
        const t = this.tourneyOpen();
        return `<b>E</b> mesa de jogos<small>truco · dominó · porrinha${this.busy('truco') ? ' · apostar na partida' : ''}${t ? ' · 🏆 torneio hoje!' : ''}</small>`;
    },
    table(game) {
        const shop = Interiors.active && Interiors.active.shop, T = this.tourneyOpen(), busy = this.busy('truco');
        if (!this._tp) this._tp = new Panel('barTable', { width: 520, onAct: (a) => {
            this._tp.close();
            if (a === 'truco') { if (this.busy('truco')) this._yield(game, this.matches.truco); else Truco.open(game, shop); }
            else if (a === 'domino') Domino.open(game, shop);
            else if (a === 'porrinha') Porrinha.open(game, shop);
            else if (a === 'bet') this.open(game, 'truco');
            else if (a === 'tourney') this.tourneyStart(game, shop);
        } });
        const card = (act, icon, t, sub, on = true) => `<button class="btn${act === 'tourney' ? ' pri' : ''}" data-act="${act}" ${on ? '' : 'disabled'} style="display:flex;gap:12px;align-items:center;width:100%;text-align:left;padding:12px 14px;margin-top:8px">
            <span style="font-family:var(--emoji);font-size:28px">${icon}</span><span><b style="display:block;font:700 15px var(--font-d)">${t}</b><small style="color:var(--tx-2)">${sub}</small></span></button>`;
        const m = this.matches.truco;
        this._tp.show('🍺 Mesa de jogos', shop ? shop.name : '',
            (T ? card('tourney', '🏆', `Torneio de truco — inscrição ${brl(this.TOURNEY.fee)}`, `Sábado à noite: 8 jogadores, mata-mata até 6 pontos. Campeão leva ${brl(this.TOURNEY.prize[0])}.`, game.inventory.cash >= this.TOURNEY.fee) : '')
            + card('truco', '🃏', busy ? 'Truco — desafiar quem está jogando' : 'Truco', busy ? `${m.sides.map((sd) => sd.map((i) => m.people[i].name).join(' e ')).join(' × ')} estão na mesa` : '1 × 1 ou em dupla, apostado')
            + (busy ? card('bet', '💰', 'Apostar na partida de truco', 'Escolha um lado, aposte e assista (ou espere)') : '')
            + card('domino', '🁣', 'Dominó em dupla', 'Você e um parceiro da casa; batida e fechada, até 50 pontos')
            + card('porrinha', '✊', 'Porrinha', 'Os palitinhos: esconda, chute o total, largue os seus primeiro'));
    },

    // ------------------------------------------------------------------ torneio de truco (sábado, 19h–24h, em qualquer bar)
    TOURNEY: { fee: 500, prize: [3600, 900], goal: 6 },
    tourney: null,
    tourneyOpen() {
        const g = window.game; if (!g) return false;
        const h = g.dayNight.hour, day = Economy.day, sat = day % 7 === 5;
        const t = this.tourney;
        return sat && h >= 19 && !(t && t.day === day && t.over);
    },
    tourneyStart(game, shop) {
        const T = this.TOURNEY;
        if (!this.tourneyOpen() || game.inventory.cash < T.fee) return;
        game.inventory.cash -= T.fee;
        const ppl = this.NAMES.filter(([n]) => n !== 'Dentinho').slice().sort(() => Math.random() - 0.5).slice(0, 6).map(([name, emo], i) => ({ name, emo, lvl: [0, 1, 1, 2, 2, 3][i] }));
        ppl.push({ name: 'Dentinho', emo: '😁', lvl: 3, rival: true });
        const field = [{ name: 'Você', emo: '🙂', me: true }].concat(ppl.sort(() => Math.random() - 0.5));
        // (o Dentinho, o campeão da casa, cai do outro lado da chave: só na final)
        const di = field.findIndex((p) => p.rival); if (di < 4) { const j = 4 + Math.floor(Math.random() * 4); [field[di], field[j]] = [field[j], field[di]]; }
        this.tourney = { day: Economy.day, shop, field, round: 0, alive: field.slice(), results: [], over: false };
        AudioFX.blip(620, 0.1, 0.14);
        this._bracket(game);
    },
    // Os jogos da rodada que não são o seu: sorteados pelo nível.
    _simPair(a, b) { const pa = Math.max(0.15, Math.min(0.85, 0.5 + 0.12 * (a.lvl - b.lvl))); return Math.random() < pa ? a : b; },
    _bracket(game, note = '') {
        const t = this.tourney, R = ['Quartas de final', 'Semifinal', 'Final'];
        if (!this._bp) this._bp = new Panel('barTourney', { width: 620, closable: false, onAct: (a) => this._tourneyAct(game, a) });
        const rows = [];
        for (let r = 0; r <= Math.min(t.round, 2); r++) {
            const list = r === t.round ? t.alive : t.results[r] ? t.results[r].alive : [];
            const pairs = []; for (let i = 0; i < list.length; i += 2) pairs.push([list[i], list[i + 1]]);
            rows.push(`<div style="margin-top:10px"><b style="font:700 13px var(--font-d);color:var(--gold)">${R[r]}</b>${pairs.map(([a, b]) => `<div class="dm-kv"><span>${a.emo} ${a.me ? '<b>Você</b>' : a.name} × ${b ? b.emo + ' ' + (b.me ? '<b>Você</b>' : b.name) : ''}</span><b>${t.results[r] ? (t.results[r].win.includes(a) ? a.name.split(' ')[0] : b ? b.name.split(' ')[0] : '') : '—'}</b></div>`).join('')}</div>`);
        }
        const me = t.alive.find((p) => p.me), myOpp = me ? t.alive[t.alive.indexOf(me) ^ 1] : null;
        const body = `${note ? `<p style="text-align:center;margin-bottom:6px">${note}</p>` : ''}${rows.join('')}
            <div style="display:flex;gap:8px;justify-content:center;margin-top:14px">${t.over ? Panel.btn('close', 'Voltar ao bar', { pri: true }) : me ? Panel.btn('play', `Jogar: ${R[t.round]} contra ${myOpp.name}`, { pri: true }) : Panel.btn('close', 'Voltar ao bar', { pri: true })}</div>
            <p style="font-size:11px;color:var(--tx-3);text-align:center;margin-top:8px">Mata-mata em partidas de truco até ${this.TOURNEY.goal} pontos. Campeão ${brl(this.TOURNEY.prize[0])} · vice ${brl(this.TOURNEY.prize[1])}.</p>`;
        this._bp.show(`🏆 Torneio de truco · ${t.shop ? t.shop.name : 'bar'}`, 'Sábado à noite: quem perde, sai.', body);
    },
    _tourneyAct(game, a) {
        const t = this.tourney;
        if (a === 'close') { this._bp.close(); return; }
        if (a !== 'play') return;
        const me = t.alive.find((p) => p.me), opp = t.alive[t.alive.indexOf(me) ^ 1];
        this._bp.close();
        Truco.tournament(game, t.shop, { lvl: Math.min(4, opp.lvl + t.round), name: opp.name, emo: opp.emo, goal: this.TOURNEY.goal, onEnd: (won) => this._tourneyNext(game, won) });
    },
    _tourneyNext(game, won) {
        const t = this.tourney, list = t.alive, win = [];
        for (let i = 0; i < list.length; i += 2) {
            const a = list[i], b = list[i + 1];
            win.push(a.me ? (won ? a : b) : b.me ? (won ? b : a) : this._simPair(a, b));
        }
        t.results[t.round] = { alive: list.slice(), win };
        t.alive = win; t.round++;
        const meIn = win.some((p) => p.me);
        let note;
        if (!meIn) {
            t.over = true;
            const vice = t.round === 3;
            if (vice) game.inventory.cash += this.TOURNEY.prize[1];
            note = vice ? `Vice-campeão! Você leva ${brl(this.TOURNEY.prize[1])}. ${win[0].name} ficou com o troféu.` : `Você foi eliminado. ${['Nas quartas', 'Na semifinal'][t.round - 1]}, não deu.`;
            if (vice && win[0].rival) note += ' O Dentinho ri da sua cara: "Semana que vem tem mais, freguês!"';
        } else if (t.round === 3) {
            t.over = true;
            game.inventory.cash += this.TOURNEY.prize[0];
            note = `🏆 CAMPEÃO! Você leva ${brl(this.TOURNEY.prize[0])} e o bar inteiro canta o seu nome.`;
            if (typeof WorldMemory !== 'undefined') WorldMemory.log('tourney', { place: t.shop && t.shop.name, value: this.TOURNEY.prize[0], district: t.shop ? WorldMemory._dist(t.shop.x, t.shop.z) : null });
            if (game.achievements) game.achievements.bump('trucoCup');
        } else note = won ? `Você passou! Próxima: ${['', 'semifinal', 'final'][t.round]}.` : '';
        this._bracket(game, note);
    },

    // ------------------------------------------------------------------ a janela da aposta
    prompt(kind) {
        const m = this.matches[kind]; if (!m || m.over || !m.people) return '';
        const sideTxt = (s) => m.sides[s].map((i) => m.people[i].name).join(' e ');
        const left = Math.max(0, Math.ceil((m.dur - m.t) / 60));
        return `<b>E</b> apostar na partida<small>${sideTxt(0)} × ${sideTxt(1)} · ${left ? `falta ~${left} min` : 'acabando'}${this.bets.some((b) => b.m === m) ? ' · você já apostou' : ''}</small>`;
    },
    open(game, kind) {
        const m = this.matches[kind]; if (!m || m.over) return false;
        this._sel = { kind, side: null, amt: null };
        if (!this._p) this._p = new Panel('barBet', { width: 560, onAct: (a, arg) => this._act(game, a, arg) });
        this._render(game);
        return true;
    },
    _render(game) {
        const S = this._sel, m = this.matches[S.kind]; if (!m || m.over) { this._p.close(); return; }
        const icon = S.kind === 'pool' ? '🎱' : '🃏', cash = game.inventory.cash, mine = this.bets.find((b) => b.m === m);
        const side = (s) => {
            const ppl = m.sides[s].map((i) => m.people[i]);
            const on = S.side === s;
            return `<button class="btn${on ? ' pri' : ''}" data-act="side" data-arg="${s}" style="flex:1;padding:12px;text-align:left${mine ? ';opacity:.5' : ''}" ${mine ? 'disabled' : ''}>
                <div style="font-family:var(--emoji);font-size:24px">${ppl.map((p) => p.emo).join(' ')}</div>
                <b style="display:block;font:700 14px var(--font-d)">${ppl.map((p) => p.name).join(' e ')}</b>
                <small style="color:var(--gold)">${'★'.repeat(m.lvl[s] + 1)}${'☆'.repeat(3 - m.lvl[s])}</small> <small>· paga <b style="color:#86efac">${String(m.odds[s]).replace('.', ',')}×</b></small></button>`;
        };
        const amts = this.AMOUNTS.map((v) => Panel.btn('amt', brl(v), { arg: v, on: cash >= v && !mine, pri: S.amt === v })).join(' ');
        const ok = !mine && S.side != null && S.amt != null && cash >= S.amt;
        const left = Math.max(0, Math.round(m.dur - m.t));
        const body = `<div style="display:flex;gap:10px;margin-bottom:12px">${side(0)}<div style="align-self:center;font:800 18px var(--font-d);opacity:.6">×</div>${side(1)}</div>
            ${mine ? `<p style="text-align:center;color:#86efac">Você apostou ${brl(mine.bet)} em ${m.sides[mine.side].map((i) => m.people[i].name).join(' e ')} (paga ${brl(Math.round(mine.bet * mine.odds))}).</p>`
                : `<div style="text-align:center;margin-bottom:12px"><div style="font-size:12px;color:var(--tx-2);margin-bottom:6px">Quanto? (você tem ${brl(cash)})</div>${amts}</div>`}
            <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
                ${Panel.btn('watch', mine || !ok ? '👀 Assistir de perto' : '👀 Apostar e assistir', { on: true, pri: true })}
                ${mine ? '' : Panel.btn('wait', '⏳ Apostar e esperar', { on: ok })}
                ${Panel.btn('challenge', '🫵 Desafiar o vencedor', { on: true })}
            </div>
            <p style="font-size:11px;color:var(--tx-3);text-align:center;margin-top:10px">Assistindo, o resultado é o da partida de verdade (a IA joga os dois lados). Esperando, ela acaba em ~${Math.max(1, Math.round(left / 60))} min no salão.</p>`;
        this._p.show(`${icon} Apostar na ${S.kind === 'pool' ? 'sinuca' : 'mesa de truco'}`, 'As odds saem do nível de cada lado: o favorito paga menos.', body);
    },
    _act(game, a, arg) {
        const S = this._sel, m = this.matches[S.kind]; if (!m || m.over) { this._p.close(); return; }
        if (a === 'side') { S.side = +arg; this._render(game); return; }
        if (a === 'amt') { S.amt = +arg; this._render(game); return; }
        if (a === 'challenge') { this._p.close(); this._yield(game, m); return; }
        let bet = this.bets.find((b) => b.m === m);
        const chose = S.side != null && S.amt != null && game.inventory.cash >= S.amt;
        if (!bet && a === 'watch' && !chose) { this._p.close(); this._watch(game, m); return; }     // (só assistir, sem apostar)
        if (!bet) {
            if (!chose) return;
            game.inventory.cash -= S.amt;
            bet = { m, side: S.side, bet: S.amt, odds: m.odds[S.side], p: m.p[S.side] };
            this.bets.push(bet);
            AudioFX.blip(620, 0.08, 0.14);
        }
        this._p.close();
        if (a === 'wait') { game._flash(`🤞 Apostou ${brl(bet.bet)} — a partida segue (paga ${brl(Math.round(bet.bet * bet.odds))})`); return; }
        if (a === 'watch') this._watch(game, m);
    },
    // "Desafiar o vencedor": eles encerram e te dão a mesa.
    _yield(game, m) {
        const L = ShopLife, w = Math.random() < m.p[0] ? 0 : 1;
        this._finish(L, m, w, true);
        const champ = m.sides[w].map((i) => m.people[i].name).join(' e ');
        game._flash(`${champ} ${m.sides[w].length > 1 ? 'ganharam' : 'ganhou'} e te ${m.sides[w].length > 1 ? 'esperam' : 'espera'} na mesa`);
        const shop = Interiors.active && Interiors.active.shop;
        setTimeout(() => { if (m.kind === 'pool') Pool.open(game, shop); else Truco.open(game, shop); }, 400);
    },
    // Assistir: a partida abre em tela cheia, a IA joga os dois lados; o resultado decide as apostas.
    _watch(game, m) {
        const shop = Interiors.active && Interiors.active.shop, done = (w) => { if (!m.over) this._finish(ShopLife, m, w); };
        if (m.kind === 'pool') Pool.watch(game, shop, { people: m.people, lvl: m.people.map((p) => p.lvl), onEnd: done, bet: this.bets.find((b) => b.m === m) });
        else Truco.watch(game, shop, { people: m.people, duo: m.duo, lvl: m.lvl, onEnd: done, bet: this.bets.find((b) => b.m === m) });
    },
};
