// ============================================================================
// StreetCrime — assalto entre NPCs: a cidade tem crime sem o jogador. De vez em quando, perto dele (dá para ver), um pedestre vira
// ASSALTANTE (visual de traficante 2,5D, com pistola — ou, em 40% dos assaltos, com FACA): chega andando atrás da vítima, saca (a faca
// já vem na mão), anuncia o assalto (a vítima ergue as mãos e
// se ajoelha), pega tudo e sai correndo armado. Quem vê foge. Se o jogador bater ou atirar no assaltante, a vítima fica livre.
// (Usa as animações novas do pacote de NPCs: sacar, anunciar o assalto, render-se, ajoelhar, correr armado.)
// ============================================================================

const StreetCrime = {
    INTERVAL: [75, 150],          // s entre um assalto e outro
    t: 45,
    active: null,

    update(game, dt) {
        if (!game.npcManager || !game.aiReady || typeof NpcArt === 'undefined' || !game.sprites.npc) return;
        if (this.active) {
            const A = this.active;
            if (A.npc.fsm.current !== A.state || !A.npc.alive) this.active = null;
            return;
        }
        this.t -= dt;
        if (this.t > 0) return;
        this.t = this.INTERVAL[0] + Math.random() * (this.INTERVAL[1] - this.INTERVAL[0]);
        if (game.mode !== 'player' || game.holdup || game.arrest || game.death || (game.wanted && game.wanted.level > 0)) return;
        this.start(game);
    },

    // Começa um assalto perto do jogador (true = começou). Também usado pelo modo dev.
    start(game) {
        const pp = game.player.position, L = game.npcManager.npcs;
        const calm = (n) => n.alive && !n.rag && !n.free && n.index >= 0 && n.fsm.name === 'WANDER' && n.actor && n.actor.sheet && n.actor.sheet.isNpc;
        const dist = (a, b) => hypot(a.x - b.x, a.z - b.z);
        const victims = L.filter((n) => calm(n) && dist(n.position, pp) > 8 && dist(n.position, pp) < 24);
        if (!victims.length) return false;
        const v = victims[Math.floor(Math.random() * victims.length)];
        const m = L.filter((n) => n !== v && calm(n) && dist(n.position, v.position) > 4 && dist(n.position, v.position) < 18)
            .sort((a, b) => dist(a.position, v.position) - dist(b.position, v.position))[0];
        if (!m) return false;
        const id = Math.random() < 0.55 ? 'trafic_pistola' : 'trafic_mascarado', G = NpcArt.gen();
        const look = { id, row: NpcArt.row(id, Math.floor(Math.random() * G.TYPES[id].nvar)), knife: Math.random() < 0.4 && G.TYPES[id].clips.includes('holdup:knife') };
        const st = new MugState(m, v, look, game);
        m.fsm.setState(st);
        this.active = { npc: m, state: st };
        return true;
    },
};

// --- MUG: o pedestre assaltante. Fases: chegar → sacar → anunciar (a vítima rendida) → fugir correndo armado. ---
class MugState {
    constructor(npc, victim, look, game) {
        this.npc = npc; this.victim = victim; this.look = look; this.game = game;
        this.name = 'MUG';
        this.phase = 'approach'; this.t = 0; this.aim = 0;
        this.clip = 'walk'; this.weapon = 'none';
        this.arm = look.knife ? 'knife' : 'pistol';                 // a arma do assalto
    }

    enter() {
        const n = this.npc, a = n.actor;
        this._sheet = a.sheet; this._row = a.npcRow;
        a.useSheet(NpcArt.sheet(this.look.id));             // veste o assaltante (a forma volta ao normal no fim)
        a.npcRow = this.look.row;
        if (this.arm === 'knife') this.weapon = 'knife';            // (a faca vem na mão desde a chegada)
        a.play('walk', this.weapon, { restart: true });
        n.mugger = true;
        n.setSpeed(Config.npc.wanderSpeed * 1.35);
        n.gotoTarget(this.victim.position);
    }

    update(dt) {
        const n = this.npc, v = this.victim;
        this.t += dt;
        if (this.phase !== 'flee' && (!v.alive || v.rag || (this.phase !== 'approach' && !v.surrendered))) { this._flee(); return; }
        const d = hypot(v.position.x - n.position.x, v.position.z - n.position.z);
        if (this.phase === 'approach') {
            this.aim -= dt;
            if (this.aim <= 0) { this.aim = 0.4; n.gotoTarget(v.position); }
            if (this.t > 16) { this._flee(); return; }                                // não alcançou: desiste
            if (d > 2.0) return;
            // Rendeu: para, saca e anuncia — a vítima ergue as mãos e se ajoelha. Quem vê, foge.
            this.phase = 'draw'; this.t = 0;
            n.setSpeed(0); n.gotoTarget(n.position);
            if (this.arm === 'knife') { this.phase = 'hold'; this.clip = 'holdup'; this.weapon = 'knife'; n.actor.play('holdup', 'knife', { restart: true }); }
            else { this.clip = 'draw'; this.weapon = 'pistol'; n.actor.play('draw', 'pistol', { restart: true }); }
            v.surrender(n.position);
            this.game.npcManager.alertViolence(n.position, 14, [v, n]);
            if (hypot(this.game.player.position.x - n.position.x, this.game.player.position.z - n.position.z) < 18) this.game._flash('Assalto na rua! Um bandido rendeu um pedestre');
            AudioFX.blip(300, 0.16, 0.18);
            return;
        }
        if (this.phase === 'draw' || this.phase === 'hold') {
            const want = Math.atan2(v.position.x - n.position.x, v.position.z - n.position.z);       // encara a vítima
            n.heading = n._lerpAngle(n.heading, want, 1 - Math.exp(-10 * dt));
            n.transform.rotation.y = n.heading;
            if (this.phase === 'draw' && n.actor.done) { this.phase = 'hold'; this.clip = 'holdup'; }
            if (this.t > 5.2) this._flee();                                                   // pegou tudo: vaza
            return;
        }
        // fugindo, armado
        this.aim -= dt;
        if (this.aim <= 0) { this.aim = 0.8; this._away(); }
        if (this.t > 7) n.afterPanic();
    }

    _flee() {
        const n = this.npc, v = this.victim;
        if (v.surrendered) v.endSurrender(n.position);
        this.phase = 'flee'; this.t = 0; this.aim = 0;
        this.clip = 'run'; this.weapon = this.arm;
        n.setSpeed(Config.npc.fleeSpeed * 1.1);
        n.threat.copyFrom(v.position);
        this._away();
    }

    _away() {
        const n = this.npc, away = n.position.subtract(n.threat);
        away.y = 0;
        if (away.lengthSquared() < 0.01) away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        away.normalize();
        n.gotoTarget(n.nav.closestPoint(n.position.add(away.scale(Config.npc.wanderRadius * 0.7))));
    }

    // Saiu do assalto (fugiu, levou golpe, morreu…): solta a vítima; vivo, volta a ser o pedestre de antes.
    exit() {
        const n = this.npc, v = this.victim, a = n.actor;
        if (v.surrendered) v.endSurrender(n.position);
        if (!n.alive) return;                                                               // (o corpo fica com a cara do assaltante; ver NPC.respawn)
        n.mugger = false;
        a.useSheet(this._sheet);
        a.npcRow = this._row;
        a.play('idle', 'none', { restart: true });
    }
}
