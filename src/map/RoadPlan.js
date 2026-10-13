// ============================================================================
// RoadPlan — a malha viária do MUNDO inteiro como um GRAFO de ruas retas (eixos N/S/L/O), esparso.
//
// Entrada: segmentos retos (RoadPlan.addV / addH) com uma CLASSE de via (largura, superfície, tipo). Eles vêm de:
//   • grades de distrito (cidade, ilha, favela): linhas regulares, só os trechos que cabem em terra firme;
//   • pontes (cidade ↔ ilha) e rodovias/estradas de terra pelo continente.
// build() corta os segmentos em todos os cruzamentos, cria os NÓS (cruzamentos, curvas) e os TRECHOS entre eles, poda
// pontas-sem-saída e funde nós retos de 2 pernas. Na grade, cada nó tem até 4 pernas (N, S, L, O: nbr/edge[0..3]).
// VIAS LIVRES (addPath: diagonais, curvas — polilinhas em qualquer ângulo) entram depois: cortam os trechos que cruzam e passam
// pelos nós por onde passam. Todo nó tem `arms` (as pernas, em qualquer direção, em ordem anti-horária, com o corte = onde o
// trecho reto começa e a fase do semáforo); todo trecho tem `pts`/`cum` (a polilinha do eixo) e cutA/cutB. Nó com perna livre
// (`gen`) tem o polígono do cruzamento (`poly`).
//
// Consultas (usadas por RoadNet, Gps, polícia, trânsito, mapa):
//   nodeNear(x, z, r) · lineNear('v'|'h', coord) · roadSpan(axis, at, a, b) · nearestRoadPoint(x, z) · randomLanePoint()
// ============================================================================

