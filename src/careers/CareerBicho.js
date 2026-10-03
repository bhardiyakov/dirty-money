// ============================================================================
// Carreira: JOGO DO BICHO — contravenção: monopólio, arrego e aceitação social (sem apostas individuais no gameplay).
//   Apontador          ABRIR A BANCA: ficar na banca da calçada durante o turno (o malote enche; polícia perto = "rapa", leva
//                      metade) e levar o MALOTE ao QG do bicheiro antes de fechar. No caminho, a pé, pivetes tentam levar o
//                      malote — com uma arma na mão eles desistem. Paga a comissão do apontador.
//   Recolhedor de Rota ROTA DO RECOLHE: passar por 3 apontadores pela cidade e levar tudo ao QG; com muito dinheiro na rota,
//                      blitz e interceptações (a skill Segurança diminui).
//   Banqueiro          GESTÃO (menu): PONTOS por zona da cidade com renda diária; ARREGO diário por zona (a Influência barateia;
//                      sem dinheiro sujo para o arrego, a polícia fecha bancas). GUERRA FRIA: rivais tomam pontos — compre o passe
//                      dos apontadores deles ou contrate um matador para paralisar a família rival por 3 dias.
//   Patrono de Escola  FINANCIAR A ESCOLA DE SAMBA (dinheiro limpo): IMUNIDADE POLÍTICA (Careers.immunity) — a Receita quase não
//                      sobe com lavagem e desmanches; parte da renda das bancas já entra limpa.
// ============================================================================

class BichoCareer extends Career {
    constructor(mgr) {
        super(mgr, {
            id: 'bicho', name: 'JOGO DO BICHO', icon: '🦁', color: '#5ac07a',
            desc: 'Não é guerra, é monopólio: bancas, arrego, influência — até virar patrono de escola de samba.',
            ranks: [
                { name: 'Apontador', xp: 0, desc: 'Toca a banca da calçada e leva o malote ao cofre.' },
                { name: 'Recolhedor de Rota', xp: 600, desc: 'Recolhe o dinheiro de vários apontadores pela cidade.' },
                { name: 'Banqueiro', xp: 2500, desc: 'Administra pontos por zona, arrego e a guerra fria contra rivais.' },
                { name: 'Patrono de Escola de Samba', xp: 9000, desc: 'A escola lava o capital e compra imunidade política.' },
            ],
            skills: {
                influencia: { name: 'Influência', desc: '−8% de arrego por nível e passe de apontador rival mais barato' },
                seguranca: { name: 'Segurança', desc: '−12% de chance de assalto ao malote e de blitz na rota, por nível' },
            },
        });
        this.data = { zones: {}, rivalCalm: 0, school: false, bancas: 0 };
        for (const z of Object.keys(BichoCareer.ZONES)) this.data.zones[z] = 0;
    }

    static get ZONES() { return { downtown: 'Centro', commercial: 'Comércio', residential: 'Bairros residenciais', industrial: 'Zona industrial', island: 'Ilha' }; }
    static zoneKey(d) { return d.district === 'island' ? 'island' : (BichoCareer.ZONES[d.biome] ? d.biome : 'commercial'); }

    // QG do bicheiro: um bar fixo da cidade (fora da favela).
    get qg() {
        if (this._qg) return this._qg;
        Interiors.index();
        const bars = Interiors._doors.filter((d) => d.district !== 'favela' && d.district !== 'island' && d.style === 'bar').sort((a, b) => (a.id < b.id ? -1 : 1));
        const d = bars[Math.floor(bars.length * 0.37)] || Interiors._doors[0];
        return (this._qg = { x: d.x, z: d.z, name: d.name });
    }

    jobs() {
        return [
            { id: 'banca', rank: 0, name: 'Abrir a banca', pay: 'comissão do malote', make: () => new BancaJob(this),
                desc: 'Fique na banca marcada durante o turno (polícia perto = rapa). Depois leve o malote ao QG do bicheiro antes de fechar. A pé, pivetes tentam levar o malote: arma na mão os espanta.' },
            { id: 'rota', rank: 1, name: 'Rota do recolhe', pay: '12% da rota', make: () => new RouteJob(this),
                desc: 'Passe por 3 apontadores e leve tudo ao QG dentro do prazo. Muito dinheiro na rota atrai blitz e interceptação.' },
        ];
    }

