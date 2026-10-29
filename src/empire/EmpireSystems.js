// ============================================================================
// EmpireSystems — a gestão do império (núcleo em empire/Empire.js, tela em ui/EmpireUI.js):
//   EmpireBusiness   AUTOMAÇÃO: GALPÕES (4 soldados cada) e SOLDADOS alocados em distritos fazem roubos passivos; o lucro do dia cai
//                    no COFRE DO GALPÃO (sujo — não vale nada no asfalto até você recolher). ROTAS DE LAVAGEM: postos, restaurantes e
//                    boates de fachada comprados na cidade lavam o cofre todo dia (capacidade × perda) para dinheiro limpo.
//                    Risco diário: soldado preso (pior com alerta tático), emboscada de facção inimiga nas rotas.
//   EmpireInfluence  MALHA DE INFLUÊNCIA (corações utilitários): DELEGADOS de cada distrito (presentes de luxo, 1 por dia; aliança máxima
//                    = viaturas do distrito com metade do alcance de visão e estrelas subindo na metade da velocidade), o FORNECEDOR
//                    DO PORTO (só confia com contratos: sabotagem e assassinato; aliança máxima = armas 40% mais baratas), a FAMÍLIA
//                    RIVAL e a MILÍCIA (relação negativa = emboscadas nas suas rotas). Negligência derruba os corações.
//   EmpireDominion   ÁRVORE DE DOMÍNIO: cada distrito tem 3 coleções (LAVAGEM, INFLUÊNCIA, FORÇA). Cada coleção dá um bônus; as três
//                    juntas = DISTRITO DOMINADO. Todos os distritos = DONO DA CIDADE.
//   EmpireJob…       missões da malha (extorquir vereador, contrato de assassinato, sabotagem, destruir galpão rival): usam o mesmo
//                    espaço de trabalho das carreiras (um por vez).
// ============================================================================

class EmpireBusiness {
    static get FRONTS() {
        return {
            posto: { name: 'Posto de gasolina', price: 45000, cap: 6000, loss: 0.15 },
            restaurante: { name: 'Restaurante', price: 70000, cap: 10000, loss: 0.12 },
            boate: { name: 'Boate', price: 120000, cap: 20000, loss: 0.1 },
        };
    }
    static get WAREHOUSE_PRICE() { return 30000; }
    static get RECRUIT_PRICE() { return 4000; }
    static get WAGE() { return 350; }
    static get NAMES() { return ['Neguinho', 'Baiano', 'Magrão', 'Zé Pequeno', 'Tico', 'Careca', 'Russo', 'Mineiro', 'Gordo', 'Cabeça', 'Pirata', 'Bigode', 'Sombra', 'Juninho', 'Paraíba', 'Tatu']; }

    constructor(emp) {
        this.e = emp; this.g = emp.g;
        this.warehouses = 0;
        this.soldiers = [];             // { id, name, d (distrito ou null), jail (dias) }
        this.vault = 0;                 // cofre do galpão (sujo)
        this.fronts = [];               // { type, d }
        this.log = [];                  // últimas linhas do relatório diário
        this._id = 1;
    }

    get capacity() { return this.warehouses * 4; }
    active(d = null) { return this.soldiers.filter((s) => s.d && !s.jail && (!d || s.d === d)); }

