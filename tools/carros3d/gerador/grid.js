// Superfície em grade (linhas x colunas) com classificação de células por material,
// rebaixos/relevos (insets) e paredes nas bordas entre regiões de profundidades diferentes.
import { vsub, vadd, vmul, vcross, vnorm, vlen, vdot } from './math.js';

export function gridNormals(P, closedJ) {
  const nI = P.length, nJ = P[0].length;
  const N = P.map((row) => row.map(() => [0, 0, 0]));
  const jMax = closedJ ? nJ : nJ - 1;
  for (let i = 0; i < nI - 1; i++)
    for (let j = 0; j < jMax; j++) {
      const j1 = (j + 1) % nJ;
      const d1 = vsub(P[i + 1][j1], P[i][j]);
      const d2 = vsub(P[i][j1], P[i + 1][j]);
      const c = vcross(d1, d2);
      for (const [a, b] of [[i, j], [i + 1, j], [i + 1, j1], [i, j1]]) {
        const n = N[a][b];
        n[0] += c[0]; n[1] += c[1]; n[2] += c[2];
      }
    }
  // linhas degeneradas (todos os pontos iguais): normal média
  for (let i = 0; i < nI; i++) {
    const r = P[i];
    let deg = true;
    for (let j = 1; j < nJ && deg; j++) if (vlen(vsub(r[j], r[0])) > 1e-6) deg = false;
    if (deg) {
      const s = [0, 0, 0];
      for (const n of N[i]) { s[0] += n[0]; s[1] += n[1]; s[2] += n[2]; }
      const m = vnorm(s);
      for (let j = 0; j < nJ; j++) N[i][j] = m.slice();
    }
  }
  // colunas degeneradas (pólos ao longo de i) — soma vizinhos coincidentes
  for (let i = 0; i < nI; i++)
    for (let j = 0; j < nJ; j++) {
      const n = N[i][j];
      if (vlen(n) < 1e-12) {
        // procura vizinho na mesma posição com normal válida
        let s = [0, 0, 0];
        for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) {
          if (a < 0 || a >= nI) continue;
          const bb = closedJ ? (b + nJ) % nJ : b;
          if (bb < 0 || bb >= nJ) continue;
          s = vadd(s, N[a][bb]);
        }
        N[i][j] = s;
      }
    }
  for (let i = 0; i < nI; i++) for (let j = 0; j < nJ; j++) N[i][j] = vnorm(N[i][j]);
  return N;
}

