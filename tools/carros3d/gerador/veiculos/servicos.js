// Serviços da cidade: o ÔNIBUS urbano (12 m, pintura da linha na tabela do jogo: pintura = corpo, pintura 2 = a faixa), a AMBULÂNCIA
// (furgão branco do resgate, com giroflex) e o CAVEIRÃO (o blindado da polícia, maior e mais fechado que o tático).
import { commonDetails, def } from './hatches.js';
import { van_furgao, roofRibs } from './vans.js';
import { swat_van } from './policia.js';
import { lamps, stampShape, stampQuad, rrect, doorLines, text } from '../details.js';
import { lightBar, sideStep, whipAntenna } from '../parts.js';
import { roundedBox, tube } from '../prims.js';
import { m4t } from '../math.js';

// ---------------------------------------------------------------------------
// Janelas do ônibus: da frente para trás, vidro e coluna alternados (a porta da frente e a do meio são vidro de cima a baixo).
const busSide = () => {
  const out = [{ zone: 'w', to: 0.905, n: 2 }, { zone: 'b', to: 0.895 }];
  for (let u = 0.895; u > 0.16; ) {
    const w = Math.max(0.16, u - 0.082);
    out.push({ zone: 'w', to: w, n: 2 });
    if (w <= 0.16) break;
    out.push({ zone: 'b', to: w - 0.008 });
    u = w - 0.008;
  }
  out.push({ zone: 'p', n: 3 });
  return out;
};

export const onibus = {
  slug: 'onibus',
  L: 12.0, W: 2.5,
  colors: { pintura: '#2f6fb3', teto: '#eef0f2', pintura2: '#f4c430', decal: '#f4f6f8' },
  matOverrides: { luminoso: { color: '#ffb22e', metal: 0, rough: 0.3, emissive: '#ffb84a', emissiveStrength: 0, lightKind: 'luminoso', lit: 1.8 } },
  wheels: { front: 0.80, rear: 0.30, R: 0.5, w: 0.3, inset: 0.08, style: 'aco', rimMat: 'aro_aco', clear: 0.08 },
  body: {
    top: [[0, 1.22], [0.003, 1.27], [0.01, 1.3], [0.99, 1.3], [0.997, 1.27], [1, 1.2]],
    bot: [[0, 0.58], [0.006, 0.46], [0.02, 0.38], [0.5, 0.36], [0.98, 0.38], [0.994, 0.46], [1, 0.58]],
    plan: { front: { rx: 0.1, p: 4 }, rear: { rx: 0.08, p: 4 } },
    rt: 0.06, rb: 0.05, crown: 0.015, tuck: 0.02, tumble: 0.0, ySill: 0.42, yWaist: 0.9, yBelt: 1.3,
    regions: [{ m: 'plastico', y: [0, 0.5], seg: ['sd', 'ba'] }],
  },
  cabin: {
    belt: [[0.004, 1.3], [0.996, 1.3]],
    roof: [[0.006, 3.0], [0.5, 3.06], [0.994, 3.0]],
    bot: { xf: 0.997, xr: 0.004, hw: 1.24, rf: 0.18, rr: 0.14 },
    top: { xf: 0.993, xr: 0.007, hw: 1.2, rf: 0.14, rr: 0.11 },
    pws: 1.0, prw: 1.0, roofR: 0.1, crown: 0.02, glassTop: 0.78, glassBot: 0.04, rows: 5,
    side: busSide(), zones: { b: 'preto', p: 'pintura' }, frontWrap: 0.75, rearWrap: 0.15, rearWin: 0.7, rearZ: [0.3],
    frameMat: 'preto', roofMat: 'teto',
  },
  details(ctx) {
    const { mb, X } = ctx;
    const rc = ctx.rc();
    lamps(ctx, {
      head: [[0.82, 0.62], [1.12, 0.62], [1.12, 0.8], [0.82, 0.8]],
      tail: [[0.95, 0.75], [1.12, 0.75], [1.12, 1.15], [0.95, 1.15]], tailBezel: 'preto',
      grille: [{ poly: [[-0.7, 0.5], [0.7, 0.5], [0.7, 0.72], [-0.7, 0.72]], mat: 'grade', rim: 'preto' }],
      rearPanel: [{ poly: [[-0.8, 0.55], [0.8, 0.55], [0.8, 1.05], [-0.8, 1.05]], mat: 'grade', rim: 'preto' }],
    });
    // faixa da linha (pintura 2) ao longo da lateral, abaixo das janelas
    for (const s of [1, -1]) stampQuad(mb, rc, { axis: 'z', sign: s, corners: [[X(0.01), 0.95], [X(0.99), 0.95], [X(0.99), 1.15], [X(0.01), 1.15]], na: 120, nb: 2, mat: 'pintura2', lift: 0.003, minFacing: 0.2 });
    // letreiro (destino) acima do para-brisa
    stampShape(mb, rc, { axis: 'x', sign: 1, poly: rrect(0, 2.8, 1.7, 0.26, 0.03, 2), mat: 'luminoso', lift: 0.012, rings: 2, rim: 'preto' });
    ctx.resetRc();
    for (const s of [1, -1]) text(ctx, { str: 'URBANO', axis: 'z', sign: s, center: [X(0.45), 1.05], h: 0.15, dirU: [s, 0], dirV: [0, 1], mat: 'decal', lift: 0.004 });
    // portas: a da frente (antes do eixo dianteiro) e a do meio
    doorLines(ctx, [[X(0.905), 0.45, X(0.905), 2.75], [X(0.98), 0.45, X(0.98), 2.75], [X(0.56), 0.45, X(0.56), 2.75], [X(0.64), 0.45, X(0.64), 2.75], [X(0.6), 0.45, X(0.6), 2.75]], {});
    // ar-condicionado no teto
    const hh = ctx.rc().cast([X(0.55), 6, 0.0001], [0, -1, 0]);
    if (hh) mb.add('plastico_cinza', roundedBox(2.4, 0.22, 1.7, 0.08, 2), m4t(X(0.55), hh.p[1] + 0.09, 0));
    roofRibs(ctx, { u0: 0.08, u1: 0.4, n: 6, zw: 1.0, mat: 'teto' });
    commonDetails(ctx, {
      handles: [], plateF: 0.4, plateR: 0.5, mirrorMat: 'preto', mirrorSize: 1.6, mirrorArm: 0.16, mirrorBack: -0.05, mirrorY: 2.2,
      wiperZ: [-0.6, 0.3], wiperLen: 0.9, exhaust: [[-0.9, 0.42]],
    });
  },
};

