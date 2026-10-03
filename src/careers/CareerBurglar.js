// ============================================================================
// Carreira: LADRÃO — invasão e assalto a propriedades, só stealth (sem confronto).
//   Olheiro de Fita        LEVANTAR A FITA: ficar perto da casa de um rico sem chamar atenção (andando, sem arma, sem polícia
//                          olhando — o DISFARCE de "companhia de luz" deixa trabalhar com polícia por perto). Vira uma FITA (intel).
//   Arrombador             INVASÃO NOTURNA (20h–5h): na casa, E vasculha (joias, eletrônicos, dinheiro). Correr faz BARULHO
//                          (a skill Furtividade diminui); barulho cheio arma o alarme — a Eletrônica dá segundos para abafar
//                          antes que ele dispare. Eletrônicos PESAM (você fica mais lento) e só viram dinheiro no RECEPTADOR.
//                          Cada fita usada rende mais duas gavetas.
//   Especialista em Cofres (em breve) transportadoras e bancos: caixa de força, vigias, laser e cofre temporizado.
// ============================================================================

class BurglarCareer extends Career {
    constructor(mgr) {
        super(mgr, {
            id: 'burglar', name: 'LADRÃO', icon: '🕵', color: '#9a7aff',
            desc: 'Invasão silenciosa: estude a casa, entre de noite, leve o que couber e suma antes do alarme.',
            ranks: [
                { name: 'Olheiro de Fita', xp: 0, desc: 'Levanta a rotina e os alarmes das casas ricas.' },
                { name: 'Arrombador', xp: 500, desc: 'Invade casas à noite: joias, eletrônicos e dinheiro vivo.' },
                { name: 'Especialista em Cofres', xp: 2200, desc: 'Transportadoras e agências bancárias (em breve).' },
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
            { id: 'bank', rank: 2, name: 'Transportadora / banco', pay: '—', soon: true, make: () => null,
                desc: 'Em breve: cortar a energia do quarteirão, subornar vigias, desativar laser e abrir cofre temporizado.' },
        ];
    }

    panel() {
        const d = this.data;
        return `<div class="cr-row"><span>Fitas levantadas</span><b>${d.intel}/5</b></div>
            <div class="cr-row"><span>Eletrônicos na mochila</span><b>${brl(d.goods)} · ${d.weight} kg</b></div>
            <div class="cr-row"><span>Disfarce (usos)</span><b>${d.disguise}</b></div>
            <div class="cr-btns"><button data-act="disguise">Uniforme da companhia de luz (${brl(300)}, 3 usos)</button></div>
            <p class="cr-dim">Venda os eletrônicos no receptador da favela (marcado no mapa quando você está carregando).</p>`;
    }

    action(name) {
        if (name === 'disguise') {
            const inv = this.g.inventory;
            if (inv.cash < 300) return 'Faltam ' + brl(300 - inv.cash);
            inv.cash -= 300; this.data.disguise += 3;
            return 'Uniforme comprado: a polícia não estranha você levantando fita (3 usos)';
        }
        return null;
    }

    update() { this.g.player.loadMul = Math.max(0.6, 1 - this.data.weight * 0.045); }       // carga pesada: corre menos

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
    constructor(c) {
        super(c, { title: 'INVASÃO NOTURNA', text: 'Entre na casa marcada e vasculhe sem fazer barulho', limit: 540 });
        this.noise = 0; this.alarmT = -1; this.alarm = false;
        this.left = 4; this.loot = []; this.busy = 0;
    }

    start() {
        const p = this.g._playerState().pos, home = this.mgr.richHome(p, 50, 450, 3) || this.mgr.richHome(p, 30, 1200, 3);
        if (!home) { this.why = 'Nenhuma casa boa por perto'; return false; }
        this.home = home;
        if (this.c.data.intel > 0) { this.c.data.intel--; this.left += 2; this.intel = true; }
        this.text = `${home.type} (${home.region})${this.intel ? ' — você tem a fita: +2 gavetas' : ''}`;
        this.target(home.x, home.z, 'Casa para invadir');
        return true;
    }

    get mul() { return 1 - 0.1 * this.c.skill('furtividade'); }

    status() {
        if (this.stage === 0) return 'CHEGUE À PORTA';
        return `BARULHO ${crBar(this.noise / 100, 8)}${this.alarmT >= 0 ? ` · ALARME EM ${Math.ceil(this.alarmT)}s` : ''}${this.alarm ? ' · ALARME!' : ''}`;
    }

    hud() { const h = super.hud(); if (this.alarmT >= 0 || this.alarm) h.low = true; return h; }

    prompt() {
        if (this.g.mode !== 'player' || this.busy > 0) return '';
        const p = this.g.player.position;
        if (this.stage === 0) return this.near(p, 3.5) ? '<b>E</b> forçar a porta e entrar<small>silêncio: ande, não corra</small>' : '';
        if (!this.near(p, 6)) return '<b>SAIA</b> da área para encerrar a invasão<small>ou volte para a casa e continue vasculhando</small>';
        return this.left > 0 ? `<b>E</b> vasculhar (${this.left} lugar${this.left > 1 ? 'es' : ''})<small>cada gaveta faz um pouco de barulho</small>` : '<b>NADA MAIS</b> aqui — saia de fininho';
    }

    interact() {
        const g = this.g, p = g.player.position;
        if (g.mode !== 'player' || this.busy > 0) return false;
        if (this.stage === 0) {
            if (!this.near(p, 3.5)) return false;
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
