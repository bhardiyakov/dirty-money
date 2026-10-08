// ============================================================================
// Carros 3D — converte os veículos do gerador procedural (./gerador, o mesmo do pacote "veiculos3d") no arquivo que o jogo lê:
// assets/cars/carros3d.js (CAR3D), carregado como <script> (funciona em file://, como o atlas 2D).
//
// Por modelo: a CARROCERIA (malha única, todos os materiais) e UMA roda (gabarito do lado direito, centrada no cubo) + os 4 centros
// das rodas — o jogo replica a roda nos 4 cantos e gira/esterça cada uma no shader (CarArt3D). Eixos do JOGO (não os do glTF):
// +X = lado direito do carro, +Y = cima, +Z = frente; origem no chão, no centro da área ocupada; metros REAIS (o jogo aplica
// Config.vehicle.scale). Materiais viram uma tabela por modelo (cor sRGB, rugosidade, metal, verniz e o "tipo" que o shader usa:
// pintura, pintura 2, vidro, metal, pneu, faróis, lanternas, setas, ré, giroflex, luminoso).
//
// Binário (comprimido em zlib, base64 no .js), por modelo, cada seção alinhada em 4 bytes:
//   corpo: posições Int16×3 (÷ q) | normais Int8×3 (÷ 127) | material Uint8 | índices Uint16/Uint32
//   roda:  o mesmo, com as posições relativas ao centro do cubo
// ============================================================================
import { SLUGS, INFO, criarVeiculo } from './gerador/index.js';
import { hex } from './gerador/math.js';
import { simplify } from './simplify.js';
import { STAMP } from './gerador/stamp.js';

export const KIND = { generic: 0, paint: 1, paint2: 2, glass: 3, metal: 4, tire: 5, head: 6, tail: 7, signal: 8, reverse: 9, sirenB: 10, sirenR: 11, sign: 12 };

// Modelos que usam a PINTURA 2 da tabela do jogo (CarSheet.PAINTS[].paint2) — os mesmos marcados com p2 no atlas 2D: teto de outra
// cor, faixas. Nos outros, o teto da mesma cor da pintura segue a pintura e o de outra cor fica fixo (teto preto dos SUVs).
const P2 = new Set(['mini_eletrico', 'sedan_70', 'esportivo', 'muscle', 'kombi']);
const METAL = new Set(['cromado', 'aluminio', 'espelho', 'farol_refletor', 'metal', 'metal_escuro', 'aro_aco', 'aro_escuro', 'aro_preto', 'freio']);

function kindOf(slug, name, mats, fixed) {
  const same = (a, b) => a && b && Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-3;
  switch (name) {
    case 'pintura': return fixed ? KIND.generic : KIND.paint;
    case 'teto': return fixed ? KIND.generic : P2.has(slug) ? KIND.paint2 : same(mats.teto.color, mats.pintura.color) ? KIND.paint : KIND.generic;
    case 'faixa': case 'pintura2': return !fixed && P2.has(slug) ? KIND.paint2 : KIND.generic;
    case 'vidro': case 'vidro_escuro': return KIND.glass;
    case 'pneu': return KIND.tire;
    case 'farol': case 'drl': return KIND.head;
    case 'lanterna': case 'lanterna_escura': return KIND.tail;
    case 'pisca': return KIND.signal;
    case 're': return KIND.reverse;
    case 'giroflex_azul': return KIND.sirenB;
    case 'giroflex_vermelho': return KIND.sirenR;
    case 'luminoso': return KIND.sign;
  }
  return METAL.has(name) ? KIND.metal : KIND.generic;
}

// Primitivas de um nó (com a matriz acumulada) — o gerador só usa translações e giros de 180° nas rodas.
function collect(node, M, out) {
  const W = node.matrix ? mul(M, node.matrix) : M;
  if (node.mesh) for (const p of node.mesh) out.push({ prim: p, M: W });
  for (const c of node.children || []) collect(c, W, out);
  return out;
}
function mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

