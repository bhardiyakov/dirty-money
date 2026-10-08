// Esportivos e superesportivos
import { commonDetails, def } from './hatches.js';
import { lamps, stampShape, stampQuad, rrect, ellipse2, stripes, doorLines } from '../details.js';
import { wing, roundLamp, exhaust } from '../parts.js';
import { roundedBox, cylinder } from '../prims.js';
import { m4t, m4chain, m4rz, m4rx } from '../math.js';
import { alignY } from '../parts.js';

const PI = Math.PI;

// fendas (vents) vistas de cima: centros (u, z), quantidade
function topVents(ctx, { u, z, n = 3, len = 0.12, gap = 0.035, w = 0.014, along = 'z' }) {
  const rc = ctx.rc();
  const x0 = ctx.X(u);
  for (const s of [1, -1])
    for (let k = 0; k < n; k++) {
      const x = x0 + (k - (n - 1) / 2) * gap;
      const poly = along === 'z' ? rrect(x, s * z, w, len, w / 2.2, 1) : rrect(x, s * z, len, w, w / 2.2, 1);
      stampShape(ctx.mb, rc, { axis: 'y', sign: 1, poly, mat: 'grade', lift: 0.003, rings: 1, rim: 'preto', filter: (m) => m !== 'vidro' });
    }
}

// grelha de motor com aletas sobre o deck traseiro
function engineSlats(ctx, { u0, u1, zw, n = 8, mat = 'pintura', base = 'grade', dots = false }) {
  const rc = ctx.rc();
  const x0 = ctx.X(u0), x1 = ctx.X(u1);
  stampShape(ctx.mb, rc, { axis: 'y', sign: 1, poly: rrect((x0 + x1) / 2, 0, x1 - x0, zw * 2, 0.05, 3), mat: base, lift: 0.004, rings: 2, rim: 'preto', filter: (m) => m !== 'vidro' });
  const yAt = (x, z) => { const h = rc.cast([x, 5, z], [0, -1, 0], { filter: (m) => m !== 'vidro' }); return h ? h.p[1] : 0.9; };
  if (!dots) {
    for (let k = 0; k < n; k++) {
      const x = x0 + ((x1 - x0) * (k + 0.5)) / n;
      const y = Math.max(yAt(x, 0), yAt(x, zw * 0.8));
      ctx.mb.add(mat, roundedBox(0.022, 0.03, zw * 2 - 0.08, 0.008, 1), m4t(x, y + 0.01, 0));
    }
  } else {
    for (let i = 0; i < 6; i++)
      for (let j = -3; j <= 3; j++) {
        const x = x0 + ((x1 - x0) * (i + 0.5)) / 6, z = j * zw * 0.27 + (i % 2 ? zw * 0.135 : 0);
        if (Math.abs(z) > zw * 0.88) continue;
        const h = rc.cast([x, 5, z], [0, -1, 0]);
        if (!h) continue;
        ctx.mb.add('metal_escuro', cylinder(0.022, 0.014, 10, { bevel: 0.004 }), alignY(h.n[1] < 0 ? h.n.map((v) => -v) : h.n, [h.p[0], h.p[1] + 0.008, h.p[2]]));
      }
  }
}

