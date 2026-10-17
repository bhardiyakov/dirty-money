// ============================================================================
// CrowdSim — the walking crowd (pedestrians, police on foot, gang members): the path queue (A* with a time budget) and the
// steering (pure pursuit of the next waypoint with limited acceleration, separation from neighbours, sliding collision against
// the NavGrid). Pure math, no Babylon: it runs in the crowd worker (nav/crowdWorker.js) and, where a worker cannot start (file://),
// on the main thread with the same commands.
//
// The main thread drives it with flat command lists (`apply`) and reads the agents back as one Float32Array (`write`): per agent
// slot x, z, vx, vz, flags (1 = following a path, 2 = waiting for one) and the slot's generation (a teleport or a new agent in the
// slot bumps it, so the main thread can drop rows computed before it).
// ============================================================================

class CrowdSim {
	static STRIDE = 6;
	// Commands: [op, slot, ...] — ADD gen x z maxSpeed maxAcceleration radius separationWeight · REMOVE · PARAMS maxSpeed
	// maxAcceleration radius separationWeight · TELEPORT gen x z · GOTO x z · FILL i0 j0 i1 j1 value (raster edit, no slot).
	static OP = { ADD: 1, REMOVE: 2, PARAMS: 3, TELEPORT: 4, GOTO: 5, FILL: 6 };
	static SIZE = [0, 9, 2, 6, 5, 4, 6];

	constructor(nav) {
		this.nav = nav;
		this.agents = [];            // slot -> agent | null
		this.queue = [];             // agents waiting for a path
		this._cells = new Map();     // neighbour grid (2 u cells), rebuilt every step
		this._used = [];
		this._near = [];
	}

	apply(cmds) {
		const O = CrowdSim.OP;
		for (let k = 0; k < cmds.length; k += CrowdSim.SIZE[cmds[k]]) {
			const op = cmds[k], i = cmds[k + 1];
			if (op === O.ADD) this._add(i, cmds[k + 2], cmds[k + 3], cmds[k + 4], cmds, k + 5);
			else if (op === O.REMOVE) this._remove(i);
			else if (op === O.PARAMS) { const a = this.agents[i]; if (a) this._params(a, cmds, k + 2); }
			else if (op === O.TELEPORT) this._teleport(i, cmds[k + 2], cmds[k + 3], cmds[k + 4]);
			else if (op === O.GOTO) this._goto(i, cmds[k + 2], cmds[k + 3]);
			else if (op === O.FILL) this.nav.fillCells(cmds[k + 1], cmds[k + 2], cmds[k + 3], cmds[k + 4], cmds[k + 5]);
		}
	}

	_add(i, gen, x, z, cmds, p) {
		const a = { i, gen, x, z, vx: 0, vz: 0, maxSpeed: 0, maxAcc: 40, radius: 0.4, sep: 2, path: null, pi: 0, goal: null, queued: false, stuck: 0 };
		this._params(a, cmds, p);
		this.agents[i] = a;
	}
	_params(a, c, p) { a.maxSpeed = c[p]; a.maxAcc = c[p + 1] || 40; a.radius = c[p + 2] || 0.4; a.sep = c[p + 3] || 2; }
	_remove(i) { const a = this.agents[i]; if (a) { a.dead = true; this.agents[i] = null; } }
	_teleport(i, gen, x, z) {
		const a = this.agents[i]; if (!a) return;
		a.gen = gen; a.x = x; a.z = z; a.vx = a.vz = 0; a.path = null; a.goal = null; a.stuck = 0;
	}

	// Sends the agent to (x, z). Clear straight line = immediate path; otherwise it joins the A* queue.
	_goto(i, x, z) {
		const a = this.agents[i]; if (!a) return;
		const g = a.goal;
		// Mesmo destino de antes (a IA repete o pedido a cada 0,3–0,7 s): mantém o caminho em curso.
		if (g && a.path && Math.hypot(g.x - x, g.z - z) < 0.8 && a.pi < a.path.length) return;
		a.goal = { x, z };
		a.stuck = 0;
		if (this.nav.los(a.x, a.z, x, z)) { a.path = [{ x, z }]; a.pi = 0; return; }
		if (!a.queued) { a.queued = true; this.queue.push(a); }
	}

	// Paths for up to `pathMs` (at least one), then one movement step of `dt` seconds for every agent.
	step(dt, pathMs) {
		const stats = this.nav.stats;
		if (this.queue.length) {
			const t0 = performance.now();
			while (this.queue.length) {
				const a = this.queue.shift();
				a.queued = false;
				if (a.dead || !a.goal) continue;
				const p = this.nav.findPath(a.x, a.z, a.goal.x, a.goal.z);
				a.path = p; a.pi = 0;
				if (!p) stats.fails++;
				if (performance.now() - t0 > pathMs) break;
			}
			const ms = performance.now() - t0;
			stats.ms += ms; stats.maxMs = Math.max(stats.maxMs, ms);
		}
		this._buildCells();
		const A = this.agents;
		for (let i = 0; i < A.length; i++) if (A[i]) this._move(A[i], dt);
	}

