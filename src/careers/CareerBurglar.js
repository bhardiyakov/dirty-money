// ============================================================================
// Carreira: LADRÃO — invasão e assalto a propriedades, só stealth (sem confronto).
//   Olheiro de Fita        LEVANTAR A FITA: ficar perto da casa de um rico sem chamar atenção (andando, sem arma, sem polícia
//                          olhando — o DISFARCE de "companhia de luz" deixa trabalhar com polícia por perto). Vira uma FITA (intel).
//   Arrombador             INVASÃO NOTURNA (20h–5h): na casa, E vasculha (joias, eletrônicos, dinheiro). Correr faz BARULHO
//                          (a skill Furtividade diminui); barulho cheio arma o alarme — a Eletrônica dá segundos para abafar
//                          antes que ele dispare. Eletrônicos PESAM (você fica mais lento) e só viram dinheiro no RECEPTADOR.
//                          Cada fita usada rende mais duas gavetas.
//                          ARROMBAR COMÉRCIO: loja FECHADA, à noite; a porta pede o mini-game de fechadura (Eletrônica ajuda).
//                          Correr dentro da área solta uma ONDA SONORA: pedestres num raio (menor com Furtividade) se assustam e a
//                          polícia que ouvir vem conferir.
//   Especialista em Cofres GRANDE ASSALTO (agência bancária): PLANEJAMENTO — cortar a energia do quarteirão na CAIXA DE FORÇA
//                          (mini-game; desliga câmeras e laser) e SUBORNAR O VIGIA (botão na aba, R$ 3.000) — depois o COFRE
//                          TEMPORIZADO (ficar no local; Eletrônica encurta). Sem energia cortada, o laser dispara no meio; sem vigia
//                          comprado, ele aperta o botão de pânico. Por fim, FUGA: leve o malote até a favela ou para longe, sem
//                          procurado.
// ============================================================================

class BurglarCareer extends Career {
    constructor(mgr) {
        super(mgr, {
            id: 'burglar', name: 'LADRÃO', icon: '🕵', color: '#9a7aff',
            desc: 'Invasão silenciosa: estude a casa, entre de noite, leve o que couber e suma antes do alarme.',
            ranks: [
                { name: 'Olheiro de Fita', xp: 0, desc: 'Levanta a rotina e os alarmes das casas ricas.' },
                { name: 'Arrombador', xp: 1200, desc: 'Invade casas à noite: joias, eletrônicos e dinheiro vivo.' },
                { name: 'Especialista em Cofres', xp: 5500, desc: 'Grande assalto a agência: caixa de força, vigia, cofre temporizado e fuga.' },
            ],
            skills: {
                furtividade: { name: 'Furtividade', desc: '−10% de barulho dos passos e das gavetas por nível' },
                eletronica: { name: 'Eletrônica', desc: '+1,5 s para abafar o alarme antes que ele dispare, por nível' },
            },
        });
        this.data = { intel: 0, goods: 0, weight: 0, disguise: 0 };
    }

    get fence() { return this.mgr.favelaSpot(7702, 0.18, 0.4); }          // receptador (fixo)

    jobs() {
        return [
            { id: 'scout', rank: 0, name: 'Levantar a fita', pay: 'R$ 250 + 1 fita', make: () => new ScoutJob(this),
                desc: 'Vá até a casa marcada e fique por perto ~20 s sem correr, sem arma na mão e sem polícia olhando (com disfarce, a polícia não liga). A fita rende mais gavetas na invasão.' },
            { id: 'house', rank: 1, name: 'Invasão noturna', pay: 'joias + eletrônicos', make: () => new BurglaryJob(this),
                check: () => { const h = this.g.dayNight.hour; return (h >= 20 || h < 5) ? null : `Invasão só de noite (20h–5h) — agora são ${this.g.dayNight.label}`; },
                desc: 'De noite, entre na casa marcada e vasculhe com E. Correr faz barulho; barulho cheio arma o alarme. Eletrônicos pesam e só viram dinheiro no receptador da favela.' },
            { id: 'store', rank: 1, name: 'Arrombar comércio', pay: 'caixa + mercadoria', make: () => new BurglaryJob(this, 'store'),
                check: () => { const h = this.g.dayNight.hour; return (h >= 21 || h < 5) ? null : `Comércio só de madrugada (21h–5h) — agora são ${this.g.dayNight.label}`; },
                desc: 'Loja fechada: abra a porta no mini-game de fechadura (errar faz barulho) e vasculhe o caixa e o estoque. Mesma regra de barulho da invasão.' },
            { id: 'heist', rank: 2, name: 'Grande assalto (agência)', pay: 'R$ 15.000–40.000', make: () => new HeistJob(this),
                desc: 'Planeje: corte a energia na caixa de força (desliga câmeras e laser) e suborne o vigia aqui na aba. Depois abra o cofre temporizado parado no local e fuja com o malote até a favela (ou para longe) sem procurado.' },
        ];
    }

