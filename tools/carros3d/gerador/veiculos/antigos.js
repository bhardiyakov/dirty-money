// Carros antigos
import { commonDetails } from './hatches.js';
import { lamps, wrapBumper, doorLines, roofRails, stampShape, stampQuad, rrect, ellipse2, outlineX } from '../details.js';
import { roundLamp, whipAntenna, mirror, handle, plate, wipers, exhaust, bumperBar } from '../parts.js';
import { makeBody, emitBody } from '../body.js';
import { MeshBuilder } from '../mesh.js';
import { roundedBox, cylinder, lathe, tube } from '../prims.js';
import { m4t, m4chain, m4ry, m4rz, m4rx } from '../math.js';

const PI = Math.PI;

// farol redondo fixado na superfície (projeção frontal)
function lampOn(ctx, z, y, r, o = {}) {
  const rc = ctx.rc();
  for (const s of o.single ? [1] : [1, -1]) {
    const h = rc.cast([20 * (o.end ?? 1), y, s * z], [-(o.end ?? 1), 0, 0], { filter: (m) => m !== 'vidro' });
    if (!h) continue;
    const n = o.n ?? [o.end ?? 1, 0, 0];
    roundLamp(ctx.mb, { p: [h.p[0] - (o.end ?? 1) * (o.sink ?? 0.006), h.p[1], h.p[2]], n, r, mat: o.mat ?? 'farol', ring: o.ring ?? 'cromado', depth: o.depth ?? 0.03 });
  }
}

function chromeTrim(ctx, y, u0, u1, mat = 'cromado') {
  const X = ctx.X;
  doorLines(ctx, [[X(u0), y, X(u1), y]], { width: 0.014, mat, lift: 0.002 });
}

// ---------------------------------------------------------------------------
export const seda_classico = {
  slug: 'seda_classico',
  L: 4.2, W: 1.57,
  colors: { pintura: '#a86c35', teto: '#a86c35' },
  wheels: { front: 0.824, rear: 0.252, R: 0.29, w: 0.17, inset: 0.04, style: 'calota', rimMat: 'cromado', clear: 0.05 },
  body: {
    top: [[0, 0.76], [0.006, 0.83], [0.025, 0.85], [0.22, 0.855], [0.27, 0.86], [0.6, 0.86], [0.63, 0.845], [0.8, 0.82], [0.95, 0.8], [0.985, 0.79], [0.996, 0.76], [1, 0.66]],
    bot: [[0, 0.4], [0.012, 0.31], [0.04, 0.25], [0.5, 0.22], [0.95, 0.25], [0.985, 0.31], [1, 0.4]],
    plan: { front: { rx: 0.13, p: 4.2 }, rear: { rx: 0.13, p: 4.2 } },
    rt: 0.045, rb: 0.04, crown: 0.016, tuck: 0.02, tumble: 0.03, ySill: 0.25, yWaist: 0.56, yBelt: 0.86,
  },
  cabin: {
    belt: [[0.24, 0.86], [0.62, 0.84]],
    roof: [[0.3, 1.29], [0.42, 1.32], [0.5, 1.31]],
    bot: { xf: 0.625, xr: 0.235, hw: 0.7, rf: 0.12, rr: 0.15 },
    top: { xf: 0.5, xr: 0.345, hw: 0.62, rf: 0.08, rr: 0.1 },
    pws: 1.1, prw: 1.05, roofR: 0.04, crown: 0.02, glassTop: 0.9,
    side: [{ zone: 'w', to: [0.425, 0.425], n: 2 }, { zone: 'b', to: [0.41, 0.41] }, { zone: 'q', to: [0.28, 0.37], n: 1 }, { zone: 'c', n: 1 }],
    zones: { b: 'pintura' }, frontWrap: 0.35, rearWrap: 0.45,
  },
  details(ctx) {
    lamps(ctx, {
      head: [[0.43, 0.63], [0.68, 0.63], [0.68, 0.74], [0.43, 0.74]], headBezel: 'cromado',
      tail: [[0.52, 0.55], [0.73, 0.55], [0.73, 0.76], [0.52, 0.76]], tailBezel: 'cromado',
      grille: [{ poly: [[-0.36, 0.6], [0.36, 0.6], [0.36, 0.74], [-0.36, 0.74]], mat: 'grade', rim: 'cromado' }],
    });
    wrapBumper(ctx, { end: 1, y: 0.43, h: 0.09, d: 0.06 });
    wrapBumper(ctx, { end: -1, y: 0.43, h: 0.09, d: 0.06 });
    chromeTrim(ctx, 0.62, 0.06, 0.94);
    commonDetails(ctx, { handles: [[0.45, 0.8]], handleMat: 'cromado', plateF: 0.52, plateR: 0.56, mirrorMat: 'cromado', mirrorSize: 0.6, mirrorBack: 0.12, doors: [[0.64, 0.32, 0.63, 0.84], [0.41, 0.3, 0.41, 0.86]], exhaust: [[0.4, 0.24]] });
    whipAntenna(ctx.mb, { x: ctx.X(0.7), y: 0.82, z: 0.7, h: 0.7 });
  },
};

