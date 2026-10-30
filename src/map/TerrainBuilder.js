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
        return Math.max(0.5, Math.min(1.2, 1 + (lam - L[1]) * 1.5));
    }

    // Tipo de chão da célula (índice em TerrainSplat.IDS; mar e cidade ficam de fora da mistura).
    _idFor(b, i, j) {
        const B = WorldMap.B, I = (k) => TerrainSplat.IDS.indexOf(k);
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
        const mk = (bt, name, mat, o) => { const m = bt.build(`terr_${ci}_${cj}_${name}`, this.scene, mat, Object.assign({ receiveShadows: false, alwaysActive: false }, o)); if (m) chunk.meshes.push(m); return m; };
        yield; mk(ground, 'ground', this.ground, { vertexColors: true });
        yield;
        const hi = mk(vegHi, 'vhi', wb.props.hiMaterial, { vertexColors: true });
        if (hi) {                                                                 // copas por cima de tudo que anda no chao (ver WorldBuilder._flush)
            hi.renderingGroupId = 1; hi.alphaIndex = -1;
            const mk = XRaySilhouette.addMask(hi, wb.props.maskMaterial);         // (quem passa embaixo: a silhueta dourada)
            if (mk) chunk.meshes.push(mk);
        }
        yield; mk(vegLo, 'vlo', wb.props.loMaterial, { vertexColors: true });
        this._addColliders(chunk);

        this.stats.built++;
        return chunk;
    }

    // Vegetação e rochas da célula: tabelas por bioma [tipo, probabilidade, escala mín, escala máx].
    static get VEG() {
        const B = WorldMap.B, T = typeof SpriteHD !== 'undefined' && SpriteHD.on;      // (tufos de grama: só com os sprites em alta definição)
        const tufts = (p) => T ? [['tuft', p, 0.8, 1.3], ['tuft', p * 0.8, 0.7, 1.2], ['tuft', p * 0.6, 0.8, 1.3]] : [];
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
        if (!table || (WorldMap.flags[gj * WorldMap.nx + gi] & 1)) return;
        if (typeof Speedway !== 'undefined' && Speedway.covers(cx, cz, 4)) return;                          // (o autódromo: sem mato na pista)
        if (typeof Landmarks !== 'undefined' && Landmarks.covers(cx, cz, 4)) return;                        // (os marcos)
        if (typeof Lagoa !== 'undefined' && Lagoa.covers(cx, cz, 4)) return;                                  // (a Lagoa: orla e prédios)
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
