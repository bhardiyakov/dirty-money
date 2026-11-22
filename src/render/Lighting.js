// ============================================================================
// Lighting — LUZ FÍSICA (etapa 2 do upgrade visual). Duas camadas, ligadas por padrão em todos os presets (Config.light; para
// comparar, `?luz=ceu` ou `?luz=cor` liga só essa e `?luz=0` desliga as duas):
//   • ceu — LUZ DO CÉU: de dia, a luz que vem de cima (HemisphericLight) é azulada como o céu, e a que volta do chão é quente; o sol
//     fica mais quente e a sombra um pouco mais funda. A sombra deixa de ser só "mais escura" e vira fria, como é de verdade (o que
//     está na sombra é iluminado só pelo céu). Os personagens 2,5D na sombra de um prédio ganham a MESMA cor dessa sombra (NpcArt,
//     uniform shadeC: a razão entre a luz na sombra e a luz ao sol, cor a cor), não mais um cinza fixo. Custo zero.
//   • cor — GRADAÇÃO DE FILME: um pós-processamento no fim da cadeia (depois do antisserrilhado): leve desfoque (mais no alto da tela),
//     brilho suave, cores menos vivas, pretos levantados, alto em curva e vinheta (GRADE_FS). Antes: um pouco de
//     contraste e de saturação. Vale para tudo na tela, inclusive os sprites. SEM curva de tone mapping: a arte é pintada (cores já
//     prontas, sem luz acima de 1), e o ACES desbotava as copas das árvores e escurecia o asfalto. Custo: uma passada de tela cheia.
// (A oclusão de ambiente — SSAO2 — foi testada nesta etapa e ficou de fora: o resultado não agradou e custava ~50% mais desenhos.)
// BRILHO DE VERDADE (bloom; Config.perf.bloom — presets Médio, Alto e HD; `?brilho=0` desliga): o que passa do limiar (postes,
// vitrines, janelas e faróis à noite; o sol, o céu claro e o reflexo na água de dia) vaza em volta, largo e macio, como numa lente.
// Três passadas pequenas logo antes da gradação: 'luzBrilhoEx' separa o que é claro (joelho suave) já em 1/4 da resolução (4 leituras
// bilineares cobrem o bloco 4×4 — luz pequena não pisca), 'luzBrilhoH' e 'luzBrilhoV' desfocam (gaussiana de 9 pontos em 5 leituras).
// A gradação passa a ler a cena da entrada de 'luzBrilhoEx' e o brilho da própria entrada, que fica em 1/4 (Lighting.setBloom muda a
// escala dela): nenhuma escrita de tela cheia a mais. Limiar e força seguem a noite (DayNight.night): de dia só o muito claro, de
// noite as luzes da cidade.
// A mesma passada leva os EFEITOS DE TELA do que o jogador sente (render/ScreenFx.js, uniform `fx`): borrão de velocidade nas bordas,
// separação de cores no impacto e a tela sem cor com a vida baixa. Eles ficam numa SEGUNDA variante do shader (`#define FX`), que só
// entra enquanto algum efeito está ativo: em repouso roda o shader de sempre, sem nenhuma amostra a mais.
// ============================================================================