    get arregoMul() { return 1 - 0.08 * this.skill('influencia'); }
    totalPts() { return Object.values(this.data.zones).reduce((s, v) => s + v, 0); }
    dayIncome() { let s = 0; for (const [z, n] of Object.entries(this.data.zones)) s += n * 520 * (Economy.ZONE[z] ? Economy.ZONE[z].mul : 1); return Math.round(s); }
    dayArrego() { return Math.round(this.totalPts() * 160 * this.arregoMul); }

    panel() {
        const d = this.data;
        let html = `<div class="cr-row"><span>QG do bicheiro</span><b>${this.qg.name}</b></div>`;
        if (this.rank < 2) return html + '<p class="cr-dim">Como BANQUEIRO você compra pontos por zona, paga o arrego e trava a guerra fria contra as famílias rivais.</p>';
        html += `<table class="cr-tab"><tr><th>Zona</th><th>Pontos</th><th></th></tr>`;
        for (const [z, label] of Object.entries(BichoCareer.ZONES)) html += `<tr><td>${label}</td><td>${d.zones[z]}</td><td><button data-act="buy" data-arg="${z}">+ ponto ${brl(6000)}</button></td></tr>`;
        html += `</table><div class="cr-row"><span>Renda por dia</span><b>${brl(this.dayIncome())}</b></div><div class="cr-row"><span>Arrego por dia</span><b>${brl(this.dayArrego())}</b></div>
            <div class="cr-row"><span>Família rival</span><b>${d.rivalCalm > 0 ? `paralisada (${d.rivalCalm} dia(s))` : 'ativa — pode tomar pontos'}</b></div>
            <div class="cr-btns"><button data-act="pass" ${this.totalPts() ? '' : 'disabled'}>Comprar o passe de um apontador rival (${brl(Math.round(9000 * this.arregoMul))})</button>
            <button data-act="hitman">Contratar matador: rival parada por 3 dias (${brl(15000)})</button>`;
        if (this.rank >= 3) html += `<button data-act="school" ${d.school ? 'disabled' : ''}>${d.school ? 'Escola de samba financiada: IMUNIDADE POLÍTICA' : `Financiar a escola de samba (${brl(250000)} limpo)`}</button>`;
        return html + '</div>';
    }

    action(name, arg) {
        const inv = this.g.inventory, d = this.data;
        if (this.rank < 2) return 'Só para Banqueiro';
        if (name === 'buy') {
            if (!(arg in d.zones)) return null;
            if (inv.cash < 6000) return `Faltam ${brl(6000 - inv.cash)} de dinheiro sujo`;
            inv.cash -= 6000; d.zones[arg]++;
            this.addXp(60);
            return `Ponto aberto em ${BichoCareer.ZONES[arg]} (${d.zones[arg]})`;
        }
        if (name === 'pass') {
            const price = Math.round(9000 * this.arregoMul);
            if (inv.cash < price) return `Faltam ${brl(price - inv.cash)}`;
            const zs = Object.keys(d.zones); const z = zs[Math.floor(Math.random() * zs.length)];
            inv.cash -= price; d.zones[z] += 2; d.rivalCalm = Math.max(d.rivalCalm, 1);
            this.addXp(90);
            return `O apontador rival virou casaca: +2 pontos em ${BichoCareer.ZONES[z]}`;
        }
        if (name === 'hitman') {
            if (inv.cash < 15000) return `Faltam ${brl(15000 - inv.cash)}`;
            inv.cash -= 15000; d.rivalCalm = 3;
            this.addXp(120);
            return 'Trabalho limpo: o recolhedor rival sumiu. A família deles fica parada por 3 dias';
        }
        if (name === 'school') {
            if (this.rank < 3) return 'Só para Patrono';
            if (d.school) return 'Você já financia a escola';
            if (inv.clean < 250000) return `Precisa de ${brl(250000)} de dinheiro LIMPO`;
            inv.clean -= 250000; d.school = true; Careers.immunity = true;
            return '🎉 Você é o patrono da escola de samba: IMUNIDADE POLÍTICA e apoio da alta sociedade';
        }
        return null;
    }

