// "Carimbos": formas 2D projetadas sobre a superfície da carroceria (faróis, lanternas,
// grades, faixas, letreiros, entradas de ar). Geram malha conformada levemente elevada,
// com borda (parede) e moldura opcional.
import { emitGrid } from './grid.js';
import { vdot, vmul, vadd, lerp, catmull } from './math.js';

// eixo: 'x' (frente/traseira), 'y' (de cima), 'z' (laterais). sign: lado de onde vêm os raios
export function projector(rc, axis, sign = 1, filter) {
  const F = 20;
  if (Array.isArray(axis)) {
    // direção arbitrária: axis = [dx,dy,dz] (sentido do raio). Coordenadas 2D: a = x (ou z), b = ao longo de V
    const d = vnormL(axis);
    const up = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const U = vnormL(crossL(up, d)), V = crossL(d, U);
    return (a, b) => {
      const o = vadd(vadd(vmul(U, a), vmul(V, b)), vmul(d, -F));
      const h = rc.castAny(o, d, filter ? { filter } : {});
      if (!h) return null;
      if (vdot(h.n, d) > 0) h.n = vmul(h.n, -1);
      h.g = -vdot(h.n, d);
      return h;
    };
  }
  return (a, b) => {
    let o, d;
    if (axis === 'y') { o = [a, F * sign, b]; d = [0, -sign, 0]; }
    else if (axis === 'x') { o = [F * sign, b, a]; d = [-sign, 0, 0]; }
    else { o = [a, b, F * sign]; d = [0, 0, -sign]; }
    const h = rc.cast(o, d, filter ? { filter } : {});
    if (!h) return null;
    // normal voltada para a origem do raio
    if (vdot(h.n, d) > 0) h.n = vmul(h.n, -1);
    h.g = -vdot(h.n, d);
    return h;
  };
}

const crossL = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vnormL = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// Ferramenta do jogo (tools/carros3d/build.js): STAMP.tag = true marca a geometria estampada (faróis, lanternas, frisos, placas,
// letreiros…) com o sufixo '@e' no material — o jogo dá a ela uma vantagem de profundidade sobre a lataria logo abaixo. Desligado
// (padrão), o gerador sai igual ao do pacote (GLB, visualizador).
export const STAMP = { tag: false };
function emitProjected(mb, P, H, o) {
  if (!STAMP.tag) return emitProjectedRaw(mb, P, H, o);
  const g = mb.g;
  mb.g = (mat) => g.call(mb, mat + '@e');
  try { return emitProjectedRaw(mb, P, H, o); } finally { mb.g = g; }
}
function emitProjectedRaw(mb, P, H, o) {
  // P: grade de pontos 3D (ou null), H: hits (para normal de referência)
  const nI = P.length, nJ = P[0].length;
  // completa pontos ausentes com vizinhos (evita buracos pequenos)
  const ok = P.map((r) => r.map((p) => !!p));
  for (let i = 0; i < nI; i++) for (let j = 0; j < nJ; j++) if (!P[i][j]) {
    let best = null, bd = 1e9;
    for (let a = 0; a < nI; a++) for (let b = 0; b < nJ; b++) if (ok[a][b]) {
      const dd = Math.abs(a - i) + Math.abs(b - j);
      if (dd < bd) { bd = dd; best = P[a][b]; }
    }
    P[i][j] = best ? best.slice() : [0, 0, 0];
  }
  // orientação: compara normal da grade com a normal da superfície
  const res = emitGrid(mb, P, {
    closedJ: !!o.closed,
    cell: (i, j) => {
      const j1 = o.closed ? (j + 1) % nJ : j + 1;
      if (!(ok[i][j] && ok[i + 1][j] && ok[i + 1][j1] && ok[i][j1])) return { skip: true };
      const mf = o.minFacing ?? 0.28;
      if (mf > 0) for (const [a, b] of [[i, j], [i + 1, j], [i + 1, j1], [i, j1]]) if (H[a][b] && H[a][b].g < mf) return { skip: true };
      if (o.skipFn && o.skipFn(H[i][j], H[i + 1][j1])) return { skip: true };
      return { m: o.cellMat ? o.cellMat(i, j) : o.mat, d: -(o.lift ?? 0.004), w: o.rim || o.mat };
    },
    wallBorders: o.walls !== false,
  });
  return res;
}

// grade quadrilátera 2D (cantos a00,a10,a11,a01) projetada
export function stampQuad(mb, rc, o) {
  const { axis = 'y', sign = 1, corners, na = 8, nb = 2, filter } = o;
  const pr = projector(rc, axis, sign, filter);
  const [c00, c10, c11, c01] = corners;
  const P = [], H = [];
  // linhas = ao longo de 'a' (i), colunas = 'b' (j)
  for (let i = 0; i <= na; i++) {
    const row = [], hr = [];
    const t = i / na;
    for (let j = 0; j <= nb; j++) {
      const s = j / nb;
      const p0 = [lerp(c00[0], c10[0], t), lerp(c00[1], c10[1], t)];
      const p1 = [lerp(c01[0], c11[0], t), lerp(c01[1], c11[1], t)];
      const q = [lerp(p0[0], p1[0], s), lerp(p0[1], p1[1], s)];
      const h = pr(q[0], q[1]);
      if (h && o.skipMat && o.skipMat(h.mat)) { row.push(null); hr.push(h); continue; }
      row.push(h ? h.p : null);
      hr.push(h);
    }
    P.push(row); H.push(hr);
  }
  // garante orientação correta (normal da grade deve concordar com a da superfície)
  fixOrientation(P, H, false);
  return emitProjected(mb, P, H, o);
}

