// Motos: rua (estilo CG, a do motoboy, também com baú), scooter, trilha, esportiva e custom de viagem (estilo Harley).
// Sem carroceria em loft: peça por peça (tanque, banco, carenagens, motor, garfo, guidão, escapamento, luzes). As duas rodas são nós
// "roda_dd" (dianteira) e "roda_td" (traseira) no plano do meio (z = 0) — o jogo replica a roda nos dois eixos e a gira; a da frente
// esterça. Eixos do glTF: +X frente, +Y cima, +Z direita; chão em y = 0.
//
// Ergonomia: o piloto do jogo é um sprite 2,5D com as mãos e os pés em pontos fixos a partir do BANCO (NpcGenAnims RIDE.moto, em m no
// jogo = m reais × 1,17). Por isso toda moto põe as manoplas ~0,69 m à frente e ~0,32 m acima do ponto do banco (spec.seat), com
// ~0,30 m para cada lado, e as pedaleiras logo abaixo do banco — as mãos do sprite caem no guidão de qualquer modelo.
import { m4t, m4chain, m4rx, m4ry, m4rz, lerp } from '../math.js';
import { roundedBox, cylinder, tube, ellipsoid, lathe, sweep, rrect2 } from '../prims.js';
import { MeshBuilder } from '../mesh.js';
import { roundLamp } from '../parts.js';

const PI = Math.PI;
const GRIP = { fwd: 0.69, up: 0.32, half: 0.3 };

// ---------------------------------------------------------------------------
// RODA de moto (espaço local como a de carro: eixo ao longo de Z, centro na origem). Simétrica — os dois lados aparecem.
// style: 'raios' (raiados), 'liga' (liga leve, `spokes` braços), 'trilha' (raiada com cravos).
export function motoWheel(o = {}) {
  const R = o.R ?? 0.31, w = o.w ?? 0.11, Rr = o.rimR ?? R * 0.7, seg = o.seg ?? 18;
  const rimMat = o.rimMat ?? 'aluminio', style = o.style ?? 'liga';
  const mb = new MeshBuilder();
  const T = m4rx(PI / 2);                                   // Y (torno) -> Z
  const add = (mat, g, M) => mb.add(mat, g, M ? m4chain(T, M) : T);
  // pneu: seção oval, da borda do aro de um lado à do outro passando pela banda de rodagem
  const h = R - Rr, rc = Rr + h / 2, prof = [];
  for (let k = 0; k <= 10; k++) {
    const t = -0.82 * PI + (1.64 * PI * k) / 10;
    prof.push([rc + (h / 2) * Math.cos(t), (w / 2) * Math.sin(t)]);
  }
  add(o.tireMat ?? 'pneu', lathe(prof, seg, { smoothDeg: 60 }));
  if (style === 'trilha') {
    // cravos: blocos em volta da banda de rodagem, alternados
    const nb = 18;
    for (let k = 0; k < nb; k++) for (const s of [-1, 1]) {
      const ph = ((k + (s > 0 ? 0.5 : 0)) / nb) * PI * 2;
      add('pneu', roundedBox(0.03, w * 0.34, 0.05, 0.008, 1), m4chain(m4ry(-ph), m4t(R + 0.006, s * w * 0.2, 0)));
    }
  }
  // aro (fora e dentro) e cubo
  add(rimMat, lathe([[Rr + 0.012, -w * 0.36], [Rr, -w * 0.3], [Rr, w * 0.3], [Rr + 0.012, w * 0.36]], seg));
  add(rimMat, lathe([[Rr + 0.012, w * 0.36], [Rr - 0.006, w * 0.3], [Rr - 0.006, -w * 0.3], [Rr + 0.012, -w * 0.36]], seg));
  add(o.hubMat ?? 'metal', cylinder(0.05, w * 0.95, 12, { bevel: 0.01 }));
  if (style === 'liga') {
    const n = o.spokes ?? 5, len = Rr - 0.05;
    for (let k = 0; k < n; k++) add(rimMat, roundedBox(len, 0.028, 0.034, 0.01, 1), m4chain(m4ry((k / n) * PI * 2), m4t(0.05 + len / 2, 0, 0)));
  } else {
    // raios finos dos dois lados, cruzados
    const n = 16;
    for (let k = 0; k < n; k++) {
      const s = k % 2 ? 1 : -1, a0 = (k / n) * PI * 2, a1 = a0 + s * 0.35;
      tubeAdd(add, o.spokeMat ?? 'cromado', [[0.045 * Math.cos(a0), s * w * 0.32, 0.045 * Math.sin(a0)], [Rr * Math.cos(a1), s * w * 0.06, Rr * Math.sin(a1)]], 0.0035);
    }
  }
  // disco de freio (lado direito)
  if (o.disc !== false) add('freio', cylinder(Rr * 0.62, 0.006, seg, { capBot: true }), m4t(0, w * 0.34, 0));
  return mb;
}
function tubeAdd(add, mat, pts, r) { add(mat, tube(pts, r, 4)); }

