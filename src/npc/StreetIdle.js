// ============================================================================
// StreetIdle — a rua CALMA e espontânea: em vez de só perambular, o pedestre às vezes
//   • SENTA num banco (praça, parque, os bancos dos bairros) por um tempo — mexendo no celular, olhando o movimento;
//   • vai ao PONTO DE ÔNIBUS: senta no banco do abrigo (2 lugares) ou espera em pé ao lado da placa; quando o ônibus para
//     (Buses.onArrive), anda até a porta e EMBARCA (some — reaparece longe, outra pessoa);
//   • para numa RODINHA DE CONVERSA com quem está passando perto (2–3 pessoas, viradas umas para as outras, falando);
//   • MENDIGOS: sentados/ajoelhados no chão encostados numa parede do centro, do comércio e da periferia (favela, porto, indústria),
//     pedindo uma moeda a quem passa. E perto: dá R$ 5 (boa ação no bairro).
// Quem está assim não perambula: um susto (tiro, briga, polícia) acaba com tudo — levanta e foge como qualquer um (NPC.panic).
// Chamado por WanderState._pickNewTarget (maybe) e pelo Game (update, prompt, interact).
// ============================================================================

const StreetIdle = {
    seats: null,                 // [{ x, z, h, kind: 'bench'|'stop', stop?, by: npc|null }]
    stats: { sit: 0, bus: 0, chat: 0, beg: 0, boarded: 0, alms: 0 },
    beggars: [],
    _begT: 0,

    // ------------------------------------------------------------------ lugares para sentar
    _seatsBuild() {
        const nStops = (typeof Buses !== 'undefined' && Buses.stops && Buses.stops.length) || 0;
        if (this.seats && this._nStops === nStops) return this.seats;            // (os pontos de ônibus nascem depois do mapa: refaz quando chegam)
        this._nStops = nStops;
        const S = [], seat = (x, z, h, kind, stop) => S.push({ x, z, h, kind, stop: stop || null, by: null });
        for (const blk of (CityGrid.blocks || []).concat(CityGrid.extraBlocks || [])) {
            for (const p of blk.pieces || []) {
                if (p.kind !== 'bench') continue;
                let fx = p.fx, fz = p.fz;
                if (fx == null && fz == null) {                                  // (os bancos dos bairros: virados para o meio do quarteirão)
                    const r = blk.slab || [blk.x0, blk.z0, blk.x1, blk.z1], cx = (r[0] + r[2]) / 2, cz = (r[1] + r[3]) / 2;
                    fx = p.alongX ? 0 : Math.sign(cx - p.x) || 1; fz = p.alongX ? Math.sign(cz - p.z) || 1 : 0;
                }
                const h = Math.atan2(fx, fz);
                for (const o of [-0.5, 0.5]) seat(p.x + (p.alongX ? o : 0) + fx * 0.3, p.z + (p.alongX ? 0 : o) + fz * 0.3, h, 'bench');
            }
        }
        for (const st of (typeof Buses !== 'undefined' && Buses.stops) || []) {
            const c = Math.cos(st.h), s = Math.sin(st.h), W = (lx, lz) => ({ x: st.x + lx * c + lz * s, z: st.z - lx * s + lz * c });
            for (const lx of [-0.6, 0.6]) { const q = W(lx, -0.18); seat(q.x, q.z, st.h, 'stop', st); }
        }
        return (this.seats = S.filter((q) => NPC.offRoad(q.x, q.z) || q.kind === 'stop'));      // (banco nunca na pista; o do ponto fica na calçada)
    },
    seatNear(x, z, r, kind = null) {
        let best = null, bd = r * r;
        for (const s of this._seatsBuild()) {
            if (s.by || (kind && s.kind !== kind)) continue;
            const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
            if (d < bd) { bd = d; best = s; }
        }
        return best;
    },
    stopNear(x, z, r) {
        let best = null, bd = r * r;
        for (const st of (typeof Buses !== 'undefined' && Buses.stops) || []) {
            const d = (st.x - x) * (st.x - x) + (st.z - z) * (st.z - z);
            if (d < bd) { bd = d; best = st; }
        }
        return best;
    },

    // ------------------------------------------------------------------ começar uma ação (perambulando, ao escolher o próximo destino)
    _free(n) { return n.alive && !n.rag && !n.role && !n.party && !n.free && !n._rage && !n.mugger && !n.thief && n.index >= 0 && n.fsm.name === 'WANDER'; },
    maybe(npc) {
        if (!this._free(npc) || npc.beggar) return false;
        const now = performance.now() / 1000;
        if (npc._idleAt && now - npc._idleAt < 40) return false;                 // (acabou de fazer uma pausa)
        const g = window.game; if (!g || !g.dayNight) return false;
        const h = g.dayNight.hour, night = h >= 21.5 || h < 5.5, rain = typeof Weather !== 'undefined' && Weather.cur ? Weather.cur.k : 0, p = npc.position, r = Math.random();
        if (r < 0.12 && !night) {
            const st = this.stopNear(p.x, p.z, 45);
            if (st) { npc._idleAt = now; npc.fsm.setState(new BusWaitState(npc, st)); return true; }
        } else if (r < 0.26 && rain < 0.2 && !(night && h < 4)) {
            const s = this.seatNear(p.x, p.z, 35, 'bench');
            if (s) { npc._idleAt = now; npc.fsm.setState(new SitState(npc, s)); return true; }
        } else if (r < 0.38) {
            const M = g.npcManager, mates = [];
            for (const q of M.npcs) {
                if (q === npc || !this._free(q) || q.beggar) continue;
                if (hypot(q.position.x - p.x, q.position.z - p.z) < 7) { mates.push(q); if (mates.length >= 2) break; }
            }
            if (mates.length) {
                const G = [npc, ...mates.slice(0, Math.random() < 0.5 ? 1 : 2)], c = { x: 0, z: 0 };
                for (const q of G) { c.x += q.position.x / G.length; c.z += q.position.z / G.length; }
                if (!NPC.offRoad(c.x, c.z)) return false;                         // (rodinha nunca no meio da pista)
                const life = 18 + Math.random() * 30;
                G.forEach((q, i) => { q._idleAt = now; q.fsm.setState(new ChatState(q, G, c, i, life)); });
                this.stats.chat++;
                return true;
            }
        }
        return false;
    },

    // ------------------------------------------------------------------ ônibus: quem espera no ponto embarca
    onBus(bus, st) {
        const g = window.game; if (!g || !g.npcManager) return;
        for (const n of g.npcManager.npcs) {
            const S = n.fsm && n.fsm.current;
            if (S instanceof BusWaitState && S.stop === st && S.phase === 'wait' && hypot(n.position.x - st.x, n.position.z - st.z) < 9) S.board(bus);
        }
    },

    // ------------------------------------------------------------------ mendigos (alguns por perto no centro, no comércio e na periferia)
    update(game, dt) {
        this._begT -= dt;
        if (this._begT > 0 || !game.npcManager || !game.aiReady || (typeof Interiors !== 'undefined' && Interiors.active)) return;
        this._begT = 3;
        const M = game.npcManager, P = game.player.position;
        this.beggars = this.beggars.filter((n) => n.alive && n.beggar && n.fsm.name === 'BEG');
        for (const n of this.beggars.slice()) if (hypot(n.position.x - P.x, n.position.z - P.z) > Config.npc.recycleDist) { n.beggar = false; n.toWander(); this.beggars.splice(this.beggars.indexOf(n), 1); }
        const want = this.beggarsWant(P.x, P.z);
        if (this.beggars.length >= want) return;
        // um pedestre comum, longe da vista, vira mendigo num canto de parede (célula andável encostada em parede: o nav marca 2)
        const spare = M.npcs.find((n) => this._free(n) && !n.beggar && !(M._inView && M._inView(n.position.x, n.position.z)));
        if (!spare) return;
        const spot = this._wallSpot(game, P);
        if (!spot) return;
        if (!spare.relocate(spot.p, null, 'poor')) return;
        spare.beggar = true;
        spare.fsm.setState(new BegState(spare, spot.p, spot.h));
        this.beggars.push(spare); this.stats.beg++;
    },
    // Quantos mendigos por perto: centro e comércio 2, periferia (favela, porto, indústria) 3, o resto 0–1. Madrugada também (dormem).
    beggarsWant(x, z) {
        const b = typeof CityGrid !== 'undefined' && CityGrid._blockAtPoint(x, z), g = window.game;
        const d = g && g.empire && g.empire.districtAt ? g.empire.districtAt(x, z) : null, life = typeof Life !== 'undefined' ? Life.mul() : 1;
        let n = 0;
        if (d === 'favela' || d === 'periferia' || d === 'industrial' || d === 'porto' || (b && b.district === 'favela')) n = 3;
        else if (b && (b.biome === 'downtown' || b.biome === 'commercial' || b.biome === 'plaza')) n = 2;
        else if (b && b.biome === 'residential') n = 1;
        return Math.round(n * (0.5 + 0.5 * life));
    },
    // Um canto de calçada encostado numa parede (grid de navegação = 2), fora da tela, a 15–70 m.
    _wallSpot(game, P) {
        const nav = game.nav, M = game.npcManager;
        for (let k = 0; k < 60; k++) {
            const p = nav.randomWalkable(15, 70);
            if (!NPC.offRoad(p.x, p.z) || (M._inView && M._inView(p.x, p.z))) continue;
            const map = nav.map, i = Math.floor(p.x - nav.minX), j = Math.floor(p.z - nav.minZ);
            if (!map || map.grid[j * nav.w + i] !== 2) continue;
            // de costas para a parede: a direção da célula vizinha que não é andável
            let h = 0;
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!nav.walk(p.x + dx, p.z + dz)) { h = Math.atan2(-dx, -dz); break; }
            return { p, h };
        }
        return null;
    },

    // ------------------------------------------------------------------ dar uma moeda (E perto do mendigo)
    _beggarNear(game) {
        const P = game.player.position;
        let best = null, bd = 1.9 * 1.9;
        for (const n of this.beggars) { const d = (n.position.x - P.x) ** 2 + (n.position.z - P.z) ** 2; if (d < bd) { bd = d; best = n; } }
        return best;
    },
    prompt(game) {
        if (game.mode !== 'player') return '';
        const n = this._beggarNear(game);
        if (!n) return '';
        return n._given ? '' : `<b>E</b> dar uma moeda (R$ 5)<small>"Uma moedinha pra comer, por favor…"</small>`;
    },
    interact(game) {
        if (game.mode !== 'player') return false;
        const n = this._beggarNear(game);
        if (!n || n._given) return false;
        if (game.inventory.cash < 5) { game._flash('Sem trocado'); return true; }
        game.inventory.cash -= 5; n._given = true; this.stats.alms++;
        if (typeof Bubbles !== 'undefined') Bubbles.say(n, ['Deus te abençoe!', 'Obrigado, meu patrão!', 'Valeu, irmão. Que Deus te pague.'][Math.floor(Math.random() * 3)], { ms: 2600 });
        if (typeof WorldMemory !== 'undefined') WorldMemory.good(n.position.x, n.position.z, 0.5, 'esmola');
        if (typeof AudioFX !== 'undefined') AudioFX.blip(980, 0.08, 0.1);
        return true;
    },
};

