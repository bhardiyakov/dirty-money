// ============================================================================
// InputManager — teclado, mouse, CONTROLE (padrão Xbox) e controles na tela (celular).
// Tudo vira a mesma coisa: o mapa de teclas (`keys`/`justPressed`) + um eixo analógico. O resto do jogo só lê teclas; controle e toque
// "apertam teclas virtuais" (setVirtual) — assim cada sistema (menu, mini-game de arrombar, tela de preso) funciona sem mudança.
//
//   Controle (Gamepad API, layout "standard" — Xbox/PlayStation/Switch Pro):
//     analógico esq. mover/dirigir · RT golpe/tiro (no carro: acelera) · LT correr (no carro: freio/ré) · LB soco · RB chute
//     A entrar/sair do veículo (F) · B interagir/abastecer (E) · X recarregar · Y pular grade (V) · RS clique furtar (C)
//     direcional ←/→ troca de arma · ↑ kit médico · ↓ buzina · Back inventário · Start pausa (Game) · analógico dir. zoom
//   Celular: TouchControls (src/ui/TouchControls.js) aparece quando é tela de toque e NÃO há controle conectado.
// ============================================================================

class InputManager {
    constructor() {
        this.keys = {};
        this.justPressed = {}; // teclas que baixaram NESTE frame (edge-trigger).
        this.wheelDelta = 0;   // acumula "ticks" da roda entre frames.
        this.mouseDown = false; // botão esquerdo segurado (rajada de SMG).
        this.analog = { x: 0, z: 0 };       // eixo analógico (controle ou joystick da tela), -1..1
        this.zoomAxis = 0;                  // zoom contínuo analógico (+ afasta)
        this.carMode = false;               // o Game avisa: dirigindo (RT/LT viram acelerador/freio)
        this.padConnected = false;          // há controle conectado?
        this.padName = '';
        this.touchDevice = (typeof window !== 'undefined') && (('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || /[?&]touch\b/.test(location.search));
        this.onChange = null;               // callback: conectou/desconectou controle (TouchControls e o Game)
        this.onWeaponCycle = null;          // callback(dir): trocar de arma (D-pad / botão da tela)
        this._virt = {};                    // teclas mantidas por controle/toque: { tecla: fonte }
        this._padPrev = [];
        this._setupListeners();
    }

    _setupListeners() {
        window.addEventListener('keydown', (e) => {
            AudioFX.init();            // áudio só é liberado depois de um gesto do usuário.
            const k = e.key.toLowerCase();
            if (!this.keys[k]) this.justPressed[k] = true; // ignora auto-repeat do teclado.
            this.keys[k] = true;
            // Evita a página rolar com setas/espaço.
            if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        window.addEventListener('wheel', (e) => {
            this.wheelDelta += Math.sign(e.deltaY);
        }, { passive: true });

        // Botão esquerdo do mouse = ação principal (soco / tiro / taco).
        window.addEventListener('mousedown', (e) => {
            AudioFX.init();
            if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;        // (toque na tela virou "clique": só os controles da tela agem)
            if (e.button === 0) { this.justPressed['mouse0'] = true; this.mouseDown = true; }
        });
        window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });

        // Perder o foco não pode deixar tecla "presa".
        window.addEventListener('blur', () => { this.keys = {}; this._virt = {}; this.mouseDown = false; this.analog.x = this.analog.z = 0; });

        // Controle conectado/desconectado (o navegador só avisa depois do 1º botão apertado).
        window.addEventListener('gamepadconnected', (e) => { this.padName = e.gamepad ? e.gamepad.id : ''; this._refreshPad(); });
        window.addEventListener('gamepaddisconnected', () => { this._refreshPad(); });
        this._refreshPad(true);
    }

    // Primeiro controle "standard" conectado, ou null.
    _pad() {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        let any = null;
        for (const p of pads) { if (!p || !p.connected) continue; if (p.mapping === 'standard') return p; any = any || p; }
        return any;
    }

    _refreshPad(silent = false) {
        const p = this._pad(), was = this.padConnected;
        this.padConnected = !!p;
        if (p) this.padName = p.id;
        if (!p && was) { this.releaseVirtual('pad'); this._padPrev = []; this.analog.x = this.analog.z = 0; this.zoomAxis = 0; }      // (só ao DESCONECTAR: senão zerava o joystick da tela a cada 1 s)
        if (was !== this.padConnected && this.onChange && !silent) this.onChange(this.padConnected, this.padName);
        if (was !== this.padConnected && silent && this.onChange) this.onChange(this.padConnected, this.padName);
    }

    // ------------------------------------------------------- teclas virtuais
    // Aperta uma tecla "por" uma fonte ('pad' | 'touch'); a borda de subida alimenta consumePress.
    setVirtual(key, down, src = 'touch') {
        if (down) {
            if (!this.keys[key]) this.justPressed[key] = true;
            this.keys[key] = true; this._virt[key] = src;
            if (key === ' ') { this.justPressed['mouse0'] = this.justPressed['mouse0'] || !this.mouseDown; this.mouseDown = true; }
        } else if (this._virt[key]) {
            this.keys[key] = false; delete this._virt[key];
            if (key === ' ') this.mouseDown = !!this.keys[' '];
        }
    }

    // Solta tudo o que uma fonte estava segurando.
    releaseVirtual(src = null) {
        for (const k of Object.keys(this._virt)) if (!src || this._virt[k] === src) this.setVirtual(k, false, this._virt[k]);
    }

    // ----------------------------------------------------------------- controle
    // Chamar todo frame (o Game faz). Lê o estado do controle e o traduz em teclas virtuais + eixo analógico.
    poll() {
        if (!this._lastPadCheck || performance.now() - this._lastPadCheck > 1000) { this._lastPadCheck = performance.now(); this._refreshPad(); }   // (detecta conexão sem evento)
        if (!this.padConnected) return;
        const p = this._pad();
        if (!p) { this._refreshPad(); return; }
        const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
        const btn = (i) => !!(p.buttons[i] && p.buttons[i].pressed), val = (i) => (p.buttons[i] ? p.buttons[i].value : 0);
        if (p.buttons.some((b) => b && b.pressed)) AudioFX.init();

        // movimento / direção
        let x = dz(p.axes[0] || 0), z = -dz(p.axes[1] || 0);
        if (btn(14) && !this.carMode) x -= 1; if (btn(15) && !this.carMode) x += 1;                // (direcional fica para trocar de arma)
        if (this.carMode) { const t = val(7) - val(6); if (Math.abs(t) > 0.05) z = t; }            // RT acelera, LT freia/ré
        this.analog.x = Math.max(-1, Math.min(1, x)); this.analog.z = Math.max(-1, Math.min(1, z));
        this.zoomAxis = dz(p.axes[3] || 0);

        // botões -> teclas
        const hold = (i, key) => this.setVirtual(key, btn(i), 'pad');
        hold(0, 'f'); hold(1, 'e'); hold(2, 'r'); hold(3, 'v'); hold(4, 'j'); hold(5, 'k'); hold(8, 'i'); hold(11, 'c'); hold(12, 'm'); hold(13, 'h');
        this.setVirtual(' ', !this.carMode && val(7) > 0.35, 'pad');                                       // RT: golpe/tiro (rajada segurando)
        this.setVirtual('shift', btn(10) || (!this.carMode && val(6) > 0.35), 'pad');                      // LS ou LT: correr
        const edge = (i) => btn(i) && !this._padPrev[i];
        if (!this.carMode) { if (edge(14) && this.onWeaponCycle) this.onWeaponCycle(-1); if (edge(15) && this.onWeaponCycle) this.onWeaponCycle(1); }
        this._padPrev = Array.from(p.buttons, (b) => !!(b && b.pressed));
    }

    // Vibração do controle (batida, dano): strong/weak 0..1, ms.
    rumble(strong = 0.6, weak = 0.4, ms = 180) {
        if (!this.padConnected) return;
        const p = this._pad(), a = p && (p.vibrationActuator || (p.hapticActuators && p.hapticActuators[0]));
        if (!a) return;
        try { if (a.playEffect) a.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); else if (a.pulse) a.pulse(strong, ms); } catch (e) { /* sem vibração */ }
    }

    // Eixo cru relativo à TELA: x = direita(+)/esquerda(-), z = cima(+)/baixo(-).
    getMoveAxis() {
        let x = 0, z = 0;
        if (this.keys['w'] || this.keys['arrowup']) z += 1;
        if (this.keys['s'] || this.keys['arrowdown']) z -= 1;
        if (this.keys['d'] || this.keys['arrowright']) x += 1;
        if (this.keys['a'] || this.keys['arrowleft']) x -= 1;
        x += this.analog.x; z += this.analog.z;
        return { x: Math.max(-1, Math.min(1, x)), z: Math.max(-1, Math.min(1, z)) };
    }

    isSprinting() {
        return !!this.keys['shift'];
    }

    // Retorna true uma única vez por pressionada física da tecla.
    consumePress(key) {
        const k = key.toLowerCase();
        if (this.justPressed[k]) {
            this.justPressed[k] = false;
            return true;
        }
        return false;
    }

    // Consome a intenção de zoom deste frame.
    // keys: sinal contínuo (+ afasta / - aproxima) | wheel: nº de ticks acumulados (+ afasta).
    consumeZoom() {
        let keys = 0;
        if (this.keys['x']) keys += 1; // afastar
        if (this.keys['z']) keys -= 1; // aproximar
        keys += this.zoomAxis;

        const wheel = this.wheelDelta;
        this.wheelDelta = 0;
        return { keys, wheel };
    }
}
