// ============================================================================
// Business — NEGÓCIOS PRÓPRIOS: comprar estabelecimentos da cidade (as lojas com interior: conveniência, padaria, bar, restaurante,
// boutique, academia, loja de armas, joalheria…) que dão LUCRO todo dia e LAVAM dinheiro. Tela: aba 🏪 NEGÓCIOS do menu (ui/BusinessUI.js);
// compra no balcão da própria loja (ShopUI → COMPRAR O NEGÓCIO).
//
//   PREÇO       por tipo × zona (ilha e centro mais caros); compra legal = dinheiro LIMPO.
//   DIA         faturamento (tipo × zona × reforma × equipamento × marketing × estação × sorte) − insumos (35%) − salários − aluguel e
//               impostos = LUCRO LIMPO, que cai no CAIXA do negócio. Recolha na loja (ou o gerente deposita para você toda noite).
//   LAVAGEM     deixe dinheiro sujo no cofre do negócio: todo dia ele mistura no faturamento até um LIMITE proporcional ao que a loja
//               fatura de verdade (o contador aumenta), com perda pequena. Lavar perto do limite é seguro; a Receita só estranha quando a
//               lavagem passa de metade do faturamento (Laundry.taxHeat sobe mais rápido).
//   MELHORIAS   Reforma (+faturamento), Equipamento e estoque (+faturamento e +limite), Gerente (recolhe e deposita sozinho, e você
//               manda o sujo de longe), Segurança (assaltos ao negócio), Contador (menos perda, mais limite, sem multa da fiscalização) e
//               Campanha de marketing (+35% por 5 dias).
//   EVENTOS     assalto ao seu negócio (leva o caixa), fiscalização, dia de movimento, funcionário desviando (sem gerente), taxa da
//               milícia (zona industrial/periferia, a não ser que a milícia goste de você).
// Salvo no save (SaveGame: business).
// ============================================================================

