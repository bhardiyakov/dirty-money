// ============================================================================
// Walls3D — as FACHADAS EM POLÍGONOS, no lugar das texturas pintadas (facade_* / win_* / relief_*: ~3 texturas de 480 px por estilo).
// `?fachadas=2d` volta às texturas.
//
// A PAREDE continua sendo um quad por lado do prédio (WorldBuilder._buildings), mas o material é PINTADO NO SHADER (Wall3DPlugin), sem
// textura nenhuma, a partir de duas coisas:
//   • a UV da parede, que aqui é a GRADE DAS JANELAS: u = baia (inteiro) + posição na baia, v = andar (3 u) + posição no andar, com um
//     deslocamento inteiro por lado do prédio (128·k) — o shader sabe em que baia, andar e prédio está cada pixel;
//   • a cor do vértice: a cor PRÓPRIA de cada prédio (a tinta da casa, o tom do tijolo), sorteada da paleta do estilo.
// O estilo (STYLES, 64 deles) escolhe o MATERIAL da parede (reboco pintado, reboco descascando sobre o tijolo baiano, bloco aparente
// com pilar e viga de concreto, tijolo, concreto de fôrma, pele de vidro, chapa ondulada, tábua, pedra, enxaimel, pastilha, azulejo
// português, granito, taipa), o TIPO DE JANELA (grade, vitrô basculante, folha de madeira, veneziana, escritório, janelão, colonial,
// de correr, em fita, de galpão, cobogó, tábua pregada, a mistura da favela) e o TÉRREO (porta, porta de aço, portaria de vidro,
// garagem, a mistura da favela), mais as cores, o desgaste e a chance de cada peça.
// Cada janela sorteia o que tem — pelo hash INTEIRO (ih: exato no shader e aqui), então o desenho e as peças 3D sempre combinam:
// a folha fechada, a grade, o ar-condicionado, o toldo, a sacada.
//
// AS PEÇAS EM 3D (instâncias, um punhado de modelos): moldura com o vão (a janela fica de fato recuada), peitoril, verga, venezianas,
// ar-condicionado (split com suporte e o de janela), toldo listrado, sacada (laje, guarda-corpo de vidro, grade de ferro ou mureta),
// floreira com flores, brise (aleta vertical ou lâmina horizontal), marquise da porta, caixa da porta de aço, cano de descida.
// NÍVEL DE DETALHE por balde de BUCKET u, como nos telhados: PERTO, tudo; MEIO, só as peças grandes (toldo, ar, sacada, brise, cano);
// LONGE, só as sacadas e os brises (a silhueta do prédio). O desenho do shader (moldura, peitoril, ar, venezianas) fica embaixo da
// peça 3D no mesmo lugar: quando ela some de longe, o desenho segue ali.
// À NOITE: cada janela acende pela hora (WindowLights.state — casa ou escritório), com a luz dela (quente, neutra, fria ou a TV), o
// teto mais claro, cortina, persiana e o vulto dos móveis; a luz vaza na parede em volta; as portarias ficam acesas; a lâmpada da
// porta acende em algumas casas.
//   Walls3D.on          ligado (Config.art.wallPoly; `?fachadas=2d` = as texturas de antes)
//   uv(lot) / colorOf(lot) / add(lot, y)     (WorldBuilder)          build(scene, shadow) → malhas          stats()
// ============================================================================

