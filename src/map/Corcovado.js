// ============================================================================
// Corcovado — o CRISTO REDENTOR no alto do morro, e tudo que leva até ele, do chão ao topo:
//   • o MORRO em 3D (malha própria): mata fechada nas encostas (copas das árvores e palmeiras a cada altura) e pedra aparecendo;
//   • o MIRANTE redondo a 18 m, com balaustrada, e o Cristo de braços abertos no pedestal escuro (malha própria, com as dobras da túnica);
//   • as ESCADARIAS de concreto em zigue-zague, com muros de arrimo, guarda-corpo e postes, do PORTÃO (guarita, placa CRISTO REDENTOR,
//     ACESSO DE PEDESTRES) até o mirante;
//   • o TERRAÇO DO CAFÉ a meia encosta (o quiosque verde), a PASSARELA DE MADEIRA sobre pilares que sobe do pé do morro até ele e a escada
//     dele até o mirante;
//   • o ELEVADOR panorâmico (torre de vidro) do chão até o terraço, com a ponte até ele — E sobe/desce;
//   • o TREM DO CORCOVADO: trilhos de cremalheira subindo a encosta leste da estação do pé até a do alto, ao lado do mirante — E sobe/desce
//     (sem ninguém, ele vai e volta sozinho).
// Anda-se por tudo isso a pé: as escadas, passarelas, o terraço e o mirante são uma rede de Walkways (entra-se pelo pé de um lance).
// Coordenadas LOCAIS: x leste, z norte, a partir do Cristo (C); alturas em u.
//   build()  (Landmarks._cristo)   rede, sólidos, POIs        meshes(wb)  geometria        update(dt)  elevador, trem, viagens
//   prompt(g) / interact(g)  (Game) o E do elevador e do trem   covers(x, z, m)  área do complexo   drawMap(...)  no mapa
// ============================================================================

