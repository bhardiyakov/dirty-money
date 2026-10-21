// ============================================================================
// Polish — o que faz o jogo "aparecer" para quem joga:
//   • Life     VIDA DA CIDADE (Ajustes): baixa / média / alta / automático (segue o gráfico). Escala os pedestres extras do rush,
//              a frequência dos acontecimentos de rua, as partidas dos NPCs no bar e o movimento das lojas — para celular fraco.
//   • Hints    DICAS DE PRIMEIRA VEZ: um cartão curto na primeira vez que algo acontece (mensagem no celular, mesa de jogos, briga
//              na rua, cansaço, descrição da polícia…). Cada dica aparece uma vez só (lembrado no navegador); dá para desligar em Ajustes.
//              Outros sistemas registram as suas com Hints.add(id, quando, texto).
//   • Ledger   LIVRO-CAIXA: de onde vem e para onde vai o dinheiro (sujo + limpo + banco + joias), por fonte e por dia de jogo —
//              atribuído pelo que você estava fazendo quando o patrimônio mudou. Aparece no Status (menu) — serve para equilibrar.
// ============================================================================

const Life = {
    LEVELS: ['auto', 'baixa', 'media', 'alta'],
    LABEL: { auto: 'Automático', baixa: 'Baixa', media: 'Média', alta: 'Alta' },
    MUL: { baixa: 0.35, media: 0.7, alta: 1 },
    choice() { const g = window.game, s = g && g.menu && g.menu.settings; return s && this.LEVELS.includes(s.life) ? s.life : 'auto'; },
    level() {
        const c = this.choice(); if (c !== 'auto') return c;
        const q = typeof Graphics !== 'undefined' ? Graphics.level : 'high';
        return q === 'low' ? 'baixa' : q === 'medium' ? 'media' : 'alta';
    },
    mul() { return this.MUL[this.level()]; },
    label(c = this.choice()) { return c === 'auto' ? `Automático (${this.LABEL[this.level()]})` : this.LABEL[c]; },
};

const Hints = {
    seen: null, list: [], cur: null, t: 0, _chk: 0,

    // id, condição (g) → bool, texto (HTML curto). Pode ser chamado a qualquer momento (outros arquivos registram as suas).
    add(id, when, text, icon = '💡') { if (!this.list.some((h) => h.id === id)) this.list.push({ id, when, text, icon }); },
    on() { const g = window.game, s = g && g.menu && g.menu.settings; return !s || s.hints !== false; },
    _load() { if (!this.seen) this.seen = new Set(Store.getJSON('hintsSeen', []) || []); },
    _save() { Store.setJSON('hintsSeen', [...this.seen]); },
    reset() { this.seen = new Set(); this._save(); },

    update(g, dt) {
        if (this.cur) { this.t -= dt; if (this.t <= 0) this.hide(); return; }
        this._chk -= dt; if (this._chk > 0) return; this._chk = 1;
        if (!this.on() || !g.player || g.menu.isOpen || g.sleeping || g.death || g.arrest || g._modalUiOpen()) return;
        this._load();
        for (const h of this.list) {
            if (this.seen.has(h.id)) continue;
            let ok = false; try { ok = h.when(g); } catch (e) { ok = false; }
            if (ok) { this.show(h); return; }
        }
    },
    show(h) {
        this._build();
        this.seen.add(h.id); this._save();
        this.cur = h; this.t = 11;
        this.el.innerHTML = `<div class="hi">${h.icon}</div><div class="tx"><div class="tt">Dica</div>${h.text}<div class="bt"><button data-h="ok">Entendi</button><button data-h="off" class="off">Desligar dicas</button></div></div>`;
        this.el.classList.add('show');
        if (typeof AudioFX !== 'undefined') AudioFX.blip(1046, 0.06, 0.06);
    },
    hide() { this.cur = null; if (this.el) this.el.classList.remove('show'); },
    _build() {
        if (this.el) return;
        const st = document.createElement('style');
        st.textContent = `
            #hintCard { position: fixed; left: 18px; top: 34%; z-index: 40; max-width: min(340px, 86vw); display: flex; gap: 10px; padding: 12px 14px; border-radius: 16px;
                background: var(--glass); border: 1px solid rgba(250,204,21,0.45); box-shadow: 0 10px 30px rgba(0,0,0,0.35); color: var(--tx); font: 500 13px/1.45 var(--font);
                -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); opacity: 0; transform: translateX(-16px); pointer-events: none; transition: opacity .25s, transform .25s; }
            #hintCard.show { opacity: 1; transform: none; pointer-events: auto; }
            #hintCard .hi { font-family: var(--emoji); font-size: 24px; line-height: 1; }
            #hintCard strong { color: #fde68a; } #hintCard .tt { display: block; font: 800 11px var(--font-d); letter-spacing: 1.5px; color: #facc15; text-transform: uppercase; margin-bottom: 2px; }
            #hintCard kbd { padding: 0 5px; border-radius: 4px; background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.25); font: 700 11px var(--font-d); }
            #hintCard .bt { display: flex; gap: 6px; margin-top: 8px; } #hintCard button { border: 0; border-radius: 9px; padding: 5px 10px; cursor: pointer; font: 700 12px var(--font-d); background: #facc15; color: #1a1400; }
            #hintCard button.off { background: rgba(255,255,255,0.1); color: var(--tx-2); }`;
        document.head.appendChild(st);
        const el = this.el = document.createElement('div'); el.id = 'hintCard';
        el.addEventListener('click', (e) => {
            const b = e.target.closest('[data-h]'); if (!b) return;
            if (b.dataset.h === 'off') { const g = window.game; if (g && g.menu) { g.menu.settings.hints = false; g.menu._saveSettings(); } }
            this.hide();
        });
        document.body.appendChild(el);
    },
};

