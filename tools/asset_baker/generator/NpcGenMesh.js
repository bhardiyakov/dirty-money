// ============================================================================
// NpcGenMesh — o corpo dos personagens 2,5D a partir da MALHA 3D realista (generator/malha3d.js, extraída por tools/personagens3d do
// pacote "personagem_3d_realista": MakeHuman, CC0) no lugar das formas geométricas (SDF) do gerador.
//
// Mistura de 3D e pixel art: a anatomia vem da malha (rosto, orelhas, mãos fechadas, ombros, dobras da camiseta e do jeans, tênis,
// cabelos de verdade, portes magro/forte/gordo e o corpo feminino), mas encaixada no esqueleto CARTUNESCO do gerador — cada osso da
// malha é esticado/achatado até o volume da parte geométrica que ele substitui (cabeça grande e redonda, ombros largos). Por isso todo o
// resto continua servindo sem mudança: as ~100 animações, chapéus, coletes, mochilas, armas, as paletas de cor e o rosto pintado (olhos,
// sobrancelhas, boca, barba, óculos, máscara — as texturas procedurais da ficha, aplicadas sobre a malha).
//
// Saída = partes "assadas" como as do NpcGenCore.bake ({pos, nrm, mat, tone} no espaço do osso), com um extra: cada ponto também tem
// a posição no espaço do 2º osso que mais o influencia e o peso dele (pos2, nrm2, b2, w2). O renderizador mistura os dois (skin linear):
// cotovelo, joelho, ombro e pescoço dobram sem abrir fresta.
//
// Unidades: as do gerador (o esqueleto do pacote, SKEL); a malha vem em metros. Eixos: x = direita do personagem, y = frente, z = cima.
// ============================================================================

