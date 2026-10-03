// ============================================================================
// Atividades da orla — pedestres que INTERAGEM com o mapa em vez de só perambular:
//   JOG   corre em volta da ilha, no calçadão (anel junto à avenida de contorno)
//   SUN   vai até a areia, estende a toalha e toma sol de bruços por um tempo (some à noite)
//   SWIM  entra no mar: vadeia na beira, nada além de 10 m, passeia na água e volta à areia
// JOG e a ida até a areia/água usam o NavMesh como o resto. Deitado e nadando o NPC SAI do crowd (npc.free) e é
// movido à mão — deitado não atrapalha ninguém e a água não tem NavMesh. Qualquer susto (panic) ou golpe ao sair de
// um destes estados devolve o NPC ao crowd (exit()).
// ============================================================================

// --- JOG: corre pela trilha da orla (calçada junto ao mar), indo e vindo de ponta a ponta. -------------------------
class JogState {
    constructor(npc) { this.npc = npc; this.name = 'JOG'; this.u = 0; this.dir = npc.jogDir || 1; this.path = null; }

    enter() {
        const npc = this.npc;
        const j = CityGrid.jogNear(npc.position.x, npc.position.z, 400);
        if (!j) { npc.fsm.setState(new WanderState(npc)); return; }              // sem trilha por perto
        npc.setSpeed(Config.npc.jogSpeed);
        this.path = j.path; this.u = j.u;
        this._next(true);
    }

    update() {
        const npc = this.npc;
        if (this.path && npc.distanceToTarget() < 2.6) this._next(false);
    }

    _next(first) {
        if (!first) {
            this.u += this.dir * 11;
            if (this.u > this.path.len || this.u < 0) { this.dir = -this.dir; this.u = Math.max(0, Math.min(this.path.len, this.u)); }   // chegou na ponta: volta
        }
        const p = CityGrid.jogAt(this.path, this.u);
        this.npc.gotoTarget(this.npc.nav.closestPoint(new BABYLON.Vector3(p.x, 0, p.z)));
    }
}

// --- SUN: toalha na areia, deitado de bruços; levanta depois de um tempo e vai fazer outra coisa. ----------------
class SunState {
    constructor(npc) { this.npc = npc; this.name = 'SUN'; this.phase = 'go'; this.timer = 0; this.spot = null; this.stuck = 0; }

    enter() {
        const npc = this.npc;
        this.spot = CityGrid.beachSpot({ x: npc.position.x, z: npc.position.z });
        if (!this.spot) { npc.fsm.setState(new WanderState(npc)); return; }
        npc.setSpeed(Config.npc.wanderSpeed);
        npc.gotoTarget(npc.nav.closestPoint(new BABYLON.Vector3(this.spot.x, 0, this.spot.z)));
    }

    update(dt) {
        const npc = this.npc;
        if (!this.spot) return;
        if (npc.ctx.night && npc.ctx.night() > 0.7) { npc.toWander(); return; }           // anoiteceu: vai embora
        if (this.phase === 'go') {
            const d = Math.hypot(npc.position.x - this.spot.x, npc.position.z - this.spot.z);
            this.stuck += dt;
            if (d < 1.4 || this.stuck > 40) this._lieDown();
        } else if (this.phase === 'lie') {
            this.timer -= dt;
            if (this.timer <= 0) this._getUp();
        } else if (this.phase === 'up') {
            this.timer -= dt;
            if (this.timer <= 0) this._leave();
        }
    }

    _lieDown() {
        const npc = this.npc, s = this.spot;
        npc.enterFree();
        npc.transform.position.set(s.x, 0, s.z);
        npc.heading = s.h;
        npc.transform.rotation.y = s.h;
        npc.towel = npc.makeTowel(s.x, s.z, s.h);
        npc.freeAnim = { clip: 'lie', rate: 1 };
        npc.actor.play('lie', 'none', { restart: true });
        const [a, b] = Config.npc.sunTime;
        this.timer = a + Math.random() * (b - a);
        this.phase = 'lie';
    }

