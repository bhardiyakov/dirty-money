// ============================================================================
// EmpireUI — a aba IMPÉRIO do menu de pausa (tecla O → aba ao lado) e as barras de ENERGIA/EXPOSIÇÃO no HUD.
// Seções: dia e estação · negócios (galpões, soldados, cofre, fachadas) · malha de influência (contatos, presentes, missões) ·
// domínio dos distritos. Cliques: data-emp="ação" data-arg="…"; selects de alocação: data-soldier.
// ============================================================================

class EmpireUI {
    constructor(game) {
        this.g = game;
        this.el = null;
        EmpireUI._css();
    }

    static _css() {
        if (EmpireUI._styled) return;
        EmpireUI._styled = true;
        const st = document.createElement('style');
        st.textContent = `
            #pmEmpire { width: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding-right: 4px; }
            #pmEmpire .em-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap: 12px; align-items: start; }
            #pmEmpire .cr-box h3 small { color: var(--blue); font-size: 11px; margin-left: 6px; }
            #pmEmpire button, #pmEmpire select { font: inherit; font-size: 12px; padding: 6px 9px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--card-h); color: var(--tx); font-weight: 600; cursor: pointer; }
            #pmEmpire button:hover:not([disabled]) { background: rgba(255,255,255,0.14); border-color: var(--gold); }
            #pmEmpire button[disabled] { opacity: 0.4; cursor: not-allowed; }
            #pmEmpire .em-row { display: flex; gap: 8px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
            #pmEmpire .em-btns { display: flex; gap: 6px; flex-wrap: wrap; }
            #pmEmpire .hearts { color: #ff6a8a; letter-spacing: 1px; } #pmEmpire .hearts.neg { color: var(--blue); }
            #pmEmpire table { border-collapse: collapse; width: 100%; } #pmEmpire td, #pmEmpire th { padding: 4px 5px; text-align: left; font-size: 12px; border-bottom: 1px solid var(--line); vertical-align: top; } #pmEmpire th { color: var(--blue); }
            #pmEmpire .ok { color: #5ac07a; } #pmEmpire .dom { color: var(--gold); font-weight: 700; }
            #hud2 .emp-panel { padding: 10px 14px 11px; display: flex; flex-direction: column; gap: 7px; font-size: 12px; }
            #hud2 .emp-panel .r { display: flex; align-items: center; gap: 9px; } #hud2 .emp-panel .r span { width: 22px; text-align: center; font-family: var(--emoji); font-size: 16px; }
            #hud2 .emp-panel i { flex: 1; height: 8px; border-radius: 99px; background: rgba(255,255,255,0.08); overflow: hidden; } #hud2 .emp-panel i s { display: block; height: 100%; border-radius: 99px; transition: width .3s; }
            #hud2 .emp-panel .d { font-size: 11px; font-weight: 600; color: var(--tx-2); display: flex; justify-content: space-between; gap: 8px; }
            #hud2 .emp-panel .d b { color: var(--red); }`;
        document.head.appendChild(st);
    }

    // ---------------------------------------------------------------- HUD (barras)
    static hud(g) {
        const e = g.empire, root = document.getElementById('hud2');
        if (!e || !root) return;
        EmpireUI._css();
        let p = EmpireUI._panel;
        if (!p) {
            p = EmpireUI._panel = document.createElement('div');
            p.className = 'px emp-panel';
            p.innerHTML = '<div class="r"><span>⚡</span><i><s id="empEn"></s></i></div><div class="r"><span>🔥</span><i><s id="empEx"></s></i></div><div class="d" id="empD"></div>';
            root.appendChild(p);
        }
        EmpireUI._t = (EmpireUI._t || 0) + 1;
        if (EmpireUI._t % 6) return;                                     // ~5× por segundo basta
        const d = e.here, en = Math.round(e.energy), ex = Math.round(e.exposure);
        const key = en + '|' + ex + '|' + d + '|' + !!e.alerts[d] + '|' + e.seasonId;
        if (key === EmpireUI._key) return;
        EmpireUI._key = key;
        const enEl = document.getElementById('empEn'), exEl = document.getElementById('empEx');
        enEl.style.width = en + '%'; enEl.style.background = en < 12 ? '#f43f5e' : 'linear-gradient(90deg,#fbbf24,#34d399)';
        exEl.style.width = ex + '%'; exEl.style.background = ex >= 100 ? '#f43f5e' : 'linear-gradient(90deg,#fb923c,#f43f5e)';
        document.getElementById('empD').innerHTML = `<span>${e.dName(d)}${e.alerts[d] ? ' · <b>alerta tático</b>' : ''}</span><span>${e.seasonDef.name} · ${e.seasonLeft}d</span>`;
    }