    buyWarehouse() {
        const inv = this.g.inventory, P = EmpireBusiness.WAREHOUSE_PRICE * (1 + this.warehouses * 0.5);
        if (inv.cash < P) return `Faltam ${brl(P - inv.cash)} de dinheiro sujo`;
        inv.cash -= P; this.warehouses++;
        return `Galpão comprado (${this.warehouses}): cabem mais 4 soldados`;
    }
    recruit() {
        const inv = this.g.inventory;
        if (this.soldiers.length >= this.capacity) return 'Sem vaga: compre outro galpão (4 soldados cada)';
        if (inv.cash < EmpireBusiness.RECRUIT_PRICE) return `Faltam ${brl(EmpireBusiness.RECRUIT_PRICE - inv.cash)}`;
        inv.cash -= EmpireBusiness.RECRUIT_PRICE;
        const N = EmpireBusiness.NAMES, s = { id: this._id++, name: N[(this._id * 7) % N.length], d: null, jail: 0 };
        this.soldiers.push(s);
        return `${s.name} entrou para o bonde — aloque num distrito`;
    }
    assign(id, d) {
        const s = this.soldiers.find((x) => x.id === +id);
        if (!s) return null;
        s.d = d || null;
        return s.d ? `${s.name} agora roda em ${this.e.dName(s.d)}` : `${s.name} está de folga no galpão`;
    }
    collect() {
        if (!this.g.careers.atBase()) return 'O cofre do galpão só é recolhido na favela ou em casa';
        if (this.vault <= 0) return 'O cofre está vazio';
        const v = Math.round(this.vault);
        this.g.inventory.addCash(v); this.vault = 0;
        return `Recolheu ${brl(v)} sujos do cofre do galpão`;
    }
    buyFront(type) {
        const F = EmpireBusiness.FRONTS[type], d = this.e.here, inv = this.g.inventory;
        if (!F) return null;
        if (Empire.OUTSKIRTS.includes(d)) return 'Fachadas de luxo só nos distritos da cidade — vá até o distrito onde quer abrir';
        if (inv.cash < F.price) return `Faltam ${brl(F.price - inv.cash)} de dinheiro sujo`;
        inv.cash -= F.price;
        const f = { type, d };
        this.placeFront(f, this.g._playerState().pos);
        this.fronts.push(f);
        if (this.g.skills) this.g.skills.addXp(200);
        return `${F.name} aberto em ${this.e.dName(d)}${f.at ? ` (${f.at})` : ''}: lava até ${brl(F.cap)} do cofre por dia — está marcado no mapa`;
    }

    // Onde o negócio fica no mapa (f.x, f.z, f.at): um posto de verdade (posto), um restaurante (restaurante) ou um bar (boate) do
    // distrito — o mais perto de `near` (onde o jogador comprou) que ainda não é fachada sua; sem nenhum, o próprio `near`. Saves
    // antigos (sem posição) ganham uma na 1ª vez que o mapa é montado (Laundry.syncMap). Retorna false se não achou lugar.
    placeFront(f, near = null) {
        if (f.x !== undefined) return true;
        let cands;
        if (f.type === 'posto') cands = CityGrid.stations || [];
        else {
            Interiors.index();
            const styles = f.type === 'boate' ? ['bar'] : ['italian', 'japanese', 'pizza', 'fit', 'burger'];
            cands = Interiors._doors.filter((s) => styles.includes(s.style));
        }
        const taken = (x, z) => this.fronts.some((o) => o !== f && o.x !== undefined && Math.abs(o.x - x) < 1 && Math.abs(o.z - z) < 1);
        let best = null, bd = Infinity;
        for (const c of cands) {
            const dd = near ? hypot(c.x - near.x, c.z - near.z) : 0;
            if (dd >= bd || this.e.districtAt(c.x, c.z) !== f.d || taken(c.x, c.z)) continue;
            bd = dd; best = c;
        }
        if (!best && !near) return false;
        const at = best || near;
        f.x = Math.round(at.x * 10) / 10; f.z = Math.round(at.z * 10) / 10; f.at = best ? best.name : null;
        return true;
    }

    // Renda de um soldado por dia no distrito d.
    takePer(d) {
        const D = Empire.DISTRICTS[d] || Empire.DISTRICTS.periferia;
        return 700 * D.rich * this.e.fx('crew') * this.e.dominion.crewMul(d) * (1 + (SkillTree.m.income || 0));
    }

    update() {}

