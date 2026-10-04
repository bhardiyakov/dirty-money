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
    // ctx = { signals } (serviços compartilhados do mundo).
    constructor(scene, nav, startPos, id, sprites, ctx, role = null) {
        this.role = role;
        this.umbrella = false;      // guarda-chuva aberto (chuva)
        this._umb = null; this._umbS = 0;
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
        this.free = null;
        this.freeAnim = null;
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
        this.free = null; this.freeAnim = null;
        this.actor.mesh.position.y = 0.5;
    }

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
    // além de wadeDepth m da margem, nada; antes, vadeia. Retorna a distância que falta.
    freeMove(gx, gz, dt, speed) {
        const p = this.position, dx = gx - p.x, dz = gz - p.z, d = hypot(dx, dz) || 1;
        const depth = MapGeo.waterDepth(p.x, p.z), W = Config.water.wadeDepth, deep = depth > W;
        const v = deep ? speed : speed * (depth > 0 ? 1.15 : 1.6);
        if (d > 0.05) {
            p.x += (dx / d) * v * dt; p.z += (dz / d) * v * dt;
            this.heading = this._lerpAngle(this.heading, Math.atan2(dx, dz), 1 - Math.exp(-6 * dt));
        }
        this.freeAnim = deep ? { clip: 'swim', rate: 1 } : { clip: 'walk', rate: depth > 0 ? 0.6 : 0.9 };
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
        if (this.fsm.name === 'SURRENDER' && !force) return;
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

    // Levou um golpe: cambaleia e, em seguida, foge do agressor.
    hurt(fromPos) {
        if (this.rag) return;
        this.threat.set(fromPos.x, 0, fromPos.z);
        this.waiting = null;
        this.crossing = null;
        this.fsm.setState(new HurtState(this));
    }

    // Dano de bala/golpe/atropelamento. source: 'player' | 'police'. Zerou a vida: morre.
    // impact: { dx, dz, power } (atropelamento) — com força suficiente o pedestre é ARREMESSADO (ragdoll).
    takeDamage(amount, from, source, impact) {
        if (!this.alive) return;
        this.hp -= amount;
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
            this.actor.play('dead', 'none', { restart: true });
            this.actor.setHeading(this.heading);
            if (this.ctx.events) this.ctx.events.onKill(this, this._killSource, 'npc');
            return;
        }
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

    // Reaparece em `pos` (perto do jogador, fora da tela) com a vocação `role`: o pedestre "novo" que o mundo grande precisa.
    relocate(pos, role, style = null) {
        if (this.rag || !this.alive) return false;
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
        const inter = CityGrid.intersectionNear(p.x, p.z, 14);
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
        return p.x > cw.x0 - m && p.x < cw.x1 + m && p.z > cw.z0 - m && p.z < cw.z1 + m;
    }

    // Está na "boca" da faixa (a ~1,8u da ponta) e indo PARA dentro dela? (quem só passa
    // pela calçada ao lado, em direção paralela à rua, não conta.)
    static entering(cw, p, v, sp) {
        if (sp < 0.5) return false;
        const ax = cw.axis === 'x';
        const along = ax ? p.x : p.z, lat = ax ? p.z : p.x;
        const aMin = ax ? cw.x0 : cw.z0, aMax = ax ? cw.x1 : cw.z1;
        const lMin = ax ? cw.z0 : cw.x0, lMax = ax ? cw.z1 : cw.x1;
        if (lat < lMin - 0.9 || lat > lMax + 0.9) return false;
        const vA = ax ? v.x : v.z;
        if (along > aMin - 1.8 && along < aMin + 0.6 && vA > 0.35 * sp) return true;
        if (along < aMax + 1.8 && along > aMax - 0.6 && vA < -0.35 * sp) return true;
        return false;
    }

    // ------------------------------------------------------------ guarda-chuva
    // Visto de cima: a copa cobre o pedestre (quad a 2,6 u de altura com 8 gomos). Abre/fecha crescendo/encolhendo em ~0,35 s.
    static umbrellaMaterial(scene, i) {
        const cache = scene._umbMats || (scene._umbMats = []), colors = ['#d9453a', '#2f6fd0', '#e8c22c', '#2fa36a', '#7a4fb8', '#222831', '#e8742c', '#e86aa0'];
        if (cache[i]) return cache[i];
        const N = 64, tex = new BABYLON.DynamicTexture('umbTex' + i, { width: N, height: N }, scene, false, BABYLON.Texture.NEAREST_SAMPLINGMODE), c = tex.getContext(), col = colors[i % colors.length];
        c.clearRect(0, 0, N, N);
        c.fillStyle = col; c.beginPath(); c.arc(N / 2, N / 2, N / 2 - 1, 0, Math.PI * 2); c.fill();
        for (let k = 0; k < 8; k++) {                                             // gomos alternando cor e tom escuro
            if (k % 2) continue;
            c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.moveTo(N / 2, N / 2); c.arc(N / 2, N / 2, N / 2 - 1, k * Math.PI / 4, (k + 1) * Math.PI / 4); c.closePath(); c.fill();
        }
        c.strokeStyle = '#111'; c.lineWidth = 2; c.beginPath(); c.arc(N / 2, N / 2, N / 2 - 1.5, 0, Math.PI * 2); c.stroke();
        c.fillStyle = '#d8dde4'; c.beginPath(); c.arc(N / 2, N / 2, 3, 0, Math.PI * 2); c.fill();          // ponteira
        tex.hasAlpha = true; tex.update(false);
        const m = new BABYLON.StandardMaterial('umb' + i, scene);
        m.diffuseTexture = tex; m.emissiveTexture = tex; m.disableLighting = true; m.useAlphaFromDiffuseTexture = true;
        m.transparencyMode = BABYLON.Material.MATERIAL_ALPHATEST; m.alphaCutOff = 0.4; m.backFaceCulling = false;
        return (cache[i] = m);
    }

    _umbrellaTick(dt) {
        const want = this.umbrella && this.alive && !this.rag && !this.free;
        if (want && !this._umb) {
            const m = BABYLON.MeshBuilder.CreateGround('umb' + this.id, { width: 2.3, height: 2.3 }, this.scene);
            m.material = NPC.umbrellaMaterial(this.scene, this.id); m.isPickable = false; m.position.y = 2.6; m.setEnabled(false);
            this._umb = m; this._umbS = 0;
        }
        if (!this._umb) return;
        this._umbS += ((want ? 1 : 0) - this._umbS) * Math.min(1, dt * 9);
        const s = this._umbS;
        if (s < 0.04 && !want) { this._umb.setEnabled(false); return; }
        this._umb.setEnabled(true);
        this._umb.scaling.set(s, 1, s);
        this._umb.position.x = this.transform.position.x; this._umb.position.z = this.transform.position.z;
        this._umb.rotation.y = this.id * 0.7;
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
            const A = this.freeAnim || { clip: 'idle', rate: 1 };
            this.transform.rotation.y = this.heading;
            this.actor.play(A.clip, 'none');
            this.actor.setPosition(this.transform.position.x, this.transform.position.z);
            this.actor.setHeading(this.heading);
            this.actor.update(dt, A.rate);
            return;
        }

        // Vira o corpo para a direção do movimento real do agente e escolhe o clipe.
        const v = this.nav.crowd.getAgentVelocity(this.index);
        const sp2 = v ? v.x * v.x + v.z * v.z : 0;
        if (sp2 > 0.3) {
            const targetY = Math.atan2(v.x, v.z);
            const t = 1 - Math.exp(-12 * dt);
            this.transform.rotation.y = this._lerpAngle(this.transform.rotation.y, targetY, t);
            this.heading = this.transform.rotation.y;
        }

        const speed = Math.sqrt(sp2);
        const st = this.fsm.name;
        let rate = 1;
        if (st === 'HURT') this.actor.play('hurt');
        else if (st === 'SURRENDER') this.actor.play(this.fsm.current.kneeling ? 'kneel' : 'surrender');
        else if (speed < 0.5) this.actor.play('idle');
        else if (st === 'SHELTER') { this.actor.play('run'); rate = Math.max(0.7, speed / Config.npc.jogSpeed) * 1.25; }
        else if (st === 'FLEE') { this.actor.play('scared'); rate = Math.max(0.7, speed / Config.npc.fleeSpeed) * 1.4; }
        else if (st === 'JOG') { this.actor.play('run'); rate = Math.max(0.7, speed / Config.npc.jogSpeed) * 1.25; }
        else { this.actor.play('walk'); rate = Math.max(0.6, speed / Config.npc.wanderSpeed) * 1.4; }

        this.actor.setPosition(this.transform.position.x, this.transform.position.z);
        this.actor.setHeading(this.heading);
        this.actor.update(dt, rate);
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
