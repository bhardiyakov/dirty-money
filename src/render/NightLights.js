// ============================================================================
// NightLights — LUZ DE VERDADE À NOITE (etapa 6 do upgrade visual; padrão em todos os presets, Config.light.night; `?noite=0` volta às
// poças pintadas de antes). Postes, vitrines, as lâmpadas
// da favela e os faróis e lanternas dos carros iluminam o que está perto deles — o chão, as paredes, os carros, as árvores e os
// personagens —, sem limite de lâmpadas.
//
// CAMPO DE LUZ: a cada quadro (só à noite), as fontes perto da câmera viram quads de luz (disco macio; o farol, uma elipse à frente
// do carro) desenhados de cima, aditivos, numa textura que cobre o chão visto (RenderTargetTexture com câmera ortográfica própria,
// LAYER: só ela vê esses quads). Quem recebe a luz lê a textura pela posição no mundo e soma luz × a própria cor:
//   • os StandardMaterial do mundo, por um plugin registrado para todos (RegisterMaterialPlugin, antes do mundo ser montado): chão,
//     paredes, telhados, acabamentos, carros 3D e árvores 3D. A luz cai com a altura (o poste ilumina o pé do prédio, não o telhado);
//   • os personagens 2,5D (NpcArt, uniforms lfTex/lfP), no ponto do chão sob cada pixel do desenho.
// CHÃO MOLHADO: com chuva (Weather.cur.k), o chão reflete as luzes — o campo lido em pontos atrás de cada pixel, na direção oposta à
// câmera, vira um rastro de luz que vem até quem olha, como no asfalto molhado de verdade.
// As POÇAS pintadas no chão (os quads aditivos dos postes, das lojas, da favela e o do farol) saem: agora o chão é iluminado de fato.
// O brilho das lâmpadas (o halo no cabeçote, o farol) continua. Custo: uma textura de 512 px (256 no Low) e um desenho por quadro
// para todas as luzes, e uma leitura de textura por pixel do mundo.
//   register() (no carregamento)   init(game)   update(game)   P (Vector4: centro x, z, 1/tamanho, força)   tex
// ============================================================================

