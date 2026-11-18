// ============================================================================
// Buses — os ÔNIBUS da cidade: LINHAS fixas, PONTOS com abrigo e placa, HORÁRIOS e o EMBARQUE.
//
//   • LINHAS (LINES): cada uma liga dois bairros (terminal A ↔ terminal B) e volta — um laço pela malha das ruas, respeitando as mãos
//     (RioTraffic.path: o caminho de menor tempo, as avenidas rendem). Pintura própria (corpo + faixa, CarSheet.PAINTS).
//   • PONTOS: a cada ~stopEvery m de linha, no meio de um quarteirão, no lado direito da rua (abrigo, banco e a placa com as linhas).
//     Um ponto pode servir várias linhas (mesmo trecho, mesmo sentido).
//   • HORÁRIOS: cada linha sai do terminal A a cada `headway` minutos (do relógio do jogo) entre `first` e `last`; o horário em cada
//     ponto é a saída mais o tempo de viagem até ali (a `speed` m/s de média, paradas inclusas). No ponto, E mostra a placa: as linhas,
//     o percurso (bairros e ruas) e os próximos horários.
//   • ÔNIBUS DE VERDADE só perto da câmera: cada viagem "virtual" que entra na bolha acordada (fora da tela) vira um ônibus (Bus, um
//     TrafficCar que segue o laço da linha e PARA nos pontos), e some ao sair dela. Fora da bolha, a viagem segue só no horário.
//   • EMBARQUE: no ponto, com o ônibus parado ali, E embarca (paga a passagem) e escolhe onde descer; dá para pular a viagem (o relógio
//     avança o tempo do trajeto). Dentro, E desce no próximo ponto.
// API: init(game) · update(game, dt) · prompt(g) · interact(g) · LINES · stops
// ============================================================================

// O ônibus: segue o laço da linha (a viagem da Route é a lista de trechos da linha) e para nos pontos.
class Bus extends TrafficCar {
	constructor(scene, physics, pos, id, sheet, paint, heading, traffic, line) {
		super(scene, physics, pos, id, sheet, paint, heading, traffic);
		this.keep = true;                          // (o trânsito não recicla: o Buses cuida)
		this.line = line;
		this.si = 0;                               // próximo ponto (índice em line.stops)
		this.dwell = 0;                            // parado no ponto (s que faltam)
		this.sinceStop = 0;
		this.cruise = Config.bus.cruise;
		this.honker = false;
	}
	startRoute(x, z, d, lp = null) {
		this.route = new Route(x, z, d, lp);
		this.route.trips = true;
		this.route.tripFn = (e, fwd) => Buses.tripFrom(this.line, e, fwd);
		this.route.ensure(2);
	}
	// Limite de velocidade do ponto à frente (TrafficCar.aiUpdate): distância até a parada, ou null.
	stopAhead(dt) {
		const L = this.line, S = L.stops[this.si];
		if (!S) return null;
		this.sinceStop += dt;
		if (this.dwell > 0) {
			this.dwell -= dt;
			if (this.dwell <= 0) { this._next(); return null; }
			return 0;
		}
		const p = this.position, f = this.fwdToRef(this._sf || (this._sf = new BABYLON.Vector3()));
		const dx = S.stop.lx - p.x, dz = S.stop.lz - p.z, along = dx * f.x + dz * f.z, side = Math.abs(dx * f.z - dz * f.x);
		const aligned = f.x * S.stop.dx + f.z * S.stop.dz > 0.7;
		if (aligned && side < 4.5 && along > -this.halfLen && along < 45) {
			const ds = along - this.halfLen * 0.55;              // (a porta da frente no ponto)
			if (ds < 0.8 && Math.abs(this.forwardSpeed) < 0.5) { this.dwell = Config.bus.dwell; Buses.onArrive(this, S.stop); return 0; }
			return Math.max(0, ds);
		}
		if (aligned && side < 4.5 && along <= -this.halfLen) { this._next(); return null; }       // (passou sem parar: segue)
		if (this.sinceStop > 90) this._skipTo();                                                  // (saiu da linha num desvio: o próximo ponto que ainda vem)
		return null;
	}
	_next() { this.si = (this.si + 1) % this.line.stops.length; this.sinceStop = 0; }
	// O próximo ponto da linha a partir de onde o ônibus está (o mais perto, à frente no laço).
	_skipTo() {
		const s = Buses.sOf(this.line, this.position.x, this.position.z);
		this.si = Buses.stopAfter(this.line, s);
		this.sinceStop = 0;
	}
}

