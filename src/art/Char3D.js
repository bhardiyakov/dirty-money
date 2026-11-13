// ============================================================================
// Char3D — o personagem em 3D DE VERDADE, ao vivo na GPU (no lugar do desenho 2,5D do atlas).
//
// O gerador dos personagens (tools/asset_baker/generator, empacotado no Worker do guarda-roupa: assets/baked/wardrobe.worker.js) é o
// mesmo que desenha os atlas: ele assa a ficha do personagem (corpo da malha 3D, cabelo, roupa, bolsa, armas) em PONTOS da superfície,
// cada um no espaço do seu osso (a malha com o 2º osso e o peso: skin linear de 2 ossos), e anima o esqueleto em todos os clipes. Em vez
// de "fotografar" cada pose em 16 direções, o Worker manda ao jogo:
//   • os pontos (uma vez por visual): posição/normal no osso 1 e no osso 2, peso, material e tom;
//   • por clipe (quando ele toca pela 1ª vez): as matrizes dos 16 ossos em cada quadro e os objetos na mão (arma, garrafa, celular…).
// A GPU monta o boneco a cada quadro (shader 'char3d': skin, luz do sol em faixas como o desenho, cor pela rampa de 5 tons de cada
// material da ficha — os mesmos tons do atlas) e desenha cada ponto como um disquinho do tamanho certo na tela — o mesmo visual, agora
// visto de qualquer ângulo pela câmera de verdade, com todas as animações, roupas, bolsas e armas.
//
// O SpriteActor continua sendo a lógica do personagem (clipe, quadro, rumo, posição, pulo, visibilidade): este ator só o LÊ a cada
// quadro e esconde o desenho 2,5D dele (layerMask 0) enquanto o 3D está pronto. Clipe que o gerador não tem (desenho antigo, pilotando
// de uma folha antiga) ou ainda chegando do Worker: o 2,5D aparece no lugar, sem buraco.
//
// Fase 1: o jogador (Config.art.char3d.player). Os NPCs usam o mesmo ator numa fase seguinte.
// ============================================================================

const Char3D = {
	get C() { return (Config.art && Config.art.char3d) || {}; },
	get on() {
		const C = this.C, q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('boneco') : null;
		return C.on !== false && q !== '2d' && typeof Worker === 'function' && typeof Wardrobe !== 'undefined';
	},
	BONES: 16,
	_shader() {
		if (BABYLON.Effect.ShadersStore.char3dVertexShader) return;
		BABYLON.Effect.ShadersStore.char3dVertexShader = `
			precision highp float;
			attribute vec3 position;     // ponto no espaço do osso 1 (unidades do gerador: x direita, y frente, z cima)
			attribute vec3 normal;
			attribute vec3 p2;           // o mesmo ponto no espaço do osso 2 (malha 3D)
			attribute vec3 n2;
			attribute vec4 sk;           // osso 1, osso 2, peso do 2
			attribute vec2 mt;           // material, tom
			uniform mat4 world;
			uniform mat4 viewProjection;
			uniform vec4 B[48];          // 16 ossos × 3 linhas (R | t)
			uniform float unit;          // m por unidade do gerador (× escala da pose)
			uniform float pScale;        // px de tela por m a 1 m da câmera (altura da tela × projeção / 2)
			uniform float splat;         // diâmetro do ponto (m)
			uniform vec3 eye;
			uniform vec3 sunL;           // para onde está o sol (mundo)
			varying vec2 vMt;
			varying float vLev;
			vec3 xp(int b, vec3 p) { vec4 r0 = B[b * 3], r1 = B[b * 3 + 1], r2 = B[b * 3 + 2]; return vec3(dot(r0.xyz, p) + r0.w, dot(r1.xyz, p) + r1.w, dot(r2.xyz, p) + r2.w); }
			vec3 xn(int b, vec3 n) { return vec3(dot(B[b * 3].xyz, n), dot(B[b * 3 + 1].xyz, n), dot(B[b * 3 + 2].xyz, n)); }
			void main(void) {
				int b1 = int(sk.x + 0.5), b2 = int(sk.y + 0.5);
				float w = sk.z;
				vec3 p = xp(b1, position), n = xn(b1, normal);
				if (w > 0.0) { p = mix(p, xp(b2, p2), w); n = mix(n, xn(b2, n2), w); }
				vec4 wp = world * vec4(vec3(p.x, p.z, p.y) * unit, 1.0);
				vec3 nw = normalize((world * vec4(n.x, n.z, n.y, 0.0)).xyz);
				vec3 V = normalize(eye - wp.xyz);
				if (dot(nw, V) < -0.2) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }    // (de costas: atrás do resto)
				#ifdef SIL
				if (p.z < 12.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }     // (os pés rente ao chão: o chão não esconde ninguém)
				wp.xyz += V * 0.06;          // (raio-X: folga contra o empate de profundidade com o próprio corpo)
				#endif
				gl_Position = viewProjection * wp;
				gl_PointSize = clamp(splat * pScale / max(gl_Position.w, 0.05), 1.0, 48.0);
				// luz em faixas, como o desenho (NpcGenRender, sombreado de 5 tons): 1 + degraus da luz + o tom do ponto (textura)
				float d = dot(nw, sunL);
				float lev = 1.0 + smoothstep(-0.36, -0.24, d) + smoothstep(0.24, 0.36, d) + smoothstep(0.74, 0.86, d) + clamp(mt.y, -1.5, 1.0);      // (tom: no atlas, a média do pixel suavizava as dobras mais fundas)
				lev += 0.35 * clamp(dot(nw, V), 0.0, 1.0) - 0.15;                // (o que encara a câmera um pouco mais claro: volume)
				vLev = clamp(lev, 0.0, 4.0);
				vMt = mt;
			}`;
		BABYLON.Effect.ShadersStore.char3dFragmentShader = `
			precision highp float;
			varying vec2 vMt;
			varying float vLev;
			uniform sampler2D ramps;     // 5 tons (x) × 32 materiais (y)
			uniform vec3 tint;           // dia/noite (SpriteMaterial.sharedTint)
			uniform float shade;         // 1 ao sol, ~0,66 na sombra de um prédio
			uniform vec4 silhouette;     // raio-X (XRaySilhouette): cor chapada e força
			void main(void) {
				vec2 q = gl_PointCoord - 0.5;
				if (dot(q, q) > 0.25) discard;
				#ifdef SIL
				gl_FragColor = vec4(silhouette.rgb * silhouette.a, silhouette.a); return;
				#endif
				vec3 c = texture2D(ramps, vec2((vLev + 0.5) / 5.0, (floor(vMt.x + 0.5) + 0.5) / 32.0)).rgb;
				gl_FragColor = vec4(c * tint * shade, 1.0);
			}`;
	},
};

