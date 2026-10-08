// Peças reutilizáveis: rodas, retrovisores, maçanetas, limpadores, placas, faróis redondos,
// para-choques cromados, bagageiros, aerofólios, giroflex, escapamentos, antenas.
import { MeshBuilder, Geo } from './mesh.js';
import { roundedBox, lathe, cylinder, sweep, rrect2, circle2, tube, extrude, ellipsoid, flatPoly } from './prims.js';
import { m4, m4t, m4s, m4rx, m4ry, m4rz, m4chain, m4mul, vnorm, vcross, vsub, vadd, vmul, clamp, lerp, catmull } from './math.js';

const PI = Math.PI;

// matriz a partir de base (x, y, z) e origem
export function basis(x, y, z, o) {
  return [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, o[0], o[1], o[2], 1];
}
// matriz que leva +Y local para a normal n, com eixo X local o mais próximo de 'hint'
export function alignY(n, o, hint = [1, 0, 0]) {
  const y = vnorm(n);
  let x = vsub(hint, vmul(y, hint[0] * y[0] + hint[1] * y[1] + hint[2] * y[2]));
  if (Math.hypot(...x) < 1e-6) x = Math.abs(y[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
  x = vnorm(x);
  const z = vnorm(vcross(x, y));
  return basis(x, y, z, o);
}
// leva +Z local para a normal n
export function alignZ(n, o, upHint = [0, 1, 0]) {
  const z = vnorm(n);
  let y = vsub(upHint, vmul(z, upHint[0] * z[0] + upHint[1] * z[1] + upHint[2] * z[2]));
  if (Math.hypot(...y) < 1e-6) y = [1, 0, 0];
  y = vnorm(y);
  const x = vnorm(vcross(y, z));
  return basis(x, y, z, o);
}

// caixa simples (normais chapadas)
export function box(w, h, d) {
  const g = new Geo();
  const x = w / 2, y = h / 2, z = d / 2;
  const F = [
    [[1, 0, 0], [[x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z]]],
    [[-1, 0, 0], [[-x, -y, z], [-x, y, z], [-x, y, -z], [-x, -y, -z]]],
    [[0, 1, 0], [[-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z]]],
    [[0, -1, 0], [[-x, -y, z], [-x, -y, -z], [x, -y, -z], [x, -y, z]]],
    [[0, 0, 1], [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]]],
    [[0, 0, -1], [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]]],
  ];
  for (const [n, q] of F) {
    const ids = q.map((p) => g.v(p, n));
    g.q(ids[0], ids[1], ids[2], ids[3]);
  }
  return g;
}