    panel() {
        const d = this.data, job = this.mgr.job, heist = job instanceof HeistJob ? job : null;
        const plan = heist ? `<h3 style="font-size:13px">PLANO DO ASSALTO — ${heist.bank.name}</h3>
            <div class="cr-row"><span>Energia do quarteirão</span><b>${heist.power ? 'CORTADA ✔' : 'ligada (câmeras e laser)'}</b></div>
            <div class="cr-row"><span>Vigia</span><b>${heist.bribed ? 'COMPRADO ✔' : 'leal (botão de pânico)'}</b></div>
            <div class="cr-btns"><button data-act="bribe" ${heist.bribed || heist.stage >= 2 ? 'disabled' : ''}>Subornar o vigia (${brl(3000)})</button></div>` : '';
        return plan + `<div class="cr-row"><span>Fitas levantadas</span><b>${d.intel}/5</b></div>
            <div class="cr-row"><span>Eletrônicos na mochila</span><b>${brl(d.goods)} · ${d.weight} kg</b></div>
            <div class="cr-row"><span>Disfarce (usos)</span><b>${d.disguise}</b></div>
            <div class="cr-btns"><button data-act="disguise">Uniforme da companhia de luz (${brl(300)}, 3 usos)</button></div>
            <p class="cr-dim">Venda os eletrônicos no receptador da favela (marcado no mapa quando você está carregando).</p>`;
    }

    action(name) {
        if (name === 'bribe') {
            const job = this.mgr.job, inv = this.g.inventory;
            if (!(job instanceof HeistJob)) return 'Nenhum assalto planejado';
            if (job.bribed) return 'O vigia já está comprado';
            if (inv.cash < 3000) return `Faltam ${brl(3000 - inv.cash)}`;
            inv.cash -= 3000; job.bribed = true;
            return 'Vigia comprado: ele vai olhar para o outro lado';
        }
        if (name === 'disguise') {
            const inv = this.g.inventory;
            if (inv.cash < 300) return 'Faltam ' + brl(300 - inv.cash);
            inv.cash -= 300; this.data.disguise += 3;
            return 'Uniforme comprado: a polícia não estranha você levantando fita (3 usos)';
        }
        return null;
    }

    update() { }                                                            // (o peso da carga entra no Bags.weight)

    prompt() {
        if (this.data.goods <= 0 || this.g.mode !== 'player') return '';
        const p = this.g.player.position, f = this.fence;
        if (Math.hypot(p.x - f.x, p.z - f.z) > 3) return '';
        return `<b>E</b> vender eletrônicos ao receptador<small>${brl(this.data.goods)} em mercadoria → ${brl(this._fencePay())} na mão</small>`;
    }
    _fencePay() { return Math.round(this.data.goods * 0.6); }

    interact() {
        if (!this.prompt()) return false;
        const pay = this._fencePay();
        this.g.inventory.addCash(pay);
        this.g._flash(`Receptador pagou ${brl(pay)} pelos eletrônicos`);
        this.addXp(Math.round(this.data.goods / 60));
        this.data.goods = 0; this.data.weight = 0;
        AudioFX.blip(1000, 0.15, 0.18);
        return true;
    }

}

class ScoutJob extends CareerJob {
    constructor(c) { super(c, { title: 'LEVANTAR A FITA', text: 'Observe a casa marcada sem chamar atenção', limit: 300 }); this.prog = 0; this.need = 20; }

