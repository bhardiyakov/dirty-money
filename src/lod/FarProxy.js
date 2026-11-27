// ============================================================================
// FarProxy — O MAPA INTEIRO VISTO DE LONGE (a camada LONGA do voo, lod/AirLod.js): o relevo do mundo numa grade grossa (16 m, cor do
// bioma, o asfalto da cidade), as quadras (calçada, parque, mata, praia) e cada prédio como uma CAIXA (a cor da tinta dele nas
// paredes, a do telhado em cima, a luz do sol já assada por face). Pedaços de 512 m — a mesma grade das malhas da cidade
// (Config.world.meshChunk): o frustum descarta os de fora e os pedaços inteiramente perto (onde o detalhe está à mostra) ficam
// desligados. Um material só (StandardMaterial com cor por vértice: a luz do sol e do céu e a névoa da cena, como o resto do mundo).
//   • Fica ESCONDIDO DENTRO do detalhe: o chão 2,6 m abaixo do chão de verdade, a caixa do prédio 0,6 m para dentro das paredes e
//     0,5 m abaixo do telhado — onde o detalhe ainda está à mostra ele cobre a caixa (sem z-fighting), onde o detalhe saiu (longe),
//     a caixa aparece. A troca não precisa de máscara nem de sincronia quadro a quadro com o recorte do detalhe.
//   • Montado em FATIAS (gerador com orçamento de ms por quadro) só na primeira vez que a câmera sobe: a carga do jogo não paga.
// Ciclo de vida: start(scene) · pump(ms) até `ready` · show(eye, R) por avaliação · hideAll() · dispose().
// ============================================================================

class FarProxy {
	static STEP = 16;                 // m: lado da célula do relevo grosso
	static SINK = 2.6;                // m: o chão de longe fica abaixo do de verdade (o de verdade cobre onde existe)
	static INSET = 0.6;               // m: a caixa do prédio entra para dentro das paredes
	static BIOME = null;              // cor por bioma (WorldMap.B), preenchida em _colors()

	constructor(scene) {
		this.scene = scene;
		this.ready = false;
		this.chunks = [];                                  // { mesh, x0, z0, x1, z1, on }
		this.stats = { chunks: 0, tris: 0, ms: 0, buildings: 0 };
		this._job = null;
		this.mat = null;
	}

	// Começa a montar (não monta nada ainda: pump(ms) faz o trabalho em fatias).
	start() {
		if (this._job || this.ready) return;
		this._colors();
		const mat = this.mat = new BABYLON.StandardMaterial('farProxy', this.scene);
		mat.diffuseColor = BABYLON.Color3.White();
		mat.specularColor = BABYLON.Color3.Black();
		mat.emissiveColor = new BABYLON.Color3(0.06, 0.06, 0.07);
		mat.backFaceCulling = false;                       // (caixas fechadas e chão de um lado só: a profundidade resolve, e as normais são as de fora)
		this._job = this._build();
	}

	// Trabalha até `ms` neste quadro. true quando terminou.
	pump(ms) {
		if (this.ready) return true;
		if (!this._job) return false;
		const t0 = performance.now();
		for (;;) {
			const r = this._job.next();
			if (r.done) { this._job = null; this.ready = true; this.stats.ms += performance.now() - t0; console.log(`[LONGE] mapa de longe: ${this.stats.chunks} pedaços, ${this.stats.buildings} prédios, ${Math.round(this.stats.tris / 1000)} mil triângulos em ${this.stats.ms.toFixed(0)} ms`); return true; }
			if (performance.now() - t0 >= ms) { this.stats.ms += performance.now() - t0; return false; }
		}
	}

	// Liga os pedaços que têm alguma parte além de `R` do olho (lá o detalhe saiu); os que ficam inteiros dentro, desliga. Histerese de 8%.
	show(eye, R) {
		for (const c of this.chunks) {
			const fx = Math.max(Math.abs(eye.x - c.x0), Math.abs(eye.x - c.x1)), fz = Math.max(Math.abs(eye.z - c.z0), Math.abs(eye.z - c.z1));
			const far = Math.sqrt(fx * fx + fz * fz + eye.y * eye.y);                    // (o canto mais longe do pedaço)
			const want = c.on ? far > R * 0.92 : far > R;
			if (want !== c.on) { c.on = want; c.mesh.setEnabled(want); }
		}
	}
	hideAll() { for (const c of this.chunks) if (c.on) { c.on = false; c.mesh.setEnabled(false); } }
	get shown() { let n = 0; for (const c of this.chunks) if (c.on) n++; return n; }

	dispose() {
		for (const c of this.chunks) c.mesh.dispose();
		this.chunks.length = 0;
		if (this.mat) { this.mat.dispose(); this.mat = null; }
		this.ready = false; this._job = null;
	}

