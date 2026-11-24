// ============================================================================
// bakelow — os índices LOW POLY das malhas dos personagens (generator/malha3d.js: corpo, roupa, tênis, olhos e cabelos), feitos com o
// meshoptimizer (simplifyWithAttributes) e gravados em generator/malha3d_low.js (NPC_MESH3D_LOW). O gerador (NpcGenMesh.lowBody) usa
// esses índices no build, no Worker do guarda-roupa e no jogo — ninguém simplifica na hora.
//   • Os índices usam só vértices ORIGINAIS (o meshoptimizer não cria pontos): pesos dos ossos, portes e cores continuam valendo.
//   • Solda por posição antes (as costuras de textura duplicam vértices no mesmo lugar): sem rachaduras.
//   • Os PESOS DOS OSSOS entram como atributos: a simplificação evita juntar o que está de lados diferentes de um joelho, cotovelo,
//     punho ou ombro — as barras da bermuda, das mangas e da regata ficam onde a ficha as põe.
//   node tools/asset_baker/lowpoly/bakelow.cjs [razão 0,15]
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { MeshoptSimplifier } = require('meshoptimizer');

const GEN_DIR = path.join(__dirname, '..', 'generator');
const RATIO = +(process.argv[2] || 0.15);
const RATIO_OF = { eye: 0.3, hair: 0.12 };                     // (olhos: pequenos, guardam mais; cabelos: cartões densos, guardam menos)
const Q16 = 2 / 32767;
const W_BONE = +(process.env.LOW_WBONE || 0.25), W_CLOTH = +(process.env.LOW_WCLOTH || 4.0), MAX_ERR = +(process.env.LOW_ERR || 0.12);      // (peso dos ossos nos atributos; erro máximo, relativo ao tamanho da malha)

function load() {
	const ctx = {}; vm.createContext(ctx);
	vm.runInContext(fs.readFileSync(path.join(GEN_DIR, 'malha3d.js'), 'utf8') + ';this.D = NPC_MESH3D;', ctx);
	return ctx.D;
}
const b64 = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');
function dec(e) {
	const b = Buffer.from(e.pos, 'base64'), qp = new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)), pos = new Float32Array(e.n * 3);
	for (let i = 0; i < e.n * 3; i++) pos[i] = qp[i] * Q16;
	const c = Buffer.from(e.idx, 'base64'), ab = c.buffer.slice(c.byteOffset, c.byteOffset + c.length);
	const bw = e.bw ? new Uint8Array(Buffer.from(e.bw, 'base64')) : null;
	return { n: e.n, pos, idx: e.i32 ? new Uint32Array(ab) : new Uint16Array(ab), bw };
}

function lowOf(e, nb, ratio) {
	const m = dec(e);
	// solda: um representante por posição
	const rep = new Uint32Array(m.n), key = new Map();
	for (let v = 0; v < m.n; v++) {
		const k = Math.round(m.pos[v * 3] * 1e5) + ',' + Math.round(m.pos[v * 3 + 1] * 1e5) + ',' + Math.round(m.pos[v * 3 + 2] * 1e5);
		const r = key.get(k); if (r === undefined) { key.set(k, v); rep[v] = v; } else rep[v] = r;
	}
	const I = [];
	for (let t = 0; t < m.idx.length; t += 3) { const a = rep[m.idx[t]], b = rep[m.idx[t + 1]], c = rep[m.idx[t + 2]]; if (a !== b && b !== c && c !== a) I.push(a, b, c); }
	const idx = Uint32Array.from(I), target = Math.max(48, Math.round(idx.length * ratio / 3) * 3);
	let out, err;
	if (m.bw && nb) {
		// atributos: o peso de cada osso (0..1)
		const A = new Float32Array(m.n * nb);
		for (let v = 0; v < m.n; v++) for (let q = 0; q < 4; q++) { const w = m.bw[v * 8 + 4 + q]; if (w) A[v * nb + m.bw[v * 8 + q]] += w / 255; }
		[out, err] = MeshoptSimplifier.simplifyWithAttributes(idx, m.pos, 3, A, nb, new Array(nb).fill(e.mat === 'skin' ? W_BONE : W_CLOTH), null, target, MAX_ERR);      // (roupa: as divisas dos ossos pesam mais — as barras)
	} else [out, err] = MeshoptSimplifier.simplify(idx, m.pos, 3, target, MAX_ERR);
	// (os índices são de vértices originais: cabem em 16 bits — as malhas têm < 65.536 vértices)
	if (m.n > 65535) throw new Error('malha grande demais para 16 bits: ' + e.name);
	return { idx: Uint16Array.from(out), tris: out.length / 3, from: m.idx.length / 3, err };
}

(async () => {
	await MeshoptSimplifier.ready;
	MeshoptSimplifier.useExperimentalFeatures = true;
	const D = load(), nb = D.bones.length, OUT = { v: 1, ratio: RATIO, chars: {}, hairs: {} };
	let a = 0, b = 0;
	for (const key of Object.keys(D.chars)) {
		OUT.chars[key] = {};
		for (const e of D.chars[key].meshes) {
			const r = lowOf(e, nb, RATIO_OF[e.mat] || RATIO);
			OUT.chars[key][e.name] = b64(r.idx); a += r.from; b += r.tris;
			console.log(`${key} ${e.name.padEnd(24)} ${String(r.from).padStart(5)} → ${String(r.tris).padStart(4)} triângulos (erro ${r.err.toFixed(4)})`);
		}
	}
	for (const [name, e] of Object.entries(D.hairs)) {
		const r = lowOf(e, 0, RATIO_OF.hair);
		OUT.hairs[name] = b64(r.idx); a += r.from; b += r.tris;
		console.log(`cabelo ${name.padEnd(20)} ${String(r.from).padStart(5)} → ${String(r.tris).padStart(4)}`);
	}
	const file = path.join(GEN_DIR, 'malha3d_low.js');
	fs.writeFileSync(file, '// GERADO por tools/asset_baker/lowpoly/bakelow.cjs (meshoptimizer) — os índices LOW POLY de cada malha de generator/malha3d.js.\n'
		+ 'const NPC_MESH3D_LOW = ' + JSON.stringify(OUT) + ';\n');
	console.log(`total ${a} → ${b} triângulos · ${(fs.statSync(file).size / 1024).toFixed(0)} KB em ${path.relative(process.cwd(), file)}`);
})();
