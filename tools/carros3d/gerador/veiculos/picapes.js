// Picapes
import { commonDetails, def } from './hatches.js';
import { lamps, archFlares, stampShape, rrect, doorLines, wrapBumper } from '../details.js';
import { sideStep, bumperBar } from '../parts.js';
import { roundedBox, tube } from '../prims.js';
import { m4t } from '../math.js';

// nervuras do assoalho da caçamba + santo antônio opcional
function bedDetails(ctx, { u0, u1, zw, ribs = 8, mat = 'plastico', rollbar = false, rollMat = 'aluminio' }) {
  const rc = ctx.rc();
  const x0 = ctx.X(u0), x1 = ctx.X(u1), xc = (x0 + x1) / 2;
  const h = rc.cast([xc, 5, 0.0001], [0, -1, 0]);
  if (!h) return;
  const fy = h.p[1];
  for (let k = 0; k < ribs; k++) {
    const z = -zw + 0.08 + ((2 * zw - 0.16) * k) / (ribs - 1);
    ctx.mb.add(mat, roundedBox(x1 - x0 - 0.12, 0.022, 0.035, 0.01, 1), m4t(xc, fy + 0.008, z));
  }
  if (rollbar) {
    const top = rc.cast([x1 - 0.06, 5, zw + 0.04], [0, -1, 0]);
    const yr = top ? top.p[1] : fy + 0.45;
    const xr = x1 - 0.08;
    const H = 0.3;
    const zz = zw + 0.035;
    ctx.mb.add(rollMat, tube([[xr, yr - 0.02, -zz], [xr, yr + H * 0.85, -zz], [xr, yr + H, -zz + 0.15], [xr, yr + H, zz - 0.15], [xr, yr + H * 0.85, zz], [xr, yr - 0.02, zz]], 0.03, 10));
    for (const s of [1, -1]) ctx.mb.add(rollMat, tube([[xr, yr + H * 0.8, s * zz], [xr - 0.32, yr + 0.02, s * zz]], 0.024, 8));
  }
}

// ---------------------------------------------------------------------------
export const picape_pequena = {
  slug: 'picape_pequena',
  L: 4.51, W: 1.74,
  colors: { pintura: '#f1f1ef', teto: '#f1f1ef' },
  wheels: { front: 0.823, rear: 0.215, R: 0.31, w: 0.195, inset: 0.035, style: 'liga5', clear: 0.06 },
  body: {
    top: [[0, 1.08], [0.005, 1.11], [0.015, 1.12], [0.38, 1.12], [0.42, 1.1], [0.635, 1.0], [0.8, 0.935], [0.93, 0.895], [0.97, 0.865], [0.99, 0.81], [1, 0.69]],
    bot: [[0, 0.56], [0.012, 0.46], [0.04, 0.36], [0.5, 0.27], [0.95, 0.28], [0.985, 0.34], [1, 0.44]],
    plan: { front: { rx: 0.34, p: 2.6 }, rear: { rx: 0.06, p: 6 } },
    rt: [[0, 0.04], [0.45, 0.05], [0.6, 0.07], [1, 0.1]], rb: 0.05, crown: 0.02, tuck: 0.03, tumble: 0.04, ySill: 0.3, yWaist: 0.66, yBelt: 1.08,
    regions: [
      { m: 'plastico', x: [-2.26, 1.86], y: [0, 0.3], seg: ['sd', 'ba'] },
      { m: 'plastico', x: [1.7, 2.26], y: [0, 0.3] },
      { m: 'plastico', x: [-2.2, -0.555], z: [0, 0.74], seg: 'tf', d: 0.4, w: 'plastico' },
    ],
  },
  cabin: {
    belt: [[0.385, 1.115], [0.635, 0.995]],
    roof: [[0.39, 1.55], [0.45, 1.58], [0.53, 1.575]],
    bot: { xf: 0.635, xr: 0.385, hw: 0.79, rf: 0.34, rr: 0.05 },
    top: { xf: 0.53, xr: 0.39, hw: 0.64, rf: 0.2, rr: 0.05 },
    pws: 1.25, prw: 1.0, roofR: 0.045, crown: 0.025, glassTop: 0.92,
    side: [{ zone: 'w', to: [0.425, 0.42], n: 2 }, { zone: 'c', n: 1 }],
    frontWrap: 0.45, rearWrap: 0.0, rearWin: 0.42, rearZ: [0.3],
  },
  details(ctx) {
    lamps(ctx, {
      head: [[0.4, 0.73], [0.62, 0.715], [0.78, 0.73], [0.83, 0.77], [0.78, 0.81], [0.6, 0.8], [0.42, 0.775]],
      tail: [[0.72, 0.68], [0.82, 0.68], [0.82, 1.05], [0.72, 1.05]], tailBezel: 'preto',
      grille: [{ poly: [[-0.4, 0.5], [0.4, 0.5], [0.44, 0.66], [-0.44, 0.66]], mat: 'grade' }, { poly: [[-0.5, 0.31], [0.5, 0.31], [0.54, 0.4], [-0.54, 0.4]], mat: 'grade' }],
    });
    bedDetails(ctx, { u0: 0.005, u1: 0.375, zw: 0.7, ribs: 8 });
    stampShape(ctx.mb, ctx.rc(), { axis: 'x', sign: -1, poly: rrect(0, 0.98, 0.22, 0.05, 0.02, 2), mat: 'preto', lift: 0.006, rings: 1 });
    wrapBumper(ctx, { end: -1, y: 0.52, h: 0.12, d: 0.07, mat: 'plastico', zMax: 0.82 });
    archFlares(ctx, { width: 0.07, thick: 0.03 });
    commonDetails(ctx, { handles: [[0.47, 1.0]], exhaust: [[0.5, 0.33]], plateF: 0.44, plateR: 0.62, doors: [[0.655, 0.4, 0.65, 0.99], [0.4, 0.35, 0.4, 1.1]], mirrorMat: 'pintura', mirrorSize: 0.85 });
  },
};

