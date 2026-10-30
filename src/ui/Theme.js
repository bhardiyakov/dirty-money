// ============================================================================
// Theme — o visual da interface: moderno, em alta resolução (HD), com fontes vetoriais e ícones próprios do jogo.
//   • Tokens de cor/raio/sombra em :root (todas as telas usam var(--…)).
//   • Fontes: Inter (texto), Outfit (títulos e números) e DM Icons (assets/ui/dm-icons.woff2 — tools/ui_icons): a fonte de ícones do
//     jogo, um desenho próprio (adesivo com contorno escuro, faixas de sombra e luz) para cada emoji que a interface usa. Ela vem
//     PRIMEIRO nas pilhas: todo emoji de texto, HTML ou canvas sai com o desenho do jogo, sem mudar os textos (o que ela não tem cai
//     no emoji do aparelho).
//   • Emoji.canvas(key) / Emoji.html(key): o ícone de um item, arma, lugar ou indicador em HD. Itens com emoji usam o glifo (da DM
//     Icons); as armas usam a arte pintada de WeaponArt.
// O mundo do jogo continua em pixel art; só a interface muda.
// ============================================================================

const Theme = {
    FONT: "'DM Icons', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif",
    DISPLAY: "'DM Icons', 'Outfit', 'Inter', system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif",
    EMOJI: "'DM Icons', 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif",
    ICONS_URL: 'assets/ui/dm-icons.woff2',

    install() {
        if (this._on) return;
        this._on = true;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@500;600;700;800&display=swap';
        document.head.appendChild(link);
        const st = document.createElement('style');
        st.id = 'theme';
        st.textContent = `
            @font-face { font-family: 'DM Icons'; src: url(${this.ICONS_URL}) format('woff2'); font-display: block;
                unicode-range: U+200D, U+231A-23FF, U+2600-27BF, U+2B00-2BFF, U+FE0F, U+1F000-1FAFF; }   /* (só os emojis esperam por ela) */
            :root {
                --font: ${this.FONT}; --font-d: ${this.DISPLAY}; --emoji: ${this.EMOJI};
                --glass: rgba(14, 17, 26, 0.74); --glass-2: rgba(22, 26, 38, 0.86); --solid: #10131b; --solid-2: #171b26;
                --card: rgba(255, 255, 255, 0.045); --card-h: rgba(255, 255, 255, 0.08); --card-on: rgba(255, 255, 255, 0.11);
                --line: rgba(255, 255, 255, 0.08); --line-2: rgba(255, 255, 255, 0.16);
                --tx: #f2f4f8; --tx-2: #aab1c2; --tx-3: #6f7689;
                --acc: #34d399; --acc-2: #10b981; --gold: #fbbf24; --red: #f43f5e; --orange: #fb923c; --blue: #60a5fa; --violet: #a78bfa; --cyan: #22d3ee;
                --r: 18px; --r-2: 13px; --r-3: 10px; --r-pill: 999px;
                --shadow: 0 18px 50px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.25);
                --shadow-s: 0 6px 18px rgba(0, 0, 0, 0.35);
                --blur: blur(18px) saturate(1.5);
            }
            html, body { font-family: var(--font); -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; font-feature-settings: 'cv11', 'ss01'; }
            /* Modo sem desfoque (html.no-blur): o "vidro" borrado dos painéis é refeito pela GPU a cada quadro, na resolução da TELA, por cima
               do jogo em movimento — em placa fraca custa mais que a cena 3D. Sem ele, os painéis ficam um pouco mais opacos. Liga no perfil
               leve. */
            html.no-blur { --glass: rgba(14, 17, 26, 0.9); --glass-2: rgba(20, 24, 35, 0.95); --blur: none; }
            html.no-blur *, html.no-blur *::before, html.no-blur *::after { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
            html.no-blur #endscreen { background: radial-gradient(ellipse at center, rgba(20,2,6,0.82) 20%, rgba(0,0,0,0.94) 100%) !important; }
            html.no-blur #pause { background: rgba(6, 8, 13, 0.93) !important; }
            html.no-blur :is(#shopUI, #stashUI, #propUI, #carUI, #tribunal, #motoUI) { background: rgba(5, 7, 12, 0.72) !important; }
            .emo { font-family: var(--emoji); font-style: normal; font-weight: 400; line-height: 1; display: inline-block; }
            .num { font-family: var(--font-d); font-variant-numeric: tabular-nums; }
            ::-webkit-scrollbar { width: 10px; height: 10px; }
            ::-webkit-scrollbar-track { background: transparent; }
            ::-webkit-scrollbar-corner { background: transparent; }
            ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 10px; border: 2px solid transparent; background-clip: padding-box; }
            ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.34); background-clip: padding-box; border: 2px solid transparent; }
            @supports not selector(::-webkit-scrollbar) { * { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.24) transparent; } }   /* Firefox */

            /* botão padrão de todas as telas */
            .ui-btn { font: 600 13px/1.2 var(--font); color: var(--tx); background: var(--card-h); border: 1px solid var(--line-2); border-radius: var(--r-3);
                padding: 9px 14px; cursor: pointer; transition: background .15s, border-color .15s, transform .1s; }
            .ui-btn:hover:not([disabled]) { background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.28); }
            .ui-btn:active:not([disabled]) { transform: translateY(1px); }
            .ui-btn.pri { background: linear-gradient(180deg, #3ee0a1, #10b981); color: #04130c; border-color: transparent; }
            .ui-btn.pri:hover:not([disabled]) { background: linear-gradient(180deg, #5cf0b5, #1fc98f); }
            .ui-btn.danger { background: linear-gradient(180deg, #fb6f84, #e11d48); color: #fff; border-color: transparent; }
            .ui-btn[disabled] { opacity: .4; cursor: not-allowed; }

            /* dica de interação (perto de portas, veículos, pessoas) */
            #prompt { font-family: var(--font) !important; text-transform: none !important; font-size: 15px; font-weight: 600; color: var(--tx); bottom: 92px;
                padding: 10px 18px; border: 1px solid var(--line-2) !important; border-radius: var(--r-2) !important; background: var(--glass) !important;
                -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); box-shadow: var(--shadow-s); }
            #prompt b { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; padding: 0 7px; margin-right: 8px; border-radius: 8px;
                background: var(--tx); color: #0b0e14; font: 800 14px var(--font-d); vertical-align: middle; box-shadow: 0 2px 0 rgba(0,0,0,0.35); }
            #prompt small { color: var(--tx-2); font-size: 12px; font-weight: 500; margin-top: 4px; }

            /* inventário rápido antigo (tecla I) */
            #inventory { font-family: var(--font) !important; text-transform: none !important; color: var(--tx) !important; background: var(--glass-2) !important;
                border: 1px solid var(--line-2) !important; border-radius: var(--r) !important; box-shadow: var(--shadow) !important; -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); font-size: 13px; }
            #inventory h3 { border-color: var(--line) !important; font: 700 15px var(--font-d); }
            #inventory .inv-sep { color: var(--tx-3); border-color: var(--line); }
            #inventory .inv-row.off { color: var(--tx-3); } #inventory .inv-hint { color: var(--tx-3); }

            input[type=range] { accent-color: var(--acc) !important; }

            /* sobreposições de mini-jogo e cortinas (prisão, transferências, golpes) */
            #lockpick { font-family: var(--font) !important; text-transform: none !important; color: var(--tx) !important; background: var(--glass-2) !important; border: 1px solid var(--line-2) !important;
                border-radius: var(--r) !important; box-shadow: var(--shadow) !important; -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); width: 360px !important; padding: 16px 18px !important; font-size: 13px !important; }
            #lockpick h3 { font: 700 16px var(--font-d) !important; border-color: var(--line) !important; }
            #lockpick .lp-pin { height: 22px !important; border-radius: 8px; border: 1px solid var(--line-2) !important; background: rgba(255,255,255,0.05) !important; overflow: hidden; }
            #lockpick .lp-zone { background: rgba(52,211,153,0.35) !important; border-color: var(--acc) !important; }
            #lockpick .lp-mark { background: var(--gold) !important; box-shadow: 0 0 10px var(--gold) !important; border-radius: 2px; }
            #lockpick .lp-pin.done { border-color: var(--acc) !important; background: rgba(52,211,153,0.18) !important; }
            #lockpick .lp-pin.miss { border-color: var(--red) !important; background: rgba(244,63,94,0.18) !important; }
            #lockpick .lp-hint { color: var(--tx-2) !important; }
            #lockpick.fail { border-color: var(--red) !important; color: #ffc2cc !important; }
            #lockpick.win { border-color: var(--acc) !important; }

            /* janelas modais (loja, baú, imóvel, tribunal, mototáxi) */
            #shopUI, #stashUI, #propUI, #carUI, #tribunal, #motoUI { position: fixed; inset: 0; z-index: 40; display: none; align-items: center; justify-content: center;
                background: rgba(5,7,12,0.55); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); font-family: var(--font); color: var(--tx); }
            #tribunal { z-index: 41; }
            :is(#shopUI .sp, #stashUI .sp, #propUI .pp, #carUI .pp, #tribunal .tp, #motoUI .mp) { max-height: 92vh; overflow-y: auto; display: flex; flex-direction: column; background: var(--glass-2);
                border: 1px solid var(--line-2); border-radius: 22px; box-shadow: var(--shadow); padding: 22px 24px; -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur);
                animation: modalIn .18s ease-out; }
            @keyframes modalIn { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }
            :is(#shopUI, #stashUI, #propUI, #carUI, #tribunal, #motoUI) h3 { margin: 0 0 4px; font: 700 22px var(--font-d); letter-spacing: 0; color: var(--tx); text-align: center; }
            :is(#shopUI, #stashUI, #propUI, #carUI, #tribunal, #motoUI) .sub { font-size: 13px; color: var(--tx-2); text-align: center; margin-bottom: 14px; line-height: 1.55; }
            :is(#shopUI, #stashUI, #carUI) .rows { overflow: auto; display: flex; flex-direction: column; gap: 3px; }
            :is(#shopUI, #stashUI, #carUI) .row { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: var(--r-2); border: 1px solid transparent; font-size: 14px; line-height: 1.35; font-weight: 600; }
            :is(#shopUI, #stashUI, #carUI) .row:hover { background: var(--card); }
            :is(#shopUI, #stashUI, #carUI) .row.sel { border-color: rgba(251,191,36,0.7); background: rgba(251,191,36,0.08); }
            :is(#shopUI, #stashUI, #carUI) .row.off { opacity: .45; }
            :is(#shopUI, #stashUI, #carUI) .row canvas { flex: none; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4)); }
            :is(#shopUI, #stashUI, #carUI) .row .nm { flex: 1; min-width: 0; }
            :is(#shopUI, #stashUI, #carUI) .row .nm small { display: block; color: var(--tx-3); font-size: 12px; font-weight: 500; margin-top: 2px; }
            :is(#shopUI, #stashUI, #propUI, #carUI, #tribunal, #motoUI) .btn { font: 600 13px var(--font); color: var(--tx); background: var(--card-h); border: 1px solid var(--line-2);
                border-radius: var(--r-3); padding: 8px 13px; cursor: pointer; white-space: nowrap; transition: background .15s; }
            :is(#shopUI, #stashUI, #propUI, #carUI, #tribunal, #motoUI) .btn:hover { background: rgba(255,255,255,0.16); }
            :is(#shopUI, #stashUI, #carUI) .btn.pri { background: var(--acc); color: #04130c; border-color: transparent; }
            :is(#shopUI, #stashUI, #carUI) .btn.pri:hover { background: #5cf0b5; }
            :is(#shopUI, #stashUI, #propUI, #carUI, #tribunal, #motoUI) .msg { min-height: 16px; font-size: 13px; font-weight: 600; text-align: center; margin-top: 10px; }
            :is(#shopUI, #stashUI, #carUI) .foot { margin-top: 14px; display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 12px; color: var(--tx-3); flex-wrap: wrap; }
            :is(#propUI, #tribunal, #motoUI) .opt { display: block; width: 100%; text-align: left; font: 600 14px/1.4 var(--font); background: var(--card); color: var(--tx);
                border: 1px solid var(--line-2); border-radius: var(--r-2); padding: 12px 14px; margin-top: 8px; cursor: pointer; transition: background .15s, border-color .15s; }
            :is(#propUI, #tribunal, #motoUI) .opt:hover { background: var(--card-h); }
            :is(#propUI, #tribunal, #motoUI) .opt.sel { border-color: var(--gold); background: rgba(251,191,36,0.1); }
            :is(#propUI, #tribunal, #motoUI) .opt.off { opacity: .4; cursor: not-allowed; }
            :is(#propUI, #tribunal, #motoUI) .opt small { display: block; font-size: 12px; font-weight: 500; color: var(--tx-2); margin-top: 3px; line-height: 1.5; }
        `;
        document.head.appendChild(st);
        Emoji.preload();
    },
};