    start() {
        const home = this.mgr.richHome(this.g._playerState().pos, 50, 420, 4) || this.mgr.richHome(this.g._playerState().pos, 30, 900, 3);
        if (!home) { this.why = 'Nenhuma casa rica no radar'; return false; }
        this.home = home;
        this.disguised = this.c.data.disguise > 0;
        if (this.disguised) this.c.data.disguise--;
        this.text = `Observe: ${home.type} (${home.region})${this.disguised ? ' — de uniforme' : ''}`;
        this.target(home.x, home.z, 'Casa a observar');
        return true;
    }

    status() {
        if (this.prog <= 0) return 'VÁ ATÉ A CASA';
        return `FITA ${crBar(this.prog / this.need)}${this._why ? ' · ' + this._why : ''}`;
    }

    update(dt, pos) {
        this._why = '';
        if (!this.near(pos, 9)) return;
        const g = this.g;
        if (g.mode !== 'player') this._why = 'A PÉ';
        else if (g.input.isSprinting() && g.player.speed > 5) this._why = 'SEM CORRER';
        else if (g.player.weapon !== 'none') this._why = 'GUARDE A ARMA';
        else if (!this.disguised && this.mgr.copDist(pos) < 20) this._why = 'POLÍCIA OLHANDO';
        if (this._why) return;
        this.prog += dt;
        if (this.prog >= this.need) {
            this.c.data.intel = Math.min(5, this.c.data.intel + 1);
            this.succeed(250, 70, `fita levantada (${this.home.type}) — ${this.c.data.intel} fita(s)`);
        }
    }
}

class BurglaryJob extends CareerJob {
    // kind: 'house' (casa de rico) | 'store' (comércio fechado: porta com mini-game de fechadura)
    constructor(c, kind = 'house') {
        super(c, kind === 'store' ? { title: 'ARROMBAR COMÉRCIO', text: 'Abra a loja fechada e limpe o caixa', limit: 480 } : { title: 'INVASÃO NOTURNA', text: 'Entre na casa marcada e vasculhe sem fazer barulho', limit: 540 });
        this.kind = kind;
        this.noise = 0; this.alarmT = -1; this.alarm = false;
        this.left = kind === 'store' ? 3 : 4; this.loot = []; this.busy = 0; this._wave = 0;
    }

    start() {
        const p = this.g._playerState().pos, hour = this.g.dayNight.hour;
        if (this.kind === 'store') {
            const shop = this.mgr.cityDoor(p, 40, 500, (d) => d.district !== 'favela' && !Economy.isOpen(d.style, hour));
            if (!shop) { this.why = 'Nenhuma loja fechada por perto'; return false; }
            this.home = { x: shop.x, z: shop.z, stars: Math.max(2, Math.round(3 * (Economy.zoneOf(shop).mul || 1))), type: shop.name, region: Economy.zoneOf(shop).label };
            this.text = `${shop.name} (${this.home.region}) — fechada`;
            this.target(shop.x, shop.z, 'Loja para arrombar');
            return true;
        }
        const home = this.mgr.richHome(p, 50, 450, 3) || this.mgr.richHome(p, 30, 1200, 3);
        if (!home) { this.why = 'Nenhuma casa boa por perto'; return false; }
        this.home = home;
        if (this.c.data.intel > 0) { this.c.data.intel--; this.left += 2; this.intel = true; }
        this.text = `${home.type} (${home.region})${this.intel ? ' — você tem a fita: +2 gavetas' : ''}`;
        this.target(home.x, home.z, 'Casa para invadir');
        return true;
    }

    get mul() { return Math.max(0.2, 1 - 0.1 * this.c.skill('furtividade') - (SkillTree.m.noise || 0)); }

    status() {
        if (this.stage === 0) return 'CHEGUE À PORTA';
        return `BARULHO ${crBar(this.noise / 100, 8)}${this.alarmT >= 0 ? ` · ALARME EM ${Math.ceil(this.alarmT)}s` : ''}${this.alarm ? ' · ALARME!' : ''}`;
    }

    hud() { const h = super.hud(); if (this.alarmT >= 0 || this.alarm) h.low = true; return h; }

