// SUVs
import { commonDetails, def } from './hatches.js';
import { lamps, archFlares, roofRails, stampShape, stampQuad, rrect, ellipse2, doorLines } from '../details.js';
import { roundLamp, sideStep, wheel, bumperBar } from '../parts.js';
import { roundedBox, cylinder, tube, lathe } from '../prims.js';
import { MeshBuilder } from '../mesh.js';
import { m4t, m4chain, m4ry, m4rz, m4rx } from '../math.js';

const PI = Math.PI;

function roundLampsFront(ctx, z, y, r, o = {}) {
  const rc = ctx.rc();
  for (const s of [1, -1]) {
    const h = rc.cast([20, y, s * z], [-1, 0, 0], { filter: (m) => m !== 'vidro' });
    if (h) roundLamp(ctx.mb, { p: [h.p[0] - (o.sink ?? 0.008), h.p[1], h.p[2]], n: [1, 0, 0], r, ring: o.ring ?? 'cromado', mat: o.mat ?? 'farol', depth: 0.035 });
  }
}

// estepe traseiro (pneu + aro + capa)
export function spareWheel(ctx, { x, y, R = 0.36, w = 0.24, cover = null, style = 'offroad', rimMat = 'aro_escuro' }) {
  const wb = wheel({ R, w, style, rimMat, offroad: true, seg: 22 });
  // eixo da roda (Z) -> -X (face para trás)
  ctx.mb.merge(wb, m4chain(m4t(x - w / 2 - 0.01, y, 0), m4ry(-PI / 2)));
  ctx.mb.add('metal_escuro', roundedBox(0.12, 0.08, 0.08, 0.02, 1), m4t(x + 0.03, y, 0));
  if (cover) {
    ctx.mb.add(cover, lathe([[R + 0.012, -w / 2 - 0.01], [R + 0.016, w / 2], [R - 0.02, w / 2 + 0.02], [0, w / 2 + 0.03]], 26, { smoothDeg: 50 }), m4chain(m4t(x - w / 2 - 0.01, y, 0), m4rz(PI / 2)));
  }
}

