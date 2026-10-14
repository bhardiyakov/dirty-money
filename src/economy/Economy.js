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
    dayHooks: [],           // funções chamadas quando o dia vira (negócios, rastros, golpes…): Economy.onDay(fn)
    onDay(fn) { this.dayHooks.push(fn); },
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
        ammo_p:   { name: 'Munição de pistola/revólver', icon: 'ammo_pistol', base: 60, kind: 'ammo', weapons: ['pistol', 'revolver', 'pistol_sil'], n: 24, desc: '+24 balas' },
        ammo_s:   { name: 'Cartuchos de escopeta', icon: 'ammo_pistol', base: 70, kind: 'ammo', weapons: ['shotgun'], n: 12, desc: '+12 cartuchos' },
        ammo_m:   { name: 'Munição de SMG', icon: 'ammo_pistol', base: 130, kind: 'ammo', weapons: ['smg'], n: 60, desc: '+60 balas' },
        ammo_r:   { name: 'Munição de fuzil', icon: 'ammo_rifle', base: 180, kind: 'ammo', weapons: ['rifle', 'ak47'], n: 60, desc: '+60 balas' },
        // armas novas: a pistola com silenciador (loja de armas e boca) e as pesadas (só na boca de fumo — tecla =)
        pistol_sil: { name: 'Pistola com silenciador', icon: 'pistol_sil', base: 2200, kind: 'weapon', weapon: 'pistol_sil', ammo: 30, desc: 'Tecla 2 (de novo) · o tiro quase não chama a polícia · 15 tiros, vem com 30 balas' },
        rpg:      { name: 'RPG', icon: 'rpg', base: 30000, kind: 'weapon', weapon: 'rpg', ammo: 3, desc: 'Tecla = · foguete livre que explode tudo · um acerto derruba o helicóptero · vem com 3 foguetes' },
        launcher: { name: 'Lança-foguetes', icon: 'launcher', base: 55000, kind: 'weapon', weapon: 'launcher', ammo: 8, desc: 'Tecla = · foguete TELEGUIADO: trava no helicóptero ou no carro · 4 por recarga, vem com 8' },
        minigun:  { name: 'Minigun', icon: 'minigun', base: 42000, kind: 'weapon', weapon: 'minigun', ammo: 500, desc: 'Tecla = · gira os canos e cospe 20 balas por segundo · pesada: anda devagar · vem com 500' },
        ammo_rpg: { name: 'Foguetes de RPG', icon: 'ammo_rocket', base: 4000, kind: 'ammo', weapons: ['rpg'], n: 2, desc: '+2 foguetes' },
        ammo_rk:  { name: 'Foguetes teleguiados', icon: 'ammo_rocket', base: 7000, kind: 'ammo', weapons: ['launcher'], n: 4, desc: '+4 foguetes (um pente)' },
        ammo_belt: { name: 'Cinta da minigun', icon: 'ammo_rifle', base: 1600, kind: 'ammo', weapons: ['minigun'], n: 250, desc: '+250 balas' },
        // academia (minigames/Gym.js): a diária/mensalidade libera os aparelhos; suplementos alimentam (e o whey ajuda no treino)
        gym_day:  { name: 'Diária da academia', icon: 'gym', base: 25, kind: 'gympass', days: 1, desc: 'Libera rosca, supino e agachamento até o fim de hoje' },
        gym_week: { name: 'Semana na academia', icon: 'gym', base: 120, kind: 'gympass', days: 7, desc: '7 dias de treino liberado' },
        gym_month: { name: 'Mensalidade', icon: 'gym', base: 380, kind: 'gympass', days: 30, desc: '30 dias de treino liberado' },
        whey:     { name: 'Shake de whey', icon: 'water', base: 22, kind: 'meal', heal: 10, kcal: 22, protein: 1, desc: 'Proteína: o próximo treino rende mais' },
        protbar:  { name: 'Barra de proteína', icon: 'food', base: 9, kind: 'meal', heal: 8, kcal: 18, protein: 0.5, desc: 'Lanche rápido com proteína' },
        grenade:  { name: 'Granada', icon: 'grenade', base: 950, kind: 'throw', weapon: 'grenade', n: 1, desc: 'Tecla 0 · segure para puxar o pino e mirar, solte para jogar · explode em ~3 s' },
        molotov:  { name: 'Coquetel molotov', icon: 'molotov', base: 160, kind: 'throw', weapon: 'molotov', n: 1, desc: 'Tecla − · segure para acender e mirar, solte para jogar · fogo no chão por 30+ s' },
        vest:     { name: 'Colete nível 1', icon: 'vest', base: 450, kind: 'vest', max: 50, desc: 'Absorve 75% do dano até 50 pts' },
        vest2:    { name: 'Colete nível 2', icon: 'vest2', base: 1000, kind: 'vest', max: 100, desc: 'Absorve 75% do dano até 100 pts' },
        // bolsas (ver player/Bags.js): mais espaço na grade e mais carga antes de pesar; aparecem no personagem
        bag_cross: { name: 'Mala transversal', icon: 'bag_cross', base: 120, kind: 'bag', bag: 'cross', desc: 'Grade 4×3 · carrega 14 kg sem pesar' },
        bag_pack: { name: 'Mochila', icon: 'bag_pack', base: 350, kind: 'bag', bag: 'pack', desc: 'Grade 5×4 · carrega 24 kg sem pesar' },
        bag_tac:  { name: 'Mochila tática', icon: 'bag_tactical', base: 2200, kind: 'bag', bag: 'tactical', desc: 'Grade 6×5 · carrega 38 kg sem pesar' },
        // na mão (o jogador anda carregando: só dá para usar pistola junto) — para roubos grandes: dinheiro de cofre, armas, mercadoria
        bag_brief:  { name: 'Maleta de alumínio', icon: 'bag_brief', base: 650, kind: 'bag', bag: 'briefcase', desc: 'Na mão · grade 4×2 · 12 kg · discreta' },
        bag_duffel: { name: 'Bolsa de lona', icon: 'bag_duffel', base: 380, kind: 'bag', bag: 'duffel', desc: 'Na mão · grade 7×5 · 52 kg sem pesar — cabe um cofre de banco' },
        bag_suit:   { name: 'Mala de rodinhas', icon: 'bag_suit', base: 900, kind: 'bag', bag: 'suitcase', desc: 'Puxada · grade 6×6 · 46 kg; andando, as rodinhas levam o peso' },
        // mercado clandestino
        hack:     { name: 'Módulo de hackeio', icon: 'hack', base: 160, kind: 'goods', give: 'hack', desc: 'Abre fechadura de carro sem mini-game' },
        carkey:   { name: 'Chave de carro roubada', icon: 'carkey', base: 130, kind: 'goods', give: 'key', desc: 'Destranca um carro sem alarme' },
    },

    // ------------------------------------------------------------------ estilos de loja (um por interior)
    // hours: [abre, fecha] (fecha > 24 = passa da meia-noite) | tier: multiplicador do estilo | stock: [id, peso, qtdMax?]
    STYLES: {
        burger:   { label: 'Lanchonete', tier: 1.0, hours: [8, 26], stock: [['burger'], ['bacon'], ['fries'], ['soda'], ['shake'], ['lunch'], ['bottle']] },
        mart:     { label: 'Conveniência', tier: 1.0, hours: [0, 24], night: 1.2, stock: [['bottle'], ['soda'], ['snack'], ['lunch'], ['coffee'], ['cake'], ['patch'], ['bag_cross'], ['bag_pack']] },
        pharmacy: { label: 'Farmácia', tier: 1.1, hours: [7, 23], night: 1.2, stock: [['medkit'], ['patch'], ['bottle'], ['juice']] },
        bar:      { label: 'Bar', tier: 1.0, hours: [11, 28], happy: [17, 19], stock: [['beer'], ['shot'], ['snack'], ['fries'], ['soda']] },
        bakery:   { label: 'Padaria', tier: 0.9, hours: [5, 20], stock: [['bread'], ['coffee'], ['cake'], ['slice'], ['juice'], ['lunch']] },
        pizza:    { label: 'Pizzaria', tier: 1.0, hours: [11, 25], stock: [['slice'], ['pizza'], ['soda'], ['beer'], ['lunch']] },
        fit:      { label: 'Saladas & Sucos', tier: 1.15, hours: [7, 19], stock: [['salad'], ['juice'], ['bowl'], ['bottle'], ['lunch']] },
        italian:  { label: 'Ristorante', tier: 1.0, hours: [12, 23], stock: [['pasta'], ['risotto'], ['wine'], ['menu_it']] },
        japanese: { label: 'Restaurante Japonês', tier: 1.0, hours: [12, 23], stock: [['sushi'], ['sake'], ['omakase'], ['soda']] },
        guns:     { label: 'Loja de Armas', tier: 1.0, hours: [9, 19], legal: true, guns: true,
            stock: [['knife', 1, 3], ['bat', 1, 3], ['pistol', 1, 4], ['pistol_sil', 0.6, 1], ['revolver', 1, 3], ['shotgun', 1, 2], ['smg', 0.6, 1], ['rifle', 0.5, 1], ['ammo_p'], ['ammo_s'], ['ammo_m'], ['ammo_r'], ['vest', 1, 3], ['vest2', 0.6, 1], ['bag_tac', 0.8, 2], ['bag_duffel', 0.9, 3]] },
        // Boutique (shopping/comércio): roupas, tênis e acessórios que mudam o personagem (player/Outfit.js), bolsas e malas.
        clothes:  { label: 'Boutique', tier: 1.0, hours: [10, 22], clothes: true,
            stock: [...Object.keys(Outfit.ITEMS).filter((id) => Outfit.ITEMS[id].base > 0).map((id) => ['of_' + id]), ['bag_cross'], ['bag_pack'], ['bag_brief'], ['bag_suit'], ['bag_duffel']] },
        bank_branch: { label: 'Agência bancária', tier: 1, hours: [10, 16], stock: [] },
        bank_hq:  { label: 'Sede bancária', tier: 1, hours: [10, 17], stock: [] },
        gym:      { label: 'Academia', tier: 1.0, hours: [5, 23], gym: true, stock: [['gym_day'], ['gym_week'], ['gym_month'], ['whey'], ['protbar'], ['juice'], ['bottle']] },
        drugs:    { label: 'Boca de Fumo', tier: 0.72, hours: [0, 24], guns: true, fence: 0.55,
            stock: [['pistol', 1, 2], ['pistol_sil', 0.9, 2], ['revolver', 0.9, 2], ['shotgun', 0.8, 2], ['smg', 0.7, 1], ['ak47', 0.6, 1], ['rifle', 0.4, 1], ['ammo_p'], ['ammo_s'], ['ammo_m'], ['ammo_r'],
                ['rpg', 1, 1], ['launcher', 1, 1], ['minigun', 1, 1], ['ammo_rpg', 1, 4], ['ammo_rk', 1, 3], ['ammo_belt'], ['grenade', 0.85, 6], ['molotov', 1, 8], ['hack', 0.8, 3], ['carkey', 0.8, 3], ['medkit', 0.8, 2], ['bag_tac', 0.7, 1], ['bag_duffel', 0.8, 2]] },
    },

    // Quais lojas do mapa (id em TileFactory.SHOPS) têm interior, e qual estilo usam.
    KIND_STYLE: { lanchonete: 'burger', conveniencia: 'mart', roupas: 'clothes', farmacia: 'pharmacy', bar: 'bar', padaria: 'bakery', armas: 'guns', pizzaria: 'pizza', saladas: 'fit', italiano: 'italian', japones: 'japanese', bocafumo: 'drugs', academia: 'gym' },

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
        clothes: ['Boutique Vitrine', 'Moda Carioca', 'Shopping Estilo', 'Loja Atitude', 'Street Wear BR', 'Grife do Centro'],
        guns: ['Armas & Cia', 'Armaria Liberty', 'Arsenal Legal', 'Tiro Certo Armas'],
        gym: ['Academia Músculo Forte', 'Smart Fit Liberty', 'Academia do Grandão', 'Iron Gym', 'Academia Corpo em Forma', 'Ferro & Suor'],
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
        if (this._lastHour >= 0 && hour < this._lastHour - 12) { this.day++; this.shops = {}; for (const fn of this.dayHooks) { try { fn(this.day); } catch (e) { console.error('[DIA] gancho falhou:', e); } } if (typeof Laundry !== 'undefined') Laundry.onNewDay(); if (typeof Careers !== 'undefined' && Careers.instance) Careers.instance.onNewDay(); if (typeof Empire !== 'undefined' && Empire.instance) Empire.instance.onNewDay(); if (typeof Banks !== 'undefined') Banks.onNewDay(); }
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
        if (typeof Business !== 'undefined' && Business.isOwned(shop)) out.push({ label: 'Seu negócio', mul: 0.5 });               // dono paga o preço de custo
        if (Outfit.m.price > 0) out.push({ label: 'Bem vestido', mul: 1 - Outfit.m.price });                        // terno, sapato social… (Outfit)
        if (shop.district === 'favela' && Outfit.m.favela > 0) out.push({ label: 'Estilo do morro', mul: 1 - Outfit.m.favela });   // chinelo, camisa de time, corrente
        return out;
    },

    price(shop, id, hour) {
        let p = this.ITEMS[id].base;
        for (const f of this.factors(shop, hour)) p *= f.mul;
        p *= 1 - (typeof SkillTree !== 'undefined' ? (SkillTree.m.price || 0) : 0);      // habilidade Pechincha
        const K = this.ITEMS[id].kind, E = typeof Empire !== 'undefined' && Empire.instance;
        if (E && (K === 'weapon' || K === 'ammo' || K === 'throw')) p *= E.fx('guns') * E.influence.gunPriceMul();      // estação (intervenção) e Fornecedor do Porto
        return Math.max(1, Math.round(p));
    },

    // ------------------------------------------------------------------ estoque
    stockFor(shop) {
        let st = this.shops[shop.id];
        if (st) return st;
        const S = this.STYLES[shop.style], r = Pixel.rng(this._h(shop.id) ^ (this.day * 7919)), items = [];
        for (const [id, chance = 1, max = Infinity] of S.stock) {
            if (S.guns && r() > Math.min(1, chance + (shop.district === 'favela' ? 0 : 0.2))) continue;     // favela: estoque sortido; cidade: quase tudo
            if (!S.guns && !S.gym && r() < 0.12) continue;                                                     // restaurante sem um prato hoje
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
            case 'throw': return inv.slotsNeeded({ kind: 'throw', weapon: it.weapon }) <= inv.slotsFree();
            case 'item': return inv.slotsNeeded({ kind: 'item', id: it.item }) <= inv.slotsFree();
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
        if (it.kind === 'outfit' && Outfit.owned.has(it.outfit)) return Outfit.wear(it.outfit);                 // já é sua: vestir é de graça
        const price = this.price(shop, id, game.dayNight.hour);
        const needClean = shop.district !== 'favela' && price >= Laundry.CLEAN_MIN;          // compra grande no comércio legal: só dinheiro LIMPO
        if ((needClean ? inv.clean : inv.cash) < price) return { ok: false, msg: needClean ? (inv.cash >= price ? 'Compra grande: o comércio legal só aceita dinheiro LIMPO — lave o seu' : 'Dinheiro limpo insuficiente') : 'Dinheiro insuficiente' };
        if (it.kind === 'weapon' && inv.owned(it.weapon)) return { ok: false, msg: 'Você já tem essa arma' };

        if (it.kind === 'ammo' && !it.weapons.some((w) => inv.owned(w))) return { ok: false, msg: 'Você não tem arma para essa munição' };
        if (it.kind === 'vest' && pl.armorMax >= it.max && pl.armor >= pl.armorMax - 0.5) return { ok: false, msg: 'Você já está com esse colete' };
        if (it.kind === 'bag' && Bags.has(inv, it.bag)) return { ok: false, msg: inv.bag === it.bag ? 'Você já está com essa bolsa' : 'Você já tem essa bolsa (de reserva: troque no Inventário → Equipamento)' };
        if (!this._fits(game, it)) return { ok: false, msg: 'Mochila cheia' };
        if (needClean) inv.clean -= price; else inv.cash -= price;
        if (entry.qty !== Infinity) entry.qty--;
        const msg = this.grant(game, id, `(-${brl(price)})`);
        Standing.shopped(shop, price);
        return { ok: true, msg };
    },

    // Dá 1 unidade do item `id` ao jogador (o efeito da compra, sem preço nem estoque) e devolve a mensagem. Usado pela loja e pelo
    // menu de desenvolvedor (aba ITENS, que lista Economy.ITEMS sozinha): item novo com um `kind` daqui funciona nos dois.
    grant(game, id, tail = '') {
        const it = this.ITEMS[id], inv = game.inventory, pl = game.player, t = tail ? ' ' + tail : '';
        let msg = `Comprou: ${it.name}${t}`;
        switch (it.kind) {
            case 'gympass': msg = `${it.name}${t} · treino liberado até ${Physique.addPass(it.days)}`; break;
            case 'meal': {                                                    // come à vontade, até sem fome: o excesso vira gordura (Physique)
                pl.hp = Math.min(pl.maxHp, pl.hp + it.heal);
                if (it.protein) Physique.protein = Math.min(2, (Physique.protein || 0) + it.protein);      // (whey: o próximo treino rende mais)
                const fx = it.icon === 'medkit' ? '' : Physique.eat(it.kcal != null ? it.kcal : it.icon === 'water' ? it.heal * 0.4 : it.heal);
                msg = `${it.name}: +${it.heal} de vida${t} · ${Physique.hungerLabel().toLowerCase()}${fx}`;
                break;
            }
            case 'weapon': inv.addWeapon(it.weapon, it.ammo); break;
            case 'ammo': { const own = it.weapons.filter((w) => inv.owned(w)); for (const w of own) inv.addAmmo(w, it.n); break; }
            case 'throw': inv.addAmmo(it.weapon, it.n); msg += ` · agora ${inv.ammoText(it.weapon)}`; break;
            case 'vest': pl.wearVest(it.max); break;
            case 'bag': msg = Bags.acquire(game, it.bag).msg + t; break;          // a antiga vira reserva
            case 'outfit': Outfit.give(it.outfit); msg = `Comprou e vestiu: ${it.name}${t}`; break;
            case 'item': Items.add(inv, it.item, 1); msg = `Comprou: ${it.name}${t} · ${Items.count(inv, it.item)} na mochila`; break;
            case 'goods': if (it.give === 'food') inv.food++; else if (it.give === 'water') inv.water++; else if (it.give === 'medkit') inv.medkits++; else if (it.give === 'hack') inv.hacks++; else inv.keys++; break;
            default: console.warn(`[Economy.grant] tipo de item sem efeito: ${it.kind} (${id})`); msg = `${it.name}: sem efeito (kind '${it.kind}' não tratado em Economy.grant)`;
        }
        return msg;
    },

    // Quanto a loja paga pelas joias da mochila (null = não compra).
    fenceOffer(shop, game) {
        const S = this.STYLES[shop.style];
        if (!S.fence || game.inventory.jewels <= 0) return null;
        return { count: game.inventory.jewels, value: Math.round(game.inventory.jewelValue * S.fence * (1 + (SkillTree.m.fence || 0) + Outfit.m.fence)) };
    },
    sellJewels(game, shop) {
        const o = this.fenceOffer(shop, game);
        if (!o) return { ok: false, msg: 'Não tem nada que eu queira' };
        game.inventory.jewels = 0; game.inventory.jewelValue = 0; game.inventory.cash += o.value;
        if (shop.district === 'favela') Standing.add('traffic', 3);
        return { ok: true, msg: `Vendeu ${o.count} joias por ${brl(o.value)} (sem perguntas)` };
    },
};

// Roupas e acessórios da boutique (player/Outfit.js) entram no catálogo como itens 'of_<peça>' (kind 'outfit').
for (const [id, o] of Object.entries(Outfit.ITEMS)) {
    if (o.base > 0) Economy.ITEMS['of_' + id] = { name: o.name, icon: 'of_' + id, base: o.base, kind: 'outfit', outfit: id, desc: `${Outfit.SLOT_NAME[o.slot]} · ${o.desc}` };
}
