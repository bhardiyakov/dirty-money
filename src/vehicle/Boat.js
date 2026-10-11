// ============================================================================
// Boat — jet ski, lancha e barco. É um `Vehicle` normal (corpo físico arcade no Havok, roubável, pilotável, amassa, pega fogo
// e explode), mas o "chão" é a ÁGUA: encalha na terra e nos píeres (MapGeo.isShore: sob a ponte passa), derrapa de lado como casco e deixa rastro.
//
// Modos (mesmos nomes do trânsito, para luzes/explosão/carcaça funcionarem sem mudança):
//   'parked'     atracado na marina ou ancorado: parado, vazio, destrancado (F para subir)
//   'drive'      navegando sozinho, com piloto ao leme (a IA desvia da costa; F tira o piloto — ele cai na água)
//   'abandoned'  o jogador largou: fica à deriva até parar
//   'wreck'      carcaça depois da explosão
//
// BoatManager cria os barcos (vagas da marina + ancorados soltos + alguns navegando), dá o "tick" deles (só os perto da
// câmera simulam), faz o rastro (marolas) e a água jorrando (WaterSpray: proa, rabo de galo, curva, hélice) e remove carcaças.
// ============================================================================

class Boat extends Vehicle {
    constructor(scene, physics, pos, id, sheet, paint, heading, mgr, mode = 'parked') {
        super(scene, physics, new BABYLON.Vector3(pos.x, 0, pos.z), id, sheet, paint, heading);
        this.mgr = mgr;
        this.isBoat = true;
        this.mode = mode; this.baseMode = mode;
        this.pilot = mode === 'drive';                 // piloto de IA ao leme
        this.driver = this.pilot;
        this.locked = false;
        this.home = { x: pos.x, z: pos.z };            // de onde nasceu (a IA não se afasta muito)
        this.cruise = [0.85, 1.1][Math.floor(Math.random() * 2)] * ({ jetski: 11, lancha: 9, barco: 5 }[this.spec.id] || 6);
        this.bobT = Math.random() * 6;
        this.wp = null; this._wpT = 0; this._asleep = false;
        this.fireOn = false;
    }

    // Piloto à vista no sprite (jetski e lancha): o da IA ou quem o jogador controla.
    get hasRider() { return (this.controlled || this.pilot) && !this.destroyed; }

    // O jogador subiu: o piloto da IA (se havia) pula na água.
    setControlled(v) {
        const was = this.controlled;
        super.setControlled(v);
        if (v) { this.pilot = false; this.driver = false; this.mode = 'drive'; this.wp = null; }
        else if (was) { this.mode = 'abandoned'; this.driver = false; }
    }

    // Distância (u) de um ponto até o CASCO (retângulo do corpo): para o jogador alcançar o barco por qualquer lado do píer.
    distTo(pos) {
        const c = this.position, f = this.body.getDirection(BABYLON.Axis.Z), l = hypot(f.x, f.z) || 1;
        const fx = f.x / l, fz = f.z / l, dx = pos.x - c.x, dz = pos.z - c.z, lf = dx * fx + dz * fz, lr = dx * fz - dz * fx;
        return hypot(Math.max(0, Math.abs(lf) - this.halfLen), Math.max(0, Math.abs(lr) - this.halfW));
    }

    // Ponto do casco (na borda) mais perto de `pos`, para onde o jogador "embarca".
    boardPoint(pos) {
        const c = this.position, f = this.body.getDirection(BABYLON.Axis.Z), l = hypot(f.x, f.z) || 1;
        const fx = f.x / l, fz = f.z / l, rx = fz, rz = -fx, dx = pos.x - c.x, dz = pos.z - c.z;
        const lf = Math.max(-this.halfLen + 0.8, Math.min(this.halfLen - 0.8, dx * fx + dz * fz)), lr = Math.max(-this.halfW + 0.3, Math.min(this.halfW - 0.3, dx * rx + dz * rz));
        return { x: c.x + fx * lf + rx * lr, z: c.z + fz * lf + rz * lr };
    }

