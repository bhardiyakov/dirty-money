// ============================================================================
// Estados de FSM do pedestre:
//   WANDER — caminha entre destinos, obedecendo semáforos de pedestre.
//   IDLE   — para um pouco (olha a vitrine, confere o celular...).
//   FLEE   — foge em pânico (assalto, tiro, perseguição).
//   HURT   — levou um golpe: cambaleia e depois foge do agressor (ou revida: Temper).
//   FIGHT  — revida: vai até o adversário e briga — soco e chute, faca, taco ou revólver (Combat.strike / fire) — até cansar ou
//            apanhar demais; quem anda armado saca quando a coisa aperta.
// Os estados só decidem PARA ONDE ir; o Recast Crowd resolve o caminho.
// ============================================================================

// --- WANDER: escolhe destinos aleatórios no NavMesh e caminha até eles. ------
class WanderState {
    constructor(npc) {
        this.npc = npc;
        this.name = 'WANDER';
        this.timer = 0;
    }

    enter() {
        this.npc.setSpeed(Config.npc.wanderSpeed);
        this._pickNewTarget();
    }

    update(dt) {
        const npc = this.npc;

        // Esperando o sinal de pedestre abrir (parado no meio-fio).
        if (npc.waiting) {
            npc.waitTime += dt;
            if (npc.ctx.signals.ped(npc.waiting).state === 'walk') npc.release();
            else if (npc.waitTime > 25) { npc.waiting = null; npc.setSpeed(Config.npc.wanderSpeed); this._pickNewTarget(); }  // desistiu
            return;
        }
        if (npc.signalGate()) return;                 // acabou de parar numa faixa fechada
        if (npc.crossing) {                           // nunca muda de ideia no meio da rua...
            if (npc.distanceToTarget() < Config.npc.reachDist) this._pickNewTarget();   // ...a não ser que o destino esteja ali
            return;
        }

        this.timer -= dt;
        // Re-sorteia se chegou perto do destino ou se demorou demais (destemido preso).
        if (this.timer <= 0 || npc.distanceToTarget() < Config.npc.reachDist) {
            if (Math.random() < Config.npc.idleChance) npc.fsm.setState(new IdleState(npc));
            else this._pickNewTarget();
        }
    }

    _pickNewTarget() {
        // Destino nunca dentro de uma faixa de pedestres (senão o NPC pararia no meio da rua).
        let dest = null;
        for (let i = 0; i < 8; i++) {
            dest = this.npc.nav.randomPoint(this.npc.position, Config.npc.wanderRadius);
            if (!CityGrid.inCrosswalk(dest.x, dest.z, 1.0) && !(FavelaPlan.built && FavelaPlan.cellAt(dest.x, dest.z) === FavelaPlan.ROAD)) break;      // (nem na rua do morro: parado ali trancaria os carros)
        }
        this.npc.gotoTarget(dest);
        this.timer = Config.npc.wanderTime;
    }
}

// --- IDLE: fica parado por alguns segundos. ---------------------------------
class IdleState {
    constructor(npc) {
        this.npc = npc;
        this.name = 'IDLE';
        this.timer = 0;
    }

    enter() {
        const [a, b] = Config.npc.idleTime;
        this.timer = a + Math.random() * (b - a);
        this.npc.setSpeed(0);
    }

    update(dt) {
        this.timer -= dt;
        if (this.timer <= 0) this.npc.toWander();
    }
}

// --- FLEE: corre na direção oposta à ameaça, recalculando periodicamente. ----
class FleeState {
    constructor(npc) {
        this.npc = npc;
        this.name = 'FLEE';
        this.timer = 0;
        this.recompute = 0;
    }

    enter() {
        this.npc.setSpeed(Config.npc.fleeSpeed);
        this.timer = Config.npc.fleeTime;
        this.recompute = 0;
        this._runAway();
    }

    update(dt) {
        this.timer -= dt;
        this.recompute -= dt;

        if (this.recompute <= 0) {
            this._runAway();
            this.recompute = 0.7; // re-mira a fuga ~a cada 0.7s (persegue-o? foge dele).
        }

        // Volta a perambular quando já fugiu tempo suficiente E está longe da ameaça.
        const far = BABYLON.Vector3.Distance(this.npc.position, this.npc.threat) > Config.npc.panicRadius * 1.4;
        if (this.timer <= 0 && far) {
            this.npc.afterPanic();
        }
    }

