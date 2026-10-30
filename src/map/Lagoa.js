// ============================================================================
// Lagoa — a LAGOA a oeste do Centro, como a Rodrigo de Freitas: espelho d'água DOCE, parado, com a borda de ATERRO (mureta de pedra,
// sem praia), e em volta, de dentro para fora:
//   • a ORLA (parque): a pista de caminhada (bege) e a CICLOVIA (vermelha) colada nela, palmeiras na beira d'água, árvores, bancos e
//     postes, QUIOSQUES com guarda-sóis (Stands: vendem de verdade), carrinhos de AMBULANTE, DEQUES de madeira entrando na água (anda-se
//     neles: MapGeo.onDock) — no do leste ficam os PEDALINHOS de cisne; no do norte, os caiaques (Boat: barco sem motor, só na Lagoa);
//   • a AV. EPITÁCIO PESSOA dando a volta inteira (RoadPlan: via livre fechada), ligada à Rodovia da Lagoa, à Rodovia dos Lagos e à
//     cidade (RuralRoads, ids LG*);
//   • os PRÉDIOS DE LUXO (quarteirões de verdade do CityGrid: calçada, jardim, torres de 8 a 13 andares com fachada residencial de
//     varandas de vidro e PISCINA NA COBERTURA) — o metro quadrado mais caro da cidade (RealEstate: região "Lagoa"); um quarteirão vira
//     o parque com QUADRAS e parquinho, outro o CLUBE (piscina olímpica e sede).
// Gente: a pista é trilha de corrida (CityGrid.jogPaths: os corredores do NPCManager), CICLISTAS de verdade (TrafficCar bicicleta, com
// ciclista, rodando na ciclovia: LoopRoute) e movimento alto na orla (Landmarks.crowd).
// A água doce não tem onda nem espuma nem areia (WaterPlugin: máscara de lago; Waves.open: lago parado; MapPaint: verde-azulada).
//   R(a) / sd(x, z) / water(x, z, m) / zone(x, z, m)   a forma (a beira é uma curva lisa em volta de C)
//   ringPath()   (RuralRoads.plan) o eixo da avenida          build()   (Landmarks.build) quarteirões, orla, barracas, trilha
//   meshes(wb)   ciclovia, pista, mureta, deques, quiosques, quadras, piscinas      drawMap(...)   no mapa
//   update(dt, game)   os ciclistas (aparecem com a câmera perto)       boatSpots()   (BoatManager) pedalinhos e caiaques
// ============================================================================