// opts.cell(i, j, centro, normal) -> {m: material, d: profundidade (>0 rebaixo), w: material da parede, skip}
export function emitGrid(mb, P, opts) {
  const { closedJ = false, cell, wallBorders = true, normals } = opts;
  const nI = P.length, nJ = P[0].length;
  const N = normals || gridNormals(P, closedJ);
  const jCells = closedJ ? nJ : nJ - 1;
  const info = [];
  for (let i = 0; i < nI - 1; i++) {
    const row = [];
    for (let j = 0; j < jCells; j++) {
      const j1 = (j + 1) % nJ;
      const c = vmul(vadd(vadd(P[i][j], P[i + 1][j]), vadd(P[i + 1][j1], P[i][j1])), 0.25);
      const n = vnorm(vadd(vadd(N[i][j], N[i + 1][j]), vadd(N[i + 1][j1], N[i][j1])));
      const r = cell(i, j, c, n) || {};
      row.push({ m: r.m || 'pintura', d: r.d || 0, w: r.w || null, skip: !!r.skip, c });
    }
    info.push(row);
  }
  const cache = new Map();
  const vid = (i, j, m, d) => {
    const key = i * 100003 + j + '|' + m + '|' + d;
    let id = cache.get(key);
    if (id === undefined) {
      const p = d ? vsub(P[i][j], vmul(N[i][j], d)) : P[i][j];
      id = mb.vert(m, p, N[i][j]);
      cache.set(key, id);
    }
    return id;
  };
  const pos = (i, j, d) => (d ? vsub(P[i][j], vmul(N[i][j], d)) : P[i][j]);
  const area2 = (a, b, c) => vlen(vcross(vsub(b, a), vsub(c, a)));
  for (let i = 0; i < nI - 1; i++)
    for (let j = 0; j < jCells; j++) {
      const C = info[i][j];
      if (C.skip) continue;
      const j1 = (j + 1) % nJ;
      const a = [i, j], b = [i + 1, j], c = [i + 1, j1], d = [i, j1];
      const pa = P[a[0]][a[1]], pb = P[b[0]][b[1]], pc = P[c[0]][c[1]], pd = P[d[0]][d[1]];
      if (area2(pa, pb, pc) > 1e-10) mb.tri(C.m, vid(...a, C.m, C.d), vid(...b, C.m, C.d), vid(...c, C.m, C.d));
      if (area2(pa, pc, pd) > 1e-10) mb.tri(C.m, vid(...a, C.m, C.d), vid(...c, C.m, C.d), vid(...d, C.m, C.d));
    }
  // paredes
  const wall = (e0, e1, dA, dB, cellA, cellB, mat) => {
    // dA: profundidade do lado A; dB do lado B. Normal aponta para o lado mais fundo.
    const q0 = pos(e0[0], e0[1], dA), q1 = pos(e1[0], e1[1], dA), q2 = pos(e1[0], e1[1], dB), q3 = pos(e0[0], e0[1], dB);
    let n = vcross(vsub(q1, q0), vsub(q2, q0));
    if (vlen(n) < 1e-12) n = vcross(vsub(q2, q0), vsub(q3, q0));
    if (vlen(n) < 1e-12) return;
    const deeperC = dA > dB ? cellA : cellB, shallowC = dA > dB ? cellB : cellA;
    const mid = vmul(vadd(e0p(e0), e0p(e1)), 0.5);
    let toward;
    if (deeperC && shallowC) toward = vsub(deeperC, shallowC);
    else if (deeperC) toward = vsub(deeperC, mid);
    else toward = vsub(mid, shallowC);
    if (vdot(n, toward) < 0) mb.flatQuad(mat, q3, q2, q1, q0);
    else mb.flatQuad(mat, q0, q1, q2, q3);
  };
  const e0p = (e) => P[e[0]][e[1]];
  for (let i = 0; i < nI - 1; i++)
    for (let j = 0; j < jCells; j++) {
      const A = info[i][j];
      if (A.skip) continue;
      const j1 = (j + 1) % nJ;
      // vizinho em j+1 (aresta i..i+1 na coluna j1)
      const hasJ = closedJ || j + 1 < jCells;
      if (hasJ) {
        const B = info[i][(j + 1) % jCells];
        if (!B.skip && B.d !== A.d) {
          const deeper = Math.abs(A.d) > Math.abs(B.d) ? A : B;
          wall([i, j1], [i + 1, j1], A.d, B.d, A.c, B.c, deeper.w || deeper.m);
        }
      } else if (wallBorders && A.d) wall([i, j1], [i + 1, j1], A.d, 0, A.c, null, A.w || A.m);
      if (!closedJ && j === 0 && wallBorders && A.d) wall([i, 0], [i + 1, 0], A.d, 0, A.c, null, A.w || A.m);
      // vizinho em i+1 (aresta na linha i+1)
      if (i + 1 < nI - 1) {
        const B = info[i + 1][j];
        if (!B.skip && B.d !== A.d) {
          const deeper = Math.abs(A.d) > Math.abs(B.d) ? A : B;
          wall([i + 1, j], [i + 1, j1], A.d, B.d, A.c, B.c, deeper.w || deeper.m);
        }
      } else if (wallBorders && A.d) wall([i + 1, j], [i + 1, j1], A.d, 0, A.c, null, A.w || A.m);
      if (i === 0 && wallBorders && A.d) wall([0, j], [0, j1], A.d, 0, A.c, null, A.w || A.m);
    }
  return { N, info };
}
