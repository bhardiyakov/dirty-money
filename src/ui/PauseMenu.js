// ============================================================================
// PauseMenu — o menu de pausa (Esc / P). O jogo PARA de verdade (física, IA, relógio, áudio) e o fundo fica borrado.
// A moldura e as abas são pixel art; o MAPA é em alta resolução (MapRenderer.drawHD), com zoom, arrastar e cursor.
//   MAPA        mapa tático da cidade: clique/Enter marca o GPS (rota pelas ruas, também no minimapa), legenda de lugares
//   INVENTÁRIO  mochila de espaços limitados (estilo Resident Evil): equipar, usar, descartar
//   STATUS / HABILIDADES   reservados (funcionalidades futuras)
//   CONFIGURAÇÕES          volume, efeitos, minimapa, dicas
// Teclas: Esc/P fecha · Q/E ou Tab troca de aba · mapa: setas/WASD cursor, Enter/clique marca, X limpa, +/- zoom, arrastar move.
// Lugares novos (lanchonete, Pay n Pay, loja…) entram no mapa e na legenda só com CityGrid.addPoi({type,name,x,z}).
// ============================================================================

class PauseMenu {
    static get TABS() {
        return [['map', 'MAPA'], ['inventory', 'INVENTÁRIO'], ['status', 'STATUS'], ['careers', 'CARREIRAS'], ['empire', 'IMPÉRIO'], ['guide', 'GUIA'], ['settings', 'CONFIGURAÇÕES']];
    }

    // Legenda do mapa: tipos de lugar (a chave é o `type` dos POIs).
    static get POI_TYPES() {
        return {
            lanchonete: { label: 'Lanchonete', icon: 'food' },
            conveniencia: { label: 'Loja de Conveniência', icon: 'cart' },
            paynspray: { label: 'Pay n Pay', icon: 'spray' },
            home: { label: 'Safe house', icon: 'home' },
            imovel: { label: 'Imóvel à venda', icon: 'home' },
            baile: { label: 'Baile funk', icon: 'food' },
            mototaxi: { label: 'Ponto de mototáxi', icon: 'boat' },
            gunshop: { label: 'Loja de Armas', icon: 'gun' },
            hideout: { label: 'Esconderijo', icon: 'dumpster' },
            hospital: { label: 'Hospital', icon: 'hospital' },
            station: { label: 'Delegacia', icon: 'station' },
            marina: { label: 'Marina', icon: 'boat' },
            gas: { label: 'Posto de Gasolina', icon: 'fuel' },
        };
    }

    constructor(game) {
        this.g = game;
        this.isOpen = false;
        this.tab = 'map';
        this.sel = null;                 // POI destacado na legenda
        this.invSel = 0;                 // item selecionado na mochila
        this.setRow = 0;                 // linha das configurações
        this._icons = {};
        this._legendIdx = {};
        this.settings = Object.assign({ volume: 0.7, sfx: true, minimap: true, prompts: true, dev: false }, this._loadSettings());
        this.map = { cx: 0, cz: 0, scale: 4.5, cur: { x: 300, y: 200 }, drag: null, init: false };
        this._build();
        this.applySettings();
    }

    // ------------------------------------------------------------- configurações
    _loadSettings() { try { return JSON.parse(localStorage.getItem('dm_settings')) || {}; } catch (e) { return {}; } }
    _saveSettings() { try { localStorage.setItem('dm_settings', JSON.stringify(this.settings)); } catch (e) { /* sem storage */ } }
    applySettings() {
        const s = this.settings;
        AudioFX.setVolume(s.volume);
        AudioFX.muted = !s.sfx;
        const mm = document.getElementById('minimap');
        if (mm) mm.style.visibility = s.minimap ? '' : 'hidden';
        this.g.showPrompts = s.prompts;
        if (this.g.dev) this.g.dev.setEnabled(s.dev);
    }

