// ============================================================================
// Stealth — FURTIVIDADE do jogador a pé (Config.stealth):
//   • DERRUBAR POR TRÁS: agachado, chegando por trás de quem NÃO está te vendo (pedestre, policial, traficante), E — ou o golpe, de mãos
//     livres, faca ou taco — dá um mata-leão: ele apaga em SILÊNCIO. Ninguém ouve; só quem estiver OLHANDO vê (CrimeExposure decide,
//     como em qualquer agressão — policial derrubado à vista é agressão a policial). Fica desacordado, sem sangue, por koTime s; acorda
//     assustado: o pedestre foge, o policial/traficante volta e a polícia vem ver o lugar.
//     Com a FACA na mão, o golpe por trás é LETAL (morte silenciosa: homicídio — de novo, só se alguém viu).
//   • CARREGAR / ARRASTAR O CORPO: E perto de um desacordado ou morto. De pé, no OMBRO (mais rápido, mas à vista); agachado (Q),
//     ARRASTANDO (devagar e baixo: a polícia e as testemunhas só notam de perto). E de novo solta — na água funda, o corpo AFUNDA
//     (some: ninguém acha). Visto carregando: flagrante (homicídio, se morto; sequestro, se desacordado).
//   • PORTA-MALAS: com o corpo, E atrás de um carro parado o põe no porta-malas (some da vista; vai junto com o carro); E de novo tira.
//     Desacordado lá dentro ACORDA e bate na tampa: a polícia perto ouve (você junto do carro = sequestro em flagrante); abrir o
//     porta-malas solta a vítima — ela foge e liga (testemunha: dá para intimidar ou subornar antes).
//   • Corpo à vista é ACHADO: o pedestre grita e liga (a polícia vem ao lugar), o policial vai até lá — sem saber quem foi.
//   • "ESTÃO ME VENDO": o olho em cima da cabeça do personagem (só o ícone fechado = ninguém te vê; amarelo = quase; vermelho = te vendo)
//     e uma seta num anel em volta de você apontando cada um que te vê/quase — agachado, procurado ou arrastando um corpo.
// Os desacordados ficam com alive = false (fora da visão da polícia, da mira e das testemunhas) e `ko` = { t, dur, phase, by }; o
// update do NPC/policial chama Stealth.koTick enquanto `ko` existir.
// ============================================================================

