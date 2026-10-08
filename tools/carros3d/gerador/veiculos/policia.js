// Polícia e forças
import { commonDetails, def } from './hatches.js';
import { sedan_medio } from './sedans.js';
import { van_furgao, roofRibs } from './vans.js';
import { spareWheel } from './suvs.js';
import { lamps, stampShape, stampQuad, rrect, doorLines, text, archFlares, stripes } from '../details.js';
import { lightBar, roundLamp, sideStep, whipAntenna } from '../parts.js';
import { roundedBox, tube, cylinder, extrude } from '../prims.js';
import { m4t, m4chain, m4rz, m4ry } from '../math.js';
import { alignY } from '../parts.js';

const PI = Math.PI;

// para-choque de impulsão (quebra-mato)
function pushBar(ctx, { y0 = 0.3, y1 = 0.85, zw = 0.55, mat = 'plastico', gap = 0.1 }) {
  const rc = ctx.rc();
  const h = rc.cast([20, (y0 + y1) / 2, 0.0001], [-1, 0, 0]);
  const x = (h ? h.p[0] : ctx.X(1)) + gap;
  const r = 0.03;
  for (const s of [1, -1]) {
    ctx.mb.add(mat, tube([[x - gap - 0.02, y0, s * zw * 0.5], [x, y0 + 0.02, s * zw * 0.5], [x, y1, s * zw * 0.5], [x - gap * 0.6, y1 + 0.03, s * zw * 0.5]], r, 10));
  }
  ctx.mb.add(mat, tube([[x, y1 - 0.06, -zw], [x, y1 - 0.06, zw]], r, 10));
  ctx.mb.add(mat, tube([[x, y0 + 0.12, -zw], [x, y0 + 0.12, zw]], r, 10));
  ctx.mb.add(mat, roundedBox(0.05, (y1 - y0) * 0.55, zw * 0.9, 0.012, 1), m4t(x, (y0 + y1) / 2, 0));
}

// ---------------------------------------------------------------------------
export const viatura = def(sedan_medio, {
  slug: 'viatura',
  colors: { pintura: '#f5f5f2', teto: '#f5f5f2', decal: '#1c2f7a', decal2: '#c8141e' },
  extras: { pinturaFixa: true },
  wheels: { style: 'aco', rimMat: 'aro_preto' },
  details(ctx) {
    sedan_medio.details(ctx);
    const { mb, X } = ctx;
    // faixa vermelha lateral e texto
    for (const s of [1, -1]) {
      stampQuad(mb, ctx.rc(), { axis: 'z', sign: s, corners: [[X(0.03), 0.66], [X(0.97), 0.66], [X(0.97), 0.71], [X(0.03), 0.71]], na: 60, nb: 2, mat: 'decal2', lift: 0.0025, minFacing: 0.2 });
      text(ctx, { str: 'POLÍCIA', axis: 'z', sign: s, center: [X(0.56), 0.82], h: 0.13, dirU: [s, 0], dirV: [0, 1], mat: 'decal', lift: 0.003 });
    }
    // capô e porta-malas
    text(ctx, { str: 'POLÍCIA', axis: 'y', center: [X(0.83), 0.0], h: 0.17, dirU: [0, 1], dirV: [1, 0], mat: 'decal', lift: 0.003 });
    text(ctx, { str: '190', axis: 'y', center: [X(0.1), 0.0], h: 0.2, dirU: [0, 1], dirV: [1, 0], mat: 'decal', lift: 0.003 });
    // faixa transversal vermelha (coluna C)
    stampQuad(mb, ctx.rc(), { axis: 'y', sign: 1, corners: [[X(0.215), -0.95], [X(0.228), -0.95], [X(0.228), 0.95], [X(0.215), 0.95]], na: 1, nb: 40, mat: 'decal2', lift: 0.003, minFacing: 0.15, skipMat: (m) => m === 'vidro' || m === 'borracha' });
    // giroflex
    const h = ctx.rc().cast([X(0.42), 5, 0.0001], [0, -1, 0]);
    if (h) lightBar(mb, { x: X(0.42), y: h.p[1] - 0.005, len: 1.15, w: 0.26, h: 0.09 });
    pushBar(ctx, { y0: 0.3, y1: 0.72, zw: 0.5, mat: 'plastico', gap: 0.11 });
    whipAntenna(mb, { x: X(0.18), y: 1.0, z: 0.0001, h: 0.5 });
  },
});

