// ============================================================================
// Empire — a camada de IMPÉRIO: o jogo deixa de ser só trabalho manual e vira gestão da cidade (inspirado na interdependência de
// sistemas de Stardew Valley). Este arquivo é o núcleo:
//   • DISTRITOS   a cidade dividida em zonas que respondem diferente (riqueza, polícia, rival, domínio): districtAt(x, z).
//   • CICLO DIÁRIO ENERGIA (gasta com furtos, roubos, combate, corrida e trabalhos; só o sono recupera) × EXPOSIÇÃO (calor do dia:
//                 sobe com crimes e estrelas). Exposição cheia = ALERTA TÁTICO no distrito (a polícia vê muito mais longe até você
//                 dormir). Energia zerada = DESMAIO: confiscam o sujo da mochila (dinheiro, joias,
//                 mercadoria) e cobram propina de hospital/advogado; você acorda em casa. DORMIR zera tudo.
//   • ESTAÇÕES DO CRIME eventos globais de 14/28 dias (Calmaria, Carnaval, Eleições, Intervenção Federal) com avisos antes.
// Os sistemas de gestão (soldados, galpões, rotas de lavagem, influência, domínio) ficam em empire/EmpireSystems.js; a tela, em
// ui/EmpireUI.js (aba IMPÉRIO do menu).
// ============================================================================

class Empire {
    static get DISTRICTS() {
        return {
            favela: { name: 'Favela do Morro', rich: 0.6, police: 0.9 },
            centro: { name: 'Distrito Financeiro', rich: 1.35, police: 1.25 },
            comercio: { name: 'Comércio', rich: 1.0, police: 1.0 },
            residencial: { name: 'Bairros residenciais', rich: 0.95, police: 0.95 },
            orla: { name: 'Orla', rich: 1.2, police: 1.1 },
            industrial: { name: 'Porto e indústria', rich: 0.85, police: 0.85 },
            ilha: { name: 'Ilha Praiana', rich: 1.6, police: 1.3 },
            periferia: { name: 'Periferia', rich: 0.7, police: 0.8 },
        };
    }
    static get BIOME_DISTRICT() { return { downtown: 'centro', commercial: 'comercio', residential: 'residencial', park: 'residencial', forest: 'periferia', beach: 'orla', industrial: 'industrial', port: 'industrial', resort: 'ilha', favela: 'favela' }; }

    // Estações: [id, nome, dias, descrição, efeitos]
    static get SEASONS() {
        return {
            calmaria: { name: 'Calmaria', days: 14, desc: 'A cidade respira: tudo no normal.', fx: {} },
            carnaval: { name: 'Carnaval', days: 14, desc: 'Ruas lotadas: furtos rendem mais, a polícia se distrai e as bancas do bicho faturam o dobro.', fx: { sight: 0.85, theft: 0.12, bicho: 2, crew: 1.2 } },
            eleicoes: { name: 'Eleições', days: 28, desc: 'Político precisa de caixa: presentes valem o dobro na influência e a extorsão de vereadores rende mais; a fiscalização aperta a lavagem.', fx: { gifts: 2, extort: 1.6, launder: 0.8 } },
            intervencao: { name: 'Intervenção Federal', days: 14, desc: 'Exército nas ruas: portos fechados, armas 3× mais caras, a milícia some e a polícia vê mais longe. Hora do colarinho branco (golpes rendem +50%).', fx: { sight: 1.35, guns: 3, noMilitia: true, scam: 1.5, crew: 0.5 } },
        };
    }
    static get SEASON_ORDER() { return ['calmaria', 'carnaval', 'calmaria', 'eleicoes', 'calmaria', 'intervencao']; }

    constructor(game) {
        this.g = game;
        Empire.instance = this;
        this.energy = 100;
        this.exposure = 0;
        this.alerts = {};                 // distrito → true (alerta tático até dormir)
        this.season = { idx: 0, day: 0 };
        this.wokeAt = 0;                  // hora absoluta (dia × 24 + hora) em que acordou pela última vez
        this._dcache = new Map();
        this.biz = new EmpireBusiness(this);
        this.influence = new EmpireInfluence(this);
        this.dominion = new EmpireDominion(this);
    }

    // "Carreira" das missões da malha de influência (usa o espaço de trabalho das carreiras).
    get stub() { return this._stub || (this._stub = new EmpireCareerStub(this.g.careers)); }

    // ---------------------------------------------------------------- distritos
    districtAt(x, z) {
        const k = Math.floor(x / 24) * 100003 + Math.floor(z / 24);
        const hit = this._dcache.get(k);
        if (hit) return hit;
        let d = 'periferia';
        if (Standing.inFavela(x, z)) d = 'favela';
        else {
            for (const [ox, oz] of [[0, 0], [12, 0], [-12, 0], [0, 12], [0, -12], [24, 24], [-24, -24], [24, -24], [-24, 24], [36, 0], [-36, 0], [0, 36], [0, -36]]) {
                const b = CityGrid._blockAtPoint(x + ox, z + oz);
                if (!b) continue;
                d = b.district === 'island' ? 'ilha' : (Empire.BIOME_DISTRICT[b.biome] || 'periferia');
                break;
            }
        }
        this._dcache.set(k, d);
        return d;
    }
    get here() { const p = this.g._playerState().pos; return this.districtAt(p.x, p.z); }
    dName(d) { return (Empire.DISTRICTS[d] || Empire.DISTRICTS.periferia).name; }

