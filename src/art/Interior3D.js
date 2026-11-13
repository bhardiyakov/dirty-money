// ============================================================================
// Interior3D — os INTERIORES em 3D de verdade (lojas, bares, restaurantes, academia, mercado, farmácia, boutique, armas, boca, casas,
// bancos e joalherias). Ver docs/interiores-3d.md.
//
// Os layouts continuam nos ShopStyles (art/ShopStyles.js — onde fica cada móvel, os sólidos, os usos, a clientela): enquanto pintam, o
// ShopCtx GRAVA cada peça com os parâmetros dela e os sólidos que ela registrou (art/InteriorHD.js). Com a gravação, a sala é montada
// em volume, numa casa de bonecas sem teto:
//   • CASCA: piso (a pintura HD só do piso, tapetes e sombras de contato), parede do fundo com a pintura dela (quadros, janelas,
//     cardápio, prateleiras de parede, TV, relógio…), laterais e frente com a textura da parede do tipo, rodapé, tampo das paredes,
//     batentes e a luz da rua entrando pela porta;
//   • MÓVEIS com modelo próprio: mesa (tampo com a toalha e os pratos pintados, pés), cadeira (assento, encosto, pés), banqueta (coluna
//     cromada e assento estofado), vaso de planta (vaso de barro e folhagem), luminária pendente (fio, cúpula, lâmpada acesa), prateleira
//     de parede (montantes, tábuas e produtos em volume nas cores da loja), gôndola, geladeira de bebidas (porta de vidro, garrafas
//     coloridas, luz interna) e máquina de venda (painel aceso);
//   • TODO O RESTO (balcão, forno, mesa de sinuca, cama, sofá, cofre, esteira, vitrine…): um bloco do tamanho do sólido da peça, com o
//     TOPO e a FRENTE recortados da própria pintura HD dela — o mesmo desenho, agora com volume;
//   • LUZ: as luzes da sala (lâmpadas, forno, neon) viram luzes pontuais que só iluminam a sala (as mais fortes, até 4).
// As paredes que ficam entre a câmera e o jogador ficam transparentes (a câmera de 3ª pessoa anda em volta dele dentro da sala).
// Config.art.interior3d = false (ou `?interior=2d`) volta à sala pintada vista de cima.
// ============================================================================

const Interior3D = {
	get on() {
		if (typeof document === 'undefined' || (Config.art && Config.art.interior3d === false)) return false;
		return !(typeof location !== 'undefined' && /[?&]interior=2d\b/.test(location.search));
	},
	H: 3.0,                    // altura das paredes (m)
	// Peças que viram desenho do piso/parede (sem volume): o piso, tapetes, a casca, os enfeites de parede e o que não tem sólido.
	FLAT: { floor: 1, rug: 1, tatami: 1, shell: 1, graffiti: 1, cushion: 1, trucoCards: 1, cardboard: 1 },
	// Peças pequenas pintadas EM CIMA de outra (pratos, copos, garrafas, velas): aparecem no recorte da peça de baixo.
	ON_TOP: { plate: 1, glass: 1, bottle: 1, candle: 1, sake: 1, shadow: 1 },

	// A sala de `data` (ShopStyles.get) montada no palco `o` ({x, z}). Devolve o objeto da sala (root, obstáculos, update, dispose)
	// ou null quando a sala não tem a gravação (o Interiors usa a sala pintada).
	build(scene, data, o) {
		const S = data.S, ops = data.rec, cvw = data.canvas;
		if (!S || !ops || !cvw || !cvw.canvas) return null;
		const t0 = performance.now(), R = new Interior3DRoom(scene, data, o);
		R.build();
		this.lastMs = performance.now() - t0;
		return R;
	},
	// O ESCONDERIJO (o barraco do começo do jogo: HouseView.stageRoom, pintado por art/InteriorHDHome.js): os mesmos sólidos e a mesma
	// pintura HD, com o piso de cimento repintado sem os móveis e as paredes de tijolo.
	buildHome(scene, data, o) {
		const cvw = data.canvas;
		if (!cvw || !cvw.canvas || typeof SafeHouse === 'undefined') return null;
		const SH = SafeHouse, IN = HouseArt.IN, PPU = 20, K = HouseArt.K;
		const S = {
			style: 'home_simple', seed: 8080, W: SH.W, D: SH.D, T: SH.T, H: SH.H, PPU, K, IN, m: false,
			wpx: Math.round((IN.x1 - IN.x0) * PPU), hpxTot: Math.round((IN.z1 - IN.z0) * PPU), door: { x0: SH.door.x0, x1: SH.door.x1 },
			lights: [{ x: 0, y: 0, r: 95, col: [255, 214, 140], a: 0.6 }],
			X(x) { return Math.round((x - IN.x0) * PPU); }, Y(z) { return Math.round((IN.z1 - z) * PPU); }, hp(h) { return Math.round(h * K * PPU); },
			P(x) { return x; }, R(x0, z0, x1, z1) { return [x0, z0, x1, z1]; },
		};
		S.nY = S.Y(S.D - S.T); S.faceH = S.hp(S.H);
		S.lights[0].x = S.X(4.6); S.lights[0].y = S.Y(4.6);
		S.obs = data.obs.map((b) => Object.assign({ bz1: b.z1 }, b, b.h >= SH.H - 0.01 ? { wall: 1 } : {}));
		const R = new Interior3DRoom(scene, Object.assign({}, data, { S, rec: [], home: true }), o);
		R.build();
		return R;
	},
	// Textura macia e redonda das partículas (vapor, poeira) — uma para todas as salas.
	puff(scene) {
		if (this._puff && !this._puff.isDisposed) return this._puff;
		const t = new BABYLON.DynamicTexture('sala3d_puff', 64, scene, false), g = t.getContext(), r = g.createRadialGradient(32, 32, 0, 32, 32, 31);
		r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
		g.fillStyle = r; g.fillRect(0, 0, 64, 64); t.update(); t.hasAlpha = true;
		return (this._puff = t);
	},
};

