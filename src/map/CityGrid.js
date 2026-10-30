// ============================================================================
// CityGrid — a CIDADE e tudo o que é construído, gerado a partir do plano de ruas (RoadPlan). FONTE ÚNICA: o WorldBuilder
// constrói o 3D a partir daqui e o MapRenderer desenha o mesmo nos mapas.
//
// DISTRITOS (no mesmo grafo):
//   CIDADE  — a faixa urbana ao longo do canal: uma MANCHA de contorno torto (a Av. do Contorno corre pela borda oeste/norte/sul; a
//             orla leste é a Beira-Mar), grade reta no miolo antigo e no meio (viaduto), e bairros de RUAS CURVAS no norte e no
//             extremo sul (a mesma grade deformada por um lençol suave): centro, comércio, residencial, industrial, porto, parques;
//   ILHA    — a ilha praiana (resort): a área urbana segue o formato dela (Av. Litorânea em volta, a uma faixa de praia da água) e as
//             ruas de dentro são curvas; hotéis, condomínios, bares;
//   FAVELA  — FavelaPlan: a mancha do morro, becos e barracos.
// Fora deles: rodovias e estradas de terra pelo continente e as 3 pontes entre a cidade e a ilha (ver _makePlan).
//
// Quarteirões = FACES do grafo de ruas (_faces). A face que é exatamente uma célula da grade vira o quarteirão retangular de sempre;
// as outras (cortadas por diagonal ou curva, na borda da mancha) viram quarteirões em POLÍGONO (`poly` = laje, `footPoly` = pegada;
// slab/foot são as caixas deles), com os prédios (sempre alinhados aos eixos) empacotados na pegada (_packLots).
//
// Por quarteirão (cell) entre quatro ruas:
//   slab = área do quarteirão (do meio-fio até o meio-fio)
//   foot = pegada construível (slab recuado pela largura da calçada)
//   a "calçada" é o anel entre `slab` e `foot` (onde os pedestres andam).
// Cada quarteirão tem um BIOMA que define chão, prédios e vegetação:
//   downtown | commercial | residential | industrial | port | park | forest | beach | resort | favela
// ============================================================================

