// ============================================================================
// PoliceCar — viatura. É um TrafficCar (mesma física e IA de trânsito).
// FSM: PATROL (circula pelas faixas como qualquer carro: obedece semáforo, mantém
// distância) e CHASE (interceptação preditiva: mira onde o alvo VAI estar, ignora
// sinais). Troca de estado via setAlert().
// ============================================================================

class PoliceCar extends TrafficCar {
    // opts: { paint (linha da paleta; 6 = viatura), role: 'patrol'|'swat'|'army'|'block', temp (reforço que some depois),
    //         siren (giroflex; o exército não tem) }
    constructor(scene, physics, startPos, id, carSheet, traffic, heading, opts = {}) {
        // offset 1000 evita colisão de nomes.
        super(scene, physics, startPos, 1000 + id, carSheet, opts.paint !== undefined ? opts.paint : 6, heading, traffic);
        this.role = opts.role || 'patrol';
        this.temp = !!opts.temp;
        this.siren = opts.siren !== false;
        // Viaturas e veículos blindados aguentam mais que um carro comum.
        this.maxHp = Math.round(this.maxHp * (this.role === 'swat' ? 1.7 : this.role === 'army' ? 1.6 : 1.4));
        this.hp = this.maxHp;
        this.cruise = 8 + Math.random() * 2;      // patrulha mais devagar que o trânsito comum.
        this._patrolCruise = this.cruise;
        this._goal = null;                        // alvo da perseguição (a rota das ruas se orienta por ele)
        this._t = 0;                              // relógio próprio
        this._stuckT = 0;                         // tempo parada sem motivo (enroscada)
        this._reverseT = 0;                       // ré para se soltar
        this._revSteer = 0;
        this._roadUntil = 0;                      // até esse instante, só pelas ruas (sem atalho em linha reta)
        this._replanT = 0;
        this.ramming = false;                     // furando a fila: ignora os carros à frente por um instante
        this._ramUntil = 0;
        this._blockedT = 0;                       // tempo preso atrás de um carro
        this._bestDist = Infinity;                // menor distância ao alvo já alcançada...
        this._progressT = 0;                      // ...e há quanto tempo não melhora
        this._relocCd = 0;

        // Barra do giroflex (corpo escuro sobre o teto, acima do plano do sprite). As luzes azul/
        // vermelha que piscam são brilhos do CarLights, ligados por `sirenOn`. Viaturas do atlas já têm a barra desenhada no teto.
        if (this.siren && !this.spec.siren) {
            const bar = BABYLON.MeshBuilder.CreateBox(`lightbar${id}`, { width: 1.2, height: 0.22, depth: 0.4 }, scene);
            bar.parent = this.body;
            bar.position.set(0, 1.55, -0.1);
            bar.material = PoliceCar._barMaterial(scene);
            bar.isPickable = false;
        }

        this.targetPos = new BABYLON.Vector3();
        this.targetVel = new BABYLON.Vector3();
        this.manager = null;         // PoliceManager (definido ao criar)
        this.fireCd = 0.5 + Math.random();
        this.alertUntil = 0;         // ouviu um tiro: persegue até esse instante
        this.stoppedNear = false;    // parada junto ao jogador a pé (reforços descem)
        this.dismountCd = 0;

        this.fsm = new StateMachine(this);
        this.fsm.setState(new PolicePatrolState(this));
    }

    setTarget(pos, vel) {
        this.targetPos.copyFrom(pos);
        this.targetVel.copyFrom(vel);
    }

    setAlert(alerted) {
        if (this.role === 'block') return;           // bloqueio de rua: não sai do lugar
        const chasing = this.fsm.name === 'CHASE';
        if (alerted && !chasing) this.fsm.setState(new PoliceChaseState(this));
        else if (!alerted && chasing) this.fsm.setState(new PolicePatrolState(this));
    }

    static _barMaterial(scene) {
        if (!scene._lightbarMat) {
            const m = new BABYLON.StandardMaterial('lightbarMat', scene);
            m.diffuseColor = new BABYLON.Color3(0.05, 0.05, 0.05);
            scene._lightbarMat = m;
        }
        return scene._lightbarMat;
    }

    // Giroflex ligado só durante a perseguição (e nos bloqueios de rua). O exército não tem giroflex.
    get sirenOn() { return this.siren && !!this.fsm && (this.fsm.name === 'CHASE' || this.role === 'block'); }

    update(dt) {
        this._t += dt;
        if (this.role === 'block') {                 // bloqueio de rua: corpo estático, de lado, giroflex ligado
            this.syncVisual(dt);
            return;
        }
        if (this.burning > 0 || this.wrecked || this.driverDead) {      // pegando fogo, carcaça ou o motorista morto a tiro: freia e fica parada
            this.driveTo(0, 0, dt, 6, 18);
            this.syncVisual(dt);
            return;
        }
        this.fsm.update(dt);
        this.syncVisual(dt);
    }