const Walls3D = {
    get on() {
        if (typeof location !== 'undefined' && /[?&]fachadas=2d\b/.test(location.search)) return false;
        return !!(typeof Config !== 'undefined' && Config.art && Config.art.wallPoly !== false);
    },
    FH: 3,                          // u: o andar
    BUCKET: 24,                     // u: os baldes das peças (a faixa de detalhe é escolhida por balde)
    LOD: { near: 34, mid: 95, far: 240 },     // u: até onde vão todas as peças, as grandes e as sacadas/brises (× lodScale), da câmera à borda do balde
    get lodScale() { const L = typeof Graphics !== 'undefined' ? Graphics.level : 'high'; return L === 'low' ? 0.6 : L === 'medium' ? 0.8 : L === 'hd' ? 1.3 : 1; },
    shade: 1,                       // 1 = o desenho do shader; 0 = só a cor (medir o custo por pixel)
    FAM: { plaster: 1, peel: 2, bloco: 3, brick: 4, concrete: 5, glass: 6, metal: 7, wood: 8, stone: 9, timber: 10, pastilha: 11, azulejo: 12, granite: 13, taipa: 14 },
    WIN: { grade: 1, basc: 2, wood: 3, shut: 4, office: 5, tall: 6, colon: 7, slide: 8, ribbon: 9, shed: 10, cobogo: 11, mix: 12, cross: 13, board: 14 },
    GR: { same: 0, door: 1, shop: 2, lobby: 3, garage: 4, favmix: 5 },
    FRAME: 0.08,                    // u: a largura da moldura (desenhada e em 3D)

    // ------------------------------------------------------------------ os estilos
    // fam/win/gr: material, janela, térreo · bay: a baia (u) · w: a janela [x0, x1] da baia e [y0, y1] do andar · pal: as cores dos
    // prédios (uma por prédio) · trim (moldura, peitoril), glass, acc (veneziana, folha, 2ª cor), mat2 (argamassa, tijolo, viga) ·
    // chances: ac (ar-condicionado), awn (toldo), balc (sacada), flower, grille (grade nas janelas de baixo), pipe (cano), tag (pichação)
    DEF: { fam: 'plaster', win: 'shut', gr: 'door', bay: 3, w: [0.3, 0.7, 0.3, 0.78], pal: ['#d8d0c0'], trim: '#ece8de', glass: '#2c3e50', acc: '#3f6b4a', mat2: '#8a7a68',
        cover: 0.75, half: 0, slab: 0, pil: 0, balc: 0, rail: 'iron', depth: 1.1, awn: 0, ac: 0, acFloor: 1, grille: 0, brise: 0, sill: 1, lintel: 0, flower: 0, pipe: 0.3,
        occ: 'home', wear: 0.4, tag: 0, canopy: 0.4 },
    STYLES: {
        // CENTRO: pele de vidro com brise, concreto em fita, granito
        office0:  { fam: 'glass', win: 'office', gr: 'lobby', bay: 1.5, w: [0.04, 0.96, 0.22, 0.97], pal: ['#2c3946', '#283440'], trim: '#3a4856', glass: '#4f7ea3', occ: 'office', sill: 0, pipe: 0, wear: 0.08, canopy: 0 },
        office1:  { fam: 'glass', win: 'office', gr: 'lobby', bay: 1.5, w: [0.04, 0.96, 0.22, 0.97], pal: ['#1f2933', '#242e38'], trim: '#2c3742', glass: '#35566f', occ: 'office', sill: 0, pipe: 0, wear: 0.08, brise: 2, acc: '#c8ccd0', canopy: 0 },
        office2:  { fam: 'glass', win: 'office', gr: 'lobby', bay: 1.5, w: [0.04, 0.96, 0.22, 0.97], pal: ['#2a3834', '#30403a'], trim: '#34443f', glass: '#4d8a82', occ: 'office', sill: 0, pipe: 0, wear: 0.08, brise: 1, acc: '#d8dad6', canopy: 0 },
        concrete0: { fam: 'concrete', win: 'ribbon', gr: 'lobby', w: [0.03, 0.97, 0.3, 0.78], pal: ['#a9a69d', '#9d9a91', '#b3afa4'], trim: '#8f8c84', glass: '#33414f', ac: 0.18, occ: 'office', wear: 0.55, pipe: 0.2, canopy: 0 },
        concrete1: { fam: 'concrete', win: 'ribbon', gr: 'lobby', w: [0.03, 0.97, 0.3, 0.78], pal: ['#c4bfb2', '#bab5a8', '#cdc8bb'], trim: '#a8a397', glass: '#2d3b4a', ac: 0.12, occ: 'office', wear: 0.45, pipe: 0.2, canopy: 0 },
        granito0: { fam: 'granite', win: 'ribbon', gr: 'lobby', bay: 3, w: [0.04, 0.96, 0.28, 0.82], pal: ['#8a8580', '#5e5a57', '#a39d94'], trim: '#3a3c40', glass: '#2a3a4a', occ: 'office', sill: 0, wear: 0.1, brise: 1, acc: '#2e3034', pipe: 0, canopy: 0 },
        cobogo0:  { fam: 'concrete', win: 'cobogo', gr: 'lobby', bay: 3, w: [0.08, 0.92, 0.1, 0.9], pal: ['#d4cfc2', '#c9c2b2'], trim: '#b8b2a4', glass: '#2d3b4a', wear: 0.4, sill: 0, pipe: 0.2, canopy: 0 },
        hospital: { fam: 'plaster', win: 'ribbon', gr: 'lobby', w: [0.05, 0.95, 0.3, 0.8], pal: ['#e6eaec'], trim: '#cdd5da', glass: '#6fb0c8', occ: 'office', slab: 1, wear: 0.1, pipe: 0, canopy: 0 },
        // CIDADE: tijolo com moldura branca, prédio de reboco (o mais comum do Rio), pastilha, comércio, colonial, casas
        brick0:   { fam: 'brick', win: 'cross', gr: 'door', bay: 1.6, w: [0.22, 0.78, 0.3, 0.82], pal: ['#8e4e3c', '#94533f', '#874a39'], mat2: '#5a352c', trim: '#e6e1d2', slab: 1, lintel: 1, ac: 0.1, pipe: 0.4 },
        brick1:   { fam: 'brick', win: 'cross', gr: 'shop', bay: 1.6, w: [0.22, 0.78, 0.3, 0.82], pal: ['#7f5f4e', '#866450', '#775846'], mat2: '#4d3a30', trim: '#d8d2c0', slab: 1, lintel: 1, ac: 0.12, pipe: 0.4 },
        brick2:   { fam: 'brick', win: 'cross', gr: 'door', bay: 1.6, w: [0.22, 0.78, 0.3, 0.82], pal: ['#aa714d', '#b0774f', '#a36a48'], mat2: '#6b4630', trim: '#f0ead8', slab: 1, lintel: 1, ac: 0.1, flower: 0.15, pipe: 0.4 },
        station:  { fam: 'brick', win: 'cross', gr: 'door', bay: 1.6, w: [0.22, 0.78, 0.3, 0.82], pal: ['#4b5e8f'], mat2: '#27304d', trim: '#e8ebf4', slab: 1, lintel: 1, pipe: 0, canopy: 0.8 },
        reboco0:  { fam: 'plaster', win: 'slide', gr: 'shop', w: [0.22, 0.78, 0.33, 0.75], pal: ['#e3d6bc', '#e0a98c', '#c9c7c0', '#eadb9a', '#b9d6c0', '#d9c6a8'], trim: '#f0ece2', acc: '#6b5a48', ac: 0.35, grille: 0.5, balc: 0.2, rail: 'iron', depth: 0.8, awn: 0.04, pipe: 0.5, wear: 0.55, slab: 1, tag: 0.3 },
        reboco1:  { fam: 'plaster', win: 'slide', gr: 'garage', w: [0.22, 0.78, 0.33, 0.75], pal: ['#f0e4c8', '#d6b49a', '#cfd3cf', '#e8c9a0', '#c4d2dc'], trim: '#faf6ec', acc: '#5a5a5e', ac: 0.3, grille: 0.6, balc: 0.25, rail: 'iron', depth: 0.8, awn: 0.06, pipe: 0.5, wear: 0.45, slab: 1 },
        reboco2:  { fam: 'plaster', win: 'slide', gr: 'shop', w: [0.22, 0.78, 0.33, 0.75], pal: ['#c9b48e', '#b8a88c', '#d2c4a4', '#a9b5a2', '#c7a58c'], trim: '#e2dccd', acc: '#4a4a4c', ac: 0.4, grille: 0.4, balc: 0.15, rail: 'wall', depth: 0.8, awn: 0.08, pipe: 0.6, wear: 0.7, slab: 1, tag: 0.45 },
        reboco3:  { fam: 'plaster', win: 'slide', gr: 'garage', w: [0.2, 0.8, 0.33, 0.75], pal: ['#f2efe6', '#e9e1d0', '#dfe4e6', '#efe0cc'], trim: '#ffffff', acc: '#3c4a58', ac: 0.3, grille: 0.3, balc: 0.35, rail: 'glass', depth: 0.9, pipe: 0.4, wear: 0.3, slab: 1 },
        pastilha0: { fam: 'pastilha', win: 'slide', gr: 'lobby', w: [0.18, 0.82, 0.33, 0.78], pal: ['#8fb3c8', '#9cbccd', '#86a9bf'], acc: '#f2f0ea', trim: '#eceae4', ac: 0.3, balc: 0.3, rail: 'wall', depth: 0.9, wear: 0.3, pipe: 0.3, canopy: 0 },
        pastilha1: { fam: 'pastilha', win: 'slide', gr: 'shop', w: [0.18, 0.82, 0.33, 0.78], pal: ['#c8a46a', '#b8955e', '#d0ad74'], acc: '#6e5038', trim: '#efe6d2', ac: 0.35, balc: 0.25, rail: 'iron', depth: 0.8, wear: 0.4, pipe: 0.4, tag: 0.2 },
        pastilha2: { fam: 'pastilha', win: 'slide', gr: 'lobby', w: [0.18, 0.82, 0.33, 0.78], pal: ['#7fa88a', '#8ab394', '#76a083'], acc: '#f0f0e8', trim: '#e8ece4', ac: 0.3, balc: 0.3, rail: 'glass', depth: 0.9, wear: 0.3, pipe: 0.3, canopy: 0 },
        comercio0: { fam: 'plaster', win: 'slide', gr: 'shop', w: [0.22, 0.78, 0.35, 0.75], pal: ['#e8c34a', '#e07b4c', '#5aa0c8', '#e9e2d0', '#d45a5a', '#7cbf7a'], trim: '#f5f2ea', acc: '#40464c', ac: 0.35, grille: 0.35, awn: 0.3, pipe: 0.5, wear: 0.6, slab: 1, tag: 0.5 },
        comercio1: { fam: 'plaster', win: 'grade', gr: 'shop', w: [0.25, 0.75, 0.35, 0.75], pal: ['#d8cdb4', '#cfb892', '#bdc7cc', '#e4d0b0'], trim: '#ebe5d6', acc: '#3a3d40', ac: 0.4, awn: 0.2, pipe: 0.6, wear: 0.75, slab: 1, tag: 0.6 },
        colonial0: { fam: 'plaster', win: 'colon', gr: 'door', bay: 2.6, w: [0.3, 0.7, 0.14, 0.86], pal: ['#f4f1ea', '#f2e3a8', '#cfe0ea', '#f1d2d0'], trim: '#ffffff', acc: '#2f5fa8', balc: 0.7, rail: 'iron', depth: 0.45, lintel: 1, sill: 0, wear: 0.35, pipe: 0.2, canopy: 0 },
        colonial1: { fam: 'plaster', win: 'colon', gr: 'shop', bay: 2.6, w: [0.3, 0.7, 0.14, 0.86], pal: ['#f2cf4a', '#e8a87c', '#f4f1ea', '#b8d8b0'], trim: '#ffffff', acc: '#3f7a3a', balc: 0.6, rail: 'iron', depth: 0.45, lintel: 1, sill: 0, wear: 0.45, pipe: 0.2, canopy: 0 },
        colonial2: { fam: 'plaster', win: 'colon', gr: 'door', bay: 2.6, w: [0.3, 0.7, 0.14, 0.86], pal: ['#f4f1ea', '#e9dcc4', '#f0e6d8'], trim: '#ffffff', acc: '#a83a32', balc: 0.6, rail: 'iron', depth: 0.45, lintel: 1, sill: 0, wear: 0.4, pipe: 0.2, canopy: 0 },
        azulejo0: { fam: 'azulejo', win: 'colon', gr: 'door', bay: 2.6, w: [0.3, 0.7, 0.14, 0.86], pal: ['#f4f2ec'], mat2: '#2a55a0', trim: '#ffffff', acc: '#2a55a0', balc: 0.6, rail: 'iron', depth: 0.45, lintel: 1, sill: 0, wear: 0.25, pipe: 0.2, canopy: 0 },
        house0:   { fam: 'plaster', win: 'shut', gr: 'door', w: [0.32, 0.68, 0.3, 0.8], pal: ['#e8dcb8', '#efe2c0', '#e2d4ae'], trim: '#fbf8ee', acc: '#3f6b4a', flower: 0.45, wear: 0.3 },
        house1:   { fam: 'plaster', win: 'shut', gr: 'door', w: [0.32, 0.68, 0.3, 0.8], pal: ['#9fb8cc', '#a8c0d2', '#96b0c4'], trim: '#f2f4f6', acc: '#2f4a6b', flower: 0.4, wear: 0.3 },
        house2:   { fam: 'plaster', win: 'shut', gr: 'door', w: [0.32, 0.68, 0.3, 0.8], pal: ['#d9a58b', '#e0ae92', '#d29c82'], trim: '#fff3e6', acc: '#5a3b2e', flower: 0.4, wear: 0.35 },
        house3:   { fam: 'plaster', win: 'shut', gr: 'door', w: [0.32, 0.68, 0.3, 0.8], pal: ['#b4d0ae', '#bcd6b6', '#aac8a4'], trim: '#f6faf0', acc: '#7a3b3b', flower: 0.5, wear: 0.3 },
        modern0:  { fam: 'plaster', win: 'slide', gr: 'garage', bay: 3.5, w: [0.1, 0.9, 0.26, 0.82], pal: ['#f4f4f2', '#ecebe6', '#e6e8ea'], trim: '#3a3c40', acc: '#8a6a48', ac: 0.15, wear: 0.15, sill: 0, brise: 1, pipe: 0, canopy: 0.6 },
        modern1:  { fam: 'plaster', win: 'slide', gr: 'garage', bay: 3.5, w: [0.1, 0.9, 0.26, 0.82], pal: ['#4a4d52', '#56595e', '#3f4246'], trim: '#1e2024', acc: '#9a7650', ac: 0.15, wear: 0.12, sill: 0, brise: 2, pipe: 0, canopy: 0.6 },
        // LAGOA: o residencial de luxo (janelão do piso ao teto e a sacada em todo andar)
        lux0:     { fam: 'plaster', win: 'tall', gr: 'lobby', bay: 3.2, w: [0.07, 0.93, 0.06, 0.94], pal: ['#f2efe8', '#efebe2'], trim: '#5a6670', glass: '#3a5a72', balc: 1, rail: 'glass', depth: 1.2, sill: 0, wear: 0.08, slab: 1, pipe: 0, canopy: 0 },
        lux1:     { fam: 'granite', win: 'tall', gr: 'lobby', bay: 3.2, w: [0.07, 0.93, 0.06, 0.94], pal: ['#cbbfa8', '#c2b59c'], trim: '#4a4c50', glass: '#2f4a5e', balc: 1, rail: 'glass', depth: 1.2, sill: 0, wear: 0.06, pipe: 0, canopy: 0 },
        lux2:     { fam: 'plaster', win: 'tall', gr: 'lobby', bay: 3.2, w: [0.07, 0.93, 0.06, 0.94], pal: ['#d9dcdf', '#d2d6da'], trim: '#5a646e', glass: '#354b5c', balc: 1, rail: 'glass', depth: 1.2, sill: 0, wear: 0.08, slab: 1, pipe: 0, canopy: 0 },
        lux3:     { fam: 'granite', win: 'tall', gr: 'lobby', bay: 3.2, w: [0.07, 0.93, 0.06, 0.94], pal: ['#7d746a', '#867c70'], trim: '#3a3c40', glass: '#2b3d4c', balc: 1, rail: 'iron', depth: 1.2, sill: 0, wear: 0.06, pipe: 0, canopy: 0 },
        // GALPÕES: chapa ondulada (também o celeiro e a madeira do campo)
        metal0:   { fam: 'metal', win: 'shed', gr: 'garage', w: [0.06, 0.94, 0.62, 0.86], pal: ['#8d9aa6', '#84919d', '#96a2ad'], trim: '#4a5560', glass: '#27323d', occ: 'office', sill: 0, wear: 0.5, pipe: 0.2, canopy: 0 },
        metal1:   { fam: 'metal', win: 'shed', gr: 'garage', w: [0.06, 0.94, 0.62, 0.86], pal: ['#b9a98e', '#b0a086', '#c2b296'], trim: '#5a5040', glass: '#27323d', occ: 'office', sill: 0, wear: 0.6, pipe: 0.2, canopy: 0 },
        galpao0:  { fam: 'metal', win: 'shed', gr: 'garage', w: [0.06, 0.94, 0.62, 0.86], pal: ['#6f7a85', '#8a8f94', '#5f6a74', '#7a8a7a'], trim: '#3a4048', glass: '#27323d', occ: 'office', sill: 0, wear: 0.75, pipe: 0.4, tag: 0.4, canopy: 0 },
        barn0:    { fam: 'metal', win: 'wood', gr: 'garage', w: [0.38, 0.62, 0.45, 0.8], pal: ['#9a3a2c', '#a24030', '#8e352a'], trim: '#ece4d4', acc: '#ece4d4', sill: 0, wear: 0.6, pipe: 0, canopy: 0 },
        wood0:    { fam: 'wood', win: 'wood', gr: 'door', w: [0.36, 0.64, 0.38, 0.78], pal: ['#8a6238', '#7e5a34', '#94693e'], trim: '#5a3e22', acc: '#4a6a3a', sill: 1, wear: 0.5, pipe: 0 },
        wood1:    { fam: 'wood', win: 'wood', gr: 'door', w: [0.36, 0.64, 0.38, 0.78], pal: ['#8d8a80', '#85827a', '#96938a'], trim: '#5c5a54', acc: '#6a5a48', sill: 1, wear: 0.6, pipe: 0 },
        // FAVELA: tijolo baiano aparente com pilar e viga, reboco pintado descascando; cada janela de um jeito
        fav0:     { fam: 'bloco', win: 'mix', gr: 'favmix', w: [0.34, 0.66, 0.36, 0.74], pal: ['#c8642e', '#c25e2c', '#cf6d38', '#bd5a2a'], mat2: '#a8927a', pil: 1, ac: 0.12, acFloor: 0, awn: 0.06, balc: 0.1, rail: 'wall', depth: 1.0, grille: 0.5, pipe: 0.25, wear: 0.75, tag: 0.35, canopy: 0.3 },
        fav1:     { fam: 'peel', win: 'mix', gr: 'favmix', w: [0.34, 0.66, 0.36, 0.74], pal: ['#3f8fd2', '#4a98d8', '#3584c6'], mat2: '#c8642e', cover: 0.78, pil: 1, ac: 0.14, acFloor: 0, awn: 0.08, balc: 0.1, rail: 'wall', depth: 1.0, pipe: 0.25, wear: 0.65, tag: 0.3, canopy: 0.3 },
        fav2:     { fam: 'peel', win: 'mix', gr: 'favmix', w: [0.34, 0.66, 0.36, 0.74], pal: ['#5fb35a', '#68bc62', '#56a852'], mat2: '#c8642e', cover: 0.8, half: 1, pil: 1, ac: 0.12, acFloor: 0, awn: 0.06, balc: 0.1, rail: 'wall', depth: 1.0, pipe: 0.25, wear: 0.65, tag: 0.3, canopy: 0.3 },
        fav3:     { fam: 'peel', win: 'mix', gr: 'favmix', w: [0.34, 0.66, 0.36, 0.74], pal: ['#e57aa4', '#ea86ae', '#dc6e9a'], mat2: '#c8642e', cover: 0.82, pil: 1, trim: '#e8e2d8', ac: 0.14, acFloor: 0, awn: 0.1, balc: 0.12, rail: 'iron', depth: 1.0, pipe: 0.25, wear: 0.6, tag: 0.25, canopy: 0.3 },
        fav4:     { fam: 'peel', win: 'mix', gr: 'favmix', w: [0.34, 0.66, 0.36, 0.74], pal: ['#57c2b2', '#62cabb', '#4cb6a6'], mat2: '#c8642e', cover: 0.55, pil: 1, ac: 0.12, acFloor: 0, awn: 0.06, balc: 0.1, rail: 'wall', depth: 1.0, pipe: 0.25, wear: 0.7, tag: 0.3, canopy: 0.3 },
        fav5:     { fam: 'peel', win: 'mix', gr: 'favmix', w: [0.34, 0.66, 0.36, 0.74], pal: ['#e2d3ae', '#e8dab6', '#d8c8a2'], mat2: '#c8642e', cover: 0.85, pil: 1, ac: 0.16, acFloor: 0, awn: 0.06, balc: 0.12, rail: 'wall', depth: 1.0, pipe: 0.25, wear: 0.65, tag: 0.3, canopy: 0.3 },
        fav6:     { fam: 'bloco', win: 'mix', gr: 'favmix', w: [0.34, 0.66, 0.36, 0.74], pal: ['#cf6a32', '#d4733a', '#c4602c'], mat2: '#94806c', pil: 1, ac: 0.1, acFloor: 0, awn: 0.04, balc: 0.08, rail: 'wall', depth: 1.0, grille: 0.5, pipe: 0.25, wear: 0.8, tag: 0.8, canopy: 0.25 },
        fav7:     { fam: 'peel', win: 'mix', gr: 'favmix', w: [0.34, 0.66, 0.36, 0.74], pal: ['#b1aca2', '#bab5ab', '#a8a399'], mat2: '#c8642e', cover: 0.7, pil: 1, ac: 0.12, acFloor: 0, awn: 0.05, balc: 0.1, rail: 'wall', depth: 1.0, pipe: 0.25, wear: 0.75, tag: 0.35, canopy: 0.3 },
        fav8:     { fam: 'peel', win: 'mix', gr: 'favmix', w: [0.34, 0.66, 0.36, 0.74], pal: ['#e88a3c', '#ee9446', '#df8034'], mat2: '#c8642e', cover: 0.75, half: 1, pil: 1, ac: 0.12, acFloor: 0, awn: 0.08, balc: 0.1, rail: 'iron', depth: 1.0, pipe: 0.25, wear: 0.65, tag: 0.3, canopy: 0.3 },
        fav9:     { fam: 'peel', win: 'mix', gr: 'favmix', w: [0.34, 0.66, 0.36, 0.74], pal: ['#9cc0da', '#a6c8e0', '#92b6d0'], mat2: '#c8642e', cover: 0.62, pil: 1, ac: 0.14, acFloor: 0, awn: 0.06, balc: 0.1, rail: 'wall', depth: 1.0, pipe: 0.25, wear: 0.7, tag: 0.7, canopy: 0.3 },
        // MORRO DO MIRANTE: reboco de cor viva, janela de madeira ou veneziana
        vid0:     { fam: 'plaster', win: 'shut', gr: 'door', w: [0.33, 0.67, 0.34, 0.78], pal: ['#e98ab0', '#ee94b8', '#e280a8'], trim: '#fff2f6', acc: '#3a6fb0', awn: 0.12, ac: 0.08, flower: 0.25, balc: 0.1, rail: 'iron', depth: 0.9, wear: 0.45, tag: 0.15 },
        vid1:     { fam: 'plaster', win: 'wood', gr: 'door', w: [0.33, 0.67, 0.34, 0.78], pal: ['#f2cf4a', '#f6d65a', '#eac442'], trim: '#fffbe8', acc: '#2f8a5a', awn: 0.12, ac: 0.08, flower: 0.25, balc: 0.1, rail: 'wall', depth: 0.9, wear: 0.45, tag: 0.15 },
        vid2:     { fam: 'plaster', win: 'shut', gr: 'door', w: [0.33, 0.67, 0.34, 0.78], pal: ['#4cc3c0', '#56cbc8', '#42b8b5'], trim: '#effcfb', acc: '#d9573a', awn: 0.12, ac: 0.08, flower: 0.25, balc: 0.1, rail: 'iron', depth: 0.9, wear: 0.45, tag: 0.15 },
        vid3:     { fam: 'plaster', win: 'wood', gr: 'door', w: [0.33, 0.67, 0.34, 0.78], pal: ['#f08a3c', '#f49446', '#e88034'], trim: '#fff1e2', acc: '#3a4f8a', awn: 0.12, ac: 0.08, flower: 0.25, balc: 0.1, rail: 'wall', depth: 0.9, wear: 0.45, tag: 0.15 },
        vid4:     { fam: 'plaster', win: 'shut', gr: 'door', w: [0.33, 0.67, 0.34, 0.78], pal: ['#a98ad8', '#b294de', '#a080d0'], trim: '#f6f0ff', acc: '#e8c22c', awn: 0.12, ac: 0.08, flower: 0.25, balc: 0.1, rail: 'iron', depth: 0.9, wear: 0.45, tag: 0.15 },
        vid5:     { fam: 'plaster', win: 'wood', gr: 'door', w: [0.33, 0.67, 0.34, 0.78], pal: ['#7fc46a', '#88cc72', '#76ba62'], trim: '#f2fbee', acc: '#b0453a', awn: 0.12, ac: 0.08, flower: 0.25, balc: 0.1, rail: 'wall', depth: 0.9, wear: 0.45, tag: 0.15 },
        // ROÇA E SERRA: casa caiada com o tijolo aparecendo, taipa, chalé enxaimel, casarão de pedra
        caipira0: { fam: 'peel', win: 'wood', gr: 'door', w: [0.34, 0.66, 0.34, 0.78], pal: ['#efe9dc', '#f2ede2', '#e8e0d0'], mat2: '#c0603a', cover: 0.84, acc: '#2f5fa8', trim: '#2f5fa8', sill: 0, wear: 0.55, pipe: 0, canopy: 0 },
        caipira1: { fam: 'peel', win: 'wood', gr: 'door', w: [0.34, 0.66, 0.34, 0.78], pal: ['#f1e1b8', '#f4e6c2', '#eadaae'], mat2: '#c0603a', cover: 0.8, acc: '#3f7a3a', trim: '#3f7a3a', sill: 0, wear: 0.55, pipe: 0, canopy: 0 },
        taipa0:   { fam: 'taipa', win: 'wood', gr: 'door', w: [0.36, 0.64, 0.36, 0.76], pal: ['#c99466', '#c08b5e', '#d09c6e'], mat2: '#5a3e26', acc: '#6a4026', trim: '#6a4026', sill: 0, wear: 0.6, pipe: 0, canopy: 0 },
        chalet0:  { fam: 'timber', win: 'shut', gr: 'door', w: [0.3, 0.7, 0.32, 0.8], pal: ['#f1ebdd', '#ede6d6'], mat2: '#4a3020', trim: '#4a3020', acc: '#4a3020', flower: 0.65, wear: 0.2, pipe: 0, canopy: 0 },
        chalet1:  { fam: 'timber', win: 'shut', gr: 'door', w: [0.3, 0.7, 0.32, 0.8], pal: ['#e9dcc0', '#e4d6b8'], mat2: '#5a2f22', trim: '#5a2f22', acc: '#5a2f22', flower: 0.65, wear: 0.2, pipe: 0, canopy: 0 },
        stone0:   { fam: 'stone', win: 'cross', gr: 'door', bay: 3.2, w: [0.2, 0.8, 0.28, 0.82], pal: ['#9a9286', '#a49c90'], mat2: '#5e5850', trim: '#f2efe6', glass: '#30465c', lintel: 1, wear: 0.3, pipe: 0, flower: 0.2, canopy: 0 },
        stone1:   { fam: 'stone', win: 'cross', gr: 'door', bay: 3.2, w: [0.2, 0.8, 0.28, 0.82], pal: ['#b4a48a', '#bcac92'], mat2: '#6e624f', trim: '#fbf8f0', glass: '#2c4258', lintel: 1, wear: 0.3, pipe: 0, flower: 0.2, canopy: 0 },
    },
    // os estilos novos para o desenho antigo (`?fachadas=2d`): o pintor mais parecido (TileFactory.facadeStyles)
    OLD: {
        granito0: { kind: 'resid', wall: '#8a8580', glass: '#2a3a4a', rail: '#b9c4c8', slab: '#9a958e' },
        cobogo0: { kind: 'concrete', wall: '#d4cfc2', glass: '#2d3b4a' },
        reboco0: { kind: 'house', wall: '#e3d6bc', trim: '#f0ece2', shutter: '#6b5a48' }, reboco1: { kind: 'house', wall: '#f0e4c8', trim: '#faf6ec', shutter: '#5a5a5e' },
        reboco2: { kind: 'house', wall: '#c9b48e', trim: '#e2dccd', shutter: '#4a4a4c' }, reboco3: { kind: 'house', wall: '#f2efe6', trim: '#ffffff', shutter: '#3c4a58' },
        pastilha0: { kind: 'concrete', wall: '#8fb3c8', glass: '#2d3b4a' }, pastilha1: { kind: 'concrete', wall: '#c8a46a', glass: '#2d3b4a' }, pastilha2: { kind: 'concrete', wall: '#7fa88a', glass: '#2d3b4a' },
        comercio0: { kind: 'house', wall: '#e8c34a', trim: '#f5f2ea', shutter: '#40464c' }, comercio1: { kind: 'house', wall: '#d8cdb4', trim: '#ebe5d6', shutter: '#3a3d40' },
        colonial0: { kind: 'house', wall: '#f4f1ea', trim: '#ffffff', shutter: '#2f5fa8' }, colonial1: { kind: 'house', wall: '#f2cf4a', trim: '#ffffff', shutter: '#3f7a3a' },
        colonial2: { kind: 'house', wall: '#f4f1ea', trim: '#ffffff', shutter: '#a83a32' }, azulejo0: { kind: 'house', wall: '#dfe6f0', trim: '#ffffff', shutter: '#2a55a0' },
        modern0: { kind: 'house', wall: '#f4f4f2', trim: '#3a3c40', shutter: '#8a6a48' }, modern1: { kind: 'house', wall: '#4a4d52', trim: '#1e2024', shutter: '#9a7650' },
        galpao0: { kind: 'metal', a: '#6f7a85', b: '#5f6a74', hi: '#8a96a0' },
    },

    // as chaves de compilação de um estilo (o que o shader dele inclui)
    FLAGS0: { W3WG: false, W3WB: false, W3WW: false, W3WS: false, W3WO: false, W3WT: false, W3WC: false, W3WL: false, W3WR: false, W3WH: false, W3WK: false, W3WX: false, W3WD: false,
        W3MIX: false, W3D1: false, W3D2: false, W3D3: false, W3D4: false, W3D5: false, W3PIL: false, W3TAG: false, W3AC: false, W3SILL: false, W3LINT: false, W3OFF: false },
    flags(st) {
        const W = st.winId === 12 ? [1, 2, 3, 8, 14] : [st.winId], N = { 1: 'W3WG', 2: 'W3WB', 3: 'W3WW', 4: 'W3WS', 5: 'W3WO', 6: 'W3WT', 7: 'W3WC', 8: 'W3WL', 9: 'W3WR', 10: 'W3WH', 11: 'W3WK', 13: 'W3WX', 14: 'W3WD' };
        const D = { 0: [], 1: [1], 2: [2], 3: [4], 4: [5, 1], 5: [1, 3, 2] }[st.grId] || [], F = {};
        for (const w of W) F[N[w]] = true;
        for (const k of D) F['W3D' + k] = true;
        F.W3MIX = st.winId === 12; F.W3PIL = !!st.pil && (st.famId === 2 || st.famId === 3); F.W3TAG = st.tag > 0; F.W3AC = st.ac > 0;
        F.W3SILL = !!st.sill; F.W3LINT = !!st.lintel; F.W3OFF = st.occ === 'office';
        return F;
    },
    style(key) {
        const C = this._sc || (this._sc = {});
        if (C[key]) return C[key];
        const s = Object.assign({}, this.DEF, this.STYLES[key] || this.STYLES.concrete0);
        const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
        s.key = key; s.famId = this.FAM[s.fam]; s.winId = this.WIN[s.win]; s.grId = this.GR[s.gr];
        s.palRGB = s.pal.map(rgb); s.trimRGB = rgb(s.trim); s.glassRGB = rgb(s.glass); s.accRGB = rgb(s.acc); s.mat2RGB = rgb(s.mat2);
        return (C[key] = s);
    },
    // HASH INTEIRO (0..1): a mesma conta, exata, no shader (w3i) — quem decide a folha, a grade, o ar, o toldo de cada janela
    ih(a, b, c) { return ((a * 37 + b * 101 + c * 59 + a * b * 13 + a * a * 7 + c * b * 3) % 97) / 97; },
    _hf(x, z, s) { let h = (Math.round(x * 8) * 73856093) ^ (Math.round(z * 8) * 19349663) ^ (s * 83492791); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; },

    // ------------------------------------------------------------------ a parede (WorldBuilder)
    // Os 4 lados do lote como MeshBatch.walls os monta (s = 0 à esquerda de quem olha de fora): a origem, o sentido, a normal, as baias.
    faces(lot) {
        if (lot._w3) return lot._w3;
        const st = this.style(lot.facade), out = {}, { x0, z0, x1, z1 } = lot;
        const D = { n: [x1, z1, -1, 0, 0, 1, x1 - x0], s: [x0, z0, 1, 0, 0, -1, x1 - x0], e: [x1, z0, 0, 1, 1, 0, z1 - z0], w: [x0, z1, 0, -1, -1, 0, z1 - z0] };
        let f = 0;
        for (const key of ['n', 's', 'e', 'w']) {
            const [ox, oz, tx, tz, nx, nz, L] = D[key], n = Math.max(1, Math.round(L / st.bay));
            out[key] = { key, ox, oz, tx, tz, nx, nz, L, n, bw: L / n, k: 1 + Math.floor(this._hf(x0 + f * 0.37, z0, 77 + f) * 30) };
            f++;
        }
        return (lot._w3 = out);
    },
    uv(lot) { const F = this.faces(lot); return (s, y, f) => [s / F[f].bw + 128 * F[f].k, y / this.FH]; },
    colorOf(lot) {
        const st = this.style(lot.facade), P = st.palRGB, h = this._hf(lot.x0, lot.z0, 5), h2 = this._hf(lot.z0, lot.x0, 9);
        const c = P[Math.floor(h * P.length) % P.length], v = 0.94 + 0.12 * h2, w = (this._hf(lot.x1, lot.z1, 3) - 0.5) * 0.05;
        return [Math.min(1, c[0] * v * (1 + w)), Math.min(1, c[1] * v), Math.min(1, c[2] * v * (1 - w))];
    },
    reset() { this._list = []; this._built = null; },
    add(lot, y) { (this._list || (this._list = [])).push({ lot, y }); },

    // O lugar da janela (i, j) do lado F — o MESMO cálculo do shader (térreo, tipo da janela na mistura, a folha, o ar…).
    // → { R: [x0, x1, y0, y1] (frações da baia e do andar), door (0 janela, 1 porta, 2 porta de aço, 3 portão, 4 portaria, 5 garagem), wk (tipo) }
    cell(st, i, j, k) {
        const B = st.bay, ih = this.ih, h1 = ih(i, j, k), dr = [0.5 - 0.5 / B, 0.5 + 0.5 / B, 0, 0.73];
        let R = st.w, door = 0, wk = st.winId;
        if (j === 0) {
            const g = st.grId;
            if (g === 1) { if (h1 < 0.42) { door = 1; R = dr; } }
            else if (g === 2) { door = 2; R = [0.06, 0.94, 0, 0.8]; }
            else if (g === 3) { door = 4; R = [0.04, 0.96, 0, 0.86]; }
            else if (g === 4) { if (h1 < 0.5) { door = 5; R = [0.1, 0.9, 0, 0.76]; } else if (h1 < 0.72) { door = 1; R = dr; } }
            else if (g === 5) { if (h1 < 0.3) { door = 1; R = dr; } else if (h1 < 0.42) { door = 3; R = [0.15, 0.85, 0, 0.72]; } else if (h1 < 0.52) { door = 2; R = [0.1, 0.9, 0, 0.75]; } }
        }
        if (wk === 12) { const hk = ih(i + 5, j + 13, k + 1); wk = hk < 0.28 ? 1 : hk < 0.46 ? 2 : hk < 0.62 ? 3 : hk < 0.78 ? 8 : hk < 0.86 ? 14 : 1; }
        return { R, door, wk, h1, h2: ih(i + 17, j + 5, k + 3), hA: ih(i + 29, j + 11, k + 7) };
    },

    // ------------------------------------------------------------------ as peças 3D
    build(scene, shadow) {
        const t0 = performance.now(), B = this.BUCKET, list = this._list || [];
        // quem encosta em quem: o lado colado no vizinho não ganha peça até a altura dele (as casas geminadas da favela)
        const G = new Map(), C = 8, gk = (x, z) => Math.floor(x / C) + ',' + Math.floor(z / C);
        for (const e of list) {
            const l = e.lot;
            for (let x = Math.floor(l.x0 / C); x <= Math.floor(l.x1 / C); x++) for (let z = Math.floor(l.z0 / C); z <= Math.floor(l.z1 / C); z++) { const key = x + ',' + z; (G.get(key) || G.set(key, []).get(key)).push(e); }
        }
        const topAt = (x, z, self) => { let t = -1e9; for (const e of G.get(gk(x, z)) || []) { const l = e.lot; if (e !== self && x > l.x0 && x < l.x1 && z > l.z0 && z < l.z1) t = Math.max(t, e.y + l.height); } return t; };
        const buckets = new Map(), lamps = this.lamps = [];
        let faces = 0, wins = 0;
        for (const e of list) {
            const l = e.lot, st = this.style(l.facade), F = this.faces(l), floors = Math.max(1, Math.round(l.height / this.FH));
            for (const key of ['n', 's', 'e', 'w']) {
                const f = F[key], hid = new Uint8Array(f.n);
                for (let i = 0; i < f.n; i++) {
                    const s = (i + 0.5) * f.bw, px = f.ox + f.tx * s + f.nx * 0.35, pz = f.oz + f.tz * s + f.nz * 0.35, t = topAt(px, pz, e);
                    hid[i] = t <= e.y ? 0 : Math.min(255, Math.floor((t - e.y + 0.4) / this.FH));
                }
                // a FRENTE DE LOJA em polígonos (render/Shops3D.js) cobre o térreo: as baias embaixo dela ficam sem peça e sem lâmpada
                if (l.shops && l.shops.length && typeof Shops3D !== 'undefined' && Shops3D.on) for (const sh of l.shops) {
                    if (sh.side.toLowerCase() !== key) continue;
                    const s0 = key === 's' ? sh.a - l.x0 : key === 'n' ? l.x1 - sh.a - 6 : key === 'e' ? sh.a - l.z0 : l.z1 - sh.a - 6;
                    for (let i = 0; i < f.n; i++) if ((i + 1) * f.bw > s0 + 0.05 && i * f.bw < s0 + 5.95) hid[i] = Math.max(hid[i], 1);
                }
                if (hid.every((h) => h >= floors)) continue;
                // as luzes do térreo no chão (NightLights): a lâmpada da porta (a mesma do shader) e a portaria acesa
                for (let i = 0; i < f.n; i++) {
                    if (hid[i] >= 1) continue;
                    const c = this.cell(st, i, 0, f.k), s = (i + (c.R[0] + c.R[1]) / 2) * f.bw;
                    if (c.door === 1 && c.h2 < 0.65) lamps.push({ x: f.ox + f.tx * s + f.nx * 1.2, z: f.oz + f.tz * s + f.nz * 1.2, ax: f.tx, az: f.tz, ra: 2.4, rb: 1.9, c: [1.0, 0.74, 0.42], k: 0.6 });
                    else if (c.door === 4) lamps.push({ x: f.ox + f.tx * s + f.nx * 2.0, z: f.oz + f.tz * s + f.nz * 2.0, ax: f.tx, az: f.tz, ra: f.bw * 0.5 + 0.8, rb: 2.4, c: [1.0, 0.9, 0.76], k: 0.45 });
                }
                const cx = f.ox + f.tx * f.L / 2, cz = f.oz + f.tz * f.L / 2, bk = Math.floor(cx / B) + ',' + Math.floor(cz / B);
                let b = buckets.get(bk);
                if (!b) buckets.set(bk, b = { key: bk, cx: (Math.floor(cx / B) + 0.5) * B, cz: (Math.floor(cz / B) + 0.5) * B, y0: Infinity, y1: -Infinity, faces: [], band: -1, cache: [null, null, null] });
                b.faces.push(Object.assign({ st, yb: e.y, floors, hid, H: l.height }, f));
                b.y0 = Math.min(b.y0, e.y); b.y1 = Math.max(b.y1, e.y + l.height + 1.5);
                faces++; wins += f.n * floors;
            }
        }
        const meshes = {}, out = [], mat = this._bitsMat(scene);
        for (const kind of Object.keys(this.MODEL)) {
            const m = this._mesh(scene, 'walls3d_' + kind, this._gpu(scene, kind), mat, 256);
            meshes[kind] = m; out.push(m);
            if (shadow && this.CASTS.includes(kind)) shadow.addShadowCaster(m);
        }
        this._built = { buckets: [...buckets.values()], meshes, scene, last: null, t: 0, lru: [] };
        this._st = { faces, windows: wins, ms: 0 };
        this._list = [];
        scene.onBeforeRenderObservable.add(() => { this._tick(scene); this._warm(scene); });
        this._tick(scene, true);
        this._st.ms = Math.round(performance.now() - t0);
        this._st.lamps = lamps.length;
        console.log(`[FACHADAS] ${faces} lados de prédio com peças em 3D (${wins} janelas, ${lamps.length} luzes de porta e portaria) em ${this._st.ms} ms`);
        return out;
    },
    // PRÉ-COMPILAÇÃO (na tela de carga — Game.preload): cada estilo tem o seu shader (só o que ele usa); os que não estão na vista da
    // largada também são compilados ali, e não na hora em que o bairro novo entra na tela (o engasgo). Uma malha de cada material.
    _warmList(scene) {
        const seen = new Set();
        return scene.meshes.filter((m) => /^world_walls_/.test(m.name) && m.material && m.subMeshes && m.subMeshes.length && !seen.has(m.material) && seen.add(m.material));
    },
    async precompile(scene) {
        const B = this._built, t0 = performance.now(), L = this._warmList(scene);
        let n = 0;
        for (const m of L) {
            const sm = m.subMeshes[0];
            if (sm.effect && sm.effect.isReady()) continue;
            for (let k = 0; k < 400 && !m.material.isReadyForSubMesh(m, sm, false); k++) await new Promise((r) => setTimeout(r, 16));      // (com a compilação paralela da placa: espera ficar pronto)
            n++;
        }
        if (B) B.warmDone = true;
        console.log(`[FACHADAS] ${n} shaders de fachada pré-compilados em ${Math.round(performance.now() - t0)} ms`);
    },
    // (sem a pré-compilação — o jogo aberto por outro caminho: um por vez, a cada ~0,5 s depois da carga)
    _warm(scene) {
        const B = this._built, now = performance.now();
        if (!B || B.warmDone || now < (B.warmT || (B.warmT = now + 4000))) return;
        B.warmT = now + 500;
        if (!B.warmList) B.warmList = this._warmList(scene);
        while (B.warmList.length) {
            const m = B.warmList.shift(), sm = m.subMeshes[0];
            if (sm.effect && sm.effect.isReady()) continue;
            m.material.isReadyForSubMesh(m, sm, false);
            return;
        }
        B.warmDone = true;
    },
    stats() {
        const B = this._built;
        if (!B) return null;
        const o = Object.assign({}, this._st, { inst: 0, tris: 0, draws: 0, near: 0, mid: 0, far: 0, kinds: {} });
        for (const [k, m] of Object.entries(B.meshes)) { const n = m.isVisible ? m.thinInstanceCount : 0; o.kinds[k] = n; o.inst += n; o.tris += n * m.getTotalIndices() / 3; if (n) o.draws++; }
        for (const b of B.buckets) { if (b.band === 0) o.near++; else if (b.band === 1) o.mid++; else if (b.band === 2) o.far++; }
        o.tris = Math.round(o.tris);
        return o;
    },
    // (nenhuma peça projeta sombra em tempo real: o mapa de sombra desenharia de novo as milhares de instâncias — a sombra delas é
    // desenhada no shader da parede: embaixo do peitoril, da verga, do ar)
    CASTS: [],

    _mesh(scene, name, G, material, cap) {
        const m = new BABYLON.Mesh(name, scene);
        for (const [kind, buf, size] of G.vb) m.setVerticesBuffer(buf.createVertexBuffer(kind, 0, size));
        G.ib.references++;
        m.setIndexBuffer(G.ib, G.nV, G.nI);
        m.material = material; m.useVertexColors = true; m.isPickable = false; m.receiveShadows = true;
        this._cap(m, cap);
        m.thinInstanceCount = 0;
        m.isVisible = false;
        // (sem matriz congelada e sempre candidata no RenderCuller: a caixa muda com a câmera — ver Roofs3D._mesh)
        m._cullAlways = true;
        m.doNotSyncBoundingInfo = true;
        return m;
    },
    _cap(m, cap) {
        m._wM = new Float32Array(cap * 16); m._wC = new Float32Array(cap * 4); m._wCap = cap;
        m.thinInstanceSetBuffer('matrix', m._wM, 16, false);
        m.thinInstanceSetBuffer('color', m._wC, 4, false);
    },

    // ------------------------------------------------------------------ nível de detalhe (por balde, ~4 vezes por segundo)
    _tick(scene, force = false) {
        const B = this._built;
        if (!B) return;
        const now = performance.now();
        if (!force && now - B.t < 250) return;
        B.t = now;
        const cam = scene.activeCamera;
        if (!cam) return;
        const P = cam.globalPosition || cam.position;
        // (a faixa longe termina no plano de corte da câmera — no Low ele fica colado na névoa, Config.perf.tightFar: lá a faixa longe ia a
        // 144 m com o corte em ~86 m, peças que a placa processava e o recorte jogava fora)
        const cut = cam.maxZ > 0 ? cam.maxZ + 6 : Infinity;
        if (!force && B.last && Math.hypot(P.x - B.last.x, P.y - B.last.y, P.z - B.last.z) < 2.5 && (cut === B.last.cut || Math.abs(cut - B.last.cut) < 4)) return;
        B.last = { x: P.x, y: P.y, z: P.z, cut };
        const k = this.lodScale, NEAR = this.LOD.near * k, MID = this.LOD.mid * k, FAR = Math.min(this.LOD.far * k, cut), R = this.BUCKET * 0.72;
        let changed = force;
        for (const b of B.buckets) {
            const yc = Math.max(b.y0, Math.min(b.y1, P.y)), d = Math.max(0, Math.hypot(b.cx - P.x, yc - P.y, b.cz - P.z) - R);
            const nb = d < (b.band === 0 ? NEAR * 1.1 : NEAR) ? 0 : d < (b.band === 1 ? MID * 1.1 : MID) ? 1 : d < (b.band === 2 ? FAR * 1.1 : FAR) ? 2 : 3;
            if (nb !== b.band) { b.band = nb; changed = true; }
        }
        if (!changed) return;
        // remonta os buffers: a fatia de cada balde na faixa dele (gerada na primeira vez e guardada — poucas centenas de baldes)
        const kinds = Object.keys(B.meshes), cnt = {}, box = {};
        for (const kd of kinds) { cnt[kd] = 0; box[kd] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; }
        for (const b of B.buckets) {
            if (b.band === 3) continue;                                               // (além da faixa longe: nada — a névoa já cobre)
            let S = b.cache[b.band];
            if (!S) {
                S = b.cache[b.band] = this._gen(b, b.band);
                if (b.band < 2) {                                                     // (as fatias de perto e do meio: só as ~200 mais recentes ficam guardadas)
                    B.lru.push([b, b.band]);
                    for (let t = B.lru.length; B.lru.length > 200 && t > 0; t--) { const [ob, oband] = B.lru.shift(); if (ob.band === oband) B.lru.push([ob, oband]); else ob.cache[oband] = null; }
                }
            }
            for (const kd of kinds) {
                const s = S[kd];
                if (!s || !s.n) continue;
                const m = B.meshes[kd], n0 = cnt[kd];
                if (n0 + s.n > m._wCap) { const oM = m._wM, oC = m._wC; this._cap(m, Math.max(m._wCap * 2, n0 + s.n + 256)); m._wM.set(oM.subarray(0, n0 * 16)); m._wC.set(oC.subarray(0, n0 * 4)); }
                m._wM.set(s.M, n0 * 16); m._wC.set(s.C, n0 * 4);
                cnt[kd] += s.n;
                const X = box[kd], h = this.BUCKET / 2 + 3;
                X[0] = Math.min(X[0], b.cx - h); X[1] = Math.min(X[1], b.y0 - 1); X[2] = Math.min(X[2], b.cz - h);
                X[3] = Math.max(X[3], b.cx + h); X[4] = Math.max(X[4], b.y1 + 1); X[5] = Math.max(X[5], b.cz + h);
            }
        }
        for (const kd of kinds) {
            const m = B.meshes[kd], n = cnt[kd];
            m.thinInstanceCount = n;
            m.isVisible = n > 0;
            if (!n) continue;
            m.thinInstanceBufferUpdated('matrix'); m.thinInstanceBufferUpdated('color');
            const X = box[kd], bi = new BABYLON.BoundingInfo(new BABYLON.Vector3(X[0], X[1], X[2]), new BABYLON.Vector3(X[3], X[4], X[5]));
            m.setBoundingInfo(bi);
            bi.update(m.getWorldMatrix());
        }
    },

    // As peças de um balde na faixa `band` (0 perto: tudo; 1 meio: as grandes; 2 longe: sacadas e brises).
    _gen(b, band) {
        const O = {}, put = (kind, M, c, code) => { const o = O[kind] || (O[kind] = { M: [], C: [] }); o.M.push(...M); o.C.push(c[0], c[1], c[2], code); };
        for (const F of b.faces) this._face(F, band, put);
        const S = {};
        for (const k of Object.keys(O)) S[k] = { M: new Float32Array(O[k].M), C: new Float32Array(O[k].C), n: O[k].C.length / 4 };
        return S;
    },
    // A matriz de uma peça no lado F: x do modelo → ao longo da parede, y → para cima, z → para DENTRO da parede (a peça sai em -z).
    // (s, y): o ponto na parede (u ao longo do lado, altura no mundo); out: afastamento da parede.
    _mx(F, s, y, out, sx, sy, sz) {
        const X = F.ox + F.tx * s + F.nx * out, Z = F.oz + F.tz * s + F.nz * out;
        return [F.tx * sx, 0, F.tz * sx, 0, 0, sy, 0, 0, -F.nx * sz, 0, -F.nz * sz, 0, X, y, Z, 1];
    },
    // de través (perpendicular à parede: o lado da sacada): x do modelo → a normal, z → o sentido da parede
    _mxSide(F, s, y, out, sx, sy, sz) {
        const X = F.ox + F.tx * s + F.nx * out, Z = F.oz + F.tz * s + F.nz * out;
        return [F.nx * sx, 0, F.nz * sx, 0, 0, sy, 0, 0, F.tx * sz, 0, F.tz * sz, 0, X, y, Z, 1];
    },
    AWN: [[0.78, 0.16, 0.14], [0.15, 0.48, 0.25], [0.16, 0.32, 0.62], [0.92, 0.55, 0.12], [0.45, 0.2, 0.42], [0.22, 0.52, 0.6]],
    _face(F, band, put) {
        const st = F.st, FH = this.FH, FR = this.FRAME, ih = this.ih, k = F.k, yb = F.yb, bw = F.bw, scl = bw / st.bay;
        const trim = st.trimRGB, white = [0.92, 0.92, 0.9], steel = [0.55, 0.57, 0.6], concrete = [0.72, 0.7, 0.66];
        // brise: aletas verticais em toda a altura (nas bordas das baias) e lâminas horizontais (uma por andar, o lado inteiro)
        if (st.brise === 2) for (let i = 0; i <= F.n; i++) put('box', this._mx(F, i * bw, yb + F.H / 2, 0, 0.12, F.H, 0.55), st.accRGB, 0);
        if (st.brise === 1) for (let j = 0; j < F.floors; j++) if (j >= (F.hid[0] || 0)) put('box', this._mx(F, F.L / 2, yb + j * FH + st.w[3] * FH + 0.12, 0, F.L, 0.07, 0.7), st.accRGB, 0);
        // sacada em todo andar (luxo): a laje e o guarda-corpo correm o lado inteiro
        const fullBalc = st.balc >= 1, D = st.depth;
        if (fullBalc) for (let j = 1; j < F.floors; j++) {
            const y = yb + j * FH;
            put('box', this._mx(F, F.L / 2, y - 0.08, 0, F.L, 0.16, D), white, 0);
            this._rail(F, F.L / 2, F.L, y, D, st, put);
        }
        if (band === 2) return;
        // cano de descida (um por lado, numa junta de baias)
        if (ih(k, 3, 9) < st.pipe) { const i = Math.floor(ih(k + 2, 7, 1) * (F.n + 1)), s = Math.min(F.L - 0.12, Math.max(0.12, i * bw + 0.12)); put('pipe', this._mx(F, s, yb, 0, 0.1, F.H - 0.15, 0.13), ih(k, 5, 3) < 0.5 ? [0.85, 0.85, 0.83] : [0.36, 0.33, 0.3], 0); }
        for (let j = 0; j < F.floors; j++) for (let i = 0; i < F.n; i++) {
            if (j < F.hid[i]) continue;
            const c = this.cell(st, i, j, k), R = c.R, x0 = (i + R[0]) * bw, x1 = (i + R[1]) * bw, y0 = yb + j * FH + R[2] * FH, y1 = yb + j * FH + R[3] * FH;
            const cx = (x0 + x1) / 2, w = x1 - x0, h = y1 - y0, wk = c.wk;
            if (c.door) {
                // relógio de luz ao lado da porta e o fio subindo (o "gato" chega aqui): favela e casas simples
                if (c.door === 1 && band === 0 && (st.fam === 'peel' || st.fam === 'bloco') && ih(i + 9, 2, k + 4) < 0.7) {
                    const mx = x1 + 0.35 < bw * (i + 1) ? x1 + 0.3 : x0 - 0.3;
                    put('box', this._mx(F, mx, yb + 1.55, 0, 0.26, 0.34, 0.11), [0.62, 0.64, 0.66], 0);
                    put('pipe', this._mx(F, mx + 0.05, yb + 1.72, 0, 0.025, F.H - 1.72 + 0.2, 0.03), [0.07, 0.07, 0.08], 0);
                }
                if (c.door === 2 || c.door === 5) { if (band <= 1) put('box', this._mx(F, cx, y1 + 0.14, 0, w + 0.1, 0.28, 0.24), steel, 0); }      // a caixa da porta de aço
                else if (band === 0) put('frame', this._mx(F, cx, (y0 + y1) / 2 + FR / 2, 0, w + 2 * FR, h + FR, 0.07), c.door === 4 ? [0.3, 0.32, 0.35] : trim, 0);
                if (c.door === 1 && c.h2 < st.canopy && band <= 1) put('box', this._mx(F, cx, y1 + 0.32, 0, w + 0.7, 0.1, 0.75), concrete, 0);          // marquise
                continue;
            }
            const flat = wk === 5 || wk === 6 || wk === 9 || wk === 10;               // (vidro corrido: sem moldura saltada)
            if (band === 0) {
                if (!flat) put('frame', this._mx(F, cx, (y0 + y1) / 2, 0, w + 2 * FR, h + 2 * FR, 0.09), wk === 3 || wk === 7 ? st.accRGB : wk === 8 ? [0.74, 0.75, 0.77] : trim, 0);
                if (st.sill && wk !== 11) put('box', this._mx(F, cx, y0 - FR - 0.035, 0, w + 0.24 * scl + 2 * FR, 0.07, 0.17), trim, 0);
                if (st.lintel) put('box', this._mx(F, cx, y1 + FR + 0.07, 0, w + 0.3 * scl + 2 * FR, 0.14, 0.06), trim, 0);
                if (wk === 4) {                                                       // venezianas: abertas dos lados ou fechadas no vão
                    if (c.h2 < 0.22) for (const sx of [-1, 1]) put('box', this._mx(F, cx + sx * w / 4, (y0 + y1) / 2, -0.02, w / 2 - 0.01, h, 0.04), st.accRGB, 1);
                    else for (const sx of [-1, 1]) put('box', this._mx(F, cx + sx * (w / 2 + FR + w / 4 + 0.01), (y0 + y1) / 2, 0, w / 2, h + 0.04, 0.045), st.accRGB, 1);
                }
                const hF = ih(i + 11, j + 3, k + 17);
                if (hF < st.flower && j >= 0 && (wk === 4 || wk === 13 || wk === 7 || wk === 3)) {
                    const fy = y0 - FR - 0.07 - 0.13;
                    put('box', this._mx(F, cx, fy, 0, w + 0.1, 0.26, 0.24), [0.55, 0.36, 0.22], 5);
                    put('flowers', this._mx(F, cx, fy + 0.13, 0, w + 0.02, 0.3, 0.22), [[0.92, 0.2, 0.32], [0.98, 0.82, 0.2], [0.95, 0.5, 0.7], [1, 1, 1], [0.6, 0.3, 0.85]][Math.floor(ih(i, j + 1, k + 2) * 5)], 7);
                }
            }
            // ar-condicionado: o de janela (na parte de baixo do vão) ou o split num suporte embaixo do peitoril
            if (c.hA < st.ac && j >= st.acFloor && !flat && wk !== 14 && wk !== 11) {
                const acc = [0.88, 0.88, 0.85];
                if (c.hA < st.ac * 0.45) put('acw', this._mx(F, cx, y0 + 0.2, 0, 1, 1, 1), acc, 3);
                else if (y0 - FR - 0.16 - 0.55 > yb + j * FH - 0.05) put('ac', this._mx(F, cx, y0 - FR - 0.16 - 0.275, 0, 1, 1, 1), acc, 3);
            }
            // toldo listrado sobre a janela
            if (ih(i + 3, j + 23, k + 13) < st.awn && !flat) put('awning', this._mx(F, cx, y1 + FR + 0.05, 0, w + 0.35, 1, 1), this.AWN[Math.floor(ih(i + 1, j, k + 5) * this.AWN.length)], 2);
            // sacada desta janela
            if (!fullBalc && j >= 1 && ih(i + 7, j + 31, k + 5) < st.balc) {
                const y = yb + j * FH, bw2 = Math.min(bw - 0.1, w + 1.0);
                put('box', this._mx(F, cx, y - 0.07, 0, bw2, 0.14, D), st.fam === 'peel' || st.fam === 'bloco' || st.rail === 'wall' ? [0.64, 0.62, 0.58] : white, 0);
                this._rail(F, cx, bw2, y, D, st, put);
            }
        }
    },
    // o guarda-corpo da sacada: frente e os dois lados (vidro, grade de ferro ou mureta de alvenaria)
    _rail(F, s, w, y, D, st, put) {
        const kind = st.rail === 'iron' ? 'grid' : 'panel', code = st.rail === 'glass' ? 4 : st.rail === 'iron' ? 6 : 0;
        const col = st.rail === 'glass' ? [0.75, 0.86, 0.9] : st.rail === 'iron' ? [0.16, 0.16, 0.17] : [0.86, 0.84, 0.8];
        const t = st.rail === 'wall' ? 0.12 : 0.035, hh = st.rail === 'wall' ? 0.95 : 1.0;
        put(kind, this._mx(F, s, y + hh / 2, D - t / 2, w, hh, t), col, code);
        for (const sx of [-1, 1]) put(kind, this._mxSide(F, s + sx * (w / 2 - t / 2), y + hh / 2, D / 2, D, hh, t), col, code);
    },

    // ------------------------------------------------------------------ os modelos (uma vez na placa; as instâncias esticam)
    _G() { return { p: [], n: [], c: [], i: [] }; },
    // quad A B C D (em volta) com a normal N; `al` = o alfa de cada canto (< 1: o canto entra `(1 - al)·0,5 u` — a moldura de largura fixa)
    _q(g, A, B, C, D, N, col, al = [1, 1, 1, 1], geo = null) {
        const P = geo || [A, B, C, D], s = g.p.length / 3;
        const u = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], v = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
        const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], flip = -(cr[0] * N[0] + cr[1] * N[1] + cr[2] * N[2]) < 0;
        const L = Math.hypot(N[0], N[1], N[2]) || 1;
        [A, B, C, D].forEach((p, k) => { g.p.push(p[0], p[1], p[2]); g.n.push(N[0] / L, N[1] / L, N[2] / L); g.c.push(col[0], col[1], col[2], al[k]); });
        if (!flip) g.i.push(s, s + 1, s + 2, s, s + 2, s + 3); else g.i.push(s, s + 2, s + 1, s, s + 3, s + 2);
    },
    _tri(g, A, B, C, N, col) {
        const s = g.p.length / 3, u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
        const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], flip = -(cr[0] * N[0] + cr[1] * N[1] + cr[2] * N[2]) < 0;
        for (const p of [A, B, C]) { g.p.push(p[0], p[1], p[2]); g.n.push(N[0], N[1], N[2]); g.c.push(col[0], col[1], col[2], 1); }
        if (!flip) g.i.push(s, s + 1, s + 2); else g.i.push(s, s + 2, s + 1);
    },
    // caixa: faces f (frente, -z), k (fundo, +z), t, b, l, r
    _box(g, x0, y0, z0, x1, y1, z1, col, faces = 'ftblr') {
        const c = (k) => [col[0] * k, col[1] * k, col[2] * k];
        if (faces.includes('f')) this._q(g, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], c(1));
        if (faces.includes('k')) this._q(g, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], c(0.9));
        if (faces.includes('t')) this._q(g, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], c(1.04));
        if (faces.includes('b')) this._q(g, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], c(0.7));
        if (faces.includes('l')) this._q(g, [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [-1, 0, 0], c(0.86));
        if (faces.includes('r')) this._q(g, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], c(0.86));
    },
    MODEL: {
        // moldura com o vão: anel de frente, lados de fora e o REVESTIMENTO do vão (os cantos de dentro entram 8 cm — largura fixa)
        frame(g, W) {
            const a = 0.5, I = 0.5 - 0.16, zf = -1, zb = 0, al = 1 - W.FRAME / 0.5, O4 = [1, 1, 1, 1];
            const f = 1, s = 0.9, r = 0.74;
            // frente (os 4 trapézios): cantos de fora (alfa 1) e de dentro (alfa < 1)
            const fr = (A, B, Bi, Ai) => W._q(g, A, B, Bi, Ai, [0, 0, -1], [f, f, f], [1, 1, al, al], [A, B, [Bi[0] * I / a, Bi[1] * I / a, zf], [Ai[0] * I / a, Ai[1] * I / a, zf]]);
            fr([-a, a, zf], [a, a, zf], [a, a, zf], [-a, a, zf]);
            fr([a, -a, zf], [-a, -a, zf], [-a, -a, zf], [a, -a, zf]);
            fr([-a, -a, zf], [-a, a, zf], [-a, a, zf], [-a, -a, zf]);
            fr([a, a, zf], [a, -a, zf], [a, -a, zf], [a, a, zf]);
            // lados de fora
            W._q(g, [-a, a, zf], [a, a, zf], [a, a, zb], [-a, a, zb], [0, 1, 0], [s * 1.06, s * 1.06, s * 1.06], O4);
            W._q(g, [-a, -a, zf], [a, -a, zf], [a, -a, zb], [-a, -a, zb], [0, -1, 0], [s * 0.7, s * 0.7, s * 0.7], O4);
            W._q(g, [-a, -a, zf], [-a, a, zf], [-a, a, zb], [-a, -a, zb], [-1, 0, 0], [s, s, s], O4);
            W._q(g, [a, -a, zf], [a, a, zf], [a, a, zb], [a, -a, zb], [1, 0, 0], [s, s, s], O4);
            // o vão (de dentro): o de cima olha para baixo, o de baixo para cima (o peitoril de dentro), os lados um para o outro
            const A4 = [al, al, al, al], gi = (p) => [p[0] * I / a, p[1] * I / a, p[2]];
            const rv = (P, N, k) => W._q(g, P[0], P[1], P[2], P[3], N, [r * k, r * k, r * k], A4, P.map(gi));
            rv([[-a, a, zf], [a, a, zf], [a, a, zb], [-a, a, zb]], [0, -1, 0], 0.72);
            rv([[-a, -a, zf], [a, -a, zf], [a, -a, zb], [-a, -a, zb]], [0, 1, 0], 1.25);
            rv([[-a, -a, zf], [-a, a, zf], [-a, a, zb], [-a, -a, zb]], [1, 0, 0], 1);
            rv([[a, -a, zf], [a, a, zf], [a, a, zb], [a, -a, zb]], [-1, 0, 0], 1);
        },
        // caixa encostada na parede (peitoril, verga, veneziana, laje da sacada, marquise, brise, floreira…): z de -1 (frente) a 0
        box(g, W) { W._box(g, -0.5, -0.5, -1, 0.5, 0.5, 0, [1, 1, 1], 'ftblr'); },
        // placa solta (guarda-corpo de vidro ou mureta): os dois lados
        panel(g, W) { W._box(g, -0.5, -0.5, -0.5, 0.5, 0.5, 0.5, [1, 1, 1], 'fktlr'); },
        // grade de ferro (o shader recorta as barras)
        grid(g, W) { W._box(g, -0.5, -0.5, -0.5, 0.5, 0.5, 0.5, [1, 1, 1], 'fktlr'); },
        // split: o corpo num suporte de cantoneira, a grelha e a hélice na frente (o shader desenha)
        ac(g, W) {
            W._box(g, -0.4, -0.275, -0.38, 0.4, 0.275, -0.06, [1, 1, 1], 'ftblr');
            for (const x of [-0.3, 0.3]) { W._box(g, x - 0.018, -0.31, -0.42, x + 0.018, -0.275, 0, [0.4, 0.4, 0.42], 'ftblr'); W._box(g, x - 0.018, -0.31, -0.06, x + 0.018, 0.15, 0, [0.4, 0.4, 0.42], 'flr'); }
        },
        // ar de janela: a caixa saindo do vão
        acw(g, W) { W._box(g, -0.3, -0.2, -0.3, 0.3, 0.2, 0.02, [1, 1, 1], 'ftblr'); },
        // toldo: a água inclinada (40 cm para fora), a sanefa na frente e as orelhas dos lados
        awning(g, W) {
            const T0 = [-0.5, 0, 0], T1 = [0.5, 0, 0], F0 = [-0.5, -0.42, -0.62], F1 = [0.5, -0.42, -0.62], V0 = [-0.5, -0.56, -0.62], V1 = [0.5, -0.56, -0.62];
            const n = [0, 0.62, -0.42];
            W._q(g, T0, T1, F1, F0, n, [1, 1, 1]);
            W._q(g, T0, T1, F1, F0, [0, -0.62, 0.42], [0.62, 0.62, 0.62]);
            W._q(g, F0, F1, V1, V0, [0, 0, -1], [0.95, 0.95, 0.95]);
            W._q(g, F0, F1, V1, V0, [0, 0, 1], [0.6, 0.6, 0.6]);
            for (const x of [-0.5, 0.5]) for (const s of [-1, 1]) W._tri(g, [x, 0, 0], [x, -0.42, -0.62], [x, -0.56, -0.62], [s, 0, 0], [0.85, 0.85, 0.85]);
        },
        // cano de descida: prisma de 6 lados (raio 0,5 → escala 0,1), y de 0 a 1
        pipe(g, W) {
            const N = 6;
            for (let i = 0; i < N; i++) {
                const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2, am = (a0 + a1) / 2;
                const p = (a, y) => [Math.cos(a) * 0.5, y, -0.5 + Math.sin(a) * 0.5];
                W._q(g, p(a0, 0), p(a1, 0), p(a1, 1), p(a0, 1), [Math.cos(am), 0, Math.sin(am)], [1, 1, 1]);
            }
        },
        // flores da floreira: tufos (o shader pinta folha e flor)
        flowers(g, W) {
            for (let k = 0; k < 6; k++) {
                const x = -0.42 + k * 0.168, w = 0.1, top = 0.55 + 0.45 * ((k * 7) % 5) / 4;
                W._box(g, x - w, -0.5, -0.85, x + w, top - 0.5, -0.15, [1, 1, 1], 'ftlr');
            }
        },
    },
    _gpu(scene, kind) {
        const C = this._gpuC || (this._gpuC = {});
        if (C[kind] && C[kind].eng === scene.getEngine()) return C[kind];
        const g = this._G();
        this.MODEL[kind](g, this);
        const eng = scene.getEngine();
        const vb = [['position', new Float32Array(g.p), 3], ['normal', new Float32Array(g.n), 3], ['color', new Float32Array(g.c), 4]].map(([k, d, s]) => [k, new BABYLON.Buffer(eng, d, false, s), s]);
        const nV = g.p.length / 3, I = new Uint16Array(g.i);
        return (C[kind] = { eng, vb, ib: eng.createIndexBuffer(I), nV, nI: I.length });
    },

    // ------------------------------------------------------------------ materiais
    // O ATLAS DAS JANELAS (uma textura de 1024 × 512, 8 × 4 ladrilhos de 128 px, ~2,7 MB com os mipmaps): o DESENHO de cada tipo de vão
    // — grade, basculante, folha de madeira aberta/fechada/meio aberta, veneziana aberta/fechada, escritório, janelão, colonial com o
    // arco (com e sem a folha fechada), de correr (com e sem a grade), fita, galpão, cruz, tábua pregada, porta de madeira, porta de
    // aço, portão, portaria. R = as barras e o caixilho, G = o que cobre o vão (tábuas, veneziana, chapa), B = o sombreado (×2: 0,5 =
    // neutro), A = 0 fora do arco. O shader lê UMA vez no lugar das contas de cada tipo (que o renderizador por software executava
    // todas, em cada pixel de parede). Desenhado na carga, em JS.
    ATLAS: { T: 128, C: 8, R: 4 },
    atlas(scene) {
        if (this._at && this._at.getScene() === scene) return this._at;
        const t0 = performance.now(), { T, C, R } = this.ATLAS, W = T * C, H = T * R, D = new Uint8Array(W * H * 4), px = 1 / T;
        const sm = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
        const line = (x, c, w) => 1 - sm(w * 0.5 - px * 0.7, w * 0.5 + px * 0.7, Math.abs(x - c));
        const per = (x, p, w) => { const f = x / p; return 1 - sm(w * 0.5 - px * 0.7, w * 0.5 + px * 0.7, Math.abs(f - Math.round(f)) * p); };
        const hash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
        const fr = (x) => x - Math.floor(x);
        const planks = (x, w, seed) => { const k = Math.floor(x / w), f = fr(x / w); return (0.82 + 0.25 * hash(k, seed)) * (1 - 0.45 * (1 - sm(0, 0.1, Math.min(f, 1 - f)))); };
        const louver = (v) => 0.74 + 0.3 * sm(0.1, 0.5, fr(v * 28));
        const arch = (u, v, o) => {                                              // a colonial: o arco abatido no alto (fora dele, a moldura)
            const ah = 0.15;
            if (v <= 1 - ah) return;
            const e = Math.hypot((u - 0.5) / 0.5, (v - (1 - ah)) / ah);
            if (e > 1) o.a = 0;
            o.r = Math.max(o.r, 1 - sm(0.02, 0.09, Math.abs(e - 1)));
        };
        const TILES = [
            (u, v, o) => { o.r = Math.max(per(u, 0.1, 0.014), line(v, 0.33, 0.016), line(v, 0.66, 0.016), line(u, 0.5, 0.02)); },                       // 0 grade
            (u, v, o) => { o.r = Math.max(per(u, 1 / 3, 0.018), per(v, 1 / 4, 0.018)); const h = hash(Math.floor(u * 3), Math.floor(v * 4)); o.b = h < 0.3 ? 0.7 : h > 0.85 ? 1.2 : 1; },      // 1 basculante
            (u, v, o) => { o.r = line(u, 0.5, 0.022); },                                                                                                  // 2 madeira aberta
            (u, v, o) => { o.g = 1; o.b = planks(u, 0.1, 3) * (1 - 0.4 * line(u, 0.5, 0.03)); },                                                            // 3 madeira fechada
            (u, v, o) => { o.g = sm(0.49, 0.51, u); o.b = u > 0.5 ? planks(u, 0.1, 4) : 1; o.r = line(u, 0.5, 0.022); },                                  // 4 meio aberta
            (u, v, o) => { o.r = Math.max(line(u, 0.5, 0.018), line(v, 0.62, 0.018)); },                                                                   // 5 veneziana aberta
            (u, v, o) => { o.g = 1; o.b = louver(v) * (1 - 0.3 * line(u, 0.5, 0.03)); },                                                                    // 6 veneziana fechada
            (u, v, o) => { o.r = Math.max(line(v, 0.72, 0.022), line(u, 0.5, 0.018)); },                                                                   // 7 escritório
            (u, v, o) => { o.r = line(u, 0.5, 0.022); },                                                                                                  // 8 janelão
            (u, v, o) => { o.r = Math.max(line(u, 0.5, 0.016), line(v, 0.25, 0.016), line(v, 0.5, 0.016)); arch(u, v, o); },                             // 9 colonial
            (u, v, o) => { o.r = Math.max(line(u, 0.5, 0.016), line(v, 0.25, 0.016), line(v, 0.5, 0.016)); if (u > 0.5 && v < 0.78) { o.g = 1; o.b = louver(v); } arch(u, v, o); },      // 10 colonial meio fechada
            (u, v, o) => { o.r = line(u, 0.51, 0.036); o.b = u > 0.51 ? 0.88 : 1; },                                                                      // 11 de correr
            (u, v, o) => { o.r = Math.max(line(u, 0.51, 0.036), per(u, 0.11, 0.014), per(v, 0.36, 0.014)); o.b = u > 0.51 ? 0.88 : 1; },                 // 12 de correr com grade
            (u, v, o) => { o.r = Math.max(per(u, 1 / 3, 0.01), line(v, 0.7, 0.014)); },                                                                     // 13 em fita
            (u, v, o) => { o.r = per(u, 0.25, 0.012); o.b = 0.92 - 0.14 * Math.max(per(u, 1 / 40, 0.006), per(v, 1 / 12, 0.02)); },                       // 14 galpão (vidro aramado)
            (u, v, o) => { o.r = Math.max(line(u, 0.5, 0.018), line(v, 0.62, 0.018), line(v, 0.31, 0.014)); },                                            // 15 cruz (6 vidraças)
            (u, v, o) => { const k = Math.floor(v / 0.17), f = fr(v / 0.17); o.g = 1; o.b = (0.7 + 0.4 * hash(k, 7)) * (1 - 0.6 * (1 - sm(0, 0.12, Math.min(f, 1 - f)))) * (f > 0.88 ? 0.25 : 1); },      // 16 tábua pregada
            (u, v, o) => {                                                                                                                                  // 17 porta de madeira
                o.g = 1; o.b = planks(u, 0.13, 9);
                const pn = Math.max(line(Math.abs(u - 0.5), 0.32, 0.012), line(v, 0.55, 0.012)) * (v > 0.08 && v < 0.92 && Math.abs(u - 0.5) < 0.33 ? 1 : 0);
                o.b *= 1 - 0.25 * pn;
                if (Math.hypot((u - 0.82) / 0.03, (v - 0.47) / 0.014) < 1) o.b = 1.7;
                o.b *= 1 - 0.3 * (1 - sm(0, 0.08, 1 - v));
            },
            (u, v, o) => { const r = fr(v * 29); o.g = 1; o.b = (0.76 + 0.3 * sm(0, 0.25, r) * (1 - sm(0.75, 1, r))) * (v < 0.03 ? 0.6 : 1) * (1 - 0.3 * (1 - sm(0, 0.1, 1 - v))); },      // 18 porta de aço
            (u, v, o) => { o.g = 1; o.b = v > 0.78 ? 1 : 0.12; o.r = v < 0.78 ? Math.max(per(u, 1 / 14, 0.014), line(v, 0.78, 0.02)) : 0; },             // 19 portão
            (u, v, o) => { o.r = Math.max(per(u, 1 / 3, 0.012), line(v, 0.82, 0.014)); },                                                                  // 20 portaria
            () => {},                                                                                                                                       // 21 vazio (cobogó: o shader desenha)
        ];
        const o = { r: 0, g: 0, b: 1, a: 1 };
        for (let t = 0; t < C * R; t++) {
            const f = TILES[t] || TILES[21], tx = (t % C) * T, ty = Math.floor(t / C) * T;
            for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
                o.r = 0; o.g = 0; o.b = 1; o.a = 1;
                f((x + 0.5) / T, (y + 0.5) / T, o);
                const k = ((ty + y) * W + tx + x) * 4;
                D[k] = o.r * 255; D[k + 1] = o.g * 255; D[k + 2] = Math.min(255, o.b * 127.5); D[k + 3] = o.a * 255;
            }
        }
        const tex = new BABYLON.RawTexture(D, W, H, BABYLON.Constants.TEXTUREFORMAT_RGBA, scene, true, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
        tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        tex.name = 'walls3d_atlas';
        this._atMs = Math.round(performance.now() - t0);
        return (this._at = tex);
    },
    // A parede de um estilo: StandardMaterial sem textura + o Wall3DPlugin com os números do estilo.
    material(scene, key) {
        this.atlas(scene);
        const st = this.style(key), m = new BABYLON.StandardMaterial('facade_' + key, scene);
        m.specularColor = new BABYLON.Color3(0, 0, 0);
        if (!this._cls) this._cls = this._plugin();
        const P = new Float32Array(36);
        P.set([st.famId, st.winId, st.grId, st.bay], 0);
        P.set(st.w, 4);
        P.set([...st.trimRGB, st.wear], 8);
        P.set([...st.glassRGB, st.ac], 12);
        P.set([...st.accRGB, st.grille], 16);
        P.set([...st.mat2RGB, st.cover], 20);
        P.set([st.slab, st.pil, st.half, st.occ === 'office' ? 1 : 0], 24);
        P.set([st.sill, st.lintel, st.acFloor, st.tag], 28);
        new this._cls(m, P, st);
        return m;
    },
    _bitsMat(scene) {
        if (this._bm && this._bm.getScene() === scene) return this._bm;
        const m = new BABYLON.StandardMaterial('walls3d_pecas', scene);
        m.specularColor = new BABYLON.Color3(0.06, 0.06, 0.06);
        if (!this._bcls) this._bcls = this._bitsPlugin();
        new this._bcls(m);
        return (this._bm = m);
    },

    _bitsPlugin() {
        return class Wall3DBitsPlugin extends BABYLON.MaterialPluginBase {
            constructor(m) { super(m, 'Wall3DBits', 126, { W3BITS: false }); this._enable(true); }
            getClassName() { return 'Wall3DBitsPlugin'; }
            prepareDefines(d) { d.W3BITS = true; }
            getCustomCode(type) {
                // (sem ponto e vírgula em comentário GLSL: o Babylon corta a linha ali)
                if (type === 'vertex') return {
                    CUSTOM_VERTEX_DEFINITIONS: `
                        #ifdef W3BITS
                        varying vec3 w3L;
                        varying float w3C;
                        #endif`,
                    CUSTOM_VERTEX_UPDATE_POSITION: `
                        #if defined(W3BITS) && defined(VERTEXCOLOR) && defined(INSTANCES)
                        if (color.a < 0.995) {
                            vec2 s3 = max(vec2(length(world0.xyz), length(world1.xyz)), vec2(0.001));
                            positionUpdated.xy -= sign(positionUpdated.xy) * (1.0 - color.a) * 0.5 / s3;
                        }
                        #endif`,
                    CUSTOM_VERTEX_MAIN_END: `
                        #ifdef W3BITS
                        w3C = 0.0;
                        w3L = positionUpdated;
                        #ifdef INSTANCES
                        w3L = positionUpdated * vec3(length(world0.xyz), length(world1.xyz), length(world2.xyz));
                        #endif
                        #ifdef INSTANCESCOLOR
                        w3C = instanceColor.a;
                        vColor.a = 1.0;
                        #endif
                        #endif`,
                };
                if (type === 'fragment') return {
                    CUSTOM_FRAGMENT_DEFINITIONS: `
                        #ifdef W3BITS
                        varying vec3 w3L;
                        varying float w3C;
                        float w3bh(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
                        #endif`,
                    CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
                        #ifdef W3BITS
                        {
                            float code = floor(w3C + 0.5);
                            if (code > 0.5) {
                                if (code < 1.5) {
                                    float s = fract(w3L.y / 0.055);
                                    baseColor.rgb *= 0.74 + 0.3 * smoothstep(0.08, 0.45, s) * (1.0 - smoothstep(0.85, 1.0, s));
                                } else if (code < 2.5) {
                                    float s = step(0.5, fract(w3L.x / 0.5 + 0.25));
                                    baseColor.rgb = mix(baseColor.rgb, vec3(0.93, 0.92, 0.88) * (baseColor.r + baseColor.g + baseColor.b > 0.9 ? 1.0 : 0.62), s);
                                } else if (code < 3.5) {
                                    float fr = smoothstep(-0.3, -0.34, w3L.z);
                                    float sl = 1.0 - 0.35 * step(0.55, fract(w3L.x / 0.028)) * step(abs(w3L.y), 0.2);
                                    float r = length(w3L.xy - vec2(-0.1, 0.0)), fan = step(r, 0.2) * (0.55 + 0.45 * step(0.5, fract(r / 0.03)));
                                    baseColor.rgb *= mix(1.0, mix(sl, 0.45 + 0.4 * fan, step(r, 0.2) * step(w3L.y, 0.22)), fr);
                                } else if (code < 4.5) {
                                    float top = smoothstep(0.44, 0.46, w3L.y);
                                    baseColor.rgb = mix(baseColor.rgb * (0.85 + 0.25 * smoothstep(-0.5, 0.5, w3L.y)), vec3(0.8, 0.82, 0.84), top);
                                } else if (code < 5.5) {
                                    baseColor.rgb *= 0.82 + 0.2 * w3bh(vec2(floor(w3L.x / 0.12), 1.0)) - 0.25 * step(0.93, fract(w3L.x / 0.12));
                                } else if (code < 6.5) {
                                    float bar = step(fract(w3L.x / 0.11), 0.16) + step(0.47, abs(w3L.y)) + step(abs(w3L.y - 0.05), 0.012);
                                    if (bar < 0.5) discard;
                                } else {
                                    vec2 c = floor(w3L.xy * vec2(26.0, 30.0));
                                    float h = w3bh(c + floor(w3L.z * 30.0));
                                    vec3 leaf = vec3(0.22, 0.42, 0.16) * (0.75 + 0.5 * w3bh(c * 1.7));
                                    baseColor.rgb = mix(leaf, baseColor.rgb, step(0.72, h) * step(0.0, w3L.y));
                                }
                            }
                        }
                        #endif`,
                };
                return null;
            }
        };
    },

    _plugin() {
        return class Wall3DPlugin extends BABYLON.MaterialPluginBase {
            // (o shader de cada estilo compila SÓ o que ele usa — o material da parede, os tipos de janela e de porta, os detalhes: um
            // shader único com tudo era executado inteiro em cada pixel no renderizador por software, e pesa nas GPUs de celular)
            constructor(m, P, st) { super(m, 'Wall3D', 124, Object.assign({ WALL3D: false, W3FAM: 0, W3NONIGHT: false, W3NOWIN: false }, Walls3D.FLAGS0)); this.P = P; this.st = st; this._enable(true); }
            getClassName() { return 'Wall3DPlugin'; }
            prepareDefinesBeforeAttributes(d) { d._needUVs = true; }
            getSamplers(s) { s.push('w3At'); }
            prepareDefines(d) {
                d.WALL3D = !Walls3D._lite;
                d.W3FAM = Walls3D._dbgFam || this.st.famId;
                const F = Walls3D.flags(this.st);
                for (const k of Object.keys(Walls3D.FLAGS0)) d[k] = !!F[k] && !(Walls3D._dbgOff && Walls3D._dbgOff.includes(k));
                d.W3NONIGHT = !!(Walls3D._dbgOff && Walls3D._dbgOff.includes('W3NONIGHT'));
                d.W3NOWIN = !!(Walls3D._dbgOff && Walls3D._dbgOff.includes('W3NOWIN'));
            }
            getUniforms() {
                const N = ['wfA', 'wfW', 'wfT', 'wfG', 'wfS', 'wfM', 'wfP', 'wfQ', 'wfK'];
                return { ubo: N.map((name) => ({ name, size: 4, type: 'vec4' })), fragment: N.map((n) => `uniform vec4 ${n};`).join('\n') };
            }
            bindForSubMesh(ub) {
                const P = this.P, s = WindowLights.state;
                ub.updateFloat4('wfA', P[0], P[1], P[2], P[3]); ub.updateFloat4('wfW', P[4], P[5], P[6], P[7]);
                ub.updateFloat4('wfT', P[8], P[9], P[10], P[11]); ub.updateFloat4('wfG', P[12], P[13], P[14], P[15]);
                ub.updateFloat4('wfS', P[16], P[17], P[18], P[19]); ub.updateFloat4('wfM', P[20], P[21], P[22], P[23]);
                ub.updateFloat4('wfP', P[24], P[25], P[26], P[27]); ub.updateFloat4('wfQ', P[28], P[29], P[30], P[31]);
                ub.updateFloat4('wfK', s[0], s[1], s[2], s[3] + 10 * Walls3D.shade);
                ub.setTexture('w3At', Walls3D._at);
            }
            getCustomCode(type) {
                if (type === 'vertex') return {
                    CUSTOM_VERTEX_DEFINITIONS: `
                        #ifdef WALL3D
                        varying vec2 wlUV;
                        #endif`,
                    CUSTOM_VERTEX_MAIN_END: `
                        #ifdef WALL3D
                        #ifdef UV1
                        wlUV = uv;
                        #else
                        wlUV = vec2(0.0);
                        #endif
                        #endif`,
                };
                if (type === 'fragment') return {
                    CUSTOM_FRAGMENT_DEFINITIONS: Walls3D.GLSL_DEFS,
                    CUSTOM_FRAGMENT_BEFORE_LIGHTS: Walls3D.GLSL_MAIN,
                    CUSTOM_FRAGMENT_BEFORE_FOG: `
                        #ifdef WALL3D
                        color.rgb += w3E;
                        #endif`,
                };
                return null;
            }
        };
    },
};

