// ============================================================================
// PadGlyphs — mostra os botões do CONTROLE nas dicas da tela, no desenho do controle que o jogador conectou.
//   Xbox (e genéricos XInput): A B X Y · LB RB · LT RT · View/Menu      PlayStation: ✕ ○ □ △ · L1 R1 · L2 R2 · SHARE/OPTIONS
// O layout "standard" da Gamepad API é o mesmo nos dois (índice 0 = A = ✕, 1 = B = ○…); só muda o NOME/ícone do botão, que sai
// do `gamepad.id` (vendor 054c = Sony). As dicas do jogo são HTML com a tecla em <b>…</b> (ex.: "<b>F</b> entrar no carro"):
// render() troca cada tecla que tem botão equivalente (ver InputManager.poll) pelo ícone; as sem equivalente ficam como estão.
// ============================================================================

const PadGlyphs = {
    // Tecla do teclado (como aparece no <b>) -> botão "standard". Espelha o layout GTA / Watch Dogs do InputManager.poll.
    // (SHIFT só aparece nas dicas do helicóptero, onde desce com LT; a pé o sprint é L3. Furtar e arrombar dividem o ↓: o Game decide.)
    KEY_BTN: {
        'F': 'y', 'E': 'x', 'V': 'a', 'Q': 'rs', 'R': 'b', 'J': 'b', 'K': 'rb', 'G': 'down', 'C': 'down', 'M': 'up', 'L': 'down', 'H': 'l3', 'I': 'back',
        'ESPAÇO': 'rt', 'ESPAÇO/CLIQUE': 'rt', 'SHIFT': 'lt', 'ESC': 'start', 'ENTER': 'a',
        'WASD': 'ls', 'W/S': 'ls', 'A/D': 'ls', 'Q/E': 'rstick', '1-9': 'dpadlr',
    },

    LABELS: {
        xbox: { a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT', back: '⧉', start: '☰', ls: 'L', l3: 'LS', rs: 'RS', rstick: 'R', up: '↑', down: '↓', dpadlr: '← →' },
        ps:   { a: '✕', b: '○', x: '□', y: '△', lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2', back: 'SHARE', start: 'OPTIONS', ls: 'L', l3: 'L3', rs: 'R3', rstick: 'R', up: '↑', down: '↓', dpadlr: '← →' },
    },

    // Tipo do controle pelo id que o navegador informa. Chrome: "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c …)";
    // Firefox: "054c-0ce6-Wireless Controller". Tudo o que não é Sony usa o desenho do Xbox (padrão XInput no Windows).
    type(id) {
        const s = String(id || '');
        if (/xbox|xinput|045e/i.test(s)) return 'xbox';
        if (/054c|playstation|dualshock|dualsense|sony|\bps[345]\b|^wireless controller/i.test(s)) return 'ps';
        return 'xbox';
    },

    // Ícone (HTML) de um botão: 'a', 'lb', 'start'…
    glyph(btn, type = 'xbox') {
        const L = this.LABELS[type] || this.LABELS.xbox, t = L[btn];
        if (!t) return '';
        const shape = ['a', 'b', 'x', 'y'].includes(btn) ? 'face' : (['ls', 'rstick'].includes(btn) ? 'stick' : 'pill');
        this._css();
        return `<b class="padg padg-${shape} padg-${type}-${btn}">${t}</b>`;
    },

    // Troca as teclas das dicas (<b>F</b>) pelos botões do controle.
    render(html, type = 'xbox') {
        if (!html) return html;
        return html.replace(/<b>([^<]{1,16})<\/b>/g, (m, k) => {
            const btn = this.KEY_BTN[k.trim().toUpperCase()];
            return btn ? this.glyph(btn, type) : m;
        });
    },

    _css() {
        if (this._styled) return;
        this._styled = true;
        const st = document.createElement('style');
        st.textContent = `
            b.padg, #prompt b.padg, .pm-hints b.padg, .pm-keys b.padg { display: inline-flex; align-items: center; justify-content: center; vertical-align: middle;
                min-width: 26px; height: 26px; padding: 0 7px; margin-right: 8px; border-radius: 8px; background: #1a1d26; color: #f2f4f8;
                font: 800 12px/1 var(--font-d, sans-serif); letter-spacing: .02em; border: 1px solid rgba(255,255,255,.28); box-shadow: 0 2px 0 rgba(0,0,0,.45); }
            b.padg.padg-face, #prompt b.padg.padg-face { width: 26px; min-width: 26px; padding: 0; border-radius: 50%; font-size: 14px; border-width: 2px; }
            b.padg.padg-stick, #prompt b.padg.padg-stick { width: 26px; min-width: 26px; padding: 0; border-radius: 50%; background: radial-gradient(circle, #3a3f4d 0 45%, #1a1d26 47%); }
            b.padg-xbox-a { color: #6fd34a !important; } b.padg-xbox-b { color: #ff5a48 !important; }
            b.padg-xbox-x { color: #4a8cff !important; } b.padg-xbox-y { color: #ffcf2e !important; }
            b.padg-ps-a { color: #7fa8ff !important; font-size: 15px !important; } b.padg-ps-b { color: #ff5f7a !important; font-size: 17px !important; }
            b.padg-ps-x { color: #f08ad6 !important; font-size: 16px !important; } b.padg-ps-y { color: #3fd6c2 !important; font-size: 14px !important; }
            b.padg-ps-back, b.padg-ps-start { font-size: 9px !important; }
            body.mobile #prompt b.padg { min-width: 20px; height: 20px; margin-right: 5px; }
            body.mobile #prompt b.padg.padg-face, body.mobile #prompt b.padg.padg-stick { width: 20px; min-width: 20px; }`;
        document.head.appendChild(st);
    },
};
