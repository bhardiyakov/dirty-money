// Carroceria inferior: loft ao longo de X com seções transversais arredondadas
// (fundo, cantos inferiores, lateral com "tuck"/"tumblehome", cantos superiores, tampo abaulado),
// planta com cantos em superelipse, caixas de roda recortadas e regiões de material com rebaixo.
import { pchip, clamp, lerp, vsub, vlen } from './math.js';
import { emitGrid } from './grid.js';

export function makeBody(spec) {
  const L = spec.L, W = spec.W;
  const xF = L / 2, xR = -L / 2;
  const u = (x) => (x - xR) / L; // 0 = traseira, 1 = frente
  const top = pchip(spec.top.map(([uu, y]) => [xR + uu * L, y]));
  const bot = pchip(spec.bot.map(([uu, y]) => [xR + uu * L, y]));
  const mul = spec.wmul ? pchip(spec.wmul.map(([uu, m]) => [xR + uu * L, m])) : () => 1;
  const crownF = typeof spec.crown === 'object' ? pchip(spec.crown.map(([uu, c]) => [xR + uu * L, c])) : () => spec.crown ?? 0.03;
  const rtF = typeof spec.rt === 'object' ? pchip(spec.rt.map(([uu, r]) => [xR + uu * L, r])) : () => spec.rt ?? 0.12;
  const rbBase = spec.rb ?? 0.06;
  const pF = spec.plan?.front ?? { rx: 0.35, p: 3.2 };
  const pR = spec.plan?.rear ?? { rx: 0.3, p: 3.2 };
  const se = (d, rx, p) => (d >= rx ? 1 : Math.pow(Math.max(0, 1 - Math.pow((rx - d) / rx, p)), 1 / p));
  const halfW = (x) => (W / 2) * mul(x) * se(xF - x, pF.rx, pF.p) * se(x - xR, pR.rx, pR.p);
  const arches = spec.arches || [];
  const archY = (x) => {
    let y = -1e9;
    for (const a of arches) {
      const dx = x - a.x;
      if (Math.abs(dx) < a.r) y = Math.max(y, a.y + Math.sqrt(a.r * a.r - dx * dx));
    }
    return y;
  };
  const botY = (x) => Math.max(bot(x), archY(x));
  // lateral: tuck (recolhe embaixo) e tumblehome (recolhe em cima), em alturas absolutas
  const sideZ = (A, y) => {
    const tk = spec.tuck ?? 0.025, tm = spec.tumble ?? 0.03;
    const y0 = spec.ySill ?? 0.25, y1 = spec.yWaist ?? 0.55, y2 = spec.yBelt ?? 0.95;
    let z = A;
    if (y < y1) { const t = clamp((y1 - y) / Math.max(0.05, y1 - y0), 0, 1.5); z -= tk * t * t; }
    else { const t = clamp((y - y1) / Math.max(0.05, y2 - y1), 0, 1.5); z -= tm * t * t; }
    return z;
  };

  // amostragem lateral (alturas absolutas) e do tampo (|z| absoluto)
  const regions = spec.regions || [];
  const sideH = new Set(spec.sideH || [0.2, 0.3, 0.38, 0.46, 0.54, 0.62, 0.7, 0.78, 0.86, 0.94, 1.02, 1.1, 1.2, 1.35, 1.5, 1.7, 1.9, 2.1, 2.4]);
  const topZ = new Set(spec.topZ || [0.12, 0.25, 0.38, 0.5, 0.62]);
  const xb = new Set(spec.xBreaks || []);
  for (const r of regions) {
    if (r.y) { sideH.add(r.y[0]); sideH.add(r.y[1]); }
    if (r.z) { topZ.add(r.z[0]); topZ.add(r.z[1]); }
    if (r.x) { xb.add(r.x[0]); xb.add(r.x[1]); }
  }
  const SH = [-10, ...[...sideH].sort((a, b) => a - b), 10];
  const TZ = [0, ...[...topZ].filter((z) => z > 0).sort((a, b) => a - b), 10];
  const nTA = spec.nTopArc ?? 5, nBA = 2, nBF = 2;
  const det = spec.detail ?? 1;

  // estações ao longo de X
  const st = [];
  const N0 = Math.round((spec.stations ?? 46) * det);
  for (let k = 0; k <= N0; k++) st.push({ x: xR + (L * k) / N0, w: 0 });
  const endN = Math.round(12 * Math.max(0.6, det));
  for (let k = 0; k <= endN; k++) {
    const t = Math.sin(((k / endN) * Math.PI) / 2);
    st.push({ x: xF - pF.rx * (1 - Math.cos(((k / endN) * Math.PI) / 2)) * 1.0, w: 1 });
    st.push({ x: xR + pR.rx * (1 - Math.cos(((k / endN) * Math.PI) / 2)), w: 1 });
    void t;
  }
  // refinamento do nariz/cauda em perfil
  for (const xx of [xF - 0.08, xF - 0.16, xR + 0.08, xR + 0.16]) st.push({ x: xx, w: 0 });
  for (const a of arches) {
    const n = Math.round(16 * Math.max(0.6, det));
    for (let k = 0; k <= n; k++) st.push({ x: a.x - a.r * Math.cos((k / n) * Math.PI), w: 2 });
    st.push({ x: a.x - a.r - 0.006, w: 2 }, { x: a.x + a.r + 0.006, w: 2 });
  }
  for (const x of xb) if (x > xR && x < xF) st.push({ x, w: 3 });
  st.sort((a, b) => a.x - b.x);
  const xs = [];
  for (const s of st) {
    const x = clamp(s.x, xR, xF);
    if (xs.length && x - xs[xs.length - 1].x < 0.004) {
      if (s.w > xs[xs.length - 1].w) xs[xs.length - 1] = { x, w: s.w };
      continue;
    }
    xs.push({ x, w: s.w });
  }
  xs[0].x = xR;
  xs[xs.length - 1].x = xF;

  // seção transversal (metade direita, do centro inferior ao centro superior)
  const section = (x) => {
    const A0 = Math.max(0, halfW(x));
    const S = sectionRaw(x, Math.max(A0, 0.012));
    if (A0 < 0.012) { const k = A0 / 0.012; for (const p of S.pts) p[0] *= k; S.A = A0; }
    return S;
  };
  const sectionRaw = (x, A) => {
    const yt = top(x);
    let yb = botY(x);
    if (yt - yb < 0.03) yb = yt - 0.03;
    const crown = Math.min(crownF(x), (yt - yb) * 0.3);
    const yte = yt - crown; // altura da borda do tampo
    const rt = Math.max(0.002, Math.min(rtF(x), (yte - yb) * 0.6, A * 0.85));
    const rb = Math.max(0.002, Math.min(rbBase, yte - yb - rt - 0.002, A * 0.45));
    const pts = [], seg = [];
    const yB = yb + rb, yT = yte - rt;
    const zB = Math.min(sideZ(A, yB), A), zT = Math.min(sideZ(A, yT), A);
    // fundo plano
    const zbf = Math.max(0, zB - rb);
    for (let k = 0; k <= nBF; k++) { pts.push([(zbf * k) / nBF, yb]); seg.push('bf'); }
    // canto inferior
    for (let k = 1; k <= nBA; k++) {
      const a = -Math.PI / 2 + ((k / nBA) * Math.PI) / 2;
      pts.push([zbf + Math.cos(a) * rb, yB + Math.sin(a) * rb]); seg.push('ba');
    }
    // lateral em alturas absolutas
    for (let k = 1; k < SH.length - 1; k++) {
      const y = clamp(SH[k], yB, yT);
      pts.push([Math.min(sideZ(A, y), A), y]); seg.push('sd');
    }
    pts.push([zT, yT]); seg.push('sd');
    // canto superior
    const ztc = Math.max(0, zT - rt);
    for (let k = 1; k <= nTA; k++) {
      const a = ((k / nTA) * Math.PI) / 2;
      pts.push([ztc + Math.cos(a) * rt, yT + Math.sin(a) * rt]); seg.push('ta');
    }
    // tampo com abaulamento
    for (let k = TZ.length - 2; k >= 0; k--) {
      const z = Math.min(TZ[k], ztc);
      const t = ztc > 1e-6 ? z / ztc : 0;
      pts.push([z, yte + crown * (1 - t * t)]); seg.push('tf');
    }
    return { pts, seg, A, yt, yb, yte, rt, rb };
  };

  // monta a grade completa (anel fechado)
  const sectionUse = spec.sectionFn ? (x) => spec.sectionFn(x, { u: u(x), L, W, halfW, top, bot }) : section;
  const rows = [], segRow = [];
  for (const s of xs) {
    const S = sectionUse(s.x);
    const K = S.pts.length - 1;
    const row = [];
    for (let k = 0; k <= K; k++) row.push([s.x, S.pts[k][1], S.pts[k][0]]);
    for (let k = K - 1; k >= 1; k--) row.push([s.x, S.pts[k][1], -S.pts[k][0]]);
    rows.push(row);
    if (!segRow.length) {
      for (let k = 0; k < K; k++) segRow.push(S.seg[k + 1]);
      for (let k = K - 1; k >= 0; k--) segRow.push(S.seg[k + 1] ?? S.seg[k]);
    }
  }
  return {
    spec, L, W, xF, xR, u, top, bot, botY, halfW, section: sectionUse, rows, segRow, xs,
    // altura do tampo da carroceria em (x, |z|)
    topAt(x, az) {
      const S = section(x);
      for (let k = S.pts.length - 1; k > 0; k--) {
        const [z0, y0] = S.pts[k], [z1, y1] = S.pts[k - 1];
        if (az >= z0 - 1e-9 && az <= z1 + 1e-9) {
          const t = (az - z0) / (z1 - z0 || 1);
          return lerp(y0, y1, t);
        }
      }
      return null;
    },
  };
}