// ---------------------------------------------------------------------------
// Peças
const bar = (mb, mat, pts, r = 0.018, seg = 8) => mb.add(mat, tube(pts, r, seg));
// garfo: das pontas do eixo dianteiro (x, R) à mesa (head) — dois tubos, bainhas mais grossas embaixo
function fork(mb, { ax, R, head, half = 0.085, r = 0.022, mat = 'cromado', lower = 'metal_escuro' }) {
  for (const s of [-1, 1]) {
    const a = [ax, R, s * half], b = [head[0], head[1], s * half], m = [lerp(a[0], b[0], 0.45), lerp(a[1], b[1], 0.45), s * half];
    bar(mb, lower, [a, m], r * 1.35);
    bar(mb, mat, [m, b], r);
  }
  mb.add('metal_escuro', roundedBox(0.09, 0.05, half * 2 + 0.07, 0.015, 1), m4t(head[0], head[1], 0));
}
// guidão a partir da mesa até as manoplas (gx, gy, ±half), com manoplas e manetes
function handlebar(mb, { head, gx, gy, half = GRIP.half, mat = 'cromado', grips = 'estofado_preto', rise = 0.06 }) {
  const c = [lerp(head[0], gx, 0.4), gy - 0.015, 0];
  bar(mb, mat, [[head[0], head[1], 0], [head[0], head[1] + rise, 0]], 0.02);
  bar(mb, mat, [[gx, gy, -half + 0.09], [c[0], c[1] + 0.02, -half * 0.45], [c[0], c[1] + 0.03, 0], [c[0], c[1] + 0.02, half * 0.45], [gx, gy, half - 0.09]], 0.012);
  for (const s of [-1, 1]) {
    mb.add(grips, cylinder(0.019, 0.12, 10, { bevel: 0.005 }), m4chain(m4t(gx, gy, s * (half - 0.04)), m4rx(PI / 2)));
    bar(mb, 'metal', [[gx + 0.03, gy + 0.005, s * (half - 0.1)], [gx + 0.06, gy - 0.01, s * (half - 0.02)]], 0.006, 4);
  }
}
function mirrors(mb, { gx, gy, half = GRIP.half - 0.08, h = 0.2 }) {
  for (const s of [-1, 1]) {
    bar(mb, 'metal_escuro', [[gx - 0.02, gy, s * half], [gx - 0.04, gy + h, s * (half + 0.05)]], 0.006, 4);
    mb.add('preto', ellipsoid(0.03, 0.045, 0.06, 10, 6), m4t(gx - 0.05, gy + h + 0.02, s * (half + 0.06)));
  }
}
// para-lama: arco sobre a roda de centro (cx, R), do ângulo a0 ao a1 (rad; 0 = frente, PI/2 = topo)
function fender(mb, { cx, R, a0, a1, gap = 0.05, w = 0.13, t = 0.012, mat = 'pintura', n = 10 }) {
  const path = [];
  for (let k = 0; k <= n; k++) { const a = lerp(a0, a1, k / n), r = R + gap; path.push([cx + Math.cos(a) * r, R + Math.sin(a) * r, 0]); }
  mb.add(mat, sweep(path, rrect2(w, t, t * 0.45, 1), { up: [0, 0, 1] }));
}
function tailLamp(mb, x, y, w = 0.12, h = 0.05) { mb.add('lanterna', roundedBox(0.03, h, w, 0.012, 1), m4t(x, y, 0)); }
function signals(mb, x, y, half, dir) {
  for (const s of [-1, 1]) {
    bar(mb, 'preto', [[x - dir * 0.02, y, s * (half - 0.05)], [x, y, s * half]], 0.007, 4);
    mb.add('pisca', ellipsoid(0.03, 0.02, 0.02, 8, 5), m4t(x + dir * 0.015, y, s * half));
  }
}
function plateRear(mb, x, y) {
  mb.add('placa', roundedBox(0.008, 0.11, 0.17, 0.004, 1), m4chain(m4t(x, y, 0), m4rz(-0.25)));
  for (let k = 0; k < 3; k++) mb.add('placa_letra', roundedBox(0.004, 0.035, 0.03, 0.002, 1), m4chain(m4t(x - 0.006, y - 0.01, -0.05 + k * 0.05), m4rz(-0.25)));
}
// motor monocilíndrico arrefecido a ar (aletas) com o cárter embaixo
function singleEngine(mb, { x, y, tilt = 0.25, mat = 'metal_escuro', fins = 'aluminio' }) {
  mb.add(mat, roundedBox(0.32, 0.2, 0.26, 0.05, 2), m4t(x - 0.04, y - 0.06, 0));
  const M = m4chain(m4t(x + 0.06, y + 0.1, 0), m4rz(-tilt));
  for (let k = 0; k < 5; k++) mb.add(fins, roundedBox(0.2, 0.014, 0.2, 0.006, 1), m4chain(M, m4t(0, k * 0.032, 0)));
  mb.add(mat, roundedBox(0.13, 0.17, 0.13, 0.03, 1), m4chain(M, m4t(0, 0.07, 0)));
  mb.add('metal', cylinder(0.075, 0.03, 12), m4chain(m4t(x - 0.06, y - 0.06, -0.14), m4rx(PI / 2)));      // tampa do lado esquerdo
}
// banco (estofado em cima de uma base) e a "corcova" do piloto
function seatPad(mb, { x, y, len, w = 0.26, h = 0.09, mat = 'estofado_preto' }) {
  mb.add('plastico', roundedBox(len, 0.04, w * 0.95, 0.015, 1), m4t(x, y - h / 2, 0));
  mb.add(mat, roundedBox(len, h, w, Math.min(0.045, h / 2 - 0.002), 2), m4t(x, y, 0));
}
function wheelNodes(spec, { xf, xr, R }) {
  return [['roda_dd', xf, 'dianteiro'], ['roda_td', xr, 'traseiro']].map(([name, x, eixo]) => ({
    name, matrix: m4t(x, R, 0), extras: { tipo: 'roda', eixo, lado: 'direito', raio: R },
    children: [{ name: name + '_malha', mesh: spec._wheel.build() }],
  }));
}
// Monta a especificação: geometria em details(), as duas rodas como nós
function moto(o) {
  const wheelOpts = o.wheel;
  const spec = {
    slug: o.slug, L: o.L, W: o.W, tipo: 'moto', moto: true, colors: o.colors || {}, matOverrides: o.matOverrides || {},
    seat: o.seat,
    details(ctx) {
      spec._wheel = motoWheel({ ...wheelOpts, seg: Math.max(12, Math.round((wheelOpts.seg ?? 22) * Math.max(0.6, ctx.det))) });
      o.parts(ctx.mb, o);
      for (const n of wheelNodes(spec, { xf: o.xf, xr: o.xr, R: wheelOpts.R })) ctx.parts.push(n);
    },
  };
  return spec;
}
// Manoplas a partir do ponto do banco
const grips = (o) => ({ gx: o.seat[0] + GRIP.fwd, gy: o.seat[1] + GRIP.up });

