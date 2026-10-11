// ============================================================================
// CityGrid — a CIDADE e tudo o que é construído, gerado a partir do plano de ruas (RoadPlan). FONTE ÚNICA: o WorldBuilder
// constrói o 3D a partir daqui e o MapRenderer desenha o mesmo nos mapas.
//
// DISTRITOS (cada um com a sua grade de ruas, no mesmo grafo):
//   CIDADE  — a faixa urbana ao longo do canal (grade de 42 u): centro de arranha-céus, comércio, residencial, industrial, porto, parques;
//   ILHA    — a ilha praiana (resort): hotéis, condomínios, bares, orla dos dois lados;
//   FAVELA  — as vielas do morro (grade irregular de 6 u de largura): casas humildes, escadarias, caixas-d'água.
// Fora deles: rodovias e estradas de terra pelo continente e as 3 pontes entre a cidade e a ilha (ver _makePlan).
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
        resort:      { open: false, ground: 'plaza',    label: 'Resort' },
        favela:      { open: false, ground: 'earth',    label: 'Favela' },
    },

    // Número de linhas da cidade ANTIGA (8×10 quarteirões de 42 u, centrada na origem): o layout dela é preservado.
    OLD: { minX: -168, maxX: 168, minZ: -210, maxZ: 210, pitch: 42, cols: 8, rows: 10 },

    build() {
        const t0 = performance.now();
        this.obstacles = [];   // retângulos sólidos { x0, z0, x1, z1, h } (prédios, contêineres).
        this.vaultables = [];  // grades e muros: sólidos que dá para PULAR (jogador e polícia) — também estão em `obstacles`
        this.hideSpots = [];   // esconderijos (caçambas, caixotes, latões): { x, z, w, d, h, kind }
        this.blocks = [];
        this.urbanBoxes = [];  // retângulos [x0,z0,x1,z1] cobertos por quarteirão+ruas (o terreno por baixo some; a nav só anda no declarado)
        this.roadRects = [];   // um retângulo por trecho de rua (achata o relevo)
        this.navBlocks = [];   // áreas proibidas SÓ para a navegação a pé (interior da safe house: pedestres e policiais não entram; o jogador sim)
        this._makePlan();
        this._buildBlocks();
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
        if (typeof RuralPlan !== "undefined") RuralPlan.build();         // campo: fazendas, cabanas, postos, torres, alamedas
        if (typeof Marina !== "undefined") Marina.build();               // marina na orla leste: píeres, vagas e clube náutico
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
        P.segs = []; P.report = []; P.marks = new Map();
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
        P.lattice(cx, cz, (v, at) => (!legacy && ((v && aveX.has(at)) || (!v && aveZ.has(at)))) ? 'ave' : 'city', (x, z) => WorldMap.buildable(x, z, 16), 'cidade');

        if (!legacy) {
            // ---- VIADUTO: via elevada na coluna oeste da cidade (cruza as ruas por cima, sem cruzamento; rampas nas pontas).
            const nearest = (arr, v) => arr.reduce((b, q) => (Math.abs(q - v) < Math.abs(b - v) ? q : b), arr[0]);
            const xv = (cx[0] + cx[1]) / 2, zA = nearest(cz, -840), zB = nearest(cz, -270);
            D.viaduct = { x: xv, z0: zA, z1: zB };
            P.addV(xv, zA, zB, 'via', { layer: 1, ramp: 55, elev: 6.2 });
            D.city.skip = (x0, z0, x1, z1) => x0 < xv && xv < x1 && z0 >= zA - 1e-6 && z1 <= zB + 1e-6;            // sem quarteirões sob o viaduto
            // ---- ILHA: grade de 42 u (só onde há terra firme com folga para a praia).
            const ix = this._irregular(480, 732, [36, 42, 48, 54, 60], lr), iz = this._irregular(-840, 924, [30, 36, 42, 48, 60, 72], lr);
            D.island = { id: 'island', xs: ix, zs: iz, cls: 'isl', sw: 4, margin: 30 };
            P.lattice(ix, iz, 'isl', (x, z) => WorldMap.buildable(x, z, 30), 'ilha');
            // ---- As 3 PONTES (cidade -> ilha), no eixo das ruas E-O: norte, centro e sul.
            for (const z of [714, 0, -630]) P.addH(z, 168, 480, 'bridge');
            // ---- AVENIDA BEIRA-MAR: ROTATÓRIAS nas cabeceiras das 3 pontes e RETORNOS no canteiro central, no meio dos quarteirões
            // longos (≥ 60 u, longe das rotatórias).
            const bx = cx[cx.length - 1], bz = [714, 0, -630];
            for (const z of bz) P.mark(bx, z, { round: { R: 12, r: 4.5 } });
            const along = [...new Set(cz.concat(bz))].sort((a, b) => a - b);
            for (let k = 0; k + 1 < along.length; k++) {
                const a = along[k], b = along[k + 1], m = Math.round((a + b) / 2);
                if (b - a >= 60 && bz.every((z) => Math.abs(z - m) >= 30)) P.mark(bx, m, { uturn: { gap: 14 } });
            }
            // ---- FAVELA: vielas estreitas no morro, a oeste da cidade.
            const fx = [-660, -624, -588, -552, -516, -480, -444, -408, -372, -336], fz = R(270, 738, 36);
            D.favela = { id: 'favela', xs: fx, zs: fz, cls: 'fav', sw: 1.6, margin: 6 };
            P.lattice(fx, fz, 'fav', (x, z) => WorldMap.buildable(x, z, 6), 'favela');
            for (const z of [342, 522, 702]) P.addH(z, -336, -294, 'fav');                  // liga a favela à avenida oeste da cidade
            for (const z of [342, 558]) P.addH(z, -780, -660, 'dirt');                      // e à rodovia do oeste
            // ---- RODOVIAS pelo continente (anel + travessas) e estradas de terra das fazendas.
            const H = (z, a, b, cls = 'hwy') => P.road(false, z, a, b, cls), V = (x, a, b, cls = 'hwy') => P.road(true, x, a, b, cls);
            H(1080, -1200, -294); H(-930, -1200, -294); V(-1200, -930, 1080);
            H(-246, -1200, -294); H(186, -1200, -294);
            V(-780, -246, 1080); V(-480, -930, -246);
            // Estradas de terra das fazendas (ligam as rodovias entre si e à favela).
            V(-600, -246, 342, 'dirt'); V(-900, -246, 186, 'dirt'); H(-30, -900, -294, 'dirt'); H(-420, -480, -294, 'dirt'); V(-1020, 186, 640, 'dirt'); H(400, -1200, -1020, 'dirt');
        }
        P.build();
    },

    // ================================================================== túneis
    // Onde uma rodovia atravessa uma serra alta (relevo CRU > 24 u por 70+ u), o trecho vira TÚNEL: o relevo não é achatado
    // ali, os paredões saem do corredor e o WorldBuilder cobre a pista com um maciço de pedra com portais (os carros somem lá dentro).
    _planTunnels() {
        const T = RoadPlan.tunnels = [];
        for (const e of RoadPlan.edges) {
            if (e.cls !== 'hwy' || T.length >= 5) continue;
            const pt = (s) => (e.v ? [e.a.x, e.a.z + s] : [e.a.x + s, e.a.z]);
            let s = 0;
            while (s < e.len) {
                const [x, z] = pt(s);
                if (WorldMap._rawHeight(x, z) <= 26) { s += 8; continue; }
                let e1 = s; while (e1 < e.len && WorldMap._rawHeight(...pt(e1)) > 22) e1 += 8;
                const a = s + 14, b = Math.min(e1 - 14, a + 170);
                if (b - a >= 70 && !T.some((q) => q.edge === e && Math.abs(q.a - a) < 60)) {
                    const p0 = pt(a), p1 = pt(b);
                    T.push({ edge: e, v: e.v, a, b, x0: Math.min(p0[0], p1[0]), z0: Math.min(p0[1], p1[1]), x1: Math.max(p0[0], p1[0]), z1: Math.max(p0[1], p1[1]), w: e.w });
                }
                s = e1 + 40;
            }
        }
        // Retângulos de via (relevo): o trecho do túnel não achata a serra.
        for (const t of T) {
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

    _buildBlocks() {
        const cells = [];
        const rngFor = (i, j) => Pixel.rng(Math.floor(this._rand(i + 3, j + 11) * 1e9));
        const O = this.OLD, legacy = !!Config.world.legacyPlan;
        const sweep = (d, pick) => {
            for (let i = 0; i + 1 < d.xs.length; i++) for (let j = 0; j + 1 < d.zs.length; j++) {
                const x0 = d.xs[i], x1 = d.xs[i + 1], z0 = d.zs[j], z1 = d.zs[j + 1];
                if (d.skip && d.skip(x0, z0, x1, z1)) continue;
                const p = pick(i, j, x0, z0, x1, z1);
                const b = this._makeBlock(d, i, j, x0, z0, x1, z1, p.biome, p.si, p.sj);
                if (b) cells.push(b);
            }
        };
        // CIDADE
        sweep(this.districts.city, (i, j, x0, z0, x1, z1) => {
            const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
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
        });
        if (this.districts.island) sweep(this.districts.island, (i, j, x0, z0, x1, z1) => {
            const r = this._rand(i + 400, j + 400);
            return { biome: this._biomeIsland((x0 + x1) / 2, (z0 + z1) / 2, r), si: i + 400, sj: j + 400 };
        });
        if (this.districts.favela) sweep(this.districts.favela, (i, j) => ({ biome: 'favela', si: i + 800, sj: j + 800 }));

        this._pickLandmarks(cells);
        this._pickStations(cells);
        for (const block of cells) {
            const rng = rngFor(block.i, block.j);
            if (block.id === SafeHouse.blockId) {                                  // a safe house do protagonista: uma casa só, com interior (ver SafeHouse.js)
                SafeHouse.plan(block, this);
                this._fillProps(block, rng);
                block.props = block.props.filter((p) => !SafeHouse.crowds(p));          // sem árvore/lixo/poste em cima do corte da casa
                this._fillYard(block, Pixel.rng(Math.floor(this._rand(block.i + 91, block.j + 37) * 1e9)));
                this.blocks.push(block);
                continue;
            }
            if (block.station) { this._station(block, rng); this._fillProps(block, rng); block.props = []; this.blocks.push(block); continue; }       // posto: sem lotes comuns, árvores nem quintal
            if (!block.open) { this._fillLots(block, rng); this._addShops(block, Pixel.rng(Math.floor(this._rand(block.i + 55, block.j + 77) * 1e9))); }
            this._fillProps(block, rng);
            if (!block.open) this._fillYard(block, Pixel.rng(Math.floor(this._rand(block.i + 91, block.j + 37) * 1e9)));
            this.blocks.push(block);
        }
    },

    // ============================================================ postos de gasolina
    // Alguns quarteirões comerciais/residenciais/industriais grandes viram POSTO (espaçados ≥ 300 u): conveniência ao fundo (norte),
    // cobertura vermelha com 4 bombas na frente. `CityGrid.stations` = { x, z, pumps: [{ x, z }], zone: [x0, z0, x1, z1], name }
    // (o RuralPlan acrescenta os das rodovias). Quem enche o tanque é o Game (_fuelUpdate).
    _pickStations(cells) {
        this.stations = [];
        const ok = cells.filter((b) => !b.open && !b.landmark && !this.landmarkCells[b.id] && (b.district === 'city' || b.district === 'island')
            && ['commercial', 'residential', 'industrial', 'resort'].includes(b.biome) && b.foot[2] - b.foot[0] >= 20 && b.foot[3] - b.foot[1] >= 26);
        ok.sort((a, b) => this._rand(a.i + 21, a.j + 5) - this._rand(b.i + 21, b.j + 5));
        const picked = [];
        for (const b of ok) {
            const x = (b.slab[0] + b.slab[2]) / 2, z = (b.slab[1] + b.slab[3]) / 2;
            if (picked.length >= 24 || picked.some((p) => hypot(p.x - x, p.z - z) < 230)) continue;
            picked.push({ x, z }); b.station = true;
        }
    },

    _station(block, rng) {
        const [fx0, fz0, fx1, fz1] = block.foot, cx = (fx0 + fx1) / 2, cz = fz0 + 10.5;
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
            const sides = [['S', lot.z0 - fz0, lot.x0, lot.x1], ['N', fz1 - lot.z1, lot.x0, lot.x1], ['W', lot.x0 - fx0, lot.z0, lot.z1], ['E', fx1 - lot.x1, lot.z0, lot.z1]];
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
        const cand = cells.filter((b) => b.district === 'city' && !b.open && b.slab[0] > -170 && b.slab[2] < 170 && b.slab[1] > -212 && b.slab[3] < 212 && b.i < 100);
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
            const hw = e.w / 2, x0 = Math.min(e.a.x, e.b.x), x1 = Math.max(e.a.x, e.b.x), z0 = Math.min(e.a.z, e.b.z), z1 = Math.max(e.a.z, e.b.z);
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
        const R = inter.round, a = R.R + 5.6, b = R.R + 8.6;
        this.roadRects.push({ x0: R.cx - R.R - 2, z0: R.cz - R.R - 2, x1: R.cx + R.R + 2, z1: R.cz + R.R + 2, cls: 'ave', flat: true, edge: null });
        for (const [leg, arm] of [[0, 'N'], [1, 'S'], [2, 'E'], [3, 'W']]) {
            const e = inter.edge[leg];
            if (!e || e.cls === 'bridge' || e.cls === 'fav' || e.layer || e.len < b + 10) continue;
            const hw = e.w / 2, s = leg === 0 || leg === 2 ? 1 : -1, v = leg < 2;
            const c0 = (v ? R.cz : R.cx) + s * a, c1 = (v ? R.cz : R.cx) + s * b, lo = Math.min(c0, c1), hi = Math.max(c0, c1);
            const rect = v ? [inter.x - hw, lo, inter.x + hw, hi] : [lo, inter.z - hw, hi, inter.z + hw];
            const cw = { id: this.crosswalks.length, inter, arm, leg, rect, axis: v ? 'x' : 'z', crosses: v ? 'ns' : 'ew', x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3] };
            inter.crosswalks.push(cw);
            this.crosswalks.push(cw);
        }
    },

    // (x, z) dentro de alguma faixa de pedestres (com folga `m`)?
    inCrosswalk(x, z, m = 0.4) {
        const inter = this.intersectionNear(x, z, 24);
        if (!inter) return false;
        for (const cw of inter.crosswalks) {
            if (x > cw.x0 - m && x < cw.x1 + m && z > cw.z0 - m && z < cw.z1 + m) return true;
        }
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
        const h = floors * Config.city.floorH;
        block.lots.push({ x0, z0, x1, z1, floors, height: h, facade, roof });
        this.obstacles.push({ x0, z0, x1, z1, h });
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
        if (cls === 'hwy') return 'Rodovia ' + (edge.v ? 'BR-' : 'RJ-') + (100 + Math.abs(Math.round(at / 6)) % 90);
        if (cls === 'bridge') return 'Ponte ' + (at === 0 ? 'da Liberdade' : (at > 0 ? 'do Norte' : 'do Sul'));
        if (cls === 'dirt') return 'Estrada da Roça';
        if (cls === 'fav') return 'Beco ' + (1 + Math.abs(Math.round(at / 36)) % 40);
        if (cls === 'isl') return edge.v ? 'Av. Resort ' + (1 + Math.round((at - 480) / 42)) : 'Rua do Sol ' + (1 + Math.abs(Math.round((at + 840) / 42)));
        if (edge.v) { const i = Math.round((at + 294) / 42); return this.STREETS_V[Math.max(0, Math.min(this.STREETS_V.length - 1, i))]; }
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
        if (c) for (const b of c) { const s = b.slab; if (x >= s[0] - 4.5 && x <= s[2] + 4.5 && z >= s[1] - 4.5 && z <= s[3] + 4.5) return b; }
        return null;
    },

    _fillCoast() {
        const SW = 4;
        this.perimeter = [];                  // calçadas de borda: { x0, z0, x1, z1, edge, nx, nz } (n = normal para FORA)
        this.coastProps = []; this.beachSpots = []; this.shorePoints = []; this.jogPaths = [];
        const rng = Pixel.rng(8080);
        for (const e of RoadPlan.edges) {
            if (e.cls !== 'city' && e.cls !== 'isl' && e.cls !== 'ave') continue;
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
        // Trechos que dão para o mar: guarda-sóis + palmeiras + lugares para deitar + entradas na água + trilha de corrida.
        const jog = new Map();
        for (const p of this.perimeter) {
            const v = p.nx !== 0, len = v ? p.z1 - p.z0 : p.x1 - p.x0;
            const at = (a, t) => v ? { x: (p.nx > 0 ? p.x1 : p.x0) + p.nx * t, z: p.z0 + a } : { x: p.x0 + a, z: (p.nz > 0 ? p.z1 : p.z0) + p.nz * t };
            const sea = (t) => { const q = at(len / 2, t); return WorldMap.seaDist(q.x, q.z) === 0 && !WorldMap.isLand(q.x, q.z); };
            // Mar a até 60 u para fora, no meio do trecho? (senão é continente/campo: sem praia)
            let toSea = -1;
            for (let t = 6; t <= 60; t += 3) if (!WorldMap.isLand(at(len / 2, t).x, at(len / 2, t).z)) { toSea = t; break; }
            if (toSea < 0) continue;
            const key = (v ? 'v' : 'h') + (v ? p.x0 : p.z0).toFixed(0) + ':' + p.nx + p.nz;
            if (!jog.has(key)) jog.set(key, []);
            jog.get(key).push(v ? [p.z0, p.z1, (p.x0 + p.x1) / 2, v, p.nx, p.nz] : [p.x0, p.x1, (p.z0 + p.z1) / 2, v, p.nx, p.nz]);
            for (let a = 8 + rng() * 6; a < len - 8; a += 15 + rng() * 6) {                        // guarda-sóis e 2 lugares para deitar em cada
                const u = at(a, 9.5);
                if (WorldMap.biomeAt(u.x, u.z) !== WorldMap.B.SAND) continue;
                this.coastProps.push({ type: 'prop', kind: 'umbrella', x: u.x, z: u.z, s: 1, seed: Math.floor(rng() * 1000) });
                for (const side of [-1, 1]) {
                    const q = at(a + side * 2.1, 11);
                    this.beachSpots.push({ x: q.x, z: q.z, h: v ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2), taken: false });
                }
            }
            for (let a = 6 + rng() * 8; a < len - 6; a += 11 + rng() * 5) {                        // palmeiras junto ao calçadão
                const u = at(a, 1.4 + rng() * 1.6);
                this.coastProps.push({ type: 'tree', kind: 'palm', x: u.x, z: u.z, s: 0.9 + rng() * 0.4, seed: Math.floor(rng() * 1000) });
            }
            for (let a = 8; a < len - 8; a += 9) {                                                 // entrada na água: último ponto de terra rumo ao mar
                let t = 6; while (t < 60 && WorldMap.isLand(at(a, t + 1).x, at(a, t + 1).z)) t++;
                const u = at(a, t - 1.2);
                this.shorePoints.push({ x: u.x, z: u.z, nx: p.nx, nz: p.nz });
            }
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
    jogAt(path, u) {
        u = Math.max(0, Math.min(path.len, u));
        return path.v ? { x: path.c, z: path.start + u } : { x: path.start + u, z: path.c };
    },
    jogNear(x, z, max = 400) {
        let best = null, bd = max;
        for (const j of this.jogPaths) {
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
        for (const b of this.blocks) {
            const [x0, z0, x1, z1] = b.slab, [fx0, fz0, fx1, fz1] = b.foot;
            if (b.open || b.biome === 'favela') { W.push([x0, z0, x1, z1]); continue; }       // parque/mata/praia/favela (vielas entre as casas): tudo andável
            W.push([x0, z0, x1, fz0], [x0, fz1, x1, z1], [x0, fz0, fx0, fz1], [fx1, fz0, x1, fz1]);   // anel de calçada
        }
        this.cornerCarves = [];                                                           // cantos arredondados: o que sobra fora do arco não é calçada
        for (const b of this.blocks) if (b.r > 0.5) { const [x0, z0, x1, z1] = b.slab; for (const [kx, kz, sx, sz] of [[x0, z0, 1, 1], [x1, z0, -1, 1], [x1, z1, -1, -1], [x0, z1, 1, -1]]) this.cornerCarves.push({ kx, kz, sx, sz, r: b.r }); }
        for (const p of this.perimeter) { W.push([p.x0, p.z0, p.x1, p.z1]); this.urbanRects.push([p.x0, p.z0, p.x1, p.z1]); }
        for (const n of RoadPlan.nodes) if (n.round) { const R = n.round; this.urbanRects.push([R.cx - R.R, R.cz - R.R, R.cx + R.R, R.cz + R.R]); }      // rotatória: pista (a ilha não é caminho)
        for (const ap of this.roundAprons || []) for (let k = 0; k < ap.inner.length; k++) {                   // anel de calçada: quadradinhos ao longo do meio dele
            const x = (ap.inner[k][0] + ap.outer[k][0]) / 2, z = (ap.inner[k][1] + ap.outer[k][1]) / 2;
            W.push([x - 1.3, z - 1.3, x + 1.3, z + 1.3]);
        }
        for (const cw of this.crosswalks) {                                                // faixas: avançam 0,7 u em cada calçada
            if (cw.axis === 'x') W.push([cw.x0 - 0.7, cw.z0, cw.x1 + 0.7, cw.z1]); else W.push([cw.x0, cw.z0 - 0.7, cw.x1, cw.z1 + 0.7]);
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

CityGrid.build();                // Config, Pixel, WorldMap (terra/água) e RoadPlan já carregaram (ordem dos <script>).
WorldMap.buildTerrain();         // relevo/biomas dependem do que a cidade ocupa
CityGrid.finish();               // orla e áreas andáveis dependem do relevo
