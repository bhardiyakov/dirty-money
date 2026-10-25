// ============================================================================
// Wardrobe — o GUARDA-ROUPA: o único lugar do jogo onde um desenho de personagem é gerado. Todo o resto vem pronto do build
// (assets/baked) ou do que o guarda-roupa já gravou no aparelho.
//
//   • ensure(chave, ficha) — PlayerLook pede quando a forma vestida não está no aparelho (trocou de roupa no armário, na boutique, o
//     porte mudou na academia…). Os Workers (assets/baked/wardrobe.worker.js = o gerador empacotado no build) desenham os clipes que
//     faltam e GRAVAM cada um no IndexedDB; no fim de cada etapa um deles empacota as páginas e grava o atlas pronto; aí o PlayerLook lê
//     de lá (saved). Etapas: o visual limpo (principal + tático + armas novas e os clipes de carregar a bolsa da mão, se tiver) e depois
//     os níveis de dano (2, 1, 3).
//   • TROCA NA HORA: enquanto o visual limpo é desenhado, cada direção de cada clipe vai para o jogo assim que fica pronta (atlas AO VIVO:
//     NpcArt.liveAtlas / liveAdd) e o jogador já aparece com a roupa nova. Primeiro o que ele está fazendo agora, na direção para onde
//     olha (depois as vizinhas), depois parado/andar/correr e o resto; o clipe que ele começar a tocar e ainda não foi desenhado passa
//     na frente da fila. O que ainda não foi desenhado sai do visual anterior.
//   • Roda durante o jogo também (menos Workers: o jogo não está pausado) e os Workers são ENCERRADOS (terminate) quando o visual termina
//     — nada do gerador fica na memória. Abrir a tela de equipamento já liga e aquece os Workers (setActive): a partida a frio do
//     gerador (~4 s) acontece antes de o jogador escolher a roupa.
//   • preview(ficha, cb) — o boneco girando da tela (um Worker à parte, encerrado ao sair dela).
//   • onChange(status) — a barra de progresso da tela (EquipUI); status = { stage: 'look' | 'dmg', lvl, pct } ou null (nada a fazer).
// ============================================================================

