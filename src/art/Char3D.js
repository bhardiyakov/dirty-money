// ============================================================================
// Char3D — os personagens em 3D DE VERDADE, ao vivo na GPU (no lugar do desenho 2,5D do atlas). Ver docs/personagens-3d.md.
//
// O gerador dos personagens (tools/asset_baker/generator, empacotado no Worker do guarda-roupa: assets/baked/wardrobe.worker.js) é o
// mesmo que desenha os atlas: ele assa a ficha do personagem (corpo da malha 3D, cabelo, roupa, bolsa, armas) em PONTOS da superfície,
// cada um no espaço do seu osso (a malha com o 2º osso e o peso: skin linear de 2 ossos), e anima o esqueleto em todos os clipes. Em vez
// de "fotografar" cada pose em 16 direções, o Worker manda ao jogo:
//   • os pontos (uma vez por MODELO): posição/normal no osso 1 e no osso 2, peso, material e tom;
//   • por clipe (quando ele toca pela 1ª vez): as matrizes dos 16 ossos em cada quadro e os objetos na mão (arma, garrafa, celular…).
// A GPU monta o boneco a cada quadro (shader 'char3d': skin, luz do sol em faixas como o desenho, cor pela rampa de 5 tons de cada
// material — os mesmos tons do atlas) e desenha cada ponto como um disquinho do tamanho certo na tela.
//
//   Char3DModel  uma ficha assada: a do JOGADOR (as cores dela, rampas próprias) ou a de um TIPO de NPC (a forma é a mesma em todas as
//                variantes do tipo — as cores vêm da paleta do NpcArt, pela linha do ator). Pontos, clipes e objetos são compartilhados.
//   Char3DActor  um personagem na tela: segue um SpriteActor (que continua sendo a lógica: clipe, fase, rumo, posição, pulo,
//                visibilidade) e esconde o desenho 2,5D dele (layerMask 0) enquanto o 3D está à mostra. Clipe que o gerador não tem
//                (folha antiga) ou que ainda está chegando: o 2,5D aparece no lugar, sem buraco.
//   Char3D.tick  a cada quadro: o jogador, e os NPCs MAIS PERTO da câmera (até Config.art.char3d.npc.max, num raio) — os outros
//                seguem 2,5D (de longe a diferença não aparece, e o celular não aguentaria centenas de bonecos de pontos).
// ============================================================================