    // Rotas da viatura nascem já orientadas pelo alvo da perseguição (se houver).
    startRoute(x, z, d, lp = null) {
        this.route = new Route(x, z, d, lp);
        this.route.goal = this._goal;
        this.route.ensure(2);
    }

    // Voltou a patrulhar: reencaixa numa faixa (se estiver fora de rua, vai até a rua mais próxima).
    onPatrolEnter() {
        if (this.role === 'block') return;
        this.ignoreSignals = false;
        this.accelMul = 1; this.turnMul = 1;
        this.cruise = this._patrolCruise;
        this._goal = null; this._reverseT = 0; this._stuckT = 0; this.ramming = false;
        this.reroute();
    }

    // Perseguição: ignora semáforo, acelera e faz curva mais forte; a rota passa a mirar o jogador.
    onChaseEnter() {
        this.ignoreSignals = true;
        this.accelMul = 1.9; this.turnMul = 1.35;
        this.cruise = Math.min(this.spec.maxSpeed * 0.78, 19);
        this.route = null;
        this._stuckT = 0; this._reverseT = 0; this._roadUntil = 0; this._replanT = 0;
        this.ramming = false; this._blockedT = 0; this._bestDist = Infinity; this._progressT = 0; this._relocCd = 4;
    }

    patrol(dt) {
        if (!this.route && !this.reroute()) {
            // Fora das ruas (acabou uma perseguição): volta pela rua mais próxima.
            const p = this.position;
            const r = RoadNet.nearestRoadPoint(p.x, p.z);
            this._driveTo(new BABYLON.Vector3(r.x, 0, r.z), dt, 0.5);
            return;
        }
        this.aiUpdate(dt, this.traffic.env);
    }

    chase(dt) {
        const m = this.manager;
        const p = this.position;
        const dist = BABYLON.Vector3.Distance(p, this.targetPos);

        // Armas liberadas: os policiais da viatura atiram pela janela (alcance e visada como a pé).
        this.fireCd -= dt;
        if (m && m.weaponsFree && this.mind && this.mind.sees && dist < Config.police.shootRange && this.fireCd <= 0) {
            const tx = this.targetPos.x + this.targetVel.x * 0.2, tz = this.targetPos.z + this.targetVel.z * 0.2;
            const heavy = this.role === 'swat' || this.role === 'army';       // atiradores da van/jipe: metralhadora/fuzil
            m.combat.fire({
                x: p.x, z: p.z, angle: Math.atan2(tx - p.x, tz - p.z), owner: 'police', ref: this,
                spreadMul: (1.8 + dist * 0.06) * m.moveSpread,
            }, this.role === 'army' ? 'rifle' : (heavy ? 'smg' : 'pistol'));
            this.fireCd = heavy ? 0.14 + (Math.random() < 0.18 ? 0.9 : 0) : 0.8 + Math.random() * 0.9;
        }

        // Perto de um jogador A PÉ — ou de um carro parado/quase parado: para a viatura (não atropela nem fica empurrando você
        // contra a parede) e deixa os policiais descerem. Arrancou de novo, a viatura volta a perseguir.
        const pc = m && m.game.mode === 'car' ? m.game.activeCar : null;
        this._pcStill = pc && Math.abs(pc.speed) < 1 ? (this._pcStill || 0) + dt : 0;          // carro do jogador parado há quanto tempo
        this.stoppedNear = !!(m && ((!pc && m.game.mode !== 'car' && dist < 12) || (pc && dist < 10 && this._pcStill > 2.5)));      // (desce gente)
        // (já quase parada, o freio fica leve: o seu carro consegue empurrá-la para sair do cerco — viatura parada não é parede)
        if (this.stoppedNear || (pc && dist < 10 && Math.abs(pc.speed) < 3.5)) { this._stuckT = 0; this.reason = ''; this.driveTo(0, 0, dt, 6, pc && Math.abs(this.forwardSpeed) < 2 ? 1.5 : 16); return; }

        const lead = Math.min(Config.police.leadTimeMax, dist / Config.police.interceptSpeed);
        const predicted = this.targetPos.add(this.targetVel.scale(lead));
        this._goal = predicted;

        // Na cola de um carro em fuga (vendo você): acompanha um pouco atrás e de lado, no ritmo do alvo, e só de tempos em
        // tempos tenta a batida (PIT, ~1,3 s). Antes toda viatura mirava em cima do carro e o prensava contra a parede.
        const tv = this.targetVel, ts = hypot(tv.x, tv.z);
        if (pc && ts > 6 && dist < 18 && this.mind && this.mind.sees && this._reverseT <= 0) {
            this._pitCd = (this._pitCd === undefined ? 3 + Math.random() * 3 : this._pitCd) - dt;
            if (this._pitCd < -1.3) this._pitCd = 4 + Math.random() * 4;
            if (this._pitCd > 0) { this._tail(tv, ts, dt); this._watchStuck(dt, dist); return; }
        }

        // Enroscou num prédio/poste: dá ré um instante e depois volta a seguir só as ruas.
        if (this._reverseT > 0) {
            this._reverseT -= dt;
            this.reason = '';
            this.drive(-1, this._revSteer, dt);
            return;
        }

        if (this._t >= this._roadUntil && this._pathClear(p, predicted)) {
            // Caminho livre (sem prédio nem água): vai direto, como antes.
            this.route = null;
            this.reason = '';
            this._driveDirect(predicted, dt);
        } else {
            this._chaseByRoad(predicted, dt);
        }
        this._watchStuck(dt, dist);
    }