    _runAway() {
        const away = this.npc.position.subtract(this.npc.threat);
        away.y = 0;
        if (away.lengthSquared() < 0.01) {
            away.set(Math.random() - 0.5, 0, Math.random() - 0.5); // ameaça em cima: foge p/ lado aleatório.
        }
        away.normalize();

        // Alvo à frente na direção da fuga, ancorado no NavMesh.
        let dest = this.npc.position.add(away.scale(Config.npc.wanderRadius * 0.6));
        dest = this.npc.nav.closestPoint(dest);
        this.npc.gotoTarget(dest);
    }
}

// --- SHELTER: começou a chover — corre até o abrigo mais perto (toldo de loja, cobertura de posto); lá para, ABRE O GUARDA-CHUVA
// e segue o caminho com ele aberto até a chuva passar (NPC.umbrella). Sem abrigo por perto: abre o guarda-chuva no ato. ---
class ShelterState {
    constructor(npc) { this.npc = npc; this.name = 'SHELTER'; this.phase = 'run'; this.t = 0; this.spot = null; }

    enter() {
        const npc = this.npc;
        this.spot = Weather.shelterNear(npc.position.x, npc.position.z, 80);
        this.t = 0;
        if (!this.spot) { this.phase = 'open'; npc.setSpeed(0); return; }
        this.phase = 'run';
        npc.setSpeed(Config.npc.fleeSpeed * 0.78);
        npc.gotoTarget(npc.nav.closestPoint(new BABYLON.Vector3(this.spot.x, 0, this.spot.z)));
    }

    update(dt) {
        const npc = this.npc;
        this.t += dt;
        if (this.phase === 'run') {
            if (npc.distanceToTarget() < 1.7 || this.t > 16) { this.phase = 'open'; this.t = 0; npc.setSpeed(0); }
        } else {                                              // parado: tira o guarda-chuva da bolsa (0,5 s) e abre
            if (this.t > 0.5 && !npc.umbrella) npc.umbrella = true;
            if (this.t > 1.3) npc.toWander();
        }
    }
}

// --- SURRENDER: assaltado — larga tudo, ergue as mãos e se ajoelha encarando o assaltante. ---
// Só sai daqui quando o Game manda (entregou o dinheiro, o jogador baixou a arma/se afastou) ou ao levar dano.
class SurrenderState {
    constructor(npc) {
        this.npc = npc;
        this.name = 'SURRENDER';
        this.t = 0;
    }

    enter() {
        this.npc.setSpeed(0);
        this.t = 0;
    }

    update(dt) {
        const npc = this.npc;
        this.t += dt;
        const want = Math.atan2(npc.threat.x - npc.position.x, npc.threat.z - npc.position.z);   // encara o assaltante
        npc.heading = npc._lerpAngle(npc.heading, want, 1 - Math.exp(-10 * dt));
        npc.transform.rotation.y = npc.heading;
    }

    get kneeling() { return this.t > 0.9; }                 // fim do clipe de rendição (8 quadros a 9 fps)
}

// --- HURT: cambaleia por um instante; depois revida (Temper) ou foge de quem bateu. ---------------------
class HurtState {
    constructor(npc) {
        this.npc = npc;
        this.name = 'HURT';
        this.timer = 0;
        this.reply = null;
    }

    enter() {
        this.timer = 0.55;
        this.npc.setSpeed(0);
        this.reply = FightState.wants(this.npc);                       // (já decide: as páginas da arma chegam enquanto ele cambaleia)
        if (this.reply) Temper.prefetch(this.npc, this.reply.weapon !== 'none' ? this.reply.weapon : this.reply.armed);
    }

    update(dt) {
        this.timer -= dt;
        if (this.timer > 0) return;
        const npc = this.npc, R = this.reply && FightState.wants(npc);      // (ainda vale: o jogador pode ter sacado, entrado no carro…)
        if (R) npc.fsm.setState(new FightState(npc, npc.ctx.game.player, R));
        else npc.panic(npc.threat, true);
    }
}