// Junta primitivas (glTF: +X frente, +Z direita) numa malha nos eixos do jogo (+X direita, +Z frente): troca x↔z. A troca é uma
// reflexão — e é ela que leva do glTF (destro, face da frente anti-horária) ao Babylon (canhoto, face da frente horária): a ordem
// dos índices fica como está. `origin` (eixos do glTF) é subtraída.
function merge(list, matIndex, origin = [0, 0, 0]) {
  let nv = 0, ni = 0;
  for (const { prim } of list) { nv += prim.positions.length / 3; ni += prim.indices.length; }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), Mt = new Uint8Array(nv), Ix = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let v = 0, t = 0;
  for (const { prim, M } of list) {
    const p = prim.positions, n = prim.normals, base = v, mi = matIndex(prim.material);
    for (let i = 0; i < p.length; i += 3, v++) {
      const x = M[0] * p[i] + M[4] * p[i + 1] + M[8] * p[i + 2] + M[12] - origin[0];
      const y = M[1] * p[i] + M[5] * p[i + 1] + M[9] * p[i + 2] + M[13] - origin[1];
      const z = M[2] * p[i] + M[6] * p[i + 1] + M[10] * p[i + 2] + M[14] - origin[2];
      let nx = M[0] * n[i] + M[4] * n[i + 1] + M[8] * n[i + 2], ny = M[1] * n[i] + M[5] * n[i + 1] + M[9] * n[i + 2], nz = M[2] * n[i] + M[6] * n[i + 1] + M[10] * n[i + 2];
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      P[v * 3] = z; P[v * 3 + 1] = y; P[v * 3 + 2] = x;
      N[v * 3] = nz; N[v * 3 + 1] = ny; N[v * 3 + 2] = nx;
      Mt[v] = mi;
    }
    const ix = prim.indices;
    for (let k = 0; k < ix.length; k++) Ix[t++] = base + ix[k];
  }
  return { P, N, Mt, Ix, nv, ni };
}

// Só o que a câmera do JOGO pode ver: ela olha de cima (no máximo ~25° da vertical nas bordas da tela afastada, mais o balanço
// da carroceria), em qualquer rumo do carro. Rasteriza a malha (só as faces viradas para a câmera, com profundidade) de várias
// direções dentro desse cone e fica só com os triângulos que aparecem em alguma — o fundo do chassi, o interior e as peças
// escondidas sob a carroceria saem. Triângulo menor que um pixel conta como visível se estiver na superfície da frente.
const VIEW_CONE = [[0, 1], [13, 8], [24, 12], [31, 12]];      // [ângulo da vertical (°), quantas direções em volta]
function visibleFromAbove(mesh, res = 0.012) {
  const { P, N, Ix } = mesh, nt = Ix.length / 3, vis = new Uint8Array(nt);
  const fn = new Float32Array(nt * 3);
  for (let t = 0; t < nt; t++) {
    const a = Ix[t * 3], b = Ix[t * 3 + 1], c = Ix[t * 3 + 2];
    let x = N[a * 3] + N[b * 3] + N[c * 3], y = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], z = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
    const l = Math.hypot(x, y, z) || 1; fn[t * 3] = x / l; fn[t * 3 + 1] = y / l; fn[t * 3 + 2] = z / l;
  }
  const nv = P.length / 3, pu = new Float32Array(nv), pv = new Float32Array(nv), pd = new Float32Array(nv);
  for (const [deg, n] of VIEW_CONE) for (let k = 0; k < n; k++) {
    const th = (deg * Math.PI) / 180, ph = (k / n) * Math.PI * 2 + deg * 0.01;
    const w = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];          // do carro PARA a câmera
    let u = Math.abs(w[1]) < 0.99 ? [w[2], 0, -w[0]] : [1, 0, 0];
    const ul = Math.hypot(u[0], u[1], u[2]); u = u.map((x) => x / ul);
    const v = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < nv; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      pu[i] = x * u[0] + y * u[1] + z * u[2]; pv[i] = x * v[0] + y * v[1] + z * v[2]; pd[i] = x * w[0] + y * w[1] + z * w[2];
      u0 = Math.min(u0, pu[i]); u1 = Math.max(u1, pu[i]); v0 = Math.min(v0, pv[i]); v1 = Math.max(v1, pv[i]);
    }
    const W = Math.ceil((u1 - u0) / res) + 2, H = Math.ceil((v1 - v0) / res) + 2;
    const zb = new Float32Array(W * H).fill(-Infinity), id = new Int32Array(W * H).fill(-1);
    const sx = (i) => (pu[i] - u0) / res, sy = (i) => (pv[i] - v0) / res;
    for (let t = 0; t < nt; t++) {
      if (fn[t * 3] * w[0] + fn[t * 3 + 1] * w[1] + fn[t * 3 + 2] * w[2] <= 0.0) continue;       // de costas (o jogo não desenha)
      const a = Ix[t * 3], b = Ix[t * 3 + 1], c = Ix[t * 3 + 2];
      const ax = sx(a), ay = sy(a), bx = sx(b), by = sy(b), cx = sx(c), cy = sy(c);
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(area) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area, w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area, w2 = 1 - w0 - w1;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
        const d = w0 * pd[a] + w1 * pd[b] + w2 * pd[c], o = y * W + x;
        if (d > zb[o]) { zb[o] = d; id[o] = t; }
      }
    }
    for (let o = 0; o < id.length; o++) if (id[o] >= 0) vis[id[o]] = 1;
    // triângulos pequenos demais para cobrir um centro de pixel: visíveis se estão na camada da frente
    for (let t = 0; t < nt; t++) {
      if (vis[t] || fn[t * 3] * w[0] + fn[t * 3 + 1] * w[1] + fn[t * 3 + 2] * w[2] <= 0.0) continue;
      const a = Ix[t * 3], b = Ix[t * 3 + 1], c = Ix[t * 3 + 2];
      const x = Math.floor((sx(a) + sx(b) + sx(c)) / 3), y = Math.floor((sy(a) + sy(b) + sy(c)) / 3);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if ((pd[a] + pd[b] + pd[c]) / 3 >= zb[y * W + x] - 0.004) vis[t] = 1;
    }
  }
  return compact(mesh, (t) => vis[t]);
}

