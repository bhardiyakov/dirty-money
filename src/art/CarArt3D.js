// ============================================================================
// CarArt3D — os carros em 3D DE VERDADE (assets/cars/carros3d.js, gerado por tools/carros3d a partir do gerador procedural de
// veículos): carroceria com volume, vidros, faróis, lanternas e as QUATRO RODAS separadas, que rolam e esterçam, com a carroceria
// balançando sobre a suspensão. Substitui o sprite do atlas (CarActor) nos modelos que existem no arquivo; motos, bicicletas e
// barcos continuam no atlas 2D. Config.art.cars3d = false (ou ?cars2d na URL) volta aos sprites.
//
//   • UMA malha por modelo, com INSTÂNCIAS (thin instances): todos os carros daquele modelo na tela = 1 chamada de desenho (rodas
//     inclusas: a roda é replicada nos 4 cantos e cada vértice sabe de qual roda é). Só os carros perto da câmera viram instância;
//     um único material para todos os modelos e um único buffer de atributos por modelo (~10 µs de CPU por modelo na tela).
//   • Leve para a câmera de cima: o gerador sai no detalhe 0,3, simplificado (4 mm) e sem o que nunca aparece visto de cima (fundo
//     do chassi, interior, lado de dentro das rodas) — ~4,4 mil triângulos por carro em média (o pacote original tem ~33 mil).
//   • No shader (vértice): a roda ROLA (ângulo pela distância percorrida ÷ raio) e as dianteiras ESTERÇAM; a carroceria gira em volta
//     do eixo das rodas — mergulha na freada, senta na arrancada, inclina para fora na curva, quica nos buracos — enquanto as rodas
//     ficam no chão. Amassados (fases 1..3) deformam a lataria (frente esmagada, teto afundado na fase 3).
//   • No shader (fragmento): pintura da tabela do jogo (CarSheet.PAINTS: pintura e pintura 2, desbotada, carcaça queimada), luz do
//     SOL DO MUNDO (CarArt.setSun) e do céu, brilho do verniz, reflexo do céu nos vidros e cromados, riscos e vidros trincados com
//     o amassado, banda de rodagem com sulcos (dá para ver a roda girar) e as luzes acesas (faróis, freio, setas, ré, giroflex, luminoso
//     do táxi) — que não escurecem com a noite.
//   • Profundidade "achatada": cada carro grava profundidade só numa fatia fina logo acima do chão (base + 0,30..0,47 m). Ele se esconde
//     sob prédios, viadutos e copas como antes, e os personagens 2,5D (quads a 0,5 m) continuam passando POR CIMA dele, como com o sprite.
//
// Mesma interface do CarActor (setPosition / setHeading / setY / setVariant / setDamage / setVisible / update / animate / dispose,
// rotates, tire, variant, shade, y), mais setLamps (CarLights) e setFlat (pneus furados, Vehicle).
// ============================================================================

