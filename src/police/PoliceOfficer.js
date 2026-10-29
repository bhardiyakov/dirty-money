// ============================================================================
// PoliceOfficer — policial a pé (agente do NavMesh / crowd do Recast), ARMADO.
// Mesma FSM da viatura: PATROL (perambula) e CHASE (vai ao ponto previsto do jogador).
//
// Regra de ouro: a arma só sai do coldre — e só dispara — quando as "armas estão
// liberadas" (o jogador ATIROU há pouco). Sem tiros do jogador, o policial persegue
// e tenta prender, sem atirar. Com armas liberadas ele para a ~20u, saca, mira (com
// imprecisão que cresce com a distância) e atira se tiver linha de visada.
// ============================================================================

class PoliceOfficer {
    // Tipos de combatente. clip = arma desenhada na mão (sprite) | gun = arma de verdade (Weapons) |
    // burst/gap/pause = rajada de `burst` tiros a cada `gap` s e uma pausa sorteada em `pause` | spread = precisão.
    static get KINDS() {
        const V = CharacterRig;
        return {
            cop:  { sheet: 'police', variant: 1, hp: 70, clip: 'pistol', gun: 'pistol', burst: 1, gap: 0, pause: [0.95, 1.8], spread: 1, hurt: 0.28,
                    chase: Config.police.officerChaseSpeed, patrol: Config.police.officerPatrolSpeed, range: Config.police.shootRange },
            swat: { sheet: 'swat', variant: V.VARIANT_SWAT, hp: 160, clip: 'smg', gun: 'smg', burst: 5, gap: 0.12, pause: [0.8, 1.5], spread: 0.85, hurt: 0.1,
                    chase: 6.3, patrol: 1.7, range: 40 },
            army: { sheet: 'army', variant: V.VARIANT_ARMY, hp: 200, clip: 'shotgun', gun: 'rifle', burst: 4, gap: 0.1, pause: [0.7, 1.3], spread: 0.8, hurt: 0.08,
                    chase: 6.3, patrol: 1.7, range: 44 },
            // (velocidades a pé em m/s: perseguindo, todos um pouco mais lentos que o jogador correndo — Config.player.sprintSpeed)
            // Traficantes da favela (GangManager): moradores armados; a arma e a coragem crescem com a profundidade.
            gang1: { sheet: 'civA', group: 'poor', owner: 'gang', hp: 60, clip: 'pistol', gun: 'pistol', burst: 1, gap: 0, pause: [1.1, 2.0], spread: 1.1, hurt: 0.28, chase: 5.0, patrol: 1.4, range: 24 },
            gang2: { sheet: 'civA', group: 'poor', owner: 'gang', hp: 85, clip: 'smg', gun: 'smg', burst: 3, gap: 0.14, pause: [1.3, 2.2], spread: 1.35, hurt: 0.18, chase: 5.4, patrol: 1.5, range: 28 },
            gang3: { sheet: 'civA', group: 'poor', owner: 'gang', hp: 110, clip: 'shotgun', gun: 'rifle', burst: 2, gap: 0.12, pause: [1.3, 2.2], spread: 1.3, hurt: 0.12, chase: 5.8, patrol: 1.5, range: 32 },
        };
    }

    // Velocidade de perseguição: policial comum com 1★ corre menos (Config.police.oneStar.chaseMul).
    get chaseSpeed() {
        const g = this.manager && this.manager.game;
        return this.spec.chase * (this.kind === 'cop' && g && g.wanted && g.wanted.level === 1 ? Config.police.oneStar.chaseMul : 1);
    }

