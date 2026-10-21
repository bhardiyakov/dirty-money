// ============================================================================
// Phone — o CELULAR: mensagens, contatos e o jornal. Abre com J (ou o 📱 no canto). Guardado no save.
//   Contatos com personalidade e CONFIANÇA (−100..100), que mudam com o que você responde e faz:
//     • Neguinho (parceiro do truco): convida para o truco num bar e horário — aparecendo, ele paga a rodada (+R$) e a confiança sobe.
//     • Dona Cida (vizinha fofoqueira): manda dicas de verdade (StreetLife: o caixa cheio), conta o que o bairro fala de você, pede
//       dinheiro emprestado (devolve com juros… se confiar em você).
//     • Baiano do Ferro-Velho: serviços de entrega (GPS no mapa, prazo, pagamento na hora).
//     • Sargento Brito (PM corrupto): avisa de operação e, por um "cafezinho", alivia a barra (−1 ★, menos pressão no morro) —
//       mas, com a confiança lá embaixo, te DEDURA.
//     • Dentinho (o RIVAL): campeão do torneio de truco, te provoca, marca desafio de sinuca valendo dinheiro num bar, e às vezes
//       compra o imóvel que você estava olhando. Perde três vezes para você e… passa a te respeitar (vira ex-rival e manda dicas).
//   Mensagens chegam de tempos em tempos (e depois do que acontece: grande prêmio, torneio, fama no bairro, pressão policial).
// ============================================================================