    onNewDay() {
        const e = this.e, g = this.g, inv = g.inventory, lines = [];
        // salários (do cofre, depois do bolso); sem salário, deserção
        const wage = this.soldiers.length * EmpireBusiness.WAGE;
        if (wage) {
            const fromVault = Math.min(this.vault, wage); this.vault -= fromVault;
            const rest = wage - fromVault;
            if (inv.cash >= rest) inv.cash -= rest;
            else { const gone = this.soldiers.pop(); if (gone) lines.push(`${gone.name} largou o bonde (salário atrasado)`); }
        }
        // roubos passivos
        let take = 0;
        for (const s of this.soldiers) {
            if (s.jail > 0) { s.jail--; if (!s.jail) lines.push(`${s.name} saiu da cadeia`); continue; }
            if (!s.d) continue;
            const risk = 0.05 + (e.alerts[s.d] ? 0.15 : 0) - e.influence.hearts('del_' + s.d) * 0.004;
            if (Math.random() < risk) { s.jail = 3; lines.push(`${s.name} foi preso em ${e.dName(s.d)} (3 dias)`); continue; }
            take += this.takePer(s.d) * (0.8 + Math.random() * 0.4);
        }
        // emboscadas de quem te odeia (só onde a força não foi dominada)
        for (const f of ['rival', 'milicia']) {
            const h = e.influence.hearts(f);
            if (h > -4 || take <= 0 || Math.random() > Math.min(0.6, -h * 0.06)) continue;
            const d = this.active()[0] && this.active()[0].d;
            if (d && e.dominion.done(d, 'forca')) continue;
            const lost = Math.round(take * 0.45); take -= lost;
            lines.push(`💥 Emboscada da ${f === 'rival' ? 'família rival' : 'milícia'} na rota: −${brl(lost)}`);
        }
        this.vault += Math.round(take);
        if (take > 0) lines.push(`soldados renderam ${brl(take)} (cofre: ${brl(this.vault)})`);
        // rotas de lavagem
        let washed = 0, clean = 0;
        for (const f of this.fronts) {
            const F = EmpireBusiness.FRONTS[f.type], amt = Math.min(this.vault, F.cap * e.fx('launder'));
            if (amt <= 0) break;
            this.vault -= amt; washed += amt;
            clean += amt * (1 - Math.max(0.04, F.loss - (SkillTree.m.launder || 0)));
        }
        if (washed > 0) {
            inv.clean += Math.round(clean);
            Laundry.taxHeat = Math.min(100, Laundry.taxHeat + washed / 400 * (Careers.immunity ? 0.25 : 1) * (1 - (SkillTree.m.taxHeat || 0)));
            Laundry._audit(g);
            lines.push(`fachadas lavaram ${brl(washed)} → ${brl(clean)} limpos`);
        }
        this.log = lines.slice(-6);
        if (lines.length) g._flash('🏭 Império: ' + lines.join(' · '));
    }

    serialize() { return { w: this.warehouses, s: this.soldiers, v: this.vault, f: this.fronts, id: this._id }; }
    load(s) { if (!s) return; this.warehouses = s.w || 0; this.soldiers = s.s || []; this.vault = s.v || 0; this.fronts = s.f || []; this._id = s.id || 1; }
}

class EmpireInfluence {
    // Contatos: id → { name, kind, d? (distrito), min, max }
    static get CONTACTS() {
        const out = {};
        for (const d of ['centro', 'comercio', 'residencial', 'orla', 'industrial', 'ilha']) out['del_' + d] = { name: `Delegado — ${Empire.DISTRICTS[d].name}`, kind: 'delegado', d, min: 0, max: 10 };
        out.armeiro = { name: 'Fornecedor do Porto', kind: 'fornecedor', min: 0, max: 10 };
        out.rival = { name: 'Família Moretti (rival)', kind: 'faccao', min: -10, max: 10 };
        out.milicia = { name: 'Milícia do Rio Seco', kind: 'faccao', min: -10, max: 10 };
        return out;
    }
    static get GIFTS() {
        return {
            charuto: { name: 'Caixa de charutos cubanos', price: 800, hearts: 0.6 },
            uisque: { name: 'Uísque 18 anos importado', price: 2500, hearts: 1.6 },
            relogio: { name: 'Relógio suíço', price: 9000, hearts: 5 },
        };
    }

    constructor(emp) {
        this.e = emp; this.g = emp.g;
        this.h = { rival: -2, milicia: 0 };
        this.lastGift = {};             // contato → dia do último presente
        this.extorted = {};             // distrito → vereadores extorquidos
        this.razed = {};                // distrito → galpões rivais destruídos
    }

    hearts(id) { return this.h[id] || 0; }
    add(id, n) {
        const C = EmpireInfluence.CONTACTS[id]; if (!C) return;
        const before = this.hearts(id);
        this.h[id] = Math.max(C.min, Math.min(C.max, before + n));
        if (before < C.max && this.h[id] >= C.max) this.g._flash(`❤ ALIANÇA MÁXIMA: ${C.name}`);
    }

    // Efeitos sistêmicos.
    sightMul(d) { return 1 - 0.05 * this.hearts('del_' + d); }                    // 10 corações = metade do alcance
    escalateMul(d) { return 1 + 0.1 * this.hearts('del_' + d); }                  // 10 corações = estrelas sobem na metade da velocidade
    gunPriceMul() { return 1 - 0.04 * this.hearts('armeiro'); }                   // 10 corações = −40% nas armas

