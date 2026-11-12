// ============================================================================
// RioTraffic — as REGRAS de circulação da cidade, no jeito do Rio de Janeiro (estudo: docs/transito-rio.md).
//
//   • HIERARQUIA: avenidas (canteiro central), a Beira-Mar, as diagonais, a via expressa, as pontes e as rodovias são de MÃO DUPLA e
//     levam o grosso do fluxo; as ruas LOCAIS da grade (cidade e ilha) são de MÃO ÚNICA em BINÁRIOS — ruas paralelas vizinhas em
//     sentidos opostos (como Barata Ribeiro × N. S. de Copacabana, ou as transversais da Tijuca). Favela e estradas: mão dupla.
//   • SEM ESQUERDA SAINDO DA AVENIDA: quem vem pela avenida de canteiro não converte à esquerda para uma rua local — vira à direita e
//     contorna a quadra (ou usa o retorno). Avenida × avenida continua liberada.
//   • VIAGENS COM DESTINO: cada carro civil vai para algum lugar (rota de menor tempo: as avenidas rendem mais que as ruas), em vez de
//     sortear a manobra em cada esquina. PICO PENDULAR: de manhã (6h30–10h) a maioria vai para o CENTRO; no fim da tarde (16h30–20h)
//     volta para os BAIRROS e a ilha; de madrugada o trânsito rareia (densityMul).
//   • GARANTIA: depois de dar a mão às ruas, a malha é conferida como um grafo de ESTADOS (trecho, sentido) com as manobras válidas —
//     todo estado precisa alcançar todos os outros (componente fortemente conexa). Rua que isolaria alguém volta a ser de mão dupla (e o
//     cruzamento dela libera a esquerda): nenhum carro fica preso num beco de mão única.
//
// Aplicado em CityGrid._makePlan, logo depois do RoadPlan.build. Config.traffic.rio = false desliga tudo (mão dupla e manobra sorteada).
// API: canLeave(e, n) · allowed(inter, inA, outA, turn) · trip(e, fwd, x, z) · densityMul() · stats
// ============================================================================

