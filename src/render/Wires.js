// ============================================================================
// Wires — a FIAÇÃO (postes da rua, o gato da favela, fios cruzando os becos, varais) como FITAS contínuas.
//
// Antes cada fio era uma corrente de tubinhos de 1,5–2 cm de raio: de longe ficavam mais finos que um pixel e a imagem os "quebrava"
// em tracejado (o fio aparecia e sumia em pedaços), e cada gomo era um prisma girado de um jeito, com fresta na emenda.
// Agora cada fio é UMA tira de pontos ao longo da curva (a barriga em parábola), com os dois lados no mesmo ponto: o shader
// (WirePlugin, no StandardMaterial — a mesma luz, sombra e névoa de tudo) abre a tira NA TELA, de lado à direção do fio, com a
// largura real dele ou, se ela der menos que `minPx` pixels, com minPx — e então o fio fica mais claro na proporção (a cobertura de
// verdade), em vez de sumir. Contínuo de ponta a ponta, sem emenda, em qualquer distância e zoom.
// Montagem: RoadArt.wire (durante o WorldBuilder) entrega o fio aqui (add) com as alturas que o lote daria (âncora ou relevo); no fim,
// build() faz uma malha por pedaço do mapa (o recorte por câmera continua valendo). Fora da montagem, RoadArt.wire faz os tubos.
// ============================================================================

