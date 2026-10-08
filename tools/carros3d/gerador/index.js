// API pública do gerador de veículos 3D
import { SPECS } from './catalog.js';
import { INFO, INFO_BY_SLUG, CATEGORIAS } from './info.js';
import { buildVehicle } from './car.js';
import { toGLB, fromGLB } from './glb.js';
import { hex, toHex } from './math.js';

export { INFO, CATEGORIAS, toGLB, fromGLB };
export const SLUGS = INFO.map((i) => i.slug);

const same = (a, b) => a && b && Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-6;

export function corPadrao(slug) {
  const s = SPECS[slug];
  const key = s.paintKey || 'pintura';
  return (s.colors && s.colors[key]) || '#888888';
}

// cria o modelo (árvore de nós + materiais). opcoes: { cor, corTeto, detalhe }
export function criarVeiculo(slug, opcoes = {}) {
  const spec = SPECS[slug];
  if (!spec) throw new Error('Veículo desconhecido: ' + slug);
  const info = INFO_BY_SLUG[slug];
  const built = buildVehicle(spec, { detalhe: opcoes.detalhe ?? 1 });
  const mats = built.materials;
  const key = spec.paintKey || 'pintura';
  if (opcoes.cor && !info.pinturaFixa && mats[key]) {
    const orig = mats[key].color;
    const c = hex(opcoes.cor);
    if (mats.teto && same(mats.teto.color, orig)) mats.teto.color = c;
    mats[key].color = c;
  }
  if (opcoes.corTeto && mats.teto) mats.teto.color = hex(opcoes.corTeto);
  // limites
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  const mul = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
  const walk = (n, P) => {
    const W = n.matrix ? mul(P, n.matrix) : P;
    for (const p of n.mesh || []) {
      const a = p.positions;
      for (let i = 0; i < a.length; i += 3) {
        const x = W[0] * a[i] + W[4] * a[i + 1] + W[8] * a[i + 2] + W[12];
        const y = W[1] * a[i] + W[5] * a[i + 1] + W[9] * a[i + 2] + W[13];
        const z = W[2] * a[i] + W[6] * a[i + 1] + W[10] * a[i + 2] + W[14];
        if (x < mn[0]) mn[0] = x; if (y < mn[1]) mn[1] = y; if (z < mn[2]) mn[2] = z;
        if (x > mx[0]) mx[0] = x; if (y > mx[1]) mx[1] = y; if (z > mx[2]) mx[2] = z;
      }
    }
    for (const c of n.children || []) walk(c, W);
  };
  walk(built.root, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  let tris = 0;
  const cnt = (n) => { for (const p of n.mesh || []) tris += p.indices.length / 3; (n.children || []).forEach(cnt); };
  cnt(built.root);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  built.root.extras = {
    nome: info.nome,
    categoria: info.categoria,
    comprimentoCatalogo: info.comprimento,
    larguraCatalogo: info.largura,
    limitesMin: mn.map(r3),
    limitesMax: mx.map(r3),
    altura: r3(mx[1] - Math.max(0, mn[1])),
    unidade: 'metro',
    frente: '+X',
    cima: '+Y',
    origem: info.barco ? 'centro do casco na linha d\'água (y = 0)' : 'centro da área ocupada, no chão (y = 0)',
    pinturaFixa: info.pinturaFixa,
    corPintura: toHex(mats[key]?.color || [0.5, 0.5, 0.5]),
    materialPintura: key,
    triangulos: tris,
  };
  return { root: built.root, materials: mats, info, bounds: { min: mn, max: mx }, tris };
}

export function exportarGLB(slug, opcoes = {}) {
  return toGLB(criarVeiculo(slug, opcoes), opcoes);
}
