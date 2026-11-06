// ============================================================================
// Plantations — os EUCALIPTAIS de beira de estrada (como nas rodovias de verdade): talhões retangulares colados na rodovia (a uns
// metros do acostamento), com os eucaliptos em FILEIRAS cerradas (3 × 3,5 m) e altíssimos (25–36 m, Trees3D 'eucalyptus'). Só em campo
// aberto (grama, cerrado, lavoura), fora da cidade, dos bairros, do autódromo e de qualquer construção. O mato do terreno não nasce dentro
// (covers: TerrainBuilder._plant). Montado no WorldBuilder (antes do _flush); determinístico.
//   build(W) · covers(x, z, m) · list = [{ x, z, ux, uz, hl, hw }] (centro, eixo ao longo da estrada, meias medidas)
// ============================================================================

const Plantations = {
	list: [], count: 0, _grid: new Map(),

	build(W) {
		if (typeof Trees3D === 'undefined' || !Trees3D.on) return;
		const t0 = performance.now(), rng = Pixel.rng(271828), B = WorldMap.B, ok = [B.GRASS, B.SCRUB, B.FARM, B.FOREST];
		this.list = []; this.count = 0; this._grid = new Map();
		const P = {};
		const freeAt = (x, z) => {
			if (!WorldMap.inWorld(x, z) || !MapGeo.isLand(x, z)) return false;
			const k = WorldMap.index(x, z); if (k < 0 || (WorldMap.flags[k] & 1) || !ok.includes(WorldMap.biome[k])) return false;
			if (RoadPlan.onPavement(x, z, 4)) return false;
			if (CityGrid.inCity && CityGrid.inCity(x, z)) return false;
			if (typeof Bairros !== 'undefined' && (Bairros.zoneAt(x, z) || Bairros._isReserved(x, z, 6))) return false;
			if (typeof Speedway !== 'undefined' && Speedway.covers(x, z, 10)) return false;
			if (typeof Landmarks !== 'undefined' && Landmarks.covers && Landmarks.covers(x, z, 10)) return false;
			for (const o of CityGrid.obstaclesAround(x, z, 6)) if (x > o.x0 - 6 && x < o.x1 + 6 && z > o.z0 - 6 && z < o.z1 + 6) return false;
			return true;
		};
		for (const e of RoadPlan.edges) {
			if ((e.cls !== 'hwy' && e.cls !== 'dirt') || e.layer || e.len < 100) continue;
			for (let s = 20 + rng() * 30; s < e.len - 70; s += 160 + rng() * 200) {
				if (rng() < (e.cls === 'dirt' ? 0.75 : 0.3)) continue;
				const L = Math.min(e.len - s - 20, 60 + rng() * 90), D = 26 + rng() * 34, side = rng() < 0.5 ? 1 : -1, off = e.w / 2 + 9;
				if (L < 45) continue;
				RoadPlan.at(e, s + L / 2, P);
				const ux = P.tx, uz = P.tz, lx = P.tz * side, lz = -P.tx * side;          // (ao longo; para o lado de fora da estrada)
				const cx = P.x + lx * (off + D / 2), cz = P.z + lz * (off + D / 2);
				// o talhão quase todo livre (amostras a cada ~10 m; onde não dá — uma casa, um barranco —, a árvore não entra)
				let n = 0, okN = 0;
				for (let a = -L / 2; a <= L / 2; a += 10) for (let b = -D / 2; b <= D / 2; b += 8) { n++; if (freeAt(cx + ux * a + lx * b, cz + uz * a + lz * b)) okN++; }
				if (okN < n * 0.8 || this.list.some((q) => Math.hypot(q.x - cx, q.z - cz) < 110)) continue;
				const plot = { x: cx, z: cz, ux, uz, hl: L / 2, hw: D / 2 };
				this.list.push(plot); this._ins(plot);
				// as fileiras: paralelas à estrada (3 m entre as árvores, 3,5 m entre as linhas), com um carreador no meio
				for (let b = -D / 2 + 1.5; b <= D / 2 - 1.5; b += 3.5) {
					if (Math.abs(b) < 1.8) continue;
					for (let a = -L / 2 + 1.5; a <= L / 2 - 1.5; a += 3) {
						const x = cx + ux * a + lx * b + (rng() - 0.5) * 0.5, z = cz + uz * a + lz * b + (rng() - 0.5) * 0.5;
						if (!freeAt(x, z)) continue;
						Trees3D.add(W._batch('veg_hi', x, z), 'eucalyptus', x, 0, z, 0.85 + rng() * 0.35);
						this.count++;
					}
				}
			}
		}
		console.log(`[EUCALIPTAL] ${this.list.length} talhões, ${this.count} eucaliptos (${(performance.now() - t0).toFixed(0)} ms)`);
	},
	_k(i, j) { return i * 65536 + j; },
	_ins(p) { const r = Math.hypot(p.hl, p.hw); for (let i = Math.floor((p.x - r) / 64); i <= Math.floor((p.x + r) / 64); i++) for (let j = Math.floor((p.z - r) / 64); j <= Math.floor((p.z + r) / 64); j++) { const k = this._k(i, j); (this._grid.get(k) || this._grid.set(k, []).get(k)).push(p); } },
	covers(x, z, m = 0) {
		const L = this._grid.get(this._k(Math.floor(x / 64), Math.floor(z / 64)));
		if (!L) return false;
		for (const p of L) { const dx = x - p.x, dz = z - p.z, a = dx * p.ux + dz * p.uz, b = dx * p.uz - dz * p.ux; if (Math.abs(a) < p.hl + m && Math.abs(b) < p.hw + m) return true; }
		return false;
	},
};