	_key(x, z) { return (Math.floor(x / 2) + 4096) * 8192 + (Math.floor(z / 2) + 4096); }
	// Neighbour grid of the step: positions are read live (who already moved in this step); the query has 0.5 u of slack for that.
	_buildCells() {
		for (const b of this._used) b.length = 0;
		this._used.length = 0;
		for (const a of this.agents) {
			if (!a || !(Math.abs(a.x) < 1e6 && Math.abs(a.z) < 1e6)) continue;
			const k = this._key(a.x, a.z);
			let b = this._cells.get(k);
			if (!b) this._cells.set(k, b = []);
			if (!b.length) this._used.push(b);
			b.push(a);
		}
	}
	_query(x, z, r) {
		const out = this._near;
		out.length = 0;
		const i0 = Math.floor((x - r) / 2), i1 = Math.floor((x + r) / 2), j0 = Math.floor((z - r) / 2), j1 = Math.floor((z + r) / 2);
		if (!(i1 - i0 < 8 && j1 - j0 < 8)) return out;
		for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
			const b = this._cells.get((i + 4096) * 8192 + (j + 4096));
			if (b) for (let n = 0; n < b.length; n++) out.push(b[n]);
		}
		return out;
	}

	_move(a, dt) {
		const nav = this.nav, sp = a.maxSpeed;
		// Velocidade desejada rumo ao próximo ponto do caminho.
		let dvx = 0, dvz = 0;
		if (a.path && a.pi < a.path.length && sp > 0.02) {
			let w = a.path[a.pi];
			let dx = w.x - a.x, dz = w.z - a.z, d = Math.sqrt(dx * dx + dz * dz);
			const last = a.pi === a.path.length - 1;
			while (!last && d < 0.45 && a.pi < a.path.length - 1) { a.pi++; w = a.path[a.pi]; dx = w.x - a.x; dz = w.z - a.z; d = Math.sqrt(dx * dx + dz * dz); }
			if (a.pi === a.path.length - 1 && d < 0.3) a.path = null;
			else if (d > 1e-4) {
				const s = (a.pi === a.path.length - 1) ? Math.min(sp, d * 4) : sp;      // freia ao chegar
				dvx = dx / d * s; dvz = dz / d * s;
			}
		}
		// Aceleração limitada.
		let ax = dvx - a.vx, az = dvz - a.vz;
		const al = Math.sqrt(ax * ax + az * az), mx = a.maxAcc * dt;
		if (al > mx) { ax *= mx / al; az *= mx / al; }
		a.vx += ax; a.vz += az;

		// Separação dos vizinhos (empurra para fora da sobreposição).
		let px = 0, pz = 0;
		const r = a.radius * 2 + 0.1, near = this._query(a.x, a.z, r + 0.5);
		for (let q = 0; q < near.length; q++) {
			const b = near[q];
			if (b === a) continue;
			const ex = a.x - b.x, ez = a.z - b.z;
			if (ex > r || ex < -r || ez > r || ez < -r) continue;
			const dd = Math.sqrt(ex * ex + ez * ez);
			if (dd >= r) continue;
			if (dd < 1e-4) { px += (Math.random() - 0.5) * 0.1; pz += (Math.random() - 0.5) * 0.1; continue; }
			const k = (r - dd) / dd * 0.5 * a.sep * 0.6;
			px += ex * k; pz += ez * k;
		}
		const sl = Math.sqrt(px * px + pz * pz);
		if (sl > 2.5) { px *= 2.5 / sl; pz *= 2.5 / sl; }

		// Integra com colisão no raster (desliza nos eixos).
		const mvx = (a.vx + px) * dt, mvz = (a.vz + pz) * dt;
		if (mvx !== 0 || mvz !== 0) {
			const nx = a.x + mvx, nz = a.z + mvz;
			if (nav.walk(nx, nz)) { a.x = nx; a.z = nz; }
			else if (nav.walk(nx, a.z)) { a.x = nx; a.vz = 0; }
			else if (nav.walk(a.x, nz)) { a.z = nz; a.vx = 0; }
			else a.vx = a.vz = 0;
		}
		// Preso (quer andar e não sai do lugar): refaz o caminho.
		if (a.path && Math.sqrt(a.vx * a.vx + a.vz * a.vz) < 0.15) {
			a.stuck += dt;
			if (a.stuck > 1.2 && a.goal) { a.stuck = 0; const g = a.goal; a.goal = null; a.path = null; this._goto(a.i, g.x, g.z); }
		} else a.stuck = 0;
	}

	// Every agent slot into `out` (grown when too small or handed away): x, z, vx, vz, flags, generation. Returns the array.
	write(out) {
		const S = CrowdSim.STRIDE, A = this.agents, n = A.length;
		if (!out || out.length < n * S) out = new Float32Array(Math.max(64, n * 2) * S);
		for (let i = 0; i < n; i++) {
			const a = A[i], o = i * S;
			if (!a) { out[o + 5] = -1; continue; }
			out[o] = a.x; out[o + 1] = a.z; out[o + 2] = a.vx; out[o + 3] = a.vz;
			out[o + 4] = (a.path ? 1 : 0) | (a.queued ? 2 : 0); out[o + 5] = a.gen;
		}
		return out;
	}
}
