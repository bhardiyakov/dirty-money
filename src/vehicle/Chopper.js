// ============================================================================
// Chopper — helicóptero civil PILOTÁVEL pelo jogador (F perto de um heliponto).
//
// Voo (vista de cima, câmera presa no helicóptero):
//   W/S frente e ré · A/D deslizar para os lados · Q/E girar a proa · ESPAÇO sobe · SHIFT desce · F desce (no solo) ou SE JOGA (no ar).
//   • Inércia de verdade: aceleração limitada, deriva ao soltar, subida/descida com rampa; só decola com o rotor em rotação plena.
//   • Altura: o sprite sobe (perspectiva aumenta o desenho) e a SOMBRA se afasta no chão conforme a altura e o sol.
//   • Pousa em telhados (o "chão" sob ele é o do prédio); bater de lado num prédio mais alto machuca e ricocheteia.
//   • Pouso brusco machuca; muito brusco, quebra tudo.
//   • PANE (vida zerada ou piloto pulou no ar): perde o controle, GIRA cada vez mais rápido, cai em espiral soltando fumaça e fogo
//     e EXPLODE ao tocar o chão (dano em área).
// O jogador, enquanto pilota, fica invisível e invulnerável com a posição presa à do helicóptero (a polícia, os pedestres, o minimapa e a
// câmera continuam enxergando "o jogador" no lugar certo). Ver Game._boardChopper/_leaveChopper.
// Desenho: o mesmo helicóptero ilustrado da polícia (HeliArt / HeliVisual) em outra pintura — corpo, rotor (pás nítidas parado,
// disco borrado girando) e a sombra com a silhueta dele —, no grupo de render 2 (acima de tudo).
// ============================================================================

class Chopper {
    // O grupo 2 (o que voa) ignora a profundidade do mundo: limpa o depth antes dele.
    static _fx(scene) {
        if (!scene._chopperFx) { scene._chopperFx = true; scene.setRenderingAutoClearDepthStencil(2, true, true, true); }
        return scene._chopperFx;
    }

    constructor(game, x, z, heading = 0, variant = 4) {
        this.game = game;
        this.scene = game.scene;
        this.isChopper = true;
        this.spec = { id: 'chopper', name: 'Helicóptero', model: 'Bell 206' };
        this.position = new BABYLON.Vector3(x, 0, z);
        this.home = { x, z, heading, variant };
        this.heading = heading;
        this.vx = 0; this.vz = 0; this.vy = 0; this.yawRate = 0;
        this.alt = 0;                         // altura do sprite acima do chão em que ele está (0 = no solo)
        this.floor = 0;                       // altura do "chão" debaixo dele (telhado de prédio)
        this.rpm = 0;                         // 0..1 (rotor)
        this.maxHp = 160; this.hp = 160;
        this.state = 'parked';                // parked | flying | failing | dead
        this.pilot = false;
        this.failT = 0; this.spin = 0; this.spinDir = 1;
        this.alive = true;
        this.lastHitBy = 'env';
        this._rot = 0; this._smokeT = 0; this._dustT = 0;
        this.input = { fwd: 0, strafe: 0, yaw: 0, climb: 0 };

        this.visual = new HeliVisual(this.scene, variant, 'chopper', 1.7);      // (y = alt + 1,7)
        Chopper._fx(this.scene);
        this.alt = this.floor = this.floorAt(x, z);                         // (no heliponto do telhado)
        this._place(0);
    }

    // Em voo de verdade (alto o bastante para ser alvo "aéreo" e não ser tapado por prédio)?
    get flying() { return this.alt - this.floor > 2; }
    get speed() { return hypot(this.vx, this.vz); }
    get hpFrac() { return Math.max(0, this.hp / this.maxHp); }
    get grounded() { return this.alt <= this.floor + 0.08; }
    // Altura acima do solo (m) para o painel.
    get height() { return this.alt; }

    // Chão sob (x, z): a altura do telhado de prédio, se houver (0 = rua/terra/mar).
    floorAt(x, z) { return Chopper.floorAt(x, z); }
    static floorAt(x, z) {
        let f = 0;
        for (const o of CityGrid.obstaclesNear(x, z)) {
            if (o.h < 2.2 || (o.x1 - o.x0 < 0.8 && o.z1 - o.z0 < 0.8)) continue;
            if (x > o.x0 - 0.2 && x < o.x1 + 0.2 && z > o.z0 - 0.2 && z < o.z1 + 0.2 && o.h > f) f = o.h;
        }
        return f;
    }

    // Um novo helicóptero no heliponto (o anterior explodiu).
    revive() {
        const h = this.home;
        this.position.set(h.x, 0, h.z);
        this.heading = h.heading;
        this.vx = this.vz = this.vy = this.yawRate = 0;
        this.alt = this.floor = this.floorAt(h.x, h.z);
        this.rpm = 0; this.hp = this.maxHp;
        this.state = 'parked'; this.alive = true; this.pilot = false; this.lastHitBy = 'env';
        this.visual.setVisible(true);
        this._place(0);
    }

