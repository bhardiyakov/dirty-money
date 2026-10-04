// ============================================================================
// Vehicle — carro arcade sobre Havok.
// Chassi dinâmico (PhysicsAggregate BOX) + rodas visuais. O movimento é
// "estilo arcade": motor por força, direção por velocidade angular (que
// também segura o chassi na horizontal = anti-capotamento) e grip lateral
// que mata a derrapagem. Colisões com prédios são resolvidas pelo Havok.
// ============================================================================

class Vehicle {
    static get TANK() { return { sedan: 45, taxi: 45, hatch: 38, suv: 65, pickup: 70, van: 75, sports: 55, moto: 14 }; }

    // carSheet/paintRow: sprite pixel art do carro (pintura = linha da paleta do CarSheet).
    constructor(scene, physics, startPos, id, carSheet = null, paintRow = 0, heading = 0) {
        this.scene = scene;
        this.id = id;
        this.controlled = false;
        this.braking = false;       // luz de freio
        this.accelerating = false;  // acelerando forte: solta fumaça
        this.signal = 0;            // seta: -1 esquerda, 0 apagada, +1 direita
        this.lightsOn = false;      // faróis (a IA liga à noite)

        // Modelo (dimensões e desempenho) vem da folha de sprites; sem sprite, um sedã padrão.
        this.spec = carSheet ? carSheet.spec : Object.assign({ id: 'sedan' }, CarSheet.MODELS.sedan);
        this.halfLen = this.spec.len / 2;
        this.halfW = this.spec.wid / 2;
        this.carSheet = carSheet;
        this.isBike = !!this.spec.bike;      // bicicleta/moto: sprite = piloto + veículo (ver Bikes.js)
        this.riderVariant = null;            // (bike) variante de paleta de quem pilota; null = sem piloto
        this.frameVariant = null;            // (bike) cor do quadro quando estacionada
        this.lastSteer = 0;                  // direção aplicada no último frame (inclinação da moto)

        // Vida e estado de destruição: amassa em 3 fases; com pouca vida solta fumaça; a 0 pega fogo e explode
        // (CarDamage cuida dos efeitos) e vira carcaça carbonizada.
        // Combustível (só veículos TERRESTRES a motor; bicicleta e barco não têm tanque). `tank` = litros do tanque (0 = não usa),
        // `fuel` = litros agora. Só gasta quem o jogador dirige (o trânsito e a polícia nunca ficam sem gasolina); o carro roubado
        // vem com o tanque entre 30% e 100%. Reabastece nos postos (Game._fuelUpdate).
        this.tank = this.spec.boat || this.spec.bike === 'bike' ? 0 : (Vehicle.TANK[this.spec.id] || this.spec.tank || 45);
        this.fuel = this.tank * (0.3 + Math.random() * 0.7);
        this.maxHp = this.spec.hp || 100;
        this.hp = this.maxHp;
        this.dent = 0;               // fase de amassado desejada (0..3)
        this._shownDent = 0;         // fase que o sprite mostra agora (as variantes são assadas aos poucos)
        this.burning = 0;            // segundos até explodir (0 = não está pegando fogo)
        this.wrecked = false;        // explodiu: carcaça
        this.wreckT = 0;
        this.engineDead = false;
        this.lastHitBy = null;       // 'player' | 'police' | 'crash' | 'shot': quem causou o último dano
        this._cmd = null;            // última velocidade COMANDADA (para detectar batidas)
        this._crashCd = 0;

        // ----- Chassi -----
        this.body = BABYLON.MeshBuilder.CreateBox(`carBody${id}`, { width: this.spec.wid - 0.1, height: this.spec.bodyH || 0.8, depth: this.spec.len - 0.3 }, scene);
        this.body.position = startPos.add(new BABYLON.Vector3(0, 0.6, 0));
        this.body.rotation.y = heading;      // orientação inicial (a física herda a transformação).

        // O corpo 3D ficou como física/sombra/laterais; a cor casa com a pintura do sprite.
        // Materiais compartilhados por pintura (poucos materiais = menos custo por frame).
        // Bloco invisível: não pinta nada na tela, mas segue na lista de sombras (o mapa de sombra ignora o
        // material de cor) e a física (aggregate) continua nele. Só o sprite aparece.
        this.body.material = Vehicle._ghostMaterial(scene);

        // Sprite por cima (y=1,5: acima da cabine 3D, abaixo de qualquer giroflex).
        this.visual = null;
        if (carSheet) {
            this.visual = new SpriteActor(scene, carSheet, paintRow, `carSprite${id}`);
            this.visual.play('static');
            this.visual.mesh.position.y = 1.5;
        }

        // Cabine 3D (dá altura à sombra do carro; o sprite cobre o topo dela).
        if (!this.spec.noCabin) {
            const cabin = BABYLON.MeshBuilder.CreateBox(`carCabin${id}`, { width: this.spec.wid * 0.8, height: 0.7, depth: this.spec.len * 0.36 }, scene);
            cabin.parent = this.body;
            cabin.position.set(0, 0.5, 0.2);
            cabin.material = Vehicle._ghostMaterial(scene);
            cabin.isPickable = false;
        }
        this.wheels = [];     // rodas 3D foram removidas: o sprite já desenha as rodas e elas ficavam escondidas.

        // ----- Física -----
        this.aggregate = new BABYLON.PhysicsAggregate(
            this.body,
            BABYLON.PhysicsShapeType.BOX,
            { mass: this.spec.mass, friction: 0.6, restitution: 0.1 },
            scene
        );
        this.phys = this.aggregate.body;
        this.phys.setLinearDamping(Config.vehicle.linearDamping);
        this.phys.setAngularDamping(1.0);
        this.layer = 0; this.elev = 0; this._setLayer(0);              // camada de colisão (1 = viaduto)
    }

