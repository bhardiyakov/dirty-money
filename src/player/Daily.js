// ============================================================================
// Daily — DESAFIOS DO DIA e a SEQUÊNCIA: o motivo para voltar amanhã (a análise de jogabilidade apontava: "sem metas diárias").
//   • A cada dia de VERDADE (o calendário do aparelho) saem 3 desafios curtos, sorteados pela data entre os que o jogador consegue
//     fazer hoje (sem arma não sai assalto; sem fachada não sai lavagem). Os alvos e os prêmios sobem com o nível do personagem.
//   • Cada desafio paga na hora (dinheiro sujo + XP, com faixa e fanfarra — ui/Juice.js); os 3 no mesmo dia pagam o BÔNUS DO DIA
//     (dinheiro, kit médico e XP), que cresce com a sequência.
//   • SEQUÊNCIA: abrir o jogo em dias seguidos soma (+10% nos prêmios por dia, até +100%) e paga um bônus de chegada; pulou um dia,
//     volta ao 1. Jogo novo começa no dia 1, sem bônus (e sem cartão durante os Primeiros Passos).
//   • O cartão (à esquerda) aparece na chegada, quando um desafio anda um quarto e quando fecha; a lista inteira fica em
//     Menu › STATUS, junto com a SUA HISTÓRIA — os números da carreira (tempo de jogo, km, furtos, fugas, prisões…).
// O progresso é LIDO do que o jogo já conta (WorldMemory, Standing, Goals, carreiras, corridas) e de um hodômetro próprio: nenhum
// sistema precisou de gancho. Tudo vai no save (SaveGame: `daily`); saves antigos começam a contar de agora.
// ============================================================================