// ---------------------------------------------------------------------------
// RUA (estilo CG 160): a moto do dia a dia e do motoboy
function ruaParts(mb, o, { bau = false } = {}) {
  const R = o.wheel.R, { gx, gy } = grips(o), head = [gx - 0.07, gy - 0.12];
  fork(mb, { ax: o.xf, R, head });
  handlebar(mb, { head, gx, gy });
  mirrors(mb, { gx, gy });
  // farol, painel e piscas
  mb.add('preto', roundedBox(0.12, 0.14, 0.17, 0.04, 2), m4t(head[0] + 0.09, head[1] - 0.03, 0));
  roundLamp(mb, { p: [head[0] + 0.155, head[1] - 0.03, 0], n: [1, 0, 0], r: 0.07 });
  mb.add('preto', cylinder(0.055, 0.04, 14, { bevel: 0.01 }), m4chain(m4t(head[0] + 0.02, gy + 0.03, 0), m4rz(0.5)));
  signals(mb, head[0] + 0.1, head[1] - 0.06, 0.15, 1);
  // quadro, tanque, tampas laterais, banco
  bar(mb, 'metal_escuro', [[head[0], head[1] - 0.05, 0], [0.18, 0.62, 0], [-0.1, 0.42, 0]], 0.025);
  mb.add('pintura', ellipsoid(0.3, 0.12, 0.165, 18, 9), m4t(0.2, 0.86, 0));
  mb.add('faixa', ellipsoid(0.27, 0.06, 0.168, 16, 4, { th0: -0.25, th1: 0.25 }), m4t(0.2, 0.86, 0));
  mb.add('metal', cylinder(0.03, 0.015, 10), m4t(0.26, 0.98, 0));
  mb.add('pintura', roundedBox(0.34, 0.18, 0.28, 0.06, 2), m4t(-0.18, 0.67, 0));
  seatPad(mb, { x: -0.32, y: 0.82, len: 0.66, w: 0.25 });
  // rabeta, lanterna, placa, para-lamas
  mb.add('pintura', roundedBox(0.4, 0.07, 0.2, 0.03, 2), m4chain(m4t(-0.72, 0.8, 0), m4rz(0.1)));
  tailLamp(mb, -0.93, 0.79);
  signals(mb, -0.9, 0.75, 0.13, -1);
  plateRear(mb, -0.96, 0.66);
  fender(mb, { cx: o.xf, R, a0: 0.25, a1: 2.0, mat: 'pintura', w: 0.11 });
  fender(mb, { cx: o.xr, R, a0: 1.5, a1: 2.9, mat: 'preto', w: 0.13 });
  // motor, balança, amortecedores, escapamento, pedaleiras
  singleEngine(mb, { x: 0.05, y: 0.4 });
  for (const s of [-1, 1]) {
    bar(mb, 'metal_escuro', [[-0.12, 0.42, s * 0.1], [o.xr, R, s * 0.1]], 0.02, 6);
    bar(mb, 'cromado', [[o.xr + 0.12, R + 0.07, s * 0.11], [-0.42, 0.78, s * 0.11]], 0.022, 8);
    bar(mb, 'metal', [[0.0, 0.33, s * 0.12], [0.0, 0.33, s * 0.2]], 0.012, 6);
  }
  bar(mb, 'cromado', [[0.14, 0.34, 0.08], [0.0, 0.25, 0.13], [-0.3, 0.32, 0.17]], 0.024);
  mb.add('cromado', cylinder(0.05, 0.42, 14, { bevel: 0.012 }), m4chain(m4t(-0.52, 0.38, 0.18), m4rz(PI / 2 - 0.15)));
  if (bau) {
    // baú de entrega no bagageiro
    bar(mb, 'metal_escuro', [[-0.5, 0.86, -0.1], [-0.85, 0.88, -0.1]], 0.012, 4);
    bar(mb, 'metal_escuro', [[-0.5, 0.86, 0.1], [-0.85, 0.88, 0.1]], 0.012, 4);
    mb.add('decal2', roundedBox(0.44, 0.38, 0.42, 0.04, 2), m4t(-0.7, 1.1, 0));
    mb.add('decal_branco', roundedBox(0.445, 0.07, 0.425, 0.02, 1), m4t(-0.7, 1.1, 0));
    mb.add('lanterna', roundedBox(0.01, 0.03, 0.2, 0.005, 1), m4t(-0.925, 1.2, 0));
  } else {
    // bagageiro
    for (const s of [-1, 1]) bar(mb, 'metal_escuro', [[-0.55, 0.88, s * 0.1], [-0.88, 0.9, s * 0.1]], 0.01, 4);
    bar(mb, 'metal_escuro', [[-0.88, 0.9, -0.1], [-0.88, 0.9, 0.1]], 0.01, 4);
  }
}
const RUA = { L: 2.0, W: 0.78, xf: 0.66, xr: -0.66, seat: [-0.2, 0.8], wheel: { R: 0.31, w: 0.1, style: 'raios', rimMat: 'aluminio' } };
export const moto_rua = moto({ ...RUA, slug: 'moto', colors: { pintura: '#c41a1f', faixa: '#f2f2f2' }, parts: (mb, o) => ruaParts(mb, o) });
export const moto_entrega = moto({ ...RUA, slug: 'moto_entrega', colors: { pintura: '#1d1e22', faixa: '#c41a1f' }, parts: (mb, o) => ruaParts(mb, o, { bau: true }) });

