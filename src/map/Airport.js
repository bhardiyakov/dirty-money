// ============================================================================
// Airport — o AEROPORTO DAS FAZENDAS: um aeródromo regional no meio da planície, entre a Estrada do Engenho e a Rodovia da Lagoa (a
// oeste do Colosso). A Rodovia do Meio e a Estrada da Favela terminam nas vias do entorno (map/RuralRoads.js: as estradas desviam do
// terreno) e o relevo é achatado (WorldMap.buildTerrain) — grama, nada de fazenda, sítio, plantação ou árvore em cima (Landmarks.covers).
//   PISTA 09/27   leste-oeste, 410 × 30 m, asfalto com as marcas de verdade: faixas de cabeceira ("piano"), números, eixo tracejado,
//                 zona de toque, bordas; LUZES de borda e de cabeceira (verdes/vermelhas) que acendem ao anoitecer.
//   TAXIWAY       paralela, com o eixo amarelo e três ligações com a pista; PÁTIO de concreto com 3 vagas de avião (os aviões do jogo:
//                 vehicle/Plane.js) na frente do TERMINAL (vidro, marquise e o letreiro); HANGAR aberto para o pátio; TORRE DE CONTROLE;
//                 tanques de combustível; BIRUTA no fim da pista; CERCA em volta, com o portão no estacionamento (pela Estrada das Fazendas).
//   O BALCÃO      na porta do terminal (E): paraquedas, salto de paraquedas e aluguel de avião (player/Parachute.js, vehicle/Plane.js).
//   covers(x, z, m)  terreno do aeroporto?     dist(x, z)  distância até ele (0 dentro)     build() / meshes(wb) / drawMap(...) / update(dt, g)
// ============================================================================