// ---------------------------------------------------------------------------
export const picape_media = {
  slug: 'picape_media',
  L: 5.31, W: 1.91,
  colors: { pintura: '#a8acb2', teto: '#a8acb2' },
  wheels: { front: 0.825, rear: 0.244, R: 0.385, w: 0.255, inset: 0.035, style: 'liga6', rimMat: 'aluminio', clear: 0.07 },
  body: {
    top: [[0, 1.24], [0.005, 1.27], [0.015, 1.28], [0.3, 1.28], [0.33, 1.26], [0.66, 1.18], [0.8, 1.14], [0.93, 1.12], [0.97, 1.1], [0.99, 1.06], [1, 0.95]],
    bot: [[0, 0.66], [0.012, 0.56], [0.04, 0.46], [0.5, 0.38], [0.95, 0.42], [0.985, 0.48], [1, 0.58]],
    plan: { front: { rx: 0.26, p: 3.2 }, rear: { rx: 0.06, p: 6 } },
    rt: [[0, 0.05], [0.4, 0.05], [0.6, 0.07], [1, 0.09]], rb: 0.05, crown: 0.025, tuck: 0.03, tumble: 0.04, ySill: 0.42, yWaist: 0.82, yBelt: 1.25,
    regions: [
      { m: 'plastico', x: [-2.66, 2.66], y: [0, 0.44], seg: ['sd', 'ba'] },
      { m: 'plastico', x: [-2.6, -1.09], z: [0, 0.82], seg: 'tf', d: 0.42, w: 'plastico' },
    ],
  },
  cabin: {
    belt: [[0.31, 1.27], [0.66, 1.17]],
    roof: [[0.315, 1.77], [0.45, 1.81], [0.55, 1.805], [0.6, 1.79]],
    bot: { xf: 0.665, xr: 0.31, hw: 0.87, rf: 0.3, rr: 0.05 },
    top: { xf: 0.56, xr: 0.316, hw: 0.72, rf: 0.18, rr: 0.05 },
    pws: 1.2, prw: 1.0, roofR: 0.05, crown: 0.025, glassTop: 0.92,
    side: [{ zone: 'w', to: [0.5, 0.49], n: 2 }, { zone: 'b', to: [0.485, 0.475] }, { zone: 'w', to: [0.34, 0.345], n: 2 }, { zone: 'c', n: 1 }],
    frontWrap: 0.45, rearWrap: 0.0, rearWin: 0.5, rearZ: [0.35],
  },
  details(ctx) {
    lamps(ctx, {
      head: [[0.52, 0.98], [0.8, 0.96], [0.86, 1.0], [0.84, 1.05], [0.56, 1.06]],
      tail: [[0.8, 0.86], [0.9, 0.86], [0.9, 1.22], [0.8, 1.22]], tailBezel: 'preto',
      grille: [{ poly: [[-0.5, 0.74], [0.5, 0.74], [0.52, 1.04], [-0.52, 1.04]], mat: 'grade', rim: 'cromado' }, { poly: [[-0.55, 0.5], [0.55, 0.5], [0.6, 0.66], [-0.6, 0.66]], mat: 'grade' }],
    });
    for (let k = 0; k < 4; k++) stampShape(ctx.mb, ctx.rc(), { axis: 'x', sign: 1, poly: rrect(0, 0.8 + k * 0.07, 0.96, 0.02, 0.008, 1), mat: 'cromado', lift: 0.01, rings: 1 });
    bedDetails(ctx, { u0: 0.006, u1: 0.295, zw: 0.8, ribs: 9, rollbar: true });
    wrapBumper(ctx, { end: -1, y: 0.66, h: 0.14, d: 0.08, mat: 'cromado', zMax: 0.92 });
    archFlares(ctx, { width: 0.1, thick: 0.035 });
    for (const s of [1, -1]) sideStep(ctx.mb, { x0: ctx.wheel.xr + 0.5, x1: ctx.wheel.xf - 0.52, y: 0.48, z: s * 0.93, w: 0.16, mat: 'aluminio' });
    commonDetails(ctx, { handles: [[0.6, 1.17], [0.41, 1.19]], handleMat: 'cromado', exhaust: [[0.55, 0.42]], plateF: 0.58, plateR: 0.86, doors: [[0.68, 0.48, 0.675, 1.17], [0.48, 0.45, 0.475, 1.26], [0.32, 0.5, 0.32, 1.27]], mirrorMat: 'cromado', mirrorSize: 1.05 });
  },
};

