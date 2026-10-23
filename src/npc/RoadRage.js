// ============================================================================
// RoadRage — BRIGA DE TRÂNSITO (Config.roadRage). Numa batida entre dois veículos (Game._onCarImpact; o piloto que voou da moto:
// Game._onThrow) com motorista da cidade de pelo menos um lado, `chance` (45%) de o pau quebrar — com moto ou bicicleta no meio
// (motoboy, entregador, mototaxista, ciclista), `motoChance` (80%). Só perto do jogador (`radius`): longe, o trânsito segue.
//
// Quem dirige DESCE: um pedestre do pool vira o motorista (NPCManager.borrow — fora do NavMesh, andando na pista; o piloto que voou da
// moto veste o desenho dele e levanta da queda) e vai tirar satisfação (RageState): encara, xinga (Bubbles), chuta a porta do outro.
// O que puxou a briga (o motoboy, se tiver um; com o jogador na batida, o motorista da cidade) sempre desce; o outro só se for de
// revidar (Temper) — senão fica no carro levando chute na porta. Aí é soco e chute (o FightState de sempre), e quem anda armado saca
// quando a coisa aperta. Com o JOGADOR: dentro do carro, o motorista vem até a porta, chuta a lataria e manda descer; a pé, briga com
// ele. Acabou (cansou, o outro caiu, fugiu ou foi embora), volta para o veículo — levanta a moto caída — e segue viagem; o pedestre
// volta ao pool. Quem leva a pior foge a pé e larga o veículo.
// ============================================================================

