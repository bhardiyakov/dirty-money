// ============================================================================
// TouchControls — controles NA TELA para celular/tablet, só quando é tela de toque E não há controle (Xbox) conectado.
//
//   JOYSTICK FLUTUANTE   não fica preso num canto: encostar o dedo em QUALQUER ponto da metade esquerda da tela faz o joystick
//                        nascer ali; soltar, ele volta (apagadinho) para o canto como dica. A pé: pouco inclinado ANDA, inclinado TROTA
//                        (Config.player.walkTilt). Dirigindo: vira um volante HORIZONTAL (só esquerda/direita) — acelerar e ré ficam
//                        nos botões. Com o VOLANTE POR GIROSCÓPIO ligado (Ajustes; TiltSteer, abaixo), inclinar o celular vira o
//                        carro, o RÉ/FREIO vai para o canto esquerdo (polegar esquerdo freia, o direito acelera) e o joystick, se
//                        tocado, ainda manda por cima.
//   BOTÕES DE AÇÃO       em arco em volta do botão principal (canto inferior direito). Mudam com o CONTEXTO (a pé / dirigindo /
//                        helicóptero) e com o que dá para fazer ali (lido da dica de interação do jogo, Game._promptHtml):
//                          A pé:         ATACAR · ROLAR (perto de grade/muro: PULAR) · ARMA (abre a RODA DE ARMAS: tocar = ela fica
//                                        aberta; encostar e arrastar até a fatia = equipa ao soltar — WeaponWheel)
//                                        · ação do lugar (ENTRAR, ROUBAR, VASCULHAR…; sem nada por perto: BOLSA) · AGACHAR
//                                        · 2ª ação do lugar (só aparece quando há)
//                          Dirigindo:    ACELERAR · RÉ/FREIO · SAIR · ação do lugar (ABASTECER, DESMANCHAR…; só quando há) · BUZINA
//                          Helicóptero:  SUBIR · DESCER · SAIR · GIRAR
//   SPRINT               o botão de correr (a tecla Shift): como no GTA San Andreas, TOCAR repetido corre cada vez mais rápido e
//                        SEGURAR mantém um sprint médio (InputManager.sprintTick) — e gasta fôlego. Nadando, nada mais rápido (crawl);
//                        na bicicleta, pedala forte. Some dentro de loja/casa (lá só se anda, fora de assalto/missão).
//   ✚ KIT (chip)         aparece só com vida baixa e kit na mochila
//   topo (sob o HUD)     ⋯ o resto (recarregar, mochila, farol, zoom…) · CRIME (carreiras) · pausa
//   pinça (2 dedos)      zoom
// Tudo aperta teclas virtuais do InputManager (setVirtual), então o jogo não sabe a diferença. Some quando um controle é conectado
// ou quando o jogador usa teclado/mouse de verdade (notebook com tela de toque). Também deixa a interface responsiva (classe
// `mobile` no <body>: HUD enxuto — ver o CSS abaixo). `?touch` na URL força os controles (para testar no computador).
// ============================================================================