// ---------------------------------------------------------------------------
// RODA (espaço local: eixo ao longo de Z, face externa em +Z, centro na origem)
export function wheel(o = {}) {
  const R = o.R ?? 0.31, w = o.w ?? 0.2;
  const Rr = o.rimR ?? R * 0.66;
  const style = o.style ?? 'liga5';
  const rimMat = o.rimMat ?? 'aluminio';
  const seg = o.seg ?? 28;
  const mb = new MeshBuilder();
  const T = m4rx(PI / 2); // Y (torno) -> Z
  const add = (mat, g, M) => mb.add(mat, g, M ? m4mul(T, M) : T);
  // pneu
  const sh = Math.min(0.045, w * 0.22), bul = o.bulge ?? 0.012;
  const prof = [];
  prof.push([Rr - 0.004, -w / 2 + 0.03]);
  prof.push([Rr + 0.012, -w / 2 - 0.002]);
  const nsw = 4;
  for (let k = 1; k <= nsw; k++) {
    const t = k / (nsw + 1);
    const r = lerp(Rr + 0.012, R - sh, t);
    prof.push([r, -w / 2 - bul * Math.sin(PI * t)]);
  }
  for (let k = 0; k <= 4; k++) {
    const a = (k / 4) * (PI / 2);
    prof.push([R - sh + sh * Math.sin(a), -w / 2 + sh - sh * Math.cos(a)]);
  }
  // banda de rodagem com sulcos
  const grooves = o.grooves ?? 2;
  const tw = w - 2 * sh;
  if (grooves > 0 && !o.offroad) {
    const gw = 0.012;
    for (let gI = 1; gI <= grooves; gI++) {
      const yc = -w / 2 + sh + (tw * gI) / (grooves + 1);
      prof.push([R, yc - gw / 2], [R - 0.009, yc - gw / 2 + 0.001], [R - 0.009, yc + gw / 2 - 0.001], [R, yc + gw / 2]);
    }
  }
  for (let k = 0; k <= 4; k++) {
    const a = (k / 4) * (PI / 2);
    prof.push([R - sh + sh * Math.cos(a), w / 2 - sh + sh * Math.sin(a)]);
  }
  for (let k = nsw; k >= 1; k--) {
    const t = k / (nsw + 1);
    prof.push([lerp(Rr + 0.012, R - sh, t), w / 2 + bul * Math.sin(PI * t)]);
  }
  prof.push([Rr + 0.012, w / 2 + 0.002]);
  prof.push([Rr - 0.004, w / 2 - 0.03]);
  add(o.tireMat ?? 'pneu', lathe(prof, seg, { smoothDeg: 50 }));
  if (o.whitewall) {
    const yw = w / 2 + bul * 0.9 + 0.0015;
    add('pneu_faixa', lathe([[R - sh - 0.01, yw], [Rr + 0.035, yw]], seg));
  }
  if (o.offroad) {
    // cravos (blocos) na banda de rodagem
    const nb = 22;
    for (let k = 0; k < nb; k++) {
      for (const sgn of [-1, 1]) {
        const ph = ((k + (sgn > 0 ? 0.5 : 0)) / nb) * PI * 2;
        const bw = 0.07, bh = 0.022, bd = w * 0.36;
        const Mb = m4chain(m4ry(-ph), m4t(R + bh / 2 - 0.006, sgn * w * 0.2, 0), m4rz(0));
        add(o.tireMat ?? 'pneu', box(bh, bd, bw), Mb);
        // ombros
        const Ms = m4chain(m4ry(-ph), m4t(R - 0.035, sgn * (w / 2 + 0.004), 0));
        add(o.tireMat ?? 'pneu', box(0.05, 0.016, 0.05), Ms);
      }
    }
  }
  // aro: tambor interno
  const yFace = w / 2 - (o.dish ?? 0.03);
  add('aro_escuro', lathe([[Rr - 0.006, w / 2 - 0.02], [Rr - 0.006, -w / 2 + 0.03]], seg));
  // fundo (para não ver através)
  add('aro_escuro', lathe([[Rr - 0.006, -w / 2 + 0.03], [0, -w / 2 + 0.05]], seg));
  // lábio externo
  add(rimMat, lathe([[Rr + 0.004, w / 2 - 0.004], [Rr - 0.004, w / 2 + 0.006], [Rr - 0.02, w / 2 + 0.004], [Rr - 0.026, yFace + 0.006]], seg, { smoothDeg: 60 }));
  // disco de freio e pinça
  if (style !== 'calota' && style !== 'aco') {
    add('freio', cylinder(Rr * 0.78, 0.022, seg, { bevel: 0.004 }), m4t(0, yFace - 0.075, 0));
    add(o.caliper ? 'pinca' : 'metal_escuro', roundedBox(0.09, 0.05, 0.12, 0.012, 1), m4chain(m4ry(-PI * 0.75), m4t(Rr * 0.66, yFace - 0.05, 0)));
  }
  const hubR = o.hubR ?? Rr * 0.26;
  const spoke = (n, wIn, wOut, thick, mat, rot = 0, dish = 0.035) => {
    const poly = [[hubR * 0.85, -wIn / 2], [Rr - 0.018, -wOut / 2], [Rr - 0.018, wOut / 2], [hubR * 0.85, wIn / 2]];
    const g = extrude(poly, thick, { bevel: Math.min(thick * 0.4, 0.006), bevelSeg: 1 });
    const s = dish / (Rr - hubR);
    for (let k = 0; k < n; k++) {
      const ph = rot + (k / n) * PI * 2;
      const c = Math.cos(ph), sn = Math.sin(ph);
      // x local -> radial (com cisalhamento em y), y local -> tangencial, z local -> eixo (+Y torno)
      const Mk = [c, s, sn, 0, -sn, 0, c, 0, 0, 1, 0, 0, 0, yFace - (Rr - 0.018) * s - thick + 0.004, 0, 1];
      add(mat, g, Mk);
    }
  };
  if (style === 'liga5' || style === 'liga6') {
    const n = style === 'liga6' ? 6 : 5;
    spoke(n, 0.07, 0.095, 0.03, rimMat);
  } else if (style === 'liga10') {
    spoke(10, 0.03, 0.045, 0.026, rimMat);
  } else if (style === 'esportivo') {
    spoke(5, 0.05, 0.03, 0.028, rimMat, 0.0, 0.045);
    spoke(5, 0.05, 0.03, 0.028, rimMat, 0.22, 0.045);
  } else if (style === 'multi') {
    spoke(7, 0.045, 0.06, 0.028, rimMat, 0, 0.03);
  } else if (style === 'offroad') {
    spoke(6, 0.085, 0.06, 0.034, rimMat, 0, 0.02);
    add(rimMat, lathe([[Rr + 0.002, w / 2 + 0.012], [Rr - 0.03, w / 2 + 0.012], [Rr - 0.03, w / 2 - 0.01]], seg));
  } else if (style === 'calota') {
    // calota cromada abaulada
    const P = [];
    const rc = Rr - 0.012;
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      P.push([rc * (1 - t), yFace + 0.004 + 0.03 * Math.sin((t * PI) / 2) + (t > 0.7 ? 0.012 * (t - 0.7) / 0.3 : 0)]);
    }
    add(rimMat, lathe(P, seg, { smoothDeg: 50 }));
    add('aro_escuro', lathe([[rc + 0.004, yFace - 0.01], [rc - 0.002, yFace + 0.006]], seg));
  } else if (style === 'aco') {
    // roda de aço com furos
    add(rimMat, lathe([[Rr - 0.02, yFace - 0.004], [hubR * 1.8, yFace - 0.016], [hubR * 1.2, yFace + 0.004], [0, yFace + 0.006]], seg, { smoothDeg: 30 }));
    const nh = 6;
    for (let k = 0; k < nh; k++) {
      const ph = (k / nh) * PI * 2 + PI / nh;
      const rr = (hubR * 1.8 + Rr - 0.02) / 2;
      add('aro_escuro', cylinder(0.028, 0.004, 12), m4t(Math.cos(ph) * rr, yFace - 0.006, Math.sin(ph) * rr));
    }
  }
  // cubo e porcas
  if (style !== 'calota') {
    add(o.capMat ?? rimMat, cylinder(hubR * 0.62, 0.02, 18, { bevel: 0.006 }), m4t(0, yFace + 0.006, 0));
    const nl = style === 'offroad' ? 6 : 5;
    for (let k = 0; k < nl; k++) {
      const ph = (k / nl) * PI * 2;
      add('metal', cylinder(0.009, 0.018, 8, { bevel: 0.002 }), m4t(Math.cos(ph) * hubR * 0.78, yFace + 0.002, Math.sin(ph) * hubR * 0.78));
    }
  }
  return mb;
}