const RioTraffic = {
	ONEWAY_CLS: new Set(['city', 'isl']),
	// tempo relativo por unidade de comprimento (rota de menor TEMPO): avenida e rodovia rendem; favela e terra, não
	SPEED: { hwy: 1.8, via: 1.8, bridge: 1.5, ave: 1.6, serra: 1.0, city: 1.0, isl: 1.0, fav: 0.55, dirt: 0.65, trail: 0.25 },
	TURN_COST: { straight: 0, right: 4, left: 9, uturn: 24 },
	stats: null,

	get on() { return !(Config.traffic && Config.traffic.rio === false); },

	// ------------------------------------------------------------------ mão das ruas
	// e.oneway: 0 = mão dupla; +1 = só de a para b; -1 = só de b para a.
	assign(D) {
		const t0 = performance.now(), P = RoadPlan;
		for (const e of P.edges) e.oneway = 0;
		for (const n of P.nodes) n.leftOk = false;
		this._baseComp = null;
		if (!this.on) { this.stats = { oneway: 0 }; return; }
		// a posição de cada linha na lista do distrito: par = sentido +, ímpar = sentido − (vizinhas sempre opostas: binário)
		const idx = {};
		const put = (d, v, list) => { const m = new Map(); [...list].sort((a, b) => a - b).forEach((c, i) => m.set(c, i)); idx[d + (v ? 'V' : 'H')] = m; };
		if (D && D.city) { put('city', true, D.city.xs); put('city', false, D.city.zs); }
		if (D && D.island) { put('island', true, D.island.xs); put('island', false, D.island.zs); }
		let n1 = 0;
		for (const e of P.edges) {
			if (!this.ONEWAY_CLS.has(e.cls) || e.layer) continue;
			let v, at, d;
			if (e.line) { v = e.line.v; at = e.line.at; d = e.line.d; }
			else if (!e.free) { v = e.v; at = e.v ? e.a.x : e.a.z; d = e.cls === 'isl' ? 'island' : 'city'; }
			else continue;
			const m = idx[d + (v ? 'V' : 'H')], i = m && m.get(at);
			if (i === undefined) continue;
			const sign = i % 2 === 0 ? 1 : -1;                                   // + = norte (linha N-S) | leste (linha L-O)
			const along = v ? e.b.z - e.a.z : e.b.x - e.a.x;
			if (Math.abs(along) < 1) continue;
			e.oneway = sign * Math.sign(along);
			n1++;
		}
		// conferência: nenhum estado (trecho, sentido) pode ficar fora da componente principal da sua região
		const base = this._scc(false), rounds = [];
		for (let it = 0; it < 14; it++) {
			const bad = this._isolated(base);
			rounds.push(bad.size);
			if (!bad.size) break;
			for (const e of bad) { if (e.oneway) { e.oneway = 0; n1--; } e.a.leftOk = e.b.leftOk = true; }
		}
		const ow = P.edges.filter((e) => e.oneway), len = ow.reduce((s, e) => s + e.len, 0);
		this.stats = { oneway: ow.length, onewayLen: Math.round(len), reverted: rounds.reduce((s, k) => s + k, 0), rounds, leftOk: P.nodes.filter((n) => n.leftOk).length, ms: +(performance.now() - t0).toFixed(1) };
		console.log(`[TRÂNSITO] Rio: ${ow.length} trechos de mão única (${Math.round(len)} u), ${this.stats.reverted} voltaram a mão dupla para não isolar ninguém (${this.stats.ms} ms)`);
	},

	// O trecho e pode ser percorrido SAINDO do nó n?
	canLeave(e, n) { const o = e.oneway; return !o || (o > 0 ? e.a === n : e.b === n); },

	// Manobra válida para o trânsito civil: chegando ao nó pela perna inA (o carro vem do trecho dela) e saindo pela outA.
	allowed(inter, inA, outA, turn) {
		if (!this.canLeave(outA.e, inter)) return false;                       // contramão
		if (turn === 'left' && !inter.leftOk && !inter.round && !inter.uturn && inA.e.cls === 'ave' && outA.e.cls !== 'ave' && RoadPlan.CLASS.ave.median) return false;      // esquerda da avenida para a rua local
		return true;
	},

	// ------------------------------------------------------------------ grafo de estados (trecho, sentido)
	// estado s = e.id*2 + (anda de a para b ? 0 : 1); next(s) = estados alcançáveis numa manobra (as mesmas do RoadNet.options)
	_head(s) { const e = RoadPlan.edges[s >> 1]; return (s & 1) ? e.a : e.b; },
	_next(s, rules, out) {
		out.length = 0;
		const e = RoadPlan.edges[s >> 1], n = (s & 1) ? e.a : e.b, inA = n.arms && n.arms.find((a) => a.e === e);
		if (!inA) return out;
		const W = n.uturn ? RoadNet.W_UTURN : (n.round ? RoadNet.W_ROUND : RoadNet.W_CROSS);
		let trail = true;
		for (const a of n.arms) {
			const turn = RoadNet.classify(inA, a);
			if (!W[turn] || (rules && !this.allowed(n, inA, a, turn))) continue;
			if (a.e.cls !== 'trail') trail = false;
			out.push(a.e.id * 2 + (a.e.a === n ? 0 : 1), turn, a.e.cls === 'trail' ? 1 : 0);
		}
		if (!trail) { let w = 0; for (let k = 0; k < out.length; k += 3) if (!out[k + 2]) { out[w++] = out[k]; out[w++] = out[k + 1]; out[w++] = 0; } out.length = w; }      // (caminho de terra: só se não houver outra saída)
		return out;
	},
	_valid(s, rules) { const e = RoadPlan.edges[s >> 1]; return !rules || this.canLeave(e, (s & 1) ? e.b : e.a); },

	// Componentes fortemente conexas (Tarjan iterativo). rules = com a mão das ruas e as conversões proibidas.
	_scc(rules) {
		const N = RoadPlan.edges.length * 2, index = new Int32Array(N).fill(-1), low = new Int32Array(N), comp = new Int32Array(N).fill(-1), on = new Uint8Array(N);
		const stack = [], call = [], buf = [];
		let idx = 0, nc = 0;
		const succ = (s) => { const o = this._next(s, rules, buf), r = []; for (let k = 0; k < o.length; k += 3) r.push(o[k]); return r; };
		for (let s0 = 0; s0 < N; s0++) {
			if (index[s0] >= 0 || !this._valid(s0, rules)) continue;
			call.push([s0, succ(s0), 0]); index[s0] = low[s0] = idx++; stack.push(s0); on[s0] = 1;
			while (call.length) {
				const f = call[call.length - 1], v = f[0];
				if (f[2] < f[1].length) {
					const w = f[1][f[2]++];
					if (index[w] < 0) { index[w] = low[w] = idx++; stack.push(w); on[w] = 1; call.push([w, succ(w), 0]); }
					else if (on[w]) low[v] = Math.min(low[v], index[w]);
				} else {
					call.pop();
					if (call.length) { const u = call[call.length - 1][0]; low[u] = Math.min(low[u], low[v]); }
					if (low[v] === index[v]) { let w; do { w = stack.pop(); on[w] = 0; comp[w] = nc; } while (w !== v); nc++; }
				}
			}
		}
		return comp;
	},
	// Trechos com algum estado fora da maior componente (com regras) dentro da componente dele na malha sem regras.
	_isolated(base) {
		const comp = this._scc(true), N = comp.length, best = new Map(), count = new Map();
		for (let s = 0; s < N; s++) { if (comp[s] < 0 || base[s] < 0) continue; const k = base[s] + ':' + comp[s]; count.set(k, (count.get(k) || 0) + 1); }
		for (const [k, c] of count) { const b = +k.split(':')[0], cur = best.get(b); if (!cur || c > cur.c) best.set(b, { c, comp: +k.split(':')[1] }); }
		const bad = new Set();
		for (let s = 0; s < N; s++) {
			if (base[s] < 0 || !this._valid(s, true)) continue;
			const B = best.get(base[s]);
			if (!B || comp[s] !== B.comp) bad.add(RoadPlan.edges[s >> 1]);
		}
		return bad;
	},

	// ------------------------------------------------------------------ viagens
	// Destino conforme a hora (pico pendular) e a rota de menor tempo até ele: a lista dos próximos trechos (o primeiro é o que vem
	// depois do trecho atual e). null = sem rota (segue sorteando).
	trip(e, fwd, x, z) {
		if (!this.on || !e) return null;
		const dest = this.pickDest(x, z);
		return dest ? this.path(e.id * 2 + (fwd ? 0 : 1), dest) : null;
	},
	hour() { const g = typeof window !== 'undefined' && window.game; return g && g.dayNight ? g.dayNight.hour : 12; },
	// 'centro' (manhã), 'bairros' (fim da tarde) ou null (o resto do dia: para qualquer lugar)
	peak(h = this.hour()) { return h >= 6.5 && h < 10 ? 'centro' : (h >= 16.5 && h < 20 ? 'bairros' : null); },
	// Quanto do trânsito de sempre está na rua a esta hora (multiplica a chance de um carro aparecer; o pico é o normal).
	densityMul(h = this.hour()) {
		if (!this.on) return 1;
		if (h < 5) return 0.35; if (h < 6.5) return 0.6;
		if (this.peak(h)) return 1;
		if (h >= 22) return 0.55;
		return h >= 20 ? 0.75 : 0.85;
	},
	_downtown(n) { return Math.abs(n.x) < 200 && n.z > -300 && n.z < 420; },
	_dests() {
		if (this._dl && this._dl.n === RoadPlan.nodes.length) return this._dl;
		const all = [], centro = [], bairros = [];
		for (const n of RoadPlan.nodes) {
			if (!n.arms || n.arms.length < 3 || !n.arms.some((a) => a.e.cls === 'city' || a.e.cls === 'isl' || a.e.cls === 'ave')) continue;
			all.push(n);
			if (this._downtown(n)) centro.push(n); else if (n.arms.some((a) => a.e.cls === 'isl') || n.z > 420 || n.z < -300) bairros.push(n);
		}
		return (this._dl = { n: RoadPlan.nodes.length, all, centro, bairros });
	},
	pickDest(x, z) {
		const L = this._dests(), pk = this.peak();
		const list = pk && Math.random() < 0.65 ? L[pk] : L.all;
		if (!list.length) return null;
		for (let k = 0; k < 12; k++) { const n = list[Math.floor(Math.random() * list.length)]; if (hypot(n.x - x, n.z - z) > 160) return n; }
		return list[Math.floor(Math.random() * list.length)];
	},
	// Dijkstra nos estados, de s0 até chegar ao nó `dest`: devolve a lista de trechos depois do atual.
	path(s0, dest) {
		const E = RoadPlan.edges, N = E.length * 2, dist = this._dist && this._dist.length === N ? this._dist : (this._dist = new Float64Array(N)), prev = this._prev && this._prev.length === N ? this._prev : (this._prev = new Int32Array(N));
		dist.fill(Infinity); prev.fill(-1);
		const heap = [], buf = [];
		const push = (d, s) => { heap.push([d, s]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
		const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let k = 0; for (;;) { let c = 2 * k + 1; if (c >= heap.length) break; if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++; if (heap[k][0] <= heap[c][0]) break; [heap[k], heap[c]] = [heap[c], heap[k]]; k = c; } } return t; };
		dist[s0] = 0; push(0, s0);
		let end = -1, pops = 0;
		while (heap.length && pops++ < N * 4) {
			const [d, s] = pop();
			if (d > dist[s]) continue;
			if (s !== s0 && this._head(s) === dest) { end = s; break; }
			const o = this._next(s, true, buf);
			for (let k = 0; k < o.length; k += 3) {
				const t = o[k], e = E[t >> 1], sig = this._head(t).signal ? 2 : 0;
				const nd = d + e.len / (this.SPEED[e.cls] || 1) + this.TURN_COST[o[k + 1]] + sig;
				if (nd < dist[t]) { dist[t] = nd; prev[t] = s; push(nd, t); }
			}
		}
		if (end < 0) return null;
		const out = [];
		for (let s = end; s !== s0 && s >= 0; s = prev[s]) out.push(E[s >> 1]);
		return out.reverse();
	},
};
