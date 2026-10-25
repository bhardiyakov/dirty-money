// ============================================================================
// Mechanic — as OFICINAS e as telas do CAPÔ e do BALCÃO DE PEÇAS (a condição dos carros mora em vehicle/CarCare.js).
//   OFICINA PAY N PAY  (as fachadas amarelas de oficina da cidade, quase todas na zona industrial): chegue DIRIGINDO, pare na frente e
//                      aperte E — diagnóstico com orçamento por peça (peça + mão de obra), "consertar tudo", retífica do motor,
//                      vazamento de óleo, funilaria e PINTURA. Pagamento como
//                      no comércio legal: acima de R$ 800, só dinheiro limpo. Cada serviço leva um tempinho do relógio.
//   BORRACHARIA DO POSTO  em todo posto de gasolina, longe das bombas (ou de tanque cheio): pneus, troca de óleo e bateria.
//   MECÂNICO DO MORRO  no desmanche da favela: todos os serviços 20% mais baratos, aceita dinheiro sujo e faz PLACA FRIA.
//   BALCÃO DE PEÇAS    a pé, na porta da oficina (ou de um posto): peças, ferramentas e consumíveis para consertar você mesmo no capô.
// ============================================================================

const Mechanic = {
    LABOR: { battery: 80, cool: 320, oil: 70, brakes: 170, engine: 0, susp: 380, tires: 40, body: 0 },
    POSTO: ['battery', 'oil', 'tires', 'leak'],
    PAINT_ROWS: [[0, 'vermelho', '#d93a30'], [1, 'azul', '#2f6fd0'], [3, 'verde', '#2f9a5a'], [4, 'branco', '#e8eaf0'], [5, 'preto', '#2a2c33'], [7, 'laranja', '#e8742c'], [8, 'prata', '#aeb4bd'], [9, 'bordô', '#7a1f36']],
    shops: [], built: false, game: null,

    // ---------------------------------------------------------------- lugares
    build(game) {
        if (this.built || !CityGrid.blocks) return;
        this.built = true; this.game = game;
        const SH = TileFactory.SHOPS, oi = SH.findIndex((s) => s.id === 'oficina');
        for (const b of CityGrid.blocks) for (const l of b.lots) for (const s of l.shops || []) {
            if (s.kind !== oi) continue;
            const m = s.a + 3, o = 1.25;
            const p = s.side === 'S' ? { x: m, z: l.z0 - o } : s.side === 'N' ? { x: m, z: l.z1 + o } : s.side === 'W' ? { x: l.x0 - o, z: m } : { x: l.x1 + o, z: m };
            const r = RoadPlan.nearestRoadPoint(p.x, p.z, 14);
            this.shops.push({ id: 'pnp' + this.shops.length, kind: 'oficina', name: `Oficina Pay n Pay ${this.shops.length + 1}`, x: p.x, z: p.z, bay: r ? { x: r.x, z: r.z } : p, district: b.district, biome: b.biome });
        }
        for (const st of CityGrid.stations || []) this.shops.push({ id: 'pst' + this.shops.length, kind: 'posto', name: `Borracharia — ${st.name}`, x: st.x, z: st.z, bay: { x: st.x, z: st.z }, station: st, district: 'city', biome: 'commercial' });
        const C = Careers.instance, y = C && C.by.chop.yard;
        if (y) this.shops.push({ id: 'morro', kind: 'morro', name: 'Mecânico do morro', x: y.x, z: y.z, bay: { x: y.x, z: y.z }, district: 'favela', biome: 'favela' });
        // Pay n Pay que ficaram fora da amostra do mapa: todas entram na legenda (a amostra antiga do CityGrid fica)
        const have = new Set((CityGrid.pois || []).filter((q) => q.type === 'paynspray').map((q) => Math.round(q.x) + ',' + Math.round(q.z)));
        for (const s of this.shops) if (s.kind === 'oficina' && !have.has(Math.round(s.x) + ',' + Math.round(s.z))) CityGrid.addPoi({ type: 'paynspray', name: s.name, x: s.x, z: s.z });
        console.log(`[OFICINAS] ${this.shops.filter((s) => s.kind === 'oficina').length} Pay n Pay, ${this.shops.filter((s) => s.kind === 'posto').length} borracharias de posto, mecânico do morro`);
    },
    // Oficina cuja vaga (dirigindo) ou porta (a pé) está perto.
    at(x, z, foot = false) {
        let best = null, bd = foot ? 3.2 : 9;
        for (const s of this.shops) {
            const q = foot ? s : s.bay;
            if (s.kind === 'posto') { const Z = s.station.zone; if (x < Z[0] || x > Z[2] || z < Z[1] || z > Z[3]) continue; if (foot) return s; return s; }
            const d = hypot(x - q.x, z - q.z);
            if (d < bd) { bd = d; best = s; }
        }
        return best;
    },
    nearPump(s, x, z) { return s.kind === 'posto' && s.station.pumps.some((b) => hypot(b.x - x, b.z - z) < 7); },

    // ---------------------------------------------------------------- dirigindo: E na oficina
    carPrompt(game) {
        const car = game.activeCar; if (game.mode !== 'car' || !CarCare.usable(car) || car.speed > 1.5) return '';
        const s = this.at(car.position.x, car.position.z); if (!s) return '';
        if (game.wanted.level > 0 && s.kind !== 'posto') {          // procurado: pintura express (como o Pay 'n' Spray do GTA)
            if (game.policeManager && game.policeManager.playerSeen) return `<b>E</b> pintura express<small>⚠ A polícia está te vendo — despiste antes de fechar a porta</small>`;
            return `<b>E</b> pintura express e placa trocada — ${brl(this.hotPrice(game))}<small>${s.name} · porta fechada, sem perguntas: a polícia perde o carro de vista</small>`;
        }
        if (this.nearPump(s, car.position.x, car.position.z) && car.tank > 0 && car.fuel < car.tank - 0.5) return '';      // (nas bombas, o E abastece)
        const c = CarCare.cond(car), w = CarCare.worst(c);
        return `<b>E</b> ${s.kind === 'posto' ? 'borracharia e troca de óleo' : s.kind === 'morro' ? 'mecânico do morro (aceita sujo)' : 'oficina: diagnóstico e orçamento'}<small>${s.name} · ${w < 0.4 || car.hpFrac < 0.5 ? '⚠ o carro precisa de conserto' : w < 0.7 ? 'umas peças gastas' : 'carro em ordem'}</small>`;
    },
    carInteract(game) {
        if (!this.carPrompt(game)) return false;
        const car = game.activeCar, s = this.at(car.position.x, car.position.z);
        if (game.wanted.level > 0 && s.kind !== 'posto') { this.hotPaint(game, car, s); return true; }
        this.service(game, car, s); return true;
    },

    // Pintura express com ★ (ninguém te vendo): cor nova, placa trocada e as estrelas zeram. Aceita dinheiro sujo (sem nota).
    hotPrice(game) { return 1000 + 750 * game.wanted.level; },
    hotPaint(game, car, s) {
        const pm = game.policeManager;
        if (pm && pm.playerSeen) { game._flash('A polícia te viu entrar — não dá para fechar a porta. Despiste primeiro'); return; }
        const amt = this.hotPrice(game), inv = game.inventory;
        if (inv.cash + inv.clean < amt) { game._flash(`Pintura express: ${brl(amt)} — faltam ${brl(amt - inv.cash - inv.clean)}`); return; }
        const dirty = Math.min(inv.cash, amt); inv.cash -= dirty; inv.clean -= amt - dirty;
        const rows = this.PAINT_ROWS.map((r) => r[0]), cur = car.visual && car.visual.variant, pick = rows.filter((r) => r !== cur);
        const row = pick[Math.floor(Math.random() * pick.length)] ?? rows[0];
        if (car.visual && car.visual.setVariant) car.visual.setVariant(row);
        if (car.ownedRec) car.ownedRec.paint = row;
        game.wanted._set(0, 'paint');
        if (pm) { for (const u of pm.units) u.mind = null; pm.known = null; pm.search = null; }      // ninguém sabe de mais nada (os reforços voltam a patrulhar e somem depois)
        game.dayNight.skip(0.25);
        AudioFX.blip(900, 0.12, 0.16);
        game._flash(`🎨 Pintura express (−${brl(amt)}): carro de outra cor, placa nova — a polícia perdeu você de vista`);
    },

    // ---------------------------------------------------------------- a pé: balcão de peças
    prompt(game) {
        if (game.mode !== 'player') return '';
        const p = game.player.position, s = this.at(p.x, p.z, true);
        if (!s || s.kind === 'morro') return '';
        return `<b>E</b> balcão de peças<small>${s.name} · baterias, pneus, óleo, ferramentas</small>`;
    },
    interact(game) { if (!this.prompt(game)) return false; const p = game.player.position; this.parts(game, this.at(p.x, p.z, true)); return true; },

    // ---------------------------------------------------------------- preços e pagamento
    carValue(car) { return typeof ChopCareer !== 'undefined' ? ChopCareer.value(car.spec) : 3000; },
    mul(s) { return s.kind === 'morro' ? 0.8 : (Economy.ZONE[s.biome] || {}).mul || 1; },
    price(car, s, k, i = null) {
        const c = CarCare.cond(car), F = CarCare.FIX[k], m = this.mul(s);
        if (k === 'engine') return Math.round((1600 + this.carValue(car) * 0.9) * (1 - c.engine) * m / 10) * 10 + 200;
        if (k === 'leak') return Math.round(260 * m / 10) * 10;
        if (k === 'body') return Math.round(((1 - car.hpFrac) * (this.carValue(car) * 1.2 + 900) + 150) * m / 10) * 10;
        if (k === 'paint') return Math.round((700 + this.carValue(car) * 0.25) * m / 10) * 10;
        const part = F ? Items.DEFS[F[0]].price : 0;
        return Math.round((part * 1.15 + this.LABOR[k]) * m / 10) * 10;
    },
    pay(game, s, amt) {
        const inv = game.inventory, clean = s.kind !== 'morro' && amt >= Laundry.CLEAN_MIN;
        if (s.kind === 'morro') { if (inv.cash >= amt) { inv.cash -= amt; return null; } if (inv.cash + inv.clean >= amt) { inv.clean -= amt - inv.cash; inv.cash = 0; return null; } return `Faltam ${brl(amt - inv.cash - inv.clean)}`; }
        if (clean) { if (inv.clean < amt) return `Serviço grande: a oficina só aceita dinheiro LIMPO (faltam ${brl(amt - inv.clean)})`; inv.clean -= amt; return null; }
        if (inv.cash >= amt) { inv.cash -= amt; return null; }
        if (inv.clean >= amt) { inv.clean -= amt; return null; }
        return `Faltam ${brl(amt)}`;
    },
    // O que a oficina conserta aqui: [{ k, i, name, v, why, price }]
    jobs(car, s) {
        const out = [], c = CarCare.cond(car);
        for (const r of CarCare.status(car)) {
            if (s.kind === 'posto' && !this.POSTO.includes(r.k)) continue;
            if (r.k === 'body') { if (car.hpFrac < 0.995 && s.kind !== 'posto') out.push({ k: 'body', name: 'Funilaria (lataria nova)', v: r.v, why: r.label, price: this.price(car, s, 'body') }); continue; }
            if (r.v >= 0.97) continue;
            out.push({ k: r.k, i: r.i, name: r.name || (r.k === 'engine' ? 'Retífica do motor' : CarCare.NAME[r.k]), v: r.v, why: r.why || r.label, price: this.price(car, s, r.k, r.i) });
        }
        if (c.leak > 0.0003) out.push({ k: 'leak', name: 'Vazamento de óleo (retentor e cárter)', v: 0.3, why: 'pingando no chão', price: this.price(car, s, 'leak') });
        return out;
    },

    // ---------------------------------------------------------------- tela da oficina
    _panel(game) {
        if (!this._p) this._p = new Panel('mechUI', { width: 760, onAct: (a, arg) => this._act(game, a, arg) });
        return this._p;
    },
    service(game, car, s) {
        this._car = car; this._shop = s;
        const P = this._panel(game), J = this.jobs(car, s), B = Panel.btn, inv = game.inventory, total = J.reduce((t, j) => t + j.price, 0);
        const pct = (v) => `${Math.round(v * 100)}%`, col = (v) => v > 0.7 ? '#34d399' : v > 0.4 ? '#fbbf24' : '#f43f5e';
        let h = J.length ? `<div class="dm-grid mc-grid">${J.map((j, n) => `<div class="dm-card"><h4><span>${CarCare.ICON[j.k] || '🔧'} ${j.name}</span><small style="color:${col(j.v)}">${pct(j.v)}</small></h4>${Panel.bar(j.v, col(j.v))}<p>${j.why}</p><div class="dm-btns" style="justify-content:space-between;align-items:center"><b style="color:#86efac">${brl(j.price)}</b>${B('fix', 'Consertar', { arg: n })}</div></div>`).join('')}</div>`
            : '<p class="dm-note" style="text-align:center">Nada para consertar aqui — o carro está em ordem.</p>';
        if (J.length > 1) h += `<div class="dm-btns" style="justify-content:flex-end">${B('all', `Consertar tudo · ${brl(total)}`, { pri: true })}</div>`;
        if (s.kind !== 'posto') {
            h += `<div class="dm-sec">Pintura nova (${brl(this.price(car, s, 'paint'))})</div><div class="dm-btns">${this.PAINT_ROWS.map(([row, nm, hex]) => `<button class="btn" data-act="paint" data-arg="${row}" title="${nm}"><span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:${hex};vertical-align:-2px;margin-right:5px;border:1px solid rgba(255,255,255,.4)"></span>${nm}</button>`).join('')}</div>`;
        }
        h += `<div class="dm-btns" style="justify-content:space-between">${s.kind === 'morro' ? '' : B('parts', '🧰 Balcão de peças')}${B('close', 'Fechar')}</div>
              <p class="dm-note">${s.kind === 'morro' ? 'Aceita dinheiro sujo (e completa com o limpo).' : 'Acima de R$ 800, só dinheiro limpo.'} Você tem ${brl(inv.cash)} sujos e ${brl(inv.clean)} limpos.</p>`;
        P.show(`🔧 ${s.name.toUpperCase()}`, `${car.spec.name} ${car.spec.model}${car.ownedRec ? ' · seu' : ' · roubado'} · lataria ${pct(car.hpFrac)}`, h);
        this._jobs = J;
    },
    _act(game, a, arg) {
        const P = this._p, car = this._car, s = this._shop;
        if (a === 'close') { P.close(); return; }
        if (a === 'parts') { P.close(); this.parts(game, s); return; }
        if (a === 'buy') { this._buy(game, arg); return; }
        if (a === 'hfix' || a === 'huse') { this._hoodAct(game, a, arg); return; }
        if (!car || game.activeCar !== car) { P.close(); return; }
        let jobs = [], price = 0, extra = null;
        if (a === 'fix') { const j = this._jobs[+arg]; if (j) { jobs = [j]; price = j.price; } }
        else if (a === 'all') { jobs = this._jobs; price = jobs.reduce((t, j) => t + j.price, 0); }
        else if (a === 'paint') { price = this.price(car, s, 'paint'); extra = 'paint'; }
        if (!price) return;
        const err = this.pay(game, s, price);
        if (err) { P.msg(err, false); return; }
        let hours = 0;
        for (const j of jobs) {
            if (j.k === 'leak') CarCare.fix(car, 'leak');
            else CarCare.fix(car, j.k, 1, j.i == null ? null : j.i);
            if (j.k === 'oil') car.cond.oil = 1;
            hours += { engine: 1.5, body: 1, cool: 0.6, susp: 0.6, brakes: 0.4, leak: 0.5 }[j.k] || 0.25;
        }
        let msg = jobs.length ? `🔧 ${jobs.length === 1 ? jobs[0].name : jobs.length + ' serviços'} feito(s) (−${brl(price)})` : '';
        if (extra === 'paint') {
            const row = +arg;
            if (car.visual && car.visual.setVariant) car.visual.setVariant(row);
            if (car.ownedRec) car.ownedRec.paint = row;
            hours += 1.2;
            msg = `🎨 Pintura nova (−${brl(price)})`;
        }
        if (hours > 0) { game.dayNight.skip(hours); msg += ` · levou ${hours >= 1 ? hours.toFixed(1).replace('.', ',') + ' h' : Math.round(hours * 60) + ' min'}`; }
        CarCare.syncRec(car);
        if (game.careers) game.careers.by.chop.addXp(5);
        AudioFX.blip(900, 0.12, 0.16);
        game._flash(msg);
        this.service(game, car, s);
        P.msg(msg, true);
    },

    // ---------------------------------------------------------------- balcão de peças
    STOCK: { oficina: ['bateria', 'pneu', 'pastilha', 'oleo', 'radiador', 'velas', 'amortecedor', 'macaco', 'ferramentas', 'booster', 'galao'], posto: ['bateria', 'pneu', 'oleo', 'booster', 'galao', 'macaco'] },
    partPrice(s, id) { return Math.round(Items.DEFS[id].price * this.mul(s) / 5) * 5; },
    parts(game, s) {
        this._shop = s;
        const P = this._panel(game), B = Panel.btn, inv = game.inventory;
        const list = this.STOCK[s.kind] || this.STOCK.oficina;
        const h = list.map((id) => { const D = Items.DEFS[id], pr = this.partPrice(s, id); return `<div class="dm-row"><div class="ic">${D.emo}</div><div class="t"><b>${D.name}</b> <span style="color:var(--tx-3)">${Items.count(inv, id) ? `· tem ${Items.count(inv, id)}` : ''}</span><small>${D.desc} · ${D.kg} kg</small></div><b style="color:#86efac">${brl(pr)}</b>${B('buy', 'Comprar', { arg: id })}</div>`; }).join('')
            + `<p class="dm-note">As peças vão para a mochila (algumas são pesadas — o porta-malas ajuda). Troque no capô: a pé, perto da frente do carro, E. Pneu e suspensão pedem o macaco; freio, radiador e ignição, a caixa de ferramentas.</p><div class="dm-btns" style="justify-content:flex-end">${B('close', 'Fechar')}</div>`;
        P.show(`🧰 BALCÃO DE PEÇAS`, `${s.name} · ${Bags.label(game)} · sujo ${brl(inv.cash)} · limpo ${brl(inv.clean)}`, h);
    },
    _buy(game, id) {
        const s = this._shop, inv = game.inventory, P = this._p, pr = this.partPrice(s, id);
        if (!Items.fits(inv, id)) { P.msg('Não cabe na mochila', false); return; }
        const err = this.pay(game, s, pr);
        if (err) { P.msg(err, false); return; }
        Items.add(inv, id, 1);
        AudioFX.blip(700, 0.1, 0.16);
        this.parts(game, s);
        P.msg(`Comprou: ${Items.label(id)} (−${brl(pr)})`, true);
    },

    // ---------------------------------------------------------------- capô (o jogador mesmo)
    hood(game, car) {
        this._hcar = car;
        const P = this._panel(game), B = Panel.btn, inv = game.inventory, c = CarCare.cond(car), rows = CarCare.status(car);
        const tool = (t) => !t || Items.has(inv, t), pct = (v) => `${Math.round(v * 100)}%`, col = (v) => v > 0.7 ? '#34d399' : v > 0.4 ? '#fbbf24' : '#f43f5e';
        let h = '<div class="dm-grid mc-grid">' + rows.map((r, n) => {
            const F = CarCare.FIX[r.k], part = F && F[0], need = part && Items.DEFS[part].needs, have = part ? Items.count(inv, part) : 0;
            let act = '';
            if (r.k === 'body') act = '<span class="dm-tag">só na oficina</span>';
            else if (F && r.v < 0.97) act = B('hfix', have ? (tool(need) ? `Trocar (${have})` : `Falta: ${Items.label(need)}`) : `Sem ${Items.label(part).toLowerCase()}`, { arg: n, on: have > 0 && tool(need) });
            else act = '<span class="dm-tag g">ok</span>';
            return `<div class="dm-card"><h4><span>${CarCare.ICON[r.k]} ${r.name || CarCare.NAME[r.k]}</span><small style="color:${col(r.v)}">${pct(r.v)}</small></h4>${Panel.bar(r.v, col(r.v))}<div class="dm-btns" style="justify-content:space-between;align-items:center"><p>${r.why || r.label}</p>${act}</div></div>`;
        }).join('') + '</div>';
        if (c.leak > 0.0003) h += '<p class="dm-note" style="color:#fda4af">🛢️ Está vazando óleo — só a oficina resolve (dá para ir completando o óleo).</p>';
        const uses = [];
        if (Items.has(inv, 'galao') && car.tank > 0) uses.push(B('huse', `⛽ Pôr o galão (5 L) — ${Math.round(car.fuel)}/${car.tank} L`, { arg: 'galao' }));
        if (Items.has(inv, 'booster')) uses.push(B('huse', '🔌 Ligar o auxiliar de partida', { arg: 'booster' }));
        if (uses.length) h += `<div class="dm-btns">${uses.join('')}</div>`;
        const tools = ['macaco', 'ferramentas'].map((t) => `${Items.DEFS[t].emo} ${Items.label(t)}: ${Items.has(inv, t) ? '✔' : '✖'}`).join(' · ');
        h += `<p class="dm-note">${tools} · temperatura ${Math.round(70 + c.temp * 40)}° · peças no balcão de peças (oficinas e postos). A troca leva alguns segundos parado ao lado do carro (a skill Mecânica do Desmanche encurta).</p><div class="dm-btns" style="justify-content:flex-end">${B('close', 'Fechar')}</div>`;
        P.show(`🔧 CAPÔ · ${car.spec.name} ${car.spec.model}`, `${car.ownedRec ? 'seu carro' : 'carro de rua'} · estado geral ${pct(Math.min(CarCare.worst(c), car.hpFrac))}`, h);
        this._hrows = rows;
    },
    _hoodAct(game, a, arg) {
        const P = this._p, car = this._hcar; if (!car) return;
        if (a === 'huse') { const m = CarCare.use(game, car, arg); P.msg(m || '', true); this.hood(game, car); P.msg(m || '', true); return; }
        const r = this._hrows[+arg]; if (!r) return;
        const F = CarCare.FIX[r.k];
        const err = CarCare.startJob(game, car, r.k, r.i == null ? null : r.i, F[0], F[2]);
        if (err) { P.msg(err, false); return; }
        P.close();
    },
};