const Lagoa = {
    C: { x: -402, z: -560 },
    RX: 64, RZ: 146,              // semieixos da beira (u)
    N: 240,                       // pontos da beira
    PARK: 18,                     // da água ao meio-fio da avenida: mureta, palmeiras, pista (3,5–6,5), ciclovia (7–10), árvores e quiosques
    AVE: 16,                      // largura da avenida
    DEPTH: 30,                    // profundidade dos quarteirões de prédios
    SW: 4,                        // calçada dos quarteirões
    PISTA: [3.5, 6.5], CICLO: [7, 10],
    built: false, blocks: [], park: [], decks: [], courts: [], kiosks: [], bikes: [],

    // ---------------------------------------------------------------- a forma
    // Raio da beira na direção a (rad a partir de C, anti-horário de +X para +Z): elipse com dois bojos largos e suaves (aterro).
    R(a) {
        const c = Math.cos(a), s = Math.sin(a), e = 1 / Math.sqrt((c / this.RX) ** 2 + (s / this.RZ) ** 2);
        return e * (1 + 0.05 * Math.sin(2 * a + 0.7) + 0.035 * Math.cos(3 * a - 1.2));
    },
    get RING() { return this.PARK + this.AVE / 2; },
    get OUT() { return this.PARK + this.AVE + this.DEPTH + 4; },
    OUT2: 40,                     // a segunda fileira de prédios (onde couber): o terreno plano e a grama vão até OUT + OUT2
    // Distância com sinal até a beira (+ fora, − na água): radial corrigida pela inclinação da curva (boa perto dela).
    sd(x, z) {
        const dx = x - this.C.x, dz = z - this.C.z, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx), R = this.R(a), dR = (this.R(a + 0.01) - this.R(a - 0.01)) / 0.02;
        return (r - R) * R / Math.sqrt(R * R + dR * dR);
    },
    _box(m) { const B = Math.max(this.RX, this.RZ) * 1.12 + m; return [this.C.x - B, this.C.z - B, this.C.x + B, this.C.z + B]; },
    water(x, z, m = 0) { return Math.abs(x - this.C.x) < this.RX * 1.15 + m && Math.abs(z - this.C.z) < this.RZ * 1.15 + m && this.sd(x, z) < m; },
    // Dentro do complexo (água, orla, avenida e quarteirões), com folga m.
    zone(x, z, m = 0) { const O = this.OUT + m; return Math.abs(x - this.C.x) < this.RX * 1.15 + O && Math.abs(z - this.C.z) < this.RZ * 1.15 + O && this.sd(x, z) < O; },
    // O ponto é da Lagoa (zona ou um quarteirão dela, com folga m): nada de mato, fazenda ou casinha em cima.
    covers(x, z, m = 0) {
        if (this.zone(x, z, m)) return true;
        if (!this.built || !this.zone(x, z, this.OUT2 + m)) return false;
        return this.blocks.concat(this.park).some((b) => x > b.slab[0] - m && x < b.slab[2] + m && z > b.slab[1] - m && z < b.slab[3] + m);
    },

    // A beira (anti-horário) com as normais para fora; off(d) = a curva a d u da beira.
    _shore() {
        if (this._S) return this._S;
        const N = this.N, P = [];
        for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2, R = this.R(a); P.push({ a, x: this.C.x + Math.cos(a) * R, z: this.C.z + Math.sin(a) * R }); }
        for (let i = 0; i < N; i++) {
            const p = P[(i + N - 1) % N], q = P[(i + 1) % N], l = Math.hypot(q.x - p.x, q.z - p.z) || 1;
            P[i].nx = (q.z - p.z) / l; P[i].nz = -(q.x - p.x) / l;
        }
        return (this._S = P);
    },
    off(d) { return this._shore().map((p) => [p.x + p.nx * d, p.z + p.nz * d]); },
    at(i, d) {                                                                     // (i fracionário: entre dois pontos da beira)
        const S = this._shore(), N = this.N, f = Math.floor(i), t = i - f, p = S[((f % N) + N) % N], q = S[(((f + 1) % N) + N) % N];
        const x = p.x + (q.x - p.x) * t, z = p.z + (q.z - p.z) * t, nx = p.nx + (q.nx - p.nx) * t, nz = p.nz + (q.nz - p.nz) * t, l = Math.hypot(nx, nz) || 1;
        return [x + nx / l * d, z + nz / l * d];
    },
    // Índice da beira mais perto da direção de (x, z).
    idxOf(x, z) { const a = Math.atan2(z - this.C.z, x - this.C.x); return Math.round(((a / (Math.PI * 2)) % 1 + 1) % 1 * this.N) % this.N; },
    // O eixo da Av. Epitácio Pessoa: laço fechado (o primeiro ponto repetido no fim), a cada ~6 u.
    ringPath() {
        const P = this.off(this.RING);
        return typeof RuralRoads !== 'undefined' ? RuralRoads._resample(P.concat([P[0]]), 6) : P.concat([P[0]]);
    },
    // Laço (para trilha e ciclovia): { pts, cum, len } fechado, a d u da beira.
    loop(d) {
        const P = this.off(d); P.push(P[0].slice());
        const cum = [0];
        for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
        return { pts: P, cum, len: cum[cum.length - 1] };
    },
    loopAt(L, s, out = {}) {
        s = ((s % L.len) + L.len) % L.len;
        let lo = 0, hi = L.cum.length - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L.cum[m] <= s) lo = m; else hi = m; }
        const a = L.pts[lo], b = L.pts[hi], t = (s - L.cum[lo]) / ((L.cum[hi] - L.cum[lo]) || 1), dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
        out.x = a[0] + dx * t; out.z = a[1] + dz * t; out.tx = dx / l; out.tz = dz / l;
        return out;
    },

    // ---------------------------------------------------------------- lugares (CityGrid.finish, via Landmarks.build)
    build() {
        if (this.built) return;
        this.built = true;
        const t0 = performance.now(), rng = Pixel.rng(1985);
        this._decks();
        this._park(rng);
        this._buildings(rng);
        this._stands();
        const track = this.loop((this.PISTA[0] + this.PISTA[1]) / 2);
        if (CityGrid.jogPaths) CityGrid.jogPaths.push({ pts: track.pts, cum: track.cum, len: track.len, lagoa: true });       // os corredores (NPCManager 'jog')
        CityGrid._bh = null;                                                         // (o índice de quarteirões por ponto: refeito com os da Lagoa)
        CityGrid.addPoi({ type: 'lagoa', name: 'Lagoa — orla, ciclovia, quiosques e pedalinhos', x: this.at(0, 6)[0], z: this.at(0, 6)[1] });
        console.log(`[LAGOA] ${this.blocks.length} quarteirões (${this.blocks.reduce((s, b) => s + b.lots.length, 0)} prédios), ${this.kiosks.length} quiosques, ${this.decks.length} deques em ${(performance.now() - t0).toFixed(0)} ms`);
    },
    _blk(id, poly, foot, o) {
        const box = (P) => P.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [1e9, 1e9, -1e9, -1e9]);
        const b = Object.assign({ id: 'lagoa:' + id, district: 'lagoa', i: 9500 + CityGrid.blocks.length, j: 9500, open: false, ground: 'grass', sw: this.SW, r: 0, slab: poly ? box(poly) : null, foot: poly ? box(foot || poly) : null, lots: [], props: [], fences: [], pieces: [] }, o);
        if (poly) b.poly = poly;
        if (foot) b.footPoly = foot;
        CityGrid.blocks.push(b);
        return b;
    },
    _ccw(P) { return CityGrid._polyArea(P) < 0 ? P.slice().reverse() : P; },

    // A ORLA: duas metades (a costura fica nos deques do norte e do sul), de chão de grama; palmeiras, árvores, bancos e postes.
    _park(rng) {
        const N = this.N, S = this._shore(), Pk = this.off(this.PARK), halves = [[N / 4, (3 * N) / 4], [(3 * N) / 4, N + N / 4]];
        halves.forEach(([i0, i1], h) => {
            const P = [];
            for (let i = i0; i <= i1; i++) { const p = S[i % N]; P.push([p.x, p.z]); }
            for (let i = i1; i >= i0; i--) P.push(Pk[i % N].slice());
            const b = this._blk('orla' + h, this._ccw(P), null, { open: true, biome: 'park', sw: 0 });
            this.park.push(b);
        });
        // palmeiras na beira (a cada ~11 u), árvores do lado da avenida (a cada ~9 u), bancos e postes na pista
        const prop = (kind, i, d, s) => { const p = this.at(i, d), b = this._parkAt(i); if (b) b.props.push({ type: 'tree', kind, x: p[0], z: p[1], s, seed: Math.floor(rng() * 1000) }); };
        for (let i = 0; i < N; i += 3) if (!this._nearDeck(i, 4)) prop('palm', i + rng() * 0.6, 1.6, 0.95 + rng() * 0.25);
        for (let i = 1; i < N; i += 2) { if (this._nearDeck(i, 3)) continue; prop(rng() < 0.35 ? 'palm' : rng() < 0.5 ? 'ipe' : 'oak', i + rng(), 12.5 + rng() * 3.5, 0.85 + rng() * 0.3); }
        for (let i = 2; i < N; i += 7) {
            const b = this._parkAt(i); if (!b || this._nearDeck(i, 4)) continue;
            const p = this.at(i, 2.7), q = this.at(i, 11), S0 = S[i % N], ax = Math.abs(S0.nz) > Math.abs(S0.nx);
            b.pieces.push({ kind: 'bench', x: p[0], z: p[1], alongX: ax }, { kind: 'lamp', x: q[0], z: q[1], style: 'iron' });
        }
    },
    _parkAt(i) { i = ((Math.round(i) % this.N) + this.N) % this.N; return this.park[i >= this.N / 4 && i < (3 * this.N) / 4 ? 0 : 1]; },

    // Os PRÉDIOS: quarteirões QUADRADOS alinhados (os prédios do jogo são caixas alinhadas), um a cada ~34 u em volta, encaixados entre
    // a avenida e o limite de fora (tamanho 28, 24 ou 20, um pouco para dentro ou para fora) — calçada em volta, jardim e a torre,
    // encostada na calçada do lado da Lagoa (a porta: imóveis). O quarteirão mais a oeste vira o parque das QUADRAS; o mais a sudeste, o CLUBE.
    _buildings(rng) {
        const dIn = this.PARK + this.AVE + 1.5, dOut = dIn + this.DEPTH + 2, cands = [];
        // duas fileiras: a da frente (de frente para a Lagoa) e, onde couber, a de trás (deslocada meio passo)
        for (const [row, a, b, step] of [[0, dIn, dOut, 34], [1, dOut + 5, dOut + 37, 36]]) {
        const L = this.loop((a + b) / 2), n = Math.floor(L.len / step);
        for (let k = 0; k < n; k++) {
            const p = this.loopAt(L, k * step + step * (row ? 1 : 0.5)), nx = p.tz, nz = -p.tx;
            let rect = null;
            for (const S of [28, 24, 20]) {
                for (const sh of [0, -3, 3, -6, 6]) {
                    const cx = p.x + nx * sh, cz = p.z + nz * sh, R = [cx - S / 2, cz - S / 2, cx + S / 2, cz + S / 2];
                    if (cands.some((c) => R[0] < c.rect[2] + 5 && R[2] > c.rect[0] - 5 && R[1] < c.rect[3] + 5 && R[3] > c.rect[1] - 5)) continue;
                    if (this._rectOk(R, a, b)) { rect = R; break; }
                }
                if (rect) break;
            }
            if (rect) cands.push({ k: row * 100 + k, row, rect, a: Math.atan2((rect[1] + rect[3]) / 2 - this.C.z, (rect[0] + rect[2]) / 2 - this.C.x) });
        }
        }
        const ang = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))), big = (c) => c.rect[2] - c.rect[0] >= 24 && !c.row;
        const sport = cands.filter(big).sort((p, q) => ang(p.a, Math.PI) - ang(q.a, Math.PI))[0], club = cands.filter((c) => c !== sport && big(c)).sort((p, q) => ang(p.a, -0.55) - ang(q.a, -0.55))[0];
        for (const c of cands) {
            const R = c.rect, F = [R[0] + this.SW, R[1] + this.SW, R[2] - this.SW, R[3] - this.SW];
            if (c === sport) { this._sport(R); continue; }
            const b = this._blk('predios' + c.k, null, null, { biome: 'lagoa', slab: R.slice(), foot: F });
            this.blocks.push(b);
            if (c === club) { this._club(b); continue; }
            // a torre: encostada na calçada do lado da Lagoa (a frente), jardim nos outros lados
            const W = F[2] - F[0], T = Math.max(8, W - 4), ccx = (F[0] + F[2]) / 2, ccz = (F[1] + F[3]) / 2, dx = this.C.x - ccx, dz = this.C.z - ccz;
            let x0 = ccx - T / 2, z0 = ccz - T / 2;
            if (Math.abs(dx) > Math.abs(dz)) x0 = dx < 0 ? F[0] : F[2] - T; else z0 = dz < 0 ? F[1] : F[3] - T;
            x0 = Math.round(x0); z0 = Math.round(z0);
            const S = CityGrid.LOTS.lagoa[0], fl = S.fl[0] + Math.floor(rng() * (S.fl[1] - S.fl[0] + 1));
            CityGrid._addLot(b, x0, z0, x0 + T, z0 + T, fl, S.fac[Math.floor(rng() * S.fac.length)], S.roof[Math.floor(rng() * S.roof.length)]);
            const l = b.lots[b.lots.length - 1];
            CityGrid._gridInsert(l.obs); l.lagoa = true; l.pool = T >= 10 && rng() < 0.8;
            for (const [qx, qz] of [[F[0] + 1.5, F[1] + 1.5], [F[2] - 1.5, F[1] + 1.5], [F[0] + 1.5, F[3] - 1.5], [F[2] - 1.5, F[3] - 1.5]]) {      // jardim nos cantos livres
                if (qx > l.x0 - 1.5 && qx < l.x1 + 1.5 && qz > l.z0 - 1.5 && qz < l.z1 + 1.5) continue;
                b.props.push({ type: 'tree', kind: rng() < 0.5 ? 'palm' : 'bush', x: qx, z: qz, s: 0.75 + rng() * 0.2, seed: Math.floor(rng() * 1000) });
            }
        }
    },
    // O quadrado cabe: entre a avenida e o limite de fora (sd), sem via, água, quarteirão da cidade ou sólido por baixo.
    _rectOk(R, dIn, dOut) {
        for (let z = R[1]; z <= R[3] + 0.01; z += 2.5) for (let x = R[0]; x <= R[2] + 0.01; x += 2.5) {
            const d = this.sd(x, z);
            if (d < dIn || d > dOut) return false;
            if (RoadPlan.onPavement(x, z, 2.5) || !WorldMap.isLand(x, z)) return false;
            const b = CityGrid._blockAtPoint(x, z);
            if (b && b.district !== 'lagoa') return false;
            if (CityGrid.obstaclesAround(x, z, 1).some((o) => o.x0 < x + 1 && o.x1 > x - 1 && o.z0 < z + 1 && o.z1 > z - 1)) return false;
        }
        return true;
    },
    // As QUADRAS e o PARQUINHO (parque aberto): quadra de futsal, de basquete e o parquinho de areia com brinquedos.
    _sport(R) {
        const b = this._blk('quadras', null, null, { open: true, biome: 'park', sw: 0, slab: R.slice(), foot: R.slice() });
        this.park.push(b);
        const [x0, z0, x1, z1] = R, g = (x1 - x0 - 24) / 2;
        if (g < 0) return;
        this.courts.push({ x0: x0 + 2 + g, z0: z0 + 2 + g, x1: x0 + 20 + g, z1: z0 + 11 + g, kind: 'futsal' }, { x0: x0 + 2 + g, z0: z0 + 13 + g, x1: x0 + 12 + g, z1: z0 + 22 + g, kind: 'basket' },
            { x0: x0 + 14 + g, z0: z0 + 13 + g, x1: x0 + 22 + g, z1: z0 + 22 + g, kind: 'play' });
        CityGrid.addPoi({ type: 'quadra', name: 'Quadras e parquinho da Lagoa', x: (x0 + x1) / 2, z: (z0 + z1) / 2 });
    },
    // O CLUBE: a sede de 2 andares num lado e a piscina com o deck no resto.
    _club(b) {
        const F = b.foot;
        CityGrid._addLot(b, Math.round(F[0]), Math.round(F[1]), Math.round(F[2]), Math.round(F[1] + 5), 2, 'lux2', 'conc1');
        const l = b.lots[b.lots.length - 1];
        CityGrid._gridInsert(l.obs); l.club = true;
        const px0 = F[0] + 2, pz0 = F[1] + 7, px1 = F[2] - 2, pz1 = F[3] - 1.5;
        if (px1 - px0 > 8 && pz1 - pz0 > 5) {
            b.pieces.push({ kind: 'deck', x0: px0 - 1.2, z0: pz0 - 1.2, x1: px1 + 1.2, z1: pz1 + 1.2, color: '#d8d2c4' }, { kind: 'pool', x0: px0, z0: pz0, x1: px1, z1: pz1 });
            CityGrid.addObstacles([{ x0: px0, z0: pz0, x1: px1, z1: pz1, h: 0.2, vault: true }]);
        }
        b.club = true;
        CityGrid.addPoi({ type: 'clube', name: 'Clube da Lagoa (piscina)', x: (F[0] + F[2]) / 2, z: (F[1] + F[3]) / 2 });
    },

    // DEQUES de madeira entrando na água (nos 4 pontos cardeais: retângulos alinhados), com a cabeça em T.
    _decks() {
        const N = this.N;
        for (const [i, dir] of [[0, [-1, 0]], [N / 4, [0, -1]], [N / 2, [1, 0]], [(3 * N) / 4, [0, 1]]]) {
            const p = this.at(i, 0.5), L = 15, w = 1.6, ex = p[0] + dir[0] * L, ez = p[1] + dir[1] * L;
            const r = dir[0] ? [Math.min(p[0], ex), p[1] - w, Math.max(p[0], ex), p[1] + w] : [p[0] - w, Math.min(p[1], ez), p[0] + w, Math.max(p[1], ez)];
            const head = dir[0] ? [ex - 2.5 * Math.sign(dir[0]) - 2.5, ez - 5, ex - 2.5 * Math.sign(dir[0]) + 2.5, ez + 5] : [ex - 5, ez - 2.5 * Math.sign(dir[1]) - 2.5, ex + 5, ez - 2.5 * Math.sign(dir[1]) + 2.5];
            this.decks.push({ i, dir, r, head, tip: [ex, ez] });
        }
    },
    _nearDeck(i, m) { return this.decks.some((d) => Math.abs(((i - d.i + this.N * 1.5) % this.N) - this.N / 2) < m); },
    onDeck(x, z) {
        if (!this.decks.length || Math.abs(x - this.C.x) > this.RX * 1.2 || Math.abs(z - this.C.z) > this.RZ * 1.2) return false;
        for (const d of this.decks) for (const R of [d.r, d.head]) if (x >= R[0] && x <= R[2] && z >= R[1] && z <= R[3]) return true;
        return false;
    },
    // Pedalinhos (cisne) dos dois lados do deque do leste; caiaques no do norte (BoatManager.spawn).
    boatSpots() {
        if (!this.decks.length) return [];
        const out = [], E = this.decks[0], Nn = this.decks[1];
        for (let k = 0; k < 3; k++) for (const s of [-1, 1]) out.push({ kind: 'pedalinho', x: E.r[0] + 7 + k * 3.4, z: (E.r[1] + E.r[3]) / 2 + s * 3.4, h: -Math.PI / 2 });
        for (let k = 0; k < 2; k++) out.push({ kind: 'caiaque', x: (Nn.r[0] + Nn.r[2]) / 2 + 3.2, z: Nn.r[1] + 3 + k * 4, h: Math.PI });
        out.push({ kind: 'caiaque', x: (Nn.r[0] + Nn.r[2]) / 2 - 3.2, z: Nn.r[1] + 5, h: Math.PI });
        return out;
    },

    // QUIOSQUES (entre a ciclovia e a avenida, com guarda-sóis e o quiosqueiro) e CARRINHOS de ambulante na pista.
    _stands() {
        if (typeof Stands === 'undefined') return;
        const N = this.N, rng = Pixel.rng(2025);
        for (let k = 0; k < 6; k++) {
            let i = Math.round((k + 0.5) * N / 6);
            while (this._nearDeck(i, 6)) i += 3;
            const p = this.at(i, 13.5), S = this._shore()[i % N], b = this._parkAt(i), side = [S.nz, -S.nx];
            this.kiosks.push({ x: p[0], z: p[1], c: ['#2e8b57', '#d9482b', '#1f6fb5', '#e8a33a', '#7a4ea3', '#2a9d8f'][k] });
            CityGrid.addObstacles([{ x0: p[0] - 1.6, z0: p[1] - 1.6, x1: p[0] + 1.6, z1: p[1] + 1.6, h: 2.6 }]);
            Stands.add({ id: 'lagoa_quiosque' + k, name: 'Quiosque da Lagoa', emo: '🥥', x: p[0], z: p[1], r: 3.8, hours: [7, 24], items: Stands.MENUS.lagoa || Stands.MENUS.kiosk, sub: 'Água de coco, açaí e chope na beira da Lagoa',
                vendor: { x: p[0] + side[0] * 2.4, z: p[1] + side[1] * 2.4, h: Math.atan2(-S.nx, -S.nz), type: 'civil_ambulante' } });
            if (b) for (let t = 0; t < 4; t++) { const q = this.at(i + (t < 2 ? -2.2 : 2.2), t % 2 ? 15.5 : 11.5); b.props.push({ type: 'prop', kind: 'umbrella', x: q[0] + (rng() - 0.5), z: q[1] + (rng() - 0.5), s: 0.72, seed: Math.floor(rng() * 1000) }); }
        }
        for (let k = 0; k < 4; k++) {
            const i = Math.round((k + 0.15) * N / 4 + 9), p = this.at(i, this.PISTA[0] - 1.2), S = this._shore()[i % N];
            Stands.add({ id: 'lagoa_ambulante' + k, name: 'Ambulante da Lagoa', emo: '🛒', x: p[0], z: p[1], r: 2.8, hours: [7, 20], items: Stands.MENUS.ambulante || Stands.MENUS.kiosk, sub: 'Mate gelado, biscoito e picolé!',
                cart: true, vendor: { x: p[0] - S.nx * 0.9, z: p[1] - S.nz * 0.9, h: Math.atan2(S.nx, S.nz), type: 'civil_ambulante' } });
        }
    },

    // ---------------------------------------------------------------- gente (Landmarks.crowd / crowdStyle)
    crowd(x, z) {
        if (!this.built || !this.zone(x, z)) return null;
        const d = this.sd(x, z);
        if (d < 0) return null;
        return d < this.PARK ? 1 : 0.85;
    },
    crowdStyle(x, z, r) {
        if (!this.built || !this.zone(x, z) || this.sd(x, z) < 0) return null;
        return r < 0.4 ? 'sport' : r < 0.6 ? 'biz' : r < 0.75 ? 'tourist' : 'casual';
    },

    // ---------------------------------------------------------------- ciclistas (Game, a cada quadro)
    // Bicicletas de VERDADE (TrafficCar com ciclista) rodando na ciclovia, nos dois sentidos: aparecem com a câmera a 240 u e somem a
    // 340 u. Derrubou o ciclista ou pegou a bicicleta: vira veículo comum.
    BIKES: 8,
    update(dt, game) {
        if (!this.built || !game.vehicleManager || !game.traffic || !game.sprites || typeof Bikes === 'undefined') return;
        this._t = (this._t || 0) - dt;
        if (this._t > 0) return;
        this._t = 0.5;
        const f = game.camera.target, r = Math.hypot(f.x - this.C.x, f.z - this.C.z) - Math.max(this.RX, this.RZ), V = game.vehicleManager.vehicles;
        this.bikes = this.bikes.filter((b) => {
            if (b._gone || !V.includes(b)) return false;
            if (b.controlled || b.mode !== 'drive' || !b.route || !b.route.lagoa) { b.keep = false; b.lagoa = null; return false; }      // (largou a ciclovia)
            return true;
        });
        if (r < 240 && !this.bikesOn && !Interiors.active) this._spawnBikes(game);
        else if (r > 340 && this.bikesOn) {
            this.bikesOn = false;
            for (const b of this.bikes) if (!b.controlled && !b.hold) Garage.despawn(game, b); else { b.keep = false; b.lagoa = null; }
            this.bikes = [];
        }
    },
    _routeClass() {
        if (this._RC) return this._RC;
        const L = this;
        // Rota em laço: a ciclovia inteira, sem cruzamentos; vai se estendendo à frente (ensure) e o que passou é descartado (trim).
        return (this._RC = class LoopRoute extends Route {
            constructor(loop, s, dir) {
                const p = L.loopAt(loop, s);
                super(p.x, p.z, { dx: p.tx * dir, dz: p.tz * dir });
                this.loop = loop; this.s = s; this.dir = dir; this.lagoa = true;
                this.ensure();
            }
            ensure() { const q = {}; while (this.length - this.cum[Math.min(this.seg, this.cum.length - 1)] < 90) { this.s += 3 * this.dir; L.loopAt(this.loop, this.s, q); this._push(q); } }
            extend() { this.ensure(); return true; }
        });
    },
    _spawnBikes(game) {
        this.bikesOn = true;
        const RC = this._routeClass(), civ = game.traffic.sprites ? game.traffic.sprites.civilianVariants : 8;
        const lanes = [this.loop(this.CICLO[0] + 0.8), this.loop(this.CICLO[1] - 0.8)];
        for (let k = 0; k < this.BIKES; k++) {
            const dir = k % 2 ? -1 : 1, loop = lanes[k % 2], s = (k / this.BIKES) * loop.len + Math.random() * 20, p = this.loopAt(loop, s);
            const id = game.traffic._nextId++;
            const bike = new TrafficCar(game.scene, game.physics, { x: p.x, z: p.z }, id, Bikes.sheet(game.sprites, 'bicycle', 'ride', 'rider'), 4, Math.atan2(p.tx * dir, p.tz * dir), game.traffic);
            bike.baseMode = 'drive'; bike.frameVariant = 2 + (id * 5) % civ; bike.setRider(2 + (id * 7) % civ);
            if (game.gameEngine.shadowGenerator) game.gameEngine.shadowGenerator.addShadowCaster(bike.body);
            game.vehicleManager.vehicles.push(bike);
            bike.mode = 'drive'; bike.route = new RC(loop, s, dir); bike.keep = true; bike.lagoa = true;
            this.bikes.push(bike);
        }
    },

    // ---------------------------------------------------------------- geometria
    meshes(wb) {
        if (!this.built) return;
        const t0 = performance.now(), c = (h, k) => Landmarks._c(h, k), N = this.N, h0 = Config.city.curbHeight + 0.012, z3 = [[0, 0], [0, 0], [0, 0]], up = [0, 1, 0];
        // faixas ao longo da beira (de d0 a d1), cor por segmento
        const band = (d0, d1, y, colFn, step = 1) => {
            const A = this.off(d0), B = this.off(d1);
            for (let i = 0; i < N; i += step) {
                const j = (i + step) % N, bt = wb._batch('trim', A[i][0], A[i][1]), col = colFn(i);
                if (!col) continue;
                const a0 = [A[i][0], y, A[i][1]], a1 = [A[j][0], y, A[j][1]], b0 = [B[i][0], y, B[i][1]], b1 = [B[j][0], y, B[j][1]];
                bt.tri(a0, b1, a1, up, z3, col); bt.tri(a0, b0, b1, up, z3, col);
            }
        };
        const deckGap = (i) => this.decks.some((d) => Math.abs(((i - d.i + N * 1.5) % N) - N / 2) < 1.2);
        // a MURETA do aterro: pedra clara em cima, a face molhada para a água (vista de cima pela câmera inclinada)
        const S = this._shore();
        for (let i = 0; i < N; i++) {
            if (deckGap(i)) continue;
            const j = (i + 1) % N, p = S[i], q = S[j], bt = wb._batch('trim', p.x, p.z), top = c(i % 2 ? '#cfc8b8' : '#c6bfae'), face = c('#7d7a70');
            const o = (P, d, y) => [P.x + P.nx * d, y, P.z + P.nz * d];
            bt.tri(o(p, -0.35, 0.62), o(q, 0.6, 0.62), o(q, -0.35, 0.62), up, z3, top); bt.tri(o(p, -0.35, 0.62), o(p, 0.6, 0.62), o(q, 0.6, 0.62), up, z3, top);
            bt.tri(o(p, -0.35, -0.6), o(q, -0.35, 0.62), o(q, -0.35, -0.6), [-p.nx, 0, -p.nz], z3, face); bt.tri(o(p, -0.35, -0.6), o(p, -0.35, 0.62), o(q, -0.35, 0.62), [-p.nx, 0, -p.nz], z3, face);
        }
        // a pista de caminhada (bege, junta a cada ~6 u) e a ciclovia (vermelha, com a faixa tracejada no meio e as bordas brancas)
        band(this.PISTA[0], this.PISTA[1], h0, (i) => c(i % 3 === 0 ? '#cbbd9f' : '#d6c9ab'));
        band(this.CICLO[0], this.CICLO[1], h0, () => c('#b8473b'));
        band(this.CICLO[0], this.CICLO[0] + 0.15, h0 + 0.004, () => c('#f2f2ee'));
        band(this.CICLO[1] - 0.15, this.CICLO[1], h0 + 0.004, () => c('#f2f2ee'));
        const m = (this.CICLO[0] + this.CICLO[1]) / 2;
        band(m - 0.08, m + 0.08, h0 + 0.004, (i) => (i % 4 < 2 ? c('#f6f0d8') : null));
        // DEQUES de madeira (tábuas, pilares e o guarda-corpo da cabeça)
        for (const d of this.decks) {
            const bt = wb._batch('trim', d.r[0], d.r[1]), wood = c('#9a7448'), woodD = c('#6e5233');
            for (const R of [d.r, d.head]) {
                bt.solid(R[0], R[1], R[2], R[3], 0.3, 0.52, wood);
                const ax = R[2] - R[0] >= R[3] - R[1];
                if (ax) for (let x = R[0] + 0.7; x < R[2]; x += 0.7) bt.solid(x - 0.03, R[1], x + 0.03, R[3], 0.52, 0.53, woodD);
                else for (let z = R[1] + 0.7; z < R[3]; z += 0.7) bt.solid(R[0], z - 0.03, R[2], z + 0.03, 0.52, 0.53, woodD);
                for (let x = R[0] + 0.4; x < R[2]; x += 3) for (let z = R[1] + 0.4; z < R[3]; z += 3) bt.solid(x - 0.15, z - 0.15, x + 0.15, z + 0.15, -1.2, 0.3, woodD);
            }
            const H = d.head;
            for (const z of [H[1] + 0.12, H[3] - 0.12]) bt.solid(H[0], z - 0.06, H[2], z + 0.06, 0.52, 1.4, woodD);
        }
        // QUIOSQUES: balcão colorido, telhado e o toldo
        for (const k of this.kiosks) {
            const bt = wb._batch('trim', k.x, k.z), col = c(k.c);
            bt.solid(k.x - 1.6, k.z - 1.6, k.x + 1.6, k.z + 1.6, 0, 2.4, c('#f1ece0'));
            bt.solid(k.x - 1.65, k.z - 1.65, k.x + 1.65, k.z + 1.65, 0.9, 1.1, col);
            bt.solid(k.x - 2.3, k.z - 2.3, k.x + 2.3, k.z + 2.3, 2.4, 2.7, col);
            bt.solid(k.x - 1.2, k.z - 1.2, k.x + 1.2, k.z + 1.2, 2.7, 3.0, c('#f6f3ea'));
        }
        // QUADRAS (piso, linhas, traves/tabelas, alambrado) e o PARQUINHO
        for (const q of this.courts) {
            const bt = wb._batch('trim', q.x0, q.z0), y = h0 + 0.01, W = q.x1 - q.x0, H = q.z1 - q.z0, ax = W >= H, white = c('#f4f4f0');
            if (q.kind === 'play') {
                bt.solid(q.x0, q.z0, q.x1, q.z1, y - 0.01, y + 0.02, c('#e2cf98'));
                bt.solid(q.x0 + 1, q.z0 + 1, q.x0 + 3.5, q.z0 + 1.6, y, 2.2, c('#d9482b'));                   // escorregador
                bt.solid(q.x0 + 1, q.z0 + 1.6, q.x0 + 1.4, q.z0 + 4.2, y, 1.4, c('#e8a33a'));
                bt.solid(q.x1 - 4, q.z1 - 3, q.x1 - 1, q.z1 - 2.7, 2, 2.2, c('#1f6fb5'));                    // balanço
                for (const x of [q.x1 - 4, q.x1 - 1.2]) bt.solid(x, q.z1 - 3, x + 0.2, q.z1 - 2.7, y, 2.2, c('#1f6fb5'));
                bt.solid(q.x0 + 4.5, q.z1 - 4, q.x0 + 7, q.z1 - 1.5, y, 0.6, c('#2e8b57'));                   // gira-gira
                continue;
            }
            bt.solid(q.x0, q.z0, q.x1, q.z1, y - 0.01, y + 0.02, c(q.kind === 'basket' ? '#c46a3c' : '#3f8f6a'));
            const ln = (x0, z0, x1, z1) => bt.solid(x0, z0, x1, z1, y + 0.02, y + 0.03, white);
            ln(q.x0 + 0.5, q.z0 + 0.5, q.x1 - 0.5, q.z0 + 0.62); ln(q.x0 + 0.5, q.z1 - 0.62, q.x1 - 0.5, q.z1 - 0.5);
            ln(q.x0 + 0.5, q.z0 + 0.5, q.x0 + 0.62, q.z1 - 0.5); ln(q.x1 - 0.62, q.z0 + 0.5, q.x1 - 0.5, q.z1 - 0.5);
            if (ax) ln((q.x0 + q.x1) / 2 - 0.06, q.z0 + 0.5, (q.x0 + q.x1) / 2 + 0.06, q.z1 - 0.5); else ln(q.x0 + 0.5, (q.z0 + q.z1) / 2 - 0.06, q.x1 - 0.5, (q.z0 + q.z1) / 2 + 0.06);
            for (const s of [0, 1]) {                                                                      // traves (futsal) ou tabelas (basquete)
                const gx = ax ? (s ? q.x1 - 0.5 : q.x0 + 0.5) : (q.x0 + q.x1) / 2, gz = ax ? (q.z0 + q.z1) / 2 : (s ? q.z1 - 0.5 : q.z0 + 0.5);
                if (q.kind === 'futsal') { if (ax) { bt.solid(gx - 0.1, gz - 1.5, gx + 0.1, gz - 1.3, y, 2, white); bt.solid(gx - 0.1, gz + 1.3, gx + 0.1, gz + 1.5, y, 2, white); bt.solid(gx - 0.1, gz - 1.5, gx + 0.1, gz + 1.5, 1.85, 2.05, white); } else { bt.solid(gx - 1.5, gz - 0.1, gx - 1.3, gz + 0.1, y, 2, white); bt.solid(gx + 1.3, gz - 0.1, gx + 1.5, gz + 0.1, y, 2, white); bt.solid(gx - 1.5, gz - 0.1, gx + 1.5, gz + 0.1, 1.85, 2.05, white); } }
                else { bt.solid(gx - 0.12, gz - 0.12, gx + 0.12, gz + 0.12, y, 3.05, c('#3b3f46')); bt.solid(gx - (ax ? 0.05 : 0.9), gz - (ax ? 0.9 : 0.05), gx + (ax ? 0.05 : 0.9), gz + (ax ? 0.9 : 0.05), 2.6, 3.6, white); }
            }
            const fc = c('#5f6b72');                                                                         // alambrado
            for (const [x0, z0, x1, z1] of [[q.x0 - 0.3, q.z0 - 0.3, q.x1 + 0.3, q.z0 - 0.2], [q.x0 - 0.3, q.z1 + 0.2, q.x1 + 0.3, q.z1 + 0.3], [q.x0 - 0.3, q.z0 - 0.3, q.x0 - 0.2, q.z1 + 0.3], [q.x1 + 0.2, q.z0 - 0.3, q.x1 + 0.3, q.z1 + 0.3]]) bt.solid(x0, z0, x1, z1, y, 2.6, fc);
        }
        // PISCINAS NAS COBERTURAS (deck claro, a água, espreguiçadeiras e o guarda-corpo de vidro)
        for (const b of this.blocks) for (const l of b.lots) {
            if (!l.pool) continue;
            const bt = wb._batch('trim', l.x0, l.z0), y = l.height + 0.02, W = l.x1 - l.x0, D = l.z1 - l.z0, ax = W >= D;
            const pw = ax ? Math.min(9, W * 0.55) : Math.min(4, W * 0.4), pd = ax ? Math.min(4, D * 0.4) : Math.min(9, D * 0.55), cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2;
            bt.solid(l.x0 + 0.8, l.z0 + 0.8, l.x1 - 0.8, l.z1 - 0.8, y, y + 0.12, c('#d9d2c2'));
            bt.solid(cx - pw / 2 - 0.3, cz - pd / 2 - 0.3, cx + pw / 2 + 0.3, cz + pd / 2 + 0.3, y + 0.12, y + 0.22, c('#eeeae0'));
            bt.solid(cx - pw / 2, cz - pd / 2, cx + pw / 2, cz + pd / 2, y + 0.2, y + 0.24, c('#2fa7d6'));
            for (let s = 0; s < 3; s++) { const x = ax ? cx - pw / 2 + 1 + s * 2.4 : cx + pw / 2 + 1.2, z = ax ? cz + pd / 2 + 1.2 : cz - pd / 2 + 1 + s * 2.4; bt.solid(x - (ax ? 0.35 : 0.8), z - (ax ? 0.8 : 0.35), x + (ax ? 0.35 : 0.8), z + (ax ? 0.8 : 0.35), y + 0.12, y + 0.35, c('#f4f1ea')); }
            const gl = c('#a8d4e6');
            bt.solid(l.x0 + 0.1, l.z0 + 0.1, l.x1 - 0.1, l.z0 + 0.2, y, y + 1.1, gl); bt.solid(l.x0 + 0.1, l.z1 - 0.2, l.x1 - 0.1, l.z1 - 0.1, y, y + 1.1, gl);
            bt.solid(l.x0 + 0.1, l.z0 + 0.1, l.x0 + 0.2, l.z1 - 0.1, y, y + 1.1, gl); bt.solid(l.x1 - 0.2, l.z0 + 0.1, l.x1 - 0.1, l.z1 - 0.1, y, y + 1.1, gl);
        }
        // colisão: quiosques
        for (const k of this.kiosks) wb._collider('lagoa', k.x - 1.6, k.z - 1.6, k.x + 1.6, k.z + 1.6, 2.6);
        console.log(`[LAGOA] geometria em ${(performance.now() - t0).toFixed(0)} ms`);
    },

    // ---------------------------------------------------------------- mapa
    drawMap(ctx, X, Y, k, vis) {
        if (!this.built) return;
        const B = this._box(this.PARK + 4);
        if (!vis(B[0], B[1], B[2], B[3])) return;
        const path = (d, close = true) => { const P = this.off(d); ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); if (close) ctx.closePath(); };
        // a orla (grama do parque) e a mureta
        ctx.fillStyle = '#7fb069'; path(this.PARK); ctx.fill();
        ctx.fillStyle = '#3e7fa0'; path(0); ctx.fill();
        ctx.fillStyle = '#2f6f86'; path(-10); ctx.fill();
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#e4dccb'; ctx.lineWidth = Math.max(1, 0.9 * k); path(0.1); ctx.stroke();
        // a pista e a ciclovia
        ctx.strokeStyle = '#ddd0b2'; ctx.lineWidth = Math.max(1, (this.PISTA[1] - this.PISTA[0]) * k); path((this.PISTA[0] + this.PISTA[1]) / 2); ctx.stroke();
        ctx.strokeStyle = '#c9493c'; ctx.lineWidth = Math.max(1, (this.CICLO[1] - this.CICLO[0]) * k); path((this.CICLO[0] + this.CICLO[1]) / 2); ctx.stroke();
        // deques, quiosques e quadras
        ctx.fillStyle = '#9b7550';
        for (const d of this.decks) for (const R of [d.r, d.head]) ctx.fillRect(X(R[0]), Y(R[3]), (R[2] - R[0]) * k, (R[3] - R[1]) * k);
        for (const q of this.kiosks) { ctx.fillStyle = q.c; ctx.fillRect(X(q.x - 2), Y(q.z + 2), 4 * k, 4 * k); }
        for (const q of this.courts) { ctx.fillStyle = q.kind === 'play' ? '#e2cf98' : q.kind === 'basket' ? '#c46a3c' : '#3f8f6a'; ctx.fillRect(X(q.x0), Y(q.z1), (q.x1 - q.x0) * k, (q.z1 - q.z0) * k); }
        // as piscinas nas coberturas (de perto)
        if (k >= 1.2) for (const b of this.blocks) for (const l of b.lots) if (l.pool) { ctx.fillStyle = '#2fa7d6'; const cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2; ctx.fillRect(X(cx - 3), Y(cz + 1.5), 6 * k, 3 * k); }
    },
};