// ---------------------------------------------------------------------------
export const hatch_90 = {
  slug: 'hatch_90',
  L: 3.9, W: 1.64,
  colors: { pintura: '#2f8a57', teto: '#2f8a57' },
  wheels: { front: 0.8, rear: 0.167, R: 0.285, w: 0.175, inset: 0.035, style: 'calota', rimMat: 'aluminio', clear: 0.05 },
  body: {
    top: [[0, 0.76], [0.01, 0.88], [0.03, 0.94], [0.08, 0.965], [0.3, 0.965], [0.55, 0.935], [0.66, 0.9], [0.8, 0.835], [0.92, 0.795], [0.965, 0.77], [0.988, 0.715], [1, 0.58]],
    bot: [[0, 0.45], [0.02, 0.32], [0.06, 0.24], [0.5, 0.21], [0.93, 0.23], [0.975, 0.29], [1, 0.38]],
    plan: { front: { rx: 0.32, p: 2.4 }, rear: { rx: 0.28, p: 2.5 } },
    rt: 0.08, rb: 0.05, crown: 0.03, tuck: 0.03, tumble: 0.05, ySill: 0.24, yWaist: 0.58, yBelt: 0.95,
    regions: [
      { m: 'plastico', x: [1.5, 1.96], y: [0, 0.4] },
      { m: 'plastico', x: [-1.96, -1.6], y: [0, 0.44] },
      { m: 'plastico', y: [0.4, 0.46], seg: 'sd' },
    ],
  },
  cabin: {
    belt: [[0.03, 0.96], [0.3, 0.955], [0.66, 0.88]],
    roof: [[0.08, 1.31], [0.25, 1.36], [0.42, 1.375], [0.55, 1.35]],
    bot: { xf: 0.66, xr: 0.03, hw: 0.75, rf: 0.34, rr: 0.34 },
    top: { xf: 0.5, xr: 0.12, hw: 0.6, rf: 0.22, rr: 0.24 },
    pws: 1.25, prw: 1.15, roofR: 0.05, crown: 0.028, glassTop: 0.92,
    side: [{ zone: 'w', to: [0.42, 0.42], n: 2 }, { zone: 'b', to: [0.405, 0.405] }, { zone: 'q', to: [0.19, 0.22], n: 2 }, { zone: 'c', n: 1 }],
    zones: { b: 'pintura' }, frontWrap: 0.45, rearWrap: 0.5,
  },
  details(ctx) {
    lamps(ctx, {
      head: [[0.4, 0.66], [0.62, 0.65], [0.76, 0.665], [0.79, 0.715], [0.7, 0.745], [0.42, 0.74]],
      tail: [[0.52, 0.74], [0.76, 0.73], [0.79, 0.8], [0.76, 0.89], [0.56, 0.9]],
      grille: [{ poly: [[-0.33, 0.66], [0.33, 0.66], [0.35, 0.735], [-0.35, 0.735]], mat: 'grade' }, { poly: [[-0.4, 0.27], [0.4, 0.27], [0.42, 0.33], [-0.42, 0.33]], mat: 'grade' }],
    });
    commonDetails(ctx, { handles: [[0.47, 0.86]], plateF: 0.5, plateR: 0.6, mirrorMat: 'plastico', doors: [[0.69, 0.47, 0.685, 0.89], [0.41, 0.47, 0.405, 0.95]], exhaust: [[0.4, 0.23]], rearWiper: [0.05, 1.05] });
  },
};

