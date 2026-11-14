// ============================================================================
// Trails — o BORRÃO do GTA San Andreas ("trails"): cada quadro novo é misturado por cima do anterior, que fica na tela desta passada
// (ela não é limpa entre um quadro e outro). Em movimento a imagem deixa um rastro suave; parada, fica só uma leve suavidade.
// Uma passada de tela cheia, sem alocação por quadro. A força (`keep`: quanto do quadro anterior fica) vale para 30 quadros/s e é
// corrigida pelo tempo do quadro — o rastro dura o mesmo tanto a 30 ou a 60. Fica antes do CRT (render/CrtFilter.js) na cadeia.
//   Config.art.trails = { on, keep }      `?blur=0` desliga.
// ============================================================================

const Trails = {
	get C() { return (Config.art && Config.art.trails) || {}; },
	get on() {
		const q = typeof location !== 'undefined' ? location.search : '';
		return this.C.on !== false && !/[?&]blur=0\b/.test(q);
	},

	_shader() {
		if (BABYLON.Effect.ShadersStore.trailsFragmentShader) return;
		BABYLON.Effect.ShadersStore.trailsFragmentShader = `
			precision highp float;
			varying vec2 vUV;
			uniform sampler2D textureSampler;
			uniform float keep;          // quanto do quadro anterior fica (0..1)
			void main(void) {
				gl_FragColor = vec4(texture2D(textureSampler, vUV).rgb, 1.0 - keep);
			}`;
	},

	// camera: a câmera do jogo; engine: o BABYLON.Engine.
	attach(camera, engine) {
		if (!this.on) return null;
		this._shader();
		// (a cena desenha DIRETO na textura da 1ª passada da cadeia e a limpa: o rastro precisa de uma passada antes dele)
		if (!camera._postProcesses || !camera._postProcesses.some((p) => p)) new BABYLON.PassPostProcess('trailsIn', 1.0, camera, BABYLON.Texture.BILINEAR_SAMPLINGMODE, engine);
		const pp = new BABYLON.PostProcess('trails', 'trails', ['keep'], null, 1.0, camera, BABYLON.Texture.BILINEAR_SAMPLINGMODE, engine, false);
		pp.autoClear = false;                                    // (o quadro anterior fica na textura…)
		pp.alphaMode = BABYLON.Engine.ALPHA_COMBINE;             // (…e o novo entra por cima com alfa = 1 − keep)
		const base = Math.max(0, Math.min(0.9, this.C.keep !== undefined ? this.C.keep : 0.45));
		pp.onApply = (effect) => {
			const dt = Math.min(0.2, engine.getDeltaTime() / 1000);
			effect.setFloat('keep', Math.pow(base, dt * 30));
		};
		return pp;
	},
};
