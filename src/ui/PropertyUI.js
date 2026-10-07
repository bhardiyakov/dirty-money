// ============================================================================
// PropertyUI — a ficha de um imóvel (economy/RealEstate.js): padrão, região, metragem, preço e R$/m² comparado com a ilha.
// À venda: COMPRAR (limpo fora da favela, sujo só na favela). Seu: DORMIR (salva), BAÚ/COFRE/GELADEIRA (StashUI), MORAR AQUI,
// VENDER. ↑/↓ escolhe · Enter confirma · Esc/E fecha. Enquanto aberta o jogo segue parado atrás (Game consulta `open`).
// ============================================================================

class PropertyUI {
    constructor(game) {
        this.g = game;
        this.open = false; this.cool = 0; this.sel = 0; this.p = null; this.opts = [];
        const st = document.createElement('style');
        st.textContent = `
        #propUI .pp{width:min(640px,95vw)}
        #propUI .tbl{background:var(--card);border:1px solid var(--line);border-radius:var(--r-2);padding:10px 14px;font-size:14px;line-height:2}
        #propUI .tbl div{display:flex;justify-content:space-between;gap:10px;color:var(--tx-2)}
        #propUI .tbl b{color:var(--tx);font-weight:700}
        #propUI .note{font-size:12px;line-height:1.6;color:var(--tx-3);margin:10px 0 2px}`;
        document.head.appendChild(st);
        const r = this.root = document.createElement('div');
        r.id = 'propUI';
        r.innerHTML = '<div class="pp"><h3></h3><div class="sub"></div><div class="tbl"></div><div class="note"></div><div class="opts"></div><div class="msg"></div></div>';
        document.body.appendChild(r);
        this.$h = r.querySelector('h3'); this.$sub = r.querySelector('.sub'); this.$tbl = r.querySelector('.tbl'); this.$note = r.querySelector('.note'); this.$opts = r.querySelector('.opts'); this.$msg = r.querySelector('.msg');
        r.addEventListener('mousedown', (e) => { if (e.target === r) this.close(); });
        window.addEventListener('keydown', (e) => this._key(e));
    }

    update(dt) { if (this.cool > 0) this.cool -= dt; }

    show(p) {
        this.p = p; this.open = true; this.sel = 0; this.$msg.textContent = '';
        this.root.style.display = 'flex';
        this.g.input.releaseVirtual && this.g.input.releaseVirtual('pad');
        AudioFX.blip(480, 0.1, 0.15);
        this.render();
    }
    close() { if (!this.open) return; this.open = false; this.cool = 0.35; this.root.style.display = 'none'; AudioFX.blip(360, 0.1, 0.12); }
    msg(t, ok = true) { this.$msg.textContent = t; this.$msg.style.color = ok ? '#8be08b' : '#ff8a8a'; }

