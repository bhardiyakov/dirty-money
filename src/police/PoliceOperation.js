// ============================================================================
// PoliceOperation — a OPERAÇÃO POLICIAL dentro da favela (o único momento em que a polícia entra além da entrada).
//   idle     → conta um intervalo aleatório (só enquanto o jogador está perto da favela);
//   (os OLHEIROS e FOGUETEIROS — FavelaWatch — dão o alarme assim que enxergam a polícia dentro da favela)
//   active   → `Standing.policeOp = true` (a polícia pode ficar dentro): um esquadrão a pé entra pela entrada e avança favela
//              adentro; polícia e traficantes se enfrentam (steer / GangManager); moradores entram em pânico;
//   (fim)    → o tempo acaba, `policeOp = false`, a polícia perde o rastro e volta para a entrada (PoliceManager cuida).
// Moral: matar um policial na operação sobe a moral do tráfico; o resto segue as regras normais (procurado, Comunidade).
// ============================================================================

class PoliceOperation {
    constructor(game) {
        this.game = game;
        this.state = 'idle';            // idle | warning | active
        this.t = 0;                     // tempo no estado atual
        this.next = 400 + Math.random() * 300;   // operação de ROTINA (rara, só conta com o jogador perto); as outras vêm da pressão (Standing.heat)
        this.cool = 0;                           // s de folga depois de uma operação, antes de outra por pressão
        this.duration = 150;            // s de operação
        this.warnTime = 10;             // s de fogos antes
        this._fw = 0; this._panic = 0; this._reinf = 0; this._dt = 1 / 30;
        this.center = { x: 0, z: 0 };   // por onde a polícia entra
    }

    get active() { return this.state === 'active'; }
    get cops() { return this.game.policeManager ? this.game.policeManager.officers.filter((o) => o.op && o.alive && !o.rag) : []; }

    // Começa já: a polícia entra pela viela e os OLHEIROS (FavelaWatch) é que dão o alarme (fogos). `skipWarning` não é mais usado.
    start(reason = 'operação de rotina', force = false) {
        if (!force && !Standing.nearFavela(this.game.player.position.x, this.game.player.position.z, 20)) return false;      // sem o jogador na favela é como se a operação não existisse
        if (this.state !== 'idle' || !this.game.policeManager) return false;
        const p = this.game.player.position, b = Standing._bounds();
        this.center.x = b.x1 - 3;
        this.center.z = Math.max(b.z0 + 25, Math.min(b.z1 - 25, p.z + (Math.random() - 0.5) * 80));
        this.state = 'active'; this.t = 0; this.reason = reason; Standing.policeOp = true; Standing.heat = 0; Standing.heatWhy = ''; this._spawnSquad(8);
        return true;
    }

    stop(silent = false) {
        if (this.state === 'idle') return;
        this.state = 'idle'; this.t = 0; this.next = 500 + Math.random() * 300; this.cool = 90; Standing.heat = 0; Standing.heatWhy = '';
        Standing.policeOp = false;
        const pm = this.game.policeManager;
        if (pm) for (const o of pm.officers) if (o.op) { o.op = false; o.foe = null; if (o.mind) o.mind.t = -1e9; }
        if (!silent) this.game._flash('A operação policial terminou. A polícia deixou a favela.');
    }

    update(dt, pos) {
        const g = this.game;
        this._dt = dt;
        if (!g.policeManager || g.death || g.arrest) return;
        const near = Standing.nearFavela(pos.x, pos.z, 20);                                // só existe operação (e efeitos) com o jogador NA favela
        if (!near) { if (this.state !== 'idle') this.stop(true); return; }
        // pressão policial: procurado alto dentro da favela e comunidade revoltada esquentam; sozinha, esfria devagar
        if (this.cool > 0) this.cool -= dt;
        if (this.state === 'idle') {
            if (Standing.inFavela(pos.x, pos.z) && g.wanted.level > 0) Standing.addHeat(g.wanted.level * 2 * dt, 'procurado dentro da favela');
            if (near && Standing.community < Standing.angry) Standing.addHeat(0.5 * dt, 'comunidade revoltada');
            Standing.heat = Math.max(0, Standing.heat - 0.4 * dt);
            if (!this._warned && Standing.heat >= 65) { this._warned = true; g._flash('⚠ A polícia está de olho na favela… a pressão está subindo'); }
            if (Standing.heat < 40) this._warned = false;
            if (Standing.heat >= 98 && this.cool <= 0) { this.start(Standing.heatWhy || 'pressão policial'); return; }
        }
        if (this.state === 'idle') {
            if (near) this.next -= dt;
            if (this.next <= 0) this.start();
            return;
        }
        this.t += dt;
        // pulso de perigo: batida grave + leve tremor da câmera, em ritmo de coração acelerado (só perto da favela)
        this._beat = (this._beat || 0) - dt;
        if (this._beat <= 0 && near) {
            this._beat = 1.1;
            AudioFX.blip(70, 0.22, 0.14); setTimeout(() => AudioFX.blip(60, 0.18, 0.1), 170);
            if (Standing.inFavela(pos.x, pos.z)) g.camera.shake(0.12);
        }
        // active
        this._reinf -= dt;
        if (this._reinf <= 0 && this.t < this.duration * 0.65) {
            this._reinf = 14;
            if (this.cops.length < 5) this._spawnSquad(3);
        }
        this._panic -= dt;
        if (this._panic <= 0 && g.npcManager) {                      // tiroteio: os moradores perto da ação entram em pânico
            this._panic = 3;
            for (const o of this.cops.slice(0, 4)) g.npcManager.alertViolence(o.position, 22);
        }
        if (this.t >= this.duration) this.stop();
    }

