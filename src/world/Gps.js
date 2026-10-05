// ============================================================================
// Gps — rota pelas RUAS entre dois pontos do mapa (como o GPS do GTA).
// O grafo é o RoadPlan (um nó por cruzamento/curva, um trecho por via reta). Origem e destino são "encaixados" no trecho
// de rua mais próximo e o caminho mais curto sai de um Dijkstra com fila de prioridade.
//   Gps.route(a, b) -> { pts: [{x,z}...], len }   (pts começa em `a` e termina em `b`; len em unidades ≈ metros)
// ============================================================================

const Gps = {
    route(a, b) {
        const P = RoadPlan, sa = P.nearestRoadPoint(a.x, a.z, 700), sb = P.nearestRoadPoint(b.x, b.z, 700);
        const straight = () => ({ pts: [{ x: a.x, z: a.z }, { x: b.x, z: b.z }], len: hypot(a.x - b.x, a.z - b.z) });
        if (!sa || !sb) return straight();
        // Distâncias em Float64 (a MESMA precisão da conta) e cada nó fechado uma vez só. Antes: Float32Array + sem "fechado". Gravar
        // a distância em 32 bits às vezes arredondava PARA CIMA; a mesma distância (64 bits) voltava a parecer menor, o nó entrava de
        // novo na fila e reexpandia os vizinhos. Numa cidade em grade (milhares de caminhos do mesmo tamanho) as cópias se multiplicavam
        // em cascata: a aba congelava ("a página não está respondendo") — no respawn longe do destino marcado no GPS, por exemplo.
        const N = P.nodes.length, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
        const MAX_POPS = N * 8 + 64;                               // (cinto de segurança: Dijkstra correto fecha cada nó uma vez)
        const heap = [];                                           // [dist, nó] — heap binário mínimo
        const push = (d, n) => { heap.push([d, n]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
        const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let k = 0; for (;;) { let c = 2 * k + 1; if (c >= heap.length) break; if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++; if (heap[k][0] <= heap[c][0]) break; [heap[k], heap[c]] = [heap[c], heap[k]]; k = c; } } return t; };
        const D = (n, p) => hypot(n.x - p.x, n.z - p.z);

        // Mesmo trecho: vai direto.
        if (sa.edge === sb.edge) {
            const pts = [{ x: a.x, z: a.z }, { x: sa.x, z: sa.z }, { x: sb.x, z: sb.z }, { x: b.x, z: b.z }];
            return { pts, len: pts.reduce((s, p, i) => s + (i ? hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) : 0), 0) };
        }
        for (const n of [sa.edge.a, sa.edge.b]) { dist[n.id] = D(n, sa); push(dist[n.id], n.id); }
        const goalA = sb.edge.a.id, goalB = sb.edge.b.id, dA = D(sb.edge.a, sb), dB = D(sb.edge.b, sb);
        let best = Infinity, bestNode = -1, pops = 0;
        while (heap.length && pops++ < MAX_POPS) {
            const [d, u] = pop();
            if (done[u] || d > dist[u]) continue;
            done[u] = 1;
            if (d >= best) break;
            if (u === goalA && d + dA < best) { best = d + dA; bestNode = u; }
            if (u === goalB && d + dB < best) { best = d + dB; bestNode = u; }
            const n = P.nodes[u];
            for (let q = 0; q < 4; q++) {
                const m = n.nbr[q];
                if (!m || done[m.id]) continue;
                const nd = d + D(n, m);
                if (nd < dist[m.id]) { dist[m.id] = nd; prev[m.id] = u; push(nd, m.id); }
            }
        }
        if (bestNode < 0) return straight();
        const pts = [];
        for (let u = bestNode; u >= 0; u = prev[u]) pts.push({ x: P.nodes[u].x, z: P.nodes[u].z });
        pts.reverse();
        pts.unshift({ x: sa.x, z: sa.z }); pts.unshift({ x: a.x, z: a.z });
        pts.push({ x: sb.x, z: sb.z }); pts.push({ x: b.x, z: b.z });
        let len = 0;
        for (let i = 1; i < pts.length; i++) len += hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
        return { pts, len };
    },
};
