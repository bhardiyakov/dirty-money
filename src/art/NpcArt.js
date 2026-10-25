// ============================================================================
// NpcArt — os personagens 2,5D (o pacote de NPCs: civis, PM, BOPE, Exército, traficantes e o protagonista) no jogo.
//
// Os desenhos vêm de atlas PRONTOS, gerados no build (tools/asset_baker/bake.cjs — o gerador procedural não roda no jogo): 16 direções
// por quadro, vistos do alto a 56° (não giram: cada direção tem o seu desenho). Cada pixel guarda 2 bytes — formato 2 (sombreado contínuo, "pré-
// renderizado"): o MATERIAL (× 8 + nível de água) e a LUZ (0–204 anda pela rampa de 5 tons do material; acima, o brilho especular;
// os 2 bits baixos da luz = cobertura do pixel de borda: a silhueta sai suavizada, como um render 3D, sem contorno preto);
// cores fixas (sombra, contorno, clarão…) guardam o código e o alfa. (Formato 1, o do pacote: código = material × 8 + tom, e o alfa.)
// A cor vem da PALETA (uma linha por variante): o mesmo desenho vira dezenas de pessoas diferentes (pele, cabelo, roupa) e a roupa
// do jogador muda de cor na hora. A sombra de contato já vem desenhada; debaixo d'água o corpo é tingido de azul.
//
// ATLAS PAGINADO: assets/baked/npcs/<tipo>.json (lido na abertura: boot) é só o MANIFESTO — clipes, retângulos e em que página mora
// cada direção de cada clipe (pd). Os pixels ficam nas PÁGINAS assets/baked/npcs/<tipo>/p<i>.webp (WebP sem perdas: R e G = os 2 bytes
// do pixel), cada uma com um GRUPO de clipes (hot = parado/andar/correr/mirar…, act, fall, water, car, gym, arm — as armas dos civis) e uma PARIDADE de direção
// (0 = as pares — e todas as de um clipe de até 8 direções —, 1 = as ímpares): o quadro e o próximo (mistura) estão na mesma textura.
// Os dados que não são desenho (tipos, variantes, paletas) vêm de assets/baked/npc-data.json (NpcData).
//   • Na carga da página só o protagonista é decodificado (pares primeiro); o resto vem quando um ator precisa: Worker busca e
//     decodifica o WebP (AtlasDecoder) → textura enviada à GPU em faixas, com orçamento por quadro
//     (Config.art.uploadMB; na carga e no menu, sem orçamento) → material da página. Fila com prioridade: o que um
//     ator NA TELA precisa agora > hot par > hot ímpar > outros grupos par > ímpar; até 2 decodificações ao mesmo tempo.
//   • Página que ainda não chegou: o ator segue mostrando o último quadro desenhado (ou a direção vizinha, se a página dela já está
//     pronta); ator novo sem nada desenhado fica escondido até a página chegar (SpriteActor._npcDraw).
//   • DANO pintado (sujo, machucado, muito machucado): atlas "<tipo>#d<n>" com os clipes com dano do manifesto, nos MESMOS retângulos
//     da base; cada página = a página base + a camada de dano do nível (d<n>p<i>.webp, quase vazia), juntadas na decodificação.
//   • Memória: passou do orçamento (Config.art.vramMB), as páginas sem uso há 15 s saem da GPU (as menos usadas primeiro) e voltam
//     sozinhas quando pedidas de novo; atlas de dano sem uso há 30 s saem inteiros (voltam dos arquivos). Os atlas que o jogador
//     usa agora ficam presos.
//   • Perfil leve (Config.art.npcDirs = 8): só as páginas pares (o SpriteActor só escolhe direções pares) e os visuais montados no
//     guarda-roupa já saem com 8 direções.
//   • Sem os arquivos (aberto por file://, rede fora) ou com ?npc=0: os bonecos antigos (CharacterSheet).
//
//   NpcArt.sheet(tipo)            folha de um tipo (getClip como a CharacterSheet) — o SpriteActor toca os clipes dela
//   NpcArt.row(tipo, variante)    linha da paleta de uma variante (a cor das roupas)
//   NpcArt.pick(grupo, semente)   { tipo, linha } de alguém de um lugar/papel (casual, biz, poor, beach, police, swat, gang1…)
//   NpcArt.remap(folha, var, nome) troca o boneco antigo (civA/civB/police/swat/army + variante de cor) por um tipo novo
//   NpcArt.mem()                  páginas na GPU, MB, fila… (testes / painel)
//
// Quadro (atributo `fr` do quad): 3 números = (x,y) e (w,h) do retângulo NA PÁGINA e o canto superior esquerdo relativo aos pés.
// ============================================================================

