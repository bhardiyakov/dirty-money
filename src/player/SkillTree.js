// ============================================================================
// SkillTree — o NÍVEL DO PERSONAGEM e a ÁRVORE DE HABILIDADES (sub-aba HABILIDADES da aba CARREIRAS).
//   • XP do personagem vem de TUDO: trabalhos das carreiras, missões do morro, metas, furtos, carros roubados, fugas da polícia.
//   • Nível sem teto: a curva cresce (200 × (nível−1)^1,8 de XP acumulado) — o nível 100 pede ~780 mil XP. 1 ponto por nível.
//   • 6 ramos (Físico, Combate, Sombra, Volante, Negócios, Malandragem), 6 habilidades cada, em 4 camadas: cada camada pede nível
//     mínimo do personagem e uma habilidade anterior do ramo; camadas altas custam mais pontos por grau.
//   • PRESTÍGIO (nível 25+): grau infinito, +1% de pagamento e de XP por grau — sempre há onde gastar pontos.
// Os efeitos ficam em SkillTree.m (somas por efeito), lidos direto pelos sistemas do jogo (player, combate, polícia, veículos,
// economia, carreiras). Também guarda a NOTORIEDADE: quanto mais alto o nível, mais a polícia vê e mais demora para despistar —
// e mais os trabalhos pagam (o jogo fica difícil e nunca para de subir).
// ============================================================================

class SkillTree {
    static get BRANCHES() {
        return {
            fisico: { name: 'FÍSICO', icon: '💪', color: '#ff6a8a' },
            combate: { name: 'COMBATE', icon: '🎯', color: '#ff9a3a' },
            sombra: { name: 'SOMBRA', icon: '🌑', color: '#9a7aff' },
            volante: { name: 'VOLANTE', icon: '🏎', color: '#35e0ff' },
            negocios: { name: 'NEGÓCIOS', icon: '💼', color: '#5ac07a' },
            malandragem: { name: 'MALANDRAGEM', icon: '🎲', color: '#ffd23a' },
        };
    }

