// ============================================================================
// GangManager — os traficantes armados da favela. A favela tem GRUPOS fixos de 3–4 traficantes (≈55 só no fundo, mais alguns
// no meio e na entrada), que andam juntos em ronda pelas vielas: a parte de cima (fundo, Standing.depth ≥ 0,5) tem 15 grupos.
// Os grupos são "streamed": só viram gente de verdade (PoliceOfficer com `kind` gang1..3: pistola/SMG/fuzil, sprite civ 'poor',
// tiro com owner 'gang') quando o jogador chega a ~130 u; ao se afastar (~170 u) somem, guardando posição e quantos estão vivos
// (mortos voltam, um a um, depois de ~60 s). Hostilidade:
//   • o jogador é MORADOR do território (C.V): neutro. Fica hostil se a moral do tráfico < 30 OU da comunidade < 20, ou se
//     atacar um deles (provocado, 60 s). Num território de fora ele é estranho: sempre hostil. Se um do grupo te enxerga hostil,
//     o grupo todo sabe;
//   • sem hostilidade eles só patrulham armados. Com alarme dos olheiros (FavelaWatch) e invasão policial, os grupos marcham
//     em direção à polícia; policial e traficante se enfrentam quando se veem.
// Reaproveita a interface do PoliceManager (weaponsFree/combat/events/mind) que o PoliceOfficer usa.
// ============================================================================

class GangManager {
    constructor(game) {
        this.game = game;
        this.members = [];
        this.groups = null;           // construídos na 1ª atualização (precisam dos quarteirões)
        this.time = 0;
        this._nextId = 5000;
        this._streamT = 0;
        this.provoked = 0;            // segundos de provocação restantes (atacou um traficante): todos ficam hostis
        this.maxActive = 36;          // teto de traficantes de verdade ao mesmo tempo
        this.sight = 30;              // alcance de visão
        this.safeRadius = 38;         // em volta da safe house não há ronda
        this.streamIn = 130; this.streamOut = 170;
    }

    // ---- interface usada pelo PoliceOfficer ----
    get nav() { return this.game.nav; }
    get combat() { return this.game.combat; }
    get weaponsFree() { return true; }                               // quem te enxerga e está hostil atira
    get events() { return this._events || (this._events = {
        onOfficerHit: (o, source) => { if (source === 'player') this._provoke(o); },
        onOfficerKilled: (o, source) => {
            if (source === 'player' || (source !== 'police' && source !== 'gang')) this.game.pickups.dropLoot(o.position, 'gang');      // (tiroteio polícia × tráfico ou entre traficantes não gera loot)
            if (source === 'player') { Standing.add('traffic', -2); Standing.add('community', 1); Standing.addHeat(4, 'tiroteio na favela'); this._provoke(o); }
        },
    }); }

    _mind(u) { return u.mind || (u.mind = { sees: false, x: 0, z: 0, vx: 0, vz: 0, t: -1e9 }); }

    _provoke(by) {
        this.provoked = 60;
        const p = this.game.player.position;
        for (const u of this.members) if (u.alive && u.distanceTo(by.position) < 45) { const m = this._mind(u); m.x = p.x; m.z = p.z; m.t = this.time; }
    }

    // ---------------------------------------------------------------- grupos
    get total() { return this.groups ? this.groups.reduce((s, g) => s + g.alive, 0) : 0; }
    get deepTotal() { return this.groups ? this.groups.filter((g) => g.deep).reduce((s, g) => s + g.alive, 0) : 0; }

    _buildGroups() {
        const b = Standing._bounds(), rng = Pixel.rng(9001), W = b.x1 - b.x0, home = SafeHouse.spawnWorld();
        this.groups = [];
        const make = (dmin, dmax, size) => {
            for (let t = 0; t < 80; t++) {
                const x = b.x1 - (dmin + rng() * (dmax - dmin)) * W, z = b.z0 + 20 + rng() * (b.z1 - b.z0 - 40);
                const r = RoadPlan.nearestRoadPoint(x, z, 40);
                if (!r || r.edge.cls !== 'fav' || !Standing.inFavela(r.x, r.z) || Standing.depth(r.x, r.z) < dmin - 0.03) continue;
                if (home && hypot(r.x - home.x, r.z - home.z) < this.safeRadius) continue;
                if (this.groups.some((g) => hypot(g.x - r.x, g.z - r.z) < 18)) continue;
                this.groups.push({ x: r.x, z: r.z, size, alive: size, minDepth: dmin, deep: dmin >= 0.5, wp: { x: r.x, z: r.z }, wpT: 0, members: [], active: false, regrow: 60 });
                return;
            }
        };
        for (let i = 0; i < 15; i++) make(0.5, 1.0, i % 3 === 2 ? 3 : 4);      // a parte de cima: 15 grupos = 55 traficantes
        for (let i = 0; i < 4; i++) make(0.25, 0.5, 3);                          // meio do morro
        for (let i = 0; i < 3; i++) make(0.14, 0.25, 3);                         // perto da entrada
    }

