// Hatches modernos
import { mirror, handle, plate, wipers, sharkFin, exhaust, wing, roundLamp } from '../parts.js';
import { lamps, doorLines, archFlares, roofRails, stampShape, rrect, stripes } from '../details.js';
import { roundedBox, cylinder } from '../prims.js';
import { m4t, m4chain, m4rz, m4ry } from '../math.js';

// detalhes comuns a carros de passeio
export function commonDetails(ctx, o = {}) {
  const { mb, W, X } = ctx;
  const rc = ctx.rc();
  const B = ctx.body, C = ctx.cabin;
  if (o.mirror !== false) {
    const xm = X(o.mirrorU ?? C.spec.bot.xf) - (o.mirrorBack ?? 0.1);
    const ym = (o.mirrorY ?? C.belt(xm)) + 0.03;
    const z0 = B.halfW(xm) - (o.mirrorIn ?? 0.07);
    for (const s of [1, -1]) mirror(mb, { x: xm, y: ym, z0, side: s, mat: o.mirrorMat ?? 'pintura', size: o.mirrorSize ?? 0.75, arm: o.mirrorArm ?? 0.04 });
  }
  for (const h of o.handles ?? []) for (const s of [1, -1]) handle(mb, rc, { x: X(h[0]), y: h[1], side: s, mat: o.handleMat ?? 'pintura', w: o.handleW ?? 0.17 });
  if (o.wipers !== false) {
    const xw = X(C.spec.bot.xf) - 0.05;
    const yw = C.belt(xw) + 0.02;
    wipers(mb, { x: xw, y: yw, z: o.wiperZ ?? [-0.45 * (W / 1.74), 0.05], len: o.wiperLen ?? 0.5 });
  }
  if (o.rearWiper) {
    const [u, y] = o.rearWiper;
    const x = X(u);
    mb.add('borracha', roundedBox(0.03, 0.03, 0.05, 0.01, 1), m4t(x, y, 0.0));
    mb.add('borracha', roundedBox(0.012, 0.012, 0.42, 0.005, 1), m4chain(m4t(x + 0.03, y + 0.06, -0.12), m4ry(0.0), m4rz(0.5)));
  }
  if (o.plates !== false) {
    plate(mb, rc, { y: o.plateF ?? 0.45, end: 1, z: 0.0001 });
    plate(mb, rc, { y: o.plateR ?? 0.62, end: -1, z: 0.0001 });
  }
  if (o.exhaust) for (const e of o.exhaust) exhaust(mb, { x: X(0) + (e[3] ?? 0.05), y: e[1] ?? 0.24, z: e[0], r: e[2] ?? 0.032 });
  if (o.fin) sharkFin(mb, { x: X(o.fin[0]), y: o.fin[1] });
  if (o.doors) doorLines(ctx, o.doors.map(([u0, y0, u1, y1]) => [X(u0), y0, X(u1), y1]));
}

// mistura profunda simples
export function def(base, over) {
  if (Array.isArray(over) || typeof over !== 'object' || over === null) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = base && typeof base[k] === 'object' && !Array.isArray(base[k]) && typeof v === 'object' && !Array.isArray(v) && v !== null ? def(base[k], v) : v;
  return out;
}

