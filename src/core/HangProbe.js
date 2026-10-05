// ============================================================================
// HangProbe — "caixa-preta" para travamentos que CONGELAM a aba (o navegador pergunta se é para aguardar ou fechar a página).
// Uma aba congelada não roda mais nada, então a pista precisa estar gravada ANTES: durante as janelas de risco (da tela de morte/
// prisão até 20 s depois de acordar), cada seção do quadro (Perf.lap) e cada passo do respawn gravam no localStorage onde o jogo
// está. Se a janela não fecha normalmente (a aba travou e foi fechada), no próximo carregamento aparece um aviso com o ponto exato.
// Fora das janelas não custa nada (um `if`).
// ============================================================================

const HangProbe = {
    KEY: 'dm_hang',
    ORDER_KEY: 'dm_hang_order',
    armedUntil: 0,
    _ctx: '',
    _frame: 0,
    _seq: [],          // seções do quadro atual (para saber a ordem: a seção seguinte à última gravada é a suspeita)
    _order: [],

    _trail: [],        // últimas marcas (rastro), gravadas juntas
    _armedAt: 0,
    _armedFrame: 0,

    // Abre (ou estende) a janela de gravação por `seconds`.
    arm(ctx, seconds = 20) {
        this._ctx = ctx;
        this._armedAt = performance.now();
        this._armedFrame = this._frame;
        this.armedUntil = performance.now() + seconds * 1000;
        // (só a ordem de um quadro de jogo completo: nas telas de morte/prisão o quadro tem 3–4 seções)
        if (this._order.length >= 10) try { localStorage.setItem(this.ORDER_KEY, JSON.stringify(this._order)); } catch (e) { /* sem storage */ }
        this.mark('janela aberta');
    },

    disarm() {
        this.armedUntil = 0;
        this._trail.length = 0;
        try { localStorage.removeItem(this.KEY); localStorage.removeItem(this.ORDER_KEY); } catch (e) { /* sem storage */ }
    },

    mark(where) {
        if (!this.armedUntil) return;
        const now = performance.now();
        if (now > this.armedUntil) { this.disarm(); return; }
        // Rastro: as últimas 8 marcas com o tempo (ms) e o nº de quadros desde que a janela abriu.
        const T = this._trail;
        T.push(`${where} [+${Math.round(now - this._armedAt)} ms, quadro +${this._frame - this._armedFrame}]`);
        if (T.length > 8) T.shift();
        try { localStorage.setItem(this.KEY, `${this._ctx}\u0001${where}\u0001${this._frame}\u0001${Date.now()}\u0001${T.join(' → ')}`); } catch (e) { /* sem storage */ }
    },

    // Chamados pelo Perf.
    frameStart() {
        this._frame++;
        if (this._seq.length) { const t = this._order; this._order = this._seq; this._seq = t; this._seq.length = 0; }
        if (this.armedUntil) this.mark('início do quadro');
    },
    lap(name) {
        if (this._seq.length < 64) this._seq.push(name);
        if (this.armedUntil) this.mark('fim de: ' + name);
    },

    // No carregamento: houve um travamento na última sessão? Mostra onde e limpa.
    report() {
        let raw = null, order = [];
        try { raw = localStorage.getItem(this.KEY); order = JSON.parse(localStorage.getItem(this.ORDER_KEY) || '[]'); } catch (e) { return; }
        if (!raw) return;
        const [ctx, where, frame, when, trail] = raw.split('\u0001');
        let next = '';
        if (where.startsWith('fim de: ')) { const i = order.indexOf(where.slice(8)); if (i >= 0) next = order[(i + 1) % order.length]; }
        else if (where === 'início do quadro' && order.length) next = order[0];
        const code = `DM-HANG v2 | ${ctx} | ${where}${next ? ` | próxima seção: ${next}` : ''} | quadro ${frame} | ${new Date(+when).toLocaleString()}`
            + (trail ? `\nrastro: ${trail}` : '');
        console.warn('[HangProbe] o jogo travou na última sessão:', code, { order });
        try { localStorage.removeItem(this.KEY); localStorage.removeItem(this.ORDER_KEY); } catch (e) { /* sem storage */ }
        const show = () => {
            const d = document.createElement('div');
            d.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:9999;max-width:min(92vw,720px);background:#1b1f2a;color:#f2f4f8;border:1px solid #ff7a6e;border-radius:12px;padding:14px 16px;font:500 14px/1.45 Inter,system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5)';
            d.innerHTML = '<b style="color:#ff9ea0">⚠ Da última vez o jogo travou.</b> Mande este código para o desenvolvedor (selecione e copie):'
                + '<pre style="margin:8px 0;padding:8px;background:#0d1017;border-radius:8px;white-space:pre-wrap;user-select:all;font:12px ui-monospace,monospace"></pre>'
                + '<span style="opacity:.7;font-size:12px">Se você só fechou o jogo nesse momento (sem travar), pode ignorar.</span> '
                + '<button style="float:right;margin-top:4px;padding:6px 12px;border:0;border-radius:8px;background:#34d399;color:#04130c;font-weight:700;cursor:pointer">OK</button>';
            d.querySelector('pre').textContent = code;
            d.querySelector('button').onclick = () => d.remove();
            document.body.appendChild(d);
        };
        if (document.body) show(); else window.addEventListener('DOMContentLoaded', show);
    },
};

HangProbe.report();
