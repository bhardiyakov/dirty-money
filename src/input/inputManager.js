// ============================================================================
// InputManager — teclado, mouse, CONTROLE (padrão Xbox) e controles na tela (celular).
// Tudo vira a mesma coisa: o mapa de teclas (`keys`/`justPressed`) + um eixo analógico. O resto do jogo só lê teclas; controle e toque
// "apertam teclas virtuais" (setVirtual) — assim cada sistema (menu, mini-game de arrombar, tela de preso) funciona sem mudança.
//
//   Controle (Gamepad API, layout "standard" — Xbox/PlayStation/Switch Pro), no padrão dos jogos de mundo aberto (GTA V / Watch Dogs):
//     A pé:   analógico esq. mover · A/✕ correr (segurar) e pular grade/muro (tocar perto) · L3 correr · X/□ interagir (E)
//             Y/△ entrar no veículo (F) · B/○ recarregar · RT/R2 golpe (sem arma: combo soco+soco+chute)/tiro · LT/L2 MIRAR (ver Aim)
//             LB/L1 e direcional ←/→ troca de arma · R3 furtar (C) · ↑ kit médico · ↓ arrombar (G)
//             Mirando: analógico dir. aponta (manual) ou troca de alvo (assistida). Teclado/mouse: botão direito mira, o cursor aponta.
//     Carro:  RT acelera · LT freia/ré · Y/△ sair · X/□ interagir (abastecer/desmanche) · L3 buzina · ↓ faróis
//     Helicóptero: RT sobe · LT desce · analógico esq. mover · analógico dir. ↔ gira · Y/△ descer/pular
//     Sempre: Back/SHARE inventário · Start/OPTIONS pausa (Game) · analógico dir. ↕ zoom
//     As dicas na tela mostram os botões do controle conectado (Xbox ou PlayStation): ver PadGlyphs (que espelha esta tabela).
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
        this.heliMode = false;              // o Game avisa: pilotando o helicóptero (RT sobe, LT desce)
        this.gunInHand = false;             // o Game avisa: arma de fogo na mão (B recarrega; sem ela, B dá soco)
        this.padConnected = false;          // há controle conectado?
        this.padName = '';
        this.padType = 'xbox';              // desenho dos botões nas dicas: 'xbox' | 'ps' (PadGlyphs.type)
        this.usingPad = false;              // o último comando veio do controle (as dicas mostram os botões dele; teclado/mouse volta às teclas)
        this.yawAxis = 0;                   // analógico direito na horizontal (gira o helicóptero)
        this.rstick = { x: 0, y: 0 };       // analógico direito cru (x direita +, y baixo +), com zona morta — a mira manual aponta com ele
        this.padAim = false;                // LT/L2 segurado a pé: mirando
        this.mouseAim = false;              // botão direito do mouse segurado sobre o jogo: mirando
        this.mouseX = -1; this.mouseY = -1; this.mouseMovedAt = 0;
        this.touchDevice = (typeof window !== 'undefined') && (('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || /[?&]touch\b/.test(location.search));
        this.onChange = null;               // callback: conectou/desconectou controle (TouchControls e o Game)
        this.onWeaponCycle = null;          // callback(dir): trocar de arma (D-pad / botão da tela)
        this._virt = {};                    // teclas mantidas por controle/toque: { tecla: fonte }
        this._padPrev = [];
        this._setupListeners();
    }

    _setupListeners() {
        window.addEventListener('keydown', (e) => {
            if (e.padNav) return;      // teclas geradas pelo controle navegando nas janelas (PadNav) são só para as janelas
            AudioFX.init();            // áudio só é liberado depois de um gesto do usuário.
            const k = e.key.toLowerCase();
            this.usingPad = false;
            if (!this.keys[k]) this.justPressed[k] = true; // ignora auto-repeat do teclado.
            this.keys[k] = true;
            // Evita a página rolar com setas/espaço.
            if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.padNav) return;
            this.keys[e.key.toLowerCase()] = false;
        });

        window.addEventListener('wheel', (e) => {
            this.wheelDelta += Math.sign(e.deltaY);
        }, { passive: true });

        // Botão esquerdo do mouse = ação principal (soco / tiro / taco).
        window.addEventListener('mousedown', (e) => {
            AudioFX.init();
            if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;        // (toque na tela virou "clique": só os controles da tela agem)
            this.usingPad = false;
            if (e.button === 0) { this.justPressed['mouse0'] = true; this.mouseDown = true; }
            if (e.button === 2 && e.target && e.target.id === 'canvas') this.mouseAim = true;              // botão direito sobre o jogo: mirar
        });
        window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; if (e.button === 2) this.mouseAim = false; });
        // Posição do mouse (mira manual: o personagem aponta para o cursor).
        window.addEventListener('mousemove', (e) => {
            if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
            this.mouseX = e.clientX; this.mouseY = e.clientY;
            if (Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0) > 2) { this.mouseMovedAt = performance.now(); this.usingPad = false; }
        });
        window.addEventListener('contextmenu', (e) => { if (e.target && e.target.id === 'canvas') e.preventDefault(); });

        // Perder o foco não pode deixar tecla "presa".
        window.addEventListener('blur', () => { this.keys = {}; this._virt = {}; this.mouseDown = false; this.mouseAim = false; this.analog.x = this.analog.z = 0; });

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
        if (p) { this.padName = p.id; this.padType = PadGlyphs.type(p.id); }
        if (p && !was) this.usingPad = true;                                                                        // acabou de conectar: as dicas já mostram os botões dele
        if (!p && was) { this.releaseVirtual('pad'); this._padPrev = []; this.analog.x = this.analog.z = 0; this.zoomAxis = this.yawAxis = 0; this.rstick.x = this.rstick.y = 0; this.padAim = false; this.usingPad = false; }      // (só ao DESCONECTAR: senão zerava o joystick da tela a cada 1 s)
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
        if (p.buttons.some((b) => b && b.pressed)) { AudioFX.init(); this.usingPad = true; }
        if (this.suppressPad) {                                                                      // saindo de um menu/janela: espera soltar tudo
            if (p.buttons.some((b) => b && b.pressed)) { this.releaseVirtual('pad'); this._padPrev = Array.from(p.buttons, (b) => !!(b && b.pressed)); this.padAim = false; return; }
            this.suppressPad = false;
        }
        else if (p.mapping === 'standard' && p.axes.some((a) => Math.abs(a) > 0.5)) this.usingPad = true;       // (fora do "standard" há eixo que repousa em -1)

        // movimento / direção
        const car = this.carMode, heli = this.heliMode, foot = !car && !heli;
        let x = dz(p.axes[0] || 0), z = -dz(p.axes[1] || 0);
        if (car) { const t = val(7) - val(6); if (Math.abs(t) > 0.05) z = t; }                     // RT acelera, LT freia/ré
        this.analog.x = Math.max(-1, Math.min(1, x)); this.analog.z = Math.max(-1, Math.min(1, z));
        const rt = val(7) > 0.35, lt = val(6) > 0.35;
        this.padAim = foot && lt;                                                                    // LT a pé: mirar (ver Aim)
        this.rstick.x = dz(p.axes[2] || 0); this.rstick.y = dz(p.axes[3] || 0);
        this.zoomAxis = this.padAim ? 0 : this.rstick.y;                                             // (mirando, o analógico direito aponta)
        this.yawAxis = this.rstick.x;

        // botões -> teclas (layout GTA / Watch Dogs: ver o cabeçalho)
        const set = (key, on) => this.setVirtual(key, on, 'pad');
        set('f', btn(3));                                   // Y: entrar/sair do veículo
        set('e', btn(2));                                   // X: interagir
        set('padjump', foot && btn(0));                     // A: pula grade/muro (só se houver um ali: Game)
        set('r', foot && btn(1) && this.gunInHand);         // B: recarregar (arma de fogo na mão)
        // (sem arma, B não faz nada: o combo de mãos — soco + soco + chute — sai do RT)
        set('padcancel', btn(1));                           // B: cancelar (mini-game de arrombar)
        set('g', foot && btn(13));                          // ↓: arrombar na manha
        set('c', foot && btn(11));                          // R3: furtar
        set('m', btn(12));                                  // ↑: kit médico
        set('l', car && btn(13));                           // ↓ no carro: faróis
        set('h', car && btn(10));                           // L3: buzina
        set('i', btn(8));                                   // Back/SHARE: inventário
        set(' ', !car && rt);                               // RT: golpe/tiro (rajada segurando) · helicóptero: sobe
        set('shift', (foot && !lt && (btn(0) || btn(10))) || (heli && lt));     // A ou L3 segurado: correr (mirando, não corre) · helicóptero: LT desce
        const edge = (i) => btn(i) && !this._padPrev[i];
        if (foot && this.onWeaponCycle) {                   // ←/→ e LB: troca de arma
            if (edge(14)) this.onWeaponCycle(-1);
            if (edge(15) || edge(4)) this.onWeaponCycle(1);
        }
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

    // Segurando o botão de mirar (LT/L2 ou botão direito do mouse)?
    get aimHeld() { return this.padAim || this.mouseAim; }

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
