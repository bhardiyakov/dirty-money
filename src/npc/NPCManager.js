// ============================================================================
// NPCManager — cria/atualiza os pedestres e cuida do que eles PERCEBEM:
//   - Violência (soco, chute, taco, assalto): quem VÊ (linha de visada) foge.
//   - Tiro: quem OUVE (raio grande, sem precisar ver) foge.
//   - Perseguição policial: viatura/policial em CHASE e o jogador PROCURADO
//     assustam quem estiver perto e enxergando.
//   - Contágio: pânico se espalha para vizinhos próximos (efeito manada).
// A mecânica-base de furto continua por distância (Vector3.Distance).
// ============================================================================

class NPCManager {
    // ctx = { signals } (serviços do mundo repassados aos pedestres).
    constructor(scene, nav, sprites, ctx) {
        this.scene = scene;
        this.nav = nav;
        this.sprites = sprites;
        this.ctx = ctx;
        this.npcs = [];
        this._perceiveTimer = 0;
    }

    // Mundo grande: os pedestres só existem PERTO do jogador. Escolhe onde e o que ele faz, entre rMin e rMax do foco:
    // parte corre na trilha da orla, parte toma sol, parte nada (só se há mar por perto); o resto perambula. A densidade
    // varia pelo lugar: cidade e favela cheias, ilha menos, estrada e campo quase vazios.
    _density(x, z) {
        const b = CityGrid._blockAtPoint(x, z);
        if (b) return b.district === 'favela' ? 1 : (b.district === 'island' ? 0.75 : (b.biome === 'downtown' || b.biome === 'commercial' ? 1 : 0.8));
        return RoadPlan.nearestRoadPoint(x, z, 40) ? 0.3 : 0.08;
    }

    _place(role, rMin = 0, rMax = 190) {
        const nav = this.nav, f = nav.focus, V = (p) => new BABYLON.Vector3(p.x, 0, p.z);
        const inRing = (p) => { const d = Math.hypot(p.x - f.x, p.z - f.z); return d >= rMin && d <= rMax; };
        if (role === 'jog') {
            for (let k = 0; k < 6; k++) {
                const j = CityGrid.jogNear(f.x, f.z, 300); if (!j) break;
                const p = CityGrid.jogAt(j.path, Math.random() * j.path.len);
                if (inRing(p)) return { pos: nav.closestPoint(V(p)), role };
            }
            role = null;
        } else if (role === 'sun') {
            const s = CityGrid.beachSpots.filter((q) => !q.taken && inRing(q));
            if (s.length) return { pos: nav.closestPoint(V(s[Math.floor(Math.random() * s.length)])), role };
            role = null;
        } else if (role === 'swim') {
            for (let k = 0; k < 6; k++) { const p = CityGrid.shorePoint(f); if (p && inRing(p)) return { pos: nav.closestPoint(V(p)), role }; }
            role = null;
        }
        for (let k = 0; k < 40; k++) {
            const p = nav.randomWalkable(rMin, rMax);
            if (Math.random() < this._density(p.x, p.z)) return { pos: p, role: null };
        }
        return { pos: nav.randomWalkable(rMin, rMax), role: null };
    }

    // Que roupa veste quem aparece aqui: executivos no centro, gente simples na favela, turistas na ilha, banhistas na praia...
    _style(pos, role) {
        if (role === 'sun' || role === 'swim') return 'beach';
        if (role === 'jog') return 'sport';
        const b = CityGrid._blockAtPoint(pos.x, pos.z), r = Math.random();
        if (!b) return r < 0.3 ? 'poor' : 'casual';                                              // campo e estrada
        if (b.district === 'favela') return r < 0.8 ? 'poor' : 'casual';
        if (b.district === 'island') return r < 0.4 ? 'tourist' : (r < 0.55 ? 'beach' : 'casual');
        if (b.biome === 'downtown') return r < 0.5 ? 'biz' : 'casual';
        if (b.biome === 'commercial') return r < 0.15 ? 'biz' : (r < 0.3 ? 'tourist' : 'casual');
        return r < 0.05 ? 'biz' : 'casual';
    }

