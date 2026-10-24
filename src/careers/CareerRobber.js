// ============================================================================
// Carreira: ASSALTANTE — assalto à mão armada a lojas e os GOLPES planejados em joalherias (crime/Robbery.js, crime/Heists.js).
//   Pé-de-chinelo     comércio PEQUENO: conveniência, padaria, lanchonete, farmácia, saladas.
//   Assaltante        comércio MÉDIO: bar, pizzaria, boutique, academia.
//   Profissional      comércio de LUXO (restaurantes finos, loja de armas — balconista armado), VITRINES de joalheria e os golpes nas
//                     joalherias de bairro (quadro do golpe, com equipe).
//   Mestre do Golpe   o GRANDE GOLPE na joalheria do centro e a equipe de elite (★★★).
// Skills: INTIMIDAÇÃO (o medo sobe mais rápido e cai mais devagar; grito mais forte; o escudo humano convence) e SANGUE-FRIO (faz a limpa
// mais rápido e a polícia demora mais a chegar).
// Painel: números do crime, o INQUÉRITO (advogado) e o quadro dos golpes.
// ============================================================================

class RobberCareer extends Career {
    constructor(mgr) {
        super(mgr, {
            id: 'robber', name: 'ASSALTANTE', icon: '🔫', color: '#f43f5e',
            desc: 'Assalto à mão armada: controle os reféns, faça a limpa antes da polícia e não deixe rastro. Começa nas lojinhas e termina no grande golpe.',
            ranks: [
                { name: 'Pé-de-chinelo', xp: 0, desc: 'Comércio pequeno: conveniência, padaria, lanchonete, farmácia.' },
                { name: 'Assaltante', xp: 1200, desc: 'Comércio médio: bar, pizzaria, boutique, academia.' },
                { name: 'Profissional', xp: 4500, desc: 'Luxo, loja de armas, vitrines de joalheria e golpes planejados em joalherias de bairro.' },
                { name: 'Mestre do Golpe', xp: 10000, desc: 'O grande golpe na joalheria do centro, com a equipe de elite.' },
            ],
            skills: {
                intimidacao: { name: 'Intimidação', desc: '+15% de medo por nível (reféns e atendente obedecem mais e se acalmam mais devagar)' },
                sanguefrio: { name: 'Sangue-frio', desc: 'Faz a limpa 7% mais rápido e a polícia demora +7% a chegar, por nível' },
            },
        });
        this.data = { robs: 0, best: 0, total: 0 };
    }

    jobs() {
        return [
            { id: 'contract', rank: 0, name: 'Encomenda do receptador', pay: 'bônus por porte', make: () => new RobContractJob(this),
                desc: 'O receptador quer "um serviço" numa loja específica (do seu porte). Assalte a loja marcada (com o que conseguir pegar) e suma: sem estrelas e longe da área. O bônus vem além do que você levar.' },
        ];
    }

    onRobbery(shop, how, total) {
        const j = this.mgr.job;
        if (j instanceof RobContractJob && j.shop && j.shop.id === shop.id) j.robbed(how, total);
    }

    panel() {
        const d = this.data, g = this.g, T = Traces, B = Panel.btn;
        const tiers = [1, 2, 3, 4].map((t) => `<div class="cr-row"><span>${['', '🏪 Pequeno (conveniência, padaria, lanchonete, farmácia)', '🍺 Médio (bar, pizzaria, boutique, academia)', '🍝 Luxo (restaurante fino, loja de armas)', '💎 Joalheria (vitrines)'][t]}</span><b>${this.rank >= Robbery.RANK_FOR[t] ? '✔' : this.ranks[Robbery.RANK_FOR[t]].name}</b></div>`).join('');
        const H = typeof Heists !== 'undefined' ? Heists.summary(g) : '';
        return `<div class="cr-row"><span>Assaltos</span><b>${d.robs || 0}</b></div><div class="cr-row"><span>Maior assalto</span><b>${brl(d.best || 0)}</b></div><div class="cr-row"><span>Total roubado</span><b>${brl(d.total || 0)}</b></div>
            <h3 style="font-size:13px;margin-top:6px">PORTE QUE VOCÊ JÁ ASSALTA</h3>${tiers}
            <h3 style="font-size:13px;margin-top:6px">${I18n.t('heat.panel.title')}</h3>
            ${this._recordRows(g.heat)}
            <div class="cr-row"><span>Descrição da sua roupa</span><b>${T.desc ? (T.matches() ? 'BATE COM VOCÊ' : 'roupa trocada') : '—'}</b></div>
            <h3 style="font-size:13px;margin-top:6px">GOLPES (joalherias)</h3>${H}
            <div class="cr-btns"><button data-act="board">🗺 Abrir o quadro do golpe</button></div>
            <p class="cr-dim">Antes de entrar: balaclava (K põe/tira) e uma muda de roupa. Lá dentro: arranque o HD do DVR, não deixe refém fugir e saia antes do cronômetro. Mercadoria pesada vai para o receptador da favela.</p>`;
    }

