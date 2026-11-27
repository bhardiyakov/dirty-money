// ============================================================================
// Spatial — controle de ESCOPO: o jogo só gasta CPU/GPU com o que está perto da câmera.
//
//   SpatialHash   grade de "chunks" (células quadradas) para consultas por vizinhança em O(itens próximos) em vez de O(todos).
//                 Reconstruída por quadro para coisas que se movem (obstáculos do trânsito) — sem lixo: os baldes são reaproveitados.
//
//   Zones         em que ZONA está um ponto, a partir do retângulo que a câmera mostra (+ margem):
//                   0 = ATIVA     (na tela + margem de 14 u): lógica e animação completas, todo quadro.
//                   1 = PRÓXIMA   (até ~2× a tela):            lógica a cada 3 quadros (veículos: 2), com o dt somado — nada pipoca
//                                                              ao entrar na tela.
//                   2 = SUSPENSA  (longe):                     "dorme": lógica a cada 8 quadros (~4 Hz; veículos: 5), só o suficiente
//                                                              para a posição andar e o minimapa acompanhar.
//                 every(entity, tier) diz se a entidade roda NESTE quadro (escalonado pelo id para espalhar a carga).
//                 asleep(x, z): fora da BOLHA ACORDADA (2× a visão máxima do zoom) — ali nada roda (ver Zones.asleep).
//
//   RenderCuller  particionamento espacial do RENDER. O Babylon, por padrão, avalia TODAS as malhas da cena a cada quadro
//                 (isReady, matriz, LOD, frustum…): ~1.100 malhas para desenhar ~150. Aqui as malhas ESTÁTICAS do mundo (matriz
//                 congelada: prédios, terreno, postes, sombras) vão para uma grade de 64 u na carga; a cada quadro o
//                 Babylon só recebe como candidatas as malhas das células que o retângulo da câmera (+ margem) toca (lista refeita só quando
//                 a câmera muda de célula) e as dinâmicas (carros, pessoas, efeitos) cujo nó raiz está dentro do retângulo.
// ============================================================================

class SpatialHash {
	constructor(cell = 16) {
		this.cell = cell;
		this.buckets = new Map();       // chave → array (reaproveitado entre quadros)
		this.used = [];                 // baldes com algo neste quadro
	}
	_key(i, j) { return (i + 4096) * 8192 + (j + 4096); }        // (cabe num inteiro pequeno do V8: a chave antiga passava de 2³¹ e cada Map.get ficava mais lento)
	clear() { for (const b of this.used) b.length = 0; this.used.length = 0; }
	insert(o, x, z) {
		if (!inWorld(x, z)) return;                                      // (fora do mundo: não entra na grade — ver inWorld)
		const k = this._key(Math.floor(x / this.cell), Math.floor(z / this.cell));
		let b = this.buckets.get(k);
		if (!b) this.buckets.set(k, b = []);
		if (!b.length) this.used.push(b);
		b.push(o);
	}
	// Tudo nas células que o círculo (x, z, r) toca (pode trazer um pouco a mais: quem chama ainda testa a distância).
	query(x, z, r, out) {
		out.length = 0;
		if (!inWorld(x, z)) return out;                                  // (posição infinita/gigante: o laço abaixo não terminaria)
		const c = this.cell, i0 = Math.floor((x - r) / c), i1 = Math.floor((x + r) / c), j0 = Math.floor((z - r) / c), j1 = Math.floor((z + r) / c);
		for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
			const b = this.buckets.get(this._key(i, j));
			if (b && b.length) for (let n = 0; n < b.length; n++) out.push(b[n]);
		}
		return out;
	}
}