// ---------------------------------------------------------------------------
export const esportivo = {
  slug: 'esportivo',
  L: 4.54, W: 1.89,
  colors: { pintura: '#2459c8', teto: '#2459c8' },
  wheels: { front: 0.806, rear: 0.187, R: 0.33, w: 0.25, inset: 0.03, style: 'esportivo', rimMat: 'aluminio', caliper: true, clear: 0.045 },
  body: {
    top: [[0, 0.76], [0.008, 0.88], [0.03, 0.935], [0.08, 0.955], [0.2, 0.96], [0.3, 0.955], [0.55, 0.925], [0.66, 0.89], [0.8, 0.82], [0.92, 0.775], [0.962, 0.75], [0.985, 0.7], [1, 0.56]],
    bot: [[0, 0.42], [0.015, 0.3], [0.05, 0.2], [0.5, 0.17], [0.93, 0.19], [0.975, 0.25], [1, 0.34]],
    plan: { front: { rx: 0.36, p: 2.6 }, rear: { rx: 0.28, p: 3.0 } },
    wmul: [[0, 0.98], [0.19, 1], [0.33, 0.965], [0.62, 0.965], [0.8, 1], [1, 0.98]],
    rt: [[0, 0.07], [0.5, 0.075], [1, 0.1]], rb: 0.05, crown: 0.03, tuck: 0.04, tumble: 0.07, ySill: 0.22, yWaist: 0.56, yBelt: 0.94,
    regions: [
      { m: 'preto', x: [1.95, 2.28], y: [0, 0.25] },
      { m: 'preto', x: [-2.28, -2.05], y: [0, 0.36] },
      { m: 'preto', y: [0, 0.27], seg: ['sd', 'ba'] },
    ],
  },
  cabin: {
    belt: [[0.17, 0.96], [0.3, 0.945], [0.66, 0.87]],
    roof: [[0.25, 1.35], [0.35, 1.41], [0.45, 1.43], [0.55, 1.4]],
    bot: { xf: 0.66, xr: 0.17, hw: 0.8, rf: 0.38, rr: 0.4 },
    top: { xf: 0.5, xr: 0.33, hw: 0.6, rf: 0.22, rr: 0.26 },
    pws: 1.3, prw: 1.4, roofR: 0.05, crown: 0.028, glassTop: 0.92,
    side: [{ zone: 'w', to: [0.4, 0.42], n: 2 }, { zone: 'q', to: [0.28, 0.37], n: 1 }, { zone: 'c', n: 1 }],
    frontWrap: 0.45, rearWrap: 0.55,
  },
  details(ctx) {
    stripes(ctx, { x0: ctx.X(0) - 0.05, x1: ctx.X(1) + 0.05, zs: [-0.1, 0.1], w: 0.11, mat: 'faixa' });
    lamps(ctx, {
      head: [[0.46, 0.665], [0.66, 0.655], [0.84, 0.67], [0.88, 0.71], [0.82, 0.74], [0.6, 0.735], [0.48, 0.7]],
      tail: [[0.5, 0.8], [0.84, 0.79], [0.9, 0.84], [0.86, 0.9], [0.55, 0.905]],
      grille: [
        { poly: [[-0.4, 0.5], [0.4, 0.5], [0.44, 0.63], [-0.44, 0.63]], mat: 'grade', rim: 'preto' },
        { poly: [[-0.76, 0.27], [-0.5, 0.27], [-0.5, 0.45], [-0.76, 0.42]], mat: 'grade', rim: 'preto' },
        { poly: [[0.5, 0.27], [0.76, 0.27], [0.76, 0.42], [0.5, 0.45]], mat: 'grade', rim: 'preto' },
      ],
    });
    topVents(ctx, { u: 0.735, z: 0.74, n: 3, len: 0.12, gap: 0.04 });
    wing(ctx.mb, { x: ctx.X(0.025), y: 0.97, span: 1.25, chord: 0.1, thick: 0.02, mat: 'preto', tilt: 0.15, end: false });
    commonDetails(ctx, {
      handles: [[0.44, 0.88]], exhaust: [[0.48, 0.24, 0.04], [0.38, 0.24, 0.04], [-0.38, 0.24, 0.04], [-0.48, 0.24, 0.04]], plateF: 0.4, plateR: 0.62,
      doors: [[0.7, 0.28, 0.695, 0.87], [0.37, 0.27, 0.37, 0.95]], mirrorMat: 'pintura', fin: [0.3, 1.405],
    });
  },
};

