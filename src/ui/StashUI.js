// ============================================================================
// StashUI — a janela da geladeira, do cofre e do baú da safe house (dados em player/Stash.js).
// Duas colunas: MOCHILA (o que dá para guardar aqui) e a CAIXA. Cada linha tem [1] (ou R$ 100) e [TUDO].
// Teclado: ↑/↓ escolhe · ←/→ troca de coluna · Enter move 1 · Espaço move tudo · Esc/E fecha. Mouse/toque: botões.
// Enquanto aberta o personagem fica parado (o Game consulta `open`); o mundo continua.
// ============================================================================

class StashUI {
    constructor(game) {
        this.g = game;
        this.open = false;
        this.box = null;
        this.col = 1;               // 0 = mochila, 1 = caixa
        this.sel = [0, 0];
        this.cool = 0;              // depois de fechar, ignora o E por um instante (para não reabrir)
        this._build();
        window.addEventListener('keydown', (e) => this._key(e));
    }

    _build() {
        const st = document.createElement('style');
        st.textContent = `
        #stashUI .sp{width:min(820px,95vw)}
        #stashUI .cols{display:flex;gap:14px;min-height:0;flex:1}
        #stashUI .col{flex:1;min-width:0;background:var(--card);border:1px solid var(--line);border-radius:var(--r-2);padding:12px;display:flex;flex-direction:column}
        #stashUI .col.on{border-color:var(--gold)}
        #stashUI h4{margin:0 0 10px;font:700 13px var(--font);letter-spacing:.06em;text-transform:uppercase;color:var(--tx-2);display:flex;justify-content:space-between}
        #stashUI .rows{min-height:150px;max-height:50vh;background:none;border:none;padding:0}
        #stashUI .row .ct{color:var(--gold);font:700 14px var(--font-d);white-space:nowrap}
        #stashUI .empty{font-size:13px;color:var(--tx-3);padding:22px 4px;text-align:center}
        @media (max-width:640px){#stashUI .cols{flex-direction:column}#stashUI .rows{max-height:22vh}}`;
        document.head.appendChild(st);
        const r = this.root = document.createElement('div');
        r.id = 'stashUI';
        r.innerHTML = '<div class="sp"><h3></h3><div class="sub"></div><div class="cols"></div><div class="msg"></div><div class="foot"></div></div>';
        document.body.appendChild(r);
        r.addEventListener('mousedown', (e) => { if (e.target === r) this.close(); });
        this.$h = r.querySelector('h3'); this.$sub = r.querySelector('.sub'); this.$cols = r.querySelector('.cols'); this.$msg = r.querySelector('.msg'); this.$foot = r.querySelector('.foot');
    }

    update(dt) { if (this.cool > 0) this.cool -= dt; }

    show(box) {
        this.box = box; this.open = true; this.col = 1; this.sel = [0, 0]; this.msg('');
        this.root.style.display = 'flex';
        this.g.input.releaseVirtual && this.g.input.releaseVirtual('pad');
        AudioFX.blip(480, 0.1, 0.15);
        this.render();
    }

    close() {
        if (!this.open) return;
        this.open = false; this.cool = 0.35;
        this.root.style.display = 'none';
        AudioFX.blip(360, 0.1, 0.12);
    }

    msg(t) { this.$msg.textContent = t; }

    _lists() {
        const g = this.g;
        return [g.stash.inventoryList(g, this.box), g.stash.boxList(this.box)];
    }