const Zones = {
	cx: 0, cz: 0, hx: 60, hz: 40, frame: 0, margin: 14,
	count: [0, 0, 0],                // quantas entidades caíram em cada zona (último quadro; para o painel dev)
	_cnt: [0, 0, 0],

	// BOLHA ACORDADA: círculo FIXO de raio = 2× a meia-diagonal da maior visão possível (zoom todo afastado, Config.camera.maxView),
	// centrado na câmera. Fora dela o mundo DORME de verdade (asleep): carros sem IA nem física (corpo congelado no Havok), patrulha e
	// pedestres calmos sem lógica. O trânsito VIVE dentro dela: nasce entre a borda da tela no zoom máximo (sr) e a borda da bolha (ar)
	// e, ao sair, é reciclado para essa faixa (TrafficManager) — como no GTA. Não depende do zoom atual (dar zoom não acorda ninguém).
	ar: 139, sr: 76,
	asleep(x, z) { const dx = x - this.cx, dz = z - this.cz; return dx * dx + dz * dz > this.ar * this.ar; },

	update(game) {
		const cam = game.camera, eng = game.gameEngine.engine, asp = eng.getAspectRatio(cam.camera), g = cam.groundHalf(cam.view, asp);
		this.camera = cam.camera;
		this.cx = cam.focus.x; this.cz = cam.focus.z;                       // (the ground at the centre of the screen: a tilted camera sits far south of it)
		this.hz = g.z + this.margin;
		this.hx = g.x + this.margin;
		if (cam.yaw) this.hx = this.hz = Math.hypot(g.x, g.z) + this.margin;      // câmera girada (bússola): o quadrado que cobre a tela em qualquer ângulo
		const gm = cam.groundHalf(Config.camera.maxView, Math.max(1, asp), 0), hd = Math.hypot(gm.x, gm.z);      // meia-diagonal da tela no zoom máximo (da câmera alta: a bolha não encolhe na de perseguição — a pé, o alcance dela é curto)
		this.sr = hd + 6; this.ar = 2 * hd;
		if (cam.chase > 0) { const F = Config.camera.chase.far; this.sr = Math.max(this.sr, F + 6); this.ar = Math.max(this.ar, F + 70); }      // (perseguição: o trânsito nasce além da névoa)
		this.frame++;
		this.count = this._cnt.slice(); this._cnt[0] = this._cnt[1] = this._cnt[2] = 0;
	},
	tier(x, z) {
		const dx = Math.abs(x - this.cx), dz = Math.abs(z - this.cz);
		const t = dx <= this.hx && dz <= this.hz ? 0 : (dx <= this.hx * 2 + 30 && dz <= this.hz * 2 + 30 ? 1 : 2);
		this._cnt[t]++;
		return t;
	},
	// Ponto dentro do retângulo da tela ampliado em `pad` u (sem contar nas estatísticas)?
	near(x, z, pad = 0) { return Math.abs(x - this.cx) <= this.hx + pad && Math.abs(z - this.cz) <= this.hz + pad; },
	// A entidade (com id numérico) roda neste quadro? Zona 0 sempre; 1 a cada n1 quadros; 2 a cada n2 (veículos usam 2/5: a direção
	// por perseguição de rota precisa de correções mais frequentes do que a lógica de um pedestre).
	// n1/n2 são contados a 30 FPS: com teto maior (60 no app de PC) o intervalo cresce junto, e quem está fora da tela continua rodando
	// as mesmas vezes por SEGUNDO (senão a 60 FPS toda a lógica fora da tela custaria o dobro sem ninguém ver diferença).
	every(id, tier, n1 = 3, n2 = 8) {
		if (tier === 0) return true;
		const k = Config.perf.fpsCap > 30 ? Math.round(Config.perf.fpsCap / 30) : 1;
		return (this.frame + (id | 0)) % ((tier === 1 ? n1 : n2) * k) === 0;
	},
};

class RenderCuller {
	constructor(scene, cell = 64) {
		this.scene = scene;
		this.cell = cell;
		this.grid = new Map();
		this.staticSet = new Set();
		this.dynamic = [];
		this._dynDirty = true;
		this.cand = { data: [], length: 0 };
		this._range = '';
		this._stamp = 0;
		this.enabled = !location.search.includes('nocull');
		this.stats = { static: 0, dynamic: 0, candidates: 0 };
		this.filter = 2;
		this._tick = 0; this._full = false;
		scene.onNewMeshAddedObservable.add(() => { this._dynDirty = true; });
		scene.onMeshRemovedObservable.add((m) => {
			this._dynDirty = true;
			if (!this.staticSet.has(m)) return;
			this.staticSet.delete(m); this._range = '';
			// (as que entraram na grade depois da carga — pedaços de terreno que vêm e vão — saem dela: a grade não segura malha destruída)
			if (m._cullKeys) { for (const k of m._cullKeys) { const arr = this.grid.get(k), i = arr ? arr.indexOf(m) : -1; if (i >= 0) arr.splice(i, 1); } m._cullKeys = null; }
		});
	}

