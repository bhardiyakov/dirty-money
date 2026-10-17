// ============================================================================
// CharArt — os personagens a partir do ATLAS PRONTO (assets/chars/personagens-atlas.js, gerado por tools/personagens/index.html a
// partir das poses do CharacterRig): desenho vetorial visto de cima, UMA direção por quadro — o SpriteActor gira o sprite no
// ângulo exato. Nada é assado na carga (antes: 8–16 direções de cada quadro de cada clipe, ~55 MB de textura e segundos de CPU).
//
// Atlas RGBA: R = slot do material × 16 (pele, cabelo, camisa…), G = luminosidade × alfa (0,5 = cor base), A = cobertura. A cor
// vem da paleta da variante (CharacterRig.createPalette: a mesma de antes, nível "base" de cada rampa), então os 57 visuais de
// pedestres, policiais, SWAT, exército e entregadores continuam saindo de um desenho só. A sombra no chão é a silhueta deslocada
// para o sudeste no shader (não gira com o boneco).
//
// Quadro: [x, y, w, h, ox, oz] = retângulo no atlas (px) e canto superior esquerdo em px relativo aos pés (x → direita, z → frente).
// ============================================================================

const CharArt = {
	data: null,
	tex: null,
	material: null,
	ready: null,           // Promise: PNG decodificado e na GPU
	_px: null,
	SUN: [0.26, -0.2],     // deslocamento da sombra no chão (m, mundo): a luz vem do noroeste
	MARGIN: 0.34,          // folga do quad em volta do quadro (cabe a sombra)
	FALLBACK: { civB: 'civA', police: 'civA', swat: 'civA', army: 'civA', player: 'civA', courier: 'rider' },

	available() { return typeof CHAR_ATLAS !== 'undefined' && !!CHAR_ATLAS.sheets; },

	_bytes(b64) { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; },

	// Decodifica o PNG em segundo plano (descompressão nativa) desde a carga da página; se a textura já existe, sobe os pixels.
	load() {
		if (this.ready) return this.ready;
		const t0 = performance.now();
		this.data = CHAR_ATLAS;
		this.ready = PNG.decodeAsync(this._bytes(CHAR_ATLAS.a)).then((img) => {
			this.decodeMs = Math.round(performance.now() - t0);
			this._keepCpu(img.data);
			if (this.tex) { this.tex.update(img.data); this._uploaded = true; } else this._px = img.data;
			console.log(`[PERSONAGENS] atlas ${CHAR_ATLAS.w}×${CHAR_ATLAS.h} pronto em ${this.decodeMs} ms (em segundo plano)`);
		}).catch((e) => console.warn('[PERSONAGENS] atlas: decodificação falhou', e));
		return this.ready;
	},

	// Textura (vazia até a decodificação terminar) e o material único de todos os personagens. Chamado pela SpriteLibrary.
	init(scene, palette) {
		if (this.material && this._scene === scene) return;
		this._scene = scene;
		const D = this.data = CHAR_ATLAS;
		this.tex = new BABYLON.RawTexture(this._px, D.w, D.h, BABYLON.Constants.TEXTUREFORMAT_RGBA, scene, false, false, BABYLON.Texture.BILINEAR_SAMPLINGMODE, BABYLON.Constants.TEXTURETYPE_UNSIGNED_BYTE);
		this.tex.wrapU = this.tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
		if (this._px) this._uploaded = true;
		this._px = null;
		this.material = this._makeMaterial(scene, palette);
	},

	// Quadros do clipe `key` ('nome:arma') da folha (ou da folha reserva, se a folha não tem esse clipe). null = não está no atlas.
	frames(sheet, key) {
		const S = this.data && this.data.sheets;
		if (!S) return null;
		let s = S[sheet];
		if (s && s.clips[key]) return s.clips[key];
		const fb = this.FALLBACK[sheet];
		return fb && S[fb] && S[fb].clips[key] ? S[fb].clips[key] : null;
	},
	bagFrames(kind, key) { const b = this.data && this.data.sheets.player.bags; return b && b[kind] ? this.packed(b[kind][key] || null) : null; },

	// Quadros que precisam ficar na CPU (miniaturas do HUD); o resto do atlas só existe na GPU.
	CPU_FRAMES: [['rider', 'park_bike:none'], ['rider', 'park_moto:none']],
	_keepCpu(px) {
		this._cpu = {};
		for (const [s, k] of this.CPU_FRAMES) {
			const f = this.frames(s, k) && this.frames(s, k)[0];
			if (!f) continue;
			const [x, y, w, h] = f, d = new Uint8Array(w * h * 4);
			for (let r = 0; r < h; r++) d.set(px.subarray(((y + r) * this.data.w + x) * 4, ((y + r) * this.data.w + x + w) * 4), r * w * 4);
			this._cpu[s + '|' + k] = { w, h, d };
		}
	},

	// <canvas> de um quadro pintado com a variante `v` (frente para CIMA), na CPU — a mesma conta do shader. Só para os quadros guardados
	// (CPU_FRAMES), ou qualquer um enquanto o atlas inteiro ainda está na memória (fora do jogo). null se não houver.
	image(sheet, key, f = 0, v = 0) {
		let src = this._cpu && this._cpu[sheet + '|' + key];
		if (!src && this._px) {
			const fr = this.frames(sheet, key), q = fr && fr[f];
			if (q) { const [x, y, w, h] = q, d = new Uint8Array(w * h * 4); for (let r = 0; r < h; r++) d.set(this._px.subarray(((y + r) * this.data.w + x) * 4, ((y + r) * this.data.w + x + w) * 4), r * w * 4); src = { w, h, d }; }
		}
		if (!src) return null;
		const ramps = CharacterRig.rampsFor(v), c = document.createElement('canvas');
		c.width = src.w; c.height = src.h;
		const img = c.getContext('2d').createImageData(src.w, src.h);
		for (let i = 0; i < src.w * src.h; i++) {
			const o = i * 4, a = src.d[o + 3] / 255;
			if (!a) continue;
			const base = (ramps[Math.round(src.d[o] / 16)] || ramps[3])[2], l = src.d[o + 1] / 255 / a;
			for (let k = 0; k < 3; k++) img.data[o + k] = l < 0.5 ? base[k] * l * 2 : base[k] + (255 - base[k]) * (l * 2 - 1);
			img.data[o + 3] = a * 255;
		}
		c.getContext('2d').putImageData(img, 0, 0);
		return c;
	},

	// Quadros de um clipe prontos para o SpriteActor: `fr` = 3 números por quadro (ver o shader) e `box` = o quad FIXO do clipe
	// (maior caixa dos quadros + folga da sombra, em m) — trocar de quadro não mexe nas posições, só no atributo `fr`.
	packed(frames) {
		if (!frames) return null;
		const c = this._packCache || (this._packCache = new Map());
		let p = c.get(frames);
		if (p) return p;
		const ppu = this.data.ppu, M = this.MARGIN, fr = new Float32Array(frames.length * 3);
		let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
		frames.forEach((f, i) => {
			if (!f) { fr[i * 3 + 1] = 0; return; }                          // quadro vazio: retângulo de largura 0 (nada desenha)
			const [x, y, w, h, ox, oz] = f;
			fr[i * 3] = x * 2048 + y; fr[i * 3 + 1] = w * 2048 + h; fr[i * 3 + 2] = (ox + 1024) * 2048 + (oz + 1024);
			x0 = Math.min(x0, ox); x1 = Math.max(x1, ox + w); z1 = Math.max(z1, oz); z0 = Math.min(z0, oz - h);
		});
		const box = x0 < Infinity ? [x0 / ppu - M, z0 / ppu - M, x1 / ppu + M, z1 / ppu + M] : [0, 0, 0, 0];
		c.set(frames, p = { fr, box, n: frames.length });
		return p;
	},
	half(sheet) { const s = this.data && (this.data.sheets[sheet] || this.data.sheets[this.FALLBACK[sheet]]); return s ? s.half : 2; },

	_makeMaterial(scene, palette) {
		if (!BABYLON.Effect.ShadersStore.charArtVertexShader) {
			// fr = o quadro inteiro em 3 números (pares de inteiros a*2048+b, exatos em float): (x,y) e (w,h) do retângulo no atlas e
			// (ox,oz)+1024 = canto superior esquerdo em px relativo aos pés. Trocar de quadro = reenviar só este atributo.
			BABYLON.Effect.ShadersStore.charArtVertexShader = `
				precision highp float;
				attribute vec3 position;
				attribute vec4 color;
				attribute vec4 fr;
				uniform mat4 worldViewProjection;
				uniform float ppu;
				varying vec2 vPx;
				varying vec4 vFr;
				varying vec4 vC;
				vec2 un(float v) { float hi = floor(v / 2048.0 + 0.0001); return vec2(hi, v - hi * 2048.0); }
				void main(void) {
					vec2 xy = un(fr.x), wh = un(fr.y), o = un(fr.z) - 1024.0;
					vPx = vec2(xy.x - o.x + position.x * ppu, xy.y + o.y - position.z * ppu);
					vFr = vec4(xy, xy + wh);
					vC = color;
					gl_Position = worldViewProjection * vec4(position, 1.0);
				}`;
			// vPx = posição em px do atlas, vFr = retângulo do quadro (fora dele = transparente), color = (variante, sombra de prédio,
			// deslocamento da sombra no chão em px do atlas)
			BABYLON.Effect.ShadersStore.charArtFragmentShader = `
				precision highp float;
				varying vec2 vPx;
				varying vec4 vFr;
				varying vec4 vC;
				uniform sampler2D atlas;
				uniform sampler2D palette;
				uniform vec2 atlasSize;
				uniform vec2 palSize;
				uniform vec3 tint;
				uniform float shadowAlpha;
				vec4 tap(vec2 px) {
					if (px.x < vFr.x || px.y < vFr.y || px.x > vFr.z || px.y > vFr.w) return vec4(0.0);
					return texture2D(atlas, px / atlasSize);
				}
				void main(void) {
					vec4 t = tap(vPx);
					float sh = tap(vPx - vC.ba).a * shadowAlpha;
					if (t.a < 0.01 && sh < 0.01) discard;
					vec3 col = vec3(0.0);
					if (t.a >= 0.01) {
						vec2 cpx = floor(clamp(vPx, vFr.xy, vFr.zw - 0.01)) + 0.5;          // material do texel (sem misturar slots)
						float slot = floor(texture2D(atlas, cpx / atlasSize).r * 255.0 / 16.0 + 0.5);
						float l = t.g / t.a;
						vec3 base = texture2D(palette, vec2((slot * 5.0 + 2.5) / palSize.x, (floor(vC.r + 0.5) + 0.5) / palSize.y)).rgb;
						vec3 c = l < 0.5 ? base * (l * 2.0) : mix(base, vec3(1.0), l * 2.0 - 1.0);
						col = c * tint * vC.g * t.a;
					}
					gl_FragColor = vec4(col, t.a + (1.0 - t.a) * sh);                      // pre-multiplicado, sombra preta
				}`;
		}
		const m = new BABYLON.ShaderMaterial('charArt', scene, { vertex: 'charArt', fragment: 'charArt' }, {
			attributes: ['position', 'color', 'fr'],
			uniforms: ['worldViewProjection', 'ppu', 'atlasSize', 'palSize', 'tint', 'shadowAlpha'],
			samplers: ['atlas', 'palette'],
			needAlphaBlending: true,
		});
		m.setTexture('atlas', this.tex);
		m.setTexture('palette', palette.texture);
		m.setFloat('ppu', this.data.ppu);
		m.setVector2('atlasSize', new BABYLON.Vector2(this.data.w, this.data.h));
		m.setVector2('palSize', new BABYLON.Vector2(palette.width, palette.height));
		m.setColor3('tint', SpriteMaterial.sharedTint());
		m.setFloat('shadowAlpha', 0.36);
		m.alphaMode = BABYLON.Engine.ALPHA_PREMULTIPLIED;
		m.backFaceCulling = false;
		return m;
	},
};

if (CharArt.available()) CharArt.load();          // decodifica já durante a carga da página / menu
