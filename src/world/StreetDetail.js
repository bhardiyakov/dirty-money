// ============================================================================
// StreetDetail — o DETALHE DAS RUAS (referência: a folha de trânsito). Montado uma vez, no WorldBuilder (antes do _flush), com a arte
// do RoadArt; determinístico (seed fixa):
//   • ASFALTO GASTO: rachaduras, buracos (dão tranco), remendos, manchas de óleo e tampas de bueiro — mais na periferia (residencial,
//     industrial, porto, rodovia) que no centro; bocas de lobo na beira da calçada;
//   • PINTURA DO CHÃO (gasta): linha de retenção e setas de faixa antes dos cruzamentos com semáforo; "PARE" nas pernas secundárias dos
//     entroncamentos do interior (com a placa); "ÔNIBUS" na faixa em frente ao ponto;
//   • PLACAS (quebram: StreetProps, tipo 's'): velocidade (rodovia 80, serra e avenida 60, rua 40), curva perigosa antes das curvas
//     fechadas da estrada, proibido estacionar nas avenidas, lombada antes do quebra-molas, PARE; placas de NOME DE RUA nas esquinas;
//   • QUEBRA-MOLAS (lombadas amarelas e pretas) nas ruas residenciais e nas ruas da favela: dão tranco (carroceria, câmera), freiam e,
//     rápido demais, estragam o carro; a IA reduz antes (bumpAhead). Buracos dão um tranco menor;
//   • PONTOS DE ÔNIBUS (abrigo, banco, anúncio, placa) nas avenidas e ruas: `busStops` = [{ x, z, fx, fz, edge, s, dir }] — para o sistema
//     de ônibus que virá;
//   • DEFENSAS METÁLICAS nas curvas fechadas e beiras de barranco das rodovias e da serra;
//   • POSTES DE CONCRETO COM FIAÇÃO (cruzeta, transformador e o "gato" embolado) nas ruas da periferia e nas estradas de terra; lixeiras.
// Quadro: update(dt, carros, game) — tranco do quebra-molas e dos buracos.
// ============================================================================

