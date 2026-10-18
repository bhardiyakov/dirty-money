// ============================================================================
// Outfit — roupas, acessórios e APARÊNCIA do jogador: compram-se na BOUTIQUE (loja de roupas do shopping/comércio, Economy 'clothes') e
// mudam o visual E o personagem.
//
//   • Partes: tênis (shoes), parte de cima (top), calça (legs), cabeça (head: bonés, toucas, chapéus) e acessórios (óculos, relógio,
//     luvas, corrente). Uma peça por parte.
//   • Visual (personagem 2,5D, ver PlayerLook): cada peça tem uma FORMA (`look`: regata, bermuda, chinelo, boné…) e uma cor. Trocar só
//     a cor (TINGIR, de graça: Outfit.tint) muda a paleta na hora; trocar a forma gera o desenho do jogador de novo em segundo plano.
//   • Aparência (de graça, no menu): pele, cabelo, cor do cabelo, barba e corpo (Outfit.appearance).
//   • Efeitos (Outfit.m, somados de todas as peças vestidas), lidos por quem já lê as habilidades (SkillTree.m):
//       sprint / walk     velocidade correndo / andando (+%)            stamina   fôlego gasto correndo (−%)
//       staminaMax        fôlego máximo (+pontos)                        regen     recuperação do fôlego (+%)
//       carry             carga confortável da bolsa (+%)                dmgTaken  dano recebido (−%)
//       melee             dano de soco/chute/pancada (+%)                sight     distância em que a polícia te reconhece (−%)
//       lose              tempo para a polícia perder o rastro (−%)      price     preço no comércio (−%)
//       fence             quanto o receptador paga (+%)                  favela    preço no comércio da favela (−%)
//   • Comprou, é seu: as peças ficam no guarda-roupa e trocam-se de graça na boutique ou no menu (Inventário → Equipamento, ui/EquipUI.js);
//     dá para descartar o que não quiser mais (menos as peças de sempre).
// ============================================================================