    // Segue o carro do jogador a ~11u, deslocada para um lado (cada viatura de um lado), casando a velocidade — mas sem passar de
    // 88% da máxima da viatura (~83 km/h): na avenida, um carro comum no talo abre distância, e numa esquina ela te perde de vista.
    _tail(tv, ts, dt) {
        const p = this.position, ux = tv.x / ts, uz = tv.z / ts, side = (this.id % 2 ? 1 : -1) * 2.2;
        const tx = this.targetPos.x - ux * 11 + uz * side, tz = this.targetPos.z - uz * 11 - ux * side;
        const f = this.fwdToRef(this._tf || (this._tf = new BABYLON.Vector3()));
        let delta = Math.atan2(tx - p.x, tz - p.z) - Math.atan2(f.x, f.z);
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        const ahead = (tx - p.x) * ux + (tz - p.z) * uz;                      // > 0: o ponto de cola ainda está à frente
        const vt = Math.max(0, Math.min(this.spec.maxSpeed * 0.88, ts + ahead * 0.5));
        this.route = null; this.reason = '';
        this.driveTo(vt, Math.max(-1, Math.min(1, delta / (Math.PI / 4))), dt, 9, 13);
    }

    // Segue as ruas rumo ao alvo: a Route escolhe, a cada cruzamento, a manobra que mais o aproxima.
    _chaseByRoad(goal, dt) {
        const p = this.position;
        if (!this.route) this.reroute();
        if (!this.route || this.route.pts.length < 2) {
            this.route = null;
            this.reason = '';
            this._escapeToRoad(goal, dt);
            return;
        }
        this._replanT -= dt;
        if (this._replanT <= 0) { this._replanT = 0.9; this.route.goal = goal; this.route.replanAhead(); }
        this.aiUpdate(dt, this.traffic.env);
    }

    // Sem faixa para seguir (dentro de um quarteirão, calçada, fim de rua): primeiro chega a uma rua por um
    // caminho LIVRE; já sobre a rua, anda ao longo dela rumo ao alvo (de lá o `reroute` acha uma faixa).
    _escapeToRoad(goal, dt) {
        const p = this.position;
        const pts = RoadPlan.nearbyRoadPoints(p.x, p.z, 90);
        if (!pts.length) return;
        // Já está na rua (a < 4 u do eixo)? Anda ao longo dela rumo ao alvo.
        const near = pts.reduce((b, q) => (q.d < b.d ? q : b), pts[0]);
        if (near.d < 4) {
            const sg = Math.sign((goal.x - p.x) * near.tx + (goal.z - p.z) * near.tz) || 1;                // ao longo da via, rumo ao alvo
            const target = new BABYLON.Vector3(near.x + near.tx * 25 * sg, 0, near.z + near.tz * 25 * sg);
            this._driveDirect(target, dt);
            return;
        }
        // Saídas possíveis (ponto mais próximo de cada trecho em volta); a melhor é a de caminho livre e mais perto do alvo.
        let best = null, bestScore = Infinity;
        for (const q of pts) {
            const c = new BABYLON.Vector3(q.x, 0, q.z);
            const score = q.d + 0.5 * hypot(c.x - goal.x, c.z - goal.z) + (this._pathClear(p, c) ? 0 : 1000);
            if (score < bestScore) { bestScore = score; best = c; }
        }
        if (best) this._driveDirect(best, dt);
    }


