// ============================================================================
// RacePath — o traçado de uma corrida: uma polilinha (aberta, do A ao B; ou fechada, uma volta) com a distância acumulada, o raio
// das curvas em cada ponto e a meia-largura da pista (rua: a da via; autódromo: a do oval).
//   at(s)          ponto e direção a `s` m da largada (fechada: s dá a volta)
//   project(x, z)  { s, lat } do ponto mais próximo (lat + = à esquerda de quem corre); hint = segmento de onde procurar (rápido)
//   cornerAt(s)    raio da curva (m) por ali — o piloto freia por ele
//
// RaceCar — o carro de um RIVAL das corridas (StreetRacing): um carro do trânsito (TrafficCar: entra nos obstáculos que o trânsito
// enxerga, colide, capota, explode) com outro piloto. Segue o traçado por perseguição pura, escolhe a velocidade pelo MÍNIMO entre
// a máxima do carro (× a habilidade dele e o "elástico" da corrida), as curvas à frente (até onde ainda dá para frear) e quem está
// no caminho — o trânsito e os outros corredores: troca de lado na pista para ultrapassar (e mantém distância quando não dá).
// Nitro nas retas longas. Preso (batida, muro): dá ré e volta; muito tempo preso fora da tela, volta para a pista.
// Acabou a corrida: retire() — vira um carro comum do trânsito (some com o resto, longe do jogador).
// ============================================================================

class RacePath {
    // pts: [{ x, z }] | loop: volta fechada | halfW: meia-largura da pista (número) ou null = a da rua mais próxima de cada ponto.
    constructor(pts, { loop = false, halfW = null, cornerR = null } = {}) {
        this.pts = pts.map((p) => ({ x: p.x, z: p.z }));
        if (loop) this.pts.push({ x: pts[0].x, z: pts[0].z });
        this.loop = loop;
        const P = this.pts, n = P.length;
        this.cum = new Float64Array(n);
        for (let i = 1; i < n; i++) this.cum[i] = this.cum[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z);
        this.len = this.cum[n - 1];
        // raio em cada vértice: o ângulo da virada sobre a distância até os vizinhos (esquina de rua em 90°: ~7–12 m)
        this.rad = new Float32Array(n).fill(Infinity);
        this.hw = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const a = P[i - 1] || (loop ? P[n - 2] : null), b = P[i], c = P[i + 1] || (loop ? P[1] : null);
            if (a && c) {
                const ax = b.x - a.x, az = b.z - a.z, cx = c.x - b.x, cz = c.z - b.z, la = Math.hypot(ax, az) || 1, lc = Math.hypot(cx, cz) || 1;
                const ang = Math.abs(Math.atan2(ax * cz - az * cx, ax * cx + az * cz));
                if (ang > 0.035) this.rad[i] = cornerR ? cornerR(b, ang) : Math.max(6, Math.min(la, lc, 40) * 0.5 / Math.tan(ang / 2));
            }
            if (halfW != null) this.hw[i] = halfW;
            else { const r = RoadPlan.nearestRoadPoint(b.x, b.z, 20); this.hw[i] = r ? Math.max(2.6, r.edge.w / 2 - 1.1) : 3.5; }
        }
    }
    _wrap(s) { if (!this.loop) return Math.max(0, Math.min(this.len, s)); const L = this.len; return ((s % L) + L) % L; }
    _seg(s, hint = 0) {
        const C = this.cum, n = C.length;
        let k = Math.max(0, Math.min(n - 2, hint | 0));
        while (k < n - 2 && C[k + 1] < s) k++;
        while (k > 0 && C[k] > s) k--;
        return k;
    }
    at(s, out = {}, hint = 0) {
        s = this._wrap(s);
        const k = this._seg(s, hint), A = this.pts[k], B = this.pts[k + 1], l = (this.cum[k + 1] - this.cum[k]) || 1, t = (s - this.cum[k]) / l;
        out.x = A.x + (B.x - A.x) * t; out.z = A.z + (B.z - A.z) * t; out.tx = (B.x - A.x) / l; out.tz = (B.z - A.z) / l; out.k = k;
        return out;
    }
    // Ponto mais próximo: procura nos segmentos perto do `hint` (o carro anda pouco por quadro); sem hint, em todos.
    project(x, z, hint = -1, out = {}) {
        const P = this.pts, n = P.length;
        let i0 = 0, i1 = n - 2;
        if (hint >= 0) { i0 = Math.max(0, hint - 6); i1 = Math.min(n - 2, hint + 12); }
        let best = Infinity;
        const scan = (a, b) => {
            for (let k = a; k <= b; k++) {
                const A = P[k], B = P[k + 1], sx = B.x - A.x, sz = B.z - A.z, l2 = sx * sx + sz * sz || 1;
                const t = Math.max(0, Math.min(1, ((x - A.x) * sx + (z - A.z) * sz) / l2)), px = A.x + sx * t, pz = A.z + sz * t, d = (x - px) * (x - px) + (z - pz) * (z - pz);
                if (d < best) { best = d; const l = Math.sqrt(l2); out.s = this.cum[k] + t * l; out.seg = k; out.lat = ((x - px) * -sz + (z - pz) * sx) / l; }
            }
        };
        scan(i0, i1);
        if (this.loop && hint >= 0 && (i0 === 0 || i1 === n - 2)) scan(i0 === 0 ? Math.max(0, n - 10) : 0, i0 === 0 ? n - 2 : Math.min(n - 2, 10));      // (perto da largada de uma volta)
        out.d = Math.sqrt(best);
        return out;
    }
    // Menor raio de curva entre s e s + ahead (Infinity = reta).
    cornerAt(s, ahead = 6, hint = 0) {
        const n = this.pts.length;
        s = this._wrap(s);
        let j = this._seg(s, hint) + 1, dist = this.cum[j] - s, r = Infinity;
        for (let i = 0; i < n + 2 && dist <= ahead; i++) {
            r = Math.min(r, this.rad[j]);
            if (j >= n - 1) { if (!this.loop) break; j = 0; }
            dist += this.cum[j + 1] - this.cum[j]; j++;
        }
        return r;
    }
    halfW(s, hint = 0) { const k = this._seg(this._wrap(s), hint); return this.hw[k]; }
}