// ----------------------------------------------------------------------------
// Acumulador de geometria (posições, normais, UV, cores) — uma malha por material no fim.
// ----------------------------------------------------------------------------
class I3Batch {
	constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; }
	get empty() { return !this.i.length; }
	// Quadrilátero a, b, c, d (no sentido anti-horário visto de fora), normal n, UVs uv[4], cor col.
	quad(a, b, c, d, n, uv, col) {
		const k = this.p.length / 3;
		for (const v of [a, b, c, d]) this.p.push(v[0], v[1], v[2]);
		for (let j = 0; j < 4; j++) this.n.push(n[0], n[1], n[2]);
		if (uv) this.uv.push(...uv); else this.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
		const C = col || [1, 1, 1, 1];
		for (let j = 0; j < 4; j++) this.c.push(C[0], C[1], C[2], C[3] === undefined ? 1 : C[3]);
		this.i.push(k, k + 2, k + 1, k, k + 3, k + 2);
	}
	// Caixa alinhada aos eixos. cols: { top, side, front, bottom } (cor RGBA 0..1) ou uma cor; uvs: { top, front, side } (4 pares) opcionais.
	box(x0, y0, z0, x1, y1, z1, cols, uvs = {}, skipBottom = true) {
		const C = Array.isArray(cols) ? { top: cols, side: cols, front: cols, back: cols } : cols;
		const sd = C.side || C.front, sh = (c, k) => (c ? [c[0] * k, c[1] * k, c[2] * k, c[3] === undefined ? 1 : c[3]] : null);
		this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], uvs.top, C.top || sd);                              // topo
		this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], uvs.front, C.front || sd);                         // frente (sul)
		this.quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [0, 0, 1], uvs.back || uvs.front, C.back || sh(sd, 0.86));    // fundo (norte)
		this.quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0], uvs.side || uvs.front, sh(sd, 0.93));            // oeste
		this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], uvs.side || uvs.front, sh(sd, 0.93));             // leste
		if (!skipBottom) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], [0, -1, 0], null, sh(sd, 0.5));
	}
	// Cilindro vertical (centro x, z; raio r; de y0 a y1), seg lados, com tampa em cima.
	cyl(x, z, r, y0, y1, col, seg = 12, rTop = r, cap = true) {
		for (let s = 0; s < seg; s++) {
			const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1), am = (a0 + a1) / 2;
			this.quad([x + c1 * r, y0, z + s1 * r], [x + c0 * r, y0, z + s0 * r], [x + c0 * rTop, y1, z + s0 * rTop], [x + c1 * rTop, y1, z + s1 * rTop], [Math.cos(am), 0, Math.sin(am)], null, col);
			if (cap) this.quad([x, y1, z], [x, y1, z], [x + c1 * rTop, y1, z + s1 * rTop], [x + c0 * rTop, y1, z + s0 * rTop], [0, 1, 0], null, col);
		}
	}
	// Bola achatada (folhagem, lâmpada): esfera de baixa resolução.
	ball(x, y, z, rx, ry, rz, col, seg = 8) {
		const rings = Math.max(3, seg >> 1);
		for (let j = 0; j < rings; j++) for (let s = 0; s < seg; s++) {
			const t0 = (j / rings) * Math.PI, t1 = ((j + 1) / rings) * Math.PI, a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
			const P = (t, a) => [x + Math.sin(t) * Math.cos(a) * rx, y + Math.cos(t) * ry, z + Math.sin(t) * Math.sin(a) * rz], N = (t, a) => [Math.sin(t) * Math.cos(a), Math.cos(t), Math.sin(t) * Math.sin(a)];
			const tm = (t0 + t1) / 2, am = (a0 + a1) / 2;
			this.quad(P(t1, a0), P(t1, a1), P(t0, a1), P(t0, a0), N(tm, am), null, col);
		}
	}
	mesh(name, scene, mat, parent) {
		if (this.empty) return null;
		const m = new BABYLON.Mesh(name, scene), vd = new BABYLON.VertexData();
		vd.positions = this.p; vd.normals = this.n; vd.uvs = this.uv; vd.colors = this.c; vd.indices = this.i;
		vd.applyToMesh(m, false);
		m.material = mat; m.parent = parent; m.isPickable = false;
		m.freezeWorldMatrix();
		return m;
	}
}

