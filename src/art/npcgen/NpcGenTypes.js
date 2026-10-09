// ============================================================================
// NpcGenTypes — os TIPOS de personagem do jogo (fichas do gerador): que clipes cada um tem, que arma o jogo pede e qual objeto é
// desenhado (o "smg" do BOPE é um fuzil), em que lugares aparece (grupos de roupa) e como VARIAR o visual (paletas).
//
// Variações: cada tipo tem N variantes de cor (a 0 é a ficha original). Muda pele, cabelo, roupa, calçado, boné… dentro do que
// faz sentido (farda não muda de cor). Mesma forma, outra paleta: não custa nada de memória.
// ============================================================================

function NpcGenTypes(G) {
    'use strict';
    const { fullSpec } = G;
    const FALLS = ['flail:none', 'lie:none', 'getup:none', 'tumble:none'];
    const BASE = ['idle:none', 'walk:none', 'run:none', 'walk_up:none', 'climb:none', 'hurt:none', 'dead:none', 'swim:none', 'swim_idle:none', ...FALLS,
        'dive_in:none', 'dive:none', 'dive_out:none',                      // mergulho (banhistas)
        'swim_breast:none', 'wade:none', 'wade_idle:none'];                // nado peito na superfície; vadeando com a água acima da cintura
    // Pilotando (16 direções): moto, bicicleta, jet ski e lancha — civis (trânsito, mototáxi, barcos), o entregador e o jogador.
    const RIDE = ['ride_moto:none', 'ride_bike:none', 'ride_jetski:none', 'ride_boat:none'];
    const CIV0 = [...BASE, 'scared:none', 'surrender:none', 'kneel:none', 'punch:none', 'punchL:none', 'kick:none', 'opendoor:none', 'enter:none'];
    const CIV = [...CIV0, ...RIDE];
    const armed = (w) => [`idle:${w}`, `walk:${w}`, `run:${w}`, `draw:${w}`, `aim:${w}`, `shoot:${w}`];
    const FORCE = (w) => [...BASE, 'vault:none', 'punch:none', 'kick:none', 'opendoor:none', 'enter:none', 'surrender:none', 'kneel:none', ...armed(w)];
    const KNIFE = ['idle:knife', 'walk:knife', 'run:knife', 'stab:knife'];          // faca na mão e a facada
    const GANG = (ws) => [...CIV0, 'vault:none', ...ws.flatMap((w) => [...armed(w), `holdup:${w}`]), ...KNIFE, 'holdup:knife'];
    // Clipes do jogador (Bags.PLAYER_CLIPS + os novos). Os de carregar bolsa na mão saem só quando o jogador tem uma.
    const PLAYER = [
        'idle:none', 'walk:none', 'run:none', 'walk_up:none', 'climb:none',
        ...['pistol', 'smg', 'shotgun', 'bat'].flatMap((w) => [`idle:${w}`, `walk:${w}`, `run:${w}`]),
        ...['pistol', 'smg', 'shotgun'].flatMap((w) => [`draw:${w}`, `aim:${w}`, `shoot:${w}`, `holdup:${w}`]),
        'swing:bat', 'punch:none', 'punchL:none', 'kick:none', 'carjack:none', 'vault:none', 'swim:none', 'swim_idle:none', 'opendoor:none', 'enter:none',
        'pick:none', 'surrender:none', 'kneel:none', 'rummage:none', 'pickpocket:none', 'hurt:none', 'dead:none', ...FALLS, ...RIDE,
        'mount:moto', 'mount:motoL', 'mount:bike', 'mount:bikeL',
    ];
    // Clipes TÁTICOS do jogador (agachado/cobertura e andar agachado, com e sem arma; passo lateral mirando; rolamento de esquiva).
    // Ficam num atlas COMPANHEIRO (protagonista_tatico; nos visuais gerados, "hero:N:t"): o atlas principal em alta definição já
    // ocupa quase todo o espaço endereçável (4096 × 4096) — ver NpcSheet.extraAtlas.
    const GYM = ['gym_curl', 'gym_bench', 'gym_squat'].flatMap((c) => ['w1', 'w2', 'w3'].map((w) => `${c}:${w}`));
    const PLAYER_TAC = [
        ...['none', 'pistol', 'smg', 'shotgun'].flatMap((w) => [`crouch:${w}`, `sneak:${w}`]),
        ...['pistol', 'smg', 'shotgun'].map((w) => `strafe:${w}`), 'roll:none',
        'sitin:L', 'sitin:R', 'sitout:L', 'sitout:R',                    // sentar no carro / sair dele (pela porta da esquerda / da direita)
        ...KNIFE, 'holdup:knife',
        'swim_in:none', 'swim_out:none', 'dive_in:none', 'dive:none', 'dive_out:none',      // começar/parar de nadar, mergulho
        'run_heavy:none', 'idle_heavy:none',                             // o fardo da sobrecarga também correndo e parado (o andar fica no principal)
        'swim_breast:none', 'wade:none', 'wade_idle:none',               // nado peito na superfície; vadeando com a água acima da cintura
        ...GYM,                                                          // academia: rosca direta, supino, agachamento (3 faixas de peso)
        'grenade_pin:none', 'grenade_hold:none', 'grenade_throw:none',   // granada: puxar o pino, mirar, arremessar (Throwables)
        'molotov_light:none', 'molotov_hold:none', 'molotov_throw:none', // molotov: acender, mirar, arremessar
    ];
    const PLAYER_HAND = ['idle_hold:none', 'walk_hold:none', 'run_hold:none', 'idle_hold:pistol', 'walk_hold:pistol', 'run_hold:pistol'];
    const PLAYER_PULL = ['idle_pull:none', 'walk_pull:none'];
    const PLAYER_HEAVY = ['walk_heavy:none'];
    // O que aparece primeiro (o resto do jogador é gerado depois, em segundo plano).
    const PLAYER_FIRST = ['idle:none', 'walk:none', 'run:none'];

    // ------------------------------------------------------------------ variação de cor
    const SKINS = ['pele_clara', 'pele_pessego', 'pele_morena', 'pele_parda', 'pele_negra'];
    const HAIRS = ['preto', 'preto', 'castanho', 'castanho', 'loiro', 'ruivo'];
    const TOPS = ['branco', 'vermelho', 'azul', 'azul_claro', 'verde', 'amarelo', 'laranja', 'cinza', 'rosa', 'roxo', 'vinho', 'turquesa', 'marrom', 'mostarda', 'roupa_preta', 'coral', 'lilas'];
    const DARKTOPS = ['roupa_preta', 'marinho', 'cinza', 'vinho', 'marrom', 'caqui', 'azul'];
    const LIGHTTOPS = ['branco', 'azul_claro', 'rosa', 'lilas', 'bege', 'amarelo'];
    const PANTS = ['jeans', 'jeans_escuro', 'jeans_claro', 'roupa_preta', 'bege', 'cinza', 'caqui', 'marrom'];
    const SHORTS = ['jeans', 'jeans_claro', 'bege', 'roupa_preta', 'azul', 'verde', 'vermelho', 'caqui', 'cinza'];
    const SNEAKERS = ['tenis_branco', 'tenis_preto', 'tenis_vermelho', 'tenis_verde', 'tenis_azul', 'tenis_creme'];
    const FLIPS = ['azul', 'branco', 'amarelo', 'verde', 'vermelho', 'rosa', 'roupa_preta'];
    const HATS = ['vermelho', 'azul', 'roupa_preta', 'branco', 'verde', 'amarelo', 'cinza', 'laranja'];

    // Opções de variação por campo (null = não varia). Cada tipo escolhe as suas.
    const VARY = {
        civil: { skin: SKINS, hair_color: HAIRS, top_color: TOPS, bottom_color: null, shoe_color: null, hat_color: HATS, accent: TOPS, accent2: TOPS },
        social: { skin: SKINS, hair_color: HAIRS, top_color: LIGHTTOPS, bottom_color: DARKTOPS, hat_color: null },
        suit: { skin: SKINS, hair_color: HAIRS, top_color: DARKTOPS, bottom_color: DARKTOPS },
        farda: { skin: SKINS, hair_color: ['preto', 'castanho', 'preto', 'loiro'] },
        gang: { skin: SKINS, hair_color: HAIRS, top_color: TOPS, hat_color: HATS, accent: TOPS, accent2: TOPS },
    };

    // id → { vary, nvar, groups (lugares: casual, biz, poor, beach, sport, tourist), clips, guns: arma do jogo → objeto desenhado }
    const T = (vary, nvar, groups, clips, guns = {}) => ({ vary, nvar, groups, clips, guns });
    const TYPES = {
        civil_trabalhador: T('civil', 10, ['casual', 'poor'], CIV),
        civil_senhor: T('social', 8, ['biz', 'casual', 'tourist'], CIV),
        civil_praia: T('civil', 10, ['beach', 'sport', 'casual'], CIV),
        civil_executiva: T('social', 8, ['biz'], CIV),
        civil_turista: T('civil', 8, ['tourist', 'beach'], CIV),
        civil_estudante: T('civil', 10, ['casual', 'sport'], CIV),
        civil_ambulante: T('civil', 10, ['poor', 'beach', 'casual'], CIV),
        civil_black_power: T('civil', 10, ['casual', 'poor'], CIV),
        civil_entregador: T('civil', 8, ['casual', 'poor'], CIV),
        civil_torcedor: T('civil', 10, ['poor', 'casual', 'beach'], CIV),
        civil_banhista: T('civil', 10, ['beach', 'sport', 'poor'], CIV),
        civil_corredora: T('civil', 10, ['sport', 'beach'], CIV),
        civil_executivo: T('suit', 8, ['biz'], CIV),
        civil_vovo: T('social', 8, ['casual', 'poor'], CIV),
        civil_skatista: T('civil', 10, ['casual', 'sport'], CIV),
        civil_mano: T('civil', 10, ['poor', 'casual'], CIV),
        civil_motoboy: T('farda', 8, ['courier'], CIV),
        // penteados e portes da malha 3D (NpcGenMesh): chanel, tranças, topete, repartido
        civil_chanel: T('civil', 10, ['casual', 'biz', 'tourist'], CIV),
        civil_trancas: T('civil', 10, ['casual', 'poor', 'beach'], CIV),
        civil_topete: T('civil', 10, ['casual', 'sport'], CIV),
        civil_repartido: T('social', 8, ['biz', 'casual'], CIV),
        pm_policial: T('farda', 6, ['police'], [...FORCE('pistol'), 'swing:baton']),
        pm_policial_f: T('farda', 6, ['police'], [...FORCE('pistol'), 'swing:baton']),
        bope_capacete: T('farda', 5, ['swat'], FORCE('smg'), { smg: 'rifle' }),
        bope_touca: T('farda', 5, ['swat'], FORCE('smg'), { smg: 'rifle' }),
        exercito: T('farda', 6, ['army'], FORCE('shotgun'), { shotgun: 'rifle' }),
        trafic_fuzil: T('gang', 8, ['gang3', 'gang2'], GANG(['shotgun', 'smg']), { shotgun: 'rifle_ak', smg: 'rifle_ak' }),
        trafic_pistola: T('gang', 8, ['gang1', 'gang2'], GANG(['pistol', 'smg'])),
        trafic_mascarado: T('gang', 8, ['gang1', 'gang3'], GANG(['pistol', 'shotgun']), { shotgun: 'rifle_ak' }),
        protagonista: T(null, 1, ['player'], [...PLAYER, 'walk_heavy:none']),
        protagonista_tatico: T(null, 1, [], PLAYER_TAC),             // (companheiro do protagonista: nenhum lugar sorteia este tipo)
        // frequentadores da academia (Interiors: só dentro das academias — nenhum lugar da rua sorteia estes tipos)
        academia_m: T('civil', 8, ['gym'], ['idle:none', 'walk:none', ...GYM]),
        academia_f: T('civil', 8, ['gym'], ['idle:none', 'walk:none', ...GYM]),
    };

    // O jogador no começo do jogo (a roupa de sempre do Outfit). Só os campos de FORMA importam para o atlas pronto; as cores vêm
    // da paleta (a roupa muda de cor na hora). Trocar a forma (boné, mochila, regata…) gera o visual de novo (NpcGenWorker).
    const PLAYER_DEFAULT = {
        id: 'protagonista', label: 'Protagonista', group: 'Protagonista', skin: 'pele_pessego', hair: 'spiky', hair_color: 'castanho', eyes: 'angry',
        top: 'jacket', top_color: 'laranja', pattern: null, bottom: 'jeans', bottom_color: 'jeans_escuro', shoes: 'sneaker', shoe_color: 'tenis_branco',
        sole_color: 'tenis_branco', lace_color: 'cadarco', head: null, hat_color: 'roupa_preta', bag: null, body: 'normal', gender: 'm',
    };
    G.BY_ID.protagonista = PLAYER_DEFAULT;
    G.BY_ID.protagonista_tatico = PLAYER_DEFAULT;
    // Campos que mudam o DESENHO (o resto é cor). Dois visuais com a mesma chave usam o mesmo atlas.
    const SHAPE_KEYS = ['hair', 'head', 'top', 'pattern', 'bottom', 'shoes', 'bag', 'body', 'gender', 'beard', 'glasses', 'gloves', 'chain', 'mask', 'scale', 'eyes', 'watch', 'hat_logo', 'zip', 'belt', 'rifle', 'hand', 'dmg'];      // dmg: estado de dano pintado (0..3 — NpcGenMesh.paintDamage)
    const shapeKey = (spec) => { const s = fullSpec(spec); return SHAPE_KEYS.map((k) => k + '=' + (s[k] === undefined || s[k] === null || s[k] === false ? '' : s[k])).join(';'); };

    // Fichas novas de civis (variedade de forma): moram aqui para não misturar com o pacote original.
    const CIVIL = { bag: null, eyes: 'neutral', body: 'normal', group: 'Civis' };
    const MORE = [
        Object.assign({}, CIVIL, { id: 'civil_vovo', label: 'Vovó', gender: 'f', skin: 'pele_clara', hair: 'bun', hair_color: 'grisalho', top: 'social', top_color: 'lilas', accent: 'branco', bottom: 'pants', bottom_color: 'marrom', shoes: 'dress', shoe_color: 'couro_marrom', sole_color: 'sola_escura', glasses: true, body: 'heavy', scale: 0.92 }),
        Object.assign({}, CIVIL, { id: 'civil_skatista', label: 'Skatista', skin: 'pele_morena', hair: 'curly', hair_color: 'castanho', head: 'cap_back', hat_color: 'roupa_preta', top: 'hoodie', top_color: 'cinza', bottom: 'cargo', bottom_color: 'caqui', shoes: 'hightop', shoe_color: 'tenis_preto', sole_color: 'tenis_branco', body: 'slim', scale: 0.98 }),
        Object.assign({}, CIVIL, { id: 'civil_mano', label: 'Mano do bairro', skin: 'pele_negra', hair: 'buzz', hair_color: 'preto', head: 'bucket', hat_color: 'branco', accent: 'roupa_preta', top: 'jersey', top_color: 'amarelo', pattern: 'jersey', accent2: 'verde', chain: true, bottom: 'shorts', bottom_color: 'roupa_preta', shoes: 'hightop', shoe_color: 'tenis_branco', sole_color: 'tenis_branco', body: 'muscular', scale: 1.0 }),
        // Entregador de moto ("iFome"): capacete, jaqueta e o baú vermelho nas costas (Couriers).
        Object.assign({}, CIVIL, { id: 'civil_motoboy', label: 'Motoboy (entregador)', skin: 'pele_parda', hair: 'short', hair_color: 'preto', head: 'helmet', hat_color: 'vermelho', top: 'jacket', top_color: 'vermelho', bottom: 'jeans', bottom_color: 'jeans_escuro', shoes: 'sneaker', shoe_color: 'tenis_preto', sole_color: 'tenis_branco', bag: 'bau', bag_color: 'vermelho', cargo_color: 'branco', strap_color: 'roupa_preta', body: 'normal', gloves: true, scale: 1.0 }),
        // Com os cabelos e portes da malha 3D (sem ela, viram cabelo curto)
        Object.assign({}, CIVIL, { id: 'civil_chanel', label: 'Moça de chanel', gender: 'f', skin: 'pele_clara', hair: 'bob', hair_color: 'preto', top: 'tshirt', top_color: 'rosa', bottom: 'jeans', bottom_color: 'jeans', shoes: 'sneaker', shoe_color: 'tenis_branco', sole_color: 'tenis_branco', bag: 'cross', bag_color: 'marrom', body: 'normal', scale: 0.96 }),
        Object.assign({}, CIVIL, { id: 'civil_trancas', label: 'Moça de tranças', gender: 'f', skin: 'pele_negra', hair: 'braid', hair_color: 'preto', top: 'tshirt', top_color: 'amarelo', bottom: 'shorts', bottom_color: 'jeans', shoes: 'flipflop', shoe_color: 'verde', sole_color: 'amarelo', body: 'heavy', scale: 0.97 }),
        Object.assign({}, CIVIL, { id: 'civil_topete', label: 'Rapaz de topete', skin: 'pele_morena', hair: 'quiff', hair_color: 'castanho', top: 'polo', top_color: 'azul', accent: 'branco', bottom: 'pants', bottom_color: 'bege', shoes: 'sneaker', shoe_color: 'tenis_preto', sole_color: 'tenis_branco', body: 'slim', scale: 0.99 }),
        Object.assign({}, CIVIL, { id: 'civil_repartido', label: 'Senhor de cabelo repartido', skin: 'pele_parda', hair: 'side', hair_color: 'grisalho', top: 'social', top_color: 'branco', accent: 'branco', bottom: 'pants', bottom_color: 'marinho', shoes: 'dress', shoe_color: 'couro_preto', sole_color: 'sola_escura', body: 'heavy', beard: 'mustache', scale: 1.0 }),
    ];
    for (const r of MORE) { if (!G.BY_ID[r.id]) { G.ROSTER.push(r); G.BY_ID[r.id] = r; } }

    // Gerador com semente (mesmo resultado no jogo e na ferramenta).
    function rng(seed) {
        let a = (seed * 2654435761) >>> 0 || 7;
        return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }
    const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

    // Ficha da variante `v` do tipo `id` (v = 0: a original).
    function variantSpec(id, v) {
        const base = fullSpec(G.BY_ID[id] || {}), t = TYPES[id];
        if (!v || !t || !t.vary) return base;
        const opts = VARY[t.vary], r = rng(hash(id) + v * 7919), s = Object.assign({}, base);
        const pick = (arr) => arr[Math.floor(r() * arr.length)];
        for (const [k, arr] of Object.entries(opts)) {
            if (!arr) continue;
            if (k === 'hair_color' && (s.hair === 'bald' || base.hair_color === 'grisalho')) continue;
            if (k === 'hat_color' && !s.head) continue;
            if ((k === 'accent' || k === 'accent2') && !s.pattern && !(k === 'accent' && s.mask === 'bandana') && !(k === 'accent' && s.head === 'bucket')) continue;
            if (k === 'top_color' && s.top === 'tank' && base.top_color.startsWith('pele')) { s.top_color = s.skin; continue; }        // banhista sem camisa
            s[k] = pick(arr);
        }
        if (t.vary === 'civil') {                                                                // calças e calçados conforme o modelo
            s.bottom_color = pick(s.bottom === 'shorts' ? SHORTS : PANTS);
            if (s.shoes === 'sneaker' || s.shoes === 'hightop') s.shoe_color = pick(SNEAKERS);
            else if (s.shoes === 'flipflop') { s.shoe_color = pick(FLIPS); s.sole_color = pick(FLIPS); }
            if (s.top === 'tank' && base.top_color.startsWith('pele')) s.top_color = s.skin;
        }
        if (s.top_color === s.bottom_color && s.top !== 'jacket') s.bottom_color = base.bottom_color;
        return s;
    }

    // Objeto desenhado para a arma que o jogo pede (ex.: "smg" do BOPE = fuzil).
    function weaponFor(id, w) {
        const t = TYPES[id];
        return (t && t.guns[w]) || w;
    }

    // Tipos que servem a um lugar/papel (grupo).
    function typesFor(group) { return Object.keys(TYPES).filter((id) => TYPES[id].groups.includes(group)); }

    Object.assign(G, { TYPES, PLAYER_DEFAULT, SHAPE_KEYS, shapeKey, variantSpec, weaponFor, typesFor, PLAYER_CLIPS: PLAYER, PLAYER_TAC, PLAYER_HAND, PLAYER_PULL, PLAYER_HEAVY, PLAYER_FIRST, hashStr: hash, rngSeed: rng });
    return G;
}
