// ============================================================================
// Physique — o FÍSICO do personagem: gordura, massa muscular e saciedade, que mudam com o que ele faz e mudam o corpo (o desenho) e o
// desempenho. Começa NORMAL.
//   • Comer: pode comer quanto quiser, mesmo sem fome. Cada refeição enche a SACIEDADE (fed 0..100); o que passa de cheio vira
//     GORDURA. Comer demais por uns dias = GORDO: mais lento, menos fôlego e cansa mais correndo.
//   • Não comer: a saciedade cai ~100 por dia de jogo (12 min reais); vazia, o corpo queima a gordura e, sem gordura, os músculos.
//     Dias sem comer = MUITO MAGRO (sem desmaio nem dano): perde força (carga, golpes, academia).
//   • Treinar (academia: rosca direta, supino, agachamento — minigames/Gym.js) e comer regularmente = FORTE: mais força, um pouco mais
//     rápido e mais fôlego. O ganho é GRADUAL: cada exercício tem séries limitadas por dia, treinar com fome rende pouco e quem para de
//     treinar perde músculo devagar. Correr gasta a comida (e depois a gordura) e treina o fôlego (Bags.fitLevel).
// Forma do corpo (o desenho do jogador, PlayerLook): magro · normal · forte · gordo (com folga entre elas: não fica trocando).
// Atributos (menu de status): FORÇA 0–100 (músculo + a força de carregar peso, Bags.str), FÔLEGO, VELOCIDADE e o próprio físico.
// ============================================================================