// ---------------------------------------------------------------------------
// SCOOTER (estilo PCX / Biz): rodas pequenas, piso para os pés, escudo na frente e o motor na balança
export const moto_scooter = moto({
  slug: 'moto_scooter', L: 1.95, W: 0.74, xf: 0.64, xr: -0.62, seat: [-0.27, 0.78],
  wheel: { R: 0.26, w: 0.11, rimR: 0.18, style: 'liga', spokes: 5, rimMat: 'aro_escuro' },
  colors: { pintura: '#e7e7e2' },
  parts(mb, o) {
    const R = o.wheel.R, { gx, gy } = grips(o), head = [gx - 0.06, gy - 0.1];
    fork(mb, { ax: o.xf, R, head: [head[0] - 0.04, head[1] - 0.15], half: 0.075, r: 0.02, mat: 'metal_escuro' });
    handlebar(mb, { head, gx, gy, rise: 0.02 });
    mirrors(mb, { gx, gy, h: 0.17 });
    // capa do guidão com o farol e o painel
    mb.add('pintura', ellipsoid(0.17, 0.08, 0.24, 16, 8), m4t(head[0] + 0.03, gy - 0.01, 0));
    mb.add('preto', ellipsoid(0.1, 0.04, 0.14, 12, 6, { th0: 0 }), m4t(head[0] - 0.02, gy + 0.04, 0));
    roundLamp(mb, { p: [head[0] + 0.17, gy - 0.02, 0], n: [1, 0, 0], r: 0.055 });
    // escudo frontal (inclinado) e o piso
    mb.add('pintura', ellipsoid(0.13, 0.36, 0.24, 18, 10), m4chain(m4t(0.44, 0.66, 0), m4rz(0.32)));
    mb.add('plastico', roundedBox(0.34, 0.2, 0.3, 0.05, 2), m4chain(m4t(0.36, 0.62, 0), m4rz(0.3)));
    signals(mb, 0.53, 0.86, 0.17, 1);
    mb.add('plastico', roundedBox(0.52, 0.06, 0.32, 0.025, 2), m4t(0.07, 0.3, 0));
    mb.add('pintura', roundedBox(0.48, 0.12, 0.34, 0.04, 2), m4t(0.07, 0.24, 0));
    // carenagem traseira, banco, rabeta
    mb.add('pintura', ellipsoid(0.52, 0.22, 0.2, 20, 10), m4t(-0.42, 0.58, 0));
    mb.add('pintura', roundedBox(0.3, 0.3, 0.3, 0.1, 2), m4t(-0.17, 0.5, 0));
    seatPad(mb, { x: -0.38, y: 0.8, len: 0.72, w: 0.28, h: 0.1 });
    mb.add('estofado_preto', roundedBox(0.16, 0.07, 0.26, 0.03, 2), m4t(-0.68, 0.87, 0));
    tailLamp(mb, -0.93, 0.66, 0.16, 0.06);
    signals(mb, -0.9, 0.62, 0.15, -1);
    plateRear(mb, -0.9, 0.5);
    mb.add('metal_escuro', roundedBox(0.2, 0.04, 0.26, 0.015, 1), m4t(-0.82, 0.78, 0));       // alça
    fender(mb, { cx: o.xf, R, a0: 0.3, a1: 2.1, mat: 'pintura', w: 0.12, gap: 0.04 });
    fender(mb, { cx: o.xr, R, a0: 1.4, a1: 2.6, mat: 'plastico', w: 0.13, gap: 0.04 });
    // motor na balança (lado esquerdo), escapamento à direita
    mb.add('metal_escuro', roundedBox(0.5, 0.17, 0.12, 0.05, 2), m4t(-0.4, 0.3, -0.1));
    mb.add('aluminio', ellipsoid(0.12, 0.1, 0.03, 12, 6), m4t(-0.3, 0.32, -0.17));
    bar(mb, 'metal_escuro', [[-0.1, 0.24, 0.05], [-0.3, 0.2, 0.15], [-0.5, 0.3, 0.17]], 0.02);
    mb.add('metal_escuro', cylinder(0.055, 0.32, 12, { bevel: 0.015 }), m4chain(m4t(-0.62, 0.33, 0.17), m4rz(PI / 2 - 0.2)));
    mb.add('aluminio', cylinder(0.04, 0.03, 12), m4chain(m4t(-0.79, 0.37, 0.17), m4rz(PI / 2 - 0.2)));
    bar(mb, 'metal_escuro', [[-0.62, 0.35, 0.12], [-0.48, 0.66, 0.12]], 0.02, 6);
  },
});

