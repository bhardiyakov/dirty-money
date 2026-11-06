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
            if (!CityGrid.inCrosswalk(dest.x, dest.z, 1.0) && !Favelas.onRoad(dest.x, dest.z)) break;      // (nem na rua do morro: parado ali trancaria os carros)
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
        // Luta (Config.posture, combat/Posture.js): ANTECIPAÇÃO (windup: segura o golpe, a janela para reagir — acertá-lo aí cancela),
        // ATORDOADO (stun: equilíbrio zerado), papel no grupo (role: 'engage' de frente | 'flank' pelos lados/costas) e o lado do flanco.
        this.windup = 0; this.pending = null; this.stun = 0;
        this.role = 'engage'; this._roleT = 0; this.side = npc.id % 2 ? 1 : -1; this._orbit = 0;
        this.cover = null;         // revólver: o ponto de cobertura para recarregar
    }

    // Quem está brigando agora (para o grupo: papéis, a vez de atacar e a moral).
    static live = new Set();
    // Quantos atacam `foe` agora (segurando ou soltando o golpe) — no máximo Config.posture.tokens ao mesmo tempo.
    static attackers(foe) { let n = 0; for (const S of FightState.live) if (S.foe === foe && S.npc.fsm.current === S && (S.windup > 0 || S.attackT > 0)) n++; return n; }
    // MORAL: alguém do lado dele caiu (morreu ou foi arremessado) brigando com `foe` perto: os outros reavaliam — com a vida pela metade
    // ou depois de ver 2 caírem, fogem (ou, contra arma de fogo, se rendem); senão, xingam e seguem.
    static allyDown(npc, foe) {
        const R = Config.posture.moraleR, p = npc.position;
        for (const S of [...FightState.live]) {
            if (S.npc === npc || S.foe !== foe || !S.npc.alive || S.npc.fsm.current !== S) continue;
            const q = S.npc.position;
            if (Math.abs(q.x - p.x) > R || Math.abs(q.z - p.z) > R) continue;
            S.downs = (S.downs || 0) + 1;
            const weak = S.npc.hp < S.npc.maxHp * 0.5 || S.downs >= 2, r = Math.random();
            if (weak && r < 0.75) {
                const g = S.npc.ctx.game, gun = typeof Temper !== 'undefined' && Temper.threat(foe, g) === 'gun';
                if (gun && r < 0.3) S._yield(); else S._quit(true);
            } else if (typeof Bubbles !== 'undefined' && Math.random() < 0.5) Bubbles.say(S.npc, ['Ô, derrubou o cara!', 'Agora é comigo!', 'Segura ele!'][Math.floor(Math.random() * 3)], { tone: 'angry', ms: 1800 });
        }
    }

    enter() {
        const npc = this.npc;
        FightState.live.add(this);
        this.timer = this.weapon === 'pistol' ? 14 + Math.random() * 8 : 9 + Math.random() * 6;
        npc.waiting = null; npc.crossing = null;
        npc.fleeAge = 0;
        if (this.weapon !== 'none') this._draw(this.weapon, false);
    }

    update(dt) {
        const npc = this.npc, g = npc.ctx.game, foe = this.foe, p = npc.position;
        this._dt = dt;
        this.timer -= dt; this.cd -= dt; this.repath -= dt;
        if (typeof Posture !== 'undefined') Posture.tick(npc, dt);
        if (this.attackT > 0 && (this.attackT -= dt) <= 0) { this.clip = null; this.clipW = null; }
        if (this.stun > 0) { this.stun -= dt; this._stop(); return; }                 // atordoado: cambaleia, não reage
        if (this.stagger > 0) { this.stagger -= dt; this._stop(); return; }
        const dx = foe.position.x - p.x, dz = foe.position.z - p.z, d = hypot(dx, dz);
        if (this.windup > 0) {                                                      // segurando o golpe (a janela para reagir)
            npc.heading = Math.atan2(dx, dz); this._stop();
            if ((this.windup -= dt) <= 0) this._release(g);
            return;
        }
        const lost = npc.hp < npc.maxHp * 0.3;
        const away = foe === g.player ? g.mode !== 'player' || !!g.hiding : !!(foe.fsm && /^(FLEE|DEAD|RAG)$/.test(foe.fsm.name) && !foe.rag);
        if (lost && !away && foe.alive && Temper.threat(foe, g) === 'gun' && Math.random() < 0.4) { this._yield(); return; }      // (apanhou demais e o outro está armado: se rende)
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
    // Em GRUPO (Config.posture): o mais perto do adversário é o ENGAGER (vem de frente); os outros FLANQUEIAM — contornam até os lados/as
    // costas dele (flank m) — e, sem a vez de atacar (tokens), rondam a circle m em vez de amontoar.
    _role() {
        if ((this._roleT -= this._dt) > 0) return this.role;
        this._roleT = 0.4;
        const f = this.foe.position;
        let best = null, bd = Infinity;
        for (const S of FightState.live) {
            if (S.foe !== this.foe || !S.npc.alive || S.npc.fsm.current !== S || S.weapon === 'pistol') { if (S.npc.fsm.current !== S) FightState.live.delete(S); continue; }
            const q = S.npc.position, dd = (q.x - f.x) ** 2 + (q.z - f.z) ** 2;
            if (dd < bd) { bd = dd; best = S; }
        }
        return (this.role = !best || best === this ? 'engage' : 'flank');
    }
    _melee(g, d) {
        const foe = this.foe, P = Config.posture, reach = this.weapon === 'bat' ? 1.85 : this.weapon === 'knife' ? 1.5 : 1.45, f = foe.position, p = this.npc.position;
        const turn = FightState.attackers(foe) < P.tokens || this.attackT > 0;             // (a vez de atacar)
        if (this.attackT > 0 || (d < 0.95 && turn)) this._stop();                          // golpeando ou colado: para
        else if (!turn && d < P.circle + 1) {                                              // sem a vez: ronda o adversário
            this._orbit += this._dt * 0.7 * this.side;
            const a = Math.atan2(p.x - f.x, p.z - f.z) + 0.5 * this.side;
            this._go(f.x + Math.sin(a) * P.circle, f.z + Math.cos(a) * P.circle, Config.npc.fleeSpeed * 0.45);
        } else if (this._role() === 'flank' && d > reach * 0.8) {                         // flanco: dá a volta até o lado/as costas dele
            const fh = foe === g.player && g.player.root ? g.player.root.rotation.y : Math.atan2(p.x - f.x, p.z - f.z) + Math.PI;
            const a = fh + Math.PI + this.side * 1.1, tx = f.x + Math.sin(a) * P.flank, tz = f.z + Math.cos(a) * P.flank;
            this._go(hypot(tx - p.x, tz - p.z) > 0.6 ? tx : f.x, hypot(tx - p.x, tz - p.z) > 0.6 ? tz : f.z, Config.npc.fleeSpeed * 0.85);
        }
        else this._go(f.x, f.z, Config.npc.fleeSpeed * 0.8);                              // avança
        if (d < reach && this.cd <= 0 && this.attackT <= 0 && turn) this._attack(g);
    }

    // ANTECIPAÇÃO: o golpe começa SEGURADO (o braço/a perna/o taco puxado para trás, parado — FightState.anim rate 0) por windup s com um
    // brilho na mão: é a janela do jogador para esquivar ou acertá-lo antes (contra-ataque: cancela o golpe — onHurt). Depois solta (_release).
    static HOLD = 0.12;            // (fração do clipe em que ele fica parado: o recuo do golpe)
    _attack(g) {
        const npc = this.npc, w = this.weapon, cw = w === 'knife' || w === 'bat' ? w : 'none', W = Config.posture.windup;
        const kind = cw !== 'none' ? Temper.BLOW[cw] : Math.random() < 0.25 ? 'kick' : (this._jab = !this._jab) ? 'punchL' : 'punch';
        if (!npc.actor.play(kind, cw, { restart: true })) return;
        npc.actor.setPhase(FightState.HOLD);
        this.clip = kind; this.clipW = cw; this.pending = { kind, cw };
        this.windup = (W[0] + Math.random() * (W[1] - W[0])) * (kind === 'kick' || kind === 'swing' ? 1.25 : 1);      // (golpe pesado: antecipação maior)
        const h = npc.heading, p = npc.position;
        g.combat.spark(p.x + Math.sin(h + 0.6 * this.side) * 0.35, 1.45, p.z + Math.cos(h + 0.6 * this.side) * 0.35, [1, 0.95, 0.75], Math.min(0.35, this.windup));      // (o brilho do aviso)
    }
    _release(g) {
        const npc = this.npc, P = this.pending;
        this.windup = 0; this.pending = null;
        if (!P || this.clip !== P.kind) return;
        const kind = P.kind, cw = P.cw, dur = this._dur({ punch: 0.43, punchL: 0.36, kick: 0.58, stab: 0.45, swing: 0.6 }[kind]);
        this.attackT = dur * (1 - FightState.HOLD);                                         // (o golpe dura o resto do clipe)
        this.cd = this.attackT + 0.35 + Math.random() * 0.6;
        g.combat.strike({ position: npc.position, heading: () => npc.heading, ok: () => npc.alive && !npc.rag && npc.fsm.current === this && this.clip === kind },
            kind, { source: 'npc', ref: npc, foe: this.foe, dmgMul: cw === 'none' ? 0.75 : 0.6, t: dur * FightState.HOLD });
    }

    // Revólver: chega até ter a linha de tiro (e no máximo 14 m), mira e atira; 6 balas no tambor e recarrega.
    _gunfight(g, d) {
        const npc = this.npc, foe = this.foe, p = npc.position, dt = this._dt;
        if (this.attackT > 0) { this._stop(); return; }                           // sacando / atirando
        if (this.reload > 0) {                                                    // recarregando: atrás de uma cobertura, se houver uma perto
            this.clip = null;
            if (this.cover && hypot(this.cover.x - p.x, this.cover.z - p.z) > 0.5) this._go(this.cover.x, this.cover.z, Config.npc.fleeSpeed);
            else this._stop();
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
    // COBERTURA para recarregar: um ponto até ~8 m em que um muro, caçamba, carro… fica entre ele e o adversário (Cover.find/hides).
    _findCover() {
        if (typeof Cover === 'undefined') return null;
        const p = this.npc.position, f = this.foe.position;
        let best = null, bd = Infinity;
        for (let k = 0; k < 10; k++) {
            const a = (k / 10) * Math.PI * 2, r = k % 2 ? 4 : 7, x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
            if (!MapGeo.isLand(x, z)) continue;
            const c = Cover.find(x, z, 1.6);
            if (!c || !Cover.hides(c, f.x, f.z, x, z) || !MapGeo.hasLineOfSight(p.x, p.z, x, z)) continue;
            const d = (x - p.x) ** 2 + (z - p.z) ** 2;
            if (d < bd) { bd = d; best = { x, z }; }
        }
        return best;
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
        if (--this.ammo <= 0) { this.cover = this._findCover(); this.reload = this.cover ? 2.6 : 1.8; }
        if (g.npcManager) g.npcManager.alertShot(p);                              // quem ouve, foge
    }

    // Levou um golpe/tiro brigando (NPC.hurt): cambaleia e continua — e quem bateu foi o jogador, se ele topa, a briga passa a ser com ele.
    // POSTURA (Posture, npc._postHit — posto pelo golpe em Combat._land; bala: NPC.takeDamage): acertado SEGURANDO o golpe = interrompido
    // (cancela, cambaleia 0,35 s); equilíbrio zerado por golpe leve = ATORDOADO (Config.posture.stun); no meio do golpe (já soltou) ele não
    // para — só um tranco curto (sem trocar dano parado: quem bate primeiro e bem vence).
    onHurt() {
        const npc = this.npc, g = npc.ctx.game, PH = npc._postHit;
        npc._postHit = null;
        if (this.windup > 0) {                                                            // interrompido: cambaleia e demora a tentar de novo
            this.windup = 0; this.pending = null; this.clip = null; this.clipW = null; this.attackT = 0; this.stagger = 0.35;
            this.cd = Math.max(this.cd, 0.9); this.interrupts = (this.interrupts || 0) + 1;
        }
        else if (PH && PH.broken && !PH.heavy) {
            this.stun = Config.posture.stun; this.stagger = 0; this.clip = null; this.clipW = null; this.attackT = 0;
        } else if (this.attackT > 0) this.stagger = 0;                                   // (no meio do golpe: segue)
        else { this.stagger = 0.15; this.clip = null; this.clipW = null; }
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
        if (this.stun > 0) return { clip: 'hurt', w: 'none', rate: 0.5 };                // atordoado: cambaleando devagar
        if (this.windup > 0 && this.clip) return { clip: this.clip, w: this.clipW || w, rate: 0 };      // segurando o golpe
        if (this.stagger > 0) return { clip: 'hurt', w: 'none', rate: 1 };
        if (this.clip) return { clip: this.clip, w: this.clipW || w, rate: 1 };
        if (speed > 0.5) return { clip: 'run', w, rate: Math.max(0.5, speed / Config.anim.run) };
        return { clip: 'idle', w, rate: 1 };
    }

    exit() { this.clip = null; this.windup = 0; this.pending = null; FightState.live.delete(this); }

    // Rendição (moral baixa contra arma de fogo): mãos ao alto — e, passado o susto, foge.
    _yield() {
        const npc = this.npc;
        this.clip = null; this.windup = 0;
        if (typeof Bubbles !== 'undefined') Bubbles.say(npc, ['Tá bom, tá bom! Perdi!', 'Calma! Não atira!', 'Deixa eu ir, por favor!'][Math.floor(Math.random() * 3)], { tone: 'scared', ms: 2400 });
        npc.threat.set(this.foe.position.x, 0, this.foe.position.z);
        npc.fsm.setState(new YieldState(npc, this.foe));
    }
}

// --- RENDIDO na briga (moral baixa contra arma de fogo): mãos ao alto/ajoelhado; quando o jogador se afasta ou passa o susto, foge.
class YieldState extends SurrenderState {
    constructor(npc, foe) { super(npc); this.foe = foe; }
    update(dt) {
        super.update(dt);
        const f = this.foe, p = this.npc.position, d = f ? hypot(f.position.x - p.x, f.position.z - p.z) : 99;
        if (this.t > 9 || d > 16) this.npc.panic(f ? f.position : this.npc.threat, true);
    }
}
