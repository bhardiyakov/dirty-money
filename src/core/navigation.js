// ============================================================================
// Navigation — navegação a pé em GRADE (substitui o NavMesh do Recast, que não escala para o mundo grande).
//
// O QUE É ANDÁVEL vem de um raster de 1 u cobrindo o mundo inteiro (Config.world), montado uma vez na carga:
//   1) terreno: toda célula de terra sem paredão (campo, mata, areia, favela...);
//   2) a malha urbana (CityGrid.urbanRects) é apagada: ali só se anda pelo que o CityGrid declara (CityGrid.walkRects:
//      calçadas, faixas de pedestres, praças/parques, orla) — a rua (asfalto) NÃO é andável, como antes;
//   3) todo sólido (CityGrid.obstacles: prédios, cercas, postes, caçambas) é apagado, com folga de um agente. Paredões não: a pé
//      sobe-se qualquer encosta (devagar, com a animação de escalar — SpriteActor.setSlope).
// Valor 1 = andável, 2 = andável encostado numa parede (custa mais no A*), 0 = bloqueado. As consultas e o A* estão em nav/NavGrid.js.
//
// The crowd (pedestrians, police on foot, gang members) runs in a Web Worker (nav/crowdWorker.js: the A* path queue and the
// steering of nav/CrowdSim.js). `crowd` is the main thread's side of it, with the subset of the Recast Crowd API the game uses
// (addAgent, agentGoto, agentTeleport, removeAgent, updateAgentParameters, getAgentVelocity): commands are gathered during the frame
// and sent with one `step`; the answer brings every agent's position and velocity back, and the main thread only copies X/Z onto
// the agents' transforms.
// ============================================================================

// The main thread's side of the crowd: a mirror of every agent (position, velocity, "following a path" / "waiting for one") plus
// the commands of the frame. Steps go to the worker one at a time (the next one leaves when the answer to the previous one has
// arrived; the time in between accumulates), so a slow worker never piles up work. Without a worker (file://, or it failed to start)
// the same CrowdSim runs here, in the same order.
class CrowdProxy {
	static MAX_STEP = 0.1;          // longest step (s) when the worker fell behind
	static LOCAL_PATH_MS = 3;       // A* time per frame when the crowd runs on the main thread

	constructor() {
		this.agents = [];            // slot -> mirror agent | null (FavelaWatch and PoliceOperation read path/queued/params)
		this.free = [];
		this._gens = [];             // generation per slot (a new agent or a teleport bumps it)
		this.cmds = [];
		this.seq = 0;
		this._acc = 0;
		this._busy = false;          // a step is in the worker
		this._state = null;          // latest answer not applied yet
		this._buf = null;            // Float32Array the worker handed back (reused for the next answer)
		this._v = new BABYLON.Vector3();
		this.stats = { paths: 0, ms: 0, fails: 0, maxMs: 0 };
		this.worker = null; this.local = null;
	}

	// Starts the simulation on the raster (once it is built): the worker with a copy of it, or CrowdSim here.
	start(map) {
		if (/^https?:$/.test(location.protocol)) {
			try {
				const w = new Worker('./src/nav/crowdWorker.js'), grid = map.grid.slice();
				w.onmessage = (ev) => { this._state = ev.data; this._busy = false; };
				w.onerror = (e) => { console.warn('[NAV] crowd worker failed; the crowd moves to the main thread:', e.message || e); this._fallback(map); };
				w.postMessage({ t: 'init', w: map.w, h: map.h, minX: map.minX, minZ: map.minZ, grid: grid.buffer }, [grid.buffer]);
				this.worker = w;
				console.log('[NAV] crowd in a Web Worker (paths and steering off the main thread)');
				return;
			} catch (e) { console.warn('[NAV] no crowd worker, the crowd runs on the main thread:', e); }
		}
		this.local = new CrowdSim(map);
	}
	_fallback(map) {
		if (this.local) return;
		if (this.worker) this.worker.terminate();
		this.worker = null; this._busy = false; this._state = null;
		this.local = new CrowdSim(map);
		for (const a of this.agents) if (a) {                               // the worker's agents are gone: re-create them here
			this.local._add(a.index, a.gen, a.x, a.z, this._paramList(a.params), 0);
			if (a.goal) this.local._goto(a.index, a.goal.x, a.goal.z);
		}
	}
	_paramList(P) { return [P.maxSpeed || 0, P.maxAcceleration || 40, P.radius || 0.4, P.separationWeight || 2]; }
	_push(...c) { for (let k = 0; k < c.length; k++) this.cmds.push(c[k]); }

