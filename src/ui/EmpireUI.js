// ============================================================================
// EmpireUI — a aba IMPÉRIO do menu de pausa (tecla O → aba ao lado) e o cartão de distrito/estação no HUD.
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

    // ---------------------------------------------------------------- HUD: CHEGADA num bairro ou região
    // (o nome do distrito e a estação saíram do canto da tela — HUD limpo.) Chegou num bairro (Empire: distrito) ou perto de um lugar
    // com nome no mapa (Lagoa, Corcovado, Maracutaia, Pão de Mel, Pântano…): o NOME GRANDE no centro da tela por ~3 s, com o dono
    // da área (facção) ou a estação embaixo. Só depois de ~1,2 s no lugar novo (a divisa não fica piscando) e não repete o mesmo
    // lugar dentro de 1 minuto.
    static hud(g) {
        const e = g.empire;
        if (!e || !g._bootDone || Interiors.active || (g.menu && g.menu.isOpen)) return;
        EmpireUI._t = (EmpireUI._t || 0) + 1;
        if (EmpireUI._t % 6) return;                                     // ~5× por segundo basta
        const P = g._playerState().pos, now = performance.now() / 1000;
        let name = null, sub = null;
        for (const r of (typeof WorldMap !== 'undefined' && WorldMap.regions) || []) {
            if (!EmpireUI.SPOTS.has(r.name)) continue;
            if (Math.hypot(P.x - r.x, P.z - r.z) < 120 * (r.size || 1)) { name = r.name; break; }
        }
        const d = e.here;
        if (!name) name = e.dName(d);
        const T = typeof Standing !== 'undefined' && Standing.territoryAt ? Standing.territoryAt(P.x, P.z) : null;
        sub = T ? `Área do ${T.name} (${T.sigla})` : `${e.seasonDef.name} · ${e.seasonLeft} ${e.seasonLeft === 1 ? 'dia' : 'dias'}`;
        if (name !== EmpireUI._cand) { EmpireUI._cand = name; EmpireUI._candT = now; return; }
        if (name === EmpireUI._shown || now - EmpireUI._candT < 1.2) return;
        EmpireUI._shown = name;
        const seen = EmpireUI._seen || (EmpireUI._seen = {});
        if (seen[name] && now - seen[name] < 60) return;
        seen[name] = now;
        EmpireUI.arrive(name, sub);
    }
    static get SPOTS() { return new Set(['LAGOA RODRIGO DE FRITAS', 'CORCUNDÃO · CRISTO ACOLHEDOR', 'MARACUTAIA', 'PÃO DE MEL', 'PÂNTANO', 'CANAL', 'SERRA DO NORTE', 'SERRA DO SUL', 'SERRA DO MEIO', 'FAZENDAS']); }
    // O aviso de chegada (também usado por quem quiser anunciar um lugar).
    static arrive(name, sub) {
        let el = document.getElementById('arrive');
        if (!el) {
            const st = document.createElement('style');
            st.textContent = `#arrive { position: fixed; left: 50%; top: 22%; transform: translate(-50%, -6px); z-index: 12; pointer-events: none; text-align: center; opacity: 0;
                    transition: opacity .6s ease, transform .6s ease; font-family: var(--font); }
                #arrive.show { opacity: 1; transform: translate(-50%, 0); }
                #arrive b { display: block; font: 900 clamp(28px, 4.6vw, 54px)/1.05 var(--font-d); letter-spacing: 0.06em; text-transform: uppercase; color: #fff;
                    text-shadow: 0 3px 0 rgba(0,0,0,0.55), 0 0 22px rgba(0,0,0,0.6); }
                #arrive i { display: block; width: 46%; height: 2px; margin: 8px auto 6px; background: linear-gradient(90deg, transparent, var(--gold, #fbbf24), transparent); }
                #arrive small { font: 700 clamp(12px, 1.4vw, 16px) var(--font); letter-spacing: 0.16em; text-transform: uppercase; color: #e5e7eb; text-shadow: 0 2px 6px rgba(0,0,0,0.8); }
                body.mobile #arrive { top: 26%; }`;
            document.head.appendChild(st);
            el = document.createElement('div'); el.id = 'arrive'; document.body.appendChild(el);
        }
        el.innerHTML = `<b>${name}</b><i></i><small>${sub || ''}</small>`;
        el.classList.add('show');
        clearTimeout(EmpireUI._arT);
        EmpireUI._arT = setTimeout(() => el.classList.remove('show'), 3200);
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
        const dists = Object.entries(Empire.DISTRICTS).filter(([d]) => !Empire.OUTSKIRTS.includes(d));
        const opt = (sel, none) => (none ? `<option value="">${none}</option>` : '') + dists.map(([d, X]) => `<option value="${d}" ${sel === d ? 'selected' : ''}>${X.name}</option>`).join('');
        const here = e.here, S = e.seasonDef;
        const def = dists.some(([d]) => d === here) ? here : '';
        if (this.extortD === undefined) this.extortD = def;
        if (this.razeD === undefined) this.razeD = def;

        let h = `<div class="cr-box"><h3>DIA ${Economy.day} · ${g.dayNight.label} · ${e.dName(here)}</h3>
            <div class="em-grid"><div><b style="color:#ffd23a">ESTAÇÃO: ${S.name.toUpperCase()}</b> <small style="color:#8fb4ff">faltam ${e.seasonLeft} dia(s)</small><p class="cr-dim">${S.desc}</p><p class="cr-dim">Depois: <b style="color:#e8edf8">${e.nextSeason.name}</b> — ${e.nextSeason.desc}</p></div></div></div>`;

        // negócios
        h += `<div class="em-grid"><div class="cr-box"><h3>NEGÓCIOS <small>automação</small></h3>
            ${row('Galpões', `${B.warehouses} (${B.soldiers.length}/${B.capacity} soldados)`)}${row('Cofre do galpão (sujo)', brl(B.vault))}
            <div class="em-btns"><button data-emp="warehouse">Comprar galpão (${brl(EmpireBusiness.WAREHOUSE_PRICE * (1 + B.warehouses * 0.5))})</button>
            <button data-emp="recruit" ${B.soldiers.length < B.capacity ? '' : 'disabled'}>Recrutar soldado (${brl(EmpireBusiness.RECRUIT_PRICE)} + ${brl(EmpireBusiness.WAGE)}/dia)</button>
            <button data-emp="collect" ${B.vault > 0 ? '' : 'disabled'}>Recolher o cofre (na favela ou em casa)</button></div>
            <table><tr><th>Soldado</th><th>Distrito</th><th>Rende/dia</th></tr>${B.soldiers.map((s) => `<tr><td>${s.name}${s.jail ? ` <span style="color:#ff5a4d">(preso ${s.jail}d)</span>` : ''}</td><td><select data-soldier="${s.id}">${opt(s.d, 'folga')}</select></td><td>${s.d && !s.jail ? brl(B.takePer(s.d)) : '—'}</td></tr>`).join('') || '<tr><td colspan="3" class="cr-dim">Sem soldados: compre um galpão e recrute.</td></tr>'}</table>
            <h3 style="font-size:13px;margin-top:8px">ROTAS DE LAVAGEM <small>lavam o cofre todo dia</small></h3>
            <table><tr><th>Fachada</th><th>Distrito</th><th>Lava/dia</th></tr>${B.fronts.map((f) => { const F = EmpireBusiness.FRONTS[f.type]; return `<tr><td>${F.name}${f.at ? ` <span class="cr-dim">· ${f.at}</span>` : ''}</td><td>${e.dName(f.d)}</td><td>${brl(F.cap)} (−${Math.round(F.loss * 100)}%)</td></tr>`; }).join('') || '<tr><td colspan="3" class="cr-dim">Nenhuma: o dinheiro do cofre fica sujo até você recolher.</td></tr>'}</table>
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
            <div><table><tr><th>Banco</th><th>Distrito</th><th></th></tr>${Banks.list.map((b) => `<tr><td style="color:${Banks.BRANDS[b.brand].color}">${b.name}</td><td>${e.dName(e.districtAt(b.x, b.z))}</td><td><button data-emp="bankGps" data-arg="${b.id}">Marcar</button></td></tr>`).join('')}</table></div></div>
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
