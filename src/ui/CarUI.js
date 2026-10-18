// ============================================================================
// CarUI — a janela dos carros, em dois modos:
//   • 'dealer'  (Dealers): o catálogo da concessionária — miniatura, preço, máxima e 0–100; escolha a COR (←/→) e a GARAGEM de
//               destino (uma casa sua com vaga) e compre (Enter);
//   • 'garage'  (Garage): todos os SEUS carros — onde estão, lataria e gasolina; o manobrista leva para outra casa (R$ 150),
//               vender (os comprados: 55% do preço pelo estado) ou largar (os roubados: libera a vaga).
// ↑/↓ escolhe o carro · ←/→ muda a cor / o destino · Enter confirma · Esc/E fecha. O jogo fica parado atrás (Game consulta `open`).
// ============================================================================

class CarUI {
    constructor(game) {
        this.g = game;
        this.open = false; this.cool = 0; this.sel = 0; this.mode = null;
        const st = document.createElement('style');
        st.textContent = `
        #carUI .pp{width:min(820px,96vw)}
        #carUI .body{display:flex;gap:14px;min-height:0}
        #carUI .rows{flex:1.2;max-height:56vh;min-width:0}
        #carUI .row .pr{color:#86efac;font:700 15px var(--font-d);white-space:nowrap;text-align:right}
        #carUI .row .pr.no{color:#fda4af}
        #carUI .det{flex:1;background:var(--card);border:1px solid var(--line);border-radius:var(--r-2);padding:12px 14px;display:flex;flex-direction:column;gap:8px;min-width:0}
        #carUI .det .big{display:flex;justify-content:center;align-items:center;height:150px}
        #carUI .det .big canvas{max-height:150px;max-width:100%;transform:rotate(-90deg);filter:drop-shadow(0 4px 8px rgba(0,0,0,.5))}
        #carUI .det .nm{font:700 17px var(--font-d);text-align:center}
        #carUI .kv{display:flex;justify-content:space-between;font-size:13px;color:var(--tx-2)} #carUI .kv b{color:var(--tx)}
        #carUI .pick{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:13px}
        #carUI .pick span{flex:1;text-align:center;font-weight:600}
        #carUI .sw{display:inline-block;width:14px;height:14px;border-radius:4px;vertical-align:-2px;margin-right:6px;border:1px solid rgba(255,255,255,.4)}
        #carUI .go{margin-top:4px;width:100%;padding:11px}
        #carUI .note{font-size:12px;line-height:1.5;color:var(--tx-3)}
        @media (max-width:640px){#carUI .body{flex-direction:column}#carUI .rows{max-height:30vh}}`;
        document.head.appendChild(st);
        const r = this.root = document.createElement('div');
        r.id = 'carUI';
        r.innerHTML = '<div class="pp"><h3></h3><div class="sub"></div><div class="body"><div class="rows"></div><div class="det"></div></div><div class="msg"></div></div>';
        document.body.appendChild(r);
        this.$h = r.querySelector('h3'); this.$sub = r.querySelector('.sub'); this.$rows = r.querySelector('.rows'); this.$det = r.querySelector('.det'); this.$msg = r.querySelector('.msg');
        r.addEventListener('mousedown', (e) => { if (e.target === r) this.close(); });
        window.addEventListener('keydown', (e) => this._key(e));
        this._thumbs = {};
    }

    update(dt) { if (this.cool > 0) this.cool -= dt; }

    showDealer(d) {                                                                  // destino inicial: a casa onde mora, ou a 1ª com vaga
        this.mode = 'dealer'; this.d = d;
        const mine = this._dests(), G = d.kind === 'boat' ? mine[0] : Garage.defaultFor();
        this.paintIx = 0; this.dest = Math.max(0, mine.indexOf(G)); this._open();
    }
    // Para onde vai o que se compra nesta loja: barco → a vaga da marina; carro e moto → as garagens das suas casas.
    _dests() { return this.mode === 'dealer' && this.d && this.d.kind === 'boat' ? [Garage.byId('marina')].filter(Boolean) : Garage.mine(); }
    showGarage(G) { this.mode = 'garage'; this.G = G; this.dest = 0; this._open(); }
    _open() {
        this.open = true; this.sel = 0; this.$msg.textContent = '';
        this.root.style.display = 'flex';
        if (this.g.input.releaseVirtual) this.g.input.releaseVirtual('pad');
        AudioFX.blip(480, 0.1, 0.15);
        this.render();
    }
    close() { if (!this.open) return; this.open = false; this.cool = 0.35; this.root.style.display = 'none'; AudioFX.blip(360, 0.1, 0.12); }
    msg(t, ok = true) { this.$msg.textContent = t; this.$msg.style.color = ok ? '#8be08b' : '#ff8a8a'; }