    // manager = PoliceManager (armas liberadas, combate) | temp = reforço que some depois | kind: 'cop'|'swat'|'army'.
    constructor(scene, nav, startPos, id, sprites, manager, temp = false, kind = 'cop') {
        this.scene = scene;
        this.nav = nav;
        this.id = id;
        this.manager = manager;
        this.temp = temp;
        this.kind = kind;
        this.spec = PoliceOfficer.KINDS[kind];
        this.meshes = [];

        this.targetPos = new BABYLON.Vector3();
        this.targetVel = new BABYLON.Vector3();
        this.dest = startPos.clone();

        this.transform = new BABYLON.TransformNode(`officer${id}`, scene);
        this.transform.position = startPos.clone();
        this._build(sprites);

        this.params = {
            radius: Config.police.officerRadius,
            height: 1.6,
            maxAcceleration: 40,
            maxSpeed: this.spec.patrol,
            collisionQueryRange: 2,
            pathOptimizationRange: 3,
            separationWeight: 2,
        };
        this.index = nav.crowd.addAgent(startPos, this.params, this.transform);

        this._wanderTimer = 0;
        this._recompute = 0;

        this.maxHp = this.spec.hp;
        this.hp = this.maxHp;
        this.alive = true;
        this.deadTimer = 0;

        this.alertUntil = 0;         // ouviu um tiro: persegue até esse instante (relógio do PoliceManager)
        this.drawn = false;          // arma na mão
        this.holsterTimer = 0;
        this.fireCd = 0.4 + Math.random();
        this.guard = null;           // { x, z }: guarda de bloqueio de rua (fica no posto)
        this.burstLeft = 0;          // tiros que faltam na rajada atual
        this.shooting = false;       // parado, mirando
        this.hurtTimer = 0;
        this.action = null;          // { name } (draw | shoot) tocando
        this._shootLeft = 0;

        this.fsm = new StateMachine(this);
        this.fsm.setState(new PolicePatrolState(this));
    }

    // Sprite do combatente: policial = uniforme azul-marinho e boné; SWAT = preto, capacete e colete; soldado = verde-oliva.
    _build(sprites) {
        let variant = this.spec.variant;
        if (this.spec.group) { const [a, b] = CharacterRig.VARIANT_GROUPS[this.spec.group]; variant = a + Math.floor(Math.random() * (b - a + 1)); }
        // 2,5D (NpcArt): PM (homem/mulher), BOPE (capacete/touca ninja), Exército e os traficantes de cada arma — cada um com variantes.
        const pick = sprites.npc && sprites.npc.pick(this.kind === 'cop' ? 'police' : this.kind, NpcData.hashStr(`officer${this.id}:${this.kind}`));
        if (pick) this.actor = new SpriteActor(this.scene, sprites.npc.sheet(pick.id, sprites.sheets[this.spec.sheet], variant), pick.row, `officerSprite${this.id}`);
        else this.actor = new SpriteActor(this.scene, sprites.sheets[this.spec.sheet], variant, `officerSprite${this.id}`);
        this.actor.play('idle');
        this.heading = Math.random() * Math.PI * 2;
        this.actor.setHeading(this.heading);
    }

    setTarget(pos, vel) {
        this.targetPos.copyFrom(pos);
        this.targetVel.copyFrom(vel);
    }

    setAlert(alerted) {
        if (!this.alive) return;
        if (!alerted && this.free) this._exitFree();
        const chasing = this.fsm.name === 'CHASE';
        if (alerted && !chasing) this.fsm.setState(new PoliceChaseState(this));
        else if (!alerted && chasing) this.fsm.setState(new PolicePatrolState(this));
    }

    _setSpeed(s) {
        if (Math.abs(this.params.maxSpeed - s) < 0.01) return;
        this.params.maxSpeed = s;
        if (this.index >= 0) this.nav.crowd.updateAgentParameters(this.index, this.params);
    }

    // ----- Estados -----
    onPatrolEnter() {
        this.shooting = false;
        this._setSpeed(this.spec.patrol);
        this._pickWanderTarget();
    }

    onChaseEnter() {
        this._setSpeed(this.chaseSpeed);
        this._recompute = 0;
    }

    patrol(dt) {
        if (this.guard) { this._holdPost(dt); return; }
        this._wanderTimer -= dt;
        if (this._wanderTimer <= 0 || this._distToDest() < 2) this._pickWanderTarget();
    }

    // Guarda de bloqueio: volta/permanece no posto (não persegue).
    _holdPost(dt) {
        this._recompute -= dt;
        if (this._recompute > 0) return;
        this._recompute = 0.6;
        const g = this.guard, p = this.position;
        if (hypot(p.x - g.x, p.z - g.z) > 1.4) {
            this.dest = new BABYLON.Vector3(g.x, 0, g.z);
            this.nav.crowd.agentGoto(this.index, this.dest);
        }
    }

