// ============================================================================
// Banks — a REDE BANCÁRIA: 3 SEDES (uma por marca, no Distrito Financeiro) e 7 AGÊNCIAS espalhadas pelos distritos.
//   Marcas: INAÚ (laranja/azul-escuro, tecnologia: cofres temporizados, alvo do cibercrime), BRASCOR (vermelho/branco, varejo: muito
//   dinheiro vivo, alvo da força bruta) e NACIONAL (amarelo/azul, estatal: polícia militar na porta, chega mais rápido).
//   Interiores modulares (art/BankStyles.js): o mesmo layout de agência serve às 7, só a paleta muda; as sedes têm layout próprio.
//
//   AGÊNCIA (roubo rápido, Ladrão Arrombador+): estourar CAIXAS ELETRÔNICOS e o COFRE DE CAIXA. O alarme dispara e a polícia chega em
//     poucos segundos (marca); ao sair, 3 minutos para sumir da área antes de a rua ser isolada.
//   SEDE (Ladrão Especialista em Cofres): sem a PLANTA BAIXA (mercado negro, na favela) você nem acha o cofre. Energia cortada na
//     caixa de força do quarteirão desliga o laser; vigilantes subornados atrasam a polícia. O cofre é perfurado parado no local.
//   REFÉNS: se a polícia chega com você lá dentro, ela CERCA o prédio e abre NEGOCIAÇÃO — Lábia (pedir tempo) ou Intimidação (com
//     arma) ganham segundos para terminar; falhou demais, eles invadem (preso).
//   DINHEIRO MARCADO: o que sai do banco é cédula com série rastreada: pesa (você fica lento) e não vai para a mochila — só serve
//     guardado no COFRE DO GALPÃO (Império) para as fachadas lavarem. Perdido num desmaio ou prisão.
//   CIBERCRIME (Estelionato Golpista+): plugar o PENDRIVE no terminal do gerente abre uma porta no firewall da marca por 3 dias; de casa
//     ou da favela, a TRANSFERÊNCIA VIA LARANJAS (mini-jogo) puxa o dinheiro. A Inaú rende mais.
//   CONTA: depositar LIMPO guarda os lucros com segurança (rende juros, não se perde); depositar SUJO em conta de fachada enche o
//     ALERTA DO COAF — cheio, a conta é bloqueada e metade some.
// ============================================================================

