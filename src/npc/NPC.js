// ============================================================================
// NPC — pedestre controlado por NavMesh (Recast Crowd) + FSM.
// O crowd atualiza automaticamente o TransformNode do agente; aqui cuidamos
// do sprite, do giro em direção ao movimento, das transições de estado e da
// obediência aos semáforos de pedestre:
//
//   - Só anda onde há NavMesh: calçadas, áreas abertas e faixas de pedestres.
//   - Ao chegar na boca de uma faixa com o sinal NÃO aberto, PARA no meio-fio
//     (anima idle) e espera abrir. Passando o sinal, atravessa.
//   - Se o sinal fecha com ele já na faixa, ACELERA para terminar a travessia.
//   - Em pânico (FLEE) ignora sinais: foge por onde der.
// ============================================================================

class NPC {
	static WADE_DIVE_S = 0.75;          // wade_dive: 9 frames at 12 fps
	// ctx = { signals } (serviços compartilhados do mundo).
	constructor(scene, nav, startPos, id, sprites, ctx, role = null) {
		this.role = role;
		this.umbrella = false;      // guarda-chuva aberto (chuva)
		this._umb = null; this._umbUp = null; this._umbS = 0;
		this.free = null;           // fora do crowd (deitado na areia ou nadando): movido à mão
		this.towel = null;
		this.freeAnim = null;
		this.jogDir = Math.random() < 0.5 ? 1 : -1;
		this.scene = scene;
		this.nav = nav;
		this.ctx = ctx;
		this.id = id;
		this.index = -1;
		this.threat = new BABYLON.Vector3();
		this.target = startPos.clone();
		this.meshes = [];          // sprites não entram no pipeline de sombras do Babylon.

		this.waiting = null;       // faixa onde espera o sinal abrir
		this.waitTime = 0;
		this.crossing = null;      // faixa que está atravessando
		this.fleeAge = 0;          // segundos desde o último susto

		this.maxHp = 30;
		this.hp = this.maxHp;
		this.alive = true;
		this.deadTimer = 0;

		// Transform que o crowd vai dirigir.
		this.transform = new BABYLON.TransformNode(`npc${id}`, scene);
		this.transform.position = startPos.clone();
		this._build(sprites);

		// Parâmetros do agente no crowd.
		this.params = {
			radius: Config.npc.radius,
			height: Config.npc.height,
			maxAcceleration: Config.npc.accel,
			maxSpeed: Config.npc.wanderSpeed,
			collisionQueryRange: 2,
			pathOptimizationRange: 3,
			separationWeight: 2,
		};
		this.index = nav.crowd.addAgent(startPos, this.params, this.transform);

		// FSM.
		this.fsm = new StateMachine(this);
		this.fsm.setState(this._roleState());
	}

	// Sprite 2D: corpo A (cabelo curto) ou B (cabelo longo) + uma das variantes de cor civis.
	_build(sprites) {
		const sheet = this.id % 2 === 0 ? sprites.sheets.civA : sprites.sheets.civB;
		const variant = 2 + (this.id * 7) % sprites.civilianVariants;
		this.actor = new SpriteActor(this.scene, sheet, variant, `npcSprite${this.id}`);
		this.actor.play('idle');
		this.heading = Math.random() * Math.PI * 2;
		this.actor.setHeading(this.heading);
	}

	// ----- Interface usada pelos estados da FSM -----
	setSpeed(speed) {
		this._baseSpeed = speed;
		speed *= this._slopeMul || 1;                                   // relevo: subindo, mais devagar (_slopeTick)
		if (Math.abs(this.params.maxSpeed - speed) < 0.01) return;
		this.params.maxSpeed = speed;
		if (this.index >= 0) this.nav.crowd.updateAgentParameters(this.index, this.params);
	}

	gotoTarget(dest) {
		this.target = dest.clone();
		if (this.index >= 0) this.nav.crowd.agentGoto(this.index, dest);
	}

	distanceToTarget() {
		const p = this.position;
		const dx = p.x - this.target.x;
		const dz = p.z - this.target.z;
		return Math.sqrt(dx * dx + dz * dz);
	}

	toWander() {
		this.fsm.setState(new WanderState(this));
	}

	// Estado "de vocação" (corredor, banhista, nadador) ou perambular. Depois de um susto ele volta a isso.
	_roleState() {
		if (this.role === 'jog') return new JogState(this);
		if (this.role === 'sun') return new SunState(this);
		if (this.role === 'swim') return new SwimState(this);
		return new WanderState(this);
	}
	afterPanic() { this.fsm.setState(this._roleState()); }

	// ------------------------------------------------- fora do crowd (deitado / nadando)
	enterFree() {
		if (this.index >= 0) { this.nav.crowd.removeAgent(this.index); this.index = -1; }
		this.free = {};
	}

