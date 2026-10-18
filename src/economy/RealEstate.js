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
    T0_DRAWS: 4,                    // sorteios que o padrão 0 consumia do rng principal no mapa de antes
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
        const dFav = Standing.favelaDist(x, z);
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
        const rng = Pixel.rng(60606), rng0 = Pixel.rng(60607), home = SafeHouse.spawnWorld();
        const buckets = this.TIERS.map(() => []);
        for (const b of CityGrid.blocks) {
            if (b.open || b.virtual) continue;
            for (const l of b.lots) {
                if (l.landmark || l.safehouse) continue;
                const area = (l.x1 - l.x0) * (l.z1 - l.z0);
                if (area < 30) continue;
                const cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2;
                let door;
                if (b.organic) {                                                  // favela: a porta do barraco (no beco/rua)
                    if (!l.door) continue;
                    door = { x: l.door.x, z: l.door.z };
                } else {
                    const d = CityGrid.lotDoor(b, l);                             // só lotes na beira da quadra (porta na calçada)
                    if (!d) continue;
                    door = { x: d.x, z: d.z };
                }
                if (home && hypot(door.x - home.x, door.z - home.z) < 20) continue;
                const loc = this.locate(cx, cz, b), tier = this.tierOf(loc.idx);
                buckets[this.TIERS.indexOf(tier)].push({ b, l, door, loc, tier, area });
            }
        }
        // (o padrão 0 — barracos, quase todos na favela — sorteia com o próprio rng e o principal avança os 4 sorteios que ele fazia
        // antes da favela orgânica: os imóveis da cidade continuam os mesmos, com os mesmos códigos)
        this.TIERS.forEach((t, ti) => {
            const pool = buckets[ti], chosen = [], R = ti === 0 ? rng0 : rng;
            if (ti === 1) for (let k = 0; k < this.T0_DRAWS; k++) rng();
            while (chosen.length < t.n && pool.length) { const i = Math.floor(R() * pool.length); const c = pool.splice(i, 1)[0]; if (chosen.every((o) => hypot(o.door.x - c.door.x, o.door.z - c.door.z) > 40)) chosen.push(c); }
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
        if (this._pendingMigrate) { this._pendingMigrate = false; this._migrate(); }
        this.refreshHomePois();
    },

    // ---------------------------------------------------------------- saves antigos
    // A lista sai do mapa: quando o mapa muda (vias livres — as diagonais do centro), o mesmo código 'imvN' pode apontar para outro
    // imóvel. LEGACY = a âncora de cada código na lista de antes (x, z, índice do padrão em TIERS); daqui em diante cada imóvel
    // comprado guarda a própria âncora (x, z, type). No load, o código que não bate mais com a âncora vai para o imóvel do mesmo
    // padrão mais perto dela; sem nenhum, o valor pago (e as reformas) volta em dinheiro limpo. `remap` = antigo → novo (a Garagem
    // usa para levar os carros junto; 'safehouse' = devolvido).
    LEGACY: [[-268,796,0],[-399,526,0],[-347,346,0],[-501,518,0],[-175,-195,1],[-191,141,1],[-133,380,1],[-191,183,1],[-161,520,1],[-191,-762,1],[-63,-739,2],[-119,-375,2],[-77,649,2],[-111,-599,2],[-191,-871,2],[-105,537,2],[-21,661,3],[-91,995,3],[-13,605,3],[-191,955,3],[63,776,3],[7,345,3],[21,-515,3],[27,835,3],[99,373,4],[49,1049,4],[623,354,4],[146,-389,4],[-105,-965,4],[-191,-996,4],[91,1095,4],[601,-563,4],[574,-517,5],[651,13,5],[601,-725,5],[504,113,5],[574,179,5],[517,179,5],[517,-517,6],[623,-810,6],[715,113,6],[708,917,6],[504,49,6],[510,737,6],[504,-191,6],[510,497,6]],
    remap: {},
    _anchor(id, o) {
        if (o && o.x !== undefined && o.type) return o;
        const m = /^imv(\d+)$/.exec(id), L = m && this.LEGACY[+m[1]];
        return L ? { x: L[0], z: L[1], type: this.TIERS[L[2]].type } : null;
    },
    _migrate() {
        const old = this.owned, ids = Object.keys(old), out = {}, done = new Set(), taken = new Set();
        let refund = 0, moved = 0;
        this.remap = {};
        for (const id of ids) {                                                  // o mesmo código, no mesmo lugar e padrão: fica
            const a = this._anchor(id, old[id]), p = this.byId[id];
            if (p && (!a || (p.type === a.type && hypot(p.x - a.x, p.z - a.z) < 4))) { out[id] = old[id]; done.add(id); taken.add(id); }
        }
        for (const id of ids) {
            if (done.has(id)) continue;
            const o = old[id], a = this._anchor(id, o);
            let best = null, bd = 260;
            if (a) for (const p of this.list) { if (p.type !== a.type || taken.has(p.id)) continue; const d = hypot(p.x - a.x, p.z - a.z); if (d < bd) { bd = d; best = p; } }
            if (best) { out[best.id] = o; taken.add(best.id); this.remap[id] = best.id; moved++; }
            else { refund += Math.round((o.paid || 0) * (1 + this.REFORMS.slice(1, (o.reform || 0) + 1).reduce((s, r) => s + r.cost, 0))); this.remap[id] = 'safehouse'; }
        }
        for (const id in out) { const p = this.byId[id]; if (p) Object.assign(out[id], { x: p.x, z: p.z, type: p.type }); }
        this.owned = out;
        if (this.remap[this.homeId] !== undefined) this.homeId = this.remap[this.homeId];
        if (typeof Garage !== 'undefined' && Garage.cars) for (const r of Garage.cars) if (this.remap[r.garage] !== undefined) r.garage = this.remap[r.garage];
        const g = this.game;
        if (refund && g) g.inventory.clean += refund;
        if ((moved || refund) && g && g._flash) g._flash(refund ? `O mapa da cidade mudou: ${brl(refund)} dos imóveis que sumiram voltaram para a sua conta` : 'O mapa da cidade mudou: seus imóveis foram para os endereços equivalentes');
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
        this.owned[p.id] = { paid: price, day: Economy.day, reform: 0, x: p.x, z: p.z, type: p.type };      // (âncora: ver _migrate)
        this._poi(p);
        return { ok: true, msg: `Comprou: ${p.type} em ${p.region} (-${brl(price)})` };
    },
    sell(game, p) {
        if (!this.isOwned(p)) return { ok: false, msg: 'Não é seu' };
        if (this.homeId === p.id) return { ok: false, msg: 'Você mora aqui: escolha outra casa antes de vender' };
        const v = Math.round(this.price(p) * 0.8 / 100) * 100;
        game.inventory.clean += v; delete this.owned[p.id]; this._poi(p);
        if (typeof HomeDecor !== 'undefined') HomeDecor.forgetHome(p.id);         // os móveis ficam com o imóvel
        return { ok: true, msg: `Vendeu por ${brl(v)} (80% do valor de mercado, em dinheiro limpo; os móveis ficam com o imóvel)` };
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
    load(s) {
        if (!s) return;
        this.owned = s.owned || {}; this.homeId = s.home || 'safehouse';
        if (this.built) { this._migrate(); this.refreshHomePois(); } else this._pendingMigrate = true;
    },
};