const Outfit = {
    SLOTS: ['shoes', 'top', 'legs', 'head', 'face', 'eyes', 'wrist', 'hands', 'neck'],
    SLOT_NAME: { shoes: 'Calçado', top: 'Parte de cima', legs: 'Calça', head: 'Cabeça', face: 'Rosto', eyes: 'Óculos', wrist: 'Pulso', hands: 'Mãos', neck: 'Pescoço' },

    // base = preço (R$) antes dos fatores da loja; col = cores na paleta antiga (piloto de moto); look = forma e cor no personagem 2,5D
    // (campos da ficha do gerador: tools/asset_baker/generator); fx = efeitos (ver o cabeçalho)
    ITEMS: {
        // ---- calçados
        tenis_branco:   { slot: 'shoes', name: 'Tênis branco', base: 0, col: { shoes: '#f0f0f4' }, look: { shoes: 'sneaker', shoe_color: 'tenis_branco', sole_color: 'tenis_branco' }, fx: {}, desc: 'O de sempre' },
        chinelo:        { slot: 'shoes', name: 'Chinelo de dedo', base: 25, col: { shoes: '#2f7fd0' }, look: { shoes: 'flipflop', shoe_color: 'azul', sole_color: 'branco' }, fx: { walk: -0.04, favela: 0.05 }, desc: 'Estilo do morro: −5% nos preços da favela, anda um pouco mais devagar' },
        tenis_corrida:  { slot: 'shoes', name: 'Tênis de corrida', base: 480, col: { shoes: '#2fd07a' }, look: { shoes: 'sneaker', shoe_color: 'tenis_verde', sole_color: 'tenis_branco' }, fx: { sprint: 0.12, stamina: 0.2 }, desc: 'Corre 12% mais rápido e cansa 20% menos' },
        tenis_basquete: { slot: 'shoes', name: 'Tênis de basquete', base: 950, col: { shoes: '#e03a3a' }, look: { shoes: 'hightop', shoe_color: 'tenis_vermelho', sole_color: 'tenis_branco' }, fx: { sprint: 0.07, stamina: 0.1, melee: 0.1 }, desc: 'Cano alto. Corre 7% mais rápido; chute 10% mais forte' },
        tenis_skate:    { slot: 'shoes', name: 'Tênis de skate', base: 320, col: { shoes: '#1d1d22' }, look: { shoes: 'hightop', shoe_color: 'tenis_preto', sole_color: 'tenis_branco' }, fx: { sprint: 0.04, lose: 0.04 }, desc: 'Cano alto, sola grossa: corre 4% mais rápido e some no meio da galera' },
        coturno:        { slot: 'shoes', name: 'Coturno tático', base: 650, col: { shoes: '#2a2820' }, look: { shoes: 'boots', shoe_color: 'couro_preto', sole_color: 'sola_escura' }, fx: { melee: 0.25, dmgTaken: 0.04, sprint: -0.03 }, desc: 'Chute e pancada 25% mais fortes, −4% de dano; mais pesado' },
        sapato_social:  { slot: 'shoes', name: 'Sapato social', base: 700, col: { shoes: '#1c1410' }, look: { shoes: 'dress', shoe_color: 'couro_preto', sole_color: 'sola_escura' }, fx: { price: 0.03, sprint: -0.04 }, desc: '−3% no comércio (combina com o terno); ruim para correr' },
        // ---- parte de cima
        camiseta_branca: { slot: 'top', name: 'Camiseta branca', base: 0, col: { shirt: '#eceae4', sleeve: '#eceae4', forearm: 'skin' }, look: { top: 'tshirt', top_color: 'branco' }, fx: {}, desc: 'A de sempre (dá para tingir de qualquer cor)' },
        jaqueta_laranja: { slot: 'top', name: 'Jaqueta laranja', base: 260, col: { shirt: '#e8742c', sleeve: '#e8742c', forearm: 'skin' }, look: { top: 'jacket', top_color: 'laranja' }, fx: {}, desc: 'Jaqueta de náilon com zíper' },
        camiseta_estampa: { slot: 'top', name: 'Camiseta estampada', base: 90, col: { shirt: '#1f1f24', sleeve: '#1f1f24', forearm: 'skin' }, look: { top: 'tshirt', top_color: 'roupa_preta', pattern: 'logo', accent: 'amarelo' }, fx: { favela: 0.02 }, desc: 'Estampa no peito: −2% nos preços da favela' },
        camiseta_listrada: { slot: 'top', name: 'Camiseta listrada', base: 110, col: { shirt: '#3c62ac', sleeve: '#3c62ac', forearm: 'skin' }, look: { top: 'tshirt', top_color: 'azul', pattern: 'stripes_h', accent: 'branco' }, fx: { lose: 0.03 }, desc: 'Listras: a polícia perde o rastro 3% mais rápido' },
        regata_academia: { slot: 'top', name: 'Regata de academia', base: 90, col: { shirt: '#1f1f24', sleeve: 'skin', forearm: 'skin' }, look: { top: 'tank', top_color: 'roupa_preta' }, fx: { regen: 0.35, staminaMax: 20 }, desc: '+20 de fôlego máximo e recupera 35% mais rápido' },
        camisa_florida:  { slot: 'top', name: 'Camisa havaiana', base: 160, col: { shirt: '#9fbed5', sleeve: '#9fbed5', forearm: 'skin' }, look: { top: 'tshirt', top_color: 'azul_claro', pattern: 'floral', accent: 'vermelho', accent2: 'amarelo' }, fx: { sight: 0.06 }, desc: 'Cara de turista: a polícia te reconhece 6% mais de perto' },
        camisa_polo:     { slot: 'top', name: 'Camisa polo', base: 180, col: { shirt: '#367f4b', sleeve: '#367f4b', forearm: 'skin' }, look: { top: 'polo', top_color: 'verde', accent: 'branco' }, fx: { price: 0.02 }, desc: 'Arrumadinho: −2% no comércio' },
        camisa_time:     { slot: 'top', name: 'Camisa de time', base: 250, col: { shirt: '#f2d22c', sleeve: '#1f8a45', forearm: 'skin' }, look: { top: 'jersey', pattern: 'jersey', top_color: 'amarelo', accent: 'verde', accent2: 'azul' }, fx: { favela: 0.08 }, desc: 'Respeito na quebrada: −8% nos preços da favela' },
        moletom_capuz:   { slot: 'top', name: 'Moletom com capuz', base: 220, col: { shirt: '#3a3d46', sleeve: '#3a3d46', forearm: '#3a3d46' }, look: { top: 'hoodie', top_color: 'cinza' }, fx: { sight: 0.12, lose: 0.08 }, desc: 'A polícia te reconhece 12% mais de perto e perde o rastro mais rápido' },
        jaqueta_couro:   { slot: 'top', name: 'Jaqueta de couro', base: 1200, col: { shirt: '#2e1c14', sleeve: '#2e1c14', forearm: '#2e1c14' }, look: { top: 'jacket', top_color: 'couro_preto', zip: true }, fx: { dmgTaken: 0.1 }, desc: '10% menos dano (bala, soco, queda)' },
        colete_carga:    { slot: 'top', name: 'Colete de carga', base: 1600, col: { shirt: '#4a5034', sleeve: '#2a2c30', forearm: 'skin' }, look: { top: 'tshirt', top_color: 'cinza', vest: 'tactical', vest_color: 'oliva' }, fx: { carry: 0.2 }, desc: 'Bolsos e alças: carrega 20% mais peso sem pesar' },
        terno:           { slot: 'top', name: 'Terno', base: 2800, col: { shirt: '#22252e', sleeve: '#22252e', forearm: '#22252e' }, look: { top: 'jacket', top_color: 'marinho', belt: true }, fx: { price: 0.08, fence: 0.1, sight: 0.05 }, desc: '−8% no comércio, receptador paga 10% mais, chama menos atenção' },
        // ---- calças
        calca_preta:   { slot: 'legs', name: 'Calça preta', base: 0, col: { pants: '#1c1d22' }, look: { bottom: 'pants', bottom_color: 'roupa_preta' }, fx: {}, desc: 'A de sempre' },
        calca_jeans:   { slot: 'legs', name: 'Calça jeans escura', base: 120, col: { pants: '#2a2f45' }, look: { bottom: 'jeans', bottom_color: 'jeans_escuro' }, fx: {}, desc: 'Jeans escuro, cinco bolsos' },
        bermuda:       { slot: 'legs', name: 'Bermuda tactel', base: 60, col: { pants: '#5a7a9a' }, look: { bottom: 'shorts', bottom_color: 'azul_claro' }, fx: { walk: 0.03 }, desc: 'Leve: anda 3% mais rápido' },
        bermuda_jeans: { slot: 'legs', name: 'Bermuda jeans', base: 80, col: { pants: '#355074' }, look: { bottom: 'shorts', bottom_color: 'jeans' }, fx: { walk: 0.02, favela: 0.02 }, desc: 'Anda 2% mais rápido; −2% nos preços da favela' },
        calca_moletom: { slot: 'legs', name: 'Calça de moletom', base: 150, col: { pants: '#30323a' }, look: { bottom: 'pants', bottom_color: 'cinza' }, fx: { sprint: 0.04, stamina: 0.05 }, desc: 'Corre 4% mais rápido' },
        calca_cargo:   { slot: 'legs', name: 'Calça cargo', base: 320, col: { pants: '#55603e' }, look: { bottom: 'cargo', bottom_color: 'caqui' }, fx: { carry: 0.15 }, desc: 'Bolsos fundos: carrega 15% mais peso sem pesar' },
        calca_social:  { slot: 'legs', name: 'Calça social', base: 600, col: { pants: '#1c1e26' }, look: { bottom: 'pants', bottom_color: 'roupa_preta' }, fx: { price: 0.03 }, desc: '−3% no comércio' },
        // ---- cabeça (bonés, toucas, chapéus)
        bone:            { slot: 'head', name: 'Boné aba curva', base: 70, look: { head: 'cap', hat_color: 'vermelho', hat_logo: true }, fx: { sight: 0.04 }, desc: 'Aba baixa: a polícia te reconhece 4% mais de perto' },
        bone_tras:       { slot: 'head', name: 'Boné pra trás', base: 70, look: { head: 'cap_back', hat_color: 'roupa_preta' }, fx: { favela: 0.03 }, desc: 'Estilo de quebrada: −3% nos preços da favela' },
        touca:           { slot: 'head', name: 'Touca', base: 45, look: { head: 'beanie', hat_color: 'cinza' }, fx: { lose: 0.04 }, desc: 'A polícia perde o rastro 4% mais rápido' },
        chapeu_pescador: { slot: 'head', name: 'Chapéu de pescador', base: 140, look: { head: 'bucket', hat_color: 'branco' }, fx: { sight: 0.06, favela: 0.03 }, desc: 'Esconde o rosto: polícia te reconhece 6% mais de perto; −3% na favela' },
        viseira:         { slot: 'head', name: 'Viseira', base: 60, look: { head: 'visor', hat_color: 'branco' }, fx: { stamina: 0.05 }, desc: 'Sol fora do olho: cansa 5% menos correndo' },
        capacete:        { slot: 'head', name: 'Capacete de moto', base: 420, look: { head: 'helmet', hat_color: 'roupa_preta' }, fx: { dmgTaken: 0.06, sight: 0.1, sprint: -0.02 }, desc: '6% menos dano e a polícia te reconhece 10% mais de perto; pesado' },
        // ---- acessórios
        oculos_escuros: { slot: 'eyes', name: 'Óculos escuros', base: 180, look: { glasses: true }, fx: { sight: 0.08 }, desc: 'A polícia te reconhece 8% mais de perto' },
        relogio_ouro:   { slot: 'wrist', name: 'Relógio de ouro', base: 5500, look: { watch: true }, fx: { fence: 0.12, price: 0.02 }, desc: 'Status: receptador paga 12% mais' },
        luvas:          { slot: 'hands', name: 'Luvas de couro', base: 120, look: { gloves: true }, fx: { lose: 0.08, melee: 0.05 }, desc: 'Sem digitais: a polícia perde o rastro mais rápido' },
        // ---- rosto (máscaras): escondem o rosto de testemunhas e câmeras nos assaltos (crime/Traces.js) — mas mascarado na rua a polícia
        //      estranha de longe. Tecla K põe/tira a última máscara usada.
        balaclava:      { slot: 'face', name: 'Balaclava (touca ninja)', base: 90, mask: true, look: { mask: 'balaclava' }, fx: { sight: -0.3 }, desc: 'Rosto coberto: testemunha e câmera não te identificam. Na rua, a polícia estranha de longe (K tira)' },
        bandana:        { slot: 'face', name: 'Bandana no rosto', base: 35, mask: true, look: { mask: 'bandana', accent: 'vermelho' }, fx: { sight: -0.18 }, desc: 'Cobre o nariz e a boca: a câmera não pega o rosto, mas testemunha de perto ainda descreve você (K tira)' },
        corrente_ouro:  { slot: 'neck', name: 'Corrente de ouro', base: 3200, look: { chain: true }, fx: { favela: 0.1 }, desc: 'Respeito no morro: −10% nos preços da favela' },
    },
    // O visual de sempre (o mesmo da ficha do jogador no gerador — tools/asset_baker/generator/NpcGenTypes.js PLAYER_DEFAULT —, que
    // assa os atlas do protagonista: vestido assim, todas as animações vêm prontas, sem montar nada no guarda-roupa).
    DEFAULT: { shoes: 'tenis_branco', top: 'camiseta_branca', legs: 'calca_preta' },
    LOOK_VERSION: 2,             // 2 = camiseta branca, calça preta, pele parda, cabelo preto raspado (1: jaqueta laranja, jeans, pêssego, espetado)

    // ---- aparência (de graça) e tingimento das peças
    APPEARANCE: {
        skin: [['pele_clara', 'Clara'], ['pele_pessego', 'Pêssego'], ['pele_morena', 'Morena'], ['pele_parda', 'Parda'], ['pele_negra', 'Negra']],
        hair: [['spiky', 'Espetado'], ['short', 'Curto'], ['buzz', 'Raspado'], ['bald', 'Careca'], ['afro', 'Black power'], ['curly', 'Cacheado'], ['mohawk', 'Moicano'], ['dreads', 'Dreads'], ['long', 'Comprido'], ['ponytail', 'Rabo de cavalo'], ['bun', 'Coque'],
            ['side', 'Repartido'], ['quiff', 'Topete'], ['pixie', 'Pixie'], ['bob', 'Chanel'], ['bob_fringe', 'Chanel com franja'], ['braid', 'Trança']],
        hair_color: [['preto', 'Preto'], ['castanho', 'Castanho'], ['loiro', 'Loiro'], ['ruivo', 'Ruivo'], ['grisalho', 'Grisalho']],
        beard: [['', 'Sem barba'], ['beard', 'Barba'], ['goatee', 'Cavanhaque'], ['mustache', 'Bigode']],
        gender: [['m', 'Masculino'], ['f', 'Feminino']],
        // (o PORTE — magro, normal, forte, gordo — não se escolhe: vem do físico, player/Physique.js)
    },
    APPEARANCE_NAME: { skin: 'Pele', hair: 'Cabelo', hair_color: 'Cor do cabelo', beard: 'Barba', gender: 'Corpo' },
    APPEARANCE_DEFAULT: { skin: 'pele_parda', hair: 'buzz', hair_color: 'preto', beard: '', body: 'normal', gender: 'm' },
    // Cores para tingir (nome na paleta do gerador → rótulo). Por encaixe: o campo da ficha que muda.
    TINT_FIELD: { top: 'top_color', legs: 'bottom_color', shoes: 'shoe_color', head: 'hat_color', bag: 'bag_color' },
    TINTS: {
        cloth: [['branco', 'Branco'], ['roupa_preta', 'Preto'], ['cinza', 'Cinza'], ['vermelho', 'Vermelho'], ['vinho', 'Vinho'], ['laranja', 'Laranja'], ['amarelo', 'Amarelo'],
            ['mostarda', 'Mostarda'], ['verde', 'Verde'], ['camuflado', 'Camuflado'], ['turquesa', 'Turquesa'], ['azul_claro', 'Azul-claro'], ['azul', 'Azul'], ['marinho', 'Marinho'],
            ['roxo', 'Roxo'], ['lilas', 'Lilás'], ['rosa', 'Rosa'], ['coral', 'Coral'], ['marrom', 'Marrom'], ['bege', 'Bege'], ['caqui', 'Cáqui'], ['couro_preto', 'Couro']],
        legs: [['jeans', 'Jeans'], ['jeans_escuro', 'Jeans escuro'], ['jeans_claro', 'Jeans claro'], ['roupa_preta', 'Preto'], ['cinza', 'Cinza'], ['caqui', 'Cáqui'], ['bege', 'Bege'],
            ['marrom', 'Marrom'], ['marinho', 'Marinho'], ['azul_claro', 'Azul-claro'], ['camuflado', 'Camuflado'], ['vermelho', 'Vermelho'], ['branco', 'Branco']],
        shoes: [['tenis_branco', 'Branco'], ['tenis_preto', 'Preto'], ['tenis_creme', 'Creme'], ['tenis_vermelho', 'Vermelho'], ['tenis_verde', 'Verde'], ['tenis_azul', 'Azul'],
            ['amarelo', 'Amarelo'], ['rosa', 'Rosa'], ['couro_marrom', 'Couro marrom'], ['couro_preto', 'Couro preto']],
        bag: [['mochila', 'Marrom'], ['roupa_preta', 'Preto'], ['oliva', 'Oliva'], ['camuflado', 'Camuflado'], ['vermelho', 'Vermelho'], ['azul', 'Azul'], ['rosa', 'Rosa'], ['amarelo', 'Amarelo']],
    },
    tintList(slot) { return slot === 'legs' ? this.TINTS.legs : slot === 'shoes' ? this.TINTS.shoes : slot === 'bag' ? this.TINTS.bag : this.TINTS.cloth; },

    owned: new Set(['tenis_branco', 'camiseta_branca', 'calca_preta']),
    worn: { shoes: 'tenis_branco', top: 'camiseta_branca', legs: 'calca_preta' },
    appearance: {},
    tint: {},                    // encaixe → cor (nome da paleta) escolhida pelo jogador
    m: { sprint: 0, walk: 0, stamina: 0, staminaMax: 0, regen: 0, carry: 0, dmgTaken: 0, melee: 0, sight: 0, lose: 0, price: 0, fence: 0, favela: 0 },

    isWorn(id) { const it = this.ITEMS[id]; return !!it && this.worn[it.slot] === id; },

    // Raridade pela faixa de preço (borda dos cartões no Inventário → Equipamento): comum, incomum, rara, épica, lendária.
    rarity(id) {
        const b = (this.ITEMS[id] || {}).base || 0;
        return b <= 0 ? 'common' : b < 300 ? 'uncommon' : b < 1500 ? 'rare' : b < 4000 ? 'epic' : 'legend';
    },

    // Efeitos somados de um conjunto de peças (sem vestir): a prévia "e se eu trocar?" do menu usa isto.
    fxOf(worn) {
        const m = {};
        for (const k of Object.keys(this.m)) m[k] = 0;
        for (const id of Object.values(worn)) { const it = this.ITEMS[id]; if (it) for (const [k, v] of Object.entries(it.fx)) m[k] = (m[k] || 0) + v; }
        return m;
    },

    // Campos da ficha do personagem 2,5D (forma + cor) da roupa e da aparência. worn/appearance/tint: os atuais se omitidos.
    lookSpec(worn = this.worn, appearance = this.appearance, tint = this.tint) {
        const s = Object.assign({}, this.APPEARANCE_DEFAULT, appearance);
        if (!s.beard) s.beard = null;
        s.body = typeof Physique !== 'undefined' ? Physique.shape : 'normal';      // o porte é o do físico (come, treina, passa fome)
        for (const slot of this.SLOTS) {
            const id = worn[slot] || this.DEFAULT[slot], it = id && this.ITEMS[id];
            if (it && it.look) Object.assign(s, it.look);
        }
        for (const [slot, f] of Object.entries(this.TINT_FIELD)) if (tint && tint[slot] && (slot === 'bag' || worn[slot] || this.DEFAULT[slot])) s[f] = tint[slot];
        if (s.shoes === 'flipflop' && tint && tint.shoes) s.sole_color = tint.shoes;
        return s;
    },

    // Soma os efeitos e pinta o jogador. Chamado ao vestir, ao carregar o jogo e quando a paleta fica pronta.
    apply() {
        Object.assign(this.m, this.fxOf(this.worn));
        if (typeof CharacterRig !== 'undefined') {                  // paleta antiga (piloto de bicicleta/moto)
            const V = CharacterRig.VARIANTS || (CharacterRig.VARIANTS = CharacterRig._buildVariants()), skin = V[0].skin, cols = {};
            for (const slot of ['shoes', 'top', 'legs']) {
                const it = this.ITEMS[this.worn[slot] || this.DEFAULT[slot]];
                if (it && it.col) for (const [k, c] of Object.entries(it.col)) cols[k] = c === 'skin' ? skin : c;
            }
            if (typeof NpcData !== 'undefined' && NpcData.ok) {        // a cor tingida também no piloto
                const P = NpcData.PAL, s = this.lookSpec(), base = (n) => P[n] && P[n][2];
                if (this.tint.top && base(s.top_color)) cols.shirt = cols.sleeve = base(s.top_color);
                if (this.tint.legs && base(s.bottom_color)) cols.pants = base(s.bottom_color);
                if (this.tint.shoes && base(s.shoe_color)) cols.shoes = base(s.shoe_color);
                if (base(s.skin)) cols.skin = base(s.skin);
                if (base(s.hair_color)) cols.hair = base(s.hair_color);
            }
            CharacterRig.setColors(0, cols);
        }
        if (typeof PlayerLook !== 'undefined') PlayerLook.sync();
    },

    // Veste uma peça que já é sua (de graça). Acessório já vestido = tira.
    wear(id) {
        const it = this.ITEMS[id];
        if (!it || !this.owned.has(id)) return { ok: false, msg: 'Você não tem essa peça' };
        if (this.worn[it.slot] === id) {
            const def = this.DEFAULT[it.slot];
            if (def === id) return { ok: false, msg: 'Você já está vestindo isso' };
            if (def) this.worn[it.slot] = def; else delete this.worn[it.slot];      // (calçado/roupa: volta à peça de sempre)
            delete this.tint[it.slot];
            this.apply();
            return { ok: true, msg: `Tirou: ${it.name}` };
        }
        this.worn[it.slot] = id;
        delete this.tint[it.slot];                                   // peça nova: com a cor dela
        this.apply();
        return { ok: true, msg: `Vestiu: ${it.name}` };
    },

    // Tinge a peça vestida num encaixe (de graça). color = nome da paleta, ou null = a cor original.
    setTint(slot, color) {
        if (color) this.tint[slot] = color; else delete this.tint[slot];
        this.apply();
        return { ok: true, msg: color ? 'Cor trocada' : 'Cor original' };
    },

    // Muda a aparência (pele, cabelo, barba, corpo).
    setAppearance(field, value) {
        this.appearance[field] = value;
        this.apply();
        return { ok: true, msg: 'Visual atualizado' };
    },

    // Compra (Economy.buy cobra) e já veste.
    give(id) { this.owned.add(id); return this.wear(id); },

    // Joga a peça fora (some do guarda-roupa). As peças de sempre (DEFAULT) não saem; se estava vestida, volta a de sempre.
    discard(id) {
        const it = this.ITEMS[id];
        if (!it || !this.owned.has(id)) return { ok: false, msg: 'Você não tem essa peça' };
        if (this.DEFAULT[it.slot] === id) return { ok: false, msg: 'Essa é a roupa de sempre: não dá para jogar fora' };
        if (this.worn[it.slot] === id) { if (this.DEFAULT[it.slot]) this.worn[it.slot] = this.DEFAULT[it.slot]; else delete this.worn[it.slot]; delete this.tint[it.slot]; }
        this.owned.delete(id);
        this.apply();
        return { ok: true, msg: `Descartou: ${it.name}` };
    },

    // Texto curto dos efeitos somados (menu).
    summary() {
        const m = this.m, p = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`, out = [];
        if (m.sprint) out.push(`corrida ${p(m.sprint)}`); if (m.walk) out.push(`andar ${p(m.walk)}`);
        if (m.stamina) out.push(`cansaço ${p(-m.stamina)}`); if (m.staminaMax) out.push(`fôlego +${m.staminaMax}`); if (m.regen) out.push(`recuperação ${p(m.regen)}`);
        if (m.carry) out.push(`carga ${p(m.carry)}`); if (m.dmgTaken) out.push(`dano recebido ${p(-m.dmgTaken)}`); if (m.melee) out.push(`corpo a corpo ${p(m.melee)}`);
        if (m.sight) out.push(`reconhecimento ${p(-m.sight)}`); if (m.lose) out.push(`perder a polícia ${p(m.lose)}`);
        if (m.price) out.push(`preços ${p(-m.price)}`); if (m.favela) out.push(`preços na favela ${p(-m.favela)}`); if (m.fence) out.push(`receptador ${p(m.fence)}`);
        return out.join(' · ') || 'sem efeitos';
    },

    serialize() { return { v: this.LOOK_VERSION, owned: [...this.owned], worn: Object.assign({}, this.worn), appearance: Object.assign({}, this.appearance), tint: Object.assign({}, this.tint) }; },
    load(s) {
        this.owned = new Set(Object.values(this.DEFAULT));
        this.worn = Object.assign({}, this.DEFAULT);
        this.appearance = {};
        this.tint = {};
        if (s) {
            for (const id of s.owned || []) if (this.ITEMS[id]) this.owned.add(id);
            for (const [slot, id] of Object.entries(s.worn || {})) if (this.ITEMS[id] && this.owned.has(id) && this.ITEMS[id].slot === slot) this.worn[slot] = id;
            for (const [k, v] of Object.entries(s.appearance || {})) if (this.APPEARANCE[k] && this.APPEARANCE[k].some(([o]) => o === v)) this.appearance[k] = v;
            for (const [k, v] of Object.entries(s.tint || {})) if (this.TINT_FIELD[k] && typeof v === 'string') this.tint[k] = v;
            if ((s.v || 1) < 2) this._fromLook1(s);
        }
        this.apply();
    },
    // Save do visual antigo: a jaqueta laranja e o jeans eram as peças de sempre (vêm no guarda-roupa, agora à venda). Quem nunca mexeu
    // no visual (as duas vestidas, sem tingir) passa ao visual de sempre de agora; quem escolheu a aparência continua com a dele.
    _fromLook1(s) {
        this.owned.add('jaqueta_laranja'); this.owned.add('calca_jeans');
        const worn = s.worn || {}, untouched = (worn.top || 'jaqueta_laranja') === 'jaqueta_laranja' && (worn.legs || 'calca_jeans') === 'calca_jeans' && !this.tint.top && !this.tint.legs;
        if (untouched) { this.worn.top = this.DEFAULT.top; this.worn.legs = this.DEFAULT.legs; }
        else for (const [field, old] of [['skin', 'pele_pessego'], ['hair', 'spiky'], ['hair_color', 'castanho']]) if (!this.appearance[field]) this.appearance[field] = old;
    },
};