// --- SIT: vai até o banco, senta (fora do crowd, como quem deita na praia) por 25–70 s e levanta. -----------------------------
class SitState {
    constructor(npc, seat) { this.npc = npc; this.name = 'SIT'; this.seat = seat; this.phase = 'go'; this.t = 0; this.life = 25 + Math.random() * 45; }
    enter() {
        const n = this.npc, s = this.seat;
        s.by = n; StreetIdle.stats.sit++;
        n.setSpeed(Config.npc.wanderSpeed);
        n.gotoTarget(n.nav.closestPoint(new BABYLON.Vector3(s.x, 0, s.z), 4));
    }
    update(dt) {
        const n = this.npc, s = this.seat;
        this.t += dt;
        if (this.phase === 'go') {
            if (n.trafficWait(dt)) return;
            if (hypot(n.position.x - s.x, n.position.z - s.z) < 1.3) this._sit();
            else if (this.t > 35) n.toWander();                                   // (não chegou: desiste)
        } else if (this.t > this.life) n.toWander();
    }
    _sit() {
        const n = this.npc, s = this.seat;
        n.enterFree();
        n.transform.position.set(s.x, 0, s.z);
        n.heading = s.h; n.transform.rotation.y = s.h;
        this.phase = 'sit'; this.t = 0;
        this.phone = Math.random() < 0.4;
    }
    anim() { return { clip: this.phone ? 'phone' : 'sit', rate: 1, fb: 'sit' }; }
    pose(speed) { return speed >= 0.5 ? { clip: 'walk', rate: Math.max(0.5, speed / Config.anim.walk) } : { clip: 'idle' }; }
    exit() { const n = this.npc; if (this.seat.by === n) this.seat.by = null; if (n.free) n.leaveFree(); }
}