// ---------------------------------------------------------------------------
export const swat_van = def(van_furgao, {
  slug: 'swat_van',
  W: 2.06,
  colors: { pintura: '#17181b', teto: '#17181b', decal: '#e9e9e4' },
  extras: { pinturaFixa: true },
  matOverrides: { pintura: { metal: 0.2, rough: 0.55, clearcoat: 0.2 } },
  wheels: { R: 0.4, w: 0.25, style: 'aco', rimMat: 'aro_preto', offroad: true, clear: 0.07 },
  body: {
    top: [[0, 1.12], [0.004, 1.16], [0.015, 1.17], [0.78, 1.17], [0.8, 1.15], [0.88, 1.11], [0.95, 1.07], [0.985, 1.02], [0.997, 0.96], [1, 0.86]],
    bot: [[0, 0.62], [0.01, 0.52], [0.03, 0.44], [0.5, 0.4], [0.95, 0.42], [0.985, 0.48], [1, 0.58]],
    plan: { front: { rx: 0.3, p: 3.4 }, rear: { rx: 0.06, p: 6 } },
    rt: [[0, 0.04], [0.78, 0.04], [0.85, 0.06], [1, 0.08]], ySill: 0.45, yWaist: 0.85, yBelt: 1.17,
  },
  cabin: {
    belt: [[0.006, 1.17], [0.8, 1.15]],
    roof: [[0.01, 2.46], [0.5, 2.5], [0.73, 2.48]],
    bot: { xf: 0.8, xr: 0.006, hw: 1.0, rf: 0.2, rr: 0.05 },
    top: { xf: 0.75, xr: 0.008, hw: 0.96, rf: 0.12, rr: 0.05 },
    pws: 1.4, roofR: 0.06, glassTop: 0.75, glassBot: 0.45,
    side: [{ zone: 'w', to: [0.68, 0.685], n: 2 }, { zone: 'b', to: [0.665, 0.67] }, { zone: 'p', n: 8 }],
    zones: { b: 'pintura' }, rearWin: 0.6, rearZ: [0.12],
    cellFn: (c) => {
      if (c.row.k !== 'band') return null;
      if (c.zone === 'ws') return c.row.f >= 0.08 && c.row.f < 0.9 ? { m: 'vidro', d: 0.012, w: 'borracha' } : { m: 'pintura' };
      if (c.zone === 'rw' && c.row.f < 0.6) return { m: 'pintura' };
      return null;
    },
  },
  details(ctx) {
    const { mb, X } = ctx;
    const rc = ctx.rc();
    lamps(ctx, {
      head: [[0.58, 0.9], [0.86, 0.88], [0.9, 0.93], [0.86, 0.99], [0.6, 0.99]],
      tail: [[0.84, 0.7], [0.96, 0.7], [0.96, 1.1], [0.84, 1.1]], tailBezel: 'preto',
      grille: [{ poly: [[-0.52, 0.62], [0.52, 0.62], [0.56, 0.92], [-0.56, 0.92]], mat: 'grade', rim: 'preto' }],
    });
    roofRibs(ctx, { u0: 0.03, u1: 0.68, n: 16, zw: 0.9, mat: 'pintura' });
    // grade de proteção do para-brisa
    const C = ctx.cabin;
    for (let k = -4; k <= 4; k++) {
      const z = k * 0.2;
      const a = rc.cast([20, 1.3, z], [-1, 0, 0]), b = rc.cast([20, 2.25, z], [-1, 0, 0]);
      if (a && b) mb.add('metal_escuro', tube([[a.p[0] + 0.05, a.p[1], z], [b.p[0] + 0.05, b.p[1], z]], 0.012, 6));
    }
    void C;
    // escotilha no teto
    const hh = rc.cast([X(0.45), 6, 0.0001], [0, -1, 0]);
    if (hh) {
      mb.add('pintura', roundedBox(0.7, 0.1, 0.7, 0.04, 2), m4t(X(0.45), hh.p[1] + 0.04, 0));
      mb.add('metal_escuro', roundedBox(0.5, 0.04, 0.04, 0.012, 1), m4t(X(0.45), hh.p[1] + 0.11, 0));
      lightBar(mb, { x: X(0.69), y: hh.p[1] + 0.01, len: 1.3, w: 0.3, h: 0.1 });
      text(ctx, { str: 'TÁTICO', axis: 'y', center: [X(0.2), 0], h: 0.3, dirU: [0, -1], dirV: [-1, 0], mat: 'decal', lift: 0.025, width: 0.05 });
    }
    for (const s of [1, -1]) text(ctx, { str: 'TÁTICO', axis: 'z', sign: s, center: [X(0.4), 1.75], h: 0.26, dirU: [s, 0], dirV: [0, 1], mat: 'decal', lift: 0.003 });
    pushBar(ctx, { y0: 0.45, y1: 1.0, zw: 0.62, mat: 'metal_escuro', gap: 0.13 });
    for (const s of [1, -1]) sideStep(mb, { x0: X(0.25), x1: X(0.65), y: 0.5, z: s * 1.03, w: 0.14, mat: 'metal_escuro' });
    doorLines(ctx, [[X(0.41), 0.55, X(0.41), 2.25], [X(0.6), 0.55, X(0.6), 2.25]], {});
    stampShape(mb, rc, { axis: 'x', sign: -1, poly: rrect(0, 1.6, 0.012, 1.8, 0.004, 1), mat: 'borracha', lift: 0.002, rings: 1, walls: false });
    whipAntenna(mb, { x: X(0.15), y: 2.5, z: 0.6, h: 0.9, tilt: -0.1 });
    whipAntenna(mb, { x: X(0.15), y: 2.5, z: -0.6, h: 0.9, tilt: -0.1 });
    commonDetails(ctx, {
      handles: [[0.72, 1.27]], handleMat: 'metal_escuro', plateF: 0.58, plateR: 0.78, mirrorMat: 'pintura', mirrorSize: 1.35, mirrorArm: 0.09, mirrorBack: 0.02,
      doors: [[0.8, 0.55, 0.8, 1.15], [0.665, 0.55, 0.665, 2.2]], wiperZ: [-0.5, 0.15], wiperLen: 0.65, exhaust: [[0.6, 0.45]],
    });
  },
});

