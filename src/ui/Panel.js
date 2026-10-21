// ============================================================================
// Panel — janela modal genérica das telas novas (oficina, capô, porta-malas, quadro do golpe, cerco da loja…), no mesmo visual das
// janelas da loja e do baú (ui/Theme.js). Cada tela cria um Panel com um id e preenche o corpo com HTML; cliques em [data-act] viram
// onAct(ação, argumento). ESC (ou E/Backspace) fecha. Enquanto alguma janela está aberta o jogo trata como janela modal (personagem
// parado, sem pausar, controle navega nela): Game consulta Panel.anyOpen() / Panel.anyCool().
// ============================================================================

class Panel {
    constructor(id, { width = 760, onAct = null, onClose = null, closable = true } = {}) {
        Panel._css();
        this.id = id; this.open = false; this.cool = 0; this.onAct = onAct; this.onClose = onClose; this.closable = closable;
        const r = this.root = document.createElement('div');
        r.id = id; r.className = 'dm-modal';
        r.innerHTML = `<div class="dm-pp" style="width:min(${width}px,96vw)"><div class="mx-wrap"><button type="button" class="mx-close" aria-label="Fechar">✕</button></div><h3></h3><div class="sub"></div><div class="dm-body"></div><div class="msg"></div></div>`;
        document.body.appendChild(r);
        this.$x = r.querySelector('.mx-wrap');
        r.querySelector('.mx-close').addEventListener('click', (e) => { e.stopPropagation(); if (this.closable) this.close(); });
        this.$h = r.querySelector('h3'); this.$sub = r.querySelector('.sub'); this.$body = r.querySelector('.dm-body'); this.$msg = r.querySelector('.msg');
        r.addEventListener('mousedown', (e) => { if (e.target === r && this.closable) this.close(); });
        r.addEventListener('click', (e) => {
            const b = e.target.closest('[data-act]');
            if (!b || b.disabled || b.classList.contains('off')) return;
            AudioFX.blip(620, 0.06, 0.1);
            if (this.onAct) this.onAct(b.dataset.act, b.dataset.arg, b);
        });
        window.addEventListener('keydown', (e) => {
            if (!this.open) return;
            const k = e.key;
            if (k === 'Escape' || k === 'Backspace' || ((k === 'e' || k === 'E') && this.closable)) { e.preventDefault(); e.stopPropagation(); if (this.closable) this.close(); }
        });
        Panel.all.push(this);
    }

    show(title, sub, body) {
        this.$h.textContent = title; this.$sub.innerHTML = sub || ''; this.$body.innerHTML = body || '';
        if (!this.open) { this.msg(''); AudioFX.blip(540, 0.1, 0.14); }
        this.$x.style.display = this.closable ? '' : 'none';
        this.open = true; this.root.style.display = 'flex';
        const g = window.game; if (g && g.input && g.input.releaseVirtual) g.input.releaseVirtual('pad');
    }
    set(body) { this.$body.innerHTML = body; }
    close() {
        if (!this.open) return;
        this.open = false; this.cool = 0.35; this.root.style.display = 'none';
        AudioFX.blip(360, 0.1, 0.12);
        if (this.onClose) this.onClose();
    }
    msg(t, good = true) { this.$msg.textContent = t || ''; this.$msg.style.color = good ? '#8be08b' : '#ff9a8a'; }

    static tick(dt) { for (const p of Panel.all) if (p.cool > 0) p.cool -= dt; }
    static anyOpen() { return Panel.all.some((p) => p.open); }
    static anyCool() { return Panel.all.some((p) => p.cool > 0); }

    // Pedacinhos de HTML reaproveitados pelas telas.
    static btn(act, label, { arg = '', on = true, pri = false, title = '' } = {}) {
        return `<button class="btn${pri ? ' pri' : ''}" data-act="${act}" data-arg="${arg}"${on ? '' : ' disabled'}${title ? ` title="${title}"` : ''}>${label}</button>`;
    }
    static bar(frac, col = 'var(--acc)') { return `<i class="dm-bar"><s style="width:${Math.round(Math.max(0, Math.min(1, frac || 0)) * 100)}%;background:${col}"></s></i>`; }
    static kv(k, v) { return `<div class="dm-kv"><span>${k}</span><b>${v}</b></div>`; }

