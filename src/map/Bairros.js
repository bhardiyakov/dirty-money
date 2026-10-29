// ============================================================================
// Bairros — os BAIRROS do interior, montados à mão (o resto do campo é o RuralPlan, espalhado):
//   • VILA DA ROÇA (a oeste, entre a Serra do Meio e a Rodovia dos Lagos, em volta do lago): gente simples, vida devagar. Uma vilinha
//     na Estrada da Roça (largo de terra com capela, venda, boteco, bancos e um ipê), campinho de várzea, e SÍTIOS pelo campo: casinha
//     caiada com varanda, galinheiro, chiqueiro, curral/pasto cercado com vaca, cavalo ou cabra, horta, pomar, poço e bananeiras;
//     milharais com espantalho. Os bichos (world/Livestock.js) vivem nos `pens` (cercados) e nos terreiros.
//   • ALTO DA SERRA (o planalto a noroeste, entre a Serra do Norte e a do Oeste, de frente para o mar — um Campos do Jordão): rico e
//     calmo. Estradas de asfalto estreitas e sinuosas (classe 'serra'), a VILA (largo de pedra com chalés enxaimel: fondue, chocolate,
//     boutique, café, bar), MANSÕES muradas (casarão de pedra ou chalé grande, piscina, deck, jardim de hortênsias, portão com
//     luminária) ao longo das estradas, chalés soltos na mata, araucárias por toda parte.
// O Morro do Mirante (a favela do C.P.C) fica no FavelaPlan (FavelaSul); aqui só entra no `zoneAt`/rótulos.
// Peças soltas (`pieces` dos quarteirões: piscina, varanda, horta, poço, cruz, traves, postes...) são desenhadas no WorldBuilder._pieces.
// Roda dentro do RuralPlan.build (depois do relevo), antes das fazendas/cabanas genéricas (que ficam fora dos bairros). Determinístico.
// ============================================================================

