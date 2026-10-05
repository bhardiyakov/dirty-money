// ============================================================================
// Hud — a interface do jogo, em HD e cartões de vidro (tema em ui/Theme.js; ícones no estilo emoji).
//   canto superior direito:  ARMA (ícone da arma em uso, ou uma mão se não há nenhuma + munição) |
//                            NÍVEL DE PROCURADO (5 estrelas + status) | VIDA e COLETE (só se estiver usando) | $ e hora
//   canto inferior esquerdo: o mapa (minimapa, canvas #minimap, com moldura de pixel)
//   canto inferior direito:  ao entrar num veículo, por 3 s, o MODELO dele (nome + imagem em pixel art)
//   topo, no centro:         mensagens curtas (Pegou: AK-47, Roubando o carro…) — `toast`
// Os painéis são DOM com fundo translúcido desfocado; ícones são emojis (Noto Color Emoji) e as armas, arte vetorial HD.
// ============================================================================

class Hud {
    constructor(game) {
        this.g = game;
        this._cache = {};
        this._vehT = 0;
        this._toastT = 0;
        this._icons = {};
        this._build();
    }

    // ------------------------------------------------------------------ montagem
    _build() {
        const css = document.createElement('style');
        css.textContent = `
            #hud2 { position: fixed; top: 16px; right: 16px; width: 330px; display: flex; flex-direction: column; gap: 10px; z-index: 10; pointer-events: none;
                font-family: var(--font); color: var(--tx); transform-origin: top right; }
            .px { position: relative; background: var(--glass); border: 1px solid var(--line-2); border-radius: var(--r); box-shadow: var(--shadow-s);
                -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); }
            .px-title { font: 700 11px var(--font); letter-spacing: 0.12em; text-transform: uppercase; color: var(--tx-2); padding: 10px 14px 0; }
            .px-body { padding: 10px 14px 12px; display: flex; flex-direction: column; gap: 6px; }

            /* cartão do jogador: arma à esquerda, vida e colete à direita */
            .h-main { display: flex; gap: 12px; padding: 12px; align-items: stretch; }
            .h-weap { width: 108px; flex: none; border-radius: var(--r-2); background: linear-gradient(160deg, rgba(255,255,255,0.09), rgba(255,255,255,0.02));
                border: 1px solid var(--line); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 8px 6px; }
            .h-weap .w-icon { width: 92px; height: 46px; display: flex; align-items: center; justify-content: center; }
            .h-weap .w-icon canvas { max-width: 100%; max-height: 100%; }
            .h-weap .w-icon .emo { font-size: 36px; }
            .px-name { font: 600 12px var(--font); color: var(--tx-2); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
            .px-name.on { color: var(--tx); }
            .px-ammo { font: 700 15px var(--font-d); font-variant-numeric: tabular-nums; color: var(--gold); min-height: 0; }
            .px-ammo:empty { display: none; }
            .h-vit { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 10px; }
            .vrow { display: flex; align-items: center; gap: 9px; }
            .vrow .emo { font-size: 18px; width: 22px; text-align: center; flex: none; }
            .vrow .vcol { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
            .px-label { display: flex; justify-content: space-between; align-items: baseline; font: 600 11px var(--font); letter-spacing: 0.06em; text-transform: uppercase; color: var(--tx-2); }
            .px-label .px-pct { position: static; font: 700 14px var(--font-d); letter-spacing: 0; color: var(--tx); font-variant-numeric: tabular-nums; text-shadow: none; }
            .px-lvl { font-size: 10px; color: var(--blue); margin-left: 6px; letter-spacing: 0.04em; }
            .px-bar { position: relative; height: 8px; border-radius: 99px; background: rgba(255,255,255,0.08); overflow: hidden; }
            .px-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; border-radius: 99px; transition: width .25s ease; }
            .px-fill.hp { background: linear-gradient(90deg, #f43f5e, #fb7185); box-shadow: 0 0 10px rgba(244,63,94,0.55); }
            .px-fill.hp.low { background: linear-gradient(90deg, #f97316, #f43f5e); animation: hpBlink .7s ease-in-out infinite; }
            .px-fill.st { background: linear-gradient(90deg, #10b981, #a3e635); box-shadow: 0 0 10px rgba(16,185,129,0.5); }
            .px-fill.st.low { background: linear-gradient(90deg, #f59e0b, #facc15); }
            .h-load { font: 600 12px var(--font); color: var(--tx-2); margin: 2px 0 0 2px; font-variant-numeric: tabular-nums; }
            .h-load.heavy { color: #fbbf24; } .h-load.over { color: #fb7185; }
            .px-fill.ar { background: linear-gradient(90deg, #3b82f6, #22d3ee); box-shadow: 0 0 10px rgba(59,130,246,0.5); }
            .h-kit { font: 700 12px var(--font-d); color: #fda4af; display: inline-flex; align-items: center; gap: 3px; }
            .h-kit:empty { display: none; }
            @keyframes hpBlink { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }

            /* dinheiro, hora, missões */
            .stats-panel { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; padding: 10px 14px; }
            .stats-panel .st { display: flex; align-items: center; gap: 7px; font: 700 15px var(--font-d); font-variant-numeric: tabular-nums; white-space: nowrap; }
            .stats-panel .st .emo { font-size: 17px; }
            .stats-panel .st.cash { color: #86efac; flex-basis: 100%; justify-content: space-between; }
            .stats-panel .st.cash small { font: 600 12px var(--font); color: #93c5fd; }
            .stats-panel .st.cash small:empty { display: none; }

            /* procurado */
            .wanted-panel .px-body { padding-top: 6px; gap: 4px; }
            .px-stars { display: flex; gap: 4px; }
            .px-stars .emo { font-size: 24px; transition: filter .2s, opacity .2s, transform .2s; }
            .px-stars .emo.off { filter: grayscale(1) brightness(0.5); opacity: 0.45; }
            .px-stars .emo.hot { filter: hue-rotate(-38deg) saturate(2.2) drop-shadow(0 0 6px rgba(255,60,60,0.9)); transform: scale(1.08); }
            .px-status { font: 800 14px var(--font-d); letter-spacing: 0.06em; text-transform: uppercase; }
            .px-forces { font: 500 11px var(--font); color: var(--tx-2); min-height: 0; }
            .px-forces:empty { display: none; }

            /* missão em andamento (canto superior esquerdo) */
            #hMission { position: fixed; top: 16px; left: 16px; width: 280px; z-index: 10; pointer-events: none; font-family: var(--font); color: var(--tx); border-left: 3px solid var(--gold); }
            #hMission .px-title { color: var(--gold); padding: 10px 14px 0; }
            #hMission .px-body { padding: 6px 14px 11px; gap: 3px; }
            #hMiX { font-size: 13px; color: var(--tx); line-height: 1.35; }
            #hMiE { font: 700 13px var(--font-d); }

            #vehPop { position: fixed; right: 16px; bottom: 16px; z-index: 11; min-width: 240px; max-width: 340px; pointer-events: none; font-family: var(--font); color: var(--tx);
                opacity: 0; transform: translateY(16px); transition: opacity .25s ease, transform .25s ease; }
            #vehPop.show { opacity: 1; transform: translateY(0); }
            #vehPop .px-body { padding: 8px 16px 14px; gap: 10px; align-items: center; }
            #vehPop .vn { font: 700 18px var(--font-d); text-align: center; }
            #vehPop canvas { image-rendering: pixelated; }

            #toast { position: fixed; top: 18px; left: 50%; transform: translateX(-50%); z-index: 12; pointer-events: none; max-width: min(620px, 56vw); text-align: center;
                font: 600 15px/1.35 var(--font); color: var(--tx); padding: 10px 20px; display: none; border-radius: var(--r-pill);
                background: var(--glass-2); border: 1px solid var(--line-2); box-shadow: var(--shadow-s); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur);
                animation: toastIn .22s ease-out; }
            @keyframes toastIn { from { opacity: 0; transform: translate(-50%, -8px); } to { opacity: 1; transform: translate(-50%, 0); } }

            #minimap { border-radius: 20px !important; border: 1px solid var(--line-2) !important; box-shadow: var(--shadow-s), 0 0 0 4px rgba(14,17,26,0.55) !important;
                left: 16px !important; bottom: 16px !important; image-rendering: auto; }
            #minimap.alert-r { border-color: var(--red) !important; box-shadow: 0 0 0 3px rgba(244,63,94,0.55), 0 0 22px rgba(244,63,94,0.6) !important; }
            #minimap.alert-b { border-color: var(--blue) !important; box-shadow: 0 0 0 3px rgba(96,165,250,0.55), 0 0 22px rgba(96,165,250,0.6) !important; }
            /* operação policial na favela: o mapa vibra, a tela pulsa em vermelho (vibe de perigo) */
            @keyframes opShake { 0% { transform: translate(0,0) rotate(0deg); } 25% { transform: translate(-2px,1px) rotate(-0.4deg); } 50% { transform: translate(2px,-1px) rotate(0.4deg); } 75% { transform: translate(-1px,-2px) rotate(-0.2deg); } 100% { transform: translate(1px,2px) rotate(0.3deg); } }
            @keyframes opGlow { 0%,100% { box-shadow: 0 0 0 3px rgba(244,63,94,0.4), 0 0 8px rgba(244,63,94,0.4); } 50% { box-shadow: 0 0 0 3px rgba(244,63,94,0.9), 0 0 30px rgba(244,63,94,0.95); } }
            @keyframes opPulse { 0%,100% { opacity: 0.35; } 50% { opacity: 0.9; } }
            body.op-on #minimap { animation: opShake 0.16s steps(1) infinite, opGlow 0.9s ease-in-out infinite; border-color: var(--red) !important; }
            body.op-on #pmMap { animation: opShake 0.14s steps(1) infinite; outline: 2px solid var(--red); box-shadow: 0 0 28px rgba(244,63,94,0.85); }
            #opVignette { position: fixed; inset: 0; z-index: 9; pointer-events: none; display: none;
                background: radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(190,15,30,0.5) 100%); animation: opPulse 1.1s ease-in-out infinite; }
            body.op-on #opVignette { display: block; }
            #hud { display: none; }`;
        document.head.appendChild(css);

        const E = (k, cls = '') => `<span class="emo ${cls}">${Emoji.char(k)}</span>`;
        const mk = (cls, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; return d; };
        const root = this.root = mk('');
        root.id = 'hud2';

        // JOGADOR: arma (ícone, nome, munição) + VIDA e COLETE + kits médicos
        this.vitalPanel = this.weaponPanel = mk('px h-main', `
            <div class="h-weap"><div class="w-icon"></div><div class="px-name" id="hWName"></div><div class="px-ammo" id="hWAmmo"></div></div>
            <div class="h-vit">
              <div class="vrow">${E('heart')}<div class="vcol"><div class="px-label"><span>Vida <span class="h-kit" id="hKit2"></span></span><span class="px-pct" id="hHpT"></span></div><div class="px-bar"><div class="px-fill hp" id="hHp"></div></div></div></div>
              <div class="vrow" id="hArmorRow">${E('shield')}<div class="vcol"><div class="px-label"><span>Colete<span class="px-lvl" id="hArL"></span></span><span class="px-pct" id="hArT">0%</span></div><div class="px-bar"><div class="px-fill ar" id="hAr"></div></div></div></div>
              <div class="vrow">${E('wind')}<div class="vcol"><div class="px-label"><span>Fôlego<span class="px-lvl" id="hStL"></span></span><span class="px-pct" id="hStT"></span></div><div class="px-bar"><div class="px-fill st" id="hSt"></div></div></div></div>
              <div class="h-load" id="hLoad"></div>
            </div>`);
        // DINHEIRO (sujo e limpo), HORA e MISSÕES (troféu)
        this.moneyPanel = mk('px stats-panel', `<div class="st cash"><span>${E('cash')} <span id="hCash"></span></span><small id="hClean"></small></div>
            <div class="st">${E('clock')}<span id="hClock"></span></div><div class="st">${E('trophy')}<span id="hKit"></span></div>`);
        // PROCURADO
        this.wantedPanel = mk('px wanted-panel', '<div class="px-title">Procurado</div><div class="px-body"><div class="px-stars"></div><div class="px-status" id="hStatus"></div><div class="px-forces" id="hForces"></div></div>');
        this.missionPanel = mk('px', '<div class="px-title" id="hMiT"></div><div class="px-body"><div id="hMiX"></div><div id="hMiE"></div></div>');
        this.missionPanel.id = 'hMission';
        this.missionPanel.style.display = 'none';
        root.append(this.vitalPanel, this.moneyPanel, this.wantedPanel);
        document.body.appendChild(this.missionPanel);
        const vg = document.createElement('div'); vg.id = 'opVignette'; document.body.appendChild(vg);
        document.body.appendChild(root);
        // o HUD acompanha a largura da janela (celular tem a própria regra no TouchControls)
        const fit = () => {
            if (document.body.classList.contains('mobile')) { root.style.transform = ''; return; }
            const s = Math.max(0.78, Math.min(1.15, window.innerWidth / 1500));
            root.style.transform = `scale(${s})`;
            this.missionPanel.style.transform = `scale(${s})`; this.missionPanel.style.transformOrigin = 'top left';
        };
        fit(); window.addEventListener('resize', fit);

        // Estrelas
        const starsEl = this.wantedPanel.querySelector('.px-stars');
        this.stars = [];
        for (let i = 0; i < Config.wanted.maxLevel; i++) { const s = document.createElement('span'); s.className = 'emo off'; s.textContent = Emoji.char('star'); starsEl.appendChild(s); this.stars.push(s); }
        this.wIcon = this.weaponPanel.querySelector('.w-icon');

        // Janela do veículo e mensagens
        this.vehPop = mk('', '<div class="px"><div class="px-title">Veículo</div><div class="px-body"><div class="vn" id="vName"></div><div class="v-img"></div></div></div>');
        this.vehPop.id = 'vehPop';
        document.body.appendChild(this.vehPop);
        this.toastEl = mk('');
        this.toastEl.id = 'toast';
        document.body.appendChild(this.toastEl);

        this.$ = (id) => document.getElementById(id);
    }

