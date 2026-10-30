// ============================================================================
// WorldMap — o MUNDO GRANDE como campos em grade (células de Config.world.cell u):
//   altura (relevo VISUAL: a física e os sprites continuam planos) | bioma | terra/água | distância da margem.
// Geografia (inspirada no mapa de referência; +Z = norte):
//   • CENTRO: a cidade em grade (CityGrid) no meio.
//   • CONTINENTE a oeste/norte/sul: fazendas e campos, florestas, pântano com lagos, serras com paredões e o morro da favela.
//   • ILHA PRAIANA a leste, do outro lado de um canal (3 pontes entram na Fase 2).
// Tudo determinístico (Config.world.seed). O TerrainBuilder desenha isto em pedaços; MapGeo/MapRenderer consultam.
// ============================================================================

const WorldMap = {
    // Biomas (ids do campo `biome`).
    B: { SEA: 0, SAND: 1, GRASS: 2, FOREST: 3, FARM: 4, SWAMP: 5, ROCK: 6, FAVELA: 7, SCRUB: 8, CITY: 9, RESORT: 10 },

    // Regiões nomeadas (rótulos do mapa). Coordenadas de mundo.
    regions: [],

    // ---------------------------------------------------------------- ruído
    _n(x, z, seed) {                       // ruído de valor suave 0..1
        const ix = Math.floor(x), iz = Math.floor(z), tx = x - ix, tz = z - iz;
        const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
        const a = Pixel.hash(ix, iz, seed), b = Pixel.hash(ix + 1, iz, seed), c = Pixel.hash(ix, iz + 1, seed), d = Pixel.hash(ix + 1, iz + 1, seed);
        return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sz;
    },
    _fbm(x, z, oct, seed) {                // 0..1
        let s = 0, a = 0.5, n = 0, f = 1;
        for (let o = 0; o < oct; o++) { s += a * this._n(x * f, z * f, seed + o * 31); n += a; a *= 0.5; f *= 2.03; }
        return s / n;
    },
    _ss(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); },
    _segDist(x, z, ax, az, bx, bz) {       // distância de (x,z) ao segmento AB
        const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
        return hypot(x - (ax + dx * t), z - (az + dz * t));
    },

    // ------------------------------------------------------------ geografia
    // Serras (segmento A→B, meia-largura w, altura h) e morros (cúpulas).
    RANGES: [
        { ax: -1400, az: 1030, bx: -380, bz: 1110, w: 250, h: 62, name: 'Serra do Norte' },
        { ax: -1340, az: -800, bx: -420, bz: -1040, w: 260, h: 64, name: 'Serra do Sul' },
        { ax: -1150, az: 120, bx: -720, bz: 350, w: 150, h: 46, name: 'Serra do Meio' },
        { ax: -1390, az: -420, bx: -1330, bz: 640, w: 140, h: 40, name: 'Serra do Oeste' },
        { ax: -620, az: 1000, bx: -120, bz: 930, w: 120, h: 38 },
    ],
    DOMES: [
        { x: -470, z: 500, r: 250, h: 46, name: 'Morro da Favela' },
        { x: -300, z: 800, r: 150, h: 30 },
        { x: -640, z: 800, r: 130, h: 26 },
        { x: -975, z: 735, r: 185, h: 62, name: 'Corcovado' },                  // (o Cristo no topo: Landmarks)
        { x: 338, z: -1066, r: 66, h: 44, name: 'Pão de Açúcar' },             // (na ponta da praia do sul)
        { x: 262, z: -1046, r: 40, h: 12 },                                     // (o morrinho do pé)
    ],
    // O PÃO DE AÇÚCAR: um penedo na ponta leste da praia do sul, ligado a ela por um istmo de areia.
    PAO: { x: 338, z: -1066, r: 74, neck: [[205, -1040], [300, -1060]], nr: 34 },
    // A PRAIA DO SUL (x de-a): areia larga entre a Av. do Contorno e o mar, do Morro do Mirante ao Pão de Açúcar.
    BEACH: { x0: -112, x1: 300, z1: -900 },
    // Encostas LISAS dentro de uma serra (sem terraços nem paredões): onde há morro ocupado (o Morro do Mirante, na ponta da Serra do Sul).
    SMOOTH: [{ x: -252, z: -1024, r: 170 }],
    // Faixa de terra da CIDADE (ao longo do canal, de ponta a ponta): caixa arredondada, costa leste só levemente ondulada.
    STRIP: { cx: -57, cz: 42, hx: 256, hz: 1115, r: 16 },
    LAKES: [
        { x: -820, z: -420, rx: 150, rz: 105 },
        { x: -1010, z: -140, rx: 85, rz: 65 },
        { x: -640, z: -660, rx: 120, rz: 78 },
        { x: -430, z: 960, rx: 70, rz: 55 },
        // a LAGOA: entre a Rodovia da Lagoa e o viaduto, com margem de parque (sem brejo) — um bojo ao sul e um braço mais estreito ao norte
        { x: -404, z: -590, rx: 92, rz: 190, park: true, name: 'Lagoa' },
        { x: -414, z: -400, rx: 66, rz: 96, park: true },
    ],
    BAYS: [
        { x: -700, z: -1190, rx: 230, rz: 200, name: 'Baía Verde' },
        { x: -1400, z: 1060, rx: 170, rz: 150, name: 'Baía do Lagostim' },
        { x: -1450, z: -150, rx: 120, rz: 230 },
        { x: -820, z: 1250, rx: 160, rz: 120 },
    ],
    ISLAND: { ax: 610, az: -700, bx: 610, bz: 800, r: 205 },
    ISLETS: [
        { x: -700, z: -1208, r: 40 }, { x: -1390, z: -1120, r: 46 }, { x: 905, z: 320, r: 42 }, { x: 905, z: -520, r: 56 }, { x: 880, z: 930, r: 36 },
        { x: -480, z: -1170, r: 30 }, { x: -250, z: -1215, r: 26 }, { x: -130, z: -1160, r: 34 }, { x: -380, z: -1230, r: 22 }, { x: -1280, z: 1190, r: 28 },
    ],

    // Bordas 1D do continente (dependem só de z ou só de x): calculadas uma vez por linha/coluna.
    _edges() {
        const W = Config.world, c = W.cell, F = (a, b, s) => this._fbm(a, b, 3, s);
        this._eW = new Float32Array(this.nz); this._eE = new Float32Array(this.nz); this._eN = new Float32Array(this.nx); this._eS = new Float32Array(this.nx);
        for (let j = 0; j < this.nz; j++) {
            const z = W.minZ + (j + 0.5) * c;
            this._eW[j] = -1430 + (F(z / 340, 0.5, 11) - 0.5) * 170;
            this._eE[j] = -150;                           // o continente "solto" vai até aqui; daí em diante é a faixa da cidade (STRIP)
        }
        for (let i = 0; i < this.nx; i++) {
            const x = W.minX + (i + 0.5) * c;
            this._eN[i] = 1170 + (F(x / 300, 0.5, 12) - 0.5) * 130;
            this._eS[i] = -1140 + (F(x / 260, 0.5, 13) - 0.5) * 150;
        }
    },

    // 1 = terra (continente/ilha/ilhotas, já sem os lagos); a cidade é terra por definição. (i, j) = célula (índices das bordas 1D).
    // O ruído da costa só é avaliado perto dela: longe (|m| > amplitude máx. do ruído, 135) a resposta já é certa.
    _landAt(x, z, i, j) {
        const F = (a, b, s) => this._fbm(a, b, 3, s);
        // Faixa da cidade: sempre terra. A costa leste (a orla do canal) tem baías e pontas — rente à Beira-Mar só nas cabeceiras das
        // pontes e na marina —, e as pontas norte e sul da faixa são recortadas (nada de régua nem de canto reto).
        if (this._stripSd(x, z) < 0) return 1;
        // Continente: caixa com cantos arredondados (raio 330) e costa bem recortada (baías, penínsulas).
        const dW = x - this._eW[j], dS = z - this._eS[i], dN = this._eN[i] - z, R = 330;
        const corner = (a, b) => (a < R && b < R) ? R - hypot(R - a, R - b) : Math.min(a, b);
        const m = Math.min(this._eE[j] - x, corner(dW, dS), corner(dW, dN), dS, dN, dW);
        let land;
        if (m > 150) land = true; else if (m < -150) land = false;
        else land = m + (F(x / 230, z / 230, 15) - 0.5) * 210 + (F(x / 85, z / 85, 19) - 0.5) * 60 > 0;
        if (land) for (const b of this.BAYS) {                              // baías abertas para o mar
            const bx = (x - b.x) / b.rx, bz = (z - b.z) / b.rz, q = bx * bx + bz * bz;
            if (q > 1.4) continue;
            if (1 - q + (F(x / 70, z / 70, 20) - 0.5) * 0.5 > 0) { land = false; break; }
        }
        if (land) for (const k of this.LAKES) {
            const dx = (x - k.x) / k.rx, dz = (z - k.z) / k.rz, q = dx * dx + dz * dz;
            if (q > 1.4) continue;
            if (1 - q + (F(x / 60, z / 60, 16) - 0.5) * 0.55 > 0) { land = false; break; }
        }
        if (!land) {                                       // ilha praiana e ilhotas
            const I = this.ISLAND, d = this._segDist(x, z, I.ax, I.az, I.bx, I.bz);
            if (d < I.r + 45 && (d < I.r - 51 || d < I.r + (F(x / 120, z / 120, 17) - 0.5) * 90 - 6)) land = true;
            const Pq = this.PAO;
            if (!land) {
                const dp = hypot(x - Pq.x, z - Pq.z), dn = this._segDist(x, z, Pq.neck[0][0], Pq.neck[0][1], Pq.neck[1][0], Pq.neck[1][1]);
                if (dp < Pq.r + (F(x / 46, z / 46, 71) - 0.5) * 22 || dn < Pq.nr + (F(x / 40, z / 40, 72) - 0.5) * 14) land = true;
            }
            if (!land) for (const k of this.ISLETS) {
                const d2 = hypot(x - k.x, z - k.z);
                if (d2 < k.r + 12 && d2 < k.r + (F(x / 40, z / 40, 18) - 0.5) * 24) { land = true; break; }
            }
        }
        return land ? 1 : 0;
    },

    // Distância com sinal (u, − dentro) até a borda da faixa da cidade.
    STRIP_KEEP: [714, 0, -630, -437],                   // costa rente nestas alturas (pontes e marina)
    _stripSd(x, z) {
        const S = this.STRIP, F = (a, b, sd, o = 3) => this._fbm(a, b, o, sd), xw = S.cx - S.hx;
        if (x < xw - 40 || z < S.cz - S.hz - 140 || z > S.cz + S.hz + 140 || x > S.cx + S.hx + 120) return 1e3;
        let keep = 1;
        for (const k of this.STRIP_KEEP) keep = Math.min(keep, this._ss(26, 70, Math.abs(z - k)));
        const xe = S.cx + S.hx + Math.max(0, 70 * this._ss(0.42, 0.74, F(z / 230, 2.2, 61)) + 12 * (F(z / 46, 7.7, 62, 2) - 0.5)) * keep;
        const zn = S.cz + S.hz - 10 + 56 * F(x / 150, 3.9, 63) + 10 * (F(x / 40, 1.1, 64, 2) - 0.5);
        const zs = S.cz - S.hz + 6 - 56 * F(x / 150, 6.3, 65) - 10 * (F(x / 40, 5.5, 66, 2) - 0.5);
        const sm = (a, b, k) => { const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k)); return b + (a - b) * h - k * h * (1 - h); };
        return -Math.min(sm(sm(xe - x, zn - z, 50), z - zs, 50), x - xw);
    },

    // Altura "crua" (u) em (x, z), sem o achatamento da cidade nem o terraceamento.
    _rawHeight(x, z) {
        const F = (a, b, o, s) => this._fbm(a, b, o, s);
        let h = (F(x / 230, z / 230, 3, 21) - 0.5) * 10;                       // colinas suaves do campo
        let mt = 0;
        const RG = this.RANGES, DM = this.DOMES;                            // (laços por índice: este é o laço mais quente da carga)
        for (let k = 0; k < RG.length; k++) {
            const r = RG[k], t = 1 - Math.min(1, this._segDist(x, z, r.ax, r.az, r.bx, r.bz) / r.w);
            if (t <= 0) continue;
            const prof = Math.pow(t, 1.25), ridged = 1 - Math.abs(2 * F(x / 140, z / 140, 3, 22) - 1);
            h += prof * (r.h * 0.55 + r.h * 0.55 * ridged) + prof * (F(x / 55, z / 55, 2, 23) - 0.5) * 6;
            mt = Math.max(mt, prof);       // (só as SERRAS ganham terraços/paredões; os morros são lisos)
        }
        for (let k = 0; k < DM.length; k++) {
            const d = DM[k], u = hypot(x - d.x, z - d.z) / d.r;
            if (u >= 1) continue;
            h += Math.pow(1 - u * u, 1.4) * d.h * (0.75 + 0.5 * F(x / 70, z / 70, 3, 24));
        }
        // Terraços (degraus com paredões) nas serras/morros; o ruído deixa rampas por onde dá para subir.
        if (mt > 0.18 && h > 6) {
            const step = 6.5, q = h / step, f = Math.floor(q), r = q - f;
            const hT = (f + this._ss(0.62, 0.96, r)) * step;
            let k = this._ss(0.18, 0.55, mt) * this._ss(0.35, 0.7, F(x / 48, z / 48, 2, 25));
            for (let s = 0; s < this.SMOOTH.length; s++) { const o = this.SMOOTH[s]; k *= this._ss(o.r * 0.6, o.r, hypot(x - o.x, z - o.z)); }
            h = h + (hT - h) * k;
        }
        return h;
    },

    // ----------------------------------------------------------------- build
    // ETAPA 1 (antes do CityGrid): terra/água, distâncias da margem, mar x lagos. O plano de ruas valida seus trechos contra isto.
    buildLand() {
        const W = Config.world, c = W.cell;
        const nx = this.nx = Math.ceil((W.maxX - W.minX) / c), nz = this.nz = Math.ceil((W.maxZ - W.minZ) / c);
        const N = nx * nz;
        this.size = { w: W.maxX - W.minX, h: W.maxZ - W.minZ };
        const land = this.land = new Uint8Array(N);
        const h = this.h = new Float32Array(N);
        const biome = this.biome = new Uint8Array(N);
        const flags = this.flags = new Uint8Array(N);          // bit0 paredão (intransponível)
        const dm = this.dist = new Float32Array(N);            // metros até a terra mais próxima (0 em terra)

        const X = (i) => W.minX + (i + 0.5) * c, Z = (j) => W.minZ + (j + 0.5) * c;
        const t0 = performance.now();
        this._edges();
        for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) land[j * nx + i] = this._landAt(X(i), Z(j), i, j);

        // Distância até a terra (chanfro 3-4): metros. Para terra, distância até a ÁGUA (guardada à parte, em `inland`).
        const BIG = 1e4;
        const chamfer = (src) => {
            const d = new Float32Array(N);
            for (let k = 0; k < N; k++) d[k] = src(k) ? 0 : BIG;
            for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
                const k = j * nx + i; let v = d[k];
                if (i > 0) v = Math.min(v, d[k - 1] + 1);
                if (j > 0) { v = Math.min(v, d[k - nx] + 1); if (i > 0) v = Math.min(v, d[k - nx - 1] + 1.414); if (i < nx - 1) v = Math.min(v, d[k - nx + 1] + 1.414); }
                d[k] = v;
            }
            for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
                const k = j * nx + i; let v = d[k];
                if (i < nx - 1) v = Math.min(v, d[k + 1] + 1);
                if (j < nz - 1) { v = Math.min(v, d[k + nx] + 1); if (i < nx - 1) v = Math.min(v, d[k + nx + 1] + 1.414); if (i > 0) v = Math.min(v, d[k + nx - 1] + 1.414); }
                d[k] = v;
            }
            return d;
        };
        this._prof = { land: performance.now() - t0 };
        const dWater = chamfer((k) => !land[k]);              // em terra: células até a água
        const dLand = chamfer((k) => land[k]);                // na água: células até a terra
        for (let k = 0; k < N; k++) dm[k] = land[k] ? 0 : dLand[k] * c;
        this.inland = dWater;

        // Água do MAR (conectada à borda do mundo) x lagos (fechados): praia só no mar; lago tem margem de lama/charco.
        const sea = new Uint8Array(N), stack = [];
        const push = (i, j) => { const k = j * nx + i; if (!land[k] && !sea[k]) { sea[k] = 1; stack.push(k); } };
        for (let i = 0; i < nx; i++) { push(i, 0); push(i, nz - 1); }
        for (let j = 0; j < nz; j++) { push(0, j); push(nx - 1, j); }
        while (stack.length) {
            const k = stack.pop(), i = k % nx, j = (k / nx) | 0;
            if (i > 0) push(i - 1, j); if (i < nx - 1) push(i + 1, j); if (j > 0) push(i, j - 1); if (j < nz - 1) push(i, j + 1);
        }
        const dSea = chamfer((k) => sea[k] === 1);            // em terra: células até o MAR
        const dLake = chamfer((k) => !land[k] && !sea[k]);    // em terra: células até um LAGO
        this.isSea = sea;
        this._dSea = dSea; this._dLake = dLake; this._dWater = dWater; this._chamfer = chamfer;
        this._prof.chamfer = performance.now() - t0;
    },

    // Metros de terra até o MAR / até um LAGO / até qualquer água (0 em água). Para validar onde cabem ruas e prédios.
    seaDist(x, z) { const k = this.index(x, z); return k < 0 ? 0 : this._dSea[k] * Config.world.cell; },
    lakeDist(x, z) { const k = this.index(x, z); return k < 0 ? 0 : this._dLake[k] * Config.world.cell; },
    waterDist(x, z) { const k = this.index(x, z); return k < 0 ? 0 : this._dWater[k] * Config.world.cell; },
    // Ponto onde dá para construir rua/prédio: terra firme a `margin` m de qualquer água.
    buildable(x, z, margin = 14) { return this.isLand(x, z) && this.waterDist(x, z) >= margin; },

    // ETAPA 2 (depois do CityGrid): relevo (achatado onde há cidade/estrada), paredões, biomas.
    buildTerrain() {
        const W = Config.world, c = W.cell, nx = this.nx, nz = this.nz, N = nx * nz;
        const land = this.land, h = this.h, biome = this.biome, flags = this.flags;
        const dWater = this._dWater, dSea = this._dSea, dLake = this._dLake, chamfer = this._chamfer;
        const X = (i) => W.minX + (i + 0.5) * c, Z = (j) => W.minZ + (j + 0.5) * c;
        const t0 = performance.now();

        // Marca o que é URBANO (células inteiras dentro de um quarteirão-com-ruas) e as ESTRADAS, para achatar o relevo.
        const urban = new Uint8Array(N), urbanFlat = new Uint8Array(N), road = new Uint8Array(N);
        for (const r of CityGrid.urbanBoxes) {
            const i0 = Math.ceil((r[0] - W.minX) / c), i1 = Math.floor((r[2] - W.minX) / c) - 1, j0 = Math.ceil((r[1] - W.minZ) / c), j1 = Math.floor((r[3] - W.minZ) / c) - 1;
            for (let j = Math.max(0, j0); j <= Math.min(nz - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++) { urban[j * nx + i] = 1; if (r[4] !== false) urbanFlat[j * nx + i] = 1; }
        }
        for (const P of CityGrid.urbanPolys || []) {                                  // quarteirões em polígono: células com os 4 cantos dentro da face
            let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
            for (const p of P) { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]); }
            const i0 = Math.max(0, Math.floor((x0 - W.minX) / c)), i1 = Math.min(nx - 1, Math.floor((x1 - W.minX) / c)), j0 = Math.max(0, Math.floor((z0 - W.minZ) / c)), j1 = Math.min(nz - 1, Math.floor((z1 - W.minZ) / c));
            const cw = i1 - i0 + 2, K = new Uint8Array(cw * (j1 - j0 + 2));                  // cantos (cada um testado uma vez)
            for (let j = j0; j <= j1 + 1; j++) for (let i = i0; i <= i1 + 1; i++) K[(j - j0) * cw + i - i0] = RoadPlan.inPoly(P, W.minX + i * c, W.minZ + j * c) ? 1 : 0;
            for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
                const k = (j - j0) * cw + i - i0;
                if (K[k] && K[k + 1] && K[k + cw] && K[k + cw + 1]) { urban[j * nx + i] = 1; urbanFlat[j * nx + i] = 1; }
            }
        }
        for (const r of CityGrid.roadRects) {                                        // estradas que cortam o relevo (a favela segue o morro: fica de fora)
            if (r.flat === false) continue;
            const i0 = Math.floor((r.x0 - 4 - W.minX) / c), i1 = Math.floor((r.x1 + 4 - W.minX) / c), j0 = Math.floor((r.z0 - 4 - W.minZ) / c), j1 = Math.floor((r.z1 + 4 - W.minZ) / c);
            for (let j = Math.max(0, j0); j <= Math.min(nz - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++) road[j * nx + i] = 1;
        }
        const dUrb = chamfer((k) => urbanFlat[k] === 1), dRoad = chamfer((k) => road[k] === 1);

        // Alturas (só em terra): o relevo sobe a partir da cidade e das estradas; a ilha é quase plana.
        for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
            const k = j * nx + i;
            if (!land[k]) continue;
            const x = X(i), z = Z(j);
            let v = this._rawHeight(x, z);
            v *= Math.min(this._ss(10, 140, dUrb[k] * c), this._ss(6, 45, dRoad[k] * c));
            if (x > 300 && hypot(x - this.PAO.x, z - this.PAO.z) > this.PAO.r + 40) v = Math.min(v, 1.5) * 0.5;      // ilha: quase plana (o Pão de Açúcar, não)
            v *= this._ss(0, 28, dWater[k] * c);                                      // e desce até o nível do mar na costa
            h[k] = Math.max(0, v);
        }

        this._prof.heights = performance.now() - t0;
        // Inclinação -> paredões; biomas.
        const R = this.B, cliffS = W.cliffSlope;
        const hAt = (i, j) => h[Math.max(0, Math.min(nz - 1, j)) * nx + Math.max(0, Math.min(nx - 1, i))];
        for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
            const k = j * nx + i;
            if (!land[k]) { biome[k] = R.SEA; continue; }
            const x = X(i), z = Z(j), hh = h[k], dwm = dWater[k] * c;
            const sx = (hAt(i + 1, j) - hAt(i - 1, j)) / (2 * c), sz = (hAt(i, j + 1) - hAt(i, j - 1)) / (2 * c), slope = hypot(sx, sz);
            // CITY = célula inteira dentro da malha urbana; as que só tocam a borda ficam como terreno, por baixo (sem frestas).
            if (urban[k]) { biome[k] = R.CITY; continue; }
            if (slope > cliffS && hh > 5) flags[k] |= 1;
            let b;
            const pao = hypot(x - this.PAO.x, z - this.PAO.z) < this.PAO.r + 30, BE = this.BEACH;
            if (pao && hh > 6) b = hh > 30 || slope > 0.5 ? R.ROCK : R.FOREST;                                 // (o Pão de Açúcar: mata no pé, pedra no alto)
            else if (typeof Corcovado !== 'undefined' && hypot(x - Corcovado.C.x, z - Corcovado.C.z) < Corcovado.R + 14) b = R.FOREST;     // (o morro do Cristo: mata fechada)
            else if (dSea[k] * c < 13 || (dSea[k] * c < 40 && x > 184 && x < 300 && Math.abs(z - this.STRIP.cz) < this.STRIP.hz + 60)) b = R.SAND;      // (orla da cidade: praia larga nas baías)
            else if (x > BE.x0 && x < BE.x1 && z < BE.z1 && hh < 8) b = R.SAND;                               // (a praia do sul)
            else if (dLake[k] * c < 11 && hh < 6) b = this._inLagoa(x, z, 40) ? R.GRASS : R.SWAMP;              // (a Lagoa: margem de parque)
            else if (x > 300 && !pao) b = R.RESORT;
            else if (hh > 36 || (hh > 20 && slope > 0.26) || (flags[k] & 1)) b = R.ROCK;
            else if (this._inFavela(x, z, hh)) b = R.FAVELA;
            else if (typeof Bairros !== 'undefined' && Bairros.zoneAt(x, z) === 'roca') b = this._fbm(x / 70, z / 70, 2, 46) > 0.52 ? R.FARM : R.GRASS;      // (a roça: pasto e lavoura, sem brejo)
            else if (this._inSwamp(x, z, hh)) b = R.SWAMP;
            else if (this._inFarm(x, z, hh)) b = R.FARM;
            else {
                const f = this._fbm(x / 180, z / 180, 3, 41);
                if (f > 0.55) b = R.FOREST;
                else if (z < -280 && this._fbm(x / 260 + 100, z / 260, 2, 42) > 0.56) b = R.SCRUB;
                else b = R.GRASS;
            }
            if ((flags[k] & 1) && b !== R.ROCK) flags[k] &= ~1;                      // paredão só em pedra
            biome[k] = b;
        }
        this._prof.biomes = performance.now() - t0;
        for (const t of RoadPlan.tunnels || []) {                                    // corredor do túnel: sem paredão (a pista passa por baixo da serra)
            const i0 = Math.floor((t.x0 - 16 - W.minX) / c), i1 = Math.floor((t.x1 + 16 - W.minX) / c), j0 = Math.floor((t.z0 - 16 - W.minZ) / c), j1 = Math.floor((t.z1 + 16 - W.minZ) / c);
            for (let j = Math.max(0, j0); j <= Math.min(nz - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++) flags[j * nx + i] &= ~1;
        }
        this._buildCliffObstacles();
        this._regions();
        this.buildMs = performance.now() - t0;
        console.log(`[MAPA] ${nx}×${nz} células em ${(performance.now() - t0).toFixed(0)} ms | paredões: ${this.cliffRects.length} retângulos`);
    },

    // (x, z) na Lagoa ou a `m` u dela?
    _inLagoa(x, z, m = 0) { return this.LAKES.some((L) => L.park && Math.abs(x - L.x) < L.rx + m && Math.abs(z - L.z) < L.rz + m); },

    _inFavela(x, z, hh) {
        if (typeof FavelaPlan !== 'undefined' && FavelaPlan.built) {                  // chão de terra em volta da mancha (não um círculo)
            for (const F of Favelas.built) { const R = F.R; if (x > R.x0 - 4 && x < R.x1 + 4 && z > R.z0 - 4 && z < R.z1 + 4 && hh > 1.5 && F.occ(x, z) > -14) return true; }
            return false;
        }
        for (const d of this.DOMES.slice(0, 2)) {
            const u = hypot(x - d.x, z - d.z) / d.r;
            if (u > 1.1) continue;
            if (u < 0.92 + (this._fbm(x / 50, z / 50, 2, 43) - 0.5) * 0.25 && hh > 1.5) return true;
        }
        return false;
    },
    _inSwamp(x, z, hh) {
        const dx = (x + 820) / 380, dz = (z + 430) / 330, q = dx * dx + dz * dz;
        return hh < 5 && q < 1.3 && q < 0.85 + (this._fbm(x / 110, z / 110, 2, 44) - 0.5) * 0.7;
    },
    _inFarm(x, z, hh) {
        const dx = (x + 560) / 340, dz = (z - 150) / 430, q = dx * dx + dz * dz;
        return hh < 6 && q < 1.1 && q < 0.9 + (this._fbm(x / 120, z / 120, 2, 45) - 0.5) * 0.35;
    },

    // Paredões -> retângulos sólidos (execuções horizontais de células) para a colisão a pé/de carro/tiro.
    _buildCliffObstacles() {
        const W = Config.world, c = W.cell, nx = this.nx, nz = this.nz, fl = this.flags;
        this.cliffRects = [];
        for (let j = 0; j < nz; j++) {
            let i = 0;
            while (i < nx) {
                if (!(fl[j * nx + i] & 1)) { i++; continue; }
                let e = i; while (e < nx && (fl[j * nx + e] & 1)) e++;
                this.cliffRects.push({ x0: W.minX + i * c, z0: W.minZ + j * c, x1: W.minX + e * c, z1: W.minZ + (j + 1) * c, h: 4, cliff: true });
                i = e;
            }
        }
        // Funde linhas consecutivas idênticas (menos retângulos).
        const out = [], open = new Map();
        for (const r of this.cliffRects) {
            const key = r.x0 + ':' + r.x1, prev = open.get(key);
            if (prev && Math.abs(prev.z1 - r.z0) < 1e-6) prev.z1 = r.z1;
            else { const n = Object.assign({}, r); open.set(key, n); out.push(n); }
        }
        this.cliffRects = out;
        CityGrid.addObstacles(out);
    },

    _regions() {
        this.regions = [
            { name: 'CENTRO', x: -60, z: 0, size: 1 },
            { name: 'ILHA PRAIANA', x: 610, z: 60, size: 1 },
            { name: 'FAVELA DO MORRO', x: -470, z: 500, size: 0.9 },
            { name: 'SERRA DO NORTE', x: -950, z: 1040, size: 0.85 },
            { name: 'SERRA DO SUL', x: -900, z: -890, size: 0.85 },
            { name: 'SERRA DO MEIO', x: -910, z: 240, size: 0.7 },
            { name: 'PÂNTANO', x: -820, z: -430, size: 0.8 },
            { name: 'FAZENDAS', x: -560, z: 150, size: 0.85 },
            { name: 'CANAL', x: 315, z: 0, size: 0.6 },
            { name: 'MORRO DO MIRANTE', x: -250, z: -1050, size: 0.8 },
            { name: 'LAGOA', x: -404, z: -560, size: 0.8 },
            { name: 'PÃO DE AÇÚCAR', x: 338, z: -1150, size: 0.75 },
            { name: 'CORCOVADO', x: -978, z: 815, size: 0.7 },
        ];
        if (typeof Bairros !== 'undefined') for (const Z of Bairros.ZONES) this.regions.push({ name: Z.label, x: Z.lx, z: Z.lz, size: 0.8 });
    },

    // ---------------------------------------------------------------- contornos
    // Curva de nível `level` de um campo amostrado em grade (marching squares, com interpolação): f(x, z) nos nós x0 + i·step,
    // z0 + j·step (i ≤ nx, j ≤ nz); por fora da grade conta como abaixo do nível (os laços fecham). Devolve os laços [[x, z], ...]
    // (maior área primeiro); "dentro" = f > level.
    contour(f, x0, z0, nx, nz, step, level = 0) {
        const W = nx + 3, V = new Float32Array(W * (nz + 3));
        for (let j = -1; j <= nz + 1; j++) for (let i = -1; i <= nx + 1; i++) V[(j + 1) * W + i + 1] = i < 0 || j < 0 || i > nx || j > nz ? -1e9 : f(x0 + i * step, z0 + j * step) - level;
        const v = (i, j) => V[(j + 1) * W + i + 1], X = (i) => x0 + i * step, Z = (j) => z0 + j * step;
        const lerp = (a, b) => { const t = a / (a - b); return Math.max(0, Math.min(1, t)); };
        // pontos de corte nas arestas: 'h' = aresta (i,j)-(i+1,j), 'v' = (i,j)-(i,j+1)
        const pt = new Map(), P = (k, i, j) => {
            let p = pt.get(k);
            if (!p) { p = k[0] === 'h' ? [X(i) + lerp(v(i, j), v(i + 1, j)) * step, Z(j)] : [X(i), Z(j) + lerp(v(i, j), v(i, j + 1)) * step]; pt.set(k, p); }
            return k;
        };
        const link = new Map(), add = (a, b) => { (link.get(a) || link.set(a, []).get(a)).push(b); (link.get(b) || link.set(b, []).get(b)).push(a); };
        for (let j = -1; j <= nz; j++) for (let i = -1; i <= nx; i++) {
            const a = v(i, j) > 0, b = v(i + 1, j) > 0, c = v(i + 1, j + 1) > 0, d = v(i, j + 1) > 0, k = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0);
            if (k === 0 || k === 15) continue;
            const S = () => P('h' + i + ',' + j, i, j), N = () => P('h' + i + ',' + (j + 1), i, j + 1), Wv = () => P('v' + i + ',' + j, i, j), E = () => P('v' + (i + 1) + ',' + j, i + 1, j);
            const mid = (v(i, j) + v(i + 1, j) + v(i + 1, j + 1) + v(i, j + 1)) > 0;
            switch (k) {
                case 1: case 14: add(Wv(), S()); break;
                case 2: case 13: add(S(), E()); break;
                case 3: case 12: add(Wv(), E()); break;
                case 4: case 11: add(E(), N()); break;
                case 6: case 9: add(S(), N()); break;
                case 7: case 8: add(Wv(), N()); break;
                case 5: if (mid) { add(Wv(), N()); add(S(), E()); } else { add(Wv(), S()); add(E(), N()); } break;
                case 10: if (mid) { add(Wv(), S()); add(E(), N()); } else { add(Wv(), N()); add(S(), E()); } break;
            }
        }
        const loops = [], seen = new Set();
        for (const k0 of link.keys()) {
            if (seen.has(k0)) continue;
            const L = []; let prev = null, k = k0;
            while (k && !seen.has(k)) { seen.add(k); L.push(pt.get(k)); const nb = link.get(k); const nx2 = nb[0] !== prev ? nb[0] : nb[1]; prev = k; k = nx2; }
            if (L.length >= 3) loops.push(L);
        }
        const area = (L) => { let s = 0; for (let i = 0; i < L.length; i++) { const p = L[i], q = L[(i + 1) % L.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };
        for (const L of loops) if (area(L) < 0) L.reverse();                     // anti-horários
        return loops.sort((a, b) => area(b) - area(a));
    },
    // Simplifica um laço fechado (Douglas-Peucker, tolerância eps u).
    simplifyLoop(L, eps) {
        const keep = new Uint8Array(L.length), rec = (a, b) => {
            const A = L[a], B = L[b % L.length], dx = B[0] - A[0], dz = B[1] - A[1], l2 = dx * dx + dz * dz || 1;
            let bi = -1, bd = eps;
            for (let i = a + 1; i < b; i++) {
                const p = L[i], t = Math.max(0, Math.min(1, ((p[0] - A[0]) * dx + (p[1] - A[1]) * dz) / l2)), d = hypot(p[0] - A[0] - dx * t, p[1] - A[1] - dz * t);
                if (d > bd) { bd = d; bi = i; }
            }
            if (bi >= 0) { keep[bi] = 1; rec(a, bi); rec(bi, b); }
        };
        const h = L.length >> 1;
        keep[0] = keep[h] = 1; rec(0, h); rec(h, L.length);
        return L.filter((_, i) => keep[i]);
    },

    // ---------------------------------------------------------------- consultas
    inWorld(x, z) { const W = Config.world; return x >= W.minX && x < W.maxX && z >= W.minZ && z < W.maxZ; },
    index(x, z) {
        const W = Config.world, i = Math.floor((x - W.minX) / W.cell), j = Math.floor((z - W.minZ) / W.cell);
        if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
        return j * this.nx + i;
    },
    biomeAt(x, z) { const k = this.index(x, z); return k < 0 ? this.B.SEA : this.biome[k]; },
    isLand(x, z) { const k = this.index(x, z); return k >= 0 && this.land[k] === 1; },
    heightAt(x, z) {
        const W = Config.world, c = W.cell, fx = (x - W.minX) / c - 0.5, fz = (z - W.minZ) / c - 0.5;
        const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, nx = this.nx, nz = this.nz;
        const g = (a, b) => this.h[Math.max(0, Math.min(nz - 1, b)) * nx + Math.max(0, Math.min(nx - 1, a))];
        return (g(i, j) * (1 - tx) + g(i + 1, j) * tx) * (1 - tz) + (g(i, j + 1) * (1 - tx) + g(i + 1, j + 1) * tx) * tz;
    },

    // Brilho do relevo em (x, z) para tingir o chão urbano que segue o morro (favela): >1 = voltado ao sol, <1 = sombra.
    shadeAt(x, z, gain = 2.4) {
        const e = 6, hx = this.heightAt(x + e, z) - this.heightAt(x - e, z), hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
        const gx = hx / (2 * e), gz = hz / (2 * e), d = Config.light.sunDir, l = hypot(d[0], d[1], d[2]);
        const il = 1 / hypot(gx, 1, gz), lam = (-gx * (-d[0] / l) + (-d[1] / l) - gz * (-d[2] / l)) * il;
        return Math.max(0.55, Math.min(1.3, 1 + (lam - (-d[1] / l)) * gain));
    },

    // Metros dentro da água a partir da margem (0 em terra). Fora do mundo: enorme (intransponível).
    waterDepth(x, z) {
        if (!this.inWorld(x, z)) return 1e4;
        const W = Config.world, c = W.cell, fx = (x - W.minX) / c - 0.5, fz = (z - W.minZ) / c - 0.5;
        const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, nx = this.nx, nz = this.nz;
        const g = (a, b) => this.dist[Math.max(0, Math.min(nz - 1, b)) * nx + Math.max(0, Math.min(nx - 1, a))];
        const d = (g(i, j) * (1 - tx) + g(i + 1, j) * tx) * (1 - tz) + (g(i, j + 1) * (1 - tx) + g(i + 1, j + 1) * tx) * tz;
        return Math.max(0, d - c * 0.5);
    },
};

if (!window.DEFER_WORLD) WorldMap.buildLand();     // (a ETAPA 2, buildTerrain, roda no fim do CityGrid.js — depois do plano de ruas; na página do
                                                  // jogo, as duas rodam em passos durante a tela do estúdio: CityGrid.steps)