// --- BUSWAIT: vai ao ponto; senta no banco do abrigo (se tiver lugar) ou espera em pé perto da placa. Embarca quando o ônibus para. --
class BusWaitState {
    constructor(npc, stop) { this.npc = npc; this.name = 'BUSWAIT'; this.stop = stop; this.phase = 'go'; this.t = 0; this.life = 50 + Math.random() * 70; this.seat = null; }
    enter() {
        const n = this.npc, st = this.stop;
        StreetIdle.stats.bus++;
        this.seat = StreetIdle.seatNear(st.x, st.z, 2.5, 'stop');
        if (this.seat) this.seat.by = n;
        const c = Math.cos(st.h), s = Math.sin(st.h), lx = 1.0 + Math.random() * 1.2, lz = 0.35 + Math.random() * 0.5;      // (em pé: ao lado do abrigo, virado para a rua)
        this.spot = this.seat ? { x: this.seat.x, z: this.seat.z } : { x: st.x + lx * c + lz * s, z: st.z - lx * s + lz * c };
        n.setSpeed(Config.npc.wanderSpeed);
        n.gotoTarget(n.nav.closestPoint(new BABYLON.Vector3(this.spot.x, 0, this.spot.z), 4));
    }
    update(dt) {
        const n = this.npc;
        this.t += dt;
        if (this.phase === 'go') {
            if (n.trafficWait(dt)) return;
            if (hypot(n.position.x - this.spot.x, n.position.z - this.spot.z) < 1.4) {
                this.phase = 'wait'; this.t = 0;
                if (this.seat) { n.enterFree(); n.transform.position.set(this.seat.x, 0, this.seat.z); n.heading = this.seat.h; n.transform.rotation.y = this.seat.h; }
                else n.setSpeed(0);
            } else if (this.t > 40) n.toWander();
        } else if (this.phase === 'wait') {
            if (this.t > this.life) n.toWander();                                // (cansou de esperar: vai a pé)
        } else if (this.phase === 'board') {
            const b = this.bus;
            if (!b || b.destroyed || this.t > 9) { n.toWander(); return; }
            if (hypot(n.position.x - b.position.x, n.position.z - b.position.z) < 3.2 || this.t > 6) {
                StreetIdle.stats.boarded++;                                       // entrou no ônibus: some daqui (reaparece longe, outra pessoa)
                const M = window.game.npcManager, R = M._ring(), P = M._hidden ? M._hidden(null, R[0], R[1]) : M._place(null, R[0], R[1]);
                n.relocate(P.pos, P.role, M._style(P.pos, P.role));
            }
        }
    }
    board(bus) {
        const n = this.npc;
        this.phase = 'board'; this.t = 0; this.bus = bus;
        if (n.free) n.leaveFree();
        if (this.seat && this.seat.by === n) this.seat.by = null;
        n.setSpeed(Config.npc.wanderSpeed * 1.1);
        n.gotoTarget(n.nav.closestPoint(new BABYLON.Vector3(bus.position.x, 0, bus.position.z), 6));
    }
    faceTo() { const st = this.stop; return this.phase === 'wait' && !this.seat ? { x: st.cx, z: st.cz } : null; }
    anim() { return { clip: this.look ? 'phone' : 'sit', rate: 1, fb: 'sit' }; }
    pose(speed) {
        if (speed >= 0.5) return { clip: 'walk', rate: Math.max(0.5, speed / Config.anim.walk) };
        return { clip: this.t % 9 < 4 ? 'idle_watch' : this.t % 9 < 6 ? 'phone' : 'idle', fb: 'idle' };
    }
    exit() { const n = this.npc; if (this.seat && this.seat.by === n) this.seat.by = null; if (n.free) n.leaveFree(); }
}