// ---------------------------------------------------------------------------
export const suv_compacto = {
  slug: 'suv_compacto',
  L: 4.3, W: 1.8,
  colors: { pintura: '#c8cbd0', teto: '#18191c' },
  wheels: { front: 0.795, rear: 0.188, R: 0.345, w: 0.215, inset: 0.04, style: 'multi', rimMat: 'aluminio', clear: 0.06 },
  body: {
    top: [[0, 0.86], [0.008, 0.98], [0.025, 1.04], [0.06, 1.07], [0.3, 1.08], [0.55, 1.05], [0.67, 1.0], [0.8, 0.955], [0.92, 0.925], [0.965, 0.905], [0.988, 0.86], [1, 0.74]],
    bot: [[0, 0.52], [0.015, 0.4], [0.05, 0.31], [0.5, 0.28], [0.93, 0.31], [0.975, 0.38], [1, 0.48]],
    plan: { front: { rx: 0.3, p: 3.0 }, rear: { rx: 0.24, p: 3.2 } },
    rt: [[0, 0.07], [0.5, 0.08], [1, 0.1]], rb: 0.06, crown: 0.03, tuck: 0.035, tumble: 0.06, ySill: 0.33, yWaist: 0.72, yBelt: 1.06,
    regions: [
      { m: 'plastico', y: [0, 0.44], seg: ['sd', 'ba'] },
      { m: 'plastico', x: [1.7, 2.16], y: [0, 0.48] },
      { m: 'plastico', x: [-2.16, -1.85], y: [0, 0.5] },
    ],
  },
  cabin: {
    belt: [[0.03, 1.075], [0.3, 1.065], [0.67, 0.98]],
    roof: [[0.08, 1.585], [0.25, 1.62], [0.45, 1.63], [0.58, 1.6]],
    bot: { xf: 0.67, xr: 0.03, hw: 0.82, rf: 0.36, rr: 0.3 },
    top: { xf: 0.53, xr: 0.1, hw: 0.65, rf: 0.22, rr: 0.18 },
    pws: 1.25, prw: 1.0, roofR: 0.05, crown: 0.03, glassTop: 0.92, roofMat: 'teto',
    side: [{ zone: 'w', to: [0.465, 0.455], n: 2 }, { zone: 'b', to: [0.45, 0.44] }, { zone: 'w', to: [0.235, 0.25], n: 2 }, { zone: 'c', to: [0.2, 0.22] }, { zone: 'q', to: [0.1, 0.13] }, { zone: 'c', n: 1 }],
    frontWrap: 0.45, rearWrap: 0.45,
  },
  details(ctx) {
    lamps(ctx, {
      drl: [[0.5, 0.875], [0.78, 0.86], [0.8, 0.88], [0.52, 0.895]],
      head: [[0.56, 0.74], [0.8, 0.735], [0.82, 0.8], [0.58, 0.81]],
      tail: [[0.55, 0.92], [0.85, 0.9], [0.87, 0.97], [0.8, 1.04], [0.6, 1.04]],
      grille: [{ poly: [[-0.44, 0.6], [0.44, 0.6], [0.5, 0.82], [-0.5, 0.82]], mat: 'grade', rim: 'cromado' }],
    });
    stampShape(ctx.mb, ctx.rc(), { axis: 'x', sign: 1, poly: rrect(0, 0.42, 0.7, 0.08, 0.02, 2), mat: 'aluminio', lift: 0.006, rings: 1 });
    stampShape(ctx.mb, ctx.rc(), { axis: 'x', sign: -1, poly: rrect(0, 0.44, 0.7, 0.07, 0.02, 2), mat: 'aluminio', lift: 0.006, rings: 1 });
    archFlares(ctx, { width: 0.08, thick: 0.03 });
    roofRails(ctx, { u0: 0.1, u1: 0.52, z: 0.58, h: 0.05, mat: 'aluminio' });
    commonDetails(ctx, {
      handles: [[0.555, 1.0], [0.35, 1.01]], exhaust: [[0.45, 0.32]], fin: [0.13, 1.6], plateF: 0.53, plateR: 0.66,
      doors: [[0.69, 0.45, 0.685, 1.0], [0.455, 0.44, 0.45, 1.06], [0.24, 0.66, 0.225, 1.06]], rearWiper: [0.04, 1.25], mirrorMat: 'teto',
    });
  },
};

// ---------------------------------------------------------------------------
export const suv_cupe = def(suv_compacto, {
  slug: 'suv_cupe',
  L: 4.3, W: 1.79,
  colors: { pintura: '#2a4b9b', teto: '#2a4b9b' },
  wheels: { R: 0.335, style: 'liga10', rimMat: 'aro_escuro' },
  body: {
    top: [[0, 0.84], [0.008, 0.96], [0.025, 1.02], [0.06, 1.05], [0.3, 1.06], [0.55, 1.035], [0.67, 0.985], [0.8, 0.94], [0.92, 0.91], [0.965, 0.89], [0.988, 0.845], [1, 0.72]],
  },
  cabin: {
    belt: [[0.03, 1.06], [0.3, 1.055], [0.67, 0.965]],
    roof: [[0.14, 1.47], [0.25, 1.545], [0.42, 1.6], [0.58, 1.575]],
    bot: { xf: 0.67, xr: 0.028 },
    top: { xf: 0.53, xr: 0.17, rr: 0.22 },
    prw: 1.25, roofMat: 'pintura',
    side: [{ zone: 'w', to: [0.465, 0.455], n: 2 }, { zone: 'b', to: [0.45, 0.44] }, { zone: 'w', to: [0.23, 0.27], n: 2 }, { zone: 'c', n: 1 }],
  },
  details(ctx) {
    lamps(ctx, {
      head: [[0.5, 0.76], [0.78, 0.74], [0.84, 0.79], [0.78, 0.83], [0.52, 0.82]],
      tail: [[0.4, 0.93], [0.84, 0.91], [0.87, 0.97], [0.8, 1.03], [0.42, 1.0]],
      grille: [{ poly: [[-0.44, 0.58], [0.44, 0.58], [0.46, 0.76], [-0.46, 0.76]], mat: 'grade', rim: 'preto' }],
    });
    archFlares(ctx, { width: 0.075, thick: 0.028 });
    commonDetails(ctx, {
      handles: [[0.555, 0.99], [0.35, 1.0]], exhaust: [[0.45, 0.32]], fin: [0.2, 1.555], plateF: 0.5, plateR: 0.66,
      doors: [[0.69, 0.45, 0.685, 0.99], [0.455, 0.44, 0.45, 1.05], [0.25, 0.66, 0.23, 1.05]], rearWiper: [0.04, 1.2], mirrorMat: 'pintura',
    });
  },
});