const NpcArt = {
	atlases: {},                   // id → atlas { id, data (metadata), pages, file (pages can be reloaded — a file or a stored Blob: they may leave the GPU), dmg, cache, gen }
	sheets: {},                    // id → NpcSheet
	ready: null,                   // Promise: as páginas do dia a dia (hot) do protagonista prontas (o resto chega sob demanda)
	ROWS: 384,                     // linhas da paleta (variantes); 0 = jogador
	_rows: new Map(),              // chave → linha
	_nextRow: 1,
	sharp: 1,
	BASE: './assets/baked/npcs/',
	HERO: ['protagonista', 'protagonista_tatico', 'protagonista_armas'],
	now: 0,                        // relógio do jogo (s; NpcArt.tick): última vez que cada página foi desenhada (LRU)
	stats: { decoded: 0, decodeMs: 0, uploads: 0, upMB: 0, upMs: 0, upMax: 0, evicted: 0, dropped: 0, failed: 0 },      // (up*: envio em faixas — _upStep)

	// (?npc=0 na URL: volta aos bonecos antigos — comparar/depurar)
	available() { return NpcData.ok && Object.keys(this.atlases).length > 0 && !/[?&]npc=0\b/.test(location.search); },

	// Direções desenhadas (16; perfil leve: 8 — só as páginas pares) e o orçamento de memória de vídeo das páginas.
	get dirs() { return (typeof Config !== 'undefined' && Config.art && Config.art.npcDirs) || 16; },
	get lite() { return this.dirs <= 8; },
	budget() { return ((typeof Config !== 'undefined' && Config.art && Config.art.vramMB) || 640) * 1048576; },

	// ------------------------------------------------------------------ manifestos e páginas
	// ABERTURA (main.js espera isto antes de montar o mundo): npc-data.json (NpcData) e os manifestos de todos os tipos, em paralelo; aí
	// a fila das páginas do protagonista (load). false = sem os atlas prontos (file://, rede fora, ?npc=0): os bonecos antigos.
	boot() {
		if (this._boot) return this._boot;
		return (this._boot = (async () => {
			if (/[?&]npc=0\b/.test(location.search)) return false;
			try { if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase('dirty-money-hd'); } catch (e) { /* (o cache dos machucados gerados no jogo, que não existe mais) */ }
			const d = await NpcData.load();
			const got = await Promise.all(d.atlases.map((id) => AssetIO.json(this.BASE + id + '.json')));
			got.forEach((m, i) => { if (m && !this.atlases[d.atlases[i]]) this._fromManifest(d.atlases[i], m); });
			if (!Object.keys(this.atlases).length) throw new Error('nenhum manifesto em ' + this.BASE);
			this.load();
			return true;
		})().catch((e) => { console.warn('[NPCS] atlas prontos indisponíveis — bonecos antigos:', (e && e.message) || e); return false; }));
	},
	// Põe na fila as páginas do protagonista (pares primeiro). (Os manifestos já foram lidos: boot.)
	load() {
		if (this.ready) return this.ready;
		const t0 = performance.now();
		const hero = this.HERO.map((id) => this.atlases[id]).filter(Boolean);
		for (const par of [0, 1]) for (const A of hero) for (const P of A.pages) if (P.par === par) this._want(P);
		const M = this.atlases.protagonista, hot = M ? M.pages.filter((P) => P.g === 'hot' && this._dirOk(P)) : [];
		this.ready = Promise.all(hot.map((P) => this._wait(P))).then(() => {
			this._upNow();                                                  // (ainda na tela de carregamento: o protagonista já sobe inteiro para a GPU)
			let n = 0, px = 0; for (const A of Object.values(this.atlases)) for (const P of A.pages) { n++; px += P.w * P.h; }
			console.log(`[NPCS] ${Object.keys(this.atlases).length} atlas, ${n} páginas (${Math.round(px * 2 / 1048576)} MB se todas carregassem); protagonista pronto em ${Math.round(performance.now() - t0)} ms`);
		});
		return this.ready;
	},
	_fromManifest(id, d) {
		const pages = d.pages.map((p) => ({ w: p.w, h: p.h, g: p.g || 'hot', par: p.par || 0, file: p.file, bytes: p.bytes || 0 }));
		const A = this._atlas(id, { clips: d.clips, k: d.k, v: d.v, frame: d.frame }, pages, true);
		A.dmgInfo = d.dmg || null;                                          // { clips, levels: { n: { página: camada } } } — dmgAtlas
		if (d.scale > 0) A.scale = d.scale;
		return A;
	},
	_atlas(id, data, pages, file) {
		// (gen: um número por atlas criado — o mesmo id recriado, como o dano que saiu da memória e voltou, é outro: SpriteActor.update refaz o clipe)
		const A = { id, data, pages, file, gen: (this._genSeq = (this._genSeq || 0) + 1), cache: null, dmg: /#d\d+$/.test(id), born: this.now, hot: false, carClip: null };
		pages.forEach((P, i) => { P.A = A; P.i = i; P.st = P.px ? 'ready' : 'idle'; P.used = 0; P.pri = 9; P.seq = 0; P.tex = null; P.mat = null; });
		this.atlases[id] = A;
		return A;
	},
	_dirOk(P) { return !(P.par && this.lite); },
	_pri(P) { return (P.g === 'hot' ? 1 : 3) + (P.par ? 1 : 0); },

	// Pede a página P. pri: 0 = um ator NA TELA precisa dela agora; sem pri, a do grupo (hot par 1, ímpar 2; outros 3/4). true = já na GPU.
	want(P, pri) { return this._want(P, pri); },
	_q: [], _seq: 0, _decoding: 0, _res: 0, _live: new Set(), _waiters: new Set(),
	STORED_FAILS: 3,               // failures of a stored-look page before onStoredFailed(atlas id) gives up on it (PlayerLook)
	onStoredFailed: null,
	DECODERS: 3,                   // páginas sendo buscadas + decodificadas ao mesmo tempo (AtlasDecoder: 2 Workers)
	_want(P, pri = this._pri(P)) {
		if (P.tex) return true;
		if (P.px) { if (this._scene) this._upload(P, pri); return !!P.tex; }       // (sobe em faixas: pronta numa das próximas vezes — _upStep)
		if (P.dead || P.unused || !this._dirOk(P)) return false;
		if (pri === 0 && this._pins().includes(P.A.id)) pri = -10;           // (the page the player shows right now decodes ahead of everyone; prefetch keeps its place)
		if (P.st === 'idle' || (P.st === 'failed' && performance.now() >= P.retry)) { P.st = 'queued'; P.pri = pri; P.seq = ++this._seq; this._q.push(P); this._pump(); }
		else if (pri < P.pri && P.st === 'queued') P.pri = pri;
		return false;
	},
	// Um ator começou a tocar `c`: as páginas do clipe para a fila (a da direção atual já vem pedida pelo desenho, com a prioridade dele).
	wantClip(c) { for (let i = 0; i < c.pd.length; i++) if (i === 0 || c.pd[i] !== c.pd[i - 1]) this._want(c.pages[c.pd[i]]); },
	// buscar + decodificar (AtlasDecoder, num Worker) — até DECODERS ao mesmo tempo, pela prioridade
	_pump() { while (this._decoding < this.DECODERS && this._q.length) this._decode(this._pop(this._q)); },
	_pop(L) { let k = 0; for (let i = 1; i < L.length; i++) if (L[i].pri < L[k].pri || (L[i].pri === L[k].pri && L[i].seq < L[k].seq)) k = i; return L.splice(k, 1)[0]; },
	async _decode(P) {
		P.st = 'decoding'; this._decoding++;
		const t0 = performance.now();
		try {
			const img = P.blob ? await this._fromBlob(P) : await AtlasDecoder.rg(this.BASE + P.file, P.ov ? this.BASE + P.ov : null);      // (damage page: base + the level's layer)
			if (img.w !== P.w || img.h !== P.h) throw new Error(`página ${P.i}: ${img.w}×${img.h}, esperado ${P.w}×${P.h}`);
			this.stats.decoded++; this.stats.decodeMs += performance.now() - t0;
			if (!P.dead) { P.px = img.data; P.st = 'ready'; P.fails = 0; if (this._scene) this._upload(P, P.pri); }
		} catch (e) { this._fail(P, e); }
		this._decoding--;
		this._wake(P);
		this._pump();
	},
	// Page of a wardrobe look (LookStore): a PNG decoded in the Worker like the baked pages, or raw RG bytes (just read, no pixel work).
	async _fromBlob(P) {
		if (P.blob.type !== LookStore.RAW_TYPE) return AtlasDecoder.rg(P.blob);
		return { w: P.w, h: P.h, data: new Uint8Array(await P.blob.arrayBuffer()) };
	},
	_fail(P, e) {
		P.st = 'failed'; P.fails = (P.fails || 0) + 1;
		P.retry = performance.now() + Math.min(60000, 4000 * P.fails);                // (tenta de novo mais tarde, cada vez mais espaçado — a rede pode voltar)
		this.stats.failed++;
		console.warn(`[NPCS] página ${P.i} de ${P.A.id} falhou:`, (e && e.message) || e);
		if (P.blob && P.fails === this.STORED_FAILS && this.onStoredFailed) this.onStoredFailed(P.A.id);     // (a stored look that cannot be read: PlayerLook drops it)
		this._wake(P);
	},
	_wait(P) { return P.px || P.tex || P.st === 'failed' ? Promise.resolve() : new Promise((ok) => (P.waiters || (P.waiters = [])).push(ok)); },
	_wake(P) { if (P.waiters) { const w = P.waiters; P.waiters = null; for (const f of w) f(); } },

	// ENVIO À GPU EM FAIXAS. Página decodificada → textura RG8 (WebGL2) / LUMINANCE_ALPHA (WebGL1)
	// criada VAZIA e preenchida em faixas horizontais (texSubImage2D) com um orçamento por quadro (Config.art.uploadMB e no máximo UP_MS
	// de envio): a página inteira (até 4096×1720×2 B = 14 MB) num texImage2D só travava o quadro por centenas de ms — até segundos —
	// quando um tipo novo aparecia. Só depois da última faixa ela fica PRONTA (P.tex: o SpriteActor passa a usá-la; material; quem
	// esperava tenta desenhar de novo). A fila vai pela prioridade de _want (o que um ator NA TELA precisa agora primeiro) e a faixa
	// seguinte pode ser de outra página (a que chegou mais urgente passa na frente). Tela de carregamento / menu (nenhum quadro de jogo a
	// proteger): sem orçamento (UP_FREE por vez); sem quadro nenhum (carregando), um temporizador toca a fila.
	UP_MS: 4, UP_FREE: 64 * 1048576, UP_STRIP: 4 * 1048576,          // (faixa de no máximo 4 MB, mesmo sem orçamento: o menu segue respondendo)
	_upQ: [], _upLeft: 0, _upMsLeft: 0, _upBusy: false, _upGame: false, _upFrameT: -1e9, _upTimer: 0, _zombies: [],
	upBudget() { return ((typeof Config !== 'undefined' && Config.art && Config.art.uploadMB) || 3) * 1048576; },
	_upload(P, pri = this._pri(P)) {
		if (P.tex || !P.px || P.dead || !this._scene) return;
		if (pri >= 0 && this._pins().includes(P.A.id)) pri -= 10;           // (o jogador na frente de todos — e, entre as dele, a da direção na tela primeiro)
		if (P.up) { if (pri < P.pri) P.pri = pri; }
		else { P.up = { tex: null, y: 0 }; P.st = 'uploading'; P.pri = pri; P.seq = ++this._seq; this._upQ.push(P); }
		this._upStep();                                                     // (o que sobrou do orçamento deste quadro)
		if (this._upQ.length) this._upKick();
	},
	// Envia faixas enquanto houver orçamento (_upLeft bytes, _upMsLeft ms — repostos a cada quadro: _upFrame). O estado do GL que mexe
	// passa pelo motor (textura ligada, FLIP_Y) ou volta como estava (UNPACK_ALIGNMENT).
	_upStep() {
		if (this._upBusy || !this._upQ.length || this._upLeft <= 0 || this._upMsLeft <= 0 || !this._scene) return;
		const eng = this._scene.getEngine(), gl = eng._gl, L = this._upQ, done = [], t0 = performance.now();
		const F = this._gl2 ? BABYLON.Constants.TEXTUREFORMAT_RG : BABYLON.Constants.TEXTUREFORMAT_LUMINANCE_ALPHA, UB = BABYLON.Constants.TEXTURETYPE_UNSIGNED_BYTE;
		const fmt = eng._getInternalFormat(F), type = eng._getWebGLTextureType(UB);
		this._upBusy = true;
		let al = 0;
		try {
			al = gl.getParameter(gl.UNPACK_ALIGNMENT);
			while (L.length && this._upLeft > 0 && performance.now() - t0 < this._upMsLeft) {
				let k = 0;
				for (let i = 1; i < L.length; i++) if (L[i].pri < L[k].pri || (L[i].pri === L[k].pri && L[i].seq < L[k].seq)) k = i;
				const P = L[k], U = P.up, row = P.w * 2;
				if (!U.tex) {                                               // (a textura nasce vazia, no formato e amostragem de sempre — e já conta na memória)
					U.tex = new BABYLON.RawTexture(null, P.w, P.h, F, this._scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE, UB);
					U.tex.wrapU = U.tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
					this._res += P.w * P.h * 2;
				}
				const n = Math.min(P.h - U.y, Math.max(16, Math.floor(Math.min(this._upLeft, this.UP_STRIP) / row)));
				eng._bindTextureDirectly(gl.TEXTURE_2D, U.tex.getInternalTexture(), true);
				eng._unpackFlipY(false);
				gl.pixelStorei(gl.UNPACK_ALIGNMENT, 2);                     // (linhas de 2 B/px: alinhadas a 2 em qualquer largura)
				gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, U.y, P.w, n, fmt, type, P.px.subarray(U.y * row, (U.y + n) * row));
				U.y += n; this._upLeft -= n * row; this.stats.upMB += n * row / 1048576;
				if (U.y >= P.h) { L.splice(k, 1); done.push(P); }
			}
		} finally {
			eng._bindTextureDirectly(gl.TEXTURE_2D, null);
			if (al) gl.pixelStorei(gl.UNPACK_ALIGNMENT, al);
			const ms = performance.now() - t0;
			this._upMsLeft -= ms; this.stats.upMs += ms; if (this._upGame && ms > this.stats.upMax) this.stats.upMax = ms;     // (upMax: só em quadros de jogo)
			this._upBusy = false;
		}
		for (const P of done) this._upDone(P);
	},
	// Última faixa: a página está na GPU.
	_upDone(P) {
		P.tex = P.up.tex; P.up = null; P.px = null; P.st = 'ready'; P.used = this.now;
		this._live.add(P); this.stats.uploads++;
		this._bind(P);
		if (this._waiters.size) for (const a of [...this._waiters]) a._pageReady(P);
	},
	// Página que saiu (dropAtlas) ou cena nova no meio do envio: para limpo (a textura incompleta sai e deixa de contar).
	_upCancel(P) {
		const U = P.up;
		if (!U) return;
		P.up = null;
		const i = this._upQ.indexOf(P);
		if (i >= 0) this._upQ.splice(i, 1);
		if (U.tex) { U.tex.dispose(); this._res -= P.w * P.h * 2; }
	},
	// Começo de cada quadro do motor: repõe o orçamento e envia. (Quem pede no meio do quadro usa o que sobrou: _upload.)
	// (Quadros lentos — aparelho fraco a 10–20 quadros/s —: o orçamento cresce com a duração MÉDIA do quadro, até 3×, para a vazão não
	// despencar junto — os pedestres não ficam muitos segundos escondidos esperando a página; a fração do quadro gasta em envio fica a
	// mesma. Um quadro lento isolado quase não mexe na média.)
	_upDt: 33.3,
	_upFrame() {
		const t = performance.now();
		this._upDt += (Math.min(250, Math.max(0, t - this._upFrameT)) - this._upDt) * 0.1;
		this._upFrameT = t;
		const k = Math.min(3, Math.max(1, this._upDt / 33.3));
		const free = this._upQ.length > 0 && this._upFree();
		this._upLeft = free ? this.UP_FREE : this.upBudget() * k;
		this._upMsLeft = free ? 50 : this.UP_MS * k; this._upGame = !free;
		if (this._upQ.length) this._upStep();
	},
	// A fila inteira, já, se nada está sendo jogado (o protagonista no fim da carga: NpcArt.ready).
	_upNow() {
		if (!this._upQ.length || !this._upFree()) return;
		this._upLeft = this._upMsLeft = Infinity; this._upGame = false;
		this._upStep();
		this._upLeft = this._upMsLeft = 0;                                  // (o próximo quadro repõe)
	},
	// Sem quadro de jogo a proteger: carregando (o mundo ainda não apareceu), menu inicial ou de pausa aberto.
	_upFree() {
		if (typeof window === 'undefined') return true;
		const g = window.game, mm = window.mainMenu;
		return !g || !g._loadingHidden || !!(mm && !mm.started) || !!(g.menu && g.menu.isOpen);
	},
	// Sem o laço do motor (a carga e o menu inicial, antes de o jogo começar): um temporizador envia sem orçamento. (Com o laço rodando,
	// só os quadros enviam — um quadro lento num aparelho fraco não vira brecha para enviar tudo de uma vez.)
	_upKick() {
		if (this._upTimer || typeof setTimeout !== 'function') return;
		this._upTimer = setTimeout(() => {
			this._upTimer = 0;
			if (!this._upQ.length || !this._scene) return;
			const loops = this._scene.getEngine().activeRenderLoops;
			if (loops ? !loops.length : performance.now() - this._upFrameT > 1000) { this._upLeft = this.UP_FREE; this._upMsLeft = 50; this._upGame = false; this._upStep(); }
			if (this._upQ.length) this._upKick();
		}, 40);
	},
	// Tira a página da GPU (o material fica, com uma textura vazia: quem ainda aponta para ele não quebra) — volta quando pedida.
	_evict(P) {
		if (!P.tex) return;
		P.tex.dispose(); P.tex = null; P.st = 'idle'; P.pri = 9;                    // (volta a ser pedida com a prioridade de quem pedir)
		if (P.mat) P.mat.setTexture('atlas', this._emptyTex());
		this._res -= P.w * P.h * 2; this._live.delete(P); this.stats.evicted++;
	},
	_emptyTex() {
		if (this._empty) return this._empty;
		this._empty = new BABYLON.RawTexture(new Uint8Array(4), 1, 1, this._gl2 ? BABYLON.Constants.TEXTUREFORMAT_RG : BABYLON.Constants.TEXTUREFORMAT_LUMINANCE_ALPHA, this._scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE, BABYLON.Constants.TEXTURETYPE_UNSIGNED_BYTE);
		return this._empty;
	},
	// A cada ~2 s (tick): atlas de dano sem uso há 30 s saem inteiros; passou do orçamento, saem as páginas sem uso há 15 s (LRU).
	// Presos: os atlas que o jogador usa AGORA (o visual pronto ou o gerado, o tático e o das armas — com um visual gerado, o pronto
	// pode sair). Quem está na tela conta como uso (mesmo sem update todo quadro) e, desenhando uma página que saiu, pede de volta.
	_lru() {
		const now = this.now;
		if (typeof SpriteActor !== 'undefined') for (const a of SpriteActor.live) {
			const P = a._pg;
			if (!P || !a.clip || !a.clip.npc || !a.mesh || a.mesh.isDisposed() || !a._onScreen()) continue;
			if (P.tex) P.used = now; else if (!P.dead) a._applyUV();
		}
		const pin = this._pins();
		for (const A of Object.values(this.atlases)) {
			if (!A.dmg || pin.includes(A.id)) continue;                     // (o dano do jogador fica enquanto ele estiver machucado)
			let u = A.born; for (const P of A.pages) if (P.used > u) u = P.used;
			if (now - u >= 30) { this.dropAtlas(A.id); this.stats.dropped++; }
		}
		const B = this.budget();
		if (this._res <= B) return;
		const L = [...this._live].filter((P) => P.A.file && !P.dead && !pin.includes(P.A.id) && now - P.used >= 15).sort((a, b) => a.used - b.used);
		for (const P of L) { if (this._res <= B) break; this._evict(P); }
	},
	// Os atlas que o jogador usa AGORA (presos na GPU — _lru; na fila de envio, na frente — _upload).
	_pins() { const h = this._lib && this._lib.sheets.hero; return h ? h.pinned || h.atlasList() : this.HERO; },
	// Memória (testes / painel dev).
	mem() {
		let pages = 0, live = 0, cpu = 0; const by = {};
		for (const A of Object.values(this.atlases)) for (const P of A.pages) { pages++; if (P.tex) { live++; by[A.id] = (by[A.id] || 0) + 1; } if (P.px) cpu += P.px.byteLength; }
		let upMB = 0; for (const P of this._upQ) upMB += (P.h - P.up.y) * P.w * 2 / 1048576;
		return Object.assign({ pages, live, texMB: Math.round(this._res / 1048576), budgetMB: Math.round(this.budget() / 1048576), cpuMB: Math.round(cpu / 1048576), queued: this._q.length + this._decoding + this._upQ.length,
			uploading: this._upQ.length, upLeftMB: Math.round(upMB), zombies: this._zombies.length, byAtlas: by }, this.stats);
	},

	// ------------------------------------------------------------------ GPU
	init(scene) {
		if (this._scene === scene) return;
		this._scene = scene;
		this._gl2 = scene.getEngine().webGLVersion >= 2;
		this._empty = null;
		this._palette();
		this._register();
		for (const A of Object.values(this.atlases)) if (A.live) this.dropAtlas(A.id);      // (a look being drawn: only on the old scene's GPU — Wardrobe starts it again)
		for (const A of Object.values(this.atlases)) for (const P of A.pages) {
			if (P.up) { P.up = null; P.st = 'ready'; }                     // (envio pela metade na cena antiga: recomeça nesta — os pixels ainda estão em P.px)
			if (P.tex || P.mat) { P.tex = null; P.mat = P.sil = null; if (A.file && P.st === 'ready' && !P.px) P.st = 'idle'; }
		}
		this._live.clear(); this._res = 0; this._upQ = []; this._zombies = [];
		const eng = scene.getEngine();                                      // envio das páginas em faixas: o orçamento é reposto a cada quadro (_upFrame)
		if (this._upObs) this._upObs.e.onBeginFrameObservable.remove(this._upObs.o);
		this._upObs = { e: eng, o: eng.onBeginFrameObservable.add(() => this._upFrame()) };
		scene.onBeforeRenderObservable.add(() => this._palFlush());          // (linhas novas da paleta: uma vez por quadro)
		for (const A of Object.values(this.atlases)) for (const P of A.pages) if (P.px) this._upload(P, P.pri);  // (o protagonista, decodificado na carga da página)
		// Ordem de desenho do grupo 1 (o dos carros, ver CarArt): os personagens 2,5D vão logo depois dos carros e portas e antes das
		// copas (alphaIndex ALPHA) e, entre eles, do NORTE para o SUL — quem está mais ao sul fica por cima (a cabeça cresce para o norte).
		scene.setRenderingOrder(1, null, null, (a, b) => {
			if (a._alphaIndex !== b._alphaIndex) return a._alphaIndex > b._alphaIndex ? 1 : -1;
			const ma = a.getMesh(), mb = b.getMesh();
			if (ma._ysort && mb._ysort) {                                  // (com a câmera bússola girada: "norte" = para cima da tela)
				const y = typeof CompassCamera !== 'undefined' ? CompassCamera.yaw : 0;
				if (!y) return mb.position.z - ma.position.z;
				return (mb.position.z - ma.position.z) * Math.cos(y) + (mb.position.x - ma.position.x) * Math.sin(y);
			}
			return b._distanceToCamera - a._distanceToCamera;
		});
	},
	// Recorte da carroceria nos atlas `ids` (os do jogador entrando no carro): c = { x, z, fx, fz, hl, hw, h } ou null (desliga).
	// (vale também para as páginas que chegarem / voltarem depois)
	setClip(ids, c) {
		for (const id of ids) {
			const A = id && this.atlases[id];
			if (!A) continue;
			A.carClip = c || null;
			for (const P of A.pages) if (P.mat) this._clipU(P.mat, A.carClip);
		}
	},
	_clipU(m, c) {
		if (c) { m.setVector4('clipA', new BABYLON.Vector4(c.x, c.z, c.fx, c.fz)); m.setVector4('clipB', new BABYLON.Vector4(c.hl, c.hw, c.h, c.inside ? 2 : 1)); }
		else { m.setVector4('clipA', new BABYLON.Vector4(0, 0, 0, 1)); m.setVector4('clipB', new BABYLON.Vector4(0, 0, 0, 0)); }
	},
	ALPHA: -1.5,                   // entre as portas dos carros (-2) e as copas das árvores (-1)

	// Malha do personagem passa a (ou deixa de) ser 2,5D: grupo de desenho e ordem (ver init).
	sortMesh(mesh, on) {
		if (on) { mesh.renderingGroupId = 1; mesh.alphaIndex = this.ALPHA; mesh._ysort = true; }
		else if (mesh._ysort) { mesh._ysort = false; mesh.renderingGroupId = 0; mesh.alphaIndex = Number.MAX_VALUE; }
	},

	// Paleta: 256 colunas (código da cor) × ROWS linhas (variantes). Os códigos fixos (sombra, contorno, clarão…) valem em toda linha.
	_palette() {
		const W = 256, H = this.ROWS, data = new Uint8Array(W * H * 4);
		this._pal = { data, W, H };
		this._pal.tex = BABYLON.RawTexture.CreateRGBATexture(data, W, H, this._scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
		this._pal.tex.wrapU = this._pal.tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
		for (const [key, row] of this._rows) this._fillRow(row, this._rowSpec.get(key), false);
		this._pal.tex.update(data);
	},
	_rowSpec: new Map(),

	_fillRow(row, spec, upload = true) {
		const P = this._pal;
		if (!P) return;
		const D = NpcData, ramps = D.rampsFor(spec), hex = D.hexrgb;
		for (let code = 0; code < 256; code++) {
			const tone = code & 7, mat = code >> 3;
			let c = null;
			if (code < 8 || tone > 4) c = D.SPECIAL[code] || null;
			else if (ramps[mat]) c = hex(ramps[mat][tone]);
			const o = (row * P.W + code) * 4;
			if (c) { P.data[o] = c[0]; P.data[o + 1] = c[1]; P.data[o + 2] = c[2]; P.data[o + 3] = 255; }
		}
		if (upload) { P.lo = Math.min(P.lo == null ? row : P.lo, row); P.hi = Math.max(P.hi == null ? row : P.hi, row); }    // (sobe antes do próximo desenho: _palFlush)
	},
	// Linhas novas da paleta → GPU uma vez por quadro, logo antes do desenho, só as que mudaram (texSubImage2D): dezenas de pedestres
	// nascendo no mesmo quadro mandavam a paleta INTEIRA (256 × 384 × 4 B = 384 KB) uma vez cada.
	_palFlush() {
		const P = this._pal;
		if (!P || P.lo == null || !this._scene) return;
		const lo = P.lo, n = P.hi - lo + 1, eng = this._scene.getEngine(), gl = eng._gl, it = P.tex.getInternalTexture();
		P.lo = P.hi = null;
		if (!it) return;
		eng._bindTextureDirectly(gl.TEXTURE_2D, it, true);
		eng._unpackFlipY(false);                                            // (a paleta foi criada sem inverter: linha r em y = r)
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, lo, P.W, n, gl.RGBA, gl.UNSIGNED_BYTE, P.data.subarray(lo * P.W * 4, (lo + n) * P.W * 4));
		eng._bindTextureDirectly(gl.TEXTURE_2D, null);
	},

	// Linha da paleta da variante `v` do tipo `id` (cria na primeira vez).
	row(id, v = 0) {
		const key = id + '#' + v;
		let r = this._rows.get(key);
		if (r !== undefined) return r;
		r = this._nextRow < this.ROWS ? this._nextRow++ : 1 + (NpcData.hashStr(key) % (this.ROWS - 1));
		this._rows.set(key, r);
		this._rowSpec.set(key, NpcData.variantSpec(String(id).replace(/#d\d+$/, ''), v));
		this._fillRow(r, this._rowSpec.get(key));
		return r;
	},
	// Linha 0 = o jogador: as cores da roupa que ele veste (Outfit / PlayerLook). Muda na hora, em todas as animações.
	setPlayerColors(spec) {
		this._rows.set('player', 0);
		this._rowSpec.set('player', spec);
		this._fillRow(0, spec);
	},

	_register() {
		if (BABYLON.Effect.ShadersStore.npcArtVertexShader) return;
		// fr = (x*4096+y, w*4096+h, (ox+2048)*4096+(oy+2048)) do quadro; position = local (m) relativo aos pés; ppu = px por metro.
		BABYLON.Effect.ShadersStore.npcArtVertexShader = `
			precision highp float;
			attribute vec3 position;
			attribute vec4 color;
			attribute vec4 fr;
			attribute vec4 fr2;          // PRÓXIMO quadro (mesmo formato de fr) + peso da mistura em w (0 = só o quadro atual)
			uniform mat4 world;
			uniform mat4 viewProjection;
			uniform float ppu;
			uniform float lift;
			uniform vec2 stand;          // standing quad (2.5D camera): x = drop of the feet to the ground, y = depth bias (NDC)
			varying vec2 vPx;
			varying vec4 vFr;
			varying vec2 vC;
			varying vec3 vW;
			varying vec3 vPx2;
			varying vec4 vFr2;
			varying vec2 vG;
			vec2 un(float v) { float hi = floor(v / 4096.0 + 0.0001); return vec2(hi, v - hi * 4096.0); }
			void main(void) {
				float h = position.y + position.z;                          // image height (m): z on a quad lying down, y on a standing one
				vec2 xy = un(fr.x), wh = un(fr.y), o = un(fr.z) - 2048.0;
				vPx = vec2(xy.x - o.x + position.x * ppu, xy.y - o.y - h * ppu);
				vFr = vec4(xy, xy + wh);
				vec2 xy2 = un(fr2.x), wh2 = un(fr2.y), o2 = un(fr2.z) - 2048.0;
				vPx2 = vec3(xy2.x - o2.x + position.x * ppu, xy2.y - o2.y - h * ppu, fr2.w);
				vFr2 = vec4(xy2, xy2 + wh2);
				vC = color.rg;
				vW = vec3(position.x, h, color.a);                          // x e "altura" na imagem (m), linha d'água (m, 0 = seco)
				vec4 wp = world * vec4(position, 1.0);
				wp.y -= stand.x;
				vG = wp.xz;                                                 // (ponto do chão onde este pixel do desenho cai: recorte do carro)
				gl_Position = viewProjection * wp;
				// Standing: the quad already has its true height. The art BELOW the feet (the front foot of a stride toward the camera, a
				// swimmer lying on the water, the shadow) would sit under the ground or the water in front and get cut, so it tests the
				// depth at the height of the feet; the bias keeps that edge above the ground.
				if (stand.y > 0.0) {
					float feet = (world * vec4(0.0, 0.0, 0.0, 1.0)).y - stand.x;
					vec4 dp = viewProjection * vec4(wp.x, max(wp.y, feet), wp.z, 1.0);
					gl_Position.z = (dp.z / dp.w - stand.y) * gl_Position.w;
					return;
				}
				// "De pé" para a profundidade: o desenho cresce para o norte (cabeça ~1 m acima dos pés na imagem), mas é uma pessoa em pé —
				// a parte de cima testa a profundidade como se estivesse mais ALTA (não some atrás da parede/telhado baixo logo ao norte).
				// Com os pés debaixo de um toldo (color.b = altura dele, SpriteActor._updateCover), o corpo inteiro fica abaixo do toldo.
				float up = max(position.z, 0.0) * lift;
				if (color.b > 0.5) up = min(up, color.b - 0.15 - wp.y);
				vec4 lp = viewProjection * (wp + vec4(0.0, up, 0.0, 0.0));
				gl_Position.z = lp.z / lp.w * gl_Position.w;
			}`;
		// Bilinear feito à mão sobre a cor JÁ pintada (o atlas tem códigos, não cores): suave de longe; `sharp` > 1 = de perto, nítido.
		// De longe (`mini` = texels do atlas por pixel da tela > 1,3: dirigindo, celular, tela pequena), o bilinear de 4 amostras pulava
		// texels — o boneco serrilhava e "fervia" andando. Aí vale a MÉDIA de n×n amostras sobre a pegada do pixel (filtro de caixa).
		// ANTISSERRILHADO (`aa` = Config.art.npcAA, amostras por lado; 1 = desligado): o MSAA da cena não age DENTRO de um sprite (só na
		// borda do quad, que é transparente), então o próprio shader faz o supersampling — n×n amostras bilineares numa grade girada
		// (RGSS: bordas quase retas também) espalhadas pela pegada exata do pixel no atlas (derivadas), n pela redução (de longe, uma
		// amostra por texel: nenhum é pulado) entre 2 e `aa`. Com a mistura de quadros, cada amostra lê um dos dois quadros (na proporção
		// da mistura): o custo não dobra.
		BABYLON.Effect.ShadersStore.npcArtFragmentShader = `
			#ifdef AA
			#extension GL_OES_standard_derivatives : enable
			#endif
			precision highp float;
			varying vec2 vPx;
			varying vec4 vFr;
			varying vec2 vC;
			uniform sampler2D atlas;
			uniform sampler2D palette;
			uniform vec2 atlasSize;
			uniform float palRows;
			uniform vec3 tint;
			uniform float sharp;
			uniform float mini;
			uniform float aa;
			uniform float la;
			uniform float fmt;
			uniform float wt;
			uniform float ppu;
			varying vec3 vW;
			varying vec3 vPx2;
			varying vec4 vFr2;
			varying vec2 vG;
			uniform vec4 clipA;          // recorte da carroceria (entrando no carro): centro (x, z) e frente (fx, fz)
			uniform vec4 clipB;          // meio comprimento, meia largura, altura máxima na imagem (m) e o modo em w (ver main)
			uniform vec4 silhouette;     // X-ray pass: tint (rgb) and strength (a), 0 = the normal drawing
			float hb(float n) { return fract(sin(n) * 43758.5453); }
			vec4 tap(vec2 t, vec4 R) {
				if (t.x < R.x || t.y < R.y || t.x >= R.z || t.y >= R.w) return vec4(0.0);
				vec4 s = texture2D(atlas, (t + 0.5) / atlasSize);
				float code = floor(s.r * 255.0 + 0.5), b1 = floor((la > 0.5 ? s.a : s.g) * 255.0 + 0.5);
				float mat = floor(code / 8.0), tone = code - mat * 8.0, row = (floor(vC.x + 0.5) + 0.5) / palRows;
				vec3 c; float a, a8;
				if (fmt < 1.5) {                                                   // formato 1: código (material × 8 + tom) e alfa
					a8 = b1; a = a8 / 255.0;
					if (a < 0.002) return vec4(0.0);
					c = texture2D(palette, vec2((code + 0.5) / 256.0, row)).rgb;
					if (a8 < 254.5 && (code == 1.0 || (code >= 8.0 && tone < 4.5)))
						c = mix(c, vec3(0.1804, 0.4078, 0.5569), 0.45 + 0.45 * clamp((200.0 - a8) / 150.0, 0.0, 1.0));
				} else if (code < 8.0 || tone > 4.5) {                             // formato 2, cor fixa: [código, alfa]
					a8 = b1; a = a8 / 255.0;
					if (a < 0.002) return vec4(0.0);
					c = texture2D(palette, vec2((code + 0.5) / 256.0, row)).rgb;
				} else {                                                           // formato 2, material: [material × 8 + água, LUZ]
					// luz 0–204 anda pela rampa de 5 tons do material (sombreado contínuo); acima disso, o brilho (quase branco).
					// Os 2 bits baixos da luz = cobertura do pixel de borda (0 = cheio; 1–3 = 75/50/25%): silhueta suavizada, sem contorno.
					float cov = mod(b1, 4.0); b1 -= cov;
					float u = min(b1, 204.0) / 204.0 * 4.0, i0 = floor(u), i1 = min(i0 + 1.0, 4.0);
					vec3 c0 = texture2D(palette, vec2((mat * 8.0 + i0 + 0.5) / 256.0, row)).rgb;
					vec3 c1 = texture2D(palette, vec2((mat * 8.0 + i1 + 0.5) / 256.0, row)).rgb;
					c = mix(c0, c1, u - i0);
					if (b1 > 204.0) c = mix(c, c1 + (1.0 - c1) * 0.65, (b1 - 204.0) / 51.0);
					a8 = tone < 0.5 ? 255.0 : 200.0 - (tone - 1.0) / 3.0 * 150.0;
					if (tone > 0.5) c = mix(c, vec3(0.1804, 0.4078, 0.5569), 0.45 + 0.45 * clamp((200.0 - a8) / 150.0, 0.0, 1.0));     // debaixo d'água
					a = a8 / 255.0 * (1.0 - cov * 0.25);
				}
				if (code > 0.5) c *= tint * vC.y;
				return vec4(c * a, a);
			}
			// bilinear do quadro cujo retângulo no atlas é R (px), no ponto p (px); sharp > 1: o miolo do texel fica duro
			vec4 bilin(vec2 px, vec4 R) {
				vec2 p = px - 0.5, i = floor(p), f = clamp((p - i - 0.5) * sharp + 0.5, 0.0, 1.0);
				return mix(mix(tap(i, R), tap(i + vec2(1.0, 0.0), R), f.x), mix(tap(i + vec2(0.0, 1.0), R), tap(i + vec2(1.0, 1.0), R), f.x), f.y);
			}
			// o mesmo, de longe sem o antisserrilhado: a média de n×n texels sobre a pegada do pixel
			vec4 sampleFrame(vec2 px, vec4 R) {
				if (mini > 1.3) {
					float n = min(4.0, ceil(mini));
					vec4 acc = vec4(0.0);
					for (int j = 0; j < 4; j++) for (int k = 0; k < 4; k++) {
						if (float(k) >= n || float(j) >= n) continue;
						acc += tap(floor(px + ((vec2(float(k), float(j)) + 0.5) / n - 0.5) * mini), R);
					}
					return acc / (n * n);
				}
				return bilin(px, R);
			}
			#ifdef AA
			// supersampling: n×n amostras na grade girada sobre a pegada do pixel (ex, ey: texels do atlas por pixel da tela)
			vec4 supersample() {
				vec2 ex = dFdx(vPx), ey = dFdy(vPx);
				float n = clamp(ceil(max(length(ex), length(ey)) * 1.4), 2.0, aa), z = vPx2.z;
				bool both = n < 2.5 && z > 0.004;                                   // (só 4 amostras: a mistura exata, lendo os dois quadros)
				vec4 acc = vec4(0.0);
				for (int j = 0; j < 4; j++) for (int k = 0; k < 4; k++) {
					if (float(k) >= n || float(j) >= n) continue;
					vec2 u = (vec2(float(k), float(j)) + 0.5) / n - 0.5;
					u = vec2(u.x * 0.8944 - u.y * 0.4472, u.x * 0.4472 + u.y * 0.8944);      // girada 26,6° (atan ½)
					vec2 o = ex * u.x + ey * u.y;
					if (both) acc += mix(bilin(vPx + o, vFr), bilin(vPx2.xy + o, vFr2), z);
					else if (z > 0.004 && fract((float(j) * n + float(k) + 0.5) * 0.618034) < z) acc += bilin(vPx2.xy + o, vFr2);
					else acc += bilin(vPx + o, vFr);
				}
				return acc / (n * n);
			}
			#endif
			void main(void) {
				vec4 c;
				#ifdef AA
				if (aa > 1.5) c = supersample(); else
				#endif
				{
					c = sampleFrame(vPx, vFr);
					// mistura com o PRÓXIMO quadro da animação (gráfico suave): a pose muda em degradê, sem o salto seco entre quadros
					if (vPx2.z > 0.004) c = mix(c, sampleFrame(vPx2.xy, vFr2), vPx2.z);
				}
				// Vadeando (vW.z = profundidade da água no corpo, m): abaixo da linha d'água o desenho fica tingido de mar e some aos
				// poucos com a profundidade, e a linha balança com uma franja de espuma. Na imagem, 1 m de altura sobe 0,56 m (câmera 56°).
				if (vW.z > 0.01 && c.a > 0.02) {
					float wl = vW.z * 0.56 + 0.018 * sin(vW.x * 26.0 + wt * 6.0) + 0.012 * sin(vW.x * 61.0 - wt * 9.0);
					float below = wl - vW.y;
					if (below > -0.03) {
						vec3 rgb = c.rgb / c.a;
						float sub = smoothstep(-0.006, 0.006, below), deep = smoothstep(0.0, 0.32, below);
						rgb = mix(rgb, mix(vec3(0.27, 0.55, 0.62), vec3(0.15, 0.36, 0.48), deep), sub * (0.5 + 0.3 * deep));
						float foam = 1.0 - smoothstep(0.004, 0.026, abs(below - 0.004));
						rgb = mix(rgb, vec3(0.86, 0.95, 0.97) * tint, foam * 0.85);
						float a = c.a * (1.0 - sub * (0.25 + 0.6 * deep)) + foam * 0.3 * (1.0 - c.a);
						c = vec4(rgb * a, a);
					}
				}
				// Entrando/saindo do carro (Player.setCarClip): o que está abaixo da altura que já entrou some debaixo da carroceria —
				// os pés primeiro, a cabeça por último. Com os pés ainda fora, só o que cai SOBRE o carro; com os pés já dentro (modo 2),
				// todo o corpo abaixo dessa altura (o desenho cresce para o norte: senão a cabeça "atravessava" a borda do teto).
				if (clipB.w > 0.5 && vW.y < clipB.z) {
					vec2 d = vG - clipA.xy;
					if (clipB.w > 1.5 || (abs(dot(d, clipA.zw)) < clipB.x && abs(dot(d, vec2(clipA.w, -clipA.z))) < clipB.y)) discard;
				}
				if (c.a < 0.02) discard;
				// X-ray pass (XRaySilhouette): a flat tinted silhouette instead of the drawing (premultiplied).
				// (only above the feet line: below it is the ground contact - shadow, a foot stepping forward - which the ground itself covers)
				if (silhouette.a > 0.0) { if (vW.y < 0.05) discard; gl_FragColor = vec4(silhouette.rgb, 1.0) * (silhouette.a * smoothstep(0.2, 0.6, c.a)); return; }
				gl_FragColor = c;
			}`;
	},

	// Material de uma página (o mesmo shader para todas; cada página tem a sua textura e o seu tamanho). Também refaz o que mudou
	// enquanto ela estava fora da GPU (zoom, relógio da água, recorte do carro).
	_bind(P) {
		const m = P.mat || (P.mat = this._newMaterial(P, 'npcArt_'));
		this._refresh(m, P);
		this._clipU(m, P.A.carClip);
		return m;
	},
	// The page's material: the fixed uniforms (the dynamic ones: _refresh).
	_newMaterial(P, prefix) {
		const A = P.A, m = new BABYLON.ShaderMaterial(prefix + A.id + '_' + P.i, this._scene, { vertex: 'npcArt', fragment: 'npcArt' }, {
			attributes: ['position', 'color', 'fr', 'fr2'],
			uniforms: ['world', 'viewProjection', 'ppu', 'lift', 'stand', 'atlasSize', 'palRows', 'tint', 'sharp', 'mini', 'aa', 'la', 'fmt', 'wt', 'clipA', 'clipB', 'silhouette'],
			samplers: ['atlas', 'palette'],
			defines: this.aa > 1 ? ['#define AA'] : [],
			needAlphaBlending: true,
		});
		m.setFloat('aa', this.aa);
		m.setTexture('palette', this._pal.tex);
		m.setFloat('ppu', this.ppuOf(A));
		m.setFloat('fmt', A.data.v || 1);
		m.setFloat('lift', 4.0);
		m.setVector2('atlasSize', new BABYLON.Vector2(P.w, P.h));
		m.setFloat('palRows', this.ROWS);
		m.setColor3('tint', SpriteMaterial.sharedTint());
		m.setFloat('la', this._gl2 ? 0 : 1);
		m.setVector4('silhouette', this.NO_SILHOUETTE);                   // (always bound: the X-ray twin shares this shader program)
		m.alphaMode = BABYLON.Engine.ALPHA_PREMULTIPLIED;
		m.backFaceCulling = false;
		return m;
	},
	// What changes while the page lives: its texture (on the GPU or not), the zoom sharpness, the water clock, standing.
	_refresh(m, P) {
		m.setTexture('atlas', P.tex || this._emptyTex());
		m.setFloat('sharp', this._sharpOf(P.A));
		m.setFloat('mini', this._miniOf(P.A));
		m.setFloat('wt', this._wt || 0);
		m.setVector2('stand', this._stand);
	},
	// X-ray material of a page (XRaySilhouette): the same drawing, painted as a flat silhouette only where something closer to the camera
	// already wrote depth (GREATER), without writing depth itself. Refreshed on every call: only the player's current page uses it.
	SILHOUETTE: new BABYLON.Vector4(1.0, 0.86, 0.38, 0.62),
	NO_SILHOUETTE: new BABYLON.Vector4(0, 0, 0, 0),
	silhouetteOf(P) {
		let m = P.sil;
		if (!m) {
			m = P.sil = this._newMaterial(P, 'npcXray_');
			m.setVector4('silhouette', this.SILHOUETTE);
			m.depthFunction = BABYLON.Constants.GREATER;
			m.disableDepthWrite = true;
		}
		this._refresh(m, P);
		return m;
	},

	// TAMANHO dos personagens no mundo: px por metro na resolução de referência (atlas com k = 0,5). Um atlas em alta definição
	// (k = 1) tem o dobro de px por metro — ppuOf.
	get ppu() { return (Config.art && Config.art.npcPpu) || 26; },
	ppuOf(A) { return this.ppu * ((A.data.k || 0.5) / 0.5); },

	// Nitidez conforme o zoom: px de tela por texel do atlas (> 1 = ampliado: sem borrar). Chamado a cada quadro pelo jogo.
	_spm: 0,
	// (até 1,6: de perto o boneco fica nítido, mas liso — sem os "quadradinhos" de pixel art ampliada)
	// Com o antisserrilhado ligado, o realce é bem mais brando (o miolo duro de cada texel ampliado fazia o degrau no contorno).
	_sharpOf(A) { const r = Math.max(1, Math.min(1.6, (this._spm || this.ppu) / this.ppuOf(A))); return this.aa > 1 ? 1 + (r - 1) * 0.3 : r; },
	// Antisserrilhado no shader (amostras por lado do pixel, 1 = desligado): Config.art.npcAA, se a placa tem derivadas (WebGL 2 ou a
	// extensão no WebGL 1) — sem elas, o filtro de caixa de sempre.
	get aa() {
		if (this._aa === undefined && this._scene) this._aa = this._scene.getEngine().getCaps().standardDerivatives ? Math.max(1, Math.min(4, Math.round((Config.art && Config.art.npcAA) || 1))) : 1;
		return this._aa || 1;
	},
	_miniOf(A) { return Math.max(1, Math.min(6, this.ppuOf(A) / (this._spm || this.ppu))); },

	// Standing sprites (2.5D camera, SpriteActor.standing): the feet drop from the top-down layer height (0.5) back to the ground, and
	// the depth is pulled STAND_BIAS metres toward the camera. Uniform `stand` of every page material; follows the camera mode.
	LAYER_Y: 0.5, STAND_BIAS: 1.0,
	_stand: new BABYLON.Vector2(0, 0),
	_standSync() {
		const on = typeof SpriteActor !== 'undefined' && SpriteActor.standing(), cam = this._scene && this._scene.activeCamera;
		const bias = on && cam ? 2 * this.STAND_BIAS / Math.max(1, cam.maxZ - cam.minZ) : 0;
		if (this._stand.y === bias && (this._stand.x > 0) === on) return;
		this._stand.set(on ? this.LAYER_Y : 0, bias);
		for (const A of Object.values(this.atlases)) for (const P of A.pages) if (P.mat) P.mat.setVector2('stand', this._stand);
	},
	// Relógio da linha d'água (ondulação de quem vadeia): um uniform por página na GPU. Também o relógio do LRU (~2 s).
	_lruT: 0,
	tick(t) {
		this.now = t;
		this._standSync();
		this._wt = t % 1000;
		for (const P of this._live) P.mat.setFloat('wt', this._wt);
		if (this._zombies.length) this._reap();
		if (t - this._lruT >= 2) { this._lruT = t; this._lru(); }
	},

	setZoom(screenPxPerMeter) {
		if (Math.abs(screenPxPerMeter - this._spm) < 0.05) return;
		this._spm = screenPxPerMeter;
		this.sharp = this._sharpOf({ data: {} });
		for (const A of Object.values(this.atlases)) {
			const s = this._sharpOf(A), mi = this._miniOf(A);
			for (const P of A.pages) if (P.mat) { P.mat.setFloat('sharp', s); P.mat.setFloat('mini', mi); }
		}
	},

	// ------------------------------------------------------------------ clipes
	// Clipe pronto para o SpriteActor: { npc: true, pk: { fr, box, n }, pages, pd (página de cada direção), fps, loop, frames, dirs }.
	// A textura/material vem da página da direção desenhada (pages[pd[dir]].mat, quando ela está na GPU). null = o atlas não tem.
	clip(id, key) {
		const A = this.atlases[id];
		if (!A) return null;
		const c = A.data.clips[key];
		if (!c) return null;
		if (!A.hot) { A.hot = true; for (const P of A.pages) if (P.g === 'hot') this._want(P); }       // (o tipo apareceu: o dia a dia dele já vai para a fila)
		const cache = A.cache || (A.cache = new Map());                 // (fora dos metadados: o atlas do jogador vai inteiro para o IndexedDB)
		if (cache.has(key)) return cache.get(key);
		const n = c.n, dirs = c.dirs || 8, { fr, pd, box } = this._clipTables(A, c, key);    // (dirs ausente = cache antigo: 8)
		const [name, weapon] = key.split(':');
		const clip = {
			name, weapon, npc: true, atlas: id, gen: A.gen || 0, frames: n, dirs, fps: c.fps, loop: c.loop, pk: { fr, box, n }, pages: A.pages, pd, shared: true, frame: 0, W: 0, H: 0,
			gaitK: this.STRIDE.test(name) ? 1 / this.scaleOf(id) : 1,         // (passada com o pé plantado: o ritmo pela escala do tipo — scaleOf)
			get material() { const P = this.pages[this.pd[0]]; return (P && P.mat) || null; },      // (compatibilidade: o da direção 0)
		};
		cache.set(key, clip);
		return clip;
	},
	// Tabelas de um clipe do manifesto: fr (3 números por quadro: ver o cabeçalho), pd (página de cada direção) e a caixa do quad.
	_clipTables(A, c, key) {
		const ppu = this.ppuOf(A), n = c.n, dirs = c.dirs || 8, fr = new Float32Array(n * dirs * 3), pd = new Int16Array(dirs);
		for (let d = 0; d < dirs; d++) { const p = c.pd ? c.pd[d] : 0; pd[d] = p >= 0 && p < A.pages.length ? p : 0; }
		let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
		c.f.forEach((q, i) => {
			const [x, y, w, h, ox, oy] = q, P = A.pages[pd[Math.min(dirs - 1, Math.floor(i / n))]];
			if (w && (x + w > Math.min(4096, P.w) || y + h > Math.min(4096, P.h)) && !A.warned) { A.warned = true; console.warn(`[NPCS] ${A.id}: quadro fora da página (x·4096 + y) em ${key}`); }
			fr[i * 3] = x * 4096 + y; fr[i * 3 + 1] = w * 4096 + h; fr[i * 3 + 2] = (ox + 2048) * 4096 + (oy + 2048);
			if (!w) return;
			x0 = Math.min(x0, ox); y0 = Math.min(y0, oy); x1 = Math.max(x1, ox + w); y1 = Math.max(y1, oy + h);
		});
		if (x0 === Infinity) { x0 = y0 = 0; x1 = y1 = 1; }
		// caixa do quad em metros (x leste, z norte), relativa aos pés: a imagem cresce para baixo = sul
		return { fr, pd, box: [x0 / ppu, -y1 / ppu, x1 / ppu, -y0 / ppu] };
	},

	// A wardrobe look read from the device (PlayerLook ← LookStore): its pages stay as Blobs and are decoded on demand like the baked
	// ones (AtlasDecoder, in a Worker), so they can also leave the GPU and come back. rec = { k, v, frame, clips, pages: [{ w, h, g, par, type, bytes }] }.
	addStored(id, rec) {
		if (this.atlases[id]) this.dropAtlas(id);
		const pages = rec.pages.map((p) => ({ w: p.w, h: p.h, g: p.g || 'hot', par: p.par || 0, blob: new Blob([p.bytes], { type: p.type }) }));
		return this._atlas(id, { clips: rec.clips, k: rec.k || 0.5, v: rec.v || 2, frame: rec.frame }, pages, true);
	},
	// ------------------------------------------------------------------ LIVE atlas: a wardrobe look while it is being drawn
	// The Worker sends each direction of each clip as soon as it is drawn (Wardrobe → liveAdd); the frames go straight into GPU pages
	// (texSubImage2D, a few KB each) and the clip table grows in place, so the player wears the new outfit within a moment of the change
	// instead of after the whole look (~20 000 frames). A direction not drawn yet shows the nearest one that is; a clip not drawn yet
	// is not in the atlas, and the sheet's chain falls through to the previous look for it. When the look is complete it is packed and
	// stored (LookStore) and PlayerLook swaps this atlas for the stored one.
	LIVE_PAGE: 2048,               // side of a live page (8 MB of RG8)
	liveAtlas(id, data) {
		if (this.atlases[id]) this.dropAtlas(id);
		const A = this._atlas(id, { clips: {}, k: data.k || 0.5, v: data.v || 2, frame: data.frame }, [], false);
		A.live = { x: 0, y: 0, sh: 0 };                                   // (shelf cursor on the last page)
		A.hot = true;
		return A;
	},
	// m = { key, fps, loop, n, dirs, rows: [[dir, [{ w, h, ox, oy, data }]]] }. false = the atlas is gone (an outfit changed again).
	liveAdd(id, m) {
		const A = this.atlases[id];
		if (!A || !A.live || !this._scene) return false;
		const n = m.n, D = m.dirs;
		let c = A.data.clips[m.key];
		const fresh = !c;
		if (fresh) c = A.data.clips[m.key] = { fps: m.fps, loop: m.loop, n, dirs: D, pd: new Array(D).fill(0), f: new Array(n * D).fill(this._NOFRAME), src: new Array(D).fill(-1) };
		for (const [d, row] of m.rows) {
			c.pd[d] = this._livePlace(A, row);
			for (let i = 0; i < n; i++) { const q = row[i]; c.f[d * n + i] = q && q.w ? [q.x, q.y, q.w, q.h, q.ox, q.oy] : this._NOFRAME; }
			c.src[d] = d;
		}
		for (let d = 0; d < D; d++) {                                      // (not drawn yet: the nearest drawn direction)
			if (c.src[d] === d) continue;
			let s = -1;
			for (let k = 1; k <= D >> 1 && s < 0; k++) { if (c.src[(d + k) % D] === (d + k) % D) s = (d + k) % D; else if (c.src[(d - k + D) % D] === (d - k + D) % D) s = (d - k + D) % D; }
			if (s < 0) continue;
			c.src[d] = s; c.pd[d] = c.pd[s];
			for (let i = 0; i < n; i++) c.f[d * n + i] = c.f[s * n + i];
		}
		const live = typeof SpriteActor !== 'undefined' ? SpriteActor.live : [];
		if (fresh) {                                                       // a clip the sheet took from the previous look: it now comes from here
			for (const s of Object.values(this.sheets)) if (s.uses(id)) s.clips = {};
			for (const a of live) if (a.clip && a.clip.atlas !== id && a.sheet && a.sheet.isNpc && a.sheet.uses(id) && a.clip.name + ':' + a.clip.weapon === m.key) a.replay();
			return true;
		}
		const clip = A.cache && A.cache.get(m.key);
		if (!clip) return true;
		const t = this._clipTables(A, c, m.key), b = clip.pk.box;
		clip.pk.fr.set(t.fr); clip.pd.set(t.pd);
		if (t.box.some((v, i) => v !== b[i])) clip.pk.box = t.box;
		for (const a of live) if (a.clip === clip) a._applyUV();
		return true;
	},
	_NOFRAME: [0, 0, 0, 0, 0, 0],
	// The frames of one direction of a clip, together on one page (the next frame — blending — is read from the same texture): shelves
	// on the last page, or a new page. Each frame is uploaded right away. → the page index.
	_livePlace(A, row) {
		const L = A.live, W = this.LIVE_PAGE;
		const fits = () => {
			let x = L.x, y = L.y, sh = L.sh;
			for (const q of row) { if (!q.w) continue; if (x + q.w > W) { x = 0; y += sh + 1; sh = 0; } x += q.w + 1; sh = Math.max(sh, q.h); }
			return y + sh <= W;
		};
		let P = A.pages[A.pages.length - 1];
		if (!P || !fits()) { P = this._livePage(A); L.x = L.y = L.sh = 0; }
		const eng = this._scene.getEngine(), gl = eng._gl, al = gl.getParameter(gl.UNPACK_ALIGNMENT);
		const fmt = eng._getInternalFormat(this._gl2 ? BABYLON.Constants.TEXTUREFORMAT_RG : BABYLON.Constants.TEXTUREFORMAT_LUMINANCE_ALPHA), type = eng._getWebGLTextureType(BABYLON.Constants.TEXTURETYPE_UNSIGNED_BYTE);
		eng._bindTextureDirectly(gl.TEXTURE_2D, P.tex.getInternalTexture(), true);
		eng._unpackFlipY(false);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 2);
		for (const q of row) {
			if (!q.w) continue;
			if (L.x + q.w > W) { L.x = 0; L.y += L.sh + 1; L.sh = 0; }
			q.x = L.x; q.y = L.y; L.x += q.w + 1; L.sh = Math.max(L.sh, q.h);
			gl.texSubImage2D(gl.TEXTURE_2D, 0, q.x, q.y, q.w, q.h, fmt, type, q.data);
		}
		eng._bindTextureDirectly(gl.TEXTURE_2D, null);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, al);
		P.used = this.now;
		return P.i;
	},
	_livePage(A) {
		const W = this.LIVE_PAGE, F = this._gl2 ? BABYLON.Constants.TEXTUREFORMAT_RG : BABYLON.Constants.TEXTUREFORMAT_LUMINANCE_ALPHA;
		const P = { w: W, h: W, g: 'hot', par: 0, A, i: A.pages.length, st: 'ready', used: this.now, pri: 9, seq: 0, mat: null };
		P.tex = new BABYLON.RawTexture(null, W, W, F, this._scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE, BABYLON.Constants.TEXTURETYPE_UNSIGNED_BYTE);
		P.tex.wrapU = P.tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
		A.pages.push(P);
		this._res += W * W * 2; this._live.add(P);
		this._bind(P);
		return P;
	},
	// Geração do atlas de um id (o atlas foi trocado: os clipes já tocando são refeitos — SpriteActor.update).
	// (atlas descartado — o visual antigo do jogador — = -1: quem ainda o usa, como o piloto da moto, também refaz o clipe)
	genOf(id) { const A = this.atlases[id]; return A ? A.gen || 0 : -1; },
	// Escala do desenho de um atlas: cada tipo sai na escala da ficha (spec.scale; NpcGenBuild: charScale = scale·k/1,04) num quad do mesmo
	// tamanho para todos, então o pé plantado anda scale × o do corpo de referência (escala 1 — o protagonista, onde Config.anim.walk/run e
	// os fatores do jogo foram medidos: strafe, wade, SpriteActor.CLIMB, walk_heavy). Medido (motion.cjs footSpeed, 34 tipos × as passadas,
	// qualquer arma): footSpeed ÷ o da referência = scale (±0,1%). Os clipes de passada (STRIDE) tocam a 1/scale: sem deslize em nenhum tipo.
	// Dano (#dN) = o tipo; visual do guarda-roupa (hero:…) = a ficha dele (PLAYER_DEFAULT + roupa: sem scale → 1), ou A.scale se quem
	// registrou o atlas a informou (o manifesto traz a escala do tipo).
	STRIDE: /^(walk|run|walk_up|climb|scared|sneak|strafe|wade|walk_hold|run_hold|walk_pull|walk_heavy|run_heavy|baton_walk)$/,
	scaleOf(id) {
		const A = this.atlases[id];
		if (A && A.scale > 0) return A.scale;
		const k = NpcData.ok ? NpcData.scaleOf(id) : 1;
		if (A) A.scale = k;
		return k;
	},

	// Descarta um atlas (o visual antigo do jogador, um atlas de dano sem uso…): texturas, materiais e quem o desenhava (esconde até
	// desenhar de novo: o SpriteActor refaz o clipe no próximo update). Quem ainda desenha uma página dele na GPU (o visual antigo do
	// jogador, trocado agora pelo novo, que sobe em faixas) segue no último quadro até a página nova chegar — sem piscar: as texturas
	// saem depois (_reap), quando ninguém mais as desenha (no máximo em 10 s).
	dropAtlas(id) {
		const A = this.atlases[id];
		if (!A) return;
		delete this.atlases[id];
		let keep = false;
		if (typeof SpriteActor !== 'undefined') for (const a of SpriteActor.live) if (a._pg && a._pg.A === A) { if (a._pg.tex) keep = true; else a._lostPage(); }
		for (const P of A.pages) {
			P.dead = true;
			this._upCancel(P);
			if (!keep) this._free(P);
			P.px = P.blob = null;
			this._wake(P);
		}
		if (keep) this._zombies.push({ A, t: performance.now() });
		this._q = this._q.filter((P) => P.A !== A);
		for (const s of Object.values(this.sheets)) if (s.uses(id)) s.clips = {};      // (nada de clipe guardado apontando para ele)
	},
	_free(P) {
		if (P.tex) { P.tex.dispose(); this._res -= P.w * P.h * 2; this._live.delete(P); }
		if (P.mat) P.mat.dispose();
		if (P.sil) P.sil.dispose();
		P.tex = P.mat = P.sil = null;
	},
	// (tick) Atlas descartados que alguém ainda desenhava: quem já não espera uma página nova (ou esperou 10 s) larga o último quadro
	// (_lostPage: some até desenhar de novo); sem ninguém, as texturas saem da GPU.
	_reap() {
		const t = performance.now();
		this._zombies = this._zombies.filter((Z) => {
			const age = t - Z.t;
			if (age < 250 || (Z.n = (Z.n || 0) + 1) < 3) return true;       // (o SpriteActor ainda vai refazer o clipe e pedir a página nova — 2 quadros, mesmo a 2 quadros/s)
			let busy = false;
			if (typeof SpriteActor !== 'undefined') for (const a of SpriteActor.live) {
				if (!a._pg || a._pg.A !== Z.A) continue;
				if (age < 10000 && a._wait && a._wait.A !== Z.A) busy = true; else a._lostPage();
			}
			if (busy) return true;
			for (const P of Z.A.pages) this._free(P);
			return false;
		});
	},

	// Folha de um tipo. legacy = folha antiga para o que o atlas não tem (a primeira que pedir fica).
	sheet(id, legacy = null, legacyVariant = 2) {
		const s = this.sheets[id] || (this.sheets[id] = new NpcSheet(id));
		if (legacy && !s.legacy) { s.legacy = legacy; s.legacyVariant = legacyVariant; }
		return s;
	},

	// ------------------------------------------------------------------ ESTADO DE DANO pintado (1 sujo, 2 machucado, 3 muito machucado)
	// Pedestre/policial machucado: a folha "<tipo>#d<nível>" usa o atlas de dano do tipo — o dano foi PINTADO na roupa e na pele no build
	// (tools/asset_baker: terra, cortes, rasgos, sangue; as cores continuam as da paleta de cada um) — e, para o clipe que ele não tem
	// (só os de DANO têm camada), o atlas normal do tipo. Sem uso há 30 s, o atlas de dano sai da memória (volta dos arquivos).
	// O jogador usa o mesmo esquema (PlayerLook monta a lista de atlas da folha dele).
	// Atlas de dano: os clipes com dano do manifesto (os MESMOS retângulos da base) sobre páginas = página base + camada do nível. Páginas
	// sem nenhum clipe com dano não são pedidas (unused). null = o tipo não tem esse nível (bake sem dano).
	dmgAtlas(id, lvl) {
		const sid = id + '#d' + lvl;
		if (this.atlases[sid]) return sid;
		const B = this.atlases[id], D = B && B.dmgInfo, L = D && D.levels[lvl];
		if (!L) return null;
		const clips = {}, used = new Set();
		for (const key of D.clips) { const c = B.data.clips[key]; if (c) { clips[key] = c; for (const p of c.pd) used.add(p); } }
		const pages = B.pages.map((P, i) => ({ w: P.w, h: P.h, g: P.g, par: P.par, file: P.file, ov: L[i] || null, bytes: P.bytes, unused: !used.has(i) }));
		const A = this._atlas(sid, { clips, k: B.data.k, v: B.data.v, frame: B.data.frame }, pages, true);
		if (B.scale) A.scale = B.scale;
		return sid;
	},
	dmgSheet(id, lvl) {
		const sid = id + '#d' + lvl;
		let s = this.sheets[sid];
		if (!s) {
			const b = this.sheets[id];
			s = this.sheets[sid] = new NpcSheet(sid);
			s.fallbackAtlas = id; s.baseId = id; s.dmgLvl = lvl;
			if (b) { s.legacy = b.legacy; s.legacyVariant = b.legacyVariant; }
		}
		this.dmgAtlas(id, lvl);
		return s;
	},
	// O ator passa a usar a folha do nível de dano (0 = a normal), no mesmo clipe e na mesma fase.
	applyDamage(actor, lvl) {
		const sh = actor.sheet;
		if (!sh || !sh.isNpc || sh.npcRemap || (this._lib && sh === this._lib.sheets.hero)) return;
		const base = sh.baseId || sh.id, to = lvl > 0 ? this.dmgSheet(base, lvl) : this.sheets[base];
		if (!to || to === sh) return;
		const name = actor.clipName || 'idle', w = actor.clip ? actor.clip.weapon : 'none', ph = actor.phase;
		actor.useSheet(to);
		if (actor.play(name, w, { restart: true })) actor.setPhase(ph);
	},

	// Liga o NpcArt à biblioteca de sprites: as folhas antigas de gente passam a virar tipos 2,5D; o jogador ganha a folha "hero".
	attach(lib) {
		if (!this.available()) return false;
		this.init(lib.scene);
		// (rider/courier: quem pilota moto, bicicleta, jet ski e lancha — o tipo ganha os clipes ride_* em 16 direções)
		for (const k of ['civA', 'civB', 'police', 'swat', 'army', 'rider', 'courier']) {
			const s = lib.sheets[k];
			if (s) s.npcRemap = (v, name) => this.remap(k, v, name, s);
		}
		const hero = lib.sheets.hero = this.sheet('protagonista', lib.sheets.player, 0);
		hero.setChain(this.HERO.filter((id) => this.atlases[id]));        // (principal, tático, armas novas — PlayerLook troca pelo visual e o dano)
		this._lib = lib;
		hero.legacyVariant = 0;
		lib.npc = this;
		return true;
	},

	// ------------------------------------------------------------------ quem é quem
	// Grupo de roupa (lugar) a partir da variante de cor antiga (CharacterRig.VARIANT_GROUPS) e da folha antiga.
	_groupOf(sheetName, v) {
		if (sheetName === 'courier' || (sheetName === 'rider' && v >= CharacterRig.VARIANT_COURIER && v < CharacterRig.VARIANT_COURIER + CharacterRig.COURIERS)) return 'courier';
		if (sheetName === 'police') return 'police';
		if (sheetName === 'swat') return 'swat';
		if (sheetName === 'army') return 'army';
		if (v === 1) return 'police';
		const VG = CharacterRig.VARIANT_GROUPS;
		for (const [g, [a, b]] of Object.entries(VG)) if (v >= a && v <= b) return g;
		if (v === CharacterRig.VARIANT_SWAT) return 'swat';
		if (v === CharacterRig.VARIANT_ARMY) return 'army';
		return 'casual';
	},
	// Tipo + variante de alguém de um grupo, escolhido pela semente (mesma semente = mesma pessoa).
	pick(group, seed) {
		const D = NpcData;
		let types = D.typesFor(group).filter((id) => this.atlases[id]);
		if (!types.length) types = D.typesFor('casual').filter((id) => this.atlases[id]);
		if (!types.length) return null;
		const id = types[seed % types.length], v = Math.floor(seed / 977) % D.nvar(id);
		return { id, v, row: this.row(id, v) };
	},
	_seen: new Map(),
	// Boneco antigo → tipo novo. A semente vem do nome do sprite (cada NPC tem o seu) + a variante antiga.
	remap(sheetName, variant, name, legacy = null) {
		if (!this._scene) return null;
		// Piloto variante 0 = o jogador (subiu na moto/barco): a folha dele, com o visual dele.
		if ((sheetName === 'rider' || sheetName === 'courier') && variant === 0 && this._lib && this._lib.sheets.hero) return { sheet: this._lib.sheets.hero, row: 0, type: 'protagonista' };
		const n = (this._seen.get(name) || 0) + 1;
		this._seen.set(name, n);
		const seed = NpcData.hashStr(`${name}#${n}:${sheetName}:${variant}`);
		const p = this.pick(this._groupOf(sheetName, variant), seed);
		return p ? { sheet: this.sheet(p.id, legacy, variant), row: p.row, type: p.id } : null;
	},
};

// ----------------------------------------------------------------------------
// NpcSheet — folha de um tipo 2,5D com a interface da CharacterSheet (o SpriteActor e o resto do jogo não precisam saber).
// Clipe que o atlas não tem: com outra arma → a versão sem arma; senão → a folha antiga equivalente (ex.: subir na moto).
// ----------------------------------------------------------------------------
class NpcSheet {
	constructor(id) {
		this.id = id; this.name = id; this.atlasName = id; this.isNpc = true;
		this.dirs = 8; this.frame = 64;
		this.clips = {}; this.pending = [];
		this.legacy = null;               // CharacterSheet para o que o atlas não tem (definida pela SpriteLibrary)
		this.legacyVariant = 2;
		this.fallbackAtlas = null;        // outro atlas do mesmo personagem (dano: o atlas normal do tipo, para os clipes sem dano)
		this.extraAtlas = null;           // atlas COMPANHEIRO com o que não coube no principal (o jogador: os clipes táticos)
		this.armsAtlas = null;            // o outro companheiro do jogador: as armas novas (silenciador, RPG, lança-foguetes, minigun)
		this.chain = null;                // lista explícita de atlas, na ordem de procura (o jogador: PlayerLook.setChain) — vale no lugar dos 4 acima
		this.pinned = null;               // os da lista que ficam presos na GPU (o jogador: os que ele usa; null = todos — NpcArt._pins)
		this.dmgLvl = 0;                  // folha de dano (NpcArt.dmgSheet): o nível
	}
	// Atlas onde um clipe é procurado, na ordem.
	atlasList() { return this.chain || [this.atlasName, this.fallbackAtlas, this.extraAtlas, this.armsAtlas].filter(Boolean); }
	uses(id) { return this.atlasList().includes(id); }
	_key(name, weapon) { return name + ':' + (weapon || 'none'); }
	getClip(name, weapon = 'none') {
		const w = weapon || 'none', key = this._key(name, w);
		if (key in this.clips) return this.clips[key];
		// (folha de dano cujo atlas saiu da memória por falta de uso: recriado — as páginas voltam dos arquivos quando pedidas)
		if (this.dmgLvl && !NpcArt.atlases[this.atlasName]) NpcArt.dmgAtlas(this.baseId, this.dmgLvl);
		const L = this.atlasList();
		let c = null;
		for (const id of L) if ((c = NpcArt.clip(id, key))) break;
		if (!c && w !== 'none') {
			const def = CharacterRig.CLIPS[name];
			if (def && !def.weapons) for (const id of L) if ((c = NpcArt.clip(id, this._key(name, 'none')))) break;
		}
		if (!c && w === 'knife') c = this.getClip(name, 'none');            // (faca sem o desenho dela neste atlas: o clipe de mãos livres)
		if (!c && this.legacy && CharacterRig.CLIPS[name]) c = this.legacy.getClip(name, w);      // (clipes novos, como 'holdup', só existem aqui)
		if (!c && CharacterRig.CLIPS[name] && !CharacterRig.CLIPS[name].weapons) c = NpcArt.clip(this.atlasName, 'idle:none');
		this.clips[key] = c || null;
		return this.clips[key];
	}
	// Troca o atlas / a lista de atlas (o jogador com outra roupa, machucado…): os clipes são procurados de novo.
	setAtlas(id) { this.atlasName = id; this.clips = {}; }
	setChain(list) { this.chain = list.filter(Boolean); this.atlasName = this.chain[0]; this.clips = {}; }
	_resolve(name, weapon) { const def = CharacterRig.CLIPS[name]; if (!def) return null; let w = weapon || 'none'; if (def.weapons && !def.weapons.includes(w)) return null; return { def, w, key: name + ':' + w }; }
	warm() {} queue() {} pump() { return false; } disposeClips() { this.clips = {}; }
}

NpcArt.boot();          // dados e manifestos já (main.js espera antes de montar o mundo); as páginas do protagonista decodificam durante a abertura
