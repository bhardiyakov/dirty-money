// ============================================================================
// Navigation — navegação a pé em GRADE (substitui o NavMesh do Recast, que não escala para o mundo grande).
//
// O QUE É ANDÁVEL vem de um raster de 1 u cobrindo o mundo inteiro (Config.world), montado uma vez na carga:
//   1) terreno: toda célula de terra sem paredão (campo, mata, areia, favela...);
//   2) a malha urbana (CityGrid.urbanRects) é apagada: ali só se anda pelo que o CityGrid declara (CityGrid.walkRects:
//      calçadas, faixas de pedestres, praças/parques, orla) — a rua (asfalto) NÃO é andável, como antes;
//   3) todo sólido (CityGrid.obstacles: prédios, cercas, postes, caçambas) é apagado, com folga de um agente. Paredões não: a pé
//      sobe-se qualquer encosta (devagar, com a animação de escalar — SpriteActor.setSlope).
// Valor 1 = andável, 2 = andável encostado numa parede (custa mais no A*), 0 = bloqueado.
//
// CAMINHOS: A* em janela limitada ao redor do trajeto (8 vizinhos, sem cortar quina) + alisamento por linha de visada.
// `crowd` imita o subconjunto da API do Recast Crowd que o jogo usa (addAgent, agentGoto, agentTeleport, removeAgent,
// updateAgentParameters, getAgentVelocity): seguimento de caminho com aceleração limitada, separação entre agentes e
// colisão com o raster. Os pedidos de caminho entram numa fila com orçamento de tempo por frame.
// ============================================================================

class GridCrowd {
    constructor(nav) {
        this.nav = nav;
        this.agents = [];            // índice -> agente | null
        this.free = [];
        this.queue = [];             // agentes esperando caminho
        this._v = new BABYLON.Vector3();
        this.stats = { paths: 0, ms: 0, fails: 0, maxMs: 0 };
    }

    addAgent(pos, params, transform) {
        const a = {
            x: pos.x, z: pos.z, vx: 0, vz: 0, params, transform,
            path: null, pi: 0, goal: null, queued: false, stuck: 0, repath: 0,
        };
        transform.position.x = pos.x; transform.position.z = pos.z;
        let i = this.free.pop();
        if (i === undefined) { i = this.agents.length; this.agents.push(a); } else this.agents[i] = a;
        a.index = i;
        return i;
    }

    removeAgent(i) {
        const a = this.agents[i];
        if (!a) return;
        a.queued = false; a.dead = true;
        this.agents[i] = null;
        this.free.push(i);
    }

    updateAgentParameters(i, params) { const a = this.agents[i]; if (a) a.params = params; }

    agentTeleport(i, pos) {
        const a = this.agents[i];
        if (!a) return;
        a.x = pos.x; a.z = pos.z; a.vx = a.vz = 0; a.path = null; a.goal = null; a.stuck = 0;
        a.transform.position.x = pos.x; a.transform.position.z = pos.z;
    }

    getAgentVelocity(i) {
        const a = this.agents[i];
        if (!a) return null;
        this._v.set(a.vx, 0, a.vz);
        return this._v;
    }

    // Manda o agente para `dest`. Linha reta livre = caminho imediato; senão entra na fila do A*.
    agentGoto(i, dest) {
        const a = this.agents[i];
        if (!a) return;
        const g = a.goal;
        // Mesmo destino de antes (a IA repete o pedido a cada 0,3–0,7 s): mantém o caminho em curso.
        if (g && a.path && hypot(g.x - dest.x, g.z - dest.z) < 0.8 && a.pi < a.path.length) return;
        a.goal = { x: dest.x, z: dest.z };
        a.stuck = 0;
        if (this.nav.los(a.x, a.z, dest.x, dest.z)) { a.path = [{ x: dest.x, z: dest.z }]; a.pi = 0; return; }
        if (!a.queued) { a.queued = true; this.queue.push(a); }
    }

