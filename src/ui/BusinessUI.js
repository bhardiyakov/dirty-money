// ============================================================================
// BusinessUI — a aba 🏪 NEGÓCIOS do menu de pausa (dados em economy/Business.js).
//   Resumo: patrimônio, lucro estimado por dia, caixa a recolher, sujo nos cofres e o alerta da Receita.
//   Cada negócio: lucro dos últimos 7 dias (barras: azul = lucro, vermelho = prejuízo; passe o mouse para ver o dia), caixa (recolher),
//   cofre de lavagem (deixar sujo), melhorias, campanha, vender e marcar no mapa.
//   Mercado: as lojas à venda mais perto de você (a compra é no balcão da loja).
// Cliques: data-biz="ação" data-id="loja" data-arg="…".
// ============================================================================

class BusinessUI {
    constructor(game) { this.g = game; this.el = null; BusinessUI._css(); }

    static _css() {
        if (BusinessUI._styled) return;
        BusinessUI._styled = true;
        const st = document.createElement('style');
        st.textContent = `
            #pmBiz { width: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding-right: 4px; color: var(--tx); font-size: 13px; }
            #pmBiz .bz-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 12px; align-items: start; }
            #pmBiz .bz-box { background: var(--glass); border: 1px solid var(--line-2); border-radius: var(--r); padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
            #pmBiz h3 { margin: 0; font: 700 16px var(--font-d); display: flex; justify-content: space-between; gap: 8px; align-items: baseline; } #pmBiz h3 small { color: var(--tx-3); font: 600 11px var(--font); }
            #pmBiz .bz-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
            #pmBiz .bz-kpi { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-2); padding: 8px 10px; } #pmBiz .bz-kpi span { display: block; font-size: 11px; color: var(--tx-3); text-transform: uppercase; letter-spacing: .06em; } #pmBiz .bz-kpi b { font: 700 18px var(--font-d); }
            #pmBiz .bz-row { display: flex; justify-content: space-between; gap: 10px; color: var(--tx-2); } #pmBiz .bz-row b { color: var(--tx); text-align: right; }
            #pmBiz button { font: inherit; font-size: 12px; padding: 6px 9px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--card-h); color: var(--tx); font-weight: 600; cursor: pointer; }
            #pmBiz button:hover:not([disabled]) { background: rgba(255,255,255,0.14); border-color: var(--gold); } #pmBiz button[disabled] { opacity: .4; cursor: not-allowed; }
            #pmBiz .bz-btns { display: flex; gap: 6px; flex-wrap: wrap; }
            #pmBiz .bz-up { display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; align-items: center; font-size: 12px; color: var(--tx-2); }
            #pmBiz .bz-up .pip { color: var(--gold); letter-spacing: 2px; margin-left: 4px; }
            #pmBiz .bz-log { font-size: 11px; color: var(--tx-3); line-height: 1.45; }
            #pmBiz .bz-chart { display: flex; align-items: flex-end; gap: 8px; } #pmBiz .bz-chart svg { flex: 1; height: 54px; } #pmBiz .bz-chart .lv { font: 700 13px var(--font-d); color: var(--tx); white-space: nowrap; }
            #pmBiz .bz-chart .lv small { display: block; font: 600 10px var(--font); color: var(--tx-3); }
            #pmBiz .bz-dim { color: var(--tx-3); font-size: 12px; margin: 0; line-height: 1.45; }
            #pmBiz table { border-collapse: collapse; width: 100%; } #pmBiz td, #pmBiz th { padding: 5px; text-align: left; font-size: 12px; border-bottom: 1px solid var(--line); } #pmBiz th { color: var(--tx-3); font-weight: 600; }`;
        document.head.appendChild(st);
    }

    bind(el) {
        if (this.el === el) return;
        this.el = el;
        el.addEventListener('click', (e) => {
            const b = e.target.closest('button[data-biz]'); if (!b || b.disabled) return;
            const g = this.g, id = b.dataset.id, a = b.dataset.biz, arg = b.dataset.arg;
            let msg = null;
            if (a === 'collect') msg = Business.collect(g, id);
            else if (a === 'all') msg = Business.collectAll(g);
            else if (a === 'dep') msg = Business.deposit(g, id, arg === 'all' ? Infinity : +arg);
            else if (a === 'up') msg = Business.upgrade(g, id, arg);
            else if (a === 'mkt') msg = Business.marketing(g, id);
            else if (a === 'sell') { if (b.dataset.sure) msg = Business.sell(g, id); else { b.dataset.sure = 1; b.textContent = 'Confirmar venda?'; return; } }
            else if (a === 'map') { const B = Business.owned[id] || this._market().find((d) => d.id === id); if (B) { g.setGps(B.x, B.z, B.name); msg = `📍 ${B.name} marcado no mapa`; } }
            if (msg) g._flash(msg);
            AudioFX.blip(620, 0.06, 0.1);
            this.render();
        });
    }

