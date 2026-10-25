// ============================================================================
// InputManager — teclado, mouse, CONTROLE (padrão Xbox) e controles na tela (celular).
// Tudo vira a mesma coisa: o mapa de teclas (`keys`/`justPressed`) + um eixo analógico. O resto do jogo só lê teclas; controle e toque
// "apertam teclas virtuais" (setVirtual) — assim cada sistema (menu, mini-game de arrombar, tela de preso) funciona sem mudança.
//
//   Controle (Gamepad API, layout "standard" — Xbox/PlayStation/Switch Pro), no padrão dos jogos de mundo aberto (GTA V / Watch Dogs):
//     A pé:   analógico esq. mover (pouco inclinado: anda; inclinado: trota) · L3 SPRINT (Shift: tocar repetido = mais rápido, segurar =
//             sprint médio; também no nado) · A/✕ pular grade/muro (perto de um) · R3 agachar/cobertura/mergulhar (Q) · RB rolar
//             · X/□ interagir (E)
//             Y/△ entrar no veículo (F) · B/○ recarregar · RT/R2 golpe (sem arma: combo soco+soco+chute)/tiro · LT/L2 MIRAR (ver Aim)
//             LB/L1 segurado: RODA DE ARMAS (WeaponWheel; toque rápido = próxima) · direcional ←/→ troca de arma
//             · ↑ kit médico · ↓ arrombar o carro trancado encostado (G) — sem carro, furtar quem está perto (C) ('padsteal': Game)
//             CÂMERA 360°: analógico dir. ↔ gira (↕ zoom). Mirando (LT com arma de fogo) ou preparando a granada, ele aponta.
//             Teclado/mouse: o cursor é a mira da arma de fogo e o botão direito a firma; sem arma de fogo na mão, botão direito
//             ARRASTANDO gira a câmera (com ou sem arma: botão do meio arrastando). Celular: arrastar o dedo no lado direito da tela.
//     Carro:  RT acelera · LT freia/ré · Y/△ sair · X/□ interagir (abastecer/desmanche) · L3 buzina · ↓ faróis
//             Bicicleta: L3 é o SPRINT (pedalar forte, como o sprint a pé: toque repetido = mais forte)
//     Helicóptero: RT sobe · LT desce · analógico esq. mover · analógico dir. ↔ gira · Y/△ descer/pular
//     Sempre: Back/SHARE inventário · Start/OPTIONS pausa (Game) · analógico dir. ↔ câmera 360° (no helicóptero: gira ele) e ↕ zoom
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
        this.bikeMode = false;              // o Game avisa: pedalando a bicicleta (L3 = sprint, não buzina)
        this.sprint = 0;                    // IMPULSO do sprint, 0–1 (sprintTick: cada toque soma, segurar mantém um mínimo)
        this._sprintWas = false;
        this.gunInHand = false;             // o Game avisa: arma de fogo na mão (B recarrega; sem ela, B dá soco)
        this.padConnected = false;          // há controle conectado?
        this.padName = '';
        this.padType = 'xbox';              // desenho dos botões nas dicas: 'xbox' | 'ps' (PadGlyphs.type)
        this.usingPad = false;              // o último comando veio do controle (as dicas mostram os botões dele; teclado/mouse volta às teclas)
        this.yawAxis = 0;                   // analógico direito na horizontal (gira o helicóptero)
        this.rstick = { x: 0, y: 0 };       // analógico direito cru (x direita +, y baixo +), com zona morta — a mira manual aponta com ele
        this.padAim = false;                // LT/L2 segurado a pé: mirando
        this.touchAim = null;               // phone: the fire button dragged as a right stick ({ x, y }: x right +, y down +, length ≤ 1) — Aim
        this.stickAim = false;              // o Aim avisa: o analógico direito está apontando (LT com arma de fogo, granada sendo preparada)
        this.mouseAim = false;              // botão direito do mouse segurado sobre o jogo: mirando
        this._dragR = false; this._dragM = false;      // botão direito / do meio segurado sobre o jogo: arrastar gira a câmera (takeLook)
        this._lookR = 0; this._lookM = 0; this._mx = null;      // px arrastados desde o último takeLook
        this._twist = 0;                    // rad twisted with two fingers since the last takeLook (TouchControls)
        this.touchLookDown = false;         // two fingers twisting the camera (TouchControls): the turn is being held
        this.mouseX = -1; this.mouseY = -1; this.mouseMovedAt = 0;
        this.touchDevice = (typeof window !== 'undefined') && (('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || /[?&]touch\b/.test(location.search));
        this.onChange = null;               // callback: conectou/desconectou controle (TouchControls e o Game)
        this.onWeaponCycle = null;          // callback(dir): trocar de arma (D-pad / botão da tela)
        this.wheelOpen = false;             // o WeaponWheel avisa: roda de armas aberta (o analógico direito e a roda do mouse são dela)
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
            if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(k)) {      // (Tab: roda de armas, não troca o foco)
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

        // Botão esquerdo do mouse = ação principal (soco / tiro / taco). Ouvido no pointerdown E no mousedown: o Babylon cancela o
        // pointerdown sobre o canvas e aí o navegador não manda o mousedown (o clique sumia — ex.: "clique para continuar" nas telas de
        // morte/prisão). O mesmo clique chega pelos dois: o 2º é ignorado.
        const down = (e) => {
            if (e.type === 'mousedown' && this._ptrDown === e.button && e.timeStamp - this._ptrT < 400) return;
            if (e.type === 'pointerdown') { if (e.pointerType !== 'mouse') return; this._ptrDown = e.button; this._ptrT = e.timeStamp; }
            AudioFX.init();
            if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;        // (toque na tela virou "clique": só os controles da tela agem)
            this.usingPad = false;
            if (e.button === 0) { this.justPressed['mouse0'] = true; this.mouseDown = true; }
            const onGame = e.target && e.target.id === 'canvas';
            if (e.button === 2 && onGame) { this.mouseAim = true; this._dragR = true; this._mx = e.clientX; }      // botão direito sobre o jogo: mirar / arrastar gira
            if (e.button === 1 && onGame) { this._dragM = true; this._mx = e.clientX; }
        };
        window.addEventListener('pointerdown', down, true);
        window.addEventListener('mousedown', down);
        window.addEventListener('mousedown', (e) => { if (e.button === 1 && e.target && e.target.id === 'canvas') e.preventDefault(); });      // (botão do meio: sem a rolagem automática)
        const up = (e) => {
            if (e.type === 'pointerup' && e.pointerType !== 'mouse') return;
            if ((e.button === 2 && this._dragR) || (e.button === 1 && this._dragM)) this._dragTo(e.clientX);      // (o arrasto vai até onde soltou)
            if (e.button === 0) this.mouseDown = false;
            if (e.button === 2) { this.mouseAim = false; this._dragR = false; }
            if (e.button === 1) this._dragM = false;
        };
        window.addEventListener('pointerup', up, true);
        window.addEventListener('mouseup', up);
        // Posição do mouse (mira manual: o personagem aponta para o cursor) e o arrasto que gira a câmera. Também pelo pointermove: o
        // Babylon cancela o pointerdown no canvas e, com um botão segurado, o navegador não manda mousemove (a câmera não girava
        // arrastando e a mira parava no lugar durante a rajada). Os dois chegam: o 2º não muda nada.
        const move = (e) => {
            if (e.type === 'pointermove' && e.pointerType !== 'mouse') return;
            if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
            this._dragTo(e.clientX);
            this.mouseX = e.clientX; this.mouseY = e.clientY;
            if (Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0) > 2) { this.mouseMovedAt = performance.now(); this.usingPad = false; }
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('pointermove', move, true);
        window.addEventListener('contextmenu', (e) => { if (e.target && e.target.id === 'canvas') e.preventDefault(); });

        // Perder o foco não pode deixar tecla "presa".
        window.addEventListener('blur', () => { this.keys = {}; this._virt = {}; this.mouseDown = false; this.mouseAim = false; this._dragR = this._dragM = false; this.analog.x = this.analog.z = 0; });

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
        // (mirando ou na roda de armas, o analógico direito aponta; girando a câmera — mais de lado que de pé — ele não dá zoom)
        this.zoomAxis = this.padAim || this.stickAim || this.wheelOpen || Math.abs(this.rstick.y) <= Math.abs(this.rstick.x) ? 0 : this.rstick.y;
        this.yawAxis = this.rstick.x;

        // botões -> teclas (layout GTA / Watch Dogs: ver o cabeçalho)
        const set = (key, on) => this.setVirtual(key, on, 'pad');
        set('f', btn(3));                                   // Y: entrar/sair do veículo
        set('e', btn(2));                                   // X: interagir
        set('padjump', foot && btn(0));                     // A: pula grade/muro (só se houver um ali: Game)
        set('r', foot && btn(1) && this.gunInHand);         // B: recarregar (arma de fogo na mão)
        // (sem arma, B não faz nada: o combo de mãos — soco + soco + chute — sai do RT)
        set('padcancel', btn(1));                           // B: cancelar (mini-game de arrombar)
        set('padsteal', foot && btn(13));                   // ↓: arrombar na manha (carro trancado encostado) ou furtar (Game)
        set('m', btn(12));                                  // ↑: kit médico
        set('l', car && btn(13));                           // ↓ no carro: faróis
        set('h', car && !this.bikeMode && btn(10));         // L3 no carro/moto: buzina
        set('q', foot && btn(11));                          // R3 a pé: agachar / cobertura (nadando: mergulhar)
        set('roll', foot && btn(5));                        // RB a pé: rolar (esquiva)
        set('i', btn(8));                                   // Back/SHARE: inventário
        set(' ', !car && rt);                               // RT: golpe/tiro (rajada segurando) · helicóptero: sobe
        set('shift', ((foot || this.bikeMode) && !lt && btn(10)) || (heli && lt) || (car && !this.bikeMode && btn(0)));      // L3: sprint (mirando, não corre) · helicóptero: LT desce · A no carro: nitro (corridas)
        set('padwheel', foot && btn(4));                    // LB: roda de armas (segurar) / próxima arma (toque) — WeaponWheel
        const edge = (i) => btn(i) && !this._padPrev[i];
        if (foot && this.onWeaponCycle) {                   // ←/→: troca de arma (com a roda aberta: troca dentro da categoria)
            if (edge(14)) this.onWeaponCycle(-1);
            if (edge(15)) this.onWeaponCycle(1);
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

    // Inclinação do movimento (0–1): o analógico (controle/joystick da tela) pouco inclinado = andar; teclado = 1.
    get moveTilt() {
        const k = this.keys;
        if (k['w'] || k['s'] || k['a'] || k['d'] || k['arrowup'] || k['arrowdown'] || k['arrowleft'] || k['arrowright']) return 1;
        return Math.min(1, Math.hypot(this.analog.x, this.analog.z));
    }

    // Sprint PROPORCIONAL, como no GTA San Andreas (Shift · L3 · botão CORRER do celular — todos viram a tecla 'shift'): cada toque
    // soma Config.player.sprintTap ao impulso, segurar o mantém em pelo menos sprintHold, e ele cai sprintDecay/s até esse mínimo
    // (solto: até 0 — de volta ao trote). Uma vez por quadro (Game); o mesmo impulso serve a pé, nadando e pedalando. O toque conta
    // pela borda (justPressed): um toque rápido que aperta e solta entre dois quadros não se perde.
    sprintTick(dt) {
        const P = Config.player, held = !!this.keys['shift'];
        if (this.consumePress('shift') || (held && !this._sprintWas)) this.sprint = Math.min(1, Math.max(this.sprint, P.sprintHold * 0.5) + P.sprintTap);
        this._sprintWas = held;
        const floor = held ? P.sprintHold : 0;
        this.sprint = this.sprint > floor ? Math.max(floor, this.sprint - P.sprintDecay * dt) : (held ? floor : 0);
        return this.sprint;
    }

    // Giro da câmera arrastando (rad) desde a última chamada, e zera: o mouse com o botão direito (a não ser com a arma de fogo na mão
    // — `gun`: aí o botão direito é a mira firme) ou o do meio, e os dois dedos torcidos no celular (TouchControls). O analógico direito
    // é lido pelo Game (Game._look). + = para a direita.
    takeLook(gun = false) {
        const C = Config.camera, d = ((gun ? 0 : this._lookR) + this._lookM) * C.lookMouse + this._twist;
        this._lookR = this._lookM = this._twist = 0;
        return d;
    }

    // Arrasto do mouse (botão direito / do meio): soma o quanto andou desde o último ponto. Ancorado no ponto em que o botão desceu e
    // fechado no ponto em que subiu: o giro é exatamente o arrasto, mesmo que algum movimento do meio chegue fora de ordem.
    _dragTo(x) {
        if ((this._dragR || this._dragM) && this._mx != null) { const dx = x - this._mx; if (this._dragR) this._lookR += dx; if (this._dragM) this._lookM += dx; }
        this._mx = x;
    }

    touchTwist(rad) { this._twist += rad; }      // (TouchControls: os dois dedos torcidos, rad; + = para a direita, como turn)

    // The player is still holding the camera turn (mouse button down, a finger on the look side, right stick pushed): the car's
    // look-around must not swing back behind the vehicle meanwhile.
    lookHeld(gun = false) { return (this._dragR && !gun) || this._dragM || this.touchLookDown || (this.padConnected && Math.abs(this.rstick.x) > 0.05 && !this.stickAim); }

    isSprinting() {
        return this.sprint > 0.02 || !!this.keys['shift'];
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
        if (this.wheelOpen) return { keys: 0, wheel: 0 };                // (a roda do mouse troca de arma na roda de armas)
        let keys = 0;
        if (this.keys['x']) keys += 1; // afastar
        if (this.keys['z']) keys -= 1; // aproximar
        keys += this.zoomAxis;

        const wheel = this.wheelDelta;
        this.wheelDelta = 0;
        return { keys, wheel };
    }
}
