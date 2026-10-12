// ============================================================================
// RoadNet — a malha viária como GRAFO (RoadPlan): faixas, manobras e rotas. Mão direita.
//
// Uma faixa é (trecho, sentido): o centro dela fica a w/4 do eixo da via, à DIREITA de quem anda. Na grade (N/S/L/O):
//   norte (+z) -> x = eixo + off | sul -> x = eixo - off
//   leste (+x) -> z = eixo - off | oeste -> z = eixo + off
// Nas vias livres (diagonais, curvas) vale o mesmo em relação à tangente da polilinha do trecho.
//
// Route: lista de pontos (polilinha) que o carro segue. É planejada cruzamento a cruzamento: [entrada do cruzamento] -> curva de
// Bézier (ou reta) -> [saída]; num trecho curvo, entram também os pontos da faixa até o próximo cruzamento. A manobra sai das
// PERNAS do nó (RoadPlan: arms, em qualquer ângulo): reta / direita / esquerda pelo ângulo entre a chegada e a saída.
// ROTATÓRIA (inter.round): entra pela direita, gira no anel no sentido anti-horário e sai na perna escolhida (também dá a volta).
// RETORNO (inter.uturn): segue reto ou faz o "U" pelo vão do canteiro, em volta do eixo da avenida.
// ============================================================================

