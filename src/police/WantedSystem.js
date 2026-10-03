// ============================================================================
// WantedSystem — nível de procurado (★) e FUGA.
//
// Subir de nível:
//   - reportCrime(): você cometeu um crime (abre uma janela de "flagrante").
//   - seenByPolice(): alguém te viu na janela -> 1★ na hora; já procurado, +1★ só a cada
//     `escalateEvery` s (um tiroteio escala com o tempo, não em 2 segundos).
//   - bump()/addStars(): agressão a policial (com o mesmo intervalo) e morte de policial (na hora).
// Fugir:
//   - update(dt, seen): com ★, cada segundo SEM ninguém te enxergar conta. Passou o `lose` do
//     nível (Config.wanted.levels[n].lose) sem ser visto = você se safou e as ★ zeram.
//     Ser visto zera a contagem. Níveis altos enxergam de mais longe e demoram mais a perder você.
// Ser preso/morrer também zera. `onChange(nível, anterior, motivo)` avisa o jogo (mensagens, reforços).
// ============================================================================

class WantedSystem {
    constructor() {
        this.level = 0;
        this.pending = false;    // crime aguardando ser visto.
        this.crimeWindow = 0;    // tempo restante da janela de flagrante.
        this.lose = 0;           // segundos seguidos sem ninguém te ver (fuga em andamento).
        this.heatCd = 0;         // tempo até a próxima ★ por crime comum.
        this.onChange = null;
    }

    // Configuração do nível atual (null sem ★).
    get cfg() { return Config.wanted.levels[this.level] || null; }

    // Fração da fuga concluída (0..1).
    get escape() { return this.cfg ? Math.min(1, this.lose / this.cfg.lose) : 0; }

    _set(n, why) {
        n = Math.max(0, Math.min(Config.wanted.maxLevel, n));
        if (n === this.level) return;
        const prev = this.level;
        this.level = n;
        this.lose = 0;
        if (n > prev) this.heatCd = Config.wanted.escalateEvery;
        if (this.onChange) this.onChange(n, prev, why);
    }

    // window: segundos de flagrante (padrão: Config.police.crimeVisibleTime; o assalto usa uma janela maior).
    reportCrime(window = Config.police.crimeVisibleTime) {
        this.pending = true;
        this.crimeWindow = Math.max(this.crimeWindow, window);
    }

    // Chamado quando QUALQUER policial enxerga o jogador neste frame (só vale com crime pendente).
    seenByPolice() {
        if (!this.pending) return;
        this.pending = false;
        this.crimeWindow = 0;
        if (this.level === 0) this._set(1, 'crime');
        else this.bump('crime');
        this.lose = 0;
    }

    // +1★ respeitando o intervalo entre estrelas (agressões e crimes repetidos).
    bump(why = 'crime') {
        if (this.level === 0) { this._set(1, why); return; }
        if (this.heatCd <= 0) this._set(this.level + 1, why);
    }

    // seen: algum policial (ou o helicóptero) te enxerga agora.
    update(dt, seen) {
        if (this.heatCd > 0) this.heatCd -= dt;
        // Expira o flagrante se ninguém viu a tempo.
        if (this.crimeWindow > 0) {
            this.crimeWindow -= dt;
            if (this.crimeWindow <= 0) this.pending = false;
        }

        if (this.level <= 0) return;
        if (seen) { this.lose = 0; return; }
        this.lose += dt;
        if (this.lose >= this.cfg.lose) this._set(0, 'escape');
    }

    // Garante pelo menos `n` estrelas (ex.: ser visto com arma de fogo na mão).
    ensureLevel(n) {
        if (this.level < n) this._set(n, 'weapon');
        this.lose = 0;
    }

    // Sobe estrelas na hora (crime gravíssimo: matar policial), sem esperar ser visto nem o intervalo.
    addStars(n, why = 'kill') {
        this._set(this.level + n, why);
        this.lose = 0;
    }

    bust() {
        this.pending = false;
        this.crimeWindow = 0;
        this._set(0, 'bust');
    }
}
