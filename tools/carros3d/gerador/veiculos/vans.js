// Vans
import { commonDetails, def } from './hatches.js';
import { lamps, roofRails, stampShape, stampQuad, rrect, ellipse2, doorLines, wrapBumper, archFlares } from '../details.js';
import { roundLamp, sideStep } from '../parts.js';
import { roundedBox } from '../prims.js';
import { m4t } from '../math.js';

export function roofRibs(ctx, { u0, u1, n, zw, mat = 'pintura', h = 0.02, w = 0.04 }) {
  const rc = ctx.rc();
  for (let k = 0; k < n; k++) {
    const x = ctx.X(u0 + ((u1 - u0) * k) / (n - 1));
    const hh = rc.cast([x, 6, 0.0001], [0, -1, 0]);
    const he = rc.cast([x, 6, zw], [0, -1, 0]);
    if (!hh) continue;
    const y = Math.max(hh.p[1], he ? he.p[1] : 0);
    ctx.mb.add(mat, roundedBox(w, h * 2, zw * 2, h * 0.9, 1), m4t(x, y - h * 0.4, 0));
  }
}

// ---------------------------------------------------------------------------
export const van_furgao = {
  slug: 'van_furgao',
  L: 5.63, W: 2.0,
  colors: { pintura: '#f3f3f1', teto: '#f3f3f1' },
  wheels: { front: 0.824, rear: 0.174, R: 0.36, w: 0.215, inset: 0.05, style: 'aco', rimMat: 'aluminio', clear: 0.07 },
  body: {
    top: [[0, 1.05], [0.004, 1.09], [0.015, 1.1], [0.82, 1.1], [0.845, 1.075], [0.9, 1.02], [0.95, 0.975], [0.985, 0.91], [0.997, 0.83], [1, 0.73]],
    bot: [[0, 0.56], [0.01, 0.46], [0.03, 0.37], [0.5, 0.33], [0.95, 0.35], [0.985, 0.41], [1, 0.5]],
    plan: { front: { rx: 0.42, p: 2.6 }, rear: { rx: 0.06, p: 6 } },
    rt: [[0, 0.04], [0.78, 0.04], [0.85, 0.08], [1, 0.12]], rb: 0.05, crown: 0.025, tuck: 0.02, tumble: 0.02, ySill: 0.38, yWaist: 0.8, yBelt: 1.1,
    regions: [
      { m: 'plastico', y: [0, 0.48], seg: ['sd', 'ba'] },
      { m: 'plastico', x: [2.2, 2.82], y: [0, 0.56] },
      { m: 'plastico', x: [-2.82, -2.7], y: [0, 0.56] },
    ],
  },
  cabin: {
    belt: [[0.006, 1.1], [0.84, 1.08]],
    roof: [[0.01, 2.56], [0.5, 2.6], [0.7, 2.58]],
    bot: { xf: 0.84, xr: 0.006, hw: 0.975, rf: 0.32, rr: 0.05 },
    top: { xf: 0.705, xr: 0.008, hw: 0.93, rf: 0.16, rr: 0.05 },
    pws: 1.25, prw: 1.0, roofR: 0.08, crown: 0.03, glassTop: 0.94, rows: 5,
    side: [{ zone: 'w', to: [0.66, 0.665], n: 2 }, { zone: 'b', to: [0.65, 0.655] }, { zone: 'p', n: 8 }],
    zones: { p: 'pintura' }, frontWrap: 0.5, rearWrap: 0.0, rearWin: 0.85, rearZ: [0.04],
    cellFn: (c) => (c.zone === 'rw' && c.row.k === 'band' && c.row.f < 0.5 ? { m: 'pintura' } : null),
  },
  details(ctx) {
    const { mb, X } = ctx;
    lamps(ctx, {
      head: [[0.5, 0.84], [0.76, 0.82], [0.86, 0.85], [0.84, 0.93], [0.56, 0.93]],
      tail: [[0.84, 0.62], [0.95, 0.62], [0.95, 1.05], [0.84, 1.05]], tailBezel: 'preto',
      grille: [{ poly: [[-0.5, 0.58], [0.5, 0.58], [0.56, 0.86], [-0.56, 0.86]], mat: 'grade', rim: 'preto' }],
    });
    for (let k = 0; k < 3; k++) stampShape(mb, ctx.rc(), { axis: 'x', sign: 1, poly: rrect(0, 0.64 + k * 0.08, 0.95, 0.02, 0.008, 1), mat: 'plastico_cinza', lift: 0.008, rings: 1 });
    roofRibs(ctx, { u0: 0.04, u1: 0.7, n: 15, zw: 0.84, mat: 'pintura' });
    // porta lateral corrediça e portas traseiras
    doorLines(ctx, [[X(0.41), 0.5, X(0.41), 2.35], [X(0.62), 0.5, X(0.62), 2.35], [X(0.41), 2.35, X(0.62), 2.35]], {});
    stampShape(mb, ctx.rc(), { axis: 'x', sign: -1, poly: rrect(0, 1.6, 0.012, 1.9, 0.004, 1), mat: 'borracha', lift: 0.002, rings: 1, walls: false });
    for (const s of [1, -1]) stampShape(mb, ctx.rc(), { axis: 'x', sign: -1, poly: rrect(s * 0.1, 1.25, 0.05, 0.14, 0.02, 2), mat: 'plastico', lift: 0.008, rings: 1 });
    for (const s of [1, -1]) sideStep(mb, { x0: X(0.43), x1: X(0.6), y: 0.42, z: s * 0.99, w: 0.12 });
    commonDetails(ctx, {
      handles: [[0.72, 1.2], [0.58, 1.2]], handleMat: 'plastico', plateF: 0.52, plateR: 0.72, mirrorMat: 'plastico', mirrorSize: 1.35, mirrorArm: 0.09, mirrorBack: 0.02,
      doors: [[0.84, 0.5, 0.84, 1.08], [0.65, 0.5, 0.65, 2.3]], wiperZ: [-0.5, 0.15], wiperLen: 0.7, exhaust: [[0.6, 0.4]],
    });
  },
};