    static _css() {
        if (Panel._styled) return;
        Panel._styled = true;
        const st = document.createElement('style');
        st.textContent = `
            .dm-modal { position: fixed; inset: 0; z-index: 42; display: none; align-items: center; justify-content: center; background: rgba(5,7,12,0.55);
                -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); font-family: var(--font); color: var(--tx); }
            html.no-blur .dm-modal { background: rgba(5,7,12,0.72) !important; }
            .dm-modal .dm-pp { max-height: 92vh; overflow-y: auto; display: flex; flex-direction: column; background: var(--glass-2); border: 1px solid var(--line-2); border-radius: 22px;
                box-shadow: var(--shadow); padding: 20px 22px; -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); animation: modalIn .18s ease-out; box-sizing: border-box; }
            .dm-modal h3 { margin: 0 0 4px; font: 700 22px var(--font-d); color: var(--tx); text-align: center; }
            .dm-modal .sub { font-size: 13px; color: var(--tx-2); text-align: center; margin-bottom: 12px; line-height: 1.55; }
            .dm-modal .msg { min-height: 16px; font-size: 13px; font-weight: 600; text-align: center; margin-top: 10px; }
            .dm-modal .btn { font: 600 13px var(--font); color: var(--tx); background: var(--card-h); border: 1px solid var(--line-2); border-radius: var(--r-3); padding: 8px 12px;
                cursor: pointer; white-space: nowrap; transition: background .15s; }
            .dm-modal .btn:hover:not([disabled]) { background: rgba(255,255,255,0.16); }
            .dm-modal .btn.pri { background: var(--acc); color: #04130c; border-color: transparent; } .dm-modal .btn.pri:hover:not([disabled]) { background: #5cf0b5; }
            .dm-modal .btn.red { border-color: rgba(251,113,133,0.55); background: rgba(244,63,94,0.14); }
            .dm-modal .btn[disabled] { opacity: .4; cursor: not-allowed; }
            .dm-modal .dm-body { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
            .dm-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
            .dm-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-2); padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
            .dm-card.on { border-color: var(--gold); background: rgba(251,191,36,0.07); } .dm-card.bad { border-color: rgba(244,63,94,0.5); }
            .dm-card h4 { margin: 0; font: 700 14px var(--font-d); display: flex; justify-content: space-between; gap: 8px; } .dm-card h4 small { color: var(--tx-3); font: 600 11px var(--font); }
            .dm-card p { margin: 0; color: var(--tx-2); font-size: 12px; line-height: 1.45; }
            .dm-btns { display: flex; gap: 6px; flex-wrap: wrap; }
            .dm-kv { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; color: var(--tx-2); } .dm-kv b { color: var(--tx); text-align: right; }
            .dm-bar { display: block; height: 8px; border-radius: 99px; background: rgba(255,255,255,0.08); overflow: hidden; } .dm-bar s { display: block; height: 100%; border-radius: 99px; }
            .dm-sec { font: 700 11px var(--font); letter-spacing: .1em; text-transform: uppercase; color: var(--tx-3); margin-top: 4px; }
            .dm-note { font-size: 12px; color: var(--tx-3); line-height: 1.5; margin: 0; }
            .dm-tag { display: inline-block; padding: 2px 8px; border-radius: 99px; font: 700 11px var(--font); background: var(--card-h); color: var(--tx-2); }
            .dm-tag.g { color: #86efac; background: rgba(52,211,153,0.14); } .dm-tag.r { color: #fda4af; background: rgba(244,63,94,0.14); } .dm-tag.y { color: #fde68a; background: rgba(251,191,36,0.14); }
            .dm-row { display: flex; align-items: center; gap: 10px; padding: 7px 4px; border-bottom: 1px solid var(--line); font-size: 13px; }
            .dm-row .t { flex: 1; min-width: 0; } .dm-row .t small { display: block; color: var(--tx-3); font-size: 11px; margin-top: 1px; line-height: 1.35; }
            .dm-row .ic { width: 26px; text-align: center; font-family: var(--emoji); font-size: 18px; flex: none; }
            .dm-grid.mc-grid { grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; } .mc-grid .dm-card { padding: 8px 10px; gap: 5px; } .mc-grid .dm-card h4 { font-size: 13px; } .mc-grid .dm-card .btn { padding: 5px 9px; font-size: 12px; }
            @media (max-width: 640px) { .dm-modal .dm-pp { padding: 14px 12px; } .dm-grid { grid-template-columns: 1fr; } .dm-grid.mc-grid { grid-template-columns: 1fr 1fr; } }`;
        document.head.appendChild(st);
    }
}
Panel.all = [];
