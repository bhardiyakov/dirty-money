// ============================================================================
// DIRTY MONEY - Criminal Simulator MVP
// Ponto de entrada. Instancia o Game, mostra o menu principal e só então dispara a fila de carregamento.
// ============================================================================

class MainMenu {
	constructor(game) {
		this.game = game;
		this.root = document.getElementById('main-menu');
		this.btnNew = document.getElementById('btn-new');
		this.btnLoad = document.getElementById('btn-load');
		this.started = false;

		this.save = this._readSave();
		const hasSave = this.save !== null;
		this.btnLoad.disabled = !hasSave;
		this.btnLoad.classList.toggle('mm-disabled', !hasSave);
		if (hasSave) { this.btnLoad.title = I18n.t('menu.lastSave', { label: SaveGame.label(this.save) }); this.btnLoad.innerHTML = `${I18n.t('menu.load')}<small>${SaveGame.label(this.save)}</small>`; }

		// Novo jogo: no 1º espaço livre; com os 3 ocupados, escolhe qual o jogo novo vai usar. Carregar: escolhe o espaço.
		this.btnNew.addEventListener('click', () => {
			if (this.started) return;
			if (SaveGame.list().includes(null)) { SaveGame.slot = SaveGame.firstEmpty(); this._start('new'); return; }
			SaveSlots.open('new', (i) => { SaveGame.slot = i; this._start('new'); }, { title: 'Novo jogo', sub: 'Os 3 espaços estão ocupados: escolha qual o jogo novo vai usar' });
		});
		this.btnLoad.addEventListener('click', () => {
			if (this.started || this.btnLoad.disabled) return;
			SaveSlots.open('load', (i, s) => { SaveGame.slot = i; this.save = s; this._start('load'); }, { title: 'Carregar jogo', sub: 'Escolha o save' });
		});
		this.btnNew.focus();
		this._initSettings();
		if (window.Intro) Intro.menuReady();                          // a abertura (script inline no index.html) mostra logo e botões
	}

	// Configurações: mesmas chaves do menu de pausa (dm_settings), então valem também dentro do jogo.
	_initSettings() {
		const panel = document.getElementById('mm-settings');
		const vol = document.getElementById('set-volume'), volVal = document.getElementById('set-volume-val');
		const s = this.game.menu.settings;
		const toggles = [...panel.querySelectorAll('.mm-toggle[data-key]')], gfx = document.getElementById('set-gfx'), lang = document.getElementById('set-lang');
		const render = () => {
			vol.value = Math.round(s.volume * 100);
			volVal.textContent = vol.value + '%';
			for (const t of toggles) {
				const on = !!s[t.dataset.key];
				t.classList.toggle('is-on', on);
				t.textContent = I18n.t(on ? (t.dataset.on || 'common.on') : (t.dataset.off || 'common.off'));
			}
			gfx.textContent = Graphics.label(s.graphics);
			lang.textContent = I18n.label(s.language);
		};
		const commit = () => { this.game.menu._saveSettings(); this.game.menu.applySettings(); render(); };
		vol.addEventListener('input', () => { s.volume = vol.value / 100; commit(); });
		for (const t of toggles) t.addEventListener('click', () => { s[t.dataset.key] = !s[t.dataset.key]; commit(); });
		// Graphics preset: applied on page load, and nothing has started yet here — the menu reloads right away with the new one.
		gfx.addEventListener('click', () => { s.graphics = Graphics.next(s.graphics || 'auto'); commit(); location.reload(); });
		lang.addEventListener('click', () => { s.language = I18n.next(I18n.lang); commit(); location.reload(); });      // (same: texts are read once, at start)
		const open = (v) => { panel.classList.toggle('open', v); if (v) render(); (v ? document.getElementById('btn-settings-back') : document.getElementById('btn-settings')).focus(); };
		window.addEventListener('dm-settings', render);                                  // (o giroscópio pode desligar sozinho: PauseMenu)
		document.getElementById('btn-settings').addEventListener('click', () => open(true));
		document.getElementById('btn-settings-back').addEventListener('click', () => open(false));
		window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel.classList.contains('open')) open(false); });
	}

	_readSave() { return SaveGame.read(); }

	_start(mode) {
		if (this.started) return;
		this.started = true;
		this.btnNew.disabled = true;
		this.btnLoad.disabled = true;

		if (window.Intro) Intro.loading();                     // logo e botões saem, a faixa de carregamento sobe; os fundos continuam passando

		// Fila de carregamento (sprites, materiais congelados, shaders); o runRenderLoop só nasce no fim do boot.
		this.game.begin(mode, mode === 'load' ? this.save : null);
	}
}