const Phone = {
    CONTACTS: {
        neguinho: { name: 'Neguinho', emo: '😎', role: 'Parceiro do truco', about: 'Gente boa. Adora um truco e uma cerveja gelada.' },
        cida: { name: 'Dona Cida', emo: '👵', role: 'Vizinha', about: 'Sabe de tudo que acontece no bairro. Tudo mesmo.' },
        baiano: { name: 'Baiano do Ferro-Velho', emo: '🧑‍🔧', role: 'Ferro-velho', about: 'Sempre tem um serviço. Nunca pergunta nada.' },
        brito: { name: 'Sargento Brito', emo: '👮', role: 'PM', about: 'Por um cafezinho, olha para o outro lado. Mas não confie.' },
        dentinho: { name: 'Dentinho', emo: '😁', role: 'Rival', about: 'O campeão do truco do bairro. Quer ser maior que você em tudo.' },
    },
    trust: {}, threads: {}, unread: 0, appts: [], jobs: [], rival: { w: 0, l: 0, friend: false }, interest: [], loans: [], seq: 0, nextT: 40,
    open: false,

    serialize() { return { trust: this.trust, threads: this.threads, unread: this.unread, appts: this.appts, jobs: this.jobs, rival: this.rival, interest: this.interest.slice(-6), loans: this.loans, seq: this.seq }; },
    load(s) {
        s = s || {};
        this.trust = s.trust || { neguinho: 20, cida: 10, baiano: 0, brito: 0, dentinho: -20 };
        this.threads = s.threads || {}; this.unread = s.unread || 0; this.appts = s.appts || []; this.jobs = s.jobs || []; this.rival = s.rival || { w: 0, l: 0, friend: false };
        this.interest = s.interest || []; this.loans = s.loans || []; this.seq = s.seq || 0;
        if (!s.threads) this._welcome();
        this._badge();
    },
    _welcome() {
        this._msg('neguinho', 'Fala, parceiro! Salvou meu número? Quando quiser um truco é só chamar 🃏', null, true);
        this._msg('cida', 'Oi, meu filho, aqui é a Dona Cida, sua vizinha. Qualquer coisa que eu souber, te conto, viu? 😉', null, true);
    },

    // ------------------------------------------------------------------ mensagens
    _now() { const g = window.game; return { day: Economy.day, hour: g && g.dayNight ? Math.round(g.dayNight.hour * 10) / 10 : 12 }; },
    _msg(who, text, actions = null, quiet = false) {
        const T = this.threads[who] || (this.threads[who] = []), n = this._now();
        const m = { id: ++this.seq, from: 'them', text, day: n.day, hour: n.hour, actions, done: false };
        T.push(m); if (T.length > 40) T.splice(0, T.length - 40);
        if (!quiet) {
            this.unread++;
            const g = window.game; if (g && g._flash) g._flash(`📱 ${this.CONTACTS[who].emo} ${this.CONTACTS[who].name}: ${text.length > 60 ? text.slice(0, 58) + '…' : text}`);
            if (typeof AudioFX !== 'undefined') { AudioFX.blip(988, 0.06, 0.08); setTimeout(() => AudioFX.blip(1318, 0.08, 0.08), 90); }
        }
        this._badge();
        if (this.open) this._render();
        return m;
    },
    _me(who, text) { const T = this.threads[who] || (this.threads[who] = []), n = this._now(); T.push({ id: ++this.seq, from: 'me', text, day: n.day, hour: n.hour }); },
    _t(who, d) { this.trust[who] = Math.max(-100, Math.min(100, (this.trust[who] || 0) + d)); },
    _pick(a) { return a[Math.floor(Math.random() * a.length)]; },

    // Por quadro (fora e dentro das lojas): mensagens novas de tempos em tempos, compromissos e entregas.
    update(g, dt) {
        if (!g.dayNight || !g.player) return;
        if (!this._ready) { this._ready = true; if (!Object.keys(this.threads).length) this.load(null); else this._badge(); }
        this.nextT -= dt;
        if (this.nextT <= 0) { this.nextT = 70 + Math.random() * 80; this._spontaneous(g); }
        // entregas: chegou no ponto?
        const P = g.player.position, day = Economy.day, h = g.dayNight.hour;
        for (const J of this.jobs.slice()) {
            if (day > J.until || (day === J.until && h > J.h)) { this.jobs.splice(this.jobs.indexOf(J), 1); this._t('baiano', -8); this._msg('baiano', 'Pô, cadê a encomenda? Deixa pra lá. Vou arrumar outro.'); continue; }
            if (hypot(J.x - P.x, J.z - P.z) < 5 && g.mode === 'player') {
                this.jobs.splice(this.jobs.indexOf(J), 1); g.inventory.addCash(J.pay); this._t('baiano', 10);
                g._flash(`📦 Entrega feita: +${brl(J.pay)}`); AudioFX.blip(880, 0.12, 0.15);
                this._msg('baiano', this._pick(['Chegou certinho. Tá pago, parceiro.', 'Valeu! Pode contar comigo pra próxima.', 'Beleza. Dinheiro na mão, calcinha no chão… brincadeira. Valeu!']));
            }
        }
        // compromisso perdido
        for (const A of this.appts.slice()) if (day > A.day || (day === A.day && h > A.h1)) {
            this.appts.splice(this.appts.indexOf(A), 1);
            if (A.kind === 'truco') { this._t('neguinho', -6); this._msg('neguinho', this._pick(['Te esperei no bar… deu bolo, hein?', 'Pô, parceiro, fiquei lá sozinho igual um poste.'])); }
            if (A.kind === 'rival') { this.rival.l++; this._msg('dentinho', this._pick(['Amarelou, né? Já sabia 😁', 'Não apareceu… medinho? Hahaha'])); }
        }
        // empréstimo da Dona Cida
        for (const L of this.loans.slice()) if (day >= L.due) {
            this.loans.splice(this.loans.indexOf(L), 1);
            if (L.pays) { g.inventory.addCash(L.back); this._t('cida', 6); this._msg('cida', `Meu filho, tá aqui o seu dinheiro: ${brl(L.back)}. Com um agradinho! Deus te abençoe.`); }
            else { this._msg('cida', 'Ai, meu filho… esse mês tá difícil. Te pago depois, tá? 😅'); }
        }
        // o Sargento Brito, sem confiança nenhuma, dedura
        if ((this.trust.brito || 0) < -30 && Math.random() < dt / 600 && g.wanted && g.wanted.level === 0 && g.mode === 'player') {
            g.wanted.ensureLevel(1); g._flash('🚔 O Sargento Brito te dedurou — a polícia sabe onde você está!');
            this._t('brito', 10);
        }
    },

    // Mensagens que chegam sozinhas (uma por vez): cada contato tem o seu jeito.
    _spontaneous(g) {
        const opts = [], tr = this.trust, P = g.player.position, F = typeof WorldMemory !== 'undefined' ? WorldMemory.fameAt(P.x, P.z) : { fear: 0, respect: 0 };
        if (tr.neguinho > -40 && !this.appts.some((a) => a.kind === 'truco')) opts.push(['neguinho', 'invite', 3]);
        opts.push(['cida', 'tip', 2]);
        if (F.fear >= 40 || F.respect >= 40) opts.push(['cida', 'fame', 1.5]);
        if (Math.random() < 0.4 && !this.loans.length) opts.push(['cida', 'loan', 1]);
        if (!this.jobs.length) opts.push(['baiano', 'job', 2]);
        if (typeof Standing !== 'undefined' && Standing.heat > 35) opts.push(['brito', 'warn', 3]);
        const arc = typeof RivalArc !== 'undefined' ? RivalArc.outcome : null;
        if (arc === 'dead' || arc === 'exiled') { /* (o Dentinho saiu da história) */ }
        else if (arc === 'partner') opts.push(['dentinho', 'tip', 1]);
        else if (!this.rival.friend) { opts.push(['dentinho', 'taunt', 1]); if (!this.appts.some((a) => a.kind === 'rival')) opts.push(['dentinho', 'challenge', 1.5]); if (this.interest.length) opts.push(['dentinho', 'property', 1.2]); }
        else opts.push(['dentinho', 'tip', 1]);
        let s = Math.random() * opts.reduce((a, o) => a + o[2], 0);
        for (const [who, kind, w] of opts) { if ((s -= w) <= 0) { this['_gen_' + kind](g, who); return; } }
    },
    _bar(g, maxD = 700) {
        Interiors.index();
        const P = g.player.position, L = Interiors._doors.filter((d) => d.style === 'bar' && hypot(d.x - P.x, d.z - P.z) < maxD);
        return L.length ? L[Math.floor(Math.random() * L.length)] : null;
    },
    _gen_invite(g) {
        const b = this._bar(g); if (!b) return;
        const h = Math.max(Math.ceil(g.dayNight.hour + 1), 19) % 24, d = h < g.dayNight.hour ? Economy.day + 1 : Economy.day;
        this._msg('neguinho', this._pick([`Bora um truco hoje? Tô no ${b.name} das ${h}h às ${h + 3}h. Cola lá!`, `Parceiro! Truco no ${b.name}, ${h}h. A primeira rodada é por minha conta 🍺`]),
            [{ label: 'Bora!', act: 'inviteYes', data: { shop: b.id, name: b.name, x: b.x, z: b.z, h0: h, h1: h + 3, day: d } }, { label: 'Hoje não', act: 'inviteNo' }]);
    },
    _gen_tip(g, who) {
        const t = typeof StreetLife !== 'undefined' ? StreetLife._newTip(g, null) : null;
        if (!t) return;
        this._msg(who, (who === 'cida' ? 'Menino, escuta essa (não fala que fui eu): ' : 'Tá, uma dica de amigo: ') + t.replace(/^\(cochicho\) /, ''));
    },
    _gen_fame(g) {
        const P = g.player.position, F = WorldMemory.fameAt(P.x, P.z);
        this._msg('cida', F.fear >= 40 ? this._pick(['O bairro todo tá falando de você… tão com medo, meu filho. Cuidado, viu?', 'Ouvi na padaria que você anda aprontando. Juízo!']) : this._pick(['Todo mundo te elogiando por aqui, que orgulho! 🥰', 'A vizinhança gosta muito de você, sabia?']));
        this._t('cida', 1);
    },
    _gen_loan() { this._msg('cida', 'Meu filho, me empresta R$ 200 pra pagar a conta de luz? Te devolvo semana que vem, prometo 🙏', [{ label: 'Empresto (R$ 200)', act: 'loanYes' }, { label: 'Agora não dá', act: 'loanNo' }]); },
    _gen_job(g) {
        const P = g.player.position, M = g.nav && g.nav.map; if (!M) return;
        let pt = null;
        for (let k = 0; k < 30 && !pt; k++) { const a = Math.random() * 6.28, r = 220 + Math.random() * 380, x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r; const q = M.closestPoint(x, z, 12); if (q && M.walk(q.x, q.z)) pt = q; }
        if (!pt) return;
        const pay = Math.round((300 + Math.random() * 900) / 10) * 10, where = typeof RealEstate !== 'undefined' ? RealEstate.locate(pt.x, pt.z).region : 'na cidade';
        this._msg('baiano', `Tenho uma encomenda pra levar (destino: ${where}). Pago ${brl(pay)}, até amanhã. Topa?`,
            [{ label: 'Topo', act: 'jobYes', data: { x: Math.round(pt.x), z: Math.round(pt.z), pay, where } }, { label: 'Agora não', act: 'jobNo' }]);
    },
    _gen_warn() {
        const cost = 2000;
        this._msg('brito', `Tão preparando operação no morro. Por um cafezinho de ${brl(cost)} eu seguro o pessoal. Pensa rápido.`, [{ label: `Pagar ${brl(cost)}`, act: 'bribeHeat', data: { cost } }, { label: 'Não', act: 'bribeNo' }]);
    },
    _gen_taunt() {
        this._msg('dentinho', this._pick(['E aí, freguês? Sábado tem torneio de truco. Vou te esperar na final de novo 😁', 'Fiquei sabendo que você tá se achando no bairro. Aqui quem manda sou eu.', 'Tô com saudade de ganhar de você 😁']));
    },
    _gen_challenge(g) {
        const b = this._bar(g, 900); if (!b) return;
        const bet = this._pick([2000, 5000, 10000]), d = Economy.day + 1;
        this._msg('dentinho', `Te desafio na sinuca: ${brl(bet)}, amanhã no ${b.name} entre 20h e 23h. Ou tá com medinho? 😁`,
            [{ label: 'Desafio aceito', act: 'rivalYes', data: { shop: b.id, name: b.name, x: b.x, z: b.z, h0: 20, h1: 23, day: d, bet } }, { label: 'Amarelar', act: 'rivalNo' }]);
    },
    _gen_property() {
        const id = this.interest.shift(); if (id == null || typeof RealEstate === 'undefined') return;
        const p = RealEstate.list.find((q) => q.id === id); if (!p || RealEstate.isOwned(p)) return;
        RealEstate.rivalTaken = RealEstate.rivalTaken || {}; RealEstate.rivalTaken[p.id] = Economy.day + 7;
        this._msg('dentinho', `Comprei aquele ${p.type.toLowerCase()} em ${p.region} que você tava de olho. Hahaha! Volta ao mercado… quando eu quiser 😁`);
    },

    // ------------------------------------------------------------------ respostas
    _act(m, act) {
        const g = window.game, d = m.actions && m.actions.find((a) => a.act === act) ? m.actions.find((a) => a.act === act).data : null;
        const who = Object.keys(this.threads).find((k) => this.threads[k].includes(m));
        m.done = true;
        switch (act) {
            case 'inviteYes': this._me(who, 'Bora! Tô indo.'); this.appts.push(Object.assign({ kind: 'truco', who }, d)); g.setGps(d.x, d.z, `Truco com o Neguinho — ${d.name} (${d.h0}h)`); this._t('neguinho', 3); break;
            case 'inviteNo': this._me(who, 'Hoje não vai dar.'); this._t('neguinho', -2); this._msg('neguinho', 'Tranquilo, fica pra próxima!', null, true); break;
            case 'loanYes':
                if (g.inventory.cash < 200) { g._flash('Você não tem R$ 200 em dinheiro vivo'); m.done = false; return; }
                g.inventory.cash -= 200; this._me(who, 'Tá aqui, Dona Cida.'); this._t('cida', 8);
                this.loans.push({ due: Economy.day + 3 + Math.floor(Math.random() * 4), back: 260, pays: (this.trust.cida || 0) >= 0 || Math.random() < 0.6 });
                this._msg('cida', 'Deus te abençoe, meu filho! Você é um anjo 😇', null, true); break;
            case 'loanNo': this._me(who, 'Agora não dá, Dona Cida.'); this._t('cida', -3); break;
            case 'jobYes': this._me(who, 'Topo. Manda.'); this.jobs.push(Object.assign({ until: Economy.day + 1, h: g.dayNight.hour }, d)); g.setGps(d.x, d.z, `Entrega do Baiano (${brl(d.pay)})`); this._t('baiano', 2); break;
            case 'jobNo': this._me(who, 'Agora não.'); this._t('baiano', -1); break;
            case 'bribeHeat':
                if (g.inventory.cash < d.cost) { g._flash('Dinheiro vivo insuficiente'); m.done = false; return; }
                g.inventory.cash -= d.cost; Standing.heat = Math.max(0, Standing.heat - 35); this._t('brito', 6);
                this._me(who, 'Feito. Segura aí.'); this._msg('brito', 'Tá na mão. Ninguém sobe hoje 👍', null, true); break;
            case 'bribeNo': this._me(who, 'Não vou pagar.'); this._t('brito', -8); this._msg('brito', 'Depois não reclama.', null, true); break;
            case 'rivalYes': this._me(who, 'Aceito. Leva o dinheiro.'); this.appts.push(Object.assign({ kind: 'rival', who }, d)); g.setGps(d.x, d.z, `Desafio do Dentinho — ${d.name} (amanhã, 20h)`); break;
            case 'rivalNo': this._me(who, 'Não tô a fim.'); this.rival.l++; this._msg('dentinho', 'Sabia que ia amarelar 🐔', null, true); break;
            default: { const r = (typeof RivalArc !== 'undefined' && RivalArc.onPhoneAct(act)) || (typeof Witnesses !== 'undefined' && Witnesses.onPhoneAct(act)); if (r) this._me(who, r); else if (r === null && act.startsWith('raid')) { m.done = false; return; } }
        }
        this._render();
    },

    // Entrou numa loja: o compromisso do Neguinho (rodada paga) ou o desafio do Dentinho (a sinuca).
    onEnterShop(g, shop) {
        const h = g.dayNight.hour, day = Economy.day;
        for (const A of this.appts.slice()) {
            if (A.shop !== shop.id || A.day !== day || h < A.h0 - 0.5 || h > A.h1) continue;
            if (A.kind === 'truco') {
                this.appts.splice(this.appts.indexOf(A), 1);
                const gift = 150 + Math.floor(Math.random() * 150);
                g.inventory.addCash(gift); this._t('neguinho', 8);
                setTimeout(() => g._flash(`🍺 O Neguinho está aqui: "Chegou! A rodada é minha." (+${brl(gift)}) — a mesa de jogos te espera`), 1200);
            }
            if (A.kind === 'rival') { this.rivalHere = A; setTimeout(() => g._flash(`😁 O Dentinho está na sinuca te esperando — ${brl(A.bet)} (E na mesa de sinuca)`), 1200); }
        }
    },
    // A sinuca contra o Dentinho (BarGames/Interiors chama no E da mesa de sinuca).
    rivalPrompt(shop) { const A = this.rivalHere; return A && A.shop === shop.id && this.appts.includes(A) ? `<b>E</b> encarar o Dentinho na sinuca<small>${brl(A.bet)} · ele está te esperando</small>` : ''; },
    rivalPlay(g, shop) {
        const A = this.rivalHere; if (!A || A.shop !== shop.id || !this.appts.includes(A)) { this.rivalHere = null; return false; }
        if (g.inventory.cash < A.bet) { g._flash(`Você precisa de ${brl(A.bet)} em dinheiro vivo para encarar o Dentinho`); return true; }
        this.appts.splice(this.appts.indexOf(A), 1); this.rivalHere = null;
        Pool.challenge(g, shop, { name: 'Dentinho', emo: '😁', lvl: 3, bet: A.bet, onEnd: (won) => this._rivalResult(g, won, A.bet) });
        return true;
    },
    _rivalResult(g, won, bet) {
        if (won) {
            this.rival.w++;
            if (this.rival.w >= 3 && !this.rival.friend) {
                this.rival.friend = true; this.CONTACTS.dentinho.role = 'Ex-rival'; this.trust.dentinho = 30;
                this._msg('dentinho', 'Tá bom… você é bom mesmo. Três vezes. Respeito. Se precisar de uma dica, me chama. 🤝');
            } else this._msg('dentinho', this._pick(['Sorte. Pura sorte. A gente se vê.', 'Isso não vai ficar assim…', 'Revanche. Vou te mandar a data.']));
        } else { this.rival.l++; this._msg('dentinho', this._pick(['Hahaha! Obrigado pelo dinheiro 😁', 'Freguês é freguês 😁'])); }
    },
    onViewProperty(p) { if (p && !this.interest.includes(p.id)) { this.interest.push(p.id); if (this.interest.length > 6) this.interest.shift(); } },
    onEvent(e) {
        if (e.kind === 'bigwin') this.onBigWin(e);
        else if (e.kind === 'tourney') this.onTourney();
        else if (e.kind === 'robbery' && !this.rival.friend && !(typeof RivalArc !== 'undefined' && RivalArc.outcome) && Math.random() < 0.2) {          // o Dentinho viu… e dedurou
            const g = window.game;
            setTimeout(() => { if (g && g.wanted) g.wanted.ensureLevel(1); }, 4000);
            this._msg('dentinho', 'Vi você saindo daquela loja 👀 Liguei pro 190. Tchau, freguês 😁');
        }
    },
    onBigWin(e) { if (Math.random() < 0.6) this._msg('neguinho', this._pick([`Soube que você limpou a mesa${e.place ? ' no ' + e.place : ''}! Paga uma pra mim, hein? 🍺`, 'Tá rico agora, parceiro? Não esquece dos amigos!'])); },
    onTourney() { if (!this.rival.friend) this._msg('dentinho', 'Campeão do torneio, é? Semana que vem eu te pego. 😠'); },

    // Ações nos contatos (fora das conversas).
    _contactAct(id) {
        const g = window.game;
        if (id === 'brito') {
            const lvl = g.wanted ? g.wanted.level : 0;
            if (!lvl) { this._msg('brito', 'Tá limpo, meu chapa. Não me liga à toa.', null, true); this._render(); return; }
            if ((this.trust.brito || 0) < -20) { this._msg('brito', 'Comigo não, depois do que você fez.', null, true); this._render(); return; }
            const cost = 2500 * lvl;
            if (g.inventory.cash < cost) { g._flash(`O Brito quer ${brl(cost)} em dinheiro vivo`); return; }
            g.inventory.cash -= cost; g.wanted._set(lvl - 1, 'bribe'); this._t('brito', 3);
            this._me('brito', 'Me dá uma aliviada.'); this._msg('brito', `Cafezinho recebido (${brl(cost)}). Vou mandar a viatura pro outro lado.`, null, true);
        } else if (id === 'neguinho') { this._gen_invite(g); }
        else if (id === 'baiano') { if (!this.jobs.length) this._gen_job(g); else this._msg('baiano', 'Termina a entrega que eu te dei primeiro, parceiro.', null, true); }
        else if (id === 'cida') { this._gen_tip(g, 'cida'); }
        this._render();
    },

    // ------------------------------------------------------------------ tela
    _build() {
        if (this.root) return;
        const st = document.createElement('style');
        st.textContent = `
            #phone { position: fixed; right: 20px; top: 50%; transform: translateY(-50%); width: min(360px, 92vw); height: min(640px, 88vh); z-index: 70; display: none;
                border-radius: 38px; padding: 12px; background: linear-gradient(160deg, #23262f, #0d0f14); box-shadow: 0 0 0 2px #3a3f4a, 0 30px 80px rgba(0,0,0,0.6); font-family: var(--font); }
            #phone .scr { position: relative; width: 100%; height: 100%; border-radius: 28px; overflow: hidden; background: #0f1218; color: #e8eaf0; display: flex; flex-direction: column; }
            #phone .bar { display: flex; justify-content: space-between; padding: 10px 18px 4px; font: 700 12px var(--font-d); color: #cbd5e1; }
            #phone .notch { position: absolute; top: 6px; left: 50%; width: 90px; height: 20px; margin-left: -45px; border-radius: 12px; background: #000; }
            #phone .tabs { display: flex; gap: 4px; padding: 6px 10px; }
            #phone .tabs button { flex: 1; padding: 7px 4px; border-radius: 12px; border: 0; background: #1c2230; color: #cbd5e1; font: 700 12px var(--font-d); cursor: pointer; }
            #phone .tabs button.on { background: #2f6fd6; color: #fff; }
            #phone .body { flex: 1; overflow: auto; padding: 6px 12px 14px; }
            #phone .ct { display: flex; gap: 10px; align-items: center; padding: 10px; border-radius: 14px; background: #171c27; margin-top: 6px; cursor: pointer; }
            #phone .ct .av { font-family: var(--emoji); font-size: 26px; } #phone .ct b { display: block; font: 700 14px var(--font-d); } #phone .ct small { color: #94a3b8; font-size: 11px; }
            #phone .ct .n { margin-left: auto; min-width: 20px; padding: 2px 7px; border-radius: 10px; background: #ef4444; color: #fff; font: 800 11px var(--font-d); text-align: center; }
            #phone .tr { height: 5px; border-radius: 3px; background: #2a3242; margin-top: 4px; overflow: hidden; } #phone .tr i { display: block; height: 100%; }
            #phone .msg { max-width: 82%; margin: 6px 0; padding: 8px 11px; border-radius: 16px; font-size: 13px; line-height: 1.4; }
            #phone .msg.them { background: #232a38; border-bottom-left-radius: 4px; } #phone .msg.me { background: #2f6fd6; margin-left: auto; border-bottom-right-radius: 4px; }
            #phone .msg small { display: block; font-size: 10px; opacity: 0.55; margin-top: 2px; }
            #phone .acts { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; } #phone .acts button { padding: 6px 10px; border-radius: 10px; border: 0; background: #10b981; color: #062; font: 700 12px var(--font-d); cursor: pointer; }
            #phone .acts button.no { background: #334155; color: #e2e8f0; }
            #phone .hd { display: flex; align-items: center; gap: 8px; padding: 4px 0 8px; border-bottom: 1px solid #1f2633; margin-bottom: 4px; }
            #phone .hd button { border: 0; background: none; color: #93c5fd; font: 700 13px var(--font-d); cursor: pointer; }
            #phone .news { padding: 9px 2px; border-bottom: 1px solid #1c2230; font-size: 13px; } #phone .news small { color: #94a3b8; font-size: 11px; display: block; }
            #phoneBadge { position: fixed; right: 18px; bottom: 210px; z-index: 12; padding: 8px 12px; border-radius: 16px; background: var(--glass); border: 1px solid var(--line-2); cursor: pointer;
                font: 700 13px var(--font-d); color: var(--tx); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); }
            #phoneBadge b { margin-left: 4px; padding: 1px 7px; border-radius: 10px; background: #ef4444; color: #fff; font-size: 11px; }`;
        document.head.appendChild(st);
        const r = this.root = document.createElement('div'); r.id = 'phone';
        r.innerHTML = '<div class="scr"><div class="notch"></div><div class="bar"><span id="phClock"></span><span>📶 🔋</span></div><div class="tabs"><button data-tab="msgs">Mensagens</button><button data-tab="contacts">Contatos</button><button data-tab="news">Jornal</button></div><div class="body" id="phBody"></div></div>';
        document.body.appendChild(r);
        r.addEventListener('click', (e) => {
            const t = e.target.closest('[data-tab]'); if (t) { this.tab = t.dataset.tab; this.thread = null; this._render(); return; }
            const c = e.target.closest('[data-cact]'); if (c) { this._contactAct(c.dataset.cact); return; }
            const th = e.target.closest('[data-thread]'); if (th) { this.thread = th.dataset.thread; this.tab = 'msgs'; this.threads[this.thread] = this.threads[this.thread] || []; this._render(); return; }
            const back = e.target.closest('[data-back]'); if (back) { this.thread = null; this._render(); return; }
            const a = e.target.closest('[data-act]'); if (a) { const T = this.threads[this.thread] || [], m = T.find((q) => q.id === +a.dataset.m); if (m && !m.done) this._act(m, a.dataset.act); return; }
        });
        window.addEventListener('keydown', (e) => {
            const k = e.key, g = window.game;
            if (this.open && (k === 'Escape' || k === 'j' || k === 'J')) { e.preventDefault(); e.stopPropagation(); this.toggle(false); return; }
            if (!this.open && (k === 'j' || k === 'J') && !e.repeat && g && g.player && !(e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) && !g._modalUiOpen() && !(g.menu && g.menu.isOpen)) { e.preventDefault(); this.toggle(true); }
        }, true);
        const b = this.badgeEl = document.createElement('div'); b.id = 'phoneBadge'; b.onclick = () => this.toggle(true); document.body.appendChild(b);
        this.tab = 'msgs';
    },
    _badge() {
        if (!document.body) return;
        this._build();
        this.badgeEl.innerHTML = `📱${this.unread ? `<b>${this.unread}</b>` : ''}`;
        this.badgeEl.title = 'Celular (J)';
    },
    toggle(on = !this.open) {
        this._build();
        this.open = on;
        this.root.style.display = on ? 'block' : 'none';
        if (on) { this._render(); AudioFX.blip(700, 0.05, 0.08); }
        const g = window.game; if (g && g.input) { g.input.justPressed = {}; }
    },
    _render() {
        if (!this.open) return;
        const B = document.getElementById('phBody'), g = window.game;
        document.getElementById('phClock').textContent = g && g.dayNight ? g.dayNight.label : '';
        for (const b of this.root.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === this.tab);
        const C = this.CONTACTS, esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);
        if (this.tab === 'msgs' && this.thread) {
            const T = this.threads[this.thread] || [], c = C[this.thread];
            const read = T.filter((m) => m.from === 'them' && !m.read).length; for (const m of T) m.read = true; this.unread = Math.max(0, this.unread - read); this._badge();
            B.innerHTML = `<div class="hd"><button data-back="1">‹ Voltar</button><span style="font-family:var(--emoji);font-size:20px">${c.emo}</span><b>${c.name}</b></div>`
                + T.map((m) => `<div class="msg ${m.from}">${esc(m.text)}<small>dia ${m.day} · ${String(Math.floor(m.hour)).padStart(2, '0')}h${String(Math.round((m.hour % 1) * 60)).padStart(2, '0')}</small>${m.actions && !m.done ? `<div class="acts">${m.actions.map((a, i) => `<button data-act="${a.act}" data-m="${m.id}" class="${i ? 'no' : ''}">${a.label}</button>`).join('')}</div>` : ''}</div>`).join('');
            B.scrollTop = B.scrollHeight;
            return;
        }
        if (this.tab === 'msgs') {
            const ids = Object.keys(this.threads).sort((a, b) => (this.threads[b].slice(-1)[0] || {}).id - (this.threads[a].slice(-1)[0] || {}).id);
            B.innerHTML = ids.map((id) => { const T = this.threads[id], last = T[T.length - 1], n = T.filter((m) => m.from === 'them' && !m.read).length; return `<div class="ct" data-thread="${id}"><span class="av">${C[id].emo}</span><span style="min-width:0;flex:1"><b>${C[id].name}</b><small style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${last ? esc(last.text) : ''}</small></span>${n ? `<span class="n">${n}</span>` : ''}</div>`; }).join('') || '<p style="color:#94a3b8;text-align:center;margin-top:30px">Nenhuma mensagem.</p>';
            return;
        }
        if (this.tab === 'contacts') {
            const lvl = g && g.wanted ? g.wanted.level : 0;
            const actOf = { brito: lvl ? `Pedir um cafezinho (−1 ★, ${brl(2500 * lvl)})` : 'Ligar', neguinho: 'Chamar pro truco', baiano: 'Pedir um serviço', cida: 'Perguntar as novidades' };
            B.innerHTML = Object.keys(C).filter((id) => this.threads[id] || id !== 'dentinho' || this.rival.l || this.rival.w).map((id) => {
                const t = this.trust[id] || 0, col = t >= 30 ? '#22c55e' : t >= 0 ? '#eab308' : '#ef4444';
                return `<div class="ct" data-thread="${id}" style="flex-wrap:wrap"><span class="av">${C[id].emo}</span><span style="flex:1;min-width:0"><b>${C[id].name}</b><small>${C[id].role} · ${C[id].about}</small>
                    <div class="tr"><i style="width:${Math.round((t + 100) / 2)}%;background:${col}"></i></div>${id === 'dentinho' ? `<small>contra ele: ${this.rival.w} vitória(s) · ${this.rival.l} derrota(s)${this.rival.friend ? ' · agora te respeita' : ''}</small>` : ''}</span>
                    ${actOf[id] ? `<div class="acts" style="width:100%"><button data-cact="${id}">${actOf[id]}</button></div>` : ''}</div>`;
            }).join('');
            return;
        }
        if (typeof News !== 'undefined') { News.tick(); B.innerHTML = News.items.slice(-12).reverse().map((it) => `<div class="news">${it.mine ? '🔴 ' : ''}${esc(it.text)}<small>dia ${it.day}</small></div>`).join('') + News.city().slice(0, 4).map((t) => `<div class="news" style="opacity:.7">${esc(t)}</div>`).join(''); }
    },
};
