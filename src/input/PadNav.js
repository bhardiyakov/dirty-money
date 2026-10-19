// ============================================================================
// PadNav — o CONTROLE navegando nas telas que antes só funcionavam com mouse/teclado.
//   FocusNav (genérico): acha os elementos clicáveis visíveis de uma tela (botões, selects e tudo com cursor de "mãozinha"), move um
//     destaque entre eles pela direção (direcional ou analógico esquerdo) e A/✕ clica. Serve para qualquer aba nova sem código extra.
//     Usado pelas abas STATUS, CARREIRAS, IMPÉRIO e GUIA do menu de pausa (ver PauseMenu._pad), pela tela inicial e pela sinuca.
//   Janelas do jogo com teclado próprio (loja, baú/geladeira/cofre, imóvel, mototáxi, Tribunal): o controle "aperta" as teclas que
//     elas já entendem — direcional/analógico = setas, A/✕ = Enter, X/□ = Espaço, B/○ = Esc. Esses eventos levam `padNav = true`
//     e o InputManager os ignora (não viram ações no jogo).
//   Sinuca jogando: ←/→ (ou analógico) giram o taco, RB/R1 segurado gira mais rápido, A/✕ segurado carrega a tacada, B/○ desiste.
// Roda num laço próprio (requestAnimationFrame) porque a tela inicial e a sinuca acontecem com o laço do jogo parado.
// O menu de pausa chama FocusNav/PadNav.dir direto do próprio _pad (ele já roda a cada quadro com o jogo pausado).
// ============================================================================

const FocusNav = {
    cur: null, rect: null, root: null,

    // Elementos clicáveis visíveis dentro de `root`.
    items(root) {
        const out = [];
        if (!root) return out;
        for (const el of root.querySelectorAll('*')) {
            const tag = el.tagName, ctl = tag === 'BUTTON' || tag === 'SELECT' || tag === 'A' || (tag === 'INPUT' && el.type === 'range');
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none') continue;
            if (!ctl) {
                if (cs.cursor !== 'pointer') continue;
                const par = el.parentElement;
                if (par && par !== root && getComputedStyle(par).cursor === 'pointer') continue;     // (mãozinha herdada do pai)
            }
            const r = el.getBoundingClientRect();
            if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight * 3) continue;
            out.push(el);
        }
        return out;
    },

    // Mantém o destaque válido: se a tela foi redesenhada (o elemento sumiu), pega o mais perto de onde ele estava.
    sync(root) {
        if (root !== this.root) { this.root = root; this.cur = null; this.rect = null; }
        if (this.cur && this.cur.isConnected && root.contains(this.cur) && this.cur.getClientRects().length) { this.cur.classList.add('padfocus'); return this.cur; }
        const L = this.items(root);
        if (!L.length) { this.cur = null; return null; }
        let best = L[0];
        if (this.rect) {
            let bd = Infinity;
            for (const el of L) { const r = el.getBoundingClientRect(), d = Math.hypot(r.left + r.width / 2 - this.rect.x, r.top + r.height / 2 - this.rect.y); if (d < bd) { bd = d; best = el; } }
        }
        this.focus(best, false);
        return best;
    },

    focus(el, scroll = true) {
        if (this.cur && this.cur !== el) this.cur.classList.remove('padfocus');
        this.cur = el;
        if (!el) return;
        el.classList.add('padfocus');
        if (scroll) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const r = el.getBoundingClientRect();
        this.rect = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        this._css();
    },

    // Próximo elemento na direção (dx, dy): o mais perto à frente, preferindo os alinhados.
    move(root, dx, dy) {
        const cur = this.sync(root);
        if (!cur) return null;
        const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
        let best = null, bs = Infinity;
        for (const el of this.items(root)) {
            if (el === cur) continue;
            const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            const along = (cx - ax) * dx + (cy - ay) * dy;
            if (along <= 2) continue;
            // distância lateral até o retângulo (0 se ele "cobre" o centro atual na outra direção)
            const perp = dx ? Math.max(0, r.top - ay, ay - r.bottom) : Math.max(0, r.left - ax, ax - r.right);
            const s = along + perp * 3;
            if (s < bs) { bs = s; best = el; }
        }
        if (best) this.focus(best);
        return best;
    },

    // A/✕: clica (select: passa para a próxima opção).
    activate() {
        const el = this.cur;
        if (!el || !el.isConnected) return;
        if (el.tagName === 'SELECT') {
            el.selectedIndex = (el.selectedIndex + 1) % Math.max(1, el.options.length);
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }
        if (el.disabled) { AudioFX.blip(160, 0.08, 0.12); return; }
        el.click();
    },

    // ←/→ num controle deslizante (volume): ajusta em vez de mover o destaque. true = consumiu.
    adjust(dx) {
        const el = this.cur;
        if (!el || el.tagName !== 'INPUT' || el.type !== 'range' || !dx) return false;
        const step = (+el.max - +el.min) / 10 || 1;
        el.value = Math.max(+el.min, Math.min(+el.max, +el.value + dx * step));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    },

    // Rola a área rolável da tela (analógico direito; ou o esquerdo quando não há nada clicável).
    scroll(root, dy) {
        if (!root || !dy) return;
        let box = null, area = 0;
        const start = this.cur && root.contains(this.cur) ? this.cur : null;
        for (let el = start; el && el !== root.parentElement; el = el.parentElement) {
            const cs = getComputedStyle(el);
            if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) { box = el; break; }
        }
        if (!box) for (const el of root.querySelectorAll('*')) {
            if (el.scrollHeight <= el.clientHeight + 4) continue;
            const cs = getComputedStyle(el);
            if (!/(auto|scroll)/.test(cs.overflowY)) continue;
            const a = el.clientWidth * el.clientHeight;
            if (a > area) { area = a; box = el; }
        }
        if (box) box.scrollTop += dy;
    },

    clear() { if (this.cur) this.cur.classList.remove('padfocus'); this.cur = null; this.rect = null; this.root = null; },

    _css() {
        if (this._styled) return;
        this._styled = true;
        const st = document.createElement('style');
        st.textContent = `.padfocus { outline: 3px solid #fbbf24 !important; outline-offset: 2px !important; box-shadow: 0 0 0 6px rgba(251,191,36,0.22) !important; }`;
        document.head.appendChild(st);
    },
};