// ---------------------------------------------------------------------------
// Retrovisor. side = +1 (direita, +z) ou -1. (x, y) = base; z0 = superfície da porta.
export function mirror(mb, { x, y, z0, side, mat = 'pintura', size = 1, arm = 0.07 }) {
  const s = size;
  const hw = 0.19 * s, hh = 0.115 * s, hd = 0.08 * s;
  const zc = side * (z0 + arm + hw / 2 - 0.01);
  // braço
  mb.add('plastico', roundedBox(0.06 * s, 0.05 * s, arm + 0.04, 0.012, 1), m4t(x - 0.01, y, side * (z0 + arm / 2 - 0.005)));
  // carcaça (levemente inclinada para trás)
  const M = m4chain(m4t(x, y + 0.04 * s, zc), m4ry(side * 0.12));
  mb.add(mat, roundedBox(hd, hh, hw, 0.035 * s, 2), M);
  // espelho (face traseira)
  mb.add('espelho', roundedBox(0.01, hh * 0.78, hw * 0.86, 0.004, 1), m4chain(M, m4t(-hd / 2 - 0.001, 0, 0)));
}

// maçaneta embutida na lateral
export function handle(mb, rc, { x, y, side, mat = 'pintura', w = 0.17 }) {
  const hit = rc.cast([x, y, side * 3], [0, 0, -side]);
  if (!hit) return;
  const n = hit.n[2] * side < 0 ? vmul(hit.n, -1) : hit.n;
  const M = alignZ(n, vadd(hit.p, vmul(n, 0.004)), [0, 1, 0]);
  mb.add(mat, roundedBox(w, 0.032, 0.022, 0.011, 1), M);
  mb.add('borracha', roundedBox(w * 0.9, 0.012, 0.012, 0.005, 1), m4mul(M, m4t(0, -0.022, -0.006)));
}