// Roda: gira e esterça, então "o que aparece" não depende da posição — sai só o que fica sempre do lado de dentro (face virada
// para o carro, freio, pinça e o tambor/fundo do aro). Gabarito = roda DIREITA: +X é o lado de fora.
const WHEEL_HIDDEN = new Set(['freio', 'pinca', 'aro_escuro']);
function wheelOutside(mesh, mats) {
  const { N, Ix } = mesh;
  return compact(mesh, (t) => {
    const a = Ix[t * 3], b = Ix[t * 3 + 1], c = Ix[t * 3 + 2];
    if (WHEEL_HIDDEN.has(mats[mesh.Mt[a]].n)) return false;
    return N[a * 3] + N[b * 3] + N[c * 3] > -0.9;                     // (média das normais em x > -0,3: não está virado para dentro)
  });
}

// Fica com os triângulos keep(t) e com os vértices que eles usam.
function compact(mesh, keep) {
  const { P, N, Mt, Ix } = mesh, nt = Ix.length / 3, map = new Int32Array(mesh.nv).fill(-1);
  const out = [];
  let nv = 0;
  for (let t = 0; t < nt; t++) if (keep(t)) for (let k = 0; k < 3; k++) { const i = Ix[t * 3 + k]; if (map[i] < 0) map[i] = nv++; out.push(map[i]); }
  const P2 = new Float32Array(nv * 3), N2 = new Float32Array(nv * 3), M2 = new Uint8Array(nv);
  for (let i = 0; i < mesh.nv; i++) if (map[i] >= 0) { const j = map[i]; P2.set(P.subarray(i * 3, i * 3 + 3), j * 3); N2.set(N.subarray(i * 3, i * 3 + 3), j * 3); M2[j] = Mt[i]; }
  return { P: P2, N: N2, Mt: M2, Ix: nv > 65535 ? new Uint32Array(out) : new Uint16Array(out), nv, ni: out.length };
}

