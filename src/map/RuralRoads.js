// ============================================================================
// RuralRoads — as ESTRADAS DO INTERIOR: rodovias, estradas de terra e caminhos (trilhas) que serpenteiam pelo relevo.
// Cada via é uma lista de pontos de passagem (cidade, favela, cantos do mapa, lugares) — ou uma ponta "em cima" de uma via já
// traçada ({ on: id, near: [x, z] }: entroncamento em T). Entre um ponto e o seguinte o traçado sai de uma busca A* numa grade
// de 8 u que:
//   • foge de mar e lago (com folga), da cidade e da favela (a não ser perto das pontas);
//   • prefere os vales e a meia-encosta (subir custa; serra alta custa) — a estrada contorna morro e lago como as de verdade;
//   • não corre colada noutra estrada já traçada (cruza, mas não acompanha);
//   • paga para virar (rodovia: curvas longas e suaves; trilha: sinuosa) e segue um ruído de baixa frequência (meandros).
// O caminho de células é simplificado e suavizado (Chaikin) e vira via livre do RoadPlan (addPath): os cruzamentos entre elas
// saem sozinhos (RoadPlan._insertPaths). Os pontos fixos (pontas e cruzamentos marcados) ficam exatos; os outros só guiam.
// Roda no CityGrid._makePlan (antes do relevo: usa WorldMap._rawHeight e a água). Determinístico.
// ============================================================================