    prompt() {
        if (this.g.mode !== 'player' || this.busy > 0) return '';
        const p = this.g.player.position;
        if (this.stage === 0) return this.near(p, 3.5) ? (this.kind === 'store' ? '<b>E</b> arrombar a porta da loja<small>mini-game de fechadura: errar faz barulho</small>' : '<b>E</b> forçar a porta e entrar<small>silêncio: ande, não corra</small>') : '';
        if (!this.near(p, 6)) return '<b>SAIA</b> da área para encerrar a invasão<small>ou volte para a casa e continue vasculhando</small>';
        return this.left > 0 ? `<b>E</b> vasculhar (${this.left} lugar${this.left > 1 ? 'es' : ''})<small>cada gaveta faz um pouco de barulho</small>` : '<b>NADA MAIS</b> aqui — saia de fininho';
    }

    interact() {
        const g = this.g, p = g.player.position;
        if (g.mode !== 'player' || this.busy > 0) return false;
        if (this.stage === 0) {
            if (!this.near(p, 3.5)) return false;
            if (this.kind === 'store') {                                         // porta de loja: mini-game de fechadura
                if (g.lockpick.active) return true;
                this.mgr.act('pick', 30);
                g.lockpick.start({ difficulty: 1.15 * (1 - 0.06 * this.c.skill('eletronica')), onEnd: (res) => {
                    if (g.player.action && g.player.action.name === 'pick') g.player.action.timer = 0;
                    if (res === 'ok') { this.stage = 1; this.noise = 20 * this.mul; this.text = 'Vasculhe o caixa e o estoque com E; saia da área para terminar'; }
                    else if (res === 'alarm') { this.stage = 1; this.noise = 100; this.text = 'A porta cedeu no tranco — o alarme armou!'; }
                } });
                return true;
            }
            this.stage = 1; this.noise = 25 * this.mul;
            this.mgr.act('pick', 1.2);
            this.text = 'Vasculhe com E; correr faz barulho; saia da área para terminar';
            return true;
        }
        if (!this.near(p, 6) || this.left <= 0 || g.player.busy) return false;
        this.mgr.act('rummage', 2.0);
        this.busy = 2.0;
        this.noise += 12 * this.mul;
        return true;
    }

    _roll() {
        const g = this.g, r = Math.random(), d = this.c.data, stars = this.home.stars;
        this.left--;
        if (this.kind === 'store') {                                              // caixa registradora e estoque
            if (r < 0.55) { const v = Math.round((200 + Math.random() * 700) * stars / 3); g.inventory.addCash(v); this.loot.push(brl(v)); g._flash(`Caixa registradora: +${brl(v)}`); }
            else if (r < 0.9) { const v = Math.round((250 + Math.random() * 600) * stars / 3); d.goods += v; d.weight += 2; this.loot.push('mercadoria'); g._flash(`Mercadoria (${brl(v)}) +2 kg — venda no receptador`); }
            else { this.loot.push('nada'); g._flash('Gaveta vazia…'); }
            AudioFX.blip(620, 0.08, 0.12);
            return;
        }
        if (r < 0.3) { const v = Math.round((80 + Math.random() * 320) * stars / 3); g.inventory.addCash(v); this.loot.push(brl(v)); g._flash(`Dinheiro vivo: +${brl(v)}`); }
        else if (r < 0.62) { const v = Math.round((300 + Math.random() * 1200) * stars / 3.5); g.inventory.addJewel(v); this.loot.push('joia'); g._flash(`Joia (${brl(v)}) — venda na boca`); }
        else if (r < 0.9) { const v = Math.round((400 + Math.random() * 900) * stars / 3.5); d.goods += v; d.weight += 3; this.loot.push('eletrônico'); g._flash(`Eletrônico (${brl(v)}) +3 kg — venda no receptador`); }
        else { this.loot.push('nada'); g._flash('Gaveta vazia…'); }
        AudioFX.blip(620, 0.08, 0.12);
    }