const Bairros = {
    // Contornos (laços [x, z]) e onde vai o nome no mapa.
    ZONES: [
        { id: 'roca', name: 'Vila da Roça', label: 'VILA DA ROÇA', lx: -1030, lz: -110,
            poly: [[-1198, 48], [-1120, 58], [-1040, 44], [-950, 62], [-885, 118], [-800, 142], [-800, -252], [-900, -264], [-1040, -264], [-1198, -244]] },
        { id: 'serra', name: 'Alto da Serra', label: 'ALTO DA SERRA', lx: -1320, lz: 760,
            poly: [[-1458, 908], [-1300, 916], [-1200, 914], [-1100, 950], [-950, 966], [-876, 952], [-876, 902], [-1186, 892], [-1190, 780], [-1202, 618], [-1300, 596], [-1446, 588]] },
    ],
    reserved: [],                 // áreas já ocupadas por um sítio/mansão/vila/roça (nada mais entra nelas)
    pens: [],                     // cercados com bicho: { x0, z0, x1, z1, sp: 'vaca'|'cavalo'|'porco'|'galinha'|'cabra', n }
    villages: [],                 // { id, zone, name, x, z } (largos das vilas)

    _inPoly(P, x, z) {
        let c = false;
        for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > z) !== (P[j][1] > z) && x < P[j][0] + (P[i][0] - P[j][0]) * (z - P[j][1]) / (P[i][1] - P[j][1])) c = !c;
        return c;
    },
    // 'roca' | 'serra' | null
    zoneAt(x, z) {
        if (x > -790 || x < -1460 || z < -270 || z > 970 || (z > 150 && z < 585)) return null;      // (fora das duas caixas: rápido)
        for (const Z of this.ZONES) if (this._inPoly(Z.poly, x, z)) return Z.id;
        return null;
    },
    zone(id) { return this.ZONES.find((z) => z.id === id) || null; },

    // ================================================================= construção
    build(R) {
        const t0 = performance.now();
        this.R = R; this.rng = Pixel.rng(70707); this.pens = []; this.villages = []; this.reserved = [];
        R.blk.pieces = R.blk.pieces || [];
        R.inZone = true;
        this._roca();
        this._serra();
        R.inZone = false;
        console.log(`[BAIRROS] Vila da Roça + Alto da Serra: ${this.stats.sitios} sítios, ${this.stats.mansoes} mansões, ${this.stats.chales} chalés, ${this.pens.length} cercados em ${(performance.now() - t0).toFixed(0)} ms`);
    },

    // ---------------------------------------------------------------- utilidades
    get B() { return WorldMap.B; },
    _pick(a) { return a[Math.floor(this.rng() * a.length)]; },
    // Lote com colisão (no quarteirão `blk`, padrão: o virtual do campo) — entra na grade de sólidos na hora (as próximas checagens o veem).
    _lot(x0, z0, x1, z1, floors, facade, roof, blk = this.R.blk) {
        CityGrid._addLot(blk, x0, z0, x1, z1, floors, facade, roof);
        const l = blk.lots[blk.lots.length - 1];
        CityGrid._gridInsert(l.obs);
        return l;
    },
    _piece(p, blk = this.R.blk) { (blk.pieces || (blk.pieces = [])).push(p); return p; },
    _solid(x0, z0, x1, z1, h) { CityGrid.addObstacles([{ x0, z0, x1, z1, h }]); },
    // Muro/cerca pulável (como RuralPlan.fenceLine), com cor e altura próprias.
    _wall(alongX, fixed, a0, a1, gap, opts = {}) {
        const parts = [], gw = opts.gw || 5;
        if (gap === null || gap === undefined || gap < a0 + 2 || gap > a1 - gw - 2) parts.push([a0, a1]); else parts.push([a0, gap], [gap + gw, a1]);
        for (const [s, e] of parts) {
            const th = opts.th || 0.3, f = alongX ? { x0: s, z0: fixed, x1: e, z1: fixed + th } : { x0: fixed, z0: s, x1: fixed + th, z1: e };
            Object.assign(f, { h: opts.h || 1.4, vault: true, kind: opts.kind || 'fence', color: opts.color, cap: opts.cap });
            this.R.blk.fences.push(f); CityGrid.obstacles.push(f); CityGrid.vaultables.push(f); CityGrid._gridInsert(f);
        }
    },
    _box(x0, z0, x1, z1, gap, gapSide, opts) {          // cercado retangular com um portão (gapSide: 'S'|'N'|'W'|'E')
        const g = (s, a0, a1) => (gapSide === s ? (gap !== undefined ? gap : (a0 + a1) / 2 - 2.5) : null);
        this._wall(true, z0, x0, x1, g('S', x0, x1), opts); this._wall(true, z1 - (opts && opts.th || 0.3), x0, x1, g('N', x0, x1), opts);
        this._wall(false, x0, z0, z1, g('W', z0, z1), opts); this._wall(false, x1 - (opts && opts.th || 0.3), z0, z1, g('E', z0, z1), opts);
    },
    _free(x0, z0, x1, z1, ok, roadMargin = 5) {
        if (this.reserved.some((r) => x1 > r[0] && x0 < r[2] && z1 > r[1] && z0 < r[3])) return false;
        if (!this.R.free(x0, z0, x1, z1, ok, roadMargin)) return false;
        this.reserved.push([x0, z0, x1, z1]);                              // (livre: já fica reservado para quem perguntou)
        return true;
    },
    _isReserved(x, z, m = 0) { return this.reserved.some((r) => x > r[0] - m && x < r[2] + m && z > r[1] - m && z < r[3] + m); },
    // Pontos sorteados dentro do bairro `zid` com um dos biomas, afastados entre si.
    _cells(zid, biomes, n, minGap, trials = 6000) {
        const Z = this.zone(zid), out = [];
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (const p of Z.poly) { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]); }
        for (let t = 0; t < trials && out.length < n; t++) {
            const x = x0 + this.rng() * (x1 - x0), z = z0 + this.rng() * (z1 - z0);
            if (!this._inPoly(Z.poly, x, z) || !biomes.includes(WorldMap.biomeAt(x, z))) continue;
            if (out.some((o) => hypot(o.x - x, o.z - z) < minGap)) continue;
            out.push({ x, z });
        }
        return out;
    },
    // Varre o bairro numa grade de `step` u (ordem sorteada) e chama try(x, z) em cada ponto até `max` sucessos.
    _scan(zid, step, max, tryAt) {
        const Z = this.zone(zid), pts = [];
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (const p of Z.poly) { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]); }
        for (let z = z0; z <= z1; z += step) for (let x = x0; x <= x1; x += step) if (this._inPoly(Z.poly, x, z)) pts.push([x, z, this.rng()]);
        pts.sort((a, b) => a[2] - b[2]);
        let n = 0;
        for (const [x, z] of pts) { if (n >= max) break; if (tryAt(x, z)) n++; }
        return n;
    },
    // Quarteirão "de verdade" (CityGrid.blocks: chão desenhado, andável, lojas com interior, gente) para o largo de uma vila.
    _villageBlock(id, zone, x0, z0, x1, z1, ground, biome) {
        const b = { id: 'bairro:' + id, district: zone, i: 9100 + this.villages.length, j: 9100, biome, open: true, ground, slab: [x0, z0, x1, z1], foot: [x0, z0, x1, z1], sw: 0, r: 0, lots: [], props: [], fences: [], pieces: [] };
        CityGrid.blocks.push(b);
        return b;
    },
    // Loja de frente para `side` no lote (vitrine de 6 u centrada na parede) e o vão da porta.
    _shop(lot, side, kind) {
        const len = (side === 'S' || side === 'N') ? lot.x1 - lot.x0 : lot.z1 - lot.z0, a0 = (side === 'S' || side === 'N') ? lot.x0 : lot.z0;
        lot.shops = lot.shops || [];
        lot.shops.push({ side, a: a0 + (len - 6) / 2, kind });
        CityGrid._carveDoors(lot);
    },
    // Ponto e direção da via chamada `name` mais perto de (x, z).
    _roadPoint(name, x, z) {
        let best = null, bd = Infinity;
        for (const e of RoadPlan.edges) {
            if (e.name !== name) continue;
            for (let s = 0; s <= e.len; s += 4) { const p = RoadPlan.at(e, s), d = hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = { x: p.x, z: p.z, tx: p.tx, tz: p.tz, e, s }; } }
        }
        return best;
    },

    // ================================================================= VILA DA ROÇA
    _roca() {
        const B = this.B, rng = this.rng, ok = [B.GRASS, B.FARM, B.SCRUB, B.FOREST];
        this.stats = { sitios: 0, mansoes: 0, chales: 0 };
        // ---- a vila: largo de terra ao lado da Estrada da Roça, de frente para ela
        const W = 54, D = 40;
        vila: for (let k = 0; k < 24; k++) {                                            // ao longo da Estrada da Roça, perto do meio dela
            const q = this._roadPoint('Estrada da Roça', -1050 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 8, -6);
            if (!q) break;
            for (const side of [1, -1]) for (const gap of [6, 10, 14]) {                // norte da estrada (senão, sul), colado nela
                const cx = Math.round(q.x), z0 = side > 0 ? Math.round(q.z + gap) : Math.round(q.z - gap - D), x0 = cx - W / 2;
                if (!this._free(x0, z0, x0 + W, z0 + D, ok, 2.5)) continue;
                this._rocaVillage(x0, z0, x0 + W, z0 + D, side);
                break vila;
            }
        }
        // ---- sítios pelo campo
        const sitios = [];
        this._scan('roca', 9, 18, (x, z) => {
            if (sitios.some((s) => hypot(s[0] - x, s[1] - z) < 56)) return false;
            const x0 = Math.round(x - 20), z0 = Math.round(z - 16);
            if (!this._free(x0, z0, x0 + 40, z0 + 32, ok, 5)) return false;
            this._sitio(x0, z0, x0 + 40, z0 + 32);
            sitios.push([x, z]);
            return true;
        });
        this.stats.sitios = sitios.length;
        // ---- milharais e roças de mandioca com espantalho
        this._scan('roca', 11, 9, (x, z) => {
            const w = 28 + Math.floor(rng() * 14), d = 18 + Math.floor(rng() * 10), x0 = Math.round(x - w / 2), z0 = Math.round(z - d / 2);
            if (WorldMap.biomeAt(x, z) !== B.FARM || !this._free(x0, z0, x0 + w, z0 + d, [B.FARM, B.GRASS], 5)) return false;
            const kind = rng() < 0.6 ? 'corn' : 'veg';
            this._piece({ kind: 'crops', crop: kind, x0, z0, x1: x0 + w, z1: z0 + d, rows: rng() < 0.5 ? 'x' : 'z' });
            this._piece({ kind: 'scarecrow', x: x0 + w / 2 + (rng() - 0.5) * w * 0.4, z: z0 + d / 2 + (rng() - 0.5) * d * 0.4 });
            this._box(x0 - 1, z0 - 1, x0 + w + 1, z0 + d + 1, undefined, 'S', { h: 1.1, kind: 'wood' });
            return true;
        });
        // ---- pastos grandes (gado de corte e cavalos)
        this._scan('roca', 12, 4, (x, z) => {
            const x0 = Math.round(x - 30), z0 = Math.round(z - 22);
            if (!this._free(x0, z0, x0 + 60, z0 + 44, [B.GRASS, B.FARM, B.SCRUB, B.FOREST], 6)) return false;
            this._box(x0, z0, x0 + 60, z0 + 44, x0 + 26, 'S', { h: 1.4, kind: 'wood' });
            this._piece({ kind: 'trough', x: x0 + 8, z: z0 + 6 });
            for (let k = 0; k < 3; k++) this.R.tree('oak', x0 + 10 + rng() * 40, z0 + 10 + rng() * 26, 1.1);
            this.pens.push({ x0: x0 + 1, z0: z0 + 1, x1: x0 + 59, z1: z0 + 43, sp: rng() < 0.75 ? 'vaca' : 'cavalo', n: 6 + Math.floor(rng() * 4), big: true });
            return true;
        });
    },

    _rocaVillage(x0, z0, x1, z1, side) {
        const rng = this.rng, blk = this._villageBlock('roca', 'roca', x0, z0, x1, z1, 'earth', 'plaza'), W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2;
        const back = side > 0 ? z1 : z0, front = side > 0 ? z0 : z1, sgn = side;                    // fundo do largo (longe da estrada)
        // capela no fundo, de frente para a estrada, com a torre do sino ao lado e a cruz no alto
        const cz0 = side > 0 ? back - 13 : back + 1, cz1 = cz0 + 12;
        const chapel = this._lot(cx - 4, cz0, cx + 4, cz1, 2, 'caipira0', 'clay0', blk);
        chapel.chapel = true;
        this._lot(cx + 4, side > 0 ? cz0 : cz1 - 3, cx + 7, side > 0 ? cz0 + 3 : cz1, 4, 'caipira0', 'clay0', blk);
        this._piece({ kind: 'cross', x: cx, z: side > 0 ? cz0 - 0.05 : cz1 + 0.05, y: 6.2, face: side > 0 ? 'S' : 'N' }, blk);
        // venda (armazém) à esquerda e boteco à direita, virados para o meio do largo
        const mz = (z0 + z1) / 2;
        const venda = this._lot(x0 + 1, mz - 6, x0 + 9, mz + 6, 1, 'caipira1', 'clay0', blk); this._shop(venda, 'E', 1);
        const bar = this._lot(x1 - 9, mz - 5, x1 - 1, mz + 5, 1, 'taipa0', 'clay0', blk); this._shop(bar, 'W', 5);
        this._piece({ kind: 'porch', x0: x1 - 11, z0: mz - 5, x1: x1 - 9, z1: mz + 5, h: 2.4, color: '#8a5a3a' }, blk);      // varanda do boteco
        // largo: ipê no meio, bancos, postes de luz, mesas do boteco
        blk.props.push({ type: 'tree', kind: 'ipe', x: cx, z: mz, s: 1.3, seed: 41 });
        for (const [dx, dz] of [[-6, 0], [6, 0], [0, -5 * sgn]]) this._piece({ kind: 'bench', x: cx + dx, z: mz + dz, alongX: dx === 0 }, blk);
        for (const [dx, dz] of [[-W / 2 + 3, front - mz + 2 * sgn], [W / 2 - 3, front - mz + 2 * sgn], [-W / 2 + 3, (back - mz) * 0.6], [W / 2 - 3, (back - mz) * 0.6]]) this._piece({ kind: 'lamp', x: cx + dx, z: mz + dz, style: 'wood' }, blk);
        for (let k = 0; k < 3; k++) this._piece({ kind: 'table', x: x1 - 14, z: mz - 4 + k * 4 }, blk);
        this.villages.push({ id: 'roca', zone: 'roca', name: 'Largo da Capela', x: cx, z: mz });
        CityGrid.addPoi({ type: 'village', name: 'Vila da Roça', x: cx, z: mz });
        // casinhas da vila em volta do largo (fora dele), campinho de várzea atrás
        const B = this.B, ok = [B.GRASS, B.FARM, B.SCRUB];
        let n = 0;
        for (const [hx, hz] of [[x0 - 14, mz - 10], [x0 - 14, mz + 4], [x1 + 4, mz - 10], [x1 + 4, mz + 4], [x0 - 14, back - 8], [x1 + 4, back - 8], [cx - 22, back + 4 * sgn], [cx + 12, back + 4 * sgn]]) {
            const w = 8 + Math.floor(rng() * 3), d = 6 + Math.floor(rng() * 2), hz0 = hz < z0 ? hz - d / 2 : hz;
            if (!this._free(hx, hz0, hx + w, hz0 + d, ok, 4)) continue;
            this._lot(hx, hz0, hx + w, hz0 + d, 1, this._pick(['caipira0', 'caipira1', 'taipa0', 'caipira0']), this._pick(['clay0', 'tile0', 'clay0']));
            this.R.tree(rng() < 0.5 ? 'banana' : 'bush', hx - 2, hz0 + d / 2, 0.9);
            this.pens.push({ x0: hx - 5, z0: hz0 - 5, x1: hx + w + 5, z1: hz0 + d + 5, sp: 'galinha', n: 3 + Math.floor(rng() * 3) });
            n++;
        }
        for (const fz of [side > 0 ? back + 6 : back - 6 - 22]) {
            const fx0 = cx - 18;
            if (!this._free(fx0, fz, fx0 + 36, fz + 22, ok, 4)) continue;
            this._piece({ kind: 'field', x0: fx0, z0: fz, x1: fx0 + 36, z1: fz + 22 });
        }
    },

    // Um sítio (40×32): casa no norte de frente para o sul, varanda, galinheiro, chiqueiro, pasto cercado, horta, pomar e poço.
    _sitio(x0, z0, x1, z1) {
        const rng = this.rng, flip = rng() < 0.5;                                      // espelha (casa à esquerda ou à direita)
        const X = (a, b) => (flip ? [x1 - b, x1 - a] : [x0 + a, x0 + b]);
        // casa
        const [hx0, hx1] = X(4, 14), hz0 = z1 - 11, hz1 = z1 - 4;
        this._lot(hx0, hz0, hx1, hz1, 1, this._pick(['caipira0', 'caipira1', 'taipa0', 'caipira0', 'caipira1']), this._pick(['clay0', 'clay0', 'tile0', 'tile1']));
        this._piece({ kind: 'porch', x0: hx0, z0: hz0 - 2.2, x1: hx1, z1: hz0, h: 2.5, color: this._pick(['#8a5a3a', '#7a4a2e', '#a0583c']) });
        this._piece({ kind: 'bench', x: (hx0 + hx1) / 2, z: hz0 - 1.1, alongX: true });
        // galinheiro (casinha de tábua) e as galinhas soltas no terreiro
        const [gx0, gx1] = X(17, 20.5);
        this._lot(gx0, z1 - 9, gx1, z1 - 6, 1, 'wood0', 'zinc0');
        this.pens.push({ x0: Math.min(hx0, gx0) - 3, z0: hz0 - 9, x1: Math.max(hx1, gx1) + 3, z1: z1 - 2, sp: 'galinha', n: 4 + Math.floor(rng() * 4) });
        // chiqueiro
        const [px0, px1] = X(26, 34);
        this._box(px0, z1 - 11, px1, z1 - 4, undefined, 'S', { h: 1.0, kind: 'wood' });
        this._piece({ kind: 'trough', x: (px0 + px1) / 2, z: z1 - 5.2 });
        this.pens.push({ x0: px0 + 0.6, z0: z1 - 10.4, x1: px1 - 0.6, z1: z1 - 4.6, sp: 'porco', n: 2 + Math.floor(rng() * 2) });
        // pasto/curral cercado na metade de baixo, portão no meio
        const pz1 = z0 + 15;
        this._box(x0 + 1, z0 + 1, x1 - 1, pz1, x0 + 17, 'N', { h: 1.4, kind: 'wood' });
        this._piece({ kind: 'trough', x: flip ? x0 + 6 : x1 - 6, z: z0 + 4 });
        const sp = this._pick(['vaca', 'vaca', 'cavalo', 'cabra', 'vaca', 'cavalo']);
        this.pens.push({ x0: x0 + 1.6, z0: z0 + 1.6, x1: x1 - 1.6, z1: pz1 - 0.6, sp, n: sp === 'cabra' ? 4 + Math.floor(rng() * 3) : 2 + Math.floor(rng() * 3) });
        // horta, poço, pomar, bananeiras e varal
        const [vx0, vx1] = X(23, 36);
        this._piece({ kind: 'crops', crop: 'veg', x0: vx0, z0: z0 + 17, x1: vx1, z1: z0 + 22.5, rows: 'x' });
        const [wx] = X(17, 18);
        this._piece({ kind: 'well', x: wx, z: z0 + 19 });
        this._solid(wx - 0.8, z0 + 18.2, wx + 0.8, z0 + 19.8, 1.0);
        for (let k = 0; k < 4; k++) this.R.prop('orchard', (flip ? x1 - 3 - k * 4.5 : x0 + 3 + k * 4.5), z0 + 19.5 + (k % 2) * 3, 0.85);
        for (let k = 0; k < 3; k++) this.R.tree('banana', flip ? x0 + 2 + k * 2.5 : x1 - 2 - k * 2.5, z1 - 2 - (k % 2) * 2, 0.8 + rng() * 0.2);
        this.R.tree(rng() < 0.5 ? 'oak' : 'ipe', flip ? hx1 + 3 : hx0 - 3, z1 - 3, 1.2);
        this.R.prop('hay', (hx0 + hx1) / 2 + (flip ? -8 : 8), hz0 - 4, 0.6);                    // lenha
    },

    // ================================================================= ALTO DA SERRA
    _serra() {
        const B = this.B, rng = this.rng, ok = [B.GRASS, B.FOREST, B.SCRUB, B.FARM];
        // ---- a vila (largo de pedra com chalés e lojas) perto da entrada, na Estrada do Alto da Serra
        const q = this._roadPoint('Estrada do Alto da Serra', -1258, 858);
        if (q) {
            const W = 60, D = 40;
            outer: for (const [ox, oz] of [[0, -10 - D], [0, 10], [-30, -10 - D], [30, -10 - D], [-30, 10], [30, 10]]) {
                const x0 = Math.round(q.x - W / 2 + ox), z0 = Math.round(q.z + oz);
                if (!this._free(x0, z0, x0 + W, z0 + D, ok, 3)) continue;
                this._serraVillage(x0, z0, x0 + W, z0 + D, oz > 0 ? 'S' : 'N');
                break outer;
            }
        }
        // ---- mansões ao longo das estradas da serra, alternando os lados
        for (const e of RoadPlan.edges) {
            if (e.cls !== 'serra') continue;
            let sd = rng() < 0.5 ? 1 : -1;
            for (let s = 18; s < e.len - 18; s += 8) {
                const p = RoadPlan.at(e, s);
                let done = false;
                for (const side of [sd, -sd]) {
                    const nx = -p.tz * side, nz = p.tx * side, ax = Math.abs(nx) > Math.abs(nz);
                    for (const extra of [0, 4, 9]) {
                        const W = 30 + Math.floor(rng() * 8), D = 28 + Math.floor(rng() * 6), off = e.w / 2 + 3 + extra;
                        // o terreno encosta na estrada pelo lado (nx, nz): caixa alinhada aos eixos que começa a `off` da pista
                        const cx = p.x + nx * (off + (ax ? W / 2 : D / 2)), cz = p.z + nz * (off + (ax ? W / 2 : D / 2));
                        const x0 = Math.round(cx - W / 2), z0 = Math.round(cz - D / 2);
                        if (!this._free(x0, z0, x0 + W, z0 + D, ok, 2.5)) continue;
                        const face = ax ? (nx > 0 ? 'W' : 'E') : (nz > 0 ? 'S' : 'N');      // portão do lado da estrada
                        this._mansao(x0, z0, x0 + W, z0 + D, face);
                        this.stats.mansoes++;
                        done = true; break;
                    }
                    if (done) break;
                }
                if (done) { s += 34 + rng() * 20; sd = -sd; }
            }
        }
        // ---- chalés soltos na mata e no campo
        for (const c of this._cells('serra', [B.FOREST, B.GRASS, B.SCRUB], 40, 46)) {
            if (this.stats.chales >= 18) break;
            const w = 9 + Math.floor(rng() * 3), d = 8 + Math.floor(rng() * 2), x0 = Math.round(c.x - w / 2), z0 = Math.round(c.z - d / 2);
            if (!this._free(x0 - 4, z0 - 4, x0 + w + 4, z0 + d + 4, ok, 7)) continue;
            this._lot(x0, z0, x0 + w, z0 + d, 2, this._pick(['chalet0', 'chalet1']), this._pick(['slate0', 'cedar0', 'cedar0']));
            this._piece({ kind: 'deck', x0: x0 - 0.5, z0: z0 - 3, x1: x0 + w + 0.5, z1: z0, color: '#7a5236' });
            this._piece({ kind: 'lamp', x: x0 - 1.5, z: z0 - 3.5, style: 'iron' });
            for (let k = 0; k < 3; k++) this.R.tree(rng() < 0.7 ? 'araucaria' : 'pine', x0 - 4 + rng() * (w + 8), z0 + d + 3 + rng() * 4, 1 + rng() * 0.3);
            this.R.tree('flowers', x0 + w + 2, z0 - 1, 0.8);
            this.stats.chales++;
        }
        // ---- araucárias e hortênsias espalhadas pelo planalto (a cara da serra)
        let n = 0;
        for (const c of this._cells('serra', [B.GRASS, B.FOREST, B.SCRUB], 260, 9, 9000)) {
            if (RoadPlan.onPavement(c.x, c.z, 3) || CityGrid.blockedAt(c.x, c.z, 2.5) || this._isReserved(c.x, c.z, 2)) continue;
            this.R.tree(rng() < 0.8 ? 'araucaria' : 'cypress', c.x, c.z, 0.95 + rng() * 0.45);
            if (rng() < 0.25) this.R.tree('flowers', c.x + 2.5, c.z - 1.5, 0.75);
            n++;
        }
    },

    _serraVillage(x0, z0, x1, z1, roadSide) {
        const rng = this.rng, blk = this._villageBlock('serra', 'serra', x0, z0, x1, z1, 'plaza', 'plaza'), W = x1 - x0, cx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        // chalés-loja nos três lados longe da estrada, vitrines para o largo: fondue (ristorante), chocolate (padaria), boutique, café, bar
        const kinds = [12, 6, 3, 0, 5, 13], back = roadSide === 'S' ? 'N' : 'S';
        const bz0 = back === 'N' ? z1 - 11 : z0 + 1, bz1 = bz0 + 10;
        let k = 0;
        for (let x = x0 + 2; x + 12 <= x1 - 2 && k < 4; x += 14) { const l = this._lot(x, bz0, x + 12, bz1, 2, this._pick(['chalet0', 'chalet1']), this._pick(['slate0', 'cedar0']), blk); this._shop(l, roadSide, kinds[k++]); }
        const sz0 = z0 + 12, sz1 = z1 - 12;
        if (sz1 - sz0 >= 12) {
            const l1 = this._lot(x0 + 1, sz0, x0 + 11, sz1, 2, 'chalet1', 'slate0', blk); this._shop(l1, 'E', kinds[k++ % kinds.length]);
            const l2 = this._lot(x1 - 11, sz0, x1 - 1, sz1, 2, 'chalet0', 'cedar0', blk); this._shop(l2, 'W', kinds[k++ % kinds.length]);
        }
        // chafariz no meio, canteiros de hortênsia, bancos e postes de ferro
        this._piece({ kind: 'fountain', x: cx, z: mz }, blk);
        this._solid(cx - 2.2, mz - 2.2, cx + 2.2, mz + 2.2, 0.9);
        for (const [dx, dz] of [[-9, -6], [9, -6], [-9, 6], [9, 6]]) { blk.props.push({ type: 'tree', kind: 'flowers', x: cx + dx, z: mz + dz, s: 0.9, seed: Math.floor(rng() * 1000) }); this._piece({ kind: 'bench', x: cx + dx * 0.6, z: mz + dz, alongX: true }, blk); }
        for (const [dx, dz] of [[-W / 2 + 2, -6], [W / 2 - 2, -6], [-W / 2 + 2, 6], [W / 2 - 2, 6], [-14, 0], [14, 0]]) this._piece({ kind: 'lamp', x: cx + dx, z: mz + dz, style: 'iron' }, blk);
        for (const dx of [-20, 20]) blk.props.push({ type: 'tree', kind: 'araucaria', x: cx + dx, z: roadSide === 'S' ? z0 + 3 : z1 - 3, s: 1.2, seed: Math.floor(rng() * 1000) });
        this.villages.push({ id: 'serra', zone: 'serra', name: 'Vila do Alto', x: cx, z: mz });
        CityGrid.addPoi({ type: 'village', name: 'Vila do Alto da Serra', x: cx, z: mz });
    },

    // Mansão murada: casa grande (pedra ou chalé) no fundo, piscina e deck no meio, jardim, portão do lado da estrada (`face`).
    _mansao(x0, z0, x1, z1, face) {
        const rng = this.rng, W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        const stone = rng() < 0.55, facade = stone ? this._pick(['stone0', 'stone1']) : this._pick(['chalet0', 'chalet1']), roof = stone ? this._pick(['slate0', 'tile1']) : this._pick(['slate0', 'cedar0']);
        // casa: do lado oposto ao portão
        const hw = 15 + Math.floor(rng() * 4), hd = 11 + Math.floor(rng() * 3), floors = 2 + (rng() < 0.35 ? 1 : 0);
        let h;
        if (face === 'S') h = [cx - hw / 2, z1 - 3 - hd, cx + hw / 2, z1 - 3];
        else if (face === 'N') h = [cx - hw / 2, z0 + 3, cx + hw / 2, z0 + 3 + hd];
        else if (face === 'W') h = [x1 - 3 - hd, cz - hw / 2, x1 - 3, cz + hw / 2];
        else h = [x0 + 3, cz - hw / 2, x0 + 3 + hd, cz + hw / 2];
        h = h.map(Math.round);
        this._lot(h[0], h[1], h[2], h[3], floors, facade, roof);
        // piscina com borda de pedra e deck de madeira, entre a casa e o portão
        const alongX = face === 'S' || face === 'N', pw = alongX ? 10 : 5, pd = alongX ? 5 : 10;
        const px = face === 'W' ? h[0] - 4 - pw : face === 'E' ? h[2] + 4 : cx - pw / 2, pz = face === 'S' ? h[1] - 4 - pd : face === 'N' ? h[3] + 4 : cz - pd / 2;
        this._piece({ kind: 'deck', x0: px - 2, z0: pz - 2, x1: px + pw + 2, z1: pz + pd + 2, color: '#9a6a44' });
        this._piece({ kind: 'pool', x0: px, z0: pz, x1: px + pw, z1: pz + pd });
        for (let k = 0; k < 2; k++) this._piece({ kind: 'lounger', x: px + (alongX ? 2 + k * 3 : -1.2), z: pz + (alongX ? -1.2 : 2 + k * 3), alongX: !alongX });
        // muro de pedra em volta, portão de 6 u com pilares e luminárias
        const gate = alongX ? Math.round(cx - 3) : Math.round(cz - 3), wopt = { h: 1.6, th: 0.45, kind: 'wall', color: [0.62, 0.6, 0.56], cap: [0.84, 0.82, 0.78], gw: 6 };
        this._box(x0, z0, x1, z1, gate, face, wopt);
        const g = face === 'S' ? [[gate - 0.4, z0], [gate + 6.4, z0]] : face === 'N' ? [[gate - 0.4, z1], [gate + 6.4, z1]] : face === 'W' ? [[x0, gate - 0.4], [x0, gate + 6.4]] : [[x1, gate - 0.4], [x1, gate + 6.4]];
        for (const [gx, gz] of g) this._piece({ kind: 'pillar', x: gx, z: gz });
        // jardim: hortênsias na beira do muro, araucárias e ciprestes, gramado
        for (let k = 0; k < 6; k++) {
            const t = rng(), side = Math.floor(rng() * 4), m = 2;
            const x = side < 2 ? x0 + m + t * (W - 2 * m) : (side === 2 ? x0 + m : x1 - m), z = side >= 2 ? z0 + m + t * (D - 2 * m) : (side === 0 ? z0 + m : z1 - m);
            if (x > h[0] - 2 && x < h[2] + 2 && z > h[1] - 2 && z < h[3] + 2) continue;
            this.R.tree(rng() < 0.6 ? 'flowers' : 'cypress', x, z, 0.8 + rng() * 0.3);
        }
        for (const [dx, dz] of [[-W / 2 - 3, -D / 2 - 3], [W / 2 + 3, D / 2 + 3], [W / 2 + 3, -D / 2 - 3]]) if (rng() < 0.7) this.R.tree('araucaria', cx + dx, cz + dz, 1.1 + rng() * 0.3);
    },
};