	// Volta ao crowd no ponto andável mais próximo (e tira a toalha).
	leaveFree() {
		this._dropTowel();
		this.free = null; this._dive = null;
		this.freeAnim = null; this._freeV = 0; this._freeDepth = 0;
		this.actor.setWaterline(0);                          // (saiu da água)
		this.actor.mesh.position.y = 0.5;
		if (this.index >= 0 || !this.alive || this.rag) return;
		const pos = this.nav.closestPoint(this.transform.position);
		this.transform.position.copyFrom(pos);
		this.params.maxSpeed = Config.npc.wanderSpeed;
		this.index = this.nav.crowd.addAgent(pos, this.params, this.transform);
		this.actor.play('idle', 'none', { restart: true });
	}

	// Morreu/foi arremessado deitado ou nadando: larga a atividade sem mexer no crowd (quem chamou cuida dele).
	_clearActivity() {
		this.umbrella = false;
		this._dropTowel();
		this.free = null; this.freeAnim = null; this._dive = null; this._plunge = 0;
		this.actor.mesh.position.y = 0.5;
	}

	// MERGULHO (banhista): afunda (dive_in), nada peito debaixo d'água por `sec` s (dive) e volta à tona (dive_out). endDive: sobe já.
	startDive(sec) {
		if (this._dive || !this.actor.sheet.getClip('dive', 'none')) return false;
		this._dive = { phase: 'in', t: 0.7, under: sec };
		return true;
	}
	endDive() { if (this._dive && this._dive.phase !== 'out') this._dive = { phase: this._dive.phase === 'in' ? 'in' : 'out', t: this._dive.phase === 'in' ? this._dive.t : 0.7, under: 0 }; }
	get diving() { return !!this._dive && this._dive.phase === 'under'; }

	makeTowel(x, z, heading) {
		const colors = ['#d9453a', '#2f8fd0', '#e8c22c', '#2fa36a', '#e86aa0', '#8e4fb8'];
		const sc = this.scene, c = colors[this.id % colors.length];
		const cache = sc._towelMats || (sc._towelMats = {});
		if (!cache[c]) { const m = new BABYLON.StandardMaterial('towel' + c, sc); m.diffuseColor = BABYLON.Color3.FromHexString(c); m.emissiveColor = BABYLON.Color3.FromHexString(c).scale(0.25); m.specularColor = BABYLON.Color3.Black(); cache[c] = m; }
		const mesh = BABYLON.MeshBuilder.CreateGround('towel', { width: 1.5, height: 2.9 }, sc);
		mesh.material = cache[c];
		mesh.position.set(x, 0.2, z);
		mesh.rotation.y = heading;
		mesh.isPickable = false;
		return mesh;
	}

	_dropTowel() { if (this.towel) { this.towel.dispose(); this.towel = null; } }

	distanceToTargetXZ(x, z) { return hypot(this.position.x - x, this.position.z - z); }

