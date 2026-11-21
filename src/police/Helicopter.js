// ============================================================================
// Helicopter — o helicóptero da polícia (3★+).
//
// Voa por cima da cidade: ENXERGA POR CIMA DOS PRÉDIOS (esconder-se atrás de construção não
// adianta enquanto ele estiver a menos de Config.heli.sight de você) — mas não te vê debaixo de
// cobertura: viaduto, ponte, toldo de loja, cobertura de posto (PoliceManager.airCover). Orbita o
// jogador com o holofote aceso no chão; sem te ver, varre a ÁREA DE BUSCA numa espiral que abre
// (nunca vai direto até você sem pista). Um carro comum no talo abre distância dele na reta. A partir
// de 4★, com armas liberadas, atira rajadas de metralhadora; a 5★ leva um ATIRADOR DE ELITE (Config.heli.sniper): a mira laser
// vermelha fica em você por um instante e vem um tiro certeiro — sair da vista dele (cobertura, túnel, viaduto) cancela a mira.
// Pode ser derrubado a tiros (cai girando, explode e só vem outro depois de um tempo).
//
// Desenho: o helicóptero ilustrado (HeliArt / HeliVisual: corpo, rotor borrado, sombra com a silhueta) no grupo de renderização 2
// (desenhado por cima de tudo, como algo que voa) e o holofote como quad do GlowBatch.
// ============================================================================

class Helicopter {
    // Efeito compartilhado (holofote): um quad, criado uma vez por cena.
    static _fx(scene) {
        if (!scene._heliFx) {
            const light = new GlowBatch(scene, 1, 'heliLight', 'glow');
            scene._heliFx = { light, li: light.alloc() };
            light.off(scene._heliFx.li);
            scene.setRenderingAutoClearDepthStencil(2, true, true, true);     // o heli ignora a profundidade do mundo
        }
        return scene._heliFx;
    }

