// ============================================================================
// TouchControls — controles NA TELA para celular/tablet, só quando é tela de toque E não há controle (Xbox) conectado.
// Poucos botões, e só os que fazem sentido AGORA:
//   joystick (esquerda)  anda/dirige; empurrar até a borda = correr (a pé)
//   ATACAR (direita)     golpe/tiro (segurar = rajada); no carro vira SAIR; no helicóptero, SUBIR/DESCER/SAIR
//   CONTEXTO (até 2)     aparecem sozinhos com o que dá para fazer ali: ENTRAR, ROUBAR, ARROMBAR, FURTAR, ASSALTAR, PULAR,
//                        VASCULHAR, DESMANCHAR, ABASTECER… — lidos da própria dica de interação do jogo (Game._promptHtml)
//   ARMA (chip)          toque = próxima arma; segurar = recarregar · ✚ KIT aparece só com vida baixa e kit na mochila
//   ⋯                    o resto (chute, mochila, buzina, farol, zoom…) · topo: pausa/mapa e CARREIRAS · pinça = zoom
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

    // Botões fixos do menu "⋯" (ações raras): [rótulo, tecla, modo ('foot'|'car'|'heli'|'all'), segurar?]
    static get MORE() {
        return [
            ['CHUTE', 'k', 'foot'], ['RECARREGAR', 'r', 'foot'], ['KIT MÉDICO', 'm', 'foot'], ['MOCHILA', 'i', 'all'],
            ['BUZINA', 'h', 'car', true], ['FAROL', 'l', 'car'], ['GIRAR ↺', 'q', 'heli', true], ['GIRAR ↻', 'e', 'heli', true],
            ['ZOOM +', 'z', 'all', true], ['ZOOM −', 'x', 'all', true],
        ];
    }

    _build() {
        const css = document.createElement('style');
        css.textContent = `
            body { overscroll-behavior: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
            #touchUI { position: fixed; inset: 0; z-index: 20; pointer-events: none; display: none; --u: clamp(44px, 11vmin, 76px);
                font-family: var(--font); }
            #touchUI.on { display: block; }
            #touchUI * { touch-action: none; -webkit-user-select: none; user-select: none; }
            #tcStick { position: absolute; left: calc(var(--u) * 0.35); bottom: calc(var(--u) * 0.35); width: calc(var(--u) * 2.5); height: calc(var(--u) * 2.5); pointer-events: auto;
                border-radius: 50%; background: radial-gradient(circle, rgba(14,17,26,0.25) 0 58%, rgba(255,255,255,0.10) 59% 100%); border: 1.5px solid rgba(255,255,255,0.22); }
            #tcKnob { position: absolute; left: 50%; top: 50%; width: calc(var(--u) * 1.1); height: calc(var(--u) * 1.1); margin: calc(var(--u) * -0.55) 0 0 calc(var(--u) * -0.55);
                border-radius: 50%; background: radial-gradient(circle at 35% 30%, rgba(255,255,255,0.85), rgba(210,218,235,0.55)); box-shadow: 0 6px 18px rgba(0,0,0,0.4); pointer-events: none; }
            .tcb { position: absolute; pointer-events: auto; display: flex; align-items: center; justify-content: center; text-align: center; font-weight: 700;
                width: calc(var(--u) * 1.15); height: calc(var(--u) * 1.15); font-size: calc(var(--u) * 0.19); font-weight: 700; color: #fff; line-height: 1.05;
                background: rgba(14,17,26,0.55); border: 1.5px solid rgba(255,255,255,0.22); border-radius: 50%; box-shadow: 0 6px 16px rgba(0,0,0,0.35); }
            .tcb.down { background: rgba(52,211,153,0.75); transform: scale(0.94); }
            #touchUI .hide { display: none !important; }
            #tcMain { width: calc(var(--u) * 1.75); height: calc(var(--u) * 1.75); right: calc(var(--u) * 0.35); bottom: calc(var(--u) * 0.4); background: linear-gradient(180deg, rgba(251,113,133,0.8), rgba(225,29,72,0.8)); font-size: calc(var(--u) * 0.24); }
            #tcMain.car { background: linear-gradient(180deg, rgba(96,165,250,0.8), rgba(37,99,235,0.8)); }
            #tcCtx0 { right: calc(var(--u) * 2.25); bottom: calc(var(--u) * 0.35); background: rgba(37,99,235,0.6); }
            #tcCtx1 { right: calc(var(--u) * 0.6); bottom: calc(var(--u) * 2.3); background: rgba(139,92,246,0.6); }
            .tcb.ctx { animation: tcPop 0.18s ease-out; }
            @keyframes tcPop { from { transform: scale(0.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
            .tcchip { position: absolute; pointer-events: auto; display: flex; align-items: center; gap: 6px; padding: 0 12px; height: calc(var(--u) * 0.62); border-radius: 12px;
                font-size: calc(var(--u) * 0.2); font-weight: 700; color: #fff; background: rgba(14,17,26,0.6); border: 1.5px solid rgba(255,255,255,0.2); white-space: nowrap; }
            .tcchip.down { background: rgba(52,211,153,0.75); }
            #tcWeapon { right: calc(var(--u) * 2.35); bottom: calc(var(--u) * 1.75); }
            #tcWeapon small { color: var(--gold); font-size: calc(var(--u) * 0.17); }
            #tcKit { right: calc(var(--u) * 2.35); bottom: calc(var(--u) * 2.5); color: #fda4af; }
            #tcMore { right: calc(var(--u) * 0.35); bottom: calc(var(--u) * 3.55); width: calc(var(--u) * 0.8); justify-content: center; font-size: calc(var(--u) * 0.32); padding: 0; }
            #tcMorePanel { position: absolute; right: calc(var(--u) * 1.3); bottom: calc(var(--u) * 2.9); pointer-events: auto; display: none; flex-wrap: wrap; gap: 6px; width: calc(var(--u) * 4.4);
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
        root.innerHTML = '<div id="tcStick"><div id="tcKnob"></div></div>';
        document.body.appendChild(root);
        this.stickEl = root.querySelector('#tcStick'); this.knob = root.querySelector('#tcKnob');
        this._bindStick();

        // botão principal, 2 de contexto, chip da arma, chip do kit, "⋯" e o painel do "⋯"
        const mk = (id, cls, html = '') => { const d = document.createElement('div'); d.id = id; d.className = cls; d.innerHTML = html; root.appendChild(d); return d; };
        this.main = mk('tcMain', 'tcb', 'ATACAR');
        this._bindDynamic(this.main, () => this._mainKey);
        this.ctx = [mk('tcCtx0', 'tcb hide'), mk('tcCtx1', 'tcb hide')];
        this.ctx.forEach((b, i) => this._bindDynamic(b, () => this._ctxKeys[i]));
        this._ctxKeys = [null, null]; this._ctxSig = '';
        this.weapon = mk('tcWeapon', 'tcchip', 'PUNHOS');
        this._bindWeapon(this.weapon);
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

    // Botão cuja tecla muda com o contexto (lida na hora do toque e solta a MESMA tecla no fim — segurar E abastece, segurar ESPAÇO é rajada).
    _bindDynamic(el, keyFn) {
        let held = null;
        el.addEventListener('pointerdown', (e) => {
            e.preventDefault(); AudioFX.init();
            const k = keyFn(); if (!k) return;
            try { el.setPointerCapture(e.pointerId); } catch (x) { /* ok */ }
            held = k; el.classList.add('down'); this.input.setVirtual(k, true, 'touch');
        });
        const up = (e) => { e.preventDefault(); if (!held) return; el.classList.remove('down'); this.input.setVirtual(held, false, 'touch'); held = null; };
        el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    }

    // Chip da arma: toque = próxima arma; segurar meio segundo = recarregar.
    _bindWeapon(el) {
        let t0 = 0, timer = null;
        el.addEventListener('pointerdown', (e) => {
            e.preventDefault(); AudioFX.init(); el.classList.add('down'); t0 = performance.now();
            timer = setTimeout(() => { timer = null; this._tap('r'); }, 450);
        });
        const up = (e) => { e.preventDefault(); if (!el.classList.contains('down')) return; el.classList.remove('down'); if (timer) { clearTimeout(timer); timer = null; if (this.input.onWeaponCycle) this.input.onWeaponCycle(1); } };
        el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    }

    // Pinça com dois dedos no jogo = zoom (substitui os botões + e −).
    _bindPinch() {
        const cv = this.g.gameEngine && this.g.gameEngine.canvas; if (!cv) return;
        const pts = new Map(); let d0 = 0;
        const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
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
            this.input.setVirtual('shift', this.g.mode === 'player' && k > 0.92 && !this.input.padConnected, 'touch');            // empurrar até a borda = correr (só a pé)
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
        const hudW = (document.getElementById('hud2') ? document.getElementById('hud2').offsetWidth : 330) * 0.56 + 14;      // HUD escalado a 56% no celular
        this.top.forEach((b, i) => { b.style.right = `${hudW + i * (u * 0.8)}px`; b.style.width = i ? `${u * 0.95}px` : ''; });
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

    // Todo frame (Game): principal conforme o modo, botões de contexto conforme a dica, chip da arma e do kit.
    update() {
        this.back.classList.toggle('on', this.shown && this.g.menu.isOpen);
        this.root.style.display = this.shown && !this.g.menu.isOpen ? 'block' : 'none';
        if (!this.shown || this.g.menu.isOpen) return;
        const g = this.g, mode = g.mode === 'heli' ? 'heli' : (g.mode === 'car' && g.activeCar ? 'car' : 'foot');
        if (mode !== this._mode) {
            this._mode = mode;
            document.body.classList.toggle('tc-car', mode === 'car');
            for (const b of this.more) { const m = b.dataset.mode; b.style.display = m === 'all' || m === mode ? '' : 'none'; }
            this.main.textContent = mode === 'foot' ? 'ATACAR' : 'SAIR';
            this.main.classList.toggle('car', mode !== 'foot');
            this.weapon.style.display = mode === 'foot' ? '' : 'none';
            this._ctxSig = '';
        }
        this._mainKey = mode === 'foot' ? ' ' : 'f';
        // contexto
        let acts;
        if (mode === 'heli') acts = [{ key: ' ', label: 'SUBIR' }, { key: 'shift', label: 'DESCER' }];
        else acts = TouchControls.parseActions(g._promptHtml).filter((a) => !(mode === 'car' && a.key === 'f'));
        const sig = acts.map((a) => a.key + a.label).join('|');
        if (sig !== this._ctxSig) {
            this._ctxSig = sig;
            this.ctx.forEach((b, i) => {
                const a = acts[i];
                this._ctxKeys[i] = a ? a.key : null;
                b.classList.toggle('hide', !a);
                if (a) { b.textContent = a.label; b.classList.remove('ctx'); void b.offsetWidth; b.classList.add('ctx'); }
            });
        }
        // arma e kit
        if (mode === 'foot') {
            const p = g.player, inv = g.inventory, w = p.weapon === 'none' ? 'fists' : p.weapon;
            const txt = (Weapons[w] ? Weapons[w].name : 'Punhos').toUpperCase() + (inv.isGun(w) ? ` <small>${inv.ammoText(w)}</small>` : '');
            if (txt !== this._wTxt) { this._wTxt = txt; this.weapon.innerHTML = '⟳ ' + txt; }
            const showKit = inv.medkits > 0 && p.hp < p.maxHp * 0.75;
            if (showKit !== this._kitOn) { this._kitOn = showKit; this.kit.classList.toggle('hide', !showKit); }
            if (showKit) { const t = `✚ KIT (${inv.medkits})`; if (t !== this._kitTxt) { this._kitTxt = t; this.kit.textContent = t; } }
        } else if (this._kitOn) { this._kitOn = false; this.kit.classList.add('hide'); }
    }
}
