// ============================================================================
// RoadArt — o desenho do TRÂNSITO (referência: a folha de sprites de ruas e sinalização). Tudo gerado por código no carregamento:
//
//   decals(scene)   atlas do CHÃO (1024²; alfa recortado — a tinta gasta vira buracos no alfa): rachaduras, buracos, remendos, manchas de
//                   óleo, tampas de bueiro (redonda e quadrada), boca de lobo, grelha, setas de faixa, "PARE", "ÔNIBUS", tinta branca e
//                   amarela gastas, a vala de obra. DECAL[nome] = [u0, v0, u1, v1] (v = 0 no topo da imagem).
//   signs(scene)    atlas das PLACAS (1024²): PARE, proibido estacionar/parar, velocidade 40/50/60/80, lombada, pedestre, curva, ponto de
//                   ônibus, obras, devagar; o verso cinza de cada formato; e as placas de NOME DE RUA (azul: rua; verde: avenida).
//   Geometria (MeshBatch; cores por vértice — `b` é o lote sólido, `f` o lote das faces do atlas de placas):
//     sign(b, f, x, z, fx, fz, kind)   placa num poste; (fx, fz) = para onde a face olha (para quem chega)
//     nameSign(b, f, x, z, a, b2)      poste de esquina com as duas placas de nome (a, b2: { i, dx, dz } — índice do nome e direção da rua)
//     busStop(b, f, x, z, fx, fz)      abrigo de ônibus (cobertura, vidro, banco, painel de anúncio); (fx, fz) = do abrigo para a rua
//     bin(b, x, z)                     lixeira laranja num poste
//     bump(b, x, z, tx, tz, hw)        quebra-molas amarelo e preto atravessando a pista (tx, tz = direção da via, hw = meia largura)
//     guardRail(b, P, k0, k1)          defensa metálica ao longo da polilinha P (pontos [x, z]) do índice k0 ao k1
//     jersey(b, x, z, tx, tz, len)     barreira de concreto (New Jersey)
//     cone(b, x, z) · sawhorse(b, x, z, tx, tz)   cone e cavalete (obras)
//     powerPole(b, x, z, rx, rz, opt)  poste de concreto com cruzeta, isoladores e (opt.trafo) transformador; (rx, rz) = a cruzeta
//     wire(b, p, q, sag, color)        fio entre dois pontos [x, y, z] com a barriga `sag` (m)
// ============================================================================

