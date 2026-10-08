// Primitivas geométricas: caixa arredondada, torno (lathe), varredura (sweep/tubo),
// elipsoide, extrusão de polígono com chanfro arredondado.
import { Geo } from './mesh.js';
import { vadd, vsub, vmul, vdot, vcross, vnorm, vlen, clamp } from './math.js';

// ---------------------------------------------------------------------------
// Caixa com cantos arredondados (centrada na origem)
export function roundedBox(w, h, d, r, m = 2) {
  const half = [w / 2, h / 2, d / 2];
  r = Math.max(1e-4, Math.min(r, half[0] - 1e-5, half[1] - 1e-5, half[2] - 1e-5));
  const inner = half.map((v) => Math.max(0, v - r));
  const coords = (k) => {
    const I = inner[k], arr = [];
    for (let s = m; s >= 1; s--) arr.push(-I - r * Math.tan(((s / m) * Math.PI) / 4));
    arr.push(-I);
    if (I > 1e-6) arr.push(I);
    for (let s = 1; s <= m; s++) arr.push(I + r * Math.tan(((s / m) * Math.PI) / 4));
    return arr;
  };
  const C = [coords(0), coords(1), coords(2)];
  const g = new Geo();
  const faces = [
    [0, 1, 1, 2], [0, -1, 2, 1],
    [1, 1, 2, 0], [1, -1, 0, 2],
    [2, 1, 0, 1], [2, -1, 1, 0],
  ];
  for (const [k, s, a, b] of faces) {
    const ua = C[a], vb = C[b];
    const base = g.pos.length / 3;
    for (let j = 0; j < vb.length; j++)
      for (let i = 0; i < ua.length; i++) {
        const p = [0, 0, 0];
        p[k] = s * half[k];
        p[a] = ua[i];
        p[b] = vb[j];
        const inn = [clamp(p[0], -inner[0], inner[0]), clamp(p[1], -inner[1], inner[1]), clamp(p[2], -inner[2], inner[2])];
        const n = vnorm(vsub(p, inn));
        g.v(vadd(inn, vmul(n, r)), n);
      }
    const W = ua.length;
    for (let j = 0; j < vb.length - 1; j++)
      for (let i = 0; i < W - 1; i++) {
        const p00 = base + j * W + i, p10 = p00 + 1, p11 = p00 + W + 1, p01 = p00 + W;
        g.q(p00, p10, p11, p01);
      }
  }
  return g;
}

// ---------------------------------------------------------------------------
// Torno: perfil [[r, y], ...] girado em torno do eixo Y.
// Normal externa = (dy, -dr) ao percorrer o perfil. Suaviza cantos < smoothDeg.
export function lathe(profile, seg = 24, opts = {}) {
  const { phi0 = 0, phiLen = Math.PI * 2, smoothDeg = 40 } = opts;
  const full = Math.abs(phiLen - Math.PI * 2) < 1e-6;
  const n = profile.length;
  const segN = [];
  for (let i = 0; i < n - 1; i++) {
    const dr = profile[i + 1][0] - profile[i][0], dy = profile[i + 1][1] - profile[i][1];
    const l = Math.hypot(dr, dy) || 1;
    segN.push([dy / l, -dr / l]);
  }
  const cosT = Math.cos((smoothDeg * Math.PI) / 180);
  const ptN = (i, s) => {
    // normal do ponto i usada pelo segmento s
    const a = segN[i - 1], b = segN[i];
    if (a && b && a[0] * b[0] + a[1] * b[1] > cosT) {
      const x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y) || 1;
      return [x / l, y / l];
    }
    return segN[s];
  };
  const g = new Geo();
  const cols = full ? seg : seg + 1;
  for (let s = 0; s < n - 1; s++) {
    const p0 = profile[s], p1 = profile[s + 1];
    if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 1e-9) continue;
    const n0 = ptN(s, s), n1 = ptN(s + 1, s);
    const b0 = g.pos.length / 3;
    for (let k = 0; k < cols; k++) {
      const ph = phi0 + (phiLen * k) / seg, c = Math.cos(ph), sn = Math.sin(ph);
      g.v([p0[0] * c, p0[1], p0[0] * sn], [n0[0] * c, n0[1], n0[0] * sn]);
    }
    const b1 = g.pos.length / 3;
    for (let k = 0; k < cols; k++) {
      const ph = phi0 + (phiLen * k) / seg, c = Math.cos(ph), sn = Math.sin(ph);
      g.v([p1[0] * c, p1[1], p1[0] * sn], [n1[0] * c, n1[1], n1[0] * sn]);
    }
    const deg0 = p0[0] < 1e-7, deg1 = p1[0] < 1e-7;
    for (let k = 0; k < seg; k++) {
      const k1 = full ? (k + 1) % seg : k + 1;
      const a = b0 + k, b = b1 + k, c = b1 + k1, d = b0 + k1;
      if (!deg1) g.t(a, b, c);
      if (!deg0) g.t(a, c, d);
    }
  }
  return g;
}

