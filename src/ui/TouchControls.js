// ============================================================================
// TouchControls — controles NA TELA para celular/tablet, só quando é tela de toque E não há controle (Xbox) conectado.
// Joystick à esquerda (andar / dirigir), botões à direita (muda conforme está a pé ou no veículo) e atalhos no topo.
// Tudo aperta teclas virtuais do InputManager (setVirtual), então o jogo não sabe a diferença. Some quando um controle é conectado
// ou quando o jogador usa teclado/mouse de verdade (notebook com tela de toque). Também deixa a interface responsiva (classe
// `mobile` no <body>): HUD menor, minimapa no canto de cima, dicas acima dos botões, menu de pausa em coluna.
// `?touch` na URL força os controles (para testar no computador).
// ============================================================================

class TouchControls {
    constructor(game) {
        this.g = game;
        this.input = game.input;
        this.shown = false;
        this.stick = { id: null, x: 0, y: 0, r: 60 };
        this._mode = '';
        this._build();
        this.input.onChange = () => this._refresh();
        window.addEventListener('keydown', (e) => { if (e.isTrusted) this._physical = true, this._refresh(); });
        window.addEventListener('mousedown', (e) => { if (e.isTrusted && !(e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents)) this._physical = true, this._refresh(); });
        window.addEventListener('touchstart', () => { if (this._physical) { this._physical = false; this._refresh(); } }, { passive: true });
        window.addEventListener('resize', () => this._layout());
        this._refresh();
        this._layout();
    }

    get wanted() { return this.input.touchDevice && !this.input.padConnected && !this._physical; }

    // Botões: [rótulo, tecla, modo ('foot'|'car'|'both'), classe, segurar?]
    static get BUTTONS() {
        return [
            ['ATIRAR', ' ', 'foot', 'fire'], ['ENTRAR', 'f', 'both', 'use'], ['CORRER', 'shift', 'foot', 'run'], ['SOCO', 'j', 'foot', 'punch'], ['CHUTE', 'k', 'foot', 'kick'],
            ['RECARR', 'r', 'foot', 'reload'], ['E', 'e', 'both', 'act'], ['ARMA', '#weapon', 'foot', 'weapon'], ['KIT', 'm', 'foot', 'heal'], ['PULAR', 'v', 'foot', 'vault'],
            ['BUZINA', 'h', 'car', 'horn'], ['FAROL', 'l', 'car', 'light'], ['FURTAR', 'c', 'foot', 'steal'],
        ];
    }