    update(dt) {
        // Fila de caminhos. No app de PC o A* roda no Rust, em outra thread (RemotePaths): o quadro só despacha o lote e aplica as
        // respostas que chegarem. Fora dele (navegador, file://), A* aqui mesmo com orçamento de ~3 ms/frame (pelo menos um).
        if (this.queue.length && this.nav.remote) this._dispatchRemote();
        else if (this.queue.length) {
            const t0 = performance.now();
            while (this.queue.length) {
                const a = this.queue.shift();
                a.queued = false;
                if (a.dead || !a.goal) continue;
                const p = this.nav.findPath(a.x, a.z, a.goal.x, a.goal.z);
                a.path = p; a.pi = 0;
                if (!p) this.stats.fails++;
                if (performance.now() - t0 > 3) break;
            }
            const ms = performance.now() - t0;
            this.stats.ms += ms; this.stats.maxMs = Math.max(this.stats.maxMs, ms);
        }

        const A = this.agents, n = A.length, nav = this.nav;
        // Vizinhança por grade espacial (antes: cada agente testava TODOS os outros — O(n²): 600 pedestres = 360 mil testes por quadro).
        // A grade é montada no começo do quadro; as posições são lidas ao vivo (quem já andou neste quadro), e a busca tem 0,5 u de
        // folga para cobrir o pouco que alguém anda num quadro.
        const G = this._grid || (this._grid = new SpatialHash(2)), near = this._near || (this._near = []);
        G.clear();
        for (let i = 0; i < n; i++) { const a = A[i]; if (a) G.insert(a, a.x, a.z); }
        for (let i = 0; i < n; i++) {
            const a = A[i];
            if (!a) continue;
            const P = a.params, sp = P.maxSpeed, acc = P.maxAcceleration || 40;
            // Velocidade desejada rumo ao próximo ponto do caminho.
            let dvx = 0, dvz = 0;
            if (a.path && a.pi < a.path.length && sp > 0.02) {
                let w = a.path[a.pi];
                let dx = w.x - a.x, dz = w.z - a.z, d = hypot(dx, dz);
                const last = a.pi === a.path.length - 1;
                while (!last && d < 0.45 && a.pi < a.path.length - 1) { a.pi++; w = a.path[a.pi]; dx = w.x - a.x; dz = w.z - a.z; d = hypot(dx, dz); }
                if (a.pi === a.path.length - 1 && d < 0.3) { a.path = null; }
                else if (d > 1e-4) {
                    const s = (a.pi === a.path.length - 1) ? Math.min(sp, d * 4) : sp;      // freia ao chegar
                    dvx = dx / d * s; dvz = dz / d * s;
                }
            }
            // Aceleração limitada.
            let ax = dvx - a.vx, az = dvz - a.vz;
            const al = hypot(ax, az), mx = acc * dt;
            if (al > mx) { ax *= mx / al; az *= mx / al; }
            a.vx += ax; a.vz += az;

            // Separação dos vizinhos (empurra para fora da sobreposição).
            let px = 0, pz = 0;
            const r = (P.radius || 0.4) * 2 + 0.1;
            G.query(a.x, a.z, r + 0.5, near);
            for (let q = 0; q < near.length; q++) {
                const b = near[q];
                if (b === a) continue;
                const ex = a.x - b.x, ez = a.z - b.z;
                if (ex > r || ex < -r || ez > r || ez < -r) continue;
                const dd = hypot(ex, ez);
                if (dd >= r) continue;
                if (dd < 1e-4) { px += (Math.random() - 0.5) * 0.1; pz += (Math.random() - 0.5) * 0.1; continue; }
                const k = (r - dd) / dd * 0.5 * (P.separationWeight || 2) * 0.6;
                px += ex * k; pz += ez * k;
            }
            const sl = hypot(px, pz);
            if (sl > 2.5) { px *= 2.5 / sl; pz *= 2.5 / sl; }

            // Integra com colisão no raster (desliza nos eixos).
            const mvx = (a.vx + px) * dt, mvz = (a.vz + pz) * dt;
            if (mvx !== 0 || mvz !== 0) {
                let nx = a.x + mvx, nz = a.z + mvz;
                if (nav.walk(nx, nz)) { a.x = nx; a.z = nz; }
                else if (nav.walk(nx, a.z)) { a.x = nx; a.vz = 0; }
                else if (nav.walk(a.x, nz)) { a.z = nz; a.vx = 0; }
                else { a.vx = a.vz = 0; }
            }
            // Preso (quer andar e não sai do lugar): refaz o caminho.
            if (a.path && hypot(a.vx, a.vz) < 0.15) {
                a.stuck += dt;
                if (a.stuck > 1.2 && a.goal) { a.stuck = 0; const g = a.goal; a.goal = null; a.path = null; this.agentGoto(i, g); }
            } else a.stuck = 0;
            a.transform.position.x = a.x; a.transform.position.z = a.z;
        }
    }