// ---------------------------------------------------------------------------
export const hatch_80 = {
  slug: 'hatch_80',
  L: 3.84, W: 1.6,
  colors: { pintura: '#e7c22a', teto: '#e7c22a' },
  wheels: { front: 0.807, rear: 0.193, R: 0.275, w: 0.165, inset: 0.035, style: 'calota', rimMat: 'aluminio', clear: 0.045 },
  body: {
    top: [[0, 0.8], [0.006, 0.875], [0.02, 0.895], [0.3, 0.9], [0.6, 0.9], [0.68, 0.88], [0.85, 0.83], [0.96, 0.815], [0.99, 0.805], [0.997, 0.795], [1, 0.77]],
    bot: [[0, 0.42], [0.015, 0.3], [0.05, 0.23], [0.5, 0.21], [0.95, 0.23], [0.985, 0.3], [1, 0.4]],
    plan: { front: { rx: 0.12, p: 5 }, rear: { rx: 0.12, p: 5 } },
    rt: 0.04, rb: 0.035, crown: 0.012, tuck: 0.02, tumble: 0.025, ySill: 0.24, yWaist: 0.55, yBelt: 0.9,
  },
  cabin: {
    belt: [[0.03, 0.9], [0.3, 0.9], [0.68, 0.86]],
    roof: [[0.1, 1.33], [0.3, 1.355], [0.55, 1.35]],
    bot: { xf: 0.68, xr: 0.022, hw: 0.73, rf: 0.08, rr: 0.08 },
    top: { xf: 0.55, xr: 0.105, hw: 0.65, rf: 0.06, rr: 0.06 },
    pws: 1.05, prw: 1.0, roofR: 0.035, crown: 0.012, glassTop: 0.9,
    side: [{ zone: 'w', to: [0.43, 0.43], n: 2 }, { zone: 'b', to: [0.415, 0.415] }, { zone: 'q', to: [0.17, 0.19], n: 1 }, { zone: 'c', n: 1 }],
    zones: { b: 'pintura' }, frontWrap: 0.3, rearWrap: 0.3,
  },
  details(ctx) {
    lamps(ctx, {
      tail: [[0.56, 0.6], [0.77, 0.6], [0.77, 0.86], [0.56, 0.86]], tailBezel: 'plastico',
      grille: [{ poly: [[-0.43, 0.63], [0.43, 0.63], [0.43, 0.74], [-0.43, 0.74]], mat: 'grade', rim: 'plastico' }],
    });
    for (const s of [1, -1]) {
      stampShape(ctx.mb, ctx.rc(), { axis: 'x', sign: 1, poly: rrect(s * 0.6, 0.685, 0.25, 0.12, 0.05, 3), mat: 'plastico', lift: 0.004, rings: 1 });
      stampShape(ctx.mb, ctx.rc(), { axis: 'x', sign: 1, poly: ellipse2(s * 0.6, 0.685, 0.105, 0.05, 20), mat: 'farol', lift: 0.009, rings: 2, rim: 'cromado' });
    }
    wrapBumper(ctx, { end: 1, y: 0.4, h: 0.13, d: 0.08, mat: 'plastico', r: 0.03 });
    wrapBumper(ctx, { end: -1, y: 0.42, h: 0.13, d: 0.08, mat: 'plastico', r: 0.03 });
    commonDetails(ctx, { handles: [[0.47, 0.82]], handleMat: 'plastico', plateF: 0.6, plateR: 0.6, mirrorMat: 'plastico', mirrorSize: 0.65, doors: [[0.7, 0.32, 0.695, 0.86], [0.415, 0.3, 0.415, 0.9]], exhaust: [[0.4, 0.23]] });
  },
};

