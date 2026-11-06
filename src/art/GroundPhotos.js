// ============================================================================
// GroundPhotos — o CHÃO com texturas de foto CC0 (etapa 3 do upgrade visual; Poly Haven e ambientCG, domínio público: assets/textures/ground,
// créditos em assets/textures/ground/CREDITS.md). PADRÃO (escolhido pelas capturas): o MISTO com o RELEVO (Config.art.groundPhotos,
// groundMixed, groundBump). `?chao=0` = o chão só pintado de antes; `?chao=foto` = a foto no lugar do pintado (ficou de fora).
// O RELEVO: o mapa de normais da mesma foto, no mesmo ladrilho, como bumpTexture do material — o grão do asfalto, as juntas da
// calçada e as folhas da grama pegam o sol e a sombra de verdade.
//
// Os ladrilhos do chão continuam os do CityHD (mesmo tamanho no mundo, mesmas UVs). A foto repete no período dela (`period`, em px
// da arte, 20 px/u — divisor do ladrilho nos eixos em que ele repete, para não ter emenda). No misto, o ladrilho é o pintado e a
// foto entra só como grão (detail). Em `?chao=foto`, a BASE pintada dá lugar à foto recolorida para a cor média do piso de antes
// (_recolor), e o que é desenho continua por cima: faixas, tachões, sarjeta, trilhas de pneu.
// As fotos são carregadas na carga (main.js, junto da arte), ANTES de o mundo ser montado: o CityHD pinta os ladrilhos na hora.
// ============================================================================