// Escreve uma malha nas seções do binário. q = escala da quantização das posições (m por unidade de Int16).
function pack(chunks, mesh, q) {
  const pad = () => { const n = chunks.size % 4; if (n) chunks.push(new Uint8Array(4 - n)); };
  const at = chunks.size;
  const pos = new Int16Array(mesh.nv * 3);
  for (let i = 0; i < pos.length; i++) pos[i] = Math.max(-32767, Math.min(32767, Math.round(mesh.P[i] / q)));
  const nor = new Int8Array(mesh.nv * 3);
  for (let i = 0; i < nor.length; i++) nor[i] = Math.max(-127, Math.min(127, Math.round(mesh.N[i] * 127)));
  chunks.push(new Uint8Array(pos.buffer)); pad();
  chunks.push(new Uint8Array(nor.buffer)); pad();
  chunks.push(mesh.Mt); pad();
  chunks.push(new Uint8Array(mesh.Ix.buffer, mesh.Ix.byteOffset, mesh.Ix.byteLength)); pad();
  return { at, nv: mesh.nv, ni: mesh.ni, i32: mesh.Ix instanceof Uint32Array };
}

class Chunks { constructor() { this.list = []; this.size = 0; } push(u8) { this.list.push(u8); this.size += u8.byteLength; } bytes() { const o = new Uint8Array(this.size); let p = 0; for (const u of this.list) { o.set(u, p); p += u.byteLength; } return o; } }

// Gera um modelo (slug) e escreve no binário. Devolve os metadados. Opções: detail = nível de detalhe do gerador, maxErr = tolerância
// da simplificação (m; 0 = sem), topOnly = só o que a câmera de cima vê.
export function buildModel(slug, chunks, { detail = 0.3, maxErr = 0.004, topOnly = true } = {}) {
  STAMP.tag = true;                                         // estampas marcadas com '@e' (ver gerador/stamp.js)
  let v;
  try { v = criarVeiculo(slug, { detalhe: detail }); } finally { STAMP.tag = false; }
  const done = new Map(), simp = (list) => (maxErr > 0 ? list.map(({ prim, M }) => ({ prim: done.get(prim) || done.set(prim, simplify(prim, maxErr)).get(prim), M })) : list);
  const info = INFO.find((i) => i.slug === slug);
  const fixed = !!info.pinturaFixa;
  const mats = v.materials, used = [], index = new Map();
  // s = 1: geometria ESTAMPADA sobre a lataria (o jogo dá a ela uma vantagem de profundidade: nunca afunda na superfície de baixo)
  const matIndex = (key) => {
    if (index.has(key)) return index.get(key);
    const s = key.endsWith('@e') ? 1 : 0, name = s ? key.slice(0, -2) : key;
    const m = mats[name] || { color: [1, 0, 1] };
    const r3 = (x) => Math.round(x * 1000) / 1000;
    used.push({ n: name, s, c: m.color.map(r3), r: r3(m.rough ?? 0.5), m: r3(m.metal ?? 0), cc: r3(m.clearcoat ?? 0), k: kindOf(slug, name, mats, fixed), e: m.emissive ? m.emissive.map(r3) : null });
    index.set(key, used.length - 1);
    return used.length - 1;
  };
  const root = v.root;
  const body = collect({ children: root.children.filter((c) => !c.name.startsWith('roda_')) }, I4, []);
  const wheels = root.children.filter((c) => c.name.startsWith('roda_'));
  const full = merge(simp(body), matIndex);
  // a simplificação mexe até maxErr na lataria e na estampa: a estampa sobe esse tanto a mais (some um eventual "afundar")
  for (let i = 0; i < full.nv; i++) if (used[full.Mt[i]].s) for (let k = 0; k < 3; k++) full.P[i * 3 + k] += full.N[i * 3 + k] * maxErr;
  const bodyMesh = topOnly ? visibleFromAbove(full) : full;
  let wheelMesh = null, centers = [], R = 0, W = 0;
  if (wheels.length) {
    // gabarito: a roda dianteira DIREITA, sem a translação do cubo (o malha da direita não tem o giro de 180° da esquerda)
    const fr = wheels.find((w) => w.name === 'roda_dd') || wheels[0];
    const t = [fr.matrix[12], fr.matrix[13], fr.matrix[14]];
    wheelMesh = merge(simp(collect(fr, I4, [])), matIndex, t);
    if (topOnly) wheelMesh = wheelOutside(wheelMesh, used);
    R = fr.extras.raio;
    for (let i = 0; i < wheelMesh.nv; i++) W = Math.max(W, Math.abs(wheelMesh.P[i * 3]));
    // centros nos eixos do jogo: [x (direita), y, z (frente), front?1:0, right?1:0]
    for (const w of wheels) centers.push([w.matrix[14], w.matrix[13], w.matrix[12], w.extras.eixo === 'dianteiro' ? 1 : 0, w.extras.lado === 'direito' ? 1 : 0].map((x) => Math.round(x * 1000) / 1000));
  }
  let ext = 0;
  for (const m of [bodyMesh, wheelMesh]) if (m) for (let i = 0; i < m.P.length; i++) ext = Math.max(ext, Math.abs(m.P[i]));
  const q = (ext + 0.01) / 32767;
  const b = pack(chunks, bodyMesh, q);
  const w = wheelMesh ? pack(chunks, wheelMesh, q) : null;
  // medidas (eixos do jogo): limites da carroceria, altura, teto
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < full.P.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], full.P[i + k]); mx[k] = Math.max(mx[k], full.P[i + k]); }
  const r3 = (x) => Math.round(x * 1000) / 1000;
  return {
    meta: {
      name: info.nome, fixed, q, mats: used, body: b, wheel: w, wheels: centers, R: r3(R), tw: r3(W * 2),
      min: mn.map(r3), max: mx.map(r3), len: r3(mx[2] - mn[2]), wid: r3(info.largura), h: r3(mx[1]),
    },
    tris: (bodyMesh.ni + (wheelMesh ? wheelMesh.ni * centers.length : 0)) / 3,
    verts: bodyMesh.nv + (wheelMesh ? wheelMesh.nv * centers.length : 0),
  };
}