    _build() {
        const css = document.createElement('style');
        css.textContent = `
            body { overscroll-behavior: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
            #touchUI { position: fixed; inset: 0; z-index: 20; pointer-events: none; display: none; --u: clamp(44px, 11vmin, 76px);
                font-family: 'Silkscreen', 'Press Start 2P', 'Courier New', monospace; text-transform: uppercase; }
            #touchUI.on { display: block; }
            #touchUI * { touch-action: none; -webkit-user-select: none; user-select: none; }
            #tcStick { position: absolute; left: calc(var(--u) * 0.35); bottom: calc(var(--u) * 0.35); width: calc(var(--u) * 2.5); height: calc(var(--u) * 2.5); pointer-events: auto;
                border-radius: 50%; background: radial-gradient(circle, rgba(20,26,38,0.35) 0 55%, rgba(135,145,170,0.35) 56% 100%); border: 3px solid rgba(7,9,13,0.7); }
            #tcKnob { position: absolute; left: 50%; top: 50%; width: calc(var(--u) * 1.1); height: calc(var(--u) * 1.1); margin: calc(var(--u) * -0.55) 0 0 calc(var(--u) * -0.55);
                border-radius: 50%; background: rgba(235,240,250,0.55); border: 3px solid rgba(7,9,13,0.75); pointer-events: none; }
            .tcb { position: absolute; pointer-events: auto; display: flex; align-items: center; justify-content: center; text-align: center; font-weight: 700;
                width: calc(var(--u) * 0.95); height: calc(var(--u) * 0.95); font-size: calc(var(--u) * 0.2); color: #eef1f7; line-height: 1.05;
                background: rgba(20,26,38,0.55); border: 3px solid rgba(7,9,13,0.75); border-radius: 50%; box-shadow: inset 0 0 0 2px rgba(135,145,170,0.45); }
            .tcb.down { background: rgba(70,200,120,0.7); transform: scale(0.94); }
            .tcb.fire { width: calc(var(--u) * 1.5); height: calc(var(--u) * 1.5); right: calc(var(--u) * 0.3); bottom: calc(var(--u) * 0.3); background: rgba(190,40,40,0.55); font-size: calc(var(--u) * 0.24); }
            .tcb.use { right: calc(var(--u) * 1.95); bottom: calc(var(--u) * 0.3); background: rgba(40,120,200,0.55); }
            .tcb.kick { right: calc(var(--u) * 3.0); bottom: calc(var(--u) * 0.3); }
            .tcb.run { right: calc(var(--u) * 0.3); bottom: calc(var(--u) * 1.95); }
            .tcb.punch { right: calc(var(--u) * 1.35); bottom: calc(var(--u) * 1.95); }
            .tcb.act { right: calc(var(--u) * 2.4); bottom: calc(var(--u) * 1.95); }
            .tcb.reload { right: calc(var(--u) * 3.45); bottom: calc(var(--u) * 1.95); }
            .tcb.weapon { right: calc(var(--u) * 0.3); bottom: calc(var(--u) * 3.0); }
            .tcb.heal { right: calc(var(--u) * 1.35); bottom: calc(var(--u) * 3.0); }
            .tcb.vault { right: calc(var(--u) * 2.4); bottom: calc(var(--u) * 3.0); }
            .tcb.steal { right: calc(var(--u) * 3.45); bottom: calc(var(--u) * 3.0); }
            .tcb.horn { right: calc(var(--u) * 0.3); bottom: calc(var(--u) * 1.95); }
            .tcb.light { right: calc(var(--u) * 1.35); bottom: calc(var(--u) * 1.95); }
            body.tc-car .tcb.use { right: calc(var(--u) * 0.3); bottom: calc(var(--u) * 0.3); width: calc(var(--u) * 1.5); height: calc(var(--u) * 1.5); }
            body.tc-car .tcb.act { right: calc(var(--u) * 1.95); bottom: calc(var(--u) * 0.3); }            .tcb.hide { display: none; }
            .tct { position: absolute; top: calc(var(--u) * 0.15); pointer-events: auto; width: calc(var(--u) * 0.7); height: calc(var(--u) * 0.7); border-radius: 8px; font-size: calc(var(--u) * 0.2);
                display: flex; align-items: center; justify-content: center; font-weight: 700; color: #eef1f7; background: rgba(20,26,38,0.6); border: 3px solid rgba(7,9,13,0.75); box-shadow: inset 0 0 0 2px rgba(135,145,170,0.45); }
            .tct.down { background: rgba(70,200,120,0.7); }
            #tcBack { position: fixed; right: 10px; top: 10px; z-index: 40; display: none; padding: 10px 16px; font-family: 'Silkscreen', monospace; font-weight: 700; font-size: 14px; color: #fff;
                background: #b02a2a; border: 4px solid #07090d; box-shadow: inset 0 0 0 2px #e86a6a; }
            #tcBack.on { display: block; }

            /* ---- interface responsiva (celular / janela estreita) ---- */
            body.mobile #hud2 { top: 6px; right: 6px; transform: scale(0.5); transform-origin: top right; }
            body.mobile #minimap { width: 108px !important; height: 108px !important; left: 8px !important; top: 8px !important; bottom: auto !important; border-width: 3px; }
            body.mobile #toast { font-size: 11px; top: 118px; max-width: 70vw; padding: 4px 8px; }
            body.mobile #prompt { font-size: 11px; padding: 5px 9px; bottom: auto; top: 44%; max-width: 62vw; white-space: normal; }
            body.mobile #vehPop { transform: scale(0.55); transform-origin: top left; right: auto; left: 8px; bottom: auto; top: 124px; }
            body.mobile #vehPop.show { transform: scale(0.55); }
            body.mobile #inventory { width: 62vw !important; max-height: 80vh; overflow: auto; }
            @media (max-width: 900px), (max-height: 520px) {
                #pause { padding: 8px 8px 6px !important; gap: 8px !important; }
                .pm-tab { padding: 5px 9px !important; font-size: 11px !important; }
                .pm-tabs { gap: 6px !important; }
                .pm-main { flex-direction: column !important; overflow: auto; }
                .pm-side { width: auto !important; max-height: 38%; }
                .pm-hints { display: none !important; }
                .px-title { font-size: 12px !important; }
            }`;
        document.head.appendChild(css);

        const root = this.root = document.createElement('div');
        root.id = 'touchUI';
        root.innerHTML = '<div id="tcStick"><div id="tcKnob"></div></div>';
        document.body.appendChild(root);
        this.stickEl = root.querySelector('#tcStick'); this.knob = root.querySelector('#tcKnob');
        this._bindStick();

        this.buttons = [];
        for (const [label, key, mode, cls] of TouchControls.BUTTONS) {
            const b = document.createElement('div');
            b.className = 'tcb ' + cls; b.textContent = label; b.dataset.mode = mode;
            root.appendChild(b); this._bindButton(b, key); this.buttons.push(b);
        }
        // atalhos do topo (ao lado do HUD): pausa/mapa, mochila, zoom ±
        this.top = [['II', 'p'], ['MOCH', 'i'], ['−', 'x'], ['+', 'z']].map(([label, key], i) => {
            const b = document.createElement('div');
            b.className = 'tct'; b.textContent = label; b.dataset.i = i;
            root.appendChild(b); this._bindButton(b, key, key === 'x' || key === 'z'); return b;
        });
        const back = this.back = document.createElement('div');
        back.id = 'tcBack'; back.textContent = '✕ VOLTAR';
        back.addEventListener('pointerdown', (e) => { e.preventDefault(); if (this.g.menu.isOpen) this.g.menu.close(); });
        document.body.appendChild(back);
        root.addEventListener('touchstart', (e) => { if (e.target !== root) e.preventDefault(); }, { passive: false });     // (sem mouse emulado, zoom nem rolagem)
        root.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    _bindButton(el, key, hold = true) {
        const press = (down) => {
            el.classList.toggle('down', down);
            if (key === '#weapon') { if (down && this.input.onWeaponCycle) this.input.onWeaponCycle(1); return; }
            if (key === 'p' || key === 'i') { if (down) { this.input.setVirtual(key, true, 'touch'); setTimeout(() => this.input.setVirtual(key, false, 'touch'), 60); } return; }       // (toque único)
            this.input.setVirtual(key, down, 'touch');
        };
        el.addEventListener('pointerdown', (e) => { e.preventDefault(); AudioFX.init(); try { el.setPointerCapture(e.pointerId); } catch (x) { /* ok */ } press(true); });
        const up = (e) => { e.preventDefault(); if (el.classList.contains('down') || key === '#weapon') press(false); };
        el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    }

    // Joystick analógico: o dedo pode sair do círculo; o botão acompanha até o raio e o eixo satura em 1.
    _bindStick() {
        const S = this.stick, el = this.stickEl;
        const move = (e) => {
            if (e.pointerId !== S.id) return;
            const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width / 2;
            let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / R);
            const ux = dx / d, uy = dy / d, m = d < R * 0.12 ? 0 : k;
            this.knob.style.transform = `translate(${ux * k * R * 0.7}px, ${uy * k * R * 0.7}px)`;
            this.input.analog.x = ux * m; this.input.analog.z = -uy * m;
            this.input.setVirtual('shift', !this.g.input.carMode && k > 0.95 && !this.input.padConnected, 'touch');            // empurrar até a borda = correr
        };
        const end = (e) => {
            if (e.pointerId !== S.id) return;
            S.id = null; this.knob.style.transform = '';
            this.input.analog.x = 0; this.input.analog.z = 0; this.input.setVirtual('shift', false, 'touch');
        };
        el.addEventListener('pointerdown', (e) => { e.preventDefault(); AudioFX.init(); if (S.id !== null) return; S.id = e.pointerId; try { el.setPointerCapture(e.pointerId); } catch (x) { /* ok */ } move(e); });
        el.addEventListener('pointermove', move); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
    }