// ----------------------------------------------------------------------------- ícones no estilo emoji
const Emoji = {
    // chave do item / arma / lugar / indicador → emoji
    CHAR: {
        // itens do chão e da mochila
        medkit: '🩹', water: '💧', food: '🍔', lootbox: '📦', cash_small: '💵', cash_bag: '💰', cash_case: '💼', jewels: '💎', necklace: '📿', rings: '💍',
        watch: '⌚', coins: '🪙', phone_old: '📟', phone_new: '📱', jerry: '⛽', knife: '🔪', grenade: '💣', molotov: '🍾', bat: '🏏', backpack: '🎒', wind: '💨', bag_cross: '👜', bag_pack: '🎒', bag_tactical: '🎒', pockets: '👖', hack: '💾', carkey: '🔑',
        vest: '🦺', vest2: '🦺', fists: '✋', none: '✋', bag_brief: '💼', bag_duffel: '👝', bag_suit: '🧳', briefcase: '💼', duffel: '👝', suitcase: '🧳',
        // roupas e acessórios (Outfit / boutique)
        of_chinelo: '🩴', of_tenis_corrida: '👟', of_tenis_basquete: '👟', of_coturno: '🥾', of_sapato_social: '👞', of_camiseta_branca: '👕', of_regata_academia: '🎽',
        of_camisa_time: '⚽', of_moletom_capuz: '🧥', of_jaqueta_couro: '🧥', of_colete_carga: '🦺', of_terno: '👔', of_bermuda: '🩳', of_calca_moletom: '👖', of_calca_cargo: '👖',
        of_calca_social: '👖', of_oculos_escuros: '🕶️', of_relogio_ouro: '⌚', of_luvas: '🧤', of_corrente_ouro: '📿', of_tenis_branco: '👟', of_jaqueta_laranja: '🧥', of_calca_jeans: '👖', of_calca_preta: '👖',
        of_tenis_skate: '👟', of_camiseta_estampa: '👕', of_camiseta_listrada: '👕', of_camisa_florida: '🌺', of_camisa_polo: '👕', of_bermuda_jeans: '🩳',
        of_balaclava: '🥷', of_bandana: '😷', of_bone: '🧢', of_bone_tras: '🧢', of_touca: '🧶', of_chapeu_pescador: '👒', of_viseira: '🧢', of_capacete: '⛑️',
        // comidas e bebidas das lojas (Economy.ITEMS)
        burger: '🍔', bacon: '🍔', fries: '🍟', soda: '🥤', shake: '🥤', slice: '🍕', pizza: '🍕', salad: '🥗', juice: '🧃', bowl: '🍧', pasta: '🍝', risotto: '🍚',
        menu_it: '🍽️', wine: '🍷', sushi: '🍣', omakase: '🍱', sake: '🍶', beer: '🍺', shot: '🥃', snack: '🍢', bread: '🥪', coffee: '☕', cake: '🍰', lunch: '🍱', bottle: '💧',
        // lugares do mapa (PauseMenu.POI_TYPES)
        hospital: '🏥', station: '🚓', cart: '🛒', spray: '🎨', fuel: '⛽', boat: '🚤', heli: '🚁', home: '🏠', dumpster: '🗑️', pin: '📍', chop: '🔧', wrench: '🔧', biz: '🏪', moto: '🛵', bank: '🏦', music: '🎶', gun: '🔫', gym: '🏋️', shirt: '👕', dealer: '🚗', tune: '🔩', stadium: '🏎️', race: '🏁', arena: '🏟️', cristo: '✝️', cablecar: '🚡', vila: '🏘️',
        pharmacy: '💊', bakery: '🥐', drugs: '🌿',      // (lojas que só aparecem no minimapa: Minimap.STYLE_ICON)
        // indicadores do HUD
        heart: '❤️', shield: '🛡️', cash: '💵', clean: '💳', clock: '🕒', trophy: '🏆', star: '⭐', energy: '⚡', heat: '🔥', medal: '🏅', siren: '🚨',
    },
    // armas pintadas (folha de ícones das armas: WeaponArt.square) no lugar do emoji: a mão, as armas brancas e as arremessáveis
    ART: { fists: 'fists', none: 'fists', knife: 'knife', bat: 'bat', grenade: 'grenade', molotov: 'molotov' },
    art(key) { const a = this.ART[key]; return a && typeof WeaponArt !== 'undefined' && WeaponArt.has(a) && WeaponArt.sheet ? a : null; },
    // armas de fogo: arte (WeaponArt: a pintada da folha, ou a vetorial) no lugar do emoji
    VECTOR: { pistol: 1, revolver: 1, smg: 1, shotgun: 1, rifle: 1, ak47: 1, pistol_sil: 1, rpg: 1, launcher: 1, minigun: 1, gun: 'pistol', ammo_pistol: 1, ammo_rifle: 1, ammo_rocket: 'rocket' },
    _cache: {},

    char(key) { return this.CHAR[key] || null; },

    // HTML de um ícone (span com o emoji, ou <img> com a arte vetorial).
    html(key, size = 20) {
        if (this.art(key)) return `<img src="${this.canvas(key, size * 2).toDataURL()}" style="height:${size}px;width:${size}px;vertical-align:middle" alt="">`;
        const ch = this.CHAR[key];
        if (ch && !this.VECTOR[key]) return `<span class="emo" style="font-size:${size}px">${ch}</span>`;
        const c = this.canvas(key, size * 2);
        return `<img src="${c.toDataURL()}" style="height:${size}px;width:auto;vertical-align:middle" alt="">`;
    },

    // Canvas HD (lado `px`) com o ícone; armas saem 2:1. Cache por chave+tamanho.
    canvas(key, px = 96) {
        const ck = key + '@' + px;
        if (this._cache[ck]) return this._cache[ck];
        let c;
        const v = this.VECTOR[key], a = this.art(key);
        if (a) c = WeaponArt.square(a, px);
        else if (v && typeof WeaponArt !== 'undefined') {
            if (key.startsWith('ammo') && typeof v !== 'string') c = this._ammo(px, key === 'ammo_rifle');
            else c = WeaponArt.canvas(typeof v === 'string' ? v : key);
        } else {
            c = document.createElement('canvas');
            c.width = c.height = px;
            const x = c.getContext('2d'), ch = this.CHAR[key] || '📦';
            x.textAlign = 'center'; x.textBaseline = 'middle';
            x.font = `${Math.round(px * 0.82)}px ${Theme.EMOJI}`;
            x.fillText(ch, px / 2, px * 0.54);
        }
        return (this._cache[ck] = c);
    },

    // Munição: três cartuchos de latão (vetor, mesmo estilo das armas).
    _ammo(px, rifle) {
        const W = px * 2, H = px, c = document.createElement('canvas');
        c.width = W; c.height = H;
        const x = c.getContext('2d'), n = 3, bw = W * 0.14, gap = W * 0.06, x0 = (W - (n * bw + (n - 1) * gap)) / 2;
        for (let i = 0; i < n; i++) {
            const bx = x0 + i * (bw + gap), top = H * (rifle ? 0.08 : 0.2), mid = H * (rifle ? 0.38 : 0.45), bot = H * 0.9;
            const tip = x.createLinearGradient(bx, 0, bx + bw, 0); tip.addColorStop(0, '#f6c08a'); tip.addColorStop(0.5, '#d4874a'); tip.addColorStop(1, '#8c4b22');
            x.fillStyle = tip; x.beginPath(); x.moveTo(bx, mid); x.quadraticCurveTo(bx, top, bx + bw / 2, top); x.quadraticCurveTo(bx + bw, top, bx + bw, mid); x.closePath(); x.fill();
            const brass = x.createLinearGradient(bx, 0, bx + bw, 0); brass.addColorStop(0, '#fff1b8'); brass.addColorStop(0.35, '#f2c94c'); brass.addColorStop(1, '#a87a12');
            x.fillStyle = brass; x.beginPath(); x.roundRect(bx, mid, bw, bot - mid, [2, 2, bw * 0.18, bw * 0.18]); x.fill();
            x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(bx, bot - H * 0.09, bw, H * 0.03);
        }
        return c;
    },

    // Carrega a fonte de ícones (DM Icons) antes de desenhar os ícones em canvas — o boot espera (main.js); sem ela, o emoji do aparelho.
    preload() {
        if (!document.fonts || !document.fonts.load) { this.ready = Promise.resolve(); return; }
        this.ready = document.fonts.load('32px "DM Icons"', '🚨').then(() => { this._cache = {}; }).catch(() => {});
    },
};

Theme.install();