// ---------------------------------------------------------------------------
export const muscle = {
  slug: 'muscle',
  L: 4.8, W: 1.91,
  colors: { pintura: '#f1c21b', teto: '#f1c21b', faixa: '#141414' },
  wheels: { front: 0.802, rear: 0.235, R: 0.34, w: 0.255, inset: 0.03, style: 'liga5', rimMat: 'aro_escuro', clear: 0.045 },
  body: {
    top: [[0, 0.8], [0.008, 0.92], [0.03, 0.955], [0.12, 0.965], [0.22, 0.97], [0.3, 0.965], [0.55, 0.945], [0.64, 0.915], [0.8, 0.88], [0.93, 0.86], [0.975, 0.845], [0.993, 0.8], [1, 0.66]],
    bot: [[0, 0.44], [0.015, 0.32], [0.05, 0.22], [0.5, 0.19], [0.93, 0.21], [0.975, 0.28], [1, 0.36]],
    plan: { front: { rx: 0.22, p: 3.4 }, rear: { rx: 0.2, p: 3.6 } },
    wmul: [[0, 0.99], [0.23, 1], [0.38, 0.975], [0.62, 0.975], [0.8, 1], [1, 0.985]],
    rt: 0.065, rb: 0.05, crown: 0.025, tuck: 0.035, tumble: 0.055, ySill: 0.24, yWaist: 0.58, yBelt: 0.95,
    regions: [
      { m: 'preto', x: [-2.41, -2.35], y: [0.62, 0.96] },
    ],
  },
  cabin: {
    belt: [[0.18, 0.965], [0.3, 0.95], [0.64, 0.895]],
    roof: [[0.3, 1.33], [0.38, 1.37], [0.47, 1.38], [0.55, 1.365]],
    bot: { xf: 0.64, xr: 0.17, hw: 0.8, rf: 0.3, rr: 0.32 },
    top: { xf: 0.53, xr: 0.335, hw: 0.62, rf: 0.18, rr: 0.2 },
    pws: 1.3, prw: 1.35, roofR: 0.048, crown: 0.03, glassTop: 0.92,
    side: [{ zone: 'w', to: [0.415, 0.43], n: 2 }, { zone: 'q', to: [0.32, 0.37], n: 1 }, { zone: 'c', n: 1 }],
    frontWrap: 0.4, rearWrap: 0.6,
  },
  details(ctx) {
    stripes(ctx, { x0: ctx.X(0) - 0.05, x1: ctx.X(1) + 0.05, zs: [-0.14, 0.14], w: 0.16, mat: 'faixa' });
    lamps(ctx, {
      head: [[0.52, 0.72], [0.78, 0.72], [0.8, 0.79], [0.54, 0.8]], headBezel: 'preto',
      tail: [[0.36, 0.76], [0.8, 0.76], [0.8, 0.88], [0.36, 0.88]], tailBezel: 'preto',
      grille: [{ poly: [[-0.5, 0.56], [0.5, 0.56], [0.55, 0.82], [-0.55, 0.82]], mat: 'grade', rim: 'preto' }],
    });
    // tomada de ar no capô
    const rc = ctx.rc();
    const xs = ctx.X(0.83);
    const h = rc.cast([xs, 5, 0.0001], [0, -1, 0]);
    if (h) {
      ctx.mb.add('pintura', roundedBox(0.5, 0.09, 0.34, 0.04, 2), m4chain(m4t(xs, h.p[1] + 0.015, 0), m4rz(-0.04)));
      ctx.mb.add('grade', roundedBox(0.04, 0.05, 0.26, 0.01, 1), m4t(xs + 0.25, h.p[1] + 0.035, 0));
    }
    wing(ctx.mb, { x: ctx.X(0.035), y: 1.0, span: 1.4, chord: 0.16, thick: 0.03, mat: 'preto', tilt: 0.12, end: true });
    for (const s of [1, -1]) ctx.mb.add('preto', roundedBox(0.08, 0.06, 0.03, 0.01, 1), m4t(ctx.X(0.04), 0.965, s * 0.6));
    commonDetails(ctx, {
      handles: [[0.45, 0.9]], exhaust: [[0.55, 0.25, 0.045], [-0.55, 0.25, 0.045]], plateF: 0.45, plateR: 0.62,
      doors: [[0.68, 0.3, 0.675, 0.89], [0.42, 0.28, 0.42, 0.96]], mirrorMat: 'pintura',
    });
  },
};