const RoadNet = {
    DIRS: [{ dx: 0, dz: 1 }, { dx: 0, dz: -1 }, { dx: 1, dz: 0 }, { dx: -1, dz: 0 }],

    // Pernas FECHADAS (bloqueio de rua): (cruzamento, perna de saída). Nenhuma rota nova sai por uma perna fechada (carros que já
    // estavam nela só vão até a barreira). `d` = a direção da saída (vale a perna mais alinhada com ela) ou a própria perna.
    closed: new Set(),
    dirIndex(d) { return this.DIRS.findIndex((x) => x.dx === d.dx && x.dz === d.dz); },
    armOf(inter, d) { let best = null, bd = -2; for (const a of inter.arms) { const c = a.dx * d.dx + a.dz * d.dz; if (c > bd) { bd = c; best = a; } } return best; },
    legKey(inter, d) { const a = d.e ? d : this.armOf(inter, d); return inter.id + ':' + (a ? a.idx : -1); },
    setClosed(inter, d, on) { const k = this.legKey(inter, d); if (on) this.closed.add(k); else this.closed.delete(k); },
    isClosed(inter, d) { return this.closed.size > 0 && this.closed.has(this.legKey(inter, d)); },

    right(d) { return { dx: d.dz, dz: -d.dx }; },
    left(d) { return { dx: -d.dz, dz: d.dx }; },
    turnDir(d, turn) { return turn === 'straight' ? d : turn === 'right' ? this.right(d) : turn === 'left' ? this.left(d) : { dx: -d.dx || 0, dz: -d.dz || 0 }; },

    // Distância do eixo ao centro da faixa, no trecho e.
    lane(e) { return e.w / 4; },

    // Ponto do trecho da perna `a` a `t` u do nó, com a direção PARA FORA do nó: { x, z, dx, dz }.
    armPoint(inter, a, t, out = {}) {
        const e = a.e, fromA = e.a === inter;
        RoadPlan.at(e, fromA ? t : e.len - t, out);
        out.dx = fromA ? out.tx : -out.tx; out.dz = fromA ? out.tz : -out.tz;
        return out;
    },
    // Centro da faixa de quem SAI do nó pela perna (d = para fora) | de quem CHEGA por ela (d = para dentro), a `t` u do nó.
    outLane(inter, a, t) { const p = this.armPoint(inter, a, t), o = this.lane(a.e); return { x: p.x + p.dz * o, z: p.z - p.dx * o, dx: p.dx, dz: p.dz }; },
    inLane(inter, a, t) { const p = this.armPoint(inter, a, t), o = this.lane(a.e); return { x: p.x - p.dz * o, z: p.z + p.dx * o, dx: -p.dx, dz: -p.dz }; },

    // Manobra de chegar pela perna `inA` e sair pela `outA`: 'straight' | 'right' | 'left' | 'uturn' (pelo ângulo entre as direções).
    classify(inA, outA) {
        if (inA === outA) return 'uturn';
        const hx = -inA.dx, hz = -inA.dz, d = Math.atan2(hx * outA.dz - hz * outA.dx, hx * outA.dx + hz * outA.dz);
        return Math.abs(d) < 0.6 ? 'straight' : (d > 0 ? 'left' : 'right');
    },

    // Onde as retas (A + s·dA) e (B − u·dB) se encontram, à frente de A e atrás de B; senão o meio do caminho.
    _meet(A, B) {
        const det = A.dx * B.dz - A.dz * B.dx, wx = B.x - A.x, wz = B.z - A.z;
        if (Math.abs(det) > 1e-3) {
            const s = (wx * B.dz - wz * B.dx) / det, u = (A.dx * wz - A.dz * wx) / det, L = hypot(wx, wz);
            if (s > 0 && u > 0 && s < L * 2 && u < L * 2) return { x: A.x + A.dx * s, z: A.z + A.dz * s };
        }
        return { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 };
    },

    // Plano de uma manobra: pontos [entrada ... saída], as direções na entrada (dIn) e na saída (dOut) e a perna de saída.
    plan(inter, inA, outA, turn) {
        if (inter.round) return this._planRound(inter, inA, outA);
        if (turn === 'uturn') return this._planUturn(inter, inA);
        const cut = (a) => (inter.uturn ? 2 : Math.max(a.cut, 0.5));                // (retorno: o asfalto é contínuo — entra 2 u antes, sai 2 u depois)
        const E = this.inLane(inter, inA, cut(inA)), X = this.outLane(inter, outA, cut(outA)), pts = [{ x: E.x, z: E.z }];
        const lateral = (X.x - E.x) * -E.dz + (X.z - E.z) * E.dx;
        if (turn !== 'straight' || Math.abs(lateral) > 0.3 || Math.abs(E.dx * X.dz - E.dz * X.dx) > 0.05) {
            const C = this._meet(E, X), N = 8;                                    // controle: onde a faixa de entrada encontra a de saída
            if (turn === 'left') {                                               // esquerda: curva mais aberta (passa além do centro), para duas
                const cx = C.x - inter.x, cz = C.z - inter.z, l = hypot(cx, cz);  // conversões opostas no mesmo verde se cruzarem com folga
                if (l > 0.1) { const k = 0.45 * Math.min(this.lane(inA.e), this.lane(outA.e)); C.x += cx / l * k; C.z += cz / l * k; }
            }
            for (let n = 1; n < N; n++) {
                const t = n / N, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
                pts.push({ x: a * E.x + b * C.x + c * X.x, z: a * E.z + b * C.z + c * X.z });
            }
        }
        pts.push({ x: X.x, z: X.z });
        return { pts, dIn: { dx: E.dx, dz: E.dz }, dOut: { dx: X.dx, dz: X.dz }, exit: X, arm: outA };
    },

    // RETORNO: semicírculo de raio = faixa em volta do eixo da avenida (o vão do canteiro), da faixa de ida à de volta, pela esquerda.
    _planUturn(inter, inA) {
        const d = { dx: -inA.dx, dz: -inA.dz }, off = this.lane(inA.e), c = 2, r = this.right(d);
        const pts = [{ x: inter.x + r.dx * off - d.dx * c, z: inter.z + r.dz * off - d.dz * c }];
        for (let k = 0; k <= 10; k++) {
            const a = Math.PI * k / 10, cs = Math.cos(a), sn = Math.sin(a);
            pts.push({ x: inter.x + off * (r.dx * cs + d.dx * sn), z: inter.z + off * (r.dz * cs + d.dz * sn) });
        }
        const X = { x: inter.x - r.dx * off - d.dx * c, z: inter.z - r.dz * off - d.dz * c, dx: -d.dx, dz: -d.dz };
        pts.push({ x: X.x, z: X.z });
        return { pts, dIn: d, dOut: { dx: X.dx, dz: X.dz }, exit: X, arm: inA };
    },

    // ROTATÓRIA (mão direita: anti-horário visto de cima). Entrada E na faixa, na borda do disco; Bézier até o anel (raio entre a ilha
    // e a borda), arco anti-horário e Bézier até a saída X na faixa da perna de saída. Os pontos onde se entra/sai do anel são os
    // primeiros em que a curva é só "para a direita" e suave (≤ 50°): com o disco deslocado (cabeceira sem perna oeste), a faixa
    // que passa rente a ele quase não desvia. th1 = ângulo da entrada no anel (quem vem antes dele, no anel, tem a preferência).
    _planRound(inter, inA, outA) {
        const Rd = inter.round, C = { x: Rd.cx, z: Rd.cz }, rr = (Rd.R + Rd.r) / 2 + 0.4, Re = Rd.R + 1, TAU = Math.PI * 2;
        const d = { dx: -inA.dx, dz: -inA.dz }, dOut = { dx: outA.dx, dz: outA.dz }, offD = this.lane(inA.e), offO = this.lane(outA.e);
        const rD = this.right(d), rO = this.right(dOut);
        // ponto da faixa (base + dir·s) a distância Re do centro: s da 1ª (sign = -1) ou 2ª (+1) interseção
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
        bez(P2, ctrl(P2, T(th2), X, dOut), X);
        const ex = pts[pts.length - 1];
        return { pts, dIn: d, dOut, exit: { x: ex.x, z: ex.z, dx: dOut.dx, dz: dOut.dz }, th1, round: true, arm: outA };
    },

    // Manobras possíveis (com pesos) a partir de um cruzamento, chegando pela perna `inA`: cada perna de saída (não fechada) vira
    // reta/direita/esquerda pelo ângulo, e o peso da manobra é dividido entre as pernas dela. Rotatória: também dá a volta; retorno:
    // reto ou "U". (Não há beco: o RoadPlan poda as pontas soltas.)
    options(inter, inA) {
        const W = inter.uturn ? RoadNet.W_UTURN : (inter.round ? RoadNet.W_ROUND : RoadNet.W_CROSS), cand = [], count = {};
        for (const a of inter.arms) {
            const turn = this.classify(inA, a);
            if (!W[turn] || this.isClosed(inter, a)) continue;
            cand.push({ turn, a }); count[turn] = (count[turn] || 0) + 1;
        }
        return cand.map((c) => ({ turn: c.turn, w: W[c.turn] / count[c.turn], plan: this.plan(inter, inA, c.a, c.turn) }));
    },

    // A faixa que passa por (x, z) andando na direção (hx, hz): { e, fwd (anda de a para b), s, point (centro da faixa), d } ou null.
    // tol = erro lateral máximo até o centro da faixa. Perto de um cruzamento prefere o trecho seguinte (o que ainda tem 4 u à frente).
    locate(x, z, hx, hz, tol = 3.2) {
        const hl = hypot(hx, hz) || 1;
        hx /= hl; hz /= hl;
        let best = null, bs = Infinity;
        for (const q of RoadPlan.nearbyRoadPoints(x, z, 14)) {
            const e = q.edge, dot = q.tx * hx + q.tz * hz;
            if (Math.abs(dot) < 0.55) continue;
            const fwd = dot > 0, tx = fwd ? q.tx : -q.tx, tz = fwd ? q.tz : -q.tz, lane = e.w / 4;
            const lat = (x - q.x) * tz - (z - q.z) * tx, err = Math.abs(lat - lane);
            if (err > tol) continue;
            const ahead = fwd ? e.len - q.s : q.s;
            const sc = err + (1 - Math.abs(dot)) * 6 + (ahead < 4 ? 3 : 0);
            if (sc < bs) { bs = sc; best = { e, fwd, s: q.s, err, point: { x: q.x + tz * lane, z: q.z - tx * lane }, d: { dx: tx, dz: tz } }; }
        }
        return best;
    },

    // Cruzamento à frente na faixa que passa por (x, z) com heading d (ou null).
    interAhead(x, z, d) { const l = this.locate(x, z, d.dx, d.dz); return l ? (l.fwd ? l.e.b : l.e.a) : null; },

    // Encaixa (x, z) numa faixa válida com heading ~ (hx, hz): devolve { point, d, e, fwd } ou null.
    snapToLane(x, z, hx, hz) {
        const l = this.locate(x, z, hx, hz, 8);
        if (!l || l.err > l.e.w * 0.9) return null;
        return { point: l.point, d: l.d, e: l.e, fwd: l.fwd };
    },

    // Ponto do eixo de rua mais próximo de (x, z) (para voltar à rua depois de sair dela).
    nearestRoadPoint(x, z) {
        return RoadPlan.nearestRoadPoint(x, z);
    },

    // Ponto aleatório sobre uma faixa, longe de cruzamentos. Devolve { point, d, e, fwd }.
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
            const ma = Math.max(margin, (e.cutA || 0) + 8, e.a.round ? e.a.hwNS + 10 : 0), mb = Math.max(margin, (e.cutB || 0) + 8, e.b.round ? e.b.hwNS + 10 : 0);
            if (e.len < ma + mb + 2) continue;
            const fwd = Math.random() < 0.5, p = P.at(e, ma + Math.random() * (e.len - ma - mb)), lane = e.w / 4;
            const tx = fwd ? p.tx : -p.tx, tz = fwd ? p.tz : -p.tz, x = p.x + tz * lane, z = p.z - tx * lane;
            if (near) { const r = hypot(x - near.x, z - near.z); if (r < near.rMin || r > near.rMax) continue; }
            return { point: { x, z }, d: { dx: tx, dz: tz }, e, fwd };
        }
        return null;
    },
};

