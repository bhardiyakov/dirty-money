// ============================================================================
// NpcGenRender — o renderizador pixel art do gerador (porte de render.py): splat dos pontos assados a 4× (z-buffer), redução por
// cobertura/maioria, sombreamento em 5 tons por material, linhas de contorno, contorno externo, água, efeitos e sombra no chão.
//
// Em vez de RGB, cada pixel sai como (CÓDIGO, ALFA): código = material × 8 + tom (0–4); material 0 / tons 5–7 = cores fixas (SPECIAL).
// Corpo debaixo d'água = código de material com alfa < 255 (a cor é misturada com a da água conforme o alfa — ver colorize / NpcArt).
// ============================================================================

function NpcGenRender(G) {
    'use strict';
    const { M, GR, rint, mv3, mm3, Rz, deg, nrm, hexrgb, OUTLINE, SHADOW_RGBA } = G;
    const floor = Math.floor, abs = Math.abs, sqrt = Math.sqrt, min = Math.min, max = Math.max, trunc = Math.trunc;

    const NG = 20, NM = 32, SS = 4;
    const GROUP_W = new Float64Array(NG).fill(1);
    GROUP_W[GR.weapon] = 2.2; GROUP_W[GR.prop] = 2.2; GROUP_W[GR.pump] = 2.2; GROUP_W[GR.face] = 1.15;
    const DECALS = [M.brow, M.mouth, M.gold, M.eye, M.eyew];                        // prioridade crescente
    const DECAL_MIN = { [M.brow]: 5, [M.mouth]: 4, [M.gold]: 3, [M.eye]: 4, [M.eyew]: 3 };
    const isDecal = new Uint8Array(NM); for (const d of DECALS) isDecal[d] = 1;
    const noLine = new Uint8Array(NM); for (const d of [...DECALS, M.lace, M.chrome, M.accent, M.accent2, M.beard, M.lens]) noLine[d] = 1;
    const isWeaponGroup = (g) => g === GR.weapon || g === GR.prop || g === GR.pump;
    // Brilho especular por material (sombreado contínuo): [expoente (maior = brilho menor e mais duro), intensidade].
    const SHINE = [];
    for (const [m, e, s] of [[M.skin, 18, 0.1], [M.hair, 30, 0.22], [M.shirt, 10, 0.04], [M.jeans, 8, 0.03], [M.shoe, 40, 0.35], [M.sole, 10, 0.05],
        [M.bag, 20, 0.12], [M.strap, 20, 0.1], [M.metal, 60, 0.8], [M.wood, 14, 0.1], [M.eyew, 60, 0.5], [M.green, 40, 0.4], [M.batwood, 30, 0.3],
        [M.chrome, 80, 1.0], [M.tape, 10, 0.05], [M.vest, 12, 0.06], [M.hat, 24, 0.18], [M.accent, 10, 0.04], [M.beard, 20, 0.08], [M.gold, 50, 0.8],
        [M.lens, 80, 0.9], [M.glove, 30, 0.25], [M.visor, 80, 0.8], [M.accent2, 10, 0.04], [M.cargo, 20, 0.15], [M.flesh, 20, 0.15]]) SHINE[m] = [e, s];

    // ------------------------------------------------------------------ códigos fixos (material 0 e tons 5–7)
    const C = { SHADOW: 0, OUTLINE: 1, FOAM: 2, FLASH_OUT: 3, FLASH_MID: 4, FLASH_CORE: 5, CASING: 6, CASING_DK: 7, TRAIL: 13, SPLASH: 14, RING: 15 };
    const SPECIAL = {
        [C.SHADOW]: SHADOW_RGBA.slice(0, 3), [C.OUTLINE]: hexrgb(OUTLINE), [C.FOAM]: [214, 238, 246],
        [C.FLASH_OUT]: [255, 128, 32], [C.FLASH_MID]: [255, 214, 72], [C.FLASH_CORE]: [255, 252, 228],
        [C.CASING]: [232, 190, 80], [C.CASING_DK]: [170, 120, 40], [C.TRAIL]: [236, 240, 250], [C.SPLASH]: [250, 253, 255], [C.RING]: [206, 236, 246],
    };
    const WATER_RGB = [46, 104, 142];
    // Pixel de material debaixo d'água? (alfa < 255 num código de material/contorno)
    const isUnder = (code, a) => a < 255 && a > 0 && (code === C.OUTLINE || (code >= 8 && (code & 7) <= 4));

    // Parte da malha 3D (NpcGenMesh): cada ponto mistura o osso dele com o 2º osso que mais o influencia (skin linear). Devolve a parte
    // já posta no espaço do corpo (osso = identidade) — o resto do renderizador não muda. (O buffer é da parte: um quadro por vez.)
    const M4ID = G.M4();
    // cv = direção da câmera no espaço do corpo: ponto de costas (que o renderizador descarta) não mistura o 2º osso — só a posição
    // (a sombra no chão usa todos os pontos).
    function skinPose(bk, B, cv) {
        let o = bk._posed;
        if (!o) o = bk._posed = { name: bk.name, bone: bk.bone, group: bk.group, mat: bk.mat, tone: bk.tone, n: bk.n, pos: new Float32Array(bk.n * 3), nrm: new Float32Array(bk.n * 3) };
        const Ma = B[bk.bone], Ms = bk.bones2.map((b) => B[b]), P = bk.pos, N = bk.nrm, P2 = bk.pos2, N2 = bk.nrm2, b2 = bk.b2, w2 = bk.w2, OP = o.pos, ON = o.nrm;
        const A = Ma.R, at = Ma.t;
        for (let i = 0, k = 0; i < bk.n; i++, k += 3) {
            const x = P[k], y = P[k + 1], z = P[k + 2], a = N[k], b = N[k + 1], c = N[k + 2];
            let px = A[0] * x + A[1] * y + A[2] * z + at[0], py = A[3] * x + A[4] * y + A[5] * z + at[1], pz = A[6] * x + A[7] * y + A[8] * z + at[2];
            let nx = A[0] * a + A[1] * b + A[2] * c, ny = A[3] * a + A[4] * b + A[5] * c, nz = A[6] * a + A[7] * b + A[8] * c;
            const w = w2[i];
            if (w > 0 && nx * cv[0] + ny * cv[1] + nz * cv[2] < 0.6) {
                const Mb = Ms[b2[i]], R = Mb.R, t = Mb.t, u = 1 - w;
                const x2 = P2[k], y2 = P2[k + 1], z2 = P2[k + 2], a2 = N2[k], c1 = N2[k + 1], c2 = N2[k + 2];
                px = u * px + w * (R[0] * x2 + R[1] * y2 + R[2] * z2 + t[0]); py = u * py + w * (R[3] * x2 + R[4] * y2 + R[5] * z2 + t[1]); pz = u * pz + w * (R[6] * x2 + R[7] * y2 + R[8] * z2 + t[2]);
                nx = u * nx + w * (R[0] * a2 + R[1] * c1 + R[2] * c2); ny = u * ny + w * (R[3] * a2 + R[4] * c1 + R[5] * c2); nz = u * nz + w * (R[6] * a2 + R[7] * c1 + R[8] * c2);
                const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
                nx /= l; ny /= l; nz /= l;
            }
            OP[k] = px; OP[k + 1] = py; OP[k + 2] = pz; ON[k] = nx; ON[k + 1] = ny; ON[k + 2] = nz;
        }
        return o;
    }

    class Renderer {
        // baked = { body: {nome: parte assada}, props: {...} }; W×H = quadro; pivot = pés (px); charScale = escala da ficha × escala de saída.
        constructor(baked, cam, { W = 144, H = 144, pivot = [72, 110], ss = SS, charScale = 1.0 } = {}) {
            this.baked = baked; this.cam = cam; this.W = W; this.H = H; this.px = pivot[0]; this.py = pivot[1]; this.ss = ss;
            this.body = Object.values(baked.body);
            this.k = cam.scale * charScale;
            this.Rk = cam.R.map((v) => v * this.k);
        }

        // Buffers de trabalho reaproveitados entre quadros (z-buffer do quadro inteiro a 4×, sombra a 2×).
        _scratch(nsh) {
            const W = this.W, H = this.H, ss = this.ss, nsub = W * ss * H * ss;
            if (!this._zb) {
                this._zb = new Float64Array(nsub).fill(Infinity);
                this._wi = new Int16Array(nsub).fill(-1);            // item (parte/objeto) vencedor
                this._wl = new Int32Array(nsub);                     // índice do ponto dentro do item
            }
            if (!this._gx || this._gx.length < nsh) { this._gx = new Float64Array(nsh); this._gy = new Float64Array(nsh); }
        }

        // Um quadro: { code, alpha } (W×H). shadow = desenhar a sombra no chão.
        // (Uma passada só por ponto: corpo no mundo → câmera → z-buffer, sem guardar a nuvem transformada. Os mesmos números do
        // original, na mesma ordem: o resultado é idêntico pixel a pixel.)
        render(pose, yaw, shadow = true) {
            const sc0 = pose.scale || 1, W = this.W, H = this.H, ss = this.ss, R = this.cam.R, L = this.cam.L;
            const Rk = this._Rk = sc0 === 1 ? this.Rk : R.map((v) => v * this.k * sc0);
            const P = pose.adult ? pose.adult() : pose, B = P.B || pose.bones(), Ryaw = Rz(deg(yaw)), items = [];        // (esqueleto adulto: Pose.adult)
            const cv = G.tmv3(Ryaw, [R[6], R[7], R[8]]);
            for (const bk of this.body) items.push(bk.pos2 ? { bk: skinPose(bk, B, cv), M: M4ID } : { bk, M: B[bk.bone] });          // (malha 3D: skin de 2 ossos)
            for (const [name, Mp] of P.props) items.push({ bk: this.baked.props[name], M: Mp });
            let n = 0;
            for (const it of items) { it.R = mm3(Ryaw, it.M.R); it.t = mv3(Ryaw, it.M.t); n += it.bk.n; }
            const nsh = Math.ceil(n / 3);
            this._scratch(nsh);
            const zb = this._zb, wi = this._wi, wl = this._wl, gxs = this._gx, gys = this._gy, Wf = W * ss, Hf = H * ss;
            const code = new Uint8Array(W * H), alpha = new Uint8Array(W * H), depth = new Float64Array(W * H).fill(Infinity);
            const out = { code, alpha, W, H };
            const water = pose.water, hasW = water !== null && water !== undefined, wcut = hasW ? water - 10.0 : 0;
            const shk = shadow && pose.shadow && !hasW, ssc = this.k * sc0, sn = this.cam.sin;
            const R6 = R[6], R7 = R[7], R8 = R[8], pvx = this.px, pvy = this.py;
            const k0 = Rk[0], k1 = Rk[1], k2 = Rk[2], k3 = Rk[3], k4 = Rk[4], k5 = Rk[5], k6 = Rk[6], k7 = Rk[7], k8 = Rk[8];
            let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, kept = 0, g = 0;
            for (let ii = 0; ii < items.length; ii++) {
                const it = items[ii], Q = it.R, t = it.t, p = it.bk.pos, q = it.bk.nrm, cnt = it.bk.n;
                const a0 = Q[0], a1 = Q[1], a2 = Q[2], a3 = Q[3], a4 = Q[4], a5 = Q[5], a6 = Q[6], a7 = Q[7], a8 = Q[8], t0 = t[0], t1 = t[1], t2 = t[2];
                for (let i = 0; i < cnt; i++, g++) {
                    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
                    const wx = x * a0 + y * a1 + z * a2 + t0, wy = x * a3 + y * a4 + z * a5 + t1, wz = x * a6 + y * a7 + z * a8 + t2;
                    if (g % 3 === 0 && shk) { gxs[g / 3] = wx * ssc; gys[g / 3] = wy * sn * ssc; }
                    const na = q[i * 3], nb = q[i * 3 + 1], nc = q[i * 3 + 2];
                    const ncz = (na * a0 + nb * a1 + nc * a2) * R6 + (na * a3 + nb * a4 + nc * a5) * R7 + (na * a6 + nb * a7 + nc * a8) * R8;
                    if (!(ncz < 0.3)) continue;
                    if (hasW && !(wz > wcut)) continue;
                    const cx = wx * k0 + wy * k1 + wz * k2, cy = wx * k3 + wy * k4 + wz * k5, cz = wx * k6 + wy * k7 + wz * k8;
                    const xi = floor((pvx + cx) * ss), yi = floor((pvy - cy) * ss);
                    if (xi < 0 || xi >= Wf || yi < 0 || yi >= Hf) continue;
                    kept++;
                    if (xi < x0) x0 = xi; if (xi > x1) x1 = xi; if (yi < y0) y0 = yi; if (yi > y1) y1 = yi;
                    const lin = yi * Wf + xi;
                    if (cz < zb[lin]) { zb[lin] = cz; wi[lin] = ii; wl[lin] = i; }        // mais perto (menor z); empate = o primeiro
                }
            }
            if (!kept) return out;
            const bx0 = max(0, floor(x0 / ss) - 3), bx1 = min(W, floor(x1 / ss) + 4), by0 = max(0, floor(y0 / ss) - 3), by1 = min(H, floor(y1 / ss) + 4);
            const cw = bx1 - bx0, ch = by1 - by0;
            // por pixel: grupo dominante, cobertura, normal média, profundidade, material, tom
            const np_ = cw * ch;
            const F = new Uint8Array(np_), DOM = new Uint8Array(np_), ZZ = new Float64Array(np_), HH = new Float64Array(np_), MAT = new Uint8Array(np_);
            const IDX = new Int8Array(np_), DOT = new Float64Array(np_);
            const smooth = G.SHADE !== 'cel';                                      // (sombreado contínuo "pré-renderizado"; 'cel' = o do pacote)
            const NXa = smooth ? new Float32Array(np_) : null, NYa = smooth ? new Float32Array(np_) : null, NZa = smooth ? new Float32Array(np_) : null, TN = smooth ? new Float32Array(np_) : null;
            // Visual 3D (sem traços): pixel de borda com qualquer cobertura entra, e a fração coberta vira o alfa (borda suavizada — COV).
            const aa = smooth && !G.LINES, COV = aa ? new Uint8Array(np_) : null;
            const fillMin = aa ? 1 : (ss * ss) >> 1, weapMin = Math.ceil((ss * ss * 5) / 16);
            const gcount = new Float64Array(NG), mcount = new Int32Array(NM);
            const subI = new Int16Array(ss * ss), subL = new Int32Array(ss * ss), subZ = new Float64Array(ss * ss);
            for (let py = 0; py < ch; py++) for (let px = 0; px < cw; px++) {
                gcount.fill(0); mcount.fill(0);
                let filledN = 0, s = 0;
                for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
                    const lin = ((by0 + py) * ss + sy) * Wf + (bx0 + px) * ss + sx, w = wi[lin];
                    subI[s] = w; subL[s] = wl[lin]; subZ[s] = zb[lin]; s++;
                    if (w >= 0) { filledN++; gcount[items[w].bk.group]++; zb[lin] = Infinity; wi[lin] = -1; }       // (já limpa o z-buffer)
                }
                let dom = 0, best = -1;
                for (let k = 0; k < NG; k++) { const sc = gcount[k] * GROUP_W[k]; if (sc > best) { best = sc; dom = k; } }
                const domc = gcount[dom];
                const filled = filledN >= fillMin || (isWeaponGroup(dom) && domc >= weapMin);
                // sel = subpixels do grupo dominante (grupo 0 = vazio)
                let selc = 0, nx = 0, ny = 0, nz = 0, zs = 0, hs = 0;
                for (let k = 0; k < s; k++) {
                    const w = subI[k], g = w >= 0 ? items[w].bk.group : 0;
                    if (g !== dom) continue;
                    selc++;
                    if (w >= 0) {
                        const it = items[w], Q = it.R, l = subL[k], q = it.bk.nrm, p = it.bk.pos;
                        const na = q[l * 3], nb = q[l * 3 + 1], nc = q[l * 3 + 2];
                        const n0 = na * Q[0] + nb * Q[1] + nc * Q[2], n1 = na * Q[3] + nb * Q[4] + nc * Q[5], n2 = na * Q[6] + nb * Q[7] + nc * Q[8];
                        nx += Math.fround(n0 * R[0] + n1 * R[1] + n2 * R[2]); ny += Math.fround(n0 * R[3] + n1 * R[4] + n2 * R[5]); nz += Math.fround(n0 * R[6] + n1 * R[7] + n2 * R[8]);
                        zs += Math.fround(subZ[k]);
                        hs += Math.fround(p[l * 3] * Q[6] + p[l * 3 + 1] * Q[7] + p[l * 3 + 2] * Q[8] + it.t[2]);
                        mcount[it.bk.mat[l]]++;
                    }
                }
                const sc = max(selc, 1);
                const nl = max(sqrt(nx * nx + ny * ny + nz * nz), 1e-6);
                const zz = zs / sc, hh = hs / sc;
                let mat = 0, mb = 0;
                for (let k = 1; k < NM; k++) if (mcount[k] > mb) { mb = mcount[k]; mat = k; }
                for (const dm of DECALS) if (mcount[dm] >= DECAL_MIN[dm]) mat = dm;
                let tc = 0, ts = 0, tsa = 0;
                for (let k = 0; k < s; k++) {
                    const w = subI[k], it = w >= 0 ? items[w].bk : null, g = it ? it.group : 0;
                    if (g !== dom) continue;
                    const m = it ? it.mat[subL[k]] : 0, t = it ? it.tone[subL[k]] : 0;
                    tsa += t;
                    if (m === mat) { tc++; ts += t; }
                }
                const tone = tc > 0 ? ts / tc : tsa / sc;
                const i = py * cw + px;
                F[i] = filled ? 1 : 0; DOM[i] = dom; ZZ[i] = zz; HH[i] = hh; MAT[i] = mat;
                if (COV) COV[i] = filledN;
                const d = (nx / nl) * L[0] + (ny / nl) * L[1] + (nz / nl) * L[2];
                DOT[i] = d;
                IDX[i] = 1 + (d > -0.3) + (d > 0.3) + (d > 0.8) + rint(tone);
                if (smooth) { NXa[i] = nx / nl; NYa[i] = ny / nl; NZa[i] = nz / nl; TN[i] = tone; }
            }
            const at = (A, y, x) => A[((y % ch) + ch) % ch * cw + ((x % cw) + cw) % cw];
            if (smooth) return this._smooth(out, { F, DOM, ZZ, HH, MAT, NXa, NYa, NZa, TN, COV, sq: ss * ss, cw, ch, bx0, by0, np_, water, depth, effects: P.effects, Ryaw, nsh, pose, shadow });
            // ---------------- sombreamento: oclusão + materiais especiais
            for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
                const i = y * cw + x, zz = ZZ[i];
                let occ = 0;
                for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
                    if (!dy && !dx) continue;
                    const j = (((y - dy) % ch) + ch) % ch * cw + (((x - dx) % cw) + cw) % cw;
                    if ((F[j] ? ZZ[j] : Infinity) < zz - 2.6) occ++;
                }
                let idx = IDX[i] - (occ >= 6 ? 1 : 0);
                const m = MAT[i];
                if (m === M.eye) idx = 1;
                else if (m === M.eyew) idx = 3 + (DOT[i] > 0.0 ? 1 : 0);
                else if (m === M.brow) idx = 1;
                else if (m === M.mouth) idx = 1;
                else if (m === M.gold) idx = min(max(idx + 1, 2), 4);
                IDX[i] = min(max(idx, 0), 4);
            }
            // pixels "órfãos" (tom diferente dos 4 vizinhos iguais entre si, mesmo material)
            const IDX2 = Int8Array.from(IDX);
            for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
                const i = y * cw + x, m = MAT[i];
                if (!F[i] || isDecal[m]) continue;
                const xl = y * cw + (x - 1 + cw) % cw, xr = y * cw + (x + 1) % cw, yu = ((y - 1 + ch) % ch) * cw + x, yd = ((y + 1) % ch) * cw + x;
                const i0 = IDX[xl];
                if (MAT[xl] === m && MAT[xr] === m && MAT[yu] === m && MAT[yd] === m && IDX[xr] === i0 && IDX[yu] === i0 && IDX[yd] === i0 && i0 !== IDX[i]) IDX2[i] = i0;
            }
            // ---------------- linhas de contorno
            const LINE = new Uint8Array(np_), STRONG = new Uint8Array(np_);
            for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
                const i = y * cw + x;
                if (!F[i]) continue;
                const grp = DOM[i], zz = ZZ[i], m = MAT[i], nol = noLine[m];
                for (const [dy, dx] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
                    const j = (((y - dy) % ch) + ch) % ch * cw + (((x - dx) % cw) + cw) % cw;
                    if (!F[j]) continue;
                    const gap = zz - ZZ[j], diffg = DOM[j] !== grp;
                    const c1 = diffg && gap > 1.3, c2 = !diffg && gap > 5.0, c3 = !diffg && MAT[j] !== m && gap > 0.8 && !nol && !noLine[MAT[j]];
                    if (c1 || c2 || c3) LINE[i] = 1;
                    if ((c1 || c2) && gap > 3.5) STRONG[i] = 1;
                }
            }
            // ---------------- cor (código) + água + contorno externo
            const UNDER = new Uint8Array(np_), ABOVE = new Uint8Array(np_), AL = new Uint8Array(np_), CO = new Uint8Array(np_);
            const hasWater = water !== null && water !== undefined;
            for (let i = 0; i < np_; i++) {
                if (!F[i]) continue;
                CO[i] = STRONG[i] ? C.OUTLINE : (MAT[i] << 3) | (LINE[i] ? 0 : IDX2[i]);
                AL[i] = 255;
                if (hasWater && HH[i] < water - 0.6) {
                    UNDER[i] = 1;
                    const dw = min(max((water - HH[i]) / 8.0, 0), 1);
                    AL[i] = floor(200 - 150 * dw);
                } else ABOVE[i] = 1;
            }
            for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
                const i = y * cw + x;
                if (ABOVE[i]) continue;
                const dil = at(ABOVE, y, x - 1) || at(ABOVE, y, x + 1) || at(ABOVE, y - 1, x) || at(ABOVE, y + 1, x);
                if (!dil) continue;
                if (hasWater && UNDER[i]) { CO[i] = C.FOAM; AL[i] = 235; continue; }
                if (F[i]) continue;
                CO[i] = C.OUTLINE; AL[i] = 255; F[i] = 2;                     // (2 = contorno: entra na profundidade)
            }
            for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
                const i = y * cw + x, o = (by0 + y) * W + bx0 + x;
                code[o] = CO[i]; alpha[o] = AL[i];
                if (F[i]) depth[o] = ZZ[i];
            }
            // ---------------- efeitos
            for (const fx of P.effects) this._effect(code, alpha, depth, fx, Ryaw);
            // ---------------- sombra no chão
            if (shadow && pose.shadow && !hasWater) {
                const sh = this._shadow(nsh, pose);
                for (let i = 0; i < W * H; i++) if (sh[i] && alpha[i] === 0) { code[i] = C.SHADOW; alpha[i] = SHADOW_RGBA[3]; }
            }
            return out;
        }

        // Sombreado CONTÍNUO ("pré-renderizado", como os sprites de Donkey Kong Country): em vez de 5 tons por material e linhas pretas,
        // cada pixel ganha uma LUZ (0–255) que o jogo usa para andar pela rampa de cores do material (out.light):
        //   luz difusa com "wrap" (passagem suave para a sombra) + céu (de cima mais claro) + oclusão ambiente (dobras, axilas, entre
        //   as pernas escurecem) + luz de recorte nas bordas + o desenho das texturas (listras, costuras) + brilho especular por
        //   material (couro, cabelo, metal brilham; jeans e algodão não). Acima de 204 = além do tom mais claro (o brilho, quase branco).
        // Vincos entre partes (braço na frente do corpo) escurecem em vez de virar linha preta. Visual "3D" (G.LINES = false, o padrão):
        // SEM contorno preto — nem o externo nem os traços onde uma parte passa na frente da outra (viram sombra de contato macia) — e a
        // sombra no chão sai com borda suave (alfa em degradê). G.LINES = true volta aos traços do desenho cartunesco.
        _smooth(out, c) {
            const { F, DOM, ZZ, HH, MAT, NXa, NYa, NZa, TN, cw, ch, bx0, by0, np_, water, depth } = c;
            const W = this.W, code = out.code, alpha = out.alpha, light = out.light = new Uint8Array(W * this.H), L = this.cam.L, k = this.k;
            const UP = [0, this.cam.cos, -this.cam.sin], HV = nrm([L[0], L[1], L[2] - 1]), RIM = nrm([0.62, 0.42, 0.66]);
            const rad = max(2, Math.round(4 * k)), thr = 5.2 * k, nwin = (2 * rad + 1) * (2 * rad + 1) - 1, kk = k / 0.5;
            const idx = (y, x) => (((y % ch) + ch) % ch) * cw + (((x % cw) + cw) % cw);
            const LT = new Uint8Array(np_), LN = new Uint8Array(np_);
            for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
                const i = y * cw + x;
                if (!F[i]) continue;
                const m = MAT[i], nx = NXa[i], ny = NYa[i], nz = NZa[i], zz = ZZ[i], grp = DOM[i];
                if (isDecal[m]) LN[i] = 0;
                // oclusão ambiente: vizinhos bem mais perto da câmera (por cima/na frente deste pixel)
                let occ = 0;
                if (y >= rad && y < ch - rad && x >= rad && x < cw - rad) {         // (longe da borda: o mesmo vizinho, sem a volta por módulo)
                    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad, r = (y - dy) * cw + x; dx <= rad; dx++) {
                        if (!dy && !dx) continue;
                        const j = r - dx;
                        if (F[j] && ZZ[j] < zz - thr) occ++;
                    }
                } else for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
                    if (!dy && !dx) continue;
                    const j = idx(y - dy, x - dx);
                    if (F[j] && ZZ[j] < zz - thr) occ++;
                }
                const ao = 1 - min(0.58, max(0, occ / nwin - 0.05) * 1.45);          // (dobras, axilas e debaixo do queixo mais fundos)
                // linhas de desenho: borda de profundidade com o vizinho (outra parte na frente) → traço escuro fino (contorno); troca de
                // material com degrau (punho da manga, barra da camisa) → a cor mais escura do próprio material; degrau pequeno → vinco
                let crease = 1;
                for (const [dy, dx] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
                    const j = idx(y - dy, x - dx);
                    if (!F[j]) continue;
                    const gap = zz - ZZ[j], diffg = DOM[j] !== grp;
                    if ((diffg && gap > 0.7 * kk) || (!diffg && gap > 5.0 * kk)) LN[i] = gap > 3.5 * kk || !diffg ? 2 : max(LN[i], 1);
                    else if (MAT[j] !== m && gap > 0.8 * kk && !noLine[m] && !noLine[MAT[j]]) LN[i] = max(LN[i], 1);
                    else if (gap > 0.6 * kk) crease = min(crease, 0.86);
                }
                const d = nx * L[0] + ny * L[1] + nz * L[2];
                // (luz principal mais marcada e recorte nas bordas mais forte: o boneco "salta" do chão de longe)
                let dif = min(max((d + 0.32) / 1.32, 0), 1); dif = dif * dif * (3 - 2 * dif);
                const hemi = 0.5 + 0.5 * (nx * UP[0] + ny * UP[1] + nz * UP[2]);
                const fres = (1 - min(1, abs(nz))) ** 2.0, rim = fres * max(0, nx * RIM[0] + ny * RIM[1] + nz * RIM[2]) * 0.44;
                let lv = (0.07 + 0.17 * hemi + 0.8 * dif) * ao * crease + rim + 0.06 * TN[i];
                const S = SHINE[m];
                let sp = S ? max(0, nx * HV[0] + ny * HV[1] + nz * HV[2]) ** S[0] * S[1] * ao * crease : 0;
                if (m === M.eye) { lv = 0.08; sp = sp > 0.15 ? 0.9 : 0; }                // pupila escura com um brilho
                else if (m === M.eyew) lv = 0.6 + 0.25 * dif;
                else if (m === M.brow) { lv = 0.1; sp = 0; }
                else if (m === M.mouth) { lv = 0.32 * crease; sp = 0; }
                LT[i] = min(255, max(0, Math.round(min(lv, 0.97) * 204 + sp * 255)));          // (só o brilho passa do tom mais claro)
            }
            // cor (material + luz) + água + contorno externo
            const UNDER = new Uint8Array(np_), ABOVE = new Uint8Array(np_), AL = new Uint8Array(np_), CO = new Uint8Array(np_);
            const hasWater = water !== null && water !== undefined, lines = !!G.LINES;
            for (let i = 0; i < np_; i++) {
                if (!F[i]) continue;
                CO[i] = MAT[i] << 3;
                if (lines) {
                    if (LN[i] === 2 && !isDecal[MAT[i]]) CO[i] = C.OUTLINE;             // traço de contorno (parte na frente de outra)
                    else if (LN[i] === 1 && !isDecal[MAT[i]]) LT[i] = min(LT[i], 22);   // traço na cor escura do material
                } else if (!isDecal[MAT[i]]) {
                    if (LN[i] === 2) LT[i] = Math.round(LT[i] * 0.6);                   // parte na frente de outra: sombra de contato (sem traço)
                    else if (LN[i] === 1) LT[i] = Math.round(LT[i] * 0.84);             // troca de material com degrau: só um vinco leve
                }
                AL[i] = 255;
                if (hasWater && HH[i] < water - 0.6) {
                    UNDER[i] = 1;
                    const dw = min(max((water - HH[i]) / 8.0, 0), 1);
                    AL[i] = floor(200 - 150 * dw);
                } else ABOVE[i] = 1;
            }
            const at = (A, y, x) => A[idx(y, x)];
            for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
                const i = y * cw + x;
                if (ABOVE[i]) continue;
                const dil = at(ABOVE, y, x - 1) || at(ABOVE, y, x + 1) || at(ABOVE, y - 1, x) || at(ABOVE, y + 1, x);
                if (!dil) continue;
                if (hasWater && UNDER[i]) { CO[i] = C.FOAM; AL[i] = 235; continue; }
                if (F[i] || !lines) continue;
                CO[i] = C.OUTLINE; AL[i] = 255; F[i] = 2;
            }
            // luz em 64 níveis (bits altos) + cobertura da borda nos 2 bits baixos (0 = cheio, 1–3 = 75/50/25%: o jogo vira alfa)
            const COV = c.COV, sq = c.sq || 4;
            for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
                const i = y * cw + x, o = (by0 + y) * W + bx0 + x;
                const cv = COV && F[i] === 1 ? min(3, max(0, Math.round((1 - COV[i] / sq) * 4))) : 0;
                code[o] = CO[i]; alpha[o] = AL[i]; light[o] = (LT[i] & 0xfc) | cv;
                if (F[i]) depth[o] = ZZ[i];
            }
            for (const fx of c.effects) this._effect(code, alpha, depth, fx, c.Ryaw);
            if (c.shadow && c.pose.shadow && !hasWater) {
                if (lines) {
                    const sh = this._shadow(c.nsh, c.pose);
                    for (let i = 0; i < W * this.H; i++) if (sh[i] && alpha[i] === 0) { code[i] = C.SHADOW; alpha[i] = SHADOW_RGBA[3]; }
                } else {
                    const sh = this._shadow(c.nsh, c.pose, true), A = SHADOW_RGBA[3] * 1.2;
                    for (let i = 0; i < W * this.H; i++) if (sh[i] > 0.03 && alpha[i] === 0) { code[i] = C.SHADOW; alpha[i] = Math.min(255, Math.round(A * sh[i])); }
                }
            }
            return out;
        }

        // Sombra: a projeção vertical de um a cada 3 pontos do corpo (gx/gy, calculados na passada do render). soft = degradê 0..1 (borda
        // macia, mais escura onde o corpo se concentra) em vez da máscara recortada.
        _shadow(cnt, pose, soft = false) {
            const W = this.W, H = this.H, s2 = 2, gx = this._gx, gy = this._gy;
            const k = pose.shadowScale === undefined ? 1.0 : pose.shadowScale;
            if (k !== 1.0) {
                let mx = 0, my = 0;
                for (let j = 0; j < cnt; j++) { mx += gx[j]; my += gy[j]; }
                mx /= cnt; my /= cnt;
                for (let j = 0; j < cnt; j++) { gx[j] = mx + (gx[j] - mx) * k; gy[j] = my + (gy[j] - my) * k; }
            }
            const W2 = W * s2, H2 = H * s2, S2 = new Uint8Array(W2 * H2);
            let X0 = W2, X1 = -1, Y0 = H2, Y1 = -1;
            for (let j = 0; j < cnt; j++) {
                const X = floor((this.px + gx[j]) * s2), Y = floor((this.py - gy[j]) * s2);
                if (X >= 0 && X < W2 && Y >= 0 && Y < H2) { S2[Y * W2 + X] = 1; if (X < X0) X0 = X; if (X > X1) X1 = X; if (Y < Y0) Y0 = Y; if (Y > Y1) Y1 = Y; }
            }
            // Atalho (o mesmo resultado, bit a bit): cada passada de desfoque espalha 1 px; se a mancha, alargada pelo número de passadas,
            // não encosta na borda do quadro, a volta (np.roll) só leria zeros — desfoca só essa janela, sem módulo.
            const np = soft ? 1 + Math.max(2, Math.round(3 * this.k / 0.5)) : 1;
            const xa = (X0 >> 1) - np, xb = (X1 >> 1) + np, ya = (Y0 >> 1) - np, yb = (Y1 >> 1) + np;
            if (X1 >= 0 && xa >= 1 && ya >= 1 && xb <= W - 2 && yb <= H - 2) return this._shadowWin(S2, W2, xa, xb, ya, yb, np, soft);
            let S = new Float32Array(W * H);
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) S[y * W + x] = (S2[y * 2 * W2 + x * 2] + S2[y * 2 * W2 + x * 2 + 1] + S2[(y * 2 + 1) * W2 + x * 2] + S2[(y * 2 + 1) * W2 + x * 2 + 1]) / 4;
            // desfoque [1 2 1] (com volta, como o np.roll) em y e depois em x
            let T = new Float32Array(W * H);
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) T[y * W + x] = (S[((y - 1 + H) % H) * W + x] + S[y * W + x] * 2 + S[((y + 1) % H) * W + x]) / 4;
            S = new Float32Array(W * H);
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) S[y * W + x] = (T[y * W + (x - 1 + W) % W] + T[y * W + x] * 2 + T[y * W + (x + 1) % W]) / 4;
            if (soft) {
                // mais 3 passadas de desfoque (raio proporcional à resolução) e uma curva: núcleo cheio, borda que some aos poucos
                const n = Math.max(2, Math.round(3 * this.k / 0.5));
                for (let p = 0; p < n; p++) {
                    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) T[y * W + x] = (S[((y - 1 + H) % H) * W + x] + S[y * W + x] * 2 + S[((y + 1) % H) * W + x]) / 4;
                    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) S[y * W + x] = (T[y * W + (x - 1 + W) % W] + T[y * W + x] * 2 + T[y * W + (x + 1) % W]) / 4;
                }
                for (let i = 0; i < W * H; i++) { const v = Math.min(1, S[i] / 0.42); S[i] = v * v * (3 - 2 * v); }
                return S;
            }
            return this._shadowMask(S);
        }
        _shadowMask(S) {
            const W = this.W, H = this.H, m = new Uint8Array(W * H), out = new Uint8Array(W * H);
            for (let i = 0; i < W * H; i++) m[i] = S[i] > 0.16 ? 1 : 0;
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                out[y * W + x] = m[y * W + x] | m[y * W + (x - 1 + W) % W] | m[y * W + (x + 1) % W] | m[((y - 1 + H) % H) * W + x] | m[((y + 1) % H) * W + x];
            }
            return out;
        }
        // _shadow só na janela [xa, xb] × [ya, yb] (dentro de 1..W−2 × 1..H−2): as mesmas contas, na mesma ordem, de cada pixel; fora dela
        // tudo fica 0, como na conta do quadro inteiro. np = número de passadas (1 + as do degradê).
        _shadowWin(S2, W2, xa, xb, ya, yb, np, soft) {
            const W = this.W, H = this.H, S = new Float32Array(W * H), T = new Float32Array(W * H);
            for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) S[y * W + x] = (S2[y * 2 * W2 + x * 2] + S2[y * 2 * W2 + x * 2 + 1] + S2[(y * 2 + 1) * W2 + x * 2] + S2[(y * 2 + 1) * W2 + x * 2 + 1]) / 4;
            for (let p = 0; p < np; p++) {
                for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) T[y * W + x] = (S[(y - 1) * W + x] + S[y * W + x] * 2 + S[(y + 1) * W + x]) / 4;
                for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) S[y * W + x] = (T[y * W + x - 1] + T[y * W + x] * 2 + T[y * W + x + 1]) / 4;
            }
            if (!soft) return this._shadowMask(S);
            for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) { const i = y * W + x, v = Math.min(1, S[i] / 0.42); S[i] = v * v * (3 - 2 * v); }
            return S;
        }

        // Escala dos efeitos desenhados em px (clarão, respingos): acompanha a resolução do atlas (o pacote original: 1).
        _fxk() { return G.SHADE === 'cel' ? 1 : this.k / 0.5; }

        project(p, Ryaw) {
            const q = mv3(Ryaw, p), Rk = this._Rk || this.Rk;
            const cx = q[0] * Rk[0] + q[1] * Rk[1] + q[2] * Rk[2], cy = q[0] * Rk[3] + q[1] * Rk[4] + q[2] * Rk[5], cz = q[0] * Rk[6] + q[1] * Rk[7] + q[2] * Rk[8];
            return [this.px + cx, this.py - cy, cz];
        }

        _effect(code, alpha, depth, fx, Ryaw) {
            const W = this.W, H = this.H;
            const set = (x, y, c, a) => { const o = y * W + x; code[o] = c; alpha[o] = a; };
            if (fx.type === 'flash') {
                const [sx, sy, sz] = this.project(fx.pos, Ryaw);
                const v = mv3(this.cam.R, mv3(Ryaw, nrm(fx.dir)));
                let vx = v[0], vy = -v[1];
                const l2 = Math.hypot(vx, vy), size = (fx.size || 1.0) * this._fxk();          // (o clarão acompanha a resolução)
                if (l2 < 0.25) { vx = 0; vy = 0; } else { vx /= l2; vy /= l2; }
                const Lf = 7.0 * size * max(l2, 0.35), Rr = trunc(Lf + 6), v_ = fx.variant || 0, wob = v_ ? 0.6 : 0.0;
                const cx = trunc(sx), cy = trunc(sy);
                const layers = [[], [], []];
                for (let yy = cy - Rr; yy <= cy + Rr; yy++) for (let xx = cx - Rr; xx <= cx + Rr; xx++) {
                    const ex = xx + 0.5 - sx, ey = yy + 0.5 - sy;
                    const ax = ex * vx + ey * vy, bx = -ex * vy + ey * vx, rr = Math.hypot(ex, ey);
                    const main = ax > -1.0 && ax < Lf && abs(bx) < (1.0 + 2.6 * size) * (1 - max(ax, 0) / max(Lf, 1e-3)) + 0.6;
                    const side = abs(ax - Lf * (0.35 + 0.1 * v_)) < 1.0 && abs(bx) < 3.2 * size + wob;
                    const burst = rr < 2.6 * size + 0.6;
                    const shape = main || side || burst;
                    if (!shape) continue;
                    const core = rr < 1.6 * size + 0.4 || (main && abs(bx) < 0.9 && ax < Lf * 0.55);
                    const mid = rr < 2.6 * size + 0.4 || (main && abs(bx) < 1.8 * size && ax < Lf * 0.8);
                    layers[0].push(xx, yy); if (mid) layers[1].push(xx, yy); if (core) layers[2].push(xx, yy);
                }
                [C.FLASH_OUT, C.FLASH_MID, C.FLASH_CORE].forEach((c, li) => {
                    const L = layers[li];
                    for (let k = 0; k < L.length; k += 2) {
                        const x = L[k], y = L[k + 1];
                        if (x < 0 || x >= W || y < 0 || y >= H) continue;
                        if (depth[y * W + x] > sz - 1.0) set(x, y, c, 255);
                    }
                });
            } else if (fx.type === 'casing') {
                const [sx, sy, sz] = this.project(fx.pos, Ryaw), x = trunc(sx), y = trunc(sy);
                for (const [dx, dy, c] of [[0, 0, C.CASING], [1, 0, C.CASING_DK]]) {
                    const xx = x + dx, yy = y + dy;
                    if (xx >= 0 && xx < W && yy >= 0 && yy < H && depth[yy * W + xx] > sz - 0.5) set(xx, yy, c, 255);
                }
            } else if (fx.type === 'ring') {
                const [cx, cy] = this.project(fx.pos || [0, 0, 0], Ryaw), r = fx.r * this.k, ry = r * this.cam.sin;
                const N = trunc(8 * r) + 16, gaps = fx.gaps || 0, a = fx.alpha === undefined ? 170 : fx.alpha, ph = fx.phase || 0;
                const pts = [];
                for (let i = 0; i < N; i++) {
                    const ang = i * ((2 * Math.PI) / N);
                    if (gaps && ((floor((ang / (2 * Math.PI)) * gaps * 2 + ph * 2) % 2) + 2) % 2 !== 0) continue;
                    pts.push(floor(cx + r * Math.cos(ang)), floor(cy + ry * Math.sin(ang)));
                }
                const free = pts.map((_, k) => k % 2 === 0 && pts[k] >= 0 && pts[k] < W && pts[k + 1] >= 0 && pts[k + 1] < H && alpha[pts[k + 1] * W + pts[k]] < 200);
                for (let k = 0; k < pts.length; k += 2) if (free[k]) { const o = pts[k + 1] * W + pts[k]; code[o] = C.RING; alpha[o] = max(alpha[o], a); }
            } else if (fx.type === 'trail') {
                const pts = fx.pts.map((q) => this.project(q, Ryaw)), n = pts.length;
                for (let k = 0; k < n - 1; k++) {
                    const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
                    const steps = trunc(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1;
                    for (let st = 0; st <= steps; st++) {
                        const u = st / steps, x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u, f = (k + u) / (n - 1);
                        const a = trunc(50 + 160 * f), w = f < 0.5 ? 1 : 2;
                        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]].slice(0, w + 1)) {
                            const xi = trunc(x) + dx, yi = trunc(y) + dy;
                            if (xi >= 0 && xi < W && yi >= 0 && yi < H && alpha[yi * W + xi] < 250) { const o = yi * W + xi; code[o] = C.TRAIL; alpha[o] = max(alpha[o], a); }
                        }
                    }
                }
            } else if (fx.type === 'splash') {
                const kk = this._fxk(), [sx, sy] = this.project(fx.pos, Ryaw), R = G.rngFor(fx.seed || 0), n = Math.round((fx.n || 7) * kk), sp = (fx.spread || 3.0) * kk;
                for (let i = 0; i < n; i++) {
                    const dx = R.normal(0, sp), dy = R.normal(0, sp * 0.6) - abs(R.normal(0, 1.2));
                    const x = trunc(sx + dx), y = trunc(sy + dy);
                    if (x >= 0 && x < W && y >= 0 && y < H && alpha[y * W + x] < 255) set(x, y, i % 3 ? C.FOAM : C.SPLASH, 230);
                }
            }
        }
    }

    // Cor de uma luz (0–255) na rampa de 5 tons do material — a mesma conta do shader do jogo (NpcArt): 0–204 anda pela rampa,
    // acima disso mistura o tom mais claro com quase-branco (o brilho especular).
    const HL = 0.65;
    function shadeRamp(ramp, l) {
        const t = (min(l, 204) / 204) * 4, i0 = floor(t), i1 = min(4, i0 + 1), f = t - i0, a = ramp[min(4, i0)], b = ramp[i1];
        let r = a[0] + (b[0] - a[0]) * f, g = a[1] + (b[1] - a[1]) * f, bl = a[2] + (b[2] - a[2]) * f;
        if (l > 204) {
            const h = (l - 204) / 51, top = ramp[4];
            r += (top[0] + (255 - top[0]) * HL - r) * h; g += (top[1] + (255 - top[1]) * HL - g) * h; bl += (top[2] + (255 - top[2]) * HL - bl) * h;
        }
        return [Math.round(r), Math.round(g), Math.round(bl)];
    }
    // Pixel do atlas (2 bytes). Sombreado contínuo (formato 2): material → [material×8 + água (0 = seco, 1–4 = submerso), luz];
    // código fixo (sombra, contorno, clarão…) → [código, alfa]. Transparente = [0, 0].
    const isSpecial = (c) => c < 8 || (c & 7) > 4;
    function packPx(c, a, l) {
        if (!a) return [0, 0];
        if (isSpecial(c)) return [c, a];
        const w = a >= 255 ? 0 : 1 + min(3, max(0, Math.round((200 - a) / 50)));
        return [(c & ~7) | w, l & 0xff];          // (luz em 64 níveis nos bits altos + cobertura da borda nos 2 baixos — ver _smooth)
    }
    const covA = (b1) => 1 - (b1 & 3) * 0.25;   // fração coberta de um pixel de borda (sombreado contínuo)
    function unpackPx(b0, b1) {
        if (isSpecial(b0)) return { code: b0, alpha: b1, light: 0 };
        const w = b0 & 7;
        return { code: b0 & ~7, alpha: Math.round((w ? 200 - ((w - 1) / 3) * 150 : 255) * covA(b1)), light: b1 };
    }

    // RGBA de um quadro (prévia/validação) com as rampas de uma ficha: ramps[material] = 5 cores '#rrggbb'.
    function colorize(fr, ramps, into = null, ox = 0, oy = 0, stride = 0) {
        const W = fr.W, H = fr.H, out = into || new Uint8ClampedArray(W * H * 4), S = stride || W;
        const R = {};
        for (const k of Object.keys(ramps)) R[k] = ramps[k].map(hexrgb);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x, a = fr.alpha[i];
            if (!a) continue;
            const c = fr.code[i], o = ((oy + y) * S + ox + x) * 4;
            let rgb;
            const ramp = R[c >> 3] || [[255, 0, 255], [255, 0, 255], [255, 0, 255], [255, 0, 255], [255, 0, 255]];
            let ao = a;
            if (c < 8 || (c & 7) > 4) rgb = SPECIAL[c] || [255, 0, 255];
            else if (fr.light) { rgb = shadeRamp(ramp, fr.light[i] & 0xfc); ao = Math.round(a * covA(fr.light[i])); }
            else rgb = ramp[c & 7];
            if (isUnder(c, a)) {
                const dw = (200 - a) / 150, mf = 0.45 + 0.45 * dw;
                rgb = rgb.map((v, k) => floor(v * (1 - mf) + WATER_RGB[k] * mf));
            }
            out[o] = rgb[0]; out[o + 1] = rgb[1]; out[o + 2] = rgb[2]; out[o + 3] = ao;
        }
        return out;
    }

    // Gerador com semente para efeitos (respingos).
    G.rngFor = (seed) => {
        let a = (seed * 2654435761) >>> 0 || 1;
        const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        return { normal: (mu, sd) => mu + sd * sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u()) };
    };

    Object.assign(G, { Renderer, colorize, shadeRamp, packPx, unpackPx, isSpecial, CODE: C, SPECIAL, WATER_RGB, isUnder, SS });
    return G;
}
