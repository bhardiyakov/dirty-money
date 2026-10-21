// ============================================================================
// Needs — necessidades LEVES: fome e cansaço. Motivo para ir à padaria e dormir, sem virar jogo de sobrevivência.
//   • FOME é a saciedade do Physique (fed 0..100, cai ~4/h). Faminto (< 15): o fôlego volta mais devagar e a barriga ronca (aviso).
//   • ENERGIA (0..100) cai ~5/h acordado (mais correndo e brigando). Dormir enche; café e energético dão um gás; comer dá um pouco.
//     Cansado (< 20): fôlego máximo menor, a mira treme mais. Exausto (< 8): a vista escurece de vez em quando — durma.
//   • HUD: as barras de FOME e ENERGIA aparecem embaixo do fôlego só quando caem de 70 (Hud).
// ============================================================================

const Needs = {
    energy: 85,

    serialize() { return { energy: Math.round(this.energy * 10) / 10 }; },
    load(s) { this.energy = s && typeof s.energy === 'number' ? s.energy : 85; },

    _fed() { return typeof Physique !== 'undefined' ? Physique.fed : 70; },
    update(g, dt) {
        if (g.sleeping || !g.player || !g.player.alive) return;
        const dh = dt / ((typeof Config !== 'undefined' && Config.time && Config.time.cycleSeconds) || 720) * 24, pl = g.player;
        const busy = pl.winded || (pl.stamina != null && pl.staminaMax && pl.stamina < pl.staminaMax * 0.6);
        this.energy = Math.max(0, this.energy - dh * 5.2 * (busy ? 1.7 : 1));
        // avisos (de vez em quando, não todo segundo)
        this._t = (this._t || 0) - dt;
        if (this._t > 0) return;
        this._t = 75 + Math.random() * 45;
        if (this._fed() < 15) { g._flash(this._pick(['🍽️ A barriga está roncando — coma alguma coisa (padaria, lanchonete, ambulante)', '🍽️ Faminto: o fôlego volta devagar'])); if (typeof AudioFX !== 'undefined') AudioFX.blip(90, 0.4, 0.08); }
        else if (this.energy < 8) g._flash('😵 Exausto: a vista escurece — durma (cama em casa) ou tome um café');
        else if (this.energy < 20) g._flash(this._pick(['😴 Cansado: o fôlego e a mira pioram — um café ajuda, dormir resolve', '😴 Bateu o cansaço…']));
    },
    _pick(a) { return a[Math.floor(Math.random() * a.length)]; },

    // efeitos
    staminaMaxMul() { const e = this.energy; return (e < 20 ? 0.8 + e / 100 : 1) * (this._fed() < 15 ? 0.92 : 1); },
    regenMul() { return (this._fed() < 15 ? 0.7 : 1) * (this.energy < 20 ? 0.8 : 1); },
    spreadMul() { return this.energy < 20 ? 1.15 + (20 - this.energy) / 100 : 1; },
    blink(time) { return this.energy < 8 ? Math.max(0, Math.sin(time * 0.7) - 0.85) * 3.5 : 0; },      // (0..~0.5: a vista escurece)

    // comer / beber / dormir
    onEat(id, kcal) {
        const boost = /coffee|cafe|espresso|energ/i.test(id || '') ? 28 : Math.min(8, (kcal || 0) / 60);
        this.energy = Math.min(100, this.energy + boost);
    },
    drink(n) { this.energy = Math.min(100, this.energy + n * 0.2); },
    sleep() { this.energy = 100; },
};
