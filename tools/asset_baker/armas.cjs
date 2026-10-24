// ============================================================================
// tools/asset_baker/armas.cjs — as ARMAS DA FOLHA (source/armas.jpg: 10 armas × 16 desenhos) → generator/armas_sprites.js.
//
// A folha é pixel art de cada arma vista de lado (fundo azul-acinzentado, JPEG). Daqui sai, para cada arma, o desenho escolhido
// (uma vista de lado limpa, cano para a direita) como MATERIAL + TOM por pixel — as mesmas paletas fixas das armas no gerador
// (metal, fita, cromo, madeira, granada, taco, dourado) — e os pontos de pegar (mão direita, mão de apoio), a boca do cano e onde
// presas as peças que se mexem (a ogiva do RPG, os canos da minigun, o fogo do molotov). O gerador (NpcGenChar: armas da folha)
// levanta o desenho em 3D (o contorno vira a silhueta, com volume arredondado) e pinta a superfície com ele: a arma aparece igual à
// folha de qualquer ângulo, com a luz e o contorno do resto do personagem, e as animações de sempre (sacar, mirar, atirar…).
//
//   node tools/asset_baker/armas.cjs            (grava generator/armas_sprites.js; depois: node tools/asset_baker/bake.cjs …)
//
// Escala: `len` = comprimento da arma no corpo adulto, em unidades do gerador (o corpo tem ~93 u ≈ 1,75 m: 1 u ≈ 1,9 cm) — as
// proporções de verdade, com as pequenas (pistolas, granada, garrafa) ~25–30% maiores para lerem na tela. `sz` achata a altura
// (a folha desenha tudo mais alto que o real). `hmax`/`k`: meia-espessura máxima e o quanto ela cresce para dentro do desenho
// (k ≈ 0,9: tubos redondos; menor: chapado, como uma pistola).
// ============================================================================
const fs = require('fs'), path = require('path');
const HERE = __dirname, SRC = path.join(HERE, 'source', 'armas.jpg'), OUT = path.join(HERE, 'generator', 'armas_sprites.js');
const sharp = require(path.join(HERE, 'node_modules', 'sharp'));

// faixas (y) das 10 linhas da folha, de cima para baixo
const ROWS = [[10, 55], [79, 110], [137, 170], [186, 226], [244, 275], [303, 329], [355, 386], [412, 444], [459, 503], [511, 569]];
const BG = [56, 73, 89], BG_TOL = 34;

// Classes de cor (HSV): '#' contorno · k escuro · m médio · c claro · W madeira/âmbar · G oliva · F fogo · r pano (claro e quente)
function cls(r, g, b) {
	const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, v = mx, s = mx ? (mx - mn) / mx : 0;
	let h = 0;
	if (mx !== mn) {
		const R = r / 255, Gg = g / 255, B = b / 255, d = mx - mn;
		h = mx === R ? ((Gg - B) / d) % 6 : mx === Gg ? (B - R) / d + 2 : (R - Gg) / d + 4;
		h = (h * 60 + 360) % 360;
	}
	if (v < 0.14) return '#';
	if (s > 0.45 && v > 0.55 && h >= 15 && h <= 65) return 'F';
	if (s > 0.22 && h >= 10 && h <= 45) return 'W';
	if (s > 0.18 && h > 45 && h <= 110) return 'G';
	if (v < 0.30) return 'k';
	if (v < 0.55) return 'm';
	return 'c';
}

