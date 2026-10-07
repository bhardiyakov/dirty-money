// ============================================================================
// Carreira: ESTELIONATO — engenharia social e cibercrime, quase tudo na interface (pouca física, leve para o celular).
//   Pescador de Dados      CHUPA-CABRA: instalar o skimmer num caixa eletrônico (fachada de loja fora da favela) quando ninguém
//                          está olhando (pedestre perto ou polícia pausa a instalação; polícia colada = flagrante), esperar e
//                          voltar para recolher os DADOS. Furtar (C) gente em bairro rico às vezes rende um CELULAR desbloqueado.
//   Clonador / Golpista    CENTRAL DE GOLPES (em casa ou na favela): cada golpe gasta 1 dado; a Lábia aumenta a chance e o lucro.
//                          Cada golpe enche a barra de RASTREIO da Delegacia de Crimes Cibernéticos (a skill TI enche menos);
//                          VPN/proxy esvazia. Rastreio cheio = a polícia chega (★★) e os dados são apreendidos.
//                          Tipos de golpe: FALSO PARENTE (seguro, pouco), FALSA CENTRAL DO BANCO (médio) e BOLETO/PIX FALSO PARA
//                          EMPRESAS (2 dados, muito dinheiro, muito rastreio). Rastreio cheio estando na central = BATIDA: a polícia
//                          arromba a porta e você tem segundos para DESTRUIR OS HDs (apertar E/clicar várias vezes; TI ajuda).
//   Operador de Botnet     INVASÃO CORPORATIVA (plugar o dispositivo numa sede sem ser visto → DOSSIÊ → CHANTAGEM paga em dinheiro
//                          LIMPO), LAVAGEM VIA CRIPTO (sujo → limpo) e LAVAR PARA AS FACÇÕES (renda limpa diária, rastreio diário).
// ============================================================================

class ScamCareer extends Career {
    constructor(mgr) {
        super(mgr, {
            id: 'scam', name: 'ESTELIONATO', icon: '💻', color: '#35e0ff',
            desc: 'Dados de cartão, celulares e golpes por telefone. Lucro alto, risco no rastreio — não na bala.',
            ranks: [
                { name: 'Pescador de Dados', xp: 0, desc: 'Chupa-cabra em caixa eletrônico e celulares furtados.' },
                { name: 'Clonador / Golpista', xp: 1200, desc: 'Central de golpes: esvazia contas sem sair de casa.' },
                { name: 'Operador de Botnet', xp: 6000, desc: 'Invasão corporativa e chantagem, cripto e lavagem para as facções.' },
            ],
            skills: {
                ti: { name: 'TI', desc: '−12% de rastreio por golpe e instalação do skimmer mais rápida, por nível' },
                labia: { name: 'Lábia', desc: '+6% de chance de a vítima cair e +10% de lucro por golpe, por nível' },
            },
        });
        this.data = { data: 0, trace: 0, dossier: 0, service: false };
        this.raid = null;
    }

    jobs() {
        return [
            { id: 'skim', rank: 0, name: 'Chupa-cabra', pay: '3–6 dados', make: () => new SkimJob(this),
                desc: 'Instale o skimmer no caixa eletrônico marcado quando ninguém estiver olhando, espere ~40 s e volte para recolher os dados. Dica: furtar (C) gente em bairro rico rende celulares.' },
            { id: 'corp', rank: 2, name: 'Invasão corporativa', pay: '1 dossiê → chantagem', make: () => new CorpHackJob(this),
                desc: 'Vá até a sede marcada e fique plugado no servidor ~15 s sem ninguém olhando. O dossiê vira chantagem (dinheiro LIMPO) na aba, em casa ou na favela.' },
        ];
    }

    onPickpocket(npc, pos) {
        const loc = RealEstate.locate(pos.x, pos.z);
        if (loc.idx < 0.3 || Math.random() > 0.35) return;
        this.data.data++;
        this.addXp(12);
        this.g._flash(`📱 Levou também um celular desbloqueado: +1 dado (${this.data.data})`);
    }