    // ------------------------------------------------------------------ montagem
    _build() {
        const css = document.createElement('style');
        css.textContent = `
            #pause { position: fixed; inset: 0; z-index: 30; display: none; flex-direction: column; gap: 14px; padding: 16px 34px 12px;
                -webkit-backdrop-filter: blur(16px) brightness(0.5) saturate(0.8); backdrop-filter: blur(16px) brightness(0.5) saturate(0.8);
                background: radial-gradient(ellipse at center, rgba(10,14,24,0.35) 30%, rgba(0,0,0,0.65) 100%);
                font-family: 'Silkscreen', 'Press Start 2P', 'Courier New', monospace; text-transform: uppercase; color: #eef1f7; user-select: none; }
            #pause.show { display: flex; }
            .pm-tabs { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
            .pm-tab { padding: 9px 24px; font-size: 19px; font-weight: 700; letter-spacing: 1px; color: #dfe4f0; background: #141a26; cursor: pointer;
                border: 4px solid #07090d; box-shadow: inset 0 0 0 2px #3a4560, 0 0 0 2px #8791aa; }
            .pm-tab:hover { background: #1b2434; }
            .pm-tab.on { color: #6dff8a; text-shadow: 0 0 10px rgba(44,255,106,0.8); background: #0d1b14; box-shadow: inset 0 0 0 2px #2f6a47, 0 0 0 2px #4fb77a; }
            .pm-main { flex: 1; min-height: 0; display: flex; }
            .pm-page { display: none; flex: 1; min-height: 0; gap: 14px; }
            .pm-page.on { display: flex; }
            .pm-hints { display: flex; gap: 26px; justify-content: center; flex-wrap: wrap; font-size: 14px; color: #dfe4f0; }
            .pm-hints b { color: #ffe27a; }
            #pause .px { background: #141922; border: 4px solid #07090d; box-shadow: inset 0 0 0 2px #3a4560, 0 0 0 2px #8791aa, 3px 3px 0 2px rgba(0,0,0,0.45); }
            #pause .px-title { background: #05070b; text-align: center; font-weight: 700; font-size: 19px; padding: 7px 0 5px; letter-spacing: 1px; }
            .pm-col { display: flex; flex-direction: column; min-height: 0; }
            .pm-mappanel { flex: 1; min-width: 0; }
            .pm-mapwrap { position: relative; flex: 1; min-height: 0; background: #2c5877; overflow: hidden; margin: 6px; border: 3px solid #07090d; }
            .pm-mapwrap canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; cursor: none; }
            .pm-note { padding: 5px 10px 7px; font-size: 12px; color: #aab3c8; }
            .pm-side { width: 292px; gap: 14px; }
            .pm-dest { padding: 12px 14px; display: flex; gap: 12px; align-items: center; font-size: 16px; font-weight: 700; line-height: 1.25; }
            .pm-dest .t { flex: 1; } .pm-dest .d { color: #ffd23f; font-size: 14px; }
            .pm-legend { flex: 1; min-height: 0; display: flex; flex-direction: column; }
            .pm-legend-list { flex: 1; overflow-y: auto; padding: 6px 8px; display: flex; flex-direction: column; gap: 4px; }
            .pm-legend-list::-webkit-scrollbar { width: 14px; } .pm-legend-list::-webkit-scrollbar-track { background: #07090d; }
            .pm-legend-list::-webkit-scrollbar-thumb { background: #5b6580; border: 2px solid #07090d; }
            .lg { display: flex; align-items: center; gap: 12px; padding: 7px 8px; font-size: 15px; font-weight: 700; cursor: pointer; border: 2px solid transparent; }
            .lg:hover { background: #1b2434; } .lg.on { border-color: #ffd23f; background: #1d2433; }
            .lg.off { color: #6b7488; } .lg.off canvas { opacity: 0.45; }
            .lg small { margin-left: auto; font-size: 12px; color: #8d97ad; }
            .pm-inv { gap: 14px; }
            .pm-grid { position: relative; margin: 10px auto; }
            .pm-cell { position: absolute; background: #0d1119; border: 2px solid #272f42; box-sizing: border-box; }
            .pm-item { position: absolute; box-sizing: border-box; background: #1c2535; border: 3px solid #4a587a; cursor: pointer; display: flex; align-items: center; justify-content: center; }
            .pm-item:hover { background: #26324a; } .pm-item.on { border-color: #ffd23f; background: #2b3550; box-shadow: 0 0 0 2px #07090d, 0 0 14px rgba(255,210,63,0.45); }
            .pm-item canvas { image-rendering: pixelated; pointer-events: none; }
            .pm-item .n { position: absolute; right: 4px; bottom: 2px; font-size: 13px; font-weight: 700; color: #ffe27a; text-shadow: 1px 1px 0 #000; }
            .pm-info { width: 330px; gap: 12px; } .pm-info .body { padding: 12px 14px; font-size: 14px; line-height: 1.5; flex: 1; overflow: auto; }
            .pm-info h4 { font-size: 18px; color: #ffe27a; margin-bottom: 6px; }
            .pm-btns { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
            .pm-btn { padding: 8px 14px; font-size: 14px; font-weight: 700; color: #eef1f7; background: #1a2232; cursor: pointer; border: 3px solid #07090d; box-shadow: inset 0 0 0 2px #3a4560; }
            .pm-btn:hover { background: #26324a; color: #6dff8a; }
            .pm-stats { padding: 10px 14px; font-size: 13px; line-height: 1.6; }
            .pm-stats span { color: #ffd23f; }
            .pm-stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); grid-auto-rows: max-content; gap: 14px; padding: 6px; align-content: start; overflow-y: auto; overflow-x: hidden; width: 100%; max-height: 100%; min-height: 0; }
            .pm-stat-grid > .px { flex: none; overflow: visible; }
            .pm-stat-grid .px .body { padding: 12px 16px 14px; display: flex; flex-direction: column; gap: 9px; }
            .pm-stat-grid .sr { display: flex; justify-content: space-between; gap: 10px; font-size: 15px; color: #cfd7ea; } .pm-stat-grid .sr b { color: #ffe27a; font-weight: 700; }
            .pm-stat-grid .sb { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: #aab3c8; }
            .pm-stat-grid .sb i { display: block; height: 12px; border-radius: 6px; background: #0a0f22; border: 2px solid #1f2a4a; overflow: hidden; }
            .pm-stat-grid .sb i s { display: block; height: 100%; border-radius: 4px; }
            .pm-stat-grid .tag { align-self: flex-start; font-size: 12px; padding: 3px 9px; border-radius: 8px; border: 1px solid currentColor; letter-spacing: 1px; }
            .pm-soon { margin: auto; text-align: center; padding: 36px 48px; max-width: 560px; }
            .pm-soon h2 { font-size: 30px; color: #ffe27a; margin-bottom: 14px; } .pm-soon p { font-size: 15px; color: #aab3c8; line-height: 1.6; }
            .pm-set { margin: auto; width: min(640px, 92%); }
            .pm-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 13px 18px; font-size: 17px; font-weight: 700; border-bottom: 2px solid #1d2433; cursor: pointer; }
            .pm-row.on { background: #1d2433; color: #ffe27a; }
            .pm-row input[type=range] { width: 240px; accent-color: #6dff8a; }
            .pm-toggle { padding: 6px 16px; min-width: 70px; text-align: center; border: 3px solid #07090d; background: #2a2f3c; box-shadow: inset 0 0 0 2px #3a4560; }
            .pm-toggle.is-on { background: #0f2a1a; color: #6dff8a; box-shadow: inset 0 0 0 2px #2f6a47; }
            .pm-keys { padding: 12px 18px; font-size: 13px; line-height: 1.7; color: #aab3c8; } .pm-keys b { color: #ffe27a; }`;
        document.head.appendChild(css);

        const root = this.root = document.createElement('div');
        root.id = 'pause';
        root.innerHTML = `
            <div class="pm-tabs"></div>
            <div class="pm-main">
              <div class="pm-page" data-page="map">
                <div class="px pm-col pm-mappanel"><div class="px-title">CIDADE DOS PRAZERES - MAPA TÁTICO</div>
                  <div class="pm-mapwrap"><canvas id="pmMap"></canvas></div>
                  <div class="pm-note">ⓘ (Saindo do menu, o GPS aparecerá no minimapa)</div></div>
                <div class="pm-col pm-side">
                  <div class="px pm-dest"><div id="pmPin"></div><div class="t" id="pmDest">SEM DESTINO<div class="d">Clique no mapa para marcar</div></div></div>
                  <div class="px pm-legend"><div class="px-title">LEGENDA</div><div class="pm-legend-list" id="pmLegend"></div></div>
                </div>
              </div>
              <div class="pm-page pm-inv" data-page="inventory">
                <div class="px pm-col" style="flex:1;min-width:0"><div class="px-title" id="pmInvTitle">MOCHILA</div><div class="pm-grid" id="pmGrid"></div></div>
                <div class="pm-col pm-info">
                  <div class="px pm-col" style="flex:1;min-height:0"><div class="px-title">ITEM</div><div class="body" id="pmInfo"></div></div>
                  <div class="px pm-stats" id="pmStats"></div>
                </div>
              </div>
              <div class="pm-page" data-page="status"><div class="pm-stat-grid" id="pmStatus"></div></div>
              <div class="pm-page" data-page="careers"><div id="pmCareers"></div></div>
              <div class="pm-page" data-page="empire"><div id="pmEmpire"></div></div>
              <div class="pm-page" data-page="guide"><div id="pmGuide"></div></div>
              <div class="pm-page" data-page="settings">
                <div class="px pm-set"><div class="px-title">CONFIGURAÇÕES</div><div id="pmSet"></div>
                  <div class="pm-keys"><b>WASD</b> mover · <b>SHIFT</b> correr · <b>ESPAÇO/CLIQUE</b> atacar · <b>E</b> assaltar (com arma)/esconder · <b>C</b> furtar · <b>V</b> pular · <b>F</b> veículo · <b>G</b> arrombar · <b>R</b> recarregar · <b>M</b> kit médico · <b>I</b> inventário · <b>O</b> carreiras · <b>ESC</b> menu · <b>1-9</b> armas</div></div>
              </div>
            </div>
            <div class="pm-hints" id="pmHints"></div>`;
        document.body.appendChild(root);

        // Abas
        const tabs = root.querySelector('.pm-tabs');
        for (const [id, label] of PauseMenu.TABS) {
            const b = document.createElement('div');
            b.className = 'pm-tab'; b.dataset.tab = id; b.textContent = label;
            b.addEventListener('click', () => this.setTab(id));
            tabs.appendChild(b);
        }
        this.$ = (id) => document.getElementById(id);

        // Mapa
        this.mapCv = this.$('pmMap');
        this.mapCtx = this.mapCv.getContext('2d');
        const cv = this.mapCv;
        cv.addEventListener('mousemove', (e) => this._mouse(e, 'move'));
        cv.addEventListener('mousedown', (e) => { if (e.button === 0) this._mouse(e, 'down'); });
        window.addEventListener('mouseup', (e) => { if (this.isOpen && e.button === 0) this._mouse(e, 'up'); });
        cv.addEventListener('contextmenu', (e) => { e.preventDefault(); this.g.clearGps(); this._refreshDest(); });
        cv.addEventListener('wheel', (e) => { e.preventDefault(); this._zoom(e.deltaY < 0 ? 1.18 : 1 / 1.18, this._cursorFromEvent(e)); }, { passive: false });
        window.addEventListener('keydown', (e) => this._onKey(e));
        window.addEventListener('resize', () => { if (this.isOpen) this._fitCanvas(); });
        this._buildLegend();
    }