    // Dirige até `point` com velocidade-alvo que cai com a distância (chega a ~8u parada, sem passar do ponto).
    _driveDirect(point, dt) {
        const pos = this.position;
        const dx = point.x - pos.x, dz = point.z - pos.z;
        const dist = hypot(dx, dz);
        const f = this.body.getDirection(BABYLON.Axis.Z);
        let delta = Math.atan2(dx, dz) - Math.atan2(f.x, f.z);
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        const steer = Math.max(-1, Math.min(1, delta / (Math.PI / 4)));
        let vt = Math.min(this.spec.maxSpeed * 0.85, Math.sqrt(2 * 7 * Math.max(0, dist - 8)) + 2);
        if (Math.abs(delta) > 1.2) vt = Math.min(vt, 6);                      // vira antes de acelerar
        this.driveTo(vt, steer, dt, 9, 13);
    }

    // Reposiciona numa faixa livre a 60–90u do alvo (fora da tela), já apontada para a rua.
    _relocate() {
        const g = this._goal || this.targetPos;
        for (let k = 0; k < 60; k++) {
            const l = RoadNet.randomLanePoint(14);
            if (!l) continue;
            const d = hypot(l.point.x - g.x, l.point.z - g.z);
            if (d < 60 || d > 90 || !this.traffic._clear(l.point.x, l.point.z, 12)) continue;
            this.teleport(l.point.x, l.point.z, Math.atan2(l.d.dx, l.d.dz));
            this.route = null; this._reverseT = 0; this._stuckT = 0; this.ramming = false;
            this._bestDist = Infinity; this._progressT = 0; this._relocCd = 10;
            return true;
        }
        this._progressT = 0; this._relocCd = 4;
        return false;
    }

    // Trecho reto livre? Testa o eixo e as duas laterais do carro contra prédios e a água.
    _pathClear(a, b) {
        const dx = b.x - a.x, dz = b.z - a.z, len = hypot(dx, dz);
        if (len < 1) return true;
        const nx = -dz / len * 1.4, nz = dx / len * 1.4;
        for (const k of [0, 1, -1]) {
            if (!MapGeo.hasLineOfSight(a.x + nx * k, a.z + nz * k, b.x + nx * k, b.z + nz * k)) return false;
        }
        const n = Math.ceil(len / 4);
        for (let i = 1; i < n; i++) if (!MapGeo.isLand(a.x + dx * i / n, a.z + dz * i / n)) return false;
        return true;
    }

    // Cuida de quem trava a perseguição: fila de carros (empurra), enroscada (ré) e falta de progresso (reposiciona).
    _watchStuck(dt, dist) {
        // Preso atrás de um carro: depois de ~1,3s fura a fila por 3,5s.
        const behindCar = this.reason === 'carro' && Math.abs(this.forwardSpeed) < 1.5;
        this._blockedT = behindCar ? this._blockedT + dt : Math.max(0, this._blockedT - dt * 2);
        if (this._blockedT > 1.3) { this._blockedT = 0; this.ramming = true; this._ramUntil = this._t + 3.5; }
        if (this.ramming && this._t > this._ramUntil) this.ramming = false;

        // Sem se aproximar há 12s e longe da tela: reaparece numa rua a ~70u do alvo (como a polícia "chegando").
        this._relocCd -= dt;
        if (dist < this._bestDist - 4) { this._bestDist = dist; this._progressT = 0; }
        else this._progressT += dt;
        if (this._progressT > 12 && dist > 80 && this._relocCd <= 0) this._relocate();

        const stalled = Math.abs(this.forwardSpeed) < 1.2 && dist > 10 && !this.reason;
        this._stuckT = stalled ? this._stuckT + dt : Math.max(0, this._stuckT - dt * 2);
        if (this._stuckT > 1.4) {
            this._stuckT = 0;
            this._reverseT = 1.0;
            this._revSteer = Math.random() < 0.5 ? -0.8 : 0.8;
            this._roadUntil = this._t + 6;
            this.route = null;
        }
    }

    // Dirige em direção a `point`, com acelerador limitado a `maxThrottle`.
    _driveTo(point, dt, maxThrottle) {
        const pos = this.position;
        const to = point.subtract(pos);
        to.y = 0;
        if (to.lengthSquared() < 1e-3) { this.drive(0, 0, dt); return; }
        to.normalize();

        const fwd = this.body.getDirection(BABYLON.Axis.Z);
        fwd.y = 0;
        fwd.normalize();

        let delta = Math.atan2(to.x, to.z) - Math.atan2(fwd.x, fwd.z);
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;

        const steer = BABYLON.Scalar.Clamp(delta / (Math.PI / 4), -1, 1);
        const throttle = (Math.abs(delta) < 1.7 ? 1 : 0.35) * maxThrottle;
        this.drive(throttle, steer, dt);
    }

    distanceTo(pos) {
        return BABYLON.Vector3.Distance(this.position, pos);
    }
}
