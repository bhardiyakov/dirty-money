// ============================================================================
// FavelaPlan — a FAVELA DO MORRO, orgânica: só 3 RUAS de carro (vias livres do RoadPlan, curvas, classe 'fav') e o resto um
// labirinto de BECOS estreitos (só moto e pedestre: carro não cabe) entre barracos colados, lojas e comércios, em quarteirões
// tortos (células de Voronoi com becos tremidos; alguns becos somem e viram miolos de casas, outros acabam sem saída).
//
//   roads(P)      no CityGrid._makePlan: as ruas principais (RoadPlan.addPath).
//   build(grid)   no CityGrid._buildBlocks (o RoadPlan já existe): grade de ocupação de 1 u, becos, barracos (lotes com a porta
//                 virada para um beco/rua), lojas, quadra do baile e campinho, a safe house no lugar de sempre, FRADES (postes de
//                 concreto) onde um carro ainda caberia entrar, lixo/postes com gato/bananeiras/esconderijos. Entrega tudo em
//                 quarteirões-ladrilho de 48 u (blocos 'favela:i,j', district 'favela', organic: true) para quem percorre
//                 CityGrid.blocks, e o chão (groundBoxes: o que o terreno não desenha) e o andável (walkRects) para a navegação.
// Dados: alleys [{ pts, w }], squares [{ kind, x0, z0, x1, z1 }], bollards [{ x, z }], graph { nodes: [{ x, z, links, road }] }
//        (becos + ruas: as motos andam por ele). Consultas: walkable(x, z), alleyPoint(x, z), randomAlleyPoint(), route(...).
// Determinístico (rng fixo): o mesmo morro a cada carga.
// ============================================================================

