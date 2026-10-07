// ============================================================================
// RealEstate — o MERCADO IMOBILIÁRIO. Imóveis à venda espalhados pela cidade; o preço segue a localização, como no mundo real:
//   • a referência de valor é a ORLA da praia e a ILHA (quanto mais perto do mar / da ilha, mais caro e sofisticado);
//   • a FAVELA e o seu entorno são muito mais baratos; o centro fica no meio.
// índice de localização `idx` (0..1) = proximidade da orla (WorldMap.seaDist) + bônus da ilha, reduzido perto da favela;
// R$/m² = 140 · (1 + 85 · idx^1,6) · 0,4 · mercado(dia)  →  favela ≈ R$ 100/m², centro ≈ R$ 1.300/m², orla ≈ R$ 2.700/m²,
// ilha ≈ R$ 4.800/m². O padrão (barraco → mansão) e a metragem saem do índice e do tamanho do terreno.
// Comprar: dinheiro LIMPO (Laundry) — só imóveis na própria favela aceitam sujo. Um imóvel comprado serve de casa extra: dormir
// (salva), baú, cofre, geladeira; "morar aqui" muda a safe house (e a residência: Standing.setHome → morar fora da favela
// te torna ESTRANHO para o C.V). Interface: ui/PropertyUI.js. Marcadores brilhantes na porta e POIs no mapa.
// ============================================================================

