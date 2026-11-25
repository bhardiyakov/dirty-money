// ============================================================================
// bakelow — os índices LOW POLY das malhas dos personagens (generator/malha3d.js: corpo, roupa, tênis, olhos e cabelos), feitos com o
// meshoptimizer (simplifyWithAttributes) e gravados em generator/malha3d_low.js (NPC_MESH3D_LOW). O gerador (NpcGenMesh.lowBody) usa
// esses índices no build, no Worker do guarda-roupa e no jogo — ninguém simplifica na hora.
//   • Os índices usam só vértices ORIGINAIS (o meshoptimizer não cria pontos): pesos dos ossos, portes e cores continuam valendo.
//   • Solda por posição antes (as costuras de textura duplicam vértices no mesmo lugar): sem rachaduras.
//   • Os PESOS DOS OSSOS entram como atributos: a simplificação evita juntar o que está de lados diferentes de um joelho, cotovelo,
//     punho ou ombro — as barras da bermuda, das mangas e da regata ficam onde a ficha as põe.
//   node tools/asset_baker/lowpoly/bakelow.cjs [razão 0,3]
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { MeshoptSimplifier } = require('meshoptimizer');

const GEN_DIR = path.join(__dirname, '..', 'generator');
const RATIO = +(process.argv[2] || 0.3);
const RATIO_OF = { eye: 0.35, hair: 0.14 };                    // (olhos: pequenos, guardam mais; cabelos: cartões densos, guardam menos)
// NÍVEIS além do de NPC perto (o de cima): o JOGADOR (a câmera sempre perto: ~5 mil triângulos) e o de LONGE (~1 mil: os NPCs além da
// distância média — no lugar do desenho 2,5D)
const LODS = { hero: { ratio: 0.5, of: { eye: 0.6, hair: 0.26 }, err: 0.06 }, far: { ratio: 0.09, of: { eye: 0.1, hair: 0.05 }, err: 0.5 } };
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
	const bn = e.nrm ? Buffer.from(e.nrm, 'base64') : null, qn = bn ? new Int8Array(bn.buffer.slice(bn.byteOffset, bn.byteOffset + bn.length)) : null, nrm = qn ? Float32Array.from(qn, (v) => v / 127) : null;
	return { n: e.n, pos, nrm, idx: e.i32 ? new Uint32Array(ab) : new Uint16Array(ab), bw };
}

