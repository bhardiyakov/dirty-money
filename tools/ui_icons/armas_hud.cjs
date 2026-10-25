// ============================================================================
// tools/ui_icons/armas_hud.cjs — os ÍCONES DAS ARMAS da interface (HUD, roda de armas, inventário, lojas) a partir da folha
// source/armas_hud.jpg: cada arma é recortada da folha com o fundo transparente e vai para um atlas WebP + o índice JSON que o jogo
// lê (src/art/WeaponArt.js: WeaponArt.load).
//
//   node tools/ui_icons/armas_hud.cjs        → assets/ui/armas_hud.webp + assets/ui/armas_hud.json
//
// Recorte: cada arma tem a sua caixa na folha (BOX, em px da imagem). O fundo (azul-marinho escuro, os painéis e as linhas deles) é
// achado por inundação a partir da borda da caixa — a arma tem um contorno preto e, em volta, uma borda clara de "adesivo", que a
// inundação não atravessa. Na faixa de 1–3 px da borda, o alfa cai suave pela claridade (o JPEG mistura a borda clara com o fundo);
// o brilho do fogo do molotov vira alfa (GLOW).
// ============================================================================
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const sharp = require(path.join(ROOT, 'tools', 'asset_baker', 'node_modules', 'sharp'));
const SRC = path.join(__dirname, 'source', 'armas_hud.jpg'), OUT = path.join(ROOT, 'assets', 'ui');

// Caixas na folha (2752 × 1536): [x0, y0, x1, y1]. A mão sai do canto do painel (o braço é cortado na borda da caixa, como na folha).
const BOX = {
	fists: [94, 80, 508, 466],
	knife: [645, 54, 1116, 488],
	bat: [1222, 54, 1742, 502],
	ak47: [1828, 150, 2700, 428],
	rifle: [44, 596, 745, 944],
	pistol: [810, 616, 1246, 922],
	pistol_sil: [1360, 616, 2066, 922],
	revolver: [2148, 616, 2690, 920],
	rpg: [36, 1030, 540, 1490],
	launcher: [550, 1128, 1144, 1362],
	minigun: [1182, 1120, 1818, 1376],
	grenade: [1880, 1060, 2205, 1440],
	molotov: [2290, 990, 2745, 1440],
};
// Fundo = o que é ESCURO (o azul-marinho, os painéis, a sombra embaixo da arma) e as LINHAS dos painéis; o resto (a borda clara do
// adesivo, o metal claro, a madeira, o fogo) é barreira — com um fechamento de 3 px, para as falhas do JPEG na borda clara. As linhas
// dos painéis são claras e azuladas como a borda do adesivo em alguns pontos, então elas são achadas pela geometria: fileiras e
// colunas da folha com uma tira longa de pixels azulados (findLines), mais os cantos arredondados nos cruzamentos.
const lum = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;
const isDark = (r, g, b) => lum(r, g, b) < 50 && !(r - b > 22);
const lineish = (r, g, b) => b - r >= 9 && lum(r, g, b) >= 45 && lum(r, g, b) <= 180;
// Brilho do fogo (molotov): o laranja escuro em volta da chama, sobre o fundo, também é fundo para a inundação — e vira alfa (cor ÷
// alfa: a luz sem o fundo). O vidro âmbar da garrafa fica dentro do contorno: a inundação não chega nele.
const GLOW = { molotov: 1 };
const warmDark = (r, g, b) => r - b > 20 && lum(r, g, b) < 120;