    // Tipo de arma pela profundidade (com sorteio para misturar).
    _kind(d) {
        const r = Math.random();
        if (d < 0.4) return r < 0.85 ? 'gang1' : 'gang2';
        if (d < 0.7) return r < 0.3 ? 'gang1' : (r < 0.85 ? 'gang2' : 'gang3');
        return r < 0.15 ? 'gang2' : 'gang3';
    }

    _spawnGroup(g) {
        const nav = this.nav, d = Standing.depth(g.x, g.z);
        for (let i = 0; i < g.alive; i++) {
            const a = i / g.size * Math.PI * 2, p = nav.closestPoint(new BABYLON.Vector3(g.x + Math.cos(a) * 2, 0, g.z + Math.sin(a) * 2));
            const o = new PoliceOfficer(this.game.scene, nav, p, this._nextId++, this.game.sprites, this, true, this._kind(d));
            o.drawn = true; o.group = g; o.slot = i;
            g.members.push(o); this.members.push(o);
        }
        g.active = true; g.wpT = 0;
    }

    _despawnGroup(g) {
        let n = 0, sx = 0, sz = 0;
        for (const o of g.members) if (o.alive) { n++; sx += o.position.x; sz += o.position.z; }
        if (n) { g.x = sx / n; g.z = sz / n; g.alive = n; }
        for (const o of g.members) { const i = this.members.indexOf(o); if (i >= 0) this.members.splice(i, 1); o.dispose(); }
        g.members = []; g.active = false;
    }

    // Destino de ronda do grupo (uma viela a 25–45 u do líder); com alarme/operação, rumo à polícia mais próxima.
    _pickWp(g, leader) {
        const b = Standing._bounds(), op = this.game.op, home = SafeHouse.spawnWorld();
        let ax = null, az = null;
        if (op && op.active && Standing.alarm > 0) {
            let bd = 150;
            for (const c of op.cops) { const d = hypot(c.position.x - leader.position.x, c.position.z - leader.position.z); if (d < bd) { bd = d; ax = c.position.x; az = c.position.z; } }
        }
        for (let t = 0; t < 8; t++) {
            let a = Math.random() * Math.PI * 2, r = 25 + Math.random() * 20;
            if (ax !== null && t < 6) { a = Math.atan2(az - leader.position.z, ax - leader.position.x) + (Math.random() - 0.5) * 0.8; }
            const x = leader.position.x + Math.cos(a) * r, z = leader.position.z + Math.sin(a) * r;
            const p = RoadPlan.nearestRoadPoint(x, z, 25);
            if (!p || p.edge.cls !== 'fav' || !Standing.inFavela(p.x, p.z)) continue;
            if (Standing.depth(p.x, p.z) < g.minDepth - 0.08 && ax === null) continue;       // cada grupo patrulha a sua faixa
            if (home && hypot(p.x - home.x, p.z - home.z) < this.safeRadius) continue;
            g.wp = { x: p.x, z: p.z }; return;
        }
        g.wp = { x: leader.position.x, z: leader.position.z };
    }

    // Chamado pelo PoliceOfficer ao escolher o próximo destino de ronda: anda em formação em volta do ponto do grupo.
    groupDest(o) {
        const g = o.group, a = (o.slot / g.size) * Math.PI * 2 + this.time * 0.05, r = 2.4;
        o.dest = this.nav.closestPoint(new BABYLON.Vector3(g.wp.x + Math.cos(a) * r, 0, g.wp.z + Math.sin(a) * r));
        this.nav.crowd.agentGoto(o.index, o.dest);
        o._wanderTimer = 3;
    }

