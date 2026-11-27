// ============================================================================
// Plane — AVIÕES pilotáveis (o pátio do Aeroporto das Fazendas: map/Airport.js). Três modelos:
//   teco     TECO-TECO   monomotor de asa alta (Paulistinha), lento e dócil: decola curto, gira fácil, estola cedo.
//   bimotor  BIMOTOR     executivo de asa baixa (Sêneca), dois motores: mais rápido, sobe mais.
//   jato     JATINHO     executivo a jato (Phenom), cauda em T: o mais rápido e o que sobe mais — precisa da pista quase toda.
// Para o resto do jogo um avião é uma aeronave como o helicóptero (isChopper: polícia, mísseis, minimapa, HUD, Game._boardChopper/
// _leaveChopper/_chopperDown); o que muda é o voo (isPlane):
//   W/S   acelerador (sobe/desce aos poucos; no chão, S com o motor em marcha lenta FREIA)
//   A/D   inclina para os lados (no chão: taxia virando a bequilha) — inclinado, o avião faz a curva
//   ESPAÇO puxa o nariz (sobe; na corrida de decolagem, passando da velocidade de rotação, decola) · SHIFT empurra (desce)
//   Q/E   leme · F no chão parado: desce · F no ar: SALTA (com paraquedas: player/Parachute.js; sem: queda)
//   • abaixo da velocidade de ESTOL a asa perde a sustentação: o nariz cai e ele afunda — ganhe velocidade mergulhando.
//   • POUSO: tocar o chão devagar (afundando pouco), nivelado e sem inclinar — na pista, na grama ou numa estrada; senão, queda.
//     Na água ele afunda (você sai nadando). Bater num prédio ou num morro: explosão.
//   • limite do espaço aéreo: perto da borda do mapa o avião faz a volta sozinho.
// Desenho: malhas 3D de cor sólida (MeshBatch em coordenadas locais) num nó que leva rumo, arfagem e inclinação; hélices giram com o
// motor; luzes de navegação (vermelha à esquerda, verde à direita) e a sombra no chão.
// ============================================================================

class Plane {
    static MODELS = {
        teco: { id: 'teco', name: 'Teco-teco', model: 'Paulistinha (monomotor de asa alta)', len: 7.2, span: 10.8, gear: 0, gPitch: 0.1,
            vRot: 22, vStall: 19, vMax: 44, accel: 5.2, pitchMax: 0.32, bank: 0.85, turnK: 2.4, ceil: 320, hp: 120, engine: 'prop', rent: 600 },
        bimotor: { id: 'bimotor', name: 'Bimotor', model: 'Sêneca (bimotor executivo)', len: 8.8, span: 11.8, gear: 0, gPitch: 0,
            vRot: 28, vStall: 24, vMax: 62, accel: 6.5, pitchMax: 0.32, bank: 0.8, turnK: 2.2, ceil: 420, hp: 190, engine: 'prop2', rent: 1500 },
        jato: { id: 'jato', name: 'Jatinho', model: 'Phenom (jato executivo)', len: 13, span: 12.3, gear: 0, gPitch: 0,
            vRot: 34, vStall: 29, vMax: 82, accel: 8.2, pitchMax: 0.3, bank: 0.75, turnK: 2.0, ceil: 600, hp: 240, engine: 'jet', rent: 4000 },
    };
    static BOUND = 140;                       // folga da borda do mundo onde o avião faz a volta

    constructor(game, spot) {
        const M = this.M = Plane.MODELS[spot.model] || Plane.MODELS.teco;
        this.game = game; this.scene = game.scene;
        this.isChopper = true; this.isPlane = true;
        this.spec = { id: 'plane_' + M.id, name: M.name, model: M.model };
        this.home = Object.assign({}, spot);
        this.position = new BABYLON.Vector3(spot.x, 0, spot.z);
        this.velocity = new BABYLON.Vector3(0, 0, 0);
        this.maxHp = M.hp;
        this.visual = new PlaneVisual(this.scene, M);
        this._reset();
    }
    _reset() {
        const s = this.home;
        this.position.set(s.x, 0, s.z);
        this.heading = s.heading || 0; this.pitch = 0; this.bank = 0; this.v = 0; this.vy = 0; this.throttle = 0; this.rpm = 0; this.yawRate = 0;
        this.vx = this.vz = 0;
        this.y = this._groundAt(s.x, s.z);
        this.onGround = true; this.stall = false;
        this.hp = this.maxHp; this.state = 'parked'; this.alive = true; this.pilot = false; this.lastHitBy = 'env';
        this.rented = false; this.stolenWarned = false; this.ghost = null;
        this.visual.setVisible(true);
        this._place(0);
    }
    revive() { this._reset(); }

    // ---------------------------------------------------------------- a mesma cara do helicóptero para o resto do jogo
    get alt() { return this.y - (typeof Relief !== 'undefined' ? Relief.at(this.position.x, this.position.z) : 0); }
    get floor() { return Chopper.floorAt(this.position.x, this.position.z); }
    get flying() { return !this.onGround && this.alt > 2; }
    get speed() { return this.v; }
    get hpFrac() { return Math.max(0, this.hp / this.maxHp); }
    get grounded() { return this.onGround; }
    get height() { return this.alt; }
    get slide() { return 0; }
    fwdToRef(out) { out.set(Math.sin(this.heading), 0, Math.cos(this.heading)); return out; }
    distanceTo(pos) { return hypot(this.position.x - pos.x, this.position.z - pos.z); }
    _groundAt(x, z) { return (typeof Relief !== 'undefined' ? Relief.at(x, z) : 0); }