function findLines(px, W, H) {
	const rows = new Uint8Array(H), cols = new Uint8Array(W), L = new Uint8Array(W * H);
	for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, b] = px(x, y); if (lineish(r, g, b)) L[y * W + x] = 1; }
	// tira longa: 60 px seguidos (com falhas de até 3 px) na mesma fileira / coluna
	const runs = (n, at) => { let run = 0, gap = 0, best = 0; for (let i = 0; i < n; i++) { if (at(i)) { run += gap + 1; gap = 0; } else if (++gap > 3) { run = 0; gap = 0; } best = Math.max(best, run); } return best; };
	for (let y = 0; y < H; y++) if (runs(W, (x) => L[y * W + x]) >= 60) rows[y] = 1;
	for (let x = 0; x < W; x++) if (runs(H, (y) => L[y * W + x]) >= 60) cols[x] = 1;
	const line = new Uint8Array(W * H), R = 26;
	for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
		if (!L[y * W + x]) continue;
		let on = rows[y] || cols[x];
		if (!on) {                                                                 // canto arredondado: perto de uma fileira E de uma coluna
			let nr = 0, nc = 0;
			for (let d = -R; d <= R && !(nr && nc); d++) { if (rows[y + d]) nr = 1; if (cols[x + d]) nc = 1; }
			on = nr && nc;
		}
		if (on) line[y * W + x] = 1;
	}
	return { line, rows, cols };
}

