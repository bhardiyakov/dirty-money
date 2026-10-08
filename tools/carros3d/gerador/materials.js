// Biblioteca de materiais (PBR metálico-rugoso). Cores em sRGB.
import { hex } from './math.js';

const BASE = {
  pintura: { color: '#b01820', metal: 0.25, rough: 0.4, clearcoat: 0.7 },
  teto: { color: '#b01820', metal: 0.25, rough: 0.4, clearcoat: 0.7 },
  pintura2: { color: '#ffffff', metal: 0.2, rough: 0.4, clearcoat: 1 },
  faixa: { color: '#f2f2f2', metal: 0.15, rough: 0.4, clearcoat: 1 },
  vidro: { color: '#1b2430', metal: 0.0, rough: 0.04, clearcoat: 0 },
  vidro_escuro: { color: '#0d1117', metal: 0.0, rough: 0.05 },
  borracha: { color: '#0f1012', metal: 0, rough: 0.85 },
  preto: { color: '#101113', metal: 0.1, rough: 0.28, clearcoat: 0.6 },
  plastico: { color: '#1d1e21', metal: 0, rough: 0.72 },
  plastico_cinza: { color: '#4a4d52', metal: 0, rough: 0.7 },
  chassi: { color: '#141416', metal: 0, rough: 0.9 },
  grade: { color: '#0b0c0d', metal: 0.2, rough: 0.55 },
  cromado: { color: '#eef1f4', metal: 1, rough: 0.1 },
  aluminio: { color: '#c3c7cc', metal: 1, rough: 0.27 },
  aro_escuro: { color: '#2b2e33', metal: 0.7, rough: 0.38 },
  aro_preto: { color: '#16171a', metal: 0.5, rough: 0.35 },
  aro_aco: { color: '#7d8188', metal: 0.6, rough: 0.45 },
  pneu: { color: '#1b1b1c', metal: 0, rough: 0.9 },
  pneu_faixa: { color: '#e8e6df', metal: 0, rough: 0.7 },
  freio: { color: '#5a5d61', metal: 0.8, rough: 0.45 },
  pinca: { color: '#c0161c', metal: 0.2, rough: 0.35 },
  farol: { color: '#e7eef5', metal: 0, rough: 0.06, emissive: '#fff6df', emissiveStrength: 0, lightKind: 'farol', lit: 3.2 },
  farol_refletor: { color: '#d9dde2', metal: 1, rough: 0.15 },
  drl: { color: '#f4f8ff', metal: 0, rough: 0.1, emissive: '#eef4ff', emissiveStrength: 0, lightKind: 'farol', lit: 2.5 },
  lanterna: { color: '#e01a24', metal: 0.1, rough: 0.08, emissive: '#ff1a1a', emissiveStrength: 0, lightKind: 'lanterna', lit: 1.2, brake: 3.5 },
  lanterna_escura: { color: '#3a0a0e', metal: 0, rough: 0.12, emissive: '#ff1a1a', emissiveStrength: 0, lightKind: 'lanterna', lit: 1.2, brake: 3.5 },
  pisca: { color: '#e08214', metal: 0, rough: 0.12, emissive: '#ffa21a', emissiveStrength: 0, lightKind: 'pisca', lit: 3 },
  re: { color: '#e9ecef', metal: 0, rough: 0.1, emissive: '#ffffff', emissiveStrength: 0, lightKind: 're', lit: 2.5 },
  placa: { color: '#eeeeee', metal: 0, rough: 0.45 },
  placa_azul: { color: '#1b4aa0', metal: 0, rough: 0.45 },
  placa_letra: { color: '#1a1a1a', metal: 0, rough: 0.5 },
  giroflex_vermelho: { color: '#c5121c', metal: 0, rough: 0.1, emissive: '#ff2020', emissiveStrength: 0, lightKind: 'giroflex', lit: 4 },
  giroflex_azul: { color: '#1442c8', metal: 0, rough: 0.1, emissive: '#2a5bff', emissiveStrength: 0, lightKind: 'giroflex', lit: 4 },
  decal: { color: '#1b2d6b', metal: 0, rough: 0.4 },
  decal2: { color: '#c8141e', metal: 0, rough: 0.4 },
  decal_branco: { color: '#f1f1ee', metal: 0, rough: 0.45 },
  madeira: { color: '#c8ab7c', metal: 0, rough: 0.75 },
  madeira_junta: { color: '#8b7350', metal: 0, rough: 0.8 },
  lona: { color: '#4b5530', metal: 0, rough: 0.95 },
  estofado: { color: '#e9e2cc', metal: 0, rough: 0.82 },
  estofado2: { color: '#d8cfb4', metal: 0, rough: 0.85 },
  estofado_preto: { color: '#202124', metal: 0, rough: 0.8 },
  casco: { color: '#f3f4f5', metal: 0.05, rough: 0.3, clearcoat: 0.8 },
  casco2: { color: '#1d3f7a', metal: 0.1, rough: 0.35, clearcoat: 0.8 },
  deck: { color: '#efe7d2', metal: 0, rough: 0.6 },
  antiderrapante: { color: '#e4dbc2', metal: 0, rough: 0.9 },
  boia: { color: '#f06a12', metal: 0, rough: 0.6 },
  verde: { color: '#2f6b55', metal: 0, rough: 0.7 },
  motor: { color: '#1d2b4a', metal: 0.3, rough: 0.35, clearcoat: 0.8 },
  luz_verde: { color: '#18a33a', metal: 0, rough: 0.1, emissive: '#30ff60', emissiveStrength: 0, lightKind: 'navegacao', lit: 3 },
  luz_vermelha: { color: '#c0141c', metal: 0, rough: 0.1, emissive: '#ff2020', emissiveStrength: 0, lightKind: 'navegacao', lit: 3 },
  luz_branca: { color: '#f2f2f2', metal: 0, rough: 0.1, emissive: '#ffffff', emissiveStrength: 0, lightKind: 'navegacao', lit: 3 },
  espelho: { color: '#9aa6b2', metal: 1, rough: 0.05 },
  metal_escuro: { color: '#33363b', metal: 0.8, rough: 0.4 },
  metal: { color: '#8d939b', metal: 0.9, rough: 0.35 },
  corda: { color: '#e8e2d0', metal: 0, rough: 0.9 },
};

export function materialSet(colors = {}, overrides = {}) {
  const out = {};
  for (const [k, v] of Object.entries(BASE)) out[k] = { ...v, name: k, color: hex(v.color), emissive: v.emissive ? hex(v.emissive) : null };
  for (const [k, c] of Object.entries(colors)) {
    if (!out[k]) out[k] = { ...BASE.pintura, name: k };
    out[k] = { ...out[k], color: hex(c) };
  }
  for (const [k, o] of Object.entries(overrides)) {
    out[k] = { ...(out[k] || { name: k }), ...o, name: k };
    if (o.color) out[k].color = hex(o.color);
    if (o.emissive) out[k].emissive = hex(o.emissive);
  }
  return out;
}

export const MATERIAL_NAMES = Object.keys(BASE);