    // [id, ramo, camada (1..4), graus, efeito, valor por grau, nome, descrição, pré-requisito [id, grau] | null]
    static get NODES() {
        return [
            ['folego', 'fisico', 1, 3, 'sprint', 0.05, 'Fôlego', '+5% de velocidade correndo', null],
            ['couro', 'fisico', 1, 3, 'hp', 12, 'Couro grosso', '+12 de vida máxima', null],
            ['recup', 'fisico', 2, 2, 'regen', 0.15, 'Recuperação', 'regenera sozinho até +15% de vida a mais', ['couro', 1]],
            ['sanguefrio', 'fisico', 2, 3, 'dmgTaken', 0.06, 'Sangue frio', '−6% de dano recebido', ['couro', 2]],
            ['nadador', 'fisico', 3, 2, 'swim', 0.15, 'Nadador', '+15% de velocidade na água', ['folego', 2]],
            ['corpofechado', 'fisico', 4, 1, 'secondWind', 1, 'Corpo fechado', '1 vez por dia, ao zerar a vida, você levanta com 30%', ['sanguefrio', 3]],

            ['punho', 'combate', 1, 3, 'melee', 0.15, 'Punho de ferro', '+15% de dano corpo a corpo', null],
            ['mira', 'combate', 1, 3, 'spread', 0.12, 'Mão firme', '−12% de dispersão dos tiros', null],
            ['recarga', 'combate', 2, 3, 'reload', 0.15, 'Recarga rápida', '−15% no tempo de recarga', ['mira', 1]],
            ['calibre', 'combate', 2, 3, 'gunDmg', 0.08, 'Calibre certo', '+8% de dano das armas de fogo', ['mira', 2]],
            ['colete', 'combate', 3, 1, 'vest', 0.12, 'Colete ajustado', 'o colete absorve 87% do dano (era 75%)', ['calibre', 2]],
            ['olhos', 'combate', 4, 2, 'crit', 0.1, 'Sangue nos olhos', '10% de chance de tiro crítico (dano dobrado)', ['recarga', 3]],

            ['maoleve', 'sombra', 1, 3, 'theft', 0.07, 'Mão leve', '+7% de chance de furto', null],
            ['discreto', 'sombra', 1, 3, 'sight', 0.06, 'Discreto', 'a polícia enxerga 6% mais perto', null],
            ['fuga', 'sombra', 2, 3, 'lose', 0.1, 'Fuga rápida', '−10% no tempo para despistar a polícia', ['discreto', 1]],
            ['gazua', 'sombra', 2, 3, 'lockpick', 0.06, 'Gazua', 'fechaduras 6% mais fáceis (carros, lojas, caixa de força)', ['maoleve', 1]],
            ['fantasma', 'sombra', 3, 2, 'noise', 0.15, 'Fantasma', '−15% de barulho nas invasões', ['fuga', 2]],
            ['sumir', 'sombra', 4, 1, 'hideAlways', 1, 'Sumir no mapa', 'esconderijos funcionam mesmo se a polícia viu você entrar', ['fantasma', 2]],

            ['ignicao', 'volante', 1, 3, 'hotwire', 0.3, 'Ignição', '−0,3 s de ligação direta', null],
            ['piloto', 'volante', 1, 3, 'grip', 0.05, 'Piloto', '+5% de aderência ao volante', null],
            ['lataria', 'volante', 2, 3, 'carDmg', 0.1, 'Lataria', '−10% de dano no carro que você dirige', ['piloto', 1]],
            ['peleve', 'volante', 2, 2, 'fuel', 0.15, 'Pé leve', '−15% de gasolina', ['ignicao', 1]],
            ['fugitivo', 'volante', 3, 2, 'carLose', 0.1, 'Fugitivo', 'ao volante, despista a polícia 10% mais rápido', ['lataria', 2]],
            ['preparador', 'volante', 4, 1, 'topSpeed', 0.1, 'Preparador', '+10% de velocidade máxima no carro que você dirige', ['fugitivo', 1]],

            ['pechincha', 'negocios', 1, 3, 'price', 0.05, 'Pechincha', '−5% nos preços das lojas', null],
            ['contador', 'negocios', 1, 3, 'launder', 0.02, 'Contador', '−2 pontos de perda na lavagem', null],
            ['receptador', 'negocios', 2, 3, 'fence', 0.1, 'Receptador amigo', '+10% na venda de joias e mercadoria', ['pechincha', 1]],
            ['investidor', 'negocios', 2, 3, 'income', 0.08, 'Investidor', '+8% nas rendas diárias (fachadas, desmanches, bancas)', ['contador', 1]],
            ['laranjas', 'negocios', 3, 2, 'taxHeat', 0.15, 'Laranjas', '−15% de Receita e suspeita', ['investidor', 2]],
            ['magnata', 'negocios', 4, 1, 'jobPay', 0.08, 'Magnata', '+8% em todo pagamento de trabalho', ['laranjas', 2]],

            ['labia', 'malandragem', 1, 3, 'labia', 0.08, 'Lábia', '+8% no Tribunal e +3% nos golpes', null],
            ['conhecido', 'malandragem', 1, 3, 'moral', 0.15, 'Conhecido na quebrada', '+15% nos ganhos de moral', null],
            ['advogado', 'malandragem', 2, 3, 'fine', 0.15, 'Advogado', '−15% na multa da prisão', ['labia', 1]],
            ['plano', 'malandragem', 2, 3, 'hospital', 0.15, 'Plano de saúde', '−15% na conta do hospital', ['conhecido', 1]],
            ['contatos', 'malandragem', 3, 3, 'jobPay', 0.05, 'Rede de contatos', '+5% no pagamento de trabalhos', ['conhecido', 2]],
            ['lenda', 'malandragem', 4, 2, 'xp', 0.1, 'Lenda do crime', '+10% de XP em tudo', ['contatos', 2]],
        ].map(([id, branch, tier, max, eff, val, name, desc, req]) => ({ id, branch, tier, max, eff, val, name, desc, req }));
    }

    static tierLevel(t) { return [0, 1, 5, 12, 20][t]; }            // nível mínimo do personagem por camada
    static tierCost(t) { return [0, 1, 1, 2, 3][t]; }               // pontos por grau
    static get PRESTIGE_LEVEL() { return 25; }
    static get PRESTIGE_COST() { return 4; }

    constructor(game) {
        this.g = game;
        SkillTree.instance = this;
        this.xp = 0;
        this.ranks = {};
        this.prestige = 0;
        this.secondWindDay = -1;
        this.byId = {};
        for (const n of SkillTree.NODES) this.byId[n.id] = n;
        this.apply();
    }

    // ---------------------------------------------------------------- nível
    static xpFor(level) { return Math.round(200 * Math.pow(Math.max(0, level - 1), 1.8)); }
    get level() { if (!this._lv) { let L = 1; while (SkillTree.xpFor(L + 1) <= this.xp) L++; this._lv = L; } return this._lv; }
    get spent() { let s = 0; for (const n of SkillTree.NODES) s += (this.ranks[n.id] || 0) * SkillTree.tierCost(n.tier); return s + this.prestige * SkillTree.PRESTIGE_COST; }
    get points() { return (this.level - 1) - this.spent; }