const Char3D = {
	get C() { return (Config.art && Config.art.char3d) || {}; },
	get on() {
		const C = this.C, q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('boneco') : null;
		return C.on !== false && q !== '2d' && typeof Worker === 'function' && typeof Wardrobe !== 'undefined';
	},
	get npcOn() { const N = this.C.npc; return this.on && !!N && N.on !== false && typeof NpcArt !== 'undefined' && !!NpcArt._pal; },
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
			uniform sampler2D ramps;     // 5 tons (x) × 32 materiais (y) — a ficha do jogador
			uniform sampler2D palette;   // NPCs: a paleta do NpcArt (256 códigos = material × 8 + tom, uma linha por variante)
			uniform float palRows;
			uniform float row;
			uniform vec3 tint;           // dia/noite (SpriteMaterial.sharedTint)
			uniform float shade;         // 1 ao sol, ~0,66 na sombra de um prédio
			uniform vec4 silhouette;     // raio-X (XRaySilhouette): cor chapada e força
			void main(void) {
				vec2 q = gl_PointCoord - 0.5;
				if (dot(q, q) > 0.25) discard;
				#ifdef SIL
				gl_FragColor = vec4(silhouette.rgb * silhouette.a, silhouette.a); return;
				#endif
				#ifdef PAL
				float m = floor(vMt.x + 0.5), i0 = floor(vLev), i1 = min(i0 + 1.0, 4.0), y = (row + 0.5) / palRows;
				vec3 c = mix(texture2D(palette, vec2((m * 8.0 + i0 + 0.5) / 256.0, y)).rgb, texture2D(palette, vec2((m * 8.0 + i1 + 0.5) / 256.0, y)).rgb, vLev - i0);
				#else
				vec3 c = texture2D(ramps, vec2((vLev + 0.5) / 5.0, (floor(vMt.x + 0.5) + 0.5) / 32.0)).rgb;
				#endif
				gl_FragColor = vec4(c * tint * shade, 1.0);
			}`;
	},

	// ---------------------------------------------------------------- Workers e modelos
	_ws: {}, _models: new Map(), _types: new Map(), _mid: 0,
	// Um Worker para o jogador (o visual dele nunca espera os NPCs) e um para os NPCs.
	worker(kind) {
		let w = this._ws[kind];
		if (w) return w;
		w = this._ws[kind] = new Worker(Wardrobe.URL);
		w.onmessage = (e) => { const m = e.data, M = this._models.get(m.mid); if (M) M._msg(m); };
		w.onerror = (e) => { if (e.preventDefault) e.preventDefault(); console.warn('Char3D: o gerador não abriu', e.message || e); for (const M of this._models.values()) if (M.kind === kind) M.failed = true; };
		return w;
	},
	// Modelo de um tipo de NPC (um por tipo: as variantes só mudam a cor).
	typeModel(type) {
		let M = this._types.get(type);
		if (!M) { M = new Char3DModel(this._scene, { npc: type, spacing: (this.C.npc && this.C.npc.spacing) || 1.3, kind: 'npc' }); this._types.set(type, M); }
		return M;
	},

	// ---------------------------------------------------------------- a cada quadro
	init(game) {
		if (!this.on || this._game) return;
		this._game = game; this._scene = game.scene; this._shader();
		this.npcs = new Map();                   // SpriteActor → Char3DActor
		this._pick = 0;
		this._view = { eye: new BABYLON.Vector3(), pScale: 400 };
		const sd = Config.light && Config.light.sunDir;
		this.sun = sd ? new BABYLON.Vector3(-sd[0], -sd[1], -sd[2]).normalize() : new BABYLON.Vector3(-0.6, 1.8, 0.45).normalize();
		if (this.C.player !== false && typeof PlayerLook !== 'undefined') {
			game.player.char3d = new Char3DActor(this._scene, game.player.actor, null, { name: 'jogador3d', xray: true });
			this._playerSpec(true);
		}
		this._obs = this._scene.onBeforeRenderObservable.add(() => this.tick());
	},
	// O visual do jogador (guarda-roupa, bolsa, aparência): mudou → um modelo novo (o antigo some quando o novo fica pronto).
	_playerSpec(force) {
		const P = this._game.player.char3d, spec = JSON.parse(JSON.stringify(PlayerLook.spec())), sig = JSON.stringify(spec);
		if (!force && sig === this._pSig) return;
		this._pSig = sig;
		const M = new Char3DModel(this._scene, { spec, spacing: this.C.spacing || 0.8, kind: 'player' });
		M.onReady = () => { const old = P.model; P.setModel(M); if (old && old !== M) old.dispose(); };
		this._pNext = M;
	},
	tick() {
		const sc = this._scene, cam = sc.activeCamera, dt = sc.getEngine().getDeltaTime() / 1000, V = this._view;
		if (cam) {
			V.eye.copyFrom(cam.globalPosition || cam.position);
			V.pScale = (sc.getEngine().getRenderHeight() * cam.getProjectionMatrix().m[5]) / 2;
		}
		const pl = this._game.player;
		if (pl.char3d) {
			if ((this._chk = (this._chk || 0) - dt) <= 0) { this._chk = 1; this._playerSpec(false); }
			pl.char3d.update();
		}
		if (this.npcOn) {
			if ((this._pick -= dt) <= 0) { this._pick = 0.25; this._choose(pl); }
			for (const [a, R] of this.npcs) R.update();
		} else if (this.npcs.size) this._choose(null);
	},
	// Os NPCs que ficam 3D: os mais perto da câmera (do jogador), até `max`, dentro de `radius` (folga de 15% para quem já está 3D: ninguém
	// pisca na borda). Fica de fora: o próprio jogador, pilotos presos num veículo (o desenho deles é do veículo) e quem não é 2,5D.
	_choose(pl) {
		const N = this.C.npc || {}, max = pl ? (N.max | 0) : 0, R = N.radius || 38, cx = pl ? pl.position.x : 0, cz = pl ? pl.position.z : 0, cand = [];
		if (pl) for (const a of SpriteActor.live) {
			const m = a.mesh, t = a.npcType;
			if (!t || a === pl.actor || !a.clip || !a.clip.npc || !a._placed || m.isDisposed() || !m.isEnabled() || !m.isVisible) continue;
			if (m.parent && m.parent !== a.lift) continue;
			if (!max && !/^protagonista/.test(t)) continue;
			const dx = m.position.x - cx, dz = m.position.z - cz, d = dx * dx + dz * dz, r = this.npcs.has(a) ? R * 1.15 : R;
			if (d < r * r) cand.push([d, a]);
		}
		cand.sort((p, q) => p[0] - q[0]);
		// (o jogador pilotando fica 3D sempre — mesmo no nível Low, que não tem NPCs 3D — e não conta no limite)
		const keep = new Set();
		let k = 0;
		for (const [, a] of cand) if (/^protagonista/.test(a.npcType)) keep.add(a); else if (k < max) { keep.add(a); k++; }
		// (o jogador PILOTANDO — moto, bicicleta, jet ski: o piloto é outro ator, com a folha dele — usa o modelo do visual dele)
		const PM = pl && pl.char3d && pl.char3d.model, hero = (a) => /^protagonista/.test(a.npcType);
		for (const [a, C] of this.npcs) if (!keep.has(a) || (hero(a) && C.model !== PM)) { C.dispose(); this.npcs.delete(a); }
		for (const a of keep) if (!this.npcs.has(a)) {
			if (hero(a)) { if (PM && PM.ready) this.npcs.set(a, new Char3DActor(this._scene, a, PM, { name: 'jogador3d_piloto' })); continue; }
			const type = String((a.sheet && a.sheet.baseId) || a.npcType).replace(/#d\d+$/, ''), M = this.typeModel(type);
			if (M.failed) continue;
			this.npcs.set(a, new Char3DActor(this._scene, a, M, { name: 'npc3d', pal: true }));
		}
	},
};

// ----------------------------------------------------------------------------
// Uma ficha assada (pontos + clipes + objetos na mão), compartilhada por todos os atores que a usam.
// ----------------------------------------------------------------------------
class Char3DModel {
	constructor(scene, { spec = null, npc = null, spacing = 1, kind = 'npc' }) {
		this.scene = scene; this.spacing = spacing; this.kind = kind; this.mid = ++Char3D._mid;
		this.clips = new Map();          // 'nome:arma' → clipe | 'wait' | 'fail'
		this.props = new Map();          // nome do objeto → malha-modelo (escondida; os atores clonam)
		this.ready = false; this.failed = false; this.onReady = null;
		Char3D._models.set(this.mid, this);
		this.w = Char3D.worker(kind);
		this.w.postMessage({ type: 'char3d', job: 1, mid: this.mid, spec, npc, spacing });
	}
	_msg(m) {
		if (m.error) {
			if (m.key) this.clips.set(m.key, 'fail');
			else { this.failed = true; console.warn('Char3D:', m.error.split('\n')[0]); }
			return;
		}
		if (m.char3d) this._build(m.char3d);
		else if (m.clip3d) { const c = m.clip3d; this.clips.set(c.key, c); for (const [k, p] of Object.entries(c.newProps || {})) this._prop(k, p); }
	}
	// Clipe pronto (ou undefined/'wait' enquanto chega, 'fail' se o gerador não tem).
	clip(key) {
		const K = this.clips.get(key);
		if (K === undefined && this.ready) { this.clips.set(key, 'wait'); this.w.postMessage({ type: 'char3dClip', job: 1, mid: this.mid, key }); }
		return K;
	}
	_points(name, n, P1, N1, P2, N2, SK, MT) {
		const mesh = new BABYLON.Mesh(name, this.scene);
		const E = this.scene.getEngine(), vb = (data, kind, size) => mesh.setVerticesBuffer(new BABYLON.VertexBuffer(E, data, kind, false, false, size));
		vb(P1, 'position', 3); vb(N1, 'normal', 3); vb(P2 || P1, 'p2', 3); vb(N2 || N1, 'n2', 3); vb(SK, 'sk', 4); vb(MT, 'mt', 2);
		mesh.isUnIndexed = true; mesh._unIndexed = true;
		mesh.subMeshes = [];
		new BABYLON.SubMesh(0, 0, n, 0, n, mesh);
		mesh.isPickable = false;
		mesh.alwaysSelectAsActiveMesh = true;                 // (os pontos estão no espaço dos ossos: a caixa não vale)
		mesh.setEnabled(false);
		return mesh;
	}
	_build(c) {
		this.unit = (c.scale || 1) / ((Config.art && Config.art.npcPpu) || 26) / 2;          // (m por unidade: escala / (PPU / k 0,5))
		if (c.ramps) {
			this.ramps = new BABYLON.RawTexture(c.ramps, 5, 32, BABYLON.Engine.TEXTUREFORMAT_RGBA, this.scene, false, false, BABYLON.Texture.BILINEAR_SAMPLINGMODE);
			this.ramps.wrapU = this.ramps.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
		}
		this.n = c.n;
		this.body = this._points('c3d_corpo' + this.mid, c.n, c.p1, c.n1, c.p2, c.n2, c.sk, c.mt);
		this.ready = true;
		if (this.onReady) this.onReady(this);
	}
	_prop(name, p) {
		if (this.props.has(name)) return;
		this.props.set(name, this._points('c3d_' + name + this.mid, p.n, p.p, p.nrm, null, null, new Float32Array(p.n * 4), p.mt));
	}
	dispose() {
		this.w.postMessage({ type: 'char3dDrop', mid: this.mid });
		Char3D._models.delete(this.mid);
		for (const m of this.props.values()) m.dispose();
		this.props.clear();
		if (this.body) this.body.dispose();
		if (this.ramps) this.ramps.dispose();
		this.ready = false;
	}
}

// ----------------------------------------------------------------------------
// Um personagem 3D que segue um SpriteActor (o modelo pode chegar depois: setModel).
// ----------------------------------------------------------------------------
class Char3DActor {
	constructor(scene, actor, model, { name = 'char3d', pal = false, xray = false } = {}) {
		this.scene = scene; this.actor = actor; this.name = name; this.pal = pal; this.wantXray = xray;
		this.root = new BABYLON.TransformNode(name, scene);
		this.root.setEnabled(false);
		this.props = new Map();          // nome → { mesh, mat, B }
		this.shown = false;
		this._B = new Float32Array(48 * 4);
		if (xray) actor._c3 = this;      // (o raio-X do jogador usa o boneco 3D enquanto ele está à mostra)
		this._shadow();
		if (model) this.setModel(model);
	}
	get C() { return Char3D.C; }
	setModel(M) {
		this._clear();
		this.model = M; this._last = null; this._built = false;
	}
	// As malhas do ator (clones das do modelo: a geometria é a mesma).
	_buildMeshes() {
		const M = this.model;
		this.body = this._clone(M.body, this.name + '_corpo');
		this.body.material = this.bodyMat = this._mat(this.name + '_mat');
		this.bodyMat.onBindObservable.add(() => this._bindCommon(this.bodyMat, this._B));
		if (this.wantXray) this._xrayBuild();
		this._built = true;
	}
	_clone(src, name) {
		const m = src.clone(name, this.root);
		m.isUnIndexed = true; m._unIndexed = true;
		m.isPickable = false; m.alwaysSelectAsActiveMesh = true;
		m.renderingGroupId = this.actor.mesh.renderingGroupId;
		m.setEnabled(true);
		return m;
	}
	_mat(name, sil = false) {
		const pal = this.pal && !sil, defines = [];
		if (sil) defines.push('#define SIL');
		if (pal) defines.push('#define PAL');
		const m = new BABYLON.ShaderMaterial(name, this.scene, { vertex: 'char3d', fragment: 'char3d' }, {
			attributes: ['position', 'normal', 'p2', 'n2', 'sk', 'mt'],
			uniforms: ['world', 'viewProjection', 'B', 'unit', 'pScale', 'splat', 'eye', 'sunL', 'tint', 'shade', 'silhouette', 'palRows', 'row'],
			samplers: ['ramps', 'palette'],
			defines,
			needAlphaBlending: sil,
		});
		m.setVector4('silhouette', sil && typeof NpcArt !== 'undefined' ? NpcArt.SILHOUETTE : new BABYLON.Vector4(0, 0, 0, 0));
		if (sil) { m.alphaMode = BABYLON.Engine.ALPHA_PREMULTIPLIED; m.disableDepthWrite = true; }
		m.fillMode = BABYLON.Material.PointFillMode;
		m.backFaceCulling = false;
		if (pal) { m.setTexture('palette', NpcArt._pal.tex); m.setFloat('palRows', NpcArt.ROWS); }
		else if (this.model.ramps) m.setTexture('ramps', this.model.ramps);
		m.setVector3('eye', Char3D._view.eye);
		m.setVector3('sunL', Char3D.sun);
		m.setColor3('tint', typeof SpriteMaterial !== 'undefined' ? SpriteMaterial.sharedTint() : BABYLON.Color3.White());
		return m;
	}
	_bindCommon(m, B) {
		const e = m.getEffect(), M = this.model;
		if (!e || !M) return;
		e.setArray4('B', B);
		e.setFloat('unit', M.unit * (this._sc || 1));
		e.setFloat('pScale', Char3D._view.pScale);
		e.setFloat('splat', M.spacing * M.unit * (this.C.splat || 2.1));
		e.setFloat('shade', this.actor.shade || 1);
		if (this.pal) e.setFloat('row', this.actor.npcRow || 0);
	}
	// RAIO-X (render/XRaySilhouette.js): o jogador visto ATRÁS do que o esconde, em silhueta dourada — as mesmas duas cópias do 2,5D,
	// agora do boneco 3D: 1) atrás do que grava profundidade (prédio, muro, carro: só onde já há algo mais perto — GREATER), marcando 2
	// no stencil; 2) debaixo da copa das árvores (a máscara delas marca 1 no stencil: pinta onde ainda é 1, sem teste de profundidade).
	// O corpo marca 2 no stencil onde ele mesmo aparece: os pontos de trás dele (que passariam no GREATER) não viram silhueta.
	_xrayBuild() {
		if (typeof XRaySilhouette === 'undefined') return;
		const C = BABYLON.Constants, L = XRaySilhouette.DRAW_LAST;
		XRaySilhouette.stencil(this.body, C.ALWAYS, 2, C.REPLACE);
		this._xr = [[false, L, C.NOTEQUAL, 2, C.REPLACE, C.GREATER], [true, L + 1, C.EQUAL, 1, C.KEEP, C.ALWAYS]].map(([over, ai, func, ref, pass, depth]) => {
			const m = this._clone(this.model.body, this.name + (over ? '_xrayC' : '_xray'));
			m.alphaIndex = ai;
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
	_prop(name) {
		let P = this.props.get(name);
		if (P !== undefined) return P;
		const src = this.model.props.get(name);
		if (!src) return null;
		const mesh = this._clone(src, this.name + '_' + name), mat = this._mat(mesh.name + '_mat'), B = new Float32Array(48 * 4);
		mesh.material = mat;
		mat.onBindObservable.add(() => this._bindCommon(mat, B));
		mesh.setEnabled(false);
		this.props.set(name, (P = { mesh, mat, B }));
		return P;
	}
	// Sombra no chão (o desenho 2,5D tinha a dele): uma mancha macia sob os pés (material compartilhado).
	_shadow() {
		let m = Char3D._shMat;
		if (!m || m.isDisposed) {
			const t = new BABYLON.DynamicTexture('c3d_sombraTex', 64, this.scene, false);
			const g = t.getContext(), r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
			r.addColorStop(0, 'rgba(0,0,0,0.5)'); r.addColorStop(0.6, 'rgba(0,0,0,0.3)'); r.addColorStop(1, 'rgba(0,0,0,0)');
			g.fillStyle = r; g.fillRect(0, 0, 64, 64); t.update(); t.hasAlpha = true;
			m = Char3D._shMat = new BABYLON.StandardMaterial('c3d_sombraMat', this.scene);
			m.diffuseTexture = t; m.useAlphaFromDiffuseTexture = true; m.disableLighting = true; m.emissiveColor = BABYLON.Color3.White(); m.zOffset = -2;
		}
		const s = this.shadowMesh = BABYLON.MeshBuilder.CreateGround(this.name + '_sombra', { width: 0.9, height: 0.9 }, this.scene);
		s.material = m; s.isPickable = false; s.parent = this.root; s.position.y = 0.04;
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
		const a = this.actor, M = this.model;
		if (M && M.ready && !this._built) this._buildMeshes();
		const c = a.clip, vis = !a.mesh.isDisposed() && a.mesh.isEnabled() && a.mesh.isVisible && !!c;
		if (!this._built || M.failed || !vis || !c.npc) { this._hide3d(); this._show2d(true); return; }
		const key = c.name + ':' + (c.weapon || 'none');
		let K = M.clip(key);
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
		let u;
		if (same) u = c.frames ? (a._lean === c && c.frames > 1 ? (a.time / (c.frames - 1)) * (n - 1) : (a.time / c.frames) * n) : 0;
		else u = this._u || 0;
		this._u = u;
		let f0, f1, t;
		if (K.loop) { const x = ((u % n) + n) % n; f0 = Math.floor(x); f1 = (f0 + 1) % n; t = x - f0; }
		else { const x = Math.max(0, Math.min(n - 1, u)); f0 = Math.floor(x); f1 = Math.min(n - 1, f0 + 1); t = x - f0; }
		if (this.C.blend === false) t = 0;
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
		const fp = K.props[t < 0.5 ? f0 : f1] || [], on = this._on || (this._on = new Set());
		on.clear();
		for (const [name, X] of fp) {
			const P = this._prop(name);
			if (!P) continue;
			on.add(name);
			for (let r = 0; r < 3; r++) { P.B[r * 4] = X[r * 3]; P.B[r * 4 + 1] = X[r * 3 + 1]; P.B[r * 4 + 2] = X[r * 3 + 2]; P.B[r * 4 + 3] = X[9 + r]; }
			if (!P.mesh.isEnabled()) P.mesh.setEnabled(true);
		}
		for (const [name, P] of this.props) if (P && !on.has(name) && P.mesh.isEnabled()) P.mesh.setEnabled(false);
	}
	// Onde o SpriteActor está: posição (com o relevo e o pulo: o quad mora a 0,5 acima do chão) e rumo.
	_place(a) {
		const m = a.mesh, r = this.root, ly = a.lift ? a.lift.position.y : 0;
		r.position.set(m.position.x, ly + m.position.y - (typeof NpcArt !== 'undefined' ? NpcArt.LAYER_Y : 0.5), m.position.z);
		r.rotation.y = a.heading || 0;
		const sh = !(a._wl > 0.3) && !/^(ride_|sit|swim|dive)/.test(a.clip.name);      // (montado ou sentado: os pés não estão no chão)
		if (this.shadowMesh.isEnabled() !== sh) this.shadowMesh.setEnabled(sh);
	}
	// As malhas do ator (não as do modelo).
	_clear() {
		for (const P of this.props.values()) if (P) { P.mesh.dispose(); P.mat.dispose(); }
		this.props.clear();
		if (this._xr) { for (const m of this._xr) { m.material.dispose(); m.dispose(); } this._xr = null; }
		if (this.body) { this.body.dispose(); this.bodyMat.dispose(); this.body = null; }
		this._built = false;
	}
	dispose() {
		this._clear();
		this.shadowMesh.dispose();
		this.root.dispose();
		if (!this.actor.mesh.isDisposed()) this._show2d(true);
		if (this.actor._c3 === this) this.actor._c3 = null;
	}
}