class RaceCar extends TrafficCar {
    constructor(scene, physics, pos, id, carSheet, paint, heading, traffic) {
        super(scene, physics, pos, id, carSheet, paint, heading, traffic);
        this.mode = 'race';
        this.keep = true;               // (o trânsito não recicla nem reposiciona)
        this.ignoreSignals = true;      // (sem LOD: a IA roda todo quadro, como a de uma viatura em perseguição)
        this.raceHold = true;           // parado no grid até a largada
        this.R = null;                  // { path, s, seg, lap, skill, lat, latT, nos, nosT, stuck, rev, done, dnf, name }
    }

    // A IA da corrida. (Depois de retire(), a do trânsito.)
    aiUpdate(dt, env) {
        const R = this.R;
        if (!R || R.retired) return super.aiUpdate(dt, env);
        if (this.raceHold || R.done || R.dnf) { this.nosOn = false; this.driveTo(0, 0, dt, 6, R.done ? 7 : 14); return; }
        const path = R.path, p = this.position, v = this.forwardSpeed, sp = Math.abs(v), C = RaceCar.TUNE;
        // progresso
        const pr = path.project(p.x, p.z, R.seg, RaceCar._pr);
        if (path.loop) { const ds = pr.s - R.s; if (ds < -path.len / 2) R.lap++; else if (ds > path.len / 2) R.lap--; }
        R.s = pr.s; R.seg = pr.seg; R.off = pr.d;
        // nitro: reta longa à frente e carga sobrando
        R.nosT -= dt;
        if (this.nosOn && (R.nosT <= 0 || R.nos <= 0)) this.nosOn = false;
        else if (!this.nosOn && R.nos > 0.3 && sp > 12 && path.cornerAt(R.s, 90, R.seg) > 60 && Math.random() < dt * 0.7) { this.nosOn = true; R.nosT = 1.6 + Math.random() * 1.4; }
        if (this.nosOn) R.nos -= dt * 0.25;
        // velocidade-alvo: máxima × habilidade × elástico, as curvas à frente (freando a tempo) e quem está no caminho
        const top = this.spec.maxSpeed * R.skill * R.band * (this.nosOn ? Vehicle.NOS_TOP : 1);
        let vt = top;
        const brakeD = (sp * sp) / (2 * C.brake) + 25;
        for (let k = 4; k < brakeD; k += 5) {
            const r = path.cornerAt(R.s + k - 4, 5, R.seg);
            if (r === Infinity) continue;
            const vc = Math.sqrt(C.mu * R.skill * r) + C.cornerPlus;
            vt = Math.min(vt, Math.sqrt(vc * vc + 2 * C.brake * Math.max(0, k - 6)));
        }
        // obstáculos: o trânsito e os rivais à frente, na faixa por onde vou; troca de lado se o outro lado está livre
        const hw = path.halfW(R.s, R.seg), look = 10 + sp * 1.3;
        const P0 = path.at(R.s, RaceCar._a, R.seg), tx = P0.tx, tz = P0.tz;
        let block = null, bAlong = Infinity;
        const lanes = RaceCar._lanes; lanes.length = 0;
        for (const o of env.grid.query(p.x, p.z, look + 4, RaceCar._q)) {
            if (o.ref === this || (o.layer || 0) !== (this.layer || 0)) continue;
            const dx = o.x - p.x, dz = o.z - p.z, along = dx * tx + dz * tz;
            if (along < -2 || along > look) continue;
            const olat = (dx * -tz + dz * tx) + pr.lat, rad = this.halfW + (o.kind === 'car' ? o.hw : 0.5) + 0.6;
            lanes.push({ lat: olat, rad, along, vx: o.vx || 0, vz: o.vz || 0, o });
            if (Math.abs(olat - R.lat) < rad && along > this.halfLen + 1 && along < bAlong) { bAlong = along; block = lanes[lanes.length - 1]; }      // (quem está AO LADO não é "o da frente": seguir ele trava os dois)
        }
        if (block) {
            // lado livre: da esquerda à direita da pista, o mais perto da faixa de agora
            let bestLat = null, bestCost = Infinity;
            for (let L = -hw; L <= hw + 0.01; L += Math.max(1, hw / 3)) {
                let free = true;
                for (const q of lanes) if (q.along > 0 && q.along < look && Math.abs(q.lat - L) < q.rad) { free = false; break; }
                const cost = Math.abs(L - R.lat) + Math.abs(L - R.pref) * 0.3;
                if (free && cost < bestCost) { bestCost = cost; bestLat = L; }
            }
            if (bestLat !== null) R.latT = bestLat;
            else {                                                                  // sem espaço: segue o da frente
                const lead = Math.max(0, block.vx * tx + block.vz * tz), gap = Math.max(0, bAlong - this.halfLen - 3);
                vt = Math.min(vt, Math.sqrt(lead * lead + 2 * C.brake * 0.7 * gap));
            }
        } else if ((R.latHold -= dt) <= 0) { R.latT = R.pref; R.latHold = 0.8; }
        R.latT = Math.max(-hw, Math.min(hw, R.latT));
        R.lat += Math.sign(R.latT - R.lat) * Math.min(Math.abs(R.latT - R.lat), dt * (2.5 + sp * 0.12));
        // direção: perseguição pura num ponto à frente, deslocado para a faixa escolhida
        const Ld = Math.max(6, Math.min(22, 4 + sp * 0.55)), T = path.at(R.s + Ld, RaceCar._b, R.seg);
        const ax = T.x - T.tz * R.lat, az = T.z + T.tx * R.lat;
        const f = this._fdir || (this._fdir = new BABYLON.Vector3()); this.fwdToRef(f);
        let delta = Math.atan2(ax - p.x, az - p.z) - Math.atan2(f.x, f.z);
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        let steer = Math.max(-1, Math.min(1, delta / 0.42));
        // preso (muro, batida): ré curta virando para o outro lado; muito tempo, fora da tela, volta para a pista
        R.stuck = sp < 1.2 ? R.stuck + dt : Math.max(0, R.stuck - dt * 2);
        if (R.rev > 0) { R.rev -= dt; this.driveTo(-4, -steer, dt, 7, 14); return; }
        if (R.stuck > 1.6 && !this.tumble) { R.stuck = 0.6; R.rev = 0.9; R.unstick = (R.unstick || 0) + 1; }
        if (R.unstick > 3 && !Zones.near(p.x, p.z, 25)) this.reset();
        const a = Vehicle.accelOf(this.spec, v, top, 1) * (0.88 + 0.22 * R.skill) * (this.nosOn ? Vehicle.NOS_ACC : 1) + C.fric;
        this.driveTo(Math.max(0, vt), steer, dt, a, C.brake);
    }