// ---------------------------------------------------------------------------
export const ambulancia = def(van_furgao, {
  slug: 'ambulancia',
  colors: { pintura: '#f6f6f3', teto: '#f6f6f3', decal: '#c8141e', decal2: '#c8141e' },
  extras: { pinturaFixa: true },
  details(ctx) {
    van_furgao.details(ctx);
    const { mb, X } = ctx;
    const rc = ctx.rc();
    // faixa vermelha lateral e a da traseira
    for (const s of [1, -1]) stampQuad(mb, rc, { axis: 'z', sign: s, corners: [[X(0.02), 0.9], [X(0.98), 0.9], [X(0.98), 1.02], [X(0.02), 1.02]], na: 70, nb: 2, mat: 'decal2', lift: 0.003, minFacing: 0.2 });
    ctx.resetRc();
    for (const s of [1, -1]) text(ctx, { str: 'RESGATE 192', axis: 'z', sign: s, center: [X(0.36), 1.6], h: 0.24, dirU: [s, 0], dirV: [0, 1], mat: 'decal', lift: 0.004 });
    // a cruz no teto (vista de cima) e o letreiro
    const hh = ctx.rc().cast([X(0.4), 6, 0.0001], [0, -1, 0]);
    if (hh) {
      const y = hh.p[1];
      mb.add('decal', roundedBox(1.1, 0.012, 0.34, 0.01, 1), m4t(X(0.4), y + 0.01, 0));
      mb.add('decal', roundedBox(0.34, 0.012, 1.1, 0.01, 1), m4t(X(0.4), y + 0.01, 0));
    }
    const hf = ctx.rc().cast([X(0.68), 6, 0.0001], [0, -1, 0]);
    if (hf) lightBar(mb, { x: X(0.68), y: hf.p[1] - 0.005, len: 1.5, w: 0.3, h: 0.1 });
    // giroflex traseiro (dois cantos)
    for (const s of [1, -1]) mb.add(s > 0 ? 'giroflex_vermelho' : 'giroflex_azul', roundedBox(0.14, 0.12, 0.14, 0.03, 2), m4t(X(0.015), 2.5, s * 0.85));
    text(ctx, { str: 'AMBULANCIA', axis: 'x', sign: 1, center: [0, 0.98], h: 0.11, dirU: [0, -1], dirV: [0, 1], mat: 'decal', lift: 0.004 });
  },
});