const CarArt3D = {
	ready: null,           // Promise: binário descomprimido (começa ao carregar a página)
	_bin: null,            // ArrayBuffer com as malhas (descomprimido)
	_scene: null,
	_models: {},           // id -> { mesh, n, cap, mat (matrizes: Float32Array 16×cap), inst (atributos: 16×cap), buf, dims }
	material: null,        // UM material para todos os modelos (entre malhas seguidas o Babylon não reenvia os uniformes)
	_paints: null,
	live: new Set(),       // atores vivos
	squash: 1,             // profundidade achatada (1 = jogo; a ferramenta usa 0 com a câmera livre)
	stats: null,

	// Ligado (Config.art.cars3d, ?cars2d desliga) e com o arquivo carregado.
	available() {
		if (typeof CAR3D === 'undefined' || !CAR3D.models) return false;
		if (typeof Config !== 'undefined' && Config.art && Config.art.cars3d === false) return false;
		return !(typeof location !== 'undefined' && /[?&]cars2d/.test(location.search));
	},
	has(id) { return this.available() && !!CAR3D.models[id]; },
	get K() { return (typeof Config !== 'undefined' && Config.vehicle && Config.vehicle.scale) || 1; },

	_bytes(b64) { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; },

	// Descomprime o binário (nativo do navegador, em segundo plano). A carga do jogo espera `ready` antes de criar o trânsito.
	load() {
		if (this.ready) return this.ready;
		const t0 = performance.now(), z = this._bytes(CAR3D.z);
		this.ready = (typeof DecompressionStream === 'function'
			? new Response(new Blob([z]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()
			: Promise.resolve(Inflate.zlib(z, CAR3D.raw).buffer))
			.then((buf) => { this._bin = buf; this._ms = performance.now() - t0; })
			.catch((e) => console.warn('[CARROS 3D] descompressão assíncrona falhou, vai na hora', e));
		return this.ready;
	},

	// Prepara a cena (uma vez). Sem o binário pronto, descomprime na hora (síncrono).
	init(scene) {
		if (this._scene === scene) return;
		if (!this._bin) { const t0 = performance.now(); const u = Inflate.zlib(this._bytes(CAR3D.z), CAR3D.raw); this._bin = u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength); this._ms = performance.now() - t0; }
		this._scene = scene;
		this._models = {};
		this._paints = CarArt._paintTable(scene);
		this._register();
		this.material = this._material();
		this._obs = scene.onBeforeRenderObservable.add(() => this.flush());
		this.stats = { decodeMs: Math.round(this._ms || 0), models: Object.keys(CAR3D.models).length, bytes: CAR3D.raw };
		console.log(`[CARROS 3D] ${this.stats.models} modelos (detalhe ${CAR3D.detail}): ${(CAR3D.raw / 1048576).toFixed(1)} MB descomprimidos em ${this.stats.decodeMs} ms`);
	},

	// Ferramenta (tools/carros3d): troca o arquivo carregado e refaz tudo.
	async reload(scene) {
		for (const m of Object.values(this._models)) { m.mesh.dispose(); m.buf.dispose(); }
		if (this.material) this.material.dispose();
		if (this._scene && this._obs) this._scene.onBeforeRenderObservable.remove(this._obs);
		this._models = {}; this._scene = null; this._bin = null; this.ready = null;
		await this.load();
		this.init(scene);
	},

	actor(modelId, variant, scale = 1) {
		if (!this._scene) this.init(CarArt.scene || CarArt._scene);
		return new Car3DActor(modelId, variant, scale);
	},

	// ---------------------------------------------------------------- malhas
	// Lê uma seção do binário: posições (Int16 × q), normais (Int8), material (Uint8) e índices.
	_read(sec, q) {
		const buf = this._bin, nv = sec.nv, al = (n) => (n + 3) & ~3;
		let o = sec.at;
		const P = new Int16Array(buf, o, nv * 3); o += al(nv * 6);
		const N = new Int8Array(buf, o, nv * 3); o += al(nv * 3);
		const M = new Uint8Array(buf, o, nv); o += al(nv);
		const I = sec.i32 ? new Uint32Array(buf, o, sec.ni) : new Uint16Array(buf, o, sec.ni);
		return { nv, ni: sec.ni, P, N, M, I, q };
	},

	// Malha do modelo (na 1ª vez que um carro dele aparece): carroceria + 4 cópias da roda, atributos por vértice:
	//   position/normal (eixos do jogo, m reais) | color = (cor sRGB, tipo) | pbr = (rugosidade, metal, verniz, estampa)
	//   wc = (centro da roda, qual roda: 0 carroceria, 1 diant. esq., 2 diant. dir., 3 tras. esq., 4 tras. dir.)
	_model(id) {
		let m = this._models[id];
		if (m) return m;
		const D = CAR3D.models[id], body = this._read(D.body, D.q), wheel = D.wheel ? this._read(D.wheel, D.q) : null;
		const W = wheel ? D.wheels : [], nv = body.nv + (wheel ? wheel.nv * W.length : 0), ni = body.ni + (wheel ? wheel.ni * W.length : 0);
		const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 4), pbr = new Float32Array(nv * 4), wc = new Float32Array(nv * 4);
		const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
		const mats = D.mats;
		let v = 0, t = 0;
		const put = (src, flip, c, part) => {
			const base = v;
			for (let i = 0; i < src.nv; i++, v++) {
				const s = flip ? -1 : 1, mt = mats[src.M[i]];
				pos[v * 3] = src.P[i * 3] * src.q * s; pos[v * 3 + 1] = src.P[i * 3 + 1] * src.q; pos[v * 3 + 2] = src.P[i * 3 + 2] * src.q * s;
				nor[v * 3] = src.N[i * 3] / 127 * s; nor[v * 3 + 1] = src.N[i * 3 + 1] / 127; nor[v * 3 + 2] = src.N[i * 3 + 2] / 127 * s;
				col[v * 4] = mt.c[0]; col[v * 4 + 1] = mt.c[1]; col[v * 4 + 2] = mt.c[2]; col[v * 4 + 3] = mt.k;
				pbr[v * 4] = mt.r; pbr[v * 4 + 1] = mt.m; pbr[v * 4 + 2] = mt.cc; pbr[v * 4 + 3] = mt.s || 0;
				if (c) { wc[v * 4] = c[0]; wc[v * 4 + 1] = c[1]; wc[v * 4 + 2] = c[2]; wc[v * 4 + 3] = part; }
			}
			for (let i = 0; i < src.ni; i++) idx[t++] = base + src.I[i];
		};
		put(body, false, null, 0);
		// a roda do arquivo é a da DIREITA; a da esquerda é ela girada 180° em volta do eixo vertical (x, z → -x, -z), como no glTF
		for (const c of W) put(wheel, !c[4], c, 1 + (c[3] ? 0 : 2) + (c[4] ? 1 : 0));
		const scene = this._scene, mesh = new BABYLON.Mesh('car3d_' + id, scene);
		const vd = new BABYLON.VertexData();
		vd.positions = pos; vd.normals = nor; vd.colors = col; vd.indices = idx;
		vd.applyToMesh(mesh, false);
		mesh.setVerticesData('pbr', pbr, false, 4);
		mesh.setVerticesData('wc', wc, false, 4);
		const front = W.filter((c) => c[3]), rear = W.filter((c) => !c[3]);
		m = { id, mesh, n: 0, cap: 0, D, R: D.R || 0.3, zf: front.length ? front[0][2] : D.len * 0.3, zr: rear.length ? rear[0][2] : -D.len * 0.3 };
		m.dims = [Math.max(D.max[2], -D.min[2]), D.h, D.wid / 2, D.R || 0.3];      // (vai em cada instância: o material é um só)
		mesh.material = this.material;
		mesh.freezeWorldMatrix();                  // (a malha fica na origem: a posição de cada carro está na instância)
		mesh.renderingGroupId = 1;                 // depois do chão (marcas de pneu, sangue, poças), antes dos personagens 2,5D e das copas
		mesh.isPickable = false;
		mesh.alwaysSelectAsActiveMesh = true;      // (o recorte é feito aqui: só os carros perto da câmera viram instância)
		mesh.doNotSyncBoundingInfo = true;
		this._grow(m, 8);
		this._models[id] = m;
		return m;
	},

	// Capacidade de instâncias do modelo: as matrizes (thin instances do Babylon) e UM buffer com os 4 atributos por instância
	// (ia, ib, ic, dm: 16 floats) — um envio por modelo por quadro.
	_grow(m, cap) {
		const g = (a, n) => { const b = new Float32Array(n); if (a) b.set(a.subarray(0, Math.min(a.length, n))); return b; };
		m.mat = g(m.mat, cap * 16); m.inst = g(m.inst, cap * 16);
		m.mesh.thinInstanceSetBuffer('matrix', m.mat, 16, false);
		if (m.buf) m.buf.dispose();
		m.buf = new BABYLON.Buffer(this._scene.getEngine(), m.inst, true, 16, false, true);
		['ia', 'ib', 'ic', 'dm'].forEach((k, i) => m.mesh.setVerticesBuffer(m.buf.createVertexBuffer(k, i * 4, 4)));
		m.cap = cap;
		m.mesh.thinInstanceCount = 0;
	},

	_register() {
		if (BABYLON.Effect.ShadersStore.car3dVertexShader) return;
		BABYLON.Effect.ShadersStore.car3dVertexShader = `
			precision highp float;
			attribute vec3 position;
			attribute vec3 normal;
			attribute vec4 color;     // cor do material (sRGB) + tipo
			attribute vec4 pbr;       // rugosidade, metal, verniz, estampa (1 = farol, friso, placa, letreiro… colado na lataria)
			attribute vec4 wc;        // centro da roda + qual roda (0 = carroceria)
			attribute vec4 ia;        // giro das rodas (rad), esterço (rad, + = direita), arfagem (+ = nariz desce), rolagem (+ = teto p/ esquerda)
			attribute vec4 ib;        // sobe/desce (m), guinada da carroceria (rad), linha da pintura, fase do amassado
			attribute vec4 ic;        // sombra de prédio (1 = sol), faróis, lanternas, bits (setas, ré, giroflex, pneus furados)
			attribute vec4 dm;        // medidas do modelo: meio comprimento, altura, meia largura, raio da roda (m, sem a escala)
			#include<instancesDeclaration>
			uniform mat4 viewProjection;
			uniform float squash;     // profundidade achatada (ver o topo do arquivo)
			varying vec4 vNK;         // normal (mundo) + tipo
			varying vec4 vWS;         // posição (mundo) + sombra
			varying vec4 vCR;         // cor + linha da pintura
			varying vec4 vPD;         // rugosidade, metal, verniz, amassado
			varying vec4 vLP;         // posição de repouso (modelo / roda) + qual roda
			varying vec4 vLt;         // faróis, lanternas, bits, -
			varying vec4 vDm;         // medidas do modelo

			float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
			float vnoise(vec3 p) {
				vec3 i = floor(p), f = fract(p);
				f = f * f * (3.0 - 2.0 * f);
				float a = mix(h3(i), h3(i + vec3(1.0, 0.0, 0.0)), f.x), b = mix(h3(i + vec3(0.0, 1.0, 0.0)), h3(i + vec3(1.0, 1.0, 0.0)), f.x);
				float c = mix(h3(i + vec3(0.0, 0.0, 1.0)), h3(i + vec3(1.0, 0.0, 1.0)), f.x), d = mix(h3(i + vec3(0.0, 1.0, 1.0)), h3(i + vec3(1.0, 1.0, 1.0)), f.x);
				return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
			}
			// giro em volta do eixo X (o topo vai para a frente, +Z, com a > 0), Y (a frente vai para a direita, +X) e Z (o topo vai para -X)
			vec3 rx(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.z * c + v.y * s); }
			vec3 ry(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, v.z * c - v.x * s); }
			vec3 rz(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z); }
			float bit(float f, float n) { return mod(floor(f / n), 2.0); }

			void main(void) {
				#include<instancesVertex>
				vec4 dims = dm;
				vec3 p = position, n = normal;
				float part = wc.w;
				if (part > 0.5) {
					// RODA: rola, esterça (dianteiras) e vai para o canto dela; pneu furado = o aro desce
					p = rx(p, ia.x); n = rx(n, ia.x);
					if (part < 2.5) { p = ry(p, ia.y); n = ry(n, ia.y); }
					float fl = bit(ic.w, 32.0 * pow(2.0, part - 1.0));
					p.y -= fl * dims.w * 0.22;
					p += wc.xyz;
				} else {
					// CARROCERIA: amassados (no repouso), depois a suspensão (gira em volta do eixo das rodas)
					float d = ib.w;
					if (d > 0.5) {
						float fr = smoothstep(dims.x * 0.35, dims.x, p.z), rr = smoothstep(dims.x * 0.5, dims.x, -p.z) * 0.6;
						float sd = smoothstep(dims.z * 0.55, dims.z, abs(p.x)) * 0.5, nz = vnoise(p * 3.3) * 0.7 + vnoise(p * 9.0) * 0.3;
						float amt = (d / 3.0) * (0.02 + 0.1 * max(fr, max(rr, sd))) * (0.25 + 0.75 * nz);
						p -= n * amt;
						if (d > 2.5) {
							p.z -= fr * fr * dims.x * 0.09;                                                    // frente esmagada
							p.y -= smoothstep(dims.y * 0.7, dims.y, p.y) * (0.05 + 0.05 * nz);                 // teto afundado
							n = normalize(n + (vec3(vnoise(p * 6.0), vnoise(p * 6.0 + 7.1), vnoise(p * 6.0 + 3.3)) - 0.5) * 0.9);
						} else n = normalize(n + (vec3(vnoise(p * 6.0), vnoise(p * 6.0 + 7.1), vnoise(p * 6.0 + 3.3)) - 0.5) * 0.35 * d * max(fr, sd));
					}
					float py = dims.w;
					p.y -= py;
					p = rx(p, ia.z); n = rx(n, ia.z);
					p = rz(p, ia.w); n = rz(n, ia.w);
					p = ry(p, ib.y); n = ry(n, ib.y);
					p.y += py + ib.x;
				}
				vec4 wp = finalWorld * vec4(p, 1.0);
				gl_Position = viewProjection * wp;
				if (squash > 0.5) {
					float base = finalWorld[3].y;
					// (estampa: um pouco mais perto da câmera que a lataria logo abaixo — não "briga" com ela nem afunda depois da simplificação)
					vec4 dp = viewProjection * vec4(wp.x, base + 0.3 + 0.17 * clamp((wp.y - base) / 3.5, 0.0, 1.0) + pbr.w * 0.002, wp.z, 1.0);
					gl_Position.z = dp.z / dp.w * gl_Position.w;
				}
				vNK = vec4(normalize((finalWorld * vec4(n, 0.0)).xyz), color.a);
				vWS = vec4(wp.xyz, ic.x);
				vCR = vec4(color.rgb, ib.z);
				vPD = vec4(pbr.xyz, ib.w);
				vLP = vec4(position, part);
				vLt = vec4(ic.y, ic.z, ic.w, 0.0);
				vDm = dm;
			}`;
		BABYLON.Effect.ShadersStore.car3dFragmentShader = `
			precision highp float;
			varying vec4 vNK;
			varying vec4 vWS;
			varying vec4 vCR;
			varying vec4 vPD;
			varying vec4 vLP;
			varying vec4 vLt;
			varying vec4 vDm;
			uniform sampler2D paints;
			uniform float paintRows;
			uniform vec3 eye;
			uniform vec3 sunL;        // direção PARA o sol (mundo)
			uniform vec3 sunC;        // cor do sol × intensidade relativa (0 = sem sol)
			uniform vec3 tint;        // cor ambiente dos sprites (dia/noite)

			float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
			float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
			float bit(float f, float n) { return mod(floor(f / n), 2.0); }
			bool is(float k, float v) { return abs(k - v) < 0.5; }
			// Worley: distância ao ponto mais próximo (x) e ao segundo (y) de uma grade de células com um ponto sorteado em cada
			vec2 worley(vec2 p) {
				vec2 i = floor(p), f = fract(p);
				float d1 = 8.0, d2 = 8.0;
				for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
					vec2 g = vec2(float(x), float(y));
					float d = length(g + vec2(h2(i + g), h2(i + g + 17.3)) - f);
					if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
				}
				return vec2(d1, d2);
			}
			// céu refletido: horizonte claro, zênite azul, chão escuro abaixo; o sol aparece como um brilho
			vec3 sky(vec3 r, float day) {
				vec3 c = r.y > 0.0 ? mix(vec3(0.8, 0.86, 0.92), vec3(0.4, 0.54, 0.74), pow(r.y, 0.6)) : mix(vec3(0.5, 0.52, 0.55), vec3(0.2, 0.2, 0.21), min(1.0, -r.y * 3.0));
				return c * (0.35 + 0.65 * day) + sunC * pow(max(dot(r, sunL), 0.0), 90.0) * 2.5;
			}

			void main(void) {
				vec4 dims = vDm;
				float kind = floor(vNK.w + 0.5);
				vec3 N = normalize(vNK.xyz);
				vec3 V = normalize(eye - vWS.xyz);
				float row = (floor(vCR.w + 0.5) + 0.5) / paintRows;
				vec2 fx = texture2D(paints, vec2(0.625, row)).rg;          // r = carcaça queimada, g = desbotada
				vec3 c = vCR.rgb;
				float rough = vPD.x, metal = vPD.y, coat = vPD.z, dent = vPD.w;
				bool painted = is(kind, 1.0) || is(kind, 2.0);
				if (is(kind, 1.0)) c = texture2D(paints, vec2(0.125, row)).rgb;
				else if (is(kind, 2.0)) c = texture2D(paints, vec2(0.375, row)).rgb;
				float glass = is(kind, 3.0) ? 1.0 : 0.0;
				vec3 L = vLP.xyz;
				// ---- VIDRO ESTILHAÇADO POR TIRO, um por um (Vehicle.breakGlass → bits 512.. de ic.w): 0 para-brisa, 1 traseiro, 2/3 janela
				// da frente esq./dir., 4/5 de trás esq./dir. Qual vidro é este pixel: o lateral fica perto da lateral; o resto, na frente
				// ou atrás do meio. Quebrado: o buraco escuro do interior com as trincas (células de Worley) e cacos claros na moldura.
				float broken = 0.0;
				if (glass > 0.5 && vLt.z >= 511.5) {
					float wi = abs(L.x) > dims.z * 0.66 || abs(L.z) < dims.x * 0.18 ? (L.x < 0.0 ? 2.0 : 3.0) + (L.z < -dims.x * 0.05 ? 2.0 : 0.0) : (L.z > 0.0 ? 0.0 : 1.0);
					broken = bit(vLt.z, 512.0 * pow(2.0, wi));
					if (broken > 0.5) {
						vec2 w = worley(vec2(L.x + L.y * 0.7, L.z + L.y * 0.5) * 11.0);
						float edge = 1.0 - smoothstep(0.0, 0.08, w.y - w.x), shard = step(0.62, h2(floor(vec2(L.x + L.y * 0.7, L.z + L.y * 0.5) * 11.0 + 0.5)));
						c = mix(vec3(0.035, 0.04, 0.045), vec3(0.62, 0.68, 0.7), max(edge * 0.75, shard * 0.35));
						glass = 0.12;
					}
				}
				// ---- riscos (fase 1+) na lataria e vidros trincados (2) / estourados (3)
				if (dent > 0.5 && vLP.w < 0.5) {
					float zone = max(smoothstep(dims.x * 0.3, dims.x, abs(L.z)), smoothstep(dims.z * 0.5, dims.z, abs(L.x)) * 0.7);
					if (painted || is(kind, 0.0)) {
						// riscos compridos (ao longo do carro), esparsos, mais nas pontas e nas laterais; manchas escuras da batida
						float st = n2(vec2(L.z * 2.5 + L.y * 1.3, (L.x + L.y) * 70.0));
						float m = smoothstep(0.86 - dent * 0.025, 0.9 - dent * 0.025, st) * zone * min(1.0, dent * 0.5);
						c = mix(c, c * 0.55 + vec3(0.13), m);
						c *= 1.0 - 0.22 * (dent / 3.0) * zone * smoothstep(0.45, 0.85, n2(L.xz * 3.0 + L.y * 2.0));
					}
					if (glass > 0.5 && dent > 1.5 && broken < 0.5) {
						// vidro estilhaçado: as bordas das células (Worley) viram trincas — em partes do vidro na fase 2; na 3 ele estourou
						vec2 w = worley(vec2(L.x + L.y * 0.7, L.z + L.y * 0.5) * 9.0);
						float edge = 1.0 - smoothstep(0.0, 0.07, w.y - w.x);
						if (dent > 2.5) { c = mix(vec3(0.05, 0.055, 0.06), vec3(0.55, 0.6, 0.62), edge * 0.6); glass = 0.15; }
						else c = mix(c, vec3(0.75, 0.8, 0.82), edge * 0.7 * smoothstep(0.35, 0.65, n2(L.xz * 2.3 + 1.7)));
					}
				}
				// ---- pneu: banda de rodagem com sulcos (gira com a roda) e lateral um pouco mais clara
				if (is(kind, 5.0) && vLP.w > 0.5) {
					float r = length(L.yz), a = atan(L.y, L.z);
					float tread = smoothstep(dims.w * 0.9, dims.w * 0.97, r);
					float gr = step(0.5, fract(a * 4.7746 + step(0.0, L.x) * 0.5));               // 30 sulcos por volta
					c *= mix(1.0, mix(1.25, 0.55, gr), tread);
				}
				// ---- tinta desbotada (carro velho) e carcaça queimada
				if (painted) {
					float l = dot(c, vec3(0.3, 0.59, 0.11));
					c = mix(c, vec3(l) * 0.96, fx.g * 0.35);
					coat *= 1.0 - fx.g; rough = mix(rough, 0.75, fx.g);
				}
				if (fx.r > 0.5) {
					float l = n2(L.xz * 5.0 + L.y * 2.0);
					c = glass > 0.5 ? vec3(0.03) : vec3(0.07, 0.06, 0.055) + l * vec3(0.07, 0.06, 0.05);
					rough = 0.95; metal = 0.0; coat = 0.0; glass *= 0.2;
				}
				// ---- luz: céu (hemisfério) + sol, relativa a uma superfície plana voltada para cima (o teto fica com a cor do material,
				// como no desenho; as laterais e as rampas clareiam ou escurecem conforme o lado do sol)
				float sh = clamp((vWS.w - 0.62) / 0.38, 0.0, 1.0);
				vec3 sun = sunC * sh;
				float sunI = dot(sun, vec3(0.333)), day = clamp(dot(sunC, vec3(0.333)), 0.0, 1.0);
				float skyA = 0.6 + 0.4 * N.y;
				float dif = max(dot(N, sunL), 0.0), dif0 = max(sunL.y, 0.0);
				float lit = (0.7 * skyA + 1.3 * sunI * dif) / (0.7 + 1.3 * sunI * dif0);
				float NV = clamp(dot(N, V), 0.0, 1.0);
				vec3 R = reflect(-V, N);
				vec3 env = sky(R, day);
				vec3 Hh = normalize(sunL + V);
				float nh = max(dot(N, Hh), 0.0);
				vec3 col;
				if (glass > 0.5) {
					float F = 0.08 + 0.85 * pow(1.0 - NV, 3.0);
					col = c * (0.55 + 0.45 * lit) + env * F * 0.9 + sun * pow(nh, 400.0) * 2.0;
				} else {
					float F0 = mix(0.04, 0.85, metal);
					float F = (F0 + (1.0 - F0) * pow(1.0 - NV, 5.0)) * (1.0 - 0.75 * rough);
					vec3 spec = env * mix(vec3(F), c * F * 1.3, metal) + env * coat * (0.04 + 0.4 * pow(1.0 - NV, 4.0));
					float hl = pow(nh, mix(700.0, 10.0, rough)) * (1.0 - rough) * 1.6 + coat * pow(nh, 1200.0) * 1.2;
					col = c * clamp(lit, 0.35, 1.7) * (1.0 - 0.7 * metal) + spec + sun * hl;
					if (glass > 0.0) col = mix(col, c + env * 0.08, 0.5);
				}
				col *= tint * vWS.w;
				// ---- luzes acesas (não escurecem com a noite); carcaça queimada não acende nada
				float on = 0.0; vec3 ec = vec3(0.0);
				float fl = vLt.z, siren = step(0.5, bit(fl, 8.0) + bit(fl, 16.0));       // giroflex ligado: a fase apagada ainda brilha um pouco
				if (is(kind, 6.0)) { on = vLt.x; ec = vec3(1.0, 0.95, 0.82) * 1.5; }
				else if (is(kind, 7.0)) { on = vLt.y; ec = vec3(1.0, 0.1, 0.07) * (0.7 + vLt.y * 0.9); }
				else if (is(kind, 8.0)) { on = L.x < 0.0 ? bit(fl, 1.0) : bit(fl, 2.0); ec = vec3(1.0, 0.58, 0.08) * 1.6; }
				else if (is(kind, 9.0)) { on = bit(fl, 4.0); ec = vec3(1.0, 1.0, 0.96) * 1.3; }
				else if (is(kind, 10.0)) { on = siren * (0.3 + 0.7 * bit(fl, 8.0)); ec = vec3(0.25, 0.5, 1.0) * 2.0; }
				else if (is(kind, 11.0)) { on = siren * (0.3 + 0.7 * bit(fl, 16.0)); ec = vec3(1.0, 0.2, 0.15) * 2.0; }
				else if (is(kind, 12.0)) { on = vLt.x; ec = vCR.rgb * 1.4 + 0.1; }
				if (dent > 2.5 && (is(kind, 6.0) || is(kind, 7.0))) on *= step(0.5, h2(floor(L.xz * 4.0)));    // lâmpada quebrada
				col = mix(col, ec, clamp(on, 0.0, 1.0) * (1.0 - fx.r));
				gl_FragColor = vec4(col, 1.0);
			}`;
	},

	_material() {
		const m = new BABYLON.ShaderMaterial('car3d', this._scene, { vertex: 'car3d', fragment: 'car3d' }, {
			attributes: ['position', 'normal', 'color', 'pbr', 'wc', 'ia', 'ib', 'ic', 'dm'],
			uniforms: ['world', 'viewProjection', 'squash', 'paintRows', 'eye', 'sunL', 'sunC', 'tint'],
			samplers: ['paints'],
		});
		m.setTexture('paints', this._paints);
		m.setFloat('paintRows', this._paints._rows);
		m.setFloat('squash', this.squash);
		m.setVector3('eye', new BABYLON.Vector3(0, 100, 0));
		m.setVector3('sunL', new BABYLON.Vector3(0, 1, 0));
		m.setColor3('sunC', new BABYLON.Color3(1, 1, 1));
		m.setColor3('tint', new BABYLON.Color3(1, 1, 1));
		m.backFaceCulling = true;
		m.checkReadyOnlyOnce = true;               // (sem refazer a lista de defines a cada malha a cada quadro)
		return m;
	},

	// ---------------------------------------------------------------- por quadro
	// Junta os carros perto da câmera nas instâncias de cada modelo (antes do render). Fora do alcance = nem vira instância.
	flush() {
		const sc = this._scene, cam = sc && sc.activeCamera;
		if (!cam) return;
		const M = this._models;
		for (const id in M) M[id].n = 0;
		const cp = cam.position, eng = sc.getEngine();
		const aspect = eng.getRenderWidth() / Math.max(1, eng.getRenderHeight());
		const reach = Math.tan((cam.fov || 0.8) / 2) * Math.max(10, cp.y) * Math.max(1, aspect) * 1.5 + 10, r2 = reach * reach;
		for (const a of this.live) {
			if (!a.visible || !a._placed) continue;
			const dx = a.x - cp.x, dz = a.z - cp.z;
			if (this.squash && dx * dx + dz * dz > r2) continue;
			const m = M[a.modelId] || this._model(a.modelId);
			if (m.n >= m.cap) this._grow(m, m.cap * 2);
			a._write(m, m.n++);
		}
		const s = CarArt._sun, d = Config.light.sunDir, dl = Math.hypot(d[0], d[1], d[2]);
		const tint = typeof SpriteMaterial !== 'undefined' ? SpriteMaterial.sharedTint() : null;
		const u = this._u || (this._u = { l: new BABYLON.Vector3(), c: new BABYLON.Color3(), e: new BABYLON.Vector3() });
		if (s) { u.l.set(s.x, s.y, s.z); u.c.set(s.r, s.g, s.b); } else { u.l.set(-d[0] / dl, -d[1] / dl, -d[2] / dl); u.c.set(1, 1, 1); }
		u.e.copyFrom(cp);
		const mt = this.material;
		mt.setVector3('eye', u.e); mt.setVector3('sunL', u.l); mt.setColor3('sunC', u.c); mt.setFloat('squash', this.squash);
		if (tint) mt.setColor3('tint', tint);
		for (const id in M) {
			const m = M[id], mesh = m.mesh;
			mesh.isVisible = m.n > 0;
			if (!m.n) continue;
			mesh.thinInstanceCount = m.n;
			mesh.thinInstanceBufferUpdated('matrix');
			m.buf.updateDirectly(m.inst, 0, m.n);
		}
	},

	// Quantos carros 3D estão na tela agora e em quantas chamadas de desenho (DevMode / medições).
	count() { let n = 0, calls = 0; for (const id in this._models) { const m = this._models[id]; if (m.n) { n += m.n; calls++; } } return { cars: n, calls, live: this.live.size, models: Object.keys(this._models).length }; },
};