const Wardrobe = {
	URL: './assets/baked/wardrobe.worker.js',
	active: false,          // tela de equipamento aberta (jogo pausado)
	ws: [],                 // Workers de desenho
	pw: null,               // Worker da prévia
	job: 0,
	cur: null,              // { job, key, ck, stages, si, live } — o visual sendo montado (live = id do atlas ao vivo)
	onChange: null,
	onLeave: null,
	error: null,

	available() { return typeof NpcData !== 'undefined' && NpcData.ok && typeof Worker === 'function' && typeof indexedDB !== 'undefined' && location.protocol !== 'file:'; },
	// Workers de desenho: com o jogo pausado (tela aberta), os núcleos menos 1, de 1 a 4 (perfil leve, até 2); jogando, até 2, deixando
	// 2 núcleos para o jogo.
	count() {
		const n = navigator.hardwareConcurrency || 2;
		return this.active ? Math.max(1, Math.min(NpcArt.lite ? 2 : 4, n - 1)) : Math.max(1, Math.min(2, n - 2));
	},

	setActive(on) {
		on = !!on && this.available() && typeof PlayerLook !== 'undefined' && PlayerLook.ok;
		if (on === this.active) return;
		this.active = on;
		if (on) { this.error = null; this._warm(); PlayerLook.sync(); return; }
		if (this.pw) this.pw.terminate();
		this.pw = null; this._pv = null;
		if (this.onLeave) this.onLeave();
		if (this.cur) this._emit(); else this._idle();                     // (nada sendo desenhado: o gerador sai da memória — com uma folga)
	},
	// Workers ligados e com o gerador já montado para a ficha atual (a troca de roupa não espera a partida a frio).
	_warm() {
		const spec = PlayerLook.spec();
		while (this.ws.length < this.count()) { const w = this._spawn(); this.ws.push(w); this._warmOne(w, spec); }
	},
	// A peça sob o mouse / selecionada na tela (a prévia): os Workers parados já montam o gerador para ela, então vesti-la desenha o
	// primeiro quadro na hora. Um aquecimento por vez em cada Worker; o pedido seguinte espera (só o último vale).
	_warmFor(spec) {
		if (this.cur) return;
		for (const w of this.ws) { if (w._warming) w._nextWarm = spec; else if (!w._busy) this._warmOne(w, spec); }
	},
	_warmOne(w, spec) { w._warming = true; w._nextWarm = null; w.postMessage({ type: 'warm', spec, k: PlayerLook.k() }); },
	_stop() { clearTimeout(this._stopT); this._stopT = 0; for (const w of this.ws) w.terminate(); this.ws = []; },
	// Workers parados fora da tela saem depois de STOP_S s: a roupa trocada logo antes de fechar a tela (o pedido chega um instante
	// depois: ensure espera o IndexedDB) ainda pega os Workers aquecidos.
	STOP_S: 5,

	// Monta o que falta do visual `key` (ficha `spec`): limpo (principal, tático, armas novas, bolsa da mão) e depois os níveis de dano.
	async ensure(key, spec) {
		if (!this.available() || PlayerLook.isDefault(key) || (this.cur && this.cur.key === key)) return;
		const job = ++this.job;
		this._cancel();
		const ck = PlayerLook.ck(key), sets = PlayerLook.sets(spec), hk = sets.hand && ck + '|h:' + sets.hand.kind;
		const keys = [ck, ck + '|t', ck + '|w', ck + '|d1', ck + '|d2', ck + '|d3'].concat(hk ? [hk] : []);
		const has = await LookStore.hasAll(keys).catch(() => ({}));
		if (job !== this.job) return;
		const stages = [], clean = [], whole = !has[ck] || !has[ck + '|t'];
		if (whole) clean.push({ key: ck, part: 'main', keys: sets.main }, { key: ck + '|t', part: 'tac', keys: sets.tac });
		if (sets.arms && !has[ck + '|w']) clean.push({ key: ck + '|w', part: 'arms', keys: sets.arms });
		if (hk && !has[hk]) clean.push({ key: hk, part: 'h:' + sets.hand.kind, keys: sets.hand.keys });      // (a ficha leva a bolsa: o Worker a desenha na mão)
		if (clean.length) stages.push({ name: 'look', spec, sets: clean, live: whole });
		const names = new Set(NpcData.dmgClips(true)), all = sets.main.concat(sets.tac, sets.arms || []), dk = all.filter((c) => names.has(c.split(':')[0]));
		for (const lvl of [2, 1, 3]) if (!has[ck + '|d' + lvl] && dk.length) stages.push({ name: 'dmg', lvl, spec: Object.assign({}, spec, { dmg: lvl }), sets: [{ key: ck + '|d' + lvl, part: 'd' + lvl, keys: dk }] });
		if (!stages.length) { this._idle(); return; }
		this.cur = { job, key, ck, stages, si: 0, live: null };
		if (whole) {                                                       // (o visual inteiro falta: o jogador já o veste enquanto é desenhado)
			const B = NpcArt.atlases.protagonista, id = 'hero:live:' + job;
			NpcArt.liveAtlas(id, { k: PlayerLook.k(), v: (B && B.data.v) || 2, frame: B && B.data.frame });
			this.cur.live = id;
			PlayerLook.liveReady(key, id);
		}
		this._stage();
	},
	_cancel() {
		const C = this.cur;
		if (!C) return;
		for (const w of this.ws) { if (w._busy) w.postMessage({ type: 'cancel', job: C.job }); }
		this.cur = null;
	},
	// Nada mais a desenhar: fora da tela de equipamento, os Workers saem (STOP_S s depois, se nada novo chegar).
	_idle() {
		this.cur = null;
		clearTimeout(this._stopT);
		this._stopT = this.active ? 0 : setTimeout(() => { this._stopT = 0; if (!this.cur && !this.active) this._stop(); }, this.STOP_S * 1000);
		this._emit();
	},
	_stage() {
		const C = this.cur;
		if (!C || C.job !== this.job) return;
		const S = C.stages[C.si];
		if (!S) { this._idle(); return; }
		S.queue = [];
		const one = S.live, n = one ? 1 : 2;                               // (ao vivo: um clipe por pedido — o que o jogador precisa passa na frente)
		for (const set of S.sets) for (let i = 0; i < set.keys.length; i += n) S.queue.push({ part: set.part, keys: set.keys.slice(i, i + n) });
		if (one) this._order(S.queue);
		S.total = S.sets.reduce((k, set) => k + set.keys.length, 0); S.done = 0; S.packing = false;
		while (this.ws.length < this.count()) this.ws.push(this._spawn());
		this._emit();
		this._dispatch();
	},
	// Ordem do visual ao vivo: o clipe que o jogador toca agora, parado/andar/correr, o resto do dia a dia (armas na mão, agachado…), o resto.
	HOT: ['idle:none', 'walk:none', 'run:none'],
	HOT_NAMES: /^(idle|walk|run|walk_up|aim|draw|shoot|holdup|crouch|sneak|strafe|walk_heavy|run_heavy|idle_heavy)$/,
	_order(queue) {
		const cur = this._playing(), rank = (k) => {
			if (k === cur) return 0;
			const i = this.HOT.indexOf(k);
			return i >= 0 ? 1 + i : this.HOT_NAMES.test(k.split(':')[0]) ? 5 : 6;
		};
		queue.forEach((ch, i) => { ch.rank = rank(ch.keys[0]); ch.i = i; });
		queue.sort((a, b) => a.rank - b.rank || a.i - b.i);
	},
	// "nome:arma" do clipe que o jogador toca agora e que o atlas ao vivo ainda não tem (null = nenhum).
	_playing() {
		const C = this.cur, a = PlayerLook.game && PlayerLook.game.player && PlayerLook.game.player.actor, c = a && a.clip;
		return C && C.live && c && c.npc && c.atlas !== C.live ? c.name + ':' + c.weapon : null;
	},
	// Para onde o jogador olha (0–1 de uma volta): essa direção é desenhada primeiro.
	_facing() {
		const a = PlayerLook.game && PlayerLook.game.player && PlayerLook.game.player.actor, c = a && a.clip;
		return c && c.npc && a.dir >= 0 ? a.dir / (c.dirs || 16) : 0;
	},
	_spawn() {
		const w = new Worker(this.URL);
		w._busy = null; w._frac = 0;
		w.onmessage = (e) => this._msg(w, e.data);
		w.onerror = (e) => { if (e.preventDefault) e.preventDefault(); this._fail('o gerador do guarda-roupa não abriu (' + (e.message || 'Worker') + ')'); };
		return w;
	},
	_dispatch() {
		const C = this.cur, S = C && C.stages[C.si];
		if (!S || S.packing) return;
		const max = this.count();                                          // (abriu a tela no meio: mais Workers; fechou: os que sobram saem)
		while (this.ws.length < max) this.ws.push(this._spawn());
		this.ws = this.ws.filter((w, i) => { if (i < max || w._busy) return true; w.terminate(); return false; });
		for (const w of this.ws) {
			if (w._busy || !S.queue.length) continue;
			const want = S.live && this._playing(), at = want ? S.queue.findIndex((ch) => ch.keys[0] === want) : -1;
			const ch = S.queue.splice(Math.max(0, at), 1)[0];
			w._busy = ch; w._frac = 0; w._job = C.job;
			w.postMessage({ type: 'clips', job: C.job, ck: C.ck, part: ch.part, spec: S.spec, keys: ch.keys, k: PlayerLook.k(), dirs: PlayerLook.dirs(), live: !!S.live, first: this._facing() });
		}
		if (!S.queue.length && this.ws.every((w) => !w._busy)) {             // etapa desenhada: empacota e grava (num Worker)
			S.packing = true;
			const w = this.ws[0];
			w._busy = { pack: true }; w._job = C.job;
			w.postMessage({ type: 'pack', job: C.job, ck: C.ck, sets: S.sets, k: PlayerLook.k() });
			this._emit();
		}
	},
	_msg(w, m) {
		const C = this.cur, live = C && m.job === C.job, S = live && C.stages[C.si];
		if (m.frames) { if (this._pv && m.job === this._pv.job) this._pv.cb(m.frames, m.W, m.H, m.k); return; }      // (prévia)
		if (m.live) { if (live && C.live) NpcArt.liveAdd(C.live, m.live); return; }
		if (m.warmed) { w._warming = false; if (w._nextWarm && !this.cur) this._warmOne(w, w._nextWarm); else w._nextWarm = null; return; }
		if (m.clip) { if (S) { S.done++; w._frac = 0; this._emit(); } return; }
		if ('frac' in m) { if (S) { w._frac = m.frac; this._emitSoon(); } return; }
		if (m.done || m.cancelled || m.error || m.packed) {
			w._busy = null;
			if (!live) { this._dispatch(); return; }                         // (o pedido antigo parou: o Worker serve ao visual atual)
		}
		if (!live) return;
		if (m.error) { this._fail(m.error); return; }
		if (m.packed) {
			C.si++;
			this._persist();
			PlayerLook.saved(C.key, m.packed);                               // (lê do aparelho e troca o visual — o atlas ao vivo sai)
			this._stage();
			return;
		}
		if (m.done) this._dispatch();
	},
	// Armazenamento PERSISTENTE (uma vez, depois do primeiro visual gravado): sem ele o navegador pode apagar o IndexedDB quando falta
	// espaço e o visual teria de ser montado de novo. (Chrome decide sozinho, sem perguntar; Firefox pergunta uma vez.)
	_persist() {
		if (this._persistAsked || typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.persist) return;
		this._persistAsked = true;
		navigator.storage.persisted().then((ok) => ok || navigator.storage.persist()).catch(() => {});
	},
	_fail(msg) {
		console.warn('[GUARDA-ROUPA]', msg);
		this.error = 'Não deu para montar o visual agora.';
		this._cancel();
		this._idle();
	},

	// Prévia (o boneco girando): frames RGBA por direção.
	preview(spec, cb) {
		if (!this.active) return false;
		if (!this.pw) {
			this.pw = new Worker(this.URL);
			this.pw.onmessage = (e) => this._msg(this.pw, e.data);
			this.pw.onerror = (e) => { if (e.preventDefault) e.preventDefault(); console.warn('[GUARDA-ROUPA] prévia:', e.message); };
		}
		if (this._pv) this.pw.postMessage({ type: 'cancel', job: this._pv.job });      // (passou o mouse por outro item: a anterior não serve)
		const job = (this._pvSeq = (this._pvSeq || 0) + 1) + 1e9;
		this._pv = { job, cb };
		this.pw.postMessage({ type: 'preview', job, spec, k: PlayerLook.k(), dirs: PlayerLook.previewDirs() });
		this._warmFor(spec);
		return true;
	},

	status() {
		if (this.error) return { error: this.error };
		const C = this.cur, S = C && C.stages[C.si];
		if (!S || !S.total) return null;
		let f = S.done;
		for (const w of this.ws) if (w._busy && !w._busy.pack) f += Math.min(0.99, w._frac || 0);
		const done = C.stages.slice(0, C.si).length, pct = S.packing ? 1 : Math.min(1, f / S.total);
		return { stage: S.name, lvl: S.lvl || 0, pct, packing: !!S.packing, step: done + 1, steps: C.stages.length };
	},
	_emit() { if (this.onChange) this.onChange(this.status()); },
	_emitSoon() { if (this._emT) return; this._emT = setTimeout(() => { this._emT = 0; this._emit(); }, 250); },
};
