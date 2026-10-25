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
        this._yaw = 0;                       // guinada (rad/s) de fato aplicada: com o jogador ao volante ela tem inércia (ver _applyMotion)
        this.slide = 0;                      // derrapagem por excesso de velocidade na curva (0..1): o pneu canta (AudioFX.screech)

        // Vida e estado de destruição: amassa em 3 fases; com pouca vida solta fumaça; a 0 pega fogo e explode
        // (CarDamage cuida dos efeitos) e vira carcaça carbonizada.
        // Combustível (só veículos TERRESTRES a motor; bicicleta e barco não têm tanque). `tank` = litros do tanque (0 = não usa),
        // `fuel` = litros agora. Só gasta quem o jogador dirige (o trânsito e a polícia nunca ficam sem gasolina); o carro roubado
        // vem com o tanque entre 30% e 100%. Reabastece nos postos (Game._fuelUpdate).
        this.tank = this.spec.boat || this.spec.bike === 'bike' ? 0 : (Vehicle.TANK[this.spec.id] || this.spec.tank || 45);
        this.fuel = this.tank * (0.3 + Math.random() * 0.7);
        this.maxHp = Math.round((this.spec.hp || 100) * (Config.vehicle.hpMul || 1));      // (lataria: catálogo × Config.vehicle.hpMul)
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
        this.body.layerMask = Vehicle.GHOST_LAYER;                     // a câmera nem tenta desenhar (o mapa de sombra ignora a máscara)
        this.body._dmShadowBox = [this.spec.wid - 0.1, this.spec.bodyH || 0.8, this.spec.len - 0.3];   // sombra pelo lote (ShadowBoxBatch)

        // Sprite por cima (y=1,5: acima da cabine 3D, abaixo de qualquer giroflex). Carro: quad do lote único do atlas (CarArt), girado
        // no ângulo exato; moto/bicicleta/barco: SpriteActor com a folha de direções.
        this.visual = null;
        if (carSheet && carSheet.art === 'rider') {                 // moto, bicicleta, barco: veículo do atlas + piloto por cima
            this.paintRow = this.spec.bike ? Bikes.paintOf(this.spec.id, id) : paintRow;
            this.visual = new RiderActor(scene, carSheet.vehModel, this.paintRow, carSheet.seat, carSheet.scale || 1);
            this.visual.setY(this.spec.boat ? 0.8 : 1.5);
            this.visual.setPosition(startPos.x, startPos.z);
            this.visual.setHeading(heading);
        } else if (carSheet && carSheet.art) {
            this.visual = CarArt.actor(carSheet.modelId, paintRow);
            this.visual.setY(1.5);
            this.visual.setPosition(startPos.x, startPos.z);              // já nasce no lugar (não na origem)
            this.visual.setHeading(heading);
        } else if (carSheet) {
            this.visual = new SpriteActor(scene, carSheet, paintRow, `carSprite${id}`);
            this.visual.play('static');
            this.visual.mesh.position.y = 1.5;
            this.visual.setPosition(startPos.x, startPos.z);
            this.visual.setHeading(heading);
        }

        // Moto, bicicleta e barcos: a sombra segue o DESENHO (a ficha de física é só aproximada) e tem formato próprio — cápsula para
        // duas rodas, casco com proa para barcos — e altura de verdade (o piloto da moto já tem a sombra dele, no sprite).
        const D3 = this.visual && this.visual.body && typeof CarArt3D !== 'undefined' ? CarArt3D.def(this.visual.body.modelId) : null;
        const m = this.visual && this.visual.body ? CarArt.model(this.visual.body.modelId) || (D3 && { len: D3.len * CarArt3D.K, wid: D3.wid * CarArt3D.K }) : null;
        if ((this.spec.bike || this.spec.boat) && m) {
            const k = this.visual.body.scale || 1;
            const H = { moto: 0.8, bicycle: 0.7, jetski: 1.1, lancha: 1.6, barco: 2.4 }[this.spec.id] || (this.spec.bike === 'moto' ? 0.85 : 1);
            const L = m.len * k, W = m.wid * k;
            if (this.spec.boat) {
                this.body._dmShadowBox = [W * 0.95, H, L * 0.97];
                this.body._dmShadowShape = 'hull';
            } else {
                // Duas rodas: a largura do desenho é a do GUIDÃO — o chassi é fino (~40% dela). O guidão vira uma barra fina à parte,
                // no alto e à frente (as mãos do piloto), que projeta só um traço.
                this.body._dmShadowBox = [W * (this.spec.bike === 'moto' ? 0.42 : 0.28), H, L * 0.92];
                this.body._dmShadowShape = 'pill';
                const bar = BABYLON.MeshBuilder.CreateBox(`carBar${id}`, { size: 0.1 }, scene);
                bar.parent = this.body;
                bar.position.set(0, 0.4, L * 0.24);
                bar.material = Vehicle._ghostMaterial(scene);
                bar.layerMask = Vehicle.GHOST_LAYER;
                bar.isPickable = false;
                bar._dmShadowBox = [W * 0.72, 0.1, 0.12];
                bar._dmShadowShape = 'car';
            }
        }

        // Cabine 3D (dá altura à sombra do carro; o sprite cobre o topo dela).
        if (!this.spec.noCabin) {
            const cabin = BABYLON.MeshBuilder.CreateBox(`carCabin${id}`, { width: this.spec.wid * 0.8, height: 0.7, depth: this.spec.len * 0.36 }, scene);
            cabin.parent = this.body;
            cabin.position.set(0, 0.5, 0.2);
            cabin.material = Vehicle._ghostMaterial(scene);
            cabin.layerMask = Vehicle.GHOST_LAYER;
            cabin.isPickable = false;
            cabin._dmShadowBox = [this.spec.wid * 0.8, 0.7, this.spec.len * 0.36];
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

        // Vetores de rascunho (por carro): o movimento roda todo quadro e antes criava ~8 Vector3 por carro por quadro.
        this._fw = new BABYLON.Vector3(); this._rt = new BABYLON.Vector3(); this._v = new BABYLON.Vector3(); this._nv = new BABYLON.Vector3();
        this._av = new BABYLON.Vector3(); this._dz = new BABYLON.Vector3();
        // Velocidade lida do Havok UMA vez por passo de física (ver `velocity`); quem a muda pelo corpo invalida a leitura.
        this._vel = new BABYLON.Vector3(); this._velF = -1;
        const setLV = this.phys.setLinearVelocity.bind(this.phys);
        this.phys.setLinearVelocity = (v) => { this._velF = -1; this.phys._dmRest = false; setLV(v); };      // (_dmRest: ver Physics.init)
    }

    // Remove o carro do jogo (sprite, física, sombra, malhas filhas).
    dispose(shadowGenerator = null) {
        if (this.clearDeadDriver) this.clearDeadDriver();                 // (a buzina presa vai junto)
        if (this.visual) { this.visual.dispose(); this.visual = null; }
        if (shadowGenerator) shadowGenerator.removeShadowCaster(this.body);
        this.aggregate.dispose();
        this.body.dispose(false, false);       // leva junto a cabine e o giroflex (filhos)
    }

    // Refaz o visual do CARRO (Ajustes › Carros 3D): sprite do atlas ↔ carro 3D, com a mesma pintura, amassado, altura e posição.
    // Motos, bicicletas e barcos (RiderActor) ficam como estão.
    remakeVisual() {
        const v = this.visual, sheet = this.carSheet;
        if (!v || !sheet || sheet.art !== true) return;
        const nv = CarArt.actor(sheet.modelId, v.variant);
        nv.setY(v.y); nv.setDamage(v.dent); nv.setVisible(v.visible);
        if (nv.setGlass) nv.setGlass(this.glass || 0);
        if (v._placed) { nv.setPosition(v.x, v.z); nv.setHeading(v.heading); }
        v.dispose();
        this.visual = nv;
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

    // Camada fora da máscara da câmera (0x0FFFFFFF): malhas só de sombra/física não viram chamada de desenho na tela.
    static get GHOST_LAYER() { return 0x10000000; }

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
        if (v && !this.controlled && typeof CarCare !== 'undefined') { this.controlled = true; CarCare.onEnter(this); }      // peças, partida (vehicle/CarCare.js)
        this.controlled = v;
    }

    // ------------------------------------------------------------- vidros (tiro: Combat._carShot; soco no vidro: Game._smashWindow)
    // Vidro i (0 para-brisa, 1 traseiro, 2/3 janela da frente esq./dir., 4/5 de trás esq./dir.) estilhaçado: o carro 3D mostra o buraco.
    // true se quebrou agora (já estava quebrado: false). fixGlass: carro "novo" (realocado pelo trânsito).
    breakGlass(i) {
        const bit = 1 << i;
        if ((this.glass || 0) & bit) return false;
        this.glass = (this.glass || 0) | bit;
        if (this.visual && this.visual.setGlass) this.visual.setGlass(this.glass);
        return true;
    }
    fixGlass() { this.glass = 0; if (this.visual && this.visual.setGlass) this.visual.setGlass(0); }

    // ------------------------------------------------------------- vida e batidas
    get hpFrac() { return this.hp / this.maxHp; }

    // Pegando fogo ou carcaça: não é mais dirigível/roubável.
    get destroyed() { return this.wrecked || this.burning > 0 || !!this.capsized; }      // (capotado: de teto para baixo, não anda nem é roubável)

    // Dano (batida, tiro, atropelamento, explosão). source: quem causou ('player'|'police'|'crash'|'shot'|'env').
    takeDamage(amount, source = 'env') {
        if (this.wrecked || amount <= 0) return;
        if (source && source !== 'env') this.lastHitBy = source;
        if (this.controlled) amount *= 1 - (SkillTree.m.carDmg || 0);      // habilidade Lataria
        if (this.cond && typeof CarCare !== 'undefined') CarCare.onDamage(this, amount, source);      // tiro no capô fura o radiador
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

    // ------------------------------------------------------- pneus (tiro: Combat)
    // Rodas: 0 dianteira esquerda, 1 dianteira direita, 2 traseira esquerda, 3 traseira direita. Posição no mundo em `out`.
    wheelWorld(i, out = { x: 0, z: 0 }) {
        const f = this.fwdToRef(this._wf || (this._wf = new BABYLON.Vector3())), P = this.position, m = this.visual && this.visual.tire;
        const tz = (m ? m.z : this.halfLen * 0.6) * (i < 2 ? 1 : -1), tx = (m ? m.x : this.halfW * 0.75) * (i % 2 ? 1 : -1);
        out.x = P.x + f.x * tz + f.z * tx; out.z = P.z + f.z * tz - f.x * tx;
        return out;
    }
    nearestWheel(x, z) {
        let best = 0, bd = Infinity;
        for (let i = 0; i < 4; i++) { const w = this.wheelWorld(i), d = (w.x - x) ** 2 + (w.z - z) ** 2; if (d < bd) { bd = d; best = i; } }
        return best;
    }
    // Fura o pneu i (false se já estava furado). O carro passa a escorregar (_applyMotion) e o aro solta faíscas no asfalto.
    puncture(i) {
        if (this.isBike || this.isBoat || this.destroyed) return false;
        const F = this.flat || (this.flat = [0, 0, 0, 0]);
        if (F[i]) return false;
        F[i] = 1;
        return true;
    }
    get flatCount() { const F = this.flat; return F ? F[0] + F[1] + F[2] + F[3] : 0; }
    // O aro no asfalto: faíscas (e marca no chão) atrás de cada roda furada, mais com o carro rápido.
    _rimFx(dt) {
        const g = SkidMarks.game, sp = this.speed;
        if (!this.flatCount || sp < 3 || !g || !g.combat || this._asleep) return;
        const P = this.position, fc = SkidMarks.focus;
        if (fc && (Math.abs(P.x - fc.x) > 60 || Math.abs(P.z - fc.z) > 60)) return;
        const f = this.fwdToRef(this._rf || (this._rf = new BABYLON.Vector3()));
        for (let i = 0; i < 4; i++) {
            if (!this.flat[i]) continue;
            const w = this.wheelWorld(i), out = i % 2 ? 1 : -1;                     // (lado de fora da roda: direita ou esquerda do carro)
            if (typeof SparkFx !== 'undefined') SparkFx.trail(g, this, w.x, w.z, f.z * out, -f.x * out, dt);
            SkidMarks.track(this, 4 + i, w.x, w.z, (this.elev || 0) + 0.2, 0.55);
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
        this._fell = true;                  // (caiu, não queimou: a pintura continua)
        this.wrecked = true; this.wreckT = 0; this.engineDead = true;
        if (this.mode !== undefined) this.mode = 'wreck';
    }

    // Caída numa batida (não queimou)? Então dá para LEVANTAR: o jogador põe de pé e sobe (Game._mountBike).
    get canRaise() { return this.isBike && !!this._fell && !(this.burning > 0); }

    // Põe a moto/bicicleta caída de pé de novo, sem piloto e parada. Bicicleta que caiu por estar destruída volta torta (25% da vida).
    raise() {
        if (!this.canRaise) return false;
        this._fell = false; this.wrecked = false; this.wreckT = 0; this.engineDead = false;
        if (this.hp <= 0) {
            this.hp = Math.round(this.maxHp * 0.25);
            const f = this.hp / this.maxHp;
            this.dent = f > 0.75 ? 0 : f > 0.5 ? 1 : f > 0.25 ? 2 : 3;
        }
        if (this.mode !== undefined) { this.mode = 'abandoned'; this.route = null; }
        this.driver = false;
        this._lookKey = null;               // (troca o desenho caído pelo de pé no próximo quadro)
        return true;
    }

    // Escolhe o sprite certo: andando (com piloto), estacionada (sem piloto) ou caída — e a cor da variante.
    _bikeLook() {
        const lib = this.carSheet.lib;
        if (!lib) return;
        const state = this.wrecked ? 'fallen' : (this.riderVariant != null ? 'ride' : 'park');
        const variant = this.riderVariant != null ? this.riderVariant : (this.frameVariant != null ? this.frameVariant : 2);
        const sheet = state === 'ride' && this.courier && variant >= CharacterRig.VARIANT_COURIER ? 'courier' : 'rider';      // entregador: capacete e baú
        const key = state + ':' + variant + ':' + sheet + (this.courier ? 'c' : '');
        if (this._lookKey === key) return;
        this._lookKey = key;
        if (this.visual instanceof RiderActor) {                      // veículo do atlas (em pé / caído) + piloto por cima
            const art = this.carSheet.vehModel;
            this.visual.setModel(state === 'fallen' ? art + '_caida' : art);
            if (this.courier) this.visual.setVariant(Bikes.COURIER_PAINT);
            this.visual.setRider(state === 'ride' ? variant : null, lib.sheets[sheet], this.spec.bike === 'bike' ? 'ride_bike' : 'ride_moto');
            return;
        }
        this.visual.setSheet(Bikes.sheet(lib, this.spec.id, state, sheet));
        this.visual.setVariant(variant);
    }

    // Bicicleta: os pedais giram conforme a velocidade. Moto: moto e piloto DEITAM JUNTOS para dentro da curva — o ângulo é o da
    // física (atan(velocidade × giro / g): a aceleração lateral da curva que está acontecendo), não o do guidão; a moto 3D deita esse
    // ângulo e o piloto toca o degrau de inclinação dele (RiderActor.setLean: contínuo, + = deitado para a direita; o degrau extremo,
    // 1, = RiderActor.BANK rad). Bicicleta: deita bem pouco (o ciclista pedalando não tem degraus de inclinação).
    // Dando RÉ (moto ou bicicleta): não tem marcha a ré — o piloto anda para trás com os pés no chão, montado (RiderActor.walkBack).
    _animateBike(dt) {
        const v = this.visual, fwd = this.forwardSpeed, sp = Math.abs(fwd), riding = this.riderVariant != null && !this.wrecked;
        const back = riding && fwd < -0.15 && v.walkBack;
        if (v.walkBack) v.walkBack(back);
        if (back) { if (v.setLean) v.setLean(0, dt); v.update(dt, -Math.min(1.6, sp / 1.1)); return; }
        const lean = riding ? Math.atan((fwd * (this._yaw || 0)) / 9.81) / (typeof RiderActor !== 'undefined' ? RiderActor.BANK : 0.5) : 0;
        if (this.spec.bike === 'bike') {
            if (riding && v.setLean) v.setLean(lean * 0.2, dt);                // (bicicleta 3D: deita um pouco na curva)
            // (o ride_bike dos personagens 2,5D foi assado girando o pedivela para trás — de baixo para a frente: tocado ao contrário,
            // pedala para a frente; o do boneco antigo já gira para a frente)
            v.update(dt, riding ? (Bikes.npc() ? -1 : 1) * Math.min(2.6, sp / 3.6 * (1 + 0.35 * (this.controlled ? this.pedal || 0 : 0))) : 0);      // (pedalando forte: cadência maior)
        } else {
            if (riding && v.setLean) v.setLean(lean, dt);
            v.update(dt, 0);
        }
    }

    // ------------------------------------------------------- CAPOTAMENTO (batida muito forte, como no Burnout)
    // Game._onCarImpact decide (Config.crash.rollDv…): o carro DECOLA e capota — a carroceria 3D gira em volta do comprimento
    // (batida de lado: rola de lado; de frente, forte: dá cambalhota) enquanto o corpo físico desliza perdendo velocidade e girando;
    // quem dirige perde o controle até ele assentar. Termina de rodas no chão (segue, todo amassado) ou de TETO PARA BAIXO: aí fica
    // capotado (motor morto, não anda mais — o jogador só sai). sideK: −1..1 (lado da pancada, + = veio da direita), dv em m/s.
    rollover(dv, sideK, frontK) {
        if (this.tumble || this.capsized || this.isBike || this.spec.boat || this.destroyed) return false;
        const C = Config.crash, flip = Math.abs(frontK) > Math.abs(sideK) && dv > C.flipDv;
        // meias-voltas: mais forte = mais giros; ímpar = termina de teto para baixo
        let halves = Math.max(1, Math.min(5, Math.round((dv - C.rollDv) / 4 + 1 + Math.random() * 1.6)));
        if (dv < C.rollAlways && Math.random() < 0.55) halves = 2;                        // (batida mais leve: costuma voltar de rodas no chão)
        const dir = (flip ? (frontK > 0 ? -1 : 1) : (sideK >= 0 ? -1 : 1)), end = dir * halves * Math.PI;
        const dur = 0.55 + halves * 0.24, h = Math.min(2.6, 0.45 + (dv - C.rollDv) * 0.11);
        this.tumble = { t: 0, dur, roll: flip ? 0 : end, pitch: flip ? end : (Math.random() - 0.5) * 0.7, h, spin: (Math.random() - 0.5) * 5, wob: (Math.random() - 0.5) * 0.5 };
        this.engineDead = true;                                                         // (o motor morre no ar; volta se assentar de rodas no chão)
        this.slide = 0;
        return true;
    }
    // Avança o capotamento (física e desenho; syncVisual, todo quadro). true = ainda capotando.
    _tumbleTick(dt) {
        const T = this.tumble;
        if (!T) return false;
        T.t += dt;
        const u = Math.min(1, T.t / T.dur), e = 1 - (1 - u) * (1 - u);                    // (gira rápido no começo, assenta no fim)
        const v = this._v; this.phys.getLinearVelocityToRef(v);
        const k = Math.exp(-(u < 0.75 ? 1.1 : 4) * dt);                                 // no ar quase não freia; raspando no chão, freia forte
        this.phys.setLinearVelocity(this._nv.set(v.x * k, v.y, v.z * k));
        this.phys.setAngularVelocity(this._av.set(0, T.spin * (1 - u), 0));
        this._cmd = null;                                                               // (a decolagem não é uma nova batida)
        const vis = this.visual;
        if (vis && 'tRoll' in vis) {
            vis.tRoll = T.roll * e; vis.tPitch = T.pitch * e + Math.sin(u * Math.PI * 3) * T.wob * (1 - u);
            vis.tLift = T.h * Math.sin(Math.PI * Math.min(1, u * 1.15)) * (1 - u * 0.2);
        }
        if (u < 1) return true;
        const R = ((Math.round(T.roll / Math.PI) % 2) + 2) % 2, P = ((Math.round(T.pitch / Math.PI) % 2) + 2) % 2;
        this.tumble = null;
        if (vis && 'tRoll' in vis) { vis.tLift = 0; vis.tRoll = R ? Math.PI : 0; vis.tPitch = P ? Math.PI : 0; }
        if (R || P) { this.capsized = true; this.engineDead = true; this.dent = 3; }      // de teto para baixo: fica assim
        else if (!this.destroyed) this.engineDead = false;
        if (Vehicle.onTumbleEnd) Vehicle.onTumbleEnd(this, !!(R || P));
        return false;
    }

    // Batida: a velocidade medida caiu bruscamente em relação à que o carro tinha comandado no frame anterior.
    _impact(dv, dvx, dvz) {
        this._crashCd = Config.crash.cooldown;
        const C = Config.crash, dmg = C.dmgK * Math.pow(dv - C.minDv, C.dmgExp);          // curva: leve quase nada, feia muito
        if (Vehicle.onImpact) Vehicle.onImpact(this, dv, dmg, dvx, dvz);
        else if (this.spec.fire !== false) this.takeDamage(dmg, 'crash');      // (bicicleta: batida não a estraga)
    }

    // Mostra no sprite a fase de amassado atual (o atlas já tem as 3 fases: é só um número no shader) e, na carcaça, a pintura
    // carbonizada.
    _refreshLook() {
        const sheet = this.carSheet, lib = sheet && sheet.lib;
        if (!this.visual || !lib) return;
        if (this.isBike) { this._bikeLook(); if (!(this.visual instanceof RiderActor)) return; }
        const want = this.wrecked && !this._fell ? 3 : this.dent;
        if (this._shownDent !== want) { this.visual.setDamage(want); this._shownDent = want; }
        if (this.wrecked && !this._fell && !this._charred) {
            this._charred = true;
            this.visual.setVariant(12);
        }
    }

    // throttle: -1..1 (frente/ré) | steer: -1..1 (direita/esquerda).
    // Modelo arcade em espaço de velocidade: decompõe v em frente+lado,
    // mata a componente lateral (grip) e recompõe — velocidade segue o nariz.
    drive(throttle, steer, dt) {
        if (this.tumble) { this.throttle = 0; this.braking = false; this.accelerating = false; return; }      // capotando: sem controle (syncVisual avança)
        if (this.capsized) { throttle = 0; steer = 0; }                                    // de teto para baixo: não anda
        this.throttleIn = throttle;                         // pedal do jogador (mesmo com o motor desligado: acelerar tenta dar a partida)
        if (this.engineDead) throttle = 0;                  // motor morto: só rola até parar
        if (this.controlled && typeof EngineAudio !== 'undefined' && EngineAudio.gates(this)) throttle = 0;      // dando a partida / morreu: sem força
        if (this.hotwire > 0) { this.hotwire -= dt; throttle = 0; }      // ligação direta (carro trancado roubado): motor ainda não pegou
        if (this.controlled && typeof CarCare !== 'undefined' && CarCare.usable(this)) throttle = CarCare.tick(this, throttle, dt);      // motor falhando, superaquecido, bateria, freio, pneus (vehicle/CarCare.js)
        const cc = this.controlled && this.cond;
        if (this.tank > 0 && this.controlled) {             // gasolina: marcha lenta + acelerador (mais com o carro rápido); tanque vazio = motor sem força
            if (this.fuel <= 0) { this.fuel = 0; throttle = 0; }
            else this.fuel = Math.max(0, this.fuel - (this.spec.bike ? 0.5 : 1) * Config.fuel.burn * (1 - (SkillTree.m.fuel || 0)) * (0.1 + Math.abs(throttle) * (0.45 + 0.55 * Math.min(1, this.speed / this.spec.maxSpeed))) * dt);
        }
        this.throttle = throttle;                           // (o que chegou ao motor: o som do motor lê — EngineAudio)
        const forward = this._flatAxes();
        const right = this._rt;

        const vel = this._v; this.phys.getLinearVelocityToRef(vel);      // (os *ToRef do Babylon 6 não devolvem o vetor)
        let fwd = BABYLON.Vector3.Dot(vel, forward);   // velocidade à frente.
        let lat = BABYLON.Vector3.Dot(vel, right);     // velocidade lateral (a "derrapagem").
        // O atrito do chassi com o chão (Havok, ~6 m/s²) comeria a arrancada realista: andando livre, parte da velocidade COMANDADA
        // no passo anterior. Se a medida ficou bem abaixo (parede, batida, outro carro), vale a medida.
        if (this._cmd) {
            const cf = this._cmd.x * forward.x + this._cmd.z * forward.z;          // (vale para a frente e para a ré)
            if (cf * fwd > -0.05 && Math.abs(cf) > Math.abs(fwd) && Math.abs(cf) - Math.abs(fwd) < 1.2) fwd = cf;
        }

        // --- Motor: integra a velocidade à frente ---
        const top = this.spec.maxSpeed * (this.controlled ? 1 + (SkillTree.m.topSpeed || 0) : 1) * (cc ? this._ccTop || 1 : 1) * (this.nosOn ? Vehicle.NOS_TOP : 1);      // (nitro: StreetRacing)
        // Estado lido pelas luzes de freio e pela fumaça do escapamento.
        this.braking = (throttle < 0 && fwd > 0.5) || (throttle > 0 && fwd < -0.5);
        // Aceleração (m/s²). Freio: forte, como sempre (power/mass). Motor: pela arrancada do modelo (spec.t100 = 0–100 km/h em s,
        // ver CarSheet) — popular leva ~16 s, superesportivo ~3 s —, perdendo força perto da máxima (arrasto do ar). Ré: marcha curta,
        // um pouco mais forte. Sem t100 (barcos): o modelo antigo, power/mass. Freio: até brakeA, se o modelo tem (motos e bicicletas).
        // Bicicleta do jogador: pedalando normal, ela vai a 80% da máxima (pouco mais que o trote a pé); o SPRINT pedala FORTE (this.pedal: o impulso do sprint —
        // InputManager.sprintTick, posto pelo Game, que também gasta o fôlego) — até a máxima e com mais arrancada. Passou do ritmo
        // da pedalada (soltou o sprint embalado), só rola.
        const pedal = this.controlled && this.spec.bike === 'bike' ? Math.max(0, Math.min(1, this.pedal || 0)) : null;
        const topP = pedal === null ? top : top * (0.8 + 0.2 * pedal);
        if (pedal !== null && throttle > 0 && fwd >= topP) throttle = 0;
        const accel = Vehicle.accelOf(this.spec, fwd, topP, throttle, this.braking) * (pedal === null || this.braking ? 1 : 0.85 + 0.9 * pedal) * (this.nosOn && !this.braking ? Vehicle.NOS_ACC : 1);
        this.accelerating = throttle > 0 && fwd >= -0.5 && fwd < this.spec.maxSpeed * 0.7;
        if (throttle !== 0) {
            fwd += throttle * accel * dt * (this.braking && !this.spec.boat && Weather.cur ? Weather.cur.brakeMul : 1) * (cc ? (this.braking ? this._ccBrake || 1 : this._ccPow || 1) : 1)       // freio na chuva rende menos · freio gasto / motor fraco
                * (this.braking ? this.tuneBrake || 1 : 1);                                                                                                // freios da tunagem (Tuning)
        } else {
            // Freio-motor / resistência ao rolamento: desacelera suave até parar.
            const drop = (this.spec.brakeDrag || Config.vehicle.brakeDrag * (Weather.cur ? Weather.cur.brakeMul : 1)) * dt;
            fwd = Math.abs(fwd) <= drop ? 0 : fwd - Math.sign(fwd) * drop;
        }
        // (moto e bicicleta não têm ré: o piloto empurra com os pés — devagar, no passo)
        fwd = BABYLON.Scalar.Clamp(fwd, -(this.spec.maxReverse || (this.spec.bike ? Config.vehicle.bikeReverse : Config.vehicle.maxReverse)), top);
        this._applyMotion(fwd, lat, steer, dt, vel, forward, right);
    }

    // Aceleração (m/s²) do modelo `spec` a `fwd` m/s (máxima `top`): freando, power/mass (até brakeA); acelerando, pela arrancada (t100).
    static accelOf(spec, fwd, top, throttle = 1, braking = false) {
        let a = spec.power / spec.mass;
        if (braking && spec.brakeA) a = Math.min(a, spec.brakeA);
        if (spec.t100 && !braking) {
            const r = Math.min(1, Math.abs(fwd) / top);
            a = Math.min(a, (27.78 / spec.t100) * (throttle < 0 ? 1.6 : 1) * (1 - 0.6 * r * r * r));
        }
        return a;
    }

    // Controle por VELOCIDADE-ALVO (usado pela IA do trânsito): acelera/freia até `target`
    // (m/s, ≥ 0) com os limites accel/brake, em vez de empurrar com o acelerador.
    driveTo(target, steer, dt, accel = 6, brake = 12) {
        if (this.tumble) { this.braking = false; this.accelerating = false; return; }      // capotando: sem controle (syncVisual avança)
        if (this.capsized) { target = 0; steer = 0; }
        const forward = this._flatAxes();
        const right = this._rt;

        const vel = this._v.copyFrom(this.velocity);                  // (a já lida neste passo de física: 1 chamada ao Havok a menos por carro)
        let fwd = BABYLON.Vector3.Dot(vel, forward);
        const lat = BABYLON.Vector3.Dot(vel, right);

        // Luz de freio: freando de verdade OU parado segurando o freio (semáforo, fila).
        this.braking = target < fwd - 0.6 || (target < 0.3 && fwd < 1.2);
        this.accelerating = target > fwd + 0.5;
        if (fwd < target) fwd = Math.min(target, fwd + accel * dt);
        else fwd = Math.max(target, fwd - brake * (this.spec.boat || !Weather.cur ? 1 : Weather.cur.brakeMul) * dt);       // (pista molhada: freia pior)
        this._applyMotion(fwd, lat, steer, dt, vel, forward, right);
    }

    // Frente do carro no plano do chão (normalizada) em this._fw e a direita (up × frente) em this._rt. Devolve a frente.
    _flatAxes() {
        const f = this._fw;
        this.fwdToRef(f);                                        // (do quaternião: sem matriz de mundo)
        f.y = 0;
        f.normalize();
        this._rt.set(f.z, 0, -f.x);                       // Cross(Up, f) com f no plano
        return f;
    }

    // Parte comum: água, grip lateral, guinada e recomposição da velocidade.
    _applyMotion(fwd, lat, steer, dt, vel, forward, right) {
        this.lastSteer = steer;
        // --- Batida? (o carro sempre recompõe a velocidade a partir da MEDIDA, então a diferença entre a
        //     medida e a comandada antes só é grande quando algo o freou/empurrou de verdade) ---
        this._crashCd -= dt;
        if (this._cmd && this._crashCd <= 0) {
            const dvx = vel.x - this._cmd.x, dvz = vel.z - this._cmd.z;
            const dv = hypot(dvx, dvz);
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
        // Pneu furado (tiro — ver puncture): a roda no aro não segura de lado (traseira furada: rabeia), puxa para o lado dela e o
        // carro "sabonta" (balança de um lado para o outro); e arrasta um pouco.
        const F = this.flat, nFlat = F ? F[0] + F[1] + F[2] + F[3] : 0;
        let gripK = 1, pull = 0, wob = 0;
        if (nFlat && Math.abs(fwd) > 1) {
            const sp = Math.min(1, Math.abs(fwd) / 12);
            this._flatT = (this._flatT || 0) + dt;
            gripK = F[2] || F[3] ? 0.18 : 0.4;
            pull = ((F[1] + F[3]) - (F[0] + F[2])) * 0.22 * sp;
            wob = Math.sin(this._flatT * 7.3 + this.id) * 0.55 * sp + Math.sin(this._flatT * 2.1) * 0.25 * sp;
            lat += Math.sin(this._flatT * 5.1 + 1.7) * 2.2 * sp * dt * 4;
            fwd *= Math.exp(-0.18 * nFlat * dt);
        }

        // --- Direção: guinada proporcional à velocidade; zera X/Z (anti-capotamento) ---
        // Inverte ao dar ré (como um carro real) e não vira parado.
        const speedFactor = Math.min(1, Math.abs(fwd) / (this.spec.turnRef || Config.vehicle.turnSpeedRef));
        if (this.controlled && this.cond) { gripK *= this._ccGrip || 1; pull += this._ccPull || 0; }      // pneu careca / suspensão desalinhada (CarCare)
        let yaw = (steer * this.spec.turn * (this.controlled ? Vehicle.playerTurn : 1) + pull + wob) * speedFactor * (fwd < 0 ? -1 : 1);
        // Moto/bicicleta do jogador: a curva é a que a INCLINAÇÃO aguenta — a aceleração lateral (velocidade × giro) não passa de
        // Config.vehicle.bikeLat (~0,9 g: a moto deitada ~42°) — e o giro entra e sai com um pouco de atraso (o tempo de deitar e
        // levantar a moto). Antes o giro era o do guidão em qualquer velocidade: a 100 km/h, uma curva de 8 g.
        if (this.controlled && this.isBike) {
            const V = Config.vehicle, af = Math.abs(fwd), cap = V.bikeLat / Math.max(af, 1);
            if (Math.abs(yaw) > cap) yaw = Math.sign(yaw) * cap;
            yaw = this._byaw = (this._byaw || 0) + (yaw - (this._byaw || 0)) * (1 - Math.exp(-V.bikeLeanIn * dt));
        }

        // --- PESO e DERRAPAGEM (só o carro que o jogador dirige; IA, motos, bicicletas e barcos seguem o modelo de sempre) ---
        //   peso:       rápido, o carro vira menos (subesterço) e a guinada não muda na hora — cresce e some com a inércia da massa
        //               (um utilitário de 2 t demora o dobro de um popular para "entrar" na curva e para se endireitar);
        //   derrapagem: quando a curva pede mais aceleração lateral (velocidade × guinada) do que os pneus seguram, a traseira solta —
        //               o pneu quase não segura de lado, o carro gira um pouco além do volante e arrasta perdendo velocidade.
        //               Contra-esterço ou aliviar a curva devolvem a aderência. Pista molhada e a skill Direção mudam o limite.
        if (this.controlled && !this.spec.boat && !this.isBike) {
            const V = Config.vehicle, af = Math.abs(fwd), hs = Math.min(1, af / V.understeerRef);
            yaw *= 1 - V.understeer * hs * hs;
            const kI = V.yawInertia * Math.sqrt(1000 / this.spec.mass);
            this._yaw += (yaw - this._yaw) * (1 - Math.exp(-kI * dt));
            const limit = V.slipLimit * (Weather.cur ? Weather.cur.gripMul : 1) * Vehicle.playerGrip * (this.tuneGrip || 1);        // (suspensão da tunagem)
            const over = af > V.slipMinSpeed ? Math.max(0, Math.abs(fwd * this._yaw) - limit) / limit : 0;
            const want = Math.min(1, over * V.slipGain);
            this.slide += (want - this.slide) * (1 - Math.exp(-(want > this.slide ? 7 : 2.2) * dt));
            if (this.slide < 1e-3) this.slide = 0;
            yaw = this._yaw * (1 + V.slipYaw * this.slide);
            gripK *= 1 - V.slipGrip * this.slide;
            fwd *= Math.exp(-V.slipScrub * this.slide * dt);
        } else { this._yaw = yaw; this.slide = 0; }

        lat *= Math.exp(-(this.spec.grip || Config.vehicle.grip * (this.spec.boat || !Weather.cur ? 1 : Weather.cur.gripMul)) * gripK * (this.controlled && !this.spec.boat ? Vehicle.playerGrip : 1) * dt);       // (skill Direção: Vehicle.playerGrip)       // (pista molhada: carro derrapa mais)
        this.phys.setAngularVelocity(this._av.set(0, yaw, 0));

        // --- Recompõe a velocidade preservando a queda (gravidade) ---
        const newVel = this._nv.set(forward.x * fwd + right.x * lat, vel.y, forward.z * fwd + right.z * lat);
        this.phys.setLinearVelocity(newVel);
        (this._cmd || (this._cmd = new BABYLON.Vector3())).copyFrom(newVel);
    }

    // Velocidade à frente (negativa = ré).
    get forwardSpeed() {
        const f = this._dz;
        this.fwdToRef(f);
        const v = this.velocity;
        return v.x * f.x + v.z * f.z;
    }

    // ---------------------------------------------------------------- dormir (fora da bolha acordada, ver Zones.asleep)
    // Congela o carro: guarda a velocidade, zera e DESATIVA o corpo no Havok (não simula, não sincroniza). A IA também para (quem
    // chama pula o update). Ao acordar, devolve a velocidade e o carro segue de onde estava — ainda fora da tela.
    sleep() {
        if (this._asleep) return;
        const v = this.velocity;
        this._sleepVel = { x: v.x, z: v.z };
        this.phys.setLinearVelocity(Vehicle._ZERO); this.phys.setAngularVelocity(Vehicle._ZERO);
        this._activation(false);
        this._asleep = true;
        this.phys._dmRest = true;
        this.braking = false; this.accelerating = false; this.signal = 0;
    }

    wake() {
        if (!this._asleep) return;
        this._asleep = false;
        const s = this._sleepVel; this._sleepVel = null;
        this._activation(true);
        this.phys.setLinearVelocity(s ? this._nv.set(s.x, 0, s.z) : Vehicle._ZERO);      // (também libera a releitura da física)
    }

    // Enquanto dorme: só termina o "pré-passo" de um teletransporte (o recycle do trânsito move carros adormecidos).
    sleepTick() {
        if (this._preStepFrames > 0 && --this._preStepFrames === 0) { this.phys.disablePreStep = true; this.phys._dmRest = true; }
    }

    _activation(on) {
        try {
            const pl = this.phys._physicsPlugin || this.body.getScene().getPhysicsEngine().getPhysicsPlugin(), hk = pl._hknp;
            hk.HP_Body_SetActivationState(this.phys._pluginData.hpBodyId, on ? hk.ActivationState.ACTIVE : hk.ActivationState.INACTIVE);
        } catch (e) { /* sem controle de ativação: só a velocidade zerada já basta */ }
    }

    // Teletransporta o corpo físico (spawn, respawn, remover carro abandonado). O Havok só
    // lê a transformação do mesh se `disablePreStep` estiver desligado — por 2 frames.
    teleport(x, z, heading) {
        this.phys.disablePreStep = false; this.phys._dmRest = false; this._sleepVel = null;      // (adormecido e movido: acorda parado no lugar novo)
        this.body.position.set(x, 0.45, z);
        this.body.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(heading, 0, 0);
        this.phys.setLinearVelocity(BABYLON.Vector3.Zero());
        this.phys.setAngularVelocity(BABYLON.Vector3.Zero());
        this._preStepFrames = 2;
        this._cmd = null;                       // (o salto não é batida)
        this._onDeck = false;                   // (teleportado: o viaduto é reavaliado pela rampa)
        if (this.tumble || this.capsized) {    // (reaproveitado: outro carro, de rodas no chão)
            this.tumble = null; this.capsized = false; this.engineDead = !!this.wrecked;
            if (this.visual && 'tRoll' in this.visual) this.visual.tRoll = this.visual.tPitch = this.visual.tLift = 0;
        }
        if (this.visual) { this.visual.setPosition(x, z); this.visual.setHeading(heading); }      // o sprite vai junto já neste quadro
    }

    // Leva o sprite para a posição/rotação do corpo físico (chame todo frame).
    syncVisual(dt) {
        if (this._preStepFrames > 0 && --this._preStepFrames === 0) this.phys.disablePreStep = true;
        if (this.tumble) this._tumbleTick(dt);                   // capotando (rollover)
        if (!this.visual) return;
        this._refreshLook();
        const p = this.position;                                 // (sem recalcular a matriz do corpo: ver o getter `position`)
        const f = this._sdir || (this._sdir = new BABYLON.Vector3());
        this.fwdToRef(f);                                        // (sem Vector3 novo nem matriz de mundo)
        this.visual.setPosition(p.x, p.z);
        this.visual.setHeading(Math.atan2(f.x, f.z));
        // Viaduto: o sprite sobe com o tabuleiro (a física é plana) e o carro passa para a camada 1 (não colide com o de baixo).
        // Só SOBE quem entra pela rampa andando ao longo da via (quem cruza por baixo, em outra rua, fica no chão); quem já está no
        // tabuleiro fica nele até sair pela outra ponta — a altura passa a depender só da posição. Antes a direção era conferida o
        // tempo todo: girar ou derrapar lá em cima fazia o carro "cair" para baixo do tabuleiro (e trocar de camada de colisão).
        if (RoadPlan.viaducts && RoadPlan.viaducts.length) {
            const e = this._onDeck ? RoadPlan.elevAt(p.x, p.z) : RoadPlan.elevAt(p.x, p.z, f.x, f.z);
            this._onDeck = e > 0;
            this.elev = e;
            const L = e > 2.2 ? 1 : 0;
            if (L !== (this.layer || 0)) this._setLayer(L);
            if (this.visual.setY) this.visual.setY(1.5 + e); else this.visual.mesh.position.y = 1.5 + e;
        }
        this._bodyMotion(dt, f);
        if (this.isBike) this._animateBike(dt); else this.visual.update(dt);
    }

    // Movimento da carroceria e do chão: a aceleração no referencial do carro (da velocidade medida, quadro a quadro) move a suspensão
    // e as rodas da frente do sprite (CarActor.animate); derrapagem, freada brusca e arrancada cantando pneu deixam marcas no chão
    // (SkidMarks) e soltam fumaça de borracha.
    _bodyMotion(dt, f) {
        if (dt <= 0 || !this.visual) return;
        const v = this.velocity, fl = Math.sqrt(f.x * f.x + f.z * f.z) || 1, fx = f.x / fl, fz = f.z / fl;
        const pv = this._pv || (this._pv = { x: v.x, z: v.z, fwd: 0, h: null });
        const ax = (v.x - pv.x) / dt, az = (v.z - pv.z) / dt;
        pv.x = v.x; pv.z = v.z;
        const aF = ax * fx + az * fz, aL = ax * fz - az * fx;
        const hd = Math.atan2(fx, fz);                                                        // giro do chassi (rad/s): a carroceria "atrasa" nele
        let yr = 0;
        if (pv.h !== null) { let d = hd - pv.h; d = Math.atan2(Math.sin(d), Math.cos(d)); yr = d / dt; }
        pv.h = hd;
        if (this.visual.setFlat) this.visual.setFlat(this.flat);                             // carro 3D: pneu furado baixa aquele canto
        if (this.visual.animate) this.visual.animate(dt, aF, aL, this.wrecked || this.engineDead && !this.controlled ? 0 : this.lastSteer, this.isBike || this.spec.boat ? null : yr);
        if (this.spec.boat || this.wrecked || this._asleep || typeof SkidMarks === 'undefined') return;
        this._rimFx(dt);                                                                      // pneu furado: faíscas do aro
        // ---- marcas de pneu
        const fwd = v.x * fx + v.z * fz, lat = v.x * fz - v.z * fx, sp = Math.abs(fwd);
        let k = 0;
        const slip = Math.abs(lat) - (this.isBike ? 2.2 : 2.6);                                  // de lado
        if (slip > 0 && sp > 3) k = Math.min(1, slip / 4);
        if (this.braking && sp > 7 && aF * Math.sign(fwd) < -7.5) k = Math.max(k, Math.min(1, (-aF * Math.sign(fwd) - 7.5) / 6 + 0.35));     // freada brusca
        if (this.controlled && this.accelerating && fwd > 0.5 && fwd < 11 && aF > 6.5 && !this.spec.bike) k = Math.max(k, Math.min(0.8, (aF - 6.5) / 5 + 0.3));   // arrancada
        const P = this.position, near = SkidMarks.focus && Math.abs(P.x - SkidMarks.focus.x) < 80 && Math.abs(P.z - SkidMarks.focus.z) < 80;
        if (k <= 0 || !near || !MapGeo.isLand(P.x, P.z)) { if (this._skidding) { SkidMarks.lift(this); this._skidding = false; } return; }
        this._skidding = true;
        const rx = fz, rz = -fx, y = (this.elev || 0) + 0.2;
        const m = this.visual.tire, tz = m ? m.z : this.halfLen * 0.6, tx = m ? m.x : this.halfW * 0.75;
        if (this.isBike) { SkidMarks.track(this, 0, P.x - fx * this.halfLen * 0.55, P.z - fz * this.halfLen * 0.55, y, k); return; }
        for (let w = 0; w < 2; w++) {                                                         // traseiras (e as dianteiras na freada)
            const s = w ? 1 : -1, x = P.x - fx * tz + rx * tx * s, z = P.z - fz * tz + rz * tx * s;
            SkidMarks.track(this, w, x, z, y, k);
            if (k > 0.45) SkidMarks.smoke(this.game || SkidMarks.game, x, z, v.x, v.z, k);
            if (this.braking && Math.abs(lat) < 2) SkidMarks.track(this, 2 + w, P.x + fx * tz + rx * tx * s, P.z + fz * tz + rz * tx * s, y, k * 0.8);
        }
    }

    // Camada de colisão: 0 = chão, 1 = tabuleiro do viaduto. Os dois grupos se ignoram; os sólidos fixos continuam valendo.
    _setLayer(L) {
        this.layer = L;
        const sh = this.aggregate && this.aggregate.shape;
        if (!sh) return;
        sh.filterMembershipMask = L ? 2 : 1;
        sh.filterCollideMask = L ? ~1 : ~2;
    }

    // Posição do corpo. Sem pai, a posição LOCAL já é a do mundo (o Havok escreve nela a cada passo): ler direto evita recalcular a
    // matriz do corpo na 1ª consulta depois de cada passo — ~3,6 µs por carro, ~0,5 ms por quadro com 140 carros. NÃO altere o vetor.
    get position() {
        const b = this.body;
        return b.parent ? b.getAbsolutePosition() : b.position;
    }

    // Frente do corpo (eixo +Z girado) direto do quaternião, sem montar a matriz de mundo. Devolve `out`.
    fwdToRef(out) {
        const b = this.body, q = b.rotationQuaternion;
        if (!q || b.parent) { b.getDirectionToRef(BABYLON.Axis.Z, out); return out; }
        out.set(2 * (q.x * q.z + q.w * q.y), 2 * (q.y * q.z - q.w * q.x), 1 - 2 * (q.x * q.x + q.y * q.y));
        return out;
    }

    get speed() {
        return this.velocity.length();
    }

    // Velocidade linear do corpo. Lida do Havok (WASM) uma vez por passo de física e guardada: trânsito, luzes, colisões, IA e
    // pássaros perguntam dezenas de vezes por carro por quadro, e cada leitura criava um Vector3 novo. NÃO altere o vetor devolvido
    // (para mudar a velocidade use phys.setLinearVelocity, que invalida a leitura).
    get velocity() {
        if (this._velF !== Vehicle.physFrame) { this._velF = Vehicle.physFrame; this.phys.getLinearVelocityToRef(this._vel); }
        return this._vel;
    }
}

// Contador de passos de física (Game._render incrementa depois de avançar o Havok): marca as velocidades guardadas como velhas.
Vehicle.physFrame = 0;
Vehicle._ZERO = new BABYLON.Vector3(0, 0, 0);          // (só leitura: velocidade zero sem alocar)

// NÍVEL de quem está no mundo, para separar quem passa POR CIMA de quem está EMBAIXO (m): tabuleiro do viaduto = a altura dele,
// chão (e ponte sobre a água, que é a pista) = 0, SOB a ponte (na água ou na margem) = UNDER. Carro em cima do viaduto não freia nem
// atropela quem anda lá embaixo; quem está sob a ponte não é "visto" pelos carros e pedestres que passam nela, não é atropelado por
// eles e não entra num deles (sameLevel: menos de 1,5 m de diferença — UNDER fica bem longe do 0 da pista).
Vehicle.UNDER = -3;
Vehicle.levelOf = (e) => {
    if (!e) return 0;
    if (e.isBoat) { const p = e.position; return RoadPlan.onBridge(p.x, p.z) ? Vehicle.UNDER : 0; }
    if (e.body && e.phys) return e._onDeck ? (e.elev || 0) : 0;                         // veículo terrestre
    return e.underBridge ? Vehicle.UNDER : (e.onDeck ? (e.deckH || 0) : 0);           // jogador / pedestre
};
Vehicle.sameLevel = (a, b) => Math.abs(Vehicle.levelOf(a) - Vehicle.levelOf(b)) < 1.5;
// Camada de obstáculo do trânsito (TrafficCar compara com a do carro: 0 chão, 1 viaduto, -1 água sob a ponte).
Vehicle.layerOfLevel = (lv) => (lv > 2.2 ? 1 : lv < -0.5 ? -1 : 0);

// Skill Direção (carreira Desmanche): multiplicadores de aderência lateral e de giro só para o veículo que o JOGADOR dirige.
Vehicle.playerGrip = 1;
Vehicle.playerTurn = 1;
// NITRO (as corridas de rua ligam car.nosOn enquanto o jogador segura o botão e ainda tem carga): força × NOS_ACC, máxima × NOS_TOP.
Vehicle.NOS_ACC = 1.75;
Vehicle.NOS_TOP = 1.16;
memoStatics(Vehicle, 'TANK');