    board() { this.pilot = true; this.state = this.state === 'parked' ? 'flying' : this.state; }
    release() { this.pilot = false; }

    takeDamage(amount, from, source) {
        if (!this.alive || this.state === 'failing' || this.state === 'dead') return;
        this.hp -= amount;
        if (source) this.lastHitBy = source;
        this.game.combat.spark(this.position.x, this.alt + 1, this.position.z, [1, 0.8, 0.4]);
        if (this.hp <= 0) this.fail('Fogo no motor!');
    }

    // PANE: perde o controle e cai girando; explode ao tocar o chão.
    fail(msg) {
        if (this.state === 'failing' || this.state === 'dead') return;
        this.state = 'failing';
        this.failT = 0;
        this.spin = 2.4; this.spinDir = Math.random() < 0.5 ? -1 : 1;
        this.hp = 0;
        if (this.pilot) this.game._flash((msg || 'PANE!') + ' O helicóptero está em queda — pule (F)!');
    }

    explode() {
        if (this.state === 'dead') return;
        const g = this.game, p = this.position;
        const inside = this.pilot && g.mode === 'heli' && g.chopper === this;
        this.state = 'dead';
        this.alive = false;
        this.alt = this.floor;
        g.carDamage.boomAt(p.x, p.z, inside || this.lastHitBy === 'player' ? 'player' : 'env', 1.6);
        if (inside) g._chopperDown();                                  // o jogador morre com ele
        else if (this.lastHitBy === 'player') { g.wanted.reportCrime(); }
        this.visual.setVisible(false);
        this.deadAt = g.time || 0;
        this.pilot = false;
    }

    // ctl: { fwd, strafe, yaw, climb } (-1..1) do piloto; null = sem piloto.
    update(dt, ctl) {
        if (this.state === 'dead') return;
        const g = this.game;
        const failing = this.state === 'failing';
        const c = (ctl && this.pilot && !failing) ? ctl : { fwd: 0, strafe: 0, yaw: 0, climb: 0 };
        const W = Weather.cur ? Weather.cur.k : 0;

        // ---- Rotor: sobe de giro quando há piloto (ou pane: ainda gira); desliga devagar parado.
        const wantRpm = (this.pilot || failing) ? 1 : 0;
        this.rpm += (wantRpm - this.rpm) * Math.min(1, dt * (wantRpm ? 0.5 : 0.25));
        if (Math.abs(wantRpm - this.rpm) < 0.01) this.rpm = wantRpm;
        const powered = this.rpm > 0.85 && !failing;
        if (!this.pilot && this.state === 'flying' && this.grounded) this.state = 'parked';

        const cos = Math.cos(this.heading), sin = Math.sin(this.heading);     // proa = (sin, cos)
        const onGround = this.grounded;

        if (!failing) {
            // ---- Horizontal: velocidade-alvo no referencial da proa (frente/lado), aceleração limitada (inércia).
            const air = !onGround && powered;
            const vF = c.fwd > 0 ? 30 : 12, vS = 17;
            const tx = air ? (sin * c.fwd * vF + cos * c.strafe * vS) : 0, tz = air ? (cos * c.fwd * vF - sin * c.strafe * vS) : 0;
            const ax = tx - this.vx, az = tz - this.vz, al = hypot(ax, az);
            const inputOn = Math.abs(c.fwd) + Math.abs(c.strafe) > 0.01;
            const lim = (air ? (inputOn ? 15 : 3.2) : 30) * dt;                // solto: deriva (pouco atrito do ar); no chão: para
            if (al > lim) { this.vx += ax / al * lim; this.vz += az / al * lim; } else { this.vx = tx; this.vz = tz; }
            if (W > 0.4 && !onGround) { this.vx += (Math.random() - 0.5) * 7 * W * dt; this.vz += (Math.random() - 0.5) * 7 * W * dt; }   // turbulência

            // ---- Guinada (Q/E) com suavização; no chão também gira (rotor de cauda).
            const wantYaw = c.yaw * (powered ? 1.9 : 0);
            this.yawRate += (wantYaw - this.yawRate) * Math.min(1, dt * 4);
            this.heading += this.yawRate * dt;

            // ---- Vertical: ESPAÇO sobe, SHIFT desce; sem comando, paira (vy → 0).
            const wantVy = powered ? (c.climb > 0 ? 7.5 : (c.climb < 0 ? -7 : 0)) : (onGround ? 0 : -9 * (1 - this.rpm * 0.5));
            this.vy += Math.max(-14 * dt, Math.min(14 * dt, wantVy - this.vy));
        } else {
            // ---- PANE: sem sustentação; gira cada vez mais rápido e cai acelerando; o ímpeto horizontal vira espiral.
            this.failT += dt;
            this.spin = Math.min(15, this.spin + dt * 5.5);
            this.yawRate = this.spin * this.spinDir;
            this.heading += this.yawRate * dt;
            this.vy = Math.max(-26, this.vy - 15 * dt);
            const k = Math.exp(-0.3 * dt);
            this.vx = this.vx * k + Math.cos(this.failT * 3.1) * 2.5 * dt;
            this.vz = this.vz * k + Math.sin(this.failT * 3.1) * 2.5 * dt;
            this._failFx(dt);
        }

        // ---- Move no plano; prédio mais alto no caminho = batida (ricochete, dano proporcional à velocidade).
        const p = this.position, nx = p.x + this.vx * dt, nz = p.z + this.vz * dt;
        const fn = this.floorAt(nx, nz);
        if (fn > this.alt + 0.25) {
            const sp = this.speed;
            if (failing) { this.explode(); return; }
            if (sp > 4) {
                this.takeDamage(Math.max(2, (sp - 3) * 3.2), null, 'env');
                g.camera.shake(Math.min(1.1, sp * 0.05));
                AudioFX.crash(p.x, p.z, Math.min(1, sp / 25));
                for (let i = 0; i < 3; i++) g.combat.spark(p.x + (Math.random() - 0.5) * 3, this.alt + 1, p.z + (Math.random() - 0.5) * 3, [1, 0.7, 0.3]);
                if (this.state === 'failing') return;
            }
            this.vx *= -0.25; this.vz *= -0.25;
        } else { p.x = nx; p.z = nz; }

        // ---- Altura e toque no chão.
        this.floor = this.floorAt(p.x, p.z);
        this.alt += this.vy * dt;
        if (this.alt > 85) { this.alt = 85; if (this.vy > 0) this.vy = 0; }
        if (this.alt <= this.floor) {
            const impact = -this.vy;
            this.alt = this.floor;
            if (failing) { this.explode(); return; }
            if (impact > 15) { this.takeDamage(999, null, 'env'); if (this.state === 'failing') { this.explode(); return; } }
            else if (impact > 7) { this.takeDamage((impact - 7) * 9, null, 'env'); g.camera.shake(0.6); AudioFX.thud(p.x, p.z); }
            else if (impact > 2.5) AudioFX.thud(p.x, p.z);
            this.vy = 0;
        }
        if (this.alt < this.floor + 0.08 && this.vy < 0) this.vy = 0;

        this._groundFx(dt);
        this._place(dt);
    }