export const WHEELED = SLUGS.filter((s) => !INFO.find((i) => i.slug === s).barco);

// Todos os modelos de rodas → { models, bytes (sem comprimir), stats }.
export function buildAll(opts, onProgress = null) {
  const chunks = new Chunks(), models = {}, stats = [];
  for (const slug of WHEELED) {
    const t0 = performance.now();
    const r = buildModel(slug, chunks, opts);
    models[slug] = r.meta;
    stats.push({ slug, tris: r.tris, verts: r.verts, ms: Math.round(performance.now() - t0) });
    if (onProgress) onProgress(slug, stats.length, WHEELED.length);
  }
  return { models, bytes: chunks.bytes(), stats };
}

// Comprime (zlib, nativo do navegador) e monta o texto do assets/cars/carros3d.js.
export async function toScript(result, opts) {
  const detail = opts.detail;
  const z = new Uint8Array(await new Response(new Blob([result.bytes]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  let s = '';
  for (let i = 0; i < z.length; i += 0x8000) s += String.fromCharCode.apply(null, z.subarray(i, i + 0x8000));
  const tris = result.stats.reduce((a, b) => a + b.tris, 0);
  const head = `// ============================================================================
// GERADO por tools/carros3d/index.html (gerador procedural de veículos 3D) — não edite à mão: mude o gerador e gere de novo.
// ${Object.keys(result.models).length} carros em 3D (carroceria + roda), detalhe ${detail}, simplificação ${opts.maxErr * 1000} mm, ${tris} triângulos no total; ${(result.bytes.length / 1048576).toFixed(2)} MB sem comprimir.
// Eixos do jogo: +X direita, +Y cima, +Z frente; metros reais (o jogo aplica Config.vehicle.scale). Lido por src/art/CarArt3D.js.
// ============================================================================
`;
  return { text: head + 'var CAR3D = ' + JSON.stringify({ version: 1, detail, maxErr: opts.maxErr, raw: result.bytes.length, models: result.models, z: btoa(s) }) + ';\n', zBytes: z.length };
}

export { hex };