    // Remove o carro do jogo (sprite, física, sombra, malhas filhas).
    dispose(shadowGenerator = null) {
        if (this.visual) { this.visual.dispose(); this.visual = null; }
        if (shadowGenerator) shadowGenerator.removeShadowCaster(this.body);
        this.aggregate.dispose();
        this.body.dispose(false, false);       // leva junto a cabine e o giroflex (filhos)
    }

    // Material do corpo 3D por pintura (cache por cena).
    static _paintMaterial(scene, row) {
        const cache = scene._carPaintMats || (scene._carPaintMats = {});
        if (!cache[row]) {
            const m = new BABYLON.StandardMaterial(`carPaint${row}`, scene);
            m.diffuseColor = BABYLON.Color3.FromHexString(CarSheet.PAINTS[row].paint);
            m.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
            cache[row] = m;
        }
        return cache[row];
    }

    // Material "fantasma": sem cor e sem profundidade na tela; a malha continua projetando sombra.
    static _ghostMaterial(scene) {
        if (!scene._carGhostMat) {
            const m = new BABYLON.StandardMaterial('carGhost', scene);
            m.disableColorWrite = true;
            m.disableDepthWrite = true;
            scene._carGhostMat = m;
        }
        return scene._carGhostMat;
    }

    static _cabinMaterial(scene) {
        if (!scene._carCabinMat) {
            const m = new BABYLON.StandardMaterial('carCabinMat', scene);
            m.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.15);
            scene._carCabinMat = m;
        }
        return scene._carCabinMat;
    }

    setControlled(v) {
        this.controlled = v;
    }

    // ------------------------------------------------------------- vida e batidas
    get hpFrac() { return this.hp / this.maxHp; }

    // Pegando fogo ou carcaça: não é mais dirigível/roubável.
    get destroyed() { return this.wrecked || this.burning > 0; }

    // Dano (batida, tiro, atropelamento, explosão). source: quem causou ('player'|'police'|'crash'|'shot'|'env').
    takeDamage(amount, source = 'env') {
        if (this.wrecked || amount <= 0) return;
        if (source && source !== 'env') this.lastHitBy = source;
        if (this.controlled) amount *= 1 - (SkillTree.m.carDmg || 0);      // habilidade Lataria
        this.hp = Math.max(0, this.hp - amount);
        const f = this.hp / this.maxHp;
        this.dent = f > 0.75 ? 0 : f > 0.5 ? 1 : f > 0.25 ? 2 : 3;
        if (this.hp <= 0) {
            if (this.spec.fire === false) this.fall();                    // bicicleta: só quebra
            else if (this.burning <= 0) {
                const [a, b] = Config.crash.burnTime;
                this.burning = a + Math.random() * (b - a);
                this.engineDead = true;
                this.throwRider(0, 0, 6);                                // moto pegando fogo: o piloto é jogado longe
            }
        }
    }

    // ------------------------------------------------------- bicicleta e moto
    // Define o piloto (variante de paleta) ou tira (null = estacionada, só o veículo).
    setRider(variant) {
        this.riderVariant = variant;
    }

    // O piloto é arremessado (batida, tiro, roubo). dx/dz = direção; (0,0) = para a frente do veículo.
    // Quem trata (Game) cria o ragdoll de quem caiu; aqui o veículo fica sem piloto.
    // kind: 'hit' (batida/tiro) | 'eject' (arrancado pelo ladrão).
    throwRider(dx, dz, power, kind = 'hit') {
        if (!this.isBike || this.riderVariant == null) return false;
        if (dx === 0 && dz === 0) { const f = this.body.getDirection(BABYLON.Axis.Z); dx = f.x; dz = f.z; }
        const v = this.riderVariant;
        this.riderVariant = null;
        if (Vehicle.onThrow) Vehicle.onThrow(this, v, dx, dz, power, kind);
        return true;
    }

    // Bicicleta/moto caída de lado (sem piloto, parada): vira "carcaça" leve (some depois, fora da tela).
    fall() {
        if (this.wrecked) return;
        this.throwRider(0, 0, 5);
        this.wrecked = true; this.wreckT = 0; this.engineDead = true;
        if (this.mode !== undefined) this.mode = 'wreck';
    }

    // Escolhe o sprite certo: andando (com piloto), estacionada (sem piloto) ou caída — e a cor da variante.
    _bikeLook() {
        const lib = this.carSheet.lib;
        if (!lib) return;
        const state = this.wrecked ? 'fallen' : (this.riderVariant != null ? 'ride' : 'park');
        const variant = this.riderVariant != null ? this.riderVariant : (this.frameVariant != null ? this.frameVariant : 2);
        const sheet = state === 'ride' && this.courier && variant >= CharacterRig.VARIANT_COURIER ? 'courier' : 'rider';      // entregador: capacete e baú
        const key = state + ':' + variant + ':' + sheet;
        if (this._lookKey === key) return;
        this._lookKey = key;
        this.visual.setSheet(Bikes.sheet(lib, this.spec.id, state, sheet));
        this.visual.setVariant(variant);
    }

    // Bicicleta: os pedais giram conforme a velocidade. Moto: 3 quadros de inclinação pelo volante.
    _animateBike(dt) {
        const v = this.visual, sp = Math.abs(this.forwardSpeed), riding = this.riderVariant != null && !this.wrecked;
        if (this.spec.bike === 'bike') {
            v.update(dt, riding ? Math.min(2.2, sp / 3.6) : 0);
        } else {
            v.update(dt, 0);
            if (riding) {
                const st = this.lastSteer * Math.min(1, sp / 5);
                v.setFrame(Math.abs(st) < 0.22 ? 1 : (st > 0 ? 0 : 2));
            }
        }
    }

    // Batida: a velocidade medida caiu bruscamente em relação à que o carro tinha comandado no frame anterior.
    _impact(dv, dvx, dvz) {
        this._crashCd = Config.crash.cooldown;
        const dmg = (dv - Config.crash.minDv) * Config.crash.dmgPerMs;
        if (Vehicle.onImpact) Vehicle.onImpact(this, dv, dmg, dvx, dvz);
        else this.takeDamage(dmg, 'crash');
    }

    // Mostra no sprite a fase de amassado atual (a variante pode ainda estar sendo assada: usa a melhor pronta)
    // e, na carcaça, a pintura carbonizada.
    _refreshLook() {
        const sheet = this.carSheet, lib = sheet && sheet.lib;
        if (!this.visual || !lib) return;
        if (this.isBike) { this._bikeLook(); return; }
        const want = this.wrecked ? 3 : this.dent;
        if (want < 3 && this.hp < this.maxHp) lib.dentSheet(sheet.modelId, want + 1);   // pré-assa a PRÓXIMA fase (troca instantânea na próxima batida)
        if (this._shownDent !== want) {
            const s = lib.dentSheet(sheet.modelId, want);
            if (s) { this.visual.setSheet(s); this._shownDent = want; }
            else for (let k = want - 1; k > this._shownDent; k--) {
                const t = lib.dentSheet(sheet.modelId, k);
                if (t) { this.visual.setSheet(t); this._shownDent = k; break; }
            }
        }
        if (this.wrecked && !this._charred) {
            this._charred = true;
            this.visual.setVariant(12);
        }
    }

    // throttle: -1..1 (frente/ré) | steer: -1..1 (direita/esquerda).
    // Modelo arcade em espaço de velocidade: decompõe v em frente+lado,
    // mata a componente lateral (grip) e recompõe — velocidade segue o nariz.
    drive(throttle, steer, dt) {
        if (this.engineDead) throttle = 0;                  // motor morto: só rola até parar
        if (this.hotwire > 0) { this.hotwire -= dt; throttle = 0; }      // ligação direta (carro trancado roubado): motor ainda não pegou
        if (this.tank > 0 && this.controlled) {             // gasolina: marcha lenta + acelerador (mais com o carro rápido); tanque vazio = motor sem força
            if (this.fuel <= 0) { this.fuel = 0; throttle = 0; }
            else this.fuel = Math.max(0, this.fuel - (this.spec.bike ? 0.5 : 1) * Config.fuel.burn * (1 - (SkillTree.m.fuel || 0)) * (0.1 + Math.abs(throttle) * (0.45 + 0.55 * Math.min(1, this.speed / this.spec.maxSpeed))) * dt);
        }
        const up = BABYLON.Vector3.Up();
        const forward = this.body.getDirection(BABYLON.Axis.Z);
        forward.y = 0;
        forward.normalize();
        const right = BABYLON.Vector3.Cross(up, forward).normalize();

        const vel = this.phys.getLinearVelocity();
        let fwd = BABYLON.Vector3.Dot(vel, forward);   // velocidade à frente.
        let lat = BABYLON.Vector3.Dot(vel, right);     // velocidade lateral (a "derrapagem").

        // --- Motor: integra a velocidade à frente ---
        const accel = this.spec.power / this.spec.mass; // m/s²
        // Estado lido pelas luzes de freio e pela fumaça do escapamento.
        this.braking = (throttle < 0 && fwd > 0.5) || (throttle > 0 && fwd < -0.5);
        this.accelerating = throttle > 0 && fwd >= -0.5 && fwd < this.spec.maxSpeed * 0.7;
        if (throttle !== 0) {
            fwd += throttle * accel * dt * (this.braking && !this.spec.boat && Weather.cur ? Weather.cur.brakeMul : 1);       // freio na chuva rende menos
        } else {
            // Freio-motor / resistência ao rolamento: desacelera suave até parar.
            const drop = (this.spec.brakeDrag || Config.vehicle.brakeDrag * (Weather.cur ? Weather.cur.brakeMul : 1)) * dt;
            fwd = Math.abs(fwd) <= drop ? 0 : fwd - Math.sign(fwd) * drop;
        }
        fwd = BABYLON.Scalar.Clamp(fwd, -(this.spec.maxReverse || Config.vehicle.maxReverse), this.spec.maxSpeed * (this.controlled ? 1 + (SkillTree.m.topSpeed || 0) : 1));
        this._applyMotion(fwd, lat, steer, dt, vel, forward, right);
    }

    // Controle por VELOCIDADE-ALVO (usado pela IA do trânsito): acelera/freia até `target`
    // (m/s, ≥ 0) com os limites accel/brake, em vez de empurrar com o acelerador.
    driveTo(target, steer, dt, accel = 6, brake = 12) {
        const forward = this.body.getDirection(BABYLON.Axis.Z);
        forward.y = 0;
        forward.normalize();
        const right = BABYLON.Vector3.Cross(BABYLON.Vector3.Up(), forward).normalize();

        const vel = this.phys.getLinearVelocity();
        let fwd = BABYLON.Vector3.Dot(vel, forward);
        const lat = BABYLON.Vector3.Dot(vel, right);

        // Luz de freio: freando de verdade OU parado segurando o freio (semáforo, fila).
        this.braking = target < fwd - 0.6 || (target < 0.3 && fwd < 1.2);
        this.accelerating = target > fwd + 0.5;
        if (fwd < target) fwd = Math.min(target, fwd + accel * dt);
        else fwd = Math.max(target, fwd - brake * (this.spec.boat || !Weather.cur ? 1 : Weather.cur.brakeMul) * dt);       // (pista molhada: freia pior)
        this._applyMotion(fwd, lat, steer, dt, vel, forward, right);
    }

    // Parte comum: água, grip lateral, guinada e recomposição da velocidade.
    _applyMotion(fwd, lat, steer, dt, vel, forward, right) {
        this.lastSteer = steer;
        // --- Batida? (o carro sempre recompõe a velocidade a partir da MEDIDA, então a diferença entre a
        //     medida e a comandada antes só é grande quando algo o freou/empurrou de verdade) ---
        this._crashCd -= dt;
        if (this._cmd && this._crashCd <= 0) {
            const dvx = vel.x - this._cmd.x, dvz = vel.z - this._cmd.z;
            const dv = Math.hypot(dvx, dvz);
            if (dv > Config.crash.minDv) this._impact(dv, dvx, dvz);
        }

        // --- Água: fora da terra o carro atola (não dá pra atravessar sem ponte). Barco é o contrário: encalha na terra. ---
        const pos = this.position, onLand = MapGeo.isLand(pos.x, pos.z);
        if (this.spec.boat ? onLand : !onLand) {
            const drag = this.spec.boat ? 14 : Config.vehicle.waterDrag;
            fwd *= Math.exp(-drag * dt);
            lat *= Math.exp(-drag * dt);
        }

        // --- Grip lateral: mata a derrapagem (decaimento exponencial = independe de FPS); barco derrapa mais na água ---
        lat *= Math.exp(-(this.spec.grip || Config.vehicle.grip * (this.spec.boat || !Weather.cur ? 1 : Weather.cur.gripMul)) * (this.controlled && !this.spec.boat ? Vehicle.playerGrip : 1) * dt);       // (skill Direção: Vehicle.playerGrip)       // (pista molhada: carro derrapa mais)

        // --- Direção: guinada proporcional à velocidade; zera X/Z (anti-capotamento) ---
        // Inverte ao dar ré (como um carro real) e não vira parado.
        const speedFactor = Math.min(1, Math.abs(fwd) / (this.spec.turnRef || Config.vehicle.turnSpeedRef));
        const yaw = steer * this.spec.turn * speedFactor * (fwd < 0 ? -1 : 1) * (this.controlled ? Vehicle.playerTurn : 1);
        this.phys.setAngularVelocity(new BABYLON.Vector3(0, yaw, 0));

        // --- Recompõe a velocidade preservando a queda (gravidade) ---
        const newVel = forward.scale(fwd).add(right.scale(lat));
        newVel.y = vel.y;
        this.phys.setLinearVelocity(newVel);
        (this._cmd || (this._cmd = new BABYLON.Vector3())).copyFrom(newVel);
    }

    // Velocidade à frente (negativa = ré).
    get forwardSpeed() {
        const f = this.body.getDirection(BABYLON.Axis.Z);
        const v = this.phys.getLinearVelocity();
        return v.x * f.x + v.z * f.z;
    }

    // Teletransporta o corpo físico (spawn, respawn, remover carro abandonado). O Havok só
    // lê a transformação do mesh se `disablePreStep` estiver desligado — por 2 frames.
    teleport(x, z, heading) {
        this.phys.disablePreStep = false;
        this.body.position.set(x, 0.45, z);
        this.body.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(heading, 0, 0);
        this.phys.setLinearVelocity(BABYLON.Vector3.Zero());
        this.phys.setAngularVelocity(BABYLON.Vector3.Zero());
        this._preStepFrames = 2;
        this._cmd = null;                       // (o salto não é batida)
    }

    // Leva o sprite para a posição/rotação do corpo físico (chame todo frame).
    syncVisual(dt) {
        if (this._preStepFrames > 0 && --this._preStepFrames === 0) this.phys.disablePreStep = true;
        if (!this.visual) return;
        this._refreshLook();
        const p = this.body.getAbsolutePosition();
        const f = this.body.getDirection(BABYLON.Axis.Z);
        this.visual.setPosition(p.x, p.z);
        this.visual.setHeading(Math.atan2(f.x, f.z));
        // Viaduto: o sprite sobe com o tabuleiro (a física é plana) e o carro passa para a camada 1 (não colide com o de baixo).
        if (RoadPlan.viaducts && RoadPlan.viaducts.length) {
            const e = RoadPlan.elevAt(p.x, p.z, f.x, f.z);
            this.elev = e;
            const L = e > 2.2 ? 1 : 0;
            if (L !== (this.layer || 0)) this._setLayer(L);
            this.visual.mesh.position.y = 1.5 + e;
        }
        if (this.isBike) this._animateBike(dt); else this.visual.update(dt);
    }

    // Camada de colisão: 0 = chão, 1 = tabuleiro do viaduto. Os dois grupos se ignoram; os sólidos fixos continuam valendo.
    _setLayer(L) {
        this.layer = L;
        const sh = this.aggregate && this.aggregate.shape;
        if (!sh) return;
        sh.filterMembershipMask = L ? 2 : 1;
        sh.filterCollideMask = L ? ~1 : ~2;
    }

    get position() {
        return this.body.getAbsolutePosition();
    }

    get speed() {
        return this.phys.getLinearVelocity().length();
    }

    get velocity() {
        return this.phys.getLinearVelocity();
    }
}

// Skill Direção (carreira Desmanche): multiplicadores de aderência lateral e de giro só para o veículo que o JOGADOR dirige.
Vehicle.playerGrip = 1;
Vehicle.playerTurn = 1;