// ---------------------------------------------------------------------------
export const suv_quadrado = {
  slug: 'suv_quadrado',
  L: 4.2, W: 1.8,
  colors: { pintura: '#6b8a3b', teto: '#16171a' },
  wheels: { front: 0.798, rear: 0.186, R: 0.345, w: 0.215, inset: 0.05, style: 'liga5', rimMat: 'aluminio', clear: 0.065 },
  body: {
    top: [[0, 0.92], [0.006, 1.04], [0.02, 1.09], [0.3, 1.1], [0.6, 1.09], [0.7, 1.06], [0.85, 1.03], [0.96, 1.01], [0.99, 0.99], [0.998, 0.95], [1, 0.86]],
    bot: [[0, 0.5], [0.012, 0.4], [0.04, 0.32], [0.5, 0.29], [0.95, 0.32], [0.985, 0.4], [1, 0.5]],
    plan: { front: { rx: 0.16, p: 4.0 }, rear: { rx: 0.14, p: 4.0 } },
    rt: 0.06, rb: 0.05, crown: 0.02, tuck: 0.02, tumble: 0.03, ySill: 0.34, yWaist: 0.7, yBelt: 1.08,
    regions: [
      { m: 'plastico', y: [0, 0.45], seg: ['sd', 'ba'] },
      { m: 'plastico', x: [1.8, 2.11], y: [0, 0.55] },
      { m: 'plastico', x: [-2.11, -1.9], y: [0, 0.55] },
    ],
  },
  cabin: {
    belt: [[0.02, 1.09], [0.3, 1.09], [0.7, 1.05]],
    roof: [[0.05, 1.66], [0.3, 1.7], [0.5, 1.7], [0.58, 1.69]],
    bot: { xf: 0.7, xr: 0.02, hw: 0.82, rf: 0.14, rr: 0.12 },
    top: { xf: 0.58, xr: 0.045, hw: 0.72, rf: 0.1, rr: 0.09 },
    pws: 1.05, prw: 1.0, roofR: 0.05, crown: 0.015, glassTop: 0.92, roofMat: 'teto',
    side: [{ zone: 'w', to: [0.48, 0.48], n: 2 }, { zone: 'b', to: [0.465, 0.465] }, { zone: 'w', to: [0.22, 0.22], n: 2 }, { zone: 'c', to: [0.19, 0.19] }, { zone: 'q', to: [0.06, 0.07] }, { zone: 'c', n: 1 }],
    zones: { a: 'teto', b: 'teto', c: 'teto' }, frameMat: 'teto', frontWrap: 0.3, rearWrap: 0.3,
  },
  details(ctx) {
    lamps(ctx, {
      tail: [[0.6, 0.86], [0.82, 0.86], [0.82, 1.04], [0.6, 1.04]], tailBezel: 'plastico',
      grille: [{ poly: [[-0.42, 0.72], [0.42, 0.72], [0.42, 0.92], [-0.42, 0.92]], mat: 'grade', rim: 'plastico' }],
    });
    // barras horizontais na grade
    for (let k = 0; k < 4; k++) stampShape(ctx.mb, ctx.rc(), { axis: 'x', sign: 1, poly: rrect(0, 0.75 + k * 0.05, 0.8, 0.012, 0.005, 1), mat: 'plastico_cinza', lift: 0.009, rings: 1 });
    roundLampsFront(ctx, 0.66, 0.87, 0.095, { ring: 'preto' });
    archFlares(ctx, { width: 0.1, thick: 0.035 });
    roofRails(ctx, { u0: 0.06, u1: 0.55, z: 0.64, h: 0.045, mat: 'plastico', footMat: 'plastico' });
    stampShape(ctx.mb, ctx.rc(), { axis: 'x', sign: 1, poly: rrect(0, 0.46, 0.6, 0.08, 0.02, 2), mat: 'plastico_cinza', lift: 0.008, rings: 1 });
    commonDetails(ctx, {
      handles: [[0.56, 1.02], [0.36, 1.03]], exhaust: [[0.45, 0.33]], plateF: 0.6, plateR: 0.62, mirrorMat: 'teto', mirrorBack: 0.06,
      doors: [[0.7, 0.46, 0.7, 1.05], [0.47, 0.45, 0.47, 1.09], [0.24, 0.6, 0.24, 1.09]], rearWiper: [0.02, 1.3],
    });
  },
};