    onNewDay() {
        const d = this.data, g = this.g, pts = this.totalPts();
        if (!pts) return;
        const income = this.dayIncome(), arrego = this.dayArrego();
        let msg;
        if (g.inventory.cash + income >= arrego) {
            const net = income - arrego, clean = d.school ? Math.round(net * 0.3) : 0;
            g.inventory.cash += net - clean; g.inventory.clean += clean;
            msg = `🦁 Bancas: ${brl(income)} − arrego ${brl(arrego)}${clean ? ` (${brl(clean)} já limpos)` : ''}`;
        } else {
            const zs = Object.keys(d.zones).filter((z) => d.zones[z] > 0), z = zs[Math.floor(Math.random() * zs.length)];
            d.zones[z] = Math.floor(d.zones[z] / 2);
            msg = `🚨 Sem dinheiro para o arrego: a polícia fechou bancas em ${BichoCareer.ZONES[z]} e prendeu apontadores`;
        }
        if (d.rivalCalm > 0) d.rivalCalm--;
        else if (Math.random() < 0.3) {
            const zs = Object.keys(d.zones).filter((z) => d.zones[z] > 0);
            if (zs.length) { const z = zs[Math.floor(Math.random() * zs.length)]; d.zones[z]--; msg += ` · a família rival tomou um ponto em ${BichoCareer.ZONES[z]}`; }
        }
        g._flash(msg);
    }

    load(s) { super.load(s); for (const z of Object.keys(BichoCareer.ZONES)) if (typeof this.data.zones[z] !== 'number') this.data.zones[z] = 0; if (this.data.school) Careers.immunity = true; }

    // Assalto ao malote (a pé, carregando): chance por tentativa.
    robChance(base) { return base * (1 - 0.12 * this.skill('seguranca')); }
}

class BancaJob extends CareerJob {
    constructor(c) { super(c, { title: 'ABRIR A BANCA', text: 'Vá até a banca marcada', limit: 0 }); this.malote = 0; this.shift = 0; this.need = 60; this.go = 240; this.close = 0; this._rapa = 0; this._rob = 12; }

    start() {
        const spot = this.mgr.cityDoor(this.g._playerState().pos, 30, 260, (d) => d.district !== 'favela');
        if (!spot) { this.why = 'Nenhum ponto livre por perto'; return false; }
        this.spot = spot;
        this.zoneMul = (Economy.ZONE[BichoCareer.zoneKey(spot)] || { mul: 1 }).mul;
        this.target(spot.x, spot.z, 'Banca do bicho');
        return true;
    }

    status() {
        if (this.stage === 0) return `ABRA EM ${Math.ceil(this.go)}s`;
        if (this.stage === 1) { return `TURNO ${crBar(this.shift / this.need)} · MALOTE ${brl(this.malote)}${this._why ? ' · ' + this._why : ''}`; }
        return `MALOTE ${brl(this.malote)} · FECHA EM ${Math.ceil(this.close)}s`;
    }
    hud() { const h = super.hud(); if ((this.stage === 0 && this.go < 30) || (this.stage === 2 && this.close < 30)) h.low = true; return h; }

    prompt() {
        if (this.stage !== 2 || this.g.mode !== 'player') return '';
        return this.near(this.g.player.position, 4) ? `<b>E</b> entregar o malote no QG<small>${brl(this.malote)} — sua comissão é 30%</small>` : '';
    }

    interact() {
        if (this.stage !== 2 || this.g.mode !== 'player' || !this.near(this.g.player.position, 4)) return false;
        this.succeed(this.malote * 0.3, 60 + this.malote / 40, `malote entregue (${brl(this.malote)})`);
        return true;
    }