    _thumb(model, paint) {
        const k = model + '|' + paint;
        if (!this._thumbs[k]) this._thumbs[k] = Catalog.preview(model, paint);
        const c = this._thumbs[k];
        if (!c) return document.createElement('span');
        const out = document.createElement('canvas'); out.width = c.width; out.height = c.height;
        out.getContext('2d').drawImage(c, 0, 0);
        return out;
    }
    _specs(model) { const s = Catalog.spec(model); return { top: Math.round(s.maxSpeed * 3.6), t100: s.t100 }; }
    _sw(row) { const P = CarSheet.PAINTS[row]; return P ? `<i class="sw" style="background:${P.paint}"></i>${P.name}` : ''; }

    // ---------------------------------------------------------------- desenho
    render() {
        const g = this.g, inv = g.inventory;
        const money = `SEU DINHEIRO: ${brl(inv.cash)} · LIMPO: <span style="color:#7fe0a0">${brl(inv.clean)}</span>`;
        if (this.mode === 'dealer') {
            const d = this.d, models = d.models;
            this.items = models;
            this.$h.textContent = d.name.toUpperCase();
            this.$sub.innerHTML = `${d.tier.label.toUpperCase()} · ${d.region.toUpperCase()} · ${d.tier.dirty ? 'aceita dinheiro sujo' : 'só dinheiro limpo'}<br>${money}`;
            const wallet = Dealers.needsClean(d) ? inv.clean : inv.cash;
            this.$rows.replaceChildren(...models.map((m, i) => {
                const sp = this._specs(m), price = Dealers.price(m);
                return this._row(i, this._thumb(m, Catalog.pool(m)[0]), `${Catalog.label(m)}<small>${d.tier.cond} · máx ${sp.top} km/h · 0–100 ${sp.t100 ? sp.t100.toLocaleString('pt-BR') + ' s' : '—'}</small>`, brl(price), wallet >= price);
            }));
            this._dealerDetail(wallet);
        } else {
            const mine = Garage.cars.slice().sort((a, b) => (a.garage === this.G.id ? -1 : 0) - (b.garage === this.G.id ? -1 : 0));
            this.items = mine;
            this.$h.textContent = `GARAGEM — ${this.G.name.toUpperCase()}`;
            this.$sub.innerHTML = `${Garage.carsIn(this.G).length}/${this.G.cap} VAGA(S) OCUPADA(S) AQUI · ${Garage.cars.length} CARRO(S) NO TOTAL<br>${money}`;
            this.$rows.replaceChildren(...(mine.length ? mine.map((r, i) => this._row(i, this._thumb(r.model, r.paint), `${Garage.label(r)}<small>${Garage.where(r)} · ${r.bought ? 'comprado' : 'roubado'} · lataria ${Math.round(r.hp * 100)}%</small>`, r.garage === this.G.id ? 'AQUI' : '', true))
                : [Object.assign(document.createElement('div'), { className: 'note', textContent: 'Nenhum carro seu ainda. Compre numa concessionária ou estacione um carro roubado numa vaga da sua garagem e aperte E.' })]));
            this._garageDetail();
        }
    }
    _row(i, thumb, html, right, ok) {
        const b = document.createElement('div');
        b.className = 'row' + (i === this.sel ? ' sel' : '') + (ok ? '' : ' off');
        const nm = document.createElement('div'); nm.className = 'nm'; nm.innerHTML = html;
        const pr = document.createElement('div'); pr.className = 'pr' + (ok ? '' : ' no'); pr.textContent = right;
        thumb.style.width = '64px'; thumb.style.height = 'auto';
        b.append(thumb, nm, pr);
        b.addEventListener('click', () => { this.sel = i; this.render(); });
        if (i === this.sel) requestAnimationFrame(() => b.scrollIntoView({ block: 'nearest' }));
        return b;
    }
    _btn(label, fn, cls = 'btn', ok = true) {
        const b = document.createElement('button'); b.className = cls; b.innerHTML = label;
        if (!ok) { b.style.opacity = '.45'; b.style.cursor = 'not-allowed'; }
        b.addEventListener('click', () => { if (ok) fn(); else AudioFX.blip(160, 0.1, 0.14); });
        return b;
    }
    _pick(title, value, prev, next) {
        const p = document.createElement('div'); p.className = 'pick';
        const t = document.createElement('div'); t.className = 'note'; t.textContent = title;
        const v = document.createElement('span'); v.innerHTML = value;
        p.append(this._btn('◀', prev), v, this._btn('▶', next));
        const w = document.createElement('div'); w.append(t, p);
        return w;
    }