// ---------------------------------------------------------------------------
export const super_ = {
  slug: 'super',
  L: 4.6, W: 2.0,
  colors: { pintura: '#d61a1f', teto: '#d61a1f' },
  wheels: { front: 0.772, rear: 0.196, R: 0.335, w: 0.27, inset: 0.035, style: 'liga5', rimMat: 'aluminio', caliper: true, clear: 0.04 },
  body: {
    top: [[0, 0.8], [0.01, 0.87], [0.04, 0.92], [0.12, 0.945], [0.25, 0.945], [0.32, 0.915], [0.45, 0.85], [0.6, 0.835], [0.73, 0.82], [0.85, 0.745], [0.93, 0.68], [0.97, 0.635], [0.99, 0.575], [1, 0.48]],
    bot: [[0, 0.38], [0.015, 0.27], [0.05, 0.15], [0.5, 0.12], [0.93, 0.14], [0.975, 0.19], [1, 0.27]],
    plan: { front: { rx: 0.55, p: 2.2 }, rear: { rx: 0.3, p: 3.0 } },
    wmul: [[0, 0.95], [0.18, 1], [0.3, 0.97], [0.42, 0.92], [0.6, 0.92], [0.77, 0.985], [0.9, 0.95], [1, 0.9]],
    rt: [[0, 0.1], [0.5, 0.12], [1, 0.14]], rb: 0.05, crown: 0.05, tuck: 0.05, tumble: 0.09, ySill: 0.2, yWaist: 0.48, yBelt: 0.88,
    regions: [
      { m: 'grade', x: [-0.95, -0.62], y: [0.48, 0.74], seg: 'sd', d: 0.07, w: 'preto' },
      { m: 'preto', x: [1.9, 2.31], y: [0, 0.22] },
      { m: 'preto', x: [-2.31, -2.05], y: [0, 0.4] },
    ],
  },
  cabin: {
    belt: [[0.3, 0.925], [0.45, 0.86], [0.73, 0.815]],
    roof: [[0.32, 1.04], [0.42, 1.15], [0.52, 1.2], [0.6, 1.185]],
    bot: { xf: 0.73, xr: 0.3, hw: 0.74, rf: 0.42, rr: 0.36 },
    top: { xf: 0.6, xr: 0.45, hw: 0.52, rf: 0.2, rr: 0.2 },
    pws: 1.45, prw: 1.15, roofR: 0.048, crown: 0.028, glassTop: 0.92,
    side: [{ zone: 'w', to: [0.47, 0.5], n: 2 }, { zone: 'c', n: 1 }],
    frontWrap: 0.55, rearWrap: 0.5, rearWin: 0.4,
  },
  details(ctx) {
    lamps(ctx, {
      head: [[0.5, 0.66], [0.7, 0.64], [0.86, 0.63], [0.9, 0.655], [0.8, 0.685], [0.55, 0.69]],
      grille: [
        { poly: [[-0.55, 0.22], [0.55, 0.22], [0.6, 0.4], [-0.6, 0.4]], mat: 'grade', rim: 'preto' },
      ],
    });
    // lanternas redondas duplas
    const rc = ctx.rc();
    for (const s of [1, -1])
      for (const z of [0.6, 0.76]) {
        const h = rc.cast([-20, 0.79, s * z], [1, 0, 0]);
        if (h) roundLamp(ctx.mb, { p: [h.p[0] + 0.006, h.p[1], h.p[2]], n: [-1, 0, 0], r: 0.058, mat: 'lanterna', ring: 'preto', depth: 0.02 });
      }
    topVents(ctx, { u: 0.84, z: 0.62, n: 3, len: 0.13, gap: 0.045 });
    engineSlats(ctx, { u0: 0.07, u1: 0.27, zw: 0.38, n: 8, mat: 'pintura' });
    commonDetails(ctx, {
      handles: [], exhaust: [[0.12, 0.3, 0.045], [-0.12, 0.3, 0.045]], plateF: 0.36, plateR: 0.55, wipers: true,
      doors: [[0.72, 0.25, 0.71, 0.82], [0.45, 0.24, 0.44, 0.86]], mirrorMat: 'pintura', mirrorBack: 0.0, mirrorIn: 0.1,
    });
  },
};

