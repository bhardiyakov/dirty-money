// ============================================================================
// Chaos — A RUA COM VIDA PRÓPRIA: os pedestres interagem ENTRE SI perto do jogador (Config.chaos) e as cenas se encadeiam sozinhas.
//   • ESBARRÃO: dois andando se trombam → "foi mal"… ou bate-boca (param, se encaram, discutem) e, se um deles é de briga (Temper) ou
//     está bêbado, porrada. O jogador correndo também tromba: o pedestre reclama e às vezes cai.
//   • RODA: toda briga (pedestre × pedestre, ou com você) junta gente em volta — uns gritando "porrada!", outros filmando com o
//     celular, outros pedindo para parar; às vezes um da roda ENTRA na briga. Polícia chegando perto: a roda se desfaz.
//   • DOMINÓ: na correria (pânico), quem foge e tromba em alguém parado o derruba (e às vezes cai junto).
//   • FIGURAS (de tempos em tempos, uma por vez, perto de você):
//       bêbado     (mais à noite) anda torto em zigue-zague, fala sozinho, puxa assunto com você, tromba e briga mais, capota e dorme;
//       dança      alguém começa a dançar no meio da rua — quem está perto entra (vira roda de dança) e outros param para filmar;
//       desmaio    alguém cai duro: junta gente em volta, um se ajoelha para ajudar; ele levanta depois;
//       dinheiro   alguém deixa cair um maço — as notas espalham no chão e todo mundo corre para pegar (você também pode); dois
//                  na mesma nota às vezes saem no tapa.
// As cenas vivem em estados de NPC próprios (WATCH, ARGUE, DANCE, DRUNK, FAINT, GRAB) com pose() e faceTo() (NPC.update); qualquer susto
// (npc.panic) ou golpe as interrompe — e a cena seguinte nasce do que sobrou (a roda vira correria, a correria derruba gente…).
// ============================================================================

// --- base: vai até um ponto (opcional) e fica; volta a perambular no fim ---------------------------------------------------------
class ChaosState {
    constructor(npc, name) { this.npc = npc; this.name = name; this.t = 0; }
    _go(x, z, speed) {
        const n = this.npc, p = n.nav.closestPoint(new BABYLON.Vector3(x, 0, z));
        n.setSpeed(speed);
        n.gotoTarget(p);
        this._dest = p;
    }
    _arrived(r = 1.1) { return !this._dest || this.npc.distanceToTarget() < r; }
    _done() { const n = this.npc; if (n.alive && n.fsm.current === this) { n.setSpeed(Config.npc.wanderSpeed); n.afterPanic ? n.afterPanic() : n.toWander(); } }
    _say(lines, ms = 2200, tone) { if (typeof Bubbles !== 'undefined') Bubbles.say(this.npc, lines[Math.floor(Math.random() * lines.length)], { ms, tone, key: 'chaos' + this.npc.id }); }
    _walkPose(speed) { return speed > 3 ? { clip: 'run', rate: Math.max(0.5, speed / Config.anim.run) } : { clip: 'walk', rate: Math.max(0.5, speed / Config.anim.walk) }; }
    exit() { this.npc.setSpeed(Config.npc.wanderSpeed); if (this.npc._ring === this.ring) this.npc._ring = null; }
}