// --- CHAT: rodinha de conversa — param juntos, virados para o meio, e falam (balão) de vez em quando. -----------------------
class ChatState {
    constructor(npc, group, c, i, life) { this.npc = npc; this.name = 'CHAT'; this.group = group; this.c = c; this.i = i; this.life = life; this.t = 0; this.sayT = 1 + Math.random() * 4 + i * 2.5; }
    enter() {
        const n = this.npc, a = (this.i / this.group.length) * Math.PI * 2, r = this.group.length > 2 ? 0.9 : 0.6;
        const q = n.nav.closestPoint(new BABYLON.Vector3(this.c.x + Math.cos(a) * r, 0, this.c.z + Math.sin(a) * r), 3);
        n.setSpeed(Config.npc.wanderSpeed * 0.7);
        n.gotoTarget(q);
    }
    update(dt) {
        const n = this.npc;
        this.t += dt;
        if (this.t > 2.5 && n.distanceToTarget() < 0.6) n.setSpeed(0);
        if (this.t > this.life || this.group.some((q) => !q.alive || q.fsm.name === 'FLEE')) { n.toWander(); return; }
        if ((this.sayT -= dt) <= 0) {
            this.sayT = 4 + Math.random() * 6;
            const P = window.game && window.game.player && window.game.player.position;
            if (typeof Bubbles !== 'undefined' && P && hypot(n.position.x - P.x, n.position.z - P.z) < 22) Bubbles.say(n, ChatState.LINES[Math.floor(Math.random() * ChatState.LINES.length)], { ms: 2200 });
        }
    }
    faceTo() { return this.c; }
    pose(speed) {
        if (speed >= 0.5) return { clip: 'walk', rate: Math.max(0.5, speed / Config.anim.walk) };
        const k = (this.t + this.i * 1.7) % 7;
        return { clip: k < 3.5 ? 'idle' : k < 5 ? 'idle_look' : 'drink', fb: 'idle' };
    }
    exit() {}
}
ChatState.LINES = ['Rapaz, nem te conto…', 'E aí, como tá a família?', 'Viu o jogo ontem?', 'Tá tudo caro, né?', 'Hahaha, sério?', 'Vou nessa, falou!', 'Meu chefe é um mala…', 'Choveu demais semana passada.', 'Bora marcar aquele churrasco!'];

