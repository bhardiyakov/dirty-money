// ============================================================================
// Helicopter — o helicóptero da polícia (3★+).
//
// Voa por cima da cidade: ENXERGA POR CIMA DOS PRÉDIOS (esconder-se atrás de construção não
// adianta enquanto ele estiver a menos de Config.heli.sight de você). Orbita o jogador com o
// holofote aceso no chão; sem ver o jogador, vai à última posição conhecida pelo rádio. A partir de
// 4★, com armas liberadas, atira rajadas de metralhadora. Pode ser derrubado a tiros (cai girando,
// explode e só vem outro depois de um tempo).
//
// Desenho: sprite do corpo (HeliSheet) + quad do rotor girando, ambos no grupo de renderização 2
// (desenhados por cima de tudo, como algo que voa), sombra no chão e holofote como quads do GlowBatch.
// ============================================================================

class Helicopter {
    // Efeitos compartilhados (sombra e holofote): um quad cada, criados uma vez por cena.
    static _fx(scene) {
        if (!scene._heliFx) {
            const shadow = new GlowBatch(scene, 1, 'heliShadow', 'puff');
            const light = new GlowBatch(scene, 1, 'heliLight', 'glow');
            scene._heliFx = { shadow, light, si: shadow.alloc(), li: light.alloc() };
            shadow.off(scene._heliFx.si); light.off(scene._heliFx.li);
            scene.setRenderingAutoClearDepthStencil(2, true, true, true);     // o heli ignora a profundidade do mundo
        }
        return scene._heliFx;
    }

    constructor(scene, sheet, manager, x, z) {
        this.scene = scene;
        this.manager = manager;
        const H = Config.heli;
        this.position = new BABYLON.Vector3(x, 0, z);      // plano (x,z): o Combat e a IA leem isto
        this.vx = 0; this.vz = 0;
        this.alt = H.alt + 12;                              // chega descendo
        this.heading = 0;
        this.orbit = Math.random() * Math.PI * 2;
        this.hp = H.hp;
        this.alive = true;
        this.leaving = false;
        this.flying = true;                                 // a mira assistida o enxerga mesmo atrás de prédios
        this.sees = false;
        this.fireCd = 1.5;
        this.burst = 0;
        this.crashT = 0;
        this._smokeT = 0;
        this._rot = 0;

        this.actor = new SpriteActor(scene, sheet, 6, 'heliBody');
        this.actor.play('static');
        this.actor.mesh.renderingGroupId = 2;

        const size = sheet.frame / Config.art.ppu;
        this.rotor = BABYLON.MeshBuilder.CreateGround('heliRotor', { width: size, height: size }, scene);
        this.rotor.material = sheet.rotorMaterial;
        this.rotor.renderingGroupId = 2;
        this.rotor.isPickable = false;
        this.rotor.alwaysSelectAsActiveMesh = true;

        this.fx = Helicopter._fx(scene);
        this._place(0);
    }

    get game() { return this.manager.game; }

    takeDamage(amount, from, source) {
        if (!this.alive) return;
        this.hp -= amount;
        this.game.combat.spark(this.position.x, this.alt, this.position.z, [1, 0.8, 0.4]);
        if (this.hp <= 0) this._down(source);       // (atirar nele já é crime contra a polícia: derrubar vale +1★)
    }

    // Abatido: cai girando, soltando fumaça; some numa explosão.
    _down(source) {
        this.alive = false;
        this.sees = false;
        this.crashT = 2.4;
        if (source === 'player') { this.game.wanted.addStars(1, 'kill'); this.game._flash('Você derrubou o helicóptero da polícia!'); }
        this.manager.heliCooldown = Config.heli.cooldown;
    }

    _crash(dt) {
        this.crashT -= dt;
        this.heading += dt * 6;
        this.alt = Math.max(0.6, this.alt - dt * (6 + (2.4 - this.crashT) * 5));
        this.position.x += this.vx * dt * 0.5; this.position.z += this.vz * dt * 0.5;
        this._smokeT -= dt;
        if (this._smokeT <= 0) {
            this._smokeT = 0.07;
            const p = this.game.carLights.puffs;
            p.emit(this.position.x, this.alt, this.position.z, (Math.random() - 0.5) * 2, 1.2, (Math.random() - 0.5) * 2, 0.8, 2.4, 1.2, 0.6);
        }
        this._place(dt);
        if (this.crashT <= 0) {
            const c = this.game.combat;
            for (let i = 0; i < 7; i++) c.spark(this.position.x + (Math.random() - 0.5) * 4, 1 + Math.random() * 2, this.position.z + (Math.random() - 0.5) * 4, [1, 0.5 + Math.random() * 0.3, 0.15]);
            AudioFX.thud(this.position.x, this.position.z);
            this.manager.removeHeli();
        }
    }

