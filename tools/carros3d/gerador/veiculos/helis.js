// Helicópteros (estilo Bell 206 JetRanger): civil e da polícia (Águia). Peça por peça: cabine com a bolha de vidro, carenagem do
// motor, cone de cauda afinando, estabilizadores, deriva, esquis. Os ROTORES são nós à parte — "rotor_principal" (gira em volta de Y)
// e "rotor_cauda" (gira em volta do eixo lateral) — que o jogo gira no shader. Eixos do glTF: +X frente, +Y cima, +Z direita; chão
// (a base dos esquis) em y = 0.
import { m4t, m4chain, m4rx, m4ry, m4rz, lerp } from '../math.js';
import { roundedBox, cylinder, tube, ellipsoid, sweep, circle2 } from '../prims.js';
import { MeshBuilder } from '../mesh.js';
import { roundLamp } from '../parts.js';

const PI = Math.PI;
const bar = (mb, mat, pts, r = 0.03, seg = 8) => mb.add(mat, tube(pts, r, seg));

// Rotor principal: duas pás compridas, cubo e o "prato" (espaço local: o centro do cubo na origem)
function mainRotor(R = 5.1) {
  const mb = new MeshBuilder();
  mb.add('metal_escuro', cylinder(0.16, 0.16, 14, { bevel: 0.03 }));
  mb.add('metal', roundedBox(0.7, 0.08, 0.22, 0.03, 1));
  for (const s of [-1, 1]) {
    const len = R - 0.3;
    mb.add('preto', roundedBox(len, 0.035, 0.3, 0.015, 1), m4chain(m4ry(s > 0 ? 0 : PI), m4t(0.3 + len / 2, 0.02, 0), m4rx(0.06)));
    mb.add('plastico_cinza', roundedBox(0.25, 0.037, 0.3, 0.015, 1), m4chain(m4ry(s > 0 ? 0 : PI), m4t(R - 0.12, 0.02, 0), m4rx(0.06)));
  }
  return mb;
}
// Rotor de cauda: duas pás curtas (espaço local: eixo ao longo de Z)
function tailRotor(R = 0.8) {
  const mb = new MeshBuilder();
  mb.add('metal', cylinder(0.06, 0.08, 10, { bevel: 0.015 }), m4rx(PI / 2));
  for (const s of [-1, 1]) mb.add('preto', roundedBox(0.12, R, 0.02, 0.008, 1), m4t(0, s * (R / 2 + 0.03), 0));
  return mb;
}