const Buses = {
	// [número, nome, de, para, pintura (CarSheet.PAINTS: corpo + faixa), headway (min do jogo)]
	LINE_DEFS: [
		['100', 'Centro ↔ Orla', 'centro', 'orla', 32, 30],
		['214', 'Comércio ↔ Ilha do Almirante', 'comercio', 'ilha', 28, 40],
		['326', 'Favela do Morro ↔ Distrito Financeiro', 'favela', 'centro', 37, 35],
		['433', 'Porto ↔ Bairros residenciais', 'industrial', 'residencial', 31, 40],
		['541', 'Morro do Mirante ↔ Orla', 'mirante', 'orla', 35, 45],
		['650', 'Periferia ↔ Comércio', 'periferia', 'comercio', 24, 45],
	],
	BUS_CLS: new Set(['city', 'ave', 'isl', 'bridge', 'hwy', 'via']),
	LINES: [], stops: [], buses: [], ride: null, built: false, _id: 0,

	get C() { return Config.bus; },
	// minutos do jogo por segundo real
	get gm() { return 1440 / Config.time.cycleSeconds; },

	// ------------------------------------------------------------------ montagem
	init(g) {
		if (this.built || !g.empire || !RoadPlan.edges || !RoadPlan.edges.length || typeof RioTraffic === 'undefined') return;
		this.built = true;
		const t0 = performance.now();
		const E = g.empire, nodes = RoadPlan.nodes.filter((n) => n.arms && n.arms.length >= 2 && n.arms.some((a) => this.BUS_CLS.has(a.e.cls)) && !n.round);
		const byD = {};
		for (const n of RoadPlan.nodes) { const d = E.districtAt(n.x, n.z); (byD[d] || (byD[d] = [])).push(n); }
		const terminal = (d) => {
			const all = byD[d]; if (!all || !all.length) return null;
			const cx = all.reduce((s, n) => s + n.x, 0) / all.length, cz = all.reduce((s, n) => s + n.z, 0) / all.length;
			let best = null, bd = Infinity;
			for (const n of nodes) { const k = hypot(n.x - cx, n.z - cz) * (E.districtAt(n.x, n.z) === d ? 1 : 1.6); if (k < bd) { bd = k; best = n; } }
			return best;
		};
		for (const [num, name, from, to, paint, headway] of this.LINE_DEFS) {
			const A = terminal(from), B = terminal(to);
			if (!A || !B || A === B) continue;
			const ab = this._path(A, B), ba = ab && this._path(B, A);
			if (!ab || !ba) { console.warn('[ÔNIBUS] linha ' + num + ' sem caminho'); continue; }
			const L = { id: num, name, from, to, paint, headway, A, B, states: ab.concat(ba), stops: [] };
			this._geom(L);
			L.turnS = this._len(ab);
			this.LINES.push(L);
		}
		for (const L of this.LINES) this._placeStops(L, g);
		for (const S of this.stops) {
			this._shelter(g, S);
			if (typeof CityGrid !== 'undefined' && CityGrid.addPoi) CityGrid.addPoi({ type: 'busstop', name: `${S.name} (${S.lines.map((L) => L.id).join(', ')})`, x: S.x, z: S.z });
		}
		const ms = (performance.now() - t0).toFixed(0);
		console.log(`[ÔNIBUS] ${this.LINES.length} linhas, ${this.stops.length} pontos (${ms} ms): ` + this.LINES.map((L) => `${L.id} ${Math.round(L.len)} m/${L.stops.length} pontos`).join(' · '));
	},

	// Estados (trecho, sentido: e.id*2 + (a→b ? 0 : 1)) do caminho de A até B.
	_path(A, B) {
		let best = null;
		for (const a of A.arms) {
			const e = a.e;
			if (!this.BUS_CLS.has(e.cls) && e.cls !== 'fav') continue;
			const fwd = e.a === A;
			if (e.oneway && (fwd ? e.oneway < 0 : e.oneway > 0)) continue;
			const s0 = e.id * 2 + (fwd ? 0 : 1);
			const head = fwd ? e.b : e.a;
			const rest = head === B ? [] : RioTraffic.path(s0, B);
			if (!rest) continue;
			const states = [s0];
			let at = head;
			for (const q of rest) { const f = q.a === at; states.push(q.id * 2 + (f ? 0 : 1)); at = f ? q.b : q.a; }
			if (at !== B) continue;
			const len = this._len(states);
			if (!best || len < best.len) best = { states, len };
		}
		return best ? best.states : null;
	},
	_edge(s) { return RoadPlan.edges[s >> 1]; },
	_len(states) { let t = 0; for (const s of states) t += this._edge(s).len; return t; },

	// Geometria do laço: o eixo da faixa da direita, ponto a ponto (cum = distância acumulada) — posição das viagens e dos pontos.
	_geom(L) {
		const P = [], o = {};
		let s = 0;
		L.cumS = [];                                  // início de cada estado no laço
		for (const st of L.states) {
			const e = this._edge(st), fwd = (st & 1) === 0, lane = RoadNet.lane(e), n = Math.max(2, Math.ceil(e.len / 8));
			L.cumS.push(s);
			for (let k = 0; k <= n; k++) {
				const t = (k / n) * e.len;
				RoadPlan.at(e, fwd ? t : e.len - t, o);
				const dx = fwd ? o.tx : -o.tx, dz = fwd ? o.tz : -o.tz;
				P.push({ x: o.x + dz * lane, z: o.z - dx * lane, dx, dz, s: s + t, st });
			}
			s += e.len;
		}
		L.pts = P; L.len = s;
	},
	// Posição no laço na distância s (com a direção): { x, z, dx, dz, st }.
	at(L, s) {
		s = ((s % L.len) + L.len) % L.len;
		const P = L.pts;
		let lo = 0, hi = P.length - 1;
		while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m].s <= s) lo = m; else hi = m; }
		const a = P[lo], b = P[hi], k = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
		return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, dx: a.dx, dz: a.dz, st: a.st };
	},
	// A distância no laço do ponto do laço mais perto de (x, z).
	sOf(L, x, z) {
		let best = 0, bd = Infinity;
		for (const p of L.pts) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = p.s; } }
		return best;
	},
	stopAfter(L, s) {
		for (let i = 0; i < L.stops.length; i++) if (L.stops[i].s > s + 4) return i;
		return 0;
	},

	// A viagem da Route (Route.tripFn): os trechos do laço depois do trecho atual; fora da linha (desvio), o caminho de volta a ela.
	tripFrom(L, e, fwd) {
		const st = e.id * 2 + (fwd ? 0 : 1), n = L.states.length;
		let i = L.states.indexOf(st);
		const out = [];
		if (i < 0) {
			const head = fwd ? e.b : e.a;
			let j = 0, bd = Infinity;
			for (let k = 0; k < n; k++) { const q = this._edge(L.states[k]), tail = (L.states[k] & 1) ? q.b : q.a; const d = hypot(tail.x - head.x, tail.z - head.z); if (d < bd) { bd = d; j = k; } }
			const q = this._edge(L.states[j]), tail = (L.states[j] & 1) ? q.b : q.a;
			if (tail !== head) { const back = RioTraffic.path(st, tail); if (!back) return null; out.push(...back); }
			i = j - 1;
		}
		for (let k = 1; k <= 24; k++) out.push(this._edge(L.states[(i + k) % n]));
		return out;
	},

	// ------------------------------------------------------------------ pontos
	_placeStops(L, g) {
		const C = this.C, ok = new Set(['city', 'ave', 'isl']);
		let last = -1e9;
		L.states.forEach((st, k) => {
			const e = this._edge(st), s0 = L.cumS[k];
			if (!ok.has(e.cls) || e.len < 46 || e.layer) return;
			const mid = s0 + e.len / 2;
			if (mid - last < C.stopEvery || L.len - mid + (L.stops.length ? L.stops[0].s : 0) < C.stopEvery * 0.5) return;
			// já existe um ponto neste trecho e sentido (outra linha)? serve as duas
			let S = this.stops.find((q) => q.st === st);
			if (!S) {
				const p = this.at(L, mid), w = e.w / 2, lane = RoadNet.lane(e);
				const rx = p.dz, rz = -p.dx;                             // (a direita de quem anda)
				const cx = p.x - rx * lane, cz = p.z - rz * lane;        // (o eixo da rua)
				S = { id: this.stops.length, st, lx: p.x, lz: p.z, dx: p.dx, dz: p.dz, x: cx + rx * (w + 1.9), z: cz + rz * (w + 1.9), cx: cx + rx * (w + 0.4), cz: cz + rz * (w + 0.4),
					h: Math.atan2(-rx, -rz), name: CityGrid.streetName(e), dist: g.empire.districtAt(p.x, p.z), lines: [] };
				this.stops.push(S);
			}
			if (!S.lines.includes(L)) S.lines.push(L);
			L.stops.push({ stop: S, s: mid });
			last = mid;
		});
		// o percurso, para a placa: os bairros na ordem em que a linha passa (sem repetir em seguida) e as ruas principais
		const ds = [], streets = [];
		for (const p of L.pts) {
			if (p.s % 40 > 8) continue;
			const d = g.empire.dName(g.empire.districtAt(p.x, p.z));
			if (ds[ds.length - 1] !== d) ds.push(d);
		}
		for (const st of L.states) { const n = CityGrid.streetName(this._edge(st)); if (n && !streets.includes(n) && streets.length < 8) streets.push(n); }
		L.route = ds; L.streets = streets;
	},

	// O abrigo do ponto: cobertura, fundo de vidro, banco e a placa (com a cor das linhas). Uma malha só por ponto (merge).
	_shelter(g, S) {
		const sc = g.scene, M = this._mats || (this._mats = this._materials(sc)), parts = [];
		const box = (w, h, d, x, y, z, m) => { const b = BABYLON.MeshBuilder.CreateBox('pontoP', { width: w, height: h, depth: d }, sc); b.position.set(x, y, z); b.material = m; parts.push(b); return b; };
		box(3.4, 0.08, 1.5, 0, 2.45, 0, M.roof);                        // cobertura
		box(3.3, 1.7, 0.05, 0, 1.25, -0.62, M.glass);                    // fundo de vidro
		for (const x of [-1.6, 1.6]) box(0.08, 2.45, 0.08, x, 1.22, -0.6, M.post);
		box(2.6, 0.08, 0.42, 0, 0.5, -0.38, M.bench);                    // banco
		for (const x of [-1.1, 1.1]) box(0.06, 0.5, 0.36, x, 0.25, -0.38, M.post);
		box(0.08, 2.9, 0.08, 2.15, 1.45, 0.45, M.post);                  // poste da placa
		box(0.06, 0.62, 0.52, 2.15, 2.6, 0.45, M.sign);                  // a placa (ÔNIBUS)
		S.lines.forEach((L, i) => box(0.07, 0.11, 0.48, 2.15, 2.18 - i * 0.13, 0.45, this._lineMat(sc, L)));     // uma faixa por linha
		const m = BABYLON.Mesh.MergeMeshes(parts, true, true, undefined, false, true);
		if (!m) return;
		m.name = 'pontoOnibus' + S.id;
		const y = Relief.at(S.x, S.z) + 0.16;
		m.position.set(S.x, y, S.z); m.rotation.y = S.h;
		m.isPickable = false; m.freezeWorldMatrix();
		if (g.shadowGenerator) g.shadowGenerator.addShadowCaster(m);
		S.mesh = m;
	},
	_materials(sc) {
		const mk = (n, c, a = 1, e = null) => { const m = new BABYLON.StandardMaterial(n, sc); m.diffuseColor = BABYLON.Color3.FromHexString(c); m.specularColor = new BABYLON.Color3(0.15, 0.15, 0.15); if (a < 1) { m.alpha = a; } if (e) m.emissiveColor = BABYLON.Color3.FromHexString(e); return m; };
		return { roof: mk('pontoTeto', '#cfd5dc'), glass: mk('pontoVidro', '#9fc4d8', 0.35), post: mk('pontoPoste', '#4a5058'), bench: mk('pontoBanco', '#7a5434'), sign: mk('pontoPlaca', '#1f4fa8', 1, '#0c1f44') };
	},
	_lineMat(sc, L) {
		const P = CarSheet.PAINTS[L.paint] || CarSheet.PAINTS[1];
		const k = 'pontoLinha' + L.id, m = sc.getMaterialByName(k) || new BABYLON.StandardMaterial(k, sc);
		m.diffuseColor = BABYLON.Color3.FromHexString(P.paint); m.emissiveColor = BABYLON.Color3.FromHexString(P.paint).scale(0.35);
		return m;
	},

	// ------------------------------------------------------------------ horários
	// Saídas do terminal (minutos do dia) da linha.
	_deps(L) {
		if (L._deps) return L._deps;
		const C = this.C, out = [];
		for (let t = C.first * 60; t <= C.last * 60; t += L.headway) out.push(t);
		return (L._deps = out);
	},
	// Minutos de viagem do terminal até s.
	_travel(s) { return (s / this.C.speed) * this.gm; },
	// Próximos horários (minutos do dia, podem passar de 1440) da linha no ponto da linha `ls` ({ s }), a partir de agora.
	next(L, ls, now, n = 3) {
		const out = [], tr = this._travel(ls.s);
		for (let day = -1; day <= 1 && out.length < n; day++) for (const d of this._deps(L)) { const t = d + tr + day * 1440; if (t >= now - 0.5) { out.push(t); if (out.length >= n) break; } }
		return out;
	},
	_now(g) { return g.dayNight.hour * 60; },
	clock(t) { t = ((Math.round(t) % 1440) + 1440) % 1440; return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); },

	// ------------------------------------------------------------------ quadro
	update(g, dt) {
		if (!this.built) { this.init(g); if (!this.built) return; }
		if (!this.C.on || Interiors.active) { this._rideTick(g, dt); return; }
		const f = g.camera.target, now = this._now(g);
		this._spT = (this._spT || 0) - dt;
		if (this._spT <= 0 && g.traffic && g.traffic.carLib) {
			this._spT = 0.5;
			const rIn = Zones.sr + 4, rOut = Zones.ar - 12;
			for (const L of this.LINES) {
				L.gone = L.gone || new Map();
				for (const d0 of this._deps(L)) for (const day of [-1, 0]) {
					const d = d0 + day * 1440, el = now - d;
					if (el < 0) continue;
					const s = (el / this.gm) * this.C.speed;
					if (s >= L.len) continue;
					const key = d, p = this.at(L, s), dist = hypot(p.x - f.x, p.z - f.z);
					if (L.gone.has(key)) { if (dist > Zones.ar + 60) L.gone.delete(key); continue; }
					if (dist < rIn || dist > rOut || Zones.near(p.x, p.z, 10)) continue;
					if (this.buses.some((b) => b.trip === key && b.line === L)) continue;
					if (this.buses.length >= this.C.max) continue;
					this._spawn(g, L, s, key);
				}
			}
		}
		for (let i = this.buses.length - 1; i >= 0; i--) {
			const b = this.buses[i];
			if (b.controlled || b.wrecked) { if (!b.controlled && !Zones.near(b.position.x, b.position.z, 20)) this._remove(g, b); else if (b.controlled) this._forget(b); continue; }
			if (this.ride && this.ride.bus === b) continue;
			if (hypot(b.position.x - f.x, b.position.z - f.z) > Zones.ar + 10) { b.line.gone.set(b.trip, 1); this._remove(g, b); }
		}
		this._rideTick(g, dt);
	},

	_spawn(g, L, s, key) {
		const T = g.traffic, p = this.at(L, s), lp = RoadNet.snapToLane(p.x, p.z, p.dx, p.dz);
		if (!lp || lp.e !== this._edge(p.st) || !T._clear(lp.point.x, lp.point.z, 14)) return null;
		const b = new Bus(g.scene, g.physics, lp.point, 30000 + (++this._id), T.carLib.sheet('onibus'), L.paint, Math.atan2(lp.d.dx, lp.d.dz), T, L);
		b.trip = key; b.baseMode = 'drive';
		b.startRoute(lp.point.x, lp.point.z, lp.d, lp);
		b.si = this.stopAfter(L, s);
		if (T.shadow) T.shadow.addShadowCaster(b.body);
		g.vehicleManager.vehicles.push(b);
		this.buses.push(b);
		return b;
	},
	_forget(b) { const i = this.buses.indexOf(b); if (i >= 0) this.buses.splice(i, 1); b.keep = false; },      // (o jogador roubou o ônibus: agora é um carro qualquer)
	_remove(g, b) {
		this._forget(b);
		const k = g.vehicleManager.vehicles.indexOf(b);
		if (k >= 0) g.vehicleManager.vehicles.splice(k, 1);
		if (g.doors) g.doors.reset(b);
		g.carLights.release(b);
		b.dispose(g.traffic && g.traffic.shadow);
	},

	// O ônibus chegou ao ponto S (parado): o jogador esperando ali pode embarcar; quem está dentro e escolheu este ponto desce.
	onArrive(b, S) {
		const R = this.ride;
		if (R && R.bus === b && (R.dest === S || R.getOff)) this._alight(window.game, S);
	},

	// ------------------------------------------------------------------ jogador
	// O ponto em que o jogador está (a até 5 m do abrigo/meio-fio).
	_stopHere(g) {
		if (g.mode !== 'player' || g.player.busy || this.ride) return null;
		const p = g.player.position;
		let best = null, bd = 36;
		for (const S of this.stops) { const d = Math.min((S.x - p.x) ** 2 + (S.z - p.z) ** 2, (S.cx - p.x) ** 2 + (S.cz - p.z) ** 2); if (d < bd) { bd = d; best = S; } }
		return best;
	},
	// Ônibus parado no ponto S agora (porta aberta).
	_busAt(S) { return this.buses.find((b) => b.dwell > 0 && b.line.stops[b.si] && b.line.stops[b.si].stop === S) || null; },

	prompt(g) {
		if (this.ride) return `<b>E</b> opções da viagem<small>${this.ride.getOff ? 'você desce no próximo ponto' : 'descendo em ' + this.ride.dest.name}</small>`;
		const S = this._stopHere(g);
		if (!S) return '';
		const b = this._busAt(S);
		if (b) return `<b>E</b> embarcar no ${b.line.id} — ${b.line.name} (${brl(this.C.fare)})<small>ônibus parado no ponto</small>`;
		return `<b>E</b> ver os horários do ponto<small>${S.lines.map((L) => L.id).join(' · ')} — ${S.name}</small>`;
	},
	interact(g) {
		if (this.ride) { this._rideMenu(g); return true; }
		const S = this._stopHere(g);
		if (!S) return false;
		const b = this._busAt(S);
		if (b) { this._boardMenu(g, S, b); return true; }
		this._board(g, S);
		return true;
	},

	// A placa do ponto: linhas, percurso e os próximos horários.
	_board(g, S) {
		const now = this._now(g);
		const rows = S.lines.map((L) => {
			const ls = L.stops.find((q) => q.stop === S), t = ls ? this.next(L, ls, now, 3) : [];
			const P = CarSheet.PAINTS[L.paint] || CarSheet.PAINTS[1], wait = t.length ? Math.max(0, Math.round(t[0] - now)) : null;
			return `<div style="margin:8px 0;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.05);border-left:6px solid ${P.paint}">
				<b style="font-size:15px">${L.id}</b> <b>${L.name}</b>
				<div style="font-size:12px;opacity:.85;margin-top:3px">Percurso: ${L.route.join(' → ')}</div>
				<div style="font-size:11px;opacity:.65">Ruas: ${L.streets.join(', ')}</div>
				<div style="margin-top:4px">Próximos: <b>${t.map((q) => this.clock(q)).join('</b> · <b>') || '—'}</b>${wait !== null ? ` <span style="opacity:.75">(em ~${wait} min)</span>` : ''}</div></div>`;
		}).join('');
		const now$ = this.clock(now);
		this._panel(g, `🚏 Ponto de ônibus — ${S.name}`, `Agora: ${now$} · passagem ${brl(this.C.fare)} · horários previstos (o trânsito pode atrasar)`, rows + `<div style="font-size:11px;opacity:.6;margin-top:6px">Espere o ônibus parar aqui e aperte E para embarcar.</div>`);
	},

	// Embarcar: escolher onde descer (os próximos pontos da linha, com a previsão de chegada).
	_boardMenu(g, S, b) {
		const L = b.line, now = this._now(g), i0 = b.si, out = [];
		for (let k = 1; k <= Math.min(10, L.stops.length - 1); k++) {
			const q = L.stops[(i0 + k) % L.stops.length], ds = ((q.s - L.stops[i0].s) % L.len + L.len) % L.len;
			out.push({ k, q, eta: now + this._travel(ds) });
		}
		const cash = g.inventory.cash >= this.C.fare;
		const html = out.map((o) => `<button class="bus-dest" data-k="${o.k}" ${cash ? '' : 'disabled'} style="display:block;width:100%;text-align:left;margin:4px 0;padding:7px 10px;border-radius:9px;border:0;background:#1d2533;color:#e8eaf0;font:600 13px var(--font);cursor:pointer">
			${o.q.stop.name} <span style="opacity:.7">— ${g.empire.dName(o.q.stop.dist)}</span> <span style="float:right;opacity:.8">~${this.clock(o.eta)}</span></button>`).join('');
		const el = this._panel(g, `🚌 ${L.id} — ${L.name}`, cash ? `Passagem ${brl(this.C.fare)}. Onde você desce?` : `Passagem ${brl(this.C.fare)} — você não tem dinheiro`, html);
		if (!el) return;
		el.querySelectorAll('.bus-dest').forEach((btn) => btn.onclick = () => {
			const o = out.find((q) => q.k === +btn.dataset.k);
			this._close();
			if (!o || this._busAt(S) !== b) { g._flash('O ônibus já saiu'); return; }
			this._boardBus(g, b, o.q.stop, o.eta - now);
		});
	},

	_boardBus(g, b, dest, mins) {
		if (g.inventory.cash < this.C.fare) return;
		g.inventory.cash -= this.C.fare;
		const pl = g.player;
		pl.cancelSequence(); pl.action = null; pl.velocity.setAll(0);
		pl.setVisible(false); pl.frozen = true; pl.invulnerable = true;
		b.dwell = Math.max(b.dwell, 1.5);
		this.ride = { bus: b, dest, t: 0, mins, getOff: false };
		g._flash(`🚌 Você embarcou no ${b.line.id} (−${brl(this.C.fare)}) — descendo em ${dest.name}. E: descer antes ou pular a viagem`);
	},
	// Dentro do ônibus: dar o sinal (desce no próximo ponto) ou pular a viagem até o destino.
	_rideMenu(g) {
		const R = this.ride;
		const btn = (id, t) => `<button data-a="${id}" style="display:block;width:100%;margin:5px 0;padding:8px 10px;border-radius:9px;border:0;background:#1d2533;color:#e8eaf0;font:600 13px var(--font);cursor:pointer;text-align:left">${t}</button>`;
		const el = this._panel(g, `🚌 ${R.bus.line.id} — ${R.bus.line.name}`, `Destino: ${R.dest.name}`, btn('off', '🛑 Dar o sinal: descer no próximo ponto') + btn('skip', `⏩ Pular a viagem até ${R.dest.name}`) + btn('stay', '↩ Continuar'));
		if (!el) return;
		el.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => {
			const a = b.dataset.a;
			this._close();
			if (!this.ride) return;
			if (a === 'off') { this.ride.getOff = true; g._flash('🛑 Sinal dado: você desce no próximo ponto'); }
			else if (a === 'skip') this._skip(g);
		});
	},

	// Andando de ônibus: o jogador (invisível) acompanha o ônibus; T pula a viagem (o relógio avança o trajeto).
	_rideTick(g, dt) {
		const R = this.ride;
		if (!R) return;
		const b = R.bus, pl = g.player;
		R.t += dt;
		if (!pl.alive || !b || b.wrecked || b.controlled || b.isDisposed) { this._alight(g, null); return; }
		pl.position.x = b.position.x; pl.position.z = b.position.z;
	},
	// Pular a viagem: o relógio anda o tempo do trajeto que falta (DayNight.skip) e você desce no destino.
	_skip(g) {
		const R = this.ride; if (!R) return;
		const b = R.bus, L = b.line, ls = L.stops.find((q) => q.stop === R.dest);
		const s = this.sOf(L, b.position.x, b.position.z), ds = ls ? ((ls.s - s) % L.len + L.len) % L.len : 0;
		const mins = this._travel(ds);
		if (g.dayNight) g.dayNight.skip(mins / 60);
		const b0 = R.bus;
		this._alight(g, R.dest);
		if (b0 && !b0.controlled) { b0.line.gone.set(b0.trip, 1); this._remove(g, b0); }      // (o ônibus seguiu viagem enquanto o tempo passou)
		g._flash(`⏩ Viagem pulada: ${Math.round(mins)} min de ônibus — ${R.dest.name}`);
	},
	_alight(g, S) {
		const R = this.ride; if (!R) return;
		this.ride = null;
		const pl = g.player;
		pl.frozen = false; pl.invulnerable = false; pl.setVisible(true);
		const x = S ? S.cx + (S.x - S.cx) * 0.4 : pl.position.x, z = S ? S.cz + (S.z - S.cz) * 0.4 : pl.position.z;
		pl.teleport(new BABYLON.Vector3(x, 0, z));
		if (g.camera && g.camera.snapTo && S) g.camera.snapTo(pl.position);
		if (S) g._flash(`🚏 Você desceu: ${S.name}`);
	},

	// Painel simples (HTML) por cima do jogo: título, subtítulo e conteúdo; fecha com Esc/E ou o botão.
	_panel(g, title, sub, html) {
		this._close();
		const el = document.createElement('div');
		el.id = 'busPanel';
		el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:60;width:min(460px,92vw);max-height:80vh;overflow:auto;padding:14px 16px;border-radius:16px;background:rgba(14,18,26,.94);color:#e8eaf0;font-family:var(--font);box-shadow:0 20px 60px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.08)';
		el.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><b style="font:700 16px var(--font-d);flex:1">${title}</b><button id="busClose" style="border:0;background:#334155;color:#e2e8f0;border-radius:8px;padding:4px 10px;cursor:pointer">✕</button></div>
			<div style="font-size:12px;opacity:.75;margin:4px 0 6px">${sub}</div>${html}`;
		document.body.appendChild(el);
		el.querySelector('#busClose').onclick = () => this._close();
		this._key = (e) => { if (e.key === 'Escape') { e.preventDefault(); this._close(); } };
		window.addEventListener('keydown', this._key, true);
		this.panelOpen = true;
		return el;
	},
	_close() {
		const el = document.getElementById('busPanel'); if (el) el.remove();
		if (this._key) { window.removeEventListener('keydown', this._key, true); this._key = null; }
		this.panelOpen = false;
	},
};
