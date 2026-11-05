// ============================================================================
// Facades3D — PRÉDIOS COM VOLUME (etapa 4 do upgrade visual), sem trocar a geometria das caixas: o relevo das fachadas.
//
// A pintura de cada fachada (art/CityHDFacades.js) anota onde ficam os vidros (_glass) e os peitoris (_sill). Daqui sai um mapa de
// ALTURA do ladrilho (parede, caixilho um pouco recuado, vidro no fundo, peitoril saltado) e, dele, o mapa de NORMAIS (Sobel), na
// mesma textura (normais em RGB, altura em A) — a bumpTexture do material da fachada, com as mesmas UVs da parede:
//   • `?predios=relevo`: só as normais — a verga, as laterais do vão e o peitoril pegam o sol e a sombra;
//   • `?predios=recuo`: as normais e a PARALAXE (oclusão de paralaxe do StandardMaterial): o vidro aparece de fato recuado na
//     parede, com a câmera em perspectiva olhando de lado — o vão tem fundo.
// PADRÃO (escolhido pelas capturas, em todos os presets): `recuo` + `telhado` (Config.art.facades3d, roofs3d). `?predios=0`: os prédios
// de antes.
// ============================================================================

const Facades3D = {
	_url() { const m = typeof location !== 'undefined' && location.search.match(/[?&]predios=([^&]*)/); return m ? decodeURIComponent(m[1]).split(/[,+ ]/) : null; },
	get mode() {
		const u = this._url();
		if (u) return u.includes('recuo') ? 'recuo' : u.includes('relevo') ? 'relevo' : null;
		const c = typeof Config !== 'undefined' && Config.art && Config.art.facades3d;
		return c || null;
	},
	get on() { return !!this.mode; },
	// TELHADOS com volume (`?predios=…,telhado`, Config.art.roofs3d): cornija saltada na borda dos prédios da cidade, caixa-d'água,
	// ares-condicionados e antena nos telhados; nos barracos, a caixa-d'água em 3D no lugar da pintada na telha (CityHDRoofs._tank).
	get roofs() { const u = this._url(); return u ? u.includes('telhado') : !!(typeof Config !== 'undefined' && Config.art && Config.art.roofs3d); },
	// Alturas (0..1): vidro no fundo, caixilho, parede, peitoril. Profundidade da paralaxe: UV por unidade de altura (o ladrilho tem
	// 6 u: 0,035 ≈ 21 cm de vão).
	H: { glass: 0.0, frame: 0.45, wall: 0.78, sill: 1.0 },
	FRAME: 1.6,             // px da arte de caixilho em volta do vidro
	NORMAL: 2.2,            // força das normais
	PARALLAX: 0.035,

	// Ladrilho de relevo da fachada `key` (120 × 120 px da arte, Q px de textura por px). R = { glass: [[x, y, w, h]], sill: [...] }.
	relief(scene, key, R, Q) {
		if (!R || typeof document === 'undefined') return null;
		const S = 120 * Q, H = this.H, cv = document.createElement('canvas');
		cv.width = cv.height = S;
		const g = cv.getContext('2d', { willReadFrequently: true });
		const gray = (v) => { const c = Math.round(v * 255); return `rgb(${c},${c},${c})`; };
		g.setTransform(Q, 0, 0, Q, 0, 0);
		g.fillStyle = gray(H.wall); g.fillRect(0, 0, 120, 120);
		const F = this.FRAME;
		g.fillStyle = gray(H.frame); for (const [x, y, w, h] of R.glass) g.fillRect(x - F, y - F, w + 2 * F, h + 2 * F);
		g.fillStyle = gray(H.glass); for (const [x, y, w, h] of R.glass) g.fillRect(x, y, w, h);
		g.fillStyle = gray(H.sill); for (const [x, y, w, h] of R.sill) g.fillRect(x, y, w, h);
		// (um pouco de desfoque: as quinas não serrilham nas normais)
		const blur = document.createElement('canvas'); blur.width = blur.height = S;
		const bg = blur.getContext('2d', { willReadFrequently: true });
		bg.filter = `blur(${Math.max(0.6, Q * 0.35)}px)`; bg.drawImage(cv, 0, 0);
		const src = bg.getImageData(0, 0, S, S).data, out = g.getImageData(0, 0, S, S), d = out.data;
		const h = (x, y) => src[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255, k = this.NORMAL * Q;
		for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
			const dx = (h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1) - h(x - 1, y - 1) - 2 * h(x - 1, y) - h(x - 1, y + 1)) * k / 8;
			const dy = (h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1) - h(x - 1, y - 1) - 2 * h(x, y - 1) - h(x + 1, y - 1)) * k / 8;
			const L = Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
			d[i] = (0.5 - 0.5 * dx / L) * 255; d[i + 1] = (0.5 + 0.5 * dy / L) * 255; d[i + 2] = (0.5 + 0.5 / L) * 255; d[i + 3] = h(x, y) * 255;
		}
		g.setTransform(1, 0, 0, 1, 0, 0); g.putImageData(out, 0, 0);
		const tex = new BABYLON.DynamicTexture('relief_' + key, cv, scene, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
		tex.hasAlpha = false;
		tex.update(false, true);
		tex.wrapU = tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
		tex.anisotropicFilteringLevel = 8;
		cv.width = cv.height = blur.width = blur.height = 0;
		return tex;
	},

	// O material da fachada ganha o relevo (e, em `recuo`, a paralaxe).
	apply(m, tex) {
		if (!tex) return;
		m.bumpTexture = tex;
		if (this.mode === 'recuo') { m.useParallax = true; m.useParallaxOcclusion = true; m.parallaxScaleBias = this.PARALLAX; }
	},
};