    _dealerDetail(wallet) {
        const d = this.d, m = this.items[this.sel], sp = this._specs(m), price = Dealers.price(m);
        const pool = Catalog.pool(m), paint = pool[this.paintIx % pool.length];
        const dests = this._dests(), G = dests.length ? dests[this.dest % dests.length] : null, room = G ? Garage.free(G) : 0;
        const big = document.createElement('div'); big.className = 'big'; big.append(this._thumb(m, paint));
        const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = Catalog.label(m);
        const kv = (k, v) => Object.assign(document.createElement('div'), { className: 'kv', innerHTML: `<span>${k}</span><b>${v}</b>` });
        const ok = !!G && room > 0 && wallet >= price;
        const why = !G ? 'compre um imóvel ou use a safe house' : room <= 0 ? (G.boat ? 'suas vagas da marina estão ocupadas' : 'garagem cheia — escolha outra casa') : wallet < price ? `faltam ${brl(price - wallet)}${Dealers.needsClean(d) ? ' de dinheiro limpo' : ''}` : '';
        this.$det.replaceChildren(big, nm, kv('PREÇO', brl(price)), kv('VELOCIDADE MÁXIMA', `${sp.top} km/h`), kv('0–100 km/h (referência)', sp.t100 ? `${sp.t100.toLocaleString('pt-BR')} s` : '—'),
            this._pick('COR (← →)', this._sw(paint), () => { this.paintIx = (this.paintIx + pool.length - 1) % pool.length; this.render(); }, () => { this.paintIx = (this.paintIx + 1) % pool.length; this.render(); }),
            this._pick(G && G.boat ? 'FICA NA SUA VAGA DA MARINA' : 'VAI PARA A GARAGEM (Tab)', G ? `${G.name} <small>(${room} vaga${room === 1 ? '' : 's'})</small>` : '— nenhuma casa sua —', () => this._dest(-1), () => this._dest(1)),
            this._btn(`COMPRAR — ${brl(price)}${why ? `<br><small>${why}</small>` : ''}`, () => this.choose(), 'btn pri go', ok));
    }
    _dest(k) { const n = this._dests().length || 1; this.dest = (this.dest + k + n) % n; this.render(); }

    _garageDetail() {
        const r = this.items[this.sel];
        if (!r) { this.$det.replaceChildren(Object.assign(document.createElement('div'), { className: 'note', textContent: 'As vagas ficam no meio-fio em frente à porta (marcadas em azul no chão).' })); return; }
        const car = Garage._live(r), withYou = !!(car && car.controlled), ins = r.readyAt > Garage._now();
        const dests = (Catalog.kind(r.model) === 'boat' ? [] : Garage.mine()).filter((G) => G.id !== r.garage && Garage.free(G) > 0), G = dests.length ? dests[this.dest % dests.length] : null;
        const big = document.createElement('div'); big.className = 'big'; big.append(this._thumb(r.model, r.paint));
        const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = Garage.label(r);
        const kv = (k, v) => Object.assign(document.createElement('div'), { className: 'kv', innerHTML: `<span>${k}</span><b>${v}</b>` });
        const out = [big, nm, kv('ONDE ESTÁ', Garage.where(r)), kv('ORIGEM', r.bought ? `comprado (${brl(r.paid)})` : 'roubado — sem seguro'), kv('LATARIA', `${Math.round(r.hp * 100)}%`), kv('GASOLINA', `${Math.round((r.fuel || 0) * 100)}%`)];
        const M = r.mods || {}, mods = Object.keys(M).filter((k) => M[k]);
        const nm2 = { engine: 'motor (desmanche)', armor: 'blindagem', hidden: 'fundo falso', turbo: 'turbo', tEng: `motor estágio ${M.tEng}`, tBrk: `freios ${M.tBrk}`, tSus: `suspensão ${M.tSus}`, wing: 'aerofólio', neon: `neon ${Tuning.NEON_NAMES[M.neon] || ''}` };
        if (mods.length) out.push(kv('PEÇAS', mods.map((k) => nm2[k] || k).join(', ')));
        out.push(this._pick('MANOBRISTA LEVA PARA (Tab)', G ? `${G.name} <small>(${Garage.free(G)} vaga(s))</small>` : '— nenhuma outra casa com vaga —', () => this._dest(-1), () => this._dest(1)));
        const can = !!G && !withYou && !ins && this.g.inventory.cash >= Garage.VALET;
        out.push(this._btn(`LEVAR PARA LÁ — ${brl(Garage.VALET)}${withYou ? '<br><small>você está dirigindo este carro</small>' : ins ? '<br><small>está no seguro</small>' : ''}`, () => this.choose(), 'btn pri go', can));
        if (r.bought) out.push(this._btn(`VENDER — ${brl(Dealers.resale(r))}<br><small>55% do preço de hoje, pelo estado · ${r.dirty ? 'dinheiro sujo' : 'dinheiro limpo'}</small>`, () => this._sell(r), 'btn go', !withYou));
        else out.push(this._btn('LARGAR ESTE CARRO<br><small>libera a vaga (ele fica na rua e deixa de ser seu)</small>', () => this._drop(r), 'btn go', !withYou));
        this.$det.replaceChildren(...out);
    }