const RoadRage = {
    list: [],                    // brigas em andamento: { t, x, z, parties: [A, B] }
    _pairs: new Map(),           // par de veículos → { until, inc } (os dois carros avisam a mesma batida: sorteia uma vez só)
    now: 0,
    stats: { crashes: 0, fights: 0 },      // batidas entre veículos avaliadas / que viraram briga (testes)
    LINES: {
        car: ['Tá cego, porra?!', 'Olha o que tu fez no meu carro!', 'Aprendeu a dirigir onde?!', 'Vai pagar o conserto, sim!', 'Ô barbeiro!'],
        moto: ['Ô maluco! Não viu a moto?!', 'Quase me mata, cara!', 'Vai pagar a entrega, vai!', 'Barbeiro! Tá cego?!', 'Fechou a moto, otário!'],
        reply: ['Foi tu que entrou na minha frente!', 'Tá gritando com quem?!', 'Vem! Vem que eu tô aqui!', 'Sai fora, maluco!'],
        door: ['Desce do carro, vem!', 'Desce aí, covarde!', 'Abre essa porta!', 'Vai ficar escondido aí dentro?!'],
        quit: ['Covarde!', 'Vou anotar tua placa!', 'Da próxima vez não escapa!', 'Tô de olho em tu!'],
        calm: ['Tá maluco?!', 'Que isso, gente!', 'Vou chamar a polícia!'],
    },
    _say(who, list, tone = 'angry') { if (typeof Bubbles !== 'undefined' && who) Bubbles.say(who, list[Math.floor(Math.random() * list.length)], { tone, ms: 2400 }); },

    // ------------------------------------------------------------------ batidas
    // Batida de `v` (Game._onCarImpact; dvx/dvz = a velocidade que ele perdeu).
    onImpact(game, v, dv, dvx = 0, dvz = 0) {
        if (dv >= Config.roadRage.minDv) this._crash(game, v, dvx, dvz);
    },

    // O piloto voou da moto/bicicleta numa batida (Game._onThrow, kind 'crash'). Se a batida virou briga, quem caiu é um pedestre do
    // pool que levanta brigando — true: quem chamou não cria a Casualty de sempre.
    onThrow(game, bike, variant, dx, dz, power, look) {
        const inc = this._crash(game, bike, -dx, -dz, true);
        const P = inc && inc.parties.find((q) => q.veh === bike && q.who === 'npc' && !q.npc);
        if (!P) return false;
        P.variant = variant; P.look = look;
        return this._spawn(game, inc, P, { dx, dz, power });
    },

    // A batida: o outro veículo encostado (do lado de onde veio o tranco: −dv) — ou o jogador a pé que a moto pegou —, o sorteio (uma vez
    // por par) e a briga aberta. Devolve a briga (ou null).
    _crash(game, v, dvx, dvz, thrown = false) {
        if (!game.vehicleManager || !game.npcManager || this.list.length >= Config.roadRage.max) return this._pairOf(v);
        const f = game.camera && game.camera.target, R = Config.roadRage.radius;
        if (!f || hypot(v.position.x - f.x, v.position.z - f.z) > R || Interiors.active) return null;
        const foot = thrown && v.isBike && this._onFoot(game, v);                 // (a moto pegou o jogador a pé)
        const o = foot && foot < 2.5 ? 'foot' : this._contact(game, v, dvx, dvz) || (foot ? 'foot' : null);
        if (!o) return null;
        const key = this._key(v, o), had = this._pairs.get(key);
        if (had && had.until > this.now) return had.inc;
        const A = this._party(game, v, thrown), B = o === 'foot' ? { who: 'player', veh: null } : this._party(game, o);
        let inc = null;
        if (A && B && (A.who === 'npc' || B.who === 'npc')) {
            this.stats.crashes++;
            if (Math.random() < this.chanceOf(A, B)) inc = this._open(game, A, B);
        }
        this._pairs.set(key, { until: this.now + 30, inc });
        return inc;
    },
    // Chance de a batida entre os lados A e B virar briga: com moto/bicicleta no meio, motoChance; senão, chance.
    chanceOf(A, B) { const bike = (x) => !!(x && x.veh && x.veh.isBike); return bike(A) || bike(B) ? Config.roadRage.motoChance : Config.roadRage.chance; },
    _pairOf(v) { for (const inc of this.list) if (inc.parties.some((q) => q.veh === v)) return inc; return null; },
    _key(v, o) { const a = v.id, b = o === 'foot' ? 'foot' : o.id; return a < b ? a + '|' + b : b + '|' + a; },

    // Quem dirige `v` (o lado dele na briga): { who: 'player' | 'npc', veh } — ou null (viatura, estacionado, sem piloto, pegando fogo…).
    // thrown: o piloto de `v` acabou de voar (já sem piloto).
    _party(game, v, thrown = false) {
        if (!v || v.isBoat || v.burning > 0 || v._rage) return null;
        if (v === game.activeCar && game.mode === 'car') return { who: 'player', veh: v };
        if (v._playerFell && this.now - v._playerFell < 2) return { who: 'player', veh: null };      // (o jogador acabou de voar dela: está a pé)
        if (v.controlled || v.role || v.mode === undefined) return null;
        if (v.isBike) return v.riderVariant != null || thrown ? { who: 'npc', veh: v } : null;
        return v.mode === 'drive' && v.driver !== false && !v.driverDead ? { who: 'npc', veh: v } : null;
    },

    // O veículo encostado em `v` do lado de −dv (de onde veio o tranco).
    _contact(game, v, dvx, dvz) {
        const p = v.position, dl = hypot(dvx, dvz);
        let best = null, bd = Infinity;
        const look = (o) => {
            if (o === v || o.isBoat || !o.position) return;
            const dx = o.position.x - p.x, dz = o.position.z - p.z, d = hypot(dx, dz);
            const reach = Math.max(v.halfLen || 2, v.halfW || 1) + Math.max(o.halfLen || 2, o.halfW || 1) + 0.8;
            if (d > reach || d >= bd) return;
            if (dl > 0.5 && d > 0.3 && (dx * -dvx + dz * -dvz) / (d * dl) < -0.2) return;          // (do outro lado: só encostado na fila)
            bd = d; best = o;
        };
        for (const o of game.vehicleManager.vehicles) look(o);
        if (game.policeManager) for (const o of game.policeManager.cars) look(o);
        return best;
    },
    // A moto pegou o jogador a pé? A distância dele (até 3,5 m), ou 0.
    _onFoot(game, bike) {
        const pl = game.player, d = hypot(pl.position.x - bike.position.x, pl.position.z - bike.position.z);
        return game.mode === 'player' && pl.alive && d < 3.5 ? Math.max(0.01, d) : 0;
    },

    // Abre a briga: quem PUXA (o piloto da moto, se tiver; com o jogador, o motorista da cidade; entre dois carros, um deles) e quem
    // responde. Os motoristas descem no update (quando o carro para); o piloto que voou, já (onThrow).
    _open(game, A, B) {
        const pick = A.who === 'player' ? B : B.who === 'player' ? A : A.veh.isBike && !B.veh.isBike ? A : B.veh.isBike && !A.veh.isBike ? B : Math.random() < 0.5 ? A : B;
        const inc = { t: 0, parties: [A, B], x: A.veh ? A.veh.position.x : B.veh.position.x, z: A.veh ? A.veh.position.z : B.veh.position.z };
        for (const P of inc.parties) {
            P.inc = inc; P.other = P === A ? B : A; P.lead = P === pick;
            P.npc = null; P.state = null; P.stay = false; P.done = P.who !== 'npc'; P.wait = 0.5 + Math.random() * 0.7;
            if (P.veh && P.who === 'npc') {
                P.veh._rage = inc;
                P.veh.mode = 'abandoned'; P.veh.route = null;                   // (freia e para: o motorista desce com o carro parado)
                if (P.veh.isBike) { P.variant = P.veh.riderVariant; const r = P.veh.visual && P.veh.visual.rider; P.look = r && r.sheet && r.sheet.isNpc ? { sheet: r.sheet, row: r.npcRow } : null; }
            }
        }
        this.list.push(inc);
        this.stats.fights++;
        const pl = game.player.position;
        if (A.who === 'player' || B.who === 'player') game._flash('🚗💥 Briga de trânsito! O outro motorista desceu para tirar satisfação');
        else if (hypot(pl.x - inc.x, pl.z - inc.z) < 40) game._flash('🚗💥 Batida — e os motoristas desceram para brigar');
        return inc;
    },

    // Um pedestre do pool vira o motorista/piloto do lado P e desce. thrown = { dx, dz, power }: voou da moto (cai e levanta).
    _spawn(game, inc, P, thrown = null) {
        const v = P.veh, man = (n) => Temper.of(n).sex === 'm';
        let at = v.position, side = -1;                                         // (a porta do motorista; dando para a parede, a outra)
        if (!v.isBike && typeof DoorSheet !== 'undefined' && DoorSheet.SPEC[v.spec.id]) {
            for (const s of [-1, 1]) { const q = game.doors.doorPoint(v, s); if (MapGeo.isLand(q.x, q.z) && !CityGrid.blockedAt(q.x, q.z)) { at = q; side = s; break; } }
        }
        const npc = game.npcManager.borrow(at.x, at.z, P.lead && !P.look ? man : null);
        if (!npc) { P.done = true; P.stay = true; return false; }
        if (P.look) npc.wearLook(P.look.sheet, P.look.row);
        const prof = Temper.profile(npc, game);
        // Quem puxou a briga sai no braço (homem; ela, só se for de revidar — com a faca/o taco); quem responde, só se for de revidar.
        const brawl = P.lead ? prof.sex === 'm' || prof.fighter : prof.fighter;
        if (!P.lead && !brawl && !thrown) {                                     // não é de briga: fica no carro (a porta trancada)
            game.npcManager.release(npc);
            P.stay = true; P.done = true;
            return false;
        }
        P.npc = npc;
        const S = P.state = new RageState(npc, P, { brawl, weapon: prof.sex === 'f' && prof.weapon ? prof.weapon : 'none', armed: prof.weapon, thrown: !!thrown });
        npc._rage = S;
        npc.heading = v.isBike ? npc.heading : (at.face !== undefined ? at.face + Math.PI : npc.heading);
        npc.fsm.setState(S);
        if (v.isBike && !thrown && v.riderVariant != null) v.setRider(null);       // desceu da moto (não voou)
        if (!v.isBike) { v.driver = false; game.doors.set(v, side, true); S.side = side; }
        v.mode = 'abandoned'; v.route = null;
        if (thrown) npc.ragdoll(v.position, { dx: thrown.dx, dz: thrown.dz, power: thrown.power }, false);
        return true;
    },

    // ------------------------------------------------------------------ quadro
    update(game, dt) {
        this.now += dt;
        if (this._pairs.size > 40) for (const [k, q] of this._pairs) if (q.until <= this.now) this._pairs.delete(k);
        if (!this.list.length) return;
        const f = game.camera.target, R = Math.min(Config.roadRage.radius * 1.3, Config.traffic.abandonDist - 2);      // (o trânsito remove o carro largado além de abandonDist)
        for (let i = this.list.length - 1; i >= 0; i--) {
            const inc = this.list[i];
            inc.t += dt;
            if (hypot(f.x - inc.x, f.z - inc.z) > R || Interiors.active) { this._dissolve(game, inc); this.list.splice(i, 1); continue; }
            for (const P of inc.parties) {
                if (P.npc && !P.done && (!P.npc.alive || P.npc._rage !== P.state)) { P.done = true; if (P.veh) P.veh._rage = null; }      // (morreu, ou saiu da briga por outro caminho)
                if (P.who !== 'npc' || P.npc || P.done) continue;
                const v = P.veh;
                if (!this.vehOk(game, v)) { P.done = true; continue; }
                if ((P.wait -= dt) > 0 || v.speed > 1) continue;                    // desce quando o carro parou
                this._spawn(game, inc, P);
            }
            if (inc.t > Config.roadRage.life) for (const P of inc.parties) if (P.state && /^(approach|argue|fight)$/.test(P.state.phase)) P.state.toBack();
            if (inc.parties.every((P) => P.done)) { this._finish(game, inc); this.list.splice(i, 1); }
        }
    },

    // O veículo ainda está aí, inteiro, livre (não roubado, não removido do mundo)?
    vehOk(game, v) {
        if (!v || v.gone || v.controlled || v.hold || v.burning > 0 || (v.wrecked && !v.canRaise)) return false;
        return !game.vehicleManager || game.vehicleManager.vehicles.includes(v);
    },
    // Volta a dirigir (o motorista entrou de volta / ficou no carro).
    resume(game, P) {
        const v = P.veh;
        if (!v) return;
        v._rage = null;
        if (!this.vehOk(game, v)) return;
        if (v.isBike) {
            if (v.wrecked) v.raise();
            if (P.variant == null) return;
            v.setRider(P.variant);
        }
        v.driver = true;
        v.mode = 'drive'; v.route = null; v.detour = null; v.lat = v.latTarget = 0; v.stuck = 0;
        if (v.courier && typeof Couriers !== 'undefined') Couriers.onRemount(v);
    },
    // Todo mundo resolvido: quem ficou no carro segue viagem.
    _finish(game, inc) { for (const P of inc.parties) if (P.stay && P.veh) this.resume(game, P); },
    // O jogador foi embora: ninguém mais vê — os pedestres voltam ao pool e os veículos seguem.
    _dissolve(game, inc) {
        for (const P of inc.parties) {
            const n = P.npc;
            if (n && n._rage === P.state) { if (n.alive && !n.rag) game.npcManager.release(n); else n._rage = null; }      // (voando: levanta e segue a pé)
            if (P.who === 'npc' && P.veh && (P.stay || (n && n.alive))) this.resume(game, P);
            else if (P.veh) P.veh._rage = null;
            P.done = true;
        }
    },
};