    // Manda a fila (até 256 agentes) para o Rust; um lote por vez. O agente continua `queued` até a resposta chegar, então um novo
    // agentGoto no meio do caminho não duplica o pedido — e, se o destino mudou, a resposta velha é descartada e ele volta à fila.
    _dispatchRemote() {
        if (this._remoteBusy) return;
        const batch = [];
        while (this.queue.length && batch.length < 256) {
            const a = this.queue.shift();
            if (a.dead || !a.goal) { a.queued = false; continue; }
            batch.push(a);
        }
        if (!batch.length) return;
        const buf = new ArrayBuffer(4 + batch.length * 16), v = new DataView(buf);
        v.setUint32(0, batch.length, true);
        for (let k = 0; k < batch.length; k++) {
            const a = batch[k], o = 4 + k * 16;
            a._reqGoal = a.goal;
            v.setFloat32(o, a.x, true); v.setFloat32(o + 4, a.z, true); v.setFloat32(o + 8, a.goal.x, true); v.setFloat32(o + 12, a.goal.z, true);
        }
        this._remoteBusy = true;
        const t0 = performance.now();
        this.nav.remote.findPaths(new Uint8Array(buf))
            .then((res) => this._applyRemote(batch, res, performance.now() - t0))
            .catch((e) => {
                console.warn('[NAV] caminhos no Rust falharam; voltando ao A* em JS:', e);
                this.nav.remote = null;
                for (const a of batch) if (!a.dead) this.queue.push(a);
            })
            .finally(() => { this._remoteBusy = false; });
    }

    // Resposta do Rust, na ordem do lote: u32 nº de pontos (0xFFFFFFFF = sem caminho) + pontos (f32 x, f32 z).
    _applyRemote(batch, buffer, roundTripMs) {
        const v = new DataView(buffer);
        let o = 0;
        for (const a of batch) {
            const n = v.getUint32(o, true); o += 4;
            let path = null;
            if (n !== 0xffffffff) { path = new Array(n); for (let k = 0; k < n; k++, o += 8) path[k] = { x: v.getFloat32(o, true), z: v.getFloat32(o + 4, true) }; }
            a.queued = false;
            if (a.dead || !a.goal) continue;
            if (a.goal !== a._reqGoal) { a.queued = true; this.queue.push(a); continue; }      // destino mudou enquanto calculava
            a.path = path; a.pi = 0;
            if (!path) this.stats.fails++;
        }
        this.stats.paths += batch.length;
        this.stats.remoteMs = (this.stats.remoteMs || 0) * 0.9 + roundTripMs * 0.1;      // ida e volta de um lote (fora do quadro)
    }
}

// A* no Rust (app de PC, Tauri): o raster de andáveis vai uma vez na carga (~6 MB), as edições depois (barricadas) vão por retângulo,
// e os pedidos de caminho vão em lote, resolvidos numa thread do Rust (src-tauri/src/nav). Precisa de `withGlobalTauri` no tauri.conf.
class RemotePaths {
    static available() { return typeof window !== 'undefined' && !!(window.__TAURI__ && window.__TAURI__.core); }

    static async connect(nav) {
        const head = 16, bytes = new Uint8Array(head + nav.grid.length), v = new DataView(bytes.buffer);
        v.setUint32(0, nav.w, true); v.setUint32(4, nav.h, true); v.setFloat32(8, nav.minX, true); v.setFloat32(12, nav.minZ, true);
        bytes.set(nav.grid, head);
        await window.__TAURI__.core.invoke('nav_set_grid', bytes);
        return new RemotePaths();
    }

    findPaths(request) { return window.__TAURI__.core.invoke('nav_find_paths', request); }

    fillRect(i0, j0, i1, j1, value) {
        window.__TAURI__.core.invoke('nav_fill_rect', { i0, j0, i1, j1, value })
            .catch((e) => console.warn('[NAV] edição do raster não chegou ao Rust:', e));
    }
}