    board() { this.pilot = true; if (this.state === 'parked') this.state = 'flying'; }
    release() { this.pilot = false; }

    takeDamage(amount, from, source) {
        if (!this.alive || this.state === 'failing' || this.state === 'dead') return;
        this.hp -= amount;
        if (source) this.lastHitBy = source;
        this.game.combat.spark(this.position.x, this.y + 1.2, this.position.z, [1, 0.8, 0.4]);
        if (this.hp <= 0) this.fail('Fogo no motor!');
    }
    // PANE: o motor morre e pega fogo — ainda dá para planar e pousar (ou saltar).
    fail(msg) {
        if (this.state === 'failing' || this.state === 'dead') return;
        this.state = 'failing'; this.hp = 0; this.throttle = 0;
        if (this.pilot) this.game._flash((msg || 'PANE!') + ' Motor parado: plane até o chão e pouse — ou salte (F)!');
    }
    explode(why) {
        if (this.state === 'dead') return;
        const g = this.game, p = this.position;
        const inside = this.pilot && g.mode === 'heli' && g.chopper === this;
        this.state = 'dead'; this.alive = false;
        g.carDamage.boomAt(p.x, p.z, inside || this.lastHitBy === 'player' ? 'player' : 'env', this.M.id === 'jato' ? 2.2 : 1.7);
        if (inside) { g._chopperDown(); if (why) g._flash(why); }
        else if (this.lastHitBy === 'player') g.heat.commit('explosion');
        this.visual.setVisible(false);
        this.deadAt = g.time || 0;
        this.pilot = false; this.v = 0; this.vy = 0;
    }
    // Caiu na água: afunda (sem explosão); quem estava dentro sai nadando.
    _ditch() {
        const g = this.game, p = this.position, inside = this.pilot && g.mode === 'heli' && g.chopper === this;
        for (let i = 0; i < 6; i++) g.waterFx && g.waterFx.ripple(p.x + (Math.random() - 0.5) * 6, p.z + (Math.random() - 0.5) * 6, 1.2, 8, 1.6, 0.9);
        AudioFX.splash && AudioFX.splash(p.x, p.z, true);
        this.state = 'dead'; this.alive = false; this.visual.setVisible(false); this.deadAt = g.time || 0;
        if (inside) {
            const pl = g.player;
            g._chopperRelease();
            pl.teleport(new BABYLON.Vector3(p.x, 0, p.z)); pl.setVisible(true);
            g._flash(`O ${this.M.name.toLowerCase()} afundou — você saiu nadando`);
        }
        this.pilot = false; this.v = 0;
    }

    // O AVIÃO DO AEROCLUBE (salto de paraquedas: Parachute.startClubJump): passa reto lá em cima por uns segundos e volta ao pátio.
    ghostFly(x, y, z, heading) {
        this.position.set(x, 0, z); this.y = y; this.heading = heading;
        this.onGround = false; this.v = 38; this.vy = 0; this.pitch = 0.03; this.bank = 0; this.throttle = 0.85; this.rpm = 1;
        this.state = 'flying'; this.pilot = false; this.ghost = { t: 26 };
    }
    _ghostTick(dt) {
        const G = this.ghost, p = this.position;
        G.t -= dt;
        p.x += Math.sin(this.heading) * this.v * dt; p.z += Math.cos(this.heading) * this.v * dt; this.y += 0.6 * dt;
        this.vx = Math.sin(this.heading) * this.v; this.vz = Math.cos(this.heading) * this.v; this.velocity.set(this.vx, 0.6, this.vz);
        if (G.t <= 0) { this.ghost = null; this._reset(); return; }
        this._place(dt);
    }

