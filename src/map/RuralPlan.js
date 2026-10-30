// ============================================================================
// RuralPlan — o campo: fazendas, casas de beira de estrada, cabanas na mata, trailer park, palafitas no pântano, postos de
// gasolina nas rodovias, torres (caixa-d'água, rádio, eólicas) e alamedas de árvores ao longo das estradas.
// Roda DEPOIS do relevo (CityGrid.finish) e produz um "quarteirão virtual" (CityGrid.extraBlocks) com lotes (prédios com
// colisão), props (árvores, silos, feno), cercas puláveis e peças soltas (torres, coberturas de posto, docas) que o
// WorldBuilder desenha. Determinístico (seed fixa).
// ============================================================================

const RuralPlan = {
    build() {
        const G = CityGrid, B = WorldMap.B, rng = Pixel.rng(31337);
        const blk = { id: 'rural', district: 'rural', i: 9000, j: 9000, biome: 'rural', open: true, virtual: true, slab: [0, 0, 0, 0], foot: [0, 0, 0, 0], lots: [], props: [], fences: [], towers: [], canopies: [], docks: [] };
        G.extraBlocks = [blk];
        this.blk = blk; this.rng = rng;
        const t0 = performance.now();
        if (typeof Bairros !== 'undefined') Bairros.build(this);                       // os bairros do interior (Vila da Roça, Alto da Serra) antes do resto
        this._farms(); this._roadside(); this._cabins(); this._trailers(); this._huts(); this._gas(); this._towers(); this._alleys();
        // Estatística (debug).
        this.stats = { lots: blk.lots.length, props: blk.props.length, fences: blk.fences.length, towers: blk.towers.length, ms: +(performance.now() - t0).toFixed(0) };
        console.log(`[CAMPO] ${blk.lots.length} construções, ${blk.props.length} props, ${blk.fences.length} cercas, ${blk.towers.length} torres em ${this.stats.ms} ms`);
    },

    // ------------------------------------------------------------------ utilidades
    // O retângulo está livre para construir? Terra firme sem paredão, bioma permitido, longe de rua e de outros sólidos.
    free(x0, z0, x1, z1, ok = null, roadMargin = 5) {
        const B = WorldMap.B, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        const pts = [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [cx, cz], [cx, z0], [cx, z1], [x0, cz], [x1, cz]];
        for (const [x, z] of pts) {
            const k = WorldMap.index(x, z);
            if (k < 0 || !WorldMap.land[k] || (WorldMap.flags[k] & 1) || WorldMap.waterDist(x, z) < 5) return false;
            const b = WorldMap.biome[k];
            if (b === B.CITY || b === B.SEA || b === B.FAVELA || (ok && !ok.includes(b))) return false;
            if (!this.inZone && typeof Bairros !== 'undefined' && Bairros.zoneAt(x, z)) return false;      // (os bairros são montados à mão: Bairros.js)
            if (typeof Landmarks !== 'undefined' && Landmarks.covers(x, z, 6)) return false;                 // (os marcos: estádio, Cristo, Pão de Açúcar)
            if (typeof Speedway !== 'undefined' && Speedway.covers(x, z, 6)) return false;                  // (o autódromo)
            const n = RoadPlan.nearestRoadPoint(x, z, 70);
            if (n && n.d < n.edge.w / 2 + roadMargin) return false;
        }
        const r = hypot(x1 - x0, z1 - z0) / 2 + 2;
        for (const o of CityGrid.obstaclesAround(cx, cz, r)) if (o.x1 > x0 - 1.5 && o.x0 < x1 + 1.5 && o.z1 > z0 - 1.5 && o.z0 < z1 + 1.5) return false;
        return true;
    },

    lot(x0, z0, x1, z1, floors, facade, roof) { CityGrid._addLot(this.blk, x0, z0, x1, z1, floors, facade, roof); },
    tree(kind, x, z, s = 1) { this.blk.props.push({ type: 'tree', kind, x, z, s, seed: Math.floor(this.rng() * 1000) }); },
    prop(kind, x, z, s = 1) { this.blk.props.push({ type: 'prop', kind, x, z, s, seed: Math.floor(this.rng() * 1000) }); },
    solid(x0, z0, x1, z1, h) { CityGrid.addObstacles([{ x0, z0, x1, z1, h }]); },

    // Cerca/grade pulável ao longo de um lado, com um vão de passagem (portão) em `gap` (posição ao longo, comprimento 5).
    fenceLine(alongX, fixed, a0, a1, gap = null) {
        const parts = [];
        if (gap === null || gap < a0 + 3 || gap > a1 - 8) parts.push([a0, a1]); else parts.push([a0, gap], [gap + 5, a1]);
        for (const [s, e] of parts) {
            const th = 0.3, f = alongX ? { x0: s, z0: fixed, x1: e, z1: fixed + th } : { x0: fixed, z0: s, x1: fixed + th, z1: e };
            Object.assign(f, { h: 1.4, vault: true, kind: 'fence' });
            this.blk.fences.push(f); CityGrid.obstacles.push(f); CityGrid.vaultables.push(f); CityGrid._gridInsert(f);
        }
    },

    pickCells(biomes, n, minGap, trials = 1500) {
        const out = [], W = Config.world;
        for (let t = 0; t < trials && out.length < n; t++) {
            const x = W.minX + this.rng() * (W.maxX - W.minX), z = W.minZ + this.rng() * (W.maxZ - W.minZ);
            if (!biomes.includes(WorldMap.biomeAt(x, z))) continue;
            if (out.some((o) => hypot(o.x - x, o.z - z) < minGap)) continue;
            out.push({ x, z });
        }
        return out;
    },

    // ------------------------------------------------------------------ fazendas
    // Casa, celeiro, silo, fardos de feno, pomar e um pasto cercado; nas lavouras, perto das estradas de terra.
    _farms() {
        const B = WorldMap.B, rng = this.rng, ok = [B.FARM, B.GRASS];
        let placed = 0;
        for (const c of this.pickCells([B.FARM, B.GRASS], 140, 100, 14000)) {          // (muitos candidatos: a malha de estradas é densa)
            if (placed >= 14) break;
            const x0 = Math.round(c.x - 30), z0 = Math.round(c.z - 24), x1 = x0 + 60, z1 = z0 + 48;
            if (!this.free(x0, z0, x1, z1, ok, 8)) continue;
            // casa (esq.) e celeiro (dir.), de frente para o sul
            this.lot(x0 + 4, z0 + 5, x0 + 4 + 10, z0 + 5 + 8, 2, ['house0', 'house1', 'house2', 'house3'][Math.floor(rng() * 4)], 'tile0');
            this.lot(x0 + 30, z0 + 8, x0 + 30 + 15, z0 + 8 + 11, 2, 'barn0', 'redmetal');
            const sx = x0 + 52, sz = z0 + 14;                                             // silo
            this.prop('silo', sx, sz, 1.1); this.solid(sx - 1.6, sz - 1.6, sx + 1.6, sz + 1.6, 6);
            for (let k = 0; k < 4; k++) this.prop('hay', x0 + 28 + rng() * 22, z0 + 24 + rng() * 6, 0.9);
            for (let k = 0; k < 3; k++) this.tree('oak', x0 + 2 + rng() * 56, z0 + 40 + rng() * 6, 1.1);
            for (let r = 0; r < 3; r++) for (let q = 0; q < 6; q++) this.prop('orchard', x0 + 6 + q * 6.5, z0 + 32 + r * 5, 0.9);      // pomar
            // pasto cercado em volta do conjunto (vão virado para o sul)
            this.fenceLine(true, z0, x0, x1, x0 + 14); this.fenceLine(true, z1, x0, x1);
            this.fenceLine(false, x0, z0, z1); this.fenceLine(false, x1 - 0.3, z0, z1);
            placed++;
        }
        this.farmCount = placed;
    },

    // ---------------------------------------------------------- casas de beira de estrada
    _roadside() {
        const B = WorldMap.B, rng = this.rng;
        let n = 0;
        for (const e of RoadPlan.edges) {
            if (e.cls !== 'hwy' && e.cls !== 'dirt') continue;
            for (let s = 40 + rng() * 80; s < e.len - 40; s += 90 + rng() * 140) {
                const side = rng() < 0.5 ? 1 : -1, off = e.w / 2 + 12 + rng() * 10;
                const q = e.free ? RoadPlan.at(e, s) : null;                            // (via livre: ao lado da polilinha)
                const cx = q ? q.x + q.tz * side * off : (e.v ? e.a.x + side * off : e.a.x + s), cz = q ? q.z - q.tx * side * off : (e.v ? e.a.z + s : e.a.z + side * off);
                const w = 8 + Math.floor(rng() * 4), d = 6 + Math.floor(rng() * 3), x0 = Math.round(cx - w / 2), z0 = Math.round(cz - d / 2);
                if (!this.free(x0, z0, x0 + w, z0 + d, [B.GRASS, B.FARM, B.FOREST, B.SCRUB], 7)) continue;
                this.lot(x0, z0, x0 + w, z0 + d, 1 + Math.floor(rng() * 2), ['house0', 'house1', 'house2', 'house3', 'brick2'][Math.floor(rng() * 5)], ['tile0', 'tile1', 'shingle'][Math.floor(rng() * 3)]);
                this.tree('oak', x0 - 3, z0 + 2, 1); this.tree('bush', x0 + w + 2, z0 + d - 1, 1); this.tree('bush', x0 + w / 2, z0 - 2, 1);
                n++;
            }
        }
        this.roadsideCount = n;
    },

    // ---------------------------------------------------------------- cabanas na mata
    _cabins() {
        const B = WorldMap.B, rng = this.rng;
        let n = 0;
        for (const c of this.pickCells([B.FOREST], 30, 70, 4000)) {
            if (n >= 22) break;
            const x0 = Math.round(c.x - 3), z0 = Math.round(c.z - 2.5);
            if (!this.free(x0, z0, x0 + 6, z0 + 5, [B.FOREST], 14)) continue;
            this.lot(x0, z0, x0 + 6, z0 + 5, 1, rng() < 0.5 ? 'wood0' : 'wood1', 'shingle');
            this.prop('hay', x0 + 7.5, z0 + 1, 0.55);                                      // lenha empilhada
            n++;
        }
    },

    // ------------------------------------------------------------------ trailer park
    _trailers() {
        const B = WorldMap.B, rng = this.rng;
        for (const c of this.pickCells([B.SCRUB, B.GRASS], 12, 200, 6000)) {
            const x0 = Math.round(c.x - 34), z0 = Math.round(c.z - 22), x1 = x0 + 68, z1 = z0 + 44;
            if (!this.free(x0, z0, x1, z1, [B.SCRUB, B.GRASS], 14)) continue;
            for (let row = 0; row < 2; row++) for (let k = 0; k < 5; k++) {
                if (rng() < 0.12) continue;
                const tx = x0 + 3 + k * 13, tz = z0 + 4 + row * 22;
                this.lot(tx, tz, tx + 9, tz + 3.6, 1, rng() < 0.5 ? 'concrete1' : 'metal0', 'metal1');
                this.prop('dry', tx + 10.5, tz + 1.5, 0.7);
            }
            this.fenceLine(true, z0, x0, x1, x0 + 30); this.fenceLine(true, z1, x0, x1); this.fenceLine(false, x0, z0, z1); this.fenceLine(false, x1 - 0.3, z0, z1);
            this.trailerPark = { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
            break;
        }
    },

    // -------------------------------------------------------------- palafitas no pântano
    _huts() {
        const B = WorldMap.B, rng = this.rng;
        let n = 0;
        for (const c of this.pickCells([B.SWAMP], 40, 55, 5000)) {
            if (n >= 12) break;
            const ld = WorldMap.lakeDist(c.x, c.z);
            if (ld < 8 || ld > 26) continue;
            const x0 = Math.round(c.x - 2.5), z0 = Math.round(c.z - 2.5);
            if (!this.free(x0, z0, x0 + 5, z0 + 5, [B.SWAMP, B.GRASS], 8)) continue;
            this.lot(x0, z0, x0 + 5, z0 + 5, 1, 'wood1', rng() < 0.5 ? 'redmetal' : 'metal0');
            // doca de tábuas rumo à água mais próxima (testa os 4 sentidos)
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                let t = 3; while (t < 40 && WorldMap.isLand(c.x + dx * t, c.z + dz * t)) t += 1;
                if (t >= 40) continue;
                const l = t + 4;
                this.blk.docks.push(dx ? { x0: dx > 0 ? c.x + 2.5 : c.x - l, z0: c.z - 1.1, x1: dx > 0 ? c.x + l : c.x - 2.5, z1: c.z + 1.1 } : { x0: c.x - 1.1, z0: dz > 0 ? c.z + 2.5 : c.z - l, x1: c.x + 1.1, z1: dz > 0 ? c.z + l : c.z - 2.5 });
                break;
            }
            this.prop('reed', c.x + 4, c.z + 3, 1); this.prop('reed', c.x - 4, c.z - 3, 1);
            n++;
        }
    },

    // ------------------------------------------------------------ postos de gasolina
    _gas() {
        const B = WorldMap.B, rng = this.rng;
        let n = 0;
        for (const nd of RoadPlan.nodes) {
            if (n >= 5 || nd.legs < 3 || nd.kinds.has('urban') || nd.kinds.has('favela') || !nd.kinds.has('rural')) continue;
            for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
                const gx = nd.x + sx * (nd.hwNS + 8), gz = nd.z + sz * (nd.hwEW + 8);
                const x0 = sx > 0 ? gx : gx - 30, z0 = sz > 0 ? gz : gz - 22, x1 = x0 + 30, z1 = z0 + 22;
                if (!this.free(x0, z0, x1, z1, [B.GRASS, B.FARM, B.SCRUB, B.FOREST], 3)) continue;
                // loja nos fundos (longe da rua), cobertura com bombas na frente
                const far = { x: sx > 0 ? x1 - 12 : x0, z: sz > 0 ? z1 - 7 : z0 };
                this.lot(far.x, far.z, far.x + 12, far.z + 7, 1, 'concrete1', 'conc1');
                const cx0 = sx > 0 ? x0 + 1 : x1 - 15, cz0 = sz > 0 ? z0 + 1 : z1 - 10;
                this.blk.canopies.push({ x0: cx0, z0: cz0, x1: cx0 + 14, z1: cz0 + 9, h: 4.4, color: [0.85, 0.2, 0.18] });
                for (let k = 0; k < 3; k++) { const px = cx0 + 3 + k * 4, pz = cz0 + 4; this.solid(px - 0.5, pz - 0.5, px + 0.5, pz + 0.5, 1.6); this.blk.towers.push({ kind: 'pump', x: px, z: pz }); }
                this.blk.towers.push({ kind: 'sign', x: sx > 0 ? x0 + 28 : x0 + 2, z: sz > 0 ? z0 + 1 : z1 - 1 });
                const pumps = [0, 1, 2].map((k) => ({ x: cx0 + 3 + k * 4, z: cz0 + 4 })), st = { x: cx0 + 7, z: cz0 + 4.5, pumps, zone: [cx0 - 5, cz0 - 5, cx0 + 19, cz0 + 14], name: 'Posto da Estrada ' + (CityGrid.stations.length + 1) };
                CityGrid.stations.push(st); CityGrid.addPoi({ type: 'gas', name: st.name, x: st.x, z: st.z });
                n++;
                break;
            }
        }
    },

    // ------------------------------------------------------------------------ torres
    _towers() {
        const B = WorldMap.B, rng = this.rng;
        const spots = (kind, count, biomes, minGap, size) => {
            let n = 0;
            for (const c of this.pickCells(biomes, count * 4, minGap, 5000)) {
                if (n >= count) break;
                if (!this.free(c.x - size, c.z - size, c.x + size, c.z + size, biomes, 12)) continue;
                this.blk.towers.push({ kind, x: c.x, z: c.z });
                this.solid(c.x - 1.3, c.z - 1.3, c.x + 1.3, c.z + 1.3, kind === 'turbine' ? 40 : 20);
                n++;
            }
        };
        spots('water', 4, [B.FARM, B.GRASS, B.SCRUB], 240, 5);
        spots('mast', 4, [B.GRASS, B.FOREST, B.SCRUB], 260, 4);
        spots('turbine', 9, [B.GRASS, B.SCRUB, B.FARM], 90, 6);
    },

    // ------------------------------------------------------- alamedas ao longo das estradas
    _alleys() {
        const B = WorldMap.B, rng = this.rng;
        for (const e of RoadPlan.edges) {
            if (e.cls !== 'hwy' && e.cls !== 'dirt' && e.cls !== 'serra') continue;
            const step = e.cls === 'hwy' ? 18 : 13, off = e.w / 2 + 3.2;
            for (let s = 22; s < e.len - 22; s += step) {
                for (const side of [-1, 1]) {
                    if (rng() < 0.3) continue;
                    const q = e.free ? RoadPlan.at(e, s) : null;
                    const x = q ? q.x + q.tz * side * off : (e.v ? e.a.x + side * off : e.a.x + s), z = q ? q.z - q.tx * side * off : (e.v ? e.a.z + s : e.a.z + side * off);
                    const b = WorldMap.biomeAt(x, z);
                    if (b === B.SEA || b === B.CITY || b === B.ROCK || b === B.SWAMP || WorldMap.waterDist(x, z) < 4) continue;
                    if (RoadPlan.onBridge(x, z) || CityGrid.blockedAt(x, z, 1.2)) continue;
                    const zone = typeof Bairros !== 'undefined' ? Bairros.zoneAt(x, z) : null;          // (Alto da Serra: alameda de araucárias e ciprestes)
                    this.tree(zone === 'serra' ? (rng() < 0.65 ? 'araucaria' : 'cypress') : (b === B.FOREST ? 'pine' : (b === B.SCRUB || b === B.SAND ? 'dry' : 'oak')), x, z, 0.9 + rng() * 0.3);
                }
            }
        }
    },
};