    _spawnSquad(n) {
        const pm = this.game.policeManager, nav = this.game.nav;
        for (let i = 0; i < n && pm.officers.length < Config.police.maxOfficers; i++) {
            const rp = RoadPlan.nearestRoadPoint(this.center.x, this.center.z, 70);          // entra pela viela mais próxima
            const p = nav.closestPoint(new BABYLON.Vector3((rp ? rp.x : this.center.x) + (Math.random() - 0.5) * 4, 0, (rp ? rp.z : this.center.z) + (Math.random() - 0.5) * 6));
            const o = new PoliceOfficer(pm.scene, nav, p, pm._nextId++, pm.sprites, pm, true, i % 4 === 0 ? 'swat' : 'cop');
            o.op = true; o.drawn = true;
            pm.officers.push(o);
        }
    }

    // Para onde o policial da operação avança: saltos de ~25–40 u pelas vielas, cada vez mais fundo (a malha só acha caminho
    // curto, então o avanço é em etapas ao longo das ruas). Se a viela não leva a lugar nenhum, ele "dá a volta" (teleporta).
    advance(o) {
        const b = Standing._bounds(), nav = this.game.nav, a = nav.crowd.agents[o.index];
        const maxDepth = Math.min(0.8, 0.2 + (this.t / this.duration) * 0.7);
        o._advFail = a && !a.path && !a.queued ? (o._advFail || 0) + 1 : 0;
        const dp = Standing.depth(o.position.x, o.position.z), deeper = dp < maxDepth;
        const tx = o.position.x + (deeper ? -(25 + Math.random() * 15) : (Math.random() - 0.5) * 40), tz = o.position.z + (Math.random() - 0.5) * 50;
        const r = RoadPlan.nearestRoadPoint(Math.max(b.x0 + 8, tx), Math.max(b.z0 + 8, Math.min(b.z1 - 8, tz)), 45);
        const p = nav.closestPoint(new BABYLON.Vector3(r ? r.x : tx, 0, r ? r.z : tz));
        o.dest = p;
        if (o._advFail >= 2) { nav.crowd.agentTeleport(o.index, p); o.transform.position.copyFrom(p); o._advFail = 0; }
        else nav.crowd.agentGoto(o.index, p);
        o._wanderTimer = 4;
    }

    // Todo quadro de cada policial da operação: enfrenta o traficante mais próximo à vista.
    steer(u) {
        u._foeT = (u._foeT || 0) - this._dt;
        if (u._foeT <= 0 || (u.foe && !u.foe.alive)) {
            u._foeT = 0.3;
            let best = null, bd = 30;
            for (const m of this.game.gangs.members) {
                if (!m.alive || m.rag) continue;
                const d = hypot(m.position.x - u.position.x, m.position.z - u.position.z);
                if (d < bd && MapGeo.hasLineOfSight(u.position.x, u.position.z, m.position.x, m.position.z)) { bd = d; best = m; }
            }
            u.foe = best;
        }
        if (!u.foe || !u.foe.alive) { u.foe = null; return; }
        const m = u.mind; if (m) { m.sees = true; this.game.policeManager._note(m, u.foe.position.x, u.foe.position.z, 0, 0, this.game.policeManager.time); }
        this._z = this._z || new BABYLON.Vector3();
        u.setTarget(u.foe.position, this._z);
        u.setAlert(true);
    }
}
