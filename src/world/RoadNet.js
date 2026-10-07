// ============================================================================
// RoadNet — a malha viária como GRAFO de ruas retas (RoadPlan), mão direita.
//
// Uma faixa é definida por (posição, direção d = {dx, dz}); o centro dela fica a `lane` do eixo da rua (w/4 da via),
// à DIREITA de quem anda (direita de d = {dz, -dx}):
//   norte (+z) -> x = eixo + off | sul -> x = eixo - off
//   leste (+x) -> z = eixo - off | oeste -> z = eixo + off
// Cada via tem a sua largura (cidade 10, rodovia 12, estrada de terra 8, viela 6...): lane e meia-largura vêm do cruzamento
// (inter.laneNS/laneEW e hwNS/hwEW).
//
// Route: lista de pontos (polilinha) que o carro segue. É planejada cruzamento a
// cruzamento: [entrada do cruzamento] -> curva de Bézier (ou reta) -> [saída],
// escolhendo reto/direita/esquerda entre as manobras que ainda têm rua à frente.
// ============================================================================

const RoadNet = {
    DIRS: [{ dx: 0, dz: 1 }, { dx: 0, dz: -1 }, { dx: 1, dz: 0 }, { dx: -1, dz: 0 }],

    // Trechos FECHADOS (bloqueio de rua): "perna" = (cruzamento, direção de saída dele). Nenhuma rota nova
    // escolhe sair por uma perna fechada (carros que já estavam nela só vão até a barreira).
    closed: new Set(),
    dirIndex(d) { return this.DIRS.findIndex((x) => x.dx === d.dx && x.dz === d.dz); },
    legKey(inter, d) { return inter.id + ':' + this.dirIndex(d); },
    setClosed(inter, d, on) { if (on) this.closed.add(this.legKey(inter, d)); else this.closed.delete(this.legKey(inter, d)); },
    isClosed(inter, d) { return this.closed.size > 0 && this.closed.has(this.legKey(inter, d)); },

    right(d) { return { dx: d.dz, dz: -d.dx }; },
    left(d) { return { dx: -d.dz, dz: d.dx }; },

    // Distância do eixo ao centro da faixa da via que corre na direção d, neste cruzamento.
    lane(inter, d) { return d.dz !== 0 ? inter.laneNS : inter.laneEW; },
    // Meia-largura da via que CRUZA a de direção d (a "caixa" do cruzamento ao longo de d).
    cross(inter, d) { return d.dz !== 0 ? inter.hwEW : inter.hwNS; },

    // Ponto da faixa de heading d num cruzamento, a `s` do centro ao longo de d.
    lanePoint(inter, d, s, off = this.lane(inter, d)) {
        return { x: inter.x + d.dz * off + d.dx * s, z: inter.z - d.dx * off + d.dz * s };
    },

    // Linha (nós ordenados) cuja faixa de heading d passa por (x, z): { nodes, lane, center } ou null. `tol` = erro lateral máx.
    _line(x, z, d, tol = 3.2) {
        const P = RoadPlan, v = d.dz !== 0, keys = v ? P.vkeys : P.hkeys, map = v ? P.vlines : P.hlines;
        const c = v ? x : z;                                           // coordenada lateral do carro
        // faixa de chaves candidatas [c - 5.5, c + 5.5]
        let lo = 0, hi = keys.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (keys[m] < c - 5.5) lo = m + 1; else hi = m; }
        let best = null, be = tol;
        for (let k = lo; k < keys.length && keys[k] <= c + 5.5; k++) {
            const nodes = map.get(keys[k]);
            const along = v ? z : x;
            // nó mais próximo ao longo da linha, só para ler a largura da via ali
            let n = nodes[0];
            for (const q of nodes) { if (Math.abs((v ? q.z : q.x) - along) < Math.abs((v ? n.z : n.x) - along)) n = q; }
            const lane = v ? n.laneNS : n.laneEW;
            const center = v ? keys[k] + d.dz * lane : keys[k] - d.dx * lane;
            const err = Math.abs(c - center);
            if (err < be) { be = err; best = { nodes, lane, center, key: keys[k] }; }
        }
        return best;
    },

    // Cruzamento à frente na faixa que passa por (x, z) com heading d (ou null se a rua acaba).
    // "À frente" = a entrada do cruzamento (centro - meia caixa*d) ainda está pelo menos ~4u adiante.
    interAhead(x, z, d) {
        const v = d.dz !== 0, L = this._line(x, z, d);
        if (!L) return null;
        const N = L.nodes, c = (n) => (v ? n.z : n.x), s = v ? d.dz : d.dx, here = v ? z : x, dirI = this.dirIndex(d);
        // primeiro nó adiante com ahead > 4 (os nós estão em ordem crescente de coordenada)
        let idx = -1;
        if (s > 0) { for (let k = 0; k < N.length; k++) if (c(N[k]) - here > 4) { idx = k; break; } }
        else { for (let k = N.length - 1; k >= 0; k--) if (here - c(N[k]) > 4) { idx = k; break; } }
        if (idx < 0) return null;
        const behind = N[idx - s];                                      // o nó que acabou de ficar para trás (ou o da ponta da via)
        if (!behind || behind.nbr[dirI] !== N[idx]) return null;        // não há via contínua entre eles
        return N[idx];
    },

    // Plano de uma manobra num cruzamento: pontos [entrada ... saída] e o novo heading.
    plan(inter, d, turn) {
        const offD = this.lane(inter, d);
        const E = this.lanePoint(inter, d, -this.cross(inter, d), offD);
        let dOut = d;
        if (turn === 'right') dOut = this.right(d);
        else if (turn === 'left') dOut = this.left(d);
        const offO = this.lane(inter, dOut);
        const X = this.lanePoint(inter, dOut, this.cross(inter, dOut), offO);

        const pts = [E];
        if (turn !== 'straight') {
            // Ponto de controle = onde as retas da faixa de entrada e de saída se cruzam.
            const r = this.right(d), ro = this.right(dOut);
            const P1 = { x: inter.x + r.dx * offD + ro.dx * offO, z: inter.z + r.dz * offD + ro.dz * offO };
            const N = 8;
            for (let n = 1; n < N; n++) {
                const t = n / N, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
                pts.push({ x: a * E.x + b * P1.x + c * X.x, z: a * E.z + b * P1.z + c * X.z });
            }
        }
        pts.push(X);
        return { pts, dOut, exit: X };
    },

    // Manobras possíveis (com pesos) a partir de um cruzamento: só as que têm perna de saída e deixam outro
    // cruzamento à frente (para a rota nunca terminar num beco sem saída).
    options(inter, d) {
        const opts = [];
        for (const [turn, w] of [['straight', 0.6], ['right', 0.2], ['left', 0.2]]) {
            const dOut = turn === 'straight' ? d : (turn === 'right' ? this.right(d) : this.left(d));
            if (!inter.nbr[this.dirIndex(dOut)]) continue;                // sem rua nessa saída
            const p = this.plan(inter, d, turn);
            if (this.isClosed(inter, p.dOut)) continue;                  // rua fechada por bloqueio
            if (this.interAhead(p.exit.x, p.exit.z, p.dOut)) opts.push({ turn, w, plan: p });
        }
        return opts;
    },

    // Encaixa (x, z) numa faixa válida com heading ~ (hx, hz): devolve { point, d } ou null.
    snapToLane(x, z, hx, hz) {
        const d = Math.abs(hx) > Math.abs(hz) ? { dx: Math.sign(hx) || 1, dz: 0 } : { dx: 0, dz: Math.sign(hz) || 1 };
        const L = this._line(x, z, d, 8);
        if (!L) return null;
        const w = L.lane * 4;
        if (Math.abs((d.dz !== 0 ? x : z) - L.center) > w * 0.9) return null;
        return { point: d.dz !== 0 ? { x: L.center, z } : { x, z: L.center }, d };
    },

    // Ponto do eixo de rua mais próximo de (x, z) (para voltar à rua depois de sair dela).
    nearestRoadPoint(x, z) {
        return RoadPlan.nearestRoadPoint(x, z);
    },

    // Ponto aleatório sobre uma faixa, longe de cruzamentos. Devolve { point, d }.
    // near = { x, z, rMin, rMax }: só trechos cujo ponto fique entre rMin e rMax do foco (o mundo é grande; ninguém nasce longe).
    randomLanePoint(margin = 14, near = null) {
        const P = RoadPlan;
        for (let tries = 0; tries < 40; tries++) {
            let e;
            if (near) {
                const S = P.CELL, i0 = Math.floor((near.x - near.rMax) / S), i1 = Math.floor((near.x + near.rMax) / S), j0 = Math.floor((near.z - near.rMax) / S), j1 = Math.floor((near.z + near.rMax) / S);
                const i = i0 + Math.floor(Math.random() * (i1 - i0 + 1)), j = j0 + Math.floor(Math.random() * (j1 - j0 + 1));
                const c = P._eg.get(P._key(i, j));
                if (!c || !c.length) continue;
                e = c[Math.floor(Math.random() * c.length)];
            } else e = P.randomEdge();
            if (!e || e.len < margin * 2 + 2) continue;
            const sign = Math.random() < 0.5 ? 1 : -1, lane = e.w / 4;
            const d = e.v ? { dx: 0, dz: sign } : { dx: sign, dz: 0 };
            const t = margin + Math.random() * (e.len - 2 * margin);
            const x = e.v ? e.a.x + d.dz * lane : e.a.x + t, z = e.v ? e.a.z + t : e.a.z - d.dx * lane;
            if (near) { const r = hypot(x - near.x, z - near.z); if (r < near.rMin || r > near.rMax) continue; }
            if (!this.interAhead(x, z, d)) continue;       // sem cruzamento à frente
            return { point: { x, z }, d };
        }
        return null;
    },
};