    // Lojas à venda (as 10 mais perto).
    _market() {
        Interiors.index();
        const p = this.g._playerState().pos;
        return Interiors._doors.filter((d) => Business.canOwn(d) && !Business.isOwned(d)).map((d) => ({ d, id: d.id, x: d.x, z: d.z, name: d.name, dist: hypot(d.x - p.x, d.z - p.z) }))
            .sort((a, b) => a.dist - b.dist).slice(0, 10);
    }

    // Barras do lucro dos últimos 7 dias (um só valor por dia: sem legenda; o rótulo mostra o último).
    _chart(b) {
        const H = b.hist, W = 210, Ht = 54, n = 7, gap = 2, bw = (W - gap * (n - 1)) / n;
        if (!H.length) return '<p class="bz-dim">Os números aparecem depois do primeiro dia.</p>';
        const max = Math.max(1, ...H.map((h) => Math.abs(h.p))), hasNeg = H.some((h) => h.p < 0), base = hasNeg ? Ht / 2 : Ht - 1;
        const scale = (hasNeg ? Ht / 2 - 2 : Ht - 3) / max;
        let bars = '';
        H.forEach((h, i) => {
            const x = (n - H.length + i) * (bw + gap), hgt = Math.max(1, Math.abs(h.p) * scale), y = h.p >= 0 ? base - hgt : base, col = h.p >= 0 ? '#3a8ee6' : '#d4673a';
            const r = Math.min(4, bw / 2, hgt);
            const path = h.p >= 0
                ? `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${base} Z`
                : `M${x},${base} V${y + hgt - r} Q${x},${y + hgt} ${x + r},${y + hgt} H${x + bw - r} Q${x + bw},${y + hgt} ${x + bw},${y + hgt - r} V${base} Z`;
            bars += `<g><title>Dia ${h.d}: ${h.p >= 0 ? 'lucro' : 'prejuízo'} ${brl(h.p)} · faturou ${brl(h.r)}${h.w ? ` · lavou ${brl(h.w)}` : ''}</title><rect x="${x}" y="0" width="${bw}" height="${Ht}" fill="transparent"/><path d="${path}" fill="${col}"/></g>`;
        });
        const last = H[H.length - 1];
        return `<div class="bz-chart"><svg viewBox="0 0 ${W} ${Ht}" preserveAspectRatio="none" role="img" aria-label="Lucro dos últimos ${H.length} dias"><line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>${bars}</svg>
            <div class="lv">${brl(last.p)}<small>ontem</small></div></div>`;
    }