// ---------------------------------------------------------------------------
// Caveirão: o blindado da polícia — mais comprido e alto que o tático, chapas grossas, janelas que são só frestas, rodas grandes.
export const caveirao = def(swat_van, {
  slug: 'caveirao',
  L: 6.4, W: 2.45,
  colors: { pintura: '#2e3236', teto: '#2e3236', decal: '#dcdcd2' },
  extras: { pinturaFixa: true },
  matOverrides: { pintura: { metal: 0.35, rough: 0.6, clearcoat: 0.05 } },
  wheels: { front: 0.79, rear: 0.21, R: 0.5, w: 0.34, inset: 0.0, style: 'aco', rimMat: 'aro_preto', offroad: true, clear: 0.08 },
  body: {
    top: [[0, 1.3], [0.004, 1.36], [0.015, 1.38], [0.76, 1.38], [0.79, 1.35], [0.88, 1.28], [0.95, 1.22], [0.985, 1.15], [0.997, 1.08], [1, 0.98]],
    bot: [[0, 0.72], [0.01, 0.6], [0.03, 0.52], [0.5, 0.5], [0.95, 0.52], [0.985, 0.6], [1, 0.7]],
    ySill: 0.55, yWaist: 0.95, yBelt: 1.38,
  },
  cabin: {
    belt: [[0.006, 1.38], [0.78, 1.36]],
    roof: [[0.01, 2.75], [0.5, 2.8], [0.72, 2.76]],
    bot: { xf: 0.78, xr: 0.006, hw: 1.2, rf: 0.14, rr: 0.05 },
    top: { xf: 0.74, xr: 0.008, hw: 1.14, rf: 0.1, rr: 0.05 },
    glassTop: 0.62, glassBot: 0.5,
    side: [{ zone: 'w', to: [0.66, 0.665], n: 2 }, { zone: 'b', to: [0.645, 0.65] }, { zone: 'w', to: 0.5, n: 2 }, { zone: 'b', to: 0.49 }, { zone: 'w', to: 0.3, n: 2 }, { zone: 'p', n: 6 }],
  },
  details(ctx) {
    const { mb, X } = ctx;
    const rc = ctx.rc();
    lamps(ctx, {
      head: [[0.7, 1.0], [1.0, 0.98], [1.04, 1.06], [1.0, 1.12], [0.72, 1.12]],
      tail: [[0.95, 0.85], [1.1, 0.85], [1.1, 1.2], [0.95, 1.2]], tailBezel: 'preto',
      grille: [{ poly: [[-0.62, 0.72], [0.62, 0.72], [0.66, 1.05], [-0.66, 1.05]], mat: 'grade', rim: 'preto' }],
    });
    // chapas de blindagem (rebites em fileira) nas laterais
    for (const s of [1, -1]) for (let k = 0; k < 14; k++) stampShape(mb, rc, { axis: 'z', sign: s, poly: rrect(X(0.06 + k * 0.065), 0.7, 0.03, 0.03, 0.012, 1), mat: 'metal_escuro', lift: 0.006, rings: 1 });
    roofRibs(ctx, { u0: 0.03, u1: 0.7, n: 12, zw: 1.0, mat: 'pintura' });
    const hh = rc.cast([X(0.42), 6, 0.0001], [0, -1, 0]);
    if (hh) {
      // torre com escotilha e o giroflex
      mb.add('pintura', roundedBox(1.0, 0.32, 1.0, 0.06, 2), m4t(X(0.42), hh.p[1] + 0.14, 0));
      mb.add('metal_escuro', roundedBox(0.72, 0.06, 0.72, 0.03, 2), m4t(X(0.42), hh.p[1] + 0.33, 0));
      lightBar(mb, { x: X(0.7), y: hh.p[1] - 0.04, len: 1.3, w: 0.28, h: 0.1 });
      ctx.resetRc();
      text(ctx, { str: 'BLINDADO', axis: 'y', center: [X(0.18), 0], h: 0.34, dirU: [0, -1], dirV: [-1, 0], mat: 'decal', lift: 0.03, width: 0.055 });
    }
    for (const s of [1, -1]) text(ctx, { str: 'BLINDADO', axis: 'z', sign: s, center: [X(0.36), 1.9], h: 0.28, dirU: [s, 0], dirV: [0, 1], mat: 'decal', lift: 0.004 });
    // para-choque de aço (aríete) e estribos
    for (const end of [1]) {
      const x = X(1) + 0.08;
      mb.add('metal_escuro', roundedBox(0.16, 0.36, 2.3, 0.03, 1), m4t(x, 0.72, 0));
      for (let k = -3; k <= 3; k++) mb.add('metal_escuro', tube([[x, 0.56, k * 0.3], [x + 0.18, 0.72, k * 0.3], [x, 0.9, k * 0.3]], 0.03, 6));
      void end;
    }
    for (const s of [1, -1]) sideStep(mb, { x0: X(0.25), x1: X(0.68), y: 0.6, z: s * 1.24, w: 0.16, mat: 'metal_escuro' });
    doorLines(ctx, [[X(0.41), 0.65, X(0.41), 2.5], [X(0.6), 0.65, X(0.6), 2.5]], {});
    stampShape(mb, rc, { axis: 'x', sign: -1, poly: rrect(0, 1.8, 0.012, 1.9, 0.004, 1), mat: 'borracha', lift: 0.002, rings: 1, walls: false });
    whipAntenna(mb, { x: X(0.12), y: 2.75, z: 0.8, h: 1.1, tilt: -0.1 });
    whipAntenna(mb, { x: X(0.12), y: 2.75, z: -0.8, h: 1.1, tilt: -0.1 });
    commonDetails(ctx, {
      handles: [[0.7, 1.45]], handleMat: 'metal_escuro', plateF: 0.6, plateR: 0.8, mirrorMat: 'pintura', mirrorSize: 1.5, mirrorArm: 0.1, mirrorBack: 0.02,
      wiperZ: [-0.6, 0.2], wiperLen: 0.7, exhaust: [[0.7, 0.55]],
    });
  },
});