const PadNav = {
    game: null,
    _prev: [], _dir: null, _dirT: 0, _held: {},

    init(game) {
        this.game = game;
        let last = performance.now();
        const loop = (t) => { const dt = Math.min(0.1, (t - last) / 1000); last = t; try { this._tick(dt); } catch (e) { console.warn('[PadNav]', e); } requestAnimationFrame(loop); };
        requestAnimationFrame(loop);
    },

    pad() {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (const p of pads) if (p && p.connected && p.mapping === 'standard') return p;
        for (const p of pads) if (p && p.connected) return p;
        return null;
    },

    // Direção "de menu" com repetição (segurou: repete depois de 0,38 s a cada 0,12 s). Retorna {dx, dy} ou null.
    dir(p, dt) {
        const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
        const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
        let dx = (b(15) ? 1 : 0) - (b(14) ? 1 : 0), dy = (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
        if (!dx && !dy) { if (Math.abs(ax) > 0.6 && Math.abs(ax) > Math.abs(ay)) dx = Math.sign(ax); else if (Math.abs(ay) > 0.6) dy = Math.sign(ay); }
        const key = dx || dy ? dx + ',' + dy : null;
        if (!key) { this._dir = null; return null; }
        if (key !== this._dir) { this._dir = key; this._dirT = 0.38; return { dx, dy }; }
        this._dirT -= dt;
        if (this._dirT <= 0) { this._dirT = 0.12; return { dx, dy }; }
        return null;
    },

    // Botões que acabaram de descer (por índice) — o chamador guarda o estado anterior.
    edges(p, prev) { return (i) => !!(p.buttons[i] && p.buttons[i].pressed) && !prev[i]; },

    // Tecla sintética para as janelas do jogo (o InputManager ignora: padNav = true).
    key(k, type = 'keydown') {
        const ev = new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true });
        ev.padNav = true;
        window.dispatchEvent(ev);
    },
    hold(k, on) {
        if (!!this._held[k] === on) return;
        this._held[k] = on;
        this.key(k, on ? 'keydown' : 'keyup');
    },
    releaseAll() { for (const k of Object.keys(this._held)) if (this._held[k]) this.hold(k, false); },

    _tick(dt) {
        const p = this.pad();
        if (!p) { this.releaseAll(); this._prev = []; return; }
        const g = this.game, prev = this._prev, edge = this.edges(p, prev);
        const btn = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
        const any = p.buttons.some((x) => x && x.pressed);
        this._prev = Array.from(p.buttons, (x) => !!(x && x.pressed));
        if (any && g && g.input) { g.input.usingPad = true; g.input.padType = PadGlyphs.type(p.id); }

        // 1) Truco: ← → escolhem a carta, A joga (ou aceita), Y truco/aumenta, X encobre, B corre/desiste; a tela de mesas é um modal
        if (typeof Truco !== 'undefined' && Truco.active) {
            const modal = document.getElementById('trModal');
            if (modal && modal.style.display !== 'none' && modal.getClientRects().length) { this.releaseAll(); this._focusScreen(modal, p, dt, edge); if (edge(1)) this.key('Escape'); return; }
            this.releaseAll();
            const ax = p.axes[0] || 0, dir = btn(14) || ax < -0.5 ? -1 : btn(15) || ax > 0.5 ? 1 : 0;
            if (dir && dir !== this._trDir) Truco.pad(dir < 0 ? 'left' : 'right');
            this._trDir = dir;
            if (edge(0)) Truco.pad('a'); if (edge(3)) Truco.pad('y'); if (edge(2)) Truco.pad('x'); if (edge(1)) Truco.pad('b');
            return;
        }
        // 2) Sinuca
        if (typeof Pool !== 'undefined' && Pool.active) {
            const modal = document.getElementById('plModal');
            if (modal && modal.style.display !== 'none' && modal.getClientRects().length) { this.releaseAll(); this._focusScreen(modal, p, dt, edge); if (edge(1)) this.key('Escape'); return; }
            const ax = p.axes[0] || 0;
            this.hold('ArrowLeft', btn(14) || ax < -0.35); this.hold('ArrowRight', btn(15) || ax > 0.35);
            this.hold('Shift', btn(5));
            this.hold(' ', btn(0));
            Pool.padSpin(p.axes[2] || 0, p.axes[3] || 0);                    // efeito: analógico direito
            if (edge(12)) this.key('ArrowUp'); if (edge(13)) this.key('ArrowDown'); if (edge(3)) this.key('c');
            if (edge(1)) this.key('Escape');
            return;
        }
        this.releaseAll();
        if (!g) return;

        // 2) Janelas do jogo com teclado próprio (o menu de pausa cuida de si mesmo em PauseMenu._pad)
        if (g.menu && g.menu.isOpen) return;
        const pn = typeof Panel !== 'undefined' && Panel.all.find((x) => x.open);      // janelas novas (oficina, capô, golpe, cerco): navegação genérica
        if (pn) { this._focusScreen(pn.root.querySelector('.dm-pp') || pn.root, p, dt, edge); if (edge(1) && pn.closable) pn.close(); g.input.suppressPad = true; return; }
        if (g.motoUI && (g.shopUI.open || g.stashUI.open || g.propertyUI.open || g.motoUI.open || g.tribunal.open)) {
            const d = this.dir(p, dt);
            if (d) this.key(d.dx > 0 ? 'ArrowRight' : d.dx < 0 ? 'ArrowLeft' : d.dy > 0 ? 'ArrowDown' : 'ArrowUp');
            if (edge(0)) this.key('Enter');
            if (edge(2)) this.key(' ');
            if (edge(1)) this.key('Escape');
            g.input.suppressPad = true;                          // voltando ao jogo, o botão ainda apertado não vira ação
            return;
        }

        // 3) Tela inicial (e o painel de configurações dela)
        const mm = document.getElementById('main-menu');
        if (mm && mm.isConnected && mm.classList.contains('ui-ready') && !mm.classList.contains('loading') && !mm.classList.contains('fade') && getComputedStyle(mm).display !== 'none') {
            const set = document.getElementById('mm-settings');
            const root = set && set.classList.contains('open') ? set : mm.querySelector('.mm-buttons') || mm;
            this._focusScreen(root, p, dt, edge);
            if (edge(1) && set && set.classList.contains('open')) { const back = document.getElementById('btn-settings-back'); if (back) back.click(); }
            return;
        }
        if (FocusNav.root && !FocusNav.root.isConnected) FocusNav.clear();
    },

    // Navegação genérica numa tela: direção move o destaque (ou ajusta um controle deslizante), A clica, analógico direito rola.
    _focusScreen(root, p, dt, edge) {
        FocusNav.sync(root);
        const d = this.dir(p, dt);
        if (d && !(d.dx && FocusNav.adjust(d.dx))) { if (!FocusNav.move(root, d.dx, d.dy) && d.dy) FocusNav.scroll(root, d.dy * 120); }
        if (edge(0)) FocusNav.activate();
        const ry = p.axes[3] || 0;
        if (Math.abs(ry) > 0.25) FocusNav.scroll(root, ry * 900 * dt);
    },
};
