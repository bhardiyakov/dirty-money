// Táxis (pintura própria, como no atlas 2D): sedã compacto com o luminoso no teto — São Paulo (branco, luminoso amarelo) e Rio
// (amarelo com faixa azul na lateral, luminoso azul). O luminoso acende à noite junto com os faróis (tipoLuz 'luminoso').
import { def } from './hatches.js';
import { sedan_popular } from './sedans.js';
import { stampQuad, text } from '../details.js';
import { roundedBox } from '../prims.js';
import { m4t } from '../math.js';

// luminoso "TÁXI" no meio do teto: base de plástico + caixa da cor da placa, texto em cima (lido de cima, frente para cima)
function taxiSign(ctx, { u = 0.43 } = {}) {
  const { mb, X } = ctx;
  const h = ctx.rc().cast([X(u), 5, 0.0001], [0, -1, 0]);
  if (!h) return;
  const y = h.p[1] - 0.004, x = X(u);
  mb.add('plastico', roundedBox(0.26, 0.035, 0.6, 0.012, 1), m4t(x, y + 0.017, 0));
  mb.add('luminoso', roundedBox(0.2, 0.13, 0.54, 0.035, 2), m4t(x, y + 0.095, 0));
  ctx.resetRc();
  text(ctx, { str: 'TAXI', axis: 'y', center: [x, 0], h: 0.1, dirU: [0, 1], dirV: [1, 0], mat: 'decal', lift: 0.002, width: 0.018 });
  for (const s of [1, -1]) text(ctx, { str: 'TAXI', axis: 'z', sign: s, center: [x, y + 0.095], h: 0.07, dirU: [s, 0], dirV: [0, 1], mat: 'decal', lift: 0.002, width: 0.012 });
}

export const taxi_sp = def(sedan_popular, {
  slug: 'taxi_sp',
  L: 4.4, W: 1.74,
  colors: { pintura: '#eef0f2', teto: '#eef0f2', decal: '#1d1d1d' },
  extras: { pinturaFixa: true },
  matOverrides: { luminoso: { color: '#ffd23a', metal: 0, rough: 0.3, emissive: '#ffd84a', emissiveStrength: 0, lightKind: 'luminoso', lit: 1.6 } },
  wheels: { style: 'aco', rimMat: 'aro_aco' },
  details(ctx) {
    sedan_popular.details(ctx);
    taxiSign(ctx);
  },
});

export const taxi_rio = def(sedan_popular, {
  slug: 'taxi_rio',
  L: 4.4, W: 1.74,
  colors: { pintura: '#f6c526', teto: '#f6c526', decal: '#1f3f9a', decal2: '#1f3f9a' },
  extras: { pinturaFixa: true },
  matOverrides: { luminoso: { color: '#f4f6fb', metal: 0, rough: 0.3, emissive: '#ffffff', emissiveStrength: 0, lightKind: 'luminoso', lit: 1.6 } },
  wheels: { style: 'aco', rimMat: 'aro_aco' },
  details(ctx) {
    sedan_popular.details(ctx);
    const { mb, X } = ctx;
    for (const s of [1, -1]) stampQuad(mb, ctx.rc(), { axis: 'z', sign: s, corners: [[X(0.03), 0.6], [X(0.97), 0.6], [X(0.97), 0.68], [X(0.03), 0.68]], na: 60, nb: 2, mat: 'decal2', lift: 0.0025, minFacing: 0.2 });
    ctx.resetRc();
    taxiSign(ctx);
  },
});