const Wires = {
	collecting: false,
	minPx: 1.3,                  // largura mínima na tela (px)
	_list: [],

	begin() { this.collecting = true; this._list = []; },

	// Um fio de p a q com a barriga `sag` (m), cor e raio. As alturas seguem a regra do lote que o receberia: com MeshBatch.anchor
	// a peça sobe `anchor.h` inteira; sem âncora, cada ponto sobe a altura do chão embaixo dele.
	add(p, q, sag, color, r, n) {
		const A = MeshBatch.anchor, rel = !A && typeof Relief !== 'undefined' && Relief.on;
		const L = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
		const N = Math.max(n || 6, Math.min(16, Math.ceil(L / 1.2)));       // (mais pontos nos vãos longos: a curva lisa)
		const pts = [];
		for (let k = 0; k <= N; k++) {
			const t = k / N, x = p[0] + (q[0] - p[0]) * t, z = p[2] + (q[2] - p[2]) * t;
			let y = p[1] + (q[1] - p[1]) * t - sag * 4 * t * (1 - t);
			y += A ? A.h : rel ? Relief.at(x, z) : 0;
			pts.push(x, y, z);
		}
		this._list.push({ pts, color, r });
	},

	// As malhas: uma por pedaço (Config.world.trimChunk), pelo meio de cada fio.
	build(W) {
		this.collecting = false;
		const L = this._list;
		this._list = [];
		if (!L.length) return;
		const C = Config.world.trimChunk || 64, groups = new Map();
		for (const w of L) {
			const m = (w.pts.length / 3) >> 1, k = Math.floor(w.pts[m * 3] / C) + ',' + Math.floor(w.pts[m * 3 + 2] / C);
			let g = groups.get(k);
			if (!g) groups.set(k, g = []);
			g.push(w);
		}
		const mat = this.material(W.scene);
		for (const [k, list] of groups) {
			let nv = 0, ni = 0;
			for (const w of list) { const n = w.pts.length / 3; nv += n * 2; ni += (n - 1) * 6; }
			const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 4), tan = new Float32Array(nv * 3), side = new Float32Array(nv * 2);
			const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
			let v = 0, i = 0;
			for (const w of list) {
				const P = w.pts, n = P.length / 3, base = v;
				for (let j = 0; j < n; j++) {
					const a = Math.max(0, j - 1), b = Math.min(n - 1, j + 1);
					let tx = P[b * 3] - P[a * 3], ty = P[b * 3 + 1] - P[a * 3 + 1], tz = P[b * 3 + 2] - P[a * 3 + 2];
					const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
					for (let s = 0; s < 2; s++, v++) {
						pos[v * 3] = P[j * 3]; pos[v * 3 + 1] = P[j * 3 + 1]; pos[v * 3 + 2] = P[j * 3 + 2];
						nor[v * 3 + 1] = 1;
						col[v * 4] = w.color[0]; col[v * 4 + 1] = w.color[1]; col[v * 4 + 2] = w.color[2]; col[v * 4 + 3] = 1;
						tan[v * 3] = tx; tan[v * 3 + 1] = ty; tan[v * 3 + 2] = tz;
						side[v * 2] = s ? 1 : -1; side[v * 2 + 1] = w.r;
					}
				}
				for (let j = 0; j + 1 < n; j++) {
					const a = base + j * 2;
					idx[i++] = a; idx[i++] = a + 1; idx[i++] = a + 2;
					idx[i++] = a + 1; idx[i++] = a + 3; idx[i++] = a + 2;
				}
			}
			const mesh = new BABYLON.Mesh('wires@' + k, W.scene), vd = new BABYLON.VertexData();
			vd.positions = pos; vd.normals = nor; vd.colors = col; vd.indices = idx;
			vd.applyToMesh(mesh);
			mesh.setVerticesData('wtan', tan, false, 3);
			mesh.setVerticesData('wside', side, false, 2);
			mesh.material = mat; mesh.useVertexColors = true; mesh.isPickable = false; mesh.receiveShadows = true;
			mesh.alwaysSelectAsActiveMesh = false;
			mesh.freezeWorldMatrix();
			W.meshes.push(mesh);
		}
		console.log(`[FIAÇÃO] ${L.length} fios em ${groups.size} malhas (fitas na tela, mínimo ${this.minPx} px)`);
	},

	material(scene) {
		if (this._mat && this._mat.getScene() === scene) return this._mat;
		const m = this._mat = new BABYLON.StandardMaterial('wires', scene);
		m.specularColor = BABYLON.Color3.Black();
		m.backFaceCulling = false;
		m.alpha = 0.999;                                  // (fila dos transparentes: o fio fino clareia em vez de sumir)
		new (this._plugin())(m);
		return m;
	},

	_plugin() {
		if (this._cls) return this._cls;
		const S = this;
		return (this._cls = class WirePlugin extends BABYLON.MaterialPluginBase {
			constructor(material) { super(material, 'Wire', 310, { WIRE: false }); this._enable(true); }
			getClassName() { return 'WirePlugin'; }
			prepareDefines(defines) { defines.WIRE = true; }
			getAttributes(attributes) { attributes.push('wtan', 'wside'); }
			getUniforms() { return { ubo: [{ name: 'wireView', size: 4, type: 'vec4' }], vertex: 'uniform vec4 wireView;' }; }
			bindForSubMesh(ub, scene, engine) {
				const cam = scene.activeCamera, P = cam ? cam.getProjectionMatrix().m : null;
				ub.updateFloat4('wireView', engine.getRenderWidth(), engine.getRenderHeight(), S.minPx, P ? P[5] : 1);
			}
			getCustomCode(type) {
				// (sem ponto e vírgula em comentário GLSL: o Babylon corta a linha ali)
				if (type === 'vertex') return {
					CUSTOM_VERTEX_DEFINITIONS: `
						#ifdef WIRE
						attribute vec3 wtan;
						attribute vec2 wside;
						varying float vWireA;
						#endif`,
					CUSTOM_VERTEX_MAIN_END: `
						#ifdef WIRE
						vWireA = 1.0;
						vec4 wa = gl_Position;
						if (wa.w > 0.0) {
							vec4 wb = viewProjection * vec4(worldPos.xyz + wtan * 0.5, 1.0);
							vec2 wd = (wb.xy / max(wb.w, 0.0001) - wa.xy / wa.w) * wireView.xy;
							float wl = length(wd);
							wd = wl > 0.00001 ? wd / wl : vec2(1.0, 0.0);
							float truePx = wside.y * wireView.w / wa.w * wireView.y;
							float px = max(truePx, wireView.z);
							vWireA = clamp(truePx / wireView.z, 0.4, 1.0);
							gl_Position.xy += vec2(-wd.y, wd.x) * wside.x * px / wireView.xy * wa.w;
						}
						#endif`,
				};
				if (type === 'fragment') return {
					CUSTOM_FRAGMENT_DEFINITIONS: `
						#ifdef WIRE
						varying float vWireA;
						#endif`,
					CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
						#ifdef WIRE
						color.a = vWireA;
						#endif`,
				};
				return null;
			}
		});
	},
};