const StreetDetail = {
	bumps: [], potholes: [], busStops: [], signs: [], poles: [], stats: {},
	CELL: 16, _grid: new Map(),

	_gk(i, j) { return (i + 4096) * 8192 + (j + 4096); },
	_ins(o) { const k = this._gk(Math.floor(o.x / this.CELL), Math.floor(o.z / this.CELL)); let L = this._grid.get(k); if (!L) this._grid.set(k, L = []); L.push(o); },
	_near(x, z, r, fn) {
		const S = this.CELL;
		for (let i = Math.floor((x - r) / S); i <= Math.floor((x + r) / S); i++) for (let j = Math.floor((z - r) / S); j <= Math.floor((z + r) / S); j++) {
			const L = this._grid.get(this._gk(i, j)); if (L) for (const o of L) fn(o);
		}
	},

	// ================================================================== montagem
	build(W) {
		const t0 = performance.now();
		this.W = W; this.bumps = []; this.potholes = []; this.busStops = []; this.signs = []; this.poles = []; this._grid = new Map();
		const st = this.stats = { decals: 0, signs: 0, names: 0, bumps: 0, stops: 0, rails: 0, poles: 0, bins: 0 };
		RoadArt.decals(W.scene); RoadArt.signs(W.scene);
		const rng = this.rng = Pixel.rng(90901);
		// ocupação na calçada (postes de rua, semáforos, eletropostos e o que for sendo posto aqui)
		const occ = new Map(), ok = (x, z) => Math.floor(x / 4) * 65536 + Math.floor(z / 4);
		const put = (x, z, r = 1) => { const k = ok(x, z); (occ.get(k) || occ.set(k, []).get(k)).push([x, z, r]); };
		const crowded = (x, z, r) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const L = occ.get(ok(x + i * 4, z + j * 4)); if (L) for (const q of L) if (Math.hypot(q[0] - x, q[1] - z) < r + q[2]) return true; } return false; };
		for (const l of W.streetLamps || []) put(l.x, l.z, 0.8);
		for (const n of CityGrid.intersections) for (const p of n.poles || []) put(p.x, p.z, 0.8);
		for (const c of CityGrid.chargers || []) put(c.x, c.z, 1);
		this._put = put;
		this.free = (x, z, r = 0.6) => {
			if (!WorldMap.inWorld(x, z) || !MapGeo.isLand(x, z) || RoadPlan.onAsphalt(x, z, r * 0.5) || crowded(x, z, r)) return false;
			for (const o of CityGrid.obstaclesAround(x, z, r + 0.2)) if (x > o.x0 - r && x < o.x1 + r && z > o.z0 - r && z < o.z1 + r) return false;
			return true;
		};
		this._biomeCache = new Map();

		this._wear(W, rng, st);
		this._junctions(W, rng, st);
		this._names(W, st);
		this._speedSigns(W, rng, st);
		this._bumpsBuild(W, rng, st);
		this._busStopsBuild(W, rng, st);
		this._rails(W, st);
		this._powerLines(W, rng, st);
		this._bins(W, rng, st);
		this._streetTrees(W, rng, st);
		MeshBatch.anchor = null;
		console.log(`[RUAS] detalhe: ${st.decals} marcas no chão, ${st.signs} placas, ${st.names} esquinas com nome, ${st.bumps} lombadas, ${st.stops} pontos de ônibus, ${st.rails} defensas, ${st.poles} postes com fiação, ${st.bins} lixeiras (${(performance.now() - t0).toFixed(0)} ms)`);
	},

	// relevo: o que é montado em seguida fica NIVELADO (sobe inteiro com o chão sob o pé)
	_anchor(x, z) { MeshBatch.anchor = typeof Relief !== 'undefined' && Relief.on ? { h: Relief.at(x, z) } : null; },
	_biome(x, z) {
		const k = Math.round(x / 24) * 65536 + Math.round(z / 24);
		if (this._biomeCache.has(k)) return this._biomeCache.get(k);
		let b = null;
		for (const [dx, dz] of [[0, 0], [9, 0], [-9, 0], [0, 9], [0, -9]]) { const q = CityGrid._blockAtPoint(x + dx, z + dz); if (q) { b = q.biome; break; } }
		this._biomeCache.set(k, b);
		return b;
	},
	_poor(x, z) { const b = this._biome(x, z); return b === 'residential' || b === 'industrial' || b === 'port'; },

	// um decal deitado no asfalto: centro (x, z), eixo (tx, tz) = "para cima" da imagem, meia largura hw e meio comprimento hl
	decal(name, x, z, tx, tz, hw, hl, y = 0.036) {
		const uv = RoadArt.DECAL[name]; if (!uv) return;
		const [u0, v0, u1, v1] = uv, lx = tz, lz = -tx;                     // (lx, lz): a direita da imagem para quem a lê andando em (tx, tz)
		const P = (a, b) => [x + lx * a + tx * b, y, z + lz * a + tz * b];
		const bt = this.W._batch('decal', x, z), up = [0, 1, 0];
		bt.tri(P(-hw, hl), P(hw, hl), P(hw, -hl), up, [[u0, v0], [u1, v0], [u1, v1]]);
		bt.tri(P(-hw, hl), P(hw, -hl), P(-hw, -hl), up, [[u0, v0], [u1, v1], [u0, v1]]);
		this.stats.decals++;
	},
	_asphalt(e) { return RoadPlan.CLASS[e.cls].surface === 'asphalt' && e.cls !== 'bridge' && e.cls !== 'via' && !e.layer; },
	_urban(e) { return e.cls === 'city' || e.cls === 'isl' || e.cls === 'ave'; },

	// ------------------------------------------------------------------ asfalto gasto
	WEAR: { city: 0.55, isl: 0.4, ave: 0.45, hwy: 0.55, serra: 0.25 },
	BIOME_WEAR: { downtown: 0.55, commercial: 0.7, residential: 1.15, industrial: 1.5, port: 1.4, park: 0.8, resort: 0.4 },
	_wear(W, rng, st) {
		const P = {};
		for (const e of RoadPlan.edges) {
			if (!this._asphalt(e) || this.WEAR[e.cls] == null) continue;
			const hw = e.w / 2, med = (RoadPlan.CLASS[e.cls].median || 0) / 2, urb = this._urban(e);
			for (let s = e.cutA + 3; s < e.len - e.cutB - 3; s += 4.5) {
				if (RoadPlan.inTunnel(e, s, 4)) continue;
				RoadPlan.at(e, s, P);
				const lx = P.tz, lz = -P.tx;                                      // direita de quem anda de a para b
				// boca de lobo nas duas beiras, a cada ~27 u (rua da cidade)
				if (urb && Math.round(s / 4.5) % 6 === 0) for (const sd of [-1, 1]) this.decal('drain', P.x + lx * sd * (hw - 0.34), P.z + lz * sd * (hw - 0.34), lx * sd, lz * sd, 0.6, 0.32);
				const wear = this.WEAR[e.cls] * (urb ? (this.BIOME_WEAR[this._biome(P.x + lx * (hw + 6), P.z + lz * (hw + 6))] || 1) : 1);
				if (rng() > wear * 0.42) continue;
				const r = rng(), side = rng() < 0.5 ? -1 : 1, lane = med + (hw - med) / 2;
				let lat = side * (med + 0.7 + rng() * (hw - med - 1.4)), name, sw, sl, ang = 0;
				const nearX = s < e.cutA + 14 || s > e.len - e.cutB - 14;                // (perto do cruzamento: faixa, retenção e setas — sem desgaste em cima)
				if (nearX && r < 0.74) continue;
				if (r < 0.3) { name = 'crack' + Math.floor(rng() * 6); sw = sl = 1.2 + rng() * 0.8; ang = rng() * 6.28; }
				else if (r < 0.55) { name = 'pot' + Math.floor(rng() * 3); sw = sl = 0.55 + rng() * 0.35; ang = rng() * 6.28; lat = side * (lane + (rng() - 0.5) * 1.6); }
				else if (r < 0.74) { name = 'patch' + Math.floor(rng() * 3); sw = 0.9 + rng() * 0.6; sl = 1.2 + rng() * 1.2; }
				else if (r < 0.9) { name = 'oil' + Math.floor(rng() * 2); sw = 0.6 + rng() * 0.3; sl = 0.8 + rng() * 0.5; lat = side * (lane + (rng() - 0.5) * 0.5); }
				else { name = rng() < 0.6 ? 'mhRound' : 'mhSquare'; sw = sl = 0.42; lat = side * (lane + (rng() - 0.5) * 0.8); ang = rng() * 6.28; }
				const c = Math.cos(ang), sn = Math.sin(ang), tx = P.tx * c - lx * sn, tz = P.tz * c - lz * sn;
				const x = P.x + lx * lat, z = P.z + lz * lat;
				this.decal(name, x, z, tx, tz, sw, sl);
				if (name.startsWith('pot')) { const o = { x, z, r: sw * 0.8, kind: 'pot' }; this.potholes.push(o); this._ins(o); }
			}
		}
	},

	// ------------------------------------------------------------------ cruzamentos: retenção e setas; PARE no interior
	_junctions(W, rng, st) {
		const RANK = { hwy: 4, ave: 3, serra: 3, city: 2, isl: 2, bridge: 3, via: 3, dirt: 1, trail: 0, fav: 1 };
		for (const n of CityGrid.intersections) {
			if (n.round || !n.arms || n.arms.length < 2) continue;
			if (n.visible) {                                                    // cidade: semáforo — linha de retenção e setas
				for (const a of n.arms) {
					const e = a.e; if (!this._asphalt(e) || !this._urban(e) || e.len < a.cut + 22) continue;
					const tx = -a.dx, tz = -a.dz, rx = tz, rz = -tx;               // quem chega anda em t; a direita dele é r
					const hw = e.w / 2, med = (RoadPlan.CLASS[e.cls].median || 0) / 2, s0 = a.cut + 3.7, mid = (med + hw) / 2;
					const cx = n.x + a.dx * s0 + rx * mid, cz = n.z + a.dz * s0 + rz * mid;
					this.decal('paint', cx, cz, tx, tz, (hw - med - 0.4) / 2, 0.2);
					// seta: para onde dá para ir desta perna
					let S = false, Rt = false, Lt = false;
					for (const b of n.arms) {
						if (b === a) continue;
						const cr = tx * b.dz - tz * b.dx, dt = tx * b.dx + tz * b.dz;
						if (dt > 0.7) S = true; else if (cr < -0.3) Rt = true; else if (cr > 0.3) Lt = true;
					}
					const k = S && Rt && rng() < 0.6 ? 'SR' : S && Lt && rng() < 0.4 ? 'SL' : S ? 'S' : Rt ? 'R' : Lt ? 'L' : null;
					if (k && e.len > a.cut + 30) { const s1 = s0 + 8; this.decal('arrow' + k, n.x + a.dx * s1 + rx * mid, n.z + a.dz * s1 + rz * mid, tx, tz, 0.7, 2.6); }
				}
				continue;
			}
			if (!n.signal) continue;
			// interior: as pernas da via menor param (PARE no chão e a placa)
			let top = 0; for (const a of n.arms) top = Math.max(top, RANK[a.e.cls] || 0);
			for (const a of n.arms) {
				const e = a.e;
				if ((RANK[e.cls] || 0) >= top || e.cls === 'trail' || e.cls === 'fav' || e.len < a.cut + 14) continue;
				const tx = -a.dx, tz = -a.dz, rx = tz, rz = -tx, hw = e.w / 2;
				if (RoadPlan.CLASS[e.cls].surface === 'asphalt') {
					const s0 = a.cut + 1.6;
					this.decal('paint', n.x + a.dx * s0 + rx * hw / 2, n.z + a.dz * s0 + rz * hw / 2, tx, tz, hw / 2 - 0.2, 0.2);
					const s1 = a.cut + 4.5; this.decal('pare', n.x + a.dx * s1 + rx * hw / 2, n.z + a.dz * s1 + rz * hw / 2, tx, tz, hw / 2 - 0.4, 1.3);
				}
				this.addSign(n.x + a.dx * (a.cut + 2.5) + rx * (hw + 0.9), n.z + a.dz * (a.cut + 2.5) + rz * (hw + 0.9), a.dx, a.dz, 'pare');
			}
		}
	},

	// placa num poste (vira um item do StreetProps: quebra com a batida)
	addSign(x, z, fx, fz, kind, force = false) {
		if (!force && !this.free(x, z, 0.5)) {
			let ok = false;
			for (const d of [0.8, -0.8, 1.6, -1.6]) { const x2 = x + fz * d, z2 = z - fx * d; if (this.free(x2, z2, 0.5)) { x = x2; z = z2; ok = true; break; } }
			if (!ok) return null;
		}
		this._put(x, z, 0.6);
		const s = { x, z, fx, fz, kind, alive: true };
		this.signs.push(s); this.stats.signs++;
		return s;
	},

	// ------------------------------------------------------------------ nomes de rua nas esquinas
	_names(W, st) {
		const b0 = (x, z) => W._batch('trim', x, z), f0 = (x, z) => W._batch('signs', x, z);
		for (const n of CityGrid.intersections) {
			if (!n.visible || n.gen || n.round || !n.arms) continue;
			const ns = n.arms.find((a) => a.q === 0 || a.q === 1), ew = n.arms.find((a) => a.q === 2 || a.q === 3);
			if (!ns && !ew) continue;
			const pole = (n.poles || [])[0]; if (!pole) continue;
			// ao lado do poste do semáforo, 1,6 u pela calçada (ao longo da rua leste-oeste)
			let x = pole.x + pole.sx * 1.6, z = pole.z;
			if (!this.free(x, z, 0.4)) { x = pole.x; z = pole.z + pole.sz * 1.6; if (!this.free(x, z, 0.4)) continue; }
			this._put(x, z, 0.5);
			const ave = (a) => a && a.e.cls === 'ave';
			const A = ns ? { i: RoadArt.nameIndex('v' + Math.round(n.x / 6), ave(ns)), dx: 0, dz: 1 } : null;
			const B = ew ? { i: RoadArt.nameIndex('h' + Math.round(n.z / 6), ave(ew)), dx: 1, dz: 0 } : null;
			this._anchor(x, z); RoadArt.nameSign(b0(x, z), f0(x, z), x, z, A, B); MeshBatch.anchor = null;
			W.colliders && W._collider(`nome_${Math.round(x)}_${Math.round(z)}`, x - 0.06, z - 0.06, x + 0.06, z + 0.06, 3);
			st.names++;
		}
	},

	// ------------------------------------------------------------------ placas ao longo das vias
	_speedSigns(W, rng, st) {
		const LIM = { hwy: 'v80', serra: 'v60', ave: 'v60', city: 'v40', isl: 'v40' }, P = {}, Q = {};
		for (const e of RoadPlan.edges) {
			if (!this._asphalt(e) || !LIM[e.cls] || e.len < 90) continue;
			const urb = this._urban(e);
			if (urb && e.cls !== 'ave' && rng() > 0.3) continue;
			const hw = e.w / 2 + 0.9;
			for (const dir of [1, -1]) {
				const s = dir > 0 ? e.cutA + 14 : e.len - e.cutB - 14;
				RoadPlan.at(e, s, P);
				const tx = P.tx * dir, tz = P.tz * dir, rx = tz, rz = -tx;
				this.addSign(P.x + rx * hw, P.z + rz * hw, -tx, -tz, LIM[e.cls]);
				if (e.cls === 'ave' && e.len > 140 && rng() < 0.6) {
					const s2 = dir > 0 ? e.len * 0.6 : e.len * 0.4; RoadPlan.at(e, s2, P);
					this.addSign(P.x + rx * hw, P.z + rz * hw, -tx, -tz, rng() < 0.6 ? 'noPark' : 'noStop');
				}
			}
			// curvas fechadas da estrada: placa ~45 u antes, para cada sentido
			if (!e.free || (e.cls !== 'hwy' && e.cls !== 'serra')) continue;
			const turn = (s) => { RoadPlan.at(e, s - 14, P); RoadPlan.at(e, s + 14, Q); return Math.atan2(P.tx * Q.tz - P.tz * Q.tx, P.tx * Q.tx + P.tz * Q.tz); };
			let lastF = -1e9, lastB = 1e9;
			for (let s = e.cutA + 60; s < e.len - e.cutB - 20; s += 8) {
				const a = turn(s);
				if (Math.abs(a) < 0.62) continue;
				if (s - lastF > 140 && s - 45 > e.cutA + 10) {                // sentido a→b: chega pela frente
					RoadPlan.at(e, s - 45, P); const tx = P.tx, tz = P.tz, rx = tz, rz = -tx;
					if (this.addSign(P.x + rx * hw, P.z + rz * hw, -tx, -tz, a < 0 ? 'curvaD' : 'curvaE')) lastF = s;
				}
			}
			for (let s = e.len - e.cutB - 60; s > e.cutA + 20; s -= 8) {
				const a = turn(s);
				if (Math.abs(a) < 0.62) continue;
				if (lastB - s > 140 && s + 45 < e.len - e.cutB - 10) {         // sentido b→a
					RoadPlan.at(e, s + 45, P); const tx = -P.tx, tz = -P.tz, rx = tz, rz = -tx;
					if (this.addSign(P.x + rx * hw, P.z + rz * hw, -tx, -tz, a > 0 ? 'curvaD' : 'curvaE')) lastB = s;
				}
			}
		}
	},

	// ------------------------------------------------------------------ quebra-molas
	_bumpsBuild(W, rng, st) {
		const P = {};
		for (const e of RoadPlan.edges) {
			const fav = e.cls === 'fav';
			if (!fav && e.cls !== 'city' && e.cls !== 'isl') continue;
			if (e.layer || e.len < 56) continue;
			const step = fav ? 70 : 1e9;
			for (let s = e.cutA + (fav ? 30 : e.len * (0.4 + rng() * 0.2)); s < e.len - e.cutB - 20; s += step) {
				RoadPlan.at(e, s, P);
				if (!fav) { const lx = P.tz, lz = -P.tx; if (!this._poor(P.x + lx * (e.w / 2 + 6), P.z + lz * (e.w / 2 + 6)) || rng() > 0.45) break; }
				else if (rng() > 0.55) continue;
				if (CityGrid.inCrosswalk(P.x, P.z, 3) || RoadPlan.nodeNear && RoadPlan.nodeNear(P.x, P.z, 14)) continue;
				if (this.busStops.some((b) => Math.hypot(b.x - P.x, b.z - P.z) < 26)) continue;      // (nada de lombada em cima do ponto de ônibus)
				const hw = e.w / 2 - 0.05, o = { x: P.x, z: P.z, tx: P.tx, tz: P.tz, hw, kind: 'bump' };
				this.bumps.push(o); this._ins(o); st.bumps++;
				this._anchor(P.x, P.z); RoadArt.bump(W._batch('trim', P.x, P.z), P.x, P.z, P.tx, P.tz, hw); MeshBatch.anchor = null;
				if (!fav) for (const dir of [1, -1]) {                          // placa 26 u antes, nos dois sentidos
					const s2 = s - dir * 26; if (s2 < e.cutA + 4 || s2 > e.len - e.cutB - 4) continue;
					const Q = RoadPlan.at(e, s2), tx = Q.tx * dir, tz = Q.tz * dir, rx = tz, rz = -tx, h2 = e.w / 2 + 0.9;
					this.addSign(Q.x + rx * h2, Q.z + rz * h2, -tx, -tz, 'lombada');
				}
			}
		}
	},

	// ------------------------------------------------------------------ pontos de ônibus
	_busStopsBuild(W, rng, st) {
		const P = {};
		for (const e of RoadPlan.edges) {
			if (!this._urban(e) || e.layer || e.len < 70) continue;
			if (rng() > (e.cls === 'ave' ? 0.8 : 0.3)) continue;
			for (const dir of [1, -1]) {
				if (e.cls !== 'ave' && dir < 0 && rng() < 0.5) continue;
				const s = dir > 0 ? e.len * 0.42 : e.len * 0.58;
				if (s < e.cutA + 18 || s > e.len - e.cutB - 18) continue;
				RoadPlan.at(e, s, P);
				const tx = P.tx * dir, tz = P.tz * dir, rx = tz, rz = -tx, hw = e.w / 2, lat = hw + 1.55;
				const x = P.x + rx * lat, z = P.z + rz * lat;
				if (this.bumps.some((o) => Math.hypot(o.x - P.x, o.z - P.z) < 26)) continue;      // (o "ÔNIBUS" do chão em cima de uma lombada)
				// o abrigo inteiro na calçada livre (4,2 × 1,5 u)
				let free = true;
				for (const [l, d] of [[0, 0], [-2.1, -0.7], [2.1, -0.7], [-2.1, 0.7], [2.1, 0.7], [2.7, 0.6]]) if (!this.free(x + tx * l + rx * d, z + tz * l + rz * d, 0.35)) { free = false; break; }
				if (!free) continue;
				for (const l of [-2, -1, 0, 1, 2]) this._put(x + tx * l, z + tz * l, 1.1);
				// (fx, fz) = do abrigo para a rua = -r
				this._anchor(x, z); RoadArt.busStop(W._batch('trim', x, z), W._batch('signs', x, z), x, z, -rx, -rz); MeshBatch.anchor = null;
				// sólidos: o vidro do fundo e o painel de anúncio (física e quem anda)
				const bx = x + rx * 0.65, bz = z + rz * 0.65, ax = x - tx * 2.0, az = z - tz * 2.0;
				const box = (cx, cz, ex, ez, h, nm) => { W._collider(nm, cx - ex, cz - ez, cx + ex, cz + ez, h); CityGrid.addObstacles([{ x0: cx - ex, z0: cz - ez, x1: cx + ex, z1: cz + ez, h }]); };
				box(bx, bz, Math.abs(tx) * 2.0 + 0.06, Math.abs(tz) * 2.0 + 0.06, 2.3, `onibus_${st.stops}a`);
				box(ax, az, Math.abs(rx) * 0.55 + 0.07, Math.abs(rz) * 0.55 + 0.07, 2.2, `onibus_${st.stops}b`);
				// "ÔNIBUS" na faixa, logo antes do ponto
				const lane = (RoadPlan.CLASS[e.cls].median || 0) / 2 + (hw - (RoadPlan.CLASS[e.cls].median || 0) / 2) / 2, s2 = s - dir * 5;
				const Q = RoadPlan.at(e, s2); this.decal('onibus', Q.x + rx * lane, Q.z + rz * lane, tx, tz, Math.min(1.5, (hw - lane) * 0.95), 1.1);
				this.busStops.push({ x, z, fx: -rx, fz: -rz, edge: e, s, dir });
				st.stops++;
			}
		}
	},

	// ------------------------------------------------------------------ defensas metálicas (rodovia e serra)
	_rails(W, st) {
		const P = {}, Q = {}, R = typeof Relief !== 'undefined' && Relief.on;
		const hAt = (x, z) => R ? Relief.at(x, z) : WorldMap.heightAt(x, z);
		for (const e of RoadPlan.edges) {
			if (!e.free || (e.cls !== 'hwy' && e.cls !== 'serra') || e.layer) continue;
			const hw = e.w / 2 + 0.85;
			for (const side of [-1, 1]) {
				let run = [];
				const flush = () => {
					if (run.length >= 5) {
						const b = W._batch('trim', run[0][0], run[0][1]);
						RoadArt.guardRail(b, run, 0, run.length - 1, side); st.rails++;
						for (let k = 0; k + 1 < run.length; k += 2) {                 // física: caixas giradas de ~8 u
							const a = run[k], c = run[Math.min(run.length - 1, k + 2)], dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz);
							if (L > 0.5) W._colliderRot(`defensa_${st.rails}_${k}`, (a[0] + c[0]) / 2, (a[1] + c[1]) / 2, 0.25, L, 1.0, Math.atan2(dx, dz));
						}
					}
					run = [];
				};
				for (let s = e.cutA + 6; s < e.len - e.cutB - 6; s += 4) {
					RoadPlan.at(e, s - 12, P); RoadPlan.at(e, s + 12, Q);
					const turn = Math.atan2(P.tx * Q.tz - P.tz * Q.tx, P.tx * Q.tx + P.tz * Q.tz);
					const C = RoadPlan.at(e, s), lx = C.tz * side, lz = -C.tx * side, x = C.x + lx * hw, z = C.z + lz * hw;
					// curva fechada (do lado de fora dela) ou barranco: o chão a 7 u da beira cai mais de 3 m
					const outer = Math.abs(turn) > 0.45 && Math.sign(turn) === -side;
					const drop = hAt(C.x, C.z) - hAt(C.x + lx * (hw + 7), C.z + lz * (hw + 7)) > 3;
					const good = (outer || drop) && MapGeo.isLand(x, z) && !RoadPlan.onAsphalt(x, z, 0.2) && !RoadPlan.inTunnel(e, s, 6) && !(RoadPlan.nodeNear && RoadPlan.nodeNear(x, z, 16));
					if (good) run.push([x, z]); else flush();
				}
				flush();
			}
		}
	},

	// ------------------------------------------------------------------ postes de concreto com fiação (periferia e estradas de terra)
	_powerLines(W, rng, st) {
		const P = {};
		for (const e of RoadPlan.edges) {
			const urb = e.cls === 'city' || e.cls === 'isl', dirt = e.cls === 'dirt';
			if ((!urb && !dirt) || e.layer || e.len < 40) continue;
			RoadPlan.at(e, e.len / 2, P);
			if (urb && !this._poor(P.x + P.tz * (e.w / 2 + 6), P.z - P.tx * (e.w / 2 + 6)) && !this._poor(P.x - P.tz * (e.w / 2 + 6), P.z + P.tx * (e.w / 2 + 6))) continue;
			const side = rng() < 0.5 ? -1 : 1, lat = e.w / 2 + (urb ? 0.45 : 1.6), span = urb ? 28 : 34, list = [];
			for (let s = e.cutA + 6; s < e.len - e.cutB - 4; s += span) {
				let got = null;
				for (const d of [0, 3, -3, 6, -6]) {
					const s2 = s + d; if (s2 < e.cutA + 3 || s2 > e.len - e.cutB - 3) continue;
					RoadPlan.at(e, s2, P);
					const lx = P.tz * side, lz = -P.tx * side, x = P.x + lx * lat, z = P.z + lz * lat;
					if (this.free(x, z, 0.7)) { got = { x, z, lx, lz, tx: P.tx, tz: P.tz }; break; }
				}
				if (got) list.push(got);
			}
			if (list.length < 2) continue;
			let prev = null;
			for (let i = 0; i < list.length; i++) {
				const p = list[i], b = W._batch('trim', p.x, p.z);
				this._put(p.x, p.z, 1.2);
				const trafo = i % 3 === 1, gato = urb && rng() < 0.45;
				this._anchor(p.x, p.z);
				const H = RoadArt.powerPole(b, p.x, p.z, p.lx, p.lz, { trafo, lamp: urb ? null : null });
				MeshBatch.anchor = null;
				W._collider(`posteC_${st.poles}`, p.x - 0.18, p.z - 0.18, p.x + 0.18, p.z + 0.18, 8);
				CityGrid.addObstacles([{ x0: p.x - 0.18, z0: p.z - 0.18, x1: p.x + 0.18, z1: p.z + 0.18, h: 8 }]);
				const hp = (x, z) => typeof Relief !== 'undefined' && Relief.on ? Relief.at(x, z) : 0;
				p.h = hp(p.x, p.z);
				MeshBatch.anchor = { h: 0 };                                        // (fios e gato: alturas absolutas, já com o relevo)
				if (prev) {                                                         // vão: 3 fios da média e 2 da baixa, com barriga
					const wb = W._batch('trim', (p.x + prev.x) / 2, (p.z + prev.z) / 2);
					for (const s of [-0.85, 0, 0.85]) RoadArt.wire(wb, [prev.x + prev.lx * s, prev.h + H - 0.45, prev.z + prev.lz * s], [p.x + p.lx * s, p.h + H - 0.45, p.z + p.lz * s], 0.45);
					for (const s of [-0.45, 0.45]) RoadArt.wire(wb, [prev.x + prev.lx * s, prev.h + H - 1.45, prev.z + prev.lz * s], [p.x + p.lx * s, p.h + H - 1.45, p.z + p.lz * s], 0.6, [0.05, 0.05, 0.06], 0.025);
				}
				if (gato) this.tangle(b, p.x, p.z, p.h, H, p.lx, p.lz, rng);
				MeshBatch.anchor = null;
				this.poles.push(p); st.poles++;
				prev = p;
			}
		}
	},
	// o "GATO": fios embolados em volta do poste (rolos, emendas) e ligações puxadas para as casas, para o lado de fora da rua (l)
	tangle(b, x, z, h, H, lx, lz, rng, n = 7, reach = [5, 10]) {
		const C = [[0.06, 0.06, 0.07], [0.12, 0.1, 0.1], [0.2, 0.06, 0.05], [0.05, 0.08, 0.14]];
		const y0 = h + H - 2.6;
		for (let k = 0; k < n; k++) {                                            // rolos e laços pendurados
			const a = rng() * 6.28, r = 0.4 + rng() * 1.1, y = y0 + rng() * 1.6;
			RoadArt.wire(b, [x, y + 0.3, z], [x + Math.cos(a) * r, y - 0.2 - rng() * 0.5, z + Math.sin(a) * r], 0.25 + rng() * 0.4, C[k % C.length], 0.018, 4);
		}
		for (let k = 0; k < 4; k++) { const y = y0 + 0.2 + k * 0.25; b.obox(x, z, 1, 0, 0.2, 0.2, y, y + 0.08, C[k % C.length]); }      // fita e emendas no poste (alturas absolutas: âncora 0)
		for (let k = 0; k < 2 + Math.floor(rng() * 3); k++) {                   // ligações para as casas
			const d = reach[0] + rng() * (reach[1] - reach[0]), sd = (rng() - 0.5) * 9;
			const tx = x + lx * d + lz * sd, tz = z + lz * d - lx * sd, th = (typeof Relief !== 'undefined' && Relief.on ? Relief.at(tx, tz) : 0) + 3.2 + rng() * 2.5;
			RoadArt.wire(b, [x, y0 + 0.6 + rng(), z], [tx, th, tz], 0.6 + rng() * 0.8, C[k % C.length], 0.016, 7);
		}
	},

	// ------------------------------------------------------------------ árvores de rua (no canteirinho da calçada)
	_streetTrees(W, rng, st) {
		if (typeof Trees3D === 'undefined' || !Trees3D.on) return;
		const P = {}; st.trees = 0; this.treeSpots = [];
		for (const e of RoadPlan.edges) {
			if (!this._urban(e) || e.layer || e.len < 40) continue;
			for (const side of [1, -1]) for (let s = e.cutA + 9 + rng() * 6; s < e.len - e.cutB - 7; s += 13 + rng() * 6) {
				if (rng() < 0.4) continue;
				RoadPlan.at(e, s, P);
				const lx = P.tz * side, lz = -P.tx * side, d = e.w / 2 + 1.5, x = P.x + lx * d, z = P.z + lz * d;
				if (!this.free(x, z, 1.4) || CityGrid.inCrosswalk(x, z, 3)) continue;
				this._put(x, z, 1.6);
				const blk = CityGrid._blockAtPoint(x, z);
				if (!(blk && blk.open && blk.ground === 'grass')) W._canteiro(x, z, 0.75);      // (no gramado do parque, a árvore nasce na grama: sem canteiro)
				(this.treeSpots || (this.treeSpots = [])).push([x, z]);
				Trees3D.add(W._batch('veg_hi', x, z), rng() < 0.8 ? 'oak' : 'ipe', x, 0, z, 0.58 + rng() * 0.16);      // (árvore de calçada: menor que a de parque)
				st.trees++;
			}
		}
	},

	// ------------------------------------------------------------------ lixeiras laranja
	_bins(W, rng, st) {
		const P = {};
		for (const e of RoadPlan.edges) {
			if (!this._urban(e) || e.layer || e.len < 40) continue;
			for (let s = e.cutA + 10 + rng() * 20; s < e.len - e.cutB - 8; s += 34 + rng() * 20) {
				if (rng() < 0.4) continue;
				RoadPlan.at(e, s, P);
				const side = rng() < 0.5 ? -1 : 1, lx = P.tz * side, lz = -P.tx * side, d = e.w / 2 + 0.55, x = P.x + lx * d, z = P.z + lz * d;
				if (!this.free(x, z, 0.5)) continue;
				this._put(x, z, 0.5);
				this._anchor(x, z); RoadArt.bin(W._batch('trim', x, z), x, z); MeshBatch.anchor = null;
				st.bins++;
			}
		}
	},

	// ================================================================== quadro: trancos
	// A IA: distância (u) até o próximo quebra-molas à frente de quem está em (x, z) andando em (fx, fz) — ou -1.
	bumpAhead(x, z, fx, fz, look = 26) {
		if (!this.bumps.length) return -1;
		let best = -1;
		const cx = x + fx * look / 2, cz = z + fz * look / 2;
		this._near(cx, cz, look / 2 + 4, (o) => {
			if (o.kind !== 'bump') return;
			const dx = o.x - x, dz = o.z - z, al = dx * fx + dz * fz;
			if (al < -0.5 || al > look || Math.abs(fx * o.tx + fz * o.tz) < 0.5) return;
			const lat = Math.abs(dx * o.tz - dz * o.tx);                          // (ao longo da lombada: de uma beira à outra da rua)
			if (lat > o.hw + 1) return;
			if (best < 0 || al < best) best = al;
		});
		return best;
	},
	update(dt, cars, game) {
		if (!this.bumps.length && !this.potholes.length) return;
		for (const car of cars) {
			if (!car || car._asleep || car.wrecked || car.isBoat || (car.spec && car.spec.boat) || car.elev > 0.5) continue;
			const sp = Math.abs(car.speed || 0);
			if (sp < 1.5) continue;
			const p = car.position;
			if (!WorldMap.inWorld(p.x, p.z)) continue;
			if (!car.controlled && !Zones.near(p.x, p.z, 80)) continue;             // (longe da tela, ninguém vê o tranco)
			let hit = null, hitPot = null;
			this._near(p.x, p.z, 3, (o) => {
				const dx = p.x - o.x, dz = p.z - o.z;
				if (o.kind === 'bump') {
					const al = dx * o.tx + dz * o.tz, lat = Math.abs(dx * o.tz - dz * o.tx);
					if (Math.abs(al) < (car.halfLen || 2) && lat < o.hw + 0.5) hit = o;
				} else if (dx * dx + dz * dz < (o.r + 0.6) * (o.r + 0.6)) hitPot = o;
			});
			// passou por cima: um tranco na entrada da lombada (as duas rodas: dianteira e traseira — tranco duplo)
			if (hit) {
				const al = (p.x - hit.x) * hit.tx + (p.z - hit.z) * hit.tz, half = car.halfLen || 2, ph = car._bmpPh || 0;
				const zone = al < -half * 0.4 ? 0 : al < half * 0.4 ? 1 : 2, dirSign = Math.sign((car.velocity ? car.velocity.x * hit.tx + car.velocity.z * hit.tz : 1) || 1);
				const step = dirSign > 0 ? zone : 2 - zone;
				if (car._bmpRef !== hit) { car._bmpRef = hit; car._bmpPh = step; }
				else if (step > ph) { car._bmpPh = step; this._jolt(car, sp, 1, game); }
			} else car._bmpRef = null;
			if (hitPot) { if (car._potRef !== hitPot) { car._potRef = hitPot; this._jolt(car, sp, 0.45, game); } }
			else car._potRef = null;
		}
	},
	_jolt(car, sp, k0, game) {
		const k = Math.min(1.6, Math.max(0.15, (sp - 2) / 10)) * k0;
		const V = car.visual;
		if (V) {
			if (V.kind && V.kind !== 'car') { if (V._vt !== undefined) V._vt += 0.9 * k; }
			else if (V._vh !== undefined) { V._vh += 1.6 * k; V._vp = (V._vp || 0) + (Math.random() - 0.3) * 1.3 * k; }
			if (V.body && V.body._vh !== undefined) V.body._vh += 0.9 * k;                // (moto com piloto: RiderActor)
		}
		if (k0 >= 1 && sp > 5 && car.phys) {                                       // freia: a lombada tira velocidade
			const v = car.phys.getLinearVelocity(), m = 1 - Math.min(0.28, 0.07 * k);
			car.phys.setLinearVelocity(new BABYLON.Vector3(v.x * m, v.y, v.z * m));
		}
		if (k0 >= 1 && sp > 14 && car.takeDamage) car.takeDamage(Math.min(14, (sp - 14) * 1.6), car.controlled ? 'player' : 'env');      // (> ~50 km/h: estraga)
		if (car.controlled && game) {
			if (game.camera && game.camera.shake) game.camera.shake(Math.min(0.5, 0.12 + 0.18 * k));
			if (typeof AudioFX !== 'undefined') AudioFX.thud(car.position.x, car.position.z);
		}
	},
};