// ---------------------------------------------------------------------------
// TRILHA (estilo XR / Bros): alta, rodas grandes com cravos, para-lamas altos, escapamento que sobe
export const moto_trilha = moto({
  slug: 'moto_trilha', L: 2.15, W: 0.84, xf: 0.72, xr: -0.7, seat: [-0.16, 0.92],
  wheel: { R: 0.34, w: 0.1, rimR: 0.24, style: 'trilha', rimMat: 'aluminio' },
  colors: { pintura: '#e8581a', pintura2: '#f1f1ee' },
  parts(mb, o) {
    const R = o.wheel.R, { gx, gy } = grips(o), head = [gx - 0.1, gy - 0.12];
    fork(mb, { ax: o.xf, R, head, half: 0.09, r: 0.025, mat: 'aluminio', lower: 'metal_escuro' });
    handlebar(mb, { head, gx, gy, half: GRIP.half + 0.03, mat: 'metal_escuro', rise: 0.08 });
    mb.add('metal_escuro', roundedBox(0.03, 0.03, 0.1, 0.01, 1), m4t(gx - 0.03, gy - 0.01, 0));
    // carenagem do farol (placa de número), para-lama alto
    mb.add('decal_branco', roundedBox(0.05, 0.22, 0.22, 0.04, 2), m4chain(m4t(head[0] + 0.11, head[1] - 0.06, 0), m4rz(-0.35)));
    roundLamp(mb, { p: [head[0] + 0.14, head[1] - 0.05, 0], n: [0.94, -0.33, 0], r: 0.05 });
    mb.add('decal_branco', roundedBox(0.5, 0.025, 0.16, 0.012, 2), m4chain(m4t(o.xf + 0.05, R + 0.4, 0), m4rz(-0.12)));
    signals(mb, head[0] + 0.08, head[1] - 0.1, 0.14, 1);
    // quadro, tanque com abas, banco comprido
    bar(mb, 'metal_escuro', [[head[0], head[1] - 0.04, 0], [0.12, 0.56, 0], [-0.12, 0.45, 0]], 0.025);
    mb.add('pintura', ellipsoid(0.28, 0.12, 0.17, 16, 8), m4t(0.18, 0.98, 0));
    for (const s of [-1, 1]) mb.add('pintura2', roundedBox(0.3, 0.2, 0.03, 0.03, 2), m4chain(m4t(0.3, 0.86, s * 0.17), m4rz(-0.3), m4ry(s * 0.2)));
    for (const s of [-1, 1]) mb.add('pintura', roundedBox(0.36, 0.17, 0.03, 0.03, 2), m4chain(m4t(-0.42, 0.82, s * 0.13), m4rz(0.12)));
    seatPad(mb, { x: -0.25, y: 0.97, len: 0.78, w: 0.22, h: 0.08 });
    mb.add('pintura2', roundedBox(0.52, 0.03, 0.17, 0.014, 2), m4chain(m4t(-0.8, 0.98, 0), m4rz(0.12)));
    tailLamp(mb, -1.04, 0.99, 0.08, 0.04);
    signals(mb, -0.98, 0.94, 0.11, -1);
    plateRear(mb, -1.02, 0.85);
    fender(mb, { cx: o.xr, R, a0: 1.75, a1: 2.6, mat: 'plastico', w: 0.12, gap: 0.12 });
    // motor, balança, monoamortecedor, escapamento alto
    singleEngine(mb, { x: 0.04, y: 0.48, tilt: 0.2 });
    for (const s of [-1, 1]) bar(mb, 'aluminio', [[-0.12, 0.48, s * 0.09], [o.xr, R, s * 0.09]], 0.02, 6);
    bar(mb, 'metal', [[-0.22, 0.52, 0], [-0.32, 0.86, 0]], 0.03, 8);
    bar(mb, 'metal_escuro', [[0.16, 0.42, 0.08], [0.02, 0.3, 0.13], [-0.28, 0.58, 0.16], [-0.55, 0.82, 0.16]], 0.022);
    mb.add('aluminio', cylinder(0.045, 0.32, 12, { bevel: 0.012 }), m4chain(m4t(-0.68, 0.88, 0.16), m4rz(PI / 2 - 0.35)));
    for (const s of [-1, 1]) bar(mb, 'metal', [[0.0, 0.42, s * 0.12], [0.0, 0.42, s * 0.21]], 0.012, 6);
  },
});