// placa Mercosul (frente: +1, traseira: -1)
export function plate(mb, rc, { y, end, depth = 0.012, z = 0, scale = 1 }) {
  const hit = rc.cast([end * 6, y, z], [-end, 0, 0]);
  if (!hit) return;
  const pw = 0.4 * scale, ph = 0.13 * scale;
  const n = end > 0 ? [1, 0, 0] : [-1, 0, 0];
  // ligeiro afastamento do corpo
  const o = vadd(hit.p, vmul(n, 0.006));
  const M = alignZ(n, o, [0, 1, 0]);
  mb.add('placa', roundedBox(pw, ph, depth, 0.008, 1), M);
  mb.add('placa_azul', box(pw - 0.012, ph * 0.22, 0.004), m4mul(M, m4t(0, ph * 0.33, depth / 2)));
  // caracteres estilizados
  for (let k = 0; k < 7; k++) {
    const cx = -pw * 0.38 + (k * pw * 0.76) / 6;
    mb.add('placa_letra', box(0.028 * scale, 0.055 * scale, 0.003), m4mul(M, m4t(cx, -ph * 0.1, depth / 2)));
  }
}

// limpadores de para-brisa: base (x0,y0) e comprimento
export function wipers(mb, { x, y, z = [-0.2, 0.32], len = 0.55, ang = 0.18, slope = 0.5 }) {
  for (const zz of z) {
    const p0 = [x, y, zz];
    const dir = vnorm([-Math.sin(ang) * slope - 0.25, slope * 0.55, -Math.cos(ang)]);
    const p1 = vadd(p0, vmul(dir, len));
    mb.add('borracha', tube([p0, vlerp(p0, p1, 0.5), p1], 0.008, 6));
    mb.add('borracha', cylinder(0.018, 0.02, 10), m4t(x, y, zz));
  }
}
const vlerp = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// farol redondo (aro cromado + lente abaulada) na direção n
export function roundLamp(mb, { p, n = [1, 0, 0], r = 0.085, mat = 'farol', ring = 'cromado', depth = 0.03 }) {
  const M = alignY(n, p, [0, 1, 0]);
  mb.add(ring, lathe([[r + 0.012, -depth], [r + 0.014, 0.0], [r + 0.008, 0.012], [r - 0.004, 0.008], [r - 0.006, -0.004]], 24, { smoothDeg: 60 }), M);
  mb.add('farol_refletor', lathe([[r - 0.004, -0.003], [r * 0.4, -depth * 0.7], [0, -depth * 0.8]], 20), M);
  const dome = [];
  for (let k = 0; k <= 5; k++) {
    const a = (k / 5) * (PI / 2);
    dome.push([(r - 0.004) * Math.cos(a), 0.002 + 0.018 * Math.sin(a)]);
  }
  mb.add(mat, lathe(dome, 24, { smoothDeg: 60 }), M);
}

// para-choque tubular (perfil retangular arredondado varrido em um caminho)
export function bumperBar(mb, { path, h = 0.1, d = 0.07, r = 0.025, mat = 'cromado', up = [0, 1, 0] }) {
  // perfil no plano (N = vertical, B = horizontal)
  const prof = rrect2(h, d, Math.min(r, h / 2.05, d / 2.05), 3);
  mb.add(mat, sweep(path, prof, { up, smoothDeg: 40 }));
}

// trilho/bagageiro de teto: pontos de apoio e altura
export function railTube(mb, pts, r = 0.016, mat = 'aluminio', seg = 8) {
  mb.add(mat, tube(pts, r, seg));
}

