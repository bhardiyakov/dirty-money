// ============================================================================
// SpeedBlur — borrão de alta velocidade ao dirigir.
// A partir de Config.camera.blurFrom (80%) da velocidade máxima do veículo, a tela "arrasta": um borrão de movimento ao longo da
// direção em que o mundo passa (along the vehicle's heading as drawn on screen — up most of the time with the compass camera, not while
// it turns, and never exactly up in the 2.5D view) mais um
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
			uniform vec2 flow;         // the vehicle's heading on screen (unit, UV space)
			uniform float strength;    // comprimento do arrasto (UV) na borda
			uniform float aspect;
			void main(void) {
				vec2 d = vUV - center;
				float r = length(vec2(d.x * aspect, d.y));
				float m = smoothstep(0.07, 0.5, r);                       // nítido em volta do carro, mais borrado nas bordas
				vec2 v = (flow * 0.7 + d * 1.1) * strength * m;          // the world streaming past + túnel radial
				vec4 c = vec4(0.0);
				for (int i = 0; i < 12; i++) c += texture2D(textureSampler, vUV + v * (float(i) / 11.0 - 0.5));
				gl_FragColor = c / 12.0;
			}`;
	},

	_make(game) {
		this._shader();
		const cam = game.camera.camera;
		this.pp = new BABYLON.PostProcess('speedBlur', 'speedBlur', ['center', 'flow', 'strength', 'aspect'], null, 1.0, cam);
		this.pp.onApply = (e) => {
			e.setFloat2('center', this._cu, this._cv);
			e.setFloat2('flow', this._fu, this._fv);
			e.setFloat('strength', this.s * Config.camera.blurMax);
			e.setFloat('aspect', this._asp);
		};
		this._on = true;
	},

	// Todo quadro (Game): força pela fração da velocidade máxima do veículo que o jogador dirige.
	update(game, dt) {
		const car = game.mode === 'car' ? game.activeCar : null, C = Config.camera;
		let goal = 0;
		if (car && car.spec && car.spec.maxSpeed > 0 && car.spec.bike !== 'bike') {      // (a bicycle never goes fast enough to blur)
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
		this._flow(game, car, p, uv);
		if (!this.pp) this._make(game);
		else if (!this._on) { game.camera.camera.attachPostProcess(this.pp); this._on = true; }
	},

	// The vehicle's heading as drawn on screen (UV, V up): its nose projected next to its centre. Straight up when unknown.
	_fu: 0, _fv: 1,
	_flow(game, car, p, uv) {
		const f = car && car.fwdToRef ? car.fwdToRef(this._f || (this._f = new BABYLON.Vector3())) : null;
		if (!f) { this._fu = 0; this._fv = 1; return; }
		const q = game.camera.screenUV(p.x + f.x * 4, p.z + f.z * 4, this._asp);
		const du = (q.u - uv.u) * this._asp, dv = uv.v - q.v, l = Math.hypot(du, dv);
		if (l < 1e-5) return;
		this._fu = du / l / this._asp; this._fv = dv / l;
	},
};