    update(dt, pos) {
        const g = this.g;
        if (this.busy > 0) { this.busy -= dt; if (this.busy <= 0) this._roll(); }
        if (this.stage === 0) return;
        if (!this.near(pos, 12)) {                                                    // saiu da área: acabou
            if (!this.loot.length) { this.fail('saiu de mãos vazias'); return; }
            const got = this.loot.filter((x) => x !== 'nada').length;
            this.succeed(0, 70 + 30 * got + (this.alarm ? 0 : 40), `invasão concluída: ${this.loot.join(', ')}${this.alarm ? '' : ' (sem alarme: bônus)'}`);
            return;
        }
        const sp = g.mode === 'player' ? g.player.speed : 0;
        this.noise += (sp > 5.5 ? 16 : (sp > 0.6 ? 1.5 : 0)) * this.mul * dt;
        if (sp > 5.5) {                                                          // ONDA SONORA dos passos rápidos (raio menor com Furtividade)
            this._wave -= dt;
            if (this._wave <= 0) {
                this._wave = 0.6;
                const R = 10 * this.mul;
                const npc = this.mgr.watcher(pos, R);
                if (npc) { npc.panic(pos); g.wanted.reportCrime(); }
                if (this.mgr.copDist(pos) < R * 1.6) { g.wanted.reportCrime(); if (g.policeManager) g.policeManager.alertNear(pos, R * 1.6); }
            }
        }
        this.noise = Math.max(0, this.noise - 5 * dt);
        if (this.alarm) return;
        if (this.alarmT < 0 && this.noise >= 100) { this.alarmT = 2.5 + 1.5 * this.c.skill('eletronica'); g._flash('⚠ O sensor do alarme armou — fique parado para abafar!'); }
        if (this.alarmT >= 0) {
            if (this.noise < 60) { this.alarmT = -1; g._flash('Alarme abafado'); return; }
            this.alarmT -= dt;
            if (this.alarmT <= 0) {
                this.alarm = true; this.alarmT = -1;
                g.wanted.ensureLevel(1);
                if (g.policeManager) g.policeManager.alertNear(pos, 180);
                if (g.npcManager) g.npcManager.alertViolence(pos, 20);
                g._flash('🚨 ALARME DISPAROU! A polícia está vindo — pegue o que der e suma');
            }
        }
    }
}

class HeistJob extends CareerJob {
    constructor(c) {
        super(c, { title: 'GRANDE ASSALTO', text: 'Planejamento: corte a energia na caixa de força (opcional)', limit: 900 });
        this.power = false; this.bribed = false; this.prog = 0; this.laser = false; this.panic = false; this.loot = 0;
    }

    start() {
        const p = this.g._playerState().pos;
        const bank = this.mgr.cityDoor(p, 60, 700, (d) => d.district !== 'favela' && d.district !== 'island' && (d.biome === 'downtown' || d.biome === 'commercial'));
        if (!bank) { this.why = 'Nenhuma agência no radar'; return false; }
        this.bank = { x: bank.x, z: bank.z, name: 'Agência ' + ['Banco Central do Prazer', 'Banco do Litoral', 'Caixa Federal', 'Banco Nacional'][Math.floor(Math.random() * 4)] + ' (ao lado de ' + bank.name + ')' };
        let box = null;
        for (let t = 0; t < 20 && !box; t++) { const a = Math.random() * Math.PI * 2, q = this.mgr.streetNear(bank.x + Math.cos(a) * 28, bank.z + Math.sin(a) * 28, 12); if (q && Math.hypot(q.x - bank.x, q.z - bank.z) > 14) box = q; }
        this.box = box || { x: bank.x + 20, z: bank.z };
        this.target(this.box.x, this.box.z, 'Caixa de força do quarteirão');
        return true;
    }

    status() {
        const plan = `ENERGIA ${this.power ? '✔' : '✖'} · VIGIA ${this.bribed ? '✔' : '✖'}`;
        if (this.stage <= 1) return plan;
        if (this.stage === 2) return `COFRE ${crBar(this.prog)}${this.laser ? ' · LASER!' : ''}${this.panic ? ' · PÂNICO!' : ''}`;
        return `FUJA COM ${brl(this.loot)}${this.g.wanted.level ? ' · DESPISTE A POLÍCIA' : ''}`;
    }
    hud() { const h = super.hud(); if (this.laser || this.panic) h.low = true; return h; }

    prompt() {
        const g = this.g; if (g.mode !== 'player' || g.lockpick.active) return '';
        const p = g.player.position;
        if (this.stage === 0 && Math.hypot(p.x - this.box.x, p.z - this.box.z) < 3) return '<b>E</b> abrir a caixa de força e cortar a energia<small>mini-game: errar dá curto (alarme do quarteirão)</small>';
        if (this.stage <= 1 && Math.hypot(p.x - this.bank.x, p.z - this.bank.z) < 4) return `<b>E</b> invadir e abrir o cofre temporizado<small>${this.power ? 'energia cortada' : 'câmeras e laser LIGADOS'} · ${this.bribed ? 'vigia comprado' : 'vigia vai apertar o pânico (suborne na aba O)'}</small>`;
        return '';
    }

