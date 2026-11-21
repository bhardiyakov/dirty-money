// ============================================================================
// Stealth — FURTIVIDADE do jogador a pé (Config.stealth):
//   • DERRUBAR POR TRÁS: agachado, chegando por trás de quem NÃO está te vendo (pedestre, policial, traficante), E — ou o golpe, de mãos
//     livres, faca ou taco — dá um mata-leão: ele apaga em SILÊNCIO. Ninguém ouve; só quem estiver OLHANDO vê (CrimeExposure decide,
//     como em qualquer agressão — policial derrubado à vista é agressão a policial). Fica desacordado, sem sangue, por koTime s; acorda
//     assustado: o pedestre foge, o policial/traficante volta e a polícia vem ver o lugar.
//   • ARRASTAR O CORPO: E perto de um desacordado ou morto — você o puxa (devagar, sem correr), E de novo solta. Um corpo à vista é
//     ACHADO: o pedestre grita e liga (a polícia vem ao lugar), o policial vai até lá. Arrastando à vista de alguém = flagrante.
//   • "ESTÃO ME VENDO": o olho em cima da cabeça do personagem (só o ícone fechado = ninguém te vê; amarelo = quase; vermelho = te vendo)
//     e uma seta num anel em volta de você apontando cada um que te vê/quase — agachado, procurado ou arrastando um corpo.
// Os desacordados ficam com alive = false (fora da visão da polícia, da mira e das testemunhas) e `ko` = { t, dur, phase, by }; o
// update do NPC/policial chama Stealth.koTick enquanto `ko` existir.
// ============================================================================

