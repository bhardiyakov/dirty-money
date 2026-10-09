// ============================================================================
// TouchControls — controles NA TELA para celular/tablet, só quando é tela de toque E não há controle (Xbox) conectado.
//
//   JOYSTICK FLUTUANTE   não fica preso num canto: encostar o dedo em QUALQUER ponto da metade esquerda da tela faz o joystick
//                        nascer ali; soltar, ele volta (apagadinho) para o canto como dica. A pé: anda (empurrar até a borda também
//                        corre). Dirigindo: vira um volante HORIZONTAL (só esquerda/direita) — acelerar e ré ficam nos botões.
//   4 BOTÕES (direita)   mudam com o CONTEXTO (a pé / dirigindo / helicóptero) e com o que dá para fazer ali (lido da dica de
//                        interação do jogo, Game._promptHtml):
//                          A pé:         ATACAR · CORRER (ou a 2ª ação do lugar) · ação do lugar (ENTRAR, ROUBAR, VASCULHAR…;
//                                        sem nada por perto: CHUTE) · ARMA (toque = próxima, segurar = recarregar)
//                          Dirigindo:    ACELERAR · RÉ/FREIO · SAIR · ação do lugar (ABASTECER, DESMANCHAR…; senão BUZINA)
//                          Helicóptero:  SUBIR · DESCER · SAIR · GIRAR
//   ✚ KIT (chip)         aparece só com vida baixa e kit na mochila · ⋯ o resto (mochila, farol, zoom…) · topo: pausa e CARREIRAS
//   pinça (2 dedos)      zoom
// Tudo aperta teclas virtuais do InputManager (setVirtual), então o jogo não sabe a diferença. Some quando um controle é conectado
// ou quando o jogador usa teclado/mouse de verdade (notebook com tela de toque). Também deixa a interface responsiva (classe
// `mobile` no <body>). `?touch` na URL força os controles (para testar no computador).
// ============================================================================