// --- FIGHT: revida — vai até o adversário (o jogador; numa briga de rua ou de trânsito, outro pedestre) e briga com o que tem na mão:
// soco e chute, facada, taco (golpes de verdade: Combat.strike) ou revólver (Combat.fire, de longe e com a linha de tiro livre), até
// cansar, apanhar demais, o outro sumir/entrar num carro — ou aparecer uma arma que ele não encara (Temper). Quem anda armado e está
// levando a pior no braço, ou vê o outro sacar, SACA a dele (escalada). Fora do NavMesh (briga de trânsito, na pista: npc.free) anda
// em linha reta (NPC.walkFree).
class FightState {
    // Revida o jogador? → null ou { weapon (com que entra), armed (a arma que tem) } — Temper: homens a mão livre; contra faca, taco
    // ou arma de fogo, só os armados; mulheres com faca ou taco, mais na periferia.
    static wants(npc) {
        const g = npc.ctx.game, p = g && g.player;
        if (!p || npc._hitBy !== 'player' || npc.hp < npc.maxHp * 0.4 || !g.combat) return null;
        if (g.mode !== 'player' || !p.alive || p.rag || (npc.free && (npc._freeDepth || 0) > 0)) return null;      // (nadando: foge)
        const R = Temper.reply(npc, Temper.attackOf(npc._hitKind), p, g);
        if (!R) return null;
        return hypot(p.position.x - npc.position.x, p.position.z - npc.position.z) < (R.weapon === 'pistol' ? 30 : 9) ? R : null;
    }
    static LINES = {
        draw: ['Agora tu vai ver!', 'Tá achando que eu sou otário?!', 'Quer brincar? Então vem!'],
        pistol: ['Mexeu com a pessoa errada!', 'Vai morrer, vagabundo!'],
    };

    constructor(npc, foe, opts = {}) {
        this.npc = npc;
        this.foe = foe;
        this.name = 'FIGHT';
        this.weapon = opts.weapon || 'none';      // na mão: 'none' | 'knife' | 'bat' | 'pistol'
        this.armed = opts.armed || (this.weapon !== 'none' ? this.weapon : null);      // a arma que ele TEM (saca na escalada)
        this.clip = null;          // clipe tocando (golpe, sacar, mirar, atirar) e a arma dele
        this.clipW = null;
        this.attackT = 0;          // tempo até o golpe/tiro acabar
        this.cd = 0.25;            // até o próximo golpe
        this.timer = 0;            // fôlego
        this.repath = 0;
        this.stagger = 0;          // levou um golpe: cambaleia (onHurt)
        this.aimT = 0; this.ammo = 6; this.reload = 0;      // revólver: mirando, balas no tambor, recarregando
        this._dt = 0;
    }

    enter() {
        const npc = this.npc;
        this.timer = this.weapon === 'pistol' ? 14 + Math.random() * 8 : 9 + Math.random() * 6;
        npc.waiting = null; npc.crossing = null;
        npc.fleeAge = 0;
        if (this.weapon !== 'none') this._draw(this.weapon, false);
    }

    update(dt) {
        const npc = this.npc, g = npc.ctx.game, foe = this.foe, p = npc.position;
        this._dt = dt;
        this.timer -= dt; this.cd -= dt; this.repath -= dt;
        if (this.attackT > 0 && (this.attackT -= dt) <= 0) { this.clip = null; this.clipW = null; }
        if (this.stagger > 0) { this.stagger -= dt; this._stop(); return; }
        const dx = foe.position.x - p.x, dz = foe.position.z - p.z, d = hypot(dx, dz);
        const lost = npc.hp < npc.maxHp * 0.3;
        const away = foe === g.player ? g.mode !== 'player' || !!g.hiding : !!(foe.fsm && /^(FLEE|DEAD|RAG)$/.test(foe.fsm.name) && !foe.rag);
        if (!foe.alive || away || this.timer <= 0 || d > (this.weapon === 'pistol' ? 34 : 14) || lost) { this._quit(lost); return; }
        // A arma na mão do outro: encara, saca a dele (escalada) ou foge.
        const t = Temper.threat(foe, g);
        if (!this._faces(this.weapon, t, d)) {
            if (this.armed && this.armed !== this.weapon && this._faces(this.armed, t, d)) this._draw(this.armed);
            else { this._quit(true); return; }
        } else if (this.weapon === 'none' && this.armed && npc.hp < npc.maxHp * 0.55 && this.attackT <= 0) this._draw(this.armed);   // apanhando no braço
        if (foe.rag) { if (this.attackT <= 0) { this._stop(); this.clip = null; } return; }          // caiu: espera levantar
        npc.heading = Math.atan2(dx, dz);
        if (this.weapon === 'pistol') this._gunfight(g, d);
        else this._melee(g, d);
    }

