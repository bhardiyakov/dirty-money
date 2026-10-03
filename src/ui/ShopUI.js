// ============================================================================
// ShopUI — a janela de compra das lojas (preços e estoque vêm de economy/Economy.js, que depende do tipo e do lugar da loja).
// Teclado: ↑/↓ escolhe · Enter compra 1 · Esc/E fecha. Mouse/toque: botão COMPRAR. Mostra os fatores do preço (zona, dia, noite...).
// ============================================================================

class ShopUI {
    constructor(game) {
        this.g = game; this.open = false; this.shop = null; this.sel = 0; this.cool = 0;
        const st = document.createElement('style');
        st.textContent = `
        #shopUI{position:fixed;inset:0;z-index:40;display:none;align-items:center;justify-content:center;background:rgba(4,6,10,.6);font-family:'Press Start 2P',monospace;color:#e8ecf2}
        #shopUI .sp{width:min(720px,95vw);max-height:92vh;display:flex;flex-direction:column;background:#161b24;border:3px solid #6f7d92;box-shadow:0 0 0 3px #0b0e14,0 10px 40px #000a;padding:14px 16px}
        #shopUI h3{margin:0 0 4px;font-size:14px;letter-spacing:1px;color:#ffd23a;text-align:center}
        #shopUI .sub{font-size:8px;color:#8f9bb0;text-align:center;margin-bottom:6px;line-height:1.6}
        #shopUI .chips{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-bottom:8px}
        #shopUI .chip{font-size:7px;padding:3px 6px;border:2px solid #2b3445;background:#0f131a;color:#9fb0c8}
        #shopUI .chip.up{color:#ff9a8a;border-color:#5a2a28}#shopUI .chip.down{color:#8be08b;border-color:#2a5a2e}
        #shopUI .rows{overflow:auto;max-height:52vh;background:#0f131a;border:2px solid #2b3445;padding:6px}
        #shopUI .row{display:flex;align-items:center;gap:9px;padding:6px;border:2px solid transparent;font-size:8px;line-height:1.55}
        #shopUI .row.sel{border-color:#ffd23a;background:#1f2736}
        #shopUI .row.off{opacity:.45}
        #shopUI .row canvas{flex:none;image-rendering:pixelated}
        #shopUI .row .nm{flex:1;min-width:0}#shopUI .row .nm small{display:block;color:#8f9bb0;font-size:7px}
        #shopUI .row .pr{color:#8be08b;white-space:nowrap;min-width:56px;text-align:right}
        #shopUI .row .st{color:#9fb0c8;white-space:nowrap;font-size:7px;min-width:44px;text-align:right}
        #shopUI .btn{font:inherit;font-size:8px;background:#2a3446;color:#e8ecf2;border:2px solid #56657c;padding:6px 8px;cursor:pointer;white-space:nowrap}
        #shopUI .btn:hover{background:#3a4862}
        #shopUI .msg{min-height:12px;font-size:8px;text-align:center;margin-top:8px}
        #shopUI .foot{margin-top:8px;display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:7px;color:#8f9bb0;flex-wrap:wrap}`;
        document.head.appendChild(st);
        const r = this.root = document.createElement('div');
        r.id = 'shopUI';
        r.innerHTML = '<div class="sp"><h3></h3><div class="sub"></div><div class="chips"></div><div class="rows"></div><div class="msg"></div><div class="foot"></div></div>';
        document.body.appendChild(r);
        r.addEventListener('mousedown', (e) => { if (e.target === r) this.close(); });
        for (const k of ['h3', 'sub', 'chips', 'rows', 'msg', 'foot']) this['$' + k] = r.querySelector(k === 'h3' ? 'h3' : '.' + k);
        window.addEventListener('keydown', (e) => this._key(e));
    }

    update(dt) { if (this.cool > 0) this.cool -= dt; }