// Na roda: vai até o lugar dele em volta e assiste — torcendo, filmando, preocupado ou (o de perto) ajoelhado ajudando.
class ChaosWatchState extends ChaosState {
    constructor(npc, ring, slot, mode) { super(npc, 'WATCH'); this.ring = ring; this.slot = slot; this.mode = mode; this.sayT = 1 + Math.random() * 3; }
    enter() { const s = this.ring.slotAt(this.slot); this._go(s.x, s.z, Config.npc.hurrySpeed); this.npc._ring = this.ring; }
    update(dt) {
        this.t += dt;
        const c = this.ring.center();
        if (!c || this.t > 50) { this._done(); return; }
        // chegou na roda (no lugar dele ou já na beirada — os outros empurram): para e assiste; a briga andou para longe: vai atrás
        const p = this.npc.position, dc = Math.hypot(c.x - p.x, c.z - p.z), edge = this.slot === -1 ? 1.6 : this.ring.r + 1.3;
        if (this.still) { if (dc > edge + 2.5) { this.still = false; this._reT = 0; } else this.npc.setSpeed(0); }
        else if (this._arrived(1.2) || dc <= edge || this.t > 10) { this.still = true; this.npc.setSpeed(0); this.npc.gotoTarget(this.npc.position.clone()); }
        else if ((this._reT = (this._reT || 0) - dt) <= 0) { this._reT = 1.5; const s = this.ring.slotAt(this.slot); this._go(s.x, s.z, Config.npc.hurrySpeed); }      // (a briga anda: a roda acompanha)
        if ((this.sayT -= dt) <= 0) { this.sayT = 3 + Math.random() * 5; this._say(Chaos.LINES[this.ring.kind + '_' + this.mode] || Chaos.LINES[this.mode] || ['…'], 2000, this.mode === 'cheer' ? 'shout' : undefined); }
    }
    faceTo() { return this.ring.center(); }
    pose(speed) {
        if (speed >= 0.5) return this._walkPose(speed);
        return this.mode === 'cheer' ? { clip: 'cheer' } : this.mode === 'film' ? { clip: 'phone' } : this.mode === 'help' ? { clip: 'kneel' } : { clip: 'idle' };
    }
}

// Bate-boca: os dois param, se encaram e discutem; no fim seguem — ou saem no braço.
class ChaosArgueState extends ChaosState {
    constructor(npc, other, dur, lines, fight) { super(npc, 'ARGUE'); this.other = other; this.dur = dur; this.lines = lines; this.fight = fight; this.sayT = Math.random() * 1.2; }
    enter() { this.npc.setSpeed(0); }
    update(dt) {
        this.t += dt;
        const o = this.other;
        if (!o.alive || o.rag) { this._done(); return; }
        if ((this.sayT -= dt) <= 0) { this.sayT = 1.6 + Math.random() * 1.2; this._say(this.lines, 1600, 'angry'); }
        if (this.t < this.dur) return;
        if (this.fight && o.alive && !o.rag) { Chaos.fight(this.npc, o); return; }
        this._done();
    }
    faceTo() { return this.other.position; }
    pose(speed) { return speed >= 0.5 ? this._walkPose(speed) : { clip: this.t % 2.4 < 0.9 ? 'idle_look' : 'idle' }; }
}

// Dança: parado no lugar (ou chega perto de quem começou) e dança até cansar.
class ChaosDanceState extends ChaosState {
    constructor(npc, ring, dur, near) { super(npc, 'DANCE'); this.ring = ring; this.dur = dur; this.near = near; this.sayT = 0.5 + Math.random() * 2; }
    enter() {
        this.npc._ring = this.ring;
        if (this.near) { const a = Math.random() * Math.PI * 2, c = this.ring.center(); this._go(c.x + Math.cos(a) * 1.8, c.z + Math.sin(a) * 1.8, Config.npc.hurrySpeed); }
        else this.npc.setSpeed(0);
    }
    update(dt) {
        this.t += dt;
        if (this.t > this.dur) { this._say(['Ufa! Cansei.', 'Que onda!', 'Valeu, galera!']); this._done(); return; }
        if (this._arrived(1)) this.npc.setSpeed(0);
        if ((this.sayT -= dt) <= 0) { this.sayT = 4 + Math.random() * 5; this._say(Chaos.LINES.dance, 1800); }
    }
    faceTo() { return this.near ? this.ring.center() : null; }
    pose(speed) { return speed >= 0.5 ? this._walkPose(speed) : { clip: 'dance' }; }
}