class Navigation {
    constructor(scene) {
        this.scene = scene;
        this.crowd = new GridCrowd(this);
        this.remote = null;                     // RemotePaths quando o A* roda no Rust (app de PC)
        this.ready = false;
        this.focus = { x: 0, z: 0 };           // onde está o jogador/câmera (randomWalkable sorteia por perto)
        this._debugMesh = null;
        // A*: buffers reaproveitados.
        this._cap = 0;
    }

    // `walkableMeshes` é ignorado (o raster vem do CityGrid/WorldMap); mantido na assinatura por compatibilidade.
    async init() {
        const t0 = performance.now();
        const W = Config.world, w = this.w = Math.ceil(W.maxX - W.minX), h = this.h = Math.ceil(W.maxZ - W.minZ);
        this.minX = W.minX; this.minZ = W.minZ;
        const g = this.grid = new Uint8Array(w * h);
        const M = WorldMap, c = W.cell, nx = M.nx, nz = M.nz;

        // 1) terreno: células de terra sem paredão (4×4 células de 1 u).
        for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
            const k = j * nx + i;
            if (!M.land[k] || (M.flags[k] & 1)) continue;
            const x0 = i * c, z0 = j * c;
            for (let dz = 0; dz < c && z0 + dz < h; dz++) { const row = (z0 + dz) * w + x0; for (let dx = 0; dx < c && x0 + dx < w; dx++) g[row + dx] = 1; }
        }
        // 2) malha urbana: apaga; só vale o que o CityGrid declara andável.
        for (const r of CityGrid.urbanRects) this._fill(r[0], r[1], r[2], r[3], 0);
        for (const r of CityGrid.walkRects) this._fill(r[0], r[1], r[2], r[3], 1);
        for (const P of CityGrid.walkPolys || []) this._fillPoly(P, 1);
        // 2b) cantos arredondados dos quarteirões: fora do arco volta a ser rua.
        for (const f of CityGrid.cornerCarves || []) {
            const ax = f.kx + f.sx * f.r, az = f.kz + f.sz * f.r;
            for (let dz = 0; dz < f.r; dz++) for (let dx = 0; dx < f.r; dx++) {
                const px = f.kx + f.sx * (dx + 0.5), pz = f.kz + f.sz * (dz + 0.5);
                if (hypot(px - ax, pz - az) > f.r) this._fill(px - 0.4, pz - 0.4, px + 0.4, pz + 0.4, 0);
            }
        }
        // 3) sólidos (com a folga de um agente, pela regra "centro da célula dentro").
        const m = 0.35;
        for (const o of CityGrid.obstacles) if (!o.cliff && !o.thin) this._fill(o.x0 - m, o.z0 - m, o.x1 + m, o.z1 + m, 0);      // (paredão: a pé sobe — mais devagar; frade: passa entre eles)
        for (const o of CityGrid.navBlocks) this._fill(o.x0, o.z0, o.x1, o.z1, 0);          // interior da safe house
        // 4) borda: andável encostado em parede (2) custa mais e mantém distância.
        const e = new Uint8Array(g);
        for (let z = 1; z < h - 1; z++) for (let x = 1; x < w - 1; x++) {
            const k = z * w + x;
            if (g[k] && (!g[k - 1] || !g[k + 1] || !g[k - w] || !g[k + w])) e[k] = 2;
        }
        if (typeof FavelaPlan !== 'undefined' && FavelaPlan.built) FavelaPlan.navCost(e, this);      // favela: a pé, pelos becos (a rua custa mais)
        this.grid = e;
        this.ready = true;
        let n = 0; for (let k = 0; k < e.length; k++) if (e[k]) n++;
        this.buildMs = performance.now() - t0;
        console.log(`[NAV] raster ${w}×${h} (${(n / 1000).toFixed(0)}k células andáveis) em ${this.buildMs.toFixed(0)} ms`);
        if (RemotePaths.available()) {
            RemotePaths.connect(this)
                .then((r) => { this.remote = r; console.log('[NAV] A* no Rust (fora da thread do jogo)'); })
                .catch((e) => console.warn('[NAV] A* no Rust indisponível; seguindo em JS:', e));
        }
    }

    // Preenche o polígono [[x, z], ...] com `val` (células cujo centro está dentro dele). Só na carga (não avisa o A* remoto).
    _fillPoly(P, val) {
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (const p of P) { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]); }
        const i0 = Math.max(0, Math.ceil(x0 - this.minX - 0.5)), i1 = Math.min(this.w - 1, Math.floor(x1 - this.minX - 0.5));
        const j0 = Math.max(0, Math.ceil(z0 - this.minZ - 0.5)), j1 = Math.min(this.h - 1, Math.floor(z1 - this.minZ - 0.5));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (RoadPlan.inPoly(P, this.minX + i + 0.5, this.minZ + j + 0.5)) this.grid[j * this.w + i] = val;
    }

    // Preenche o retângulo (u de mundo) com `val`, nas células cujo CENTRO está dentro dele.
    _fill(x0, z0, x1, z1, val) {
        const w = this.w, h = this.h;
        const i0 = Math.max(0, Math.ceil(x0 - this.minX - 0.5)), i1 = Math.min(w - 1, Math.floor(x1 - this.minX - 0.5));
        const j0 = Math.max(0, Math.ceil(z0 - this.minZ - 0.5)), j1 = Math.min(h - 1, Math.floor(z1 - this.minZ - 0.5));
        for (let j = j0; j <= j1; j++) { const row = j * w; for (let i = i0; i <= i1; i++) this.grid[row + i] = val; }
        if (this.remote && i0 <= i1 && j0 <= j1) this.remote.fillRect(i0, j0, i1, j1, val);      // (barricadas: o Rust recebe a mesma edição)
    }

    // ----------------------------------------------------------------- consultas
    walk(x, z) {
        const i = Math.floor(x - this.minX), j = Math.floor(z - this.minZ);
        return i >= 0 && j >= 0 && i < this.w && j < this.h && this.grid[j * this.w + i] !== 0;
    }

    // Linha reta livre entre dois pontos (amostra a cada ~0,4 u, com folga lateral de 0,25).
    los(ax, az, bx, bz) {
        const dx = bx - ax, dz = bz - az, d = hypot(dx, dz);
        if (d < 0.01) return true;
        const n = Math.ceil(d / 0.4), ux = dx / d, uz = dz / d, px = -uz * 0.25, pz = ux * 0.25;
        for (let k = 1; k <= n; k++) {
            const t = Math.min(d, k * 0.4), x = ax + ux * t, z = az + uz * t;
            if (!this.walk(x, z) || !this.walk(x + px, z + pz) || !this.walk(x - px, z - pz)) return false;
        }
        return true;
    }

    // Ponto andável mais próximo de p (espiral até `max` u). Se não achar, devolve o próprio p.
    closestPoint(p, max = 40) {
        const x = p.x, z = p.z;
        if (this.walk(x, z)) return new BABYLON.Vector3(x, 0, z);
        const cx = Math.floor(x - this.minX), cz = Math.floor(z - this.minZ);
        for (let r = 1; r <= max; r++) {
            let best = null, bd = Infinity;
            for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                const i = cx + dx, j = cz + dz;
                if (i < 0 || j < 0 || i >= this.w || j >= this.h || !this.grid[j * this.w + i]) continue;
                const d = (i + 0.5 - (x - this.minX)) ** 2 + (j + 0.5 - (z - this.minZ)) ** 2;
                if (d < bd) { bd = d; best = [i, j]; }
            }
            if (best) return new BABYLON.Vector3(this.minX + best[0] + 0.5, 0, this.minZ + best[1] + 0.5);
        }
        return new BABYLON.Vector3(x, 0, z);
    }

    // Ponto andável aleatório num raio de `center` (como o Recast).
    randomPoint(center, radius) {
        for (let t = 0; t < 40; t++) {
            const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
            const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
            if (this.walk(x, z)) return new BABYLON.Vector3(x, 0, z);
        }
        return this.closestPoint(center, 12);
    }

    // Ponto andável aleatório PERTO do foco (jogador): entre rMin e rMax u dele. (O mundo é grande: ninguém nasce longe.)
    randomWalkable(rMin = 0, rMax = 170) {
        const f = this.focus;
        for (let t = 0; t < 80; t++) {
            const a = Math.random() * Math.PI * 2, r = rMin + Math.sqrt(Math.random()) * (rMax - rMin);
            const x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r;
            if (this.walk(x, z)) return new BABYLON.Vector3(x, 0, z);
        }
        return this.closestPoint(new BABYLON.Vector3(f.x, 0, f.z), 30);
    }

    update(dt) {
        if (this.ready) this.crowd.update(dt);
    }

    // ------------------------------------------------------------------------ A*
    _ensure(n) {
        if (n <= this._cap) return;
        this._cap = n;
        this._g = new Float32Array(n); this._par = new Int32Array(n); this._stamp = new Uint32Array(n); this._closed = new Uint8Array(n);
        this._heap = new Int32Array(n * 4 + 16); this._f = new Float32Array(n * 4 + 16);      // (heap com entradas duplicadas: nó + custo f)
        this._gen = 0;
    }

    // Caminho de (sx,sz) a (gx,gz): lista de pontos {x,z} (sem o início) ou null.
    findPath(sx, sz, gx, gz) {
        const t0 = performance.now();
        const w = this.w, grid = this.grid, minX = this.minX, minZ = this.minZ;
        let si = Math.floor(sx - minX), sj = Math.floor(sz - minZ), gi = Math.floor(gx - minX), gj = Math.floor(gz - minZ);
        const inB = (i, j) => i >= 0 && j >= 0 && i < w && j < this.h;
        if (!inB(si, sj) || !inB(gi, gj)) return null;
        // Início/fim fora do andável: encaixa no mais próximo (até 6 u).
        if (!grid[sj * w + si]) { const q = this.closestPoint({ x: sx, z: sz }, 6); si = Math.floor(q.x - minX); sj = Math.floor(q.z - minZ); if (!grid[sj * w + si]) return null; }
        if (!grid[gj * w + gi]) { const q = this.closestPoint({ x: gx, z: gz }, 6); gi = Math.floor(q.x - minX); gj = Math.floor(q.z - minZ); if (!grid[gj * w + gi]) return null; }
        if (si === gi && sj === gj) return [{ x: gx, z: gz }];

        const PAD = 28;
        const i0 = Math.max(0, Math.min(si, gi) - PAD), i1 = Math.min(w - 1, Math.max(si, gi) + PAD);
        const j0 = Math.max(0, Math.min(sj, gj) - PAD), j1 = Math.min(this.h - 1, Math.max(sj, gj) + PAD);
        const ww = i1 - i0 + 1, hh = j1 - j0 + 1;
        this._ensure(ww * hh);
        const G = this._g, PAR = this._par, ST = this._stamp, CL = this._closed, H = this._heap, F = this._f;
        const gen = ++this._gen;
        const idx = (i, j) => (j - j0) * ww + (i - i0);
        let hn = 0;
        // Heap binário de (nó, f): H[k] = nó, F[k] = custo f da ENTRADA (nós podem entrar mais de uma vez).
        const push = (n, f) => {
            let k = ++hn;
            if (k >= H.length) return;                                    // (estouro improvável: descarta)
            while (k > 1 && F[k >> 1] > f) { H[k] = H[k >> 1]; F[k] = F[k >> 1]; k >>= 1; }
            H[k] = n; F[k] = f;
        };
        const pop = () => {
            const top = H[1], ln = H[hn], lf = F[hn]; hn--;
            let k = 1;
            for (;;) {
                let c = k << 1;
                if (c > hn) break;
                if (c < hn && F[c + 1] < F[c]) c++;
                if (lf <= F[c]) break;
                H[k] = H[c]; F[k] = F[c]; k = c;
            }
            if (hn >= 1) { H[k] = ln; F[k] = lf; }
            return top;
        };
        const hfun = (i, j) => { const dx = Math.abs(i - gi), dz = Math.abs(j - gj); return (dx + dz) + (1.414 - 2) * Math.min(dx, dz); };

        const s = idx(si, sj), goal = idx(gi, gj);
        ST[s] = gen; G[s] = 0; PAR[s] = -1; CL[s] = 0; push(s, hfun(si, sj));
        let best = s, bestH = hfun(si, sj), found = false, exp = 0;
        const DX = [1, -1, 0, 0, 1, 1, -1, -1], DZ = [0, 0, 1, -1, 1, -1, 1, -1];
        while (hn > 0 && exp < 30000) {
            const n = pop();
            if (CL[n] && ST[n] === gen) continue;
            CL[n] = 1; exp++;
            if (n === goal) { found = true; break; }
            const ni = (n % ww) + i0, nj = ((n / ww) | 0) + j0;
            const hv = hfun(ni, nj);
            if (hv < bestH) { bestH = hv; best = n; }
            for (let d = 0; d < 8; d++) {
                const i = ni + DX[d], j = nj + DZ[d];
                if (i < i0 || i > i1 || j < j0 || j > j1) continue;
                const cell = grid[j * w + i];
                if (!cell) continue;
                if (d >= 4 && (!grid[nj * w + ni + DX[d]] || !grid[(nj + DZ[d]) * w + ni])) continue;     // sem cortar quina
                const m = idx(i, j);
                if (ST[m] === gen && CL[m]) continue;
                const ng = G[n] + (d < 4 ? 1 : 1.414) * (cell === 2 ? 1.8 : 1);
                if (ST[m] !== gen) { ST[m] = gen; CL[m] = 0; G[m] = ng; PAR[m] = n; push(m, ng + hfun(i, j)); }
                else if (ng < G[m]) { G[m] = ng; PAR[m] = n; push(m, ng + hfun(i, j)); }
            }
        }
        const stats = this.crowd.stats; stats.paths++;
        const end = found ? goal : best;                      // sem caminho completo: vai até o ponto mais perto do alvo
        if (!found && end === s) return null;
        const pts = [];
        for (let n = end; n !== -1 && n !== s; n = PAR[n]) pts.push({ x: minX + (n % ww) + i0 + 0.5, z: minZ + ((n / ww) | 0) + j0 + 0.5 });
        pts.reverse();
        if (found) pts.push({ x: gx, z: gz });
        // Alisa: do ponto atual, salta até o último ponto com linha de visada livre.
        const out = [];
        let ax = sx, az = sz, k = 0;
        while (k < pts.length) {
            let far = k;
            for (let q = pts.length - 1; q > k; q--) { if (this.los(ax, az, pts[q].x, pts[q].z)) { far = q; break; } }
            out.push(pts[far]);
            ax = pts[far].x; az = pts[far].z; k = far + 1;
        }
        return out;
    }

    // Visualização do raster para debug (tecla N): textura da área ao redor do foco.
    getDebugMesh() {
        if (!this.ready) return null;
        if (!this._debugMesh) {
            const S = 256, tex = new BABYLON.DynamicTexture('navDbg', { width: S, height: S }, this.scene, false);
            tex.hasAlpha = true;
            const mat = new BABYLON.StandardMaterial('navDbgMat', this.scene);
            mat.diffuseTexture = tex; mat.emissiveColor = new BABYLON.Color3(0.4, 0.8, 1); mat.disableLighting = true; mat.useAlphaFromDiffuseTexture = true;
            const m = BABYLON.MeshBuilder.CreateGround('navDbg', { width: S, height: S }, this.scene);
            m.material = mat; m.position.y = 0.3; m.isPickable = false; m._tex = tex; m._t = 0;
            m.onBeforeRenderObservable.add(() => {
                const f = this.focus, ox = Math.floor(f.x) - S / 2, oz = Math.floor(f.z) - S / 2;
                if (m._ox === ox && m._oz === oz) return;
                m._ox = ox; m._oz = oz;
                const ctx = tex.getContext(), img = ctx.createImageData(S, S);
                for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
                    const v = this.walk(ox + i + 0.5, oz + (S - 1 - j) + 0.5) ? this.grid[(oz + (S - 1 - j) - this.minZ) * this.w + (ox + i - this.minX)] : 0;
                    const o = (j * S + i) * 4;
                    img.data[o] = v === 2 ? 255 : 40; img.data[o + 1] = v ? 200 : 0; img.data[o + 2] = v ? 255 : 0; img.data[o + 3] = v ? 90 : 0;
                }
                ctx.putImageData(img, 0, 0); tex.update();
                m.position.x = ox + S / 2; m.position.z = oz + S / 2;
            });
            this._debugMesh = m;
        }
        return this._debugMesh;
    }
}
