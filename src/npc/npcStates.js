// ============================================================================
// Estados de FSM do pedestre:
//   WANDER — caminha entre destinos, obedecendo semáforos de pedestre.
//   IDLE   — para um pouco (olha a vitrine, confere o celular...).
//   FLEE   — foge em pânico (assalto, tiro, perseguição).
//   HURT   — levou um golpe: cambaleia e depois foge do agressor (ou, se for brigão, revida).
//   FIGHT  — revida: vai até o jogador e troca socos e chutes (Combat.strike) até cansar ou apanhar demais.
// Os estados só decidem PARA ONDE ir; o Recast Crowd resolve o caminho.
// ============================================================================

// --- WANDER: escolhe destinos aleatórios no NavMesh e caminha até eles. ------
class WanderState {
    constructor(npc) {
        this.npc = npc;
        this.name = 'WANDER';
        this.timer = 0;
    }

    enter() {
        this.npc.setSpeed(Config.npc.wanderSpeed);
        this._pickNewTarget();
    }

    update(dt) {
        const npc = this.npc;

        // Esperando o sinal de pedestre abrir (parado no meio-fio).
        if (npc.waiting) {
            npc.waitTime += dt;
            if (npc.ctx.signals.ped(npc.waiting).state === 'walk') npc.release();
            else if (npc.waitTime > 25) { npc.waiting = null; npc.setSpeed(Config.npc.wanderSpeed); this._pickNewTarget(); }  // desistiu
            return;
        }
        if (npc.signalGate()) return;                 // acabou de parar numa faixa fechada
        if (npc.crossing) {                           // nunca muda de ideia no meio da rua...
            if (npc.distanceToTarget() < Config.npc.reachDist) this._pickNewTarget();   // ...a não ser que o destino esteja ali
            return;
        }

        this.timer -= dt;
        // Re-sorteia se chegou perto do destino ou se demorou demais (destemido preso).
        if (this.timer <= 0 || npc.distanceToTarget() < Config.npc.reachDist) {
            if (Math.random() < Config.npc.idleChance) npc.fsm.setState(new IdleState(npc));
            else this._pickNewTarget();
        }
    }

    _pickNewTarget() {
        // Destino nunca dentro de uma faixa de pedestres (senão o NPC pararia no meio da rua).
        let dest = null;
        for (let i = 0; i < 8; i++) {
            dest = this.npc.nav.randomPoint(this.npc.position, Config.npc.wanderRadius);
            if (!CityGrid.inCrosswalk(dest.x, dest.z, 1.0) && !(FavelaPlan.built && FavelaPlan.cellAt(dest.x, dest.z) === FavelaPlan.ROAD)) break;      // (nem na rua do morro: parado ali trancaria os carros)
        }
        this.npc.gotoTarget(dest);
        this.timer = Config.npc.wanderTime;
    }
}

// --- IDLE: fica parado por alguns segundos. ---------------------------------
class IdleState {
    constructor(npc) {
        this.npc = npc;
        this.name = 'IDLE';
        this.timer = 0;
    }

    enter() {
        const [a, b] = Config.npc.idleTime;
        this.timer = a + Math.random() * (b - a);
        this.npc.setSpeed(0);
    }

    update(dt) {
        this.timer -= dt;
        if (this.timer <= 0) this.npc.toWander();
    }
}

// --- FLEE: corre na direção oposta à ameaça, recalculando periodicamente. ----
class FleeState {
    constructor(npc) {
        this.npc = npc;
        this.name = 'FLEE';
        this.timer = 0;
        this.recompute = 0;
    }

    enter() {
        this.npc.setSpeed(Config.npc.fleeSpeed);
        this.timer = Config.npc.fleeTime;
        this.recompute = 0;
        this._runAway();
    }

