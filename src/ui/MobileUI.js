// ============================================================================
// MobileUI — a interface responsiva (pensada para o celular deitado, mas vale em qualquer tela):
//   • ✕ EM TODA JANELA: loja, baú, imóvel, carros, celular e as telas de sinuca/truco/dominó/porrinha ganham um ✕ no canto
//     (no toque não existe ESC). Os Panel já trazem o seu (ui/Panel.js). O ✕ é "grudado" no topo (sticky): não some ao rolar.
//   • HUD ENXUTO NO CELULAR: o 📱 vai para a fileira de atalhos (⋯ · CRIME · II), os avisos de rastro (roupa, inquérito, placa…)
//     descem para baixo dela em pílulas curtas (antes ficavam por cima dos atalhos), a dica de primeira vez fica menor, o jornal da TV
//     do bar vai para baixo (no lugar das metas, que somem enquanto a TV está ligada).
//   • MENU RESUMIDO COM ACORDEÃO: no Status, Império, Negócios e Carreiras cada bloco vira um acordeão — o título com um resumo
//     de uma linha (vida, dinheiro, procurado…) e o conteúdo abre/fecha com um toque. No celular começam fechados (só o primeiro
//     aberto); o que você abre ou fecha fica lembrado. A barra de abas vira uma fileira rolável e o "✕ VOLTAR" vira um ✕ redondo.
//   • BOTÕES: alvo de toque de 40 px no celular, retorno visual ao tocar (todas as telas).
// ============================================================================

