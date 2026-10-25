// ============================================================================
// Witnesses — TESTEMUNHAS na rua e BUSCA E APREENSÃO em casa (complementa crime/Traces.js, que cuida da cena dos assaltos a loja).
//   • TESTEMUNHAS  matar, assaltar ou arrancar alguém do carro na rua com gente olhando: até 3 pedestres que VIRAM (perto e com
//                  linha de visão; agachado, menos) saem correndo com o celular na mão (📞 em cima da cabeça). Em ~20–40 s cada um liga:
//                  a polícia de perto vem ao local (círculo amarelo) e a sua roupa vira a descrição. (The flagrant itself — and the
//                  record — was decided at the moment of the crime by police/HeatStateMachine.js.)
//                  Alcance a testemunha antes: E com a arma na mão INTIMIDA (o bairro passa a ter medo; às vezes ela grita e liga na hora),
//                  sem arma SUBORNA (o preço depende do crime). Testemunha que sai de perto (some da rua) também liga.
//   • BATIDA       with a warrant on the record (HeatStateMachine), a Polícia Civil marca uma busca e apreensão na sua casa para o dia
//                  seguinte de manhã. O Sargento Brito (se ainda confia em você) avisa na véspera — e, por um cafezinho, segura a batida.
//                  Na batida levam do cofre e do baú: boa parte do dinheiro sujo, as joias e as armas. What they find is filed as
//                  'possession'. Estar em casa na hora: a porta vem abaixo e você vira procurado.
// ============================================================================