// Um personagem 3D que segue um SpriteActor. spec() = a ficha do gerador (muda: o visual é refeito).
class Char3DActor {
	constructor(scene, actor, spec, { spacing = 0.8, name = 'char3d' } = {}) {
		Char3D._shader();
		this.scene = scene; this.actor = actor; this.specFn = spec; this.spacing = spacing; this.name = name;
		this.root = new BABYLON.TransformNode(name, scene);
		this.clips = new Map();          // 'nome:arma' → { n, fps, loop, B, sc, props } | 'wait' | 'fail'
		this.props = new Map();          // nome do objeto → { mesh, mat, B }
		this.ready = false; this.shown = false; this._job = 0; this._sig = ''; this._chk = 0;
		this._B = new Float32Array(48 * 4);
		this._bind = { eye: new BABYLON.Vector3(), sun: new BABYLON.Vector3(-0.6, 1.8, 0.45).normalize() };
		const sd = Config.light && Config.light.sunDir;
		if (sd) this._bind.sun.set(-sd[0], -sd[1], -sd[2]).normalize();
		actor._c3 = this;                // (o raio-X do jogador usa o boneco 3D enquanto ele está à mostra)
		this._shadow();
		this._load();
		this._obs = scene.onBeforeRenderObservable.add(() => this.update());
	}

	_worker() {
		if (this.w) return this.w;
		const w = this.w = new Worker(Wardrobe.URL);
		w.onmessage = (e) => this._msg(e.data);
		w.onerror = (e) => { if (e.preventDefault) e.preventDefault(); console.warn('Char3D: o gerador não abriu', e.message || e); this.failed = true; this._show2d(true); };
		return w;
	}
	_spec() { const s = this.specFn(); return JSON.parse(JSON.stringify(s)); }
	_load() {
		const spec = this._spec();
		this._sig = JSON.stringify(spec);
		this._cur = spec;
		this._job++;
		this.clips.clear();
		this._want = null;
		this._worker().postMessage({ type: 'char3d', job: this._job, spec, spacing: this.spacing });
	}
	_msg(m) {
		if (m.job !== this._job) return;
		if (m.error) { console.warn('Char3D:', m.error); if (this._want) { this.clips.set(this._want, 'fail'); this._want = null; } return; }
		if (m.char3d) this._build(m.char3d);
		else if (m.clip3d) { const c = m.clip3d; this.clips.set(c.key, c); for (const [k, p] of Object.entries(c.newProps || {})) this._prop(k, p); if (this._want === c.key) this._want = null; }
	}