// ----------------------------------------------------------------------------
// Car3DActor — UM carro 3D (uma instância da malha do modelo). Guarda o estado da suspensão e das rodas; a matriz e os atributos
// são escritos uma vez por quadro (CarArt3D.flush), só se o carro estiver perto da câmera.
// ----------------------------------------------------------------------------
class Car3DActor {
	constructor(modelId, variant, scale = 1) {
		const D = CAR3D.models[modelId];
		this.modelId = modelId;
		this.variant = variant;
		this.scale = scale;
		this.k = CarArt3D.K * scale;
		this.dent = 0;
		this.shade = 1;
		this._shadeTimer = Math.random() * 0.3;
		this.x = 0; this.z = 0; this.y = 1.5; this.heading = 0;
		this.visible = true;
		this._placed = false;                        // só aparece quando recebe a 1ª posição
		this.rotates = true;                         // (CarLights/CarDoors: a frente desenhada é a do heading exato)
		// rodas (m, já na escala): para as marcas de pneu e os tiros no pneu (Vehicle.wheelWorld) — o par simétrico mais próximo
		const W = D.wheels, f = W.find((w) => w[3]), r = W.find((w) => !w[3]);
		this.R = (D.R || 0.3) * this.k;
		this.tire = f ? { z: ((f[2] - (r ? r[2] : -f[2])) / 2) * this.k, x: Math.abs(f[0]) * this.k, len: this.R * 2, wid: (D.tw || 0.2) * this.k } : null;
		this.hl = D.len / 2 * this.k; this.hw = D.wid / 2 * this.k;
		// estado da suspensão (rad / m) e das rodas
		this.steer = 0; this.spin = 0;
		this.pitch = 0; this._vp = 0; this.roll = 0; this._vr = 0; this.yaw = 0; this._vy = 0; this.heave = 0; this._vh = 0;
		this._bumpT = 0.3 + Math.random();
		this._px = null; this._pz = 0;
		// luzes (CarLights.setLamps) e pneus furados
		this.lamps = { head: 0, tail: 0, bits: 0 };
		this.flatBits = 0;
		this.glassBits = 0;
		CarArt3D.live.add(this);
	}