const Witnesses = {
    list: [], raid: null, _id: 0,
    COST: { kill: 1500, cop: 2500, holdup: 300, carjack: 450 },
    LABEL: { kill: 'homicídio', cop: 'policial morto', holdup: 'assalto', carjack: 'roubo de carro' },

    // ---------------------------------------------------------------- testemunhas
    onCrime(kind, x, z) {
        const g = window.game;
        if (!this.COST[kind] || !g || !g.npcManager || Interiors.active || !g.player) return;
        const P = new BABYLON.Vector3(x, 0, z), M = g.npcManager, R = 26 * (g.player.crouched ? 0.6 : 1);
        const cand = M.npcs.filter((n) => n.alive && !n.rag && !n.witness && !n.mugger && !n.surrendered && hypot(n.position.x - x, n.position.z - z) < R && M._sees(n, P))
            .sort((a, b) => hypot(a.position.x - x, a.position.z - z) - hypot(b.position.x - x, b.position.z - z)).slice(0, 3);
        for (const n of cand) {
            const W = { id: ++this._id, npc: n, kind, x, z, t: 20 + Math.random() * 20, ping: 0 };
            n.witness = W; this.list.push(W);
            n.panic(P);
            if (typeof Bubbles !== 'undefined') Bubbles.say(n, this._pick(['Vou chamar a polícia!', 'Alô, 190?!', 'Socorro! Polícia!']), { tone: 'shout', ms: 2200 });
        }
    },
    _pick(a) { return a[Math.floor(Math.random() * a.length)]; },

    update(g, dt) {
        for (let i = this.list.length - 1; i >= 0; i--) {
            const W = this.list[i], n = W.npc;
            if (W.done) { this.list.splice(i, 1); continue; }
            const gone = !n.alive || (g.npcManager && !g.npcManager.npcs.includes(n));
            if (!n.alive) { this._end(W); continue; }                      // (morta: não liga — mas foi outro crime, com outras testemunhas)
            W.t -= dt;
            if (gone || W.t <= 0) { this._call(g, W); continue; }
            W.ping -= dt;
            if (W.ping <= 0 && typeof Bubbles !== 'undefined' && !Interiors.active) { W.ping = 1.1; Bubbles.say(n, `📞 ${Math.ceil(W.t)}s`, { tone: 'hint', ms: 1200, key: 'wit' + W.id }); }
        }
        this._raidUpdate(g, dt);
    },
    _end(W) { W.done = true; if (W.npc) W.npc.witness = null; },
    _call(g, W) {
        this._end(W);
        const full = typeof Traces !== 'undefined' && Traces.fullMask();
        if (typeof Traces !== 'undefined') {
            Traces.call(W.x, W.z, 0, `Uma testemunha ligou (${this.LABEL[W.kind]})`);
            if (!full) { Traces.desc = Object.assign(Traces.sig(), { until: Traces.now() + 48, where: 'na rua' }); }
        }
    },
    pending() { return this.list.filter((W) => !W.done).length; },
    near(g) {
        if (g.mode !== 'player' || Interiors.active) return null;
        const P = g.player.position;
        let best = null, bd = 2.4;
        for (const W of this.list) { if (W.done) continue; const d = hypot(W.npc.position.x - P.x, W.npc.position.z - P.z); if (d < bd) { bd = d; best = W; } }
        return best;
    },
    prompt(g) {
        const W = this.near(g); if (!W) return '';
        return g.player.weapon !== 'none' ? `<b>E</b> intimidar a testemunha<small>ela vai ligar em ${Math.ceil(W.t)}s · o bairro passa a ter medo</small>`
            : `<b>E</b> subornar a testemunha — ${brl(this.COST[W.kind])}<small>ela vai ligar em ${Math.ceil(W.t)}s · com a arma na mão: intimidar</small>`;
    },
    interact(g) {
        const W = this.near(g); if (!W) return false;
        const n = W.npc, P = g.player.position;
        if (g.player.weapon !== 'none') {
            if (Math.random() < 0.85) {
                this._end(W); n.surrender(P); setTimeout(() => n.alive && n.endSurrender(P), 1600);
                if (typeof Bubbles !== 'undefined') Bubbles.say(n, this._pick(['Não vi nada! Juro!', 'Tá bom, tá bom… eu não vi nada.', 'Pelo amor de Deus, não atira!']), { tone: 'whisper', ms: 2600 });
                if (typeof WorldMemory !== 'undefined') WorldMemory.crime('threat', n.position.x, n.position.z);
                g._flash('🔇 Testemunha intimidada: ela não vai ligar');
            } else {
                if (typeof Bubbles !== 'undefined') Bubbles.say(n, 'SOCORRO! POLÍCIA!', { tone: 'shout', ms: 2200 });
                g._flash('📞 Ela gritou e ligou na hora!'); this._call(g, W); n.panic(P);
            }
            return true;
        }
        const c = this.COST[W.kind];
        if (g.inventory.cash < c) { g._flash(`Você precisa de ${brl(c)} em dinheiro vivo para comprar o silêncio dela`); return true; }
        const resp = typeof WorldMemory !== 'undefined' ? WorldMemory.fameAt(P.x, P.z).respect : 0;
        if (Math.random() < (resp >= 20 ? 0.92 : 0.78)) {
            g.inventory.cash -= c; this._end(W);
            if (typeof Bubbles !== 'undefined') Bubbles.say(n, this._pick(['…eu não vi nada, tá?', 'Tá certo. Esquece.', 'Ninguém vai saber.']), { tone: 'whisper', ms: 2600 });
            g._flash(`🤐 Testemunha subornada (−${brl(c)}): ela não vai ligar`);
        } else {
            if (typeof Bubbles !== 'undefined') Bubbles.say(n, 'Tá me oferecendo dinheiro?! Vou ligar agora!', { tone: 'angry', ms: 2400 });
            g._flash('📞 Ela recusou o suborno e ligou'); this._call(g, W); n.panic(P);
        }
        return true;
    },

    // ---------------------------------------------------------------- busca e apreensão
    onNewDay() {
        const g = window.game; if (!g || typeof Traces === 'undefined') return;
        if (this.raid || !g.heat || !g.heat.hasWarrant || Math.random() > 0.5) return;
        this.raid = { day: Economy.day + 1, h: 5.5 + Math.random() * 2, held: false };
        if (typeof Phone !== 'undefined' && (Phone.trust.brito || 0) >= 5) {
            Phone._msg('brito', `Tô te avisando como amigo: a Civil vai fazer busca e apreensão na sua casa amanhã cedo. Tira o que tiver de errado de lá. Ou me dá ${brl(4000)} que eu "perco" o mandado.`,
                [{ label: `Pagar ${brl(4000)}`, act: 'raidHold' }, { label: 'Valeu o aviso', act: 'raidOk' }]);
        }
    },
    onPhoneAct(act) {
        const g = window.game;
        if (act === 'raidHold') {
            if (!this.raid) return 'Já era.';
            if (g.inventory.cash < 4000) { g._flash('Dinheiro vivo insuficiente'); return null; }
            g.inventory.cash -= 4000; this.raid = null; if (typeof Phone !== 'undefined') { Phone._t('brito', 4); Phone._msg('brito', 'Mandado perdido 👍 Mas baixa a bola, viu?', null, true); }
            return 'Segura pra mim.';
        }
        if (act === 'raidOk') { if (typeof Phone !== 'undefined') Phone._t('brito', 1); return 'Valeu.'; }
        return null;
    },
    _raidUpdate(g, dt) {
        const R = this.raid; if (!R || !g.dayNight) return;
        if (Economy.day < R.day || (Economy.day === R.day && g.dayNight.hour < R.h)) return;
        this.raid = null;
        const B = g.stash && g.stash.boxes; if (!B) return;
        const cash = B.safe.cash || 0, took = Math.round(cash * 0.7), jewels = B.safe.jewels || 0;
        const guns = Object.keys(B.chest).filter((k) => k.startsWith('weapon:') && B.chest[k] > 0);
        if (took) B.safe.cash = cash - took;
        if (jewels) { delete B.safe.jewels; g.stash.jv = 0; }
        for (const k of guns) { delete B.chest[k]; if (g.stash.wstate) delete g.stash.wstate[k.split(':')[1]]; }
        const found = took > 0 || jewels > 0 || guns.length > 0;
        const home = Interiors.active && (Interiors.active.shop.home || Interiors.active.shop.safehouse);
        if (found) g.heat.fileEvidence('possession');
        const parts = [took ? `${brl(took)} do cofre` : '', jewels ? `${jewels} joia(s)` : '', guns.length ? `${guns.length} arma(s)` : ''].filter(Boolean);
        g._flash(found ? `🚨 BUSCA E APREENSÃO na sua casa: a Civil levou ${parts.join(', ')}` : '🚨 A Civil fez busca e apreensão na sua casa e não achou nada');
        if (home) { g.wanted.ensureLevel(2); g._flash('🚪 A polícia arrombou a porta com você dentro! Fuja!'); }
        if (typeof WorldMemory !== 'undefined') WorldMemory.log('raid', { found, value: took, district: g.empire ? g.empire.districtAt(g.player.position.x, g.player.position.z) : null });
        AudioFX.blip(150, 0.5, 0.25);
    },

    hudChip() {
        const n = this.pending(); if (!n) return '';
        const t = Math.ceil(Math.min(...this.list.filter((W) => !W.done).map((W) => W.t)));
        return `📞 ${n > 1 ? n + ' testemunhas vão' : '1 testemunha vai'} ligar (${t}s)`;
    },
    serialize() { return { raid: this.raid }; },
    load(s) { for (const W of this.list) this._end(W); this.list = []; this.raid = (s && s.raid) || null; },
};
Economy.onDay(() => Witnesses.onNewDay());
