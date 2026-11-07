// ============================================================================
// Animals3D — os BICHOS em 3D de verdade (referência: a folha de animais ilustrados — boi, porco, cachorro, cabra, ovelha e galo):
// corpo modelado em anéis (lombo, barriga, peito, anca), cabeça com focinho, chifres, orelhas, barbicha, crista, rabo e pernas
// em DUAS partes (coxa e canela, com joelho/jarrete e casco). Substitui os sprites do Livestock (`?bichos=2d` volta a eles).
//
//   • UMA malha por espécie × pelagem, com INSTÂNCIAS (thin instances): todos os porcos rosados sujos na tela = 1 desenho.
//   • ANIMAÇÃO no shader (vértice): cada vértice sabe de que parte é (anP.x: 0 corpo, 1–4 coxas, 5–8 canelas — FE, FD, TE, TD —,
//     9 pescoço e cabeça, 10 rabo, 12 asas) e cada instância manda a pose (anA: fase do passo, andando, correndo, pastando;
//     anB: deitado, semente). A perna gira no quadril e a canela dobra no joelho; ANDAR = passo em diagonal (trote), CORRER =
//     galope (dianteiras juntas, traseiras juntas) com o corpo balançando; PASTAR = o pescoço desce até o chão (a galinha BICA);
//     DEITAR = as pernas dobram debaixo do corpo; o rabo abana (o cachorro abana de verdade), a cabeça olha em volta parada e a
//     galinha bate as asas correndo. MORTO = deitado de lado (a matriz da instância).
//   • ACABAMENTO no shader (fragmento), pelo material de cada vértice (anP.y): PELO em fios (ruído esticado ao longo do corpo),
//     LÃ em cachos, PELE de porco com LAMA (anP.z = o quanto a pelagem é suja), chifre com anéis, casco, olho, PENAS em escamas,
//     crista; as normais entortadas pelo mesmo ruído (o sol pega o pelo) e a borda escurecida (o contorno do desenho da referência).
//
//   Animals3D.on            ligado (Config.art.animals3d; `?bichos=2d` desliga)
//   Animals3D.VAR[sp]       pelagens de cada espécie (nome)
//   Animals3D.draw(lista)   desenha os bichos { sp, vr, x, z, h, ph, mv, run, gz, rs, dead, seed } (Livestock._render)
// ============================================================================