	// Anda em linha reta (sem NavMesh) rumo a (gx, gz) a `speed` u/s e escolhe o clipe pela profundidade:
	// além de wadeDepth m da margem, nada — NADO PEITO no ritmo normal, CRAWL com pressa (voltando, assustado); antes, vadeia (com a
	// água acima da metade do corpo, andando com os braços puxando a água). Na água embala e vira devagar. Retorna a distância que falta.
	freeMove(gx, gz, dt, speed) {
		const p = this.position, dx = gx - p.x, dz = gz - p.z, d = hypot(dx, dz) || 1;
		const WC = Config.water, depth = MapGeo.waterDepth(p.x, p.z), W = WC.wadeDepth, deep = depth > W;
		const crawl = deep && speed > Config.npc.swimSpeed * 1.25, wadeDeep = !deep && depth >= W * WC.deepWade;
		const g = depth > 0 || d <= 0.05 ? 0 : MapGeo.slopeAlong(p.x, p.z, dx / d, dz / d);          // relevo (em terra): mais devagar subindo
		const vt = deep ? speed * (crawl ? 1.35 : 1) : speed * (depth > 0 ? (wadeDeep ? 0.9 : 1.15) : 1.6) * MapGeo.slopeSpeed(g);
		const v = this._freeVs = depth > 0 && this._freeVs != null ? this._freeVs + (vt - this._freeVs) * (1 - Math.exp(-2.5 * dt)) : vt;     // (na água: embala devagar)
		this.actor.setSlope(g);
		if (d > 0.05) {
			p.x += (dx / d) * v * dt; p.z += (dz / d) * v * dt;
			this.heading = this._lerpAngle(this.heading, Math.atan2(dx, dz), 1 - Math.exp(-(deep ? 2.6 : 6) * dt));
		}
		this._freeV = d > 0.05 ? v : 0; this._freeDepth = depth;
		// vadeando/andando: ritmo pela velocidade (pés plantados — Config.anim), não fixo; nadando: braçada no ritmo da velocidade
		const has = (c) => this.actor.sheet.getClip && this.actor.sheet.getClip(c, 'none');
		this.freeAnim = deep ? (crawl || !has('swim_breast') ? { clip: 'swim', rate: Math.max(0.7, Math.min(1.4, v / 2.2)) } : { clip: 'swim_breast', rate: Math.max(0.6, Math.min(1.4, v / 1.4)) })
			: wadeDeep && has('wade') ? { clip: 'wade', rate: Math.max(0.5, v / (Config.anim.walk * 0.54)) }
			: { clip: 'walk', rate: Math.max(0.5, v / Config.anim.walk) };
		// a água passou do peito andando: mergulha no nado (wade_dive, uma vez, enquanto segue em frente)
		if (deep && this._wasDeep === false && has('wade_dive')) this._plunge = NPC.WADE_DIVE_S;
		this._wasDeep = deep;
		if (this._plunge > 0) { this._plunge -= dt; this.freeAnim = { clip: 'wade_dive', rate: 1 }; }
		if (!deep) this._dive = null;
		else if (this._dive) {                                                                 // mergulhando: afunda → debaixo d'água → sobe
			const D = this._dive;
			if ((D.t -= dt) <= 0) {
				if (D.phase === 'in') { D.phase = 'under'; D.t = D.under; }
				else if (D.phase === 'under') { D.phase = 'out'; D.t = 0.7; }
				else this._dive = null;
			}
			if (this._dive) this.freeAnim = { clip: D.phase === 'in' ? 'dive_in' : D.phase === 'out' ? 'dive_out' : 'dive', rate: 1 };
		}
		return d;
	}

	get fleeing() { return this.fsm.name === 'FLEE'; }

	// Assaltado: para, ergue as mãos e se ajoelha encarando `fromPos` até o Game soltar (endSurrender).
	surrender(fromPos) {
		if (this.rag || !this.alive) return;
		this.threat.set(fromPos.x, 0, fromPos.z);
		this.waiting = null; this.crossing = null;
		this.fsm.setState(new SurrenderState(this));
		this.actor.play('surrender', 'none', { restart: true });
	}

	get surrendered() { return this.fsm.name === 'SURRENDER'; }

	// Liberado do assalto: levanta e sai correndo de quem o assaltou.
	endSurrender(fromPos) {
		if (!this.surrendered) return;
		this.panic(fromPos, true);
	}

	// Pânico a partir de uma ameaça (posição do crime, do tiro, da viatura...). Esquece
	// qualquer espera de semáforo: quem está assustado não respeita sinal.
	// (Quem está rendido fica congelado de medo: só `force` — o fim do assalto — o tira dali.)
	panic(threatPos, force = false) {
		if (this.rag) return;                       // voando/caído: só entra em pânico quando levantar
		if (this._rage && this.fsm.current === this._rage) { this._rage.scare(threatPos, force); return; }      // (briga de trânsito, na pista: RoadRage)
		if ((this.fsm.name === 'SURRENDER' || this.fsm.name === 'MUG' || this.fsm.name === 'FIGHT') && !force) return;      // (o assaltante de rua e quem está brigando não se assustam)
		this.umbrella = false;                      // (larga o guarda-chuva)
		if (this.fsm.name === "SWIM" && this.fsm.current.inWater()) { this.fsm.current.scare(threatPos); return; }   // nadando: volta à areia primeiro
		this.threat.copyFrom(threatPos);
		this.waiting = null;
		this.crossing = null;
		this.fleeAge = 0;
		if (this.fsm.name !== 'FLEE') {
			this.fsm.setState(new FleeState(this));
		} else {
			this.fsm.current.enter(); // já fugindo: re-mira e renova o timer.
		}
	}

	// Levou um golpe: cambaleia e, em seguida, foge do agressor (ou revida — ver HurtState e Temper). Brigando, só cambaleia e continua.
	hurt(fromPos) {
		if (this.rag) return;
		this.threat.set(fromPos.x, 0, fromPos.z);
		if (this.fsm.current && this.fsm.current.onHurt) { this.fsm.current.onHurt(fromPos); return; }
		this.waiting = null;
		this.crossing = null;
		this.fsm.setState(new HurtState(this));
	}