// ---------------------------------------------------------------------------
export const hatch_moderno = {
  slug: 'hatch_moderno',
  L: 4.1, W: 1.74,
  colors: { pintura: '#c4161c', teto: '#c4161c' },
  wheels: { front: 0.805, rear: 0.183, R: 0.31, w: 0.19, inset: 0.035, style: 'liga5' },
  body: {
    top: [[0, 0.86], [0.006, 0.935], [0.02, 0.975], [0.05, 0.995], [0.3, 1.0], [0.55, 0.97], [0.675, 0.93], [0.8, 0.855], [0.92, 0.81], [0.962, 0.785], [0.985, 0.735], [1, 0.6]],
    bot: [[0, 0.48], [0.015, 0.34], [0.05, 0.26], [0.5, 0.22], [0.93, 0.24], [0.975, 0.3], [1, 0.4]],
    plan: { front: { rx: 0.36, p: 2.5 }, rear: { rx: 0.3, p: 2.8 } },
    rt: [[0, 0.07], [0.3, 0.075], [0.7, 0.09], [1, 0.11]], rb: 0.06, crown: 0.03,
    tuck: 0.04, tumble: 0.065, ySill: 0.25, yWaist: 0.6, yBelt: 0.98,
    regions: [
      { m: 'plastico', x: [1.55, 2.06], y: [0, 0.29] },
      { m: 'plastico', x: [-2.06, -1.7], y: [0, 0.36] },
    ],
  },
  cabin: {
    belt: [[0.02, 0.985], [0.3, 0.975], [0.675, 0.905]],
    roof: [[0.1, 1.405], [0.25, 1.45], [0.42, 1.47], [0.55, 1.445]],
    bot: { xf: 0.675, xr: 0.03, hw: 0.79, rf: 0.38, rr: 0.36 },
    top: { xf: 0.505, xr: 0.15, hw: 0.6, rf: 0.24, rr: 0.26 },
    pws: 1.3, prw: 1.2, roofR: 0.05, crown: 0.028, glassTop: 0.92,
    side: [{ zone: 'w', to: [0.455, 0.445], n: 2 }, { zone: 'b', to: [0.44, 0.43] }, { zone: 'w', to: [0.215, 0.26], n: 2 }, { zone: 'c', n: 1 }],
    frontWrap: 0.45, rearWrap: 0.5,
  },
  details(ctx) {
    lamps(ctx, {
      head: [[0.36, 0.705], [0.6, 0.69], [0.78, 0.705], [0.83, 0.745], [0.79, 0.79], [0.6, 0.775], [0.4, 0.75]],
      tail: [[0.5, 0.8], [0.8, 0.79], [0.85, 0.84], [0.83, 0.91], [0.62, 0.92], [0.52, 0.88]],
      grille: [
        { poly: [[-0.36, 0.48], [0.36, 0.48], [0.42, 0.62], [-0.42, 0.62]], mat: 'grade' },
        { poly: [[-0.55, 0.3], [0.55, 0.3], [0.6, 0.38], [-0.6, 0.38]], mat: 'grade' },
      ],
    });
    commonDetails(ctx, {
      handles: [[0.56, 0.91], [0.35, 0.92]], exhaust: [[0.45, 0.25]], fin: [0.15, 1.455], plateF: 0.44, plateR: 0.6,
      doors: [[0.705, 0.34, 0.7, 0.9], [0.455, 0.3, 0.45, 0.97], [0.235, 0.62, 0.22, 0.97]], rearWiper: [0.06, 1.12],
    });
    wing(ctx.mb, { x: ctx.X(0.115), y: 1.425, span: 1.12, chord: 0.15, thick: 0.028, mat: 'pintura', tilt: 0.25, end: false });
  },
};