const Business = {
    TYPES: {
        mart: { price: 26000 }, bakery: { price: 22000 }, burger: { price: 24000 }, pharmacy: { price: 42000 }, fit: { price: 30000 },
        bar: { price: 34000 }, pizza: { price: 38000 }, clothes: { price: 58000 }, gym: { price: 80000 },
        italian: { price: 110000 }, japanese: { price: 120000 }, guns: { price: 160000, license: true }, jewelry: { price: 280000 },
    },
    UPG: {
        decor: { name: 'Reforma', icon: '🎨', max: 3, k: 0.12, desc: '+15% de faturamento por nível' },
        equip: { name: 'Equipamento e estoque', icon: '📦', max: 3, k: 0.10, desc: '+10% de faturamento e +15% no limite de lavagem por nível' },
        manager: { name: 'Gerente', icon: '👔', max: 1, k: 0.06, wage: 260, desc: 'recolhe o caixa e deposita no seu bolso toda noite; você manda o sujo de longe; ninguém desvia (salário R$ 260/dia)' },
        security: { name: 'Segurança', icon: '🛡', max: 2, k: 0.08, wage: 180, desc: 'segura os assaltos ao seu negócio (R$ 180/dia por nível)' },
        accountant: { name: 'Contador', icon: '🧮', max: 2, k: 0.09, desc: 'perda da lavagem menor, limite maior e multa da fiscalização evitada' },
    },
    MARKETING: { k: 0.05, days: 5, boost: 0.35 },
    owned: {},          // id da loja → registro (ver buy)
    game: null,
    totalProfit: 0,

    // ---------------------------------------------------------------- regras
    canOwn(shop) { return !!shop && !!this.TYPES[shop.style] && shop.district !== 'favela' && !shop.bank && !shop.home; },
    isOwned(shop) { return !!shop && !!this.owned[shop.id]; },
    price(shop) { const T = this.TYPES[shop.style]; return T ? Math.round(T.price * (Economy.zoneOf(shop).mul || 1) / 500) * 500 : 0; },
    upgCost(b, k) { const U = this.UPG[k]; return Math.round(b.price * U.k * (1 + (b.up[k] || 0) * 0.8) / 100) * 100; },
    mktCost(b) { return Math.round(b.price * this.MARKETING.k / 100) * 100; },
    baseRev(b) { return b.price * 0.12; },
    revMul(b, day = Economy.day) {
        const u = b.up, E = this.game && this.game.empire, season = E ? E.seasonId : 'calmaria';
        let m = (1 + 0.15 * (u.decor || 0)) * (1 + 0.10 * (u.equip || 0)) * (b.mkt > day ? 1 + this.MARKETING.boost : 1);
        if (season === 'carnaval' && ['bar', 'burger', 'pizza', 'bakery', 'mart'].includes(b.style)) m *= 1.4;
        if (season === 'intervencao') m *= 0.85;
        return m;
    },
    wages(b) { return 2 * 150 + (b.up.manager ? this.UPG.manager.wage : 0) + (b.up.security || 0) * this.UPG.security.wage; },
    fixed(b) { return b.price * 0.003; },
    washCap(b) { return Math.round(this.baseRev(b) * this.revMul(b) * (0.5 + 0.15 * (b.up.equip || 0) + 0.25 * (b.up.accountant || 0))); },
    washLoss(b) { return Math.max(0.035, 0.08 - 0.015 * (b.up.accountant || 0) - (SkillTree.m.launder || 0) * 0.3); },
    // Lucro estimado de um dia comum (para a tela).
    estimate(b) { const r = this.baseRev(b) * this.revMul(b); return Math.round(r * 0.65 - this.wages(b) - this.fixed(b)); },
    list() { return Object.values(this.owned); },
    get worth() { return this.list().reduce((s, b) => s + b.price + b.spent, 0); },

    // ---------------------------------------------------------------- compra / venda
    buy(game, shop) {
        if (!this.canOwn(shop)) return { ok: false, msg: 'Esse ponto não está à venda' };
        if (this.isOwned(shop)) return { ok: false, msg: 'Esse negócio já é seu' };
        const T = this.TYPES[shop.style], p = this.price(shop), inv = game.inventory;
        if (T.license && typeof Traces !== 'undefined' && (Traces.warrant || Traces.heat >= 40)) return { ok: false, msg: 'A Polícia Federal não dá alvará de loja de armas para quem está sendo investigado (inquérito < 40%)' };
        if (inv.clean < p) return { ok: false, msg: `Compra legal: faltam ${brl(p - inv.clean)} de dinheiro LIMPO` };
        inv.clean -= p;
        this.owned[shop.id] = { id: shop.id, name: shop.name, style: shop.style, label: (Economy.STYLES[shop.style] || {}).label || 'Loja', x: shop.x, z: shop.z, district: shop.district, biome: shop.biome,
            price: p, spent: 0, up: {}, cash: 0, dirty: 0, mkt: 0, days: 0, hist: [], log: [], bought: Economy.day };
        if (game.skills) game.skills.addXp(150);
        if (game.achievements && game.achievements.bump) game.achievements.bump('business');
        this._mapKey = null;
        return { ok: true, msg: `🏪 ${shop.name} é seu (−${brl(p)} limpos)! Lucro estimado: ${brl(this.estimate(this.owned[shop.id]))}/dia — gerencie na aba NEGÓCIOS` };
    },
    sell(game, id) {
        const b = this.owned[id]; if (!b) return 'Negócio não encontrado';
        const v = Math.round((b.price + b.spent) * 0.7 / 100) * 100;
        game.inventory.clean += v + Math.round(b.cash);
        game.inventory.cash += Math.round(b.dirty);
        delete this.owned[id];
        this._mapKey = null;
        return `Vendeu ${b.name} por ${brl(v)} (+ ${brl(b.cash)} do caixa e ${brl(b.dirty)} sujos que estavam no cofre)`;
    },
    upgrade(game, id, k) {
        const b = this.owned[id], U = this.UPG[k]; if (!b || !U) return null;
        if ((b.up[k] || 0) >= U.max) return 'Já está no máximo';
        const c = this.upgCost(b, k), inv = game.inventory;
        if (inv.clean < c) return `Faltam ${brl(c - inv.clean)} de dinheiro limpo`;
        inv.clean -= c; b.spent += c; b.up[k] = (b.up[k] || 0) + 1;
        return `${U.icon} ${U.name} ${U.max > 1 ? 'nível ' + b.up[k] : 'contratado'} em ${b.name} (−${brl(c)})`;
    },
    marketing(game, id) {
        const b = this.owned[id]; if (!b) return null;
        if (b.mkt > Economy.day) return 'A campanha ainda está no ar';
        const c = this.mktCost(b), inv = game.inventory;
        if (inv.clean < c) return `Faltam ${brl(c - inv.clean)} de dinheiro limpo`;
        inv.clean -= c; b.mkt = Economy.day + this.MARKETING.days;
        return `📣 Campanha no ar: +35% de faturamento em ${b.name} por ${this.MARKETING.days} dias (−${brl(c)})`;
    },

    // Está dentro (ou na porta) do negócio? (recolher e deixar sujo pedem presença, a não ser com gerente)
    here(game, b) {
        const a = Interiors.active;
        if (a && a.shop.id === b.id) return true;
        const p = game._playerState().pos;
        return hypot(p.x - b.x, p.z - b.z) < 6;
    },
    collect(game, id) {
        const b = this.owned[id]; if (!b) return null;
        if (!this.here(game, b) && !b.up.manager) return 'Vá até o negócio para recolher o caixa (ou contrate um gerente)';
        const v = Math.round(b.cash); if (v <= 0) return 'O caixa está vazio';
        b.cash = 0; game.inventory.clean += v;
        return `💳 Recolheu ${brl(v)} limpos do caixa de ${b.name}`;
    },
    collectAll(game) {
        let v = 0, n = 0;
        for (const b of this.list()) { if (!(b.cash > 0) || (!b.up.manager && !this.here(game, b))) continue; v += Math.round(b.cash); b.cash = 0; n++; }
        if (!n) return 'Nada para recolher daqui — vá até os negócios sem gerente';
        game.inventory.clean += v;
        return `💳 Recolheu ${brl(v)} limpos de ${n} negócio(s)`;
    },
    deposit(game, id, amt) {
        const b = this.owned[id]; if (!b) return null;
        const remote = !this.here(game, b);
        if (remote && !b.up.manager) return 'Para deixar dinheiro sujo no cofre, vá até o negócio (ou contrate um gerente: ele busca)';
        const inv = game.inventory, v = Math.floor(Math.min(amt, inv.cash));
        if (v <= 0) return 'Você não tem dinheiro sujo';
        const fee = remote ? Math.round(v * 0.02) : 0;
        inv.cash -= v; b.dirty += v - fee;
        return `🧺 ${brl(v - fee)} sujos no cofre de ${b.name}${fee ? ` (o gerente cobrou ${brl(fee)} para buscar)` : ''} — vão sendo lavados à noite (até ${brl(this.washCap(b))}/dia)`;
    },

    // ---------------------------------------------------------------- virada do dia
    onNewDay() {
        const g = this.game; if (!g) return;
        const lines = [], E = g.empire;
        let totalP = 0, totalW = 0, depo = 0;
        for (const b of this.list()) {
            const day = Economy.day, L = [];
            let rev = this.baseRev(b) * this.revMul(b, day - 1) * (0.85 + Math.random() * 0.3);
            const roll = Math.random();
            if (roll < 0.08) { rev *= 1.5; L.push('🎉 dia de movimento (+50%)'); }
            let profit = rev * 0.65 - this.wages(b) - this.fixed(b);
            if (!b.up.manager && Math.random() < 0.05) { const l = Math.max(0, profit * 0.15); profit -= l; L.push(`🤏 funcionário desviou ${brl(l)}`); }
            if (Math.random() < 0.05) {
                if (b.up.accountant) L.push('📋 fiscalização: documentação em dia');
                else { const f = Math.round(b.price * 0.02); profit -= f; L.push(`📋 multa da fiscalização: −${brl(f)}`); }
            }
            const d = E ? E.districtAt(b.x, b.z) : '';
            if ((d === 'industrial' || d === 'periferia') && Math.random() < 0.1 && !(E && E.influence.hearts('milicia') >= 3)) { const f = Math.round(rev * 0.08); profit -= f; L.push(`🪖 taxa da milícia: −${brl(f)}`); }
            b.cash += Math.round(profit);
            if (Math.random() < Math.max(0, 0.06 - 0.03 * (b.up.security || 0)) * (b.cash > 2000 ? 1.5 : 1)) {
                if (b.up.security) L.push('🛡 a segurança impediu um assalto');
                else { const l = Math.round(Math.max(0, b.cash) * 0.6); b.cash -= l; L.push(`🔫 assaltaram o seu negócio: levaram ${brl(l)} do caixa (contrate segurança)`); }
            }
            // lavagem: mistura o sujo do cofre no faturamento
            let washed = 0;
            if (b.dirty > 0) {
                const cap = this.washCap(b), amt = Math.min(b.dirty, cap), clean = Math.round(amt * (1 - this.washLoss(b)));
                b.dirty -= amt; b.cash += clean; washed = amt; totalW += amt;
                const ratio = amt / Math.max(1, rev);
                Laundry.taxHeat = Math.min(100, Laundry.taxHeat + amt / 450 * (ratio > 0.5 ? 2.2 : 1) * (1 - 0.2 * (b.up.accountant || 0)) * (typeof Careers !== 'undefined' && Careers.immunity ? 0.25 : 1) * (E && E.seasonId === 'eleicoes' ? 1.3 : 1) * (1 - (SkillTree.m.taxHeat || 0)));
                Laundry.xp += amt * 0.5;
                L.push(`🧺 lavou ${brl(amt)} → ${brl(clean)}`);
            }
            if (b.up.manager && b.cash > 0) { depo += Math.round(b.cash); g.inventory.clean += Math.round(b.cash); b.cash = 0; }
            b.days++;
            b.hist.push({ d: day, p: Math.round(profit), r: Math.round(rev), w: Math.round(washed) });
            if (b.hist.length > 7) b.hist.shift();
            b.log = L.slice(0, 4);
            totalP += profit;
            for (const l of L) if (/assaltaram|multa|milícia/.test(l)) lines.push(`${b.name}: ${l}`);
        }
        if (!this.list().length) return;
        this.totalProfit += totalP;
        Laundry._audit(g);
        if (g.achievements && g.achievements.check) g.achievements.check();
        g._flash(`🏪 Negócios: lucro do dia ${brl(totalP)}${totalW ? ` · lavou ${brl(totalW)}` : ''}${depo ? ` · o gerente depositou ${brl(depo)}` : ''}${lines.length ? ' · ' + lines.slice(0, 2).join(' · ') : ''}`);
    },

    // ---------------------------------------------------------------- mapa e radar
    mapPois: [],
    syncMap(game, dt) {
        this._mt = (this._mt || 0) - dt;
        if (this._mt > 0 || !CityGrid.pois) return;
        this._mt = 1;
        const key = Object.keys(this.owned).join(',');
        if (key === this._mapKey) return;
        this._mapKey = key;
        const P = CityGrid.pois;
        for (let i = P.length - 1; i >= 0; i--) if (P[i].type === 'negocio') P.splice(i, 1);
        this.mapPois = this.list().map((b) => CityGrid.addPoi({ type: 'negocio', name: `${b.name} · seu negócio`, x: b.x, z: b.z }));
    },

    serialize() { return { owned: this.owned, total: this.totalProfit }; },
    load(s) {
        this.owned = {}; this.totalProfit = 0; this._mapKey = null;
        if (!s) return;
        this.owned = s.owned || {}; this.totalProfit = s.total || 0;
        for (const b of this.list()) { b.up = b.up || {}; b.hist = b.hist || []; b.log = b.log || []; b.spent = b.spent || 0; b.cash = b.cash || 0; b.dirty = b.dirty || 0; }
    },
};
Economy.onDay(() => Business.onNewDay());