	// Dano de bala/golpe/atropelamento. source: 'player' | 'police' | 'npc'. Zerou a vida: morre.
	// impact: { dx, dz, power } (atropelamento) — com força suficiente o pedestre é ARREMESSADO (ragdoll).
	// kind: o golpe (Melee: punch, kick, stab, swing…) ou 'gun' — decide se ele revida e com quê (Temper, HurtState).
	takeDamage(amount, from, source, impact, kind = null) {
		if (!this.alive) return;
		this.hp -= amount;
		this._hitBy = source;                                   // (quem bateu e com quê: quem revida, revida o jogador — ver HurtState)
		this._hitKind = kind;
		if (this.hp <= 0) this.die(from, source, impact);
		else if (impact && impact.power >= Config.ragdoll.minPower) this.ragdoll(from, impact, false);
		else this.hurt(from);
	}

	// Arremessado (ragdoll): sai do crowd, voa/rola/desliza; ao levantar volta ao NavMesh e foge; se morreu,
	// fica no chão com o sprite de morto (e só então solta o dinheiro / conta como crime).
	ragdoll(from, impact, lethal) {
		if (this.rag) return;
		this._clearActivity();
		this.waiting = null; this.crossing = null;
		if (this.index >= 0) { this.nav.crowd.removeAgent(this.index); this.index = -1; }
		if (from) this.threat.set(from.x, 0, from.z);
		this.fsm.setState({ name: lethal ? 'DEAD' : 'RAG', update() {} });
		this.rag = new Ragdoll(
			{ actor: this.actor, pos: this.transform.position, onEnd: (dead) => this._ragEnd(dead) },
			{ dx: impact.dx, dz: impact.dz, power: impact.power, lethal, onLand: (p) => { if (p > 4) AudioFX.thud(this.position.x, this.position.z); } });
		this.heading = this.rag.heading;
	}

	_ragEnd(dead) {
		this.heading = this.rag.heading;
		this.rag = null;
		if (dead) {
			this.deadTimer = 28;
			this.actor.play('dead', 'none', { restart: true }); this.actor.setPhase(1);          // (já deitado: só a pose final; a poça vem do play)
			this.actor.setHeading(this.heading);
			if (this.ctx.events) this.ctx.events.onKill(this, this._killSource, 'npc');
			return;
		}
		if (this._rage && this._rage.getUp()) return;                  // briga de trânsito: levanta ali mesmo, na pista (RoadRage)
		// Levantou: volta ao NavMesh onde caiu e sai correndo.
		const pos = this.nav.closestPoint(this.transform.position);
		this.transform.position.copyFrom(pos);
		this.params.maxSpeed = Config.npc.fleeSpeed;
		this.index = this.nav.crowd.addAgent(pos, this.params, this.transform);
		this.actor.play('idle', 'none', { restart: true });
		this.panic(this.threat);
	}

	// Cai no chão (sprite 'dead' com poça de sangue); o agente sai do crowd para ninguém tropeçar no corpo.
	// Com `impact`, antes disso ele é arremessado (o evento de morte só dispara ao pousar).
	die(from, source, impact) {
		this.alive = false;
		this._rage = null;                                      // (morreu na briga de trânsito: o corpo não é mais dela — RoadRage)
		this._clearActivity();
		this.waiting = null; this.crossing = null;
		if (impact && impact.power >= Config.ragdoll.minPower) {
			this._killSource = source;
			this.ragdoll(from, impact, true);
			return;
		}
		if (this.index >= 0) { this.nav.crowd.removeAgent(this.index); this.index = -1; }
		this.fsm.setState({ name: 'DEAD', update() {} });
		this.deadTimer = 28;
		this.actor.play('dead');
		this.heading = (from ? Math.atan2(this.position.x - from.x, this.position.z - from.z) : this.heading) + (Math.random() - 0.5) * 0.8;
		this.actor.setHeading(this.heading);
		if (this.ctx.events) this.ctx.events.onKill(this, source, 'npc');
	}

	// Volta à vida como "outro" pedestre em outro lugar, longe do jogador.
	respawn() {
		this.mugger = false;                                    // (era o assaltante de um StreetCrime)
		this.restoreLook();
		let pos = null;
		for (let i = 0; i < 12; i++) {
			const p = this.nav.randomWalkable();
			if (!this.ctx.playerPos || hypot(p.x - this.ctx.playerPos().x, p.z - this.ctx.playerPos().z) > 45) { pos = p; break; }
		}
		if (!pos) pos = this.nav.randomWalkable();
		this.transform.position.copyFrom(pos);
		this.params.maxSpeed = Config.npc.wanderSpeed;
		this.index = this.nav.crowd.addAgent(pos, this.params, this.transform);
		this.hp = this.maxHp;
		this.alive = true;
		this.pickpocketed = false;
		this.target = pos.clone();
		this.actor.play('idle', 'none', { restart: true });
		this.fsm.setState(this._roleState());
	}