    // Poeira/água levantada pelo rotor quando está baixo.
    _groundFx(dt) {
        const h = this.alt - this.floor;
        if (this.rpm < 0.5 || h > 9) return;
        this._dustT -= dt;
        if (this._dustT > 0) return;
        const g = this.game, p = this.position;
        const wet = MapGeo.waterDepth(p.x, p.z) > 0 && this.floor === 0;
        this._dustT = 0.05 + h * 0.012;
        const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 4, s = 3 + Math.random() * 2;
        if (wet) {
            if (Math.random() < 0.5) g.waterFx.ripple(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, 0.8, 4.5, 1.2, 0.7);
        } else {
            g.carLights.puffs.emit(p.x + Math.cos(a) * r, 0.5, p.z + Math.sin(a) * r, Math.cos(a) * s, 0.4, Math.sin(a) * s, 0.7, 2.2, 0.8, 0.28 * (1 - h / 9), [0.78, 0.74, 0.66]);
        }
    }

    // Fumaça preta e fogo da pane, cada vez mais intensos.
    _failFx(dt) {
        this._smokeT -= dt;
        if (this._smokeT > 0) return;
        this._smokeT = Math.max(0.025, 0.09 - this.failT * 0.02);
        const g = this.game, p = this.position;
        g.carLights.puffs.emit(p.x + (Math.random() - 0.5) * 2, this.alt + 0.8, p.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3 - this.vx * 0.2, 0.8 + Math.random(), (Math.random() - 0.5) * 3 - this.vz * 0.2,
            0.9, 2.8, 1.2, 0.62, [0.12, 0.12, 0.13]);
        if (Math.random() < 0.55) g.combat.spark(p.x + (Math.random() - 0.5) * 3, this.alt + 1, p.z + (Math.random() - 0.5) * 3, [1, 0.45 + Math.random() * 0.4, 0.12]);
    }

    // Leva corpo, rotor e sombra para a posição/altura atuais.
    _place(dt) {
        const p = this.position, g = this.game, V = this.visual;
        const y = Math.max(1.7, this.alt + 1.7);                                // (no solo, acima dos carros)
        V.place(p.x, y, p.z, this.heading, this.rpm, dt, this.state === 'failing' ? 4 : 0);

        // Sombra no chão: deslocada pela direção do sol e pela altura (quanto mais alto, mais longe, maior e mais clara).
        const s = g.gameEngine.sunDir, h = Math.max(0, this.alt), k = h / Math.max(0.3, -s.y);
        const day = Math.max(0, Math.min(1, (g.dayNight.sunI - 0.2) / 0.4));
        V.placeShadow(p.x + s.x * k, p.z + s.z * k, this.heading, (0.5 - Math.min(0.2, h * 0.004)) * day, 1 + Math.min(0.3, h * 0.004));
    }

    distanceTo(pos) { return hypot(this.position.x - pos.x, this.position.z - pos.z); }

    dispose() { this.visual.dispose(); }
}