const RealEstate = {
    list: [], byId: {}, owned: {}, homeId: 'safehouse', game: null, built: false,
    FAVELA_PPM_NAME: 'Favela do Morro',

    // padrão do imóvel pelo índice de localização (max = limite superior do idx)
    TIERS: [
        { max: 0.07, type: 'Barraco', area: [30, 55], stars: 1, n: 4 },
        { max: 0.20, type: 'Casa popular', area: [35, 70], stars: 1, n: 6 },
        { max: 0.35, type: 'Kitnet / apto simples', area: [28, 60], stars: 2, n: 6 },
        { max: 0.50, type: 'Apartamento', area: [55, 95], stars: 3, n: 8 },
        { max: 0.68, type: 'Apartamento alto padrão', area: [80, 140], stars: 4, n: 8 },
        { max: 0.82, type: 'Cobertura frente-mar', area: [140, 240], stars: 5, n: 6 },
        { max: 1.01, type: 'Mansão / cobertura de luxo', area: [250, 450], stars: 5, n: 8 },
    ],

    // ---------------------------------------------------------------- localização e preço
    // Índice de valor do lugar (x, z): { idx, shore, region }.
    locate(x, z, block = null) {
        const sea = WorldMap.seaDist(x, z), shore = Math.max(0, Math.min(1, 1 - sea / 450));
        const district = block ? block.district : null, biome = block ? block.biome : null;
        let idx = Math.pow(shore, 1.1) * 0.75 + (district === 'island' ? 0.25 : 0) + (biome === 'downtown' ? 0.05 : 0);
        // favela e entorno: o mercado despenca (até ~260 u de distância dela)
        const b = Standing._bounds(), dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1), dFav = hypot(dx, dz);
        let f = 1;
        if (dFav <= 0) f = 0.05; else if (dFav < 260) { const t = dFav / 260; f = 0.3 + 0.7 * t * t * (3 - 2 * t); }
        idx = Math.max(0, Math.min(1, idx * f));
        let region;
        if (dFav <= 0) region = this.FAVELA_PPM_NAME;
        else if (dFav < 160) region = 'Entorno da favela';
        else if (district === 'island') region = 'Ilha Praiana';
        else if (shore > 0.62) region = 'Orla';
        else region = { downtown: 'Centro', commercial: 'Área comercial', residential: 'Bairro residencial', industrial: 'Zona industrial', port: 'Região do porto' }[biome] || 'Cidade';
        return { idx, shore, region, dFav };
    },
    ppm(idx) { return 140 * (1 + 85 * Math.pow(idx, 1.6)) * 0.4; },                    // R$/m² de referência
    market() { const d = (typeof Economy !== 'undefined' ? Economy.day : 0); return 1 + 0.07 * Math.sin(d * 0.9) + 0.04 * Math.sin(d * 2.3 + 1); },
    price(p) { return Math.round(p.size * this.ppm(p.idx) * this.market() * (1 + this.reformGain(p)) / 100) * 100; },
    basePrice(p) { return Math.round(p.size * this.ppm(p.idx) * this.market() / 100) * 100; },       // sem reforma (o que se paga ao comprar)
    pricePerM2(p) { return Math.round(this.ppm(p.idx) * this.market()); },
    islandPpm() { return Math.round(this.ppm(1) * this.market()); },
    tierOf(idx) { return this.TIERS.find((t) => idx < t.max) || this.TIERS[this.TIERS.length - 1]; },

    // ---------------------------------------------------------------- listagem
    build(game) {
        if (this.built) return;
        this.built = true; this.game = game;
        const rng = Pixel.rng(60606), home = SafeHouse.spawnWorld();
        const buckets = this.TIERS.map(() => []);
        for (const b of CityGrid.blocks) {
            if (b.open || b.virtual) continue;
            const f = b.foot, s = b.slab;
            for (const l of b.lots) {
                if (l.landmark || l.safehouse) continue;
                const area = (l.x1 - l.x0) * (l.z1 - l.z0);
                if (area < 30) continue;
                const cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2;
                const e = [[cx - f[0], 'W'], [f[2] - cx, 'E'], [cz - f[1], 'S'], [f[3] - cz, 'N']].sort((a, c) => a[0] - c[0]);
                if (l.x1 - l.x0 > 0 && Math.min(l.x0 - f[0], f[2] - l.x1, l.z0 - f[1], f[3] - l.z1) > 2.5) continue;     // só lotes na beira da quadra (porta na calçada)
                const side = e[0][1];
                const door = side === 'W' ? { x: (s[0] + f[0]) / 2, z: cz } : side === 'E' ? { x: (s[2] + f[2]) / 2, z: cz } : side === 'S' ? { x: cx, z: (s[1] + f[1]) / 2 } : { x: cx, z: (s[3] + f[3]) / 2 };
                if (home && hypot(door.x - home.x, door.z - home.z) < 20) continue;
                const loc = this.locate(cx, cz, b), tier = this.tierOf(loc.idx);
                buckets[this.TIERS.indexOf(tier)].push({ b, l, door, loc, tier, area });
            }
        }
        this.TIERS.forEach((t, ti) => {
            const pool = buckets[ti], chosen = [];
            while (chosen.length < t.n && pool.length) { const i = Math.floor(rng() * pool.length); const c = pool.splice(i, 1)[0]; if (chosen.every((o) => hypot(o.door.x - c.door.x, o.door.z - c.door.z) > 40)) chosen.push(c); }
            for (const c of chosen) {
                const k = Math.max(0, Math.min(1, (c.area - 30) / 200)), size = Math.round(t.area[0] + (t.area[1] - t.area[0]) * k);
                const id = 'imv' + this.list.length;
                const p = { id, x: c.door.x, z: c.door.z, type: t.type, stars: t.stars, size, idx: c.loc.idx, region: c.loc.region, shore: c.loc.shore, block: c.b.id, facade: c.l.facade };
                this.list.push(p); this.byId[id] = p;
                CityGrid.addPoi({ type: 'imovel', name: `${t.type} · ${size} m² · ${this.owned[id] ? 'SEU' : brl(this.price(p))}`, x: p.x, z: p.z, prop: id });
            }
        });
        // marcadores brilhantes na porta (só os próximos aparecem)
        this.glow = new GlowBatch(game.scene, this.list.length + 4, 'imoveisGlow', 'glow');
        for (let i = 0; i < this.list.length + 4; i++) this.glow.alloc();
        for (let i = 0; i < this.list.length + 4; i++) this.glow.off(i);
        this._t = 0;
        this.refreshHomePois();
    },

    isOwned(p) { return !!this.owned[p.id]; },
    get home() { return this.homeId === 'safehouse' ? null : this.byId[this.homeId] || null; },
    // Onde acordar em casa (morte no tribunal, etc.): a porta do imóvel-casa, ou a safe house.
    homeSpawn() { const h = this.home; return h ? { x: h.x, z: h.z, face: 0 } : null; },

    // ---------------------------------------------------------------- compra / venda
    needsClean(p) { return p.region !== this.FAVELA_PPM_NAME; },
    buy(game, p) {
        if (this.isOwned(p)) return { ok: false, msg: 'Esse imóvel já é seu' };
        const price = this.price(p), inv = game.inventory, clean = this.needsClean(p);
        if (clean && inv.clean < price) return { ok: false, msg: inv.cash >= price ? 'Imóvel fora da favela: só dinheiro LIMPO. Lave o seu nas fachadas' : `Faltam ${brl(price - inv.clean)} de dinheiro limpo` };
        if (!clean && inv.cash < price) return { ok: false, msg: `Faltam ${brl(price - inv.cash)}` };
        if (clean) inv.clean -= price; else inv.cash -= price;
        this.owned[p.id] = { paid: price, day: Economy.day, reform: 0 };
        this._poi(p);
        return { ok: true, msg: `Comprou: ${p.type} em ${p.region} (-${brl(price)})` };
    },
    sell(game, p) {
        if (!this.isOwned(p)) return { ok: false, msg: 'Não é seu' };
        if (this.homeId === p.id) return { ok: false, msg: 'Você mora aqui: escolha outra casa antes de vender' };
        const v = Math.round(this.price(p) * 0.8 / 100) * 100;
        game.inventory.clean += v; delete this.owned[p.id]; this._poi(p);
        return { ok: true, msg: `Vendeu por ${brl(v)} (80% do valor de mercado, em dinheiro limpo)` };
    },

    // ---------------------------------------------------------------- reformas (dinheiro LIMPO)
    // nível 0 = original; cada reforma custa uma fração do preço base, valoriza o imóvel e dá um benefício ao dormir.
    REFORMS: [
        null,
        { name: 'Reforma básica', cost: 0.06, gain: 0.10, perk: 'Café da manhã: você acorda com 1 comida e 1 água na mochila' },
        { name: 'Reforma completa', cost: 0.13, gain: 0.22, perk: 'Cama boa: o sono dura 6 h em vez de 8 h' },
        { name: 'Reforma de alto padrão', cost: 0.22, gain: 0.38, perk: 'Suíte de luxo: sono de 5 h e o colete é reposto' },
    ],
    reformLevel(p) { const o = this.owned[p.id]; return o ? (o.reform || 0) : 0; },
    reformGain(p) { const l = this.reformLevel(p); return l ? this.REFORMS[l].gain : 0; },
    reformInfo(p) {                                           // próxima reforma: { level, name, cost, perk } ou null se já é o máximo
        const l = this.reformLevel(p) + 1;
        if (!this.isOwned(p) || l >= this.REFORMS.length) return null;
        const R = this.REFORMS[l];
        return { level: l, name: R.name, cost: Math.round(this.basePrice(p) * R.cost / 100) * 100, perk: R.perk, gain: R.gain };
    },
    reform(game, p) {
        const i = this.reformInfo(p);
        if (!i) return { ok: false, msg: this.isOwned(p) ? 'O imóvel já está no padrão máximo' : 'Não é seu' };
        if (game.inventory.clean < i.cost) return { ok: false, msg: `Faltam ${brl(i.cost - game.inventory.clean)} de dinheiro limpo` };
        game.inventory.clean -= i.cost; this.owned[p.id].reform = i.level; this._poi(p);
        return { ok: true, msg: `${i.name} concluída (-${brl(i.cost)}): o imóvel valorizou ${Math.round(i.gain * 100)}%. A obra aparece quando você sair e entrar de novo` };
    },
    // Horas de sono e brindes ao acordar neste imóvel.
    sleepHours(p) { const l = p ? this.reformLevel(p) : 0; return l >= 3 ? 5 : (l === 2 ? 6 : 8); },
    wakePerks(game, p) {
        const l = p ? this.reformLevel(p) : 0, out = [];
        if (l >= 1 && game.inventory.food < 3) { game.inventory.food++; game.inventory.water++; out.push('café da manhã (+1 comida, +1 água)'); }
        if (l >= 3 && game.player.armorMax > 0) { game.player.armor = game.player.armorMax; out.push('colete reposto'); }
        return out;
    },
    _poi(p) {
        const poi = CityGrid.pois.find((q) => q.prop === p.id); if (!poi) return;
        poi.type = this.homeId === p.id ? 'home' : 'imovel';
        poi.name = this.homeId === p.id ? `Safe house — ${p.type}` : `${p.type} · ${p.size} m² · ${this.owned[p.id] ? 'SEU' : brl(this.price(p))}`;
    },
    // A safe house original (favela) vira "casa antiga" no mapa quando você se muda.
    refreshHomePois() {
        for (const q of this.list) this._poi(q);
        const old = CityGrid.pois.find((q) => q.type === 'home' && !q.prop || (q.name && q.name.startsWith('Casa na favela')));
        if (old && !old.prop) { old.type = this.homeId === 'safehouse' ? 'home' : 'imovel'; old.name = this.homeId === 'safehouse' ? 'Safe house' : 'Casa na favela (antiga safe house)'; }
    },
    // Mudar de casa: fora do território do C.V você vira estranho para a favela de origem.
    moveIn(p) {
        this.homeId = p.id;
        const t = Standing.territoryAt(p.x, p.z);
        Standing.setHome(t ? t.id : null); this.refreshHomePois();
        return { ok: true, msg: t ? `Agora você mora aqui (território do ${t.sigla})` : 'Você se mudou para o asfalto — a favela C.V agora é HOSTIL a você' };
    },
    moveBack() {
        this.homeId = 'safehouse'; Standing.setHome('cv'); this.refreshHomePois();
        return { ok: true, msg: 'De volta à safe house na favela' };
    },

    // ---------------------------------------------------------------- interação
    near(game, maxD = 2.8) {
        if (!this.built || game.mode !== 'player') return null;
        const p = game.player.position;
        let best = null, bd = maxD;
        for (const q of this.list) { const d = hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = q; } }
        return best;
    },
    prompt(game) {
        const p = this.near(game);
        if (!p) return '';
        return this.isOwned(p) ? `<b>E</b> entrar em casa — ${p.type}<small>${p.region} · ${this.homeId === p.id ? 'sua casa atual' : 'seu imóvel'}</small>`
            : `<b>E</b> ver imóvel à venda — ${p.type}<small>${p.region} · ${p.size} m² · ${brl(this.price(p))}</small>`;
    },
    interact(game) {
        const p = this.near(game);
        if (!p || !game.propertyUI) return false;
        if (this.isOwned(p)) return Interiors.enterHome(game, p);                // dono: entra na casa (interior pintado)
        game.propertyUI.show(p);                                                  // à venda: ficha com preço e compra
        return true;
    },

    // ---------------------------------------------------------------- por frame
    update(dt) {
        if (!this.built) return;
        const g = this.game, f = g.camera.target, G = this.glow;
        this._t += dt;
        const pulse = 0.75 + 0.25 * Math.sin(this._t * 3);
        for (let i = 0; i < this.list.length; i++) {
            const p = this.list[i];
            if (hypot(p.x - f.x, p.z - f.z) > 70) { G.off(i); continue; }
            const own = this.isOwned(p), home = this.homeId === p.id;
            G.place(i, p.x, 0.35, p.z, 2.6 + 0.5 * pulse);
            if (home) G.color(i, 0.35, 0.7, 1, 0.8 * pulse); else if (own) G.color(i, 1, 0.8, 0.25, 0.8 * pulse); else G.color(i, 0.3, 1, 0.55, 0.7 * pulse);
        }
        G.flush();
    },

    serialize() { return { owned: this.owned, home: this.homeId }; },
    load(s) { if (!s) return; this.owned = s.owned || {}; this.homeId = s.home || 'safehouse'; if (this.built) this.refreshHomePois(); },
};