// ---------------------------------------------------------------------------
export const super2 = {
  slug: 'super2',
  L: 4.69, W: 2.06,
  colors: { pintura: '#5fca28', teto: '#5fca28' },
  wheels: { front: 0.765, rear: 0.19, R: 0.335, w: 0.275, inset: 0.035, style: 'esportivo', rimMat: 'aro_preto', caliper: true, clear: 0.04 },
  body: {
    top: [[0, 0.85], [0.005, 0.9], [0.02, 0.92], [0.15, 0.93], [0.27, 0.93], [0.35, 0.885], [0.45, 0.82], [0.72, 0.795], [0.85, 0.7], [0.95, 0.6], [0.985, 0.545], [1, 0.45]],
    bot: [[0, 0.4], [0.012, 0.3], [0.04, 0.15], [0.5, 0.12], [0.95, 0.14], [0.985, 0.18], [1, 0.25]],
    plan: { front: { rx: 0.48, p: 2.6 }, rear: { rx: 0.12, p: 5 } },
    wmul: [[0, 0.97], [0.18, 1], [0.3, 0.97], [0.42, 0.92], [0.6, 0.93], [0.77, 1], [0.9, 0.95], [1, 0.86]],
    rt: [[0, 0.05], [0.5, 0.055], [1, 0.07]], rb: 0.035, crown: 0.02, tuck: 0.06, tumble: 0.11, ySill: 0.2, yWaist: 0.45, yBelt: 0.86,
    regions: [
      { m: 'grade', x: [-1.05, -0.66], y: [0.42, 0.78], seg: 'sd', d: 0.08, w: 'preto' },
      { m: 'grade', x: [-2.35, -2.3], y: [0.4, 0.86], z: [0, 0.82], d: 0.03, w: 'preto' },
      { m: 'preto', x: [1.9, 2.35], y: [0, 0.2] },
      { m: 'preto', x: [-2.35, -2.1], y: [0, 0.4] },
    ],
  },
  cabin: {
    belt: [[0.29, 0.925], [0.45, 0.83], [0.72, 0.79]],
    roof: [[0.3, 0.98], [0.38, 1.08], [0.48, 1.14], [0.56, 1.13]],
    bot: { xf: 0.72, xr: 0.285, hw: 0.72, rf: 0.22, rr: 0.18 },
    top: { xf: 0.57, xr: 0.43, hw: 0.48, rf: 0.12, rr: 0.12 },
    pws: 1.1, prw: 1.0, roofR: 0.04, crown: 0.02, glassTop: 0.92,
    side: [{ zone: 'w', to: [0.46, 0.48], n: 2 }, { zone: 'c', n: 1 }],
    frontWrap: 0.5, rearWrap: 0.45, rearWin: 0.35,
  },
  details(ctx) {
    lamps(ctx, {
      head: [[0.55, 0.6], [0.78, 0.585], [0.92, 0.6], [0.86, 0.625], [0.6, 0.63]],
      tail: [[0.62, 0.84], [0.92, 0.82], [0.93, 0.85], [0.64, 0.87]], tailBezel: 'preto',
      grille: [{ poly: [[-0.62, 0.2], [0.62, 0.2], [0.7, 0.4], [-0.7, 0.4]], mat: 'grade', rim: 'preto' }],
    });
    engineSlats(ctx, { u0: 0.06, u1: 0.25, zw: 0.4, dots: true, base: 'grade' });
    wing(ctx.mb, { x: ctx.X(0.03), y: 0.98, span: 1.5, chord: 0.18, thick: 0.03, mat: 'preto', tilt: 0.12, end: true });
    for (const s of [1, -1]) ctx.mb.add('preto', roundedBox(0.1, 0.06, 0.03, 0.01, 1), m4t(ctx.X(0.035), 0.945, s * 0.62));
    commonDetails(ctx, {
      handles: [], exhaust: [[0.0001, 0.42, 0.05]], plateF: 0.34, plateR: 0.5,
      doors: [[0.71, 0.24, 0.7, 0.79], [0.44, 0.24, 0.43, 0.84]], mirrorMat: 'pintura', mirrorBack: -0.02, mirrorIn: 0.1,
    });
  },
};