	// ---------------------------------------------------------------- malhas
	_mat(name, sil = false) {
		const m = new BABYLON.ShaderMaterial(name, this.scene, { vertex: 'char3d', fragment: 'char3d' }, {
			attributes: ['position', 'normal', 'p2', 'n2', 'sk', 'mt'],
			uniforms: ['world', 'viewProjection', 'B', 'unit', 'pScale', 'splat', 'eye', 'sunL', 'tint', 'shade', 'silhouette'],
			samplers: ['ramps'],
			defines: sil ? ['#define SIL'] : [],
			needAlphaBlending: sil,
		});
		m.setVector4('silhouette', sil && typeof NpcArt !== 'undefined' ? NpcArt.SILHOUETTE : new BABYLON.Vector4(0, 0, 0, 0));
		if (sil) { m.alphaMode = BABYLON.Engine.ALPHA_PREMULTIPLIED; m.disableDepthWrite = true; }
		m.fillMode = BABYLON.Material.PointFillMode;
		m.backFaceCulling = false;
		m.setTexture('ramps', this._ramps);
		m.setVector3('eye', this._bind.eye);
		m.setVector3('sunL', this._bind.sun);
		m.setColor3('tint', typeof SpriteMaterial !== 'undefined' ? SpriteMaterial.sharedTint() : BABYLON.Color3.White());
		m.setFloat('shade', 1);
		return m;
	}
	_points(name, n, P1, N1, P2, N2, SK, MT) {
		const mesh = new BABYLON.Mesh(name, this.scene);
		const E = this.scene.getEngine(), vb = (data, kind, size) => mesh.setVerticesBuffer(new BABYLON.VertexBuffer(E, data, kind, false, false, size));
		vb(P1, 'position', 3); vb(N1, 'normal', 3); vb(P2 || P1, 'p2', 3); vb(N2 || N1, 'n2', 3); vb(SK, 'sk', 4); vb(MT, 'mt', 2);
		mesh.isUnIndexed = true;
		mesh._unIndexed = true;
		mesh.subMeshes = [];
		new BABYLON.SubMesh(0, 0, n, 0, n, mesh);
		mesh.isPickable = false;
		mesh.alwaysSelectAsActiveMesh = true;                 // (os pontos estão no espaço dos ossos: a caixa não vale)
		mesh.parent = this.root;
		mesh.renderingGroupId = this.actor.mesh.renderingGroupId;
		return mesh;
	}
	_build(c) {
		this._dispose(false);
		this.unit = (c.scale || 1) / ((Config.art && Config.art.npcPpu) || 26) / 2;          // (m por unidade: escala / (PPU / k 0,5))
		this._ramps = new BABYLON.RawTexture(c.ramps, 5, 32, BABYLON.Engine.TEXTUREFORMAT_RGBA, this.scene, false, false, BABYLON.Texture.BILINEAR_SAMPLINGMODE);
		this._ramps.wrapU = this._ramps.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
		this.body = this._points(this.name + '_corpo', c.n, c.p1, c.n1, c.p2, c.n2, c.sk, c.mt);
		this.body.material = this.bodyMat = this._mat(this.name + '_mat');
		this.bodyMat.onBindObservable.add(() => this._bindCommon(this.bodyMat, this._B));
		this._xrayBuild();
		this.ready = true;
	}
	// RAIO-X (render/XRaySilhouette.js): o jogador visto ATRÁS do que o esconde, em silhueta dourada — as mesmas duas cópias do 2,5D,
	// agora do boneco 3D: 1) atrás do que grava profundidade (prédio, muro, carro: só onde já há algo mais perto — GREATER), marcando 2
	// no stencil; 2) debaixo da copa das árvores (a máscara delas marca 1 no stencil: pinta onde ainda é 1, sem teste de profundidade).
	_xrayBuild() {
		if (typeof XRaySilhouette === 'undefined') return;
		const C = BABYLON.Constants, L = XRaySilhouette.DRAW_LAST;
		// (o corpo marca 2 no stencil onde ele mesmo aparece: os pontos de trás dele — que passariam no GREATER — não viram silhueta)
		XRaySilhouette.stencil(this.body, C.ALWAYS, 2, C.REPLACE);
		this._xr = [[false, L, C.NOTEQUAL, 2, C.REPLACE, C.GREATER], [true, L + 1, C.EQUAL, 1, C.KEEP, C.ALWAYS]].map(([over, ai, func, ref, pass, depth]) => {
			const m = this.body.clone(this.name + (over ? '_xrayC' : '_xray'), this.root);
			m.isUnIndexed = true; m._unIndexed = true;
			m.isPickable = false; m.alwaysSelectAsActiveMesh = true; m.alphaIndex = ai; m.renderingGroupId = this.body.renderingGroupId;
			const mat = m.material = this._mat(m.name + '_mat', true);
			mat.depthFunction = depth;
			mat.onBindObservable.add(() => this._bindCommon(mat, this._B));
			XRaySilhouette.stencil(m, func, ref, pass);
			m.setEnabled(false);
			return m;
		});
	}
	// Ligado pelo XRaySilhouette.update a cada quadro (no lugar das cópias do desenho 2,5D).
	xray(on) { if (this._xr) for (const m of this._xr) if (m.isEnabled() !== on) m.setEnabled(on); }
	_prop(name, p) {
		if (this.props.has(name) || !this.ready) return;
		const n = p.n, sk = new Float32Array(n * 4);
		const mesh = this._points(this.name + '_' + name, n, p.p, p.nrm, null, null, sk, p.mt);
		const mat = this._mat(this.name + '_' + name + '_mat'), B = new Float32Array(48 * 4);
		mesh.material = mat;
		mat.onBindObservable.add(() => this._bindCommon(mat, B));
		mesh.setEnabled(false);
		this.props.set(name, { mesh, mat, B });
	}
	_bindCommon(m, B) {
		const e = m.getEffect();
		if (!e) return;
		e.setArray4('B', B);
		e.setFloat('unit', this.unit * (this._sc || 1));
		e.setFloat('pScale', this._pScale || 400);
		e.setFloat('splat', this.spacing * this.unit * (this.C.splat || 2.1));
		e.setFloat('shade', this.actor.shade || 1);
	}
	get C() { return Char3D.C; }
	// Sombra no chão (o desenho 2,5D tinha a dele): uma mancha macia sob os pés.
	_shadow() {
		const t = new BABYLON.DynamicTexture(this.name + '_sombraTex', 64, this.scene, false);
		const g = t.getContext(), r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
		r.addColorStop(0, 'rgba(0,0,0,0.5)'); r.addColorStop(0.6, 'rgba(0,0,0,0.3)'); r.addColorStop(1, 'rgba(0,0,0,0)');
		g.fillStyle = r; g.fillRect(0, 0, 64, 64); t.update(); t.hasAlpha = true;
		const s = this.shadowMesh = BABYLON.MeshBuilder.CreateGround(this.name + '_sombra', { width: 0.9, height: 0.9 }, this.scene);
		const m = new BABYLON.StandardMaterial(this.name + '_sombraMat', this.scene);
		m.diffuseTexture = t; m.useAlphaFromDiffuseTexture = true; m.disableLighting = true; m.emissiveColor = BABYLON.Color3.White(); m.zOffset = -2;
		s.material = m; s.isPickable = false; s.parent = this.root; s.position.y = 0.04; s.setEnabled(false);
	}