    gift(id, giftId) {
        const C = EmpireInfluence.CONTACTS[id], G = EmpireInfluence.GIFTS[giftId], inv = this.g.inventory;
        if (!C || !G) return null;
        if (C.kind !== 'delegado') return 'Esse contato não aceita presente — só serviço';
        if (this.e.here !== C.d) return `Entregue em mãos: vá até ${Empire.DISTRICTS[C.d].name}`;
        if (this.lastGift[id] === Economy.day) return 'Ele já recebeu um presente hoje — volte amanhã';
        if (inv.cash < G.price) return `Faltam ${brl(G.price - inv.cash)}`;
        inv.cash -= G.price; this.lastGift[id] = Economy.day;
        this.add(id, G.hearts * this.e.fx('gifts'));
        return `${C.name} aceitou: ${G.name} (${this.hearts(id).toFixed(1)}/10 ❤)`;
    }
    tribute(id) {
        const C = EmpireInfluence.CONTACTS[id], inv = this.g.inventory, P = 10000;
        if (!C || C.kind !== 'faccao') return null;
        if (inv.cash < P) return `Faltam ${brl(P - inv.cash)}`;
        inv.cash -= P; this.add(id, 1.5);
        return `Tributo pago a ${C.name}: relação ${this.hearts(id).toFixed(1)}`;
    }

    update() {}

    // Negligência: delegado sem presente há 3+ dias perde corações; o fornecedor esfria devagar.
    onNewDay() {
        for (const [id, C] of Object.entries(EmpireInfluence.CONTACTS)) {
            if (C.kind === 'delegado' && this.hearts(id) > 0 && Economy.day - (this.lastGift[id] || -99) >= 3) this.h[id] = Math.max(0, this.hearts(id) - 0.5);
            if (C.kind === 'fornecedor' && this.hearts(id) > 0) this.h[id] = Math.max(0, this.hearts(id) - 0.2);
        }
    }

    serialize() { return { h: this.h, lg: this.lastGift, ex: this.extorted, rz: this.razed }; }
    load(s) { if (!s) return; this.h = s.h || this.h; this.lastGift = s.lg || {}; this.extorted = s.ex || {}; this.razed = s.rz || {}; }
}

class EmpireDominion {
    static get COLLECTIONS() { return { lavagem: 'LAVAGEM', influencia: 'INFLUÊNCIA', forca: 'FORÇA' }; }

    constructor(emp) { this.e = emp; this.g = emp.g; this.state = {}; }

    // Metas de cada coleção no distrito d: [descrição, atual, alvo]
    goals(d) {
        const e = this.e, inf = e.influence, big = d === 'centro' || d === 'ilha';
        if (d === 'favela') {
            return {
                lavagem: ['Ter 3 fachadas do C.V na favela', Laundry.count, 3],
                influencia: ['Moral da comunidade em 70+', Math.round(Standing.community), 70],
                forca: ['Chegar a Gerente de Frente', Missions.rank, 2],
            };
        }
        const props = Object.keys(RealEstate.owned).map((id) => RealEstate.byId[id]).filter((p) => p && p.stars >= 3 && e.districtAt(p.x, p.z) === d).length;
        return {
            lavagem: [`Ter ${big ? 3 : 2} negócios no distrito (fachadas de luxo + imóveis de alto padrão)`, e.biz.fronts.filter((f) => f.d === d).length + props, big ? 3 : 2],
            influencia: [`Extorquir ${big ? 5 : 3} vereadores do distrito`, inf.extorted[d] || 0, big ? 5 : 3],
            forca: [`Destruir ${big ? 3 : 2} galpões da família rival no distrito`, inf.razed[d] || 0, big ? 3 : 2],
        };
    }
    get districts() { return Object.keys(Empire.DISTRICTS).filter((d) => d === 'favela' || !Empire.OUTSKIRTS.includes(d)); }
    done(d, c) { return !!(this.state[d] && this.state[d][c]); }
    dominated(d) { return ['lavagem', 'influencia', 'forca'].every((c) => this.done(d, c)); }
    get count() { return this.districts.filter((d) => this.dominated(d)).length; }

    // Bônus: lavagem → soldados rendem +25%; influência → polícia vê 15% menos; força → sem emboscadas. Dominado: tudo mais forte.
    crewMul(d) { return (this.done(d, 'lavagem') ? 1.25 : 1) * (this.dominated(d) ? 1.2 : 1); }
    sightMul(d) { return (this.done(d, 'influencia') ? 0.85 : 1) * (this.dominated(d) ? 0.8 : 1); }