const Banks = {
    BRANDS: {
        inau: { name: 'Banco Inaú', v: 0, color: '#ec7000', cash: 1.0, cyber: 1.6, arrive: 40, vault: 1.2 },
        brascor: { name: 'Banco Brascor', v: 1, color: '#cc092f', cash: 1.6, cyber: 1.0, arrive: 55, vault: 1.0 },
        nacional: { name: 'Banco Nacional', v: 2, color: '#f6c700', cash: 1.25, cyber: 1.2, arrive: 25, vault: 1.4 },
    },
    list: [], built: false,
    account: 0, coaf: 0, hot: 0, hotVault: 0,
    backdoor: {},                 // marca → dias restantes
    plans: {},                    // id da sede → { blueprint, power (dia), bribe (dia), done }
    robbedDay: {},                // id → dia do último roubo (o banco fica em alerta até o dia seguinte)
    session: null,                // dentro de um banco
    escape: null,                 // { x, z, t } depois de sair com alarme
    game: null,

    // ---------------------------------------------------------------- rede
    build(game) {
        if (this.built) return;
        this.built = true; this.game = game;
        Interiors.index();
        const E = game.empire, used = [], far = (d, m) => used.every((u) => Math.hypot(u.x - d.x, u.z - d.z) > m);
        const pool = Interiors._doors.filter((d) => d.district !== 'favela' && d.style !== 'guns' && d.style !== 'drugs').sort((a, b) => (a.id < b.id ? -1 : 1));
        const pick = (ok, m) => { const c = pool.find((d) => !d.bank && ok(d) && far(d, m)); if (c) used.push(c); return c; };
        const brands = Object.keys(this.BRANDS);
        for (const b of brands) { const d = pick((q) => q.biome === 'downtown', 90) || pick(() => true, 90); if (d) this._convert(d, b, 'hq'); }
        const order = ['brascor', 'inau', 'nacional', 'brascor', 'inau', 'brascor', 'nacional'], seen = {};
        for (const b of order) {
            const d = pick((q) => { const k = E.districtAt(q.x, q.z); return !seen[k] || Object.keys(seen).length >= 6; }, 70) || pick(() => true, 50);
            if (!d) continue;
            seen[E.districtAt(d.x, d.z)] = 1;
            this._convert(d, b, 'branch');
        }
        // marcadores na porta, na cor da marca
        this.glow = new GlowBatch(game.scene, this.list.length, 'bankGlow', 'glow');
        for (const bk of this.list) { const i = this.glow.alloc(), c = BABYLON.Color3.FromHexString(this.BRANDS[bk.brand].color); this.glow.place(i, bk.x, 0.2, bk.z, bk.tier === 'hq' ? 4.2 : 3); this.glow.color(i, c.r * 0.8, c.g * 0.8, c.b * 0.8, 1); }
        this.glow.flush();
        console.log(`[BANCOS] ${this.list.length} bancos (${this.list.filter((b) => b.tier === 'hq').length} sedes)`);
    },

    _convert(door, brand, tier) {
        const B = this.BRANDS[brand], n = this.list.filter((x) => x.brand === brand && x.tier === tier).length + 1;
        const bank = { id: 'bk' + this.list.length, brand, tier, x: door.x, z: door.z, door, name: tier === 'hq' ? `${B.name} — Sede` : `${B.name} — Agência ${n}` };
        door.bank = bank; door.style = tier === 'hq' ? 'bank_hq' : 'bank_branch'; door.variant = B.v; door.name = bank.name;
        this.list.push(bank);
        if (tier === 'hq') this.plans[bank.id] = this.plans[bank.id] || {};
    },

    get(id) { return this.list.find((b) => b.id === id); },
    hqs() { return this.list.filter((b) => b.tier === 'hq'); },

    // ---------------------------------------------------------------- entrada
    // Banco fechado: a sede abre de noite para quem cortou a energia hoje e tem a planta.
    canBreakIn(bank) { const P = this.plans[bank.id]; return bank.tier === 'hq' && P && P.blueprint && P.power === Economy.day; },

    onEnter(game, shop) {
        const bank = shop.bank; if (!bank) return;
        const B = this.BRANDS[bank.brand], P = this.plans[bank.id] || {};
        this.session = { bank, alarm: false, arrive: 0, siege: null, busy: 0, act: null, loot: 0, done: {}, drill: 0, laser: false };
        const closed = !Economy.isOpen(shop.style, game.dayNight.hour);
        if (bank.tier === 'hq' && closed && P.power === Economy.day) game._flash('⚡ Prédio às escuras: câmeras e laser desligados');
        if (bank.tier === 'branch' && this.robbedDay[bank.id] === Economy.day) game._flash('Agência em alerta: foi roubada hoje — as câmeras estão de olho');
    },

    onLeave(game) {
        const s = this.session; this.session = null;
        this._hideSiege(); if (this._cEl) this._cEl.style.display = 'none';
        if (!s || !s.alarm) return;
        if (s.siege && !(s.siege.grace > 0)) {                               // cercado e sem trégua: sair é se entregar
            this.hot = 0;
            game._delayed.push({ t: 0.3, fn: () => game._busted() });
            game._flash('Você saiu com o prédio cercado: preso na porta do banco');
            return;
        }
        const stars = s.bank.tier === 'hq' ? 4 : 3;
        game.wanted.addStars(stars, 'bank');
        this.robbedDay[s.bank.id] = Economy.day;
        this.escape = { x: s.bank.x, z: s.bank.z, t: 180 };
        game._flash(`🚨 Saiu do banco com ${brl(this.hot)} marcados: 3 MINUTOS para sumir antes que isolem a área`);
        if (game.empire) game.empire.spend(0, 40);
    },

    // ---------------------------------------------------------------- pontos de ação dentro do banco
    _use(game) {
        const a = Interiors.active, s = this.session; if (!a || !s) return null;
        const o = Interiors.STAGE, p = game.player.position;
        let best = null, bd = 1.9;
        for (const u of a.data.uses || []) {
            const cx = Math.max(o.x + u.x0, Math.min(p.x, o.x + u.x1)), cz = Math.max(o.z + u.z0, Math.min(p.z, o.z + u.z1)), d = Math.hypot(p.x - cx, p.z - cz);
            if (d < bd) { bd = d; best = u; }
        }
        return best;
    },

    _req(game, kind) {
        const C = game.careers, s = this.session, bank = s.bank, P = this.plans[bank.id] || {};
        if (kind === 'terminal') return C.by.scam.rank >= 1 ? null : 'Precisa ser Golpista (Estelionato) para mexer no terminal';
        if (kind === 'vault') { if (C.by.burglar.rank < 2) return 'Precisa ser Especialista em Cofres (Ladrão)'; if (!P.blueprint) return 'Sem a planta baixa você não acha o cofre (mercado negro, na favela)'; return null; }
        if (C.by.burglar.rank < 1) return 'Precisa ser Arrombador (Ladrão) para assaltar banco';
        return null;
    },

    LABEL: { atm: 'estourar o caixa eletrônico', safe: 'arrombar o cofre de caixa', terminal: 'plugar o pendrive no terminal do gerente', vault: 'perfurar o cofre' },

    prompt(game) {
        const s = this.session; if (!s) return '';
        if (s.siege && !(s.siege.grace > 0)) return '';
        if (s.siege) return `<b>TRÉGUA ${Math.ceil(s.siege.grace)}s</b>${s.act ? ' ' + crBar(s.act.t / s.act.dur) : ''}<small>termine e saia pela porta — depois da trégua o negociador volta</small>`;
        if (s.act) return `<b>${s.act.kind === 'vault' ? 'PERFURANDO' : 'TRABALHANDO'}</b> ${crBar(s.act.t / s.act.dur)}<small>${this._status()}</small>`;
        const u = this._use(game);
        if (!u && !s.alarm && this._nearClerk(game)) return `<b>E</b> falar com o caixa<small>conta, depósito e saque · saldo ${brl(this.account)}</small>`;
        if (!u || s.done[u.kind + u.x0]) return s.alarm ? `<b>ALARME!</b><small>${this._status()} — saia pela porta</small>` : '';
        const why = this._req(game, u.kind);
        return why ? `<b>${this.LABEL[u.kind]}</b><small>${why}</small>` : `<b>E</b> ${this.LABEL[u.kind]}<small>${u.kind === 'terminal' ? 'silencioso se ninguém notar' : 'dispara o alarme'} · ${this._status()}</small>`;
    },

    _status() {
        const s = this.session; if (!s) return '';
        return s.alarm ? `polícia em ${Math.max(0, Math.ceil(s.arrive))}s · ${brl(this.hot)} marcados` : 'sem alarme';
    },

    interact(game) {
        const s = this.session; if (!s || (s.siege && !(s.siege.grace > 0)) || s.act) return !!s && !!(s.act || s.siege);
        const u = this._use(game);
        if (!u) { if (this._nearClerk(game)) { this.counter(game); return true; } return false; }
        if (s.done[u.kind + u.x0]) { game._flash('Já está vazio'); return true; }
        const why = this._req(game, u.kind);
        if (why) { game._flash(why); return true; }
        const el = game.careers.by.burglar.skill('eletronica');
        const dur = { atm: 5, safe: 9, terminal: Math.max(3, 7 - game.careers.by.scam.skill('ti') * 0.6), vault: Math.max(25, 60 - 5 * el) }[u.kind];
        s.act = { kind: u.kind, key: u.kind + u.x0, t: 0, dur };
        game.careers.act(u.kind === 'terminal' ? 'pick' : 'rummage', Math.min(dur, 4));
        if (u.kind === 'atm' || u.kind === 'safe') this._alarm(game, 'o alarme silencioso disparou');
        if (u.kind === 'vault' && !this.plans[s.bank.id].bribe) this._alarm(game, 'a perfuração acionou o sensor sísmico');
        return true;
    },

    _alarm(game, why) {
        const s = this.session; if (!s || s.alarm) return;
        const B = this.BRANDS[s.bank.brand], P = this.plans[s.bank.id] || {};
        s.alarm = true;
        s.arrive = B.arrive * (s.bank.tier === 'hq' ? 1.6 : 1) * (P.bribe === Economy.day ? 1.6 : 1) * (P.power === Economy.day ? 1.3 : 1);
        game._flash(`🚨 ${why}! ${B.name}: polícia em ${Math.round(s.arrive)}s${B.name.includes('Nacional') ? ' (a PM fica na porta)' : ''}`);
        AudioFX.blip(200, 0.6, 0.25);
    },

    // Chamado por Interiors.update dentro de um banco.
    update(dt, game) {
        const s = this.session; if (!s) return;
        const S = s.siege;
        if (S) {
            if (S.breach > 0) {
                S.breach -= dt;
                if (S.breach <= 0) { this.session = null; this._hideSiege(); this.hot = 0; Interiors._doLeave(game); game._busted(); } else this._drawSiege(game);
                return;
            }
            if (!(S.grace > 0)) return;                                       // esperando a resposta ao negociador
            S.grace -= dt;
            if (S.grace <= 0) { S.msg = 'A trégua acabou. O negociador voltou ao telefone.'; this._drawSiege(game); return; }
        } else if (s.alarm) {
            s.arrive -= dt;
            if (s.arrive <= 0) { this._startSiege(game); return; }
        }
        this._work(dt, game);
    },

    // Avança a ação em andamento (caixa, cofre, terminal) e entrega o resultado.
    _work(dt, game) {
        const s = this.session, a = s.act; if (!a) return;
        if (a.kind === 'vault' || a.kind === 'terminal') { const u = this._use(game); if (!u || u.kind !== a.kind) { s.act = null; game._flash('Você saiu do lugar: recomece'); return; } }
        a.t += dt;
        if (a.kind === 'vault' && this.plans[s.bank.id].power !== Economy.day && !s.laser && a.t / a.dur > 0.4) { s.laser = true; this._alarm(game, 'LASER no corredor do cofre'); s.arrive = Math.min(s.arrive, 12); }
        if (a.t < a.dur) return;
        s.act = null; s.done[a.key] = 1;
        const B = this.BRANDS[s.bank.brand], g = game;
        if (a.kind === 'terminal') {
            const caught = Math.random() < Math.max(0.05, 0.25 - 0.03 * g.careers.by.scam.skill('ti'));
            this.backdoor[s.bank.brand] = 3;
            g._flash(`💾 Porta aberta no firewall do ${B.name} por 3 dias — faça a transferência de casa (Estelionato)`);
            g.careers.by.scam.addXp(120);
            if (caught) this._alarm(g, 'o gerente desconfiou do pendrive');
            return;
        }
        const base = { atm: [8000, 18000], safe: [18000, 38000], vault: [180000, 420000] }[a.kind];
        const v = Math.round((base[0] + Math.random() * (base[1] - base[0])) * (a.kind === 'vault' ? B.vault : B.cash) / 100) * 100;
        this.hot += v; s.loot += v;
        g._flash(`💰 +${brl(v)} em cédulas MARCADAS (${brl(this.hot)}, ${this.hotKg} kg)`);
        g.careers.by.burglar.addXp(a.kind === 'vault' ? 900 : 120);
        if (a.kind === 'vault') { this.plans[s.bank.id].done = (this.plans[s.bank.id].done || 0) + 1; if (g.achievements) g.achievements.bump('hqHeists'); }
    },

    get hotKg() { return Math.round(this.hot / 10000); },          // R$ 10 mil em cédulas ≈ 1 kg

    // ---------------------------------------------------------------- negociação de reféns
    _startSiege(game) {
        const s = this.session;
        s.siege = { turns: 3, grace: 0, breach: 0, msg: 'A polícia cercou o prédio. O negociador quer falar.' };
        this._drawSiege(game);
        AudioFX.blip(150, 0.7, 0.3);
    },

    // Resposta do jogador ao negociador: 'talk' (Lábia), 'threat' (Intimidação, com arma), 'surrender'.
    negotiate(game, how) {
        const s = this.session, S = s && s.siege; if (!S || S.breach > 0 || S.grace > 0) return;
        if (how === 'surrender') { S.breach = 0.01; S.msg = 'Você se rendeu.'; return; }
        const labia = (SkillTree.m.labia || 0) + game.careers.by.scam.skill('labia') * 0.05;
        const armed = game.player.weapon !== 'none' && game.inventory.isGun(game.player.weapon);
        const chance = how === 'talk' ? 0.4 + labia : (armed ? 0.5 + game.careers.by.burglar.rank * 0.05 : 0.1);
        S.turns--;
        if (Math.random() < chance) { S.grace = how === 'talk' ? 30 : 22; S.msg = how === 'talk' ? 'Você enrolou o negociador: 30s de calma.' : 'Ameaçou os reféns: eles recuaram por 22s.'; game._flash('⏳ ' + S.msg + ' Termine o serviço e saia!'); if (this._sEl) this._sEl.style.display = 'none'; return; }
        else if (S.turns <= 0) { S.breach = 5; S.msg = 'Negociação encerrada: o BOPE vai invadir!'; }
        else S.msg = how === 'talk' ? 'O negociador não caiu na conversa.' : 'A ameaça não colou.';
        this._drawSiege(game);
    },

    _drawSiege(game) {
        const s = this.session, S = s && s.siege; if (!S) return;
        let el = this._sEl;
        if (!el) {
            el = this._sEl = document.createElement('div');
            el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:50;width:min(560px,92vw);padding:22px 24px;background:rgba(24,6,12,0.9);border:1px solid rgba(244,63,94,0.6);border-radius:22px;box-shadow:0 0 0 1px rgba(244,63,94,0.25),0 24px 70px rgba(120,0,20,0.55);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);color:#fff;font-family:var(--font);text-align:center;display:flex;flex-direction:column;gap:12px';
            el.addEventListener('click', (e) => { const b = e.target.closest('button[data-neg]'); if (b) this.negotiate(this.game, b.dataset.neg); });
            document.body.appendChild(el);
        }
        el.style.display = 'flex';
        const btn = (k, t) => `<button data-neg="${k}" class="ui-btn" style="padding:12px;font-size:14px;border-color:rgba(251,113,133,0.55);background:rgba(244,63,94,0.12)">${t}</button>`;
        el.innerHTML = `<div style="font-size:20px;color:#ff5a5a">🚔 NEGOCIAÇÃO DE REFÉNS</div><div style="font-size:12px;color:#ffd0d0">${S.msg}</div>
            ${S.breach > 0 ? `<div style="font-size:26px;color:#ff3a3a">INVASÃO EM ${Math.ceil(S.breach)}s</div>` : `<div style="font-size:11px;color:#aab3c8">Tentativas restantes: ${S.turns} · ${brl(this.hot)} marcados com você</div>
            ${btn('talk', 'LÁBIA — pedir mais tempo')}${btn('threat', 'INTIMIDAR — ameaçar os reféns (precisa de arma)')}${btn('surrender', 'RENDER-SE')}`}`;
    },
    _hideSiege() { if (this._sEl) this._sEl.style.display = 'none'; },

    // ---------------------------------------------------------------- fora do banco
    tick(dt, game) {
        const e = this.escape;
        if (e) {
            e.t -= dt;
            const p = game._playerState().pos;
            if (Math.hypot(p.x - e.x, p.z - e.z) > 220) { this.escape = null; game._flash('Você saiu da área antes do isolamento'); }
            else if (e.t <= 0) { this.escape = null; game.wanted.addStars(1, 'bank'); if (game.policeManager) game.policeManager.alertNear(p, 400); game._flash('🚧 RUA ISOLADA: bloqueios e reforços em volta do banco'); }
        }
    },

    // Guardar o dinheiro marcado no cofre do galpão (na favela ou em casa): só assim ele entra na lavagem.
    stash(game) {
        if (this.hot <= 0) return 'Você não está com dinheiro marcado';
        if (!game.careers.atBase()) return 'Leve o dinheiro marcado para a favela ou para casa';
        if (!game.empire || game.empire.biz.warehouses <= 0) return 'Você precisa de um galpão (aba IMPÉRIO) para esconder cédulas marcadas';
        const v = this.hot; this.hot = 0;
        game.empire.biz.vault += Math.round(v * 0.92);
        return `${brl(v)} marcados no cofre do galpão (8% para trocar as notas) — as fachadas lavam a partir de amanhã`;
    },

    lose() { this.hot = 0; },

    _nearClerk(game) {
        const a = Interiors.active, cl = a && a.data.clerk; if (!cl) return false;
        const o = Interiors.STAGE, p = game.player.position;
        return Math.hypot(p.x - (o.x + cl.x), p.z - (o.z + cl.z)) < 5.2 && p.z < o.z + cl.z + 0.6;
    },

    // Caixa do banco: conta, depósito limpo/sujo, saque.
    counter(game) {
        let el = this._cEl;
        if (!el) {
            el = this._cEl = document.createElement('div');
            el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:46;width:min(520px,92vw);padding:22px 24px;background:var(--glass-2);border:1px solid var(--line-2);border-radius:22px;box-shadow:var(--shadow);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);color:var(--tx);font-family:var(--font);display:flex;flex-direction:column;gap:10px';
            el.addEventListener('click', (e) => {
                const b = e.target.closest('button[data-bk]'); if (!b) return;
                const [act, amt] = b.dataset.bk.split(':'), g = this.game, n = amt === 'all' ? Infinity : +amt;
                if (act === 'close') { el.style.display = 'none'; return; }
                g._flash(act === 'w' ? this.withdraw(g, n) : this.deposit(g, n, act === 'ds'));
                this.counter(g);
            });
            document.body.appendChild(el);
        }
        const inv = game.inventory, bank = this.session && this.session.bank, b = (k, t) => `<button data-bk="${k}" class="ui-btn">${t}</button>`;
        el.style.display = 'flex';
        el.innerHTML = `<div style="font-size:16px;color:${bank ? this.BRANDS[bank.brand].color : '#fff'}">${bank ? bank.name.toUpperCase() : 'BANCO'}</div>
            <div style="font-size:12px">Saldo: <b style="color:#ffd23a">${brl(this.account)}</b> (rende 0,15% ao dia, não se perde) · Limpo na mão: ${brl(inv.clean)} · Sujo: ${brl(inv.cash)}</div>
            <div style="font-size:11px;color:#aab3c8">ALERTA DO COAF: ${Math.round(this.coaf)}% — depósito SUJO em conta de fachada enche o alerta; cheio, bloqueiam a conta e levam metade.</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">${b('d:10000', 'Depositar 10 mil limpos')}${b('d:all', 'Depositar todo o limpo')}${b('w:10000', 'Sacar 10 mil')}${b('w:all', 'Sacar tudo')}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">${b('ds:10000', 'Depositar 10 mil SUJOS (fachada)')}${b('ds:all', 'Depositar todo o sujo (fachada)')}</div>
            ${this.hot > 0 ? `<div style="font-size:11px;color:#ff8a8a">Cédulas marcadas (${brl(this.hot)}) não entram no caixa: leve ao cofre do galpão.</div>` : ''}
            <div>${b('close', 'Fechar')}</div>`;
    },

    // ---------------------------------------------------------------- conta e COAF (no caixa, dentro de qualquer agência/sede)
    deposit(game, amt, dirty) {
        const inv = game.inventory, have = dirty ? inv.cash : inv.clean, v = Math.floor(Math.min(amt, have));
        if (v <= 0) return dirty ? 'Sem dinheiro sujo' : 'Sem dinheiro limpo';
        if (dirty) { inv.cash -= v; this.coaf = Math.min(100, this.coaf + v / 600); }
        else inv.clean -= v;
        this.account += v;
        let msg = `Depositou ${brl(v)} ${dirty ? 'SUJOS numa conta de fachada' : 'limpos'} (saldo ${brl(this.account)})`;
        if (this.coaf >= 100) { const seized = Math.round(this.account * 0.5); this.account -= seized; this.coaf = 40; Laundry.taxHeat = 100; Laundry._audit(game); msg += ` · 🚨 ALERTA DO COAF: conta bloqueada, ${brl(seized)} apreendidos`; }
        return msg;
    },
    withdraw(game, amt) {
        const v = Math.floor(Math.min(amt, this.account));
        if (v <= 0) return 'Saldo zerado';
        this.account -= v; game.inventory.clean += v;
        return `Sacou ${brl(v)} (saldo ${brl(this.account)})`;
    },
    buyBlueprint(game, id) {
        const P = this.plans[id], inv = game.inventory, p = game.player.position;
        if (!P) return null;
        if (P.blueprint) return 'Você já tem essa planta';
        if (!Standing.inFavela(p.x, p.z)) return 'Plantas baixas só no mercado negro da favela';
        if (inv.cash < 25000) return `Faltam ${brl(25000 - inv.cash)}`;
        inv.cash -= 25000; P.blueprint = true;
        return `Planta baixa da ${this.get(id).name} comprada`;
    },
    bribe(game, id) {
        const P = this.plans[id], bank = this.get(id), inv = game.inventory; if (!P) return null;
        const price = bank.brand === 'nacional' ? 45000 : 15000;
        if (P.bribe === Economy.day) return 'Os vigilantes já estão comprados hoje';
        if (inv.cash < price) return `Faltam ${brl(price - inv.cash)}`;
        inv.cash -= price; P.bribe = Economy.day;
        return `Vigilantes${bank.brand === 'nacional' ? ' e PMs da porta' : ''} da ${bank.name} comprados — só vale HOJE`;
    },

    onNewDay() {
        if (this.account > 0) this.account = Math.round(this.account * 1.0015);
        this.coaf = Math.max(0, this.coaf - 8);
        for (const k of Object.keys(this.backdoor)) if (--this.backdoor[k] <= 0) delete this.backdoor[k];
    },

    // ---------------------------------------------------------------- transferência via laranjas (mini-jogo de cibercrime)
    transfer(game, brand) {
        const B = this.BRANDS[brand], scam = game.careers.by.scam;
        if (!this.backdoor[brand]) return 'Sem porta aberta nesse banco — plugue o pendrive numa agência dele';
        if (!game.careers.atBase()) return 'A transferência é feita de casa ou da favela';
        delete this.backdoor[brand];
        if (game.menu.isOpen) game.menu.close();
        const rounds = 4, st = { r: 0, ok: 0, t: 0 };
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;inset:0;z-index:55;display:flex;align-items:center;justify-content:center;background:rgba(4,8,16,0.8);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);font-family:var(--font);color:var(--tx)';
        document.body.appendChild(el);
        const code = () => `AG ${1000 + Math.floor(Math.random() * 9000)} · CC ${10000 + Math.floor(Math.random() * 90000)}-${Math.floor(Math.random() * 10)}`;
        const mutate = (c) => c.replace(/\d/g, (d, i) => (Math.random() < 0.18 ? String((+d + 1 + Math.floor(Math.random() * 8)) % 10) : d));
        let timer = null;
        const finish = () => {
            clearInterval(timer); el.remove();
            const per = 9000 * B.cyber * (1 + 0.08 * scam.skill('labia')) * (game.empire ? game.empire.fx('scam') : 1), v = Math.round(per * st.ok / 100) * 100;
            if (v > 0) game.inventory.addCash(v);
            scam.addXp(60 + st.ok * 50);
            const tr = scam._trace(12 + (rounds - st.ok) * 12);
            if (game.achievements && st.ok) game.achievements.bump('transfers');
            game._flash(`💻 Transferência ${B.name}: ${st.ok}/${rounds} contas laranja confirmadas → +${brl(v)} sujos${tr}`);
        };
        const round = () => {
            if (st.r >= rounds) { finish(); return; }
            const target = code(), opts = [target, mutate(target), mutate(target), mutate(target)].map((c, i) => (i && c === target ? c.slice(0, -1) + ((+c.slice(-1) + 1) % 10) : c)).sort(() => Math.random() - 0.5);
            st.t = Math.max(2.5, 5 - scam.skill('ti') * 0.4);
            const draw = () => {
                el.innerHTML = `<div style="width:min(520px,92vw);padding:18px;border:2px solid #35e0ff;border-radius:12px;background:#06121e;display:flex;flex-direction:column;gap:10px;text-align:center">
                    <div style="font-size:16px;color:#35e0ff">TRANSFERÊNCIA VIA LARANJAS — ${B.name.toUpperCase()}</div><div style="font-size:11px">Conta ${st.r + 1}/${rounds}: confirme a conta de destino antes do firewall fechar (${st.t.toFixed(1)}s)</div>
                    <div style="font-size:20px;color:#ffd23a;letter-spacing:1px">${target}</div>
                    ${opts.map((c) => `<button data-c="${c}" class="ui-btn" style="font:600 15px var(--font-d);padding:12px">${c}</button>`).join('')}</div>`;
            };
            draw();
            el.onclick = (e) => { const b = e.target.closest('button[data-c]'); if (!b) return; if (b.dataset.c === target) st.ok++; st.r++; AudioFX.blip(b.dataset.c === target ? 900 : 200, 0.08, 0.12); clearInterval(timer); round(); };
            clearInterval(timer);
            timer = setInterval(() => { st.t -= 0.1; if (st.t <= 0) { clearInterval(timer); st.r++; round(); } else { const s = el.querySelector('div div:nth-child(2)'); if (s) s.textContent = `Conta ${st.r + 1}/${rounds}: confirme a conta de destino antes do firewall fechar (${st.t.toFixed(1)}s)`; } }, 100);
        };
        round();
        return null;
    },

    serialize() { return { acc: this.account, coaf: this.coaf, hot: this.hot, bd: this.backdoor, plans: this.plans, rd: this.robbedDay }; }
    ,
    load(s) {
        if (!s) return;
        this.account = s.acc || 0; this.coaf = s.coaf || 0; this.hot = s.hot || 0; this.backdoor = s.bd || {}; this.robbedDay = s.rd || {};
        for (const [k, v] of Object.entries(s.plans || {})) this.plans[k] = Object.assign(this.plans[k] || {}, v);
    },
};