const FavelaPlan = {
    R: { x0: -665, z0: 265, x1: -331, z1: 743 },        // área (= o território do C.V: Standing._bounds)
    TILE: 48,
    FREE: 0, ROAD: 1, ALLEY: 2, BLD: 3, GAP: 4, OPEN: 5, RES: 6, OUT: 7,
    SAFE: { x: -401, z: 422 },                         // canto sudoeste da safe house (o mesmo de antes: saves e o começo do jogo)
    CAR_R: 0.7,                                        // meia largura do carro mais estreito (1,45 u de lataria), com folga
    POST_R: 0.15, POST_GAP: 1.5,                       // frade: raio e espaçamento (vão de 1,2 u: moto passa, carro não)
    SHRINK: [0.08, 0.18],
    ROAD_M: 2.0,                                       // beirada livre de cada lado do asfalto das ruas (nada de barraco/frade ali)                              // recuo das paredes dos barracos em relação à grade (beco de 1 célula: 1,2–1,36 u)
    built: false,
    alleys: [], squares: [], bollards: [], lots: [], props: [], graph: null, groundBoxes: [], walkRects: [],

    // As 3 ruas principais (pontos de controle; viram curvas suaves). Ligam a avenida oeste da cidade (x = -294) às estradas de terra
    // das fazendas (x = -660 e a de x = -600 que sobe do sul) e se cruzam no morro. A Estrada do Morro passa na frente da safe house;
    // a Rua da Caixa d'Água dá a volta por cima e desce até ela (a ponta que passa do cruzamento é podada).
    MAIN: [
        { name: 'Rua do Valão', pts: [[-294, 342], [-336, 340], [-380, 356], [-428, 337], [-478, 352], [-528, 332], [-574, 350], [-600, 342], [-630, 338], [-660, 342]] },
        { name: 'Estrada do Morro', pts: [[-294, 522], [-324, 518], [-348, 502], [-360, 474], [-362, 446], [-368, 422], [-388, 410], [-412, 411], [-436, 424], [-458, 452], [-480, 488], [-506, 518], [-542, 537], [-584, 549], [-624, 560], [-660, 558]] },
        { name: 'Rua da Caixa d\'Água', pts: [[-294, 702], [-340, 698], [-392, 690], [-440, 700], [-490, 690], [-540, 668], [-580, 640], [-605, 605], [-618, 572], [-624, 546]] },
    ],

    roads(P) { for (const r of this.MAIN) P.addPath(this._smooth(r.pts, 4), 'fav', { name: r.name, anchor: true }); },

    // Catmull-Rom pelos pontos de controle, amostrada a cada ~step u (passa pelos pontos: as pontas casam com os nós das outras vias).
    _smooth(C, step) {
        const out = [C[0].slice()];
        for (let i = 0; i + 1 < C.length; i++) {
            const p0 = C[Math.max(0, i - 1)], p1 = C[i], p2 = C[i + 1], p3 = C[Math.min(C.length - 1, i + 2)];
            const n = Math.max(1, Math.round(hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
            for (let k = 1; k <= n; k++) {
                const t = k / n, t2 = t * t, t3 = t2 * t;
                const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
                out.push(k === n ? p2.slice() : [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
            }
        }
        return out;
    },

    // ================================================================= construção
    build(grid) {
        const t0 = performance.now(), R = this.R, rng = Pixel.rng(31337);
        const W = this.W = R.x1 - R.x0, H = this.H = R.z1 - R.z0, C = this.cells = new Uint8Array(W * H);
        this.alleys = []; this.squares = []; this.bollards = []; this.lots = []; this.props = [];

        // 1) borda orgânica: o morro vai rareando (nada de borda reta); o lado da cidade (leste) fica mais cheio
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
            const x = R.x0 + i + 0.5, z = R.z0 + j + 0.5, de = Math.min(i, j, W - 1 - i, H - 1 - j);
            const n = this._noise(x / 38, z / 38), city = W - 1 - i < 30 ? 0.3 : 1;
            if (de < 3 + 15 * n * city || !WorldMap.buildable(x, z, 6)) C[j * W + i] = this.OUT;
        }
        // 2) as ruas (as 3 da favela e as estradas que entram nela) e os cruzamentos
        const inR = (x0, z0, x1, z1, m) => x1 > R.x0 - m && x0 < R.x1 + m && z1 > R.z0 - m && z0 < R.z1 + m;
        this.roadEdges = RoadPlan.edges.filter((e) => { const xs = e.pts.map((p) => p[0]), zs = e.pts.map((p) => p[1]); return inR(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), 10); });
        for (const e of this.roadEdges) this._stamp(e.pts, e.w / 2 + this.ROAD_M, this.ROAD, true);      // (beirada de terra: nas curvas o carro corta por dentro)
        for (const n of RoadPlan.nodes) if (inR(n.x, n.z, n.x, n.z, 0)) this._disk(n.x, n.z, Math.max(...n.arms.map((a) => a.hw)) + 2.5, this.ROAD, true);
        // 3) a safe house (mesmo lugar) e o quintal dela até a Estrada do Morro (carro para na porta)
        const S = this.SAFE, SW = SafeHouse.W, SD = SafeHouse.D, dx = S.x + (SafeHouse.door.x0 + SafeHouse.door.x1) / 2;
        let zy = S.z - 4;
        for (let z = S.z - 0.5; z > S.z - 22; z -= 0.5) if (this.cellAt(dx, z) === this.ROAD) { zy = z + 0.5; break; }
        this._rect(S.x - 2.5, zy, S.x + SW + 2.5, S.z + SD + 2.5, this.RES, true);
        this.yard = { x0: S.x - 2.5, z0: zy, x1: S.x + SW + 2.5, z1: S.z };
        this._rect(S.x, S.z, S.x + SW, S.z + SD, this.BLD, true);
        // 4) quadra do baile (na beira da Estrada do Morro) e campinho de terra (no miolo, só a pé ou de moto)
        this._square('quadra', -500, 470, 30, 18, true);
        this._square('campinho', -470, 610, 34, 22, false);
        // 5) becos
        this._alleysFromVoronoi(rng);
        for (const a of this.alleys) this._stamp(a.pts, Math.max(a.w / 2, 0.72), this.ALLEY, false);      // (≥ 0,72: diagonal continua passável)
        // 6) barracos; 7) frades onde um carro ainda entraria; 8) portas, lojas, sujeira, postes, esconderijos
        this._packShacks(rng);
        this._plugCarLeaks();
        this._dressUp(rng, grid);

        // 9) quarteirões-ladrilho para o resto do jogo
        const T = this.TILE, tiles = new Map();
        const tileOf = (x, z) => {
            const ti = Math.max(0, Math.min(Math.ceil(W / T) - 1, Math.floor((x - R.x0) / T))), tj = Math.max(0, Math.min(Math.ceil(H / T) - 1, Math.floor((z - R.z0) / T))), k = ti + ',' + tj;
            let b = tiles.get(k);
            if (!b) {
                const x0 = R.x0 + ti * T, z0 = R.z0 + tj * T, x1 = Math.min(R.x1, x0 + T), z1 = Math.min(R.z1, z0 + T);
                b = { id: 'favela:' + k, district: 'favela', i: 800 + ti, j: 800 + tj, biome: 'favela', open: false, ground: 'earth', organic: true,
                    slab: [x0, z0, x1, z1], foot: [x0, z0, x1, z1], sw: 0, r: 0, lots: [], props: [], fences: [] };
                tiles.set(k, b);
            }
            return b;
        };
        for (let tj = 0; tj * T < H; tj++) for (let ti = 0; ti * T < W; ti++) tileOf(R.x0 + ti * T + 1, R.z0 + tj * T + 1);
        for (const l of this.lots) tileOf((l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2).lots.push(l);
        SafeHouse.plan(tileOf(S.x + SW / 2, S.z + SD / 2), grid, S);
        for (const p of this.props) if (!SafeHouse.crowds(p)) tileOf(p.x, p.z).props.push(p);
        for (const b of [...tiles.values()].sort((a, c) => a.j - c.j || a.i - c.i)) grid.blocks.push(b);

        // 10) chão e andável: as células de 4 u do terreno com alguma coisa da favela (o terreno não desenha nem anda nelas)
        this._groundBoxes(grid);
        // 11) grafo dos becos (motos)
        this._buildGraph();
        this.built = true;
        this.buildMs = performance.now() - t0;
        console.log(`[FAVELA] ${this.lots.length} barracos (${this.lots.filter((l) => l.shops.length).length} com loja), ${this.alleys.length} becos, ${this.bollards.length} frades, ${this.graph.nodes.length} nós em ${this.buildMs.toFixed(0)} ms`);
    },

    // ------------------------------------------------------------------ grade
    // force: carimba por cima de tudo (menos rua, que só outra rua cobre). Sem force: só no livre/sobra.
    _set(i, j, v, force) { const k = j * this.W + i, c = this.cells[k]; if (force ? c !== this.ROAD || v === this.ROAD : c === this.FREE || c === this.GAP) this.cells[k] = v; },
    _rect(x0, z0, x1, z1, v, force) {
        const R = this.R;
        for (let j = Math.max(0, Math.round(z0 - R.z0)); j < Math.min(this.H, Math.round(z1 - R.z0)); j++) for (let i = Math.max(0, Math.round(x0 - R.x0)); i < Math.min(this.W, Math.round(x1 - R.x0)); i++) this._set(i, j, v, force);
    },
    _disk(x, z, r, v, force) {
        const R = this.R;
        for (let j = Math.floor(z - r - R.z0); j <= Math.ceil(z + r - R.z0); j++) for (let i = Math.floor(x - r - R.x0); i <= Math.ceil(x + r - R.x0); i++) {
            if (i < 0 || j < 0 || i >= this.W || j >= this.H) continue;
            if (hypot(R.x0 + i + 0.5 - x, R.z0 + j + 0.5 - z) <= r) this._set(i, j, v, force);
        }
    },
    // Carimba uma polilinha com meia-largura hw (células cujo centro está a ≤ hw do eixo).
    _stamp(P, hw, v, force) {
        const R = this.R;
        for (let k = 0; k + 1 < P.length; k++) {
            const a = P[k], b = P[k + 1], sx = b[0] - a[0], sz = b[1] - a[1], L2 = sx * sx + sz * sz || 1;
            const i0 = Math.floor(Math.min(a[0], b[0]) - hw - R.x0), i1 = Math.ceil(Math.max(a[0], b[0]) + hw - R.x0);
            const j0 = Math.floor(Math.min(a[1], b[1]) - hw - R.z0), j1 = Math.ceil(Math.max(a[1], b[1]) + hw - R.z0);
            for (let j = Math.max(0, j0); j <= Math.min(this.H - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(this.W - 1, i1); i++) {
                const x = R.x0 + i + 0.5, z = R.z0 + j + 0.5, t = Math.max(0, Math.min(1, ((x - a[0]) * sx + (z - a[1]) * sz) / L2));
                if (hypot(x - a[0] - sx * t, z - a[1] - sz * t) <= hw) this._set(i, j, v, force);
            }
        }
    },
    cellAt(x, z) { const i = Math.floor(x - this.R.x0), j = Math.floor(z - this.R.z0); return this.cells && i >= 0 && j >= 0 && i < this.W && j < this.H ? this.cells[j * this.W + i] : -1; },
    // Dá para andar em (x, z)? (beco, rua, largo/quadra, quintal/sobra, fora da favela)
    walkable(x, z) { const c = this.cellAt(x, z); return c !== this.BLD && c !== -1; },
    // Dentro da área construída (não na borda rala nem fora)?
    inside(x, z) { const c = this.cellAt(x, z); return c >= 0 && c !== this.OUT; },

    // Ruído suave (0..1) para a borda orgânica.
    _noise(x, z) {
        const h = (i, j) => Pixel.hash(i, j, 919);
        const fx = Math.floor(x), fz = Math.floor(z), tx = x - fx, tz = z - fz, sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
        const a = h(fx, fz) + (h(fx + 1, fz) - h(fx, fz)) * sx, b = h(fx, fz + 1) + (h(fx + 1, fz + 1) - h(fx, fz + 1)) * sx;
        return a + (b - a) * sz;
    },

    // ------------------------------------------------------------------ quadra e campinho
    // Retângulo w×d livre perto de (tx, tz): colado numa rua (road) ou longe de todas (≥ 8 u).
    _square(kind, tx, tz, w, d, road) {
        const R = this.R, W = this.W, C = this.cells;
        const count = (x0, z0, x1, z1, v) => {
            let n = 0;
            for (let j = Math.max(0, Math.round(z0 - R.z0)); j < Math.min(this.H, Math.round(z1 - R.z0)); j++) for (let i = Math.max(0, Math.round(x0 - R.x0)); i < Math.min(W, Math.round(x1 - R.x0)); i++) if (v(C[j * W + i])) n++;
            return n;
        };
        let best = null, bd = Infinity;
        for (let z = Math.round(tz - 70); z <= tz + 70; z += 2) for (let x = Math.round(tx - 70); x <= tx + 70; x += 2) {
            const dd = hypot(x - tx, z - tz);
            if (dd >= bd) continue;
            const x0 = x - w / 2, z0 = z - d / 2, x1 = x + w / 2, z1 = z + d / 2;
            if (count(x0, z0, x1, z1, (c) => c !== this.FREE)) continue;
            const m = road ? 2 : 8, near = count(x0 - m, z0 - m, x1 + m, z1 + m, (c) => c === this.ROAD || c === this.RES);
            if (road ? !near : near) continue;
            bd = dd; best = { kind, x0, z0, x1, z1 };
        }
        if (!best) { console.warn('[FAVELA] sem lugar para ' + kind); return; }
        this.squares.push(best);
        this._rect(best.x0, best.z0, best.x1, best.z1, this.OPEN, true);
    },

    // ------------------------------------------------------------------ becos
    _alleysFromVoronoi(rng) {
        const R = this.R, SP = 19, seeds = [];
        for (let z = R.z0 + SP / 2; z < R.z1; z += SP) for (let x = R.x0 + SP / 2; x < R.x1; x += SP) {
            const px = x + (rng() - 0.5) * SP * 0.85, pz = z + (rng() - 0.5) * SP * 0.85;
            if (this.cellAt(px, pz) !== this.OUT) seeds.push([px, pz]);
        }
        // células (retângulo ∩ semiplanos das bissetrizes), com o vizinho dono de cada aresta (l: -1 = borda)
        const edges = new Map(), RAD = SP * 2.6;
        seeds.forEach((s, i) => {
            let P = [{ x: R.x0, z: R.z0, l: -1 }, { x: R.x1, z: R.z0, l: -1 }, { x: R.x1, z: R.z1, l: -1 }, { x: R.x0, z: R.z1, l: -1 }];
            seeds.forEach((q, j) => {
                if (j === i || Math.abs(q[0] - s[0]) > RAD || Math.abs(q[1] - s[1]) > RAD) return;
                const nx = q[0] - s[0], nz = q[1] - s[1], c = (q[0] * q[0] + q[1] * q[1] - s[0] * s[0] - s[1] * s[1]) / 2;     // fica onde n·p ≤ c
                const out = [];
                for (let k = 0; k < P.length; k++) {
                    const a = P[k], b = P[(k + 1) % P.length], da = nx * a.x + nz * a.z - c, db = nx * b.x + nz * b.z - c;
                    if (da <= 0) out.push(a);
                    if ((da <= 0) !== (db <= 0)) { const t = da / (da - db); out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, l: da <= 0 ? j : a.l }); }
                }
                P = out;
            });
            for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length]; if (a.l > i) edges.set(i + ',' + a.l, [[a.x, a.z], [b.x, b.z]]); }
        });
        // fora: o que cai na safe house, na quadra/campinho ou corre por cima da rua; a ponta que entra na borda rala é aparada
        const key = (p) => Math.round(p[0] * 4) + ',' + Math.round(p[1] * 4);
        let list = [];
        for (const [a, b] of edges.values()) {
            const L = hypot(b[0] - a[0], b[1] - a[1]);
            if (L < 1.5) continue;
            const n = Math.ceil(L), cs = [];
            for (let k = 0; k <= n; k++) cs.push(this.cellAt(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n));
            if (cs.some((c) => c === this.RES || c === this.OPEN || c === -1)) continue;
            if (cs.filter((c) => c === this.ROAD).length > n * 0.6) continue;
            let k0 = 0, k1 = n;
            while (k0 <= n && cs[k0] === this.OUT) k0++;
            while (k1 >= 0 && cs[k1] === this.OUT) k1--;
            if (k1 - k0 < 2) continue;
            const A = k0 ? [a[0] + (b[0] - a[0]) * k0 / n, a[1] + (b[1] - a[1]) * k0 / n] : a, B = k1 < n ? [a[0] + (b[0] - a[0]) * k1 / n, a[1] + (b[1] - a[1]) * k1 / n] : b;
            list.push({ a: A, b: B, ka: key(A), kb: key(B), ra: cs[0] === this.ROAD || k0 > 0, rb: cs[n] === this.ROAD || k1 < n });       // (ponta na rua ou na borda: "lá fora")
        }
        // conectividade: tira ~22% (sem isolar ninguém de "lá fora" = rua ou borda)
        const reach = (skip) => {
            const adj = new Map(), add = (u, v) => { (adj.get(u) || adj.set(u, []).get(u)).push(v); };
            list.forEach((s, i) => { if (skip.has(i)) return; add(s.ka, s.kb); add(s.kb, s.ka); if (s.ra) { add(s.ka, '*'); add('*', s.ka); } if (s.rb) { add(s.kb, '*'); add('*', s.kb); } });
            const seen = new Set(['*']), st = ['*'];
            while (st.length) { const u = st.pop(); for (const v of adj.get(u) || []) if (!seen.has(v)) { seen.add(v); st.push(v); } }
            return seen;
        };
        const seen0 = reach(new Set());
        list = list.filter((s) => seen0.has(s.ka));                                // ilhas soltas: viram miolo
        const removed = new Set(), order = list.map((_, i) => i).sort(() => rng() - 0.5);
        let target = Math.floor(list.length * 0.22);
        for (const i of order) {
            if (target <= 0) break;
            removed.add(i);
            const seen = reach(removed);
            if (list.every((s, k) => removed.has(k) || seen.has(s.ka))) target--; else removed.delete(i);
        }
        list = list.filter((_, i) => !removed.has(i));
        // trema: 1–2 pontos no meio, empurrados para o lado; 3/4 becos de 1,4–1,9 u, 1/4 vielas de 2,4–3,2 u (com frades nas bocas)
        for (const s of list) {
            const { a, b } = s, L = hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
            const pts = [a.slice()], n = L > 14 ? 2 : 1;
            for (let k = 1; k <= n; k++) { const t = k / (n + 1), o = (rng() - 0.5) * Math.min(3.4, L * 0.22); pts.push([a[0] + (b[0] - a[0]) * t + nx * o, a[1] + (b[1] - a[1]) * t + nz * o]); }
            pts.push(b.slice());
            this.alleys.push({ pts, w: rng() < 0.25 ? 2.4 + rng() * 0.8 : 1.4 + rng() * 0.5 });
        }
    },

    // ------------------------------------------------------------------ barracos
    _packShacks(rng) {
        const W = this.W, H = this.H, C = this.cells, R = this.R;
        const walk = (c) => c === this.ALLEY || c === this.ROAD || c === this.OPEN || c === this.RES;
        // distância (em células) até o acesso mais perto (andável ou passagem), pelas células livres; `par` = de onde veio
        const dist = new Int32Array(W * H), par = new Int32Array(W * H);
        const flood = () => {
            dist.fill(-1); const q = [];
            for (let k = 0; k < W * H; k++) if (walk(C[k]) || C[k] === this.GAP) { dist[k] = 0; par[k] = -1; q.push(k); }
            for (let h = 0; h < q.length; h++) {
                const k = q[h], i = k % W, j = (k / W) | 0;
                for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
                    const kk = jj * W + ii; if (dist[kk] >= 0 || C[kk] !== this.FREE) continue;
                    dist[kk] = dist[k] + 1; par[kk] = k; q.push(kk);
                }
            }
        };
        const sizes = [3, 4, 4, 5, 5, 5, 6, 6, 7, 8], front = [7, 7, 8, 8, 6];
        const ext = (i, j, di, dj) => { let n = 0; while (n < 8 && i >= 0 && j >= 0 && i < W && j < H && C[j * W + i] === this.FREE) { n++; i += di; j += dj; } return n; };
        const wall = (i, j) => i < 0 || j < 0 || i >= W || j >= H || C[j * W + i] === this.BLD;
        const facades = ['brick0', 'brick1', 'brick2', 'brick0', 'brick1', 'house0', 'house1', 'house2', 'house3', 'concrete0'];
        const roofs = ['zinc0', 'zinc1', 'zinc0', 'tarp0', 'tarp1', 'tarp2', 'slab0', 'slab1', 'slab0', 'tile1', 'tile0'];
        const free = (i0, j0, w, d) => {
            if (i0 < 0 || j0 < 0 || i0 + w > W || j0 + d > H) return false;
            for (let j = j0; j < j0 + d; j++) for (let i = i0; i < i0 + w; i++) if (C[j * W + i] !== this.FREE) return false;
            return true;
        };
        const touch = (i0, j0, w, d, f) => {                                       // células de um tipo encostadas no retângulo
            let n = 0;
            for (let i = i0; i < i0 + w; i++) { if (j0 > 0 && f(C[(j0 - 1) * W + i])) n++; if (j0 + d < H && f(C[(j0 + d) * W + i])) n++; }
            for (let j = j0; j < j0 + d; j++) { if (i0 > 0 && f(C[j * W + i0 - 1])) n++; if (i0 + w < W && f(C[j * W + i0 + w])) n++; }
            return n;
        };
        const [s0, s1] = this.SHRINK;
        const addLot = (i0, j0, w, d, back = true) => {
            for (let j = j0; j < j0 + d; j++) for (let i = i0; i < i0 + w; i++) C[j * W + i] = this.BLD;
            // às vezes uma passagem de 1 u de um dos lados: o miolo do quarteirão também tem casas com porta
            if (back && rng() < 0.22) {
                const side = Math.floor(rng() * 4);
                if (side < 2) { const jj = side ? j0 + d : j0 - 1; if (jj >= 0 && jj < H) for (let i = i0; i < i0 + w; i++) if (C[jj * W + i] === this.FREE) C[jj * W + i] = this.GAP; }
                else { const ii = side === 3 ? i0 + w : i0 - 1; if (ii >= 0 && ii < W) for (let j = j0; j < j0 + d; j++) if (C[j * W + ii] === this.FREE) C[j * W + ii] = this.GAP; }
            }
            const sh = () => s0 + rng() * (s1 - s0), f = rng();
            const floors = f < 0.4 ? 1 : (f < 0.75 ? 2 : (f < 0.95 ? 3 : 4));
            this.lots.push({ x0: R.x0 + i0 + sh(), z0: R.z0 + j0 + sh(), x1: R.x0 + i0 + w - sh(), z1: R.z0 + j0 + d - sh(), floors, height: floors * Config.city.floorH,
                facade: facades[Math.floor(rng() * facades.length)], roof: roofs[Math.floor(rng() * roofs.length)], cell: [i0, j0, w, d], shops: [] });
        };
        // Comércio na beira das ruas: uma fileira de casas largas (7–8 u de frente, vitrine para a rua) dos dois lados de cada rua.
        const P = {};
        for (const e of this.roadEdges) {
            if (e.cls !== 'fav') continue;
            for (const sd of [1, -1]) for (let t = 2; t < e.len - 2; t += 1) {
                RoadPlan.at(e, t, P);
                const nx = -P.tz * sd, nz = P.tx * sd;                                 // normal para fora da rua
                const ci = Math.floor(P.x + nx * (e.w / 2 + this.ROAD_M + 0.7) - R.x0), cj = Math.floor(P.z + nz * (e.w / 2 + this.ROAD_M + 0.7) - R.z0);
                if (ci < 0 || cj < 0 || ci >= W || cj >= H || C[cj * W + ci] !== this.FREE) continue;
                const alongZ = Math.abs(nx) > Math.abs(nz), dep = 4 + Math.floor(rng() * 4);       // frente em x (rua de lado) ou em z
                for (const len of [8, 7, 8, 7, 6]) {
                    let ok = false;
                    for (const sh of [0, -1, 1, -2, 2, -3, 3]) {
                        let i0, j0, w, d;
                        if (alongZ) { w = dep; d = len; j0 = cj - (len >> 1) + sh; i0 = nx > 0 ? ci : ci - dep + 1; while (i0 > 0 && nx > 0 && C[cj * W + i0 - 1] === this.FREE) i0--; while (nx < 0 && i0 + w < W && C[cj * W + i0 + w] === this.FREE) i0++; }
                        else { w = len; d = dep; i0 = ci - (len >> 1) + sh; j0 = nz > 0 ? cj : cj - dep + 1; while (j0 > 0 && nz > 0 && C[(j0 - 1) * W + ci] === this.FREE) j0--; while (nz < 0 && j0 + d < H && C[(j0 + d) * W + ci] === this.FREE) j0++; }
                        if (!free(i0, j0, w, d) || touch(i0, j0, w, d, (c) => c === this.ROAD) < 2) continue;
                        addLot(i0, j0, w, d, false); ok = true; break;
                    }
                    if (ok) break;
                }
            }
        }
        // Várias passadas: barracos de fora para dentro; o miolo que sobra ganha uma passagem de 1 u (servidão) até o acesso mais
        // perto, e a passada seguinte enche em volta dela.
        for (let pass = 0; pass < 5; pass++) {
        flood();
        const cand = [];
        for (let k = 0; k < W * H; k++) if (C[k] === this.FREE && dist[k] >= 1) cand.push(k);
        cand.sort((a, b) => (dist[a] - dist[b]) || (Pixel.hash(a, 7 + pass, 3) - Pixel.hash(b, 7 + pass, 3)));
        for (const k of cand) {
            if (C[k] !== this.FREE) continue;
            const ci = k % W, cj = (k / W) | 0;
            const big = dist[k] === 1 && touch(ci, cj, 1, 1, (c) => c === this.ROAD || c === this.OPEN) > 0;       // de frente para a rua: casa larga (loja)
            // espaço livre em cruz a partir da célula; o barraco encosta no vizinho (ou no acesso) para não sobrar fresta
            const L = ext(ci, cj, -1, 0), Rt = ext(ci, cj, 1, 0), Dn = ext(ci, cj, 0, -1), Up = ext(ci, cj, 0, 1), minS = pass < 2 ? 3 : 2;
            if (L + Rt - 1 < minS || Dn + Up - 1 < minS) continue;
            let w = 0, d = 0, placed = false;
            for (let t = 0; t < 10 && !placed; t++) {
                if (t % 3 === 0) { const S = big && t < 6 ? front : sizes; w = Math.min(L + Rt - 1, S[Math.floor(rng() * S.length)]); d = Math.min(Dn + Up - 1, S[Math.floor(rng() * S.length)]); }
                else if (w >= d) w--; else d--;                                       // não coube: encolhe o lado maior
                if (w < minS || d < minS) continue;
                const lo = Math.max(ci - L + 1, ci - w + 1), hi = Math.min(ci, ci + Rt - w), lj = Math.max(cj - Dn + 1, cj - d + 1), hj = Math.min(cj, cj + Up - d);
                const i0 = wall(lo - 1, cj) ? lo : (wall(hi + w, cj) ? hi : (rng() < 0.5 ? lo : hi));
                const j0 = wall(ci, lj - 1) ? lj : (wall(ci, hj + d) ? hj : (rng() < 0.5 ? lj : hj));
                if (!free(i0, j0, w, d) || touch(i0, j0, w, d, (c) => walk(c) || c === this.GAP) < 2) continue;
                placed = true;
                addLot(i0, j0, w, d);
            }
        }
        if (pass === 4) break;
        // servidões: em cada bolsão livre de 12+ células, do ponto mais fundo até o acesso
        flood();
        const comp = new Int32Array(W * H).fill(-1);
        let carved = 0;
        for (let k0 = 0; k0 < W * H; k0++) {
            if (C[k0] !== this.FREE || comp[k0] >= 0 || dist[k0] < 0) continue;
            const mem = [k0]; comp[k0] = k0;
            for (let h = 0; h < mem.length; h++) {
                const k = mem[h], i = k % W, j = (k / W) | 0;
                for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
                    const kk = jj * W + ii; if (comp[kk] < 0 && C[kk] === this.FREE) { comp[kk] = k0; mem.push(kk); }
                }
            }
            if (mem.length < 12) continue;
            let far = mem[0]; for (const k of mem) if (dist[k] > dist[far]) far = k;
            for (let k = far; k >= 0 && C[k] === this.FREE; k = par[k]) C[k] = this.GAP;
            carved++;
        }
        if (!carved) break;
        }
        for (let k = 0; k < W * H; k++) if (C[k] === this.FREE) C[k] = this.GAP;                // o que sobrou: quintal, terreno baldio
    },

    // ------------------------------------------------------------------ frades
    // Onde um carro (disco de raio CAR_R) ainda conseguiria sair da rua (ou de fora do morro, ou do quintal da safe house) e entrar
    // num beco/quintal/quadra, a boca leva uma fileira de frades a cada POST_GAP: moto e pedestre passam entre eles, carro não.
    // Inundação numa grade de 0,5 u (centros e cantos das células), repetida até não sobrar vazamento.
    _plugCarLeaks() {
        const W = this.W, H = this.H, C = this.cells, PW = 2 * W + 1, PH = 2 * H + 1, N = PW * PH;
        const rr = this.CAR_R - this.SHRINK[1], rp = this.CAR_R + this.POST_R;
        const fit = new Uint8Array(N), type = new Uint8Array(N);
        for (let pj = 0; pj < PH; pj++) for (let pi = 0; pi < PW; pi++) {
            const x = pi / 2, z = pj / 2, p = pj * PW + pi;
            type[p] = C[Math.min(H - 1, Math.floor(z + 0.01)) * W + Math.min(W - 1, Math.floor(x + 0.01))];
            let ok = true;
            for (let j = Math.max(0, Math.floor(z - rr)); j <= Math.min(H - 1, Math.floor(z + rr)) && ok; j++) for (let i = Math.max(0, Math.floor(x - rr)); i <= Math.min(W - 1, Math.floor(x + rr)); i++) {
                if (C[j * W + i] !== this.BLD) continue;
                const ddx = Math.max(i - x, 0, x - i - 1), ddz = Math.max(j - z, 0, z - j - 1);
                if (ddx * ddx + ddz * ddz < rr * rr) { ok = false; break; }
            }
            fit[p] = ok ? 1 : 0;
        }
        const allowed = (t) => t === this.ROAD || t === this.OUT || t === this.RES;
        const seen = new Uint8Array(N), comp = new Int32Array(N), q = new Int32Array(N);
        const nb = (p, f) => { const pi = p % PW, pj = (p / PW) | 0; if (pi > 0) f(p - 1); if (pi < PW - 1) f(p + 1); if (pj > 0) f(p - PW); if (pj < PH - 1) f(p + PW); };
        const posts = [], postGrid = new Map(), gk = (x, z) => Math.floor(x / 3) + ',' + Math.floor(z / 3);
        const nearPost = (x, z, r) => {
            for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const o of postGrid.get((Math.floor(x / 3) + a) + ',' + (Math.floor(z / 3) + b)) || []) if (hypot(o[0] - x, o[1] - z) < r) return true;
            return false;
        };
        for (let pass = 0; pass < 8; pass++) {
            seen.fill(0);
            let qh = 0, qt = 0;
            for (let p = 0; p < N; p++) if (fit[p] && allowed(type[p])) { seen[p] = 1; q[qt++] = p; }
            while (qh < qt) { const p = q[qh++]; nb(p, (o) => { if (!seen[o] && fit[o]) { seen[o] = 1; q[qt++] = o; } }); }
            // componentes de vazamento (alcançados e fora do permitido); só importam os que levam a beco/quadra ou são grandes
            comp.fill(-1);
            let placed = 0, ncomp = 0;
            for (let p0 = 0; p0 < N; p0++) {
                if (!seen[p0] || allowed(type[p0]) || comp[p0] >= 0) continue;
                const cid = ncomp++, mem = [p0];
                let h = 0, deep = false;
                comp[p0] = cid;
                while (h < mem.length) {
                    const p = mem[h++];
                    if (type[p] === this.ALLEY || type[p] === this.OPEN) deep = true;
                    nb(p, (o) => { if (seen[o] && !allowed(type[o]) && comp[o] < 0) { comp[o] = cid; mem.push(o); } });
                }
                if (!deep && mem.length < 120) continue;
                // fronteira: posições do vazamento encostadas na área permitida, varridas em ordem (fileira)
                const front = mem.filter((p) => { let f = false; nb(p, (o) => { if (seen[o] && allowed(type[o])) f = true; }); return f; });
                front.sort((a, b) => ((a / PW) | 0) - ((b / PW) | 0) || (a % PW) - (b % PW));
                for (const p of front) {
                    const x = (p % PW) / 2, z = ((p / PW) | 0) / 2;
                    if (nearPost(x, z, this.POST_GAP - 0.01)) continue;
                    posts.push([x, z]);
                    const k = gk(x, z); (postGrid.get(k) || postGrid.set(k, []).get(k)).push([x, z]);
                    placed++;
                    const r = Math.ceil(rp * 2);                                          // posições que o frade tira do carro
                    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
                        const qi = (p % PW) + di, qj = ((p / PW) | 0) + dj;
                        if (qi >= 0 && qj >= 0 && qi < PW && qj < PH && hypot(di / 2, dj / 2) < rp) fit[qj * PW + qi] = 0;
                    }
                }
            }
            if (!placed) break;
        }
        const R = this.R;
        this.bollards = posts.map(([x, z]) => ({ x: R.x0 + x, z: R.z0 + z }));
    },

    // ------------------------------------------------------------------ portas, lojas, sujeira, postes
    _dressUp(rng, grid) {
        const W = this.W, H = this.H, C = this.cells, R = this.R, kinds = [5, 0, 1, 6, 14, 14, 5, 2, 2];
        const sideCells = (l, side) => {
            const [i0, j0, w, d] = l.cell, out = [];
            if (side === 'S' || side === 'N') { const j = side === 'S' ? j0 - 1 : j0 + d; if (j >= 0 && j < H) for (let i = i0; i < i0 + w; i++) out.push(C[j * W + i]); }
            else { const i = side === 'W' ? i0 - 1 : i0 + w; if (i >= 0 && i < W) for (let j = j0; j < j0 + d; j++) out.push(C[j * W + i]); }
            return out;
        };
        const score = (cs) => cs.reduce((s, c) => s + (c === this.ROAD || c === this.OPEN ? 3 : (c === this.ALLEY || c === this.RES ? 2 : (c === this.GAP ? 1 : 0))), 0);
        for (const l of this.lots) {
            const obs = { x0: l.x0, z0: l.z0, x1: l.x1, z1: l.z1, h: l.height };
            l.obs = obs; grid.obstacles.push(obs);
            // porta: o lado com mais acesso (rua/largo > beco > quintal)
            const sides = ['S', 'N', 'W', 'E'].map((s) => { const cs = sideCells(l, s); return { s, cs, v: score(cs) }; }).sort((a, b) => b.v - a.v);
            const s = sides[0].s, mx = (l.x0 + l.x1) / 2, mz = (l.z0 + l.z1) / 2;
            l.front = s;
            l.door = s === 'S' ? { x: mx, z: l.z0 - 0.6, side: s } : s === 'N' ? { x: mx, z: l.z1 + 0.6, side: s } : s === 'W' ? { x: l.x0 - 0.6, z: mz, side: s } : { x: l.x1 + 0.6, z: mz, side: s };
            // loja: frente para a rua/largo (quase sempre) ou para um beco (às vezes), parede de 6,3 u ou mais (vitrine de 6 u)
            const cs = sides[0].cs, len = (s === 'S' || s === 'N') ? l.x1 - l.x0 : l.z1 - l.z0;
            const onRoad = cs.filter((c) => c === this.ROAD || c === this.OPEN).length >= Math.max(2, cs.length * 0.3);       // (rua torta: encosta só num pedaço)
            const P = onRoad ? 0.85 : (cs.filter((c) => c === this.ALLEY || c === this.OPEN).length >= cs.length * 0.6 ? 0.3 : 0);
            if (len >= 6.3 && rng() < P) {
                const a0 = (s === 'S' || s === 'N') ? l.x0 : l.z0, n = Math.min(2, Math.max(1, Math.floor((len - 0.3) / 6.1))), start = a0 + (len - n * 6) / 2;
                for (let k = 0; k < n; k++) l.shops.push({ side: s, a: start + k * 6, kind: kinds[Math.floor(rng() * kinds.length)] });
                if (l.floors > 2 && rng() < 0.6) { l.floors = 2; l.height = obs.h = 2 * Config.city.floorH; }
                grid._carveDoors(l);
            }
        }
        // frades: sólidos finos (a navegação a pé ignora — passa entre eles)
        for (const b of this.bollards) grid.obstacles.push({ x0: b.x - this.POST_R, z0: b.z - this.POST_R, x1: b.x + this.POST_R, z1: b.z + this.POST_R, h: 0.9, thin: true });
        // lixo, entulho e manchas nos becos; postes com 'gato' a cada ~14 u (num quintal ao lado ou na viela larga)
        const cellOk = (x, z, v) => v.includes(this.cellAt(x, z));
        for (const a of this.alleys) {
            const P = a.pts;
            for (let k = 0; k + 1 < P.length; k++) {
                const p = P[k], q = P[k + 1], L = hypot(q[0] - p[0], q[1] - p[1]), nx = -(q[1] - p[1]) / L, nz = (q[0] - p[0]) / L;
                for (let s = 1.5 + rng() * 4; s < L - 1; s += 4 + rng() * 7) {
                    if (rng() < 0.45) continue;
                    const o = (rng() < 0.5 ? -1 : 1) * Math.min(0.5, a.w * 0.3), x = p[0] + (q[0] - p[0]) * s / L + nx * o, z = p[1] + (q[1] - p[1]) * s / L + nz * o;
                    if (cellOk(x, z, [this.ALLEY, this.GAP])) this.props.push({ type: 'prop', kind: ['trash', 'trash', 'debris', 'stain'][Math.floor(rng() * 4)], x, z, s: 0.5 + rng() * 0.3, seed: Math.floor(rng() * 1000) });
                }
                if (L > 6 && rng() < 0.6) {
                    const s = L * (0.3 + rng() * 0.4), bx = p[0] + (q[0] - p[0]) * s / L, bz = p[1] + (q[1] - p[1]) * s / L;
                    for (const o of [1.4, -1.4, 2.2, -2.2, 0.9, -0.9]) {
                        const x = bx + nx * o, z = bz + nz * o;
                        const ok = this.cellAt(x, z) === this.GAP || (a.w >= 2.4 && Math.abs(o) < 1.2 && this.cellAt(x, z) === this.ALLEY);
                        if (ok && cellOk(x + 0.3, z + 0.3, [this.GAP, this.ALLEY]) && cellOk(x - 0.3, z - 0.3, [this.GAP, this.ALLEY])) { this.props.push({ type: 'pole', kind: 'gato', x, z, s: 1, seed: Math.floor(rng() * 1000) }); break; }
                    }
                }
            }
        }
        // bananeiras e mato nos quintais; esconderijos (latão, caixote) encostados numa parede, sem fechar passagem
        const HK = { crate_big: [1.6, 1.6, 1.6], crate: [1.2, 1.2, 1.2], barrel: [1.0, 1.0, 1.1] }, hk = ['barrel', 'crate', 'barrel', 'crate_big'];
        let nh = 0, nt = 0;
        for (let t = 0; t < 9000 && (nh < 110 || nt < 220); t++) {
            const x = R.x0 + rng() * W, z = R.z0 + rng() * H;
            if (this.cellAt(x, z) !== this.GAP) continue;
            const at = (dx, dz) => this.cellAt(x + dx, z + dz);
            if (rng() < 0.6) {
                if (nt < 220 && [at(1.6, 0), at(-1.6, 0), at(0, 1.6), at(0, -1.6), at(1.2, 1.2), at(-1.2, -1.2)].every((c) => c === this.GAP)) { this.props.push({ type: 'tree', kind: rng() < 0.55 ? 'banana' : 'bush', x, z, s: 0.7 + rng() * 0.3, seed: Math.floor(rng() * 1000) }); nt++; }
                continue;
            }
            if (nh >= 110) continue;
            const kind = hk[Math.floor(rng() * hk.length)], [w, d, h] = HK[kind];
            if ([at(w * 0.5 + 0.4, 0), at(-w * 0.5 - 0.4, 0), at(0, d * 0.5 + 0.4), at(0, -d * 0.5 - 0.4)].filter((c) => c === this.BLD).length !== 1) continue;
            if ([at(0, 0), at(w / 2, d / 2), at(-w / 2, -d / 2), at(w / 2, -d / 2), at(-w / 2, d / 2), at(w + 0.6, 0), at(-w - 0.6, 0), at(0, d + 0.6), at(0, -d - 0.6)].filter((c) => c === this.GAP).length < 7) continue;
            const r = { x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2, h, hide: true };
            grid.obstacles.push(r);
            const spot = { x, z, w, d, h, kind };
            grid.hideSpots.push(spot);
            this.props.push(Object.assign({ type: 'hide' }, spot));
            nh++;
        }
    },

    // ------------------------------------------------------------------ chão e andável
    _groundBoxes(grid) {
        const Wd = Config.world, c = Wd.cell, R = this.R;
        const gi0 = Math.floor((R.x0 - Wd.minX) / c), gi1 = Math.ceil((R.x1 - Wd.minX) / c) - 1, gj0 = Math.floor((R.z0 - Wd.minZ) / c), gj1 = Math.ceil((R.z1 - Wd.minZ) / c) - 1;
        const used = (gi, gj) => {
            const x0 = Wd.minX + gi * c, z0 = Wd.minZ + gj * c;
            for (let z = z0 + 0.5; z < z0 + c; z += 1) for (let x = x0 + 0.5; x < x0 + c; x += 1) if (this.inside(x, z)) return true;
            return false;
        };
        this.groundBoxes = [];
        for (let gj = gj0; gj <= gj1; gj++) {
            let run = -1;
            for (let gi = gi0; gi <= gi1 + 1; gi++) {
                const u = gi <= gi1 && used(gi, gj);
                if (u && run < 0) run = gi;
                if (!u && run >= 0) { this.groundBoxes.push([Wd.minX + run * c, Wd.minZ + gj * c, Wd.minX + gi * c, Wd.minZ + (gj + 1) * c]); run = -1; }
            }
        }
        this.walkRects = this.groundBoxes;
        for (const b of this.groundBoxes) grid.urbanBoxes.push([b[0], b[1], b[2], b[3], false]);          // (a favela segue o morro: não achata)
    },

    // ------------------------------------------------------------------ grafo dos becos (motos)
    // Nós nos pontos dos becos e a cada ~8 u das ruas; a boca de cada beco liga ao ponto da rua mais perto.
    _buildGraph() {
        const nodes = [], map = new Map(), key = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2);
        const node = (x, z) => { const k = key(x, z); let n = map.get(k); if (!n) { n = { x, z, links: [], id: nodes.length, road: false }; map.set(k, n); nodes.push(n); } return n; };
        const link = (a, b) => { if (a !== b && !a.links.includes(b)) { a.links.push(b); b.links.push(a); } };
        const roadNodes = [];
        for (const e of this.roadEdges) {
            if (e.cls !== 'fav' && e.cls !== 'dirt') continue;
            let prev = null;
            const n = Math.max(1, Math.round(e.len / 8));
            for (let k = 0; k <= n; k++) {
                const p = RoadPlan.at(e, e.len * k / n);
                if (this.cellAt(p.x, p.z) < 0) { prev = null; continue; }
                const m = node(p.x, p.z); m.road = true; m.w = e.w;
                if (prev) link(prev, m);
                prev = m; roadNodes.push(m);
            }
        }
        for (const a of this.alleys) {
            let prev = null;
            for (const p of a.pts) { const n = node(p[0], p[1]); n.w = Math.max(n.w || 0, Math.max(a.w, 1.44)); if (prev) link(prev, n); prev = n; }
        }
        for (const n of nodes) {                                                   // bocas: ponta/canto de beco perto da rua
            if (n.road) continue;
            let best = null, bd = 9;
            for (const r of roadNodes) { const d = hypot(r.x - n.x, r.z - n.z); if (d < bd) { bd = d; best = r; } }
            if (best && (n.links.length === 1 || bd < 5)) link(n, best);
        }
        this.graph = { nodes };
    },

    // Navegação a pé: as ruas do morro custam mais (como a beira de parede) — quem anda prefere os becos e só atravessa a rua.
    navCost(grid, nav) {
        const R = this.R, W = this.W, C = this.cells;
        for (let j = 0; j < this.H; j++) for (let i = 0; i < W; i++) {
            if (C[j * W + i] !== this.ROAD) continue;
            const ni = R.x0 + i - nav.minX, nj = R.z0 + j - nav.minZ;
            if (ni < 0 || nj < 0 || ni >= nav.w || nj >= nav.h) continue;
            const k = nj * nav.w + ni;
            if (grid[k]) grid[k] = 2;
        }
    },

    // ------------------------------------------------------------------ consultas
    // Nó do grafo mais perto de (x, z) (alley: só becos — nada na pista, onde um parado trancaria o trânsito).
    nodeNear(x, z, alley = false) {
        let best = null, bd = Infinity;
        for (const n of this.graph ? this.graph.nodes : []) { if (alley && !this._offRoad(n)) continue; const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z); if (d < bd) { bd = d; best = n; } }
        return best;
    },
    _offRoad(n) { return n.off !== undefined ? n.off : (n.off = !n.road && this.cellAt(n.x, n.z) !== this.ROAD); },
    // Cabe um carro estacionado em (x, z), de frente para (hx, hz)? (nenhum barraco nem frade embaixo)
    roomForCar(x, z, hx, hz) {
        if (!this.built || !Standing.inFavela(x, z)) return true;
        for (const a of [-2.3, 0, 2.3]) for (const l of [-1.05, 0, 1.05]) { const c = this.cellAt(x + hx * a - hz * l, z + hz * a + hx * l); if (c === this.BLD || c === this.ALLEY) return false; }
        return !this.bollards.some((b) => Math.abs(b.x - x) < 3 && Math.abs(b.z - z) < 3);
    },
    // Vagas da safe house: no quintal da frente, de frente para a casa, dos dois lados do caminho da porta.
    yardSlots() {
        const S = this.SAFE, y = this.yard; if (!y) return null;
        const dx = S.x + (SafeHouse.door.x0 + SafeHouse.door.x1) / 2, z = (y.z0 + S.z) / 2;
        return [{ x: dx - 6, z, h: 0 }, { x: dx + 6, z, h: 0 }].filter((p) => p.x - 1.1 > y.x0 && p.x + 1.1 < y.x1 && S.z - y.z0 >= 5);
    },
    // Entradas do morro pelo lado da cidade (onde cada rua principal entra na favela) e a mais perto de (x, z).
    entrances() {
        if (this._ent) return this._ent;
        this._ent = [];
        for (const m of this.MAIN) { const q = RoadPlan.nearestRoadPoint(this.R.x1 - 4, m.pts[0][1], 40); if (q) this._ent.push({ x: q.x, z: q.z, name: m.name }); }
        return this._ent;
    },
    entranceNear(x, z) { let best = null, bd = Infinity; for (const e of this.entrances()) { const d = hypot(e.x - x, e.z - z); if (d < bd) { bd = d; best = e; } } return best; },
    alleyPoint(x, z) { const n = this.nodeNear(x, z, true); return n ? { x: n.x, z: n.z, d: hypot(n.x - x, n.z - z) } : null; },
    randomAlleyPoint(rnd = Math.random, pred = null) {
        const N = this.graph ? this.graph.nodes.filter((n) => this._offRoad(n) && (!pred || pred(n.x, n.z))) : [];
        const n = N[Math.floor(rnd() * N.length)];
        return n ? { x: n.x, z: n.z } : null;
    },
    // Caminho pelo grafo (A*) de (ax, az) a (bx, bz): [[x, z], ...] ou null.
    route(ax, az, bx, bz) {
        const A = this.nodeNear(ax, az), B = this.nodeNear(bx, bz);
        if (!A || !B) return null;
        const g = new Map([[A, 0]]), from = new Map(), open = [[hypot(A.x - B.x, A.z - B.z), A]], done = new Set();
        while (open.length) {
            let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
            const [, u] = open.splice(bi, 1)[0];
            if (u === B) break;
            if (done.has(u)) continue;
            done.add(u);
            for (const v of u.links) {
                const c = g.get(u) + hypot(v.x - u.x, v.z - u.z);
                if (c < (g.has(v) ? g.get(v) : Infinity)) { g.set(v, c); from.set(v, u); open.push([c + hypot(v.x - B.x, v.z - B.z), v]); }
            }
        }
        if (A !== B && !from.has(B)) return null;
        const out = [];
        for (let n = B; n; n = from.get(n)) out.push([n.x, n.z]);
        return out.reverse();
    },
};
