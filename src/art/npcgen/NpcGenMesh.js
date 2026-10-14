// ============================================================================
// NpcGenMesh — o corpo dos personagens 2,5D a partir da MALHA 3D realista (assets/npcs/malha3d.js, extraída por tools/personagens3d do
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
            if (lp[2] < -3.7) return M.sole;
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
            let tone = tone0;
            if (sp && sp.tex) {                                                   // a textura procedural da ficha (rosto, estampa, cadarço…) no espaço do osso
                const pid = new Int16Array(n), d1 = new Float64Array(n), d2 = new Float64Array(n).fill(1e9);
                const t2 = sp.tex(pos, nrm, mat, pid, d1, d2, n);
                for (let j = 0; j < n; j++) tone[j] += t2[j];
            }
            paintDamage(s, b, pos, nrm, mat, tone, n);                                  // estado de dano (s.dmg): terra, cortes, rasgos, sangue
            const T8 = new Int8Array(n);
            for (let j = 0; j < n; j++) T8[j] = max(-3, min(3, tone[j]));
            out[name] = { name, bone: b, group: PART_GROUP[b], pos, nrm, mat, tone: T8, n, pos2, nrm2, b2, w2, mesh: true };
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

    // Partes do corpo trocadas pela malha (nome da parte geométrica).
    const REPLACED = new Set(Object.keys(PART_GROUP));

    G.paintHairBlood = paintHairBlood;
    Object.assign(G, { MESH3D: !!DATA, meshUsable: usable, meshParts, meshFit: fitFor, MESH_REPLACED: REPLACED, MESH_HAIR: HAIR });
    return G;
}