	addAgent(pos, params, transform) {
		let i = this.free.pop();
		if (i === undefined) i = this.agents.length;
		const gen = this._gens[i] = (this._gens[i] || 0) + 1;
		const a = { index: i, gen, x: pos.x, z: pos.z, vx: 0, vz: 0, params, transform, path: false, queued: false, goal: null, sync: 0 };
		this.agents[i] = a;
		transform.position.x = pos.x; transform.position.z = pos.z;
		this._push(CrowdSim.OP.ADD, i, gen, pos.x, pos.z, ...this._paramList(params));
		return i;
	}

	removeAgent(i) {
		if (!this.agents[i]) return;
		this.agents[i] = null;
		this.free.push(i);
		this._push(CrowdSim.OP.REMOVE, i);
	}

	updateAgentParameters(i, params) {
		const a = this.agents[i]; if (!a) return;
		a.params = params;
		this._push(CrowdSim.OP.PARAMS, i, ...this._paramList(params));
	}

	agentTeleport(i, pos) {
		const a = this.agents[i]; if (!a) return;
		const gen = a.gen = this._gens[i] = this._gens[i] + 1;
		a.x = pos.x; a.z = pos.z; a.vx = a.vz = 0; a.path = a.queued = false; a.goal = null;
		a.transform.position.x = pos.x; a.transform.position.z = pos.z;
		this._push(CrowdSim.OP.TELEPORT, i, gen, pos.x, pos.z);
	}

	getAgentVelocity(i) {
		const a = this.agents[i];
		if (!a) return null;
		this._v.set(a.vx, 0, a.vz);
		return this._v;
	}

	// Sends the agent to `dest`. Until an answer computed after this command arrives, it counts as waiting for a path.
	agentGoto(i, dest) {
		const a = this.agents[i]; if (!a) return;
		a.goal = { x: dest.x, z: dest.z };
		if (!a.path) a.queued = true;
		a.sync = this.seq + 1;
		this._push(CrowdSim.OP.GOTO, i, dest.x, dest.z);
	}

	// The world around for the next step (CrowdSim.setWorld): car footprints near the camera and the player on foot (or null).
	setWorld(cars, player) { this._cars = cars; this._player = player; }

	// A shove (the player bumping into someone): moves the agent by (dx, dz) where the ground allows, keeping its path.
	push(i, dx, dz) { if (this.agents[i]) this._push(CrowdSim.OP.PUSH, i, dx, dz); }

	// Raster edit (barricades) for the worker's copy (the local CrowdSim shares the main thread's raster).
	fillCells(r, val) { if (this.worker) this._push(CrowdSim.OP.FILL, r.i0, r.j0, r.i1, r.j1, val); }