// ------------------------------------------------------------------ o shader da parede
// (sem ponto e vírgula em comentário GLSL: o Babylon corta a linha ali — os comentários daqui ficam fora das strings)
// wfA (material, janela, térreo, baia) · wfW (a janela) · wfT (moldura, desgaste) · wfG (vidro, ar) · wfS (2ª cor, grade) ·
// wfM (argamassa/tijolo/viga, reboco) · wfP (laje, pilar, meia-parede, escritório) · wfQ (peitoril, verga, 1º andar do ar, pichação) ·
// wfK (noite, casas acesas, relógio, escritórios acesos + 10·shade)
Walls3D.GLSL_DEFS = `
#ifdef WALL3D
varying vec2 wlUV;
uniform sampler2D w3At;
float w3h(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float w3n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(w3h(i), w3h(i + vec2(1.0, 0.0)), f.x), mix(w3h(i + vec2(0.0, 1.0)), w3h(i + vec2(1.0, 1.0)), f.x), f.y); }
float w3i(float a, float b, float c) { float r = mod(a * 37.0 + b * 101.0 + c * 59.0 + a * b * 13.0 + a * a * 7.0 + c * b * 3.0, 97.0); return (r > 96.5 ? 0.0 : r) / 97.0; }
float w3box(vec2 p, vec2 a, vec2 b) { vec2 q = max(a - p, p - b); return max(q.x, q.y); }
float w3det(float size, float fw) { return 1.0 - smoothstep(size * 0.1, size * 0.4, fw); }
vec4 w3bond(vec2 w, vec2 sz, float off, out vec2 f) {
    float row = floor(w.y / sz.y);
    float x = w.x / sz.x + off * mod(row, 2.0);
    vec2 cell = vec2(floor(x), row);
    f = vec2(fract(x) * sz.x, (w.y / sz.y - row) * sz.y);
    float e = min(min(f.x, sz.x - f.x), min(f.y, sz.y - f.y));
    return vec4(cell, w3h(cell + 0.37), e);
}
vec3 w3bricks(vec3 b, vec3 mortar, vec2 w, vec2 sz, float mt, float sd, float fw, float spread) {
    vec2 f;
    vec4 B = w3bond(w, sz, 0.5, f);
    float dv = w3det(sz.y, fw), h = w3h(B.xy + sd), h2 = w3h(B.xy * 1.31 + sd + 4.0);
    vec3 c = b * (1.0 - spread + 2.0 * spread * h) * vec3(1.0 + 0.08 * (h2 - 0.5), 1.0, 1.0 - 0.08 * (h - 0.5));
    c *= 0.9 + 0.18 * smoothstep(0.0, sz.y, f.y);
    float mm = 1.0 - smoothstep(mt * 0.4, mt, B.w);
    vec3 det = mix(c, mortar, mm);
    vec3 avg = mix(b, mortar, clamp(mt * 2.2 / sz.y, 0.0, 0.6));
    return mix(avg, det, dv);
}
vec3 w3plaster(vec3 b, vec2 w, float sd, float fw, float wear, out float n1) {
    n1 = w3n(w * vec2(0.5, 0.3) + sd);
    float n2 = w3n(w * vec2(1.9, 1.3) - sd), dt = w3det(0.03, fw);
    vec3 c = b * (0.88 + 0.18 * n1) * mix(1.0, 0.93 + 0.14 * n2, w3det(0.4, fw));
    c *= mix(1.0, 0.86 + 0.28 * w3h(floor(w * 55.0)), 0.4 * dt);
    float ck = 1.0 - smoothstep(0.0, 0.014, abs(n2 - 0.5));
    c *= 1.0 - 0.3 * ck * smoothstep(0.55, 0.8, n1) * wear * w3det(0.05, fw);
    c = mix(c, c * vec3(0.74, 0.71, 0.66), smoothstep(0.62, 0.86, n1) * wear);
    return c;
}
vec3 w3concrete(vec3 b, vec2 w, vec2 c, float BAY, float sd, float fw, float wear) {
    float row = floor(w.y / 0.22), d1 = w3det(0.2, fw), d2 = w3det(0.04, fw);
    vec3 col = b * mix(1.0, 0.96 + 0.07 * w3h(vec2(row, floor(w.x / 2.4) + sd)), d1);
    col *= mix(1.0, 0.93, (1.0 - smoothstep(0.004, 0.012, min(fract(w.y / 0.22), 1.0 - fract(w.y / 0.22)) * 0.22)) * d2);
    vec2 t = fract(w / vec2(0.6, 0.66)) - 0.5;
    col *= 1.0 - 0.45 * (1.0 - smoothstep(0.012, 0.02, length(t * vec2(0.6, 0.66)))) * d2;
    float jn = min(c.x, 1.0 - c.x) * BAY;
    col *= 1.0 - 0.32 * (1.0 - smoothstep(0.006, 0.016, jn)) * d2;
    float st = w3n(vec2(w.x * 3.0, w.y * 0.3) + sd);
    col *= 1.0 - smoothstep(0.55, 0.85, st) * 0.22 * wear;
    return col * (0.92 + 0.12 * w3n(w * 0.5 - sd));
}
#endif`;