    check() {
        for (const d of this.districts) {
            const G = this.goals(d), st = this.state[d] || (this.state[d] = {});
            for (const c of Object.keys(G)) {
                if (st[c] || G[c][1] < G[c][2]) continue;
                st[c] = 1;
                this.g._flash(`🏙 ${this.e.dName(d)}: coleção ${EmpireDominion.COLLECTIONS[c]} completa!`);
                if (this.g.skills) this.g.skills.addXp(500);
                if (this.dominated(d)) {
                    this.g._flash(`👑 DISTRITO DOMINADO: ${this.e.dName(d)} agora é seu (${this.count}/${this.districts.length})`);
                    if (this.g.skills) this.g.skills.addXp(2500);
                    if (this.count === this.districts.length) this.g._flash('👑👑 VOCÊ É O DONO DA CIDADE.');
                }
            }
        }
    }

    serialize() { return this.state; }
    load(s) { if (s) this.state = s; }
}

// "Carreira" de fachada para as missões da malha: deixa as missões usarem o espaço de trabalho das carreiras (XP vai para o personagem).
class EmpireCareerStub {
    constructor(mgr) { this.mgr = mgr; this.g = mgr.g; this.id = 'empire'; this.name = 'IMPÉRIO'; this.color = '#ffd23a'; this.mastery = 0; }
    addXp(n) { if (this.g.skills) this.g.skills.addXp(n); }
}

// Alvo em pé num ponto da cidade (vereador a extorquir / alvo de contrato).
class EmpireTargetJob extends CareerJob {
    constructor(c, kind, d) {
        super(c, kind === 'extort' ? { title: 'EXTORQUIR VEREADOR', text: 'Encontre o vereador e intimide (arma na mão)', limit: 420 } : { title: 'CONTRATO DO FORNECEDOR', text: 'Elimine o alvo sem testemunha', limit: 420 });
        this.kind = kind; this.d = d; this.actor = null;
    }
    start() {
        const g = this.g, e = g.empire, p = g._playerState().pos;
        const spot = this.mgr.cityDoor(p, 40, 1400, (q) => q.district !== 'favela' && (!this.d || e.districtAt(q.x, q.z) === this.d));
        if (!spot) { this.why = 'Nenhum alvo encontrado nesse distrito'; return false; }
        const [va, vb] = CharacterRig.VARIANT_GROUPS.biz;
        this.actor = new SpriteActor(g.scene, g.sprites.sheets.civA, va + Math.floor(Math.random() * (vb - va + 1)), 'alvoImperio');
        this.actor.play('idle', 'none'); this.actor.setPosition(spot.x, spot.z); this.actor.setHeading(Math.random() * 6.28);
        this.d = e.districtAt(spot.x, spot.z);
        this.text = `${this.kind === 'extort' ? 'Vereador' : 'Alvo'} perto de ${spot.name} (${e.dName(this.d)})`;
        this.target(spot.x, spot.z, this.kind === 'extort' ? 'Vereador' : 'Alvo do contrato');
        return true;
    }
    prompt() {
        const g = this.g; if (g.mode !== 'player' || !this.near(g.player.position, 2.4)) return '';
        return this.kind === 'extort' ? `<b>E</b> extorquir o vereador<small>${g.player.weapon === 'none' ? 'precisa de arma na mão' : 'ele paga e passa a te dever favores'}</small>` : '<b>E</b> cumprir o contrato<small>sem testemunha e sem polícia</small>';
    }
    interact() {
        const g = this.g, p = g.player.position, e = g.empire;
        if (g.mode !== 'player' || g.player.busy || !this.near(p, 2.4)) return false;
        const witness = this.mgr.watcher(p, 10), cop = this.mgr.copDist(p) < 25;
        if (this.kind === 'extort') {
            if (g.player.weapon === 'none') { g._flash('Saque uma arma: vereador só paga com medo'); return true; }
            this.actor.play('surrender', 'none', { restart: true });
            e.influence.extorted[this.d] = (e.influence.extorted[this.d] || 0) + 1;
            e.spend(6, 12);
            if (cop) g.heat.commit('extortion', CrimeExposure.POLICE);
            e.dominion.check();
            this.succeed(Math.round(3000 * e.fx('extort') * (Empire.DISTRICTS[this.d] ? Empire.DISTRICTS[this.d].rich : 1)), 220, `vereador extorquido em ${e.dName(this.d)} (${e.influence.extorted[this.d]})`);
            return true;
        }
        g.player.playAction('punch', { lock: 0.4 });
        this.actor.play('dead', 'none', { restart: true });
        e.spend(8, witness || cop ? 30 : 10);
        e.influence.add('armeiro', 2.5); e.influence.add('rival', -1);
        if (witness || cop) { if (witness) witness.panic(p); g.heat.commit('homicide', cop ? CrimeExposure.POLICE : CrimeExposure.WITNESS); g.wanted.ensureLevel(2); }
        this.succeed(4000, 260, `contrato cumprido — o Fornecedor do Porto confia mais em você${witness || cop ? ' (mas alguém viu)' : ''}`);
        return true;
    }
    update(dt) { if (this.actor) this.actor.update(dt, 1); }
    dispose() { const a = this.actor; if (a) { this.g._delayed.push({ t: 6, fn: () => a.dispose() }); this.actor = null; } }
}