    // ---------------------------------------------------------------- aba
    bind(el) {
        if (this.el === el) return;
        this.el = el;
        el.addEventListener('click', (ev) => {
            const b = ev.target.closest('button[data-emp]');
            if (!b || b.disabled) return;
            const msg = this.act(b.dataset.emp, b.dataset.arg, b.dataset.arg2);
            if (msg) this.g._flash(msg);
            if (this.g.menu.isOpen) this.render();
        });
        el.addEventListener('change', (ev) => {
            const s = ev.target.closest('select[data-soldier]');
            if (s) { const m = this.g.empire.biz.assign(s.dataset.soldier, s.value); if (m) this.g._flash(m); this.render(); }
            const sd = ev.target.closest('select[data-target]');
            if (sd) { this[sd.dataset.target] = sd.value; }
        });
    }

    act(a, arg, arg2) {
        const g = this.g, e = g.empire, B = e.biz, I = e.influence, C = g.careers;
        const job = (j) => { const r = C.startExternal(j); if (r.ok) g.menu.close(); return r.msg; };
        switch (a) {
            case 'warehouse': return B.buyWarehouse();
            case 'recruit': return B.recruit();
            case 'collect': return B.collect();
            case 'front': return B.buyFront(arg);
            case 'gift': return I.gift(arg, arg2);
            case 'tribute': return I.tribute(arg);
            case 'extort': return job(new EmpireTargetJob(e.stub, 'extort', this.extortD || null));
            case 'raze': return job(new EmpireBombJob(e.stub, 'raze', this.razeD || null));
            case 'contract': return job(new EmpireTargetJob(e.stub, 'hit', null));
            case 'sabotage': return job(new EmpireBombJob(e.stub, 'sabotage', null));
            case 'bankGps': { const b = Banks.get(arg); if (b) { g.setGps(b.x, b.z, b.name); g.menu.close(); } return null; }
            case 'blueprint': return Banks.buyBlueprint(g, arg);
            case 'bribe': return Banks.bribe(g, arg);
            case 'power': return job(new BankPowerJob(e.stub, Banks.get(arg)));
            case 'stashHot': return Banks.stash(g);
        }
        return null;
    }

