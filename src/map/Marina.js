// ============================================================================
// Marina — o porto de lazer da cidade, na orla leste (canal da ilha): cais de madeira paralelo à margem, 9 píeres ("dedos") que
// avançam para a água formando 8 vagas, e uma sede (clube náutico) na areia. É onde ficam, em sua maioria, os jet skis, lanchas e
// barcos (BoatManager.spawn lê `slips`).
//
//   docks   retângulos de píer { x0, z0, x1, z1, kind: 'walk'|'finger'|'wall' }: MapGeo trata como CHÃO FIRME (dá para andar neles)
//   slips   vagas { x, z, x0, x1, kind, n, ... }: onde o barco fica atracado (proa para fora = leste)
//   Roda DEPOIS do relevo (CityGrid.finish), antes do filtro de vegetação e da malha de andáveis.
// ============================================================================

const Marina = {
    ZC: -437,               // centro da marina (z), no quarteirão de praia da orla leste
    SLIPS: 8, PITCH: 8, LEN: 38,

    // Ocupação das vagas, do sul para o norte: [modelo, quantidade]. A 4ª e a última ficam vazias: são as vagas do JOGADOR
    // (BERTHS — onde ficam os barcos que ele compra na loja náutica ou atraca e guarda: Garage, garagem 'marina').
    LAYOUT: [['barco', 1], ['barco', 1], ['lancha', 1], null, ['lancha', 1], ['jetski', 3], ['jetski', 3], null],
    BERTHS: [3, 7],

    build() {
        const zc = this.ZC, P = this.PITCH, N = this.SLIPS, L = this.LEN;
        let xe = 180; while (WorldMap.isLand(xe, zc) && xe < 260) xe += 1;           // primeira coluna de água
        this.xe = xe;
        const z0 = zc - (N * P) / 2, z1 = z0 + N * P;
        const docks = this.docks = [];
        docks.push({ x0: xe - 3, z0: z0 - 2, x1: xe + 5, z1: z1 + 2, kind: 'walk' });                     // cais principal (junto à margem)
        for (let k = 0; k <= N; k++) {                                                                      // píeres
            const z = z0 + k * P, wall = k === 0 || k === N, w = wall ? 1.3 : 0.8;
            docks.push({ x0: xe + 5, z0: z - w, x1: xe + 5 + L, z1: z + w, kind: wall ? 'wall' : 'finger' });
        }
        // bounding box (consulta rápida)
        this.box = [xe - 3, z0 - 2, xe + 5 + L, z1 + 2];

        // Vagas e quem fica nelas.
        this.slips = [];
        const rng = Pixel.rng(4747), rows = BoatSheet.PAINT_ROWS;
        for (let i = 0; i < N; i++) {
            const cz = z0 + (i + 0.5) * P, occ = this.LAYOUT[i], slip = { i, x0: xe + 5, x1: xe + 5 + L, z: cz, boats: [] };
            if (occ) {
                const [kind, n] = occ, len = BoatSheet.MODELS[kind].len * CarArt.K, gap = (P - 2.4) / n;
                for (let b = 0; b < n; b++) {
                    const z = cz + (n === 1 ? 0 : (b - (n - 1) / 2) * Math.min(1.9, gap));
                    slip.boats.push({ kind, x: xe + 6.5 + len / 2, z, heading: Math.PI / 2, paint: rows[kind][Math.floor(rng() * rows[kind].length)] });
                }
            }
            this.slips.push(slip);
        }
        this._clubhouse(z0, z1);
        this._nautica();
        console.log(`[MARINA] ${docks.length} píeres, ${this.slips.reduce((s, v) => s + v.boats.length, 0)} barcos atracados, margem em x=${xe}`);
    },

    // Sede da marina na areia, ao lado do cais: 2 andares, lanchonete na frente e "MARINA" pintado no telhado.
    _clubhouse(z0, z1) {
        const blk = CityGrid.blocks.find((b) => b.open && b.slab[0] < 140 && b.slab[2] > 155 && b.slab[1] < this.ZC && b.slab[3] > this.ZC);
        if (!blk) { this.lot = null; return; }
        const zm = (z0 + z1) / 2, x1 = blk.slab[2] - 4, lot = { x0: x1 - 22, z0: zm - 11, x1, z1: zm + 11, floors: 2, height: 2 * Config.city.floorH, facade: 'concrete1', roof: 'tile0', marina: true };
        lot.shops = [{ side: 'E', a: lot.z0 + 2, kind: 0 }, { side: 'E', a: lot.z0 + 8.5, kind: 6 }];
        blk.lots.push(lot);
        CityGrid.addObstacles([{ x0: lot.x0, z0: lot.z0, x1: lot.x1, z1: lot.z1, h: lot.height }]);
        blk.props = blk.props.filter((p) => !(p.x > lot.x0 - 3 && p.x < lot.x1 + 5 && p.z > lot.z0 - 3 && p.z < lot.z1 + 3));     // sem árvore no terreno da sede
        this.lot = lot;
        CityGrid.addPoi({ type: 'marina', name: 'Marina Dirty Bay', x: this.xe + 20, z: this.ZC });
        this.block = blk;
    },

    // LOJA NÁUTICA ao sul da sede, na mesma areia: térreo com "NAUTICA" no telhado e a porta de frente para o cais (Dealers: vende
    // jet ski, lancha e barco — o comprado fica na sua vaga da marina). door = onde o jogador aperta E.
    _nautica() {
        const blk = this.block, c = this.lot;
        this.nautica = null;
        if (!blk || !c) return;
        const x1 = c.x1, z1 = c.z0 - 5, lot = { x0: x1 - 16, z0: z1 - 14, x1, z1, floors: 1, height: Config.city.floorH, facade: 'concrete1', roof: 'tile0', marina: true, nautica: true };
        if (lot.z0 < blk.slab[1] + 2) return;
        blk.lots.push(lot);
        CityGrid.addObstacles([{ x0: lot.x0, z0: lot.z0, x1: lot.x1, z1: lot.z1, h: lot.height }]);
        blk.props = blk.props.filter((p) => !(p.x > lot.x0 - 3 && p.x < lot.x1 + 5 && p.z > lot.z0 - 3 && p.z < lot.z1 + 3));
        this.nautica = { lot, door: { x: lot.x1 + 1.4, z: (lot.z0 + lot.z1) / 2, face: -Math.PI / 2 } };
        CityGrid.addPoi({ type: 'boatshop', name: 'Náutica Dirty Bay — jet skis, lanchas e barcos', x: this.nautica.door.x, z: this.nautica.door.z });
    },
};