// ---------------------------------------------------------------------------
// ESPORTIVA (estilo CBR): carenagem inteira, bolha, rabeta alta, rodas de liga de 3 braços
export const moto_esportiva = moto({
  slug: 'moto_esportiva', L: 2.08, W: 0.72, xf: 0.7, xr: -0.68, seat: [-0.26, 0.82],
  wheel: { R: 0.3, w: 0.13, rimR: 0.22, style: 'liga', spokes: 3, rimMat: 'aro_preto' },
  colors: { pintura: '#1f4fc4', pintura2: '#f2f2f2' },
  parts(mb, o) {
    const R = o.wheel.R, { gx, gy } = grips(o), head = [gx - 0.02, gy - 0.12];
    fork(mb, { ax: o.xf, R, head: [head[0] + 0.03, head[1] - 0.04], half: 0.085, r: 0.024, mat: 'metal', lower: 'aro_preto' });
    handlebar(mb, { head, gx, gy, half: GRIP.half - 0.02, mat: 'metal_escuro', rise: 0.01 });
    // carenagem: bico, laterais, bolha, faróis duplos
    mb.add('pintura', ellipsoid(0.32, 0.2, 0.22, 20, 10), m4t(0.56, 0.86, 0));
    mb.add('pintura2', ellipsoid(0.33, 0.12, 0.225, 18, 6, { th0: -0.5, th1: 0.15 }), m4t(0.53, 0.82, 0));
    mb.add('vidro_escuro', ellipsoid(0.19, 0.08, 0.15, 14, 6, { th0: 0 }), m4chain(m4t(0.62, 1.02, 0), m4rz(-0.45)));
    for (const s of [-1, 1]) {
      mb.add('farol', roundedBox(0.04, 0.045, 0.08, 0.018, 1), m4chain(m4t(0.86, 0.86, s * 0.07), m4ry(-s * 0.4)));
      mb.add('pintura', roundedBox(0.62, 0.34, 0.03, 0.05, 2), m4chain(m4t(0.26, 0.6, s * 0.17), m4ry(s * 0.06)));
      mb.add('pintura2', roundedBox(0.4, 0.06, 0.032, 0.02, 1), m4t(0.18, 0.55, s * 0.172));
      mb.add('preto', ellipsoid(0.035, 0.03, 0.05, 8, 5), m4t(0.66, 0.98, s * 0.25));        // espelhos na carenagem
    }
    mb.add('preto', roundedBox(0.6, 0.12, 0.3, 0.05, 2), m4t(0.15, 0.34, 0));                // barriga
    // tanque, banco, rabeta alta
    mb.add('pintura', ellipsoid(0.3, 0.14, 0.2, 18, 9), m4t(0.12, 0.92, 0));
    seatPad(mb, { x: -0.3, y: 0.86, len: 0.42, w: 0.24, h: 0.07 });
    mb.add('pintura', ellipsoid(0.36, 0.1, 0.12, 16, 8), m4chain(m4t(-0.68, 0.95, 0), m4rz(0.14)));
    mb.add('pintura2', ellipsoid(0.2, 0.05, 0.1, 12, 6, { th0: 0 }), m4chain(m4t(-0.62, 1.0, 0), m4rz(0.14)));
    tailLamp(mb, -1.02, 1.0, 0.1, 0.035);
    plateRear(mb, -0.98, 0.72);
    signals(mb, -0.96, 0.76, 0.12, -1);
    bar(mb, 'preto', [[-0.98, 0.95, 0], [-0.98, 0.72, 0]], 0.012, 4);
    fender(mb, { cx: o.xf, R, a0: 0.5, a1: 1.9, mat: 'pintura', w: 0.12, gap: 0.03 });
    // balança de alumínio e escapamento curto
    for (const s of [-1, 1]) bar(mb, 'aluminio', [[-0.08, 0.44, s * 0.1], [o.xr, R, s * 0.1]], 0.026, 6);
    bar(mb, 'metal_escuro', [[0.3, 0.3, 0.08], [0.0, 0.24, 0.12], [-0.3, 0.34, 0.16]], 0.024);
    mb.add('aluminio', cylinder(0.06, 0.3, 14, { bevel: 0.015 }), m4chain(m4t(-0.45, 0.42, 0.17), m4rz(PI / 2 - 0.25)));
    for (const s of [-1, 1]) bar(mb, 'metal', [[-0.14, 0.5, s * 0.12], [-0.14, 0.5, s * 0.19]], 0.012, 6);
  },
});

