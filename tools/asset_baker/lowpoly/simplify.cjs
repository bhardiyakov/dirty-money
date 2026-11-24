// ============================================================================
// simplify — SIMPLIFICAÇÃO DE MALHA para o visual low poly (erro quadrático de Garland & Heckbert, colapso de MEIA aresta).
//
// Entrada: posições (Float32Array, xyz) e índices de triângulos. Saída: um índice NOVO que só usa vértices ORIGINAIS — cada colapso
// junta um vértice no vizinho, sem criar ponto novo. Assim tudo o que o gerador guarda por vértice (pesos dos ossos, os portes magro/
// forte/gordo, a cor da roupa por região) continua valendo na malha simplificada.
//   • Solda por posição antes (as costuras de textura duplicam vértices no mesmo lugar): a malha simplificada não abre rachaduras.
//   • Borda aberta (a gola da camiseta, a barra da calça) pesa muito mais: o contorno da peça fica.
//   • Colapso que vira algum triângulo do avesso (ou o achata demais) é recusado.
// Sem dependências: roda no build (Node) e no Worker.
// ============================================================================
'use strict';

function simplify(pos, idx, targetTris, { boundaryWeight = 40, weldEps = 1e-5 } = {}) {
	const nv = pos.length / 3;
	// ---------------------------------------------------------------- solda: um representante por posição
	const rep = new Int32Array(nv), key = new Map(), q = 1 / weldEps;
	for (let v = 0; v < nv; v++) {
		const k = Math.round(pos[v * 3] * q) + ',' + Math.round(pos[v * 3 + 1] * q) + ',' + Math.round(pos[v * 3 + 2] * q);
		const r = key.get(k);
		if (r === undefined) { key.set(k, v); rep[v] = v; } else rep[v] = r;
	}
	let F = [];
	for (let t = 0; t < idx.length; t += 3) {
		const a = rep[idx[t]], b = rep[idx[t + 1]], c = rep[idx[t + 2]];
		if (a !== b && b !== c && c !== a) F.push([a, b, c]);
	}
	const P = (v, k) => pos[v * 3 + k];
	// ---------------------------------------------------------------- quádricas (10 coeficientes da matriz simétrica 4×4)
	const Q = new Float64Array(nv * 10);
	const addPlane = (v, a, b, c, d, w) => {
		const o = v * 10;
		Q[o] += w * a * a; Q[o + 1] += w * a * b; Q[o + 2] += w * a * c; Q[o + 3] += w * a * d;
		Q[o + 4] += w * b * b; Q[o + 5] += w * b * c; Q[o + 6] += w * b * d;
		Q[o + 7] += w * c * c; Q[o + 8] += w * c * d; Q[o + 9] += w * d * d;
	};
	const faceN = (f) => {
		const [a, b, c] = f;
		const ux = P(b, 0) - P(a, 0), uy = P(b, 1) - P(a, 1), uz = P(b, 2) - P(a, 2), vx = P(c, 0) - P(a, 0), vy = P(c, 1) - P(a, 1), vz = P(c, 2) - P(a, 2);
		const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
		return [nx, ny, nz, l];
	};
	for (const f of F) {
		const [nx, ny, nz, l] = faceN(f);
		if (l < 1e-12) continue;
		const a = nx / l, b = ny / l, c = nz / l, d = -(a * P(f[0], 0) + b * P(f[0], 1) + c * P(f[0], 2)), w = l * 0.5;
		for (const v of f) addPlane(v, a, b, c, d, w);
	}
	// borda aberta: um plano perpendicular à face, passando pela aresta (pesado)
	const edgeCount = new Map(), ek = (a, b) => (a < b ? a * nv + b : b * nv + a);
	for (const f of F) for (let i = 0; i < 3; i++) { const k = ek(f[i], f[(i + 1) % 3]); edgeCount.set(k, (edgeCount.get(k) || 0) + 1); }
	for (const f of F) {
		const [nx, ny, nz, l] = faceN(f);
		if (l < 1e-12) continue;
		for (let i = 0; i < 3; i++) {
			const a = f[i], b = f[(i + 1) % 3];
			if (edgeCount.get(ek(a, b)) !== 1) continue;
			const ex = P(b, 0) - P(a, 0), ey = P(b, 1) - P(a, 1), ez = P(b, 2) - P(a, 2);
			let px = ey * nz - ez * ny, py = ez * nx - ex * nz, pz = ex * ny - ey * nx;
			const pl = Math.hypot(px, py, pz);
			if (pl < 1e-12) continue;
			px /= pl; py /= pl; pz /= pl;
			const d = -(px * P(a, 0) + py * P(a, 1) + pz * P(a, 2)), w = boundaryWeight * Math.hypot(ex, ey, ez) ** 2;
			addPlane(a, px, py, pz, d, w); addPlane(b, px, py, pz, d, w);
		}
	}
	const err = (o, x, y, z) => Q[o] * x * x + 2 * Q[o + 1] * x * y + 2 * Q[o + 2] * x * z + 2 * Q[o + 3] * x + Q[o + 4] * y * y + 2 * Q[o + 5] * y * z
		+ 2 * Q[o + 6] * y + Q[o + 7] * z * z + 2 * Q[o + 8] * z + Q[o + 9];
	// custo de juntar u em v (v fica): o erro das duas quádricas somadas na posição de v
	const cost = (u, v) => { const o1 = u * 10, o2 = v * 10, x = P(v, 0), y = P(v, 1), z = P(v, 2); return err(o1, x, y, z) + err(o2, x, y, z); };
	// ---------------------------------------------------------------- vizinhança: vértice → faces
	const alive = F.map(() => true), vf = new Map();
	F.forEach((f, i) => { for (const v of f) { let s = vf.get(v); if (!s) vf.set(v, s = new Set()); s.add(i); } });
	const ver = new Int32Array(nv);
	// heap de candidatos [custo, u, v, versão de u, versão de v]
	const H = [];
	const push = (e) => { H.push(e); let i = H.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (H[p][0] <= H[i][0]) break; [H[p], H[i]] = [H[i], H[p]]; i = p; } };
	const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < H.length && H[l][0] < H[m][0]) m = l; if (r < H.length && H[r][0] < H[m][0]) m = r; if (m === i) break; [H[m], H[i]] = [H[i], H[m]]; i = m; } } return top; };
	const enqueue = (a, b) => { push([cost(a, b), a, b, ver[a], ver[b]]); push([cost(b, a), b, a, ver[b], ver[a]]); };
	const seen = new Set();
	for (const f of F) for (let i = 0; i < 3; i++) { const a = f[i], b = f[(i + 1) % 3], k = ek(a, b); if (seen.has(k)) continue; seen.add(k); enqueue(a, b); }
	let live = F.length;
	// ---------------------------------------------------------------- colapsos
	while (live > targetTris && H.length) {
		const [, u, v, vu, vv] = pop();
		if (ver[u] !== vu || ver[v] !== vv) continue;                    // (algo mudou em volta: o candidato é velho)
		const fu = vf.get(u);
		if (!fu || !fu.size) continue;
		// as faces de u que sobram (as que não têm v) não podem virar do avesso nem achatar
		let ok = true;
		for (const i of fu) {
			const f = F[i];
			if (f.includes(v)) continue;
			const g = f.map((x) => (x === u ? v : x)), [ax, ay, az, la] = faceN(f), [bx, by, bz, lb] = faceN(g);
			if (lb < 1e-12 || (ax * bx + ay * by + az * bz) < 0.2 * la * lb) { ok = false; break; }
		}
		if (!ok) continue;
		let sv = vf.get(v);
		if (!sv) vf.set(v, sv = new Set());
		for (const i of fu) {
			const f = F[i];
			if (f.includes(v)) { alive[i] = false; live--; for (const x of f) if (x !== u) { const s = vf.get(x); if (s) s.delete(i); } continue; }
			for (let k = 0; k < 3; k++) if (f[k] === u) f[k] = v;
			sv.add(i);
		}
		vf.delete(u);
		for (let k = 0; k < 10; k++) Q[v * 10 + k] += Q[u * 10 + k];
		ver[u]++; ver[v]++;
		const nb = new Set();
		for (const i of sv) for (const x of F[i]) if (x !== v) nb.add(x);
		for (const x of nb) enqueue(v, x);                                  // (só as arestas de v mudaram de custo: as outras seguem valendo)
	}
	const out = [];
	F.forEach((f, i) => { if (alive[i]) out.push(f[0], f[1], f[2]); });
	return Uint32Array.from(out);
}

module.exports = { simplify };