const Lighting = {
	// Chaves pedidas pela URL (`?luz=…`) ou, sem ela, as do preset (Config.light).
	_url() {
		if (typeof location === 'undefined') return null;
		const m = location.search.match(/[?&]luz=([^&]*)/);
		if (!m) return null;
		const L = decodeURIComponent(m[1]).split(/[,+ ]/);
		return { ceu: L.includes('ceu'), cor: L.includes('cor') };
	},
	get flags() { return this._flags || (this._flags = this._url() || { ceu: !!Config.light.sky, cor: !!Config.light.grade }); },

	grade: null,              // pós-processamento da gradação (GRADE_FS)
	bloomFx: null,            // { ext, bh, bv } — as passadas do brilho de verdade, quando ligado (setBloom)
	// A primeira passada do grupo da luz (o brilho, se ligado; senão a gradação): o rastro (Trails) entra logo antes dela.
	get head() { return this.bloomFx ? this.bloomFx.ext : this.grade; },
	BLOOM: { thrDay: 0.84, thrNight: 0.58, knee: 0.12, kDay: 0.42, kNight: 0.95, spread: 1.7 },
	horizon: null,            // [y do horizonte (UV), faixa (UV), raio (px)] — o desfoque do horizonte (render/Trails.js), ou null
	crt: null,                // os parâmetros da TV de tubo (render/CrtFilter.js), ou null
	FX_DEFINE: '#define FX\n',
	_fxOn: false, _fxEffect: null,

	// Liga ou desliga a variante com os efeitos de tela (ScreenFx.update, todo quadro: só troca quando muda e o shader já compilou).
	fx(on) {
		const t = this.grade;
		if (!t || on === this._fxOn) return;
		if (on && !(this._fxEffect && this._fxEffect.isReady())) return;
		this._fxOn = on;
		t.updateEffect(on ? Lighting.FX_DEFINE : null);
	},

	// Depois da câmera e do antisserrilhado (Game): cria a gradação, se ligada — o último pós-processamento da câmera.
	init(game) {
		const F = this.flags, cam = game.camera.camera, eng = game.gameEngine.engine;
		if (F.cor) {
			const T = Config.light.gradeParams;
			BABYLON.Effect.ShadersStore.luzCorFragmentShader = Lighting.GRADE_FS;
			const soft = !(typeof location !== 'undefined' && /[?&]suave=0\b/.test(location.search));      // (`?suave=0`: sem o desfoque, para comparar)
			const t = this.grade = new BABYLON.PostProcess('luzCor', 'luzCor', ['contrast', 'saturation', 'texel', 'soften', 'tilt', 'bloom', 'lift', 'roll', 'warm', 'vig', 'fx', 'horizon', 'crt', 'crtAb', 'screen', 'bloomK'], ['bloomSampler'], 1.0, cam, BABYLON.Texture.BILINEAR_SAMPLINGMODE, eng);
			t.onApply = (e) => {
				// (a mesma passada faz o desfoque do HORIZONTE — render/Trails.js — e a TV de tubo — render/CrtFilter.js —: antes eram
				// três passadas de tela cheia a mais por quadro)
				const H = this.horizon, C = this.crt, B = this.bloomFx, src = B ? B.ext : t;      // (com o brilho: a cena é a entrada dele)
				e.setFloat3('horizon', H ? H[0] : 2, H ? H[1] : 0.2, H ? H[2] : 0);
				if (C) { e.setFloat4('crt', C.curvature, C.scanlines, C.lineScale, C.vignette); e.setFloat('crtAb', C.aberration || 0); }
				else { e.setFloat4('crt', -1, 0, 0, 0); e.setFloat('crtAb', 0); }
				e.setFloat2('screen', src.width, src.height);
				e.setFloat('contrast', T.contrast); e.setFloat('saturation', T.saturation);
				e.setFloat2('texel', 1 / Math.max(1, src.width), 1 / Math.max(1, src.height));
				e.setFloat('soften', soft ? T.soften : 0); e.setFloat('tilt', soft ? T.tilt : 0); e.setFloat('bloom', soft && !B ? T.bloom : 0);
				if (B) { e.setTextureFromPostProcess('textureSampler', B.ext); e.setTextureFromPostProcess('bloomSampler', t); e.setFloat('bloomK', B.k); }
				else { e.setTextureFromPostProcess('bloomSampler', t); e.setFloat('bloomK', 0); }
				e.setFloat('lift', T.lift); e.setFloat('roll', T.roll); e.setFloat('warm', T.warm); e.setFloat('vig', T.vignette);
				if (this._fxOn && typeof ScreenFx !== 'undefined') ScreenFx.apply(e);      // velocidade, impacto, vida baixa (render/ScreenFx.js)
			};
			// DUAS variantes do shader: a de sempre e a com os efeitos de tela (#define FX). As duas são compiladas já na carga (a troca
			// não pode esperar a compilação: a tela ficaria um quadro sem imagem) e a com efeitos só entra enquanto algum está ativo.
			// Com um shader só, o compilador da placa (HLSL, no Windows) tira as amostras de textura de dentro dos `if` e passa a fazê-las
			// SEMPRE: 7 leituras de tela a mais por pixel, com tudo em zero.
			t.updateEffect(Lighting.FX_DEFINE); this._fxEffect = t.getEffect();
			t.updateEffect(null);
			this._fxOn = false;
			this._cam = cam; this._eng = eng;
			if (Config.perf.bloom && !(typeof location !== 'undefined' && /[?&]brilho=0\b/.test(location.search))) this.setBloom(true);
		}
		console.log(`[LUZ] ${['ceu', 'cor'].filter((k) => F[k]).join(' + ') || 'desligada'}${this.bloomFx ? ' + brilho' : ''}`);
	},

	// Liga/desliga o BRILHO DE VERDADE (init, pelo preset; AutoQuality desliga no degrau 'fill'). Só com a gradação.
	setBloom(on) {
		const t = this.grade, cam = this._cam, eng = this._eng;
		on = !!on;
		if (!t || !cam || on === !!this.bloomFx) return;
		const clean = () => { const P = cam._postProcesses; for (let i = P.length - 1; i >= 0; i--) if (!P[i]) P.splice(i, 1); };
		if (!on) {
			const B = this.bloomFx; this.bloomFx = null;
			for (const pp of [B.ext, B.bh, B.bv]) { cam.detachPostProcess(pp); pp.dispose(cam); }
			clean();
			t._options = 1.0;                                                         // (a gradação volta a ler a cena na própria entrada)
			return;
		}
		const S = BABYLON.Effect.ShadersStore;
		S.luzBrilhoExFragmentShader = Lighting.BLOOM_EX_FS;
		S.luzBrilhoBlurFragmentShader = Lighting.BLOOM_BLUR_FS;
		const caps = eng.getCaps(), type = caps.textureHalfFloatRender ? BABYLON.Constants.TEXTURETYPE_HALF_FLOAT : BABYLON.Constants.TEXTURETYPE_UNSIGNED_INT;
		const L = BABYLON.Texture.BILINEAR_SAMPLINGMODE, Bp = this.BLOOM;
		const ext = new BABYLON.PostProcess('luzBrilhoEx', 'luzBrilhoEx', ['texel', 'thr'], null, 1.0, cam, L, eng, false, null, type);
		const bh = new BABYLON.PostProcess('luzBrilhoH', 'luzBrilhoBlur', ['dir'], null, 0.25, cam, L, eng, false, null, type);
		const bv = new BABYLON.PostProcess('luzBrilhoV', 'luzBrilhoBlur', ['dir'], null, 0.25, cam, L, eng, false, null, type);
		const B = this.bloomFx = { ext, bh, bv, k: Bp.kDay, thr: Bp.thrDay };
		const night = () => { const g = typeof window !== 'undefined' && window.game; return g && g.dayNight ? Math.max(0, Math.min(1, g.dayNight.night)) : 0; };
		ext.onApply = (e) => {
			const n = night();
			B.thr = Bp.thrDay + (Bp.thrNight - Bp.thrDay) * n; B.k = Bp.kDay + (Bp.kNight - Bp.kDay) * n;
			e.setFloat2('texel', 1 / Math.max(1, ext.width), 1 / Math.max(1, ext.height));
			e.setFloat2('thr', B.thr, Bp.knee);
		};
		bh.onApply = (e) => e.setFloat2('dir', Bp.spread / Math.max(1, bh.width), 0);
		bv.onApply = (e) => e.setFloat2('dir', 0, Bp.spread / Math.max(1, bv.height));
		// na cadeia: logo antes da gradação (depois do antisserrilhado e do rastro)
		for (const pp of [ext, bh, bv]) cam.detachPostProcess(pp);
		clean();
		const at = cam._postProcesses.indexOf(t);
		cam.attachPostProcess(ext, at); cam.attachPostProcess(bh, at + 1); cam.attachPostProcess(bv, at + 2);
		t._options = 0.25;                                                            // (a entrada da gradação = o brilho, em 1/4)
	},

	// Separa o que é claro (joelho suave), já reduzindo a 1/4: 4 leituras bilineares nos cantos de um pixel cobrem o bloco 4×4.
	BLOOM_EX_FS: `
		precision highp float;
		varying vec2 vUV;
		uniform sampler2D textureSampler;
		uniform vec2 texel;            // 1 / tamanho da entrada (a cena)
		uniform vec2 thr;              // limiar, joelho
		vec3 bright(vec3 c) {
			float b = max(c.r, max(c.g, c.b));
			float q = clamp(b - thr.x + thr.y, 0.0, 2.0 * thr.y);
			q = q * q / (4.0 * thr.y + 1e-4);
			return c * (max(q, b - thr.x) / max(b, 1e-4)) / max(1.0 - thr.x, 0.05);
		}
		void main(void) {
			vec3 s = bright(texture2D(textureSampler, vUV + texel * vec2(-1.0, -1.0)).rgb)
				+ bright(texture2D(textureSampler, vUV + texel * vec2(1.0, -1.0)).rgb)
				+ bright(texture2D(textureSampler, vUV + texel * vec2(-1.0, 1.0)).rgb)
				+ bright(texture2D(textureSampler, vUV + texel * vec2(1.0, 1.0)).rgb);
			gl_FragColor = vec4(s * 0.25, 1.0);
		}`,
	// Gaussiana de 9 pontos em 5 leituras bilineares ao longo de `dir`.
	BLOOM_BLUR_FS: `
		precision highp float;
		varying vec2 vUV;
		uniform sampler2D textureSampler;
		uniform vec2 dir;
		void main(void) {
			vec3 c = texture2D(textureSampler, vUV).rgb * 0.227027;
			c += (texture2D(textureSampler, vUV + dir * 1.384615).rgb + texture2D(textureSampler, vUV - dir * 1.384615).rgb) * 0.316216;
			c += (texture2D(textureSampler, vUV + dir * 3.230769).rgb + texture2D(textureSampler, vUV - dir * 3.230769).rgb) * 0.070270;
			gl_FragColor = vec4(c, 1.0);
		}`,

	// Gradação, na própria imagem (sRGB), numa passada só (8 amostras em volta + o centro). (O ImageProcessingPostProcess do Babylon
	// converte a imagem entre linear e sRGB e não voltava à original: clareava ou escurecia.)
	//   • DESFOQUE LEVE: um pouco em toda a tela (`soften`: tira o serrilhado duro e o "brilho de jogo antigo") e mais para o alto da
	//     tela, onde a câmera inclinada vê longe (`tilt`, em px: a profundidade de campo de uma lente) — perto do personagem, nítido
	//   • BRILHO SUAVE (`bloom`): o que é claro vaza um pouco em volta (luz difusa do ar, não um halo)
	//   • COR DE FILME: saturação abaixo de 1 (cores menos vivas), os pretos levantados (`lift`) e o alto em curva suave (`roll`: não
	//     estoura), um toque quente (`warm`) e a vinheta discreta nas bordas (`vig`)
	// (NUNCA ponto e vírgula no comentário de uma linha `uniform`: o processador de shaders do Babylon corta a linha nele e o shader
	// não compila — a gradação saía da cadeia pela guarda.)
	GRADE_FS: `
		precision highp float;
		varying vec2 vUV;
		uniform sampler2D textureSampler;
		uniform float contrast, saturation, soften, tilt, bloom, lift, roll, warm, vig;
		uniform vec2 texel;
		uniform vec3 horizon;          // y do horizonte (UV), faixa (UV), raio do desfoque (px) - render/Trails.js
		uniform vec4 crt;              // TV de tubo (render/CrtFilter.js): curvatura (menor que 0 = desligada), scanlines, linhas por px, vinheta
		uniform float crtAb;           // aberração cromática nos cantos
		uniform vec2 screen;           // tamanho da saída (px)
		uniform sampler2D bloomSampler;  // o brilho de verdade em 1/4 da tela (Lighting.setBloom), ou a própria cena com força 0
		uniform float bloomK;
		#ifdef FX
		uniform vec4 fx;
		#endif
		void main(void) {
			// (NENHUM desvio que varie de pixel para pixel em volta das leituras de textura - nem sair cedo: o Chrome no Windows
			// traduz o shader para Direct3D, que recusa ler textura num laço dentro de um desvio assim, e a tela ficava só no azul do céu)
			vec2 uv = vUV;
			float inside = 1.0;
			if (crt.x >= 0.0) {                                                        // a TV de tubo: a imagem curva, preto fora do vidro
				vec2 bc = vUV * 2.0 - 1.0;
				bc *= 1.0 + crt.x * dot(bc, bc);
				uv = bc * 0.5 + 0.5;
				inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
				uv = clamp(uv, 0.0, 1.0);
			}
			vec4 c0 = texture2D(textureSampler, uv);
			vec3 c = c0.rgb;
			vec2 q = uv - 0.5;
			float rr = dot(q, q);
			float hz = horizon.z * smoothstep(horizon.x - horizon.y, horizon.x, uv.y);     // o horizonte: o longe "some" macio
			float top = smoothstep(0.45, 1.0, uv.y), r = 0.9 + tilt * top * top + hz;
			if (soften + bloom + tilt + horizon.z > 0.0) {                             // (só uniformes: o mesmo caminho em todos os pixels)
				vec3 s = vec3(0.0), b = vec3(0.0);
				for (int k = 0; k < 8; k++) {
					float a = float(k) * 0.785398 + 0.39;
					vec3 t = texture2D(textureSampler, uv + vec2(cos(a), sin(a)) * texel * r * (mod(float(k), 2.0) < 0.5 ? 1.0 : 0.55)).rgb;
					s += t; b += max(t - 0.62, 0.0);
				}
				s /= 8.0;
				c = mix(c, s, clamp(soften + top * top * 0.85 * step(0.001, tilt) + min(hz, 1.0) * 0.8, 0.0, 1.0));
				c += b / 8.0 * bloom;
			}
			c += texture2D(bloomSampler, uv).rgb * bloomK;                             // o brilho que vaza das luzes (antes da cor de filme)
			if (crtAb > 0.0 && crt.x >= 0.0) {                                         // (separação de cores nos cantos do tubo)
				vec2 sh = q * crtAb * dot(q, q) * 4.0;
				c.r = mix(c.r, texture2D(textureSampler, uv + sh).r, 0.8);
				c.b = mix(c.b, texture2D(textureSampler, uv - sh).b, 0.8);
			}
			#ifdef FX
			if (fx.x > 0.003) {                                                         // VELOCIDADE: as bordas esticam para fora (o centro, nítido)
				float edge = smoothstep(0.03, 0.4, rr), k = fx.x * edge * 0.05;
				vec3 a = c;
				for (int i = 1; i <= 5; i++) a += texture2D(textureSampler, uv - q * k * float(i) * 0.2).rgb;
				c = mix(c, a / 6.0, clamp(fx.x * 1.1, 0.0, 0.85) * edge);
			}
			if (fx.y > 0.003) {                                                         // IMPACTO: as cores se separam nas bordas por um instante
				vec2 o = q * fx.y * 0.035;
				c.r = mix(c.r, texture2D(textureSampler, uv + o).r, 0.85);
				c.b = mix(c.b, texture2D(textureSampler, uv - o).b, 0.85);
			}
			#endif
			c = (c - 0.5) * contrast + 0.5;
			float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
			c = mix(vec3(l), c, saturation);
			c = c + lift * (1.0 - c);                                                   // pretos levantados (sem preto chapado)
			vec3 hi = max(c - 0.55, 0.0);
			c -= hi * hi / 0.9 * roll;                                                  // o alto em curva (ombro suave: o branco vira ~0,93)
			c *= vec3(1.0 + warm, 1.0 + warm * 0.35, 1.0 - warm * 0.6);
			c *= 1.0 - vig * smoothstep(0.25, 0.75, rr * 2.0);
			#ifdef FX
			if (fx.z > 0.003) {                                                         // VIDA BAIXA: a cor some e as bordas escurecem pulsando
				float pulse = 0.62 + 0.38 * sin(fx.w * 6.6);
				c = mix(c, vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))) * vec3(1.05, 0.93, 0.9), fx.z * 0.62);
				float rim = smoothstep(0.1, 0.62, rr * 2.0);
				c *= 1.0 - fx.z * pulse * 0.5 * rim;
				c.r += fx.z * pulse * 0.09 * rim;
			}
			#endif
			if (crt.x >= 0.0) {                                                        // scanlines presas às linhas da saída e a vinheta do tubo
				float line = 0.5 + 0.5 * cos(uv.y * screen.y * crt.z * 6.2831853);
				c *= 1.0 - crt.y * (1.0 - line);
				c *= 1.0 - crt.w * smoothstep(0.35, 1.25, rr * 4.0);
			}
			gl_FragColor = vec4(clamp(c, 0.0, 1.0) * inside, c0.a);
		}`,

	// GUARDA DO PÓS-PROCESSAMENTO: uma passada cujo shader não compila nesta placa (cada navegador traduz o GLSL do seu jeito — o
	// Chrome no Windows, para Direct3D) sai da cadeia, em vez de deixar a tela só com a cor do céu: sem a imagem final, nada aparece.
	// Confere nos primeiros 60 s (as variantes compilam na carga) e avisa no console qual saiu e por quê.
	guard(game) {
		const cam = game.camera.camera, scene = game.scene, t0 = performance.now();
		const obs = scene.onBeforeRenderObservable.add(() => {
			for (const pp of cam._postProcesses) {
				const e = pp && pp.getEffect && pp.getEffect(), err = e && e.getCompilationError && e.getCompilationError();
				if (!err) continue;
				console.error(`[PÓS] a passada "${pp.name}" não compilou nesta placa — saiu da cadeia:`, err);
				cam.detachPostProcess(pp);
				if (pp === this.grade) {
					if (this.bloomFx) { const B = this.bloomFx; this.bloomFx = null; for (const q of [B.ext, B.bh, B.bv]) { cam.detachPostProcess(q); q.dispose(cam); } }
					this.grade = null; this.crt = null; this.horizon = null;
					if (game.crt && game.crt.enabled) { game.crt.setEnabled(false); game.crt.setEnabled(true); }      // (a TV de tubo volta à passada própria)
				} else if (game.crt && game.crt.postProcess === pp) game.crt.setEnabled(false);
				const P = cam._postProcesses;
				for (let i = P.length - 1; i >= 0; i--) if (!P[i]) P.splice(i, 1);
				pp.dispose(cam);
				break;
			}
			if (performance.now() - t0 > 60000) scene.onBeforeRenderObservable.remove(obs);
		});
	},

	// LUZ DO CÉU (DayNight.apply, com os parâmetros da hora já com o tempo): com o sol alto (peso `day`), céu azulado em cima, chão
	// quente embaixo, sol mais quente e sombra mais funda. O peso segue a ALTURA do sol: some no fim da tarde (a luz dourada fica como
	// está) e de noite.
	sky(P) {
		if (!this.flags.ceu) return;
		const S = Config.light.skyParams, day = (1 - Math.min(1, P.n)) * Math.max(0, Math.min(1, (P.sunH - S.lowSun) / S.fullSun));
		const to = (v, c) => v.map((x, i) => x + (c[i] - x) * day);
		P.hemiC = to(P.hemiC, S.sky); P.gnd = to(P.gnd, S.bounce); P.sunC = to(P.sunC, S.sun);
		P.hemiI *= 1 + S.hemiGain * day; P.sunI *= 1 + S.sunGain * day;
		P.shadowBase = 0.4 - S.deeper * day;
	},

	// Cor dos personagens 2,5D na sombra de um prédio: a luz que sobra na sombra (céu + o que o mapa de sombras deixa passar do sol)
	// ÷ a luz ao sol, cor a cor, numa superfície voltada para cima (como o chão em volta). Sem a luz do céu: o cinza de sempre.
	shadeColor(P, dark) {
		if (!this.flags.ceu) return null;
		const out = [0, 0, 0];
		for (let i = 0; i < 3; i++) {
			const sky = P.hemiI * P.hemiC[i], sun = P.sunI * P.sunC[i];
			out[i] = Math.max(0.3, Math.min(1, (sky + dark * sun) / Math.max(0.01, sky + sun)));
		}
		return out;
	},
};