	// Estilo de roupa (grupo de variantes da paleta: casual, biz, poor, beach, sport, tourist).
	setStyle(group) {
		const G = CharacterRig.VARIANT_GROUPS[group] || CharacterRig.VARIANT_GROUPS.casual;
		this.actor.setVariant(G[0] + Math.floor(Math.random() * (G[1] - G[0] + 1)));
	}

	// Veste outro desenho por um tempo (o piloto que caiu da moto numa briga de trânsito: o mesmo tipo e cores dele). O de antes volta
	// quando ele volta ao pool (relocate / respawn).
	wearLook(sheet, row) {
		if (!this._look0) this._look0 = { sheet: this.actor.sheet, row: this.actor.npcRow };
		this.actor.useSheet(sheet); this.actor.npcRow = row;
	}
	restoreLook() {
		this._rage = null;
		if (!this._look0) return;
		this.actor.useSheet(this._look0.sheet); this.actor.npcRow = this._look0.row;
		this._look0 = null;
	}

	// Fora do crowd (briga de trânsito, na pista): anda em linha reta até (x, z) a `speed` m/s, sem atravessar prédio, virando para lá.
	// Devolve a distância que faltava.
	walkFree(x, z, speed, dt) {
		const p = this.transform.position, dx = x - p.x, dz = z - p.z, d = hypot(dx, dz);
		if (d < 0.05 || speed <= 0) { this._freeV = 0; return d; }
		const k = Math.min(d, speed * dt);
		p.x += dx / d * k; p.z += dz / d * k;
		MapGeo.resolveCircle(p, Config.npc.radius);
		this.heading = this._lerpAngle(this.heading, Math.atan2(dx, dz), 1 - Math.exp(-10 * dt));
		this._freeV = speed;
		return d;
	}

	// Reaparece em `pos` (perto do jogador, fora da tela) com a vocação `role`: o pedestre "novo" que o mundo grande precisa.
	relocate(pos, role, style = null) {
		if (this.rag || !this.alive) return false;
		this.restoreLook();
		this.fsm.setState(new IdleState(this));               // sai do estado atual direito (solta a toalha/vaga, volta ao crowd)
		this._clearActivity();
		this.waiting = null; this.crossing = null; this.fleeAge = 99;
		this.transform.position.set(pos.x, 0, pos.z);
		this.params.maxSpeed = Config.npc.wanderSpeed;
		if (this.index < 0) this.index = this.nav.crowd.addAgent(pos, this.params, this.transform);
		else { this.nav.crowd.agentTeleport(this.index, pos); this.nav.crowd.updateAgentParameters(this.index, this.params); }
		this.role = role;
		if (style) this.setStyle(style);
		this.target = pos.clone();
		this.actor.mesh.position.y = 0.5;
		this.actor.play('idle', 'none', { restart: true });
		this.fsm.setState(this._roleState());
		return true;
	}

	// ------------------------------------------------------------- semáforos
	// Chamado todo frame no estado WANDER. Retorna true se está retido esperando o sinal.
	signalGate() {
		const p = this.position;
		const inter = CityGrid.intersectionNear(p.x, p.z, 22);
		if (!inter) {
			if (this.crossing) { this.crossing = null; this.setSpeed(Config.npc.wanderSpeed); }
			return false;
		}
		const signals = this.ctx.signals;
		const v = this.nav.crowd.getAgentVelocity(this.index);
		const sp = v ? hypot(v.x, v.z) : 0;

		// Já atravessando: com o sinal fechando, corre para terminar; ao sair da faixa, volta ao normal.
		if (this.crossing) {
			const cw = this.crossing;
			if (NPC.inside(cw, p, 0.9)) {
				this.setSpeed(signals.ped(cw).state === 'walk' ? Config.npc.wanderSpeed : Config.npc.hurrySpeed);
				return false;
			}
			this.crossing = null;
			this.setSpeed(Config.npc.wanderSpeed);
		}

		for (const cw of inter.crosswalks) {
			if (NPC.inside(cw, p, 0)) { this.crossing = cw; return false; }     // já está na faixa
			if (!NPC.entering(cw, p, v, sp)) continue;
			if (signals.ped(cw).state === 'walk') { this.crossing = cw; return false; }
			this._hold(cw);
			return true;
		}
		return false;
	}

	_hold(cw) {
		this.waiting = cw;
		this.waitTime = 0;
		this.setSpeed(0);
	}

	release() {
		this.crossing = this.waiting;
		this.waiting = null;
		this.setSpeed(Config.npc.wanderSpeed);
		this.nav.crowd.agentGoto(this.index, this.target);   // retoma o destino
	}