    update(dt) {
        this.timer -= dt;
        this.recompute -= dt;

        if (this.recompute <= 0) {
            this._runAway();
            this.recompute = 0.7; // re-mira a fuga ~a cada 0.7s (persegue-o? foge dele).
        }

        // Volta a perambular quando já fugiu tempo suficiente E está longe da ameaça.
        const far = BABYLON.Vector3.Distance(this.npc.position, this.npc.threat) > Config.npc.panicRadius * 1.4;
        if (this.timer <= 0 && far) {
            this.npc.afterPanic();
        }
    }

    _runAway() {
        const away = this.npc.position.subtract(this.npc.threat);
        away.y = 0;
        if (away.lengthSquared() < 0.01) {
            away.set(Math.random() - 0.5, 0, Math.random() - 0.5); // ameaça em cima: foge p/ lado aleatório.
        }
        away.normalize();

        // Alvo à frente na direção da fuga, ancorado no NavMesh.
        let dest = this.npc.position.add(away.scale(Config.npc.wanderRadius * 0.6));
        dest = this.npc.nav.closestPoint(dest);
        this.npc.gotoTarget(dest);
    }
}

// --- SHELTER: começou a chover — corre até o abrigo mais perto (toldo de loja, cobertura de posto); lá para, ABRE O GUARDA-CHUVA
// e segue o caminho com ele aberto até a chuva passar (NPC.umbrella). Sem abrigo por perto: abre o guarda-chuva no ato. ---
class ShelterState {
    constructor(npc) { this.npc = npc; this.name = 'SHELTER'; this.phase = 'run'; this.t = 0; this.spot = null; }

    enter() {
        const npc = this.npc;
        this.spot = Weather.shelterNear(npc.position.x, npc.position.z, 80);
        this.t = 0;
        if (!this.spot) { this.phase = 'open'; npc.setSpeed(0); return; }
        this.phase = 'run';
        npc.setSpeed(Config.npc.fleeSpeed * 0.78);
        npc.gotoTarget(npc.nav.closestPoint(new BABYLON.Vector3(this.spot.x, 0, this.spot.z)));
    }

    update(dt) {
        const npc = this.npc;
        this.t += dt;
        if (this.phase === 'run') {
            if (npc.distanceToTarget() < 1.7 || this.t > 16) { this.phase = 'open'; this.t = 0; npc.setSpeed(0); }
        } else {                                              // parado: tira o guarda-chuva da bolsa (0,5 s) e abre
            if (this.t > 0.5 && !npc.umbrella) npc.umbrella = true;
            if (this.t > 1.3) npc.toWander();
        }
    }
}

// --- SURRENDER: assaltado — larga tudo, ergue as mãos e se ajoelha encarando o assaltante. ---
// Só sai daqui quando o Game manda (entregou o dinheiro, o jogador baixou a arma/se afastou) ou ao levar dano.
class SurrenderState {
    constructor(npc) {
        this.npc = npc;
        this.name = 'SURRENDER';
        this.t = 0;
    }

    enter() {
        this.npc.setSpeed(0);
        this.t = 0;
    }

    update(dt) {
        const npc = this.npc;
        this.t += dt;
        const want = Math.atan2(npc.threat.x - npc.position.x, npc.threat.z - npc.position.z);   // encara o assaltante
        npc.heading = npc._lerpAngle(npc.heading, want, 1 - Math.exp(-10 * dt));
        npc.transform.rotation.y = npc.heading;
    }

    get kneeling() { return this.t > 0.9; }                 // fim do clipe de rendição (8 quadros a 9 fps)
}

// --- HURT: cambaleia por um instante; depois foge de quem bateu. -------------
class HurtState {
    constructor(npc) {
        this.npc = npc;
        this.name = 'HURT';
        this.timer = 0;
    }

    enter() {
        this.timer = 0.55;
        this.npc.setSpeed(0);
    }

    update(dt) {
        this.timer -= dt;
        if (this.timer > 0) return;
        const npc = this.npc;
        if (FightState.wants(npc)) npc.fsm.setState(new FightState(npc, npc.ctx.game.player));
        else npc.panic(npc.threat, true);
    }
}