    _getUp() {
        this.npc.freeAnim = { clip: 'getup', rate: 1 };
        this.npc.actor.play('getup', 'none', { restart: true });
        this.timer = 0.75;
        this.phase = 'up';
    }

    _leave() {
        const npc = this.npc;
        npc.leaveFree();
        // Depois do sol: uma volta (corrida ou mergulho) ou perambula.
        const r = Math.random();
        if (r < 0.4) npc.fsm.setState(new SwimState(npc));
        else if (r < 0.6) npc.fsm.setState(new JogState(npc));
        else npc.toWander();
    }

    exit() {
        const npc = this.npc;
        if (this.spot) this.spot.taken = false;
        if (npc.free) npc.leaveFree();
    }
}

// --- SWIM: vai até a beira, entra no mar, nada e volta. --------------------------------------------------------
class SwimState {
    constructor(npc) { this.npc = npc; this.name = 'SWIM'; this.phase = 'go'; this.timer = 0; this.shore = null; this.goal = null; this.stuck = 0; this.scared = null; }

    enter() {
        const npc = this.npc;
        this.shore = CityGrid.shorePoint({ x: npc.position.x, z: npc.position.z });
        if (!this.shore) { npc.fsm.setState(new WanderState(npc)); return; }
        npc.setSpeed(Config.npc.wanderSpeed);
        npc.gotoTarget(npc.nav.closestPoint(new BABYLON.Vector3(this.shore.x, 0, this.shore.z)));
    }

    // Susto: se já está na água, volta à areia depressa e só então foge; na terra, foge na hora (panic normal).
    inWater() { return this.phase === 'swim' || this.phase === 'back'; }
    scare(threat) { this.scared = threat.clone(); this._goBack(1.7); }

    update(dt) {
        const npc = this.npc, S = this.shore;
        if (npc.ctx.night && npc.ctx.night() > 0.7 && this.phase === 'swim') this._goBack(1.3);
        if (this.phase === 'go') {
            this.stuck += dt;
            if (npc.distanceToTargetXZ(S.x, S.z) < 1.6 || this.stuck > 45) {
                npc.enterFree();
                const [a, b] = Config.npc.swimTime;
                this.timer = a + Math.random() * (b - a);
                this.phase = 'swim';
                this._pickGoal();
            }
        } else if (this.phase === 'swim') {
            this.timer -= dt;
            if (npc.freeMove(this.goal.x, this.goal.z, dt, Config.npc.swimSpeed) < 2.5) this._pickGoal();
            if (this.timer <= 0) this._goBack(1);
        } else if (this.phase === 'back') {
            const d = npc.freeMove(this.goal.x, this.goal.z, dt, Config.npc.swimSpeed * this.boost);
            if (d < 1.2 || MapGeo.waterDepth(npc.position.x, npc.position.z) <= 0) this._finish();
        }
    }

    // Próximo ponto da nadada: mar adentro a 14–60 m da margem, deslizando ao longo da costa.
    _pickGoal() {
        const S = this.shore, d = 14 + Math.random() * 46, t = (Math.random() - 0.5) * 36;
        this.goal = { x: S.x + S.nx * d + (S.nz ? t : 0), z: S.z + S.nz * d + (S.nx ? t : 0) };
    }

    _goBack(boost) {
        this.boost = boost;
        this.goal = { x: this.shore.x, z: this.shore.z };
        this.phase = 'back';
    }

    _finish() {
        const npc = this.npc, threat = this.scared;
        npc.leaveFree();
        if (threat) { npc.panic(threat); return; }
        const r = Math.random();
        if (r < 0.45) npc.fsm.setState(new SunState(npc)); else npc.toWander();
    }

    exit() {
        if (this.npc.free) this.npc.leaveFree();
    }
}
