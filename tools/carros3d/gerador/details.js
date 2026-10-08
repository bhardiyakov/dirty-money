// Detalhes de alto nível: faróis, lanternas, grades, faixas, letreiros (via carimbos)
import { stampShape, stampQuad, stampStrokes, smoothPoly, rrect, ellipse2, mirrorA } from './stamp.js';
import { mirror, handle, plate, wipers, sharkFin, exhaust, roundLamp } from './parts.js';
import { glyphStrokes } from './glyphs.js';

const both = (poly) => [poly, mirrorA(poly)];

// lâmpadas: cfg = { head: [[z,y],...] contorno direito (vista frontal), tail: [[z,y]...], ... }
export function lamps(ctx, cfg) {
  const { mb } = ctx;
  const rc = ctx.rc();
  const notGlass = (m) => m !== 'vidro' && m !== 'borracha';
  const sh = (poly, axis, sign, mat, o = {}) => {
    for (const p of o.single ? [poly] : both(poly)) {
      if (o.bezel) stampShape(mb, rc, { axis, sign, poly: p, mat: o.bezel, lift: o.bezelLift ?? 0.003, rings: 2, filter: notGlass, rim: o.bezel, ...(o.bezelOpts || {}) });
      stampShape(mb, rc, { axis, sign, poly: o.bezel ? shrink(p, o.bezelW ?? 0.012) : p, mat, lift: o.lift ?? 0.005, rings: o.rings ?? 3, filter: notGlass, rim: o.rim ?? mat });
    }
  };
  if (cfg.head) sh(smoothPoly(cfg.head, 5), 'x', 1, cfg.headMat ?? 'farol', { bezel: cfg.headBezel ?? 'preto', lift: 0.006 });
  if (cfg.drl) sh(smoothPoly(cfg.drl, 4), 'x', 1, 'drl', { lift: 0.009, rings: 2 });
  if (cfg.tail) sh(smoothPoly(cfg.tail, 5), 'x', -1, cfg.tailMat ?? 'lanterna', { bezel: cfg.tailBezel ?? 'preto', bezelW: 0.016, lift: 0.005 });
  if (cfg.grille) for (const g of [].concat(cfg.grille)) stampShape(mb, rc, { axis: 'x', sign: 1, poly: g.poly, mat: g.mat ?? 'grade', lift: g.lift ?? 0.004, rings: 3, rim: g.rim ?? 'plastico', filter: notGlass });
  if (cfg.rearPanel) for (const g of [].concat(cfg.rearPanel)) stampShape(mb, rc, { axis: 'x', sign: -1, poly: g.poly, mat: g.mat ?? 'preto', lift: g.lift ?? 0.004, rings: 3, rim: g.rim ?? g.mat ?? 'preto', filter: notGlass });
  if (cfg.fog) for (const p of both(ellipse2(cfg.fog[0], cfg.fog[1], cfg.fog[2], cfg.fog[2] * 0.75, 18))) stampShape(mb, rc, { axis: 'x', sign: 1, poly: p, mat: 'farol', lift: 0.006, rings: 2, rim: 'cromado', filter: notGlass });
  if (cfg.marker) for (const s of [1, -1]) stampShape(mb, rc, { axis: 'z', sign: s, poly: rrect(cfg.marker[0], cfg.marker[1], 0.07, 0.025, 0.01, 2), mat: 'pisca', lift: 0.004, rings: 1, filter: notGlass });
  // tampos (vista de cima): ex. faróis que aparecem no capô
  if (cfg.headTop) sh(smoothPoly(cfg.headTop, 5), 'y', 1, cfg.headMat ?? 'farol', { lift: 0.007, single: false, ...topMirror() });
}
function topMirror() { return {}; }

// encolhe contorno em direção ao centroide
export function shrink(poly, d) {
  let cx = 0, cy = 0;
  for (const p of poly) { cx += p[0]; cy += p[1]; }
  cx /= poly.length; cy /= poly.length;
  return poly.map(([a, b]) => {
    const dx = a - cx, dy = b - cy, l = Math.hypot(dx, dy) || 1;
    const k = Math.max(0, (l - d) / l);
    return [cx + dx * k, cy + dy * k];
  });
}

// espelho de contorno no plano de cima (x,z) -> (x,-z)
export const mirrorTopZ = (poly) => poly.map(([x, z]) => [x, -z]).reverse();

// faixas de corrida longitudinais (vista de cima); evita vidros
export function stripes(ctx, { x0, x1, zs, w, mat = 'faixa', lift = 0.0035, seg = 0.06 }) {
  const rc = ctx.rc();
  for (const zc of zs) {
    stampQuad(ctx.mb, rc, {
      axis: 'y', sign: 1, corners: [[x0, zc - w / 2], [x1, zc - w / 2], [x1, zc + w / 2], [x0, zc + w / 2]],
      na: Math.ceil((x1 - x0) / seg), nb: 2, mat, lift,
      skipMat: (m) => m === 'vidro' || m === 'borracha' || m === 'farol' || m === 'lanterna' || m === 'grade',
    });
  }
}