// ---------------------------------------------------------------------------
export const kombi = {
  slug: 'kombi',
  L: 4.51, W: 1.77,
  colors: { pintura: '#3aa696', teto: '#f2f0e8', pintura2: '#f2f0e8' },
  matOverrides: { pintura2: { metal: 0.1, rough: 0.4, clearcoat: 0.6 } },
  wheels: { front: 0.834, rear: 0.3, R: 0.33, w: 0.185, inset: 0.045, style: 'calota', rimMat: 'pintura2', clear: 0.06 },
  body: {
    top: [[0, 0.98], [0.008, 1.03], [0.025, 1.05], [0.5, 1.06], [0.975, 1.05], [0.993, 1.03], [1, 0.97]],
    bot: [[0, 0.5], [0.015, 0.41], [0.05, 0.33], [0.5, 0.3], [0.95, 0.33], [0.985, 0.41], [1, 0.5]],
    plan: { front: { rx: 0.4, p: 2.4 }, rear: { rx: 0.3, p: 2.8 } },
    rt: 0.06, rb: 0.05, crown: 0.02, tuck: 0.03, tumble: 0.02, ySill: 0.35, yWaist: 0.75, yBelt: 1.05,
  },
  cabin: {
    belt: [[0.014, 1.05], [0.988, 1.045]],
    roof: [[0.04, 1.96], [0.5, 2.0], [0.94, 1.97]],
    bot: { xf: 0.988, xr: 0.014, hw: 0.85, rf: 0.38, rr: 0.28 },
    top: { xf: 0.955, xr: 0.035, hw: 0.76, rf: 0.3, rr: 0.22 },
    pws: 1.0, prw: 1.0, roofR: 0.1, crown: 0.03, glassTop: 0.86, rows: 4,
    side: [{ zone: 'w', to: [0.85, 0.85], n: 2 }, { zone: 'b', to: [0.835, 0.835] }, { zone: 'w', to: [0.635, 0.635], n: 2 }, { zone: 'b', to: [0.62, 0.62] }, { zone: 'w', to: [0.415, 0.415], n: 2 }, { zone: 'b', to: [0.4, 0.4] }, { zone: 'w', to: [0.17, 0.17], n: 2 }, { zone: 'c', n: 1 }],
    zones: { a: 'pintura2', b: 'pintura2', c: 'pintura2', rp: 'pintura2' }, frameMat: 'pintura2', roofMat: 'pintura2',
    frontWrap: 0.55, rearWrap: 0.4, rearWin: 0.5,
  },
  details(ctx) {
    const { mb, X } = ctx;
    const rc = ctx.rc();
    // "V" frontal na cor clara
    stampShape(mb, rc, { axis: 'x', sign: 1, poly: [[-0.8, 1.035], [0.8, 1.035], [0.06, 0.62], [-0.06, 0.62]], mat: 'pintura2', lift: 0.002, rings: 6, walls: false, minFacing: 0.4 });
    // faróis redondos
    for (const s of [1, -1]) {
      const h = rc.cast([20, 0.86, s * 0.62], [-1, 0, 0]);
      if (h) roundLamp(mb, { p: [h.p[0] - 0.01, h.p[1], h.p[2]], n: [1, 0, 0], r: 0.085, ring: 'cromado' });
      stampShape(mb, rc, { axis: 'x', sign: 1, poly: rrect(s * 0.62, 0.66, 0.1, 0.05, 0.02, 2), mat: 'pisca', lift: 0.006, rings: 1, rim: 'cromado' });
    }
    lamps(ctx, { tail: [[0.66, 0.7], [0.78, 0.7], [0.78, 0.86], [0.66, 0.86]], tailBezel: 'cromado' });
    // venezianas laterais do motor
    for (const s of [1, -1]) for (let k = 0; k < 7; k++) stampShape(mb, rc, { axis: 'z', sign: s, poly: rrect(X(0.1) + (k - 3) * 0.04, 1.4, 0.016, 0.16, 0.006, 1), mat: 'grade', lift: 0.002, rings: 1, walls: false });
    wrapBumper(ctx, { end: 1, y: 0.45, h: 0.1, d: 0.06, mat: 'pintura2', zMax: 0.86 });
    wrapBumper(ctx, { end: -1, y: 0.45, h: 0.1, d: 0.06, mat: 'pintura2', zMax: 0.86 });
    doorLines(ctx, [[X(0.42), 0.4, X(0.42), 1.04], [X(0.63), 0.4, X(0.63), 1.04], [X(0.84), 0.4, X(0.84), 1.04]]);
    commonDetails(ctx, { handles: [[0.8, 0.98], [0.6, 0.98]], handleMat: 'cromado', plateF: 0.5, plateR: 0.6, mirrorMat: 'cromado', mirrorSize: 0.7, mirrorArm: 0.1, mirrorBack: -0.02, mirrorU: 0.97, wiperZ: [-0.42, 0.18], wiperLen: 0.42, exhaust: [[0.3, 0.32]] });
  },
};