function NpcGenMesh(G) {
    'use strict';
    const { M, GR } = G;
    const abs = Math.abs, min = Math.min, max = Math.max, sqrt = Math.sqrt, floor = Math.floor, ceil = Math.ceil;
    const DATA = typeof NPC_MESH3D !== 'undefined' ? NPC_MESH3D : null;
    const BONES = DATA ? DATA.bones : [];
    const BI = {}; BONES.forEach((b, i) => { BI[b] = i; });
    const Q16 = 2 / 32767;

    // Partes do corpo que a malha substitui (osso → grupo de contorno). O resto da ficha (cabelo geométrico, chapéu, colete, bolsa,
    // alça) continua vindo das formas do NpcGenChar.
    const PART_GROUP = { pelvis: GR.pelvis, chest: GR.chest, head: GR.face, uarm_R: GR.armR, farm_R: GR.armR, hand_R: GR.armR, uarm_L: GR.armL, farm_L: GR.armL,
        hand_L: GR.armL, thigh_R: GR.legR, shin_R: GR.legR, foot_R: GR.footR, thigh_L: GR.legL, shin_L: GR.legL, foot_L: GR.footL };
    // Cabelos da malha para os estilos da ficha (os que não estão aqui — espetado, black power, coque, moicano, dreads — continuam
    // geométricos). Estilos novos: lateral, topete, pixie, chanel, chanel_franja, tranca.
    const HAIR = { short: 'Curto_Classico', buzz: 'Raspado', curly: 'Afro_Curto', long: 'Longo_Liso', ponytail: 'Rabo_de_Cavalo',
        side: 'Curto_Lateral', quiff: 'Topete', pixie: 'Pixie', bob: 'Chanel', bob_fringe: 'Chanel_Franja', braid: 'Tranca' };
    const MORPH = { slim: [1, 0, 0], muscular: [0, 1, 0], heavy: [0, 0, 1], normal: [0, 0, 0] };          // Magro, Forte, Gordo
    const LONG_SLEEVE = { longsleeve: 1, social: 1, uniform_long: 1, jacket: 1, hoodie: 1 };

    // ------------------------------------------------------------------ dados (base64 → arrays), decodificados uma vez
    const bytes = (s) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
    const _mesh = new Map();
    function meshOf(e) {
        let m = _mesh.get(e);
        if (m) return m;
        const n = e.n, qp = new Int16Array(bytes(e.pos).buffer), qn = new Int8Array(bytes(e.nrm).buffer);
        const pos = new Float32Array(n * 3), nr = new Float32Array(n * 3);
        for (let i = 0; i < n * 3; i++) { pos[i] = qp[i] * Q16; nr[i] = qn[i] / 127; }
        m = { n, pos, nrm: nr, mat: e.mat, name: e.name, idx: e.i32 ? new Uint32Array(bytes(e.idx).buffer) : new Uint16Array(bytes(e.idx).buffer) };
        if (e.bw) m.bw = bytes(e.bw);
        if (e.morph) m.morph = e.morph.map((s) => { const q = new Int16Array(bytes(s).buffer), f = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) f[i] = q[i] * Q16; return f; });
        if (e.uv) { const q = new Uint16Array(bytes(e.uv).buffer); m.uv = new Float32Array(n * 2); for (let i = 0; i < n * 2; i++) m.uv[i] = q[i] / 65535; }
        if (e.tex) m.tex = texOf(e.tex);
        _mesh.set(e, m);
        return m;
    }
    const _tex = new Map();
    function texOf(name) {
        let t = _tex.get(name);
        if (t) return t;
        const T = DATA.tex[name];
        if (!T) return null;
        t = { w: T.w, h: T.h, c: T.c, d: bytes(T.d) };
        let s = 0;                                         // luminância média (do que é opaco, no cabelo): referência das dobras/mechas
        let k = 0;
        for (let i = 0; i < T.w * T.h; i++) { if (T.c === 2 && t.d[i * 2] < 128) continue; s += t.d[i * T.c + T.c - 1]; k++; }
        t.mean = s / max(k, 1);
        _tex.set(name, t);
        return t;
    }
    // texel (vizinho mais próximo) — canal c
    const texel = (t, u, v, c) => { const x = min(t.w - 1, max(0, floor(u * t.w))), y = min(t.h - 1, max(0, floor(v * t.h))); return t.d[(y * t.w + x) * t.c + c]; };

    // ------------------------------------------------------------------ rotação mínima que leva a direção a → b (3×3 por linha)
    function align(a, b) {
        const c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        let x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0];
        const s = sqrt(x * x + y * y + z * z);
        if (s < 1e-9) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
        x /= s; y /= s; z /= s;
        const t = 1 - c;
        return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
    }
    const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const len = (a) => sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
    const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const avg = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    function quant(arr, q) { if (!arr.length) return 0; const s = Float64Array.from(arr).sort(); return s[min(s.length - 1, max(0, Math.round(q * (s.length - 1))))]; }

    // ------------------------------------------------------------------ ENCAIXE: malha (metros) → espaço de cada osso do gerador
    // Por osso: origem na malha (Om), rotação (Q: alinha o osso da malha com o do gerador, que aponta para −z) e escala por eixo (s) +
    // deslocamento (o) no espaço do osso. Ao longo do osso a escala vem das juntas (o cotovelo da malha cai no cotovelo do boneco); na
    // seção (x, y) e nas pontas (cabeça, mãos, pés), da caixa da parte geométrica que ele substitui (a ficha "normal" do mesmo sexo).
    // Cabeça: em z, duas escalas (acima e abaixo dos olhos): crânio maior e rosto mais curto — o desenho "cabeçudo" do jogo, com os
    // olhos da malha exatamente onde o rosto pintado põe os olhos.
    const _fit = {};
    function fitFor(key) {
        if (_fit[key]) return _fit[key];
        const C = DATA.chars[key], J = C.joints, F = {};
        const ref = G.fullSpec({ gender: key, body: 'normal', top: 'tshirt', bottom: 'jeans', shoes: 'sneaker', bag: null, hair: 'bald', head: null, vest: null,
            gloves: false, beard: null, glasses: false, mask: null, watch: false, pattern: null, chain: false, belt: false });
        const sdf = G.buildParts(ref);
        const box = (name) => { const [lo, hi] = sdf[name].bounds(); return [lo.map((v) => v + 1.5), hi.map((v) => v - 1.5)]; };
        const hip = avg(J.LeftUpLeg, J.RightUpLeg), sh = avg(J.LeftArm, J.RightArm);
        F.pelvis = { Om: [0, 0, hip[2]], Q: I3, s: [1, 1, 8.0 / (J.Spine[2] - hip[2])], o: [0, 0, -3.0] };
        F.chest = { Om: [0, 0, J.Spine[2]], Q: I3, s: [1, 1, 15.6 / (sh[2] - J.Spine[2])], o: [0, 0, 0] };
        for (const [sd, mx] of [['R', 'Right'], ['L', 'Left']]) {
            const chain = (b, a, c, L) => { const d = sub(J[mx + c], J[mx + a]); F[b + '_' + sd] = { Om: J[mx + a], Q: align(unit(d), [0, 0, -1]), s: [1, 1, L / len(d)], o: [0, 0, 0] }; };
            chain('uarm', 'Arm', 'ForeArm', 13.0); chain('farm', 'ForeArm', 'Hand', 11.5);
            F['hand_' + sd] = { Om: J[mx + 'Hand'], Q: F['farm_' + sd].Q, s: [1, 1, 1], o: [0, 0, 0], end: true };
            chain('thigh', 'UpLeg', 'Leg', 12.0); chain('shin', 'Leg', 'Foot', 11.4);
            F['foot_' + sd] = { Om: J[mx + 'Foot'], Q: I3, s: [1, 1, 1], o: [0, 0, 0], end: true };
        }
        F.head = { Om: J.Head, Q: I3, s: [1, 1, 1], o: [0, 0, 0], head: true };
        // pontos da malha (porte normal) por osso principal, no quadro (Q) do osso
        const pts = {}; for (const b of BONES) pts[b] = [[], [], []];
        const eyes = [];
        let top = -Infinity;
        for (const e of C.meshes) {
            const m = meshOf(e);
            for (let v = 0; v < m.n; v++) {
                const b = BONES[m.bw[v * 8]], f = F[b], p = [m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]];
                if (m.mat === 'eye') { eyes.push(p); continue; }
                const d = G.mv3(f.Q, sub(p, f.Om));
                pts[b][0].push(d[0]); pts[b][1].push(d[1]); pts[b][2].push(d[2]);
                if (b === 'head' && m.mat === 'skin') top = max(top, p[2]);
            }
        }
        const fitAxis = (f, b, c, lo, hi, q = 0.01) => { const a = quant(pts[b][c], q), z = quant(pts[b][c], 1 - q); f.s[c] = (hi - lo) / max(z - a, 1e-6); f.o[c] = lo - f.s[c] * a; };
        for (const b of BONES) {
            if (b === 'head') continue;
            const f = F[b], [lo, hi] = box(b);
            fitAxis(f, b, 0, lo[0], hi[0]); fitAxis(f, b, 1, lo[1], hi[1]);
            if (f.end) fitAxis(f, b, 2, lo[2], hi[2]);
        }
        // tronco: profundidade no máximo 85% da escala da largura (a caixa da forma geométrica inclui ombros e peito redondos: a
        // malha ficava funda demais de perfil); pés: escala única pelo comprimento do tênis (pela caixa, viravam pés de palhaço); mãos 90%
        // Tronco: largura e profundidade medidas num CORTE (faixa de altura do peito / da cintura) da forma geométrica e da malha — a
        // caixa inteira inclui as esferas dos ombros e deixava a malha mais larga que o colete e a mochila feitos para o tronco antigo.
        for (const [b, z0, z1] of [['chest', 4.0, 12.0], ['pelvis', -4.5, 0.0]]) {
            const f = F[b], part = sdf[b], tmp = {}, zm = (z0 + z1) / 2;
            const edge = (dx, dy) => { let t = 0; while (t < 40 && part.eval(dx * t, 0.5 + dy * t, zm, tmp) < 0) t += 0.05; return t; };
            const hw = edge(1, 0), fr = 0.5 + edge(0, 1), bk = 0.5 - edge(0, -1);
            const xs = [], ys = [];
            for (let i = 0; i < pts[b][0].length; i++) { const z = f.o[2] + f.s[2] * pts[b][2][i]; if (z >= z0 && z <= z1) { xs.push(pts[b][0][i]); ys.push(pts[b][1][i]); } }
            const x0 = quant(xs, 0.02), x1 = quant(xs, 0.98), y0 = quant(ys, 0.02), y1 = quant(ys, 0.98);
            f.s[0] = (2 * hw) / (x1 - x0); f.o[0] = -f.s[0] * (x0 + x1) / 2;
            f.s[1] = (fr - bk) / (y1 - y0); f.o[1] = fr - f.s[1] * y1;
        }
        for (const sd of ['R', 'L']) {
            const f = F['foot_' + sd], k = f.s[1];
            for (const c of [0, 2]) { const mid = (quant(pts['foot_' + sd][c], 0.01) + quant(pts['foot_' + sd][c], 0.99)) / 2, tgt = f.o[c] + f.s[c] * mid; f.s[c] = k; f.o[c] = tgt - k * mid; }
            const top = quant(pts['foot_' + sd][2], 0.01); f.o[2] = box('foot_' + sd)[0][2] - k * top;          // (sola no chão)
            const h = F['hand_' + sd];
            for (const c of [0, 1, 2]) { h.o[c] *= 0.9; h.s[c] *= 0.9; }
        }
        if (key === 'f') {                                                        // braços femininos mais finos (a caixa da manga engrossava a malha)
            for (const sd of ['R', 'L']) for (const b of ['uarm_' + sd, 'farm_' + sd]) for (const c of [0, 1]) { F[b].s[c] *= 0.8; F[b].o[c] *= 0.8; }
        }
        F.chest.zTop = 15.6; F.chest.sTop = F.chest.s[2] * 0.72;                  // acima dos ombros (trapézio, pescoço): mais baixo — o pescoço aparece
        // cabeça: olhos (centro de cada globo ocular) → (±5,4; 10,2), topo do crânio → 25,4, queixo → −1,6; frente/nuca pela caixa
        const H = F.head, eL = [0, 0, 0], eR = [0, 0, 0];
        let nL = 0, nR = 0;
        for (const p of eyes) { if (p[0] < 0) { eL[0] += p[0]; eL[1] += p[1]; eL[2] += p[2]; nL++; } else { eR[0] += p[0]; eR[1] += p[1]; eR[2] += p[2]; nR++; } }
        const ec = [(eL[0] / nL + eR[0] / nR) / 2 - H.Om[0], (eL[1] / nL + eR[1] / nR) / 2 - H.Om[1], (eL[2] / nL + eR[2] / nR) / 2 - H.Om[2]];
        const ex = (eR[0] / nR - eL[0] / nL) / 2;
        const hp = pts.head, front = [], chin = [];
        for (let i = 0; i < hp[0].length; i++) { if (hp[2][i] > ec[2] - 0.035) front.push(hp[1][i]); if (hp[1][i] > ec[1] - 0.04) chin.push(hp[2][i]); }
        const yb = quant(front, 0.005), yf = quant(front, 0.998), zc = quant(chin, 0.01);
        H.s = [5.4 / ex, (14.3 + 11.8) / (yf - yb), 0];
        H.o = [-H.s[0] * ec[0], 14.3 - H.s[1] * yf, 10.2];
        H.ez = ec[2]; H.sUp = (25.4 - 10.2) / (top - H.Om[2] - ec[2]); H.sDn = (10.2 + 1.6) / (ec[2] - zc);
        return (_fit[key] = F);
    }

    // Posição (e normal) de um ponto da malha no espaço do osso b (unidades do gerador, antes do esticão "adulto").
    function toBone(F, b, p, n, outP, outN, oi) {
        const f = F[b], d = G.mv3(f.Q, sub(p, f.Om)), q = G.mv3(f.Q, n);
        let sz = f.s[2], z;
        if (f.head) { sz = d[2] > f.ez ? f.sUp : f.sDn; z = 10.2 + sz * (d[2] - f.ez); }
        else { z = f.o[2] + sz * d[2]; if (f.zTop !== undefined && z > f.zTop) { z = f.zTop + (z - f.zTop) * (f.sTop / sz); sz = f.sTop; } }
        outP[oi] = f.o[0] + f.s[0] * d[0]; outP[oi + 1] = f.o[1] + f.s[1] * d[1]; outP[oi + 2] = z;
        const nx = q[0] / f.s[0], ny = q[1] / f.s[1], nz = q[2] / sz, l = sqrt(nx * nx + ny * ny + nz * nz) || 1;
        outN[oi] = nx / l; outN[oi + 1] = ny / l; outN[oi + 2] = nz / l;
    }
    // maior fator de escala (metros → unidades do gerador → adulto) de um osso: densidade da amostragem
    function kOf(F, b) {
        const f = F[b], sh = G.shapeFor(b) || [1, 1, 1];
        const sz = f.head ? max(f.sUp, f.sDn) : abs(f.s[2]);
        return max(abs(f.s[0]) * sh[0], abs(f.s[1]) * sh[1], sz * sh[2]);
    }

    // ------------------------------------------------------------------ amostragem: pontos na superfície dos triângulos
    // Grade baricêntrica regular em cada triângulo (passo ≤ `step` no tamanho final): densidade parecida com a das formas assadas.
    // Cada ponto herda (interpolado) posição, normal, coordenada de textura e os pesos dos ossos.
    class Cloud {
        constructor() { this.n = 0; this.cap = 4096; this._alloc(); }
        _alloc() {
            const c = this.cap, o = this;
            const grow = (A, k, T) => { const B = new T(c * k); if (A) B.set(A); return B; };
            o.P = grow(o.P, 3, Float32Array); o.N = grow(o.N, 3, Float32Array); o.UV = grow(o.UV, 2, Float32Array);
            o.B = grow(o.B, 2, Uint8Array); o.W = grow(o.W, 1, Float32Array); o.T = grow(o.T, 1, Int8Array);
        }
        push() { if (this.n >= this.cap) { this.cap *= 2; this._alloc(); } return this.n++; }
    }
    function sample(m, pos, F, step, cloud, { boneOf = null, alpha = null } = {}) {
        const idx = m.idx, nt = idx.length / 3, N = m.nrm, UV = m.uv, bw = m.bw, nb = BONES.length;
        // tamanho de cada triângulo no desenho final: cantos no espaço (esticado) do osso principal; cantos de ossos diferentes = maior escala
        const kv = new Float32Array(m.n), wv = new Float32Array(nb), pb = new Uint8Array(m.n), mp = new Float32Array(m.n * 3), mn = new Float32Array(m.n * 3), pp = [0, 0, 0], nn = [0, 0, 1];
        for (let v = 0; v < m.n; v++) {
            const b = boneOf ? boneOf : BONES[bw[v * 8]], sh = G.shapeFor(b) || [1, 1, 1];
            kv[v] = kOf(F, b); pb[v] = BI[b];
            pp[0] = pos[v * 3]; pp[1] = pos[v * 3 + 1]; pp[2] = pos[v * 3 + 2];
            toBone(F, b, pp, nn, mp, mn, v * 3);
            mp[v * 3] *= sh[0]; mp[v * 3 + 1] *= sh[1]; mp[v * 3 + 2] *= sh[2];
        }
        const dist = (A, i, j) => Math.hypot(A[i * 3] - A[j * 3], A[i * 3 + 1] - A[j * 3 + 1], A[i * 3 + 2] - A[j * 3 + 2]);
        // Grade (i, j) a partir do canto do maior ângulo, um passo por `step` em cada um dos dois lados que saem dele. Cada canto e cada
        // aresta gera pontos uma vez só (a malha compartilha cantos entre ~6 triângulos).
        const doneV = new Uint8Array(m.n), doneE = new Set(), ek = (x, y) => (x < y ? x * m.n + y : y * m.n + x);
        for (let t = 0; t < nt; t++) {
            let a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
            const same = pb[a] === pb[b] && pb[b] === pb[c], A = same ? mp : pos, kk = same ? 1 : max(kv[a], kv[b], kv[c]);
            let lab = dist(A, a, b) * kk, lbc = dist(A, b, c) * kk, lca = dist(A, c, a) * kk;
            if (lab >= lbc && lab >= lca) { const t0 = a; a = c; c = b; b = t0; const l0 = lab; lab = lca; lca = lbc; lbc = l0; }      // o maior lado fica oposto ao canto a
            else if (lca >= lbc && lca >= lab) { const t0 = a; a = b; b = c; c = t0; const l0 = lab; lab = lbc; lbc = lca; lca = l0; }
            const n1 = max(1, ceil(lab / step)), n2 = max(1, ceil(lca / step));
            const eAB = doneE.has(ek(a, b)), eAC = doneE.has(ek(a, c)), eBC = doneE.has(ek(b, c));
            doneE.add(ek(a, b)); doneE.add(ek(a, c)); doneE.add(ek(b, c));
            for (let i = 0; i <= n1; i++) for (let j = 0; j <= n2; j++) {
                const u = i / n1, w = j / n2, s = 1 - u - w;
                if (s < -1e-9) break;
                const onBC = s < 1e-9;
                if (i === 0 && j === 0) { if (doneV[a]) continue; doneV[a] = 1; }
                else if (i === n1 && j === 0) { if (doneV[b]) continue; doneV[b] = 1; }
                else if (i === 0 && j === n2) { if (doneV[c]) continue; doneV[c] = 1; }
                else if ((j === 0 && eAB) || (i === 0 && eAC) || (onBC && eBC)) continue;
                if (alpha && UV) {
                    const tu = s * UV[a * 2] + u * UV[b * 2] + w * UV[c * 2], tv = s * UV[a * 2 + 1] + u * UV[b * 2 + 1] + w * UV[c * 2 + 1];
                    if (texel(alpha, tu, tv, 0) < 128) continue;
                }
                const o = cloud.push();
                for (let q = 0; q < 3; q++) {
                    cloud.P[o * 3 + q] = s * pos[a * 3 + q] + u * pos[b * 3 + q] + w * pos[c * 3 + q];
                    cloud.N[o * 3 + q] = s * N[a * 3 + q] + u * N[b * 3 + q] + w * N[c * 3 + q];
                }
                if (UV) { cloud.UV[o * 2] = s * UV[a * 2] + u * UV[b * 2] + w * UV[c * 2]; cloud.UV[o * 2 + 1] = s * UV[a * 2 + 1] + u * UV[b * 2 + 1] + w * UV[c * 2 + 1]; }
                if (boneOf) { cloud.B[o * 2] = cloud.B[o * 2 + 1] = BI[boneOf]; cloud.W[o] = 0; continue; }
                // pesos: soma dos 3 cantos; os 2 ossos maiores (peso do 2º normalizado entre os dois)
                wv.fill(0);
                for (const [vv, bc] of [[a, s], [b, u], [c, w]]) for (let r = 0; r < 4; r++) { const wt = bw[vv * 8 + 4 + r]; if (wt) wv[bw[vv * 8 + r]] += bc * wt; }
                let b1 = 0, b2 = 0, w1 = -1, w2 = -1;
                for (let q = 0; q < nb; q++) { const x = wv[q]; if (x > w1) { w2 = w1; b2 = b1; w1 = x; b1 = q; } else if (x > w2) { w2 = x; b2 = q; } }
                const ww = w2 > 0 ? w2 / (w1 + w2) : 0;
                cloud.B[o * 2] = b1; cloud.B[o * 2 + 1] = ww > 0.02 ? b2 : b1; cloud.W[o] = ww > 0.02 ? ww : 0;
            }
        }
    }

    // ------------------------------------------------------------------ material de cada ponto (roupa da ficha sobre a malha de camiseta + jeans + tênis)
    function matFor(s, kind, bone, lp) {
        const sd = bone.slice(-1), part = bone.replace(/_[RL]$/, '');
        if (kind === 'skin' || kind === 'eye') {
            if (part === 'hand') return s.gloves ? M.glove : M.skin;
            if ((part === 'farm' || part === 'uarm') && LONG_SLEEVE[s.top]) return M.shirt;
            if (part === 'farm' && s.watch && sd === 'L' && lp[2] < -8.2 && lp[2] > -10.2) return M.gold;
            return M.skin;
        }
        if (kind === 'shirt') return part === 'uarm' && s.top === 'tank' ? M.skin : M.shirt;
        if (kind === 'jeans') {
            if (part === 'shin' && s.bottom === 'shorts') return lp[2] < -8.4 && s.shoes !== 'flipflop' ? M.sock : M.skin;
            if (part === 'shin' && s.shoes === 'boots' && lp[2] < -7.2) return M.shoe;
            return M.jeans;
        }
        if (kind === 'shoe') {
            // (a sola pela altura no espaço do PÉ: a parte do calçado que segue a canela — o cano, o tornozelo — está no espaço dela, uns
            // 11,4 acima; medida direto, virava "sola" e o chinelo ganhava meia preta até o meio da canela)
            const z = part === 'shin' ? lp[2] - G.SKEL[bone.replace('shin', 'foot')][1][2] : lp[2];
            if (z < -3.7) return M.sole;
            return s.shoes === 'flipflop' ? M.skin : M.shoe;
        }
        return M.skin;
    }

    // ------------------------------------------------------------------ ESTADO DE DANO pintado na roupa e na pele (ficha.dmg)
    // 1 SUJO (atropelado/rolou no chão): manchas de terra na roupa, poucas na pele; 2 MACHUCADO (apanhou / 1 tiro): menos terra, cortes e
    // arranhões vermelhos, hematomas, sangue do nariz; 3 MUITO MACHUCADO (2+ tiros): rasgos na roupa com a PELE aparecendo (borda
    // esfiapada escura, ralado dentro), manchas grandes de sangue, rosto e cabelo ensanguentados.
    // As marcas são sorteadas no ESPAÇO DO OSSO (cada ponto da parte, antes do esticão adulto): ficam presas ao corpo — giram com ele em
    // todas as direções e acompanham as animações. Terra = madeira (marrom), sangue/corte = carne (vermelhos), rasgo = a pele da pessoa:
    // as cores da roupa e da pele continuam vindo da paleta de cada um (uma variação da roupa, não uma skin pronta).
    const hash3 = (x, y, z, s) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 19.19) * 43758.5453; return h - floor(h); };
    // 1 se o ponto (x, y, z), de normal (nx, ny, nz), cai numa das marcas da grade de células `cs` (chance p por célula). A marca é
    // desenhada NA SUPERFÍCIE: a distância ao centro é medida no plano do ponto (sem a componente da normal) — um traço de meio
    // comprimento L e meia largura W, na direção sorteada (projetada no plano); só vale do mesmo lado do corpo (|d·n| < 0,7·cs).
    function mark(x, y, z, nx, ny, nz, cs, p, L, W, salt) {
        const gx = floor(x / cs), gy = floor(y / cs), gz = floor(z / cs);
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
            const cx = gx + i, cy = gy + j, cz = gz + k, h = hash3(cx, cy, cz, salt);
            if (h > p) continue;
            const q = h / p, ox = (cx + hash3(cx, cy, cz, salt + 1.3)) * cs, oy = (cy + hash3(cx, cy, cz, salt + 2.7)) * cs, oz = (cz + hash3(cx, cy, cz, salt + 4.1)) * cs;
            let dx = x - ox, dy = y - oy, dz = z - oz;
            const dn = dx * nx + dy * ny + dz * nz;
            if (abs(dn) > cs * 0.7) continue;
            dx -= dn * nx; dy -= dn * ny; dz -= dn * nz;                         // no plano da superfície
            let ax = hash3(cx, cy, cz, salt + 5.9) - 0.5, ay = hash3(cx, cy, cz, salt + 7.3) - 0.5, az = hash3(cx, cy, cz, salt + 8.8) - 0.5;
            const an = ax * nx + ay * ny + az * nz; ax -= an * nx; ay -= an * ny; az -= an * nz;
            const al = sqrt(ax * ax + ay * ay + az * az) || 1; ax /= al; ay /= al; az /= al;
            const along = dx * ax + dy * ay + dz * az, px = dx - along * ax, py = dy - along * ay, pz = dz - along * az;
            const l = L * (0.6 + 0.8 * q), w = W * (0.7 + 0.6 * hash3(cx, cy, cz, salt + 9.9));
            if ((along * along) / (l * l) + (px * px + py * py + pz * pz) / (w * w) < 1) return 1;
        }
        return 0;
    }
    const CLOTH = new Set([M.shirt, M.jeans, M.sock, M.accent, M.accent2]);
    function paintDamage(s, bone, pos, nrm, mat, tone, n) {
        const lv = s.dmg | 0;
        if (!lv) return;
        const part = bone.replace(/_[RL]$/, ''), salt = (bone.length * 7.31 + (bone.endsWith('_L') ? 3.3 : 0)) + (s.dmgSeed || 0);
        for (let j = 0; j < n; j++) {
            const x = pos[j * 3], y = pos[j * 3 + 1], z = pos[j * 3 + 2], nx = nrm[j * 3], ny = nrm[j * 3 + 1], nz = nrm[j * 3 + 2], m = mat[j], cloth = CLOTH.has(m), skin = m === M.skin;
            const mk = (cs, p, L, W, sl) => mark(x, y, z, nx, ny, nz, cs, p, L, W, salt + sl);
            if (part === 'head') {                                             // rosto: sangue do nariz/boca (2+), corte na testa e sangue escorrendo (3)
                if (!(skin || m === M.mouth || m === M.beard || m === M.brow)) continue;
                const front = y > 5.5;
                if (lv >= 2 && front && abs(x) < 1.6 + (lv - 2) * 1.2 && z > 2.6 && z < 6.4) { mat[j] = M.flesh; tone[j] = -1; continue; }
                if (lv >= 3 && front && ((x - 2.5) ** 2) / 9 + ((z - 10.5) ** 2) / 2.2 < 1) { mat[j] = M.flesh; tone[j] = 0; continue; }
                if (lv >= 3 && mk(3.2, 0.5, 2.0, 0.9, 3)) { mat[j] = M.flesh; tone[j] = -1; continue; }
                if (lv >= 2 && skin && mk(4.0, 0.35, 1.4, 1.2, 11)) tone[j] -= 2;                 // hematoma
                continue;
            }
            if (!cloth && !skin) continue;
            // 3: rasgos (a pele aparece; borda esfiapada escura; ralado dentro) e manchas de sangue
            if (lv >= 3 && cloth) {
                if (mk(7.5, 0.34, 3.6, 1.35, 13)) { const sc = mk(2.4, 0.45, 1.1, 0.35, 21); mat[j] = sc ? M.flesh : M.skin; tone[j] = sc ? 0 : 0; continue; }
                if (mk(7.5, 0.34, 4.2, 1.95, 13)) { tone[j] = -3; continue; }
            }
            if (lv >= 3 && mk(7.0, 0.3, 2.4, 1.8, 17)) { mat[j] = M.flesh; tone[j] = -2; continue; }
            // 2+: cortes e arranhões (vermelho vivo, finos) e hematomas na pele
            if (lv >= 2 && mk(5.2, lv >= 3 ? 0.36 : 0.32, 2.3, 0.55, 5)) { mat[j] = M.flesh; tone[j] = 1; continue; }
            if (lv >= 2 && skin && mk(5.0, 0.32, 1.6, 1.2, 9)) { tone[j] -= 2; continue; }
            // 1+: terra (marrom escuro; na pele, pouca)
            if (mk(cloth ? 4.6 : 5.5, cloth ? (lv === 1 ? 0.36 : 0.2) : 0.12, 1.7, 0.95, 1)) { mat[j] = M.wood; tone[j] = -1; }
        }
    }
    function paintHairBlood(s, pos, nrm, mat, tone, n) {
        if ((s.dmg | 0) < 3) return;
        for (let j = 0; j < n; j++) {
            const x = pos[j * 3], y = pos[j * 3 + 1], z = pos[j * 3 + 2];
            if ((y > 2 && mark(x, y, z, nrm[j * 3], nrm[j * 3 + 1], nrm[j * 3 + 2], 3.6, 0.5, 2.4, 1.0, 31 + (s.dmgSeed || 0))) || (((x - 2.5) ** 2) / 10 + ((z - 12.5) ** 2) / 4 < 1 && y > 3)) { mat[j] = M.flesh; tone[j] = -1; }
        }
    }

    // ------------------------------------------------------------------ partes de uma ficha
    const _cache = new Map();
    // A ficha usa a malha? (G.MESH3D = false desliga tudo: compara com o desenho geométrico)
    const usable = (s) => !!DATA && G.MESH3D !== false && s.mesh3d !== false;

    // body: { nome: parte assada } das partes que a malha faz (corpo e cabelo da malha). sdfKeep(nome) = a ficha ainda usa a forma geométrica.
    function meshParts(spec, spacing) {
        const s = G.fullSpec(spec), key = s.gender === 'f' ? 'f' : 'm';
        const ck = JSON.stringify([key, s.body, s.top, s.bottom, s.shoes, s.gloves, s.watch, s.hair, s.head, s.mask, s.eyes, s.beard, s.glasses, s.pattern, s.chain, s.zip, s.dmg | 0, s.dmgSeed || 0, spacing]);
        if (_cache.has(ck)) return _cache.get(ck);
        const F = fitFor(key), C = DATA.chars[key], mw = MORPH[s.body] || MORPH.normal;
        const sdf = G.buildParts(s);                                        // (as texturas procedurais de cada parte: rosto, estampa, cadarço…)
        const step = spacing * 0.85;
        const groups = {};                                                   // osso → { cloud de saída }
        const tmpP = new Float32Array(3), tmpN = new Float32Array(3);
        for (const e of C.meshes) {
            const m = meshOf(e);
            const pos = new Float32Array(m.pos);
            if (m.morph) for (let k = 0; k < 3; k++) if (mw[k]) { const D = m.morph[k]; for (let i = 0; i < pos.length; i++) pos[i] += mw[k] * D[i]; }
            const cl = new Cloud();
            sample(m, pos, F, step, cl);
            for (let i = 0; i < cl.n; i++) {
                const b = BONES[cl.B[i * 2]];
                (groups[b] || (groups[b] = [])).push({ cl, i, kind: m.mat, tex: m.tex });
            }
        }
        // cabelo da malha (os cartões com transparência: só o que é opaco na textura), preso à cabeça; corte do chapéu como no geométrico
        const hairName = !s.hair || s.hair === 'bald' || s.mask === 'balaclava' ? null : HAIR[s.hair];
        let hairCloud = null;
        if (hairName && DATA.hairs[hairName]) {
            const m = meshOf(DATA.hairs[hairName]), Fm = fitFor('m');          // (os cabelos foram feitos na cabeça masculina)
            hairCloud = new Cloud();
            sample(m, m.pos, Fm, step, hairCloud, { boneOf: 'head', alpha: m.tex });
            hairCloud.tex = m.tex; hairCloud.F = Fm;
        }
        const out = {};
        const P = [0, 0, 0], N = [0, 0, 0];
        for (const b of BONES) {
            const list = groups[b];
            if (!list || !list.length) continue;
            const n = list.length, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), pos2 = new Float32Array(n * 3), nrm2 = new Float32Array(n * 3);
            const mat = new Int16Array(n), b2 = new Uint8Array(n), w2 = new Float32Array(n), tone0 = new Int16Array(n);
            for (let j = 0; j < n; j++) {
                const { cl, i, kind, tex } = list[j];
                P[0] = cl.P[i * 3]; P[1] = cl.P[i * 3 + 1]; P[2] = cl.P[i * 3 + 2];
                N[0] = cl.N[i * 3]; N[1] = cl.N[i * 3 + 1]; N[2] = cl.N[i * 3 + 2];
                toBone(F, b, P, N, pos, nrm, j * 3);
                const bb = BONES[cl.B[i * 2 + 1]];
                b2[j] = cl.B[i * 2 + 1]; w2[j] = cl.W[i];
                toBone(F, bb, P, N, pos2, nrm2, j * 3);
                if (kind === 'eye') { pos[j * 3 + 1] += 1.1; pos2[j * 3 + 1] += 1.1; }      // globo ocular à frente das pálpebras: o olho grande pintado aparece inteiro
                tmpP[0] = pos[j * 3]; tmpP[1] = pos[j * 3 + 1]; tmpP[2] = pos[j * 3 + 2];
                mat[j] = matFor(s, kind, b, tmpP);
                if (tex && (kind === 'shirt' || kind === 'jeans')) {                // dobras do tecido (luminância da textura da roupa)
                    const L = texel(tex, cl.UV[i * 2], cl.UV[i * 2 + 1], 0) / tex.mean;
                    tone0[j] = L < 0.72 ? -1 : L > 1.3 ? 1 : 0;
                }
            }
            const name = b, sp = sdf[name];
            // a textura procedural da ficha (rosto, estampa, cadarço…) no espaço do osso e o estado de dano (s.dmg: terra, cortes, rasgos,
            // sangue) — também em cada expressão do rosto (sp.faces: os mesmos pontos, outro material/tom)
            const paint = (tex, mat1) => {
                const tone = Int16Array.from(tone0);
                if (tex) {
                    const pid = new Int16Array(n), d1 = new Float64Array(n), d2 = new Float64Array(n).fill(1e9);
                    const t2 = tex(pos, nrm, mat1, pid, d1, d2, n);
                    for (let j = 0; j < n; j++) tone[j] += t2[j];
                }
                paintDamage(s, b, pos, nrm, mat1, tone, n);
                const T8 = new Int8Array(n);
                for (let j = 0; j < n; j++) T8[j] = max(-3, min(3, tone[j]));
                return T8;
            };
            let faces = null;
            if (sp && sp.faces) {
                faces = {};
                for (const [e, tex] of Object.entries(sp.faces)) { const fm = Int16Array.from(mat); faces[e] = { mat: fm, tone: paint(tex, fm) }; }
            }
            const T8 = paint(sp && sp.tex, mat);
            out[name] = { name, bone: b, group: PART_GROUP[b], pos, nrm, mat, tone: T8, n, pos2, nrm2, b2, w2, mesh: true, faces };
        }
        if (hairCloud) {
            const cl = hairCloud, Fm = cl.F, cut = s.head in G.HAT_CUT && G.HAT_CUT[s.head] < 90 ? G.HAT_CUT[s.head] : Infinity;
            const pos = new Float32Array(cl.n * 3), nrm = new Float32Array(cl.n * 3), mat = new Int16Array(cl.n), tone = new Int8Array(cl.n);
            let n = 0;
            for (let i = 0; i < cl.n; i++) {
                P[0] = cl.P[i * 3]; P[1] = cl.P[i * 3 + 1]; P[2] = cl.P[i * 3 + 2];
                N[0] = cl.N[i * 3]; N[1] = cl.N[i * 3 + 1]; N[2] = cl.N[i * 3 + 2];
                toBone(Fm, 'head', P, N, pos, nrm, n * 3);
                if (pos[n * 3 + 2] > cut) continue;
                // cartão de cabelo: a normal aponta para fora da cabeça (os dois lados do cartão são o mesmo cabelo)
                const ox = pos[n * 3], oy = pos[n * 3 + 1] + 2.0, oz = pos[n * 3 + 2] - 12.0;
                if (ox * nrm[n * 3] + oy * nrm[n * 3 + 1] + oz * nrm[n * 3 + 2] < 0) { nrm[n * 3] *= -1; nrm[n * 3 + 1] *= -1; nrm[n * 3 + 2] *= -1; }
                mat[n] = M.hair;
                const L = texel(cl.tex, cl.UV[i * 2], cl.UV[i * 2 + 1], 1) / cl.tex.mean;
                tone[n] = L < 0.7 ? -1 : L > 1.35 ? 1 : 0;
                n++;
            }
            paintHairBlood(s, pos, nrm, mat, tone, n);
            out.hair = { name: 'hair', bone: 'head', group: GR.hair, pos: pos.subarray(0, n * 3), nrm: nrm.subarray(0, n * 3), mat: mat.subarray(0, n), tone: tone.subarray(0, n), n, mesh: true };
        }
        // esticão "adulto" (G.ADULT), como nas partes geométricas: cada osso na sua escala (o 2º osso de cada ponto, na dele)
        for (const p of Object.values(out)) {
            const sh = G.shapeFor(p.bone);
            for (let i = 0; i < p.n; i++) {
                if (sh) scale(p.pos, p.nrm, i * 3, sh);
                if (p.pos2) { const s2 = G.shapeFor(BONES[p.b2[i]]); if (s2) scale(p.pos2, p.nrm2, i * 3, s2); }
            }
            if (p.pos2) p.bones2 = BONES;
        }
        const res = { parts: out, hairMesh: !!hairCloud };
        _cache.set(ck, res);
        if (_cache.size > 24) _cache.delete(_cache.keys().next().value);
        return res;
    }
    function scale(P, N, o, s) {
        P[o] *= s[0]; P[o + 1] *= s[1]; P[o + 2] *= s[2];
        const nx = N[o] / s[0], ny = N[o + 1] / s[1], nz = N[o + 2] / s[2], l = sqrt(nx * nx + ny * ny + nz * nz) || 1;
        N[o] = nx / l; N[o + 1] = ny / l; N[o + 2] = nz / l;
    }

    // LOW POLY (estilo de cidade low poly: faces chapadas, cor da paleta por região): a MESMA malha, encaixe e regras de roupa do
    // meshParts, mas por VÉRTICE e com os índices simplificados (o meshoptimizer, assado em malha3d_low.js: só vértices originais — os
    // pesos dos ossos, os portes e as cores continuam valendo). idxFor(entrada da malha em NPC_MESH3D) → índices simplificados (ou null: a malha inteira). (Por entrada, não por nome: o tênis masculino e o
    // feminino têm o mesmo nome.)
    // Saída: triângulos SEM índice (cada canto é seu: faces chapadas, uma cor por face) no formato do boneco 3D: p1 (osso 1), p2 (osso 2),
    // sk = [osso 1, osso 2, peso do 2º], mat = o material da face (a maioria dos cantos). Ossos pela lista BONES deste arquivo.
    // os índices assados (generator/malha3d_low.js, NPC_MESH3D_LOW — tools/asset_baker/lowpoly/bakelow.cjs, meshoptimizer), por entrada
    let _low = null;
    function lowIdx(e) {
        if (!_low) {
            _low = new Map();
            const LW = typeof NPC_MESH3D_LOW !== 'undefined' ? NPC_MESH3D_LOW : null;
            if (LW && DATA) {
                const u16 = (s) => new Uint16Array(bytes(s).buffer);
                for (const k of Object.keys(DATA.chars)) for (const m of DATA.chars[k].meshes) if (LW.chars[k] && LW.chars[k][m.name]) _low.set(m, u16(LW.chars[k][m.name]));
                for (const [n, m] of Object.entries(DATA.hairs)) if (LW.hairs[n]) _low.set(m, u16(LW.hairs[n]));
            }
        }
        return _low.get(e) || null;
    }
    function lowBody(spec, idxFor = lowIdx, acc = true) {
        const s = G.fullSpec(spec), key = s.gender === 'f' ? 'f' : 'm';
        const F = fitFor(key), C = DATA.chars[key], mw = MORPH[s.body] || MORPH.normal, sdf = G.buildParts(s);
        const tris = [];
        const P = [0, 0, 0], N = [0, 0, 0], o1 = new Float32Array(3), on1 = new Float32Array(3), o2 = new Float32Array(3), on2 = new Float32Array(3);
        const meshes = C.meshes.map((e) => [e, meshOf(e), e.mat]);
        const hairName = !s.hair || s.hair === 'bald' || s.mask === 'balaclava' ? null : HAIR[s.hair];
        const meshHair = !!(hairName && DATA.hairs[hairName]);
        if (meshHair) meshes.push([DATA.hairs[hairName], meshOf(DATA.hairs[hairName]), 'hair']);
        const cut = s.head in G.HAT_CUT && G.HAT_CUT[s.head] < 90 ? G.HAT_CUT[s.head] : Infinity;      // (de chapéu: o cabelo acima dele sai, como nos pontos)
        for (const [e, m, kind] of meshes) {
            const pos = new Float32Array(m.pos);
            if (m.morph) for (let k = 0; k < 3; k++) if (mw[k]) { const D = m.morph[k]; for (let i = 0; i < pos.length; i++) pos[i] += mw[k] * D[i]; }
            const I = (idxFor && idxFor(e)) || m.idx, Fv = kind === 'hair' ? fitFor('m') : F;
            const vert = new Map();
            const V = (v) => {
                let r = vert.get(v);
                if (r) return r;
                for (let k = 0; k < 3; k++) { P[k] = pos[v * 3 + k]; N[k] = m.nrm[v * 3 + k]; }
                let b1 = 'head', b2 = 'head', w = 0;
                if (kind !== 'hair') {
                    let w1 = -1, ww2 = -1, i1 = 0, i2 = 0;
                    for (let q = 0; q < 4; q++) { const wt = m.bw[v * 8 + 4 + q]; if (wt > w1) { ww2 = w1; i2 = i1; w1 = wt; i1 = q; } else if (wt > ww2) { ww2 = wt; i2 = q; } }
                    b1 = BONES[m.bw[v * 8 + i1]]; b2 = BONES[m.bw[v * 8 + i2]];
                    w = ww2 > 0 && b2 !== b1 ? ww2 / (w1 + ww2) : 0;
                    if (w < 0.02) { w = 0; b2 = b1; }
                }
                toBone(Fv, b1, P, N, o1, on1, 0); toBone(Fv, b2, P, N, o2, on2, 0);
                if (kind === 'eye') { o1[1] += 1.1; o2[1] += 1.1; }
                const mat = kind === 'hair' ? M.hair : matFor(s, kind, b1, o1);      // (o globo do olho é pele, como nos pontos: o shader pinta nele o olho do desenho)
                const sh1 = G.shapeFor(b1), sh2 = G.shapeFor(b2);
                const p1 = sh1 ? [o1[0] * sh1[0], o1[1] * sh1[1], o1[2] * sh1[2]] : [o1[0], o1[1], o1[2]];
                const p2 = sh2 ? [o2[0] * sh2[0], o2[1] * sh2[1], o2[2] * sh2[2]] : [o2[0], o2[1], o2[2]];
                // o: o canto no espaço do osso 1 SEM o esticão (as texturas procedurais e o dano usam esse espaço); h: o mesmo, na cabeça
                // (1: o rosto) e no peito (2: a estampa), que o shader pinta por pixel
                const sid = b1 === 'head' ? 1 : b1 === 'chest' && kind !== 'hair' ? 2 : 0;
                // n1/n2: a NORMAL do vértice da malha (luz suave) no espaço de cada osso, com o esticão (a normal escala ao contrário)
                r = { p1, p2, b1, b2, w, mat, o: [o1[0], o1[1], o1[2]], n: [on1[0], on1[1], on1[2]], h: sid ? [o1[0], o1[1], o1[2], sid] : null, n1: nScale(on1, sh1), n2: nScale(on2, sh2) };
                vert.set(v, r);
                return r;
            };
            // a cor da face pela REGIÃO DO OSSO da maioria dos cantos (canela, coxa, braço…): a face toda fica de um lado da barra — a bermuda
            // termina no joelho, a manga no ombro — em vez de misturar as cores dos cantos (o pacote não tem pele debaixo da roupa: a perna
            // de bermuda e o braço de regata são a própria calça/camiseta pintada de pele, como nos pontos)
            const part = (x) => x.b1.replace(/_[RL]$/, '');
            for (let t = 0; t < I.length; t += 3) {
                const a = V(I[t]), b = V(I[t + 1]), c = V(I[t + 2]);
                const pa = part(a), pb = part(b), pc = part(c), k = pa === pb || pa === pc ? pa : pb === pc ? pb : pa;
                const own = [a, b, c].filter((x) => part(x) === k), mat = own.length >= 2 && own[0].mat !== own[1].mat && own[2] ? (own[1].mat === own[2].mat ? own[1].mat : own[0].mat) : own[0].mat;
                if (kind === 'hair' && (a.o[2] + b.o[2] + c.o[2]) / 3 > cut) continue;
                // o centro e a normal da face no espaço (sem esticão) do osso da maioria: para a estampa, o dano e o sangue no cabelo
                const bone = own[0].b1, mine = own.filter((x) => x.b1 === bone), cen = [0, 0, 0], nr = [0, 0, 0];
                for (const x of mine) for (let q = 0; q < 3; q++) { cen[q] += x.o[q] / mine.length; nr[q] += x.n[q]; }
                tris.push({ v: [a, b, c], mat, tone: 0, kind, bone, cen, nr });
            }
        }
        // ESTAMPA (a textura procedural de cada parte: listras da camisa, cadarço…; o rosto não — o shader pinta por pixel) e DANO (s.dmg:
        // terra, cortes, sangue) por FACE, no centro dela: o mesmo desenho dos pontos, em pedaços do tamanho das faces
        const byBone = new Map();
        for (const t of tris) { const k = t.kind === 'hair' ? 'hair' : t.bone; let L = byBone.get(k); if (!L) byBone.set(k, (L = [])); L.push(t); }
        for (const [k, L] of byBone) {
            const n = L.length, cp = new Float32Array(n * 3), cn = new Float32Array(n * 3), mat = new Int16Array(n), tone = new Int16Array(n);
            L.forEach((t, j) => { const l = Math.hypot(...t.nr) || 1; for (let q = 0; q < 3; q++) { cp[j * 3 + q] = t.cen[q]; cn[j * 3 + q] = t.nr[q] / l; } mat[j] = t.mat; });
            const sp = sdf[k];
            if (k !== 'head' && k !== 'hair' && sp && sp.tex) {
                const m0 = Int16Array.from(mat), t2 = sp.tex(cp, cn, mat, new Int16Array(n), new Float64Array(n), new Float64Array(n).fill(1e9), n);
                for (let j = 0; j < n; j++) tone[j] += t2[j];
                // no peito, o que é fino demais para uma face (listras, flores, botões, zíper, corrente) volta ao tecido: o shader pinta por pixel
                if (k === 'chest') for (let j = 0; j < n; j++) if (mat[j] !== m0[j] && FINE.has(mat[j])) mat[j] = m0[j];
            }
            if (k === 'hair') paintHairBlood(s, cp, cn, mat, tone, n);
            else paintDamage(s, k, cp, cn, mat, tone, n);
            L.forEach((t, j) => { t.mat = mat[j]; t.tone = max(-3, min(3, tone[j])); });
        }
        // ACESSÓRIOS: as partes que continuam geométricas (chapéu, colete, bolsa, alça, os cabelos que a malha não tem) viram triângulos
        // — a superfície da forma (polyPart: surface nets + simplificação) — com a cor e a estampa de cada face pela própria forma
        if (acc) for (const [k, part] of Object.entries(sdf)) {
            if (REPLACED.has(k) || (k === 'hair' && meshHair)) continue;
            const L = polyPart(part, POLY_TARGET[k] || 240), sh = G.shapeFor(part.bone);
            const corner = (q) => { const x = L.pos[q], y = L.pos[q + 1], z = L.pos[q + 2], n = nScale(L.nrm.subarray(q, q + 3), sh); return { p1: sh ? [x * sh[0], y * sh[1], z * sh[2]] : [x, y, z], b1: part.bone, b2: part.bone, w: 0, h: null, n1: n, n2: n }; };
            for (let t = 0; t < L.tris; t++) {
                const v = [];
                for (let c = 0; c < 3; c++) v.push(corner(t * 9 + c * 3));
                tris.push({ v, mat: L.mat[t], tone: L.tone[t] });
            }
        }
        // empacotado (por canto): ossos pelo índice de BONES. fp = o canto no espaço da cabeça ou do peito + qual (1 cabeça, 2 peito; as
        // faces com os 3 cantos no mesmo; as outras, 0) — o shader pinta por PIXEL o rosto (a receita do makeTexHead: olhos, sobrancelhas,
        // boca, barba, óculos, máscara e as expressões) e a estampa do peito (makeTexChest): numa malha de poucas faces, pintados por
        // face, eles sumiriam ou virariam um mosaico. tn = o tom da face.
        const n = tris.length * 3, p1 = new Float32Array(n * 3), p2 = new Float32Array(n * 3), sk = new Float32Array(n * 3), mt = new Float32Array(n), tn = new Float32Array(n), fp = new Float32Array(n * 4);
        const nr1 = new Float32Array(n * 3), nr2 = new Float32Array(n * 3);
        let o = 0;
        for (const t of tris) {
            const [a, b, c] = t.v, same = a.h && b.h && c.h && a.h[3] === b.h[3] && a.h[3] === c.h[3];
            for (const x of t.v) {
                p1.set(x.p1, o * 3); p2.set(x.p2 || x.p1, o * 3); nr1.set(x.n1, o * 3); nr2.set(x.n2 || x.n1, o * 3);
                sk[o * 3] = BI[x.b1]; sk[o * 3 + 1] = BI[x.b2]; sk[o * 3 + 2] = x.w; mt[o] = t.mat; tn[o] = t.tone;
                if (same) fp.set(x.h, o * 4);
                o++;
            }
        }
        return { bones: BONES, n, tris: tris.length, p1, p2, sk, mt, tn, fp, nr1, nr2, face: faceOf(s), scale: s.scale || 1 };
    }
    // a normal no espaço do osso com o esticão dele (escala ao contrário e normaliza)
    function nScale(nv, sh) {
        const x = sh ? nv[0] / sh[0] : nv[0], y = sh ? nv[1] / sh[1] : nv[1], z = sh ? nv[2] / sh[2] : nv[2], l = sqrt(x * x + y * y + z * z) || 1;
        return [x / l, y / l, z / l];
    }

    // ------------------------------------------------------------------ LOW POLY das partes GEOMÉTRICAS (acessórios)
    // A superfície da forma (as primitivas unidas, Part.eval) por SURFACE NETS numa grade de passo h (um vértice por célula que o zero
    // da distância cruza, na média dos cruzamentos das arestas e puxado para a superfície), depois simplificada (simplifyMesh) até
    // ~target faces. Por face: o material e o tom da forma no centro dela (e a textura procedural da parte, com a normal da forma).
    // → { tris, pos (9 por face: os 3 cantos, espaço do osso, sem o esticão), mat, tone }
    const POLY_TARGET = { hat: 260, vest: 420, bag: 260, strap: 120, hair: 380 };
    const _polyCache = new Map();
    function polyPart(part, target = 240, h = 1.0) {
        const sig = part.name + '|' + target + '|' + h + '|' + JSON.stringify(part.prims, (k, v) => (k === '_prep' ? undefined : v));
        const hit = _polyCache.get(sig);
        if (hit) return hit;
        const nets = surfaceNets(part, h), idx = simplifyMesh(nets.pos, nets.idx, target), T = idx.length / 3, P = nets.pos;
        const pos = new Float32Array(T * 9), cp = new Float32Array(T * 3), cn = new Float32Array(T * 3), mat = new Int16Array(T), tone = new Int16Array(T);
        const pid = new Int16Array(T), d1 = new Float64Array(T), d2 = new Float64Array(T), tmp = {}, e = 0.04;
        for (let t = 0; t < T; t++) {
            for (let c = 0; c < 3; c++) for (let q = 0; q < 3; q++) pos[t * 9 + c * 3 + q] = P[idx[t * 3 + c] * 3 + q];
            let x = 0, y = 0, z = 0;
            for (let c = 0; c < 3; c++) { x += pos[t * 9 + c * 3] / 3; y += pos[t * 9 + c * 3 + 1] / 3; z += pos[t * 9 + c * 3 + 2] / 3; }
            // a normal da forma no centro e o ponto da superfície mais perto dele
            const gx = part.eval(x + e, y, z, tmp) - part.eval(x - e, y, z, tmp), gy = part.eval(x, y + e, z, tmp) - part.eval(x, y - e, z, tmp), gz = part.eval(x, y, z + e, tmp) - part.eval(x, y, z - e, tmp);
            const gl = sqrt(gx * gx + gy * gy + gz * gz) || 1, d = part.eval(x, y, z, tmp);
            x -= (d * gx) / gl; y -= (d * gy) / gl; z -= (d * gz) / gl;
            part.eval(x, y, z, tmp, true);
            cp[t * 3] = x; cp[t * 3 + 1] = y; cp[t * 3 + 2] = z; cn[t * 3] = gx / gl; cn[t * 3 + 1] = gy / gl; cn[t * 3 + 2] = gz / gl;
            mat[t] = tmp.mat; tone[t] = tmp.tone; pid[t] = tmp.pid; d1[t] = tmp.d1; d2[t] = tmp.d2;
        }
        if (part.tex) { const t2 = part.tex(cp, cn, mat, pid, d1, d2, T); for (let t = 0; t < T; t++) tone[t] += t2[t]; }
        // a normal de cada canto: o gradiente da forma ali (luz suave nos acessórios)
        const nrm = new Float32Array(T * 9);
        for (let q = 0; q < T * 9; q += 3) {
            const x = pos[q], y = pos[q + 1], z = pos[q + 2];
            const gx = part.eval(x + e, y, z, tmp) - part.eval(x - e, y, z, tmp), gy = part.eval(x, y + e, z, tmp) - part.eval(x, y - e, z, tmp), gz = part.eval(x, y, z + e, tmp) - part.eval(x, y, z - e, tmp);
            const gl = sqrt(gx * gx + gy * gy + gz * gz) || 1;
            nrm[q] = gx / gl; nrm[q + 1] = gy / gl; nrm[q + 2] = gz / gl;
        }
        const res = { tris: T, pos, mat, tone, cp, cn, nrm };
        _polyCache.set(sig, res);
        if (_polyCache.size > 48) _polyCache.delete(_polyCache.keys().next().value);
        return res;
    }
    // SURFACE NETS: a grade de distâncias, um vértice por célula cruzada pela superfície e um quadrilátero (2 triângulos) por aresta da
    // grade que a superfície corta. → { pos, idx }
    function surfaceNets(part, h) {
        const [lo, hi] = part.bounds(), tmp = {};
        const nx = Math.ceil((hi[0] - lo[0]) / h) + 1, ny = Math.ceil((hi[1] - lo[1]) / h) + 1, nz = Math.ceil((hi[2] - lo[2]) / h) + 1;
        const D = new Float32Array(nx * ny * nz), id = (i, j, k) => (k * ny + j) * nx + i;
        for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) D[id(i, j, k)] = part.eval(lo[0] + i * h, lo[1] + j * h, lo[2] + k * h, tmp);
        const Vx = new Int32Array(nx * ny * nz).fill(-1), P = [], c = new Float64Array(8);
        for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
            let neg = 0;
            for (let q = 0; q < 8; q++) { c[q] = D[id(i + (q & 1), j + ((q >> 1) & 1), k + ((q >> 2) & 1))]; if (c[q] < 0) neg++; }
            if (!neg || neg === 8) continue;
            let s = 0, x = 0, y = 0, z = 0;
            for (const [a, b] of NET_EDGES) if ((c[a] < 0) !== (c[b] < 0)) {
                const t = c[a] / (c[a] - c[b]), ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1;
                x += ax + ((b & 1) - ax) * t; y += ay + (((b >> 1) & 1) - ay) * t; z += az + (((b >> 2) & 1) - az) * t; s++;
            }
            let px = lo[0] + (i + x / s) * h, py = lo[1] + (j + y / s) * h, pz = lo[2] + (k + z / s) * h;
            for (let it = 0; it < 2; it++) {                                       // (puxado para a superfície: as quinas da forma ficam)
                const e = 0.05, d = part.eval(px, py, pz, tmp);
                const gx = part.eval(px + e, py, pz, tmp) - part.eval(px - e, py, pz, tmp), gy = part.eval(px, py + e, pz, tmp) - part.eval(px, py - e, pz, tmp), gz = part.eval(px, py, pz + e, tmp) - part.eval(px, py, pz - e, tmp);
                const gl = sqrt(gx * gx + gy * gy + gz * gz);
                if (!(gl > 1e-9)) break;
                const st = max(-h * 0.5, min(h * 0.5, d));
                px -= (st * gx) / gl; py -= (st * gy) / gl; pz -= (st * gz) / gl;
            }
            Vx[id(i, j, k)] = P.length / 3; P.push(px, py, pz);
        }
        const I = [];
        const quad = (a, b, c2, d, flip) => { if (a < 0 || b < 0 || c2 < 0 || d < 0) return; if (flip) I.push(a, c2, b, a, d, c2); else I.push(a, b, c2, a, c2, d); };
        for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
            const in0 = D[id(i, j, k)] < 0;
            if (in0 !== D[id(i + 1, j, k)] < 0) quad(Vx[id(i, j - 1, k - 1)], Vx[id(i, j, k - 1)], Vx[id(i, j, k)], Vx[id(i, j - 1, k)], in0);
            if (in0 !== D[id(i, j + 1, k)] < 0) quad(Vx[id(i - 1, j, k - 1)], Vx[id(i - 1, j, k)], Vx[id(i, j, k)], Vx[id(i, j, k - 1)], in0);
            if (in0 !== D[id(i, j, k + 1)] < 0) quad(Vx[id(i - 1, j - 1, k)], Vx[id(i, j - 1, k)], Vx[id(i, j, k)], Vx[id(i - 1, j, k)], in0);
        }
        return { pos: Float32Array.from(P), idx: Uint32Array.from(I) };
    }
    const NET_EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

    // SIMPLIFICAÇÃO de malha (erro quadrático de Garland & Heckbert, colapso de MEIA aresta): um índice NOVO que só usa vértices
    // ORIGINAIS (cada colapso junta um vértice no vizinho). Solda por posição antes (sem rachaduras); borda aberta pesa muito mais (o
    // contorno da peça fica); colapso que vira um triângulo do avesso (ou o achata demais) é recusado. Sem dependências: roda no build e
    // no Worker (os acessórios low poly, polyPart). (O corpo usa os índices do meshoptimizer, assados: tools/asset_baker/lowpoly/bakelow.cjs.)
    function simplifyMesh(pos, idx, targetTris, { boundaryWeight = 40, weldEps = 1e-5 } = {}) {
        const nv = pos.length / 3;
        // ---------------------------------------------------------------- solda: um representante por posição
        const rep = new Int32Array(nv), key = new Map(), q = 1 / weldEps;
        for (let v = 0; v < nv; v++) {
            const k = Math.round(pos[v * 3] * q) + ',' + Math.round(pos[v * 3 + 1] * q) + ',' + Math.round(pos[v * 3 + 2] * q);
            const r = key.get(k);
            if (r === undefined) { key.set(k, v); rep[v] = v; } else rep[v] = r;
        }
        let F = [];
        for (let t = 0; t < idx.length; t += 3) {
            const a = rep[idx[t]], b = rep[idx[t + 1]], c = rep[idx[t + 2]];
            if (a !== b && b !== c && c !== a) F.push([a, b, c]);
        }
        const P = (v, k) => pos[v * 3 + k];
        // ---------------------------------------------------------------- quádricas (10 coeficientes da matriz simétrica 4×4)
        const Q = new Float64Array(nv * 10);
        const addPlane = (v, a, b, c, d, w) => {
            const o = v * 10;
            Q[o] += w * a * a; Q[o + 1] += w * a * b; Q[o + 2] += w * a * c; Q[o + 3] += w * a * d;
            Q[o + 4] += w * b * b; Q[o + 5] += w * b * c; Q[o + 6] += w * b * d;
            Q[o + 7] += w * c * c; Q[o + 8] += w * c * d; Q[o + 9] += w * d * d;
        };
        const faceN = (f) => {
            const [a, b, c] = f;
            const ux = P(b, 0) - P(a, 0), uy = P(b, 1) - P(a, 1), uz = P(b, 2) - P(a, 2), vx = P(c, 0) - P(a, 0), vy = P(c, 1) - P(a, 1), vz = P(c, 2) - P(a, 2);
            const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
            return [nx, ny, nz, l];
        };
        for (const f of F) {
            const [nx, ny, nz, l] = faceN(f);
            if (l < 1e-12) continue;
            const a = nx / l, b = ny / l, c = nz / l, d = -(a * P(f[0], 0) + b * P(f[0], 1) + c * P(f[0], 2)), w = l * 0.5;
            for (const v of f) addPlane(v, a, b, c, d, w);
        }
        // borda aberta: um plano perpendicular à face, passando pela aresta (pesado)
        const edgeCount = new Map(), ek = (a, b) => (a < b ? a * nv + b : b * nv + a);
        for (const f of F) for (let i = 0; i < 3; i++) { const k = ek(f[i], f[(i + 1) % 3]); edgeCount.set(k, (edgeCount.get(k) || 0) + 1); }
        for (const f of F) {
            const [nx, ny, nz, l] = faceN(f);
            if (l < 1e-12) continue;
            for (let i = 0; i < 3; i++) {
                const a = f[i], b = f[(i + 1) % 3];
                if (edgeCount.get(ek(a, b)) !== 1) continue;
                const ex = P(b, 0) - P(a, 0), ey = P(b, 1) - P(a, 1), ez = P(b, 2) - P(a, 2);
                let px = ey * nz - ez * ny, py = ez * nx - ex * nz, pz = ex * ny - ey * nx;
                const pl = Math.hypot(px, py, pz);
                if (pl < 1e-12) continue;
                px /= pl; py /= pl; pz /= pl;
                const d = -(px * P(a, 0) + py * P(a, 1) + pz * P(a, 2)), w = boundaryWeight * Math.hypot(ex, ey, ez) ** 2;
                addPlane(a, px, py, pz, d, w); addPlane(b, px, py, pz, d, w);
            }
        }
        const err = (o, x, y, z) => Q[o] * x * x + 2 * Q[o + 1] * x * y + 2 * Q[o + 2] * x * z + 2 * Q[o + 3] * x + Q[o + 4] * y * y + 2 * Q[o + 5] * y * z
            + 2 * Q[o + 6] * y + Q[o + 7] * z * z + 2 * Q[o + 8] * z + Q[o + 9];
        // custo de juntar u em v (v fica): o erro das duas quádricas somadas na posição de v
        const cost = (u, v) => { const o1 = u * 10, o2 = v * 10, x = P(v, 0), y = P(v, 1), z = P(v, 2); return err(o1, x, y, z) + err(o2, x, y, z); };
        // ---------------------------------------------------------------- vizinhança: vértice → faces
        const alive = F.map(() => true), vf = new Map();
        F.forEach((f, i) => { for (const v of f) { let s = vf.get(v); if (!s) vf.set(v, s = new Set()); s.add(i); } });
        const ver = new Int32Array(nv);
        // heap de candidatos [custo, u, v, versão de u, versão de v]
        const H = [];
        const push = (e) => { H.push(e); let i = H.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (H[p][0] <= H[i][0]) break; [H[p], H[i]] = [H[i], H[p]]; i = p; } };
        const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < H.length && H[l][0] < H[m][0]) m = l; if (r < H.length && H[r][0] < H[m][0]) m = r; if (m === i) break; [H[m], H[i]] = [H[i], H[m]]; i = m; } } return top; };
        const enqueue = (a, b) => { push([cost(a, b), a, b, ver[a], ver[b]]); push([cost(b, a), b, a, ver[b], ver[a]]); };
        const seen = new Set();
        for (const f of F) for (let i = 0; i < 3; i++) { const a = f[i], b = f[(i + 1) % 3], k = ek(a, b); if (seen.has(k)) continue; seen.add(k); enqueue(a, b); }
        let live = F.length;
        // ---------------------------------------------------------------- colapsos
        while (live > targetTris && H.length) {
            const [, u, v, vu, vv] = pop();
            if (ver[u] !== vu || ver[v] !== vv) continue;                    // (algo mudou em volta: o candidato é velho)
            const fu = vf.get(u);
            if (!fu || !fu.size) continue;
            // as faces de u que sobram (as que não têm v) não podem virar do avesso nem achatar
            let ok = true;
            for (const i of fu) {
                const f = F[i];
                if (f.includes(v)) continue;
                const g = f.map((x) => (x === u ? v : x)), [ax, ay, az, la] = faceN(f), [bx, by, bz, lb] = faceN(g);
                if (lb < 1e-12 || (ax * bx + ay * by + az * bz) < 0.2 * la * lb) { ok = false; break; }
            }
            if (!ok) continue;
            let sv = vf.get(v);
            if (!sv) vf.set(v, sv = new Set());
            for (const i of fu) {
                const f = F[i];
                if (f.includes(v)) { alive[i] = false; live--; for (const x of f) if (x !== u) { const s = vf.get(x); if (s) s.delete(i); } continue; }
                for (let k = 0; k < 3; k++) if (f[k] === u) f[k] = v;
                sv.add(i);
            }
            vf.delete(u);
            for (let k = 0; k < 10; k++) Q[v * 10 + k] += Q[u * 10 + k];
            ver[u]++; ver[v]++;
            const nb = new Set();
            for (const i of sv) for (const x of F[i]) if (x !== v) nb.add(x);
            for (const x of nb) enqueue(v, x);                                  // (só as arestas de v mudaram de custo: as outras seguem valendo)
        }
        const out = [];
        F.forEach((f, i) => { if (alive[i]) out.push(f[0], f[1], f[2]); });
        return Uint32Array.from(out);
    }

    // O rosto e a estampa da ficha para o shader low poly (src/art/Char3D.js, uniforms face, face2 e shirt): [cara fechada, feminino,
    // barba (0 nada, 1 cheia, 2 cavanhaque, 3 bigode), óculos, máscara (0 nada, 1 touca ninja, 2 bandana), o tamanho do rosto do estilo
    // (G.TOON.face), estampa (0 lisa, 1 listras horizontais, 2 verticais, 3 floral, 4 camisa de time, 5 logo), corrente, botões (1 de
    // tecido, 2 de metal), zíper]
    const FINE = new Set([M.accent, M.accent2, M.gold, M.chrome]);
    function faceOf(s) {
        const t = s.top;
        return [s.eyes === 'angry' ? 1 : 0, s.gender === 'f' ? 1 : 0, { beard: 1, goatee: 2, mustache: 3 }[s.beard] || 0, s.glasses ? 1 : 0,
            { balaclava: 1, bandana: 2 }[s.mask] || 0, (G.TOON && G.TOON.face) || 1,
            { stripes_h: 1, stripes_v: 2, floral: 3, jersey: 4, logo: 5 }[s.pattern] || 0, s.chain ? 1 : 0,
            t === 'polo' || t === 'social' ? 1 : t === 'uniform' || t === 'uniform_long' ? 2 : 0, t === 'hoodie' || s.zip ? 1 : 0];
    }

    // Partes do corpo trocadas pela malha (nome da parte geométrica).
    const REPLACED = new Set(Object.keys(PART_GROUP));

    G.paintHairBlood = paintHairBlood;
    Object.assign(G, { MESH3D: !!DATA, meshUsable: usable, meshParts, meshFit: fitFor, MESH_REPLACED: REPLACED, MESH_HAIR: HAIR, lowBody, polyPart, surfaceNets, simplifyMesh, MESH_DATA: DATA });
    return G;
}