    // ---------------------------------------------------------------- estação
    get seasonId() { return Empire.SEASON_ORDER[this.season.idx % Empire.SEASON_ORDER.length]; }
    get seasonDef() { return Empire.SEASONS[this.seasonId]; }
    fx(key, dflt = 1) { const v = this.seasonDef.fx[key]; return v === undefined ? dflt : v; }
    get nextSeason() { return Empire.SEASONS[Empire.SEASON_ORDER[(this.season.idx + 1) % Empire.SEASON_ORDER.length]]; }
    get seasonLeft() { return this.seasonDef.days - this.season.day; }

    // ---------------------------------------------------------------- energia e exposição
    get tired() { return this.energy < 12; }

    // Custo de uma ação (energia gasta, exposição ganha). Ganhos de exposição dobram com alerta já ligado no distrito.
    spend(energy, exposure = 0) {
        this.energy = Math.max(0, this.energy - energy);
        if (exposure > 0) {
            const d = this.here;
            this.exposure = Math.min(100, this.exposure + exposure);
            if (this.exposure >= 100 && !this.alerts[d]) this._alert(d);
        }
        if (this.energy <= 0) this.faint('exaustão');
    }

    _alert(d) {
        this.alerts[d] = true;
        if (d === 'favela') Standing.addHeat(25, 'alerta tático');
        this.g._flash(`🚨 ALERTA TÁTICO em ${this.dName(d)}: a polícia está nas ruas e enxerga muito mais longe até você dormir`);
        AudioFX.blip(180, 0.5, 0.25);
    }

    // Multiplicador do alcance de visão da polícia no ponto (alerta, delegado aliado, domínio, estação).
    policeSightMul(x, z) {
        const d = this.districtAt(x, z);
        return (this.alerts[d] ? 1.6 : 1) * this.influence.sightMul(d) * this.dominion.sightMul(d) * this.fx('sight') * (Empire.DISTRICTS[d] ? Empire.DISTRICTS[d].police : 1);
    }
    escalateMul(x, z) { return this.influence.escalateMul(this.districtAt(x, z)); }

    // Desmaio: perde o sujo da mochila, paga a propina, acorda em casa.
    faint(why) {
        const g = this.g;
        if (g.death || g.arrest || g.sleeping || this._fainting) return;
        this._fainting = true;
        const inv = g.inventory, b = g.careers && g.careers.by.burglar;
        const lost = inv.cash + (inv.jewelValue || 0) + (b ? b.data.goods : 0);
        inv.cash = 0; inv.jewels = 0; inv.jewelValue = 0;
        if (typeof Banks !== 'undefined') Banks.lose();
        if (b) { b.data.goods = 0; b.data.weight = 0; }
        const fee = Math.round(Math.max(500, inv.clean * 0.08));
        inv.clean = Math.max(0, inv.clean - fee);
        if (g.careers && g.careers.job) g.careers.job.fail('você desmaiou');
        g._wasted(0, 8, 'home');
        this.onSleep(true);
        this.onWake();
        this.energy = 60;
        this._fainting = false;
        g._flash(`😵 DESMAIO (${why}): levaram ${brl(lost)} em dinheiro sujo e mercadoria; propina de hospital e advogado: −${brl(fee)} limpo`);
    }

    // Dormiu (ou desmaiou): energia cheia, exposição e alertas zerados.
    get now() { return Economy.day * 24 + this.g.dayNight.hour; }
    onWake() { this.wokeAt = this.now; }

    onSleep(fainted = false) {
        if (!fainted) this.energy = 100;
        this.exposure = 0;
        this.alerts = {};
    }

    update(dt) {
        const g = this.g;
        if (g.mode === 'player' && g.input.isSprinting() && g.player.speed > 5) this.spend(0.25 * dt);
        if (g.wanted.level === 0 && this.exposure > 0) this.exposure = Math.max(0, this.exposure - 0.02 * dt);
        const h = g.dayNight.hour;
        this.biz.update(dt);
        this.influence.update(dt);
        if (typeof Banks !== 'undefined') { Banks.build(g); Banks.tick(dt, g); }
    }

    // Virou o dia (Economy.tick): estação avança; negócios, influência e domínio rodam o dia.
    onNewDay() {
        const s = this.season;
        s.day++;
        if (s.day >= this.seasonDef.days) {
            s.idx++; s.day = 0;
            this.g._flash(`📅 NOVA ESTAÇÃO: ${this.seasonDef.name.toUpperCase()} (${this.seasonDef.days} dias) — ${this.seasonDef.desc}`);
        } else if (this.seasonLeft === 2) this.g._flash(`📅 Em 2 dias começa: ${this.nextSeason.name.toUpperCase()} — ${this.nextSeason.desc} Prepare-se.`);
        this.biz.onNewDay();
        this.influence.onNewDay();
        this.dominion.check();
    }

    serialize() { return { energy: this.energy, exposure: this.exposure, alerts: this.alerts, season: this.season, woke: this.wokeAt, biz: this.biz.serialize(), inf: this.influence.serialize(), dom: this.dominion.serialize() }; }
    load(s) {
        if (!s) return;
        this.energy = typeof s.energy === 'number' ? s.energy : 100; this.exposure = s.exposure || 0; this.alerts = s.alerts || {};
        this.season = s.season || { idx: 0, day: 0 }; this.wokeAt = typeof s.woke === 'number' ? s.woke : this.now;
        this.biz.load(s.biz); this.influence.load(s.inf); this.dominion.load(s.dom);
    }
}