Walls3D.GLSL_MAIN = `
#ifdef WALL3D
vec3 w3E = vec3(0.0);
if (wfK.w > 5.0) {
    float fam = wfA.x, wt = wfA.y, gt = wfA.z, BAY = max(wfA.w, 0.5);
    vec2 U = wlUV;
    float kk = floor(U.x / 128.0);
    float ix = floor(U.x) - kk * 128.0, j = floor(U.y);
    vec2 c = vec2(U.x - floor(U.x), U.y - j);
    vec2 sc = vec2(BAY, 3.0), p = c * sc;
    vec3 Pw = vPositionW;
    vec2 Wp = vec2(abs(vNormalW.x) > 0.5 ? Pw.z : Pw.x, Pw.y);
    float yl = U.y * 3.0;
    #ifdef WEBGL2
    float fw = max(length(fwidth(Wp)), 0.0005);
    #else
    float fw = 0.02;
    #endif
    float sd = kk * 7.31 + 3.7, wear = wfT.w;
    vec3 base = baseColor.rgb, col = base;
    float ao = 1.0;
    vec4 R = wfW;
    float door = 0.0, wk = wt;
    float h1 = w3i(ix, j, kk), h2 = w3i(ix + 17.0, j + 5.0, kk + 3.0), hA = w3i(ix + 29.0, j + 11.0, kk + 7.0);
    vec4 DR = vec4(0.5 - 0.5 / BAY, 0.5 + 0.5 / BAY, 0.0, 0.73);
    if (j < 0.5) {
        if (gt > 0.5 && gt < 1.5) { if (h1 < 0.42) { door = 1.0; R = DR; } }
        else if (gt > 1.5 && gt < 2.5) { door = 2.0; R = vec4(0.06, 0.94, 0.0, 0.8); }
        else if (gt > 2.5 && gt < 3.5) { door = 4.0; R = vec4(0.04, 0.96, 0.0, 0.86); }
        else if (gt > 3.5 && gt < 4.5) { if (h1 < 0.5) { door = 5.0; R = vec4(0.1, 0.9, 0.0, 0.76); } else if (h1 < 0.72) { door = 1.0; R = DR; } }
        else if (gt > 4.5) { if (h1 < 0.3) { door = 1.0; R = DR; } else if (h1 < 0.42) { door = 3.0; R = vec4(0.15, 0.85, 0.0, 0.72); } else if (h1 < 0.52) { door = 2.0; R = vec4(0.1, 0.9, 0.0, 0.75); } }
    }
#if defined(W3MIX)
    if (wt > 11.5 && wt < 12.5) { float hk = w3i(ix + 5.0, j + 13.0, kk + 1.0); wk = hk < 0.28 ? 1.0 : hk < 0.46 ? 2.0 : hk < 0.62 ? 3.0 : hk < 0.78 ? 8.0 : hk < 0.86 ? 14.0 : 1.0; }
#endif
    vec2 a = R.xz * sc, b = R.yw * sc, wsz = max(b - a, vec2(0.05));
    float d = w3box(p, a, b);
    vec2 q = (p - a) / wsz;
    #ifdef WEBGL2
    vec2 qdx = dFdx(q), qdy = dFdy(q);
    #endif
    float FR = 0.08;
    float dB = w3det(0.06, fw), dM = w3det(0.25, fw);

    // ---- o material da parede
    if (fam < 1.5) {
#if W3FAM == 1
        float pn;
        col = w3plaster(base, Wp, sd, fw, wear, pn);
#endif
    } else if (fam < 3.5) {
#if W3FAM == 2 || W3FAM == 3
        vec3 raw = w3bricks(fam < 2.5 ? wfM.rgb : base, fam < 2.5 ? vec3(0.62, 0.58, 0.52) : wfM.rgb, Wp + vec2(sd, 0.0), vec2(0.31, 0.205), 0.028, sd, fw, 0.16);
#if defined(W3PIL)
        if (wfP.y > 0.5) {
            float pe = min(c.x, 1.0 - c.x) * BAY;
            float pil = 1.0 - smoothstep(0.1, 0.115, pe), beam = 1.0 - smoothstep(0.19, 0.205, p.y);
            vec3 conc = vec3(0.63, 0.61, 0.57) * (0.9 + 0.18 * w3h(vec2(floor(Wp.y * 7.0), floor(Wp.x * 0.8) + sd)));
            raw = mix(raw, conc, max(pil, beam));
        }
#endif
        col = raw;
        if (fam < 2.5) {
#if W3FAM == 2
            float pn;
            vec3 pl = w3plaster(base, Wp, sd, fw, wear, pn);
            float m = w3n(Wp * vec2(0.9, 0.7) + sd * 2.0) * 0.7 + pn * 0.3;
            m += (1.0 - smoothstep(0.0, 1.4, yl)) * 0.22 + (1.0 - smoothstep(0.0, 0.35, min(c.x, 1.0 - c.x) * BAY)) * 0.08;
            float cut = 1.0 - wfM.w;
            float pc = smoothstep(cut - 0.01, cut + 0.01, 1.0 - m);
            if (wfP.z > 0.5) pc *= 1.0 - smoothstep(1.4, 1.5, p.y);
            float edge = smoothstep(cut - 0.06, cut, 1.0 - m) * (1.0 - pc);
            col = mix(raw * (1.0 - 0.35 * edge * dB), pl, pc);
            col *= 1.0 - 0.18 * (smoothstep(cut, cut + 0.03, 1.0 - m) - smoothstep(cut + 0.03, cut + 0.07, 1.0 - m)) * dB;
#endif
        }
#endif
    } else if (fam < 4.5) {
#if W3FAM == 4
        col = w3bricks(base, wfM.rgb, Wp, vec2(0.25, 0.082), 0.012, sd, fw, 0.12);
        col = mix(col, col * vec3(0.7, 0.72, 0.7), smoothstep(0.62, 0.9, w3n(Wp * vec2(0.6, 0.25) + sd)) * wear);
        if (wfP.x > 0.5) col = mix(col, wfT.rgb * 0.92, 1.0 - smoothstep(0.17, 0.18, p.y));
#endif
    } else if (fam < 5.5) {
#if W3FAM == 5
        col = w3concrete(base, Wp, c, BAY, sd, fw, wear);
#endif
    } else if (fam < 6.5) {
#if W3FAM == 6
        col = base * (0.92 + 0.1 * w3n(Wp * 0.3 + sd));
        col += vec3(0.05) * smoothstep(0.85, 1.0, sin((Wp.x + Wp.y * 0.6) * 1.7 + sd)) * dM;
#endif
    } else if (fam < 7.5) {
#if W3FAM == 7
        float rib = sin(Wp.x * 6.2832 / 0.15);
        col = base * mix(1.0, 0.84 + 0.2 * (rib * 0.5 + 0.5), w3det(0.15, fw));
        float rs = w3n(vec2(Wp.x * 4.0, Wp.y * 0.35) + sd) * 0.7 + w3n(Wp * 1.3 - sd) * 0.3;
        col = mix(col, vec3(0.48, 0.28, 0.15) * (0.8 + 0.3 * rs), smoothstep(1.0 - 0.45 * wear, 1.05, rs + 0.15));
        col *= mix(1.0, 0.85, (1.0 - smoothstep(0.0, 0.02, min(c.x, 1.0 - c.x) * BAY)) * dB);
#endif
    } else if (fam < 8.5) {
#if W3FAM == 8
        float bd = floor(Wp.x / 0.2), bf = fract(Wp.x / 0.2);
        col = base * mix(1.0, 0.82 + 0.3 * w3h(vec2(bd, sd)), w3det(0.2, fw));
        col *= mix(1.0, 0.9 + 0.12 * w3n(vec2(bd * 3.0, Wp.y * 6.0)), dB);
        col *= 1.0 - 0.55 * (1.0 - smoothstep(0.0, 0.06, min(bf, 1.0 - bf))) * dB;
        col = mix(col, vec3(dot(col, vec3(0.33))) * vec3(1.0, 0.98, 0.95), wear * 0.35);
#endif
    } else if (fam < 9.5) {
#if W3FAM == 9
        float row = floor(Wp.y / 0.3), x = Wp.x / 0.48 + fract(row * 0.618);
        vec2 cell = vec2(floor(x), row), f = vec2(fract(x) * 0.48, fract(Wp.y / 0.3) * 0.3);
        float e = min(min(f.x, 0.48 - f.x), min(f.y, 0.3 - f.y)), h = w3h(cell + sd);
        vec3 s = base * (0.82 + 0.34 * h) * (0.9 + 0.2 * smoothstep(0.0, 0.3, f.y));
        float mm = 1.0 - smoothstep(0.012, 0.035, e);
        col = mix(mix(base, wfM.rgb, 0.22), mix(s, wfM.rgb, mm), w3det(0.3, fw));
#endif
    } else if (fam < 10.5) {
#if W3FAM == 10
        float pn;
        col = w3plaster(base, Wp, sd, fw, wear * 0.5, pn);
        float hb = (1.0 - smoothstep(0.15, 0.17, p.y)) + (1.0 - smoothstep(0.08, 0.1, 3.0 - p.y));
        float px = c.x * BAY;
        float post = (1.0 - smoothstep(0.08, 0.095, px)) + (1.0 - smoothstep(0.08, 0.095, BAY - px)) + (1.0 - smoothstep(0.07, 0.085, abs(px - BAY * 0.5)));
        vec2 l0 = vec2(0.0, 0.17), l1 = vec2(BAY * 0.5, 2.9), pv = vec2(mod(px, BAY * 0.5), p.y);
        if (px > BAY * 0.5) pv.x = BAY * 0.5 - pv.x;
        vec2 ld = l1 - l0;
        float tt = clamp(dot(pv - l0, ld) / dot(ld, ld), 0.0, 1.0);
        float diag = 1.0 - smoothstep(0.06, 0.075, length(pv - l0 - ld * tt));
        float beam = clamp(hb + post + diag, 0.0, 1.0);
        col = mix(col, wfM.rgb * (0.85 + 0.2 * w3n(vec2(Wp.x * 2.0, Wp.y * 9.0))), beam);
#endif
    } else if (fam < 11.5) {
#if W3FAM == 11
        vec3 tc = (p.y < a.y - 0.12 && door < 0.5) ? wfS.rgb : base;
        col = w3bricks(tc, mix(tc, vec3(0.92), 0.5), Wp, vec2(0.05, 0.05), 0.006, sd, fw, 0.07);
        col *= 0.96 + 0.08 * w3n(Wp * 0.8 + sd);
#endif
    } else if (fam < 12.5) {
#if W3FAM == 12
        vec2 t = fract(Wp / 0.15) - 0.5, tc = floor(Wp / 0.15);
        float dd = abs(t.x) + abs(t.y);
        float pat = (1.0 - smoothstep(0.02, 0.035, abs(dd - 0.3))) + (1.0 - smoothstep(0.16, 0.18, length(abs(t) - 0.5))) + (1.0 - smoothstep(0.06, 0.075, length(t)));
        pat = clamp(pat, 0.0, 1.0);
        vec3 tile = mix(base * (0.95 + 0.06 * w3h(tc)), wfM.rgb, pat);
        float gr = 1.0 - smoothstep(0.004, 0.009, (0.5 - max(abs(t.x), abs(t.y))) * 0.15);
        tile = mix(tile, vec3(0.8, 0.78, 0.74), gr);
        col = mix(mix(base, wfM.rgb, 0.28), tile, w3det(0.15, fw));
#endif
    } else if (fam < 13.5) {
#if W3FAM == 13
        vec2 f;
        vec4 P2 = w3bond(Wp, vec2(1.2, 0.6), 0.5, f);
        float h = w3h(P2.xy + sd);
        vec3 g = base * (0.9 + 0.2 * h) * (0.9 + 0.2 * w3h(floor(Wp * 90.0)) * w3det(0.02, fw));
        g = mix(g, g * 1.25, (1.0 - smoothstep(0.0, 0.03, abs(w3n(Wp * 2.2 + h * 9.0) - 0.5))) * 0.4 * w3det(0.1, fw));
        col = mix(g, base * 0.55, (1.0 - smoothstep(0.003, 0.008, P2.w)) * w3det(0.05, fw));
#endif
    } else {
#if W3FAM == 14
        col = base * (0.86 + 0.24 * w3n(Wp * 0.9 + sd)) * (0.94 + 0.1 * w3n(Wp * 5.0));
        float cr = 1.0 - smoothstep(0.0, 0.025, abs(w3n(Wp * 2.4 + sd) - 0.5));
        col *= 1.0 - 0.4 * cr * dB;
        float hole = smoothstep(0.7, 0.74, w3n(Wp * 0.7 - sd) + (1.0 - smoothstep(0.0, 1.0, yl)) * 0.15);
        vec2 gw = fract(Wp * vec2(5.0, 5.0));
        float stick = max(1.0 - smoothstep(0.1, 0.2, abs(gw.x - 0.5)), 1.0 - smoothstep(0.1, 0.2, abs(gw.y - 0.5)));
        col = mix(col, mix(vec3(0.18, 0.13, 0.09), wfM.rgb * 1.2, stick), hole * dB);
#endif
    }

    // pichação (favela e comércio): rabiscos no térreo
#if defined(W3TAG)
    if (wfQ.w > w3h(vec2(kk, 9.0)) && yl < 2.4 && yl > 0.5) {
        float x0 = 0.4 + w3h(vec2(kk, 3.0)) * 2.0;
        float lx = Wp.x - floor(Wp.x / 7.0) * 7.0;
        if (lx > x0 && lx < x0 + 2.6) {
            float sw = abs(w3n(vec2(Wp.x * 5.0, Wp.y * 9.0) + sd) - 0.5);
            float tg = (1.0 - smoothstep(0.02, 0.04, sw)) * (1.0 - smoothstep(0.0, 0.25, abs(yl - 1.4) - 0.45)) * dB;
            vec3 tc = w3h(vec2(kk, 4.0)) < 0.5 ? vec3(0.08, 0.08, 0.1) : (w3h(vec2(kk, 5.0)) < 0.5 ? vec3(0.12, 0.22, 0.6) : vec3(0.55, 0.1, 0.12));
            col = mix(col, tc, tg * 0.85);
        }
    }
#endif

    vec3 w3R = vec3(0.0);
#ifndef W3NOWIN
    // ---- a janela, a moldura, o peitoril, a verga, as venezianas, o ar
    vec3 frameC = wfT.rgb;
    if ((wk > 2.5 && wk < 3.5) || (wk > 6.5 && wk < 7.5)) frameC = wfS.rgb;
    if (wk > 7.5 && wk < 8.5) frameC = vec3(0.74, 0.75, 0.77);
    if (door > 0.5) frameC = door > 3.5 && door < 4.5 ? vec3(0.3, 0.32, 0.35) : (door > 1.5 ? vec3(0.4, 0.41, 0.43) : wfT.rgb);
    bool fl0 = (wk > 4.5 && wk < 6.5) || (wk > 8.5 && wk < 10.5);
    float FRw = fl0 ? 0.04 : FR;
    float cx = (a.x + b.x) * 0.5;
    bool shutClosed = wk > 3.5 && wk < 4.5 && h2 < 0.22;
    bool acSplit = false, acWin = false;
    if (door < 0.5 && hA < wfG.w && j >= wfQ.z && !fl0 && wk < 13.5 && (wk < 10.5 || wk > 11.5)) { if (hA < wfG.w * 0.45) acWin = true; else if (a.y - FR - 0.16 - 0.55 > -0.05) acSplit = true; }
    float bar = 0.0;
    vec3 barC = frameC;
    float lightable = 0.0;
    vec2 qd = q * wsz;
    if (d >= 0.0) {
        if (d < FRw) {
            col = frameC * (0.94 + 0.1 * step((a.y + b.y) * 0.5, p.y));
            if (door > 1.5 && door < 2.5) col = vec3(0.42, 0.43, 0.45);
        } else {
            float sy1 = a.y - FRw + 0.005, sy0 = sy1 - 0.075;
#if defined(W3SILL)
            if (wfQ.x > 0.5 && door < 0.5 && (wk < 10.5 || wk > 11.5) && p.x > a.x - FRw - 0.12 && p.x < b.x + FRw + 0.12) {
                if (p.y > sy0 && p.y < sy1) col = wfT.rgb * 1.05;
                else if (p.y < sy0 && p.y > sy0 - 0.28) ao *= 0.62 + 0.38 * smoothstep(0.0, 0.28, sy0 - p.y);
            }
#endif
#if defined(W3SILL)
            if (door < 0.5 && p.y < a.y && p.x > a.x && p.x < b.x) {
                float dc = floor(Wp.x * 7.0), dr = w3h(vec2(dc, sd + 1.3)) * (1.0 - smoothstep(0.0, 1.6 * w3h(vec2(dc, sd)), a.y - p.y));
                col *= 1.0 - 0.28 * smoothstep(0.35, 0.8, dr) * wear * dB;
            }
#endif
#if defined(W3LINT)
            if (wfQ.y > 0.5 && p.x > a.x - FRw - 0.15 && p.x < b.x + FRw + 0.15 && p.y > b.y + FRw - 0.005 && p.y < b.y + FRw + 0.14) col = wfT.rgb * 0.98;
            else if (wfQ.y > 0.5 && p.x > a.x - FRw - 0.15 && p.x < b.x + FRw + 0.15 && p.y < b.y + FRw + 0.3 && p.y > b.y + FRw + 0.14) ao *= 0.8 + 0.2 * smoothstep(0.0, 0.16, p.y - b.y - FRw - 0.14);
#endif
#if defined(W3WS)
            if (wk > 3.5 && wk < 4.5 && !shutClosed && door < 0.5) {
                float hw = wsz.x * 0.5;
                if (p.y > a.y - 0.02 && p.y < b.y + 0.02 && ((p.x > a.x - FRw - hw - 0.01 && p.x < a.x - FRw - 0.01) || (p.x > b.x + FRw + 0.01 && p.x < b.x + FRw + hw + 0.01)))
                    col = wfS.rgb * (0.76 + 0.3 * smoothstep(0.1, 0.5, fract(p.y / 0.055)) * dB);
            }
#endif
#if defined(W3AC)
            if (acSplit) {
                float ty = a.y - FR - 0.16;
                if (abs(p.x - cx) < 0.4 && p.y < ty && p.y > ty - 0.55) {
                    vec2 ql = vec2(p.x - cx, p.y - ty + 0.275);
                    col = vec3(0.86, 0.86, 0.83) * (1.0 - 0.3 * step(length(ql - vec2(-0.1, 0.0)), 0.2) * dB);
                } else if (abs(p.x - cx) < 0.45 && p.y < ty - 0.55 && p.y > ty - 1.4) {
                    col *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.85, ty - 0.55 - p.y)) * (1.0 - smoothstep(0.0, 0.05, abs(p.x - cx - 0.25))) * wear;
                }
            }
#endif
        }
    } else {
        // ---- o vão (janela ou porta): o vidro e, por cima, o DESENHO do vão lido do ATLAS (Walls3D.atlas: barras, caixilho, tábuas,
        // veneziana, chapa canelada, portão, o arco da colonial) — uma leitura de textura no lugar das contas de cada tipo
        float cs = clamp(abs(dot(normalW, viewDirectionW)), 0.0, 1.0), fres = (1.0 - cs) * (1.0 - cs);
        vec3 sky = mix(vec3(0.46, 0.56, 0.68), vec3(0.84, 0.88, 0.94), clamp(q.y * 0.75 + fres * 0.4, 0.0, 1.0));
        vec3 g = (wfG.rgb * 0.6 + 0.03) * (0.8 + 0.2 * smoothstep(0.0, 0.5, q.y));
        float hs = w3h(vec2(ix + kk * 131.0, j * 3.0 + 0.5));
        w3R = sky * (0.26 + 0.55 * fres) + 0.12 * smoothstep(0.9, 1.0, sin((p.x * 1.2 + p.y) * 2.6 + hs * 20.0)) * dM;
        float curt = (hs < 0.38 && !fl0 && door < 0.5) ? max(1.0 - step(0.18 + 0.12 * hs, q.x), step(0.82 - 0.12 * hs, q.x)) : 0.0;
        vec3 cc = hs < 0.1 ? vec3(0.7, 0.25, 0.2) : (hs < 0.2 ? vec3(0.86, 0.82, 0.72) : (hs < 0.3 ? vec3(0.3, 0.45, 0.5) : vec3(0.6, 0.5, 0.36)));
        g = mix(g, cc * 0.55, curt * 0.6);
        float rv = fl0 ? 0.08 : 0.16;
        float rvs = 1.0 - 0.42 * (1.0 - smoothstep(0.0, rv, b.y - p.y)) - 0.2 * (1.0 - smoothstep(0.0, rv * 0.6, p.x - a.x));
        g *= rvs; w3R *= rvs;
        col = g;
        // o desenho do vão (o número do ladrilho no atlas) e a cor do que cobre o vão
        float tile = 21.0;
        vec3 sC = wfS.rgb;
        if (door > 0.5) {
            if (door < 1.5) { tile = 17.0; sC = h2 < 0.3 ? vec3(0.42, 0.27, 0.16) : (h2 < 0.5 ? wfS.rgb : (h2 < 0.72 ? vec3(0.86, 0.86, 0.84) : vec3(0.24, 0.34, 0.5))); }
            else if (door < 2.5 || door > 4.5) { tile = 18.0; sC = h2 < 0.55 ? vec3(0.58, 0.6, 0.62) : (h2 < 0.75 ? wfS.rgb * 1.2 : vec3(0.36, 0.46, 0.58)); }
            else if (door < 3.5) { tile = 19.0; sC = wfS.rgb * 0.9; barC = vec3(0.3, 0.31, 0.33); }
            else { tile = 20.0; barC = vec3(0.3, 0.32, 0.35); }
        }
        else if (wk < 1.5) { tile = 0.0; barC = vec3(0.13, 0.13, 0.14); }
        else if (wk < 2.5) { tile = 1.0; col = mix(col, vec3(0.62, 0.66, 0.66), 0.25); }
        else if (wk < 3.5) { tile = h2 < 0.3 ? 3.0 : (h2 < 0.65 ? 4.0 : 2.0); }
        else if (wk < 4.5) { tile = shutClosed ? 6.0 : 5.0; }
        else if (wk < 5.5) { tile = 7.0; barC = wfT.rgb; }
        else if (wk < 6.5) { tile = 8.0; barC = wfT.rgb; }
        else if (wk < 7.5) { tile = h2 < 0.35 ? 10.0 : 9.0; }
        else if (wk < 8.5) { tile = 11.0; if (j < 1.5 && w3i(ix + 2.0, j + 19.0, kk + 11.0) < wfS.w) { tile = 12.0; barC = vec3(0.12, 0.12, 0.13); } }
        else if (wk < 9.5) { tile = 13.0; barC = wfT.rgb; }
        else if (wk < 10.5) { tile = 14.0; barC = wfT.rgb; col = mix(col, vec3(0.55, 0.62, 0.64), 0.35); }
        else if (wk < 11.5) { tile = 21.0; }
        else if (wk > 12.5 && wk < 13.5) { tile = 15.0; }
        else { tile = 16.0; sC = vec3(0.5, 0.4, 0.3); }
        vec2 auv = (vec2(mod(tile, 8.0), floor(tile / 8.0)) + clamp(q, 0.008, 0.992)) * vec2(0.125, 0.25);
        #ifdef WEBGL2
        vec4 AT = textureGrad(w3At, auv, qdx * vec2(0.125, 0.25), qdy * vec2(0.125, 0.25));
        #else
        vec4 AT = texture2D(w3At, auv);
        #endif
        float sh = AT.b * 2.0;
        col = mix(col * sh, sC * sh, AT.g);
        bar = AT.r;
        lightable = (1.0 - AT.g) * step(0.5, AT.a) * (door > 3.5 && door < 4.5 ? 1.0 : step(door, 0.5));
        if (AT.a < 0.5) col = frameC;
        w3R *= (1.0 - AT.g) * step(0.5, AT.a);
        #ifdef W3WK
        if (wk > 10.5 && wk < 11.5) {
            vec2 cg = fract(qd / 0.2) - 0.5;
            float hole = 1.0 - smoothstep(0.26, 0.3, length(cg));
            col = mix(base * (0.9 + 0.12 * w3h(floor(qd / 0.2))) * (1.0 - 0.25 * (1.0 - smoothstep(0.0, 0.03, 0.5 - max(abs(cg.x), abs(cg.y))))), vec3(0.05), hole * w3det(0.2, fw));
            lightable = hole;
            w3R = vec3(0.0);
        }
        #endif
        #if defined(W3D2) || defined(W3D5)
        if (door > 1.5 && door < 2.5 && h2 < 0.5 && wfQ.w > 0.1) {
            float g1 = w3n(Wp * vec2(2.5, 3.5) + sd * 3.0);
            vec3 gc = vec3(w3h(vec2(kk, 11.0)), w3h(vec2(kk, 12.0)), w3h(vec2(kk, 13.0))) * 0.8 + 0.1;
            col = mix(col, gc, smoothstep(0.62, 0.66, g1) * (1.0 - smoothstep(0.7, 0.74, g1)) * dB * 0.9);
            col = mix(col, vec3(0.06), (1.0 - smoothstep(0.015, 0.03, abs(g1 - 0.5))) * dB * 0.7);
        }
        #endif
        #ifdef W3AC
        if (acWin && abs(p.x - cx) < 0.3 && p.y < a.y + 0.4) { col = vec3(0.86, 0.85, 0.8) * (0.75 + 0.25 * step(0.5, fract(p.x / 0.03))); lightable = 0.0; bar = 0.0; w3R = vec3(0.0); }
        #endif
        col = mix(col, barC * (0.9 + 0.15 * step(0.5, q.y)), bar);
        w3R *= 1.0 - bar;
    }

#endif
    // ---- sujeira e sombra de contato: o pé da parede, a laje de cada andar
    ao *= 0.68 + 0.32 * smoothstep(0.0, 0.9, yl);
    col = mix(col, col * vec3(0.7, 0.64, 0.56), (1.0 - smoothstep(0.0, 0.6, yl)) * 0.55 * wear);
    if (j > 0.5) ao *= 0.9 + 0.1 * smoothstep(0.0, 0.3, p.y);
    baseColor.rgb = col * ao;
    w3E = w3R * (1.0 - wfK.x) * 0.6;

#ifndef W3NONIGHT
    // ---- a noite: a janela acesa (luz própria, o teto mais claro, a cortina), a luz vazando na parede, portaria e lâmpada da porta
    if (wfK.x > 0.002) {
        vec3 w3N = vec3(0.0);
        float hw = w3h(vec2(ix * 1.37 + kk * 131.0, j * 7.13 + kk * 0.37));
        float off = wfP.w > 0.5 ? 1.0 : 0.0;
        float frac = off > 0.5 ? wfK.w - 10.0 * floor(wfK.w / 10.0) : wfK.y;
        if (off > 0.5) frac = clamp(frac + (w3h(vec2(j, kk)) - 0.5) * 0.5, 0.0, 1.0);
        vec3 LC = vec3(0.0);
        float lit = 0.0;
        if (door > 3.5 && door < 4.5) { lit = 1.0; LC = vec3(1.0, 0.9, 0.74); }
        else if (door < 0.5 && hw < frac) {
            lit = 1.0;
            float h5 = w3h(vec2(hw * 91.0, j + 3.0));
            LC = off > 0.5 ? (h5 < 0.7 ? vec3(0.8, 0.88, 1.0) : vec3(1.0, 0.92, 0.78)) * 0.8 : (h5 < 0.45 ? vec3(1.0, 0.68, 0.36) : (h5 < 0.75 ? vec3(1.0, 0.86, 0.64) : (h5 < 0.92 ? vec3(0.8, 0.88, 1.0) : vec3(0.42, 0.6, 1.25) * (0.7 + 0.3 * sin(wfK.z * 7.0 + hw * 60.0) * sin(wfK.z * 2.3 + h5 * 90.0)))));
            LC *= 0.75 + 0.45 * fract(hw * 13.7);
        }
        if (lit > 0.5) {
            if (d < 0.0 && lightable > 0.0) {
                float room = 0.55 + 0.45 * smoothstep(0.1, 0.95, q.y);
                float lamp = exp(-dot((q - vec2(0.3 + 0.4 * fract(hw * 7.0), 0.75)) * wsz, (q - vec2(0.3 + 0.4 * fract(hw * 7.0), 0.75)) * wsz) * 6.0);
                room += lamp * 0.6;
#if defined(W3OFF) || defined(W3D4)
                if (off > 0.5 || door > 3.5) {
                    room = 0.42 + 0.38 * smoothstep(0.15, 1.0, q.y);
                    room += 0.45 * (1.0 - smoothstep(0.0, 0.035, abs(q.y - 0.9) * wsz.y)) * step(0.25, fract(qd.x / 1.4 + hw));
                    room *= 1.0 - 0.4 * step(q.y, 0.36) * step(0.45, fract(qd.x / 1.7 + hw * 3.0));
                    room += 0.25 * (1.0 - smoothstep(0.0, 0.05, abs(q.y - 0.42) * wsz.y)) * step(0.7, fract(qd.x / 0.9 + hw * 5.0)) * step(0.5, fract(hw * 9.0));
                }
#endif
                float hs2 = w3h(vec2(ix + kk * 131.0, j * 3.0 + 0.5));
                if (hs2 < 0.38 && !fl0) { float cw = 0.18 + 0.12 * hs2; room *= mix(1.0, 0.45, max(1.0 - step(cw, q.x), step(1.0 - cw, q.x))); }
                if (fract(hw * 31.0) < 0.25 && off < 0.5) room *= 1.0 - 0.6 * step(q.y, 0.35) * step(abs(q.x - 0.5 - (fract(hw * 17.0) - 0.5) * 0.4), 0.18);
                w3N += LC * room * lightable * (1.0 - bar * 0.85);
            } else if (d >= FRw * 0.5) {
                float sp = 1.0 - smoothstep(0.0, 0.55, d);
                w3N += LC * 0.11 * sp * sp * (p.y > b.y ? 0.6 : 1.0);
            }
        }
#if defined(W3D1)
        if (door > 0.5 && door < 1.5 && h2 < 0.65) {
            vec2 lp = vec2(cx, b.y + 0.28);
            float r = length(p - lp);
            w3N += vec3(1.0, 0.74, 0.42) * (2.2 * (1.0 - smoothstep(0.035, 0.06, r)) + 0.35 * exp(-r * r * 4.0));
        }
#endif
        w3E += w3N * wfK.x;
    }
#endif
}
#endif`;

// os estilos novos também no desenho antigo (`?fachadas=2d`)
if (typeof TileFactory !== 'undefined') for (const [k, v] of Object.entries(Walls3D.OLD)) if (!TileFactory.facadeStyles[k]) TileFactory.facadeStyles[k] = v;
