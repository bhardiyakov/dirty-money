// ============================================================================
// SkyDome — O CÉU DE VERDADE na câmera de perseguição (a pé e dirigindo, com o horizonte na tela). Antes o fundo era uma cor só
// (scene.clearColor); agora é um domo em volta da câmera, desenhado numa chamada só:
//   • DEGRADÊ do zênite (azul fundo) ao horizonte, que é EXATAMENTE a cor da névoa de distância: o longe da cidade se funde no céu;
//   • SOL com disco e halo na direção das sombras (o azimute do DayNight), baixo no amanhecer e no fim da tarde, com o brilho
//     laranja espalhado pelo horizonte do lado dele (o pôr do sol) — o disco passa do limiar do brilho (render/Lighting.js, bloom);
//   • NUVENS que andam com o vento (uma textura de ruído feita na carga, duas camadas), iluminadas pela cor do sol; com tempo
//     fechado (Weather) o céu cobre e acinzenta;
//   • de noite, LUA e ESTRELAS que piscam (somem atrás das nuvens), e as nuvens com o laranja da cidade por baixo;
//   • ABAIXO do horizonte, o MAR que continua além da borda do mundo (lá de cima — avião, helicóptero, paraquedas — a borda reta
//     do plano d'água sumia num cinza liso): cada raio desce até o nível do mar e ganha a névoa daquela distância (a mesma conta da
//     névoa da cena), então o mar de verdade e o do céu se emendam.
// Desenhado na fila de alpha-test (depois dos opacos, antes dos transparentes), sem gravar profundidade, no fundo do volume de
// visão (z = w): só os pixels de céu de verdade são pintados — prédios, chão e carros na frente nem passam pelo shader.
// Fora da perseguição (câmera de cima, interiores) fica desligado e o fundo volta à cor de sempre. `?ceu=0` desliga.
// Cores e sol: DayNight.apply → SkyDome.set; posição: todo quadro (onBeforeRender), centrado na câmera.
// ============================================================================

