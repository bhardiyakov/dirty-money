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

	// Depois da câmera e do antisserrilhado (Game): cria a gradação, se ligada — o último pós-processamento da câmera.
	init(game) {
		const F = this.flags, cam = game.camera.camera, eng = game.gameEngine.engine;
		if (F.cor) {
			const T = Config.light.gradeParams;
			BABYLON.Effect.ShadersStore.luzCorFragmentShader = Lighting.GRADE_FS;
			const soft = !(typeof location !== 'undefined' && /[?&]suave=0\b/.test(location.search));      // (`?suave=0`: sem o desfoque, para comparar)
			const t = this.grade = new BABYLON.PostProcess('luzCor', 'luzCor', ['contrast', 'saturation', 'texel', 'soften', 'tilt', 'bloom', 'lift', 'roll', 'warm', 'vig'], null, 1.0, cam, BABYLON.Texture.BILINEAR_SAMPLINGMODE, eng);
			t.onApply = (e) => {
				e.setFloat('contrast', T.contrast); e.setFloat('saturation', T.saturation);
				e.setFloat2('texel', 1 / Math.max(1, t.width), 1 / Math.max(1, t.height));
				e.setFloat('soften', soft ? T.soften : 0); e.setFloat('tilt', soft ? T.tilt : 0); e.setFloat('bloom', soft ? T.bloom : 0);
				e.setFloat('lift', T.lift); e.setFloat('roll', T.roll); e.setFloat('warm', T.warm); e.setFloat('vig', T.vignette);
			};
		}
		console.log(`[LUZ] ${['ceu', 'cor'].filter((k) => F[k]).join(' + ') || 'desligada'}`);
	},

	// Gradação, na própria imagem (sRGB), numa passada só (8 amostras em volta + o centro). (O ImageProcessingPostProcess do Babylon
	// converte a imagem entre linear e sRGB e não voltava à original: clareava ou escurecia.)
	//   • DESFOQUE LEVE: um pouco em toda a tela (`soften`: tira o serrilhado duro e o "brilho de jogo antigo") e mais para o alto da
	//     tela, onde a câmera inclinada vê longe (`tilt`, em px: a profundidade de campo de uma lente) — perto do personagem, nítido
	//   • BRILHO SUAVE (`bloom`): o que é claro vaza um pouco em volta (luz difusa do ar, não um halo)
	//   • COR DE FILME: saturação abaixo de 1 (cores menos vivas), os pretos levantados (`lift`) e o alto em curva suave (`roll`: não
	//     estoura), um toque quente (`warm`) e a vinheta discreta nas bordas (`vig`)
	GRADE_FS: `
		precision highp float;
		varying vec2 vUV;
		uniform sampler2D textureSampler;
		uniform float contrast, saturation, soften, tilt, bloom, lift, roll, warm, vig;
		uniform vec2 texel;
		void main(void) {
			vec4 c0 = texture2D(textureSampler, vUV);
			vec3 c = c0.rgb;
			float top = smoothstep(0.45, 1.0, vUV.y), r = 0.9 + tilt * top * top;
			if (soften + bloom + tilt > 0.0) {
				vec3 s = vec3(0.0), b = vec3(0.0);
				for (int k = 0; k < 8; k++) {
					float a = float(k) * 0.785398 + 0.39;
					vec3 t = texture2D(textureSampler, vUV + vec2(cos(a), sin(a)) * texel * r * (mod(float(k), 2.0) < 0.5 ? 1.0 : 0.55)).rgb;
					s += t; b += max(t - 0.62, 0.0);
				}
				s /= 8.0;
				c = mix(c, s, clamp(soften + top * top * 0.85 * step(0.001, tilt), 0.0, 1.0));
				c += b / 8.0 * bloom;
			}
			c = (c - 0.5) * contrast + 0.5;
			float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
			c = mix(vec3(l), c, saturation);
			c = c + lift * (1.0 - c);                                                   // pretos levantados (sem preto chapado)
			vec3 hi = max(c - 0.55, 0.0);
			c -= hi * hi / 0.9 * roll;                                                  // o alto em curva (ombro suave: o branco vira ~0,93)
			c *= vec3(1.0 + warm, 1.0 + warm * 0.35, 1.0 - warm * 0.6);
			vec2 q = vUV - 0.5;
			c *= 1.0 - vig * smoothstep(0.25, 0.75, dot(q, q) * 2.0);
			gl_FragColor = vec4(clamp(c, 0.0, 1.0), c0.a);
		}`,

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