// --- RAGE: o motorista/piloto que desceu (fora do NavMesh: anda na pista). Fases: 'out' (desce do carro) · 'rag' (voou da moto: cai e
// levanta — NPC._ragEnd → getUp) · 'approach' (vai até o outro) · 'argue' (encara, xinga, chuta a porta) · 'fight' (o FightState) ·
// 'back' (volta, levanta a moto, entra e segue viagem) · 'flee' (levou a pior: corre até a calçada e vira um pedestre assustado). ---
class RageState extends FightState {
    constructor(npc, party, { brawl, weapon = 'none', armed = null, thrown = false }) {
        super(npc, null, { weapon, armed });
        this.name = 'RAGE';
        this.party = party;
        this.brawl = brawl;
        this.phase = thrown ? 'rag' : 'out';
        this.t = 0; this.kick = 0; this.said = false;
        this.argueFor = Config.roadRage.argue[0] + Math.random() * (Config.roadRage.argue[1] - Config.roadRage.argue[0]);
        this.rage = true;
    }

    enter() {}                 // (volta para cá depois do ragdoll: continua de onde estava)

    get game() { return this.npc.ctx.game; }
    _to(phase) { this.phase = phase; this.t = 0; this.clip = null; this.clipW = null; this.attackT = 0; this.stagger = 0; }

