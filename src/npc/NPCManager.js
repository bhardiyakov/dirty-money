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
        const L = typeof Landmarks !== 'undefined' ? Landmarks.crowd(x, z) : null;                  // (marcos: a esplanada do Colosso, o calçadão, o portão do Morro do Vigia)
        if (L !== null) return L;
        const zn = typeof Bairros !== 'undefined' ? Bairros.zoneAt(x, z) : null;
        if (zn) return CityGrid._blockAtPoint(x, z) ? 0.9 : 0.4;                                  // (Vila da Roça e Alto da Serra: a vila cheia, o resto com gente)
        const b = CityGrid._blockAtPoint(x, z);
        if (b) return b.district === 'favela' ? 1 : (b.district === 'island' ? 0.75 : (b.biome === 'downtown' || b.biome === 'commercial' ? 1 : 0.8));
        return RoadPlan.nearestRoadPoint(x, z, 40) ? 0.3 : 0.08;
    }

    _place(role, rMin = 0, rMax = 190) {
        const nav = this.nav, f = nav.focus, V = (p) => new BABYLON.Vector3(p.x, 0, p.z);
        const inRing = (p) => { const d = hypot(p.x - f.x, p.z - f.z); return d >= rMin && d <= rMax; };
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
            if (NPC.offRoad(p.x, p.z) && Math.random() < this._density(p.x, p.z)) return { pos: p, role: null };      // (na calçada, nunca na pista)
        }
        return { pos: nav.randomWalkable(rMin, rMax), role: null };
    }

    // Que roupa veste quem aparece aqui: executivos no centro, gente simples na favela, turistas na ilha, banhistas na praia...
    _style(pos, role) {
        if (role === 'sun' || role === 'swim') return 'beach';
        if (role === 'jog') return 'sport';
        const b = CityGrid._blockAtPoint(pos.x, pos.z), r = Math.random(), zn = typeof Bairros !== 'undefined' ? Bairros.zoneAt(pos.x, pos.z) : null;
        if (zn === 'roca') return r < 0.75 ? 'poor' : 'casual';                                    // gente simples da roça
        const lm = typeof Landmarks !== 'undefined' ? Landmarks.crowdStyle(pos.x, pos.z, r) : null;      // torcida no Colosso, turistas no Corcovado
        if (lm) return lm;
        if (zn === 'serra') return r < 0.35 ? 'biz' : (r < 0.6 ? 'tourist' : 'casual');           // rico de casaco e turista de inverno
        if (b && b.faction === 'cpc' && typeof NightLife !== 'undefined' && NightLife.on) return NightLife.crowdStyle();      // (a noite do Mirante)
        if (!b) return r < 0.3 ? 'poor' : 'casual';                                              // campo e estrada
        if (b.district === 'favela') return r < 0.8 ? 'poor' : 'casual';
        if (b.district === 'island') return r < 0.4 ? 'tourist' : (r < 0.55 ? 'beach' : 'casual');
        if (b.biome === 'downtown') return r < 0.5 ? 'biz' : 'casual';
        if (b.biome === 'commercial') return r < 0.15 ? 'biz' : (r < 0.3 ? 'tourist' : 'casual');
        return r < 0.05 ? 'biz' : 'casual';
    }

    _roleFor(r) {
        const M = (typeof StreetLife !== 'undefined' && StreetLife.mix()) || Config.npc.mix;      // (a hora do dia muda quem corre, toma sol, nada)
        return r < M.jog ? 'jog' : (r < M.jog + M.sun ? 'sun' : (r < M.jog + M.sun + M.swim ? 'swim' : null));
    }

    spawn(count = Config.npc.count) {
        for (let i = 0; i < count; i++) {
            const { pos, role } = this._place(this._roleFor(i / count), 0, Config.npc.placeMax);
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
    // ------------------------------------------------------------- POPULAÇÃO EM VOLTA DO JOGADOR
    // Todos os pedestres vivem no RAIO do jogador (recycleDist): quem fica para trás reaparece perto dele, num lugar ESCONDIDO — fora da
    // câmera (atrás, dos lados) ou ao fundo, já dentro da névoa da distância (vem chegando) —, nunca surgindo no meio da tela. Depois de um
    // teleporte (muita gente longe de uma vez) repovoa depressa. E NA VISÃO tem sempre gente (_fillView): pelo menos visTarget() pedestres.
    _calm(npc) { return npc.alive && !npc.rag && !npc.party && !npc._rage && !npc.free && npc.state !== 'HURT' && !npc.surrendered && npc.state !== 'FLEE'; }
    _recycle(dt) {
        this._recT = (this._recT || 0) - dt;
        if (this._recT > 0) return;
        this._recT = 0.2;
        const f = this.nav.focus, far2 = Config.npc.recycleDist * Config.npc.recycleDist, far = [];
        for (const npc of this.npcs) {
            if (!this._calm(npc)) continue;
            const dx = npc.position.x - f.x, dz = npc.position.z - f.z;
            if (dx * dx + dz * dz >= far2) far.push(npc);
        }
        const n = Math.min(far.length, far.length > 12 ? (Config.perf.halfFar ? 3 : 8) : 1), R = this._ring();       // (teleporte: 8 por vez — 3 no aparelho fraco, sem o pico; no dia a dia, um por vez)
        for (let i = 0; i < n; i++) {
            const close = R[0] < 40 && Math.random() < 0.65;                                  // (2 em 3 bem perto: a gente se concentra em volta de você)
            const { pos, role } = this._hidden(this._roleFor(Math.random()), R[0], close ? Math.min(R[1], 65) : R[1]);
            far[i].relocate(pos, role, this._style(pos, role));
            this.recycled = (this.recycled || 0) + 1;
        }
    }

    // A câmera de agora: a matriz vista×projeção, onde ela está e até onde se enxerga (o fim da névoa na câmera de 3ª pessoa).
    _viewer() {
        const C = typeof CompassCamera !== 'undefined' && CompassCamera.current, cam = C && C.camera;
        if (!cam || C.flat) return null;
        const t = performance.now();
        if (this._vw && t - this._vw.t < 150) return this._vw;
        const H = Config.camera.chase, chase = C.chase > 0.5;
        return (this._vw = { t, M: cam.getViewMatrix().multiply(cam.getProjectionMatrix()), vp: new BABYLON.Viewport(0, 0, 1, 1), cam: cam.position.clone(),
            far: chase ? H.far || 125 : 1e9, fog: chase ? H.near || 55 : 1e9 });
    }
    // O ponto do chão (a 1 m de altura, no relevo daquele lugar) aparece na tela? Projeta na tela: dentro do retângulo, na frente da
    // câmera e antes do fim da névoa.
    _inView(x, z, V = this._viewer()) {
        if (!V) return false;
        const p = this._vp || (this._vp = new BABYLON.Vector3()), o = this._vo || (this._vo = new BABYLON.Vector3());
        p.set(x, (typeof Relief !== 'undefined' && Relief.on ? Relief.at(x, z) : 0) + 1, z);
        if (BABYLON.Vector3.Distance(p, V.cam) > V.far) return false;
        BABYLON.Vector3.ProjectToRef(p, BABYLON.Matrix.IdentityReadOnly, V.M, V.vp, o);
        return o.z > 0 && o.z < 1 && o.x > -0.02 && o.x < 1.02 && o.y > -0.02 && o.y < 1.02;
    }
    // Lugar ESCONDIDO para alguém aparecer: fora da tela, ou ao fundo, já na névoa.
    _hidden(role, rMin, rMax) {
        const V = this._viewer();
        let last = null;
        for (let k = 0; k < 10; k++) {
            const P = this._place(role, rMin, rMax);
            last = P;
            if (!V) return P;
            const p = P.pos;
            if (!this._inView(p.x, p.z, V) || hypot(p.x - V.cam.x, p.z - V.cam.z) > V.fog * 0.95) return P;
        }
        return last;
    }
    // Quantos pedestres pelo menos NA TELA: 10 de dia (×StreetLife.density: o rush e o almoço põem mais gente; madrugada e chuva, menos).
    visTarget() {
        const g = typeof window !== 'undefined' && window.game;
        if (!g || !g.dayNight) return 10;
        const h = g.dayNight.hour, W = typeof Weather !== 'undefined' && Weather.cur, rain = W ? W.k : 0;
        const d = typeof StreetLife !== 'undefined' ? StreetLife.density(h, rain) : 1, life = typeof Life !== 'undefined' ? Life.mul() : 1;
        let t = 10 * d * (0.6 + 0.4 * life);
        if (h >= 6 && h < 22 && rain < 0.3) t = Math.max(10, t);                         // (de dia e sem chuva: nunca menos de 10)
        return Math.max(2, Math.round(Math.min(t, this.npcs.length * 0.4)));
    }
    // Faltou gente na tela: traz quem está fora da vista (os mais longe primeiro) para a ENTRADA da cena — ao fundo, na névoa (vem
    // chegando), ou logo fora da beirada da tela (entra andando). Até 4 por vez, a cada meio segundo.
    _fillView(dt) {
        this._fvT = (this._fvT || 0) - dt;
        if (this._fvT > 0) return;
        this._fvT = 0.5;
        const g = typeof window !== 'undefined' && window.game, V = this._viewer();
        if (!g || !V || (typeof Interiors !== 'undefined' && Interiors.active)) return;
        const f = this.nav.focus, spare = [];
        let vis = 0;
        for (const npc of this.npcs) {
            if (!npc.alive) continue;
            if (this._inView(npc.position.x, npc.position.z, V)) { vis++; continue; }
            if (this._calm(npc) && !npc.mugger && !npc.thief && /^(WANDER|IDLE|JOG)$/.test(npc.state)) spare.push(npc);
        }
        const want = this.visTarget();
        this.visible = vis; this.visWant = want;
        if (vis >= want || !spare.length) return;
        spare.sort((a, b) => hypot(b.position.x - f.x, b.position.z - f.z) - hypot(a.position.x - f.x, a.position.z - f.z));
        this._aspect = g.gameEngine && g.gameEngine.engine ? g.gameEngine.engine.getAspectRatio(CompassCamera.current.camera) : 1.6;
        for (let i = 0, k = Math.min(4, want - vis, spare.length); i < k; i++) {
            const E = this._entry(V);
            if (!E) break;
            const n = spare[i];
            n.relocate(E.p, null, this._style(E.p, null)); n._fresh = 3;
            const to = this.nav.closestPoint(new BABYLON.Vector3(E.to.x, 0, E.to.z), 6);
            if (to && n.gotoTarget) n.gotoTarget(to);                                         // (anda para dentro da cena)
            this.filled = (this.filled || 0) + 1;
            if (this._inView(E.p.x, E.p.z, V)) this.filledIn = (this.filledIn || 0) + 1;
        }
    }
    // Ponto do chão que aparece em (u, v) da tela (0..1; v = 0 no alto): o raio da câmera por ali até o chão do lugar.
    _screenGround(u, v) {
        const C = CompassCamera.current, cam = C && C.camera;
        if (!cam) return null;
        const I = BABYLON.Matrix.IdentityReadOnly, view = cam.getViewMatrix(), proj = cam.getProjectionMatrix();
        const a = BABYLON.Vector3.Unproject(new BABYLON.Vector3(u, v, 0), 1, 1, I, view, proj), b = BABYLON.Vector3.Unproject(new BABYLON.Vector3(u, v, 1), 1, 1, I, view, proj);
        const y0 = C.lift || 0, t = (y0 - a.y) / (b.y - a.y);
        if (!(t > 0 && t < 1)) return null;
        return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
    // Entrada da cena. A pé a câmera olha para baixo: o chão visível vai só até a borda de cima da tela (~25–40 m) — a pessoa aparece
    // AO FUNDO, na faixa de cima da tela (pequena, longe), e vem andando para perto; ou logo FORA da beirada (dos lados), já andando para
    // dentro da cena. Devolve { p, to } (onde aparece e para onde vai) ou null.
    _entry(V) {
        const f = this.nav.focus, snap = (q) => { if (!q) return null; const c = this.nav.closestPoint(new BABYLON.Vector3(q.x, 0, q.z), 5); return c && this.nav.walk(c.x, c.z) && NPC.offRoad(c.x, c.z) && hypot(c.x - f.x, c.z - f.z) > 7 ? c : null; };
        const mid = this._screenGround(0.5, 0.6) || f;
        for (let k = 0; k < 16; k++) {                                                    // ao fundo: a faixa de cima da tela
            const c = snap(this._screenGround(0.06 + Math.random() * 0.88, 0.02 + Math.random() * 0.2));
            if (c && this._inView(c.x, c.z, V)) return { p: c, to: { x: mid.x + (Math.random() - 0.5) * 14, z: mid.z + (Math.random() - 0.5) * 14 } };
        }
        for (let k = 0; k < 16; k++) {                                                    // logo fora da beirada, dos lados
            const side = Math.random() < 0.5 ? -0.1 : 1.1, c = snap(this._screenGround(side, 0.25 + Math.random() * 0.6));
            if (c && !this._inView(c.x, c.z, V)) return { p: c, to: { x: mid.x + (Math.random() - 0.5) * 10, z: mid.z + (Math.random() - 0.5) * 10 } };
        }
        return null;
    }

    // env = { playerPos, wanted (nível), chasers: [{ position, car: bool }] }
    update(dt, env) {
        this._rain(dt);
        // Zonas (core/Spatial.js): pedestre na tela roda FSM/sprite todo quadro; perto da tela, a cada 3; longe ("dormindo"), a cada 8 —
        // escalonado por id, com o dt somado. O crowd do Recast continua movendo todos; só a lógica e a animação (invisíveis) espaçam.
        const halfFar = Config.perf.halfFar, F = env && env.playerPos, fx = F ? F.x : Zones.cx, fz = F ? F.z : Zones.cz, hR = Config.perf.halfFarR || 22, hR2 = hR * hR;
        for (const npc of this.npcs) {
            if (npc.alive && !npc.rag && npc.state !== 'FLEE' && npc.state !== 'HURT') {
                if (Zones.asleep(npc.position.x, npc.position.z)) {           // fora da bolha acordada: quase dorme — lógica ~1×/s (para continuar
                    npc._lodDt = (npc._lodDt || 0) + dt;                         // passeando e voltar a cruzar a tela), sem animação no meio
                    if (!Zones.every(npc.id, 2, 3, 30)) continue;
                    npc.update(Math.min(npc._lodDt, 1)); npc._lodDt = 0;
                    continue;
                }
                const tier = Zones.tier(npc.position.x, npc.position.z);
                if (tier > 0) {
                    npc._lodDt = (npc._lodDt || 0) + dt;
                    if (!Zones.every(npc.id, tier)) continue;
                    npc.update(Math.min(npc._lodDt, 0.4)); npc._lodDt = 0;
                    continue;
                }
                // NA TELA mas longe do jogador (aparelho fraco — Config.perf.halfFar): a lógica e a animação a cada 2 quadros, com o dt
                // somado; o boneco segue o agente da navegação todo quadro (o passo continua liso, só a pose anda a 15 Hz)
                if (halfFar && !npc.free) {
                    const dx = npc.position.x - fx, dz = npc.position.z - fz;
                    if (npc._fresh > 0) npc._fresh -= dt;                              // (quem acabou de entrar em cena pelo _fillView: lógica inteira por 3 s)
                    else if (dx * dx + dz * dz > hR2 && ((Zones.frame + (npc.id | 0)) & 1)) { npc._lodDt = (npc._lodDt || 0) + dt; npc.actor.setPosition(npc.transform.position.x, npc.transform.position.z); continue; }
                }
            }
            if (npc._lodDt) { npc.update(npc._lodDt + dt); npc._lodDt = 0; } else npc.update(dt);
        }
        this._recycle(dt);
        this._fillView(dt);
        if (env) this._perceive(dt, env);
    }

    // Um pedestre do pool vira OUTRA pessoa por um tempo (o motorista de uma briga de trânsito — RoadRage): o mais longe do jogador (fora
    // da tela: ninguém o vê sumir), calmo e fora de outras histórias; `prefer(npc)` passa na frente. Sai do crowd (npc.free) e vai para
    // (x, z). null = ninguém disponível.
    borrow(x, z, prefer = null) {
        const f = this.nav.focus, ok = (n) => n.alive && !n.rag && !n.party && !n.mugger && !n.thief && !n._rage && !n.free && n.index >= 0 && /^(WANDER|IDLE|JOG)$/.test(n.state);
        let best = null, bs = -Infinity;
        for (const n of this.npcs) {
            if (!ok(n)) continue;
            const sc = hypot(n.position.x - f.x, n.position.z - f.z) + (prefer && prefer(n) ? 1e4 : 0);
            if (sc > bs) { bs = sc; best = n; }
        }
        if (!best) return null;
        best.fsm.setState(new IdleState(best));                 // (sai do estado de antes direito)
        best._clearActivity();
        best.waiting = null; best.crossing = null; best.fleeAge = 99;
        best.enterFree();
        best.transform.position.set(x, 0, z);
        best.hp = best.maxHp;
        return best;
    }
    // Devolve um pedestre emprestado: reaparece longe, fora da tela, como outra pessoa (o desenho de antes volta — NPC.restoreLook).
    release(npc) {
        if (!npc.alive || npc.rag) { npc._rage = null; return; }      // (o corpo / quem está voando segue o caminho normal)
        const { pos, role } = this._place(this._roleFor(Math.random()), ...this._ring());
        npc.relocate(pos, role, this._style(pos, role));
    }
    // Onde quem é reciclado reaparece: um anel em volta do jogador, FORA da tela a pé (placeMin) e não muito longe (placeMax) — a gente
    // fica concentrada perto de você (antes: 75–200 u, a rua parecia vazia). De madrugada (StreetLife.recycleMin) o anel se afasta.
    _ring() {
        const R = Config.npc.recycleDist, a = Math.min(R - 25, Math.max(Config.npc.placeMin, this.recycleMin || 0));
        return [a, Math.min(R - 5, Math.max(a + 20, Config.npc.placeMax))];
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
            if (st === 'SHELTER' || st === 'FLEE' || st === 'HURT' || st === 'SURRENDER' || st === 'RAG' || st === 'DEAD' || st === 'RAGE' || st === 'FIGHT') continue;
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

        // Contágio: quem acabou de se assustar arrasta os vizinhos (grade espacial: só os pedestres das células em volta).
        const G = this._grid || (this._grid = new SpatialHash(C.herdRadius)), q = this._q || (this._q = []);
        G.clear();
        for (const n of this.npcs) if (n.alive) G.insert(n, n.position.x, n.position.z);
        for (const a of this.npcs) {
            if (!a.alive || a.state !== 'FLEE' || a.fleeAge > 1.2) continue;
            for (const b of G.query(a.position.x, a.position.z, C.herdRadius, q)) {
                if (b === a || !b.alive || b.state === 'FLEE' || b.state === 'HURT' || b._rage) continue;      // (o motorista da briga de trânsito não se assusta com quem passa correndo)
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
        if (typeof StreetReact !== 'undefined' && window.game) StreetReact.onShot(window.game, pos);      // (e os motoristas que ouvem)
    }

    // Violência/assalto: só reage quem está perto E enxerga o local.
    // `except`: pedestre (ou lista) que não reage (a vítima do assalto, que já está rendida; o assaltante). Retorna quantos fugiram.
    alertViolence(pos, radius = Config.npc.violenceRadius, except = null) {
        const p = new BABYLON.Vector3(pos.x, 0, pos.z);
        let n = 0;
        for (const npc of this.npcs) {
            if (npc === except || (Array.isArray(except) && except.includes(npc))) continue;
            if (npc.alive && BABYLON.Vector3.Distance(npc.position, p) < radius && this._sees(npc, p)) { npc.panic(p); n++; }
        }
        return n;
    }

    // Pedestre mais próximo de `pos` (até `range`) que dá para abordar: vivo, de pé no NavMesh (não deitado/nadando),
    // à vista e que passa em `ok(npc)`. Usado pelo assalto e pelo furto.
    // who: quem procura (o jogador) — só vale quem está no mesmo nível dele (Vehicle.sameLevel: sob a ponte ≠ em cima dela).
    nearestTarget(pos, range, ok = null, who = null) {
        let nearest = null, best = range;
        for (const npc of this.npcs) {
            if (!npc.alive || npc.rag || npc.free || npc.index < 0) continue;
            if (ok && !ok(npc)) continue;
            if (who && !Vehicle.sameLevel(npc, who)) continue;
            const d = hypot(npc.position.x - pos.x, npc.position.z - pos.z);
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