    // --------------------------------------------------------------- aparência
    _refreshLook() {
        const lib = this.carSheet && this.carSheet.lib;
        if (!this.visual || !lib) return;
        const rider = this.hasRider && this.spec.id !== 'barco', key = this.wrecked ? 'w' : (rider ? 'r' + (this.controlled ? 'p' : '') : 'p');
        if (this._lookKey === key) return;
        this._lookKey = key;
        if (this.visual instanceof RiderActor) {                       // casco do atlas + piloto (o jogador, ou um civil) por cima
            const g = this.mgr && this.mgr.g, sheet = g && g.sprites && g.sprites.sheets.rider;
            const v = this.controlled ? 0 : 2 + (this.id * 7) % ((g && g.sprites.civilianVariants) || 20);
            this.visual.setRider(rider && !this.wrecked ? v : null, sheet, this.spec.id === 'jetski' ? 'ride_jetski' : 'ride_boat');      // (2,5D; o boneco antigo usa ride_moto)
            if (this.wrecked) { this.visual.setVariant(12); this.visual.setDamage(3); }
            return;
        }
        this.visual.setSheet(lib.sheet(this.spec.id, rider && !this.wrecked));
        if (this.wrecked) this.visual.setVariant(12);
    }

    syncVisual(dt) {
        if (this._preStepFrames > 0 && --this._preStepFrames === 0) this.phys.disablePreStep = true;
        if (!this.visual) return;
        this._refreshLook();
        const p = this.body.getAbsolutePosition(), f = this.body.getDirection(BABYLON.Axis.Z);
        this.bobT += dt;
        this.visual.setPosition(p.x, p.z);
        this.visual.setHeading(Math.atan2(f.x, f.z));
        // Debaixo de uma ponte o sprite fica ABAIXO do tabuleiro (a ponte o esconde; o círculo de visibilidade o revela).
        const sea = 1 + (Weather.cur ? Weather.cur.k * 2.2 : 0);            // mar agitado com chuva: o barco balança mais
        const y = RoadPlan.onBridge(p.x, p.z) ? 0.1 : 0.8 + Math.sin(this.bobT * 1.6 * sea + this.id) * 0.04 * sea;
        if (this.visual.setY) this.visual.setY(y); else this.visual.mesh.position.y = y;
        this._bodyMotion(dt, f);                                            // (o casco "senta" na arrancada e mergulha na freada)
        if (!this.wrecked && this.visual.setDamage) this.visual.setDamage(this.dent);
        this.visual.update(dt);
    }

    // Camadas de colisão: barco não bate nas muretas das pontes (passa por baixo) nem no tabuleiro do viaduto.
    _setLayer(L) {
        this.layer = 0;
        const sh = this.aggregate && this.aggregate.shape;
        if (!sh) return;
        sh.filterMembershipMask = 4;
        sh.filterCollideMask = ~(2 | 8);
    }

    // ------------------------------------------------------------ guarda de costa
    // A proa/popa ou o costado apontam para terra (margem, píer)? Corta a velocidade nessa direção: o barco encosta e desliza,
    // em vez de subir na praia. Sondas à frente e dos lados.
    _applyMotion(fwd, lat, steer, dt, vel, forward, right) {
        const p = this.position, hl = this.halfLen, hw = this.halfW + 0.9;
        const land = (ox, oz) => MapGeo.isShore(p.x + forward.x * ox + right.x * oz, p.z + forward.z * ox + right.z * oz);      // (ponte não: passa por baixo)
        if (fwd > 0.2) {
            if (land(hl + 1.2, 0) || land(hl + 0.6, hw * 0.7) || land(hl + 0.6, -hw * 0.7)) fwd = Math.min(fwd, 0);
            else if (land(hl + 3 + fwd * 0.5, 0)) fwd = Math.max(0, fwd - 26 * dt);
        } else if (fwd < -0.2 && (land(-hl - 1.2, 0) || land(-hl - 0.6, hw * 0.7) || land(-hl - 0.6, -hw * 0.7))) fwd = Math.max(fwd, 0);
        if (lat > 0.2 && land(0, hw + 0.4)) lat = Math.min(lat, 0);
        else if (lat < -0.2 && land(0, -hw - 0.4)) lat = Math.max(lat, 0);
        super._applyMotion(fwd, lat, steer, dt, vel, forward, right);
    }