    // ---------------------------------------------------------------- ações
    choose() {
        const g = this.g;
        let res;
        if (this.mode === 'dealer') {
            const m = this.items[this.sel], pool = Catalog.pool(m), dests = this._dests(), G = dests[this.dest % (dests.length || 1)];
            res = G ? Dealers.buy(g, this.d, m, pool[this.paintIx % pool.length], G.id) : { ok: false, msg: 'Você não tem garagem' };
        } else {
            const r = this.items[this.sel];
            if (!r) return;
            const dests = (Catalog.kind(r.model) === 'boat' ? [] : Garage.mine()).filter((G) => G.id !== r.garage && Garage.free(G) > 0), G = dests[this.dest % (dests.length || 1)];
            const car = Garage._live(r);
            if (!G) res = { ok: false, msg: 'Nenhuma outra casa sua tem vaga' };
            else if (car && car.controlled) res = { ok: false, msg: 'Você está dirigindo este carro' };
            else if (g.inventory.cash < Garage.VALET) res = { ok: false, msg: `O manobrista cobra ${brl(Garage.VALET)}` };
            else { g.inventory.cash -= Garage.VALET; Garage.move(r, G); res = { ok: true, msg: `O manobrista levou o ${Garage.label(r)} para ${G.name}` }; }
        }
        this.msg(res.msg, res.ok); AudioFX.blip(res.ok ? 800 : 200, 0.1, 0.16);
        if (this.open) this.render();
    }
    _sell(r) {
        const v = Dealers.resale(r), inv = this.g.inventory;
        if (r.dirty) inv.cash += v; else inv.clean += v;
        const car = Garage._live(r);
        Garage.remove(r);
        if (car && !car.controlled) Garage.despawn(this.g, car);
        this.sel = 0; this.msg(`Vendeu o ${Garage.label(r)} por ${brl(v)}`); AudioFX.blip(800, 0.1, 0.16); this.render();
    }
    _drop(r) {
        const car = Garage._live(r);
        Garage.remove(r);
        if (car) car.keep = false;                                               // (vira um carro qualquer: o trânsito recicla quando você for embora)
        this.sel = 0; this.msg(`Largou o ${Garage.label(r)} — a vaga está livre`); AudioFX.blip(500, 0.1, 0.16); this.render();
    }

    _key(e) {
        if (!this.open) return;
        const k = e.key, n = this.items ? this.items.length : 0;
        if (k === 'Escape' || k === 'e' || k === 'E' || k === 'Backspace') { this.close(); e.preventDefault(); e.stopPropagation(); return; }
        if ((k === 'ArrowUp' || k === 'w' || k === 'W') && n) { this.sel = (this.sel + n - 1) % n; this.paintIx = 0; }
        else if ((k === 'ArrowDown' || k === 's' || k === 'S') && n) { this.sel = (this.sel + 1) % n; this.paintIx = 0; }
        else if (k === 'ArrowLeft' || k === 'a' || k === 'A') { if (this.mode === 'dealer') { const L = Catalog.pool(this.items[this.sel]).length; this.paintIx = (this.paintIx + L - 1) % L; } else this._dest(-1); }
        else if (k === 'ArrowRight' || k === 'd' || k === 'D') { if (this.mode === 'dealer') this.paintIx = (this.paintIx + 1) % Catalog.pool(this.items[this.sel]).length; else this._dest(1); }
        else if (k === 'Tab') this._dest(1);
        else if (k === 'Enter' || k === ' ') { this.choose(); e.preventDefault(); e.stopPropagation(); return; }
        else return;
        e.preventDefault(); e.stopPropagation();
        this.render();
    }
}