	// (x, z) dentro da faixa `cw`, com folga `m` em todos os lados.
	static inside(cw, p, m) {
		return CityGrid.inCw(cw, p.x, p.z, m);
	}

	// Está na "boca" da faixa (a ~1,8u da ponta) e indo PARA dentro dela? (quem só passa
	// pela calçada ao lado, em direção paralela à rua, não conta.)
	static entering(cw, p, v, sp) {
		if (sp < 0.5) return false;
		let along, lat, aMin, aMax, lMin, lMax, vA;
		if (cw.axis === 'o') {                                                    // faixa girada (perna diagonal): no referencial dela
			const rx = p.x - cw.cx, rz = p.z - cw.cz;
			along = rx * cw.ux + rz * cw.uz; lat = rx * cw.dx + rz * cw.dz; aMin = -cw.hl; aMax = cw.hl; lMin = -cw.hd; lMax = cw.hd; vA = v.x * cw.ux + v.z * cw.uz;
		} else {
			const ax = cw.axis === 'x';
			along = ax ? p.x : p.z; lat = ax ? p.z : p.x;
			aMin = ax ? cw.x0 : cw.z0; aMax = ax ? cw.x1 : cw.z1;
			lMin = ax ? cw.z0 : cw.x0; lMax = ax ? cw.z1 : cw.x1;
			vA = ax ? v.x : v.z;
		}
		if (lat < lMin - 0.9 || lat > lMax + 0.9) return false;
		if (along > aMin - 1.8 && along < aMin + 0.6 && vA > 0.35 * sp) return true;
		if (along < aMax + 1.8 && along > aMax - 0.6 && vA < -0.35 * sp) return true;
		return false;
	}

	// ------------------------------------------------------------ umbrella
	// Baked at build time (tools/asset_baker/props/umbrella.cjs) at the SAME angle as the 2.5D characters (SpriteBaker at 56° elevation):
	// the eight-panel canopy sits above the head, shifted north like the rest of the drawing. One cell (N px, ppu px per metre) per canopy
	// colour, centred in a `pitch`-wide slot of a power-of-two sheet; the eight materials share its texture. The quad goes high (above
	// the head, which tests depth "standing up") but is moved and shrunk to land on screen exactly over the feet (no perspective-camera
	// parallax). Opens/closes in ~0.35 s.
	static get UMB() { return { N: 176, pitch: 256, ppu: 36, y: 5.6, colors: 8, url: './assets/baked/props/umbrella.webp' }; }
	static umbrellaMaterial(scene, i) {
		const cache = scene._umbMats || (scene._umbMats = []), { N, pitch, colors, url } = NPC.UMB, c = i % colors, W = pitch * colors, margin = (pitch - N) / 2;
		if (cache[c]) return cache[c];
		const tex = new BABYLON.Texture(url, scene, true, true, BABYLON.Texture.NEAREST_SAMPLINGMODE, () => {
			if (tex.getSize().width !== W) console.warn(`[NPC] ${url}: ${tex.getSize().width} px wide, expected ${W} (NPC.UMB vs the baker)`);
		});
		tex.hasAlpha = true;
		tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
		tex.uScale = N / W; tex.uOffset = (c * pitch + margin) / W;
		tex.vScale = N / pitch; tex.vOffset = margin / pitch;
		const m = new BABYLON.StandardMaterial('umb' + c, scene);
		m.diffuseTexture = tex; m.emissiveTexture = tex; m.disableLighting = true; m.useAlphaFromDiffuseTexture = true;
		m.transparencyMode = BABYLON.Material.MATERIAL_ALPHATEST; m.alphaCutOff = 0.4; m.backFaceCulling = false;
		return (cache[c] = m);
	}