    // ctl: { thr, roll, pitch, yaw } (-1..1) do piloto; null = sem piloto.
    update(dt, ctl) {
        if (this.state === 'dead') return;
        if (this.ghost) { this._ghostTick(dt); return; }
        const M = this.M, g = this.game, G = 9.8, failing = this.state === 'failing';
        const c = ctl && this.pilot ? ctl : { thr: 0, roll: 0, pitch: 0, yaw: 0 };
        // ---- motor: o acelerador sobe e desce aos poucos; sem piloto, ele volta à marcha lenta e desliga
        if (this.pilot && !failing) this.throttle = Math.max(0, Math.min(1, this.throttle + c.thr * 0.6 * dt));
        else this.throttle = Math.max(0, this.throttle - 0.35 * dt);
        const wantRpm = failing ? 0 : this.pilot ? 0.3 + 0.7 * this.throttle : this.throttle > 0.02 ? 0.3 + 0.7 * this.throttle : 0;
        this.rpm += (wantRpm - this.rpm) * Math.min(1, dt * (wantRpm > this.rpm ? 0.9 : 0.5));
        const thrust = this.rpm > 0.2 && !failing ? this.throttle * M.accel : 0;
        const drag = M.accel * (this.v / M.vMax) * (this.v / M.vMax);
        const p = this.position;
        if (this.onGround) {
            // ---- no chão: rodar, taxiar, frear, decolar
            const paved = typeof Airport === 'undefined' || Airport.paved(p.x, p.z) || (typeof RoadPlan !== 'undefined' && RoadPlan.onAsphalt && RoadPlan.onAsphalt(p.x, p.z, 0));
            const brake = c.thr < -0.1 && this.throttle < 0.03 ? 6.5 : 0;
            const fric = (paved ? 0.35 : 1.4) + brake + (this.pilot ? 0 : 1.2);
            this.v = Math.max(0, this.v + (thrust - drag - fric) * dt);
            const steer = Math.abs(c.yaw) > 0.05 ? c.yaw : c.roll;
            this.yawRate = steer * 0.95 / (1 + this.v / 10);
            this.heading += this.yawRate * dt;
            const rot = c.pitch > 0.1 && this.v > M.vRot * 0.85 ? 0.17 : 0;
            this.pitch += Math.max(-0.6 * dt, Math.min(0.6 * dt, rot - this.pitch));
            this.bank += (0 - this.bank) * Math.min(1, dt * 6);
            this.vy = 0; this.stall = false;
            if (!paved && this.v > 8) { this._bump = (this._bump || 0) - dt; if (this._bump <= 0) { this._bump = 0.12; if (this.pilot) g.camera.shake(Math.min(0.25, this.v * 0.008)); } }
            if (this.v >= M.vRot && this.pitch > 0.08) { this.onGround = false; this.vy = 1.8; if (this.pilot) this._takeoff(); }
        } else {
            // ---- no ar: inclinar faz a curva; o nariz sobe e desce com o comando; sem velocidade, estola
            const tb = c.roll * M.bank;
            this.bank += Math.max(-1.6 * dt, Math.min(1.6 * dt, tb - this.bank));
            const L = Math.max(0, Math.min(1, (this.v - M.vStall) / (M.vRot * 1.15 - M.vStall)));
            this.stall = this.v < M.vStall;
            let tp = c.pitch * M.pitchMax;
            if (!this.pilot && !failing) tp = -0.05;                                          // (sem piloto: desce devagar, sem comando)
            if (this.stall) tp = Math.min(tp, -0.32);                                          // estol: o nariz cai
            const agl = this.y - this._groundAt(p.x, p.z), gEff = agl < 5 && this.v > M.vStall * 0.9;      // EFEITO SOLO: rente ao chão, com velocidade, o nariz nivela
            if (gEff) tp = Math.max(tp, -0.05);                                                //  e ele afunda devagar — o pouso fica na mão do jogador
            const rate = Math.abs(c.pitch) > 0.05 || this.stall ? 0.9 : 0.35;
            this.pitch += Math.max(-rate * dt, Math.min(rate * dt, tp - this.pitch));
            this.v = Math.max(0, this.v + (thrust - drag - G * Math.sin(this.pitch) * 0.85 - Math.abs(Math.sin(this.bank)) * 0.4) * dt);
            let tvy = this.v * Math.sin(this.pitch) * (0.35 + 0.65 * L) - (1 - L) * 12 - (1 - Math.cos(this.bank)) * 3;
            if (gEff) tvy = Math.max(tvy, -2.6);
            this.vy += Math.max(-9 * dt, Math.min(9 * dt, tvy - this.vy));
            this.yawRate = G * Math.tan(this.bank) / Math.max(14, this.v) * M.turnK + c.yaw * 0.18;
            this.heading += this.yawRate * dt;
            this._bounds(dt);
        }
        if (failing) this._failFx(dt);
        // ---- move no plano; prédio/morro mais alto no caminho = batida
        const vh = this.onGround ? this.v : this.v * Math.cos(this.pitch);
        this.vx = Math.sin(this.heading) * vh; this.vz = Math.cos(this.heading) * vh;
        this.velocity.set(this.vx, this.vy, this.vz);
        const nx = p.x + this.vx * dt, nz = p.z + this.vz * dt;
        const gN = this._groundAt(nx, nz), roofN = Chopper.floorAt(nx, nz);
        if (gN + roofN > this.y + (this.onGround ? 1.2 : 0.4)) {
            if (this.onGround && this.v < 6) { this.v = 0; this.takeDamage(this.v * 2 + 2, null, 'env'); AudioFX.thud(p.x, p.z); }
            else { this.explode(roofN > 1 ? 'O avião bateu num prédio!' : 'O avião bateu no morro!'); return; }
        } else { p.x = nx; p.z = nz; }
        const gH = this._groundAt(p.x, p.z), roof = Chopper.floorAt(p.x, p.z);
        if (this.onGround) {
            this.y = gH + roof;
            if (roof === 0 && typeof MapGeo !== 'undefined' && MapGeo.waterDepth(p.x, p.z) > 0.6) { this._ditch(); return; }
        } else {
            this.y += this.vy * dt;
            if (this.y - gH > M.ceil) { this.y = gH + M.ceil; if (this.vy > 0) this.vy = 0; }
            if (this.y <= gH + roof) this._touch(gH + roof, roof);
            if (this.state === 'dead') return;
        }
        if (this.onGround && this.state === 'flying' && !this.pilot && this.v < 0.3) this.state = 'parked';
        this._place(dt);
    }

