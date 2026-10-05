// ============================================================================
// Outfit — roupas e acessórios do jogador: compram-se na BOUTIQUE (loja de roupas do shopping/comércio, Economy 'clothes') e mudam o
// visual E o personagem.
//
//   • Partes: tênis (shoes), parte de cima (top), calça (legs) e acessórios (óculos, relógio, luvas, corrente). Uma peça por parte.
//   • Visual: tênis, parte de cima e calça trocam as cores do jogador na paleta (CharacterRig.setColors): o sprite muda na hora, em
//     todas as animações (não precisa gerar atlas). Regata = braços à mostra; camiseta = antebraço à mostra.
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
    SLOTS: ['shoes', 'top', 'legs', 'eyes', 'wrist', 'hands', 'neck'],
    SLOT_NAME: { shoes: 'Calçado', top: 'Parte de cima', legs: 'Calça', eyes: 'Óculos', wrist: 'Pulso', hands: 'Mãos', neck: 'Pescoço' },

    // base = preço (R$) antes dos fatores da loja; col = cores na paleta do jogador; fx = efeitos (ver o cabeçalho)
    ITEMS: {
        // ---- calçados
        tenis_branco:   { slot: 'shoes', name: 'Tênis branco', base: 0, col: { shoes: '#f0f0f4' }, fx: {}, desc: 'O de sempre' },
        chinelo:        { slot: 'shoes', name: 'Chinelo de dedo', base: 25, col: { shoes: '#2f7fd0' }, fx: { walk: -0.04, favela: 0.05 }, desc: 'Estilo do morro: −5% nos preços da favela, anda um pouco mais devagar' },
        tenis_corrida:  { slot: 'shoes', name: 'Tênis de corrida', base: 480, col: { shoes: '#2fd07a' }, fx: { sprint: 0.12, stamina: 0.2 }, desc: 'Corre 12% mais rápido e cansa 20% menos' },
        tenis_basquete: { slot: 'shoes', name: 'Tênis de basquete', base: 950, col: { shoes: '#e03a3a' }, fx: { sprint: 0.07, stamina: 0.1, melee: 0.1 }, desc: 'Corre 7% mais rápido; chute 10% mais forte' },
        coturno:        { slot: 'shoes', name: 'Coturno tático', base: 650, col: { shoes: '#2a2820' }, fx: { melee: 0.25, dmgTaken: 0.04, sprint: -0.03 }, desc: 'Chute e pancada 25% mais fortes, −4% de dano; mais pesado' },
        sapato_social:  { slot: 'shoes', name: 'Sapato social', base: 700, col: { shoes: '#1c1410' }, fx: { price: 0.03, sprint: -0.04 }, desc: '−3% no comércio (combina com o terno); ruim para correr' },
        // ---- parte de cima
        jaqueta_laranja: { slot: 'top', name: 'Jaqueta laranja', base: 0, col: { shirt: '#e8742c', sleeve: '#e8742c', forearm: 'skin' }, fx: {}, desc: 'A de sempre' },
        camiseta_branca: { slot: 'top', name: 'Camiseta branca', base: 40, col: { shirt: '#eceae4', sleeve: '#eceae4', forearm: 'skin' }, fx: {}, desc: 'Básica' },
        regata_academia: { slot: 'top', name: 'Regata de academia', base: 90, col: { shirt: '#1f1f24', sleeve: 'skin', forearm: 'skin' }, fx: { regen: 0.35, staminaMax: 20 }, desc: '+20 de fôlego máximo e recupera 35% mais rápido' },
        camisa_time:     { slot: 'top', name: 'Camisa de time', base: 250, col: { shirt: '#f2d22c', sleeve: '#1f8a45', forearm: 'skin' }, fx: { favela: 0.08 }, desc: 'Respeito na quebrada: −8% nos preços da favela' },
        moletom_capuz:   { slot: 'top', name: 'Moletom com capuz', base: 220, col: { shirt: '#3a3d46', sleeve: '#3a3d46', forearm: '#3a3d46' }, fx: { sight: 0.12, lose: 0.08 }, desc: 'A polícia te reconhece 12% mais de perto e perde o rastro mais rápido' },
        jaqueta_couro:   { slot: 'top', name: 'Jaqueta de couro', base: 1200, col: { shirt: '#2e1c14', sleeve: '#2e1c14', forearm: '#2e1c14' }, fx: { dmgTaken: 0.1 }, desc: '10% menos dano (bala, soco, queda)' },
        colete_carga:    { slot: 'top', name: 'Colete de carga', base: 1600, col: { shirt: '#4a5034', sleeve: '#2a2c30', forearm: 'skin' }, fx: { carry: 0.2 }, desc: 'Bolsos e alças: carrega 20% mais peso sem pesar' },
        terno:           { slot: 'top', name: 'Terno', base: 2800, col: { shirt: '#22252e', sleeve: '#22252e', forearm: '#22252e' }, fx: { price: 0.08, fence: 0.1, sight: 0.05 }, desc: '−8% no comércio, receptador paga 10% mais, chama menos atenção' },
        // ---- calças
        calca_jeans:   { slot: 'legs', name: 'Calça jeans escura', base: 0, col: { pants: '#2a2f45' }, fx: {}, desc: 'A de sempre' },
        bermuda:       { slot: 'legs', name: 'Bermuda tactel', base: 60, col: { pants: '#5a7a9a' }, fx: { walk: 0.03 }, desc: 'Leve: anda 3% mais rápido' },
        calca_moletom: { slot: 'legs', name: 'Calça de moletom', base: 150, col: { pants: '#30323a' }, fx: { sprint: 0.04, stamina: 0.05 }, desc: 'Corre 4% mais rápido' },
        calca_cargo:   { slot: 'legs', name: 'Calça cargo', base: 320, col: { pants: '#55603e' }, fx: { carry: 0.15 }, desc: 'Bolsos fundos: carrega 15% mais peso sem pesar' },
        calca_social:  { slot: 'legs', name: 'Calça social', base: 600, col: { pants: '#1c1e26' }, fx: { price: 0.03 }, desc: '−3% no comércio' },
        // ---- acessórios
        oculos_escuros: { slot: 'eyes', name: 'Óculos escuros', base: 180, fx: { sight: 0.08 }, desc: 'A polícia te reconhece 8% mais de perto' },
        relogio_ouro:   { slot: 'wrist', name: 'Relógio de ouro', base: 5500, fx: { fence: 0.12, price: 0.02 }, desc: 'Status: receptador paga 12% mais' },
        luvas:          { slot: 'hands', name: 'Luvas de couro', base: 120, fx: { lose: 0.08, melee: 0.05 }, desc: 'Sem digitais: a polícia perde o rastro mais rápido' },
        corrente_ouro:  { slot: 'neck', name: 'Corrente de ouro', base: 3200, fx: { favela: 0.1 }, desc: 'Respeito no morro: −10% nos preços da favela' },
    },
    DEFAULT: { shoes: 'tenis_branco', top: 'jaqueta_laranja', legs: 'calca_jeans' },

    owned: new Set(['tenis_branco', 'jaqueta_laranja', 'calca_jeans']),
    worn: { shoes: 'tenis_branco', top: 'jaqueta_laranja', legs: 'calca_jeans' },
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

    // Soma os efeitos e pinta o jogador. Chamado ao vestir, ao carregar o jogo e quando a paleta fica pronta.
    apply() {
        Object.assign(this.m, this.fxOf(this.worn));
        if (typeof CharacterRig === 'undefined') return;
        const V = CharacterRig.VARIANTS || (CharacterRig.VARIANTS = CharacterRig._buildVariants()), skin = V[0].skin, cols = {};
        for (const slot of ['shoes', 'top', 'legs']) {
            const it = this.ITEMS[this.worn[slot] || this.DEFAULT[slot]];
            if (it && it.col) for (const [k, c] of Object.entries(it.col)) cols[k] = c === 'skin' ? skin : c;
        }
        CharacterRig.setColors(0, cols);
    },

    // Veste uma peça que já é sua (de graça). Acessório já vestido = tira.
    wear(id) {
        const it = this.ITEMS[id];
        if (!it || !this.owned.has(id)) return { ok: false, msg: 'Você não tem essa peça' };
        if (this.worn[it.slot] === id) {
            const def = this.DEFAULT[it.slot];
            if (def === id) return { ok: false, msg: 'Você já está vestindo isso' };
            if (def) this.worn[it.slot] = def; else delete this.worn[it.slot];      // (calçado/roupa: volta à peça de sempre)
            this.apply();
            return { ok: true, msg: `Tirou: ${it.name}` };
        }
        this.worn[it.slot] = id;
        this.apply();
        return { ok: true, msg: `Vestiu: ${it.name}` };
    },

    // Compra (Economy.buy cobra) e já veste.
    give(id) { this.owned.add(id); return this.wear(id); },

    // Joga a peça fora (some do guarda-roupa). As peças de sempre (DEFAULT) não saem; se estava vestida, volta a de sempre.
    discard(id) {
        const it = this.ITEMS[id];
        if (!it || !this.owned.has(id)) return { ok: false, msg: 'Você não tem essa peça' };
        if (this.DEFAULT[it.slot] === id) return { ok: false, msg: 'Essa é a roupa de sempre: não dá para jogar fora' };
        if (this.worn[it.slot] === id) { if (this.DEFAULT[it.slot]) this.worn[it.slot] = this.DEFAULT[it.slot]; else delete this.worn[it.slot]; }
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

    serialize() { return { owned: [...this.owned], worn: Object.assign({}, this.worn) }; },
    load(s) {
        this.owned = new Set(['tenis_branco', 'jaqueta_laranja', 'calca_jeans']);
        this.worn = Object.assign({}, this.DEFAULT);
        if (s) {
            for (const id of s.owned || []) if (this.ITEMS[id]) this.owned.add(id);
            for (const [slot, id] of Object.entries(s.worn || {})) if (this.ITEMS[id] && this.owned.has(id) && this.ITEMS[id].slot === slot) this.worn[slot] = id;
        }
        this.apply();
    },
};