    // ------------------------------------------------------------------- frame
    update(dt, env, focus) {
        if (this._asleep && (this.controlled || this.burning > 0 || this.wrecked)) { this._asleep = false; this.phys.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC); if (this.visual) this.visual.setVisible(true); }
        if (this.controlled) { this.syncVisual(dt); return; }
        if (this.burning > 0 || this.wrecked) { this.driveTo(0, 0, dt, 3, 8); this.syncVisual(dt); return; }
        const p = this.position;
        if (focus && hypot(p.x - focus.x, p.z - focus.z) > 160) {            // longe da câmera (a tela mostra ~60 u): dorme — sem IA, sem sprite e CONGELADO no Havok (corpo estático custa quase nada)
            if (!this._asleep) {
                this._asleep = true; this.phys.setLinearVelocity(BABYLON.Vector3.Zero()); this.phys.setAngularVelocity(BABYLON.Vector3.Zero());
                this.syncVisual(0); if (this.visual) this.visual.setVisible(false);
                this.phys.setMotionType(BABYLON.PhysicsMotionType.STATIC);
            }
            return;
        }
        if (this._asleep) { this._asleep = false; this.phys.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC); if (this.visual) this.visual.setVisible(true); }
        if (this.hold || this.mode === 'parked' || this.mode === 'abandoned' || this.mode === 'wreck') this.driveTo(0, 0, dt, 3, 4.5);
        else this.cruiseUpdate(dt);
        this.syncVisual(dt);
    }

    // Linha de água livre? (nenhum ponto de terra, píer ou fora do mundo entre p e p + d na direção `a`)
    _clear(p, a, d) {
        const s = Math.sin(a), c = Math.cos(a);
        for (let t = 6; t <= d; t += 6) { const x = p.x + s * t, z = p.z + c * t; if (MapGeo.isShore(x, z) || !WorldMap.inWorld(x, z)) return false; }
        return true;
    }

    _pickWaypoint() {
        const p = this.position;
        for (let tries = 0; tries < 14; tries++) {
            const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 110, x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
            if (hypot(x - this.home.x, z - this.home.z) > 520) continue;
            if (MapGeo.isShore(x, z) || !WorldMap.inWorld(x, z) || !this._clear(p, a, d + 8)) continue;
            this.wp = { x, z }; this._wpT = 28 + Math.random() * 20;
            return;
        }
        this.wp = null; this._wpT = 2;
    }

    // Navega: vai de waypoint em waypoint, desviando da costa (testa o rumo e abre o ângulo até achar água livre).
    cruiseUpdate(dt) {
        const p = this.position, f = this.body.getDirection(BABYLON.Axis.Z), heading = Math.atan2(f.x, f.z), v = this.forwardSpeed;
        this._wpT -= dt;
        if (!this.wp || this._wpT <= 0 || hypot(this.wp.x - p.x, this.wp.z - p.z) < 14) this._pickWaypoint();
        if (!this.wp) { this.driveTo(this.cruise * 0.3, 0.4, dt, 2, 4); return; }
        const want = Math.atan2(this.wp.x - p.x, this.wp.z - p.z), look = 16 + Math.abs(v) * 1.6;
        let ang = want, turned = false;
        for (const k of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.5]) {
            if (this._clear(p, want + k, look)) { ang = want + k; turned = k !== 0; break; }
            turned = true;
        }
        let delta = ang - heading;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        const steer = Math.max(-1, Math.min(1, delta / 0.5));
        const vt = this.cruise * (turned ? 0.55 : 1) * (Math.abs(delta) > 1.0 ? 0.5 : 1);
        this.driveTo(vt, steer, dt, this.spec.power / this.spec.mass * 0.5, 5);
    }

    // Jogador tirou o piloto da IA: ele pula na água.
    dismissPilot() { this.pilot = false; this.driver = false; }
}

