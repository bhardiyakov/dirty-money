// ============================================================================
// Char3D — os personagens em 3D DE VERDADE, ao vivo na GPU (no lugar do desenho 2,5D do atlas). Ver docs/personagens-3d.md.
//
// O gerador dos personagens (tools/asset_baker/generator, empacotado no Worker do guarda-roupa: assets/baked/wardrobe.worker.js) é o
// mesmo que desenha os atlas: ele assa a ficha do personagem (corpo da malha 3D, cabelo, roupa, bolsa, armas) em PONTOS da superfície,
// cada um no espaço do seu osso (a malha com o 2º osso e o peso: skin linear de 2 ossos), e anima o esqueleto em todos os clipes. Em vez
// de "fotografar" cada pose em 16 direções, o Worker manda ao jogo:
//   • os pontos (uma vez por MODELO): posição/normal no osso 1 e no osso 2, peso, material e tom;
//   • por clipe (quando ele toca pela 1ª vez): as matrizes dos 16 ossos em cada quadro e os objetos na mão (arma, garrafa, celular…).
// A GPU monta o boneco a cada quadro (shader 'char3d': skin, luz do sol em faixas como o desenho, cor pela rampa de 5 tons de cada
// material — os mesmos tons do atlas) e desenha cada ponto como um disquinho do tamanho certo na tela.
//
//   Char3DModel  uma ficha assada: a do JOGADOR (as cores dela, rampas próprias) ou a de um TIPO de NPC (a forma é a mesma em todas as
//                variantes do tipo — as cores vêm da paleta do NpcArt, pela linha do ator). Pontos, clipes e objetos são compartilhados.
//   Char3DActor  um personagem na tela: segue um SpriteActor (que continua sendo a lógica: clipe, fase, rumo, posição, pulo,
//                visibilidade) e esconde o desenho 2,5D dele (layerMask 0) enquanto o 3D está à mostra. Clipe que o gerador não tem
//                (folha antiga) ou que ainda está chegando: o 2,5D aparece no lugar, sem buraco.
//   Char3D.tick  a cada quadro: o jogador, e os NPCs MAIS PERTO da câmera (até Config.art.char3d.npc.max, num raio) — os outros
//                seguem 2,5D (de longe a diferença não aparece, e o celular não aguentaria centenas de bonecos de pontos).
// ============================================================================