class TouchControls {
    constructor(game) {
        this.g = game;
        this.input = game.input;
        this.shown = false;
        this.stick = { id: null, ox: 0, oy: 0 };
        this._mode = '';
        this._tilt = false;
        this._build();
        TiltSteer.notify = (msg) => { if (this.g.ui && this.g.hud) this.g._flash(msg); };
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
            ['RECARREGAR', 'r', 'foot'], ['KIT MÉDICO', 'm', 'foot'], ['FURTAR', 'c', 'foot'], ['MOCHILA', 'i', 'all'],
            ['FAROL', 'l', 'car'], ['GIRAR ↺', 'q', 'heli', true],
            ['ZOOM +', 'z', 'all', true], ['ZOOM −', 'x', 'all', true],
        ];
    }

    _build() {
        const css = document.createElement('style');
        css.textContent = `
            body { overscroll-behavior: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
            #touchUI { position: fixed; inset: 0; z-index: 20; pointer-events: none; display: none; --u: clamp(44px, 11vmin, 76px); font-family: var(--font);
                --sl: env(safe-area-inset-left, 0px); --sr: env(safe-area-inset-right, 0px); --sb: env(safe-area-inset-bottom, 0px); }      /* (fora do entalhe e dos cantos arredondados) */
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
            #tcStick.tilt:not(.on) { opacity: 0.55; }
            #tcStick.tilt:not(.on) #tcKnob { transition: transform .08s linear; }
            /* botões de ação: o principal (A) no canto e os outros em arco em volta dele. --r/--b: distância da borda direita/de baixo,
               --s: tamanho (tudo em --u) */
            .tcb { position: absolute; pointer-events: auto; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
                --s: 1.2; width: calc(var(--u) * var(--s)); height: calc(var(--u) * var(--s)); right: calc(var(--sr) + var(--u) * var(--r)); bottom: calc(var(--sb) + var(--u) * var(--b));
                font-size: calc(var(--u) * 0.17); font-weight: 800; color: #fff; line-height: 1.05; letter-spacing: 0.02em;
                background: rgba(14,17,26,0.58); border: 1.5px solid rgba(255,255,255,0.24); border-radius: 50%; box-shadow: 0 6px 16px rgba(0,0,0,0.35); }
            .tcb i { font-style: normal; font-family: var(--emoji); font-size: calc(var(--u) * 0.36); line-height: 1; margin-bottom: 2px; }
            .tcb small { font-size: calc(var(--u) * 0.15); color: var(--gold); font-weight: 700; margin-top: 1px; }
            .tcb.down { transform: scale(0.93); filter: brightness(1.35); }
            .tcb.pop { animation: tcPop 0.18s ease-out; }
            @keyframes tcPop { from { transform: scale(0.7); opacity: 0.2; } to { transform: scale(1); opacity: 1; } }
            #tcA { --s: 1.75; --r: 0.35; --b: 0.4; font-size: calc(var(--u) * 0.22); }          /* principal: ATACAR / MIRA / ACELERAR / SUBIR */
            #tcA > * { transform: translate(var(--ax, 0px), var(--ay, 0px)); }                   /* MIRA: the icon follows the finger (the stick's knob) */
            #tcA i { font-size: calc(var(--u) * 0.5); }
            #tcB { --r: 2.4; --b: 0.36; }                                                        /* à esquerda: ROLAR / RÉ / DESCER */
            #tcD { --r: 2.0; --b: 1.83; }                                                        /* diagonal: ARMA / SAIR */
            #tcC { --r: 0.62; --b: 2.48; }                                                       /* em cima: ação do lugar / GIRAR */
            #tcE { --s: 1; --r: 3.75; --b: 0.25; font-size: calc(var(--u) * 0.15); }             /* pequeno, mais à esquerda: AGACHAR / BUZINA */
            #tcE i { font-size: calc(var(--u) * 0.3); }
            #tcF { --s: 1.1; --r: 2.03; --b: 3.63; }                                             /* 2ª ação do lugar (só quando há) */
            #tcRun { --s: 1.15; --r: 3.6; --b: 1.5; font-size: calc(var(--u) * 0.15); }          /* SPRINT: tocar repetido = mais rápido, segurar = sprint médio */
            #tcRun.drive { box-shadow: 0 0 0 calc(var(--u) * 0.06 * var(--k, 0)) rgba(74,222,128,0.55), 0 6px 16px rgba(0,0,0,0.35); }
            /* volante por giroscópio: o RÉ/FREIO vai para o polegar esquerdo (o joystick continua valendo no resto da metade esquerda) */
            #touchUI.tilt #tcB { --s: 1.6; right: auto; left: calc(var(--sl) + var(--u) * 0.45); bottom: calc(var(--sb) + var(--u) * 0.45); font-size: calc(var(--u) * 0.2); }
            #touchUI.tilt #tcB i { font-size: calc(var(--u) * 0.46); }
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
            #tcKit { right: calc(var(--sr) + var(--u) * 3.35); bottom: calc(var(--sb) + var(--u) * 2.85); color: #fda4af; }
            /* atalhos do topo, logo abaixo do HUD (o top é posto em _placeTop): ⋯ · CRIME · pausa; o painel do ⋯ abre embaixo deles */
            #tcTop { position: absolute; right: max(6px, var(--sr)); top: 8px; display: flex; gap: 6px; pointer-events: none; }
            .tct { pointer-events: auto; min-width: calc(var(--u) * 0.72); height: calc(var(--u) * 0.72); padding: 0 calc(var(--u) * 0.16); border-radius: 99px; font-size: calc(var(--u) * 0.2);
                display: flex; align-items: center; justify-content: center; font-weight: 700; color: #fff; background: rgba(14,17,26,0.6); border: 1.5px solid rgba(255,255,255,0.2); }
            .tct.down, .tct.open { background: rgba(52,211,153,0.7); }
            #tcMore { font-size: calc(var(--u) * 0.32); padding: 0; }
            #tcMorePanel { position: absolute; right: 0; top: calc(100% + 6px); pointer-events: auto; display: none; flex-wrap: wrap; gap: 6px; width: calc(var(--u) * 4.6);
                justify-content: flex-end; padding: 8px; border-radius: 18px; background: rgba(14,17,26,0.88); border: 1px solid rgba(255,255,255,0.16); }
            #tcMorePanel.on { display: flex; }
            #tcMorePanel .tcchip { position: static; height: calc(var(--u) * 0.6); }
            #tcBack { position: fixed; right: 10px; top: 10px; z-index: 40; display: none; padding: 10px 16px; font-family: var(--font); font-weight: 700; font-size: 14px; color: #fff;
                background: linear-gradient(180deg, #fb7185, #e11d48); border: none; border-radius: 99px; box-shadow: 0 6px 16px rgba(0,0,0,0.4); }
            #tcBack.on { display: block; }

            /* ---- interface responsiva (celular / janela estreita) ---- */
            /* celular: sem máscara/sombras difusas no HUD (cada quadro repinta tudo isso por cima do WebGL) */
            body.mobile .px { box-shadow: none !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; background: rgba(14,17,26,0.82); }
            body.mobile #minimap { box-shadow: none !important; }
            body.mobile #opVignette { animation: none; opacity: 0.6; }
            /* HUD enxuto: uma faixa estreita no canto (barras sem rótulo, colete só vestido, fôlego só quando gasto, dinheiro e hora,
               estrelas só com procurado). A arma e a munição aparecem no próprio botão ARMA; peso, troféus, dinheiro limpo e bairro
               ficam no menu. Sobra a lateral direita para os botões de ação. */
            body.mobile #hud2 { top: max(6px, env(safe-area-inset-top)); right: max(6px, env(safe-area-inset-right)); width: 184px; transform: none !important; gap: 4px; }
            body.mobile #hud2 .px { border-radius: 12px; }
            body.mobile #hud2 .h-weap, body.mobile #hud2 .h-load, body.mobile #hud2 .emp-panel, body.mobile #hud2 .px-forces, body.mobile #hud2 .wanted-panel .px-title { display: none; }
            body.mobile #hud2 .h-main { padding: 6px 10px; }
            body.mobile #hud2 .h-vit { gap: 5px; }
            body.mobile #hud2 .vrow { gap: 6px; }
            body.mobile #hud2 .vrow .emo { font-size: 12px; width: 14px; }
            body.mobile #hud2 .vrow .vcol { flex-direction: row; align-items: center; gap: 6px; }
            body.mobile #hud2 .px-bar { flex: 1; height: 6px; }
            body.mobile #hud2 .px-label { order: 2; }
            body.mobile #hud2 .px-label > span:first-child { display: none; }
            body.mobile #hud2 .px-label .px-pct { font-size: 11px; min-width: 20px; text-align: right; }
            body.mobile #hud2 .vrow.off { display: none; }
            body.mobile #hud2 .stats-panel { padding: 5px 10px; flex-wrap: nowrap; gap: 8px; }
            body.mobile #hud2 .stats-panel .st { font-size: 12px; gap: 4px; }
            body.mobile #hud2 .stats-panel .st .emo { font-size: 12px; }
            body.mobile #hud2 .stats-panel .st.cash { flex-basis: auto; min-width: 0; }
            body.mobile #hud2 .stats-panel .st.cash small, body.mobile #hud2 .stats-panel .st:last-child { display: none; }
            body.mobile #hud2 .wanted-panel .px-body { padding: 4px 10px; flex-direction: row; align-items: center; justify-content: space-between; gap: 6px; }
            body.mobile #hud2 .px-stars { gap: 1px; } body.mobile #hud2 .px-stars .emo { font-size: 13px; }
            body.mobile #hud2 .px-status { font-size: 10px; letter-spacing: 0.02em; white-space: nowrap; }
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
        // os botões de ação (A principal; B, D, C em arco; E pequeno; F 2ª ação): o que cada um faz é lido NA HORA do toque
        // (this.slots, montado em update); slot vazio esconde o botão
        this.slots = [null, null, null, null, null, null];
        this.btns = ['tcA', 'tcB', 'tcC', 'tcD', 'tcE', 'tcF'].map((id, i) => { const b = mk(id, 'tcb hide'); this._bindSlot(b, i); return b; });
        this._sig = this.slots.map(() => '');
        this.run = mk('tcRun', 'tcb c-green hide', '<i>🏃</i>SPRINT');                    // (segura a tecla do sprint: cada toque é um impulso)
        this._bindButton(this.run, 'shift', true);
        this.kit = mk('tcKit', 'tcchip hide', '✚ KIT');
        this._bindButton(this.kit, 'm', false);
        // atalhos do topo (abaixo do HUD): ⋯ (o resto), carreiras e pausa/mapa
        const top = this.topBar = mk('tcTop', '');
        const tb = (label, id) => { const b = document.createElement('div'); b.className = 'tct'; b.textContent = label; if (id) b.id = id; top.appendChild(b); return b; };
        this.moreBtn = tb('⋯', 'tcMore');
        this.moreBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this._showMore(!this.morePanel.classList.contains('on')); });
        this._bindButton(tb('CRIME'), 'o', false);
        this._bindButton(tb('II'), 'p', false);
        this.morePanel = document.createElement('div'); this.morePanel.id = 'tcMorePanel'; top.appendChild(this.morePanel);
        this.more = TouchControls.MORE.map(([label, key, mode, hold]) => {
            const b = document.createElement('div'); b.className = 'tcchip'; b.textContent = label; b.dataset.mode = mode;
            this.morePanel.appendChild(b); this._bindButton(b, key, !!hold);
            if (!hold) b.addEventListener('pointerup', () => this._showMore(false));
            return b;
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

    _showMore(on) { this.morePanel.classList.toggle('on', on); this.moreBtn.classList.toggle('open', on); }

    // Botão de contexto: no toque lê o que o slot faz AGORA e segura/solta a MESMA ação até o fim do toque (trocar de contexto com o
    // dedo no botão não deixa tecla presa). Tipos: hold (segura a tecla), tap (toque único), weapon (abre a roda de armas — o dedo
    // arrastado escolhe a fatia; sem a roda, toque = próxima arma).
    _bindSlot(el, i) {
        let held = null;
        el.addEventListener('pointerdown', (e) => {
            e.preventDefault(); AudioFX.init();
            const s = this.slots[i]; if (!s || held) return;
            try { el.setPointerCapture(e.pointerId); } catch (x) { /* ok */ }
            held = s; el.classList.add('down');
            if (navigator.vibrate) try { navigator.vibrate(8); } catch (x) { /* ok */ }
            if (s.type === 'weapon') { if (!(this.g.wheel && this.g.wheel.touchStart(e.clientX, e.clientY))) held.noWheel = true; }
            else if (s.type === 'aim') this._aimStart(el, e);
            else if (s.type === 'tap') this._tap(s.key);
            else this.input.setVirtual(s.key, true, 'touch');
        });
        el.addEventListener('pointermove', (e) => {
            if (held && held.type === 'weapon' && this.g.wheel) this.g.wheel.touchMove(e.clientX, e.clientY);
            else if (held && held.type === 'aim') this._aimMove(e);
        });
        const up = (e) => {
            e.preventDefault(); if (!held) return;
            const s = held; held = null; el.classList.remove('down');
            if (s.type === 'weapon') {
                if (s.noWheel) { s.noWheel = false; if (this.input.onWeaponCycle) this.input.onWeaponCycle(1); }      // (sem roda agora: a próxima arma)
                else if (this.g.wheel) this.g.wheel.touchEnd(e.clientX, e.clientY);
            }
            else if (s.type === 'hold') this.input.setVirtual(s.key, false, 'touch');
            else if (s.type === 'aim') this._aimEnd(el);
        };
        el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    }

    // Fire button as the AIM STICK (gun in hand): the finger on it and dragged places the reticle around the player — direction and
    // distance (Aim: input.touchAim) — and the gun fires by itself while the reticle is over a target. The knob follows the finger.
    _aimStart(el, e) {
        const r = el.getBoundingClientRect();
        this._aim = { el, cx: r.left + r.width / 2, cy: r.top + r.height / 2, R: r.width * 0.85 };
        this.input.touchAim = { x: 0, y: 0 };
        this._aimMove(e);
    }
    _aimMove(e) {
        const A = this._aim; if (!A) return;
        let dx = (e.clientX - A.cx) / A.R, dy = (e.clientY - A.cy) / A.R;
        const m = Math.hypot(dx, dy);
        if (m > 1) { dx /= m; dy /= m; }
        this.input.touchAim = { x: dx, y: dy };
        A.el.style.setProperty('--ax', dx * A.R * 0.45 + 'px'); A.el.style.setProperty('--ay', dy * A.R * 0.45 + 'px');
    }
    _aimEnd(el) {
        this._aim = null;
        this.input.touchAim = null;
        el.style.setProperty('--ax', '0px'); el.style.setProperty('--ay', '0px');
    }

    // Dois dedos no jogo: PINÇA = zoom (substitui os botões + e −) e TORCER = gira a câmera 360° (como num mapa; InputManager.touchTwist
    // → takeLook → Game._look), só depois de TWIST_START rad de torção — a pinça sozinha não gira. Um dedo não gira mais: o polegar
    // escorregando de um botão (atacar, correr…) virava o mundo e o joystick passava a levar para outro lado.
    static get TWIST_START() { return 12 * Math.PI / 180; }
    _bindPinch() {
        const cv = this.g.gameEngine && this.g.gameEngine.canvas; if (!cv) return;
        const pts = new Map(); let d0 = 0, a0 = 0, tw = 0, turning = false;
        const two = () => [...pts.values()];
        const dist = () => { const [a, b] = two(); return hypot(a.x - b.x, a.y - b.y); };
        const ang = () => { const [a, b] = two(); return Math.atan2(b.y - a.y, b.x - a.x); };
        const held = () => { this.input.touchLookDown = pts.size === 2 && turning; };
        cv.addEventListener('pointerdown', (e) => {
            if (e.pointerType !== 'touch') return;
            pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pts.size === 2) { d0 = dist(); a0 = ang(); tw = 0; turning = false; }
            held();
        });
        cv.addEventListener('pointermove', (e) => {
            const P = pts.get(e.pointerId); if (!P) return;
            P.x = e.clientX; P.y = e.clientY;
            if (pts.size !== 2 || !this.g.camera) return;
            const d = dist(); this.g.camera.zoom(-(d - d0) * 0.04); d0 = d;
            let da = ang() - a0; da = Math.atan2(Math.sin(da), Math.cos(da)); a0 += da;
            if (!turning) { tw += da; if (Math.abs(tw) < TouchControls.TWIST_START) return; turning = true; da = tw - Math.sign(tw) * TouchControls.TWIST_START; held(); }
            this.input.touchTwist(-da);                                     // (torcer no sentido do relógio gira o mundo no sentido do relógio)
        });
        const end = (e) => { pts.delete(e.pointerId); if (pts.size < 2) turning = false; held(); };
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
        const out = [], seen = new Set(), re = /<b>([EFGCVK])<\/b>\s*([^<]*)/g;
        let m;
        while ((m = re.exec(html || '')) && out.length < 2) {
            const key = m[1].toLowerCase();
            if (seen.has(key)) continue;
            let t = m[2].replace(/\(segure\)\s*/i, '').replace(/[—·(:].*$/, '').trim().split(/\s+/).filter((w) => !/^(o|a|os|as|e|de|do|da|na|no|para|este|esta|um|uma)$/i.test(w)).slice(0, 2).join(' ');
            if (t.length > 12) t = t.split(' ')[0];                          // botão pequeno: duas palavras só se couberem
            if (!t) t = { e: 'AGIR', f: 'ENTRAR', g: 'ARROMBAR', c: 'FURTAR', v: 'PULAR', k: 'MÁSCARA' }[key];
            seen.add(key); out.push({ key, label: t.toUpperCase() });
        }
        return out;
    }

    // ------------------------------------------------------------------ joystick flutuante
    // Nasce onde o dedo encosta (metade esquerda). A pé: analógico 2D (pouco inclinado anda, inclinado trota). Dirigindo: volante horizontal.
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
        };
        const end = (e) => {
            if (e.pointerId !== S.id) return;
            S.id = null;
            this.input.analog.x = 0; this.input.analog.z = 0;
            this._parkStick();
        };
        z.addEventListener('pointerdown', (e) => {
            e.preventDefault(); AudioFX.init(); NativeMobile.enter();
            this._showMore(false);
            if (S.id !== null) return;
            S.id = e.pointerId; S.ox = e.clientX; S.oy = e.clientY;
            try { z.setPointerCapture(e.pointerId); } catch (x) { /* ok */ }
            this._placeStick(S.ox, S.oy); this.stickEl.classList.add('on');
            this.knob.style.transform = '';
        });
        z.addEventListener('pointermove', move); z.addEventListener('pointerup', end); z.addEventListener('pointercancel', end); z.addEventListener('lostpointercapture', end);
    }
    _placeStick(x, y) { this.stickEl.style.left = x + 'px'; this.stickEl.style.top = y + 'px'; }
    // Sem dedo: volta apagadinho para o canto (só para mostrar onde fica). Com o volante por giroscópio, fica ao lado do RÉ/FREIO
    // (que ocupa o canto) e a bolinha mostra quanto o celular está inclinado.
    _parkStick() {
        const u = this._u || 60, t = this._tilt;
        this._placeStick(u * (t ? 3.4 : 1.5), window.innerHeight - u * (t ? 1.25 : 1.5));
        this.stickEl.classList.remove('on');
        this.knob.style.transform = '';
        this._knobV = null;
    }

    _layout() {
        const mobile = this.input.touchDevice || window.innerWidth < 900;
        document.body.classList.toggle('mobile', mobile);
        this._u = Math.max(44, Math.min(76, Math.min(window.innerWidth, window.innerHeight) * 0.11));
        this._placeTop();
        if (this.stick.id === null) this._parkStick();
    }

    // Os atalhos do topo ficam logo abaixo do HUD e acompanham a altura dele (procurado, colete, fôlego aparecem e somem).
    _placeTop() {
        const hud = document.getElementById('hud2'), r = hud && hud.getBoundingClientRect();
        const y = Math.round(r && r.height ? r.bottom + 6 : 8);
        if (y !== this._topY) { this._topY = y; this.topBar.style.top = y + 'px'; }
    }

    _refresh() {
        const on = this.wanted;
        this.shown = on;
        this.root.classList.toggle('on', on);
        if (!on) { this.input.releaseVirtual('touch'); this.input.analog.x = this.input.analog.z = 0; this.input.touchAim = null; }
        if (this.g._flash && this._announced !== this.input.padConnected && this.input.padConnected !== undefined && this._ready) {
            this._announced = this.input.padConnected;
            this.g._flash(this.input.padConnected ? '🎮 Controle conectado' : (this.input.touchDevice ? 'Controle desconectado — controles na tela ativados' : 'Controle desconectado'));
        }
        this._ready = true;
    }

    // ------------------------------------------------------------------ o que cada botão faz agora
    // slot: { type: 'hold'|'tap'|'weapon', key, label, icon, color, sub? } ou null (botão escondido), na ordem dos botões:
    // [A principal, B esquerda, C em cima, D diagonal, E pequeno, F 2ª ação]
    _slotsFor(mode) {
        const g = this.g, H = (key, label, icon, color) => ({ type: 'hold', key, label, icon, color }), T = (key, label, icon, color) => ({ type: 'tap', key, label, icon, color });
        const ICON = { e: '✋', f: '🚪', g: '🔓', c: '🫳', v: '🧗', k: '🥷' };
        const all = mode === 'heli' ? [] : TouchControls.parseActions(g._promptHtml);
        const acts = all.filter((a) => a.key !== 'v' && !(mode !== 'foot' && a.key === 'f'));      // (V pular grade já tem botão: ROLAR vira PULAR)
        const ctx = (a, color) => (a.key === 'e' ? H : T)(a.key, a.label, a.label === 'GRITAR' ? '📢' : ICON[a.key] || '✋', color);      // E (abastecer, desmanchar…) às vezes é "segure"
        if (mode === 'car') return [
            H('w', 'ACELERAR', '⏩', 'c-green'),
            H('s', 'RÉ / FREIO', '⏪', 'c-red'),
            acts[0] ? ctx(acts[0], 'c-blue') : null,
            T('f', 'SAIR', '🚪', 'c-dark'),
            H('h', 'BUZINA', '📯', 'c-dark'),
            null,
        ];
        if (mode === 'heli') return [
            H(' ', 'SUBIR', '⬆️', 'c-green'),
            H('shift', 'DESCER', '⬇️', 'c-amber'),
            H('e', 'GIRAR', '↻', 'c-dark'),
            T('f', 'SAIR', '🚪', 'c-dark'),
            null, null,
        ];
        const p = g.player, inv = g.inventory, w = p.weapon === 'none' ? 'fists' : p.weapon, gun = inv.isGun(w);
        const wName = (Weapons[w] ? Weapons[w].name : 'Punhos').toUpperCase();
        const vault = all.some((a) => a.key === 'v');
        return [
            gun ? { type: 'aim', key: ' ', label: 'MIRA', icon: '🎯', color: 'c-red' }                                   // (arma de fogo: o botão vira o analógico da mira — Aim)
                : H(' ', 'ATACAR', w === 'fists' ? '👊' : Emoji.char(w) || '👊', 'c-red'),                                 // (o chute é o 3º golpe do combo)
            T('v', vault ? 'PULAR' : 'ROLAR', vault ? '🧗' : '🤸', vault ? 'c-violet' : 'c-amber'),                       // (longe de grade/muro, V rola: Game._tryVault)
            acts[0] ? ctx(acts[0], 'c-blue') : T('i', 'BOLSA', '🎒', 'c-dark'),
            { type: 'weapon', key: 'r', label: wName.length > 9 ? wName.split(' ')[0] : wName, icon: '🔄', color: 'c-dark',
                sub: gun || inv.isThrow(w) ? inv.ammoText(w) + (g.reloading > 0 ? ' ↻' : '') : '' },                       // (no celular o HUD não mostra a arma)
            T('q', p.crouched ? 'LEVANTAR' : 'AGACHAR', '🧎', p.crouched ? 'c-blue' : 'c-dark'),
            acts[1] ? ctx(acts[1], 'c-violet') : null,
        ];
    }

    // Todo frame (Game): monta os botões conforme o modo e a dica, o chip do kit, o SPRINT e o volante por giroscópio.
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
            if (this.stick.id === null) this.input.analog.x = 0;                                                 // (o giroscópio estava virando o carro)
            for (const k of ['shift', 'w', 's', ' ', 'h', 'e']) this.input.setVirtual(k, false, 'touch');      // nada preso de um modo para o outro
            this.input.touchAim = null;
        }
        const slots = this._slotsFor(mode);
        for (let i = 0; i < slots.length; i++) {
            const s = slots[i], sig = s ? s.type + s.key + s.label + (s.sub || '') + s.icon : '';
            this.slots[i] = s;
            if (sig === this._sig[i]) continue;
            const changed = !this._sig[i] || this._sig[i].slice(0, 8) !== sig.slice(0, 8);
            this._sig[i] = sig;
            const b = this.btns[i];
            if (!s) { b.className = 'tcb hide'; continue; }
            b.className = 'tcb ' + s.color + (b.classList.contains('down') ? ' down' : '');
            b.innerHTML = `<i>${s.icon}</i>${s.label}${s.sub ? `<small>${s.sub}</small>` : ''}`;
            if (changed) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
        }
        // SPRINT: a pé (e nadando) e pedalando a bicicleta — não dentro de loja/casa, onde só se anda (Game._walkIndoors); o anel acende
        // com o impulso (tocar repetido = mais forte)
        const bike = mode === 'car' && g.activeCar.spec && g.activeCar.spec.bike === 'bike';
        const inside = Interiors.active || (typeof HouseView !== 'undefined' && HouseView.inside);
        const runOn = (mode === 'foot' && !(inside && g._walkIndoors())) || bike;
        if (runOn !== this._runOn) {
            this._runOn = runOn;
            this.run.classList.toggle('hide', !runOn);
            if (!runOn) { this.input.setVirtual('shift', false, 'touch'); this.run.classList.remove('down'); }
        }
        if (runOn) {
            const icon = bike ? '🚴' : g.player.swimming ? '🏊' : '🏃';
            if (icon !== this._runIcon) { this._runIcon = icon; this.run.innerHTML = `<i>${icon}</i>SPRINT`; }
            const k = Math.round(this.input.sprint * 10) / 10;
            if (k !== this._runK) { this._runK = k; this.run.classList.toggle('drive', k > 0); this.run.style.setProperty('--k', k); }
        }
        // volante por giroscópio: dirigindo e sem dedo no joystick, a inclinação do celular é o volante
        const tilt = mode === 'car' && TiltSteer.active;
        if (tilt !== this._tilt) {
            this._tilt = tilt;
            this.root.classList.toggle('tilt', tilt); this.stickEl.classList.toggle('tilt', tilt);
            if (this.stick.id === null) { this.input.analog.x = 0; this._parkStick(); }
        }
        if (tilt && this.stick.id === null) {
            const v = TiltSteer.value;
            this.input.analog.x = v;
            if (this._knobV === null || Math.abs(v - this._knobV) > 0.01) { this._knobV = v; this.knob.style.transform = `translate(${v * this.stickEl.offsetWidth * 0.36}px, 0)`; }
        }
        if (!this._ro && window.ResizeObserver && document.getElementById('hud2')) {                            // (o HUD nasce depois destes controles)
            this._ro = new ResizeObserver(() => this._placeTop()); this._ro.observe(document.getElementById('hud2'));
        }
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

// ============================================================================
// TiltSteer — VOLANTE POR GIROSCÓPIO (opcional: Ajustes › "Volante por giroscópio", só aparece em tela de toque; desligado de fábrica).
//   • Lê o sensor de orientação (deviceorientation: beta/gamma), tira dele a direção da gravidade no aparelho e a projeta no eixo
//     horizontal da TELA (conforme a tela está girada: paisagem para um lado ou para o outro). Assim tanto girar o celular como um
//     volante quanto inclinar de lado com ele mais deitado viram o carro. sen(inclinação) → value -1..1, com zona morta e suavização.
//   • Quem usa é o TouchControls.update (dirigindo, sem dedo no joystick).
//   • iPhone (iOS 13+) pede permissão para o sensor, e só dentro de um toque: ligar a opção (um toque) já pede; com a opção ligada
//     num jogo recém-aberto, pede no 1º toque na tela (no iOS a permissão vale até fechar a página). Negou, ou o aparelho não manda
//     leitura nenhuma (sem sensor; página sem HTTPS): a opção desliga sozinha e avisa (onFail, ligado pelo PauseMenu).
// ============================================================================
const TiltSteer = {
    MAX: 26,                  // graus de inclinação para virar tudo
    DEAD: 2.5,                // zona morta (graus): o carro não fica puxando com o celular quase reto
    on: false,                // opção ligada
    ok: false,                // o sensor já mandou leitura
    value: 0,                 // volante: -1 esquerda .. 1 direita
    notify: null,             // (msg) → aviso na tela (TouchControls)
    onFail: null,             // (msg) → a opção não pôde ser ligada (PauseMenu desliga e salva)
    _listening: false, _needGesture: false, _check: 0,
    get active() { return this.on && this.ok; },
    get supported() { return typeof DeviceOrientationEvent !== 'undefined'; },
    setEnabled(on) {
        if (on === this.on) return;
        this.on = on; this.value = 0;
        clearTimeout(this._check);
        if (!on) return;
        if (!this.supported) { this._fail('Este aparelho não tem giroscópio'); return; }
        this._ask();
    },
    // Permissão (iOS) e escuta do sensor.
    _ask() {
        const D = DeviceOrientationEvent;
        if (typeof D.requestPermission !== 'function') { this._listen(); return; }
        this._needGesture = false;                                                     // (um pedido por vez: a janela do iOS pode demorar)
        let p;
        try { p = D.requestPermission(); } catch (e) { this._needGesture = true; return; }
        Promise.resolve(p).then((r) => { if (r === 'granted') this._listen(); else this._fail('Giroscópio bloqueado: permita o acesso a "Movimento e orientação" nas configurações do navegador'); })
            .catch(() => { this._needGesture = true; });                                // (fora de um toque: tenta de novo no próximo)
    },
    _listen() {
        this._needGesture = false;
        if (!this._listening) { this._listening = true; window.addEventListener('deviceorientation', (e) => this._read(e)); }
        clearTimeout(this._check);
        this._check = setTimeout(() => { if (this.on && !this.ok) this._fail('Sem leitura do giroscópio neste aparelho'); }, 2500);
    },
    _fail(msg) {
        this.on = false; this.value = 0;
        if (this.onFail) this.onFail(msg); else if (this.notify) this.notify(msg);
    },
    _read(e) {
        if (e.beta == null || e.gamma == null) return;                                 // (computador: um evento vazio)
        this.ok = true;
        if (!this.on) return;
        const R = Math.PI / 180, b = e.beta * R, gm = e.gamma * R;
        const ux = -Math.sin(gm) * Math.cos(b), uy = Math.sin(b);                       // "para cima" no aparelho (x direita, y topo do celular em pé)
        const o = screen.orientation, ang = (o && typeof o.angle === 'number' ? o.angle : +window.orientation || 0) * R;
        const sx = ux * Math.cos(ang) - uy * Math.sin(ang);                             // ... no eixo horizontal da TELA girada
        const deg = Math.asin(Math.max(-1, Math.min(1, -sx))) / R;                      // > 0: lado direito da tela para baixo = virar à direita
        const t = Math.sign(deg) * Math.min(1, Math.max(0, (Math.abs(deg) - this.DEAD) / (this.MAX - this.DEAD)));
        this.value += (t - this.value) * 0.4;                                          // (suaviza o tremido da mão)
        if (Math.abs(this.value) < 0.005) this.value = 0;
    },
};
// iOS: a permissão do sensor só pode ser pedida dentro de um toque.
window.addEventListener('touchend', () => { if (TiltSteer.on && TiltSteer._needGesture) TiltSteer._ask(); }, { capture: true, passive: true });

memoStatics(TouchControls, 'MORE');