// aerofólio genérico (perfil de asa varrido ao longo de z)
export function wing(mb, { x, y, span, chord = 0.25, thick = 0.035, mat = 'pintura', tilt = 0.12, end = true }) {
  const prof = [];
  const n = 10;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    prof.push([chord * (0.5 - t), thick * (0.6 * Math.sin(PI * t) + 0.15) ]);
  }
  for (let k = n - 1; k >= 1; k--) {
    const t = k / n;
    prof.push([chord * (0.5 - t), -thick * 0.25 * Math.sin(PI * t)]);
  }
  // perfil no plano (x, y): girar levemente
  const ca = Math.cos(tilt), sa = Math.sin(tilt);
  const P = prof.map(([a, b]) => [a * ca - b * sa, a * sa + b * ca]);
  const path = [[x, y, -span / 2], [x, y, span / 2]];
  // N = +y? usamos up=[1,0,0] para que N fique em x
  const g = sweep(path, P.map(([a, b]) => [a, b]), { up: [1, 0, 0], smoothDeg: 45 });
  mb.add(mat, g);
  if (end) {
    for (const sz of [-1, 1]) mb.add(mat, roundedBox(chord * 1.05, thick * 3.2, 0.012, 0.005, 1), m4t(x, y + thick * 0.4, sz * span / 2));
  }
}

// giroflex (barra de luzes)
export function lightBar(mb, { x, y, len = 1.15, w = 0.28, h = 0.09, across = true }) {
  const L = across ? w : len, Wd = across ? len : w;
  mb.add('plastico', roundedBox(L, h * 0.45, Wd, 0.02, 1), m4t(x, y + h * 0.22, 0));
  const seg = Wd / 2 - 0.04;
  mb.add('giroflex_azul', roundedBox(L * 0.86, h * 0.62, seg, 0.03, 2), m4t(x, y + h * 0.62, -(seg / 2 + 0.03)));
  mb.add('giroflex_vermelho', roundedBox(L * 0.86, h * 0.62, seg, 0.03, 2), m4t(x, y + h * 0.62, seg / 2 + 0.03));
  mb.add('cromado', roundedBox(L * 0.7, h * 0.5, 0.05, 0.01, 1), m4t(x, y + h * 0.6, 0));
}

// escapamento
export function exhaust(mb, { x, y, z, r = 0.035, len = 0.12, mat = 'cromado' }) {
  const M = m4chain(m4t(x, y, z), m4rz(-PI / 2));
  mb.add(mat, lathe([[r - 0.006, len / 2 - 0.004], [r - 0.006, -len / 2], [r, -len / 2], [r, len / 2]], 14), M);
  mb.add('chassi', cylinder(r - 0.006, 0.01, 12), m4chain(m4t(x - len / 2 + 0.02, y, z), m4rz(-PI / 2)));
}

// antena "barbatana de tubarão"
export function sharkFin(mb, { x, y, mat = 'preto', s = 1 }) {
  const poly = [[0.1 * s, 0], [-0.1 * s, 0], [-0.07 * s, 0.05 * s], [-0.02 * s, 0.065 * s], [0.03 * s, 0.03 * s]];
  const g = extrude(poly, 0.05 * s, { bevel: 0.012 * s, bevelSeg: 2 });
  mb.add(mat, g, m4t(x, y - 0.004, -0.025 * s));
}

// antena de vareta
export function whipAntenna(mb, { x, y, z, h = 0.6, tilt = -0.25 }) {
  const p0 = [x, y, z], p1 = [x + Math.sin(tilt) * h, y + Math.cos(tilt) * h, z];
  mb.add('cromado', tube([p0, p1], 0.004, 5));
  mb.add('preto', cylinder(0.015, 0.025, 10, { bevel: 0.004 }), m4t(x, y, z));
}

// estribo lateral
export function sideStep(mb, { x0, x1, y, z, w = 0.14, mat = 'plastico' }) {
  mb.add(mat, roundedBox(x1 - x0, 0.045, w, 0.015, 2), m4t((x0 + x1) / 2, y, z));
}

export { vlerp };
