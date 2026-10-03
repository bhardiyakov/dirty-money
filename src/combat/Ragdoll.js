// ============================================================================
// Ragdoll — arremesso animado em pixel art de quem leva um impacto (atropelamento) ou salta de um carro.
//
// O sprite é um boneco 2D visto de cima; o "ragdoll" é a combinação de:
//   - CLIPES do rig que giram o corpo inteiro (flail = no ar com os membros soltos, tumble = cambalhota,
//     lie = caído, getup = levantando);
//   - MOVIMENTO simulado aqui: voo com arco (a altura vira o deslocamento vertical do sprite), giro do
//     sprite (a direção do atlas roda: o corpo "capota"), quicada no chão, deslize com atrito;
//   - INTENSIDADE conforme o impacto (`power`, em m/s):
//       fraco  (< 5)   cambaleia, cai ali perto e levanta;
//       médio  (5–11)  é jogado alguns metros, de braços abertos, desliza e fica caído um tempo;
//       forte  (≥ 11)  voa longe capotando, quica e desliza muito.
// Fases: air → (quicada) → slide → rest → rise → fim.  Se `lethal`, em vez de levantar termina caído (o dono
// troca para o sprite de morto, com sangue).
//
// Serve a qualquer "avatar" { actor: SpriteActor, pos: Vector3 vivo }: jogador, NPC, policial ou Casualty.
// ============================================================================

class Ragdoll {
    // opts: { dx, dz (direção do arremesso), power (m/s), kind: 'hit'|'bail'|'eject', lethal, onLand(power), clip }
    constructor(av, opts) {
        this.av = av;
        this.kind = opts.kind || 'hit';
        this.lethal = !!opts.lethal;
        this.onLand = opts.onLand || null;
        const l = Math.hypot(opts.dx, opts.dz) || 1;
        this.dx = opts.dx / l; this.dz = opts.dz / l;
        const p = this.power = Math.max(1, opts.power);

        const bail = this.kind === 'bail';
        // Velocidade horizontal e vertical de saída (o "vertical" é só visual: altura do sprite).
        const v0 = bail ? Math.min(7.5, 2.5 + p * 0.28) : Math.min(13, Math.max(2.2, p * 0.95));
        this.vx = this.dx * v0; this.vz = this.dz * v0;
        this.vy = bail ? 6.8 : Math.min(9, 3 + p * 0.4);          // (cambalhota: o tempo no ar ≈ 0,62 s = a duração do giro)
        this.h = 0.01;
        this.g = 22;
        this.bounces = !bail && p >= 9 ? (p >= 14 ? 2 : 1) : 0;

        // Giro do sprite (capota) e escolha do clipe no ar.
        this.heading = Math.atan2(this.dx, this.dz) + (Math.random() < 0.5 ? 0 : Math.PI);
        const spinMag = bail ? 0 : (p >= 8 ? Math.min(10, (p - 5) * 0.8) : Math.min(2, p * 0.25));
        this.spin = spinMag * (Math.random() < 0.5 ? -1 : 1);
        this.tumbling = bail || p >= 11;                         // cambalhota (vs braços soltos)
        this.air = 0;                                            // tempo no ar (para o ritmo da animação)

        this.phase = 'air';
        this.t = 0;
        this.rest = this.lethal ? 0.9 : Math.min(1.5, 0.45 + p * 0.05);   // tempo caído antes de levantar
        this.done = false;
        this.landed = false;                                     // já tocou o chão pela 1ª vez
        this._start();
    }

    _start() {
        const a = this.av.actor;
        a.play(this.tumbling ? 'tumble' : 'flail', 'none', { restart: true });
        a.setHeading(this.heading);
        this._applyVisual();
    }

    _applyVisual() {
        const a = this.av.actor, p = this.av.pos;
        a.setPosition(p.x, p.z);
        a.setHeading(this.heading);
        a.mesh.position.y = 0.5 + Math.max(0, this.h);
    }

    // Move com colisão simples: só terra e prédios (carros não empurram o corpo).
    _move(dt) {
        const p = this.av.pos;
        const nx = p.x + this.vx * dt, nz = p.z + this.vz * dt;
        if (MapGeo.isLand(nx, nz)) { p.x = nx; p.z = nz; }
        else { this.vx *= -0.2; this.vz *= -0.2; }
        if (MapGeo.resolveCircle(p, 0.45)) { this.vx *= 0.35; this.vz *= 0.35; }     // bateu num prédio: perde velocidade
    }