    _roleFor(r) {
        const M = Config.npc.mix;
        return r < M.jog ? 'jog' : (r < M.jog + M.sun ? 'sun' : (r < M.jog + M.sun + M.swim ? 'swim' : null));
    }

    spawn(count = Config.npc.count) {
        for (let i = 0; i < count; i++) {
            const { pos, role } = this._place(this._roleFor(i / count), 0, 190);
            const npc = new NPC(this.scene, this.nav, pos, i, this.sprites, this.ctx, role);
            npc.setStyle(this._style(pos, role));
            this.npcs.push(npc);
        }
    }


    // Remove um pedestre de vez (os extras do baile): sai do crowd e some do mundo.
    removeNpc(npc) {
        const i = this.npcs.indexOf(npc);
        if (i >= 0) this.npcs.splice(i, 1);
        if (npc.free) { try { npc._clearActivity(); } catch (e) { /* ok */ } }
        if (npc.index >= 0) { this.nav.crowd.removeAgent(npc.index); npc.index = -1; }
        npc.alive = false;
        if (npc.actor) npc.actor.dispose();
        if (npc.transform) npc.transform.dispose();
    }
    // Quem ficou para trás (> recycleDist do jogador) reaparece perto dele, fora da tela, com nova vocação.
    _recycle(dt) {
        this._recT = (this._recT || 0) - dt;
        if (this._recT > 0) return;
        this._recT = 0.4;
        const f = this.nav.focus, far2 = Config.npc.recycleDist * Config.npc.recycleDist;
        for (const npc of this.npcs) {
            if (npc.party || !npc.alive || npc.rag || npc.state === 'HURT' || npc.surrendered || npc.state === 'FLEE') continue;
            const dx = npc.position.x - f.x, dz = npc.position.z - f.z;
            if (dx * dx + dz * dz < far2) continue;
            const { pos, role } = this._place(this._roleFor(Math.random()), 75, 200);
            npc.relocate(pos, role, this._style(pos, role));
            return;                                            // um por vez (sem engasgo)
        }
    }

    // env = { playerPos, wanted (nível), chasers: [{ position, car: bool }] }
    update(dt, env) {
        this._rain(dt);
        for (const npc of this.npcs) npc.update(dt);
        this._recycle(dt);
        if (env) this._perceive(dt, env);
    }

    // ------------------------------------------------------------- chuva
    // Começou a chover: cada pedestre (escalonado em ~5 s; na garoa nem todos ligam) corre para o abrigo mais perto (toldo de loja,
    // cobertura de posto) e abre o guarda-chuva (ShelterState). Quando a chuva passa, fecha e volta à vida normal.
    _rain(dt) {
        const k = Weather.cur ? Weather.cur.k : 0;
        for (const npc of this.npcs) {
            if (k < 0.08) {
                npc._rainT = null;
                if (npc.umbrella) { npc.umbrella = false; if (npc.state === 'WANDER' && npc.role) npc.fsm.setState(npc._roleState()); }
                continue;
            }
            if (k < 0.2 || !npc.alive || npc.rag || npc.umbrella) continue;
            const st = npc.state;
            if (st === 'SHELTER' || st === 'FLEE' || st === 'HURT' || st === 'SURRENDER' || st === 'RAG' || st === 'DEAD') continue;
            if (npc._rainT == null) npc._rainT = Math.random() * 5;
            npc._rainT -= dt;
            if (npc._rainT > 0) continue;
            if (Math.random() < Math.min(1, k * 2.2)) npc.fsm.setState(new ShelterState(npc));
            else npc._rainT = 25;                                  // esse aguenta a chuva fina: reconsidera depois
        }
    }

    // ------------------------------------------------------------- percepção
    _sees(npc, pos) {
        return MapGeo.hasLineOfSight(npc.position.x, npc.position.z, pos.x, pos.z);
    }

