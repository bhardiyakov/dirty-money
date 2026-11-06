// ============================================================================
// FavelaDetail — o DETALHE DA FAVELA (referência: a folha da favela). Montado uma vez no WorldBuilder (antes do _flush), sobre os
// barracos do FavelaPlan (as paredes de tijolo e reboco são da fachada 'fav': CityHD._fac_fav); determinístico:
//   • GATONET: antenas parabólicas nos telhados e nas paredes; caixas de ar-condicionado penduradas; ferros de laje (as "esperas" do
//     próximo andar) e varais com roupa nas lajes;
//   • FIAÇÃO EMBOLADA: de cada poste de "gato" saem fios caídos para as casas em volta (2 a 5), fios cruzam os becos de parede a parede e
//     rolos de fio ficam pendurados no poste;
//   • CHÃO: pedras soltas com mato crescendo entre elas nas beiras dos becos e das ruas de terra;
//   • LIXO: sacos de lixo amontoados, entulho (tijolo quebrado, tábua, pedaço de bloco) e sujeira espalhada.
// ============================================================================

const FavelaDetail = {
	stats: {},

	build(W) {
		if (typeof Favelas === 'undefined') return;
		const t0 = performance.now(), rng = Pixel.rng(31337), st = this.stats = { dishes: 0, acs: 0, rebar: 0, lines: 0, drops: 0, across: 0, stones: 0, tufts: 0, bags: 0, debris: 0 };
		this.W = W;
		const lots = [];
		for (const blk of CityGrid.blocks) if (blk.district === 'favela') for (const l of blk.lots) if (!l.safehouse && !l.landmark) lots.push(l);
		this._lotGrid = new Map();
		for (const l of lots) { const k = this._k((l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2); (this._lotGrid.get(k) || this._lotGrid.set(k, []).get(k)).push(l); }
		this._roofs(W, lots, rng, st);
		this._wires(W, rng, st);
		for (const F of Favelas.built) this._ground(W, F, rng, st);
		MeshBatch.anchor = null;
		console.log(`[FAVELA] detalhe: ${st.dishes} antenas, ${st.acs} ar-condicionados, ${st.rebar} lajes com ferro, ${st.lines} varais, ${st.drops} fios de gato para as casas, ${st.across} fios cruzando becos, ${st.stones} pedras, ${st.tufts} tufos de mato, ${st.bags} sacos de lixo, ${st.debris} montes de entulho (${(performance.now() - t0).toFixed(0)} ms)`);
	},
	_k(x, z) { return Math.floor(x / 16) * 65536 + Math.floor(z / 16); },
	_lotsNear(x, z, r) {
		const out = [];
		for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const L = this._lotGrid.get(this._k(x + i * 16, z + j * 16)); if (L) for (const l of L) { const cx = Math.max(l.x0, Math.min(x, l.x1)), cz = Math.max(l.z0, Math.min(z, l.z1)); const d = Math.hypot(cx - x, cz - z); if (d < r) out.push({ l, d, cx, cz }); } }
		return out.sort((a, b) => a.d - b.d);
	},
	_h(x, z) { return typeof Relief !== 'undefined' && Relief.on ? Relief.at(x, z) : 0; },
	// altura do topo da parede do barraco `l` no mundo (relevo: o barraco nivelado — WorldBuilder.lotAnchor)
	_top(l) { const A = WorldBuilder.lotAnchor(l); return (A ? A.h : 0) + l.height; },

	// ------------------------------------------------------------------ telhados e paredes
	_roofs(W, lots, rng, st) {
		for (const l of lots) {
			const { x0, z0, x1, z1 } = l, H = l.height, w = x1 - x0, d = z1 - z0, b = W._batch('trim', x0, z0);
			if (w < 2 || d < 2) continue;
			MeshBatch.anchor = WorldBuilder.lotAnchor(l);
			const slab = l.roof.startsWith('slab') || l.roof.startsWith('laje');
			// antena parabólica (gatonet): no telhado, num canto, virada para o céu do norte (o satélite)
			if (rng() < 0.38) {
				const cx = rng() < 0.5 ? x0 + 0.6 : x1 - 0.6, cz = rng() < 0.5 ? z0 + 0.6 : z1 - 0.6, az = (rng() - 0.5) * 1.4;
				this.dish(b, cx, H, cz, Math.sin(az), Math.cos(az), 0.42 + rng() * 0.18, rng() < 0.3 ? [0.32, 0.5, 0.78] : [0.86, 0.86, 0.84]);
				st.dishes++;
			} else if (rng() < 0.15) {                                                   // ou presa na parede, num suporte
				const side = Math.floor(rng() * 4), p = this._wallPt(l, side, rng()), y = Math.min(H - 0.6, 2.2 + rng() * 2);
				b.tube([p.x, y, p.z], [p.x + p.nx * 0.45, y + 0.15, p.z + p.nz * 0.45], 0.025, 0.025, [0.3, 0.3, 0.32], 4);
				this.dish(b, p.x + p.nx * 0.5, y, p.z + p.nz * 0.5, p.nx * 0.5 + 0.2, p.nz * 0.5 + 0.8, 0.36, [0.86, 0.86, 0.84], true);
				st.dishes++;
			}
			// ar-condicionado pendurado na parede (e o pinga-pinga)
			if (rng() < 0.22 && H > 2.8) {
				const side = Math.floor(rng() * 4), p = this._wallPt(l, side, 0.2 + rng() * 0.6), y = 2.0 + Math.floor(rng() * Math.max(1, (H - 2.6) / 3)) * 3;
				const cx = p.x + p.nx * 0.3, cz = p.z + p.nz * 0.3;
				b.obox(cx, cz, -p.nz, p.nx, 0.42, 0.28, y, y + 0.55, [0.88, 0.88, 0.86]);
				this.disc(b, [cx + p.nx * 0.29, y + 0.28, cz + p.nz * 0.29], [p.nx, 0, p.nz], 0.2, [0.25, 0.26, 0.28]);
				b.tube([cx + p.nx * 0.1, y, cz + p.nz * 0.1], [cx + p.nx * 0.12, y - 0.6, cz + p.nz * 0.12], 0.012, 0.012, [0.9, 0.9, 0.9], 3);
				st.acs++;
			}
			// laje: ferros de espera nos cantos (o andar que ainda vai subir) e varal com roupa
			if (slab && rng() < 0.4) {
				for (const [px, pz] of [[x0 + 0.25, z0 + 0.25], [x1 - 0.25, z0 + 0.25], [x0 + 0.25, z1 - 0.25], [x1 - 0.25, z1 - 0.25]]) {
					if (rng() < 0.2) continue;
					for (let k = 0; k < 3; k++) { const ox = (rng() - 0.5) * 0.16, oz = (rng() - 0.5) * 0.16, hh = 0.6 + rng() * 0.7; b.tube([px + ox, H, pz + oz], [px + ox + (rng() - 0.5) * 0.12, H + hh, pz + oz + (rng() - 0.5) * 0.12], 0.014, 0.014, [0.36, 0.22, 0.14], 3); }
				}
				st.rebar++;
			}
			if (slab && rng() < 0.3 && w > 3 && d > 3) {
				const along = w > d, a0 = along ? [x0 + 0.6, (z0 + z1) / 2 + (rng() - 0.5)] : [(x0 + x1) / 2 + (rng() - 0.5), z0 + 0.6], a1 = along ? [x1 - 0.6, a0[1]] : [a0[0], z1 - 0.6];
				this.clothesline(b, [a0[0], H, a0[1]], [a1[0], H, a1[1]], 1.6, rng);
				st.lines++;
			}
		}
		MeshBatch.anchor = null;
	},
	// ponto no pé da parede `side` (0 norte, 1 sul, 2 leste, 3 oeste) a uma fração t dela; (nx, nz) = normal para fora
	_wallPt(l, side, t) {
		const { x0, z0, x1, z1 } = l;
		if (side === 0) return { x: x0 + (x1 - x0) * t, z: z1, nx: 0, nz: 1 };
		if (side === 1) return { x: x0 + (x1 - x0) * t, z: z0, nx: 0, nz: -1 };
		if (side === 2) return { x: x1, z: z0 + (z1 - z0) * t, nx: 1, nz: 0 };
		return { x: x0, z: z0 + (z1 - z0) * t, nx: -1, nz: 0 };
	},
	// leque de triângulos (face de um lado só: n)
	disc(b, c, n, r, col, seg = 10) {
		const nl = Math.hypot(n[0], n[1], n[2]) || 1, N = [n[0] / nl, n[1] / nl, n[2] / nl];
		const h = Math.abs(N[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
		let u = [N[1] * h[2] - N[2] * h[1], N[2] * h[0] - N[0] * h[2], N[0] * h[1] - N[1] * h[0]]; const ul = Math.hypot(...u); u = u.map((q) => q / ul);
		const v = [N[1] * u[2] - N[2] * u[1], N[2] * u[0] - N[0] * u[2], N[0] * u[1] - N[1] * u[0]], uv = [[0, 0], [0, 0], [0, 0]];
		for (let i = 0; i < seg; i++) {
			const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
			const P = (a) => [c[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r, c[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r, c[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * r];
			b.tri(c, P(a0), P(a1), N, uv, col);
		}
	},
	// antena parabólica: pé, o prato (frente clara, verso escuro) apontando para (ax, az) inclinado para o céu, braço e o LNB
	dish(b, x, y, z, ax, az, r, col, wall = false) {
		const al = Math.hypot(ax, az) || 1, dx = ax / al * 0.75, dz = az / al * 0.75, dy = 0.66, c = [x, y + (wall ? 0.1 : 0.75), z];
		if (!wall) b.tube([x, y, z], [x, y + 0.7, z], 0.03, 0.03, [0.35, 0.35, 0.37], 4);
		this.disc(b, c, [dx, dy, dz], r, col);
		this.disc(b, [c[0] - dx * 0.04, c[1] - dy * 0.04, c[2] - dz * 0.04], [-dx, -dy, -dz], r * 0.98, [0.45, 0.45, 0.46]);
		const lnb = [c[0] + dx * r * 1.3, c[1] + dy * r * 1.3, c[2] + dz * r * 1.3];
		b.tube([c[0], c[1] - r * 0.8, c[2]], lnb, 0.012, 0.012, [0.3, 0.3, 0.32], 3);
		b.obox(lnb[0], lnb[2], dx || 1, dz, 0.06, 0.04, lnb[1] - 0.04, lnb[1] + 0.04, [0.2, 0.2, 0.22]);
	},
	clothesline(b, p, q, hgt, rng) {
		const pole = [0.4, 0.3, 0.2], C = [[0.9, 0.3, 0.45], [0.95, 0.85, 0.2], [0.3, 0.6, 0.9], [0.3, 0.75, 0.4], [0.95, 0.95, 0.95], [0.25, 0.35, 0.65], [0.85, 0.45, 0.2]];
		b.tube(p, [p[0], p[1] + hgt, p[2]], 0.03, 0.03, pole, 4); b.tube(q, [q[0], q[1] + hgt, q[2]], 0.03, 0.03, pole, 4);
		const L = Math.hypot(q[0] - p[0], q[2] - p[2]), tx = (q[0] - p[0]) / L, tz = (q[2] - p[2]) / L, y = p[1] + hgt - 0.05;
		RoadArt.wire(b, [p[0], y, p[2]], [q[0], y, q[2]], 0.12, [0.85, 0.85, 0.85], 0.008, 4);
		for (let s = 0.4; s < L - 0.3; s += 0.45 + rng() * 0.35) {
			const sag = 0.12 * 4 * (s / L) * (1 - s / L), x = p[0] + tx * s, z = p[2] + tz * s, w = 0.18 + rng() * 0.16, h = 0.3 + rng() * 0.35;
			b.obox(x, z, tx, tz, w, 0.015, y - sag - h, y - sag, C[Math.floor(rng() * C.length)]);
		}
	},

	// ------------------------------------------------------------------ fiação do gato
	_wires(W, rng, st) {
		const poles = W._favPoleList || [];
		const WIRE = [[0.05, 0.05, 0.06], [0.1, 0.1, 0.11], [0.45, 0.1, 0.08], [0.12, 0.2, 0.45], [0.6, 0.58, 0.5]];
		MeshBatch.anchor = { h: 0 };                                                    // (fios: alturas absolutas, já com o relevo)
		for (const p of poles) {
			{
				const h = this._h(p.x, p.z), b = W._batch('trim', p.x, p.z), top = h + 5.3;
				// fios caídos para as casas em volta (à altura do topo da parede, no ponto mais perto)
				const near = this._lotsNear(p.x, p.z, 11).slice(0, 2 + Math.floor(rng() * 4));
				for (const o of near) {
					const y = Math.max(h + 2.6, this._top(o.l) - 0.4 - rng() * 0.8);
					for (let k = 0; k < 1 + (rng() < 0.4 ? 1 : 0); k++) RoadArt.wire(b, [p.x + (rng() - 0.5) * 0.3, top - rng() * 0.6, p.z + (rng() - 0.5) * 0.3], [o.cx, y, o.cz], 0.4 + rng() * 0.7, WIRE[Math.floor(rng() * WIRE.length)], 0.016, 6);
					st.drops++;
				}
				// rolos e laços no poste
				for (let k = 0; k < 4; k++) { const a = rng() * 6.28, r = 0.35 + rng() * 0.6; RoadArt.wire(b, [p.x, top - 0.2 - rng() * 0.8, p.z], [p.x + Math.cos(a) * r, top - 0.6 - rng() * 0.7, p.z + Math.sin(a) * r], 0.3 + rng() * 0.4, WIRE[k % WIRE.length], 0.016, 4); }
			}
		}
		// fios cruzando os becos: de parede a parede, entre dois barracos dos dois lados
		for (const F of Favelas.built) for (const a of F.alleys) {
			const P = a.pts;
			for (let k = 0; k + 1 < P.length; k++) {
				const p = P[k], q = P[k + 1], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
				for (let s = 2; s < L; s += 9) {
					if (rng() < 0.55) continue;
					const tx = (q[0] - p[0]) / L, tz = (q[1] - p[1]) / L, x = p[0] + tx * s, z = p[1] + tz * s, lx = -tz, lz = tx;
					const A = this._lotsNear(x + lx * 2, z + lz * 2, 3.2)[0], B = this._lotsNear(x - lx * 2, z - lz * 2, 3.2)[0];
					if (!A || !B || A.l === B.l) continue;
					const y = Math.min(this._top(A.l), this._top(B.l)) - 0.5 - rng() * 1.2, b = W._batch('trim', x, z);
					for (let j = 0; j < 1 + Math.floor(rng() * 3); j++) RoadArt.wire(b, [A.cx, y - j * 0.15, A.cz], [B.cx + (rng() - 0.5), y - j * 0.12, B.cz + (rng() - 0.5)], 0.25 + rng() * 0.4, WIRE[Math.floor(rng() * WIRE.length)], 0.014, 5);
					st.across++;
				}
			}
		}
		MeshBatch.anchor = null;
	},

	// ------------------------------------------------------------------ chão: pedras com mato, lixo e entulho
	_ground(W, F, rng, st) {
		const tufts = (x, z, n) => { for (let k = 0; k < n; k++) { const fx = x + (rng() - 0.5) * 1.2, fz = z + (rng() - 0.5) * 1.2; if (!F.walkable || F.walkable(fx, fz)) { this._sprite(W, 'tuft', fx, fz, 0.55 + rng() * 0.45, rng); st.tufts++; } } };
		const stones = (x, z, n) => {
			const b = W._batch('trim', x, z);
			for (let k = 0; k < n; k++) {
				const sx = x + (rng() - 0.5) * 1.4, sz = z + (rng() - 0.5) * 1.4, r = 0.1 + rng() * 0.2, a = rng() * 6.28, g = 0.48 + rng() * 0.18;
				MeshBatch.anchor = null;
				b.obox(sx, sz, Math.cos(a), Math.sin(a), r, r * (0.6 + rng() * 0.4), 0, r * (0.5 + rng() * 0.5), [g, g * 0.96, g * 0.9], r * 0.6, r * 0.45);
				st.stones++;
			}
		};
		const bags = (x, z, n) => {
			const b = W._batch('trim', x, z), C = [[0.08, 0.08, 0.09], [0.1, 0.16, 0.1], [0.12, 0.12, 0.14], [0.2, 0.3, 0.5], [0.85, 0.85, 0.82]];
			for (let k = 0; k < n; k++) {
				const bx = x + (rng() - 0.5) * 1.1, bz = z + (rng() - 0.5) * 1.1, r = 0.2 + rng() * 0.1, c = C[Math.floor(rng() * C.length)], y0 = k > 2 && rng() < 0.5 ? 0.25 : 0;
				b.tube([bx, y0, bz], [bx, y0 + r * 1.1, bz], r * 0.85, r, c, 6);
				b.tube([bx, y0 + r * 1.1, bz], [bx + (rng() - 0.5) * 0.05, y0 + r * 1.75, bz], r, 0.05, c, 6);
				st.bags++;
			}
		};
		const debris = (x, z) => {
			const b = W._batch('trim', x, z);
			for (let k = 0; k < 7; k++) {
				const dx = x + (rng() - 0.5) * 1.6, dz = z + (rng() - 0.5) * 1.6, a = rng() * 6.28, kind = rng();
				if (kind < 0.45) b.obox(dx, dz, Math.cos(a), Math.sin(a), 0.1, 0.05, 0, 0.09, [0.78, 0.4, 0.2]);                    // caco de tijolo
				else if (kind < 0.75) b.obox(dx, dz, Math.cos(a), Math.sin(a), 0.18, 0.1, 0, 0.12, [0.62, 0.6, 0.56]);              // pedaço de bloco
				else b.obox(dx, dz, Math.cos(a), Math.sin(a), 0.6, 0.07, 0.02, 0.05, [0.55, 0.42, 0.28]);                           // tábua
			}
			st.debris++;
		};
		// beiras dos becos (rente às paredes): pedras e mato a cada poucos metros; lixo de vez em quando
		for (const a of F.alleys) {
			const P = a.pts, hw = Math.max(a.w / 2, 0.72);
			for (let k = 0; k + 1 < P.length; k++) {
				const p = P[k], q = P[k + 1], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, tx = (q[0] - p[0]) / L, tz = (q[1] - p[1]) / L;
				for (let s = rng() * 3; s < L; s += 2.6 + rng() * 3) {
					const side = rng() < 0.5 ? -1 : 1, x = p[0] + tx * s - tz * side * (hw - 0.25), z = p[1] + tz * s + tx * side * (hw - 0.25);
					const r = rng();
					if (r < 0.32) { stones(x, z, 2 + Math.floor(rng() * 4)); tufts(x, z, 1 + Math.floor(rng() * 3)); }
					else if (r < 0.62) tufts(x, z, 1 + Math.floor(rng() * 2));
					else if (r < 0.7) bags(x, z, 2 + Math.floor(rng() * 4));
					else if (r < 0.74) debris(x, z);
					else if (r < 0.84) this._sprite(W, ['trash', 'trash', 'debris', 'stain'][Math.floor(rng() * 4)], x, z, 0.5 + rng() * 0.3, rng);
				}
			}
		}
		// beiras das ruas de terra: montes de lixo e entulho, mato, pedras
		const Q = {};
		for (const e of RoadPlan.edges) {
			if (e.cls !== 'fav') continue;
			for (let s = 4 + rng() * 6; s < e.len - 3; s += 5 + rng() * 6) {
				RoadPlan.at(e, s, Q);
				const side = rng() < 0.5 ? -1 : 1, d = e.w / 2 + 0.4 + rng() * 0.7, x = Q.x - Q.tz * side * d, z = Q.z + Q.tx * side * d;
				if (F.walkable && !F.walkable(x, z)) continue;
				if (F.R && (x < F.R.x0 || x > F.R.x1 || z < F.R.z0 || z > F.R.z1)) continue;
				const r = rng();
				if (r < 0.2) bags(x, z, 3 + Math.floor(rng() * 4));
				else if (r < 0.32) debris(x, z);
				else if (r < 0.7) { stones(x, z, 2 + Math.floor(rng() * 3)); tufts(x, z, 2 + Math.floor(rng() * 3)); }
				else tufts(x, z, 1 + Math.floor(rng() * 2));
			}
		}
	},
	_sprite(W, kind, x, z, s, rng) {
		const fr = W.props.pick(kind, rng());
		W._spriteQuad(W._batch('veg_lo', x, z), fr.index, fr.row, x, z, (PropSprites.FRAME / Config.art.ppu) * s, PropSprites.HEIGHT[kind], 0);
	},
};