const NightLights = {
	LAYER: 0x20000000,
	CAP: 1024,                          // quads de luz por quadro
	get on() {
		const m = typeof location !== 'undefined' && location.search.match(/[?&]noite=([^&]*)/);
		if (m) return m[1].split(/[,+ ]/).includes('luz');
		return !!(typeof Config !== 'undefined' && Config.light && Config.light.night);
	},
	tex: null,
	P: null,
	_empty: null,

	// O plugin dos StandardMaterial (chamado no carregamento do script: vale para todos os materiais criados depois).
	register() {
		if (this._reg || !this.on || typeof BABYLON === 'undefined' || !BABYLON.RegisterMaterialPlugin) return;
		this._reg = true;
		this.P = new BABYLON.Vector4(0, 0, 0, 0);
		this.W = new BABYLON.Vector4(0, 1, 0, 0);          // chão molhado: direção da câmera no chão (x, z), quanto está molhado, -
		const NL = this;
		class NightLightPlugin extends BABYLON.MaterialPluginBase {
			constructor(m) { super(m, 'NightLight', 270, { NIGHTLF: false }); this._enable(true); }
			getClassName() { return 'NightLightPlugin'; }
			prepareDefines(d) { d.NIGHTLF = true; }
			getSamplers(s) { s.push('lfTex'); }
			getUniforms() { return { ubo: [{ name: 'lfP', size: 4, type: 'vec4' }, { name: 'lfW', size: 4, type: 'vec4' }], fragment: 'uniform vec4 lfP;\nuniform vec4 lfW;' }; }
			bindForSubMesh(ub) {
				const P = NL.P, W = NL.W;
				ub.updateFloat4('lfP', P.x, P.y, P.z, P.w);
				ub.updateFloat4('lfW', W.x, W.y, W.z, W.w);
				ub.setTexture('lfTex', NL.tex || NL._emptyTex());
			}
			getCustomCode(type) {
				if (type !== 'fragment') return null;
				// (sem ponto e vírgula em comentário GLSL: o Babylon corta a linha ali)
				return {
					CUSTOM_FRAGMENT_DEFINITIONS: `
						#ifdef NIGHTLF
						uniform sampler2D lfTex;
						#endif`,
					CUSTOM_FRAGMENT_BEFORE_FOG: `
						#ifdef NIGHTLF
						if (lfP.w > 0.0) {
							vec2 lfUV = (vPositionW.xz - lfP.xy) * lfP.z + 0.5;
							if (lfUV.x > 0.0 && lfUV.x < 1.0 && lfUV.y > 0.0 && lfUV.y < 1.0) {
								vec3 lfL = texture2D(lfTex, lfUV).rgb;
								float lfH = clamp(1.0 - max(vPositionW.y - 1.0, 0.0) / 8.0, 0.12, 1.0);
								color.rgb += baseColor.rgb * lfL * lfP.w * lfH;
								// CHÃO MOLHADO (chuva): o reflexo das luzes num rastro que vem na direção da câmera — o campo de luz lido em
								// pontos ATRÁS do pixel (para longe da câmera), só no que é chão (normal para cima, baixo)
								if (lfW.z > 0.0 && normalW.y > 0.85 && vPositionW.y < 1.0) {
									vec3 lfR = vec3(0.0);
									for (int i = 1; i <= 5; i++) {
										vec2 q = (vPositionW.xz + lfW.xy * float(i) * 1.6 - lfP.xy) * lfP.z + 0.5;
										lfR += texture2D(lfTex, q).rgb * (1.0 - float(i) * 0.14);
									}
									color.rgb += lfR * 0.22 * lfW.z * lfP.w;
								}
							}
						}
						#endif`,
				};
			}
		}
		BABYLON.RegisterMaterialPlugin('NightLight', (m) => (m instanceof BABYLON.StandardMaterial && m.getClassName() === 'StandardMaterial' ? new NightLightPlugin(m) : null));
	},
	_emptyTex() {
		if (this._empty) return this._empty;
		const sc = BABYLON.Engine.LastCreatedScene;
		this._empty = new BABYLON.RawTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, BABYLON.Constants.TEXTUREFORMAT_RGBA, sc, false);
		return this._empty;
	},

	// Depois do mundo e da câmera (Game): a textura, a câmera de cima e a malha das fontes.
	init(game) {
		if (!this.on) return;
		this.register();
		this.g = game;
		const sc = game.scene, S = Graphics.level === 'low' ? 256 : 512;
		const rtt = this.tex = new BABYLON.RenderTargetTexture('nightLight', S, sc, false, true, BABYLON.Constants.TEXTURETYPE_HALF_FLOAT);
		rtt.clearColor = new BABYLON.Color4(0, 0, 0, 1);
		rtt.wrapU = rtt.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
		rtt.refreshRate = 0;
		const cam = this.cam = new BABYLON.FreeCamera('nightLightCam', new BABYLON.Vector3(0, 200, 0), sc);
		cam.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
		cam.upVector = new BABYLON.Vector3(0, 0, 1);
		cam.rotation = new BABYLON.Vector3(Math.PI / 2, 0, 0);
		cam.minZ = 1; cam.maxZ = 400;
		cam.layerMask = this.LAYER;
		cam.inputs.clear();
		rtt.activeCamera = cam;
		sc.customRenderTargets.push(rtt);
		// fontes: CAP quads dinâmicos (posição, uv -1..1, cor com a força no alfa)
		const n = this.CAP, pos = this._pos = new Float32Array(n * 12), col = this._col = new Float32Array(n * 16), uv = new Float32Array(n * 8), idx = new Uint32Array(n * 6);
		for (let q = 0; q < n; q++) {
			uv.set([-1, -1, 1, -1, 1, 1, -1, 1], q * 8);
			idx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
		}
		const mesh = this.mesh = new BABYLON.Mesh('nightLightSrc', sc), vd = new BABYLON.VertexData();
		vd.positions = pos; vd.colors = col; vd.uvs = uv; vd.indices = idx;
		vd.applyToMesh(mesh, true);
		mesh.layerMask = this.LAYER;
		mesh.alwaysSelectAsActiveMesh = true;
		mesh.isPickable = false;
		mesh.material = this._srcMat(sc);
		rtt.renderList = [mesh];
		this._grid = null;
	},
	_srcMat(sc) {
		BABYLON.Effect.ShadersStore.nightSrcVertexShader = `
			precision highp float;
			attribute vec3 position; attribute vec2 uv; attribute vec4 color;
			uniform mat4 viewProjection;
			varying vec2 vUV; varying vec4 vC;
			void main(void) { vUV = uv; vC = color; gl_Position = viewProjection * vec4(position, 1.0); }`;
		BABYLON.Effect.ShadersStore.nightSrcFragmentShader = `
			precision highp float;
			varying vec2 vUV; varying vec4 vC;
			void main(void) {
				float d = 1.0 - clamp(dot(vUV, vUV), 0.0, 1.0);
				gl_FragColor = vec4(vC.rgb * vC.a * d * d * d, 1.0);
			}`;
		const m = new BABYLON.ShaderMaterial('nightSrc', sc, { vertex: 'nightSrc', fragment: 'nightSrc' }, { attributes: ['position', 'uv', 'color'], uniforms: ['viewProjection'] });
		m.alphaMode = BABYLON.Constants.ALPHA_ONEONE;
		m.needAlphaBlending = () => true;
		m.disableDepthWrite = true;
		m.depthFunction = BABYLON.Constants.ALWAYS;
		m.backFaceCulling = false;
		return m;
	},

	// Postes e lojas: uma grade (células de 32 u) para achar os da vizinhança sem varrer o mapa inteiro.
	_buildGrid(wb) {
		const G = new Map(), C = 32, add = (x, z, o) => { const k = Math.floor(x / C) + ',' + Math.floor(z / C); (G.get(k) || G.set(k, []).get(k)).push(o); };
		for (const l of wb.streetLamps || []) add(l.hx, l.hz, { t: 0, l });
		for (const s of wb.shopList || []) add(s.x, s.z, { t: 1, s });
		for (const l of wb._favLamps || []) add(l.x, l.z, { t: 2, l });
		this._grid = { G, C };
	},

	// Um quad de luz: centro (x, z), eixo (ax, az) de meia-largura `ra` e o perpendicular de meia-largura `rb`, cor × força.
	_q: 0,
	_quad(x, z, ax, az, ra, rb, r, g, b, k) {
		if (this._q >= this.CAP || k <= 0.005) return;
		const q = this._q++, P = this._pos, Cc = this._col, px = -az, pz = ax, o = q * 12, y = 0;
		const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
		for (let i = 0; i < 4; i++) {
			const u = c[i][0], v = c[i][1];
			P[o + i * 3] = x + ax * ra * u + px * rb * v; P[o + i * 3 + 1] = y; P[o + i * 3 + 2] = z + az * ra * u + pz * rb * v;
			Cc[q * 16 + i * 4] = r; Cc[q * 16 + i * 4 + 1] = g; Cc[q * 16 + i * 4 + 2] = b; Cc[q * 16 + i * 4 + 3] = k;
		}
	},

	// Todo quadro (Game): à noite, junta as fontes perto da câmera, posiciona a câmera de cima e manda redesenhar o campo.
	update(game) {
		if (!this.tex) return;
		const wb = game.gameEngine.world, lvl = wb && wb._lampLevel || 0, P = this.P;
		if (lvl <= 0.01) { if (P.w !== 0) { P.w = 0; this.tex.refreshRate = 0; } return; }
		if (!this._grid) this._buildGrid(wb);
		const C = game.camera, f = C.focus, gh = C.groundHalf(), H = Math.min(220, Math.hypot(gh.x, gh.z) + 14);
		this.cam.position.set(f.x, 200, f.z);
		this.cam.orthoLeft = -H; this.cam.orthoRight = H; this.cam.orthoBottom = -H; this.cam.orthoTop = H;
		P.set(f.x, f.z, 1 / (2 * H), Config.light.nightGain * lvl);
		const yaw = CompassCamera.yaw || 0, wet = typeof Weather !== 'undefined' && Weather.cur ? Weather.cur.k : 0;
		this.W.set(Math.sin(yaw), Math.cos(yaw), Math.min(1, wet * 1.2), 0);      // (o rastro do reflexo: para o norte da tela, longe da câmera)
		this._q = 0;
		const { G, C: cell } = this._grid, i0 = Math.floor((f.x - H) / cell), i1 = Math.floor((f.x + H) / cell), j0 = Math.floor((f.z - H) / cell), j1 = Math.floor((f.z + H) / cell);
		for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
			const L = G.get(i + ',' + j);
			if (L) for (const o of L) {
				if (o.t === 0) { if (o.l.alive !== false) this._quad(o.l.hx, o.l.hz, 1, 0, 7.5, 7.5, 1.0, 0.78, 0.48, 0.8); }
				else if (o.t === 1) { const c = o.s.c; this._quad(o.s.x, o.s.z, 1, 0, 5, 5, 0.45 + c[0] * 0.55, 0.45 + c[1] * 0.55, 0.45 + c[2] * 0.55, 0.6); }
				else { const l = o.l; this._quad(l.x, l.z, 1, 0, 7.5, 7.5, 1.0, 0.72, 0.38, (l.cur != null ? l.cur : 0.6) * 1.1); }
			}
		}
		for (const s of (game.carLights && game.carLights.lightSrc) || []) {
			if (s.kind === 'head') this._quad(s.x, s.z, s.fx, s.fz, 9, 5, 1.0, 0.9, 0.72, 1.15 * s.k);
			else this._quad(s.x, s.z, 1, 0, 3, 3, 1.0, 0.12, 0.08, 0.7 * s.k);
		}
		// os quads que sobraram: área zero
		this._pos.fill(0, this._q * 12);
		this.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, this._pos, false, false);
		this.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, this._col, false, false);
		this.tex.refreshRate = 1;
	},
};
NightLights.register();