    // Os atalhos do topo ficam à esquerda do painel do HUD (canto direito, escalado).
    _layout() {
        const mobile = this.input.touchDevice || window.innerWidth < 900;
        document.body.classList.toggle('mobile', mobile);
        const u = Math.max(44, Math.min(76, Math.min(window.innerWidth, window.innerHeight) * 0.11));
        const hudW = 244 * 0.5 + 14;
        this.top.forEach((b, i) => { b.style.right = `${hudW + i * (u * 0.8)}px`; });
    }

    _refresh() {
        const on = this.wanted;
        this.shown = on;
        this.root.classList.toggle('on', on);
        if (!on) { this.input.releaseVirtual('touch'); this.input.analog.x = this.input.analog.z = 0; }
        if (this.g._flash && this._announced !== this.input.padConnected && this.input.padConnected !== undefined && this._ready) {
            this._announced = this.input.padConnected;
            this.g._flash(this.input.padConnected ? '🎮 Controle conectado' : (this.input.touchDevice ? 'Controle desconectado — controles na tela ativados' : 'Controle desconectado'));
        }
        this._ready = true;
    }

    // Todo frame (Game): troca o conjunto de botões a pé/no veículo e mostra o botão de voltar quando o menu está aberto.
    update() {
        const car = this.g.mode === 'car' && !!this.g.activeCar, boat = car && this.g.activeCar.isBoat, mode = car ? 'car' : 'foot';
        if (mode !== this._mode) {
            this._mode = mode;
            document.body.classList.toggle('tc-car', car);
            for (const b of this.buttons) { const m = b.dataset.mode; b.classList.toggle('hide', m !== 'both' && m !== mode); }
        }
        this.back.classList.toggle('on', this.shown && this.g.menu.isOpen);
        this.root.style.display = this.shown && !this.g.menu.isOpen ? 'block' : 'none';
    }
}