function heli(o) {
  return {
    slug: o.slug, L: 9.6, W: 2.2, tipo: 'heli', heli: true, colors: o.colors, matOverrides: o.matOverrides || {},
    details(ctx) {
      const { mb } = ctx;
      // cabine: o corpo pintado e a bolha de vidro na frente
      mb.add('pintura', ellipsoid(1.45, 0.82, 0.72, 26, 14), m4t(0.35, 1.3, 0));
      mb.add('vidro', ellipsoid(0.92, 0.66, 0.66, 22, 12), m4chain(m4t(1.0, 1.42, 0), m4rz(-0.12)));
      mb.add('pintura', roundedBox(1.6, 0.3, 1.26, 0.14, 2), m4t(0.15, 0.78, 0));
      for (const s of [-1, 1]) {
        mb.add('vidro', roundedBox(0.6, 0.42, 0.02, 0.08, 2), m4t(-0.25, 1.45, s * 0.705));            // janelas de trás
        mb.add('metal_escuro', roundedBox(0.03, 0.55, 0.02, 0.01, 1), m4t(0.1, 1.38, s * 0.72));        // colunas das portas
      }
      // carenagem do motor e a entrada de ar, mastro do rotor
      mb.add('pintura', roundedBox(1.7, 0.42, 0.78, 0.16, 2), m4t(-0.35, 2.12, 0));
      mb.add('pintura2', roundedBox(1.72, 0.08, 0.8, 0.03, 1), m4t(-0.35, 1.92, 0));
      mb.add('preto', roundedBox(0.2, 0.18, 0.6, 0.06, 1), m4t(0.48, 2.12, 0));
      mb.add('metal_escuro', cylinder(0.1, 0.36, 12), m4t(0.05, 2.48, 0));
      mb.add('metal_escuro', cylinder(0.14, 0.12, 12), m4t(-1.2, 2.25, 0));                         // escape
      // cone de cauda afinando, estabilizador horizontal e deriva
      const path = [], scales = [];
      for (let k = 0; k <= 8; k++) { const t = k / 8; path.push([lerp(-0.9, -5.0, t), lerp(1.75, 1.95, t), 0]); scales.push(lerp(1, 0.38, t)); }
      mb.add('pintura', sweep(path, circle2(0.3, 14), { scales, up: [0, 1, 0] }));
      mb.add('pintura', roundedBox(0.5, 0.05, 2.0, 0.02, 1), m4t(-4.1, 1.85, 0));
      for (const s of [-1, 1]) mb.add('pintura', roundedBox(0.35, 0.3, 0.04, 0.03, 1), m4t(-4.1, 1.92, s * 1.0));
      mb.add('pintura', roundedBox(0.75, 1.0, 0.07, 0.05, 2), m4chain(m4t(-5.05, 2.25, 0), m4rz(-0.45)));
      mb.add('pintura', roundedBox(0.5, 0.45, 0.06, 0.05, 2), m4chain(m4t(-5.0, 1.65, 0), m4rz(0.5)));
      mb.add('metal_escuro', cylinder(0.05, 0.25, 8), m4chain(m4t(-5.12, 2.0, -0.12), m4rx(PI / 2)));
      // esquis
      for (const s of [-1, 1]) {
        bar(mb, 'metal', [[-1.4, 0.06, s * 1.05], [1.2, 0.06, s * 1.05], [1.5, 0.12, s * 1.05], [1.62, 0.3, s * 1.05]], 0.045);
        for (const x of [0.75, -0.75]) bar(mb, 'metal', [[x, 0.06, s * 1.05], [x + 0.05, 0.45, s * 0.85], [x + 0.08, 0.62, s * 0.5]], 0.04);
      }
      // luzes: farol de pouso embaixo do nariz, navegação nas pontas do estabilizador, pisca no topo da deriva
      roundLamp(mb, { p: [1.55, 0.95, 0], n: [0.8, -0.6, 0], r: 0.09 });
      mb.add('luz_vermelha', ellipsoid(0.05, 0.04, 0.05, 8, 5), m4t(-4.1, 1.88, -1.03));
      mb.add('luz_verde', ellipsoid(0.05, 0.04, 0.05, 8, 5), m4t(-4.1, 1.88, 1.03));
      mb.add('lanterna', ellipsoid(0.05, 0.05, 0.05, 8, 5), m4t(-5.25, 2.72, 0));
      if (o.police) o.police(mb);
      // rotores (nós à parte, girados pelo jogo)
      ctx.parts.push({ name: 'rotor_principal', matrix: m4t(0.05, 2.7, 0), extras: { tipo: 'rotor', eixo: 'y' }, children: [{ name: 'rotor_principal_malha', mesh: mainRotor(5.1).build() }] });
      ctx.parts.push({ name: 'rotor_cauda', matrix: m4t(-5.12, 2.0, -0.26), extras: { tipo: 'rotor', eixo: 'z' }, children: [{ name: 'rotor_cauda_malha', mesh: tailRotor(0.8).build() }] });
    },
  };
}

export const heli_civil = heli({ slug: 'heli', colors: { pintura: '#e9e9e4', pintura2: '#1f4fc4' } });

// Polícia: azul-escuro com faixa branca, "ÁGUIA", giroflex e o holofote de busca embaixo
export const heli_policia = heli({
  slug: 'heli_policia', colors: { pintura: '#16243f', pintura2: '#f1f1ee' },
  police(mb) {
    for (const s of [-1, 1]) mb.add('decal_branco', roundedBox(1.2, 0.08, 0.02, 0.02, 1), m4t(-0.2, 1.2, s * 0.73));
    mb.add('giroflex_vermelho', roundedBox(0.16, 0.08, 0.16, 0.03, 1), m4t(-0.9, 2.4, -0.18));
    mb.add('giroflex_azul', roundedBox(0.16, 0.08, 0.16, 0.03, 1), m4t(-0.9, 2.4, 0.18));
    mb.add('metal_escuro', cylinder(0.13, 0.2, 12, { bevel: 0.03 }), m4t(0.9, 0.62, 0.5));
    roundLamp(mb, { p: [1.02, 0.6, 0.5], n: [0.7, -0.7, 0], r: 0.1 });
  },
});
