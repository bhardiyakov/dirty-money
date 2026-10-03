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
//                      FAMÍLIA RIVAL: tem pontos em cada zona e toma os seus onde está presente. Para recuperar: comprar o PASSE de
//                      apontadores rivais, PAGAR A POLÍCIA para fechar bancas rivais numa zona, ou QUEIMA DE ARQUIVO (trabalho: eliminar
//                      o recolhedor rival sem testemunha nem polícia por perto — a família fica parada por 3 dias). ESCOLTA de capangas
//                      (custo diário) corta assaltos ao malote e blitz; carro com FUNDO FALSO (Desmanche) faz a blitz passar batido.
//   Patrono de Escola  FINANCIAR A ESCOLA DE SAMBA (dinheiro limpo): IMUNIDADE POLÍTICA (Careers.immunity) enquanto a OPINIÃO PÚBLICA
//                      estiver em 40%+ — a Receita quase não sobe com lavagem e desmanches; parte da renda das bancas já entra limpa.
//                      A opinião cai a cada estrela de procurado e sobe com doações e imprensa; a cada 7 dias tem DESFILE (opinião alta =
//                      patrocínio em dinheiro limpo; baixa = escândalo).
// ============================================================================

class BichoCareer extends Career {
    constructor(mgr) {
        super(mgr, {
            id: 'bicho', name: 'JOGO DO BICHO', icon: '🦁', color: '#5ac07a',
            desc: 'Não é guerra, é monopólio: bancas, arrego, influência — até virar patrono de escola de samba.',
            ranks: [
                { name: 'Apontador', xp: 0, desc: 'Toca a banca da calçada e leva o malote ao cofre.' },
                { name: 'Recolhedor de Rota', xp: 1500, desc: 'Recolhe o dinheiro de vários apontadores pela cidade.' },
                { name: 'Banqueiro', xp: 6000, desc: 'Administra pontos por zona, arrego e a guerra fria contra rivais.' },
                { name: 'Patrono de Escola de Samba', xp: 18000, desc: 'A escola lava o capital e compra imunidade política.' },
            ],
            skills: {
                influencia: { name: 'Influência', desc: '−8% de arrego e de passe/fechamento de bancas rivais, por nível' },
                seguranca: { name: 'Segurança', desc: '−12% de chance de assalto ao malote e de blitz na rota, por nível' },
            },
        });
        this.data = { zones: {}, rival: {}, rivalCalm: 0, school: false, escort: false, opinion: 50, day: 0 };
        for (const z of Object.keys(BichoCareer.ZONES)) { this.data.zones[z] = 0; this.data.rival[z] = 2; }
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
                desc: 'Fique na banca marcada durante o turno (polícia perto = rapa). Depois leve o malote ao QG do bicheiro antes de fechar. A pé, pivetes tentam levar o malote: arma na mão (ou escolta) os espanta.' },
            { id: 'rota', rank: 1, name: 'Rota do recolhe', pay: '12% da rota', make: () => new RouteJob(this),
                desc: 'Passe por 3 apontadores e leve tudo ao QG dentro do prazo. Muito dinheiro na rota atrai blitz — escolta e carro com fundo falso ajudam.' },
            { id: 'hit', rank: 2, name: 'Queima de arquivo', pay: 'rival parada 3 dias', make: () => new HitJob(this),
                desc: 'Ache o recolhedor da família rival e elimine (E) sem testemunha e sem polícia por perto. A família rival perde pontos e fica parada por 3 dias. Com testemunha: procurado.' },
        ];
    }

    get arregoMul() { return 1 - 0.08 * this.skill('influencia'); }
    totalPts() { return Object.values(this.data.zones).reduce((s, v) => s + v, 0); }
    dayIncome() { let s = 0; for (const [z, n] of Object.entries(this.data.zones)) s += n * 520 * (Economy.ZONE[z] ? Economy.ZONE[z].mul : 1); return Math.round(s * (1 + (SkillTree.m.income || 0)) * (this.g.empire ? this.g.empire.fx('bicho') : 1)); }
    dayArrego() { return Math.round(this.totalPts() * 160 * this.arregoMul); }
    escortCost() { return 1500; }
    _immunity() { Careers.immunity = !!(this.data.school && this.data.opinion >= 40); }

    panel() {
        const d = this.data;
        let html = `<div class="cr-row"><span>QG do bicheiro</span><b>${this.qg.name}</b></div>
            <div class="cr-row"><span>Escolta de capangas</span><b>${d.escort ? `contratada (${brl(this.escortCost())}/dia)` : 'não'}</b></div>
            <div class="cr-btns"><button data-act="escort">${d.escort ? 'Dispensar a escolta' : `Contratar escolta (${brl(this.escortCost())} agora e por dia): −60% de assaltos e blitz`}</button></div>`;
        if (this.rank < 2) return html + '<p class="cr-dim">Como BANQUEIRO você compra pontos por zona, paga o arrego e trava a guerra fria contra a família rival.</p>';
        html += `<table class="cr-tab"><tr><th>Zona</th><th>Seus</th><th>Rival</th><th></th><th></th></tr>`;
        const close = Math.round(4000 * this.arregoMul);
        for (const [z, label] of Object.entries(BichoCareer.ZONES)) html += `<tr><td>${label}</td><td>${d.zones[z]}</td><td>${d.rival[z]}</td><td><button data-act="buy" data-arg="${z}">+ ponto ${brl(6000)}</button></td><td><button data-act="close" data-arg="${z}" ${d.rival[z] > 0 ? '' : 'disabled'}>Polícia fecha rival ${brl(close)}</button></td></tr>`;
        html += `</table><div class="cr-row"><span>Renda por dia</span><b>${brl(this.dayIncome())}</b></div><div class="cr-row"><span>Arrego por dia</span><b>${brl(this.dayArrego())}</b></div>
            <div class="cr-row"><span>Família rival</span><b>${d.rivalCalm > 0 ? `paralisada (${d.rivalCalm} dia(s))` : 'ativa — toma pontos onde está presente'}</b></div>
            <div class="cr-btns"><button data-act="pass" ${Object.values(d.rival).some((n) => n > 0) ? '' : 'disabled'}>Comprar o passe de um apontador rival (${brl(Math.round(9000 * this.arregoMul))})</button>
            <button data-act="hitman">Contratar matador: rival parada por 3 dias (${brl(15000)}) — ou faça você mesmo (Queima de arquivo)</button></div>`;
        if (this.rank < 3) return html + '<p class="cr-dim">Como PATRONO você financia a escola de samba: imunidade política enquanto a opinião pública aguentar.</p>';
        const op = Math.round(d.opinion);
        html += `<h3 style="font-size:13px;margin-top:6px">ESCOLA DE SAMBA</h3>
            <div class="cr-bar"><span>OPINIÃO PÚBLICA ${op}% (imunidade só com 40%+)</span><i><s style="width:${op}%;background:${op >= 60 ? '#5ac07a' : (op >= 40 ? '#ffd23a' : '#ff5a4d')}"></s></i></div>
            <div class="cr-row"><span>Imunidade política</span><b>${Careers.immunity ? 'ATIVA' : 'inativa'}</b></div>
            <div class="cr-row"><span>Próximo desfile</span><b>${d.school ? `em ${7 - (d.day % 7)} dia(s)` : '—'}</b></div>
            <div class="cr-btns"><button data-act="school" ${d.school ? 'disabled' : ''}>${d.school ? 'Escola financiada ✔' : `Financiar a escola de samba (${brl(250000)} limpo)`}</button>
            <button data-act="donate">Doar à comunidade (${brl(20000)} limpo, opinião +12)</button>
            <button data-act="press">Comprar a imprensa (${brl(15000)} sujo, opinião +8)</button></div>`;
        return html;
    }

    action(name, arg) {
        const inv = this.g.inventory, d = this.data;
        if (name === 'escort') {
            if (d.escort) { d.escort = false; return 'Escolta dispensada'; }
            if (inv.cash < this.escortCost()) return `Faltam ${brl(this.escortCost() - inv.cash)}`;
            inv.cash -= this.escortCost(); d.escort = true;
            return 'Capangas contratados: o malote e a rota andam escoltados';
        }
        if (this.rank < 2) return 'Só para Banqueiro';
        if (name === 'buy') {
            if (!(arg in d.zones)) return null;
            if (inv.cash < 6000) return `Faltam ${brl(6000 - inv.cash)} de dinheiro sujo`;
            inv.cash -= 6000; d.zones[arg]++;
            this.addXp(60);
            return `Ponto aberto em ${BichoCareer.ZONES[arg]} (${d.zones[arg]})`;
        }
        if (name === 'close') {
            const price = Math.round(4000 * this.arregoMul);
            if (!(arg in d.rival) || d.rival[arg] <= 0) return 'A rival não tem bancas aí';
            if (inv.cash < price) return `Faltam ${brl(price - inv.cash)}`;
            inv.cash -= price; d.rival[arg] = Math.max(0, d.rival[arg] - 2);
            this.addXp(70);
            return `O batalhão fechou bancas da rival em ${BichoCareer.ZONES[arg]} (${d.rival[arg]} restantes)`;
        }
        if (name === 'pass') {
            const price = Math.round(9000 * this.arregoMul);
            if (inv.cash < price) return `Faltam ${brl(price - inv.cash)}`;
            const z = Object.keys(d.rival).sort((a, b) => d.rival[b] - d.rival[a])[0];
            if (!z || d.rival[z] <= 0) return 'A rival não tem apontadores para comprar';
            inv.cash -= price; d.rival[z]--; d.zones[z]++;
            this.addXp(90);
            return `Um apontador rival virou casaca: +1 ponto seu em ${BichoCareer.ZONES[z]} (rival −1)`;
        }
        if (name === 'hitman') {
            if (inv.cash < 15000) return `Faltam ${brl(15000 - inv.cash)}`;
            inv.cash -= 15000; d.rivalCalm = 3;
            this.addXp(120);
            return 'Trabalho limpo: o recolhedor rival sumiu. A família deles fica parada por 3 dias';
        }
        if (this.rank < 3) return 'Só para Patrono';
        if (name === 'school') {
            if (d.school) return 'Você já financia a escola';
            if (inv.clean < 250000) return `Precisa de ${brl(250000)} de dinheiro LIMPO`;
            inv.clean -= 250000; d.school = true; d.day = 0; d.opinion = Math.max(d.opinion, 55); this._immunity();
            return '🎉 Você é o patrono da escola de samba: imunidade política enquanto a opinião pública aguentar';
        }
        if (name === 'donate') {
            if (inv.clean < 20000) return `Precisa de ${brl(20000)} LIMPO`;
            inv.clean -= 20000; d.opinion = Math.min(100, d.opinion + 12); this._immunity();
            return `Doação à comunidade: opinião pública ${Math.round(d.opinion)}%`;
        }
        if (name === 'press') {
            if (inv.cash < 15000) return `Faltam ${brl(15000 - inv.cash)}`;
            inv.cash -= 15000; d.opinion = Math.min(100, d.opinion + 8); this._immunity();
            return `Matérias simpáticas nos jornais: opinião pública ${Math.round(d.opinion)}%`;
        }
        return null;
    }

    // Estrelas de procurado mancham a imagem pública (só pesa para quem tem escola).
    onWanted(n, prev) {
        if (n <= prev || !this.data.school) return;
        this.data.opinion = Math.max(0, this.data.opinion - 2 * (n - prev));
        this._immunity();
    }

    onNewDay() {
        const d = this.data, g = this.g, inv = g.inventory, pts = this.totalPts();
        const msgs = [];
        if (d.escort) { if (inv.cash >= this.escortCost()) inv.cash -= this.escortCost(); else { d.escort = false; msgs.push('a escolta foi embora (sem dinheiro)'); } }
        if (pts) {
            const income = this.dayIncome(), arrego = this.dayArrego();
            if (inv.cash + income >= arrego) {
                const net = income - arrego, clean = Careers.immunity ? Math.round(net * 0.3) : 0;
                inv.cash += net - clean; inv.clean += clean;
                msgs.push(`bancas ${brl(income)} − arrego ${brl(arrego)}${clean ? ` (${brl(clean)} já limpos)` : ''}`);
            } else {
                const zs = Object.keys(d.zones).filter((z) => d.zones[z] > 0), z = zs[Math.floor(Math.random() * zs.length)];
                d.zones[z] = Math.floor(d.zones[z] / 2);
                msgs.push(`🚨 sem dinheiro para o arrego: a polícia fechou bancas em ${BichoCareer.ZONES[z]}`);
            }
        }
        if (d.rivalCalm > 0) d.rivalCalm--;
        else {
            const zs = Object.keys(d.zones).filter((z) => d.zones[z] > 0 && d.rival[z] > 0);
            if (zs.length && Math.random() < 0.35) { const z = zs[Math.floor(Math.random() * zs.length)]; d.zones[z]--; d.rival[z]++; msgs.push(`a família rival tomou um ponto em ${BichoCareer.ZONES[z]}`); }
            else if (Math.random() < 0.25) { const all = Object.keys(d.rival), z = all[Math.floor(Math.random() * all.length)]; d.rival[z]++; }
        }
        if (d.school) {
            d.day++;
            d.opinion = Math.min(100, d.opinion + 1);
            if (d.day % 7 === 0) {
                if (d.opinion >= 60 && g.achievements) g.achievements.bump('parades');
                if (d.opinion >= 60) { const v = 30000; inv.clean += v; d.opinion = Math.min(100, d.opinion + 8); msgs.push(`🎉 DESFILE: a escola brilhou na avenida — patrocínios de ${brl(v)} limpos`); }
                else { d.opinion = Math.max(0, d.opinion - 6); msgs.push('📰 Desfile fraco e escândalo na imprensa: opinião pública em queda'); }
            }
            this._immunity();
        }
        if (msgs.length) g._flash('🦁 ' + msgs.join(' · '));
    }

    load(s) {
        super.load(s);
        for (const z of Object.keys(BichoCareer.ZONES)) {
            if (typeof this.data.zones[z] !== 'number') this.data.zones[z] = 0;
            if (!this.data.rival || typeof this.data.rival[z] !== 'number') { this.data.rival = this.data.rival || {}; this.data.rival[z] = 2; }
        }
        if (typeof this.data.opinion !== 'number') this.data.opinion = 50;
        this._immunity();
    }

    // Assalto ao malote / blitz: chance por tentativa (Segurança e escolta reduzem).
    robChance(base) { return base * (1 - 0.12 * this.skill('seguranca')) * (this.data.escort ? 0.4 : 1); }
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
                if (this.c.data.escort) g._flash('Pivetes rondaram o malote, mas a escolta espantou');
                else if (g.player.weapon !== 'none') g._flash('Um pivete encarou o malote, viu sua arma e correu');
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
                const hidden = g.mode === 'car' && g.activeCar && g.activeCar.mods && g.activeCar.mods.hidden;
                if (g.wanted.level === 0 && Math.random() < this.c.robChance(0.18)) {
                    if (hidden) g._flash('🚔 Blitz! Revistaram o carro, mas o fundo falso escondeu o dinheiro');
                    else { g.wanted.ensureLevel(1); g._flash('🚔 Blitz! Uma viatura desconfiou do volume de dinheiro — despiste'); }
                }
            }
        }
    }
}