const Corcovado = {
    C: { x: -978, z: 740 },
    H: 18,                       // o mirante
    K: 1,                        // escala da estátua (a túnica e a cabeça somam ~19 u sobre o pedestal de 5 u; os braços, ±12 u)
    R: 56, RP: 16,               // raio do pé do morro e do platô
    STAIRS: [[-8, -64, 0], [-8, -52, 4.2], [-26, -52, 5.4], [-26, -41, 9.2], [-6, -41, 10.4], [-6, -31, 13.6], [-18, -31, 14.4], [-18, -21, 18], [-8, -12, 18]],
    TERRACE: { rect: [10, -40, 26, -30], h: 11 },
    UPPER: [[14, -30, 11], [14, -22, 14.4], [7, -12, 18]],                     // do terraço ao mirante
    WOOD: [[48, -68, 0], [36, -55, 5], [32, -50, 5.6], [24, -39.5, 11]],       // a passarela de madeira
    LIFT: { x: 41, z: -42, s: 2.2, h: 11, door: [41, -45.8], stop: [37.6, -41.1], bridge: [[38.4, -40.95], [25.2, -37.2]] },
    RAIL: { z: -2, x0: 62, x1: 24, h: 16 },                                     // trilhos: do pé (x0, no chão) ao alto (x1, h)
    STATION_LO: [56, 0.4, 68, 4.4], STATION_HI: [17, 0.4, 28.5, 4.4],
    TOPSTAIR: [[18.5, 2.4, 16], [14.6, 2.4, 18]],
    PLAZA: [-24, -80, 8, -64.5],
    built: false, net: null, ride: null,

    W(x, z) { return [this.C.x + x, this.C.z + z]; },
    local(x, z) { return { x: x - this.C.x, z: z - this.C.z }; },
    // Raio do pé do morro na direção a (contorno orgânico).
    _rim(a) { return this.R * (1 + 0.045 * Math.sin(a * 3 + 1.3) + 0.03 * Math.sin(a * 5 + 0.4)); },
    // Altura do morro em (x, z) LOCAIS.
    hm(x, z) {
        const r = Math.hypot(x, z), R = this._rim(Math.atan2(z, x));
        if (r >= R) return 0;
        const top = this.H - 0.6;
        if (r <= this.RP) return top;
        const t = (R - r) / (R - this.RP), bump = (WorldMap._fbm(x / 9 + 40, z / 9 + 40, 2, 93) - 0.5) * 3.2 * Math.sin(Math.PI * Math.min(1, t));
        return Math.max(0, top * Math.pow(t, 1.25) + bump);
    },

    // ---------------------------------------------------------------- lugares e a rede de caminhos
    build() {
        if (this.built) return;
        this.built = true;
        const W = (p) => { const q = this.W(p[0], p[1]); return [q[0], q[1], p[2]]; }, parts = [];
        const chain = (P, w, entry) => {
            for (let i = 0; i + 1 < P.length; i++) parts.push({ seg: true, a: W(P[i]), b: W(P[i + 1]), w, entry: entry && i === 0 });
            for (let i = 1; i + 1 < P.length; i++) { const c = W(P[i]); parts.push({ rect: [c[0] - w / 2, c[1] - w / 2, c[0] + w / 2, c[1] + w / 2], h: c[2] }); }      // patamares
        };
        chain(this.STAIRS, 3.2, true);
        chain(this.UPPER, 3, false);
        chain(this.WOOD, 2.6, true);
        chain(this.TOPSTAIR, 3, false);
        const T = this.TERRACE.rect, a = this.W(T[0], T[1]), b = this.W(T[2], T[3]);
        parts.push({ rect: [a[0], a[1], b[0], b[1]], h: this.TERRACE.h });
        parts.push({ disc: true, x: this.C.x, z: this.C.z, r: 15, h: this.H });
        const L = this.LIFT, B0 = this.W(...L.bridge[0]), B1 = this.W(...L.bridge[1]);
        parts.push({ seg: true, a: [B0[0], B0[1], L.h], b: [B1[0], B1[1], L.h], w: 2.4 });
        const S = this.STATION_HI, s0 = this.W(S[0], S[1]), s1 = this.W(S[2], S[3]);
        parts.push({ rect: [s0[0], s0[1], s1[0], s1[1]], h: this.RAIL.h });
        this.net = Walkways.add({ name: 'Corcovado', parts });
        this._solids();
        const g = this.W(-8, -71);
        CityGrid.addPoi({ type: 'cristo', name: 'Cristo Redentor — portão do Corcovado (escadarias, elevador e trem)', x: g[0], z: g[1] });
        this.train = { u: 0, dir: 1, wait: 6, max: this.RAIL.x0 - this.RAIL.x1 - 11.5 };          // (u: a frente do carro de baixo; no alto, os dois carros na estação)
        this.lift = { y: 0 };
    },

    // Sólidos (CityGrid): o morro (faixas por linha), os pés dos lances baixos, pilares, a torre do elevador, a guarita e o portão.
    _solids() {
        const O = [], add = (x0, z0, x1, z1, h, extra) => { const a = this.W(x0, z0), b = this.W(x1, z1); O.push(Object.assign({ x0: Math.min(a[0], b[0]), z0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), z1: Math.max(a[1], b[1]), h }, extra || {})); };
        const rows = this._rows = [];
        for (let z = -this.R; z < this.R; z += 4) {                                 // o morro: em cada faixa de 4 u, do primeiro ao último ponto dentro
            let x0 = null, x1 = null;
            for (let x = -this.R - 4; x <= this.R + 4; x += 1) if (Math.hypot(x, z + 2) < this._rim(Math.atan2(z + 2, x)) - 5) { if (x0 === null) x0 = x; x1 = x; }
            if (x0 !== null) { add(x0, z, x1, z + 4, 20); rows.push([x0, z, x1, z + 4]); }
        }
        const low = (P) => {                                                         // embaixo do lance que sai do chão: ninguém passa (só pelo pé)
            const a = P[0], b = P[1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
            for (let u = 2.1; u < L && a[2] + (b[2] - a[2]) * u / L < 2.4; u += 0.9) add(a[0] + ux * u - 0.75, a[1] + uz * u - 0.75, a[0] + ux * u + 0.75, a[1] + uz * u + 0.75, 2, { stair: true });      // (do 1,35 u em diante: o pé fica livre)
        };
        low(this.STAIRS); low(this.WOOD);
        for (const p of this._pillars()) add(p[0] - 0.35, p[1] - 0.35, p[0] + 0.35, p[1] + 0.35, 6);
        const L = this.LIFT;
        add(L.x - L.s, L.z - L.s, L.x + L.s, L.z + L.s, 14);
        add(-17, -67.6, -13, -64.4, 3.2);                                            // guarita
        add(-12.2, -64.8, -10.6, -63.2, 5.6); add(-5.4, -64.8, -3.8, -63.2, 5.6);     // pilares do portão
        add(55.8, 3.6, 56.4, 4.2, 3.4); add(67.6, 3.6, 68.2, 4.2, 3.4);               // postes da estação de baixo
        CityGrid.addObstacles(O);
    },
    // Pilares da passarela de madeira e da ponte do elevador (locais).
    _pillars() {
        if (this._pil) return this._pil;
        const out = [], along = (a, b, step) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let u = step; u < L - 0.5; u += step) out.push([a[0] + (b[0] - a[0]) * u / L, a[1] + (b[1] - a[1]) * u / L, a[2] + (b[2] - a[2]) * u / L]); };
        const P = this.WOOD;
        for (let i = 0; i + 1 < P.length; i++) along(P[i], P[i + 1], 4.5);
        const B = this.LIFT.bridge;
        along([B[0][0], B[0][1], this.LIFT.h], [B[1][0], B[1][1], this.LIFT.h], 4.5);
        return (this._pil = out.filter((p) => p[2] > 2.6));
    },

    // A área do complexo: o morro (até logo depois do pé), a praça do portão e, fora do morro, só o que é construído (passarela,
    // elevador, trilhos e estações) — em volta, a mata do terreno chega até o pé do morro.
    covers(x, z, m = 0) {
        if (!this.built) return false;
        const p = this.local(x, z), r = Math.hypot(p.x, p.z);
        if (r < this._rim(Math.atan2(p.z, p.x)) + 1.5 + m) return true;
        const inR = (R, e) => p.x > R[0] - e && p.x < R[2] + e && p.z > R[1] - e && p.z < R[3] + e;
        if (inR(this.PLAZA, 2 + m) || inR(this.STATION_LO, 3 + m) || inR(this.STATION_HI, 3 + m)) return true;
        if (Math.abs(p.x - this.LIFT.x) < this.LIFT.s + 3 + m && Math.abs(p.z - this.LIFT.z) < this.LIFT.s + 3 + m) return true;
        const near = (a, b, e) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz))); return Math.hypot(a[0] + dx * t - p.x, a[1] + dz * t - p.z) < e; };
        for (let i = 0; i + 1 < this.WOOD.length; i++) if (near(this.WOOD[i], this.WOOD[i + 1], 3 + m)) return true;
        if (near(this.LIFT.bridge[0], this.LIFT.bridge[1], 3 + m)) return true;
        return near([this.RAIL.x0, this.RAIL.z], [this.RAIL.x1, this.RAIL.z], 3.5 + m);
    },

    // ---------------------------------------------------------------- elevador e trem
    _spot(g) {
        if (!this.built || g.mode !== 'player' || this.ride) return null;
        const pl = g.player, p = this.local(pl.position.x, pl.position.z), onNet = pl.walk === this.net, ground = !pl.onDeck && !pl.underBridge;
        const L = this.LIFT, S0 = this.STATION_LO, S1 = this.STATION_HI;
        if (ground && Math.hypot(p.x - L.door[0], p.z - L.door[1]) < 2.4)
            return { kind: 'lift', dir: 1, html: '<b>E</b> Elevador panorâmico do Corcovado<small>sobe ao terraço do café, a meia encosta</small>' };
        if (onNet && Math.abs(pl.deckH - L.h) < 0.6 && Math.hypot(p.x - L.stop[0], p.z - L.stop[1]) < 2.6)
            return { kind: 'lift', dir: -1, html: '<b>E</b> descer de elevador' };
        if (ground && p.x > S0[0] - 1 && p.x < S0[2] + 1 && p.z > S0[1] - 1.5 && p.z < S0[3] + 1)
            return { kind: 'train', dir: 1, html: '<b>E</b> Trem do Corcovado<small>sobe a encosta até o mirante do Cristo</small>' };
        if (onNet && Math.abs(pl.deckH - this.RAIL.h) < 0.6 && p.x > S1[0] && p.x < S1[2] && p.z > S1[1] && p.z < S1[3])
            return { kind: 'train', dir: -1, html: '<b>E</b> descer de trem<small>até a estação do pé do morro</small>' };
        return null;
    },
    prompt(g) { const s = this._spot(g); return s ? s.html : ''; },
    // Multiplicador do zoom automático: na rede do Corcovado (ou viajando no elevador/trem), abre com a altura — até 2,25× no mirante.
    zoomFor(pl) { return this.built && pl.walk === this.net ? 1 + 1.25 * Math.min(1, Math.max(0, (pl.deckH || 0) - 4) / 14) : 1; },
    interact(g) {
        const s = this._spot(g);
        if (!s) return false;
        const pl = g.player;
        pl.cancelSequence(); pl.action = null; pl.velocity.setAll(0);
        pl.setVisible(false); pl.frozen = true; pl.invulnerable = true;
        pl.walk = this.net; pl.onDeck = true; pl.roof = null; pl._walkSt = { x: pl.position.x, z: pl.position.z, h: pl.deckH || 0 };
        this.ride = { g, kind: s.kind, dir: s.dir, t: 0, dur: s.kind === 'lift' ? 6 : 18 };
        if (s.kind === 'train') { this.train.u = s.dir > 0 ? 0 : this.train.max; this.train.wait = 0; }
        else this.lift.y = s.dir > 0 ? 0 : this.LIFT.h;
        if (g._flash) g._flash(s.kind === 'lift' ? (s.dir > 0 ? 'Subindo de elevador…' : 'Descendo de elevador…') : (s.dir > 0 ? 'Trem do Corcovado: subindo a encosta…' : 'Trem do Corcovado: descendo…'));
        return true;
    },
    // Posição (mundo) e altura do assoalho do trem com a frente em u (distância do pé, ao longo dos trilhos).
    _trainAt(u) { const R = this.RAIL, x = R.x0 - u; return { x: this.C.x + x, z: this.C.z + R.z, y: R.h * u / (R.x0 - R.x1) }; },

    update(dt) {
        if (!this.built) return;
        const T = this.train, R = this.ride;
        if (R) {
            const g = R.g, pl = g.player;
            R.t += dt;
            const k0 = Math.min(1, R.t / R.dur), k = k0 * k0 * (3 - 2 * k0);
            let x, z, h;
            if (R.kind === 'lift') {
                const L = this.LIFT, c = this.W(L.x, L.z);
                this.lift.y = (R.dir > 0 ? k : 1 - k) * L.h;
                x = c[0]; z = c[1]; h = this.lift.y;
            } else {
                T.u = (R.dir > 0 ? k : 1 - k) * T.max;
                const q = this._trainAt(T.u + 3);
                x = q.x; z = q.z; h = q.y + 0.6;
            }
            pl.position.x = x; pl.position.z = z; pl.deckH = h; pl._walkSt = { x, z, h };
            if (!pl.alive || k0 >= 1) {
                pl.frozen = false; pl.invulnerable = false; pl.setVisible(true);
                const top = R.dir > 0;
                const stop = R.kind === 'lift' ? (top ? this.LIFT.stop : this.LIFT.door) : (top ? [22, 2.4] : [62, 2.4]);
                const w = this.W(stop[0], stop[1]);
                pl.position.x = w[0]; pl.position.z = w[1];
                if (top && pl.alive) pl.enterWalk(this.net, w[0], w[1], R.kind === 'lift' ? this.LIFT.h : this.RAIL.h);
                else { pl.walk = null; pl.onDeck = false; pl.deckH = 0; pl.actor.mesh.position.y = pl.baseY; }
                if (g._flash) g._flash(top ? (R.kind === 'lift' ? 'Terraço do café — as escadas seguem até o Cristo' : 'Estação do alto: o mirante do Cristo é logo ali') : 'Pé do morro');
                this.ride = null;
            }
        } else if (T) {                                                             // sem passageiro: vai e volta sozinho
            if (T.wait > 0) T.wait -= dt;
            else {
                T.u += T.dir * dt * 2.2;
                if (T.u >= T.max) { T.u = T.max; T.dir = -1; T.wait = 10; }
                else if (T.u <= 0) { T.u = 0; T.dir = 1; T.wait = 10; }
            }
        }
        if (this._cab) this._cab.position.y = this.lift.y + 1.42;
        if (this._train) {
            const pitch = Math.atan2(this.RAIL.h, this.RAIL.x0 - this.RAIL.x1);
            this._train.forEach((car, i) => { const q = this._trainAt(T.u + 3 + i * 5.6); car.position.set(q.x, q.y + 0.45, q.z); car.rotation.z = -pitch; });
        }
    },

    // ---------------------------------------------------------------- geometria
    meshes(wb) {
        if (!this.built) return;
        const t0 = performance.now();
        this._wb = wb;
        this._meshHill(wb);
        this._meshPlatform(wb);
        this._meshStatue(wb);
        this._meshStairs(wb);
        this._meshTerrace(wb);
        this._meshLift(wb);
        this._meshRail(wb);
        this._meshGate(wb);
        this._meshTrees(wb);
        for (const [x0, z0, x1, z1] of this._rows) { const a = this.W(x0, z0), b = this.W(x1, z1); wb._collider('corcovado', a[0], a[1], b[0], b[1], 20); }
        console.log(`[CORCOVADO] geometria em ${(performance.now() - t0).toFixed(0)} ms`);
    },
    _c(c, k = 1) { return Landmarks._c(c, k); },
    _bt(lx, lz, key = 'trim') { const w = this.W(lx, lz); return this._wb._batch(key, w[0], w[1]); },
    // Caixa orientada de p a q (pontos LOCAIS [x, z]), da lateral l0 a l1 (à esquerda de quem vai de p a q), com o fundo e o topo em p
    // (ya0, ya1) e em q (yb0, yb1): lances, muros e lajes inclinadas.
    _prism(bt, p, q, l0, l1, ya0, ya1, yb0, yb1, col, top = null) {
        if (l0 > l1) [l0, l1] = [l1, l0];
        const P = this.W(p[0], p[1]), Q = this.W(q[0], q[1]);
        const dx = Q[0] - P[0], dz = Q[1] - P[1], L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, nx = -uz, nz = ux, z3 = [[0, 0], [0, 0], [0, 0]];
        const V = (b, l, y) => [b[0] + nx * l, y, b[1] + nz * l];
        const A0 = V(P, l0, ya1), A1 = V(P, l1, ya1), B0 = V(Q, l0, yb1), B1 = V(Q, l1, yb1), a0 = V(P, l0, ya0), a1 = V(P, l1, ya0), b0 = V(Q, l0, yb0), b1 = V(Q, l1, yb0);
        const face = (a, b, c, d, n, k) => { bt.tri(a, b, c, n, z3, k); bt.tri(a, c, d, n, z3, k); };
        const s = Math.hypot(yb1 - ya1, L), up = [-ux * (yb1 - ya1) / s, L / s, -uz * (yb1 - ya1) / s];
        face(A0, A1, B1, B0, up, top || col);
        face(A0, B0, b0, a0, [-nx, 0, -nz], col); face(A1, B1, b1, a1, [nx, 0, nz], col);
        face(A0, A1, a1, a0, [-ux, 0, -uz], col); face(B0, B1, b1, b0, [ux, 0, uz], col);
    },
    _box(bt, x0, z0, x1, z1, y0, y1, col) { const a = this.W(x0, z0), b = this.W(x1, z1); bt.solid(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), y0, y1, col); },
    _beam(bt, a, b, t, col) { const A = this.W(a[0], a[2]), B = this.W(b[0], b[2]); Landmarks._beam(bt, [A[0], a[1], A[1]], [B[0], b[1], B[1]], t, col); },
    // Guarda-corpo ao longo de p→q (locais, alturas ya → yb do piso), do lado l: postes a cada ~1,8 u e o corrimão.
    _rail(bt, p, q, l, ya, yb, col = this._c('#3b3f46'), hh = 1.05) {
        const L = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.max(1, Math.round(L / 1.8)), ux = (q[0] - p[0]) / L, uz = (q[1] - p[1]) / L, nx = -uz * l, nz = ux * l;
        const pt = (u) => [p[0] + ux * u + nx, ya + (yb - ya) * u / L, p[1] + uz * u + nz];
        for (let i = 0; i <= n; i++) { const a = pt(L * i / n); this._beam(bt, a, [a[0], a[1] + hh, a[2]], 0.1, col); }
        const a = pt(0), b = pt(L);
        this._beam(bt, [a[0], a[1] + hh, a[2]], [b[0], b[1] + hh, b[2]], 0.09, col);
        this._beam(bt, [a[0], a[1] + hh * 0.5, a[2]], [b[0], b[1] + hh * 0.5, b[2]], 0.06, col);
    },
    // Poste de luz (cabeçote claro).
    _lamp(bt, x, z, y) { const c = this._c('#2e3238'); this._beam(bt, [x, y, z], [x, y + 3.6, z], 0.14, c); this._beam(bt, [x, y + 3.6, z], [x + 0.7, y + 3.6, z], 0.1, c); this._box(bt, x + 0.45, z - 0.22, x + 0.95, z + 0.22, y + 3.3, y + 3.55, this._c('#fff1c4')); },

    // O MORRO: malha polar, mata escura com pedra nas partes mais íngremes (cor de vértice sobre a grama HD).
    _meshHill(wb) {
        const NR = 30, NA = 96, pos = [], col = [], uv = [], idx = [], C = this.C;
        for (let i = 0; i <= NR; i++) for (let j = 0; j < NA; j++) {
            const a = (j / NA) * Math.PI * 2, R = this._rim(a) + 1.5, r = (i / NR) * R, x = Math.cos(a) * r, z = Math.sin(a) * r;
            const h = i === NR ? 0.02 : this.hm(x, z) + 0.06, s1 = this.hm(x * 1.03, z * 1.03), slope = Math.abs(h - s1) / (0.03 * r + 0.01);
            pos.push(C.x + x, h, C.z + z); uv.push((C.x + x) / 4, (C.z + z) / 4);
            const n = WorldMap._fbm(x / 6 + 7, z / 6 + 3, 2, 94), rock = Math.max(0, Math.min(1, (slope - 0.55) * 2 + (n - 0.62) * 3)) * (r > this.RP + 2 ? 1 : 0);
            const g = [0.42 + 0.12 * n, 0.62 + 0.14 * n, 0.36 + 0.08 * n], k = [0.78, 0.74, 0.68];
            col.push(g[0] + (k[0] - g[0]) * rock, g[1] + (k[1] - g[1]) * rock, g[2] + (k[2] - g[2]) * rock, 1);
        }
        for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
            const a = i * NA + j, b = i * NA + (j + 1) % NA, c = (i + 1) * NA + j, d = (i + 1) * NA + (j + 1) % NA;
            idx.push(a, d, b, a, c, d);
        }
        const mesh = new BABYLON.Mesh('corcovadoHill', wb.scene), vd = new BABYLON.VertexData(), nor = [];
        BABYLON.VertexData.ComputeNormals(pos, idx, nor);
        vd.positions = pos; vd.indices = idx; vd.normals = nor; vd.colors = col; vd.uvs = uv;
        vd.applyToMesh(mesh);
        const m = new BABYLON.StandardMaterial('corcovadoHill', wb.scene);
        m.diffuseTexture = wb.mats.grass.diffuseTexture; m.specularColor = BABYLON.Color3.Black();
        mesh.material = m; mesh.useVertexColors = true; mesh.isPickable = false; mesh.receiveShadows = true; mesh.freezeWorldMatrix();
        if (wb.shadow) wb.shadow.addShadowCaster(mesh);
        wb.meshes.push(mesh); wb.mats.corcovadoHill = m;
    },

    // O MIRANTE: a base redonda de pedra (com as janelas em arco), o piso de pedra portuguesa e a balaustrada (abertas nas chegadas).
    _meshPlatform(wb) {
        const C = this.C, H = this.H, c = this._c.bind(this), bt = this._bt(0, 0);
        Landmarks._wall(bt, C.x, C.z, 15, 15, 1, 0, H - 0.1, 48, () => c('#bdb6a8'));
        Landmarks._wall(bt, C.x, C.z, 15.4, 15.4, 1, H - 1.4, H - 0.05, 48, () => c('#cfc8ba'));
        Landmarks._ring(bt, C.x, C.z, 15.4, 15.4, 0.98, 1, H - 0.05, H - 0.05, 48, () => c('#cfc8ba'));
        for (let i = 0; i < 24; i++) {                                               // as janelas em arco da base (escuras)
            const a = (i / 24) * Math.PI * 2, x = Math.cos(a) * 15.08, z = Math.sin(a) * 15.08;
            if (Math.sin(a) > 0.3) continue;
            this._beam(bt, [x, H - 4.6, z], [x, H - 2.3, z], 0.9, c('#3c3a38'));
        }
        Landmarks._ring(wb._batch('open_plaza', C.x, C.z), C.x, C.z, 15, 15, 0, 1, H, H, 48, () => c('#ffffff'), true, 4);
        // balaustrada: colunas brancas e o corrimão, com vãos nas chegadas das escadas
        const gaps = [[-8, -12], [7, -12], [13, 2.4]].map(([x, z]) => Math.atan2(z, x));
        const open = (a) => gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.15);
        const N = 120, wh = c('#ece8df');
        for (let i = 0; i < N; i++) {
            const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
            if (open(a0) || open(a1)) continue;
            const p = [Math.cos(a0) * 14.7, Math.sin(a0) * 14.7], q = [Math.cos(a1) * 14.7, Math.sin(a1) * 14.7];
            this._beam(bt, [p[0], H, p[1]], [p[0], H + 0.85, p[1]], 0.16, wh);
            this._beam(bt, [p[0], H + 0.92, p[1]], [q[0], H + 0.92, q[1]], 0.22, wh);
        }
        for (const a of [0.6, 2.3, 3.9, 5.4]) this._lamp(bt, Math.cos(a) * 13.4, Math.sin(a) * 13.4, H);
        // escadinhas em volta do pedestal
        this._box(bt, -4.2, -4.2, 4.2, 4.2, H, H + 0.25, c('#b9b2a4'));
        this._box(bt, -3.5, -3.5, 3.5, 3.5, H + 0.25, H + 0.5, c('#aca596'));
    },

    // O CRISTO: pedestal escuro (com a porta da capela) e a estátua em pedra-sabão, de braços abertos para o leste e o oeste.
    _meshStatue(wb) {
        const C = this.C, H = this.H, c = this._c.bind(this), bt = this._bt(0, 0);
        const y0 = H + 0.5, yP = y0 + 5, K = this.K;                                     // (K: escala da estátua sobre o pedestal)
        this._box(bt, -2.8, -2.8, 2.8, 2.8, y0, yP - 0.5, c('#4a4a4e'));
        this._box(bt, -3.15, -3.15, 3.15, 3.15, yP - 0.5, yP, c('#5c5c61'));
        this._box(bt, -3.1, -3.1, 3.1, 3.1, y0, y0 + 0.45, c('#5c5c61'));
        this._box(bt, -0.8, -2.9, 0.8, -2.75, y0, y0 + 2.4, c('#26221e'));                   // a porta da capela
        // a estátua: malha própria (anéis da túnica com as dobras, ombros, braços com as mangas caídas, cabeça)
        const pos = [], col = [], idx = [];
        const soap = [0.87, 0.85, 0.8];
        const ring = (pts) => { const i0 = pos.length / 3; for (const p of pts) { pos.push(C.x + p[0] * K, yP + (p[1] - yP) * K, C.z + p[2] * K); const k = p[3] || 1; col.push(soap[0] * k, soap[1] * k, soap[2] * k, 1); } return i0; };
        const stitch = (r0, r1, n, closed = true) => { for (let j = 0; j < (closed ? n : n - 1); j++) { const a = r0 + j, b = r0 + (j + 1) % n, cc = r1 + j, d = r1 + (j + 1) % n; idx.push(a, cc, b, b, cc, d); } };
        const NA = 32, prof = [];
        // perfil da túnica: [altura acima do pedestal, meia-largura x, meia-profundidade z, dobras]
        for (const [t, a, b, f] of [[0, 2.0, 1.45, 0.05], [0.4, 1.85, 1.32, 0.09], [3, 1.72, 1.2, 0.08], [7, 1.58, 1.08, 0.07], [10.5, 1.48, 1.0, 0.05], [13.2, 1.5, 0.98, 0.03], [14.6, 2.05, 1.0, 0.0], [15.4, 2.15, 0.95, 0], [16.1, 1.2, 0.8, 0], [16.4, 0.5, 0.5, 0]]) prof.push([t, a, b, f]);
        let prev = null;
        for (const [t, a, b, f] of prof) {
            const pts = [];
            for (let j = 0; j < NA; j++) {
                const th = (j / NA) * Math.PI * 2, fold = 1 + f * Math.sin(th * 7 + 0.5), dark = 1 - f * 1.4 * Math.max(0, -Math.sin(th * 7 + 0.5));
                pts.push([Math.cos(th) * a * fold, yP + t, Math.sin(th) * b * fold, dark]);
            }
            const r = ring(pts);
            if (prev !== null) stitch(prev, r, NA);
            prev = r;
        }
        // a cabeça: um elipsoide (pescoço até o alto)
        let hprev = prev;
        for (let i = 1; i <= 8; i++) {
            const ph = (i / 8) * Math.PI, cy = yP + 17.6, ry = 1.3, rr = Math.sin(ph) * 0.82 + (i < 8 ? 0.02 : 0);
            const pts = [];
            for (let j = 0; j < NA; j++) { const th = (j / NA) * Math.PI * 2; pts.push([Math.cos(th) * rr, cy - Math.cos(ph) * ry, Math.sin(th) * rr * 1.02, 0.96]); }
            const r = ring(pts);
            stitch(hprev, r, NA);
            hprev = r;
        }
        // os braços: tubos afinando do ombro até a mão, com a manga caída por baixo
        for (const s of [-1, 1]) {
            const N = 8, NS = 10;
            let rp = null;
            for (let i = 0; i <= N; i++) {
                const u = i / N, x = s * (1.9 + u * 9.8), yc = yP + 15.25 - u * 0.25, rad = 0.62 - 0.3 * u, drop = (1 - u) * 1.15 + 0.12;
                const pts = [];
                for (let j = 0; j < NS; j++) {
                    const th = (j / NS) * Math.PI * 2, cy = Math.cos(th), sz = Math.sin(th);
                    const down = cy < 0 ? -cy * drop : 0;                                 // a manga: o tecido cai por baixo do braço
                    pts.push([x, yc + cy * rad - down, sz * (rad + down * 0.25), 0.97 - (cy < 0 ? 0.08 : 0)]);
                }
                const r = ring(pts);
                if (rp !== null) stitch(rp, r, NS);
                rp = r;
            }
            const tip = ring([[s * 12.1, yP + 15.0, 0, 0.96]]);                          // a mão
            for (let j = 0; j < NS; j++) idx.push(rp + j, tip, rp + (j + 1) % NS);
        }
        const mesh = new BABYLON.Mesh('cristoRedentor', wb.scene), vd = new BABYLON.VertexData(), nor = [];
        BABYLON.VertexData.ComputeNormals(pos, idx, nor);
        vd.positions = pos; vd.indices = idx; vd.normals = nor; vd.colors = col;
        vd.applyToMesh(mesh);
        const m = new BABYLON.StandardMaterial('cristoRedentor', wb.scene);
        m.specularColor = new BABYLON.Color3(0.08, 0.08, 0.08); m.emissiveColor = new BABYLON.Color3(0.22, 0.22, 0.21); m.backFaceCulling = false;      // (a pedra-sabão clara: não some na sombra)
        mesh.material = m; mesh.useVertexColors = true; mesh.isPickable = false; mesh.receiveShadows = true; mesh.freezeWorldMatrix();
        if (wb.shadow) wb.shadow.addShadowCaster(mesh);
        wb.meshes.push(mesh); wb.mats.cristoRedentor = m;
        wb._collider('cristo', C.x - 3.2, C.z - 3.2, C.x + 3.2, C.z + 3.2, yP + 19 * K);
    },

    // As ESCADARIAS de concreto (base, degraus, muretas, guarda-corpo, postes) e a PASSARELA DE MADEIRA (tábuas, pilares, corrimão).
    _meshStairs(wb) {
        const c = this._c.bind(this);
        const flight = (A, B, w, wood) => {
            const bt = this._bt((A[0] + B[0]) / 2, (A[1] + B[1]) / 2), L = Math.hypot(B[0] - A[0], B[1] - A[1]), rise = B[2] - A[2];
            const p = [A[0], A[1]], q = [B[0], B[1]], ux = (q[0] - p[0]) / L, uz = (q[1] - p[1]) / L, at = (u) => [p[0] + ux * u, p[1] + uz * u];
            const stairs = Math.abs(rise) / L > 0.1, n = stairs ? Math.max(2, Math.round(Math.abs(rise) / 0.3)) : 1;
            if (!wood) this._prism(bt, p, q, -w / 2 - 0.3, w / 2 + 0.3, 0, A[2] - 0.12, 0, B[2] - 0.12, c('#a8a398'));
            for (let i = 0; i < n; i++) {                                            // degraus (ou a laje da rampa)
                const u0 = (L * i) / n, u1 = (L * (i + 1)) / n, y1 = stairs ? A[2] + (rise * (i + 1)) / n : null;
                const top = wood ? c(i % 2 ? '#9c6b40' : '#8a5c36') : c(i % 2 ? '#d2cdc3' : '#c6c1b6');
                if (stairs) this._prism(bt, at(u0), at(u1), -w / 2, w / 2, y1 - Math.abs(rise) / n - (wood ? 0.12 : 0.1), y1, y1 - Math.abs(rise) / n - (wood ? 0.12 : 0.1), y1, wood ? c('#6e4a2c') : c('#b3ada2'), top);
                else this._prism(bt, at(u0), at(u1), -w / 2, w / 2, A[2] - 0.3, A[2] + 0.02, B[2] - 0.3, B[2] + 0.02, wood ? c('#6e4a2c') : c('#b3ada2'), top);
            }
            if (!wood) for (const l of [-1, 1]) this._prism(bt, p, q, l * (w / 2), l * (w / 2 + 0.3), A[2] - 0.2, A[2] + 0.45, B[2] - 0.2, B[2] + 0.45, c('#bab4a8'));     // muretas
            if (wood && Math.abs(rise) > 0.4) {                                       // tábuas (de lado: as vigas)
                for (const l of [-1, 1]) this._prism(bt, p, q, l * (w / 2 - 0.05), l * (w / 2 + 0.15), A[2] - 0.55, A[2] - 0.1, B[2] - 0.55, B[2] - 0.1, c('#5e3f25'));
            }
            for (const l of [-1, 1]) this._rail(bt, p, q, l * (w / 2 + (wood ? 0.05 : 0.15)), A[2] + (wood ? 0 : 0.45), B[2] + (wood ? 0 : 0.45), wood ? c('#4a3220') : c('#3b3f46'), wood ? 1.05 : 0.6);
        };
        const landing = (P, w, wood) => {
            const bt = this._bt(P[0], P[1]), h = P[2];
            if (wood) this._box(bt, P[0] - w / 2, P[1] - w / 2, P[0] + w / 2, P[1] + w / 2, h - 0.3, h + 0.02, c('#8f6139'));
            else { this._box(bt, P[0] - w / 2 - 0.3, P[1] - w / 2 - 0.3, P[0] + w / 2 + 0.3, P[1] + w / 2 + 0.3, 0, h - 0.1, c('#a8a398')); this._box(bt, P[0] - w / 2, P[1] - w / 2, P[0] + w / 2, P[1] + w / 2, h - 0.1, h + 0.02, c('#c9c4b9')); }
        };
        const chain = (P, w, wood, lamps) => {
            for (let i = 0; i + 1 < P.length; i++) flight(P[i], P[i + 1], w, wood);
            for (let i = 1; i + 1 < P.length; i++) { landing(P[i], w, wood); if (lamps && i % 2) this._lamp(this._bt(P[i][0], P[i][1]), P[i][0] + w / 2 + 0.4, P[i][1] - w / 2, P[i][2]); }
        };
        chain(this.STAIRS, 3.2, false, true);
        chain(this.UPPER, 3, false, true);
        chain(this.TOPSTAIR, 3, false, false);
        chain(this.WOOD, 2.6, true, false);
        for (const pl of this._pillars()) this._box(this._bt(pl[0], pl[1]), pl[0] - 0.32, pl[1] - 0.32, pl[0] + 0.32, pl[1] + 0.32, 0, pl[2] - 0.3, c('#9a958b'));
    },

    // O TERRAÇO do café (sobre o muro de arrimo), o quiosque verde e a ponte do elevador.
    _meshTerrace(wb) {
        const c = this._c.bind(this), T = this.TERRACE.rect, h = this.TERRACE.h, bt = this._bt((T[0] + T[2]) / 2, (T[1] + T[3]) / 2);
        this._box(bt, T[0], T[1], T[2], T[3], 0, h - 0.15, c('#a9a398'));
        for (let x = T[0] + 1; x < T[2]; x += 3) this._box(bt, x - 0.3, T[1] - 0.3, x + 0.3, T[1], 0, h - 0.15, c('#99938a'));       // pilastras do muro
        const a = this.W(T[0], T[1]), b = this.W(T[2], T[3]);
        wb._batch('open_plaza', a[0], a[1]).top(a[0], a[1], b[0], b[1], h, (x, z) => [x / 4, -z / 4], [1, 1, 1]);
        // guarda-corpo nas bordas (vãos: a escada para o mirante ao norte, a passarela no canto sudeste, a ponte do elevador a leste)
        this._rail(bt, [T[0], T[3]], [12.4, T[3]], 0.15, h, h); this._rail(bt, [15.6, T[3]], [T[2], T[3]], 0.15, h, h);
        this._rail(bt, [T[0], T[1]], [T[0], T[3]], 0.15, h, h); this._rail(bt, [T[0], T[1]], [22.5, T[1]], -0.15, h, h);
        this._rail(bt, [T[2], -35.6], [T[2], T[3]], -0.15, h, h);
        // o café: paredes verde-água, faixa de vidro, telhado marrom avançado; mesinhas
        const k = [18, -38.6, 24.6, -34.6];
        this._box(bt, k[0], k[1], k[2], k[3], h, h + 2.9, c('#2fa596'));
        this._box(bt, k[0] - 0.05, k[1] - 0.06, k[2] + 0.05, k[1] + 0.2, h + 1.0, h + 2.2, c('#bfe6ef'));
        this._box(bt, k[0] - 0.6, k[1] - 0.35, k[2] + 0.6, k[3] + 0.6, h + 2.9, h + 3.2, c('#7a5236'));
        for (const [x, z] of [[12.5, -37.5], [12.5, -33], [16, -32]]) {
            this._box(bt, x - 0.5, z - 0.5, x + 0.5, z + 0.5, h, h + 0.75, c('#e8e2d4'));
            this._beam(bt, [x, h, z], [x, h + 2.2, z], 0.06, c('#3b3f46'));
            Landmarks._ring(bt, this.C.x + x, this.C.z + z, 1.3, 1.3, 0, 1, h + 2.2, h + 2.0, 12, (i) => c(i % 2 ? '#d9482b' : '#f2efe6'));
        }
        this._lamp(bt, T[0] + 0.6, T[1] + 0.6, h);
        // ponte do elevador até o terraço
        const B = this.LIFT.bridge, bb = this._bt(B[0][0], B[0][1]);
        this._prism(bb, B[0], B[1], -1.2, 1.2, h - 0.35, h + 0.02, h - 0.35, h + 0.02, c('#8d8f93'), c('#b4b6ba'));
        for (const l of [-1, 1]) this._rail(bb, B[0], B[1], l * 1.15, h, h);
    },

    // O ELEVADOR: a torre de vidro (pilares, cintas, vidro azulado), a cabine que sobe e desce, a porta e a placa.
    _meshLift(wb) {
        const c = this._c.bind(this), L = this.LIFT, s = L.s, bt = this._bt(L.x, L.z), top = L.h + 3;
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this._box(bt, L.x + dx * s - 0.25, L.z + dz * s - 0.25, L.x + dx * s + 0.25, L.z + dz * s + 0.25, 0, top, c('#8d949c'));
        for (let y = 2.8; y < top; y += 2.8) {
            this._box(bt, L.x - s, L.z - s - 0.1, L.x + s, L.z - s + 0.1, y - 0.12, y + 0.12, c('#8d949c'));
            this._box(bt, L.x + s - 0.1, L.z - s, L.x + s + 0.1, L.z + s, y - 0.12, y + 0.12, c('#8d949c'));
            this._box(bt, L.x - s - 0.1, L.z - s, L.x - s + 0.1, L.z + s, y - 0.12, y + 0.12, c('#8d949c'));
        }
        this._box(bt, L.x - s - 0.4, L.z - s - 0.4, L.x + s + 0.4, L.z + s + 0.4, top, top + 0.5, c('#6f767e'));
        this._box(bt, L.x - s, L.z - s, L.x + s, L.z + s, 0, 0.15, c('#9da3aa'));
        this._box(bt, L.x - 0.9, L.z - s - 0.12, L.x + 0.9, L.z - s + 0.05, 0.15, 2.5, c('#5a6068'));       // a porta de baixo
        // o vidro (um material transparente só dele)
        const w = this.W(L.x, L.z), glass = BABYLON.MeshBuilder.CreateBox('corcovadoLiftGlass', { width: 2 * s - 0.1, depth: 2 * s - 0.1, height: top - 0.2 }, wb.scene);
        glass.position.set(w[0], top / 2, w[1]);
        const gm = new BABYLON.StandardMaterial('corcovadoLiftGlass', wb.scene);
        gm.diffuseColor = new BABYLON.Color3(0.6, 0.8, 0.9); gm.alpha = 0.28; gm.specularColor = new BABYLON.Color3(0.6, 0.6, 0.6);
        glass.material = gm; glass.isPickable = false; glass.freezeWorldMatrix();
        wb.meshes.push(glass);
        // a cabine
        const cab = BABYLON.MeshBuilder.CreateBox('corcovadoLiftCab', { width: 2 * s - 0.6, depth: 2 * s - 0.6, height: 2.7 }, wb.scene);
        const cm = new BABYLON.StandardMaterial('corcovadoLiftCab', wb.scene);
        cm.diffuseColor = new BABYLON.Color3(0.78, 0.8, 0.82); cm.specularColor = new BABYLON.Color3(0.4, 0.4, 0.4);
        cab.material = cm; cab.isPickable = false;
        cab.position.set(w[0], 1.4, w[1]);
        this._cab = cab;
        wb.meshes.push(cab);
        this._sign(wb, 'ELEVADOR', L.x, 3.1, L.z - s - 0.2, 3.2, 0.7, '#1f4d3a', '#ffffff');
    },

    // O TREM: viaduto/aterro de concreto, dormentes, os trilhos e a cremalheira; as estações (de baixo e do alto); os dois carros.
    _meshRail(wb) {
        const c = this._c.bind(this), R = this.RAIL, len = R.x0 - R.x1, hAt = (x) => R.h * (R.x0 - x) / len;
        for (let x = R.x0; x > R.x1; x -= 6) {
            const x1 = Math.max(R.x1, x - 6), bt = this._bt(x, R.z);
            this._prism(bt, [x, R.z], [x1, R.z], -1.5, 1.5, 0, hAt(x) - 0.25, 0, hAt(x1) - 0.25, c('#9b968c'));
            for (let xx = x - 0.45; xx > x1; xx -= 0.9) this._prism(bt, [xx + 0.12, R.z], [xx - 0.12, R.z], -1.0, 1.0, hAt(xx) - 0.25, hAt(xx) - 0.05, hAt(xx) - 0.25, hAt(xx) - 0.05, c('#6b4a30'));
            for (const l of [-0.72, 0.72, 0]) this._beam(bt, [x, hAt(x) + 0.05, R.z + l], [x1, hAt(x1) + 0.05, R.z + l], l ? 0.13 : 0.18, c(l ? '#4b4f56' : '#2f3238'));
        }
        // estações
        const shelter = (S, y, roof) => {
            const bt = this._bt((S[0] + S[2]) / 2, S[1]);
            this._box(bt, S[0], S[1], S[2], S[3], y ? 0 : 0, y + 0.4, c('#bfb9ad'));
            for (const x of [S[0] + 0.3, S[2] - 0.3]) this._beam(bt, [x, y + 0.4, S[3] - 0.3], [x, y + 3.4, S[3] - 0.3], 0.3, c('#3b3f46'));
            this._box(bt, S[0] - 0.4, S[1] - 1.8, S[2] + 0.4, S[3] + 0.4, y + 3.4, y + 3.75, c(roof));
        };
        shelter(this.STATION_LO, 0, '#9a3b2c');
        shelter(this.STATION_HI, R.h, '#9a3b2c');
        this._sign(wb, 'TREM DO CORCOVADO', (this.STATION_LO[0] + this.STATION_LO[2]) / 2, 2.6, this.STATION_LO[1] - 0.05, 5.6, 0.8, '#7a1f17', '#ffe9a8');
        // os carros (amarelo-alaranjados, teto creme, janelas)
        this._train = [];
        for (let i = 0; i < 2; i++) {
            const car = new BABYLON.TransformNode('corcovadoTrain' + i, wb.scene);
            const part = (name, w, h, d, y, col, z = 0) => {
                const m = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, wb.scene), mat = new BABYLON.StandardMaterial(name, wb.scene);
                mat.diffuseColor = BABYLON.Color3.FromHexString(col); mat.specularColor = new BABYLON.Color3(0.25, 0.25, 0.25);
                m.material = mat; m.parent = car; m.position.set(0, y, z); m.isPickable = false; wb.meshes.push(m);
                if (wb.shadow) wb.shadow.addShadowCaster(m);
                return m;
            };
            part('corcovadoTrainBody' + i, 5.2, 1.7, 2.3, 1.0, '#e39a2d');
            part('corcovadoTrainWin' + i, 5.0, 0.75, 2.36, 1.35, '#2c3f55');
            part('corcovadoTrainRoof' + i, 5.4, 0.3, 2.5, 2.0, '#efe6d2');
            part('corcovadoTrainBand' + i, 5.25, 0.18, 2.34, 0.35, '#b2271c');
            this._train.push(car);
        }
    },

    // O PORTÃO: a praça de pedra portuguesa, os pilares de pedra com a placa CRISTO REDENTOR, a guarita e a placa de pedestres.
    _meshGate(wb) {
        const c = this._c.bind(this), P = this.PLAZA, bt = this._bt(-8, -66), a = this.W(P[0], P[1]), b = this.W(P[2], P[3]);
        const cal = wb._batch('open_plaza', a[0], a[1]);
        cal.top(a[0], a[1], b[0], b[1], 0.06, (x, z) => [x / 3, -z / 3], [1, 1, 1]);
        const stone = c('#8f8a82'), stoneD = c('#77726b');
        this._box(bt, -12.2, -64.8, -10.6, -63.2, 0, 5.6, stone); this._box(bt, -5.4, -64.8, -3.8, -63.2, 0, 5.6, stone);
        this._box(bt, -12.6, -65.0, -3.4, -63.0, 5.0, 6.2, stoneD);
        this._sign(wb, 'CRISTO REDENTOR', -8, 5.6, -65.08, 6.6, 0.95, '#1f4d3a', '#f4f1e8');
        // a guarita (bilheteria)
        this._box(bt, -17, -67.6, -13, -64.4, 0, 3.0, stone);
        this._box(bt, -17.3, -67.9, -12.7, -64.1, 3.0, 3.3, stoneD);
        this._box(bt, -16.2, -67.7, -13.8, -67.55, 1.1, 2.2, c('#2b3a44'));
        // a placa de pedestres
        for (const x of [-0.9, 1.9]) this._beam(bt, [x, 0, -66], [x, 2.2, -66], 0.12, c('#3b3f46'));
        this._sign(wb, 'ACESSO DE PEDESTRES', 0.5, 1.75, -66.08, 3.2, 0.85, '#1f4d3a', '#ffffff');
        this._lamp(bt, -14, -70, 0); this._lamp(bt, 2, -70, 0);
    },
    // Placa de texto virada para o sul (para a câmera): w × h u, no centro (x, z LOCAIS), base em y.
    _sign(wb, text, x, y, z, w, h, bg, fg) {
        const W = 512, H = Math.max(64, Math.round(512 * h / w)), tex = new BABYLON.DynamicTexture('sign_' + text, { width: W, height: H }, wb.scene, true), g = tex.getContext();
        g.fillStyle = bg; g.fillRect(0, 0, W, H);
        g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = Math.max(3, H * 0.06); g.strokeRect(g.lineWidth, g.lineWidth, W - 2 * g.lineWidth, H - 2 * g.lineWidth);
        g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
        let fs = H * 0.56; g.font = `800 ${fs}px Arial, sans-serif`;
        while (g.measureText(text).width > W * 0.88 && fs > 8) { fs -= 2; g.font = `800 ${fs}px Arial, sans-serif`; }
        g.fillText(text, W / 2, H / 2 + 2);
        tex.update(true);
        const m = BABYLON.MeshBuilder.CreatePlane('sign_' + text, { width: w, height: h }, wb.scene), mat = new BABYLON.StandardMaterial('sign_' + text, wb.scene);
        mat.diffuseTexture = tex; mat.emissiveColor = new BABYLON.Color3(0.25, 0.25, 0.25); mat.specularColor = BABYLON.Color3.Black();
        m.material = mat; m.isPickable = false;
        const p = this.W(x, z);
        m.position.set(p[0], y + h / 2, p[1]);
        m.freezeWorldMatrix();
        wb.meshes.push(m);
        return m;
    },

    // A MATA do morro: copas e palmeiras (sprites do campo, na altura do terreno), longe dos caminhos e das construções.
    _meshTrees(wb) {
        const kinds = ['jungle', 'jungle', 'juca', 'palm', 'jungle', 'banana', 'ipe', 'palm', 'fern'], base = PropSprites.FRAME / Config.art.ppu;
        const segs = [];
        const push = (P, w) => { for (let i = 0; i + 1 < P.length; i++) segs.push([P[i], P[i + 1], w]); };
        push(this.STAIRS, 3.2); push(this.UPPER, 3); push(this.WOOD, 2.6); push(this.TOPSTAIR, 3);
        segs.push([[this.LIFT.bridge[0][0], this.LIFT.bridge[0][1]], [this.LIFT.bridge[1][0], this.LIFT.bridge[1][1]], 2.4]);
        segs.push([[this.RAIL.x0, this.RAIL.z], [this.RAIL.x1, this.RAIL.z], 3.2]);
        const near = (x, z) => {
            for (const [a, b, w] of segs) {
                const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
                if (Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z) < w / 2 + 2.2) return true;
            }
            const T = this.TERRACE.rect, S = this.STATION_HI;
            if (x > T[0] - 2.5 && x < T[2] + 2.5 && z > T[1] - 2.5 && z < T[3] + 2.5) return true;
            if (x > S[0] - 2 && x < S[2] + 2 && z > S[1] - 3 && z < S[3] + 2) return true;
            if (Math.hypot(x - this.LIFT.x, z - this.LIFT.z) < 4.5) return true;
            return Math.hypot(x, z) < 17.5;
        };
        let n = 0;
        for (let gz = -this.R - 4; gz <= this.R + 4; gz += 3.3) for (let gx = -this.R - 4; gx <= this.R + 4; gx += 3.3) {
            const x = gx + (Pixel.hash(gx * 3 | 0, gz * 3 | 0, 811) - 0.5) * 2.6, z = gz + (Pixel.hash(gx * 3 | 0, gz * 3 | 0, 812) - 0.5) * 2.6;
            const r = Math.hypot(x, z);
            if (r > this._rim(Math.atan2(z, x)) - 1 || near(x, z)) continue;
            const kind = kinds[Math.floor(Pixel.hash(gx * 7 | 0, gz * 7 | 0, 813) * kinds.length)], s = 0.95 + Pixel.hash(gx | 0, gz | 0, 814) * 0.45;
            const fr = wb.props.pick(kind, Pixel.hash(gx * 5 | 0, gz * 5 | 0, 815)), w = this.W(x, z), high = PropSprites.HEIGHT[kind] > 2;
            wb._spriteQuad(wb._batch(high ? 'veg_hi' : 'veg_lo', w[0], w[1]), fr.index, fr.row, w[0], w[1], base * s, this.hm(x, z) + PropSprites.HEIGHT[kind]);
            n++;
        }
        this.trees = n;
    },

    // ---------------------------------------------------------------- mapa
    drawMap(ctx, X, Y, k, vis) {
        if (!this.built) return;
        const C = this.C, R = this.R + 4;
        if (!vis(C.x - R, C.z - 85, C.x + 72, C.z + R)) return;
        const P = (x, z) => [X(C.x + x), Y(C.z + z)];
        const rect = (x0, z0, x1, z1, col) => { const a = P(x0, z1), b = P(x1, z0); ctx.fillStyle = col; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); };
        const line = (pts, w, col, cap = 'butt') => { ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, w * k); ctx.lineCap = cap; ctx.lineJoin = 'round'; ctx.beginPath(); pts.forEach((p, i) => { const q = P(p[0], p[1]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.stroke(); };
        // a praça do portão, as escadarias (concreto), a passarela (madeira), o terraço e o café
        rect(...this.PLAZA, '#cfc8b8');
        for (const [pts, w] of [[this.STAIRS, 3.2], [this.UPPER, 3], [this.TOPSTAIR, 3]]) { line(pts, w + 0.8, '#7d786f'); line(pts, w, '#dcd6ca'); }
        line(this.WOOD, 3.2, '#5e3f25'); line(this.WOOD, 2.6, '#a8774a');
        const T = this.TERRACE.rect;
        rect(T[0] - 0.4, T[1] - 0.4, T[2] + 0.4, T[3] + 0.4, '#7d786f'); rect(...T, '#d6d0c4'); rect(18, -38.6, 24.6, -34.6, '#2fa596');
        line(this.LIFT.bridge, 2.4, '#9ca0a6');
        const L = this.LIFT; rect(L.x - L.s, L.z - L.s, L.x + L.s, L.z + L.s, '#9fc6d6'); rect(L.x - L.s * 0.55, L.z - L.s * 0.55, L.x + L.s * 0.55, L.z + L.s * 0.55, '#5c6670');
        // os trilhos (com os dormentes de perto), as estações e o trem
        line([[this.RAIL.x0, this.RAIL.z], [this.RAIL.x1, this.RAIL.z]], 2.6, '#8e887e');
        if (k >= 1.5) { ctx.save(); ctx.setLineDash([Math.max(1, 0.25 * k), Math.max(1, 0.65 * k)]); line([[this.RAIL.x0, this.RAIL.z], [this.RAIL.x1, this.RAIL.z]], 2.0, '#6b4a30'); ctx.restore(); }
        line([[this.RAIL.x0, this.RAIL.z - 0.7], [this.RAIL.x1, this.RAIL.z - 0.7]], 0.2, '#3b3f46'); line([[this.RAIL.x0, this.RAIL.z + 0.7], [this.RAIL.x1, this.RAIL.z + 0.7]], 0.2, '#3b3f46');
        for (const S of [this.STATION_LO, this.STATION_HI]) rect(S[0] - 0.4, S[1] - 1.8, S[2] + 0.4, S[3] + 0.4, '#9a3b2c');
        if (this.train) for (let i = 0; i < 2; i++) { const x = this.RAIL.x0 - (this.train.u + 3 + i * 5.6); rect(x - 2.6, this.RAIL.z - 1.2, x + 2.6, this.RAIL.z + 1.2, '#e39a2d'); }
        // o mirante e o Cristo (de cima: a cruz)
        const c0 = P(0, 0);
        ctx.fillStyle = '#7d786f'; ctx.beginPath(); ctx.arc(c0[0], c0[1], 15.6 * k, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e4ddcf'; ctx.beginPath(); ctx.arc(c0[0], c0[1], 15 * k, 0, Math.PI * 2); ctx.fill();
        const A = 12.1 * this.K, T2 = 2 * this.K, T1 = 1.45 * this.K;
        ctx.save(); ctx.globalAlpha = 0.3; ctx.translate(2.2 * k, 2.2 * k); rect(-A, -0.75, A, 0.75, '#000'); rect(-T2, -T1, T2, T1, '#000'); ctx.restore();
        rect(-3.15, -3.15, 3.15, 3.15, '#55555a'); rect(-A, -0.7, A, 0.7, '#f3efe6'); rect(-T2, -T1, T2, T1, '#f3efe6');
        ctx.fillStyle = '#f3efe6'; ctx.beginPath(); ctx.arc(c0[0], c0[1], Math.max(1, 0.9 * k), 0, Math.PI * 2); ctx.fill();
        // o portão
        rect(-12.6, -65, -3.4, -63, '#77726b'); rect(-17.3, -67.9, -12.7, -64.1, '#77726b');
    },
};