    _remove(i) {
        const o = this.members[i], g = o.group;
        if (g) { const k = g.members.indexOf(o); if (k >= 0) g.members.splice(k, 1); }
        o.dispose(); this.members.splice(i, 1);
    }

    // Limpa todos (ex.: acordou em outro lugar): os grupos voltam a existir só como dados.
    clear() { if (this.groups) for (const g of this.groups) if (g.active) this._despawnGroup(g); }

    update(dt, pos, vel, hidden) {
        this.time += dt;
        if (this.provoked > 0) this.provoked -= dt;
        const g = this.game, pl = g.player;
        if (!this.groups) this._buildGroups();
        this.angry = Standing.hostile(Standing.territoryAt(pos.x, pos.z));
        const hostile = (this.angry || this.provoked > 0) && pl.alive && !hidden;

        // 1) Streaming dos grupos (2×/s) e recomposição dos que perderam gente.
        this._streamT -= dt;
        if (this._streamT <= 0) {
            this._streamT = 0.5;
            for (const G of this.groups) {
                const d = hypot(G.x - pos.x, G.z - pos.z);
                if (!G.active) {
                    if (G.alive < G.size) { G.regrow -= 0.5; if (G.regrow <= 0) { G.alive++; G.regrow = 60; } }
                    if (G.alive > 0 && d < this.streamIn && this.members.length + G.alive <= this.maxActive) this._spawnGroup(G);
                } else if (d > this.streamOut) this._despawnGroup(G);
            }
        }

        // 2) Percepção e ação de cada um.
        const op = g.op && g.op.active, cops = op ? g.op.cops : [];
        this._tp = this._tp || new BABYLON.Vector3(); this._tv = this._tv || new BABYLON.Vector3();
        for (const G of this.groups) if (G.active) {                 // ponto de ronda do grupo (segue o líder)
            const leader = G.members.find((o) => o.alive && !o.rag);
            if (!leader) continue;
            G.wpT -= dt;
            if (G.wpT <= 0 || hypot(leader.position.x - G.wp.x, leader.position.z - G.wp.z) < 4) { this._pickWp(G, leader); G.wpT = 12 + Math.random() * 8; }
        }
        for (let i = this.members.length - 1; i >= 0; i--) {
            const u = this.members[i], G = u.group;
            if (!u.alive) {
                if (!u._counted) { u._counted = true; if (G && G.alive > 0) { G.alive--; G.regrow = 60; } }
                u.update(dt);
                if (u.deadTimer <= 0) this._remove(i);
                continue;
            }
            if (u.rag) { u.update(dt); continue; }
            const m = this._mind(u), p = u.position, dist = hypot(p.x - pos.x, p.z - pos.z);
            m.sees = hostile && dist < this.sight * (this.angry ? 1.25 : 1) && MapGeo.hasLineOfSight(p.x, p.z, pos.x, pos.z);
            if (m.sees) {
                this._note(m, pos, vel);
                if (G) for (const o of G.members) if (o !== u && o.alive) this._note(this._mind(o), pos, vel);      // o grupo todo fica sabendo
            }
            const fresh = this.time - m.t < 6;
            this._tp.set(m.x, 0, m.z); this._tv.set(m.sees ? m.vx : 0, 0, m.sees ? m.vz : 0);
            // operação policial: enfrenta o policial mais próximo à vista (independe de o jogador ser hostil ou neutro)
            let cop = null;
            if (cops.length) { let bd = 30; for (const c of cops) { const d = hypot(c.position.x - p.x, c.position.z - p.z); if (d < bd && MapGeo.hasLineOfSight(p.x, p.z, c.position.x, c.position.z)) { bd = d; cop = c; } } }
            if (cop) { m.sees = true; m.t = this.time; u.setTarget(cop.position, this._tv.set(0, 0, 0)); u.setAlert(true); }
            else { u.setTarget(this._tp, this._tv); u.setAlert(hostile && (m.sees || fresh)); }
            u.update(dt);
        }
    }

    _note(m, pos, vel) { m.x = pos.x; m.z = pos.z; m.vx = vel ? vel.x : 0; m.vz = vel ? vel.z : 0; m.t = this.time; }
}