    chase(dt) {
        const dist = this._distToTarget();
        const free = this.manager.weaponsFree || !!this.foe;           // (operação na favela: atira nos traficantes mesmo sem o jogador ter atirado)
        this.fireCd -= dt;
        if (this._meleeStep(dt, dist, free)) return;

        // Armas liberadas, alvo ao alcance e à vista: para, saca e atira.
        if (free && this.mind && this.mind.sees && dist < this.spec.range) {
            this.shooting = true;
            this._setSpeed(0);
            this.heading = Math.atan2(this.targetPos.x - this.position.x, this.targetPos.z - this.position.z);
            if (!this.drawn) { if (!this.action) this._play('draw', () => { this.drawn = true; }); }   // (não reinicia o saque a cada frame)
            // (a rajada pode reiniciar o clipe de tiro a cada disparo; só o saque trava)
            else if (this.fireCd <= 0 && (!this.action || this.action.name === 'shoot') && this.hurtTimer <= 0) this._shoot(dist);
            return;
        }

        // Senão: persegue (com a arma na mão se ela já estava sacada).
        if (this.shooting) { this.shooting = false; this._setSpeed(this.chaseSpeed); }
        if (this.guard) { this._holdPost(dt); return; }                 // guarda de bloqueio fica no posto
        this._recompute -= dt;
        if (this._recompute <= 0) {
            const lead = Math.min(Config.police.leadTimeMax, dist / Config.police.interceptSpeed);
            const predicted = this.targetPos.add(this.targetVel.scale(lead));
            this.dest = this.nav.closestPoint(predicted);
            this.nav.crowd.agentGoto(this.index, this.dest);
            this._recompute = 0.35;
            // O alvo está fora do NavMesh (quintal, viela atrás de grade) e à vista: segue em linha reta, pulando grades e muros.
            if (this.mind && this.mind.sees && dist < 30 && this._offNav(this.targetPos)) this._enterFree();
        }
    }

    // ----- Corpo a corpo -----
    // Colado no jogador (a pé): golpe de verdade (Combat.strike). PM sem armas liberadas: cassetete (amansa para prender);
    // traficante, BOPE e Exército: soco ou chute (de perto, em vez de atirar). true = está golpeando (o resto do chase espera).
    _meleeStep(dt, dist, free) {
        this.meleeCd = (this.meleeCd || 0) - dt;
        const g = this.manager.game, P = g && g.player;
        if (this.action && this.action.melee) {                       // no meio do golpe: parado, encarando
            this._setSpeed(0);
            if (P) this.heading = Math.atan2(P.position.x - this.position.x, P.position.z - this.position.z);
            return true;
        }
        if (this.foe || !P || g.mode !== 'player' || !P.alive || P.rag || g.hiding || this.hurtTimer > 0 || this.action) return false;
        if (dist > 1.35 || this.meleeCd > 0 || (this.mind && !this.mind.sees)) return false;
        const cop = this.kind === 'cop';
        if (cop && free) return false;                                 // (com armas liberadas a PM atira)
        const kind = cop ? 'baton' : Math.random() < 0.35 ? 'kick' : 'punch';
        if (!this.actor.play(kind === 'baton' ? 'swing' : kind, kind === 'baton' ? 'baton' : 'none', { restart: true })) return false;
        this.action = { name: kind, melee: true, onDone: () => this._setSpeed(this.chaseSpeed) };
        this.shooting = false;
        this._setSpeed(0);
        this.heading = Math.atan2(P.position.x - this.position.x, P.position.z - this.position.z);
        g.combat.strike({ position: this.position, heading: () => this.heading, ok: () => this.alive && !this.rag && this.hurtTimer <= 0 && !!this.action && this.action.melee },
            kind, { source: this.group ? 'gang' : 'police', ref: this, dmgMul: cop ? 1 : 0.9 });
        this.meleeCd = 1.2 + Math.random() * 0.9;
        return true;
    }

    // ----- Perseguição fora do NavMesh (pulando grades e muros) -----
    _offNav(pos) {
        const q = this.nav.closestPoint(pos);
        return hypot(q.x - pos.x, q.z - pos.z) > 2.0;
    }