const Airport = {
    NAME: 'Aeroporto das Fazendas',
    // O terreno (dois retângulos: o corpo e a ponta oeste da pista, que passa ao norte da Estrada da Roça).
    AREAS: [[-872, 12, -555, 178], [-985, 40, -872, 178]],
    H0: 1.0,                                         // a altura do platô (m)
    RUNWAY: { x0: -975, x1: -565, z: 140, w: 30, name: ['09', '27'] },
    TAXI: { x0: -950, x1: -580, z: 104, w: 14, links: [-945, -760, -588] },
    APRON: [-830, 50, -606, 97],
    TERMINAL: [-760, 20, -680, 40, 8],
    HANGAR: [-872, 52, -836, 92, 11],
    TOWER: { x: -590, z: 70, r: 4, h: 22 },
    TANKS: [[-862, 28], [-848, 28]],
    PARK: [-852, 14, -770, 44],
    FORE: [-770, 2, -670, 19],                       // calçada/praça da porta do terminal (até a Estrada das Fazendas)
    GATE: [-742, -702],                               // o portão (x) na cerca sul
    SOCK: { x: -572, z: 164 },
    // Vagas no pátio: os aviões estacionados de frente para a taxiway (norte).
    SPOTS: [{ x: -800, z: 76, heading: 0, model: 'teco' }, { x: -742, z: 74, heading: 0, model: 'bimotor' }, { x: -672, z: 72, heading: 0, model: 'jato' }],
    DESK: { x: -720, z: 16 },
    TARGET: { x: -925, z: 78 },                       // o alvo do salto de paraquedas do aeroclube (a grama a oeste do hangar)
    built: false,
    solids: [],

    // ---------------------------------------------------------------- lugar
    // (EXTRA: a praça e o estacionamento, na frente do terminal — sem mato nem árvore; as estradas só desviam das AREAS: blocks)
    EXTRA: [[-860, -4, -660, 20]],
    covers(x, z, m = 0) { if (this.blocks(x, z, m)) return true; for (const A of this.EXTRA) if (x > A[0] - m && x < A[2] + m && z > A[1] - m && z < A[3] + m) return true; return false; },
    blocks(x, z, m = 0) { for (const A of this.AREAS) if (x > A[0] - m && x < A[2] + m && z > A[1] - m && z < A[3] + m) return true; return false; },
    // Pedestres (Navigation): o lado de dentro da cerca é só do jogador — o estacionamento e a praça do terminal continuam andáveis.
    navBlock(fill) {
        for (const A of this.AREAS) fill(A[0], A[1], A[2], A[3], 0);
        const P = this.PARK, F = this.FORE, T = this.TERMINAL;
        fill(P[0] + 0.5, P[1], P[2], P[3] + 1, 1);
        fill(T[0], F[1], F[2] - 0.5, T[1] - 0.5, 1);
    },
    dist(x, z) {
        let d = Infinity;
        for (const A of this.AREAS) d = Math.min(d, Math.hypot(Math.max(A[0] - x, 0, x - A[2]), Math.max(A[1] - z, 0, z - A[3])));
        return d;
    },
    // Na pista (com folga lateral)?
    onRunway(x, z, m = 0) { const R = this.RUNWAY; return x > R.x0 - m && x < R.x1 + m && Math.abs(z - R.z) < R.w / 2 + m; },
    // Chão asfaltado/concreto onde o avião rola sem estragar o trem de pouso (pista, taxiway, ligações, pátio).
    paved(x, z) {
        if (this.onRunway(x, z, 2)) return true;
        const T = this.TAXI;
        if (x > T.x0 - 4 && x < T.x1 + 4 && Math.abs(z - T.z) < T.w / 2 + 2) return true;
        for (const lx of T.links) if (Math.abs(x - lx) < 9 && z > T.z && z < this.RUNWAY.z) return true;
        const A = this.APRON;
        return x > A[0] - 2 && x < A[2] + 2 && z > A[1] - 2 && z < A[3] + 2;
    },
    ground() { return typeof Relief !== 'undefined' ? Relief.at(-720, 100) : 0; },

    build() {
        if (this.built) return;
        this.built = true;
        const O = this.solids = [], T = this.TERMINAL, H = this.HANGAR, W = this.TOWER;
        O.push({ x0: T[0], z0: T[1], x1: T[2], z1: T[3], h: T[4] });
        // o hangar: três paredes (aberto para o pátio, a leste)
        O.push({ x0: H[0], z0: H[1], x1: H[0] + 0.6, z1: H[3], h: H[4] }, { x0: H[0], z0: H[1], x1: H[2], z1: H[1] + 0.6, h: H[4] }, { x0: H[0], z0: H[3] - 0.6, x1: H[2], z1: H[3], h: H[4] });
        O.push({ x0: W.x - W.r, z0: W.z - W.r, x1: W.x + W.r, z1: W.z + W.r, h: W.h + 5 });
        for (const [x, z] of this.TANKS) O.push({ x0: x - 4, z0: z - 4, x1: x + 4, z1: z + 4, h: 6 });
        // a cerca (com o portão do estacionamento)
        for (const [a, b] of this._fenceSegs()) {
            const t = 0.15;
            O.push({ x0: Math.min(a[0], b[0]) - t, z0: Math.min(a[1], b[1]) - t, x1: Math.max(a[0], b[0]) + t, z1: Math.max(a[1], b[1]) + t, h: 2.2, fence: true });
        }
        CityGrid.addObstacles(O);
        WorldMap.regions.push({ name: 'AEROPORTO', x: -760, z: 168, size: 0.75 });
        CityGrid.addPoi({ type: 'aeroporto', name: `${this.NAME} (aviões, salto de paraquedas)`, x: this.DESK.x, z: this.DESK.z - 3 });
        console.log(`[AEROPORTO] pista ${this.RUNWAY.x1 - this.RUNWAY.x0} m, ${O.length} sólidos`);
    },
    // A cerca: o contorno dos dois retângulos, com o vão do portão na frente do terminal.
    _fenceSegs() {
        const [A, B] = this.AREAS, G = this.GATE;
        const poly = [[A[0], A[1]], [A[2], A[1]], [A[2], A[3]], [B[0], B[3]], [B[0], B[1]], [A[0], B[1]], [A[0], A[1]]];
        const segs = [];
        for (let i = 0; i + 1 < poly.length; i++) {
            const a = poly[i], b = poly[i + 1];
            if (a[1] === b[1] && a[1] === A[1]) {                                // (a cerca sul: o portão e a praça do terminal ficam abertos)
                const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
                if (x0 < G[0]) segs.push([[x0, a[1]], [Math.min(x1, this.PARK[0] - 1), a[1]]]);
                if (x1 > this.FORE[2]) segs.push([[this.FORE[2], a[1]], [x1, a[1]]]);
                continue;
            }
            segs.push([a, b]);
        }
        // o estacionamento e a praça ficam do lado de fora: a cerca passa atrás deles (entre eles e o pátio)
        // (a leste do terminal, entre ele e a cerca da praça, fica o PORTÃO DE EMBARQUE: o caminho a pé até os aviões)
        segs.push([[this.PARK[0] - 1, this.PARK[1]], [this.PARK[0] - 1, this.PARK[3] + 2]], [[this.PARK[0] - 1, this.PARK[3] + 2], [this.TERMINAL[0], this.PARK[3] + 2]], [[this.TERMINAL[0], this.PARK[3] + 2], [this.TERMINAL[0], this.TERMINAL[3]]]);
        segs.push([[this.FORE[2], this.TERMINAL[3] + 6], [this.FORE[2], A[1]]]);
        return segs;
    },

    // ---------------------------------------------------------------- geometria
    _c(c, k = 1) { return Landmarks._c(c, k); },
    meshes(wb) {
        if (!this.built) return;
        const t0 = performance.now();
        this._wb = wb;
        this._meshGround(wb);
        this._meshMarks(wb);
        this._meshBuildings(wb);
        this._meshFence(wb);
        this._meshLights(wb);
        this._meshSock(wb);
        for (const o of this.solids) if (!o.fence && o.h > 3) wb._collider('airport', o.x0, o.z0, o.x1, o.z1, o.h);
        console.log(`[AEROPORTO] geometria em ${(performance.now() - t0).toFixed(0)} ms`);
    },
    _top(wb, kind, x0, z0, x1, z1, y, tile = 6) {
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        for (let x = x0; x < x1; x += 64) for (let z = z0; z < z1; z += 64) {                 // (em pedaços: o relevo desloca os vértices)
            const a = Math.min(x1, x + 64), b = Math.min(z1, z + 64);
            wb._batch(kind, (x + a) / 2, (z + b) / 2).top(x, z, a, b, y, (u, v) => [u / tile, -v / tile], [1, 1, 1]);
        }
        void cx; void cz;
    },
    _meshGround(wb) {
        const R = this.RUNWAY, T = this.TAXI, A = this.APRON;
        this._top(wb, 'asphalt', R.x0, R.z - R.w / 2, R.x1, R.z + R.w / 2, 0.04, 8);
        this._top(wb, 'asphalt', T.x0, T.z - T.w / 2, T.x1, T.z + T.w / 2, 0.04, 8);
        for (const lx of T.links) this._top(wb, 'asphalt', lx - 7, T.z + T.w / 2, lx + 7, R.z - R.w / 2, 0.04, 8);
        this._top(wb, 'road_concrete', A[0], A[1], A[2], A[3], 0.05, 6);
        this._top(wb, 'road_concrete', this.TERMINAL[0] - 2, A[1] - 10, this.TERMINAL[2] + 2, A[1], 0.05, 6);       // (do terminal ao pátio)
        this._top(wb, 'road_concrete', this.HANGAR[0], this.HANGAR[1], A[0], this.HANGAR[3], 0.05, 6);
        const P = this.PARK, F = this.FORE;
        this._top(wb, 'asphalt', P[0], P[1], P[2], P[3], 0.04, 8);
        this._top(wb, 'open_plaza', F[0], F[1], F[2], F[3], 0.05, 6);
        this._top(wb, 'asphalt', this.GATE[0], -6, this.GATE[1], F[1], 0.035, 8);                                   // (a entrada, da Estrada das Fazendas)
    },
    // Tinta: branca na pista, amarela na taxiway e no pátio.
    _meshMarks(wb) {
        const R = this.RUNWAY, T = this.TAXI, A = this.APRON, y0 = 0.045, y1 = 0.06, W = this._c('#f2f2ee'), Y = this._c('#f0c419');
        const paint = (x0, z0, x1, z1, c) => wb._batch('trim', (x0 + x1) / 2, (z0 + z1) / 2).solid(x0, z0, x1, z1, y0, y1, c);
        const zl = R.z - R.w / 2, zh = R.z + R.w / 2;
        paint(R.x0, zl + 0.6, R.x1, zl + 1.5, W); paint(R.x0, zh - 1.5, R.x1, zh - 0.6, W);                          // bordas
        for (let x = R.x0 + 60; x + 30 < R.x1 - 60; x += 50) paint(x, R.z - 0.45, x + 30, R.z + 0.45, W);           // eixo
        for (const end of [0, 1]) {
            const s = end ? -1 : 1, xe = end ? R.x1 : R.x0;
            for (let i = 0; i < 8; i++) { if (i === 3 || i === 4) continue; const z = zl + 3 + i * 3.1; paint(Math.min(xe + s * 4, xe + s * 34), z, Math.max(xe + s * 4, xe + s * 34), z + 1.8, W); }      // "piano"
            this._digits(wb, R.name[end], xe + s * 44, R.z, s, W, y0, y1);                                          // o número
            for (const k of [0, 1, 2]) { const x = xe + s * (110 + k * 40); for (const dz of [-8, 8]) paint(Math.min(x, x + s * 22), R.z + dz - 1, Math.max(x, x + s * 22), R.z + dz + 1, W); }      // zona de toque
        }
        // taxiway: o eixo amarelo e as faixas de espera antes da pista
        paint(T.x0, T.z - 0.2, T.x1, T.z + 0.2, Y);
        for (const lx of T.links) {
            paint(lx - 0.2, T.z, lx + 0.2, zl, Y);
            for (const dz of [0, 0.8]) paint(lx - 7, zl - 4 - dz, lx + 7, zl - 3.7 - dz, Y);
        }
        // pátio: as linhas de entrada de cada vaga e a barra de parada
        for (const S of this.SPOTS) {
            paint(S.x - 0.2, S.z - 6, S.x + 0.2, A[3], Y);
            paint(S.x - 3, S.z - 6.4, S.x + 3, S.z - 6, Y);
        }
        paint(A[0], A[3] - 0.4, A[2], A[3], Y);
    },
    // Dois algarismos de 7 segmentos pintados na pista, lidos de quem chega pela cabeceira (s: +1 = lidos de oeste, de frente para leste).
    _digits(wb, txt, xc, zc, s, col, y0, y1) {
        const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcfgd' };
        const H = 9, Wd = 5, t = 0.9;
        // eixo "para cima" do número = +x·s (o piloto lê olhando para leste em 09); a largura corre em z
        const P = (u, v) => [xc + s * v, zc - s * u];                                                        // u: lateral (direita do piloto), v: para a frente
        const bar = (ua, va, ub, vb) => { const a = P(ua, va), b = P(ub, vb); wb._batch('trim', a[0], a[1]).solid(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), y0, y1, col); };
        [...txt].forEach((ch, i) => {
            const u0 = (i === 0 ? -1 : 1) * (Wd / 2 + 1.2) - Wd / 2, u1 = u0 + Wd, segs = SEG[ch] || '';
            const L = { a: [u0, H - t, u1, H], b: [u1 - t, H / 2, u1, H], c: [u1 - t, 0, u1, H / 2], d: [u0, 0, u1, t], e: [u0, 0, u0 + t, H / 2], f: [u0, H / 2, u0 + t, H], g: [u0, H / 2 - t / 2, u1, H / 2 + t / 2] };
            for (const k of segs) { const q = L[k]; bar(q[0], q[1], q[2], q[3]); }
        });
    },
    _meshBuildings(wb) {
        const c = this._c.bind(this), T = this.TERMINAL, Hg = this.HANGAR, W = this.TOWER;
        const trim = (x, z) => wb._batch('trim', x, z), xtrim = (x, z) => wb._batch('xtrim', x, z);
        // ---- TERMINAL: base clara, faixa de vidro em volta, laje branca com beiral, marquise na entrada (sul) e no pátio (norte)
        { const b = trim((T[0] + T[2]) / 2, (T[1] + T[3]) / 2), h = T[4];
          b.solid(T[0], T[1], T[2], T[3], 0, 0.9, c('#c9c6bd'));
          b.solid(T[0] + 0.3, T[1] + 0.3, T[2] - 0.3, T[3] - 0.3, 0.9, h - 1.2, c('#5d7f99'));                    // vidro
          for (let x = T[0] + 4; x < T[2] - 2; x += 4) { b.solid(x - 0.18, T[1] + 0.1, x + 0.18, T[1] + 0.45, 0.9, h - 1.2, c('#d8dade')); b.solid(x - 0.18, T[3] - 0.45, x + 0.18, T[3] - 0.1, 0.9, h - 1.2, c('#d8dade')); }
          b.solid(T[0] - 1.6, T[1] - 1.6, T[2] + 1.6, T[3] + 1.6, h - 1.2, h, c('#eef0f2'));                       // laje com beiral
          b.solid(T[0] + 6, T[1] + 4, T[0] + 18, T[3] - 4, h, h + 2.2, c('#9aa0a8'));                             // casa de máquinas
          const mc = (T[0] + T[2]) / 2;
          b.solid(mc - 14, T[1] - 5, mc + 14, T[1] - 0.2, 4.2, 4.6, c('#e9ebee'));                                 // marquise da entrada
          for (const dx of [-12, 0, 12]) b.solid(mc + dx - 0.2, T[1] - 4.8, mc + dx + 0.2, T[1] - 4.4, 0, 4.2, c('#8a9099'));
          b.solid(mc - 3, T[1] - 0.05, mc + 3, T[1] + 0.25, 0.9, 3.4, c('#2b3440'));                               // a porta
          b.solid(T[0] + 10, T[3] - 0.2, T[2] - 10, T[3] + 6, 3.6, 4.0, c('#e9ebee'));                             // a marquise do embarque
          Maracana._sign(wb, this.NAME.toUpperCase(), mc, this.ground() + h + 0.2, T[1] - 1.7, 34, 2.6, '#123a6b', '#ffffff'); }
        // ---- HANGAR: paredes de chapa, a porta aberta para o pátio, o teto em arco (degraus)
        { const b = trim((Hg[0] + Hg[2]) / 2, (Hg[1] + Hg[3]) / 2), h = Hg[4], wall = c('#8c9a8f'), dark = c('#6e7a71');
          b.solid(Hg[0], Hg[1], Hg[0] + 0.6, Hg[3], 0, h, wall);
          b.solid(Hg[0], Hg[1], Hg[2], Hg[1] + 0.6, 0, h, wall); b.solid(Hg[0], Hg[3] - 0.6, Hg[2], Hg[3], 0, h, wall);
          for (let z = Hg[1] + 2; z < Hg[3] - 1; z += 3) { b.solid(Hg[0] - 0.05, z, Hg[0] + 0.02, z + 0.25, 0, h, dark); }
          b.solid(Hg[2] - 0.6, Hg[1], Hg[2], Hg[1] + 2.4, 0, h, dark); b.solid(Hg[2] - 0.6, Hg[3] - 2.4, Hg[2], Hg[3], 0, h, dark);      // trilhos da porta
          b.solid(Hg[2] - 0.6, Hg[1], Hg[2] + 0.2, Hg[3], h - 2.2, h, dark);                                       // a viga sobre a porta
          const r = xtrim((Hg[0] + Hg[2]) / 2, (Hg[1] + Hg[3]) / 2), span = Hg[3] - Hg[1];
          for (let i = 0; i < 6; i++) { const f = i / 6, f1 = (i + 1) / 6, y = h + Math.sin(Math.PI * (f + f1) / 2) * 3.2;      // o arco do teto, em faixas
            r.solid(Hg[0], Hg[1] + span * f, Hg[2], Hg[1] + span * f1, y - 0.3, y, c(i % 2 ? '#a9b4ad' : '#9fa9a2')); }
          Maracana._sign(wb, 'HANGAR 1', Hg[2] - 1, this.ground() + h - 2, Hg[1] - 0.5, 8, 1.4, '#1f2a33', '#ffd34d'); }
        // ---- TORRE DE CONTROLE: fuste, a cabine de vidro, o teto e a antena com a luz vermelha
        { const b = trim(W.x, W.z), h = W.h;
          b.cyl(W.x, W.z, W.r * 0.8, 0, h, c('#d9d6ce'), 12);
          b.cyl(W.x, W.z, W.r * 1.6, h, h + 0.6, c('#c8c4ba'), 12);
          b.cyl(W.x, W.z, W.r * 1.5, h + 0.6, h + 3.6, c('#3f6b88'), 12);
          b.cyl(W.x, W.z, W.r * 1.75, h + 3.6, h + 4.2, c('#eef0f2'), 12);
          Landmarks._beam(b, [W.x, h + 4.2, W.z], [W.x, h + 9, W.z], 0.12, c('#c9ccd1'));
          for (let k = 0; k < 4; k++) b.solid(W.x - W.r * 0.8 - 0.05, W.z - 0.4, W.x - W.r * 0.8 + 0.05, W.z + 0.4, 3 + k * 4.5, 4 + k * 4.5, c('#5d7f99')); }
        // ---- tanques de combustível (brancos, com a faixa vermelha) e o caminhão-tanque
        for (const [x, z] of this.TANKS) { const b = trim(x, z); b.cyl(x, z, 3.8, 0, 6, c('#f1f1ef'), 14); b.cyl(x, z, 3.85, 4.2, 4.8, c('#c8382c'), 14); b.cyl(x, z, 2, 6, 6.4, c('#d9d9d6'), 10); }
        { const x = -832, z = 44, b = trim(x, z); b.solid(x - 1.2, z - 4, x + 1.2, z + 2, 0.5, 2.6, c('#e6e3da')); b.solid(x - 1.2, z + 2, x + 1.2, z + 4.2, 0.5, 2.9, c('#c8382c')); b.solid(x - 1.1, z + 3.3, x + 1.1, z + 4.1, 2.1, 2.6, c('#2a3440')); for (const dz of [-3, 0, 3.2]) for (const dx of [-1.25, 1.05]) b.solid(x + dx, z + dz - 0.5, x + dx + 0.2, z + dz + 0.5, 0, 1, c('#1b1d20')); }
        // ---- escadas de embarque ao lado das vagas
        for (const S of this.SPOTS) { const b = trim(S.x + 7, S.z), x = S.x + 7; for (let k = 0; k < 6; k++) b.solid(x - 0.8, S.z - 1.6 + k * 0.5, x + 0.8, S.z - 1.1 + k * 0.5, 0, 0.3 + k * 0.45, c('#d9dde2')); b.solid(x - 0.8, S.z - 2, x + 0.8, S.z + 1.6, 0.3, 0.5, c('#3a4048')); }
        // ---- placas da taxiway (amarelas) e do estacionamento
        const T2 = this.TAXI;
        for (const [lx, txt] of [[T2.links[0], 'A ← 09'], [T2.links[1], 'B'], [T2.links[2], '27 → C']]) { const b = trim(lx + 9, T2.z + 9); b.solid(lx + 8, T2.z + 8.6, lx + 12, T2.z + 9, 0, 1.4, c('#f0c419')); b.solid(lx + 8.6, T2.z + 8.5, lx + 11.4, T2.z + 8.6, 0.4, 1.2, c('#1b1d20')); void txt; }
        Maracana._sign(wb, 'AEROPORTO ✈ ESTACIONAMENTO', (this.PARK[0] + this.PARK[2]) / 2, this.ground() + 2.2, this.PARK[1] - 0.6, 12, 1.4, '#123a6b', '#ffffff');
        { const b = trim((this.PARK[0] + this.PARK[2]) / 2, this.PARK[1]); for (let x = this.PARK[0] + 3; x < this.PARK[2] - 2; x += 3) for (const z of [this.PARK[1] + 4, this.PARK[3] - 8]) b.solid(x - 0.06, z, x + 0.06, z + 5, 0.045, 0.06, c('#f2f2ee')); }
    },
    _meshFence(wb) {
        const c = this._c.bind(this), post = c('#8c9196'), wire = c('#aeb3b8');
        for (const [a, b] of this._fenceSegs()) {
            const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / 4));
            const bt = wb._batch('trim', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
            for (let i = 0; i <= n; i++) { const x = a[0] + (b[0] - a[0]) * i / n, z = a[1] + (b[1] - a[1]) * i / n; bt.solid(x - 0.07, z - 0.07, x + 0.07, z + 0.07, 0, 2.3, post); }
            for (const y of [0.15, 1.15, 2.15]) Landmarks._beam(bt, [a[0], y, a[1]], [b[0], y, b[1]], 0.05, wire);
            for (let i = 0; i < n; i++) {                                                     // (a tela: diagonais finas entre os postes)
                const x0 = a[0] + (b[0] - a[0]) * i / n, z0 = a[1] + (b[1] - a[1]) * i / n, x1 = a[0] + (b[0] - a[0]) * (i + 1) / n, z1 = a[1] + (b[1] - a[1]) * (i + 1) / n;
                Landmarks._beam(bt, [x0, 0.15, z0], [x1, 2.15, z1], 0.025, wire); Landmarks._beam(bt, [x0, 2.15, z0], [x1, 0.15, z1], 0.025, wire);
            }
        }
    },
    // Luzes da pista (brancas nas bordas, verde na cabeceira de quem chega, vermelha no fim), da taxiway (azuis) e a da antena da torre.
    _meshLights(wb) {
        const R = this.RUNWAY, T = this.TAXI, L = this._lights = [];
        for (let x = R.x0; x <= R.x1 + 0.1; x += 30) for (const s of [-1, 1]) L.push([x, R.z + s * (R.w / 2 + 1), 1, 0.96, 0.85, 1.4]);
        for (let z = R.z - R.w / 2; z <= R.z + R.w / 2 + 0.1; z += 3.5) { L.push([R.x0 - 2, z, 0.3, 1, 0.4, 1.3]); L.push([R.x1 + 2, z, 1, 0.25, 0.2, 1.3]); }
        for (let x = T.x0; x <= T.x1 + 0.1; x += 25) for (const s of [-1, 1]) L.push([x, T.z + s * (T.w / 2 + 0.8), 0.3, 0.55, 1, 1.0]);
        L.push([this.TOWER.x, this.TOWER.z, 1, 0.15, 0.1, 2.2, this.TOWER.h + 9.2]);
        const G = this._glow = new GlowBatch(wb.scene, L.length, 'airportGlow', 'glow');
        L.forEach((q, i) => { G.alloc(); G.place(i, q[0], q[6] || 0.25, q[1], q[5]); G.color(i, q[2], q[3], q[4], 0); });
        G.flush();
        this._lvl = -1;
    },
    // A biruta no fim da pista (gira com o vento: Weather).
    _meshSock(wb) {
        const S = this.SOCK, c = this._c.bind(this), b = wb._batch('trim', S.x, S.z);
        Landmarks._beam(b, [S.x, 0, S.z], [S.x, 6.5, S.z], 0.1, c('#d9dde2'));
        const node = this._sock = new BABYLON.TransformNode('airportSock', wb.scene);
        node.position.set(S.x, this.ground() + 6.3, S.z);
        const mat = new BABYLON.StandardMaterial('airportSockMat', wb.scene);
        mat.diffuseColor = new BABYLON.Color3(1, 0.42, 0.08); mat.emissiveColor = new BABYLON.Color3(0.25, 0.1, 0.02); mat.specularColor = BABYLON.Color3.Black();
        const cone = BABYLON.MeshBuilder.CreateCylinder('airportSockCone', { height: 3.2, diameterTop: 0.35, diameterBottom: 0.9, tessellation: 10 }, wb.scene);
        cone.material = mat; cone.rotation.z = -Math.PI / 2; cone.position.x = 1.6; cone.parent = node; cone.isPickable = false;
        wb.meshes.push(cone);
    },

    // ---------------------------------------------------------------- por quadro
    update(dt, game) {
        if (!this._glow) return;
        const n = game.dayNight ? game.dayNight.night : 0, lvl = Math.round(Math.max(n, typeof Weather !== 'undefined' && Weather.cur ? Weather.cur.k * 0.7 : 0) * 20) / 20;
        if (lvl !== this._lvl) {
            this._lvl = lvl;
            this._lights.forEach((q, i) => { if (lvl > 0.05) this._glow.color(i, q[2] * lvl, q[3] * lvl, q[4] * lvl, 0.9 * lvl); else this._glow.off(i); });
            this._glow.flush();
        }
        if (this._sock) {                                                                     // a biruta: para onde o vento sopra, mais murcha com calmaria
            this._st = (this._st || 0) + dt;
            const w = typeof Weather !== 'undefined' && Weather.cur ? Weather.cur.k : 0;
            this._sock.rotation.y = 0.6 + Math.sin(this._st * 0.21) * 0.35 + Math.sin(this._st * 1.7) * 0.06 * (0.3 + w);
            this._sock.rotation.z = -0.5 + 0.45 * Math.min(1, 0.35 + w);
        }
    },

    // ---------------------------------------------------------------- o balcão (na porta do terminal)
    deskShop() { return this._shop || (this._shop = { id: 'airport_desk', style: 'airport', name: 'Balcão do Aeroporto', district: 'city', biome: 'commercial', x: this.DESK.x, z: this.DESK.z }); },
    _atDesk(game) { if (game.mode !== 'player' || Interiors.active || game.player.busy) return false; const p = game.player.position; return Math.hypot(p.x - this.DESK.x, p.z - this.DESK.z) < 2.6; },
    prompt(game) {
        if (!this.built || !this._atDesk(game) || game.shopUI.open || game.shopUI.cool > 0) return '';
        return '<b>E</b> Balcão do aeroporto<small>salto de paraquedas · paraquedas · aluguel de avião (teco-teco, bimotor, jatinho)</small>';
    },
    interact(game) {
        if (!this.built || !this._atDesk(game) || game.shopUI.open || game.shopUI.cool > 0) return false;
        game.shopUI.show(this.deskShop());
        return true;
    },

    // ---------------------------------------------------------------- mapa (MapRenderer.drawView)
    drawMap(ctx, X, Y, k, vis) {
        const [A, B] = this.AREAS;
        if (!vis(B[0], A[1], A[2], A[3])) return;
        const rect = (x0, z0, x1, z1, col) => { ctx.fillStyle = col; ctx.fillRect(X(x0), Y(z1), (x1 - x0) * k, (z1 - z0) * k); };
        const R = this.RUNWAY, T = this.TAXI, Ap = this.APRON;
        rect(R.x0, R.z - R.w / 2, R.x1, R.z + R.w / 2, '#3b3f45');
        rect(T.x0, T.z - T.w / 2, T.x1, T.z + T.w / 2, '#4a4f56');
        for (const lx of T.links) rect(lx - 7, T.z, lx + 7, R.z, '#4a4f56');
        rect(Ap[0], Ap[1], Ap[2], Ap[3], '#b9b6ad');
        rect(this.PARK[0], this.PARK[1], this.PARK[2], this.PARK[3], '#55595f');
        if (k >= 0.6) for (let x = R.x0 + 60; x + 30 < R.x1 - 60; x += 50) rect(x, R.z - 0.6, x + 30, R.z + 0.6, '#f2f2ee');
        const Tm = this.TERMINAL, H = this.HANGAR, W = this.TOWER;
        rect(Tm[0], Tm[1], Tm[2], Tm[3], '#e8eaee'); rect(Tm[0] + 2, Tm[1] + 2, Tm[2] - 2, Tm[3] - 2, '#9ec1dc');
        rect(H[0], H[1], H[2], H[3], '#a9b4ad');
        rect(W.x - W.r * 1.6, W.z - W.r * 1.6, W.x + W.r * 1.6, W.z + W.r * 1.6, '#3f6b88');
        for (const [x, z] of this.TANKS) rect(x - 3.8, z - 3.8, x + 3.8, z + 3.8, '#f1f1ef');
    },
};
