// ============================================================================
// ZonaSul — o traçado orgânico da cidade e da ilha, seguindo o esquema da Zona Sul e do Centro (sátira do Rio): ruas que cresceram sem plano.
//   • NORTE da cidade (z > 210 — Santa Treta e arredores): ruas N-S onduladas e travessas curtas DESENCONTRADAS entre elas (cada faixa
//     entre duas ruas tem as suas), cortadas por algumas avenidas leste-oeste que vão da Beira-Mar até a Av. do Contorno.
//   • CENTRO (−210..210): a grade antiga com as diagonais e a praça — fica como era (CityGrid).
//   • SUL da cidade (Botafumo, Capacabana, Ipagrana): a costa vira uma ORLA EM DIAGONAL, da Beira-Mar (z ≈ −210) até a praia do sul; a
//     Av. Atlântida corre por ela com o calçadão e a areia larga até o mar. As ruas acompanham a curva da praia, com travessas
//     desencontradas; a oeste de x = −168 fica a faixa reta do viaduto (Leblão).
//   • ILHA DO DESGOVERNADOR: a Av. Litorânea em volta, uma avenida central de norte a sul (Estrada do Galinhão) e um labirinto de ruas
//     onduladas e travessas desencontradas; as três pontes descem em avenidas que cruzam até a central.
//
// Malha CURVILÍNEA: (u, v) → mundo = ponto da ESPINHA a u ao longo dela + v na normal + um tremido suave do mundo (que some perto das
// bordas retas, para as pontas caírem exatas nelas). Rua longa = v constante com ondulação própria; travessa = u = u0 + incl.·v + curva·v².
// Cruzamentos resolvidos em (u, v), vértice comum às duas ruas (o RoadPlan liga ali). Recorte pelo contorno (CityGrid._clipLine).
// Cada rua leva `line` (RioTraffic: as longas em binário de mão única; as travessas, mão dupla). Determinístico.
// ============================================================================