    // Com `w` na mão, encara a ameaça `t` a `d` m? (mão livre: só mão livre; faca/taco: contra arma de fogo, só colado)
    _faces(w, t, d) {
        if (t === 'hand') return true;
        if (w === 'none' || !w) return false;
        return t !== 'gun' || w === 'pistol' || d <= Config.npc.temper.closeVsGun;
    }

    // Saca `w` (o revólver com o clipe de sacar; a faca e o taco já aparecem na mão).
    _draw(w, say = true) {
        const npc = this.npc;
        this.weapon = w; this.armed = w;
        this.clip = null; this.clipW = null; this.attackT = 0;
        Temper.prefetch(npc, w);
        if (w === 'pistol' && npc.actor.play('draw', 'pistol', { restart: true })) {
            this.clip = 'draw'; this.clipW = 'pistol';
            this.attackT = Math.min(0.7, this._dur(0.5)); this.cd = this.attackT + 0.25;
        }
        this.timer = Math.max(this.timer, w === 'pistol' ? 12 : 8);
        const L = FightState.LINES[w === 'pistol' && Math.random() < 0.5 ? 'pistol' : 'draw'];
        if (say && typeof Bubbles !== 'undefined') Bubbles.say(npc, L[Math.floor(Math.random() * L.length)], { tone: 'angry', ms: 2200 });
    }
    _dur(def) { const c = this.npc.actor.clip; return c && c.fps > 0 ? c.frames / c.fps : def; }

    // Anda até (x, z) (crowd do Recast; fora dele, em linha reta) / para.
    _go(x, z, speed) {
        const npc = this.npc;
        if (npc.free) { npc.walkFree(x, z, speed, this._dt); return; }
        npc.setSpeed(speed);
        if (this.repath <= 0) { npc.gotoTarget(new BABYLON.Vector3(x, 0, z)); this.repath = 0.3; }
    }
    _stop() {
        const npc = this.npc;
        if (npc.free) { npc._freeV = 0; return; }
        npc.setSpeed(0);
        if (this.repath <= 0) { npc.gotoTarget(npc.position); this.repath = 0.3; }
    }

    // Corpo a corpo: avança e, ao alcance, golpeia.
    _melee(g, d) {
        const foe = this.foe, reach = this.weapon === 'bat' ? 1.85 : this.weapon === 'knife' ? 1.5 : 1.45;
        if (this.attackT > 0 || d < 0.95) this._stop();                           // golpeando ou colado: para
        else this._go(foe.position.x, foe.position.z, Config.npc.fleeSpeed * 0.8);    // avança
        if (d < reach && this.cd <= 0 && this.attackT <= 0) this._attack(g);
    }

    _attack(g) {
        const npc = this.npc, w = this.weapon, cw = w === 'knife' || w === 'bat' ? w : 'none';
        const kind = cw !== 'none' ? Temper.BLOW[cw] : Math.random() < 0.25 ? 'kick' : (this._jab = !this._jab) ? 'punchL' : 'punch';
        if (!npc.actor.play(kind, cw, { restart: true })) return;
        this.clip = kind; this.clipW = cw;
        this.attackT = this._dur({ punch: 0.43, punchL: 0.36, kick: 0.58, stab: 0.45, swing: 0.6 }[kind]);      // (o golpe dura o clipe)
        this.cd = this.attackT + 0.35 + Math.random() * 0.6;
        g.combat.strike({ position: npc.position, heading: () => npc.heading, ok: () => npc.alive && !npc.rag && npc.fsm.current === this && this.clip === kind },
            kind, { source: 'npc', ref: npc, foe: this.foe, dmgMul: cw === 'none' ? 0.75 : 0.6 });
    }