// ---------------------------------------------------------------------------
export const militar = {
  slug: 'militar',
  L: 4.29, W: 1.97,
  colors: { pintura: '#4d5a30', teto: '#3f4a27', decal_branco: '#ecebe2' },
  extras: { pinturaFixa: true },
  matOverrides: { pintura: { metal: 0.05, rough: 0.7, clearcoat: 0 }, lona: { color: '#56613a' } },
  wheels: { front: 0.80, rear: 0.21, R: 0.41, w: 0.27, inset: -0.01, style: 'aco', rimMat: 'pintura', offroad: true, clear: 0.07 },
  body: {
    W: 1.8,
    top: [[0, 1.0], [0.006, 1.08], [0.02, 1.1], [0.62, 1.1], [0.66, 1.09], [0.95, 1.08], [0.99, 1.06], [0.998, 1.0], [1, 0.92]],
    bot: [[0, 0.62], [0.012, 0.54], [0.04, 0.48], [0.5, 0.45], [0.95, 0.48], [0.985, 0.54], [1, 0.62]],
    plan: { front: { rx: 0.08, p: 6 }, rear: { rx: 0.08, p: 6 } },
    rt: 0.04, rb: 0.03, crown: 0.015, tuck: 0.01, tumble: 0.015, ySill: 0.5, yWaist: 0.8, yBelt: 1.1,
  },
  cabin: {
    belt: [[0.02, 1.1], [0.66, 1.09]],
    roof: [[0.03, 1.86], [0.3, 1.9], [0.6, 1.9]],
    bot: { xf: 0.66, xr: 0.02, hw: 0.86, rf: 0.06, rr: 0.08 },
    top: { xf: 0.63, xr: 0.03, hw: 0.82, rf: 0.05, rr: 0.07 },
    pws: 1.0, prw: 1.0, roofR: 0.07, crown: 0.025, glassTop: 0.8, glassBot: 0.12,
    side: [{ zone: 'w', to: [0.56, 0.56], n: 2 }, { zone: 'b', to: [0.54, 0.54] }, { zone: 'p', n: 6 }],
    zones: { a: 'pintura', b: 'lona', c: 'lona', p: 'lona', rp: 'lona', w: 'vidro' }, frameMat: 'lona', roofMat: 'lona', frontWrap: 0.15, rearWrap: 0.0, rearWin: 0.4,
    frameZones: { ws: 'pintura', a: 'pintura' },
  },
  details(ctx) {
    const { mb, X } = ctx;
    const rc = ctx.rc();
    // arcos da capota (costuras em relevo)
    for (let k = 0; k <= 8; k++) {
      const u = 0.04 + (0.58 * k) / 8;
      stampQuad(mb, rc, { axis: 'y', sign: 1, corners: [[X(u) - 0.012, -0.9], [X(u) + 0.012, -0.9], [X(u) + 0.012, 0.9], [X(u) - 0.012, 0.9]], na: 1, nb: 30, mat: 'lona', lift: 0.012, minFacing: 0.1, filter: (m) => m === 'lona' });
    }
    stampQuad(mb, rc, { axis: 'y', sign: 1, corners: [[X(0.035), -0.01], [X(0.63), -0.01], [X(0.63), 0.01], [X(0.035), 0.01]], na: 30, nb: 1, mat: 'lona', lift: 0.008, filter: (m) => m === 'lona' });
    // estrela no capô
    const star = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * PI * 2 + PI / 2, r = k % 2 ? 0.075 : 0.19;
      star.push([X(0.83) + Math.sin(a) * r, Math.cos(a) * r * -1 * 0 + Math.cos(a) * r]);
    }
    stampShape(mb, rc, { axis: 'y', sign: 1, poly: star.map(([x, z]) => [x, z]), center: [X(0.83), 0], mat: 'decal_branco', lift: 0.003, rings: 4, walls: false });
    // grade e faróis
    lamps(ctx, {
      tail: [[0.7, 0.8], [0.82, 0.8], [0.82, 0.95], [0.7, 0.95]], tailBezel: 'preto',
      grille: [{ poly: [[-0.5, 0.66], [0.5, 0.66], [0.5, 1.02], [-0.5, 1.02]], mat: 'grade', rim: 'preto' }],
    });
    for (let k = -6; k <= 6; k++) stampShape(mb, rc, { axis: 'x', sign: 1, poly: rrect(k * 0.075, 0.84, 0.03, 0.32, 0.01, 1), mat: 'pintura', lift: 0.012, rings: 1 });
    for (const s of [1, -1]) {
      const h = rc.cast([20, 0.9, s * 0.72], [-1, 0, 0]);
      if (h) roundLamp(mb, { p: [h.p[0] - 0.01, h.p[1], h.p[2]], n: [1, 0, 0], r: 0.09, ring: 'preto' });
    }
    archFlares(ctx, { width: 0.14, thick: 0.12, mat: 'pintura', extra: 0.02 });
    // para-choques com ganchos
    for (const end of [1, -1]) {
      const x = end > 0 ? X(1) + 0.06 : X(0) - 0.06;
      mb.add('metal_escuro', roundedBox(0.14, 0.15, 1.9, 0.02, 1), m4t(x, 0.6, 0));
      for (const s of [1, -1]) mb.add('metal_escuro', tube([[x + end * 0.07, 0.62, s * 0.62 - 0.05], [x + end * 0.14, 0.6, s * 0.62], [x + end * 0.07, 0.58, s * 0.62 + 0.05]], 0.016, 6));
    }
    spareWheel(ctx, { x: X(0) - 0.07, y: 1.05, R: 0.39, w: 0.26, rimMat: 'pintura', style: 'aco' });
    // galão de combustível
    mb.add('pintura', roundedBox(0.16, 0.42, 0.3, 0.03, 2), m4t(X(0) - 0.16, 1.05, 0.66));
    for (const s of [1, -1]) sideStep(mb, { x0: ctx.wheel.xr + 0.55, x1: ctx.wheel.xf - 0.55, y: 0.52, z: s * 0.96, w: 0.12, mat: 'metal_escuro' });
    whipAntenna(mb, { x: X(0.03), y: 1.1, z: -0.86, h: 1.4, tilt: -0.05 });
    commonDetails(ctx, { handles: [[0.6, 1.05]], handleMat: 'metal_escuro', plateF: 0.78, plateR: 0.62, mirrorMat: 'pintura', mirrorSize: 0.9, mirrorBack: 0.03, wiperZ: [-0.45, 0.2], doors: [[0.66, 0.55, 0.66, 1.09], [0.54, 0.55, 0.54, 1.1]] });
  },
};