const RoadPlan = {
    // Classes de via: largura total do asfalto (u), faixa = w/4 do eixo, tipo e superfície.
    CLASS: {
        city:   { w: 10, kind: 'urban',  surface: 'asphalt', label: 'Rua' },
        isl:    { w: 10, kind: 'urban',  surface: 'asphalt', label: 'Rua' },
        ave:    { w: 16, kind: 'urban',  surface: 'asphalt', label: 'Avenida', median: 3 },
        fav:    { w: 7,  kind: 'favela', surface: 'concrete', label: 'Rua' },      // (cimentada: nada de asfalto no morro)
        hwy:    { w: 12, kind: 'rural',  surface: 'asphalt', label: 'Rodovia' },
        dirt:   { w: 8,  kind: 'rural',  surface: 'dirt',    label: 'Estrada de terra' },
        trail:  { w: 5,  kind: 'rural',  surface: 'earth',   label: 'Caminho' },
        bridge: { w: 12, kind: 'bridge', surface: 'asphalt', label: 'Ponte' },
        via:    { w: 12, kind: 'urban',  surface: 'asphalt', label: 'Elevado' },
    },
    DIRS: [{ dx: 0, dz: 1 }, { dx: 0, dz: -1 }, { dx: 1, dz: 0 }, { dx: -1, dz: 0 }],      // N, S, L, O (mesma ordem do RoadNet.DIRS)

    segs: [],
    report: [],                                  // trechos descartados na validação (para ajuste manual do plano)
    // Marcas de NÓ, por posição "x,z" (antes do build): { round: { R, r } } = ROTATÓRIA (disco de asfalto de raio R com ilha de raio
    // r; mão direita: gira no sentido anti-horário visto de cima); { uturn: { gap } } = RETORNO no canteiro da avenida (vão de `gap` u).
    // Um retorno no meio de um trecho reto vira nó de 2 pernas (o build não o funde) e o trecho é cortado ali.
    marks: new Map(),
    mark(x, z, data) { const k = x + ',' + z; this.marks.set(k, Object.assign(this.marks.get(k) || {}, data)); },
    // Vias LIVRES: polilinha [[x, z], ...] (qualquer ângulo; curva = muitos pontos) com a classe. opts: { name }.
    paths: [],
    addPath(pts, cls = 'city', opts = null) { if (pts.length >= 2) this.paths.push(Object.assign({ pts: pts.map((p) => [p[0], p[1]]), cls }, opts)); },

    // opts: { layer: 1 = elevado (viaduto: cruza as outras vias SEM cruzamento), ramp: comprimento da rampa, elev: altura }
    addV(x, z0, z1, cls = 'city', opts = null) { if (z1 > z0) this.segs.push(Object.assign({ v: true, at: x, a: z0, b: z1, cls, layer: 0 }, opts)); },
    addH(z, x0, x1, cls = 'city', opts = null) { if (x1 > x0) this.segs.push(Object.assign({ v: false, at: z, a: x0, b: x1, cls, layer: 0 }, opts)); },

    // Grade de distrito: linhas em xs (verticais) e zs (horizontais). Só entram os trechos unitários onde `ok(x, z)` vale nas
    // duas pontas e no meio; trechos válidos consecutivos viram um segmento só. `only` limita quais linhas existem.
    lattice(xs, zs, clsArg, ok, tag = '') {
        const clsOf = (v, at) => (typeof clsArg === 'function' ? clsArg(v, at) : clsArg);
        const run = (v, at, ls, cross) => {
            let s = null;
            for (let k = 0; k + 1 < ls.length; k++) {
                const a = ls[k], b = ls[k + 1], m = (a + b) / 2;
                const P = v ? [[at, a], [at, m], [at, b]] : [[a, at], [m, at], [b, at]];
                const good = P.every(([x, z]) => ok(x, z));
                if (good) { if (s === null) s = a; }
                else { if (s !== null) { v ? this.addV(at, s, a, clsOf(v, at)) : this.addH(at, s, a, clsOf(v, at)); s = null; } this.report.push(`${tag} ${v ? 'V' : 'H'} ${at}: ${a}..${b} fora do terreno`); }
            }
            if (s !== null) { const e = ls[ls.length - 1]; v ? this.addV(at, s, e, clsOf(v, at)) : this.addH(at, s, e, clsOf(v, at)); }
        };
        for (const x of xs) run(true, x, zs);
        for (const z of zs) run(false, z, xs);
    },

    // Validação para rodovias/estradas (segmento reto): corta em trechos de 24 u e descarta os que caem em água.
    road(v, at, a, b, cls, margin = 6) {
        const ok = (x, z) => WorldMap.buildable(x, z, margin);
        let s = null;
        for (let t = a; t < b; t += 24) {
            const e = Math.min(b, t + 24), P = v ? [[at, t], [at, (t + e) / 2], [at, e]] : [[t, at], [(t + e) / 2, at], [e, at]];
            if (P.every(([x, z]) => ok(x, z))) { if (s === null) s = t; }
            else { if (s !== null) { v ? this.addV(at, s, t, cls) : this.addH(at, s, t, cls); s = null; } this.report.push(`${cls} ${v ? 'V' : 'H'} ${at}: ${t}..${e} fora do terreno`); }
        }
        if (s !== null) v ? this.addV(at, s, b, cls) : this.addH(at, s, b, cls);
    },

    // ================================================================= grafo
    // Gera nós e trechos a partir de `segs`. Resultado em this.nodes / this.edges (+ índices de consulta).
    build() {
        const segs = this.segs;
        const V = segs.filter((s) => s.v), H = segs.filter((s) => !s.v);
        const markAt = [];                                                     // marcas como [x, z] (cortam o trecho que passa por elas)
        for (const k of this.marks.keys()) markAt.push(k.split(',').map(Number));
        const pieces = new Map();                                              // chave -> { v, at, a, b, cls }
        const cutPieces = (v, others) => {
            const own = v ? V : H;
            for (const s of own) {
                const cuts = new Set([s.a, s.b]);
                const L0 = s.layer || 0;
                // Vias de camadas diferentes (viaduto x rua) só se ligam onde uma TERMINA na outra; os cruzamentos "por cima" não geram nó.
                for (const o of others) if (o.a <= s.at + 1e-6 && s.at <= o.b + 1e-6 && o.at >= s.a - 1e-6 && o.at <= s.b + 1e-6 && ((o.layer || 0) === L0 || o.a === s.at || o.b === s.at || s.a === o.at || s.b === o.at)) cuts.add(o.at);
                for (const o of own) if (o !== s && o.at === s.at) { if (o.a > s.a && o.a < s.b) cuts.add(o.a); if (o.b > s.a && o.b < s.b) cuts.add(o.b); }
                for (const [mx, mz] of markAt) { const at = v ? mx : mz, c = v ? mz : mx; if (at === s.at && c > s.a && c < s.b && !L0) cuts.add(c); }
                const c = [...cuts].sort((p, q) => p - q);
                for (let k = 0; k + 1 < c.length; k++) {
                    if (c[k + 1] - c[k] < 1) continue;
                    const key = (v ? 'V' : 'H') + (L0 ? 'L' : '') + '|' + s.at + '|' + c[k] + '|' + c[k + 1];
                    const ex = pieces.get(key);
                    if (!ex || RoadPlan.CLASS[s.cls].w > RoadPlan.CLASS[ex.cls].w) pieces.set(key, { v, at: s.at, a: c[k], b: c[k + 1], cls: s.cls, layer: L0, ramp: s.ramp || 0, elev: s.elev || 0 });
                }
            }
        };
        cutPieces(true, H); cutPieces(false, V);

        // Nós e ligações.
        const nodes = new Map();
        const node = (x, z) => {
            const k = x + ',' + z;
            let n = nodes.get(k);
            if (!n) nodes.set(k, n = { x, z, nbr: [null, null, null, null], edge: [null, null, null, null] });
            return n;
        };
        const edges = [];
        for (const p of pieces.values()) {
            const A = p.v ? node(p.at, p.a) : node(p.a, p.at), B = p.v ? node(p.at, p.b) : node(p.b, p.at);
            const e = { a: A, b: B, v: p.v, cls: p.cls, w: this.CLASS[p.cls].w, len: p.b - p.a, layer: p.layer || 0, ramp: p.ramp, elev: p.elev };
            if (p.v) { A.nbr[0] = B; A.edge[0] = e; B.nbr[1] = A; B.edge[1] = e; }          // A é o de baixo: A.N = B
            else { A.nbr[2] = B; A.edge[2] = e; B.nbr[3] = A; B.edge[3] = e; }               // A é o do oeste: A.L = B
            edges.push(e);
        }

        const unlink = (n, d) => { const m = n.nbr[d], opp = d ^ 1; if (m) { m.nbr[opp] = null; m.edge[opp] = null; } n.nbr[d] = null; n.edge[d] = null; };
        // Ponta de grade onde chega uma via livre "âncora" (as ruas da favela: a estrada de terra termina nelas) não é beco: fica.
        const anchored = new Set();
        for (const path of this.paths) {
            if (!path.anchor) continue;
            const P = path.pts, pl = [0];
            for (let i = 1; i < P.length; i++) pl.push(pl[i - 1] + hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
            for (const n of nodes.values()) if (this._projPts(P, pl, n.x, n.z).d <= 2.5) anchored.add(n);
        }
        const deg = (n) => (n.nbr[0] ? 1 : 0) + (n.nbr[1] ? 1 : 0) + (n.nbr[2] ? 1 : 0) + (n.nbr[3] ? 1 : 0) + (anchored.has(n) ? 1 : 0);

        // Poda pontas-sem-saída (a IA nunca pode parar num beco) e depois funde nós retos de 2 pernas.
        let changed = true;
        while (changed) {
            changed = false;
            for (const [k, n] of nodes) {
                const d = deg(n);
                if (d === 0) { nodes.delete(k); continue; }
                if (d === 1) { for (let q = 0; q < 4; q++) if (n.nbr[q]) unlink(n, q); nodes.delete(k); changed = true; }
            }
        }
        for (const [k, n] of [...nodes]) {
            const NS = n.nbr[0] && n.nbr[1] && !n.nbr[2] && !n.nbr[3], EW = n.nbr[2] && n.nbr[3] && !n.nbr[0] && !n.nbr[1];
            if (!NS && !EW) continue;
            if (this.marks.has(k)) continue;                                    // retorno (ou outra marca): o nó fica
            const [d1, d2] = NS ? [0, 1] : [2, 3];
            if (n.edge[d1].cls !== n.edge[d2].cls) continue;                    // muda de classe aqui: mantém o nó (marca a transição)
            const cls = n.edge[d1].cls, old1 = n.edge[d1], old2 = n.edge[d2];
            // a = nó de "baixo/oeste" (vizinho pela perna S/O), b = de "cima/leste" (pela perna N/L)
            const lo = n.nbr[d2], hi = n.nbr[d1];
            const e = { a: lo, b: hi, v: NS, cls, w: this.CLASS[cls].w, len: old1.len + old2.len };
            lo.nbr[d1] = hi; lo.edge[d1] = e; hi.nbr[d2] = lo; hi.edge[d2] = e;
            nodes.delete(k);
            edges.splice(edges.indexOf(old1), 1); edges.splice(edges.indexOf(old2), 1); edges.push(e);
        }

        this._insertPaths(nodes, edges, node);

        this.nodes = [...nodes.values()];
        for (const n of this.nodes) {
            const m = this.marks.get(n.x + ',' + n.z);
            if (m && m.round) n.round = Object.assign({}, m.round);
            if (m && m.uturn && n.nbr[0] && n.nbr[1] && !n.nbr[2] && !n.nbr[3] && n.edge[0].cls === 'ave' && n.edge[1].cls === 'ave') n.uturn = Object.assign({}, m.uturn);
        }
        this.edges = edges.filter((e) => e.free || e.a.nbr[e.v ? 0 : 2] === e.b);
        this.nodes.forEach((n, i) => { n.id = i; });
        this.edges.forEach((e, i) => { e.id = i; });
        this._index();
        return this;
    },

    // ---------------------------------------------------------------- vias livres
    // Insere cada via livre no grafo: corta onde ela passa por um nó (a até 2,5 u) ou cruza um trecho (nó novo no meio dele) e cria os
    // trechos livres entre esses pontos. Ponta solta vira beco e é podada (a IA não pode parar num beco).
    _insertPaths(nodes, edges, node) {
        const SNAP = 2.5, r2 = (v) => Math.round(v * 100) / 100;
        const segX = (p, q, a, b) => {                                         // interseção própria de pq com ab: [t em pq, u em ab]
            const rx = q[0] - p[0], rz = q[1] - p[1], sx = b[0] - a[0], sz = b[1] - a[1], den = rx * sz - rz * sx;
            if (Math.abs(den) < 1e-9) return null;
            const t = ((a[0] - p[0]) * sz - (a[1] - p[1]) * sx) / den, u = ((a[0] - p[0]) * rz - (a[1] - p[1]) * rx) / den;
            return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null;
        };
        const bb = (Q, m = 0) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const p of Q) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1]; } return [x0 - m, z0 - m, x1 + m, z1 + m]; };
        const over = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
        for (const path of this.paths) {
            const P = path.pts, pl = [0];
            for (let i = 1; i < P.length; i++) pl.push(pl[i - 1] + hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
            const L = pl[pl.length - 1], cuts = [], PB = bb(P, SNAP + 1), SB = [];
            for (let i = 0; i + 1 < P.length; i++) SB.push(bb([P[i], P[i + 1]], 0.01));
            for (const n of nodes.values()) { if (n.x < PB[0] || n.x > PB[2] || n.z < PB[1] || n.z > PB[3]) continue; const q = this._projPts(P, pl, n.x, n.z); if (q.d <= SNAP) cuts.push({ t: q.s, n, rank: 3 }); }
            const near = [];                                                   // trechos na caixa da via (o resto nem é olhado)
            for (const e of edges) {
                if (e.layer) continue;                                         // viaduto: a via passa por baixo, sem cruzamento
                const E = e.pts || [[e.a.x, e.a.z], [e.b.x, e.b.z]];
                if (!over(bb(E, 1.5), PB)) continue;
                near.push(e);
                for (let j = 0; j + 1 < E.length; j++) {
                    const EB = bb([E[j], E[j + 1]], 0.01);
                    if (!over(EB, PB)) continue;
                    for (let i = 0; i + 1 < P.length; i++) {
                    if (!over(SB[i], EB)) continue;
                    const h = segX(P[i], P[i + 1], E[j], E[j + 1]);
                    if (!h) continue;
                    const x = P[i][0] + (P[i + 1][0] - P[i][0]) * h[0], z = P[i][1] + (P[i + 1][1] - P[i][1]) * h[0];
                    if (hypot(x - e.a.x, z - e.a.z) <= SNAP || hypot(x - e.b.x, z - e.b.z) <= SNAP) continue;      // (é um nó: já entrou)
                    cuts.push({ t: pl[i] + h[0] * (pl[i + 1] - pl[i]), x, z, rank: 2 });
                    }
                }
            }
            // Ponta em cima de um trecho já existente (entroncamento em T): corta o trecho ali.
            for (const [t, p] of [[0, P[0]], [L, P[P.length - 1]]]) {
                if (cuts.some((c) => Math.abs(c.t - t) < 1.5)) continue;
                for (const e of near) {
                    const E = e.pts || [[e.a.x, e.a.z], [e.b.x, e.b.z]], q = this._projPts(E, e.cum || [0, e.len], p[0], p[1]);
                    if (q.d < 1.2 && hypot(q.x - e.a.x, q.z - e.a.z) > SNAP && hypot(q.x - e.b.x, q.z - e.b.z) > SNAP) { cuts.push({ t, x: q.x, z: q.z, rank: 2 }); break; }
                }
            }
            cuts.push({ t: 0, x: P[0][0], z: P[0][1], rank: 1 }, { t: L, x: P[P.length - 1][0], z: P[P.length - 1][1], rank: 1 });
            cuts.sort((a, b) => a.t - b.t);
            const M = [];
            for (const c of cuts) { const l = M[M.length - 1]; if (l && c.t - l.t < 1.5) { if (c.rank > l.rank) M[M.length - 1] = c; } else M.push(c); }
            for (const c of M) {
                if (c.n) continue;
                if (c.rank === 2) c.n = this._splitAt(nodes, edges, node, c.x, c.z);
                if (!c.n) c.n = node(r2(c.x), r2(c.z));
            }
            for (let k = 0; k + 1 < M.length; k++) {
                const A = M[k].n, B = M[k + 1].n;
                if (A === B) continue;
                const pts = [[A.x, A.z]];
                for (let i = 1; i + 1 < P.length; i++) if (pl[i] > M[k].t + 0.05 && pl[i] < M[k + 1].t - 0.05) pts.push([P[i][0], P[i][1]]);
                pts.push([B.x, B.z]);
                edges.push(this._freeEdge(A, B, pts, path.cls, path));
            }
        }
        const deg = (n) => (n.nbr[0] ? 1 : 0) + (n.nbr[1] ? 1 : 0) + (n.nbr[2] ? 1 : 0) + (n.nbr[3] ? 1 : 0) + (n.free ? n.free.length : 0);
        for (let ch = true; ch;) {
            ch = false;
            for (const [k, n] of nodes) {
                const d = deg(n);
                if (d === 0) { nodes.delete(k); continue; }
                if (d !== 1) continue;
                if (n.free && n.free.length === 1) {
                    const e = n.free[0], o = e.a === n ? e.b : e.a;
                    o.free.splice(o.free.indexOf(e), 1); edges.splice(edges.indexOf(e), 1); nodes.delete(k); ch = true;
                } else {                                                       // ponta de grade (âncora que a via livre não pegou)
                    for (let q = 0; q < 4; q++) if (n.nbr[q]) { const m = n.nbr[q]; m.nbr[q ^ 1] = null; m.edge[q ^ 1] = null; n.nbr[q] = null; n.edge[q] = null; }      // (o trecho sai no filtro do fim)
                    nodes.delete(k); ch = true;
                }
            }
        }
    },

    _freeEdge(A, B, pts, cls, opts = {}) {
        const cum = [0];
        for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
        const e = { a: A, b: B, free: true, pts, cum, cls, w: this.CLASS[cls].w, len: cum[cum.length - 1], layer: 0, name: opts.name || null };
        (A.free || (A.free = [])).push(e); (B.free || (B.free = [])).push(e);
        return e;
    },

    // Corta o trecho que passa por (x, z) ali (nó novo; a grade continua ligada pelas pernas N/S ou L/O dele). Devolve o nó, ou null.
    _splitAt(nodes, edges, node, x, z) {
        const r2 = (v) => Math.round(v * 100) / 100;
        let best = null, bd = 0.6;
        for (const e of edges) {
            if (e.layer) continue;
            const q = this._projPts(e.pts || [[e.a.x, e.a.z], [e.b.x, e.b.z]], e.cum || [0, e.len], x, z);
            if (q.d < bd) { bd = q.d; best = { e, s: q.s, q }; }
        }
        if (!best) return null;
        const e = best.e;
        if (!e.free) {
            const v = e.v, m = v ? node(e.a.x, r2(e.a.z + best.s)) : node(r2(e.a.x + best.s), e.a.z), fw = v ? 0 : 2, bw = fw + 1;
            const e1 = Object.assign({}, e, { b: m, len: v ? m.z - e.a.z : m.x - e.a.x }), e2 = Object.assign({}, e, { a: m, len: v ? e.b.z - m.z : e.b.x - m.x });
            e.a.nbr[fw] = m; e.a.edge[fw] = e1; m.nbr[bw] = e.a; m.edge[bw] = e1;
            m.nbr[fw] = e.b; m.edge[fw] = e2; e.b.nbr[bw] = m; e.b.edge[bw] = e2;
            edges.splice(edges.indexOf(e), 1, e1, e2);
            return m;
        }
        const m = node(r2(best.q.x), r2(best.q.z)), P = e.pts;
        const p1 = [], p2 = [[m.x, m.z]];
        for (let i = 0; i < P.length; i++) { if (e.cum[i] < best.s - 0.05) p1.push(P[i]); else if (e.cum[i] > best.s + 0.05) p2.push(P[i]); }
        p1.push([m.x, m.z]);
        for (const n of [e.a, e.b]) n.free.splice(n.free.indexOf(e), 1);
        edges.splice(edges.indexOf(e), 1, this._freeEdge(e.a, m, p1, e.cls, e), this._freeEdge(m, e.b, p2, e.cls, e));
        return m;
    },

    // Ponto da polilinha P (comprimentos acumulados C) mais perto de (x, z): { s, x, z, d, tx, tz }.
    _projPts(P, C, x, z) {
        let best = null, bd = Infinity;
        for (let i = 0; i + 1 < P.length; i++) {
            const ax = P[i][0], az = P[i][1], sx = P[i + 1][0] - ax, sz = P[i + 1][1] - az, L2 = sx * sx + sz * sz || 1;
            const t = Math.max(0, Math.min(1, ((x - ax) * sx + (z - az) * sz) / L2)), px = ax + sx * t, pz = az + sz * t, d = hypot(x - px, z - pz);
            if (d < bd) { const L = Math.sqrt(L2); bd = d; best = { s: C[i] + t * (C[i + 1] - C[i]), x: px, z: pz, d, tx: sx / L, tz: sz / L }; }
        }
        return best;
    },

    // Ponto do trecho a `s` u do nó a (com a tangente a → b) | ponto do trecho mais perto de (x, z).
    at(e, s, out = {}) {
        const P = e.pts, C = e.cum;
        s = Math.max(0, Math.min(e.len, s));
        let i = 0;
        while (i < P.length - 2 && C[i + 1] < s) i++;
        const L = (C[i + 1] - C[i]) || 1, t = (s - C[i]) / L;
        out.x = P[i][0] + (P[i + 1][0] - P[i][0]) * t; out.z = P[i][1] + (P[i + 1][1] - P[i][1]) * t;
        out.tx = (P[i + 1][0] - P[i][0]) / L; out.tz = (P[i + 1][1] - P[i][1]) / L;
        return out;
    },
    project(e, x, z) { return this._projPts(e.pts, e.cum, x, z); },
    // O ponto s do trecho e está dentro de um túnel (com folga nas bocas)?
    inTunnel(e, s, m = 14) { for (const t of this.tunnels || []) if (t.edge === e && s > t.a - m && s < t.b + m) return true; return false; },

    // Pernas do nó (grade e livres), em ordem anti-horária, e as fases do semáforo: pares de pernas opostas andam juntas (grade:
    // N-S = fase 0, L-O = 1; com diagonais, 3 fases).
    _arms(n) {
        const A = [];
        for (let q = 0; q < 4; q++) if (n.nbr[q]) A.push({ e: n.edge[q], to: n.nbr[q], dx: this.DIRS[q].dx, dz: this.DIRS[q].dz, q, hw: n.edge[q].w / 2 });
        for (const e of n.free || []) {
            const P = e.pts, at = e.a === n, p0 = at ? P[0] : P[P.length - 1], p1 = at ? P[1] : P[P.length - 2], l = hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
            A.push({ e, to: at ? e.b : e.a, dx: (p1[0] - p0[0]) / l, dz: (p1[1] - p0[1]) / l, q: -1, hw: e.w / 2 });
        }
        for (const a of A) a.ang = Math.atan2(a.dz, a.dx);
        A.sort((p, q) => p.ang - q.ang);
        A.forEach((a, i) => { a.idx = i; });
        n.arms = A; n.gen = !!(n.free && n.free.length);
        if (!n.gen) { for (const a of A) a.phase = a.q < 2 ? 0 : 1; n.phases = 2; return; }
        let p = 0;
        for (const a of A) {
            if (a.phase !== undefined) continue;
            a.phase = p;
            let best = null, bd = 0.6;
            for (const b of A) if (b.phase === undefined) { const d = Math.abs(Math.abs(b.ang - a.ang) - Math.PI); if (d < bd) { bd = d; best = b; } }
            if (best) best.phase = p;
            p++;
        }
        n.phases = Math.max(2, p);
    },

    // Cortes de um nó com perna livre: cada par de pernas vizinhas (ângulo < 180°) se encontra onde os meios-fios se cruzam; o trecho
    // reto de cada perna começa no maior desses pontos. `poly` = o cruzamento (anti-horário): por perna, canto direito e esquerdo na
    // linha de corte, e o canto entre ela e a próxima (onde encosta a esquina do quarteirão).
    _genCuts(n) {
        const A = n.arms, N = A.length;
        for (const a of A) a.cut = 0.5;
        const corners = [];
        for (let i = 0; i < N && N > 1; i++) {
            const a = A[i], b = A[(i + 1) % N];
            let gap = b.ang - a.ang; if (gap <= 0) gap += Math.PI * 2;
            if (gap >= Math.PI - 0.02) continue;
            const lx = -a.dz, lz = a.dx, rx = b.dz, rz = -b.dx, cx = b.hw * rx - a.hw * lx, cz = b.hw * rz - a.hw * lz;
            const det = -a.dx * b.dz + b.dx * a.dz;
            if (Math.abs(det) < 1e-6) continue;
            const t = (-cx * b.dz + b.dx * cz) / det, u = (a.dx * cz - a.dz * cx) / det;
            a.cut = Math.max(a.cut, t); b.cut = Math.max(b.cut, u);
            corners[i] = [n.x + a.hw * lx + t * a.dx, n.z + a.hw * lz + t * a.dz];
        }
        const poly = [];
        for (let i = 0; i < N; i++) {
            const a = A[i];
            poly.push([n.x + a.dx * a.cut + a.dz * a.hw, n.z + a.dz * a.cut - a.dx * a.hw]);
            poly.push([n.x + a.dx * a.cut - a.dz * a.hw, n.z + a.dz * a.cut + a.dx * a.hw]);
            if (corners[i]) poly.push(corners[i]);
        }
        n.poly = poly;
        n.hwNS = n.hwEW = Math.max(...A.map((a) => a.cut));
    },

    // Larguras do cruzamento: a rua N-S (hwNS) e a L-O (hwEW), pela maior via que chega em cada eixo; faixa = w/4.
    _widths(n) {
        const wNS = Math.max(n.edge[0] ? n.edge[0].w : 0, n.edge[1] ? n.edge[1].w : 0);
        const wEW = Math.max(n.edge[2] ? n.edge[2].w : 0, n.edge[3] ? n.edge[3].w : 0);
        n.wNS = wNS || wEW; n.wEW = wEW || wNS;
        n.hwNS = n.wNS / 2; n.hwEW = n.wEW / 2;
        n.laneNS = n.wNS / 4; n.laneEW = n.wEW / 4;
        // CURVA de 2 pernas (N/S + L/O) em estrada de campo: a "caixa" do nó vira um raio de curva largo e a faixa faz um arco
        // redondo (o RoadNet planeja a manobra com Bézier entre a entrada e a saída da caixa).
        const legs = (n.nbr[0] ? 1 : 0) + (n.nbr[1] ? 1 : 0) + (n.nbr[2] ? 1 : 0) + (n.nbr[3] ? 1 : 0);
        n.turnR = 0;
        if (legs === 2 && !n.gen && (n.nbr[0] || n.nbr[1]) && (n.nbr[2] || n.nbr[3])) {
            let cls = null, minLen = Infinity;
            for (let q = 0; q < 4; q++) if (n.edge[q]) { cls = cls || n.edge[q].cls; minLen = Math.min(minLen, n.edge[q].len); }
            const R0 = { hwy: 40, dirt: 22 }[cls] || 0, R = Math.min(R0, minLen / 2.3);
            if (R > Math.max(n.hwNS, n.hwEW) + 2) { n.turnR = R; n.hwNS = n.hwEW = R; }
        }
        // ROTATÓRIA: o disco (raio R) fica no nó — ou, sem perna a oeste (leste), deslocado para o lado da perna, encostado no meio-fio
        // da avenida do outro lado (não invade o quarteirão). A "caixa" do nó vai até a borda do disco: os trechos retos começam ali.
        if (n.round) {
            const R = n.round.R, side = n.nbr[3] ? (n.nbr[2] ? 0 : -1) : 1;
            n.round.ox = side * Math.max(0, R - n.wNS / 2);
            n.round.cx = n.x + n.round.ox; n.round.cz = n.z;
            n.hwNS = R + Math.abs(n.round.ox); n.hwEW = R;
        }
        // RETORNO: o asfalto segue contínuo (sem caixa de cruzamento); só o canteiro abre o vão.
        if (n.uturn) n.hwEW = 0;
        // Corte de cada perna (onde o trecho reto começa): rotatória = onde a faixa toda sai do disco; nó com perna livre = encontro dos
        // meios-fios; grade = a meia-largura da via que cruza.
        if (n.round) {
            const R = n.round;
            for (const a of n.arms) {
                const n0 = (n.x - R.cx) * a.dx + (n.z - R.cz) * a.dz, m0 = -(n.x - R.cx) * a.dz + (n.z - R.cz) * a.dx, lm = Math.max(0, Math.abs(m0) - a.hw);
                a.cut = -n0 + Math.sqrt(Math.max(0, R.R * R.R - lm * lm));
            }
        } else if (n.gen) this._genCuts(n);
        else for (const a of n.arms) a.cut = a.q < 2 ? n.hwEW : n.hwNS;
    },

    // ============================================================= índices
    _index() {
        this.vlines = new Map(); this.hlines = new Map();
        this.nlegs = 0;
        for (const e of this.edges) if (!e.pts) { e.pts = [[e.a.x, e.a.z], [e.b.x, e.b.z]]; e.cum = [0, e.len]; }
        for (const n of this.nodes) {
            this._arms(n);
            this._widths(n);
            n.legs = n.arms.length;
            n.kinds = new Set();
            for (const a of n.arms) n.kinds.add(this.CLASS[a.e.cls].kind);
            if (n.nbr[0] || n.nbr[1]) { if (!this.vlines.has(n.x)) this.vlines.set(n.x, []); this.vlines.get(n.x).push(n); }
            if (n.nbr[2] || n.nbr[3]) { if (!this.hlines.has(n.z)) this.hlines.set(n.z, []); this.hlines.get(n.z).push(n); }
        }
        for (const n of this.nodes) for (const a of n.arms) { if (a.e.a === n) a.e.cutA = a.cut; if (a.e.b === n) a.e.cutB = a.cut; }
        for (const l of this.vlines.values()) l.sort((p, q) => p.z - q.z);
        for (const l of this.hlines.values()) l.sort((p, q) => p.x - q.x);
        this.vkeys = [...this.vlines.keys()].sort((p, q) => p - q);
        this.hkeys = [...this.hlines.keys()].sort((p, q) => p - q);

        // Hash espacial (64 u) dos trechos e dos nós.
        const S = this.CELL = 64;
        this._eg = new Map(); this._ng = new Map();
        const key = (i, j) => (i + 4096) * 8192 + (j + 4096);
        this._key = key;
        for (const e of this.edges) {
            const seen = new Set();                                             // trecho livre: as células de cada segmento (com a largura)
            for (let p = 0; p + 1 < e.pts.length; p++) {
                const m = e.free ? e.w / 2 + 1 : 0, A = e.pts[p], B = e.pts[p + 1];
                const x0 = Math.min(A[0], B[0]) - m, x1 = Math.max(A[0], B[0]) + m, z0 = Math.min(A[1], B[1]) - m, z1 = Math.max(A[1], B[1]) + m;
                for (let i = Math.floor(x0 / S); i <= Math.floor(x1 / S); i++) for (let j = Math.floor(z0 / S); j <= Math.floor(z1 / S); j++) {
                    const k = key(i, j); if (seen.has(k)) continue; seen.add(k);
                    let c = this._eg.get(k); if (!c) this._eg.set(k, c = []); c.push(e);
                }
            }
        }
        for (const n of this.nodes) { const k = key(Math.floor(n.x / S), Math.floor(n.z / S)); let c = this._ng.get(k); if (!c) this._ng.set(k, c = []); c.push(n); }
        // Comprimento total (sorteio de pontos de rua ponderado).
        this.totalLen = this.edges.reduce((s, e) => s + e.len, 0);
        this.viaducts = this.edges.filter((e) => e.layer);
    },

    _near(arr, c) {                         // chave do array ordenado mais próxima de c
        let lo = 0, hi = arr.length - 1;
        if (hi < 0) return null;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= c) lo = m; else hi = m; }
        return Math.abs(arr[lo] - c) <= Math.abs(arr[hi] - c) ? arr[lo] : arr[hi];
    },

    // Nós da linha vertical ('v', x = coord) ou horizontal ('h', z = coord) mais próxima de `coord` (até `tol` u), ou null.
    lineNear(axis, coord, tol = 4) {
        const keys = axis === 'v' ? this.vkeys : this.hkeys, k = this._near(keys, coord);
        if (k === null || Math.abs(k - coord) > tol) return null;
        return (axis === 'v' ? this.vlines : this.hlines).get(k);
    },

    // Cruzamento a até `r` u (distância de xadrez) de (x, z), ou null.
    nodeNear(x, z, r = 13) {
        if (!inWorld(x, z)) return null;
        r = Math.min(r, 500);
        const S = this.CELL, k0 = Math.floor((x - r) / S), k1 = Math.floor((x + r) / S), j0 = Math.floor((z - r) / S), j1 = Math.floor((z + r) / S);
        let best = null, bd = r;
        for (let i = k0; i <= k1; i++) for (let j = j0; j <= j1; j++) {
            const c = this._ng.get(this._key(i, j)); if (!c) continue;
            for (const n of c) { const d = Math.max(Math.abs(n.x - x), Math.abs(n.z - z)); if (d < bd) { bd = d; best = n; } }
        }
        return best;
    },

    // O trecho [a, b] da linha (v: x=at, ao longo de z | h: z=at, ao longo de x) está inteiramente coberto por via? Devolve a
    // largura máxima (u) ou 0.
    roadSpan(axis, at, a, b) {
        const nodes = this.lineNear(axis, at, 0.5);
        if (!nodes) return 0;
        const v = axis === 'v', c = (n) => (v ? n.z : n.x), dir = v ? 0 : 2;
        let w = 0;
        for (let k = 0; k + 1 < nodes.length; k++) {
            const n = nodes[k], m = nodes[k + 1];
            if (c(m) <= a + 1e-6 || c(n) >= b - 1e-6) continue;
            if (n.nbr[dir] !== m) return 0;                                    // buraco: não há via entre estes dois nós
            w = Math.max(w, n.edge[dir].w);
        }
        if (c(nodes[0]) > a + 1e-6 || c(nodes[nodes.length - 1]) < b - 1e-6) return 0;      // a linha não cobre até as pontas
        return w;
    },

    // Ponto de eixo de rua mais próximo de (x, z): { x, z, edge } ou null.
    nearestRoadPoint(x, z, maxR = 400) {
        if (!inWorld(x, z)) return null;
        const S = this.CELL;
        for (let r = 0; r * S <= maxR; r++) {
            let best = null, bd = Infinity;
            const i0 = Math.floor(x / S) - r, i1 = Math.floor(x / S) + r, j0 = Math.floor(z / S) - r, j1 = Math.floor(z / S) + r;
            for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
                if (r > 0 && i > i0 && i < i1 && j > j0 && j < j1) continue;
                const c = this._eg.get(this._key(i, j)); if (!c) continue;
                for (const e of c) {
                    if (e.free) { const q = this._projPts(e.pts, e.cum, x, z); if (q.d < bd) { bd = q.d; best = { x: q.x, z: q.z, edge: e, d: q.d, s: q.s, tx: q.tx, tz: q.tz }; } continue; }
                    const px = e.v ? e.a.x : Math.max(e.a.x, Math.min(x, e.b.x)), pz = e.v ? Math.max(e.a.z, Math.min(z, e.b.z)) : e.a.z;
                    const d = hypot(px - x, pz - z);
                    if (d < bd) { bd = d; best = { x: px, z: pz, edge: e, d, s: e.v ? pz - e.a.z : px - e.a.x, tx: e.v ? 0 : 1, tz: e.v ? 1 : 0 }; }
                }
            }
            if (best) return best;
        }
        return null;
    },

    // Altura do tabuleiro de um viaduto em (x, z) (0 fora dele): sobe pela rampa, fica no alto, desce pela outra rampa.
    // (hx, hz) = direção do veículo: só sobe no viaduto quem anda ALONGO dele (quem cruza por baixo, em outra rua, fica no chão).
    elevAt(x, z, hx = null, hz = null) {
        const V = this.viaducts;
        if (!V || !V.length) return 0;
        for (const e of V) {
            const hw = e.w / 2 + 1.5, x0 = Math.min(e.a.x, e.b.x), x1 = Math.max(e.a.x, e.b.x), z0 = Math.min(e.a.z, e.b.z), z1 = Math.max(e.a.z, e.b.z);
            if (x < x0 - hw || x > x1 + hw || z < z0 - hw || z > z1 + hw) continue;
            if (e.v ? Math.abs(x - e.a.x) > hw : Math.abs(z - e.a.z) > hw) continue;
            if (hx !== null && (e.v ? Math.abs(hz) < Math.abs(hx) : Math.abs(hx) < Math.abs(hz))) continue;
            const s = e.v ? z - e.a.z : x - e.a.x, r = e.ramp || 50, H = e.elev || 6;
            return Math.max(0, Math.min(H, s / r * H, (e.len - s) / r * H));
        }
        return 0;
    },

    // Sobre o tabuleiro de uma ponte (pista + calçadas)? Para a física/nado tratarem como terra firme.
    onBridge(x, z) {
        const B = this._bridges || (this._bridges = this.edges.filter((e) => e.cls === 'bridge').map((e) => {
            const hw = e.w / 2 + 3, x0 = Math.min(e.a.x, e.b.x), x1 = Math.max(e.a.x, e.b.x), z0 = Math.min(e.a.z, e.b.z), z1 = Math.max(e.a.z, e.b.z);
            return e.v ? [x0 - hw, z0, x1 + hw, z1] : [x0, z0 - hw, x1, z1 + hw];
        }));
        for (const r of B) if (x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) return true;
        return false;
    },

    // (x, z) está sobre uma via — pista de rua/avenida/rodovia/estrada de terra/viela, cruzamento e curva, ponte (com as
    // calçadas dela) ou viaduto (e o chão sob ele) — ou a menos de `m` u dela? Regra do mundo: NENHUMA vegetação nisso.
    onPavement(x, z, m = 0) {
        if (!inWorld(x, z)) return false;
        const S = this.CELL, key = this._key;
        const i0 = Math.floor((x - m) / S), i1 = Math.floor((x + m) / S), j0 = Math.floor((z - m) / S), j1 = Math.floor((z + m) / S);
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
            const c = this._eg.get(key(i, j)); if (!c) continue;
            for (const e of c) {
                const hw = e.w / 2 + m + (e.cls === 'bridge' ? 3.4 : (e.layer ? 1.4 : 0));
                if (e.free) { if (this._projPts(e.pts, e.cum, x, z).d <= hw) return true; continue; }
                if (e.v) { if (Math.abs(x - e.a.x) <= hw && z >= e.a.z - m && z <= e.b.z + m) return true; }
                else if (Math.abs(z - e.a.z) <= hw && x >= e.a.x - m && x <= e.b.x + m) return true;
            }
        }
        const R = 46 + m, n0 = Math.floor((x - R) / S), n1 = Math.floor((x + R) / S), q0 = Math.floor((z - R) / S), q1 = Math.floor((z + R) / S);
        for (let i = n0; i <= n1; i++) for (let j = q0; j <= q1; j++) {
            const c = this._ng.get(key(i, j)); if (!c) continue;
            for (const n of c) {
                if (n.round) { if (hypot(x - n.round.cx, z - n.round.cz) <= n.round.R + m) return true; continue; }      // (os braços são dos trechos)
                if (n.poly) { if (Math.abs(x - n.x) <= n.hwNS + n.hwEW + m && Math.abs(z - n.z) <= n.hwNS + n.hwEW + m && (this.inPoly(n.poly, x, z) || (m > 0 && this.polyDist(n.poly, x, z) <= m))) return true; continue; }
                if (Math.abs(x - n.x) <= n.hwNS + m && Math.abs(z - n.z) <= n.hwEW + m) return true;
            }
        }
        return false;
    },

    // Pontos de via a até `r` u de (x, z): o ponto mais próximo de cada trecho em volta — [{ x, z, d, edge }].
    nearbyRoadPoints(x, z, r = 90) {
        if (!inWorld(x, z)) return [];
        const S = this.CELL, out = [], seen = new Set();
        for (let i = Math.floor((x - r) / S); i <= Math.floor((x + r) / S); i++) for (let j = Math.floor((z - r) / S); j <= Math.floor((z + r) / S); j++) {
            const c = this._eg.get(this._key(i, j)); if (!c) continue;
            for (const e of c) {
                if (seen.has(e)) continue; seen.add(e);
                if (e.free) { const q = this._projPts(e.pts, e.cum, x, z); if (q.d <= r) out.push({ x: q.x, z: q.z, d: q.d, edge: e, s: q.s, tx: q.tx, tz: q.tz }); continue; }
                const px = e.v ? e.a.x : Math.max(e.a.x, Math.min(x, e.b.x)), pz = e.v ? Math.max(e.a.z, Math.min(z, e.b.z)) : e.a.z, d = hypot(px - x, pz - z);
                if (d <= r) out.push({ x: px, z: pz, d, edge: e, s: e.v ? pz - e.a.z : px - e.a.x, tx: e.v ? 0 : 1, tz: e.v ? 1 : 0 });
            }
        }
        return out;
    },

    // Polígono [[x, z], ...]: (x, z) dentro? | distância até a borda.
    inPoly(P, x, z) {
        let inside = false;
        for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
            const xi = P[i][0], zi = P[i][1], xj = P[j][0], zj = P[j][1];
            if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
        }
        return inside;
    },
    polyDist(P, x, z) {
        let bd = Infinity;
        for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
            const ax = P[j][0], az = P[j][1], sx = P[i][0] - ax, sz = P[i][1] - az, L2 = sx * sx + sz * sz || 1;
            const t = Math.max(0, Math.min(1, ((x - ax) * sx + (z - az) * sz) / L2));
            bd = Math.min(bd, hypot(x - ax - sx * t, z - az - sz * t));
        }
        return bd;
    },

    // Trecho aleatório (ponderado pelo comprimento), com filtro opcional `pred(edge)`.
    randomEdge(pred = null) {
        const list = pred ? this.edges.filter(pred) : this.edges;
        if (!list.length) return null;
        let r = Math.random() * list.reduce((s, e) => s + e.len, 0);
        for (const e of list) { r -= e.len; if (r <= 0) return e; }
        return list[list.length - 1];
    },
};