// Planejamento da sede: cortar a energia do quarteirão na caixa de força (mini-game de fechadura; vale só para HOJE).
class BankPowerJob extends CareerJob {
    constructor(c, bank) { super(c, { title: 'CORTAR A ENERGIA', text: `Caixa de força do quarteirão da ${bank.name}`, limit: 420 }); this.bank = bank; }
    start() {
        const b = this.bank;
        let box = null;
        for (let t = 0; t < 24 && !box; t++) { const a = Math.random() * Math.PI * 2, q = this.mgr.streetNear(b.x + Math.cos(a) * 26, b.z + Math.sin(a) * 26, 12); if (q && Math.hypot(q.x - b.x, q.z - b.z) > 12) box = q; }
        box = box || { x: b.x + 18, z: b.z };
        this.target(box.x, box.z, 'Caixa de força');
        return true;
    }
    prompt() { const g = this.g; return g.mode === 'player' && !g.lockpick.active && this.near(g.player.position, 3) ? '<b>E</b> abrir a caixa de força<small>mini-game: errar dá curto e chama a polícia</small>' : ''; }
    interact() {
        const g = this.g; if (g.mode !== 'player' || g.lockpick.active || g.player.busy || !this.near(g.player.position, 3)) return false;
        this.mgr.act('pick', 30);
        g.lockpick.start({ difficulty: 1.25 * (1 - 0.07 * g.careers.by.burglar.skill('eletronica')), onEnd: (res) => {
            if (g.player.action && g.player.action.name === 'pick') g.player.action.timer = 0;
            if (res === 'ok') { Banks.plans[this.bank.id].power = Economy.day; this.succeed(0, 200, `energia cortada: a ${this.bank.name} está às escuras até a meia-noite (câmeras e laser desligados)`); }
            else if (res === 'alarm') { g.wanted.reportCrime(); g.wanted.ensureLevel(1); this.fail('curto-circuito — a polícia foi chamada'); }
        } });
        return true;
    }
    dispose() { if (this.g.lockpick.active) this.g.lockpick.cancel(); }
}
