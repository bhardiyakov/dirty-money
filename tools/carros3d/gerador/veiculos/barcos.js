// Barcos: casco em V por loft (quilha, fundo, quina, costado, borda, convés),
// cockpits rebaixados, assentos, para-brisa, motor de popa, luzes de navegação etc.
// Linha d'água em y = 0.
import { pchip, clamp, lerp, m4t, m4chain, m4rx, m4ry, m4rz } from '../math.js';
import { stampShape, stampQuad, rrect, stampStrokes } from '../stamp.js';
import { roundedBox, cylinder, tube, ellipsoid, sweep, rrect2, lathe, circle2 } from '../prims.js';
import { box, roundLamp } from '../parts.js';

const PI = Math.PI;

// gera a especificação de corpo (loft) de um casco
export function hullBody(o) {
  const beam = pchip(o.beam), keel = pchip(o.keel), cyF = pchip(o.chineY), ckF = pchip(o.chineK), sheer = pchip(o.sheer);
  const camber = o.camber ?? 0.03, rg0 = o.rg ?? 0.04, conv = o.convex ?? 0.02;
  const regions = o.regions || [];
  const sideH = new Set(o.sideH || [0, 0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 1.0, 1.2, 1.5]);
  for (const r of regions) if (r.y) { sideH.add(r.y[0]); sideH.add(r.y[1]); }
  const SH = [...sideH].sort((a, b) => a - b);
  const DF = o.deckF || [0.2, 0.4, 0.55, 0.68, 0.78, 0.86, 0.93];
  const W = o.W;
  const hw = (u) => Math.max(0, beam(u)) * W / 2;
  const sectionFn = (x, h) => {
    const u = h.u;
    const zs = hw(u), ys = sheer(u);
    const zc = zs * clamp(ckF(u), 0, 1);
    const yc = Math.min(cyF(u), ys - 0.03);
    const yk = Math.min(keel(u), yc - 0.003);
    const rg = Math.max(0.0005, Math.min(rg0, zs * 0.45, (ys - yc) * 0.4));
    const pts = [], seg = [];
    pts.push([0, yk]); seg.push('keel');
    for (const t of [0.25, 0.5, 0.75]) { pts.push([zc * t, lerp(yk, yc, t) - conv * Math.sin(PI * t) * Math.min(1, zs * 3)]); seg.push('bot'); }
    pts.push([zc, yc]); seg.push('bot');
    const yTop = ys - rg;
    for (const hh of SH) {
      const y = clamp(hh, yc, yTop);
      const t = (y - yc) / Math.max(1e-6, yTop - yc);
      pts.push([lerp(zc, zs, Math.pow(t, o.flare ?? 0.8)), y]); seg.push('side');
    }
    pts.push([zs, yTop]); seg.push('side');
    for (const a of [30, 60, 90]) {
      const r = (a * PI) / 180;
      pts.push([zs - rg + rg * Math.cos(r), yTop + rg * Math.sin(r)]); seg.push('gun');
    }
    const zd = Math.max(0, zs - rg);
    for (let k = DF.length - 1; k >= 0; k--) { const z = zd * DF[k]; const t = zd > 1e-6 ? z / zd : 0; pts.push([z, ys + camber * (1 - t * t)]); seg.push('deck'); }
    pts.push([0, ys + camber]); seg.push('deck');
    return { pts, seg };
  };
  return {
    sectionFn, regions,
    top: [[0, 1], [1, 1]], bot: [[0, 0], [1, 0]],
    plan: { front: { rx: o.L * 0.3, p: 2 }, rear: { rx: 0.04, p: 2 } },
    stations: o.stations ?? 60,
    xBreaks: o.xBreaks || [],
    capStart: o.capStart || ((p) => (p[1] < (o.bootY ?? 0.05) ? (o.bottomMat ?? 'casco') : (o.transomMat ?? 'casco'))),
    noArches: true,
    _hw: hw, _sheer: sheer, _camber: camber,
  };
}

// fração de largura do convés para regiões que acompanham o casco
const deckFrac = (H, W) => (c) => c.az / Math.max(1e-6, H._hw(c.u) - 0.04);