// Plantar explosivo: sabotar carregamento rival (Fornecedor) ou destruir galpão da família rival (domínio de distrito).
class EmpireBombJob extends CareerJob {
    constructor(c, kind, d) {
        super(c, kind === 'sabotage' ? { title: 'SABOTAGEM', text: 'Plante o explosivo no carregamento rival e saia de perto', limit: 480 } : { title: 'DESTRUIR GALPÃO RIVAL', text: 'Plante o explosivo no galpão da família rival e saia de perto', limit: 480 });
        this.kind = kind; this.d = d; this.prog = 0; this.fuse = 0;
    }
    start() {
        const g = this.g, e = g.empire, p = g._playerState().pos;
        const spot = this.mgr.cityDoor(p, 40, 1400, (q) => q.district !== 'favela' && (this.d ? e.districtAt(q.x, q.z) === this.d : e.districtAt(q.x, q.z) === 'industrial'));
        if (!spot) { this.why = 'Nenhum alvo nesse distrito'; return false; }
        this.d = e.districtAt(spot.x, spot.z);
        this.text = `${this.kind === 'sabotage' ? 'Carregamento' : 'Galpão'} perto de ${spot.name} (${e.dName(this.d)})`;
        this.target(spot.x, spot.z, this.kind === 'sabotage' ? 'Carregamento rival' : 'Galpão rival');
        return true;
    }
    status() { return this.stage === 0 ? (this.prog > 0 ? `PLANTANDO ${crBar(this.prog)}` : 'CHEGUE AO ALVO') : `EXPLODE EM ${Math.ceil(this.fuse)}s — AFASTE-SE`; }
    hud() { const h = super.hud(); if (this.stage === 1) h.low = true; return h; }
    update(dt, pos) {
        const g = this.g, e = g.empire;
        if (this.stage === 0) {
            if (!this.near(pos, 3) || g.mode !== 'player') { this.prog = Math.max(0, this.prog - dt * 0.5); return; }
            this.prog += dt / 4;
            if (this.prog >= 1) { this.stage = 1; this.fuse = 12; g._flash('💣 Explosivo armado: 12 segundos — corra!'); }
            return;
        }
        this.fuse -= dt;
        if (this.fuse > 0) return;
        const far = !this.near(pos, 25);
        AudioFX.explosion(this.tx, this.tz);
        for (let i = 0; i < 16; i++) g.combat.spark(this.tx + (Math.random() - 0.5) * 4, 0.5 + Math.random() * 2, this.tz + (Math.random() - 0.5) * 4, [1, 0.55, 0.15], 0.6);
        if (!far) g.player.takeDamage(60);
        g.heat.commit('explosion'); g.wanted.ensureLevel(far ? 1 : 2);
        e.spend(8, 25);
        if (this.kind === 'sabotage') { e.influence.add('armeiro', 2); e.influence.add('rival', -1.5); this.succeed(3500, 240, 'carregamento rival pelos ares — o Fornecedor do Porto gostou'); }
        else { e.influence.razed[this.d] = (e.influence.razed[this.d] || 0) + 1; e.influence.add('rival', -1.5); e.dominion.check(); this.succeed(2500, 280, `galpão rival destruído em ${e.dName(this.d)} (${e.influence.razed[this.d]})`); }
    }
}
memoStatics(EmpireBusiness, 'FRONTS', 'NAMES');
memoStatics(EmpireInfluence, 'CONTACTS', 'GIFTS');
memoStatics(EmpireDominion, 'COLLECTIONS');
