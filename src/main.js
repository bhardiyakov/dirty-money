// ============================================================================
// DIRTY MONEY - Criminal Simulator MVP
// Ponto de entrada. Instancia o Game, mostra o menu principal e só então dispara a fila de carregamento.
// ============================================================================

class MainMenu {
    static SAVE_KEY = 'dm_save';

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
        if (hasSave) { this.btnLoad.title = 'Último save: ' + SaveGame.label(this.save); this.btnLoad.innerHTML = `Carregar Jogo<small>${SaveGame.label(this.save)}</small>`; }

        this.btnNew.addEventListener('click', () => this._start('new'));
        this.btnLoad.addEventListener('click', () => this._start('load'));
        this.btnNew.focus();
        this._initSettings();
        if (window.Intro) Intro.menuReady();                          // a abertura (script inline no index.html) mostra logo e botões
    }

    // Configurações: mesmas chaves do menu de pausa (dm_settings), então valem também dentro do jogo.
    _initSettings() {
        const panel = document.getElementById('mm-settings');
        const vol = document.getElementById('set-volume'), volVal = document.getElementById('set-volume-val');
        const s = this.game.menu.settings;
        const toggles = [...panel.querySelectorAll('.mm-toggle')];
        const render = () => {
            vol.value = Math.round(s.volume * 100);
            volVal.textContent = vol.value + '%';
            for (const t of toggles) {
                const on = !!s[t.dataset.key];
                t.classList.toggle('is-on', on);
                t.textContent = on ? 'Ligado' : 'Desligado';
            }
        };
        const commit = () => { this.game.menu._saveSettings(); this.game.menu.applySettings(); render(); };
        vol.addEventListener('input', () => { s.volume = vol.value / 100; commit(); });
        for (const t of toggles) t.addEventListener('click', () => { s[t.dataset.key] = !s[t.dataset.key]; commit(); });
        const open = (v) => { panel.classList.toggle('open', v); if (v) render(); (v ? document.getElementById('btn-settings-back') : document.getElementById('btn-settings')).focus(); };
        document.getElementById('btn-settings').addEventListener('click', () => open(true));
        document.getElementById('btn-settings-back').addEventListener('click', () => open(false));
        window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel.classList.contains('open')) open(false); });
    }

    _readSave() {
        try {
            const raw = localStorage.getItem(MainMenu.SAVE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

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
        this.worker = new Worker(url);
        this.worker.onmessage = (ev) => this._onMessage(ev.data);
        this.worker.postMessage({ t: SimSchema.MSG.INIT });
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

window.addEventListener('DOMContentLoaded', async () => {
    // Arte em PNG (assets/sprites, ver SpriteIO): espera só as paletas e os clipes do 1º segundo de jogo; o resto baixa em segundo
    // plano enquanto o jogador está no menu (a carga do jogo espera SpriteIO.ready). Sem manifesto/em file://: tudo procedural.
    const ess = new Set();
    for (const [sheet, list] of Object.entries(CharacterSheet.ESSENTIAL)) for (const [n, w] of list) ess.add(CharacterSheet.fileKey(sheet, n, w || 'none'));
    await SpriteIO.init((k) => k.startsWith('pal/') || ess.has(k));
    window.game = new Game('canvas');
    window.sim = new SimBridge();
    window.game.gameEngine.engine.onEndFrameObservable.add(() => window.sim.flush());      // um lote por quadro, depois do render
    if (location.search.includes('debug')) DebugTools.install(window.game);
    window.mainMenu = new MainMenu(window.game);
    console.log('%cDIRTY MONEY iniciado', 'color:#00ff78');
});

// Cache offline (sw.js): a partir da 2ª visita o jogo e as bibliotecas (~7 MB) saem do aparelho, e funciona sem internet. Só por
// http(s); registrado depois do 'load' para não disputar banda com a primeira carga.
window.addEventListener('load', () => {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('[SW] sem cache offline:', e));
});