// ----------------------------------------------------------------------------
// Route — polilinha planejada que o carro segue (pure pursuit) + registro dos
// cruzamentos por onde passa (para semáforo, preferência e "caixa livre").
// ----------------------------------------------------------------------------
class Route {
    constructor(x, z, d) {
        this.pts = [{ x, z }];
        this.cum = [0];                 // distância acumulada até cada ponto
        this.junctions = [];            // { inter, axis, turn, entryIdx, exitIdx }
        this.end = { x, z, d };
        this.seg = 0;                   // segmento em que o carro está (pts[seg] -> pts[seg+1])
        this.goal = null;               // { x, z }: se definido, cada cruzamento escolhe a manobra que mais se aproxima dele
    }

    get length() { return this.cum[this.cum.length - 1]; }

    _push(p) {
        const last = this.pts[this.pts.length - 1];
        this.pts.push({ x: p.x, z: p.z });
        this.cum.push(this.cum[this.cum.length - 1] + hypot(p.x - last.x, p.z - last.z));
    }

    // Planeja o próximo cruzamento e anexa a manobra. Retorna false se não há mais rua.
    extend() {
        const { x, z, d } = this.end;
        const inter = RoadNet.interAhead(x, z, d);
        if (!inter) return false;
        const opts = RoadNet.options(inter, d);
        if (!opts.length) return false;
        let pick = opts[0];
        if (this.goal) {
            // Perseguição: guloso — a manobra cuja saída fica mais perto do alvo (reta ganha um pequeno bônus
            // para não ziguezaguear). Numa grade isso contorna quarteirões até chegar ao jogador.
            let best = Infinity;
            for (const o of opts) {
                const s = hypot(o.plan.exit.x - this.goal.x, o.plan.exit.z - this.goal.z) - (o.turn === 'straight' ? 6 : 0);
                if (s < best) { best = s; pick = o; }
            }
        } else {
            let r = Math.random() * opts.reduce((s, o) => s + o.w, 0);
            for (const o of opts) { r -= o.w; if (r <= 0) { pick = o; break; } }
        }

        const entryIdx = this.pts.length;
        for (const p of pick.plan.pts) this._push(p);
        this.junctions.push({
            inter, axis: d.dz !== 0 ? 'ns' : 'ew', turn: pick.turn,
            entryIdx, exitIdx: this.pts.length - 1, d, dOut: pick.plan.dOut,
        });
        this.end = { x: pick.plan.exit.x, z: pick.plan.exit.z, d: pick.plan.dOut };
        return true;
    }