    update(dt) {
        if (!this.alive) { this._crash(dt); return; }
        const H = Config.heli, m = this.manager;
        const pp = m.playerPos, p = this.position;
        const dP = Math.hypot(pp.x - p.x, pp.z - p.z);
        this.sees = !this.leaving && m.level > 0 && dP < H.sight * (Weather.cur ? Weather.cur.sightMul : 1);

        // Para onde vai: sobrevoa o jogador (orbita) se o vê; senão a última posição conhecida; saindo = para longe.
        let tx, tz, arrive = 1;
        if (this.leaving) {
            const ax = p.x - pp.x, az = p.z - pp.z, l = Math.hypot(ax, az) || 1;
            tx = p.x + ax / l * 200; tz = p.z + az / l * 200; arrive = 0;
        } else if (this.sees) {
            this.orbit += dt * 0.55;
            tx = pp.x + m.playerVel.x * 0.6 + Math.cos(this.orbit) * H.orbit;
            tz = pp.z + m.playerVel.z * 0.6 + Math.sin(this.orbit) * H.orbit;
        } else {
            const k = m.known || pp;
            tx = k.x; tz = k.z;
        }
        const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz) || 1;
        const want = arrive ? Math.min(H.speed, d * 1.3) : H.speed;
        const wx = dx / d * want, wz = dz / d * want;
        const ax = wx - this.vx, az = wz - this.vz, al = Math.hypot(ax, az);
        const lim = H.accel * dt;
        if (al > lim) { this.vx += ax / al * lim; this.vz += az / al * lim; } else { this.vx = wx; this.vz = wz; }
        p.x += this.vx * dt; p.z += this.vz * dt;
        this.alt += (H.alt - this.alt) * Math.min(1, dt * 0.5);

        // Proa: para onde voa; quase parado, de frente para o jogador.
        const sp = Math.hypot(this.vx, this.vz);
        const hd = sp > 3 ? Math.atan2(this.vx, this.vz) : Math.atan2(pp.x - p.x, pp.z - p.z);
        let da = (hd - this.heading) % (Math.PI * 2);
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        this.heading += da * Math.min(1, dt * 3.5);

        // Metralhadora: a partir de 4★, armas liberadas, vendo o jogador de perto, em rajadas.
        this.fireCd -= dt;
        if (this.sees && m.level >= H.fireFrom && m.weaponsFree && dP < H.fireRange && this.fireCd <= 0) {
            const ang = Math.atan2(pp.x + m.playerVel.x * 0.25 - p.x, pp.z + m.playerVel.z * 0.25 - p.z);
            m.combat.fire({ x: p.x, z: p.z, angle: ang, owner: 'police', ref: this, fly: true, spreadMul: 1.7 + dP * 0.04 }, 'smg');
            if (this.burst <= 0) this.burst = 6;
            this.burst--;
            this.fireCd = this.burst > 0 ? 0.11 : 1.3 + Math.random() * 0.9;
        }

        this._place(dt);
    }

    // Leva sprite, rotor, sombra e holofote para a posição/altura atuais.
    _place(dt) {
        const p = this.position, a = this.actor, g = this.game;
        a.setPosition(p.x, p.z);
        a.setHeading(this.heading);
        a.mesh.position.y = this.alt;
        this.rotor.position.set(p.x, this.alt + 0.45, p.z);
        // Rotor: gira em passos de 22,5° (rápido demais para o pixel art acompanhar → efeito de borrão).
        this._rot += (this.alive ? 30 : 12) * dt;
        this.rotor.rotation.y = Math.floor(this._rot / (Math.PI / 8)) * (Math.PI / 8);
        this.rotor.setEnabled(this.alive || this.crashT > 0.6);

        // Sombra no chão, deslocada pela direção do sol e pela altura; some à noite.
        const f = this.fx, s = g.gameEngine.sunDir, k = this.alt / Math.max(0.3, -s.y);
        f.shadow.place(f.si, p.x + s.x * k, 0.21, p.z + s.z * k, 11);
        const day = Math.max(0, Math.min(1, (g.dayNight.sunI - 0.2) / 0.4));
        if (day > 0.05) f.shadow.color(f.si, 0.03, 0.03, 0.05, 0.42 * day); else f.shadow.off(f.si);
        f.shadow.flush();

        // Holofote: disco de luz no chão sobre o jogador (ou à frente, se não o vê).
        if (this.alive && this.sees) {
            const pp = this.manager.playerPos;
            f.light.place(f.li, pp.x, 0.3, pp.z, 12);
            f.light.color(f.li, 0.85, 0.92, 1.0, 0.16 + 0.3 * g.dayNight.night);
        } else f.light.off(f.li);
        f.light.flush();
    }

    distanceTo(pos) { return Math.hypot(this.position.x - pos.x, this.position.z - pos.z); }

    dispose() {
        this.actor.dispose();
        this.rotor.dispose();
        this.fx.shadow.off(this.fx.si); this.fx.shadow.flush();
        this.fx.light.off(this.fx.li); this.fx.light.flush();
    }
}