// ---------------------------------------------------------------------------
export const hatch_moderno2 = def(hatch_moderno, {
  slug: 'hatch_moderno2',
  L: 4.0, W: 1.71,
  colors: { pintura: '#d9dbdf', teto: '#d9dbdf' },
  matOverrides: { farol: { color: '#dcecf7' } },
  wheels: { front: 0.8, rear: 0.17, R: 0.305, w: 0.185, style: 'multi' },
  body: {
    top: [[0, 0.76], [0.008, 0.9], [0.025, 0.965], [0.06, 0.995], [0.3, 1.0], [0.55, 0.965], [0.67, 0.925], [0.8, 0.85], [0.92, 0.805], [0.965, 0.775], [0.987, 0.725], [1, 0.59]],
    plan: { front: { rx: 0.34, p: 2.4 }, rear: { rx: 0.28, p: 2.6 } },
    regions: [
      { m: 'plastico', x: [1.5, 2.01], y: [0, 0.29] },
      { m: 'plastico', x: [-2.01, -1.65], y: [0, 0.35] },
    ],
  },
  cabin: {
    belt: [[0.02, 0.99], [0.3, 0.975], [0.67, 0.9]],
    roof: [[0.1, 1.41], [0.25, 1.45], [0.42, 1.465], [0.55, 1.44]],
    bot: { xf: 0.67, xr: 0.03, hw: 0.78 },
    top: { xf: 0.5, xr: 0.145, hw: 0.59 },
    side: [{ zone: 'w', to: [0.45, 0.44], n: 2 }, { zone: 'b', to: [0.435, 0.425] }, { zone: 'w', to: [0.23, 0.27], n: 2 }, { zone: 'q', to: [0.12, 0.2] }, { zone: 'c', n: 1 }],
  },
  details(ctx) {
    lamps(ctx, {
      head: [[0.42, 0.715], [0.62, 0.69], [0.77, 0.69], [0.82, 0.73], [0.76, 0.775], [0.55, 0.785], [0.44, 0.765]],
      tail: [[0.6, 0.83], [0.83, 0.82], [0.855, 0.88], [0.84, 0.97], [0.7, 0.975], [0.62, 0.92]],
      grille: [
        { poly: [[-0.3, 0.44], [0.3, 0.44], [0.4, 0.5], [0.34, 0.6], [-0.34, 0.6], [-0.4, 0.5]], mat: 'grade' },
      ],
      fog: [0.6, 0.36, 0.05],
    });
    commonDetails(ctx, {
      handles: [[0.555, 0.91], [0.345, 0.92]], exhaust: [[0.42, 0.25]], fin: [0.15, 1.45], plateF: 0.37, plateR: 0.6,
      doors: [[0.7, 0.34, 0.695, 0.9], [0.45, 0.3, 0.445, 0.97], [0.25, 0.62, 0.235, 0.97]], rearWiper: [0.06, 1.12],
    });
    wing(ctx.mb, { x: ctx.X(0.11), y: 1.425, span: 1.1, chord: 0.14, thick: 0.026, mat: 'pintura', tilt: 0.25, end: false });
  },
});

// ---------------------------------------------------------------------------
export const compacto_aventureiro = def(hatch_moderno, {
  slug: 'compacto_aventureiro',
  L: 3.7, W: 1.66,
  colors: { pintura: '#ec7d1c', teto: '#ec7d1c' },
  wheels: { front: 0.814, rear: 0.16, R: 0.3, w: 0.175, style: 'liga6', rimMat: 'aro_escuro', clear: 0.07, inset: 0.05 },
  body: {
    top: [[0, 0.8], [0.008, 0.93], [0.025, 1.0], [0.06, 1.03], [0.3, 1.04], [0.55, 1.01], [0.66, 0.975], [0.8, 0.92], [0.92, 0.885], [0.965, 0.85], [0.988, 0.79], [1, 0.66]],
    bot: [[0, 0.5], [0.015, 0.38], [0.05, 0.3], [0.5, 0.27], [0.93, 0.3], [0.975, 0.36], [1, 0.46]],
    plan: { front: { rx: 0.3, p: 2.7 }, rear: { rx: 0.24, p: 3.0 } },
    rt: [[0, 0.07], [0.5, 0.08], [1, 0.1]],
    ySill: 0.3, yWaist: 0.65, yBelt: 1.02,
    regions: [
      { m: 'plastico', x: [1.45, 1.86], y: [0, 0.4] },
      { m: 'plastico', x: [-1.86, -1.55], y: [0, 0.42] },
      { m: 'plastico', y: [0, 0.38], seg: ['sd', 'ba'] },
    ],
  },
  cabin: {
    belt: [[0.02, 1.02], [0.3, 1.015], [0.66, 0.95]],
    roof: [[0.1, 1.44], [0.25, 1.48], [0.42, 1.49], [0.55, 1.47]],
    bot: { xf: 0.66, xr: 0.03, hw: 0.76, rf: 0.32, rr: 0.3 },
    top: { xf: 0.5, xr: 0.13, hw: 0.6, rf: 0.2, rr: 0.2 },
    side: [{ zone: 'w', to: [0.45, 0.44], n: 2 }, { zone: 'b', to: [0.435, 0.425] }, { zone: 'w', to: [0.2, 0.24], n: 2 }, { zone: 'c', n: 1 }],
  },
  details(ctx) {
    lamps(ctx, {
      head: [[0.42, 0.79], [0.66, 0.78], [0.77, 0.79], [0.78, 0.84], [0.62, 0.855], [0.45, 0.835]],
      drl: [[0.48, 0.87], [0.72, 0.865], [0.75, 0.88], [0.5, 0.885]],
      tail: [[0.55, 0.86], [0.79, 0.85], [0.81, 0.92], [0.79, 0.99], [0.6, 0.99]],
      grille: [
        { poly: [[-0.38, 0.66], [0.38, 0.66], [0.41, 0.76], [-0.41, 0.76]], mat: 'grade' },
        { poly: [[-0.42, 0.42], [0.42, 0.42], [0.46, 0.52], [-0.46, 0.52]], mat: 'grade' },
      ],
    });
    archFlares(ctx, { width: 0.075, thick: 0.03 });
    stampShape(ctx.mb, ctx.rc(), { axis: 'x', sign: 1, poly: rrect(0, 0.37, 0.56, 0.07, 0.02, 2), mat: 'aluminio', lift: 0.006, rings: 1, rim: 'aluminio' });
    roofRails(ctx, { u0: 0.14, u1: 0.5, z: 0.5, h: 0.045, mat: 'plastico', footMat: 'plastico' });
    commonDetails(ctx, {
      handles: [[0.55, 0.95], [0.34, 0.96]], exhaust: [[0.42, 0.3]], plateF: 0.44, plateR: 0.64,
      doors: [[0.69, 0.4, 0.685, 0.95], [0.445, 0.38, 0.44, 1.0], [0.225, 0.65, 0.21, 1.0]], rearWiper: [0.06, 1.14],
      mirrorMat: 'pintura',
    });
  },
});