    constructor(scene, _unused, manager, x, z) {                 // (2º parâmetro: a antiga folha de sprites, não usada mais)
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
        this.airT = 0;                                      // tempo no ar (autonomia: Config.heli.sortie)
        this.fuelOut = false;
        this.crashT = 0;
        this._smokeT = 0;
        this._rot = 0;

        this.visual = new HeliVisual(scene, 6, 'policeHeli');                   // pintura 6 = polícia (azul-marinho, faixa branca)

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
        this.aimT = 0; this._laser(null);
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
        this.airT += dt;
        const pp = m.playerPos, p = this.position;
        const dP = hypot(pp.x - p.x, pp.z - p.z);
        // Te acompanhando, segura você até `range`; sem te ver, só te ACHA quem cai no holofote (perto da vertical dele, à frente).
        const fast = Math.min(1, Math.max(0, (hypot(m.playerVel.x, m.playerVel.z) - 12) / 16));          // alvo rápido: o holofote escapa
        const range = (H.sight + Math.max(0, m.level - 3) * 6) * (Weather.cur ? Weather.cur.sightMul : 1) * (1 - 0.3 * fast);
        const gx = p.x + this.vx * 0.8, gz = p.z + this.vz * 0.8, spot = hypot(pp.x - gx, pp.z - gz) < H.spot;
        this.sees = !this.leaving && m.level > 0 && dP < range && (this.sees || spot) && !m.airCover(pp.x, pp.z);

        // Para onde vai: sobrevoa o jogador (orbita) se o vê; senão a última posição conhecida; saindo = para longe.
        let tx, tz, arrive = 1;
        if (this.leaving) {
            const ax = p.x - pp.x, az = p.z - pp.z, l = hypot(ax, az) || 1;
            tx = p.x + ax / l * 200; tz = p.z + az / l * 200; arrive = 0;
        } else if (this.sees) {
            this.orbit += dt * 0.55;
            this.sweep = 0;
            tx = pp.x + m.playerVel.x * 0.6 + Math.cos(this.orbit) * H.orbit;
            tz = pp.z + m.playerVel.z * 0.6 + Math.sin(this.orbit) * H.orbit;
        } else if (m.search) {
            // Perdeu você: espiral sobre a área de busca, abrindo até a borda dela.
            const S = m.search;
            this.sweep = (this.sweep || 0) + dt * 0.4;
            const rr = Math.min(S.r * 0.9, 8 + this.sweep * 8), a = this.sweep * 1.2;
            tx = S.x + Math.cos(a) * rr; tz = S.z + Math.sin(a) * rr;
        } else {
            tx = p.x + this.vx; tz = p.z + this.vz;          // sem pista nenhuma: segue em frente, devagar
        }
        const dx = tx - p.x, dz = tz - p.z, d = hypot(dx, dz) || 1;
        const want = arrive ? Math.min(H.speed, d * 1.3) : H.speed;
        const wx = dx / d * want, wz = dz / d * want;
        const ax = wx - this.vx, az = wz - this.vz, al = hypot(ax, az);
        const lim = H.accel * dt;
        if (al > lim) { this.vx += ax / al * lim; this.vz += az / al * lim; } else { this.vx = wx; this.vz = wz; }
        p.x += this.vx * dt; p.z += this.vz * dt;
        this.alt += (H.alt - this.alt) * Math.min(1, dt * 0.5);

        // Proa: para onde voa; quase parado, de frente para o jogador.
        const sp = hypot(this.vx, this.vz);
        const hd = sp > 3 ? Math.atan2(this.vx, this.vz) : Math.atan2(pp.x - p.x, pp.z - p.z);
        let da = (hd - this.heading) % (Math.PI * 2);
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        this.heading += da * Math.min(1, dt * 3.5);

        // Metralhadora: a partir de 4★, armas liberadas, vendo o jogador de perto, em rajadas. A 5★: o atirador de elite.
        this.fireCd -= dt;
        const snipe = H.sniper && m.level >= H.sniper.from;
        if (!snipe && this.aimT) { this.aimT = 0; this._laser(null); }                // (caiu do 5★ no meio da mira)
        if (snipe) this._snipe(dt, dP, pp, m, H.sniper);
        else if (this.sees && m.level >= H.fireFrom && m.weaponsFree && dP < H.fireRange && this.fireCd <= 0) {
            const ang = Math.atan2(pp.x + m.playerVel.x * 0.25 - p.x, pp.z + m.playerVel.z * 0.25 - p.z);
            m.combat.fire({ x: p.x, z: p.z, angle: ang, owner: 'police', ref: this, fly: true, spreadMul: (1.7 + dP * 0.04) * m.moveSpread }, 'smg');
            if (this.burst <= 0) this.burst = 6;
            this.burst--;
            this.fireCd = this.burst > 0 ? 0.11 : 1.3 + Math.random() * 0.9;
        }

        this._place(dt);
    }

    // ATIRADOR DE ELITE: com você à vista e ao alcance, a mira laser trava em você por `aim` s (o bipe acelera) e sai o tiro; perdeu a
    // vista no meio (cobertura, túnel, escondido, longe), a mira cai e ele recomeça depois.
    _snipe(dt, dP, pp, m, S) {
        const g = this.game, hide = !!(g.hiding && !g.hiding.seen);
        if (!(this.sees && !hide && m.weaponsFree && dP < S.range)) {
            if (this.aimT > 0) { this.aimT = 0; this.fireCd = Math.max(this.fireCd, 0.9); }
            this._laser(null);
            return;
        }
        if (this.fireCd > 0) { this._laser(null); return; }
        if (!this.aimT) {
            this.aimT = 1e-4;
            if (!this._warned) { this._warned = true; g._flash('🎯 Atirador de elite no helicóptero! Saia da mira: cobertura, túnel ou viaduto'); }
        }
        const prev = this.aimT;
        this.aimT += dt;
        const u = this.aimT / S.aim, step = u > 0.7 ? 0.12 : u > 0.4 ? 0.25 : 0.45;           // (o bipe acelera perto do tiro)
        if (Math.floor(prev / step) !== Math.floor(this.aimT / step)) AudioFX.blip(1500 + 400 * u, 0.06, 0.12);
        this._laser(pp, u);
        if (this.aimT < S.aim) return;
        const p = this.position, ang = Math.atan2(pp.x + m.playerVel.x * 0.1 - p.x, pp.z + m.playerVel.z * 0.1 - p.z);
        m.combat.fire({ x: p.x, z: p.z, angle: ang, owner: 'police', ref: this, fly: true, spreadMul: S.spread * m.moveSpread, dmgMul: S.dmgMul }, 'revolver');
        this.snipes = (this.snipes || 0) + 1;
        this.aimT = 0;
        this.fireCd = S.gap[0] + Math.random() * S.gap[1];
        this._laser(null);
    }