const MobileUI = {
    _t: 0, open: null,

    CLOSERS: [
        { sel: '#shopUI .sp', on: (g) => g.shopUI && g.shopUI.open, close: (g) => g.shopUI.close() },
        { sel: '#stashUI .sp', on: (g) => g.stashUI && g.stashUI.open, close: (g) => g.stashUI.close() },
        { sel: '#propUI .pp', on: (g) => g.propertyUI && g.propertyUI.open, close: (g) => g.propertyUI.close() },
        { sel: '#carUI .pp', on: (g) => g.carUI && g.carUI.open, close: (g) => g.carUI.close() },
        { sel: '#plModal .pl-box', on: () => typeof Pool !== 'undefined' && Pool.active, close: () => Pool._quit() },
        { sel: '#trModal .tr-box', on: () => typeof Truco !== 'undefined' && Truco.active, close: () => Truco._quit() },
        { sel: '#doModal .do-box', on: () => typeof Domino !== 'undefined' && Domino.active, close: () => Domino._quit() },
        { sel: '#poModal .po-box', on: () => typeof Porrinha !== 'undefined' && Porrinha.active, close: () => Porrinha._quit() },
        { sel: '#phone', on: () => typeof Phone !== 'undefined' && Phone.open, close: () => Phone.toggle(false), corner: true },
    ],

    init() {
        if (this._css) return;
        const st = this._css = document.createElement('style');
        st.textContent = `
            /* ✕ das janelas */
            .mx-wrap { position: sticky; top: 0; height: 0; z-index: 6; display: flex; justify-content: flex-end; pointer-events: none; }
            .mx-close { pointer-events: auto; width: 38px; height: 38px; margin: -8px -8px 0 0; flex: none; border-radius: 50%; border: 1px solid var(--line-2); background: rgba(14,17,26,0.85);
                color: var(--tx); font: 700 17px/1 var(--font); cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.35); }
            .mx-close:hover { background: #e11d48; border-color: transparent; color: #fff; }
            .mx-close:active { transform: scale(0.92); }
            .mx-close.corner { position: absolute; top: -10px; right: -10px; margin: 0; z-index: 2; background: #e11d48; color: #fff; border: 2px solid rgba(255,255,255,0.85); }
            /* botões: retorno ao toque em todas as telas */
            .dm-modal .btn, #shopUI button, #stashUI button, #propUI button, #carUI button, .pl-box button, .tr-box button, .do-box button, .po-box button, #pause button, .tct, .tcchip, #phone button {
                -webkit-tap-highlight-color: transparent; transition: transform .08s, background .15s, filter .15s; }
            .dm-modal .btn:active:not([disabled]), #shopUI button:active, #stashUI button:active, #propUI button:active, #carUI button:active, .pl-box button:active, .tr-box button:active,
            .do-box button:active, .po-box button:active, #pause button:active, #phone button:active { transform: scale(0.96); filter: brightness(1.12); }
            .dm-modal .btn:focus-visible, #pause button:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }

            /* acordeão do menu */
            #pause .acc-h { cursor: pointer; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
            #pause .acc-h .acc-sum { order: 2; flex: 1 1 100%; font: 600 12px var(--font); letter-spacing: 0; text-transform: none; color: var(--tx-2); display: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            #pause .acc-h .acc-chev { margin-left: auto; font-size: 12px; color: var(--tx-3); transition: transform .18s; letter-spacing: 0; }
            #pause .acc-closed .acc-h .acc-chev { transform: rotate(-90deg); }
            #pause .acc-closed .acc-h .acc-sum { display: block; }
            #pause .acc-closed > :not(.acc-h) { display: none !important; }
            #pause .acc-closed.px .px-title { padding-bottom: 12px !important; }
            #pause .acc-closed.cr-box, #pause .acc-closed.bz-box { padding-bottom: 10px !important; }

            /* ---- celular ---- */
            body.mobile .dm-modal .dm-pp { max-height: 96vh; padding: 12px 14px; border-radius: 18px; }
            body.mobile .dm-modal h3 { font-size: 18px; padding: 0 30px; }
            body.mobile .dm-modal .sub { font-size: 12px; margin-bottom: 8px; }
            body.mobile .dm-modal .btn { min-height: 40px; font-size: 14px; white-space: normal; }
            body.mobile #shopUI button, body.mobile #stashUI button, body.mobile #propUI button, body.mobile #carUI button { min-height: 38px; }
            body.mobile .pl-box button, body.mobile .tr-box button, body.mobile .do-box button, body.mobile .po-box button { min-height: 40px; }
            body.mobile #pause button { min-height: 36px; }
            /* menu: abas numa fileira rolável; ✕ redondo */
            body.mobile #pause { padding-top: max(8px, env(safe-area-inset-top)) !important; }
            body.mobile .pm-tabs { flex-wrap: nowrap !important; overflow-x: auto; max-width: calc(100vw - 72px); align-self: flex-start !important; justify-content: flex-start !important; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
            body.mobile .pm-tabs::-webkit-scrollbar { display: none; }
            body.mobile .pm-tab { flex: none; padding: 8px 12px !important; }
            body.mobile #tcBack { width: 46px; height: 46px; padding: 0; border-radius: 50%; font-size: 0; display: none; align-items: center; justify-content: center; top: max(8px, env(safe-area-inset-top)); }
            body.mobile #tcBack.on { display: flex; }
            body.mobile #tcBack::before { content: '✕'; font-size: 20px; }
            body.mobile .pm-stat-grid { grid-template-columns: 1fr !important; gap: 8px !important; }
            body.mobile .pm-stat-grid .px .body { padding: 2px 14px 12px !important; gap: 8px !important; }
            /* HUD */
            body.mobile #phoneBadge { right: auto; bottom: auto; padding: 0 12px; display: flex; align-items: center; border-radius: 99px; background: rgba(14,17,26,0.6); border: 1.5px solid rgba(255,255,255,0.2); font-size: 15px; }
            body.mobile #traceChips { font-size: 11px !important; gap: 3px !important; }
            body.mobile #traceChips > div { padding: 3px 9px !important; }
            body.mobile #hintCard { left: 8px; top: 120px; max-width: min(260px, 40vw); padding: 8px 10px; gap: 8px; font-size: 11.5px; line-height: 1.4; border-radius: 14px; }
            body.mobile #hintCard .hi { font-size: 18px; } body.mobile #hintCard .tt { font-size: 10px; }
            body.mobile #hintCard .bt { margin-top: 6px; } body.mobile #hintCard button { padding: 7px 10px; font-size: 11px; min-height: 32px; }
            body.mobile #newsTV { left: 50%; top: auto; bottom: 6px; transform: translateX(-50%); width: min(400px, 42vw); }
            body.mobile.tv-on #goalBox { display: none !important; }
            body.mobile #phone { right: 10px; height: min(640px, 92vh); }
            @media (max-height: 420px) { #phone { height: min(640px, 92vh); width: min(330px, 46vw); } }`;
        document.head.appendChild(st);
        // acordeão: um toque no título abre/fecha (delegado: o menu redesenha os blocos o tempo todo)
        try { this.open = Store.getJSON('accOpen', null) || {}; } catch (e) { this.open = {}; }
        document.addEventListener('click', (e) => {
            const h = e.target.closest('#pause .acc-h'); if (!h || e.target.closest('button,a,select,input')) return;
            const box = h.parentElement, key = box.dataset.acc;
            const closed = !box.classList.contains('acc-closed');
            box.classList.toggle('acc-closed', closed);
            this.open[key] = !closed;
            try { Store.setJSON('accOpen', this.open); } catch (e2) { /* ok */ }
        });
    },

    // A cada 0,25 s (relógio próprio: com mini-jogo aberto ou menu de pausa o laço do jogo para): o ✕ das janelas abertas e o HUD.
    start() { if (this._iv) return; this.init(); this._iv = setInterval(() => { try { const g = window.game; if (g && g.player) this.update(g); } catch (e) { /* (a interface não derruba o jogo) */ } }, 250); },
    update(g) {
        for (const C of this.CLOSERS) {
            let on = false; try { on = C.on(g); } catch (e) { on = false; }
            if (!on) continue;
            const el = document.querySelector(C.sel);
            if (el && el.getClientRects().length) this.addClose(el, () => C.close(g), C.corner);      // (offsetParent é null em position: fixed)
        }
        this._observe();
        if (typeof Hints !== 'undefined' && Hints.cur && (g.menu.isOpen || g._modalUiOpen() || (typeof Phone !== 'undefined' && Phone.open))) Hints.hide();      // (a dica não fica por cima de janela aberta)
        const mobile = document.body.classList.contains('mobile');
        document.body.classList.toggle('tv-on', !!(typeof News !== 'undefined' && News._tvShop));
        if (mobile) this._layoutHud();
    },
    addClose(el, fn, corner = false) {
        if (corner) { if (el.querySelector(':scope > .mx-close')) return; }
        else if (el.querySelector(':scope > .mx-wrap')) return;
        const b = document.createElement('button');
        b.className = 'mx-close' + (corner ? ' corner' : ''); b.type = 'button'; b.textContent = '✕'; b.setAttribute('aria-label', 'Fechar');
        b.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
        b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
        if (corner) { el.appendChild(b); return; }
        const w = document.createElement('div'); w.className = 'mx-wrap'; w.appendChild(b);
        el.insertBefore(w, el.firstChild);
    },

    // Celular: o 📱 entra na fileira dos atalhos (à esquerda do ⋯) e os avisos de rastro descem para baixo dela.
    _layoutHud() {
        const top = document.getElementById('tcTop'), r = top && top.offsetParent !== null ? top.getBoundingClientRect() : null;
        const pb = document.getElementById('phoneBadge');
        if (pb) {
            if (r && r.height) { pb.style.top = Math.round(r.top) + 'px'; pb.style.right = Math.round(window.innerWidth - r.left + 6) + 'px'; pb.style.height = Math.round(r.height) + 'px'; }
            else { pb.style.top = '8px'; pb.style.right = '200px'; pb.style.height = ''; }
        }
        const tc = document.getElementById('traceChips');
        if (tc && r && r.height) tc.style.top = Math.round(r.bottom + 6) + 'px';
    },

    // ---------------------------------------------------------------- acordeão no menu
    _observe() {
        const root = document.getElementById('pause');
        if (!root || this._mo) return;
        this._mo = new MutationObserver(() => { if (!this._q) { this._q = true; Promise.resolve().then(() => { this._q = false; this.enhance(); }); } });
        this._mo.observe(root, { childList: true, subtree: true });
        this.enhance();
    },
    enhance() {
        const mobile = document.body.classList.contains('mobile');
        const pages = ['#pmStatus', '#pmEmpire', '#pmBiz', '#pmCareers'].map((s) => document.querySelector(s)).filter(Boolean);
        for (const page of pages) {
            const boxes = page.querySelectorAll('.px, .cr-box, .bz-box');
            let i = 0;
            for (const box of boxes) {
                const h = box.querySelector(':scope > .px-title, :scope > h3'); if (!h) continue;
                const first = i++ === 0;
                if (box.dataset.acc) continue;
                const key = (page.id + ':' + h.textContent.replace(/\s+/g, ' ').trim()).slice(0, 60);
                box.dataset.acc = key;
                h.classList.add('acc-h');
                const sum = document.createElement('span'); sum.className = 'acc-sum'; sum.textContent = box.dataset.sum || this._autoSum(box, h);
                const chev = document.createElement('span'); chev.className = 'acc-chev'; chev.textContent = '▾';
                h.appendChild(chev); h.appendChild(sum);
                const st = this.open[key];
                const closed = st === undefined ? (mobile && !first) : !st;
                box.classList.toggle('acc-closed', closed);
            }
        }
    },
    // Resumo automático: os primeiros valores do bloco ("rótulo: valor").
    _autoSum(box, h) {
        const out = [];
        for (const r of box.querySelectorAll('.sr, .cr-row, .bz-kpi, .bz-row, .dm-kv')) {
            const k = r.firstElementChild, v = r.lastElementChild;
            if (!k || !v || k === v) continue;
            const t = `${k.textContent.trim()}: ${v.textContent.trim()}`;
            if (t.length > 2) out.push(t.length > 42 ? t.slice(0, 40) + '…' : t);
            if (out.length >= 3) break;
        }
        if (!out.length) for (const tr of box.querySelectorAll('tr')) {                    // tabela: "nome: valor" das primeiras linhas
            const td = tr.querySelectorAll('td'); if (td.length < 2) continue;
            out.push(`${td[0].textContent.trim()}: ${td[1].textContent.trim()}`.slice(0, 40)); if (out.length >= 2) break;
        }
        if (!out.length) { const p = box.querySelector('p, .cr-dim, .bar, .sb'); if (p) out.push(p.textContent.trim().slice(0, 80)); }
        return out.join(' · ');
    },
};
