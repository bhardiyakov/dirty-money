// ============================================================================
// CloudField — AS NUVENS DA FAIXA DE VOO (o avião passa por dentro delas). O céu de cima (render/SkyDome.js: o ruído animado no domo,
// a cobertura e a cor pelo clima) continua sendo a camada alta; aqui ficam os cúmulos na altura em que se voa:
//   • IMPOSTORES: cada nuvem é um aglomerado de 5–13 "bolhas" (quadros sempre virados para a câmera, com uma textura de bolha de
//     ruído feita na carga), base achatada e topo em domo. Todas as nuvens do mapa estão numa malha só, estática (a posição de cada
//     bolha e o centro da nuvem dela são atributos de vértice; o shader vira o quadro para a câmera e anda com o vento): UMA chamada
//     de desenho, nenhum buffer reescrito por quadro — só a ordem dos índices, de vez em quando (de trás para a frente, por nuvem).
//   • COBERTURA pelo clima (Weather.cover): cada nuvem tem um limiar sorteado e aparece quando a cobertura passa dele, devagar — céu
//     limpo = poucos cúmulos soltos, nublado = muitos, tempestade = todos, mais baixos e escuros. Nada é criado nem destruído.
//   • ATRAVESSÁVEL SEM CORTE SECO: a bolha some suave quando a câmera chega perto dela (a "partícula macia" pela distância ao olho, sem
//     a passada de profundidade que a versão clássica pede — as nuvens ficam acima de prédios e morros, não há chão para cortar), e
//     DENTRO da nuvem a névoa fecha no branco da nuvem (`inside`: lido por CompassCamera._vis e por DayNight, que mistura a cor).
//   • Cor: a de cima é a luz da hora (SkyDome.cloudLit), a base é a sombra (SkyDome.cloudDark), a borda contra o sol brilha (forro
//     prateado), e o longe vai para a cor da névoa da cena.
// Liga só com a câmera no ar (avião, paraquedas) ou alta; no chão a malha fica desligada (custo zero). `?nuvens=0` desliga.
// Ciclo de vida: init(game) na carga · update(dt, game) todo quadro · dispose().
// ============================================================================