    addXp(n, why = '') {
        n = Math.round(Math.max(0, n) * (1 + (SkillTree.m.xp || 0) + this.prestige * 0.01));
        if (!n) return;
        const L0 = this.level;
        this.xp += n; this._lv = 0;
        const L = this.level;
        if (L > L0) {
            this.g._flash(`⬆ NÍVEL ${L}! +${L - L0} ponto(s) de habilidade — aba CARREIRAS › HABILIDADES (O)${this.notorietyName(L) !== this.notorietyName(L0) ? ` · Notoriedade: ${this.notorietyName(L).toUpperCase()}` : ''}`);
            AudioFX.blip(1200, 0.3, 0.24);
            if (this.g.achievements) this.g.achievements.check();
        }
    }

    // ---------------------------------------------------------------- árvore
    rank(id) { return this.ranks[id] || 0; }
    canBuy(id) {
        const n = this.byId[id];
        if (!n) return 'Habilidade desconhecida';
        if (this.rank(id) >= n.max) return 'Já no máximo';
        if (this.level < SkillTree.tierLevel(n.tier)) return `Precisa do nível ${SkillTree.tierLevel(n.tier)}`;
        if (n.req && this.rank(n.req[0]) < n.req[1]) return `Precisa de ${this.byId[n.req[0]].name} grau ${n.req[1]}`;
        if (this.points < SkillTree.tierCost(n.tier)) return `Faltam pontos (custa ${SkillTree.tierCost(n.tier)})`;
        return null;
    }
    buy(id) {
        const why = this.canBuy(id);
        if (why) return why;
        this.ranks[id] = this.rank(id) + 1;
        this.apply();
        AudioFX.blip(980, 0.15, 0.2);
        if (this.g.achievements) this.g.achievements.check();
        return `${this.byId[id].name} grau ${this.ranks[id]}`;
    }
    buyPrestige() {
        if (this.level < SkillTree.PRESTIGE_LEVEL) return `Prestígio libera no nível ${SkillTree.PRESTIGE_LEVEL}`;
        if (this.points < SkillTree.PRESTIGE_COST) return `Faltam pontos (custa ${SkillTree.PRESTIGE_COST})`;
        this.prestige++;
        this.apply();
        return `Prestígio ${this.prestige}: +${this.prestige}% de pagamento e de XP`;
    }
    get treeDone() { return SkillTree.NODES.every((n) => this.rank(n.id) >= n.max); }
    get ranksTotal() { return SkillTree.NODES.reduce((s, n) => s + n.max, 0); }
    get ranksOwned() { return SkillTree.NODES.reduce((s, n) => s + this.rank(n.id), 0); }

    // Recalcula SkillTree.m e aplica o que é "estado" (vida máxima, aderência via Careers).
    apply() {
        const m = {};
        for (const n of SkillTree.NODES) { const r = this.rank(n.id); if (r) m[n.eff] = (m[n.eff] || 0) + r * n.val; }
        m.jobPay = (m.jobPay || 0) + this.prestige * 0.01;
        SkillTree.m = m;
        const pl = this.g.player;
        if (pl) { const f = pl.hp / pl.maxHp; pl.maxHp = 100 + (m.hp || 0); pl.hp = Math.min(pl.maxHp, Math.max(1, f * pl.maxHp)); }
        if (this.g.careers) this.g.careers.applyMods();
    }

    // Corpo fechado: 1 vez por dia do jogo.
    trySecondWind() {
        if (!SkillTree.m.secondWind || this.secondWindDay === Economy.day) return false;
        this.secondWindDay = Economy.day;
        this.g._flash('🛡 CORPO FECHADO! Você levantou — mas só uma vez por dia');
        return true;
    }

    // ---------------------------------------------------------------- notoriedade (dificuldade que nunca para de subir)
    static get NOTORIETY() { return [[1, 'Desconhecido'], [8, 'Conhecido na área'], [16, 'Nome na rua'], [26, 'Procurado na cidade'], [40, 'Inimigo público'], [60, 'Lenda do crime'], [90, 'Mito']]; }
    notorietyName(L = this.level) { let n = 'Desconhecido'; for (const [lv, name] of SkillTree.NOTORIETY) if (L >= lv) n = name; return n; }
    // A polícia vê mais longe e demora mais a esquecer (até +60%); em troca, tudo paga mais (sem teto).
    get policeMul() { return 1 + Math.min(0.6, (this.level - 1) * 0.012); }
    get payMul() { return 1 + (this.level - 1) * 0.015; }

    serialize() { return { xp: this.xp, ranks: this.ranks, prestige: this.prestige, sw: this.secondWindDay }; }
    load(s) {
        if (!s) return;
        this.xp = s.xp || 0; this._lv = 0; this.ranks = s.ranks || {}; this.prestige = s.prestige || 0; this.secondWindDay = typeof s.sw === 'number' ? s.sw : -1;
        for (const k of Object.keys(this.ranks)) { const n = this.byId[k]; if (!n) delete this.ranks[k]; else this.ranks[k] = Math.max(0, Math.min(n.max, this.ranks[k])); }
        this.apply();
    }
}
SkillTree.m = {};
