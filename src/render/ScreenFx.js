// ============================================================================
// ScreenFx — EFEITOS DE TELA ligados ao que o jogador está sentindo. São quatro números que a gradação (Lighting.GRADE_FS, o último
// pós-processamento) recebe a cada quadro no uniform `fx`; com todos em zero roda a variante SEM efeitos do shader (Lighting.fx): a
// imagem e o custo são exatamente os de antes.
//   • speed  VELOCIDADE: de carro ou moto acima de ~70 km/h as bordas da tela esticam para fora (borrão radial; o centro fica nítido).
//            Com o nitro, mais. Soma com o campo de visão que já abre na perseguição (CompassCamera).
//   • hit    IMPACTO: batida, explosão, soco ou tiro levado — por um instante as cores se separam nas bordas (aberração cromática).
//            Entra por ScreenFx.punch(k), chamado pelo tremor da câmera (CompassCamera.shake) e pelo dano no jogador.
//   • hurt   VIDA BAIXA: abaixo de 35% a tela perde a cor e as bordas escurecem pulsando (com o batimento do Juice).
//   • t      o relógio do pulso.
// Desliga em Ajustes › Efeitos de tela (settings.screenFx). Sem a gradação (`?luz=0`) nada disto existe.
// ============================================================================

const ScreenFx = {
    speed: 0, hit: 0, hurt: 0, t: 0,
    V0: 19, V1: 40,           // m/s: onde o borrão de velocidade começa (≈ 70 km/h) e onde chega ao máximo (≈ 145 km/h)
    _hf: 0, _vec: null,

    on() { const g = window.game, s = g && g.menu && g.menu.settings; return !s || s.screenFx !== false; },

    // Um impacto de força k (0–1): vale o maior entre os que chegam juntos.
    punch(k) { if (k > this.hit) this.hit = Math.min(1, k); },

    update(g, dt) {
        dt = Math.min(0.1, dt || 0);
        let sp = 0, hurt = 0;
        const live = this.on() && g._loadingHidden && !g.menu.isOpen;
        if (live) {
            const car = g.mode === 'car' && g.activeCar && !g.activeCar.isBoat ? g.activeCar : null;
            if (car) sp = Math.max(0, Math.min(1, (car.speed - this.V0) / (this.V1 - this.V0))) * (car.nosOn ? 1 : 0.8) + (car.nosOn ? 0.25 : 0);
            const pl = g.player;
            if (pl && !g.death && !g.arrest && pl.maxHp > 0) { const f = pl.hp / pl.maxHp; if (f < 0.35 && f > 0) hurt = 1 - f / 0.35; }
            if (pl && pl.hitFlash > this._hf + 0.05) this.punch(0.5);                 // levou dano neste quadro
            this._hf = pl ? pl.hitFlash || 0 : 0;
        } else if (!this.on()) this.hit = 0;
        this.speed += (Math.min(1, sp) - this.speed) * Math.min(1, dt * 2.6);
        this.hurt += (hurt - this.hurt) * Math.min(1, dt * 2.2);
        this.hit *= Math.exp(-4.5 * dt);
        if (this.hit < 0.004) this.hit = 0;
        if (this.speed < 0.003 && !sp) this.speed = 0;
        if (this.hurt < 0.003 && !hurt) this.hurt = 0;
        this.t = (this.t + dt) % 1000;
        if (typeof Lighting !== 'undefined') Lighting.fx(this.active);          // (a variante do shader com os efeitos só enquanto há algum)
    },
    get active() { return this.speed > 0 || this.hit > 0 || this.hurt > 0; },

    // Chamado no onApply da gradação.
    apply(effect) { effect.setFloat4('fx', this.speed, this.hit, this.hurt, this.t); },
};