    // Mantém só o cruzamento imediato e esquece o resto do plano (o alvo mudou de lugar):
    // o próximo `ensure` replaneja dali em diante já com o `goal` novo.
    replanAhead() {
        const jn = this.junctions.find((j) => j.exitIdx > this.seg);
        if (!jn) return;
        const keep = jn.exitIdx + 1;
        if (keep >= this.pts.length) return;
        this.pts.length = keep;
        this.cum.length = keep;
        this.junctions = this.junctions.filter((j) => j.exitIdx <= jn.exitIdx);
        const X = this.pts[jn.exitIdx];
        this.end = { x: X.x, z: X.z, d: jn.dOut };
    }

    // Garante pelo menos `n` cruzamentos planejados à frente do carro.
    ensure(n = 2) {
        let ahead = this.junctions.filter((j) => j.exitIdx > this.seg).length;
        while (ahead < n) { if (!this.extend()) break; ahead++; }
    }

    // Descarta o que já ficou para trás (mantém a rota curta).
    trim() {
        const drop = this.seg - 2;
        if (drop < 6) return;
        this.pts.splice(0, drop);
        const base = this.cum[drop];
        this.cum.splice(0, drop);
        for (let i = 0; i < this.cum.length; i++) this.cum[i] -= base;
        this.seg -= drop;
        for (const j of this.junctions) { j.entryIdx -= drop; j.exitIdx -= drop; }
        this.junctions = this.junctions.filter((j) => j.exitIdx > 0);
    }

    // Avança `seg` e devolve o progresso (distância percorrida na rota) do ponto (x, z).
    progress(x, z) {
        const P = this.pts;
        while (this.seg < P.length - 2) {
            const a = P[this.seg + 1], b = P[this.seg];
            const sx = a.x - b.x, sz = a.z - b.z;
            if ((x - a.x) * sx + (z - a.z) * sz > 0) this.seg++; else break;
        }
        const a = P[this.seg], b = P[this.seg + 1];
        if (!b) return this.cum[this.cum.length - 1];
        const sx = b.x - a.x, sz = b.z - a.z, len = hypot(sx, sz) || 1;
        const t = Math.max(0, Math.min(len, ((x - a.x) * sx + (z - a.z) * sz) / len));
        return this.cum[this.seg] + t;
    }

    // Ponto da rota na distância acumulada `s` (limitado ao fim).
    pointAt(s, out) {
        const P = this.pts, C = this.cum;
        s = Math.min(s, C[C.length - 1]);
        let k = this.seg;
        while (k < P.length - 2 && C[k + 1] < s) k++;
        const len = C[k + 1] - C[k] || 1;
        const t = Math.max(0, Math.min(1, (s - C[k]) / len));
        out.x = P[k].x + (P[k + 1].x - P[k].x) * t;
        out.z = P[k].z + (P[k + 1].z - P[k].z) * t;
        return out;
    }
}