    show(shop) {
        this.shop = shop; this.open = true; this.sel = 0; this.msg('', true);
        this.root.style.display = 'flex';
        AudioFX.blip(560, 0.1, 0.15);
        this.render();
    }
    close() {
        if (!this.open) return;
        this.open = false; this.cool = 0.35; this.root.style.display = 'none';
        AudioFX.blip(380, 0.1, 0.12);
    }
    msg(t, good) { this.$msg.textContent = t; this.$msg.style.color = good ? '#8be08b' : '#ff9a8a'; }

    render() {
        const g = this.g, shop = this.shop, S = Economy.STYLES[shop.style], hour = g.dayNight.hour, inv = g.inventory;
        const list = Economy.stockFor(shop).items;
        this.$h3.textContent = shop.name.toUpperCase();
        this.$sub.innerHTML = `${S.label.toUpperCase()} · ${Economy.zoneOf(shop).label.toUpperCase()}<br>SEU DINHEIRO: <span style="color:#ffd23a">${brl(inv.cash)}</span> · LIMPO: <span style="color:#7fe0a0">${brl(inv.clean)}</span> · ${g.dayNight.label}`;
        this.$chips.replaceChildren();
        for (const f of Economy.factors(shop, hour)) {
            if (Math.abs(f.mul - 1) < 0.015) continue;
            const c = document.createElement('div'); c.className = 'chip ' + (f.mul > 1 ? 'up' : 'down');
            c.textContent = `${f.label} ${f.mul > 1 ? '+' : ''}${Math.round((f.mul - 1) * 100)}%`; this.$chips.appendChild(c);
        }
        this.sel = Math.max(0, Math.min(this.sel, list.length - 1));
        this.$rows.replaceChildren();
        list.forEach((e, i) => {
            const it = Economy.ITEMS[e.id], price = Economy.price(shop, e.id, hour);
            const row = document.createElement('div'); row.className = 'row' + (i === this.sel ? ' sel' : '') + (e.qty <= 0 ? ' off' : '');
            const ic = g.menu.itemIcon(it.icon), k = Math.max(1, Math.min(3, Math.floor(30 / Math.max(ic.w, ic.h)) || 1));
            const cv = ic.canvas.cloneNode(); cv.getContext('2d').drawImage(ic.canvas, 0, 0); cv.style.width = ic.w * k + 'px'; cv.style.height = ic.h * k + 'px';
            const nm = document.createElement('div'); nm.className = 'nm'; nm.innerHTML = `${it.name.toUpperCase()}<small>${it.desc}${it.kind === 'meal' ? '' : ''}</small>`;
            const pr = document.createElement('div'); pr.className = 'pr'; pr.textContent = brl(price);
            const stq = document.createElement('div'); stq.className = 'st'; stq.textContent = e.qty === Infinity ? '' : (e.qty > 0 ? 'resta ' + e.qty : 'esgotado');
            const b = document.createElement('button'); b.className = 'btn'; b.textContent = it.kind === 'meal' ? 'COMER' : 'COMPRAR';
            b.addEventListener('click', () => { this.sel = i; this._buy(e.id); });
            row.append(cv, nm, stq, pr, b);
            row.addEventListener('mousedown', () => { if (this.sel !== i) { this.sel = i; this.render(); } });
            this.$rows.appendChild(row);
        });
        this.$foot.replaceChildren();
        const hint = document.createElement('span'); hint.textContent = '↑↓ ESCOLHE · ENTER COMPRA · ESC FECHA'; this.$foot.appendChild(hint);
        const off = Economy.fenceOffer(shop, g);
        if (off) { const b = document.createElement('button'); b.className = 'btn'; b.textContent = `VENDER ${off.count} JOIAS: ${brl(off.value)}`; b.addEventListener('click', () => { const r = Economy.sellJewels(g, shop); this.msg(r.msg, r.ok); if (r.ok) AudioFX.blip(900, 0.15, 0.2); this.render(); }); this.$foot.appendChild(b); }
        if (Laundry.canOwn(shop)) {                                         // fachada: comprar o ponto e lavar dinheiro (economy/Laundry.js)
            if (!Laundry.isOwned(shop)) {
                const b = document.createElement('button'); b.className = 'btn'; b.textContent = `COMPRAR O PONTO: ${brl(Laundry.price(shop))}`;
                b.addEventListener('click', () => { const r = Laundry.buy(g, shop); this.msg(r.msg, r.ok); AudioFX.blip(r.ok ? 700 : 200, 0.1, 0.15); this.render(); });
                this.$foot.appendChild(b);
            } else {
                const info = document.createElement('span'); info.style.color = '#7fe0a0';
                info.textContent = `FACHADA · CONTAB. NV ${Laundry.level} · PERDA ${Math.round(Laundry.lossRate * 100)}% · RESTA ${brl(Laundry.left(shop))} HOJE`;
                this.$foot.appendChild(info);
                for (const amt of [500, 1500, Infinity]) {
                    const b = document.createElement('button'); b.className = 'btn'; b.textContent = amt === Infinity ? 'LAVAR TUDO' : `LAVAR ${brl(amt)}`;
                    b.addEventListener('click', () => { const r = Laundry.launder(g, shop, amt); this.msg(r.msg, r.ok); AudioFX.blip(r.ok ? 900 : 200, 0.12, 0.15); this.render(); });
                    this.$foot.appendChild(b);
                }
            }
        }
        if (shop.style === 'drugs' && shop.district === 'favela' && g.missions) {                      // serviços do tráfico: missões (ver player/Missions.js)
            const M = g.missions, b = document.createElement('button'); b.className = 'btn';
            b.textContent = M.cur ? 'ABANDONAR SERVIÇO' : `PEDIR SERVIÇO (${Missions.rankName})`;
            b.addEventListener('click', () => { const r = M.cur ? M.abandon() : M.offer(); this.msg(r.msg, r.ok); AudioFX.blip(r.ok ? 700 : 200, 0.1, 0.15); this.render(); });
            this.$foot.appendChild(b);
        }
        if (shop.style === 'drugs' && shop.district === 'favela') {                                    // "taxa do morro": pagar em dia sobe a moral com o tráfico (≥70 eles te toleram)
            const fee = 250, b = document.createElement('button'); b.className = 'btn'; b.textContent = `PAGAR TAXA DO MORRO: ${brl(fee)}`;
            b.addEventListener('click', () => {
                if (inv.cash < fee) { this.msg('Dinheiro insuficiente', false); AudioFX.blip(200, 0.12, 0.14); return; }
                inv.cash -= fee; Standing.add('traffic', 10);
                this.msg(`Taxa paga (-${brl(fee)}). Moral com o tráfico: ${Math.round(Standing.traffic)}`, true); AudioFX.blip(700, 0.1, 0.16); this.render();
            });
            this.$foot.appendChild(b);
        }
        const x = document.createElement('button'); x.className = 'btn'; x.textContent = 'FECHAR'; x.addEventListener('click', () => this.close()); this.$foot.appendChild(x);
        const sel = this.$rows.querySelector('.sel'); if (sel) sel.scrollIntoView({ block: 'nearest' });
    }

    _buy(id) {
        const r = Economy.buy(this.g, this.shop, id);
        this.msg(r.msg, r.ok);
        if (r.ok) AudioFX.blip(700, 0.1, 0.16); else AudioFX.blip(200, 0.12, 0.14);
        this.render();
    }

    _key(e) {
        if (!this.open) return;
        const k = e.key, list = Economy.stockFor(this.shop).items;
        const used = ['ArrowUp', 'ArrowDown', 'Enter', ' ', 'Escape', 'e', 'E', 'w', 's', 'W', 'S', 'Backspace'];
        if (!used.includes(k)) return;
        e.preventDefault(); e.stopPropagation();
        if (k === 'Escape' || k === 'e' || k === 'E' || k === 'Backspace') { this.close(); return; }
        if (k === 'ArrowUp' || k === 'w' || k === 'W') this.sel = Math.max(0, this.sel - 1);
        else if (k === 'ArrowDown' || k === 's' || k === 'S') this.sel = Math.min(list.length - 1, this.sel + 1);
        else if (k === 'Enter' || k === ' ') { const it = list[this.sel]; if (it) { this._buy(it.id); return; } }
        this.render();
    }
}
