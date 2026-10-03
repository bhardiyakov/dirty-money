// ============================================================================
// SpriteBaker — "pré-renderiza" modelos 3D simples em sprites pixel art vistos
// de cima, no estilo Donkey Kong Country (que também era 3D pré-renderizado):
//   - modelo = esferas, elipsoides, cápsulas e caixas arredondadas;
//   - z-buffer ortográfico olhando para -Y (câmera top-down);
//   - sombreamento em 5 tons (contorno/sombra/base/luz/brilho) com a luz
//     vindo do noroeste (canto superior esquerdo da tela);
//   - contorno escuro externo + contato escuro onde uma peça cobre outra;
//   - sombra projetada no chão (no mesmo sentido da luz do mundo).
//
// A saída é INDEXADA: cada pixel guarda (rampa, nível). A cor final vem de uma
// paleta no shader => 1 atlas serve a todos os NPCs (troca de roupa/pele/cabelo).
//
// Convenção de mundo do modelo: +Y cima, +Z norte (topo da imagem), +X leste.
// Modelos são desenhados olhando para +Z; `heading` gira em torno de Y
// (mesma convenção do jogo: heading = atan2(x, z)).
// ============================================================================

const SpriteBaker = {
    // Luz: de onde ela VEM (noroeste e bem alta), coerente com Config.light.sunDir.
    LIGHT: (() => {
        const d = Config.light.sunDir;
        const l = [-d[0], -d[1], -d[2]];
        const m = Math.hypot(l[0], l[1], l[2]);
        return [l[0] / m, l[1] / m, l[2] / m];
    })(),

    // Marca de pixel de sombra projetada no atlas (o shader a pinta translúcida).
    SHADOW_RAMP: 255,
    SHADOW_LEN: 0.3,

    // Níveis de sombreamento (índice na rampa de 5 tons).
    L_OUTLINE: 0, L_SHADOW: 1, L_BASE: 2, L_LIGHT: 3, L_HI: 4,

    // Buffers de trabalho reaproveitados entre bakes (por tamanho).
    _scratch: {},

    // ------------------------------------------------------------- primitivas
    // Cada primitiva: { t, mat, ... }.  mat = índice de rampa (1..254).
    //   sphere:    { c:[x,y,z], r }
    //   ellipsoid: { c, r:[rx,ry,rz], rot }          (rot = giro em Y)
    //   capsule:   { a:[..], b:[..], r }             (esferas ao longo do segmento)
    //   box:       { c, h:[hx,hy,hz], rot, bevel }   (caixa de topo arredondado)
    sphere(mat, c, r, o = {}) { return Object.assign({ t: 's', mat, c, r }, o); },
    ellipsoid(mat, c, r, rot = 0, o = {}) { return Object.assign({ t: 'e', mat, c, r, rot }, o); },
    capsule(mat, a, b, r, o = {}) { return Object.assign({ t: 'c', mat, a, b, r }, o); },
    box(mat, c, h, rot = 0, bevel = 0.08, o = {}) { return Object.assign({ t: 'b', mat, c, h, rot, bevel }, o); },

    // Gira um ponto [x,y,z] em torno de Y por `a` (convenção LH do Babylon).
    _rotY(p, a) {
        const s = Math.sin(a), c = Math.cos(a);
        return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
    },

    // ------------------------------------------------------------------- bake
    // prims: lista de primitivas | opts: { size, ppu, heading, shadow, outline }
    // Retorna Uint8Array RGBA (size×size): R = rampa, G = nível, B = 0, A = 255|0.
    bake(prims, { size = 64, ppu = Config.art.ppu, heading = 0, shadow = true, outline = true, shadowLen = this.SHADOW_LEN } = {}) {
        const N = size;
        const NN = N * N;
        let sc = this._scratch[N];
        if (!sc) sc = this._scratch[N] = { depth: new Float32Array(NN), mat: new Uint8Array(NN), lvl: new Float32Array(NN) };
        const { depth, mat, lvl } = sc;
        depth.fill(-1e9);
        mat.fill(0);
        const half = N / 2;
        const L = this.LIGHT;
        const hs = Math.sin(heading), hc = Math.cos(heading);

        // Rotaciona tudo para o `heading` (e expande cápsulas em esferas).
        const spheres = [], ells = [], boxes = [];
        const rotP = (p) => [p[0] * hc + p[2] * hs, p[1], -p[0] * hs + p[2] * hc];
        for (const p of prims) {
            if (p.t === 'c') {
                const a = rotP(p.a), b = rotP(p.b);
                const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
                const n = Math.max(2, Math.ceil(len / (p.r * 0.32)));
                for (let i = 0; i <= n; i++) {
                    const t = i / n;
                    spheres.push({ mat: p.mat, x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, z: a[2] + (b[2] - a[2]) * t, r: p.r, flat: p.flat });
                }
            } else if (p.t === 's') {
                const c = rotP(p.c);
                spheres.push({ mat: p.mat, x: c[0], y: c[1], z: c[2], r: p.r, flat: p.flat });
            } else if (p.t === 'e') {
                const c = rotP(p.c), rot = (p.rot || 0) + heading;
                ells.push({ mat: p.mat, x: c[0], y: c[1], z: c[2], rx: p.r[0], ry: p.r[1], rz: p.r[2], s: Math.sin(rot), c: Math.cos(rot), flat: p.flat });
            } else {
                const c = rotP(p.c), rot = (p.rot || 0) + heading;
                const b = Math.min(p.bevel, p.h[0], p.h[1], p.h[2]);
                boxes.push({ mat: p.mat, x: c[0], y: c[1], z: c[2], hx: p.h[0], hy: p.h[1], hz: p.h[2], b, s: Math.sin(rot), c: Math.cos(rot), flat: p.flat });
            }
        }

        const L0 = L[0], L1 = L[1], L2 = L[2];
        // Escreve um pixel se estiver à frente no z-buffer.
        const put = (i, y, nx, ny, nz, m, flat) => {
            if (y <= depth[i]) return;
            depth[i] = y;
            mat[i] = m;
            const l = nx * L0 + ny * L1 + nz * L2;
            lvl[i] = flat ? 0.55 : (l > 0 ? l : 0);
        };

        // ---- Esferas
        for (let k = 0; k < spheres.length; k++) {
            const p = spheres[k];
            const r = p.r, r2 = r * r;
            const px0 = Math.max(0, Math.floor(half + (p.x - r) * ppu)), px1 = Math.min(N - 1, Math.ceil(half + (p.x + r) * ppu));
            const py0 = Math.max(0, Math.floor(half - (p.z + r) * ppu)), py1 = Math.min(N - 1, Math.ceil(half - (p.z - r) * ppu));
            for (let py = py0; py <= py1; py++) {
                const dz = (half - (py + 0.5)) / ppu - p.z;
                for (let px = px0; px <= px1; px++) {
                    const dx = (px + 0.5 - half) / ppu - p.x;
                    const d2 = dx * dx + dz * dz;
                    if (d2 > r2) continue;
                    const dy = Math.sqrt(r2 - d2);
                    put(py * N + px, p.y + dy, dx / r, dy / r, dz / r, p.mat, p.flat);
                }
            }
        }

        // ---- Elipsoides
        for (let k = 0; k < ells.length; k++) {
            const p = ells[k];
            const ex = Math.max(p.rx, p.rz);
            const px0 = Math.max(0, Math.floor(half + (p.x - ex) * ppu)), px1 = Math.min(N - 1, Math.ceil(half + (p.x + ex) * ppu));
            const py0 = Math.max(0, Math.floor(half - (p.z + ex) * ppu)), py1 = Math.min(N - 1, Math.ceil(half - (p.z - ex) * ppu));
            const sn = -p.s, cs = p.c;   // seno/cosseno de -rot (cos é par)
            for (let py = py0; py <= py1; py++) {
                const dz = (half - (py + 0.5)) / ppu - p.z;
                for (let px = px0; px <= px1; px++) {
                    const dx = (px + 0.5 - half) / ppu - p.x;
                    const lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
                    const u = lx / p.rx, w = lz / p.rz;
                    const q = u * u + w * w;
                    if (q > 1) continue;
                    const v = Math.sqrt(1 - q);
                    const gx = u / p.rx, gy = v / p.ry, gz = w / p.rz;
                    const gm = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
                    // normal girada de volta (+rot)
                    put(py * N + px, p.y + p.ry * v, (gx * cs + gz * p.s) / gm, gy / gm, (-gx * p.s + gz * cs) / gm, p.mat, p.flat);
                }
            }
        }

        // ---- Caixas de topo arredondado
        for (let k = 0; k < boxes.length; k++) {
            const p = boxes[k];
            const ex = Math.hypot(p.hx, p.hz);
            const px0 = Math.max(0, Math.floor(half + (p.x - ex) * ppu)), px1 = Math.min(N - 1, Math.ceil(half + (p.x + ex) * ppu));
            const py0 = Math.max(0, Math.floor(half - (p.z + ex) * ppu)), py1 = Math.min(N - 1, Math.ceil(half - (p.z - ex) * ppu));
            const sn = -p.s, cs = p.c, b = p.b;
            const ix = p.hx - b, iz = p.hz - b;
            for (let py = py0; py <= py1; py++) {
                const dz = (half - (py + 0.5)) / ppu - p.z;
                for (let px = px0; px <= px1; px++) {
                    const dx = (px + 0.5 - half) / ppu - p.x;
                    const lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
                    const cx = lx < -ix ? -ix : (lx > ix ? ix : lx), cz = lz < -iz ? -iz : (lz > iz ? iz : lz);
                    const ox = lx - cx, oz = lz - cz;
                    const dist = Math.sqrt(ox * ox + oz * oz);
                    if (dist > b) continue;
                    const dy = Math.sqrt(Math.max(0, b * b - dist * dist));
                    const gx = b > 1e-6 ? ox / b : 0, gz = b > 1e-6 ? oz / b : 0, gy = b > 1e-6 ? dy / b : 1;
                    put(py * N + px, p.y + p.hy - b + dy, gx * cs + gz * p.s, gy, -gx * p.s + gz * cs, p.mat, p.flat);
                }
            }
        }

        // ---- Quantização + sombra de contato
        const out = new Uint8Array(NN * 4);
        const OUT = this.L_OUTLINE;
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                const i = y * N + x;
                const m = mat[i];
                if (!m) continue;
                const d = depth[i];

                // Contato: vizinho bem mais alto escurece este pixel. Entre peças diferentes é
                // sensível; dentro da mesma peça só degraus enormes (membro dobrado) contam.
                let occluded = false;
                if (outline) {
                    if (x > 0) { const j = i - 1; if (mat[j] && (depth[j] - d > (mat[j] !== m ? 0.3 : 0.6))) occluded = true; }
                    if (x < N - 1) { const j = i + 1; if (mat[j] && (depth[j] - d > (mat[j] !== m ? 0.3 : 0.6))) occluded = true; }
                    if (y > 0) { const j = i - N; if (mat[j] && (depth[j] - d > (mat[j] !== m ? 0.3 : 0.6))) occluded = true; }
                    if (y < N - 1) { const j = i + N; if (mat[j] && (depth[j] - d > (mat[j] !== m ? 0.3 : 0.6))) occluded = true; }
                }

                const l = lvl[i];
                let level;
                if (occluded) level = OUT;
                else if (l > 0.93) level = this.L_HI;
                else if (l > 0.72) level = this.L_LIGHT;
                else if (l > 0.42) level = this.L_BASE;
                else level = this.L_SHADOW;

                const o = i * 4;
                out[o] = m; out[o + 1] = level; out[o + 3] = 255;
            }
        }

        // ---- Contorno externo de 1 px (usa a rampa do vizinho mais alto, nível mais escuro)
        if (outline) {
            for (let y = 0; y < N; y++) {
                for (let x = 0; x < N; x++) {
                    const i = y * N + x;
                    if (mat[i]) continue;
                    let best = -1e9, bm = 0;
                    if (x > 0 && mat[i - 1] && depth[i - 1] > best) { best = depth[i - 1]; bm = mat[i - 1]; }
                    if (x < N - 1 && mat[i + 1] && depth[i + 1] > best) { best = depth[i + 1]; bm = mat[i + 1]; }
                    if (y > 0 && mat[i - N] && depth[i - N] > best) { best = depth[i - N]; bm = mat[i - N]; }
                    if (y < N - 1 && mat[i + N] && depth[i + N] > best) { best = depth[i + N]; bm = mat[i + N]; }
                    if (bm) { const o = i * 4; out[o] = bm; out[o + 1] = OUT; out[o + 3] = 255; }
                }
            }
        }

        // ---- Sombra projetada: cada pixel coberto "cai" no chão deslocado pela luz.
        // Escalada (SHADOW_LEN) para ficar colada ao corpo, como nos GTAs.
        if (shadow) {
            const kx = (-L0 / L1) * shadowLen * ppu, kz = (-L2 / L1) * shadowLen * ppu;
            for (let y = 0; y < N; y++) {
                for (let x = 0; x < N; x++) {
                    const i = y * N + x;
                    if (!mat[i]) continue;
                    const h = depth[i] > 0 ? depth[i] : 0;
                    const sx = Math.round(x + kx * h), sy = Math.round(y - kz * h);
                    if (sx < 0 || sy < 0 || sx >= N || sy >= N) continue;
                    const o = (sy * N + sx) * 4;
                    if (out[o + 3] === 0) { out[o] = this.SHADOW_RAMP; out[o + 1] = 0; out[o + 3] = 255; }
                }
            }
        }
        return out;
    },
};