    // Tocou o chão no ar: pouso (devagar, nivelado) ou queda.
    _touch(floorY, roof) {
        const M = this.M, p = this.position, sink = -this.vy, g = this.game;
        if (roof === 0 && typeof MapGeo !== 'undefined' && MapGeo.waterDepth(p.x, p.z) > 0.6) { this._ditch(); return; }
        const ok = sink < 5.5 && Math.abs(this.bank) < 0.3 && this.pitch > -0.14 && this.pitch < 0.32 && this.v < M.vMax * 0.9 && roof < 1 && this.state !== 'dead';
        if (!ok) { this.explode('Queda! O avião se espatifou'); return; }
        this.y = floorY; this.onGround = true; this.vy = 0; this.bank = 0;
        if (sink > 3.2) { this.takeDamage((sink - 3.2) * 12, null, 'env'); g.camera.shake(0.4); AudioFX.thud(p.x, p.z); if (this.pilot) g._flash('Pouso duro! O trem de pouso reclamou'); }
        else if (this.pilot) { AudioFX.thud(p.x, p.z); g._flash(typeof Airport !== 'undefined' && Airport.onRunway(p.x, p.z, 4) ? '🛬 Pouso na pista!' : '🛬 Pousou — fora da pista'); this.landings = (this.landings || 0) + 1; }
    }
    _takeoff() {
        const g = this.game;
        g._flash(`🛫 Decolou! ESPAÇO sobe · A/D curva · W/S acelerador · F salta${typeof Parachute !== 'undefined' && Parachute.has(g) ? ' (com paraquedas)' : ''}`);
        if (!this.rented && !this.stolenWarned && typeof Airport !== 'undefined' && Airport.covers(this.position.x, this.position.z, 30)) {     // decolagem sem autorização: a torre chama a polícia
            this.stolenWarned = true;
            g.heat.commit('car_theft', CrimeExposure.POLICE);
            g.wanted.ensureLevel(2);
            if (g.policeManager) g.policeManager.alertNear({ x: this.position.x, z: this.position.z }, 400);
            g._delayed.push({ t: 1.6, fn: () => g._flash('📻 A torre: decolagem não autorizada — a polícia foi avisada (avião roubado)') });
        }
    }
    // Perto da borda do mundo: faz a volta (para o centro do mapa).
    _bounds(dt) {
        const W = Config.world, B = Plane.BOUND, p = this.position;
        const out = p.x < W.minX + B || p.x > W.maxX - B || p.z < W.minZ + B || p.z > W.maxZ - B;
        if (!out) { this._warned = false; return; }
        const cx = (W.minX + W.maxX) / 2 - 200, cz = (W.minZ + W.maxZ) / 2, want = Math.atan2(cx - p.x, cz - p.z);
        let d = want - this.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
        this.heading += Math.max(-0.7 * dt, Math.min(0.7 * dt, d));
        this.bank += (Math.sign(d) * this.M.bank * 0.8 - this.bank) * Math.min(1, dt * 2);
        if (!this._warned && this.pilot) { this._warned = true; this.game._flash('✈ Limite do espaço aéreo — o avião faz a volta'); }
    }
    _failFx(dt) {
        this._smokeT = (this._smokeT || 0) - dt;
        if (this._smokeT > 0) return;
        this._smokeT = 0.07;
        const g = this.game, p = this.position, h = this.heading;
        g.carLights.puffs.emit(p.x + Math.sin(h) * this.M.len * 0.35, this.y + 1.4, p.z + Math.cos(h) * this.M.len * 0.35, -this.vx * 0.3 + (Math.random() - 0.5), 0.8, -this.vz * 0.3 + (Math.random() - 0.5), 0.9, 2.6, 1.1, 0.6, [0.12, 0.12, 0.13]);
        if (Math.random() < 0.4) g.combat.spark(p.x + Math.sin(h) * this.M.len * 0.35, this.y + 1.3, p.z + Math.cos(h) * this.M.len * 0.35, [1, 0.5, 0.12]);
    }

    _place(dt) {
        const p = this.position, g = this.game;
        const pitch = this.onGround ? Math.max(this.pitch, this.M.gPitch) : this.pitch;
        this.visual.place(p.x, this.y, p.z, this.heading, pitch, this.bank, this.rpm, dt);
        const s = g.gameEngine.sunDir, gh = this._groundAt(p.x, p.z), h = Math.max(0, this.y - gh), k = h / Math.max(0.3, -s.y);
        const day = Math.max(0.25, Math.min(1, (g.dayNight.sunI - 0.1) / 0.4));
        this.visual.placeShadow(p.x + s.x * k, gh + 0.08, p.z + s.z * k, this.heading, (0.42 - Math.min(0.3, h * 0.002)) * day);
    }
    dispose() { this.visual.dispose(); }
}

