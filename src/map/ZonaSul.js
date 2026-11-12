// ============================================================================
// ZonaSul — o traçado dos bairros de praia no jeito da Zona Sul do Rio (não planejado, crescido ao longo da orla):
//   • COPACABANA, na ilha: a AV. ATLÂNTICA numa curva lisa a ~100 u do mar (areia larga, calçadão de ondas, quiosques), as ruas
//     PARALELAS à praia acompanhando a curva (N. S. de Copacabana, Barata Ribeiro, Tonelero, Pompeu Loureiro) e as TRANSVERSAIS do mar
//     para o morro, em espaçamentos desiguais, um pouco tortas, umas que morrem numa paralela, paralelas interrompidas; três
//     transversais largas (mão dupla) ligam as pontes à praia.
//   • IPANEMA / LEBLON, no sul da cidade: a orla (Av. Vieira Souto / Delfim Moreira — o trecho da Av. do Contorno na praia), as
//     paralelas (Prudente de Morais, Visconde de Pirajá — a principal, de mão dupla —, Barão da Torre) e as transversais do mar para a
//     Lagoa, desencontradas da grade de cima; a ponta oeste (o Leblon) acaba no MORRO DO MIRANTE, como o Leblon no Vidigal.
//
// Malha CURVILÍNEA: (u, v) → mundo = ponto da ESPINHA (a curva da praia) a u ao longo dela + v para dentro (a normal) + um tremido
// suave do mundo. Paralela = v constante com uma ondulação própria; transversal = u = u0 + inclinação·v + curva·v². Os cruzamentos são
// resolvidos em (u, v) e entram como VÉRTICE nas duas linhas (o mesmo ponto: o RoadPlan liga as duas ali). As linhas são recortadas
// pelo contorno do bairro (CityGrid._clipLine). Cada uma leva `line` (sentido da mão única: RioTraffic) e o nome.
// Determinístico (Pixel.rng).
// ============================================================================