	// ---------------------------------------------------------------- montagem
	_colors() {
		if (FarProxy.BIOME) return;
		const B = WorldMap.B, T = FarProxy.BIOME = [];
		T[B.SEA] = [0.2, 0.32, 0.4]; T[B.SAND] = [0.84, 0.78, 0.6]; T[B.GRASS] = [0.4, 0.56, 0.26]; T[B.FOREST] = [0.19, 0.34, 0.16];
		T[B.FARM] = [0.6, 0.58, 0.32]; T[B.SWAMP] = [0.32, 0.41, 0.29]; T[B.ROCK] = [0.5, 0.48, 0.45]; T[B.FAVELA] = [0.55, 0.42, 0.31];
		T[B.SCRUB] = [0.5, 0.51, 0.3]; T[B.CITY] = [0.31, 0.32, 0.34]; T[B.RESORT] = [0.44, 0.58, 0.3];
	}
	static roofColor(kind) {
		switch (kind) {
			case 'tile': return [0.66, 0.36, 0.24];
			case 'shingle': return [0.42, 0.3, 0.25];
			case 'zinc': case 'metal': return [0.6, 0.62, 0.64];
			case 'tarp': return [0.25, 0.42, 0.62];
			case 'tar': return [0.24, 0.24, 0.25];
			case 'garden': return [0.36, 0.5, 0.27];
			default: return [0.66, 0.64, 0.6];                                       // laje, concreto, slab
		}
	}
	static groundColor(blk) {
		if (blk.district === 'favela') return [0.55, 0.43, 0.32];
		if (!blk.open) return [0.6, 0.59, 0.56];                                     // calçada e pátio
		const g = String(blk.ground || '');
		if (/praia|areia|sand/.test(g)) return [0.86, 0.79, 0.6];
		if (/mata|forest|bosque/.test(g)) return [0.2, 0.36, 0.17];
		if (/terra|earth|dirt/.test(g)) return [0.55, 0.43, 0.31];
		return [0.38, 0.55, 0.25];                                                   // parque, gramado
	}

