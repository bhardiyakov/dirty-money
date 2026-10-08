// Montagem de um veículo de rodas a partir de uma especificação
import { MeshBuilder } from './mesh.js';
import { makeBody, emitBody } from './body.js';
import { makeCabin, emitCabin } from './cabin.js';
import { wheel } from './parts.js';
import { Raycaster } from './raycast.js';
import { materialSet } from './materials.js';
import { m4t, m4ry, m4mul } from './math.js';

const PI = Math.PI;

// Converte especificação "amigável" (u = 0 traseira .. 1 frente) em contexto de construção
export function buildVehicle(spec, opts = {}) {
  const det = opts.detalhe ?? 1;
  const mb = new MeshBuilder();
  const L = spec.L, W = spec.W;
  const X = (u) => -L / 2 + u * L;
  const ctx = { spec, mb, L, W, X, det, opts, parts: [] };

  // rodas
  const wh = spec.wheels;
  if (wh) {
    const xf = X(wh.front), xr = X(wh.rear);
    const R = wh.R, tw = wh.w ?? 0.2;
    const zc = wh.z ?? W / 2 - (wh.inset ?? 0.03) - tw / 2;
    const ar = R + (wh.clear ?? 0.055);
    ctx.wheel = { xf, xr, R, tw, zc, ar };
    ctx.arches = [
      { x: xf, r: ar, y: R + (wh.archLift ?? 0) },
      { x: xr, r: ar, y: R + (wh.archLift ?? 0) },
      ...(wh.extraAxles || []).map((u) => ({ x: X(u), r: ar, y: R })),
    ];
  }

  // carroceria
  if (spec.body) {
    const bs = { L, W, ...spec.body, detail: det };
    if (ctx.arches && !bs.noArches) bs.arches = (bs.arches || []).concat(ctx.arches);
    const B = makeBody(bs);
    ctx.body = B;
    emitBody(mb, B, { mat: spec.body.mat || 'pintura', under: spec.body.under || 'chassi', capStart: spec.body.capStart, capEnd: spec.body.capEnd });
  }
  if (spec.cabin && ctx.body) {
    const C = makeCabin(typeof spec.cabin === 'function' ? spec.cabin(ctx) : spec.cabin, ctx.body);
    ctx.cabin = C;
    emitCabin(mb, C);
  }
  // raycaster preguiçoso sobre a malha atual
  let rc = null;
  ctx.rc = () => (rc ||= Raycaster.fromBuilder(mb));
  ctx.resetRc = () => { rc = null; };
  if (spec.details) spec.details(ctx);

  // nós
  const children = [{ name: 'carroceria', mesh: mb.build() }];
  if (wh && !wh.hidden) {
    // detalhe < 0,5 (jogo, visto de cima): pneu sem os sulcos modelados (o jogo desenha a banda de rodagem no shader) e menos gomos
    const lite = det < 0.5;
    const right = wheel({ R: wh.R, w: wh.w ?? 0.2, style: wh.style ?? 'liga5', rimMat: wh.rimMat, capMat: wh.capMat, whitewall: wh.whitewall, offroad: wh.offroad, caliper: wh.caliper, rimR: wh.rimR, dish: wh.dish, grooves: lite ? 0 : undefined, seg: Math.max(lite ? 12 : 14, Math.round((wh.seg ?? 26) * det)) });
    const wheelPrims = right.build();
    const { xf, xr, zc } = ctx.wheel;
    const axles = [['d', xf], ['t', xr], ...(wh.extraAxles || []).map((u, i) => ['t' + (i + 2), X(u)])];
    for (const [ax, x] of axles)
      for (const [sd, z] of [['e', -zc], ['d', zc]]) {
        const nm = `roda_${ax}${sd}`;
        children.push({
          name: nm,
          matrix: m4t(x, ctx.wheel.R, z),
          extras: { tipo: 'roda', eixo: ax === 'd' ? 'dianteiro' : 'traseiro', lado: sd === 'e' ? 'esquerdo' : 'direito', raio: ctx.wheel.R },
          children: [{ name: nm + '_giro', children: [{ name: nm + '_malha', matrix: sd === 'e' ? m4ry(PI) : null, mesh: wheelPrims }] }],
        });
      }
  }
  for (const p of ctx.parts) children.push(p);
  const materials = materialSet(spec.colors || {}, spec.matOverrides || {});
  const root = { name: spec.slug || 'veiculo', children, extras: spec.extras || {} };
  return { root, materials, ctx };
}