	_key(i, j) { return (i + 4096) * 8192 + (j + 4096); }        // (cabe num inteiro pequeno do V8: a chave antiga passava de 2³¹ e cada Map.get ficava mais lento)

	// Registra as malhas estáticas que existem agora (fim da carga). Malhas com alwaysSelectAsActiveMesh ou gigantes (mar, lotes de
	// brilho) ficam como dinâmicas: são candidatas sempre.
	build() {
		for (const m of this.scene.meshes) if (!this.staticSet.has(m)) this._insert(m, false);
		this._built = true;
		this._dynDirty = true; this._range = '';
		this.stats.static = this.staticSet.size;
		if (this.enabled && !this._hooked) {
			this._hooked = true;
			this.scene.getActiveMeshCandidates = () => this._candidates();
		}
	}

	// Malha parada (matriz congelada, sem esqueleto, nem gigante, nem "sempre ativa") → nas células da grade que a caixa dela cobre.
	// `late`: criada depois da carga (pedaços de terreno da mata, que vêm e vão com a distância): guarda as células para sair delas
	// ao ser destruída, e só entra sem pai (vértices em coordenadas de mundo — a caixa de agora vale para sempre) e se for do terreno
	// (terr_*) ou marcada `_cullGrid` (quem nunca mais se move: uma malha que descongela e anda depois ficaria presa às células velhas).
	_insert(m, late) {
		if (!m.isWorldMatrixFrozen || m.alwaysSelectAsActiveMesh || m.skeleton || (late && (m.parent || !(m._cullGrid || m.name.startsWith('terr_'))))) return false;
		const bb = m.getBoundingInfo().boundingBox, a = bb.minimumWorld, b = bb.maximumWorld;
		if (b.x - a.x > 2400 || b.z - a.z > 2400 || !Number.isFinite(a.x + a.z + b.x + b.z)) return false;
		const c = this.cell, keys = late ? [] : null;
		for (let i = Math.floor(a.x / c); i <= Math.floor(b.x / c); i++) for (let j = Math.floor(a.z / c); j <= Math.floor(b.z / c); j++) {
			const k = this._key(i, j);
			let arr = this.grid.get(k);
			if (!arr) this.grid.set(k, arr = []);
			arr.push(m);
			if (keys) keys.push(k);
		}
		m._cullStamp = 0; m._cullKeys = keys;
		this.staticSet.add(m);
		return true;
	}