// cilindro ao longo de Y, centrado; bevel opcional nas bordas
export function cylinder(r, h, seg = 20, opts = {}) {
  const { rTop = r, bevel = 0, capTop = true, capBot = true } = opts;
  const y0 = -h / 2, y1 = h / 2, b = Math.min(bevel, h / 2.2, r * 0.45);
  const P = [];
  if (capBot) P.push([0, y0]);
  if (b > 0) {
    P.push([r - b, y0]);
    P.push([r - b * 0.3, y0 + b * 0.3]);
    P.push([r, y0 + b]);
    P.push([rTop, y1 - b]);
    P.push([rTop - b * 0.3, y1 - b * 0.3]);
    P.push([rTop - b, y1]);
  } else {
    P.push([r, y0]);
    P.push([rTop, y1]);
  }
  if (capTop) P.push([0, y1]);
  return lathe(P, seg, { smoothDeg: 50 });
}

// ---------------------------------------------------------------------------
// Varredura de um perfil 2D fechado (CCW no plano N,B) ao longo de um caminho 3D
export function frames(path, up = [0, 1, 0], closed = false) {
  const n = path.length, T = [], N = [], B = [];
  for (let i = 0; i < n; i++) {
    let a, b;
    if (closed) { a = path[(i - 1 + n) % n]; b = path[(i + 1) % n]; }
    else { a = path[Math.max(0, i - 1)]; b = path[Math.min(n - 1, i + 1)]; }
    T.push(vnorm(vsub(b, a)));
  }
  let u = up;
  if (Math.abs(vdot(u, T[0])) > 0.95) u = Math.abs(T[0][0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
  let Ni = vnorm(vsub(u, vmul(T[0], vdot(u, T[0]))));
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const t = T[i];
      let cand = vsub(Ni, vmul(t, vdot(Ni, t)));
      if (vlen(cand) < 1e-6) cand = vcross(B[i - 1], t);
      Ni = vnorm(cand);
    }
    N.push(Ni);
    B.push(vnorm(vcross(T[i], Ni)));
  }
  return { T, N, B };
}

export function sweep(path, profile, opts = {}) {
  const { closedPath = false, capStart = true, capEnd = true, up = [0, 1, 0], smoothDeg = 35, scales = null } = opts;
  const F = opts.frames || frames(path, up, closedPath);
  const m = profile.length;
  // normais 2D do perfil (CCW: normal externa = (dv, -du))
  const en = [];
  for (let k = 0; k < m; k++) {
    const p = profile[k], q = profile[(k + 1) % m];
    const du = q[0] - p[0], dv = q[1] - p[1], l = Math.hypot(du, dv) || 1;
    en.push([dv / l, -du / l]);
  }
  const cosT = Math.cos((smoothDeg * Math.PI) / 180);
  // vértices duplicados por aresta do perfil para permitir cantos vivos
  const g = new Geo();
  const n = path.length;
  const vid = []; // vid[i][k] = [idx usado pela aresta k no início, idx usado pela aresta k no fim]
  const ptNorm = (k, e) => {
    const a = en[(k - 1 + m) % m], b = en[k % m];
    if (a[0] * b[0] + a[1] * b[1] > cosT) {
      const x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y) || 1;
      return [x / l, y / l];
    }
    return en[e];
  };
  for (let i = 0; i < n; i++) {
    const s = scales ? scales[i] : 1;
    const row = [];
    for (let e = 0; e < m; e++) {
      const k0 = e, k1 = (e + 1) % m;
      const ids = [];
      for (const [k, which] of [[k0, 0], [k1, 1]]) {
        const pr = profile[k];
        const nn = ptNorm(k, e);
        const pos = vadd(path[i], vadd(vmul(F.N[i], pr[0] * s), vmul(F.B[i], pr[1] * s)));
        const nor = vnorm(vadd(vmul(F.N[i], nn[0]), vmul(F.B[i], nn[1])));
        ids.push(g.v(pos, nor));
      }
      row.push(ids);
    }
    vid.push(row);
  }
  const segs = closedPath ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const i1 = (i + 1) % n;
    for (let e = 0; e < m; e++) {
      const a = vid[i][e][0], d = vid[i][e][1], b = vid[i1][e][0], c = vid[i1][e][1];
      // (perfil) x (caminho) = para fora
      g.t(a, d, c);
      g.t(a, c, b);
    }
  }
  if (!closedPath) {
    const cap = (i, sign) => {
      const s = scales ? scales[i] : 1;
      const nor = vmul(F.T[i], sign);
      const ids = profile.map((pr) => g.v(vadd(path[i], vadd(vmul(F.N[i], pr[0] * s), vmul(F.B[i], pr[1] * s))), nor));
      const tris = triangulate(profile);
      for (const [a, b, c] of tris) {
        if (sign > 0) g.t(ids[a], ids[b], ids[c]);
        else g.t(ids[a], ids[c], ids[b]);
      }
    };
    if (capStart) cap(0, -1);
    if (capEnd) cap(n - 1, 1);
  }
  return g;
}