	// ---------------------------------------------------------------- a cada quadro
	_show2d(on) {
		const a = this.actor, mask = on ? 0x0FFFFFFF : 0;
		if (a.mesh.layerMask !== mask) a.mesh.layerMask = mask;
		if (a._ov && a._ov.layerMask !== mask) a._ov.layerMask = mask;
	}
	_hide3d() {
		if (!this.shown) return;
		this.shown = false;
		this.root.setEnabled(false);
	}
	update() {
		const a = this.actor;
		if ((this._chk -= this.scene.getEngine().getDeltaTime() / 1000) <= 0) {        // visual novo (guarda-roupa, bolsa): refaz
			this._chk = 1;
			const sig = JSON.stringify(this.specFn());
			if (sig !== this._sig) this._load();
		}
		const c = a.clip, vis = a.mesh.isEnabled() && a.mesh.isVisible && !!c;
		if (!this.ready || this.failed || !vis || !c.npc) { this._hide3d(); this._show2d(true); return; }
		const key = c.name + ':' + (c.weapon || 'none');
		let K = this.clips.get(key);
		if (K === undefined && !this._want) { this._want = key; this.clips.set(key, 'wait'); this.w.postMessage({ type: 'char3dClip', job: this._job, spec: this._cur, spacing: this.spacing, key }); }
		if (K === 'fail' || ((K === undefined || K === 'wait') && !this._last)) { this._hide3d(); this._show2d(true); return; }
		if (K && K !== 'wait') this._last = K;
		else K = this._last;                                       // (o clipe novo ainda chegando: segura a última pose)
		this._pose(K, a, K.key === key);
		this._place(a);
		if (!this.shown) { this.shown = true; this.root.setEnabled(true); }
		this._show2d(false);
	}
	// Quadro do clipe na mesma FASE do SpriteActor (o número de quadros é o mesmo do atlas; misturando os dois vizinhos: suave).
	_pose(K, a, same) {
		const n = K.n, c = a.clip;
		let u = 0;
		if (same && c.frames) u = a._lean === c && c.frames > 1 ? (a.time / (c.frames - 1)) * (n - 1) : (a.time / c.frames) * n;
		else if (same) u = 0;
		else u = this._u || 0;
		this._u = u;
		let f0, f1, t;
		if (K.loop) { const x = ((u % n) + n) % n; f0 = Math.floor(x); f1 = (f0 + 1) % n; t = x - f0; }
		else { const x = Math.max(0, Math.min(n - 1, u)); f0 = Math.floor(x); f1 = Math.min(n - 1, f0 + 1); t = x - f0; }
		if (!(this.C.blend !== false)) t = 0;
		const NB = Char3D.BONES, B = K.B, out = this._B;
		for (let i = 0; i < NB; i++) {
			const o0 = (f0 * NB + i) * 12, o1 = (f1 * NB + i) * 12, d = i * 12;
			for (let r = 0; r < 3; r++) {
				const o = d + r * 4;
				out[o] = B[o0 + r * 3] + (B[o1 + r * 3] - B[o0 + r * 3]) * t;
				out[o + 1] = B[o0 + r * 3 + 1] + (B[o1 + r * 3 + 1] - B[o0 + r * 3 + 1]) * t;
				out[o + 2] = B[o0 + r * 3 + 2] + (B[o1 + r * 3 + 2] - B[o0 + r * 3 + 2]) * t;
				out[o + 3] = B[o0 + 9 + r] + (B[o1 + 9 + r] - B[o0 + 9 + r]) * t;
			}
		}
		this._sc = K.sc[f0] + (K.sc[f1] - K.sc[f0]) * t;
		// objetos na mão: os do quadro mais perto
		const fp = K.props[t < 0.5 ? f0 : f1] || [], on = new Set();
		for (const [name, M] of fp) {
			const P = this.props.get(name);
			if (!P) continue;
			on.add(name);
			for (let r = 0; r < 3; r++) { P.B[r * 4] = M[r * 3]; P.B[r * 4 + 1] = M[r * 3 + 1]; P.B[r * 4 + 2] = M[r * 3 + 2]; P.B[r * 4 + 3] = M[9 + r]; }
			if (!P.mesh.isEnabled()) P.mesh.setEnabled(true);
		}
		for (const [name, P] of this.props) if (!on.has(name) && P.mesh.isEnabled()) P.mesh.setEnabled(false);
	}
	// Onde o SpriteActor está: posição (com o relevo e o pulo: o quad mora a 0,5 acima do chão), rumo; e a câmera.
	_place(a) {
		const m = a.mesh, r = this.root, ly = a.lift ? a.lift.position.y : 0;
		r.position.set(m.position.x, ly + m.position.y - (typeof NpcArt !== 'undefined' ? NpcArt.LAYER_Y : 0.5), m.position.z);
		r.rotation.y = a.heading || 0;
		this.shadowMesh.setEnabled(!(a._wl > 0.3));
		const cam = this.scene.activeCamera;
		if (cam) {
			this._bind.eye.copyFrom(cam.globalPosition || cam.position);
			const E = this.scene.getEngine(), pm = cam.getProjectionMatrix();
			this._pScale = (E.getRenderHeight() * pm.m[5]) / 2;
		}
	}
	_dispose(all = true) {
		for (const P of this.props.values()) { P.mesh.dispose(); P.mat.dispose(); }
		this.props.clear();
		if (this._xr) { for (const m of this._xr) { m.material.dispose(); m.dispose(); } this._xr = null; }
		if (this.body) { this.body.dispose(); this.bodyMat.dispose(); this.body = null; }
		if (this._ramps) { this._ramps.dispose(); this._ramps = null; }
		this.ready = false; this._last = null; this._want = null;
		if (all) {
			this.scene.onBeforeRenderObservable.remove(this._obs);
			if (this.w) this.w.terminate();
			this.root.dispose();
			this._show2d(true);
		}
	}
}