// Mapa padrão classe → [material, tom]; cada arma muda o que precisa (map) e, por região do desenho (rects), o que muda numa parte.
const BASE = { k: ['metal', -1], m: ['metal', 0], c: ['metal', 1], W: ['madeira', 0], G: ['granada', 0], F: ['dourado', 1], r: ['pano', 0] };
// Cada arma: linha/índice do desenho na folha; flip (espelha se o cano aponta para a esquerda); âncoras em pixels do recorte
// (grip = mão direita, vira a origem; sup = mão de apoio; muzzle = boca do cano; mount = onde vai a peça presa); eixo 'gun' (cano
// em +y, cima em +z) ou 'up' (o alto do desenho em +y: a garrafa).
const PICK = {
	pistol: { row: 0, i: 8, len: 14, sz: 0.9, hmax: 1.05, k: 0.5, grip: [7.5, 21.5], sup: [11, 25], muzzle: [38.5, 8] },
	revolver: { row: 1, i: 0, len: 18, sz: 0.9, hmax: 1.25, k: 0.55, grip: [6.5, 21.5], sup: [10, 25], muzzle: [44.5, 7.5],
		map: { m: ['cromo', -2], c: ['cromo', -1], k: ['metal', 0] } },          // (o aço do revólver: cinza médio, como na folha)
	pistol_sil: { row: 2, i: 0, len: 21, sz: 0.9, hmax: 1.05, k: 0.5, grip: [7.5, 22.5], sup: [11, 26], muzzle: [59.5, 6.5],
		rects: [{ x0: 36, x1: 60, y0: 0, y1: 12, map: { k: ['fita', 0], m: ['fita', 1], c: ['fita', 1] } }] },          // o silenciador fosco
	smg: { row: 3, i: 0, len: 36, sz: 0.85, hmax: 1.35, k: 0.55, grip: [23, 21], sup: [49, 14.5], muzzle: [62.5, 10] },
	rifle_ak: { row: 4, i: 0, len: 47, sz: 0.8, hmax: 1.5, k: 0.55, grip: [23, 17], sup: [49, 9.5], muzzle: [64.5, 8], map: { F: ['madeira', 1] } },
	rpg: { row: 5, i: 0, len: 50, sz: 0.75, hmax: 3.2, k: 0.9, grip: [34.5, 16.5], sup: [47.5, 16], muzzle: [64.5, 8], mount: [64.5, 8], map: { F: ['madeira', 1] } },
	rpg_head: { row: 5, i: 3, len: 27, sz: 0.85, hmax: 3.2, k: 0.92, grip: [6, 8], map: { W: ['madeira', -1], c: ['cromo', 0], m: ['granada', 1], k: ['granada', -1] } },
	launcher: { row: 6, i: 0, len: 53, sz: 0.62, hmax: 4.4, k: 0.9, grip: [33, 23], sup: [50, 16], muzzle: [64.5, 8.5],
		map: { k: ['granada', -1], m: ['granada', 0], c: ['granada', 1] },
		rects: [{ x0: 20, x1: 42, y0: 18, y1: 31, map: { k: ['fita', 0], m: ['fita', 1], c: ['metal', 0], G: ['fita', 1] } }] },        // a empunhadura preta
	minigun: { row: 7, i: 0, len: 44, sz: 0.85, hmax: 3.0, k: 0.75, grip: [4, 12], sup: [31, 3], muzzle: [65.5, 18], mount: [37, 18],
		cut: { x0: 40 } },          // os canos (x ≥ 40) são outra peça (minibar: giram no tiro), feita em 3D com as cores da folha
	grenade: { row: 8, i: 0, len: 7.0, sz: 1.0, hmax: 3.4, k: 0.95, grip: [15.5, 29],
		map: { k: ['granada', -1], m: ['granada', 0], c: ['granada', 1] },
		rects: [{ x0: 0, x1: 30, y0: 0, y1: 14, map: { k: ['metal', 0], m: ['metal', 1], c: ['cromo', 0], G: ['granada', 0] } },
			{ x0: 0, x1: 7, y0: 14, y1: 34, map: { k: ['metal', 0], m: ['metal', 1], c: ['cromo', 0] } }] },          // a espoleta e a alavanca
	molotov: { row: 9, i: 0, len: 25, sz: 1.0, hmax: 3.1, k: 0.95, grip: [10, 42], axis: 'up', mount: [9.5, 17.5],
		map: { W: ['madeira', 0], F: ['madeira', 2], k: ['madeira', -1], m: ['madeira', 1], c: ['madeira', 2] },          // vidro âmbar escuro
		rects: [{ x0: 0, x1: 19, y0: 0, y1: 18, drop: true },                                                 // o fogo é outra peça (molotov_fogoN)
			{ x0: 0, x1: 19, y0: 18, y1: 21, map: { c: ['pano', 0], W: ['pano', -1], m: ['pano', -1], k: ['pano', -1] } }] },     // o pano no gargalo
};
// Fogo do molotov aceso: as chamas de 4 desenhos da linha 9 (cada um um quadro da animação), só a parte de cima (y < topo do pano).
const FIRE = [0, 2, 6, 9].map((i) => ({ row: 9, i, cutY: 18, map: { F: ['dourado', 1], W: ['dourado', -1], m: ['dourado', -2], k: null, c: ['dourado', 2], G: ['dourado', 0], r: ['dourado', 2] } }));

