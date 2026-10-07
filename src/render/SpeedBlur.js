// ============================================================================
// SpeedBlur — borrão de alta velocidade ao dirigir.
// A partir de Config.camera.blurFrom (80%) da velocidade máxima do veículo, a tela "arrasta": um borrão de movimento ao longo da
// direção em que o mundo passa (com a câmera bússola, a frente do carro está sempre para cima, então o fluxo é vertical) mais um
// leve borrão radial (efeito túnel). Em volta do carro a imagem fica nítida; o borrão cresce para as bordas. Na velocidade máxima,
// força total (Config.camera.blurMax).
// O pós-processamento só fica preso à câmera enquanto há borrão: parado ou devagar, não custa nada.
// ============================================================================

const SpeedBlur = {
    pp: null,
    s: 0,                  // força atual (0..1, suavizada)
    _on: false,

    _shader() {
        if (BABYLON.Effect.ShadersStore.speedBlurFragmentShader) return;
        BABYLON.Effect.ShadersStore.speedBlurFragmentShader = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D textureSampler;
            uniform vec2 center;       // carro na tela (UV)
            uniform float strength;    // comprimento do arrasto (UV) na borda
            uniform float aspect;
            void main(void) {
                vec2 d = vUV - center;
                float r = length(vec2(d.x * aspect, d.y));
                float m = smoothstep(0.07, 0.5, r);                       // nítido em volta do carro, mais borrado nas bordas
                vec2 v = (vec2(0.0, 0.7) + d * 1.1) * strength * m;      // fluxo vertical (o mundo passando) + túnel radial
                vec4 c = vec4(0.0);
                for (int i = 0; i < 12; i++) c += texture2D(textureSampler, vUV + v * (float(i) / 11.0 - 0.5));
                gl_FragColor = c / 12.0;
            }`;
    },

    _make(game) {
        this._shader();
        const cam = game.camera.camera;
        this.pp = new BABYLON.PostProcess('speedBlur', 'speedBlur', ['center', 'strength', 'aspect'], null, 1.0, cam);
        this.pp.onApply = (e) => {
            e.setFloat2('center', this._cu, this._cv);
            e.setFloat('strength', this.s * Config.camera.blurMax);
            e.setFloat('aspect', this._asp);
        };
        this._on = true;
    },

    // Todo quadro (Game): força pela fração da velocidade máxima do veículo que o jogador dirige.
    update(game, dt) {
        const car = game.mode === 'car' ? game.activeCar : null, C = Config.camera;
        let goal = 0;
        if (car && car.spec && car.spec.maxSpeed > 0) {
            const top = car.spec.maxSpeed * (1 + ((typeof SkillTree !== 'undefined' && SkillTree.m.topSpeed) || 0));
            goal = Math.max(0, Math.min(1, (car.speed / top - C.blurFrom) / (1 - C.blurFrom)));
        }
        this.s += (goal - this.s) * (1 - Math.exp(-(goal > this.s ? 3 : 6) * dt));       // entra devagar, sai rápido
        if (this.s < 0.01) {
            this.s = 0;
            if (this._on) { game.camera.camera.detachPostProcess(this.pp); this._on = false; }
            return;
        }
        const eng = game.gameEngine.engine;
        this._asp = eng.getAspectRatio(game.camera.camera);
        const p = car ? car.position : game.camera.target, uv = game.camera.screenUV(p.x, p.z, this._asp);
        this._cu = uv.u; this._cv = 1 - uv.v;                                   // (no pós-processamento o V cresce para cima)
        if (!this.pp) this._make(game);
        else if (!this._on) { game.camera.camera.attachPostProcess(this.pp); this._on = true; }
    },
};
