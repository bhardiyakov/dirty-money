// Raycast acelerado (raios alinhados aos eixos) contra triângulos de um MeshBuilder.
import { vsub, vcross, vdot, vnorm, vadd, vmul } from './math.js';

export class Raycaster {
  constructor(tris, cell = 0.08) {
    this.tris = tris;
    this.cell = cell;
    this.grids = {};
  }
  static fromBuilder(mb, filter) {
    return new Raycaster(mb.triangles(filter));
  }
  _grid(axis) {
    if (this.grids[axis]) return this.grids[axis];
    const [a, b] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
    const cs = this.cell, map = new Map();
    this.tris.forEach((t, idx) => {
      const minA = Math.min(t.a[a], t.b[a], t.c[a]), maxA = Math.max(t.a[a], t.b[a], t.c[a]);
      const minB = Math.min(t.a[b], t.b[b], t.c[b]), maxB = Math.max(t.a[b], t.b[b], t.c[b]);
      for (let i = Math.floor(minA / cs); i <= Math.floor(maxA / cs); i++)
        for (let j = Math.floor(minB / cs); j <= Math.floor(maxB / cs); j++) {
          const k = i * 73856093 ^ j * 19349663;
          let arr = map.get(k);
          if (!arr) { arr = []; map.set(k, arr); }
          arr.push(idx);
        }
    });
    const g = { a, b, map };
    this.grids[axis] = g;
    return g;
  }
  // raio em direção arbitrária (força bruta)
  castAny(o, d, opts = {}) {
    let best = null;
    for (const t of this.tris) {
      if (opts.filter && !opts.filter(t.mat)) continue;
      const h = rayTri(o, d, t.a, t.b, t.c);
      if (h !== null && h > 1e-5 && (!best || h < best.t)) best = { t: h, tri: t };
    }
    if (!best) return null;
    const t = best.tri;
    return { p: vadd(o, vmul(d, best.t)), n: vnorm(vcross(vsub(t.b, t.a), vsub(t.c, t.a))), mat: t.mat, t: best.t };
  }
  // origem o, direção d (eixo ±x/±y/±z). Retorna {p, n, mat, t} do primeiro acerto ou null
  cast(o, d, opts = {}) {
    if (!(Math.abs(d[0]) > 0.999 || Math.abs(d[1]) > 0.999 || Math.abs(d[2]) > 0.999)) return this.castAny(o, d, opts);
    const axis = Math.abs(d[0]) > 0.5 ? 0 : Math.abs(d[1]) > 0.5 ? 1 : 2;
    const g = this._grid(axis);
    const i = Math.floor(o[g.a] / this.cell), j = Math.floor(o[g.b] / this.cell);
    const list = g.map.get(i * 73856093 ^ j * 19349663) || [];
    let best = null;
    for (const idx of list) {
      const t = this.tris[idx];
      if (opts.filter && !opts.filter(t.mat)) continue;
      const h = rayTri(o, d, t.a, t.b, t.c);
      if (h !== null && h > (opts.tmin ?? 1e-5) && (!best || h < best.t)) best = { t: h, tri: t };
    }
    if (!best) return null;
    const t = best.tri;
    let n = vnorm(vcross(vsub(t.b, t.a), vsub(t.c, t.a)));
    return { p: vadd(o, vmul(d, best.t)), n, mat: t.mat, t: best.t };
  }
}

export function rayTri(o, d, a, b, c) {
  const e1 = vsub(b, a), e2 = vsub(c, a);
  const p = vcross(d, e2);
  const det = vdot(e1, p);
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  const s = vsub(o, a);
  const u = vdot(s, p) * inv;
  if (u < -1e-7 || u > 1 + 1e-7) return null;
  const q = vcross(s, e1);
  const v = vdot(d, q) * inv;
  if (v < -1e-7 || u + v > 1 + 1e-7) return null;
  const t = vdot(e2, q) * inv;
  return t;
}