// OCLUSÃO DE AMBIENTE por vértice (o escurecido das dobras, axilas, embaixo do queixo e entre as pernas — no PS2 vinha pintado na
// textura): raios num hemisfério em volta da normal de cada vértice usado pelo low poly, contra os triângulos low poly do corpo inteiro
// (pele, roupa, tênis, olhos; sem cabelo: cada um tem o seu) na pose de repouso. A malha é a mesma para todas as fichas de um gênero
// (a roupa muda de cor, não de forma): uma vez por gênero. → por malha, 1 byte por vértice (0 = aberto, 255 = fechado).
// A PELE só conta ela mesma: a pele debaixo da camiseta, da calça e do tênis ficava "fechada" e, onde a malha simplificada da pele fura a
// de cima (a perna de bermuda é a calça pintada de pele; o pé de chinelo é o tênis pintado de pele), apareciam triângulos escuros. Os
// olhos ficam sem oclusão. O raio sai um pouco à frente e só conta o que está a mais de 1,5 cm: o vértice é da malha simplificada, e as
// faces em volta dele (inclinadas pela simplificação) não podem "fechar" o próprio vértice.
const SKIN_ONLY = new Set(['skin']);
function aoFor(parts, R = 0.22, N = 40) {
	const T = [], TC = [];
	for (const { e, m, idx } of parts) for (let t = 0; t < idx.length; t += 3) {
		const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3, P = m.pos;
		T.push([P[a], P[a + 1], P[a + 2], P[b], P[b + 1], P[b + 2], P[c], P[c + 1], P[c + 2]]); TC.push(e.mat);
	}
	const cen = T.map((q) => [(q[0] + q[3] + q[6]) / 3, (q[1] + q[4] + q[7]) / 3, (q[2] + q[5] + q[8]) / 3, Math.max(Math.hypot(q[0] - q[3], q[1] - q[4], q[2] - q[5]), Math.hypot(q[0] - q[6], q[1] - q[7], q[2] - q[8]))]);
	// direções num hemisfério (cosseno, sequência de Fibonacci: as mesmas para todos)
	const dirs = [];
	for (let i = 0; i < N; i++) { const u = (i + 0.5) / N, r = Math.sqrt(u), th = i * 2.399963; dirs.push([r * Math.cos(th), r * Math.sin(th), Math.sqrt(1 - u)]); }
	const hit = (o, d, q) => {                                           // Möller–Trumbore, até R
		const e1x = q[3] - q[0], e1y = q[4] - q[1], e1z = q[5] - q[2], e2x = q[6] - q[0], e2y = q[7] - q[1], e2z = q[8] - q[2];
		const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x, det = e1x * px + e1y * py + e1z * pz;
		if (Math.abs(det) < 1e-12) return false;
		const inv = 1 / det, tx = o[0] - q[0], ty = o[1] - q[1], tz = o[2] - q[2], u = (tx * px + ty * py + tz * pz) * inv;
		if (u < 0 || u > 1) return false;
		const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
		if (v < 0 || u + v > 1) return false;
		const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
		return t > 0.015 && t < R;
	};
	const out = new Map();
	for (const { e, m, idx } of parts) {
		const ao = new Uint8Array(m.n), used = new Set(parts.used && parts.used.get(e) || idx);
		if (e.mat === 'eye') { out.set(e, ao); continue; }
		for (const v of used) {
			const n = [m.nrm[v * 3], m.nrm[v * 3 + 1], m.nrm[v * 3 + 2]], o = [m.pos[v * 3] + n[0] * 0.006, m.pos[v * 3 + 1] + n[1] * 0.006, m.pos[v * 3 + 2] + n[2] * 0.006];
			const near = [];
			for (let k = 0; k < T.length; k++) { if (e.mat === 'skin' && !SKIN_ONLY.has(TC[k])) continue; const c = cen[k]; if (Math.hypot(c[0] - o[0], c[1] - o[1], c[2] - o[2]) < R + c[3]) near.push(T[k]); }
			// base em volta da normal
			const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
			let tx = n[1] * a[2] - n[2] * a[1], ty = n[2] * a[0] - n[0] * a[2], tz = n[0] * a[1] - n[1] * a[0];
			const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
			const bx = n[1] * tz - n[2] * ty, by = n[2] * tx - n[0] * tz, bz = n[0] * ty - n[1] * tx;
			let occ = 0;
			for (const d of dirs) {
				const w = [tx * d[0] + bx * d[1] + n[0] * d[2], ty * d[0] + by * d[1] + n[1] * d[2], tz * d[0] + bz * d[1] + n[2] * d[2]];
				for (const q of near) if (hit(o, w, q)) { occ++; break; }
			}
			ao[v] = Math.round((occ / N) * 255);
		}
		out.set(e, ao);
	}
	return out;
}

function lowOf(e, nb, ratio, maxErr = MAX_ERR) {
	const m = dec(e);
	// solda: um representante por posição
	const rep = new Uint32Array(m.n), key = new Map();
	for (let v = 0; v < m.n; v++) {
		const k = Math.round(m.pos[v * 3] * 1e5) + ',' + Math.round(m.pos[v * 3 + 1] * 1e5) + ',' + Math.round(m.pos[v * 3 + 2] * 1e5);
		const r = key.get(k); if (r === undefined) { key.set(k, v); rep[v] = v; } else rep[v] = r;
	}
	const I = [];
	for (let t = 0; t < m.idx.length; t += 3) { const a = rep[m.idx[t]], b = rep[m.idx[t + 1]], c = rep[m.idx[t + 2]]; if (a !== b && b !== c && c !== a) I.push(a, b, c); }
	// COMPACTA: só os vértices que algum triângulo usa (as cópias soldadas que sobram, no mesmo lugar, o meshoptimizer trata como vértices
	// presos — a pele parava em ~1.100 triângulos qualquer que fosse o alvo); os índices voltam aos vértices originais no fim
	const back = [], fwd = new Map();
	for (const v of I) if (!fwd.has(v)) { fwd.set(v, back.length); back.push(v); }
	const nv = back.length, cpos = new Float32Array(nv * 3);
	back.forEach((v, i) => { cpos[i * 3] = m.pos[v * 3]; cpos[i * 3 + 1] = m.pos[v * 3 + 1]; cpos[i * 3 + 2] = m.pos[v * 3 + 2]; });
	const idx = Uint32Array.from(I, (v) => fwd.get(v)), target = Math.max(48, Math.round(idx.length * ratio / 3) * 3);
	let out, err;
	if (m.bw && nb) {
		// atributos: o peso de cada osso (0..1)
		const A = new Float32Array(nv * nb);
		back.forEach((v, i) => { for (let q = 0; q < 4; q++) { const w = m.bw[v * 8 + 4 + q]; if (w) A[i * nb + m.bw[v * 8 + q]] += w / 255; } });
		[out, err] = MeshoptSimplifier.simplifyWithAttributes(idx, cpos, 3, A, nb, new Array(nb).fill(e.mat === 'skin' ? W_BONE : W_CLOTH), null, target, maxErr);      // (roupa: as divisas dos ossos pesam mais — as barras)
	} else [out, err] = MeshoptSimplifier.simplify(idx, cpos, 3, target, maxErr);
	out = Uint32Array.from(out, (i) => back[i]);
	// (os índices são de vértices originais: cabem em 16 bits — as malhas têm < 65.536 vértices)
	if (m.n > 65535) throw new Error('malha grande demais para 16 bits: ' + e.name);
	return { idx: Uint16Array.from(out), tris: out.length / 3, from: m.idx.length / 3, err, m };
}

