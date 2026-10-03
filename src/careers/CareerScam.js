// ============================================================================
// Carreira: ESTELIONATO — engenharia social e cibercrime, quase tudo na interface (pouca física, leve para o celular).
//   Pescador de Dados      CHUPA-CABRA: instalar o skimmer num caixa eletrônico (fachada de loja fora da favela) quando ninguém
//                          está olhando (pedestre perto ou polícia pausa a instalação; polícia colada = flagrante), esperar e
//                          voltar para recolher os DADOS. Furtar (C) gente em bairro rico às vezes rende um CELULAR desbloqueado.
//   Clonador / Golpista    CENTRAL DE GOLPES (em casa ou na favela): cada golpe gasta 1 dado; a Lábia aumenta a chance e o lucro.
//                          Cada golpe enche a barra de RASTREIO da Delegacia de Crimes Cibernéticos (a skill TI enche menos);
//                          VPN/proxy esvazia. Rastreio cheio = a polícia chega (★★) e os dados são apreendidos.
//   Operador de Botnet     LAVAGEM VIA CRIPTO (sujo → limpo) e, em breve, invasão de bancos de dados e defesa dos servidores.
// ============================================================================

class ScamCareer extends Career {
    constructor(mgr) {
        super(mgr, {
            id: 'scam', name: 'ESTELIONATO', icon: '💻', color: '#35e0ff',
            desc: 'Dados de cartão, celulares e golpes por telefone. Lucro alto, risco no rastreio — não na bala.',
            ranks: [
                { name: 'Pescador de Dados', xp: 0, desc: 'Chupa-cabra em caixa eletrônico e celulares furtados.' },
                { name: 'Clonador / Golpista', xp: 500, desc: 'Central de golpes: esvazia contas sem sair de casa.' },
                { name: 'Operador de Botnet', xp: 2500, desc: 'Lava dinheiro em cripto; invasões corporativas (em breve).' },
            ],
            skills: {
                ti: { name: 'TI', desc: '−12% de rastreio por golpe e instalação do skimmer mais rápida, por nível' },
                labia: { name: 'Lábia', desc: '+6% de chance de a vítima cair e +10% de lucro por golpe, por nível' },
            },
        });
        this.data = { data: 0, trace: 0 };
    }

    jobs() {
        return [
            { id: 'skim', rank: 0, name: 'Chupa-cabra', pay: '3–6 dados', make: () => new SkimJob(this),
                desc: 'Instale o skimmer no caixa eletrônico marcado quando ninguém estiver olhando, espere ~40 s e volte para recolher os dados. Dica: furtar (C) gente em bairro rico rende celulares.' },
            { id: 'botnet', rank: 2, name: 'Invasão corporativa', pay: '—', soon: true, make: () => null,
                desc: 'Em breve: roubo de dados para chantagem e a defesa dos seus servidores quando a polícia arrombar a porta.' },
        ];
    }

    onPickpocket(npc, pos) {
        const loc = RealEstate.locate(pos.x, pos.z);
        if (loc.idx < 0.3 || Math.random() > 0.35) return;
        this.data.data++;
        this.addXp(12);
        this.g._flash(`📱 Levou também um celular desbloqueado: +1 dado (${this.data.data})`);
    }

    update(dt) { if (this.data.trace > 0) this.data.trace = Math.max(0, this.data.trace - dt * 0.12); }

    get chance() { return Math.min(0.92, 0.45 + 0.06 * this.skill('labia')); }

    panel() {
        const d = this.data, tr = Math.round(d.trace), here = this.mgr.atBase();
        let html = `<div class="cr-row"><span>Dados de cartão / celulares</span><b>${d.data}</b></div>
            <div class="cr-bar"><span>RASTREIO (CRIMES CIBERNÉTICOS)</span><i><s style="width:${tr}%;background:${tr > 70 ? '#ff3a2a' : '#35c8ff'}"></s></i></div>`;
        if (this.rank < 1) return html + '<p class="cr-dim">Na patente GOLPISTA você abre a central de golpes (em casa ou na favela).</p>';
        html += `<div class="cr-row"><span>Chance de cair no golpe</span><b>${Math.round(this.chance * 100)}%</b></div>
            <p class="cr-dim">${here ? 'Central aberta aqui.' : 'A central só funciona em casa ou na favela.'}</p>
            <div class="cr-btns"><button data-act="scam" ${here && d.data > 0 ? '' : 'disabled'}>Aplicar golpe (gasta 1 dado)</button>
            <button data-act="vpn" ${tr > 0 ? '' : 'disabled'}>Trocar VPN / proxy (${brl(250)}, −35% rastreio)</button>`;
        if (this.rank >= 2) html += `<button data-act="crypto" ${here ? '' : 'disabled'}>Lavar via cripto: ${brl(5000)} sujo → ${brl(4250)} limpo (+12% rastreio)</button>`;
        return html + '</div>';
    }

    _trace(n) {
        const d = this.data, g = this.g;
        d.trace = Math.min(100, d.trace + n * (1 - 0.12 * this.skill('ti')));
        if (d.trace < 100) return '';
        d.trace = 30; d.data = 0;
        g.wanted.addStars(2, 'cyber');
        if (g.policeManager) g.policeManager.alertNear(g.player.position, 320);
        return ' · 🚨 RASTREADO! A polícia está a caminho e apreendeu seus dados';
    }

