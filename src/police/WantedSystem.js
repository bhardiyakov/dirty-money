// ============================================================================
// WantedSystem — wanted level (★) and EVASION. HeatStateMachine (police/HeatStateMachine.js) decides WHEN a crime is a flagrant
// (CrimeExposure, at the exact moment of the crime); this class only keeps the stars and the escape timer of the WANTED state.
//
// Raising the level:
//   - ensureLevel(n): at least n stars (a flagrant, a recognized face, a scripted alarm).
//   - bump(): +1★ only every `escalateEvery` s (a shootout escalates over time, not in 2 seconds).
//   - addStars(): immediate stars for the gravest acts.
// Escaping:
//   - update(dt, seen, hold, rate): with ★, every second WITHOUT any unit seeing the player counts (× rate: faster outside the search
//     area). After the level's `lose` (Config.wanted.levels[n].lose) unseen, the stars drop to 0 ('escape').
//     Being seen resets the count; an officer right next to the player without seeing them (hold) only pauses it.
// Arrest/death also reset it. `onChange(level, previous, reason)` tells the game (messages, reinforcements, HeatStateMachine).
// ============================================================================

class WantedSystem {
    constructor() {
        this.level = 0;
        this.lose = 0;           // segundos seguidos sem ninguém te ver (fuga em andamento).
        this.heatCd = 0;         // tempo até a próxima ★ por crime comum.
        this.rate = 1;           // ritmo atual da fuga (o HUD mostra o tempo que falta nesse ritmo).
        this.hold = false;       // polícia colada: contagem parada.
        this.onChange = null;
    }

    // Configuração do nível atual (null sem ★).
    get cfg() { return Config.wanted.levels[this.level] || null; }

    // Segundos sem ser visto para fugir no nível atual (notoriedade e habilidades mexem).
    get need() { return this.cfg ? this.cfg.lose * (this.loseMul || 1) : 0; }

    // Fração da fuga concluída (0..1) e segundos que faltam no ritmo atual.
    get escape() { return this.cfg ? Math.min(1, this.lose / this.need) : 0; }
    get left() { return this.cfg ? Math.max(0, (this.need - this.lose) / Math.max(0.2, this.rate)) : 0; }

    _set(n, why) {
        n = Math.max(0, Math.min(Config.wanted.maxLevel, n));
        if (n === this.level) return;
        const prev = this.level;
        this.level = n;
        this.lose = 0;
        if (n > prev) this.heatCd = Config.wanted.escalateEvery * (this.escalateMul || 1);      // delegado aliado: estrelas sobem mais devagar
        if (this.onChange) this.onChange(n, prev, why);
    }

    // +1★ respeitando o intervalo entre estrelas (agressões e crimes repetidos).
    bump(why = 'crime') {
        if (this.level === 0) { this._set(1, why); return; }
        if (this.heatCd <= 0) this._set(this.level + 1, why);
    }

    // seen: algum policial (ou o helicóptero) te enxerga agora | hold: alguém colado (sem te ver) | rate: ritmo da contagem.
    update(dt, seen, hold = false, rate = 1) {
        this.hold = !!hold && !seen;
        this.rate = rate;
        if (this.heatCd > 0) this.heatCd -= dt;
        if (this.level <= 0) return;
        if (seen) { this.lose = 0; return; }
        if (this.hold) return;
        this.lose += dt * rate;
        if (this.lose >= this.need) this._set(0, 'escape');      // loseMul: notoriedade (+) e habilidades de fuga (−)
    }

    // Garante pelo menos `n` estrelas (ex.: ser visto com arma de fogo na mão).
    ensureLevel(n, why = 'weapon') {
        if (this.level < n) this._set(n, why);
        this.lose = 0;
    }

    // Sobe estrelas na hora (crime gravíssimo: matar policial), sem esperar ser visto nem o intervalo.
    addStars(n, why = 'kill') {
        this._set(this.level + n, why);
        this.lose = 0;
    }

    bust() {
        this._set(0, 'bust');
    }
}
