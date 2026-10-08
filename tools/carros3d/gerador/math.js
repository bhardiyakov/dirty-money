// Utilidades matemáticas (sem dependências)

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const deg = (d) => (d * Math.PI) / 180;

// ---------- vetores 3D (arrays) ----------
export const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
export const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vmul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vcross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const vlen = (a) => Math.hypot(a[0], a[1], a[2]);
export const vnorm = (a) => {
  const l = vlen(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const vlerp = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// ---------- interpolação monotônica (PCHIP / Fritsch-Carlson) ----------
// pts: [[x, y], ...] em ordem crescente de x. Fora do intervalo: constante.
export function pchip(pts) {
  if (typeof pts === 'number') { const c = pts; return () => c; }
  if (typeof pts === 'function') return pts;
  const n = pts.length;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  if (n === 1) return () => ys[0];
  const h = [], d = [];
  for (let k = 0; k < n - 1; k++) {
    h[k] = xs[k + 1] - xs[k];
    d[k] = (ys[k + 1] - ys[k]) / h[k];
  }
  const m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let k = 1; k < n - 1; k++) {
    if (d[k - 1] * d[k] <= 0) m[k] = 0;
    else {
      const w1 = 2 * h[k] + h[k - 1];
      const w2 = h[k] + 2 * h[k - 1];
      m[k] = (w1 + w2) / (w1 / d[k - 1] + w2 / d[k]);
    }
  }
  // extremidades com derivada "natural" limitada (evita ultrapassagem)
  if (n > 2) {
    const e0 = ((2 * h[0] + h[1]) * d[0] - h[0] * d[1]) / (h[0] + h[1]);
    m[0] = Math.sign(e0) !== Math.sign(d[0]) ? 0 : Math.abs(e0) > 3 * Math.abs(d[0]) ? 3 * d[0] : e0;
    const a = n - 2, b = n - 3;
    const e1 = ((2 * h[a] + h[b]) * d[a] - h[a] * d[b]) / (h[a] + h[b]);
    m[n - 1] = Math.sign(e1) !== Math.sign(d[a]) ? 0 : Math.abs(e1) > 3 * Math.abs(d[a]) ? 3 * d[a] : e1;
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] > x) hi = mid; else lo = mid;
    }
    const k = lo, hk = h[k], t = (x - xs[k]) / hk;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * hk * m[k] +
      (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * hk * m[k + 1];
  };
}

// interpolação linear por partes
export function plin(pts) {
  if (typeof pts === 'number') { const c = pts; return () => c; }
  if (typeof pts === 'function') return pts;
  return (x) => {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i][0]) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        return lerp(y0, y1, (x - x0) / (x1 - x0 || 1));
      }
    }
    return pts[pts.length - 1][1];
  };
}

// Catmull-Rom (centrípeta simplificada) para caminhos 3D
export function catmull(points, samplesPerSeg = 8, closed = false) {
  const P = points, n = P.length, out = [];
  const get = (i) => (closed ? P[(i + n) % n] : P[clamp(i, 0, n - 1)]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg, t2 = t * t, t3 = t2 * t;
      const q = [0, 1, 2].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t +
        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
      out.push(q);
    }
  }
  if (!closed) out.push(P[n - 1].slice());
  return out;
}

// ---------- matrizes 4x4 (coluna-major, como glTF/WebGL) ----------
export const m4 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export function m4mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
}
export const m4t = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
export const m4s = (x, y = x, z = x) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
export function m4rx(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; }
export function m4ry(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; }
export function m4rz(a) { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
// compõe na ordem dada: m4chain(A, B, C) = A*B*C (C aplicado primeiro)
export const m4chain = (...ms) => ms.reduce((a, b) => m4mul(a, b));
export function m4apply(m, p) {
  const x = p[0], y = p[1], z = p[2];
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}
// matriz normal (inversa transposta 3x3) devolvida como função
export function m4normalFn(m) {
  const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g);
  const G = b * f - c * e, H = -(a * f - c * d), I = a * e - b * d;
  const det = a * A + b * B + c * C || 1;
  // inversa = adj^T/det ; inversa transposta = adj/det (cofatores)
  return (n) => vnorm([(A * n[0] + B * n[1] + C * n[2]) / det, (D * n[0] + E * n[1] + F * n[2]) / det, (G * n[0] + H * n[1] + I * n[2]) / det]);
}
export function m4det3(m) {
  return m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
}

// ---------- cores ----------
export function hex(c) {
  if (Array.isArray(c)) return c;
  const s = c.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((k) => k + k).join('') : s, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
export const toHex = (rgb) => '#' + rgb.map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('');
// escurece/clareia uma cor sRGB [0..1]
export const shade = (rgb, k) => rgb.map((v) => clamp(k >= 0 ? v + (1 - v) * k : v * (1 + k), 0, 1));

// gerador pseudoaleatório determinístico
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