// As dicas do jogo (o que já existe e ninguém descobre sozinho).
(() => {
    const inBar = (g) => Interiors.active && Interiors.active.shop.style === 'bar';
    const P = (g) => g.player.position;
    Hints.add('phone', () => typeof Phone !== 'undefined' && Phone.unread > 0, 'Chegou mensagem no <strong>celular</strong>. Aperte <kbd>J</kbd> (ou toque no 📱) para ler e responder — seus contatos lembram do que você responde.', '📱');
    Hints.add('barTable', (g) => inBar(g), 'No bar tem a <strong>mesa de jogos</strong> (truco, dominó, porrinha) e a sinuca — chegue perto e aperte <kbd>E</kbd>. Sábado à noite tem torneio de truco.', '🃏');
    Hints.add('barMatch', (g) => inBar(g) && typeof BarGames !== 'undefined' && (BarGames.busy('pool') || BarGames.busy('truco')), 'Os fregueses estão jogando: chegue perto da mesa e aperte <kbd>E</kbd> para apostar num deles, só assistir ou desafiar quem ganhar.', '🎱');
    Hints.add('briga', () => typeof StreetLife !== 'undefined' && StreetLife.ev && StreetLife.ev.kind === 'briga', 'Briga na rua! Chegue perto e aperte <kbd>E</kbd> para separar — o bairro passa a te respeitar. Ou deixe rolar.', '🥊');
    Hints.add('pivete', () => typeof StreetLife !== 'undefined' && StreetLife.ev && StreetLife.ev.kind === 'pivete', 'Um pivete arrancou uma bolsa! Pegue ele e devolva a bolsa à dona com <kbd>E</kbd> (respeito) — ou fique com ela.', '👜');
    Hints.add('ambulante', () => typeof StreetLife !== 'undefined' && StreetLife.ev && StreetLife.ev.kind === 'ambulante', 'Ambulante por perto: <kbd>E</kbd> compra água, milho, churros… mata a fome e dá um pouco de vida.', '🌽');
    Hints.add('tired', () => typeof Needs !== 'undefined' && Needs.energy < 25, 'Você está <strong>cansado</strong>: o fôlego e a mira pioram. Um café na padaria ajuda; dormir na sua cama resolve.', '😴');
    Hints.add('hungry', () => typeof Physique !== 'undefined' && Physique.fed < 20, 'Com fome o fôlego volta devagar. Padaria, lanchonete ou um ambulante resolvem.', '🍽️');
    Hints.add('wanted', (g) => g.wanted && g.wanted.level > 0, 'Procurado! Saia da vista da polícia (o cone das viaturas) e espere: as estrelas somem. Trocar de roupa depois quebra a descrição.', '🚔');
    Hints.add('desc', () => typeof Traces !== 'undefined' && Traces.desc && Traces.matches(), 'A polícia tem a <strong>descrição da sua roupa</strong>. Troque de roupa (longe da polícia) para ela não bater mais.', '👕');
    Hints.add('inquerito', () => typeof Traces !== 'undefined' && Traces.heat >= 30, 'O inquérito contra você está subindo. Em 100% sai mandado de prisão. Ele esfria sozinho com os dias — ou com um advogado (dinheiro limpo).', '📁');
    Hints.add('job', () => typeof Phone !== 'undefined' && Phone.jobs.length > 0, 'Entrega aceita: siga o GPS até o ponto marcado antes do prazo. O Baiano paga na hora.', '📦');
    Hints.add('rival', () => typeof Phone !== 'undefined' && Phone.appts.some((a) => a.kind === 'rival'), 'Desafio marcado com o Dentinho: vá ao bar no dia e hora e aperte <kbd>E</kbd> na sinuca. Não aparecer conta como derrota.', '😁');
    Hints.add('fear', (g) => typeof WorldMemory !== 'undefined' && WorldMemory.fameAt(P(g).x, P(g).z).fear >= 30, 'Este bairro está com <strong>medo</strong> de você: comerciantes cobram mais e cochicham quando você passa. Ajudar as pessoas aqui traz respeito.', '😨');
    Hints.add('tourney', (g) => Economy.day % 7 === 5 && g.dayNight.hour >= 17 && g.dayNight.hour < 23, 'Hoje é sábado: das 19h às 23h tem torneio de truco nos bares. Inscrição R$ 500, o campeão leva R$ 3.600.', '🏆');
    Hints.add('night', (g) => g.dayNight.hour >= 21 || g.dayNight.hour < 4, 'À noite a rua esvazia, os bares enchem e no fim de semana tem samba na praça e baile funk no morro.', '🌙');
})();