    // Com quem é a briga agora: { person } (o jogador a pé, o outro motorista na pista) ou { car } (o outro está dentro dele) — ou null.
    target() {
        const g = this.game, o = this.party.other;
        if (o.who === 'player') {
            if (g.mode === 'player' && g.player.alive) return { person: g.player };
            if (g.mode === 'car' && o.veh && g.activeCar === o.veh) return { car: o.veh };
            return null;
        }
        const n = o.npc, S = n && n._rage;
        if (n && n.alive && S && !/^(back|flee|gone)$/.test(S.phase)) return { person: n };
        if ((o.stay || (!n && !o.done)) && RoadRage.vehOk(g, o.veh)) return { car: o.veh };      // (ficou no carro — ou ainda vai decidir se desce)
        return null;
    }

    update(dt) {
        const npc = this.npc, g = this.game;
        this.t += dt; this._dt = dt;
        if (this.phase !== 'fight') {
            if (this.attackT > 0 && (this.attackT -= dt) <= 0) { this.clip = null; this.clipW = null; }
            if (this.stagger > 0) { this.stagger -= dt; this._stop(); return; }
        }
        switch (this.phase) {
            case 'out': this._stop(); if (this.t > 0.6) { if (!this.party.veh.isBike) g.doors.set(this.party.veh, this.side || -1, false); this._to(this.brawl || this.party.lead ? 'approach' : 'back'); } return;
            case 'rag': this._stop(); this._to(this.brawl ? 'approach' : 'back'); if (!this.brawl) RoadRage._say(npc, RoadRage.LINES.calm, 'shout'); return;
            case 'approach': return this._approach(g);
            case 'argue': return this._argue(g);
            case 'fight': return this._fightTick(g, dt);
            case 'back': return this._back(g);
            case 'flee': return this._flee(g);
        }
    }