	// O trabalho em fatias: um pedaço de 512 m por passo (o relevo, as quadras e os prédios dele).
	*_build() {
		const W = Config.world, C = W.meshChunk || 512, off = W.meshChunkOffset || 0;
		const i0 = Math.floor((W.minX + off) / C), i1 = Math.floor((W.maxX + off) / C), j0 = Math.floor((W.minZ + off) / C), j1 = Math.floor((W.maxZ + off) / C);
		// quadras e lotes por pedaço (uma passada só)
		const blocks = new Map(), key = (i, j) => i * 1000 + j;
		for (const blk of CityGrid.blocks.concat(CityGrid.extraBlocks || [])) {
			const s = blk.slab, cx = (s[0] + s[2]) / 2, cz = (s[1] + s[3]) / 2, k = key(Math.floor((cx + off) / C), Math.floor((cz + off) / C));
			let a = blocks.get(k); if (!a) blocks.set(k, a = []); a.push(blk);
		}
		yield;
		for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
			const x0 = Math.max(W.minX, i * C - off), x1 = Math.min(W.maxX, (i + 1) * C - off), z0 = Math.max(W.minZ, j * C - off), z1 = Math.min(W.maxZ, (j + 1) * C - off);
			if (x1 - x0 < 1 || z1 - z0 < 1) continue;
			const g = { P: [], N: [], C: [], I: [] };
			this._terrain(g, x0, z0, x1, z1);
			yield;
			let n = 0;
			for (const blk of blocks.get(key(i, j)) || []) { this._block(g, blk); if (++n % 24 === 0) yield; }
			if (!g.I.length) { yield; continue; }
			const mesh = new BABYLON.Mesh(`farProxy_${i}_${j}`, this.scene), vd = new BABYLON.VertexData();
			vd.positions = g.P; vd.normals = g.N; vd.colors = g.C; vd.indices = g.P.length / 3 > 65535 ? new Uint32Array(g.I) : g.I;
			vd.applyToMesh(mesh, false);
			mesh.material = this.mat;
			mesh.isPickable = false;
			mesh.receiveShadows = false;
			mesh.freezeWorldMatrix();
			mesh.doNotSyncBoundingInfo = true;
			mesh.setEnabled(false);
			this.chunks.push({ mesh, x0, z0, x1, z1, on: false });
			this.stats.chunks++; this.stats.tris += g.I.length / 3;
			yield;
		}
	}

	// O chão grosso: uma grade de STEP m com a altura do relevo (menos SINK), a cor do bioma e a normal do relevo (a luz do sol na encosta).
	_terrain(g, x0, z0, x1, z1) {
		const S = FarProxy.STEP, M = WorldMap, W = Config.world, B = M.B, T = FarProxy.BIOME, sink = FarProxy.SINK;
		const nx = Math.ceil((x1 - x0) / S), nz = Math.ceil((z1 - z0) / S), base = g.P.length / 3;
		const bio = (x, z) => {
			const ci = Math.max(0, Math.min(M.nx - 1, Math.floor((x - W.minX) / W.cell))), cj = Math.max(0, Math.min(M.nz - 1, Math.floor((z - W.minZ) / W.cell)));
			return M.biome[cj * M.nx + ci];
		};
		const R = (x, z) => (typeof Relief !== 'undefined' ? Relief.at(x, z) : 0);
		for (let b = 0; b <= nz; b++) for (let a = 0; a <= nx; a++) {
			const x = Math.min(x1, x0 + a * S), z = Math.min(z1, z0 + b * S), h = R(x, z);
			const hx = R(x + 4, z) - R(x - 4, z), hz = R(x, z + 4) - R(x, z - 4), nl = Math.hypot(hx, 8, hz);
			const c = T[bio(x, z)] || T[B.GRASS];
			g.P.push(x, h - sink, z); g.N.push(-hx / nl, 8 / nl, -hz / nl); g.C.push(c[0], c[1], c[2], 1);
		}
		const row = nx + 1;
		for (let b = 0; b < nz; b++) for (let a = 0; a < nx; a++) {
			const xm = x0 + (a + 0.5) * S, zm = z0 + (b + 0.5) * S;
			if (bio(xm, zm) === B.SEA && bio(xm - S * 0.4, zm - S * 0.4) === B.SEA && bio(xm + S * 0.4, zm + S * 0.4) === B.SEA) continue;     // (mar: o plano d'água desenha)
			const v = base + b * row + a;
			g.I.push(v, v + row, v + 1, v + 1, v + row, v + row + 1);
		}
	}

	// Uma quadra: o chão dela (calçada, parque, praia) um pouco acima do chão grosso e cada prédio como caixa.
	_block(g, blk) {
		const s = blk.slab, R = (x, z) => (typeof Relief !== 'undefined' ? Relief.at(x, z) : 0), sink = FarProxy.SINK - 0.35, gc = FarProxy.groundColor(blk);
		this._quad(g, [[s[0], R(s[0], s[1]) - sink, s[1]], [s[2], R(s[2], s[1]) - sink, s[1]], [s[2], R(s[2], s[3]) - sink, s[3]], [s[0], R(s[0], s[3]) - sink, s[3]]], [0, 1, 0], gc);
		if (blk.open) return;
		for (const lot of blk.lots || []) {
			if (lot.safehouse || !lot.height) continue;
			const A = WorldBuilder.lotAnchor(lot), I = FarProxy.INSET, X0 = lot.x0 + I, X1 = lot.x1 - I, Z0 = lot.z0 + I, Z1 = lot.z1 - I;
			if (X1 - X0 < 0.5 || Z1 - Z0 < 0.5) continue;
			const top = (A ? A.h : R((X0 + X1) / 2, (Z0 + Z1) / 2)) + lot.height - 0.5, bot = Math.min(R(X0, Z0), R(X1, Z1), R(X0, Z1), R(X1, Z0)) - FarProxy.SINK;
			const wc = typeof Walls3D !== 'undefined' && Walls3D.on ? Walls3D.colorOf(lot) : [0.78, 0.76, 0.72], rc = FarProxy.roofColor(lot.roof);
			const sh = (k) => [wc[0] * k, wc[1] * k, wc[2] * k];
			this._quad(g, [[X0, top, Z0], [X1, top, Z0], [X1, top, Z1], [X0, top, Z1]], [0, 1, 0], rc);            // telhado
			this._quad(g, [[X0, bot, Z0], [X1, bot, Z0], [X1, top, Z0], [X0, top, Z0]], [0, 0, -1], sh(0.86));       // sul
			this._quad(g, [[X1, bot, Z1], [X0, bot, Z1], [X0, top, Z1], [X1, top, Z1]], [0, 0, 1], sh(0.96));        // norte
			this._quad(g, [[X0, bot, Z1], [X0, bot, Z0], [X0, top, Z0], [X0, top, Z1]], [-1, 0, 0], sh(0.9));        // oeste
			this._quad(g, [[X1, bot, Z0], [X1, bot, Z1], [X1, top, Z1], [X1, top, Z0]], [1, 0, 0], sh(0.8));         // leste
			this.stats.buildings++;
		}
	}

	// Quadro com 4 cantos (sentido anti-horário visto de fora), a normal e a cor.
	_quad(g, Q, n, c) {
		const b = g.P.length / 3;
		for (const q of Q) { g.P.push(q[0], q[1], q[2]); g.N.push(n[0], n[1], n[2]); g.C.push(c[0], c[1], c[2], 1); }
		g.I.push(b, b + 2, b + 1, b, b + 3, b + 2);
	}
}
