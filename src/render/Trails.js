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
			uniform sampler2D textureSampler;     // o quadro de agora
			uniform sampler2D histSampler;        // o quadro anterior já misturado (a saída da passada 'trailsHist')
			uniform float keep;                   // quanto do quadro anterior fica (0..1)
			void main(void) {
				vec3 now = texture2D(textureSampler, vUV).rgb;
				gl_FragColor = vec4(mix(now, texture2D(histSampler, vUV).rgb, keep), 1.0);
			}`;
	},

	// camera: a câmera do jogo; engine: o BABYLON.Engine.
	// Duas passadas: 'trails' mistura o quadro de agora com o HISTÓRICO; 'trailsHist' copia o resultado — a textura dela é o histórico do
	// quadro seguinte e a entrada do que vem depois (o CRT). (Contar com a textura não ser limpa entre quadros acumulava a cor do fundo.)
	attach(camera, engine) {
		if (!this.on) return null;
		this._shader();
		const mix = new BABYLON.PostProcess('trails', 'trails', ['keep'], ['histSampler'], 1.0, camera, BABYLON.Texture.BILINEAR_SAMPLINGMODE, engine, false);
		const hist = new BABYLON.PassPostProcess('trailsHist', 1.0, camera, BABYLON.Texture.BILINEAR_SAMPLINGMODE, engine, false);
		const base = Math.max(0, Math.min(0.9, this.C.keep !== undefined ? this.C.keep : 0.45));
		let frames = 0;
		mix.onApply = (effect) => {
			effect.setTextureFromPostProcessOutput('histSampler', hist);
			const dt = Math.min(0.2, engine.getDeltaTime() / 1000);
			effect.setFloat('keep', frames++ < 2 ? 0 : Math.pow(base, dt * 30));      // (os 2 primeiros quadros: o histórico ainda está vazio)
		};
		mix.onSizeChangedObservable.add(() => { frames = 0; });                       // (janela mudou de tamanho: histórico novo, vazio)
		return mix;
	},
};