	_candidates() {
		const sc = this.scene, cam = sc.activeCamera;
		if (!cam || !this.enabled) return { data: sc.meshes, length: sc.meshes.length };
		if (this._dynDirty) {
			this._dynDirty = false; this._full = false;
			this.dynamic.length = 0;
			// (malha nova já parada — o terreno que chega com a distância: ~500 na mata, 290 delas com mais de 40 u, que entravam SEMPRE —
			// vai para a grade; o resto é dinâmico)
			for (const m of sc.meshes) if (!this.staticSet.has(m) && !(this._built && !m.isDisposed() && this._insert(m, true))) this.dynamic.push(m);
			this.stats.static = this.staticSet.size;
			this._range = '';
		}
		// Retângulo visto: o do jogo (Zones, que já tem a margem) ou, num palco/câmera diferente, o tamanho do frustum na altura do chão.
		const game = cam === Zones.camera, px = game ? Zones.cx : cam.position.x, pz = game ? Zones.cz : cam.position.z, hz = Zones.hz + 6, hx = Zones.hx + 6;
		if (!inWorld(px, pz)) return { data: sc.meshes, length: sc.meshes.length };      // (câmera fora do mundo: o laço da grade não terminaria)
		const c = this.cell, i0 = Math.floor((px - hx) / c), i1 = Math.floor((px + hx) / c), j0 = Math.floor((pz - hz) / c), j1 = Math.floor((pz + hz) / c);
		const range = i0 + ',' + i1 + ',' + j0 + ',' + j1;
		// QUADROS DO MEIO (2 de cada 3): só refiltram a lista anterior (~150 a 200 malhas) em vez de varrer as ~600 dinâmicas e a área
		// de novo — medido, a varredura custava ~1 ms por quadro no Low (memória fria de centenas de malhas escondidas). Quem acabou de
		// aparecer entra em até 2 quadros (66 ms, e os bonecos já ligam com folga fora da tela); quem saiu do retângulo fica até 2 quadros
		// a mais (o frustum do Babylon descarta).
		this._tick = (this._tick + 1) | 0;
		if (this.filter >= 2 && this._tick % 3 !== 0 && range === this._range && this._full) {
			const out = this.cand.data;
			let k = 0;
			for (let i = 0; i < this.cand.length; i++) { const m = out[i]; if (m.isVisible && m.layerMask !== 0 && m.visibility > 0 && m.isEnabled()) out[k++] = m; }
			out.length = k; this.cand.length = k;
			return this.cand;
		}
		this._full = true;
		const area = this._area || (this._area = []);
		if (range !== this._range) {
			this._range = range;
			area.length = 0;
			const st = ++this._stamp;
			for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
				const arr = this.grid.get(this._key(i, j));
				if (!arr) continue;
				for (const m of arr) if (m._cullStamp !== st && !m.isDisposed()) { m._cullStamp = st; area.push(m); }
			}
		}
		// estáticas da área + dinâmicas cuja RAIZ (o nó que o jogo/física move) está no retângulo. Malha grande ou com vértices em
		// coordenadas de mundo (raio local > 40 u) e as marcadas alwaysSelectAsActiveMesh entram sempre. (Quem fica de fora não tem a
		// matriz recalculada pelo render, mas getAbsolutePosition() recalcula sob demanda: a IA continua lendo posições certas.)
		// ESCONDIDAS ficam de fora já aqui (desligada, invisível ou sem camada: o Babylon não as desenharia) — eram 400 a 650 das ~600 a
		// 1.000 candidatas no Low (bonecos fora da tela e guardados, pedaços de chão e mata cortados de longe, brilhos apagados), e cada
		// uma passava pela avaliação inteira do Babylon a cada quadro.
		const out = this.cand.data;
		out.length = 0;
		const F = this.filter;
		if (F >= 2) for (let i = 0; i < area.length; i++) { const m = area[i]; if (m.isVisible && m.layerMask !== 0 && m.visibility > 0 && m.isEnabled()) out.push(m); }
		else for (let i = 0; i < area.length; i++) out.push(area[i]);
		const pad = 8, X0 = px, Z0 = pz;
		for (const m of this.dynamic) {
			if (F >= 1 && (!m.isVisible || m.layerMask === 0 || !(m.visibility > 0) || !m.isEnabled())) continue;      // (isEnabled: com os pais — guardado em cache pelo Babylon)
			if (m.alwaysSelectAsActiveMesh || m._cullAlways) { out.push(m); continue; }
			let r = m._cullR;
			if (r === undefined) {
				const bi = m.getBoundingInfo && m.getBoundingInfo();
				r = m._cullR = bi ? bi.boundingSphere.radius * Math.max(Math.abs(m.scaling.x), Math.abs(m.scaling.z), 1) : 0;
				if (!bi || r > 40) { m._cullAlways = true; out.push(m); continue; }
			}
			// Malha parada (matriz congelada: pedaços do terreno criados depois da carga, com vértices em coordenadas de mundo e
			// posição 0,0,0) vale pelo centro da caixa. Pela posição, os pedaços pequenos (raio ≤ 40 u: ilhotas, pontas de costa)
			// ficavam "na origem" e nunca eram desenhados — o chão sumia e aparecia o mar por baixo das árvores.
			let q;
			if (m.isWorldMatrixFrozen && !m.parent) q = m._cullC || (m._cullC = m.getBoundingInfo().boundingBox.centerWorld.clone());
			else { let root = m; if (!m._cullOwn) while (root.parent) root = root.parent; q = root.position; }      // (_cullOwn: o pai só a sobe pelo relevo — SpriteActor)
			if (Math.abs(q.x - X0) <= hx + r + pad && Math.abs(q.z - Z0) <= hz + r + pad) out.push(m);
		}
		this.cand.length = out.length;
		this.stats.dynamic = this.dynamic.length; this.stats.candidates = out.length;
		return this.cand;
	}
}
