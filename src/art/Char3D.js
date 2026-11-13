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
		const C = this.C, q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('boneco') : null;
		return C.on !== false && q !== '2d' && typeof Worker === 'function' && typeof Wardrobe !== 'undefined';
	},
	get npcOn() { const N = this.C.npc; return this.on && !!N && N.on !== false && typeof NpcArt !== 'undefined' && !!NpcArt._pal; },
	BONES: 16,
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
	},

	// ---------------------------------------------------------------- Workers e modelos
	_ws: {}, _models: new Map(), _types: new Map(), _mid: 0,
	// Um Worker para o jogador (o visual dele nunca espera os NPCs) e um para os NPCs.
	worker(kind) {
		let w = this._ws[kind];
		if (w) return w;
		w = this._ws[kind] = new Worker(Wardrobe.URL);
		w.onmessage = (e) => { const m = e.data, M = this._models.get(m.mid); if (M) M._msg(m); };
		w.onerror = (e) => { if (e.preventDefault) e.preventDefault(); console.warn('Char3D: o gerador não abriu', e.message || e); for (const M of this._models.values()) if (M.kind === kind) M.failed = true; };
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
	// lod = 1: o modelo de LONGE (menos pontos, maiores — Config.art.char3d.npc.farSpacing): dá para ter muitos mais NPCs em 3D.
	typeModel(type, dmg = 0, lod = 0) {
		const key = type + '|' + dmg + '|' + lod, N = this.C.npc || {};
		let M = this._types.get(key);
		if (!M) { M = new Char3DModel(this._scene, { npc: type, dmg, spacing: lod ? N.farSpacing || 2.2 : N.spacing || 1.3, kind: 'npc' }); M._lod = lod; this._types.set(key, M); }
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
				console.error('[Char3D] erro no quadro:', e);
				if (++this._errs >= 3) this.disable();
			}
		});
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
	_playerSpec(force) {
		const P = this._game.player.char3d, spec = JSON.parse(JSON.stringify(PlayerLook.spec())), dmg = PlayerLook.dmg ? PlayerLook.dmg() : 0;
		if (dmg) spec.dmg = dmg;                 // (machucado: o sangue assado na roupa e no corpo, como os atlas de dano)
		const sig = JSON.stringify(spec);
		if (!force && sig === this._pSig) return;
		this._pSig = sig;
		const M = new Char3DModel(this._scene, { spec, spacing: this.C.spacing || 1.0, kind: 'player' });
		M.onReady = () => { const old = P.model; P.setModel(M); if (old && old !== M) old.dispose(); };
		this._pNext = M;
	},
	tick() {
		const sc = this._scene, cam = sc.activeCamera, dt = sc.getEngine().getDeltaTime() / 1000, V = this._view;
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
			if ((this._pick -= dt) <= 0) { this._pick = 0.25; this._choose(pl); }
			if ((this._gcT = (this._gcT || 0) - dt) <= 0) { this._gcT = 10; this._gc(); }
			for (const [a, R] of this.npcs) R.update();
		} else if (this.npcs.size) this._choose(null);
	},
	// Os NPCs que ficam 3D: os mais perto da câmera (do jogador), até `max`, dentro de `radius` (folga de 15% para quem já está 3D: ninguém
	// pisca na borda). Fica de fora: o próprio jogador, pilotos presos num veículo (o desenho deles é do veículo) e quem não é 2,5D.
	_choose(pl) {
		const N = this.C.npc || {}, max = pl ? (N.max | 0) : 0, R = N.radius || 38, cx = pl ? pl.position.x : 0, cz = pl ? pl.position.z : 0, cand = [];
		if (pl) for (const a of SpriteActor.live) {
			const m = a.mesh, t = a.npcType;
			if (!t || a === pl.actor || !a.clip || !a.clip.npc || !a._placed || m.isDisposed() || !m.isEnabled() || !m.isVisible) continue;
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
		// Perto (até nearDist m; quem já está perto, até 25% além) o modelo cheio; mais longe, o leve.
		const near = N.nearDist || 17, d2 = new Map(cand.map(([d, a]) => [a, d]));
		const typeOf = (a) => String((a.sheet && a.sheet.baseId) || a.npcType).replace(/#d\d+$/, ''), lodOf = (a) => {
			const C = this.npcs.get(a), r = C && C.model && C.model._lod === 0 ? near * 1.25 : near;
			return (d2.get(a) || 0) < r * r ? 0 : 1;
		};
		const modelOf = (a) => {
			if (hero(a)) return PM && PM.ready ? PM : null;
			const lod = lodOf(a), M = this.typeModel(typeOf(a), (a.sheet && a.sheet.dmgLvl) | 0, lod);
			if (M.failed) return null;
			// (o modelo da outra distância ainda assando: fica com o que tem — sem voltar ao 2,5D no meio)
			if (!M.ready) { const C = this.npcs.get(a), O = C && C.model; if (O && O.ready && !O.failed && O._lod !== undefined) return O; }
			return M;
		};
		// (já assa os tipos de quem está chegando perto mas ainda não cabe no limite: quando couber, o modelo está pronto)
		let pre = 0;
		for (const [, a] of cand) {
			if (keep.has(a) || hero(a)) continue;
			const key = typeOf(a) + '|' + ((a.sheet && a.sheet.dmgLvl) | 0) + '|1';
			if (this._types.has(key)) { this._types.get(key)._used = performance.now(); continue; }
			if (pre++ < 2) this.typeModel(typeOf(a), (a.sheet && a.sheet.dmgLvl) | 0, 1);      // (no máximo 2 tipos novos por vez: sem rajada de assar e subir para a GPU)
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
	// Um boneco que saiu do raio: guardado para reaproveitar (até 12), ou destruído.
	_pool: [],
	_free(C) {
		if (C.pal && this._pool.length < 12 && C.model && C.model.ready) { C.release(); this._pool.push(C); }
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
class Char3DModel {
	constructor(scene, { spec = null, npc = null, dmg = 0, spacing = 1, kind = 'npc' }) {
		this.scene = scene; this.spacing = spacing; this.kind = kind; this.mid = ++Char3D._mid;
		this.clips = new Map();          // 'nome:arma' → clipe | 'wait' | 'fail'
		this.props = new Map();          // nome do objeto → malha-modelo (escondida; os atores clonam)
		this.ready = false; this.failed = false; this.onReady = null;
		Char3D._models.set(this.mid, this);
		this.w = Char3D.worker(kind);
		this.w.postMessage({ type: 'char3d', job: 1, mid: this.mid, spec, npc, dmg, spacing });
	}
	_msg(m) {
		if (m.error) {
			if (m.key) this.clips.set(m.key, 'fail');
			else { this.failed = true; console.warn('Char3D:', m.error.split('\n')[0]); }
			return;
		}
		if (m.char3d) this._build(m.char3d);
		else if (m.clip3d) { const c = m.clip3d; this.clips.set(c.key, c); for (const [k, p] of Object.entries(c.newProps || {})) this._prop(k, p); }
	}
	// Clipe pronto (ou undefined/'wait' enquanto chega, 'fail' se o gerador não tem).
	clip(key) {
		const K = this.clips.get(key);
		if (K === undefined && this.ready) { this.clips.set(key, 'wait'); this.w.postMessage({ type: 'char3dClip', job: 1, mid: this.mid, key }); }
		return K;
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
	_build(c) {
		this.unit = (c.scale || 1) / ((Config.art && Config.art.npcPpu) || 26) / 2;          // (m por unidade: escala / (PPU / k 0,5))
		if (c.ramps) {
			this.ramps = new BABYLON.RawTexture(c.ramps, 5, 32, BABYLON.Engine.TEXTUREFORMAT_RGBA, this.scene, false, false, BABYLON.Texture.BILINEAR_SAMPLINGMODE);
			this.ramps.wrapU = this.ramps.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
		}
		this.n = c.n;
		this.body = this._points('c3d_corpo' + this.mid, c.n, c.p1, c.n1, c.p2, c.n2, c.sk, c.mt, c.fa, c.fb);
		this.ready = true;
		for (const k of ['idle:none', 'walk:none', 'run:none']) this.clip(k);          // (os clipes de sempre já vêm: ninguém espera em 2,5D)
		if (this.onReady) this.onReady(this);
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
		if (this.ramps) this.ramps.dispose();
		this.ready = false;
	}
}

// ----------------------------------------------------------------------------
// Um personagem 3D que segue um SpriteActor (o modelo pode chegar depois: setModel).
// ----------------------------------------------------------------------------
class Char3DActor {
	constructor(scene, actor, model, { name = 'char3d', pal = false, xray = false } = {}) {
		this.scene = scene; this.actor = actor; this.name = name; this.pal = pal; this.wantXray = xray;
		this.root = new BABYLON.TransformNode(name, scene);
		this.root.setEnabled(false);
		this.props = new Map();          // nome → { mesh, mat, B }
		this.shown = false;
		this._B = new Float32Array(48 * 4);
		if (xray) actor._c3 = this;      // (o raio-X do jogador usa o boneco 3D enquanto ele está à mostra)
		this._shadow();
		if (model) this.setModel(model);
	}
	get C() { return Char3D.C; }
	setModel(M) {
		this._clear();
		this.model = M; this._last = null; this._built = false;
	}
	// As malhas do ator (clones das do modelo: a geometria é a mesma).
	_buildMeshes() {
		const M = this.model;
		this.body = this._clone(M.body, this.name + '_corpo');
		this.body.material = this.bodyMat = this._mat(this.name + '_mat');
		this.bodyMat.onBindObservable.add(() => this._bindCommon(this.bodyMat, this._B));
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
	_mat(name, sil = false) {
		const pal = this.pal && !sil, defines = [];
		if (sil === 'shadow') defines.push('#define SHADOW');
		else if (sil) defines.push('#define SIL');
		if (pal) defines.push('#define PAL');
		const m = new BABYLON.ShaderMaterial(name, this.scene, { vertex: 'char3d', fragment: 'char3d' }, {
			attributes: ['position', 'ip', 'in1', 'p2', 'n2', 'sk', 'mt', 'fa', 'fb'],
			uniforms: ['world', 'viewProjection', 'B', 'unit', 'pScale', 'splat', 'eye', 'sunL', 'tint', 'shade', 'silhouette', 'palRows', 'row', 'expr', 'groundY', 'viewport'],
			samplers: ['ramps', 'palette'],
			defines,
			needAlphaBlending: !!sil,
		});
		m.setVector4('silhouette', sil === 'shadow' ? Char3D._shadowV : sil && typeof NpcArt !== 'undefined' ? NpcArt.SILHOUETTE : new BABYLON.Vector4(0, 0, 0, 0));
		if (sil) { m.alphaMode = BABYLON.Engine.ALPHA_PREMULTIPLIED; m.disableDepthWrite = true; }
		m.backFaceCulling = false;
		if (pal) { m.setTexture('palette', NpcArt._pal.tex); m.setFloat('palRows', NpcArt.ROWS); }
		else if (this.model.ramps) m.setTexture('ramps', this.model.ramps);
		m.setVector3('eye', Char3D._view.eye);
		m.setVector3('sunL', Char3D.sun);
		m.setColor3('tint', typeof SpriteMaterial !== 'undefined' ? SpriteMaterial.sharedTint() : BABYLON.Color3.White());
		return m;
	}
	_bindCommon(m, B) {
		const e = m.getEffect(), M = this.model;
		if (!e || !M) return;
		e.setArray4('B', B);
		e.setFloat('unit', M.unit * (this._sc || 1));
		e.setFloat('pScale', Char3D._view.pScale);
		e.setFloat2('viewport', Char3D._view.w || 1280, Char3D._view.h || 720);
		e.setFloat('splat', M.spacing * M.unit * (this.C.splat || 2.1));
		e.setFloat('shade', this.actor.shade || 1);
		e.setFloat('expr', B === this._B ? this._expr || 0 : 0);
		e.setFloat('groundY', this.root.position.y + 0.03);
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
		XRaySilhouette.stencil(this.body, C.ALWAYS, 2, C.REPLACE);
		this._xr = [[false, L, C.NOTEQUAL, 2, C.REPLACE, C.GREATER], [true, L + 1, C.EQUAL, 1, C.KEEP, C.ALWAYS]].map(([over, ai, func, ref, pass, depth]) => {
			const m = this._clone(this.model.body, this.name + (over ? '_xrayC' : '_xray'));
			m.alphaIndex = ai;
			const mat = m.material = this._mat(m.name + '_mat', 'xray');
			mat.depthFunction = depth;
			mat.onBindObservable.add(() => this._bindCommon(mat, this._B));
			XRaySilhouette.stencil(m, func, ref, pass);
			m.setEnabled(false);
			return m;
		});
	}
	// SOMBRA PROJETADA: os mesmos pontos, achatados no chão na direção do sol, em preto translúcido. O stencil (4) deixa cada pixel do chão
	// escurecer uma vez só — sem ele, os pontos sobrepostos fariam manchas mais escuras.
	_shadowBuild() {
		const C = BABYLON.Constants, m = this._clone(this.model.body, this.name + '_sombra3d');
		const mat = m.material = this._mat(m.name + '_mat', 'shadow');
		mat.zOffset = -4;
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
		const mesh = this._clone(src, this.name + '_' + name), mat = this._mat(mesh.name + '_mat'), B = new Float32Array(48 * 4);
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
		const s = this.shadowMesh = BABYLON.MeshBuilder.CreateGround(this.name + '_sombra', { width: 0.9, height: 0.9 }, this.scene);
		s.material = m; s.isPickable = false; s.parent = this.root; s.position.y = 0.04; s._char3d = true;
	}

	// ---------------------------------------------------------------- a cada quadro
	_show2d(on) {
		const a = this.actor, mask = on ? 0x0FFFFFFF : 0;
		if (a.mesh.layerMask !== mask) a.mesh.layerMask = mask;
		if (a._ov && a._ov.layerMask !== mask) a._ov.layerMask = mask;
	}
	_hide3d() {
		if (!this.shown) return;
		this.shown = false;
		this.root.setEnabled(false);
	}
	update() {
		const a = this.actor, M = this.model;
		if (M && M.ready && !this._built) this._buildMeshes();
		const c = a.clip, vis = !a.mesh.isDisposed() && a.mesh.isEnabled() && a.mesh.isVisible && !!c;
		if (!this._built || M.failed || !vis || !c.npc) { this._hide3d(); this._show2d(true); return; }
		const key = c.name + ':' + (c.weapon || 'none');
		let K = M.clip(key);
		// (o gerador não tem esse clipe com essa arma: o mesmo sem arma; nem esse, parado — continua 3D em vez de voltar ao 2,5D)
		if (K === 'fail' && c.weapon && c.weapon !== 'none') K = M.clip(c.name + ':none');
		if (K === 'fail') K = M.clip('idle:none');
		if (K === 'fail' || ((K === undefined || K === 'wait') && !this._last)) { this._hide3d(); this._show2d(true); return; }
		if (K && K !== 'wait') this._last = K;
		else K = this._last;                                       // (o clipe novo ainda chegando: segura a última pose)
		this._pose(K, a, K.key === key || K.key.startsWith(c.name + ':'));
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
		const NB = Char3D.BONES, B = K.B, out = this._B;
		for (let i = 0; i < NB; i++) {
			const o0 = (f0 * NB + i) * 12, o1 = (f1 * NB + i) * 12, d = i * 12;
			for (let r = 0; r < 3; r++) {
				const o = d + r * 4;
				out[o] = B[o0 + r * 3] + (B[o1 + r * 3] - B[o0 + r * 3]) * t;
				out[o + 1] = B[o0 + r * 3 + 1] + (B[o1 + r * 3 + 1] - B[o0 + r * 3 + 1]) * t;
				out[o + 2] = B[o0 + r * 3 + 2] + (B[o1 + r * 3 + 2] - B[o0 + r * 3 + 2]) * t;
				out[o + 3] = B[o0 + 9 + r] + (B[o1 + 9 + r] - B[o0 + 9 + r]) * t;
			}
		}
		this._sc = K.sc[f0] + (K.sc[f1] - K.sc[f0]) * t;
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
		const m = a.mesh, r = this.root, ly = a.lift ? a.lift.position.y : 0;
		r.position.set(m.position.x, ly + m.position.y - (typeof NpcArt !== 'undefined' ? NpcArt.LAYER_Y : 0.5), m.position.z);
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
		for (const P of this.props.values()) if (P) { P.mesh.dispose(); P.mat.dispose(); }
		this.props.clear();
		if (this._xr) { for (const m of this._xr) { m.material.dispose(); m.dispose(); } this._xr = null; }
		if (this._sh3) { this._sh3.material.dispose(); this._sh3.dispose(); this._sh3 = null; }
		if (this.body) { this.body.dispose(); this.bodyMat.dispose(); this.body = null; }
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
		this.actor = actor; this._last = null; this._u = 0; this._expr = 0;
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