    render() {
        const g = this.g, p = this.p, inv = g.inventory, R = RealEstate, own = R.isOwned(p), price = R.price(p), ppm = R.pricePerM2(p), isl = R.islandPpm();
        this.$h.textContent = `${p.type.toUpperCase()}`;
        this.$sub.innerHTML = `${p.region.toUpperCase()} · ${'★'.repeat(p.stars)}${'☆'.repeat(5 - p.stars)}<br>SEU DINHEIRO: ${brl(inv.cash)} · LIMPO: <span style="color:#7fe0a0">${brl(inv.clean)}</span>`;
        const pct = Math.round(ppm / isl * 100);
        this.$tbl.innerHTML = `<div><span>ÁREA</span><b>${p.size} m²</b></div><div><span>${own ? 'VALOR DE MERCADO HOJE' : 'PREÇO'}</span><b>${brl(price)}</b></div>`
            + `<div><span>GARAGEM</span><b>${(Garage.byId(p.id) || { cap: 0 }).cap} vaga(s) na rua em frente</b></div>`
            + `<div><span>VALOR DO m²</span><b>${brl(ppm)}</b></div><div><span>REFERÊNCIA: ILHA (m²)</span><b>${brl(isl)}</b></div><div><span>ESTE LUGAR vs ILHA</span><b>${pct}%</b></div>`
            + (own ? `<div><span>VOCÊ PAGOU</span><b>${brl(R.owned[p.id].paid)}</b></div><div><span>REFORMA</span><b>${R.reformLevel(p) ? R.REFORMS[R.reformLevel(p)].name.toUpperCase() : 'ORIGINAL'}</b></div>` : '');
        this.$note.textContent = own ? (R.homeId === p.id ? 'Sua casa atual.' : 'Você é dono deste imóvel.')
            : (R.needsClean(p) ? 'Fora da favela: só dinheiro LIMPO (lave nas fachadas).' : 'Na favela: aceita dinheiro sujo.')
            + ' Quanto mais perto da orla e da ilha, mais caro e sofisticado. Favela e entorno são bem mais baratos.';
        const o = [], inside = !!(Interiors.active && Interiors.active.shop.home === p);
        if (!own) {
            const wallet = R.needsClean(p) ? inv.clean : inv.cash;
            if (!inside) o.push({ label: 'VISITAR O IMÓVEL', sub: 'entre e conheça por dentro antes de decidir (sem a polícia no seu rastro)', ok: true, fn: () => this._visit() });
            o.push({ label: `COMPRAR POR ${brl(price)}`, sub: R.needsClean(p) ? 'dinheiro limpo' : 'dinheiro sujo', ok: wallet >= price, fn: () => R.buy(g, p) });
            if (inside) o.push({ label: 'CONTINUAR VISITANDO', sub: 'fechar a proposta', ok: true, fn: () => { this.close(); return null; } });
        } else {
            const hrs = R.sleepHours(p);
            o.push({ label: 'DORMIR E SALVAR', sub: `${hrs} horas de sono: recupera a vida e grava o progresso`, ok: true, fn: () => this._sleep() });
            o.push({ label: 'BAÚ', sub: 'armas, munição, kits e o que quiser', ok: true, fn: () => this._stash('chest') });
            o.push({ label: 'COFRE', sub: 'dinheiro e joias', ok: true, fn: () => this._stash('safe') });
            o.push({ label: 'GELADEIRA', sub: 'comida e água', ok: true, fn: () => this._stash('fridge') });
            const G = Garage.byId(p.id);
            if (G && G.cap) o.push({ label: `GARAGEM — ${Garage.carsIn(G).length}/${G.cap} VAGA(S)`, sub: 'seus carros: onde estão, levar para outra casa, vender', ok: true, fn: () => { this.close(); this.g.carUI.showGarage(G); return null; } });
            const rf = R.reformInfo(p), lv = R.reformLevel(p);
            o.push(rf ? { label: `REFORMAR: ${rf.name.toUpperCase()} — ${brl(rf.cost)}`, sub: `dinheiro limpo · valoriza ${Math.round(rf.gain * 100)}% · ${rf.perk}`, ok: inv.clean >= rf.cost, fn: () => R.reform(g, p) }
                : { label: 'REFORMA: PADRÃO MÁXIMO', sub: 'nada mais a reformar neste imóvel', ok: false, fn: () => null });
            if (R.homeId !== p.id) o.push({ label: 'TORNAR ESTA A MINHA SAFE HOUSE', sub: Standing.territoryAt(p.x, p.z) ? 'fica no território do C.V' : 'fora da favela: o C.V passa a te ver como ESTRANHO e você acorda aqui', ok: true, fn: () => R.moveIn(p) });
            else o.push({ label: 'VOLTAR PARA A SAFE HOUSE DA FAVELA', sub: 'volta a ser morador do C.V', ok: true, fn: () => R.moveBack() });
            o.push({ label: `VENDER POR ${brl(Math.round(price * 0.8 / 100) * 100)}`, sub: '80% do valor de mercado (inclui a valorização das reformas), em dinheiro limpo', ok: R.homeId !== p.id && !inside, fn: () => R.sell(g, p) });
        }
        this.opts = o;
        this.sel = Math.max(0, Math.min(this.sel, o.length - 1));
        this.$opts.replaceChildren(...o.map((x, i) => {
            const b = document.createElement('button');
            b.className = 'opt' + (i === this.sel ? ' sel' : '') + (x.ok ? '' : ' off');
            b.innerHTML = `${x.label}<small>${x.sub}</small>`;
            b.addEventListener('click', () => { this.sel = i; this.choose(); });
            return b;
        }));
    }

    choose() {
        const o = this.opts[this.sel];
        if (!o || !o.ok) { AudioFX.blip(160, 0.1, 0.14); return; }
        const r = o.fn();
        if (r) { this.msg(r.msg, r.ok); AudioFX.blip(r.ok ? 800 : 200, 0.1, 0.16); }
        if (this.open) this.render();
    }

    _visit() { this.close(); const p = this.p; Interiors.enterHome(this.g, p); return null; }
    _stash(box) { this.close(); this.g.stashUI.show(box); }
    _sleep() { this.close(); this.g._startSleep('here', this.p); }

    _key(e) {
        if (!this.open) return;
        const k = e.key;
        if (k === 'Escape' || k === 'e' || k === 'E' || k === 'Backspace') { this.close(); e.preventDefault(); e.stopPropagation(); return; }
        if (k === 'ArrowUp' || k === 'w' || k === 'W') this.sel = (this.sel + this.opts.length - 1) % this.opts.length;
        else if (k === 'ArrowDown' || k === 's' || k === 'S') this.sel = (this.sel + 1) % this.opts.length;
        else if (k === 'Enter' || k === ' ') { this.choose(); e.preventDefault(); e.stopPropagation(); return; }
        else return;
        e.preventDefault(); e.stopPropagation();
        this.render();
    }
}