// luz de navegação
function navLight(mb, p, mat, r = 0.04) {
  mb.add('preto', cylinder(r * 1.1, 0.03, 12, { bevel: 0.006 }), m4t(p[0], p[1], p[2]));
  mb.add(mat, ellipsoid(r, r * 0.8, r, 12, 6, { th0: 0 }), m4t(p[0], p[1] + 0.015, p[2]));
}
function cleat(mb, x, y, z) {
  mb.add('cromado', roundedBox(0.16, 0.035, 0.035, 0.014, 1), m4t(x, y + 0.04, z));
  for (const s of [-1, 1]) mb.add('cromado', cylinder(0.012, 0.04, 8), m4t(x + s * 0.04, y + 0.02, z));
}

// ---------------------------------------------------------------------------
function deckY(ctx, x, z) {
  const h = ctx.rc().cast([x, 6, z], [0, -1, 0], { filter: (m) => m !== 'vidro_escuro' });
  return h ? h.p[1] : 0.4;
}

export const jetski = (() => {
  const L = 3.0, W = 1.11;
  const H = hullBody({
    L, W,
    beam: [[0, 0.82], [0.15, 0.95], [0.42, 1.0], [0.65, 0.92], [0.82, 0.7], [0.93, 0.4], [0.985, 0.12], [1, 0]],
    keel: [[0, -0.2], [0.5, -0.22], [0.8, -0.15], [0.95, 0.02], [1, 0.2]],
    chineY: [[0, -0.06], [0.6, -0.06], [0.85, 0.0], [1, 0.2]],
    chineK: [[0, 0.84], [0.7, 0.8], [0.95, 0.62], [1, 0.5]],
    sheer: [[0, 0.19], [0.4, 0.21], [0.8, 0.26], [1, 0.3]],
    camber: 0.035, rg: 0.035, sideH: [0, 0.05, 0.09, 0.12, 0.16, 0.2], flare: 0.9,
    regions: [],
    bottomMat: 'casco', transomMat: 'casco',
  });
  H.regions.push(
    { m: 'casco', seg: ['keel', 'bot'] },
    { m: 'casco', seg: 'side', y: [-1, 0.05] },
    { m: 'faixa', seg: 'side', y: [0.1, 0.13] },
    { m: 'pintura', seg: ['side', 'gun'] },
    // plataforma traseira
    { m: 'deck', seg: 'deck', f: (c) => c.u < 0.1 },
    // poços para os pés
    { m: 'plastico', seg: 'deck', x: [-1.1, 0.25], f: (c) => { const f = deckFrac(H, W)(c); return f > 0.42 && f < 0.86; }, d: 0.11, w: 'pintura' },
    { m: 'faixa', seg: 'deck', f: (c) => { const f = deckFrac(H, W)(c); return f > 0.88 && f < 0.95 && c.u < 0.82; } },
    { m: 'pintura', seg: 'deck' },
  );
  return {
    slug: 'jetski', L, W, tipo: 'barco',
    colors: { pintura: '#d6262c', faixa: '#2a5fd6', pintura2: '#2563d9', deck: '#e9eaec' },
    matOverrides: { faixa: { metal: 0.2, rough: 0.35 } },
    body: { ...H, W, L },
    details(ctx) {
      const { mb, X } = ctx;
      const yd = deckY(ctx, X(0.4), 0.0001);
      ctx.spec.seat = [X(0.43), yd + 0.21, 0];                // (onde o jogo senta o piloto 2,5D)
      // banco
      mb.add('plastico', roundedBox(1.25, 0.12, 0.42, 0.05, 2), m4t(X(0.385), yd + 0.05, 0));
      mb.add('estofado_preto', roundedBox(1.18, 0.12, 0.36, 0.06, 3), m4t(X(0.385), yd + 0.15, 0));
      mb.add('estofado_preto', roundedBox(0.36, 0.06, 0.32, 0.03, 2), m4t(X(0.25), yd + 0.22, 0));
      mb.add('plastico_cinza', roundedBox(1.0, 0.012, 0.012, 0.005, 1), m4t(X(0.4), yd + 0.212, 0));
      // capô (cúpula)
      const g = ellipsoid(0.46, 0.17, 0.34, 22, 8, { th0: 0 });
      mb.add('pintura2', g, m4t(X(0.8), deckY(ctx, X(0.8), 0.0001) - 0.02, 0));
      // guidão
      const xh = X(0.6), yh = yd + 0.36;
      mb.add('preto', roundedBox(0.12, 0.3, 0.12, 0.03, 1), m4chain(m4t(xh + 0.03, yd + 0.2, 0), m4rz(0.35)));
      mb.add('cromado', tube([[xh, yh, -0.36], [xh + 0.04, yh + 0.02, 0], [xh, yh, 0.36]], 0.016, 8));
      for (const s of [1, -1]) mb.add('estofado_preto', cylinder(0.022, 0.13, 10, { bevel: 0.006 }), m4chain(m4t(xh, yh, s * 0.42), m4rx(PI / 2)));
      mb.add('preto', roundedBox(0.08, 0.06, 0.16, 0.02, 1), m4t(xh + 0.06, yh + 0.03, 0));
      // plataforma traseira com nervuras
      const yr = deckY(ctx, X(0.06), 0.0001);
      for (let k = -3; k <= 3; k++) mb.add('plastico_cinza', roundedBox(0.3, 0.012, 0.02, 0.006, 1), m4t(X(0.07), yr + 0.004, k * 0.09));
      // luz de proa
      navLight(mb, [X(0.985), deckY(ctx, X(0.985), 0.0001) - 0.01, 0], 'luz_branca', 0.025);
      // espelhos e alças
      for (const s of [1, -1]) mb.add('preto', roundedBox(0.06, 0.04, 0.1, 0.015, 1), m4t(xh + 0.12, yh + 0.08, s * 0.3));
    },
  };
})();