    // Revólver: chega até ter a linha de tiro (e no máximo 14 m), mira e atira; 6 balas no tambor e recarrega.
    _gunfight(g, d) {
        const npc = this.npc, foe = this.foe, p = npc.position, dt = this._dt;
        if (this.attackT > 0) { this._stop(); return; }                           // sacando / atirando
        if (this.reload > 0) {
            this._stop(); this.clip = null;
            if ((this.reload -= dt) <= 0) { this.ammo = 6; this.aimT = 0; }
            return;
        }
        if (d > 14 || !MapGeo.hasLineOfSight(p.x, p.z, foe.position.x, foe.position.z)) {
            this.aimT = 0; this.clip = null;
            this._go(foe.position.x, foe.position.z, Config.npc.fleeSpeed * 0.7);
            return;
        }
        const by = this._inLine(g);
        if (by) {                                                                  // alguém no meio: dá um passo de lado em vez de atirar nele
            const l = d || 1, k = npc.id % 2 ? 1 : -1, dx = (foe.position.x - p.x) / l, dz = (foe.position.z - p.z) / l;
            this.aimT = 0; this.clip = null;
            this._go(p.x - dz * 2 * k, p.z + dx * 2 * k, Config.npc.fleeSpeed * 0.5);
            return;
        }
        this._stop();
        this.aimT += dt; this.clip = 'aim'; this.clipW = 'pistol';
        if (this.aimT > 0.45 && this.cd <= 0) this._shoot(g);
    }
    // Um pedestre (que não ele nem o alvo) na linha de tiro?
    _inLine(g) {
        const p = this.npc.position, f = this.foe.position, sx = f.x - p.x, sz = f.z - p.z, L2 = sx * sx + sz * sz || 1;
        for (const n of g.npcManager ? g.npcManager.npcs : []) {
            if (n === this.npc || n === this.foe || !n.alive || n.rag) continue;
            const q = n.position, k = ((q.x - p.x) * sx + (q.z - p.z) * sz) / L2;
            if (k <= 0.05 || k >= 0.95) continue;
            const cx = p.x + sx * k - q.x, cz = p.z + sz * k - q.z;
            if (cx * cx + cz * cz < 0.36) return n;
        }
        return null;
    }

    _shoot(g) {
        const npc = this.npc, p = npc.position;
        if (!npc.actor.play('shoot', 'pistol', { restart: true })) return;
        this.clip = 'shoot'; this.clipW = 'pistol';
        this.attackT = Math.min(0.4, this._dur(0.3));
        this.cd = this.attackT + 0.5 + Math.random() * 0.7; this.aimT = 0.25;
        g.combat.fire({ x: p.x, z: p.z, angle: g.combat.leadAngle(p.x, p.z, this.foe, Weapons.revolver.speed), owner: 'npc', ref: npc, spreadMul: 2.4, dmgMul: 0.7 }, 'revolver');
        if (--this.ammo <= 0) this.reload = 1.8;
        if (g.npcManager) g.npcManager.alertShot(p);                              // quem ouve, foge
    }

    // Levou um golpe/tiro brigando (NPC.hurt): cambaleia e continua — e quem bateu foi o jogador, se ele topa, a briga passa a ser com ele.
    onHurt() {
        const npc = this.npc, g = npc.ctx.game;
        this.stagger = 0.4; this.clip = null; this.clipW = null; this.attackT = 0;
        if (npc._hitBy === 'player' && this.foe !== g.player) {
            const R = FightState.wants(npc);
            if (R) { this.foe = g.player; if (R.weapon !== 'none' && this.weapon === 'none') this._draw(R.weapon); }
        }
    }

    // Acabou a briga: foge do adversário (cansou, apanhou demais, ele sumiu ou sacou o que não dá para encarar).
    _quit() {
        this.clip = null;
        this.npc.panic(this.foe.position, true);
    }

    // O que o desenho toca agora (NPC.update): cambaleando, o golpe/o tiro, correndo ou em guarda — com a arma na mão.
    anim(speed) {
        const w = this.weapon;
        if (this.stagger > 0) return { clip: 'hurt', w: 'none', rate: 1 };
        if (this.clip) return { clip: this.clip, w: this.clipW || w, rate: 1 };
        if (speed > 0.5) return { clip: 'run', w, rate: Math.max(0.5, speed / Config.anim.run) };
        return { clip: 'idle', w, rate: 1 };
    }

    exit() { this.clip = null; }
}