const Physique = {
    fat: 30,            // gordura 0..100 (normal ~20–45; ≥ 62 gordo; ≤ 12 magro; ≤ 6 muito magro)
    muscle: 25,         // massa muscular 0..100 (normal ~15–40; ≥ 55 forte)
    fed: 70,            // saciedade 0..100 (0 = faminto)
    shape: 'normal',    // forma em uso: 'slim' | 'normal' | 'muscular' | 'heavy'
    lastTrain: -1e9,    // hora absoluta (dia × 24 + hora) do último treino
    day: -1, sets: {},  // séries feitas hoje por exercício (zera na virada do dia)
    gainToday: 0,       // músculo ganho hoje (o rendimento cai depois de GAIN_SOFT)
    passUntil: -1e9,    // hora absoluta até a qual a academia está paga (diária/semana/mensalidade)
    protein: 0,         // whey/barra de proteína: o próximo treino rende mais (gasta ao treinar)
    SETS_PER_DAY: 3,    // séries por exercício por dia
    GAIN_SOFT: 4,       // músculo/dia a partir do qual o treino rende cada vez menos
    SHAPE_NAME: { slim: 'Magro', normal: 'Normal', muscular: 'Forte', heavy: 'Gordo' },

    _c(v, a = 0, b = 1) { return v < a ? a : v > b ? b : v; },
    game: null,         // o Game (ligado no começo: Game → Physique.game)
    get g() { return this.game; },
    _now(g) { return (typeof Economy !== 'undefined' ? Economy.day : 0) * 24 + (g && g.dayNight ? g.dayNight.hour : 0); },

    // ------------------------------------------------------------------ comer
    // kcal ≈ a vida que a comida recupera (Economy.ITEMS.heal / Inventory.HEAL). Devolve um texto curto sobre o efeito (ou '').
    eat(kcal) {
        const add = kcal * 0.9, room = 100 - this.fed;
        this.fed = Math.min(100, this.fed + add);
        const extra = Math.max(0, add - room);
        if (extra > 0) this.fat = Math.min(100, this.fat + extra * 0.12);         // comeu além de cheio: vira gordura
        this._check();
        return extra > 0 ? ' · já estava cheio (engorda)' : (this.fed >= 95 ? ' · satisfeito' : '');
    },

    // ------------------------------------------------------------------ por quadro (horas de jogo)
    update(dt, g) {
        const now = this._now(g);
        if (this._t == null) { this._t = now; this.day = Math.floor(now / 24); }
        let h = now - this._t;
        this._t = now;
        if (h < 0) h = 0;                                                         // (relógio voltou — sono/save): ignora
        if (h > 0.5) h = Math.min(h, 72);                                         // dormiu/esperou horas: aplica de uma vez (até 3 dias)
        const day = Math.floor(now / 24);
        if (day !== this.day) { this.day = day; this.sets = {}; this.gainToday = 0; }
        // correndo gasta comida (e, sem comida, gordura): o sprint inteiro; o trote (o passo padrão), um pouco
        const pl = g && g.player;
        const run = pl && g.mode === 'player' ? (pl.state === 'sprint' ? dt : pl.state === 'jog' ? dt * 0.25 : 0) : 0;
        this._tick(h, run);
    },
    _tick(h, run = 0) {
        // metabolismo: ~100 de saciedade por dia; correr gasta ~0,35/s
        let burn = 4.2 * h + 0.35 * run;
        const useFed = Math.min(this.fed, burn);
        this.fed -= useFed; burn -= useFed;
        if (burn > 0 || this.fed <= 0) {                                          // faminto: queima gordura (1/h) e, sem gordura, músculo
            const fh = h * 1.0 + burn * 0.25;
            const fromFat = Math.min(this.fat, fh);
            this.fat -= fromFat;
            if (fh - fromFat > 0 || this.fat < 4) this.muscle = Math.max(5, this.muscle - (fh - fromFat) * 0.5 - h * 0.12);
        } else {
            // comendo direito: a gordura volta devagar ao normal (de cima e de baixo)
            if (this.fed > 20 && this.fed < 80 && this.fat > 32) this.fat -= 0.08 * h;
            if (this.fed > 35 && this.fat < 22) this.fat += 0.12 * h;
            if (this.fed >= 80 && this.fat < 100) this.fat += 0.05 * h;            // sempre empanturrado: sobe devagar
        }
        // destreino: sem academia há 2 dias, o músculo acima do normal some devagar (~0,7/dia)
        const g = this.g, now = g ? this._now(g) : 0;
        if (this.muscle > 25 && now - this.lastTrain > 48) this.muscle = Math.max(25, this.muscle - 0.03 * h);
        this.fat = this._c(this.fat, 0, 100); this.muscle = this._c(this.muscle, 5, 100);
        this._check();
    },

    // ------------------------------------------------------------------ treino (academia)
    setsLeft(ex) { return Math.max(0, this.SETS_PER_DAY - (this.sets[ex] || 0)); },
    // Academia paga? Compra mais `days` dias (a diária vale até a meia-noite). Devolve o texto "até o dia N".
    hasPass() { const g = this.g; return !!g && this.passUntil > this._now(g); },
    addPass(days) {
        const g = this.g, now = g ? this._now(g) : 0, end = days === 1 ? (Math.floor(now / 24) + 1) * 24 : Math.max(now, this.passUntil) + days * 24;
        this.passUntil = Math.max(this.passUntil, end);
        const d = Math.floor((this.passUntil - 0.01) / 24);
        return days === 1 ? 'o fim do dia' : `o dia ${d}`;
    },
    // Uma repetição boa com carga relativa r (peso ÷ o máximo que ele levanta): estímulo máximo em 70–95%; leve demais quase não conta.
    repGain(r) {
        const stim = r < 0.3 ? 0.15 : r < 0.7 ? 0.15 + (r - 0.3) / 0.4 * 0.85 : r <= 0.95 ? 1 : 0.85;
        const fedK = this.fed < 15 ? 0.3 : this.fed < 35 ? 0.7 : 1;               // treinar com fome rende pouco
        const soft = this.gainToday < this.GAIN_SOFT ? 1 : Math.max(0.15, 1 - (this.gainToday - this.GAIN_SOFT) / 4);
        const room = 1 - this.muscle / 110;                                       // quanto mais forte, mais devagar cresce
        const prot = this.protein > 0 ? 1.25 : 1;                                 // tomou whey: +25%
        return 0.075 * stim * fedK * soft * room * prot;
    },
    addMuscle(m) {
        this.muscle = Math.min(100, this.muscle + m);
        this.gainToday += m;
        const g = this.g; if (g) this.lastTrain = this._now(g);
        this.fed = Math.max(0, this.fed - m * 2);                                 // treinar dá fome
        this._check();
    },
    doneSet(ex) { this.sets[ex] = (this.sets[ex] || 0) + 1; this.protein = Math.max(0, this.protein - 0.34); },

    // ------------------------------------------------------------------ atributos e efeitos
    // FORÇA 0..100: massa muscular + a força de carregar peso (Bags.str), menos a fraqueza de quem está muito magro ou faminto.
    strength(pl) {
        const str = typeof Bags !== 'undefined' && pl ? Bags.strLevel(pl.str) : 0;
        let s = this.muscle * 0.85 + str * 0.75;
        if (this.fat < 12) s *= 1 - 0.4 * (12 - this.fat) / 12;
        if (this.fed <= 0) s *= 0.9;
        return this._c(s, 0, 100);
    },
    get heavyK() { return this._c((this.fat - 45) / 45); },                       // 0 (normal) … 1 (muito gordo)
    get muscleK() { return this._c((this.muscle - 25) / 75); },                   // 0 (normal) … 1 (no máximo)
    // Velocidade (andar e correr): gordo mais lento; forte um pouco mais rápido; muito magro, fraco.
    speedMul() { return (1 - 0.32 * this.heavyK) * (1 + 0.07 * this.muscleK) * (this.fat < 6 ? 0.94 : 1); },
    staminaMaxMul() { return (1 - 0.35 * this.heavyK) * (1 + 0.12 * this.muscleK) * (this.fat < 6 ? 0.85 : 1); },
    staminaDrainMul() { return (1 + 0.7 * this.heavyK) * (this.fat < 6 ? 1.2 : 1); },
    // Carga confortável extra (somada às outras) e dano corpo a corpo, pela FORÇA (normal ~20 = nada a mais).
    carryBonus(pl) { return Math.max(-0.3, (this.strength(pl) - 20) * 0.01); },
    meleeMul(pl) { return this._c(0.8 + this.strength(pl) / 100, 0.6, 1.8); },
    // Máximo (kg) que ele aguenta em cada exercício (a carga de cada série é comparada a isto).
    maxLift(ex, pl) {
        const S = this.strength(pl);
        return ex === 'curl' ? 6 + 0.44 * S : ex === 'bench' ? 25 + 1.25 * S : 35 + 1.65 * S;
    },

    // Rótulo do físico para a interface.
    label() {
        if (this.fat >= 80) return 'Obeso';
        if (this.shape === 'heavy') return 'Gordo';
        if (this.fat <= 6) return 'Muito magro';
        if (this.shape === 'slim') return 'Magro';
        if (this.shape === 'muscular') return this.muscle >= 80 ? 'Musculoso' : 'Forte';
        return 'Normal';
    },
    hungerLabel() { return this.fed <= 0 ? 'Faminto' : this.fed < 25 ? 'Com fome' : this.fed < 75 ? 'Alimentado' : this.fed < 98 ? 'Satisfeito' : 'Empanturrado'; },

    // Forma do desenho a partir de gordura e músculo — com folga de 3 pontos para não ficar trocando na fronteira.
    _want() {
        const s = this.shape, m = (v, lim, inside) => (inside ? v >= lim - 3 : v >= lim + 0);
        if (m(this.fat, 62, s === 'heavy')) return 'heavy';
        if (s === 'slim' ? this.fat <= 15 : this.fat <= 12) return 'slim';
        if (m(this.muscle, 55, s === 'muscular')) return 'muscular';
        return 'normal';
    },
    _check() {
        const w = this._want();
        if (w === this.shape) return;
        const was = this.shape;
        this.shape = w;
        const g = this.g;
        if (g && g._flash && this._loaded) {
            const msg = { heavy: '🍔 Você ENGORDOU: mais lento e cansa mais rápido', slim: '🦴 Você está MAGRO: perdeu força — coma alguma coisa', muscular: '💪 Você ficou FORTE: mais força, fôlego e um pouco mais rápido', normal: was === 'heavy' ? '✅ Você emagreceu: físico normal de novo' : was === 'slim' ? '✅ Você recuperou o peso: físico normal' : 'Você perdeu músculo: físico normal' }[w];
            g._flash(msg);
        }
        if (typeof PlayerLook !== 'undefined' && PlayerLook.game) PlayerLook.sync();      // o desenho do corpo muda
    },

    // Ajuste direto (menu de desenvolvedor).
    set(fat, muscle, fed = this.fed) { this.fat = this._c(fat, 0, 100); this.muscle = this._c(muscle, 5, 100); this.fed = this._c(fed, 0, 100); this._check(); },

    serialize() { return { fat: this.fat, muscle: this.muscle, fed: this.fed, lastTrain: this.lastTrain, day: this.day, sets: this.sets, gainToday: this.gainToday, passUntil: this.passUntil, protein: this.protein }; },
    load(s) {
        this._loaded = false;
        if (s) { this.fat = s.fat ?? 30; this.muscle = s.muscle ?? 25; this.fed = s.fed ?? 70; this.lastTrain = s.lastTrain ?? -1e9; this.day = s.day ?? -1; this.sets = s.sets || {}; this.gainToday = s.gainToday || 0; this.passUntil = s.passUntil ?? -1e9; this.protein = s.protein || 0; }
        else { this.fat = 30; this.muscle = 25; this.fed = 70; this.lastTrain = -1e9; this.day = -1; this.sets = {}; this.gainToday = 0; this.passUntil = -1e9; this.protein = 0; }
        this._t = null;
        this.shape = 'normal'; this._check();
        this._loaded = true;
    },
};