    _enterFree() {
        if (this.free || this.index < 0) return;
        this.nav.crowd.removeAgent(this.index);
        this.index = -1;
        this.free = { stuck: 0 };
        this.vaulting = null;
        this.shooting = false; this.action = null;
        this._recompute = 0;
    }

    _exitFree() {
        if (!this.free || this.vaulting) return;
        const pos = this.nav.closestPoint(this.transform.position);
        this.transform.position.copyFrom(pos);
        this.params.maxSpeed = this.chaseSpeed;
        this.index = this.nav.crowd.addAgent(pos, this.params, this.transform);
        this.free = null;
        this.actor.mesh.position.y = 0.5;
        this._recompute = 0;
    }

    // Anda `speed` u/s em linha reta até (tx, tz): pula a grade/muro que estiver no caminho (se há onde pousar), desliza
    // nos prédios. Retorna a velocidade usada (para escolher o clipe).
    _freeMove(tx, tz, dt, speed) {
        const p = this.position;
        if (this.vaulting) {
            const v = this.vaulting;
            v.t += dt / v.dur;
            const e = Math.min(1, v.t);
            p.x = v.x0 + (v.x1 - v.x0) * e; p.z = v.z0 + (v.z1 - v.z0) * e;
            this.actor.mesh.position.y = 0.5 + 0.9 * Math.sin(Math.PI * e);
            this.actor.play('vault', 'none');
            if (e >= 1) { this.vaulting = null; this.actor.mesh.position.y = 0.5; }
            return speed;
        }
        const dx = tx - p.x, dz = tz - p.z, d = hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
        if (d > 1.5) {
            const o = CityGrid.nearestVault(p.x + ux * 0.55, p.z + uz * 0.55, 0.45);
            const land = o && CityGrid.vaultLanding(o, p.x, p.z);
            if (land && (land.x - p.x) * ux + (land.z - p.z) * uz > 0) {
                this.vaulting = { x0: p.x, z0: p.z, x1: land.x, z1: land.z, t: 0, dur: 0.6 };
                this.heading = Math.atan2(land.x - p.x, land.z - p.z);
                this.actor.play('vault', 'none', { restart: true });
                AudioFX.thud(p.x, p.z);
                return speed;
            }
        }
        if (!MapGeo.isLand(p.x + ux * speed * dt * 3, p.z + uz * speed * dt * 3)) {      // policial não entra na água atrás de você
            if (this.free) this.free.stuck += dt;
            return 0;
        }
        // relevo: a pé sobe qualquer encosta, devagar, e o desenho troca para subindo/escalando (SpriteActor.setSlope)
        const g = MapGeo.slopeAlong(p.x, p.z, ux, uz);
        speed *= MapGeo.slopeSpeed(g);
        this.actor.setSlope(g);
        p.x += ux * speed * dt; p.z += uz * speed * dt;
        const hit = MapGeo.resolveCircle(p, 0.45);
        if (this.free) this.free.stuck = hit ? this.free.stuck + dt : Math.max(0, this.free.stuck - dt * 2);
        let a = (Math.atan2(ux, uz) - this.heading) % (Math.PI * 2);
        if (a > Math.PI) a -= Math.PI * 2;
        if (a < -Math.PI) a += Math.PI * 2;
        this.heading += a * (1 - Math.exp(-12 * dt));
        return speed;
    }

    _freeStep(dt) {
        const t = this.targetPos, p = this.position;
        this._recompute -= dt;
        if (this._recompute <= 0 && !this.vaulting) {
            this._recompute = 0.4;
            const dist = hypot(t.x - p.x, t.z - p.z);
            if (!this.mind || (!this.mind.sees && !this.manager.weaponsFree && dist > 12) || dist > 45 || this.free.stuck > 2.5 || !this._offNav(t)) { this._exitFree(); return; }
        }
        const dist = hypot(t.x - p.x, t.z - p.z);
        const sp = dist > 1.6 ? this._freeMove(t.x, t.z, dt, this.chaseSpeed) : 0;
        this.transform.rotation.y = this.heading;
        if (this.vaulting) { /* clipe de pulo já tocando */ }
        else if (sp > 0.5) this.actor.play('run', this.drawn ? this.spec.clip : 'none'); else this.actor.play('idle', 'none');
        this.actor.setPosition(p.x, p.z);
        this.actor.setHeading(this.heading);
        this.actor.update(dt, this.vaulting ? 1 : 1.5);
    }