    // The police record (HeatStateMachine) and its two money sinks: a lawyer on retainer and the hacker who wipes the record.
    _recordRows(heat) {
        const record = heat.record, hacker = heat.hackerQuote();
        const row = (label, value) => `<div class="cr-row"><span>${I18n.t(label)}</span><b>${value}</b></div>`;
        const crimes = record.isDirty
            ? I18n.t('heat.panel.crimesValue', { count: record.count, severity: record.totalSeverity }) + (heat.hasWarrant ? ' · ' + I18n.t('heat.panel.warrant') : '')
            : '—';
        const lawyer = heat.hasLawyer ? I18n.t('heat.panel.lawyerUntil', { hours: Math.ceil(heat.lawyerUntil - heat.now()) }) : '—';
        return row('heat.panel.state', I18n.t('heat.state.' + heat.state))
            + row('heat.panel.crimes', crimes)
            + row('heat.panel.lawyerRow', lawyer)
            + `<div class="cr-btns">
                <button data-act="lawyer" ${heat.hasLawyer ? 'disabled' : ''}>${I18n.t('heat.panel.lawyerButton', { cost: brl(HEAT_TUNING.lawyer.retainer), days: HEAT_TUNING.lawyer.days })}</button>
                <button data-act="hacker" ${hacker ? '' : 'disabled'}>${hacker ? I18n.t('heat.panel.hackerButton', { cost: brl(hacker) }) : I18n.t('heat.panel.hackerNothing')}</button>
            </div>`;
    }

    action(name) {
        if (name === 'lawyer') return this.g.heat.hireLawyer();
        if (name === 'hacker') return this.g.heat.hireHacker();
        if (name === 'board') { if (this.g.menu.isOpen) this.g.menu.close(); Heists.openBoard(this.g); return null; }
        return null;
    }
}

// Encomenda: uma loja do seu porte, longe da favela; assaltou e sumiu = bônus.
class RobContractJob extends CareerJob {
    constructor(c) { super(c, { title: 'ENCOMENDA', text: 'Assalte a loja marcada e suma', limit: 900 }); this.done = false; }
    start() {
        const g = this.g, p = g._playerState().pos, top = [1, 2, 3].filter((t) => this.c.rank >= Robbery.RANK_FOR[t]).pop() || 1;
        const shop = this.mgr.cityDoor(p, 70, 650, (d) => d.district !== 'favela' && !d.bank && Robbery.tierOf(d) >= Math.max(1, top - 1) && Robbery.tierOf(d) <= top && Robbery.tierOf(d) < 4 && !Robbery.closedToday(d) && !(typeof Business !== 'undefined' && Business.isOwned(d)));
        if (!shop) { this.why = 'O receptador não tem encomenda agora'; return false; }
        this.shop = shop; this.tier = Robbery.tierOf(shop);
        this.text = `${shop.name} (${Economy.zoneOf(shop).label}) — ${Robbery.TIER_NAME[this.tier]}${Economy.isOpen(shop.style, g.dayNight.hour) ? '' : ` · abre às ${Economy.opensAt(shop.style)}h`}`;
        this.target(shop.x, shop.z, 'Loja da encomenda', '#f43f5e');
        return true;
    }
    robbed(how, total) {
        if (total <= 0) return;
        this.done = true; this.loot = total;
        this.text = 'Feito! Agora suma: sem estrelas e longe da loja';
        this.tx = null; this.mgr.unmark();
    }
    status() { return this.done ? (this.g.wanted.level ? 'DESPISTE A POLÍCIA' : 'SUMA DA ÁREA') : 'VÁ ATÉ A LOJA'; }
    update(dt, pos) {
        if (!this.done || Interiors.active) return;
        const far = hypot(pos.x - this.shop.x, pos.z - this.shop.z) > 160;
        if (far && this.g.wanted.level === 0 && !(Traces.search && hypot(pos.x - Traces.search.x, pos.z - Traces.search.z) < Traces.search.r)) {
            const pay = [0, 700, 1600, 3400][this.tier] || 700;
            this.succeed(pay, 120 * this.tier, `encomenda entregue (${this.shop.name})`);
        }
    }
}