    // ------------------------------------------------------------------ ícones
    // Ícone de uma arma (do atlas de itens) em canvas, ampliado 2×.
    _weaponIcon(key) {
        if (!this._icons[key]) {
            const ch = Emoji.VECTOR[key] ? null : Emoji.char(key);                 // faca, taco, mão: emoji; armas de fogo: arte vetorial HD
            if (ch) { const e = document.createElement('span'); e.className = 'emo'; e.textContent = ch; this._icons[key] = e; }
            else { const c = WeaponArt.canvas(key); c.style.width = '100%'; c.style.height = 'auto'; this._icons[key] = c; }
        }
        return this._icons[key];
    }

    // ------------------------------------------------------------------ mensagens
    toast(msg) {
        if (!msg) { this.toastEl.style.display = 'none'; this._toastT = 0; return; }
        this.toastEl.textContent = msg;
        this.toastEl.style.display = 'block';
        this._toastT = 2.6;
    }

    // Janela do veículo (canto inferior direito, 3 s): nome do modelo + imagem em pixel art.
    showVehicle(car) {
        const spec = car.spec;
        let img;
        try {
            if (car.isChopper) img = null;
            else if (car.isBoat) img = BoatSheet.preview(spec.id, car.visual ? car.visual.variant : 4);
            else if (car.isBike) img = this._bikePreview(car);
            else img = CarSheet.preview(spec.id, car.visual ? car.visual.variant : 0);
        } catch (e) { img = null; }
        this.$('vName').textContent = spec.model || spec.name;
        const holder = this.vehPop.querySelector('.v-img');
        holder.replaceChildren();
        if (img) {
            const k = Math.max(1, Math.min(3, Math.floor(260 / img.width)));
            img.style.width = img.width * k + 'px'; img.style.height = img.height * k + 'px';
            img.style.imageRendering = 'pixelated';
            holder.appendChild(img);
        }
        this.vehPop.classList.add('show');
        this._vehT = 3;
    }