// ---------------------------------------------------------------------------
export const lancha = (() => {
  const L = 6.4, W = 2.3;
  const H = hullBody({
    L, W,
    beam: [[0, 0.9], [0.15, 0.96], [0.45, 1.0], [0.65, 0.95], [0.8, 0.78], [0.9, 0.55], [0.96, 0.3], [1, 0]],
    keel: [[0, -0.36], [0.5, -0.4], [0.8, -0.3], [0.93, -0.05], [1, 0.45]],
    chineY: [[0, -0.12], [0.6, -0.12], [0.85, 0.0], [1, 0.45]],
    chineK: [[0, 0.82], [0.6, 0.8], [0.9, 0.66], [1, 0.55]],
    sheer: [[0, 0.62], [0.5, 0.68], [0.85, 0.78], [1, 0.84]],
    camber: 0.04, rg: 0.05, sideH: [0, 0.08, 0.2, 0.32, 0.44, 0.52, 0.6, 0.7], flare: 0.85,
    regions: [],
  });
  const fr = deckFrac(H, W);
  const X = (u) => -L / 2 + u * L;
  H.regions.push(
    { m: 'casco', seg: ['keel', 'bot'] },
    { m: 'casco2', seg: 'side', y: [0.52, 0.6] },
    { m: 'casco2', seg: 'gun' },
    { m: 'casco', seg: 'side' },
    { m: 'casco2', seg: 'deck', f: (c) => fr(c) > 0.93 && c.u < 0.8 },
    // cockpit principal
    { m: 'antiderrapante', seg: 'deck', x: [X(0.03), X(0.615)], f: (c) => fr(c) < 0.82, d: 0.5, w: 'deck' },
    // cockpit de proa
    { m: 'antiderrapante', seg: 'deck', x: [X(0.655), X(0.86)], f: (c) => fr(c) < 0.74, d: 0.38, w: 'deck' },
    { m: 'deck', seg: 'deck' },
  );
  H.xBreaks = [X(0.03), X(0.615), X(0.655), X(0.86)];
  return {
    slug: 'lancha', L, W, tipo: 'barco', paintKey: 'casco2',
    colors: { casco2: '#1d356e', deck: '#efe6d0', motor: '#1d2b4a' },
    body: { ...H, W, L },
    details(ctx) {
      const { mb } = ctx;
      const yf = deckY(ctx, X(0.35), 0.0001); // piso do cockpit
      const yg = deckY(ctx, X(0.35), 1.0); // altura da borda
      ctx.spec.seat = [X(0.47), yf + 0.49, 0.6];              // (o banco do piloto, atrás do timão: onde o jogo senta o piloto 2,5D)
      // para-brisa curvo
      const path = [];
      for (let k = 0; k <= 16; k++) {
        const t = -1 + k / 8;
        const z = t * 0.98;
        path.push([X(0.62) + 0.22 * (1 - t * t), yg + 0.02, z]);
      }
      const prof = [[0.0, 0.0], [0.012, 0.0], [-0.12, 0.34], [-0.132, 0.34]];
      mb.add('vidro_escuro', sweep(path, prof.map(([a, b]) => [b, -a]), { up: [0, 1, 0] }));
      mb.add('preto', tube(path.map((p) => [p[0] - 0.12, p[1] + 0.34, p[2]]), 0.014, 6));
      // consoles
      for (const s of [1, -1]) {
        mb.add('deck', roundedBox(0.55, 0.62, 0.6, 0.06, 2), m4t(X(0.55), yf + 0.31, s * 0.6));
        mb.add('preto', roundedBox(0.2, 0.02, 0.4, 0.008, 1), m4chain(m4t(X(0.565), yf + 0.63, s * 0.6), m4rz(0.5)));
      }
      // volante
      const wc = [X(0.53), yf + 0.75, 0.6];
      const wheelPath = circle2(0.17, 20).map(([a, b]) => [wc[0] + a * 0.3, wc[1] + a * 0.95, wc[2] + b]);
      mb.add('preto', tube([...wheelPath, wheelPath[0]], 0.016, 6), m4chain(m4t(0, 0, 0)));
      mb.add('preto', roundedBox(0.16, 0.05, 0.05, 0.015, 1), m4t(X(0.54), yf + 0.7, 0.6));
      // bancos do piloto e passageiro
      for (const s of [1, -1]) {
        mb.add('estofado', roundedBox(0.5, 0.14, 0.5, 0.06, 2), m4t(X(0.45), yf + 0.42, s * 0.6));
        mb.add('estofado', roundedBox(0.12, 0.48, 0.48, 0.05, 2), m4t(X(0.4), yf + 0.62, s * 0.6));
        mb.add('metal', cylinder(0.04, 0.36, 10), m4t(X(0.45), yf + 0.18, s * 0.6));
      }
      // banco traseiro
      mb.add('estofado', roundedBox(0.5, 0.42, 1.9, 0.07, 2), m4t(X(0.1), yf + 0.21, 0));
      mb.add('estofado2', roundedBox(0.16, 0.36, 1.85, 0.06, 2), m4t(X(0.06), yf + 0.58, 0));
      // estofados da proa
      for (const s of [1, -1]) mb.add('estofado', roundedBox(0.95, 0.24, 0.32, 0.06, 2), m4chain(m4t(X(0.755), yf + 0.42, s * 0.48), m4ry(s * 0.12)));
      // motor de popa
      const xm = X(0) - 0.32, ym = yg + 0.15;
      mb.add('metal_escuro', roundedBox(0.22, 0.3, 0.3, 0.04, 2), m4t(X(0) - 0.08, yg - 0.05, 0));
      mb.add('motor', roundedBox(0.62, 0.72, 0.46, 0.14, 3), m4t(xm, ym + 0.25, 0));
      mb.add('motor', roundedBox(0.3, 0.62, 0.16, 0.06, 2), m4t(xm + 0.04, ym - 0.42, 0));
      mb.add('metal_escuro', roundedBox(0.36, 0.06, 0.06, 0.02, 1), m4t(xm, ym - 0.75, 0));
      for (let k = 0; k < 3; k++) mb.add('metal_escuro', roundedBox(0.04, 0.24, 0.1, 0.02, 1), m4chain(m4t(xm - 0.14, ym - 0.78, 0), m4rx((k * 2 * PI) / 3)));
      // luzes de navegação (bombordo vermelho / boreste verde)
      const yb = deckY(ctx, X(0.93), 0.2);
      navLight(mb, [X(0.93), yb, -0.22], 'luz_vermelha');
      navLight(mb, [X(0.93), yb, 0.22], 'luz_verde');
      mb.add('cromado', tube([[X(0.02), yg, 0.9], [X(0.02), yg + 0.9, 0.9]], 0.012, 6));
      navLight(mb, [X(0.02), yg + 0.9, 0.9], 'luz_branca', 0.03);
      // cunhos
      for (const [u, s] of [[0.04, 1], [0.04, -1], [0.62, 1], [0.62, -1]]) cleat(mb, X(u), deckY(ctx, X(u), s * 1.02), s * 1.02);
      cleat(mb, X(0.95), deckY(ctx, X(0.95), 0.0001), 0);
      // faixa de borda (verga)
      for (const s of [1, -1]) {
        const pts = [];
        for (let k = 0; k <= 30; k++) {
          const u = 0.01 + (0.97 * k) / 30;
          pts.push([X(u), H._sheer(u) - 0.035, s * (H._hw(u) + 0.012)]);
        }
        mb.add('cromado', tube(pts, 0.018, 6));
      }
    },
  };
})();