// ----------------------------------------------------------------------------
// Uma sala montada.
// ----------------------------------------------------------------------------
class Interior3DRoom {
	constructor(scene, data, o) {
		this.scene = scene; this.data = data; this.o = o; this.S = data.S; this.Q = data.canvas.hd || 1;
		this.cvFull = data.canvas.canvas;
		this.root = new BABYLON.TransformNode('sala3d_' + this.S.style, scene);
		this.root.position.set(o.x, 0, o.z);
		this.meshes = []; this.textures = []; this.mats = []; this.lights = [];
		this.walls = {};             // n, s, e, w → malhas da parte alta (somem quando ficam entre a câmera e o jogador)
		this.rng = Pixel.rng(this.S.seed * 7 + 3);
	}
	get H() { return Interior3D.H; }
	hex(c, a = 1) { const v = typeof c === 'string' ? Pixel.hex(c) : c; return [v[0] / 255, v[1] / 255, v[2] / 255, a]; }
	shade(c, k) { return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k), c[3] === undefined ? 1 : c[3]]; }

	// ---------------------------------------------------------------- materiais e texturas
	_tex(name, canvas, wrap = false) {
		const t = new BABYLON.DynamicTexture(name, canvas, this.scene, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
		t.update(true);
		t.wrapU = t.wrapV = wrap ? BABYLON.Texture.WRAP_ADDRESSMODE : BABYLON.Texture.CLAMP_ADDRESSMODE;
		t.anisotropicFilteringLevel = 4;
		this.textures.push(t);
		return t;
	}
	// Material da sala: a cor/textura própria + um tanto de emissivo (a pintura já traz a luz da sala) e as luzes da sala por cima.
	_mat(name, tex = null, { emissive = 0.5, alpha = false, colors = true } = {}) {
		const m = new BABYLON.StandardMaterial(name, this.scene);
		if (tex) { m.diffuseTexture = tex; m.emissiveTexture = tex; }
		m.diffuseColor = new BABYLON.Color3(0.62, 0.62, 0.62);
		m.emissiveColor = new BABYLON.Color3(emissive, emissive, emissive);
		m.specularColor = new BABYLON.Color3(0.06, 0.06, 0.06);
		m.maxSimultaneousLights = 6;
		m.backFaceCulling = false;
		if (alpha) { m.alpha = 0.999; }
		m._i3colors = colors;
		this.mats.push(m);
		return m;
	}
	_add(m) { if (m) { this.meshes.push(m); m.renderingGroupId = 0; } return m; }

	// ---------------------------------------------------------------- coordenadas
	// Ponto da arte (px de 20/u, eixo y para o sul) → UV da textura do canvas HD (invertY: v = 1 no topo).
	uv(cw, ch, px, py) { return [(px * this.Q) / cw, 1 - (py * this.Q) / ch]; }
	// UVs de um retângulo de px da arte (x0, y0 = topo-esquerdo … x1, y1) para um quad a,b,c,d = (base-esq, base-dir, topo-dir, topo-esq).
	uvRect(cw, ch, x0, y0, x1, y1) { const A = this.uv(cw, ch, x0, y1), B = this.uv(cw, ch, x1, y1), C = this.uv(cw, ch, x1, y0), D = this.uv(cw, ch, x0, y0); return [A[0], A[1], B[0], B[1], C[0], C[1], D[0], D[1]]; }
	// Topo de um retângulo do piso (x0..x1, z0..z1): a,b,c,d = (x0,z0), (x1,z0), (x1,z1), (x0,z1) — px: X(x), Y(z) − dy.
	uvTop(cw, ch, x0, z0, x1, z1, dy = 0) {
		const S = this.S, P = (x, z) => this.uv(cw, ch, S.X(x), S.Y(z) - dy);
		return [...P(x0, z0), ...P(x1, z0), ...P(x1, z1), ...P(x0, z1)];
	}

	// ---------------------------------------------------------------- montagem
	build() {
		const S = this.S, ops = this.data.rec;
		this._baseCanvas(ops);
		this._shell();
		this.colors = new I3Batch(); this.crops = new I3Batch(); this.glow = new I3Batch();
		if (this.data.home) this._blocks({ o0: 0, o1: S.obs.length });
		for (const op of ops) {
			if (!op.prim || Interior3D.FLAT[op.k] || InteriorHD.WALL[op.k] || Interior3D.ON_TOP[op.k]) continue;
			const f = this['m_' + op.k];
			if (f && f.call(this, op, ...op.a) !== false) continue;
			this._blocks(op);
		}
		const cw = this.cvFull.width, ch = this.cvFull.height;
		this.fullTex = this._tex('sala3d_moveis', this.cvFull);
		this._add(this.crops.mesh('sala3d_moveis', this.scene, this._mat('sala3d_moveisMat', this.fullTex, { emissive: 0.55 }), this.root));
		this._add(this.colors.mesh('sala3d_pecas', this.scene, this._mat('sala3d_pecasMat', null, { emissive: 0.32 }), this.root));
		const gm = this._mat('sala3d_luzMat', null, { emissive: 1 }); gm.disableLighting = true;
		this._add(this.glow.mesh('sala3d_luz', this.scene, gm, this.root));
		void cw; void ch;
		this._lights();
		this._life(ops);
		this.obstacles = this.data.obs.map((s) => ({ x0: this.o.x + s.x0, z0: this.o.z + s.z0, x1: this.o.x + s.x1, z1: this.o.z + (s.bz1 !== undefined ? s.bz1 : s.z1), h: s.h }));
		for (const m of this.meshes) m.alwaysSelectAsActiveMesh = false;
	}

	// Canvas da CASCA: só o piso, tapetes, a parede do fundo com os enfeites dela e o que é chato (sem volume), com a luz da sala.
	_baseCanvas(ops) {
		const S = this.S, Q = this.Q, cv = document.createElement('canvas');
		cv.width = this.cvFull.width; cv.height = this.cvFull.height;
		const g = cv.getContext('2d', InteriorHD.CTX);
		g.setTransform(Q, 0, 0, Q, 0, 0); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.lineJoin = 'round'; g.lineCap = 'round';
		if (this.data.home) {                                                                // (esconderijo: o contrapiso de cimento rachado e manchado, sem os móveis)
			const P = new HDPainter(g, S, Q, cv), T = S.T, x0 = S.X(T), x1 = S.X(S.W - T), y0 = S.nY, y1 = S.Y(T);
			P.base();
			g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
			P.fConcrete(x0, y0, x1 - x0, y1 - y0, [124, 118, 104], [96, 90, 78], 40);
			for (const [x, z, n, sd] of [[4.0, 6.6, 60, 1], [6.2, 4.6, 40, 2], [2.6, 4.4, 34, 3], [8.6, 3.4, 30, 4]]) P.crack(S.X(x), S.Y(z), n, Pixel.rng(sd), [118, 112, 100]);
			const stain = (cx, cy, r, col, a) => { g.fillStyle = P.rad(cx, cy, 0, r, [[0, col, a], [0.6, col, a * 0.6], [1, col, 0]]); g.fillRect(cx - r, cy - r, r * 2, r * 2); };
			stain(S.X(4.65), S.Y(3.55), 18, [24, 34, 44], 0.45); stain(S.X(1.4), S.Y(4.6), 14, [28, 40, 24], 0.4); stain(S.X(6.0), S.Y(5.6), 12, [42, 28, 14], 0.4); stain(S.X(7.4), S.Y(1.5), 11, [70, 50, 26], 0.35);
			g.restore();
			P.post({ vignette: 0 });
			this.cvBase = cv;
			return;
		}
		const own = (k) => typeof Interior3DRoom.prototype['m_' + k] === 'function';
		const keep = ops.filter((op) => op.prim ? (Interior3D.FLAT[op.k] || InteriorHD.WALL[op.k] || (op.o1 === op.o0 && !Interior3D.ON_TOP[op.k] && !own(op.k) && op.k !== 'blk')) : op.k === 'grain');
		const P = new HDPainter(g, S, Q, cv);
		P.paint(keep);
		P.post({ vignette: 0 });
		this.cvBase = cv;
	}

	_shell() {
		const S = this.S, T = S.T, W = S.W, D = S.D, H = this.H, cw = this.cvBase.width, ch = this.cvBase.height, d = S.door;
		const base = this._tex('sala3d_casca', this.cvBase), mat = this._mat('sala3d_cascaMat', base, { emissive: 0.6 });
		// piso
		const F = new I3Batch();
		F.quad([T, 0.012, T], [W - T, 0.012, T], [W - T, 0.012, D - T], [T, 0.012, D - T], [0, 1, 0], this.uvTop(cw, ch, T, T, W - T, D - T), null);
		this._add(F.mesh('sala3d_piso', this.scene, mat, this.root));
		// parede do fundo: a face pintada (do topo da parede alta da pintura até o pé)
		const top = S.nY - S.faceH - InteriorHD.EXT, N = new I3Batch(), zN = D - T;
		N.quad([T, 0, zN], [W - T, 0, zN], [W - T, H, zN], [T, H, zN], [0, 0, -1], this.uvRect(cw, ch, S.X(T), top, S.X(W - T), S.nY), null);
		// laterais e frente: a textura da parede do tipo, repetida
		const sh = this.data.rec.find((op) => op.k === 'shell'), so = sh ? sh.a[0] : {}, nk = so.n || (this.data.home ? { kind: 'brick', A: '#a4513a', B: '#b96a48' } : { kind: 'paint', A: '#c8c0b0' });
		const tile = this._wallTile(nk.kind, nk.A, nk.B), tmat = this._mat('sala3d_paredeMat', tile, { emissive: 0.5 });
		const TW = 3.2, TH = 2.8, side = (x0, z0, x1, z1, n) => {
			const L = Math.hypot(x1 - x0, z1 - z0), B = new I3Batch();
			B.quad([x0, 0, z0], [x1, 0, z1], [x1, H, z1], [x0, H, z0], n, [0, 0, L / TW, 0, L / TW, H / TH, 0, H / TH], null);
			return B;
		};
		const Wb = side(T, D - T, T, T, [1, 0, 0]), Eb = side(W - T, T, W - T, D - T, [-1, 0, 0]);
		const Sb = new I3Batch(), dh = 2.45;
		for (const [xa, xb] of [[T, d.x0], [d.x1, W - T]]) if (xb > xa) Sb.quad([xb, 0, T], [xa, 0, T], [xa, H, T], [xb, H, T], [0, 0, 1], [xb / TW, 0, xa / TW, 0, xa / TW, H / TH, xb / TW, H / TH], null);
		Sb.quad([d.x1, dh, T], [d.x0, dh, T], [d.x0, H, T], [d.x1, H, T], [0, 0, 1], [d.x1 / TW, dh / TH, d.x0 / TW, dh / TH, d.x0 / TW, H / TH, d.x1 / TW, H / TH], null);
		// tampo das paredes (corte da casa de bonecas), rodapé, batentes
		const cap = this.hex(so.cap || '#6a6258'), C = new I3Batch(), skirt = this.hex(so.side || '#5a4a3a'), wood = this.hex('#4a3424');
		C.box(0, H, 0, W, H + 0.06, T, cap); C.box(0, H, D - T, W, H + 0.06, D, cap); C.box(0, H, T, T, H + 0.06, D - T, cap); C.box(W - T, H, T, W, H + 0.06, D - T, cap);
		for (const [x0, z0, x1, z1] of [[T, T, T + 0.03, D - T], [W - T - 0.03, T, W - T, D - T], [T, T, d.x0, T + 0.03], [d.x1, T, W - T, T + 0.03]]) C.box(x0, 0, z0, x1, 0.12, z1, this.shade(skirt, 0.7));
		C.box(d.x0 - 0.12, 0, T - 0.02, d.x0, dh + 0.1, T + 0.06, wood); C.box(d.x1, 0, T - 0.02, d.x1 + 0.12, dh + 0.1, T + 0.06, wood); C.box(d.x0 - 0.12, dh, T - 0.02, d.x1 + 0.12, dh + 0.12, T + 0.06, wood);
		// a rua lá fora, clara, vista pela porta
		const G = new I3Batch(), day = this.hex('#a8bccb');
		G.quad([d.x1 + 0.3, 0, -0.6], [d.x0 - 0.3, 0, -0.6], [d.x0 - 0.3, 2.8, -0.6], [d.x1 + 0.3, 2.8, -0.6], [0, 0, 1], null, day);
		G.quad([d.x0 - 0.3, 0.01, -0.6], [d.x1 + 0.3, 0.01, -0.6], [d.x1 + 0.3, 0.01, T], [d.x0 - 0.3, 0.01, T], [0, 1, 0], null, this.hex('#8a8a84'));
		if (this.data.home) { N.uv.length = 0; N.uv.push(T / TW, 0, (W - T) / TW, 0, (W - T) / TW, H / TH, T / TW, H / TH); }      // (esconderijo: tijolo também no fundo)
		const nm = this._add(N.mesh('sala3d_paredeN', this.scene, this.data.home ? tmat : mat, this.root));
		const wm = this._add(Wb.mesh('sala3d_paredeO', this.scene, tmat, this.root)), em = this._add(Eb.mesh('sala3d_paredeL', this.scene, tmat, this.root)), sm = this._add(Sb.mesh('sala3d_paredeS', this.scene, tmat, this.root));
		this._add(C.mesh('sala3d_acabamento', this.scene, this._mat('sala3d_acabMat', null, { emissive: 0.3 }), this.root));
		const gm = this.streetMat = this._mat('sala3d_ruaMat', null, { emissive: 1 }); gm.disableLighting = true;
		this._add(G.mesh('sala3d_rua', this.scene, gm, this.root));
		this.walls = { n: nm, w: wm, e: em, s: sm };
	}
	// Textura de parede repetível (64 × 56 px = 3,2 × 2,8 u): o mesmo pintor dos layouts (ShopCtx.wallTex).
	_wallTile(kind, A, B) {
		const S = this.S, ctx = Object.create(ShopCtx.prototype);
		ctx.c = HouseArt._P(64, 56); ctx.rng = Pixel.rng(S.seed + 17); ctx.seed = S.seed;
		ctx.wallTex(kind || 'paint', 0, 0, 64, 56, A || '#c8c0b0', B || A || '#c8c0b0');
		HouseArt._grain(ctx.c, 0, 0, 64, 56, 4, S.seed);
		const t = ctx.c.toTexture(this.scene, { wrap: true, mips: true });
		this.textures.push(t);
		return t;
	}

	// ---------------------------------------------------------------- blocos com a pintura (toda peça sem modelo próprio)
	_blocks(op) {
		const S = this.S, obs = S.obs, cw = this.cvFull.width, ch = this.cvFull.height;
		if (op.o0 === undefined || op.o1 <= op.o0) return;
		for (let i = op.o0; i < op.o1; i++) {
			const s = obs[i];
			if (s.wall) continue;
			const z1 = s.bz1 !== undefined ? s.bz1 : s.z1, h = Math.min(this.H - 0.1, Math.max(0.05, s.h || 1)), hp = S.hp(h);
			const top = this.uvTop(cw, ch, s.x0, s.z0, s.x1, z1, hp);
			const fr = this.uvRect(cw, ch, S.X(s.x0), S.Y(s.z0) - hp, S.X(s.x1), S.Y(s.z0));
			this.crops.box(s.x0, 0, s.z0, s.x1, h, z1, [1, 1, 1, 1], { top, front: fr, side: fr, back: fr });
		}
	}

	// ---------------------------------------------------------------- peças com modelo próprio (m_<peça>, os mesmos parâmetros do ShopCtx)
	m_stool(op, x, z) {
		const B = this.colors, chrome = this.hex('#9aa0a8'), seat = this.hex('#b8382c');
		B.cyl(x, z, 0.2, 0, 0.03, this.hex('#3a3d44'), 12);
		B.cyl(x, z, 0.035, 0.03, 0.66, chrome, 8);
		B.cyl(x, z, 0.17, 0.24, 0.26, chrome, 12, 0.17, false);                     // aro de apoiar os pés
		B.cyl(x, z, 0.21, 0.66, 0.74, seat, 14, 0.2);
	}
	m_chair(op, x, z, face = 's', col = '#7a5230') {
		const B = this.colors, c = this.hex(col), dk = this.shade(c, 0.7), r = 0.21, sy = 0.46;
		for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.box(x + dx * r - 0.025, 0, z + dz * r - 0.025, x + dx * r + 0.025, sy, z + dz * r + 0.025, dk);
		B.box(x - 0.24, sy, z - 0.24, x + 0.24, sy + 0.05, z + 0.24, c);
		const bk = 0.92;                                                                    // encosto do lado de `face` (s = encosto ao norte)
		if (face === 's') B.box(x - 0.24, sy, z + 0.2, x + 0.24, bk, z + 0.25, c);
		else if (face === 'n') B.box(x - 0.24, sy, z - 0.25, x + 0.24, bk, z - 0.2, c);
		else if (face === 'e') B.box(x - 0.25, sy, z - 0.24, x - 0.2, bk, z + 0.24, c);
		else B.box(x + 0.2, sy, z - 0.24, x + 0.25, bk, z + 0.24, c);
	}
	m_table(op, cx, cz, w, d, cloth = 'wood', col = null) {
		const S = this.S, cw = this.cvFull.width, ch = this.cvFull.height, x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, h = 0.78, hp = S.hp(0.85);
		const top = this.uvTop(cw, ch, x0, z0, x1, z1, hp);
		const wood = this.hex(col || '#8a6238'), leg = this.shade(wood, 0.6);
		const skirt = cloth === 'check' ? this.hex('#c43a34') : cloth === 'white' ? this.hex('#ecebe4') : this.shade(wood, 0.8);
		const drop = cloth === 'wood' ? 0.05 : 0.32;
		this.crops.quad([x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1], [0, 1, 0], top, null);
		this.colors.box(x0, h - drop, z0, x1, h - 0.002, z1, { top: skirt, side: skirt, front: skirt }, {}, true);
		if (cloth === 'wood' || cloth === 'round') for (const [dx, dz] of [[x0 + 0.08, z0 + 0.08], [x1 - 0.08, z0 + 0.08], [x1 - 0.08, z1 - 0.08], [x0 + 0.08, z1 - 0.08]]) this.colors.box(dx - 0.035, 0, dz - 0.035, dx + 0.035, h - drop, dz + 0.035, leg);
		else this.colors.cyl(cx, cz, 0.05, 0, h - drop, this.hex('#3a3430'), 8);
	}
	m_plant(op, x, z, big = true) {
		const B = this.colors, k = big ? 1 : 0.7;
		B.cyl(x, z, 0.26 * k, 0, 0.45 * k, this.hex('#a85a3a'), 12, 0.32 * k);
		B.cyl(x, z, 0.3 * k, 0.43 * k, 0.47 * k, this.hex('#3a2a1c'), 12);
		const leaves = ['#3f8a3a', '#2f7030', '#58a850', '#357a34'];
		for (let i = 0; i < 7; i++) {
			const a = i * 0.9 + this.rng() * 0.5, r = (0.12 + this.rng() * 0.16) * k;
			B.ball(x + Math.cos(a) * r, (0.75 + this.rng() * 0.5) * k + 0.3, z + Math.sin(a) * r, 0.2 * k, 0.26 * k, 0.2 * k, this.hex(leaves[i % 4]), 7);
		}
	}
	m_lamp(op, x, z, col = '#fff0b0', shade = null) {
		const B = this.colors, y = shade ? 2.25 : 2.4;
		B.box(x - 0.008, y + 0.1, z - 0.008, x + 0.008, this.H, z + 0.008, this.hex('#1a1410'));
		if (shade) B.cyl(x, z, 0.3, y - 0.05, y + 0.12, this.hex(shade), 14, 0.12);
		else B.cyl(x, z, 0.05, y + 0.02, y + 0.1, this.hex('#2a2420'), 8);
		this.glow.ball(x, y - 0.03, z, 0.07, 0.07, 0.07, this.hex(col), 8);
	}
	// Prateleira de parede: montantes, tábuas e produtos em volume (garrafas e caixas nas cores da loja).
	m_shelf(op, r, h, tiers, prods, wood = '#7a5430') {
		const B = this.colors, wd = this.hex(wood), [x0, z0, x1, z1] = r, rng = this.rng, dark = this.shade(wd, 0.55);
		B.box(x0, 0, z1 - 0.04, x1, h, z1, dark);                                            // fundo
		B.box(x0, 0, z0, x0 + 0.05, h, z1, wd); B.box(x1 - 0.05, 0, z0, x1, h, z1, wd);       // montantes
		for (let t = 0; t <= tiers; t++) {
			const y = t === 0 ? 0.08 : (t / tiers) * (h - 0.1) + 0.05;
			B.box(x0 + 0.05, y - 0.03, z0, x1 - 0.05, y, z1 - 0.04, wd);
			if (t === tiers) break;
			const room = (h - 0.1) / tiers - 0.06;
			for (let x = x0 + 0.08; x < x1 - 0.14;) {
				const pc = this.hex(prods[Math.floor(rng() * prods.length)]), bottle = rng() < 0.35, pw = bottle ? 0.07 : 0.1 + rng() * 0.12, ph = Math.min(room, (bottle ? 0.24 : 0.14) + rng() * 0.14);
				const pz0 = z0 + 0.04, pz1 = Math.min(z1 - 0.06, pz0 + (bottle ? 0.08 : 0.16 + rng() * 0.1));
				if (bottle) { B.cyl(x + pw / 2, (pz0 + pz1) / 2, 0.035, y, y + ph * 0.7, pc, 6); B.cyl(x + pw / 2, (pz0 + pz1) / 2, 0.014, y + ph * 0.7, y + ph, pc, 6); }
				else B.box(x, y, pz0, x + pw, y + ph, pz1, { top: this.shade(pc, 1.12), front: pc, side: this.shade(pc, 0.85) });
				x += pw + 0.02 + rng() * 0.03;
			}
		}
	}
	// Gôndola (corredor de prateleiras dos dois lados) com produtos.
	m_gondola(op, r, h, prods, body = '#c8ccd0') {
		const B = this.colors, bd = this.hex(body), [x0, z0, x1, z1] = r, rng = this.rng, zm = (z0 + z1) / 2;
		B.box(x0, 0, zm - 0.04, x1, h, zm + 0.04, this.shade(bd, 0.85));
		B.box(x0, 0, z0, x1, 0.1, z1, this.shade(bd, 0.6));
		B.box(x0, h - 0.03, z0 + 0.05, x1, h, z1 - 0.05, bd);
		const rows = 3;
		for (let t = 0; t < rows; t++) {
			const y = 0.12 + (t / rows) * (h - 0.2);
			for (const [za, zb] of [[z0, zm - 0.04], [zm + 0.04, z1]]) {
				B.box(x0, y - 0.02, za, x1, y, zb, bd);
				for (let x = x0 + 0.04; x < x1 - 0.12;) {
					const pc = this.hex(prods[Math.floor(rng() * prods.length)]), pw = 0.08 + rng() * 0.1, ph = 0.12 + rng() * 0.14;
					B.box(x, y, za + 0.03, x + pw, y + ph, zb - 0.03, { top: this.shade(pc, 1.12), front: pc, side: this.shade(pc, 0.85) });
					x += pw + 0.02;
				}
			}
		}
	}
	// Geladeira de bebidas: gabinete branco, faixa da marca, porta de vidro com as garrafas e a luz de dentro.
	m_cooler(op, r, h, col = '#2f86d0') {
		const B = this.colors, [x0, z0, x1, z1] = r, rng = this.rng, white = this.hex('#e4e8ec'), brand = this.hex(col);
		B.box(x0, 0, z0 + 0.04, x1, h, z1, white);
		B.box(x0 + 0.02, h - 0.22, z0, x1 - 0.02, h - 0.04, z0 + 0.05, brand);
		B.box(x0 + 0.06, 0.12, z0 + 0.02, x1 - 0.06, h - 0.26, z0 + 0.04, this.hex('#203040'));
		const shelves = 4, gy0 = 0.16, gy1 = h - 0.3;
		for (let t = 0; t < shelves; t++) {
			const y = gy0 + (t / shelves) * (gy1 - gy0);
			for (let x = x0 + 0.1; x < x1 - 0.12; x += 0.1) {
				const pc = this.hex(['#d9453a', '#3f9a52', '#e0a020', '#2f86d0', '#8a4ab0', '#e8e0d0'][Math.floor(rng() * 6)]);
				this.glow.cyl(x + 0.04, z0 + 0.0, 0.032, y, y + 0.2, this.shade(pc, 0.9), 6);
			}
		}
		this.glow.box(x0 + 0.06, h - 0.29, z0 - 0.005, x1 - 0.06, h - 0.27, z0 + 0.01, this.hex('#f4f8ff'));
	}
	m_vending(op, r, h, col = '#c0302a') {
		const B = this.colors, [x0, z0, x1, z1] = r, c = this.hex(col), rng = this.rng;
		B.box(x0, 0, z0, x1, h, z1, c);
		const px1 = x1 - 0.32;
		this.glow.box(x0 + 0.08, 0.6, z0 - 0.01, px1, h - 0.12, z0 + 0.005, this.hex('#2a3a4a'));
		for (let t = 0; t < 5; t++) for (let x = x0 + 0.12; x < px1 - 0.08; x += 0.12) {
			const y = 0.66 + t * ((h - 0.8) / 5), pc = this.hex(['#c0392b', '#e8e0d0', '#3a6fc4', '#3f9a52', '#e0a020'][Math.floor(rng() * 5)]);
			this.glow.box(x, y, z0 - 0.02, x + 0.07, y + 0.16, z0 - 0.005, pc);
		}
		B.box(px1 + 0.06, 0.9, z0 - 0.02, x1 - 0.06, 1.4, z0, this.hex('#3a3d44'));
		this.glow.box(px1 + 0.1, 1.45, z0 - 0.02, x1 - 0.1, 1.55, z0 - 0.005, this.hex('#7ad088'));
		B.box(x0 + 0.1, 0.18, z0 - 0.02, x1 - 0.1, 0.4, z0, this.hex('#0c0c10'));
	}

	// Academia: suporte de agachamento (colunas, barra com anilhas, tapete de borracha), banco de supino, esteira, local de rosca.
	_mat3(cx, cz, w, d) { this.colors.box(cx - w, 0.005, cz - d, cx + w, 0.03, cz + d, this.hex('#3c3a38')); }
	_bar(x0, x1, y, z) {
		const B = this.colors, steel = this.hex('#c8ccd2'), plate = this.hex('#18181c');
		B.box(x0, y - 0.018, z - 0.018, x1, y + 0.018, z + 0.018, steel);
		for (const x of [x0 + 0.12, x1 - 0.16]) B.box(x, y - 0.22, z - 0.22, x + 0.05, y + 0.22, z + 0.22, plate);
	}
	m_gymRack(op, cx, cz) {
		const S = this.S, x = S.P(cx), B = this.colors, post = this.hex('#3a3d44');
		this._mat3(x, cz, 1.2, 0.9);
		for (const s of [-1, 1]) { B.box(x + s * 0.66 - 0.06, 0, cz - 0.16, x + s * 0.66 + 0.06, 2.0, cz + 0.16, post); B.box(x + s * 0.66 - 0.06, 1.3, cz - 0.05, x + s * 0.66 + 0.06, 1.36, cz + 0.12, this.hex('#c8ccd2')); }
		B.box(x - 0.72, 1.95, cz - 0.16, x + 0.72, 2.0, cz + 0.16, post);
		this._bar(x - 0.95, x + 0.95, 1.38, cz + 0.08);
	}
	m_gymBench(op, cx, cz) {
		const S = this.S, x = S.P(cx), B = this.colors, post = this.hex('#3a3d44'), pad = this.hex('#1a1a20');
		this._mat3(x, cz, 0.8, 1.05);
		B.box(x - 0.15, 0.32, cz - 0.8, x + 0.15, 0.45, cz + 0.45, pad);
		for (const z of [cz - 0.7, cz + 0.3]) B.box(x - 0.04, 0, z, x + 0.04, 0.32, z + 0.08, post);
		for (const s of [-1, 1]) { B.box(x + s * 0.46 - 0.04, 0, cz + 0.52, x + s * 0.46 + 0.04, 1.05, cz + 0.6, post); B.box(x + s * 0.46 - 0.05, 0, cz + 0.4, x + s * 0.46 + 0.05, 0.04, cz + 0.75, post); }
		this._bar(x - 0.8, x + 0.8, 1.05, cz + 0.56);
	}
	m_gymSpot(op, cx, cz) { this._mat3(this.S.P(cx), cz, 0.7, 0.6); }
	m_treadmill(op, r) {
		const [x0, z0, x1, z1] = r, B = this.colors, body = this.hex('#2a2c32');
		B.box(x0, 0, z0, x1, 0.2, z1, body);
		this.belt = this.belt || [];
		const belt = this.hex('#101114'); B.box(x0 + 0.08, 0.2, z0 + 0.05, x1 - 0.08, 0.215, z1 - 0.1, belt);
		for (const x of [x0 + 0.03, x1 - 0.08]) B.box(x, 0.2, z1 - 0.2, x + 0.05, 1.3, z1 - 0.12, this.hex('#4a4e56'));
		B.box(x0, 1.15, z1 - 0.3, x1, 1.32, z1 - 0.1, this.hex('#3a3d44'));
		this.glow.box(x0 + 0.2, 1.25, z1 - 0.31, x1 - 0.2, 1.31, z1 - 0.3, this.hex('#3adf6a'));
	}
	m_mannequin(op, x, z, col) {
		const B = this.colors, c = this.hex(col), skin = this.hex('#e8e4dc');
		B.box(x - 0.22, 0, z - 0.22, x + 0.22, 0.03, z + 0.22, this.hex('#2a2c30'));
		B.cyl(x, z, 0.025, 0.03, 0.9, this.hex('#8a8e96'), 6);
		B.box(x - 0.13, 0.85, z - 0.09, x + 0.13, 1.0, z + 0.09, this.hex('#2a2c38'));
		B.box(x - 0.2, 1.0, z - 0.11, x + 0.2, 1.48, z + 0.11, c);
		for (const s of [-1, 1]) B.box(x + s * 0.2, 1.08, z - 0.05, x + s * 0.26, 1.46, z + 0.05, c);
		B.cyl(x, z, 0.045, 1.48, 1.56, skin, 8);
		B.ball(x, 1.66, z, 0.1, 0.12, 0.1, skin, 8);
	}
	m_lantern(op, x, z) {
		const B = this.colors, y = 2.15;
		B.box(x - 0.008, y + 0.3, z - 0.008, x + 0.008, this.H, z + 0.008, this.hex('#1a1410'));
		B.cyl(x, z, 0.16, y + 0.27, y + 0.32, this.hex('#2a1c10'), 10);
		this.glow.ball(x, y, z, 0.24, 0.3, 0.24, this.hex('#e0602a'), 10);
		B.cyl(x, z, 0.16, y - 0.32, y - 0.27, this.hex('#2a1c10'), 10);
	}

	// ---------------------------------------------------------------- VIDA da sala
	// Luminárias onde a sala tem luz (calha fluorescente no mercado, farmácia e academia; pendente nos outros), janelas acesas com o feixe
	// de luz, ventilador de teto girando (bar, comida, boca, casas), vapor da cozinha/forno/sushi, poeira flutuando na luz, a TV e o neon
	// piscando na parede do fundo.
	_life(ops) {
		const S = this.S, fam = ShopCtx.fam(S.style), H = this.H, top = S.nY - S.faceH - InteriorHD.EXT;
		const wx = (px) => px / S.PPU + S.IN.x0, wy = (py) => Math.max(0, Math.min(H, ((S.nY - py) / (S.nY - top)) * H)), zN = S.D - S.T - 0.03;
		const lampAt = ops.filter((o) => o.k === 'lamp' || o.k === 'lantern').map((o) => [o.a[0], o.a[1]]);
		const L = new I3Batch(), F = new I3Batch(), tube = /^(store|gym|guns)$/.test(fam);
		for (const l of S.lights || []) {
			if (l.col[1] < 170 || l.a < 0.2) continue;                                                  // (fogo do forno, neon: não são lâmpadas)
			const x = wx(l.x), z = S.IN.z1 - l.y / S.PPU;
			if (x < S.T + 0.3 || x > S.W - S.T - 0.3 || z < S.T + 0.3 || z > S.D - S.T - 0.3) continue;
			if (lampAt.some(([a, b]) => Math.hypot(a - x, b - z) < 1.2)) continue;
			const col = this.hex(l.col.map((v) => Math.min(255, v * 1.05)));
			if (tube) {
				F.box(x - 0.8, H - 0.12, z - 0.09, x + 0.8, H - 0.06, z + 0.09, this.hex('#d8dce0'));
				L.box(x - 0.75, H - 0.15, z - 0.05, x + 0.75, H - 0.12, z + 0.05, col);
				for (const s of [-0.6, 0.6]) F.box(x + s - 0.005, H - 0.06, z - 0.005, x + s + 0.005, H, z + 0.005, this.hex('#2a2a2a'));
			} else {
				F.box(x - 0.008, H - 0.75, z - 0.008, x + 0.008, H, z + 0.008, this.hex('#1a1410'));
				F.cyl(x, z, 0.24, H - 0.86, H - 0.72, this.hex(fam === 'fine' || fam === 'home_lux' ? '#c8a040' : '#2f3a34'), 12, 0.08);
				L.ball(x, H - 0.88, z, 0.07, 0.06, 0.07, col, 8);
			}
		}
		// janelas da parede do fundo: vidro aceso e o feixe de luz até o piso
		const shafts = new I3Batch();
		for (const o of ops) {
			if (o.k !== 'window') continue;
			const [px, py, w, h] = o.a, x0 = wx(px), x1 = wx(px + w), y1 = wy(py), y0 = wy(py + h);
			L.quad([x0, y0, zN], [x1, y0, zN], [x1, y1, zN], [x0, y1, zN], [0, 0, -1], null, this.hex('#cfe8f6'));
			const dz = Math.min(4, (S.D - 2 * S.T) * 0.45), a = [0.95, 0.9, 0.75, 0.16], b = [0.95, 0.9, 0.75, 0];
			shafts.quad([x0, y0, zN - 0.01], [x1, y0, zN - 0.01], [x1 + 0.4, 0.02, zN - dz], [x0 + 0.4, 0.02, zN - dz], [0, 1, 0], null, a);
			shafts.c.splice(shafts.c.length - 8, 8, ...b, ...b);                                       // (a ponta de baixo some)
		}
		this._add(F.mesh('sala3d_luminarias', this.scene, this._mat('sala3d_lumMat', null, { emissive: 0.3 }), this.root));
		const lm = this._mat('sala3d_lampadas', null, { emissive: 1 }); lm.disableLighting = true;
		this._add(L.mesh('sala3d_lampadas', this.scene, lm, this.root));
		if (!shafts.empty) {
			const sm = this._mat('sala3d_feixeMat', null, { emissive: 1 }); sm.disableLighting = true; sm.alphaMode = BABYLON.Engine.ALPHA_ADD; sm.disableDepthWrite = true;
			const m = this._add(shafts.mesh('sala3d_feixe', this.scene, sm, this.root)); m.hasVertexAlpha = true; m.renderingGroupId = 0;
		}
		// ventilador de teto
		this.fans = [];
		if (/^(food|bar|boca|home)$/.test(fam)) {
			const n = S.W > 18 ? 2 : 1;
			for (let k = 0; k < n; k++) {
				const x = S.W * (n === 1 ? 0.5 : k ? 0.68 : 0.32), z = S.D * 0.5, B = new I3Batch(), wood = this.hex(fam === 'boca' ? '#5a5a5a' : '#6a4a2a');
				for (let b = 0; b < 4; b++) { const a = (b * Math.PI) / 2, c = Math.cos(a), s2 = Math.sin(a); B.quad([c * 0.12 - s2 * 0.07, 0, s2 * 0.12 + c * 0.07], [c * 0.7 - s2 * 0.09, 0, s2 * 0.7 + c * 0.09], [c * 0.7 + s2 * 0.09, 0, s2 * 0.7 - c * 0.09], [c * 0.12 + s2 * 0.07, 0, s2 * 0.12 - c * 0.07], [0, 1, 0], null, wood); }
				B.cyl(0, 0, 0.12, -0.08, 0.04, this.hex('#3a3d44'), 10);
				const fan = this._add(B.mesh('sala3d_ventilador', this.scene, this._mat('sala3d_ventMat', null, { emissive: 0.3 }), this.root));
				fan.unfreezeWorldMatrix(); fan.position.set(x, H - 0.45, z);
				const rod = new I3Batch(); rod.box(x - 0.015, H - 0.45, z - 0.015, x + 0.015, H, z + 0.015, this.hex('#3a3d44'));
				this._add(rod.mesh('sala3d_hasteVent', this.scene, this._mat('sala3d_hasteMat', null, { emissive: 0.3 }), this.root));
				this.fans.push(fan);
			}
		}
		// TV e neon da parede do fundo: placas acesas que piscam
		this.blink = [];
		for (const o of ops) {
			if (o.k !== '_wallItem' || (o.a[0] !== 'tv' && o.a[0] !== 'neon')) continue;
			const [kind, px, py, Hh] = o.a, B = new I3Batch(), x0 = wx(px + 1), x1 = wx(px + (kind === 'tv' ? 25 : 24)), y0 = wy(py + Hh - 2), y1 = wy(py + 2);
			const col = kind === 'tv' ? this.hex('#6aa0e8') : px % 2 ? this.hex('#ff3cb4') : this.hex('#3cc8ff');
			B.quad([x0, y0, zN - 0.02], [x1, y0, zN - 0.02], [x1, y1, zN - 0.02], [x0, y1, zN - 0.02], [0, 0, -1], null, col);
			const m = this._mat('sala3d_brilho', null, { emissive: 1 }); m.disableLighting = true; m.alphaMode = BABYLON.Engine.ALPHA_ADD; m.alpha = 0.5; m.disableDepthWrite = true;
			const mesh = this._add(B.mesh('sala3d_brilho', this.scene, m, this.root));
			this.blink.push({ m, kind, t: this.rng() * 10 });
		}
		// vapor (cozinha, forno, balcão de sushi, chapa) e poeira na luz
		this.fx = [];
		const tex = Interior3D.puff(this.scene);
		for (const o of ops) {
			if (!/^(kitchen|oven|sushiBar|grilleCounter)$/.test(o.k)) continue;
			const r = o.a[0];
			if (!Array.isArray(r)) continue;
			const ps = new BABYLON.ParticleSystem('sala3d_vapor', 40, this.scene);
			ps.particleTexture = tex;
			ps.emitter = new BABYLON.Vector3(this.o.x + (r[0] + r[2]) / 2, o.k === 'oven' ? 2.1 : 1.1, this.o.z + (r[1] + r[3]) / 2);
			ps.minEmitBox = new BABYLON.Vector3(-(r[2] - r[0]) * 0.35, 0, -0.2); ps.maxEmitBox = new BABYLON.Vector3((r[2] - r[0]) * 0.35, 0, 0.2);
			ps.color1 = new BABYLON.Color4(1, 1, 1, 0.22); ps.color2 = new BABYLON.Color4(0.9, 0.9, 0.9, 0.14); ps.colorDead = new BABYLON.Color4(1, 1, 1, 0);
			ps.minSize = 0.25; ps.maxSize = 0.6; ps.minLifeTime = 1.6; ps.maxLifeTime = 2.8; ps.emitRate = 9;
			ps.direction1 = new BABYLON.Vector3(-0.08, 0.5, -0.05); ps.direction2 = new BABYLON.Vector3(0.08, 0.8, 0.05); ps.minEmitPower = 0.35; ps.maxEmitPower = 0.6;
			ps.gravity = new BABYLON.Vector3(0, 0.05, 0); ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
			this.fx.push(ps);
		}
		const dust = new BABYLON.ParticleSystem('sala3d_poeira', 60, this.scene);
		dust.particleTexture = tex;
		dust.emitter = new BABYLON.Vector3(this.o.x + S.W / 2, 0.3, this.o.z + S.D / 2);
		dust.minEmitBox = new BABYLON.Vector3(-S.W / 2 + 1, 0, -S.D / 2 + 1); dust.maxEmitBox = new BABYLON.Vector3(S.W / 2 - 1, 2.2, S.D / 2 - 1);
		dust.color1 = new BABYLON.Color4(1, 0.95, 0.8, 0.5); dust.color2 = new BABYLON.Color4(1, 1, 0.9, 0.3); dust.colorDead = new BABYLON.Color4(1, 1, 1, 0);
		dust.minSize = 0.015; dust.maxSize = 0.035; dust.minLifeTime = 5; dust.maxLifeTime = 9; dust.emitRate = 7;
		dust.direction1 = new BABYLON.Vector3(-0.05, 0.02, -0.05); dust.direction2 = new BABYLON.Vector3(0.05, 0.08, 0.05); dust.minEmitPower = 0.1; dust.maxEmitPower = 0.25;
		dust.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD; dust.preWarmCycles = 60;
		this.fx.push(dust);
	}

	// ---------------------------------------------------------------- luz
	// As luzes da sala (px da arte → m): as 4 mais fortes viram luzes pontuais que só iluminam as malhas da sala.
	_lights() {
		const S = this.S, L = (S.lights || []).slice().sort((a, b) => b.a * b.r - a.a * a.r).slice(0, 4);
		for (const l of L) {
			const x = l.x / S.PPU + S.IN.x0, z = S.IN.z1 - l.y / S.PPU, r = l.r / S.PPU;
			const p = new BABYLON.PointLight('sala3d_luz', new BABYLON.Vector3(this.o.x + x, 2.5, this.o.z + z), this.scene);
			p.diffuse = new BABYLON.Color3(l.col[0] / 255, l.col[1] / 255, l.col[2] / 255);
			p.specular = BABYLON.Color3.Black();
			p.intensity = Math.min(1.4, 0.5 + l.a * 1.4);
			p.range = Math.max(4, r * 1.8);
			p.includedOnlyMeshes = this.meshes.slice();
			p.setEnabled(false);
			this.lights.push(p);
		}
	}

	// ---------------------------------------------------------------- liga/desliga e a cada quadro
	setEnabled(on) {
		this.root.setEnabled(on);
		for (const l of this.lights) l.setEnabled(on);
		for (const p of this.fx || []) { if (on) p.start(); else p.stop(); }
	}
	// Paredes entre a câmera e o jogador: quase transparentes (a câmera de 3ª pessoa anda em volta dele).
	update(cam, dt = 1 / 30) {
		for (const f of this.fans || []) f.rotation.y += dt * 4.2;                  // (o ventilador de teto girando)
		for (const b of this.blink || []) {                                          // (a TV muda de cena; o neon pulsa e às vezes falha)
			b.t += dt;
			b.m.alpha = b.kind === 'tv' ? 0.32 + 0.2 * Math.abs(Math.sin(b.t * 1.7) * Math.sin(b.t * 0.43)) + (Math.sin(b.t * 23) > 0.96 ? 0.15 : 0)
				: (Math.sin(b.t * 0.9) > 0.985 ? 0.08 : 0.5 + 0.1 * Math.sin(b.t * 3.1));
		}
		if (this.streetMat && typeof SpriteMaterial !== 'undefined') {             // (a rua lá fora: clara de dia, escura de noite)
			const t = SpriteMaterial.sharedTint(), k = Math.max(0.12, Math.min(1, 0.3 * t.r + 0.59 * t.g + 0.11 * t.b));
			this.streetMat.emissiveColor.set(k, k, k * 1.05);
		}
		if (!cam) return;
		const p = cam.globalPosition || cam.position, S = this.S, lx = p.x - this.o.x, lz = p.z - this.o.z, T = S.T;
		const out = { s: lz < T + 0.2, n: lz > S.D - T - 0.2, w: lx < T + 0.2, e: lx > S.W - T - 0.2 };
		for (const k of ['n', 's', 'e', 'w']) {
			const m = this.walls[k];
			if (!m) continue;
			const goal = out[k] ? 0.12 : 1;
			if (Math.abs(m.visibility - goal) > 0.01) m.visibility += (goal - m.visibility) * 0.25;
		}
	}
	dispose() {
		for (const p of this.fx || []) p.dispose(false);
		for (const l of this.lights) l.dispose();
		for (const m of this.meshes) m.dispose();
		for (const m of this.mats) m.dispose();
		for (const t of this.textures) t.dispose();
		this.root.dispose();
		this.cvBase.width = this.cvBase.height = 0;
		this.meshes = []; this.lights = [];
	}
}