// ---------------------------------------------------------------------------
export const quadradinho = {
  slug: 'quadradinho',
  L: 3.66, W: 1.61,
  colors: { pintura: '#2e5fb5', teto: '#2e5fb5' },
  wheels: { front: 0.82, rear: 0.175, R: 0.275, w: 0.165, inset: 0.04, style: 'aco', rimMat: 'aluminio', clear: 0.05 },
  body: {
    top: [[0, 0.88], [0.006, 0.955], [0.02, 0.975], [0.3, 0.98], [0.6, 0.965], [0.72, 0.945], [0.85, 0.89], [0.95, 0.86], [0.985, 0.84], [0.996, 0.79], [1, 0.72]],
    bot: [[0, 0.42], [0.012, 0.32], [0.04, 0.25], [0.5, 0.22], [0.95, 0.25], [0.985, 0.31], [1, 0.4]],
    plan: { front: { rx: 0.1, p: 4.5 }, rear: { rx: 0.09, p: 5 } },
    rt: 0.05, rb: 0.04, crown: 0.015,
    tuck: 0.015, tumble: 0.02, ySill: 0.25, yWaist: 0.5, yBelt: 0.97,
    regions: [
      { m: 'plastico', x: [1.68, 1.84], y: [0.3, 0.5] },
      { m: 'plastico', x: [-1.84, -1.7], y: [0.3, 0.55] },
      { m: 'plastico', y: [0.32, 0.4], seg: 'sd', f: (c) => c.x > -1.6 && c.x < 1.55 },
    ],
  },
  cabin: {
    belt: [[0.02, 0.97], [0.3, 0.97], [0.72, 0.93]],
    roof: [[0.05, 1.47], [0.3, 1.48], [0.5, 1.48], [0.6, 1.475]],
    bot: { xf: 0.72, xr: 0.012, hw: 0.765, rf: 0.07, rr: 0.07 },
    top: { xf: 0.6, xr: 0.035, hw: 0.7, rf: 0.06, rr: 0.06 },
    pws: 1.0, prw: 1.0, roofR: 0.04, crown: 0.015, glassTop: 0.92,
    side: [{ zone: 'w', to: [0.43, 0.43], n: 2 }, { zone: 'b', to: [0.415, 0.415] }, { zone: 'q', to: [0.1, 0.1], n: 2 }, { zone: 'c', n: 1 }],
    frontWrap: 0.3, rearWrap: 0.3,
    zones: { b: 'pintura' },
  },
  details(ctx) {
    const { mb, X } = ctx;
    lamps(ctx, {
      head: [[0.5, 0.72], [0.74, 0.72], [0.74, 0.82], [0.5, 0.82]],
      headBezel: 'plastico',
      tail: [[0.6, 0.62], [0.76, 0.62], [0.76, 0.95], [0.66, 0.95]],
      tailBezel: 'plastico',
      grille: [{ poly: [[-0.44, 0.72], [0.44, 0.72], [0.44, 0.8], [-0.44, 0.8]], mat: 'grade' }],
    });
    commonDetails(ctx, {
      handles: [[0.47, 0.88]], exhaust: [[0.4, 0.24]], plateF: 0.4, plateR: 0.45, mirrorMat: 'plastico', mirrorBack: 0.06,
      doors: [[0.735, 0.4, 0.73, 0.93], [0.415, 0.4, 0.415, 0.95]], wiperZ: [-0.05], wiperLen: 0.62, rearWiper: [0.02, 1.08],
    });
  },
};