const Stealth = {
	drag: null,              // { b: corpo, mode: 'carry' (no ombro, de pé) | 'drag' (arrastando, agachado), reported }
	bodies: new Set(),       // corpos que podem ser achados (derrubados por você ou que você arrastou)
	trunks: new Map(),       // carro → corpo no porta-malas
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
	_shown(a) { return a.visible !== false && (!a.mesh || a.mesh.isEnabled()); },
	_canAct(g) {
		const p = g.player;
		return g.mode === 'player' && p && p.alive && !p.rag && !p.swimming && !(p.depth > 0) && !g.hiding && !g.holdup && !(typeof Interiors !== 'undefined' && Interiors.active);
	},

	// Dá para derrubar `t` por trás agora? (agachado, perto, atrás dele, e ele não está te vendo nem brigando/fugindo)
	_valid(g, t, S) {
		const p = g.player, P = p.position;
		if (!t || !t.alive || t.rag || t.ko || t.free || t.index < 0 || t.surrendered || t.mugger || t._rage || t.arrest || t.shooting) return false;
		if (!t.actor || !this._shown(t.actor) || !Vehicle.sameLevel(t, p)) return false;
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
		const lethal = p.weapon === 'knife';                                                      // (faca na mão: morte silenciosa)
		t.ko.lethal = lethal;
		this.bodies.add(t);
		this.takedowns++;
		// silencioso: só quem está colado e olhando se assusta; o crime é de quem VIU (CrimeExposure). Letal: o homicídio vem com a morte.
		if (g.npcManager) g.npcManager.alertViolence(P, S.noiseR, [t]);
		if (g.heat && !lethal) g.heat.commit(kind === 'cop' ? 'cop_assault' : 'assault');
		if (g.input) g.input.rumble(0.35, 0.2, 160);
		const who = kind === 'cop' ? 'o policial' : kind === 'gang' ? 'o traficante' : 'ele';
		g._flash(lethal ? 'Faca por trás — morte silenciosa' : g.wanted && g.wanted.level > 0 ? 'Derrubou em silêncio' : `Derrubou em silêncio — ${who} vai ficar apagado um tempo`);
		return true;
	},

	// Um quadro do desacordado (chamado pelo update do NPC/policial enquanto t.ko existe).
	koTick(t, dt) {
		const K = t.ko;
		K.t += dt;
		if (K.phase === 'grab' && K.t >= Config.stealth.grabT) {
			if (K.lethal) { this._kill(t); return; }
			K.phase = 'out'; t.actor.play('lie', 'none', { restart: true });
		}
		else if (K.phase === 'out' && K.t >= K.dur) {
			if (t._inTrunk) { K.phase = 'bang'; K.bangT = 0; }                    // (acordou no porta-malas: bate na tampa)
			else if (this.drag && this.drag.b === t) K.dur += 4;              // (sendo carregado: espera soltar)
			else { K.phase = 'rise'; if (!t.actor.play('getup', 'none', { restart: true })) K.phase = 'up'; }
		}
		if (K.phase === 'bang') { this._bangTick(t, dt); return; }
		if (!(this.drag && this.drag.b === t)) t.actor.setPosition(t.transform.position.x, t.transform.position.z);
		t.actor.update(dt);
		if (K.phase === 'up' || (K.phase === 'rise' && t.actor.done)) this._wake(t);
	},

	// Faca por trás: ele morre ali (sangue, o corpo no chão). O homicídio é do jogador — só vira crime se alguém viu (onKill → heat).
	_kill(t) {
		const g = this.game, K = t.ko, P = t.position;
		t.ko = null;
		t.hp = 0;
		t.fsm.setState({ name: 'DEAD', update() {} });
		t.deadTimer = K.kind === 'npc' ? 28 : 40;
		t.actor.play('dead', 'none', { restart: true });
		if (typeof Blood !== 'undefined') { const h = t.heading || 0; Blood.hit(P.x, P.z, Math.sin(h), Math.cos(h), 30, t); Blood.wound(t, 30, false); }
		if (K.kind === 'npc') { if (t.ctx && t.ctx.events && t.ctx.events.onKill) t.ctx.events.onKill(t, 'player', 'npc'); }
		else if (t.manager && t.manager.events && t.manager.events.onOfficerKilled) t.manager.events.onOfficerKilled(t, 'player');
		this.kills = (this.kills || 0) + 1;
	},

	// Acordado no porta-malas: bate na tampa. A polícia perto do carro ouve e vem; vendo você junto do carro = sequestro em flagrante.
	_bangTick(t, dt) {
		const K = t.ko, car = t._inTrunk, g = this.game;
		if (!car || !g) return;
		K.bangT -= dt;
		if (K.bangT > 0) return;
		K.bangT = Config.stealth.bangEvery;
		const C = car.position, P = g.player.position, S = Config.stealth;
		AudioFX.thud(C.x, C.z);
		const dP = Math.hypot(P.x - C.x, P.z - C.z), mine = g.activeCar === car || dP < 8;
		if (dP < 30 && (K.warnT = (K.warnT || 0) - S.bangEvery) <= 0) { K.warnT = 9; g._flash('🔊 Batidas no porta-malas: ele acordou!'); }
		const pm = g.policeManager;
		if (!pm) return;
		let heard = false, sees = false;
		for (const u of pm.units) {
			if (Math.hypot(u.position.x - C.x, u.position.z - C.z) > S.bangHear) continue;
			heard = true;
			if (u.mind && u.mind.sees) sees = true;
		}
		if (!heard) return;
		pm.alertNear(C, S.bangHear);
		if (mine && sees && g.heat) g.heat.commit('kidnapping', CrimeExposure.POLICE);
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
			if (b.alive || b.rag || b.downed || b._carried || b._inTrunk || !b.actor || !this._shown(b.actor) || !b.transform) return;
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
		this.drag = { b, mode: g.player.crouched ? 'drag' : 'carry', reported: false };
		g.player.dragging = b;
		g.player.carrying = this.drag.mode === 'carry';
		this.bodies.add(b);
		g._flash(g.player.crouched ? 'Arrastando o corpo (agachado: discreto) — Q levanta e põe no ombro · E solta' : 'Corpo no ombro — Q agacha e arrasta (mais discreto) · E solta');
	},
	drop(g, quiet = false) {
		const D = this.drag;
		if (!D) return;
		this.drag = null;
		const b = D.b, p = g && g.player;
		if (p) { p.dragging = null; p.carrying = false; }
		if (b.actor && b.actor.mesh) b.actor.mesh.position.y = 0.5;
		if (D.mode === 'carry' && p && b.transform) {                                     // (do ombro para o chão, ao lado)
			const h = p.root.rotation.y, q = this._tmp || (this._tmp = new BABYLON.Vector3());
			q.set(p.position.x + Math.sin(h) * 0.8, 0, p.position.z + Math.cos(h) * 0.8);
			MapGeo.resolveCircle(q, 0.3);
			b.transform.position.x = q.x; b.transform.position.z = q.z;
			b.actor.setPosition(q.x, q.z);
		}
		// na água funda: afunda (some de vez — ninguém acha)
		if (g && b.transform && this._deep(b.transform.position.x, b.transform.position.z)) { this._sink(g, b); return; }
		if (!quiet && g) g._flash('Soltou o corpo');
	},
	_deep(x, z) { return typeof MapGeo !== 'undefined' && MapGeo.waterDepth && MapGeo.waterDepth(x, z) >= Config.stealth.sinkDepth; },
	// Desova: o corpo afunda. Desacordado jogado na água morre afogado — homicídio (se alguém viu).
	_sink(g, b) {
		const K = b.ko, x = b.transform.position.x, z = b.transform.position.z;
		if (K && g.heat) g.heat.commit(K.kind === 'cop' ? 'cop_killed' : 'homicide');
		if (typeof AudioFX !== 'undefined' && AudioFX.splash) AudioFX.splash(x, z); else AudioFX.thud(x, z);
		this.forget(b);
		b.ko = null; b._found = false;
		if (g.npcManager && g.npcManager.npcs.includes(b)) { b.alive = false; b.respawn(); }
		else { b.alive = false; b.deadTimer = 0; if (b.temp) b.actor.setVisible(false); }      // (policial/traficante: volta como outro; reforço some)
		this.sunk = (this.sunk || 0) + 1;
		g._flash('🌊 O corpo afundou — ninguém vai achar');
	},
	// O corpo saiu do jogo (afundou, voltou como outra pessoa): esquece arrasto, porta-malas e "corpo para achar".
	forget(b) {
		if (this.drag && this.drag.b === b) { const g = this.game; this.drag = null; if (g && g.player) { g.player.dragging = null; g.player.carrying = false; } }
		if (b._inTrunk) { this.trunks.delete(b._inTrunk); b._inTrunk = null; if (b.actor) b.actor.setVisible(true); }
		if (b.actor && b.actor.mesh) b.actor.mesh.position.y = 0.5;
		this.bodies.delete(b);
	},

	// ------------------------------------------------------------------ porta-malas
	// Carro parado com a traseira a até trunkR de você (não moto, barco, viatura nem destruído).
	trunkCar(g) {
		if (!this._canAct(g) || g.player.busy) return null;
		const P = g.player.position, R = Config.stealth.trunkR, f = this._f || (this._f = new BABYLON.Vector3());
		let best = null, bd = R;
		for (const c of g.vehicleManager ? g.vehicleManager.vehicles : []) {
			if (!c || c.isBike || c.isBoat || c.spec.boat || c.isChopper || c.destroyed || c.wrecked || c.role || c.speed > 1 || !c.halfLen) continue;
			if (Math.abs(c.position.x - P.x) > 8 || Math.abs(c.position.z - P.z) > 8) continue;
			c.fwdToRef(f);
			const rx = c.position.x - f.x * (c.halfLen + 0.35), rz = c.position.z - f.z * (c.halfLen + 0.35), d = Math.hypot(P.x - rx, P.z - rz);
			if (d < bd && Vehicle.sameLevel(c, g.player)) { bd = d; best = c; }
		}
		return best;
	},
	// Põe o corpo que você carrega no porta-malas do carro.
	stow(g, car) {
		const D = this.drag, b = D.b;
		this.drag = null; g.player.dragging = null; g.player.carrying = false;
		b._inTrunk = car;
		this.trunks.set(car, b);
		this.bodies.delete(b);
		if (!b.ko) b.deadTimer = 1e9;                                                        // (o morto fica lá até alguém tirar)
		b.actor.mesh.position.y = 0.5;
		b.actor.setVisible(false);
		AudioFX.thud(car.position.x, car.position.z);
		// pôr um corpo no porta-malas à vista de alguém é flagrante
		if (CrimeExposure.evaluate(g) && g.heat) g.heat.commit(b.ko ? (b.ko.kind === 'cop' ? 'cop_assault' : 'kidnapping') : 'homicide');
		this.stowed = (this.stowed || 0) + 1;
		g._flash(b.ko ? '🚗 No porta-malas — ele vai acordar e bater na tampa; livre-se dele antes' : '🚗 Corpo no porta-malas — leve para longe (água funda: some de vez)');
	},
	// Tira o corpo do porta-malas: morto ou ainda apagado, vai para o seu ombro; acordado, pula fora, foge e liga.
	unstow(g, car) {
		const b = this.trunks.get(car);
		if (!b) return false;
		this.trunks.delete(car);
		b._inTrunk = null;
		const f = car.fwdToRef(this._f || (this._f = new BABYLON.Vector3())), x = car.position.x - f.x * (car.halfLen + 0.6), z = car.position.z - f.z * (car.halfLen + 0.6);
		b.transform.position.x = x; b.transform.position.z = z;
		b.actor.setPosition(x, z);
		b.actor.setVisible(true);
		const K = b.ko;
		if (K && K.phase === 'bang') {
			this._wake(b);
			const rep = { type: 'kidnapping', severity: 4, masked: !!(g.heat && g.heat.isMasked), x, z };
			if (K.kind !== 'npc') { if (g.heat) g.heat.commit('kidnapping', CrimeExposure.POLICE); }      // (era policial: ele mesmo te prende)
			else if (typeof Witnesses !== 'undefined') Witnesses.witness(g, b, 'kidnap', rep);
			g._flash('😱 Ele pulou do porta-malas e fugiu — vai ligar para a polícia!');
			return true;
		}
		if (!K) b.deadTimer = 28;
		this.grab(g, b);
		return true;
	},
	_trunkTick(g) {
		for (const [car, b] of this.trunks) {
			const gone = car.destroyed || !(g.vehicleManager && g.vehicleManager.vehicles.includes(car)) || !this._inGame(g, b);
			if (!gone) continue;
			this.trunks.delete(car); b._inTrunk = null;
			if (!this._inGame(g, b)) continue;
			// o carro sumiu (rebocado, desmanchado) ou explodiu: o corpo some com ele
			b.ko = null; b.actor.setVisible(true);
			if (g.npcManager && g.npcManager.npcs.includes(b)) { b.alive = false; b.respawn(); } else { b.alive = false; b.deadTimer = 0; }
		}
	},

	// O corpo vem atrás, como numa corda: passou de `rope` u do jogador, é puxado até lá (pelo chão andável), com a cabeça para você.
	_dragTick(g, dt) {
		const D = this.drag, b = D.b, p = g.player;
		if (b.alive || b.rag || !b.transform || !(b.ko || b.deadTimer > 0) || g.mode !== 'player' || !p.alive || p.rag || p.swimming || !this._inGame(g, b)) { this.drop(g, true); return; }
		if (!b.ko) b.deadTimer = Math.max(b.deadTimer, 20);                                     // (o morto não some na sua mão)
		const S = Config.stealth, P = p.position, B = b.transform.position;
		D.mode = p.crouched ? 'drag' : 'carry';                                                  // (Q troca: agachado arrasta, de pé carrega)
		p.carrying = D.mode === 'carry';
		this._seenTick(g, b, D, dt);
		if (D.mode === 'carry') {
			// no ombro: atravessado, na altura dos ombros, um pouco atrás do peito
			const h = p.root.rotation.y;
			B.x = P.x - Math.sin(h) * 0.12; B.z = P.z - Math.cos(h) * 0.12;
			b.heading = h + Math.PI / 2;
			b.actor.setHeading(b.heading);
			b.actor.setPosition(B.x, B.z);
			b.actor.mesh.position.y = 0.5 + S.carryH;
			return;
		}
		b.actor.mesh.position.y = 0.5;
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
	},

	// Carregando/arrastando à vista de alguém: flagrante — homicídio (morto) ou sequestro (desacordado). A polícia vendo: a cada 1,5 s
	// (a perseguição sobe); uma testemunha: o relato uma vez só (ela liga — dá para calar antes).
	_seenTick(g, b, D, dt) {
		this._dragSeenT -= dt;
		if (this._dragSeenT > 0 || !g.heat) return;
		this._dragSeenT = 1.5;
		const ex = CrimeExposure.evaluate(g);
		if (!ex) return;
		const cop = typeof PoliceOfficer !== 'undefined' && b instanceof PoliceOfficer;
		const type = b.ko ? (cop ? 'cop_assault' : 'kidnapping') : (cop ? 'cop_killed' : 'homicide');
		if (CrimeExposure.isLive(ex)) g.heat.commit(type);
		else if (!D.reported) { D.reported = true; g.heat.commit(type); }
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
		if (this.drag) {
			const car = this.trunkCar(g);
			if (car && !this.trunks.has(car)) { this.stow(g, car); return true; }
			this.drop(g); return true;
		}
		const t = this.target(g);
		if (t) return this.takedown(g, t);
		const car = this.trunkCar(g);
		if (car && this.trunks.has(car)) return this.unstow(g, car);                     // (atrás do carro com alguém dentro: o porta-malas primeiro)
		const b = this.bodyNear(g);
		if (b) { this.grab(g, b); return true; }
		return false;
	},
	prompt(g) {
		const D = this.drag;
		if (D) {
			const car = this.trunkCar(g);
			if (car && !this.trunks.has(car)) return '<b>E</b> pôr o corpo no porta-malas<small>some da vista e vai junto com o carro</small>';
			const deep = D.b.transform && this._deep(g.player.position.x + Math.sin(g.player.root.rotation.y) * 0.8, g.player.position.z + Math.cos(g.player.root.rotation.y) * 0.8);
			if (deep) return '<b>E</b> jogar o corpo na água<small>afunda — ninguém vai achar</small>';
			return D.mode === 'carry' ? '<b>E</b> soltar o corpo<small>no ombro: à vista de todos — Q agacha e arrasta (discreto)</small>'
				: '<b>E</b> soltar o corpo<small>arrastando agachado: devagar e discreto — Q levanta e põe no ombro</small>';
		}
		if (!this._canAct(g)) return '';
		const t = this.target(g);
		if (t) return g.player.weapon === 'knife' ? '<b>E</b> faca por trás<small>morte silenciosa — só quem estiver olhando percebe</small>'
			: '<b>E</b> derrubar em silêncio<small>mata-leão por trás, sem ele ver — só quem estiver olhando percebe</small>';
		const car = this.trunkCar(g), tb = car && this.trunks.get(car);
		if (tb) return tb.ko && tb.ko.phase === 'bang' ? '<b>E</b> abrir o porta-malas<small>ele acordou — vai fugir e ligar para a polícia</small>' : '<b>E</b> tirar o corpo do porta-malas';
		const b = this.bodyNear(g);
		if (b) return `<b>E</b> ${g.player.crouched ? 'arrastar' : 'carregar'} o corpo<small>esconda longe da vista: corpo achado chama a polícia</small>`;
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
		if (this.trunks.size) this._trunkTick(g);
		this._t -= dt;
		if (this._t <= 0) { this._t = 0.5; if (this.bodies.size) this._findTick(g); }
		this._seeT -= dt;
		if (this._seeT <= 0) { this._seeT = 0.1; this._seeTick(g); }
	},
};