// classifica e emite a carroceria
export function emitBody(mb, B, opts = {}) {
  const regions = B.spec.regions || [];
  const defMat = opts.mat || 'pintura';
  const under = opts.under || 'chassi';
  const res = emitGrid(mb, B.rows, {
    closedJ: true,
    cell: (i, j, c, n) => {
      const seg = B.segRow[j];
      const ctx = { x: c[0], y: c[1], z: c[2], az: Math.abs(c[2]), seg, n, u: B.u(c[0]) };
      for (const r of regions) {
        if (r.x && (ctx.x < r.x[0] || ctx.x > r.x[1])) continue;
        if (r.y && (ctx.y < r.y[0] || ctx.y > r.y[1])) continue;
        if (r.z && (ctx.az < r.z[0] || ctx.az > r.z[1])) continue;
        if (r.seg && !(Array.isArray(r.seg) ? r.seg.includes(seg) : r.seg === seg)) continue;
        if (r.side && Math.sign(c[2]) !== r.side) continue;
        if (r.nx && !(r.nx[0] <= n[0] && n[0] <= r.nx[1])) continue;
        if (r.ny && !(r.ny[0] <= n[1] && n[1] <= r.ny[1])) continue;
        if (r.f && !r.f(ctx)) continue;
        return { m: r.m, d: r.d || 0, w: r.w, skip: r.skip };
      }
      if (seg === 'bf' || seg === 'ba') return { m: under };
      return { m: defMat };
    },
  });
  // tampas planas (ex.: espelho de popa)
  for (const [which, sign] of [['capStart', -1], ['capEnd', 1]]) {
    const capMat = opts[which];
    if (!capMat) continue;
    const row = which === 'capStart' ? B.rows[0] : B.rows[B.rows.length - 1];
    let c = [0, 0, 0];
    for (const p of row) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
    c = c.map((v) => v / row.length);
    const n = [sign, 0, 0];
    for (let j = 0; j < row.length; j++) {
      const a = row[j], b = row[(j + 1) % row.length];
      const mid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      const m = typeof capMat === 'function' ? capMat(mid) : capMat;
      const ia = mb.vert(m, a, n), ib = mb.vert(m, b, n), ic = mb.vert(m, c, n);
      if (sign < 0) mb.tri(m, ic, ia, ib); else mb.tri(m, ic, ib, ia);
    }
  }
  return res;
}

// utilitário: distância máxima entre pontos de uma linha (para depuração)
export function rowSpan(row) {
  let m = 0;
  for (let i = 1; i < row.length; i++) m = Math.max(m, vlen(vsub(row[i], row[0])));
  return m;
}