// ============================================================================
// PlaneVisual — o avião em 3D: um nó com rumo/arfagem/inclinação, o corpo (cor sólida por vértice), as hélices (giram), as luzes de
// navegação (sem iluminação: acesas) e a sombra (um disco escuro no chão).
// ============================================================================
class PlaneVisual {
    static mats(scene) {
        if (scene._planeMats) return scene._planeMats;
        const body = new BABYLON.StandardMaterial('planeBody', scene);
        body.diffuseColor = BABYLON.Color3.White(); body.specularColor = new BABYLON.Color3(0.35, 0.35, 0.35); body.specularPower = 48;
        body.emissiveColor = new BABYLON.Color3(0.08, 0.08, 0.09); body.backFaceCulling = false;
        const lit = new BABYLON.StandardMaterial('planeLights', scene);
        lit.disableLighting = true; lit.emissiveColor = BABYLON.Color3.White(); lit.diffuseColor = BABYLON.Color3.Black();
        let sh = null;
        if (!(typeof ProcSurf !== 'undefined' && ProcSurf.on)) {                     // (em polígonos a sombra é a silhueta: _shadowMesh)
            sh = new BABYLON.StandardMaterial('planeShadow', scene);
            const tex = new BABYLON.DynamicTexture('planeShadowTex', { width: 64, height: 64 }, scene, false), c = tex.getContext(), gr = c.createRadialGradient(32, 32, 4, 32, 32, 31);
            gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); tex.hasAlpha = true; tex.update();
            sh.diffuseTexture = tex; sh.useAlphaFromDiffuseTexture = true; sh.disableLighting = true; sh.emissiveColor = BABYLON.Color3.Black(); sh.diffuseColor = BABYLON.Color3.Black(); sh.backFaceCulling = false;
        }
        return (scene._planeMats = { body, lit, sh });
    }

    // A SOMBRA EM POLÍGONOS: a silhueta do avião no chão (fuselagem, asas, empenagem), cada parte com a borda macia (um anel com o alfa
    // indo a zero), no lugar da mancha redonda de textura. z = frente (len), x = envergadura (span), como o modelo.
    static _shadowMesh(scene, M) {
        const P = [], C = [], I = [], N = [], f = Math.max(0.25, M.len * 0.05);
        const rect = (x0, z0, x1, z1) => {
            const b = P.length / 3, inner = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], outer = [[x0 - f, z0 - f], [x1 + f, z0 - f], [x1 + f, z1 + f], [x0 - f, z1 + f]];
            for (const [x, z] of inner) { P.push(x, 0, z); C.push(0, 0, 0, 1); N.push(0, 1, 0); }
            for (const [x, z] of outer) { P.push(x, 0, z); C.push(0, 0, 0, 0); N.push(0, 1, 0); }
            I.push(b, b + 2, b + 1, b, b + 3, b + 2);
            for (let k = 0; k < 4; k++) { const a = b + k, c = b + (k + 1) % 4, A = a + 4, Cc = c + 4; I.push(a, Cc, A, a, c, Cc); }
        };
        const L = M.len, S = M.span, fw = Math.max(0.6, L * 0.055);
        rect(-fw, -L * 0.46, fw, L * 0.46);                                         // a fuselagem
        rect(-S * 0.48, L * 0.02, S * 0.48, L * 0.02 + Math.max(1.2, L * 0.14));    // as asas
        rect(-S * 0.17, -L * 0.45, S * 0.17, -L * 0.45 + Math.max(0.7, L * 0.08));  // a empenagem
        const m = new BABYLON.Mesh('planeShadow_' + M.id, scene), vd = new BABYLON.VertexData();
        vd.positions = P; vd.colors = C; vd.indices = I; vd.normals = N;
        vd.applyToMesh(m);
        m.hasVertexAlpha = true; m.useVertexColors = true; m._poly = true;
        return m;
    }
    static shadowMat(scene) {
        if (scene._planeShadowPoly) return scene._planeShadowPoly;
        const m = new BABYLON.StandardMaterial('planeShadowPoly', scene);
        m.disableLighting = true; m.emissiveColor = BABYLON.Color3.Black(); m.diffuseColor = BABYLON.Color3.Black(); m.specularColor = BABYLON.Color3.Black();
        m.backFaceCulling = false; m.disableDepthWrite = true; m.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
        return (scene._planeShadowPoly = m);
    }

    constructor(scene, M) {
        this.scene = scene; this.M = M;
        const mats = PlaneVisual.mats(scene);
        this.root = new BABYLON.TransformNode('plane_' + M.id, scene);
        this.root.rotationQuaternion = new BABYLON.Quaternion();
        const b = new MeshBatch(), L = new MeshBatch(), props = [];
        PlaneVisual['_' + M.id](b, L, props, this);
        this.body = b.build('planeBody_' + M.id, scene, mats.body, { vertexColors: true, receiveShadows: true, alwaysActive: false });
        this.body.unfreezeWorldMatrix(); this.body.parent = this.root;
        this.lights = L.build('planeLights_' + M.id, scene, mats.lit, { vertexColors: true, receiveShadows: false, alwaysActive: false });
        if (this.lights) { this.lights.unfreezeWorldMatrix(); this.lights.parent = this.root; }
        this.props = props.map((q, i) => {
            const pb = new MeshBatch();
            PlaneVisual._prop(pb, q.r, q.blades, q.col);
            const m = pb.build(`planeProp_${M.id}_${i}`, scene, mats.body, { vertexColors: true, receiveShadows: false, alwaysActive: false });
            m.unfreezeWorldMatrix(); m.parent = this.root; m.position.set(q.x, q.y, q.z);
            m.rotationQuaternion = null;
            return m;
        });
        this.shadow = typeof ProcSurf !== 'undefined' && ProcSurf.on ? PlaneVisual._shadowMesh(scene, M) : BABYLON.MeshBuilder.CreateGround('planeShadow_' + M.id, { width: M.span * 0.85, height: M.len * 0.9 }, scene);
        this.shadow.material = this.shadow._poly ? PlaneVisual.shadowMat(scene) : mats.sh; this.shadow.isPickable = false; this.shadow.visibility = 0.4;
        this.hl = M.len * 0.85;                                        // (câmera de perseguição: CompassCamera.follow lê hl e lampGeom.roof)
        this.lampGeom = { roof: M.id === 'jato' ? 3.4 : 2.6 };
        this._spin = 0;
        const sg = typeof game !== 'undefined' && game && game.gameEngine && game.gameEngine.world && game.gameEngine.world.shadow;
        if (sg && sg.addShadowCaster) sg.addShadowCaster(this.body);
    }
    setVisible(on) {
        this.root.setEnabled(on); this.shadow.setEnabled(on);
    }
    place(x, y, z, heading, pitch, bank, rpm, dt) {
        this.root.position.set(x, y, z);
        BABYLON.Quaternion.RotationYawPitchRollToRef(heading, -pitch, -bank, this.root.rotationQuaternion);
        this._spin += dt * rpm * 55;
        for (const m of this.props) m.rotation.z = this._spin;
    }
    placeShadow(x, y, z, heading, alpha) {
        this.shadow.position.set(x, y, z); this.shadow.rotation.y = heading; this.shadow.visibility = Math.max(0, alpha);
    }
    dispose() { this.body.dispose(); if (this.lights) this.lights.dispose(); for (const m of this.props) m.dispose(); this.shadow.dispose(); this.root.dispose(); }

    // ---------------------------------------------------------------- peças (coordenadas locais: nariz para +z, y para cima)
    static C(hex) { const p = Pixel.hex(hex); return [p[0] / 255, p[1] / 255, p[2] / 255]; }
    // Caixa 3D com as 6 faces.
    static box(b, x0, y0, z0, x1, y1, z1, col) {
        const uv = [[0, 0], [0, 0], [0, 0]], q = (a, bb, c, d, n) => { b.tri(a, bb, c, n, uv, col); b.tri(a, c, d, n, uv, col); };
        q([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]); q([x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [0, -1, 0]);
        q([x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [0, 0, 1]); q([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]);
        q([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0]); q([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [-1, 0, 0]);
    }
    // Asa (ou empenagem) afilada, dos dois lados: raiz em x = ±x0 (corda z0..z1), ponta em x = ±x1 (corda t0..t1), altura y, diedro dy na
    // ponta, espessura th. vert = true: deriva vertical (no plano yz: "x" vira altura).
    static wing(b, x0, x1, z0, z1, t0, t1, y, dy, th, col, both = true) {
        const uv = [[0, 0], [0, 0], [0, 0]];
        for (const s of both ? [-1, 1] : [1]) {
            const A = [s * x0, y, z1], B = [s * x0, y, z0], C = [s * x1, y + dy, t0], D = [s * x1, y + dy, t1];
            const up = (P) => [P[0], P[1] + th / 2, P[2]], dn = (P) => [P[0], P[1] - th / 2, P[2]];
            const q = (a, bb, c, d, n) => { b.tri(a, bb, c, n, uv, col); b.tri(a, c, d, n, uv, col); };
            q(up(A), up(B), up(C), up(D), [0, 1, 0]); q(dn(A), dn(D), dn(C), dn(B), [0, -1, 0]);
            q(up(D), up(A), dn(A), dn(D), [0, 0, 1]); q(up(B), up(C), dn(C), dn(B), [0, 0, -1]);
            q(up(C), up(D), dn(D), dn(C), [s, 0, 0]);
        }
    }
    static fin(b, z0, z1, t0, t1, y0, y1, th, col) {                 // deriva: base (z0..z1) em y0, topo (t0..t1) em y1
        const uv = [[0, 0], [0, 0], [0, 0]], q = (a, bb, c, d, n) => { b.tri(a, bb, c, n, uv, col); b.tri(a, c, d, n, uv, col); };
        for (const s of [-1, 1]) q([s * th / 2, y0, z0], [s * th / 2, y0, z1], [s * th / 2, y1, t1], [s * th / 2, y1, t0], [s, 0, 0]);
        q([-th / 2, y1, t0], [th / 2, y1, t0], [th / 2, y1, t1], [-th / 2, y1, t1], [0, 1, 0]);
        q([-th / 2, y0, z1], [th / 2, y0, z1], [th / 2, y1, t1], [-th / 2, y1, t1], [0, 0, 1]);
    }
    // Fuselagem: seções [z, raio, y] de trás para a frente; cada trecho é um tronco de cone (com as pontas fechadas).
    static fuse(b, S, col, seg = 10) {
        for (let i = 0; i + 1 < S.length; i++) b.tube([0, S[i][2], S[i][0]], [0, S[i + 1][2], S[i + 1][0]], S[i][1], S[i + 1][1], typeof col === 'function' ? col(i) : col, seg);
        const end = (s, dir) => b.tube([0, s[2], s[0]], [0, s[2], s[0] + dir * 0.02], s[1], 0.01, typeof col === 'function' ? col(0) : col, seg);
        end(S[0], -1); end(S[S.length - 1], 1);
    }
    static wheel(b, x, y, z, r, w) { b.tube([x - w / 2, y, z], [x + w / 2, y, z], r, r, PlaneVisual.C('#1b1d20'), 8); b.tube([x - w / 2 - 0.01, y, z], [x - w / 2, y, z], r, 0.01, PlaneVisual.C('#2a2c30'), 8); b.tube([x + w / 2, y, z], [x + w / 2 + 0.01, y, z], r, 0.01, PlaneVisual.C('#2a2c30'), 8); }
    static strut(b, a, c, r = 0.05) { b.tube(a, c, r, r, PlaneVisual.C('#9aa0a8'), 6); }
    static navLights(L, x, y, z) {
        PlaneVisual.box(L, -x - 0.12, y - 0.08, z - 0.12, -x + 0.04, y + 0.08, z + 0.12, [1, 0.1, 0.08]);      // vermelha: esquerda
        PlaneVisual.box(L, x - 0.04, y - 0.08, z - 0.12, x + 0.12, y + 0.08, z + 0.12, [0.15, 1, 0.3]);         // verde: direita
    }
    // A hélice (na origem, girando no eixo z): pás e o cone do cubo.
    static _prop(b, r, blades, col) {
        const dark = PlaneVisual.C('#24262a');
        for (let k = 0; k < blades; k++) {
            const a = k / blades * Math.PI * 2, ux = Math.cos(a), uy = Math.sin(a), px = -uy * 0.09, py = ux * 0.09, uv = [[0, 0], [0, 0], [0, 0]];
            const A = [px, py, 0.02], B = [-px, -py, 0.02], C = [ux * r - px * 0.6, uy * r - py * 0.6, 0.02], D = [ux * r + px * 0.6, uy * r + py * 0.6, 0.02];
            b.tri(A, B, C, [0, 0, 1], uv, dark); b.tri(A, C, D, [0, 0, 1], uv, dark);
            b.tri(A, C, B, [0, 0, -1], uv, dark); b.tri(A, D, C, [0, 0, -1], uv, dark);
            const tip = [ux * r, uy * r, 0.02]; b.tri([ux * (r - 0.18) - px * 0.6, uy * (r - 0.18) - py * 0.6, 0.025], [ux * (r - 0.18) + px * 0.6, uy * (r - 0.18) + py * 0.6, 0.025], tip, [0, 0, 1], uv, PlaneVisual.C('#f0c419'));
        }
        b.tube([0, 0, -0.05], [0, 0, 0.32], 0.17, 0.02, col, 8);
    }

    // ---- TECO-TECO: asa alta com montantes, trem convencional (bequilha na cauda), amarelo com faixa azul
    static _teco(b, L, props) {
        const C = PlaneVisual.C, Y = C('#f2c230'), Bl = C('#1f4f9a'), Gl = C('#203040'), Gr = C('#8e949c'), cy = 1.25;
        PlaneVisual.fuse(b, [[-3.5, 0.16, cy + 0.15], [-1.6, 0.42, cy + 0.05], [0.4, 0.62, cy], [2.5, 0.62, cy], [3.0, 0.52, cy - 0.02], [3.3, 0.42, cy - 0.04]], (i) => (i >= 3 ? Gr : Y), 10);
        PlaneVisual.box(b, -0.62, cy + 0.12, 0.7, 0.62, cy + 0.5, 2.3, Gl);                                     // janelas
        PlaneVisual.box(b, -0.64, cy - 0.32, -2.2, 0.64, cy - 0.22, 2.6, Bl);                                   // faixa azul
        PlaneVisual.wing(b, 0.45, 5.4, 0.6, 2.2, 0.75, 2.05, cy + 0.72, 0.1, 0.14, Y);
        PlaneVisual.box(b, -0.5, cy + 0.6, 0.6, 0.5, cy + 0.8, 2.2, Y);                                        // o berço da asa
        for (const s of [-1, 1]) { PlaneVisual.strut(b, [s * 0.55, cy - 0.35, 1.6], [s * 2.6, cy + 0.66, 1.3]); PlaneVisual.strut(b, [s * 0.55, cy - 0.35, 1.0], [s * 2.6, cy + 0.66, 0.9]); }
        PlaneVisual.wing(b, 0.1, 1.7, -3.45, -2.6, -3.3, -2.85, cy + 0.2, 0, 0.07, Y);                       // profundor
        PlaneVisual.fin(b, -3.55, -2.4, -3.7, -3.15, cy + 0.2, cy + 1.35, 0.08, Y);                         // deriva
        PlaneVisual.box(b, -0.05, cy + 0.85, -3.62, 0.05, cy + 1.3, -3.2, Bl);
        for (const s of [-1, 1]) { PlaneVisual.wheel(b, s * 0.95, 0.32, 2.05, 0.32, 0.18); PlaneVisual.strut(b, [s * 0.4, cy - 0.45, 1.9], [s * 0.92, 0.35, 2.05], 0.06); }
        PlaneVisual.wheel(b, 0, 0.13, -3.25, 0.13, 0.08); PlaneVisual.strut(b, [0, cy - 0.05, -3.2], [0, 0.15, -3.25], 0.04);
        PlaneVisual.navLights(L, 5.42, cy + 0.82, 1.4);
        PlaneVisual.box(L, -0.06, cy + 1.32, -3.7, 0.06, cy + 1.42, -3.6, [1, 1, 1]);
        props.push({ x: 0, y: cy - 0.04, z: 3.32, r: 0.95, blades: 2, col: C('#c8ccd1') });
    }
    // ---- BIMOTOR: asa baixa com diedro, dois motores na asa, trem triciclo, branco com faixas vermelha e azul
    static _bimotor(b, L, props) {
        const C = PlaneVisual.C, W = C('#f4f5f7'), R = C('#c8302a'), Bl = C('#203a6b'), Gl = C('#1d2a38'), cy = 1.35;
        PlaneVisual.fuse(b, [[-4.4, 0.2, cy + 0.32], [-2.4, 0.58, cy + 0.12], [0, 0.82, cy], [3.2, 0.8, cy], [3.9, 0.55, cy - 0.08], [4.4, 0.18, cy - 0.12]], W, 12);
        PlaneVisual.box(b, -0.79, cy + 0.12, 0.2, 0.79, cy + 0.46, 3.0, Gl);
        PlaneVisual.box(b, -0.55, cy + 0.42, 3.0, 0.55, cy + 0.72, 3.55, Gl);                                   // para-brisa
        PlaneVisual.box(b, -0.83, cy - 0.18, -3.2, 0.83, cy - 0.06, 3.9, R); PlaneVisual.box(b, -0.83, cy - 0.3, -3.0, 0.83, cy - 0.22, 3.6, Bl);
        PlaneVisual.wing(b, 0.6, 5.9, -0.1, 1.9, 0.3, 1.45, cy - 0.5, 0.45, 0.18, W);
        for (const s of [-1, 1]) {
            const x = s * 2.35;
            b.tube([x, cy - 0.38, -0.6], [x, cy - 0.38, 2.6], 0.42, 0.44, W, 10); b.tube([x, cy - 0.38, 2.6], [x, cy - 0.38, 3.15], 0.44, 0.3, C('#c9ccd1'), 10);
            b.tube([x, cy - 0.38, -0.6], [x, cy - 0.38, -1.4], 0.42, 0.12, W, 10);
            PlaneVisual.wheel(b, x, 0.32, 1.0, 0.32, 0.2); PlaneVisual.strut(b, [x, cy - 0.7, 1.0], [x, 0.36, 1.0], 0.07);
            props.push({ x, y: cy - 0.38, z: 3.17, r: 0.95, blades: 3, col: C('#c8ccd1') });
        }
        PlaneVisual.wing(b, 0.15, 2.2, -4.3, -3.4, -4.1, -3.65, cy + 0.25, 0.05, 0.08, W);
        PlaneVisual.fin(b, -4.5, -2.8, -4.9, -4.1, cy + 0.3, cy + 1.95, 0.1, W);
        PlaneVisual.box(b, -0.06, cy + 1.0, -4.75, 0.06, cy + 1.6, -3.9, R);
        PlaneVisual.wheel(b, 0, 0.26, 3.35, 0.26, 0.16); PlaneVisual.strut(b, [0, cy - 0.6, 3.35], [0, 0.3, 3.35], 0.06);
        PlaneVisual.navLights(L, 5.92, cy - 0.05, 0.9);
        PlaneVisual.box(L, -0.07, cy + 1.95, -4.95, 0.07, cy + 2.05, -4.85, [1, 1, 1]);
    }
    // ---- JATINHO: asa baixa enflechada com winglets, motores na traseira, cauda em T, branco com a faixa azul-escura e janelas redondas
    static _jato(b, L, props) {
        const C = PlaneVisual.C, W = C('#f6f7f9'), D = C('#1c2f52'), Gl = C('#141c26'), Gr = C('#b9bec6'), cy = 1.55;
        PlaneVisual.fuse(b, [[-6.4, 0.28, cy + 0.55], [-4.6, 0.72, cy + 0.25], [-2.4, 0.98, cy], [3.8, 0.98, cy], [5.2, 0.78, cy - 0.12], [6.1, 0.42, cy - 0.25], [6.6, 0.08, cy - 0.3]], W, 14);
        PlaneVisual.box(b, -0.7, cy + 0.36, 4.5, 0.7, cy + 0.78, 5.35, Gl);                                     // para-brisa
        for (let z = -1.8; z <= 3.4; z += 0.9) for (const s of [-1, 1]) PlaneVisual.box(b, s * 0.97 - 0.03, cy + 0.2, z - 0.22, s * 0.97 + 0.03, cy + 0.52, z + 0.22, Gl);      // janelas
        PlaneVisual.box(b, -1.0, cy - 0.12, -5.0, 1.0, cy + 0.02, 5.6, D);                                      // faixa
        PlaneVisual.wing(b, 0.8, 6.1, -0.9, 1.6, -2.4, -1.2, cy - 0.65, 0.32, 0.22, W);
        for (const s of [-1, 1]) PlaneVisual.box(b, s * 6.1 - 0.04, cy - 0.35, -2.45, s * 6.1 + 0.04, cy + 0.5, -1.5, D);      // winglets
        for (const s of [-1, 1]) {
            const x = s * 1.5, y = cy + 0.48;
            b.tube([x, y, -4.9], [x, y, -2.5], 0.5, 0.56, W, 12); b.tube([x, y, -2.5], [x, y, -2.32], 0.56, 0.4, Gr, 12);
            b.tube([x, y, -2.32], [x, y, -2.3], 0.4, 0.02, Gl, 12);                                             // a entrada de ar
            b.tube([x, y, -4.9], [x, y, -5.1], 0.5, 0.32, Gr, 12);
            PlaneVisual.box(b, Math.min(x * 0.55, x * 0.9), y - 0.12, -4.2, Math.max(x * 0.55, x * 0.9), y + 0.12, -3.2, W);      // pilone
        }
        PlaneVisual.fin(b, -6.3, -4.3, -7.2, -5.9, cy + 0.6, cy + 3.0, 0.14, W);
        PlaneVisual.box(b, -0.08, cy + 1.6, -6.9, 0.08, cy + 2.6, -5.6, D);
        PlaneVisual.wing(b, 0.1, 2.5, -7.25, -5.95, -7.3, -6.6, cy + 3.0, 0.05, 0.1, W);                    // profundor no alto da deriva (T)
        for (const s of [-1, 1]) { PlaneVisual.wheel(b, s * 1.8, 0.36, 0.3, 0.36, 0.22); PlaneVisual.strut(b, [s * 1.8, cy - 0.7, 0.3], [s * 1.8, 0.4, 0.3], 0.08); }
        PlaneVisual.wheel(b, 0, 0.3, 4.9, 0.3, 0.18); PlaneVisual.strut(b, [0, cy - 0.85, 4.9], [0, 0.34, 4.9], 0.07);
        PlaneVisual.navLights(L, 6.12, cy + 0.0, -1.8);
        PlaneVisual.box(L, -0.08, cy + 3.05, -7.35, 0.08, cy + 3.15, -7.2, [1, 1, 1]);
        void props;
    }
}