// ============================================================================
// SimBridge — ponte Main Thread ⇄ Web Worker de simulação (src/sim/worker.js).
//   • set(id, campos): registra a mudança num mapa pendente (várias chamadas no mesmo quadro viram UM registro).
//   • flush(): uma vez por quadro (fim do quadro do Babylon) empacota tudo num ArrayBuffer e TRANSFERE ao worker (zero cópia).
//   • O worker devolve os buffers (RECYCLE) e manda STATE com o que ELE mudou; o espelho `entities` é atualizado e os
//     ouvintes de onState recebem os ids mudados. Nada disso bloqueia o render: o main só copia números de/para buffers.
// SharedArrayBuffer não é usado: exige cross-origin isolation (cabeçalhos COOP/COEP), que um jogo offline servido como arquivos
// estáticos não garante; buffers transferíveis em pingue-pongue dão o mesmo "sem cópia" sem esse requisito.
// ============================================================================

class SimBridge {
	constructor(url = './src/sim/worker.js') {
		this.entities = new Map();              // espelho do estado: id → entidade (mesmos campos da SimEntity)
		this.pending = new Map();               // id → entidade a enviar no próximo flush
		this.listeners = [];
		this._pool = [];
		this._changed = [];
		this.worker = SimBridge._spawn(url);
		this.worker.onmessage = (ev) => this._onMessage(ev.data);
		this.worker.postMessage({ t: SimSchema.MSG.INIT });
	}

	// Worker de verdade por http(s); em file:// (duplo clique) o navegador recusa, então a simulação roda aqui mesmo, com a mesma
	// troca de mensagens (assíncrona, em ordem). Sem transferência real: os buffers continuam indo e voltando em pingue-pongue.
	static _spawn(url) {
		if (/^https?:$/.test(location.protocol)) {
			try { return new Worker(url); } catch (e) { console.warn('[SIM] Worker indisponível, simulação na Main Thread:', e); }
		}
		const main = { onmessage: null, postMessage: (data) => setTimeout(() => scope.onmessage && scope.onmessage({ data })) };
		const scope = { onmessage: null, postMessage: (data) => setTimeout(() => main.onmessage && main.onmessage({ data })) };
		startSimWorker(scope);
		return main;
	}

	// Cria/atualiza a entidade `id` com os campos dados (kind, x, z, districtZone, tags, craftYield, factionValue, noiseMask, suspicionLevel).
	set(id, fields) {
		let e = this.entities.get(id);
		if (!e) this.entities.set(id, e = { id, kind: 0, x: 0, z: 0, districtZone: 0, tags: 0, craftYield: 0, factionValue: 0, noiseMask: 0, suspicionLevel: 0 });
		Object.assign(e, fields);
		this.pending.set(id, e);
		return e;
	}

	remove(id) {
		this.entities.delete(id);
		this.pending.delete(id);
		this.worker.postMessage({ t: SimSchema.MSG.REMOVE, ids: [id] });
	}

	// fn(idsMudados, bridge) a cada STATE do worker.
	onState(fn) { this.listeners.push(fn); }

	flush() {
		const n = this.pending.size;
		if (!n) return;
		let buf = this._pool.pop();
		if (!buf || SimSchema.capacity(buf) < n) buf = SimSchema.alloc(n);
		const view = new Float64Array(buf);
		let i = 0;
		for (const e of this.pending.values()) SimSchema.write(view, i++, e);
		this.pending.clear();
		this.worker.postMessage({ t: SimSchema.MSG.UPSERT, buf, n }, [buf]);
	}