const Animals3D = {
	get on() {
		if (typeof location !== 'undefined' && /[?&]bichos=2d\b/.test(location.search)) return false;
		return !!(typeof Config !== 'undefined' && Config.art && Config.art.animals3d !== false);
	},

	// Pelagens por espécie (a ordem é o índice `vr` do bicho).
	VAR: {
		vaca: ['boi', 'malhada', 'nelore', 'caramelo'],
		cavalo: ['alazao', 'tordilho', 'preto'],
		porco: ['rosa', 'sujo', 'malhado', 'caipira'],
		galinha: ['galo', 'carijo', 'branca', 'pedres'],
		cabra: ['marrom', 'escura', 'creme'],
		ovelha: ['la', 'carneiro', 'preta'],
		cachorro: ['pastor', 'caramelo', 'preto', 'malhado'],
	},

	// RIG de cada espécie (o shader): quadris e joelhos (y, z) da frente e de trás, pivô do pescoço e do rabo, amplitude do passo
	// e do joelho, quique, quanto o corpo desce deitado, ângulo de pastar, ave, abano do rabo, rabo erguido correndo, asa (x, y).
	RIG: {
		vaca:     { hipF: [0.95, 0.62], hipB: [0.98, -0.62], kneeF: [0.47, 0.64], kneeB: [0.55, -0.74], neck: [1.05, 0.75], tail: [1.3, -0.98], stride: 0.3, knee: 0.7, bob: 0.025, drop: 0.58, graze: 1.2, wag: 0, lift: 0.4 },
		cavalo:   { hipF: [1.2, 0.58], hipB: [1.25, -0.58], kneeF: [0.6, 0.6], kneeB: [0.66, -0.7], neck: [1.25, 0.62], tail: [1.45, -0.86], stride: 0.34, knee: 0.85, bob: 0.03, drop: 0.78, graze: 1.6, wag: 0, lift: 0.7 },
		porco:    { hipF: [0.38, 0.36], hipB: [0.4, -0.36], kneeF: [0.2, 0.37], kneeB: [0.2, -0.4], neck: [0.55, 0.45], tail: [0.6, -0.58], stride: 0.38, knee: 0.6, bob: 0.02, drop: 0.3, graze: 0.7, wag: 0.4, lift: 0.2 },
		cabra:    { hipF: [0.64, 0.33], hipB: [0.66, -0.33], kneeF: [0.32, 0.34], kneeB: [0.34, -0.4], neck: [0.6, 0.38], tail: [0.82, -0.5], stride: 0.36, knee: 0.8, bob: 0.025, drop: 0.42, graze: 1.5, wag: 0.5, lift: 0.3 },
		ovelha:   { hipF: [0.58, 0.32], hipB: [0.6, -0.33], kneeF: [0.3, 0.33], kneeB: [0.32, -0.39], neck: [0.65, 0.42], tail: [0.8, -0.52], stride: 0.34, knee: 0.75, bob: 0.025, drop: 0.36, graze: 1.5, wag: 0.3, lift: 0.2 },
		cachorro: { hipF: [0.55, 0.3], hipB: [0.58, -0.3], kneeF: [0.28, 0.31], kneeB: [0.3, -0.42], neck: [0.7, 0.38], tail: [0.66, -0.4], stride: 0.42, knee: 0.95, bob: 0.02, drop: 0.36, graze: 0.9, wag: 1, lift: 0.6 },
		galinha:  { hipF: [0.22, 0.0], hipB: [0.22, 0.0], kneeF: [0.22, 0.0], kneeB: [0.22, 0.0], neck: [0.3, 0.05], tail: [0.38, -0.14], stride: 0.55, knee: 0, bob: 0.015, drop: 0.13, graze: 1.5, wag: 0.2, lift: 0.3, bird: true, wing: [0.08, 0.36] },
	},

	SCALE: 1.15,                 // (um pouco acima do real: lado a lado com os personagens 2,5D, que são desenhados grandes)
	_meshes: new Map(),          // 'sp|vr' → { mesh, cap, n, M, A, B }
	_mats: {},
	_scene: null,
	_shadow: null,

	init(scene, shadow) { this._scene = scene; this._shadow = shadow || null; },

	// ------------------------------------------------------------------ desenho (por quadro)
	draw(list) {
		const t = (performance.now() / 1000) % 600;
		for (const E of this._meshes.values()) E.n = 0;
		const Mx = BABYLON.Matrix, Q = BABYLON.Quaternion, V = BABYLON.Vector3, q = this._q || (this._q = new Q()), m = this._m || (this._m = new Mx());
		const one = this._one || (this._one = new V(1, 1, 1)), tr = this._tr || (this._tr = new V());
		for (const a of list) {
			const key = a.sp + '|' + a.vr;
			let E = this._meshes.get(key);
			if (!E) { E = this._make(a.sp, a.vr); if (!E) continue; this._meshes.set(key, E); }
			if (E.n >= E.cap) this._grow(E, E.cap * 2);
			const k = E.n++, R = this.RIG[a.sp];
			let y = typeof Relief !== 'undefined' ? Relief.at(a.x, a.z) : 0, pitch = 0, roll = 0, x = a.x, z = a.z;
			if (a.dead) {                                                         // deitado de lado (o lombo para fora), sem pose
				roll = Math.PI / 2 * (a.seed < 0.5 ? 1 : -1);
				const cy = R.hipF[0] * 0.9 * this.SCALE, lift = E.half * this.SCALE;
				x += Math.cos(a.h) * cy * Math.sign(roll); z -= Math.sin(a.h) * cy * Math.sign(roll); y += lift - 0.02;
			} else if (typeof Relief !== 'undefined' && Relief.on) pitch = -Math.atan(Relief.slope(a.x, a.z, Math.sin(a.h), Math.cos(a.h))) * 0.8;      // (no morro: acompanha a encosta)
			Q.RotationYawPitchRollToRef(a.h, pitch, roll, q);
			tr.set(x, y, z);
			Mx.ComposeToRef(this._sc((a.scale || 1) * this.SCALE), q, tr, m);
			m.copyToArray(E.M, k * 16);
			const o = k * 4;
			E.A[o] = a.ph || 0; E.A[o + 1] = a.dead ? 0 : a.mv || 0; E.A[o + 2] = a.dead ? 0 : a.run || 0; E.A[o + 3] = a.dead ? 0 : a.gz || 0;
			E.B[o] = a.dead ? 0 : a.rs || 0; E.B[o + 1] = a.seed || 0; E.B[o + 2] = t; E.B[o + 3] = a.dead ? 1 : 0;
		}
		for (const E of this._meshes.values()) {
			E.mesh.thinInstanceCount = E.n;
			E.mesh.setEnabled(E.n > 0);
			if (E.n) {
				E.mesh.thinInstanceBufferUpdated('matrix'); E.mesh.thinInstanceBufferUpdated('anA'); E.mesh.thinInstanceBufferUpdated('anB');
				E.mesh.thinInstanceRefreshBoundingInfo(false);                        // (a caixa das instâncias: o mapa de sombra só pega quem está perto)
			}
		}
	},
	_sc(s) { const v = this._scv || (this._scv = new BABYLON.Vector3()); v.set(s, s, s); return v; },
	clear() { for (const E of this._meshes.values()) { E.n = 0; E.mesh.thinInstanceCount = 0; E.mesh.setEnabled(false); } },

	_make(sp, vr) {
		if (!this._scene || !this.RIG[sp]) return null;
		const g = this.model(sp, vr), sc = this._scene;
		const mesh = new BABYLON.Mesh(`bicho3d_${sp}_${vr}`, sc), vd = new BABYLON.VertexData();
		vd.positions = new Float32Array(g.p); vd.normals = new Float32Array(g.n); vd.colors = new Float32Array(g.c);
		vd.indices = g.p.length / 3 > 65535 ? new Uint32Array(g.i) : new Uint16Array(g.i);
		vd.applyToMesh(mesh, false);
		mesh.setVerticesData('anP', new Float32Array(g.k), false, 4);
		mesh.material = this._material(sp);
		mesh.useVertexColors = true;
		mesh.isPickable = false;
		mesh.receiveShadows = true;
		mesh.alwaysSelectAsActiveMesh = true;                                // (as instâncias andam: sem o descarte pela caixa do modelo)
		const E = { mesh, cap: 0, n: 0, half: g.half };
		this._grow(E, 8);
		if (this._shadow) this._shadow.addShadowCaster(mesh);
		return E;
	},
	_grow(E, cap) {
		const g = (a, n) => { const b = new Float32Array(n); if (a) b.set(a.subarray(0, Math.min(a.length, n))); return b; };
		E.M = g(E.M, cap * 16); E.A = g(E.A, cap * 4); E.B = g(E.B, cap * 4);
		E.mesh.thinInstanceSetBuffer('matrix', E.M, 16, false);
		E.mesh.thinInstanceSetBuffer('anA', E.A, 4, false);
		E.mesh.thinInstanceSetBuffer('anB', E.B, 4, false);
		E.mesh.thinInstanceCount = E.n;
		E.cap = cap;
	},

	// ------------------------------------------------------------------ material (o do jogo + a animação e o acabamento)
	_material(sp) {
		if (this._mats[sp]) return this._mats[sp];
		const m = new BABYLON.StandardMaterial('bicho3d_' + sp, this._scene);
		m.specularColor = new BABYLON.Color3(0.06, 0.06, 0.06);
		m.specularPower = 24;
		m.backFaceCulling = false;                                            // (orelhas, penas e crista são finas)
		if (!this._cls) this._cls = this._plugin();
		new this._cls(m, this.RIG[sp]);
		return (this._mats[sp] = m);
	},
	_plugin() {
		return class AnimalPlugin extends BABYLON.MaterialPluginBase {
			constructor(m, R) {
				super(m, 'Animal3D', 130, { ANIM3D: false });
				this.R = R;
				this._enable(true);
			}
			getClassName() { return 'AnimalPlugin'; }
			prepareDefines(d) { d.ANIM3D = true; }
			getAttributes(attr) { attr.push('anP', 'anA', 'anB'); }
			getUniforms() {
				const u = ['anH', 'anK', 'anN', 'anG', 'anX', 'anW'];
				return { ubo: u.map((name) => ({ name, size: 4, type: 'vec4' })), vertex: u.map((n) => `uniform vec4 ${n};`).join('\n') };
			}
			bindForSubMesh(ub) {
				const R = this.R, w = R.wing || [0, 0];
				ub.updateFloat4('anH', R.hipF[0], R.hipF[1], R.hipB[0], R.hipB[1]);
				ub.updateFloat4('anK', R.kneeF[0], R.kneeF[1], R.kneeB[0], R.kneeB[1]);
				ub.updateFloat4('anN', R.neck[0], R.neck[1], R.tail[0], R.tail[1]);
				ub.updateFloat4('anG', R.stride, R.knee, R.bob, R.drop);
				ub.updateFloat4('anX', R.graze, R.bird ? 1 : 0, R.wag, R.lift);
				ub.updateFloat4('anW', w[0], w[1], 0, 0);
			}
			getCustomCode(type) {
				// (sem ponto e vírgula em comentário GLSL: o Babylon corta a linha ali)
				if (type === 'vertex') return {
					CUSTOM_VERTEX_DEFINITIONS: `
						#ifdef ANIM3D
						attribute vec4 anP;
						attribute vec4 anA;
						attribute vec4 anB;
						varying vec3 anO;
						varying vec4 anM;
						vec3 anRx(vec3 p, vec2 c, float a) { vec2 q = p.yz - c; float s = sin(a), k = cos(a); return vec3(p.x, c + vec2(q.x * k - q.y * s, q.x * s + q.y * k)); }
						vec3 anRy(vec3 p, vec2 c, float a) { vec2 q = p.xz - c; float s = sin(a), k = cos(a); vec2 r = c + vec2(q.x * k + q.y * s, -q.x * s + q.y * k); return vec3(r.x, p.y, r.y); }
						vec3 anRz(vec3 p, vec2 c, float a) { vec2 q = p.xy - c; float s = sin(a), k = cos(a); return vec3(c + vec2(q.x * k - q.y * s, q.x * s + q.y * k), p.z); }
						#endif`,
					CUSTOM_VERTEX_UPDATE_POSITION: `
						#ifdef ANIM3D
						anO = position; anM = anP;
						float anCode = floor(anP.x + 0.5);
						float anPh = anA.x, anMv = anA.y, anRn = anA.z, anGz = anA.w, anRs = anB.x, anSd = anB.y, anTm = anB.z;
						float anLH = 0.0, anLK = 0.0, anHp = 0.0, anHy = 0.0, anTy = 0.0, anTp = 0.0, anWg = 0.0, anRk = 0.0;
						float anBird = anX.y;
						if (anCode > 0.5 && anCode < 8.5) {
							float li = mod(anCode - 1.0, 4.0), fr = li < 1.5 ? 1.0 : 0.0, side = mod(li, 2.0);
							float offW = (li < 0.5 || li > 2.5) ? 0.0 : 3.14159;
							float offR = fr > 0.5 ? side * 0.6 : 3.14159 + side * 0.6;
							if (anBird > 0.5) { offW = side * 3.14159; offR = offW; }
							float off = mix(offW, offR, anRn), A = anG.x * anMv * (1.0 + 0.6 * anRn);
							anLH = A * sin(anPh + off);
							anLK = anG.y * anMv * (1.0 + 0.5 * anRn) * max(0.0, -cos(anPh + off)) * (fr > 0.5 ? 1.0 : -1.0);
							if (anBird > 0.5) { anLH += -1.1 * anRs; anLK += 0.0; }
							else if (fr > 0.5) { anLH += -1.45 * anRs; anLK += 0.2 * anRs; }
							else { anLH += -1.1 * anRs; anLK += 2.3 * anRs; }
							vec2 hc = fr > 0.5 ? anH.xy : anH.zw, kc = fr > 0.5 ? anK.xy : anK.zw;
							if (anCode > 4.5) positionUpdated = anRx(positionUpdated, kc, anLK);
							positionUpdated = anRx(positionUpdated, hc, anLH);
						} else if (anCode > 8.5 && anCode < 9.5) {
							float nod = anGz * anX.x;
							if (anBird > 0.5) nod = anGz * anX.x * (0.45 + 0.55 * max(0.0, sin(anTm * 8.0 + anSd * 20.0))) + anMv * 0.15 * sin(anPh * 2.0);
							else nod += anMv * 0.06 * sin(anPh * 2.0) * (1.0 - anRn * 0.5) - anRn * 0.12 + anRs * 0.25;
							anHp = nod;
							anHy = (1.0 - anMv) * (1.0 - anGz) * 0.5 * sin(anTm * 0.43 + anSd * 6.28) * (1.0 - 0.4 * anRs);
							positionUpdated = anRx(positionUpdated, anN.xy, anHp);
							positionUpdated = anRy(positionUpdated, vec2(0.0, anN.y), anHy);
						} else if (anCode > 9.5 && anCode < 10.5) {
							float wag = anX.z * (1.0 - anRn) * (1.0 - 0.6 * anRs);
							anTy = (0.2 + 0.45 * wag) * sin(anTm * (2.2 + 9.0 * wag) + anSd * 9.0);
							anTp = anX.w * anRn + 0.25 * anX.z * (1.0 - anMv) * (1.0 - anRs);
							positionUpdated = anRx(positionUpdated, anN.zw, anTp);
							positionUpdated = anRy(positionUpdated, vec2(0.0, anN.w), anTy);
						} else if (anCode > 11.5 && anCode < 12.5) {
							float sg = position.x > 0.0 ? 1.0 : -1.0;
							anWg = sg * (anRn * 1.1 * (0.5 + 0.5 * sin(anTm * 24.0 + anSd * 5.0)) + 0.05 * anMv * sin(anPh));
							positionUpdated = anRz(positionUpdated, vec2(sg * anW.x, anW.y), anWg);
						}
						anRk = 0.08 * anRn * sin(anPh) * (1.0 - anBird);
						positionUpdated = anRx(positionUpdated, vec2(anH.x, 0.0), anRk);
						positionUpdated.y += anG.z * anMv * (0.5 - 0.5 * cos(anPh * 2.0)) * (1.0 + 1.5 * anRn) - anRs * anG.w;
						#endif`,
					CUSTOM_VERTEX_UPDATE_NORMAL: `
						#ifdef ANIM3D
						if (anCode > 0.5 && anCode < 8.5) { if (anCode > 4.5) normalUpdated = anRx(normalUpdated, vec2(0.0), anLK); normalUpdated = anRx(normalUpdated, vec2(0.0), anLH); }
						else if (anCode > 8.5 && anCode < 9.5) { normalUpdated = anRx(normalUpdated, vec2(0.0), anHp); normalUpdated = anRy(normalUpdated, vec2(0.0), anHy); }
						else if (anCode > 9.5 && anCode < 10.5) { normalUpdated = anRx(normalUpdated, vec2(0.0), anTp); normalUpdated = anRy(normalUpdated, vec2(0.0), anTy); }
						else if (anCode > 11.5 && anCode < 12.5) normalUpdated = anRz(normalUpdated, vec2(0.0), anWg);
						normalUpdated = anRx(normalUpdated, vec2(0.0), anRk);
						#endif`,
				};
				if (type === 'fragment') return {
					CUSTOM_FRAGMENT_DEFINITIONS: `
						#ifdef ANIM3D
						varying vec3 anO;
						varying vec4 anM;
						float anH3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
						float anN3(vec3 p) {
							vec3 i = floor(p), f = fract(p);
							f = f * f * (3.0 - 2.0 * f);
							return mix(mix(mix(anH3(i), anH3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(anH3(i + vec3(0.0, 1.0, 0.0)), anH3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
							           mix(mix(anH3(i + vec3(0.0, 0.0, 1.0)), anH3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(anH3(i + vec3(0.0, 1.0, 1.0)), anH3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
						}
						#endif`,
					// material: 0 pelo, 1 lã, 2 pele (porco), 3 chifre, 4 casco/unha, 5 olho, 6 penas, 7 crista, 8 focinho, 9 bico/pata
					CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
						#ifdef ANIM3D
						{
							float mt = floor(anM.y + 0.5), mud = anM.z;
							vec3 o = anO;
							// (o grão some com a distância: o que fica menor que um pixel vira o tom médio — sem chuvisco)
							#ifdef WEBGL2
							float fw = length(fwidth(o));
							#else
							float fw = 0.02;
							#endif
							float aF = 1.0 - smoothstep(0.12, 0.4, fw * 40.0), aM = 1.0 - smoothstep(0.12, 0.4, fw * 14.0);
							float n1 = anN3(o * 7.0), k = 1.0, bmp = 0.0;
							if (mt < 0.5) {
								float st = (anN3(vec3(o.x * 46.0, o.y * 46.0, o.z * 18.0)) - 0.5) * aF * 0.55 + (anN3(vec3(o.x * 16.0, o.y * 16.0, o.z * 7.0)) - 0.5) * aM * 0.45;
								k = 0.99 + 0.2 * st + 0.08 * (n1 - 0.5); bmp = st * 0.45;
							} else if (mt < 1.5) {
								float w = (anN3(o * 22.0) - 0.5) * 0.65 * aM + (anN3(o * 46.0) - 0.5) * 0.35 * aF + (anN3(o * 8.0) - 0.5) * 0.2;
								k = 1.02 + 0.24 * w; bmp = w * 0.9;
							} else if (mt < 2.5) {
								k = 0.95 + 0.08 * (n1 - 0.5) + 0.05 * (anN3(o * 24.0) - 0.5) * aF; bmp = (anN3(o * 30.0) - 0.5) * 0.12 * aF;
							} else if (mt < 3.5) {
								k = 0.95 + 0.14 * sin(length(o.xz) * 140.0 + o.y * 60.0) * aF + 0.08 * (n1 - 0.5);
							} else if (mt < 4.5) {
								k = 0.95 + 0.2 * (anN3(o * 30.0) - 0.5) * aM;
							} else if (mt < 5.5) {
								k = 1.0;
							} else if (mt < 6.5) {
								vec3 q = o * vec3(36.0, 36.0, 26.0);
								float f = fract(q.z + q.y * 0.6 + anN3(q * 0.35) * 0.8);
								k = mix(0.9, 0.72 + 0.38 * smoothstep(0.0, 0.85, f), aF) + 0.08 * n1; bmp = f * 0.8 * aF;
							} else if (mt < 7.5) {
								k = 0.95 + 0.25 * (anN3(o * 70.0) - 0.5) * aF;
							} else if (mt < 8.5) {
								k = 0.95 + 0.2 * (anN3(o * 60.0) - 0.5) * aF;
							} else {
								k = 0.97 + 0.15 * (anN3(vec3(o.x * 30.0, o.y * 120.0, o.z * 30.0)) - 0.5) * aF;
							}
							baseColor.rgb *= k;
							// MANCHAS da pelagem (anP.w), nítidas no pixel: 1 = malhada (preto no branco), 2 = pintas pretas (porco), 3 = malhado
							// marrom (cachorro), 4 = tordilho (rodelas cinza)
							float pat = floor(anM.w + 0.5);
							if (pat > 0.5) {
								float pn = pat < 1.5 ? anN3(o * 2.3 + 5.0) * 0.75 + anN3(o * 6.0) * 0.25 : pat < 2.5 ? anN3(o * 3.4 + 7.0) * 0.8 + anN3(o * 9.0) * 0.2 : pat < 3.5 ? anN3(o * 4.2 + 3.0) * 0.8 + anN3(o * 11.0) * 0.2 : anN3(o * 7.0 + 2.0);
								float th = pat < 1.5 ? 0.54 : pat < 2.5 ? 0.6 : pat < 3.5 ? 0.57 : 0.5;
								float pm = smoothstep(th, th + 0.025, pn);
								vec3 pc = pat < 2.5 ? vec3(0.07, 0.065, 0.06) : pat < 3.5 ? vec3(0.42, 0.26, 0.14) : vec3(0.36, 0.36, 0.37);
								baseColor.rgb = mix(baseColor.rgb, pc * k, pat > 3.5 ? pm * 0.65 : pm);
							}
							// LAMA: manchas no corpo (porco sujo) e a terra nos cascos e nas canelas de todos os bichos do pasto
							if (mud > 0.0 && mt < 4.5) {
								float sp = smoothstep(0.52, 0.66, anN3(o * 5.5 + 3.1) * 0.6 + anN3(o * 14.0) * 0.4);
								float low = 1.0 - smoothstep(0.12, 0.42, o.y);
								float mm = clamp(max(sp * mud, low * mud * 0.9), 0.0, 1.0);
								baseColor.rgb = mix(baseColor.rgb, vec3(0.3, 0.22, 0.15) * (0.8 + 0.3 * n1), mm * 0.85);
							}
							#ifdef WEBGL2
							{
								vec3 dx = dFdx(vPositionW), dy = dFdy(vPositionW), r1 = cross(dy, normalW), r2 = cross(normalW, dx);
								float det = dot(dx, r1);
								vec3 gr = sign(det) * (dFdx(bmp) * r1 + dFdy(bmp) * r2);
								normalW = normalize(abs(det) * normalW - 0.18 * gr);
							}
							#endif
							// borda escurecida (o contorno da ilustração) e a barriga na sombra (oclusão do próprio corpo)
							vec3 vv = normalize(vEyePosition.xyz - vPositionW);
							float rim = 1.0 - abs(dot(normalize(normalW), vv));
							baseColor.rgb *= 1.0 - 0.42 * pow(rim, 2.6);
							baseColor.rgb *= 0.78 + 0.22 * clamp(normalW.y * 0.5 + 0.6, 0.0, 1.0);
							if (mt > 4.5 && mt < 5.5 && rim < 0.35) baseColor.rgb += vec3(0.25);       // (o brilho no olho)
						}
						#endif`,
				};
				return null;
			}
		};
	},

	// ------------------------------------------------------------------ geometria
	// g = { p, n, c, k (anP), i }; um TUBO por anéis ao longo de um caminho [x, y, z, rx, ry] (rx = lateral, ry = o outro eixo),
	// pontas arredondadas; cor por vértice (função da posição e da normal) — as pintas, a sela do pastor, a barriga clara.
	_G(mud) { return { p: [], n: [], c: [], k: [], i: [], mud, half: 0.3, pat: 0 }; },
	_vn: null,
	noise(x, y, z) {                                                            // ruído de valor 3D (as pintas da pelagem)
		const h = (i, j, k) => { const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };
		const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi;
		const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
		const L = (a, b, t) => a + (b - a) * t;
		return L(L(L(h(xi, yi, zi), h(xi + 1, yi, zi), u), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
			L(L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
	},
	tube(g, P, N, col, code, mat, { capA = true, capB = true, jit = 0, mud = g.mud } = {}) {
		const K = P.length, base = g.p.length / 3, frames = [];
		const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
		const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
		for (let s = 0; s < K; s++) {
			const A = P[Math.max(0, s - 1)], B = P[Math.min(K - 1, s + 1)], T = nrm(sub(B, A));
			const ref = Math.abs(T[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0], X = nrm(cross(ref, T)), U = cross(T, X);
			frames.push({ T, X, U });
		}
		const C = (p, n) => (typeof col === 'function' ? col(p, n) : col);
		const push = (p, n) => {
			g.p.push(p[0], p[1], p[2]); g.n.push(n[0], n[1], n[2]);
			const c = C(p, n); g.c.push(c[0], c[1], c[2], 1);
			g.k.push(code, mat, mud, (mat === 0 || mat === 2) ? g.pat || 0 : 0);
		};
		for (let s = 0; s < K; s++) {
			const [x, y, z, rx, ry] = P[s], F = frames[s];
			for (let j = 0; j < N; j++) {
				const a = (j / N) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
				let r1 = rx, r2 = ry;
				if (jit) { const q = 1 + jit * (this.noise(x * 9 + ca * 3, y * 9 + sa * 3, z * 9) - 0.5) * 2; r1 *= q; r2 *= q; }
				const p = [x + F.X[0] * ca * r1 + F.U[0] * sa * r2, y + F.X[1] * ca * r1 + F.U[1] * sa * r2, z + F.X[2] * ca * r1 + F.U[2] * sa * r2];
				const n = nrm([F.X[0] * ca / Math.max(rx, 1e-3) + F.U[0] * sa / Math.max(ry, 1e-3), F.X[1] * ca / Math.max(rx, 1e-3) + F.U[1] * sa / Math.max(ry, 1e-3), F.X[2] * ca / Math.max(rx, 1e-3) + F.U[2] * sa / Math.max(ry, 1e-3)]);
				push(p, n);
			}
		}
		for (let s = 0; s + 1 < K; s++) for (let j = 0; j < N; j++) {
			const a = base + s * N + j, b = base + s * N + (j + 1) % N, c = a + N, d = b + N;
			g.i.push(a, b, c, b, d, c);
		}
		const cap = (s, dir) => {
			const [x, y, z, rx, ry] = P[s], F = frames[s], r = Math.min(rx, ry) * 0.6;
			const p = [x + F.T[0] * r * dir, y + F.T[1] * r * dir, z + F.T[2] * r * dir], idx = g.p.length / 3;
			push(p, [F.T[0] * dir, F.T[1] * dir, F.T[2] * dir]);
			for (let j = 0; j < N; j++) g.i.push(idx, base + s * N + j, base + s * N + (j + 1) % N);
		};
		if (capA) cap(0, -1);
		if (capB) cap(K - 1, 1);
	},
	// Elipsoide (um tubo ao longo de z) no centro c, raios r = [rx, ry, rz], com inclinação opcional (rotação em x).
	blob(g, c, r, col, code, mat, { rings = 7, N = 10, tilt = 0, yaw = 0, jit = 0 } = {}) {
		const P = [];
		for (let s = 0; s <= rings; s++) {
			const th = (s / rings) * Math.PI, zz = -Math.cos(th) * r[2], rr = Math.max(Math.sin(th), 0.04);
			const ct = Math.cos(tilt), st = Math.sin(tilt), cy = Math.cos(yaw), sy = Math.sin(yaw);
			const ly = -zz * st, lz = zz * ct;                                          // (inclina o eixo: + = a ponta da frente desce)
			P.push([c[0] + lz * sy, c[1] + ly, c[2] + lz * cy, r[0] * rr, r[1] * rr]);
		}
		this.tube(g, P, N, col, code, mat, { jit });
	},
	mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; },
	sm(e0, e1, x) { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); },

	// Perna de quadrúpede: coxa (código 1–4) do quadril ao joelho e canela (5–8) do joelho ao casco. side: -1 esquerda, +1 direita.
	leg(g, li, x, hip, knee, foot, rU, rL, coat, hoof, { hoofH = 0.12, hoofR = null, paw = false, mat = 0, sock = null } = {}) {
		const [hy, hz] = hip, [ky, kz] = knee, fz = foot;
		const legCol = sock ? (p) => (p[1] < sock.y ? sock.c : (typeof coat === 'function' ? coat(p, [0, 0, 1]) : coat)) : coat;
		this.tube(g, [[x, hy + rU * 0.5, hz, rU * 1.15, rU * 1.3], [x, (hy + ky) / 2, (hz + kz) / 2, rU, rU * 1.05], [x, ky, kz, rL * 1.25, rL * 1.3]], 9, legCol, 1 + li, mat);
		this.tube(g, [[x, ky + rL * 0.3, kz, rL * 1.2, rL * 1.25], [x, (ky + hoofH) / 2 + 0.02, (kz + fz) / 2, rL * 0.9, rL * 0.95], [x, hoofH, fz, rL, rL * 1.05]], 8, legCol, 5 + li, mat);
		if (paw) this.blob(g, [x, 0.035, fz + 0.03], [rL * 1.35, 0.04, rL * 1.7], hoof, 5 + li, mat, { rings: 5, N: 8 });
		else this.tube(g, [[x, hoofH + 0.01, fz, rL * 1.05, rL * 1.1], [x, 0.0, fz + 0.01, (hoofR || rL * 1.25), (hoofR || rL * 1.3)]], 8, hoof, 5 + li, 4, { mud: g.mud });
	},

	// ------------------------------------------------------------------ as espécies
	model(sp, vr) {
		const V = this.VAR[sp][vr] || this.VAR[sp][0];
		const mudOf = { porco: { rosa: 0.3, sujo: 1.0, malhado: 0.55, caipira: 0.6 }, vaca: 0.35, cavalo: 0.25, cabra: 0.3, ovelha: 0.35, cachorro: 0.15, galinha: 0 };
		const mo = mudOf[sp], g = this._G(typeof mo === 'object' ? mo[V] : mo);
		const R = this.RIG[sp], eyeC = [0.05, 0.04, 0.035];
		if (sp === 'vaca') {
			const dark = V === 'boi', nel = V === 'nelore';
			const base = { boi: [0.2, 0.165, 0.145], malhada: [0.93, 0.91, 0.87], nelore: [0.86, 0.84, 0.8], caramelo: [0.62, 0.4, 0.24] }[V];
			const coat = (p, n) => {
				let c = base;
				if (V === 'nelore') c = this.mix(c, [0.48, 0.47, 0.46], this.sm(1.25, 1.55, p[1]) * this.sm(0.3, 0.9, p[2]) * 0.8);       // (cupim e pescoço acinzentados)
				if (V === 'caramelo' && n[1] < -0.3) c = this.mix(c, [0.86, 0.78, 0.66], 0.6);
				if (dark) c = this.mix(c, [0.32, 0.25, 0.2], this.sm(-0.2, -0.8, n[1]) * 0.5);
				return c;
			};
			if (V === 'malhada') g.pat = 1;
			const B = [[-1.02, 1.13, 0.15, 0.17], [-0.95, 1.15, 0.32, 0.32], [-0.74, 1.14, 0.42, 0.41], [-0.4, 1.06, 0.45, 0.47], [0.0, 1.03, 0.47, 0.5], [0.4, 1.06, 0.45, 0.5], [0.7, 1.12, 0.4, 0.47], [0.92, 1.15, 0.3, 0.38], [1.03, 1.14, 0.15, 0.2]];
			this.tube(g, B.map(([z, y, rx, ry]) => [0, y, z, rx, ry]), 16, coat, 0, 0);
			for (const s of [-1, 1]) {
				this.blob(g, [s * 0.2, 0.98, -0.62], [0.2, 0.33, 0.3], coat, 0, 0);                         // anca/pernil
				this.blob(g, [s * 0.21, 1.0, 0.6], [0.17, 0.3, 0.24], coat, 0, 0);                          // paleta
			}
			if (dark || nel) this.blob(g, [0, 1.47, 0.6], [0.17, 0.21, 0.26], coat, 0, 0, { tilt: -0.3 });  // cupim
			if (V === 'malhada' || V === 'caramelo') this.blob(g, [0, 0.6, -0.38], [0.15, 0.11, 0.17], [0.88, 0.62, 0.6], 0, 2);   // úbere
			const hoof = [0.13, 0.11, 0.1];
			for (const [li, s, fr] of [[0, -1, 1], [1, 1, 1], [2, -1, 0], [3, 1, 0]]) {
				if (fr) this.leg(g, li, s * 0.22, R.hipF, R.kneeF, 0.67, 0.13, 0.068, coat, hoof);
				else this.leg(g, li, s * 0.22, R.hipB, R.kneeB, -0.66, 0.14, 0.068, coat, hoof);
			}
			// pescoço e cabeça
			this.tube(g, [[0, 1.12, 0.78, 0.28, 0.34], [0, 1.28, 1.08, 0.23, 0.27], [0, 1.36, 1.28, 0.18, 0.2]], 14, coat, 9, 0);
			if (nel) this.blob(g, [0, 0.95, 0.98], [0.05, 0.24, 0.22], coat, 9, 0);                      // barbela
			const face = (p, n) => (p[2] > 1.55 ? (dark ? [0.36, 0.32, 0.3] : V === 'malhada' ? [0.85, 0.66, 0.62] : [0.5, 0.42, 0.38]) : coat(p, n));
			this.tube(g, [[0, 1.46, 1.25, 0.15, 0.12], [0, 1.43, 1.35, 0.17, 0.17], [0, 1.29, 1.52, 0.14, 0.13], [0, 1.14, 1.66, 0.12, 0.1], [0, 1.09, 1.72, 0.11, 0.08]], 12, face, 9, 0);
			this.blob(g, [0, 1.08, 1.74], [0.11, 0.075, 0.035], dark ? [0.16, 0.14, 0.14] : [0.62, 0.42, 0.42], 9, 8);      // focinho
			for (const s of [-1, 1]) {
				this.blob(g, [s * 0.04, 1.08, 1.77], [0.018, 0.022, 0.01], [0.05, 0.04, 0.04], 9, 8, { rings: 4, N: 6 });       // narinas
				this.blob(g, [s * 0.135, 1.39, 1.42], [0.028, 0.03, 0.03], eyeC, 9, 5, { rings: 4, N: 8 });
				const ey = nel ? 1.32 : 1.4;
				this.blob(g, [s * (nel ? 0.21 : 0.25), ey, 1.3], [0.12, 0.035, 0.065], coat, 9, 0, { tilt: nel ? -0.5 : 0, yaw: s * 0.3 });      // orelha
				if (dark || V === 'caramelo') {                                                              // chifres (boi: grandes, em lira)
					const L = dark ? 1 : 0.55, horn = (p) => this.mix([0.84, 0.79, 0.66], [0.2, 0.17, 0.14], this.sm(0.5, 1.0, Math.abs(p[0]) / (0.46 * L + 0.12)));
					this.tube(g, [[s * 0.12, 1.5, 1.28, 0.05, 0.05], [s * (0.12 + 0.18 * L), 1.53, 1.27, 0.045, 0.045], [s * (0.12 + 0.3 * L), 1.53 + 0.09 * L, 1.25, 0.035, 0.035], [s * (0.12 + 0.33 * L), 1.53 + 0.23 * L, 1.3, 0.022, 0.022], [s * (0.12 + 0.3 * L), 1.53 + 0.31 * L, 1.36, 0.008, 0.008]], 8, horn, 9, 3);
				}
			}
			this.tube(g, [[0, 1.3, -0.98, 0.04, 0.04], [0, 1.0, -1.07, 0.03, 0.03], [0, 0.62, -1.08, 0.025, 0.025]], 7, coat, 10, 0);
			this.blob(g, [0, 0.52, -1.08], [0.05, 0.11, 0.05], dark ? [0.1, 0.09, 0.08] : [0.2, 0.17, 0.15], 10, 0);
			g.half = 0.47;
		} else if (sp === 'cavalo') {
			const base = { alazao: [0.5, 0.28, 0.14], tordilho: [0.74, 0.73, 0.71], preto: [0.13, 0.11, 0.1] }[V];
			const coat = (p, n) => {
				let c = base;
				if (V === 'alazao' && p[1] < 0.42) c = [0.2, 0.13, 0.08];
				return c;
			};
			if (V === 'tordilho') g.pat = 4;
			const mane = V === 'tordilho' ? [0.32, 0.31, 0.3] : V === 'alazao' ? [0.22, 0.12, 0.07] : [0.06, 0.05, 0.05];
			const B = [[-0.86, 1.32, 0.14, 0.16], [-0.78, 1.36, 0.3, 0.3], [-0.55, 1.36, 0.36, 0.37], [-0.2, 1.3, 0.36, 0.4], [0.2, 1.32, 0.35, 0.41], [0.55, 1.38, 0.32, 0.4], [0.78, 1.42, 0.24, 0.32], [0.88, 1.45, 0.12, 0.18]];
			this.tube(g, B.map(([z, y, rx, ry]) => [0, y, z, rx, ry]), 16, coat, 0, 0);
			for (const s of [-1, 1]) { this.blob(g, [s * 0.17, 1.22, -0.56], [0.16, 0.3, 0.27], coat, 0, 0); this.blob(g, [s * 0.17, 1.24, 0.56], [0.14, 0.27, 0.2], coat, 0, 0); }
			const hoof = [0.16, 0.14, 0.12], sock = V === 'alazao' ? { y: 0.32, c: [0.92, 0.9, 0.86] } : null;
			for (const [li, s, fr] of [[0, -1, 1], [1, 1, 1], [2, -1, 0], [3, 1, 0]]) {
				if (fr) this.leg(g, li, s * 0.18, R.hipF, R.kneeF, 0.62, 0.11, 0.05, coat, hoof, { hoofH: 0.1, sock: li === 0 ? sock : null });
				else this.leg(g, li, s * 0.18, R.hipB, R.kneeB, -0.6, 0.12, 0.05, coat, hoof, { hoofH: 0.1, sock: li === 3 ? sock : null });
			}
			this.tube(g, [[0, 1.4, 0.66, 0.18, 0.26], [0, 1.7, 0.95, 0.13, 0.19], [0, 1.94, 1.08, 0.1, 0.13]], 12, coat, 9, 0);
			this.tube(g, [[0, 1.62, 0.62, 0.035, 0.07], [0, 1.88, 0.86, 0.035, 0.07], [0, 2.08, 0.99, 0.03, 0.05]], 7, mane, 9, 0);   // crina
			this.tube(g, [[0, 2.04, 1.04, 0.1, 0.1], [0, 2.01, 1.12, 0.11, 0.13], [0, 1.86, 1.32, 0.09, 0.09], [0, 1.73, 1.48, 0.08, 0.07], [0, 1.7, 1.53, 0.065, 0.05]], 11, (p, n) => (p[2] > 1.42 ? [0.18, 0.15, 0.14] : coat(p, n)), 9, 0);
			if (V !== 'preto') this.blob(g, [0, 2.05, 1.19], [0.035, 0.012, 0.06], [0.95, 0.94, 0.92], 9, 0, { tilt: 0.6 });   // estrela
			for (const s of [-1, 1]) {
				this.blob(g, [s * 0.1, 1.99, 1.18], [0.024, 0.026, 0.03], eyeC, 9, 5, { rings: 4, N: 8 });
				this.tube(g, [[s * 0.06, 2.1, 1.05, 0.03, 0.022], [s * 0.08, 2.24, 1.03, 0.004, 0.004]], 6, coat, 9, 0);
			}
			this.tube(g, [[0, 1.46, -0.86, 0.06, 0.06], [0, 1.22, -0.98, 0.085, 0.075], [0, 0.78, -1.03, 0.075, 0.06], [0, 0.55, -1.0, 0.03, 0.03]], 8, mane, 10, 0);
			g.half = 0.4;
		} else if (sp === 'porco') {
			const base = { rosa: [0.95, 0.7, 0.66], sujo: [0.9, 0.66, 0.6], malhado: [0.94, 0.72, 0.66], caipira: [0.2, 0.18, 0.18] }[V];
			const coat = (p, n) => {
				let c = base;
				if (n[1] < -0.4 && V !== 'caipira') c = this.mix(c, [0.82, 0.56, 0.52], 0.4);
				return c;
			};
			if (V === 'malhado') g.pat = 2;
			const B = [[-0.58, 0.5, 0.12, 0.13], [-0.52, 0.52, 0.25, 0.26], [-0.35, 0.53, 0.31, 0.31], [0, 0.52, 0.33, 0.33], [0.3, 0.52, 0.31, 0.32], [0.5, 0.54, 0.26, 0.28], [0.6, 0.55, 0.17, 0.2]];
			this.tube(g, B.map(([z, y, rx, ry]) => [0, y, z, rx, ry]), 16, coat, 0, 2);
			for (const s of [-1, 1]) this.blob(g, [s * 0.15, 0.46, -0.36], [0.16, 0.22, 0.2], coat, 0, 2);
			const hoof = [0.3, 0.24, 0.22];
			for (const [li, s, fr] of [[0, -1, 1], [1, 1, 1], [2, -1, 0], [3, 1, 0]]) {
				if (fr) this.leg(g, li, s * 0.16, R.hipF, R.kneeF, 0.38, 0.085, 0.052, coat, hoof, { hoofH: 0.06, mat: 2 });
				else this.leg(g, li, s * 0.16, R.hipB, R.kneeB, -0.38, 0.09, 0.052, coat, hoof, { hoofH: 0.06, mat: 2 });
			}
			this.tube(g, [[0, 0.6, 0.5, 0.21, 0.22], [0, 0.59, 0.64, 0.2, 0.2], [0, 0.51, 0.8, 0.13, 0.12], [0, 0.47, 0.88, 0.09, 0.085]], 12, coat, 9, 2);
			const snout = V === 'caipira' ? [0.3, 0.24, 0.24] : [0.9, 0.55, 0.55];
			this.tube(g, [[0, 0.47, 0.88, 0.09, 0.085], [0, 0.47, 0.935, 0.088, 0.082]], 12, snout, 9, 8, { capA: false });
			for (const s of [-1, 1]) {
				this.blob(g, [s * 0.03, 0.47, 0.95], [0.016, 0.022, 0.008], [0.25, 0.12, 0.12], 9, 8, { rings: 4, N: 6 });
				this.blob(g, [s * 0.1, 0.66, 0.74], [0.02, 0.018, 0.02], eyeC, 9, 5, { rings: 4, N: 8 });
				this.blob(g, [s * 0.13, 0.77, 0.66], [0.075, 0.025, 0.1], coat, 9, 2, { tilt: 0.7, yaw: s * 0.35 });                // orelha caída para a frente
			}
			const tl = [];
			for (let k = 0; k <= 10; k++) { const a = k * 0.9; tl.push([0.035 * Math.cos(a), 0.6 + 0.035 * Math.sin(a) + k * 0.004, -0.58 - k * 0.012, 0.016, 0.016]); }
			this.tube(g, tl, 6, coat, 10, 2);                                                               // rabo enrolado
			g.half = 0.32;
		} else if (sp === 'cabra' || sp === 'ovelha') {
			const goat = sp === 'cabra';
			const wool = { la: [0.86, 0.81, 0.7], carneiro: [0.84, 0.79, 0.68], preta: [0.24, 0.21, 0.19] }[V];
			const base = goat ? { marrom: [0.52, 0.31, 0.17], escura: [0.34, 0.22, 0.14], creme: [0.86, 0.8, 0.7] }[V] : wool;
			const coat = (p, n) => {
				let c = base;
				if (goat && V === 'marrom' && p[1] < 0.72 && p[1] > 0.45 && Math.abs(p[2]) < 0.3 && this.noise(p[0] * 3 + 1, p[1] * 3 + 0.7, p[2] * 3 - 1) > 0.42) c = [0.92, 0.9, 0.86];      // mancha branca da barriga
				if (goat && V === 'creme' && p[2] > 0.35) c = [0.5, 0.33, 0.2];
				if (goat && n[1] < -0.5) c = this.mix(c, [0.9, 0.86, 0.8], V === 'escura' ? 0.15 : 0.35);
				return c;
			};
			const face = goat ? (p, n) => (p[2] > 0.66 && Math.abs(p[0]) < 0.03 && V === 'marrom' ? [0.93, 0.9, 0.86] : coat(p, n)) : (V === 'preta' ? [0.16, 0.14, 0.13] : [0.82, 0.76, 0.68]);
			const legC = goat ? coat : (V === 'preta' ? [0.14, 0.12, 0.11] : [0.6, 0.55, 0.5]);
			const B = goat
				? [[-0.5, 0.72, 0.1, 0.12], [-0.45, 0.75, 0.18, 0.2], [-0.25, 0.73, 0.22, 0.24], [0.05, 0.7, 0.23, 0.26], [0.3, 0.72, 0.21, 0.26], [0.45, 0.76, 0.17, 0.22], [0.52, 0.78, 0.1, 0.13]]
				: [[-0.53, 0.74, 0.12, 0.14], [-0.47, 0.77, 0.27, 0.28], [-0.25, 0.76, 0.33, 0.33], [0.05, 0.74, 0.34, 0.35], [0.3, 0.76, 0.32, 0.34], [0.46, 0.8, 0.25, 0.28], [0.54, 0.83, 0.12, 0.15]];
			this.tube(g, B.map(([z, y, rx, ry]) => [0, y, z, rx, ry]), goat ? 14 : 18, coat, 0, goat ? 0 : 1, { jit: goat ? 0 : 0.09 });
			const hoof = [0.15, 0.12, 0.1], hip = R.hipF, hb = R.hipB;
			for (const [li, s, fr] of [[0, -1, 1], [1, 1, 1], [2, -1, 0], [3, 1, 0]]) {
				if (fr) this.leg(g, li, s * 0.12, hip, R.kneeF, 0.35, 0.07, 0.036, legC, hoof, { hoofH: 0.07 });
				else this.leg(g, li, s * 0.12, hb, R.kneeB, -0.36, 0.08, 0.036, legC, hoof, { hoofH: 0.07 });
			}
			if (goat) this.tube(g, [[0, 0.8, 0.4, 0.1, 0.14], [0, 0.98, 0.52, 0.08, 0.1], [0, 1.08, 0.58, 0.07, 0.08]], 10, coat, 9, 0);
			else this.tube(g, [[0, 0.84, 0.42, 0.16, 0.18], [0, 0.94, 0.55, 0.12, 0.13]], 14, coat, 9, 1, { jit: 0.08 });
			const hy = goat ? 1.12 : 0.99, hz = goat ? 0.58 : 0.57;
			this.tube(g, [[0, hy + 0.01, hz - 0.02, 0.065, 0.075], [0, hy, hz + 0.05, 0.075, 0.085], [0, hy - 0.1, hz + 0.18, 0.055, 0.06], [0, hy - 0.15, hz + 0.24, 0.04, 0.04]], 10, face, 9, 0);
			this.blob(g, [0, hy - 0.15, hz + 0.255], [0.035, 0.025, 0.012], [0.2, 0.16, 0.15], 9, 8, { rings: 4, N: 8 });
			for (const s of [-1, 1]) {
				this.blob(g, [s * 0.06, hy + 0.01, hz + 0.1], [0.018, 0.02, 0.02], [0.45, 0.32, 0.08], 9, 5, { rings: 4, N: 8 });         // olho (amarelado, pupila no brilho)
				this.blob(g, [s * 0.11, hy - 0.01, hz + 0.01], [0.08, 0.022, 0.038], goat ? coat : face, 9, 0, { yaw: s * 0.5, tilt: goat ? 0.3 : 0.1 });
				if (goat || V === 'carneiro') {
					const horn = (p) => this.mix([0.62, 0.55, 0.45], [0.3, 0.25, 0.2], this.sm(0, 0.25, Math.abs(p[2] - hz)));
					if (goat) this.tube(g, [[s * 0.035, hy + 0.06, hz + 0.02, 0.024, 0.024], [s * 0.06, hy + 0.17, hz - 0.03, 0.02, 0.02], [s * 0.09, hy + 0.22, hz - 0.14, 0.014, 0.014], [s * 0.11, hy + 0.19, hz - 0.24, 0.005, 0.005]], 7, horn, 9, 3);
					else {
						const P = [];
						for (let k = 0; k <= 12; k++) { const a = k / 12 * Math.PI * 1.6, r = 0.1 - k * 0.005; P.push([s * (0.07 + k * 0.006), hy + 0.04 + Math.sin(a) * r, hz - 0.02 - (1 - Math.cos(a)) * r * 0.9, 0.032 - k * 0.002, 0.032 - k * 0.002]); }
						this.tube(g, P, 7, horn, 9, 3);                                                     // chifre em espiral (carneiro)
					}
				}
			}
			if (goat) this.tube(g, [[0, hy - 0.13, hz + 0.2, 0.025, 0.02], [0, hy - 0.26, hz + 0.18, 0.012, 0.012]], 6, [0.25, 0.2, 0.16], 9, 0);   // barbicha
			if (goat) this.tube(g, [[0, 0.82, -0.5, 0.025, 0.03], [0, 0.92, -0.56, 0.018, 0.018]], 6, coat, 10, 0);
			else this.blob(g, [0, 0.72, -0.56], [0.06, 0.1, 0.06], coat, 10, 1, { jit: 0.1 });
			g.half = goat ? 0.24 : 0.34;
		} else if (sp === 'cachorro') {
			const base = { pastor: [0.66, 0.43, 0.2], caramelo: [0.72, 0.5, 0.27], preto: [0.12, 0.11, 0.1], malhado: [0.9, 0.87, 0.82] }[V];
			const coat = (p, n) => {
				let c = base;
				if (V === 'pastor' && n[1] > 0.1 && p[2] > -0.38 && p[2] < 0.32 && p[1] > 0.5) c = this.mix(c, [0.1, 0.09, 0.08], this.sm(0.1, 0.45, n[1]));     // a sela preta
				if (V === 'caramelo' && n[1] < -0.3) c = this.mix(c, [0.88, 0.76, 0.58], 0.6);
				if (V === 'preto' && (n[1] < -0.4 || p[1] < 0.25)) c = [0.55, 0.35, 0.18];
				return c;
			};
			if (V === 'malhado') g.pat = 3;
			const B = [[-0.4, 0.62, 0.08, 0.09], [-0.35, 0.63, 0.135, 0.145], [-0.18, 0.61, 0.13, 0.14], [0.05, 0.61, 0.14, 0.17], [0.25, 0.63, 0.16, 0.21], [0.38, 0.67, 0.14, 0.19], [0.45, 0.69, 0.08, 0.11]];
			this.tube(g, B.map(([z, y, rx, ry]) => [0, y, z, rx, ry]), 14, coat, 0, 0);
			for (const s of [-1, 1]) this.blob(g, [s * 0.1, 0.56, -0.3], [0.08, 0.17, 0.14], coat, 0, 0);
			const paw = V === 'pastor' ? [0.6, 0.42, 0.22] : V === 'preto' ? [0.55, 0.35, 0.18] : base;
			for (const [li, s, fr] of [[0, -1, 1], [1, 1, 1], [2, -1, 0], [3, 1, 0]]) {
				if (fr) this.leg(g, li, s * 0.09, R.hipF, R.kneeF, 0.34, 0.06, 0.032, coat, paw, { hoofH: 0.05, paw: true });
				else this.leg(g, li, s * 0.09, R.hipB, R.kneeB, -0.36, 0.07, 0.032, coat, paw, { hoofH: 0.05, paw: true });
			}
			this.tube(g, [[0, 0.7, 0.36, 0.09, 0.12], [0, 0.84, 0.47, 0.072, 0.09], [0, 0.92, 0.52, 0.065, 0.075]], 10, coat, 9, 0);
			const muzzle = V === 'pastor' || V === 'caramelo' ? [0.12, 0.1, 0.09] : null;
			const face = (p, n) => (muzzle && p[2] > 0.66 ? this.mix(coat(p, n), muzzle, this.sm(0.66, 0.74, p[2])) : coat(p, n));
			this.tube(g, [[0, 0.96, 0.49, 0.07, 0.075], [0, 0.96, 0.56, 0.085, 0.085], [0, 0.91, 0.66, 0.06, 0.055], [0, 0.88, 0.74, 0.04, 0.035], [0, 0.87, 0.78, 0.026, 0.022]], 10, face, 9, 0);
			this.blob(g, [0, 0.885, 0.785], [0.02, 0.016, 0.014], [0.04, 0.035, 0.035], 9, 8, { rings: 4, N: 6 });            // trufa
			this.blob(g, [0, 0.835, 0.71], [0.022, 0.008, 0.045], [0.85, 0.42, 0.45], 9, 2, { rings: 4, N: 6, tilt: 0.25 });   // a língua de fora
			for (const s of [-1, 1]) {
				this.blob(g, [s * 0.045, 0.975, 0.63], [0.015, 0.016, 0.015], [0.2, 0.12, 0.05], 9, 5, { rings: 4, N: 8 });
				if (V === 'pastor' || V === 'preto') this.tube(g, [[s * 0.05, 1.0, 0.52, 0.04, 0.014], [s * 0.065, 1.08, 0.505, 0.022, 0.008], [s * 0.075, 1.14, 0.5, 0.003, 0.003]], 6, coat, 9, 0, { capA: false });   // orelha em pé
				else this.tube(g, [[s * 0.06, 1.0, 0.53, 0.035, 0.012], [s * 0.1, 0.97, 0.53, 0.03, 0.01], [s * 0.11, 0.9, 0.545, 0.02, 0.008]], 6, coat, 9, 0);     // orelha caída (vira-lata)
			}
			const tail = V === 'caramelo' ? [[0, 0.66, -0.4, 0.03, 0.03], [0, 0.76, -0.46, 0.035, 0.035], [0, 0.82, -0.4, 0.03, 0.03], [0, 0.8, -0.34, 0.015, 0.015]]
				: [[0, 0.66, -0.4, 0.035, 0.035], [0, 0.58, -0.5, 0.05, 0.05], [0, 0.46, -0.56, 0.045, 0.045], [0, 0.38, -0.55, 0.02, 0.02]];
			this.tube(g, tail, 8, (p, n) => (V === 'pastor' && p[1] > 0.5 ? [0.12, 0.1, 0.09] : coat(p, n)), 10, 0);
			g.half = 0.16;
		} else if (sp === 'galinha') {
			const P = {
				galo: { body: [0.55, 0.2, 0.08], neck: [0.88, 0.52, 0.14], tail: [0.06, 0.18, 0.13], wing: [0.62, 0.24, 0.09], comb: 1 },
				carijo: { body: [0.42, 0.4, 0.38], neck: [0.5, 0.48, 0.46], tail: [0.2, 0.19, 0.19], wing: [0.38, 0.36, 0.35], comb: 0.6, bar: true },
				branca: { body: [0.95, 0.94, 0.9], neck: [0.96, 0.95, 0.92], tail: [0.9, 0.89, 0.86], wing: [0.92, 0.91, 0.87], comb: 0.6 },
				pedres: { body: [0.58, 0.38, 0.2], neck: [0.72, 0.5, 0.26], tail: [0.18, 0.13, 0.1], wing: [0.5, 0.32, 0.18], comb: 0.55 },
			}[V];
			const rooster = V === 'galo', bar = (c) => (p) => (P.bar && Math.sin(p[1] * 140 + p[2] * 40) > 0.2 ? this.mix(c, [0.08, 0.08, 0.08], 0.75) : c);
			const bodyC = (p, n) => (rooster && (n[1] < -0.2 || p[2] > 0.08) ? [0.07, 0.15, 0.11] : bar(P.body)(p));       // (galo: peito verde-escuro)
			this.tube(g, [[0, 0.3, -0.18, 0.055, 0.065], [0, 0.32, -0.12, 0.12, 0.13], [0, 0.3, 0.0, 0.14, 0.15], [0, 0.33, 0.1, 0.12, 0.14], [0, 0.38, 0.15, 0.07, 0.08]], 12, bodyC, 0, 6);
			for (const s of [-1, 1]) this.blob(g, [s * 0.11, 0.33, -0.01], [0.035, 0.085, 0.13], (p) => (rooster && p[1] < 0.3 ? [0.08, 0.2, 0.15] : bar(P.wing)(p)), 12, 6, { tilt: 0.15 });      // asas
			this.tube(g, [[0, 0.38, 0.12, 0.07, 0.07], [0, 0.48, 0.15, 0.052, 0.05], [0, 0.55, 0.16, 0.045, 0.045]], 9, bar(P.neck), 9, 6);
			this.blob(g, [0, 0.585, 0.17], [0.045, 0.047, 0.056], bar(P.neck), 9, 6);
			const red = [0.85, 0.12, 0.1], cs = P.comb;
			for (let k = 0; k < 5; k++) this.blob(g, [0, 0.625 + (k % 2 ? 0.0 : 0.02) * cs + 0.015 * cs, 0.13 + k * 0.02], [0.008, 0.028 * cs + 0.008, 0.016], red, 9, 7, { rings: 4, N: 6 });
			for (const s of [-1, 1]) {
				this.blob(g, [s * 0.012, 0.52, 0.205], [0.01, 0.028 * cs + 0.008, 0.016], red, 9, 7, { rings: 4, N: 6 });   // barbela
				this.blob(g, [s * 0.036, 0.595, 0.19], [0.01, 0.011, 0.011], [0.75, 0.42, 0.08], 9, 5, { rings: 4, N: 6 });
			}
			this.tube(g, [[0, 0.578, 0.215, 0.018, 0.014], [0, 0.566, 0.25, 0.003, 0.003]], 6, [0.92, 0.72, 0.25], 9, 9);       // bico
			if (rooster) {
				for (let k = 0; k < 5; k++) {                                                              // as foices do rabo do galo
					const sx = (k - 2) * 0.012, h = 0.22 + k * 0.025, L = 0.2 + k * 0.03, Pt = [];
					for (let s = 0; s <= 6; s++) { const a = s / 6 * Math.PI; Pt.push([sx, 0.38 + Math.sin(a) * h, -0.12 - (1 - Math.cos(a)) * L * 0.5, 0.006, 0.03 - s * 0.003]); }
					this.tube(g, Pt, 6, (p) => this.mix([0.04, 0.16, 0.12], [0.08, 0.3, 0.22], this.sm(0.4, 0.6, p[1])), 10, 6);
				}
			} else for (let k = 0; k < 3; k++) this.blob(g, [(k - 1) * 0.03, 0.43, -0.17], [0.012, 0.09, 0.05], bar(P.tail), 10, 6, { tilt: -0.9 });
			const leg = [0.92, 0.72, 0.25];
			for (const [li, s] of [[0, -1], [1, 1]]) {
				this.blob(g, [s * 0.05, 0.22, 0.0], [0.04, 0.06, 0.05], bar(P.body), 0, 6);                // coxa (penas)
				this.tube(g, [[s * 0.05, 0.2, 0.0, 0.014, 0.014], [s * 0.05, 0.03, 0.01, 0.012, 0.012]], 6, leg, 1 + li, 9);
				for (const a of [-0.5, 0, 0.5]) this.tube(g, [[s * 0.05, 0.02, 0.01, 0.008, 0.008], [s * 0.05 + Math.sin(a) * 0.06, 0.008, 0.01 + Math.cos(a) * 0.06, 0.005, 0.005]], 5, leg, 1 + li, 9);
				this.tube(g, [[s * 0.05, 0.02, 0.0, 0.006, 0.006], [s * 0.05, 0.01, -0.04, 0.004, 0.004]], 5, leg, 1 + li, 9);
			}
			g.half = 0.13;
		}
		return g;
	},
};