const Char3D = {
	get C() { return (Config.art && Config.art.char3d) || {}; },
	get on() {
		return !this.off && this.C.on !== false && typeof Worker === 'function' && typeof Wardrobe !== 'undefined';      // (off: disable() — só em último caso)
	},
	get npcOn() { const N = this.C.npc; return this.on && !!N && N.on !== false && typeof NpcArt !== 'undefined' && !!NpcArt._pal; },
	// SEM 2,5D (desde nov/2026 — as páginas dos desenhos 2,5D nem existem mais): todo personagem é 3D, a qualquer distância (os níveis de
	// detalhe seguram o custo). Erro repetido no quadro ou o modo seguro não desligam o 3D — sem desenho de reserva, todos sumiriam —:
	// passam ao MODO SIMPLES (degrade).
	get no2d() { return this.on; },
	// MODO SIMPLES: todos os NPCs no nível mais leve, sem o rosto e a estampa por pixel, sem a textura de detalhe, sem derivadas no shader e
	// sem transição entre clipes — o mínimo que ainda mostra as pessoas. Os bonecos refazem materiais e malhas no próximo quadro.
	safe: false,
	degrade(why = '') {
		if (this.safe) return;
		this.safe = true; this.lodBias = Math.max(this.lodBias || 1, 6);
		const all = [...(this.npcs ? this.npcs.values() : [])];
		if (this._game && this._game.player.char3d) all.push(this._game.player.char3d);
		for (const C of all) { try { C._clear(); C._built = false; } catch (e) { /* segue */ } }
		this._pick = 0;
		console.warn('[Char3D] personagens 3D no modo simples' + (why ? ' (' + why + ')' : ''));
	},
	// NÍVEIS DE DETALHE dos NPCs (low poly), como nos motores atuais: pelo TAMANHO NA TELA (a altura do boneco / a altura da tela), não
	// pela distância — a câmera alta vê um boneco a 15 m bem menor que a de perseguição: L0 acima de 10% da altura da tela, L1 acima de
	// 5,5%, L2 acima de 2,8%, L3 abaixo). L0 ~2,5 mil triângulos, L1 ~1,4 mil, L2 ~800,
	// L3 ~350; o jogador, ~5 mil. Folga de 15% para não trocar para lá e para cá na borda. lodBias > 1 (AutoQuality, preset Low) baixa
	// o detalhe mais cedo. De longe a pose é calculada a cada 2 (L2) ou 3 (L3) quadros.
	LOD_LEVELS: ['npc', 'mid', 'far', 'tiny'],
	LOD_SCREEN: [0.1, 0.055, 0.028],
	LOD_EVERY: [1, 1, 2, 3],
	lodBias: 1,
	_frame: 0,
	// LOW POLY (o padrão desde novembro/2026): o boneco em TRIÂNGULOS de face chapada (shader 'char3dPoly'; o Worker monta com G.lowBody —
	// o corpo e o cabelo da malha simplificados pelo meshoptimizer, os acessórios geométricos em triângulos, o rosto e a estampa do peito
	// pintados por pixel) no lugar das dezenas de milhares de pontos. Os objetos na mão seguem em pontos.
	// Config.art.char3d.poly; ?poly=1 / ?poly=0 forçam (?poly=0: os pontos de antes).
	get polyOn() {
		const q = typeof location !== 'undefined' ? location.search : '';
		if (/[?&]poly=1\b/.test(q)) return true;
		if (/[?&]poly=0\b/.test(q)) return false;
		return !!this.C.poly;
	},
	// O estilo do boneco 3D low poly: 'real' (o padrão — PS2 realista: proporções de gente, rosto sem o tamanho de desenho, luz suave)
	// ou 'igual3d' (o dos desenhos 2,5D, luz em faixas). Config.art.char3d.style; ?estilo3d=igual3d força.
	get style3d() {
		const m = typeof location !== 'undefined' && /[?&]estilo3d=(\w+)/.exec(location.search);
		return (m && m[1]) || this.C.style || 'real';
	},
	BONES: 16,
	// TEXTURAS DE DETALHE do low poly (as do pacote da malha: tecido, mechas), uma por nome, compartilhadas por todos os modelos;
	// sem textura: 1 pixel branco (o detalhe some, o recorte não corta nada)
	_tex: new Map(),
	texAdd(scene, name, t) {
		if (this._tex.has(name)) return;
		const T = new BABYLON.RawTexture(t.d, t.w, t.h, BABYLON.Engine.TEXTUREFORMAT_RGBA, scene, true, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
		T.wrapU = T.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE; T.name = 'c3d_tex_' + name;
		this._tex.set(name, T);
	},
	tex(scene, name) {
		const T = name && this._tex.get(name);
		if (T) return T;
		if (!this._white || this._white.getScene() !== scene) this._white = new BABYLON.RawTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, BABYLON.Engine.TEXTUREFORMAT_RGBA, scene, false);
		return this._white;
	},
	_shader() {
		if (BABYLON.Effect.ShadersStore.char3dVertexShader) return;
		BABYLON.Effect.ShadersStore.char3dVertexShader = `
			precision highp float;
			// Cada PONTO é uma cópia (instancing) de um quadradinho de 2 triângulos virado para a câmera: position = o canto (−1..1); os
			// dados do ponto vêm por cópia. (Antes eram GL_POINTS com gl_PointSize: no Windows o Chrome traduz o WebGL para o Direct3D,
			// que não tem ponto com tamanho — a emulação apagava a cena inteira em algumas placas.)
			attribute vec3 position;     // canto do quadradinho
			attribute vec3 ip;           // ponto no espaço do osso 1 (unidades do gerador: x direita, y frente, z cima)
			attribute vec3 in1;
			attribute vec3 p2;           // o mesmo ponto no espaço do osso 2 (malha 3D)
			attribute vec3 n2;
			attribute vec4 sk;           // osso 1, osso 2, peso do 2
			attribute vec2 mt;           // material, tom
			attribute vec4 fa;           // EXPRESSÕES do rosto (cabeça): código do ponto em angry, rage, scared, pain (0 = igual)
			attribute float fb;          // … e em closed (código = 1 + material × 16 + tom + 8)
			uniform float expr;          // expressão do quadro (0 = a da ficha, 1–5 = G.FACES)
			uniform mat4 world;
			uniform mat4 viewProjection;
			uniform vec4 B[48];          // 16 ossos × 3 linhas (R | t)
			uniform float unit;          // m por unidade do gerador (× escala da pose)
			uniform float pScale;        // px de tela por m a 1 m da câmera (altura da tela × projeção / 2)
			uniform float splat;         // diâmetro do ponto (m)
			uniform vec3 eye;
			uniform vec3 sunL;           // para onde está o sol (mundo)
			uniform float groundY;       // SOMBRA: altura do chão sob os pés
			uniform vec2 viewport;       // tamanho da tela de desenho (px)
			varying vec2 vC;             // canto do quadradinho (o disco: |vC| ≤ 1)
			varying vec2 vMt;
			varying float vLev;
			vec3 xp(int b, vec3 p) { vec4 r0 = B[b * 3], r1 = B[b * 3 + 1], r2 = B[b * 3 + 2]; return vec3(dot(r0.xyz, p) + r0.w, dot(r1.xyz, p) + r1.w, dot(r2.xyz, p) + r2.w); }
			vec3 xn(int b, vec3 n) { return vec3(dot(B[b * 3].xyz, n), dot(B[b * 3 + 1].xyz, n), dot(B[b * 3 + 2].xyz, n)); }
			// o centro do ponto na tela → o canto do quadradinho, com o diâmetro em px do tamanho do ponto no mundo
			vec4 corner(vec4 c) {
				float px = clamp(splat * pScale / max(c.w, 0.05), 1.0, 48.0);
				c.xy += position.xy * (px / viewport) * c.w;
				return c;
			}
			void main(void) {
				vC = position.xy;
				vec2 mtv = mt;
				if (expr > 0.5) {
					float c = expr < 1.5 ? fa.x : expr < 2.5 ? fa.y : expr < 3.5 ? fa.z : expr < 4.5 ? fa.w : fb;
					if (c > 0.5) { c -= 1.0; float m = floor(c / 16.0 + 0.001); mtv = vec2(m, c - m * 16.0 - 8.0); }
				}
				int b1 = int(sk.x + 0.5), b2 = int(sk.y + 0.5);
				float w = sk.z;
				vec3 p = xp(b1, ip), n = xn(b1, in1);
				if (w > 0.0) { p = mix(p, xp(b2, p2), w); n = mix(n, xn(b2, n2), w); }
				vec4 wp = world * vec4(vec3(p.x, p.z, p.y) * unit, 1.0);
				vec3 nw = normalize((world * vec4(n.x, n.z, n.y, 0.0)).xyz);
				vec3 V = normalize(eye - wp.xyz);
				#ifdef SHADOW
				// SOMBRA projetada: cada ponto desce na direção do sol até o chão (a silhueta da pose, deitada no chão)
				wp.xyz -= sunL * ((wp.y - groundY) / max(sunL.y, 0.2));
				gl_Position = corner(viewProjection * wp);
				vLev = 0.0; vMt = vec2(0.0);
				return;
				#endif
				if (dot(nw, V) < -0.2) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vLev = 0.0; vMt = vec2(0.0); return; }    // (de costas: atrás do resto)
				#ifdef SIL
				if (p.z < 12.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vLev = 0.0; vMt = vec2(0.0); return; }     // (os pés rente ao chão: o chão não esconde ninguém)
				wp.xyz += V * 0.06;          // (raio-X: folga contra o empate de profundidade com o próprio corpo)
				#endif
				gl_Position = corner(viewProjection * wp);
				// luz em faixas, como o desenho (NpcGenRender, sombreado de 5 tons): 1 + degraus da luz + o tom do ponto (textura)
				float d = dot(nw, sunL);
				float lev = 1.0 + smoothstep(-0.36, -0.24, d) + smoothstep(0.24, 0.36, d) + smoothstep(0.74, 0.86, d) + clamp(mtv.y, -1.5, 1.0);      // (tom: no atlas, a média do pixel suavizava as dobras mais fundas)
				lev += 0.35 * clamp(dot(nw, V), 0.0, 1.0) - 0.15;                // (o que encara a câmera um pouco mais claro: volume)
				vLev = clamp(lev, 0.0, 4.0);
				vMt = mtv;
			}`;
		BABYLON.Effect.ShadersStore.char3dFragmentShader = `
			precision highp float;
			varying vec2 vC;
			varying vec2 vMt;
			varying float vLev;
			uniform sampler2D ramps;     // 5 tons (x) × 32 materiais (y) — a ficha do jogador
			uniform sampler2D palette;   // NPCs: a paleta do NpcArt (256 códigos = material × 8 + tom, uma linha por variante)
			uniform float palRows;
			uniform float row;
			uniform vec3 tint;           // dia/noite (SpriteMaterial.sharedTint)
			uniform float shade;         // 1 ao sol, ~0,66 na sombra de um prédio
			uniform vec4 silhouette;     // raio-X (XRaySilhouette): cor chapada e força
			void main(void) {
				if (dot(vC, vC) > 1.0) discard;
				#ifdef SIL
				gl_FragColor = vec4(silhouette.rgb * silhouette.a, silhouette.a); return;
				#endif
				#ifdef SHADOW
				gl_FragColor = vec4(0.0, 0.0, 0.0, silhouette.a); return;      // (silhouette.a = força da sombra)
				#endif
				#ifdef PAL
				float m = floor(vMt.x + 0.5), i0 = floor(vLev), i1 = min(i0 + 1.0, 4.0), y = (row + 0.5) / palRows;
				vec3 c = mix(texture2D(palette, vec2((m * 8.0 + i0 + 0.5) / 256.0, y)).rgb, texture2D(palette, vec2((m * 8.0 + i1 + 0.5) / 256.0, y)).rgb, vLev - i0);
				#else
				vec3 c = texture2D(ramps, vec2((vLev + 0.5) / 5.0, (floor(vMt.x + 0.5) + 0.5) / 32.0)).rgb;
				#endif
				gl_FragColor = vec4(c * tint * shade, 1.0);
			}`;
		// LOW POLY: os mesmos ossos (B) e a mesma luz em faixas e cores da paleta, em TRIÂNGULOS: a normal da FACE vem das derivadas da
		// posição no mundo (face chapada, sem normal por vértice). SIL (raio-X) e SHADOW (sombra projetada) como nos pontos.
		BABYLON.Effect.ShadersStore.char3dPolyVertexShader = `
			precision highp float;
			// (atributos COMPACTOS — 56 bytes por canto em vez de 116: Char3DModel._tris)
			attribute vec3 position;     // canto no espaço do osso 1
			attribute vec3 p2;           // … no do osso 2
			attribute vec4 sk;           // bytes: osso 1, osso 2, peso do 2 × 255, oclusão de ambiente × 255 (assada: dobras, axilas, queixo)
			attribute vec4 mt;           // bytes: material, tom
			attribute vec4 fp;           // inteiros de 16 bits: o canto no espaço da cabeça ou do peito × 64, e qual (1 cabeça: o rosto, 2 peito: a estampa)
			attribute vec4 ux;           // 16 bits normalizados: u, v, qual textura de detalhe ÷ 2 (1 tecido, 2 cabelo), a luz média da peça nela
			attribute vec4 in1;          // bytes normalizados: a normal do vértice no espaço do osso 1
			attribute vec4 n2;           // ... no do osso 2
			uniform mat4 world;
			uniform mat4 viewProjection;
			uniform vec4 B[48];
			uniform float unit;
			uniform vec3 eye;
			uniform vec3 sunL;
			uniform float groundY;
			varying vec3 vW;
			varying vec2 vMt;
			varying vec3 vF;
			varying float vS;
			varying vec3 vN;
			varying vec4 vX;
			varying float vAo;
			varying float vZ;            // a altura no corpo (raio-X: os pés rente ao chão não viram silhueta)
			vec3 xn(int b, vec3 n) { return vec3(dot(B[b * 3].xyz, n), dot(B[b * 3 + 1].xyz, n), dot(B[b * 3 + 2].xyz, n)); }
			vec3 xp(int b, vec3 p) { vec4 r0 = B[b * 3], r1 = B[b * 3 + 1], r2 = B[b * 3 + 2]; return vec3(dot(r0.xyz, p) + r0.w, dot(r1.xyz, p) + r1.w, dot(r2.xyz, p) + r2.w); }
			void main(void) {
				int b1 = int(sk.x + 0.5), b2 = int(sk.y + 0.5);
				float w2 = sk.z / 255.0;
				vec3 p = xp(b1, position);
				if (w2 > 0.0) p = mix(p, xp(b2, p2), w2);
				vec4 wp = world * vec4(vec3(p.x, p.z, p.y) * unit, 1.0);
				#ifdef SHADOW
				wp.xyz -= sunL * ((wp.y - groundY) / max(sunL.y, 0.2));
				#endif
				#ifdef SIL
				wp.xyz += normalize(eye - wp.xyz) * 0.06;                        // (os pés rente ao chão: o fragmento corta — vZ)
				#endif
				vW = wp.xyz; vMt = mt.xy; vF = fp.xyz / 64.0; vS = fp.w; vX = vec4(ux.xy, floor(ux.z * 2.0 + 0.5), ux.w); vAo = sk.w / 255.0; vZ = p.z;
				vec3 nn = xn(b1, in1.xyz);
				if (w2 > 0.0) nn = mix(nn, xn(b2, n2.xyz), w2);
				vN = (world * vec4(nn.x, nn.z, nn.y, 0.0)).xyz;                  // (direção: só a rotação do mundo)
				gl_Position = viewProjection * wp;
			}`;
		BABYLON.Effect.ShadersStore.char3dPolyFragmentShader = `
			#extension GL_OES_standard_derivatives : enable
			precision highp float;
			varying vec3 vW;
			varying vec2 vMt;
			uniform sampler2D ramps;
			uniform sampler2D palette;
			uniform float palRows;
			uniform float row;
			uniform vec3 tint;
			uniform float shade;
			uniform vec4 silhouette;
			uniform vec3 sunL;
			uniform vec3 eye;
			varying vec3 vF;
			varying float vS;
			varying vec3 vN;
			varying vec4 vX;
			varying float vAo;
			varying float vZ;
			uniform sampler2D clothTex;  // o detalhe do tecido do pacote (dobras, desgaste e costuras do jeans), em tons de cinza
			uniform sampler2D hairTex;   // as mechas do cabelo, com o alfa do cartão
			uniform vec4 face;           // a ficha: cara fechada, feminino, barba (1 cheia, 2 cavanhaque, 3 bigode), óculos
			uniform vec2 face2;          // máscara (1 touca ninja, 2 bandana), tamanho do rosto (G.TOON.face)
			uniform float expr;          // expressão do quadro (0 = a da ficha, 1–5 = G.FACES)
			uniform vec4 shirt;          // estampa (1 listras horizontais, 2 verticais, 3 floral, 4 camisa de time, 5 logo), corrente, botões (1 de tecido, 2 de metal), zíper
			const float M_SKIN = 1.0, M_HAIR = 2.0, M_SHIRT = 3.0, M_EYE = 12.0, M_EYEW = 13.0, M_MOUTH = 14.0, M_CHROME = 17.0, M_BROW = 18.0, M_HAT = 21.0, M_ACC = 22.0, M_BEARD = 23.0, M_GOLD = 24.0, M_LENS = 25.0, M_ACC2 = 29.0;
			bool isM(float a, float b) { return abs(a - b) < 0.5; }
			float sq(float a) { return a * a; }
			// O ROSTO por pixel, a receita do NpcGenChar.makeTexHead (olhos, sobrancelhas, boca, barba, óculos, máscara e as expressões),
			// no espaço da cabeça (P) com a normal da face nele (nf): o material do pixel e o tom
			float faceMat(float m, vec3 P, vec3 nf, inout float tone) {
				float x = P.x, y = P.y, z = P.z, ax = abs(x), fk = face2.y;
				bool front = nf.y > 0.25, skin = isM(m, M_SKIN), female = face.y > 0.5;
				float ey = expr > 0.5 ? expr : face.x;                         // (0 neutro, 1 cara fechada, 2 fúria, 3 susto, 4 dor, 5 olhos fechados)
				bool angry = isM(ey, 1.0), mouth = false;
				float ex = 5.4, ez = 10.2, rx = 3.0 * fk, rz = (angry ? 2.0 : 1.8) * fk, slope = angry ? 0.42 : 0.1, bw0 = (female ? 0.42 : 0.55) * fk * fk;
				float ox = ax - ex, oz = z - ez;
				if (skin && front && y > 6.0) {
					if (isM(ey, 3.0)) {
						if (ox * ox + oz * oz < sq(2.5 * fk)) m = sq(ox + 0.25) + sq(oz + 0.1) < sq(1.05 * fk) ? M_EYE : M_EYEW;
						if (abs(z - (ez + 3.5 * fk - 0.32 * ox)) < bw0 && ax > 2.2 && ax < 7.8) m = M_BROW;
						mouth = sq(x / 1.35) + sq((z - 3.0) / 1.15) < 1.0;
					} else if (isM(ey, 4.0)) {
						if (ox > -2.5 && ox < 2.5 && abs(abs(oz) - 0.25 * (ox + 2.5)) < 0.42 * fk) m = M_EYE;
						if (abs(z - (ez + 2.6 * fk - 0.45 * ox)) < bw0 * 1.15 && ax > 2.2 && ax < 7.8) m = M_BROW;
						mouth = ax < 2.3 && abs(z - 3.2) < 0.7;
						if (mouth && ax < 1.9 && abs(z - 3.45) < 0.22) { m = M_EYEW; mouth = false; }
					} else if (isM(ey, 5.0)) {
						if (abs(ox) < 2.4 * fk && abs(oz + 0.5 + 0.08 * ox * ox) < 0.38 * fk) m = M_EYE;
						if (abs(z - (ez + 2.9 * fk + 0.1 * ox)) < bw0 * 0.9 && ax > 2.2 && ax < 7.8) m = M_BROW;
						mouth = ax < 1.2 && abs(z - 3.3) < 0.45;
					} else {
						bool rage = isM(ey, 2.0);
						float sl = rage ? 0.7 : slope, lidZ = rage ? 0.35 : 0.95, ez2 = rage ? 2.0 * fk : rz;
						if (sq(ox / rx) + sq(oz / ez2) < 1.0 && oz < lidZ + sl * ox) m = ox > 0.55 && oz > -0.9 ? M_EYEW : M_EYE;
						float bz = ez + (rage ? 1.75 : angry ? 2.45 : 2.9) * fk + sl * ox;
						if (abs(z - bz) < bw0 * (rage ? 1.3 : 1.0) && ax > 2.2 && ax < 7.8) m = M_BROW;
						if (rage) {
							mouth = ax < 2.5 && abs(z - 3.2 + 0.12 * ax) < 0.62;
							if (mouth && ax < 2.1 && abs(z - 3.2 + 0.12 * ax) < 0.25) { m = M_EYEW; mouth = false; }
						} else mouth = ax < (female ? 1.6 : 1.8) && abs(z - 3.4) < 0.5;
					}
				}
				if (mouth) m = M_MOUTH;
				if (skin && front && ax < 1.3 && z > 5.3 && z < 6.2 && y > 9.0) tone -= 1.0;
				float bd = face.z;
				if (isM(bd, 1.0) || isM(bd, 2.0)) {
					bool jaw = isM(m, M_SKIN) && z < 6.6 && y > -1.5;
					if (isM(bd, 2.0)) jaw = jaw && ax < 3.2 && z < 3.0; else jaw = jaw && !(ax < 2.4 && z > 3.9);
					if (jaw) m = M_BEARD;
				}
				if ((isM(bd, 1.0) || isM(bd, 3.0)) && isM(m, M_SKIN) && front && ax < 3.0 && z > 3.9 && z < 5.1 && y > 8.0) m = M_BEARD;
				if (face.w > 0.5) {
					if (front && abs(z - (ez + 0.3)) < 1.75 && ax < 8.8 && y > 5.0 && !isM(m, M_HAIR)) { m = M_LENS; if (x < -5.0 && x > -6.4 && z > ez + 0.6) tone += 3.0; }
					else if (z > 6.5 && (isM(m, M_EYE) || isM(m, M_EYEW))) m = M_SKIN;
				}
				if (isM(face2.x, 1.0)) {
					bool hole = front && abs(z - ez) < 2.6 && ax < 8.8 && y > 4.0;
					if (!hole && (isM(m, M_SKIN) || isM(m, M_MOUTH) || isM(m, M_BROW) || isM(m, M_EYEW) || isM(m, M_EYE))) m = M_HAT;
				} else if (isM(face2.x, 2.0)) {
					if (z < 6.4 && y > -3.0 && (isM(m, M_SKIN) || isM(m, M_MOUTH) || isM(m, M_BEARD) || isM(m, M_EYEW))) m = M_ACC;
				}
				return m;
			}
			// A ESTAMPA do peito por pixel, a receita do NpcGenChar.makeTexChest (listras, flores, camisa de time, logo, botões, zíper, corrente)
			float shirtMat(float m, vec3 P, vec3 nf) {
				float x = P.x, y = P.y, z = P.z, ax = abs(x), ny = nf.y;
				if (isM(m, M_SHIRT)) {
					if (shirt.z > 0.5 && ny > 0.6 && abs(x - 0.4) < 0.45 && z < 14.5 && abs(mod(z + 30.0, 3.2) - 1.6) < 0.5) m = shirt.z < 1.5 ? M_ACC : M_CHROME;
					if (shirt.w > 0.5 && ny > 0.6 && abs(x - 0.3) < 0.4 && z < 16.0) m = M_CHROME;
				}
				if (isM(m, M_SHIRT)) {
					float pt = shirt.x;
					if (isM(pt, 1.0)) { if (mod(floor((z + 40.0) / 3.0), 2.0) < 0.5) m = M_ACC; }
					else if (isM(pt, 2.0)) { if (mod(floor((x + 40.0) / 3.2), 2.0) < 0.5) m = M_ACC; }
					else if (isM(pt, 3.0)) { float h = fract(sin(floor(x / 2.6) * 12.9898 + floor(z / 2.6) * 78.233 + floor(y / 2.6) * 37.719) * 43758.5453); if (h > 0.72) m = M_ACC; if (h < 0.12) m = M_ACC2; }
					else if (isM(pt, 4.0)) { if (ax > 11.0 || z > 16.5) m = M_ACC; if (ny < -0.6 && ax < 3.2 && z > 2.5 && z < 11.5 && !(ax < 1.2 && z > 4.5 && z < 9.5)) m = M_ACC2; }
					else if (isM(pt, 5.0)) { if (ny > 0.5 && sq(x - 0.5) / 20.0 + sq(z - 9.5) / 9.0 < 1.0) m = M_ACC; }
				}
				if (shirt.y > 0.5 && abs(z - (17.4 - 0.065 * x * x)) < 0.55 && y > 0.0 && ax < 7.5 && (isM(m, M_SHIRT) || isM(m, M_SKIN) || isM(m, M_ACC))) m = M_GOLD;
				return m;
			}
			void main(void) {
				#ifdef SIL
				// (os pés rente ao chão: cortados POR PIXEL — jogar o vértice para fora da tela esticava o triângulo até a borda numa faixa)
				if (vZ < 12.0) discard;
				gl_FragColor = vec4(silhouette.rgb * silhouette.a, silhouette.a); return;
				#endif
				#ifdef SHADOW
				gl_FragColor = vec4(0.0, 0.0, 0.0, silhouette.a); return;
				#endif
				// TEXTURA DE DETALHE: a luz do tecido/da mecha sobre a cor da paleta (a média da peça = 1), e o recorte do cartão de cabelo
				float det = 1.0;
				#ifndef SAFE
				if (vX.z > 0.5) {
					vec4 tx = vX.z < 1.5 ? texture2D(clothTex, vX.xy) : texture2D(hairTex, vX.xy);
					if (tx.a < 0.5) discard;
					det = clamp(tx.r / max(vX.w, 0.05), 0.55, 1.35);
				}
				vec3 fx = dFdx(vF), fy = dFdy(vF);                                // (fora de qualquer "if": derivadas valem em todo pixel)
				#endif
				vec3 V = normalize(eye - vW);
				#ifdef TOON
				vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));                   // (face chapada, luz em faixas: o estilo dos desenhos)
				if (dot(n, V) < 0.0) n = -n;
				float d = dot(n, sunL);
				float lev = 1.0 + smoothstep(-0.36, -0.24, d) + smoothstep(0.24, 0.36, d) + smoothstep(0.74, 0.86, d);
				#else
				vec3 n = normalize(vN);                                          // (a normal do vértice: luz SUAVE, como num PS2)
				if (dot(n, V) < 0.0) n = -n;                                     // (cartão de cabelo e o avesso: o lado que se vê)
				float d = dot(n, sunL), dif = max((d + 0.25) / 1.25, 0.0), sky = n.y * 0.5 + 0.5;
				float lev = 0.55 + 3.1 * (0.12 + 0.22 * sky + 0.7 * dif);         // (céu por cima, sol com a luz que dobra um pouco: 1,0 a 3,9 dos 5 tons)
				#endif
				float mt0 = floor(vMt.x + 0.5), tone = vMt.y;                    // (tom da face: estampa, dano)
				#ifndef SAFE
				if (vS > 0.5) {                                                   // (cabeça: o rosto, peito: a estampa — por pixel)
					vec3 nf = normalize(cross(fx, fy));
					bool head = vS < 1.5;
					if (dot(nf, vF - (head ? vec3(0.0, -2.0, 12.0) : vec3(0.0, 0.0, 9.0))) < 0.0) nf = -nf;      // (para fora)
					if (head) mt0 = faceMat(mt0, vF, nf, tone); else mt0 = shirtMat(mt0, vF, nf);
				}
				#endif
				float occ = vAo * (vS > 0.5 && vS < 1.5 ? 0.35 : 1.0);           // (no rosto, pouca: a boca e as órbitas da malha são fundas, e o rosto é pintado)
				lev = clamp(lev + 0.35 * clamp(dot(n, V), 0.0, 1.0) - 0.15 + clamp(tone, -1.5, 1.0) - 1.1 * occ, 0.0, 4.0);      // (o que encara a câmera um pouco mais claro: volume, e a oclusão escurece)
				#ifdef PAL
				float m = mt0, i0 = floor(lev), i1 = min(i0 + 1.0, 4.0), y = (row + 0.5) / palRows;
				vec3 c = mix(texture2D(palette, vec2((m * 8.0 + i0 + 0.5) / 256.0, y)).rgb, texture2D(palette, vec2((m * 8.0 + i1 + 0.5) / 256.0, y)).rgb, lev - i0);
				#else
				vec3 c = texture2D(ramps, vec2((lev + 0.5) / 5.0, (mt0 + 0.5) / 32.0)).rgb;
				#endif
				gl_FragColor = vec4(c * det * tint * shade, 1.0);
			}`;
	},

	// ---------------------------------------------------------------- Workers e modelos
	_ws: {}, _models: new Map(), _types: new Map(), _mid: 0, _fineOnly: new Set(),
	// Um Worker para o jogador (o visual dele nunca espera os NPCs) e um para os NPCs.
	worker(kind) {
		let w = this._ws[kind];
		if (w) return w;
		w = this._ws[kind] = new Worker(Wardrobe.URL);
		w.onmessage = (e) => { const m = e.data, M = this._models.get(m.mid); if (M) M._msg(m); };
		w.onerror = (e) => { if (e.preventDefault) e.preventDefault(); console.warn('Char3D: o gerador não abriu', e.message || e); for (const M of this._models.values()) if (M.w === w) M.failed = true; };
		return w;
	},
	_shadowV: new BABYLON.Vector4(0, 0, 0, 0.42),
	// Força do sol (0 de noite / em interiores, 1 de dia): pelo brilho da cor ambiente dos sprites (SpriteMaterial.sharedTint).
	sunK() {
		if (typeof Interiors !== 'undefined' && Interiors.active) return 0;
		const t = typeof SpriteMaterial !== 'undefined' ? SpriteMaterial.sharedTint() : null;
		if (!t) return 1;
		const l = 0.3 * t.r + 0.59 * t.g + 0.11 * t.b;
		return Math.max(0, Math.min(1, (l - 0.45) / 0.4));
	},
	// Modelo de um tipo de NPC (um por tipo: as variantes só mudam a cor).
	// dmg = nível de dano (o sangue assado, como os atlas de dano do NpcArt: um modelo por tipo e nível).
	// lod: 0 = perto (o modelo cheio), 1 = longe (menos pontos, maiores — farSpacing), 2 = bem longe (o leve com só uma parte dos pontos, maiores — veryFarThin):
	// TODOS os NPCs ficam 3D; de longe, a diferença de detalhe não aparece e o custo cai muito.
	typeModel(type, dmg = 0, lod = 0) {
		if (this.polyOn) lod = Math.max(0, Math.min(3, lod | 0));                        // (low poly: 4 níveis — LOD_LEVELS)
		const key = type + '|' + dmg + '|' + lod, N = this.C.npc || {};
		let M = this._types.get(key);
		// (o bem leve é o leve com os pontos embaralhados e só uma parte deles desenhada, maiores: o gerador não monta o boneco com
		// espaçamento acima de ~2,4 — a arma na mão fica sem ponto nenhum)
		// (tipos cujo boneco o gerador não monta no espaçamento de longe — chapéu ou cabelo fino demais: "parte vazia" — usam o de perto)
		const far = lod && !this._fineOnly.has(type);
		if (!M) { M = new Char3DModel(this._scene, { npc: type, dmg, spacing: far ? N.farSpacing || 2.2 : N.spacing || 1.3, thin: lod === 2 ? N.veryFarThin || 0.22 : lod === 1 ? (far ? N.farThin || 0.75 : 0.5) : 1, kind: 'npc', level: this.polyOn ? this.LOD_LEVELS[lod] : 'npc' }); M._lod = lod; this._types.set(key, M); }
		M._used = performance.now();
		return M;
	},
	// Modelos de tipo sem ninguém usando há 90 s saem da memória (da GPU e do Worker); voltam se o tipo aparecer de novo.
	_gc() {
		const now = performance.now(), inUse = new Set();
		for (const C of this.npcs.values()) if (C.model) inUse.add(C.model);
		for (const [k, M] of this._types) if (!inUse.has(M) && now - (M._used || 0) > 90000) {
			this._pool = this._pool.filter((C) => { if (C.model !== M) return true; C.dispose(); return false; });
			M.dispose(); this._types.delete(k);
		}
	},

	// ---------------------------------------------------------------- a cada quadro
	init(game) {
		if (!this.on || this._game) return;
		this._game = game; this._scene = game.scene; this._shader();
		this.npcs = new Map();                   // SpriteActor → Char3DActor
		this._pick = 0;
		this._view = { eye: new BABYLON.Vector3(), pScale: 400 };
		const sd = Config.light && Config.light.sunDir;
		this.sun = sd ? new BABYLON.Vector3(-sd[0], -sd[1], -sd[2]).normalize() : new BABYLON.Vector3(-0.6, 1.8, 0.45).normalize();
		if (this.C.player !== false && typeof PlayerLook !== 'undefined') {
			game.player.char3d = new Char3DActor(this._scene, game.player.actor, null, { name: 'jogador3d', xray: true });
			this._playerSpec(true);
		}
		// (roda dentro do desenho de cada quadro: um erro aqui pararia a cena INTEIRA — a tela fica só com o céu. Erro: avisa no console
		// e, repetindo, desliga o 3D — todo mundo volta ao 2,5D — em vez de travar o jogo)
		this._errs = 0;
		this._obs = this._scene.onBeforeRenderObservable.add(() => {
			if (this.off) return;
			try { this.tick(); this._errs = 0; } catch (e) {
				// (erro repetido: o modo simples — não desliga: sem o 2,5D, ninguém apareceria; depois dele, o aviso no máximo a cada 5 s)
				const now = performance.now();
				if (!this.safe || now - (this._errT || 0) > 5000) { this._errT = now; console.error('[Char3D] erro no quadro:', e); }
				if (++this._errs >= 3 && !this.safe) { this.degrade('erro repetido no quadro'); this._errs = 0; }
			}
		});
	},
	// Altura do chão acima do asfalto em (x, z): a calçada (Config.city.curbHeight) dentro de um quarteirão, fora da pista; 0 no resto.
	surfaceAt(x, z) {
		if (typeof CityGrid === 'undefined' || !CityGrid._blockAtPoint || typeof RoadPlan === 'undefined') return 0;
		if (RoadPlan.onPavement(x, z) || !CityGrid._blockAtPoint(x, z)) return 0;
		return (Config.city && Config.city.curbHeight) || 0.18;
	},
	// Desliga o 3D (erro repetido): os bonecos somem e os desenhos 2,5D voltam.
	disable() {
		this.off = true;
		const all = [...(this.npcs ? this.npcs.values() : [])];
		if (this._game && this._game.player.char3d) all.push(this._game.player.char3d);
		for (const C of all) { try { C.dispose(); } catch (e) { /* segue */ } }
		if (this.npcs) this.npcs.clear();
		if (this._game) this._game.player.char3d = null;
		console.warn('[Char3D] personagens 3D desligados nesta sessão (voltaram ao 2,5D)');
	},
	// O visual do jogador (guarda-roupa, bolsa, aparência): mudou → um modelo novo (o antigo some quando o novo fica pronto).
	// O boneco 3D do jogador pronto (o modelo e a pose parada) — sem 2,5D a tela de carregamento espera por ele: não há desenho para
	// mostrar enquanto isso. Desiste em `ms` (o jogo segue: ele aparece quando chegar).
	playerReady(ms = 15000) {
		const ok = () => { const P = this._game && this._game.player && this._game.player.char3d, M = P && (P.model || this._pNext); return !!(M && M.ready && typeof M.clips.get('idle:none') === 'object'); };
		return new Promise((res) => { const t0 = performance.now(), k = () => (ok() || performance.now() - t0 > ms ? res(ok()) : setTimeout(k, 50)); k(); });
	},
	_playerSpec(force) {
		const P = this._game.player.char3d, spec = JSON.parse(JSON.stringify(PlayerLook.spec())), dmg = PlayerLook.dmg ? PlayerLook.dmg() : 0;
		if (dmg) spec.dmg = dmg;                 // (machucado: o sangue assado na roupa e no corpo, como os atlas de dano)
		const sig = JSON.stringify(spec);
		if (!force && sig === this._pSig) return;
		this._pSig = sig;
		const M = new Char3DModel(this._scene, { spec, spacing: this.C.spacing || 1.0, kind: 'player', level: 'hero' });
		M.onReady = () => { const old = P.model; P.setModel(M); if (old && old !== M) old.dispose(); };
		this._pNext = M;
	},
	tick() {
		const sc = this._scene, cam = sc.activeCamera, dt = sc.getEngine().getDeltaTime() / 1000, V = this._view;
		this._frame++;
		if (cam) {
			V.eye.copyFrom(cam.globalPosition || cam.position);
			const E = sc.getEngine();
			V.w = E.getRenderWidth(); V.h = E.getRenderHeight();
			V.pScale = (V.h * cam.getProjectionMatrix().m[5]) / 2;
		}
		const L = this._game.gameEngine && this._game.gameEngine.sun;      // (o sol da cena: a hora do dia move a luz e a sombra)
		if (L && L.direction) { this.sun.copyFrom(L.direction).scaleInPlace(-1); if (this.sun.y < 0.15) this.sun.y = 0.15; this.sun.normalize(); }
		const pl = this._game.player;
		if (pl.char3d) {
			if ((this._chk = (this._chk || 0) - dt) <= 0) { this._chk = 1; this._playerSpec(false); }
			pl.char3d.update();
		}
		if (this.npcOn) {
			// (o jogador montou — o piloto é outro ator: escolhe já no quadro seguinte, sem passar pelo desenho 2,5D)
			const mounted = !pl.actor.mesh.isVisible || !pl.actor.mesh.isEnabled();
			if (mounted !== this._mounted) { this._mounted = mounted; this._pick = 0; }
			if ((this._pick -= dt) <= 0) { this._pick = 0.15; this._choose(pl); }
			if ((this._gcT = (this._gcT || 0) - dt) <= 0) { this._gcT = 10; this._gc(); }
			for (const [a, R] of this.npcs) R.update();
		} else if (this.npcs.size) this._choose(null);
		Char3DBlob.flush();
	},
	// Os NPCs em 3D: TODOS os que estão à vista (até `max`, dentro de `radius` — limites de segurança bem largos); o detalhe cai com a
	// distância (lodOf). Fica de fora: o próprio jogador, pilotos presos num veículo (o desenho deles é do veículo) e quem não é 2,5D.
	_choose(pl) {
		// (sem 2,5D: TODOS — quem não for 3D não aparece; os níveis de detalhe e o corte fora da câmera seguram o custo)
		const N = this.C.npc || {}, all = this.no2d, max = pl ? (all ? 1e6 : N.max | 0) : 0, R = all ? 1e5 : N.radius || 38, cx = pl ? pl.position.x : 0, cz = pl ? pl.position.z : 0, cand = [];
		if (pl) for (const a of SpriteActor.live) {
			const m = a.mesh, t = a.npcType;
			if (!t || a === pl.actor || !a.clip || !a.clip.npc || !a._placed || m.isDisposed() || !m.isEnabled() || !(m.isVisible || a._npcWait)) continue;      // (_npcWait: invisível só porque a página 2,5D não chegou — o 3D não precisa dela)
			if (m.parent && m.parent !== a.lift) continue;
			if (!max && !/^protagonista/.test(t)) continue;
			const dx = m.position.x - cx, dz = m.position.z - cz, d = dx * dx + dz * dz, r = this.npcs.has(a) ? R * 1.15 : R;
			if (d < r * r) cand.push([d, a]);
		}
		cand.sort((p, q) => p[0] - q[0]);
		// (o jogador pilotando fica 3D sempre — mesmo no nível Low, que não tem NPCs 3D — e não conta no limite)
		const keep = new Set();
		let k = 0;
		for (const [, a] of cand) if (/^protagonista/.test(a.npcType)) keep.add(a); else if (k < max) { keep.add(a); k++; }
		// (o jogador PILOTANDO — moto, bicicleta, jet ski: o piloto é outro ator, com a folha dele — usa o modelo do visual dele)
		const PM = pl && pl.char3d && pl.char3d.model, hero = (a) => /^protagonista/.test(a.npcType);
		// Perto (até nearDist m) o modelo cheio; até midDist, o leve; além, o bem leve. (Quem já está num nível fica nele até 25% além da
		// borda: ninguém troca de modelo para lá e para cá.)
		const near = N.nearDist || 17, mid = N.midDist || 45, d2 = new Map(cand.map(([d, a]) => [a, d]));
		const poly = this.polyOn, V = this._view, cam = this._scene.activeCamera, m5 = cam ? cam.getProjectionMatrix().m[5] : 2;
		const typeOf = (a) => String((a.sheet && a.sheet.baseId) || a.npcType).replace(/#d\d+$/, ''), lodOf = (a) => {
			const C = this.npcs.get(a), L = C && C.model ? C.model._lod : -1, d = d2.get(a) || 0;
			if (poly) {
				// TAMANHO NA TELA: a altura do boneco (~1,8 m) sobre a altura da tela, pela distância à CÂMERA (LOD_SCREEN, com folga de 15%)
				const p = a.mesh.getAbsolutePosition(), e = V.eye, dc = Math.max(0.5, Math.hypot(p.x - e.x, p.y + 0.9 - e.y, p.z - e.z));
				const frac = (m5 * 0.9) / dc / this.lodBias, T = this.LOD_SCREEN;
				let l = 3;
				for (let i = 0; i < 3; i++) { const t = L >= 0 && L <= i ? T[i] / 1.15 : L > i ? T[i] * 1.15 : T[i]; if (frac >= t) { l = i; break; } }
				return l;
			}
			const rn = L === 0 ? near * 1.25 : near, rm = L !== undefined && L <= 1 && L >= 0 ? mid * 1.25 : mid;
			return d < rn * rn ? 0 : d < rm * rm ? 1 : 2;
		};
		const modelOf = (a) => {
			if (hero(a)) return PM && PM.ready ? PM : null;
			const lod = lodOf(a), M = this.typeModel(typeOf(a), (a.sheet && a.sheet.dmgLvl) | 0, lod);
			if (M.failed && lod > 0 && !this._fineOnly.has(typeOf(a))) {      // (o de longe não montou: refaz este tipo com o espaçamento de perto)
				const t = typeOf(a); this._fineOnly.add(t);
				for (const [k, X] of this._types) if (k.startsWith(t + '|') && X._lod > 0 && X.failed) { X.dispose(); this._types.delete(k); }
				return null;
			}
			if (M.failed) { for (let l = poly ? 3 : 1; l >= 0; l--) { const X = this._types.get(typeOf(a) + '|' + ((a.sheet && a.sheet.dmgLvl) | 0) + '|' + l); if (X && X.ready && !X.failed) return X; } return null; }
			// (o modelo da outra distância ainda assando: fica com o que tem — sem voltar ao 2,5D no meio)
			if (!M.ready) {
				const C = this.npcs.get(a), O = C && C.model; if (O && O.ready && !O.failed && O._lod !== undefined) return O;
				// (quem acabou de aparecer: qualquer nível pronto do mesmo tipo serve até o certo ficar pronto — ninguém espera em 2,5D)
				for (let l = poly ? 3 : 2; l >= 0; l--) { const X = this._types.get(typeOf(a) + '|' + ((a.sheet && a.sheet.dmgLvl) | 0) + '|' + l); if (X && X.ready && !X.failed) return X; }
			}
			return M;
		};
		// (o modelo bem leve de cada tipo à vista é assado primeiro — é rápido e serve de ponte para quem acaba de aparecer)
		let pre = 0;
		for (const [, a] of cand) {
			if (hero(a)) continue;
			const lb = poly ? 3 : 2, key = typeOf(a) + '|' + ((a.sheet && a.sheet.dmgLvl) | 0) + '|' + lb;
			if (this._types.has(key)) { this._types.get(key)._used = performance.now(); continue; }
			if (pre++ < 3) this.typeModel(typeOf(a), (a.sheet && a.sheet.dmgLvl) | 0, lb);      // (no máximo 3 tipos novos por vez: sem rajada de assar e subir para a GPU)
		}
		for (const a of keep) {
			const C = this.npcs.get(a), M = modelOf(a);
			if (C && M && C.model !== M) {
				// machucou (outro nível de dano) ou o jogador trocou de roupa: o modelo novo entra quando estiver pronto (sem piscar)
				if (M.ready) C.setModel(M);
				continue;
			}
			if (C && !M) { this._free(C); this.npcs.delete(a); continue; }
			if (!C && M) {
				// (um boneco guardado do mesmo modelo é reaproveitado: criar e destruir material e malha a cada 0,25 s, com NPCs entrando
				// e saindo do raio, engasgava o jogo)
				const i = hero(a) ? -1 : this._pool.findIndex((P) => P.model === M);
				const P = i >= 0 ? this._pool.splice(i, 1)[0] : null;
				if (P) P.rebind(a);
				this.npcs.set(a, P || new Char3DActor(this._scene, a, M, hero(a) ? { name: 'jogador3d_piloto' } : { name: 'npc3d', pal: true }));
			}
		}
		for (const [a, C] of this.npcs) if (!keep.has(a)) { this._free(C); this.npcs.delete(a); }
	},
	// Um boneco que saiu do raio: guardado para reaproveitar (até 40), ou destruído.
	_pool: [],
	_free(C) {
		if (C.pal && this._pool.length < 40 && C.model && C.model.ready) { C.release(); this._pool.push(C); }
		else C.dispose();
	},
};