	// Every frame: applies the latest answer, then sends this frame's step (or runs it here).
	update(dt) {
		if (this._state) this._apply(this._state);
		this._acc += dt;
		if (this.local) {
			const step = Math.min(this._acc, CrowdProxy.MAX_STEP), seq = ++this.seq;
			this._acc = 0;
			this.local.apply(this.cmds); this.cmds.length = 0;
			this.local.setWorld(this._cars || null, this._player || null);
			this.local.step(step, CrowdProxy.LOCAL_PATH_MS);
			this._buf = this.local.write(this._buf);
			this._apply({ seq, buf: this._buf, n: this.local.agents.length, stats: this.local.nav.stats });
			return;
		}
		if (!this.worker || this._busy) return;
		const step = Math.min(this._acc, CrowdProxy.MAX_STEP), buf = this._buf;
		this._acc = 0; this._busy = true; this._buf = null;
		this.worker.postMessage({ t: 'step', seq: ++this.seq, dt: step, cmds: this.cmds, cars: this._cars || null, player: this._player || null, buf: buf ? buf.buffer : null }, buf ? [buf.buffer] : []);
		this.cmds = [];
	}

	// An answer: positions of the agents whose generation matches (no teleport since), path flags of those with no newer command.
	_apply(m) {
		this._state = null;
		const buf = m.buf instanceof Float32Array ? m.buf : new Float32Array(m.buf), S = CrowdSim.STRIDE, A = this.agents;
		const n = Math.min(m.n, A.length);
		for (let i = 0; i < n; i++) {
			const a = A[i], o = i * S;
			if (!a || buf[o + 5] !== a.gen) continue;
			a.x = buf[o]; a.z = buf[o + 1]; a.vx = buf[o + 2]; a.vz = buf[o + 3];
			if (m.seq >= a.sync) { const f = buf[o + 4]; a.path = (f & 1) !== 0; a.queued = (f & 2) !== 0; }
			a.transform.position.x = a.x; a.transform.position.z = a.z;
		}
		Object.assign(this.stats, m.stats);
		this._buf = buf;
	}
}

class Navigation {
	// Trees with a trunk people walk around (bushes, ferns and flowers are walked through).
	static TRUNKS = new Set(['araucaria', 'banana', 'cypress', 'ipe', 'juca', 'jungle', 'oak', 'palm', 'pine']);

	constructor(scene) {
		this.scene = scene;
		this.crowd = new CrowdProxy();
		this.map = null;                        // NavGrid (raster + A*)
		this.ready = false;
		this.focus = { x: 0, z: 0 };           // onde está o jogador/câmera (randomWalkable sorteia por perto)
		this._debugMesh = null;
	}