    _perceive(dt, env) {
        this._perceiveTimer -= dt;
        if (this._perceiveTimer > 0) return;
        this._perceiveTimer = 0.3;
        const C = Config.npc;

        // Ameaças ativas: o procurado (você) e quem está te perseguindo.
        const sources = [];
        if (env.wanted > 0) sources.push({ pos: env.playerPos, r: C.wantedRadius });
        for (const ch of env.chasers) sources.push({ pos: ch.position, r: ch.car ? C.chaseRadiusCar : C.chaseRadiusOfficer });

        for (const npc of this.npcs) {
            if (!npc.alive || npc.state === 'HURT') continue;
            for (const s of sources) {
                if (BABYLON.Vector3.Distance(npc.position, s.pos) < s.r && this._sees(npc, s.pos)) {
                    npc.panic(s.pos);
                    break;
                }
            }
        }

        // Contágio: quem acabou de se assustar arrasta os vizinhos.
        for (const a of this.npcs) {
            if (!a.alive || a.state !== 'FLEE' || a.fleeAge > 1.2) continue;
            for (const b of this.npcs) {
                if (b === a || !b.alive || b.state === 'FLEE' || b.state === 'HURT') continue;
                if (BABYLON.Vector3.Distance(a.position, b.position) < C.herdRadius && Math.random() < C.herdChance) b.panic(a.threat);
            }
        }
    }

    // Tiro: todos que OUVEM (mesmo sem ver) entram em pânico.
    alertShot(pos) {
        const p = new BABYLON.Vector3(pos.x, 0, pos.z);
        for (const npc of this.npcs) {
            if (npc.alive && BABYLON.Vector3.Distance(npc.position, p) < Config.npc.shotRadius) npc.panic(p);
        }
    }

    // Violência/assalto: só reage quem está perto E enxerga o local.
    // `except`: um pedestre que não reage (a vítima do assalto, que já está rendida). Retorna quantos fugiram.
    alertViolence(pos, radius = Config.npc.violenceRadius, except = null) {
        const p = new BABYLON.Vector3(pos.x, 0, pos.z);
        let n = 0;
        for (const npc of this.npcs) {
            if (npc === except) continue;
            if (npc.alive && BABYLON.Vector3.Distance(npc.position, p) < radius && this._sees(npc, p)) { npc.panic(p); n++; }
        }
        return n;
    }

    // Pedestre mais próximo de `pos` (até `range`) que dá para abordar: vivo, de pé no NavMesh (não deitado/nadando),
    // à vista e que passa em `ok(npc)`. Usado pelo assalto e pelo furto.
    nearestTarget(pos, range, ok = null) {
        let nearest = null, best = range;
        for (const npc of this.npcs) {
            if (!npc.alive || npc.rag || npc.free || npc.index < 0) continue;
            if (ok && !ok(npc)) continue;
            const d = Math.hypot(npc.position.x - pos.x, npc.position.z - pos.z);
            if (d < best && this._sees(npc, pos)) { best = d; nearest = npc; }
        }
        return nearest;
    }

    // Nº de pedestres (que não o roubado) dentro do raio — testemunhas do crime.
    countWitnesses(pos, excludeId, radius) {
        let n = 0;
        for (const npc of this.npcs) {
            if (npc.id === excludeId) continue;
            if (BABYLON.Vector3.Distance(pos, npc.position) < radius) n++;
        }
        return n;
    }

    get count() {
        return this.npcs.length;
    }

    get fleeingCount() {
        return this.npcs.reduce((n, npc) => n + (npc.alive && npc.state === 'FLEE' ? 1 : 0), 0);
    }

    get deadCount() {
        return this.npcs.reduce((n, npc) => n + (npc.alive ? 0 : 1), 0);
    }

    // Quantos estão esperando o sinal abrir (para o HUD/debug).
    get waitingCount() {
        return this.npcs.reduce((n, npc) => n + (npc.waiting ? 1 : 0), 0);
    }
}