    action(name) {
        const d = this.data, inv = this.g.inventory;
        if (name === 'scam') {
            if (this.rank < 1) return 'Só para Golpista';
            if (!this.mgr.atBase()) return 'A central só funciona em casa ou na favela';
            if (d.data <= 0) return 'Sem dados — instale chupa-cabras ou furte celulares';
            d.data--;
            const ok = Math.random() < this.chance;
            const v = ok ? Math.round((300 + Math.random() * 600) * (1 + 0.1 * this.skill('labia'))) : 0;
            if (ok) inv.addCash(v);
            this.addXp(ok ? 30 : 10);
            AudioFX.blip(ok ? 950 : 220, 0.12, 0.15);
            return (ok ? `A vítima caiu: +${brl(v)}` : 'Desconfiou e desligou na sua cara') + this._trace(14);
        }
        if (name === 'vpn') {
            if (inv.cash < 250) return 'Faltam ' + brl(250 - inv.cash);
            inv.cash -= 250; d.trace = Math.max(0, d.trace - 35);
            return 'Nova VPN e proxies: rastreio −35%';
        }
        if (name === 'crypto') {
            if (this.rank < 2) return 'Só para Operador de Botnet';
            if (!this.mgr.atBase()) return 'Só em casa ou na favela';
            if (inv.cash < 5000) return `Precisa de ${brl(5000)} de dinheiro sujo`;
            inv.cash -= 5000; inv.clean += 4250;
            this.addXp(40);
            return `Lavou ${brl(5000)} em cripto → ${brl(4250)} limpos` + this._trace(12);
        }
        return null;
    }
}

class SkimJob extends CareerJob {
    constructor(c) { super(c, { title: 'CHUPA-CABRA', text: 'Instale o skimmer no caixa eletrônico marcado', limit: 420 }); this.prog = 0; this.wait = 0; this.flagged = false; this._why = ''; }

    start() {
        const atm = this.mgr.cityDoor(this.g._playerState().pos, 40, 320, (d) => d.district !== 'favela' && ['mart', 'pharmacy', 'bakery', 'burger', 'italian', 'japanese'].includes(d.style));
        if (!atm) { this.why = 'Nenhum caixa eletrônico por perto'; return false; }
        this.atm = atm;
        this.text = `Caixa eletrônico em frente a: ${atm.name}`;
        this.target(atm.x, atm.z, 'Caixa eletrônico');
        return true;
    }

    status() {
        if (this.stage === 0) return 'CHEGUE AO CAIXA';
        if (this.stage === 1) { return `INSTALANDO ${crBar(this.prog)}${this._why ? ' · ' + this._why : ''}`; }
        return this.wait > 0 ? `COLETANDO DADOS… ${Math.ceil(this.wait)}s` : 'PRONTO: RECOLHA';
    }

    prompt() {
        if (this.g.mode !== 'player') return '';
        const p = this.g.player.position;
        if (!this.near(p, 2.4)) return '';
        if (this.stage === 0) return '<b>E</b> instalar o chupa-cabra<small>só quando ninguém estiver olhando</small>';
        if (this.stage === 2 && this.wait <= 0) return '<b>E</b> recolher o skimmer com os dados';
        return '';
    }

    interact() {
        const g = this.g;
        if (g.mode !== 'player' || !this.near(g.player.position, 2.4)) return false;
        if (this.stage === 0) { this.stage = 1; this.prog = 0; this.mgr.act('pick', 0.8); return true; }
        if (this.stage === 2 && this.wait <= 0) {
            const n = 3 + Math.floor(Math.random() * 4);
            this.c.data.data += n;
            this.mgr.act('pick', 0.6);
            this.succeed(0, 80, `skimmer recolhido: +${n} dados`);
            return true;
        }
        return false;
    }

    update(dt, pos) {
        const g = this.g;
        if (this.stage === 1) {
            if (!this.near(pos, 3)) { this.stage = 0; g._flash('Você se afastou: instalação cancelada'); return; }
            this._why = '';
            const cop = this.mgr.copDist(pos);
            if (cop < 10 && !this.flagged) { this.flagged = true; g.wanted.reportCrime(); g._flash('Um policial te viu mexendo no caixa!'); }
            if (cop < 20) this._why = 'POLÍCIA OLHANDO';
            else if (this.mgr.watcher(pos, 7)) this._why = 'TEM GENTE OLHANDO';
            if (this._why) return;
            this.prog += dt / Math.max(3, 7 - 0.6 * this.c.skill('ti'));
            if (this.prog >= 1) { this.stage = 2; this.wait = 40; this.text = 'Skimmer instalado: espere os cartões passarem e volte para recolher'; g._flash('Chupa-cabra instalado — afaste-se e volte em ~40 s'); }
        } else if (this.stage === 2 && this.wait > 0) {
            this.wait -= dt;
            if (this.wait <= 0) g._flash('O skimmer já tem dados — vá recolher');
        }
    }
}