    // Dispara 1 tiro na direção prevista do alvo (com erro que cresce com a distância). Tropa de elite e
    // exército atiram em RAJADAS: `burst` tiros a cada `gap` s, depois uma pausa.
    _shoot(dist) {
        const K = this.spec;
        const lead = 0.15;
        const tx = this.targetPos.x + this.targetVel.x * lead, tz = this.targetPos.z + this.targetVel.z * lead;
        const angle = Math.atan2(tx - this.position.x, tz - this.position.z);
        this.manager.combat.fire({
            x: this.position.x, z: this.position.z, angle, owner: K.owner || 'police', ref: this,
            spreadMul: (1.3 + dist * 0.07) * K.spread * (K.owner ? 1 : this.manager.moveSpread),
        }, K.gun);
        if (this.burstLeft <= 0) this.burstLeft = K.burst;
        this.burstLeft--;
        this.fireCd = this.burstLeft > 0 ? K.gap : K.pause[0] + Math.random() * (K.pause[1] - K.pause[0]);
        this._play('shoot');
    }

    // Toca uma ação (draw/shoot) até o fim; onDone ao terminar.
    _play(name, onDone) {
        if (this.actor.play(name, this.spec.clip, { restart: true })) this.action = { name, onDone };
    }

    _pickWanderTarget() {
        if (this.group) { this.manager.groupDest(this); return; }                  // traficante: ronda em grupo (GangManager)
        if (this.op && this.manager.game.op && this.manager.game.op.active) { this.manager.game.op.advance(this); return; }      // operação: avança favela adentro
        if (!this.spec.owner && Standing.policeBanned(this.position.x, this.position.z)) {      // polícia dentro da favela: volta para a entrada
            const e = Standing.clampToEntrance(-1e9, this.position.z, this.position.x);
            this.dest = this.nav.closestPoint(new BABYLON.Vector3(e.x + 15, 0, e.z));
            this.nav.crowd.agentGoto(this.index, this.dest);
            this._wanderTimer = 6;
            return;
        }
        this.dest = this.nav.randomPoint(this.position, Config.police.officerWanderRadius);
        this.nav.crowd.agentGoto(this.index, this.dest);
        this._wanderTimer = 6;
    }

    // ----- Dano -----
    // impact: { dx, dz, power } (atropelamento) — com força suficiente o policial é ARREMESSADO (ragdoll).
    takeDamage(amount, from, source, impact) {
        if (!this.alive) return;
        this.hp -= amount;
        this.hurtTimer = this.spec.hurt;
        if (this.hp <= 0) this.die(from, source, impact);
        else {
            if (impact && impact.power >= Config.ragdoll.minPower && !this.rag) this.ragdoll(impact, false, source);
            if (this.manager.events) this.manager.events.onOfficerHit(this, source);
        }
    }