// O clarão do tiro: dois planos cruzados de 1 × 1 ao longo de +Z (da boca do cano para a frente), textura de chama, brilho aditivo.
Char3D.flashMesh = function (scene, parent, group) {
	let src = this._flashSrc;
	if (!src || src.isDisposed()) {
		const t = new BABYLON.DynamicTexture('c3d_clarao', { width: 64, height: 128 }, scene, false), g = t.getContext();
		const r = g.createRadialGradient(32, 112, 2, 32, 80, 64);
		r.addColorStop(0, 'rgba(255,252,228,1)'); r.addColorStop(0.25, 'rgba(255,214,72,0.95)'); r.addColorStop(0.6, 'rgba(255,128,32,0.6)'); r.addColorStop(1, 'rgba(255,90,10,0)');
		g.fillStyle = r; g.beginPath(); g.ellipse(32, 72, 28, 56, 0, 0, Math.PI * 2); g.fill(); t.update(); t.hasAlpha = true;
		const m = new BABYLON.StandardMaterial('c3d_claraoMat', scene);
		m.emissiveTexture = t; m.opacityTexture = t; m.disableLighting = true; m.backFaceCulling = false; m.alphaMode = BABYLON.Engine.ALPHA_ADD; m.disableDepthWrite = true;
		const a = BABYLON.MeshBuilder.CreatePlane('c3d_claraoA', { size: 1, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
		a.rotation.x = -Math.PI / 2; a.position.z = 0.5; a.bakeCurrentTransformIntoVertices();
		const b = a.clone('c3d_claraoB'); b.rotation.z = Math.PI / 2; b.bakeCurrentTransformIntoVertices();
		src = this._flashSrc = BABYLON.Mesh.MergeMeshes([a, b], true);
		src.material = m; src.isPickable = false; src.setEnabled(false);
	}
	const f = src.clone('c3d_clarao', parent);
	f.renderingGroupId = group; f.isPickable = false; f.setEnabled(false); f._char3d = true;
	return f;
};

// ----------------------------------------------------------------------------
// Uma ficha assada (pontos + clipes + objetos na mão), compartilhada por todos os atores que a usam.
// ----------------------------------------------------------------------------
// Quatérnios dos ossos (as poses do gerador são rotações puras, R linha a linha, + a posição): conversão de/para as linhas do uniform B
// (3 linhas de 4: R e a posição na 4ª coluna) e a mistura normalizada (nlerp — entre quadros vizinhos e na transição, igual ao slerp).
const C3Q = {
	_q: new Float32Array(4), _p: new Float32Array(4),
	// do R linha a linha (9 números a partir de o, passo s entre as linhas: 3 no clipe, 4 no uniform) para o quatérnio (x, y, z, w)
	fromR(R, o, s, Q, j) {
		const m00 = R[o], m01 = R[o + 1], m02 = R[o + 2], m10 = R[o + s], m11 = R[o + s + 1], m12 = R[o + s + 2], m20 = R[o + 2 * s], m21 = R[o + 2 * s + 1], m22 = R[o + 2 * s + 2];
		const tr = m00 + m11 + m22;
		let x, y, z, w;
		if (tr > 0) { const k = 0.5 / Math.sqrt(tr + 1); w = 0.25 / k; x = (m21 - m12) * k; y = (m02 - m20) * k; z = (m10 - m01) * k; }
		else if (m00 > m11 && m00 > m22) { const k = 2 * Math.sqrt(1 + m00 - m11 - m22); w = (m21 - m12) / k; x = 0.25 * k; y = (m01 + m10) / k; z = (m02 + m20) / k; }
		else if (m11 > m22) { const k = 2 * Math.sqrt(1 + m11 - m00 - m22); w = (m02 - m20) / k; x = (m01 + m10) / k; y = 0.25 * k; z = (m12 + m21) / k; }
		else { const k = 2 * Math.sqrt(1 + m22 - m00 - m11); w = (m10 - m01) / k; x = (m02 + m20) / k; y = (m12 + m21) / k; z = 0.25 * k; }
		Q[j] = x; Q[j + 1] = y; Q[j + 2] = z; Q[j + 3] = w;
	},
	fromRows(out, d, Q, j) { this.fromR(out, d, 4, Q, j); },
	toRows(q, out, d) {
		const x = q[0], y = q[1], z = q[2], w = q[3];
		out[d] = 1 - 2 * (y * y + z * z); out[d + 1] = 2 * (x * y - z * w); out[d + 2] = 2 * (x * z + y * w);
		out[d + 4] = 2 * (x * y + z * w); out[d + 5] = 1 - 2 * (x * x + z * z); out[d + 6] = 2 * (y * z - x * w);
		out[d + 8] = 2 * (x * z - y * w); out[d + 9] = 2 * (y * z + x * w); out[d + 10] = 1 - 2 * (x * x + y * y);
	},
	nlerp(A, a, B, b, t, q) {
		const s = A[a] * B[b] + A[a + 1] * B[b + 1] + A[a + 2] * B[b + 2] + A[a + 3] * B[b + 3] < 0 ? -1 : 1, u = 1 - t;
		const x = A[a] * u + B[b] * t * s, y = A[a + 1] * u + B[b + 1] * t * s, z = A[a + 2] * u + B[b + 2] * t * s, w = A[a + 3] * u + B[b + 3] * t * s;
		const l = Math.hypot(x, y, z, w) || 1;
		q[0] = x / l; q[1] = y / l; q[2] = z / l; q[3] = w / l;
	},
	// os quatérnios de todos os quadros de um clipe (uma vez por clipe)
	ofClip(K) {
		const NB = Char3D.BONES, n = K.n, Q = new Float32Array(n * NB * 4);
		for (let f = 0; f < n; f++) for (let i = 0; i < NB; i++) {
			const o = (f * NB + i) * 12;
			let z = true;
			for (let k = 0; k < 9 && z; k++) z = K.B[o + k] === 0;
			if (z) { Q[(f * NB + i) * 4 + 3] = 1; continue; }                // (osso sem pose no quadro: identidade)
			this.fromR(K.B, o, 3, Q, (f * NB + i) * 4);
		}
		return Q;
	},
};

class Char3DModel {
	constructor(scene, { spec = null, npc = null, dmg = 0, spacing = 1, thin = 1, kind = 'npc', level = 'npc' }) {
		this.scene = scene; this.spacing = spacing; this.kind = kind; this.mid = ++Char3D._mid;
		this.thin = Math.max(0.1, Math.min(1, thin)); this.splatK = 1 / Math.sqrt(this.thin);      // (fração dos pontos desenhada; os pontos crescem para cobrir)
		this.clips = new Map();          // 'nome:arma' → clipe | 'wait' | 'fail'
		this.props = new Map();          // nome do objeto → malha-modelo (escondida; os atores clonam)
		this.ready = false; this.failed = false; this.onReady = null;
		Char3D._models.set(this.mid, this);
		// (NPCs: 2 geradores em paralelo, cada tipo sempre no mesmo — o gerador guarda o que já montou daquele tipo)
		let slot = '';
		if (kind === 'npc' && npc) { let h = 0; for (let i = 0; i < npc.length; i++) h = (h * 31 + npc.charCodeAt(i)) | 0; slot = (h >>> 0) % 2 ? '_b' : ''; }
		this.w = Char3D.worker(kind + slot);
		// (low poly: o NÍVEL da malha — 'hero' o jogador, ~5 mil triângulos; 'npc' perto, ~2,5 mil; 'far' longe, ~1 mil)
		this.w.postMessage({ type: 'char3d', job: 1, mid: this.mid, spec, npc, dmg, spacing, poly: Char3D.polyOn, style: Char3D.polyOn ? Char3D.style3d : undefined, level });
	}
	_msg(m) {
		if (m.error) {
			if (m.key) this.clips.set(m.key, 'fail');
			else { this.failed = true; console.warn('Char3D:', m.error.split('\n')[0]); }
			return;
		}
		if (m.char3d) this._build(m.char3d);
		else if (m.clip3d) {
			const c = m.clip3d; this.clips.set(c.key, c); for (const [k, p] of Object.entries(c.newProps || {})) this._prop(k, p);
			if (c.key === 'idle:none' && this._data) this._groundFrom(c);
		}
	}
	// Clipe pronto (ou undefined/'wait' enquanto chega, 'fail' se o gerador não tem).
	clip(key) {
		const K = this.clips.get(key);
		if (K === undefined && this.ready) { this.clips.set(key, 'wait'); this.w.postMessage({ type: 'char3dClip', job: 1, mid: this.mid, key, fps: Char3D.C.clipFps || 30 }); }
		return K;
	}
	// O CHÃO do modelo: no gerador a sola do pé fica abaixo do zero (o desenho 2,5D ajusta o pé pela imagem; aqui o boneco ficava ~15 cm
	// enterrado, e deitado — o corpo tem ~50 cm de espessura — quase metade dentro do chão). O ponto mais baixo da pose parada, com o
	// skin de 2 ossos, vira o quanto o boneco sobe (lift, m).
	_groundFrom(K) {
		const d = this._data, B = K.B, NB = Char3D.BONES;
		const Z = (b, x, y, z) => { const o = b * 12; return B[o + 6] * x + B[o + 7] * y + B[o + 8] * z + B[o + 11]; };
		let mn = Infinity;
		for (let i = 0; i < d.n; i += 3) {
			const w = d.sk[i * 4 + 2], z1 = Z(d.sk[i * 4] | 0, d.p1[i * 3], d.p1[i * 3 + 1], d.p1[i * 3 + 2]);
			const z = w > 0 ? z1 * (1 - w) + w * Z(d.sk[i * 4 + 1] | 0, d.p2[i * 3], d.p2[i * 3 + 1], d.p2[i * 3 + 2]) : z1;
			if (z < mn) mn = z;
		}
		this.lift = Number.isFinite(mn) && mn < 0 ? -mn * this.unit : 0;
		this._data = null; void NB;
	}
	_points(name, n, P1, N1, P2, N2, SK, MT, FA, FB) {
		const mesh = new BABYLON.Mesh(name, this.scene);
		// o quadradinho (4 cantos, 2 triângulos) desenhado n vezes: os dados de cada ponto por cópia (divisor 1)
		const vd = new BABYLON.VertexData();
		vd.positions = [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]; vd.indices = [0, 1, 2, 0, 2, 3];
		vd.applyToMesh(mesh, false);
		const E = this.scene.getEngine(), vb = (data, kind, size) => mesh.setVerticesBuffer(new BABYLON.VertexBuffer(E, data, kind, false, false, size, true, 0, size));
		vb(P1, 'ip', 3); vb(N1, 'in1', 3); vb(P2 || P1, 'p2', 3); vb(N2 || N1, 'n2', 3); vb(SK, 'sk', 4); vb(MT, 'mt', 2);
		vb(FA || new Float32Array(n * 4), 'fa', 4); vb(FB || new Float32Array(n), 'fb', 1);
		mesh.forcedInstanceCount = n;
		mesh.isPickable = false; mesh._char3d = true;
		mesh.alwaysSelectAsActiveMesh = true;                 // (os pontos estão no espaço dos ossos: a caixa não vale)
		mesh.setEnabled(false);
		return mesh;
	}
	// LOW POLY: os triângulos do corpo (cantos sem índice compartilhado: face chapada), no espaço dos ossos como os pontos
	// (atributos COMPACTOS na placa: 56 bytes por canto em vez de 116 — ossos, peso e oclusão em bytes, material e tom em bytes, normais
	// em bytes normalizados, UV em 16 bits, a posição na cabeça/peito em inteiros de 16 bits ×64; a posição no osso 1 é a própria
	// 'position' — antes ia duas vezes)
	_tris(name, P) {
		const mesh = new BABYLON.Mesh(name, this.scene), n = P.n, vd = new BABYLON.VertexData(), idx = new Uint32Array(n);
		for (let i = 0; i < n; i++) idx[i] = i;
		vd.positions = P.p1; vd.indices = idx;
		vd.applyToMesh(mesh, false);
		const E = this.scene.getEngine(), VB = BABYLON.VertexBuffer;
		const vb = (data, kind, size, type, norm) => mesh.setVerticesBuffer(new VB(E, data, kind, false, false, size, false, 0, size, type, !!norm));
		const sk = new Uint8Array(n * 4), mt = new Int8Array(n * 4), fp = new Int16Array(n * 4), n1 = new Int8Array(n * 4), n2 = new Int8Array(n * 4), ux = new Uint16Array(n * 4);
		const q8 = (v) => Math.max(-127, Math.min(127, Math.round(v * 127))), q16 = (v) => Math.max(0, Math.min(65535, Math.round(v * 65535)));
		for (let i = 0; i < n; i++) {
			const o = i * 4, o3 = i * 3;
			sk[o] = P.sk[o]; sk[o + 1] = P.sk[o + 1]; sk[o + 2] = Math.round(Math.max(0, Math.min(1, P.sk[o + 2])) * 255); sk[o + 3] = Math.round(Math.max(0, Math.min(1, P.sk[o + 3] || 0)) * 255);
			mt[o] = P.mt[i * 2]; mt[o + 1] = P.mt[i * 2 + 1];
			if (P.fp) { fp[o] = Math.round(P.fp[o] * 64); fp[o + 1] = Math.round(P.fp[o + 1] * 64); fp[o + 2] = Math.round(P.fp[o + 2] * 64); fp[o + 3] = P.fp[o + 3]; }
			const N1 = P.n1, N2 = P.n2 || P.n1;
			if (N1) { n1[o] = q8(N1[o3]); n1[o + 1] = q8(N1[o3 + 1]); n1[o + 2] = q8(N1[o3 + 2]); n2[o] = q8(N2[o3]); n2[o + 1] = q8(N2[o3 + 1]); n2[o + 2] = q8(N2[o3 + 2]); }
			if (P.ux) { ux[o] = q16(P.ux[o]); ux[o + 1] = q16(P.ux[o + 1]); ux[o + 2] = q16(P.ux[o + 2] / 2); ux[o + 3] = q16(P.ux[o + 3]); }
		}
		vb(P.p2, 'p2', 3, VB.FLOAT); vb(sk, 'sk', 4, VB.UNSIGNED_BYTE); vb(mt, 'mt', 4, VB.BYTE); vb(fp, 'fp', 4, VB.SHORT);
		vb(n1, 'in1', 4, VB.BYTE, true); vb(n2, 'n2', 4, VB.BYTE, true); vb(ux, 'ux', 4, VB.UNSIGNED_SHORT, true);
		mesh.isPickable = false; mesh._char3d = true;
		mesh.alwaysSelectAsActiveMesh = true;                 // (no espaço dos ossos: a caixa não vale)
		mesh.setEnabled(false);
		return mesh;
	}
	_build(c) {
		this.unit = (c.scale || 1) / ((Config.art && Config.art.npcPpu) || 26) / 2;          // (m por unidade: escala / (PPU / k 0,5))
		if (c.ramps) {
			this.ramps = new BABYLON.RawTexture(c.ramps, 5, 32, BABYLON.Engine.TEXTUREFORMAT_RGBA, this.scene, false, false, BABYLON.Texture.BILINEAR_SAMPLINGMODE);
			this.ramps.wrapU = this.ramps.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
		}
		this.n = c.n;
		if (c.n > 0) {                                                                   // (low poly: os pontos são só os acessórios — pode não ter nenhum)
			if (this.thin < 1) this._shuffle(c);
			this.body = this._points('c3d_corpo' + this.mid, c.n, c.p1, c.n1, c.p2, c.n2, c.sk, c.mt, c.fa, c.fb);
			if (this.thin < 1) this.body.forcedInstanceCount = Math.max(1, Math.ceil(c.n * this.thin));
		} else this.body = null;
		if (c.poly) {
			this.poly = this._tris('c3d_poly' + this.mid, c.poly); this.tris = c.poly.n / 3; this.face = c.poly.face || [0, 0, 0, 0, 0, 1, 0, 0, 0, 0];
			for (const [name, t] of Object.entries(c.poly.tex || {})) Char3D.texAdd(this.scene, name, t);
			this.texs = c.poly.texs || {};
		}
		this.ready = true;
		this._data = c.poly || c;                                                        // (o corpo — os triângulos ou os pontos —, até medir o chão: _groundFrom)
		for (const k of ['idle:none', 'walk:none', 'run:none']) this.clip(k);          // (os clipes de sempre já vêm: ninguém espera em 2,5D)
		// (o jogador: os de montar também — subindo na moto ou na bike ele não passa pelo desenho 2,5D)
		if (this.kind === 'player') for (const k of ['ride_moto:none', 'ride_bike:none', 'ride_scooter:none', 'ride_jetski:none']) this.clip(k);
		if (this.onReady) this.onReady(this);
	}
	// Embaralha os pontos (a mesma troca em todos os atributos): qualquer começo da lista cobre o corpo inteiro, por igual.
	_shuffle(c) {
		const A = [[c.p1, 3], [c.n1, 3], [c.p2, 3], [c.n2, 3], [c.sk, 4], [c.mt, 2], [c.fa, 4], [c.fb, 1]].filter(([a]) => a && a.length);
		let seed = 0x9e3779b9;
		const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
		for (let i = c.n - 1; i > 0; i--) {
			const j = (rnd() * (i + 1)) | 0;
			for (const [a, k] of A) for (let q = 0; q < k; q++) { const t = a[i * k + q]; a[i * k + q] = a[j * k + q]; a[j * k + q] = t; }
		}
	}
	_prop(name, p) {
		if (this.props.has(name)) return;
		this.props.set(name, this._points('c3d_' + name + this.mid, p.n, p.p, p.nrm, null, null, new Float32Array(p.n * 4), p.mt));
	}
	dispose() {
		this.w.postMessage({ type: 'char3dDrop', mid: this.mid });
		Char3D._models.delete(this.mid);
		for (const m of this.props.values()) m.dispose();
		this.props.clear();
		if (this.body) this.body.dispose();
		if (this.poly) this.poly.dispose();
		if (this.ramps) this.ramps.dispose();
		this.ready = false;
	}
}

// ----------------------------------------------------------------------------
// Um personagem 3D que segue um SpriteActor (o modelo pode chegar depois: setModel).
// ----------------------------------------------------------------------------
// A mancha macia sob os pés de cada boneco 3D: um registro com a mesma cara de uma malha (position.y, isEnabled/setEnabled, dispose) que
// entra numa malha compartilhada de instâncias finas (Char3DBlob.flush, no fim do Char3D.tick: o boneco à mostra e com a mancha ligada).
class Char3DBlob {
	static list = new Set();
	static mesh = null;
	static _buf = null;
	constructor(root, scene, mat) {
		this.root = root; this.position = { y: 0.04 }; this._on = true;
		Char3DBlob.list.add(this);
		if (!Char3DBlob.mesh || Char3DBlob.mesh.isDisposed()) {
			const g = Char3DBlob.mesh = BABYLON.MeshBuilder.CreateGround('c3d_sombras', { width: 0.9, height: 0.9 }, scene);
			g.material = mat; g.isPickable = false; g._char3d = true;
			g.alwaysSelectAsActiveMesh = true;            // (instâncias pelo mundo todo: a caixa da malha não diz nada)
			g.thinInstanceSetBuffer('matrix', Char3DBlob._buf = new Float32Array(16 * 64), 16, false);
			g.thinInstanceCount = 0;
		}
	}
	isEnabled() { return this._on; }
	setEnabled(v) { this._on = !!v; }
	dispose() { Char3DBlob.list.delete(this); }
	static flush() {
		const g = Char3DBlob.mesh;
		if (!g || g.isDisposed()) return;
		let n = 0;
		for (const b of Char3DBlob.list) if (b._on && b.root.isEnabled()) n++;
		if (n * 16 > Char3DBlob._buf.length) { Char3DBlob._buf = new Float32Array(16 * Math.max(n, Char3DBlob._buf.length / 8)); g.thinInstanceSetBuffer('matrix', Char3DBlob._buf, 16, false); }
		const B = Char3DBlob._buf;
		let i = 0;
		for (const b of Char3DBlob.list) {
			if (!b._on || !b.root.isEnabled()) continue;
			const p = b.root.position, o = i * 16;
			B[o] = 1; B[o + 1] = 0; B[o + 2] = 0; B[o + 3] = 0; B[o + 4] = 0; B[o + 5] = 1; B[o + 6] = 0; B[o + 7] = 0;
			B[o + 8] = 0; B[o + 9] = 0; B[o + 10] = 1; B[o + 11] = 0; B[o + 12] = p.x; B[o + 13] = p.y + b.position.y; B[o + 14] = p.z; B[o + 15] = 1;
			i++;
		}
		g.thinInstanceCount = n;
		if (n) g.thinInstanceBufferUpdated('matrix');
	}
}

class Char3DActor {
	constructor(scene, actor, model, { name = 'char3d', pal = false, xray = false } = {}) {
		this.scene = scene; this.actor = actor; this.name = name; this.pal = pal; this.wantXray = xray;
		this.root = new BABYLON.TransformNode(name, scene);
		this.root.setEnabled(false);
		this.props = new Map();          // nome → { mesh, mat, B }
		this.shown = false;
		this._B = new Float32Array(48 * 4);
		this._ph = (Char3D._nAct = (Char3D._nAct || 0) + 1) % 6;        // (fase da pose de longe: os bonecos não calculam todos no mesmo quadro)
		if (xray) actor._c3 = this;      // (o raio-X do jogador usa o boneco 3D enquanto ele está à mostra)
		this._shadow();
		if (model) this.setModel(model);
	}
	get C() { return Char3D.C; }
	// Troca de modelo (o nível de detalhe pelo tamanho na tela, o dano, a roupa). A montagem do modelo de antes fica GUARDADA, desligada,
	// e a do novo volta pronta se já foi montada: o boneco que cruza a borda de um nível e volta não clona malha nem cria material de
	// novo (antes, cada travessia refazia tudo — ~1–1,6 ms por quadro no centro, no aparelho fraco). Até 4 montagens por boneco.
	setModel(M) {
		if (M === this.model) return;
		this._stash();
		this.model = M; this._last = null; this._built = false; this._curK = null; this._fadeT = -1;
		if (this._sets && this._sets.has(M)) this._unstash(M);
	}
	_stash() {
		if (!this._built || !this.model) { this._clear(); return; }
		const set = { props: this.props, xr: this._xr, sh3: this._sh3, body: this.body, bodyMat: this.bodyMat, poly: this.polyMesh, polyMat: this.polyMat, on: [] };
		for (const m of this._setMeshes(set)) { set.on.push([m, m.isEnabled(false)]); m.setEnabled(false); }
		const S = this._sets || (this._sets = new Map());
		S.delete(this.model); S.set(this.model, set);
		while (S.size > 3) { const [k, old] = S.entries().next().value; S.delete(k); this._drop(old); }      // (a mais antiga sai)
		this.props = new Map(); this._xr = null; this._sh3 = null; this.body = this.bodyMat = this.polyMesh = this.polyMat = null;
		this._built = false;
	}
	_unstash(M) {
		const set = this._sets.get(M);
		this._sets.delete(M);
		this.props = set.props; this._xr = set.xr; this._sh3 = set.sh3; this.body = set.body; this.bodyMat = set.bodyMat; this.polyMesh = set.poly; this.polyMat = set.polyMat;
		for (const [m, on] of set.on) if (!m.isDisposed()) m.setEnabled(on);
		this._built = true;
	}
	_setMeshes(set) {
		const L = [];
		if (set.body) L.push(set.body);
		if (set.poly) L.push(set.poly);
		if (set.sh3) L.push(set.sh3);
		if (set.xr) for (const m of set.xr) L.push(m);
		for (const P of set.props.values()) if (P) L.push(P.mesh);
		return L;
	}
	_drop(set) {
		for (const P of set.props.values()) if (P) { P.mesh.dispose(); P.mat.dispose(); }
		if (set.xr) for (const m of set.xr) { m.material.dispose(); m.dispose(); }
		if (set.sh3) { set.sh3.material.dispose(); set.sh3.dispose(); }
		if (set.body) { set.body.dispose(); set.bodyMat.dispose(); }
		if (set.poly) { set.poly.dispose(); set.polyMat.dispose(); }
	}
	// As malhas do ator (clones das do modelo: a geometria é a mesma).
	_buildMeshes() {
		const M = this.model;
		if (M.body) {
			this.body = this._clone(M.body, this.name + '_corpo');
			this.body.material = this.bodyMat = Char3DActor._ready(this._mat(this.name + '_mat'));
			this.bodyMat.onBindObservable.add(() => this._bindCommon(this.bodyMat, this._B));
		}
		if (M.poly) {                                                                     // (low poly: o corpo em triângulos)
			this.polyMesh = this._clone(M.poly, this.name + '_poly');
			this.polyMesh.material = this.polyMat = Char3DActor._ready(this._mat(this.name + '_pmat', false, true));
			this.polyMat.onBindObservable.add(() => this._bindCommon(this.polyMat, this._B));
		}
		if (this.wantXray) this._xrayBuild();
		if (this.C.shadow !== false && (!this.pal || this.C.npcShadow)) this._shadowBuild();      // (sombra projetada: o jogador; os NPCs, só com npcShadow — a mancha macia basta, e corta metade dos pontos)
		this._built = true;
	}
	_clone(src, name) {
		const m = src.clone(name, this.root);
		m.forcedInstanceCount = src.forcedInstanceCount;                     // (o mesmo número de pontos: a geometria é compartilhada)
		m.isPickable = false; m.alwaysSelectAsActiveMesh = true; m._char3d = true;          // (_char3d: o Interiors não desliga ao entrar numa loja)
		m.renderingGroupId = this.actor.mesh.renderingGroupId;
		m.setEnabled(true);
		return m;
	}
	// sil: 'xray' (silhueta dourada) | 'shadow' (sombra projetada) | false (o desenho)
	_mat(name, sil = false, poly = false) {
		const pal = this.pal && !sil, defines = [];
		if (sil === 'shadow') defines.push('#define SHADOW');
		else if (sil) defines.push('#define SIL');
		if (pal) defines.push('#define PAL');
		if (poly && Char3D.safe) defines.push('#define SAFE');
		else if (poly && Char3D.style3d !== 'real') defines.push('#define TOON');
		const sh = poly ? 'char3dPoly' : 'char3d';
		const m = new BABYLON.ShaderMaterial(name, this.scene, { vertex: sh, fragment: sh }, {
			attributes: poly ? ['position', 'p2', 'sk', 'mt', 'fp', 'in1', 'n2', 'ux'] : ['position', 'ip', 'in1', 'p2', 'n2', 'sk', 'mt', 'fa', 'fb'],
			uniforms: ['world', 'viewProjection', 'B', 'unit', 'pScale', 'splat', 'eye', 'sunL', 'tint', 'shade', 'silhouette', 'palRows', 'row', 'expr', 'groundY', 'viewport'].concat(poly ? ['face', 'face2', 'shirt'] : []),
			samplers: poly ? ['ramps', 'palette', 'clothTex', 'hairTex'] : ['ramps', 'palette'],
			defines,
			needAlphaBlending: !!sil,
		});
		// (material novo, ainda em nenhuma malha: cada propriedade que o Babylon marca como "suja" — backFaceCulling, alphaMode, zOffset… —
		// varria TODAS as ~5.500 malhas da cena atrás de quem o usa. Travado até o fim da montagem: medido, ~1,9 ms por quadro no centro só
		// de bonecos entrando na tela. Quem monta solta a trava com _ready(mat).)
		m._blockDirtyMechanism = true;
		m.setVector4('silhouette', sil === 'shadow' ? Char3D._shadowV : sil && typeof NpcArt !== 'undefined' ? NpcArt.SILHOUETTE : new BABYLON.Vector4(0, 0, 0, 0));
		if (sil) { m.alphaMode = BABYLON.Engine.ALPHA_PREMULTIPLIED; m.disableDepthWrite = true; }
		m.backFaceCulling = false;
		if (pal) { m.setTexture('palette', NpcArt._pal.tex); m.setFloat('palRows', NpcArt.ROWS); }
		else if (this.model.ramps) m.setTexture('ramps', this.model.ramps);
		m.setVector3('eye', Char3D._view.eye);
		m.setVector3('sunL', Char3D.sun);
		m.setColor3('tint', typeof SpriteMaterial !== 'undefined' ? SpriteMaterial.sharedTint() : BABYLON.Color3.White());
		if (poly) {                                                                       // (o rosto e a estampa da ficha: G.lowBody → faceOf)
			const f = this.model.face || [0, 0, 0, 0, 0, 1, 0, 0, 0, 0];
			m.setVector4('face', new BABYLON.Vector4(f[0], f[1], f[2], f[3])); m.setVector2('face2', new BABYLON.Vector2(f[4], f[5])); m.setVector4('shirt', new BABYLON.Vector4(f[6] || 0, f[7] || 0, f[8] || 0, f[9] || 0));
			const T = this.model.texs || {};
			m.setTexture('clothTex', Char3D.tex(this.scene, T[1])); m.setTexture('hairTex', Char3D.tex(this.scene, T[2]));
		}
		return m;
	}
	// Solta a trava do material novo (_mat) — direto no campo: pelo setter o Babylon varreria a cena uma vez à toa (ninguém o usa ainda).
	static _ready(m) { m._blockDirtyMechanism = false; return m; }
	_bindCommon(m, B) {
		const e = m.getEffect(), M = this.model;
		if (!e || !M) return;
		e.setArray4('B', B);
		e.setFloat('unit', M.unit * (this._sc || 1));
		e.setFloat('pScale', Char3D._view.pScale);
		e.setFloat2('viewport', Char3D._view.w || 1280, Char3D._view.h || 720);
		e.setFloat('splat', M.spacing * M.unit * (this.C.splat || 2.1) * (M.splatK || 1));
		e.setFloat('shade', this.actor.shade || 1);
		e.setFloat('expr', B === this._B ? this._expr || 0 : 0);
		e.setFloat('groundY', this.root.position.y - (M.lift || 0) + 0.03);      // (o chão: sem a subida do modelo)
		if (this.pal) e.setFloat('row', this.actor.npcRow || 0);
		if (m === (this._sh3 && this._sh3.material)) e.setVector4('silhouette', Char3D._shadowV.set(0, 0, 0, 0.42 * (this._sun || 0)));
	}
	// RAIO-X (render/XRaySilhouette.js): o jogador visto ATRÁS do que o esconde, em silhueta dourada — as mesmas duas cópias do 2,5D,
	// agora do boneco 3D: 1) atrás do que grava profundidade (prédio, muro, carro: só onde já há algo mais perto — GREATER), marcando 2
	// no stencil; 2) debaixo da copa das árvores (a máscara delas marca 1 no stencil: pinta onde ainda é 1, sem teste de profundidade).
	// O corpo marca 2 no stencil onde ele mesmo aparece: os pontos de trás dele (que passariam no GREATER) não viram silhueta.
	_xrayBuild() {
		if (typeof XRaySilhouette === 'undefined') return;
		const C = BABYLON.Constants, L = XRaySilhouette.DRAW_LAST;
		const src = [[this.model.body, this.body, false], [this.model.poly, this.polyMesh, true]].filter((x) => x[0]);
		for (const [, own] of src) XRaySilhouette.stencil(own, C.ALWAYS, 2, C.REPLACE);
		this._xr = src.flatMap(([from, , poly]) => [[false, L, C.NOTEQUAL, 2, C.REPLACE, C.GREATER], [true, L + 1, C.EQUAL, 1, C.KEEP, C.ALWAYS]].map(([over, ai, func, ref, pass, depth]) => {
			const m = this._clone(from, this.name + (over ? '_xrayC' : '_xray') + (poly ? 'P' : ''));
			m.alphaIndex = ai;
			const mat = m.material = this._mat(m.name + '_mat', 'xray', poly);
			mat.depthFunction = depth;
			Char3DActor._ready(mat);
			mat.onBindObservable.add(() => this._bindCommon(mat, this._B));
			XRaySilhouette.stencil(m, func, ref, pass);
			m.setEnabled(false);
			return m;
		}));
	}
	// SOMBRA PROJETADA: os mesmos pontos, achatados no chão na direção do sol, em preto translúcido. O stencil (4) deixa cada pixel do chão
	// escurecer uma vez só — sem ele, os pontos sobrepostos fariam manchas mais escuras.
	_shadowBuild() {
		const poly = !!this.model.poly, C = BABYLON.Constants, m = this._clone(poly ? this.model.poly : this.model.body, this.name + '_sombra3d');
		const mat = m.material = this._mat(m.name + '_mat', 'shadow', poly);
		mat.zOffset = -4;
		Char3DActor._ready(mat);
		mat.onBindObservable.add(() => this._bindCommon(mat, this._B));
		if (typeof XRaySilhouette !== 'undefined') XRaySilhouette.stencil(m, C.NOTEQUAL, 4, C.REPLACE);
		this._sh3 = m;
	}
	// Ligado pelo XRaySilhouette.update a cada quadro (no lugar das cópias do desenho 2,5D).
	xray(on) { if (this._xr) for (const m of this._xr) if (m.isEnabled() !== on) m.setEnabled(on); }
	_prop(name) {
		let P = this.props.get(name);
		if (P !== undefined) return P;
		const src = this.model.props.get(name);
		if (!src) return null;
		const mesh = this._clone(src, this.name + '_' + name), mat = Char3DActor._ready(this._mat(mesh.name + '_mat')), B = new Float32Array(48 * 4);
		mesh.material = mat;
		mat.onBindObservable.add(() => this._bindCommon(mat, B));
		mesh.setEnabled(false);
		this.props.set(name, (P = { mesh, mat, B }));
		return P;
	}
	// Sombra no chão (o desenho 2,5D tinha a dele): uma mancha macia sob os pés (material compartilhado).
	_shadow() {
		let m = Char3D._shMat;
		if (!m || m.isDisposed) {
			const t = new BABYLON.DynamicTexture('c3d_sombraTex', 64, this.scene, false);
			const g = t.getContext(), r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
			r.addColorStop(0, 'rgba(0,0,0,0.5)'); r.addColorStop(0.6, 'rgba(0,0,0,0.3)'); r.addColorStop(1, 'rgba(0,0,0,0)');
			g.fillStyle = r; g.fillRect(0, 0, 64, 64); t.update(); t.hasAlpha = true;
			m = Char3D._shMat = new BABYLON.StandardMaterial('c3d_sombraMat', this.scene);
			m.diffuseTexture = t; m.useAlphaFromDiffuseTexture = true; m.disableLighting = true; m.emissiveColor = BABYLON.Color3.White(); m.zOffset = -2;
		}
		// (a mancha de TODOS os bonecos numa malha só, instâncias finas reescritas por quadro — antes era uma malha por boneco: uma chamada
		// de desenho a mais por personagem à vista)
		this.shadowMesh = new Char3DBlob(this.root, this.scene, m);
	}

	// ---------------------------------------------------------------- a cada quadro
	// O desenho 2,5D do ator: escondido enquanto o 3D está à mostra — e FANTASMA (SpriteActor._ghost): não pede nem desenha as páginas
	// da folha 2,5D (decodificar e subir para a placa centenas de MB de sprites que ninguém vê). Voltou ao 2,5D: pede de novo.
	_show2d(on) {
		if (on && Char3D.no2d) on = false;                        // (sem 2,5D: o desenho nunca volta — sem modelo pronto, ninguém aparece um instante)
		const a = this.actor, mask = on ? 0x0FFFFFFF : 0;
		if (a.mesh.layerMask !== mask) a.mesh.layerMask = mask;
		if (a._ov && a._ov.layerMask !== mask) a._ov.layerMask = mask;
		if (!a._ghost === !on) { a._ghost = !on; if (on && a._applyUV) a._applyUV(); }
	}
	// Dentro da câmera? (uma esfera de 1,4 m em volta do boneco contra os planos do frustum da cena)
	_inView(a) {
		const F = this.scene.frustumPlanes;
		if (!F || !F.length) return true;
		const p = a.mesh.getAbsolutePosition(), x = p.x, y = p.y + 0.9, z = p.z;
		for (const P of F) if (P.normal.x * x + P.normal.y * y + P.normal.z * z + P.d < -1.4) return false;
		return true;
	}
	_hide3d() {
		this._curK = null; this._fadeT = -1;                      // (voltou do 2,5D: a pose entra direto, sem misturar com a de antes)
		if (!this.shown) return;
		this.shown = false;
		this.root.setEnabled(false);
	}
	update() {
		const a = this.actor, M = this.model;
		if (M && M.ready && !this._built) this._buildMeshes();
		const c = a.clip, vis = !a.mesh.isDisposed() && a.mesh.isEnabled() && (a.mesh.isVisible || a._npcWait) && !!c;
		if (!this._built || M.failed || !vis || !c.npc) { this._hide3d(); this._show2d(true); return; }
		// FORA DA CÂMERA (NPCs): nem desenha nem calcula a pose (a malha está no espaço dos ossos, sem caixa útil: o corte é pela posição)
		if (this.pal && !this._inView(a)) { this._hide3d(); this._show2d(false); return; }
		const key = c.name + ':' + (c.weapon || 'none');
		let K = M.clip(key);
		// (o gerador não tem esse clipe com essa arma: o mesmo sem arma; nem esse, parado — continua 3D em vez de voltar ao 2,5D)
		if (K === 'fail' && c.weapon && c.weapon !== 'none') K = M.clip(c.name + ':none');
		if (K === 'fail') K = M.clip('idle:none');
		// (o clipe novo ainda chegando e nenhuma pose ainda: a parada, se já veio — em vez do desenho 2,5D)
		if ((K === undefined || K === 'wait') && !this._last) { const I = M.clips.get('idle:none'); if (I && typeof I === 'object') this._last = I; }
		if (K === 'fail' || ((K === undefined || K === 'wait') && !this._last)) { this._hide3d(); this._show2d(true); return; }
		if (K && K !== 'wait') this._last = K;
		else K = this._last;                                       // (o clipe novo ainda chegando: segura a última pose)
		// TRANSIÇÃO: trocou de clipe com o boneco à mostra — a pose de agora vira o ponto de partida e a nova entra em fadeS segundos
		if (K !== this._curK) { if (this._curK && this.shown && this.C.fade !== 0 && !Char3D.safe) this._fadeStart(); this._curK = K; }
		// (de longe — L2/L3 — a pose a cada 2 ou 3 quadros, cada boneco numa fase: o custo de CPU cai e ninguém nota o passo a passo)
		const ev = this.pal && Char3D.polyOn ? Char3D.LOD_EVERY[M._lod | 0] || 1 : 1;
		if (ev <= 1 || !this.shown || this._fadeT >= 0 || (Char3D._frame + this._ph) % ev === 0) this._pose(K, a, K.key === key || K.key.startsWith(c.name + ':'));
		this._place(a);
		if (!this.shown) { this.shown = true; this.root.setEnabled(true); }
		this._show2d(false);
	}
	// Quadro do clipe na mesma FASE do SpriteActor (o número de quadros é o mesmo do atlas; misturando os dois vizinhos: suave).
	_pose(K, a, same) {
		const n = K.n, c = a.clip;
		let u;
		if (same) u = c.frames ? (a._lean === c && c.frames > 1 ? (a.time / (c.frames - 1)) * (n - 1) : (a.time / c.frames) * n) : 0;
		else u = this._u || 0;
		this._u = u;
		let f0, f1, t;
		if (K.loop) { const x = ((u % n) + n) % n; f0 = Math.floor(x); f1 = (f0 + 1) % n; t = x - f0; }
		else { const x = Math.max(0, Math.min(n - 1, u)); f0 = Math.floor(x); f1 = Math.min(n - 1, f0 + 1); t = x - f0; }
		if (this.C.blend === false) t = 0;
		// os ossos dos dois quadros vizinhos misturados por QUATÉRNIO (a rotação gira; a mistura de matrizes encolhia o membro no meio)
		const NB = Char3D.BONES, B = K.B, out = this._B, Qk = K.Q || (K.Q = C3Q.ofClip(K)), q = C3Q._q;
		for (let i = 0; i < NB; i++) {
			const o0 = (f0 * NB + i) * 12, o1 = (f1 * NB + i) * 12, d = i * 12;
			C3Q.nlerp(Qk, (f0 * NB + i) * 4, Qk, (f1 * NB + i) * 4, t, q);
			C3Q.toRows(q, out, d);
			for (let r = 0; r < 3; r++) out[d + r * 4 + 3] = B[o0 + 9 + r] + (B[o1 + 9 + r] - B[o0 + 9 + r]) * t;
		}
		this._sc = K.sc[f0] + (K.sc[f1] - K.sc[f0]) * t;
		this._fadeApply();
		const fn = t < 0.5 ? f0 : f1;
		this._expr = K.ex ? K.ex[fn] : 0;
		this._fx(K.fx && K.fx[fn]);
		// objetos na mão: os do quadro mais perto
		const fp = K.props[t < 0.5 ? f0 : f1] || [], on = this._on || (this._on = new Set());
		on.clear();
		for (const [name, X] of fp) {
			const P = this._prop(name);
			if (!P) continue;
			on.add(name);
			for (let r = 0; r < 3; r++) { P.B[r * 4] = X[r * 3]; P.B[r * 4 + 1] = X[r * 3 + 1]; P.B[r * 4 + 2] = X[r * 3 + 2]; P.B[r * 4 + 3] = X[9 + r]; }
			if (!P.mesh.isEnabled()) P.mesh.setEnabled(true);
		}
		for (const [name, P] of this.props) if (P && !on.has(name) && P.mesh.isEnabled()) P.mesh.setEnabled(false);
	}
	// TRANSIÇÃO entre clipes: guarda a pose de agora (rotação de cada osso em quatérnio, posição e escala) e, por fadeS segundos
	// (Config.art.char3d.fade, 0,2 s), mistura a pose do clipe novo com ela — sem o "pulo" de uma pose para a outra.
	_fadeStart() {
		const NB = Char3D.BONES, out = this._B, F = this._fq || (this._fq = new Float32Array(NB * 4)), T = this._ftr || (this._ftr = new Float32Array(NB * 3));
		for (let i = 0; i < NB; i++) { C3Q.fromRows(out, i * 12, F, i * 4); for (let r = 0; r < 3; r++) T[i * 3 + r] = out[i * 12 + r * 4 + 3]; }
		this._fsc = this._sc || 1; this._fadeT = 0;
	}
	_fadeApply() {
		if (this._fadeT === undefined || this._fadeT < 0) return;
		const dur = this.C.fade === undefined ? 0.2 : this.C.fade;
		this._fadeT += this.scene.getEngine().getDeltaTime() / 1000;
		if (!(dur > 0) || this._fadeT >= dur) { this._fadeT = -1; return; }
		const x = this._fadeT / dur, w = x * x * (3 - 2 * x), NB = Char3D.BONES, out = this._B, F = this._fq, T = this._ftr, q = C3Q._q, p = C3Q._p;
		for (let i = 0; i < NB; i++) {
			const d = i * 12;
			C3Q.fromRows(out, d, p, 0);
			C3Q.nlerp(F, i * 4, p, 0, w, q);
			C3Q.toRows(q, out, d);
			for (let r = 0; r < 3; r++) out[d + r * 4 + 3] = T[i * 3 + r] + (out[d + r * 4 + 3] - T[i * 3 + r]) * w;
		}
		this._sc = this._fsc + ((this._sc || 1) - this._fsc) * w;
	}
	// EFEITOS do quadro (no espaço do corpo): o CLARÃO do tiro na boca do cano — dois planos cruzados ao longo do disparo, brilho aditivo.
	_fx(E) {
		let on = false;
		if (E) for (let i = 0; i < E.length; i += 8) {
			if (E[i] !== 1) continue;
			const F = this._flash || (this._flash = Char3D.flashMesh(this.scene, this.root, this.actor.mesh.renderingGroupId)), u = this.model.unit * (this._sc || 1), sz = E[i + 7];
			F.position.set(E[i + 1] * u, E[i + 3] * u, E[i + 2] * u);
			const d = this._dir || (this._dir = new BABYLON.Vector3()), f = Char3DActor._FWD;
			d.set(E[i + 4], E[i + 6], E[i + 5]).normalize();
			BABYLON.Quaternion.FromUnitVectorsToRef(f, d, F.rotationQuaternion || (F.rotationQuaternion = new BABYLON.Quaternion()));
			const L = 12 * sz * u, W = 7 * sz * u;
			F.scaling.set(W, W, L);
			on = true;
			break;
		}
		if (this._flash && this._flash.isEnabled() !== on) this._flash.setEnabled(on);
	}
	// Onde o SpriteActor está: posição (com o relevo e o pulo: o quad mora a 0,5 acima do chão) e rumo.
	_place(a) {
		const m = a.mesh, r = this.root, ly = a.lift ? a.lift.position.y : 0, up = m.position.y - (typeof NpcArt !== 'undefined' ? NpcArt.LAYER_Y : 0.5);
		// CALÇADA: dentro de um quarteirão e fora da pista o chão está curbHeight acima do asfalto (calçadas, praças, lotes) — sobe e desce
		// o meio-fio suave. (Só no chão: num viaduto, telhado, escada ou no ar a altura já vem do desenho.)
		if (m.position.x !== this._sx || m.position.z !== this._sz) {
			this._sx = m.position.x; this._sz = m.position.z;
			this._surfT = up < 0.1 ? Char3D.surfaceAt(m.position.x, m.position.z) : 0;
		}
		const dt = Math.min(0.1, this.scene.getEngine().getDeltaTime() / 1000);
		this._surf = this._surf === undefined ? this._surfT : this._surf + (this._surfT - this._surf) * Math.min(1, dt * 14);
		r.position.set(m.position.x, ly + up + this._surf + (this.model.lift || 0), m.position.z);
		this.shadowMesh.position.y = 0.04 - (this.model.lift || 0);                  // (a mancha no chão, não na altura da subida)
		r.rotation.y = a.heading || 0;
		const sh = !(a._wl > 0.3) && !/^(ride_|sit|swim|dive|board)/.test(a.clip.name);      // (montado, sentado, nadando: os pés não estão no chão)
		// sombra projetada ao SOL (na sombra de um prédio, em interiores e de noite ela some aos poucos); a mancha macia fica por baixo
		const sun = this._sh3 && sh ? Char3D.sunK() * Math.max(0, Math.min(1, ((a.shade || 1) - 0.7) / 0.3)) : 0;
		if (this._sh3) { const on = sun > 0.02; if (this._sh3.isEnabled() !== on) this._sh3.setEnabled(on); this._sun = sun; }
		const blob = sh && sun < 0.6;
		if (this.shadowMesh.isEnabled() !== blob) this.shadowMesh.setEnabled(blob);
	}
	// As malhas do ator (não as do modelo).
	_clear() {
		if (this._sets) { for (const set of this._sets.values()) this._drop(set); this._sets.clear(); }
		for (const P of this.props.values()) if (P) { P.mesh.dispose(); P.mat.dispose(); }
		this.props.clear();
		if (this._xr) { for (const m of this._xr) { m.material.dispose(); m.dispose(); } this._xr = null; }
		if (this._sh3) { this._sh3.material.dispose(); this._sh3.dispose(); this._sh3 = null; }
		if (this.body) { this.body.dispose(); this.bodyMat.dispose(); this.body = null; }
		if (this.polyMesh) { this.polyMesh.dispose(); this.polyMat.dispose(); this.polyMesh = null; }
		this._built = false;
	}
	// Guardado na reserva (Char3D._free): escondido, o desenho 2,5D do ator de volta.
	release() {
		this._hide3d();
		if (this.actor && !this.actor.mesh.isDisposed()) this._show2d(true);
		if (this.actor && this.actor._c3 === this) this.actor._c3 = null;
		this.actor = null; this._last = null; this._u = 0;
	}
	// Reaproveitado para outro ator do mesmo modelo.
	rebind(actor) {
		this.actor = actor; this._last = null; this._u = 0; this._expr = 0; this._curK = null; this._fadeT = -1;
		const g = actor.mesh.renderingGroupId;
		for (const m of this.root.getChildMeshes()) m.renderingGroupId = g;
	}
	dispose() {
		this._clear();
		if (this._flash) this._flash.dispose();
		this.shadowMesh.dispose();
		this.root.dispose();
		if (this.actor && !this.actor.mesh.isDisposed()) this._show2d(true);
		if (this.actor && this.actor._c3 === this) this.actor._c3 = null;
	}
}
Char3DActor._FWD = new BABYLON.Vector3(0, 0, 1);
