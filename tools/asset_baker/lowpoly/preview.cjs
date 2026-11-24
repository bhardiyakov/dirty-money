// Prévia do visual LOW POLY dos personagens (protótipo): o gerador no Node, as malhas simplificadas (simplify.cjs), a pose parada de
// cada tipo e as faces chapadas com a paleta da ficha. Grava um JSON por tipo (triângulos já posados, cor por face) para a página de
// prévia desenhar.   node tools/asset_baker/lowpoly/preview.cjs SAIDA.json tipo1 tipo2 ...   (razão: LOWPOLY_RATIO, padrão 0,15)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { simplify } = require('./simplify.cjs');
const GEN_DIR = path.join(__dirname, '..', 'generator');
const GEN = ['NpcGenCore.js', 'NpcGenChar.js', 'NpcGenRender.js', 'NpcGenAnims.js', 'NpcGenTypes.js', 'NpcGenBuild.js', 'malha3d.js', 'malha3d_low.js', 'NpcGenMesh.js', 'veiculos_occ.js', 'armas_sprites.js'];
for (const f of GEN) vm.runInThisContext(fs.readFileSync(path.join(GEN_DIR, f), 'utf8'), { filename: path.join(GEN_DIR, f) });
const G = vm.runInThisContext('(() => { const G = {}; NpcGenCore(G); NpcGenChar(G); NpcGenRender(G); NpcGenAnims(G); NpcGenTypes(G); NpcGenBuild(G); NpcGenMesh(G); return G; })()');

const [out, ...types] = process.argv.slice(2);
const RATIO = +(process.env.LOWPOLY_RATIO || 0.15);
const D = G.MESH_DATA, Q16 = 2 / 32767;
const dec = (e) => {
	const b = Buffer.from(e.pos, 'base64'), qp = new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)), pos = new Float32Array(e.n * 3);
	for (let i = 0; i < e.n * 3; i++) pos[i] = qp[i] * Q16;
	const c = Buffer.from(e.idx, 'base64'), ab = c.buffer.slice(c.byteOffset, c.byteOffset + c.length);
	return { pos, idx: e.i32 ? new Uint32Array(ab) : new Uint16Array(ab) };
};
const low = new Map();
const all = [...D.chars.m.meshes, ...D.chars.f.meshes, ...Object.values(D.hairs)];
for (const e of all) { const m = dec(e); low.set(e, simplify(m.pos, m.idx, Math.max(16, Math.round(m.idx.length / 3 * (e.mat === 'eye' ? 0.3 : RATIO))))); }
// LOWPOLY_SRC=meshopt: os índices assados com o meshoptimizer (generator/malha3d_low.js); senão, o simplificador próprio
let idxFor = (e) => low.get(e) || null;
if (process.env.LOWPOLY_SRC === 'meshopt') {
	vm.runInThisContext(fs.readFileSync(path.join(GEN_DIR, 'malha3d_low.js'), 'utf8'));
	const LW = vm.runInThisContext('NPC_MESH3D_LOW'), M2 = new Map();
	const u16 = (s) => { const b = Buffer.from(s, 'base64'); return new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };
	for (const k of Object.keys(D.chars)) for (const e of D.chars[k].meshes) if (LW.chars[k] && LW.chars[k][e.name]) M2.set(e, u16(LW.chars[k][e.name]));
	for (const [n, e] of Object.entries(D.hairs)) if (LW.hairs[n]) M2.set(e, u16(LW.hairs[n]));
	idxFor = (e) => M2.get(e) || null;
}

const res = [];
types.forEach((type, k) => {
	const spec = G.variantSpec(type, 0), s = G.fullSpec(spec);
	G.setRig(G.rigFor(s)); G.CTX.scale = s.scale || 1;
	const L = G.lowBody(spec, idxFor);
	const cd = G.clipDef('idle', 'none', type, { hand: null }), pose = cd.poses[0], Pz = pose.adult ? pose.adult() : pose, BB = Pz.B || pose.bones();
	const ramps = G.rampsFor(spec), hex = (h) => (typeof h === 'string' ? G.hexrgb(h) : h);
	const X = (b, p) => { const T = BB[b]; if (!T) return p; const R = T.R, t = T.t; return [R[0] * p[0] + R[1] * p[1] + R[2] * p[2] + t[0], R[3] * p[0] + R[4] * p[1] + R[5] * p[2] + t[1], R[6] * p[0] + R[7] * p[1] + R[8] * p[2] + t[2]]; };
	const pos = [], col = [];
	const sun = (() => { const v = [-0.45, -0.35, 0.82], l = Math.hypot(...v); return v.map((x) => x / l); })();      // (luz de cima, vinda da frente-esquerda)
	for (let t = 0; t < L.tris; t++) {
		const W = [];
		for (let c = 0; c < 3; c++) {
			const o = t * 3 + c, b1 = L.bones[L.sk[o * 3]], b2 = L.bones[L.sk[o * 3 + 1]], w = L.sk[o * 3 + 2];
			let p = X(b1, [L.p1[o * 3], L.p1[o * 3 + 1], L.p1[o * 3 + 2]]);
			if (w > 0) { const q = X(b2, [L.p2[o * 3], L.p2[o * 3 + 1], L.p2[o * 3 + 2]]); p = p.map((x, i) => x + (q[i] - x) * w); }
			W.push(p);
		}
		const u = W[1].map((x, i) => x - W[0][i]), v = W[2].map((x, i) => x - W[0][i]);
		let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
		const nl = Math.hypot(...n) || 1; n = n.map((x) => x / nl);
		const d = n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2];
		const lev = Math.max(0, Math.min(4, Math.round(1.2 + 2.6 * Math.max(0, d) + 0.4 * Math.max(0, n[1]))));     // (faixas: 0..4 da rampa)
		const ramp = ramps[L.mt[t * 3]] || ramps[0], c = hex(ramp ? ramp[lev] : '#ff00ff');
		for (const p of W) { pos.push(p[0] + k * 34, p[2], p[1]); col.push(c[0] / 255, c[1] / 255, c[2] / 255, 1); }      // (gerador x, y = frente, z = cima → x, y = cima, z)
	}
	res.push({ type, tris: L.tris, pos, col });
	console.log(type, L.tris, 'triângulos');
});
fs.writeFileSync(out, JSON.stringify(res));
