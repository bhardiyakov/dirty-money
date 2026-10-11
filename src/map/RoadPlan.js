// ============================================================================
// RoadPlan — a malha viária do MUNDO inteiro como um GRAFO de ruas retas (eixos N/S/L/O), esparso.
//
// Entrada: segmentos retos (RoadPlan.addV / addH) com uma CLASSE de via (largura, superfície, tipo). Eles vêm de:
//   • grades de distrito (cidade, ilha, favela): linhas regulares, só os trechos que cabem em terra firme;
//   • pontes (cidade ↔ ilha) e rodovias/estradas de terra pelo continente.
// build() corta os segmentos em todos os cruzamentos, cria os NÓS (cruzamentos, curvas) e os TRECHOS entre eles, poda
// pontas-sem-saída e funde nós retos de 2 pernas. Cada nó tem 4 pernas (N, S, L, O) — as mesmas 4 direções do RoadNet.
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
        fav:    { w: 6,  kind: 'favela', surface: 'earth',   label: 'Viela' },
        hwy:    { w: 12, kind: 'rural',  surface: 'asphalt', label: 'Rodovia' },
        dirt:   { w: 8,  kind: 'rural',  surface: 'dirt',    label: 'Estrada de terra' },
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
        const deg = (n) => (n.nbr[0] ? 1 : 0) + (n.nbr[1] ? 1 : 0) + (n.nbr[2] ? 1 : 0) + (n.nbr[3] ? 1 : 0);

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

        this.nodes = [...nodes.values()];
        for (const n of this.nodes) {
            const m = this.marks.get(n.x + ',' + n.z);
            if (m && m.round) n.round = Object.assign({}, m.round);
            if (m && m.uturn && n.nbr[0] && n.nbr[1] && !n.nbr[2] && !n.nbr[3] && n.edge[0].cls === 'ave' && n.edge[1].cls === 'ave') n.uturn = Object.assign({}, m.uturn);
        }
        this.edges = edges.filter((e) => e.a.nbr[e.v ? 0 : 2] === e.b);
        this.nodes.forEach((n, i) => { n.id = i; });
        this.edges.forEach((e, i) => { e.id = i; });
        this._index();
        return this;
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
        if (legs === 2 && (n.nbr[0] || n.nbr[1]) && (n.nbr[2] || n.nbr[3])) {
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
    },

    // ============================================================= índices
    _index() {
        this.vlines = new Map(); this.hlines = new Map();
        this.nlegs = 0;
        for (const n of this.nodes) {
            this._widths(n);
            n.legs = (n.nbr[0] ? 1 : 0) + (n.nbr[1] ? 1 : 0) + (n.nbr[2] ? 1 : 0) + (n.nbr[3] ? 1 : 0);
            n.kinds = new Set();
            for (let q = 0; q < 4; q++) if (n.edge[q]) n.kinds.add(this.CLASS[n.edge[q].cls].kind);
            if (n.nbr[0] || n.nbr[1]) { if (!this.vlines.has(n.x)) this.vlines.set(n.x, []); this.vlines.get(n.x).push(n); }
            if (n.nbr[2] || n.nbr[3]) { if (!this.hlines.has(n.z)) this.hlines.set(n.z, []); this.hlines.get(n.z).push(n); }
        }
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
            const x0 = Math.min(e.a.x, e.b.x), x1 = Math.max(e.a.x, e.b.x), z0 = Math.min(e.a.z, e.b.z), z1 = Math.max(e.a.z, e.b.z);
            for (let i = Math.floor(x0 / S); i <= Math.floor(x1 / S); i++) for (let j = Math.floor(z0 / S); j <= Math.floor(z1 / S); j++) {
                const k = key(i, j); let c = this._eg.get(k); if (!c) this._eg.set(k, c = []); c.push(e);
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
                    const px = e.v ? e.a.x : Math.max(e.a.x, Math.min(x, e.b.x)), pz = e.v ? Math.max(e.a.z, Math.min(z, e.b.z)) : e.a.z;
                    const d = hypot(px - x, pz - z);
                    if (d < bd) { bd = d; best = { x: px, z: pz, edge: e, d }; }
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
                if (e.v) { if (Math.abs(x - e.a.x) <= hw && z >= e.a.z - m && z <= e.b.z + m) return true; }
                else if (Math.abs(z - e.a.z) <= hw && x >= e.a.x - m && x <= e.b.x + m) return true;
            }
        }
        const R = 46 + m, n0 = Math.floor((x - R) / S), n1 = Math.floor((x + R) / S), q0 = Math.floor((z - R) / S), q1 = Math.floor((z + R) / S);
        for (let i = n0; i <= n1; i++) for (let j = q0; j <= q1; j++) {
            const c = this._ng.get(key(i, j)); if (!c) continue;
            for (const n of c) {
                if (n.round) { if (hypot(x - n.round.cx, z - n.round.cz) <= n.round.R + m) return true; continue; }      // (os braços são dos trechos)
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
                const px = e.v ? e.a.x : Math.max(e.a.x, Math.min(x, e.b.x)), pz = e.v ? Math.max(e.a.z, Math.min(z, e.b.z)) : e.a.z, d = hypot(px - x, pz - z);
                if (d <= r) out.push({ x: px, z: pz, d, edge: e });
            }
        }
        return out;
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
