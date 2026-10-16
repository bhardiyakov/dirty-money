// ============================================================================
// Extrator do personagem 3D (pacote "personagem_3d_realista", fonte/personagens_masc_fem.glb) para o gerador de NPCs 2,5D do jogo.
//
// Lê o .glb (glTF binário), põe o boneco na pose de "repouso do jogo" (braços quase caídos — a pose neutra do esqueleto do gerador —
// e as mãos fechadas em punho: segurar arma, guidão e bolsa), simplifica a malha do corpo e grava, para o masculino e a feminina:
//   - malhas (corpo por material + os 11 cabelos) em eixos do gerador (x = direita do personagem, y = frente, z = cima; metros);
//   - pesos de skin já convertidos para os 15 ossos do gerador (pelve, peito, cabeça, braços, antebraços, mãos, coxas, canelas, pés);
//   - deltas dos portes (Magro, Forte, Gordo) e as juntas (posição das articulações na mesma pose);
//   - texturas pequenas: o alfa dos cartões de cabelo (+ luminância dos fios) e a luminância das roupas (dobras do tecido).
// O resto (encaixe no esqueleto do jogo, amostragem em pontos, roupas, rosto cartunesco) fica em tools/asset_baker/generator/NpcGenMesh.js.
// ============================================================================

import { simplify } from '../carros3d/simplify.js';

// ---------------------------------------------------------------- GLB
export async function loadGlb(url) {
    const buf = await (await fetch(url)).arrayBuffer();
    const dv = new DataView(buf), jl = dv.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl)));
    const binOff = 20 + jl + 8;
    return { json, buf, binOff };
}

