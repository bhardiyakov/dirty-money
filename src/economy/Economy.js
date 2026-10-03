// ============================================================================
// Economy — preços, estoque e horário das lojas, conforme o TIPO da loja e ONDE ela fica.
//
//   • ITEMS      catálogo (preço-base em $, efeito). kind 'meal' = consome na hora (cura); 'goods' = vai para a mochila.
//   • STYLES     um por tipo de interior (lanchonete, mercadinho, pizzaria, loja de armas, boca de fumo...): nome, horário,
//                nível de preço, cardápio (com quantidade limitada nas armas) e o que a loja COMPRA.
//   • price()    preço final = base × zona (favela barato, ilha/resort caro, centro um pouco mais) × estilo × variação do dia
//                (±8%, muda a cada dia do jogo) × adicional noturno (mercadinho/farmácia) − happy hour do bar.
//   • restock    o estoque de cada loja é sorteado ao 1º acesso do dia e zera ao virar o dia.
// Regras de lugar: loja de armas da CIDADE é legal (preço cheio, estoque grande, sem pistola barata); a da FAVELA é a "boca de
// fumo": mais barata, estoque sortido e pequeno (inclui AK-47), compra joias de ladrão (55%).
// ============================================================================

const Economy = {
    day: 0,                 // dias do jogo (sobe quando o relógio passa da meia-noite)
    _lastHour: -1,
    shops: {},              // estoque por loja (id → { items: [{ id, qty }], day })

    // ------------------------------------------------------------------ catálogo
    // heal: vida recuperada | icon: chave do ItemSprites | give: o que vai para a mochila (goods)
    ITEMS: {
        // restaurantes e lanchonetes (comer aqui)
        burger:   { name: 'X-Burger', icon: 'food', base: 14, kind: 'meal', heal: 30, desc: 'Pão, carne e queijo' },
        bacon:    { name: 'X-Bacon Duplo', icon: 'food', base: 20, kind: 'meal', heal: 45, desc: 'Dois hambúrgueres e bacon' },
        fries:    { name: 'Batata frita', icon: 'food', base: 8, kind: 'meal', heal: 14, desc: 'Porção média' },
        soda:     { name: 'Refrigerante', icon: 'water', base: 6, kind: 'meal', heal: 8, desc: 'Lata gelada' },
        shake:    { name: 'Milkshake', icon: 'water', base: 12, kind: 'meal', heal: 16, desc: 'Chocolate' },
        slice:    { name: 'Fatia de pizza', icon: 'food', base: 9, kind: 'meal', heal: 22, desc: 'Calabresa' },
        pizza:    { name: 'Pizza inteira', icon: 'food', base: 42, kind: 'meal', heal: 85, desc: '8 fatias de queijo e tomate' },
        salad:    { name: 'Salada completa', icon: 'food', base: 17, kind: 'meal', heal: 24, desc: 'Folhas, grão-de-bico e molho' },
        juice:    { name: 'Suco natural', icon: 'water', base: 11, kind: 'meal', heal: 16, desc: 'Laranja, acerola ou verde' },
        bowl:     { name: 'Bowl de açaí', icon: 'food', base: 19, kind: 'meal', heal: 32, desc: 'Com granola e banana' },
        pasta:    { name: 'Massa à bolonhesa', icon: 'food', base: 58, kind: 'meal', heal: 70, desc: 'Massa fresca da casa' },
        risotto:  { name: 'Risoto de cogumelos', icon: 'food', base: 74, kind: 'meal', heal: 80, desc: 'Arroz arbóreo e trufa' },
        menu_it:  { name: 'Menu degustação', icon: 'food', base: 190, kind: 'meal', heal: 100, desc: '5 tempos com vinho — vida cheia' },
        wine:     { name: 'Taça de vinho', icon: 'water', base: 48, kind: 'meal', heal: 6, desc: 'Tinto, safra da casa' },
        sushi:    { name: 'Combinado de sushi', icon: 'food', base: 46, kind: 'meal', heal: 60, desc: '14 peças' },
        omakase:  { name: 'Omakase do chef', icon: 'food', base: 240, kind: 'meal', heal: 100, desc: 'O chef escolhe — vida cheia' },
        sake:     { name: 'Saquê', icon: 'water', base: 36, kind: 'meal', heal: 5, desc: 'Quente ou gelado' },
        beer:     { name: 'Cerveja', icon: 'water', base: 8, kind: 'meal', heal: 4, desc: 'Garrafa 600 ml' },
        shot:     { name: 'Dose de cachaça', icon: 'water', base: 6, kind: 'meal', heal: 2, desc: 'Da boa' },
        snack:    { name: 'Petisco da casa', icon: 'food', base: 15, kind: 'meal', heal: 18, desc: 'Torresmo e mandioca' },
        bread:    { name: 'Pão na chapa', icon: 'food', base: 7, kind: 'meal', heal: 14, desc: 'Com manteiga' },
        coffee:   { name: 'Café com leite', icon: 'water', base: 5, kind: 'meal', heal: 7, desc: 'Coado na hora' },
        cake:     { name: 'Fatia de bolo', icon: 'food', base: 9, kind: 'meal', heal: 18, desc: 'Cenoura com chocolate' },
        // levar para casa
        lunch:    { name: 'Marmita (levar)', icon: 'food', base: 16, kind: 'goods', give: 'food', desc: 'Come depois: +28 de vida' },
        bottle:   { name: 'Água mineral (levar)', icon: 'water', base: 5, kind: 'goods', give: 'water', desc: 'Bebe depois: +12 de vida' },
        medkit:   { name: 'Kit médico', icon: 'medkit', base: 65, kind: 'goods', give: 'medkit', desc: 'Recupera 55 de vida' },
        patch:    { name: 'Curativo', icon: 'medkit', base: 12, kind: 'meal', heal: 15, desc: 'Passa na hora' },
        // armas, munição e proteção
        knife:    { name: 'Faca', icon: 'knife', base: 55, kind: 'weapon', weapon: 'knife', ammo: 0, desc: 'Corpo a corpo' },
        bat:      { name: 'Taco de beisebol', icon: 'bat', base: 75, kind: 'weapon', weapon: 'bat', ammo: 0, desc: 'Corpo a corpo' },
        pistol:   { name: 'Pistola', icon: 'pistol', base: 450, kind: 'weapon', weapon: 'pistol', ammo: 24, desc: '12 tiros · vem com 24 balas' },
        revolver: { name: 'Revólver', icon: 'revolver', base: 700, kind: 'weapon', weapon: 'revolver', ammo: 18, desc: 'Dano alto · vem com 18 balas' },
        shotgun:  { name: 'Escopeta', icon: 'shotgun', base: 1100, kind: 'weapon', weapon: 'shotgun', ammo: 18, desc: 'Curta distância · 18 cartuchos' },
        smg:      { name: 'Submetralhadora', icon: 'smg', base: 1500, kind: 'weapon', weapon: 'smg', ammo: 60, desc: 'Rajada · 60 balas' },
        rifle:    { name: 'Fuzil', icon: 'rifle', base: 2400, kind: 'weapon', weapon: 'rifle', ammo: 60, desc: 'Longo alcance · 60 balas' },
        ak47:     { name: 'AK-47', icon: 'ak47', base: 2900, kind: 'weapon', weapon: 'ak47', ammo: 60, desc: 'Automática pesada · 60 balas' },
        ammo_p:   { name: 'Munição de pistola/revólver', icon: 'ammo_pistol', base: 60, kind: 'ammo', weapons: ['pistol', 'revolver'], n: 24, desc: '+24 balas' },
        ammo_s:   { name: 'Cartuchos de escopeta', icon: 'ammo_pistol', base: 70, kind: 'ammo', weapons: ['shotgun'], n: 12, desc: '+12 cartuchos' },
        ammo_m:   { name: 'Munição de SMG', icon: 'ammo_pistol', base: 130, kind: 'ammo', weapons: ['smg'], n: 60, desc: '+60 balas' },
        ammo_r:   { name: 'Munição de fuzil', icon: 'ammo_rifle', base: 180, kind: 'ammo', weapons: ['rifle', 'ak47'], n: 60, desc: '+60 balas' },
        vest:     { name: 'Colete nível 1', icon: 'vest', base: 450, kind: 'vest', max: 50, desc: 'Absorve 75% do dano até 50 pts' },
        vest2:    { name: 'Colete nível 2', icon: 'vest2', base: 1000, kind: 'vest', max: 100, desc: 'Absorve 75% do dano até 100 pts' },
        // mercado clandestino
        hack:     { name: 'Módulo de hackeio', icon: 'hack', base: 160, kind: 'goods', give: 'hack', desc: 'Abre fechadura de carro sem mini-game' },
        carkey:   { name: 'Chave de carro roubada', icon: 'carkey', base: 130, kind: 'goods', give: 'key', desc: 'Destranca um carro sem alarme' },
    },

    // ------------------------------------------------------------------ estilos de loja (um por interior)
    // hours: [abre, fecha] (fecha > 24 = passa da meia-noite) | tier: multiplicador do estilo | stock: [id, peso, qtdMax?]
    STYLES: {
        burger:   { label: 'Lanchonete', tier: 1.0, hours: [8, 26], stock: [['burger'], ['bacon'], ['fries'], ['soda'], ['shake'], ['lunch'], ['bottle']] },
        mart:     { label: 'Conveniência', tier: 1.0, hours: [0, 24], night: 1.2, stock: [['bottle'], ['soda'], ['snack'], ['lunch'], ['coffee'], ['cake'], ['patch']] },
        pharmacy: { label: 'Farmácia', tier: 1.1, hours: [7, 23], night: 1.2, stock: [['medkit'], ['patch'], ['bottle'], ['juice']] },
        bar:      { label: 'Bar', tier: 1.0, hours: [11, 28], happy: [17, 19], stock: [['beer'], ['shot'], ['snack'], ['fries'], ['soda']] },
        bakery:   { label: 'Padaria', tier: 0.9, hours: [5, 20], stock: [['bread'], ['coffee'], ['cake'], ['slice'], ['juice'], ['lunch']] },
        pizza:    { label: 'Pizzaria', tier: 1.0, hours: [11, 25], stock: [['slice'], ['pizza'], ['soda'], ['beer'], ['lunch']] },
        fit:      { label: 'Saladas & Sucos', tier: 1.15, hours: [7, 19], stock: [['salad'], ['juice'], ['bowl'], ['bottle'], ['lunch']] },
        italian:  { label: 'Ristorante', tier: 1.0, hours: [12, 23], stock: [['pasta'], ['risotto'], ['wine'], ['menu_it']] },
        japanese: { label: 'Restaurante Japonês', tier: 1.0, hours: [12, 23], stock: [['sushi'], ['sake'], ['omakase'], ['soda']] },
        guns:     { label: 'Loja de Armas', tier: 1.0, hours: [9, 19], legal: true, guns: true,
            stock: [['knife', 1, 3], ['bat', 1, 3], ['pistol', 1, 4], ['revolver', 1, 3], ['shotgun', 1, 2], ['smg', 0.6, 1], ['rifle', 0.5, 1], ['ammo_p'], ['ammo_s'], ['ammo_m'], ['ammo_r'], ['vest', 1, 3], ['vest2', 0.6, 1]] },
        drugs:    { label: 'Boca de Fumo', tier: 0.72, hours: [0, 24], guns: true, fence: 0.55,
            stock: [['pistol', 1, 2], ['revolver', 0.9, 2], ['shotgun', 0.8, 2], ['smg', 0.7, 1], ['ak47', 0.6, 1], ['rifle', 0.4, 1], ['ammo_p'], ['ammo_s'], ['ammo_m'], ['ammo_r'], ['hack', 0.8, 3], ['carkey', 0.8, 3], ['medkit', 0.8, 2]] },
    },

    // Quais lojas do mapa (id em TileFactory.SHOPS) têm interior, e qual estilo usam.
    KIND_STYLE: { lanchonete: 'burger', conveniencia: 'mart', farmacia: 'pharmacy', bar: 'bar', padaria: 'bakery', armas: 'guns', pizzaria: 'pizza', saladas: 'fit', italiano: 'italian', japones: 'japanese', bocafumo: 'drugs' },

    // Multiplicador de preço pela zona da cidade (distrito + bioma do quarteirão).
    ZONE: {
        favela: { mul: 0.8, label: 'Favela' },
        island: { mul: 1.45, label: 'Ilha (resort)' },
        downtown: { mul: 1.18, label: 'Centro' },
        commercial: { mul: 1.0, label: 'Comércio' },
        residential: { mul: 0.95, label: 'Bairro residencial' },
        industrial: { mul: 0.9, label: 'Zona industrial' },
        city: { mul: 1.0, label: 'Cidade' },
    },
    zoneOf(shop) {
        if (shop.district === 'favela') return this.ZONE.favela;
        if (shop.district === 'island') return this.ZONE.island;
        return this.ZONE[shop.biome] || this.ZONE.city;
    },

    // ------------------------------------------------------------------ nomes das lojas
    NAMES: {
        burger: ['Lanchonete do Zé', 'Burger Bom', 'Lanches da Dona Rita', 'Big Bonde', 'Sanduba Rei', 'Chapa Quente'],
        mart: ['Mercadinho 24h', 'Conveniência Esquina', 'Mini Mart Liberdade', 'Empório da Rua', 'Super Rápido'],
        pharmacy: ['Farmácia Popular', 'Drogaria Saúde', 'Pharma Centro', 'Farma Vida'],
        bar: ['Bar do Chico', 'Boteco da Orla', 'Bar do Português', 'Tasca do Mané', 'Bar Cachaça Boa'],
        bakery: ['Padaria Pão Quente', 'Padaria Estrela', 'Panificadora Real', 'Padoca da Vila'],
        pizza: ['Pizzaria Napoli', 'Pizza & Cia', 'Forno a Lenha Tia Nena', 'Pizzaria Bella Fatia'],
        fit: ['Saladas & Sucos Fit', 'Verde Vida', 'Suco Natural Bem-Estar', 'Fit Bowl'],
        italian: ['Ristorante Il Padrino', 'Trattoria La Bella', 'Osteria Dolce Vita', 'Ristorante Milano'],
        japanese: ['Sushi Sakura', 'Kaito Japanese Dining', 'Yamato Sushi Bar', 'Restaurante Tóquio'],
        guns: ['Armas & Cia', 'Armaria Liberty', 'Arsenal Legal', 'Tiro Certo Armas'],
        drugs: ['Boca do Morro', 'Biqueira da Laje', 'Ponto do Gordo', 'Casa do Fumo'],
    },
    nameOf(style, id) {
        const L = this.NAMES[style] || [this.STYLES[style].label];
        return L[Math.floor(Pixel.hash(this._h(id), 7, 3) * L.length) % L.length];
    },
    _h(s) { let h = 17; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; },

    // ------------------------------------------------------------------ tempo
    // Chamado todo quadro com a hora do relógio do jogo: vira o dia → novos preços e estoque.
    tick(hour) {
        if (this._lastHour >= 0 && hour < this._lastHour - 12) { this.day++; this.shops = {}; if (typeof Laundry !== 'undefined') Laundry.onNewDay(); if (typeof Careers !== 'undefined' && Careers.instance) Careers.instance.onNewDay(); }
        this._lastHour = hour;
    },

    isOpen(style, hour) {
        const [a, b] = this.STYLES[style].hours;
        return (hour >= a && hour < b) || (hour + 24 >= a && hour + 24 < b);
    },
    opensAt(style) { return Math.floor(this.STYLES[style].hours[0]) % 24; },

    // ------------------------------------------------------------------ preços
    // Fatores que entram no preço (para mostrar na interface): [{ label, mul }]
    factors(shop, hour) {
        const S = this.STYLES[shop.style], out = [], z = this.zoneOf(shop);
        out.push({ label: z.label, mul: z.mul });
        if (S.tier !== 1) out.push({ label: shop.district === 'favela' && S.guns ? 'Mercado clandestino' : S.label, mul: S.tier });
        const fl = 1 + (Pixel.hash(this._h(shop.id), this.day, 5) - 0.5) * 0.16;
        out.push({ label: 'Movimento do dia', mul: fl });
        if (shop.district === 'favela') {                                  // o comércio local trata melhor (ou pior) quem a comunidade respeita
            if (Standing.community >= 60) out.push({ label: 'Moral da comunidade', mul: 0.9 });
            else if (Standing.community < 25) out.push({ label: 'Mal visto na comunidade', mul: 1.2 });
            if (shop.style === 'pharmacy') { if (Standing.community >= 60) out.push({ label: 'Farmácia comunitária', mul: 0.75 }); else if (Standing.community < 25) out.push({ label: 'Farmácia: desconfiança', mul: 1.35 }); }
        }
        if (S.night && (hour >= 22 || hour < 6)) out.push({ label: 'Adicional noturno', mul: S.night });
        if (S.happy && hour >= S.happy[0] && hour < S.happy[1]) out.push({ label: 'Happy hour', mul: 0.85 });
        return out;
    },

    price(shop, id, hour) {
        let p = this.ITEMS[id].base;
        for (const f of this.factors(shop, hour)) p *= f.mul;
        p *= 1 - (typeof SkillTree !== 'undefined' ? (SkillTree.m.price || 0) : 0);      // habilidade Pechincha
        return Math.max(1, Math.round(p));
    },

    // ------------------------------------------------------------------ estoque
    stockFor(shop) {
        let st = this.shops[shop.id];
        if (st) return st;
        const S = this.STYLES[shop.style], r = Pixel.rng(this._h(shop.id) ^ (this.day * 7919)), items = [];
        for (const [id, chance = 1, max = Infinity] of S.stock) {
            if (S.guns && r() > Math.min(1, chance + (shop.district === 'favela' ? 0 : 0.2))) continue;     // favela: estoque sortido; cidade: quase tudo
            if (!S.guns && r() < 0.12) continue;                                                               // restaurante sem um prato hoje
            const qty = max === Infinity ? Infinity : 1 + Math.floor(r() * max);
            items.push({ id, qty });
        }
        if (!items.length) items.push({ id: S.stock[0][0], qty: Infinity });
        return (this.shops[shop.id] = { items });
    },

    // ------------------------------------------------------------------ compra
    // Cabe na mochila? (comer na hora não ocupa espaço)
    _fits(game, it) {
        const inv = game.inventory;
        switch (it.kind) {
            case 'weapon': return inv.slotsNeeded({ kind: 'weapon', weapon: it.weapon, ammo: it.ammo }) <= inv.slotsFree();
            case 'ammo': return inv.slotsNeeded({ kind: 'ammo', weapons: it.weapons }) <= inv.slotsFree();
            case 'goods': {
                const T = it.give === 'food' || it.give === 'water' ? { kind: 'heal', item: it.give } : { kind: it.give === 'key' ? 'key' : it.give };
                return inv.slotsNeeded(T) <= inv.slotsFree();
            }
            default: return true;
        }
    },

    // Compra 1 unidade. Retorna { ok, msg }.
    buy(game, shop, id) {
        const it = this.ITEMS[id], inv = game.inventory, st = this.stockFor(shop), entry = st.items.find((e) => e.id === id), pl = game.player;
        if (!entry || entry.qty <= 0) return { ok: false, msg: 'Esgotado' };
        const price = this.price(shop, id, game.dayNight.hour);
        const needClean = shop.district !== 'favela' && price >= Laundry.CLEAN_MIN;          // compra grande no comércio legal: só dinheiro LIMPO
        if ((needClean ? inv.clean : inv.cash) < price) return { ok: false, msg: needClean ? (inv.cash >= price ? 'Compra grande: o comércio legal só aceita dinheiro LIMPO — lave o seu' : 'Dinheiro limpo insuficiente') : 'Dinheiro insuficiente' };
        if (it.kind === 'weapon' && inv.owned(it.weapon)) return { ok: false, msg: 'Você já tem essa arma' };
        if (it.kind === 'meal' && pl.hp >= pl.maxHp - 0.5 && id !== 'wine' && id !== 'beer' && id !== 'shot' && id !== 'sake') return { ok: false, msg: 'Você não está com fome (vida cheia)' };
        if (it.kind === 'ammo' && !it.weapons.some((w) => inv.owned(w))) return { ok: false, msg: 'Você não tem arma para essa munição' };
        if (it.kind === 'vest' && pl.armorMax >= it.max && pl.armor >= pl.armorMax - 0.5) return { ok: false, msg: 'Você já está com esse colete' };
        if (!this._fits(game, it)) return { ok: false, msg: 'Mochila cheia' };
        if (needClean) inv.clean -= price; else inv.cash -= price;
        if (entry.qty !== Infinity) entry.qty--;
        let msg = `Comprou: ${it.name} (-${brl(price)})`;
        switch (it.kind) {
            case 'meal': pl.hp = Math.min(pl.maxHp, pl.hp + it.heal); msg = `${it.name}: +${it.heal} de vida (-${brl(price)})`; break;
            case 'weapon': inv.addWeapon(it.weapon, it.ammo); break;
            case 'ammo': { const own = it.weapons.filter((w) => inv.owned(w)); for (const w of own) inv.addAmmo(w, it.n); break; }
            case 'vest': pl.wearVest(it.max); break;
            case 'goods': if (it.give === 'food') inv.food++; else if (it.give === 'water') inv.water++; else if (it.give === 'medkit') inv.medkits++; else if (it.give === 'hack') inv.hacks++; else inv.keys++; break;
        }
        Standing.shopped(shop, price);
        return { ok: true, msg };
    },

    // Quanto a loja paga pelas joias da mochila (null = não compra).
    fenceOffer(shop, game) {
        const S = this.STYLES[shop.style];
        if (!S.fence || game.inventory.jewels <= 0) return null;
        return { count: game.inventory.jewels, value: Math.round(game.inventory.jewelValue * S.fence * (1 + (SkillTree.m.fence || 0))) };
    },
    sellJewels(game, shop) {
        const o = this.fenceOffer(shop, game);
        if (!o) return { ok: false, msg: 'Não tem nada que eu queira' };
        game.inventory.jewels = 0; game.inventory.jewelValue = 0; game.inventory.cash += o.value;
        if (shop.district === 'favela') Standing.add('traffic', 3);
        return { ok: true, msg: `Vendeu ${o.count} joias por ${brl(o.value)} (sem perguntas)` };
    },
};