    // Arremessado: sai do crowd, voa/rola/desliza; ao levantar volta ao NavMesh e retoma o que fazia.
    // Se morreu, termina caído (sprite de morto) e só então o evento de morte dispara (soltar itens, estrelas).
    ragdoll(impact, lethal, source) {
        if (this.rag) return;
        this.shooting = false; this.action = null; this.drawn = false;
        this.free = null; this.vaulting = null; this.actor.mesh.position.y = 0.5;
        if (this.index >= 0) { this.nav.crowd.removeAgent(this.index); this.index = -1; }
        this._killSource = source;
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
            this.deadTimer = 40;
            this.actor.play('dead', 'none', { restart: true }); this.actor.setPhase(1);          // (já deitado: só a pose final; a poça vem do play)
            this.actor.setHeading(this.heading);
            if (this.manager.events) this.manager.events.onOfficerKilled(this, this._killSource);
            return;
        }
        const pos = this.nav.closestPoint(this.transform.position);
        this.transform.position.copyFrom(pos);
        this.params.maxSpeed = this.spec.patrol;
        this.index = this.nav.crowd.addAgent(pos, this.params, this.transform);
        this.actor.play('idle', 'none', { restart: true });
        this.fsm.setState(new PolicePatrolState(this));        // o gerente o põe de volta na perseguição se for o caso
    }

    die(from, source, impact) {
        this.alive = false;
        this.free = null; this.vaulting = null; this.actor.mesh.position.y = 0.5;
        this.shooting = false; this.action = null;
        if (impact && impact.power >= Config.ragdoll.minPower) { this.ragdoll(impact, true, source); return; }
        if (this.index >= 0) { this.nav.crowd.removeAgent(this.index); this.index = -1; }
        this.fsm.setState({ name: 'DEAD', update() {} });
        this.deadTimer = 40;
        this.actor.play('dead');
        this.heading = (from ? Math.atan2(this.position.x - from.x, this.position.z - from.z) : this.heading) + (Math.random() - 0.5) * 0.8;
        this.actor.setHeading(this.heading);
        if (this.manager.events) this.manager.events.onOfficerKilled(this, source);
    }

    // Volta como um policial novo de patrulha, em outro lugar, longe do jogador.
    respawn() {
        if (this.actor.clearWounds) this.actor.clearWounds();               // (outro policial: sem os ferimentos do anterior)
        let pos = null;
        for (let i = 0; i < 12; i++) {
            const p = this.nav.randomWalkable();
            if (hypot(p.x - this.targetPos.x, p.z - this.targetPos.z) > 45) { pos = p; break; }
        }
        if (!pos) pos = this.nav.randomWalkable();
        this.transform.position.copyFrom(pos);
        this.params.maxSpeed = this.spec.patrol;
        this.index = this.nav.crowd.addAgent(pos, this.params, this.transform);
        this.hp = this.maxHp;
        this.alive = true;
        this.drawn = false;
        this.free = null; this.vaulting = null;
        this.actor.play('idle', 'none', { restart: true });
        this.fsm.setState(new PolicePatrolState(this));
    }

    // Remove de vez (reforço que cumpriu seu papel).
    dispose() {
        if (this.index >= 0) { this.nav.crowd.removeAgent(this.index); this.index = -1; }
        this.actor.dispose();
        this.transform.dispose();
    }

    // ----- Loop -----
    update(dt) {
        if (this.rag) { this.rag.update(dt); return; }      // arremessado: o Ragdoll comanda sprite e posição
        if (!this.alive) {
            this.deadTimer -= dt;
            this.actor.setPosition(this.transform.position.x, this.transform.position.z);
            this.actor.update(dt);
            if (this.deadTimer <= 0 && !this.temp) this.respawn();
            return;
        }

        if (this.arrest) { this._arrestStep(dt); return; }      // indo prender o jogador que se rendeu
        if (this.free) { this._freeStep(dt); return; }          // perseguindo fora do NavMesh (pulando grades)

        this.fsm.update(dt);
        if (this.hurtTimer > 0) this.hurtTimer -= dt;

        // Guarda a arma quando as armas deixam de estar liberadas.
        if (this.drawn && !this.manager.weaponsFree && !this.shooting) {
            this.holsterTimer += dt;
            if (this.holsterTimer > 3) { this.drawn = false; this.holsterTimer = 0; }
        } else this.holsterTimer = 0;

        // Vira o corpo: mirando = para o alvo; senão = direção do movimento.
        const v = this.nav.crowd.getAgentVelocity(this.index);
        const sp2 = v ? v.x * v.x + v.z * v.z : 0;
        if (!this.shooting && sp2 > 0.3) {
            const targetY = Math.atan2(v.x, v.z);
            const t = 1 - Math.exp(-12 * dt);
            let d = (targetY - this.heading) % (Math.PI * 2);
            if (d > Math.PI) d -= Math.PI * 2;
            if (d < -Math.PI) d += Math.PI * 2;
            this.heading += d * t;
        }
        this.transform.rotation.y = this.heading;

        // Clipe: reação a golpe > ação (sacar/atirar) > mirando > locomoção (com arma na mão, se sacada).
        const w = this.drawn ? this.spec.clip : 'none';
        const speed = Math.sqrt(sp2);
        let rate = 1;
        if (this.hurtTimer > 0) this.actor.play('hurt');
        else if (this.action) {
            if (this.actor.done) { const a = this.action; this.action = null; if (a.onDone) a.onDone(); }
        } else if (this.shooting) this.actor.play('aim', this.spec.clip);
        else if (speed < 0.5) this.actor.play('idle', w);
        else if (this.fsm.name === 'CHASE') { this.actor.play('run', w); rate = Math.max(0.5, speed / Config.anim.run); }          // (ritmo pela velocidade — Config.anim)
        else { this.actor.play('walk', w); rate = Math.max(0.5, speed / Config.anim.walk); }

        this.actor.setPosition(this.transform.position.x, this.transform.position.z);
        this.actor.setHeading(this.heading);
        this.actor.update(dt, rate);
    }

    // Rendição do jogador: corre até ficar de frente para ele (1,5u) e para, encarando. `arrest` = { target(): pos, arrived }.
    _arrestStep(dt) {
        const A = this.arrest, t = A.target(), p = this.position;
        const dx = p.x - t.x, dz = p.z - t.z, d = hypot(dx, dz) || 1;
        this.shooting = false; this.action = null; this.hurtTimer = 0;
        if (this.index < 0) {                                   // fora do NavMesh (quintal): chega em linha reta, pulando o que houver
            const sp = !A.arrived && !this.vaulting ? this._freeMove(t.x + dx / d * 1.5, t.z + dz / d * 1.5, dt, this.chaseSpeed) : (this.vaulting ? this._freeMove(0, 0, dt, 1) : 0);
            if (d < 2.4 && !this.vaulting) A.arrived = true;
            if (A.arrived && !this.vaulting) {
                let a = (Math.atan2(t.x - p.x, t.z - p.z) - this.heading) % (Math.PI * 2);
                if (a > Math.PI) a -= Math.PI * 2;
                if (a < -Math.PI) a += Math.PI * 2;
                this.heading += a * (1 - Math.exp(-12 * dt));
            }
            this.transform.rotation.y = this.heading;
            if (!this.vaulting) { if (sp > 0.5 && !A.arrived) this.actor.play('run', 'none'); else this.actor.play('idle', 'none'); }
            this.actor.setPosition(p.x, p.z);
            this.actor.setHeading(this.heading);
            this.actor.update(dt, this.vaulting ? 1 : 1.5);
            return;
        }
        if (!A.arrived) {
            this._recompute -= dt;
            if (this._recompute <= 0) {
                this._recompute = 0.2;
                this.dest = this.nav.closestPoint(new BABYLON.Vector3(t.x + dx / d * 1.5, 0, t.z + dz / d * 1.5));
                this.nav.crowd.agentGoto(this.index, this.dest);
            }
            this._setSpeed(this.chaseSpeed);
            if (d < 2.8) { A.arrived = true; this.nav.crowd.agentGoto(this.index, p); this._setSpeed(0.01); }
        }
        const v = this.nav.crowd.getAgentVelocity(this.index);
        const speed = v ? hypot(v.x, v.z) : 0;
        const targetY = A.arrived || speed < 0.4 ? Math.atan2(t.x - p.x, t.z - p.z) : Math.atan2(v.x, v.z);
        let a = (targetY - this.heading) % (Math.PI * 2);
        if (a > Math.PI) a -= Math.PI * 2;
        if (a < -Math.PI) a += Math.PI * 2;
        this.heading += a * (1 - Math.exp(-12 * dt));
        this.transform.rotation.y = this.heading;
        let rate = 1;
        if (speed > 0.5) { this.actor.play('run', 'none'); rate = Math.max(0.5, speed / Config.anim.run); } else this.actor.play('idle', 'none');
        this.actor.setPosition(p.x, p.z);
        this.actor.setHeading(this.heading);
        this.actor.update(dt, rate);
    }

    // Terminou a prisão: volta à patrulha.
    endArrest() {
        this.arrest = null;
        if (this.free) { this.vaulting = null; this._exitFree(); }
        this._setSpeed(this.spec.patrol);
        if (this.alive && !this.rag) this.fsm.setState(new PolicePatrolState(this));
    }

    _distToDest() {
        const p = this.position;
        return hypot(p.x - this.dest.x, p.z - this.dest.z);
    }

    _distToTarget() {
        return BABYLON.Vector3.Distance(this.position, this.targetPos);
    }

    distanceTo(pos) {
        return BABYLON.Vector3.Distance(this.position, pos);
    }

    get position() {
        return this.transform.position;
    }
}
memoStatics(PoliceOfficer, 'KINDS');
