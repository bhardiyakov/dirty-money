// ============================================================================
// Hud — a interface do jogo em PIXEL ART (substitui a caixa verde de depuração, que só aparece com `?debug`+dbg.hud).
//   canto superior direito:  ARMA (ícone da arma em uso, ou uma mão se não há nenhuma + munição) |
//                            NÍVEL DE PROCURADO (5 estrelas + status) | VIDA e COLETE (só se estiver usando) | $ e hora
//   canto inferior esquerdo: o mapa (GPS, canvas #minimap, com moldura de pixel)
//   canto inferior direito:  ao entrar num veículo, por 3 s, o MODELO dele (nome + imagem em pixel art)
//   topo, no centro:         mensagens curtas (Pegou: AK-47, Roubando o carro…) — `toast`
// Os painéis são DOM com moldura de pixels (bordas em degrau) e fonte de pixel; ícones e estrelas são canvas pequenos
// ampliados sem suavização.
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
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&display=swap';
        document.head.appendChild(link);

        const css = document.createElement('style');
        css.textContent = `
            #hud2 { position: fixed; top: 14px; right: 14px; width: 244px; display: flex; flex-direction: column; gap: 11px;
                z-index: 10; pointer-events: none; font-family: 'Silkscreen', 'Press Start 2P', 'Courier New', monospace; text-transform: uppercase; color: #eef1f7; }
            .px { position: relative; background: #141922; border: 4px solid #07090d;
                box-shadow: inset 0 0 0 2px #3a4560, 0 0 0 2px #8791aa, 3px 3px 0 2px rgba(0,0,0,0.45); image-rendering: pixelated; }
            .px-title { background: #05070b; text-align: center; font-weight: 700; font-size: 15px; padding: 5px 0 3px; letter-spacing: 1px; }
            .px-body { padding: 8px 10px 9px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
            .px canvas { image-rendering: pixelated; image-rendering: crisp-edges; display: block; }
            .px-name { font-size: 14px; font-weight: 700; color: #aab3c8; letter-spacing: 1px; }
            .px-name.on { color: #f1f4fb; }
            .px-ammo { font-size: 12px; color: #ffd23f; min-height: 13px; }
            .px-stars { display: flex; gap: 3px; margin-top: 2px; }
            .px-status { font-size: 14px; font-weight: 700; letter-spacing: 1px; }
            .px-forces { font-size: 9px; color: #8fb4ff; min-height: 10px; }
            .px-row { width: 100%; display: flex; flex-direction: column; gap: 3px; }
            .px-label { font-size: 15px; font-weight: 700; letter-spacing: 1px; display: flex; justify-content: space-between; align-items: center; }
            .px-bar { position: relative; height: 22px; background: #0a0d13; border: 3px solid #07090d; box-shadow: 0 0 0 2px #39425a; }
            .px-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; }
            .px-fill::after { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 4px; background: rgba(255,255,255,0.28); }
            .px-fill.hp { background: linear-gradient(180deg, #ff5b57 0 45%, #d02222 45% 100%); }
            .px-fill.hp.low { background: linear-gradient(180deg, #ff9a3a 0 45%, #e0541a 45% 100%); animation: hpBlink 0.6s steps(2, jump-none) infinite; }
            .px-fill.ar { background: linear-gradient(180deg, #5aa2ff 0 45%, #2a62d2 45% 100%); }
            .px-pct { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700;
                text-shadow: 1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000; }
            .px-armor { display: flex; align-items: flex-end; gap: 8px; }
            .px-armor .col { flex: 1; display: flex; flex-direction: column; gap: 3px; }
            .px-lvl { font-size: 11px; text-align: right; color: #bcd0ff; }
            .px-money { flex-direction: row; justify-content: space-between; font-size: 13px; padding: 6px 10px; }
            .px-money .c { color: #ffd23f; } .px-money .t { color: #cfd6e6; }
            @keyframes hpBlink { 0% { opacity: 1; } 50% { opacity: 0.55; } }

            #vehPop { position: fixed; right: 16px; bottom: 16px; z-index: 11; min-width: 250px; max-width: 340px; pointer-events: none;
                font-family: 'Silkscreen', 'Press Start 2P', monospace; text-transform: uppercase; color: #f1f4fb;
                opacity: 0; transform: translateX(40px); transition: opacity 0.25s steps(4), transform 0.25s steps(5); }
            #vehPop.show { opacity: 1; transform: translateX(0); }
            #vehPop .px-body { padding: 10px 14px 12px; gap: 8px; }
            #vehPop .vt { font-size: 11px; color: #8d97ad; letter-spacing: 1px; }
            #vehPop .vn { font-size: 16px; font-weight: 700; text-align: center; letter-spacing: 1px; }

            #toast { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 12; pointer-events: none; max-width: 56vw; text-align: center;
                font-family: 'Silkscreen', 'Press Start 2P', monospace; font-weight: 700; font-size: 15px; text-transform: uppercase; letter-spacing: 1px;
                color: #ffe27a; padding: 8px 16px; display: none;
                text-shadow: 2px 2px 0 #000, -2px 2px 0 #000, 2px -2px 0 #000, -2px -2px 0 #000; }

            #prompt, #lockpick { font-family: 'Silkscreen', 'Courier New', monospace; text-transform: uppercase; border-radius: 0; border-width: 3px; }
            #minimap { border-radius: 0 !important; border: 4px solid #07090d; box-shadow: inset 0 0 0 2px #3a4560, 0 0 0 2px #8791aa, 3px 3px 0 2px rgba(0,0,0,0.45) !important;
                image-rendering: pixelated; left: 16px !important; bottom: 16px !important; }
            #minimap.alert-r { border-color: #e03030 !important; box-shadow: inset 0 0 0 2px #7a1c1c, 0 0 0 2px #ff5a4d, 0 0 16px rgba(255,60,50,0.8) !important; }
            #minimap.alert-b { border-color: #2f62e8 !important; box-shadow: inset 0 0 0 2px #1c2f7a, 0 0 0 2px #5a8aff, 0 0 16px rgba(60,110,255,0.8) !important; }
            #inventory { left: 16px !important; right: auto !important; top: 16px !important; border-radius: 0 !important; font-family: 'Silkscreen', 'Courier New', monospace; text-transform: uppercase; }
            /* operação policial na favela: o mapa vibra, a tela pulsa em vermelho (vibe de perigo) */
            @keyframes opShake { 0% { transform: translate(0,0) rotate(0deg); } 25% { transform: translate(-2px,1px) rotate(-0.4deg); } 50% { transform: translate(2px,-1px) rotate(0.4deg); } 75% { transform: translate(-1px,-2px) rotate(-0.2deg); } 100% { transform: translate(1px,2px) rotate(0.3deg); } }
            @keyframes opGlow { 0%,100% { box-shadow: inset 0 0 0 2px #7a1c1c, 0 0 0 2px #ff5a4d, 0 0 6px rgba(255,60,50,0.5); } 50% { box-shadow: inset 0 0 0 2px #b02020, 0 0 0 2px #ff7a6d, 0 0 26px rgba(255,60,50,1); } }
            @keyframes opPulse { 0%,100% { opacity: 0.35; } 50% { opacity: 0.9; } }
            body.op-on #minimap { animation: opShake 0.16s steps(1) infinite, opGlow 0.9s ease-in-out infinite; border-color: #e03030 !important; }
            body.op-on #pmMap { animation: opShake 0.14s steps(1) infinite; outline: 3px solid #e03030; box-shadow: 0 0 28px rgba(255,50,40,0.85); }
            #opVignette { position: fixed; inset: 0; z-index: 9; pointer-events: none; display: none;
                background: radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(190,15,15,0.55) 100%); animation: opPulse 1.1s ease-in-out infinite; }
            body.op-on #opVignette { display: block; }
            #hud { display: none; }`;
        document.head.appendChild(css);
        // ---- visual NEON (JOGADOR | ARMA lado a lado, faixa de dinheiro/hora/missões embaixo; painéis arredondados com borda ciano→magenta)
        const skin = document.createElement('style');
        skin.textContent = `
            #hud2 { width: 460px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; top: 12px; right: 12px; align-items: stretch; }
            #hud2 .hp-panel { grid-column: 1; grid-row: 1; } #hud2 .weapon-panel { grid-column: 2; grid-row: 1; }
            #hud2 .stats-panel { grid-column: 1 / 3; grid-row: 2; } #hud2 .wanted-panel { grid-column: 1 / 3; grid-row: 3; } #hud2 .moral-panel { grid-column: 1 / 3; grid-row: 4; }
            .px { background: rgba(9, 14, 32, 0.86); border: none; border-radius: 14px; box-shadow: 0 0 18px rgba(53,224,255,0.18), 0 0 26px rgba(255,58,208,0.12); image-rendering: auto; overflow: hidden; }
            .px::before { content: ''; position: absolute; inset: 0; border-radius: 14px; padding: 2.5px; pointer-events: none;
                background: linear-gradient(135deg, #35e0ff 0%, #7a5cff 50%, #ff3ad0 100%);
                -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); }
            .px-title { background: rgba(0,0,0,0.38); border-bottom: 1px solid rgba(255,255,255,0.07); font-size: 15px; padding: 7px 0 5px; letter-spacing: 1.5px; color: #f4f7ff; }
            .weapon-panel .px-title { color: #ffd23a; }
            .px-title .kit { color: #ff6a8a; font-size: 11px; margin-left: 6px; }
            .px-bar { height: 22px; background: #0a0f22; border: 2px solid #1f2a4a; border-radius: 8px; box-shadow: none; overflow: hidden; }
            .px-fill { border-radius: 6px; } .px-fill::after { height: 5px; background: rgba(255,255,255,0.22); }
            .px-fill.hp { background: linear-gradient(90deg, #ff3a8a 0%, #b04cff 55%, #4a7cff 100%); }
            .px-fill.hp.low { background: linear-gradient(90deg, #ff9a3a, #e0541a); }
            .px-fill.ar { background: linear-gradient(90deg, #2a7cff 0%, #35c8ff 100%); }
            .px-pct { font-size: 14px; text-shadow: 0 1px 2px #000; }
            .px-label { font-size: 15px; }
            .hp-panel .px-body { padding: 12px 12px 12px; }
            .vrow { display: flex; align-items: center; gap: 10px; } .vrow .vcol { flex: 1; min-width: 0; }
            .vrow .h-icon, .vrow .a-icon { flex: none; width: 36px; display: flex; justify-content: center; }
            .vrow canvas { image-rendering: pixelated; }
            .weapon-panel .px-body { padding: 10px; justify-content: center; flex: 1; }
            .weapon-panel .px-name { font-size: 15px; color: #dfe6f5; }
            .weapon-panel .w-icon { width: 88%; display: flex; justify-content: center; }
            .stats-panel { display: flex; justify-content: space-around; align-items: center; padding: 12px 8px; gap: 8px; font-size: 18px; letter-spacing: 1px; }
            .stats-panel .st { display: flex; align-items: center; gap: 9px; color: #f2f5ff; white-space: nowrap; }
            .stats-panel .ic-slot { display: inline-flex; } .stats-panel canvas { image-rendering: pixelated; }
            .wanted-panel .px-title, .moral-panel .px-title { font-size: 12px; }
            #minimap { border-radius: 14px !important; border: 3px solid #35e0ff !important;
                box-shadow: 0 0 0 2px #0a1022, 0 0 14px rgba(53,224,255,0.55), 0 0 24px rgba(255,58,208,0.35) !important; image-rendering: auto; }
        `;
        document.head.appendChild(skin);

        const mk = (cls, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; return d; };
        const root = this.root = mk('');
        root.id = 'hud2';

        // ARMA
        this.weaponPanel = mk('px weapon-panel', '<div class="px-title">ARMA</div><div class="px-body"><div class="w-icon"></div><div class="px-name" id="hWName"></div><div class="px-ammo" id="hWAmmo"></div></div>');
        // PROCURADO
        this.wantedPanel = mk('px wanted-panel', '<div class="px-title">NÍVEL DE PROCURADO</div><div class="px-body"><div class="px-stars"></div><div class="px-status" id="hStatus"></div><div class="px-forces" id="hForces"></div></div>');
        // JOGADOR: VIDA e COLETE (com ícones), kit médico no título
        this.vitalPanel = mk('px hp-panel', `<div class="px-title">JOGADOR <span class="kit" id="hKit2"></span></div><div class="px-body" style="align-items:stretch;gap:9px">
            <div class="vrow"><div class="h-icon"></div><div class="vcol"><div class="px-label"><span>VIDA</span></div><div class="px-bar"><div class="px-fill hp" id="hHp"></div><div class="px-pct" id="hHpT"></div></div></div></div>
            <div class="vrow" id="hArmorRow"><div class="a-icon"></div><div class="vcol"><div class="px-label"><span>COLETE</span><span class="px-lvl" id="hArL"></span></div><div class="px-bar"><div class="px-fill ar" id="hAr"></div><div class="px-pct" id="hArT">0%</div></div></div></div></div>`);
        // DINHEIRO, HORA e MISSÕES (troféu)
        this.moneyPanel = mk('px stats-panel', '<div class="st"><span class="ic-slot cash"></span><span id="hCash"></span></div><div class="st"><span class="ic-slot clock"></span><span id="hClock"></span></div><div class="st"><span class="ic-slot trophy"></span><span id="hKit"></span></div>');
        this.missionPanel = mk('px', '<div class="px-title" style="font-size:11px" id="hMiT"></div><div class="px-body" style="gap:2px;padding:5px 8px"><div class="px-forces" style="color:#ffe27a;font-size:10px;text-align:center" id="hMiX"></div><div class="px-status" style="font-size:13px" id="hMiE"></div></div>');
        this.missionPanel.style.display = 'none';
        root.append(this.vitalPanel, this.weaponPanel, this.moneyPanel, this.wantedPanel);
        Object.assign(this.missionPanel.style, { position: 'fixed', top: '14px', left: '14px', width: '230px', zIndex: '10', pointerEvents: 'none', fontFamily: "'Silkscreen', 'Press Start 2P', monospace", textTransform: 'uppercase', color: '#eef1f7' });
        document.body.appendChild(this.missionPanel);
        const vg = document.createElement('div'); vg.id = 'opVignette'; document.body.appendChild(vg);
        document.body.appendChild(root);
        // o HUD de vida/colete/arma ocupa só ~10% da tela: escala com a largura da janela (celular tem a própria regra no TouchControls)
        const fit = () => {
            if (document.body.classList.contains('mobile')) { root.style.transform = ''; return; }
            const s = Math.max(0.5, Math.min(0.78, window.innerWidth / 2600));
            root.style.transform = `scale(${s})`; root.style.transformOrigin = 'top right';
        };
        fit(); window.addEventListener('resize', fit);

        // Estrelas
        const starsEl = this.wantedPanel.querySelector('.px-stars');
        this.stars = [];
        for (let i = 0; i < Config.wanted.maxLevel; i++) {
            const c = Hud._star(false); starsEl.appendChild(c); this.stars.push(c);
        }
        this.starOn = Hud._star(true); this.starOff = Hud._star(false); this.starHot = Hud._star(true, true);
        this.vestIcon = this._canvasFromPixels(ItemSprites.icon('vest'), 1);
        this.weaponPanel.querySelector('.w-icon').appendChild(this.wIcon = document.createElement('canvas'));
        this.vitalPanel.querySelector('.a-icon').appendChild(this.aIcon = document.createElement('canvas'));
        // ícones do painel (pixel art desenhada em código)
        this.vitalPanel.querySelector('.h-icon').appendChild(Hud._icon('heart'));
        for (const k of ['cash', 'clock', 'trophy']) this.moneyPanel.querySelector('.ic-slot.' + k).appendChild(Hud._icon(k));

        // Janela do veículo e mensagens
        this.vehPop = mk('', '<div class="px"><div class="px-title">VEÍCULO</div><div class="px-body"><div class="vn" id="vName"></div><div class="v-img"></div></div></div>');
        this.vehPop.id = 'vehPop';
        document.body.appendChild(this.vehPop);
        this.toastEl = mk('');
        this.toastEl.id = 'toast';
        document.body.appendChild(this.toastEl);

        this.$ = (id) => document.getElementById(id);
    }

    // ------------------------------------------------------------------ ícones
    // PixelCanvas -> <canvas> ampliado `k`× (pixels nítidos).
    _canvasFromPixels(px, k = 1) {
        const c = document.createElement('canvas');
        c.width = px.w; c.height = px.h;
        const x = c.getContext('2d'), id = x.createImageData(px.w, px.h);
        id.data.set(px.data);
        x.putImageData(id, 0, 0);
        c.style.width = px.w * k + 'px'; c.style.height = px.h * k + 'px';
        return c;
    }

    // Ícones 12×? em pixel art (grade de caracteres → canvas ampliado 3×): heart | cash | clock | trophy.
    static _icon(kind) {
        const P = {
            heart: { rows: ['..RR..RR..', '.RHHRRRRR.', 'RHHRRRRRRR', 'RHRRRRRRRR', '.RRRRRRRR.', '..RRRRRR..', '...RRRR...', '....RR....'], pal: { R: '#ff4a6e', H: '#ffb0c0' } },
            cash: { rows: ['GGGGGGGGGGGG', 'GddddddddddG', 'GdddLLLLdddG', 'GdddLddLdddG', 'GdddLLLLdddG', 'GddddddddddG', 'GGGGGGGGGGGG'], pal: { G: '#1a7a3a', d: '#3fcf68', L: '#c4f8d2' } },
            clock: { rows: ['...WWWWWW...', '..WwwwwwwW..', '.WwwwKwwwwW.', 'WwwwwKwwwwwW', 'WwwwwKwwwwwW', 'WwwwwKKKKwwW', 'WwwwwwwwwwwW', '.WwwwwwwwwW.', '..WwwwwwwW..', '...WWWWWW...'], pal: { W: '#e8ecf8', w: '#35c8ff', K: '#10162c' } },
            trophy: { rows: ['YYYYYYYYYY', 'YyyyyyyyyY', 'YyyyyyyyyY', '.YyyyyyyY.', '..YyyyyY..', '...YyyY...', '....YY....', '....YY....', '..YYYYYY..', '..YYYYYY..'], pal: { Y: '#ffc72e', y: '#ffe27a' } },
        }[kind];
        const k = 3, w = P.rows[0].length, c = document.createElement('canvas');
        c.width = w * k; c.height = P.rows.length * k;
        const x = c.getContext('2d');
        P.rows.forEach((r, j) => { for (let i = 0; i < w; i++) { const ch = r[i]; if (ch === '.' || !P.pal[ch]) continue; x.fillStyle = P.pal[ch]; x.fillRect(i * k, j * k, k, k); } });
        return c;
    }

    // Estrela 9×9 ampliada 4×. on = cheia | hot = vermelha (4–5★).
    static _star(on, hot = false) {
        const rows = ['....X....', '....X....', '...XXX...', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '..XXXXX..', '.XXX.XXX.', '.XX...XX.'];
        const p = new PixelCanvas(11, 11);
        const fill = on ? (hot ? [255, 120, 104] : [244, 244, 246]) : [43, 48, 62];
        const shade = on ? (hot ? [190, 60, 52] : [168, 170, 180]) : [30, 34, 45];
        rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === 'X') p.set(i + 1, j + 1, j >= 5 ? shade : fill); }));
        ItemSprites._outline(p);
        const c = document.createElement('canvas');
        c.width = 11; c.height = 11;
        const x = c.getContext('2d'), id = x.createImageData(11, 11);
        id.data.set(p.data); x.putImageData(id, 0, 0);
        c.style.width = '40px'; c.style.height = '40px';
        return c;
    }

    // Mão aberta (sem arma): bitmap 16×14 em tons de pele.
    _handPixels() {
        const rows = [
            '......XX........', '.....XXXX.......', '.....XXXX.XX....', '.XX..XXXX.XXXX..', '.XXX.XXXX.XXXX..',
            '.XXXXXXXXXXXXXX.', '..XXXXXXXXXXXXX.', '...XXXXXXXXXXXX.', '....XXXXXXXXXXX.', '....XXXXXXXXXXX.',
            '.....XXXXXXXXX..', '......XXXXXXX...', '......XXXXXX....', '......XXXXXX....',
        ];
        const p = new PixelCanvas(18, 16);
        rows.forEach((r, j) => [...r].forEach((ch, i) => {
            if (ch !== 'X') return;
            const edgeR = r[i + 1] !== 'X', low = j > 9;
            p.set(i + 1, j + 1, edgeR || low ? [214, 160, 118] : (i < 5 ? [240, 196, 156] : [232, 184, 142]));
        }));
        ItemSprites._outline(p);
        return p;
    }

    // Ícone de uma arma (do atlas de itens) em canvas, ampliado 2×.
    _weaponIcon(key) {
        if (!this._icons[key]) { const c = WeaponArt.canvas(key); c.style.width = '100%'; c.style.height = 'auto'; c.style.imageRendering = 'pixelated'; this._icons[key] = c; }      // arte realista (art/WeaponArt.js)
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
        const kind = car.spec.bike, look = { hair: 'short', build: 1.05, belt: true };
        const prims = CharacterRig.build(CharacterRig.CLIPS['park_' + kind].pose(0, 'none'), look);
        const F = 80, img = SpriteBaker.bake(prims, { size: F, heading: Math.PI / 2, shadow: false });
        const rgba = CharacterRig.colorize(img, car.frameVariant != null ? car.frameVariant : 2);
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
        this._set('wIcon', none ? 'none' : wk, (k) => {
            const src = this._weaponIcon(k);
            this.wIcon.width = src.width; this.wIcon.height = src.height;
            this.wIcon.getContext('2d').drawImage(src, 0, 0);
            this.wIcon.style.width = '100%'; this.wIcon.style.height = 'auto'; this.wIcon.style.imageRendering = 'pixelated';
        });
        this._set('wName', none ? 'NENHUMA' : W.name, (v) => { const e = this.$('hWName'); e.textContent = v; e.classList.toggle('on', !none); });
        const ammo = !none && inv.isGun(wk) ? `${inv.mag(wk)}/${inv.reserve(wk)}${g.reloading > 0 ? ' ↻' : ''}` : '';
        this._set('wAmmo', ammo, (v) => { this.$('hWAmmo').textContent = v; });

        // ---- procurado
        const lvl = g.wanted.level;
        this._set('wShow', lvl > 0 || g.wanted.lose > 0.3 || !!g.hiding, (v) => { this.wantedPanel.style.display = v ? '' : 'none'; });      // painel de procurado só quando há procurado
        const hot = lvl >= 4;
        this._set('stars', lvl + (hot ? 'h' : ''), () => {
            this.stars.forEach((c, i) => {
                const src = i < lvl ? (hot ? this.starHot : this.starOn) : this.starOff;
                c.getContext('2d').clearRect(0, 0, 11, 11); c.getContext('2d').drawImage(src, 0, 0, 11, 11);
            });
        });
        let st, col;
        if (g.hiding && g.hiding.phase === 'hidden') { st = g.hiding.seen ? 'VISTO! ELES VÊM' : 'ESCONDIDO'; col = g.hiding.seen ? '#ff5a4d' : '#8fd6ff'; }
        else if (lvl <= 0) { st = 'LIMPO'; col = '#6dff8a'; }
        else if (g.bustTimer > 0) { st = `PRESO EM ${Math.max(0, Config.police.bustTime - g.bustTimer).toFixed(1)}S`; col = '#ff5a4d'; }
        else if (g.wanted.lose > 0.3) { st = `ESCAPANDO ${Math.max(0, g.wanted.cfg.lose - g.wanted.lose).toFixed(1)}S`; col = '#7dff9a'; }
        else { st = 'PROCURADO'; col = '#ff8a3d'; }
        this._set('status', st + col, () => { const e = this.$('hStatus'); e.textContent = st; e.style.color = col; });
        let forces = '';
        if (lvl > 0 && g.policeManager) {
            const pm = g.policeManager, n = (f) => pm.officers.filter((o) => o.alive && f(o)).length;
            const cars = pm.cars.filter((c) => c.role !== 'block' && c.fsm.name === 'CHASE').length;
            const parts = [`${cars} VIAT`, `${n((o) => o.kind === 'cop' && o.fsm.name === 'CHASE')} A PÉ`];
            if (pm.heli && pm.heli.alive) parts.push('HELI');
            if (n((o) => o.kind === 'swat')) parts.push(`SWAT ${n((o) => o.kind === 'swat')}`);
            if (n((o) => o.kind === 'army')) parts.push(`EB ${n((o) => o.kind === 'army')}`);
            if (pm.blocks.active) parts.push(`${pm.blocks.active} BLOQ`);
            forces = parts.join(' · ');
        }
        this._set('forces', forces, (v) => { this.$('hForces').textContent = v; });

        document.body.classList.toggle('op-on', !!Standing.policeOp);          // operação policial: mapa vibra e a tela pulsa


        // ---- missão do tráfico em andamento
        const mi = (g.careers && g.careers.hud()) || (g.missions ? g.missions.hud() : null);
        this._set('mi', mi ? mi.title + mi.extra + mi.low : '', () => {
            this.missionPanel.style.display = mi ? '' : 'none';
            if (!mi) return;
            this.$('hMiT').textContent = (g.careers && g.careers.job ? '' : 'MISSÃO · ') + mi.title; this.$('hMiX').textContent = mi.text; const e = this.$('hMiE'); e.textContent = mi.extra; e.style.color = mi.low ? '#ff5a4d' : '#9ec5ff';
        });
        // ---- vida e colete
        const hp =Math.max(0, Math.min(1, pl.hp / pl.maxHp)), hpPct = Math.round(hp * 100);
        this._set('hp', hpPct, (v) => { this.$('hHp').style.width = v + '%'; this.$('hHpT').textContent = v + '%'; this.$('hHp').classList.toggle('low', v < 30); });
        const hasVest = pl.armorMax > 0 && pl.armor > 0;
        this._set('vestIcon', 1, () => {                                       // o COLETE aparece sempre (0% sem colete)
            if (this.aIcon.width_set) return;
            this.aIcon.width = this.vestIcon.width; this.aIcon.height = this.vestIcon.height;
            this.aIcon.getContext('2d').drawImage(this.vestIcon, 0, 0);
            this.aIcon.style.width = '36px'; this.aIcon.style.height = '36px'; this.aIcon.width_set = true;
        });
        const ap = hasVest ? Math.round((pl.armor / pl.armorMax) * 100) : 0;
        this._set('ar', ap, (v) => { this.$('hAr').style.width = v + '%'; this.$('hArT').textContent = v + '%'; });
        this._set('arl', hasVest ? pl.armorMax : 0, (v) => { this.$('hArL').textContent = v ? 'NÍVEL ' + (v >= 100 ? 2 : 1) : ''; });

        // ---- dinheiro, hora e kits
        this._set('cash', inv.cash + '/' + inv.clean, () => { this.$('hCash').textContent = brl(inv.cash) + (inv.clean > 0 ? ' · ✔' + brl(inv.clean) : ''); });
        this._set('clock', g.dayNight.label, (v) => { this.$('hClock').textContent = v; });
        this._set('kit', Standing.missionsDone, (v) => { this.$('hKit').textContent = '+' + v; });                 // troféu: missões do tráfico cumpridas
        this._set('kit2', inv.medkits, (v) => { this.$('hKit2').textContent = v ? '✚' + v : ''; });                 // kits médicos no título do JOGADOR
    }
}