	_umbrellaTick(dt) {
		const want = this.umbrella && this.alive && !this.rag && !this.free, stand = SpriteActor.standing();
		if (want && !this._umb) {
			const W = NPC.UMB.N / NPC.UMB.ppu, mat = NPC.umbrellaMaterial(this.scene, this.id);
			const flat = BABYLON.MeshBuilder.CreateGround('umb' + this.id, { width: W, height: W }, this.scene);
			const up = BABYLON.MeshBuilder.CreatePlane('umbUp' + this.id, { size: W }, this.scene);      // (2.5D camera: standing, like the NPC)
			up.billboardMode = BABYLON.AbstractMesh.BILLBOARDMODE_Y;
			for (const m of [flat, up]) { m.material = mat; m.isPickable = false; m.setEnabled(false); }
			this._umb = flat; this._umbUp = up; this._umbS = 0;
		}
		if (!this._umb) return;
		this._umbS += ((want ? 1 : 0) - this._umbS) * Math.min(1, dt * 9);
		const s = this._umbS, show = s >= 0.04 || want;
		this._umb.setEnabled(show && !stand);
		this._umbUp.setEnabled(show && stand);
		if (!show) return;
		if (stand) { this._umbrellaStanding(s); return; }
		// Debaixo de um toldo, fica abaixo dele junto com o pedestre (MapGeo.coverAt); senão, acima da cabeça.
		const p = this.transform.position, cov = MapGeo.coverAt(p.x, p.z), y = cov > 0 ? cov - 0.1 : NPC.UMB.y;
		const cam = this.scene.activeCamera, H = cam ? cam.position.y : 0, k = H > y + 1 ? (H - y) / H : 1;     // tira a paralaxe
		const cx = cam ? cam.position.x : p.x, cz = cam ? cam.position.z : p.z;
		this._umb.position.set(cx + (p.x - cx) * k, y, cz + (p.z - cz) * k);
		this._umb.scaling.set(s * k, 1, s * k);
	}
	// 2.5D camera: the umbrella art (baked at the camera's angle, the feet at the cell centre) stands at the NPC's feet like the NPC, and is
	// moved UMB_AHEAD metres toward the camera — no change on screen in an orthographic view, but drawn over the NPC (who is pulled
	// NpcArt.STAND_BIAS toward the camera) instead of cutting through him.
	static get UMB_AHEAD() { return 1.5; }
	_umbrellaStanding(s) {
		const p = this.transform.position, m = this._umbUp, e = Config.camera.tilt * Math.PI / 180, yaw = CompassCamera.yaw || 0, d = NPC.UMB_AHEAD;
		const feet = this.actor.mesh.position.y - NpcArt.LAYER_Y;
		m.position.set(p.x - d * Math.cos(e) * Math.sin(yaw), feet + d * Math.sin(e), p.z - d * Math.cos(e) * Math.cos(yaw));
		m.scaling.set(s, s * SpriteActor.STAND_SCALE, 1);
	}

	// ----- Loop -----
	update(dt) {
		this._umbrellaTick(dt);
		if (this.rag) { this.rag.update(dt); return; }      // arremessado: o Ragdoll comanda o sprite e a posição
		if (!this.alive) {                         // corpo no chão: só espera sumir e reaparecer
			this.deadTimer -= dt;
			this.actor.setPosition(this.transform.position.x, this.transform.position.z);
			this.actor.update(dt);
			if (this.deadTimer <= 0) this.respawn();
			return;
		}
		this.fleeAge += dt;
		this.fsm.update(dt);

		// Deitado na areia ou nadando: sem crowd — o estado move o NPC; aqui só o sprite.
		if (this.free) {
			const S = this.fsm.current, A = (S && S.anim ? S.anim(this._freeV || 0) : this.freeAnim) || { clip: 'idle', rate: 1 };
			this.transform.rotation.y = this.heading;
			if (!this.actor.play(A.clip, A.w || 'none')) this.actor.play(A.clip, 'none');
			const b = this._waveTick(dt), yaw = b ? CompassCamera.yaw || 0 : 0;
			this.actor.setPosition(this.transform.position.x + Math.sin(yaw) * b, this.transform.position.z + Math.cos(yaw) * b);
			this.actor.setHeading(this.heading);
			this._waterTick(dt);                                // (antes do update: a água no corpo vale só no quadro em que é informada)
			this.actor.update(dt, A.rate);
			return;
		}

		// Vira o corpo para a direção do movimento real do agente e escolhe o clipe.
		const v = this.nav.crowd.getAgentVelocity(this.index);
		const sp2 = v ? v.x * v.x + v.z * v.z : 0;
		if (this.fsm.name === 'FIGHT') this.transform.rotation.y = this.heading;        // brigando: encara o adversário (FightState)
		else if (sp2 > 0.3) {
			const targetY = Math.atan2(v.x, v.z);
			const t = 1 - Math.exp(-12 * dt);
			this.transform.rotation.y = this._lerpAngle(this.transform.rotation.y, targetY, t);
			this.heading = this.transform.rotation.y;
		}

		const speed = Math.sqrt(sp2);
		this._slopeTick(dt, v, speed);
		const st = this.fsm.name;
		let rate = 1;
		if (st === 'HURT') this.actor.play('hurt');
		else if (st === 'FIGHT') {                                                // brigando: golpe/tiro (o estado reinicia o clipe) ou guarda/avanço, com a arma na mão
			const A = this.fsm.current.anim(speed);
			if (!this.actor.play(A.clip, A.w)) this.actor.play(A.clip, 'none');
			rate = A.rate;
		}
		else if (st === 'SURRENDER') this.actor.play(this.fsm.current.kneeling ? 'kneel' : 'surrender');
		else if (st === 'MUG') {                                                  // assaltante (StreetCrime): sacar/anunciar parado; andar/correr armado
			const S = this.fsm.current, moving = S.clip === 'walk' || S.clip === 'run';
			this.actor.play(moving && speed < 0.5 ? 'idle' : S.clip, S.weapon) || this.actor.play('idle', 'none');
			if (moving) rate = Math.max(0.5, speed / (S.clip === 'run' ? Config.anim.run : Config.anim.walk));
		}
		else if (speed < 0.5) this.actor.play('idle');
		else if (st === 'SHELTER') { this.actor.play('run'); rate = Math.max(0.5, speed / Config.anim.run); }
		else if (st === 'FLEE') { this.actor.play('scared'); rate = Math.max(0.5, speed / Config.anim.run); }
		else if (st === 'JOG') { this.actor.play('run'); rate = Math.max(0.5, speed / Config.anim.run); }
		else { this.actor.play('walk'); rate = Math.max(0.5, speed / Config.anim.walk); }          // (ritmo pela velocidade: pés plantados — Config.anim)

		this.actor.setPosition(this.transform.position.x, this.transform.position.z);
		this.actor.setHeading(this.heading);
		this.actor.update(dt, rate);
	}