// Manobras e pesos: cruzamento comum, rotatória e retorno.
RoadNet.W_CROSS = { straight: 0.6, right: 0.2, left: 0.2 };
RoadNet.W_ROUND = { straight: 0.5, right: 0.22, left: 0.22, uturn: 0.06 };
RoadNet.W_UTURN = { straight: 0.88, uturn: 0.12 };

// ----------------------------------------------------------------------------
// Route — polilinha planejada que o carro segue (pure pursuit) + registro dos
// cruzamentos por onde passa (para semáforo, preferência e "caixa livre").
// ----------------------------------------------------------------------------
class Route {
    // lp (opcional) = a faixa de partida { e, fwd } (RoadNet.locate/randomLanePoint); sem ela, a rota acha a faixa sozinha.
    constructor(x, z, d, lp = null) {
        this.pts = [{ x, z }];
        this.cum = [0];                 // distância acumulada até cada ponto
        this.junctions = [];            // { inter, arm, phase, axis, turn, entryIdx, exitIdx, d, dOut, th1, eOut, fwdOut }
        this.end = { x, z, d, e: lp && lp.e ? lp.e : null, fwd: lp && lp.e ? lp.fwd : true };
        this.seg = 0;                   // segmento em que o carro está (pts[seg] -> pts[seg+1])
        this.goal = null;               // { x, z }: se definido, cada cruzamento escolhe a manobra que mais se aproxima dele
    }

