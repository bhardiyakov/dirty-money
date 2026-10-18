// ============================================================================
// Dealers — as CONCESSIONÁRIAS. Cada uma vende carros da classe social do lugar onde fica (o mesmo índice de localização dos
// imóveis, RealEstate.locate): FEIRÃO DE USADOS na favela e no entorno (calhambeques, aceita dinheiro sujo), concessionária
// POPULAR nos bairros comuns, de PADRÃO MÉDIO perto da orla e de LUXO / superesportivos na orla e na ilha (só dinheiro limpo).
//
// PREÇOS: o do carro real em que o modelo se inspira (R$ de 2026; os antigos, usados em bom estado) × SCALE — a mesma régua dos
// imóveis (~40% do mercado real), para o carro popular custar como um apartamento simples dividido por 3 e a Ferrari, como uma
// cobertura de luxo. Variação de ±5% conforme o dia. O carro comprado vai para a GARAGEM de uma das suas casas (Garage); na
// calçada da loja ficam 2 carros de VITRINE (trancados e sem gasolina — dá para arrombar, não dá para levar).
// CONCESSIONÁRIAS DE MOTO (kind 'moto'): a popular (rua, scooter, trilha; aceita dinheiro sujo, como a de usados) nos bairros comuns
// e a de motos premium (esportiva, custom de viagem) perto da orla; a moto comprada também vai para a garagem de uma casa sua.
// LOJA NÁUTICA (kind 'boat', na marina — Marina.nautica): jet ski, barco de pesca e lancha; o comprado fica na sua vaga da marina.
// Interface: ui/CarUI.js (modo 'dealer'). Marcador brilhante na porta e POI no mapa.
// ============================================================================

