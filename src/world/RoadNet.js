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
// ROTATÓRIA (inter.round): entra pela direita, gira no anel no sentido anti-horário e sai na perna escolhida (também dá a volta).
// RETORNO (inter.uturn): segue reto ou faz o "U" pelo vão do canteiro, em volta do eixo da avenida.
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
    turnDir(d, turn) { return turn === 'straight' ? d : turn === 'right' ? this.right(d) : turn === 'left' ? this.left(d) : { dx: -d.dx || 0, dz: -d.dz || 0 }; },

    // Distância do eixo ao centro da faixa da via que corre na direção d, neste cruzamento.
    lane(inter, d) { return d.dz !== 0 ? inter.laneNS : inter.laneEW; },
    // Meia-largura da via que CRUZA a de direção d (a "caixa" do cruzamento ao longo de d).
    cross(inter, d) { return inter.uturn ? 2 : (d.dz !== 0 ? inter.hwEW : inter.hwNS); },

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
        if (inter.round) return this._planRound(inter, d, turn);
        if (turn === 'uturn') return this._planUturn(inter, d);
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

    // RETORNO: semicírculo de raio = faixa em volta do eixo da avenida (o vão do canteiro), da faixa de ida à de volta, pela esquerda.
    _planUturn(inter, d) {
        const off = this.lane(inter, d), c = this.cross(inter, d), r = this.right(d), dOut = this.turnDir(d, 'uturn');
        const pts = [this.lanePoint(inter, d, -c, off)];
        for (let k = 0; k <= 10; k++) {
            const a = Math.PI * k / 10, cs = Math.cos(a), sn = Math.sin(a);
            pts.push({ x: inter.x + off * (r.dx * cs + d.dx * sn), z: inter.z + off * (r.dz * cs + d.dz * sn) });
        }
        const X = this.lanePoint(inter, dOut, c, off);
        pts.push(X);
        return { pts, dOut, exit: X };
    },

    // ROTATÓRIA (mão direita: anti-horário visto de cima). Entrada E na faixa, na borda do disco; Bézier até o anel (raio entre a ilha
    // e a borda), arco anti-horário e Bézier até a saída X na faixa da perna de dOut. Os pontos onde se entra/sai do anel são os
    // primeiros em que a curva é só "para a direita" e suave (≤ 50°): com o disco deslocado (cabeceira sem perna oeste), a faixa
    // que passa rente a ele quase não desvia. th1 = ângulo da entrada no anel (quem vem antes dele, no anel, tem a preferência).
    _planRound(inter, d, turn) {
        const Rd = inter.round, C = { x: Rd.cx, z: Rd.cz }, rr = (Rd.R + Rd.r) / 2 + 0.4, Re = Rd.R + 1, TAU = Math.PI * 2;
        const dOut = this.turnDir(d, turn), offD = this.lane(inter, d), offO = this.lane(inter, dOut);
        const rD = this.right(d), rO = this.right(dOut);
        // ponto da faixa (base + dir*s) a distância Re do centro: s da 1ª (sign = -1) ou 2ª (+1) interseção
        const onCircle = (bx, bz, dir, sign) => {
            const px = bx - C.x, pz = bz - C.z, b = px * dir.dx + pz * dir.dz, q = px * px + pz * pz - Re * Re, disc = b * b - q;
            const s = disc > 0 ? -b + sign * Math.sqrt(disc) : sign * Re;
            return { x: bx + dir.dx * s, z: bz + dir.dz * s };
        };
        const E = onCircle(inter.x + rD.dx * offD, inter.z + rD.dz * offD, d, -1);
        const X = onCircle(inter.x + rO.dx * offO, inter.z + rO.dz * offO, dOut, 1);
        const P = (t) => ({ x: C.x + rr * Math.cos(t), z: C.z + rr * Math.sin(t) }), T = (t) => ({ dx: -Math.sin(t), dz: Math.cos(t) });
        const ang = (u, v) => Math.atan2(u.dx * v.dz - u.dz * v.dx, u.dx * v.dx + u.dz * v.dz);          // giro de u para v (+ = esquerda)
        const MAXA = 50 * Math.PI / 180;
        const psi = Math.atan2(E.z - C.z, E.x - C.x), phi = Math.atan2(X.z - C.z, X.x - C.x);
        let a1 = 0.5, a2 = 0.5;
        for (let a = 0.12; a < 2.2; a += 0.035) {                                                       // entrada: à direita da faixa, adiante, giro ≤ 50°
            const p = P(psi + a), lat = (p.x - E.x) * rD.dx + (p.z - E.z) * rD.dz, fwd = (p.x - E.x) * d.dx + (p.z - E.z) * d.dz, g = -ang(d, T(psi + a));
            if (lat >= -0.05 && fwd > 1.5 && g >= -0.05 && g <= MAXA) { a1 = a; break; }
        }
        for (let a = 0.12; a < 2.2; a += 0.035) {                                                       // saída: o mesmo, de trás para a frente
            const p = P(phi - a), lat = (p.x - X.x) * rO.dx + (p.z - X.z) * rO.dz, fwd = (X.x - p.x) * dOut.dx + (X.z - p.z) * dOut.dz, g = -ang(T(phi - a), dOut);
            if (lat >= -0.05 && fwd > 1.5 && g >= -0.05 && g <= MAXA) { a2 = a; break; }
        }
        let nominal = phi - psi; nominal -= Math.floor(nominal / TAU) * TAU; if (nominal < 1e-3) nominal = TAU;
        let th1 = psi + a1, sweep = nominal - a1 - a2;
        if (sweep < 0) { th1 += sweep / 2; sweep = 0; }                                                // direita curta: sai logo onde entrou
        const th2 = th1 + sweep;
        // Bézier quadrática com o controle onde a reta da faixa encontra a tangente do anel
        const ctrl = (A, dA, B, dB) => {
            const det = dA.dx * dB.dz - dA.dz * dB.dx, wx = B.x - A.x, wz = B.z - A.z;
            if (Math.abs(det) < 1e-3) return { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 };
            const t = Math.max(0, Math.min(hypot(wx, wz), (wx * dB.dz - wz * dB.dx) / det));
            return { x: A.x + dA.dx * t, z: A.z + dA.dz * t };
        };
        const pts = [E], push = (p) => { const l = pts[pts.length - 1]; if (hypot(p.x - l.x, p.z - l.z) > 0.05) pts.push(p); };
        const bez = (A, Q, B) => { for (let n = 1; n <= 6; n++) { const t = n / 6, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t; push({ x: a * A.x + b * Q.x + c * B.x, z: a * A.z + b * Q.z + c * B.z }); } };
        const P1 = P(th1), P2 = P(th2);
        bez(E, ctrl(E, d, P1, T(th1)), P1);
        const n = Math.ceil(sweep / 0.17);
        for (let k = 1; k <= n; k++) push(P(th1 + sweep * k / n));
        const t2 = T(th2);
        bez(P2, ctrl(P2, t2, X, dOut), X);
        return { pts, dOut, exit: pts[pts.length - 1], th1, round: true };
    },

    // Manobras possíveis (com pesos) a partir de um cruzamento: só as que têm perna de saída e deixam outro
    // cruzamento à frente (para a rota nunca terminar num beco sem saída). Rotatória: também dá a volta; retorno: reto ou "U".
    options(inter, d) {
        const opts = [];
        const turns = inter.uturn ? RoadNet.T_UTURN : (inter.round ? RoadNet.T_ROUND : RoadNet.T_CROSS);
        for (const [turn, w] of turns) {
            const dOut = this.turnDir(d, turn);
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
            if (!e) continue;
            const ma = e.a.round ? Math.max(margin, e.a.hwNS + 10) : margin, mb = e.b.round ? Math.max(margin, e.b.hwNS + 10) : margin;      // longe do disco da rotatória
            if (e.len < ma + mb + 2) continue;
            const sign = Math.random() < 0.5 ? 1 : -1, lane = e.w / 4;
            const d = e.v ? { dx: 0, dz: sign } : { dx: sign, dz: 0 };
            const t = ma + Math.random() * (e.len - ma - mb);
            const x = e.v ? e.a.x + d.dz * lane : e.a.x + t, z = e.v ? e.a.z + t : e.a.z - d.dx * lane;
            if (near) { const r = hypot(x - near.x, z - near.z); if (r < near.rMin || r > near.rMax) continue; }
            if (!this.interAhead(x, z, d)) continue;       // sem cruzamento à frente
            return { point: { x, z }, d };
        }
        return null;
    },
};

// Manobras e pesos: cruzamento comum, rotatória e retorno.
RoadNet.T_CROSS = [['straight', 0.6], ['right', 0.2], ['left', 0.2]];
RoadNet.T_ROUND = [['straight', 0.5], ['right', 0.22], ['left', 0.22], ['uturn', 0.06]];
RoadNet.T_UTURN = [['straight', 0.88], ['uturn', 0.12]];

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

        const entryIdx = this.pts.length, P = pick.plan.pts;
        let k0 = 0;                                                     // (quem já passou da entrada — ela fica até 13 u antes do centro numa rotatória — não volta)
        while (k0 < P.length - 1 && (P[k0].x - x) * d.dx + (P[k0].z - z) * d.dz < 0.3) k0++;
        for (let k = k0; k < P.length; k++) this._push(P[k]);
        this.junctions.push({
            inter, axis: d.dz !== 0 ? 'ns' : 'ew', turn: pick.turn,
            entryIdx, exitIdx: this.pts.length - 1, d, dOut: pick.plan.dOut, th1: pick.plan.th1,
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