    render(el = this.el) {
        if (!el) return;
        this.bind(el);
        const prev = el.scrollTop, g = this.g, e = g.empire, B = e.biz, I = e.influence, D = e.dominion;
        const bar = (v, col) => `<div class="cr-bar"><i><s style="width:${Math.max(0, Math.min(100, v))}%;background:${col}"></s></i></div>`;
        const row = (k, v) => `<div class="cr-row"><span>${k}</span><b>${v}</b></div>`;
        const dists = Object.entries(Empire.DISTRICTS).filter(([d]) => d !== 'periferia' && d !== 'favela');
        const opt = (sel, none) => (none ? `<option value="">${none}</option>` : '') + dists.map(([d, X]) => `<option value="${d}" ${sel === d ? 'selected' : ''}>${X.name}</option>`).join('');
        const here = e.here, S = e.seasonDef;
        const def = dists.some(([d]) => d === here) ? here : '';
        if (this.extortD === undefined) this.extortD = def;
        if (this.razeD === undefined) this.razeD = def;

        let h = `<div class="cr-box"><h3>DIA ${Economy.day} · ${g.dayNight.label} · ${e.dName(here)}${e.alerts[here] ? ' <small style="color:#ff5a4d">ALERTA TÁTICO</small>' : ''}</h3>
            <div class="em-grid"><div>${row('⚡ Energia', Math.round(e.energy))}${bar(e.energy, 'linear-gradient(90deg,#ffd23a,#5ac07a)')}${row('🔥 Exposição', Math.round(e.exposure))}${bar(e.exposure, 'linear-gradient(90deg,#ff9a3a,#ff3a8a)')}
            <p class="cr-dim">Ações gastam energia e esquentam a exposição. Exposição cheia = alerta tático no distrito. Energia zerada = desmaio (perde o sujo da mochila). Dormir zera tudo.</p></div>
            <div><b style="color:#ffd23a">ESTAÇÃO: ${S.name.toUpperCase()}</b> <small style="color:#8fb4ff">faltam ${e.seasonLeft} dia(s)</small><p class="cr-dim">${S.desc}</p><p class="cr-dim">Depois: <b style="color:#e8edf8">${e.nextSeason.name}</b> — ${e.nextSeason.desc}</p></div></div></div>`;

        // negócios
        h += `<div class="em-grid"><div class="cr-box"><h3>NEGÓCIOS <small>automação</small></h3>
            ${row('Galpões', `${B.warehouses} (${B.soldiers.length}/${B.capacity} soldados)`)}${row('Cofre do galpão (sujo)', brl(B.vault))}
            <div class="em-btns"><button data-emp="warehouse">Comprar galpão (${brl(EmpireBusiness.WAREHOUSE_PRICE * (1 + B.warehouses * 0.5))})</button>
            <button data-emp="recruit" ${B.soldiers.length < B.capacity ? '' : 'disabled'}>Recrutar soldado (${brl(EmpireBusiness.RECRUIT_PRICE)} + ${brl(EmpireBusiness.WAGE)}/dia)</button>
            <button data-emp="collect" ${B.vault > 0 ? '' : 'disabled'}>Recolher o cofre (na favela ou em casa)</button></div>
            <table><tr><th>Soldado</th><th>Distrito</th><th>Rende/dia</th></tr>${B.soldiers.map((s) => `<tr><td>${s.name}${s.jail ? ` <span style="color:#ff5a4d">(preso ${s.jail}d)</span>` : ''}</td><td><select data-soldier="${s.id}">${opt(s.d, 'folga')}</select></td><td>${s.d && !s.jail ? brl(B.takePer(s.d)) : '—'}</td></tr>`).join('') || '<tr><td colspan="3" class="cr-dim">Sem soldados: compre um galpão e recrute.</td></tr>'}</table>
            <h3 style="font-size:13px;margin-top:8px">ROTAS DE LAVAGEM <small>lavam o cofre todo dia</small></h3>
            <table><tr><th>Fachada</th><th>Distrito</th><th>Lava/dia</th></tr>${B.fronts.map((f) => { const F = EmpireBusiness.FRONTS[f.type]; return `<tr><td>${F.name}</td><td>${e.dName(f.d)}</td><td>${brl(F.cap)} (−${Math.round(F.loss * 100)}%)</td></tr>`; }).join('') || '<tr><td colspan="3" class="cr-dim">Nenhuma: o dinheiro do cofre fica sujo até você recolher.</td></tr>'}</table>
            <p class="cr-dim">Comprar aqui abre a fachada no distrito onde você está agora (${e.dName(here)}).</p><div class="em-btns">${Object.entries(EmpireBusiness.FRONTS).map(([k, F]) => `<button data-emp="front" data-arg="${k}">${F.name} ${brl(F.price)}</button>`).join('')}</div>
            ${B.log.length ? `<p class="cr-dim">Último dia: ${B.log.join(' · ')}</p>` : ''}</div>`;

        // influência
        h += `<div class="cr-box"><h3>MALHA DE INFLUÊNCIA <small>corações utilitários</small></h3><table><tr><th>Contato</th><th>Relação</th><th></th></tr>`;
        for (const [id, C] of Object.entries(EmpireInfluence.CONTACTS)) {
            const v = I.hearts(id), hearts = v >= 0 ? '❤'.repeat(Math.floor(v)) + (v % 1 >= 0.5 ? '♡' : '') : '✖'.repeat(Math.ceil(-v));
            let act = '';
            if (C.kind === 'delegado') act = here === C.d ? Object.entries(EmpireInfluence.GIFTS).map(([k, G]) => `<button data-emp="gift" data-arg="${id}" data-arg2="${k}" ${I.lastGift[id] === Economy.day ? 'disabled' : ''}>${G.name.split(' ')[0]} ${brl(G.price)}</button>`).join(' ') : `<span class="cr-dim">vá até o distrito</span>`;
            else if (C.kind === 'fornecedor') act = '<button data-emp="contract">Contrato de assassinato</button> <button data-emp="sabotage">Sabotagem</button>';
            else act = `<button data-emp="tribute" data-arg="${id}">Pagar tributo ${brl(10000)}</button>`;
            h += `<tr><td>${C.name}</td><td><span class="hearts ${v < 0 ? 'neg' : ''}">${hearts || '—'}</span> ${v.toFixed(1)}</td><td><div class="em-btns">${act}</div></td></tr>`;
        }
        h += `</table><p class="cr-dim">Delegado com 10 ❤: viaturas do distrito com metade do alcance e estrelas subindo na metade da velocidade (presentes: 1 por dia, entregue no distrito; sem presente há 3 dias, ele esfria). Fornecedor com 10 ❤: armas 40% mais baratas. Facções com relação −4 ou pior emboscam suas rotas.</p>
            <div class="em-row"><span>Extorquir vereador em</span><select data-target="extortD">${opt(this.extortD, 'qualquer distrito')}</select><button data-emp="extort">Ir</button></div>
            <div class="em-row" style="margin-top:6px"><span>Destruir galpão rival em</span><select data-target="razeD">${opt(this.razeD, 'qualquer distrito')}</select><button data-emp="raze">Ir</button></div></div></div>`;

        // bancos
        h += `<div class="cr-box"><h3>BANCOS <small>3 sedes · 7 agências</small></h3>
            <div class="em-grid"><div>${row('Saldo em conta (limpo, rende 0,15%/dia)', brl(Banks.account))}${row('Alerta do COAF', Math.round(Banks.coaf) + '%')}${bar(Banks.coaf, '#ff5a4d')}
            ${row('Cédulas marcadas com você', `${brl(Banks.hot)} (${Banks.hotKg} kg)`)}<div class="em-btns"><button data-emp="stashHot" ${Banks.hot > 0 ? '' : 'disabled'}>Guardar as cédulas no cofre do galpão (na favela/em casa)</button></div>
            ${row('Portas no firewall', Object.entries(Banks.backdoor).map(([b, n]) => `${Banks.BRANDS[b].name} (${n}d)`).join(', ') || 'nenhuma')}
            <p class="cr-dim">Agência: roubo rápido (caixas eletrônicos e cofre de caixa, Ladrão Arrombador+), pendrive no terminal do gerente (Estelionato Golpista+). Conta e depósitos: fale com o caixa em qualquer agência.</p></div>
            <div><table><tr><th>Banco</th><th>Distrito</th><th></th></tr>${Banks.list.map((b) => `<tr><td style="color:${Banks.BRANDS[b.brand].color}">${b.name}</td><td>${e.dName(e.districtAt(b.x, b.z))}</td><td><button data-emp="bankGps" data-arg="${b.id}">GPS</button></td></tr>`).join('')}</table></div></div>
            <h3 style="font-size:13px;margin-top:8px">PLANEJAMENTO DAS SEDES <small>Ladrão: Especialista em Cofres</small></h3>
            <table><tr><th>Sede</th><th>Planta baixa</th><th>Energia (hoje)</th><th>Vigilantes (hoje)</th><th>Cofres abertos</th></tr>${Banks.hqs().map((b) => { const P = Banks.plans[b.id] || {}; return `<tr><td style="color:${Banks.BRANDS[b.brand].color}">${b.name}</td>
                <td>${P.blueprint ? '<span class="ok">✔</span>' : `<button data-emp="blueprint" data-arg="${b.id}">${brl(25000)} (favela)</button>`}</td>
                <td>${P.power === Economy.day ? '<span class="ok">✔ cortada</span>' : `<button data-emp="power" data-arg="${b.id}">Cortar</button>`}</td>
                <td>${P.bribe === Economy.day ? '<span class="ok">✔ comprados</span>' : `<button data-emp="bribe" data-arg="${b.id}">${brl(b.brand === 'nacional' ? 45000 : 15000)}</button>`}</td><td>${P.done || 0}</td></tr>`; }).join('')}</table>
            <p class="cr-dim">Sem planta você não acha o cofre. Sem energia cortada o laser dispara no meio da perfuração. Sem vigilantes comprados, a perfuração aciona o sensor e a polícia chega antes. Com energia cortada hoje, a sede pode ser invadida à noite. Cercado lá dentro: negociação de reféns.</p></div>`;

        // domínio
        h += `<div class="cr-box"><h3>DOMÍNIO DA CIDADE <small>${D.count}/${D.districts.length} distritos</small></h3><table><tr><th>Distrito</th><th>Lavagem</th><th>Influência</th><th>Força</th><th></th></tr>`;
        for (const d of D.districts) {
            const G = D.goals(d), cell = (c) => `<td class="${D.done(d, c) ? 'ok' : ''}">${D.done(d, c) ? '✔ ' : ''}${G[c][0]} <b>${Math.min(G[c][1], G[c][2])}/${G[c][2]}</b></td>`;
            h += `<tr><td>${e.dName(d)}</td>${cell('lavagem')}${cell('influencia')}${cell('forca')}<td class="dom">${D.dominated(d) ? '👑 DOMINADO' : ''}</td></tr>`;
        }
        h += `</table><p class="cr-dim">Lavagem completa: soldados rendem +25% no distrito. Influência: a polícia vê 15% menos. Força: sem emboscadas. As três = distrito dominado (mais bônus). Todos = dono da cidade.</p></div>`;

        el.innerHTML = h;
        el.scrollTop = prev;
    }
}