    get length() { return this.cum[this.cum.length - 1]; }

    _push(p) {
        const last = this.pts[this.pts.length - 1];
        if (hypot(p.x - last.x, p.z - last.z) < 1e-3) return;                  // (segmento de tamanho zero travaria o progress)
        this.pts.push({ x: p.x, z: p.z });
        this.cum.push(this.cum[this.cum.length - 1] + hypot(p.x - last.x, p.z - last.z));
    }

    // Planeja o próximo cruzamento e anexa a manobra. Retorna false se não há mais rua.
    extend() {
        let { x, z, d, e, fwd } = this.end;
        if (!e) { const l = RoadNet.locate(x, z, d.dx, d.dz); if (!l) return false; e = l.e; fwd = l.fwd; }
        const inter = fwd ? e.b : e.a, inA = inter.arms && inter.arms.find((a) => a.e === e);
        if (!inA) return false;
        const opts = RoadNet.options(inter, inA);
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

        // Trecho curvo (via livre): os pontos da faixa entre o fim atual e a entrada do cruzamento.
        if (e.pts.length > 2) {
            const sEnd = RoadPlan.project(e, x, z).s, sE = fwd ? e.len - inA.cut : inA.cut, o = RoadNet.lane(e), n = e.pts.length;
            for (let i = 1; i + 1 < n; i++) {
                const k = fwd ? i : n - 1 - i, s = e.cum[k];
                if (!(fwd ? (s > sEnd + 0.3 && s < sE - 0.3) : (s < sEnd - 0.3 && s > sE + 0.3))) continue;
                const pp = e.pts[k - 1], pn = e.pts[k + 1], l = hypot(pn[0] - pp[0], pn[1] - pp[1]) || 1;
                const tx = (pn[0] - pp[0]) / l * (fwd ? 1 : -1), tz = (pn[1] - pp[1]) / l * (fwd ? 1 : -1);
                this._push({ x: e.pts[k][0] + tz * o, z: e.pts[k][1] - tx * o });
            }
        }

        // (quem já passou da entrada — ela fica até 13 u antes do centro numa rotatória — não volta)
        const n = this.pts.length, L = this.pts[n - 1], L0 = n > 1 ? this.pts[n - 2] : null;
        let hx = d.dx, hz = d.dz;
        if (L0) { const l = hypot(L.x - L0.x, L.z - L0.z); if (l > 0.05) { hx = (L.x - L0.x) / l; hz = (L.z - L0.z) / l; } }
        const entryIdx = this.pts.length, P = pick.plan.pts;
        let k0 = 0;
        while (k0 < P.length - 1 && (P[k0].x - L.x) * hx + (P[k0].z - L.z) * hz < 0.3) k0++;
        for (let k = k0; k < P.length; k++) this._push(P[k]);
        const out = pick.plan.arm, fwdOut = out.e.a === inter;
        this.junctions.push({
            inter, arm: inA, phase: inA.phase, axis: inA.phase === 0 ? 'ns' : 'ew', turn: pick.turn,
            entryIdx, exitIdx: this.pts.length - 1, d: pick.plan.dIn, dOut: pick.plan.dOut, th1: pick.plan.th1, eOut: out.e, fwdOut,
        });
        const X = this.pts[this.pts.length - 1];
        this.end = { x: X.x, z: X.z, d: pick.plan.dOut, e: out.e, fwd: fwdOut };
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
        this.end = { x: X.x, z: X.z, d: jn.dOut, e: jn.eOut, fwd: jn.fwdOut };
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