const Ledger = {
    days: {}, last: null, _t: 0, _ctxHold: null,

    worth(g) {
        const inv = g.inventory;
        return (inv.cash || 0) + (inv.clean || 0) + (inv.jewelValue || 0) + (typeof Banks !== 'undefined' ? Banks.account || 0 : 0);
    },
    // Marca o que está acontecendo nos próximos `s` segundos (quem paga de fora do jogador: o império na virada do dia, o celular…).
    hold(src, s = 2) { this._ctxHold = { src, t: s }; },
    ctx(g) {
        if (this._ctxHold) return this._ctxHold.src;
        if ((typeof Pool !== 'undefined' && Pool.active) || (typeof Truco !== 'undefined' && Truco.active) || (typeof Porrinha !== 'undefined' && Porrinha.active) || (typeof Domino !== 'undefined' && Domino.active)) return 'Jogos de bar';
        if (typeof BarGames !== 'undefined' && [BarGames._p, BarGames._tp, BarGames._bp].some((p) => p && p.open)) return 'Jogos de bar';
        if (typeof Heists !== 'undefined' && Heists.run) return 'Golpes';
        if (typeof Robbery !== 'undefined' && Robbery.session) return 'Assaltos a lojas';
        if (g.careers && g.careers.job) return 'Carreira: ' + (g.careers.job.c ? g.careers.job.c.name : 'trabalho');
        if (g.holdup) return 'Assaltos na rua';
        if (g.shopUI && g.shopUI.open) return 'Compras';
        if ((g.propertyUI && g.propertyUI.open) || (typeof HomeDecor !== 'undefined' && HomeDecor.active)) return 'Imóveis e casa';
        if ((g.carUI && g.carUI.open) || (g.motoUI && g.motoUI.open)) return 'Veículos';
        if (typeof Phone !== 'undefined' && Phone.open) return 'Celular (contatos)';
        if (g.menu && g.menu.isOpen) return 'Menu (império, lavagem…)';
        if (Interiors.active) return 'Lojas (outros)';
        return 'Rua (outros)';
    },
    update(g, dt) {
        if (this._ctxHold && (this._ctxHold.t -= dt) <= 0) this._ctxHold = null;
        this._t -= dt; if (this._t > 0) return; this._t = 0.5;
        if (!g.inventory) return;
        const w = this.worth(g);
        if (this.last == null || g.death || g.arrest) { this.last = w; return; }
        const d = Math.round(w - this.last); this.last = w;
        if (!d) return;
        const day = Economy.day, D = this.days[day] || (this.days[day] = {}), k = this.ctx(g), e = D[k] || (D[k] = [0, 0]);
        e[d > 0 ? 0 : 1] += d;
        const keys = Object.keys(this.days).map(Number).sort((a, b) => a - b); while (keys.length > 8) delete this.days[keys.shift()];
    },
    // Resumo: { rows: [[fonte, ganho, gasto]], gain, spend, perHour } dos últimos `n` dias.
    summary(n = 3) {
        const day = Economy.day, acc = {};
        for (let k = day - n + 1; k <= day; k++) for (const [src, [a, b]] of Object.entries(this.days[k] || {})) { const e = acc[src] || (acc[src] = [0, 0]); e[0] += a; e[1] += b; }
        const rows = Object.entries(acc).map(([s, [a, b]]) => [s, a, b]).sort((x, y) => (y[1] - y[2]) - (x[1] - x[2]));
        const gain = rows.reduce((s, r) => s + r[1], 0), spend = rows.reduce((s, r) => s + r[2], 0);
        const g = window.game, hours = Math.max(1, (n - 1) * 24 + (g && g.dayNight ? g.dayNight.hour : 24));
        return { rows, gain, spend, perHour: (gain + spend) / hours };
    },
    html(row) {
        const S = this.summary(3);
        if (!S.rows.length) return row('Ainda sem movimento', '—');
        return row('Ganhos (3 dias)', `<span style="color:#86efac">+${brl(S.gain)}</span>`) + row('Gastos (3 dias)', `<span style="color:#fda4af">${brl(S.spend)}</span>`)
            + row('Saldo por hora de jogo', `<span style="color:${S.perHour >= 0 ? '#86efac' : '#fda4af'}">${S.perHour >= 0 ? '+' : ''}${brl(S.perHour)}</span>`)
            + S.rows.slice(0, 9).map(([s, a, b]) => row(s, `${a ? `<span style="color:#86efac">+${brl(a)}</span>` : ''}${a && b ? ' · ' : ''}${b ? `<span style="color:#fda4af">${brl(b)}</span>` : ''}`)).join('');
    },
    serialize() { return { days: this.days }; },
    load(s) { this.days = (s && s.days) || {}; this.last = null; },
};