export const circle2 = (r, seg = 10, rz = r) => {
  const out = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    out.push([Math.cos(a) * r, Math.sin(a) * rz]);
  }
  return out;
};

// retângulo arredondado 2D (CCW), centrado
export function rrect2(w, h, r, segCorner = 3) {
  r = Math.min(r, w / 2 - 1e-5, h / 2 - 1e-5);
  const out = [];
  const cs = [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 90], [-w / 2 + r, -h / 2 + r, 180], [w / 2 - r, -h / 2 + r, 270]];
  for (const [cx, cy, a0] of cs)
    for (let s = 0; s <= segCorner; s++) {
      const a = ((a0 + (90 * s) / segCorner) * Math.PI) / 180;
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  return out;
}

export function tube(path, radius, seg = 8, opts = {}) {
  return sweep(path, circle2(radius, seg), { smoothDeg: 90, ...opts });
}

// ---------------------------------------------------------------------------
// Elipsoide (ou porção) com normais corretas
export function ellipsoid(rx, ry, rz, seg = 20, rings = 12, opts = {}) {
  const { th0 = -Math.PI / 2, th1 = Math.PI / 2 } = opts;
  const g = new Geo();
  for (let j = 0; j <= rings; j++) {
    const th = th0 + ((th1 - th0) * j) / rings;
    for (let k = 0; k <= seg; k++) {
      const ph = (k / seg) * Math.PI * 2;
      const x = Math.cos(th) * Math.cos(ph), y = Math.sin(th), z = Math.cos(th) * Math.sin(ph);
      g.v([rx * x, ry * y, rz * z], vnorm([x / rx, y / ry, z / rz]));
    }
  }
  const W = seg + 1;
  for (let j = 0; j < rings; j++)
    for (let k = 0; k < seg; k++) {
      const a = j * W + k, b = (j + 1) * W + k, c = b + 1, d = a + 1;
      g.t(a, b, c);
      g.t(a, c, d);
    }
  return g;
}

// ---------------------------------------------------------------------------
// Triangulação por "ear clipping" de polígono simples 2D (aceita CW ou CCW)
export function triangulate(poly) {
  const n = poly.length;
  if (n < 3) return [];
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const ccw = area > 0;
  const idx = [...Array(n).keys()];
  const tris = [];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) => {
    const d1 = cross(a, b, p), d2 = cross(b, c, p), d3 = cross(c, a, p);
    return ccw ? d1 > 1e-12 && d2 > 1e-12 && d3 > 1e-12 : d1 < -1e-12 && d2 < -1e-12 && d3 < -1e-12;
  };
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let found = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i - 1 + idx.length) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = poly[ia], b = poly[ib], c = poly[ic];
      const cr = cross(a, b, c);
      if (ccw ? cr <= 1e-14 : cr >= -1e-14) continue;
      let ok = true;
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue;
        if (inside(poly[j], a, b, c)) { ok = false; break; }
      }
      if (!ok) continue;
      tris.push(ccw ? [ia, ib, ic] : [ia, ic, ib]);
      idx.splice(i, 1);
      found = true;
      break;
    }
    if (!found) {
      // polígono degenerado: leque
      for (let i = 1; i < idx.length - 1; i++) tris.push(ccw ? [idx[0], idx[i], idx[i + 1]] : [idx[0], idx[i + 1], idx[i]]);
      return tris;
    }
  }
  if (idx.length === 3) tris.push(ccw ? [idx[0], idx[1], idx[2]] : [idx[0], idx[2], idx[1]]);
  return tris;
}

// deslocamento (offset) de polígono por bissetriz (miter limitado). d>0 = para dentro em CCW
export function offsetPoly(poly, d) {
  const n = poly.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = area > 0 ? 1 : -1;
  return poly.map((p, i) => {
    const a = poly[(i - 1 + n) % n], b = poly[(i + 1) % n];
    const e0 = vnorm([p[0] - a[0], p[1] - a[1], 0]), e1 = vnorm([b[0] - p[0], b[1] - p[1], 0]);
    // normal interna para CCW: (-ey, ex)
    const n0 = [-e0[1] * sgn, e0[0] * sgn], n1 = [-e1[1] * sgn, e1[0] * sgn];
    let bx = n0[0] + n1[0], by = n0[1] + n1[1];
    const bl = Math.hypot(bx, by) || 1;
    bx /= bl; by /= bl;
    const cosh = clamp(bx * n1[0] + by * n1[1], 0.35, 1);
    return [p[0] + (bx * d) / cosh, p[1] + (by * d) / cosh];
  });
}