const ZonaSul = {
	copa: null,          // { frame, xe: (z) => x da Atlântica } — areia, biomas, calçadão
	ipa: null,           // { frame, zA }

	// ------------------------------------------------------------------ espinha e malha
	_smooth(A, r, n = 2) {
		let a = A;
		for (let k = 0; k < n; k++) a = a.map((_, i) => { let s = 0, c = 0; for (let j = Math.max(0, i - r); j <= Math.min(a.length - 1, i + r); j++) { s += a[j]; c++; } return s / c; });
		return a;
	},
	// Espinha: polilinha [[x, z]...] reamostrada a cada 4 u; side = +1 → "para dentro" é a esquerda de quem anda nela.
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
		return { P, cum, L, at };
	},
	// (u, v) → [x, z], com o tremido do mundo (o mesmo para todas as linhas: os cruzamentos continuam no lugar)
	_map(F, u, v, warp, seed) {
		const p = F.at(u), x = p.x + p.nx * v, z = p.z + p.nz * v;
		if (!warp) return [x, z];
		const n = (a, b, s) => WorldMap._fbm(a, b, 2, s) * 2 - 1;
		return [x + warp * n(x / 160, z / 160, seed), z + warp * n(x / 160 + 7.3, z / 160 + 2.9, seed + 1)];
	},

	// Gera as linhas. spec: { F, warp, seed, O, district, pv (paralelas são linhas N-S?), par: [...], tr: [...], rng }
	//   paralela: { v, amp, wl, ph, name, cls, dir, gap (chance de um trecho faltar), endX (termina exatamente em x = endX) }
	//   transversal: { u0, tilt, bend, from, to, name, cls, dir } — from/to: número (v), { p: i } (no cruzamento com a paralela i),
	//   { z: Z } (até a reta z = Z), { pt: [x, z] } (até o ponto exato, sem recorte)
	grid(P, S) {
		const { F, par, tr } = S, M = (u, v) => this._map(F, u, v, S.warp, S.seed);
		const uT = (T, v) => T.u0 + T.tilt * v + T.bend * v * v / 1e4;
		const vP = (p, u) => p.v + p.amp * Math.sin(u / p.wl + p.ph);
		// cruzamentos (u, v) de cada transversal com cada paralela
		const X = tr.map((T) => par.map((p) => { let v = p.v; for (let it = 0; it < 12; it++) v = vP(p, uT(T, v)); return { u: uT(T, v), v }; }));
		const vOf = (T, k, w, fallback) => {
			if (typeof w === 'number') return w;
			if (w && w.p !== undefined) return X[k][w.p].v;
			if (w && w.z !== undefined) { let a = 0, b = 420; for (let it = 0; it < 40; it++) { const m = (a + b) / 2; if ((M(uT(T, m), m)[1] - w.z) * (M(uT(T, a), a)[1] - w.z) <= 0) b = m; else a = m; } return (a + b) / 2; }
			return fallback;
		};
		for (let k = 0; k < tr.length; k++) {
			const T = tr[k]; T.vA = vOf(T, k, T.from, -30); T.vB = T.to && T.to.pt ? null : vOf(T, k, T.to, 460);
			if (T.vB === null) { let v = T.vA; while (v < 460) { const q = M(uT(T, v), v); if (hypot(q[0] - T.to.pt[0], q[1] - T.to.pt[1]) < 22) break; v += 2; } T.vEnd = v; }      // (até perto do ponto; o último trecho vai reto nele)
		}
		// paralelas: trechos entre transversais que chegam nelas (algumas faltam: rua interrompida)
		const exists = par.map(() => new Set());                                   // k das transversais em que a paralela tem cruzamento
		let nLines = 0;
		par.forEach((p, i) => {
			const ks = [];
			for (let k = 0; k < tr.length; k++) { const T = tr[k], v = X[k][i].v; if (v >= T.vA - 1e-6 && (T.vB === null ? v < T.vEnd : v <= T.vB + 1e-6)) ks.push(k); }
			ks.sort((a, b) => X[a][i].u - X[b][i].u);
			if (ks.length < 2) return;
			const pieces = [];
			let cur = [ks[0]];
			for (let j = 0; j + 1 < ks.length; j++) {
				if (p.gap && j > 0 && j + 2 < ks.length && S.rng() < p.gap) { pieces.push(cur); cur = [ks[j + 1]]; continue; }
				cur.push(ks[j + 1]);
			}
			pieces.push(cur);
			pieces.forEach((pc, pi) => {
				if (pc.length < 2 && !(pi === 0 || pi === pieces.length - 1)) return;
				const us = new Set(), crossU = new Set(pc.map((k) => X[k][i].u));
				let ua = X[pc[0]][i].u, ub = X[pc[pc.length - 1]][i].u;
				if (pi === 0) ua = (p.u0 !== undefined ? p.u0 : -60);                      // (as pontas vão até o contorno: o recorte decide)
				if (pi === pieces.length - 1) ub = (p.u1 !== undefined ? p.u1 : F.L + 60);
				let endU = null;
				if (p.endX !== undefined && pi === pieces.length - 1) {                 // termina exatamente na reta x = endX (a Beira-Mar)
					let a = X[pc[pc.length - 1]][i].u, b = ub;
					if ((M(a, vP(p, a))[0] - p.endX) * (M(b, vP(p, b))[0] - p.endX) <= 0) { for (let it = 0; it < 40; it++) { const m = (a + b) / 2; if ((M(m, vP(p, m))[0] - p.endX) * (M(a, vP(p, a))[0] - p.endX) <= 0) b = m; else a = m; } endU = (a + b) / 2; ub = endU; }
				}
				for (let u = Math.ceil(ua / 6) * 6; u < ub; u += 6) us.add(u);
				us.add(ua); us.add(ub); for (const u of crossU) if (u >= ua && u <= ub) us.add(u);
				const list = [...us].sort((a, b) => a - b), L = [], cross = new Set();
				list.forEach((u, j) => { L.push(M(u, vP(p, u))); if (crossU.has(u) || u === endU) cross.add(j); });
				for (const k of pc) exists[i].add(k);
				const line = { v: !!S.pv, at: p.v, d: S.district, dir: p.dir };
				for (const q of CityGrid._clipLine(L, cross, S.O)) { P.addPath(q, p.cls, { name: p.name, line }); nLines++; }
			});
		});
		// transversais
		tr.forEach((T, k) => {
			const vs = new Set(), crossV = new Set();
			const vEnd = T.vB === null ? T.vEnd : T.vB;
			for (let v = Math.ceil(T.vA / 6) * 6; v < vEnd; v += 6) vs.add(v);
			vs.add(T.vA); vs.add(vEnd);
			par.forEach((p, i) => { const v = X[k][i].v; if (v >= T.vA - 1e-6 && v <= vEnd + 1e-6 && exists[i].has(k)) { vs.add(v); crossV.add(v); } });
			if (typeof T.to === 'object' && T.to && T.to.z !== undefined) crossV.add(vEnd);
			if (typeof T.from === 'object' && T.from && T.from.p !== undefined) crossV.add(T.vA);
			const list = [...vs].sort((a, b) => a - b), L = [], cross = new Set();
			list.forEach((v, j) => { L.push(M(uT(T, v), v)); if (crossV.has(v)) cross.add(j); });
			const line = { v: !S.pv, at: T.conn !== undefined ? T.conn : T.u0, d: S.district, dir: T.dir };      // (emenda da grade de cima: a mão dela)
			if (T.to && T.to.pt) { L.push(T.to.pt.slice()); P.addPath(L, T.cls, { name: T.name, line }); nLines++; return; }
			for (const q of CityGrid._clipLine(L, cross, S.O)) { P.addPath(q, T.cls, { name: T.name, line }); nLines++; }
		});
		return nLines;
	},
	// Espaçamentos irregulares de transversais em [a, b] (u), longe dos `keep` (as das pontes); inclinações que nunca deixam duas se cruzarem.
	_spacing(rng, a, b, steps, keep, vMax) {
		const out = [];
		let u = a;
		while (u < b) {
			u += steps[Math.floor(rng() * steps.length)];
			if (u >= b) break;
			if (keep.some((q) => Math.abs(q - u) < 26)) continue;
			out.push(u);
		}
		return out.sort((p, q) => p - q);
	},
	_tilts(list, rng, vMax, maxTilt, minGap) {
		// list: [{u0, fixed?}] ordenadas; escolhe tilt/bend para que vizinhas fiquem ≥ minGap em todo v ∈ [−40, vMax]
		const f = (T, v) => T.u0 + T.tilt * v + T.bend * v * v / 1e4;
		for (let i = 0; i < list.length; i++) {
			const T = list[i];
			if (T.fixed) { T.tilt = T.tilt || 0; T.bend = T.bend || 0; continue; }
			for (let tries = 0; tries < 12; tries++) {
				T.tilt = (rng() * 2 - 1) * maxTilt * (1 - tries / 12); T.bend = (rng() * 2 - 1) * 0.35 * (1 - tries / 12);
				const prev = list[i - 1], next = list[i + 1];
				let ok = true;
				for (let v = -40; v <= vMax && ok; v += 20) {
					if (prev && f(T, v) - f(prev, v) < minGap) ok = false;
					if (next && next.fixed && f(next, v) - f(T, v) < minGap) ok = false;
				}
				if (ok) break;
				T.tilt = 0; T.bend = 0;
			}
		}
	},

	// ================================================================== COPACABANA (ilha)
	COPA_BEACH: 100,                 // da água à Atlântica (u)
	COPA_PAR: [
		{ v: 50, name: 'Av. N. S. de Copacabana', dir: -1 },
		{ v: 100, name: 'R. Barata Ribeiro', dir: 1, gap: 0.08 },
		{ v: 150, name: 'R. Tonelero', dir: -1, gap: 0.22 },
		{ v: 198, name: 'R. Pompeu Loureiro', dir: 1, gap: 0.3 },
	],
	COPA_TR: ['Av. Princesa Isabel', 'R. Gustavo Sampaio', 'R. Duvivier', 'R. Ronald de Carvalho', 'Av. Prado Júnior', 'R. Belfort Roxo', 'R. Fernando Mendes',
		'R. Barão de Ipanema', 'R. Hilário de Gouveia', 'R. Siqueira Campos', 'R. Figueiredo de Magalhães', 'R. Santa Clara', 'R. Constante Ramos', 'R. Dias da Rocha',
		'R. Xavier da Silveira', 'R. Bolívar', 'R. Domingos Ferreira', 'R. Souza Lima', 'R. Miguel Lemos', 'R. Barão de Ipanema 2', 'R. Joaquim Nabuco', 'R. Francisco Sá',
		'R. Sá Ferreira', 'R. Júlio de Castilhos', 'R. Rainha Elizabeth', 'R. Conselheiro Lafaiete', 'R. Raul Pompéia', 'R. Francisco Otaviano', 'R. Aires de Saldanha',
		'R. Leopoldo Miguez', 'R. Pompeu Loureiro 2', 'R. Anita Garibaldi', 'R. Inhangá', 'R. Rodolfo Dantas', 'R. República do Peru', 'R. Paula Freitas'],
	COPA_AVES: ['Av. Princesa Isabel', 'R. Figueiredo de Magalhães', 'R. Francisco Sá'],     // (as das pontes, de norte a sul — nomes)

	// x da Atlântica na altura z (curva lisa a COPA_BEACH u da água, pelo leste)
	_copaXe(z0, z1) {
		const zs = [], xs = [];
		for (let z = z0; z <= z1; z += 12) {
			let x = 600; while (x < 960 && WorldMap.isLand(x, z)) x += 4;
			zs.push(z); xs.push(x - this.COPA_BEACH);
		}
		const sm = this._smooth(xs, 9, 3);
		return { zs, xs: sm, at(z) { const t = (z - z0) / 12, i = Math.max(0, Math.min(sm.length - 2, Math.floor(t))), f = Math.max(0, Math.min(1, t - i)); return sm[i] + (sm[i + 1] - sm[i]) * f; } };
	},
	// Campo do contorno da ilha (CityGrid._islandPlan): além do de sempre, a Atlântica pelo leste.
	copaField(fOrig) {
		const XE = this._xe || (this._xe = this._copaXe(-1000, 1100));
		return (x, z) => Math.min(fOrig(x, z), XE.at(z) - x);
	},
	copacabana(P, CG, O, bridges) {
		const XE = this._xe || (this._xe = this._copaXe(-1000, 1100)), rng = Pixel.rng(20240611);
		// espinha: a Atlântica de sul a norte; para dentro = oeste (à esquerda de quem anda para o norte)
		const sp = []; for (let z = -900; z <= 1000; z += 12) sp.push([XE.at(z), z]);
		const F = this.frame(sp, 1);
		this.copa = { F, XE };
		const uAt = (z) => { let best = 0, bd = Infinity; for (let i = 0; i < F.P.length; i++) { const d = Math.abs(F.P[i][1] - z); if (d < bd) { bd = d; best = F.cum[i]; } } return best; };
		// transversais: as 3 das pontes (fixas, retas até a cabeceira) e as outras em passos desiguais
		const fixed = Object.keys(bridges).map(Number).sort((a, b) => b - a).map((z, i) => ({ u0: uAt(z), fixed: true, tilt: 0, bend: 0, name: this.COPA_AVES[i] || 'Av. da Ponte', cls: 'ave', dir: 0, from: -12, to: { pt: [bridges[z], z] } }));
		const us = this._spacing(rng, 30, F.L - 30, [28, 32, 36, 40, 46, 52, 60, 70], fixed.map((t) => t.u0), 300);
		const tr = us.map((u0) => ({ u0 })).concat(fixed).sort((a, b) => a.u0 - b.u0);
		this._tilts(tr, rng, 300, 0.1, 18);
		let ni = 0, dir = 1;
		const names = this.COPA_TR.filter((n) => !this.COPA_AVES.includes(n));
		for (const T of tr.slice().reverse()) {                                           // (nomes de norte — o Leme — para sul)
			if (T.fixed) continue;
			T.name = names[ni++ % names.length]; T.cls = 'isl'; T.dir = (dir = -dir);
			const r = rng();
			T.from = -30;
			// umas morrem numa paralela (T), outras vão de uma paralela à outra (travessa), a maioria atravessa até o morro
			T.to = r < 0.18 ? { p: 1 } : r < 0.3 ? { p: 2 } : 460;
			if (r > 0.92) { T.from = { p: 0 }; T.to = { p: 2 }; T.name = 'Travessa ' + T.name.replace(/^(R\.|Av\.) /, ''); }
		}
		const par = this.COPA_PAR.map((p, i) => Object.assign({ amp: 2 + rng() * 4, wl: 70 + rng() * 60, ph: rng() * 6.28, cls: 'isl' }, p));
		const n = this.grid(P, { F, warp: 5, seed: 551, O, district: 'island', pv: true, par, tr, rng });
		console.log(`[ZONA SUL] Copacabana: ${n} ruas (${tr.length} transversais, ${par.length} paralelas)`);
	},
	// Distância (u) da Atlântica para dentro, na altura z (biomas da ilha); null fora.
	copaDepth(x, z) { return this.copa ? this.copa.XE.at(z) - x : null; },
	// Areia larga entre a Atlântica e o mar (WorldMap: bioma)
	copaSand(x, z) { return !!this.copa && x > 300 && z > -900 && z < 1000 && x > this.copa.XE.at(z) + 9; },

	// ================================================================== IPANEMA / LEBLON (sul da cidade)
	IPA_PAR: [
		{ v: 46, name: 'R. Prudente de Morais', dir: 1, cls: 'city', gap: 0.1 },
		{ v: 96, name: 'R. Visconde de Pirajá', dir: 0, cls: 'ave' },
		{ v: 146, name: 'R. Barão da Torre', dir: -1, cls: 'city', gap: 0.2 },
	],
	IPA_TR: ['Av. Bartolomeu Mitre', 'R. Rainha Guilhermina', 'R. Aristides Espínola', 'R. José Linhares', 'R. Almirante Guilhem', 'Av. Afrânio de Melo Franco',
		'R. Venâncio Flores', 'R. Garcia d\'Ávila', 'R. Aníbal de Mendonça', 'R. Maria Quitéria', 'R. Joana Angélica', 'R. Vinícius de Moraes', 'R. Farme de Amoedo',
		'R. Teixeira de Melo', 'R. Gomes Carneiro', 'R. Francisco Otaviano', 'R. Jangadeiros'],
	// cx: as linhas N-S da grade de cima (as transversais que terminam perto delas emendam reto); zA: a reta onde a grade de cima começa
	ipanema(P, CG, zA, cx, xv) {
		const rng = Pixel.rng(19650301), cp = CG.cityPath;
		// espinha: a orla (o trecho sul da Av. do Contorno), alisada, de oeste para leste; para dentro = norte (esquerda)
		// (a orla de Ipanema é quase reta: a espinha é a RETA que melhor passa pela praia — a curva do Contorno no Leblon não entorta as ruas)
		let nP = 0, sx = 0, sz = 0, sxx = 0, sxz = 0;
		for (let x = -130; x <= 160; x += 10) {
			let z = null;
			for (let i = 0; i + 1 < cp.length; i++) { const a = cp[i], b = cp[i + 1]; if ((a[0] - x) * (b[0] - x) > 0 || a[1] > -800 || b[1] > -800) continue; const zz = a[1] + (b[1] - a[1]) * ((x - a[0]) / ((b[0] - a[0]) || 1)); if (z === null || zz < z) z = zz; }
			if (z === null) continue;
			nP++; sx += x; sz += z; sxx += x * x; sxz += x * z;
		}
		const k = nP > 2 ? (nP * sxz - sx * sz) / (nP * sxx - sx * sx) : 0, z0 = nP ? (sz - k * sx) / nP : -930;
		const F = this.frame([[-340, z0 - 340 * k], [240, z0 + 240 * k]], 1);
		this.ipa = { F, zA };
		// transversais: do mar até a reta zA (emendam na grade de cima); passos desiguais
		const us = this._spacing(rng, 46, F.L - 132, [28, 32, 36, 40, 46, 52, 58], [], 220);
		const tr = us.map((u0) => ({ u0 }));
		this._tilts(tr, rng, 220, 0.08, 20);
		let dir = 1;
		tr.forEach((T, i) => {
			T.name = this.IPA_TR[i % this.IPA_TR.length]; T.cls = 'city'; T.dir = (dir = -dir); T.from = -30;
			const r = rng();
			T.to = r < 0.15 ? { p: 1 } : { p: 2 };                                       // (do mar até a Barão da Torre — ou só até a Pirajá)
		});
		// A GRADE DE CIMA desce até a Barão da Torre (as linhas N-S dela, retas, emendam ali): as duas malhas se encontram nessa rua com
		// esquinas desencontradas. Transversal de Ipanema que chega a menos de 14 u de uma delas segue reto até ela (vira a mesma rua).
		const p0 = F.at(0), conn = [];
		for (const c of cx) {
			if (c > 110 || Math.abs(c - xv) < 18) continue;
			conn.push({ u0: (c - p0.x) / p0.tx, tilt: -p0.nx / p0.tx, bend: 0, fixed: true, conn: c, from: { p: 2 }, to: { z: zA }, name: CG._gridName(true, c), cls: 'city' });
		}
		const M = (u, v) => this._map(F, u, v, 0, 0), vP2 = this.IPA_PAR[2].v;
		for (const T of tr) {
			if (!T.to || T.to.p !== 2) continue;
			const end = M(T.u0 + T.tilt * vP2 + T.bend * vP2 * vP2 / 1e4, vP2)[0];
			const C = conn.find((q) => Math.abs(q.conn - end) < 14);
			if (!C) continue;
			const c = C.conn, t = { x: p0.tx, z: p0.tz }, nn = { x: p0.nx, z: p0.nz };     // (espinha reta: (u, v) → mundo é afim)
			const rx = c - p0.x, rz = zA - p0.z, det = t.x * nn.z - t.z * nn.x, U = (rx * nn.z - rz * nn.x) / det, V = (t.x * rz - t.z * rx) / det;
			const tilt = (U - T.u0) / V, i = tr.indexOf(T), f = (Q, v) => Q.u0 + Q.tilt * v + Q.bend * v * v / 1e4, old = [T.tilt, T.bend];
			T.tilt = tilt; T.bend = 0;
			let ok = Math.abs(tilt) < 0.2;
			for (let v = -40; v <= V && ok; v += 10) { if (tr[i - 1] && f(T, v) - f(tr[i - 1], v) < 16) ok = false; if (tr[i + 1] && f(tr[i + 1], v) - f(T, v) < 16) ok = false; }
			if (!ok) { [T.tilt, T.bend] = old; conn.splice(conn.indexOf(C), 1); continue; }        // (não dá para emendar: a linha de cima para na reta)
			T.to = { z: zA }; T.conn = c; T.dir = undefined; T.name = C.name; conn.splice(conn.indexOf(C), 1);      // (a mesma rua: o nome e a mão da de cima)
		}
		tr.push(...conn);
		tr.sort((a, b) => a.u0 - b.u0);
		const par = this.IPA_PAR.map((p) => Object.assign({ amp: 1.5 + rng() * 3, wl: 60 + rng() * 50, ph: rng() * 6.28, endX: 168 }, p));
		const n = this.grid(P, { F, warp: 0, seed: 0, O: CG.cityO, district: 'city', pv: false, par, tr, rng });
		console.log(`[ZONA SUL] Ipanema/Leblon: ${n} ruas (${tr.length} transversais)`);
	},
	inIpanema(x, z) { return !!this.ipa && z < this.ipa.zA && x < 126 && x > -300; },
	ipaDepth(x, z) {
		if (!this.ipa) return null;
		const F = this.ipa.F; let best = 0, bd = Infinity;
		for (let i = 0; i < F.P.length; i += 2) { const d = Math.abs(F.P[i][0] - x); if (d < bd) { bd = d; best = F.P[i][1]; } }
		return z - best;
	},

	// Depois do RoadPlan.build: os nomes das orlas (o trecho da Av. Litorânea na praia de Copacabana; o da Av. do Contorno na de Ipanema
	// e no Leblon).
	names() {
		for (const e of RoadPlan.edges) {
			if (!e.free || !e.name) continue;
			const m = RoadPlan.at(e, e.len / 2);
			if (e.name === 'Av. Litorânea' && this.copa && m.x > this.copa.XE.at(m.z) - 14) e.name = 'Av. Atlântica';
			else if (e.name === 'Av. do Contorno' && m.z < -860 && m.x > -140 && m.x < 170) e.name = m.x < -40 ? 'Av. Delfim Moreira' : 'Av. Vieira Souto';
		}
	},
	// as avenidas da orla com calçadão (Landmarks)
	BEACH_AVES: new Set(['Av. do Contorno', 'Av. Vieira Souto', 'Av. Delfim Moreira', 'Av. Atlântica']),
};