(async () => {
	const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
	const W = info.width, H = info.height, at = (x, y) => { const o = (y * W + x) * 3; return [data[o], data[o + 1], data[o + 2]]; };
	// fundo: flood fill a partir das bordas por cima do que tem a cor do fundo
	const bg = new Uint8Array(W * H), st = [];
	for (let x = 0; x < W; x++) st.push(x, 0, x, H - 1);
	for (let y = 0; y < H; y++) st.push(0, y, W - 1, y);
	while (st.length) {
		const y = st.pop(), x = st.pop(), i = y * W + x;
		if (bg[i]) continue;
		const c = at(x, y);
		if (Math.abs(c[0] - BG[0]) + Math.abs(c[1] - BG[1]) + Math.abs(c[2] - BG[2]) > BG_TOL) continue;
		bg[i] = 1;
		if (x > 0) st.push(x - 1, y); if (x < W - 1) st.push(x + 1, y); if (y > 0) st.push(x, y - 1); if (y < H - 1) st.push(x, y + 1);
	}
	// desenhos = componentes conexos (8 vizinhos) do que não é fundo
	const lab = new Int32Array(W * H).fill(-1), comps = [];
	for (let y0 = 0; y0 < H; y0++) for (let x0 = 0; x0 < W; x0++) {
		const i0 = y0 * W + x0;
		if (bg[i0] || lab[i0] >= 0) continue;
		const id = comps.length, q = [i0], c = { id, x0, y0, x1: x0, y1: y0, n: 0 };
		lab[i0] = id;
		while (q.length) {
			const i = q.pop(), x = i % W, y = (i / W) | 0;
			c.n++; c.x0 = Math.min(c.x0, x); c.x1 = Math.max(c.x1, x); c.y0 = Math.min(c.y0, y); c.y1 = Math.max(c.y1, y);
			for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
				const nx = x + dx, ny = y + dy, j = ny * W + nx;
				if (nx >= 0 && nx < W && ny >= 0 && ny < H && !bg[j] && lab[j] < 0) { lab[j] = id; q.push(j); }
			}
		}
		comps.push(c);
	}
	const rowComps = (r) => comps.filter((c) => c.n >= 40 && c.y0 <= ROWS[r][1] + 3 && c.y1 >= ROWS[r][0] - 3).sort((a, b) => a.x0 - b.x0);

	// Recorta um desenho: classes por pixel (só os pixels DESTE componente), com o contorno resolvido
	function grab(row, i) {
		const c = rowComps(row)[i], w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1, K = new Array(w * h).fill('.');
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
			const gx = c.x0 + x, gy = c.y0 + y;
			if (lab[gy * W + gx] === c.id) K[y * w + x] = cls(...at(gx, gy));
		}
		return { w, h, K, src: [c.x0, c.y0] };
	}
	// Classe → [material, tom]: a regra da região (rects) ou da arma (map) ou a base. '#' (contorno do desenho): o material do vizinho
	// que não é contorno (o gerador desenha o contorno dele); dentro do desenho (linha de painel) um tom mais escuro.
	function paint(g, P) {
		const { w, h, K } = g, out = new Array(w * h).fill(null);
		const ruleAt = (x, y, k) => {
			for (const R of P.rects || []) if (x >= R.x0 && x < R.x1 && y >= R.y0 && y < R.y1) { if (R.drop) return 'drop'; if (R.map && k in R.map) return R.map[k]; }
			if (P.map && k in P.map) return P.map[k];
			return BASE[k];
		};
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
			const k = K[y * w + x];
			if (k === '.' || k === '#') continue;
			const r = ruleAt(x, y, k);
			if (r === 'drop' || r === null) { K[y * w + x] = '.'; continue; }
			out[y * w + x] = r.slice();
		}
		// O contorno da folha é grosso (2–3 px de '#' e 'k' na borda): na arma em 3D a borda vira as faces de cima/baixo e as quinas,
		// e se ficasse "metal escuro" a arma inteira pareceria cinza. Faixa da borda (até 3 px do vazio) escura → o material do miolo
		// mais perto (pixel pintado fora da faixa ou que não é escuro), tom 0; '#' no miolo (linha de painel) → o material dele, um tom
		// mais escuro. (O gerador desenha o contorno dele por cima.)
		const bd = new Int16Array(w * h).fill(99), q = [];
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (K[y * w + x] === '.') { bd[y * w + x] = 0; q.push(x, y); }
		for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) if (x < 0 || y < 0 || x >= w || y >= h) q.push(x, y);
		for (let qi = 0; qi < q.length; qi += 2) {
			const x = q[qi], y = q[qi + 1], d = x < 0 || y < 0 || x >= w || y >= h ? 0 : bd[y * w + x];
			for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const nx = x + dx, ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= w || ny >= h || bd[ny * w + nx] <= d + 1) continue;
				bd[ny * w + nx] = d + 1; q.push(nx, ny);
			}
		}
		const dark = (i) => K[i] === '#' || K[i] === 'k', band = (i) => dark(i) && bd[i] <= 3;
		const core = (i) => out[i] && !band(i) && K[i] !== '#';
		const nearest = (x, y, ok) => {
			for (let rr = 1; rr <= 6; rr++) for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
				if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue;
				const nx = x + dx, ny = y + dy;
				if (nx >= 0 && ny >= 0 && nx < w && ny < h && ok(ny * w + nx)) return out[ny * w + nx];
			}
			return null;
		};
		const fixed = out.slice();
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
			const i = y * w + x;
			if (K[i] === '.' || !dark(i)) continue;
			if (K[i] === '#' && ruleAt(x, y, '#') === 'drop') { K[i] = '.'; fixed[i] = null; continue; }
			const best = nearest(x, y, core) || (K[i] === '#' ? nearest(x, y, (j) => !!out[j]) : null);
			if (band(i)) { if (best) fixed[i] = [best[0], 0]; else if (!out[i]) { K[i] = '.'; fixed[i] = null; } }
			else if (K[i] === '#') { if (best) fixed[i] = [best[0], best[1] - 1]; else { K[i] = '.'; fixed[i] = null; } }
		}
		return fixed;
	}
	const MATS = ['metal', 'fita', 'cromo', 'madeira', 'granada', 'taco', 'dourado', 'pano'];
	const enc = (g, px, cut) => {
		const rows = [];
		for (let y = 0; y < g.h; y++) {
			let s = '';
			for (let x = 0; x < g.w; x++) {
				const p = px[y * g.w + x];
				if (!p || (cut && (x >= (cut.x0 ?? 1e9) || y < (cut.yTop ?? -1) || y >= (cut.yBot ?? 1e9)))) { s += '.'; continue; }
				const t = Math.max(-2, Math.min(2, p[1]));
				s += String.fromCharCode(65 + MATS.indexOf(p[0]) * 5 + (t + 2));          // A.. = material × 5 + (tom + 2)
			}
			rows.push(s);
		}
		return rows;
	};
	const out = {};
	for (const [name, P] of Object.entries(PICK)) {
		const g = grab(P.row, P.i), px = paint(g, P);
		const rows = enc(g, px, P.cut);
		const s = P.len / (P.axis === 'up' ? g.h : g.w);          // u por pixel: o comprimento da arma (ou a altura da garrafa)
		const o = { w: g.w, h: g.h, s: +s.toFixed(4), sz: P.sz, hmax: P.hmax, k: P.k, axis: P.axis || 'gun', grip: P.grip, rows };
		for (const a of ['sup', 'muzzle', 'mount']) if (P[a]) o[a] = P[a];
		out[name] = o;
		console.log(name.padEnd(11), `${g.w}×${g.h} px  ${(s * g.w).toFixed(1)}×${(s * g.h * P.sz).toFixed(1)} u  (folha: linha ${P.row}, desenho ${P.i})`);
	}
	// fogo: os pixels de cima (acima do pano), com a origem na boca da garrafa (o mesmo `mount` do molotov) e a escala dele
	FIRE.forEach((F, n) => {
		const g = grab(F.row, F.i), px = paint(g, F);
		const rows = enc(g, px, { yBot: F.cutY });
		// o fogo fica centrado no gargalo DESTE desenho (as garrafas da folha não estão no mesmo lugar em cada célula)
		let sx = 0, sn = 0;
		for (let y = F.cutY; y < F.cutY + 8; y++) for (let x = 0; x < g.w; x++) if (g.K[y * g.w + x] !== '.') { sx += x + 0.5; sn++; }
		const base = out.molotov, mx = sn ? sx / sn : g.w / 2;
		out['molotov_fogo' + n] = { w: g.w, h: g.h, s: base.s, sz: 1, hmax: 1.6, k: 0.8, axis: 'up', grip: [mx, F.cutY], rows };
	});
	const body = `// GERADO por tools/asset_baker/armas.cjs a partir de tools/asset_baker/source/armas.jpg — não editar à mão.
// As armas da folha: por arma, o desenho (uma letra por pixel: '.' vazio; senão material × 5 + tom + 2, A = 0 — materiais em
// NPC_ARMAS_MATS) e a escala/âncoras (ver o cabeçalho de armas.cjs). Lido pelo gerador (NpcGenChar: armas da folha).
const NPC_ARMAS_MATS = ${JSON.stringify(MATS)};
const NPC_ARMAS = ${JSON.stringify(out)};
`;
	fs.writeFileSync(OUT, body);
	console.log('gravado', path.relative(process.cwd(), OUT), (body.length / 1024).toFixed(1) + ' KB');
})();
