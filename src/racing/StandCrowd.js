// ============================================================================
// StandCrowd — a TORCIDA das arquibancadas do autódromo durante as corridas: não são NPCs, é um LOTE só (thin instances de um boneco
// simples — calça, camisa, cabeça, cabelo e os dois braços; ~1 em 6 com bandeira), milhares de torcedores com 1 desenho por malha.
// Tudo se mexe no shader (vértice): pulam, levantam e balançam os braços, agitam a bandeira; quanto mais perto o carro do jogador
// (ou o primeiro colocado) passa da arquibancada, mais a galera vibra (a "ola" acompanha o carro). Camisas das equipes, tons de pele,
// calças e bandeiras sorteados por lugar (estável). Só existe durante a corrida no autódromo (contagem, corrida e a festa da
// chegada); fora dela a arquibancada fica com a pintura de sempre (Speedway: a textura da torcida nos degraus).
//
//   StandCrowd.update(game, dt)   (StreetRacing.update) liga/desliga e anima       StandCrowd.sound(x, z)   volume da torcida ali
// ============================================================================

const StandCrowd = {
	SHIRTS: [[0.82, 0.12, 0.1], [0.98, 0.84, 0.12], [0.1, 0.55, 0.22], [0.12, 0.3, 0.75], [0.94, 0.94, 0.92], [0.1, 0.1, 0.11], [0.95, 0.5, 0.1], [0.55, 0.15, 0.6], [0.2, 0.7, 0.85]],
	_mesh: null, _flag: null, _mat: null, on: false, E: 0, _t: 0, _end: 0,

	// os lugares: [x, y, z, rumo] de cada torcedor (fileira por fileira, sem as escadarias; ~85% ocupado)
	_seats() {
		const out = [], R = typeof Relief !== 'undefined' ? (x, z) => Relief.at(x, z) : () => 0;
		for (const S of Speedway.standRows()) {
			const yb = R(S.anchor.x, S.anchor.z), yaw = S.dir < 0 ? Math.PI / 2 : -Math.PI / 2;      // (de frente para a pista: −v ou +v)
			for (let k = 0; k < S.N; k++) {
				const v = S.vFront + S.dir * (k + 0.55) * S.step, y = yb + S.y0 + (k + 1) * S.rise;
				for (let u = S.u0; u < S.u1 - 0.1; u += 12) {
					const ue = Math.min(S.u1, u + 11);
					for (let q = u + 0.9; q < ue - 0.6; q += 0.72) {
						const h = Pixel.hash(Math.round(q * 10), k, 77 + S.N);
						if (h > 0.86) continue;                                       // (lugares vazios)
						const p = Speedway.local(q + (Pixel.hash(Math.round(q * 10), k, 79) - 0.5) * 0.18, v);
						out.push([p.x, y, p.z, yaw + (Pixel.hash(Math.round(q * 10), k, 81) - 0.5) * 0.5, h]);
					}
				}
			}
		}
		return out;
	},

	_build(scene) {
		const seats = this._seats(), sc = scene;
		this._mat = this._material(sc);
		const mk = (name, flag) => {
			const g = this._geo(flag), mesh = new BABYLON.Mesh(name, sc), vd = new BABYLON.VertexData();
			vd.positions = new Float32Array(g.p); vd.normals = new Float32Array(g.n); vd.indices = new Uint16Array(g.i);
			vd.applyToMesh(mesh, false);
			mesh.setVerticesData('cwP', new Float32Array(g.k), false, 4);
			mesh.material = this._mat; mesh.isPickable = false; mesh.receiveShadows = true;
			return mesh;
		};
		this._mesh = mk('torcida', false); this._flag = mk('torcida_bandeira', true);
		const M = BABYLON.Matrix, Q = BABYLON.Quaternion, V = BABYLON.Vector3, q = new Q(), m = new M(), one = new V(1, 1, 1), tr = new V();
		const fill = (mesh, list) => {
			const n = list.length, mats = new Float32Array(n * 16), A = new Float32Array(n * 4), C = new Float32Array(n * 4);
			list.forEach((s, i) => {
				const sk = 0.92 + 0.16 * Pixel.hash(i, 3, 11);
				Q.RotationYawPitchRollToRef(s[3], 0, 0, q); tr.set(s[0], s[1], s[2]); one.set(sk, sk * (0.9 + 0.2 * Pixel.hash(i, 5, 13)), sk);
				M.ComposeToRef(one, q, tr, m); m.copyToArray(mats, i * 16);
				const sh = this.SHIRTS[Math.floor(Pixel.hash(i, 7, 17) * this.SHIRTS.length)];
				A[i * 4] = Pixel.hash(i, 9, 19); A[i * 4 + 1] = Pixel.hash(i, 11, 23); A[i * 4 + 2] = Pixel.hash(i, 13, 29); A[i * 4 + 3] = Pixel.hash(i, 15, 31);
				C[i * 4] = sh[0]; C[i * 4 + 1] = sh[1]; C[i * 4 + 2] = sh[2]; C[i * 4 + 3] = s[4];
			});
			mesh.thinInstanceSetBuffer('matrix', mats, 16, false);      // (staticBuffer = false: com true as instâncias não eram desenhadas — Trees3D)
			mesh.thinInstanceSetBuffer('cwA', A, 4, false);
			mesh.thinInstanceSetBuffer('cwC', C, 4, false);
			mesh.thinInstanceRefreshBoundingInfo(false);
		};
		fill(this._mesh, seats.filter((s) => s[4] > 0.14));
		fill(this._flag, seats.filter((s) => s[4] <= 0.14));
		this.count = seats.length;
		this._mesh.setEnabled(false); this._flag.setEnabled(false);
	},

	// O boneco (olhando para +z; os pés em y = 0): calça, camisa, cabeça, cabelo, braços (partes 1 e 2: giram no ombro) e, na
	// variante, a bandeira no mastro da mão direita (parte 3: vai junto com o braço e tremula).
	// cwP = (parte, material: 0 camisa, 1 pele, 2 calça, 3 cabelo, 4 bandeira, 5 mastro, u, v da bandeira)
	_geo(flag) {
		const g = { p: [], n: [], i: [], k: [] };
		const box = (x0, y0, z0, x1, y1, z1, part, mat) => {
			const F = [[[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]], [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0]],
				[[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]], [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0]],
				[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]]];
			for (const f of F) {
				const b = g.p.length / 3;
				for (let k = 0; k < 4; k++) { g.p.push(...f[k]); g.n.push(...f[4]); g.k.push(part, mat, 0, 0); }
				g.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
			}
		};
		box(-0.15, 0, -0.1, 0.15, 0.82, 0.1, 0, 2);                    // calça
		box(-0.2, 0.8, -0.12, 0.2, 1.36, 0.12, 0, 0);                  // camisa
		box(-0.035, 1.34, -0.04, 0.035, 1.42, 0.04, 0, 1);             // pescoço
		box(-0.1, 1.42, -0.1, 0.1, 1.66, 0.11, 0, 1);                  // cabeça
		box(-0.105, 1.6, -0.11, 0.105, 1.7, 0.09, 0, 3);               // cabelo
		for (const [s, part] of [[-1, 1], [1, 2]]) {
			box(s > 0 ? 0.2 : -0.29, 1.08, -0.05, s > 0 ? 0.29 : -0.2, 1.36, 0.05, part, 0);      // manga
			box(s > 0 ? 0.21 : -0.28, 0.8, -0.045, s > 0 ? 0.28 : -0.21, 1.08, 0.045, part, 1);  // antebraço e mão
		}
		if (flag) {
			box(0.235, 0.15, -0.015, 0.255, 0.82, 0.015, 3, 5);          // mastro (para baixo com o braço baixo; para cima, erguido)
			// (a bandeira em 4 × 2 quadradinhos: tremula ao longo do comprimento)
			const b = g.p.length / 3, NX = 4, NY = 2;
			for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
				const u = i / NX, v = j / NY;
				g.p.push(0.245 + 0.62 * u, 0.62 - 0.42 * v, 0); g.n.push(0, 0, 1); g.k.push(3, 4, u, v);
			}
			for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = b + j * (NX + 1) + i; g.i.push(a, a + 1, a + NX + 2, a, a + NX + 2, a + NX + 1); }
		}
		return g;
	},

	_material(sc) {
		const m = new BABYLON.StandardMaterial('torcida', sc);
		m.specularColor = BABYLON.Color3.Black();
		m.backFaceCulling = false;
		const self = this;
		class CrowdPlugin extends BABYLON.MaterialPluginBase {
			constructor(mat) { super(mat, 'StandCrowd', 140, { CROWD: false }); this._enable(true); }
			getClassName() { return 'CrowdPlugin'; }
			prepareDefines(d) { d.CROWD = true; }
			getAttributes(a) { a.push('cwP', 'cwA', 'cwC'); }
			getUniforms() { return { ubo: [{ name: 'crE', size: 4, type: 'vec4' }, { name: 'crK', size: 4, type: 'vec4' }], vertex: 'uniform vec4 crE;\nuniform vec4 crK;' }; }
			bindForSubMesh(ub) { ub.updateFloat4('crE', self._t, self.E, 0, 0); const K = self._K || [0, 0, 0, 0]; ub.updateFloat4('crK', K[0], K[1], K[2], K[3]); }
			getCustomCode(type) {
				if (type === 'vertex') return {
					CUSTOM_VERTEX_DEFINITIONS: `
						#ifdef CROWD
						attribute vec4 cwP;
						attribute vec4 cwA;
						attribute vec4 cwC;
						varying vec4 crM;
						varying vec4 crS;
						varying vec2 crU;
						vec3 crRz(vec3 p, vec2 c, float a) { vec2 q = p.xy - c; float s = sin(a), k = cos(a); return vec3(c + vec2(q.x * k - q.y * s, q.x * s + q.y * k), p.z); }
						#endif`,
					// (cwA: fase, pele, calça, bandeira · cwC: camisa rgb, sorteio)
					CUSTOM_VERTEX_UPDATE_POSITION: `
						#ifdef CROWD
						crM = vec4(cwP.y, cwA.y, cwA.z, cwA.w); crS = vec4(cwC.rgb, 0.0); crU = cwP.zw;
						float crPart = floor(cwP.x + 0.5), crT = crE.x, crPh = cwA.x * 6.2832;
						// vibração local: o carro (do jogador / o primeiro) passando perto da arquibancada levanta a galera
						#ifdef INSTANCES
						vec2 crW = vec2(world3.x, world3.z);
						#else
						vec2 crW = vec2(0.0);
						#endif
						float crB = max(1.0 - length(crW - crK.xy) / 38.0, 1.0 - length(crW - crK.zw) / 38.0);
						float crX = clamp(crE.y * (0.55 + 0.75 * max(crB, 0.0)), 0.0, 1.0);
						float crArm = 0.0;
						if (crPart > 0.5 && crPart < 3.5) {
							float side = crPart < 1.5 ? -1.0 : 1.0;
							// braço erguido (para cima e para fora) e balançando; quem não pula agita só um braço
							float up = crX * (2.35 + 0.45 * sin(crT * 9.0 + crPh)) * (cwA.w > 0.5 || crPart > 1.5 ? 1.0 : 0.7);
							crArm = side * up;
							positionUpdated = crRz(positionUpdated, vec2(side * 0.24, 1.32), crArm);
						}
						if (crPart > 2.5) {                                                    // a bandeira tremula
							float w = cwP.z;
							positionUpdated.z += sin(crT * 11.0 + crPh + w * 5.0) * 0.08 * w;
						}
						float jump = crX * 0.24 * max(0.0, sin(crT * 6.8 + crPh)) * step(0.35, cwA.x);
						positionUpdated.y += jump + crX * 0.03 * sin(crT * 3.1 + crPh);
						#endif`,
					CUSTOM_VERTEX_UPDATE_NORMAL: `
						#ifdef CROWD
						if (crPart > 0.5 && crPart < 3.5) normalUpdated = crRz(normalUpdated, vec2(0.0), crArm);
						#endif`,
				};
				if (type === 'fragment') return {
					CUSTOM_FRAGMENT_DEFINITIONS: `
						#ifdef CROWD
						varying vec4 crM;
						varying vec4 crS;
						varying vec2 crU;
						#endif`,
					CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
						#ifdef CROWD
						{
							float mt = floor(crM.x + 0.5);
							vec3 c = crS.rgb;
							if (mt > 0.5 && mt < 1.5) c = mix(vec3(0.95, 0.76, 0.6), vec3(0.32, 0.2, 0.13), crM.y);
							else if (mt > 1.5 && mt < 2.5) c = mix(vec3(0.16, 0.24, 0.42), vec3(0.08, 0.08, 0.09), step(0.5, crM.z));
							else if (mt > 2.5 && mt < 3.5) c = mix(vec3(0.08, 0.06, 0.05), vec3(0.45, 0.3, 0.15), step(0.8, crM.y));
							else if (mt > 3.5 && mt < 4.5) {                                    // bandeira: verde e amarela (losango), ou a da equipe
								float u = crU.x, v = crU.y;
								float dia = abs(u - 0.5) * 0.9 + abs(v - 0.5);
								vec3 br = dia < 0.42 ? vec3(0.98, 0.86, 0.1) : vec3(0.05, 0.55, 0.2);
								if (dia < 0.17) br = vec3(0.1, 0.25, 0.65);
								c = crM.w < 0.6 ? br : (crM.w < 0.8 ? mix(vec3(0.85, 0.1, 0.1), vec3(0.95), step(0.5, v)) : mix(vec3(0.05), vec3(0.95), step(0.5, fract((u + v) * 2.0))));
							}
							else if (mt > 4.5) c = vec3(0.6, 0.6, 0.62);
							baseColor.rgb = c;
						}
						#endif`,
				};
				return null;
			}
		}
		new CrowdPlugin(m);
		return m;
	},

	// Por quadro (StreetRacing.update): corrida no autódromo → a torcida aparece e vibra; fora dela, some.
	update(game, dt) {
		if (typeof Speedway === 'undefined' || !Speedway.site || !Speedway.built) return;
		const R = typeof StreetRacing !== 'undefined' ? StreetRacing.cur : null, oval = !!(R && R.ev && R.ev.type === 'oval');
		let goal = 0;
		if (oval) goal = R.phase === 'count' ? 0.55 : R.phase === 'race' ? 0.7 : 1.0;
		if (!oval && this._end > 0) { this._end -= dt; goal = 0.9; }               // (a festa continua uns segundos depois da chegada)
		if (oval && R.phase === 'end') this._end = 8;
		const want = goal > 0;
		if (want && !this._mesh) this._build(game.scene);
		if (!this._mesh) return;
		if (want !== this.on) { this.on = want; this._mesh.setEnabled(want); this._flag.setEnabled(want); }
		if (!want) { this.E = 0; return; }
		this._t = (this._t + dt) % 600;
		this.E += (goal - this.E) * Math.min(1, dt * 2);
		// os carros que levantam a arquibancada: o do jogador e o primeiro colocado (ou o rival mais perto)
		const pc = R && R.car && R.car.position, rv = R && R.rivals && R.rivals.length ? R.rivals[0] : null, rp = rv && (rv.position || (rv.car && rv.car.position));
		this._K = [pc ? pc.x : 1e5, pc ? pc.z : 1e5, rp ? rp.x : 1e5, rp ? rp.z : 1e5];
	},

	// Volume da torcida no ponto (Ambience): a arquibancada viva perto do autódromo.
	sound(x, z) {
		if (!this.on || !Speedway.site) return 0;
		const d = Math.hypot(x - Speedway.site.cx, z - Speedway.site.cz);
		return Math.max(0, 1 - d / 260) * (0.05 + 0.09 * this.E);
	},
};