	_onMessage(m) {
		const M = SimSchema.MSG;
		if (m.t === M.RECYCLE) { this._pool.push(m.buf); return; }
		if (m.t !== M.STATE) return;
		const view = new Float64Array(m.buf), ids = this._changed;
		ids.length = 0;
		for (let i = 0; i < m.n; i++) {
			const id = view[i * SimSchema.STRIDE + SimSchema.F.ID];
			if (this.pending.has(id)) continue;                 // mudança local mais nova ainda não enviada: ela vence
			let e = this.entities.get(id);
			if (!e) this.entities.set(id, e = {});
			SimSchema.read(view, i, e);
			ids.push(id);
		}
		this.worker.postMessage({ t: M.RECYCLE, buf: m.buf }, [m.buf]);
		if (ids.length) for (const fn of this.listeners) fn(ids, this);
	}
}

// ABERTURA: enquanto a tela do estúdio (window.Studio, inline no index.html) passa os créditos, a carga pesada roda aqui em PASSOS, com um
// quadro de respiro entre eles (a tela mostra o passo e a barrinha anda; as animações dela são CSS e seguem até durante um passo longo):
// o mapa (CityGrid.steps), a arte essencial, o mundo 3D (new Game) e a pré-carga do jogo (física, pedestres, sprites, shaders —
// Game.preload). Só então a tela do estúdio sai e entra o menu; o "Novo Jogo" depois só faz o que falta (a barra não empaca).
window.addEventListener('DOMContentLoaded', async () => {
	const S = window.Studio || null, frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
	const step = async (label, p, ms, fn) => { if (S) S.step(label, p, ms); await frame(); return fn(); };
	try {
		await I18n.load();                                                           // os textos no idioma escolhido, antes do menu
		I18n.apply(document);
		if (window.DEFER_WORLD) {                                                    // o mapa: ~25 → 52% da barra
			const L = CityGrid.steps(), MS = [300, 450, 450, 600, 200, 350, 300];
			for (let i = 0; i < L.length; i++) await step(L[i].label, 0.26 + 0.26 * (i + 1) / L.length, MS[i] || 300, L[i].run);
		}
		// Arte em PNG (assets/sprites, ver SpriteIO): espera só as paletas e os clipes do 1º segundo de jogo; o resto baixa em segundo
		// plano (a carga do jogo espera SpriteIO.ready). Sem manifesto/em file://: tudo procedural.
		await step('Preparando a arte…', 0.55, 400, async () => {
			const ess = new Set();
			for (const [sheet, list] of Object.entries(CharacterSheet.ESSENTIAL)) for (const [n, w] of list) ess.add(CharacterSheet.fileKey(sheet, n, w || 'none'));
			await SpriteIO.init((k) => k.startsWith('pal/') || ess.has(k));
		});
		// Personagens 2,5D: npc-data.json e os manifestos dos atlas prontos (assets/baked — já pedidos desde a carga do NpcArt.js);
		// sem eles (file://, rede fora) o jogo segue com os bonecos antigos.
		await step('Carregando os personagens…', 0.6, 500, () => (typeof NpcArt !== 'undefined' ? Promise.race([NpcArt.boot(), new Promise((r) => setTimeout(r, 20000))]) : null));
		await step('Construindo a cidade em 3D…', 0.68, 1800, () => { window.game = new Game('canvas'); });
		window.sim = new SimBridge();
		window.game.gameEngine.engine.onEndFrameObservable.add(() => window.sim.flush());      // um lote por quadro, depois do render
		if (location.search.includes('debug')) DebugTools.install(window.game);
		window.mainMenu = new MainMenu(window.game);
		console.log('%cDIRTY MONEY iniciado', 'color:#00ff78');
		if (S) await window.game.preload((t, p, ms) => S.step(t, 0.7 + 0.3 * p, ms));          // (sem a tela do estúdio, a pré-carga roda no boot)
	} catch (e) {
		console.error('[ABERTURA] falha na carga:', e);
	}
	if (S) S.ready();                                                                // a tela do estúdio sai (no fim dos créditos ou já, se pulada)
});

// Cache offline (sw.js): a partir da 2ª visita o jogo e as bibliotecas (~7 MB) saem do aparelho, e funciona sem internet. Só por
// http(s); registrado depois do 'load' para não disputar banda com a primeira carga.
window.addEventListener('load', () => {
	// No app instalado (Tauri) tudo já vem no instalador: o cache offline não serve para nada lá.
	if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol) || '__TAURI_INTERNALS__' in window) return;
	navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('[SW] sem cache offline:', e));
});