const Stealth = {
	drag: null,              // { b: corpo } enquanto arrasta
	bodies: new Set(),       // corpos que podem ser achados (derrubados por você ou que você arrastou)
	takedowns: 0, found: 0,
	_t: 0, _seeT: 0, _dragSeenT: 0,

	// ------------------------------------------------------------------ quem é quem
	_kind(g, t) {
		if (g.gangs && g.gangs.members.includes(t)) return 'gang';
		return typeof PoliceOfficer !== 'undefined' && t instanceof PoliceOfficer ? 'cop' : 'npc';
	},
	// Ainda está no jogo? (reforço que foi embora, pedestre recolhido: o corpo some da lista do gerente dele)
	_inGame(g, b) {
		return (g.npcManager && g.npcManager.npcs.includes(b)) || (g.policeManager && g.policeManager.officers.includes(b)) || (g.gangs && g.gangs.members.includes(b));
	},
	_canAct(g) {
		const p = g.player;
		return g.mode === 'player' && p && p.alive && !p.rag && !p.swimming && !(p.depth > 0) && !g.hiding && !g.holdup && !(typeof Interiors !== 'undefined' && Interiors.active);
	},

	// Dá para derrubar `t` por trás agora? (agachado, perto, atrás dele, e ele não está te vendo nem brigando/fugindo)
	_valid(g, t, S) {
		const p = g.player, P = p.position;
		if (!t || !t.alive || t.rag || t.ko || t.free || t.index < 0 || t.surrendered || t.mugger || t._rage || t.arrest || t.shooting) return false;
		if (!t.actor || t.actor.visible === false || !Vehicle.sameLevel(t, p)) return false;
		const dx = P.x - t.position.x, dz = P.z - t.position.z, d = Math.hypot(dx, dz);
		if (d > S.reach || d < 0.2) return false;
		const h = t.heading || 0;
		if ((Math.sin(h) * dx + Math.cos(h) * dz) / d > S.behindCos) return false;         // (não está de costas para você)
		if (t.mind && t.mind.sees) return false;                                              // policial/traficante te vendo
		const st = t.fsm && t.fsm.name;
		if (t.fleeing || st === 'FIGHT' || st === 'HURT' || st === 'FLEE' || st === 'KO') return false;
		return MapGeo.hasLineOfSight(P.x, P.z, t.position.x, t.position.z);
	},
	target(g) {
		const S = Config.stealth;
		if (!S || !this._canAct(g) || !g.player.crouched || g.player.busy || this.drag) return null;
		let best = null, bd = Infinity;
		const P = g.player.position, try_ = (t) => { if (!this._valid(g, t, S)) return; const d = Math.hypot(P.x - t.position.x, P.z - t.position.z); if (d < bd) { bd = d; best = t; } };
		if (g.npcManager) for (const n of g.npcManager.npcs) try_(n);
		if (g.policeManager) for (const o of g.policeManager.officers) try_(o);
		if (g.gangs) for (const o of g.gangs.members) try_(o);
		return best;
	},

	// ------------------------------------------------------------------ o mata-leão
	takedown(g, t) {
		const S = Config.stealth, p = g.player, P = p.position;
		const h = Math.atan2(t.position.x - P.x, t.position.z - P.z);
		p.root.rotation.y = h;
		if (!p.playAction('takedown', { lock: 0 })) p.playAction('punch', { lock: 0 });
		const kind = this._kind(g, t);
		// ele: congela onde está, de costas para você, colado à sua frente
		if (kind === 'npc') { t._dodge = null; if (t._downed) t._downed(); if (t._clearActivity) t._clearActivity(); t.waiting = null; t.crossing = null; }
		else { t.shooting = false; t.action = null; t.drawn = false; t.free = null; t.vaulting = null; }
		if (t.index >= 0) { t.nav.crowd.removeAgent(t.index); t.index = -1; }
		t.fsm.setState({ name: 'KO', update() {} });
		t.alive = false;
		t.deadTimer = 1e9;
		t.ko = { t: 0, dur: S.koTime[0] + Math.random() * (S.koTime[1] - S.koTime[0]), phase: 'grab', by: 'player', kind, x: 0, z: 0 };
		t.position.x = P.x + Math.sin(h) * S.hold; t.position.z = P.z + Math.cos(h) * S.hold;
		t.heading = h;
		if (t.transform) t.transform.rotation.y = h;
		t.actor.setHeading(h);
		if (!t.actor.play('hurt_b', 'none', { restart: true })) t.actor.play('hurt', 'none', { restart: true });
		this.bodies.add(t);
		this.takedowns++;
		// silencioso: só quem está colado e olhando se assusta; o crime é de quem VIU (CrimeExposure)
		if (g.npcManager) g.npcManager.alertViolence(P, S.noiseR, [t]);
		if (g.heat) g.heat.commit(kind === 'cop' ? 'cop_assault' : 'assault');
		if (g.input) g.input.rumble(0.35, 0.2, 160);
		g._flash(g.wanted && g.wanted.level > 0 ? 'Derrubou em silêncio' : `Derrubou em silêncio — ${kind === 'cop' ? 'o policial' : kind === 'gang' ? 'o traficante' : 'ele'} vai ficar apagado um tempo`);
		return true;
	},

	// Um quadro do desacordado (chamado pelo update do NPC/policial enquanto t.ko existe).
	koTick(t, dt) {
		const K = t.ko;
		K.t += dt;
		if (K.phase === 'grab' && K.t >= Config.stealth.grabT) { K.phase = 'out'; t.actor.play('lie', 'none', { restart: true }); }
		else if (K.phase === 'out' && K.t >= K.dur) {
			if (this.drag && this.drag.b === t) K.dur += 4;                  // (sendo arrastado: espera soltar)
			else { K.phase = 'rise'; if (!t.actor.play('getup', 'none', { restart: true })) K.phase = 'up'; }
		}
		t.actor.setPosition(t.transform.position.x, t.transform.position.z);
		t.actor.update(dt);
		if (K.phase === 'up' || (K.phase === 'rise' && t.actor.done)) this._wake(t);
	},

	// Acordou: o pedestre foge assustado; o policial/traficante volta à ronda — e a polícia vem ver o lugar (sem estrela: não viram quem foi).
	_wake(t) {
		const g = this.game, K = t.ko, p = t.transform.position;
		t.ko = null;
		this.bodies.delete(t);
		if (this.drag && this.drag.b === t) this.drop(g, true);
		t.alive = true;
		t.hp = Math.max(t.hp, t.maxHp * 0.5);
		const pos = t.nav.closestPoint(p);
		p.copyFrom(pos);
		if (K.kind === 'npc') {
			t.params.maxSpeed = Config.npc.fleeSpeed;
			t.index = t.nav.crowd.addAgent(pos, t.params, t.transform);
			t.actor.play('idle', 'none', { restart: true });
			const pl = g && g.player ? g.player.position : p;
			t.panic(new BABYLON.Vector3(pl.x, 0, pl.z), true);
		} else {
			t.params.maxSpeed = t.spec.patrol;
			t.index = t.nav.crowd.addAgent(pos, t.params, t.transform);
			t.actor.play('idle', 'none', { restart: true });
			t.fsm.setState(new PolicePatrolState(t));
			if (t._counted) { t._counted = false; if (t.group && t.group.alive >= 0) t.group.alive++; }      // (traficante: volta a contar no grupo)
		}
		t.deadTimer = 0;
		if (typeof Bubbles !== 'undefined') Bubbles.say(t, K.kind === 'npc' ? 'Fui atacado! Polícia!' : 'Quem me pegou?!', { ms: 2200, key: 'ko' + (t.id || 0) });
		if (g && g.policeManager) g.policeManager.alertNear(pos, Config.police.callRadius);
	},

	// ------------------------------------------------------------------ arrastar
	// Corpo mais perto para arrastar: desacordado (ko) ou morto — não o ferido sangrando (esse é do Resgate) nem quem já está na maca.
	bodyNear(g) {
		if (!this._canAct(g) || g.player.busy || this.drag) return null;
		const P = g.player.position, R = Config.stealth.grabR;
		let best = null, bd = R;
		const try_ = (b) => {
			if (b.alive || b.rag || b.downed || b._carried || !b.actor || b.actor.visible === false || !b.transform) return;
			if (!b.ko && !(b.deadTimer > 0)) return;
			if (b.ko && b.ko.phase !== 'out') return;
			const d = Math.hypot(P.x - b.position.x, P.z - b.position.z);
			if (d < bd && Vehicle.sameLevel(b, g.player)) { bd = d; best = b; }
		};
		if (g.npcManager) for (const n of g.npcManager.npcs) try_(n);
		if (g.policeManager) for (const o of g.policeManager.officers) try_(o);
		if (g.gangs) for (const o of g.gangs.members) try_(o);
		return best;
	},
	grab(g, b) {
		this.drag = { b, keepT: b.deadTimer };
		g.player.dragging = b;
		this.bodies.add(b);
		if (g.player.crouched) g.player.setCrouch(false);
		g._flash('Arrastando o corpo — esconda onde ninguém veja (E solta)');
	},
	drop(g, quiet = false) {
		const D = this.drag;
		if (!D) return;
		this.drag = null;
		if (g && g.player) g.player.dragging = null;
		if (!quiet && g) g._flash('Soltou o corpo');
	},

	// O corpo vem atrás, como numa corda: passou de `rope` u do jogador, é puxado até lá (pelo chão andável), com a cabeça para você.
	_dragTick(g, dt) {
		const D = this.drag, b = D.b, p = g.player;
		if (b.alive || b.rag || !b.transform || !(b.ko || b.deadTimer > 0) || g.mode !== 'player' || !p.alive || p.rag || p.swimming || !this._inGame(g, b)) { this.drop(g, true); return; }
		if (!b.ko) b.deadTimer = Math.max(b.deadTimer, 20);                                     // (o morto não some na sua mão)
		const S = Config.stealth, P = p.position, B = b.transform.position;
		const dx = B.x - P.x, dz = B.z - P.z, d = Math.hypot(dx, dz) || 1;
		if (d > S.rope) {
			const nx = P.x + dx / d * S.rope, nz = P.z + dz / d * S.rope;
			const q = this._tmp || (this._tmp = new BABYLON.Vector3());
			q.set(nx, 0, nz);
			if (typeof MapGeo !== 'undefined' && MapGeo.resolveCircle) MapGeo.resolveCircle(q, 0.3);
			B.x = q.x; B.z = q.z;
		}
		const h = Math.atan2(P.x - B.x, P.z - B.z);
		b.heading = h;
		b.actor.setHeading(h);
		b.actor.setPosition(B.x, B.z);
		if (d > S.rope + 3) this.drop(g, true);                                                   // (enroscou: soltou)
		// arrastando à vista de alguém: flagrante (a polícia te vendo; uma testemunha olhando)
		this._dragSeenT -= dt;
		if (this._dragSeenT <= 0 && g.heat) {
			this._dragSeenT = 1.5;
			const ex = CrimeExposure.evaluate(g);
			if (ex) g.heat.commit(b.ko && b.ko.kind === 'cop' || (!b.ko && typeof PoliceOfficer !== 'undefined' && b instanceof PoliceOfficer) ? 'cop_assault' : 'assault', ex);
		}
	},

	// ------------------------------------------------------------------ corpo achado
	// A cada meio segundo: um corpo à vista de um pedestre (até sightNpc, de frente, sem parede) ou de um policial (até sightCop) é achado
	// — o pedestre grita e liga, o policial vai ver; a polícia de perto vem ao lugar (sem estrela, a não ser que vejam você).
	_findTick(g) {
		const S = Config.stealth;
		for (const b of this.bodies) {
			if (b.alive || !b.transform || (!b.ko && !(b.deadTimer > 0)) || !this._inGame(g, b)) { this.bodies.delete(b); continue; }
			if (b._found || (this.drag && this.drag.b === b)) continue;
			const B = b.position;
			let who = null;
			if (g.policeManager) for (const u of g.policeManager.officers) {
				if (!u.alive || u.rag) continue;
				const dx = B.x - u.position.x, dz = B.z - u.position.z, d = Math.hypot(dx, dz);
				if (d > S.sightCop || d < 0.5) continue;
				const h = u.heading || 0;
				if ((Math.sin(h) * dx + Math.cos(h) * dz) / d < 0.2) continue;
				if (MapGeo.hasLineOfSight(u.position.x, u.position.z, B.x, B.z)) { who = u; break; }
			}
			if (!who && g.npcManager) {
				let rays = 5;
				for (const n of g.npcManager.npcs) {
					if (!n.alive || n.rag || n.free || n.fleeing || rays <= 0) continue;
					const dx = B.x - n.position.x, dz = B.z - n.position.z, d = Math.hypot(dx, dz);
					if (d > S.sightNpc || d < 0.5) continue;
					if ((Math.sin(n.heading) * dx + Math.cos(n.heading) * dz) / d < 0.35) continue;
					rays--;
					if (MapGeo.hasLineOfSight(n.position.x, n.position.z, B.x, B.z)) { who = n; break; }
				}
			}
			if (!who) continue;
			b._found = true;
			this.found++;
			const cop = typeof PoliceOfficer !== 'undefined' && who instanceof PoliceOfficer;
			if (typeof Bubbles !== 'undefined') Bubbles.say(who, cop ? 'Tem alguém caído aqui!' : 'Socorro! Um corpo!', { ms: 2200, key: 'body' + (who.id || 0) });
			if (!cop && who.panic) who.panic(new BABYLON.Vector3(B.x, 0, B.z), true);
			const P = g.player.position, near = Math.hypot(P.x - B.x, P.z - B.z) < 45;
			if (g.policeManager) g.policeManager.alertNear(B, cop ? Config.police.callRadius * 0.6 : Config.police.callRadius);
			if (near) g._flash(cop ? '👁 Um policial achou o corpo — vai ver o lugar' : '👁 Acharam o corpo! A polícia vem ver o lugar');
		}
	},

	// ------------------------------------------------------------------ E e a dica na tela
	interact(g) {
		if (this.drag) { this.drop(g); return true; }
		const t = this.target(g);
		if (t) return this.takedown(g, t);
		const b = this.bodyNear(g);
		if (b) { this.grab(g, b); return true; }
		return false;
	},
	prompt(g) {
		if (this.drag) return '<b>E</b> soltar o corpo<small>arrastando — devagar, sem correr; à vista de alguém é flagrante</small>';
		if (!this._canAct(g)) return '';
		const t = this.target(g);
		if (t) return `<b>E</b> derrubar em silêncio<small>por trás, sem ele ver — só quem estiver olhando percebe</small>`;
		const b = this.bodyNear(g);
		if (b) return '<b>E</b> arrastar o corpo<small>esconda longe da vista: corpo achado chama a polícia</small>';
		return '';
	},

	// ------------------------------------------------------------------ "estão me vendo"
	_build() {
		if (this.el) return;
		const st = document.createElement('style');
		st.textContent = `
			#seeEye { position: fixed; left: 0; top: 0; z-index: 11; pointer-events: none; display: none; white-space: nowrap;
				align-items: center; gap: 5px; padding: 3px 9px 3px 6px; border-radius: 999px; background: rgba(10,12,18,0.72); border: 1px solid rgba(255,255,255,0.12);
				color: #cbd5e1; font: 800 10px/1 var(--font, Inter, system-ui, sans-serif); letter-spacing: .06em; text-transform: uppercase; }
			#seeEye.on { display: flex; }
			#seeEye.hid { padding: 3px 5px; opacity: .8; }
			#seeEye.hid span { display: none; }
			#seeEye i { font-style: normal; font-size: 14px; font-family: var(--emoji, sans-serif); }
			#seeEye.near { color: #fbbf24; border-color: rgba(251,191,36,0.55); }
			#seeEye.see { color: #fff; background: rgba(185,28,28,0.88); border-color: #fca5a5; animation: seeP .5s ease-in-out infinite alternate; }
			@keyframes seeP { to { box-shadow: 0 0 14px rgba(248,113,113,0.8); } }
			#seeRing { position: fixed; inset: 0; pointer-events: none; z-index: 10; }
			#seeRing b { position: absolute; left: 0; top: 0; width: 0; height: 0; border-left: 9px solid transparent; border-right: 9px solid transparent; border-bottom: 16px solid #fbbf24;
				filter: drop-shadow(0 0 3px rgba(0,0,0,0.8)); display: none; }
			#seeRing b.see { border-bottom-color: #ef4444; }
			body:not(.mobile) #seeEye { font-size: 11px; }`;
		document.head.appendChild(st);
		const el = this.el = document.createElement('div');
		el.id = 'seeEye';
		el.innerHTML = '<i></i><span></span>';
		document.body.appendChild(el);
		const ring = this.ring = document.createElement('div');
		ring.id = 'seeRing';
		ring.innerHTML = '<b></b><b></b><b></b><b></b><b></b><b></b>';
		document.body.appendChild(ring);
	},

	// Quem te vê agora (vermelho) ou quase (amarelo): policiais e viaturas (PoliceManager: mind.sees / mind.near), traficantes, helicóptero.
	watchers(g) {
		const out = [];
		const pm = g.policeManager;
		if (pm) {
			for (const u of pm.units) { const m = u.mind; if (m && (m.sees || m.near)) out.push({ x: u.position.x, z: u.position.z, see: !!m.sees }); }
			if (pm.heli && pm.heli.alive && pm.heli.sees && !(g.hiding && !g.hiding.seen)) out.push({ x: pm.heli.position.x, z: pm.heli.position.z, see: true, heli: true });
		}
		if (g.gangs) for (const u of g.gangs.members) if (u.alive && !u.rag && u.mind && u.mind.sees) out.push({ x: u.position.x, z: u.position.z, see: true });
		return out;
	},

	_seeTick(g) {
		this._build();
		const p = g.player, wanted = g.wanted && g.wanted.level > 0;
		const show = g.mode === 'player' && p && p.alive && !g.menu.isOpen && !g.death && !g.arrest && (p.crouched || wanted || !!this.drag) && !(typeof Interiors !== 'undefined' && Interiors.active);
		const W = show ? this.watchers(g) : [];
		const see = W.some((w) => w.see), near = !see && W.length > 0;
		this.state = !show ? null : see ? 'see' : near ? 'near' : 'hidden';
		const el = this.el;
		el.classList.toggle('on', show && (W.length > 0 || p.crouched || !!this.drag));
		el.classList.toggle('see', see); el.classList.toggle('near', near); el.classList.toggle('hid', !see && !near);
		const txt = see ? 'te vendo' : near ? 'quase te vendo' : 'ninguém te vê';
		if (el._t !== txt) { el._t = txt; el.children[0].textContent = see ? '👁️' : near ? '👀' : '🫣'; el.children[1].textContent = txt; }
		// o olho em cima da cabeça; as setas num anel em volta do corpo, apontando cada um — as 6 mais perto
		const B = this.ring.children, P = p.position, yaw = typeof CompassCamera !== 'undefined' ? CompassCamera.yaw || 0 : 0;
		const head = this._proj(g, P, 2.3), body = this._proj(g, P, 1.0);
		if (show) el.style.transform = `translate(calc(${head.x.toFixed(0)}px - 50%), ${(head.y - 30).toFixed(0)}px)`;
		W.sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z));
		const cx = body.x, cy = body.y, R = Math.min(innerWidth, innerHeight) * 0.3;
		for (let i = 0; i < B.length; i++) {
			const w = W[i], b = B[i];
			if (!w) { b.style.display = 'none'; continue; }
			const a = Math.atan2(w.x - P.x, w.z - P.z) - yaw;                                     // (0 = para cima na tela)
			b.style.display = 'block';
			b.className = w.see ? 'see' : '';
			b.style.transform = `translate(${(cx + Math.sin(a) * R - 9).toFixed(0)}px, ${(cy - Math.cos(a) * R - 8).toFixed(0)}px) rotate(${(a * 180 / Math.PI).toFixed(0)}deg)`;
		}
	},

	// Ponto do mundo (x, altura y, z) na tela, em px de CSS; sem cena pronta, o meio da tela.
	_proj(g, src, y) {
		const W = innerWidth, H = innerHeight;
		try {
			const cam = g.camera.camera, eng = g.gameEngine.engine, rw = eng.getRenderWidth(), rh = eng.getRenderHeight();
			const v = BABYLON.Vector3.Project(this._pv || (this._pv = new BABYLON.Vector3()).set(src.x, y, src.z), BABYLON.Matrix.IdentityReadOnly, g.scene.getTransformMatrix(), cam.viewport.toGlobal(rw, rh));
			const x = v.x / rw * W, yy = v.y / rh * H;
			if (x > 0 && x < W && yy > 0 && yy < H) return { x, y: yy };
		} catch (e) { /* (sem câmera ainda) */ }
		return { x: W / 2, y: H / 2 };
	},

	// ------------------------------------------------------------------ loop
	update(g, dt) {
		this.game = g;
		if (this.drag) this._dragTick(g, dt);
		this._t -= dt;
		if (this._t <= 0) { this._t = 0.5; if (this.bodies.size) this._findTick(g); }
		this._seeT -= dt;
		if (this._seeT <= 0) { this._seeT = 0.1; this._seeTick(g); }
	},
};