// ---------------------------------------------------------------------------
export const picape_grande = {
  slug: 'picape_grande',
  L: 5.63, W: 2.06,
  colors: { pintura: '#7c1f2f', teto: '#7c1f2f' },
  wheels: { front: 0.831, rear: 0.227, R: 0.4, w: 0.26, inset: 0.045, style: 'liga6', rimMat: 'cromado', clear: 0.08 },
  body: {
    top: [[0, 1.32], [0.004, 1.35], [0.012, 1.36], [0.4, 1.36], [0.42, 1.35], [0.66, 1.33], [0.85, 1.31], [0.97, 1.3], [0.993, 1.28], [1, 1.2]],
    bot: [[0, 0.7], [0.01, 0.6], [0.03, 0.5], [0.5, 0.42], [0.96, 0.46], [0.988, 0.54], [1, 0.62]],
    plan: { front: { rx: 0.12, p: 5 }, rear: { rx: 0.06, p: 6 } },
    rt: 0.05, rb: 0.05, crown: 0.02, tuck: 0.02, tumble: 0.03, ySill: 0.46, yWaist: 0.9, yBelt: 1.35,
    regions: [
      { m: 'plastico', x: [-2.76, -0.6], z: [0, 0.93], seg: 'tf', d: 0.025, w: 'plastico' },
    ],
  },
  cabin: {
    belt: [[0.42, 1.35], [0.66, 1.32]],
    roof: [[0.425, 1.96], [0.5, 2.0], [0.6, 1.995]],
    bot: { xf: 0.665, xr: 0.422, hw: 0.95, rf: 0.14, rr: 0.05 },
    top: { xf: 0.6, xr: 0.428, hw: 0.84, rf: 0.1, rr: 0.05 },
    pws: 1.1, prw: 1.0, roofR: 0.05, crown: 0.02, glassTop: 0.92,
    side: [{ zone: 'w', to: [0.54, 0.54], n: 2 }, { zone: 'b', to: [0.525, 0.525] }, { zone: 'w', to: [0.45, 0.45], n: 1 }, { zone: 'c', n: 1 }],
    zones: { b: 'pintura' }, frontWrap: 0.3, rearWrap: 0.0, rearWin: 0.55, rearZ: [0.4],
  },
  details(ctx) {
    lamps(ctx, {
      head: [[0.6, 1.04], [0.9, 1.04], [0.9, 1.22], [0.6, 1.22]], headBezel: 'cromado',
      tail: [[0.86, 0.95], [0.96, 0.95], [0.96, 1.32], [0.86, 1.32]], tailBezel: 'preto',
      grille: [{ poly: [[-0.55, 0.86], [0.55, 0.86], [0.55, 1.24], [-0.55, 1.24]], mat: 'grade', rim: 'cromado' }],
    });
    for (let k = 0; k < 3; k++) stampShape(ctx.mb, ctx.rc(), { axis: 'x', sign: 1, poly: rrect(0, 0.95 + k * 0.1, 1.06, 0.035, 0.01, 1), mat: 'cromado', lift: 0.012, rings: 1 });
    wrapBumper(ctx, { end: 1, y: 0.72, h: 0.2, d: 0.1, mat: 'cromado', zMax: 1.0, r: 0.035 });
    wrapBumper(ctx, { end: -1, y: 0.7, h: 0.17, d: 0.09, mat: 'cromado', zMax: 1.0, r: 0.035 });
    archFlares(ctx, { width: 0.08, thick: 0.03, mat: 'pintura' });
    for (const s of [1, -1]) sideStep(ctx.mb, { x0: ctx.wheel.xr + 0.55, x1: ctx.wheel.xf - 0.55, y: 0.52, z: s * 1.0, w: 0.17, mat: 'plastico' });
    commonDetails(ctx, { handles: [[0.6, 1.27]], handleMat: 'cromado', exhaust: [[0.6, 0.45, 0.045]], plateF: 0.72, plateR: 0.9, doors: [[0.67, 0.5, 0.665, 1.32], [0.525, 0.48, 0.525, 1.35], [0.425, 0.5, 0.425, 1.35]], mirrorMat: 'cromado', mirrorSize: 1.25, mirrorArm: 0.07 });
  },
};