const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function accessor(g, i) {
    const a = g.json.accessors[i], bv = g.json.bufferViews[a.bufferView], nc = NCOMP[a.type];
    const T = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[a.componentType];
    const off = g.binOff + (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride || nc * T.BYTES_PER_ELEMENT;
    const out = new Float32Array(a.count * nc);
    const dv = new DataView(g.buf);
    const rd = { 5120: (o) => dv.getInt8(o), 5121: (o) => dv.getUint8(o), 5122: (o) => dv.getInt16(o, true), 5123: (o) => dv.getUint16(o, true), 5125: (o) => dv.getUint32(o, true), 5126: (o) => dv.getFloat32(o, true) }[a.componentType];
    const norm = a.normalized ? { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[a.componentType] : 1;
    for (let e = 0; e < a.count; e++) for (let c = 0; c < nc; c++) out[e * nc + c] = rd(off + e * stride + c * T.BYTES_PER_ELEMENT) / norm;
    return out;
}

async function image(g, i) {
    const im = g.json.images[i], bv = g.json.bufferViews[im.bufferView];
    const blob = new Blob([new Uint8Array(g.buf, g.binOff + (bv.byteOffset || 0), bv.byteLength)], { type: im.mimeType });
    return createImageBitmap(blob);
}
// Reduz a imagem para w×h (média de área: o canvas com suavização alta) e devolve os pixels RGBA.
function shrink(bmp, w, h) {
    const c = new OffscreenCanvas(w, h), x = c.getContext('2d');
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    // em etapas de 2× (a redução direta de 2048 → 128 pula pixels)
    let src = bmp, sw = bmp.width, sh = bmp.height;
    while (sw / 2 >= w * 1.01 && sh / 2 >= h * 1.01) {
        const t = new OffscreenCanvas(sw >> 1, sh >> 1), tx = t.getContext('2d');
        tx.imageSmoothingQuality = 'high'; tx.drawImage(src, 0, 0, sw >> 1, sh >> 1);
        src = t; sw >>= 1; sh >>= 1;
    }
    x.drawImage(src, 0, 0, w, h);
    return x.getImageData(0, 0, w, h).data;
}

// ---------------------------------------------------------------- matrizes 4×4 (coluna, como o glTF)
const M4 = {
    id: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
    tr: (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
    rot(ax, deg) {
        const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), [x, y, z] = ax, t = 1 - c;
        return [t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0, t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0, t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0, 0, 0, 0, 1];
    },
    pt: (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]],
    dir: (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z],
};

// ---------------------------------------------------------------- osso Mixamo → osso do gerador
export const BONES = ['pelvis', 'chest', 'head', 'uarm_R', 'farm_R', 'hand_R', 'uarm_L', 'farm_L', 'hand_L', 'thigh_R', 'shin_R', 'foot_R', 'thigh_L', 'shin_L', 'foot_L'];
function npcBone(name) {
    const n = name.replace(/^mixamorig:/, '');
    if (n === 'Hips') return 'pelvis';
    if (/^(Spine|Spine1|Spine2|Neck|LeftShoulder|RightShoulder)$/.test(n)) return 'chest';
    if (/^(Head|HeadTop_End)/.test(n) || /Eye/.test(n)) return 'head';
    const m = n.match(/^(Left|Right)(.*)$/);
    if (!m) return 'chest';
    const sd = m[1] === 'Left' ? 'L' : 'R', p = m[2];
    if (p === 'Arm') return 'uarm_' + sd;
    if (p === 'ForeArm') return 'farm_' + sd;
    if (/^Hand/.test(p)) return 'hand_' + sd;
    if (p === 'UpLeg') return 'thigh_' + sd;
    if (p === 'Leg') return 'shin_' + sd;
    if (/^(Foot|Toe)/.test(p)) return 'foot_' + sd;
    return 'chest';
}

// Pose de repouso do jogo, em graus, nos eixos do glTF (ver README do pacote: convenções de rotação).
//   braços: Left −Z / Right +Z (78°: quase caídos, sem encostar no quadril); dedos: fechados (−Z / +Z); polegar dobrado sobre os dedos.
function restPose(name) {
    const n = name.replace(/^mixamorig:/, '');
    const m = n.match(/^(Left|Right)(.*)$/);
    if (!m) return null;
    const s = m[1] === 'Left' ? -1 : 1, p = m[2];
    if (p === 'Arm') return [[0, 0, 1], 78 * s];
    let f;
    if ((f = p.match(/^Hand(Index|Middle|Ring|Pinky)([123])$/))) return [[0, 0, 1], s * [0, 62, 88, 62][+f[2]]];
    if ((f = p.match(/^HandThumb([123])$/))) {
        if (f[1] === '1') return [[0, 1, 0], -s * 25];
        return [[0, 0, 1], s * 38];
    }
    return null;
}

// glTF (x = esquerda do personagem, y = cima, z = frente) → gerador (x = direita, y = frente, z = cima)
const toNpc = (x, y, z) => [-x, z, y];

const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const Q = 2 / 32767;                     // quantização das posições (±2 m)

// ---------------------------------------------------------------- um personagem
function charNodes(g, rootName) {
    const J = g.json, root = J.nodes.findIndex((n) => n.name === rootName), out = [];
    const walk = (i) => { out.push(i); for (const c of J.nodes[i].children || []) walk(c); };
    walk(root);
    return out;
}

// Material do jogo de cada primitiva do corpo (pelo nome do material do glTF).
function bodyMat(name) {
    if (/^Pele/.test(name)) return 'skin';
    if (/^Camiseta/.test(name)) return 'shirt';
    if (/^Calca/.test(name)) return 'jeans';
    if (/^Tenis/.test(name)) return 'shoe';
    if (/^Olhos/.test(name)) return 'eye';
    return null;                                          // sobrancelhas e cílios: o rosto é pintado (cartunesco)
}

export async function extract(g, { maxErr = 0.0016, log = console.log } = {}) {
    const J = g.json, out = { v: 1, bones: BONES, chars: {}, hairs: {}, tex: {} };
    const texDone = new Set();
    for (const [key, rootName] of [['m', 'Masculino'], ['f', 'Feminino']]) {
        const nodes = charNodes(g, rootName);
        const meshNodes = nodes.filter((i) => J.nodes[i].mesh !== undefined);
        const skin = J.skins[J.nodes[meshNodes[0]].skin];
        // juntas: posição de repouso (T-pose) no espaço da malha = inversa da inverse bind matrix (rotação identidade em todos os ossos)
        const ibm = accessor(g, skin.inverseBindMatrices), joints = skin.joints;
        const jn = joints.map((i) => J.nodes[i].name), jpos = joints.map((_, k) => [-ibm[k * 16 + 12], -ibm[k * 16 + 13], -ibm[k * 16 + 14]]);
        const parent = joints.map((ji) => { const p = J.nodes.findIndex((n) => (n.children || []).includes(ji)); return joints.indexOf(p); });
        // FK da pose de repouso do jogo: X_j = X_pai · T(J_j − J_pai) · R_j ; matriz de skin S_j = X_j · T(−J_j)
        const X = [], S = [];
        for (let k = 0; k < joints.length; k++) {
            const p = parent[k], r = restPose(jn[k]), R = r ? M4.rot(r[0], r[1]) : M4.id();
            const Jp = p >= 0 ? jpos[p] : [0, 0, 0], Xp = p >= 0 ? X[p] : M4.id();
            X[k] = M4.mul(Xp, M4.mul(M4.tr(jpos[k][0] - Jp[0], jpos[k][1] - Jp[1], jpos[k][2] - Jp[2]), R));
            S[k] = M4.mul(X[k], M4.tr(-jpos[k][0], -jpos[k][1], -jpos[k][2]));
        }
        const jointsOut = {};
        for (let k = 0; k < joints.length; k++) { const t = X[k]; jointsOut[jn[k].replace(/^mixamorig:/, '')] = toNpc(t[12], t[13], t[14]).map((v) => +v.toFixed(5)); }
        const jb = jn.map((n) => BONES.indexOf(npcBone(n)));
        const C = (out.chars[key] = { joints: jointsOut, height: J.nodes[nodes[0]].extras && J.nodes[nodes[0]].extras.altura_m, meshes: [] });

        for (const ni of meshNodes) {
            const node = J.nodes[ni], mesh = J.meshes[node.mesh], isHair = /^Cabelo/.test(node.name);
            for (const prim of mesh.primitives) {
                if (isHair && key !== 'm') continue;               // cabelos: os da feminina são os mesmos, só ajustados à cabeça dela (3 mm) — o jogo encaixa as duas cabeças no mesmo tamanho
                const matName = J.materials[prim.material].name;
                const mat = isHair ? 'hair' : bodyMat(matName);
                if (!mat) continue;
                const P = accessor(g, prim.attributes.POSITION), N = accessor(g, prim.attributes.NORMAL), UV = accessor(g, prim.attributes.TEXCOORD_0);
                const JI = accessor(g, prim.attributes.JOINTS_0), JW = accessor(g, prim.attributes.WEIGHTS_0);
                const I = accessor(g, prim.indices), nv = P.length / 3;
                const morphs = isHair ? [] : (prim.targets || []).slice(0, 3).map((t) => accessor(g, t.POSITION));
                // pose de repouso do jogo (skin) + eixos do gerador; pesos somados por osso do gerador
                const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), wb = new Float32Array(nv * BONES.length);
                const dm = morphs.map(() => new Float32Array(nv * 3));
                for (let v = 0; v < nv; v++) {
                    let px = 0, py = 0, pz = 0, nx = 0, ny = 0, nz = 0;
                    const dd = morphs.map(() => [0, 0, 0]);
                    for (let c = 0; c < 4; c++) {
                        const w = JW[v * 4 + c];
                        if (!(w > 0)) continue;
                        const k = JI[v * 4 + c], m = S[k];
                        const q = M4.pt(m, P[v * 3], P[v * 3 + 1], P[v * 3 + 2]), d = M4.dir(m, N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
                        px += w * q[0]; py += w * q[1]; pz += w * q[2]; nx += w * d[0]; ny += w * d[1]; nz += w * d[2];
                        morphs.forEach((T, t) => { const e = M4.dir(m, T[v * 3], T[v * 3 + 1], T[v * 3 + 2]); dd[t][0] += w * e[0]; dd[t][1] += w * e[1]; dd[t][2] += w * e[2]; });
                        wb[v * BONES.length + (isHair ? 2 : jb[k])] += w;          // cabelo: preso à cabeça (como o cabelo do gerador)
                    }
                    const a = toNpc(px, py, pz), l = Math.hypot(nx, ny, nz) || 1, b = toNpc(nx / l, ny / l, nz / l);
                    pos.set(a, v * 3); nrm.set(b, v * 3);
                    dd.forEach((e, t) => dm[t].set(toNpc(e[0], e[1], e[2]), v * 3));
                }
                // simplificação (só o corpo: os cartões de cabelo dependem das coordenadas de textura em cada canto)
                let keep = null, idx = Uint32Array.from(I);
                if (!isHair && maxErr > 0) {
                    const s = simplify({ positions: pos, normals: nrm, indices: idx }, maxErr, { orig: true });
                    keep = s.orig; idx = s.indices;
                }
                const sel = keep || Int32Array.from({ length: nv }, (_, i) => i), n = sel.length;
                const qp = new Int16Array(n * 3), qn = new Int8Array(n * 3), bw = new Uint8Array(n * 8), quv = new Uint16Array(n * 2);
                const qd = dm.map(() => new Int16Array(n * 3));
                for (let j = 0; j < n; j++) {
                    const v = sel[j];
                    for (let c = 0; c < 3; c++) { qp[j * 3 + c] = Math.round(pos[v * 3 + c] / Q); qn[j * 3 + c] = Math.round(nrm[v * 3 + c] * 127); qd.forEach((d, t) => { d[j * 3 + c] = Math.round(dm[t][v * 3 + c] / Q); }); }
                    quv[j * 2] = Math.round(Math.min(Math.max(UV[v * 2] % 1 + (UV[v * 2] < 0 ? 1 : 0), 0), 1) * 65535);
                    quv[j * 2 + 1] = Math.round(Math.min(Math.max(UV[v * 2 + 1] % 1 + (UV[v * 2 + 1] < 0 ? 1 : 0), 0), 1) * 65535);
                    // os 4 ossos do gerador de maior peso
                    const ws = [];
                    for (let b = 0; b < BONES.length; b++) { const w = wb[v * BONES.length + b]; if (w > 0.004) ws.push([w, b]); }
                    ws.sort((a, b) => b[0] - a[0]);
                    const top = ws.slice(0, 4), tot = top.reduce((s, x) => s + x[0], 0) || 1;
                    let acc = 0;
                    top.forEach(([w, b], c) => { bw[j * 8 + c] = b; const q = c === top.length - 1 ? 255 - acc : Math.round((w / tot) * 255); bw[j * 8 + 4 + c] = q; acc += q; });
                }
                const im = J.materials[prim.material].pbrMetallicRoughness && J.materials[prim.material].pbrMetallicRoughness.baseColorTexture;
                const tex = im ? J.images[J.textures[im.index].source].name : null;
                const entry = { name: isHair ? node.name : matName, mat, n, pos: b64(new Uint8Array(qp.buffer)), nrm: b64(new Uint8Array(qn.buffer)), idx: b64(new Uint8Array((n > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx)).buffer)), i32: n > 65535 ? 1 : 0, ni: idx.length };
                if (!isHair) entry.bw = b64(bw);
                if (dm.length) entry.morph = qd.map((d) => b64(new Uint8Array(d.buffer)));
                if (isHair || mat === 'shirt' || mat === 'jeans') { entry.uv = b64(new Uint8Array(quv.buffer)); entry.tex = tex; }
                if (isHair) out.hairs[node.name.replace(/^Cabelo_\d+_/, '')] = entry; else C.meshes.push(entry);
                // texturas: alfa + luminância (cabelo, 128²) ou só luminância (roupa, 256²)
                if (entry.tex && !texDone.has(entry.tex)) {
                    texDone.add(entry.tex);
                    const ii = J.textures[im.index].source, bmp = await image(g, ii), sz = isHair ? 128 : 256, px = shrink(bmp, sz, sz);
                    const t = new Uint8Array(sz * sz * (isHair ? 2 : 1));
                    for (let p = 0; p < sz * sz; p++) {
                        const L = 0.2126 * px[p * 4] + 0.7152 * px[p * 4 + 1] + 0.0722 * px[p * 4 + 2];
                        if (isHair) { t[p * 2] = px[p * 4 + 3]; t[p * 2 + 1] = Math.round(L); } else t[p] = Math.round(L);
                    }
                    out.tex[entry.tex] = { w: sz, h: sz, c: isHair ? 2 : 1, d: b64(t) };
                }
                log(`${key} ${entry.name}: ${nv} → ${n} vértices, ${idx.length / 3} triângulos`);
            }
        }
    }
    return out;
}
