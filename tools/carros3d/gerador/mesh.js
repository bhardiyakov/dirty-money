// Construtor de malhas agrupadas por material
import { vsub, vcross, vnorm, vadd, m4apply, m4normalFn, m4det3 } from './math.js';

export class MeshBuilder {
  constructor() {
    this.groups = new Map(); // chave do material -> {pos, nor, idx}
  }
  g(mat) {
    let G = this.groups.get(mat);
    if (!G) {
      G = { pos: [], nor: [], idx: [] };
      this.groups.set(mat, G);
    }
    return G;
  }
  vert(mat, p, n) {
    const G = this.g(mat);
    G.pos.push(p[0], p[1], p[2]);
    G.nor.push(n[0], n[1], n[2]);
    return G.pos.length / 3 - 1;
  }
  tri(mat, a, b, c) {
    this.g(mat).idx.push(a, b, c);
  }
  // triângulo com normal da face (sombreamento chapado)
  flatTri(mat, p0, p1, p2) {
    const n = vnorm(vcross(vsub(p1, p0), vsub(p2, p0)));
    if (!isFinite(n[0])) return;
    const a = this.vert(mat, p0, n), b = this.vert(mat, p1, n), c = this.vert(mat, p2, n);
    this.tri(mat, a, b, c);
  }
  // quadrilátero p0..p3 em ordem anti-horária vista de fora
  flatQuad(mat, p0, p1, p2, p3) {
    const n = vnorm(vadd(vcross(vsub(p1, p0), vsub(p2, p0)), vcross(vsub(p2, p0), vsub(p3, p0))));
    const a = this.vert(mat, p0, n), b = this.vert(mat, p1, n), c = this.vert(mat, p2, n), d = this.vert(mat, p3, n);
    this.tri(mat, a, b, c);
    this.tri(mat, a, c, d);
  }
  // triângulo suave com normais por vértice
  smoothTri(mat, p0, n0, p1, n1, p2, n2) {
    const a = this.vert(mat, p0, n0), b = this.vert(mat, p1, n1), c = this.vert(mat, p2, n2);
    this.tri(mat, a, b, c);
  }
  // adiciona geometria {pos, nor, idx} com matriz opcional
  add(mat, geo, M) {
    const G = this.g(mat);
    const base = G.pos.length / 3;
    const P = geo.pos, N = geo.nor;
    if (M) {
      const nf = m4normalFn(M);
      for (let i = 0; i < P.length; i += 3) {
        const p = m4apply(M, [P[i], P[i + 1], P[i + 2]]);
        const n = nf([N[i], N[i + 1], N[i + 2]]);
        G.pos.push(p[0], p[1], p[2]);
        G.nor.push(n[0], n[1], n[2]);
      }
    } else {
      for (let i = 0; i < P.length; i++) { G.pos.push(P[i]); G.nor.push(N[i]); }
    }
    const flip = M && m4det3(M) < 0;
    const I = geo.idx;
    for (let i = 0; i < I.length; i += 3) {
      if (flip) G.idx.push(base + I[i], base + I[i + 2], base + I[i + 1]);
      else G.idx.push(base + I[i], base + I[i + 1], base + I[i + 2]);
    }
    return this;
  }
  // incorpora outro MeshBuilder
  merge(other, M) {
    for (const [mat, G] of other.groups) this.add(mat, { pos: G.pos, nor: G.nor, idx: G.idx }, M);
    return this;
  }
  // lista de triângulos (para raycast): [{a,b,c,mat}]
  triangles(filter) {
    const out = [];
    for (const [key, G] of this.groups) {
      const mat = key.endsWith('@e') ? key.slice(0, -2) : key;      // (estampa marcada: ver STAMP em stamp.js)
      if (filter && !filter(mat)) continue;
      const P = G.pos, I = G.idx;
      for (let i = 0; i < I.length; i += 3) {
        const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
        out.push({ a: [P[a], P[a + 1], P[a + 2]], b: [P[b], P[b + 1], P[b + 2]], c: [P[c], P[c + 1], P[c + 2]], mat });
      }
    }
    return out;
  }
  // resultado final: lista de primitivas tipadas (com fusão de vértices idênticos)
  build() {
    const out = [];
    for (const [mat, G] of this.groups) {
      if (!G.idx.length) continue;
      const map = new Map();
      const remap = new Int32Array(G.pos.length / 3);
      const P = [], N = [];
      const q = (v) => Math.round(v * 2e4);
      const qn = (v) => Math.round(v * 500);
      for (let i = 0; i < G.pos.length / 3; i++) {
        const k = q(G.pos[i * 3]) + ',' + q(G.pos[i * 3 + 1]) + ',' + q(G.pos[i * 3 + 2]) + '|' + qn(G.nor[i * 3]) + ',' + qn(G.nor[i * 3 + 1]) + ',' + qn(G.nor[i * 3 + 2]);
        let id = map.get(k);
        if (id === undefined) {
          id = P.length / 3;
          map.set(k, id);
          P.push(G.pos[i * 3], G.pos[i * 3 + 1], G.pos[i * 3 + 2]);
          N.push(G.nor[i * 3], G.nor[i * 3 + 1], G.nor[i * 3 + 2]);
        }
        remap[i] = id;
      }
      const I = [];
      for (let t = 0; t < G.idx.length; t += 3) {
        const a = remap[G.idx[t]], b = remap[G.idx[t + 1]], c = remap[G.idx[t + 2]];
        if (a === b || b === c || a === c) continue;
        I.push(a, b, c);
      }
      if (!I.length) continue;
      out.push({
        material: mat,
        positions: new Float32Array(P),
        normals: new Float32Array(N),
        indices: P.length / 3 > 65535 ? new Uint32Array(I) : new Uint16Array(I),
      });
    }
    return out;
  }
  triCount() {
    let n = 0;
    for (const G of this.groups.values()) n += G.idx.length / 3;
    return n;
  }
}

// Geometria "solta" {pos, nor, idx} — utilitário para primitivas
export class Geo {
  constructor() { this.pos = []; this.nor = []; this.idx = []; }
  v(p, n) {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    return this.pos.length / 3 - 1;
  }
  t(a, b, c) { this.idx.push(a, b, c); }
  q(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
}