const ZonaSul = {
	coast: null,          // { F, side } a orla em diagonal do sul da cidade
	isle: null,           // { F } a espinha da ilha

	// ------------------------------------------------------------------ espinha e malha
	_smooth(A, r, n = 2) {
		let a = A;
		for (let k = 0; k < n; k++) a = a.map((_, i) => { let s = 0, c = 0; for (let j = Math.max(0, i - r); j <= Math.min(a.length - 1, i + r); j++) { s += a[j]; c++; } return s / c; });
		return a;
	},
	// Espinha: polilinha [[x, z]...] reamostrada a cada 4 u; side = +1 → v positivo à esquerda de quem anda nela.
	frame(pts, side = 1) {
		const P = RuralRoads._resample(pts, 4), cum = [0];
		for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
		const L = cum[cum.length - 1];
		const at = (u) => {
			let i;
			if (u <= 0) i = 0; else if (u >= L) i = P.length - 2; else { let lo = 0, hi = P.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= u) lo = m; else hi = m; } i = lo; }
			const a = P[i], b = P[i + 1], l = (cum[i + 1] - cum[i]) || 1, t = (u - cum[i]) / l, tx = (b[0] - a[0]) / l, tz = (b[1] - a[1]) / l;
			return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx, tz, nx: -tz * side, nz: tx * side };
		};
		// (x, z) → { u, v } (projeção na espinha; v com o sinal do lado)
		const uv = (x, z) => {
			let bd = Infinity, bu = 0, bv = 0;
			for (let i = 0; i + 1 < P.length; i++) {
				const a = P[i], b = P[i + 1], sx = b[0] - a[0], sz = b[1] - a[1], l2 = sx * sx + sz * sz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * sx + (z - a[1]) * sz) / l2));
				const qx = a[0] + sx * t, qz = a[1] + sz * t, d = hypot(x - qx, z - qz);
				if (d < bd) { bd = d; bu = cum[i] + t * Math.sqrt(l2); const l = Math.sqrt(l2); bv = ((x - qx) * (-sz / l) + (z - qz) * (sx / l)) * side; }
			}
			return { u: bu, v: bv };
		};
		return { P, cum, L, at, uv, side };
	},

	// Gera as ruas. S: { F, warp, seed, fade(u, v, x, z) → 0..1, bound(x, z) (> 0 = fora), O (contorno), district, pv, par, tr, rng }
	//   par: { v, amp, wl, ph, name, cls, dir, gap }        (rua longa: v constante)
	//   tr:  { u0, tilt, bend, from, to, name, cls, dir }  from/to: número (v) | { p: i } (na rua longa i) | { bound: 1 } (até a borda S.bound)
	//        | { pt: [x, z] } (só `to`: vai reto até o ponto exato, sem recorte) ; fromCross / toCross: a ponta é um cruzamento (borda reta)
	grid(P, S) {
		const { F, par, tr } = S;
		const M = (u, v) => {
			const p = F.at(u), x = p.x + p.nx * v, z = p.z + p.nz * v;
			if (!S.warp) return [x, z];
			const k = S.warp * (S.fade ? S.fade(u, v, x, z) : 1);
			if (k <= 0) return [x, z];
			const n = (a, b, s) => WorldMap._fbm(a, b, 2, s) * 2 - 1;
			return [x + k * n(x / 150, z / 150, S.seed), z + k * n(x / 150 + 7.3, z / 150 + 2.9, S.seed + 1)];
		};
		const uT = (T, v) => T.u0 + T.tilt * v + T.bend * v * v / 1e4;
		const vP = (p, u) => p.v + p.amp * Math.sin(u / p.wl + p.ph);
		const X = tr.map((T) => par.map((p) => { let v = p.v; for (let it = 0; it < 14; it++) v = vP(p, uT(T, v)); return { u: uT(T, v), v }; }));
		const bisect = (f, a, b) => { let fa = f(a); for (let it = 0; it < 44; it++) { const m = (a + b) / 2, fm = f(m); if ((fm > 0) === (fa > 0)) { a = m; fa = fm; } else b = m; } return (a + b) / 2; };
		// as pontas de cada travessa
		for (let k = 0; k < tr.length; k++) {
			const T = tr[k], end = (w, dflt) => {
				if (typeof w === 'number') return w;
				if (w && w.p !== undefined) return X[k][w.p].v;
				return dflt;
			};
			T.vA = end(T.from, -30);
			if (T.to && T.to.pt) { let v = T.vA, s = Math.sign(T.toDir || 1); while (Math.abs(v) < 600) { const q = M(uT(T, v), v); if (hypot(q[0] - T.to.pt[0], q[1] - T.to.pt[1]) < 20) break; v += 2 * s; } T.vB = v; }
			else if (T.to && T.to.bound) {
				const s = T.toDir || 1, f = (v) => { const q = M(uT(T, v), v); return S.bound(q[0], q[1]); };
				let v = T.vA; while (f(v) <= 0 && Math.abs(v) < 600) v += 3 * s;
				T.vB = Math.abs(v) < 600 ? bisect(f, v - 3 * s, v) : v;
			} else T.vB = end(T.to, 460);
			T.lo = Math.min(T.vA, T.vB); T.hi = Math.max(T.vA, T.vB);
		}
		let nLines = 0;
		const exists = par.map(() => new Set());
		// ruas longas
		par.forEach((p, i) => {
			const ks = [];
			for (let k = 0; k < tr.length; k++) { const v = X[k][i].v; if (v >= tr[k].lo - 1e-6 && v <= tr[k].hi + 1e-6) ks.push(k); }
			ks.sort((a, b) => X[a][i].u - X[b][i].u);
			if (ks.length < 2) return;
			const pieces = [];
			let cur = [ks[0]];
			for (let j = 0; j + 1 < ks.length; j++) {
				if (p.gap && j > 0 && j + 2 < ks.length && S.rng() < p.gap) { pieces.push(cur); cur = [ks[j + 1]]; continue; }
				cur.push(ks[j + 1]);
			}
			pieces.push(cur);
			const fB = (u) => { const q = M(u, vP(p, u)); return S.bound(q[0], q[1]); };
			pieces.forEach((pc, pi) => {
				if (pc.length < 2 && !(pi === 0 || pi === pieces.length - 1)) return;
				const crossU = new Set(pc.map((k) => X[k][i].u)), extra = new Set();
				let ua = X[pc[0]][i].u, ub = X[pc[pc.length - 1]][i].u;
				// pontas soltas: até a borda reta (cruzamento exato nela) ou até o contorno (o recorte decide)
				const reach = (u0, dir, lim) => {
					if (S.bound && fB(u0) <= 0) { let u = u0; while (fB(u) <= 0 && (dir > 0 ? u < lim : u > lim)) u += 3 * dir; if (fB(u) > 0) { const b = bisect(fB, u - 3 * dir, u); extra.add(b); return b; } return lim; }
					return lim;
				};
				if (pi === 0) ua = p.u0 !== undefined ? p.u0 : reach(ua, -1, -80);
				if (pi === pieces.length - 1) ub = p.u1 !== undefined ? p.u1 : reach(ub, 1, F.L + 80);
				if (p.u0 !== undefined && pi === 0 && p.u0cross) extra.add(p.u0);
				const us = new Set([ua, ub]);
				for (let u = Math.ceil(ua / 6) * 6; u < ub; u += 6) us.add(u);
				for (const u of crossU) if (u >= ua && u <= ub) us.add(u);
				const list = [...us].sort((a, b) => a - b), L = [], cross = new Set();
				list.forEach((u, j) => { L.push(M(u, vP(p, u))); if (crossU.has(u) || extra.has(u)) cross.add(j); });
				for (const k of pc) exists[i].add(k);
				const line = { v: !!S.pv, at: p.v, d: S.district, dir: p.dir };
				for (const q of CityGrid._clipLine(L, cross, S.O)) { P.addPath(q, p.cls, { name: p.name, line }); nLines++; }
			});
		});
		// travessas
		tr.forEach((T, k) => {
			const vs = new Set([T.vA, T.vB]), crossV = new Set();
			for (let v = Math.ceil(T.lo / 6) * 6; v < T.hi; v += 6) vs.add(v);
			par.forEach((p, i) => { const v = X[k][i].v; if (v >= T.lo - 1e-6 && v <= T.hi + 1e-6 && exists[i].has(k)) { vs.add(v); crossV.add(v); } });
			if ((T.from && T.from.p !== undefined) || T.fromCross) crossV.add(T.vA);
			if ((T.to && (T.to.p !== undefined || T.to.bound)) || T.toCross) crossV.add(T.vB);
			let list = [...vs].sort((a, b) => a - b);
			if (T.vB < T.vA) list = list.reverse();                                     // (anda de from para to)
			const L = [], cross = new Set();
			list.forEach((v, j) => { L.push(M(uT(T, v), v)); if (crossV.has(v)) cross.add(j); });
			const line = { v: !S.pv, at: T.conn !== undefined ? T.conn : T.u0, d: S.district, dir: T.dir };
			if (T.to && T.to.pt) { L.push(T.to.pt.slice()); P.addPath(L, T.cls, { name: T.name, line }); nLines++; return; }
			for (const q of CityGrid._clipLine(L, cross, S.O)) { P.addPath(q, T.cls, { name: T.name, line }); nLines++; }
		});
		return nLines;
	},

	// Travessas DESENCONTRADAS: para cada faixa entre duas ruas longas (bands: [{ from, to }] — índices de `par`, ou números), posições
	// sorteadas ao longo de u; umas atravessam 2–3 faixas seguidas. `fixed` = travessas já postas (as avenidas). Cada rua longa guarda os
	// cruzamentos dela (onde a travessa a toca, com a inclinação): uma nova nunca cai a menos de minJog de outro cruzamento na mesma rua
	// (esquina colada = trecho curto demais) — ou bem desencontrada, ou não entra.
	bands(rng, bands, ua, ub, steps, fixed, opt = {}) {
		const vs = opt.vs, vOf = (w) => (typeof w === 'number' ? w : (w && w.p !== undefined ? vs[w.p] : null));
		const uAt = (T, v) => T.u0 + T.tilt * v + T.bend * v * v / 1e4;
		const onPar = vs.map(() => []);                                             // u dos cruzamentos de cada rua longa
		const touch = (T) => { const a = vOf(T.from), b = vOf(T.to), lo = Math.min(a === null ? -1e9 : a, b === null ? 1e9 : b), hi = Math.max(a === null ? -1e9 : a, b === null ? 1e9 : b); const r = []; vs.forEach((v, i) => { if (v >= lo - 1e-6 && v <= hi + 1e-6) r.push(i); }); return r; };
		const ok = (T, gap) => touch(T).every((i) => onPar[i].every((q) => Math.abs(q - uAt(T, vs[i])) >= gap));
		const put = (T) => { for (const i of touch(T)) onPar[i].push(uAt(T, vs[i])); };
		for (const T of fixed) { if (T.tilt === undefined) { T.tilt = 0; T.bend = 0; } if (T.from !== undefined) put(T); }
		const out = [], minGap = opt.minGap || 22, minJog = opt.minJog || 14;
		for (let b = 0; b < bands.length; b++) {
			let u = ua + rng() * steps[0];
			while (u < ub) {
				u += steps[Math.floor(rng() * steps.length)];
				if (u >= ub) break;
				const T = { u0: u, tilt: (rng() * 2 - 1) * (opt.tilt || 0.06), bend: (rng() * 2 - 1) * (opt.bend || 0.15), from: bands[b].from, to: bands[b].to, fromCross: bands[b].fromCross, toCross: bands[b].toCross, toDir: bands[b].dir };
				if (fixed.some((q) => Math.abs(q.u0 - u) < minGap) || !ok(T, minJog)) continue;
				// mesma faixa: espaçamento mínimo dos dois lados
				const same = out.filter((q) => q._b0 <= b && q._b1 >= b);
				if (same.some((q) => Math.abs(uAt(q, vOf(bands[b].from) || 0) - uAt(T, vOf(bands[b].from) || 0)) < minGap || Math.abs(uAt(q, vOf(bands[b].to) || 0) - uAt(T, vOf(bands[b].to) || 0)) < minGap)) continue;
				// atravessa mais faixas?
				let e = b;
				while (e + 1 < bands.length && rng() < (opt.through || 0.3)) {
					const T2 = Object.assign({}, T, { to: bands[e + 1].to, toCross: bands[e + 1].toCross });
					if (!ok(T2, minJog)) break;
					T.to = T2.to; T.toCross = T2.toCross; e++;
				}
				T._b0 = b; T._b1 = e;
				put(T); out.push(T);
			}
		}
		return out;
	},
	// Ponta de uma linha na borda reta: anda de t0 em passos dt até bound(x, z) > 0 e refina. pt(t) → [x, z].
	_edgeHit(pt, bound, t0, dt, lim = 900) {
		let t = t0, q = pt(t);
		if (bound(q[0], q[1]) > 0) return null;
		for (let k = 0; k < lim / Math.abs(dt); k++) { const t2 = t + dt, q2 = pt(t2); if (bound(q2[0], q2[1]) > 0) { let a = t, b = t2; for (let it = 0; it < 40; it++) { const m = (a + b) / 2, qm = pt(m); if (bound(qm[0], qm[1]) > 0) b = m; else a = m; } return { t: a, p: pt(a) }; } t = t2; }
		return null;
	},
	// Ajusta o v de cada rua longa para a ponta dela na borda reta cair EXATAMENTE numa rua da grade vizinha (≤ 12 u: vira a mesma rua,
	// cruzamento inteiro) — nunca colada ao lado. key(p) → a coordenada da ponta que conta (x na borda z = const, z na borda x = const).
	_snapEnds(F, par, ends) {
		for (const p of par) {
			const vP = (v, u) => v + p.amp * Math.sin(u / p.wl + p.ph);
			for (const E of ends) {
				const at = (v) => { const h = this._edgeHit((u) => { const a = F.at(u), vv = vP(v, u); return [a.x + a.nx * vv, a.z + a.nz * vv]; }, E.bound, E.u0(v), E.du); return h ? E.key(h.p) : null; };
				const k0 = at(p.v); if (k0 === null) continue;
				const c = E.lines.find((q) => Math.abs(q - k0) < 12);
				if (c === undefined) continue;
				let a = p.v - 16, b = p.v + 16, ka = at(a), kb = at(b);
				if (ka === null || kb === null || (ka - c) * (kb - c) > 0) continue;
				for (let it = 0; it < 40; it++) { const m = (a + b) / 2, km = at(m); if (km === null) break; if ((km - c) * (ka - c) <= 0) b = m; else { a = m; ka = km; } }
				p.v = (a + b) / 2;
			}
		}
	},
	_par(rng, vs, base) { return vs.map((v, i) => Object.assign({ v, amp: (base.amp || 4) + rng() * (base.ampR || 6), wl: 50 + rng() * 70, ph: rng() * 6.28, cls: base.cls, dir: i % 2 ? -1 : 1, gap: base.gap || 0 }, typeof base.each === 'function' ? base.each(i, v) : null)); },
	_names(list, rng) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } let k = 0; return () => a[k++ % a.length]; },

	// ================================================================== NORTE da cidade
	N_LONG: ['R. Almirante Atrasadinho', 'R. Joaquim Marmita', 'R. Pascoal Carlos Mago', 'R. Monte Alegria', 'R. Hermengarda de Barro', 'R. Áurea Fiado', 'R. do Riacho Seco', 'R. Evaristo da Vaga', 'R. Tailor Suíço', 'R. do Lava-Jato', 'R. dos Encostados', 'R. Nem de Cá'],
	N_SHORT: ['Ladeira do Castigo', 'R. Dias de Barro', 'R. Murtinho Pobre', 'R. Cândido Mentes', 'Ladeira da Santa Treta', 'R. Francisco Muquirana', 'R. Gonçalves Fofoca', 'Travessa do Mosquito', 'R. Leopoldo Frouxo', 'R. Felício dos Tantos', 'R. Sílvio Romeu', 'Ladeira do Meio-Fio', 'R. Ocidente Fiado', 'R. Santa Cristaleira', 'R. Bento Lixoa', 'R. do Calote', 'R. Pedro Amnésico', 'R. Benjamin Inconstante', 'R. Hermenegildo Gil', 'R. Cassiano Cansado'],
	N_AVES: [['Av. Presidente Vagal', 302], ['Av. Mem de Lá', 463], ['Av. Rio Barrento', 635], ['Av. Rodrigo Alvarás', 790]],
	cityNorth(P, CG, Z0 = 210) {
		const rng = Pixel.rng(15650301), XB = 168;
		const F = this.frame([[XB, Z0], [XB, 1400]], 1);                              // espinha: a Beira-Mar; para dentro = oeste
		const fade = (u, v) => Math.max(0, Math.min(1, u / 36, v / 30));
		const vs = []; for (let v = 40 + rng() * 10; v < 470; v += 38 + rng() * 22) vs.push(v);
		const longName = this._names(this.N_LONG, rng), shortName = this._names(this.N_SHORT, rng);
		const par = this._par(rng, vs, { cls: 'city', amp: 3, ampR: 8, gap: 0.12, each: () => ({ name: longName(), u0: 0, u0cross: true }) });
		// (a ponta na rua z = 210: ou na mesma coluna da grade do centro — a rua continua —, ou longe dela)
		const cx = CG.districts.city.xs;
		for (const p of par) { const x0 = XB - (p.v + p.amp * Math.sin(p.ph)), c = cx.find((q) => Math.abs(q - x0) < 12 && q < XB - 20); if (c !== undefined) p.v += x0 - c; }
		// avenidas leste-oeste, da Beira-Mar até o Contorno (longe da cabeceira da ponte norte e da via expressa)
		const aves = this.N_AVES.map(([name, z]) => ({ u0: z - Z0, tilt: 0, bend: 0, from: 0, fromCross: true, to: 520, name, cls: 'ave', dir: 0, fixed: true }));
		const bands = [{ from: 0, to: { p: 0 }, fromCross: true }];
		for (let i = 0; i + 1 < par.length; i++) bands.push({ from: { p: i }, to: { p: i + 1 } });
		bands.push({ from: { p: par.length - 1 }, to: 560 });
		const keep = aves.concat([{ u0: 714 - Z0 }]);
		const tr = this.bands(rng, bands, 18, F.L - 20, [30, 36, 42, 50, 60, 72], keep, { through: 0.32, tilt: 0.07, bend: 0.2, vs: par.map((p) => p.v) }).filter((t) => !(Math.abs(t.u0 - (714 - Z0)) < 34 && t.from === 0));
		for (const t of tr) { t.name = shortName(); t.cls = 'city'; t.dir = 0; }
		tr.push(...aves);
		const n = this.grid(P, { F, warp: 9, seed: 701, fade, O: CG.cityO, district: 'city', pv: true, par, tr, rng });
		console.log(`[ZONA SUL] norte da cidade: ${n} ruas`);
	},

	// ================================================================== SUL da cidade: a orla em diagonal
	// A costa (Botafumo → Capacabana → Ipagrana → Leblão), do esquema: da Beira-Mar descendo em curva até a praia do sul.
	COAST: [[205, -100], [181, -213], [170, -385], [127, -535], [73, -685], [-2, -814], [-120, -921], [-271, -936], [-420, -940]],
	_coastFrame() {
		if (this.coast) return this.coast;
		let pts = this.COAST.map((p) => p.slice());
		for (let k = 0; k < 3; k++) pts = CG_chaikin(pts);
		const F = this.frame(pts, -1);                                                // anda para o sul: para dentro (oeste/norte) é a direita
		return (this.coast = { F });
	},
	// Distância à orla com sinal (+ para dentro da cidade, − para o mar), só no sul (fora: grande).
	coastDist(x, z) {
		if (z > -120 || x > 320 || x < -440) return 999;
		const q = this._coastFrame().F.uv(x, z);
		return q.v;
	},
	// Areia larga entre a Av. Atlântida e o mar
	coastSand(x, z) { return z < -150 && z > -950 && x > -140 && x < 300 && this.coastDist(x, z) < -9; },
	S_LONG: ['R. Barata Rabeira', 'Av. N. S. da Capacabana', 'R. Tonel Velho', 'R. Pompeu Lourinho', 'R. Voluntários da Preguiça', 'R. São Clementino', 'R. Visconde de Piranha', 'R. Prudente de Mortais', 'R. Barão da Torreira', 'R. Humaitá-Tá'],
	S_SHORT: ['R. Siqueira Calmos', 'R. Figueiredo de Mangalhães', 'R. Santa Clareza', 'R. Constante Ramela', 'R. Xavier da Silvestre', 'R. Bolivarzinho', 'R. Souza Lixa', 'R. Miguel Lerdo', 'R. Joaquim Nabico', 'R. Francisco Sei-Lá', 'R. Sá Ferrenha', 'R. Rainha Elisabelha', 'R. Farme de Amoeba', 'R. Vinícius de Mais ou Menos', "R. Garcia d'Ávida", 'R. Maria Quitanda', 'R. Joana Angelical', 'R. Teixeira de Mel', 'R. Belfort Rouco', 'R. Duvideo', 'R. Ronaldo de Carvão', 'R. Hilário de Goiaba', 'R. Dias da Roça', 'R. Paula Feitas', 'R. Fernando Mentes', 'R. Real Pobreza', 'R. General Polidoro Fiado'],
	citySouth(P, CG, XW = -168, ZN = -210) {
		const rng = Pixel.rng(19611004), { F } = this._coastFrame();
		const bound = (x, z) => Math.max(z - ZN, XW - x);                               // fora: ao norte da reta z = −210 ou a oeste de x = −168
		const fade = (u, v, x, z) => Math.max(0, Math.min(1, v / 28, -bound(x, z) / 28));
		const longName = this._names(this.S_LONG, rng), shortName = this._names(this.S_SHORT, rng);
		const vs = []; for (let v = 42 + rng() * 8; v < 330; v += 40 + rng() * 18) vs.push(v);
		const par = this._par(rng, vs, { cls: 'city', amp: 3, ampR: 6, gap: 0.1, each: () => ({ name: longName() }) });
		// pontas nas bordas retas: na rua z = −210 (as colunas do centro chegam nela) e na rua x = −168 (as ruas da faixa do viaduto)
		const cx = CG.districts.city.xs.filter((x) => x > XW && x < 168), czW = CG.districts.city.zs.filter((z) => z < ZN);
		const bZ = (x, z) => z - ZN, bX = (x, z) => XW - x;
		this._snapEnds(F, par, [
			{ bound: bZ, u0: () => F.L * 0.25, du: -3, key: (q) => q[0], lines: cx.concat([XW]) },
			{ bound: bX, u0: () => F.L * 0.5, du: 3, key: (q) => q[1], lines: czW },
		]);
		const bands = [{ from: -30, to: { p: 0 } }];
		for (let i = 0; i + 1 < par.length; i++) bands.push({ from: { p: i }, to: { p: i + 1 } });
		bands.push({ from: { p: par.length - 1 }, to: { bound: 1 } });
		// do mar até a borda (as que atravessam tudo): umas poucas transversais compridas
		// (só no trecho da orla a leste da faixa do viaduto: além de x = −168 a costa é o Leblão, em grade)
		let uMax = F.L; for (let u = 0; u < F.L; u += 4) { const p = F.at(u); if (p.x < XW + 14) { uMax = u; break; } }
		let uMin = 0; for (let u = 0; u < F.L; u += 4) { const p = F.at(u); if (p.z < ZN - 14) { uMin = u; break; } }
		const longT = [];
		for (let u = uMin + 50 + rng() * 40; u < uMax - 40; u += 150 + rng() * 90) longT.push({ u0: u, tilt: 0, bend: 0, from: -30, to: { bound: 1 }, fixed: true });
		// (a travessa nasce dentro da área; e a ponta dela na borda reta não cai colada num cruzamento da grade)
		const nodesZ = cx.concat([XW]), nodesX = czW;
		// pontas já na borda: os cruzamentos da grade e as pontas das ruas longas (a travessa fica a ≥ 20 u de todas — a rua chega oblíqua)
		const bEnds = nodesZ.map((x) => [x, ZN]).concat(nodesX.map((z) => [XW, z]));
		for (const p of par) for (const E of [{ b: (x, z) => z - ZN, u: F.L * 0.25, d: -3 }, { b: (x, z) => XW - x, u: F.L * 0.5, d: 3 }]) {
			const h = this._edgeHit((u) => { const a = F.at(u), vv = p.v + p.amp * Math.sin(u / p.wl + p.ph); return [a.x + a.nx * vv, a.z + a.nz * vv]; }, E.b, E.u, E.d);
			if (h) bEnds.push(h.p);
		}
		const inside = (T) => {
			const p = F.at(T.u0); if (!(bound(p.x, p.z) < -6 && bound(p.x + p.nx * 40, p.z + p.nz * 40) < 0)) return false;
			if (!T.to || !T.to.bound) return true;
			const h = this._edgeHit((v) => { const u = T.u0 + T.tilt * v + T.bend * v * v / 1e4, a = F.at(u); return [a.x + a.nx * v, a.z + a.nz * v]; }, bound, 0, 3, 700);
			if (!h) return true;
			const [x, z] = h.p;
			if (bEnds.some((q) => hypot(q[0] - x, q[1] - z) < 20)) return false;
			bEnds.push([x, z]);
			return true;
		};
		const tr = this.bands(rng, bands, uMin + 16, uMax - 16, [30, 36, 42, 48, 56, 66], longT, { through: 0.35, tilt: 0.06, bend: 0.15, vs: par.map((p) => p.v) }).filter(inside);
		tr.push(...longT.filter(inside));
		for (const t of tr) { t.name = shortName(); t.cls = 'city'; t.dir = 0; }
		const n = this.grid(P, { F, warp: 8, seed: 733, fade, bound, O: CG.cityO, district: 'city', pv: false, par, tr, rng });
		console.log(`[ZONA SUL] Botafumo/Capacabana/Ipagrana: ${n} ruas`);
	},
	inSouth(x, z) { return z < -210 && x > -168 && this.coastDist(x, z) > -4; },

	// ================================================================== ILHA DO DESGOVERNADOR
	I_LONG: ['Estrada do Galinhão', 'R. Cambalhota', 'R. Formosa do Zumbido', 'R. Haroldo Lobão', 'R. Ipiranguinha', 'R. Jacinto Ribeirão', 'R. Magno Martelo', 'R. Uçá-Uçá', 'R. Orestes Barbudo'],
	I_SHORT: ['R. Capitão Barbudo', 'R. Cardeal Camarão', 'R. Malandrado', 'R. Aracajuba', 'R. Colina Torta', 'R. Ilha das Pulgas', 'R. Itaoquinha', 'R. Guarabu-Bu', 'R. Freguesia Fiada', 'R. Engenho Velhaco', 'R. Pracinha Sem Praça', 'R. Bananal', 'R. Cocotó', 'R. Tauá-Tauá', 'R. Ribeirinha', 'R. Zumbido', 'R. Monerô', 'R. Jardim Guanaburro', 'R. Portuguesinha', 'R. Pitangueiras'],
	ISLE_AVES: ['Av. Paranapuxa', 'Estrada do Cacunda', 'Av. Maestro Paulo e Silvio'],
	governador(P, CG, O, bridges) {
		const rng = Pixel.rng(19520120);
		// espinha: o meio da ilha, de sul a norte; v positivo para o oeste (as pontes)
		const zs = [], xs = [];
		for (let z = -880; z <= 960; z += 12) {
			let a = null, b = null;
			for (let x = 340; x < 900; x += 4) if (CG._oIn(O, x, z)) { if (a === null) a = x; b = x; }
			if (a !== null) { zs.push(z); xs.push((a + b) / 2); }
		}
		const sx = this._smooth(xs, 8, 3);
		const F = this.frame(zs.map((z, i) => [sx[i], z]), 1);
		this.isle = { F };
		const uAt = (z) => { let best = 0, bd = Infinity; for (let i = 0; i < F.P.length; i++) { const d = Math.abs(F.P[i][1] - z); if (d < bd) { bd = d; best = F.cum[i]; } } return best; };
		const vs = [-140, -96, -50, 0, 46, 92, 138].map((v) => v + (v ? (rng() - 0.5) * 10 : 0));
		const longName = this._names(this.I_LONG.slice(1), rng), shortName = this._names(this.I_SHORT, rng);
		const ic = vs.indexOf(0);
		const par = this._par(rng, vs, { cls: 'isl', amp: 4, ampR: 8, gap: 0.15, each: (i, v) => (v === 0 ? { name: this.I_LONG[0], cls: 'ave', dir: 0, gap: 0, amp: 3, ampR: 0 } : { name: longName() }) });
		// as pontes: da cabeceira (na Litorânea, a oeste) até a avenida central
		const br = Object.keys(bridges).map(Number).sort((a, b) => b - a).map((z, i) => ({ u0: uAt(z), tilt: 0, bend: 0, from: { p: ic }, to: { pt: [bridges[z], z] }, toDir: 1, fixed: true, name: this.ISLE_AVES[i] || 'Av. da Ponte', cls: 'ave', dir: 0 }));
		const bands = [{ from: { p: 0 }, to: -460, dir: -1 }];
		for (let i = 0; i + 1 < par.length; i++) bands.push({ from: { p: i }, to: { p: i + 1 } });
		bands.push({ from: { p: par.length - 1 }, to: 460 });
		const tr = this.bands(rng, bands, 10, F.L - 10, [26, 30, 36, 42, 50, 58], br, { through: 0.28, tilt: 0.07, bend: 0.2, minGap: 20, vs: par.map((p) => p.v) });
		for (const t of tr) { t.name = shortName(); t.cls = 'isl'; t.dir = 0; }
		tr.push(...br);
		const n = this.grid(P, { F, warp: 10, seed: 761, fade: (u, v, x, z) => Math.min(1, Math.abs(v) / 20 + 0.0), O, district: 'island', pv: true, par, tr, rng });
		console.log(`[ZONA SUL] Ilha do Desgovernador: ${n} ruas`);
	},
	isleDepth(x, z) { return this.isle ? Math.abs(this.isle.F.uv(x, z).v) : null; },

	// Depois do RoadPlan.build: a orla em diagonal ganha os nomes (Atlântida, Vieira Sujo, Golfinho Moreira).
	names() {
		if (!this.coast) return;
		const F = this.coast.F;
		for (const e of RoadPlan.edges) {
			if (!e.free || e.name !== 'Av. do Contorno') continue;
			const m = RoadPlan.at(e, e.len / 2);
			if (m.z > -120 || Math.abs(this.coastDist(m.x, m.z)) > 22) continue;
			const u = F.uv(m.x, m.z).u / F.L;
			e.name = u < 0.62 ? 'Av. Atlântida' : m.x > -200 ? 'Av. Vieira Sujo' : 'Av. Golfinho Moreira';
		}
	},
	BEACH_AVES: new Set(['Av. do Contorno', 'Av. Vieira Sujo', 'Av. Golfinho Moreira', 'Av. Atlântida']),
};

function CG_chaikin(P) {
	const out = [P[0]];
	for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1]; out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
	out.push(P[P.length - 1]);
	return out;
}