(async () => {
	await MeshoptSimplifier.ready;
	MeshoptSimplifier.useExperimentalFeatures = true;
	const D = load(), nb = D.bones.length, OUT = { v: 3, ratio: RATIO, chars: {}, hairs: {}, ao: {}, lod: {} };
	let a = 0, b = 0;
	for (const L of Object.keys(LODS)) OUT.lod[L] = { chars: {}, hairs: {} };
	for (const key of Object.keys(D.chars)) {
		OUT.chars[key] = {}; OUT.ao[key] = {};
		const parts = [];
		parts.used = new Map();
		for (const e of D.chars[key].meshes) {
			const r = lowOf(e, nb, RATIO_OF[e.mat] || RATIO);
			OUT.chars[key][e.name] = b64(r.idx); a += r.from; b += r.tris;
			parts.push({ e, m: r.m, idx: r.idx });
			const used = new Set(r.idx);
			// os outros NÍVEIS (o jogador, mais detalhado; o de longe, mais leve): só os índices — a oclusão vale para os vértices de todos
			const lv = [];
			for (const [L, P] of Object.entries(LODS)) {
				const q = lowOf(e, nb, P.of[e.mat] || P.ratio, P.err);
				OUT.lod[L].chars[key] = OUT.lod[L].chars[key] || {};
				OUT.lod[L].chars[key][e.name] = b64(q.idx);
				for (const v of q.idx) used.add(v);
				lv.push(`${L} ${q.tris}`);
			}
			parts.used.set(e, used);
			console.log(`${key} ${e.name.padEnd(24)} ${String(r.from).padStart(5)} → ${String(r.tris).padStart(4)} triângulos (erro ${r.err.toFixed(4)}) · ${lv.join(' · ')}`);
		}
		const t0 = Date.now(), AO = aoFor(parts);
		for (const [e, ao] of AO) OUT.ao[key][e.name] = b64(ao);
		console.log(`${key}: oclusão de ambiente em ${Date.now() - t0} ms`);
	}
	for (const [name, e] of Object.entries(D.hairs)) {
		const r = lowOf(e, 0, RATIO_OF.hair);
		OUT.hairs[name] = b64(r.idx); a += r.from; b += r.tris;
		const lv = [];
		for (const [L, P] of Object.entries(LODS)) { const q = lowOf(e, 0, P.of.hair, P.err); OUT.lod[L].hairs[name] = b64(q.idx); lv.push(`${L} ${q.tris}`); }
		console.log(`cabelo ${name.padEnd(20)} ${String(r.from).padStart(5)} → ${String(r.tris).padStart(4)} · ${lv.join(' · ')}`);
	}
	const file = path.join(GEN_DIR, 'malha3d_low.js');
	fs.writeFileSync(file, '// GERADO por tools/asset_baker/lowpoly/bakelow.cjs (meshoptimizer) — os índices LOW POLY de cada malha de generator/malha3d.js.\n'
		+ 'const NPC_MESH3D_LOW = ' + JSON.stringify(OUT) + ';\n');
	console.log(`total ${a} → ${b} triângulos · ${(fs.statSync(file).size / 1024).toFixed(0)} KB em ${path.relative(process.cwd(), file)}`);
})();