	setPosition(x, z) { this.x = x; this.z = z; this._placed = true; }
	setHeading(h) { this.heading = h; }
	setY(y) { this.y = y; }
	setVariant(v) { this.variant = v; }
	setDamage(d) { this.dent = Math.max(0, Math.min(3, d | 0)); }
	setVisible(v) { this.visible = !!v; }
	setModel() { /* (só motos trocam de desenho; carro 3D não) */ }

	// Luzes (CarLights, a cada quadro, só para os carros perto): head/tail = 0..1 (lanterna 1 = freio), sigL/sigR = seta piscando
	// AGORA (já com o pisca), siren = 0 desligado | 1 fase azul | 2 fase vermelha, reverse = luz de ré.
	setLamps(head, tail, sigL, sigR, siren = 0, reverse = false) {
		const L = this.lamps;
		L.head = head; L.tail = tail;
		L.bits = (sigL ? 1 : 0) + (sigR ? 2 : 0) + (reverse ? 4 : 0) + (siren === 1 ? 8 : siren === 2 ? 16 : 0);
	}

	// Pneus furados (Vehicle.flat: [diant. esq., diant. dir., tras. esq., tras. dir.]): o aro desce e aquele canto afunda.
	// Vidros quebrados por tiro (Vehicle.glass: bit i = vidro i — ver o shader): estilhaçados, o interior escuro aparece.
	setGlass(mask) { this.glassBits = (mask | 0) * 512; }
	setFlat(F) { this.flatBits = F ? (F[0] ? 32 : 0) + (F[1] ? 64 : 0) + (F[2] ? 128 : 0) + (F[3] ? 256 : 0) : 0; this._flat = F; }