// ---------------------------------------------------------------------------
export const suv_grande = {
  slug: 'suv_grande',
  L: 4.86, W: 1.91,
  colors: { pintura: '#2d2f34', teto: '#2d2f34' },
  wheels: { front: 0.811, rear: 0.245, R: 0.385, w: 0.25, inset: 0.04, style: 'liga6', rimMat: 'aluminio', clear: 0.07 },
  body: {
    top: [[0, 0.98], [0.006, 1.1], [0.02, 1.17], [0.05, 1.2], [0.3, 1.21], [0.6, 1.2], [0.7, 1.17], [0.85, 1.13], [0.95, 1.11], [0.985, 1.09], [0.996, 1.03], [1, 0.92]],
    bot: [[0, 0.56], [0.012, 0.46], [0.04, 0.38], [0.5, 0.34], [0.95, 0.38], [0.985, 0.46], [1, 0.56]],
    plan: { front: { rx: 0.22, p: 3.4 }, rear: { rx: 0.18, p: 3.6 } },
    rt: 0.07, rb: 0.06, crown: 0.03, tuck: 0.03, tumble: 0.045, ySill: 0.4, yWaist: 0.8, yBelt: 1.2,
    regions: [
      { m: 'plastico', x: [1.95, 2.44], y: [0, 0.55] },
      { m: 'plastico', x: [-2.44, -2.2], y: [0, 0.58] },
    ],
  },
  cabin: {
    belt: [[0.02, 1.2], [0.3, 1.2], [0.7, 1.15]],
    roof: [[0.05, 1.79], [0.3, 1.83], [0.5, 1.84], [0.6, 1.82]],
    bot: { xf: 0.7, xr: 0.02, hw: 0.88, rf: 0.24, rr: 0.16 },
    top: { xf: 0.585, xr: 0.04, hw: 0.74, rf: 0.16, rr: 0.12 },
    pws: 1.2, prw: 1.0, roofR: 0.048, crown: 0.025, glassTop: 0.92,
    side: [{ zone: 'w', to: [0.5, 0.49], n: 2 }, { zone: 'b', to: [0.485, 0.475] }, { zone: 'w', to: [0.3, 0.29], n: 2 }, { zone: 'b', to: [0.285, 0.275] }, { zone: 'w', to: [0.08, 0.09], n: 2 }, { zone: 'c', n: 1 }],
    frontWrap: 0.4, rearWrap: 0.35,
  },
  details(ctx) {
    lamps(ctx, {
      head: [[0.55, 0.9], [0.86, 0.88], [0.88, 0.96], [0.6, 1.0]],
      tail: [[0.6, 0.98], [0.88, 0.97], [0.89, 1.12], [0.62, 1.13]],
      grille: [{ poly: [[-0.48, 0.66], [0.48, 0.66], [0.52, 0.98], [-0.52, 0.98]], mat: 'grade', rim: 'cromado' }],
    });
    for (let k = -4; k <= 4; k++) stampShape(ctx.mb, ctx.rc(), { axis: 'x', sign: 1, poly: rrect(k * 0.1, 0.82, 0.018, 0.3, 0.006, 1), mat: 'cromado', lift: 0.01, rings: 1 });
    stampShape(ctx.mb, ctx.rc(), { axis: 'x', sign: 1, poly: rrect(0, 0.5, 0.8, 0.07, 0.02, 2), mat: 'aluminio', lift: 0.008, rings: 1 });
    stampShape(ctx.mb, ctx.rc(), { axis: 'y', sign: 1, poly: rrect(-0.35, 0, 0.8, 0.82, 0.08, 3), mat: 'vidro', lift: 0.004, rings: 2, rim: 'borracha' });
    archFlares(ctx, { width: 0.09, thick: 0.03 });
    roofRails(ctx, { u0: 0.07, u1: 0.56, z: 0.66, h: 0.055, mat: 'plastico', footMat: 'plastico' });
    for (const s of [1, -1]) sideStep(ctx.mb, { x0: ctx.wheel.xr + 0.48, x1: ctx.wheel.xf - 0.48, y: 0.42, z: s * (ctx.W / 2 - 0.02), w: 0.16 });
    commonDetails(ctx, {
      handles: [[0.6, 1.15], [0.39, 1.16]], handleMat: 'cromado', exhaust: [[0.5, 0.4, 0.04]], fin: [0.1, 1.82], plateF: 0.62, plateR: 0.76,
      doors: [[0.72, 0.5, 0.715, 1.15], [0.49, 0.45, 0.48, 1.2], [0.28, 0.66, 0.27, 1.2]], rearWiper: [0.02, 1.42], mirrorMat: 'pintura', mirrorSize: 0.95,
    });
  },
};

