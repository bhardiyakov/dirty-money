// ============================================================================
// TerrainBuilder — desenha o terreno do mundo grande (WorldMap) em PEDAÇOS (chunks) só ao redor do foco:
//   chão por bioma (grama, mata, mato seco, lavoura, pântano, pedra, terra da favela, areia) com SOMBREADO DE RELEVO
//   (hillshade nos vértices), curvas de nível, faixa de sombra nos paredões, vegetação/rochas em sprites, espuma da costa
//   e colisores dos paredões (Havok) — tudo descartado quando o pedaço fica longe.
// O relevo é VISUAL: a malha é plana (y ≈ 0), então física, sprites, tiros e navegação continuam como antes.
// A cidade em grade (CityGrid) é desenhada pelo WorldBuilder; aqui as células CITY e SEA são puladas (a orla é pintada pelo shader do mar: WaterPlugin).
// ============================================================================

class TerrainBuilder {
    constructor(wb) {
        this.wb = wb;
        this.scene = wb.scene;
        this.W = Config.world;
        this.chunks = new Map();            // chave -> { meshes, colliders }
        this.queue = [];
        this.physics = null;                // { addStaticBox(node,size) } — liga quando o Havok fica pronto
        this._t = 0;
        this._last = null;
        this.stats = { built: 0, ms: 0 };

        // Um material só para o chão (src/render/TerrainSplat.js): divisas de bioma em degradê e curvas de nível arredondadas.
        // Water.land: a água da orla sobe por cima do chão.
        this._roadSoil();
        this.ground = Water.land(TerrainSplat.create(this.scene, (i, j) => this._idFor(WorldMap.biome[j * WorldMap.nx + i], i, j)));
        this.cn = Math.round(this.W.chunk / this.W.cell);                // células por lado do pedaço
        this.ncx = Math.ceil(WorldMap.nx / this.cn); this.ncz = Math.ceil(WorldMap.nz / this.cn);

        // Luz do relevo = oposto da direção do sol.
        const d = Config.light.sunDir, l = hypot(d[0], d[1], d[2]);
        this.L = [-d[0] / l, -d[1] / l, -d[2] / l];

        // Paredões por pedaço (para os colisores).
        this.cliffs = new Map();
        for (const r of WorldMap.cliffRects) {
            const ci = Math.floor(((r.x0 + r.x1) / 2 - this.W.minX) / this.W.chunk), cj = Math.floor(((r.z0 + r.z1) / 2 - this.W.minZ) / this.W.chunk);
            const k = cj * this.ncx + ci;
            if (!this.cliffs.has(k)) this.cliffs.set(k, []);
            this.cliffs.get(k).push(r);
        }
    }

    // ---------------------------------------------------------------- streaming
    // Liga a física: pedaços já carregados ganham colisores dos paredões.
    attachPhysics(physics) {
        this.physics = physics;
        for (const ch of this.chunks.values()) this._addColliders(ch);
    }

    _rectDist(ci, cj, x, z) {
        const W = this.W, x0 = W.minX + ci * W.chunk, z0 = W.minZ + cj * W.chunk;
        return hypot(Math.max(x0 - x, 0, x - (x0 + W.chunk)), Math.max(z0 - z, 0, z - (z0 + W.chunk)));
    }

