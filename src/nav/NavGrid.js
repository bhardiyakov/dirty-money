// ============================================================================
// NavGrid — the walkable raster of the whole world (1 u cells) and the queries on it: walk, line of sight, closest walkable point
// and the A* path. Pure data and math (no Babylon, no game objects), so the same file runs on the main thread (Navigation builds
// the raster and answers the game's queries) and in the crowd worker (nav/crowdWorker.js: paths and steering off the main thread).
//
// Cell values: 0 = blocked, 1 = walkable, 2 = walkable against a wall (costs more in the A*). See core/navigation.js for how the
// raster is built.
// ============================================================================

class NavGrid {
	constructor(w, h, minX, minZ, grid) {
		this.w = w; this.h = h;
		this.minX = minX; this.minZ = minZ;
		this.grid = grid;
		this._cap = 0;                         // A* buffers, reused (see _ensure)
		this.stats = { paths: 0, ms: 0, fails: 0, maxMs: 0 };
	}

	// Fills the rectangle (world units) with `val`, in the cells whose CENTRE is inside it. Returns the cell range, or null.
	fill(x0, z0, x1, z1, val) {
		const w = this.w, h = this.h;
		const i0 = Math.max(0, Math.ceil(x0 - this.minX - 0.5)), i1 = Math.min(w - 1, Math.floor(x1 - this.minX - 0.5));
		const j0 = Math.max(0, Math.ceil(z0 - this.minZ - 0.5)), j1 = Math.min(h - 1, Math.floor(z1 - this.minZ - 0.5));
		if (i0 > i1 || j0 > j1) return null;
		for (let j = j0; j <= j1; j++) { const row = j * w; for (let i = i0; i <= i1; i++) this.grid[row + i] = val; }
		return { i0, j0, i1, j1 };
	}

	// Fills the cell range (from `fill`) with `val`.
	fillCells(i0, j0, i1, j1, val) {
		for (let j = j0; j <= j1; j++) { const row = j * this.w; for (let i = i0; i <= i1; i++) this.grid[row + i] = val; }
	}

	walk(x, z) {
		const i = Math.floor(x - this.minX), j = Math.floor(z - this.minZ);
		return i >= 0 && j >= 0 && i < this.w && j < this.h && this.grid[j * this.w + i] !== 0;
	}

	// Straight line clear between two points (sampled every ~0.4 u, with 0.25 u of side clearance).
	los(ax, az, bx, bz) {
		const dx = bx - ax, dz = bz - az, d = Math.sqrt(dx * dx + dz * dz);
		if (d < 0.01) return true;
		const n = Math.ceil(d / 0.4), ux = dx / d, uz = dz / d, px = -uz * 0.25, pz = ux * 0.25;
		for (let k = 1; k <= n; k++) {
			const t = Math.min(d, k * 0.4), x = ax + ux * t, z = az + uz * t;
			if (!this.walk(x, z) || !this.walk(x + px, z + pz) || !this.walk(x - px, z - pz)) return false;
		}
		return true;
	}

