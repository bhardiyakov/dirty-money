// ============================================================================
// Rescue — o RESGATE 192: feridos desacordados na rua e a AMBULÂNCIA que vem buscá-los.
//
//   • FERIDO (NPC._knockOut, Config.injury): quem perde toda a vida pode cair desacordado em vez de morrer. Fica no chão SANGRANDO;
//     sem socorro, a vida se esvai em ~1,5–2 min e ele morre ali (NPC._bleedOut: aí sim é morte — homicídio, se foi você).
//   • A AMBULÂNCIA SÓ VEM SE ALGUÉM LIGAR: uma TESTEMUNHA por perto (pedestre ou policial a até witnessR) liga depois de alguns
//     segundos — sem ninguém por perto, ninguém liga. Você também pode ligar: E perto do ferido, ou no celular (contato Resgate 192).
//     Com um KIT MÉDICO, E perto do ferido ESTANCA o sangue (ele aguenta muito mais até a ambulância chegar).
//   • A ambulância (veículo `ambulancia`, um TrafficCar na malha das ruas) vem de fora da tela com a SIRENE ligada, furando sinal com
//     cuidado, até a rua mais perto do ferido; dois SOCORRISTAS descem, ajoelham e atendem (o sangue para), põem na MACA e levam. A
//     ambulância vai embora com a sirene e some fora da tela. Chegou tarde (ele já morreu): os socorristas voltam sem ele.
//   • Ferido longe de tudo (fora da bolha acordada) se resolve sozinho: socorrido, se alguém ligou; morto, se não.
// API: add(npc) · remove(npc) · call(g, npc, who) · update(g, dt) · prompt(g) · interact(g) · phoneCall(g)
// ============================================================================

// A ambulância: um carro do trânsito que vai a um ALVO (a rota escolhe, em cada esquina, a saída que mais se aproxima dele — como a
// viatura em perseguição) e, chegando, para ali (halt) até os socorristas voltarem.
class Ambulance extends TrafficCar {
	constructor(scene, physics, pos, id, sheet, heading, traffic) {
		super(scene, physics, pos, id, sheet, 0, heading, traffic);
		this.keep = true;                          // (o trânsito não recicla nem reposiciona: o Rescue cuida dela)
		this.goal = null; this.halt = false; this.sirenLit = true;
		this.cruise = Config.injury.ambSpeed;
		this.ignoreSignals = true;                 // (passa no vermelho com a sirene — o trânsito abre caminho)
		this.honker = true;
	}
	get sirenOn() { return this.sirenLit && !this.wrecked && !this.controlled; }
	startRoute(x, z, d, lp = null) {
		this.route = new Route(x, z, d, lp);
		this.route.goal = this.goal;
		this.route.ensure(2);
	}
	update(dt, env) {
		if (this.halt && !this.controlled && !this.wrecked && !(this.burning > 0)) {
			if (!this._resting()) this.driveTo(0, 0, dt, 8, 18);
			this.syncVisual(dt);
			return;
		}
		super.update(dt, env);
	}
}