    // De volta para a pista (no traçado, alguns metros atrás de onde parou), parado e de rodas no chão.
    reset() {
        const R = this.R, q = R.path.at(R.s - 6, RaceCar._a, R.seg);
        this.teleport(q.x - q.tz * R.lat, q.z + q.tx * R.lat, Math.atan2(q.tx, q.tz));
        R.unstick = 0; R.stuck = 0; R.rev = 0;
    }

    // Acabou: vira um carro comum (estacionado no autódromo; na rua, circulando — o trânsito cuida dele e recicla longe do jogador).
    retire(street) {
        if (!this.R) return;
        this.R.retired = true; this.nosOn = false; this.raceHold = false;
        this.keep = false; this.ignoreSignals = false;
        if (this.destroyed) return;
        if (street) { this.mode = 'drive'; if (!this.reroute()) this.park(); }
        else this.park();
        this.locked = false;
    }
}
// Afinação do piloto da IA: aderência na curva (μ·g, m/s²: v = √(μg·R) — ~2 g, perto do que o carro do jogador segura antes de
// derrapar: Config.vehicle.slipLimit), folga na curva, frenagem (m/s²) e o atrito do chão que come parte da aceleração pedida ao
// driveTo (sem ele o rival acelera pela metade).
RaceCar.TUNE = { mu: 20, cornerPlus: 2, brake: 11, fric: 2 };
RaceCar._pr = {}; RaceCar._a = {}; RaceCar._b = {}; RaceCar._q = []; RaceCar._lanes = [];