    update(dt, pos) {
        const g = this.g;
        if (this.stage === 0) {
            this.go -= dt;
            if (this.go <= 0) { this.fail('a banca não abriu — o bicheiro passou o ponto para outro'); return; }
            if (this.near(pos, 5) && g.mode === 'player') { this.stage = 1; this.text = 'Fique na banca até o turno acabar'; g._flash('Banca aberta — fique por perto'); }
            return;
        }
        if (this.stage === 1) {
            this._why = '';
            if (!this.near(pos, 7)) { this._why = 'VOLTE À BANCA'; return; }
            this.shift += dt;
            this.malote += (5 + Math.random() * 6) * this.zoneMul * dt;
            this._rapa -= dt;
            if (this._rapa <= 0 && this.mgr.copDist(pos) < 14) {
                this._rapa = 25;
                const lost = Math.round(this.malote * 0.5); this.malote -= lost;
                g._flash(`👮 Rapa! A polícia levou ${brl(lost)} da banca`);
            }
            if (this.shift >= this.need) {
                this.malote = Math.round(this.malote);
                this.stage = 2; this.close = 300;
                const q = this.c.qg;
                this.text = 'Leve o malote ao QG do bicheiro antes de fechar';
                this.target(q.x, q.z, 'QG do bicheiro');
            }
            return;
        }
        this.close -= dt;
        if (this.close <= 0) { this.fail('o QG fechou — o malote ficou "perdido" (o bicheiro não perdoa)'); return; }
        this._rob -= dt;
        if (this._rob <= 0) {
            this._rob = 12;
            if (g.mode === 'player' && this.malote > 0 && Math.random() < this.c.robChance(0.14)) {
                if (g.player.weapon !== 'none') g._flash('Um pivete encarou o malote, viu sua arma e correu');
                else { const lost = Math.round(this.malote * 0.4); this.malote -= lost; g._flash(`Pivetes arrancaram ${brl(lost)} do malote! (arma na mão espanta)`); }
            }
        }
    }
}

class RouteJob extends CareerJob {
    constructor(c) { super(c, { title: 'ROTA DO RECOLHE', text: 'Recolha os apontadores marcados, em ordem', limit: 540 }); this.cash = 0; this.stops = []; this._blitz = 20; }

    start() {
        const p = this.g._playerState().pos;
        for (let i = 0; i < 3; i++) {
            const from = i ? this.stops[i - 1] : p;
            const d = this.mgr.cityDoor(from, 60, 260, (q) => q.district !== 'favela' && this.stops.every((s) => Math.hypot(s.x - q.x, s.z - q.z) > 50));
            if (!d) break;
            this.stops.push({ x: d.x, z: d.z, name: d.name });
        }
        if (this.stops.length < 3) { this.why = 'Rota indisponível por aqui'; return false; }
        this.target(this.stops[0].x, this.stops[0].z, 'Apontador 1');
        return true;
    }

    status() { return this.stops.length ? `PARADA ${4 - this.stops.length}/3 · ${brl(this.cash)}` : `LEVE AO QG · ${brl(this.cash)}`; }

    prompt() {
        if (this.stops.length || this.g.mode !== 'player') return '';
        return this.near(this.g.player.position, 4) ? `<b>E</b> entregar a rota no QG<small>${brl(this.cash)} — sua parte é 12%</small>` : '';
    }

    interact() {
        if (this.stops.length || this.g.mode !== 'player' || !this.near(this.g.player.position, 4)) return false;
        this.succeed(this.cash * 0.12, 120 + this.cash / 80, `rota entregue (${brl(this.cash)})`);
        return true;
    }

    update(dt, pos) {
        const g = this.g;
        if (this.stops.length && this.near(pos, 6)) {
            const v = Math.round(600 + Math.random() * 900);
            this.cash += v; this.stops.shift();
            g._flash(`Apontador pagou ${brl(v)} (rota: ${brl(this.cash)})`);
            if (this.stops.length) this.target(this.stops[0].x, this.stops[0].z, `Apontador ${4 - this.stops.length}`);
            else { const q = this.c.qg; this.text = 'Leve tudo ao QG do bicheiro'; this.target(q.x, q.z, 'QG do bicheiro'); }
        }
        if (this.cash > 1500) {
            this._blitz -= dt;
            if (this._blitz <= 0) {
                this._blitz = 20;
                if (g.wanted.level === 0 && Math.random() < this.c.robChance(0.18)) { g.wanted.ensureLevel(1); g._flash('🚔 Blitz! Uma viatura desconfiou do volume de dinheiro — despiste'); }
            }
        }
    }
}