// Bêbado: zigue-zague devagar, fala sozinho, às vezes vem atrás de você; tromba e briga mais; capota e dorme.
class ChaosDrunkState extends ChaosState {
    constructor(npc, life) { super(npc, 'DRUNK'); this.life = life; this.stepT = 0; this.sayT = 2 + Math.random() * 4; }
    enter() { this.npc._drunk = true; this.npc.setSpeed(Config.npc.wanderSpeed * 0.7); }
    exit() { super.exit(); this.npc._drunk = false; }
    update(dt) {
        this.t += dt;
        const n = this.npc, D = Config.chaos.drunk, g = Chaos.game;
        if (this.t > this.life) { this._say(['Vou pra casa… acho.', '*hic* Tchau, amigão.']); this._done(); return; }
        if ((this.sayT -= dt) <= 0) { this.sayT = 5 + Math.random() * 6; this._say(Chaos.LINES.drunk, 2400); }
        if ((this.stepT -= dt) > 0) return;
        this.stepT = 1.4 + Math.random() * 1.2;
        if (Math.random() < D.fall * 0.25) { n.fsm.setState(new ChaosFaintState(n, null, 14 + Math.random() * 10, true)); return; }      // (capotou na calçada)
        const P = g && g.player ? g.player.position : null, toP = P ? Math.hypot(P.x - n.position.x, P.z - n.position.z) : 99;
        let a = n.heading + (Math.random() - 0.5) * 2.4;
        if (P && toP < 9 && toP > 1.6 && Math.random() < 0.5) { a = Math.atan2(P.x - n.position.x, P.z - n.position.z); if (Math.random() < 0.4) this._say(['Ô amigão! Me paga uma?', 'Você é gente boa, sabia?', 'Ei… ei… escuta aqui…']); }
        const d = 4 + Math.random() * 5;
        this._go(n.position.x + Math.sin(a) * d, n.position.z + Math.cos(a) * d, Config.npc.wanderSpeed * 0.7);
    }
    pose(speed) { return speed >= 0.5 ? { clip: 'walk_drunk', rate: Math.max(0.5, speed / (Config.anim.walk * NPC.GAIT_K.walk_drunk)), fb: 'walk' } : { clip: 'idle' }; }
}

// Desmaio (ou o bêbado dormindo na calçada): cai, fica deitado, levanta.
class ChaosFaintState extends ChaosState {
    constructor(npc, ring, dur, drunk = false) { super(npc, 'FAINT'); this.ring = ring; this.dur = dur; this.drunk = drunk; }
    enter() { this.npc.setSpeed(0); this.phase = 'fall'; this.npc._ring = this.ring; }
    update(dt) {
        this.t += dt;
        if (this.phase === 'fall' && this.t > 0.45) this.phase = 'down';
        if (this.phase === 'down' && this.t > this.dur) { this.phase = 'up'; this.upT = 0; }
        if (this.phase === 'up' && (this.upT += dt) > 1.1) {
            this._say(this.drunk ? ['Hã? Que horas são?', 'Eu tô ótimo… *hic*'] : ['Tô bem, tô bem… foi a pressão.', 'Nossa, apaguei. Obrigado, gente.']);
            if (this.drunk) { this.npc.fsm.setState(new ChaosDrunkState(this.npc, 30 + Math.random() * 30)); return; }
            this._done();
        }
    }
    get down() { return this.phase !== 'up'; }
    pose() { return this.phase === 'fall' ? { clip: 'hurt_b', fb: 'hurt' } : this.phase === 'up' ? { clip: 'getup', fb: 'idle' } : { clip: 'lie', fb: 'idle' }; }
}

// Dinheiro voando: corre de nota em nota e pega antes dos outros (e de você).
class ChaosGrabState extends ChaosState {
    constructor(npc, ev) { super(npc, 'GRAB'); this.ev = ev; this.item = null; }
    enter() { this._next(); }
    _next() {
        const n = this.npc, L = this.ev.items.filter((it) => Chaos.alive(it));
        if (!L.length || this.t > 35) { this._say(['Ah, acabou…', 'Droga!', 'Peguei nada!']); this._done(); return; }
        L.sort((a, b) => Math.hypot(a.x - n.position.x, a.z - n.position.z) - Math.hypot(b.x - n.position.x, b.z - n.position.z));
        this.item = L[Math.random() < 0.75 ? 0 : Math.min(1, L.length - 1)];
        this._go(this.item.x, this.item.z, Config.npc.fleeSpeed * 0.85);
    }
    update(dt) {
        this.t += dt;
        const n = this.npc, it = this.item;
        if (!it || !Chaos.alive(it)) { this._next(); return; }
        if (Math.hypot(it.x - n.position.x, it.z - n.position.z) > 1.1) return;
        // chegou: outro chegando junto? às vezes sai no tapa
        const rival = this.ev.grabbers.find((o) => o !== n && o.alive && o.fsm.current && o.fsm.current.item === it && Math.hypot(o.position.x - n.position.x, o.position.z - n.position.z) < 1.8);
        if (rival && Math.random() < 0.3) { Chaos.stats.grabFights++; this._say(['Larga! É MEU!', 'Eu vi primeiro!']); Chaos.fight(n, rival); return; }
        Chaos.take(it);
        Chaos.stats.grabs++;
        this._say(['É meu!', 'Achei!', 'Hoje é meu dia!', 'Opa!']);
        this._next();
    }
    pose(speed) { return speed >= 0.5 ? this._walkPose(speed) : { clip: 'pick', fb: 'idle' }; }
}