    // ------------------------------------------------------------------ ícones de pixel art
    // Ícone 16×16 desenhado por código (com contorno), em <canvas> ampliado `k`×.
    icon(name, k = 2) {
        const key = name + k;
        if (this._icons[key]) return this._icons[key];
        const p = new PixelCanvas(18, 18), h = Pixel.hex, R = (x, y, w, hh, c) => p.rect(x + 1, y + 1, w, hh, h(c)), S = (x, y, c) => p.set(x + 1, y + 1, h(c));
        let big = null;
        if (name === 'hospital') { R(0, 0, 16, 16, '#8a97a8'); R(1, 1, 14, 14, '#f2f4f6'); R(7, 3, 2, 10, '#d21f26'); R(3, 7, 10, 2, '#d21f26'); }
        else if (name === 'station') {
            R(1, 0, 14, 10, '#e8ecf5'); R(2, 1, 12, 8, '#2f4a8a');
            for (let j = 0; j < 5; j++) R(2 + j, 10 + j, 12 - 2 * j, 1, j === 0 ? '#e8ecf5' : '#2f4a8a');
            R(7, 3, 2, 5, '#e6bd3f'); R(5, 5, 6, 2, '#e6bd3f'); S(7, 15, '#e8ecf5'); S(8, 15, '#e8ecf5');
        } else if (name === 'cart') {
            R(0, 1, 3, 1, '#cfd6de'); R(2, 2, 1, 7, '#cfd6de'); R(3, 4, 12, 6, '#aab4c2'); R(3, 4, 12, 1, '#e8edf3');
            for (let i = 4; i < 15; i += 3) R(i, 5, 1, 4, '#7b8696'); p.disc(5 + 1, 13 + 1, 1, h('#2a2f3a')); p.disc(12 + 1, 13 + 1, 1, h('#2a2f3a'));
        } else if (name === 'spray') {
            R(5, 5, 7, 10, '#4aa3ff'); R(5, 5, 7, 1, '#bfe0ff'); R(6, 2, 5, 3, '#cfd6de'); R(11, 3, 3, 1, '#cfd6de'); R(5, 12, 7, 3, '#2f78c8'); R(7, 8, 3, 2, '#e8f4ff');
        } else if (name === 'fuel') {
            R(2, 1, 8, 14, '#d9453a'); R(3, 2, 6, 4, '#cfe8f4'); R(2, 14, 8, 2, '#3a3f4a'); R(10, 4, 2, 7, '#cfd6de'); R(12, 8, 2, 4, '#cfd6de'); R(13, 12, 2, 2, '#e8c22c');
        } else if (name === 'boat') {
            R(0, 11, 16, 2, '#2f78c8'); R(1, 9, 14, 3, '#e8ecf5'); R(3, 12, 10, 2, '#c9d2dc'); R(7, 1, 1, 9, '#cfd6de'); R(8, 2, 6, 5, '#f2f4f6'); R(8, 6, 6, 1, '#d9453a');
        } else if (name === 'gun') {
            R(1, 4, 12, 4, '#3a3f46'); R(1, 4, 12, 1, '#7a8088'); R(3, 8, 4, 6, '#3a3f46'); R(10, 8, 2, 2, '#3a3f46'); R(12, 3, 3, 3, '#5a6068');
        } else if (name === 'home') {
            for (let j = 0; j < 6; j++) R(7 - j, 1 + j, 2 + 2 * j, 1, '#d9453a');               // telhado
            R(2, 7, 12, 8, '#e8d9b0'); R(2, 7, 12, 1, '#fff2cc'); R(2, 14, 12, 1, '#a89868');   // paredes
            R(6, 9, 4, 6, '#2f8f94'); R(9, 12, 1, 1, '#ffd23a'); R(3, 9, 2, 2, '#3a6ea8'); R(11, 9, 2, 2, '#3a6ea8');
        } else if (name === 'dumpster') {
            R(0, 4, 16, 10, '#24472f'); R(1, 5, 7, 6, '#3d7a50'); R(8, 5, 7, 6, '#3d7a50'); R(7, 7, 2, 3, '#1c2820'); R(1, 14, 3, 2, '#111318'); R(12, 14, 3, 2, '#111318');
        } else if (name === 'food') big = ItemSprites.icon('food');
        else if (name === 'pin') { /* desenhado no canvas do mapa */ }
        if (big) { const c = document.createElement('canvas'); c.width = 20; c.height = 20; const x = c.getContext('2d'), id = x.createImageData(40, 40); id.data.set(big.data); const t = document.createElement('canvas'); t.width = 40; t.height = 40; t.getContext('2d').putImageData(id, 0, 0); x.imageSmoothingEnabled = false; x.drawImage(t, 0, 0, 20, 20); c.style.width = 20 * k + 'px'; c.style.height = 20 * k + 'px'; return (this._icons[key] = c); }
        ItemSprites._outline(p);
        const c = document.createElement('canvas');
        c.width = 18; c.height = 18;
        const x = c.getContext('2d'), id = x.createImageData(18, 18);
        id.data.set(p.data); x.putImageData(id, 0, 0);
        c.style.width = 18 * k + 'px'; c.style.height = 18 * k + 'px';
        return (this._icons[key] = c);
    }