	// Física visual (Vehicle._bodyMotion, a cada quadro): aF/aL = aceleração à frente / para a direita (m/s²), steer = volante
	// (-1..1, + = direita), yr = giro do chassi (rad/s). As rodas da frente viram até ~27° e rolam pela distância percorrida; a
	// carroceria segue molas amortecidas (pouco: passa do ponto e assenta) — freada mergulha o nariz, arrancada senta a traseira,
	// curva inclina para fora e "atrasa" a carroceria um pouco; em velocidade, buracos e emendas do asfalto dão trancos.
	animate(dt, aF, aL, steer, yr = null) {
		if (dt <= 0) return;
		const lim = (v, m) => Math.max(-m, Math.min(m, v));
		this.steer += (lim(steer || 0, 1) * 0.47 - this.steer) * Math.min(1, dt * 10);
		// rodas: rolam pela distância andada ao longo da frente (teleporte = ignora); o giro por quadro tem teto para não "andar para
		// trás" com o efeito estroboscópico em alta velocidade
		if (this._px !== null) {
			let d = (this.x - this._px) * Math.sin(this.heading) + (this.z - this._pz) * Math.cos(this.heading);
			if (Math.abs(d) > 4) d = 0;
			this._speed = d / dt;
			const da = lim(d / this.R, 0.42);
			this.spin = (this.spin + da) % (Math.PI * 2);
		}
		this._px = this.x; this._pz = this.z;
		const sp = Math.abs(this._speed || 0), h = Math.min(dt, 1 / 30);
		// pneus furados: o canto do pneu baixa (arfagem/rolagem fixas) e o carro "sabonta" de leve andando
		const F = this._flat;
		let fp = 0, fr = 0;
		if (F) { fp = ((F[2] + F[3]) - (F[0] + F[1])) * 0.012; fr = ((F[0] + F[2]) - (F[1] + F[3])) * 0.018; }
		const tp = lim(-aF * 0.0042, 0.05) + fp;                       // freando (aF < 0) o nariz desce
		const tr = lim(aL * 0.0068, 0.07) + fr;                        // curva para a direita (aL > 0): teto vai para a esquerda (fora)
		const ty = yr === null ? 0 : lim(-yr * 0.022, 0.045);          // a carroceria gira um pouco atrasada em relação ao chassi
		this._vp += (150 * (tp - this.pitch) - 9 * this._vp) * h; this.pitch += this._vp * h;
		this._vr += (120 * (tr - this.roll) - 6.5 * this._vr) * h; this.roll += this._vr * h;
		this._vy += (90 * (ty - this.yaw) - 7 * this._vy) * h; this.yaw += this._vy * h;
		// trancos do asfalto: andando, de tempos em tempos a carroceria leva um tranco vertical (e um pouco na arfagem/rolagem)
		this._bumpT -= dt * Math.min(1, sp / 12);
		if (this._bumpT <= 0) {
			this._bumpT = 0.4 + Math.random() * 1.6;
			if (sp > 3) {
				const k = Math.min(1, sp / 25);
				this._vh += (Math.random() < 0.5 ? -1 : 1) * (0.25 + 0.35 * Math.random()) * k;
				this._vp += (Math.random() - 0.5) * 0.5 * k; this._vr += (Math.random() - 0.5) * 0.35 * k;
			}
		}
		this._vh += (-260 * this.heave - 13 * this._vh) * h; this.heave += this._vh * h;
	}