// --- FIGHT: o brigão revida — vai até quem bateu e troca socos e chutes (golpes de verdade: Combat.strike) até cansar, apanhar
// demais, o outro sumir/entrar num carro ou puxar uma arma de fogo. Aí foge.
class FightState {
    // Revida? Só o brigão (NPC.brawler), batido pelo jogador a pé, com fôlego e o jogador sem arma de fogo na mão.
    static wants(npc) {
        const g = npc.ctx.game, p = g && g.player;
        if (!p || !npc.brawler || npc._hitBy !== 'player' || npc.hp < npc.maxHp * 0.4 || !g.combat) return false;
        if (g.mode !== 'player' || !p.alive || p.rag || FightState.armed(p)) return false;
        return hypot(p.position.x - npc.position.x, p.position.z - npc.position.z) < 9;
    }
    static armed(p) { const W = Weapons[p.weapon]; return !!(W && W.gun); }

    constructor(npc, foe) {
        this.npc = npc;
        this.foe = foe;
        this.name = 'FIGHT';
        this.clip = null;          // golpe tocando (o NPC.update toca o clipe)
        this.attackT = 0;          // tempo até o golpe acabar
        this.cd = 0.25;            // até o próximo golpe
        this.timer = 0;            // fôlego
        this.repath = 0;
    }

    enter() {
        this.timer = 9 + Math.random() * 6;
        this.npc.waiting = null; this.npc.crossing = null;
        this.npc.fleeAge = 0;
    }

    update(dt) {
        const npc = this.npc, g = npc.ctx.game, foe = this.foe, p = npc.position;
        this.timer -= dt; this.cd -= dt; this.repath -= dt;
        if (this.attackT > 0 && (this.attackT -= dt) <= 0) this.clip = null;
        const dx = foe.position.x - p.x, dz = foe.position.z - p.z, d = hypot(dx, dz);
        if (g.mode !== 'player' || !foe.alive || g.hiding || this.timer <= 0 || d > 14 || npc.hp < npc.maxHp * 0.3 || FightState.armed(foe)) {
            this.clip = null;
            npc.panic(foe.position, true);
            return;
        }
        if (foe.rag) { if (this.attackT <= 0) { npc.setSpeed(0); this.clip = null; } return; }          // caiu: espera levantar
        npc.heading = Math.atan2(dx, dz);
        if (this.attackT > 0 || d < 0.95) {                                       // golpeando ou colado: para
            npc.setSpeed(0);
            if (this.repath <= 0) { npc.gotoTarget(p); this.repath = 0.3; }
        } else {                                                                  // avança
            npc.setSpeed(Config.npc.fleeSpeed * 0.8);
            if (this.repath <= 0) { npc.gotoTarget(foe.position); this.repath = 0.3; }
        }
        if (d < 1.45 && this.cd <= 0 && this.attackT <= 0) this._attack(g);
    }

    _attack(g) {
        const npc = this.npc, r = Math.random();
        const kind = r < 0.25 ? 'kick' : (this._jab = !this._jab) ? 'punchL' : 'punch';
        if (!npc.actor.play(kind, 'none', { restart: true })) return;
        this.clip = kind;
        const c = npc.actor.clip;                                                 // (o golpe dura o clipe: n/fps — mais quadros, o mesmo tempo)
        this.attackT = c && c.fps > 0 ? c.frames / c.fps : { punch: 0.43, punchL: 0.36, kick: 0.58 }[kind];
        this.cd = this.attackT + 0.35 + Math.random() * 0.6;
        g.combat.strike({ position: npc.position, heading: () => npc.heading, ok: () => npc.alive && !npc.rag && npc.fsm.current === this && this.clip === kind },
            kind, { source: 'npc', ref: npc, dmgMul: 0.75 });
    }

    exit() { this.clip = null; }
}