const RoadArt = {
	N: 1024, C: 128,
	DECAL: {}, SIGN: {}, NAMES: [],

	// ------------------------------------------------------------------ utilidades de desenho
	_canvas() { const c = document.createElement('canvas'); c.width = c.height = this.N; return c; },
	_tex(scene, canvas, name) {
		const ctx = canvas.getContext('2d'), img = ctx.getImageData(0, 0, this.N, this.N);
		const tex = BABYLON.RawTexture.CreateRGBATexture(new Uint8Array(img.data.buffer), this.N, this.N, scene, true, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
		tex.name = name; tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE; tex.hasAlpha = true; tex.anisotropicFilteringLevel = 4;
		return tex;
	},
	_mat(scene, name, tex) {
		const m = new BABYLON.StandardMaterial(name, scene);
		m.diffuseTexture = tex; m.specularColor = BABYLON.Color3.Black();
		m.useAlphaFromDiffuseTexture = true; m.transparencyMode = BABYLON.Material.MATERIAL_ALPHATEST; m.alphaCutOff = 0.5;
		return m;
	},
	_rect(T, name, c, r, w = 1, h = 1) { const N = this.N, C = this.C; T[name] = [c * C / N, r * C / N, (c + w) * C / N, (r + h) * C / N]; },
	// ruído de valor (blocos suaves): 0..1
	_noise(seed, cells) {
		const rng = Pixel.rng(seed), G = [];
		for (let i = 0; i < (cells + 1) * (cells + 1); i++) G.push(rng());
		return (u, v) => {
			const x = u * cells, y = v * cells, i = Math.min(cells - 1, Math.floor(x)), j = Math.min(cells - 1, Math.floor(y)), fx = x - i, fy = y - j;
			const s = (t) => t * t * (3 - 2 * t), a = G[j * (cells + 1) + i], b = G[j * (cells + 1) + i + 1], c = G[(j + 1) * (cells + 1) + i], d = G[(j + 1) * (cells + 1) + i + 1];
			return a + (b - a) * s(fx) + (c - a) * s(fy) + (a - b - c + d) * s(fx) * s(fy);
		};
	},
	// TINTA GASTA: apaga o alfa da célula em manchas (ruído) e pontinhos — a sinalização velha do asfalto
	_wear(ctx, x0, y0, w, h, amount, seed) {
		const img = ctx.getImageData(x0, y0, w, h), D = img.data, nz = this._noise(seed, 7), nz2 = this._noise(seed + 9, 23), rng = Pixel.rng(seed + 3);
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
			const i = (y * w + x) * 4;
			if (!D[i + 3]) continue;
			const k = nz(x / w, y / h) * 0.6 + nz2(x / w, y / h) * 0.4;
			if (k < amount || rng() < amount * 0.25) D[i + 3] = 0;
			else { const g = 0.86 + rng() * 0.14; D[i] *= g; D[i + 1] *= g; D[i + 2] *= g; }
		}
		ctx.putImageData(img, x0, y0);
	},
	_blob(ctx, cx, cy, r, jag, seed, n = 18) {
		const rng = Pixel.rng(seed);
		ctx.beginPath();
		for (let k = 0; k <= n; k++) { const a = k / n * Math.PI * 2, rr = r * (1 - jag + rng() * jag * 2); k ? ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
		ctx.closePath();
	},
	_crackPath(ctx, x, y, a, len, w, rng, depth) {
		ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y);
		for (let s = 0; s < len; s += 5) {
			a += (rng() - 0.5) * 0.9; x += Math.cos(a) * 5; y += Math.sin(a) * 5; ctx.lineTo(x, y);
			if (depth < 2 && rng() < 0.09) { ctx.stroke(); this._crackPath(ctx, x, y, a + (rng() < 0.5 ? 1 : -1) * (0.6 + rng() * 0.6), len * 0.45, Math.max(1.2, w * 0.7), rng, depth + 1); ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y); }
		}
		ctx.stroke();
	},

	// ================================================================== atlas do chão
	decals(scene) {
		if (this._dMat) return this._dMat;
		const cv = this._canvas(), ctx = cv.getContext('2d'), C = this.C, D = this.DECAL;
		ctx.lineCap = 'round'; ctx.lineJoin = 'round';
		// --- rachaduras (linha 0, colunas 0–5)
		for (let k = 0; k < 6; k++) {
			const rng = Pixel.rng(101 + k * 7), ox = k * C;
			// (trinca selada com piche: faixa escura LARGA e macia, um pouco mais escura que o asfalto — não o risco preto fino, que na tela
			// lia como rabisco)
			const n = 1 + (k % 2), paths = [];
			for (let j = 0; j < n; j++) paths.push([ox + 22 + rng() * 26, 34 + rng() * 60, (rng() - 0.5) * 1.0, 50 + rng() * 40, 900 + k * 13 + j]);
			for (const [w, col] of [[7, 'rgba(46,46,49,1)'], [3.2, 'rgba(36,36,39,1)']]) { ctx.strokeStyle = col; for (const p of paths) { const r2 = Pixel.rng(p[4]); this._crackPath(ctx, p[0], p[1], p[2], p[3], w, () => 0.5 + (r2() - 0.5) * 0.6, 2); } }
			if (k >= 4) {                                                       // couro de jacaré: malha de trincas finas, discreta
				ctx.strokeStyle = 'rgba(44,44,47,1)';
				for (let j = 0; j < 7; j++) { const cx = ox + 30 + rng() * 68, cy = 30 + rng() * 68; this._crackPath(ctx, cx, cy, rng() * 6.28, 14 + rng() * 14, 2.2, rng, 2); }
			}
			this._rect(D, 'crack' + k, k, 0);
		}
		// --- manchas de óleo (linha 0, colunas 6–7)
		for (let k = 0; k < 2; k++) {
			const ox = (6 + k) * C, nz = this._noise(211 + k, 6), img = ctx.getImageData(ox, 0, C, C);
			for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
				const dx = (x - 64) / 58, dy = (y - 64) / (k ? 40 : 56), r = Math.sqrt(dx * dx + dy * dy), q = 1 - r + (nz(x / C, y / C) - 0.5) * 0.7;
				if (q <= 0.05) continue;
				const i = (y * C + x) * 4, t = Math.min(1, q * 1.6);
				img.data[i] = 24 + 14 * (1 - t); img.data[i + 1] = 22 + 12 * (1 - t); img.data[i + 2] = 22 + 8 * (1 - t); img.data[i + 3] = 255;
			}
			ctx.putImageData(img, ox, 0);
			this._rect(D, 'oil' + k, 6 + k, 0);
		}
		// --- buracos (linha 1, colunas 0–2): borda quebrada clara, fundo escuro com cascalho e rachaduras saindo
		for (let k = 0; k < 3; k++) {
			const ox = k * C, oy = C, cx = ox + 64, cy = oy + 64, r = 30 + k * 9, rng = Pixel.rng(301 + k);
			ctx.strokeStyle = 'rgba(24,24,26,1)';
			for (let j = 0; j < 4; j++) { const a = rng() * 6.28; this._crackPath(ctx, cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8, a, 26 + rng() * 20, 2, rng, 1); }
			this._blob(ctx, cx, cy, r + 4, 0.22, 310 + k); ctx.fillStyle = 'rgb(96,93,88)'; ctx.fill();
			this._blob(ctx, cx, cy, r, 0.22, 310 + k); ctx.fillStyle = 'rgb(34,33,32)'; ctx.fill();
			this._blob(ctx, cx + 3, cy + 4, r * 0.7, 0.25, 320 + k); ctx.fillStyle = 'rgb(20,19,19)'; ctx.fill();
			for (let j = 0; j < 40; j++) { const a = rng() * 6.28, d = rng() * r * 0.85; ctx.fillStyle = rng() < 0.5 ? 'rgb(78,75,70)' : 'rgb(56,54,52)'; ctx.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2 + rng() * 3, 2 + rng() * 2); }
			if (k === 2) { this._blob(ctx, cx - 6, cy + 6, r * 0.45, 0.2, 330); ctx.fillStyle = 'rgba(60,72,80,1)'; ctx.fill(); }      // poça no fundo
			this._rect(D, 'pot' + k, k, 1);
		}
		// --- remendos (linha 1, colunas 3–5): asfalto novo mais escuro, borda de corte
		for (let k = 0; k < 3; k++) {
			const ox = (3 + k) * C, oy = C, rng = Pixel.rng(401 + k), w = 84 + k * 14, h = 64 + k * 10, x0 = ox + 64 - w / 2, y0 = oy + 64 - h / 2;
			ctx.fillStyle = 'rgb(54,54,57)'; ctx.fillRect(x0 - 2, y0 - 2, w + 4, h + 4);
			ctx.fillStyle = 'rgb(80,80,84)'; ctx.fillRect(x0, y0, w, h);
			for (let j = 0; j < 320; j++) { const g = 66 + rng() * 30; ctx.fillStyle = `rgb(${g},${g},${g + 3})`; ctx.fillRect(x0 + rng() * w, y0 + rng() * h, 2, 2); }
			if (k === 1) { ctx.fillStyle = 'rgb(92,92,95)'; ctx.fillRect(x0 + w * 0.5, y0 + h * 0.2, w * 0.45, h * 0.7); ctx.fillStyle = 'rgb(54,54,57)'; ctx.fillRect(x0 + w * 0.5, y0 + h * 0.2, 2, h * 0.7); }
			this._rect(D, 'patch' + k, 3 + k, 1);
		}
		// --- tampa de bueiro redonda (linha 1, coluna 6) e quadrada (coluna 7)
		{
			const cx = 6 * C + 64, cy = C + 64;
			ctx.fillStyle = 'rgb(70,68,66)'; ctx.beginPath(); ctx.arc(cx, cy, 52, 0, 7); ctx.fill();
			ctx.fillStyle = 'rgb(52,48,45)'; ctx.beginPath(); ctx.arc(cx, cy, 46, 0, 7); ctx.fill();
			ctx.strokeStyle = 'rgb(84,78,72)'; ctx.lineWidth = 3;
			for (let r = 14; r < 46; r += 10) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke(); }
			for (let a = 0; a < 6.28; a += 0.785) { ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14); ctx.lineTo(cx + Math.cos(a) * 44, cy + Math.sin(a) * 44); ctx.stroke(); }
			ctx.fillStyle = 'rgb(52,48,45)'; ctx.fillRect(cx - 30, cy - 9, 60, 18);
			ctx.fillStyle = 'rgb(98,92,84)'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('ESGOTO', cx, cy + 1);
			this._rect(D, 'mhRound', 6, 1);
			const ox = 7 * C + 18, oy = C + 18;
			ctx.fillStyle = 'rgb(120,118,112)'; ctx.fillRect(ox - 4, oy - 4, 100, 100);
			ctx.fillStyle = 'rgb(58,54,50)'; ctx.fillRect(ox, oy, 92, 92);
			ctx.strokeStyle = 'rgb(80,74,68)'; ctx.lineWidth = 3;
			for (let d = -92; d < 92; d += 12) { ctx.beginPath(); ctx.moveTo(ox + Math.max(0, d), oy + Math.max(0, -d)); ctx.lineTo(ox + Math.min(92, 92 + d), oy + Math.min(92, 92 - d)); ctx.stroke(); }
			this._rect(D, 'mhSquare', 7, 1);
		}
		// --- boca de lobo (linha 2, colunas 0–1): grelha comprida na beira da rua; grelha pequena (coluna 2)
		{
			const ox = 10, oy = 2 * C + 34, w = 236, h = 60;
			ctx.fillStyle = 'rgb(150,148,142)'; ctx.fillRect(ox - 6, oy - 6, w + 12, h + 12);
			ctx.fillStyle = 'rgb(16,16,18)'; ctx.fillRect(ox, oy, w, h);
			ctx.fillStyle = 'rgb(74,72,70)';
			for (let x = ox + 4; x < ox + w - 4; x += 11) ctx.fillRect(x, oy + 3, 5, h - 6);
			ctx.fillRect(ox, oy + h / 2 - 2, w, 4);
			this._rect(D, 'drain', 0, 2, 2, 1);
			const gx = 2 * C + 24, gy = 2 * C + 24;
			ctx.fillStyle = 'rgb(140,138,132)'; ctx.fillRect(gx - 4, gy - 4, 88, 88);
			ctx.fillStyle = 'rgb(16,16,18)'; ctx.fillRect(gx, gy, 80, 80);
			ctx.fillStyle = 'rgb(76,74,72)'; for (let y = gy + 3; y < gy + 78; y += 9) ctx.fillRect(gx + 3, y, 74, 4);
			this._rect(D, 'grate', 2, 2);
		}
		// --- setas de faixa (linhas 3–4: células de 1 × 2, a ponta para cima = para onde o carro vai)
		const W = 'rgb(236,236,230)', Y = 'rgb(238,188,40)';
		const arrow = (ox, oy, kind) => {
			ctx.fillStyle = W;
			const shaft = (x, y0, y1) => ctx.fillRect(x - 9, y0, 18, y1 - y0);
			const head = (x, y, dir) => { ctx.beginPath(); if (dir === 'up') { ctx.moveTo(x, y); ctx.lineTo(x - 28, y + 48); ctx.lineTo(x + 28, y + 48); } else { const s = dir === 'right' ? 1 : -1; ctx.moveTo(x + s * 44, y); ctx.lineTo(x, y - 26); ctx.lineTo(x, y + 26); } ctx.closePath(); ctx.fill(); };
			const cx = ox + 64;
			if (kind === 'S') { shaft(cx, oy + 60, oy + 240); head(cx, oy + 14, 'up'); }
			else if (kind === 'R' || kind === 'L') { const s = kind === 'R' ? 1 : -1, x = cx - s * 16; shaft(x, oy + 110, oy + 240); ctx.fillRect(Math.min(x, x + s * 30) - 9 * (s < 0), oy + 101, 30 + 9, 18); head(x + s * 28, oy + 110, kind === 'R' ? 'right' : 'left'); }
			else { const s = kind === 'SR' ? 1 : -1, x = cx - s * 14; shaft(x, oy + 60, oy + 240); head(x, oy + 14, 'up'); ctx.fillRect(Math.min(x, x + s * 26), oy + 141, 26, 18); head(x + s * 24, oy + 150, s > 0 ? 'right' : 'left'); }
		};
		['S', 'R', 'L', 'SR', 'SL'].forEach((k, i) => { arrow(i * C, 3 * C, k); this._rect(D, 'arrow' + k, i, 3, 1, 2); this._wear(ctx, i * C, 3 * C, C, 2 * C, 0.2, 501 + i); });
		// --- textos (linha 5): PARE (colunas 0–1, branco) e ÔNIBUS (colunas 2–3, amarelo); estreitos e altos, como a tinta da rua
		const text = (s, col, ox, oy, w, h, seed) => {
			ctx.save(); ctx.fillStyle = col; ctx.font = 'bold 100px "Arial Narrow", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
			const m = ctx.measureText(s).width; ctx.translate(ox + w / 2, oy + h / 2 + 4); ctx.scale(Math.min(1.4, (w - 16) / m), 1.18); ctx.fillText(s, 0, 0); ctx.restore();
			this._wear(ctx, ox, oy, w, h, 0.2, seed);
		};
		text('PARE', W, 0, 5 * C, 2 * C, C, 601); this._rect(D, 'pare', 0, 5, 2, 1);
		text('ÔNIBUS', Y, 2 * C, 5 * C, 2 * C, C, 602); this._rect(D, 'onibus', 2, 5, 2, 1);
		// --- tinta lisa gasta (linha 5, colunas 4–5): branca (linha de retenção) e amarela; a vala de obra (coluna 6) e terra (7)
		ctx.fillStyle = W; ctx.fillRect(4 * C, 5 * C, C, C); this._wear(ctx, 4 * C, 5 * C, C, C, 0.22, 611); this._rect(D, 'paint', 4, 5);
		ctx.fillStyle = Y; ctx.fillRect(5 * C, 5 * C, C, C); this._wear(ctx, 5 * C, 5 * C, C, C, 0.22, 612); this._rect(D, 'paintY', 5, 5);
		{
			const ox = 6 * C, oy = 5 * C, rng = Pixel.rng(701);
			this._blob(ctx, ox + 64, oy + 64, 58, 0.12, 702, 24); ctx.fillStyle = 'rgb(92,68,46)'; ctx.fill();
			this._blob(ctx, ox + 64, oy + 64, 44, 0.15, 703, 24); ctx.fillStyle = 'rgb(46,33,24)'; ctx.fill();
			for (let j = 0; j < 70; j++) { ctx.fillStyle = rng() < 0.5 ? 'rgb(120,92,62)' : 'rgb(70,52,36)'; ctx.fillRect(ox + 10 + rng() * 108, oy + 10 + rng() * 108, 3 + rng() * 4, 3 + rng() * 3); }
			this._rect(D, 'dig', 6, 5);
			const ox2 = 7 * C, nz = this._noise(711, 5), img = ctx.getImageData(ox2, oy, C, C);
			for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
				const r = Math.hypot(x - 64, y - 64) / 60, q = 1 - r + (nz(x / C, y / C) - 0.5) * 0.8;
				if (q < 0.1) continue;
				const i = (y * C + x) * 4, g = rng();
				img.data[i] = 110 + g * 30; img.data[i + 1] = 86 + g * 22; img.data[i + 2] = 60 + g * 16; img.data[i + 3] = 255;
			}
			ctx.putImageData(img, ox2, oy); this._rect(D, 'dirt', 7, 5);
		}
		this.decalTex = this._tex(scene, cv, 'roadDecals');
		this._dMat = this._mat(scene, 'roadDecals', this.decalTex);
		this._dMat.zOffset = -2;                               // (por cima do asfalto, sem brigar pela profundidade)
		return this._dMat;
	},

	// ================================================================== atlas das placas
	SIGNS: {
		pare: { c: [0, 0], shape: 'oct', s: 0.75 }, noPark: { c: [1, 0], shape: 'circle', s: 0.62 }, noStop: { c: [2, 0], shape: 'circle', s: 0.62 },
		v40: { c: [3, 0], shape: 'circle', s: 0.62 }, v50: { c: [4, 0], shape: 'circle', s: 0.62 }, v60: { c: [5, 0], shape: 'circle', s: 0.62 }, v80: { c: [6, 0], shape: 'circle', s: 0.62 },
		lombada: { c: [7, 0], shape: 'diamond', s: 0.75 }, pedestre: { c: [0, 1], shape: 'diamond', s: 0.75 }, curvaD: { c: [1, 1], shape: 'diamond', s: 0.75 },
		curvaE: { c: [2, 1], shape: 'diamond', s: 0.75 }, onibus: { c: [3, 1], shape: 'rect', s: 0.6 }, obras: { c: [4, 1], shape: 'diamond', s: 0.8 },
		devagar: { c: [5, 1], shape: 'rect', s: 0.75 },
	},
	BACK: { oct: [6, 1], circle: [7, 1], diamond: [0, 2], rect: [1, 2] },
	PLATE_Y: 384,
	// nomes das ruas (fictícios): rua (azul) e avenida (verde)
	RUAS: ['R. DAS FLORES', 'R. DA PAZ', 'R. SÃO JOÃO', 'R. SETE DE SETEMBRO', 'R. DAS ACÁCIAS', 'R. DO OUVIDOR', 'R. SANTA LUZIA', 'R. DA CONCEIÇÃO',
		'R. DOS ANDRADAS', 'R. DA ALFÂNDEGA', 'R. DO CATETE', 'R. DAS PALMEIRAS', 'R. BOA VISTA', 'R. DO ROSÁRIO', 'R. DOS INVÁLIDOS', 'R. DA ASSEMBLEIA',
		'R. DO LAVRADIO', 'R. SÃO BENTO', 'R. DAS MARRECAS', 'R. DO SENADO', 'R. DA QUITANDA', 'R. DOS ARCOS', 'R. DO MERCADO', 'R. DA LAPA',
		'R. DO RIACHUELO', 'R. CARIOCA', 'R. DOS OURIVES', 'R. DO PASSEIO', 'R. VISCONDE DE PIRAJÁ', 'R. DAS LARANJEIRAS', 'R. DO CATUMBI', 'R. DO MATOSO'],
	AVES: ['AV. CENTRAL', 'AV. BEIRA-MAR', 'AV. DO CONTORNO', 'AV. DAS AMÉRICAS', 'AV. INDEPENDÊNCIA', 'AV. DOS ESTADOS', 'AV. ATLÂNTICA', 'AV. DO PORTO'],

	signs(scene) {
		if (this._sMat) return this._sMat;
		const cv = this._canvas(), ctx = cv.getContext('2d'), C = this.C;
		const R = '#c8102e', WH = '#f4f4f0', K = '#141414', YE = '#f2c200', OR = '#f07a14', BL = '#1d4f9c', GR = '#1b7a44';
		const shapePath = (shape, cx, cy, r) => {
			ctx.beginPath();
			if (shape === 'oct') for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2; k ? ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
			else if (shape === 'circle') ctx.arc(cx, cy, r, 0, Math.PI * 2);
			else if (shape === 'diamond') { ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); }
			else ctx.rect(cx - r * 0.82, cy - r, r * 1.64, r * 2);
			ctx.closePath();
		};
		const cell = (k) => [k[0] * C + C / 2, k[1] * C + C / 2];
		const draw = (name, fn) => { const S = this.SIGNS[name], [cx, cy] = cell(S.c); fn(cx, cy); this._rect(this.SIGN, name, S.c[0], S.c[1]); };
		const label = (t, cx, cy, size, col, w = 0) => { ctx.save(); ctx.fillStyle = col; ctx.font = `bold ${size}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const m = ctx.measureText(t).width; ctx.translate(cx, cy); if (w && m > w) ctx.scale(w / m, 1); ctx.fillText(t, 0, 0); ctx.restore(); };
		draw('pare', (x, y) => { shapePath('oct', x, y, 62); ctx.fillStyle = WH; ctx.fill(); shapePath('oct', x, y, 56); ctx.fillStyle = R; ctx.fill(); label('PARE', x, y + 2, 38, WH, 96); });
		const ring = (x, y) => { ctx.beginPath(); ctx.arc(x, y, 62, 0, 7); ctx.fillStyle = R; ctx.fill(); ctx.beginPath(); ctx.arc(x, y, 50, 0, 7); ctx.fillStyle = WH; ctx.fill(); };
		const slash = (x, y, a) => { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = R; ctx.fillRect(-52, -6, 104, 12); ctx.restore(); };
		draw('noPark', (x, y) => { ring(x, y); label('E', x, y + 3, 64, K); slash(x, y, Math.PI / 4); });
		draw('noStop', (x, y) => { ring(x, y); label('E', x, y + 3, 64, K); slash(x, y, Math.PI / 4); slash(x, y, -Math.PI / 4); });
		for (const v of [40, 50, 60, 80]) draw('v' + v, (x, y) => { ring(x, y); label(String(v), x, y - 2, 52, K); label('km/h', x, y + 30, 14, K); });
		const warn = (x, y, col = YE) => { shapePath('diamond', x, y, 62); ctx.fillStyle = K; ctx.fill(); shapePath('diamond', x, y, 56); ctx.fillStyle = col; ctx.fill(); };
		draw('lombada', (x, y) => { warn(x, y); ctx.fillStyle = K; ctx.beginPath(); ctx.moveTo(x - 34, y + 14); ctx.quadraticCurveTo(x, y - 30, x + 34, y + 14); ctx.closePath(); ctx.fill(); ctx.fillRect(x - 38, y + 14, 76, 6); });
		draw('pedestre', (x, y) => {
			warn(x, y); ctx.fillStyle = K; ctx.strokeStyle = K; ctx.lineWidth = 7; ctx.lineCap = 'round';
			ctx.beginPath(); ctx.arc(x + 4, y - 28, 7, 0, 7); ctx.fill();
			ctx.beginPath(); ctx.moveTo(x + 2, y - 18); ctx.lineTo(x - 2, y + 6); ctx.moveTo(x - 2, y + 6); ctx.lineTo(x - 14, y + 28); ctx.moveTo(x - 2, y + 6); ctx.lineTo(x + 12, y + 26); ctx.moveTo(x + 1, y - 12); ctx.lineTo(x - 14, y - 2); ctx.moveTo(x + 1, y - 12); ctx.lineTo(x + 14, y - 4); ctx.stroke();
		});
		const curve = (x, y, s) => { warn(x, y); ctx.strokeStyle = K; ctx.lineWidth = 10; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(x - s * 6, y + 34); ctx.lineTo(x - s * 6, y); ctx.quadraticCurveTo(x - s * 6, y - 16, x + s * 12, y - 16); ctx.stroke(); ctx.fillStyle = K; ctx.beginPath(); ctx.moveTo(x + s * 30, y - 16); ctx.lineTo(x + s * 10, y - 32); ctx.lineTo(x + s * 10, y); ctx.closePath(); ctx.fill(); };
		draw('curvaD', (x, y) => curve(x, y, 1));
		draw('curvaE', (x, y) => curve(x, y, -1));
		draw('onibus', (x, y) => {
			shapePath('rect', x, y, 60); ctx.fillStyle = WH; ctx.fill(); shapePath('rect', x, y, 55); ctx.fillStyle = BL; ctx.fill();
			ctx.fillStyle = WH; ctx.fillRect(x - 30, y - 34, 60, 34); ctx.fillStyle = BL; ctx.fillRect(x - 26, y - 30, 52, 14);
			ctx.beginPath(); ctx.arc(x - 18, y + 2, 6, 0, 7); ctx.arc(x + 18, y + 2, 6, 0, 7); ctx.fillStyle = WH; ctx.fill();
			label('PONTO DE', x, y + 24, 13, WH, 84); label('ÔNIBUS', x, y + 40, 15, WH, 84);
		});
		draw('obras', (x, y) => {
			warn(x, y, OR); ctx.fillStyle = K; ctx.strokeStyle = K; ctx.lineWidth = 7; ctx.lineCap = 'round';
			ctx.beginPath(); ctx.arc(x - 6, y - 26, 7, 0, 7); ctx.fill();
			ctx.beginPath(); ctx.moveTo(x - 6, y - 16); ctx.lineTo(x - 2, y + 6); ctx.lineTo(x - 14, y + 28); ctx.moveTo(x - 2, y + 6); ctx.lineTo(x + 8, y + 26); ctx.moveTo(x - 4, y - 10); ctx.lineTo(x + 18, y + 2); ctx.stroke();
			ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + 18, y + 2); ctx.lineTo(x + 26, y + 26); ctx.stroke();
			ctx.beginPath(); ctx.moveTo(x + 16, y + 30); ctx.quadraticCurveTo(x + 30, y + 14, x + 40, y + 30); ctx.closePath(); ctx.fill();
		});
		draw('devagar', (x, y) => { shapePath('rect', x, y, 60); ctx.fillStyle = K; ctx.fill(); shapePath('rect', x, y, 55); ctx.fillStyle = OR; ctx.fill(); label('DEVAGAR', x, y - 12, 20, K, 84); label('OBRAS', x, y + 16, 24, K, 84); });
		// versos (cinza galvanizado, o mesmo formato)
		for (const [shape, c] of Object.entries(this.BACK)) {
			const [x, y] = cell(c);
			shapePath(shape, x, y, shape === 'circle' ? 62 : shape === 'rect' ? 60 : 62); ctx.fillStyle = '#8c9096'; ctx.fill();
			ctx.strokeStyle = '#6e7278'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - 3, y - 50); ctx.lineTo(x - 3, y + 50); ctx.stroke();
			this._rect(this.SIGN, 'back_' + shape, c[0], c[1]);
		}
		// placas de nome de rua: 256 × 64, a partir de PLATE_Y
		const names = this.NAMES = this.RUAS.map((t) => ({ t, ave: false })).concat(this.AVES.map((t) => ({ t, ave: true })));
		names.forEach((n, i) => {
			const x = (i % 4) * 256, y = this.PLATE_Y + Math.floor(i / 4) * 64;
			ctx.fillStyle = WH; ctx.fillRect(x + 4, y + 6, 248, 52); ctx.fillStyle = n.ave ? GR : BL; ctx.fillRect(x + 8, y + 10, 240, 44);
			label(n.t, x + 128, y + 33, 30, WH, 224);
			n.uv = [x / this.N, y / this.N, (x + 256) / this.N, (y + 64) / this.N];
		});
		this.signTex = this._tex(scene, cv, 'roadSigns');
		this._sMat = this._mat(scene, 'roadSigns', this.signTex);
		this._sMat.emissiveColor = new BABYLON.Color3(0.32, 0.32, 0.32);      // (película refletiva: a placa não some contra o sol nem à noite)
		return this._sMat;
	},
	// índice do nome para uma rua (estável: o mesmo eixo, o mesmo nome)
	nameIndex(key, ave) {
		let h = 2166136261; const s = String(key);
		for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
		h = (h >>> 0);
		return ave ? this.RUAS.length + h % this.AVES.length : h % this.RUAS.length;
	},

	// ================================================================== geometria
	// quad vertical texturizado (face do atlas de placas) centrado em (x, y, z), largura w e altura h, olhando para (fx, fz)
	_face(f, x, y, z, fx, fz, w, h, uv) {
		const rx = fz, rz = -fx, hw = w / 2, hh = h / 2, [u0, v0, u1, v1] = uv;
		// do ponto de vista de quem olha para a face (de frente: está em +f), a direita da imagem é -r
		const A = [x + rx * hw, y + hh, z + rz * hw], B = [x - rx * hw, y + hh, z - rz * hw], Cc = [x + rx * hw, y - hh, z + rz * hw], D = [x - rx * hw, y - hh, z - rz * hw];
		f.tri(A, B, D, [fx, 0, fz], [[u0, v0], [u1, v0], [u1, v1]]);
		f.tri(A, D, Cc, [fx, 0, fz], [[u0, v0], [u1, v1], [u0, v1]]);
	},
	POLE: [0.6, 0.62, 0.66],
	sign(b, f, x, z, fx, fz, kind, h = 2.3) {
		const S = this.SIGNS[kind] || this.SIGNS.pare, sz = S.s, w = S.shape === 'rect' ? sz * 0.82 : sz;
		b.cyl(x, z, 0.035, 0, h + sz * 0.45, this.POLE, 6);
		const o = 0.05;                                                      // a placa fica na frente do poste
		this._face(f, x + fx * o, h, z + fz * o, fx, fz, w, sz, this.SIGN[kind]);
		this._face(f, x + fx * (o - 0.012), h, z + fz * (o - 0.012), -fx, -fz, w, sz, this.SIGN['back_' + S.shape]);
	},
	nameSign(b, f, x, z, A, B) {
		b.cyl(x, z, 0.04, 0, 3.05, this.POLE, 6);
		const plate = (P, y) => {
			const n = this.NAMES[P.i]; if (!n) return;
			const cx = x + P.dx * 0.62, cz = z + P.dz * 0.62, fx = -P.dz, fz = P.dx;      // a placa corre ao longo da rua: a face olha para o lado
			b.obox(cx, cz, P.dx, P.dz, 0.62, 0.012, y - 0.15, y + 0.15, [0.75, 0.77, 0.8]);
			this._face(f, cx + fx * 0.014, y, cz + fz * 0.014, fx, fz, 1.24, 0.31, n.uv);
			this._face(f, cx - fx * 0.014, y, cz - fz * 0.014, -fx, -fz, 1.24, 0.31, n.uv);
		};
		if (A) plate(A, 2.85);
		if (B) plate(B, 2.5);
	},
	busStop(b, f, x, z, fx, fz) {
		const rx = fz, rz = -fx, L = 2.1, D = 0.75;                           // meio comprimento (ao longo da rua) e meia profundidade
		const P = (l, d) => [x + rx * l + fx * d, z + rz * l + fz * d];
		const steel = [0.32, 0.34, 0.38], glass = [0.62, 0.74, 0.8], roof = [0.24, 0.26, 0.3];
		for (const [l, d] of [[-L + 0.1, -D + 0.1], [L - 0.1, -D + 0.1], [-L + 0.1, D - 0.15], [L - 0.1, D - 0.15]]) { const p = P(l, d); b.cyl(p[0], p[1], 0.05, 0, 2.55, steel, 6); }
		let p = P(0, 0); b.obox(p[0], p[1], rx, rz, L + 0.2, D + 0.15, 2.55, 2.65, roof);                 // cobertura
		p = P(0, 0.05); b.obox(p[0], p[1], rx, rz, L + 0.25, D + 0.05, 2.65, 2.68, [0.5, 0.56, 0.62]);
		p = P(0, -D + 0.1); b.obox(p[0], p[1], rx, rz, L - 0.15, 0.025, 0.3, 2.3, glass);              // vidro do fundo
		p = P(-L + 0.1, 0); b.obox(p[0], p[1], rx, rz, 0.04, D - 0.2, 0.25, 2.3, [0.92, 0.92, 0.9]);   // painel de anúncio (moldura)
		p = P(-L + 0.1, 0); b.obox(p[0], p[1], rx, rz, 0.05, D - 0.3, 0.4, 2.15, [0.9, 0.45, 0.2]);     // anúncio (cor)
		p = P(-L + 0.1, 0.15); b.obox(p[0], p[1], rx, rz, 0.06, 0.2, 0.9, 1.7, [0.98, 0.86, 0.3]);
		p = P(0.2, -D + 0.35); b.obox(p[0], p[1], rx, rz, L - 0.6, 0.2, 0.42, 0.5, [0.55, 0.38, 0.22]);       // banco
		for (const l of [-L + 0.8, L - 0.5]) { p = P(l, -D + 0.35); b.obox(p[0], p[1], rx, rz, 0.04, 0.18, 0, 0.42, steel); }
		// placa do ponto num poste ao lado, olhando para a rua
		p = P(L + 0.5, D - 0.2); this.sign(b, f, p[0], p[1], fx, fz, 'onibus', 2.3);
	},
	bin(b, x, z) {
		b.cyl(x, z, 0.035, 0, 1.15, this.POLE, 5);
		b.cyl(x + 0.17, z, 0.17, 0.55, 1.05, [0.95, 0.45, 0.12], 8);
		b.cyl(x + 0.17, z, 0.18, 1.02, 1.07, [0.85, 0.38, 0.1], 8);
	},
	bump(b, x, z, tx, tz, hw) {
		const lx = -tz, lz = tx, step = 0.9;
		for (let l = -hw, k = 0; l < hw - 0.01; l += step, k++) {
			const w = Math.min(step, hw - l), c = l + w / 2;
			b.obox(x + lx * c, z + lz * c, tx, tz, 0.85, w / 2, 0, 0.12, k % 2 ? [0.12, 0.12, 0.13] : [0.95, 0.76, 0.12], 0.3, w / 2);
		}
	},
	guardRail(b, P, k0, k1, side) {
		const gal = [0.68, 0.7, 0.74], post = [0.45, 0.47, 0.5];
		for (let k = k0; k < k1; k++) {
			const a = P[k], c = P[k + 1], dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz) || 1, tx = dx / L, tz = dz / L, mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
			b.obox(mx, mz, tx, tz, L / 2 + 0.05, 0.05, 0.52, 0.82, gal);
			b.obox(mx - tz * side * 0.03, mz + tx * side * 0.03, tx, tz, L / 2 + 0.05, 0.03, 0.64, 0.7, [0.5, 0.52, 0.56]);
			for (let s = 0; s < L; s += 2) { const px = a[0] + tx * s - tz * side * 0.1, pz = a[1] + tz * s + tx * side * 0.1; b.obox(px, pz, tx, tz, 0.06, 0.06, 0, 0.78, post); }
		}
	},
	jersey(b, x, z, tx, tz, len) {
		b.obox(x, z, tx, tz, len / 2, 0.3, 0, 0.18, [0.7, 0.7, 0.68], len / 2, 0.24);
		b.obox(x, z, tx, tz, len / 2, 0.24, 0.18, 0.82, [0.76, 0.76, 0.73], len / 2, 0.1);
		b.obox(x, z, tx, tz, len / 2 - 0.3, 0.245, 0.3, 0.42, [0.62, 0.5, 0.36], len / 2 - 0.4, 0.22);      // mancha de barro
	},
	cone(b, x, z) {
		b.solid(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 0, 0.04, [0.1, 0.1, 0.1]);
		b.tube([x, 0.04, z], [x, 0.36, z], 0.16, 0.1, [1, 0.42, 0.06], 8);
		b.tube([x, 0.36, z], [x, 0.5, z], 0.1, 0.065, [0.96, 0.96, 0.94], 8);
		b.tube([x, 0.5, z], [x, 0.72, z], 0.065, 0.015, [1, 0.42, 0.06], 8);
	},
	sawhorse(b, x, z, tx, tz) {
		const lx = -tz, lz = tx, wood = [0.55, 0.38, 0.22];
		for (const s of [-0.65, 0.65]) for (const d of [-1, 1]) b.tube([x + tx * s + lx * d * 0.32, 0, z + tz * s + lz * d * 0.32], [x + tx * s, 1.0, z + tz * s], 0.035, 0.035, wood, 4);
		for (const [y, h] of [[0.85, 0.2], [0.45, 0.18]]) for (let k = 0; k < 6; k++) {
			const s = -0.75 + k * 0.25 + 0.125;
			b.obox(x + tx * s + lx * 0.04, z + tz * s + lz * 0.04, tx, tz, 0.125, 0.025, y - h / 2, y + h / 2, k % 2 ? [0.97, 0.97, 0.95] : [1, 0.45, 0.08]);
		}
	},
	powerPole(b, x, z, rx, rz, opt = {}) {
		const con = [0.66, 0.65, 0.62], H = 8.2;
		b.tube([x, 0, z], [x, H, z], 0.17, 0.1, con, 6);
		b.obox(x, z, rx, rz, 1.0, 0.06, H - 0.75, H - 0.62, [0.42, 0.33, 0.24]);                          // cruzeta
		for (const s of [-0.85, 0, 0.85]) { const px = x + rx * s, pz = z + rz * s; b.cyl(px, pz, 0.045, H - 0.62, H - 0.45, [0.82, 0.84, 0.86], 5); }
		b.obox(x, z, rx, rz, 0.55, 0.05, H - 1.55, H - 1.45, [0.38, 0.38, 0.4]);                          // braço da baixa tensão
		if (opt.trafo) {
			const px = x - rz * 0.38, pz = z + rx * 0.38;
			b.cyl(px, pz, 0.3, H - 3.3, H - 2.2, [0.5, 0.53, 0.55], 8);
			b.cyl(px, pz, 0.31, H - 2.25, H - 2.15, [0.4, 0.42, 0.44], 8);
			for (const s of [-0.12, 0.12]) b.cyl(px + rx * s, pz + rz * s, 0.04, H - 2.15, H - 1.95, [0.82, 0.84, 0.86], 4);
		}
		if (opt.lamp) {                                                                                      // luminária presa no poste (periferia)
			const hx = x + opt.lamp[0] * 1.6, hz = z + opt.lamp[1] * 1.6;
			b.tube([x, 6.0, z], [hx, 6.2, hz], 0.04, 0.035, [0.3, 0.31, 0.34], 4);
			b.obox(hx, hz, opt.lamp[0], opt.lamp[1], 0.28, 0.12, 6.05, 6.25, [0.3, 0.31, 0.34]);
		}
		b.obox(x, z, 1, 0, 0.11, 0.11, 2.5, 2.8, [0.95, 0.85, 0.1]);                                        // faixa amarela (placa de identificação)
		return H;
	},
	wire(b, p, q, sag, color = [0.07, 0.07, 0.08], r = 0.02, n = 6) {
		let prev = p;
		for (let k = 1; k <= n; k++) {
			const t = k / n, y = p[1] + (q[1] - p[1]) * t - sag * 4 * t * (1 - t);
			const cur = [p[0] + (q[0] - p[0]) * t, y, p[2] + (q[2] - p[2]) * t];
			b.tube(prev, cur, r, r, color, 3);
			prev = cur;
		}
	},
};
