// ============================================================================
// CharRender — desenha UM quadro de personagem visto de cima, no estilo vetorial dos carros (degradê suave, contorno escuro fino,
// brilho no alto), a partir das MESMAS primitivas do rig do jogo (CharacterRig.build: esferas, elipsoides, cápsulas e caixas).
// Antes: SpriteBaker → pixel art em 5 tons, luz do noroeste, 8/16 direções. Agora: um quadro olhando para a frente (+Z = topo da
// imagem), luz de cima (o sombreamento não depende da direção: o jogo GIRA o sprite) e anti-serrilhado por supersampling.
//
// Saída por quadro (RGBA): R = slot do material × 16 (pele, cabelo, camisa…; a cor vem da paleta da variante no shader),
// G = luminosidade × alfa (0,5 = cor base; abaixo escurece até o preto, acima clareia até o branco), B = 0, A = cobertura.
// A sombra no chão NÃO entra no desenho: o shader a faz deslocando a silhueta para o sudeste (ela não gira com o boneco).
// ============================================================================

const CharRender = {
    PPU: 32,           // px por metro no atlas (o jogo desenha a 20 px/m: folga para girar sem serrilhar)
    SS: 3,             // supersampling (3×3 amostras por pixel)

    // Brilho especular por material (metal brilha mais; pele e cabelo, pouco).
    SPEC: { 1: 0.22, 2: 0.18, 3: 0.3, 4: 0.22, 5: 0.35, 6: 0.3, 7: 0.7, 8: 0.25, 9: 0.3, 10: 0.45, 11: 0.6, 12: 0.22, 13: 0, 14: 0.15 },

    // Caixa (x0, z0, x1, z1) em metros que contém todas as primitivas.
    _bounds(prims) {
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        const add = (x, z, r) => { if (x - r < x0) x0 = x - r; if (x + r > x1) x1 = x + r; if (z - r < z0) z0 = z - r; if (z + r > z1) z1 = z + r; };
        for (const p of prims) {
            if (p.t === 's') add(p.c[0], p.c[2], p.r);
            else if (p.t === 'c') { add(p.a[0], p.a[2], p.r); add(p.b[0], p.b[2], p.r); }
            else if (p.t === 'e') add(p.c[0], p.c[2], Math.max(p.r[0], p.r[2]));
            else add(p.c[0], p.c[2], hypot(p.h[0], p.h[2]));
        }
        return { x0, z0, x1, z1 };
    },

    // prims → { w, h, ox, oz, data } com a caixa justa: (ox, oz) = canto superior esquerdo em px do atlas relativo à origem do
    // personagem (x para a direita, z para cima). `fixed`: caixa em px já decidida (quadros que serão comparados, ex.: bolsas).
    render(prims, fixed = null) {
        const PPU = this.PPU, SS = this.SS, Q = PPU * SS;
        let bx;
        if (fixed) bx = fixed;
        else {
            const b = this._bounds(prims), m = 2;                                  // +2 px para o contorno
            bx = { l: Math.floor(b.x0 * PPU) - m, r: Math.ceil(b.x1 * PPU) + m, t: Math.ceil(b.z1 * PPU) + m, b: Math.floor(b.z0 * PPU) - m };
        }
        const W = (bx.r - bx.l) * SS, H = (bx.t - bx.b) * SS, N = W * H;
        const depth = new Float32Array(N).fill(-1e9), mat = new Uint8Array(N), ny = new Float32Array(N), flat = new Uint8Array(N);
        // coordenadas do centro da subamostra (i, j) em metros
        const X = (i) => (bx.l * SS + i + 0.5) / Q, Z = (j) => (bx.t * SS - j - 0.5) / Q;
        const put = (k, y, n, m, f) => { if (y <= depth[k]) return; depth[k] = y; mat[k] = m; ny[k] = n; flat[k] = f ? 1 : 0; };
        const span = (x, z, r) => ({
            i0: Math.max(0, Math.floor((x - r) * Q - bx.l * SS)), i1: Math.min(W - 1, Math.ceil((x + r) * Q - bx.l * SS)),
            j0: Math.max(0, Math.floor(bx.t * SS - (z + r) * Q)), j1: Math.min(H - 1, Math.ceil(bx.t * SS - (z - r) * Q)),
        });
        const sphere = (cx, cy, cz, r, m, f) => {
            const s = span(cx, cz, r), r2 = r * r;
            for (let j = s.j0; j <= s.j1; j++) {
                const dz = Z(j) - cz;
                for (let i = s.i0; i <= s.i1; i++) {
                    const dx = X(i) - cx, d2 = dx * dx + dz * dz;
                    if (d2 > r2) continue;
                    const dy = Math.sqrt(r2 - d2);
                    put(j * W + i, cy + dy, dy / r, m, f);
                }
            }
        };
        for (const p of prims) {
            if (p.t === 's') sphere(p.c[0], p.c[1], p.c[2], p.r, p.mat, p.flat);
            else if (p.t === 'c') {
                const a = p.a, b = p.b, len = hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
                const n = Math.max(2, Math.ceil(len / (p.r * 0.2)));
                for (let k = 0; k <= n; k++) { const t = k / n; sphere(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, p.r, p.mat, p.flat); }
            } else if (p.t === 'e') {
                const s = span(p.c[0], p.c[2], Math.max(p.r[0], p.r[2])), rot = p.rot || 0, sn = -Math.sin(rot), cs = Math.cos(rot);
                for (let j = s.j0; j <= s.j1; j++) {
                    const dz = Z(j) - p.c[2];
                    for (let i = s.i0; i <= s.i1; i++) {
                        const dx = X(i) - p.c[0], lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
                        const u = lx / p.r[0], w = lz / p.r[2], q = u * u + w * w;
                        if (q > 1) continue;
                        const v = Math.sqrt(1 - q), gx = u / p.r[0], gy = v / p.r[1], gz = w / p.r[2];
                        put(j * W + i, p.c[1] + p.r[1] * v, gy / (Math.sqrt(gx * gx + gy * gy + gz * gz) || 1), p.mat, p.flat);
                    }
                }
            } else {
                const s = span(p.c[0], p.c[2], hypot(p.h[0], p.h[2])), rot = p.rot || 0, sn = -Math.sin(rot), cs = Math.cos(rot);
                const bv = Math.min(p.bevel, p.h[0], p.h[1], p.h[2]), ix = p.h[0] - bv, iz = p.h[2] - bv;
                for (let j = s.j0; j <= s.j1; j++) {
                    const dz = Z(j) - p.c[2];
                    for (let i = s.i0; i <= s.i1; i++) {
                        const dx = X(i) - p.c[0], lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
                        const cx = lx < -ix ? -ix : (lx > ix ? ix : lx), cz = lz < -iz ? -iz : (lz > iz ? iz : lz);
                        const ox = lx - cx, oz = lz - cz, dist = Math.sqrt(ox * ox + oz * oz);
                        if (dist > bv) continue;
                        const dy = Math.sqrt(Math.max(0, bv * bv - dist * dist));
                        put(j * W + i, p.c[1] + p.h[1] - bv + dy, bv > 1e-6 ? dy / bv : 1, p.mat, p.flat);
                    }
                }
            }
        }

        // ---- sombreamento por subamostra: domo (luz de cima) + oclusão pela altura + brilho; contorno nas bordas e nos contatos
        const L = new Float32Array(N), cov = new Uint8Array(N), out = new Uint8Array(N);
        const R = SS;                                                        // largura do contorno: ~1 px de saída
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
            const k = j * W + i, m = mat[k];
            if (m) {
                const d = depth[k];
                let edge = false;                                            // vizinho bem mais alto = contato (linha escura)
                for (const [di, dj] of [[R, 0], [-R, 0], [0, R], [0, -R]]) {
                    const ii = i + di, jj = j + dj;
                    if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
                    const kk = jj * W + ii, mm = mat[kk];
                    if (mm && depth[kk] - d > (mm !== m ? 0.22 : 0.5)) { edge = true; break; }
                }
                let v;
                if (flat[k]) v = m === 13 ? 0.82 : 0.4;                      // clarão do tiro aceso; poça/espuma lisa
                else if (edge) v = 0.15;
                else {
                    const n = ny[k], s = (0.48 + 0.52 * Math.pow(n, 0.65)) * (0.8 + 0.2 * Math.min(1, Math.max(0, d / 1.9)));
                    const h = Math.pow(n, 26) * (this.SPEC[m] || 0.25);
                    v = h > 0.02 ? 0.5 + 0.5 * h : 0.5 * s;
                }
                L[k] = v; cov[k] = 1; out[k] = m;
            } else {
                // contorno externo: a peça mais alta num raio de ~1 px empresta o material (mais escuro)
                let best = -1e9, bm = 0;
                for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
                    if (di * di + dj * dj > R * R) continue;
                    const ii = i + di, jj = j + dj;
                    if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
                    const kk = jj * W + ii;
                    if (mat[kk] && !flat[kk] && depth[kk] > best) { best = depth[kk]; bm = mat[kk]; }
                }
                if (bm) { L[k] = 0.12; cov[k] = 1; out[k] = bm; }
            }
        }

        // ---- reduz SS×SS → 1 px: alfa = cobertura, luminosidade = média, material = o mais frequente
        const w = W / SS, h = H / SS, data = new Uint8Array(w * h * 4), cnt = new Uint8Array(16);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            let c = 0, sum = 0; cnt.fill(0);
            for (let sj = 0; sj < SS; sj++) for (let si = 0; si < SS; si++) {
                const k = (y * SS + sj) * W + x * SS + si;
                if (!cov[k]) continue;
                c++; sum += L[k]; cnt[out[k]]++;
            }
            if (!c) continue;
            let bm = 0; for (let q = 1; q < 16; q++) if (cnt[q] > cnt[bm]) bm = q;
            const a = c / (SS * SS), o = (y * w + x) * 4;
            data[o] = bm * 16; data[o + 1] = Math.round((sum / c) * a * 255); data[o + 3] = Math.round(a * 255);
        }
        return { w, h, ox: bx.l, oz: bx.t, data, box: bx };
    },

    // Recorta a caixa justa (pixels com alfa) e espalha o material 1 px para fora (a borda filtrada lê o material vizinho certo).
    crop(f) {
        const { w, h, data } = f;
        let x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (x1 < 0) return { w: 0, h: 0, ox: f.ox, oz: f.oz, data: new Uint8Array(0) };
        x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(w - 1, x1 + 1); y1 = Math.min(h - 1, y1 + 1);
        const W = x1 - x0 + 1, H = y1 - y0 + 1, d = new Uint8Array(W * H * 4);
        for (let y = 0; y < H; y++) d.set(data.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x1 + 1) * 4), y * W * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {                 // material nos transparentes vizinhos
            const o = (y * W + x) * 4;
            if (d[o + 3]) continue;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const xx = x + dx, yy = y + dy;
                if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
                const oo = (yy * W + xx) * 4;
                if (d[oo + 3]) { d[o] = d[oo]; break; }
            }
        }
        return { w: W, h: H, ox: f.ox + x0, oz: f.oz - y0, data: d };
    },

    // Diferença entre o quadro COM e SEM bolsa (mesma caixa): só os pixels que mudaram, já com a oclusão certa (braço por cima
    // da alça etc.). O jogo desenha isso por cima do boneco.
    diff(withBag, noBag) {
        const n = withBag.w * withBag.h, d = new Uint8Array(n * 4);
        for (let i = 0; i < n; i++) {
            const o = i * 4, A = withBag.data, B = noBag.data;
            if (A[o] === B[o] && A[o + 1] === B[o + 1] && A[o + 3] === B[o + 3]) continue;
            d[o] = A[o]; d[o + 1] = A[o + 1]; d[o + 3] = A[o + 3];
            if (A[o + 3] < 255 && B[o + 3] > A[o + 3]) { d[o + 1] = Math.round(A[o + 1] / Math.max(1, A[o + 3]) * 255); d[o + 3] = 255; }   // (cobre o corpo inteiro no pixel)
        }
        return { w: withBag.w, h: withBag.h, ox: withBag.ox, oz: withBag.oz, data: d };
    },

    // Mesma conta do shader do jogo, para a pré-visualização: { w, h, data } → ImageData pintada com a variante `v` (paleta RGB por slot).
    colorize(f, slotColors) {
        const img = new ImageData(Math.max(1, f.w), Math.max(1, f.h));
        for (let i = 0; i < f.w * f.h; i++) {
            const o = i * 4, a = f.data[o + 3] / 255;
            if (!a) continue;
            const base = slotColors[Math.round(f.data[o] / 16)] || [255, 0, 255], l = f.data[o + 1] / 255 / a;
            for (let k = 0; k < 3; k++) img.data[o + k] = l < 0.5 ? base[k] * l * 2 : base[k] + (255 - base[k]) * (l * 2 - 1);
            img.data[o + 3] = a * 255;
        }
        return img;
    },
};