// ============================================================================
class BoatManager {
    constructor(game, scene, physics, vehicleManager, boatLib, shadowGenerator) {
        this.g = game; this.scene = scene; this.physics = physics; this.vm = vehicleManager; this.lib = boatLib; this.shadow = shadowGenerator;
        this.boats = vehicleManager.boats = [];
        this._nextId = 700;
        this._wakeT = 0;
        this.stats = { marina: 0, anchored: 0, cruising: 0 };
    }

    _make(kind, x, z, heading, paint, mode) {
        const id = this._nextId++, sheet = this.lib.sheet(kind, mode === 'drive' && kind !== 'barco');
        const b = new Boat(this.scene, this.physics, { x, z }, id, sheet, paint, heading, this, mode);
        if (this.shadow) this.shadow.addShadowCaster(b.body);
        this.boats.push(b);
        b.body.computeWorldMatrix(true);
        b.syncVisual(0);                     // (o sprite já nasce no lugar certo, mesmo que o barco durma longe da câmera)
        return b;
    }

    // Água aberta (>= `margin` u da margem), fora da marina e das pontes, para ancorar/navegar.
    _waterSpot(x0, x1, z0, z1, margin = 22, avoid = []) {
        const M = typeof Marina !== 'undefined' ? Marina : null;
        for (let t = 0; t < 80; t++) {
            const x = x0 + Math.random() * (x1 - x0), z = z0 + Math.random() * (z1 - z0);
            if (MapGeo.isLand(x, z) || WorldMap.waterDist(x, z) < 0 || !WorldMap.inWorld(x, z)) continue;
            const k = WorldMap.index(x, z);
            if (k < 0 || WorldMap.dist[k] < margin) continue;                              // (dist = metros até a terra)
            if (M && M.box && x > M.box[0] - 20 && x < M.box[2] + 25 && z > M.box[1] - 20 && z < M.box[3] + 20) continue;
            if ([714, 0, -630].some((bz) => Math.abs(z - bz) < 22)) continue;                // longe das pontes
            if (avoid.some((a) => hypot(a.x - x, a.z - z) < 38)) continue;
            return { x, z };
        }
        return null;
    }

    // Marina cheia, barcos ancorados soltos pelo canal e pelo mar, e alguns navegando.
    spawn() {
        const rows = BoatSheet.PAINT_ROWS, pick = (k) => rows[k][Math.floor(Math.random() * rows[k].length)], placed = [];
        if (typeof Marina !== 'undefined' && Marina.slips) {
            for (const s of Marina.slips) for (const b of s.boats) { this._make(b.kind, b.x, b.z, b.heading, b.paint, 'parked'); this.stats.marina++; }
        }
        const anchored = [['lancha', 235, 375, -900, 1000], ['barco', 235, 375, -900, 1000], ['lancha', 235, 375, -900, 1000], ['jetski', 235, 375, -900, 1000], ['barco', 235, 375, -900, 1000],
            ['lancha', 235, 375, -900, 1000], ['jetski', 235, 375, -900, 1000], ['lancha', 235, 375, -900, 1000], ['barco', 840, 960, -700, 700], ['lancha', 840, 960, -700, 700],
            ['barco', 840, 960, -700, 700], ['jetski', 840, 960, -700, 700], ['lancha', 235, 375, -900, 1000], ['barco', 235, 375, -900, 1000]];
        for (const [kind, x0, x1, z0, z1] of anchored) {
            const s = this._waterSpot(x0, x1, z0, z1, 22, placed);
            if (!s) continue;
            placed.push(s);
            this._make(kind, s.x, s.z, Math.random() * Math.PI * 2, pick(kind), 'parked');
            this.stats.anchored++;
        }
        for (const kind of ['jetski', 'jetski', 'lancha', 'lancha', 'barco', 'jetski']) {
            const s = this._waterSpot(240, 370, -900, 1000, 30, placed);
            if (!s) continue;
            placed.push(s);
            this._make(kind, s.x, s.z, Math.random() * Math.PI * 2, pick(kind), 'drive');
            this.stats.cruising++;
        }
        console.log(`[BARCOS] ${this.boats.length} barcos: ${this.stats.marina} na marina, ${this.stats.anchored} ancorados, ${this.stats.cruising} navegando`);
    }