	// Relevo (andando pela navegação): a cada 0,3 s mede a inclinação na direção da velocidade; subindo, o agente fica mais lento
	// (setSpeed × MapGeo.slopeSpeed) e o desenho troca para subindo/escalando (SpriteActor.setSlope). Longe da tela não precisa.
	_slopeTick(dt, v, speed) {
		this._slopeT = (this._slopeT || 0) - dt;
		if (this._slopeT > 0) { this.actor.setSlope(speed > 0.5 ? this._slope || 0 : 0); return; }
		this._slopeT = 0.3;
		const p = this.transform.position;
		const g = speed > 0.5 && v && Zones.near(p.x, p.z, 30) ? MapGeo.slopeAlong(p.x, p.z, v.x / speed, v.z / speed) : 0;
		this._slope = g;
		this.actor.setSlope(speed > 0.5 ? g : 0);
		const m = Math.round(MapGeo.slopeSpeed(g) * 20) / 20;
		if (m !== (this._slopeMul || 1) && this._baseSpeed) { this._slopeMul = m; this.setSpeed(this._baseSpeed); }
	}

	// Ondas (Waves) em quem está na água no modo livre: a água leva junto (vai e volta; na beira empurra para a areia) — só se o
	// destino ainda for água, para não "subir" na areia — e, nadando na superfície, devolve quanto o desenho sobe na tela (u).
	_waveTick(dt) {
		const depth = this._freeDepth || 0, p = this.transform.position;
		if (!(depth > 0) || typeof Waves === 'undefined' || !Zones.near(p.x, p.z, 30)) return 0;
		const c = Waves.current(p.x, p.z, depth, this._wc || (this._wc = {})), k = this._dive ? 0.3 : 1, nx = p.x + c.x * k * dt, nz = p.z + c.z * k * dt;
		if (MapGeo.waterDepth(nx, nz) > 0.3) { p.x = nx; p.z = nz; }
		return depth > Config.water.wadeDepth && !this._dive ? Waves.lift(p.x, p.z, depth) : 0;
	}

	// Na água (só no modo livre: nadando ou vadeando, ver freeMove): o desenho afunda até a linha d'água e, perto da tela, as marolas,
	// a esteira, os respingos e os sons (WaterFx.track). Fora da tela não gasta nada.
	_waterTick(dt) {
		const A = this.freeAnim, depth = A && /^(swim|walk|dive|wade)/.test(A.clip) ? (this._freeDepth || 0) : 0;
		const W = Config.water.wadeDepth, swim = depth > W;
		this.actor.setWaterline(depth > 0 && !swim ? 0.25 + 0.75 * Math.min(1, depth / W) : 0);
		const p = this.transform.position, g = this.ctx && this.ctx.game;
		if (!depth || !g || !g.waterFx || !Zones.near(p.x, p.z, 6)) return;
		g.waterFx.track(this, dt, { x: p.x, z: p.z, depth, speed: this._freeV || 0, swimming: swim, diving: this.diving, heading: this.heading, actor: this.actor,
			wl: 0.25 + 0.75 * Math.min(1, depth / W), who: 'npc' });
	}

	_lerpAngle(a, b, t) {
		let d = (b - a) % (Math.PI * 2);
		if (d > Math.PI) d -= Math.PI * 2;
		if (d < -Math.PI) d += Math.PI * 2;
		return a + d * t;
	}

	get position() {
		return this.transform.position;
	}

	get state() {
		return this.fsm.name;
	}
}