const Dealers = {
    SCALE: 0.4,
    list: [], built: false, game: null,

    // R$ do carro real (2026) em que cada modelo se inspira.
    REF: {
        hatch_moderno: 105000, hatch_moderno2: 92000, compacto_aventureiro: 78000, quadradinho: 32000, hatch_esportivo: 230000, mini_eletrico: 120000,
        besouro: 24000, seda_classico: 15000, hatch_90: 17000, hatch_80: 16000, sedan_70: 58000, brasilia: 21000, perua_antiga: 42000, kombi: 48000,
        suv_compacto: 175000, suv_cupe: 158000, suv_quadrado: 192000, suv_grande: 330000, jipe_offroad: 265000,
        sedan_popular: 82000, sedan_medio: 168000, sedan_luxo: 480000,
        esportivo: 850000, muscle: 560000, super: 3600000, super2: 4200000,
        picape_pequena: 112000, picape_media: 305000, picape_grande: 490000,
        van_furgao: 330000, minivan: 128000,
        // motos (estilo CG 160, PCX, XRE 300, CBR 1000RR, Harley Road King)
        moto: 18000, moto_scooter: 22000, moto_trilha: 30000, moto_esportiva: 150000, moto_custom: 185000,
        // barcos (jet ski, barco de pesca, lancha de 21 pés)
        jetski: 95000, barco: 240000, lancha: 380000,
    },

    // Padrão da loja pelo índice de localização (de min a max do idx) e o que ela vende. kind: 'car' (padrão) | 'moto'.
    TIERS: [
        { id: 'usados', min: 0, max: 0.12, n: 1, dirty: true, label: 'Feirão de usados', cond: 'usado',
          names: ['Feirão do Zé', 'Auto Usados da Quebrada'],
          models: ['quadradinho', 'besouro', 'seda_classico', 'hatch_90', 'hatch_80', 'brasilia', 'kombi', 'perua_antiga', 'sedan_70'] },
        { id: 'popular', min: 0.12, max: 0.40, n: 2, label: 'Concessionária', cond: '0 km',
          names: ['Autovia Veículos', 'Rede Popular Motors', 'Avenida Automóveis'],
          models: ['compacto_aventureiro', 'hatch_moderno2', 'sedan_popular', 'hatch_moderno', 'picape_pequena', 'mini_eletrico', 'minivan'] },
        { id: 'medio', min: 0.40, max: 0.65, n: 2, label: 'Concessionária premium', cond: '0 km',
          names: ['Prime Motors', 'Estrela Automóveis', 'Litoral Car'],
          models: ['suv_cupe', 'sedan_medio', 'suv_compacto', 'suv_quadrado', 'hatch_esportivo', 'jipe_offroad', 'picape_media', 'van_furgao'] },
        { id: 'luxo', min: 0.65, max: 1.01, n: 2, label: 'Importados e superesportivos', cond: '0 km',
          names: ['Atlântica Prestige', 'Ilha Exotic Cars'],
          models: ['suv_grande', 'picape_grande', 'sedan_luxo', 'muscle', 'esportivo', 'super', 'super2'] },
        { id: 'motos', kind: 'moto', min: 0.06, max: 0.5, n: 2, dirty: true, label: 'Concessionária de motos', cond: '0 km',
          names: ['Duas Rodas Motos', 'Rio Moto Center'],
          models: ['moto', 'moto_scooter', 'moto_trilha'] },
        { id: 'motos_premium', kind: 'moto', min: 0.45, max: 1.01, n: 1, label: 'Motos premium', cond: '0 km',
          names: ['Atlântica Motorcycles'],
          models: ['moto_trilha', 'moto_esportiva', 'moto_custom'] },
    ],
    // A loja náutica (uma só, na marina).
    BOATS: { id: 'nautica', kind: 'boat', label: 'Loja náutica', cond: '0 km', models: ['jetski', 'barco', 'lancha'] },

    // ---------------------------------------------------------------- preço
    market() { const d = typeof Economy !== 'undefined' ? Economy.day : 0; return 1 + 0.05 * Math.sin(d * 1.3 + 2); },
    price(model) { return Math.round((this.REF[model] || 60000) * this.SCALE * this.market() / 100) * 100; },
    // Quanto vale um carro seu hoje (revenda): 55% do preço, pelo estado da lataria.
    resale(rec) { return Math.round(this.price(rec.model) * 0.55 * (0.4 + 0.6 * Math.max(0, Math.min(1, rec.hp))) / 100) * 100; },

    // ---------------------------------------------------------------- onde ficam
    build(game) {
        if (this.built || !RealEstate.built) return;
        this.built = true; this.game = game;
        const rng = Pixel.rng(71717), home = SafeHouse.spawnWorld();
        const cands = [];
        for (const b of CityGrid.blocks) {
            if (b.open || b.virtual || b.organic) continue;                // (favela: carro não chega na porta dos barracos)
            for (const l of b.lots) {
                if (l.landmark || l.safehouse || (l.x1 - l.x0) * (l.z1 - l.z0) < 60) continue;
                const d = CityGrid.lotDoor(b, l);                                       // só na beira da quadra (porta na calçada)
                if (!d) continue;
                const cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2, door = { x: d.x, z: d.z, face: d.face };
                if (home && hypot(door.x - home.x, door.z - home.z) < 40) continue;
                if (RealEstate.list.some((p) => hypot(p.x - door.x, p.z - door.z) < 16)) continue;          // (não em cima da porta de um imóvel)
                cands.push({ b, door, loc: RealEstate.locate(cx, cz, b) });
            }
        }
        this.TIERS.forEach((t) => {
            const kind = t.kind || 'car', pool = cands.filter((c) => c.loc.idx >= t.min && c.loc.idx < t.max);
            let made = 0;
            while (made < t.n && pool.length) {
                const c = pool.splice(Math.floor(rng() * pool.length), 1)[0];
                // espalhadas pela cidade (220 u das do mesmo ramo; 60 u de qualquer outra)
                if (this.list.some((o) => hypot(o.x - c.door.x, o.z - c.door.z) < (o.kind === kind ? 220 : 60))) continue;
                const slots = Garage.curbSlots(c.door.x, c.door.z, 3).slice(1);      // (as vagas dos lados: na frente da porta, o "F roubar" taparia o "E entrar")
                if (slots.length < 2) continue;
                const id = 'dealer' + this.list.length, models = t.models.slice().sort((a, z) => this.REF[a] - this.REF[z]);
                const d = { id, kind, name: t.names[made % t.names.length], tier: t, x: c.door.x, z: c.door.z, region: c.loc.region, models,
                    display: slots.map((s, i) => ({ x: s.x, z: s.z, h: s.h, model: models[models.length - 1 - i], paint: Catalog.pool(models[models.length - 1 - i])[0] })), cars: [] };
                this.list.push(d);
                CityGrid.addPoi({ type: kind === 'moto' ? 'motodealer' : 'dealer', name: `${d.name} — ${t.label.toLowerCase()}`, x: d.x, z: d.z, dealer: id });
                made++;
            }
        });
        const N = typeof Marina !== 'undefined' && Marina.nautica;                 // a loja náutica, na marina (o POI é dela: Marina._nautica)
        if (N) {
            const B = this.BOATS, models = B.models.slice().sort((a, z) => this.REF[a] - this.REF[z]);
            this.list.push({ id: B.id, kind: 'boat', name: 'Náutica Dirty Bay', tier: B, x: N.door.x, z: N.door.z, region: 'Marina', models, display: [], cars: [] });
        }
        this.glow = new GlowBatch(game.scene, this.list.length + 1, 'dealerGlow', 'glow');
        for (let i = 0; i <= this.list.length; i++) { this.glow.alloc(); this.glow.off(i); }
        this._t = 0;
        console.log(`[CONCESSIONÁRIAS] ${this.list.map((d) => `${d.name} (${d.tier.id}, ${d.region})`).join(' · ')}`);
    },

    needsClean(d) { return !d.tier.dirty; },

    // Compra: o carro vai para a garagem `garageId` (uma das suas casas, com vaga). paint: linha de CarSheet.PAINTS.
    buy(game, d, model, paint, garageId) {
        const price = this.price(model), inv = game.inventory, clean = this.needsClean(d);
        if (!d.models.includes(model)) return { ok: false, msg: 'Esta loja não vende esse modelo' };
        const G = Garage.byId(garageId);
        if (!G || !Garage.usable(G) || !!G.boat !== (d.kind === 'boat')) return { ok: false, msg: d.kind === 'boat' ? 'Barco fica na vaga da marina' : 'Escolha uma garagem de uma casa sua' };
        if (Garage.free(G) <= 0) return { ok: false, msg: `A garagem de ${G.name} está cheia` };
        if (clean && inv.clean < price) return { ok: false, msg: inv.cash >= price ? 'Aqui só aceitam dinheiro LIMPO. Lave o seu nas fachadas' : `Faltam ${brl(price - inv.clean)} de dinheiro limpo` };
        if (!clean && inv.cash < price) return { ok: false, msg: `Faltam ${brl(price - inv.cash)}` };
        if (clean) inv.clean -= price; else inv.cash -= price;
        Garage.add({ model, paint, hp: 1, fuel: 1, mods: {}, bought: true, paid: price, dirty: !clean, day: Economy.day }, G);
        return { ok: true, msg: `Comprado: ${Catalog.label(model)} (-${brl(price)}) — ${G.boat ? 'está na sua vaga da marina' : `está na garagem de ${G.name}`}` };
    },

    // ---------------------------------------------------------------- interação
    near(game, maxD = 3.2) {
        if (!this.built || game.mode !== 'player') return null;
        const p = game.player.position;
        let best = null, bd = maxD;
        for (const d of this.list) { const r = hypot(d.x - p.x, d.z - p.z); if (r < bd) { bd = r; best = d; } }
        return best;
    },
    prompt(game) {
        const d = this.near(game);
        return d ? `<b>E</b> entrar na ${d.name}<small>${d.tier.label} · ${d.tier.dirty ? 'aceita dinheiro sujo' : 'só dinheiro limpo'}</small>` : '';
    },
    interact(game) {
        const d = this.near(game);
        if (!d || !game.carUI) return false;
        game.carUI.showDealer(d);
        return true;
    },

    // ---------------------------------------------------------------- por frame: marcador e carros de vitrine
    update(dt) {
        if (!this.built) return;
        const g = this.game, f = g.camera.target, G = this.glow;
        this._t += dt;
        const pulse = 0.75 + 0.25 * Math.sin(this._t * 3);
        for (let i = 0; i < this.list.length; i++) {
            const d = this.list[i], r = hypot(d.x - f.x, d.z - f.z);
            if (r > 70) G.off(i); else { G.place(i, d.x, 0.35, d.z, 2.8 + 0.5 * pulse); G.color(i, 0.35, 0.85, 1, 0.75 * pulse); }
            // vitrine: aparece perto (140 u) e some longe (200 u), se ninguém estiver dirigindo
            if (r < 140 && !d.cars.length && g.vehicleManager) d.cars = d.display.map((s) => this._showcase(g, s));
            else if (r > 200 && d.cars.length) { for (const c of d.cars) if (c && !c.controlled && !c.hold) Garage.despawn(g, c); d.cars = []; }
        }
        G.flush();
    },
    _showcase(g, s) {
        const car = Garage.spawnCar(g, s.model, s.paint, s.x, s.z, s.h);
        if (!car) return null;
        car.locked = true; car.fuel = 0; car.display = true; car._xpGiven = true;
        return car;
    },
};