    _approach(g) {
        const T = this.target();
        if (!T || this.t > 14) { this.toBack(); return; }
        const p = this.npc.position, q = T.person ? T.person.position : this._door(T.car), d = hypot(q.x - p.x, q.z - p.z);
        if (T.car && T.car.speed > 3 && d > Config.roadRage.giveUp) { RoadRage._say(this.npc, RoadRage.LINES.quit, 'shout'); this.toBack(); return; }
        if (d < (T.person ? 1.7 : 0.7)) { this._to('argue'); return; }
        this._go(q.x, q.z, d > 6 ? 3.4 : 2.2);
    }

    // Encara e xinga; o carro do outro leva chute na porta. Passado o tempo: a pé, vai para a briga; o outro trancado no carro, desiste.
    _argue(g) {
        const npc = this.npc, T = this.target();
        if (!T) { this.toBack(); return; }
        const tp = T.person ? T.person.position : T.car.position, p = npc.position, d = hypot(tp.x - p.x, tp.z - p.z);
        npc.heading = Math.atan2(tp.x - p.x, tp.z - p.z);
        if (!this.said) {
            this.said = true;
            const L = RoadRage.LINES, lead = this.party.lead;
            RoadRage._say(npc, T.car ? L.door : lead ? (this.party.veh.isBike ? L.moto : L.car) : L.reply, lead ? 'angry' : 'shout');
        }
        if (T.car) {
            if (T.car.speed > 3 && d > Config.roadRage.giveUp) { RoadRage._say(npc, RoadRage.LINES.quit, 'shout'); this.toBack(); return; }
            if (d > 3.2) { this._to('approach'); return; }
            this._stop();
            if (this.attackT <= 0 && (this.kick -= this._dt) <= 0) this._kickCar(g, T.car);
            if (this.t > this.argueFor + 3) this.toBack();
            return;
        }
        if (d > 3.5) { if (T.person === g.player && d > 10) { RoadRage._say(npc, RoadRage.LINES.quit, 'shout'); this.toBack(); } else this._to('approach'); return; }
        this._stop();
        if (this.t > this.argueFor) {
            if (this.brawl) this.fight(T.person);
            else { RoadRage._say(npc, RoadRage.LINES.quit, 'shout'); this.toBack(); }
        }
    }

    // Chute na porta do carro do outro: amassa um pouco (a lataria) e faz barulho.
    _kickCar(g, car) {
        const npc = this.npc;
        if (!npc.actor.play('kick', 'none', { restart: true })) return;
        this.clip = 'kick'; this.clipW = 'none';
        this.attackT = this._dur(0.58); this.kick = 1.1 + Math.random() * 0.6;
        const S = this;
        g._delayed.push({ t: 0.23, fn: () => {                                  // (o pé encosta na porta)
            if (npc.fsm.current !== S || S.clip !== 'kick' || !npc.alive || npc.rag) return;
            const p = car.position;
            if (car.takeDamage) car.takeDamage(2.5, 'npc');
            g.combat.spark((p.x + npc.position.x) / 2, 0.8, (p.z + npc.position.z) / 2, [1, 0.9, 0.5]);
            AudioFX.hit(p.x, p.z);
            if (car === g.activeCar && g.camera) g.camera.shake(0.12);
        } });
    }

