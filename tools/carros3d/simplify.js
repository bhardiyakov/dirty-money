// ============================================================================
// Simplificação de malha por COLAPSO DE ARESTAS com erro quadrático (Garland & Heckbert), no "meio-colapso": um vértice vai para
// a posição do vizinho, então os vértices que sobram são os originais — com as normais originais (a superfície continua lisa onde
// era lisa, sem precisar interpolar nada).
//
//   simplify({ positions, normals, indices }, maxErr, { orig }) -> { positions, normals, indices, orig? }  (orig: índice original de cada vértice)
//
// maxErr (m): desvio médio tolerado em relação aos planos originais em volta. As BORDAS (arestas de um só triângulo: frestas,
// vincos, o contorno de uma peça estampada) ganham planos de restrição pesados — só andam em linha reta, sem abrir fresta entre
// peças vizinhas. O colapso é recusado se virar algum triângulo ou deixar a malha não-manifold.
// ============================================================================

export function simplify(prim, maxErr = 0.004, { orig = false } = {}) {
  const P0 = prim.positions, N0 = prim.normals, I0 = prim.indices;
  const nv = P0.length / 3, nt = I0.length / 3;
  if (nt < 8) return prim;
  const pos = Float64Array.from(P0), tri = Int32Array.from(I0), alive = new Uint8Array(nt).fill(1);
  const adj = Array.from({ length: nv }, () => []);
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) adj[tri[t * 3 + k]].push(t);
  const Q = new Float64Array(nv * 10), A = new Float64Array(nv);
  const addPlane = (v, a, b, c, d, w) => {
    const q = v * 10;
    Q[q] += w * a * a; Q[q + 1] += w * a * b; Q[q + 2] += w * a * c; Q[q + 3] += w * a * d;
    Q[q + 4] += w * b * b; Q[q + 5] += w * b * c; Q[q + 6] += w * b * d;
    Q[q + 7] += w * c * c; Q[q + 8] += w * c * d; Q[q + 9] += w * d * d;
  };
  const faceN = (t, out) => {
    const a = tri[t * 3] * 3, b = tri[t * 3 + 1] * 3, c = tri[t * 3 + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    out[0] = uy * vz - uz * vy; out[1] = uz * vx - ux * vz; out[2] = ux * vy - uy * vx;
    return out;
  };
  const n = [0, 0, 0];
  for (let t = 0; t < nt; t++) {
    faceN(t, n);
    const l = Math.hypot(n[0], n[1], n[2]);
    if (l < 1e-14) continue;
    const a = n[0] / l, b = n[1] / l, c = n[2] / l, p = tri[t * 3] * 3, d = -(a * pos[p] + b * pos[p + 1] + c * pos[p + 2]), area = l / 2;
    for (let k = 0; k < 3; k++) { const v = tri[t * 3 + k]; addPlane(v, a, b, c, d, area); A[v] += area; }
  }
  // bordas: aresta com um triângulo só → plano perpendicular ao triângulo, passando pela aresta, com peso alto
  const edgeCount = new Map(), key = (a, b) => (a < b ? a * nv + b : b * nv + a);
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) { const e = key(tri[t * 3 + k], tri[t * 3 + (k + 1) % 3]); edgeCount.set(e, (edgeCount.get(e) || 0) + 1); }
  const border = new Uint8Array(nv);
  for (let t = 0; t < nt; t++) {
    for (let k = 0; k < 3; k++) {
      const u = tri[t * 3 + k], v = tri[t * 3 + (k + 1) % 3];
      if (edgeCount.get(key(u, v)) !== 1) continue;
      border[u] = border[v] = 1;
      faceN(t, n);
      const ex = pos[v * 3] - pos[u * 3], ey = pos[v * 3 + 1] - pos[u * 3 + 1], ez = pos[v * 3 + 2] - pos[u * 3 + 2];
      let a = ey * n[2] - ez * n[1], b = ez * n[0] - ex * n[2], c = ex * n[1] - ey * n[0];
      const l = Math.hypot(a, b, c);
      if (l < 1e-14) continue;
      a /= l; b /= l; c /= l;
      const d = -(a * pos[u * 3] + b * pos[u * 3 + 1] + c * pos[u * 3 + 2]), w = 400 * (ex * ex + ey * ey + ez * ez);
      addPlane(u, a, b, c, d, w); addPlane(v, a, b, c, d, w);
    }
  }
  const err = (q0, q1, x, y, z) => {
    let s = 0;
    for (const q of [q0, q1]) {
      s += Q[q] * x * x + 2 * Q[q + 1] * x * y + 2 * Q[q + 2] * x * z + 2 * Q[q + 3] * x + Q[q + 4] * y * y + 2 * Q[q + 5] * y * z + 2 * Q[q + 6] * y + Q[q + 7] * z * z + 2 * Q[q + 8] * z + Q[q + 9];
    }
    return Math.max(0, s);
  };
  const ver = new Int32Array(nv), dead = new Uint8Array(nv), limit = maxErr * maxErr;
  // fila de prioridade (heap binário) de colapsos candidatos: [custo, de, para, versão de, versão para]
  const hc = [], hu = [], hv = [], hvu = [], hvv = [];
  const push = (c, u, v) => {
    let i = hc.length;
    hc.push(c); hu.push(u); hv.push(v); hvu.push(ver[u]); hvv.push(ver[v]);
    while (i > 0) { const p = (i - 1) >> 1; if (hc[p] <= hc[i]) break; swap(i, p); i = p; }
  };
  const swap = (i, j) => { let t = hc[i]; hc[i] = hc[j]; hc[j] = t; t = hu[i]; hu[i] = hu[j]; hu[j] = t; t = hv[i]; hv[i] = hv[j]; hv[j] = t; t = hvu[i]; hvu[i] = hvu[j]; hvu[j] = t; t = hvv[i]; hvv[i] = hvv[j]; hvv[j] = t; };
  const pop = () => {
    const last = hc.length - 1;
    swap(0, last);
    const out = [hc.pop(), hu.pop(), hv.pop(), hvu.pop(), hvv.pop()];
    let i = 0;
    for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hc.length && hc[l] < hc[m]) m = l; if (r < hc.length && hc[r] < hc[m]) m = r; if (m === i) break; swap(i, m); i = m; }
    return out;
  };
  const neighbors = (u) => { const s = new Set(); for (const t of adj[u]) if (alive[t]) for (let k = 0; k < 3; k++) { const w = tri[t * 3 + k]; if (w !== u) s.add(w); } return s; };
  const isBorderEdge = (u, v) => { let c = 0; for (const t of adj[u]) if (alive[t] && (tri[t * 3] === v || tri[t * 3 + 1] === v || tri[t * 3 + 2] === v)) c++; return c === 1; };
  // custo de colapsar u → v (u some, v fica): Infinity se não pode (vértice de borda só anda ao longo da borda)
  const cost = (u, v) => {
    if (border[u] && (!border[v] || !isBorderEdge(u, v))) return Infinity;
    return err(u * 10, v * 10, pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]) / (A[u] + A[v] + 1e-12);
  };
  const consider = (a, b) => {
    const c1 = cost(a, b), c2 = cost(b, a);
    if (c1 <= c2 && c1 <= limit) push(c1, a, b);
    else if (c2 < c1 && c2 <= limit) push(c2, b, a);
  };
  for (let u = 0; u < nv; u++) for (const w of neighbors(u)) if (u < w) consider(u, w);
  const n1 = [0, 0, 0];
  // colapso válido? nenhum triângulo em volta de u vira (nem fica degenerado) e a malha continua manifold (condição do elo)
  const valid = (u, v) => {
    const nu = neighbors(u), nvv = neighbors(v);
    let common = 0;
    for (const w of nu) if (nvv.has(w)) common++;
    let shared = 0;
    for (const t of adj[u]) if (alive[t] && (tri[t * 3] === v || tri[t * 3 + 1] === v || tri[t * 3 + 2] === v)) shared++;
    if (common > shared) return false;
    for (const t of adj[u]) {
      if (!alive[t]) continue;
      if (tri[t * 3] === v || tri[t * 3 + 1] === v || tri[t * 3 + 2] === v) continue;
      faceN(t, n);
      const o = u * 3;
      const sx = pos[o], sy = pos[o + 1], sz = pos[o + 2];
      pos[o] = pos[v * 3]; pos[o + 1] = pos[v * 3 + 1]; pos[o + 2] = pos[v * 3 + 2];
      faceN(t, n1);
      pos[o] = sx; pos[o + 1] = sy; pos[o + 2] = sz;
      const l0 = Math.hypot(n[0], n[1], n[2]), l1 = Math.hypot(n1[0], n1[1], n1[2]);
      if (l1 < l0 * 0.02 || l1 < 1e-12) return false;
      if ((n[0] * n1[0] + n[1] * n1[1] + n[2] * n1[2]) / (l0 * l1) < 0.5) return false;
    }
    return true;
  };
  while (hc.length) {
    const [c, u, v, vu, vv] = pop();
    if (c > limit) break;
    if (dead[u] || dead[v] || vu !== ver[u] || vv !== ver[v]) continue;
    if (!valid(u, v)) continue;
    for (const t of adj[u]) {
      if (!alive[t]) continue;
      if (tri[t * 3] === v || tri[t * 3 + 1] === v || tri[t * 3 + 2] === v) { alive[t] = 0; continue; }
      for (let k = 0; k < 3; k++) if (tri[t * 3 + k] === u) tri[t * 3 + k] = v;
      adj[v].push(t);
    }
    for (let k = 0; k < 10; k++) Q[v * 10 + k] += Q[u * 10 + k];
    A[v] += A[u];
    dead[u] = 1; ver[u]++; ver[v]++;
    adj[v] = adj[v].filter((t) => alive[t]);
    for (const w of neighbors(v)) consider(v, w);
  }
  // saída: só os vértices usados
  const map = new Int32Array(nv).fill(-1), out = [];
  let m = 0;
  for (let t = 0; t < nt; t++) if (alive[t]) for (let k = 0; k < 3; k++) { const i = tri[t * 3 + k]; if (map[i] < 0) map[i] = m++; out.push(map[i]); }
  const P = new Float32Array(m * 3), N = new Float32Array(m * 3);
  for (let i = 0; i < nv; i++) if (map[i] >= 0) { const j = map[i]; for (let k = 0; k < 3; k++) { P[j * 3 + k] = P0[i * 3 + k]; N[j * 3 + k] = N0[i * 3 + k]; } }
  const res = { material: prim.material, positions: P, normals: N, indices: m > 65535 ? new Uint32Array(out) : new Uint16Array(out) };
  if (orig) { res.orig = new Int32Array(m); for (let i = 0; i < nv; i++) if (map[i] >= 0) res.orig[map[i]] = i; }      // (índice original de cada vértice que sobrou: os outros atributos)
  return res;
}