const RuralRoads = {
    C: 8, X0: -1504, Z0: -1256, X1: -296, Z1: 1256,
    // Custos por classe. slope: por u de desnível entre células; high: por u de altura (serra) e de comprimento; wander/wl: força e
    // comprimento de onda do ruído do terreno; t1/t2: virar 45°/90°; prox: correr perto de outra estrada; water: folga da água;
    // amp/wave: as curvas em S que o traçado ganha por cima do caminho do A* (amplitude e comprimento de onda, u).
    STYLE: {
        hwy:   { slope: 0.9, high: 0.006, wander: 0.7, wl: 260, t1: 4.5, t2: 26, prox: 3.0, water: 12, amp: 16, wave: 340 },
        dirt:  { slope: 1.4, high: 0.012, wander: 1.5, wl: 130, t1: 1.4, t2: 7, prox: 2.2, water: 10, amp: 20, wave: 170 },
        trail: { slope: 1.6, high: 0.0, wander: 2.2, wl: 60, t1: 0.45, t2: 2.2, prox: 1.4, water: 7, amp: 10, wave: 75 },
        serra: { slope: 1.2, high: 0.004, wander: 1.6, wl: 110, t1: 0.9, t2: 5, prox: 2.2, water: 10, amp: 14, wave: 120 },
    },

    // A rede. Pontas na cidade (x = -294) e na favela ficam onde sempre estiveram (as ruas de lá esperam essas ligações).
    NET: [
        // ---- rodovias (anel + travessas)
        { id: 'R1', cls: 'hwy', name: 'Rodovia do Norte', pts: [[-294, 880], [-336, 880], [-1190, 900]] },          // (pelo pé da serra: lá em cima seria só túnel)
        { id: 'R2', cls: 'hwy', name: 'Rodovia do Oeste', pts: [[-1190, 900], [-1185, 560], [-1210, -60], [-1150, -700]] },
        { id: 'R3', cls: 'hwy', name: 'Rodovia do Sul', pts: [[-1150, -700], [-760, -860], [-336, -930], [-294, -930]] },
        { id: 'R4', cls: 'hwy', name: 'Rodovia Central', pts: [[-294, 186], [-336, 186], [-700, 205], { on: 'R2', near: [-1205, 186] }] },
        { id: 'R5', cls: 'hwy', name: 'Rodovia dos Lagos', pts: [[-294, -246], [-336, -246], [-546, -252], [-760, -265], { on: 'R2', near: [-1200, -246] }] },
        { id: 'R6', cls: 'hwy', name: 'Rodovia do Meio', pts: [{ on: 'R5', near: [-780, -250] }, [-790, 0], [-770, 420], { on: 'R1', near: [-785, 900] }] },
        // (a oeste da LAGOA, e segue para o norte até a Rodovia Central, passando pelo estádio)
        { id: 'R7', cls: 'hwy', name: 'Rodovia da Lagoa', pts: [{ on: 'R3', near: [-548, -895] }, [-552, -600], [-546, -252], [-532, 40], { on: 'R4', near: [-528, 196] }] },
        // ---- estradas de terra
        { id: 'D1', cls: 'dirt', name: 'Estrada da Favela', pts: [{ on: 'R5', near: [-600, -245] }, [-610, 0], [-600, 342]] },
        { id: 'D2', cls: 'dirt', name: 'Estrada do Engenho', pts: [{ on: 'R5', near: [-900, -250] }, [-890, 0], { on: 'R4', near: [-900, 186] }] },
        { id: 'D3', cls: 'dirt', name: 'Estrada das Fazendas', pts: [[-294, -30], [-336, -30], [-600, -20], { on: 'D2', near: [-895, -30] }] },
        { id: 'D5', cls: 'dirt', name: 'Estrada da Serra do Meio', pts: [{ on: 'R4', near: [-975, 190] }, [-1030, 420], [-1020, 640]] },
        { id: 'D6', cls: 'dirt', name: 'Estrada do Sítio', pts: [{ on: 'R2', near: [-1190, 400] }, { on: 'D5', near: [-1030, 400] }] },
        { id: 'D7', cls: 'dirt', name: 'Estrada do Valão', pts: [{ on: 'R6', near: [-780, 342] }, [-660, 342]] },
        { id: 'D8', cls: 'dirt', name: 'Estrada do Morro', pts: [{ on: 'R6', near: [-780, 558] }, [-660, 558]] },
        { id: 'D9', cls: 'dirt', name: 'Estrada do Lago Grande', pts: [{ on: 'R7', near: [-552, -480] }, [-640, -430], [-720, -555], [-900, -560], [-1000, -440], { on: 'R5', near: [-1010, -250] }] },
        { id: 'D10', cls: 'dirt', name: 'Estrada da Lagoa Funda', pts: [{ on: 'R7', near: [-552, -680] }, [-600, -790], { on: 'R3', near: [-790, -850] }] },
        { id: 'D11', cls: 'dirt', name: 'Estrada do Lago Norte', pts: [[-1020, 640], [-1100, 760], [-1040, 850], { on: 'R1', near: [-1000, 915] }] },
        { id: 'D12', cls: 'dirt', name: 'Estrada da Serra Norte', pts: [{ on: 'R1', near: [-560, 890] }, [-520, 1000], [-430, 1060], [-336, 1080], [-294, 1080]] },
        // ---- Vila da Roça (bairros/Bairros.js): a estrada da vila, ao norte do lago, da Rodovia do Oeste à Estrada do Engenho
        { id: 'D13', cls: 'dirt', name: 'Estrada da Roça', pts: [{ on: 'R2', near: [-1208, 4] }, [-1120, 14], [-1040, -6], [-960, 4], { on: 'D2', near: [-893, 2] }] },
        // ---- Alto da Serra (bairro rico): asfalto estreito e sinuoso pelo planalto entre a Serra do Norte e a do Oeste
        { id: 'S1', cls: 'serra', name: 'Estrada do Alto da Serra', pts: [{ on: 'R2', near: [-1190, 850] }, [-1262, 862], [-1335, 826], [-1392, 762], [-1398, 690], [-1348, 648], [-1276, 660], { on: 'R2', near: [-1196, 642] }] },
        { id: 'S2', cls: 'serra', name: 'Alameda das Hortênsias', pts: [{ on: 'S1', near: [-1300, 846] }, [-1306, 776], [-1290, 712], { on: 'S1', near: [-1300, 652] }] },
        { id: 'S3', cls: 'serra', name: 'Estrada do Mirante da Serra', pts: [{ on: 'R1', near: [-1150, 898] }, [-1090, 930], [-1010, 944], [-940, 934], { on: 'R1', near: [-890, 902] }] },
        // ---- caminhos (trilhas de terra estreitas e sinuosas; todas ligam duas vias — nada de beco sem saída)
        { id: 'T1', cls: 'trail', name: 'Trilha do Morro do Norte', pts: [{ on: 'R6', near: [-779, 700] }, [-700, 760], [-630, 800], [-600, 845], { on: 'R1', near: [-600, 885] }] },
        { id: 'T2', cls: 'trail', name: 'Trilha da Serra do Meio', pts: [{ on: 'R4', near: [-920, 188] }, [-970, 290], [-1070, 300], { on: 'D5', near: [-1028, 330] }] },
        { id: 'T3', cls: 'trail', name: 'Trilha do Lago Norte', pts: [{ on: 'D11', near: [-1075, 800] }, [-930, 830], [-850, 780], [-860, 660], { on: 'R6', near: [-779, 620] }] },
        { id: 'T4', cls: 'trail', name: 'Caminho da Serra do Sul', pts: [{ on: 'R3', near: [-560, -895] }, [-650, -970], [-800, -990], { on: 'R3', near: [-880, -800] }] },
        { id: 'T5', cls: 'trail', name: 'Trilha dos Lagos', pts: [{ on: 'R5', near: [-1080, -250] }, [-1120, -150], [-1060, -60], { on: 'D2', near: [-893, -80] }] },
        { id: 'T6', cls: 'trail', name: 'Caminho da Praia', pts: [{ on: 'R7', near: [-552, -820] }, [-470, -1010], { on: 'R3', near: [-420, -925] }] },
        { id: 'T7', cls: 'trail', name: 'Trilha do Morro Leste', pts: [{ on: 'R1', near: [-470, 880] }, [-400, 790], [-336, 760], [-294, 760]] },
        { id: 'T8', cls: 'trail', name: 'Trilha da Serra do Oeste', pts: [{ on: 'R2', near: [-1195, 700] }, [-1280, 620], [-1290, 480], { on: 'R2', near: [-1192, 430] }] },
        { id: 'T9', cls: 'trail', name: 'Trilha do Mirante', pts: [{ on: 'R1', near: [-720, 895] }, [-730, 1000], [-650, 1090], [-560, 1085], { on: 'D12', near: [-515, 1010] }] },
        { id: 'T10', cls: 'trail', name: 'Caminho da Margem', pts: [{ on: 'R5', near: [-700, -255] }, [-760, -300], [-880, -300], { on: 'R5', near: [-920, -252] }] },
        // ---- o Corcovado (o Cristo no alto: Landmarks) e o estádio
        { id: 'T11', cls: 'serra', name: 'Estrada do Corcovado', pts: [{ on: 'D5', near: [-1024, 600] }, [-992, 630], [-968, 655], [-925, 662], [-900, 700], [-898, 750], [-905, 790], { on: 'T3', near: [-893, 805] }] },      // (do pé do morro: o portão das escadarias, o elevador e a estação do trem)
        { id: 'S4', cls: 'serra', name: 'Av. do Estádio', pts: [{ on: 'D3', near: [-446, -26] }, [-446, 26], [-362, 26], { on: 'D3', near: [-362, -28] }] },      // (o retorno em frente ao Maracanã: sem ponta solta)
    ],

    routes: {},             // id → [[x, z], ...] (o traçado final)

    plan(P) {
        const t0 = performance.now();
        this._setup();
        // pontos fixos: as pontas e todo ponto (exato) que aparece em mais de uma via
        const uses = new Map(), key = (w) => Array.isArray(w) ? w[0] + ',' + w[1] : null;
        for (const r of this.NET) for (const w of r.pts) { const k = key(w); if (k) uses.set(k, (uses.get(k) || 0) + 1); }
        const fixedPt = new Map();                                              // ponto fixo já ajustado (o mesmo para todas as vias)
        let fails = 0;
        // a cidade não termina mais em x = -294: as pontas que chegavam lá encostam na Av. do Contorno (na perpendicular)
        const isCity = (w) => Array.isArray(w) && w[0] === -294 && typeof CityGrid !== 'undefined' && CityGrid.cityPath;
        const link = (pts) => {
            const out = pts.slice();
            if (isCity(out[0])) out.splice(0, 1, ...CityGrid.cityLink(out[0][1]));
            if (isCity(out[out.length - 1])) out.splice(out.length - 1, 1, ...CityGrid.cityLink(out[out.length - 1][1]).reverse());
            return out;
        };
        for (const r of this.NET) {
            const S = this.STYLE[r.cls], W = [], fixed = [];
            link(r.pts).forEach((w, i, pts) => {
                const end = i === 0 || i === pts.length - 1;
                if (!Array.isArray(w)) { W.push(this._onRoute(w)); fixed.push(true); return; }
                const k = key(w), fx = end || uses.get(k) > 1;
                if (fx && fixedPt.has(k)) { W.push(fixedPt.get(k)); fixed.push(true); return; }
                const p = this._valid(w, S, end);
                if (fx) fixedPt.set(k, p);
                W.push(p); fixed.push(fx);
            });
            const out = this._route(S, W, fixed, r.id);
            if (!out) { fails++; console.warn('[ESTRADAS] sem traçado para ' + r.name); continue; }
            this.routes[r.id] = out;
            P.addPath(out, r.cls, { name: r.name });
            this._stampProx(out);
        }
        this.buildMs = performance.now() - t0;
        console.log(`[ESTRADAS] ${this.NET.length - fails} vias do interior (${Object.values(this.routes).reduce((s, p) => s + this._len(p), 0).toFixed(0)} u) em ${this.buildMs.toFixed(0)} ms`);
    },

    _len(P) { let L = 0; for (let i = 1; i < P.length; i++) L += hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return L; },

    // Ponto da via `w.on` (já traçada) mais perto de w.near.
    _onRoute(w) {
        const P = this.routes[w.on];
        if (!P) { console.warn('[ESTRADAS] via ainda não traçada: ' + w.on); return w.near.slice(); }
        let best = null, bd = Infinity;
        for (let i = 0; i + 1 < P.length; i++) {
            const a = P[i], b = P[i + 1], sx = b[0] - a[0], sz = b[1] - a[1], L2 = sx * sx + sz * sz || 1;
            const t = Math.max(0, Math.min(1, ((w.near[0] - a[0]) * sx + (w.near[1] - a[1]) * sz) / L2)), x = a[0] + sx * t, z = a[1] + sz * t, d = hypot(x - w.near[0], z - w.near[1]);
            if (d < bd) { bd = d; best = [x, z]; }
        }
        return best;
    },

    // Ponto de passagem num lugar possível (terra, longe da água); senão, o mais perto que for. Pontas na cidade/favela: como estão.
    _valid(w, S, end) {
        if (end || this._pass(w[0], w[1], S) === 1) return w.slice();
        for (let r = 8; r <= 120; r += 8) for (let a = 0; a < 16; a++) {
            const x = w[0] + Math.cos(a * Math.PI / 8) * r, z = w[1] + Math.sin(a * Math.PI / 8) * r;
            if (this._pass(x, z, S) === 1) return [x, z];
        }
        return w.slice();
    },

    // 0 = proibido (água, fora do continente), 1 = livre, 2 = só perto das pontas (cidade e favela).
    _pass(x, z, S) {
        if (x < this.X0 || x >= this.X1 || z < this.Z0 || z >= this.Z1) return 0;
        if (!WorldMap.isLand(x, z) || WorldMap.waterDist(x, z) < S.water) return 0;
        if (x > -306) return 2;
        const F = typeof FavelaPlan !== 'undefined' ? FavelaPlan.R : null;
        if (F && x > F.x0 - 8 && x < F.x1 + 8 && z > F.z0 - 8 && z < F.z1 + 8) return 2;
        return 1;
    },

    // ------------------------------------------------------------------ grade
    _setup() {
        const C = this.C;
        this.NX = Math.ceil((this.X1 - this.X0) / C); this.NZ = Math.ceil((this.Z1 - this.Z0) / C);
        const N = this.NX * this.NZ;
        this.h = new Float32Array(N).fill(NaN);
        this.noise = {};
        this.prox = new Float32Array(N);
        this.pass = {};                                                        // por folga de água
        this.g = new Float32Array(N); this.par = new Int32Array(N); this.dir = new Int8Array(N); this.closed = new Uint8Array(N);
        this.hk = new Int32Array(N * 8); this.hf = new Float32Array(N * 8);
        this.routes = {};
    },
    _cx(i) { return this.X0 + (i + 0.5) * this.C; },
    _cz(j) { return this.Z0 + (j + 0.5) * this.C; },
    _H(k) { let v = this.h[k]; if (v !== v) v = this.h[k] = Math.max(0, WorldMap._rawHeight(this._cx(k % this.NX), this._cz((k / this.NX) | 0))); return v; },
    _N(k, wl) {
        let A = this.noise[wl]; if (!A) A = this.noise[wl] = new Float32Array(this.NX * this.NZ).fill(NaN);
        let v = A[k]; if (v !== v) v = A[k] = WorldMap._fbm(this._cx(k % this.NX) / wl, this._cz((k / this.NX) | 0) / wl, 2, 77);
        return v;
    },
    _P(k, S) {
        let A = this.pass[S.water]; if (!A) A = this.pass[S.water] = new Int8Array(this.NX * this.NZ).fill(-1);
        let v = A[k]; if (v < 0) v = A[k] = this._pass(this._cx(k % this.NX), this._cz((k / this.NX) | 0), S);
        return v;
    },
    _cell(x, z) { return Math.max(0, Math.min(this.NZ - 1, Math.floor((z - this.Z0) / this.C))) * this.NX + Math.max(0, Math.min(this.NX - 1, Math.floor((x - this.X0) / this.C))); },

    // ------------------------------------------------------------------ traçado
    // W: pontos de passagem, fixed: quais ficam exatos. Devolve a polilinha suavizada.
    _route(S, W, fixed, id = '') {
        const raw = [W[0].slice()], fix = [0];
        let dir = -1;
        for (let i = 0; i + 1 < W.length; i++) {
            const a = W[i], b = W[i + 1], L = hypot(b[0] - a[0], b[1] - a[1]);
            if (L < 48 || (a[0] > -345 && b[0] > -345)) { raw.push(b.slice()); dir = -1; }          // perna curta (chegada na cidade): reta
            else {
                const r = this._astar(a, b, dir, S);
                if (!r) return null;
                for (let k = 1; k + 1 < r.cells.length; k++) raw.push([this._cx(r.cells[k] % this.NX), this._cz((r.cells[k] / this.NX) | 0)]);
                raw.push(b.slice()); dir = r.dir;
            }
            if (fixed[i + 1]) fix.push(raw.length - 1);
        }
        // suaviza cada trecho entre pontos fixos
        const out = [raw[0]];
        for (let f = 0; f + 1 < fix.length; f++) {
            let seg = raw.slice(fix[f], fix[f + 1] + 1);
            seg = this._rdp(seg, 3);
            for (let it = 0; it < 3; it++) seg = this._chaikin(seg);
            seg = this._wiggle(this._resample(seg, 6), S, id.length * 7.3 + f * 2.1);
            seg = this._rdp(seg, 0.3);
            for (let k = 1; k < seg.length; k++) { const p = seg[k], q = out[out.length - 1]; if (k === seg.length - 1 || hypot(p[0] - q[0], p[1] - q[1]) > 1.5) out.push(p); }
        }
        return out;
    },

    _resample(P, step) {
        const out = [P[0]];
        let carry = 0;
        for (let i = 0; i + 1 < P.length; i++) {
            const a = P[i], b = P[i + 1], L = hypot(b[0] - a[0], b[1] - a[1]);
            let t = step - carry;
            while (t < L) { out.push([a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L]); t += step; }
            carry = L - (t - step);
        }
        const l = P[P.length - 1], q = out[out.length - 1];
        if (hypot(l[0] - q[0], l[1] - q[1]) < step * 0.4) out[out.length - 1] = l; else out.push(l);
        return out;
    },

    // Curvas em S por cima do traçado: deslocamento lateral senoidal (amplitude variando com um ruído), sumindo perto das pontas;
    // onde o ponto deslocado cairia na água (ou na cidade/favela), desloca menos.
    _wiggle(P, S, ph) {
        const n = P.length; if (n < 4) return P;
        const cum = [0];
        for (let i = 1; i < n; i++) cum.push(cum[i - 1] + hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
        const L = cum[n - 1], k = Math.min(1, L / (S.wave * 0.9)), off = new Float32Array(n);
        for (let i = 1; i + 1 < n; i++) {
            const s = cum[i], taper = WorldMap._ss(0, 55, s) * WorldMap._ss(0, 55, L - s);
            const amp = S.amp * k * (0.55 + 0.9 * WorldMap._fbm(s / S.wave + ph, ph * 0.37, 2, 81));
            off[i] = amp * taper * Math.sin((s / S.wave) * Math.PI * 2 + ph);
        }
        // quanto de cada deslocamento cabe (1, ½, ¼, ⅛, 0); a redução se espalha pelos vizinhos (mínimo na janela, depois média) —
        // sem degrau no traçado onde a curva encolhe perto de um lago
        const N = [], f = new Float32Array(n).fill(1);
        for (let i = 1; i + 1 < n; i++) {
            const a = P[i - 1], b = P[i + 1], tl = hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / tl, nz = (b[0] - a[0]) / tl;
            N[i] = [nx, nz];
            let k = 1;
            while (k > 0.1 && this._pass(P[i][0] + nx * off[i] * k, P[i][1] + nz * off[i] * k, S) !== 1) k *= 0.5;
            f[i] = k > 0.1 ? k : 0;
        }
        const W = 6, g = new Float32Array(n), h = new Float32Array(n);
        for (let i = 0; i < n; i++) { let m = 1; for (let j = Math.max(0, i - W); j <= Math.min(n - 1, i + W); j++) m = Math.min(m, f[j]); g[i] = m; }
        for (let i = 0; i < n; i++) { let sum = 0, c = 0; for (let j = Math.max(0, i - 4); j <= Math.min(n - 1, i + 4); j++) { sum += g[j]; c++; } h[i] = Math.min(f[i], sum / c); }
        const out = [P[0]];
        for (let i = 1; i + 1 < n; i++) out.push([P[i][0] + N[i][0] * off[i] * h[i], P[i][1] + N[i][1] * off[i] * h[i]]);
        out.push(P[n - 1]);
        return out;
    },

    _chaikin(P) {
        if (P.length < 3) return P;
        const Q = [P[0]];
        for (let i = 0; i + 1 < P.length; i++) {
            const a = P[i], b = P[i + 1];
            if (i > 0) Q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
            if (i + 2 < P.length) Q.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
        }
        Q.push(P[P.length - 1]);
        return Q;
    },

    _rdp(P, eps) {
        if (P.length < 3) return P;
        const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1;
        const st = [[0, P.length - 1]];
        while (st.length) {
            const [i0, i1] = st.pop(), a = P[i0], b = P[i1], sx = b[0] - a[0], sz = b[1] - a[1], L = hypot(sx, sz) || 1;
            let bd = -1, bi = -1;
            for (let i = i0 + 1; i < i1; i++) { const d = Math.abs((P[i][0] - a[0]) * sz - (P[i][1] - a[1]) * sx) / L; if (d > bd) { bd = d; bi = i; } }
            if (bd > eps) { keep[bi] = 1; st.push([i0, bi], [bi, i1]); }
        }
        return P.filter((_, i) => keep[i]);
    },

    // A* com custo de virada (estado = célula; a direção de chegada fica guardada: aproximação boa o bastante).
    DX: [1, 1, 0, -1, -1, -1, 0, 1], DZ: [0, 1, 1, 1, 0, -1, -1, -1],
    _astar(a, b, dir0, S) {
        const NX = this.NX, NZ = this.NZ, C = this.C, g = this.g, par = this.par, dir = this.dir, closed = this.closed, hk = this.hk, hf = this.hf;
        const s = this._cell(a[0], a[1]), t = this._cell(b[0], b[1]), tx = this._cx(t % NX), tz = this._cz((t / NX) | 0);
        g.fill(Infinity); closed.fill(0);
        const near = (k, R) => { const x = this._cx(k % NX), z = this._cz((k / NX) | 0); return hypot(x - a[0], z - a[1]) < R || hypot(x - b[0], z - b[1]) < R; };
        const turnC = [0, S.t1, S.t2, S.t2 * 4, S.t2 * 10];
        let n = 0;
        const push = (k, f) => { let i = n++; while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hk[i] = hk[p]; hf[i] = hf[p]; i = p; } hk[i] = k; hf[i] = f; };
        const pop = () => {
            const top = hk[0], lk = hk[--n], lf = hf[n]; let i = 0;
            for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && hf[c + 1] < hf[c]) c++; if (hf[c] >= lf) break; hk[i] = hk[c]; hf[i] = hf[c]; i = c; }
            hk[i] = lk; hf[i] = lf; return top;
        };
        g[s] = 0; dir[s] = dir0; par[s] = -1; push(s, 0);
        let it = 0;
        while (n > 0) {
            const u = pop();
            if (closed[u]) continue;
            closed[u] = 1;
            if (u === t) break;
            if (++it > 200000 || n > hk.length - 16) return null;
            const ui = u % NX, uj = (u / NX) | 0, hu = this._H(u), du = dir[u];
            for (let d = 0; d < 8; d++) {
                const vi = ui + this.DX[d], vj = uj + this.DZ[d];
                if (vi < 0 || vj < 0 || vi >= NX || vj >= NZ) continue;
                const v = vj * NX + vi;
                if (closed[v]) continue;
                const ps = this._P(v, S);
                if (v !== t && (ps === 0 || (ps === 2 && !near(v, 90)))) continue;
                const L = d & 1 ? C * 1.4142 : C, hv = this._H(v);
                const nz = Math.max(0, Math.min(1, (this._N(v, S.wl) - 0.5) * 2.6 + 0.5));      // (ruído com contraste: corredores baratos e caros)
                let c = L * (1 + S.wander * nz + S.high * hv) + S.slope * Math.abs(hv - hu);
                if (this.prox[v] > 0 && !near(v, 48)) c += this.prox[v] * S.prox * L;
                if (du >= 0) { const td = Math.abs(d - du), dd = td > 4 ? 8 - td : td; c += turnC[dd]; }
                const ng = g[u] + c;
                if (ng < g[v]) { g[v] = ng; par[v] = u; dir[v] = d; push(v, ng + hypot(this._cx(vi) - tx, this._cz(vj) - tz)); }
            }
        }
        if (g[t] === Infinity) return null;
        const cells = [];
        for (let k = t; k >= 0; k = par[k]) cells.push(k);
        cells.reverse();
        return { cells, dir: dir[t] };
    },

    // Marca as células em volta do traçado (até 3 células: 1 → 0): a próxima estrada evita correr colada nele.
    _stampProx(P) {
        const C = this.C, NX = this.NX, R = 3 * C;
        for (let i = 0; i + 1 < P.length; i++) {
            const a = P[i], b = P[i + 1], sx = b[0] - a[0], sz = b[1] - a[1], L2 = sx * sx + sz * sz || 1;
            const i0 = Math.floor((Math.min(a[0], b[0]) - R - this.X0) / C), i1 = Math.floor((Math.max(a[0], b[0]) + R - this.X0) / C);
            const j0 = Math.floor((Math.min(a[1], b[1]) - R - this.Z0) / C), j1 = Math.floor((Math.max(a[1], b[1]) + R - this.Z0) / C);
            for (let j = Math.max(0, j0); j <= Math.min(this.NZ - 1, j1); j++) for (let ii = Math.max(0, i0); ii <= Math.min(NX - 1, i1); ii++) {
                const x = this._cx(ii), z = this._cz(j), t = Math.max(0, Math.min(1, ((x - a[0]) * sx + (z - a[1]) * sz) / L2));
                const d = hypot(x - a[0] - sx * t, z - a[1] - sz * t), v = 1 - d / R, k = j * NX + ii;
                if (v > this.prox[k]) this.prox[k] = v;
            }
        }
    },
};