    // Briga com `foe` (o jogador ou o outro motorista) — o outro, se também é de briga e ainda está encarando, entra junto.
    fight(foe) {
        const npc = this.npc;
        this.foe = foe;
        this._to('fight');
        this.timer = 9 + Math.random() * 6; this.cd = 0.2;
        if (this.weapon !== 'none') this._draw(this.weapon, false);
        const S = foe && foe._rage;
        if (S && S.brawl && (S.phase === 'argue' || S.phase === 'approach')) S.fight(npc);
        const g = this.game;
        if (g.npcManager) g.npcManager.alertViolence(npc.position, 10, [npc, foe]);
    }
    _fightTick(g, dt) {
        const foe = this.foe, S = foe && foe._rage;
        if (!foe || (foe !== g.player && (!S || /^(back|flee|gone)$/.test(S.phase)))) { RoadRage._say(this.npc, RoadRage.LINES.quit, 'shout'); this.toBack(); return; }
        super.update(dt);
    }
    // Fim da briga (FightState): levou a pior (ou o outro sacou o que ele não encara) → foge; senão, volta para o veículo.
    _quit(lost) { if (lost) this._toFlee(this.foe ? this.foe.position : this.npc.position); else this.toBack(); }

    // Apanhou: brigando, cambaleia (FightState); antes da briga, parte para cima de quem bateu (se é de briga) ou foge. Atropelado de
    // raspão, estilhaço: só cambaleia.
    onHurt() {
        const npc = this.npc, g = this.game, attack = Temper.attackOf(npc._hitKind);
        if (this.phase === 'fight') { super.onHurt(); return; }
        if (/^(flee|rag|gone)$/.test(this.phase)) return;
        if (!attack) { this.stagger = 0.4; return; }
        const by = npc._hitBy === 'player' ? g.player : (this.target() || {}).person;
        let R = null;
        if (by === g.player) R = Temper.reply(npc, attack, by, g) || (this.brawl && attack === 'hand' ? { weapon: this.weapon, armed: this.armed } : null);
        else if (by && this.brawl) R = { weapon: this.weapon, armed: this.armed };
        if (R && npc.hp > npc.maxHp * 0.35) {
            if (R.weapon && R.weapon !== 'none') this.weapon = R.weapon;
            if (R.armed) this.armed = R.armed;
            this.fight(by);
            this.stagger = 0.4;
        } else this._toFlee(npc.threat);
    }

    // Susto (tiro por perto, polícia chegando): foge — menos quem está trocando tiro.
    scare(threat, force) {
        if (this.phase === 'fight' && this.weapon === 'pistol' && !force) return;
        if (this.phase === 'flee' || this.phase === 'rag') return;
        this._toFlee(threat);
    }

    // Levantou do ragdoll (NPC._ragEnd): continua de onde estava, na pista.
    getUp() {
        const npc = this.npc;
        if (npc._rage !== this || !npc.alive) return false;
        npc.free = npc.free || {};
        npc.actor.play('idle', 'none', { restart: true });
        npc.fsm.setState(this);
        if (this.phase === 'fight' && npc.hp < npc.maxHp * 0.35) this._toFlee(npc.threat);
        return true;
    }