    update(dt) { if (this.data.trace > 0 && !this.raid) this.data.trace = Math.max(0, this.data.trace - dt * 0.12); }

    onNewDay() {
        const d = this.data;
        if (!d.service || this.rank < 2) return;
        const v = 2500 + 300 * this.skill('labia');
        this.g.inventory.clean += v;
        this.addXp(30);
        this.g._flash(`💻 Lavagem das facções: +${brl(v)} limpos` + this._trace(15));
    }

    // ---- BATIDA: a polícia arromba a porta da central. Tela própria (fora do loop do jogo: funciona com o menu aberto ou numa casa).
    _startRaid() {
        const g = this.g, need = Math.max(4, 11 - this.skill('ti'));
        if (g.menu && g.menu.isOpen) g.menu.close();
        this.raid = { left: 8, hits: 0, need };
        const el = this._raidEl || (this._raidEl = document.createElement('div'));
        el.id = 'crRaid';
        el.style.cssText = 'position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(60,0,10,0.6);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);font-family:var(--font);color:#fff;text-align:center;cursor:pointer;user-select:none';
        document.body.appendChild(el);
        const hit = () => { if (!this.raid) return; this.raid.hits++; AudioFX.blip(300 + this.raid.hits * 40, 0.05, 0.12); this._raidDraw(); if (this.raid.hits >= this.raid.need) this._endRaid(true); };
        this._raidKey = (e) => { if (e.key === 'e' || e.key === 'E' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); hit(); } };
        this._raidClick = (e) => { e.preventDefault(); hit(); };
        window.addEventListener('keydown', this._raidKey, true);
        el.addEventListener('pointerdown', this._raidClick);
        this._raidTimer = setInterval(() => { if (!this.raid) return; this.raid.left -= 0.1; this._raidDraw(); if (this.raid.left <= 0) this._endRaid(false); }, 100);
        this._raidDraw();
        AudioFX.blip(160, 0.5, 0.25);
    }
    _raidDraw() {
        const r = this.raid; if (!r || !this._raidEl) return;
        this._raidEl.innerHTML = `<div style="font-size:30px;color:#ff5a4d;text-shadow:0 0 18px #f00">🚨 BATIDA! A POLÍCIA ESTÁ ARROMBANDO A PORTA</div>
            <div style="font-size:18px">DESTRUA OS HDs: aperte <b style="color:#ffd23a">E</b> (ou toque na tela) ${r.need} vezes</div>
            <div style="font-size:44px;color:#ffd23a">${r.hits}/${r.need}</div><div style="font-size:16px">${Math.max(0, r.left).toFixed(1)} s</div>`;
    }
    _endRaid(ok) {
        const g = this.g, d = this.data, inv = g.inventory;
        clearInterval(this._raidTimer);
        window.removeEventListener('keydown', this._raidKey, true);
        if (this._raidEl) { this._raidEl.removeEventListener('pointerdown', this._raidClick); this._raidEl.remove(); }
        this.raid = null; d.data = 0; d.dossier = 0;
        if (ok && g.achievements) g.achievements.bump('raidWon');
        if (ok) { d.trace = 20; g.wanted.ensureLevel(1); g._flash('💥 HDs destruídos! Não sobrou prova — saia daí antes que entrem'); this.addXp(60); }
        else { const lost = Math.round(inv.cash * 0.35); inv.cash -= lost; d.trace = 40; g.wanted.addStars(3, 'cyber'); g._flash(`🚔 Pegaram os servidores! Apreenderam ${brl(lost)} e os dados — FUJA!`); }
        if (g.policeManager) g.policeManager.alertNear(g.player.position, 320);
    }

    get chance() { return Math.min(0.92, 0.45 + 0.06 * this.skill('labia') + (SkillTree.m.labia || 0) * 0.375); }

    panel() {
        const d = this.data, tr = Math.round(d.trace), here = this.mgr.atBase();
        let html = `<div class="cr-row"><span>Dados de cartão / celulares</span><b>${d.data}</b></div>
            <div class="cr-bar"><span>RASTREIO (CRIMES CIBERNÉTICOS)</span><i><s style="width:${tr}%;background:${tr > 70 ? '#ff3a2a' : '#35c8ff'}"></s></i></div>`;
        if (this.rank < 1) return html + '<p class="cr-dim">Na patente GOLPISTA você abre a central de golpes (em casa ou na favela).</p>';
        html += `<div class="cr-row"><span>Chance de cair no golpe</span><b>${Math.round(this.chance * 100)}%</b></div>
            <p class="cr-dim">${here ? 'Central aberta aqui.' : 'A central só funciona em casa ou na favela.'}</p>
            <div class="cr-btns">`;
        for (const [k, T] of Object.entries(ScamCareer.TYPES)) {
            const lock = this.rank < T.rank;
            html += `<button data-act="scam" data-arg="${k}" ${here && d.data >= T.data && !lock ? '' : 'disabled'}>${T.name} — ${T.data} dado(s), ${Math.round(Math.min(0.95, Math.max(0.05, this.chance + T.chance)) * 100)}% de chance, ${brl(T.min)}–${brl(T.max)}, rastreio +${T.trace}${lock ? ` (${this.ranks[T.rank].name})` : ''}</button>`;
        }
        for (const [b, n] of Object.entries(Banks.backdoor)) html += `<button data-act="transfer" data-arg="${b}" ${here ? '' : 'disabled'}>Transferência via laranjas — ${Banks.BRANDS[b].name} (porta aberta por ${n} dia(s))</button>`;
        html += `<button data-act="vpn" ${tr > 0 ? '' : 'disabled'}>Trocar VPN / proxy (${brl(250)}, −35% rastreio)</button>`;
        if (this.rank >= 2) html += `<button data-act="crypto" ${here ? '' : 'disabled'}>Lavar via cripto: ${brl(5000)} sujo → ${brl(4250)} limpo (+12% rastreio)</button>
            <button data-act="blackmail" ${here && d.dossier > 0 ? '' : 'disabled'}>Chantagear com um dossiê (${d.dossier}) — ${brl(8000)}–${brl(20000)} LIMPO, rastreio +35</button>
            <button data-act="service">${d.service ? '✔ Lavando para as facções (renda limpa diária) — clique para parar' : 'Lavar para as facções: +' + brl(2500 + 300 * this.skill('labia')) + ' limpo por dia, rastreio +15/dia'}</button>`;
        return html + '</div>';
    }

    static get TYPES() {
        return {
            parente: { name: 'Falso parente no WhatsApp', rank: 1, data: 1, chance: 0.15, min: 150, max: 450, trace: 8 },
            banco: { name: 'Falsa central do banco', rank: 1, data: 1, chance: 0, min: 350, max: 950, trace: 14 },
            empresa: { name: 'Boleto / Pix falso para empresas', rank: 1, data: 2, chance: -0.15, min: 1500, max: 4000, trace: 28 },
        };
    }

    _trace(n) {
        const d = this.data, g = this.g;
        d.trace = Math.min(100, d.trace + n * (1 - 0.12 * this.skill('ti')));
        if (d.trace < 100) return '';
        if (this.mgr.atBase() && !this.raid) { this._startRaid(); return ' · 🚨 RASTREADO: A POLÍCIA ESTÁ ARROMBANDO A PORTA!'; }
        d.trace = 30; d.data = 0;
        g.wanted.addStars(2, 'cyber');
        if (g.policeManager) g.policeManager.alertNear(g.player.position, 320);
        return ' · 🚨 RASTREADO! A polícia está a caminho e apreendeu seus dados';
    }

    action(name, arg) {
        const d = this.data, inv = this.g.inventory;
        if (this.raid) return 'BATIDA EM ANDAMENTO — destrua os HDs!';
        if (name === 'scam') {
            const T = ScamCareer.TYPES[arg] || ScamCareer.TYPES.banco;
            if (this.rank < T.rank) return 'Só para Golpista';
            if (!this.mgr.atBase()) return 'A central só funciona em casa ou na favela';
            if (d.data < T.data) return 'Sem dados suficientes — instale chupa-cabras ou furte celulares';
            d.data -= T.data;
            if (this.g.achievements) this.g.achievements.bump('scams');
            const ok = Math.random() < Math.min(0.95, Math.max(0.05, this.chance + T.chance));
            const v = ok ? Math.round((T.min + Math.random() * (T.max - T.min)) * (1 + 0.1 * this.skill('labia')) * (this.g.empire ? this.g.empire.fx('scam') : 1)) : 0;
            if (ok) inv.addCash(v);
            this.addXp(ok ? 20 + v / 40 : 8);
            AudioFX.blip(ok ? 950 : 220, 0.12, 0.15);
            return (ok ? `${T.name}: a vítima caiu, +${brl(v)}` : `${T.name}: desconfiou e desligou na sua cara`) + this._trace(T.trace);
        }
        if (name === 'transfer') return Banks.transfer(this.g, arg);
        if (name === 'blackmail') {
            if (this.rank < 2) return 'Só para Operador de Botnet';
            if (!this.mgr.atBase()) return 'Só em casa ou na favela';
            if (d.dossier <= 0) return 'Sem dossiê — faça uma invasão corporativa';
            d.dossier--;
            const v = Math.round((8000 + Math.random() * 12000) * (1 + 0.1 * this.skill('labia')) / 100) * 100;
            inv.clean += v;
            this.addXp(160);
            return `A diretoria pagou para o dossiê sumir: +${brl(v)} LIMPOS` + this._trace(35);
        }
        if (name === 'service') {
            if (this.rank < 2) return 'Só para Operador de Botnet';
            d.service = !d.service;
            return d.service ? 'Você agora lava o dinheiro das facções: renda limpa todo dia (e rastreio)' : 'Parou de lavar para as facções';
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

// Invasão corporativa (Operador de Botnet): plugar o dispositivo no servidor de uma sede sem ninguém ver.
class CorpHackJob extends CareerJob {
    constructor(c) { super(c, { title: 'INVASÃO CORPORATIVA', text: 'Plugue o dispositivo no servidor da sede marcada', limit: 480 }); this.prog = 0; this._why = ''; }
    start() {
        const p = this.g._playerState().pos, d = this.mgr.cityDoor(p, 60, 700, (q) => q.district !== 'favela' && q.biome === 'downtown') || this.mgr.cityDoor(p, 60, 900, (q) => q.district !== 'favela');
        if (!d) { this.why = 'Nenhuma sede no radar'; return false; }
        this.corp = ['Holding Atlântica S.A.', 'Construtora Prazer Mar', 'Grupo Litoral Seguros', 'Petrobrisa Energia'][Math.floor(Math.random() * 4)];
        this.text = `Sede da ${this.corp} (ao lado de ${d.name})`;
        this.target(d.x, d.z, 'Sede corporativa');
        return true;
    }
    status() { return this.prog > 0 ? `DOWNLOAD ${crBar(this.prog)}${this._why ? ' · ' + this._why : ''}` : 'CHEGUE À SEDE'; }
    update(dt, pos) {
        const g = this.g; this._why = '';
        if (!this.near(pos, 4) || g.mode !== 'player') { if (this.prog > 0) this._why = 'VOLTE AO SERVIDOR'; return; }
        if (this.mgr.copDist(pos) < 20) this._why = 'POLÍCIA OLHANDO';
        else if (this.mgr.watcher(pos, 7)) this._why = 'TEM GENTE OLHANDO';
        if (this._why) return;
        this.prog += dt / Math.max(8, 15 - this.c.skill('ti'));
        if (this.prog >= 1) { this.c.data.dossier++; this.succeed(0, 180, `dossiê da ${this.corp} copiado — chantageie na aba O`); }
    }
}
memoStatics(ScamCareer, 'TYPES');
