// ============================================================================
// WeaponWheel — a RODA DE ARMAS (como a do GTA V). Abre segurando Tab (teclado), LB/L1 (controle) ou o botão ARMA (celular); um
// clique no quadro da arma do HUD também abre.
//   • 8 fatias por CATEGORIA: corpo a corpo, pistolas, submetralhadoras, fuzis, metralhadora, pesadas, arremessáveis e escopetas. Cada
//     uma mostra a arma escolhida dela e a munição total; categoria sem arma sua fica apagada. A da arma na mão tem o contorno dourado.
//   • Escolher: a direção do mouse a partir do centro (ou passar por cima), o analógico direito, ou o dedo (arrastar / tocar).
//     Soltar a tecla/botão equipa a destacada. Mais de uma arma na categoria: roda do mouse, ←/→ do direcional ou as setas ‹ › trocam.
//   • Centro: categoria, nome, munição (carregador | reserva) e barras de DANO, CADÊNCIA, PRECISÃO e ALCANCE (ou o jeito de usar).
//   • Aberta, o tempo corre a 30% (WHEEL_TIME) e o ataque não sai.
//   • Toque rápido sem abrir: Tab = volta à arma anterior; LB = próxima arma (como antes).
//   • Celular (toque): tocar o ARMA abre e a roda FICA aberta — tocar numa fatia equipa, tocar no centro recarrega, tocar fora fecha;
//     encostar no ARMA e arrastar o dedo até a fatia e soltar também equipa. Responsiva: ocupa até 94% do menor lado da tela.
// ============================================================================

class WeaponWheel {
    static get CATS() {
        return [
            { id: 'melee', name: 'Corpo a corpo', list: ['fists', 'knife', 'bat'] },
            { id: 'pistol', name: 'Pistolas', list: ['pistol', 'pistol_sil', 'revolver'] },
            { id: 'smg', name: 'Submetralhadoras', list: ['smg'] },
            { id: 'rifle', name: 'Fuzis', list: ['ak47', 'rifle'] },
            { id: 'mg', name: 'Metralhadora', list: ['minigun'] },
            { id: 'heavy', name: 'Pesadas', list: ['rpg', 'launcher'] },
            { id: 'throw', name: 'Arremessáveis', list: ['grenade', 'molotov'] },
            { id: 'shotgun', name: 'Escopetas', list: ['shotgun'] },
        ];
    }
    static get HOLD() { return 0.16; }        // s segurando Tab/LB até a roda abrir (antes disso é um toque rápido)
    static get WHEEL_TIME() { return 0.3; }   // velocidade do tempo com a roda aberta

    constructor(game) {
        this.g = game;
        this.open = false;
        this.src = null;              // quem abriu: 'key' | 'pad' | 'touch' | 'click'
        this.sticky = false;          // fica aberta até tocar numa fatia / fora (toque, clique no HUD)
        this.hi = -1;                 // fatia destacada
        this.pick = {};               // categoria → arma escolhida nela
        this._prev = 'none'; this._cur = 'none';
        this._hold = { key: 0, pad: 0 };
        this._build();
    }