class TouchControls {
    constructor(game) {
        this.g = game;
        this.input = game.input;
        this.shown = false;
        this.stick = { id: null, ox: 0, oy: 0, run: false };
        this._mode = '';
        this._runBtn = false;
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

    // Botões do menu "⋯" (ações raras): [rótulo, tecla, modo ('foot'|'car'|'heli'|'all'), segurar?]
    static get MORE() {
        return [
            ['RECARREGAR', 'r', 'foot'], ['KIT MÉDICO', 'm', 'foot'], ['PULAR / ROLAR', 'v', 'foot'], ['AGACHAR / COBERTURA', 'q', 'foot'], ['FURTAR', 'c', 'foot'], ['MOCHILA', 'i', 'all'],
            ['BUZINA', 'h', 'car', true], ['FAROL', 'l', 'car'], ['GIRAR ↺', 'q', 'heli', true],
            ['ZOOM +', 'z', 'all', true], ['ZOOM −', 'x', 'all', true],
        ];
    }

    _build() {
        const css = document.createElement('style');
        css.textContent = `
            body { overscroll-behavior: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
            #touchUI { position: fixed; inset: 0; z-index: 20; pointer-events: none; display: none; --u: clamp(44px, 11vmin, 76px); font-family: var(--font); }
            #touchUI.on { display: block; }
            #touchUI * { touch-action: none; -webkit-user-select: none; user-select: none; }
            /* zona do joystick: metade esquerda (abaixo do minimapa) */
            #tcZone { position: absolute; left: 0; top: 124px; bottom: 0; width: 48%; pointer-events: auto; }
            #tcStick { position: absolute; width: calc(var(--u) * 2.3); height: calc(var(--u) * 2.3); margin: calc(var(--u) * -1.15) 0 0 calc(var(--u) * -1.15); pointer-events: none;
                border-radius: 50%; background: radial-gradient(circle, rgba(14,17,26,0.22) 0 58%, rgba(255,255,255,0.10) 59% 100%); border: 1.5px solid rgba(255,255,255,0.22);
                opacity: 0.35; transition: opacity .15s ease, border-radius .15s ease, height .15s ease, margin .15s ease; }
            #tcStick.on { opacity: 1; transition: opacity .05s ease, border-radius .15s ease, height .15s ease, margin .15s ease; }
            #tcStick.wheel { height: calc(var(--u) * 0.9); margin-top: calc(var(--u) * -0.45); border-radius: 99px; }
            #tcKnob { position: absolute; left: 50%; top: 50%; width: calc(var(--u) * 1.05); height: calc(var(--u) * 1.05); margin: calc(var(--u) * -0.525) 0 0 calc(var(--u) * -0.525);
                border-radius: 50%; background: radial-gradient(circle at 35% 30%, rgba(255,255,255,0.88), rgba(210,218,235,0.55)); box-shadow: 0 6px 18px rgba(0,0,0,0.4); }
            #tcStick.run #tcKnob { background: radial-gradient(circle at 35% 30%, #d1fae5, #34d399); }
            /* os 4 botões de contexto */
            .tcb { position: absolute; pointer-events: auto; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
                width: calc(var(--u) * 1.2); height: calc(var(--u) * 1.2); font-size: calc(var(--u) * 0.17); font-weight: 800; color: #fff; line-height: 1.05; letter-spacing: 0.02em;
                background: rgba(14,17,26,0.58); border: 1.5px solid rgba(255,255,255,0.24); border-radius: 50%; box-shadow: 0 6px 16px rgba(0,0,0,0.35); }
            .tcb i { font-style: normal; font-family: var(--emoji); font-size: calc(var(--u) * 0.36); line-height: 1; margin-bottom: 2px; }
            .tcb small { font-size: calc(var(--u) * 0.15); color: var(--gold); font-weight: 700; margin-top: 1px; }
            .tcb.down { transform: scale(0.93); filter: brightness(1.35); }
            .tcb.pop { animation: tcPop 0.18s ease-out; }
            @keyframes tcPop { from { transform: scale(0.7); opacity: 0.2; } to { transform: scale(1); opacity: 1; } }
            #tcA { width: calc(var(--u) * 1.75); height: calc(var(--u) * 1.75); right: calc(var(--u) * 0.35); bottom: calc(var(--u) * 0.4); font-size: calc(var(--u) * 0.22); }
            #tcA i { font-size: calc(var(--u) * 0.5); }
            #tcB { right: calc(var(--u) * 2.3); bottom: calc(var(--u) * 0.32); }
            #tcC { right: calc(var(--u) * 0.6); bottom: calc(var(--u) * 2.35); }
            #tcD { right: calc(var(--u) * 2.05); bottom: calc(var(--u) * 1.8); width: calc(var(--u) * 1.1); height: calc(var(--u) * 1.1); }
            .tcb.c-red { background: linear-gradient(180deg, rgba(251,113,133,0.82), rgba(225,29,72,0.82)); }
            .tcb.c-green { background: linear-gradient(180deg, rgba(74,222,128,0.8), rgba(22,163,74,0.8)); }
            .tcb.c-blue { background: linear-gradient(180deg, rgba(96,165,250,0.78), rgba(37,99,235,0.78)); }
            .tcb.c-violet { background: linear-gradient(180deg, rgba(167,139,250,0.78), rgba(124,58,237,0.78)); }
            .tcb.c-amber { background: linear-gradient(180deg, rgba(251,191,36,0.8), rgba(217,119,6,0.8)); }
            .tcb.c-dark { background: rgba(14,17,26,0.62); }
            #touchUI .hide { display: none !important; }
            .tcchip { position: absolute; pointer-events: auto; display: flex; align-items: center; gap: 6px; padding: 0 12px; height: calc(var(--u) * 0.62); border-radius: 12px;
                font-size: calc(var(--u) * 0.2); font-weight: 700; color: #fff; background: rgba(14,17,26,0.6); border: 1.5px solid rgba(255,255,255,0.2); white-space: nowrap; }
            .tcchip.down { background: rgba(52,211,153,0.75); }
            #tcKit { right: calc(var(--u) * 3.45); bottom: calc(var(--u) * 2.15); color: #fda4af; }
            #tcMore { right: calc(var(--u) * 0.35); bottom: calc(var(--u) * 3.7); width: calc(var(--u) * 0.8); justify-content: center; font-size: calc(var(--u) * 0.32); padding: 0; }
            #tcMorePanel { position: absolute; right: calc(var(--u) * 1.3); bottom: calc(var(--u) * 3.05); pointer-events: auto; display: none; flex-wrap: wrap; gap: 6px; width: calc(var(--u) * 4.6);
                justify-content: flex-end; padding: 8px; border-radius: 18px; background: rgba(14,17,26,0.88); border: 1px solid rgba(255,255,255,0.16); }
            #tcMorePanel.on { display: flex; }
            #tcMorePanel .tcchip { position: static; height: calc(var(--u) * 0.6); }
            .tct { position: absolute; top: calc(var(--u) * 0.15); pointer-events: auto; width: calc(var(--u) * 0.7); height: calc(var(--u) * 0.7); border-radius: 50%; font-size: calc(var(--u) * 0.2);
                display: flex; align-items: center; justify-content: center; font-weight: 700; color: #fff; background: rgba(14,17,26,0.6); border: 1.5px solid rgba(255,255,255,0.2); }
            .tct.down { background: rgba(52,211,153,0.7); }
            #tcBack { position: fixed; right: 10px; top: 10px; z-index: 40; display: none; padding: 10px 16px; font-family: var(--font); font-weight: 700; font-size: 14px; color: #fff;
                background: linear-gradient(180deg, #fb7185, #e11d48); border: none; border-radius: 99px; box-shadow: 0 6px 16px rgba(0,0,0,0.4); }
            #tcBack.on { display: block; }

            /* ---- interface responsiva (celular / janela estreita) ---- */
            /* celular: sem máscara/sombras difusas no HUD (cada quadro repinta tudo isso por cima do WebGL) */
            body.mobile .px { box-shadow: none !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; background: rgba(14,17,26,0.82); }
            body.mobile #minimap { box-shadow: none !important; }
            body.mobile #opVignette { animation: none; opacity: 0.6; }
            body.mobile #hud2 { top: 6px; right: 6px; transform: scale(0.56); transform-origin: top right; gap: 7px; }
            body.mobile #hud2 .wanted-panel .px-title, body.mobile #hud2 .px-forces { display: none; }
            body.mobile #hud2 .wanted-panel .px-body { padding: 8px 14px; flex-direction: row; align-items: center; justify-content: space-between; }
            body.mobile #hud2 .h-main { padding: 9px; } body.mobile #hud2 .stats-panel { padding: 8px 14px; }
            body.mobile #hMission { transform: scale(0.7); transform-origin: top left; left: 124px; top: 8px; }
            body.mobile #toast, body.mobile #prompt, body.mobile #goalBox .gl { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
            body.mobile #minimap { width: 108px !important; height: 108px !important; left: 8px !important; top: 8px !important; bottom: auto !important; border-width: 3px; }
            body.mobile #toast { font-size: 12px; top: 60px; max-width: 54vw; padding: 6px 12px; }
            body.mobile #prompt { font-size: 12px; padding: 6px 10px; bottom: auto; top: 8px; max-width: 44vw; white-space: normal; }
            body.mobile #prompt b { min-width: 20px; height: 20px; font-size: 11px; margin-right: 5px; }
            body.mobile #prompt small { font-size: 10px; }
            body.mobile #vehPop { transform: scale(0.55); transform-origin: top left; right: auto; left: 8px; bottom: auto; top: 124px; }
            body.mobile #vehPop.show { transform: scale(0.55); }
            body.mobile #inventory { width: 62vw !important; max-height: 80vh; overflow: auto; }
            @media (max-width: 900px), (max-height: 520px) {
                #pause { padding: 8px 8px 6px !important; gap: 8px !important; }
                .pm-tab { padding: 6px 10px !important; font-size: 12px !important; }
                .pm-tabs { gap: 6px !important; }
                .pm-main { flex-direction: column !important; overflow: auto; }
                .pm-side { width: auto !important; max-height: 38%; }
                .pm-hints { display: none !important; }
                #pause .px-title { font-size: 11px !important; padding: 10px 14px 6px !important; }
            }`;
        document.head.appendChild(css);

        const root = this.root = document.createElement('div');
        root.id = 'touchUI';
        root.innerHTML = '<div id="tcZone"></div><div id="tcStick"><div id="tcKnob"></div></div>';
        document.body.appendChild(root);
        this.zone = root.querySelector('#tcZone'); this.stickEl = root.querySelector('#tcStick'); this.knob = root.querySelector('#tcKnob');
        this._bindStick();

        const mk = (id, cls, html = '') => { const d = document.createElement('div'); d.id = id; d.className = cls; d.innerHTML = html; root.appendChild(d); return d; };
        // os 4 botões: o que cada um faz é lido NA HORA do toque (this.slots, montado em update)
        this.slots = [null, null, null, null];
        this.btns = ['tcA', 'tcB', 'tcC', 'tcD'].map((id, i) => { const b = mk(id, 'tcb'); this._bindSlot(b, i); return b; });
        this._sig = ['', '', '', ''];
        this.kit = mk('tcKit', 'tcchip hide', '✚ KIT');
        this._bindButton(this.kit, 'm', false);
        this.moreBtn = mk('tcMore', 'tcchip', '⋯');
        this.morePanel = mk('tcMorePanel', '');
        this.moreBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.morePanel.classList.toggle('on'); });
        this.more = TouchControls.MORE.map(([label, key, mode, hold]) => {
            const b = document.createElement('div'); b.className = 'tcchip'; b.textContent = label; b.dataset.mode = mode;
            this.morePanel.appendChild(b); this._bindButton(b, key, !!hold);
            if (!hold) b.addEventListener('pointerup', () => this.morePanel.classList.remove('on'));
            return b;
        });
        // atalhos do topo (ao lado do HUD): pausa/mapa e carreiras
        this.top = [['II', 'p'], ['CRIME', 'o']].map(([label, key], i) => {
            const b = document.createElement('div');
            b.className = 'tct'; b.textContent = label; b.dataset.i = i;
            root.appendChild(b); this._bindButton(b, key, false); return b;
        });
        this._bindPinch();
        const back = this.back = document.createElement('div');
        back.id = 'tcBack'; back.textContent = '✕ VOLTAR';
        back.addEventListener('pointerdown', (e) => { e.preventDefault(); if (this.g.menu.isOpen) this.g.menu.close(); });
        document.body.appendChild(back);
        root.addEventListener('touchstart', (e) => { if (e.target !== root) e.preventDefault(); }, { passive: false });     // (sem mouse emulado, zoom nem rolagem)
        root.addEventListener('contextmenu', (e) => e.preventDefault());
        this._bindMinimap();
        this._parkStick();
    }

    // Toque no minimapa = mapa EXPANDIDO (tela cheia, um dedo arrasta, pinça dá zoom, toque marca o destino). Só no toque: no
    // computador o clique continua sendo ataque/mira (com a mira manual dá para apontar por cima do radar).
    _bindMinimap() {
        const mm = document.getElementById('minimap'), g = this.g;
        if (!mm) return;
        if (g.minimap) g.minimap.expandHint = this.input.touchDevice;
        mm.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });         // (sem clique emulado, que viraria soco)
        mm.addEventListener('contextmenu', (e) => e.preventDefault());
        mm.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse') return;
            e.preventDefault();
            if (parseFloat(mm.style.opacity || '1') < 0.5 || mm.style.visibility === 'hidden' || !g._canPause()) return;      // (dentro de loja/casa o radar some)
            AudioFX.init();
            g.menu.openMap(true);
        });
    }

    // hold = a tecla fica apertada enquanto o dedo estiver no botão; senão é um toque único (aperta e solta em 60 ms).
    _bindButton(el, key, hold = true) {
        const press = (down) => {
            el.classList.toggle('down', down);
            if (!hold) { if (down) this._tap(key); return; }
            this.input.setVirtual(key, down, 'touch');
        };
        el.addEventListener('pointerdown', (e) => { e.preventDefault(); AudioFX.init(); try { el.setPointerCapture(e.pointerId); } catch (x) { /* ok */ } press(true); });
        const up = (e) => { e.preventDefault(); if (el.classList.contains('down')) press(false); };
        el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    }

    _tap(key) { this.input.setVirtual(key, true, 'touch'); setTimeout(() => this.input.setVirtual(key, false, 'touch'), 60); }

    // Botão de contexto: no toque lê o que o slot faz AGORA e segura/solta a MESMA ação até o fim do toque (trocar de contexto com o
    // dedo no botão não deixa tecla presa). Tipos: hold (segura a tecla), tap (toque único), weapon (toque = próxima arma, segurar = recarregar),
    // run (correr: combinado com o joystick no update).
    _bindSlot(el, i) {
        let held = null, timer = null;
        el.addEventListener('pointerdown', (e) => {
            e.preventDefault(); AudioFX.init();
            const s = this.slots[i]; if (!s || held) return;
            try { el.setPointerCapture(e.pointerId); } catch (x) { /* ok */ }
            held = s; el.classList.add('down');
            if (navigator.vibrate) try { navigator.vibrate(8); } catch (x) { /* ok */ }
            if (s.type === 'weapon') timer = setTimeout(() => { timer = null; this._tap('r'); }, 450);
            else if (s.type === 'run') this._runBtn = true;
            else if (s.type === 'tap') this._tap(s.key);
            else this.input.setVirtual(s.key, true, 'touch');
        });
        const up = (e) => {
            e.preventDefault(); if (!held) return;
            const s = held; held = null; el.classList.remove('down');
            if (s.type === 'weapon') { if (timer) { clearTimeout(timer); timer = null; if (this.input.onWeaponCycle) this.input.onWeaponCycle(1); } }
            else if (s.type === 'run') this._runBtn = false;
            else if (s.type === 'hold') this.input.setVirtual(s.key, false, 'touch');
        };
        el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    }

    // Pinça com dois dedos no jogo = zoom (substitui os botões + e −).
    _bindPinch() {
        const cv = this.g.gameEngine && this.g.gameEngine.canvas; if (!cv) return;
        const pts = new Map(); let d0 = 0;
        const dist = () => { const [a, b] = [...pts.values()]; return hypot(a.x - b.x, a.y - b.y); };
        cv.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) d0 = dist(); });
        cv.addEventListener('pointermove', (e) => {
            if (!pts.has(e.pointerId)) return; pts.get(e.pointerId).x = e.clientX; pts.get(e.pointerId).y = e.clientY;
            if (pts.size !== 2 || !this.g.camera) return;
            const d = dist(); this.g.camera.zoom(-(d - d0) * 0.04); d0 = d;
        });
        const end = (e) => { pts.delete(e.pointerId); };
        cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    }

    // Ações de contexto lidas da dica de interação (<b>E</b> vasculhar…): no máximo 2, na ordem em que a dica as mostra.
    static parseActions(html) {
        // (chamado todo quadro no celular; a dica só muda de vez em quando: guarda a última leitura)
        if (html === TouchControls._lastHtml) return TouchControls._lastActs;
        TouchControls._lastHtml = html;
        return (TouchControls._lastActs = TouchControls._parse(html));
    }

    static _parse(html) {
        const out = [], seen = new Set(), re = /<b>([EFGCV])<\/b>\s*([^<]*)/g;
        let m;
        while ((m = re.exec(html || '')) && out.length < 2) {
            const key = m[1].toLowerCase();
            if (seen.has(key)) continue;
            let t = m[2].replace(/\(segure\)\s*/i, '').replace(/[—·(:].*$/, '').trim().split(/\s+/).filter((w) => !/^(o|a|os|as|e|de|do|da|na|no|para|este|esta|um|uma)$/i.test(w)).slice(0, 2).join(' ');
            if (t.length > 12) t = t.split(' ')[0];                          // botão pequeno: duas palavras só se couberem
            if (!t) t = { e: 'AGIR', f: 'ENTRAR', g: 'ARROMBAR', c: 'FURTAR', v: 'PULAR' }[key];
            seen.add(key); out.push({ key, label: t.toUpperCase() });
        }
        return out;
    }

    // ------------------------------------------------------------------ joystick flutuante
    // Nasce onde o dedo encosta (metade esquerda). A pé: analógico 2D (borda = correr). Dirigindo: volante horizontal.
    _bindStick() {
        const S = this.stick, z = this.zone;
        const R = () => this.stickEl.offsetWidth / 2 || 60;
        const move = (e) => {
            if (e.pointerId !== S.id) return;
            const r = R(), car = this._mode === 'car';
            let dx = e.clientX - S.ox, dy = car ? 0 : e.clientY - S.oy;
            const d = hypot(dx, dy) || 1, k = Math.min(1, d / r), ux = dx / d, uy = dy / d, m = d < r * 0.12 ? 0 : k;
            // o dedo foi longe demais: a base acompanha (não "perde" o joystick)
            if (d > r * 1.35) { S.ox += ux * (d - r * 1.35); if (!car) S.oy += uy * (d - r * 1.35); this._placeStick(S.ox, S.oy); }
            this.knob.style.transform = `translate(${ux * k * r * 0.72}px, ${uy * k * r * 0.72}px)`;
            this.input.analog.x = ux * m; this.input.analog.z = car ? 0 : -uy * m;
            S.run = !car && k > 0.92;
            this.stickEl.classList.toggle('run', S.run && this._mode === 'foot');
        };
        const end = (e) => {
            if (e.pointerId !== S.id) return;
            S.id = null; S.run = false;
            this.input.analog.x = 0; this.input.analog.z = 0;
            this._parkStick();
        };
        z.addEventListener('pointerdown', (e) => {
            e.preventDefault(); AudioFX.init(); NativeMobile.enter();
            if (S.id !== null) return;
            S.id = e.pointerId; S.ox = e.clientX; S.oy = e.clientY;
            try { z.setPointerCapture(e.pointerId); } catch (x) { /* ok */ }
            this._placeStick(S.ox, S.oy); this.stickEl.classList.add('on');
            this.knob.style.transform = '';
        });
        z.addEventListener('pointermove', move); z.addEventListener('pointerup', end); z.addEventListener('pointercancel', end); z.addEventListener('lostpointercapture', end);
    }
    _placeStick(x, y) { this.stickEl.style.left = x + 'px'; this.stickEl.style.top = y + 'px'; }
    // Sem dedo: volta apagadinho para o canto (só para mostrar onde fica).
    _parkStick() {
        const u = this._u || 60;
        this._placeStick(u * 0.35 + u * 1.15, window.innerHeight - u * 0.35 - u * 1.15);
        this.stickEl.classList.remove('on', 'run');
        this.knob.style.transform = '';
    }

    // Os atalhos do topo ficam à esquerda do painel do HUD (canto direito, escalado).
    _layout() {
        const mobile = this.input.touchDevice || window.innerWidth < 900;
        document.body.classList.toggle('mobile', mobile);
        const u = this._u = Math.max(44, Math.min(76, Math.min(window.innerWidth, window.innerHeight) * 0.11));
        const hudW = (document.getElementById('hud2') ? document.getElementById('hud2').offsetWidth : 330) * 0.56 + 14;      // HUD escalado a 56% no celular
        this.top.forEach((b, i) => { b.style.right = `${hudW + i * (u * 0.8)}px`; b.style.width = i ? `${u * 0.95}px` : ''; });
        if (this.stick.id === null) this._parkStick();
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

    // ------------------------------------------------------------------ o que cada botão faz agora
    // slot: { type: 'hold'|'tap'|'weapon'|'run', key, label, icon, color, sub? }
    _slotsFor(mode) {
        const g = this.g, H = (key, label, icon, color) => ({ type: 'hold', key, label, icon, color }), T = (key, label, icon, color) => ({ type: 'tap', key, label, icon, color });
        const ICON = { e: '✋', f: '🚪', g: '🔓', c: '🫳', v: '🧗' };
        const acts = mode === 'heli' ? [] : TouchControls.parseActions(g._promptHtml).filter((a) => !(mode !== 'foot' && a.key === 'f'));
        const ctx = (a, color) => (a.key === 'e' ? H : T)(a.key, a.label, ICON[a.key] || '✋', color);      // E (abastecer, desmanchar…) às vezes é "segure"
        if (mode === 'car') return [
            H('w', 'ACELERAR', '⏩', 'c-green'),
            H('s', 'RÉ / FREIO', '⏪', 'c-red'),
            T('f', 'SAIR', '🚪', 'c-dark'),
            acts[0] ? ctx(acts[0], 'c-blue') : H('h', 'BUZINA', '📯', 'c-dark'),
        ];
        if (mode === 'heli') return [
            H(' ', 'SUBIR', '⬆️', 'c-green'),
            H('shift', 'DESCER', '⬇️', 'c-amber'),
            T('f', 'SAIR', '🚪', 'c-dark'),
            H('e', 'GIRAR', '↻', 'c-dark'),
        ];
        const p = g.player, inv = g.inventory, w = p.weapon === 'none' ? 'fists' : p.weapon, gun = inv.isGun(w);
        const wName = (Weapons[w] ? Weapons[w].name : 'Punhos').toUpperCase();
        return [
            H(' ', gun ? 'ATIRAR' : 'ATACAR', gun ? '🔫' : (w === 'fists' ? '👊' : Emoji.char(w) || '👊'), 'c-red'),
            acts[1] ? ctx(acts[1], 'c-violet') : { type: 'run', key: 'shift', label: 'CORRER', icon: '🏃', color: 'c-amber' },
            acts[0] ? ctx(acts[0], 'c-blue') : T('i', 'BOLSA', '🎒', 'c-dark'),                // (o chute agora é o 3º golpe do combo de ATACAR)
            { type: 'weapon', key: 'r', label: wName.length > 9 ? wName.split(' ')[0] : wName, icon: '🔄', color: 'c-dark', sub: gun ? inv.ammoText(w) : '' },
        ];
    }

    // Todo frame (Game): monta os 4 botões conforme o modo e a dica, o chip do kit e o correr (botão OU joystick na borda).
    update() {
        this.back.classList.toggle('on', this.shown && this.g.menu.isOpen);
        this.root.style.display = this.shown && !this.g.menu.isOpen ? 'block' : 'none';
        if (!this.shown || this.g.menu.isOpen) return;
        const g = this.g, mode = g.mode === 'heli' ? 'heli' : (g.mode === 'car' && g.activeCar ? 'car' : 'foot');
        if (mode !== this._mode) {
            this._mode = mode;
            document.body.classList.toggle('tc-car', mode === 'car');
            for (const b of this.more) { const m = b.dataset.mode; b.style.display = m === 'all' || m === mode ? '' : 'none'; }
            this.stickEl.classList.toggle('wheel', mode === 'car');
            this.input.analog.z = 0;
            this._runBtn = false;
            for (const k of ['shift', 'w', 's', ' ', 'h', 'e']) this.input.setVirtual(k, false, 'touch');      // nada preso de um modo para o outro
        }
        const slots = this._slotsFor(mode);
        for (let i = 0; i < 4; i++) {
            const s = slots[i], sig = s.type + s.key + s.label + (s.sub || '') + s.icon;
            this.slots[i] = s;
            if (sig === this._sig[i]) continue;
            const changed = !this._sig[i] || this._sig[i].slice(0, 8) !== sig.slice(0, 8);
            this._sig[i] = sig;
            const b = this.btns[i];
            b.className = 'tcb ' + s.color + (b.classList.contains('down') ? ' down' : '');
            b.innerHTML = `<i>${s.icon}</i>${s.label}${s.sub ? `<small>${s.sub}</small>` : ''}`;
            if (changed) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
        }
        // correr: botão CORRER segurado OU joystick empurrado até a borda (só a pé; no helicóptero o shift é o DESCER)
        if (mode === 'foot') this.input.setVirtual('shift', this._runBtn || this.stick.run, 'touch');
        // kit
        if (mode === 'foot') {
            const p = g.player, inv = g.inventory;
            const showKit = inv.medkits > 0 && p.hp < p.maxHp * 0.75;
            if (showKit !== this._kitOn) { this._kitOn = showKit; this.kit.classList.toggle('hide', !showKit); }
            if (showKit) { const t = `✚ KIT (${inv.medkits})`; if (t !== this._kitTxt) { this._kitTxt = t; this.kit.textContent = t; } }
        } else if (this._kitOn) { this._kitOn = false; this.kit.classList.add('hide'); }
    }
}

// ============================================================================
// NativeMobile — "cara de app" no celular: tela cheia e paisagem.
//   • enter(): pede tela cheia (sem a barra do navegador) e trava a orientação em PAISAGEM. O navegador só deixa fazer isso dentro de
//     um toque do usuário, então é chamado no 1º toque na tela (menu inicial) e em toques no jogo se a tela cheia tiver saído.
//   • Celular em pé: aviso "gire o celular" por cima de tudo (CSS no index.html, classe `portrait-lock`).
//   • iPhone (Safari não tem tela cheia para páginas): "Adicionar à Tela de Início" abre como app em tela cheia (manifest + metas).
// ============================================================================
const NativeMobile = {
    _t: 0,
    get touch() { return ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || /[?&]touch\b/.test(location.search); },
    init() {
        if (!this.touch) return;
        document.documentElement.classList.add('touch-device');
        const first = () => this.enter();
        window.addEventListener('pointerdown', first, { capture: true, passive: true });
        window.addEventListener('touchend', first, { capture: true, passive: true });
    },
    enter() {
        if (!this.touch) return;
        const now = performance.now();
        if (now - this._t < 1500) return;                                  // (um pedido por toque, sem insistir a cada quadro)
        this._t = now;
        const d = document, el = d.documentElement;
        const fs = d.fullscreenElement || d.webkitFullscreenElement;
        const lock = () => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) { /* sem trava */ } };
        if (fs) { lock(); return; }
        try {
            const req = el.requestFullscreen || el.webkitRequestFullscreen;
            if (req) { const r = req.call(el, { navigationUI: 'hide' }); if (r && r.then) r.then(lock).catch(() => {}); else lock(); }
        } catch (e) { /* navegador sem tela cheia */ }
    },
};
NativeMobile.init();
memoStatics(TouchControls, 'MORE');