// Queima de arquivo (Banqueiro): o recolhedor da família rival está num ponto da cidade; eliminar sem testemunha nem polícia.
class HitJob extends CareerJob {
    constructor(c) { super(c, { title: 'QUEIMA DE ARQUIVO', text: 'Ache o recolhedor rival e faça o serviço sem testemunha', limit: 420 }); this.actor = null; }
    start() {
        const g = this.g, p = g._playerState().pos, d = this.mgr.cityDoor(p, 80, 500, (q) => q.district !== 'favela');
        if (!d) { this.why = 'O recolhedor rival sumiu do mapa'; return false; }
        this.spot = { x: d.x, z: d.z };
        const [va, vb] = CharacterRig.VARIANT_GROUPS.biz;
        this.actor = new SpriteActor(g.scene, g.sprites.sheets.civA, va + Math.floor(Math.random() * (vb - va + 1)), 'recolhedorRival');
        this.actor.play('idle', 'none'); this.actor.setPosition(d.x, d.z); this.actor.setHeading(Math.random() * Math.PI * 2);
        this.text = `O recolhedor rival está perto de ${d.name}`;
        this.target(d.x, d.z, 'Recolhedor rival');
        return true;
    }
    status() { const g = this.g, p = g.player.position; if (!this.near(p, 12)) return ''; const w = this.mgr.watcher(p, 10), cop = this.mgr.copDist(p) < 25; return cop ? 'POLÍCIA POR PERTO' : (w ? 'TEM TESTEMUNHA' : 'LIMPO — AGORA'); }
    prompt() { return this.g.mode === 'player' && this.near(this.g.player.position, 2.4) ? '<b>E</b> fazer o serviço<small>sem testemunha e sem polícia por perto</small>' : ''; }
    interact() {
        const g = this.g, p = g.player.position;
        if (g.mode !== 'player' || g.player.busy || !this.near(p, 2.4)) return false;
        g.player.playAction('punch', { lock: 0.4 });
        this.actor.play('dead', 'none', { restart: true });
        const witness = this.mgr.watcher(p, 10), cop = this.mgr.copDist(p) < 25;
        const d = this.c.data;
        d.rivalCalm = Math.max(d.rivalCalm, 3);
        for (const z of Object.keys(d.rival)) d.rival[z] = Math.max(0, d.rival[z] - 1);
        if (witness || cop) { if (witness) witness.panic(p); g.wanted.reportCrime(); g.wanted.ensureLevel(2); this.succeed(0, 150, 'recolhedor eliminado — mas alguém viu: a polícia está atrás de você'); }
        else this.succeed(0, 260, 'serviço limpo: a família rival perdeu pontos e fica parada por 3 dias');
        return true;
    }
    update(dt) { if (this.actor) this.actor.update(dt, 1); }
    dispose() { const a = this.actor; if (a) { this.g._delayed.push({ t: 6, fn: () => a.dispose() }); this.actor = null; } }
}