// --- BEG: mendigo no chão, encostado na parede, pedindo a quem passa perto. -------------------------------------------------
class BegState {
    constructor(npc, p, h) { this.npc = npc; this.name = 'BEG'; this.p = p; this.h = h; this.askT = 2; }
    enter() {
        const n = this.npc;
        n.enterFree();
        n.transform.position.set(this.p.x, 0, this.p.z);
        n.heading = this.h; n.transform.rotation.y = this.h;
    }
    update(dt) {
        const n = this.npc, g = window.game;
        if ((this.askT -= dt) > 0 || !g) return;
        this.askT = 6 + Math.random() * 6;
        const P = g.player.position, d = hypot(n.position.x - P.x, n.position.z - P.z);
        if (d < 6 && g.mode === 'player' && typeof Bubbles !== 'undefined' && !n._given) Bubbles.say(n, ['Uma moedinha, por favor…', 'Ajuda aí, chefe? Pra comer…', 'Qualquer trocado ajuda…'][Math.floor(Math.random() * 3)], { ms: 2400 });
    }
    anim() { const g = window.game, h = g && g.dayNight ? g.dayNight.hour : 12; return { clip: h >= 23 || h < 5 ? 'lie' : 'kneel', rate: 1, fb: 'sit' }; }
    exit() { const n = this.npc; if (n.free) n.leaveFree(); n.beggar = false; }
}