const CityGrid = {
    BIOMES: {
        downtown:    { open: false, ground: 'plaza',    label: 'Centro' },
        commercial:  { open: false, ground: 'plaza',    label: 'Comércio' },
        residential: { open: false, ground: 'grass',    label: 'Residencial' },
        industrial:  { open: false, ground: 'concrete', label: 'Industrial' },
        port:        { open: false, ground: 'concrete', label: 'Porto' },
        park:        { open: true,  ground: 'grass',    label: 'Parque' },
        forest:      { open: true,  ground: 'grass',    label: 'Mata' },
        beach:       { open: true,  ground: 'sand',     label: 'Praia' },
        plaza:       { open: true,  ground: 'plaza',    label: 'Praça' },
        resort:      { open: false, ground: 'plaza',    label: 'Resort' },
        favela:      { open: false, ground: 'earth',    label: 'Favela' },
    },

    // Número de linhas da cidade ANTIGA (8×10 quarteirões de 42 u, centrada na origem): o layout dela é preservado.
    OLD: { minX: -168, maxX: 168, minZ: -210, maxZ: 210, pitch: 42, cols: 8, rows: 10 },

    // A geração do mundo em PASSOS ({ label, run }), na ordem: continente → ruas → quarteirões → favela → cruzamentos → relevo → orla.
    // Na página do jogo (window.DEFER_WORLD) o main.js roda um por vez durante a tela do estúdio, com um quadro de respiro entre eles
    // (a tela anda e mostra o passo); fora dela, o fim deste arquivo roda todos de uma vez, como antes.
    steps() {
        const S = [];
        if (!WorldMap.land) S.push({ label: 'Desenhando o continente…', run: () => WorldMap.buildLand() });
        S.push(
            { label: 'Traçando as ruas e estradas…', run: () => { this._t0 = performance.now(); this._reset(); this._makePlan(); } },
            { label: 'Erguendo os quarteirões…', run: () => this._buildBlocks(false) },
            { label: 'Subindo o morro da favela…', run: () => { if (this._favela) FavelaPlan.build(this); } },
            { label: 'Empilhando as casas do Mirante…', run: () => { if (this._favela) FavelaSul.build(this); } },
            { label: 'Ligando os cruzamentos…', run: () => this._buildRest(this._t0) },
            { label: 'Esculpindo o relevo…', run: () => WorldMap.buildTerrain() },
            { label: 'Plantando a orla e as matas…', run: () => this.finish() },
        );
        return S;
    },

    build() {
        const t0 = performance.now();
        this._reset();
        this._makePlan();
        this._buildBlocks();
        this._buildRest(t0);
    },
    _reset() {
        this.obstacles = [];   // retângulos sólidos { x0, z0, x1, z1, h } (prédios, contêineres).
        this.vaultables = [];  // grades e muros: sólidos que dá para PULAR (jogador e polícia) — também estão em `obstacles`
        this.hideSpots = [];   // esconderijos (caçambas, caixotes, latões): { x, z, w, d, h, kind }
        this.blocks = [];
        this.urbanBoxes = [];  // retângulos [x0,z0,x1,z1] cobertos por quarteirão+ruas (o terreno por baixo some; a nav só anda no declarado)
        this.urbanPolys = [];  // o mesmo para os quarteirões em polígono: a face inteira (até o eixo das ruas em volta)
        this.roadRects = [];   // um retângulo por trecho de rua (achata o relevo)
        this.navBlocks = [];   // áreas proibidas SÓ para a navegação a pé (interior da safe house: pedestres e policiais não entram; o jogador sim)
    },
    _buildRest(t0) {
        this._buildIntersections();
        this._planTunnels();
        this._buildObstacleGrid();
        this._buildPois();
        this.buildMs = performance.now() - t0;
        console.log(`[CIDADE] ${RoadPlan.nodes.length} cruzamentos, ${RoadPlan.edges.length} trechos, ${this.blocks.length} quarteirões, ${this.obstacles.length} sólidos em ${this.buildMs.toFixed(0)} ms`
            + (RoadPlan.report.length ? ` | ${RoadPlan.report.length} trechos fora do terreno` : ''));
    },

    // Depois do relevo (WorldMap.buildTerrain): orla e o que é andável a pé.
    finish() {
        this._fillCoast();
        if (typeof Landmarks !== "undefined") Landmarks.build();         // marcos: Maracanã, Cristo, Pão de Açúcar, calçadão, pontes estaiadas
        if (typeof Speedway !== "undefined") Speedway.build();           // autódromo (oval) no campo a oeste: corridas de estádio (StreetRacing) — antes do campo
        if (typeof RuralPlan !== "undefined") RuralPlan.build();         // campo: fazendas, cabanas, postos, torres, alamedas
        if (typeof Marina !== "undefined") Marina.build();               // marina na orla leste: píeres, vagas e clube náutico
        if (typeof Landmarks !== "undefined") Landmarks.buildPiers();    // píeres com barcos no canal (longe da marina)
        this._purgeVegetation();
        this._roundIslands();
        this._collectWalk();
    },

    // Ilha das rotatórias: uma palmeira e arbustos (depois da limpeza de vegetação em vias: a ilha não é pista).
    _roundIslands() {
        const rng = Pixel.rng(5150);
        for (const n of RoadPlan.nodes) {
            const R = n.round;
            if (!R) continue;
            this.coastProps.push({ type: 'tree', kind: 'palm', x: R.cx, z: R.cz + 0.3, s: 1.25, seed: Math.floor(rng() * 1000) });
            for (let k = 0; k < 3; k++) {
                const t = k * Math.PI * 2 / 3 + 0.5 + rng() * 0.4;
                this.coastProps.push({ type: 'tree', kind: 'bush', x: R.cx + Math.cos(t) * 2.7, z: R.cz + Math.sin(t) * 2.7, s: 0.6 + rng() * 0.15, seed: Math.floor(rng() * 1000) });
            }
        }
    },

    // REGRA: vegetação só FORA das vias (ruas, estradas, rodovias, pontes, viadutos e os cantos de asfalto dos quarteirões).
    // Tira das listas de props qualquer árvore/arbusto/pomar cuja copa encoste na pista. (O terreno e os canteiros usam a mesma
    // regra: TerrainBuilder._plant e WorldBuilder._medians.)
    _purgeVegetation() {
        const CROWN = PropSprites.CROWN, isPlant = (p) => p.type === 'tree' || p.kind === 'orchard';
        let removed = 0;
        const keep = (p, blk) => {
            if (!isPlant(p)) return true;
            const m = (CROWN[p.kind] || 1.5) * (p.s || 1);
            if (RoadPlan.onPavement(p.x, p.z, m)) return false;
            if (typeof Speedway !== 'undefined' && Speedway.covers(p.x, p.z, m)) return false;          // (o autódromo: pista e arquibancada)
            if (typeof Landmarks !== 'undefined' && p.kind !== 'umbrella' && Landmarks.covers(p.x, p.z, m)) return false;      // (os marcos)
            if (blk && !blk.virtual && blk.r > 0.5 && !this._inRoundRect(blk.slab, blk.r, p.x, p.z, m)) return false;      // canto arredondado: o que sobra é asfalto
            return true;
        };
        for (const blk of this.blocks.concat(this.extraBlocks || [])) {
            const n = blk.props.length;
            blk.props = blk.props.filter((p) => keep(p, blk));
            removed += n - blk.props.length;
        }
        const n = this.coastProps.length;
        this.coastProps = this.coastProps.filter((p) => keep(p, null));
        removed += n - this.coastProps.length;
        console.log(`[VEGETAÇÃO] ${removed} plantas removidas de cima de vias`);
    },

    // (x, z) dentro do retângulo `s` de cantos arredondados (raio r), recuado de m?
    _inRoundRect(s, r, x, z, m) {
        if (x < s[0] + m || x > s[2] - m || z < s[1] + m || z > s[3] - m) return false;
        if (r - m <= 0.01) return true;
        const cx = x < s[0] + r ? s[0] + r : (x > s[2] - r ? s[2] - r : x), cz = z < s[1] + r ? s[1] + r : (z > s[3] - r ? s[3] - r : z);
        return hypot(x - cx, z - cz) <= r - m;
    },

    // ================================================================= plano de ruas
    _range(a, b, s) { const o = []; for (let v = a; v <= b + 1e-6; v += s) o.push(v); return o; },

    // Linhas de rua de `a` a `b` (a < b) com espaçamentos variados (quarteirões pequenos e grandes): sorteia passos da lista
    // `steps` e ajusta o último para fechar exatamente em `b`. Determinístico (rng).
    _irregular(a, b, steps, rng) {
        const out = [a];
        let x = a;
        while (b - x > 1e-6) {
            let s = steps[Math.floor(rng() * steps.length)];
            if (b - (x + s) < 24) s = b - x;                          // sobra pequena: absorve no último quarteirão
            x += s; out.push(x);
        }
        return out;
    },

    _makePlan() {
        const P = RoadPlan, R = this._range;
        P.segs = []; P.report = []; P.marks = new Map(); P.paths = [];
        const legacy = !!Config.world.legacyPlan;
        const D = this.districts = {};

        // ---- CIDADE: grade de 42 u ao longo do canal (a "legada" é só o miolo antigo).
        // O miolo antigo (x ±168, z ±210) segue em 42 u; o resto da faixa tem quarteirões de tamanhos variados (28 a 84 u).
        const lr = Pixel.rng(777), STEPS = [28, 30, 36, 36, 42, 42, 42, 48, 54, 60, 72, 84];
        const cx = legacy ? R(-168, 168, 42) : this._irregular(-294, -168, [42, 42, 54, 63], lr).concat(R(-126, 168, 42));
        const cz = legacy ? R(-210, 210, 42) : this._irregular(-1050, -210, STEPS, lr).concat(R(-168, 210, 42).slice(0, -1), this._irregular(210, 1134, STEPS, lr));
        D.city = { id: 'city', xs: cx, zs: cz, cls: 'city', sw: 4, margin: 14 };
        const aveZ = new Set(cz.filter((z, i) => (z < -210 || z > 210) && i % 4 === 0));       // avenidas largas (canteiro central) fora do miolo antigo
        const aveX = new Set([cx[1], cx[cx.length - 1]]);                                       // N-S: a do oeste e a BEIRA-MAR (a última coluna, de frente para o canal)
        if (legacy) P.lattice(cx, cz, 'city', (x, z) => WorldMap.buildable(x, z, 16), 'cidade');

        if (!legacy) {
            // ---- VIADUTO: via elevada na coluna oeste da cidade (cruza as ruas por cima, sem cruzamento; rampas nas pontas).
            const nearest = (arr, v) => arr.reduce((b, q) => (Math.abs(q - v) < Math.abs(b - v) ? q : b), arr[0]);
            const xv = (cx[0] + cx[1]) / 2, zA = nearest(cz, -840), zB = nearest(cz, -270);
            D.viaduct = { x: xv, z0: zA, z1: zB };
            // ---- CONTORNO: a mancha urbana termina numa curva torta (oeste, norte e sul) e a Av. do Contorno corre por ela, da orla sul
            // à orla norte; as ruas da cidade são cortadas nela (_cityStreets). Os bairros do norte e do extremo sul têm ruas curvas.
            this._cityOutline(zA, zB);
            P.addPath(this.cityPath, 'ave', { name: 'Av. do Contorno', anchor: true });
            this._cityStreets(P, cx, cz, aveX, aveZ, zA);
            P.addV(xv, zA, zB, 'via', { layer: 1, ramp: 55, elev: 6.2 });
            D.city.skip = (x0, z0, x1, z1) => x0 < xv && xv < x1 && z0 >= zA - 1e-6 && z1 <= zB + 1e-6;            // sem quarteirões sob o viaduto
            // ---- ILHA: a área urbana segue o formato da ilha (a Av. Litorânea dá a volta nela, a uma faixa de praia da água) e as ruas
            // de dentro são uma grade deformada (curvas). As 3 PONTES (cidade -> ilha) descem na avenida (_islandPlan).
            const ix = this._irregular(396, 828, [36, 42, 48, 54, 60], lr), iz = this._irregular(-960, 1056, [30, 36, 42, 48, 60, 72], lr);
            D.island = { id: 'island', xs: ix, zs: iz, cls: 'isl', sw: 4, margin: 30 };
            this._islandPlan(P, ix, iz);
            // ---- DIAGONAIS do centro antigo (grade regular de 42 u: passam pelos cruzamentos, sem cortar trecho no meio) e a PRAÇA
            // CENTRAL, rotatória de 8 braços na origem onde elas se cruzam com as ruas do centro.
            P.addPath([[-168, -168], [168, 168]], 'ave', { name: 'Av. Diagonal Norte' });
            P.addPath([[-168, 168], [168, -168]], 'ave', { name: 'Av. Diagonal Sul' });
            P.mark(0, 0, { round: { R: 20, r: 9, plaza: true } });
            // ---- VIA EXPRESSA: da cabeceira da ponte norte, em diagonal pelo norte da cidade, até a Av. do Contorno (dali segue pela Rodovia
            // Central para o oeste): o eixo das rodovias que liga a ilha ao interior.
            this._expressway(P, cx[cx.length - 1], 714);
            // ---- AVENIDA BEIRA-MAR: ROTATÓRIAS nas cabeceiras das 3 pontes e RETORNOS no canteiro central, no meio dos quarteirões
            // longos (≥ 60 u, longe das rotatórias).
            const bx = cx[cx.length - 1], bz = [714, 0, -630];
            for (const z of bz) P.mark(bx, z, { round: { R: 12, r: 4.5 } });
            const along = [...new Set(cz.concat(bz))].sort((a, b) => a - b);
            for (let k = 0; k + 1 < along.length; k++) {
                const a = along[k], b = along[k + 1], m = Math.round((a + b) / 2);
                if (b - a >= 60 && bz.every((z) => Math.abs(z - m) >= 30)) P.mark(bx, m, { uturn: { gap: 14 } });
            }
            // ---- FAVELA: só 3 ruas de carro, curvas, morro acima (da avenida oeste da cidade às estradas de terra); o resto são becos
            // (FavelaPlan.build, no _buildBlocks).
            FavelaPlan.roads(P);
            this._favela = true;
            // ---- INTERIOR: rodovias, estradas de terra e caminhos sinuosos pelo relevo (RuralRoads).
            RuralRoads.plan(P);
            // ---- MORRO DO MIRANTE (C.P.C): as ruas dele encostam na Rodovia do Sul, então entram depois das estradas do interior.
            FavelaSul.roads(P);
        }
        P.build();
    },

    // ============================================================ contorno e ruas da cidade
    // A cidade não termina numa régua: a mancha urbana (_cityField) recua da faixa em curvas tortas a oeste (o campo, a favela), ao norte
    // e ao sul — só a orla (leste) segue a Beira-Mar. A AV. DO CONTORNO corre pela borda, da orla norte à orla sul (cityPath; cityLoop =
    // ela fechada pelo mar, para dizer o que é dentro).
    CITY: { x0: -294, x1: 168, z0: -1050, z1: 1134, east: 200 },
    _smin(a, b, k) { const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k)); return b + (a - b) * h - k * h * (1 - h); },
    // Campo da mancha (u, + dentro): recuos sorteados de cada borda (ruído suave + um tremido curto), cantos redondos (mínimo suave).
    // Perto das duas pontas do viaduto a borda oeste fica rente (as rampas descem em ruas da cidade); no meio dele, não (o elevado
    // passa por cima do campo onde a cidade recua).
    _cityField(x, z) {
        const B = this.CITY, F = (a, b, sd, o = 3) => WorldMap._fbm(a, b, o, sd), V = this._viaBand, ss = (a, b, v) => WorldMap._ss(a, b, v);
        const band = V ? 1 - ss(50, 110, Math.min(Math.abs(z - V[0]), Math.abs(z - V[1]))) : 0;
        const w = 10 + 150 * ss(0.3, 0.64, F(z / 270, 3.3, 501)) * (1 - band) + 18 * (F(z / 64, 9.1, 502, 2) - 0.5);
        const n = 30 + 210 * ss(0.36, 0.72, F(x / 230, 5.5, 503)) + 16 * (F(x / 60, 1.9, 504, 2) - 0.5);
        let s = 30 + 190 * ss(0.36, 0.72, F(x / 230, 8.5, 505)) + 16 * (F(x / 60, 4.4, 506, 2) - 0.5);
        // a PRAIA DO SUL (WorldMap.BEACH): do Morro do Mirante para leste a cidade termina numa orla reta-ondulada — a Av. do Contorno vira a
        // avenida da praia, e entre ela e o mar fica a areia larga
        const bk = ss(-150, -100, x);
        if (bk > 0) s += (Math.max(s, 118 + 14 * (F(x / 120, 2.7, 507) - 0.5)) - s) * bk;
        return Math.min(this._smin(this._smin(x - (B.x0 + w), (B.z1 - n) - z, 70), z - (B.z0 + s), 70), B.east - x);
    },
    _chaikinLoop(L) {
        const out = [];
        for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length]; out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
        return out;
    },
    _cityOutline(zA, zB) {
        this._viaBand = [zA, zB];
        const B = this.CITY, st = 6, x0 = B.x0 - 30, z0 = B.z0 - 30, nx = Math.ceil((B.east + 30 - x0) / st), nz = Math.ceil((B.z1 + 30 - z0) / st);
        let L = WorldMap.contour((x, z) => this._cityField(x, z), x0, z0, nx, nz, st, 0)[0];
        L = WorldMap.simplifyLoop(L, 1.5);
        for (let k = 0; k < 3; k++) L = this._chaikinLoop(L);
        // corta o laço em x = Beira-Mar: o pedaço a oeste (anti-horário: da ponta norte, pelo oeste, até a ponta sul) é a avenida
        const XB = B.x1, n = L.length, cr = [];
        for (let i = 0; i < n; i++) { const a = L[i], b = L[(i + 1) % n]; if ((a[0] < XB) !== (b[0] < XB)) cr.push({ i, p: [XB, a[1] + (b[1] - a[1]) * (XB - a[0]) / (b[0] - a[0])], into: b[0] < XB }); }
        const ent = cr.find((c) => c.into), ex = cr.find((c) => !c.into), path = [ent.p];
        for (let i = (ent.i + 1) % n; i !== (ex.i + 1) % n; i = (i + 1) % n) path.push(L[i]);
        path.push(ex.p);
        this.cityPath = RuralRoads._resample(path, 6);
        const P = this.cityPath, a = P[0], b = P[P.length - 1];
        this.cityLoop = P.concat([[B.east + 40, b[1]], [B.east + 40, a[1]]]);
        this.cityO = this._outlineObj(P, this.cityLoop);
    },
    // VIA EXPRESSA: reta a 45° (sudoeste) da cabeceira da ponte (bx, bz) até a Av. do Contorno — termina exatamente nela (entroncamento).
    _expressway(P, bx, bz) {
        const d = [-Math.SQRT1_2, -Math.SQRT1_2], far = [bx + d[0] * 1200, bz + d[1] * 1200], X = this.cityO && this._oX(this.cityO, [bx, bz], far);
        if (!X) return;
        P.addPath([[bx, bz], X], 'ave', { name: 'Via Expressa', express: true });
    },

    // Contorno para recortar ruas: a avenida (path, polilinha) e o laço que diz o que é dentro (loop), com uma grade dos segmentos da
    // avenida (distância rápida).
    _outlineObj(path, loop) {
        const G = new Map(), S = 32;
        for (let i = 0; i + 1 < path.length; i++) {
            const p = path[i], q = path[i + 1];
            for (let gi = Math.floor(Math.min(p[0], q[0]) / S); gi <= Math.floor(Math.max(p[0], q[0]) / S); gi++) for (let gj = Math.floor(Math.min(p[1], q[1]) / S); gj <= Math.floor(Math.max(p[1], q[1]) / S); gj++) {
                const k = gi * 100000 + gj; (G.get(k) || G.set(k, []).get(k)).push(i);
            }
        }
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (const p of loop) { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]); }
        return { path, loop, G, box: [x0, z0, x1, z1] };
    },
    // Distância (u) de (x, z) até a avenida do contorno O (até ~64 u; além disso, 99).
    _oDist(O, x, z) {
        const P = O.path, S = 32, gi0 = Math.floor(x / S), gj0 = Math.floor(z / S);
        let bd = 99;
        for (let gi = gi0 - 2; gi <= gi0 + 2; gi++) for (let gj = gj0 - 2; gj <= gj0 + 2; gj++) for (const i of O.G.get(gi * 100000 + gj) || []) {
            const a = P[i], b = P[i + 1], sx = b[0] - a[0], sz = b[1] - a[1], L2 = sx * sx + sz * sz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * sx + (z - a[1]) * sz) / L2));
            bd = Math.min(bd, hypot(x - a[0] - sx * t, z - a[1] - sz * t));
        }
        return bd;
    },
    _oIn(O, x, z) { const b = O.box; return x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3] && RoadPlan.inPoly(O.loop, x, z); },
    // Onde uma via que chega do oeste na altura z encontra a Av. do Contorno: [x, z, nx, nz] (n = normal para fora da cidade). A 1ª
    // interseção da reta z para leste, se ela chega de frente na avenida; senão (borda norte/sul, rasante), o ponto da avenida mais
    // perto de (-294, z) — a via chega na perpendicular. Para as estradas do interior e as ruas da favela. (Arrays, não { x, z }: roda
    // no meio do traçado das estradas, e um objeto { x, z, ... } novo ali muda a forma interna que WorldMap._rawHeight usa e o desotimiza.)
    cityEdgeAt(z) {
        const P = this.cityPath;
        if (!P) return [-294, z, -1, 0];
        const nrm = (i) => { const a = P[i], b = P[i + 1], l = hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[1] - a[1]) / l, -(b[0] - a[0]) / l]; };
        let bx = Infinity, bi = -1;
        for (let i = 0; i + 1 < P.length; i++) {
            const a = P[i], b = P[i + 1];
            if ((a[1] < z) === (b[1] < z)) continue;
            const x = a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]);
            if (x > -300 && x < bx) { bx = x; bi = i; }
        }
        if (bi >= 0) { const n = nrm(bi); if (-n[0] > 0.7) return [bx, z, n[0], n[1]]; }
        let best = null, bd = Infinity;
        for (let i = 0; i + 1 < P.length; i++) {
            const a = P[i], b = P[i + 1], sx = b[0] - a[0], sz = b[1] - a[1], L2 = sx * sx + sz * sz || 1, t = Math.max(0, Math.min(1, ((-294 - a[0]) * sx + (z - a[1]) * sz) / L2));
            const x = a[0] + sx * t, zz = a[1] + sz * t, d = hypot(x + 294, zz - z);
            if (d < bd) { bd = d; const n = nrm(i); best = [x, zz, n[0], n[1]]; }
        }
        return best;
    },
    // Pontos de chegada de uma via na Av. do Contorno: [o ponto na avenida, 22 u para fora na perpendicular].
    cityLink(z) { const c = this.cityEdgeAt(z); return [[c[0], c[1]], [c[0] + c[2] * 22, c[1] + c[3] * 22]]; },
    // (x, z) dentro da mancha urbana?
    inCity(x, z) { return !this.cityO || this._oIn(this.cityO, x, z); },

    // Interseção do segmento pq com o laço do contorno O (a mais perto de p) ou null.
    _oX(O, p, q) {
        const L = O.loop;
        let best = null, bt = Infinity;
        for (let i = 0; i < L.length; i++) {
            const a = L[i], b = L[(i + 1) % L.length];
            if (Math.max(a[0], b[0]) < Math.min(p[0], q[0]) || Math.min(a[0], b[0]) > Math.max(p[0], q[0]) || Math.max(a[1], b[1]) < Math.min(p[1], q[1]) || Math.min(a[1], b[1]) > Math.max(p[1], q[1])) continue;
            const X = this._segX(p, q, a, b);
            if (X) { const t = hypot(X[0] - p[0], X[1] - p[1]); if (t < bt) { bt = t; best = X; } }
        }
        return best;
    },
    // Linha de rua L (polilinha; `cross` = índices dos vértices que são cruzamentos) recortada pela mancha urbana: pedaços [[x, z], ...].
    // Ponta que sai na Av. do Contorno: entroncamento em T se a linha chega nela de frente (a 24 u dela em ≤ 42 u de linha); chegando
    // rasante (correndo junto dela), a linha acaba no último cruzamento antes — nada de quarteirão-fiapo entre as duas. Ponta que não
    // sai na avenida (a linha acaba ali dentro): no último cruzamento (sem beco sem saída).
    _clipLine(L, cross, O = this.cityO) {
        const DK = 24, runs = [];
        let cur = null;
        for (let i = 0; i < L.length; i++) {
            const p = L[i], ins = this._oIn(O, p[0], p[1]);
            if (ins) {
                if (!cur) { cur = { pts: [], cr: [], ea: false, eb: false }; if (i > 0) { const X = this._oX(O, L[i - 1], p); if (X) { cur.pts.push(X); cur.cr.push(false); cur.ea = true; } } }
                cur.pts.push(p); cur.cr.push(cross.has(i));
            } else if (cur) {
                const X = this._oX(O, L[i - 1], p); if (X) { cur.pts.push(X); cur.cr.push(false); cur.eb = true; }
                runs.push(cur); cur = null;
            }
        }
        if (cur) runs.push(cur);
        const out = [];
        for (const r of runs) {
            const n = r.pts.length, d = r.pts.map((p) => this._oDist(O, p[0], p[1])), cum = [0];
            for (let k = 1; k < n; k++) cum.push(cum[k - 1] + hypot(r.pts[k][0] - r.pts[k - 1][0], r.pts[k][1] - r.pts[k - 1][1]));
            let a = 0, b = n - 1;
            const firstX = (from, step, okD) => { for (let k = from; k >= 0 && k < n; k += step) if (r.cr[k] && d[k] >= okD) return k; return -1; };
            if (r.ea) { let k = 0; while (k < n && d[k] < DK) k++; if (k >= n || cum[k] > 42) a = firstX(0, 1, DK - 4); }
            else a = firstX(0, 1, 0);
            if (r.eb) { let k = n - 1; while (k >= 0 && d[k] < DK) k--; if (k < 0 || cum[n - 1] - cum[k] > 42) b = firstX(n - 1, -1, DK - 4); }
            else b = firstX(n - 1, -1, 0);
            if (a < 0 || b < 0 || b <= a) continue;
            if (!r.cr.slice(a, b + 1).some(Boolean)) continue;                          // (pedaço sem nenhum cruzamento: sobra solta)
            out.push(r.pts.slice(a, b + 1));
        }
        return out;
    },
    // ILHA: a Av. Litorânea é a curva a 30–64 u da água (a faixa de praia varia), fechada em volta da ilha; as 3 pontes chegam nela
    // (o ponto mais a oeste dela na altura de cada uma). Dentro, a grade da ilha deformada por um lençol suave (todas as ruas curvas),
    // recortada pela avenida como as da cidade.
    _islandPlan(P, ix, iz) {
        const F = (a, b, sd, o = 3) => WorldMap._fbm(a, b, o, sd), F2 = (a, b, sd) => WorldMap._fbm(a, b, 2, sd) * 2 - 1;
        const f = (x, z) => (x < 330 || !WorldMap.isLand(x, z) ? -30 : WorldMap.seaDist(x, z) - (30 + 34 * F(x / 150, z / 150, 521)));
        const X0 = 340, Z0 = -1060, st = 6;
        let L = WorldMap.contour(f, X0, Z0, Math.ceil((880 - X0) / st), Math.ceil((1160 - Z0) / st), st, 0)[0];
        L = WorldMap.simplifyLoop(L, 1.5);
        for (let k = 0; k < 3; k++) L = this._chaikinLoop(L);
        const R = RuralRoads._resample(L.concat([L[0]]), 6);
        R[R.length - 1] = R[0].slice();                                             // (fechada: o último ponto é o primeiro)
        this.islandPath = R;
        const O = this.islandO = this._outlineObj(R, R.slice(0, -1));
        P.addPath(R, 'ave', { name: 'Av. Litorânea', anchor: true });
        this.bridgeEnds = {};
        for (const z of [714, 0, -630]) {
            let bx = Infinity;
            for (let i = 0; i + 1 < R.length; i++) { const a = R[i], b = R[i + 1]; if ((a[1] < z) === (b[1] < z)) continue; const x = a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]); if (x > 300 && x < bx) bx = x; }
            this.bridgeEnds[z] = bx;
            P.addH(z, 168, bx, 'bridge');
        }
        const warp = (u, v) => [u + 30 * F2(u / 220, v / 220, 531), v + 26 * F2(u / 220 + 9.7, v / 220 + 3.3, 532)];
        const mid = ix.reduce((b, q) => (Math.abs(q - 612) < Math.abs(b - 612) ? q : b), ix[0]);
        const line = (vert, c, a, b, at) => {
            const vs = new Set(), Lp = [], cross = new Set(), atS = new Set(at);
            for (let v = a; v < b; v += 6) vs.add(Math.round(v * 100) / 100);
            vs.add(b); for (const q of at) if (q >= a && q <= b) vs.add(q);
            [...vs].sort((p, q) => p - q).forEach((v, i) => { Lp.push(vert ? warp(c, v) : warp(v, c)); if (atS.has(v)) cross.add(i); });
            return { L: Lp, cross };
        };
        let n = 0;
        for (const x of ix) { const { L: Lp, cross } = line(true, x, iz[0] - 40, iz[iz.length - 1] + 40, iz); for (const q of this._clipLine(Lp, cross, O)) { P.addPath(q, x === mid ? 'ave' : 'isl', { name: x === mid ? 'Av. Central da Ilha' : this._gridName(true, x, true) }); n++; } }
        for (const z of iz) { const { L: Lp, cross } = line(false, z, ix[0] - 40, ix[ix.length - 1] + 40, ix); for (const q of this._clipLine(Lp, cross, O)) { P.addPath(q, 'isl', { name: this._gridName(false, z, true) }); n++; } }
        console.log(`[ILHA] Av. Litorânea com ${R.length} pontos; ${n} ruas curvas`);
    },

    // As ruas da cidade, recortadas pela mancha: grade reta no meio (do viaduto ao miolo antigo, z ∈ [zA, 210]) e nas duas colunas da
    // orla; nos bairros do NORTE e do extremo SUL a mesma grade deformada por um "lençol" suave (as ruas fazem curvas, os quarteirões
    // acompanham). Retas viram addV/addH; curvas, vias livres.
    _cityStreets(P, cx, cz, aveX, aveZ, zA) {
        const B = this.CITY, ZN = 210, ss = (a, b, v) => WorldMap._ss(a, b, v), F = (a, b, sd) => WorldMap._fbm(a, b, 2, sd) * 2 - 1;
        const XE = cx[cx.length - 2], straightX = new Set([cx[cx.length - 2], cx[cx.length - 1]]);
        const warp = (u, v) => {
            const t = (1 - ss(XE - 66, XE - 10, u)) * (v > ZN ? ss(ZN, ZN + 90, v) : (v < zA ? ss(zA, zA - 90, v) : 0));
            return t <= 0 ? [u, v] : [u + 36 * t * F(u / 240, v / 240, 511), v + 30 * t * F(u / 240 + 17.3, v / 240 + 4.1, 512)];
        };
        const cls = (vert, at) => ((vert ? aveX.has(at) : aveZ.has(at)) ? 'ave' : 'city');
        // linha param.: de a até b no eixo (u ou v), cruzamentos em `at`; amostras a cada 6 u (vértices exatos nos cruzamentos)
        const line = (vert, c, a, b, at) => {
            const vs = new Set(), L = [], cross = new Set();
            for (let v = a; v < b; v += 6) vs.add(Math.round(v * 100) / 100);
            vs.add(b); for (const q of at) if (q >= a && q <= b) vs.add(q);
            const list = [...vs].sort((p, q) => p - q), atS = new Set(at);
            list.forEach((v, i) => { L.push(vert ? warp(c, v) : warp(v, c)); if (atS.has(v)) cross.add(i); });
            return { L, cross };
        };
        const add = (vert, c, pieces, curved) => {
            for (const q of pieces) {
                if (!curved) { if (vert) P.addV(c, q[0][1], q[q.length - 1][1], cls(true, c)); else P.addH(c, q[0][0], q[q.length - 1][0], cls(false, c)); }
                else P.addPath(q, cls(vert, c), { name: this._gridName(vert, c) });
            }
        };
        let nCurve = 0;
        for (const x of cx) {
            if (straightX.has(x)) { const { L, cross } = line(true, x, B.z0 - 60, B.z1 + 60, cz); add(true, x, this._clipLine(L, cross), false); continue; }
            { const { L, cross } = line(true, x, zA, ZN, cz); add(true, x, this._clipLine(L, cross), false); }
            { const { L, cross } = line(true, x, ZN, B.z1 + 60, cz); const pc = this._clipLine(L, cross); add(true, x, pc, true); nCurve += pc.length; }
            { const { L, cross } = line(true, x, B.z0 - 60, zA, cz); const pc = this._clipLine(L, cross); add(true, x, pc, true); nCurve += pc.length; }
        }
        for (const z of cz) {
            const curved = z > ZN || z < zA, { L, cross } = line(false, z, B.x0 - 60, B.x1, cx);
            cross.add(L.length - 1);                                                    // (acaba na Beira-Mar)
            const pc = this._clipLine(L, cross);
            add(false, z, pc, curved); if (curved) nCurve += pc.length;
        }
        console.log(`[CIDADE] contorno: ${this.cityPath.length} pontos; ${nCurve} ruas curvas`);
    },

    // ================================================================== túneis
    // Onde uma rodovia atravessa uma serra alta (relevo CRU > 24 u por 70+ u), o trecho vira TÚNEL: o relevo não é achatado
    // ali, os paredões saem do corredor e o WorldBuilder cobre a pista com um maciço de pedra com portais (os carros somem lá dentro).
    _planTunnels() {
        const T = RoadPlan.tunnels = [], Q = {};
        for (const e of RoadPlan.edges) {
            if (e.cls !== 'hwy' || T.length >= 8) continue;
            const pt = (s) => { RoadPlan.at(e, s, Q); return [Q.x, Q.z]; };
            let s = 0;
            while (s < e.len) {
                const [x, z] = pt(s);
                if (WorldMap._rawHeight(x, z) <= 26) { s += 8; continue; }
                let e1 = s; while (e1 < e.len && WorldMap._rawHeight(...pt(e1)) > 22) e1 += 8;
                const a = Math.max(s + 14, (e.cutA || 0) + 35), b = Math.min(e1 - 14, a + 170, e.len - (e.cutB || 0) - 35);      // (boca longe dos cruzamentos: quem vira não raspa no paredão)
                if (b - a >= 70 && !T.some((q) => q.edge === e && Math.abs(q.a - a) < 60)) {
                    const pts = [];                                                      // eixo do túnel (via livre: segue a curva)
                    for (let q = a; q < b; q += 4) pts.push(pt(q));
                    pts.push(pt(b));
                    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
                    T.push({ edge: e, v: e.v, free: !!e.free, a, b, pts, x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs), w: e.w });
                }
                s = e1 + 40;
            }
        }
        // Retângulos de via (relevo): o trecho do túnel não achata a serra.
        for (const t of T) {
            if (t.free) { for (const r of this.roadRects) if (r.edge === t.edge && r.s1 > t.a && r.s0 < t.b) { r.flat = false; r.tunnel = true; } continue; }
            const r = this.roadRects.find((q) => q.edge === t.edge);
            if (!r) continue;
            const hw = t.w / 2, split = (x0, z0, x1, z1, flat) => this.roadRects.push({ x0, z0, x1, z1, cls: 'hwy', flat, edge: t.edge, tunnel: !flat });
            this.roadRects.splice(this.roadRects.indexOf(r), 1);
            if (t.v) { split(r.x0, r.z0, r.x1, t.z0, true); split(r.x0, t.z0, r.x1, t.z1, false); split(r.x0, t.z1, r.x1, r.z1, true); }
            else { split(r.x0, r.z0, t.x0, r.z1, true); split(t.x0, r.z0, t.x1, r.z1, false); split(t.x1, r.z0, r.x1, r.z1, true); }
        }
    },

    // ================================================================= quarteirões
    // Pseudo-aleatório determinístico (0..1) — layout estável entre reloads.
    _rand(i, j) {
        const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
        return n - Math.floor(n);
    },

    // Bioma da cidade ANTIGA (i, j = índices da grade 8×10 antiga): preservado igual ao jogo original.
    _biomeOld(i, j) {
        const c = this.OLD;
        const r = this._rand(i, j);
        const edge = i === 0 || j === 0 || i === c.cols - 1 || j === c.rows - 1;
        if (edge) return r < 0.5 ? 'beach' : (r < 0.78 ? 'port' : 'forest');
        const u = ((i + 0.5) / c.cols) * 2 - 1;
        const v = ((j + 0.5) / c.rows) * 2 - 1;
        const d = hypot(u, v * 0.8);
        if (d < 0.46) return r < 0.1 ? 'park' : 'downtown';
        if (u > 0.28 && v < 0.15) return r < 0.16 ? 'forest' : 'industrial';
        if (r < 0.15) return r < 0.07 ? 'forest' : 'park';
        return 'residential';
    },

    // Bioma de um quarteirão novo da cidade (fora do miolo antigo), pela posição (x, z) e um sorteio r.
    _biomeCity(x, z, r) {
        const d = hypot((x - 0) / 230, (z - 40) / 360);                // distância ao coração do centro
        if (d < 0.9) return r < 0.08 ? 'park' : 'downtown';
        if (d < 1.9) return r < 0.07 ? 'park' : (r < 0.62 ? 'commercial' : 'residential');
        if (z < -560 && x > -140) return r < 0.1 ? 'forest' : (r < 0.55 ? 'industrial' : 'port');          // zona industrial/portuária ao sul
        if (r < 0.1) return r < 0.05 ? 'forest' : 'park';
        return r < 0.4 ? 'commercial' : 'residential';
    },

    _biomeIsland(x, z, r) {
        if (r < 0.14) return 'park';
        return 'resort';
    },

    // Bioma (e semente) de um quarteirão da cidade na célula [x0,z0,x1,z1] da grade (ou na caixa da face, fora da grade).
    _pickCity(x0, z0, x1, z1) {
        const O = this.OLD, legacy = !!Config.world.legacyPlan, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        const inOld = x0 >= O.minX - 1e-6 && x1 <= O.maxX + 1e-6 && z0 >= O.minZ - 1e-6 && z1 <= O.maxZ + 1e-6;
        if (inOld) {
            const oi = Math.round((x0 - O.minX) / O.pitch), oj = Math.round((z0 - O.minZ) / O.pitch);
            const eastEdge = oi === O.cols - 1;                                                 // a coluna do mar fica como era (praia/porto/mata)
            const b = (legacy || eastEdge) ? this._biomeOld(oi, oj) : (oi === 0 || oj === 0 || oj === O.rows - 1 ? this._biomeCity(cx, cz, this._rand(oi, oj)) : this._biomeOld(oi, oj));
            return { biome: b, si: oi, sj: oj };
        }
        const gi = Math.round(x0) + 3000, gj = Math.round(z0) + 3000;
        const east = Math.abs(x1 - 168) < 1e-6;                                                 // a coluna do mar (x 126..168) é praia/porto/mata
        const r = this._rand(gi, gj);
        let biome = east ? (r < 0.5 ? 'beach' : (r < 0.78 ? 'port' : 'forest')) : this._biomeCity(cx, cz, r);
        if (!east && Math.max(x1 - x0, z1 - z0) >= 66 && biome !== 'downtown' && this._rand(gi + 5, gj + 9) < 0.55) biome = z0 < -560 ? (r < 0.5 ? 'industrial' : 'port') : (r < 0.5 ? 'park' : 'forest');      // quarteirão grande: parque, mata ou complexo industrial
        return { biome, si: gi, sj: gj };
    },
    _pickIsland(i, j, x0, z0, x1, z1) {
        const r = this._rand(i + 400, j + 400);
        return { biome: this._biomeIsland((x0 + x1) / 2, (z0 + z1) / 2, r), si: i + 400, sj: j + 400 };
    },
    _cellKey(x0, z0, x1, z1) { return Math.round(x0 * 10) + ',' + Math.round(z0 * 10) + ',' + Math.round(x1 * 10) + ',' + Math.round(z1 * 10); },

    // Cria um quarteirão no retângulo de linhas [x0,z0,x1,z1] do distrito `d` (se as 4 ruas existem). Devolve o bloco ou null.
    _makeBlock(d, i, j, x0, z0, x1, z1, biome, seedI, seedJ) {
        const P = RoadPlan;
        const wl = P.roadSpan('v', x0, z0, z1), wr = P.roadSpan('v', x1, z0, z1), wb = P.roadSpan('h', z0, x0, x1), wt = P.roadSpan('h', z1, x0, x1);
        if (!wl || !wr || !wb || !wt) return null;
        const def = this.BIOMES[biome], sw = d.sw;
        const s = [x0 + wl / 2, z0 + wb / 2, x1 - wr / 2, z1 - wt / 2];
        const block = {
            id: d.id + ':' + i + ',' + j, district: d.id, i: seedI, j: seedJ, biome, open: def.open, ground: def.ground,
            slab: s, foot: [s[0] + sw, s[1] + sw, s[2] - sw, s[3] - sw], ins: [wl, wb, wr, wt], sw,
            lots: [], props: [],
        };
        block.r = Math.max(0, Math.min(d.id === 'favela' ? 2.5 : (def.open ? 12 : 9), (s[2] - s[0]) / 4, (s[3] - s[1]) / 4));          // raio dos cantos (meio-fio arredondado)
        this.urbanBoxes.push([x0 - wl / 2, z0 - wb / 2, x1 + wr / 2, z1 + wt / 2, d.id !== 'favela']);      // [4] = achata o relevo? (a favela segue o morro)
        return block;
    },

    _buildBlocks(favela = true) {
        const cells = [];
        const rngFor = (i, j) => Pixel.rng(Math.floor(this._rand(i + 3, j + 11) * 1e9));
        // Faces do grafo de ruas: as que são exatamente uma célula da grade viram o quarteirão retangular de sempre (sweep); as outras
        // (cortadas por diagonal, curva, borda orgânica) viram quarteirões em POLÍGONO (_faceBlocks).
        const faces = this._faces(), rectCells = new Set();
        for (const f of faces) if (f.rect) rectCells.add(f.rect);
        const sweep = (d, pick) => {
            for (let i = 0; i + 1 < d.xs.length; i++) for (let j = 0; j + 1 < d.zs.length; j++) {
                const x0 = d.xs[i], x1 = d.xs[i + 1], z0 = d.zs[j], z1 = d.zs[j + 1];
                if (d.skip && d.skip(x0, z0, x1, z1)) continue;
                if (!rectCells.has(this._cellKey(x0, z0, x1, z1))) continue;              // não é uma face reta (cortada/curva): vai pelas faces
                const p = pick(i, j, x0, z0, x1, z1);
                const b = this._makeBlock(d, i, j, x0, z0, x1, z1, p.biome, p.si, p.sj);
                if (b) cells.push(b);
            }
        };
        sweep(this.districts.city, (i, j, x0, z0, x1, z1) => this._pickCity(x0, z0, x1, z1));
        if (this.districts.island) sweep(this.districts.island, (i, j, x0, z0, x1, z1) => this._pickIsland(i, j, x0, z0, x1, z1));
        this._faceBlocks(faces, cells);

        this._pickLandmarks(cells);
        this._pickStations(cells);
        for (const block of cells) {
            const rng = rngFor(block.i, block.j);
            if (block.station) { this._station(block, rng); this._fillProps(block, rng); block.props = []; this.blocks.push(block); continue; }       // posto: sem lotes comuns, árvores nem quintal
            if (block.poly) {                                                        // quarteirão em polígono: lotes empacotados na pegada
                if (!block.open) this._packLots(block, rng);
                if (!block.open) this._addShops(block, Pixel.rng(Math.floor(this._rand(block.i + 55, block.j + 77) * 1e9)));
                this._fillProps(block, rng);
                this.blocks.push(block);
                continue;
            }
            if (block.id === SafeHouse.blockId) {                                  // a safe house do protagonista: uma casa só, com interior (ver SafeHouse.js)
                SafeHouse.plan(block, this);
                this._fillProps(block, rng);
                block.props = block.props.filter((p) => !SafeHouse.crowds(p));          // sem árvore/lixo/poste em cima do corte da casa
                this._fillYard(block, Pixel.rng(Math.floor(this._rand(block.i + 91, block.j + 37) * 1e9)));
                this.blocks.push(block);
                continue;
            }
            if (!block.open) { this._fillLots(block, rng); this._addShops(block, Pixel.rng(Math.floor(this._rand(block.i + 55, block.j + 77) * 1e9))); }
            this._fillProps(block, rng);
            if (!block.open) this._fillYard(block, Pixel.rng(Math.floor(this._rand(block.i + 91, block.j + 37) * 1e9)));
            this.blocks.push(block);
        }
        if (favela && this._favela) for (const f of Favelas.list) f.build(this);                         // FAVELA: becos, barracos e a safe house (quarteirões 'organic'; nos passos, à parte)
    },

    // ============================================================ postos de gasolina
    // Alguns quarteirões comerciais/residenciais/industriais grandes viram POSTO (espaçados ≥ 300 u): conveniência ao fundo (norte),
    // cobertura vermelha com 4 bombas na frente. `CityGrid.stations` = { x, z, pumps: [{ x, z }], zone: [x0, z0, x1, z1], name }
    // (o RuralPlan acrescenta os das rodovias). Quem enche o tanque é o Game (_fuelUpdate).
    _pickStations(cells) {
        this.stations = [];
        // (quarteirão em polígono: o maior retângulo que cabe na pegada, se for grande o bastante)
        const room = (b) => { if (!b.poly) return b.foot[2] - b.foot[0] >= 20 && b.foot[3] - b.foot[1] >= 26; const r = b.footPoly && this._footRect(b); if (!r || r[2] - r[0] < 22 || r[3] - r[1] < 28) return false; b._stationRect = r; return true; };
        const ok = cells.filter((b) => !b.open && !b.landmark && !this.landmarkCells[b.id] && (b.district === 'city' || b.district === 'island')
            && ['commercial', 'residential', 'industrial', 'resort'].includes(b.biome) && room(b));
        ok.sort((a, b) => this._rand(a.i + 21, a.j + 5) - this._rand(b.i + 21, b.j + 5));
        const picked = [];
        for (const b of ok) {
            const x = (b.slab[0] + b.slab[2]) / 2, z = (b.slab[1] + b.slab[3]) / 2;
            if (picked.length >= 24 || picked.some((p) => hypot(p.x - x, p.z - z) < 230)) continue;
            picked.push({ x, z }); b.station = true;
        }
    },

    // Maior retângulo (alinhado aos eixos, grade de 1 u) dentro da pegada de um quarteirão em polígono: [x0, z0, x1, z1] ou null.
    _footRect(b) {
        const F = b.footPoly, [fx0, fz0, fx1, fz1] = b.foot, W = Math.floor(fx1 - fx0), H = Math.floor(fz1 - fz0);
        if (W < 4 || H < 4) return null;
        const r = this._maxRect(this._rasterPoly(F, fx0, fz0, W, H), W, H);
        return r ? [fx0 + r.i, fz0 + r.j, fx0 + r.i + r.w, fz0 + r.j + r.h] : null;
    },

    _station(block, rng) {
        const [fx0, fz0, fx1, fz1] = block._stationRect || block.foot, cx = (fx0 + fx1) / 2, cz = fz0 + 10.5;
        const colors = [[0.85, 0.2, 0.18], [0.18, 0.5, 0.82], [0.9, 0.7, 0.12], [0.2, 0.62, 0.38]], color = colors[Math.floor(rng() * colors.length)];
        // loja ao fundo (norte), com vitrines voltadas para a cobertura
        const hw = Math.min(9, (fx1 - fx0 - 2) / 2), k = hw / 9;
        this._addLot(block, cx - hw, fz1 - 10, cx + hw, fz1 - 2, 1, 'concrete1', 'conc1');
        const lot = block.lots[block.lots.length - 1];
        lot.shops = hw >= 9 ? [{ side: 'S', a: lot.x0 + 2, kind: 1 }, { side: 'S', a: lot.x0 + 9, kind: 0 }] : [{ side: 'S', a: lot.x0 + 1, kind: 1 }];
        this._carveDoors(lot);
        // cobertura (4,6 u) sobre 4 bombas em linha, x = cx ± 2/6
        block.canopies = [{ x0: cx - hw, z0: cz - 5, x1: cx + hw, z1: cz + 5, h: 4.6, color }];
        block.towers = [{ kind: 'sign', x: fx0 + 2, z: fz0 + 2 }];
        const pumps = [];
        for (const dx of [-6.5 * k, -2.2 * k, 2.2 * k, 6.5 * k]) {
            const px = cx + dx, pz = cz;
            this.obstacles.push({ x0: px - 0.5, z0: pz - 0.5, x1: px + 0.5, z1: pz + 0.5, h: 1.6 });
            block.towers.push({ kind: 'pump', x: px, z: pz });
            pumps.push({ x: px, z: pz });
        }
        this.obstacles.push({ x0: fx0 + 1.8, z0: fz0 + 1.8, x1: fx0 + 2.2, z1: fz0 + 2.2, h: 8 });
        const name = 'Posto ' + ['Rápido', 'Sol', 'Central', 'Estrela', 'Brasa', 'Litoral', 'Ponte', 'Norte', 'Veloz', 'Tigre', 'Alvorada', 'Pioneiro'][Math.abs(Math.round(cx / 7 + cz)) % 12];
        this.stations.push({ x: cx, z: cz, pumps, zone: [cx - hw - 4, cz - 9, cx + hw + 4, cz + 9], name });
        block.stationName = name;
    },

    // ============================================================ lojas
    // Toldo das lojas: sai 1,5 u da parede, de y0 a y1. Alto o bastante para um adulto passar por baixo (MapGeo.coverAt esconde quem
    // está debaixo dele inteiro, sem a cabeça furar o toldo).
    AWNING: { depth: 1.5, y0: 3.0, y1: 3.25 },
    // Retângulo [x0, z0, x1, z1] coberto pelo toldo da loja `s` do lote `l`.
    awningRect(l, s) {
        const D = this.AWNING.depth, a = s.a, b = s.a + 6;
        if (s.side === 'S') return [a, l.z0 - D, b, l.z0];
        if (s.side === 'N') return [a, l.z1, b, l.z1 + D];
        if (s.side === 'W') return [l.x0 - D, a, l.x0, b];
        return [l.x1, a, l.x1 + D, b];
    },

    // Lados do lote num quarteirão em polígono, com a "distância até a calçada" de cada um (o lado inteiro tem de estar a ≤ 2,5 u dela:
    // pontas e meio da parede, 2,5 u para fora, já fora da pegada).
    _polySides(block, l) {
        const F = block.footPoly, out = (x, z) => !RoadPlan.inPoly(F, x, z);
        const g = (pts) => (pts.every((p) => out(p[0], p[1])) ? 0 : 99);
        const xm = (l.x0 + l.x1) / 2, zm = (l.z0 + l.z1) / 2, o = 2.5;
        return [['S', g([[l.x0 + 1, l.z0 - o], [xm, l.z0 - o], [l.x1 - 1, l.z0 - o]]), l.x0, l.x1], ['N', g([[l.x0 + 1, l.z1 + o], [xm, l.z1 + o], [l.x1 - 1, l.z1 + o]]), l.x0, l.x1],
            ['W', g([[l.x0 - o, l.z0 + 1], [l.x0 - o, zm], [l.x0 - o, l.z1 - 1]]), l.z0, l.z1], ['E', g([[l.x1 + o, l.z0 + 1], [l.x1 + o, zm], [l.x1 + o, l.z1 - 1]]), l.z0, l.z1]];
    },
    // Porta de um lote na calçada: { x, z, side, face } (face = para onde olha quem sai) ou null se o lote não encosta na calçada.
    lotDoor(b, l) {
        const f = b.foot, s = b.slab, cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2, F = { W: -Math.PI / 2, E: Math.PI / 2, S: Math.PI, N: 0 };
        if (b.footPoly) {
            const sd = this._polySides(b, l).filter((q) => q[1] === 0);
            if (!sd.length) return null;
            const side = sd.sort((p, q) => (q[3] - q[2]) - (p[3] - p[2]))[0][0], n = { W: [-1, 0], E: [1, 0], S: [0, -1], N: [0, 1] }[side];
            const wx = side === 'W' ? l.x0 : side === 'E' ? l.x1 : cx, wz = side === 'S' ? l.z0 : side === 'N' ? l.z1 : cz;
            let t = 1; while (t < 8 && RoadPlan.inPoly(b.footPoly, wx + n[0] * t, wz + n[1] * t)) t += 0.5;
            const x = wx + n[0] * (t + b.sw / 2), z = wz + n[1] * (t + b.sw / 2);
            return RoadPlan.inPoly(b.poly, x, z) ? { x, z, side, face: F[side] } : { x: wx + n[0] * (t + 0.6), z: wz + n[1] * (t + 0.6), side, face: F[side] };
        }
        if (Math.min(l.x0 - f[0], f[2] - l.x1, l.z0 - f[1], f[3] - l.z1) > 2.5) return null;     // só lotes na beira da quadra (porta na calçada)
        const side = [[cx - f[0], 'W'], [f[2] - cx, 'E'], [cz - f[1], 'S'], [f[3] - cz, 'N']].sort((a, c) => a[0] - c[0])[0][1];
        const d = side === 'W' ? { x: (s[0] + f[0]) / 2, z: cz } : side === 'E' ? { x: (s[2] + f[2]) / 2, z: cz } : side === 'S' ? { x: cx, z: (s[1] + f[1]) / 2 } : { x: cx, z: (s[3] + f[3]) / 2 };
        return Object.assign(d, { side, face: F[side] });
    },

    _gymKind() { return this._gk != null ? this._gk : (this._gk = TileFactory.SHOPS.findIndex((s) => s.id === 'academia')); },

    // Térreo comercial: nas paredes do prédio voltadas para a calçada, vitrines de 6 u (letreiro, vitrine, porta) com toldo.
    // `lot.shops` = [{ side:'S'|'N'|'W'|'E', a: início ao longo da parede, kind: índice em TileFactory.SHOPS }]. As lojas de
    // alguns tipos viram pontos de interesse no mapa (lanchonete, conveniência, Pay n Pay).
    _addShops(block, rng) {
        const P = { commercial: 1.0, downtown: 0.55, resort: 0.5, residential: 0.1, industrial: 0.12, port: 0.0, favela: 0.45 }[block.biome] || 0;
        if (!P) return;
        const SH = TileFactory.SHOPS, [fx0, fz0, fx1, fz1] = block.foot;
        const kinds = {
            commercial: [0, 1, 2, 3, 4, 5, 6, 7, 1, 0, 6, 9, 10, 11, 10, 12], downtown: [4, 2, 3, 7, 0, 1, 5, 12, 13, 12, 9, 13], resort: [0, 5, 6, 3, 7, 0, 12, 13, 11, 13], residential: [1, 6, 0, 2, 10, 11], industrial: [8, 8, 1, 9], favela: [5, 0, 1, 6, 14, 14, 5, 2, 2],
        }[block.biome];
        for (const lot of block.lots) {
            if (lot.landmark) continue;
            const sides = block.footPoly ? this._polySides(block, lot) : [['S', lot.z0 - fz0, lot.x0, lot.x1], ['N', fz1 - lot.z1, lot.x0, lot.x1], ['W', lot.x0 - fx0, lot.z0, lot.z1], ['E', fx1 - lot.x1, lot.z0, lot.z1]];
            lot.shops = [];
            for (const [side, gap, a0, a1] of sides) {
                if (gap > 2.5 || rng() > P) continue;                                    // só as paredes encostadas na calçada
                const n = Math.min(3, Math.floor((a1 - a0 - 0.6) / 6.2));
                const start = a0 + ((a1 - a0) - n * 6) / 2;
                for (let k = 0; k < n; k++) {
                    if (rng() > 0.85) continue;
                    let kind = kinds[Math.floor(rng() * kinds.length)];
                    const a = start + k * 6;
                    // ACADEMIAS: ~1% das lojas (umas 20 na cidade) (sorteio pela posição — não mexe no rng: o resto da cidade fica igual)
                    if (block.biome !== 'industrial' && Pixel.hash(Math.round(a * 10), Math.round(lot.z0 * 10) + (side.charCodeAt(0) << 8), 77) < 0.012) kind = this._gymKind();
                    lot.shops.push({ side, a, kind });
                    if ((kind === 0 || kind === 5 || kind === 6 || kind === 10) && block.biome !== 'favela' && rng() < 0.6) {                     // mesas com guarda-sol na calçada (lanchonete, bar, padaria)
                        const m = a + 3, o = 2.7;
                        block.props.push({ type: 'prop', kind: 'umbrella', x: side === 'W' ? lot.x0 - o : (side === 'E' ? lot.x1 + o : m), z: side === 'S' ? lot.z0 - o : (side === 'N' ? lot.z1 + o : m), s: 0.8, seed: Math.floor(rng() * 1000) });
                    }
                }
            }
            if (lot.shops.length) this._carveDoors(lot);
        }
    },

    // ============================================================ prédios especiais
    // Hospital (onde você acorda depois de morrer) e delegacia (depois de ser preso): cada um ocupa um quarteirão urbano perto
    // do centro, com a fachada para o SUL e a calçada da frente como ponto de nascimento. (Mesmos quarteirões do jogo original.)
    _pickLandmarks(cells) {
        const cand = cells.filter((b) => b.district === 'city' && !b.open && !b.poly && b.slab[0] > -170 && b.slab[2] < 170 && b.slab[1] > -212 && b.slab[3] < 212 && b.i < 100);
        const near = (tx, tz, skip) => cand.filter((k) => k !== skip)
            .sort((a, b) => hypot((a.slab[0] + a.slab[2]) / 2 - tx, (a.slab[1] + a.slab[3]) / 2 - tz) - hypot((b.slab[0] + b.slab[2]) / 2 - tx, (b.slab[1] + b.slab[3]) / 2 - tz))[0];
        const h = near(-21, -21), s = near(21, 21, h);
        this.landmarkCells = {};
        this.landmarkCells[h.id] = 'hospital';
        this.landmarkCells[s.id] = 'station';
    },

    // Prédio especial `kind` ocupando o fundo do quarteirão (a frente, ao sul, fica um pátio de 6u).
    _landmark(block, kind) {
        const [fx0, fz0, fx1, fz1] = block.foot, [sx0, sz0, sx1] = block.slab;
        const hosp = kind === 'hospital';
        this._addLot(block, fx0 + 1, fz0 + 6, fx1 - 1, fz1 - 1, hosp ? 6 : 4, hosp ? 'hospital' : 'station', hosp ? 'hosp' : 'police');
        block.lots[block.lots.length - 1].landmark = kind;
        block.landmark = { kind, spawn: { x: (sx0 + sx1) / 2, z: sz0 + 2.2 }, face: 0 };    // calçada da frente, olhando p/ o prédio (norte)
    },

    // Ponto de nascimento (calçada em frente) do prédio especial `kind`.
    landmarkSpawn(kind) {
        const b = this.blocks.find((k) => k.landmark && k.landmark.kind === kind);
        const s = b.landmark.spawn;
        return new BABYLON.Vector3(s.x, 0, s.z);
    },

    // ================================================================= cruzamentos
    // Cada cruzamento é um NÓ do RoadPlan (com as 4 pernas N, S, L, O). Os urbanos têm faixas de pedestres nos braços que
    // existem e 4 postes de semáforo nos cantos. Fonte única: o mundo 3D, a navegação, os semáforos e os pedestres leem isto.
    //
    // Faixa de um braço N/S: pedestre anda em X atravessando a rua N-S ('ns').
    // Faixa de um braço L/O: pedestre anda em Z atravessando a rua L-O ('ew').
    _buildIntersections() {
        const zl = 3, rng = Pixel.rng(4242);
        this.intersections = RoadPlan.nodes;
        this.crosswalks = [];
        for (const e of RoadPlan.edges) {
            const hw = e.w / 2;
            if (e.free) {                                                        // via livre: retângulos curtos ao longo da polilinha
                for (let s = 0; s < e.len; s += 12) {
                    const p = RoadPlan.at(e, s), q = RoadPlan.at(e, Math.min(e.len, s + 12));
                    this.roadRects.push({ x0: Math.min(p.x, q.x) - hw, x1: Math.max(p.x, q.x) + hw, z0: Math.min(p.z, q.z) - hw, z1: Math.max(p.z, q.z) + hw, cls: e.cls, flat: e.cls !== 'fav', edge: e, s0: s, s1: Math.min(e.len, s + 12) });
                }
                continue;
            }
            const x0 = Math.min(e.a.x, e.b.x), x1 = Math.max(e.a.x, e.b.x), z0 = Math.min(e.a.z, e.b.z), z1 = Math.max(e.a.z, e.b.z);
            this.roadRects.push({ x0: e.v ? x0 - hw : x0, x1: e.v ? x1 + hw : x1, z0: e.v ? z0 : z0 - hw, z1: e.v ? z1 : z1 + hw, cls: e.cls, flat: e.cls !== 'fav', edge: e });
        }
        for (const inter of this.intersections) {
            const { x, z, hwNS, hwEW } = inter;
            inter.offset = rng() * 60;
            inter.crosswalks = []; inter.poles = [];
            inter.signal = inter.legs >= 3 && !inter.round;                      // a IA cede a vez pelo ciclo (também fora da cidade); rotatória: sem semáforo
            inter.visible = inter.signal && (inter.kinds.has('urban') || inter.kinds.has('bridge'));      // postes/faixas só onde é urbano
            if (inter.round) { this._roundCrossings(inter); continue; }
            if (!inter.visible) continue;
            if (inter.gen) { this._genCrossings(inter); continue; }
            const arms = [
                { arm: 'N', leg: 0, rect: [x - hwNS, z + hwEW, x + hwNS, z + hwEW + zl], axis: 'x', crosses: 'ns' },
                { arm: 'S', leg: 1, rect: [x - hwNS, z - hwEW - zl, x + hwNS, z - hwEW], axis: 'x', crosses: 'ns' },
                { arm: 'E', leg: 2, rect: [x + hwNS, z - hwEW, x + hwNS + zl, z + hwEW], axis: 'z', crosses: 'ew' },
                { arm: 'W', leg: 3, rect: [x - hwNS - zl, z - hwEW, x - hwNS, z + hwEW], axis: 'z', crosses: 'ew' },
            ];
            for (const d of arms) {
                if (!inter.nbr[d.leg] || inter.edge[d.leg].cls === 'fav' || inter.edge[d.leg].layer) continue;
                const cw = Object.assign({ id: this.crosswalks.length, inter }, d);
                cw.x0 = d.rect[0]; cw.z0 = d.rect[1]; cw.x1 = d.rect[2]; cw.z1 = d.rect[3];
                inter.crosswalks.push(cw);
                this.crosswalks.push(cw);
            }
            // Postes nos 4 cantos (sobre a calçada, junto ao meio-fio).
            for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
                const px = x + sx * (hwNS + 0.55), pz = z + sz * (hwEW + 0.55);
                inter.poles.push({ x: px, z: pz, sx, sz });
                this.obstacles.push({ x0: px - 0.18, z0: pz - 0.18, x1: px + 0.18, z1: pz + 0.18, h: 5.2 });
            }
        }
    },

    // ROTATÓRIA: o disco achata o relevo; faixas de pedestres (sem semáforo — o carro para para quem está nela) nos braços de rua,
    // um carro antes da linha de "dê a preferência" (as pontes não têm: a faixa ficaria sob o tabuleiro).
    _roundCrossings(inter) {
        const R = inter.round;
        this.roadRects.push({ x0: R.cx - R.R - 2, z0: R.cz - R.R - 2, x1: R.cx + R.R + 2, z1: R.cz + R.R + 2, cls: 'ave', flat: true, edge: null });
        for (const a of inter.arms) {
            const e = a.e, c0 = a.cut + 5.6;
            if (e.cls === 'bridge' || e.cls === 'fav' || e.layer || e.len < c0 + 13) continue;
            const cw = this._armCrosswalk(inter, a, c0, c0 + 3);
            inter.crosswalks.push(cw);
            this.crosswalks.push(cw);
        }
    },

    // Faixa de pedestres atravessando a perna `a` entre c0 e c1 u do nó (perna de grade: retângulo comum; diagonal: girada, axis 'o').
    _armCrosswalk(inter, a, c0, c1) {
        let cw;
        if (a.q >= 0) {
            const p0 = [inter.x + a.dx * c0, inter.z + a.dz * c0], p1 = [inter.x + a.dx * c1, inter.z + a.dz * c1], v = a.q < 2;
            const rect = v ? [inter.x - a.hw, Math.min(p0[1], p1[1]), inter.x + a.hw, Math.max(p0[1], p1[1])] : [Math.min(p0[0], p1[0]), inter.z - a.hw, Math.max(p0[0], p1[0]), inter.z + a.hw];
            cw = { arm: ['N', 'S', 'E', 'W'][a.q], leg: a.q, rect, axis: v ? 'x' : 'z', crosses: v ? 'ns' : 'ew', x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3] };
        } else {
            const lx = -a.dz, lz = a.dx, cx = inter.x + a.dx * (c0 + c1) / 2, cz = inter.z + a.dz * (c0 + c1) / 2, hl = a.hw, hd = (c1 - c0) / 2;
            const ex = Math.abs(lx) * hl + Math.abs(a.dx) * hd, ez = Math.abs(lz) * hl + Math.abs(a.dz) * hd;
            cw = { arm: 'D', leg: -1, axis: 'o', cx, cz, ux: lx, uz: lz, dx: a.dx, dz: a.dz, hl, hd, x0: cx - ex, z0: cz - ez, x1: cx + ex, z1: cz + ez };
        }
        return Object.assign(cw, { id: this.crosswalks.length, inter, armIdx: a.idx });
    },

    // Nó com perna livre (diagonal): uma faixa de pedestres logo depois do corte de cada perna (perna de grade: retângulo comum;
    // diagonal: faixa girada, axis 'o') e um poste de semáforo por perna, no meio-fio à direita de quem chega (lente da fase dela).
    _genCrossings(inter) {
        const zl = 3;
        for (const a of inter.arms) {
            const e = a.e;
            if (e.cls === 'fav' || e.layer || e.len < a.cut + zl + 6) continue;
            const lx = -a.dz, lz = a.dx, cw = Object.assign(this._armCrosswalk(inter, a, a.cut, a.cut + zl), { phase: a.phase });
            inter.crosswalks.push(cw);
            this.crosswalks.push(cw);
            const px = inter.x + a.dx * (a.cut - 0.4) + lx * (a.hw + 0.55), pz = inter.z + a.dz * (a.cut - 0.4) + lz * (a.hw + 0.55);
            inter.poles.push({ x: px, z: pz, fx: a.dx, fz: a.dz, phase: a.phase, cw, sx: Math.sign(px - inter.x) || 1, sz: Math.sign(pz - inter.z) || 1 });
            this.obstacles.push({ x0: px - 0.18, z0: pz - 0.18, x1: px + 0.18, z1: pz + 0.18, h: 5.2 });
        }
    },

    // (x, z) dentro da faixa `cw` (com folga m)? (faixa girada: no referencial dela)
    inCw(cw, x, z, m = 0) {
        if (cw.axis !== 'o') return x > cw.x0 - m && x < cw.x1 + m && z > cw.z0 - m && z < cw.z1 + m;
        const rx = x - cw.cx, rz = z - cw.cz;
        return Math.abs(rx * cw.ux + rz * cw.uz) <= cw.hl + m && Math.abs(rx * cw.dx + rz * cw.dz) <= cw.hd + m;
    },

    // (x, z) dentro de alguma faixa de pedestres (com folga `m`)?
    inCrosswalk(x, z, m = 0.4) {
        const inter = this.intersectionNear(x, z, 30);
        if (!inter) return false;
        for (const cw of inter.crosswalks) if (this.inCw(cw, x, z, m)) return true;
        return false;
    },

    // Cruzamento cujo centro está a menos de `maxDist` (distância de xadrez) de (x, z), ou null.
    intersectionNear(x, z, maxDist = 13) {
        return RoadPlan.nodeNear(x, z, maxDist);
    },

    _snap(v) { return Math.max(6, Math.floor(v / 3) * 3); },

    // As portas das lojas são VÃOS no sólido do prédio (2,3 u de largura, 1,3 u de fundo): o jogador entra andando, sem encostar na parede.
    _carveDoors(lot) {
        const i = this.obstacles.findIndex((o) => o.x0 === lot.x0 && o.z0 === lot.z0 && o.x1 === lot.x1 && o.z1 === lot.z1);
        if (i < 0) return;
        const h = this.obstacles[i].h;
        let rects = [[lot.x0, lot.z0, lot.x1, lot.z1]];
        for (const s of lot.shops) {
            if (!Economy.KIND_STYLE[TileFactory.SHOPS[s.kind].id]) continue;                      // (lojas sem interior ficam com parede cheia)
            const m = s.a + 3, w = 1.15, d = 1.3;
            const g = s.side === 'S' ? [m - w, lot.z0, m + w, lot.z0 + d] : s.side === 'N' ? [m - w, lot.z1 - d, m + w, lot.z1] : s.side === 'W' ? [lot.x0, m - w, lot.x0 + d, m + w] : [lot.x1 - d, m - w, lot.x1, m + w];
            const out = [];
            for (const r of rects) {
                if (g[2] <= r[0] || g[0] >= r[2] || g[3] <= r[1] || g[1] >= r[3]) { out.push(r); continue; }
                if (g[0] > r[0]) out.push([r[0], r[1], g[0], r[3]]);
                if (g[2] < r[2]) out.push([g[2], r[1], r[2], r[3]]);
                const x0 = Math.max(r[0], g[0]), x1 = Math.min(r[2], g[2]);
                if (g[1] > r[1]) out.push([x0, r[1], x1, g[1]]);
                if (g[3] < r[3]) out.push([x0, g[3], x1, r[3]]);
            }
            rects = out;
        }
        this.obstacles.splice(i, 1, ...rects.map((r) => ({ x0: r[0], z0: r[1], x1: r[2], z1: r[3], h })));
    },

    _addLot(block, x0, z0, x1, z1, floors, facade, roof) {
        const h = floors * Config.city.floorH, obs = { x0, z0, x1, z1, h };
        block.lots.push({ x0, z0, x1, z1, floors, height: h, facade, roof, obs });
        this.obstacles.push(obs);
    },

    // ================================================================= quarteirões em polígono
    // FACES do grafo de ruas (é planar: o viaduto passa por cima e fica de fora). Cada meia-aresta é percorrida com a face à ESQUERDA:
    // no nó de chegada segue pela perna vizinha no sentido horário. Faces limitadas saem anti-horárias (área > 0); a de fora e as do
    // campo (grandes) ficam de fora. Cada face: { half: [{ e, fwd, n }], pts (eixo das ruas, anti-horário), area, urban, rect }.
    // urban = só ruas de cidade/ilha em volta; rect = é exatamente uma célula retangular da grade (chave _cellKey).
    URBAN_CLS: new Set(['city', 'ave', 'isl']),
    _faces(maxA = 40000) {
        const P = RoadPlan, seen = new Set(), out = [];
        const armsOf = (n) => n._farms || (n._farms = n.arms.filter((a) => !a.e.layer));
        for (const n0 of P.nodes) for (const a0 of armsOf(n0)) {
            if (seen.has(a0.e.id * 2 + (a0.e.a === n0 ? 0 : 1))) continue;
            const half = [], pts = [];
            let n = n0, a = a0, closed = false;
            for (let guard = 0; guard < 2000; guard++) {
                const e = a.e, fwd = e.a === n, k = e.id * 2 + (fwd ? 0 : 1);
                if (seen.has(k)) { closed = n === n0 && a === a0; break; }
                seen.add(k);
                half.push({ e, fwd, n });
                const E = e.pts;
                if (fwd) for (let i = 0; i + 1 < E.length; i++) pts.push(E[i]); else for (let i = E.length - 1; i > 0; i--) pts.push(E[i]);
                const m = a.to, A = armsOf(m), bi = A.findIndex((q) => q.e === e && q.to === n);
                if (bi < 0) break;
                n = m; a = A[(bi - 1 + A.length) % A.length];
            }
            if (!closed || half.length < 2) continue;
            const area = this._polyArea(pts);
            if (area <= 1 || area > maxA) continue;
            const urban = half.every((h) => this.URBAN_CLS.has(h.e.cls));
            let rect = null;
            if (urban && half.every((h) => !h.e.free)) {                                   // célula da grade? (tira os vértices colineares)
                const Q = pts.filter((p, i) => { const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length]; return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-6; });
                if (Q.length === 4) {
                    const xs = Q.map((p) => p[0]), zs = Q.map((p) => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
                    if (Math.abs((x1 - x0) * (z1 - z0) - area) < 1) rect = this._cellKey(x0, z0, x1, z1);
                }
            }
            out.push({ half, pts, area, urban, rect });
        }
        return out;
    },

    // Distrito de um ponto (para as faces): a ilha fica a leste do canal.
    _districtAt(x, z) { return this.districts.island && x > 300 ? this.districts.island : this.districts.city; },
    // Célula da grade do distrito `d` que contém (x, z): { i, j, r: [x0, z0, x1, z1] } ou null.
    _cellAt(d, x, z) {
        const f = (L, v) => { if (v < L[0] || v > L[L.length - 1]) return -1; let lo = 0, hi = L.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m] <= v) lo = m; else hi = m; } return lo; };
        const i = f(d.xs, x), j = f(d.zs, z);
        return i < 0 || j < 0 ? null : { i, j, r: [d.xs[i], d.zs[j], d.xs[i + 1], d.zs[j + 1]] };
    },

    // Quarteirões das faces que não são células retas: a laje (meio-fio) é a face recuada pela meia-largura de cada rua, com
    // chanfro nas rotatórias; o bioma vem da célula da grade onde ela cai (os pedaços de uma célula cortada seguem o bairro) ou,
    // fora da grade, da posição.
    _faceBlocks(faces, cells) {
        let made = 0, bad = 0;
        const box = (Q) => [Math.min(...Q.map((p) => p[0])), Math.min(...Q.map((p) => p[1])), Math.max(...Q.map((p) => p[0])), Math.max(...Q.map((p) => p[1]))];
        for (const f of faces) {
            if (f.rect || !f.urban) continue;
            const c = this._areaCentroid(f.pts), d = this._districtAt(c[0], c[1]), bb = box(f.pts);
            if (d.skip && d.skip(bb[0], bb[1], bb[2], bb[3])) continue;
            const slab = this._faceSlab(f);
            if (!slab) { bad++; continue; }
            const ci = this._cellAt(d, c[0], c[1]), r = ci ? ci.r : bb;
            const p = d.id === 'island' ? this._pickIsland(ci ? ci.i : Math.round(c[0]), ci ? ci.j : Math.round(c[1]), r[0], r[1], r[2], r[3]) : this._pickCity(r[0], r[1], r[2], r[3]);
            const def = this.BIOMES[p.biome];
            const base = { id: d.id + ':f' + Math.round(c[0]) + ',' + Math.round(c[1]), district: d.id, i: p.si, j: p.sj, biome: p.biome, open: def.open, ground: def.ground,
                slab: box(slab), foot: null, ins: [0, 0, 0, 0], sw: d.sw, lots: [], props: [], r: 0 };
            cells.push(this._polyBlock(base, slab, 0));
            this.urbanPolys.push(f.pts);
            made++;
        }
        console.log(`[CIDADE] ${made} quarteirões em polígono (faces)` + (bad ? `, ${bad} faces sem laje válida` : ''));
    },

    // Laje (meio-fio) de uma face: cada trecho recuado da sua meia-largura para dentro (à esquerda); nas esquinas os meios-fios se
    // cortam (o trecho de cada um que passa do encontro sai); esquina côncava: quina viva no encontro das retas; trecho reto (mesma
    // direção): liga as pontas. Rotatória: chanfro a R+folga do centro, na bissetriz das duas pernas. Devolve o polígono ou null.
    _faceSlab(f) {
        const H = f.half, N = H.length;
        const L = H.map((h) => this._offsetLine(h.fwd ? h.e.pts : h.e.pts.slice().reverse(), h.e.w / 2));
        const sl = (Q, i) => hypot(Q[i + 1][0] - Q[i][0], Q[i + 1][1] - Q[i][1]);
        const cut = [];
        for (let i = 0; i < N; i++) {
            const A = L[i], B = L[(i + 1) % N], node = H[(i + 1) % N].n, hwM = Math.max(H[i].e.w, H[(i + 1) % N].e.w) / 2;
            let best = null;
            for (let a = A.length - 2, la = 0; a >= 0 && la < 70; la += sl(A, a), a--) {
                for (let b = 0, lb = 0; b + 1 < B.length && lb < 70; lb += sl(B, b), b++) {
                    if (best && la + lb >= best.score) break;
                    const X = this._segX(A[a], A[a + 1], B[b], B[b + 1]);
                    if (X) best = { s: a, t: b, X, score: la + lb };
                }
            }
            if (!best) {
                const a = A.length - 2, X = this._lineX(A[a], A[a + 1], B[0], B[1]);
                if (X && hypot(X[0] - node.x, X[1] - node.z) < hwM * 3 + 2) best = { s: a, t: 0, X };
            }
            cut.push(best || { s: A.length - 2, t: 0, X: null, A1: A[A.length - 1], B0: B[0] });
        }
        let out = [];
        for (let i = 0; i < N; i++) {
            const A = L[i], cin = cut[(i - 1 + N) % N], cout = cut[i];
            out.push(cin.X || cin.B0);
            for (let k = cin.t + 1; k <= cout.s; k++) out.push(A[k]);
            if (!cout.X) out.push(cout.A1);
        }
        // rotatória num canto: chanfro na bissetriz das duas pernas da face (praça: R + 4, com o calçadão; senão R + 1,5)
        for (let i = 0; i < N; i++) {
            const n = H[i].n, R = n.round;
            if (!R) continue;
            const a = n.arms.find((q) => q.e === H[i].e), b = n.arms.find((q) => q.e === H[(i - 1 + N) % N].e);
            if (!a || !b) continue;
            let g = b.ang - a.ang; while (g <= 0) g += Math.PI * 2;
            if (g >= Math.PI - 0.01) continue;
            let bx = a.dx + b.dx, bz = a.dz + b.dz; const bl = hypot(bx, bz) || 1; bx /= bl; bz /= bl;
            const D = R.R + (R.plaza ? 4 : 1.5);
            out = this._clipHalf(out, bx, bz, bx * R.cx + bz * R.cz + D);
            if (!out) return null;
        }
        // limpa (pontos colados, vértices colineares) e verifica (área, sem se cruzar)
        out = this._cleanPoly(out);
        if (!out || this._polyArea(out) < 60 || this._selfX(out)) return null;
        return out;
    },
    // Polígono sem arestas minúsculas (< minL: o recuo da calçada "vazaria" na quina) nem vértices quase retos. null se degenerar.
    _cleanPoly(P, minL = 1.5, eps = 0.12) {
        let Q = [];
        for (const p of P) { const q = Q[Q.length - 1]; if (!q || hypot(p[0] - q[0], p[1] - q[1]) >= minL) Q.push(p); }
        while (Q.length > 3 && hypot(Q[0][0] - Q[Q.length - 1][0], Q[0][1] - Q[Q.length - 1][1]) < minL) Q.pop();
        for (let ch = true; ch && Q.length > 3;) {
            ch = false;
            for (let i = 0; i < Q.length && Q.length > 3; i++) {
                const a = Q[(i + Q.length - 1) % Q.length], b = Q[i], c = Q[(i + 1) % Q.length], l = hypot(c[0] - a[0], c[1] - a[1]) || 1;
                if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / l < eps) { Q.splice(i, 1); ch = true; i--; }
            }
        }
        return Q.length >= 3 ? Q : null;
    },

    // Polilinha deslocada d u para a ESQUERDA (no sentido dela): esquadro nos vértices (bissetriz), limitado nas quinas fechadas.
    _offsetLine(E, d) {
        const n = E.length, out = [];
        const nrm = (a, b) => { const dx = E[b][0] - E[a][0], dz = E[b][1] - E[a][1], l = hypot(dx, dz) || 1; return [-dz / l, dx / l]; };
        for (let i = 0; i < n; i++) {
            let v;
            if (i === 0) v = nrm(0, 1);
            else if (i === n - 1) v = nrm(n - 2, n - 1);
            else {
                const a = nrm(i - 1, i), b = nrm(i, i + 1); let mx = a[0] + b[0], mz = a[1] + b[1]; const ml = hypot(mx, mz);
                if (ml < 1e-6) v = a; else { mx /= ml; mz /= ml; const c = Math.max(0.5, mx * a[0] + mz * a[1]); v = [mx / c, mz / c]; }
            }
            out.push([E[i][0] + v[0] * d, E[i][1] + v[1] * d]);
        }
        return out;
    },
    // Interseção própria dos segmentos pq e ab | das retas pq e ab (null se paralelas) | o polígono se cruza?
    _segX(p, q, a, b) {
        const rx = q[0] - p[0], rz = q[1] - p[1], sx = b[0] - a[0], sz = b[1] - a[1], den = rx * sz - rz * sx;
        if (Math.abs(den) < 1e-9) return null;
        const t = ((a[0] - p[0]) * sz - (a[1] - p[1]) * sx) / den, u = ((a[0] - p[0]) * rz - (a[1] - p[1]) * rx) / den;
        return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [p[0] + rx * t, p[1] + rz * t] : null;
    },
    _lineX(p, q, a, b) {
        const rx = q[0] - p[0], rz = q[1] - p[1], sx = b[0] - a[0], sz = b[1] - a[1], den = rx * sz - rz * sx;
        if (Math.abs(den) < 1e-6 * hypot(rx, rz) * hypot(sx, sz)) return null;
        const t = ((a[0] - p[0]) * sz - (a[1] - p[1]) * sx) / den;
        return [p[0] + rx * t, p[1] + rz * t];
    },
    _selfX(P) {
        const n = P.length;
        for (let i = 0; i < n; i++) {
            const a = P[i], b = P[(i + 1) % n], ax0 = Math.min(a[0], b[0]), ax1 = Math.max(a[0], b[0]), az0 = Math.min(a[1], b[1]), az1 = Math.max(a[1], b[1]);
            for (let j = i + 2; j < n; j++) {
                if (i === 0 && j === n - 1) continue;
                const c = P[j], d = P[(j + 1) % n];
                if (Math.max(c[0], d[0]) < ax0 || Math.min(c[0], d[0]) > ax1 || Math.max(c[1], d[1]) < az0 || Math.min(c[1], d[1]) > az1) continue;
                if (this._segX(a, b, c, d)) return true;
            }
        }
        return false;
    },
    // Centróide de área de um polígono (o da média dos vértices puxa para o lado curvo, cheio de pontos).
    _areaCentroid(P) {
        let A = 0, x = 0, z = 0;
        for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length], c = p[0] * q[1] - q[0] * p[1]; A += c; x += (p[0] + q[0]) * c; z += (p[1] + q[1]) * c; }
        return Math.abs(A) < 1e-9 ? this._centroid(P) : [x / (3 * A), z / (3 * A)];
    },
    // Triângulos (índices) de um polígono simples qualquer (orelhas; anti-horário ou não).
    triangulate(P) {
        const n = P.length, idx = [], tris = [];
        if (n < 3) return tris;
        const ccw = this._polyArea(P) > 0;
        for (let i = 0; i < n; i++) idx.push(ccw ? i : n - 1 - i);
        const cross = (a, b, c) => (P[b][0] - P[a][0]) * (P[c][1] - P[a][1]) - (P[b][1] - P[a][1]) * (P[c][0] - P[a][0]);
        const inTri = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
        let guard = 0;
        while (idx.length > 3 && guard++ < n * n) {
            let cut = false;
            for (let k = 0; k < idx.length; k++) {
                const a = idx[(k + idx.length - 1) % idx.length], b = idx[k], c = idx[(k + 1) % idx.length];
                if (cross(a, b, c) <= 1e-9) continue;
                let ear = true;
                for (const q of idx) if (q !== a && q !== b && q !== c && inTri(q, a, b, c)) { ear = false; break; }
                if (!ear) continue;
                tris.push([a, b, c]); idx.splice(k, 1); cut = true; break;
            }
            if (!cut) break;
        }
        for (let k = 1; k + 1 < idx.length; k++) tris.push([idx[0], idx[k], idx[k + 1]]);       // (o que sobrou: leque)
        return tris;
    },

    // Lotes (prédios alinhados aos eixos) empacotados na pegada de um quarteirão em polígono: o maior retângulo livre (grade de 1 u)
    // de cada vez, encostado na calçada, no tamanho e altura do bioma, com uma folga entre eles. Nenhum coube: pracinha.
    LOTS: {
        downtown:    [{ min: 12, max: 40, gap: 3, fl: [8, 14], n: 4, fac: ['office0', 'office1', 'office2', 'concrete0', 'concrete1'], roof: ['conc0', 'conc1', 'tar0', 'metal1'] }],
        commercial:  [{ min: 9, max: 34, gap: 3, fl: [3, 6], n: 5, fac: ['brick0', 'brick1', 'brick2', 'concrete0', 'concrete1', 'house2'], roof: ['tar0', 'tar1', 'conc0', 'conc1'] },
                      { min: 9, max: 18, gap: 3, fl: [2, 5], n: 6, fac: ['brick0', 'brick1', 'brick2', 'concrete0', 'house2'], roof: ['tar0', 'tar1', 'conc0', 'conc1'] }],
        residential: [{ min: 7, max: 10, gap: 3, fl: [2, 3], n: 12, fac: ['house0', 'house1', 'house2', 'house3', 'brick2'], roof: ['tile0', 'tile1', 'tar1'] },
                      { min: 11, max: 30, gap: 3, fl: [4, 6], n: 3, fac: ['brick0', 'brick1', 'brick2'], roof: ['tar0', 'tar1', 'conc1', 'garden0'] }],
        resort:      [{ min: 12, max: 30, gap: 5, fl: [6, 11], n: 3, fac: ['office0', 'office1', 'office2', 'concrete1'], roof: ['conc0', 'conc1', 'metal1'] },
                      { min: 8, max: 13, gap: 4, fl: [3, 5], n: 6, fac: ['house0', 'house1', 'house3', 'concrete1'], roof: ['tile0', 'conc1', 'garden0'] }],
        industrial:  [{ min: 12, max: 40, gap: 4, fl: [3, 4], n: 3, fac: ['metal0', 'metal1', 'concrete0'], roof: ['metal0', 'metal1', 'tar0'] }],
        port:        [{ min: 12, max: 40, gap: 5, fl: [3, 4], n: 2, fac: ['metal0', 'metal1', 'concrete0'], roof: ['metal0', 'metal1', 'tar0'] }],
        // a Lagoa (map/Lagoa.js): torres residenciais de luxo, afastadas, com jardim em volta
        lagoa:       [{ min: 11, max: 20, gap: 5, fl: [8, 13], n: 3, fac: ['lux0', 'lux1', 'lux2', 'lux3'], roof: ['conc1', 'conc0'] },
                      { min: 12, max: 24, gap: 6, fl: [9, 14], n: 2, fac: ['lux0', 'lux1', 'lux2', 'lux3'], roof: ['conc1', 'conc0'] }],
    },
    _packLots(block, rng) {
        const F = block.footPoly, specs = this.LOTS[block.biome];
        if (!F || !specs) return;
        const S = specs[Math.floor(rng() * specs.length)], [fx0, fz0, fx1, fz1] = block.foot;
        const W = Math.floor(fx1 - fx0), H = Math.floor(fz1 - fz0), ox = fx0 + (fx1 - fx0 - W) / 2, oz = fz0 + (fz1 - fz0 - H) / 2;
        if (W < S.min || H < S.min) { this._greenPiece(block, 3); return; }
        const G = this._rasterPoly(F, ox, oz, W, H);
        const pick = (L) => L[Math.floor(rng() * L.length)];
        const edgeD = (x, z) => (RoadPlan.inPoly(F, x, z) ? RoadPlan.polyDist(F, x, z) : 0);
        let placed = 0;
        for (let k = 0; k < S.n; k++) {
            const r = this._maxRect(G, W, H);
            if (!r || r.w < S.min || r.h < S.min) break;
            const w = Math.min(r.w, S.max - Math.floor(rng() * 3)), h = Math.min(r.h, S.max - Math.floor(rng() * 3));
            // encosta na calçada: o lado do retângulo livre mais perto da borda da pegada
            const i0 = r.w > w && edgeD(ox + r.i + r.w - 0.5, oz + r.j + r.h / 2) < edgeD(ox + r.i + 0.5, oz + r.j + r.h / 2) ? r.i + r.w - w : r.i;
            const j0 = r.h > h && edgeD(ox + r.i + r.w / 2, oz + r.j + r.h - 0.5) < edgeD(ox + r.i + r.w / 2, oz + r.j + 0.5) ? r.j + r.h - h : r.j;
            const fl = S.fl[0] + Math.floor(rng() * (S.fl[1] - S.fl[0] + 1));
            this._addLot(block, ox + i0, oz + j0, ox + i0 + w, oz + j0 + h, fl, pick(S.fac), pick(S.roof));
            placed++;
            for (let j = Math.max(0, j0 - S.gap); j < Math.min(H, j0 + h + S.gap); j++) for (let i = Math.max(0, i0 - S.gap); i < Math.min(W, i0 + w + S.gap); i++) G[j * W + i] = 0;
        }
        if (!placed) this._greenPiece(block, 3);
    },
    // Células de 1 u (origem ox, oz; W×H) com o centro dentro do polígono F e as 4 vizinhas também (folga de ~0,5 u da borda) —
    // por varredura de linhas (sem ponto-no-polígono por célula).
    _rasterPoly(F, ox, oz, W, H) {
        const A = new Uint8Array(W * H), xs = [];
        for (let j = 0; j < H; j++) {
            const z = oz + j + 0.5; xs.length = 0;
            for (let i = 0, k = F.length - 1; i < F.length; k = i++) { const a = F[k], b = F[i]; if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1])); }
            xs.sort((p, q) => p - q);
            for (let t = 0; t + 1 < xs.length; t += 2) for (let i = Math.max(0, Math.ceil(xs[t] - ox - 0.5)); i <= Math.min(W - 1, Math.floor(xs[t + 1] - ox - 0.5)); i++) A[j * W + i] = 1;
        }
        const G = new Uint8Array(W * H);
        for (let j = 1; j + 1 < H; j++) for (let i = 1; i + 1 < W; i++) { const k = j * W + i; if (A[k] && A[k - 1] && A[k + 1] && A[k - W] && A[k + W]) G[k] = 1; }
        return G;
    },
    // Maior retângulo de 1s numa grade W×H (histograma por linha): { i, j, w, h } ou null.
    _maxRect(G, W, H) {
        const hgt = new Int32Array(W), st = new Int32Array(W + 1);
        let best = null, ba = 0;
        for (let j = 0; j < H; j++) {
            for (let i = 0; i < W; i++) hgt[i] = G[j * W + i] ? hgt[i] + 1 : 0;
            let sp = 0;
            for (let i = 0; i <= W; i++) {
                const hh = i < W ? hgt[i] : 0;
                while (sp > 0 && hgt[st[sp - 1]] >= hh) {
                    const top = st[--sp], h = hgt[top], left = sp > 0 ? st[sp - 1] + 1 : 0, w = i - left;
                    const a = Math.min(w, 40) * Math.min(h, 40) + Math.min(w, h) * 0.5;          // (prefere quadrados até ~40 u)
                    if (h > 0 && a > ba) { ba = a; best = { i: left, j: j - h + 1, w, h }; }
                }
                st[sp++] = i;
            }
        }
        return best;
    },

    // Bloco de um pedaço: polígono da laje (`poly`) e da pegada (`footPoly`, recuada a calçada); slab/foot viram as caixas deles.
    // Pedaço pequeno (ou sem pegada) vira pracinha (parque).
    _polyBlock(block, poly, k) {
        if (this._polyArea(poly) < 0) poly.reverse();
        let foot = this._inset(poly, block.sw);
        if (!foot) {                                                                // (quina difícil: tenta com o contorno mais simples)
            const Q = this._cleanPoly(WorldMap.simplifyLoop(poly, 0.6), 2.5, 0.3);
            const F = Q && this._inset(Q, block.sw);
            if (F) { poly = Q; foot = F; }
        }
        const box = (Q) => [Math.min(...Q.map((p) => p[0])), Math.min(...Q.map((p) => p[1])), Math.max(...Q.map((p) => p[0])), Math.max(...Q.map((p) => p[1]))];
        const b = Object.assign({}, block, { id: block.id + '/' + k, poly, footPoly: foot, lots: [], props: [], r: 0, slab: box(poly) });
        b.foot = foot ? box(foot) : b.slab.slice();
        if (!foot || this._polyArea(foot) < 140) this._greenPiece(b, k);
        return b;
    },
    // Pedaço sem prédio: pracinha (piso, ipês e flores) ou parquinho (grama e árvores), alternando.
    _greenPiece(b, k) {
        const kind = this._rand(b.i + k * 7, b.j + 13) < 0.5 ? 'plaza' : 'park', def = this.BIOMES[kind];
        b.biome = kind; b.open = def.open; b.ground = def.ground;
    },

    // Polígonos: recorte pelo semiplano nx·x + nz·z ≥ c | área (+ = anti-horário) | centróide | recuo de d u (convexo, anti-horário).
    _clipHalf(P, nx, nz, c) {
        const out = [];
        for (let i = 0; i < P.length; i++) {
            const a = P[i], b = P[(i + 1) % P.length], da = nx * a[0] + nz * a[1] - c, db = nx * b[0] + nz * b[1] - c;
            if (da >= 0) out.push(a);
            if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
        }
        return out.length >= 3 ? out : null;
    },
    _polyArea(P) { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; },
    _centroid(P) { let x = 0, z = 0; for (const p of P) { x += p[0]; z += p[1]; } return [x / P.length, z / P.length]; },
    _inset(P, d) {
        const N = P.length, L = [];
        for (let i = 0; i < N; i++) {
            const a = P[i], b = P[(i + 1) % N], l = hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / l, tz = (b[1] - a[1]) / l;
            L.push({ x: a[0] - tz * d, z: a[1] + tx * d, tx, tz, len: l });
        }
        const out = [];
        for (let i = 0; i < N; i++) {
            const A = L[(i + N - 1) % N], B = L[i], det = A.tx * B.tz - A.tz * B.tx;
            if (Math.abs(det) < 1e-6) { out.push([B.x, B.z]); continue; }
            const t = ((B.x - A.x) * B.tz - (B.z - A.z) * B.tx) / det;
            out.push([A.x + A.tx * t, A.z + A.tz * t]);
        }
        return this._polyArea(out) > 1 && out.every((p) => RoadPlan.inPoly(P, p[0], p[1])) ? out : null;
    },
    _fillLots(block, rng) {
        const [fx0, fz0, fx1, fz1] = block.foot;
        const w = fx1 - fx0, d = fz1 - fz0;
        const pick = (list) => list[Math.floor(rng() * list.length)];
        const between = (a, b) => a + Math.floor(rng() * (b - a + 1));

        const lm = this.landmarkCells[block.id];
        if (lm) { this._landmark(block, lm); return; }

        if (block.biome === 'downtown') {
            const facades = ['office0', 'office1', 'office2', 'concrete0', 'concrete1'];
            const roofs = ['conc0', 'conc1', 'tar0', 'metal1'];
            if (rng() < 0.5) {
                const lw = this._snap(w), ld = this._snap(d);
                const x0 = fx0 + (w - lw) / 2, z0 = fz0 + (d - ld) / 2;
                this._addLot(block, x0, z0, x0 + lw, z0 + ld, between(9, 14), pick(facades), pick(roofs));
            } else {
                // Dois arranha-céus lado a lado, com um beco de 3u entre eles.
                const alongX = w >= d;
                const total = alongX ? w : d;
                const a = this._snap(total * 0.55);
                const b = this._snap(total - a - 3);
                const cross = this._snap(alongX ? d : w);
                const cOff = ((alongX ? d : w) - cross) / 2;
                const o = alongX ? fx0 : fz0;
                const c0 = (alongX ? fz0 : fx0) + cOff;
                if (alongX) {
                    this._addLot(block, o, c0, o + a, c0 + cross, between(8, 13), pick(facades), pick(roofs));
                    this._addLot(block, o + a + 3, c0, o + a + 3 + b, c0 + cross, between(6, 12), pick(facades), pick(roofs));
                } else {
                    this._addLot(block, c0, o, c0 + cross, o + a, between(8, 13), pick(facades), pick(roofs));
                    this._addLot(block, c0, o + a + 3, c0 + cross, o + a + 3 + b, between(6, 12), pick(facades), pick(roofs));
                }
            }
        } else if (block.biome === 'residential') {
            const r = rng();
            if (r < 0.45) {
                // 2×2 casas com quintal.
                const s = 9, gap = 3;
                const ox = fx0 + (w - (2 * s + gap)) / 2, oz = fz0 + (d - (2 * s + gap)) / 2;
                const facades = ['house0', 'house1', 'house2', 'house3', 'brick2'];
                const roofs = ['tile0', 'tile1', 'tar1'];
                for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
                    const x0 = ox + a * (s + gap), z0 = oz + b * (s + gap);
                    this._addLot(block, x0, z0, x0 + s, z0 + s, between(2, 3), pick(facades), pick(roofs));
                }
            } else if (r < 0.8) {
                // Um prédio de apartamentos.
                const lw = this._snap(w - 3), ld = this._snap(d - 3);
                const x0 = fx0 + (w - lw) / 2, z0 = fz0 + (d - ld) / 2;
                this._addLot(block, x0, z0, x0 + lw, z0 + ld, between(4, 6),
                    pick(['brick0', 'brick1', 'brick2']), pick(['tar0', 'tar1', 'conc1', 'garden0']));
            } else {
                // Duas fileiras longas (sobrados geminados).
                const ld = this._snap((d - 3) / 2);
                const lw = this._snap(w);
                const x0 = fx0 + (w - lw) / 2;
                const z0 = fz0 + (d - (2 * ld + 3)) / 2;
                for (let b = 0; b < 2; b++) {
                    const z = z0 + b * (ld + 3);
                    this._addLot(block, x0, z, x0 + lw, z + ld, between(3, 4), pick(['brick0', 'brick1', 'house2', 'house0']), pick(['tile0', 'tile1', 'tar0']));
                }
            }
        } else if (block.biome === 'commercial') {
            // Comércio: prédios de 3–6 andares (lojas embaixo), um ou dois por quarteirão, sem recuo.
            const facades = ['brick0', 'brick1', 'brick2', 'concrete0', 'concrete1', 'house2'];
            const roofs = ['tar0', 'tar1', 'conc0', 'conc1'];
            if (rng() < 0.45) {
                const lw = this._snap(w - 1), ld = this._snap(d - 1);
                this._addLot(block, fx0 + (w - lw) / 2, fz0 + (d - ld) / 2, fx0 + (w - lw) / 2 + lw, fz0 + (d - ld) / 2 + ld, between(3, 6), pick(facades), pick(roofs));
            } else {
                const alongX = w >= d, total = alongX ? w : d, a = this._snap(total * 0.5), b = this._snap(total - a - 3), cross = this._snap(alongX ? d : w);
                const cOff = ((alongX ? d : w) - cross) / 2, o = alongX ? fx0 : fz0, c0 = (alongX ? fz0 : fx0) + cOff;
                if (alongX) {
                    this._addLot(block, o, c0, o + a, c0 + cross, between(3, 6), pick(facades), pick(roofs));
                    this._addLot(block, o + a + 3, c0, o + a + 3 + b, c0 + cross, between(2, 5), pick(facades), pick(roofs));
                } else {
                    this._addLot(block, c0, o, c0 + cross, o + a, between(3, 6), pick(facades), pick(roofs));
                    this._addLot(block, c0, o + a + 3, c0 + cross, o + a + 3 + b, between(2, 5), pick(facades), pick(roofs));
                }
            }
        } else if (block.biome === 'resort') {
            // Resort da ilha: hotel alto de fachada de vidro OU dois condomínios claros, com pátio/jardim em volta.
            if (rng() < 0.5) {
                const lw = this._snap(w - 8), ld = this._snap(d - 8);
                this._addLot(block, fx0 + (w - lw) / 2, fz0 + (d - ld) / 2, fx0 + (w - lw) / 2 + lw, fz0 + (d - ld) / 2 + ld, between(6, 11), pick(['office0', 'office1', 'office2', 'concrete1']), pick(['conc0', 'conc1', 'metal1']));
            } else {
                const s = Math.max(9, Math.floor((Math.min(w, d) - 9) / 2 / 3) * 3), gap = 4;
                const ox = fx0 + (w - (2 * s + gap)) / 2, oz = fz0 + (d - (2 * s + gap)) / 2;
                for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
                    this._addLot(block, ox + a * (s + gap), oz + b * (s + gap), ox + a * (s + gap) + s, oz + b * (s + gap) + s, between(3, 5), pick(['house0', 'house1', 'house3', 'concrete1']), pick(['tile0', 'conc1', 'garden0']));
                }
            }
        } else if (block.biome === 'favela') {
            // Favela: casinhas coladas umas nas outras (1–3 andares, tijolo aparente e reboco), em fileiras irregulares.
            const facades = ['brick0', 'brick1', 'brick2', 'brick0', 'house0', 'house1', 'house2', 'house3', 'concrete0'];
            const roofs = ['zinc0', 'zinc1', 'zinc0', 'tarp0', 'tarp1', 'tarp2', 'slab0', 'slab1', 'slab0', 'tile1', 'tile0'];
            // Fileiras de casas coladas (largura 4–8 u, vão de 0,5–1,6 u) separadas por vielas de 1,2–2,6 u; alguns lotes vazios (quintal/terreno).
            let z = fz0 + rng() * 0.8;
            while (z < fz1 - 4) {
                const rowD = between(5, 8);
                let x = fx0 + rng() * 1.2;
                while (x < fx1 - 4) {
                    const sw = between(4, 8);
                    if (x + sw > fx1 + 0.01) break;
                    if (rng() < 0.9) {
                        const sd = Math.min(rowD, fz1 - z), zz = z + (rowD - sd) * rng(), f = rng();         // a maioria é térrea ou sobrado; poucos 3–4 andares
                        if (sd >= 4) this._addLot(block, x, zz, x + sw, zz + Math.min(sd, rowD), f < 0.4 ? 1 : (f < 0.75 ? 2 : (f < 0.95 ? 3 : 4)), pick(facades), pick(roofs));
                    }
                    x += sw + 0.5 + rng() * 1.1;
                }
                z += rowD + 1.2 + rng() * 1.4;
            }
        } else {
            // industrial / port: galpões baixos + pátio de contêineres.
            const facades = ['metal0', 'metal1', 'concrete0'];
            const roofs = ['metal0', 'metal1', 'tar0'];
            const lw = this._snap(w);
            const ld = this._snap(block.biome === 'port' ? d * 0.4 : d * 0.55);
            const x0 = fx0 + (w - lw) / 2;
            const z0 = rng() < 0.5 ? fz0 : fz1 - ld;
            this._addLot(block, x0, z0, x0 + lw, z0 + ld, between(3, 4), pick(facades), pick(roofs));
        }
    },

    // ------------------------------------------------------------------ props
    // Props são só dados (o WorldBuilder decide como desenhar). Árvores e
    // contêineres evitam os lotes de prédios.
    _fillProps(block, rng) {
        const [x0, z0, x1, z1] = block.slab;
        const [fx0, fz0, fx1, fz1] = block.foot;
        const props = block.props;

        const free = (x, z, margin) => {
            const Q = block.poly && (!block.open && block.footPoly ? block.footPoly : block.poly);
            if (Q && !(RoadPlan.inPoly(Q, x, z) && RoadPlan.polyDist(Q, x, z) >= Math.max(1.2, margin))) return false;      // quarteirão em polígono: dentro dele (da pegada)
            for (const l of block.lots) {
                if (x > l.x0 - margin && x < l.x1 + margin && z > l.z0 - margin && z < l.z1 + margin) return false;
            }
            return true;
        };
        const spaced = (x, z, minDist) => {
            for (const p of props) if (hypot(p.x - x, p.z - z) < minDist) return false;
            return true;
        };
        const scatter = (type, kind, n, rect, minDist, margin, extra = {}) => {
            for (let t = 0; t < n * 12 && n > 0; t++) {
                const x = rect[0] + rng() * (rect[2] - rect[0]);
                const z = rect[1] + rng() * (rect[3] - rect[1]);
                if (!free(x, z, margin) || !spaced(x, z, minDist)) continue;
                props.push(Object.assign({ type, kind, x, z, s: 0.85 + rng() * 0.4, seed: Math.floor(rng() * 1000) }, extra));
                n--;
            }
        };

        switch (block.biome) {
            case 'park': {
                const inner = [x0 + 3, z0 + 3, x1 - 3, z1 - 3];
                scatter('tree', 'oak', 18, inner, 4.0, 0);
                scatter('tree', 'ipe', 6, inner, 4.5, 0);
                scatter('tree', 'jungle', 4, inner, 5.0, 0);
                scatter('tree', 'bush', 14, inner, 2.2, 0);
                scatter('tree', 'flowers', 10, inner, 2.4, 0);
                scatter('tree', 'fern', 6, inner, 2.0, 0);
                break;
            }
            case 'plaza': {                                                          // pracinha (quarteirão cortado por diagonal)
                const inner = [x0 + 2, z0 + 2, x1 - 2, z1 - 2];
                scatter('tree', 'ipe', 2, inner, 6.0, 0);
                scatter('tree', 'cypress', 3, inner, 3.5, 0);
                scatter('tree', 'palm', 1, inner, 5.0, 0);
                scatter('tree', 'flowers', 8, inner, 2.2, 0);
                break;
            }
            case 'forest': {
                const inner = [x0 + 2, z0 + 2, x1 - 2, z1 - 2];
                scatter('tree', 'jungle', 18, inner, 3.8, 0);
                scatter('tree', 'pine', 12, inner, 3.0, 0);
                scatter('tree', 'araucaria', 6, inner, 4.0, 0);
                scatter('tree', 'oak', 10, inner, 3.6, 0);
                scatter('tree', 'juca', 10, inner, 3.0, 0);
                scatter('tree', 'ipe', 4, inner, 4.0, 0);
                scatter('tree', 'banana', 6, inner, 2.6, 0);
                scatter('tree', 'fern', 20, inner, 1.8, 0);
                scatter('tree', 'bush', 14, inner, 2.0, 0);
                break;
            }
            case 'beach': {
                const inner = [x0 + 3, z0 + 3, x1 - 3, z1 - 3];
                scatter('tree', 'palm', 10, inner, 4.5, 0);
                scatter('tree', 'juca', 3, inner, 5.0, 0);
                scatter('tree', 'bush', 6, inner, 3.0, 0);
                scatter('prop', 'umbrella', 5, inner, 5.5, 0);
                break;
            }
            case 'residential':
                scatter('tree', 'oak', 6, [fx0, fz0, fx1, fz1], 5, 2.2);
                scatter('tree', 'ipe', 2, [fx0, fz0, fx1, fz1], 6, 2.4);
                scatter('tree', 'bush', 7, [fx0, fz0, fx1, fz1], 3, 1.2);
                scatter('tree', 'flowers', 5, [fx0, fz0, fx1, fz1], 2.5, 1.0);
                break;
            case 'downtown':
            case 'commercial':
                scatter('tree', 'bush', 4, [fx0, fz0, fx1, fz1], 4, 1.6);
                scatter('tree', 'flowers', 3, [fx0, fz0, fx1, fz1], 3, 1.4);
                break;
            case 'resort':
                scatter('tree', 'palm', 8, [fx0, fz0, fx1, fz1], 5, 3);
                scatter('tree', 'juca', 3, [fx0, fz0, fx1, fz1], 5, 3);
                scatter('tree', 'bush', 8, [fx0, fz0, fx1, fz1], 3, 1.5);
                scatter('tree', 'flowers', 8, [fx0, fz0, fx1, fz1], 2.5, 1.3);
                break;
            case 'favela': {
                // Sujeira nos cantos das casas e vielas: sacos de lixo, entulho, manchas de lama/esgoto; bananeiras e mato; postes com 'gato' (ver WorldBuilder._favelaPoles).
                const area = Math.max(1, (fx1 - fx0) * (fz1 - fz0)), k = area / 1000;
                scatter('prop', 'trash', Math.round(10 * k + 3), [fx0, fz0, fx1, fz1], 2.2, 0.3);
                scatter('prop', 'debris', Math.round(5 * k + 2), [fx0, fz0, fx1, fz1], 2.8, 0.3);
                scatter('prop', 'stain', Math.round(5 * k + 2), [fx0, fz0, fx1, fz1], 2.4, 0.2);
                scatter('tree', 'banana', Math.round(2 * k + 1), [fx0, fz0, fx1, fz1], 3, 0.5);
                scatter('tree', 'bush', Math.round(2 * k + 1), [fx0, fz0, fx1, fz1], 3, 0.5);
                scatter('pole', 'gato', Math.round(3 * k + 1), [fx0, fz0, fx1, fz1], 16, 0.4);
                break;
            }
            case 'industrial':
            case 'port': {
                const n = block.biome === 'port' ? 9 : 5;
                const colors = ['#c0392b', '#2c6db0', '#d98c1f', '#2f8f5b', '#8e8e94', '#7a3b8f'];
                for (let t = 0, placed = 0; t < 80 && placed < n; t++) {
                    const alongX = rng() < 0.5;
                    const w = alongX ? 6 : 2.6, d = alongX ? 2.6 : 6;
                    const x = fx0 + 1.5 + rng() * (fx1 - fx0 - 3 - w);
                    const z = fz0 + 1.5 + rng() * (fz1 - fz0 - 3 - d);
                    if (!free(x + w / 2, z + d / 2, 2.4 + Math.max(w, d) / 2)) continue;
                    let ok = true;
                    for (const p of props) if (p.type === 'container' && Math.abs(p.x - x) < (w + p.w) / 2 + 1 && Math.abs(p.z - z) < (d + p.d) / 2 + 1) ok = false;
                    if (!ok) continue;
                    const stack = rng() < 0.4 ? 2 : 1;
                    props.push({
                        type: 'container', kind: 'box', x: x + w / 2, z: z + d / 2, w, d,
                        h: 2.6 * stack, color: colors[Math.floor(rng() * colors.length)],
                    });
                    this.obstacles.push({ x0: x, z0: z, x1: x + w, z1: z + d, h: 2.6 * stack });
                    placed++;
                }
                break;
            }
        }
        // Tufos de grama nos gramados (parque, mata, quintais), só com os sprites em alta definição (art/SpriteHD.js): o relevo do
        // gramado. Sorteio próprio do quarteirão, para não mexer em nada do que já foi sorteado acima.
        if (typeof SpriteHD !== 'undefined' && SpriteHD.on && (this.BIOMES[block.biome] || {}).ground === 'grass') {
            const r2 = Pixel.rng(String(block.id).split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 977));
            const R = block.open ? [x0 + 1.4, z0 + 1.4, x1 - 1.4, z1 - 1.4] : [fx0, fz0, fx1, fz1], n = Math.round((R[2] - R[0]) * (R[3] - R[1]) / 20);
            for (let t = 0, k = 0; t < n * 3 && k < n; t++) {
                const x = R[0] + r2() * (R[2] - R[0]), z = R[1] + r2() * (R[3] - R[1]), s = 0.75 + r2() * 0.6;
                if (!free(x, z, block.open ? 0 : 0.6)) continue;
                props.push({ type: 'tuft', kind: 'tuft', x, z, s, seed: 0 });
                k++;
            }
        }
    },

    // ------------------------------------------------------------------ quintais
    // Nos quintais e vielas entre os prédios: grades e muros baixos (dá para PULAR) com vãos, e esconderijos —
    // caçambas, caixotes e latões encostados nas paredes (o jogador entra neles para despistar a polícia).
    _fillYard(block, rng) {
        const [fx0, fz0, fx1, fz1] = block.foot, lots = block.lots;
        const hit = (r, a, m) => r.x1 > a.x0 - m && r.x0 < a.x1 + m && r.z1 > a.z0 - m && r.z0 < a.z1 + m;
        const overlapsLot = (r, m) => lots.some((l) => hit(r, l, m));
        // Só sólidos perto do quarteirão podem colidir com o que nasce dentro dele (cercas na borda, caçambas a ≥ 0,8 u da borda; folga
        // máx. 0,5): filtra UMA vez em vez de varrer todos os sólidos do mundo a cada candidato (era O(n²) na carga).
        const foot = { x0: fx0, z0: fz0, x1: fx1, z1: fz1 }, near = this.obstacles.filter((o) => hit(o, foot, 1.5));
        const overlapsObs = (r, m) => near.some((o) => hit(r, o, m));
        // Em frente a cada loja o caminho até a porta fica LIVRE (sem grade, muro nem caçamba): zona de 3,2 u entre a calçada e a fachada.
        const zones = [];
        for (const l of lots) for (const s of l.shops || []) zones.push(s.side === 'S' ? { x0: s.a - 0.6, z0: l.z0 - 3.4, x1: s.a + 6.6, z1: l.z0 } : s.side === 'N' ? { x0: s.a - 0.6, z0: l.z1, x1: s.a + 6.6, z1: l.z1 + 3.4 } : s.side === 'W' ? { x0: l.x0 - 3.4, z0: s.a - 0.6, x1: l.x0, z1: s.a + 6.6 } : { x0: l.x1, z0: s.a - 0.6, x1: l.x1 + 3.4, z1: s.a + 6.6 });
        const inShop = (r) => zones.some((z) => hit(r, z, 0));
        block.fences = [];

        // Grades (70%) e muros (30%) ao longo da borda do quintal, com vãos de passagem.
        const edge = (alongX, fixed, inward, a0, a1) => {
            for (let s = a0 + 1.5; s < a1 - 4; ) {
                const len = 5 + rng() * 4, wall = rng() < 0.3, th = wall ? 0.5 : 0.3;
                const e = Math.min(s + len, a1 - 1.5);
                const lo = fixed + (inward > 0 ? 0 : -th), hi = lo + th;
                const r = alongX ? { x0: s, z0: lo, x1: e, z1: hi } : { x0: lo, z0: s, x1: hi, z1: e };
                if (rng() < 0.82 && !overlapsLot(r, 0.35) && !overlapsObs(r, 0.1) && !inShop(r)) {
                    const f = Object.assign({}, r, { h: wall ? 1.7 : 1.5, vault: true, kind: wall ? 'wall' : 'fence' });
                    block.fences.push(f); this.obstacles.push(f); this.vaultables.push(f); near.push(f);
                }
                s = e + 3.5 + rng() * 2;
            }
        };
        const fences = block.biome !== 'favela';                      // (a favela é aberta: vielas sem grades)
        if (fences) edge(true, fz0, 1, fx0, fx1);          // sul
        if (fences) edge(true, fz1, -1, fx0, fx1);         // norte
        if (fences) edge(false, fx0, 1, fz0, fz1);         // oeste
        if (fences) edge(false, fx1, -1, fz0, fz1);        // leste

        // Esconderijos: encostados nas paredes dos prédios (ou soltos, se não há prédio).
        const KINDS = { dumpster: [2.6, 1.3, 1.4], crate_big: [1.6, 1.6, 1.6], crate: [1.2, 1.2, 1.2], barrel: [1.0, 1.0, 1.1] };
        const order = ['dumpster', 'crate_big', 'barrel', 'crate'];
        const n = block.biome === 'industrial' ? 4 : (block.biome === 'residential' ? 3 : 2);
        for (let k = 0, placed = 0; k < 60 && placed < n; k++) {
            const kind = order[(placed + (rng() < 0.4 ? 1 : 0)) % order.length];
            let [w, d, h] = KINDS[kind];
            let x, z;
            if (lots.length) {
                const l = lots[Math.floor(rng() * lots.length)], side = Math.floor(rng() * 4);
                if (side >= 2) { const t = w; w = d; d = t; }                          // junto às paredes leste/oeste: no sentido da parede
                if (side === 0) { x = l.x0 + 1.5 + rng() * Math.max(0.1, l.x1 - l.x0 - 3); z = l.z0 - 0.7 - d / 2; }
                else if (side === 1) { x = l.x0 + 1.5 + rng() * Math.max(0.1, l.x1 - l.x0 - 3); z = l.z1 + 0.7 + d / 2; }
                else if (side === 2) { z = l.z0 + 1.5 + rng() * Math.max(0.1, l.z1 - l.z0 - 3); x = l.x0 - 0.7 - w / 2; }
                else { z = l.z0 + 1.5 + rng() * Math.max(0.1, l.z1 - l.z0 - 3); x = l.x1 + 0.7 + w / 2; }
            } else { x = fx0 + 2 + rng() * (fx1 - fx0 - 4); z = fz0 + 2 + rng() * (fz1 - fz0 - 4); }
            const r = { x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 };
            if (r.x0 < fx0 + 0.8 || r.x1 > fx1 - 0.8 || r.z0 < fz0 + 0.8 || r.z1 > fz1 - 0.8) continue;
            if (overlapsLot(r, 0.45) || overlapsObs(r, 0.5) || inShop(r)) continue;
            const ob = Object.assign({}, r, { h, hide: true });
            this.obstacles.push(ob); near.push(ob);
            const spot = { x, z, w, d, h, kind };
            block.props.push(Object.assign({ type: 'hide' }, spot));
            this.hideSpots.push(spot);
            placed++;
        }
    },

    // Há algum sólido (círculo de raio r em x,z)? Usado para escolher onde pousar depois de um pulo.
    blockedAt(x, z, r = 0.45) {
        for (const o of this.obstaclesAround(x, z, r)) {
            const cx = Math.max(o.x0, Math.min(x, o.x1)), cz = Math.max(o.z0, Math.min(z, o.z1));
            if ((x - cx) * (x - cx) + (z - cz) * (z - cz) < r * r) return true;
        }
        return false;
    },

    // Grade/muro pulável mais próximo de (x, z) a menos de maxD (distância até o retângulo), ou null.
    // Todo pulável (vault: true) também é obstáculo: a busca usa a grade dos sólidos em vez de varrer todos os muros do mundo a cada
    // quadro (a dica de interação pergunta isto o tempo todo).
    nearestVault(x, z, maxD = 1.6) {
        if (!inWorld(x, z)) return null;
        let best = null, bd2 = maxD * maxD;
        for (const o of this.obstaclesAround(x, z, maxD)) {
            if (!o.vault) continue;
            const cx = Math.max(o.x0, Math.min(x, o.x1)), cz = Math.max(o.z0, Math.min(z, o.z1));
            const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
            if (d2 < bd2) { bd2 = d2; best = o; }
        }
        return best;
    },

    // Esconderijo (caçamba, caixote, latão) mais próximo de (x, z) a menos de maxD (distância até o retângulo), ou null. Os esconderijos
    // não mudam depois da construção: grade própria montada na 1ª consulta.
    nearestHideSpot(x, z, maxD = 2.3) {
        const S = this.CELL;
        if (!this._hideGrid) {
            this._hideGrid = new Map();
            for (const h of this.hideSpots) {
                for (let i = Math.floor((h.x - h.w / 2) / S); i <= Math.floor((h.x + h.w / 2) / S); i++) for (let j = Math.floor((h.z - h.d / 2) / S); j <= Math.floor((h.z + h.d / 2) / S); j++) {
                    const k = this._gridKey(i, j);
                    let c = this._hideGrid.get(k); if (!c) this._hideGrid.set(k, c = []); c.push(h);
                }
            }
        }
        if (!inWorld(x, z)) return null;
        let best = null, bd2 = maxD * maxD;
        for (let i = Math.floor((x - maxD) / S); i <= Math.floor((x + maxD) / S); i++) for (let j = Math.floor((z - maxD) / S); j <= Math.floor((z + maxD) / S); j++) {
            const c = this._hideGrid.get(this._gridKey(i, j)); if (!c) continue;
            for (const s of c) {
                const dx = Math.max(Math.abs(x - s.x) - s.w / 2, 0), dz = Math.max(Math.abs(z - s.z) - s.d / 2, 0), d2 = dx * dx + dz * dz;
                if (d2 < bd2) { bd2 = d2; best = s; }
            }
        }
        return best;
    },

    // Ponto de pouso do outro lado de `o` para quem está em (x, z), ou null se não há espaço livre.
    // allowWater: mureta de PONTE — o "outro lado" é o mar, alguns metros abaixo (só o jogador pula; a polícia não segue).
    vaultLanding(o, x, z, allowWater = false) {
        const thinX = (o.x1 - o.x0) <= (o.z1 - o.z0), off = o.bridgeRail ? 2.5 : 1.0;
        let lx, lz;
        if (thinX) { lz = Math.max(o.z0 + 0.3, Math.min(z, o.z1 - 0.3)); lx = x < (o.x0 + o.x1) / 2 ? o.x1 + off : o.x0 - off; }
        else { lx = Math.max(o.x0 + 0.3, Math.min(x, o.x1 - 0.3)); lz = z < (o.z0 + o.z1) / 2 ? o.z1 + off : o.z0 - off; }
        if (o.bridgeRail) return allowWater && !RoadPlan.onBridge(lx, lz) && MapGeo.waterDepthBelow(lx, lz) > 0 ? { x: lx, z: lz, water: true } : null;
        if (!this.isInside(lx, lz) || this.blockedAt(lx, lz, 0.5)) return null;
        return { x: lx, z: lz };
    },

    // Grade espacial dos sólidos (células de 24u) para consultas rápidas (sombra, colisão).
    _buildObstacleGrid() {
        this.CELL = 24;
        this._grid = new Map();
        // (i, j) podem ser negativos (o mundo grande se estende para os dois lados): chave sem colisão.
        this._gridKey = (i, j) => (i + 2048) * 4096 + (j + 2048);
        for (const o of this.obstacles) this._gridInsert(o);
    },

    _gridInsert(o) {
        const S = this.CELL;
        const i0 = Math.floor(o.x0 / S), i1 = Math.floor(o.x1 / S);
        const j0 = Math.floor(o.z0 / S), j1 = Math.floor(o.z1 / S);
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
            const k = this._gridKey(i, j);
            let cell = this._grid.get(k);
            if (!cell) this._grid.set(k, cell = []);
            cell.push(o);
        }
    },

    // Acrescenta sólidos depois da construção (paredões do relevo, prédios de outros distritos...).
    addObstacles(list) {
        for (const o of list) { this.obstacles.push(o); this._gridInsert(o); }
    },

    // Sólidos na célula do ponto (x, z).
    obstaclesNear(x, z) {
        return this._grid.get(this._gridKey(Math.floor(x / this.CELL), Math.floor(z / this.CELL))) || [];
    },

    // Sólidos que podem tocar um círculo (x, z, r): as células que ele cobre.
    obstaclesAround(x, z, r) {
        if (!inWorld(x, z)) return [];
        const S = this.CELL, i0 = Math.floor((x - r) / S), i1 = Math.floor((x + r) / S), j0 = Math.floor((z - r) / S), j1 = Math.floor((z + r) / S);
        if (i0 === i1 && j0 === j1) return this._grid.get(this._gridKey(i0, j0)) || [];
        const out = [];
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const c = this._grid.get(this._gridKey(i, j)); if (c) for (const o of c) out.push(o); }
        return out;
    },

    // ----------------------------------------------------------------- nomes de rua
    // Nomes das ruas verticais (da cidade, de oeste a leste) e horizontais (de sul a norte, repetidas com numeração).
    STREETS_V: ['Av. Perimetral', 'Rua do Morro', 'Rua Boa Vista', 'Rua do Porto', 'Av. Liberdade', 'Rua Afonso Marinete', 'Av. Central', 'Rua Garoa', 'Av. dos Pescadores', 'Rua do Farol', 'Rua das Dunas', 'Av. Beira-Mar'],
    STREETS_H: ['Av. Beira-Mar Sul', 'Rua da Orla', 'Rua Rondônia', 'Av. Atlântica', 'Rua das Palmeiras', 'Av. Liberty', 'Rua do Comércio', 'Rua Marquês', 'Av. Independência', 'Rua da Praia'],

    // Nome de uma via: `edge` do RoadPlan.
    streetName(edge) {
        const cls = edge.cls, at = edge.v ? edge.a.x : edge.a.z;
        if (edge.free) return edge.name || (cls === 'ave' ? 'Avenida' : 'Rua');
        if (cls === 'hwy') return 'Rodovia ' + (edge.v ? 'BR-' : 'RJ-') + (100 + Math.abs(Math.round(at / 6)) % 90);
        if (cls === 'bridge') return 'Ponte ' + (at === 0 ? 'da Liberdade' : (at > 0 ? 'do Norte' : 'do Sul'));
        if (cls === 'dirt') return 'Estrada da Roça';
        if (cls === 'fav') return 'Beco ' + (1 + Math.abs(Math.round(at / 36)) % 40);
        return this._gridName(edge.v, at, cls === 'isl');
    },
    // Nome da linha `at` da grade (vert: N-S) — também das ruas curvas, que são linhas da grade deformadas.
    _gridName(vert, at, island = false) {
        if (island) return vert ? 'Av. Resort ' + (1 + Math.round((at - 396) / 42)) : 'Rua do Sol ' + (1 + Math.abs(Math.round((at + 960) / 42)));
        if (vert) { const i = Math.round((at + 294) / 42); return this.STREETS_V[Math.max(0, Math.min(this.STREETS_V.length - 1, i))]; }
        const j = Math.round((at + 1050) / 42);
        return this.STREETS_H[((j % this.STREETS_H.length) + this.STREETS_H.length) % this.STREETS_H.length] + (j >= this.STREETS_H.length ? ' ' + Math.floor(j / this.STREETS_H.length + 1) : '');
    },

    // Cada POI: { type, name, x, z }. `type` é uma chave de PauseMenu.POI_TYPES (lanchonete, conveniencia, paynspray,
    // hospital, station…). Lojas futuras só chamam CityGrid.addPoi(...) e aparecem no mapa e na legenda.
    addPoi(poi) { this.pois.push(poi); return poi; },

    _buildPois() {
        this.pois = [];
        for (const b of this.blocks) {
            if (!b.landmark) continue;
            const l = b.lots.find((k) => k.landmark);
            const x = (l.x0 + l.x1) / 2, z = (l.z0 + l.z1) / 2;
            this.addPoi(b.landmark.kind === 'hospital' ? { type: 'hospital', name: 'Hospital Central', x, z } : { type: 'station', name: 'Delegacia Central', x, z });
        }
        for (const s of this.stations || []) this.addPoi({ type: 'gas', name: s.name, x: s.x, z: s.z });
        if (SafeHouse.placed) { const d = SafeHouse.doorWorld(); this.addPoi({ type: 'home', name: 'Safe house', x: d.x, z: d.z - 1.2 }); }
        // Lojas que aparecem no mapa (uma parte das lanchonetes, conveniências, boutiques e oficinas Pay n Pay).
        const count = {};
        for (const b of this.blocks) for (const l of b.lots) for (const s of l.shops || []) {
            const S = TileFactory.SHOPS[s.kind];
            if (!S.poi || (S.poi !== 'academia' && Pixel.hash(Math.round(l.x0), Math.round(l.z0), s.kind + 9) > 0.4)) continue;      // (academias: todas no mapa)
            const x = s.side === 'W' ? l.x0 - 0.5 : (s.side === 'E' ? l.x1 + 0.5 : s.a + 3), z = s.side === 'S' ? l.z0 - 0.5 : (s.side === 'N' ? l.z1 + 0.5 : s.a + 3);
            count[S.id] = (count[S.id] || 0) + 1;
            this.addPoi({ type: S.poi, name: S.name + ' ' + count[S.id], x, z });
        }
    },

    // ================================================================== orla
    // Calçadas de BORDA (lados de uma rua urbana sem quarteirão), calçadão/areia junto ao mar, guarda-sóis e palmeiras
    // (coastProps), lugares para deitar (beachSpots), entradas na água (shorePoints) e trilhas de corrida (jogPaths).
    // Vira dados para o mundo 3D e para quem se exercita na orla.
    _blockAtPoint(x, z) {
        if (!this._bh) {
            this._bh = new Map();
            const S = 64;
            for (const b of this.blocks) {
                const [x0, z0, x1, z1] = b.slab;
                for (let i = Math.floor(x0 / S); i <= Math.floor(x1 / S); i++) for (let j = Math.floor(z0 / S); j <= Math.floor(z1 / S); j++) {
                    const k = i * 4096 + j; let c = this._bh.get(k); if (!c) this._bh.set(k, c = []); c.push(b);
                }
            }
        }
        const c = this._bh.get(Math.floor(x / 64) * 4096 + Math.floor(z / 64));
        if (c) for (const b of c) {
            const s = b.slab;
            if (!(x >= s[0] - 4.5 && x <= s[2] + 4.5 && z >= s[1] - 4.5 && z <= s[3] + 4.5)) continue;
            if (b.poly && !RoadPlan.inPoly(b.poly, x, z) && RoadPlan.polyDist(b.poly, x, z) > 4.5) continue;
            return b;
        }
        return null;
    },

    _fillCoast() {
        const SW = 4;
        this.perimeter = [];                  // calçadas de borda: { x0, z0, x1, z1, edge, nx, nz } (n = normal para FORA)
        this.coastProps = []; this.beachSpots = []; this.shorePoints = []; this.jogPaths = [];
        const rng = Pixel.rng(8080);
        for (const e of RoadPlan.edges) {
            if ((e.cls !== 'city' && e.cls !== 'isl' && e.cls !== 'ave') || e.free) continue;
            const hw = e.w / 2, x0 = Math.min(e.a.x, e.b.x), x1 = Math.max(e.a.x, e.b.x), z0 = Math.min(e.a.z, e.b.z), z1 = Math.max(e.a.z, e.b.z);
            for (const side of [-1, 1]) {
                // O lado tem quarteirão? (testa o ponto ao meio, 2u além do meio-fio)
                const mx = e.v ? e.a.x + side * (hw + 2) : (x0 + x1) / 2, mz = e.v ? (z0 + z1) / 2 : e.a.z + side * (hw + 2);
                if (this._blockAtPoint(mx, mz) || !WorldMap.isLand(mx, mz)) continue;
                const nx = e.v ? side : 0, nz = e.v ? 0 : side;
                const r = e.v ? [e.a.x + side * hw - (side < 0 ? SW : 0), z0, e.a.x + side * hw + (side > 0 ? SW : 0), z1] : [x0, e.a.z + side * hw - (side < 0 ? SW : 0), x1, e.a.z + side * hw + (side > 0 ? SW : 0)];
                for (const nd of [e.a, e.b]) {                                   // rotatória na ponta: a calçada para na borda do disco (o anel de calçada é o roundAprons)
                    const R = nd.round;
                    if (!R) continue;
                    const inner = e.v ? (side > 0 ? r[0] : r[2]) - R.cx : (side > 0 ? r[1] : r[3]) - R.cz, t = Math.abs(inner) < R.R ? Math.sqrt(R.R * R.R - inner * inner) : 0;
                    if (e.v) { if (nd === e.a) r[1] = Math.max(r[1], R.cz + t); else r[3] = Math.min(r[3], R.cz - t); }
                    else if (nd === e.a) r[0] = Math.max(r[0], R.cx + t); else r[2] = Math.min(r[2], R.cx - t);
                }
                if (r[2] - r[0] < 1 || r[3] - r[1] < 1) continue;
                this.perimeter.push({ x0: r[0], z0: r[1], x1: r[2], z1: r[3], edge: e, nx, nz });
            }
        }
        // Vias LIVRES urbanas (curvas: Av. do Contorno, Av. Litorânea, ruas dos bairros curvos): no lado sem quarteirão, a calçada de borda
        // vai em TIRAS ao longo da via — `perimeterStrips`: { inner (meio-fio), outer (borda de fora): mesmos índices, n (normal para
        // fora), poly, edge, side }.
        this.perimeterStrips = [];
        {
            const Q = {};
            for (const e of RoadPlan.edges) {
                if (!e.free || !this.URBAN_CLS.has(e.cls)) continue;
                const hw = e.w / 2, s0 = (e.cutA || 0) + 0.5, s1 = e.len - (e.cutB || 0) - 0.5;
                if (s1 - s0 < 6) continue;
                for (const side of [-1, 1]) {
                    let run = null;
                    const flush = () => { if (run && run.inner.length >= 3) this.perimeterStrips.push(run); run = null; };
                    for (let s = s0; ; s = Math.min(s1, s + 3)) {
                        RoadPlan.at(e, s, Q);
                        const nx = -Q.tz * side, nz = Q.tx * side, mx = Q.x + nx * (hw + 2), mz = Q.z + nz * (hw + 2), ox = Q.x + nx * (hw + SW - 0.5), oz = Q.z + nz * (hw + SW - 0.5);
                        if (!this._blockAtPoint(mx, mz) && WorldMap.isLand(mx, mz) && !RoadPlan.onPavement(ox, oz, 0)) {
                            if (!run) run = { inner: [], outer: [], n: [], edge: e, side };
                            run.inner.push([Q.x + nx * hw, Q.z + nz * hw]); run.outer.push([Q.x + nx * (hw + SW), Q.z + nz * (hw + SW)]); run.n.push([nx, nz]);
                        } else flush();
                        if (s >= s1) break;
                    }
                    flush();
                }
            }
            for (const st of this.perimeterStrips) { st.poly = st.inner.concat(st.outer.slice().reverse()); if (this._polyArea(st.poly) < 0) st.poly.reverse(); }
        }
        // Rotatórias: anel de calçada (4 u) em volta do disco nos cantos sem quarteirão (a orla), entre os braços — liga a calçada da
        // avenida à da ponte. { inner, outer }: arcos (mesmo número de pontos) do meio-fio de dentro e da borda de fora.
        this.roundAprons = [];
        for (const n of RoadPlan.nodes) {
            const R = n.round;
            if (!R) continue;
            const R0 = R.R, R1 = R.R + SW;
            for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
                const ns = n.edge[sz > 0 ? 0 : 1], ew = n.edge[sx > 0 ? 2 : 3];
                if (!ns || !ew) continue;
                const ex = sx > 0 ? n.x + ns.w / 2 - R.cx : R.cx - (n.x - ns.w / 2), ez = ew.w / 2;           // bordas dos braços (relativas ao centro)
                if (ex >= R0 - 0.5 || ez >= R0 - 0.5) continue;
                const tx = R.cx + sx * (ex + 2.5), tz = R.cz + sz * (ez + 2.5);
                if (this._blockAtPoint(tx, tz) || !WorldMap.isLand(tx, tz)) continue;
                const arc = (r) => {
                    const a0 = Math.atan2(ez, Math.sqrt(r * r - ez * ez)), a1 = Math.atan2(Math.sqrt(r * r - ex * ex), ex), pts = [];
                    for (let k = 0; k <= 10; k++) { const t = a0 + (a1 - a0) * k / 10; pts.push([R.cx + sx * r * Math.cos(t), R.cz + sz * r * Math.sin(t)]); }
                    return pts;
                };
                this.roundAprons.push({ node: n, inner: arc(R0), outer: arc(R1) });
            }
        }
        // Rotatória-PRAÇA (cercada de quarteirões): em cada setor entre duas pernas, calçadão do disco até o chanfro a R+4 do centro
        // (onde começa o quarteirão: o chanfro do _faceSlab), entre os meios-fios das duas pernas.
        for (const n of RoadPlan.nodes) {
            const R = n.round;
            if (!R || !R.plaza) continue;
            const A = n.arms, N = A.length, D = R.R + 4, TAU = Math.PI * 2;
            for (let i = 0; i < N; i++) {
                const a = A[i], b = A[(i + 1) % N];
                let g = b.ang - a.ang; if (g <= 0) g += TAU;
                if (g >= Math.PI - 0.01) continue;
                let bx = a.dx + b.dx, bz = a.dz + b.dz; const bl = hypot(bx, bz); bx /= bl; bz /= bl;
                if (!this._blockAtPoint(R.cx + bx * (D + 3), R.cz + bz * (D + 3))) continue;
                const La = { ox: n.x - a.dz * a.hw, oz: n.z + a.dx * a.hw, dx: a.dx, dz: a.dz }, Rb = { ox: n.x + b.dz * b.hw, oz: n.z - b.dx * b.hw, dx: b.dx, dz: b.dz };
                const onCircle = (L) => { const qx = L.ox - R.cx, qz = L.oz - R.cz, q = qx * L.dx + qz * L.dz, t = -q + Math.sqrt(Math.max(0, q * q - (qx * qx + qz * qz - R.R * R.R))); return [L.ox + L.dx * t, L.oz + L.dz * t]; };
                const onChamfer = (L) => { const t = (D - ((L.ox - R.cx) * bx + (L.oz - R.cz) * bz)) / (L.dx * bx + L.dz * bz); return [L.ox + L.dx * t, L.oz + L.dz * t]; };
                const A0 = onCircle(La), B0 = onCircle(Rb), A1 = onChamfer(La), B1 = onChamfer(Rb);
                const t0 = Math.atan2(A0[1] - R.cz, A0[0] - R.cx);
                let t1 = Math.atan2(B0[1] - R.cz, B0[0] - R.cx); while (t1 < t0) t1 += TAU;
                const inner = [], outer = [];
                for (let k = 0; k <= 10; k++) {
                    const t = t0 + (t1 - t0) * k / 10, f = k / 10;
                    inner.push([R.cx + R.R * Math.cos(t), R.cz + R.R * Math.sin(t)]);
                    outer.push([A1[0] + (B1[0] - A1[0]) * f, A1[1] + (B1[1] - A1[1]) * f]);
                }
                this.roundAprons.push({ node: n, inner, outer });
            }
        }
        // Trechos que dão para o mar: guarda-sóis + palmeiras + lugares para deitar + entradas na água + trilha de corrida.
        const jog = new Map();
        for (const p of this.perimeter) {
            const v = p.nx !== 0, len = v ? p.z1 - p.z0 : p.x1 - p.x0;
            const at = (a, t) => v ? { x: (p.nx > 0 ? p.x1 : p.x0) + p.nx * t, z: p.z0 + a } : { x: p.x0 + a, z: (p.nz > 0 ? p.z1 : p.z0) + p.nz * t };
            const sea = (t) => { const q = at(len / 2, t); return WorldMap.seaDist(q.x, q.z) === 0 && !WorldMap.isLand(q.x, q.z); };
            // Mar a até 130 u para fora, no meio do trecho? (senão é continente/campo: sem praia; a orla tem baías: a areia varia)
            let toSea = -1;
            for (let t = 6; t <= 130; t += 3) if (!WorldMap.isLand(at(len / 2, t).x, at(len / 2, t).z)) { toSea = t; break; }
            if (toSea < 0) continue;
            const key = (v ? 'v' : 'h') + (v ? p.x0 : p.z0).toFixed(0) + ':' + p.nx + p.nz;
            if (!jog.has(key)) jog.set(key, []);
            jog.get(key).push(v ? [p.z0, p.z1, (p.x0 + p.x1) / 2, v, p.nx, p.nz] : [p.x0, p.x1, (p.z0 + p.z1) / 2, v, p.nx, p.nz]);
            for (let a = 8 + rng() * 6; a < len - 8; a += 15 + rng() * 6) {                        // guarda-sóis e 2 lugares para deitar em cada
                let w = 9.5; while (w < 130 && WorldMap.isLand(at(a, w + 1).x, at(a, w + 1).z)) w += 2;      // (até onde vai a areia aqui)
                const lo = Math.max(9.5, w - 36), t = lo + rng() * Math.max(0, w - 7 - lo), u = at(a, t);
                if (WorldMap.biomeAt(u.x, u.z) !== WorldMap.B.SAND) continue;
                this.coastProps.push({ type: 'prop', kind: 'umbrella', x: u.x, z: u.z, s: 1, seed: Math.floor(rng() * 1000) });
                for (const side of [-1, 1]) {
                    const q = at(a + side * 2.1, t + 1.5);
                    this.beachSpots.push({ x: q.x, z: q.z, h: v ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2), taken: false });
                }
            }
            for (let a = 6 + rng() * 8; a < len - 6; a += 11 + rng() * 5) {                        // palmeiras junto ao calçadão
                const u = at(a, 1.4 + rng() * 1.6);
                this.coastProps.push({ type: 'tree', kind: 'palm', x: u.x, z: u.z, s: 0.9 + rng() * 0.4, seed: Math.floor(rng() * 1000) });
            }
            for (let a = 8; a < len - 8; a += 9) {                                                 // entrada na água: último ponto de terra rumo ao mar
                let t = 6; while (t < 130 && WorldMap.isLand(at(a, t + 1).x, at(a, t + 1).z)) t++;
                const u = at(a, t - 1.2);
                this.shorePoints.push({ x: u.x, z: u.z, nx: p.nx, nz: p.nz });
            }
        }
        // Tiras de calçada (vias curvas) que dão para o mar: os mesmos guarda-sóis, palmeiras, lugares para deitar, entradas na água e a
        // trilha de corrida (polilinha pelo meio da calçada).
        for (const st of this.perimeterStrips) {
            const N = st.inner.length, out = (i, t) => ({ x: st.outer[i][0] + st.n[i][0] * t, z: st.outer[i][1] + st.n[i][1] * t });
            const water = (i) => { let t = 1; while (t < 130 && WorldMap.isLand(out(i, t).x, out(i, t).z)) t += 2; return t < 130 ? t : -1; };
            if (water(N >> 1) < 0) continue;
            for (let i = 2 + Math.floor(rng() * 3); i < N - 2; i += 5 + Math.floor(rng() * 3)) {                    // guarda-sóis (a cada ~15–21 u)
                const w = water(i); if (w < 0) continue;
                const lo = Math.max(5.5, w - 34), t = lo + rng() * Math.max(0, w - 6 - lo), u = out(i, t);
                if (WorldMap.biomeAt(u.x, u.z) !== WorldMap.B.SAND) continue;
                this.coastProps.push({ type: 'prop', kind: 'umbrella', x: u.x, z: u.z, s: 1, seed: Math.floor(rng() * 1000) });
                const tx = -st.n[i][1], tz = st.n[i][0], hd = Math.atan2(tx, tz);
                for (const sd of [-1, 1]) this.beachSpots.push({ x: u.x + tx * sd * 2.1 + st.n[i][0] * 1.5, z: u.z + tz * sd * 2.1 + st.n[i][1] * 1.5, h: rng() < 0.5 ? hd : hd + Math.PI, taken: false });
            }
            for (let i = 2 + Math.floor(rng() * 3); i < N - 2; i += 4 + Math.floor(rng() * 2)) {                    // palmeiras junto ao calçadão
                const u = out(i, 1.4 + rng() * 1.6);
                this.coastProps.push({ type: 'tree', kind: 'palm', x: u.x, z: u.z, s: 0.9 + rng() * 0.4, seed: Math.floor(rng() * 1000) });
            }
            for (let i = 2; i < N - 2; i += 3) {                                                                      // entradas na água
                const w = water(i); if (w < 0) continue;
                const u = out(i, w - 1.2);
                this.shorePoints.push({ x: u.x, z: u.z, nx: st.n[i][0], nz: st.n[i][1] });
            }
            const pts = st.inner.map((p, i) => [(p[0] + st.outer[i][0]) / 2, (p[1] + st.outer[i][1]) / 2]), cum = [0];
            for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
            if (cum[cum.length - 1] > 60) this._jogFree = (this._jogFree || []).concat([{ pts, cum, len: cum[cum.length - 1] }]);
        }
        // Trilhas de corrida: une os trechos alinhados (mesma linha, mesma normal) numa polilinha.
        for (const list of jog.values()) {
            list.sort((a, b) => a[0] - b[0]);
            let cur = null;
            for (const [a0, a1, c, v, nx, nz] of list) {
                const off = (v ? nx : nz) * (SW / 2 + 0.01) * 0;                                   // (o centro da calçada já está em c)
                if (cur && Math.abs(cur.end - a0) < 0.5 && Math.abs(cur.c - c) < 0.5) { cur.end = a1; }
                else { cur = { v, c, start: a0, end: a1 }; this.jogPaths.push(cur); }
            }
        }
        this.jogPaths = this.jogPaths.filter((j) => j.end - j.start > 60);
        for (const j of this.jogPaths) j.len = j.end - j.start;
        this.jogPaths.push(...(this._jogFree || [])); this._jogFree = null;
    },

    // Lugar vago para deitar na areia (marca como ocupado) ou null.
    beachSpot(near = null) {
        const free = this.beachSpots.filter((p) => !p.taken && (!near || hypot(p.x - near.x, p.z - near.z) < 320));
        if (!free.length) return null;
        const p = free[Math.floor(Math.random() * free.length)];
        p.taken = true;
        return p;
    },

    // Ponto de entrada na água aleatório: { x, z, nx, nz } (n = para onde fica o mar). `near`: { x, z } prefere o mais perto dele.
    shorePoint(near = null) {
        if (!this.shorePoints.length) return null;
        if (!near) return this.shorePoints[Math.floor(Math.random() * this.shorePoints.length)];
        const c = this.shorePoints.filter((p) => hypot(p.x - near.x, p.z - near.z) < 220);
        return (c.length ? c : this.shorePoints)[Math.floor(Math.random() * (c.length || this.shorePoints.length))];
    },

    // Trilha de corrida: ponto no parâmetro u (0..len) de um jogPath, e o u mais próximo de (x, z).
    // (trilha reta: { v, c, start, end }; ao longo de via curva: { pts, cum } — polilinha)
    jogAt(path, u) {
        u = Math.max(0, Math.min(path.len, u));
        if (path.pts) { const q = RoadPlan.at({ pts: path.pts, cum: path.cum, len: path.len }, u); return { x: q.x, z: q.z }; }
        return path.v ? { x: path.c, z: path.start + u } : { x: path.start + u, z: path.c };
    },
    jogNear(x, z, max = 400) {
        let best = null, bd = max;
        for (const j of this.jogPaths) {
            if (j.pts) { const q = RoadPlan._projPts(j.pts, j.cum, x, z); if (q.d < bd) { bd = q.d; best = { path: j, u: q.s }; } continue; }
            const u = Math.max(0, Math.min(j.len, (j.v ? z : x) - j.start)), p = this.jogAt(j, u), d = hypot(p.x - x, p.z - z);
            if (d < bd) { bd = d; best = { path: j, u }; }
        }
        return best;
    },

    // ============================================================ andável a pé
    // Para a navegação em grade (core/navigation.js): `urbanRects` = áreas onde só se anda pelo que `walkRects` declara
    // (calçadas, faixas de pedestres, praças/parques, calçadas de borda, pontes); fora delas vale o terreno do WorldMap.
    _collectWalk() {
        const W = [];
        this.urbanRects = this.urbanBoxes.slice();
        const WP = this.walkPolys = [];                                                    // andáveis que não são retângulos (polígonos)
        for (const b of this.blocks) {
            const [x0, z0, x1, z1] = b.slab, [fx0, fz0, fx1, fz1] = b.foot;
            if (b.organic) continue;                                                        // favela: as células dela entram abaixo (becos, quintais)
            if (b.poly) { WP.push(b.poly); continue; }                                      // quarteirão em polígono: a laje toda (os prédios saem como sólidos)
            if (b.open) { W.push([x0, z0, x1, z1]); continue; }                             // parque/mata/praia: tudo andável
            W.push([x0, z0, x1, fz0], [x0, fz1, x1, z1], [x0, fz0, fx0, fz1], [fx1, fz0, x1, fz1]);   // anel de calçada
        }
        this.cornerCarves = [];                                                           // cantos arredondados: o que sobra fora do arco não é calçada
        for (const b of this.blocks) if (b.r > 0.5) { const [x0, z0, x1, z1] = b.slab; for (const [kx, kz, sx, sz] of [[x0, z0, 1, 1], [x1, z0, -1, 1], [x1, z1, -1, -1], [x0, z1, 1, -1]]) this.cornerCarves.push({ kx, kz, sx, sz, r: b.r }); }
        for (const f of (typeof Favelas !== 'undefined' ? Favelas.built : [])) for (const r of f.walkRects) W.push(r.slice(0, 4));       // (os barracos saem como sólidos)
        for (const p of this.perimeter) { W.push([p.x0, p.z0, p.x1, p.z1]); this.urbanRects.push([p.x0, p.z0, p.x1, p.z1]); }
        for (const st of this.perimeterStrips || []) WP.push(st.poly);
        // pista das vias livres urbanas: fora da malha a pé (o lado sem quarteirão ficava com o terreno por baixo, andável) — as faixas de
        // pedestres, que entram depois, continuam andáveis
        this.navRoadPolys = [];
        for (const e of RoadPlan.edges) if (e.free && this.URBAN_CLS.has(e.cls)) this.navRoadPolys.push(this._offsetLine(e.pts, e.w / 2).concat(this._offsetLine(e.pts, -e.w / 2).reverse()));
        for (const n of RoadPlan.nodes) if (n.round) { const R = n.round; this.urbanRects.push([R.cx - R.R, R.cz - R.R, R.cx + R.R, R.cz + R.R]); }      // rotatória: pista (a ilha não é caminho)
        for (const ap of this.roundAprons || []) for (let k = 0; k < ap.inner.length; k++) {                   // anel de calçada: quadradinhos ao longo do meio dele
            const x = (ap.inner[k][0] + ap.outer[k][0]) / 2, z = (ap.inner[k][1] + ap.outer[k][1]) / 2;
            W.push([x - 1.3, z - 1.3, x + 1.3, z + 1.3]);
        }
        for (const cw of this.crosswalks) {                                                // faixas: avançam 0,7 u em cada calçada
            if (cw.axis === 'o') {
                const L = cw.hl + 0.7, D = cw.hd, P = (a, b) => [cw.cx + cw.ux * a + cw.dx * b, cw.cz + cw.uz * a + cw.dz * b];
                WP.push([P(-L, -D), P(L, -D), P(L, D), P(-L, D)]);
            } else if (cw.axis === 'x') W.push([cw.x0 - 0.7, cw.z0, cw.x1 + 0.7, cw.z1]); else W.push([cw.x0, cw.z0 - 0.7, cw.x1, cw.z1 + 0.7]);
        }
        // Pontes: calçadas dos dois lados (3 u) — dá para atravessar a pé (a partir da borda da rotatória, se houver).
        for (const e of RoadPlan.edges) {
            if (e.cls !== 'bridge') continue;
            let x0 = Math.min(e.a.x, e.b.x), x1 = Math.max(e.a.x, e.b.x), z0 = Math.min(e.a.z, e.b.z), z1 = Math.max(e.a.z, e.b.z);
            const hw = e.w / 2;
            if (!e.v && e.a.round) x0 = e.a.x + e.a.hwNS;
            if (!e.v && e.b.round) x1 = e.b.x - e.b.hwNS;
            if (e.v) { W.push([x0 - hw - 3, z0, x0 - hw, z1], [x0 + hw, z0, x0 + hw + 3, z1]); }
            else { W.push([x0, z0 - hw - 3, x1, z0 - hw], [x0, z0 + hw, x1, z0 + hw + 3]); }
            this.urbanRects.push(e.v ? [x0 - hw - 3, z0, x0 + hw + 3, z1] : [x0, z0 - hw - 3, x1, z0 + hw + 3]);
        }
        this.walkRects = W;
    },

    // ===================================================================== consultas
    // Centro: cruzamento de ruas mais central (bom ponto de nascimento).
    center() { return new BABYLON.Vector3(0, 0, 0); },

    // Onde o jogo começa: dentro da safe house (acordando ao lado da cama); sem ela, no centro da cidade.
    startPos() {
        const s = SafeHouse.spawnWorld();
        return s ? new BABYLON.Vector3(s.x, 0, s.z) : this.center();
    },

    // Ponto aleatório sobre uma via urbana (para carros/patrulha).
    randomRoadPoint() {
        const e = RoadPlan.randomEdge();
        const t = Math.random();
        return new BABYLON.Vector3(e.a.x + (e.b.x - e.a.x) * t, 0, e.a.z + (e.b.z - e.a.z) * t);
    },

    // Ponto aleatório numa área ANDÁVEL (calçada de um quarteirão, ou o miolo de parque/praia/mata) da cidade.
    // `near` = { x, z, r }: só quarteirões a até r u dali (o mundo é grande).
    randomWalkablePoint(near = null) {
        let list = this.blocks;
        if (near) { const f = this.blocks.filter((b) => hypot((b.slab[0] + b.slab[2]) / 2 - near.x, (b.slab[1] + b.slab[3]) / 2 - near.z) < near.r); if (f.length) list = f; }
        const blk = list[Math.floor(Math.random() * list.length)];
        const [x0, z0, x1, z1] = blk.slab;
        const r = Math.random;
        if (blk.organic) {                                                                  // favela: um ponto de beco do ladrilho
            const F = Favelas.byId(blk.faction) || FavelaPlan, p = F.randomAlleyPoint(r, (x, z) => x >= x0 && x < x1 && z >= z0 && z < z1) || F.randomAlleyPoint(r);
            if (p) return new BABYLON.Vector3(p.x, 0, p.z);
        }
        if (blk.poly) {                                                                     // em polígono: a calçada (ou o miolo, se aberto)
            for (let t = 0; t < 30; t++) {
                const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
                if (RoadPlan.inPoly(blk.poly, x, z) && RoadPlan.polyDist(blk.poly, x, z) > 0.5 && (blk.open || !blk.footPoly || !RoadPlan.inPoly(blk.footPoly, x, z))) return new BABYLON.Vector3(x, 0, z);
            }
            const c = this._areaCentroid(blk.poly); return new BABYLON.Vector3(c[0], 0, c[1]);
        }
        if (blk.open) {
            return new BABYLON.Vector3(x0 + 2 + r() * Math.max(0.1, x1 - x0 - 4), 0, z0 + 2 + r() * Math.max(0.1, z1 - z0 - 4));
        }
        // Anel de calçada: escolhe uma das 4 faixas (sul, norte, oeste, leste) e um ponto nela.
        const [fx0, fz0, fx1, fz1] = blk.foot;
        const inset = 0.5;
        switch (Math.floor(r() * 4)) {
            case 0: return new BABYLON.Vector3(x0 + inset + r() * Math.max(0.1, x1 - x0 - 2 * inset), 0, z0 + inset + r() * Math.max(0.1, fz0 - z0 - 2 * inset));
            case 1: return new BABYLON.Vector3(x0 + inset + r() * Math.max(0.1, x1 - x0 - 2 * inset), 0, fz1 + inset + r() * Math.max(0.1, z1 - fz1 - 2 * inset));
            case 2: return new BABYLON.Vector3(x0 + inset + r() * Math.max(0.1, fx0 - x0 - 2 * inset), 0, z0 + inset + r() * Math.max(0.1, z1 - z0 - 2 * inset));
            default: return new BABYLON.Vector3(fx1 + inset + r() * Math.max(0.1, x1 - fx1 - 2 * inset), 0, z0 + inset + r() * Math.max(0.1, z1 - z0 - 2 * inset));
        }
    },

    // Em terra firme (qualquer lugar do mundo)?
    isInside(x, z) { return WorldMap.isLand(x, z); },
};

// Config, Pixel, WorldMap (terra/água) e RoadPlan já carregaram (ordem dos <script>). Na página do jogo a geração espera a tela do
// estúdio (window.DEFER_WORLD: main.js, passo a passo); fora dela, roda aqui: cidade → relevo (depende do que a cidade ocupa) → orla.
if (!window.DEFER_WORLD) { CityGrid.build(); WorldMap.buildTerrain(); CityGrid.finish(); }
