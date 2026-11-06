// ============================================================================
// RoadWorks — OBRAS NA PISTA, dinâmicas (Config.roadworks). De tempos em tempos a prefeitura abre uma vala numa faixa de uma rua ou
// avenida (fora da tela, perto do jogador): cones fazendo o funil, cavaletes listrados nas pontas, a vala com terra, as placas "OBRAS" e
// "DEVAGAR" antes. A faixa fica FECHADA para o trânsito: a IA enxerga a obra como um obstáculo parado (TrafficManager._buildObstacles →
// obstacles()) — reduz, buzina e passa pela faixa ao lado quando ela está livre (TrafficCar._startDetour), formando fila no horário de pico.
// Cones e cavaletes são soltos: o carro que passa por cima arremessa (rolam e ficam deitados). A obra some depois de `life` s (fora da tela).
//   update(dt, game) · obstacles() → [{ x, z, half, hw, ref }] · spawn(e, s, dir) (testes)
// ============================================================================

const RoadWorks = {
	list: [], _t: 0, _src: null,

	_srcMeshes(scene, mats) {
		if (this._src) return this._src;
		const mk = (name, fn) => { const b = new MeshBatch(); fn(b); const m = b.build(name, scene, mats.solid, { vertexColors: true, receiveShadows: false, alwaysActive: false }); m.unfreezeWorldMatrix(); m.isVisible = false; return m; };
		this._src = { cone: mk('rw_cone', (b) => RoadArt.cone(b, 0, 0)), horse: mk('rw_horse', (b) => RoadArt.sawhorse(b, 0, 0, 1, 0)) };
		return this._src;
	},

	// ------------------------------------------------------------------ quadro
	update(dt, game) {
		const C = Config.roadworks;
		if (!C || !C.on || !game.gameEngine || !game.gameEngine.world) return;
		const W = game.gameEngine.world, focus = game.mode === 'car' && game.activeCar ? game.activeCar.position : game.player.position;
		if (Interiors && Interiors.active) return;
		this._t -= dt;
		if (this._t <= 0) {
			this._t = C.every * (0.6 + Math.random() * 0.8);
			if (this.list.length < C.max) this._trySpawn(W, focus);
		}
		for (let i = this.list.length - 1; i >= 0; i--) {
			const w = this.list[i];
			w.age += dt;
			const d = Math.hypot(w.x - focus.x, w.z - focus.z);
			if ((w.age > w.life && !Zones.near(w.x, w.z, 25)) || d > 650) { this._dispose(w); this.list.splice(i, 1); continue; }
			if (d < 90) this._knock(dt, w, game);
		}
	},

	_trySpawn(W, focus) {
		const C = Config.roadworks, P = {};
		for (let tries = 0; tries < 40; tries++) {
			const e = RoadPlan.edges[Math.floor(Math.random() * RoadPlan.edges.length)];
			if (!e || (e.cls !== 'city' && e.cls !== 'isl' && e.cls !== 'ave') || e.layer || e.len < e.cutA + e.cutB + 60) continue;
			const s = e.cutA + 22 + Math.random() * (e.len - e.cutA - e.cutB - 50);
			RoadPlan.at(e, s, P);
			const d = Math.hypot(P.x - focus.x, P.z - focus.z);
			if (d < C.near || d > C.far || Zones.near(P.x, P.z, 20)) continue;
			if (this.list.some((w) => Math.hypot(w.x - P.x, w.z - P.z) < 80)) continue;
			if (typeof StreetDetail !== 'undefined' && (StreetDetail.busStops.some((b) => Math.hypot(b.x - P.x, b.z - P.z) < 18) || StreetDetail.bumpAhead(P.x - P.tx * 12, P.z - P.tz * 12, P.tx, P.tz, 24) >= 0)) continue;
			if (CityGrid.inCrosswalk(P.x, P.z, 12)) continue;
			return this.spawn(e, s, Math.random() < 0.5 ? 1 : -1, W);
		}
		return null;
	},

	spawn(e, s, dir, W = game.gameEngine.world) {
		const C = Config.roadworks, P = RoadPlan.at(e, s), scene = W.scene, src = this._srcMeshes(scene, W.mats);
		const tx = P.tx * dir, tz = P.tz * dir, rx = tz, rz = -tx;                 // quem passa anda em t; a direita dele é r
		const hw = e.w / 2, med = (RoadPlan.CLASS[e.cls].median || 0) / 2, lane = (med + hw) / 2, L = 12 + Math.random() * 6;
		const cx = P.x + rx * lane, cz = P.z + rz * lane, inner = lane - Math.min(2.0, (hw - med) / 2 - 0.4);      // linha dos cones: um pouco para dentro da faixa
		const R = (x, z) => (typeof Relief !== 'undefined' && Relief.on ? Relief.at(x, z) : 0);
		const at = (l, a) => [cx + tx * l + rx * (a - lane), cz + tz * l + rz * (a - lane)];
		const w = { e, s, dir, x: cx, z: cz, tx, tz, L, age: 0, life: C.life[0] + Math.random() * (C.life[1] - C.life[0]), cones: [], meshes: [], position: { x: cx, z: cz }, layer: 0 };
		// cones: o funil (da beira da calçada até a linha de dentro, 9 u antes), a linha ao longo da vala e o fechamento depois
		const pts = [];
		for (let k = 0; k <= 5; k++) { const t = k / 5; pts.push(at(-L / 2 - 9 + t * 9, hw - 0.6 + (inner - (hw - 0.6)) * t)); }
		for (let l = -L / 2 + 1.6; l < L / 2; l += 1.8) pts.push(at(l, inner));
		for (let k = 0; k <= 2; k++) pts.push(at(L / 2 + k * 1.5, inner + (hw - 0.6 - inner) * k / 2));
		pts.forEach((p, i) => {
			const m = src.cone.createInstance('rw_cone_' + i); m.position.set(p[0], R(p[0], p[1]), p[1]); m.rotation.y = Math.random() * 6.28;
			w.cones.push({ m, x: p[0], z: p[1], vx: 0, vz: 0, vy: 0, y: 0, up: true, flying: false, heavy: false });
		});
		for (const l of [-L / 2 - 0.6, L / 2 + 0.6]) {                             // cavaletes atravessados na faixa
			const p = at(l, (inner + hw - 0.6) / 2), m = src.horse.createInstance('rw_horse');
			m.position.set(p[0], R(p[0], p[1]), p[1]); m.rotation.y = Math.atan2(rx, rz) + Math.PI / 2;
			w.cones.push({ m, x: p[0], z: p[1], vx: 0, vz: 0, vy: 0, y: 0, up: true, flying: false, heavy: true });
		}
		// a vala, a terra, o monte e as placas antes (malha própria: some com a obra)
		const b = new MeshBatch(), dec = new MeshBatch(), f = new MeshBatch(), up = [0, 1, 0];
		const decal = (name, x, z, ax, az, sw, sl) => {
			const [u0, v0, u1, v1] = RoadArt.DECAL[name], lx = az, lz = -ax, Q = (a, c) => [x + lx * a + ax * c, 0.045, z + lz * a + az * c];
			dec.tri(Q(-sw, sl), Q(sw, sl), Q(sw, -sl), up, [[u0, v0], [u1, v0], [u1, v1]]); dec.tri(Q(-sw, sl), Q(sw, -sl), Q(-sw, -sl), up, [[u0, v0], [u1, v1], [u0, v1]]);
		};
		const mid = (inner + hw - 0.6) / 2, half = (hw - 0.6 - inner) / 2;
		{ const p = at(-0.8, mid); decal('dig', p[0], p[1], tx, tz, half * 0.85, L / 2 - 2); }
		{ const p = at(L / 2 - 2.5, mid); decal('dirt', p[0], p[1], tx, tz, half + 0.3, 2.2); }
		{
			const p = at(L / 2 - 2.5, mid);                                          // monte de terra
			MeshBatch.anchor = { h: R(p[0], p[1]) };
			b.tube([p[0], 0, p[1]], [p[0], 0.55, p[1]], 0.95, 0.25, [0.45, 0.32, 0.2], 7);
			b.tube([p[0] + tx * 0.6, 0, p[1] + tz * 0.6], [p[0] + tx * 0.6, 0.35, p[1] + tz * 0.6], 0.7, 0.2, [0.52, 0.37, 0.23], 6);
			const q = at(-L / 2 + 2.5, mid);                                          // tubos de concreto esperando
			MeshBatch.anchor = { h: R(q[0], q[1]) };
			for (const o of [-0.4, 0.4]) b.tube([q[0] + rx * o - tx * 0.9, 0.38, q[1] + rz * o - tz * 0.9], [q[0] + rx * o + tx * 0.9, 0.38, q[1] + rz * o + tz * 0.9], 0.36, 0.36, [0.68, 0.68, 0.65], 8);
		}
		for (const [l, kind] of [[-L / 2 - 26, 'obras'], [-L / 2 - 14, 'devagar']]) {
			const p = at(l, hw + 0.9);
			MeshBatch.anchor = { h: R(p[0], p[1]) };
			RoadArt.sign(b, f, p[0], p[1], -tx, -tz, kind, 1.6);
		}
		MeshBatch.anchor = null;
		const opt = { vertexColors: true, receiveShadows: true, alwaysActive: false, relief: true };
		w.meshes.push(b.build('rw_parts', scene, W.mats.solid, opt), dec.build('rw_decal', scene, W.mats.decal, { receiveShadows: true, alwaysActive: false, relief: true }), f.build('rw_signs', scene, W.mats.signs, { receiveShadows: false, alwaysActive: false, relief: true }));
		if (W.shadow) W.shadow.addShadowCaster(w.meshes[0]);
		// obstáculo para a IA: a faixa fechada, do funil ao fim
		const ob = at(-2.5, lane);
		w.obs = { x: ob[0], z: ob[1], half: L / 2 + 6, hw: Math.min(2.4, (hw - med) / 2) };
		this.list.push(w);
		return w;
	},

	_dispose(w) {
		for (const c of w.cones) c.m.dispose();
		for (const m of w.meshes) if (m) { if (game && game.gameEngine && game.gameEngine.world.shadow) game.gameEngine.world.shadow.removeShadowCaster(m); m.dispose(); }
		w.cones.length = 0; w.meshes.length = 0;
	},

	obstacles() { return this.list; },

	// Carro que passa por cima arremessa os cones e cavaletes (voam, giram, quicam e ficam deitados).
	_knock(dt, w, game) {
		const cars = game.carDamage ? game.carDamage.allCars() : [];
		const R = (x, z) => (typeof Relief !== 'undefined' && Relief.on ? Relief.at(x, z) : 0);
		for (const c of w.cones) {
			if (c.flying) {
				c.vy -= 18 * dt; c.x += c.vx * dt; c.z += c.vz * dt; c.y += c.vy * dt;
				c.m.rotation.x += c.spin * dt; c.m.rotation.z += c.spin * 0.6 * dt;
				if (c.y <= 0) {
					c.y = 0;
					if (Math.abs(c.vy) > 2.5) { c.vy = -c.vy * 0.3; c.vx *= 0.6; c.vz *= 0.6; }
					else { c.flying = false; c.vx = c.vz = c.vy = 0; c.m.rotation.x = Math.PI / 2; c.m.rotation.z = 0; }
				}
				c.m.position.set(c.x, R(c.x, c.z) + c.y + (c.flying ? 0 : 0.17), c.z);
				continue;
			}
			if (!c.up) continue;
			for (const car of cars) {
				if (!car || car._asleep || car.wrecked || (car.spec && car.spec.boat)) continue;
				const p = car.position, dx = c.x - p.x, dz = c.z - p.z;
				if (dx * dx + dz * dz > 16) continue;
				const sp = Math.abs(car.speed || 0); if (sp < 1.2) continue;
				const f = car.fwdToRef(this._f || (this._f = new BABYLON.Vector3())), fl = Math.hypot(f.x, f.z) || 1, fx = f.x / fl, fz = f.z / fl;
				const lz = dx * fx + dz * fz, lx = dx * fz - dz * fx;
				if (Math.abs(lz) > (car.halfLen || 2) + 0.2 || Math.abs(lx) > (car.halfW || 1) + 0.2) continue;
				const v = car.velocity, k = c.heavy ? 0.7 : 1.15;
				c.up = false; c.flying = true; c.vx = v.x * k + (Math.random() - 0.5) * 2; c.vz = v.z * k + (Math.random() - 0.5) * 2; c.vy = 2.5 + sp * (c.heavy ? 0.12 : 0.22); c.y = 0.05; c.spin = (Math.random() < 0.5 ? -1 : 1) * (5 + sp * 0.6);
				if (typeof AudioFX !== 'undefined') AudioFX.hit(c.x, c.z);
				if (c.heavy && car.phys) { const pv = car.phys.getLinearVelocity(); car.phys.setLinearVelocity(new BABYLON.Vector3(pv.x * 0.92, pv.y, pv.z * 0.92)); }
				break;
			}
		}
	},
};
