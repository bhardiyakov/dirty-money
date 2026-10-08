// Exportador glTF 2.0 binário (.glb) sem dependências
import { srgbToLinear } from './math.js';

const lin3 = (c) => [srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])];
const r6 = (v) => Math.round(v * 1e6) / 1e6;

function isTranslationOnly(m) {
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
  for (let i = 0; i < 12; i++) if (Math.abs(m[i] - I[i]) > 1e-9) return false;
  return Math.abs(m[15] - 1) < 1e-9;
}

export function toGLB(model, opts = {}) {
  const json = {
    asset: { version: '2.0', generator: 'veiculos3d — gerador procedural de veículos' },
    scene: 0,
    scenes: [{ name: model.root.name, nodes: [0] }],
    nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [],
  };
  const extUsed = new Set();
  const parts = [];
  let offset = 0;
  const addView = (typed, target) => {
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { parts.push(new Uint8Array(pad)); offset += pad; }
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    parts.push(bytes);
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
    offset += bytes.byteLength;
    return json.bufferViews.length - 1;
  };
  const matIdx = new Map();
  const getMat = (key) => {
    if (matIdx.has(key)) return matIdx.get(key);
    const m = model.materials[key] || { color: [1, 0, 1] };
    const op = m.opacity ?? 1;
    const g = {
      name: key,
      pbrMetallicRoughness: { baseColorFactor: [...lin3(m.color).map(r6), op], metallicFactor: m.metal ?? 0, roughnessFactor: m.rough ?? 0.5 },
    };
    const em = m.emissive && (m.emissiveStrength ?? 0) > 0 ? lin3(m.emissive).map((v) => Math.min(1, v * m.emissiveStrength)) : null;
    if (em) g.emissiveFactor = em.map(r6);
    if (op < 1) g.alphaMode = 'BLEND';
    if (m.doubleSided) g.doubleSided = true;
    if ((m.clearcoat ?? 0) > 0 && opts.clearcoat !== false) {
      g.extensions = { KHR_materials_clearcoat: { clearcoatFactor: m.clearcoat, clearcoatRoughnessFactor: 0.06 } };
      extUsed.add('KHR_materials_clearcoat');
    }
    if (m.lightKind) g.extras = { tipoLuz: m.lightKind, corEmissao: lin3(m.emissive || m.color).map(r6), intensidadeAcesa: m.lit ?? 2, ...(m.brake ? { intensidadeFreio: m.brake } : {}) };
    json.materials.push(g);
    const i = json.materials.length - 1;
    matIdx.set(key, i);
    return i;
  };
  const meshIdx = new Map();
  const addMesh = (prims, name) => {
    if (meshIdx.has(prims)) return meshIdx.get(prims);
    const out = { name, primitives: [] };
    for (const p of prims) {
      const P = p.positions, N = new Float32Array(p.normals);
      // normaliza normais
      for (let i = 0; i < N.length; i += 3) {
        const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1;
        N[i] /= l; N[i + 1] /= l; N[i + 2] /= l;
      }
      const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[i + k]); mx[k] = Math.max(mx[k], P[i + k]); }
      const count = P.length / 3;
      json.accessors.push({ bufferView: addView(P, 34962), componentType: 5126, count, type: 'VEC3', min: mn, max: mx });
      const aP = json.accessors.length - 1;
      json.accessors.push({ bufferView: addView(N, 34962), componentType: 5126, count, type: 'VEC3' });
      const aN = json.accessors.length - 1;
      const I = p.indices;
      json.accessors.push({ bufferView: addView(I, 34963), componentType: I instanceof Uint32Array ? 5125 : 5123, count: I.length, type: 'SCALAR' });
      const aI = json.accessors.length - 1;
      out.primitives.push({ attributes: { POSITION: aP, NORMAL: aN }, indices: aI, material: getMat(p.material), mode: 4 });
    }
    json.meshes.push(out);
    const i = json.meshes.length - 1;
    meshIdx.set(prims, i);
    return i;
  };
  const addNode = (node) => {
    const idx = json.nodes.length;
    const n = { name: node.name };
    json.nodes.push(n);
    if (node.matrix) {
      if (isTranslationOnly(node.matrix)) n.translation = [r6(node.matrix[12]), r6(node.matrix[13]), r6(node.matrix[14])];
      else n.matrix = node.matrix.map(r6);
    }
    if (node.mesh && node.mesh.length) n.mesh = addMesh(node.mesh, node.name);
    if (node.extras && Object.keys(node.extras).length) n.extras = node.extras;
    if (node.children && node.children.length) n.children = node.children.map(addNode);
    return idx;
  };
  addNode(model.root);
  if (extUsed.size) json.extensionsUsed = [...extUsed];
  // buffer binário
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { parts.push(new Uint8Array(pad)); offset += pad; }
  json.buffers.push({ byteLength: offset });
  const bin = new Uint8Array(offset);
  let o = 0;
  for (const p of parts) { bin.set(p, o); o += p.byteLength; }
  // JSON (preenchido com espaços)
  let jsonStr = JSON.stringify(json);
  const enc = new TextEncoder();
  let jsonBytes = enc.encode(jsonStr);
  const jpad = (4 - (jsonBytes.byteLength % 4)) % 4;
  if (jpad) jsonBytes = enc.encode(jsonStr + ' '.repeat(jpad));
  const total = 12 + 8 + jsonBytes.byteLength + 8 + bin.byteLength;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.byteLength, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  const b0 = 20 + jsonBytes.byteLength;
  dv.setUint32(b0, bin.byteLength, true);
  dv.setUint32(b0 + 4, 0x004e4942, true);
  out.set(bin, b0 + 8);
  return out;
}

// leitor simples de GLB (para conferência e para o visualizador)
export function fromGLB(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('não é GLB');
  const jl = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(u8.subarray(20, 20 + jl)));
  const b0 = 20 + jl;
  const bl = dv.getUint32(b0, true);
  const bin = u8.subarray(b0 + 8, b0 + 8 + bl);
  const acc = (i) => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView];
    const comps = a.type === 'VEC3' ? 3 : 1;
    const start = bin.byteOffset + v.byteOffset + (a.byteOffset || 0);
    const C = a.componentType === 5126 ? Float32Array : a.componentType === 5125 ? Uint32Array : Uint16Array;
    return new C(bin.buffer.slice(start, start + a.count * comps * C.BYTES_PER_ELEMENT));
  };
  const s2 = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  const materials = {};
  json.materials.forEach((m) => {
    const p = m.pbrMetallicRoughness || {};
    const c = p.baseColorFactor || [1, 1, 1, 1];
    materials[m.name] = { color: [s2(c[0]), s2(c[1]), s2(c[2])], opacity: c[3], metal: p.metallicFactor ?? 1, rough: p.roughnessFactor ?? 1, clearcoat: m.extensions?.KHR_materials_clearcoat?.clearcoatFactor ?? 0 };
  });
  const meshes = json.meshes.map((m) => m.primitives.map((p) => ({ material: json.materials[p.material].name, positions: acc(p.attributes.POSITION), normals: acc(p.attributes.NORMAL), indices: acc(p.indices) })));
  const mk = (i) => {
    const n = json.nodes[i];
    let matrix = n.matrix || null;
    if (n.translation) matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, n.translation[0], n.translation[1], n.translation[2], 1];
    return { name: n.name, matrix, mesh: n.mesh !== undefined ? meshes[n.mesh] : null, extras: n.extras, children: (n.children || []).map(mk) };
  };
  return { root: mk(json.scenes[json.scene].nodes[0]), materials, json };
}