    interact() {
        const g = this.g; if (g.mode !== 'player' || g.lockpick.active || g.player.busy) return false;
        const p = g.player.position;
        if (this.stage === 0 && Math.hypot(p.x - this.box.x, p.z - this.box.z) < 3) {
            this.mgr.act('pick', 30);
            g.lockpick.start({ difficulty: 1.3 * (1 - 0.07 * this.c.skill('eletronica')), onEnd: (res) => {
                if (g.player.action && g.player.action.name === 'pick') g.player.action.timer = 0;
                if (res === 'ok') { this.power = true; g._flash('⚡ Energia cortada: câmeras e laser desligados'); }
                else if (res === 'alarm') { g.wanted.reportCrime(); if (g.policeManager) g.policeManager.alertNear(p, 120); g._flash('Curto-circuito! O alarme do quarteirão tocou — a energia continua ligada'); }
                else return;
                this.stage = 1; this.text = 'Vá até a agência e abra o cofre (suborne o vigia na aba O)';
                this.target(this.bank.x, this.bank.z, 'Agência bancária');
            } });
            return true;
        }
        if (this.stage <= 1 && Math.hypot(p.x - this.bank.x, p.z - this.bank.z) < 4) {
            this.stage = 2; this.prog = 0; this.tx = this.bank.x; this.tz = this.bank.z;
            this.text = 'Fique no cofre até o temporizador abrir';
            this.mgr.act('rummage', 2);
            if (!this.bribed) { this.panic = true; g.wanted.ensureLevel(2); if (g.policeManager) g.policeManager.alertNear(p, 300); g._flash('🚨 O vigia apertou o botão de pânico!'); }
            return true;
        }
        return false;
    }

    update(dt, pos) {
        const g = this.g;
        if (this.stage === 0 && Math.hypot(pos.x - this.bank.x, pos.z - this.bank.z) < 6) { this.stage = 1; this.text = 'Você pulou a caixa de força: câmeras e laser ligados'; this.target(this.bank.x, this.bank.z, 'Agência bancária'); }      // foi direto à agência
        if (this.stage === 2) {
            if (Math.hypot(pos.x - this.bank.x, pos.z - this.bank.z) > 7) { this.stage = 1; this.prog = 0; this.text = 'Você saiu do cofre: o temporizador zerou'; return; }
            const dur = Math.max(12, 30 - 3 * this.c.skill('eletronica'));
            this.prog += dt / dur;
            if (!this.power && !this.laser && this.prog > 0.4) { this.laser = true; g.wanted.ensureLevel(3); if (g.policeManager) g.policeManager.alertNear(pos, 400); g._flash('🚨 LASER! O sensor pegou você — a polícia está vindo pesado'); }
            if (this.prog >= 1) {
                this.loot = Math.round((15000 + Math.random() * 25000) * (this.power ? 1 : 0.85) / 100) * 100;
                this.stage = 3; this.t = Math.max(this.t, 300);
                this.text = 'Fuja com o malote: chegue à favela ou suma (sem procurado, longe da agência)';
                const f = this.mgr.favelaSpot(7703, 0.1, 0.3);
                this.target(f.x, f.z, 'Esconderijo do malote');
                g._flash(`💰 Cofre aberto: ${brl(this.loot)} no malote — agora fuja!`);
            }
            return;
        }
        if (this.stage === 3) {
            const far = Math.hypot(pos.x - this.bank.x, pos.z - this.bank.z) > 220, safe = Standing.inFavela(pos.x, pos.z);
            if ((safe || far) && g.wanted.level === 0 && this.power && this.bribed && g.achievements) g.achievements.bump('heistClean');
            if ((safe || far) && g.wanted.level === 0) this.succeed(this.loot, 400 + this.loot / 100, `assalto à ${this.bank.name.split(' (')[0]}${this.power && this.bribed ? ' — trabalho limpo' : ''}`);
        }
    }

    dispose() { if (this.g.lockpick.active) this.g.lockpick.cancel(); }
}
