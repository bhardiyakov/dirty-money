// ============================================================================
// Goals — METAS DE CARREIRA. O jogo tem sistemas fundos (procurado, facções, lavagem, imóveis, missões do morro), mas nada dizia ao jogador
// "o que fazer a seguir". Aqui há 5 trilhas de metas em degraus crescentes; o painel discreto (embaixo, no centro) mostra a próxima
// meta de cada trilha com barra de progresso, e cada meta batida paga uma recompensa na hora (dinheiro sujo, kit médico) com aviso e som.
//   PATRIMÔNIO  dinheiro sujo + limpo + joias      MORRO  missões do tráfico        LAVAGEM  fachadas e valor lavado
//   IMÓVEIS     propriedades compradas             FUGA   estrelas alcançadas e fugas da polícia
//   CARREIRAS   trabalhos concluídos nas carreiras do crime (careers/)
// Tudo é lido do estado que já existe (não precisa de gancho nos outros sistemas), exceto fugas e estrelas, contadas em onWanted().
// Salvo no save (SaveGame): metas cumpridas + contadores.
// ============================================================================

class Goals {
    // [id, rótulo, alvo, recompensa em $, kits médicos]
    static get TRACKS() {
        return {
            money: ['PATRIMÔNIO', [['m1', 'Juntar', 1000, 150, 0], ['m2', 'Juntar', 5000, 400, 0], ['m3', 'Juntar', 25000, 1500, 1], ['m4', 'Juntar', 100000, 5000, 1], ['m5', 'Juntar', 500000, 20000, 2], ['m6', 'Juntar', 1000000, 50000, 3]]],
            career: ['CARREIRAS', [['c1', 'Trabalhos de carreira', 1, 200, 0], ['c2', 'Trabalhos de carreira', 5, 800, 1], ['c3', 'Trabalhos de carreira', 15, 3000, 1], ['c4', 'Trabalhos de carreira', 40, 12000, 2]]],
            favela: ['MORRO', [['f1', 'Missões do tráfico', 1, 200, 0], ['f2', 'Missões do tráfico', 3, 500, 1], ['f3', 'Missões do tráfico', 8, 1500, 1], ['f4', 'Missões do tráfico', 15, 4000, 2], ['f5', 'Missões do tráfico', 30, 10000, 2]]],
            laundry: ['LAVAGEM', [['l1', 'Fachadas do C.V', 1, 300, 0], ['l2', 'Lavar no total', 5000, 600, 0], ['l3', 'Fachadas do C.V', 3, 1500, 1], ['l4', 'Lavar no total', 50000, 6000, 1], ['l5', 'Lavar no total', 250000, 20000, 2]]],
            estate: ['IMÓVEIS', [['e1', 'Imóveis comprados', 1, 500, 0], ['e2', 'Imóveis comprados', 3, 2500, 1], ['e3', 'Imóveis comprados', 6, 10000, 2]]],
            heat: ['FUGA', [['h1', 'Estrelas alcançadas', 2, 150, 0], ['h2', 'Fugas da polícia', 1, 300, 0], ['h3', 'Estrelas alcançadas', 4, 1000, 1], ['h4', 'Fugas da polícia', 5, 2500, 1], ['h5', 'Estrelas alcançadas', 5, 4000, 2]]],
        };
    }

    constructor(game) {
        this.g = game;
        this.done = {};
        this.escapes = 0;
        this.maxStars = 0;
        this._t = 0.5;
        this._txt = '';
        this._el = null;
    }

    // Valor atual de cada trilha, conforme o rótulo do degrau (o mesmo texto serve a mais de uma métrica da trilha).
    value(track, label) {
        const g = this.g, inv = g.inventory;
        switch (track) {
            case 'money': return inv.cash + inv.clean + (inv.jewelValue || 0);
            case 'favela': return Standing.missionsDone || 0;
            case 'laundry': return label.startsWith('Fachadas') ? Laundry.count : Math.floor(Laundry.xp);
            case 'estate': return Object.keys(RealEstate.owned).length;
            case 'career': return g.careers ? g.careers.jobsDone : 0;
            case 'heat': return label.startsWith('Fugas') ? this.escapes : this.maxStars;
        }
        return 0;
    }