// Extrusão de polígono 2D (x,y) ao longo de +Z, de z=0 a z=depth, com chanfro arredondado
export function extrude(poly, depth, opts = {}) {
  const { bevel = 0, bevelSeg = 2, smoothDeg = 30, capBack = true } = opts;
  // garante CCW
  let area = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const P = area > 0 ? poly : poly.slice().reverse();
  const b = Math.min(bevel, depth / 2.01);
  // anéis: [offset, z, nz] — nz componente da normal ao longo de z
  const rings = [];
  if (b > 0) {
    // chanfro traseiro: a de 0 a 90° -> recuo b(1-sen a), z = b(1-cos a), nz = -cos a
    for (let s = 0; s <= bevelSeg; s++) {
      const a = (s / bevelSeg) * (Math.PI / 2);
      rings.push([b * (1 - Math.sin(a)), b * (1 - Math.cos(a)), -Math.cos(a)]);
    }
    for (let s = bevelSeg; s >= 0; s--) {
      const a = (s / bevelSeg) * (Math.PI / 2);
      rings.push([b * (1 - Math.sin(a)), depth - b * (1 - Math.cos(a)), Math.cos(a)]);
    }
  } else {
    rings.push([0, 0, 0], [0, depth, 0]);
  }
  const g = new Geo();
  const m = P.length;
  const en = [];
  for (let k = 0; k < m; k++) {
    const p = P[k], q = P[(k + 1) % m];
    const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
    en.push([dy / l, -dx / l]);
  }
  const cosT = Math.cos((smoothDeg * Math.PI) / 180);
  const pn = (k, e) => {
    const a = en[(k - 1 + m) % m], c = en[k];
    if (a[0] * c[0] + a[1] * c[1] > cosT) {
      const x = a[0] + c[0], y = a[1] + c[1], l = Math.hypot(x, y) || 1;
      return [x / l, y / l];
    }
    return en[e];
  };
  const ringPts = rings.map((r) => (r[0] > 1e-7 ? offsetPoly(P, r[0]) : P));
  for (let ri = 0; ri < rings.length - 1; ri++) {
    const A = ringPts[ri], B = ringPts[ri + 1];
    const za = rings[ri][1], zb = rings[ri + 1][1];
    const nza = rings[ri][2], nzb = rings[ri + 1][2];
    if (Math.abs(zb - za) < 1e-9 && rings[ri][0] === rings[ri + 1][0]) continue;
    for (let e = 0; e < m; e++) {
      const k0 = e, k1 = (e + 1) % m;
      const mk = (pts, k, z, nz) => {
        const n2 = pn(k, e), s = Math.sqrt(Math.max(0, 1 - nz * nz));
        return g.v([pts[k][0], pts[k][1], z], vnorm([n2[0] * s, n2[1] * s, nz]));
      };
      const a = mk(A, k0, za, nza), b2 = mk(A, k1, za, nza), c = mk(B, k1, zb, nzb), d = mk(B, k0, zb, nzb);
      g.t(a, b2, c);
      g.t(a, c, d);
    }
  }
  const tris = triangulate(P);
  const capF = ringPts[ringPts.length - 1], zF = rings[rings.length - 1][1];
  const idF = capF.map((p) => g.v([p[0], p[1], zF], [0, 0, 1]));
  for (const [a, b2, c] of tris) g.t(idF[a], idF[b2], idF[c]);
  if (capBack) {
    const capB = ringPts[0], zB = rings[0][1];
    const idB = capB.map((p) => g.v([p[0], p[1], zB], [0, 0, -1]));
    for (const [a, b2, c] of tris) g.t(idB[a], idB[c], idB[b2]);
  }
  return g;
}

// polígono plano (no plano XZ, normal +Y) — para decalques simples
export function flatPoly(poly2, y = 0) {
  const g = new Geo();
  const ids = poly2.map((p) => g.v([p[0], y, p[1]], [0, 1, 0]));
  // poly2 em (x, z); triângulos devem ficar anti-horários vistos de +Y
  const tris = triangulate(poly2.map((p) => [p[0], -p[1]]));
  for (const [a, b, c] of tris) g.t(ids[a], ids[b], ids[c]);
  return g;
}
