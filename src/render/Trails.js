// ============================================================================
// Trails — o BORRÃO do GTA San Andreas, só onde ele aparece no jogo original:
//   · no HORIZONTE: uma faixa logo abaixo da linha do horizonte (e o céu acima dela) fica levemente desfocada — o longe "some" macio;
//   · em VELOCIDADE MUITO ALTA: o rastro ("trails"), cada quadro novo misturado por cima do anterior. Só aparece dirigindo/voando rápido
//     (de speedFrom até speedTo m/s a força sobe de 0 até `keep`); andando ou devagar, a imagem fica nítida.
// A linha do horizonte é a projeção de um ponto no infinito à frente da câmera (sem alocação por quadro). Com a gradação ligada
// (render/Lighting.js), o desfoque do horizonte é feito NA passada dela e as duas passadas do rastro só entram na cadeia em velocidade. A força do rastro vale para
// 30 quadros/s e é corrigida pelo tempo do quadro. Fica antes do CRT (render/CrtFilter.js) na cadeia.
//   Config.art.trails = { on, keep, speedFrom, speedTo, horizonBand, horizonPx }      `?blur=0` desliga.
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
			uniform float keep;                   // quanto do quadro anterior fica (0..1) - só em velocidade alta
			uniform vec3 horizon;                 // x = altura da linha do horizonte (UV), y = largura da faixa (UV), z = raio do desfoque (px)
			uniform vec2 texel;                   // 1 / tamanho da tela
			void main(void) {
				vec3 now = texture2D(textureSampler, vUV).rgb;
				float d = horizon.z * smoothstep(horizon.x - horizon.y, horizon.x, vUV.y);
				if (d > 0.05) {
					vec2 r = texel * d;
					vec3 s = now * 2.0;
					s += texture2D(textureSampler, vUV + r * vec2( 1.0,  0.0)).rgb;
					s += texture2D(textureSampler, vUV + r * vec2(-1.0,  0.0)).rgb;
					s += texture2D(textureSampler, vUV + r * vec2( 0.0,  1.0)).rgb;
					s += texture2D(textureSampler, vUV + r * vec2( 0.0, -1.0)).rgb;
					s += texture2D(textureSampler, vUV + r * vec2( 0.7,  0.7)).rgb;
					s += texture2D(textureSampler, vUV + r * vec2(-0.7,  0.7)).rgb;
					s += texture2D(textureSampler, vUV + r * vec2( 0.7, -0.7)).rgb;
					s += texture2D(textureSampler, vUV + r * vec2(-0.7, -0.7)).rgb;
					now = s / 10.0;
				}
				gl_FragColor = vec4(keep > 0.0 ? mix(now, texture2D(histSampler, vUV).rgb, keep) : now, 1.0);
			}`;
	},

	// A velocidade do que o jogador dirige/pilota (m/s), ou 0 a pé.
	_speed() {
		const g = typeof game !== 'undefined' ? game : null;
		if (!g) return 0;
		if (g.mode === 'car' && g.activeCar) return Math.abs(g.activeCar.speed || 0);
		if (g.mode === 'heli' && g.chopper) return Math.abs(g.chopper.speed || 0);
		return 0;
	},

	// A altura (UV, 0 = embaixo) da linha do horizonte na tela: um ponto no infinito, à frente da câmera no plano do chão, projetado.
	// null quando não há horizonte à vista (câmera olhando reto para baixo, ortográfica, dentro de um interior).
	_horizonY(scene) {
		if (typeof Interiors !== 'undefined' && Interiors.active) return null;
		const cam = scene.activeCamera;
		if (!cam || cam.mode !== BABYLON.Camera.PERSPECTIVE_CAMERA) return null;
		const V = cam.getViewMatrix().m, fx = V[2], fz = V[10], l = Math.hypot(fx, fz);
		if (l < 1e-3) return null;
		const M = scene.getTransformMatrix().m, x = fx / l, z = fz / l;
		const cy = x * M[1] + z * M[9], cw = x * M[3] + z * M[11];
		if (cw < 1e-4) return null;
		return 0.5 + 0.5 * cy / cw;
	},

	// camera: a câmera do jogo; engine: o BABYLON.Engine.
	// Duas passadas: 'trails' desfoca o horizonte e mistura com o HISTÓRICO; 'trailsHist' copia o resultado — a textura dela é o
	// histórico do quadro seguinte e a entrada do que vem depois (o CRT).
	attach(camera, engine) {
		if (!this.on) return null;
		this._shader();
		const scene = camera.getScene();
		const mix = new BABYLON.PostProcess('trails', 'trails', ['keep', 'horizon', 'texel'], ['histSampler'], 1.0, camera, BABYLON.Texture.BILINEAR_SAMPLINGMODE, engine, false);
		const hist = new BABYLON.PassPostProcess('trailsHist', 1.0, camera, BABYLON.Texture.BILINEAR_SAMPLINGMODE, engine, false);
		const C = this.C, base = Math.max(0, Math.min(0.9, C.keep !== undefined ? C.keep : 0.5));
		const s0 = C.speedFrom || 25, s1 = Math.max(s0 + 1, C.speedTo || 40), band = C.horizonBand || 0.22, px = C.horizonPx !== undefined ? C.horizonPx : 2.5;
		// A gradação (render/Lighting.js) já é uma passada de tela cheia: o desfoque do horizonte vai nela. O RASTRO (as duas passadas
		// abaixo: misturar com o quadro anterior e guardar o resultado) só entra na cadeia enquanto o carro está rápido — parado, a pé ou
		// devagar, são duas passadas de tela cheia a menos por quadro.
		const merged = typeof Lighting !== 'undefined' && !!Lighting.grade;
		let frames = 0, k = 0, attached = true, idle = 0;
		const detach = () => { camera.detachPostProcess(hist); camera.detachPostProcess(mix); attached = false; };
		const attach = () => {
			const at = camera._postProcesses.indexOf(Lighting.grade);                       // (logo antes da gradação: depois do antisserrilhado, se houver)
			if (at < 0) { camera.attachPostProcess(mix); camera.attachPostProcess(hist); }
			else { camera.attachPostProcess(mix, at); camera.attachPostProcess(hist, at + 1); }
			attached = true; frames = 0;
		};
		if (merged) detach();
		scene.onBeforeRenderObservable.add(() => {
			const dt = Math.min(0.2, engine.getDeltaTime() / 1000);
			const t = Math.max(0, Math.min(1, (this._speed() - s0) / (s1 - s0))), want = t * t * (3 - 2 * t);
			k += (want - k) * Math.min(1, dt * 4);
			const hy = this._horizonY(scene);
			if (merged) {
				Lighting.horizon = hy === null ? null : (this._hz || (this._hz = [0, band, px]));
				if (hy !== null) this._hz[0] = hy;
				idle = k < 0.01 ? idle + dt : 0;
				if (!attached && k >= 0.01) attach();
				else if (attached && idle > 1) detach();
			}
			this._k = k; this._hy = hy;
		});
		mix.onApply = (effect) => {
			effect.setTextureFromPostProcessOutput('histSampler', hist);
			const dt = Math.min(0.2, engine.getDeltaTime() / 1000);
			effect.setFloat('keep', frames++ < 2 || this._k < 0.01 ? 0 : Math.pow(base * this._k, dt * 30));      // (os 2 primeiros quadros: o histórico ainda está vazio)
			const hy = this._hy;
			effect.setFloat3('horizon', hy === null || hy === undefined ? 2 : hy, band, hy === null || hy === undefined || merged ? 0 : px);
			effect.setFloat2('texel', 1 / mix.width, 1 / mix.height);
		};
		mix.onSizeChangedObservable.add(() => { frames = 0; });                       // (janela mudou de tamanho: histórico novo, vazio)
		return mix;
	},
};