    // Ícone de item (atlas ItemSprites) recortado no que foi desenhado: { canvas, w, h }.
    itemIcon(key) {
        const ck = 'item:' + key;
        if (this._icons[ck]) return this._icons[ck];
        if (typeof WeaponArt !== 'undefined' && WeaponArt.has(key) && key !== 'none') return (this._icons[ck] = { canvas: WeaponArt.canvas(key), w: WeaponArt.W, h: WeaponArt.H });      // armas: arte realista
        const px = ItemSprites.icon(key);
        let x0 = px.w, y0 = px.h, x1 = 0, y1 = 0;
        for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) if (px.data[(y * px.w + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        const w = x1 - x0 + 1, hh = y1 - y0 + 1, c = document.createElement('canvas');
        c.width = w; c.height = hh;
        const ctx = c.getContext('2d'), id = ctx.createImageData(w, hh);
        for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const s = ((y0 + y) * px.w + x0 + x) * 4, d = (y * w + x) * 4; for (let k = 0; k < 4; k++) id.data[d + k] = px.data[s + k]; }
        ctx.putImageData(id, 0, 0);
        return (this._icons[ck] = { canvas: c, w, h: hh });
    }

    // ------------------------------------------------------------------ STATUS (personagem, facção, dinheiro, procurado, casa)
    _renderStatus() {
        const g = this.g, pl = g.player, inv = g.inventory, el = this.$('pmStatus'); if (!el) return;
        const bar = (label, v, col, note = '') => `<div class="sb"><span>${label}${note ? ` <b style="color:#8fb4ff">${note}</b>` : ''}</span><i><s style="width:${Math.max(0, Math.min(100, v))}%;background:${col}"></s></i></div>`;
        const row = (k, v) => `<div class="sr"><span>${k}</span><b>${v}</b></div>`;
        const p = pl.position, terr = Standing.territoryAt(p.x, p.z), res = Standing.isResident(Standing.territoryAt(Standing._bounds().x1 - 1, Standing._bounds().z0 + 1)), hos = Standing.hostile(Standing.territoryAt(Standing._bounds().x1 - 1, Standing._bounds().z0 + 1));
        const cv = Standing.territories[0];
        const armor = pl.armorMax > 0 ? Math.round(pl.armor / pl.armorMax * 100) : 0;
        const owned = RealEstate.list.filter((q) => RealEstate.isOwned(q)), worth = owned.reduce((s, q) => s + RealEstate.price(q), 0);
        const home = RealEstate.home;
        const panel = (title, body) => `<div class="px"><div class="px-title">${title}</div><div class="body">${body}</div></div>`;
        el.innerHTML =
            panel('PERSONAGEM', bar('VIDA', pl.hp / pl.maxHp * 100, 'linear-gradient(90deg,#ff3a8a,#4a7cff)', `${Math.round(pl.hp)}/${pl.maxHp}`) + bar('COLETE', armor, 'linear-gradient(90deg,#2a7cff,#35c8ff)', `${armor}%`)
                + row('Arma na mão', pl.weapon === 'none' ? 'Punhos' : Weapons[pl.weapon].name) + row('Kits médicos', inv.medkits) + row('Hora', g.dayNight.label))
            + panel(`FACÇÃO · ${cv.name} (${cv.sigla})`, `<span class="tag" style="color:${hos ? '#ff5a4d' : '#5ac07a'}">${res ? (hos ? 'MORADOR · HOSTIL' : 'MORADOR · NEUTRO') : 'ESTRANHO · HOSTIL'}</span>`
                + row('Patente', Missions.rankName) + row('Missões cumpridas', Standing.missionsDone || 0)
                + bar('MORAL COM O TRÁFICO', Standing.traffic, '#d65a4a', Math.round(Standing.traffic)) + bar('MORAL COM A COMUNIDADE', Standing.community, '#5ac07a', Math.round(Standing.community))
                + bar('PRESSÃO POLICIAL NA FAVELA', Standing.heat, Standing.heat >= 65 ? '#ff3a2a' : '#ff9a3a', Math.round(Standing.heat) + '%')
                + row('Operação policial', Standing.policeOp ? '<span style="color:#ff5a4d">EM ANDAMENTO</span>' : 'não') + row('Baile funk', Baile.on ? 'rolando (21h–5h)' : 'não'))
            + panel('DINHEIRO E NEGÓCIOS', row('Dinheiro sujo', brl(inv.cash)) + row('Dinheiro limpo', brl(inv.clean)) + row('Fachadas', Laundry.count) + row('Contabilidade', `nv ${Laundry.level} · perda ${Math.round(Laundry.lossRate * 100)}%`)
                + bar('RECEITA / PF', Laundry.taxHeat, '#9a7aff', Math.round(Laundry.taxHeat) + '%'))
            + panel('CASA E IMÓVEIS', row('Safe house', home ? `${home.type} (${home.region})` : 'Casa na favela') + row('Imóveis seus', owned.length) + row('Valor de mercado', brl(worth)) + (home ? row('Reforma', RealEstate.reformLevel(home) ? RealEstate.REFORMS[RealEstate.reformLevel(home)].name : 'original') : ''))
            + panel('PROCURADO', row('Nível', `${g.wanted.level}★`) + row('Situação', g.wanted.level > 0 ? 'A polícia está atrás de você' : 'Limpo'));
    }

    // ------------------------------------------------------------------ abrir / fechar
    open(tab = 'map') {
        if (this.isOpen) { this.setTab(tab); return; }
        const g = this.g;
        this.isOpen = true;
        this.root.classList.add('show');
        g.scene.physicsEnabled = false;               // a física congela (o mundo "para de verdade")
        AudioFX.pause();
        MapRenderer.drawWorld(1);
        this.setTab(tab);
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.root.classList.remove('show');
        this.g.scene.physicsEnabled = true;
        AudioFX.unpause();
        this.g.input.justPressed = {};                // teclas apertadas no menu não valem no jogo
        this.map.drag = null;
    }

    setTab(id) {
        this.tab = id;
        for (const b of this.root.querySelectorAll('.pm-tab')) b.classList.toggle('on', b.dataset.tab === id);
        for (const pg of this.root.querySelectorAll('.pm-page')) pg.classList.toggle('on', pg.dataset.page === id);
        const hint = (k, t) => `<span><b>${k}</b> ${t}</span>`;
        const common = hint('ESC', 'Voltar ao jogo') + hint('Q / E', 'Abas');
        this.$('pmHints').innerHTML = id === 'map' ? common + hint('SETAS/MOUSE', 'Mover cursor') + hint('ENTER/CLIQUE', 'Marcar GPS') + hint('X', 'Limpar GPS') + hint('+ / -', 'Zoom')
            : id === 'inventory' ? common + hint('SETAS', 'Selecionar') + hint('ENTER', 'Usar/Equipar') + hint('DEL', 'Descartar')
            : id === 'settings' ? common + hint('↑ ↓', 'Opção') + hint('← →', 'Ajustar') + hint('ENTER', 'Alternar') : common;
        if (id === 'map') {
            this._fitCanvas();
            if (!this.map.init) { const p = this.g._playerState().pos; this.map.cx = p.x; this.map.cz = p.z; this.map.init = true; }
            this._refreshDest(); this._buildLegend();
        } else if (id === 'inventory') { this._renderInventory(); }
        else if (id === 'status') this._renderStatus();
        else if (id === 'careers') { if (this.g.careers) this.g.careers.ui.render(this.$('pmCareers')); }
        else if (id === 'empire') { if (this.g.empire) (this.empireUI || (this.empireUI = new EmpireUI(this.g))).render(this.$('pmEmpire')); }
        else if (id === 'guide') { (this.guide || (this.guide = new GuideUI(this.g))).render(this.$('pmGuide')); }
        else if (id === 'settings') this._renderSettings();
    }

    _fitCanvas() {
        const wrap = this.mapCv.parentElement, w = Math.max(200, wrap.clientWidth), h = Math.max(200, wrap.clientHeight);
        if (this.mapCv.width !== w || this.mapCv.height !== h) { this.mapCv.width = w; this.mapCv.height = h; }
        const m = this.map;
        if (!m.cur.set) { m.cur.x = w / 2; m.cur.y = h / 2; m.cur.set = true; }
        const WD = Config.world;
        m.min = Math.min(w / (WD.maxX - WD.minX + 40), h / (WD.maxZ - WD.minZ + 40));        // enquadra o MUNDO inteiro
        m.scale = Math.max(m.min, Math.min(11, m.scale));
    }

    // ------------------------------------------------------------------ teclado
    _onKey(e) {
        if (!this.isOpen) return;
        const k = e.key.toLowerCase();
        if (['tab', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'backspace'].includes(k)) e.preventDefault();
        if (k === 'escape' || k === 'p') { this.close(); return; }
        const tabs = PauseMenu.TABS.map((t) => t[0]), i = tabs.indexOf(this.tab);
        if (k === 'tab') { this.setTab(tabs[(i + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length]); return; }
        if (k === 'q') { this.setTab(tabs[(i + tabs.length - 1) % tabs.length]); return; }
        if (k === 'e') { this.setTab(tabs[(i + 1) % tabs.length]); return; }
        if (this.tab === 'map') {
            if (k === 'enter' || k === ' ') this._markAtCursor();
            else if (k === 'x' || k === 'delete' || k === 'backspace') { this.g.clearGps(); this._refreshDest(); }
            else if (k === '+' || k === '=') this._zoom(1.25);
            else if (k === '-' || k === '_') this._zoom(1 / 1.25);
        } else if (this.tab === 'inventory') {
            const L = this._layout || [];
            if (!L.length) return;
            const cur = L[Math.min(this.invSel, L.length - 1)];
            const dir = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k];
            if (dir) {
                let best = null, bd = Infinity;
                for (const it of L) {
                    if (it === cur) continue;
                    const dx = (it.x + it.w / 2) - (cur.x + cur.w / 2), dy = it.y - cur.y;
                    if (dx * dir[0] + dy * dir[1] <= 0) continue;
                    const d = Math.abs(dx) * (dir[1] ? 1 : 0.3) + Math.abs(dy) * (dir[0] ? 1 : 0.3) + Math.hypot(dx, dy) * 0.2;
                    if (d < bd) { bd = d; best = it; }
                }
                if (best) { this.invSel = L.indexOf(best); this._renderInventory(); }
            } else if (k === 'enter') this._invAction('primary');
            else if (k === 'delete' || k === 'backspace') this._invAction('discard');
        } else if (this.tab === 'settings') {
            if (k === 'arrowup') this.setRow = (this.setRow + 4) % 5;
            else if (k === 'arrowdown') this.setRow = (this.setRow + 1) % 5;
            else if (k === 'arrowleft') this._setAdjust(-1);
            else if (k === 'arrowright') this._setAdjust(1);
            else if (k === 'enter' || k === ' ') this._setAdjust(0);
            this._renderSettings();
        }
    }

    // ------------------------------------------------------------------ mapa: coordenadas
    _w2s(x, z) { const m = this.map, c = this.mapCv; return [c.width / 2 + (x - m.cx) * m.scale, c.height / 2 - (z - m.cz) * m.scale]; }
    _s2w(sx, sy) { const m = this.map, c = this.mapCv; return { x: m.cx + (sx - c.width / 2) / m.scale, z: m.cz - (sy - c.height / 2) / m.scale }; }
    _cursorFromEvent(e) {
        const r = this.mapCv.getBoundingClientRect();
        return { x: (e.clientX - r.left) * (this.mapCv.width / r.width), y: (e.clientY - r.top) * (this.mapCv.height / r.height) };
    }
    _clampCenter() {
        const B = Config.world, m = this.map;
        m.cx = Math.max(B.minX, Math.min(B.maxX, m.cx));
        m.cz = Math.max(B.minZ, Math.min(B.maxZ, m.cz));
    }
    _zoom(f, at = null) {
        const m = this.map, c = at || { x: this.mapCv.width / 2, y: this.mapCv.height / 2 };
        const before = this._s2w(c.x, c.y);
        m.scale = Math.max(m.min || 1, Math.min(11, m.scale * f));
        const after = this._s2w(c.x, c.y);
        m.cx += before.x - after.x; m.cz += before.z - after.z;
        this._clampCenter();
    }

    _mouse(e, type) {
        const m = this.map, p = this._cursorFromEvent(e);
        if (type === 'move') {
            if (m.drag) {
                const dx = p.x - m.drag.x, dy = p.y - m.drag.y;
                if (Math.abs(dx) + Math.abs(dy) > 5) m.drag.moved = true;
                if (m.drag.moved) { m.cx = m.drag.cx - dx / m.scale; m.cz = m.drag.cz + dy / m.scale; this._clampCenter(); }
            }
            m.cur.x = p.x; m.cur.y = p.y;
        } else if (type === 'down') { m.drag = { x: p.x, y: p.y, cx: m.cx, cz: m.cz, moved: false }; m.cur.x = p.x; m.cur.y = p.y; }
        else if (type === 'up' && m.drag) { const was = m.drag; m.drag = null; if (!was.moved) { m.cur.x = was.x; m.cur.y = was.y; this._markAtCursor(); } }
    }

    // Lugares no mapa: POIs da cidade + esconderijos.
    pois() {
        const hide = CityGrid.hideSpots.map((s) => ({ type: 'hideout', name: 'Esconderijo', x: s.x, z: s.z }));
        return CityGrid.pois.concat(hide);
    }

    // Marca o GPS onde está o cursor (encaixa no lugar mais próximo, se houver um a < 16 px).
    _markAtCursor() {
        const m = this.map, w = this._s2w(m.cur.x, m.cur.y);
        let best = null, bd = 16 / m.scale;
        for (const p of this.pois()) {
            if (p.type === 'hideout' && m.scale < 3.5) continue;
            const d = Math.hypot(p.x - w.x, p.z - w.z);
            if (d < bd) { bd = d; best = p; }
        }
        if (!best && !CityGrid.isInside(w.x, w.z)) return;                     // fora da ilha: sem rota
        this.g.setGps(best ? best.x : w.x, best ? best.z : w.z, best ? PauseMenu.POI_TYPES[best.type].label + (best.name && best.type !== 'hideout' ? ' — ' + best.name : '') : 'Ponto marcado');
        this._refreshDest();
        AudioFX.blip(900, 0.08, 0.14);
    }

    _refreshDest() {
        const g = this.g, el = this.$('pmDest'), pin = this.$('pmPin');
        if (!pin.firstChild) { const c = document.createElement('canvas'); c.width = 40; c.height = 52; c.style.width = '40px'; c.style.height = '52px'; this._drawPin(c.getContext('2d'), 20, 48, '#4aa8ff', 1.2); pin.appendChild(c); }
        if (!g.gps) { el.innerHTML = 'SEM DESTINO<div class="d">Clique no mapa para marcar</div>'; return; }
        const len = g.gps.len, dist = len >= 1000 ? (len / 1000).toFixed(1) + ' KM' : Math.round(len) + ' M';
        el.innerHTML = `DESTINO: ${g.gps.label.toUpperCase()}<div class="d">(${dist})</div>`;
    }

    // ------------------------------------------------------------------ mapa: legenda
    _buildLegend() {
        const list = this.$('pmLegend');
        list.replaceChildren();
        const all = this.pois();
        for (const [type, T] of Object.entries(PauseMenu.POI_TYPES)) {
            const n = all.filter((p) => p.type === type).length;
            const row = document.createElement('div');
            row.className = 'lg' + (n ? '' : ' off') + (this.sel && this.sel.type === type ? ' on' : '');
            row.appendChild(this.icon(T.icon, 2).cloneNode(true));
            const c = row.firstChild; const src = this.icon(T.icon, 2); c.getContext('2d').drawImage(src, 0, 0);
            row.append(document.createTextNode(T.label));
            const s = document.createElement('small'); s.textContent = n ? n : 'em breve'; row.appendChild(s);
            row.addEventListener('click', () => this._focusType(type));
            list.appendChild(row);
        }
    }

    // Clique na legenda: centra no próximo lugar daquele tipo (cada clique vai para o seguinte) e põe o cursor nele.
    _focusType(type) {
        const list = this.pois().filter((p) => p.type === type);
        if (!list.length) { this.g._flash(`${PauseMenu.POI_TYPES[type].label}: nenhum no mapa ainda`); return; }
        const i = (this._legendIdx[type] = ((this._legendIdx[type] ?? -1) + 1) % list.length), p = list[i];
        this.sel = p;
        const m = this.map;
        m.cx = p.x; m.cz = p.z;
        if (type === 'hideout') m.scale = Math.max(m.scale, 5);
        this._clampCenter();
        m.cur.x = this.mapCv.width / 2; m.cur.y = this.mapCv.height / 2;
        this._buildLegend();
    }

    // ------------------------------------------------------------------ mapa: desenho
    _drawPin(ctx, x, y, fill, k = 1) {
        ctx.save();
        ctx.translate(x, y); ctx.scale(k, k);
        ctx.lineWidth = 3; ctx.strokeStyle = '#07090d'; ctx.fillStyle = fill;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-15, -17, -15, -40, 0, -40); ctx.bezierCurveTo(15, -40, 15, -17, 0, 0);
        ctx.stroke(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-4, -30, 4, 7, -0.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0d1520'; ctx.beginPath(); ctx.arc(0, -27, 6.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(0, 1, 11, 4, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
    }

    _label(ctx, text, x, y, size = 15) {
        ctx.font = `700 ${size}px "Arial Narrow", "Roboto Condensed", Arial, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(8,10,16,0.92)'; ctx.strokeText(text, x, y);
        ctx.fillStyle = '#ffffff'; ctx.fillText(text, x, y);
    }

    _drawMap() {
        const g = this.g, c = this.mapCv, ctx = this.mapCtx, m = this.map, W = c.width, H = c.height;
        MapRenderer.drawView(ctx, W, H, m.cx, m.cz, m.scale, { labels: true });          // mundo raster + ruas/prédios vetoriais, em qualquer zoom
        ctx.imageSmoothingEnabled = false;
        // Nomes das regiões (só com o mapa afastado; de perto aparecem os nomes das ruas).
        if (m.scale < 2.4) {
            const a = Math.min(1, (2.4 - m.scale) / 0.8), size = Math.max(11, Math.min(22, 7 + m.scale * 26));
            ctx.save(); ctx.globalAlpha = a;
            for (const r of WorldMap.regions) { const [rx, ry] = this._w2s(r.x, r.z); if (rx > -80 && ry > -30 && rx < W + 80 && ry < H + 30) this._label(ctx, r.name, rx, ry, size * r.size); }
            ctx.restore();
        }
        const on = (x, y, pad = 40) => x > -pad && y > -pad && x < W + pad && y < H + pad;
        const ik = Math.max(1.3, Math.min(2.6, m.scale / 3));                     // tamanho dos ícones acompanha o zoom

        // Lugares (hospital, delegacia, lojas…) e, bem de perto, os esconderijos.
        for (const p of this.pois()) {
            if (p.type === 'hideout' && m.scale < 3.5) continue;
            const [x, y] = this._w2s(p.x, p.z);
            if (!on(x, y)) continue;
            const T = PauseMenu.POI_TYPES[p.type], src = this.icon(T.icon, 1), k = p.type === 'hideout' ? ik * 0.55 : ik;
            const w = src.width * k, hh = src.height * k;
            ctx.drawImage(src, x - w / 2, y - hh / 2, w, hh);
            if (this.sel === p) { ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3; ctx.strokeRect(x - w / 2 - 4, y - hh / 2 - 4, w + 8, hh + 8); }
        }

        // Barricadas em chamas (laranja) durante a operação.
        if (g.barricades) for (const b of g.barricades.list) { const [x, y] = this._w2s(b.x, b.z); if (!on(x, y)) continue; ctx.fillStyle = '#2a1a10'; ctx.fillRect(x - 9, y - 5, 18, 10); ctx.fillStyle = '#ff8a2a'; ctx.fillRect(x - 7, y - 3, 14, 6); ctx.fillStyle = '#ffd23f'; ctx.fillRect(x - 3, y - 2, 6, 4); }

        // Polícia (azul), como no minimapa.
        if (g.policeManager) {
            for (const u of g.policeManager.units) {
                const [x, y] = this._w2s(u.position.x, u.position.z);
                if (!on(x, y)) continue;
                ctx.fillStyle = '#e8ecf5'; ctx.fillRect(x - 7, y - 5, 14, 10);
                ctx.fillStyle = '#2f55b0'; ctx.fillRect(x - 6, y - 4, 12, 8);
                ctx.fillStyle = '#d23030'; ctx.fillRect(x - 5, y - 3, 4, 3); ctx.fillStyle = '#4aa8ff'; ctx.fillRect(x + 1, y - 3, 4, 3);
            }
        }

        // Rota do GPS: tracejado amarelo e azul (por cima das ruas).
        if (g.gps && g.gps.route && g.gps.route.length > 1) {
            const P = g.gps.route.map((q) => this._w2s(q.x, q.z));
            const path = () => { ctx.beginPath(); P.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); };
            ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
            ctx.setLineDash([]); ctx.strokeStyle = 'rgba(7,9,13,0.9)'; ctx.lineWidth = 9; path(); ctx.stroke();
            ctx.setLineDash([14, 14]); ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 5; path(); ctx.stroke();
            ctx.lineDashOffset = -14; ctx.strokeStyle = '#4aa8ff'; path(); ctx.stroke();
            ctx.setLineDash([]); ctx.lineDashOffset = 0;
            const [dx, dy] = this._w2s(g.gps.x, g.gps.z);
            if (on(dx, dy, 80)) { this._drawPin(ctx, dx, dy, '#4aa8ff', 1.1); this._label(ctx, 'DESTINO', dx + 52, dy - 24, 17); }
        }

        // Jogador: alfinete verde e nome.
        const pp = g._playerState().pos, [px, py] = this._w2s(pp.x, pp.z);
        if (on(px, py, 80)) {
            this._drawPin(ctx, px, py, '#37d65a', 1.1);
            this._label(ctx, 'PLAYER', px, py + 17, 17);
        }

        // Dica do lugar sob o cursor.
        const cw = this._s2w(m.cur.x, m.cur.y);
        let hover = null, hd = 14 / m.scale;
        for (const p of this.pois()) { if (p.type === 'hideout' && m.scale < 3.5) continue; const d = Math.hypot(p.x - cw.x, p.z - cw.z); if (d < hd) { hd = d; hover = p; } }
        if (hover) { const [hx, hy] = this._w2s(hover.x, hover.z); this._label(ctx, hover.type === 'hideout' ? 'Esconderijo' : hover.name, hx, hy - 30 * ik / 2 - 14, 16); }

        // Cursor em pixel art (seta).
        ctx.save();
        ctx.translate(m.cur.x, m.cur.y);
        ctx.lineJoin = 'miter'; ctx.lineWidth = 3; ctx.strokeStyle = '#07090d'; ctx.fillStyle = '#f4f6fa';
        ctx.beginPath(); [[0, 0], [0, 22], [5, 17], [9, 26], [13, 24], [9, 16], [16, 16]].forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath();
        ctx.stroke(); ctx.fill();
        ctx.restore();
    }

    // ------------------------------------------------------------------ inventário
    _renderInventory() {
        const inv = this.g.inventory, grid = this.$('pmGrid'), CELL = 84, GAP = 4;
        const C = Inventory.COLS, R = Inventory.ROWS;
        this._layout = inv.layout();
        this.invSel = Math.max(0, Math.min(this.invSel, this._layout.length - 1));
        this.$('pmInvTitle').textContent = `MOCHILA  ${inv.slotsUsed()}/${Inventory.CAPACITY}`;
        grid.style.width = C * CELL + (C - 1) * GAP + 'px';
        grid.style.height = R * CELL + (R - 1) * GAP + 'px';
        grid.replaceChildren();
        for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
            const d = document.createElement('div');
            d.className = 'pm-cell';
            d.style.cssText = `left:${x * (CELL + GAP)}px;top:${y * (CELL + GAP)}px;width:${CELL}px;height:${CELL}px`;
            grid.appendChild(d);
        }
        this._layout.forEach((it, i) => {
            const d = document.createElement('div');
            d.className = 'pm-item' + (i === this.invSel ? ' on' : '');
            const w = it.w * CELL + (it.w - 1) * GAP;
            d.style.cssText = `left:${it.x * (CELL + GAP)}px;top:${it.y * (CELL + GAP)}px;width:${w}px;height:${CELL}px`;
            const ic = this.itemIcon(it.key === 'carkey' ? 'carkey' : (it.kind === 'ammo' ? 'ammo_pistol' : it.key));
            const k = Math.max(1, Math.min(4, Math.floor(Math.min((w - 14) / ic.w, (CELL - 14) / ic.h))));
            const cv = ic.canvas.cloneNode(); cv.getContext('2d').drawImage(ic.canvas, 0, 0);
            cv.style.width = ic.w * k + 'px'; cv.style.height = ic.h * k + 'px';
            d.appendChild(cv);
            const n = document.createElement('div'); n.className = 'n';
            n.textContent = it.kind === 'weapon' ? (Weapons[it.key].gun ? `${inv.mag(it.key)}` : '') : 'x' + it.count;
            d.appendChild(n);
            d.addEventListener('click', () => { this.invSel = i; this._renderInventory(); });
            grid.appendChild(d);
        });
        this._renderInfo();
        const g = this.g, pl = g.player;
        this.$('pmStats').innerHTML = `DINHEIRO <span>${brl(inv.cash)}</span><br>VIDA <span>${Math.round(pl.hp)}/${pl.maxHp}</span>${pl.armorMax > 0 ? `<br>COLETE <span>${Math.round(pl.armor)}/${pl.armorMax} (NÍVEL ${pl.armorMax >= 100 ? 2 : 1})</span>` : ''}<br>ARMA <span>${pl.weapon === 'none' ? 'PUNHOS' : Weapons[pl.weapon].name}</span>`;
    }

    _renderInfo() {
        const el = this.$('pmInfo'), it = this._layout[this.invSel], inv = this.g.inventory;
        if (!it) { el.innerHTML = '<h4>MOCHILA VAZIA</h4>Pegue itens pela cidade.'; return; }
        let desc = '', btns = [];
        if (it.kind === 'weapon') {
            const W = Weapons[it.key], eq = this.g.player.weapon === it.key;
            desc = W.gun ? `Dano ${W.dmg}${W.pellets > 1 ? ' ×' + W.pellets : ''}<br>Alcance ${W.range} · ${W.auto ? 'Automática' : 'Tiro a tiro'}<br>Carregador ${inv.mag(it.key)}/${inv.magOf(it.key)} · reserva ${inv.reserve(it.key)}` : `Dano ${W.dmg} · corpo a corpo`;
            btns = [[eq ? 'EM USO' : 'EQUIPAR', 'primary'], ['DESCARTAR', 'discard']];
        } else if (it.kind === 'ammo') { desc = `Munição de ${Weapons[it.key].name}<br>${it.count} balas na mochila.`; btns = [['DESCARTAR', 'discard']]; }
        else if (it.kind === 'medkit') { desc = `Recupera 55 de vida.<br>${it.count} no estoque (M também usa).`; btns = [['USAR', 'primary'], ['DESCARTAR', 'discard']]; }
        else if (it.kind === 'hack') { desc = 'Abre uma fechadura de carro sozinho, sem mini-game (tecla G).'; btns = [['DESCARTAR', 'discard']]; }
        else if (it.kind === 'food' || it.kind === 'water') { desc = `Recupera ${Inventory.HEAL[it.kind]} de vida.<br>${it.count} aqui · guarde o resto na geladeira de casa.`; btns = [[it.kind === 'food' ? 'COMER' : 'BEBER', 'primary'], ['DESCARTAR', 'discard']]; }
        else if (it.kind === 'jewel') { desc = `Peças de joalheria (~${brl(Math.round(inv.jewelValue))} no total).<br>Guarde no cofre de casa ou venda lá.`; btns = [['DESCARTAR', 'discard']]; }
        else { desc = 'Destranca um carro estacionado sem alarme (tecla F).'; btns = [['DESCARTAR', 'discard']]; }
        el.innerHTML = `<h4>${it.label.toUpperCase()}${it.count > 1 && it.kind !== 'ammo' ? ' ×' + it.count : ''}</h4>${desc}<div class="pm-btns"></div>`;
        const box = el.querySelector('.pm-btns');
        for (const [label, act] of btns) { const b = document.createElement('div'); b.className = 'pm-btn'; b.textContent = label; b.addEventListener('click', () => this._invAction(act)); box.appendChild(b); }
    }

    _invAction(act) {
        const it = this._layout && this._layout[this.invSel];
        if (!it) return;
        const g = this.g, inv = g.inventory, pl = g.player;
        if (act === 'primary') {
            if (it.kind === 'weapon') { if (!pl.equip(it.key)) { pl.weapon = it.key; pl.aimTimer = 0; } g.reloading = 0; g._flash(`Arma: ${Weapons[it.key].name}`); }
            else if (it.kind === 'medkit') g._useMedkit();
            else if (it.kind === 'food' || it.kind === 'water') g._eat(it.kind);
        } else if (act === 'discard') {
            if (it.kind === 'weapon') { const w = inv.weapons[it.key]; w.owned = false; w.mag = 0; w.reserve = 0; if (pl.weapon === it.key) pl.weapon = 'none'; }
            else if (it.kind === 'ammo') inv.weapons[it.key].reserve = 0;
            else if (it.kind === 'medkit') inv.medkits = Math.max(0, inv.medkits - 1);
            else if (it.kind === 'hack') inv.hacks = Math.max(0, inv.hacks - 1);
            else if (it.kind === 'food' || it.kind === 'water') inv[it.kind] = Math.max(0, inv[it.kind] - 1);
            else if (it.kind === 'jewel') { const avg = inv.jewelValue / Math.max(1, inv.jewels); inv.jewels = Math.max(0, inv.jewels - 1); inv.jewelValue = Math.max(0, inv.jewelValue - avg); }
            else inv.keys = Math.max(0, inv.keys - 1);
            g._flash(`Descartou: ${it.label}`);
        }
        this._renderInventory();
    }

    // ------------------------------------------------------------------ configurações
    _setAdjust(d) {
        const s = this.settings;
        if (this.setRow === 0) s.volume = Math.max(0, Math.min(1, Math.round((s.volume + d * 0.1) * 10) / 10));
        else if (d === 0 || true) { const k = ['volume', 'sfx', 'minimap', 'prompts', 'dev'][this.setRow]; if (this.setRow > 0) s[k] = d === 0 ? !s[k] : d > 0; }
        this._saveSettings(); this.applySettings();
    }

    _renderSettings() {
        const s = this.settings, el = this.$('pmSet');
        const tog = (v) => `<div class="pm-toggle ${v ? 'is-on' : ''}">${v ? 'LIGADO' : 'DESLIG.'}</div>`;
        const rows = [
            ['VOLUME GERAL', `<input type="range" min="0" max="100" value="${Math.round(s.volume * 100)}" id="pmVol"><span>${Math.round(s.volume * 100)}%</span>`],
            ['EFEITOS SONOROS', tog(s.sfx)], ['MINIMAPA', tog(s.minimap)], ['DICAS NA TELA (F / G / E / V)', tog(s.prompts)], ['MODO DEV (FERRAMENTAS DE TESTE) · TECLA ', tog(s.dev)],
        ];
        el.innerHTML = rows.map((r, i) => `<div class="pm-row ${i === this.setRow ? 'on' : ''}" data-i="${i}"><span>${r[0]}</span><span style="display:flex;gap:12px;align-items:center">${r[1]}</span></div>`).join('');
        el.querySelectorAll('.pm-row').forEach((row) => row.addEventListener('click', (e) => {
            this.setRow = +row.dataset.i;
            if (this.setRow > 0) this._setAdjust(0);
            this._renderSettings();
        }));
        const vol = this.$('pmVol');
        if (vol) vol.addEventListener('input', () => { s.volume = vol.value / 100; this._saveSettings(); this.applySettings(); vol.nextSibling.textContent = vol.value + '%'; });
    }

    // ------------------------------------------------------------------ por frame (o jogo está pausado)
    update(dt) {
        const inp = this.g.input, m = this.map;
        this._pad(dt);
        if (this.tab === 'map') {
            // Cursor pelo teclado: setas/WASD movem; perto da borda o mapa rola.
            const ax = (inp.keys['arrowright'] || inp.keys['d'] ? 1 : 0) - (inp.keys['arrowleft'] || inp.keys['a'] ? 1 : 0);
            const az = (inp.keys['arrowdown'] || inp.keys['s'] ? 1 : 0) - (inp.keys['arrowup'] || inp.keys['w'] ? 1 : 0);
            if (ax || az) this._moveCursor(ax, az, dt);
            this._drawMap();
            if (Standing.policeOp) this._opBanner();
        } else if (this.tab === 'status') { this._stT = (this._stT || 0) - dt; if (this._stT <= 0) { this._stT = 0.5; this._renderStatus(); } }
    }

    // Faixa piscando no topo do mapa durante a operação policial na favela.
    _opBanner() {
        const ctx = this.mapCtx, W = this.mapCv.width, on = Math.floor(performance.now() / 380) % 2 === 0, h = Math.max(26, Math.min(40, W / 22));
        ctx.save();
        ctx.fillStyle = on ? 'rgba(200,24,24,0.88)' : 'rgba(110,10,10,0.88)'; ctx.fillRect(0, 0, W, h);
        ctx.fillStyle = '#ffe9a8'; for (let x = (on ? 0 : 14); x < W; x += 28) ctx.fillRect(x, h - 5, 14, 5);       // listra de aviso
        ctx.font = `800 ${Math.round(h * 0.55)}px "Arial Narrow", "Roboto Condensed", Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff'; ctx.fillText('🚨 OPERAÇÃO POLICIAL EM ANDAMENTO — ÁREA DE RISCO 🚨', W / 2, h / 2 - 2);
        ctx.restore();
    }

    _moveCursor(ax, az, dt) {
        const m = this.map, c = this.mapCv, sp = 520 * dt;
        m.cur.x = Math.max(0, Math.min(c.width, m.cur.x + ax * sp)); m.cur.y = Math.max(0, Math.min(c.height, m.cur.y + az * sp));
        const edge = 70, pan = (360 * dt) / m.scale;
        if (m.cur.x < edge) m.cx -= pan; if (m.cur.x > c.width - edge) m.cx += pan;
        if (m.cur.y < edge) m.cz += pan; if (m.cur.y > c.height - edge) m.cz -= pan;
        this._clampCenter();
    }

    // Controle: B/Start fecha, LB/RB abas, A/Y marca o GPS, direcional/analógico move o cursor.
    _pad(dt) {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [], p = [...pads].find((x) => x);
        if (!p) { this._padPrev = null; return; }
        const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed), prev = this._padPrev || [];
        const edge = (i) => b(i) && !prev[i];
        const tabs = PauseMenu.TABS.map((t) => t[0]), i = tabs.indexOf(this.tab);
        if (edge(1) || edge(9)) { this._padPrev = Array.from(p.buttons, (x) => x.pressed); this.close(); return; }
        if (edge(4)) this.setTab(tabs[(i + tabs.length - 1) % tabs.length]);
        if (edge(5)) this.setTab(tabs[(i + 1) % tabs.length]);
        if (this.tab === 'map') {
            if (edge(0) || edge(3)) this._markAtCursor();
            const ax = (b(15) ? 1 : 0) - (b(14) ? 1 : 0) || (Math.abs(p.axes[0]) > 0.3 ? p.axes[0] : 0), az = (b(13) ? 1 : 0) - (b(12) ? 1 : 0) || (Math.abs(p.axes[1]) > 0.3 ? p.axes[1] : 0);
            if (ax || az) this._moveCursor(ax, az, dt);
        }
        this._padPrev = Array.from(p.buttons, (x) => x.pressed);
    }
}