	// Escurece na sombra de um prédio (suave, a ~4 consultas/s) — como o CarActor.
	update(dt) {
		this._shadeTimer -= dt;
		if (this._shadeTimer <= 0) {
			this._shadeTimer = 0.25;
			this._shadeTarget = typeof MapGeo !== 'undefined' && MapGeo.inShadow(this.x, this.z) ? 0.66 : 1;
		}
		if (this._shadeTarget === undefined || Math.abs(this._shadeTarget - this.shade) < 0.004) return;
		this.shade += (this._shadeTarget - this.shade) * Math.min(1, dt * 9);
	}

	// Escreve a instância `i` do modelo m: matriz (posição, rumo, escala; a base no chão = y − 1,5 — o y é o do sprite antigo) e os
	// atributos ia/ib/ic/dm (ver o shader), no mesmo deslocamento das matrizes (16 floats por instância nos dois buffers).
	_write(m, i) {
		const s = Math.sin(this.heading), c = Math.cos(this.heading), k = this.k, M = m.mat, o = i * 16;
		M[o] = c * k; M[o + 1] = 0; M[o + 2] = -s * k; M[o + 3] = 0;
		M[o + 4] = 0; M[o + 5] = k; M[o + 6] = 0; M[o + 7] = 0;
		M[o + 8] = s * k; M[o + 9] = 0; M[o + 10] = c * k; M[o + 11] = 0;
		M[o + 12] = this.x; M[o + 13] = this.y - 1.5; M[o + 14] = this.z; M[o + 15] = 1;
		const A = m.inst, L = this.lamps, d = m.dims;
		A[o] = this.spin; A[o + 1] = this.steer; A[o + 2] = this.pitch; A[o + 3] = this.roll;                       // ia
		A[o + 4] = this.heave / k; A[o + 5] = this.yaw; A[o + 6] = this.variant; A[o + 7] = this.dent;                  // ib
		A[o + 8] = this.shade; A[o + 9] = L.head; A[o + 10] = L.tail; A[o + 11] = L.bits + this.flatBits + this.glassBits;              // ic
		A[o + 12] = d[0]; A[o + 13] = d[1]; A[o + 14] = d[2]; A[o + 15] = d[3];                                       // dm
	}

	dispose() {
		if (this._disposed) return;
		this._disposed = true;
		CarArt3D.live.delete(this);
	}
}

if (CarArt3D.available()) CarArt3D.load();          // descomprime já durante a carga da página / menu