// ---------------------------------------------------------------------------
export const sedan_70 = {
  slug: 'sedan_70',
  L: 4.71, W: 1.77,
  colors: { pintura: '#2f5c40', teto: '#2b2622' },
  matOverrides: { teto: { metal: 0, rough: 0.75, clearcoat: 0 } },
  wheels: { front: 0.798, rear: 0.231, R: 0.31, w: 0.19, inset: 0.04, style: 'calota', rimMat: 'cromado', whitewall: true, clear: 0.05 },
  body: {
    top: [[0, 0.76], [0.006, 0.83], [0.03, 0.865], [0.22, 0.875], [0.27, 0.88], [0.6, 0.875], [0.64, 0.86], [0.8, 0.85], [0.95, 0.84], [0.988, 0.825], [0.997, 0.79], [1, 0.7]],
    bot: [[0, 0.38], [0.015, 0.3], [0.05, 0.24], [0.5, 0.22], [0.95, 0.24], [0.985, 0.3], [1, 0.38]],
    plan: { front: { rx: 0.1, p: 5 }, rear: { rx: 0.14, p: 4 } },
    rt: 0.045, rb: 0.04, crown: 0.02, tuck: 0.025, tumble: 0.035, ySill: 0.25, yWaist: 0.56, yBelt: 0.88,
  },
  cabin: {
    belt: [[0.24, 0.875], [0.64, 0.86]],
    roof: [[0.38, 1.32], [0.46, 1.36], [0.53, 1.35]],
    bot: { xf: 0.64, xr: 0.24, hw: 0.78, rf: 0.14, rr: 0.16 },
    top: { xf: 0.525, xr: 0.395, hw: 0.66, rf: 0.08, rr: 0.1 },
    pws: 1.1, prw: 1.35, roofR: 0.045, crown: 0.02, glassTop: 0.9, roofMat: 'teto',
    side: [{ zone: 'w', to: [0.42, 0.43], n: 2 }, { zone: 'q', to: [0.31, 0.4], n: 1 }, { zone: 'c', n: 1 }],
    frontWrap: 0.35, rearWrap: 0.5,
  },
  details(ctx) {
    lamps(ctx, {
      tail: [[0.5, 0.6], [0.8, 0.6], [0.8, 0.76], [0.5, 0.76]], tailBezel: 'cromado',
      grille: [{ poly: [[-0.4, 0.63], [0.4, 0.63], [0.4, 0.79], [-0.4, 0.79]], mat: 'grade', rim: 'cromado' }],
    });
    for (const z of [0.71, 0.53]) lampOn(ctx, z, 0.715, 0.07);
    wrapBumper(ctx, { end: 1, y: 0.44, h: 0.11, d: 0.07 });
    wrapBumper(ctx, { end: -1, y: 0.44, h: 0.11, d: 0.07 });
    chromeTrim(ctx, 0.64, 0.03, 0.97);
    commonDetails(ctx, { handles: [[0.42, 0.82]], handleMat: 'cromado', plateF: 0.56, plateR: 0.6, mirrorMat: 'cromado', mirrorSize: 0.6, doors: [[0.645, 0.32, 0.64, 0.86], [0.36, 0.3, 0.36, 0.88]], exhaust: [[0.45, 0.24, 0.036]] });
    whipAntenna(ctx.mb, { x: ctx.X(0.7), y: 0.86, z: -0.78, h: 0.8 });
  },
};