	// Closest walkable point to (x, z) (square spiral up to `max` u), as { x, z }; (x, z) itself when there is none.
	closestPoint(x, z, max = 40) {
		if (this.walk(x, z)) return { x, z };
		const cx = Math.floor(x - this.minX), cz = Math.floor(z - this.minZ);
		for (let r = 1; r <= max; r++) {
			let best = null, bd = Infinity;
			for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
				if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
				const i = cx + dx, j = cz + dz;
				if (i < 0 || j < 0 || i >= this.w || j >= this.h || !this.grid[j * this.w + i]) continue;
				const d = (i + 0.5 - (x - this.minX)) ** 2 + (j + 0.5 - (z - this.minZ)) ** 2;
				if (d < bd) { bd = d; best = [i, j]; }
			}
			if (best) return { x: this.minX + best[0] + 0.5, z: this.minZ + best[1] + 0.5 };
		}
		return { x, z };
	}

	_ensure(n) {
		if (n <= this._cap) return;
		this._cap = n;
		this._g = new Float32Array(n); this._par = new Int32Array(n); this._stamp = new Uint32Array(n); this._closed = new Uint8Array(n);
		this._heap = new Int32Array(n * 4 + 16); this._f = new Float32Array(n * 4 + 16);      // (heap com entradas duplicadas: nó + custo f)
		this._gen = 0;
	}

	// Path from (sx, sz) to (gx, gz): list of points { x, z } (without the start), or null. A* in a window around the trip (8
	// neighbours, no corner cutting), smoothed by line of sight.
	findPath(sx, sz, gx, gz) {
		const w = this.w, grid = this.grid, minX = this.minX, minZ = this.minZ;
		let si = Math.floor(sx - minX), sj = Math.floor(sz - minZ), gi = Math.floor(gx - minX), gj = Math.floor(gz - minZ);
		const inB = (i, j) => i >= 0 && j >= 0 && i < w && j < this.h;
		if (!inB(si, sj) || !inB(gi, gj)) return null;
		// Início/fim fora do andável: encaixa no mais próximo (até 6 u).
		if (!grid[sj * w + si]) { const q = this.closestPoint(sx, sz, 6); si = Math.floor(q.x - minX); sj = Math.floor(q.z - minZ); if (!grid[sj * w + si]) return null; }
		if (!grid[gj * w + gi]) { const q = this.closestPoint(gx, gz, 6); gi = Math.floor(q.x - minX); gj = Math.floor(q.z - minZ); if (!grid[gj * w + gi]) return null; }
		if (si === gi && sj === gj) return [{ x: gx, z: gz }];

		const PAD = 28;
		const i0 = Math.max(0, Math.min(si, gi) - PAD), i1 = Math.min(w - 1, Math.max(si, gi) + PAD);
		const j0 = Math.max(0, Math.min(sj, gj) - PAD), j1 = Math.min(this.h - 1, Math.max(sj, gj) + PAD);
		const ww = i1 - i0 + 1, hh = j1 - j0 + 1;
		this._ensure(ww * hh);
		const G = this._g, PAR = this._par, ST = this._stamp, CL = this._closed, H = this._heap, F = this._f;
		const gen = ++this._gen;
		const idx = (i, j) => (j - j0) * ww + (i - i0);
		let hn = 0;
		// Heap binário de (nó, f): H[k] = nó, F[k] = custo f da ENTRADA (nós podem entrar mais de uma vez).
		const push = (n, f) => {
			let k = ++hn;
			if (k >= H.length) return;                                    // (estouro improvável: descarta)
			while (k > 1 && F[k >> 1] > f) { H[k] = H[k >> 1]; F[k] = F[k >> 1]; k >>= 1; }
			H[k] = n; F[k] = f;
		};
		const pop = () => {
			const top = H[1], ln = H[hn], lf = F[hn]; hn--;
			let k = 1;
			for (;;) {
				let c = k << 1;
				if (c > hn) break;
				if (c < hn && F[c + 1] < F[c]) c++;
				if (lf <= F[c]) break;
				H[k] = H[c]; F[k] = F[c]; k = c;
			}
			if (hn >= 1) { H[k] = ln; F[k] = lf; }
			return top;
		};
		const hfun = (i, j) => { const dx = Math.abs(i - gi), dz = Math.abs(j - gj); return (dx + dz) + (1.414 - 2) * Math.min(dx, dz); };

		const s = idx(si, sj), goal = idx(gi, gj);
		ST[s] = gen; G[s] = 0; PAR[s] = -1; CL[s] = 0; push(s, hfun(si, sj));
		let best = s, bestH = hfun(si, sj), found = false, exp = 0;
		const DX = [1, -1, 0, 0, 1, 1, -1, -1], DZ = [0, 0, 1, -1, 1, -1, 1, -1];
		while (hn > 0 && exp < 30000) {
			const n = pop();
			if (CL[n] && ST[n] === gen) continue;
			CL[n] = 1; exp++;
			if (n === goal) { found = true; break; }
			const ni = (n % ww) + i0, nj = ((n / ww) | 0) + j0;
			const hv = hfun(ni, nj);
			if (hv < bestH) { bestH = hv; best = n; }
			for (let d = 0; d < 8; d++) {
				const i = ni + DX[d], j = nj + DZ[d];
				if (i < i0 || i > i1 || j < j0 || j > j1) continue;
				const cell = grid[j * w + i];
				if (!cell) continue;
				if (d >= 4 && (!grid[nj * w + ni + DX[d]] || !grid[(nj + DZ[d]) * w + ni])) continue;     // sem cortar quina
				const m = idx(i, j);
				if (ST[m] === gen && CL[m]) continue;
				const ng = G[n] + (d < 4 ? 1 : 1.414) * (cell === 2 ? 1.8 : 1);
				if (ST[m] !== gen) { ST[m] = gen; CL[m] = 0; G[m] = ng; PAR[m] = n; push(m, ng + hfun(i, j)); }
				else if (ng < G[m]) { G[m] = ng; PAR[m] = n; push(m, ng + hfun(i, j)); }
			}
		}
		this.stats.paths++;
		const end = found ? goal : best;                      // sem caminho completo: vai até o ponto mais perto do alvo
		if (!found && end === s) return null;
		const pts = [];
		for (let n = end; n !== -1 && n !== s; n = PAR[n]) pts.push({ x: minX + (n % ww) + i0 + 0.5, z: minZ + ((n / ww) | 0) + j0 + 0.5 });
		pts.reverse();
		if (found) pts.push({ x: gx, z: gz });
		// Alisa: do ponto atual, salta até o último ponto com linha de visada livre.
		const out = [];
		let ax = sx, az = sz, k = 0;
		while (k < pts.length) {
			let far = k;
			for (let q = pts.length - 1; q > k; q--) { if (this.los(ax, az, pts[q].x, pts[q].z)) { far = q; break; } }
			out.push(pts[far]);
			ax = pts[far].x; az = pts[far].z; k = far + 1;
		}
		return out;
	}
}
