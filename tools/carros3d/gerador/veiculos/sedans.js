// Sedãs modernos
import { commonDetails, def } from './hatches.js';
import { lamps, stampShape, rrect, doorLines } from '../details.js';
import { wing } from '../parts.js';

export const sedan_popular = {
  slug: 'sedan_popular',
  L: 4.29, W: 1.69,
  colors: { pintura: '#8c9097', teto: '#8c9097' },
  wheels: { front: 0.814, rear: 0.224, R: 0.31, w: 0.185, inset: 0.035, style: 'liga5', clear: 0.05 },
  body: {
    top: [[0, 0.8], [0.008, 0.93], [0.03, 0.99], [0.08, 1.005], [0.2, 1.01], [0.3, 1.005], [0.55, 0.975], [0.675, 0.935], [0.8, 0.86], [0.92, 0.815], [0.962, 0.79], [0.985, 0.74], [1, 0.6]],
    bot: [[0, 0.48], [0.015, 0.34], [0.05, 0.26], [0.5, 0.22], [0.93, 0.24], [0.975, 0.3], [1, 0.4]],
    plan: { front: { rx: 0.36, p: 2.5 }, rear: { rx: 0.26, p: 3.0 } },
    rt: [[0, 0.06], [0.3, 0.075], [0.7, 0.09], [1, 0.11]], rb: 0.06, crown: 0.03,
    tuck: 0.04, tumble: 0.065, ySill: 0.25, yWaist: 0.6, yBelt: 0.98,
    regions: [
      { m: 'plastico', x: [1.7, 2.15], y: [0, 0.29] },
      { m: 'plastico', x: [-2.15, -1.85], y: [0, 0.36] },
    ],
  },
  cabin: {
    belt: [[0.21, 1.0], [0.3, 0.985], [0.675, 0.91]],
    roof: [[0.28, 1.42], [0.36, 1.465], [0.45, 1.475], [0.55, 1.45]],
    bot: { xf: 0.685, xr: 0.195, hw: 0.78, rf: 0.36, rr: 0.36 },
    top: { xf: 0.535, xr: 0.29, hw: 0.6, rf: 0.22, rr: 0.24 },
    pws: 1.3, prw: 1.25, roofR: 0.05, crown: 0.028, glassTop: 0.92,
    side: [{ zone: 'w', to: [0.47, 0.46], n: 2 }, { zone: 'b', to: [0.455, 0.445] }, { zone: 'w', to: [0.305, 0.36], n: 2 }, { zone: 'q', to: [0.26, 0.33] }, { zone: 'c', n: 1 }],
    frontWrap: 0.45, rearWrap: 0.55,
  },
  details(ctx) {
    lamps(ctx, {
      head: [[0.38, 0.705], [0.6, 0.69], [0.78, 0.705], [0.83, 0.745], [0.79, 0.79], [0.6, 0.775], [0.4, 0.75]],
      tail: [[0.45, 0.86], [0.78, 0.85], [0.83, 0.9], [0.8, 0.975], [0.55, 0.98]],
      grille: [
        { poly: [[-0.36, 0.5], [0.36, 0.5], [0.42, 0.63], [-0.42, 0.63]], mat: 'grade' },
        { poly: [[-0.55, 0.3], [0.55, 0.3], [0.6, 0.38], [-0.6, 0.38]], mat: 'grade' },
      ],
    });
    commonDetails(ctx, {
      handles: [[0.575, 0.91], [0.375, 0.92]], exhaust: [[0.45, 0.25]], fin: [0.3, 1.45], plateF: 0.44, plateR: 0.72,
      doors: [[0.705, 0.34, 0.7, 0.9], [0.46, 0.3, 0.455, 0.98], [0.27, 0.62, 0.245, 0.99]],
    });
  },
};

export const sedan_medio = def(sedan_popular, {
  slug: 'sedan_medio',
  L: 4.6, W: 1.8,
  colors: { pintura: '#ecebe5', teto: '#ecebe5' },
  matOverrides: { pintura: { metal: 0.15, rough: 0.35 }, teto: { metal: 0.15, rough: 0.35 } },
  wheels: { front: 0.804, rear: 0.217, R: 0.32, w: 0.205, style: 'multi', clear: 0.05 },
  body: {
    top: [[0, 0.8], [0.008, 0.92], [0.03, 0.975], [0.08, 0.99], [0.2, 0.995], [0.3, 0.99], [0.55, 0.965], [0.665, 0.925], [0.8, 0.85], [0.92, 0.8], [0.962, 0.775], [0.985, 0.725], [1, 0.59]],
    plan: { front: { rx: 0.4, p: 2.4 }, rear: { rx: 0.3, p: 2.8 } },
    regions: [
      { m: 'plastico', x: [1.85, 2.31], y: [0, 0.28] },
      { m: 'plastico', x: [-2.31, -2.0], y: [0, 0.35] },
    ],
  },
  cabin: {
    belt: [[0.2, 0.99], [0.3, 0.975], [0.665, 0.9]],
    roof: [[0.27, 1.4], [0.36, 1.45], [0.45, 1.46], [0.55, 1.44]],
    bot: { xf: 0.67, xr: 0.195, hw: 0.82 },
    top: { xf: 0.52, xr: 0.3, hw: 0.62 },
    side: [{ zone: 'w', to: [0.465, 0.455], n: 2 }, { zone: 'b', to: [0.45, 0.44] }, { zone: 'w', to: [0.295, 0.355], n: 2 }, { zone: 'q', to: [0.245, 0.33] }, { zone: 'c', n: 1 }],
  },
  details(ctx) {
    lamps(ctx, {
      head: [[0.42, 0.7], [0.62, 0.685], [0.82, 0.695], [0.87, 0.73], [0.82, 0.77], [0.6, 0.77], [0.44, 0.74]],
      tail: [[0.42, 0.84], [0.8, 0.83], [0.87, 0.88], [0.84, 0.955], [0.5, 0.96]],
      grille: [
        { poly: [[-0.42, 0.62], [0.42, 0.62], [0.44, 0.68], [-0.44, 0.68]], mat: 'cromado', rim: 'cromado' },
        { poly: [[-0.6, 0.28], [0.6, 0.28], [0.66, 0.5], [-0.66, 0.5]], mat: 'grade' },
      ],
    });
    doorLines(ctx, [[ctx.X(0.25), 0.95, ctx.X(0.69), 0.95]], { width: 0.012, mat: 'cromado', lift: 0.002 });
    commonDetails(ctx, {
      handles: [[0.57, 0.9], [0.37, 0.91]], handleMat: 'cromado', exhaust: [[0.5, 0.25]], fin: [0.29, 1.44], plateF: 0.52, plateR: 0.72,
      doors: [[0.7, 0.33, 0.695, 0.89], [0.455, 0.3, 0.45, 0.97], [0.26, 0.62, 0.235, 0.98]],
    });
    wing(ctx.mb, { x: ctx.X(0.035), y: 1.0, span: 1.0, chord: 0.08, thick: 0.015, mat: 'pintura', tilt: 0.1, end: false });
  },
});