(async () => {
	const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
	const W = info.width, C = info.channels, px = (x, y) => { const o = (y * W + x) * C; return [data[o], data[o + 1], data[o + 2]]; };
	const { line: LINE, rows: ROWS, cols: COLS } = findLines(px, W, info.height);
	const onRC = (x, y) => ROWS[y] || ROWS[y - 1] || ROWS[y + 1] || COLS[x] || COLS[x - 1] || COLS[x + 1];
	const cells = [];
	for (const [key, [x0, y0, x1, y1]] of Object.entries(BOX)) {
		const w = x1 - x0, h = y1 - y0, N = w * h, bar0 = new Uint8Array(N), bar = new Uint8Array(N), bg = new Uint8Array(N), q = [];
		const glow = !!GLOW[key];
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
			const [r, g, b] = px(x0 + x, y0 + y), X = x0 + x, Y = y0 + y;
			const pass = isDark(r, g, b) || LINE[Y * W + X] || (glow && (warmDark(r, g, b) || (onRC(X, Y) && lum(r, g, b) < 140)));      // (a linha do painel acesa pelo fogo)
			bar0[y * w + x] = pass ? 0 : 1;
		}
		// fechamento: a barreira engrossa RAD px (fecha falhas de até ~2·RAD na borda clara), a inundação passa, e o fundo volta a
		// crescer RAD px — só por pixels escuros —, devolvendo a borda.
		const RAD = 3, disk = [];
		for (let dy = -RAD; dy <= RAD; dy++) for (let dx = -RAD; dx <= RAD; dx++) if (dx * dx + dy * dy <= RAD * RAD + 1) disk.push([dx, dy]);
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
			if (!bar0[y * w + x]) continue;
			for (const [dx, dy] of disk) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) bar[yy * w + xx] = 1; }
		}
		for (let i = 0; i < N; i++) if (bar[i] && !bar0[i] && LINE[(y0 + ((i / w) | 0)) * W + x0 + (i % w)]) bar[i] = 0;      // (a linha do painel nunca é barreira)
		const seed = (x, y) => { const i = y * w + x; if (bg[i] || bar[i]) return; bg[i] = 1; q.push(i); };
		for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
		for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }
		while (q.length) { const i = q.pop(), x = i % w, y = (i / w) | 0; if (x > 0) seed(x - 1, y); if (x < w - 1) seed(x + 1, y); if (y > 0) seed(x, y - 1); if (y < h - 1) seed(x, y + 1); }
		for (let k = 0; k < RAD; k++) {                                                  // o fundo volta a crescer (só pelo escuro)
			const nb = bg.slice();
			for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
				const i = y * w + x; if (bg[i] || bar0[i]) continue;
				if ((x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (y > 0 && bg[i - w]) || (y < h - 1 && bg[i + w])) nb[i] = 1;
			}
			bg.set(nb);
		}
		// distância (em px, até 4) de cada pixel da arma até o fundo: a faixa de 1–3 px da borda ganha alfa pela claridade
		const D = new Uint8Array(N).fill(9);
		for (let i = 0; i < N; i++) if (bg[i]) D[i] = 0;
		for (let pass = 1; pass <= 4; pass++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
			const i = y * w + x; if (D[i] < 9) continue;
			if ((x > 0 && D[i - 1] === pass - 1) || (x < w - 1 && D[i + 1] === pass - 1) || (y > 0 && D[i - w] === pass - 1) || (y < h - 1 && D[i + w] === pass - 1)) D[i] = pass;
		}
		const A = new Float32Array(N), RGB = new Float32Array(N * 3);
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
			const i = y * w + x, [r, g, b] = px(x0 + x, y0 + y), l = lum(r, g, b);
			RGB[i * 3] = r; RGB[i * 3 + 1] = g; RGB[i * 3 + 2] = b;
			if (bg[i]) {
				let a = 0;
				if (glow && warmDark(r, g, b) && !onRC(x0 + x, y0 + y)) {                    // brilho do fogo sobre o fundo escuro
					a = Math.max(0, Math.min(1, (l - 30) / 110));
					for (let k = 0; k < 3; k++) RGB[i * 3 + k] = Math.min(255, RGB[i * 3 + k] / Math.max(0.25, a));
				}
				A[i] = a; continue;
			}
			A[i] = D[i] <= 3 ? Math.max(0, Math.min(1, (l - 34) / 60)) : 1;              // borda: some o que é fundo, fica a borda clara
		}
		// recorte justo (o que tem alfa) + 2 px
		let bx0 = w, by0 = h, bx1 = -1, by1 = -1;
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (A[y * w + x] > 0.02) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
		bx0 = Math.max(0, bx0 - 2); by0 = Math.max(0, by0 - 2); bx1 = Math.min(w - 1, bx1 + 2); by1 = Math.min(h - 1, by1 + 2);
		const cw = bx1 - bx0 + 1, ch = by1 - by0 + 1, rgba = Buffer.alloc(cw * ch * 4);
		for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
			const i = (by0 + y) * w + bx0 + x, o = (y * cw + x) * 4;
			rgba[o] = RGB[i * 3]; rgba[o + 1] = RGB[i * 3 + 1]; rgba[o + 2] = RGB[i * 3 + 2]; rgba[o + 3] = Math.round(A[i] * 255);
		}
		cells.push({ key, w: cw, h: ch, rgba });
	}
	// atlas: prateleiras de 2048 px de largura
	const PAD = 4, MAXW = 2048, rects = {};
	let x = PAD, y = PAD, rowH = 0;
	for (const c of cells.sort((a, b) => b.h - a.h)) {
		if (x + c.w + PAD > MAXW) { x = PAD; y += rowH + PAD; rowH = 0; }
		rects[c.key] = [x, y, c.w, c.h]; c.x = x; c.y = y;
		x += c.w + PAD; rowH = Math.max(rowH, c.h);
	}
	const AW = MAXW, AH = y + rowH + PAD, atlas = Buffer.alloc(AW * AH * 4);
	for (const c of cells) for (let yy = 0; yy < c.h; yy++) c.rgba.copy(atlas, ((c.y + yy) * AW + c.x) * 4, yy * c.w * 4, (yy + 1) * c.w * 4);
	fs.mkdirSync(OUT, { recursive: true });
	await sharp(atlas, { raw: { width: AW, height: AH, channels: 4 } }).webp({ quality: 92, alphaQuality: 100, effort: 6 }).toFile(path.join(OUT, 'armas_hud.webp'));
	fs.writeFileSync(path.join(OUT, 'armas_hud.json'), JSON.stringify({ src: 'armas_hud.webp', w: AW, h: AH, rects }) + '\n');
	console.log(`assets/ui/armas_hud.webp ${AW}×${AH} (${(fs.statSync(path.join(OUT, 'armas_hud.webp')).size / 1024).toFixed(0)} KB) —`, Object.entries(rects).map(([k, r]) => `${k} ${r[2]}×${r[3]}`).join(' · '));
})();