    // Volta para o veículo: anda até a porta (a moto: até o lado dela; caída, levanta), entra e segue viagem; o pedestre volta ao pool.
    toBack() { if (this.phase !== 'back') this._to('back'); }
    _back(g) {
        const npc = this.npc, P = this.party, v = P.veh;
        if (!RoadRage.vehOk(g, v)) { this._toLeave(); return; }
        const q = v.isBike ? { x: v.position.x, z: v.position.z } : this._door(v), p = npc.position, d = hypot(q.x - p.x, q.z - p.z);
        if (this.lift > 0) { this._stop(); if ((this.lift -= this._dt) <= 0 && v.wrecked) { v.raise(); AudioFX.thud(v.position.x, v.position.z); } return; }
        if (this.board > 0) { this._stop(); if ((this.board -= this._dt) <= 0) this._boarded(g); return; }
        if (d > (v.isBike ? 1.05 : 0.6) && this.t < 25) { this._go(q.x, q.z, d > 6 ? 3.2 : 1.7); return; }
        this._stop();
        npc.heading = Math.atan2(v.position.x - p.x, v.position.z - p.z);
        if (v.isBike && v.wrecked) { this.lift = 0.6; if (npc.actor.play('pick', 'none', { restart: true })) { this.clip = 'pick'; this.clipW = 'none'; this.attackT = 0.6; } return; }
        this.board = v.isBike ? 0.15 : 0.6;
        if (!v.isBike) { g.doors.set(v, this.side || -1, true); if (npc.actor.play('enter', 'none', { restart: true })) { this.clip = 'enter'; this.clipW = 'none'; this.attackT = 0.6; } }
    }
    _boarded(g) {
        const P = this.party, v = P.veh, npc = this.npc;
        if (!v.isBike) g.doors.set(v, this.side || -1, false);
        P.done = true; this.phase = 'gone';
        npc._rage = null;
        RoadRage.resume(g, P);
        g.npcManager.release(npc);
    }
    // Onde ele entra/sai do carro (a porta do motorista; do outro lado, se ela dá para a parede).
    _door(car) {
        const g = this.game;
        if (!car.isBike && typeof DoorSheet !== 'undefined' && DoorSheet.SPEC[car.spec.id]) {
            const s = car === this.party.veh && this.side ? this.side : -1, a = g.doors.doorPoint(car, s);
            if (MapGeo.isLand(a.x, a.z) && !CityGrid.blockedAt(a.x, a.z)) return a;
            return g.doors.doorPoint(car, -s);
        }
        const p = car.position, A = CarDoors.axes(car), s = (car.halfW || 1) + 0.6;
        return { x: p.x - A.rx * s, z: p.z - A.rz * s };
    }

    // Foge a pé: corre até a calçada (o NavMesh) e de lá vira um pedestre assustado comum. O veículo fica largado.
    _toFlee(threat) {
        const npc = this.npc, p = npc.position;
        this._to('flee');
        this.fleeFrom = { x: threat.x, z: threat.z };
        const ax = p.x - threat.x, az = p.z - threat.z, l = hypot(ax, az) || 1;
        this.fleeTo = npc.nav.closestPoint(new BABYLON.Vector3(p.x + ax / l * 7, 0, p.z + az / l * 7));
        if (this.party.veh) this.party.veh._rage = null;
        this.party.done = true;
    }
    // Sem o veículo (roubado, rebocado, pegou fogo): segue a pé, sem pressa.
    _toLeave() { this._toFlee(this.npc.position); this.calmLeave = true; this.party.done = true; }
    _flee(g) {
        const npc = this.npc, q = this.fleeTo, d = q ? hypot(q.x - npc.position.x, q.z - npc.position.z) : 0;
        if (q && d > 0.5 && this.t < 6) { this._go(q.x, q.z, this.calmLeave ? 1.7 : Config.npc.fleeSpeed); return; }
        npc._rage = null;
        npc.leaveFree();
        if (this.calmLeave) npc.toWander(); else npc.panic(new BABYLON.Vector3(this.fleeFrom.x, 0, this.fleeFrom.z), true);
    }

    anim(speed) {
        if (this.phase === 'fight' || this.stagger > 0) return super.anim(speed);
        if (this.clip) return { clip: this.clip, w: this.clipW || 'none', rate: 1 };
        if (speed > 0.5) {
            const run = speed > 2.6, w = this.phase === 'flee' ? 'none' : this.weapon;
            return this.phase === 'flee' && !this.calmLeave ? { clip: 'scared', w: 'none', rate: Math.max(0.5, speed / Config.anim.run) }
                : { clip: run ? 'run' : 'walk', w: w === 'pistol' && this.phase !== 'fight' ? 'none' : w, rate: Math.max(0.5, speed / (run ? Config.anim.run : Config.anim.walk)) };
        }
        return { clip: 'idle', w: this.weapon === 'pistol' ? 'none' : this.weapon, rate: 1 };
    }

    exit() { this.clip = null; }
}