    // Carcaça explodida cumpriu o papel: some (o barco "afunda") e um novo ancora/navega em outro ponto, longe da câmera.
    removeWreck(boat) {
        const i = this.boats.indexOf(boat);
        if (i < 0) return;
        this.boats.splice(i, 1);
        if (this.g.carLights) this.g.carLights.release(boat);
        boat.dispose(this.shadow);
        const f = this.g.camera.target, s = this._waterSpot(235, 375, -900, 1000, 22, []);
        if (s && hypot(s.x - f.x, s.z - f.z) > 120) this._make(boat.spec.id, s.x, s.z, Math.random() * Math.PI * 2, BoatSheet.PAINT_ROWS[boat.spec.id][0], 'parked');
    }

    update(dt, game) {
        const f = game.camera.target;
        for (const b of this.boats) b.update(dt, null, f);
        this._spray(dt, game);
        // Rastro: marolas atrás de quem anda rápido e está perto da câmera.
        this._wakeT -= dt;
        if (this._wakeT > 0) return;
        this._wakeT = 0.16;
        const fx = game.camera.target.x, fz = game.camera.target.z;
        for (const b of this.boats) {
            if (b.wrecked || b._asleep) continue;
            const p = b.position;
            if (hypot(p.x - fx, p.z - fz) > 70) continue;
            const v = Math.abs(b.forwardSpeed);
            if (v < 1.5) continue;
            const d = b.body.getDirection(BABYLON.Axis.Z), l = hypot(d.x, d.z) || 1, ux = d.x / l, uz = d.z / l, back = b.halfLen * 0.8;
            const size = 0.8 + b.halfW * 0.9 + v * 0.12;
            game.waterFx.ripple(p.x - ux * back, p.z - uz * back, size * 0.3, size * 1.15, 1.4, 0.34);      // (a espuma e os jorros: _spray)
        }
    }