const Rescue = {
	list: new Set(),        // NPCs desacordados (n.downed)
	units: [],              // ambulâncias atendendo: { car, victim, state, t, medics, stretcher, … }
	_id: 0,
	get C() { return Config.injury; },

	add(n) { this.list.add(n); },
	remove(n) { this.list.delete(n); },

	// O ferido mais perto de (x, z) até r (opcional: só os que ainda ninguém chamou).
	nearest(x, z, r, filter = null) {
		let best = null, bd = r * r;
		for (const n of this.list) {
			if (!n.downed || (filter && !filter(n))) continue;
			const d = (n.position.x - x) ** 2 + (n.position.z - z) ** 2;
			if (d < bd) { bd = d; best = n; }
		}
		return best;
	},

	// Alguém ligou para o 192 pelo ferido n. who: 'player' | o pedestre/policial que ligou.
	call(g, n, who) {
		const D = n && n.downed;
		if (!D || D.called) return false;
		D.called = who === 'player' ? 'player' : 'witness';
		D.retryT = 0;
		const P = g.player.position, near = hypot(n.position.x - P.x, n.position.z - P.z) < 70;
		if (who !== 'player') {
			if (typeof Bubbles !== 'undefined' && who && who.actor) Bubbles.say(who, ['📞 Alô, 192? Tem um homem caído aqui!', '📞 Manda uma ambulância, rápido!', '📞 Socorro, tem gente sangrando!'][Math.floor(Math.random() * 3)], { ms: 2600, key: 'call' + n.id });
			if (near) g._flash('📞 Uma testemunha ligou para o Resgate 192 — a ambulância está a caminho');
		} else {
			g._flash('📞 Você ligou para o Resgate 192 — a ambulância está a caminho');
			if (typeof Phone !== 'undefined' && Phone._me) { Phone._me('resgate', 'Tem uma pessoa caída, sangrando. Manda uma ambulância!'); Phone._msg('resgate', 'Resgate 192: ambulância despachada. Se puder, fique com a vítima e estanque o sangramento.', null, true); }
		}
		return true;
	},

	// Uma testemunha que vê o ferido: pedestre de pé ou policial perto (o jogador não conta).
	_witness(g, n) {
		const R = this.C.witnessR, x = n.position.x, z = n.position.z, R2 = R * R;
		if (g.policeManager) for (const o of g.policeManager.officers) if (o.alive && !o.rag && (o.position.x - x) ** 2 + (o.position.z - z) ** 2 < R2 * 1.6) return o;
		const M = g.npcManager;
		if (M) for (const q of M.npcs) if (q !== n && q.alive && !q.rag && (q.position.x - x) ** 2 + (q.position.z - z) ** 2 < R2) return q;
		return null;
	},

	// ------------------------------------------------------------------ quadro
	update(g, dt) {
		if (!this.list.size && !this.units.length) return;
		const C = this.C, f = g.camera.target, far2 = (Zones.ar + 10) ** 2;
		for (const n of [...this.list]) {
			const D = n.downed;
			if (!D) { this.list.delete(n); continue; }
			// longe de tudo (fora da bolha): ninguém vê — resolve sozinho depois de um tempo
			if ((n.position.x - f.x) ** 2 + (n.position.z - f.z) ** 2 > far2 && !D.unit) {
				D.far = (D.far || 0) + dt;
				if (D.far > 25) { if (D.called) n.rescued(); else n._bleedOut(); }
				continue;
			}
			D.far = 0;
			if (!D.called) {
				if (D.callT === undefined) D.callT = C.callDelay[0] + Math.random() * (C.callDelay[1] - C.callDelay[0]);
				if ((D.callT -= dt) <= 0) {
					D.callT = 5 + Math.random() * 6;
					const w = this._witness(g, n);
					if (w && Math.random() < C.callChance) this.call(g, n, w);
				}
			} else if (!D.unit && this.units.length < C.ambulances && (D.retryT = (D.retryT || 0) - dt) <= 0) {
				D.retryT = 3;
				this._dispatch(g, n);
			}
		}
		for (let i = this.units.length - 1; i >= 0; i--) this._unit(g, this.units[i], dt, i);
	},

	// Manda uma ambulância: nasce numa rua a 90–170 m do ferido, fora da tela, e vai até ele.
	_dispatch(g, n) {
		const T = g.traffic; if (!T || !T.carLib) return null;
		const x = n.position.x, z = n.position.z;
		let L = null;
		for (let k = 0; k < 50 && !L; k++) {
			const c = RoadNet.randomLanePoint(14, { x, z, rMin: 90, rMax: 170 });
			if (!c || c.e.cls === 'trail' || !T._clear(c.point.x, c.point.z, 12)) continue;
			if (Zones.near(c.point.x, c.point.z, 8)) continue;                              // (não aparece do nada na tela)
			L = c;
		}
		if (!L) return null;
		const car = new Ambulance(g.scene, g.physics, L.point, 20000 + (++this._id), T.carLib.sheet('ambulancia'), Math.atan2(L.d.dx, L.d.dz), T);
		car.goal = { x, z };
		car.baseMode = 'drive';
		car.startRoute(L.point.x, L.point.z, L.d, L);
		if (T.shadow) T.shadow.addShadowCaster(car.body);
		g.vehicleManager.vehicles.push(car);
		const u = { car, victim: n, state: 'go', t: 0, medics: [], stretcher: null };
		n.downed.unit = u;
		this.units.push(u);
		return u;
	},

	_release(g, u, i) {
		const c = u.car;
		for (const m of u.medics) m.a.dispose();
		if (u.stretcher) u.stretcher.dispose();
		if (u.victim && u.victim.downed && u.victim.downed.unit === u) u.victim.downed.unit = null;
		if (!c.controlled) {
			const k = g.vehicleManager.vehicles.indexOf(c);
			if (k >= 0) g.vehicleManager.vehicles.splice(k, 1);
			if (g.doors) g.doors.reset(c);
			g.carLights.release(c);
			c.dispose(g.traffic && g.traffic.shadow);
		} else { c.keep = false; c.sirenLit = false; c.halt = false; }      // (o jogador roubou a ambulância: agora é dele)
		this.units.splice(i, 1);
	},

	// Uma ambulância: indo → parada (socorristas descem, atendem, levam na maca) → indo embora → some.
	_unit(g, u, dt, i) {
		const c = u.car, n = u.victim, C = this.C;
		u.t += dt;
		if (c.controlled || c.wrecked || c.burning > 0) {                  // roubada ou destruída: o atendimento acabou (outra virá, se precisar)
			if (n && n.downed && n.downed.unit === u) n.downed.unit = null;
			for (const m of u.medics) m.a.dispose(); u.medics.length = 0;
			if (u.stretcher) { u.stretcher.dispose(); u.stretcher = null; }
			if (c.controlled) { this._release(g, u, i); return; }
			if (u.t > 40 && !Zones.near(c.position.x, c.position.z, 20)) this._release(g, u, i);
			return;
		}
		const p = c.position;
		if (u.state === 'go') {
			if (!n || !n.downed) { this._leave(u); return; }           // (já morreu ou alguém resolveu: dá meia-volta)
			const d = hypot(n.position.x - p.x, n.position.z - p.z);
			if (d < 15 && Math.abs(c.forwardSpeed) < 9) { c.halt = true; u.state = 'stop'; u.t = 0; return; }
			if (d < 32) c.cruise = Math.max(5, C.ambSpeed * (d - 10) / 22);      // chegando: devagar, procurando onde parar
			// demorou demais (preso, rota ruim) e ninguém está vendo: aparece na rua mais perto do ferido
			if (u.t > 75 && !Zones.near(p.x, p.z, 6)) {
				const s = RoadPlan.nearestRoadPoint(n.position.x, n.position.z, 40);
				if (s && !Zones.near(s.x, s.z, 4)) { const L = RoadNet.snapToLane(s.x, s.z, 1, 0) || RoadNet.snapToLane(s.x, s.z, -1, 0); if (L) { c.teleport(L.point.x, L.point.z, Math.atan2(L.d.dx, L.d.dz)); c.halt = true; u.state = 'stop'; u.t = 0; } }
				else u.t = 40;
			}
			return;
		}
		if (u.state === 'stop') {                                       // parou: os dois socorristas descem pela traseira
			if (Math.abs(c.forwardSpeed) > 0.6 && u.t < 3) return;
			const b = this._back(c);
			for (let k = 0; k < 2; k++) {
				const a = StreetLife._actor(g, 'socorrista', b.x + b.rx * (k ? 0.6 : -0.6), b.z + b.rz * (k ? 0.6 : -0.6), b.h, 'walk');
				u.medics.push({ a, x: b.x + b.rx * (k ? 0.6 : -0.6), z: b.z + b.rz * (k ? 0.6 : -0.6), h: b.h, side: k ? 1 : -1 });
			}
			u.state = 'walk'; u.t = 0;
			return;
		}
		if (u.state === 'walk') {                                       // até o ferido (um de cada lado)
			if (!n || !n.downed) { u.state = 'back'; u.t = 0; u.late = true; return; }
			let all = true;
			for (const m of u.medics) {
				const hx = Math.sin(n.heading || 0), hz = Math.cos(n.heading || 0);
				const tx = n.position.x + hz * 0.75 * m.side, tz = n.position.z - hx * 0.75 * m.side;
				if (!this._walk(m, tx, tz, 2.4, dt)) all = false;
			}
			if (all || u.t > 25) {
				u.state = 'treat'; u.t = 0;
				n.downed.stable = true;
				for (const m of u.medics) { m.h = Math.atan2(n.position.x - m.x, n.position.z - m.z); m.a.setHeading(m.h); m.a.play('kneel', 'none') || m.a.play('idle', 'none'); }
				if (typeof Bubbles !== 'undefined' && u.medics[0]) Bubbles.say(u.medics[0].a, 'Calma, a gente tá aqui!', { ms: 2200 });
			}
			this._tickMedics(u, dt);
			return;
		}
		if (u.state === 'treat') {                                      // ajoelhados, atendendo
			this._tickMedics(u, dt);
			if (!n || !n.downed) { u.state = 'back'; u.t = 0; u.late = true; for (const m of u.medics) m.a.play('walk', 'none'); return; }
			if (u.t >= C.treat) {
				u.stretcher = this._stretcher(g);
				n.actor.setVisible(false);                              // (vai na maca)
				u.carried = n;
				u.state = 'back'; u.t = 0;
				for (const m of u.medics) m.a.play('walk', 'none');
			}
			return;
		}
		if (u.state === 'back') {                                       // de volta à ambulância (com a maca, se deu tempo)
			const b = this._back(c);
			let all = true;
			if (u.stretcher && u.medics.length === 2) {
				// com a maca: um na frente (rumo às portas) e o outro atrás, em fila, segurando as pontas
				const A = u.medics[0], B = u.medics[1];
				if (!this._walk(A, b.x, b.z, 1.6, dt)) all = false;
				const fx = Math.sin(A.h), fz = Math.cos(A.h);
				this._walk(B, A.x - fx * 2.3, A.z - fz * 2.3, 2.2, dt); B.h = A.h;
				const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
				u.stretcher.position.set(mx, Relief.at(mx, mz) + 0.85, mz);
				u.stretcher.rotation.y = A.h;
			} else for (const m of u.medics) if (!this._walk(m, b.x + b.rx * 0.6 * m.side, b.z + b.rz * 0.6 * m.side, 2.2, dt)) all = false;
			this._tickMedics(u, dt);
			if (all || u.t > 30) {
				for (const m of u.medics) m.a.dispose(); u.medics.length = 0;
				if (u.stretcher) { u.stretcher.dispose(); u.stretcher = null; }
				const P = g.player.position, near = hypot(p.x - P.x, p.z - P.z) < 80;
				if (u.carried) { u.saved = u.carried; u.carried = null; if (near) g._flash('🚑 A ambulância levou o ferido — ele vai sobreviver'); }
				else if (near && u.late) g._flash('🚑 O resgate chegou tarde demais');
				this._leave(u);
			}
			return;
		}
		if (u.state === 'leave') {                                      // indo embora com a sirene: some fora da tela
			if (!Zones.near(p.x, p.z, 12) && (u.t > 6 || hypot(p.x - g.camera.target.x, p.z - g.camera.target.z) > Zones.sr)) {
				if (u.saved && u.saved.downed) u.saved.rescued();
				this._release(g, u, i);
			} else if (u.t > 90) { if (u.saved && u.saved.downed) u.saved.rescued(); this._release(g, u, i); }
		}
	},

	// Vai embora: a rota volta a ser a de qualquer carro (sem alvo), com a sirene.
	_leave(u) {
		const c = u.car;
		u.state = 'leave'; u.t = 0;
		c.halt = false; c.goal = null; c.cruise = this.C.ambSpeed;
		c.reroute();
	},

	// O ponto atrás da ambulância (portas traseiras), o lado direito e o rumo.
	_back(c) {
		const f = c.fwdToRef(this._f || (this._f = new BABYLON.Vector3())), hl = c.halfLen || 3, p = c.position;
		return { x: p.x - f.x * (hl + 0.8), z: p.z - f.z * (hl + 0.8), rx: f.z, rz: -f.x, h: Math.atan2(-f.x, -f.z) };
	},

	// Anda em linha reta até (x, z) a `sp` m/s (sem atravessar parede). true = chegou.
	_walk(m, x, z, sp, dt) {
		const dx = x - m.x, dz = z - m.z, d = hypot(dx, dz);
		if (d < 0.25) { if (m.moving) { m.moving = false; m.a.play('idle', 'none'); } return true; }
		const k = Math.min(d, sp * dt);
		m.x += dx / d * k; m.z += dz / d * k;
		if (typeof MapGeo !== 'undefined') { const q = { x: m.x, z: m.z }; MapGeo.resolveCircle(q, 0.35); m.x = q.x; m.z = q.z; }
		m.h = Math.atan2(dx, dz);
		if (!m.moving) { m.moving = true; m.a.play(sp > 2.3 ? 'run' : 'walk', 'none') || m.a.play('walk', 'none'); }
		return false;
	},
	_tickMedics(u, dt) {
		for (const m of u.medics) { m.a.setPosition(m.x, m.z); m.a.setHeading(m.h); m.a.update(dt); }
	},

	// A maca (com o ferido coberto pelo lençol), carregada entre os dois socorristas.
	_stretcher(g) {
		const sc = g.scene, root = new BABYLON.TransformNode('maca', sc);
		const mat = (n, c) => { const m = new BABYLON.StandardMaterial(n, sc); m.diffuseColor = new BABYLON.Color3(c[0], c[1], c[2]); m.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1); return m; };
		const M = this._mats || (this._mats = { frame: mat('macaFrame', [0.75, 0.77, 0.8]), sheet: mat('macaLencol', [0.93, 0.94, 0.95]), pad: mat('macaColchao', [0.85, 0.2, 0.18]) });
		const box = (w, h, d, y, m, x = 0) => { const b = BABYLON.MeshBuilder.CreateBox('macaP', { width: w, height: h, depth: d }, sc); b.position.set(x, y, 0); b.material = m; b.parent = root; b.isPickable = false; return b; };
		box(0.62, 0.06, 2.0, 0, M.frame);
		box(0.56, 0.06, 1.9, 0.06, M.pad);
		const body = BABYLON.MeshBuilder.CreateCapsule('macaCorpo', { radius: 0.2, height: 1.7, orientation: BABYLON.Vector3.Forward() }, sc);
		body.position.set(0, 0.22, 0); body.material = M.sheet; body.parent = root; body.isPickable = false;
		return root;                                                    // (comprida ao longo de +Z: os socorristas a carregam em fila)
	},

	// ------------------------------------------------------------------ jogador
	_near(g) {
		if (g.mode !== 'player' || g.player.busy || !this.list.size) return null;
		const p = g.player.position;
		return this.nearest(p.x, p.z, 2.6);
	},
	prompt(g) {
		const n = this._near(g);
		if (!n) return '';
		const D = n.downed, left = Math.max(0, Math.round(D.t));
		if (!D.called) return `<b>E</b> ligar para o Resgate 192<small>ferido desacordado, sangrando — sem socorro ele morre (~${left} s)</small>`;
		if (!D.stable && g.inventory.medkits > 0) return `<b>E</b> estancar o sangue (kit médico)<small>a ambulância já foi chamada — assim ele aguenta até ela chegar</small>`;
		return '';
	},
	interact(g) {
		const n = this._near(g);
		if (!n) return false;
		const D = n.downed;
		if (!D.called) { this.call(g, n, 'player'); return true; }
		if (!D.stable && g.inventory.medkits > 0) {
			g.inventory.medkits--; D.stable = true;
			g._flash('🩹 Você estancou o sangramento — ele aguenta até a ambulância chegar');
			if (typeof Standing !== 'undefined' && Standing.inFavela(n.position.x, n.position.z) && Standing.add) Standing.add('community', 2);
			return true;
		}
		return false;
	},
	// Ligação pelo celular (contato Resgate 192): o ferido mais perto de você (até 90 m) que ainda ninguém chamou.
	phoneCall(g) {
		const p = g.player.position, n = this.nearest(p.x, p.z, 90, (q) => !q.downed.called);
		if (!n) {
			if (typeof Phone !== 'undefined') { Phone._me('resgate', 'Alô, 192?'); Phone._msg('resgate', this.nearest(p.x, p.z, 90) ? 'Resgate 192: já recebemos esse chamado — a ambulância está a caminho.' : 'Resgate 192: não há ocorrência no seu endereço. Em caso de emergência, ligue.', null, true); }
			return false;
		}
		return this.call(g, n, 'player');
	},

	// Sirene das ambulâncias: a mais perto (o PoliceManager junta com a das viaturas).
	sirenNear(pos) {
		let near = Infinity;
		for (const u of this.units) if (u.car.sirenOn) near = Math.min(near, u.car.distanceTo(pos));
		return near;
	},
};