    // A linha da mira laser (do helicóptero até o peito do jogador), desenhada por cima de tudo; null apaga. u: 0..1 da mira (pisca mais forte).
    _laser(pp, u = 0) {
        if (!pp) { if (this.laser) this.laser.setEnabled(false); return; }
        if (!this.laser) {
            const L = this.laser = BABYLON.MeshBuilder.CreateBox('heliLaser', { width: 0.09, height: 0.09, depth: 1 }, this.scene);
            const mt = new BABYLON.StandardMaterial('heliLaserMat', this.scene);
            mt.emissiveColor = new BABYLON.Color3(1, 0.08, 0.06); mt.diffuseColor = BABYLON.Color3.Black(); mt.disableLighting = true;
            L.material = mt; L.isPickable = false; L.renderingGroupId = 2;
        }
        const L = this.laser, p = this.position, a = this._la || (this._la = new BABYLON.Vector3()), b = this._lb || (this._lb = new BABYLON.Vector3());
        a.set(p.x, this.alt - 0.6, p.z); b.set(pp.x, 1.1, pp.z);
        L.setEnabled(true);
        L.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        L.scaling.z = BABYLON.Vector3.Distance(a, b);
        L.lookAt(b);
        L.material.alpha = 0.45 + 0.4 * u + (Math.sin(this.aimT * 40) > 0 ? 0.15 : 0);
    }

    // Leva corpo, rotor, sombra e holofote para a posição/altura atuais.
    _place(dt) {
        const p = this.position, g = this.game, V = this.visual;
        // Rotor: em voo, o disco borrado; caindo, perde rotação (as pás voltam a aparecer).
        V.place(p.x, this.alt, p.z, this.heading, this.alive ? 1 : Math.max(0.3, 1 - (2.4 - this.crashT) * 0.3), dt);

        // Sombra no chão (a silhueta), deslocada pela direção do sol e pela altura; some à noite.
        const f = this.fx, s = g.gameEngine.sunDir, k = this.alt / Math.max(0.3, -s.y);
        const day = Math.max(0, Math.min(1, (g.dayNight.sunI - 0.2) / 0.4));
        V.placeShadow(p.x + s.x * k, p.z + s.z * k, this.heading, 0.42 * day, 1.15);

        // Holofote: disco de luz no chão sobre o jogador (ou à frente, se não o vê).
        if (this.alive && this.sees) {
            const pp = this.manager.playerPos;
            f.light.place(f.li, pp.x, 0.3, pp.z, 12);
            f.light.color(f.li, 0.85, 0.92, 1.0, 0.16 + 0.3 * g.dayNight.night);
        } else f.light.off(f.li);
        f.light.flush();
    }

    distanceTo(pos) { return hypot(this.position.x - pos.x, this.position.z - pos.z); }

    dispose() {
        this.visual.dispose();
        if (this.laser) { this.laser.material.dispose(); this.laser.dispose(); this.laser = null; }
        this.fx.light.off(this.fx.li); this.fx.light.flush();
    }
}