function fixOrientation(P, H, closed) {
  // estima a normal da grade numa célula válida e compara com a normal do hit
  for (let i = 0; i < P.length - 1; i++)
    for (let j = 0; j < P[0].length - 1; j++) {
      const a = P[i][j], b = P[i + 1][j], c = P[i + 1][j + 1], d = P[i][j + 1];
      if (!a || !b || !c || !d || !H[i][j]) continue;
      const d1 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], d2 = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
      const n = [d1[1] * d2[2] - d1[2] * d2[1], d1[2] * d2[0] - d1[0] * d2[2], d1[0] * d2[1] - d1[1] * d2[0]];
      if (Math.hypot(...n) < 1e-10) continue;
      if (vdot(n, H[i][j].n) < 0) {
        for (const r of P) r.reverse();
        for (const r of H) r.reverse();
      }
      return;
    }
  void closed;
}

// forma em anéis concêntricos (contorno estrelado em relação ao centroide)
export function resample(poly, maxLen = 0.03) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxLen));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

export function stampShape(mb, rc, o) {
  const { axis = 'x', sign = 1, filter } = o;
  const poly = resample(o.poly, o.maxSeg ?? 0.03);
  let ext = 0;
  {
    let cx0 = 0, cy0 = 0;
    for (const p of poly) { cx0 += p[0]; cy0 += p[1]; }
    cx0 /= poly.length; cy0 /= poly.length;
    for (const p of poly) ext = Math.max(ext, Math.hypot(p[0] - cx0, p[1] - cy0));
  }
  const rings = Math.max(o.rings ?? 4, Math.ceil(ext / 0.05));
  const pr = projector(rc, axis, sign, filter);
  const n = poly.length;
  let cx = 0, cy = 0;
  for (const p of poly) { cx += p[0]; cy += p[1]; }
  cx /= n; cy /= n;
  if (o.center) [cx, cy] = o.center;
  const P = [], H = [];
  for (let r = 0; r <= rings; r++) {
    const s = 1 - r / rings;
    const row = [], hr = [];
    for (const p of poly) {
      const h = pr(cx + (p[0] - cx) * s, cy + (p[1] - cy) * s);
      row.push(h ? h.p : null);
      hr.push(h);
    }
    P.push(row); H.push(hr);
  }
  // orientação (fechado em j)
  const tryN = () => {
    for (let i = 0; i < P.length - 1; i++)
      for (let j = 0; j < n; j++) {
        const j1 = (j + 1) % n;
        const a = P[i][j], b = P[i + 1][j], c = P[i + 1][j1], d = P[i][j1];
        if (!a || !b || !c || !d || !H[i][j]) continue;
        const d1 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], d2 = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
        const nn = [d1[1] * d2[2] - d1[2] * d2[1], d1[2] * d2[0] - d1[0] * d2[2], d1[0] * d2[1] - d1[1] * d2[0]];
        if (Math.hypot(...nn) < 1e-10) continue;
        return vdot(nn, H[i][j].n);
      }
    return 1;
  };
  if (tryN() < 0) { for (const r of P) r.reverse(); for (const r of H) r.reverse(); }
  return emitProjected(mb, P, H, { ...o, closed: true });
}

// ---------- contornos 2D ----------
export function ellipse2(cx, cy, rx, ry, n = 28, rot = 0) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    out.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return out;
}
export function rrect(cx, cy, w, h, r, seg = 4) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4);
  const out = [];
  const cs = [[cx + w / 2 - r, cy + h / 2 - r, 0], [cx - w / 2 + r, cy + h / 2 - r, 90], [cx - w / 2 + r, cy - h / 2 + r, 180], [cx + w / 2 - r, cy - h / 2 + r, 270]];
  for (const [x, y, a0] of cs)
    for (let s = 0; s <= seg; s++) {
      const a = ((a0 + (90 * s) / seg) * Math.PI) / 180;
      out.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
  return out;
}
// contorno suave por Catmull-Rom fechado a partir de pontos de controle
export function smoothPoly(pts, per = 6) {
  return catmull(pts.map((p) => [p[0], p[1], 0]), per, true).map((p) => [p[0], p[1]]);
}
// espelha um contorno em torno de a=0 (para o lado oposto)
export const mirrorA = (poly) => poly.map(([a, b]) => [-a, b]).reverse();

// traços (para letras) em 2D: lista de segmentos [[a0,b0],[a1,b1]] -> quads projetados
export function stampStrokes(mb, rc, o) {
  const { strokes, width = 0.03 } = o;
  for (const [p, q] of strokes) {
    const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * (width / 2), ny = (dx / l) * (width / 2);
    // estende levemente as pontas para unir traços
    const ex = (dx / l) * width * 0.45, ey = (dy / l) * width * 0.45;
    const a = [p[0] - ex, p[1] - ey], b = [q[0] + ex, q[1] + ey];
    stampQuad(mb, rc, { ...o, corners: [[a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny], [a[0] + nx, a[1] + ny]], na: Math.max(1, Math.ceil(l / 0.04)), nb: 1 });
  }
}