    // Chamado pelo jogo quando o nível de procurado muda.
    onWanted(n, prev, why) {
        if (n > this.maxStars) this.maxStars = n;
        if (n === 0 && why === 'escape') this.escapes++;
    }

    _ensureEl() {
        if (this._el) return this._el;
        const st = document.createElement('style');
        st.textContent = `#goalBox { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 9; pointer-events: none; display: flex; gap: 8px; font-family: var(--font); }
            #goalBox .gl { min-width: 150px; padding: 8px 12px 9px; background: var(--glass); border: 1px solid var(--line); border-radius: var(--r-2); color: var(--tx); font-size: 12px; font-weight: 600; line-height: 1.3;
                -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); }
            #goalBox .gl b { display: block; font-size: 10px; font-weight: 700; color: var(--tx-3); letter-spacing: 0.1em; text-transform: uppercase; }
            #goalBox .gl i { display: block; height: 4px; margin-top: 6px; background: rgba(255,255,255,0.08); border-radius: 99px; overflow: hidden; }
            #goalBox .gl i::after { content: ''; display: block; height: 100%; width: var(--p, 0%); border-radius: 99px; background: linear-gradient(90deg, #22d3ee, #34d399); }
            body.mobile #goalBox { bottom: 4px; gap: 4px; transform: translateX(-50%) scale(0.78); transform-origin: bottom center; }
            body.mobile #goalBox .gl:nth-child(n+3) { display: none; }`;
        document.head.appendChild(st);
        const el = this._el = document.createElement('div');
        el.id = 'goalBox';
        document.body.appendChild(el);
        return el;
    }

    // Próximo degrau pendente de cada trilha.
    pending() {
        const out = [];
        for (const [key, [name, steps]] of Object.entries(Goals.TRACKS)) {
            const s = steps.find((x) => !this.done[x[0]]);
            if (s) out.push({ key, name, id: s[0], label: s[1], target: s[2], money: s[3], kits: s[4], cur: this.value(key, s[1]) });
        }
        return out;
    }

    update(dt) {
        this._t -= dt;
        if (this._t > 0) return;
        this._t = 0.5;
        const g = this.g;
        if (!g._bootDone || Interiors.active) return;
        if (this._backfill) {                                       // save antigo (sem metas): o que já foi conquistado conta como cumprido, sem chuva de prêmios
            this._backfill = false;
            for (let again = true; again;) { again = false; for (const p of this.pending()) if (p.cur >= p.target) { this.done[p.id] = 1; again = true; } }
        }
        for (const p of this.pending()) {
            if (p.cur < p.target) continue;
            this.done[p.id] = 1;
            g.inventory.addCash(p.money);
            if (p.kits) g.inventory.medkits += p.kits;
            if (g.skills) g.skills.addXp(60);
            g._flash(`🏆 META: ${p.label} ${this._fmt(p.key, p.target)} — +${brl(p.money)}${p.kits ? ` e ${p.kits} kit(s) médico(s)` : ''}`);
            AudioFX.blip(1100, 0.25, 0.22);
        }
        this._render();
    }

    _fmt(key, v) { return key === 'money' || (key === 'laundry' && v >= 1000) ? brl(v) : String(v); }

    _render() {
        const list = this.pending().slice(0, 3);
        const html = list.map((p) => `<div class="gl"><b>${p.name}</b>${p.label} ${this._fmt(p.key, Math.min(p.cur, p.target))}/${this._fmt(p.key, p.target)}<i style="--p:${Math.round(100 * Math.min(1, p.cur / p.target))}%"></i></div>`).join('');
        if (html === this._txt) return;
        this._txt = html;
        this._ensureEl().innerHTML = html;
    }

    setVisible(v) { if (this._el) this._el.style.display = v ? '' : 'none'; }

    serialize() { return { done: this.done, escapes: this.escapes, maxStars: this.maxStars }; }
    load(s) { if (!s) { this._backfill = true; return; } this.done = s.done || {}; this.escapes = s.escapes || 0; this.maxStars = s.maxStars || 0; }
}
memoStatics(Goals, 'TRACKS');