// ---------------------------------------------------------------------------
export const jipe_offroad = {
  slug: 'jipe_offroad',
  L: 4.03, W: 1.86,
  colors: { pintura: '#e2711f', teto: '#17181b' },
  wheels: { front: 0.81, rear: 0.205, R: 0.4, w: 0.26, inset: -0.01, style: 'offroad', rimMat: 'aro_escuro', offroad: true, clear: 0.07 },
  body: {
    W: 1.72,
    top: [[0, 0.98], [0.006, 1.08], [0.02, 1.12], [0.3, 1.13], [0.66, 1.13], [0.72, 1.1], [0.95, 1.08], [0.99, 1.07], [0.998, 1.03], [1, 0.94]],
    bot: [[0, 0.6], [0.012, 0.5], [0.04, 0.45], [0.5, 0.42], [0.95, 0.45], [0.985, 0.5], [1, 0.6]],
    plan: { front: { rx: 0.1, p: 5 }, rear: { rx: 0.1, p: 5 } },
    rt: 0.05, rb: 0.04, crown: 0.02, tuck: 0.015, tumble: 0.02, ySill: 0.46, yWaist: 0.8, yBelt: 1.12,
  },
  cabin: {
    belt: [[0.02, 1.12], [0.3, 1.12], [0.72, 1.1]],
    roof: [[0.04, 1.8], [0.3, 1.81], [0.6, 1.81]],
    bot: { xf: 0.72, xr: 0.025, hw: 0.8, rf: 0.07, rr: 0.07 },
    top: { xf: 0.66, xr: 0.035, hw: 0.76, rf: 0.06, rr: 0.06 },
    pws: 1.0, prw: 1.0, roofR: 0.04, crown: 0.01, glassTop: 0.82, roofMat: 'teto', frameMat: 'teto',
    side: [{ zone: 'w', to: [0.52, 0.52], n: 2 }, { zone: 'b', to: [0.5, 0.5] }, { zone: 'w', to: [0.3, 0.3], n: 2 }, { zone: 'c', to: [0.27, 0.27] }, { zone: 'q', to: [0.07, 0.07] }, { zone: 'c', n: 1 }],
    zones: { a: 'teto', b: 'teto', c: 'teto', rp: 'teto' }, frontWrap: 0.2, rearWrap: 0.2, rearWin: 0.5,
  },
  details(ctx) {
    const { mb, X } = ctx;
    lamps(ctx, {
      tail: [[0.66, 0.8], [0.8, 0.8], [0.8, 1.0], [0.66, 1.0]], tailBezel: 'plastico',
      grille: [{ poly: [[-0.45, 0.72], [0.45, 0.72], [0.45, 1.02], [-0.45, 1.02]], mat: 'grade', rim: 'plastico' }],
    });
    for (let k = 0; k < 5; k++) stampShape(mb, ctx.rc(), { axis: 'x', sign: 1, poly: rrect(0, 0.76 + k * 0.055, 0.84, 0.014, 0.005, 1), mat: 'plastico', lift: 0.01, rings: 1 });
    roundLampsFront(ctx, 0.66, 0.9, 0.095, { ring: 'preto' });
    archFlares(ctx, { width: 0.16, thick: 0.1, extra: 0.02 });
    // para-choques robustos
    for (const end of [1, -1]) {
      const x = end > 0 ? X(1) + 0.07 : X(0) - 0.07;
      mb.add('plastico', roundedBox(0.16, 0.16, 1.82, 0.035, 2), m4t(x, 0.58, 0));
      for (const s of [1, -1]) mb.add('metal_escuro', roundedBox(0.06, 0.08, 0.1, 0.015, 1), m4t(x + end * 0.06, 0.6, s * 0.7));
    }
    // bagageiro de teto
    const rc = ctx.rc();
    const top = (x, z) => { const h = rc.cast([x, 5, z], [0, -1, 0]); return h ? h.p[1] : 1.81; };
    const y0 = top(0, 0) + 0.08;
    const xa = X(0.06), xb = X(0.6), za = 0.68;
    const frame = [[xa, y0, -za], [xb, y0, -za], [xb, y0, za], [xa, y0, za]];
    mb.add('plastico', tube([...frame, frame[0]], 0.02, 8, { closedPath: false }));
    for (let k = 1; k <= 3; k++) {
      const x = xa + ((xb - xa) * k) / 4;
      mb.add('plastico', tube([[x, y0, -za], [x, y0, za]], 0.016, 8));
    }
    for (const x of [xa + 0.05, xb - 0.05]) for (const s of [1, -1]) mb.add('plastico', roundedBox(0.05, 0.1, 0.05, 0.012, 1), m4t(x, y0 - 0.05, s * za));
    // estepe na porta traseira
    spareWheel(ctx, { x: X(0) - 0.02, y: 0.95, R: 0.37, w: 0.24, cover: null });
    for (const s of [1, -1]) sideStep(mb, { x0: ctx.wheel.xr + 0.5, x1: ctx.wheel.xf - 0.5, y: 0.47, z: s * 0.88, w: 0.14 });
    commonDetails(ctx, {
      handles: [[0.6, 1.06], [0.38, 1.07]], handleMat: 'plastico', plateF: 0.64, plateR: 0.62, mirrorMat: 'teto', mirrorSize: 0.9, mirrorBack: 0.05,
      doors: [[0.72, 0.5, 0.72, 1.1], [0.5, 0.5, 0.5, 1.12], [0.28, 0.5, 0.28, 1.12]], wiperZ: [-0.4, 0.15],
    });
  },
};