// ---------------------------------------------------------------------------
export const hatch_esportivo = def(hatch_moderno, {
  slug: 'hatch_esportivo',
  L: 4.17, W: 1.8,
  colors: { pintura: '#d2141c', teto: '#141518' },
  wheels: { front: 0.789, rear: 0.158, R: 0.32, w: 0.225, style: 'esportivo', rimMat: 'aro_escuro', caliper: true, inset: 0.03, clear: 0.045 },
  body: {
    top: [[0, 0.72], [0.008, 0.86], [0.025, 0.93], [0.06, 0.965], [0.3, 0.975], [0.55, 0.95], [0.665, 0.91], [0.8, 0.84], [0.92, 0.79], [0.962, 0.765], [0.985, 0.715], [1, 0.57]],
    bot: [[0, 0.44], [0.015, 0.3], [0.05, 0.21], [0.5, 0.19], [0.93, 0.2], [0.975, 0.26], [1, 0.36]],
    plan: { front: { rx: 0.34, p: 2.6 }, rear: { rx: 0.26, p: 3.0 } },
    rt: [[0, 0.07], [0.5, 0.07], [1, 0.1]],
    ySill: 0.22, yWaist: 0.58, yBelt: 0.95,
    regions: [
      { m: 'plastico', x: [1.6, 2.1], y: [0, 0.25] },
      { m: 'preto', x: [-2.1, -1.8], y: [0, 0.32] },
    ],
  },
  cabin: {
    belt: [[0.02, 0.96], [0.3, 0.95], [0.665, 0.885]],
    roof: [[0.1, 1.37], [0.25, 1.415], [0.42, 1.44], [0.55, 1.415]],
    bot: { xf: 0.665, xr: 0.035, hw: 0.82, rf: 0.36, rr: 0.34 },
    top: { xf: 0.5, xr: 0.16, hw: 0.62, rf: 0.22, rr: 0.24 },
    roofMat: 'teto',
    side: [{ zone: 'w', to: [0.45, 0.44], n: 2 }, { zone: 'b', to: [0.435, 0.425] }, { zone: 'w', to: [0.25, 0.29], n: 2 }, { zone: 'c', n: 1 }],
  },
  details(ctx) {
    lamps(ctx, {
      head: [[0.4, 0.69], [0.62, 0.675], [0.8, 0.69], [0.85, 0.725], [0.8, 0.765], [0.6, 0.755], [0.42, 0.735]],
      tail: [[0.48, 0.81], [0.83, 0.8], [0.875, 0.85], [0.86, 0.915], [0.6, 0.92], [0.5, 0.88]],
      grille: [
        { poly: [[-0.4, 0.6], [0.4, 0.6], [0.42, 0.66], [-0.42, 0.66]], mat: 'grade' },
        { poly: [[-0.6, 0.26], [0.6, 0.26], [0.66, 0.46], [-0.66, 0.46]], mat: 'grade' },
      ],
    });
    commonDetails(ctx, {
      handles: [[0.56, 0.89], [0.355, 0.9]], exhaust: [[0.55, 0.24, 0.04], [-0.55, 0.24, 0.04]], fin: [0.16, 1.425], plateF: 0.52, plateR: 0.56,
      mirrorMat: 'preto', doors: [[0.7, 0.3, 0.695, 0.88], [0.45, 0.27, 0.445, 0.95], [0.27, 0.6, 0.255, 0.95]], rearWiper: [0.06, 1.1],
    });
    wing(ctx.mb, { x: ctx.X(0.135), y: 1.39, span: 1.18, chord: 0.2, thick: 0.03, mat: 'teto', tilt: 0.22, end: true });
  },
});