// ---------------------------------------------------------------------------
// CUSTOM DE VIAGEM (estilo Harley): baixa e comprida, garfo deitado, motor V2 cromado, alforjes, para-brisa e encosto
export const moto_custom = moto({
  slug: 'moto_custom', L: 2.45, W: 0.98, xf: 0.84, xr: -0.78, seat: [-0.24, 0.7],
  wheel: { R: 0.33, w: 0.13, rimR: 0.24, style: 'raios', rimMat: 'cromado' },
  colors: { pintura: '#151517', faixa: '#b3802b' },
  parts(mb, o) {
    const R = o.wheel.R, { gx, gy } = grips(o), head = [gx + 0.02, gy - 0.1];
    fork(mb, { ax: o.xf, R, head, half: 0.11, r: 0.027 });
    handlebar(mb, { head, gx: gx - 0.04, gy, half: GRIP.half + 0.06, rise: 0.04 });
    mirrors(mb, { gx: gx - 0.04, gy, half: GRIP.half, h: 0.18 });
    // farol grande cromado, piscas, para-brisa
    roundLamp(mb, { p: [head[0] + 0.15, head[1] - 0.08, 0], n: [1, 0, 0], r: 0.1, depth: 0.05 });
    mb.add('cromado', ellipsoid(0.11, 0.11, 0.11, 14, 8), m4t(head[0] + 0.07, head[1] - 0.08, 0));
    signals(mb, head[0] + 0.1, head[1] - 0.14, 0.2, 1);
    mb.add('vidro', roundedBox(0.02, 0.36, 0.46, 0.06, 2), m4chain(m4t(head[0] + 0.12, gy + 0.14, 0), m4rz(0.25)));
    // tanque gota, faixa, painel no tanque
    mb.add('pintura', ellipsoid(0.36, 0.14, 0.2, 20, 10), m4t(0.2, 0.86, 0));
    mb.add('faixa', ellipsoid(0.33, 0.05, 0.205, 18, 4, { th0: -0.18, th1: 0.18 }), m4t(0.2, 0.84, 0));
    mb.add('cromado', roundedBox(0.3, 0.025, 0.07, 0.01, 1), m4t(0.2, 0.99, 0));
    // banco de dois andares e encosto do garupa
    seatPad(mb, { x: -0.28, y: 0.71, len: 0.5, w: 0.34, h: 0.1 });
    seatPad(mb, { x: -0.66, y: 0.8, len: 0.3, w: 0.3, h: 0.09 });
    bar(mb, 'cromado', [[-0.82, 0.78, -0.13], [-0.88, 1.15, -0.1], [-0.88, 1.18, 0], [-0.88, 1.15, 0.1], [-0.82, 0.78, 0.13]], 0.014);
    mb.add('estofado_preto', roundedBox(0.06, 0.18, 0.22, 0.03, 2), m4t(-0.87, 1.04, 0));
    // para-lamas fundos, lanterna, placa
    fender(mb, { cx: o.xf, R, a0: 0.1, a1: 2.3, mat: 'pintura', w: 0.17, gap: 0.03 });
    fender(mb, { cx: o.xr, R, a0: 0.9, a1: 3.0, mat: 'pintura', w: 0.22, gap: 0.04 });
    tailLamp(mb, -1.17, 0.58, 0.1, 0.045);
    signals(mb, -1.12, 0.62, 0.17, -1);
    plateRear(mb, -1.18, 0.46);
    // alforjes
    for (const s of [-1, 1]) {
      mb.add('estofado_preto', roundedBox(0.5, 0.3, 0.16, 0.06, 2), m4t(-0.66, 0.6, s * 0.27));
      mb.add('cromado', roundedBox(0.04, 0.04, 0.02, 0.01, 1), m4t(-0.5, 0.68, s * 0.355));
    }
    // motor V2 cromado: cárter, dois cilindros em V com aletas, filtro de ar redondo
    mb.add('cromado', roundedBox(0.4, 0.22, 0.24, 0.07, 2), m4t(0.06, 0.36, 0));
    for (const [a, dx] of [[-0.38, 0.14], [0.38, -0.04]]) {
      const M = m4chain(m4t(0.06 + dx * 0.5, 0.47, 0), m4rz(a));
      for (let k = 0; k < 6; k++) mb.add('aluminio', roundedBox(0.17, 0.014, 0.17, 0.006, 1), m4chain(M, m4t(0, 0.03 + k * 0.035, 0)));
      mb.add('cromado', roundedBox(0.13, 0.08, 0.13, 0.03, 1), m4chain(M, m4t(0, 0.25, 0)));
    }
    mb.add('cromado', cylinder(0.1, 0.05, 18, { bevel: 0.015 }), m4chain(m4t(0.06, 0.58, 0.16), m4rx(PI / 2)));
    // quadro, balança, escapamentos duplos (direita) e plataformas
    bar(mb, 'metal_escuro', [[head[0], head[1] - 0.04, 0], [0.32, 0.56, 0], [0.3, 0.24, 0], [-0.2, 0.22, 0]], 0.026);
    for (const s of [-1, 1]) bar(mb, 'metal_escuro', [[-0.2, 0.3, s * 0.12], [o.xr, R, s * 0.12]], 0.024, 6);
    for (const [y0, k] of [[0.42, 0], [0.58, 1]]) {
      bar(mb, 'cromado', [[0.12 + k * 0.05, y0, 0.12], [0.02, 0.24 + k * 0.05, 0.2], [-0.4, 0.26 + k * 0.06, 0.25], [-1.05, 0.32 + k * 0.07, 0.25]], 0.028);
      mb.add('cromado', cylinder(0.04, 0.05, 12), m4chain(m4t(-1.06, 0.32 + k * 0.07, 0.25), m4rz(PI / 2)));
    }
    for (const s of [-1, 1]) mb.add('metal_escuro', roundedBox(0.28, 0.025, 0.12, 0.01, 1), m4t(0.32, 0.3, s * 0.26));
  },
});