// ---------------------------------------------------------------------------
export const brasilia = {
  slug: 'brasilia',
  L: 4.03, W: 1.63,
  colors: { pintura: '#e3ba2c', teto: '#e3ba2c' },
  wheels: { front: 0.8, rear: 0.206, R: 0.29, w: 0.165, inset: 0.04, style: 'calota', rimMat: 'cromado', clear: 0.05 },
  body: {
    top: [[0, 0.8], [0.008, 0.885], [0.025, 0.91], [0.3, 0.92], [0.68, 0.905], [0.8, 0.875], [0.95, 0.835], [0.99, 0.81], [1, 0.72]],
    bot: [[0, 0.4], [0.015, 0.3], [0.05, 0.24], [0.5, 0.22], [0.95, 0.24], [0.985, 0.3], [1, 0.4]],
    plan: { front: { rx: 0.15, p: 3.8 }, rear: { rx: 0.1, p: 5 } },
    rt: 0.05, rb: 0.04, crown: 0.02, tuck: 0.02, tumble: 0.03, ySill: 0.25, yWaist: 0.56, yBelt: 0.92,
  },
  cabin: {
    belt: [[0.02, 0.92], [0.3, 0.92], [0.7, 0.895]],
    roof: [[0.05, 1.42], [0.3, 1.43], [0.55, 1.43]],
    bot: { xf: 0.7, xr: 0.016, hw: 0.76, rf: 0.1, rr: 0.08 },
    top: { xf: 0.58, xr: 0.035, hw: 0.68, rf: 0.07, rr: 0.06 },
    pws: 1.05, prw: 1.0, roofR: 0.04, crown: 0.02, glassTop: 0.92,
    side: [{ zone: 'w', to: [0.45, 0.45], n: 2 }, { zone: 'b', to: [0.435, 0.435] }, { zone: 'q', to: [0.12, 0.12], n: 2 }, { zone: 'c', n: 1 }],
    zones: { b: 'pintura' }, frontWrap: 0.3, rearWrap: 0.3,
  },
  details(ctx) {
    lamps(ctx, {
      tail: [[0.55, 0.64], [0.74, 0.64], [0.74, 0.82], [0.55, 0.82]], tailBezel: 'cromado',
      grille: [{ poly: [[-0.25, 0.72], [0.25, 0.72], [0.25, 0.75], [-0.25, 0.75]], mat: 'grade', rim: 'cromado' }],
    });
    lampOn(ctx, 0.6, 0.74, 0.082);
    for (const s of [1, -1]) stampShape(ctx.mb, ctx.rc(), { axis: 'x', sign: 1, poly: rrect(s * 0.6, 0.6, 0.11, 0.045, 0.015, 2), mat: 'pisca', lift: 0.005, rings: 1, rim: 'cromado' });
    // grelha do motor na traseira
    for (let k = 0; k < 6; k++) stampShape(ctx.mb, ctx.rc(), { axis: 'x', sign: -1, poly: rrect(0, 0.6 + k * 0.025 - 0.1, 0.5, 0.012, 0.005, 1), mat: 'grade', lift: 0.003, rings: 1, walls: false });
    wrapBumper(ctx, { end: 1, y: 0.42, h: 0.075, d: 0.055 });
    wrapBumper(ctx, { end: -1, y: 0.42, h: 0.075, d: 0.055 });
    commonDetails(ctx, { handles: [[0.47, 0.86]], handleMat: 'cromado', plateF: 0.5, plateR: 0.48, mirrorMat: 'cromado', mirrorSize: 0.6, doors: [[0.72, 0.32, 0.715, 0.9], [0.435, 0.3, 0.435, 0.92]], exhaust: [[0.45, 0.24]] });
  },
};

// ---------------------------------------------------------------------------
export const perua_antiga = {
  slug: 'perua_antiga',
  L: 4.6, W: 1.69,
  colors: { pintura: '#8c2a2f', teto: '#8c2a2f' },
  wheels: { front: 0.813, rear: 0.252, R: 0.3, w: 0.185, inset: 0.04, style: 'calota', rimMat: 'cromado', clear: 0.05 },
  body: {
    top: [[0, 0.8], [0.006, 0.865], [0.02, 0.885], [0.3, 0.89], [0.6, 0.885], [0.66, 0.87], [0.8, 0.86], [0.95, 0.845], [0.988, 0.83], [0.997, 0.79], [1, 0.71]],
    bot: [[0, 0.4], [0.012, 0.3], [0.04, 0.24], [0.5, 0.22], [0.95, 0.24], [0.985, 0.3], [1, 0.38]],
    plan: { front: { rx: 0.1, p: 5 }, rear: { rx: 0.1, p: 5 } },
    rt: 0.045, rb: 0.04, crown: 0.018, tuck: 0.02, tumble: 0.03, ySill: 0.25, yWaist: 0.56, yBelt: 0.89,
  },
  cabin: {
    belt: [[0.02, 0.89], [0.3, 0.89], [0.66, 0.865]],
    roof: [[0.05, 1.36], [0.3, 1.375], [0.5, 1.375]],
    bot: { xf: 0.66, xr: 0.013, hw: 0.75, rf: 0.12, rr: 0.08 },
    top: { xf: 0.54, xr: 0.03, hw: 0.66, rf: 0.08, rr: 0.06 },
    pws: 1.1, prw: 1.0, roofR: 0.04, crown: 0.018, glassTop: 0.9,
    side: [{ zone: 'w', to: [0.445, 0.445], n: 2 }, { zone: 'b', to: [0.43, 0.43] }, { zone: 'q', to: [0.21, 0.21], n: 2 }, { zone: 'c', to: [0.18, 0.18] }, { zone: 'q', to: [0.035, 0.035], n: 1 }, { zone: 'c', n: 1 }],
    zones: { b: 'pintura' }, frontWrap: 0.35, rearWrap: 0.3,
  },
  details(ctx) {
    lamps(ctx, {
      head: [[0.48, 0.67], [0.74, 0.67], [0.74, 0.79], [0.48, 0.79]], headBezel: 'cromado',
      tail: [[0.55, 0.56], [0.76, 0.56], [0.76, 0.78], [0.55, 0.78]], tailBezel: 'cromado',
      grille: [{ poly: [[-0.42, 0.65], [0.42, 0.65], [0.42, 0.79], [-0.42, 0.79]], mat: 'grade', rim: 'cromado' }],
    });
    wrapBumper(ctx, { end: 1, y: 0.44, h: 0.1, d: 0.065 });
    wrapBumper(ctx, { end: -1, y: 0.44, h: 0.1, d: 0.065 });
    chromeTrim(ctx, 0.62, 0.03, 0.97);
    roofRails(ctx, { u0: 0.08, u1: 0.5, z: 0.6, h: 0.06, r: 0.014, mat: 'cromado', footMat: 'cromado', cross: 2 });
    commonDetails(ctx, { handles: [[0.46, 0.82]], handleMat: 'cromado', plateF: 0.54, plateR: 0.6, mirrorMat: 'cromado', mirrorSize: 0.6, doors: [[0.67, 0.32, 0.665, 0.86], [0.43, 0.3, 0.43, 0.89]], exhaust: [[0.45, 0.24]] });
  },
};

