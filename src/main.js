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
        this.loading = document.getElementById('loading-screen');
        this.started = false;

        this.save = this._readSave();
        const hasSave = this.save !== null;
        this.btnLoad.disabled = !hasSave;
        this.btnLoad.classList.toggle('mm-disabled', !hasSave);
        if (hasSave) this.btnLoad.title = 'Último save: ' + SaveGame.label(this.save);

        this.btnNew.addEventListener('click', () => this._start('new'));
        this.btnLoad.addEventListener('click', () => this._start('load'));
        this.btnNew.focus();
        this._initSlideshow();
        this._initSettings();
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
                t.textContent = on ? 'LIGADO' : 'DESLIG.';
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

    // Fundos em tela cheia: troca a cada 2 s com um glitch (tremida, cores trocadas, fatias cortadas e barras RGB).
    _initSlideshow() {
        const bg = document.getElementById('mm-bg'), bars = document.getElementById('mm-bars');
        if (!bg) return;
        const files = [1, 2, 3, 4, 5, 6].map((n) => `./assets/bg${n}.jpg`);
        this.slides = files.map((f) => {
            new Image().src = f;                                       // pré-carrega
            const d = document.createElement('div');
            d.className = 'mm-slide';
            d.style.backgroundImage = `url(${f})`;
            bg.appendChild(d);
            return d;
        });
        this.slideIdx = 0;
        this.slides[0].classList.add('on');
        this._glitchTimer = setInterval(() => {
            bg.classList.remove('glitch');
            void bg.offsetWidth;                                       // reinicia a animação
            bg.classList.add('glitch');
            this._barsFx(bars);
            setTimeout(() => {                                         // corte seco no meio do glitch
                this.slides[this.slideIdx].classList.remove('on');
                this.slideIdx = (this.slideIdx + 1) % this.slides.length;
                this.slides[this.slideIdx].classList.add('on');
            }, 160);
            setTimeout(() => { bg.classList.remove('glitch'); bars.innerHTML = ''; }, 420);
        }, 3500);
    }

    _barsFx(bars) {
        bars.innerHTML = '';
        const cols = ['#ff1e56', '#1effe0', '#ffe81e', '#ffffff'];
        for (let i = 0; i < 7; i++) {
            const b = document.createElement('i');
            b.style.top = Math.random() * 95 + '%';
            b.style.height = 6 + Math.random() * 40 + 'px';
            b.style.background = cols[i % cols.length];
            b.style.transform = `translateX(${(Math.random() - 0.5) * 60}px)`;
            bars.appendChild(b);
        }
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

        clearInterval(this._glitchTimer);
        this.root.classList.add('fade');                    // fade-out por CSS
        this.loading.classList.remove('hidden');               // tela de carregamento aparece NA HORA (fica sob o menu que some)
        this.root.addEventListener('transitionend', () => this.root.remove(), { once: true });
        setTimeout(() => this.root.isConnected && this.root.remove(), 800);   // garantia se transitionend não disparar

        // Fila de carregamento (sprites, materiais congelados, shaders); o runRenderLoop só nasce no fim do boot.
        this.game.begin(mode, mode === 'load' ? this.save : null);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.game = new Game('canvas');
    if (location.search.includes('debug')) DebugTools.install(window.game);
    window.mainMenu = new MainMenu(window.game);
    console.log('%cDIRTY MONEY iniciado', 'color:#00ff78');
});