    render(el = this.el) {
        if (!el) return;
        this.bind(el);
        const g = this.g, L = Business.list(), inv = g.inventory, kpi = (k, v) => `<div class="bz-kpi"><span>${k}</span><b>${v}</b></div>`;
        const est = L.reduce((s, b) => s + Business.estimate(b), 0), cash = L.reduce((s, b) => s + b.cash, 0), dirty = L.reduce((s, b) => s + b.dirty, 0);
        const yday = L.reduce((s, b) => s + (b.hist.length ? b.hist[b.hist.length - 1].p : 0), 0);
        let h = `<div class="bz-box"><h3>🏪 SEUS NEGÓCIOS <small>dia ${Economy.day} · ${g.dayNight.label}</small></h3>
            <div class="bz-kpis">${kpi('Negócios', L.length)}${kpi('Patrimônio', brl(Business.worth))}${kpi('Lucro estimado/dia', brl(est))}${kpi('Lucro de ontem', brl(yday))}${kpi('No caixa (limpo)', brl(cash))}${kpi('Sujo nos cofres', brl(dirty))}</div>
            <div class="bz-row"><span>Alerta da Receita Federal (lavagem)</span><b style="color:${Laundry.taxHeat > 70 ? '#fda4af' : 'var(--tx)'}">${Math.round(Laundry.taxHeat)}%</b></div>
            <div class="bz-row"><span>Seu dinheiro</span><b>sujo ${brl(inv.cash)} · limpo ${brl(inv.clean)}</b></div>
            <div class="bz-btns"><button data-biz="all" ${cash > 0 ? '' : 'disabled'}>Recolher os caixas (negócios com gerente ou onde você está)</button></div>
            <p class="bz-dim">O lucro cai no caixa à meia-noite. Dinheiro sujo deixado no cofre é misturado no faturamento: até o limite do dia ele vira limpo com perda pequena — passar de metade do faturamento chama a Receita.</p></div>`;
        h += '<div class="bz-grid">';
        for (const b of L) {
            const here = Business.here(g, b), mgr = !!b.up.manager, cap = Business.washCap(b), loss = Math.round(Business.washLoss(b) * 100);
            const ups = Object.entries(Business.UPG).map(([k, U]) => {
                const lv = b.up[k] || 0, max = lv >= U.max;
                return `<span>${U.icon} ${U.name}${U.max > 1 ? `<span class="pip">${'●'.repeat(lv)}${'○'.repeat(U.max - lv)}</span>` : lv ? ' ✔' : ''}<br><small style="color:var(--tx-3)">${U.desc}</small></span><button data-biz="up" data-id="${b.id}" data-arg="${k}" ${max ? 'disabled' : ''}>${max ? 'máximo' : brl(Business.upgCost(b, k))}</button>`;
            }).join('');
            h += `<div class="bz-box"><h3>${b.name}<small>${b.label} · ${g.empire ? g.empire.dName(g.empire.districtAt(b.x, b.z)) : ''} · ${b.days} dia(s)</small></h3>
                ${this._chart(b)}
                <div class="bz-row"><span>Lucro estimado</span><b>${brl(Business.estimate(b))}/dia${b.mkt > Economy.day ? ' · 📣 campanha' : ''}</b></div>
                <div class="bz-row"><span>Caixa (limpo)</span><b>${brl(b.cash)}</b></div>
                <div class="bz-btns"><button data-biz="collect" data-id="${b.id}" ${b.cash > 0 && (here || mgr) ? '' : 'disabled'}>Recolher${here || mgr ? '' : ' (vá até lá)'}</button></div>
                <div class="bz-row"><span>Cofre de lavagem</span><b>${brl(b.dirty)} sujos · até ${brl(cap)}/dia · perda ${loss}%</b></div>
                <div class="bz-btns">${[1000, 5000].map((v) => `<button data-biz="dep" data-id="${b.id}" data-arg="${v}" ${inv.cash > 0 && (here || mgr) ? '' : 'disabled'}>Deixar ${brl(v)}</button>`).join('')}<button data-biz="dep" data-id="${b.id}" data-arg="all" ${inv.cash > 0 && (here || mgr) ? '' : 'disabled'}>Deixar todo o sujo</button>${here || mgr ? '' : '<span class="bz-dim">(só na loja, ou com gerente)</span>'}</div>
                <div class="bz-up">${ups}<span>📣 Campanha de marketing<br><small style="color:var(--tx-3)">+35% de faturamento por 5 dias</small></span><button data-biz="mkt" data-id="${b.id}" ${b.mkt > Economy.day ? 'disabled' : ''}>${b.mkt > Economy.day ? 'no ar' : brl(Business.mktCost(b))}</button></div>
                ${b.log.length ? `<div class="bz-log">Ontem: ${b.log.join(' · ')}</div>` : ''}
                <div class="bz-btns"><button data-biz="map" data-id="${b.id}">📍 Mapa</button><button data-biz="sell" data-id="${b.id}">Vender (${brl((b.price + b.spent) * 0.7)})</button></div></div>`;
        }
        h += '</div>';
        const M = this._market();
        h += `<div class="bz-box"><h3>🛒 À VENDA PERTO DE VOCÊ <small>compra no balcão da loja · dinheiro limpo</small></h3>
            <table><tr><th>Loja</th><th>Tipo</th><th>Preço</th><th>Lucro/dia (est.)</th><th>Distância</th><th></th></tr>
            ${M.map((m) => { const fake = { price: Business.price(m.d), up: {}, mkt: 0, style: m.d.style }; return `<tr><td>${m.name}</td><td>${(Economy.STYLES[m.d.style] || {}).label || ''}</td><td>${brl(fake.price)}</td><td>${brl(Business.estimate(fake))}</td><td>${Math.round(m.dist)} m</td><td><button data-biz="map" data-id="${m.id}">📍</button></td></tr>`; }).join('')}</table>
            <p class="bz-dim">Lojas da favela viram fachada do C.V (comprar o ponto, no balcão). Loja de armas pede ficha limpa (nenhum crime na ficha).</p></div>`;
        el.innerHTML = h;
    }
}