// ---------------------------------------------------------------------------
export const minivan = {
  slug: 'minivan',
  L: 4.6, W: 1.8,
  colors: { pintura: '#7a1f2f', teto: '#7a1f2f' },
  wheels: { front: 0.813, rear: 0.243, R: 0.32, w: 0.195, inset: 0.035, style: 'liga5', clear: 0.05 },
  body: {
    top: [[0, 0.88], [0.008, 0.98], [0.025, 1.02], [0.06, 1.04], [0.3, 1.05], [0.6, 1.03], [0.7, 0.99], [0.82, 0.93], [0.93, 0.9], [0.97, 0.88], [0.99, 0.83], [1, 0.72]],
    bot: [[0, 0.5], [0.015, 0.38], [0.05, 0.29], [0.5, 0.25], [0.93, 0.27], [0.975, 0.33], [1, 0.42]],
    plan: { front: { rx: 0.36, p: 2.6 }, rear: { rx: 0.2, p: 3.4 } },
    rt: [[0, 0.06], [0.5, 0.07], [1, 0.1]], rb: 0.05, crown: 0.025, tuck: 0.035, tumble: 0.055, ySill: 0.28, yWaist: 0.66, yBelt: 1.04,
    regions: [
      { m: 'plastico', x: [1.8, 2.31], y: [0, 0.31] },
      { m: 'plastico', x: [-2.31, -2.05], y: [0, 0.38] },
    ],
  },
  cabin: {
    belt: [[0.015, 1.04], [0.3, 1.05], [0.7, 0.98]],
    roof: [[0.05, 1.64], [0.3, 1.68], [0.55, 1.67], [0.6, 1.655]],
    bot: { xf: 0.7, xr: 0.015, hw: 0.82, rf: 0.36, rr: 0.16 },
    top: { xf: 0.56, xr: 0.035, hw: 0.68, rf: 0.2, rr: 0.11 },
    pws: 1.25, prw: 1.0, roofR: 0.05, crown: 0.025, glassTop: 0.92,
    side: [{ zone: 'w', to: [0.5, 0.49], n: 2 }, { zone: 'b', to: [0.485, 0.475] }, { zone: 'w', to: [0.29, 0.29], n: 2 }, { zone: 'b', to: [0.275, 0.275] }, { zone: 'w', to: [0.07, 0.07], n: 2 }, { zone: 'c', n: 1 }],
    frontWrap: 0.45, rearWrap: 0.3,
  },
  details(ctx) {
    lamps(ctx, {
      head: [[0.42, 0.79], [0.64, 0.77], [0.8, 0.79], [0.84, 0.83], [0.78, 0.865], [0.6, 0.865], [0.44, 0.84]],
      tail: [[0.64, 0.85], [0.84, 0.84], [0.85, 1.0], [0.66, 1.01]], tailBezel: 'preto',
      grille: [{ poly: [[-0.42, 0.56], [0.42, 0.56], [0.46, 0.76], [-0.46, 0.76]], mat: 'grade', rim: 'cromado' }, { poly: [[-0.5, 0.33], [0.5, 0.33], [0.54, 0.43], [-0.54, 0.43]], mat: 'grade' }],
    });
    roofRails(ctx, { u0: 0.06, u1: 0.55, z: 0.6, h: 0.045, mat: 'plastico', footMat: 'plastico' });
    commonDetails(ctx, {
      handles: [[0.6, 0.99], [0.39, 1.0]], exhaust: [[0.45, 0.28]], fin: [0.08, 1.665], plateF: 0.48, plateR: 0.7,
      doors: [[0.72, 0.36, 0.715, 0.98], [0.485, 0.32, 0.48, 1.04], [0.28, 0.42, 0.275, 1.04]], rearWiper: [0.02, 1.3], mirrorMat: 'pintura',
    });
  },
};