// ---------------------------------------------------------------------------
export const mini_eletrico = def(hatch_moderno, {
  slug: 'mini_eletrico',
  L: 3.57, W: 1.69,
  colors: { pintura: '#8fd2c2', teto: '#f2f1ec' },
  matOverrides: { pintura: { metal: 0.1, rough: 0.35 } },
  wheels: { front: 0.815, rear: 0.143, R: 0.3, w: 0.185, style: 'liga10', rimMat: 'aluminio', inset: 0.035 },
  body: {
    top: [[0, 0.82], [0.008, 0.95], [0.025, 1.02], [0.06, 1.05], [0.3, 1.06], [0.55, 1.035], [0.67, 1.0], [0.8, 0.94], [0.92, 0.9], [0.962, 0.87], [0.985, 0.81], [1, 0.66]],
    bot: [[0, 0.48], [0.015, 0.34], [0.05, 0.25], [0.5, 0.21], [0.93, 0.24], [0.975, 0.3], [1, 0.42]],
    plan: { front: { rx: 0.36, p: 2.3 }, rear: { rx: 0.3, p: 2.5 } },
    rt: [[0, 0.09], [0.5, 0.1], [1, 0.12]], crown: 0.035,
    ySill: 0.25, yWaist: 0.62, yBelt: 1.04,
    regions: [
      { m: 'plastico', x: [1.45, 1.8], y: [0, 0.3] },
      { m: 'plastico', x: [-1.8, -1.5], y: [0, 0.36] },
    ],
  },
  cabin: {
    belt: [[0.02, 1.05], [0.3, 1.045], [0.67, 0.975]],
    roof: [[0.1, 1.52], [0.25, 1.56], [0.42, 1.575], [0.55, 1.56]],
    bot: { xf: 0.67, xr: 0.03, hw: 0.78, rf: 0.36, rr: 0.34 },
    top: { xf: 0.52, xr: 0.12, hw: 0.62, rf: 0.24, rr: 0.24 },
    roofMat: 'teto',
    side: [{ zone: 'w', to: [0.45, 0.44], n: 2 }, { zone: 'b', to: [0.435, 0.425] }, { zone: 'w', to: [0.2, 0.22], n: 2 }, { zone: 'c', n: 1 }],
  },
  details(ctx) {
    lamps(ctx, {
      head: [[0.45, 0.8], [0.68, 0.79], [0.78, 0.8], [0.8, 0.83], [0.7, 0.85], [0.47, 0.835]],
      tail: [[0.3, 0.9], [0.7, 0.895], [0.83, 0.9], [0.84, 0.94], [0.7, 0.95], [0.3, 0.948]],
      grille: [{ poly: [[-0.45, 0.32], [0.45, 0.32], [0.5, 0.42], [-0.5, 0.42]], mat: 'grade' }],
    });
    // barra de luz traseira contínua
    stampShape(ctx.mb, ctx.rc(), { axis: 'x', sign: -1, poly: rrect(0, 0.925, 0.62, 0.03, 0.012, 2), mat: 'lanterna', lift: 0.005, rings: 1 });
    commonDetails(ctx, {
      handles: [[0.555, 0.98], [0.34, 0.99]], plateF: 0.5, plateR: 0.62, mirrorMat: 'teto',
      doors: [[0.695, 0.34, 0.69, 0.98], [0.45, 0.3, 0.445, 1.04], [0.22, 0.62, 0.21, 1.04]], fin: [0.13, 1.545], rearWiper: [0.05, 1.18],
    });
    wing(ctx.mb, { x: ctx.X(0.1), y: 1.52, span: 1.12, chord: 0.12, thick: 0.025, mat: 'teto', tilt: 0.25, end: false });
  },
});