const GroundPhotos = {
	BASE: 'assets/textures/ground/',
	// tipo de ladrilho → { foto, período (px da arte), cor média alvo (a da paleta pintada), contraste do detalhe }
	// A foto é RECOLORIDA para a cor média do piso de antes (ganho por canal) — o material é o da foto, a identidade de cor é a do
	// jogo. `k` aumenta (> 1) ou suaviza (< 1) o detalhe em volta da média.
	// CHÃO REALISTA (padrão desde a etapa do chão de foto): a foto é a BASE do ladrilho; `c` = a cor média alvo (null = a da própria foto);
	// pw/ph = período por eixo quando o ladrilho não é quadrado (a rua: 160 × 200 px; a faixa: 200 × 60).
	SET: {
		road: { id: 'asphalt_04', pw: 160, ph: 100, c: '#46484d', k: 1.25 },
		zebra: { id: 'asphalt_04', pw: 50, ph: 60, c: '#46484d', k: 1.25 },
		asphalt: { id: 'asphalt_04', period: 80, c: '#46484d', k: 1.25 },
		sidewalk: { id: 'concrete_pavement', period: 40, c: '#b2b4b6', k: 1.0 },
		grass: { id: 'grass001', period: 40, c: '#58822f', k: 1.1 },
		sand: { id: 'coast_sand_01', period: 80, c: '#d9c89a', k: 1.0 },
		concrete: { id: 'concrete_floor_02', period: 40, c: '#8c8e90', k: 1.0 },
		earth: { id: 'dirt_aerial_03', period: 80, c: '#8b7458', k: 1.1 },
		dirt: { id: 'red_dirt_mud_01', period: 40, c: null, k: 1.0 },      // (terra vermelha)
		rock: { id: 'aerial_rocks_02', period: 80, c: null, k: 1.0 },
	},
	// TERRENO do mundo grande (render/TerrainSplat.js): uma camada de foto por tipo de chão (TerrainSplat.IDS), período em METROS,
	// cor alvo, a camada de variação (grama com falhas de terra) e as leiras das roças (rows = leiras por ladrilho).
	TERRAIN: {
		sand: { id: 'coast_sand_01', m: 10, c: '#d9c89a' }, grass: { id: 'grass001', m: 2.4, c: '#58822f' }, forest: { id: 'forest_leaves_02', m: 3.2, c: null, dark: 0.85 },
		scrub: { id: 'withered_grass', m: 2.4, c: '#a39a5e' }, rock: { id: 'aerial_rocks_02', m: 18, c: null }, swamp: { id: 'mud_forest', m: 2.6, c: null },
		earth: { id: 'dirt_aerial_03', m: 14, c: '#8b7458' }, farm0: { id: 'farm_soil', m: 2.6, c: '#94502e', rows: 3 },
		farm1: { id: 'grass_lawn', m: 2.4, c: '#5f8a34', rows: 3, soil: 'farm_soil' }, farm2: { id: 'withered_grass', m: 2.4, c: '#c4a24c', rows: 3 },
		patch: { id: 'grass_patchy', m: 2.8, c: null },
	},
	imgs: {},

	_url() { const m = typeof location !== 'undefined' && location.search.match(/[?&]chao=([^&]*)/); return m ? decodeURIComponent(m[1]).split(/[,+ ]/) : null; },
	get on() { const u = this._url(); return u ? u.includes('foto') || u.includes('misto') : !!(typeof Config !== 'undefined' && Config.art && Config.art.groundPhotos); },
	// MISTO (`?chao=misto`): o chão pintado de sempre (juntas, trincas, remendos, trilhas de pneu, faixas) e, por cima, só o DETALHE
	// da foto (o grão do material, em volta do cinza médio, em luz suave) — a foto dá o material real, o desenho continua o do jogo.
	get mixed() { const u = this._url(); return this.on && (u ? u.includes('misto') : !!(Config.art && Config.art.groundMixed)); },
	get relief() { const u = this._url(); return this.on && (u ? u.includes('relevo') : !!(Config.art && Config.art.groundBump)); },
	nors: {},
	// ladrilho do CityHD → tipo de foto (a faixa de pedestres é asfalto de rua)
	KIND: { road: 'road', zebra: 'zebra', asphalt: 'asphalt', sidewalk: 'sidewalk', grass: 'grass', sand: 'sand', concrete: 'concrete', earth: 'earth', dirt: 'dirt', rock: 'rock' },

	// Carrega as fotos (só ligado). Uma que falhar fica de fora: aquele piso volta ao pintado.
	load() {
		if (!this.on || typeof Image === 'undefined') return Promise.resolve();
		const ids = [...new Set(Object.values(this.SET).concat(Object.values(this.TERRAIN)).flatMap((s) => [s.id, s.soil]).filter(Boolean))];
		return Promise.all(ids.map((id) => new Promise((ok) => {
			const im = new Image();
			im.onload = () => { this.imgs[id] = im; ok(); };
			im.onerror = () => { console.warn(`[CHÃO] foto ${id} não carregou`); ok(); };
			im.src = this.BASE + id + '_diff.webp';
		}).then(() => this.relief && new Promise((ok) => {
			const im = new Image();
			im.onload = () => { this.nors[id] = im; ok(); };
			im.onerror = () => ok();
			im.src = this.BASE + id + '_nor.webp';
		})))).then(() => console.log(`[CHÃO] ${Object.keys(this.imgs).length} fotos CC0${this.relief ? ` e ${Object.keys(this.nors).length} relevos` : ''} carregadas`));
	},

	// Foto recolorida de um tipo (cache): ganho por canal para a média virar a cor alvo, e o detalhe em volta dela × k.
	_canvas: {},
	_recolor(kind) {
		if (this._canvas[kind]) return this._canvas[kind];
		const S = this.SET[kind], im = S && this.imgs[S.id];
		if (!im) return null;
		const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
		const g = cv.getContext('2d', { willReadFrequently: true });
		g.drawImage(im, 0, 0);
		const D = g.getImageData(0, 0, cv.width, cv.height), d = D.data, n = d.length / 4, m = [0, 0, 0];
		for (let i = 0; i < d.length; i += 4) { m[0] += d[i]; m[1] += d[i + 1]; m[2] += d[i + 2]; }
		const t = S.c ? [1, 3, 5].map((o) => parseInt(S.c.substr(o, 2), 16)) : m.map((v) => v / n), gain = m.map((v, c) => t[c] / Math.max(1, v / n));
		for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, t[c] + (d[i + c] * gain[c] - t[c]) * S.k));
		g.putImageData(D, 0, 0);
		return (this._canvas[kind] = cv);
	},

	// Grão da foto (misto): a luminância em volta do cinza médio (128 = sem mudança), × `mix`, em luz suave sobre o ladrilho pintado.
	_detail: {},
	detail(t, name) {
		const kind = this.KIND[name], S = kind && this.SET[kind], im = S && this.imgs[S.id];
		if (!im) return;
		let cv = this._detail[kind];
		if (!cv) {
			cv = this._detail[kind] = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
			const g = cv.getContext('2d', { willReadFrequently: true });
			g.drawImage(im, 0, 0);
			const D = g.getImageData(0, 0, cv.width, cv.height), d = D.data;
			let m = 0; for (let i = 0; i < d.length; i += 4) m += 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
			m /= d.length / 4;
			const k = S.mix || 1.6;
			for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, 128 + (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2] - m) * k)); d[i] = d[i + 1] = d[i + 2] = v; }
			g.putImageData(D, 0, 0);
		}
		const g = t.g, p = g.createPattern(cv, 'repeat');
		p.setTransform(new DOMMatrix().scale((S.pw || S.period) / cv.width, (S.ph || S.period) / cv.height));
		g.save(); g.globalCompositeOperation = 'soft-light'; g.fillStyle = p; g.fillRect(0, 0, t.w, t.h); g.restore();
	},

	// RELEVO do ladrilho `name` do CityHD (w × h px da arte, Q px de textura por px): o mapa de normais da foto no mesmo período, numa
	// textura do mesmo tamanho do ladrilho (as UVs são as dele). null = sem relevo.
	bump(scene, name, w, h, Q) {
		const kind = this.KIND[name], S = kind && this.SET[kind], im = S && this.nors[S.id];
		if (!im) return null;
		const cv = document.createElement('canvas'); cv.width = w * Q; cv.height = h * Q;
		const g = cv.getContext('2d'), p = g.createPattern(im, 'repeat');
		p.setTransform(new DOMMatrix().scale((S.pw || S.period) * Q / im.width, (S.ph || S.period) * Q / im.height));
		g.fillStyle = p; g.fillRect(0, 0, cv.width, cv.height);
		const tex = new BABYLON.DynamicTexture('hdN_' + name, cv, scene, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
		tex.update(false);
		tex.wrapU = tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
		tex.level = S.bump || 1.6;
		cv.width = cv.height = 0;
		return tex;
	},

	// CAMADA DO TERRENO (TerrainSplat): size × size RGBA da foto `T.id` recolorida para `T.c`, com o RELEVO da normal assado na cor (sol
	// do noroeste: o grão pega luz e sombra) e, nas roças, as LEIRAS (faixas de terra mais escura; farm1: a planta só na crista). null = sem foto.
	layer(key, size = 512) {
		const T = this.TERRAIN[key], im = T && this.imgs[T.id];
		if (!im) return null;
		const cv = document.createElement('canvas'); cv.width = cv.height = size;
		const g = cv.getContext('2d', { willReadFrequently: true });
		g.drawImage(im, 0, 0, size, size);
		const D = g.getImageData(0, 0, size, size), d = D.data, N = size * size;
		let nd = null, sd = null;
		const nim = this.nors[T.id];
		if (nim) { g.drawImage(nim, 0, 0, size, size); nd = g.getImageData(0, 0, size, size).data; }
		if (T.soil && this.imgs[T.soil]) { g.drawImage(this.imgs[T.soil], 0, 0, size, size); sd = g.getImageData(0, 0, size, size).data; }
		const m = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) { m[0] += d[i]; m[1] += d[i + 1]; m[2] += d[i + 2]; }
		const tc = T.c ? [1, 3, 5].map((o) => parseInt(T.c.substr(o, 2), 16)) : m.map((v) => v / N), gain = m.map((v, c) => tc[c] / Math.max(1, v / N)) .map((x) => x * (T.dark || 1));
		const L = [-0.42, 0.5, 0.76], Ll = Math.hypot(...L); L[0] /= Ll; L[1] /= Ll; L[2] /= Ll;
		for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
			const i = (y * size + x) * 4;
			let r = d[i] * gain[0], gg = d[i + 1] * gain[1], b = d[i + 2] * gain[2];
			if (nd) {                                                    // relevo: (n · L) / L.z em volta de 1
				const nx = nd[i] / 127.5 - 1, ny = nd[i + 1] / 127.5 - 1, nz = nd[i + 2] / 127.5 - 1, sh = Math.max(0.55, Math.min(1.45, (nx * L[0] + ny * L[1] + nz * L[2]) / L[2]));
				const k = 1 + (sh - 1) * 0.7; r *= k; gg *= k; b *= k;
			}
			if (T.rows) {                                                // leiras: cos ao longo de x, inteiras no ladrilho
				const ph = Math.cos((x / size) * T.rows * Math.PI * 2), crest = 0.5 + 0.5 * ph;
				if (sd) { const w = Math.min(1, Math.max(0, (crest - 0.35) * 2.2)); r = r * w + sd[i] * 0.72 * (1 - w); gg = gg * w + sd[i + 1] * 0.62 * (1 - w); b = b * w + sd[i + 2] * 0.55 * (1 - w); }
				else { const k = 0.72 + 0.36 * crest; r *= k; gg *= k; b *= k; }
			}
			d[i] = Math.max(0, Math.min(255, r)); d[i + 1] = Math.max(0, Math.min(255, gg)); d[i + 2] = Math.max(0, Math.min(255, b)); d[i + 3] = 255;
		}
		cv.width = cv.height = 0;
		return d;
	},

	// Pinta a foto do tipo `kind` como base do ladrilho `t` (CityTile). false = sem foto (o pintor segue com a base desenhada).
	draw(t, kind) {
		if (this.mixed) return false;                                    // (misto: o pintor desenha a base e detail() põe o grão por cima)
		const S = this.SET[kind], cv = this._recolor(kind);
		if (!cv) return false;
		const g = t.g, p = g.createPattern(cv, 'repeat');
		p.setTransform(new DOMMatrix().scale((S.pw || S.period) / cv.width, (S.ph || S.period) / cv.height));
		g.save();
		g.fillStyle = p;
		g.fillRect(0, 0, t.w, t.h);
		g.restore();
		return true;
	},
};
