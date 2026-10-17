// ============================================================================
// Wardrobe — o GUARDA-ROUPA: o único lugar do jogo onde um desenho de personagem é gerado, e só com a tela de equipamento aberta
// (Inventário → Equipamento; o jogo está pausado). Todo o resto vem pronto do build (assets/baked) ou do que o guarda-roupa já gravou.
//
//   • setActive(true) ao abrir a tela: PlayerLook.sync → ensure(chave, ficha) se a forma vestida não está no aparelho. Os Workers
//     (assets/baked/wardrobe.worker.js = o gerador empacotado no build) desenham os clipes que faltam e GRAVAM cada um no IndexedDB; no
//     fim de cada etapa um deles empacota as páginas e grava o atlas pronto; aí o PlayerLook lê de lá (saved) e o visual troca.
//     Etapas: o visual limpo (principal + tático + armas novas e os clipes de carregar a bolsa da mão, se tiver) e depois os níveis de
//     dano (2, 1, 3).
//   • setActive(false) ao sair: os Workers são ENCERRADOS (terminate) — nada do gerador fica na memória do jogo, nem do lado deles nem
//     deste (a thread principal só troca mensagens pequenas: nenhum pixel do visual passa por aqui). O que já foi gravado fica: na
//     próxima visita continua de onde parou; recarregou o jogo com a mesma roupa, o visual é lido do aparelho, sem gerar de novo.
//   • preview(ficha, cb) — o boneco girando da tela (um Worker à parte, também encerrado ao sair).
//   • onChange(status) — a barra de progresso da tela (EquipUI); status = { stage: 'look' | 'dmg', lvl, pct } ou null (nada a fazer).
// ============================================================================

const Wardrobe = {
	URL: './assets/baked/wardrobe.worker.js',
	active: false,
	ws: [],                 // Workers de desenho
	pw: null,               // Worker da prévia
	job: 0,
	cur: null,              // { job, key, ck, stages, si } — o visual sendo montado
	onChange: null,
	onLeave: null,
	error: null,

	available() { return typeof NpcData !== 'undefined' && NpcData.ok && typeof Worker === 'function' && typeof indexedDB !== 'undefined' && location.protocol !== 'file:'; },
	// Workers de desenho: os núcleos menos 1 (o jogo está pausado), de 1 a 4; perfil leve, até 2.
	count() { return Math.max(1, Math.min(NpcArt.lite ? 2 : 4, (navigator.hardwareConcurrency || 2) - 1)); },

	setActive(on) {
		on = !!on && this.available() && typeof PlayerLook !== 'undefined' && PlayerLook.ok;
		if (on === this.active) return;
		this.active = on;
		if (on) { this.error = null; PlayerLook.sync(); return; }
		const was = this.cur;
		for (const w of this.ws) w.terminate();
		if (this.pw) this.pw.terminate();
		this.ws = []; this.pw = null; this.cur = null; this._pv = null; this.job++;
		if (this.onLeave) this.onLeave();
		if (was && was.key === PlayerLook.want) {                          // saiu no meio: o que foi gravado fica para a próxima visita
			const ui = PlayerLook.game && PlayerLook.game.ui;
			if (ui && ui.toast) ui.toast('Visual pela metade: volte ao Equipamento para terminar de montar');
		}
		this._emit();
	},

	// Monta o que falta do visual `key` (ficha `spec`): limpo (principal, tático, armas novas, bolsa da mão) e depois os níveis de dano.
	async ensure(key, spec) {
		if (!this.active || PlayerLook.isDefault(key) || (this.cur && this.cur.key === key)) return;
		const job = ++this.job;
		this._cancel();
		const ck = PlayerLook.ck(key), sets = PlayerLook.sets(spec), hk = sets.hand && ck + '|h:' + sets.hand.kind;
		const keys = [ck, ck + '|t', ck + '|w', ck + '|d1', ck + '|d2', ck + '|d3'].concat(hk ? [hk] : []);
		const has = await PlayerLook.idbHas(keys);
		if (job !== this.job || !this.active) return;
		const stages = [], clean = [];
		if (!has[ck] || !has[ck + '|t']) clean.push({ key: ck, part: 'main', keys: sets.main }, { key: ck + '|t', part: 'tac', keys: sets.tac });
		if (sets.arms && !has[ck + '|w']) clean.push({ key: ck + '|w', part: 'arms', keys: sets.arms });
		if (hk && !has[hk]) clean.push({ key: hk, part: 'h:' + sets.hand.kind, keys: sets.hand.keys });      // (a ficha leva a bolsa: o Worker a desenha na mão)
		if (clean.length) stages.push({ name: 'look', spec, sets: clean });
		const names = new Set(NpcData.dmgClips(true)), all = sets.main.concat(sets.tac, sets.arms || []), dk = all.filter((c) => names.has(c.split(':')[0]));
		for (const lvl of [2, 1, 3]) if (!has[ck + '|d' + lvl] && dk.length) stages.push({ name: 'dmg', lvl, spec: Object.assign({}, spec, { dmg: lvl }), sets: [{ key: ck + '|d' + lvl, part: 'd' + lvl, keys: dk }] });
		if (!stages.length) { this.cur = null; this._emit(); return; }
		this.cur = { job, key, ck, stages, si: 0 };
		this._stage();
	},
	_cancel() {
		const C = this.cur;
		if (!C) return;
		for (const w of this.ws) { if (w._busy) w.postMessage({ type: 'cancel', job: C.job }); }
		this.cur = null;
	},
	_stage() {
		const C = this.cur;
		if (!C || C.job !== this.job) return;
		const S = C.stages[C.si];
		if (!S) { this.cur = null; this._emit(); return; }
		S.queue = [];
		for (const set of S.sets) for (let i = 0; i < set.keys.length; i += 2) S.queue.push({ part: set.part, keys: set.keys.slice(i, i + 2) });
		S.total = S.sets.reduce((n, set) => n + set.keys.length, 0); S.done = 0; S.packing = false;
		while (this.ws.length < this.count()) this.ws.push(this._spawn());
		this._emit();
		this._dispatch();
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
		for (const w of this.ws) {
			if (w._busy || !S.queue.length) continue;
			const ch = S.queue.shift();
			w._busy = ch; w._frac = 0; w._job = C.job;
			w.postMessage({ type: 'clips', job: C.job, ck: C.ck, part: ch.part, spec: S.spec, keys: ch.keys, k: PlayerLook.k(), dirs: PlayerLook.dirs() });
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
			PlayerLook.saved(C.key, m.packed);                               // (lê do aparelho e troca o visual)
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
		this._emit();
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