    _refresh(focus) {
        const W = this.W, R = W.loadRadius, ch = W.chunk;
        this._last = { x: focus.x, z: focus.z };
        const i0 = Math.max(0, Math.floor((focus.x - R - W.minX) / ch)), i1 = Math.min(this.ncx - 1, Math.floor((focus.x + R - W.minX) / ch));
        const j0 = Math.max(0, Math.floor((focus.z - R - W.minZ) / ch)), j1 = Math.min(this.ncz - 1, Math.floor((focus.z + R - W.minZ) / ch));
        const want = [];
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
            const d = this._rectDist(i, j, focus.x, focus.z), k = j * this.ncx + i;
            if (d < R && !this.chunks.has(k)) want.push({ k, i, j, d });
        }
        want.sort((a, b) => a.d - b.d);
        this.queue = want;
        for (const [k, c] of this.chunks) {                              // descarta o que ficou longe
            if (this._rectDist(c.i, c.j, focus.x, focus.z) > R + W.unloadExtra) { this._dispose(c); this.chunks.delete(k); }
        }
    }

    // Todo frame: reavalia quando o foco anda, e constrói pedaços dentro do orçamento de tempo.
    update(dt, focus) {
        if (!focus) return;
        this._t -= dt;
        if (!this._last || this._t <= 0 || hypot(focus.x - this._last.x, focus.z - this._last.z) > 24) { this._t = 0.3; this._refresh(focus); }
        this._pump(this.W.buildBudgetMs);
    }

    // Constrói já tudo ao redor do foco (carga/teletransporte): sem pop-in.
    prebuild(focus, radius = null) {
        this._refresh(focus);
        this._pump(Infinity);
    }

    // Constrói pedaços até gastar `ms` neste quadro. Um pedaço custa 12–19 ms no PC (bem mais no celular), então ele é montado em
    // FATIAS (`_buildSteps`: uma linha de células por passo, depois uma malha por passo) e pode atravessar vários quadros — antes, o
    // orçamento só era conferido entre pedaços inteiros, e um salto (respawn no hospital/delegacia) dava vários quadros de 15–25 ms.
    _pump(ms) {
        const t0 = performance.now();
        do {
            if (!this._job) {
                const q = this.queue.shift();
                if (!q) return;
                if (this.chunks.has(q.k)) continue;
                this._job = { k: q.k, steps: this._buildSteps(q.i, q.j) };
            }
            const ts = performance.now(), r = this._job.steps.next();
            this.stats.ms += performance.now() - ts;                         // (só o tempo de trabalho, não a espera entre quadros)
            if (r.done) { this.chunks.set(this._job.k, r.value); this._job = null; }
        } while (performance.now() - t0 < ms);
    }

    // Pedaço inteiro de uma vez (quem precisa dele já pronto).
    _build(ci, cj) {
        const steps = this._buildSteps(ci, cj);
        for (;;) { const r = steps.next(); if (r.done) return r.value; }
    }

    _dispose(c) {
        for (const m of c.meshes) m.dispose();
        this._removeColliders(c);
    }

    _addColliders(c) {
        if (!this.physics || c.colliders.length) return;
        for (const r of this.cliffs.get(c.j * this.ncx + c.i) || []) {
            const node = new BABYLON.TransformNode('cliff', this.scene);
            node.position.set((r.x0 + r.x1) / 2, r.h / 2, (r.z0 + r.z1) / 2);
            const agg = this.physics.addStaticBox(node, new BABYLON.Vector3(r.x1 - r.x0, r.h, r.z1 - r.z0));
            c.colliders.push({ node, agg });
        }
    }

    _removeColliders(c) {
        for (const k of c.colliders) {
            if (this.physics && k.agg) {
                const i = this.physics.staticBodies.indexOf(k.agg);
                if (i >= 0) this.physics.staticBodies.splice(i, 1);
                k.agg.dispose();
            }
            k.node.dispose();
        }
        c.colliders = [];
    }

    // ------------------------------------------------------------------- campos
    _H(i, j) {                                                          // altura da célula (clampada às bordas)
        const M = WorldMap;
        return M.h[Math.max(0, Math.min(M.nz - 1, j)) * M.nx + Math.max(0, Math.min(M.nx - 1, i))];
    }

    // Brilho do relevo no canto (i, j) (entre as células i-1..i e j-1..j): luz do sol sobre a inclinação local.
    _shade(i, j) {
        const c = this.W.cell, K = this.W.heightScale;
        const a = this._H(i - 1, j - 1), b = this._H(i, j - 1), cc = this._H(i - 1, j), d = this._H(i, j);
        const gx = ((b + d) - (a + cc)) / (2 * c) * K, gz = ((cc + d) - (a + b)) / (2 * c) * K;
        const il = 1 / hypot(gx, 1, gz), L = this.L;
        const lam = (-gx * L[0] + L[1] - gz * L[2]) * il;
        if (typeof Relief !== 'undefined' && Relief.on) return Math.max(0.72, Math.min(1.12, 1 + (lam - L[1]) * 0.7));      // (relevo de verdade: a encosta já tem altura — o sombreado pintado fica suave)
        return Math.max(0.5, Math.min(1.2, 1 + (lam - L[1]) * 1.5));
    }

    // Tipo de chão da célula (índice em TerrainSplat.IDS; mar e cidade ficam de fora da mistura).
    // BEIRA DAS RUAS DE TERRA (estrada de chão, caminho, rua da favela — o asfalto fica de fora): as células do terreno a até ~3 m da
    // pista viram TERRA BATIDA no mapa do chão; a mistura larga do TerrainSplat faz dela um degradê de alguns metros — a terra da rua
    // rareando sobre o mato, a areia ou a rocha, sem a borda seca do polígono da pista. (Rasteriza a pista: passos de 2 m.)
    _roadSoil() {
        const M = WorldMap, W = this.W, nx = M.nx, nz = M.nz, c = W.cell, soil = this._soil = new Uint8Array(nx * nz), P = {};
        if (typeof RoadPlan === 'undefined' || !RoadPlan.edges) return;
        for (const e of RoadPlan.edges) {
            const C = RoadPlan.CLASS[e.cls];
            if (!C || C.surface === 'asphalt' || e.layer) continue;
            const R = e.w / 2 + 3, r = Math.ceil(R / c);
            for (let s = 0; s <= e.len; s += 2) {
                if (e.pts) RoadPlan.at(e, Math.min(s, e.len), P);
                else if (e.v) { P.x = e.a.x; P.z = e.a.z + Math.min(s, e.len); }
                else { P.x = e.a.x + Math.min(s, e.len); P.z = e.a.z; }
                const ci = Math.floor((P.x - W.minX) / c), cj = Math.floor((P.z - W.minZ) / c);
                for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
                    const i = ci + di, j = cj + dj;
                    if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
                    const x = W.minX + (i + 0.5) * c, z = W.minZ + (j + 0.5) * c;
                    if (hypot(x - P.x, z - P.z) <= R) soil[j * nx + i] = 1;
                }
            }
        }
    }

    _idFor(b, i, j) {
        const B = WorldMap.B, I = (k) => TerrainSplat.IDS.indexOf(k);
        if (this._soil && this._soil[j * WorldMap.nx + i] && b !== B.SEA && b !== B.CITY && b !== B.SWAMP && !(WorldMap.flags[j * WorldMap.nx + i] & 1)) return I('earth');
        switch (b) {
            case B.SEA: case B.CITY: return TerrainSplat.NONE;
            case B.SAND: return I('sand');
            case B.FOREST: return I('forest');
            case B.SCRUB: return I('scrub');
            case B.ROCK: return I('rock');
            case B.SWAMP: return I('swamp');
            case B.FAVELA: return I('earth');
            case B.FARM: {                                              // talhões de 28×36 u: arado / verde / trigo
                const v = Pixel.hash(Math.floor(i / 7), Math.floor(j / 9), 77);
                return I(v < 0.34 ? 'farm0' : (v < 0.68 ? 'farm1' : 'farm2'));
            }
            default: return I('grass');                                 // GRASS, RESORT
        }
    }

    // -------------------------------------------------------------------- pedaço
    // Passos da construção de um pedaço (gerador): pausa a cada linha de células e antes de cada malha; devolve o pedaço no fim.
    *_buildSteps(ci, cj) {
        const W = this.W, M = WorldMap, B = M.B, c = W.cell, n = this.cn, nx = M.nx, nz = M.nz;
        const gi0 = ci * n, gj0 = cj * n;
        const chunk = { i: ci, j: cj, meshes: [], colliders: [] };
        const ground = new MeshBatch(), vegHi = new MeshBatch(), vegLo = new MeshBatch();
        const wb = this.wb, y = 0.015, base = PropSprites.FRAME / Config.art.ppu;
        const uvT = (x, z) => [x / 4, z / 4];

        // Brilho dos (n+1)² cantos do pedaço.
        const sh = new Float32Array((n + 1) * (n + 1));
        for (let b = 0; b <= n; b++) for (let a = 0; a <= n; a++) sh[b * (n + 1) + a] = this._shade(gi0 + a, gj0 + b);
        const S = (a, b) => sh[b * (n + 1) + a];

        for (let b = 0; b < n; b++) {
            if (b > 0) yield;                                              // (fatia: uma linha de células por passo)
            for (let a = 0; a < n; a++) {
                const gi = gi0 + a, gj = gj0 + b;
                if (gi >= nx || gj >= nz) continue;
                const k = gj * nx + gi, bio = M.biome[k];
                const x0 = W.minX + gi * c, z0 = W.minZ + gj * c, x1 = x0 + c, z1 = z0 + c;

                if (bio === B.SEA) continue;                                  // (a orla é pintada pelo shader do mar: WaterPlugin)
                if (bio === B.CITY) continue;

                const J = (i, j) => 0.95 + 0.1 * Pixel.hash(i, j, 5);                // variação de brilho por CANTO (contínua: sem xadrez de células)
                const cNW = S(a, b + 1) * J(gi, gj + 1), cNE = S(a + 1, b + 1) * J(gi + 1, gj + 1), cSW = S(a, b) * J(gi, gj), cSE = S(a + 1, b) * J(gi + 1, gj);
                const col = (s) => [s * 1, s * 1, s * 1];
                // Um quadrado por célula, todos no material do chão: a textura, as divisas em degradê, as curvas de nível e a sombra
                // dos paredões são pintadas no shader (TerrainSplat), em curvas — nada de degraus nas bordas das células.
                ground.top(x0, z0, x1, z1, y, uvT, [col(cNW), col(cNE), col(cSW), col(cSE)]);

                const hc = M.h[k];
                this._plant(vegHi, vegLo, bio, gi, gj, x0 + c / 2, z0 + c / 2, hc, base);
            }
        }

        // Monta as malhas (uma por passo).
        const mk = (bt, name, mat, o) => { const m = bt.build(`terr_${ci}_${cj}_${name}`, this.scene, mat, Object.assign({ receiveShadows: false, alwaysActive: false, relief: true }, o)); if (m) chunk.meshes.push(m); return m; };
        yield; mk(ground, 'ground', this.ground, { vertexColors: true, clamp: TerrainBuilder.roadCut });
        yield;
        const hi = mk(vegHi, 'vhi', wb.props.hiMaterial, { vertexColors: true });
        if (hi) {                                                                 // copas por cima de tudo que anda no chao (ver WorldBuilder._flush)
            hi.renderingGroupId = 1; hi.alphaIndex = -1;
            const mk = XRaySilhouette.addMask(hi, wb.props.maskMaterial);         // (quem passa embaixo: a silhueta dourada)
            if (mk) chunk.meshes.push(mk);
        }
        yield; mk(vegLo, 'vlo', wb.props.loMaterial, { vertexColors: true });
        if (vegHi.trees || vegLo.trees) { yield; for (const m of Trees3D.build(this.scene, [vegHi, vegLo], `terr_${ci}_${cj}`, wb.shadow, { lod: 0, casts: false })) chunk.meshes.push(m); }      // árvores 3D (etapa 5)
        this._addColliders(chunk);

        this.stats.built++;
        return chunk;
    }

    // CORTE DA ESTRADA (relevo): o chão do terreno não passa por cima da pista. Os triângulos do terreno (4 u) ligam a pista aplainada aos
    // cantos altos da encosta e cobriam o asfalto em dentes; perto da pista o chão fica no máximo na altura da beira dela (um acostamento
    // de uma célula) e sobe dali em rampa (talude de 0,8 m/m) — como um corte de estrada de verdade. 0,4 m abaixo: a pista, linear entre
    // os vértices dela, cede até ~0,2 m no alto de um morro.
    static roadCut(x, z, h) {
        const n = RoadPlan.nearestRoadPoint(x, z, 12);
        if (!n || (n.edge && n.edge.layer)) return h;
        const hw = n.edge.w / 2, d = n.d - hw;
        if (d > 11) return h;
        // (a pista inclina de lado com o morro: a referência é a BEIRA dela do lado do vértice, não o eixo)
        const k = n.d > 1e-3 ? Math.min(n.d, hw) / n.d : 0, ex = n.x + (x - n.x) * k, ez = n.z + (z - n.z) * k, r = Relief.at(ex, ez);
        // (só CORTA o que sobe acima da pista: o chão plano ou mais baixo fica onde está — rebaixado, ele afundava sob o nível do mar
        // e o plano d'água aparecia por cima da grama ao lado das ruas planas; o corte também nunca desce abaixo da lâmina d'água)
        if (h <= r + 0.05) return h;
        return Math.max(Math.min(h, r - 0.4 + Math.max(0, d - 4.3) * 0.8), Math.min(h, 0.04));
    }

    // Vegetação e rochas da célula: tabelas por bioma [tipo, probabilidade, escala mín, escala máx].
    static get VEG() {
        const B = WorldMap.B, T = typeof SpriteHD !== 'undefined' && SpriteHD.on;      // (tufos de grama: só com os sprites em alta definição)
        // (com o chão de FOTO a grama já está no chão: os tufos desenhados ficam raros — só um ou outro capim mais alto)
        // (3D — Trees3D: os tufos são touceiras de lâminas, o mato rasteiro que preenche o chão)
        const real = typeof GroundPhotos !== 'undefined' && GroundPhotos.on && !GroundPhotos.mixed, q = real && !(typeof Trees3D !== 'undefined' && Trees3D.on) ? 0.12 : 0.5;
        const tufts = (p) => T ? [['tuft', p * q, 0.8, 1.3], ['tuft', p * 0.8 * q, 0.7, 1.2], ['tuft', p * 0.6 * q, 0.8, 1.3]] : [];
        const V = {
            [B.FOREST]: [['pine', 0.7, 0.95, 1.3], ['oak', 0.55, 0.95, 1.3], ['bush', 0.45, 0.8, 1.2], ['fern', 0.3, 0.8, 1.3], ['araucaria', 0.08, 1.0, 1.35]],
            [B.GRASS]: [['oak', 0.1, 0.9, 1.25], ['bush', 0.14, 0.8, 1.1], ['flowers', 0.05, 0.8, 1.2], ['ipe', 0.02, 0.95, 1.3]],
            [B.FARM]: [['oak', 0.012, 1.0, 1.3]],
            [B.SWAMP]: [['reed', 0.7, 0.75, 1.1], ['cypress', 0.3, 0.9, 1.3], ['bush', 0.18, 0.8, 1.1], ['juca', 0.06, 0.9, 1.2], ['fern', 0.12, 0.8, 1.2]],
            [B.SCRUB]: [['dry', 0.4, 0.8, 1.2], ['boulder', 0.03, 0.6, 1.0], ['oak', 0.02, 0.9, 1.2]],
            [B.ROCK]: [['boulder', 0.16, 0.6, 1.25], ['pine', 0.1, 0.9, 1.2], ['dry', 0.08, 0.8, 1.1], ['bush', 0.05, 0.8, 1.1]],
            [B.SAND]: [['palm', 0.06, 0.9, 1.3], ['boulder', 0.01, 0.5, 0.8], ['dry', 0.03, 0.7, 1.0]],
            [B.FAVELA]: [['banana', 0.05, 0.9, 1.2], ['bush', 0.1, 0.8, 1.1], ['dry', 0.08, 0.8, 1.1], ['jungle', 0.05, 0.9, 1.2], ['flowers', 0.02, 0.8, 1.1]],
            [B.RESORT]: [['palm', 0.09, 0.9, 1.3], ['bush', 0.09, 0.8, 1.1], ['flowers', 0.06, 0.8, 1.2], ['juca', 0.03, 0.9, 1.2]],
        };
        // (no fim de cada tabela: os sorteios das plantas que já existiam continuam os mesmos)
        for (const [b, p] of [[B.GRASS, 0.75], [B.FOREST, 0.35], [B.SCRUB, 0.5], [B.FARM, 0.2]]) if (V[b]) V[b] = V[b].concat(tufts(p));
        // espécies só em 3D (Trees3D): cacto no cerrado e nas pedras, bambuzal no brejo e na beira da mata, costela-de-adão no sub-bosque,
        // espada-de-são-jorge e folhagem na favela
        if (typeof Trees3D !== 'undefined' && Trees3D.on) {
            const add = (b, rows) => { if (V[b]) V[b] = V[b].concat(rows); };
            add(B.SCRUB, [['cactus', 0.03, 0.7, 1.2]]); add(B.ROCK, [['cactus', 0.02, 0.7, 1.1]]);
            add(B.SWAMP, [['bamboo', 0.05, 0.8, 1.2]]); add(B.FOREST, [['monstera', 0.07, 0.8, 1.3], ['bamboo', 0.012, 0.8, 1.2]]); add(B.GRASS, [['bamboo', 0.004, 0.8, 1.2]]);
            add(B.FAVELA, [['sansevieria', 0.06, 0.8, 1.3], ['monstera', 0.03, 0.8, 1.2], ['capim', 0.14, 0.7, 1.1], ['fern', 0.08, 0.7, 1.1]]);
            // CAPIM-COLONIÃO (camada média, entre o tufo e o arbusto): pasto sujo, cerrado, beira de mata e de brejo
            add(B.GRASS, [['capim', 0.16, 0.7, 1.15]]); add(B.SCRUB, [['capim', 0.32, 0.7, 1.2]]); add(B.FARM, [['capim', 0.03, 0.7, 1.0]]);
            add(B.FOREST, [['capim', 0.06, 0.7, 1.1]]); add(B.SWAMP, [['capim', 0.12, 0.8, 1.2]]); add(B.ROCK, [['capim', 0.14, 0.6, 1.0]]);
        }
        return V;
    }

    // MATA ATLÂNTICA: dossel fechado de árvores altas (jequitibá), palmitos, araucárias, ipês floridos, bananeiras e samambaias no sub-bosque.
    // `ATL` = miolo da mata (floresta densa); `ATL_EDGE` = franja que invade campo, encosta e morro.
    static get ATL() {
        return [['jungle', 0.6, 1.0, 1.4], ['juca', 0.28, 0.9, 1.3], ['araucaria', 0.12, 1.0, 1.35], ['ipe', 0.1, 0.95, 1.3], ['banana', 0.08, 0.9, 1.2],
            ['oak', 0.2, 0.95, 1.3], ['fern', 0.55, 0.8, 1.3], ['bush', 0.4, 0.8, 1.2], ['flowers', 0.06, 0.8, 1.2], ['boulder', 0.02, 0.5, 0.9]];
    }
    static get ATL_EDGE() {
        return [['jungle', 0.2, 0.95, 1.3], ['juca', 0.12, 0.9, 1.2], ['fern', 0.3, 0.8, 1.2], ['bush', 0.2, 0.8, 1.1], ['ipe', 0.05, 0.95, 1.3], ['banana', 0.04, 0.9, 1.2]];
    }

    _plant(hi, lo, bio, gi, gj, cx, cz, h, base) {
        const B = WorldMap.B;
        let table = (TerrainBuilder._veg || (TerrainBuilder._veg = TerrainBuilder.VEG))[bio];
        if (bio === B.FOREST || bio === B.GRASS || bio === B.ROCK) {
            // Manchas grandes e suaves (ruído) decidem onde a mata atlântica fecha: na floresta quase tudo; no campo e nos morros só a franja.
            const a = WorldMap._fbm(cx / 120, cz / 120, 2, 71);
            if (bio === B.FOREST) { if (a > 0.36) table = TerrainBuilder._atl || (TerrainBuilder._atl = TerrainBuilder.ATL); }
            else if (a > (bio === B.ROCK ? 0.55 : 0.6) && h < 34) table = TerrainBuilder._atlE || (TerrainBuilder._atlE = TerrainBuilder.ATL_EDGE);
        }
        if (typeof Speedway !== 'undefined' && Speedway.covers(cx, cz, 4)) return;                          // (o autódromo: sem mato na pista)
        // ROCHA EXPOSTA nas encostas (relevo de verdade): quanto mais íngreme, mais blocos de pedra meio enterrados e cascalho rolado
        // — o barranco deixa de ser uma rampa lisa com textura (também nos paredões, onde não nasce mais nada)
        if (typeof Trees3D !== 'undefined' && Trees3D.on && typeof Relief !== 'undefined' && Relief.on && bio !== B.SAND && bio !== B.SWAMP) {
            const e = 2.5, R = (x, z) => Relief.at(x, z), gx = (R(cx + e, cz) - R(cx - e, cz)) / (2 * e), gz = (R(cx, cz + e) - R(cx, cz - e)) / (2 * e);
            const slope = Math.hypot(gx, gz), cl = WorldMap.flags[gj * WorldMap.nx + gi] & 1, c2 = this.W.cell;
            const pr = cl ? 0.32 : Math.min(0.32, Math.max(0, slope - 0.32) * 0.9);
            for (const [kind, p, s0, s1, sd] of [['rock', pr, 0.6, 1.5, 900], ['rock', pr * 0.6, 0.35, 0.8, 910], ['pebbles', Math.min(0.6, pr * 1.4), 0.8, 1.3, 920]]) {
                if (p <= 0 || Pixel.hash(gi, gj, sd) >= p) continue;
                const x = cx + (Pixel.hash(gi, gj, sd + 1) - 0.5) * c2 * 0.9, z = cz + (Pixel.hash(gi, gj, sd + 2) - 0.5) * c2 * 0.9;
                if (RoadPlan.onPavement(x, z, 1.6)) continue;
                Trees3D.add(lo, kind, x, 0, z, s0 + (s1 - s0) * Pixel.hash(gi, gj, sd + 3));
            }
        }
        if (WorldMap.flags[gj * WorldMap.nx + gi] & 1) return;
        if (typeof Landmarks !== 'undefined' && Landmarks.covers(cx, cz, 4)) return;                        // (os marcos)
        // BEIRA DA ESTRADA (transição de solo): na faixa de 1–3 m fora da pista, o mato invade — tufos, capim e cascalho rolado do
        // acostamento; a borda da estrada deixa de ser uma linha seca entre o asfalto e a grama
        if (typeof Trees3D !== 'undefined' && Trees3D.on && bio !== B.SAND && bio !== B.SWAMP && RoadPlan.onPavement(cx, cz, 5)) {
            const c3 = this.W.cell;
            for (let t = 0; t < 4; t++) {
                const x = cx + (Pixel.hash(gi, gj, 500 + t) - 0.5) * c3, z = cz + (Pixel.hash(gi, gj, 510 + t) - 0.5) * c3;
                if (!RoadPlan.onPavement(x, z, 3.2) || RoadPlan.onPavement(x, z, 0.9)) continue;
                const r = Pixel.hash(gi, gj, 520 + t), s = 0.6 + 0.5 * Pixel.hash(gi, gj, 530 + t);
                const kind = r < 0.42 ? 'tuft' : r < 0.6 ? (bio === B.FARM || bio === B.SCRUB || bio === B.GRASS ? 'capim' : 'fern') : r < 0.85 ? 'pebbles' : null;
                if (kind) Trees3D.add(lo, kind, x, 0, z, kind === 'capim' ? s * 0.75 : s);
            }
        }
        if (!table) return;
        if (typeof Lagoa !== 'undefined' && Lagoa.covers(cx, cz, 4)) return;                                  // (a Lagoa: orla e prédios)
        if (typeof Plantations !== 'undefined' && Plantations.covers(cx, cz, 2)) return;                      // (o eucaliptal: só eucalipto)
        const c = this.W.cell, wb = this.wb;
        for (let t = 0; t < table.length; t++) {
            const [kind, p, s0, s1] = table[t];
            let prob = p;
            if (kind === 'pine' && bio === B.FOREST) prob *= h > 8 ? 1.4 : 0.8;
            if (kind === 'oak' && bio === B.FOREST && h > 14) prob *= 0.3;
            if (Pixel.hash(gi, gj, 300 + t) >= prob) continue;
            const x = cx + (Pixel.hash(gi, gj, 310 + t) - 0.5) * c * 0.95, z = cz + (Pixel.hash(gi, gj, 320 + t) - 0.5) * c * 0.95;
            const s = s0 + (s1 - s0) * Pixel.hash(gi, gj, 330 + t);
            if (RoadPlan.onPavement(x, z, (PropSprites.CROWN[kind] || 1.5) * s)) continue;           // nada de mato na pista (rodovia, estrada, ponte, viaduto)
            if (!PropSprites.HEIGHT[kind]) { Trees3D.add(PropSprites.HEIGHT[kind] === undefined && (Trees3D.TALL[kind] || 2) > 2 ? hi : lo, kind, x, 0, z, s); continue; }      // (espécie só 3D: sem desenho no atlas)
            const fr = wb.props.pick(kind, Pixel.hash(gi, gj, 340 + t));
            const high = PropSprites.HEIGHT[kind] > 2;
            wb._spriteQuad(high ? hi : lo, fr.index, fr.row, x, z, base * s, PropSprites.HEIGHT[kind], PropSprites.SWAY[kind] || 0);
        }
    }

    // Quantos pedaços/colisores estão ativos (debug).
    get info() {
        let col = 0; for (const c of this.chunks.values()) col += c.colliders.length;
        return { chunks: this.chunks.size, queued: this.queue.length, colliders: col, built: this.stats.built, avgMs: this.stats.built ? +(this.stats.ms / this.stats.built).toFixed(2) : 0 };
    }
}
memoStatics(TerrainBuilder, 'VEG', 'ATL', 'ATL_EDGE');