    // ------------------------------------------------------------------ montagem
    _build() {
        const css = document.createElement('style');
        css.textContent = `
            #wwheel { position: fixed; inset: 0; z-index: 30; display: none; align-items: center; justify-content: center; flex-direction: column; gap: 10px;
                --ws: min(86vmin, 560px); font-family: var(--font); color: var(--tx); touch-action: none; -webkit-user-select: none; user-select: none;
                background: radial-gradient(circle at center, rgba(6,8,13,0.25) 0, rgba(6,8,13,0.62) 70%); }
            body.mobile #wwheel { --ws: min(94vmin, 520px); }
            #wwheel.on { display: flex; animation: wwIn .14s ease-out; }
            @keyframes wwIn { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: scale(1); } }
            .ww-box { position: relative; width: var(--ws); height: var(--ws); flex: none; }
            .ww-box svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 10px 28px rgba(0,0,0,0.5)); }
            .ww-sl { fill: rgba(14,17,26,0.72); stroke: rgba(255,255,255,0.14); stroke-width: 0.5; cursor: pointer; transition: fill .1s; }
            .ww-sl.off { fill: rgba(14,17,26,0.42); }
            .ww-sl.cur { stroke: var(--gold); stroke-width: 1.1; }
            .ww-sl.hi { fill: rgba(242,244,248,0.9); }
            .ww-sl.hi.off { fill: rgba(170,177,194,0.45); }
            .ww-ring { fill: none; stroke: rgba(255,255,255,0.1); stroke-width: 0.6; }
            .ww-slot { position: absolute; width: calc(var(--ws) * 0.24); height: calc(var(--ws) * 0.17); margin: calc(var(--ws) * -0.085) 0 0 calc(var(--ws) * -0.12);
                display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; pointer-events: none; }
            .ww-slot img { max-width: 100%; height: calc(var(--ws) * 0.09); object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.55)); }
            .ww-slot.off img { filter: grayscale(1) brightness(0.55); opacity: 0.35; }
            .ww-slot .ww-a { font: 700 calc(var(--ws) * 0.027) var(--font-d); font-variant-numeric: tabular-nums; color: var(--gold); text-shadow: 0 1px 3px rgba(0,0,0,0.8); }
            .ww-slot.hi .ww-a { color: #92400e; text-shadow: none; }
            .ww-slot .ww-n { font: 700 calc(var(--ws) * 0.022) var(--font); color: var(--tx-2); letter-spacing: 0.04em; }
            .ww-slot.hi .ww-n { color: #374151; }
            .ww-cyc { position: absolute; top: 50%; width: calc(var(--ws) * 0.07); height: calc(var(--ws) * 0.07); margin-top: calc(var(--ws) * -0.035); border-radius: 50%;
                display: none; align-items: center; justify-content: center; pointer-events: auto; cursor: pointer; font: 800 calc(var(--ws) * 0.04) var(--font-d);
                color: #fff; background: rgba(14,17,26,0.82); border: 1px solid rgba(255,255,255,0.3); }
            .ww-cyc.l { left: calc(var(--ws) * -0.03); } .ww-cyc.r { right: calc(var(--ws) * -0.03); }
            .ww-slot.many.hi .ww-cyc { display: flex; }
            .ww-center { position: absolute; left: 50%; top: 50%; width: calc(var(--ws) * 0.4); height: calc(var(--ws) * 0.4); margin: calc(var(--ws) * -0.2) 0 0 calc(var(--ws) * -0.2);
                border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: calc(var(--ws) * 0.006); text-align: center;
                background: radial-gradient(circle, rgba(22,26,38,0.95), rgba(10,12,18,0.92)); border: 1px solid rgba(255,255,255,0.14); pointer-events: auto; }
            .ww-cat { font: 700 calc(var(--ws) * 0.02) var(--font); letter-spacing: 0.14em; text-transform: uppercase; color: var(--tx-3); }
            .ww-name { font: 800 calc(var(--ws) * 0.036) var(--font-d); max-width: 88%; line-height: 1.1; }
            .ww-am { font: 700 calc(var(--ws) * 0.032) var(--font-d); font-variant-numeric: tabular-nums; color: var(--gold); }
            .ww-am:empty { display: none; }
            .ww-st { width: 74%; display: grid; grid-template-columns: auto 1fr; gap: calc(var(--ws) * 0.006) calc(var(--ws) * 0.012); align-items: center; margin-top: calc(var(--ws) * 0.006); }
            .ww-st b { font: 700 calc(var(--ws) * 0.016) var(--font); letter-spacing: 0.08em; color: var(--tx-2); text-align: left; }
            .ww-st i { display: block; height: calc(var(--ws) * 0.011); border-radius: 99px; background: rgba(255,255,255,0.1); overflow: hidden; }
            .ww-st i s { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #f2f4f8, #fbbf24); }
            .ww-tip { font: 500 calc(var(--ws) * 0.019) var(--font); color: var(--tx-2); max-width: 80%; line-height: 1.3; }
            .ww-tip:empty { display: none; }
            .ww-rel { display: none; margin-top: calc(var(--ws) * 0.008); padding: calc(var(--ws) * 0.01) calc(var(--ws) * 0.025); border-radius: 99px; font: 700 calc(var(--ws) * 0.022) var(--font);
                color: #04130c; background: linear-gradient(180deg, #3ee0a1, #10b981); border: none; pointer-events: auto; cursor: pointer; }
            #wwheel.touch .ww-rel.can { display: block; }
            .ww-hint { font: 600 13px var(--font); color: var(--tx-2); text-align: center; padding: 6px 14px; border-radius: 99px; background: rgba(14,17,26,0.7); max-width: 92vw; }
            body.mobile .ww-hint { font-size: 11px; }
            @media (max-height: 420px) { .ww-hint { display: none; } }
            body.ww-on #toast, body.ww-on #vehPop { opacity: 0 !important; }      /* (a mensagem do topo não aparece através das fatias) */`;
        document.head.appendChild(css);

        const root = this.root = document.createElement('div');
        root.id = 'wwheel';
        const box = this.box = document.createElement('div');
        box.className = 'ww-box';
        const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '-100 -100 200 200');
        this.R0 = 41; this.R1 = 98;                                         // raios (unidades do viewBox) do anel das fatias
        const C = WeaponWheel.CATS, n = C.length, gap = 1.4;
        this.sl = C.map((c, i) => {
            const p = document.createElementNS(NS, 'path');
            p.setAttribute('d', this._sector((i - 0.5) * 360 / n + gap / 2, (i + 0.5) * 360 / n - gap / 2, this.R0, this.R1));
            p.setAttribute('class', 'ww-sl'); p.dataset.i = i;
            svg.appendChild(p);
            return p;
        });
        const ring = document.createElementNS(NS, 'circle'); ring.setAttribute('r', '99.5'); ring.setAttribute('class', 'ww-ring'); svg.appendChild(ring);
        box.appendChild(svg);
        this.slots = C.map((c, i) => {
            const a = i * 2 * Math.PI / n, r = (this.R0 + this.R1) / 2 / 200;      // (fração do lado da caixa)
            const d = document.createElement('div');
            d.className = 'ww-slot';
            d.style.left = (50 + Math.sin(a) * r * 100) + '%'; d.style.top = (50 - Math.cos(a) * r * 100) + '%';
            d.innerHTML = '<img alt=""><span class="ww-a"></span><span class="ww-n"></span><span class="ww-cyc l">‹</span><span class="ww-cyc r">›</span>';
            for (const [cls, dir] of [['.l', -1], ['.r', 1]]) {
                const b = d.querySelector('.ww-cyc' + cls);
                b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.hi = i; this.cycle(dir); this._cycTap = performance.now(); });
            }
            box.appendChild(d);
            return d;
        });
        const ctr = this.ctr = document.createElement('div');
        ctr.className = 'ww-center';
        ctr.innerHTML = '<div class="ww-cat"></div><div class="ww-name"></div><div class="ww-am"></div><div class="ww-st"></div><div class="ww-tip"></div><button class="ww-rel">↻ RECARREGAR</button>';
        ctr.querySelector('.ww-rel').addEventListener('pointerdown', (e) => {
            e.preventDefault(); e.stopPropagation();
            this.close(false);
            this.g.input.setVirtual('r', true, 'touch'); setTimeout(() => this.g.input.setVirtual('r', false, 'touch'), 60);
        });
        box.appendChild(ctr);
        this.hint = document.createElement('div');
        this.hint.className = 'ww-hint';
        root.append(box, this.hint);
        document.body.appendChild(root);

        // Toque/clique na roda: no anel destaca a fatia; soltar no anel equipa; no centro fecha (o RECARREGAR é tratado acima); fora, fecha.
        root.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });          // (sem clique emulado: viraria tiro)
        root.addEventListener('pointerdown', (e) => {
            if (!this.open) return;
            e.preventDefault();
            this._down = { id: e.pointerId, i: this._at(e.clientX, e.clientY), t: performance.now() };
            if (this._down.i >= 0) this._setHi(this._down.i);
        });
        root.addEventListener('pointermove', (e) => {
            if (!this.open || (e.pointerType === 'mouse' && !this._down && this.src !== 'click' && this.src !== 'key')) return;
            if (e.pointerType !== 'mouse' && (!this._down || this._down.id !== e.pointerId)) return;
            const i = this._at(e.clientX, e.clientY);
            if (i >= 0) this._setHi(i);
        });
        root.addEventListener('pointerup', (e) => {
            if (!this.open || !this._down || this._down.id !== e.pointerId) return;
            const d = this._down; this._down = null;
            if (performance.now() - (this._cycTap || 0) < 300) return;                               // (era a seta ‹ ›)
            const i = this._at(e.clientX, e.clientY), r = this._rad(e.clientX, e.clientY);
            if (i >= 0) { this._setHi(i); this.commit(); return; }
            if (r > 1.02 || (r < this.R0 / this.R1 && d.i < 0)) this.close(false);                    // fora da roda / no centro: fecha sem trocar
        });
    }

    // Setor anular de a0 a a1 graus (0 = cima, sentido horário) entre os raios r0 e r1 (path SVG).
    _sector(a0, a1, r0, r1) {
        const P = (a, r) => { const t = a * Math.PI / 180; return `${(Math.sin(t) * r).toFixed(2)} ${(-Math.cos(t) * r).toFixed(2)}`; };
        const big = a1 - a0 > 180 ? 1 : 0;
        return `M ${P(a0, r1)} A ${r1} ${r1} 0 ${big} 1 ${P(a1, r1)} L ${P(a1, r0)} A ${r0} ${r0} 0 ${big} 0 ${P(a0, r0)} Z`;
    }
    // Distância do ponto (tela) ao centro da roda, em raios externos (1 = borda).
    _rad(x, y) {
        const b = this.box.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
        return Math.hypot(x - cx, y - cy) / (b.width / 2 * this.R1 / 100);
    }
    // Fatia sob o ponto da tela (no anel), ou −1.
    _at(x, y) {
        const r = this._rad(x, y);
        if (r < this.R0 / this.R1 * 0.92 || r > 1.08) return -1;
        return this._sliceOf(x, y);
    }
    _sliceOf(x, y) {
        const b = this.box.getBoundingClientRect(), a = Math.atan2(x - (b.left + b.width / 2), -(y - (b.top + b.height / 2)));
        const n = WeaponWheel.CATS.length;
        return ((Math.round(a / (2 * Math.PI / n)) % n) + n) % n;
    }
    _sliceOfAngle(a) { const n = WeaponWheel.CATS.length; return ((Math.round(a / (2 * Math.PI / n)) % n) + n) % n; }

    // ------------------------------------------------------------------ dados
    _owned(k) { const inv = this.g.inventory; return k === 'fists' || inv.owned(k); }
    _ownedIn(i) { return WeaponWheel.CATS[i].list.filter((k) => this._owned(k)); }
    static icon(key) {
        const C = WeaponWheel._ic || (WeaponWheel._ic = {});
        if (!C[key]) { try { C[key] = Emoji.canvas(key, 128).toDataURL(); } catch (e) { C[key] = ''; } }
        return C[key];
    }
    // Barras 0..1 (dano, cadência, precisão, alcance) de uma arma — ou null (arremessáveis: o texto de uso).
    static stats(k) {
        const W = Weapons[k];
        if (!W || W.throwable) return null;
        if (k === 'fists') return [0.12, 0.6, 1, 0.05];
        if (W.melee) return [Math.min(1, W.dmg / 45), Math.min(1, 1 / (W.cooldown || 0.5) / 3.2), 1, Math.min(1, (W.range || 2) / 3)];
        const dmg = W.rocket ? 1 : Math.min(1, W.dmg * (W.pellets || 1) / 85);
        return [dmg, Math.min(1, Math.sqrt(1 / W.cooldown / 20)), Math.max(0.05, 1 - W.spread / 0.2), Math.min(1, W.range / 70)];
    }
    _ammo(k) {
        const inv = this.g.inventory;
        if (k === 'fists' || !Weapons[k]) return '';
        if (inv.isThrow(k)) return '×' + inv.reserve(k);
        if (!inv.isGun(k)) return '';
        return String(inv.mag(k) + inv.reserve(k));
    }

    // ------------------------------------------------------------------ abrir / fechar
    canOpen() {
        const g = this.g, p = g.player;
        if (!g.aiReady || !p || !p.alive || g.menu.isOpen || g.arrest || g.death || g.hiding || g.lockpick.active || g.holdup || g.sleeping) return false;
        if (g.mode !== 'player' || p.rag || p.frozen || p._seq || Gym.active || Panel.anyOpen() || g._modalUiOpen()) return false;
        return !Throwables.busy();
    }
    show(src) {
        if (this.open || !this.canOpen()) return false;
        const g = this.g, p = g.player, C = WeaponWheel.CATS;
        this.open = true; this.src = src; this.sticky = src === 'touch' || src === 'click';
        this._openT = performance.now(); this._down = null;
        // escolhida de cada categoria: a da mão, senão a última escolhida (se ainda é sua), senão a primeira que você tem
        const cur = p.weapon === 'none' ? 'fists' : p.weapon;
        C.forEach((c, i) => {
            const own = this._ownedIn(i);
            if (c.list.includes(cur)) this.pick[i] = cur;
            else if (!own.includes(this.pick[i])) this.pick[i] = own[0] || null;
        });
        this.hi = C.findIndex((c) => c.list.includes(cur));
        this.root.classList.add('on');
        document.body.classList.add('ww-on');
        this.root.classList.toggle('touch', src === 'touch' || (g.input.touchDevice && !g.input.usingPad && src === 'click'));
        this.hint.textContent = src === 'pad' ? 'Analógico direito escolhe · ← → troca na categoria · solte LB para equipar'
            : src === 'key' ? 'Mova o mouse até a fatia · roda do mouse troca na categoria · solte Tab para equipar'
            : 'Toque numa fatia para equipar · ‹ › troca na categoria · toque fora para fechar';
        this._ts = g.timeScale || 1;
        g.timeScale = Math.min(this._ts, WeaponWheel.WHEEL_TIME);             // câmera lenta (como no GTA)
        g.input.wheelOpen = true;
        this._render();
        if (navigator.vibrate && src === 'touch') try { navigator.vibrate(10); } catch (e) { /* ok */ }
        AudioFX.blip(660, 0.05, 0.08);
        return true;
    }
    close(equip = true) {
        if (!this.open) return;
        if (equip) this.commit(true);
        this.open = false; this.sticky = false; this._down = null;
        this.root.classList.remove('on');
        document.body.classList.remove('ww-on');
        const g = this.g;
        if (g.timeScale === Math.min(this._ts || 1, WeaponWheel.WHEEL_TIME)) g.timeScale = this._ts || 1;
        g.input.wheelOpen = false;
        g.input.justPressed['mouse0'] = false; g.input.justPressed[' '] = false;     // (o clique que escolheu não vira tiro)
        g.input.wheelDelta = 0;
    }
    // Equipa a arma destacada (e fecha, a menos que `keep`).
    commit(keep = false) {
        const k = this.hi >= 0 ? this.pick[this.hi] : null;
        if (k && this._owned(k)) {
            const w = k === 'fists' ? 'none' : k;
            if (w !== this.g.player.weapon) { this.g.equipWeapon(w); AudioFX.blip(880, 0.05, 0.1); }
        }
        if (!keep) this.close(false);
    }
    // Troca a arma escolhida dentro da categoria destacada.
    cycle(dir) {
        if (!this.open || this.hi < 0) return;
        const own = this._ownedIn(this.hi);
        if (own.length < 2) return;
        const j = own.indexOf(this.pick[this.hi]);
        this.pick[this.hi] = own[((j < 0 ? 0 : j) + dir + own.length) % own.length];
        AudioFX.blip(740, 0.04, 0.07);
        this._render();
    }
    _setHi(i) { if (i === this.hi) return; this.hi = i; AudioFX.blip(520, 0.025, 0.05); this._render(); }

    // Toque no botão ARMA (TouchControls): encostou → abre; arrastou até uma fatia e soltou → equipa; toque rápido → fica aberta.
    touchStart(x, y) { if (this.open) { this.close(false); return false; } this._touch = { x, y, drag: false }; return this.show('touch'); }
    touchMove(x, y) {
        const T = this._touch; if (!T || !this.open) return;
        if (!T.drag && Math.hypot(x - T.x, y - T.y) > 22) T.drag = true;
        if (!T.drag) return;
        const r = this._rad(x, y);
        if (r > this.R0 / this.R1 * 0.8) this._setHi(this._sliceOf(x, y));
    }
    touchEnd(x, y) {
        const T = this._touch; this._touch = null;
        if (!T || !this.open) return;
        if (T.drag && this._rad(x, y) > this.R0 / this.R1 * 0.8) this.commit();       // soltou numa fatia: equipa
        // (toque sem arrastar, ou soltou no centro: a roda fica aberta até tocar numa fatia ou fora)
    }

    // ------------------------------------------------------------------ por quadro (Game._update, antes da pausa e das ações)
    update() {
        const g = this.g, inp = g.input, now = performance.now(), dt = Math.min(0.1, (now - (this._t || now)) / 1000);
        this._t = now;
        const p = g.player;
        if (p) { const w = p.weapon || 'none'; if (w !== this._cur) { this._prev = this._cur; this._cur = w; } }
        // Tab (teclado) e LB (controle): segurar abre; toque rápido = arma anterior (Tab) / próxima (LB)
        for (const [src, down] of [['key', !!inp.keys['tab']], ['pad', !!inp.keys['padwheel']]]) {
            const H = this._hold;
            if (down) {
                if (!H[src]) H[src] = now;
                if (!this.open && now - H[src] > WeaponWheel.HOLD * 1000 && H[src] > 0) { if (!this.show(src)) H[src] = -1; }
            } else if (H[src]) {
                const quick = H[src] > 0 && now - H[src] <= WeaponWheel.HOLD * 1000;
                H[src] = 0;
                if (this.open && this.src === src) this.close(true);
                else if (quick && !this.open && this.canOpen()) {
                    if (src === 'key') { if (this._prev !== p.weapon && this._owned(this._prev === 'none' ? 'fists' : this._prev)) g.equipWeapon(this._prev); }
                    else g._cycleWeapon(1);
                }
            }
        }
        if (!this.open) return;
        if (!this.canOpen()) { this.close(false); return; }
        if (inp.consumePress('escape') || inp.consumePress('padcancel')) { this.close(false); return; }
        // mouse: a direção do cursor a partir do centro (depois de mexer)
        if (!inp.usingPad && (this.src === 'key' || this.src === 'click') && inp.mouseMovedAt > this._openT && inp.mouseX >= 0) {
            if (this._rad(inp.mouseX, inp.mouseY) > this.R0 / this.R1 * 0.75) this._setHi(this._sliceOf(inp.mouseX, inp.mouseY));
        }
        // analógico direito (controle)
        const rs = inp.rstick, m = Math.hypot(rs.x, rs.y);
        if (m > 0.55) this._setHi(this._sliceOfAngle(Math.atan2(rs.x, -rs.y)));
        // roda do mouse: troca dentro da categoria
        if (inp.wheelDelta) { this.cycle(inp.wheelDelta > 0 ? 1 : -1); inp.wheelDelta = 0; }
        this._tick = (this._tick || 0) - dt;
        if (this._tick <= 0) { this._tick = 0.25; this._render(); }               // (munição recarregando, etc.)
    }

    // ------------------------------------------------------------------ desenho
    _render() {
        const g = this.g, p = g.player, C = WeaponWheel.CATS, cur = p.weapon === 'none' ? 'fists' : p.weapon;
        C.forEach((c, i) => {
            const own = this._ownedIn(i), k = this.pick[i] || c.list[0], has = own.length > 0, el = this.slots[i];
            const cls = 'ww-sl' + (has ? '' : ' off') + (i === this.hi ? ' hi' : '') + (c.list.includes(cur) ? ' cur' : '');
            if (this.sl[i].getAttribute('class') !== cls) this.sl[i].setAttribute('class', cls);
            el.className = 'ww-slot' + (has ? '' : ' off') + (i === this.hi ? ' hi' : '') + (own.length > 1 ? ' many' : '');
            const img = el.firstChild, src = WeaponWheel.icon(k);
            if (img.dataset.k !== k) { img.dataset.k = k; img.src = src; }
            el.querySelector('.ww-a').textContent = has ? this._ammo(k) : '';
            el.querySelector('.ww-n').textContent = own.length > 1 ? `${own.indexOf(k) + 1}/${own.length}` : '';
        });
        const i = this.hi, k = i >= 0 ? (this.pick[i] || C[i].list[0]) : cur, W = Weapons[k] || Weapons.fists, inv = g.inventory, has = this._owned(k);
        const $ = (s) => this.ctr.querySelector(s);
        $('.ww-cat').textContent = i >= 0 ? C[i].name : '';
        $('.ww-name').textContent = has ? W.name : (i >= 0 ? 'Nenhuma arma' : W.name);
        $('.ww-am').textContent = has && inv.isGun(k) ? `${inv.mag(k)} | ${inv.reserve(k)}` : has && inv.isThrow(k) ? `× ${inv.reserve(k)}` : '';
        const S = has ? WeaponWheel.stats(k) : null, st = $('.ww-st');
        const key = S ? S.map((v) => v.toFixed(2)).join() : '';
        if (st.dataset.k !== key) {
            st.dataset.k = key;
            st.innerHTML = S ? ['DANO', 'CADÊNCIA', 'PRECISÃO', 'ALCANCE'].map((n, j) => `<b>${n}</b><i><s style="width:${Math.round(S[j] * 100)}%"></s></i>`).join('') : '';
        }
        $('.ww-tip').textContent = !has ? (i >= 0 ? 'Compre na loja de armas ou na boca de fumo' : '')
            : inv.isThrow(k) ? 'Segure o ataque para mirar e solte para jogar'
            : W.silenced ? 'Silenciada: a polícia de longe não ouve'
            : W.rocket ? (k === 'launcher' ? 'Teleguiado: trava no alvo à frente' : 'Derruba o helicóptero com um acerto')
            : W.spinUp ? 'Segure o gatilho: os canos giram e ela dispara' : '';
        const rel = $('.ww-rel'), can = inv.isGun(cur) && inv.canReload(cur) && !(g.reloading > 0);
        rel.classList.toggle('can', can);
    }
}

memoStatics(WeaponWheel, 'CATS', 'HOLD', 'WHEEL_TIME');