	// lamps: the street lamps ({ x, z }: their poles block a cell).
	async init(lamps = []) {
		const t0 = performance.now();
		const W = Config.world, w = this.w = Math.ceil(W.maxX - W.minX), h = this.h = Math.ceil(W.maxZ - W.minZ);
		this.minX = W.minX; this.minZ = W.minZ;
		const g = this.grid = new Uint8Array(w * h);
		this.map = new NavGrid(w, h, this.minX, this.minZ, g);
		const M = WorldMap, c = W.cell, nx = M.nx, nz = M.nz;

		// 1) terreno: células de terra sem paredão (4×4 células de 1 u).
		for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
			const k = j * nx + i;
			if (!M.land[k] || (M.flags[k] & 1)) continue;
			const x0 = i * c, z0 = j * c;
			for (let dz = 0; dz < c && z0 + dz < h; dz++) { const row = (z0 + dz) * w + x0; for (let dx = 0; dx < c && x0 + dx < w; dx++) g[row + dx] = 1; }
		}
		// 2) malha urbana: apaga; só vale o que o CityGrid declara andável.
		for (const r of CityGrid.urbanRects) this._fill(r[0], r[1], r[2], r[3], 0);
		for (const P of CityGrid.urbanPolys || []) this._fillPoly(P, 0);
		for (const P of CityGrid.navRoadPolys || []) this._fillPoly(P, 0);
		for (const r of CityGrid.walkRects) this._fill(r[0], r[1], r[2], r[3], 1);
		for (const P of CityGrid.walkPolys || []) this._fillPoly(P, 1);
		// 2b) cantos arredondados dos quarteirões: fora do arco volta a ser rua.
		for (const f of CityGrid.cornerCarves || []) {
			const ax = f.kx + f.sx * f.r, az = f.kz + f.sz * f.r;
			for (let dz = 0; dz < f.r; dz++) for (let dx = 0; dx < f.r; dx++) {
				const px = f.kx + f.sx * (dx + 0.5), pz = f.kz + f.sz * (dz + 0.5);
				if (hypot(px - ax, pz - az) > f.r) this._fill(px - 0.4, pz - 0.4, px + 0.4, pz + 0.4, 0);
			}
		}
		// 3) sólidos (com a folga de um agente, pela regra "centro da célula dentro").
		const m = 0.35;
		for (const o of CityGrid.obstacles) if (!o.cliff && !o.thin) this._fill(o.x0 - m, o.z0 - m, o.x1 + m, o.z1 + m, 0);      // (paredão: a pé sobe — mais devagar; frade: passa entre eles)
		for (const o of CityGrid.navBlocks) this._fill(o.x0, o.z0, o.x1, o.z1, 0);          // interior da safe house
		// 3b) tree trunks and street-lamp poles: the cell under each (the sidewalk keeps room around them)
		const cell = (x, z) => this._fill(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 0);
		for (const props of CityGrid.blocks.concat(CityGrid.extraBlocks || []).map((b) => b.props).concat([CityGrid.coastProps || []]))
			for (const p of props || []) if (p.type === 'tree' && Navigation.TRUNKS.has(p.kind)) cell(p.x, p.z);
		for (const l of lamps) cell(l.x, l.z);
		// 4) borda: andável encostado em parede (2) custa mais e mantém distância.
		const e = new Uint8Array(g);
		for (let z = 1; z < h - 1; z++) for (let x = 1; x < w - 1; x++) {
			const k = z * w + x;
			if (g[k] && (!g[k - 1] || !g[k + 1] || !g[k - w] || !g[k + w])) e[k] = 2;
		}
		if (typeof FavelaPlan !== 'undefined' && FavelaPlan.built) FavelaPlan.navCost(e, this);      // favela: a pé, pelos becos (a rua custa mais)
		this.grid = this.map.grid = e;
		this.ready = true;
		let n = 0; for (let k = 0; k < e.length; k++) if (e[k]) n++;
		this.buildMs = performance.now() - t0;
		console.log(`[NAV] raster ${w}×${h} (${(n / 1000).toFixed(0)}k células andáveis) em ${this.buildMs.toFixed(0)} ms`);
		this.crowd.start(this.map);
	}

	// Preenche o polígono [[x, z], ...] com `val` (células cujo centro está dentro dele). Só na carga (antes de o crowd começar).
	_fillPoly(P, val) {
		let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
		for (const p of P) { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]); }
		const i0 = Math.max(0, Math.ceil(x0 - this.minX - 0.5)), i1 = Math.min(this.w - 1, Math.floor(x1 - this.minX - 0.5));
		const j0 = Math.max(0, Math.ceil(z0 - this.minZ - 0.5)), j1 = Math.min(this.h - 1, Math.floor(z1 - this.minZ - 0.5));
		const xs = [];
		for (let j = j0; j <= j1; j++) {                                   // varredura: onde a linha do centro das células cruza o polígono
			const z = this.minZ + j + 0.5; xs.length = 0;
			for (let a = 0, b = P.length - 1; a < P.length; b = a++) { const p = P[b], q = P[a]; if ((p[1] > z) !== (q[1] > z)) xs.push(p[0] + (q[0] - p[0]) * (z - p[1]) / (q[1] - p[1])); }
			xs.sort((p, q) => p - q);
			for (let t = 0; t + 1 < xs.length; t += 2) for (let i = Math.max(i0, Math.ceil(xs[t] - this.minX - 0.5)); i <= Math.min(i1, Math.floor(xs[t + 1] - this.minX - 0.5)); i++) this.grid[j * this.w + i] = val;
		}
	}

	// Preenche o retângulo (u de mundo) com `val`, nas células cujo CENTRO está dentro dele (barricadas: a cópia do worker também).
	_fill(x0, z0, x1, z1, val) {
		const r = this.map.fill(x0, z0, x1, z1, val);
		if (r && this.ready) this.crowd.fillCells(r, val);
	}

	// ----------------------------------------------------------------- consultas
	walk(x, z) { return this.map.walk(x, z); }
	los(ax, az, bx, bz) { return this.map.los(ax, az, bx, bz); }
	findPath(sx, sz, gx, gz) { return this.map.findPath(sx, sz, gx, gz); }

	// Ponto andável mais próximo de p (espiral até `max` u). Se não achar, devolve o próprio p.
	closestPoint(p, max = 40) {
		const q = this.map.closestPoint(p.x, p.z, max);
		return new BABYLON.Vector3(q.x, 0, q.z);
	}

	// Ponto andável aleatório num raio de `center` (como o Recast).
	randomPoint(center, radius) {
		for (let t = 0; t < 40; t++) {
			const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
			const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
			if (this.walk(x, z)) return new BABYLON.Vector3(x, 0, z);
		}
		return this.closestPoint(center, 12);
	}

	// Ponto andável aleatório PERTO do foco (jogador): entre rMin e rMax u dele. (O mundo é grande: ninguém nasce longe.)
	randomWalkable(rMin = 0, rMax = 170) {
		const f = this.focus;
		for (let t = 0; t < 80; t++) {
			const a = Math.random() * Math.PI * 2, r = rMin + Math.sqrt(Math.random()) * (rMax - rMin);
			const x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r;
			if (this.walk(x, z)) return new BABYLON.Vector3(x, 0, z);
		}
		return this.closestPoint(new BABYLON.Vector3(f.x, 0, f.z), 30);
	}

	update(dt) {
		if (this.ready) this.crowd.update(dt);
	}

	// Visualização do raster para debug (tecla N): textura da área ao redor do foco.
	getDebugMesh() {
		if (!this.ready) return null;
		if (!this._debugMesh) {
			const S = 256, tex = new BABYLON.DynamicTexture('navDbg', { width: S, height: S }, this.scene, false);
			tex.hasAlpha = true;
			const mat = new BABYLON.StandardMaterial('navDbgMat', this.scene);
			mat.diffuseTexture = tex; mat.emissiveColor = new BABYLON.Color3(0.4, 0.8, 1); mat.disableLighting = true; mat.useAlphaFromDiffuseTexture = true;
			const m = BABYLON.MeshBuilder.CreateGround('navDbg', { width: S, height: S }, this.scene);
			m.material = mat; m.position.y = 0.3; m.isPickable = false; m._tex = tex; m._t = 0;
			m.onBeforeRenderObservable.add(() => {
				const f = this.focus, ox = Math.floor(f.x) - S / 2, oz = Math.floor(f.z) - S / 2;
				if (m._ox === ox && m._oz === oz) return;
				m._ox = ox; m._oz = oz;
				const ctx = tex.getContext(), img = ctx.createImageData(S, S);
				for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
					const v = this.walk(ox + i + 0.5, oz + (S - 1 - j) + 0.5) ? this.grid[(oz + (S - 1 - j) - this.minZ) * this.w + (ox + i - this.minX)] : 0;
					const o = (j * S + i) * 4;
					img.data[o] = v === 2 ? 255 : 40; img.data[o + 1] = v ? 200 : 0; img.data[o + 2] = v ? 255 : 0; img.data[o + 3] = v ? 90 : 0;
				}
				ctx.putImageData(img, 0, 0); tex.update();
				m.position.x = ox + S / 2; m.position.z = oz + S / 2;
			});
			this._debugMesh = m;
		}
		return this._debugMesh;
	}
}