const CloudField = {
	BAND: [185, 300],              // y (m) da base das nuvens: acima de prédios e morros, no caminho do teco-teco (teto 320) e dos outros
	CLUSTERS: 120,                 // nuvens no mapa inteiro (com folga além da borda)
	MARGIN: 350,                   // folga (m) além da borda do mundo, onde as nuvens também existem (e por onde voltam com o vento)
	DRIFT_DIR: [0.83, 0.56],       // de onde para onde o vento leva as nuvens (do mar para o continente)
	inside: 0,                     // 0..1: a câmera dentro de uma nuvem (névoa fechada)
	color: [0.86, 0.88, 0.9],      // a cor de dentro da nuvem (a névoa vai para ela)
	on: false,
	mesh: null,
	mat: null,
	stats: { clusters: 0, puffs: 0, shown: 0 },
	_drift: 0,                     // m andados com o vento (o shader soma DRIFT_DIR × isto)
	_sortT: 0,
	_eye: null,

	get wanted() {
		const q = typeof location !== 'undefined' ? location.search : '';
		return !(Config.art && Config.art.clouds === false) && !/[?&]nuvens=0\b/.test(q);
	},
	// bolhas por nuvem pelo nível gráfico (o custo é a sobreposição de transparência na tela, não os vértices)
	get puffsPer() { const L = typeof Graphics !== 'undefined' ? Graphics.level : 'high'; return L === 'low' ? 5 : L === 'medium' ? 8 : L === 'hd' ? 13 : 11; },

	// ---------------------------------------------------------------- carga
	init(game) {
		if (this.mesh || !this.wanted) return;
		const scene = game.scene, W = Config.world, M = this.MARGIN;
		const span = [W.maxX - W.minX + 2 * M, W.maxZ - W.minZ + 2 * M], org = [W.minX - M, W.minZ - M];
		this._wrap = new BABYLON.Vector4(org[0], org[1], span[0], span[1]);
		const rnd = CloudField._rng(9137), N = this.CLUSTERS, per = this.puffsPer, B = this.BAND;
		const nP = N * per, pos = new Float32Array(nP * 12), cc = new Float32Array(nP * 16), uv = new Float32Array(nP * 8), col = new Float32Array(nP * 16);
		const C = this._cl = [];
		let p = 0;
		for (let c = 0; c < N; c++) {
			const x = org[0] + rnd() * span[0], z = org[1] + rnd() * span[1], R = 45 + rnd() * 85, H = R * (0.32 + rnd() * 0.2);
			const y0 = B[0] + rnd() * (B[1] - B[0]), thr = Math.pow(rnd(), 0.85) * 0.97;
			C.push({ x, y: y0, z, R, H, thr, p0: p, n: per, d: 0, vis: 0 });
			for (let k = 0; k < per; k++, p++) {
				// a base achatada e larga, o topo em domo: quanto mais longe do meio, mais baixa e menor a bolha
				const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 0.78, ox = Math.cos(a) * rr * R, oz = Math.sin(a) * rr * R * 0.8;
				const oy = H * (0.12 + 0.88 * rnd() * (1 - rr * rr)), size = R * (0.42 + 0.32 * rnd()) * (1 - 0.28 * rr);
				const bottom = 1 - oy / H, seed = rnd();
				for (let v = 0; v < 4; v++) {
					const o = (p * 4 + v);
					pos[o * 3] = ox; pos[o * 3 + 1] = oy; pos[o * 3 + 2] = oz;
					cc[o * 4] = x; cc[o * 4 + 1] = y0; cc[o * 4 + 2] = z; cc[o * 4 + 3] = R;
					uv[o * 2] = v === 0 || v === 3 ? -1 : 1; uv[o * 2 + 1] = v < 2 ? -1 : 1;
					col[o * 4] = size; col[o * 4 + 1] = thr; col[o * 4 + 2] = bottom; col[o * 4 + 3] = seed;
				}
			}
		}
		this._idx = new Uint32Array(nP * 6);
		this._order = new Int32Array(N);
		for (let c = 0; c < N; c++) this._order[c] = c;
		this._fillIndices();
		const mesh = this.mesh = new BABYLON.Mesh('cloudField', scene);
		mesh.setVerticesData(BABYLON.VertexBuffer.PositionKind, pos, false, 3);
		mesh.setVerticesData('cc', cc, false, 4);
		mesh.setVerticesData(BABYLON.VertexBuffer.UVKind, uv, false, 2);
		mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind, col, false, 4);
		mesh.setIndices(this._idx, nP * 4, true);
		// (a caixa da malha: a área inteira das nuvens. A submalha precisa da dela também — desenhando só parte dos índices ela deixa de
		// ser "global" e a ordenação dos transparentes lê a caixa dela)
		const bi = new BABYLON.BoundingInfo(new BABYLON.Vector3(org[0], B[0] - 80, org[1]), new BABYLON.Vector3(org[0] + span[0], B[1] + 140, org[1] + span[1]));
		mesh.setBoundingInfo(bi);
		mesh.subMeshes[0].setBoundingInfo(bi);
		mesh.isPickable = false;
		mesh.alwaysSelectAsActiveMesh = true;            // (a posição sai do shader: a caixa da malha não diz nada)
		mesh.doNotSyncBoundingInfo = true;
		mesh.renderingGroupId = 1;                       // (depois do mundo, com a profundidade dele: prédios e morros na frente escondem a nuvem)
		mesh.receiveShadows = false;
		mesh.applyFog = false;
		this._shaders();
		const mat = this.mat = new BABYLON.ShaderMaterial('cloudField', scene, { vertex: 'cloudField', fragment: 'cloudField' }, {
			attributes: ['position', 'cc', 'uv', 'color'],
			uniforms: ['view', 'viewProjection', 'drift', 'wrap', 'eye', 'fade', 'lit', 'dark', 'sunDir', 'sunCol', 'fogC', 'fogP'],
			samplers: ['puff'],
			needAlphaBlending: true,
		});
		mat.setTexture('puff', this._puffTexture(scene));
		mat.backFaceCulling = false;
		mat.disableDepthWrite = true;
		mat.alphaMode = BABYLON.Engine.ALPHA_PREMULTIPLIED;
		mat.setVector4('wrap', this._wrap);
		mesh.material = mat;
		mesh.setEnabled(false);
		this._u = { drift: new BABYLON.Vector4(), fade: new BABYLON.Vector4(), lit: new BABYLON.Color3(), dark: new BABYLON.Color3(),
			sun: new BABYLON.Vector3(), sunC: new BABYLON.Color3(), fogC: new BABYLON.Color3(), fogP: new BABYLON.Vector2() };
		this._eye = new BABYLON.Vector3();
		this.stats.clusters = N; this.stats.puffs = nP;
		console.log(`[NUVENS] ${N} nuvens, ${nP} bolhas numa malha (faixa de ${B[0]} a ${B[1] + 60} m)`);
	},

	// ---------------------------------------------------------------- quadro
	update(dt, game) {
		if (!this.mesh) return;
		const cam = game.scene.activeCamera, W = typeof Weather !== 'undefined' ? Weather.cur : null;
		const air = (game.camera && game.camera.airK) || 0, camY = cam ? cam.globalPosition.y : 0;
		const want = !!cam && !(typeof Interiors !== 'undefined' && Interiors.active) && (air > 0.02 || camY > 110);
		if (want !== this.on) { this.on = want; this.mesh.setEnabled(want); if (!want) this.inside = 0; }
		const wind = W ? W.wind : 0.2;
		this._drift += dt * (2.5 + 9 * wind);                                  // (m/s: o vento da chuva também empurra as nuvens)
		if (!want) return;
		const cover = W ? W.cover : 0.12, storm = W ? W.k : 0, E = this._eye.copyFrom(cam.globalPosition), u = this._u;
		const dx = this.DRIFT_DIR[0] * this._drift, dz = this.DRIFT_DIR[1] * this._drift, low = 55 * storm;
		u.drift.set(dx, dz, 0, low);
		u.fade.set(cover, 0, 0.92, 0);
		const S = typeof SkyDome !== 'undefined' ? SkyDome : null, sc = game.scene;
		if (S) {
			u.lit.copyFromFloats(S.cloudLit[0], S.cloudLit[1], S.cloudLit[2]);
			u.dark.copyFromFloats(S.cloudDark[0] * 0.92, S.cloudDark[1] * 0.92, S.cloudDark[2] * 0.95);
			u.sun.copyFromFloats(S.sunDir[0], S.sunDir[1], S.sunDir[2]);
			u.sunC.copyFromFloats(S.sunCol[0] * S.sunVis, S.sunCol[1] * S.sunVis, S.sunCol[2] * S.sunVis);
		}
		u.fogC.copyFrom(sc.fogColor);
		u.fogP.set(sc.fogStart, sc.fogEnd);
		const m = this.mat;
		m.setVector4('drift', u.drift); m.setVector4('fade', u.fade); m.setVector3('eye', E);
		m.setColor3('lit', u.lit); m.setColor3('dark', u.dark); m.setVector3('sunDir', u.sun); m.setColor3('sunCol', u.sunC);
		m.setColor3('fogC', u.fogC); m.setVector2('fogP', u.fogP);
		const c = this.color;
		c[0] = u.lit.r * 0.72 + u.dark.r * 0.28; c[1] = u.lit.g * 0.72 + u.dark.g * 0.28; c[2] = u.lit.b * 0.72 + u.dark.b * 0.28;
		// a ordem de trás para a frente (por nuvem) e o "dentro": a cada 0,25 s ou quando a câmera andou
		this._sortT -= dt;
		let ins = 0;
		const wr = this._wrap, Cl = this._cl;
		for (let i = 0; i < Cl.length; i++) {
			const q = Cl[i];
			const cx = wr.x + CloudField._mod(q.x + dx - wr.x, wr.z), cz = wr.y + CloudField._mod(q.z + dz - wr.y, wr.w), cy = q.y - low + q.H * 0.5;
			const ex = E.x - cx, ey = E.y - cy, ez = E.z - cz;
			q.d = ex * ex + ey * ey + ez * ez;
			q.vis = Math.max(0, Math.min(1, (cover - q.thr + 0.05) / 0.13));
			if (q.vis > 0.05 && q.d < q.R * q.R * 2) {
				const e = (ex * ex + ez * ez) / (q.R * q.R * 0.7) + (ey * ey) / (q.H * q.H * 0.6);         // (elipsoide achatado: 1 = a borda)
				ins = Math.max(ins, (1 - Math.min(1, Math.max(0, (e - 0.25) / 0.75))) * q.vis);
			}
		}
		const rate = ins > this.inside ? 4 : 1.6;
		this.inside += (ins - this.inside) * Math.min(1, dt * rate);
		if (this.inside < 0.002) this.inside = 0;
		if (this._sortT <= 0) { this._sortT = 0.25; this._sort(); }
	},

	// Ordena as nuvens de trás para a frente (inserção: a ordem do quadro anterior já está quase certa — sem alocar nada) e refaz os índices
	// só das que aparecem (as escondidas pela cobertura nem entram no desenho).
	_sort() {
		const O = this._order, Cl = this._cl;
		for (let i = 1; i < O.length; i++) {
			const v = O[i], d = Cl[v].d;
			let j = i - 1;
			while (j >= 0 && Cl[O[j]].d < d) { O[j + 1] = O[j]; j--; }
			O[j + 1] = v;
		}
		const n = this._fillIndices();
		this.mesh.updateIndices(this._idx, 0, true);
		this.mesh.subMeshes[0].indexCount = n;
		this.stats.shown = n / 6;
	},
	_fillIndices() {
		const I = this._idx, O = this._order, Cl = this._cl;
		let t = 0;
		for (let i = 0; i < O.length; i++) {
			const q = Cl[O[i]];
			if (q.vis !== undefined && q.vis <= 0.001 && this.mesh) continue;
			for (let k = 0; k < q.n; k++) {
				const b = (q.p0 + k) * 4;
				I[t++] = b; I[t++] = b + 1; I[t++] = b + 2; I[t++] = b; I[t++] = b + 2; I[t++] = b + 3;
			}
		}
		for (let k = t; k < I.length; k++) I[k] = 0;                        // (o resto: triângulos degenerados, fora da contagem)
		return t;
	},

	dispose() {
		if (this.mesh) { this.mesh.dispose(); this.mesh = null; }
		if (this.mat) { this.mat.dispose(true, true); this.mat = null; }
		this.on = false; this.inside = 0; this._cl = null;
	},

	// ---------------------------------------------------------------- recursos
	_rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; },
	_mod(a, b) { return a - b * Math.floor(a / b); },

	// A bolha: uma mancha redonda de bordas esfarrapadas (ruído de valor em 4 oitavas): alfa = densidade, vermelho = o relevo de dentro
	// (o shader escurece os vales). 128², feita uma vez na carga.
	_puffTexture(scene) {
		const N = 128, d = new Uint8Array(N * N * 4), G = 16, rnd = CloudField._rng(77), g = new Float32Array((G + 1) * (G + 1));
		for (let i = 0; i < g.length; i++) g[i] = rnd();
		const vn = (x, y) => {
			const xi = Math.floor(x) % G, yi = Math.floor(y) % G, fx = x - Math.floor(x), fy = y - Math.floor(y);
			const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), a = g[yi * (G + 1) + xi], b = g[yi * (G + 1) + xi + 1], c = g[(yi + 1) * (G + 1) + xi], e = g[(yi + 1) * (G + 1) + xi + 1];
			return a + (b - a) * sx + (c - a) * sy + (a - b - c + e) * sx * sy;
		};
		for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
			const u = (x + 0.5) / N * 2 - 1, v = (y + 0.5) / N * 2 - 1, r = Math.hypot(u, v);
			let n = 0, amp = 0.5, f = 2;
			for (let o = 0; o < 4; o++) { n += vn((u + 1) * f + o * 3.1, (v + 1) * f + o * 1.7) * amp; amp *= 0.5; f *= 2; }
			const edge = Math.max(0, Math.min(1, (1 - r) / 0.55));
			const a = Math.max(0, Math.min(1, edge * edge * (0.45 + 0.9 * n) - 0.06));
			const o = (y * N + x) * 4;
			d[o] = Math.round(Math.max(0, Math.min(1, 0.35 + n)) * 255); d[o + 1] = d[o]; d[o + 2] = d[o]; d[o + 3] = Math.round(a * 255);
		}
		const t = BABYLON.RawTexture.CreateRGBATexture(d, N, N, scene, true, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
		t.name = 'cloudPuff';
		t.wrapU = t.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
		return t;
	},

	_shaders() {
		const S = BABYLON.Effect.ShadersStore;
		if (S.cloudFieldVertexShader) return;
		S.cloudFieldVertexShader = `
			precision highp float;
			attribute vec3 position;
			attribute vec4 cc;
			attribute vec2 uv;
			attribute vec4 color;
			uniform mat4 view;
			uniform mat4 viewProjection;
			uniform vec4 drift;      // xy = o quanto o vento levou (m), w = o quanto a tempestade baixa a base (m)
			uniform vec4 wrap;       // xy = canto da área das nuvens, zw = tamanho (a nuvem que sai de um lado volta do outro)
			uniform vec3 eye;
			uniform vec4 fade;       // x = cobertura do clima, z = opacidade geral
			varying vec2 vUV;
			varying vec4 vD;         // x = alfa, y = embaixo (0 topo, 1 base), z = semente, w = distância ao olho
			varying vec3 vW;
			void main(void) {
				vec2 c = wrap.xy + mod(cc.xz + drift.xy - wrap.xy, wrap.zw);
				vec3 ctr = vec3(c.x, cc.y - drift.w, c.y) + position;
				float sz = color.x;
				vec3 right = vec3(view[0][0], view[1][0], view[2][0]);
				vec3 up = vec3(view[0][1], view[1][1], view[2][1]);
				float a = color.w * 6.2832;
				float ca = cos(a);
				float sa = sin(a);
				vec2 q = vec2(uv.x * ca - uv.y * sa, uv.x * sa + uv.y * ca);
				vec3 wp = ctr + (right * q.x + up * q.y) * sz;
				float d = distance(eye, ctr);
				float cov = smoothstep(color.y - 0.05, color.y + 0.08, fade.x);
				float nearF = smoothstep(sz * 0.3, sz * 1.25, d);          // (a bolha some antes de a câmera entrar nela: sem corte seco)
				vD = vec4(cov * nearF * fade.z, color.z, color.w, d);
				vUV = uv * 0.5 + 0.5;
				vW = wp;
				gl_Position = viewProjection * vec4(wp, 1.0);
				if (vD.x < 0.003) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);      // (escondida: fora do recorte)
			}`;
		S.cloudFieldFragmentShader = `
			precision highp float;
			uniform sampler2D puff;
			uniform vec3 lit;
			uniform vec3 dark;
			uniform vec3 sunDir;     // a direção PARA o sol (a do disco no céu)
			uniform vec3 sunCol;
			uniform vec3 fogC;
			uniform vec2 fogP;       // início e fim da névoa (m, do olho)
			uniform vec3 eye;
			varying vec2 vUV;
			varying vec4 vD;
			varying vec3 vW;
			void main(void) {
				vec4 t = texture2D(puff, vUV);
				float a = t.a * vD.x;
				if (a < 0.008) discard;
				// a luz: o topo e o que se vê de cima na luz da hora, só a base (vista de baixo ou de lado) na sombra — o cúmulo é branco
				vec3 v = normalize(vW - eye);
				float top = clamp(1.0 - vD.y * 0.7 + (vUV.y - 0.5) * 0.35, 0.0, 1.0);
				float above = clamp(-v.y * 1.6, 0.0, 1.0);
				float lt = clamp(0.3 + 0.7 * top + 0.35 * above, 0.0, 1.0) * (0.82 + 0.18 * t.r);
				vec3 col = mix(dark, lit * 1.06, lt);
				float sil = pow(max(dot(v, sunDir), 0.0), 8.0) * (1.0 - t.a);      // (o forro prateado: a borda fina contra o sol)
				col += sunCol * sil * 0.55;
				float f = clamp((vD.w - fogP.x) / max(1.0, fogP.y - fogP.x), 0.0, 1.0);
				col = mix(col, fogC, f * f);
				a *= 1.0 - smoothstep(0.8, 1.0, f);
				gl_FragColor = vec4(col * a, a);
			}`;
	},
};