    render() {
        const g = this.g, B = Stash.BOXES[this.box], lists = this._lists(), inv = g.inventory;
        this.$h.textContent = B.title;
        this.$sub.textContent = B.hint.toUpperCase() + '   ·   DINHEIRO ' + brl(inv.cash);
        this.$cols.replaceChildren();
        lists.forEach((list, c) => {
            this.sel[c] = Math.max(0, Math.min(this.sel[c], list.length - 1));
            const col = document.createElement('div'); col.className = 'col' + (c === this.col ? ' on' : '');
            const h = document.createElement('h4');
            h.innerHTML = c === 0 ? `<span>MOCHILA</span><span>${inv.slotsUsed()}/${Inventory.CAPACITY}</span>` : `<span>${B.title}</span><span>${list.length ? '' : 'vazio'}</span>`;
            col.appendChild(h);
            const rows = document.createElement('div'); rows.className = 'rows';
            if (!list.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = c === 0 ? 'nada para guardar aqui' : 'vazio'; rows.appendChild(e); }
            list.forEach((it, i) => {
                const row = document.createElement('div'); row.className = 'row' + (c === this.col && i === this.sel[c] ? ' sel' : '');
                const ic = g.menu.itemIcon(Stash.icon(it.id));
                const k = Math.max(1, Math.min(3, Math.floor(28 / Math.max(ic.w, ic.h)) || 1));
                const cv = ic.canvas.cloneNode(); cv.getContext('2d').drawImage(ic.canvas, 0, 0); cv.style.width = ic.w * k + 'px'; cv.style.height = ic.h * k + 'px';
                row.appendChild(cv);
                const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = Stash.label(it.id);
                const ct = document.createElement('div'); ct.className = 'ct';
                ct.textContent = it.id === 'cash' ? '$' + it.count : (it.id.startsWith('weapon:') ? '' : '×' + it.count);
                row.append(nm, ct);
                const mk = (txt, n) => { const b = document.createElement('button'); b.className = 'btn'; b.textContent = txt; b.addEventListener('click', () => { this.col = c; this.sel[c] = i; this._do(it.id, n); }); row.appendChild(b); };
                const gun = it.id.startsWith('weapon:');
                if (!gun) mk(it.id === 'cash' ? '$' + Stash.CASH_STEP : '1', it.id === 'cash' ? Stash.CASH_STEP : 1);
                mk(gun ? (c === 0 ? 'GUARDAR' : 'PEGAR') : 'TUDO', gun ? 1 : 'all');
                row.addEventListener('mousedown', () => { this.col = c; this.sel[c] = i; this.render(); });
                rows.appendChild(row);
            });
            col.appendChild(rows);
            this.$cols.appendChild(col);
        });
        this.$foot.replaceChildren();
        const keys = document.createElement('span'); keys.textContent = '↑↓ ESCOLHE · ←→ COLUNA · ENTER 1 · ESPAÇO TUDO · ESC FECHA';
        this.$foot.appendChild(keys);
        if (this.box === 'safe' && g.stash.jewelCount(g) > 0) {
            const b = document.createElement('button'); b.className = 'btn';
            b.textContent = `VENDER ${g.stash.jewelCount(g)} JOIAS (70%): ${brl(g.stash.jewelTotal(g))}`;
            b.addEventListener('click', () => { const n = g.stash.sellJewels(g); this.msg(`Vendeu as joias por ${brl(n)}`); AudioFX.blip(900, 0.15, 0.2); this.render(); });
            this.$foot.appendChild(b);
        }
        const x = document.createElement('button'); x.className = 'btn'; x.textContent = 'Fechar'; x.addEventListener('click', () => this.close());
        this.$foot.appendChild(x);
    }

    _do(id, n) {
        const g = this.g, dir = this.col === 0 ? 'in' : 'out';
        const m = g.stash.move(g, this.box, id, dir, n);
        if (m) { this.msg(m); AudioFX.blip(dir === 'in' ? 520 : 640, 0.08, 0.14); }
        this.render();
    }

    _key(e) {
        if (!this.open) return;
        const k = e.key, lists = this._lists(), list = lists[this.col];
        const used = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Escape', 'e', 'E', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'Backspace'];
        if (!used.includes(k)) return;
        e.preventDefault(); e.stopPropagation();
        if (k === 'Escape' || k === 'e' || k === 'E' || k === 'Backspace') { this.close(); return; }
        if (k === 'ArrowUp' || k === 'w' || k === 'W') this.sel[this.col] = Math.max(0, this.sel[this.col] - 1);
        else if (k === 'ArrowDown' || k === 's' || k === 'S') this.sel[this.col] = Math.min(list.length - 1, this.sel[this.col] + 1);
        else if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.col = 0;
        else if (k === 'ArrowRight' || k === 'd' || k === 'D') this.col = 1;
        else if (k === 'Enter' || k === ' ') {
            const it = list[this.sel[this.col]];
            if (it) { const gun = it.id.startsWith('weapon:'); this._do(it.id, k === ' ' && !gun ? 'all' : (it.id === 'cash' ? Stash.CASH_STEP : 1)); return; }
        }
        this.render();
    }
}