    update(dt) {
        if (this.done) return;
        const a = this.av.actor;
        this.t += dt;

        if (this.phase === 'air') {
            this.air += dt;
            this.h += this.vy * dt;
            this.vy -= this.g * dt;
            this._move(dt);
            this.heading += this.spin * dt;
            // Frame do clipe no ar: cambalhota gira conforme o tempo (forte = várias voltas); ragdoll balança os membros.
            if (this.tumbling) {
                const turns = this.kind === 'bail' ? 1 / 0.62 : 1.5 + this.power * 0.05;
                const ph = (this.air * turns) % 1;
                a.setFrame(Math.min(9, Math.floor(ph * 10)));
            } else {
                a.setFrame(Math.floor(this.air * 10) % 4);
            }
            if (this.h <= 0 && this.vy < 0) this._land();
        } else if (this.phase === 'slide') {
            // Deslizando de bruços: atrito constante até parar.
            const sp = Math.hypot(this.vx, this.vz);
            if (sp > 0.25) {
                const k = Math.max(0, sp - 12 * dt) / sp;
                this.vx *= k; this.vz *= k;
                this._move(dt);
                this.heading += this.spin * dt * Math.min(1, sp / 6);
                this.spin *= Math.exp(-3 * dt);
            } else { this.vx = this.vz = 0; this.phase = 'rest'; this.t = 0; }
        } else if (this.phase === 'rest') {
            if (this.t >= this.rest) {
                if (this.lethal) { this._finish(true); return; }
                this.phase = 'rise';
                a.play('getup', 'none', { restart: true });
                if (this.kind === 'bail') a.time = 8 * 0.5;           // (cambalhota termina agachado: pula o começo)
            }
        } else if (this.phase === 'rise') {
            // (ainda desliza um pouco enquanto levanta, no caso da cambalhota)
            const sp = Math.hypot(this.vx, this.vz);
            if (sp > 0.25) { const k = Math.max(0, sp - 10 * dt) / sp; this.vx *= k; this.vz *= k; this._move(dt); }
            a.update(dt, 1);
            if (a.done) { this._finish(false); return; }
        }
        this._applyVisual();
    }

    // Tocou o chão: quica (se forte) ou passa a deslizar/levantar.
    _land() {
        const a = this.av.actor;
        this.h = 0;
        const impactVy = -this.vy;
        if (!this.landed) { this.landed = true; if (this.onLand) this.onLand(this.power); }
        if (this.bounces > 0) {
            this.bounces--;
            this.vy = impactVy * 0.38;
            this.vx *= 0.7; this.vz *= 0.7;
            this.air = 0;
            return;
        }
        if (this.kind === 'bail') {
            // Cambalhota termina em pé (agachado): levanta direto.
            this.phase = 'rise';
            a.play('getup', 'none', { restart: true });
            a.time = 8 * 0.5;
            this.vx *= 0.5; this.vz *= 0.5;
            return;
        }
        this.phase = 'slide';
        a.play('lie', 'none', { restart: true });
    }

    _finish(dead) {
        this.done = true;
        const a = this.av.actor;
        a.mesh.position.y = 0.5;
        if (this.av.onEnd) this.av.onEnd(dead, this);
    }
}

// ============================================================================
// Casualty — pessoa AVULSA (sem NavMesh): o motorista arrancado de um carro, o ciclista/motoqueiro que caiu.
// Voa/rola com o Ragdoll; depois de levantar sai correndo (foge do ladrão) e some; se morreu, fica caída
// um tempo (sprite de morto com sangue) e some.
// ============================================================================
class Casualty {
    // opts: { variant, sheet ('civA'|'civB'), threat: {x,z}, dx, dz, power, lethal, kind }
    constructor(game, pos, opts) {
        this.g = game;
        const sheet = game.sprites.sheets[opts.sheet || 'civA'];
        this.actor = new SpriteActor(game.scene, sheet, opts.variant || 2, 'casualty');
        this.pos = new BABYLON.Vector3(pos.x, 0, pos.z);
        this.threat = opts.threat || { x: pos.x, z: pos.z };
        this.state = 'rag';
        this.life = 0;
        this.alive = true;
        this.dead = false;
        this.heading = 0;
        this.rag = new Ragdoll({
            actor: this.actor, pos: this.pos,
            onEnd: (dead) => this._ragEnd(dead),
        }, { dx: opts.dx, dz: opts.dz, power: opts.power, kind: opts.kind || 'eject', lethal: opts.lethal, onLand: (p) => this._land(p) });
        this.heading = this.rag.heading;
    }

    _land(power) {
        const g = this.g, p = this.pos;
        if (power > 4) { AudioFX.thud(p.x, p.z); g.combat.spark(p.x, 0.6, p.z, [0.9, 0.85, 0.7]); }
    }

    _ragEnd(dead) {
        const a = this.actor;
        this.heading = this.rag.heading;
        if (dead) {
            this.dead = true; this.state = 'dead'; this.life = 0;
            a.play('dead', 'none', { restart: true });
            a.setHeading(this.heading);
            return;
        }
        this.state = 'flee'; this.life = 0;
        // Foge do ladrão (e não de volta para o carro).
        const dx = this.pos.x - this.threat.x, dz = this.pos.z - this.threat.z, l = Math.hypot(dx, dz) || 1;
        this.fx = dx / l; this.fz = dz / l;
        this.heading = Math.atan2(this.fx, this.fz);
        a.play('scared', 'none', { restart: true });
    }

    // Retorna false quando deve ser removido.
    update(dt) {
        this.life += dt;
        const a = this.actor;
        if (this.state === 'rag') {
            this.rag.update(dt);
        } else if (this.state === 'flee') {
            const sp = 6.2, p = this.pos;
            const nx = p.x + this.fx * sp * dt, nz = p.z + this.fz * sp * dt;
            if (MapGeo.isLand(nx, nz)) { p.x = nx; p.z = nz; }
            MapGeo.resolveCircle(p, 0.4);
            a.setPosition(p.x, p.z); a.setHeading(this.heading);
            a.update(dt, 1.3);
            const f = this.g.camera.target;
            if (this.life > 9 || (this.life > 3 && Math.hypot(p.x - f.x, p.z - f.z) > 70)) return false;
        } else {
            a.update(dt);
            if (this.life > 30) return false;
        }
        return true;
    }

    dispose() { this.actor.dispose(); }
}