const Daily = {
    date: null, dayN: 0, list: [], streak: 0, best: 0, daysDone: 0, total: 0, bonusPaid: false,
    life: {},                                  // contadores da carreira (nunca zeram): theft, holdup, carjack, km, walkKm, earned, sec…
    _t: 0, _seq: -1, _worth: null, _showT: 0, _welcome: 0, _html: '', _deathWas: false,

    // [id, ícone, texto(n), alvos por faixa de nível, valor atual (g), pode sair hoje? (g)]
    POOL: [
        ['theft', '🫳', (n) => `Furte ${n} pedestre${n > 1 ? 's' : ''} (C)`, [2, 3, 5], () => Daily.L('theft')],
        ['holdup', '🔫', (n) => `Assalte ${n} pessoa${n > 1 ? 's' : ''} na rua`, [1, 2, 3], () => Daily.L('holdup'), (g) => g.inventory.armed],
        ['carjack', '🚗', (n) => `Tome ${n} carro${n > 1 ? 's' : ''} de motorista`, [1, 2, 3], () => Daily.L('carjack')],
        ['km', '🛣️', (n) => `Dirija ${n} km`, [2, 4, 6], () => Daily.L('km')],
        ['walk', '👟', (n) => `Percorra ${n} km a pé`, [1, 1.5, 2], () => Daily.L('walkKm')],
        ['earn', '💵', (n) => `Ganhe ${brl(n)} na rua`, [400, 1500, 5000], () => Daily.L('earned')],
        ['mission', '📦', (n) => `Cumpra ${n} ${n > 1 ? 'missões' : 'missão'} do morro`, [1, 2, 3], () => Standing.missionsDone || 0, () => Standing.traffic >= 20],
        ['job', '🧰', (n) => `Conclua ${n} trabalho${n > 1 ? 's' : ''} de carreira`, [1, 1, 2], (g) => (g.careers ? g.careers.jobsDone : 0), (g) => !!g.careers],
        ['escape', '🚔', (n) => `Despiste a polícia ${n} vez${n > 1 ? 'es' : ''}`, [1, 2, 3], (g) => (g.goals ? g.goals.escapes : 0)],
        ['xp', '⭐', (n) => `Ganhe ${n} XP`, [200, 500, 1000], (g) => (g.skills ? g.skills.xp : 0), (g) => !!g.skills],
        ['near', '💨', (n) => `Passe raspando por ${n} carros (70 km/h+)`, [5, 10, 18], () => Daily.L('nearMiss')],
        ['race', '🏁', (n) => `Dispute ${n} corrida${n > 1 ? 's' : ''}`, [1, 1, 2], () => (typeof StreetRacing !== 'undefined' ? StreetRacing.stats.races : 0), (g) => (g.skills ? g.skills.level : 1) >= 3],
        ['robbery', '🏪', (n) => `Assalte ${n} loja${n > 1 ? 's' : ''}`, [1, 1, 2], () => Daily.L('robbery'), (g) => g.inventory.armed],
        ['launder', '🧼', (n) => `Lave ${brl(n)}`, [500, 2500, 8000], () => Math.floor(Laundry.xp || 0), () => Laundry.count > 0],
    ],
    CASH: [150, 400, 900], XP: [80, 150, 240],          // prêmio de cada desafio, por faixa de nível
    BONUS: [500, 1500, 4000],                            // os 3 do dia

    L(k) { return this.life[k] || 0; },
    bump(k, n = 1) { this.life[k] = (this.life[k] || 0) + n; },
    tier(g) { const L = g.skills ? g.skills.level : 1; return L < 5 ? 0 : L < 15 ? 1 : 2; },
    get streakMul() { return 1 + Math.min(10, Math.max(0, this.streak - 1)) * 0.1; },

    // ------------------------------------------------------------------ o dia de verdade
    _now() { return this._fake || new Date(); },
    _day(d = this._now()) { return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, n: Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5) }; },
    // Sorteio que só depende da data (mulberry32): todo mundo tem os mesmos desafios no mesmo dia, e eles não mudam ao recarregar.
    _rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; },

    // Monta os 3 desafios de hoje (contando daqui para a frente) e acerta a sequência.
    _roll(g, D) {
        const first = this.date == null, gap = D.n - this.dayN;
        this.streak = first ? 1 : gap === 1 ? this.streak + 1 : gap === 0 ? Math.max(1, this.streak) : 1;
        this.best = Math.max(this.best, this.streak);
        this.date = D.key; this.dayN = D.n; this.bonusPaid = false;
        const T = this.tier(g), rnd = this._rng(D.n * 2654435761), pool = this.POOL.filter((c) => { try { return !c[5] || !!c[5](g); } catch (e) { return false; } });
        for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
        this.list = pool.slice(0, 3).map((c) => ({ id: c[0], n: c[3][T], base: this._val(g, c), done: false, tier: T }));
        this._q = {};
        if (!first && gap >= 1) {                                    // voltou num dia novo: bônus de chegada
            const cash = Math.round(100 * Math.min(7, this.streak) * (1 + T));
            if (typeof Ledger !== 'undefined') Ledger.hold('Desafios do dia', 0.8);
            g.inventory.addCash(cash);
            if (typeof Juice !== 'undefined') Juice.banner('streak', this.streak > 1 ? `${this.streak} dias seguidos` : 'Bem-vindo de volta', `+${brl(cash)} de chegada · desafios novos no cartão${this.streak > 1 ? ` · prêmios +${Math.round((this.streakMul - 1) * 100)}%` : ''}`);
        }
        this._welcome = 9;
    },

    _def(id) { return this.POOL.find((c) => c[0] === id); },
    _val(g, c) { try { return +c[4](g) || 0; } catch (e) { return 0; } },
    // Progresso de um desafio (0..n).
    prog(g, it) { const c = this._def(it.id); return it.done || !c ? it.n : Math.max(0, Math.min(it.n, this._val(g, c) - it.base)); },
    reward(it) { const k = this.streakMul; return { cash: Math.round(this.CASH[it.tier] * k / 10) * 10, xp: Math.round(this.XP[it.tier] * k) }; },

    // ------------------------------------------------------------------ quadro
    update(g, dt) {
        if (!g._loadingHidden || !g.player) return;
        dt = Math.min(0.1, dt || 0);
        const menu = g.menu.isOpen, modal = menu || g._modalUiOpen();

        // hodômetro, tempo de jogo, velocidade máxima (a cada quadro: é só soma)
        if (!menu) {
            this.life.sec = (this.life.sec || 0) + dt;
            if (g.mode === 'car' && g.activeCar && !g.activeCar.isBoat) { const v = g.activeCar.speed; this.life.km = (this.life.km || 0) + v * dt / 1000; if (v * 3.6 > (this.life.top || 0)) this.life.top = Math.round(v * 3.6); }
            else if (g.mode === 'player' && !Interiors.active && g.player.speed > 0.5 && !g.player.rag) this.life.walkKm = (this.life.walkKm || 0) + Math.min(9, g.player.speed) * dt / 1000;
        }
        this._t -= dt;
        if (this._t > 0) return;
        this._t = 0.5;

        // crimes novos na memória do mundo (theft, holdup, carjack, robbery, kill, cop, heist, escape, busted…)
        if (typeof WorldMemory !== 'undefined') {
            if (this._seq < 0 || this._seq > WorldMemory.seq) this._seq = WorldMemory.seq;      // (primeira leitura, ou outro save carregado)
            else if (WorldMemory.seq > this._seq) { for (const e of WorldMemory.events) if (e.n > this._seq) this.bump(e.kind); this._seq = WorldMemory.seq; }
        }
        // dinheiro GANHO (patrimônio subindo sem janela aberta: guardar/sacar no baú ou no banco não conta)
        if (typeof Ledger !== 'undefined' && g.inventory) {
            const w = Ledger.worth(g);
            if (this._worth != null && !modal && !g.death && !g.arrest && w > this._worth) this.bump('earned', w - this._worth);
            this._worth = w;
        }
        if (!!g.death !== this._deathWas) { this._deathWas = !!g.death; if (g.death) this.bump('deaths'); }

        const D = this._day();
        if (D.key !== this.date) this._roll(g, D);

        // desafios (dentro de loja ou com janela aberta o prêmio espera a rua, como as metas: a faixa ficaria escondida atrás do painel)
        const pay = !modal && !Interiors.active && !g.death && !g.arrest;
        let changed = false, all = true;
        for (const it of this.list) {
            if (it.done) continue;
            const p = this.prog(g, it), q = Math.floor(4 * p / it.n);
            if (p >= it.n && pay) { this._complete(g, it); changed = true; continue; }
            all = false;
            if (this._q[it.id] !== undefined && q > this._q[it.id]) changed = true;
            this._q[it.id] = q;
        }
        if (all && pay && this.list.length && !this.bonusPaid) this._bonus(g);

        // cartão: na chegada, quando anda e quando fecha — nunca nos Primeiros Passos nem com janela aberta
        const quiet = typeof Tutorial !== 'undefined' && Tutorial.active();
        if (this._welcome > 0 && !quiet && !modal) { this._showT = Math.max(this._showT, this._welcome); this._welcome = 0; }
        if (changed && !quiet) this._showT = Math.max(this._showT, 6);
        if (this._showT > 0) this._showT -= 0.5;
        this._card(g, this._showT > 0 && !modal && !quiet && !g.death && !g.arrest);
    },

    _complete(g, it) {
        it.done = true;
        this.total++;
        const R = this.reward(it), c = this._def(it.id);
        if (typeof Ledger !== 'undefined') Ledger.hold('Desafios do dia', 0.8);
        g.inventory.addCash(R.cash);
        if (g.skills) g.skills.addXp(R.xp);
        const left = this.list.filter((x) => !x.done).length;
        if (typeof Juice !== 'undefined') Juice.banner('daily', c ? c[2](it.n).replace(/ \(C\)$/, '') : 'Desafio cumprido', `+${brl(R.cash)} · +${R.xp} XP${left ? ` · falta${left > 1 ? 'm' : ''} ${left} para o bônus do dia` : ''}`);
        else g._flash(`🔥 DESAFIO DO DIA cumprido: +${brl(R.cash)}`);
    },
    _bonus(g) {
        this.bonusPaid = true;
        this.daysDone++;
        const T = this.tier(g), cash = Math.round(this.BONUS[T] * this.streakMul / 10) * 10;
        if (typeof Ledger !== 'undefined') Ledger.hold('Desafios do dia', 0.8);
        g.inventory.addCash(cash);
        g.inventory.medkits = (g.inventory.medkits || 0) + 1;
        if (g.skills) g.skills.addXp(Math.round(300 * this.streakMul));
        if (typeof Juice !== 'undefined') Juice.banner('streak', 'Dia completo', `+${brl(cash)} · +1 kit médico · volte amanhã: sequência de ${this.streak} dia${this.streak > 1 ? 's' : ''}`);
        else g._flash(`🔥 DIA COMPLETO: +${brl(cash)} e 1 kit médico`);
    },

    // ------------------------------------------------------------------ interface
    _rows(g) {
        return this.list.map((it) => {
            const c = this._def(it.id), p = this.prog(g, it), R = this.reward(it), dec = it.n % 1 !== 0 || (it.id === 'km' || it.id === 'walk');
            const cur = it.id === 'earn' || it.id === 'launder' ? brl(p) : dec ? p.toFixed(1) : String(Math.floor(p));
            return { icon: c ? c[1] : '🔥', text: c ? c[2](it.n) : it.id, pct: Math.round(100 * p / it.n), done: it.done, cur, R };
        });
    },
    _card(g, on) {
        if (!on) { if (this.el && this._on) { this._on = false; this.el.classList.remove('show'); } return; }
        if (!this.el) {
            const st = document.createElement('style');
            st.textContent = `
                #dailyBox { position: fixed; left: 16px; top: 104px; z-index: 10; width: 268px; pointer-events: none; padding: 10px 13px 11px; border-radius: 16px; background: var(--glass);
                    border: 1px solid rgba(251,146,60,0.45); border-left: 3px solid #fb923c; box-shadow: var(--shadow-s); color: var(--tx); font: 500 12px/1.35 var(--font);
                    -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); opacity: 0; transform: translateX(-14px); transition: opacity .35s ease, transform .35s ease; }
                #dailyBox.show { opacity: 1; transform: none; }
                #dailyBox .h { display: flex; justify-content: space-between; align-items: baseline; font: 800 10px var(--font-d); letter-spacing: 0.12em; color: #fb923c; text-transform: uppercase; margin-bottom: 6px; }
                #dailyBox .h span { color: var(--tx-2); letter-spacing: 0.04em; }
                #dailyBox .r { display: flex; gap: 8px; align-items: center; margin-top: 6px; }
                #dailyBox .r .e { font-family: var(--emoji); font-size: 15px; width: 18px; text-align: center; flex: none; }
                #dailyBox .r .c { flex: 1; min-width: 0; } #dailyBox .r .c div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
                #dailyBox .r i { display: block; height: 4px; margin-top: 4px; border-radius: 99px; background: rgba(255,255,255,0.09); overflow: hidden; }
                #dailyBox .r i s { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #fb923c, #fbbf24); transition: width .4s ease; }
                #dailyBox .r.ok { color: var(--tx-3); } #dailyBox .r.ok .c div { text-decoration: line-through; } #dailyBox .r.ok i s { background: #34d399; }
                #dailyBox .r b { font: 700 11px var(--font-d); color: #86efac; flex: none; }
                body.mobile #dailyBox { left: 8px; top: 86px; width: 210px; padding: 7px 9px 8px; font-size: 10.5px; border-radius: 12px; -webkit-backdrop-filter: none; backdrop-filter: none; }
                body.mobile #dailyBox .r { margin-top: 4px; } body.mobile #dailyBox .r b { display: none; }`;
            document.head.appendChild(st);
            this.el = document.createElement('div'); this.el.id = 'dailyBox';
            document.body.appendChild(this.el);
        }
        const html = `<div class="h">🔥 Desafios do dia<span>${this.streak > 1 ? `${this.streak} dias seguidos` : 'dia 1'}</span></div>` + this._rows(g).map((r) =>
            `<div class="r${r.done ? ' ok' : ''}"><span class="e">${r.done ? '✅' : r.icon}</span><div class="c"><div>${r.text}</div><i><s style="width:${r.pct}%"></s></i></div><b>${r.done ? '' : '+' + brl(r.R.cash)}</b></div>`).join('');
        if (html !== this._html) { this._html = html; this.el.innerHTML = html; }
        if (!this._on) { this._on = true; this.el.classList.add('show'); }
    },

    // Bloco do Menu › STATUS: os desafios de hoje e a sequência.
    statusHtml(g, bar, row) {
        if (!this.list.length) return row('Desafios', 'saem ao começar o dia');
        const T = this.tier(g), bonus = Math.round(this.BONUS[T] * this.streakMul / 10) * 10;
        return this._rows(g).map((r) => bar(`${r.done ? '✅' : r.icon} ${r.text}`, r.pct, r.done ? '#34d399' : 'linear-gradient(90deg,#fb923c,#fbbf24)', r.done ? 'cumprido' : `${r.cur} · +${brl(r.R.cash)} e ${r.R.xp} XP`)).join('')
            + row('Bônus pelos 3 de hoje', this.bonusPaid ? '<span style="color:#86efac">recebido ✔</span>' : `${brl(bonus)} + 1 kit médico`)
            + row('Sequência', `${this.streak} dia${this.streak > 1 ? 's' : ''} seguido${this.streak > 1 ? 's' : ''}${this.streak > 1 ? ` · prêmios +${Math.round((this.streakMul - 1) * 100)}%` : ''} · recorde ${this.best}`)
            + row('Desafios cumpridos', `${this.total} · dias completos ${this.daysDone}`)
            + '<div class="sr" style="opacity:.75"><span>Os desafios trocam à meia-noite. Jogue em dias seguidos: cada dia soma +10% nos prêmios (até +100%).</span></div>';
    },
    statusSum(g) { const d = this.list.filter((x) => x.done).length; return this.list.length ? `🔥 ${d}/${this.list.length} hoje · sequência de ${this.streak} dia${this.streak > 1 ? 's' : ''}` : ''; },

    // Bloco do Menu › STATUS: os números da carreira.
    storyHtml(g, row) {
        const L = (k) => this.L(k), s = Math.round(L('sec')), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
        const A = g.achievements, R = typeof StreetRacing !== 'undefined' ? StreetRacing.stats : null;
        return row('Tempo de jogo', h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`)
            + row('Dinheiro ganho na rua', brl(L('earned')))
            + row('Rodou de veículo', `${L('km').toFixed(1)} km · máxima ${L('top')} km/h`)
            + row('Andou a pé', `${L('walkKm').toFixed(1)} km`)
            + row('Furtos · assaltos na rua · lojas', `${L('theft')} · ${L('holdup')} · ${L('robbery')}`)
            + row('Carros tomados', L('carjack'))
            + row('Raspadas no trânsito', `${L('nearMiss')}${L('nearBest') ? ` · melhor sequência ×${L('nearBest')}` : ''}`)
            + row('Fugas da polícia', g.goals ? g.goals.escapes : 0)
            + row('Prisões · mortes', `${L('busted')} · ${L('deaths')}`)
            + (R ? row('Corridas · vitórias', `${R.races} · ${R.wins}`) : '')
            + row('Missões do morro · trabalhos', `${Standing.missionsDone || 0} · ${g.careers ? g.careers.jobsDone : 0}`)
            + (A ? row('Conquistas', `${Object.keys(A.done).filter((k) => k !== 'platinum').length}/${A.list().length}`) : '');
    },
    storySum() { const s = Math.round(this.L('sec')), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return `⏱ ${h ? h + ' h ' : ''}${m} min · 🛣️ ${this.L('km').toFixed(1)} km · 💵 ${brl(this.L('earned'))}`; },

    // Uma linha para o botão "Carregar jogo" do menu principal, lida do save (o motivo para entrar hoje).
    teaser(s) {
        const d = s && s.daily, D = this._day();
        if (!d || !d.date) return '🔥 Desafios do dia esperando por você';
        const n = (d.list || []).length, k = (d.list || []).filter((x) => x && x.done).length, st = d.streak || 1;
        if (d.date === D.key) return k >= n && n ? `🔥 Desafios de hoje completos · ${st} dia${st > 1 ? 's' : ''} seguido${st > 1 ? 's' : ''}` : `🔥 ${k}/${n} desafios de hoje`;
        return D.n - (d.dayN || 0) === 1 ? `🔥 Desafios novos · jogue hoje e são ${st + 1} dias seguidos` : '🔥 Desafios novos hoje · bônus de chegada';
    },

    // ------------------------------------------------------------------ save
    serialize() {
        const life = {};
        for (const [k, v] of Object.entries(this.life)) life[k] = Math.round(v * 1000) / 1000;
        return { date: this.date, dayN: this.dayN, list: this.list.map((x) => Object.assign({}, x)), streak: this.streak, best: this.best, daysDone: this.daysDone, total: this.total, bonusPaid: this.bonusPaid, life };
    },
    load(s) {
        this._seq = -1; this._worth = null; this._q = {}; this._html = ''; this._showT = 0;
        if (!s) { this.date = null; this.dayN = 0; this.list = []; this.streak = 0; this.best = 0; this.daysDone = 0; this.total = 0; this.bonusPaid = false; this.life = {}; return; }
        this.date = typeof s.date === 'string' ? s.date : null; this.dayN = s.dayN || 0;
        this.list = Array.isArray(s.list) ? s.list.filter((x) => x && this._def(x.id) && x.n > 0).map((x) => ({ id: x.id, n: x.n, base: +x.base || 0, done: !!x.done, tier: Math.max(0, Math.min(2, x.tier | 0)) })) : [];
        this.streak = s.streak || 0; this.best = s.best || 0; this.daysDone = s.daysDone || 0; this.total = s.total || 0; this.bonusPaid = !!s.bonusPaid;
        this.life = Object.assign({}, s.life || {});
        this._welcome = 8;                                           // (mesmo dia: o cartão aparece na chegada, sem bônus)
    },
};
Daily._q = {};