    // Moto/bicicleta: o desenho do veículo do rig (sem piloto), de lado para a direita.
    _bikePreview(car) {
        const kind = car.spec.bike, variant = car.frameVariant != null ? car.frameVariant : 2;
        // Atlas vetorial (o mesmo desenho do jogo), girado com a frente para a direita; sem atlas, o desenho antigo do rig.
        const art = CharArt.available() && CharArt.image('rider', 'park_' + kind + ':none', 0, variant);
        if (art) {
            const c = document.createElement('canvas'), pad = 2;
            c.width = art.height + pad * 2; c.height = art.width + pad * 2;
            const ctx = c.getContext('2d');
            ctx.translate(c.width - pad, pad); ctx.rotate(Math.PI / 2);
            ctx.filter = 'brightness(0) invert(0.94)';                        // contorno claro (lê bem no painel escuro)
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ctx.drawImage(art, dx, dy);
            ctx.filter = 'none'; ctx.drawImage(art, 0, 0);
            return c;
        }
        const look = { hair: 'short', build: 1.05, belt: true };
        const prims = CharacterRig.build(CharacterRig.CLIPS['park_' + kind].pose(0, 'none'), look);
        const F = 80, img = SpriteBaker.bake(prims, { size: F, heading: Math.PI / 2, shadow: false });
        const rgba = CharacterRig.colorize(img, variant);
        let x0 = F, y0 = F, x1 = 0, y1 = 0;
        for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) if (rgba[(y * F + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        const pad = 2, w = x1 - x0 + 1 + pad * 2, h = y1 - y0 + 1 + pad * 2;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d'), out = ctx.createImageData(w, h), solid = new Uint8Array(w * h);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const i = (y * F + x) * 4;
            if (rgba[i + 3] === 0 || rgba[i + 2] === 12 && rgba[i + 3] < 120) continue;
            const o = ((y - y0 + pad) * w + (x - x0 + pad)) * 4;
            out.data[o] = rgba[i]; out.data[o + 1] = rgba[i + 1]; out.data[o + 2] = rgba[i + 2]; out.data[o + 3] = 255;
            solid[(y - y0 + pad) * w + (x - x0 + pad)] = 1;
        }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (solid[y * w + x]) continue;
            const n = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && solid[yy * w + xx];
            if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) { const o = (y * w + x) * 4; out.data[o] = 238; out.data[o + 1] = 240; out.data[o + 2] = 246; out.data[o + 3] = 255; }
        }
        ctx.putImageData(out, 0, 0);
        return c;
    }

    // ------------------------------------------------------------------ frame
    // Só mexe no DOM quando algo mudou.
    _set(key, val, fn) { if (this._cache[key] !== val) { this._cache[key] = val; fn(val); } }

    update(dt) {
        const g = this.g, pl = g.player, inv = g.inventory;
        if (this._vehT > 0) { this._vehT -= dt; if (this._vehT <= 0) this.vehPop.classList.remove('show'); }
        if (this._toastT > 0) { this._toastT -= dt; if (this._toastT <= 0) this.toastEl.style.display = 'none'; }

        // ---- arma
        const wk = pl.weapon === 'none' ? 'fists' : pl.weapon, W = Weapons[wk];
        const none = pl.weapon === 'none' || wk === 'fists';
        this._set('wIcon', none ? 'none' : wk, (k) => { this.wIcon.replaceChildren(this._weaponIcon(k)); });
        this._set('wName', none ? 'Desarmado' : W.name, (v) => { const e = this.$('hWName'); e.textContent = v; e.classList.toggle('on', !none); });
        const ammo = !none && inv.isGun(wk) ? `${inv.mag(wk)}/${inv.reserve(wk)}${g.reloading > 0 ? ' ↻' : ''}` : '';
        this._set('wAmmo', ammo, (v) => { this.$('hWAmmo').textContent = v; });

        // ---- procurado
        const lvl = g.wanted.level;
        this._set('wShow', lvl > 0 || g.wanted.lose > 0.3 || !!g.hiding, (v) => { this.wantedPanel.style.display = v ? '' : 'none'; });      // painel de procurado só quando há procurado
        const hot = lvl >= 4;
        this._set('stars', lvl + (hot ? 'h' : ''), () => {
            this.stars.forEach((c, i) => { c.className = 'emo' + (i < lvl ? (hot ? ' hot' : '') : ' off'); });
        });
        let st, col;
        if (g.hiding && g.hiding.phase === 'hidden') { st = g.hiding.seen ? 'Visto! Eles vêm' : 'Escondido'; col = g.hiding.seen ? '#fb7185' : '#7dd3fc'; }
        else if (lvl <= 0) { st = 'Limpo'; col = '#86efac'; }
        else if (g.bustTimer > 0) { st = `Preso em ${Math.max(0, Config.police.bustTime - g.bustTimer).toFixed(1)}s`; col = '#fb7185'; }
        else if (g.wanted.lose > 0.3) { st = `Escapando ${Math.max(0, g.wanted.cfg.lose - g.wanted.lose).toFixed(1)}s`; col = '#86efac'; }
        else { st = 'Procurado'; col = '#fdba74'; }
        this._set('status', st + col, () => { const e = this.$('hStatus'); e.textContent = st; e.style.color = col; });
        let forces = '';
        if (lvl > 0 && g.policeManager) {
            const pm = g.policeManager, n = (f) => pm.officers.filter((o) => o.alive && f(o)).length;
            const cars = pm.cars.filter((c) => c.role !== 'block' && c.fsm.name === 'CHASE').length;
            const parts = [`🚓 ${cars}`, `👮 ${n((o) => o.kind === 'cop' && o.fsm.name === 'CHASE')}`];
            if (pm.heli && pm.heli.alive) parts.push('🚁');
            if (n((o) => o.kind === 'swat')) parts.push(`SWAT ${n((o) => o.kind === 'swat')}`);
            if (n((o) => o.kind === 'army')) parts.push(`Exército ${n((o) => o.kind === 'army')}`);
            if (pm.blocks.active) parts.push(`🚧 ${pm.blocks.active}`);
            forces = parts.join(' · ');
        }
        this._set('forces', forces, (v) => { this.$('hForces').textContent = v; });

        document.body.classList.toggle('op-on', !!Standing.policeOp);          // operação policial: mapa vibra e a tela pulsa


        // ---- missão do tráfico em andamento
        const mi = (g.careers && g.careers.hud()) || (g.missions ? g.missions.hud() : null);
        this._set('mi', mi ? mi.title + mi.extra + mi.low : '', () => {
            this.missionPanel.style.display = mi ? '' : 'none';
            if (!mi) return;
            this.$('hMiT').textContent = (g.careers && g.careers.job ? '' : 'Missão · ') + mi.title; this.$('hMiX').textContent = mi.text; const e = this.$('hMiE'); e.textContent = mi.extra; e.style.color = mi.low ? '#fb7185' : '#93c5fd';
        });
        // ---- vida e colete
        const hp =Math.max(0, Math.min(1, pl.hp / pl.maxHp)), hpPct = Math.round(hp * 100);
        this._set('hp', hpPct, (v) => { this.$('hHp').style.width = v + '%'; this.$('hHpT').textContent = v; this.$('hHp').classList.toggle('low', v < 30); });
        const hasVest = pl.armorMax > 0 && pl.armor > 0;
        const ap = hasVest ? Math.round((pl.armor / pl.armorMax) * 100) : 0;
        this._set('ar', ap, (v) => { this.$('hAr').style.width = v + '%'; this.$('hArT').textContent = v; });
        this._set('arl', hasVest ? pl.armorMax : 0, (v) => { this.$('hArL').textContent = v ? 'nível ' + (v >= 100 ? 2 : 1) : ''; });

        // ---- fôlego (estamina) e peso carregado
        const stMax = pl.staminaMax || 100, sp = Math.round(Math.max(0, Math.min(1, (pl.stamina == null ? stMax : pl.stamina) / stMax)) * 100);
        this._set('st', sp + (pl.winded ? 'w' : ''), () => { this.$('hSt').style.width = sp + '%'; this.$('hStT').textContent = pl.winded ? 'sem fôlego' : sp; this.$('hSt').classList.toggle('low', !!pl.winded || sp < 25); });
        const fl = Bags.fitLevel(pl.fit);
        this._set('stl', fl, (v) => { this.$('hStL').textContent = v ? 'cond. ' + v : ''; });
        const D = Bags.def(inv), kg = Math.round((Bags.kg || 0) * 10) / 10, r = Bags.ratio || 0;
        this._set('load', D.name + kg, () => {
            const el = this.$('hLoad');
            el.innerHTML = `<span class="emo">${D.emo}</span> ${D.name} · ${kg.toFixed(1)}/${D.kg} kg${r > 1 ? ' · sobrecarga' : (r > 0.5 ? ' · pesado' : '')}`;
            el.className = 'h-load' + (r > 1 ? ' over' : (r > 0.5 ? ' heavy' : ''));
        });

        // ---- dinheiro, hora e kits
        this._set('cash', inv.cash + '/' + inv.clean, () => { this.$('hCash').textContent = brl(inv.cash); this.$('hClean').textContent = inv.clean > 0 ? 'limpo ' + brl(inv.clean) : ''; });
        this._set('clock', g.dayNight.label, (v) => { this.$('hClock').textContent = v; });
        this._set('kit', Standing.missionsDone, (v) => { this.$('hKit').textContent = '+' + v; });                 // troféu: missões do tráfico cumpridas
        this._set('kit2', inv.medkits, (v) => { this.$('hKit2').innerHTML = v ? `<span class="emo" style="font-size:12px">${Emoji.char('medkit')}</span>${v}` : ''; });                 // kits médicos no título do JOGADOR
    }
}