// ---------------------------------------------------------------------------
export const barco = (() => {
  const L = 9.0, W = 3.2;
  const H = hullBody({
    L, W,
    beam: [[0, 0.88], [0.15, 0.96], [0.45, 1.0], [0.65, 0.96], [0.8, 0.8], [0.9, 0.58], [0.96, 0.32], [1, 0]],
    keel: [[0, -0.5], [0.5, -0.56], [0.82, -0.42], [0.94, -0.05], [1, 0.75]],
    chineY: [[0, -0.18], [0.6, -0.18], [0.86, 0.0], [1, 0.75]],
    chineK: [[0, 0.84], [0.6, 0.82], [0.9, 0.66], [1, 0.55]],
    sheer: [[0, 0.95], [0.5, 1.0], [0.85, 1.15], [1, 1.25]],
    camber: 0.05, rg: 0.06, sideH: [0, 0.15, 0.3, 0.5, 0.7, 0.8, 0.88, 0.96, 1.1], flare: 0.85,
    regions: [],
  });
  const fr = deckFrac(H, W);
  const X = (u) => -L / 2 + u * L;
  H.regions.push(
    { m: 'casco', seg: ['keel', 'bot'] },
    { m: 'casco2', seg: 'side', y: [0.8, 0.96] },
    { m: 'casco2', seg: 'gun' },
    { m: 'casco', seg: 'side' },
    { m: 'casco2', seg: 'deck', f: (c) => fr(c) > 0.95 && c.u < 0.85 },
    { m: 'madeira', seg: 'deck', x: [X(0.02), X(0.93)], f: (c) => fr(c) < 0.9, d: 0.3, w: 'casco' },
    { m: 'madeira', seg: 'deck' },
  );
  H.xBreaks = [X(0.02), X(0.93)];
  return {
    slug: 'barco', L, W, tipo: 'barco', paintKey: 'casco2',
    colors: { casco2: '#2e6cc9', madeira: '#cdb185' },
    body: { ...H, W, L },
    details(ctx) {
      const { mb } = ctx;
      const rc = ctx.rc();
      const yd = deckY(ctx, X(0.4), 0.0001);
      // tábuas do convés
      for (let k = -11; k <= 11; k++) {
        const z = k * 0.12;
        stampQuad(mb, rc, { axis: 'y', sign: 1, corners: [[X(0.03), z - 0.004], [X(0.92), z - 0.004], [X(0.92), z + 0.004], [X(0.03), z + 0.004]], na: 40, nb: 1, mat: 'madeira_junta', lift: 0.0015, walls: false, filter: (m) => m === 'madeira' });
      }
      // casaria (cabine)
      const x0 = X(0.52), x1 = X(0.78), cw = 1.85, ch = 1.45;
      const xc = (x0 + x1) / 2;
      mb.add('casco2', roundedBox(x1 - x0, ch, cw, 0.08, 2), m4t(xc, yd + ch / 2, 0));
      mb.add('casco', roundedBox(x1 - x0 + 0.2, 0.1, cw + 0.18, 0.04, 2), m4t(xc, yd + ch + 0.05, 0));
      mb.add('casco', roundedBox(x1 - x0 - 0.1, 0.03, cw - 0.12, 0.01, 1), m4t(xc, yd + ch + 0.11, 0));
      // janelas
      mb.add('vidro_escuro', roundedBox(0.04, 0.55, cw - 0.3, 0.02, 1), m4chain(m4t(x1 + 0.005, yd + ch - 0.42, 0), m4rz(0.25)));
      for (const s of [1, -1]) {
        mb.add('vidro_escuro', roundedBox((x1 - x0) * 0.7, 0.45, 0.03, 0.02, 1), m4t(xc + 0.1, yd + ch - 0.42, s * (cw / 2 + 0.003)));
      }
      mb.add('vidro_escuro', roundedBox(0.03, 1.1, 0.6, 0.02, 1), m4t(x0 - 0.003, yd + 0.65, 0.35));
      // antena / radar
      mb.add('preto', roundedBox(0.08, 0.06, 0.95, 0.02, 1), m4t(xc + 0.2, yd + ch + 0.2, 0));
      mb.add('preto', cylinder(0.05, 0.12, 10), m4t(xc + 0.2, yd + ch + 0.12, 0));
      mb.add('preto', tube([[xc - 0.3, yd + ch + 0.1, 0.6], [xc - 0.3, yd + ch + 1.2, 0.6]], 0.015, 6));
      navLight(mb, [xc - 0.3, yd + ch + 1.2, 0.6], 'luz_branca', 0.035);
      // boia salva-vidas
      const ringP = [];
      for (let k = 0; k < 24; k++) { const a = (k / 24) * PI * 2; ringP.push([Math.cos(a) * 0.24, 0, Math.sin(a) * 0.24]); }
      const ring = sweep(ringP, circle2(0.06, 10), { closedPath: true, up: [0, 1, 0], smoothDeg: 90 });
      mb.add('boia', ring, m4t(X(0.48), yd + 0.06, -0.95));
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * PI * 2 + PI / 4;
        mb.add('decal_branco', roundedBox(0.07, 0.125, 0.135, 0.03, 1), m4chain(m4t(X(0.48) + Math.cos(a) * 0.24, yd + 0.06, -0.95 + Math.sin(a) * 0.24), m4ry(-a)));
      }
      // escotilha verde e caixa térmica
      mb.add('verde', roundedBox(0.95, 0.08, 1.05, 0.06, 2), m4t(X(0.11), yd + 0.04, -0.55));
      for (let k = -4; k <= 4; k++) mb.add('verde', roundedBox(0.9, 0.025, 0.02, 0.008, 1), m4t(X(0.11), yd + 0.09, -0.55 + k * 0.11));
      mb.add('estofado', roundedBox(1.25, 0.55, 0.85, 0.05, 2), m4t(X(0.27), yd + 0.28, 0.25));
      mb.add('estofado2', roundedBox(0.02, 0.02, 0.82, 0.008, 1), m4t(X(0.27), yd + 0.56, 0.25));
      // guincho de âncora na proa
      const ya = deckY(ctx, X(0.9), 0.0001);
      mb.add('preto', roundedBox(0.4, 0.3, 0.4, 0.06, 2), m4t(X(0.9), ya + 0.15, 0));
      // luzes de navegação
      const yb = deckY(ctx, X(0.86), 0.9);
      navLight(mb, [X(0.86), yb, -0.9], 'luz_vermelha', 0.05);
      navLight(mb, [X(0.86), yb, 0.9], 'luz_verde', 0.05);
      // corrimões
      for (const s of [1, -1]) {
        const pts = [];
        for (let k = 0; k <= 8; k++) { const u = 0.04 + (0.42 * k) / 8; pts.push([X(u), H._sheer(u) + 0.35, s * (H._hw(u) - 0.1)]); }
        mb.add('cromado', tube(pts, 0.02, 8));
        for (const k of [0, 4, 8]) mb.add('cromado', tube([[pts[k][0], pts[k][1] - 0.36, pts[k][2]], pts[k]], 0.016, 6));
      }
      // defensas penduradas e cabos
      for (const s of [1, -1]) {
        for (const u of [0.25, 0.45, 0.65]) {
          const z = s * (H._hw(u) + 0.12), y = H._sheer(u) - 0.35;
          mb.add('preto', roundedBox(0.2, 0.5, 0.2, 0.09, 2), m4t(X(u), y, z));
          mb.add('corda', tube([[X(u), H._sheer(u) + 0.04, s * (H._hw(u) - 0.05)], [X(u), H._sheer(u) + 0.05, z], [X(u), y + 0.25, z]], 0.01, 5));
        }
        // cabos de amarração na popa
        const ys = H._sheer(0.03);
        mb.add('corda', tube([[X(0.03), ys + 0.05, s * (H._hw(0.03) - 0.15)], [X(0.0) - 0.15, ys - 0.1, s * (H._hw(0.03) + 0.2)], [X(0) - 0.6, ys - 0.6, s * (H._hw(0.03) + 0.5)]], 0.015, 6));
        cleat(mb, X(0.03), deckY(ctx, X(0.03), s * (H._hw(0.03) - 0.15)), s * (H._hw(0.03) - 0.15));
      }
    },
  };
})();
