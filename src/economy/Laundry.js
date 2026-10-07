// ============================================================================
// Laundry — CAPITAL SUJO × LIMPO e as FACHADAS do C.V.
//   • `inventory.cash` é dinheiro SUJO (loot, assaltos, missões, boca). `inventory.clean` é dinheiro LIMPO (conta).
//   • Compras grandes (≥ CLEAN_MIN) em comércio FORA da favela só aceitam dinheiro limpo (Economy.buy).
//   • FACHADAS: o jogador compra pontos comerciais da favela (adega/bar, padaria, lanchonete, mercadinho — ShopUI "COMPRAR O PONTO")
//     e lava dinheiro neles: cada fachada processa até `capacity` sujo por dia, com uma PERDA (taxa) que cai com a habilidade
//     CONTABILIDADE (sobe lavando: `xp`). Cada fachada ainda rende um pouco de dinheiro limpo por dia.
//   • RECEITA/PF: lavar esquenta (`taxHeat` 0..100, esfria sozinho; a Contabilidade reduz o quanto sobe). Em 100 vem a auditoria:
//     multa sobre o dinheiro limpo.
// Salvo no save (SaveGame): clean, fachadas, xp, taxHeat.
// ============================================================================

const Laundry = {
    CLEAN_MIN: 800,                                           // compras ≥ isto fora da favela exigem dinheiro limpo
    FRONTS: {                                                 // estilos de loja (Economy.STYLES) que viram fachada
        bar:    { price: 4200, label: 'Adega do C.V' },
        bakery: { price: 3600, label: 'Padaria de fachada' },
        burger: { price: 3200, label: 'Lanchonete de fachada' },
        mart:   { price: 3800, label: 'Mercadinho de fachada' },
    },
    owned: {},                                                // id da loja → { name }
    used: {},                                                 // id → quanto lavou hoje
    xp: 0, taxHeat: 0, day: -1, game: null,

    get level() { return Math.min(8, Math.floor(Math.sqrt(this.xp / 500))); },         // Contabilidade 0..8
    get lossRate() { return Math.max(0.06, 0.32 - 0.025 * this.level - (SkillTree.m.launder || 0)); },      // (habilidade Contador)
    get count() { return Object.keys(this.owned).length; },
    capacity() { return 1500 + 500 * Math.min(this.level, 4); },                       // sujo por dia, por fachada

    canOwn(shop) { return shop.district === 'favela' && !!this.FRONTS[shop.style]; },
    isOwned(shop) { return !!this.owned[shop.id]; },
    price(shop) { return this.FRONTS[shop.style].price; },
    left(shop) { return Math.max(0, this.capacity() - (this.used[shop.id] || 0)); },

    buy(game, shop) {
        if (!this.canOwn(shop) || this.isOwned(shop)) return { ok: false, msg: 'Esse ponto não está à venda' };
        if (Standing.traffic < 40) return { ok: false, msg: 'O tráfico não libera ponto para quem não tem moral (40+)' };
        const p = this.price(shop), inv = game.inventory;
        if (inv.cash < p) return { ok: false, msg: `Faltam ${brl(p - inv.cash)} para comprar o ponto` };
        inv.cash -= p;
        this.owned[shop.id] = { name: shop.name };
        Standing.add('traffic', 3);
        return { ok: true, msg: `Ponto comprado (-${brl(p)}): agora é uma fachada do C.V` };
    },

    // Lava até `amount` de dinheiro sujo nesta fachada. Retorna { ok, msg }.
    launder(game, shop, amount) {
        const inv = game.inventory;
        if (!this.isOwned(shop)) return { ok: false, msg: 'Esse ponto não é seu' };
        const amt = Math.floor(Math.min(amount, inv.cash, this.left(shop)));
        if (amt <= 0) return { ok: false, msg: inv.cash <= 0 ? 'Você não tem dinheiro sujo' : 'A fachada já lavou o limite de hoje' };
        const fee = Math.round(amt * this.lossRate), net = amt - fee, lv = this.level;
        inv.cash -= amt; inv.clean += net;
        this.used[shop.id] = (this.used[shop.id] || 0) + amt;
        this.xp += amt;
        this.taxHeat = Math.min(100, this.taxHeat + (amt / 60) * (1 - 0.07 * lv) * (typeof Careers !== 'undefined' && Careers.immunity ? 0.25 : 1) * (1 - (SkillTree.m.taxHeat || 0)));      // patrono de escola de samba: imunidade política        // Contabilidade alta: a Receita nem percebe
        let msg = `Lavou ${brl(amt)} → ${brl(net)} limpos (perda ${Math.round(this.lossRate * 100)}%)`;
        if (this.level > lv) msg += ` · Contabilidade nv ${this.level}!`;
        this._audit(game);
        return { ok: true, msg };
    },

    _audit(game) {
        if (this.taxHeat < 100) return;
        const inv = game.inventory;
        let fine = Math.round(inv.clean * 0.3);
        if (inv.clean >= fine && fine > 0) inv.clean -= fine; else { fine = Math.round(inv.cash * 0.2); inv.cash -= fine; }
        this.taxHeat = 35;
        game._flash(`🕵 A Receita Federal e a PF auditaram suas fachadas: multa de ${brl(fine)}`);
        AudioFX.blip(150, 0.5, 0.25);
    },

    // Chamado quando vira o dia (Economy.tick): zera o limite e cada fachada rende dinheiro limpo.
    onNewDay() {
        this.used = {};
        const g = this.game, n = this.count;
        if (!g || !n) return;
        const income = Math.round(n * (140 + 20 * this.level) * (1 + (SkillTree.m.income || 0)));
        g.inventory.clean += income;
        g._flash(`Suas ${n} fachada(s) renderam ${brl(income)} limpos`);
    },

    update(dt) { if (this.taxHeat > 0) this.taxHeat = Math.max(0, this.taxHeat - 0.15 * dt); },

    // ---------------------------------------------------------------- mapa
    // Todo estabelecimento comprado para lavar dinheiro — os pontos da favela (daqui) e os negócios de luxo do Império (postos,
    // restaurantes, boates: EmpireBusiness.fronts) — vira um lugar no mapa (POI 'fachada', com legenda) e um ícone no radar
    // (`mapPois`). Conferido a cada segundo: comprar, carregar um save ou perder um negócio atualiza sozinho.
    mapPois: [],
    _mapKey: null,
    syncMap(game, dt) {
        this._mapT = (this._mapT || 0) - dt;
        if (this._mapT > 0 || !CityGrid.pois) return;
        this._mapT = 1;
        const biz = game.empire && game.empire.biz, fronts = biz ? biz.fronts : [];
        const key = () => Object.keys(this.owned).join(',') + '|' + fronts.map((f) => f.type + ':' + f.d + ':' + f.x).join(',');
        if (key() === this._mapKey) return;
        const P = CityGrid.pois;
        for (let i = P.length - 1; i >= 0; i--) if (P[i].type === 'fachada') P.splice(i, 1);
        const list = [];
        if (Object.keys(this.owned).length) {
            Interiors.index();
            for (const id of Object.keys(this.owned)) {
                const s = Interiors._doors.find((d) => d.id === id);
                if (s) list.push(CityGrid.addPoi({ type: 'fachada', name: `${this.owned[id].name || s.name} · ponto do C.V`, x: s.x, z: s.z }));
            }
        }
        for (const f of fronts) {
            if (!biz.placeFront(f)) continue;                                     // (save antigo: ganha um lugar agora)
            const F = EmpireBusiness.FRONTS[f.type];
            list.push(CityGrid.addPoi({ type: 'fachada', name: `${F ? F.name : 'Negócio'}${f.at ? ' — ' + f.at : ''} · ${game.empire.dName(f.d)}`, x: f.x, z: f.z }));
        }
        this.mapPois = list;
        this._mapKey = key();                                                     // (com as posições recém-dadas)
    },

    serialize() { return { owned: this.owned, xp: this.xp, heat: this.taxHeat }; },
    load(s) {
        if (!s) return;
        this.owned = s.owned || {}; this.xp = s.xp || 0; this.taxHeat = s.heat || 0;
    },
};
