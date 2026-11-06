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
	SET: {
		road: { id: 'clean_asphalt', period: 40, c: '#35383f', k: 1.6 },
		asphalt: { id: 'asphalt_02', period: 40, c: '#393c43', k: 0.9 },
		sidewalk: { id: 'concrete_pavement', period: 40, c: '#b8bcc1', k: 1.0 },
		grass: { id: 'grass004', period: 40, c: '#55933d', k: 1.1 },
		sand: { id: 'coast_sand_01', period: 80, c: '#e3d39c', k: 0.9 },
		concrete: { id: 'concrete_floor_02', period: 40, c: '#8a8e92', k: 0.7 },
		earth: { id: 'brown_mud_dry', period: 40, c: '#9a8468', k: 0.9 },
		dirt: { id: 'dirt', period: 40, c: '#a2502c', k: 1.0 },          // (terra vermelha)
		rock: { id: 'aerial_rocks_02', period: 80, c: '#7c7a75', k: 1.0 },
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
	KIND: { road: 'road', zebra: 'road', asphalt: 'asphalt', sidewalk: 'sidewalk', grass: 'grass', sand: 'sand', concrete: 'concrete', earth: 'earth', dirt: 'dirt', rock: 'rock' },

	// Carrega as fotos (só ligado). Uma que falhar fica de fora: aquele piso volta ao pintado.
	load() {
		if (!this.on || typeof Image === 'undefined') return Promise.resolve();
		const ids = [...new Set(Object.values(this.SET).map((s) => s.id))];
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
		const t = [1, 3, 5].map((o) => parseInt(S.c.substr(o, 2), 16)), gain = m.map((v, c) => t[c] / Math.max(1, v / n));
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
		p.setTransform(new DOMMatrix().scale(S.period / cv.width, S.period / cv.height));
		g.save(); g.globalCompositeOperation = 'soft-light'; g.fillStyle = p; g.fillRect(0, 0, t.w, t.h); g.restore();
	},

	// RELEVO do ladrilho `name` do CityHD (w × h px da arte, Q px de textura por px): o mapa de normais da foto no mesmo período, numa
	// textura do mesmo tamanho do ladrilho (as UVs são as dele). null = sem relevo.
	bump(scene, name, w, h, Q) {
		const kind = this.KIND[name], S = kind && this.SET[kind], im = S && this.nors[S.id];
		if (!im) return null;
		const cv = document.createElement('canvas'); cv.width = w * Q; cv.height = h * Q;
		const g = cv.getContext('2d'), p = g.createPattern(im, 'repeat');
		p.setTransform(new DOMMatrix().scale(S.period * Q / im.width, S.period * Q / im.height));
		g.fillStyle = p; g.fillRect(0, 0, cv.width, cv.height);
		const tex = new BABYLON.DynamicTexture('hdN_' + name, cv, scene, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
		tex.update(false);
		tex.wrapU = tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
		tex.level = S.bump || 1.6;
		cv.width = cv.height = 0;
		return tex;
	},

	// Pinta a foto do tipo `kind` como base do ladrilho `t` (CityTile). false = sem foto (o pintor segue com a base desenhada).
	draw(t, kind) {
		if (this.mixed) return false;                                    // (misto: o pintor desenha a base e detail() põe o grão por cima)
		const S = this.SET[kind], cv = this._recolor(kind);
		if (!cv) return false;
		const g = t.g, p = g.createPattern(cv, 'repeat');
		p.setTransform(new DOMMatrix().scale(S.period / cv.width, S.period / cv.height));
		g.save();
		g.fillStyle = p;
		g.fillRect(0, 0, t.w, t.h);
		g.restore();
		return true;
	},
};