const SkyDome = {
	mesh: null,
	mat: null,
	on: false,
	_t: 0,
	// cores da hora (DayNight.apply)
	zen: [0.2, 0.42, 0.8], hor: [0.6, 0.75, 0.95], sunDir: [0, 1, 0], sunCol: [1, 1, 1], moonDir: [0, 1, 0],
	cloudLit: [1, 1, 1], cloudDark: [0.6, 0.65, 0.7], sea: [0.14, 0.23, 0.28], seaSky: [0.5, 0.65, 0.8], night: 0, cover: 0.3, sunVis: 1,

	get wanted() {
		const q = typeof location !== 'undefined' ? location.search : '';
		return Config.light.dome !== false && !/[?&]ceu=0\b/.test(q);
	},

	init(game) {
		if (!this.wanted || this.mesh) return;
		const scene = game.scene;
		this._shaders();
		const m = this.mesh = BABYLON.MeshBuilder.CreateSphere('skyDome', { diameter: 2, segments: 12, sideOrientation: BABYLON.Mesh.BACKSIDE }, scene);
		m.isPickable = false;
		m.alwaysSelectAsActiveMesh = true;              // (sempre em volta da câmera: nada de teste de recorte)
		m.doNotSyncBoundingInfo = true;
		m.applyFog = false;
		m.receiveShadows = false;
		const mat = this.mat = new BABYLON.ShaderMaterial('skyDome', scene, { vertex: 'skyDome', fragment: 'skyDome' }, {
			attributes: ['position'],
			uniforms: ['world', 'viewProjection', 'zen', 'hor', 'sunDir', 'sunCol', 'moonDir', 'cloudLit', 'cloudDark', 'sky', 'seaC', 'seaSky', 'fogP'],
			samplers: ['noise'],
			needAlphaTesting: true,                     // (fila de alpha-test: depois dos opacos — o céu só onde nada foi desenhado)
		});
		mat.setTexture('noise', this._noise(scene));
		mat.disableDepthWrite = true;
		mat.backFaceCulling = false;
		mat.fogEnabled = false;
		m.material = mat;
		m.setEnabled(false);
		this._push();
		const cam = game.camera.camera;
		scene.onBeforeRenderObservable.add(() => this.frame(game, cam));
		console.log('[CÉU] domo ligado');
	},

	// Todo quadro: segue a câmera; só na perseguição e fora dos interiores.
	frame(game, cam) {
		const m = this.mesh;
		if (!m) return;
		const want = typeof CompassCamera !== 'undefined' && CompassCamera.chase >= 0.5 && !(typeof Interiors !== 'undefined' && Interiors.active);
		if (want !== this.on) { this.on = want; m.setEnabled(want); }
		if (!want) return;
		m.position.copyFrom(cam.position);
		const r = Math.max(5, (cam.minZ || 1) * 4);           // (qualquer raio entre near e far: o shader joga a profundidade para o fundo)
		m.scaling.set(r, r, r);
		this._t = (performance.now() / 1000) % 100000;
		const U = this._U, sc = game.scene;
		if (U) {
			this.mat.setVector4('sky', U.sky.set(this.night, this.cover, this._t, this.sunVis));
			this.mat.setVector3('fogP', U.fogP.set(sc.fogStart, sc.fogEnd, Math.max(0.5, cam.position.y)));      // (névoa do olho e a altura sobre o mar)
		}
	},

	// Cores da hora (DayNight.apply). hor = a cor da névoa de distância (o horizonte se funde no longe da cidade).
	set(o) {
		Object.assign(this, o);
		this._push();
	},
	_push() {
		const m = this.mat;
		if (!m) return;
		const U = this._U || (this._U = { zen: new BABYLON.Color3(), hor: new BABYLON.Color3(), sunCol: new BABYLON.Color3(), cloudLit: new BABYLON.Color3(), cloudDark: new BABYLON.Color3(), sea: new BABYLON.Color3(), seaSky: new BABYLON.Color3(), sunDir: new BABYLON.Vector3(), moonDir: new BABYLON.Vector3(), sky: new BABYLON.Vector4(), fogP: new BABYLON.Vector3(100, 200, 2) });
		m.setColor3('seaC', U.sea.set(this.sea[0], this.sea[1], this.sea[2])); m.setColor3('seaSky', U.seaSky.set(this.seaSky[0], this.seaSky[1], this.seaSky[2])); m.setVector3('fogP', U.fogP);
		for (const k of ['zen', 'hor', 'sunCol', 'cloudLit', 'cloudDark']) { const a = this[k]; m.setColor3(k, U[k].set(a[0], a[1], a[2])); }
		for (const k of ['sunDir', 'moonDir']) { const a = this[k]; m.setVector3(k, U[k].set(a[0], a[1], a[2])); }
		m.setVector4('sky', U.sky.set(this.night, this.cover, this._t, this.sunVis));
	},

	// As cores do céu a partir dos parâmetros da hora (DayNight: P já com o tempo e a luz do céu) e da névoa (haze). hour: a hora do dia.
	fromDay(P, haze, hour, weatherK) {
		// (o DayNight aplica todo quadro; a hora anda devagar: só refaz quando algo mudou de verdade)
		const L = this._last || (this._last = [NaN, NaN, NaN, NaN, NaN]);
		if (Math.abs(hour - L[0]) < 0.004 && Math.abs(weatherK - L[1]) < 0.002 && Math.abs(P.n - L[2]) < 0.002 && Math.abs(haze[0] - L[3]) < 0.0015 && Math.abs(P.sunC[0] - L[4]) < 0.002) return;
		L[0] = hour; L[1] = weatherK; L[2] = P.n; L[3] = haze[0]; L[4] = P.sunC[0];
		const k = 1 - Math.min(1, P.n), cl = (v) => Math.max(0, Math.min(1, v));
		const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
		// o sol que se vê: no azimute das sombras (DayNight: luz para +x/−z), alto ao meio-dia e no horizonte às 6h e às 18h40
		const t = (hour - 6.0) / (18.7 - 6.0), sinE = t > 0 && t < 1 ? Math.sin(Math.PI * t) * 0.97 : -0.25;
		const cosE = Math.sqrt(Math.max(0, 1 - sinE * sinE)), az = [-0.8, 0.6];
		const sunDir = [az[0] * cosE, sinE, az[1] * cosE];
		const high = cl(sinE / 0.45);                                         // 0 no horizonte → 1 com o sol alto
		let zen = mix([0.16, 0.19, 0.4], [0.17, 0.38, 0.78], high);           // fim de tarde: azul-violeta; dia: azul fundo
		zen = mix([0.006, 0.012, 0.045], zen, k);                             // noite
		zen = mix(zen, haze.map((v) => v * 0.92), cl(weatherK) * 0.85);      // tempo fechado: cinza
		const lit0 = mix([0.96, 0.95, 0.93], [P.sunC[0], P.sunC[1] * 0.92, P.sunC[2] * 0.85], (1 - high) * 0.75);
		let cloudLit = lit0.map((v) => v * (0.12 + 0.88 * k));
		let cloudDark = mix([0.11, 0.09, 0.1], haze.map((v, i) => v * [0.82, 0.84, 0.9][i]), k);     // noite: o laranja da cidade por baixo
		cloudLit = mix(cloudLit, [0.5, 0.53, 0.57].map((v) => v * (0.2 + 0.8 * k)), cl(weatherK));
		cloudDark = mix(cloudDark, [0.3, 0.32, 0.35].map((v) => v * (0.2 + 0.8 * k)), cl(weatherK));
		const sunVis = (1 - cl(weatherK * 1.4)) * cl((sinE + 0.04) / 0.08) * cl(k * 1.4);
		// o mar ao longe: a cor da água (MapData: #4a7390) na luz da hora, com o céu refletido de lado (Fresnel alto lá longe)
		const ws = typeof Water !== 'undefined' && Water.sky ? Water.sky : haze, lv = 0.25 + 0.75 * k;
		const sea = [0.26, 0.47, 0.56].map((v, i) => v * P.tint[i] * lv * 0.55), seaSky = ws.slice(0, 3);      // (medido na foto: o mar de verdade perto da borda)
		this.set({
			zen, hor: haze.slice(0, 3), sunDir, sunCol: P.sunC.map((v) => v * 1.05), moonDir: [-0.42, 0.78, 0.46],
			cloudLit, cloudDark, sea, seaSky, night: 1 - k, cover: 0.3 + 0.62 * cl(weatherK), sunVis,
		});
	},

	// Ruído de nuvem que repete sem emenda (128², 4 oitavas de ruído de valor numa grade periódica), feito uma vez na carga.
	_noise(scene) {
		const N = 128, data = new Uint8Array(N * N * 4);
		let sd = 9871;
		const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
		const oct = [[8, 0.5], [16, 0.26], [32, 0.15], [64, 0.09]].map(([g, w]) => { const v = new Float32Array(g * g); for (let i = 0; i < v.length; i++) v[i] = rnd(); return { g, w, v }; });
		const sm = (x) => x * x * (3 - 2 * x);
		for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
			let s = 0;
			for (const o of oct) {
				const fx = x / N * o.g, fy = y / N * o.g, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
				const at = (a, b) => o.v[((b % o.g + o.g) % o.g) * o.g + ((a % o.g + o.g) % o.g)];
				const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx, b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx;
				s += (a + (b - a) * ty) * o.w;
			}
			const v = Math.max(0, Math.min(255, Math.round(s * 255))), i = (y * N + x) * 4;
			data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
		}
		const tex = BABYLON.RawTexture.CreateRGBATexture(data, N, N, scene, true, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
		tex.wrapU = tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
		tex.name = 'skyNoise';
		return tex;
	},

	_shaders() {
		const S = BABYLON.Effect.ShadersStore;
		if (S.skyDomeVertexShader) return;
		S.skyDomeVertexShader = `
			precision highp float;
			attribute vec3 position;
			uniform mat4 world, viewProjection;
			varying vec3 vDir;
			void main(void) {
				vDir = position;
				vec4 p = viewProjection * (world * vec4(position, 1.0));
				gl_Position = vec4(p.xy, p.w * 0.999995, p.w);               // no fundo do volume de visão: atrás de tudo
			}`;
		// (sem desvio por pixel em volta das leituras de textura: o Chrome no Windows traduz para Direct3D e recusa — ver Lighting.GRADE_FS)
		S.skyDomeFragmentShader = `
			precision highp float;
			varying vec3 vDir;
			uniform vec3 zen, hor, sunDir, sunCol, moonDir, cloudLit, cloudDark, seaC, seaSky;
			uniform vec3 fogP;             // névoa da cena (início, fim, em m do olho) e a altura do olho sobre o mar
			uniform vec4 sky;              // x = noite (0..1), y = cobertura de nuvens, z = tempo (s), w = sol visível (0..1)
			uniform sampler2D noise;
			float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
			void main(void) {
				vec3 d = normalize(vDir);
				float y = d.y, up = clamp(y, 0.0, 1.0);
				vec3 c = mix(hor, zen, pow(up, 0.55));
				float sd = max(dot(d, sunDir), 0.0);
				// o brilho do sol espalhado no ar: halo largo perto do horizonte (o pôr do sol) e o halo justo em volta do disco
				c += sunCol * (pow(sd, 4.0) * 0.55 * pow(1.0 - up, 3.0) + pow(sd, 60.0) * 0.4) * sky.w;
				// nuvens: o céu projetado num plano alto (perto do horizonte elas se achatam e somem na névoa)
				vec2 uv = d.xz / (up + 0.14) * 0.11;
				float n = texture2D(noise, uv + vec2(sky.z * 0.0016, sky.z * 0.0006)).r * 0.62
					+ texture2D(noise, uv * 2.7 + vec2(-sky.z * 0.0024, sky.z * 0.001)).r * 0.38;
				float edge = 1.0 - sky.y;
				float cl = smoothstep(edge - 0.08, edge + 0.22, n) * smoothstep(0.0, 0.06, y);
				vec3 cc = mix(cloudDark, cloudLit, smoothstep(edge - 0.05, edge + 0.4, n)) + sunCol * pow(sd, 6.0) * 0.35 * sky.w;
				cc = mix(cc, hor, pow(1.0 - up, 6.0) * 0.6);                        // (as do horizonte, longe: tingidas pelo ar)
				c = mix(c, cc, cl * 0.9);
				// o disco do sol (atrás das nuvens)
				c += sunCol * smoothstep(0.99955, 0.99978, sd) * 1.8 * sky.w * (1.0 - cl);
				// noite: estrelas que piscam e a lua
				vec3 g = floor(d * 380.0);
				float st = h3(g);
				float star = step(0.9972, st) * smoothstep(0.06, 0.3, y) * sky.x * (1.0 - cl) * (0.55 + 0.45 * sin(sky.z * (1.5 + st * 3.0) + st * 90.0));
				c += vec3(0.85, 0.9, 1.0) * star;
				float md = max(dot(d, moonDir), 0.0);
				c += vec3(0.86, 0.89, 0.96) * (smoothstep(0.99935, 0.9996, md) * 0.95 + pow(md, 180.0) * 0.1) * sky.x * (1.0 - cl * 0.85);
				// abaixo do horizonte: o mar até o horizonte, com a névoa da distância em que o raio chega ao nível do mar
				// (e o céu refletido de lado, o Fresnel do mar de verdade — WaterPlugin: 0,05 + 0,45 (1 − cos)³)
				float t = fogP.z / max(-y, 1e-4);
				vec3 sea = mix(seaC, seaSky, 0.05 + 0.45 * pow(clamp(1.0 + y, 0.0, 1.0), 3.0));
				vec3 below = mix(sea, hor, clamp((t - fogP.x) / max(fogP.y - fogP.x, 1.0), 0.0, 1.0));
				c = mix(c, below, smoothstep(0.004, -0.004, y));
				gl_FragColor = vec4(c, 1.0);
			}`;
	},
};