// texto projetado (de cima, 'y'; ou lateral 'z') — center em coordenadas 2D do eixo
// dirU = direção de leitura e dirV = "para cima" das letras, ambas no plano 2D do eixo
// (eixo 'y': (x, z); eixo 'z': (x, y); eixo 'x': (z, y))
export function text(ctx, { str, axis = 'y', sign = 1, center, h = 0.2, dirU = [0, 1], dirV = [1, 0], mat = 'decal', width, lift = 0.003, spacing = 0.4 }) {
  const strokes = glyphStrokes(str, { h, spacing });
  const tr = ([u, v]) => [center[0] + u * dirU[0] + v * dirV[0], center[1] + u * dirU[1] + v * dirV[1]];
  stampStrokes(ctx.mb, ctx.rc(), { axis, sign, strokes: strokes.map(([p, q]) => [tr(p), tr(q)]), width: width ?? h * 0.14, mat, lift, filter: (m) => m !== 'vidro' && m !== 'borracha', minFacing: 0.15 });
}

export { mirror, handle, plate, wipers, sharkFin, exhaust, roundLamp, rrect, ellipse2, smoothPoly, stampShape, stampQuad };

// ---------------------------------------------------------------------------
// linhas de portas (frestas) nas laterais: lista de [xBaixo, yBaixo, xCima, yCima]
export function doorLines(ctx, lines, o = {}) {
  const rc = ctx.rc();
  for (const s of [1, -1])
    for (const [x0, y0, x1, y1] of lines)
      stampStrokes(ctx.mb, rc, { axis: 'z', sign: s, strokes: [[[x0, y0], [x1, y1]]], width: o.width ?? 0.005, mat: o.mat ?? 'borracha', lift: o.lift ?? 0.0012, filter: (m) => m !== 'vidro' && m !== 'borracha', walls: false });
}

// alargadores de caixa de roda (arco preto)
import { sweep } from './prims.js';
import { rrect2 } from './prims.js';
export function archFlares(ctx, o = {}) {
  const rc = ctx.rc();
  const { width = 0.07, thick = 0.028, mat = 'plastico', from = 0.02, to = Math.PI - 0.02, extra = 0 } = o;
  for (const a of ctx.arches || []) {
    for (const s of [1, -1]) {
      const path = [];
      const n = 18;
      for (let k = 0; k <= n; k++) {
        const th = from + ((to - from) * k) / n;
        const rr = a.r + width * 0.35 + extra;
        const x = a.x + rr * Math.cos(th), y = a.y + rr * Math.sin(th);
        const h = rc.cast([x, y, s * 3], [0, 0, -s], { filter: (m) => m !== 'vidro' });
        const z = h ? h.p[2] : s * (ctx.W / 2);
        path.push([x, y, z + s * (thick * 0.35)]);
      }
      const prof = rrect2(thick, width, Math.min(thick, width) * 0.45, 2);
      ctx.mb.add(mat, sweep(path, prof, { up: [0, 0, s], smoothDeg: 50 }));
    }
  }
}

// trilhos de teto longitudinais
import { tube, roundedBox as rbox } from './prims.js';
import { m4t } from './math.js';
export function roofRails(ctx, o = {}) {
  const rc = ctx.rc();
  const { u0, u1, z, h = 0.05, r = 0.016, mat = 'aluminio', feet = true, cross = 0 } = o;
  const X = ctx.X;
  const tops = [];
  for (const s of [1, -1]) {
    const pts = [];
    const n = 10;
    for (let k = 0; k <= n; k++) {
      const x = X(u0) + ((X(u1) - X(u0)) * k) / n;
      const hh = rc.cast([x, 5, s * z], [0, -1, 0], { filter: (m) => m !== 'borracha' });
      const y = hh ? hh.p[1] : 1.4;
      const lift = k === 0 || k === n ? h * 0.35 : h;
      pts.push([x, y + lift, s * z]);
    }
    ctx.mb.add(mat, tube(pts, r, 8));
    if (feet) for (const k of [0, 3, 7, n]) {
      const p = pts[k];
      ctx.mb.add(o.footMat ?? 'plastico', rbox(0.08, h * 1.2, r * 2.6, 0.012, 1), m4t(p[0], p[1] - h * 0.55, p[2]));
    }
    tops.push(pts);
  }
  if (cross) {
    for (let c = 0; c < cross; c++) {
      const k = Math.round(2 + (c * 6) / Math.max(1, cross - 1));
      const a = tops[0][k], b = tops[1][k];
      ctx.mb.add(mat, tube([[a[0], a[1] + 0.01, a[2]], [b[0], b[1] + 0.01, b[2]]], r * 0.9, 8));
    }
  }
}

// contorno em planta perto de uma extremidade: x onde a meia-largura = |z|
export function outlineX(B, z, end) {
  const az = Math.abs(z);
  let a = end > 0 ? B.xF : B.xR, b = end > 0 ? B.xF - B.L * 0.45 : B.xR + B.L * 0.45;
  if (B.halfW(b) < az) return b;
  for (let k = 0; k < 40; k++) {
    const m = (a + b) / 2;
    if (B.halfW(m) < az) a = m; else b = m;
  }
  return (a + b) / 2;
}
// para-choque tubular cromado/preto que contorna a frente ou traseira
import { bumperBar } from './parts.js';
export function wrapBumper(ctx, { end, y, h = 0.1, d = 0.07, gap = 0.015, zMax, mat = 'cromado', n = 24, r = 0.03, bend = 0 }) {
  const B = ctx.body;
  const zm = zMax ?? B.W / 2 - 0.01;
  const path = [];
  for (let k = 0; k <= n; k++) {
    const t = -1 + (2 * k) / n;
    const z = t * zm * (end > 0 ? -1 : 1);
    const x = outlineX(B, z, end) + end * (gap + d / 2) - end * bend * Math.pow(Math.abs(t), 6);
    path.push([x, y, z]);
  }
  bumperBar(ctx.mb, { path, h, d, r, mat });
}
