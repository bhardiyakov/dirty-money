// ============================================================================
// TerrainBuilder — desenha o terreno do mundo grande (WorldMap) em PEDAÇOS (chunks) só ao redor do foco:
//   chão por bioma (grama, mata, mato seco, lavoura, pântano, pedra, terra da favela, areia) com SOMBREADO DE RELEVO
//   (hillshade nos vértices), curvas de nível, faixa de sombra nos paredões, vegetação/rochas em sprites, espuma da costa
//   e colisores dos paredões (Havok) — tudo descartado quando o pedaço fica longe.
// O relevo é VISUAL: a malha é plana (y ≈ 0), então física, sprites, tiros e navegação continuam como antes.
// A cidade em grade (CityGrid) é desenhada pelo WorldBuilder; aqui as células CITY e SEA são puladas (SEA só ganha espuma).
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

        const T = wb.T, M = wb.mats, tm = (n, t) => wb._mat(n, t);
        this.mat = {
            sand: M.sand, grass: M.grass, forest: tm('t_forest', T.forest), scrub: tm('t_scrub', T.scrub), rock: tm('t_rock', T.rock),
            swamp: tm('t_swamp', T.swamp), earth: tm('t_earth', T.earth), dirt: tm('t_dirt', T.dirt),
            farm0: tm('t_farm0', T.farm0), farm1: tm('t_farm1', T.farm1), farm2: tm('t_farm2', T.farm2),
        };
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

    _pump(ms) {
        const t0 = performance.now();
        while (this.queue.length) {
            const q = this.queue.shift();
            if (this.chunks.has(q.k)) continue;
            this.chunks.set(q.k, this._build(q.i, q.j));
            if (performance.now() - t0 > ms) break;
        }
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

    _matFor(b, i, j) {
        const B = WorldMap.B, m = this.mat;
        switch (b) {
            case B.SAND: return m.sand;
            case B.FOREST: return m.forest;
            case B.SCRUB: return m.scrub;
            case B.ROCK: return m.rock;
            case B.SWAMP: return m.swamp;
            case B.FAVELA: return m.earth;
            case B.FARM: {                                              // talhões de 28×36 u: arado / verde / trigo
                const v = Pixel.hash(Math.floor(i / 7), Math.floor(j / 9), 77);
                return v < 0.34 ? m.farm0 : (v < 0.68 ? m.farm1 : m.farm2);
            }
            default: return m.grass;                                    // GRASS, RESORT
        }
    }

    // -------------------------------------------------------------------- pedaço
    _build(ci, cj) {
        const t0 = performance.now();
        const W = this.W, M = WorldMap, B = M.B, c = W.cell, n = this.cn, nx = M.nx, nz = M.nz;
        const gi0 = ci * n, gj0 = cj * n;
        const chunk = { i: ci, j: cj, meshes: [], colliders: [] };
        const batches = new Map();
        const batch = (mat) => { let b = batches.get(mat); if (!b) batches.set(mat, b = new MeshBatch()); return b; };
        const trim = new MeshBatch(), foam = new MeshBatch(), vegHi = new MeshBatch(), vegLo = new MeshBatch();
        const wb = this.wb, y = 0.015, base = PropSprites.FRAME / Config.art.ppu;
        const uvT = (x, z) => [x / 4, z / 4];

        // Brilho dos (n+1)² cantos do pedaço.
        const sh = new Float32Array((n + 1) * (n + 1));
        for (let b = 0; b <= n; b++) for (let a = 0; a <= n; a++) sh[b * (n + 1) + a] = this._shade(gi0 + a, gj0 + b);
        const S = (a, b) => sh[b * (n + 1) + a];

        const biomeAt = (i, j) => (i < 0 || j < 0 || i >= nx || j >= nz) ? B.SEA : M.biome[j * nx + i];
        const isGround = (b) => b !== B.SEA && b !== B.CITY;

        for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
            const gi = gi0 + a, gj = gj0 + b;
            if (gi >= nx || gj >= nz) continue;
            const k = gj * nx + gi, bio = M.biome[k];
            const x0 = W.minX + gi * c, z0 = W.minZ + gj * c, x1 = x0 + c, z1 = z0 + c;

            if (bio === B.SEA) {                                         // espuma: água encostada na terra (não na cidade-calçadão)
                this._foam(foam, gi, gj, x0, z0, x1, z1, biomeAt);
                continue;
            }
            if (bio === B.CITY) continue;

            const jit = 0.95 + 0.1 * Pixel.hash(gi, gj, 5);
            const cNW = S(a, b + 1) * jit, cNE = S(a + 1, b + 1) * jit, cSW = S(a, b) * jit, cSE = S(a + 1, b) * jit;
            const col = (s) => [s * 1, s * 1, s * 1];
            // Células na divisa de biomas: 2×2 sub-quadros, cada um sorteia o bioma vizinho (borda "pontilhada" de pixel art).
            const nb = [biomeAt(gi + 1, gj), biomeAt(gi - 1, gj), biomeAt(gi, gj + 1), biomeAt(gi, gj - 1)];
            const mixed = nb.some((q) => q !== bio && isGround(q) && q !== B.SAND) && bio !== B.SAND;
            if (!mixed) {
                batch(this._matFor(bio, gi, gj)).top(x0, z0, x1, z1, y, uvT, [col(cNW), col(cNE), col(cSW), col(cSE)]);
            } else {
                const h = c / 2;
                for (let sz = 0; sz < 2; sz++) for (let sx = 0; sx < 2; sx++) {
                    const hn = nb[sx ? 0 : 1], vn = nb[sz ? 2 : 3], r = Pixel.hash(gi * 2 + sx, gj * 2 + sz, 9);
                    let q = bio;
                    if (r < 0.33 && isGround(hn) && hn !== B.SAND) q = hn; else if (r < 0.66 && isGround(vn) && vn !== B.SAND) q = vn;
                    const u0 = sx * 0.5, v0 = sz * 0.5, u1 = u0 + 0.5, v1 = v0 + 0.5;
                    const lerp = (u, v) => { const s = (cSW * (1 - u) + cSE * u) * (1 - v) + (cNW * (1 - u) + cNE * u) * v; return col(s); };
                    const sx0 = x0 + sx * h, sz0 = z0 + sz * h;
                    batch(this._matFor(q, gi, gj)).top(sx0, sz0, sx0 + h, sz0 + h, y, uvT, [lerp(u0, v1), lerp(u1, v1), lerp(u0, v0), lerp(u1, v0)]);
                }
            }

            // Curvas de nível (nas serras/morros e onde o terreno sobe) e sombra nos paredões.
            const hc = M.h[k];
            if (hc > 8 || bio === B.ROCK || bio === B.FAVELA) {
                const lv = (v) => Math.floor(v / W.contour);
                const L0 = lv(hc);
                const eastK = gi + 1 < nx ? k + 1 : -1, northK = gj + 1 < nz ? k + nx : -1;
                const line = (xa, za, xb, zb, lvl) => {
                    const th = (lvl % 4 === 0) ? 0.34 : 0.2, dk = (lvl % 4 === 0) ? 0.36 : 0.52;
                    trim.top(Math.min(xa, xb) - (xa === xb ? th / 2 : 0), Math.min(za, zb) - (za === zb ? th / 2 : 0), Math.max(xa, xb) + (xa === xb ? th / 2 : 0), Math.max(za, zb) + (za === zb ? th / 2 : 0), y + 0.004, () => [0, 0], [0.32 * dk + 0.1, 0.27 * dk + 0.08, 0.2 * dk + 0.05]);
                };
                if (eastK >= 0 && isGround(M.biome[eastK]) && lv(M.h[eastK]) !== L0) line(x1, z0, x1, z1, Math.max(L0, lv(M.h[eastK])));
                if (northK >= 0 && isGround(M.biome[northK]) && lv(M.h[northK]) !== L0) line(x0, z1, x1, z1, Math.max(L0, lv(M.h[northK])));
            }
            if (M.flags[k] & 1) {                                        // paredão: faixa escura do lado onde o chão cai
                const dirs = [[1, 0, x1 - 1.0, z0, x1, z1], [-1, 0, x0, z0, x0 + 1.0, z1], [0, 1, x0, z1 - 1.0, x1, z1], [0, -1, x0, z0, x1, z0 + 1.0]];
                for (const [dx, dz, ax, az, bx, bz] of dirs) {
                    if (this._H(gi + dx, gj + dz) < hc - 2.2) trim.top(ax, az, bx, bz, y + 0.006, () => [0, 0], [0.13, 0.11, 0.09]);
                }
            }

            this._plant(vegHi, vegLo, bio, gi, gj, x0 + c / 2, z0 + c / 2, hc, base);
        }

        // Monta as malhas.
        const mk = (bt, name, mat, o) => { const m = bt.build(`terr_${ci}_${cj}_${name}`, this.scene, mat, Object.assign({ receiveShadows: false, alwaysActive: false }, o)); if (m) chunk.meshes.push(m); return m; };
        for (const [mat, bt] of batches) mk(bt, mat.name, mat, { vertexColors: true });
        mk(trim, 'trim', wb.mats.solid, { vertexColors: true });
        mk(foam, 'foam', wb.mats.shore);
        const hi = mk(vegHi, 'vhi', wb.props.hiMaterial, { vertexColors: true });
        if (hi) { hi.renderingGroupId = 1; hi.alphaIndex = -1; }                  // copas por cima de tudo que anda no chao (ver WorldBuilder._flush)
        const lo = mk(vegLo, 'vlo', wb.props.loMaterial, { vertexColors: true });
        this._addColliders(chunk);

        this.stats.built++; this.stats.ms += performance.now() - t0;
        return chunk;
    }

    // Espuma ao longo da costa: célula de água vizinha (4 direções) de terra que não seja só a cidade.
    _foam(bt, gi, gj, x0, z0, x1, z1, biomeAt) {
        const B = WorldMap.B, D = 6;
        const land = (i, j) => { const b = biomeAt(i, j); return b !== B.SEA; };
        // [vizinho terra, borda da faixa (xa,za,xb,zb), direção para dentro do mar]
        if (land(gi - 1, gj)) bt.top(x0, z0, x0 + D, z1, 0.012, (x, z) => [z / 8, (x - x0) / D]);
        if (land(gi + 1, gj)) bt.top(x1 - D, z0, x1, z1, 0.012, (x, z) => [z / 8, (x1 - x) / D]);
        if (land(gi, gj - 1)) bt.top(x0, z0, x1, z0 + D, 0.012, (x, z) => [x / 8, (z - z0) / D]);
        if (land(gi, gj + 1)) bt.top(x0, z1 - D, x1, z1, 0.012, (x, z) => [x / 8, (z1 - z) / D]);
    }

    // Vegetação e rochas da célula: tabelas por bioma [tipo, probabilidade, escala mín, escala máx].
    static get VEG() {
        const B = WorldMap.B;
        return {
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