export const sedan_luxo = def(sedan_popular, {
  slug: 'sedan_luxo',
  L: 5.03, W: 1.89,
  colors: { pintura: '#16171b', teto: '#16171b' },
  matOverrides: { pintura: { metal: 0.45, rough: 0.3, clearcoat: 1 } },
  wheels: { front: 0.829, rear: 0.245, R: 0.335, w: 0.235, style: 'multi', rimMat: 'aluminio', clear: 0.05 },
  body: {
    top: [[0, 0.82], [0.008, 0.94], [0.03, 0.995], [0.08, 1.01], [0.2, 1.015], [0.3, 1.01], [0.55, 0.985], [0.64, 0.955], [0.8, 0.89], [0.92, 0.85], [0.965, 0.83], [0.988, 0.785], [1, 0.64]],
    bot: [[0, 0.46], [0.015, 0.33], [0.05, 0.25], [0.5, 0.21], [0.93, 0.23], [0.975, 0.29], [1, 0.39]],
    plan: { front: { rx: 0.38, p: 2.7 }, rear: { rx: 0.3, p: 3.0 } },
    tumble: 0.06,
    regions: [
      { m: 'preto', x: [2.1, 2.52], y: [0, 0.27] },
      { m: 'preto', x: [-2.52, -2.25], y: [0, 0.32] },
    ],
  },
  cabin: {
    belt: [[0.22, 1.01], [0.3, 1.0], [0.64, 0.935]],
    roof: [[0.29, 1.44], [0.38, 1.48], [0.47, 1.49], [0.55, 1.47]],
    bot: { xf: 0.655, xr: 0.2, hw: 0.86, rf: 0.36, rr: 0.38 },
    top: { xf: 0.52, xr: 0.305, hw: 0.66, rf: 0.22, rr: 0.26 },
    side: [{ zone: 'w', to: [0.455, 0.445], n: 2 }, { zone: 'b', to: [0.44, 0.43] }, { zone: 'w', to: [0.315, 0.37], n: 2 }, { zone: 'q', to: [0.265, 0.345] }, { zone: 'c', n: 1 }],
  },
  details(ctx) {
    lamps(ctx, {
      head: [[0.45, 0.76], [0.66, 0.745], [0.85, 0.755], [0.89, 0.79], [0.84, 0.83], [0.62, 0.83], [0.47, 0.8]],
      tail: [[0.5, 0.88], [0.84, 0.865], [0.9, 0.91], [0.86, 0.98], [0.56, 0.985]],
      grille: [
        { poly: [[-0.33, 0.56], [0.33, 0.56], [0.36, 0.79], [-0.36, 0.79]], mat: 'grade', rim: 'cromado' },
        { poly: [[-0.62, 0.3], [0.62, 0.3], [0.66, 0.44], [-0.66, 0.44]], mat: 'grade' },
      ],
    });
    for (let k = -3; k <= 3; k++) stampShape(ctx.mb, ctx.rc(), { axis: 'x', sign: 1, poly: rrect(k * 0.085, 0.675, 0.014, 0.2, 0.005, 1), mat: 'cromado', lift: 0.01, rings: 1 });
    stampShape(ctx.mb, ctx.rc(), { axis: 'y', sign: 1, poly: rrect(0.2, 0, 0.62, 0.7, 0.07, 3), mat: 'vidro', lift: 0.004, rings: 2, rim: 'borracha' });
    doorLines(ctx, [[ctx.X(0.24), 0.985, ctx.X(0.66), 0.985]], { width: 0.014, mat: 'cromado', lift: 0.002 });
    commonDetails(ctx, {
      handles: [[0.58, 0.94], [0.38, 0.95]], handleMat: 'cromado', exhaust: [[0.55, 0.25, 0.04], [-0.55, 0.25, 0.04]], fin: [0.3, 1.455], plateF: 0.45, plateR: 0.76,
      doors: [[0.68, 0.33, 0.675, 0.93], [0.445, 0.3, 0.44, 1.0], [0.27, 0.62, 0.25, 1.0]], mirrorMat: 'pintura',
    });
  },
});