    // Água jorrando (WaterSpray, pixel art) nos barcos perto da câmera. Os jorros têm tamanho de verdade (a folha não é esticada:
    // jet ski ~1 m, lancha ~1,6 m); a velocidade muda quantos saem, quão fortes (opacidade) e o tipo, não a escala.
    //   proa      um jorro de cada lado do casco, baixo e largo, abrindo para fora e para trás. Saem colados uns nos outros e andam
    //             quase junto com o barco (ficam para trás devagar): viram uma lâmina contínua na proa que se desfaz no V da esteira
    //   rabo de galo  o jato alto atrás do jet ski (e da lancha rápida); de lado na tela é o leque, de trás/de frente a coroa estreita
    //   curva     derrapando de lado, um leque para FORA da curva
    //   hélice    espuma revirada na popa da lancha e do barco
    _spray(dt, game) {
        const W = game.waterFx && game.waterFx.spray;
        if (!W) return;
        const cx = game.camera.target.x, cz = game.camera.target.z, vel = this._vel || (this._vel = new BABYLON.Vector3());
        const yaw = CompassCamera.yaw || 0, srx = Math.cos(yaw), srz = -Math.sin(yaw);             // "para a direita" da tela, no chão
        const sideways = (dx, dz) => Math.abs(dx * srx + dz * srz) / (Math.hypot(dx, dz) || 1) > 0.4;
        for (const b of this.boats) {
            if (b.wrecked || b._asleep || !b.body) continue;
            const p = b.position;
            if (Math.abs(p.x - cx) > 60 || Math.abs(p.z - cz) > 60) continue;
            const v = b.forwardSpeed, av = Math.abs(v);
            if (av < 2.5) continue;
            const id = b.spec.id, jet = id === 'jetski', k = Math.min(1, av / b.spec.maxSpeed), S = b._spray || (b._spray = { bow: Math.random() * 0.1, tail: 0, turn: 0, churn: 0 });
            const d = b.body.getDirection(BABYLON.Axis.Z), l = Math.hypot(d.x, d.z) || 1, ux = d.x / l, uz = d.z / l, rx = uz, rz = -ux;
            const go = v > 0 ? 1 : -1;                                                               // (de ré: a água abre na popa)
            b.phys.getLinearVelocityToRef(vel);
            const lat = vel.x * rx + vel.z * rz, a = 0.55 + 0.4 * k;
            // proa: os dois lados (jet ski e lancha devagar: o jorro menor)
            if ((S.bow -= dt) <= 0) {
                S.bow = (id === 'barco' ? 0.09 : 0.05) * (1.4 - 0.6 * k);
                const at = b.halfLen * (jet ? 0.3 : 0.45) * go, side = b.halfW * 0.9, kind = jet || k < 0.4 ? 'bowS' : 'bowL';
                for (const sd of [-1, 1]) {
                    const ox = rx * sd, oz = rz * sd;
                    W.emit(p.x + ux * at + ox * side, p.z + uz * at + oz * side, { kind, dir: [ox - ux * 0.45 * go, oz - uz * 0.45 * go], a,
                        vx: vel.x * 0.8 + ox * 1.0, vz: vel.z * 0.8 + oz * 1.0, drag: 1.1 });
                }
            }
            // rabo de galo: jet ski acima de ~30 km/h, lancha só bem rápida
            if (v > (jet ? 8 : b.spec.maxSpeed * 0.6) && (S.tail -= dt) <= 0) {
                S.tail = jet ? 0.09 : 0.14;
                const at = b.halfLen * 1.02, side = sideways(-ux, -uz);
                W.emit(p.x - ux * at, p.z - uz * at, { kind: side ? 'tail' : 'tailC', dir: [-ux, -uz], a: a * (jet ? 1 : 0.8), vx: vel.x * 0.3 - ux * 1.2, vz: vel.z * 0.3 - uz * 1.2 });
            }
            // curva fechada: leque para fora (para onde o casco está derrapando)
            if (Math.abs(lat) > 1.6 && av > 6 && (S.turn -= dt) <= 0) {
                S.turn = 0.1;
                const sd = Math.sign(lat), ox = rx * sd, oz = rz * sd;
                W.emit(p.x + ox * b.halfW - ux * b.halfLen * 0.35, p.z + oz * b.halfW - uz * b.halfLen * 0.35, { kind: jet ? 'tail' : 'bowL', dir: [ox - ux * 0.2, oz - uz * 0.2],
                    a: Math.min(1, 0.6 + Math.abs(lat) * 0.08), vx: vel.x * 0.4 + ox * 1.5, vz: vel.z * 0.4 + oz * 1.5 });
            }
            // hélice: espuma revirada na popa (lancha e barco)
            if (!jet && (S.churn -= dt) <= 0) {
                S.churn = 0.16 - 0.06 * k;
                const at = -b.halfLen * 0.98, sd = Math.random() < 0.5 ? -1 : 1;
                W.emit(p.x + ux * at + rx * sd * b.halfW * 0.3, p.z + uz * at + rz * sd * b.halfW * 0.3, { kind: 'churn', a: 0.8, vx: vel.x * 0.2, vz: vel.z * 0.2 });
            }
        }
    }
}