// ---------------------------------------------------------------------------
// Fusca: corpo central estreito + quatro para-lamas destacados + estribos + para-choques de lâmina
export const besouro = {
  slug: 'besouro',
  L: 4.04, W: 1.54,
  colors: { pintura: '#86b6d9', teto: '#86b6d9' },
  wheels: { front: 0.787, rear: 0.193, R: 0.3, w: 0.15, z: 0.62, style: 'calota', rimMat: 'cromado', clear: 0.06, whitewall: false },
  body: {
    W: 1.28,
    noArches: false,
    top: [[0, 0.5], [0.02, 0.62], [0.06, 0.76], [0.12, 0.88], [0.19, 0.955], [0.24, 0.975], [0.6, 0.965], [0.63, 0.95], [0.72, 0.9], [0.84, 0.81], [0.93, 0.71], [0.975, 0.61], [1, 0.47]],
    bot: [[0, 0.36], [0.03, 0.33], [0.1, 0.3], [0.5, 0.28], [0.9, 0.3], [0.97, 0.33], [1, 0.36]],
    plan: { front: { rx: 0.5, p: 2.1 }, rear: { rx: 0.42, p: 2.2 } },
    rt: 0.14, rb: 0.05, crown: 0.06, tuck: 0.0, tumble: 0.06, ySill: 0.3, yWaist: 0.55, yBelt: 0.97,
  },
  cabin: {
    belt: [[0.2, 0.955], [0.26, 0.975], [0.4, 0.975], [0.62, 0.955]],
    roof: [[0.3, 1.36], [0.36, 1.45], [0.44, 1.5], [0.5, 1.5], [0.58, 1.44]],
    bot: { xf: 0.638, xr: 0.2, hw: 0.61, rf: 0.36, rr: 0.42 },
    top: { xf: 0.565, xr: 0.32, hw: 0.45, rf: 0.24, rr: 0.3 },
    pws: 1.05, prw: 0.85, roofR: 0.12, crown: 0.05, glassTop: 0.9, rows: 4, bulge: 0.02, bulgeX: 0.0, ptw: 0.85,
    side: [{ zone: 'w', to: [0.415, 0.415], n: 2 }, { zone: 'b', to: [0.4, 0.4] }, { zone: 'q', to: [0.3, 0.355], n: 2 }, { zone: 'c', n: 1 }],
    zones: { b: 'pintura' }, frontWrap: 0.5, rearWrap: 0.55, rearWin: 0.32,
  },
  details(ctx) {
    const { mb, X } = ctx;
    // para-lamas
    const R = ctx.wheel.R;
    const fender = (x0, x1, xc, front) => {
      const Lf = x1 - x0;
      const uc = (xc - x0) / Lf;
      const B = makeBody({
        L: Lf, W: 0.42,
        top: front
          ? [[0, 0.36], [0.06, 0.5], [uc - 0.32, 0.72], [uc, 0.81], [uc + 0.2, 0.76], [0.92, 0.6], [0.985, 0.48], [1, 0.4]]
          : [[0, 0.4], [0.05, 0.52], [uc - 0.2, 0.74], [uc, 0.8], [uc + 0.28, 0.72], [0.94, 0.52], [1, 0.36]],
        bot: [[0, 0.32], [1, 0.32]],
        plan: front ? { front: { rx: 0.42, p: 2 }, rear: { rx: 0.25, p: 2 } } : { front: { rx: 0.25, p: 2 }, rear: { rx: 0.42, p: 2 } },
        rt: 0.1, rb: 0.03, crown: 0.06, tuck: 0, tumble: 0.03, ySill: 0.3, yWaist: 0.5, yBelt: 0.8,
        arches: [{ x: xc - (x0 + x1) / 2, r: R + 0.055, y: R }],
        stations: 40,
      });
      const tmp = new MeshBuilder();
      emitBody(tmp, B, { mat: 'pintura', under: 'chassi' });
      for (const s of [1, -1]) mb.merge(tmp, m4t((x0 + x1) / 2, 0, s * 0.56));
    };
    fender(ctx.wheel.xf - 0.62, X(1) - 0.04, ctx.wheel.xf, true);
    fender(X(0) + 0.05, ctx.wheel.xr + 0.58, ctx.wheel.xr, false);
    ctx.resetRc();
    // estribos
    for (const s of [1, -1]) mb.add('plastico', roundedBox(ctx.wheel.xf - ctx.wheel.xr - 0.95, 0.035, 0.17, 0.012, 1), m4t((ctx.wheel.xf + ctx.wheel.xr) / 2 - 0.02, 0.33, s * 0.69));
    // faróis nos para-lamas dianteiros
    const rc = ctx.rc();
    for (const s of [1, -1]) {
      const h = rc.cast([20, 0.66, s * 0.6], [-1, 0, 0]);
      if (h) roundLamp(mb, { p: [h.p[0] - 0.02, h.p[1], h.p[2]], n: [0.95, 0.3, 0], r: 0.085, ring: 'cromado' });
      const t = rc.cast([-20, 0.62, s * 0.62], [1, 0, 0]);
      if (t) roundLamp(mb, { p: [t.p[0] + 0.01, t.p[1], t.p[2]], n: [-0.85, 0.5, 0], r: 0.05, mat: 'lanterna', ring: 'cromado', depth: 0.02 });
    }
    // para-choques de lâmina com garras
    for (const end of [1, -1]) {
      const x = end > 0 ? X(1) + 0.07 : X(0) - 0.07;
      const path = [];
      for (let k = 0; k <= 20; k++) {
        const t = -1 + k / 10;
        path.push([x - end * 0.1 * Math.pow(Math.abs(t), 4), 0.42, t * 0.74]);
      }
      bumperBar(mb, { path, h: 0.09, d: 0.035, r: 0.015, mat: 'cromado' });
      for (const s of [1, -1]) {
        mb.add('cromado', roundedBox(0.04, 0.24, 0.035, 0.014, 2), m4t(x + end * 0.01, 0.47, s * 0.33));
        mb.add('metal_escuro', roundedBox(0.12, 0.03, 0.03, 0.01, 1), m4t(x - end * 0.07, 0.41, s * 0.42));
      }
    }
    // tampa do motor com venezianas
    for (let k = 0; k < 7; k++) stampShape(mb, rc, { axis: 'x', sign: -1, poly: rrect(0, 0.7 + k * 0.024, 0.2, 0.01, 0.004, 1), mat: 'grade', lift: 0.003, rings: 1, walls: false });
    commonDetails(ctx, { handles: [[0.43, 0.84]], handleMat: 'cromado', plateF: 0.52, plateR: 0.62, mirrorMat: 'cromado', mirrorSize: 0.5, mirrorBack: 0.15, mirrorIn: 0.02, doors: [[0.62, 0.36, 0.615, 0.93], [0.4, 0.35, 0.4, 0.96]], wiperZ: [-0.32, 0.08], wiperLen: 0.36, exhaust: [[0.25, 0.32, 0.03, -0.02], [-0.25, 0.32, 0.03, -0.02]] });
  },
};