const Chaos = {
    game: null,
    rings: [],
    cash: null,
    _bumpCd: 0, _domCd: 0, _scanT: 0, _figT: 20, _bumpT: 0, _domT: 0, _pbT: 0,
    stats: { bumps: 0, sorry: 0, argues: 0, fights: 0, rings: 0, joins: 0, dominos: 0, drunks: 0, dances: 0, faints: 0, cash: 0, grabs: 0, grabFights: 0, playerBumps: 0 },

    LINES: {
        cheer: ['PORRADA!', 'Bate nele!', 'Vai, vai, vai!', 'Uuuuh!', 'Briga! Briga!', 'Não deixa barato!'],
        film: ['Filma, filma!', 'Isso vai viralizar…', '📱 gravando…', 'Pega o ângulo!'],
        worried: ['Alguém separa isso!', 'Chama a polícia!', 'Meu Deus…', 'Para com isso, gente!'],
        dance_cheer: ['Uhuu! Dança!', 'Solta o som!', 'Aí sim!'], dance_film: ['Olha isso! 📱', 'Tá gravando?'], dance_worried: ['Gente doida…', 'Hahaha!'],
        faint_film: ['Ele tá bem?', '📱 …'], faint_worried: ['Alguém chama a ambulância!', 'Ele tá respirando?', 'Dá espaço, gente!'], faint_help: ['Moço? Moço! Tá me ouvindo?', 'Respira…'],
        dance: ['♪ Uhuu! ♪', '♪ Lá-lá-lá ♪', 'Vem dançar!', '♪ Ô-ô-ô ♪'],
        drunk: ['*hic*', 'Eu te amo, cara!', 'Ninguém me entende…', '♪ Lá lá lá… ♪', 'Cadê meu chinelo?', 'Mais uma, garçom!'],
        sorry: ['Foi mal!', 'Desculpa aí.', 'Opa, perdão.', 'Ih, foi mal.'],
        argue: ['Olha por onde anda!', 'Tá cego?!', 'Qual é a tua?!', 'Esbarrou e nem pede desculpa?!', 'Vai encarar?!', 'Respeita!'],
        bumped: ['Ô! Olha por onde anda!', 'Calma aí, apressadinho!', 'Ai! Grosso!'],
    },

    // ------------------------------------------------------------------ ajudantes
    _calm(n) { return n.alive && !n.rag && !n.free && n.index >= 0 && n.fsm && n.fsm.name === 'WANDER' && n.actor && !n.thief && !n.witness && !n.mugger && !n._rage && !n._ring; },
    _near(P, n, R) { return Math.abs(n.position.x - P.x) < R && Math.abs(n.position.z - P.z) < R && Math.hypot(n.position.x - P.x, n.position.z - P.z) < R; },
    _vel(n) { return n.index >= 0 ? n.nav.crowd.getAgentVelocity(n.index) : null; },
    alive(it) { const P = this.game && this.game.pickups; return !!(P && it && P.items.includes(it) && it.active !== false); },
    take(it) { const P = this.game.pickups, i = P.items.indexOf(it); if (i >= 0) P._remove(i); },
    fight(a, b) {
        if (!a.alive || !b.alive || a.rag || b.rag || typeof FightState === 'undefined') return;
        a.fsm.setState(new FightState(a, b)); b.fsm.setState(new FightState(b, a));
        this.stats.fights++;
    },
    fighter(n) { try { return !!(typeof Temper !== 'undefined' && Temper.profile(n, this.game).fighter); } catch (e) { return false; } },

    // Uma roda em volta de algo (center() = onde é a cena, ou null quando acabou): os lugares em volta, igualmente espaçados.
    _ring(kind, center, n0) {
        const C = Config.chaos.ring, r = C.r[0] + Math.random() * (C.r[1] - C.r[0]), a0 = Math.random() * Math.PI * 2;
        const ring = {
            kind, center, members: new Set(), watchers: new Set(), r, n: 0,
            slotAt(i) { const c = center() || { x: 0, z: 0 }, a = a0 + i * (Math.PI * 2 / Math.max(5, ring.n)), rr = i === -1 ? 1.0 : r; return { x: c.x + Math.cos(i === -1 ? a0 : a) * rr, z: c.z + Math.sin(i === -1 ? a0 : a) * rr }; },
        };
        if (n0) ring.members.add(n0);
        this.rings.push(ring);
        return ring;
    },
    // Chama gente para a roda: os calmos mais perto (até `max`), cada um com o seu jeito de assistir.
    _gather(ring, P0, max, modes) {
        const C = Config.chaos.ring, c = ring.center();
        if (!c) return 0;
        const L = this.game.npcManager.npcs.filter((n) => this._calm(n) && this._near(c, n, C.from) && !ring.members.has(n))
            .sort((a, b) => Math.hypot(a.position.x - c.x, a.position.z - c.z) - Math.hypot(b.position.x - c.x, b.position.z - c.z)).slice(0, max);
        ring.n = Math.max(ring.n, L.length);
        L.forEach((n, i) => {
            const mode = i === 0 && modes[0] === 'help' ? 'help' : modes[Math.floor(Math.random() * modes.length)];      // (o primeiro que chega ajuda, se a cena pede)
            n.fsm.setState(new ChaosWatchState(n, ring, mode === 'help' ? -1 : i, mode));
            ring.watchers.add(n);
        });
        return L.length;
    },

    // ------------------------------------------------------------------ quadro
    update(g, dt) {
        this.game = g;
        if (!g.npcManager || !g.aiReady || g.mode === 'heli' || (typeof Interiors !== 'undefined' && Interiors.active)) return;
        const P = g._playerState().pos;
        if ((this._scanT -= dt) <= 0) { this._scanT = 1; this._fights(g, P); this._cleanRings(g); }
        if ((this._bumpT -= dt) <= 0) { this._bumpT = 0.35; this._bumps(g, P); }
        if ((this._domT -= dt) <= 0) { this._domT = 0.15; this._domino(g, P); }
        this._bumpCd -= dt; this._domCd -= dt;
        if (g.mode === 'player') this._playerBump(g, dt);
        if ((this._figT -= dt) <= 0) { const E = Config.chaos.every; this._figT = E[0] + Math.random() * (E[1] - E[0]); this._figure(g, P); }
        if (this.cash) this._cashTick(g, dt);
    },

    // Brigas perto de você (entre pedestres ou com você) ganham roda; às vezes alguém da roda entra na briga.
    _fights(g, P) {
        const R = Config.chaos.radius;
        for (const n of g.npcManager.npcs) {
            if (!n.alive || n.rag || n.fsm.name !== 'FIGHT' || n._ring || !this._near(P, n, R)) continue;
            const foe = n.fsm.current.foe;
            const ring = this._ring('fight', () => {
                const pts = [...ring.members].filter((m) => m.alive && !m.rag && m.fsm && m.fsm.name === 'FIGHT');
                if (!pts.length) return null;
                let x = 0, z = 0;
                for (const m of pts) { x += m.position.x; z += m.position.z; }
                return { x: x / pts.length, z: z / pts.length };
            }, n);
            n._ring = ring;
            if (foe && foe !== g.player && foe.fsm) { ring.members.add(foe); foe._ring = ring; }
            const k = this._gather(ring, P, Config.chaos.ring.max, ['cheer', 'cheer', 'film', 'film', 'worried']);
            if (k) this.stats.rings++;
        }
        // a polícia chegou perto de uma roda: todo mundo vaza; e de vez em quando um da roda entra na briga
        const pm = g.policeManager;
        for (const ring of this.rings) {
            const c = ring.center();
            if (!c || ring.kind !== 'fight') continue;
            if (pm && pm.units.some((u) => Math.hypot(u.position.x - c.x, u.position.z - c.z) < 22)) {
                for (const w of ring.watchers) if (w.alive && w.fsm.current && w.fsm.current.ring === ring) w.panic(new BABYLON.Vector3(c.x, 0, c.z), true);
                continue;
            }
            if (ring.joined || Math.random() > Config.chaos.ring.join) continue;
            const W = [...ring.watchers].filter((w) => w.alive && w.fsm.current && w.fsm.current.ring === ring && w.fsm.current.mode === 'cheer' && this.fighter(w));
            const F = [...ring.members].filter((m) => m.alive && m.fsm.name === 'FIGHT');
            if (!W.length || !F.length) continue;
            const w = W[0], f = F[Math.floor(Math.random() * F.length)], target = f.fsm.current.foe || f;
            ring.joined = true;
            ring.members.add(w);
            if (typeof Bubbles !== 'undefined') Bubbles.say(w, 'Ninguém bate no meu parceiro!', { tone: 'angry', ms: 2200 });
            w.fsm.setState(new FightState(w, target));
            this.stats.joins++;
        }
    },
    _cleanRings(g) {
        for (let i = this.rings.length - 1; i >= 0; i--) {
            const R = this.rings[i];
            if (R.center()) continue;
            for (const m of R.members) if (m._ring === R) m._ring = null;
            this.rings.splice(i, 1);
        }
    },

    // Dois andando se trombam: desculpa, bate-boca ou briga.
    _bumps(g, P) {
        if (this._bumpCd > 0) return;
        const C = Config.chaos, L = [];
        for (const n of g.npcManager.npcs) {
            if (!n.alive || n.rag || n.free || n.index < 0 || !this._near(P, n, C.radius)) continue;
            if (!(n.fsm.name === 'WANDER' || n.fsm.name === 'DRUNK') || n._ring || (n._bumpAt || 0) > performance.now()) continue;
            const v = this._vel(n); if (!v || v.x * v.x + v.z * v.z < 0.36) continue;
            L.push([n, v]);
        }
        for (let i = 0; i < L.length; i++) {
            const [a, va] = L[i];
            for (let j = i + 1; j < L.length; j++) {
                const [b, vb] = L[j], dx = b.position.x - a.position.x, dz = b.position.z - a.position.z, d = Math.hypot(dx, dz);
                if (d > C.bumpR || d < 0.05) continue;
                if ((vb.x - va.x) * dx + (vb.z - va.z) * dz > 0) continue;          // (se afastando: já passou)
                this._bump(g, a, b);
                return;
            }
        }
    },
    _bump(g, a, b) {
        const C = Config.chaos, now = performance.now();
        a._bumpAt = b._bumpAt = now + 20000;
        this._bumpCd = C.bumpCd;
        this.stats.bumps++;
        const r = Math.random(), drunk = a._drunk || b._drunk, angry = this.fighter(a) || this.fighter(b) || drunk;
        const fightK = drunk ? C.drunk.fight : 1 - C.bump.sorry - C.bump.argue;
        if (r < C.bump.sorry && !drunk) {
            this.stats.sorry++;
            if (typeof Bubbles !== 'undefined') { Bubbles.say(a, this.LINES.sorry[Math.floor(Math.random() * 4)], { ms: 1600 }); setTimeout(() => b.alive && Bubbles.say(b, 'Tranquilo.', { ms: 1400 }), 700); }
            return;
        }
        this.stats.argues++;
        const fight = angry && Math.random() < fightK + 0.25;
        const dur = 2.6 + Math.random() * 2;
        a.fsm.setState(new ChaosArgueState(a, b, dur, this.LINES.argue, fight));
        b.fsm.setState(new ChaosArgueState(b, a, dur + 0.2, this.LINES.argue, false));
    },

    // Você correndo trombando num pedestre: ele reclama — e às vezes cai.
    _playerBump(g, dt) {
        if ((this._pbT -= dt) > 0) return;
        this._pbT = 0.2;
        const p = g.player, sp = p.speed || 0;
        if (sp < Config.player.jogSpeed * 1.15 || p.rag || p.crouched) return;
        const P = p.position;
        for (const n of g.npcManager.npcs) {
            if (!n.alive || n.rag || n.free || n.index < 0 || (n._bumpAt || 0) > performance.now()) continue;
            const dx = n.position.x - P.x, dz = n.position.z - P.z;
            if (Math.abs(dx) > 1.1 || Math.abs(dz) > 1.1 || Math.hypot(dx, dz) > 0.95) continue;
            n._bumpAt = performance.now() + 8000;
            this.stats.playerBumps++;
            const h = p.root.rotation.y;
            if (Math.random() < 0.3 && n.ragdoll) n.ragdoll({ x: P.x, z: P.z }, { dx: Math.sin(h), dz: Math.cos(h), power: Config.ragdoll.minPower + 0.8 }, false);
            else if (typeof Bubbles !== 'undefined') Bubbles.say(n, this.LINES.bumped[Math.floor(Math.random() * this.LINES.bumped.length)], { tone: 'angry', ms: 1800 });
            return;
        }
    },

    // Na correria: quem foge derruba quem está parado no caminho (e às vezes cai junto).
    _domino(g, P) {
        if (this._domCd > 0) return;
        const C = Config.chaos, D = C.domino;
        for (const r of g.npcManager.npcs) {
            if (!r.alive || r.rag || r.fsm.name !== 'FLEE' || r.index < 0 || !this._near(P, r, C.radius)) continue;
            const v = this._vel(r); if (!v || v.x * v.x + v.z * v.z < 9) continue;
            const sp = Math.hypot(v.x, v.z), ux = v.x / sp, uz = v.z / sp;
            for (const n of g.npcManager.npcs) {
                if (n === r || !n.alive || n.rag || n.free || n.fsm.name === 'FLEE' || n.fsm.name === 'FIGHT') continue;
                const dx = n.position.x - r.position.x, dz = n.position.z - r.position.z;
                if (Math.abs(dx) > D.r || Math.abs(dz) > D.r || Math.hypot(dx, dz) > D.r || dx * ux + dz * uz < 0) continue;      // (à frente de quem corre)
                if (Math.random() > D.chance) continue;
                this._domCd = D.cd;
                this.stats.dominos++;
                if (n.ragdoll) n.ragdoll({ x: r.position.x, z: r.position.z }, { dx: ux, dz: uz, power: Config.ragdoll.minPower + 1.2 }, false);
                if (Math.random() < 0.3 && r.ragdoll) r.ragdoll({ x: n.position.x, z: n.position.z }, { dx: ux, dz: uz, power: Config.ragdoll.minPower + 0.6 }, false);
                if (typeof Bubbles !== 'undefined') Bubbles.say(n, 'AI!', { tone: 'shout', ms: 1200 });
                return;
            }
        }
    },

    // ------------------------------------------------------------------ figuras
    _figure(g, P) {
        if (g.mode !== 'player' || g.wanted.level > 0) return;
        const C = Config.chaos, h = g.dayNight ? g.dayNight.hour : 12, rain = typeof Weather !== 'undefined' && Weather.cur ? Weather.cur.k : 0;
        const night = h >= 20 || h < 4, drunks = g.npcManager.npcs.filter((n) => n.alive && n._drunk).length;
        const opts = [];
        if (drunks < C.drunk.max) opts.push(['drunk', night ? 3 : 0.6]);
        if (rain < 0.3 && !this.rings.some((r) => r.kind === 'dance')) opts.push(['dance', 2.5]);
        if (!this.rings.some((r) => r.kind === 'faint')) opts.push(['faint', 1.2]);
        if (!this.cash) opts.push(['cash', 1.4]);
        let s = Math.random() * opts.reduce((a, o) => a + o[1], 0), kind = null;
        for (const [k, w] of opts) { if ((s -= w) <= 0) { kind = k; break; } }
        if (kind) this.start(kind);
    },
    // Começa uma figura agora (perto de você). Devolve o pedestre (ou null se não deu).
    start(kind, who = null) {
        const g = this.game, P = g._playerState().pos, C = Config.chaos;
        const L = g.npcManager.npcs.filter((n) => this._calm(n) && this._near(P, n, 38) && Math.hypot(n.position.x - P.x, n.position.z - P.z) > 6);
        // quem tem gente em volta (a cena precisa de plateia): de uma amostra, o com mais vizinhos calmos (um pouco de sorte no meio)
        let n = who, bs = -1;
        if (!n) for (const m of L.sort(() => Math.random() - 0.5).slice(0, 14)) {
            const k = g.npcManager.npcs.filter((o) => o !== m && this._calm(o) && Math.abs(o.position.x - m.position.x) < 22 && Math.abs(o.position.z - m.position.z) < 22).length + Math.random() * 0.8;
            if (k > bs) { bs = k; n = m; }
        }
        if (!n) return null;
        if (kind === 'drunk') {
            n.fsm.setState(new ChaosDrunkState(n, C.drunk.life[0] + Math.random() * (C.drunk.life[1] - C.drunk.life[0])));
            this.stats.drunks++;
            return n;
        }
        if (kind === 'dance') {
            const D = C.dance, ring = this._ring('dance', () => (n.alive && n.fsm.name === 'DANCE' ? { x: n.position.x, z: n.position.z } : null), n);
            n.fsm.setState(new ChaosDanceState(n, ring, D.life[0] + Math.random() * (D.life[1] - D.life[0]), false));
            if (typeof Bubbles !== 'undefined') Bubbles.say(n, '♪ Ninguém segura! ♪', { ms: 2200 });
            let k = 0;
            for (const m of g.npcManager.npcs) {
                if (k >= D.maxJoin || m === n || !this._calm(m) || Math.hypot(m.position.x - n.position.x, m.position.z - n.position.z) > D.r || Math.random() > D.join) continue;
                m.fsm.setState(new ChaosDanceState(m, ring, D.life[0] * 0.7 + Math.random() * 8, true)); ring.members.add(m); k++;
            }
            this._gather(ring, P, 3, ['film', 'film', 'cheer', 'worried']);
            this.stats.dances++;
            return n;
        }
        if (kind === 'faint') {
            const F = C.faint, ring = this._ring('faint', () => (n.alive && n.fsm.current instanceof ChaosFaintState && n.fsm.current.down ? { x: n.position.x, z: n.position.z } : null), n);
            n.fsm.setState(new ChaosFaintState(n, ring, F.life[0] + Math.random() * (F.life[1] - F.life[0])));
            if (typeof Bubbles !== 'undefined') Bubbles.say(n, 'Ai… tô tonto…', { ms: 1400 });
            this._gather(ring, P, 4, ['help', 'worried', 'worried', 'film']);
            this.stats.faints++;
            return n;
        }
        if (kind === 'cash') {
            const K = C.cash, pk = g.pickups;
            if (!pk) return null;
            const items = [], nn = K.notes[0] + Math.floor(Math.random() * (K.notes[1] - K.notes[0] + 1));
            for (let i = 0; i < nn; i++) {
                const a = Math.random() * Math.PI * 2, r = 0.8 + Math.random() * 2.6, p = n.nav.closestPoint(new BABYLON.Vector3(n.position.x + Math.cos(a) * r, 0, n.position.z + Math.sin(a) * r));
                const it = pk.drop('cash', { x: p.x, z: p.z }, K.amount[0] + Math.floor(Math.random() * (K.amount[1] - K.amount[0])));
                if (it) items.push(it);
            }
            if (!items.length) return null;
            const ev = this.cash = { items, grabbers: [], t: 0, owner: n };
            if (typeof Bubbles !== 'undefined') Bubbles.say(n, 'MEU DINHEIRO!!! Devolve!', { tone: 'shout', ms: 2600 });
            const G = g.npcManager.npcs.filter((m) => this._calm(m) && Math.hypot(m.position.x - n.position.x, m.position.z - n.position.z) < K.r)
                .sort((a, b) => Math.hypot(a.position.x - n.position.x, a.position.z - n.position.z) - Math.hypot(b.position.x - n.position.x, b.position.z - n.position.z)).slice(0, K.grabbers);
            for (const m of [n].concat(G)) { m.fsm.setState(new ChaosGrabState(m, ev)); ev.grabbers.push(m); }
            if (Math.hypot(n.position.x - P.x, n.position.z - P.z) < 45) g._flash('💸 Dinheiro voando! Corre que dá para pegar');
            this.stats.cash++;
            return n;
        }
        return null;
    },
    _cashTick(g, dt) {
        const E = this.cash;
        E.t += dt;
        if (E.t > 40 || !E.items.some((it) => this.alive(it))) this.cash = null;
    },
};
