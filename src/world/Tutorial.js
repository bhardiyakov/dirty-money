// ============================================================================
// Tutorial — PRIMEIROS PASSOS: a primeira hora do jogo como uma sequência curta de missões que apresenta o mundo na ordem,
// jogando (nada de tela de texto): a vizinha, o bar e o Seu Zé, o celular, comer, o primeiro crime (e a testemunha) e o rival.
//   • Um objetivo por vez no cartão de baixo (no lugar das metas), com o GPS marcando o lugar; cada passo paga um trocado.
//   • "Pular" encerra tudo (e dá para ver de novo? não: é só para o começo). Saves de antes desta versão já vêm concluídos
//     (SaveGame.MIGRATE 1 → 2).
//   • Durante o passo, a pessoa a encontrar está no lugar dela em qualquer horário (Personas.where consulta Tutorial.forces).
// ============================================================================

const Tutorial = {
    step: 0, done: false, _t: 0, mark: null,

    STEPS: [
        { id: 'rosa', title: 'Fale com a Dona Rosa', sub: 'a vizinha, na entrada do morro — ela conhece todo mundo', person: 'rosa', reward: 50,
            check: () => Personas.R('rosa').talks > 0 },
        { id: 'ze', title: 'Vá ao bar e fale com o Seu Zé', sub: 'o dono do bar perto da sua casa', person: 'ze', reward: 50,
            check: () => Personas.R('ze').talks > 0 },
        { id: 'phone', title: 'Leia a mensagem do Neguinho no celular', sub: 'aperte J (ou toque no 📱)', reward: 50,
            start: () => Phone._msg('neguinho', 'E aí, vizinho novo! O Zé falou de você. Qualquer coisa, me chama aqui no celular — truco, bico, o que for 🃏'),
            check: () => (Phone.threads.neguinho || []).every((m) => m.from === 'me' || m.read) },
        { id: 'eat', title: 'Coma alguma coisa', sub: 'padaria, lanchonete, um ambulante — ou a gelada do Zé', reward: 50,
            start: (T) => { T.fed0 = Physique.fed; T.en0 = Needs.energy; },
            check: (T) => Physique.fed > T.fed0 + 3 || Needs.energy > T.en0 + 3 },
        { id: 'crime', title: 'Faça um furto ou um assalto na rua', sub: 'perto de um pedestre: C furta (discreto) · E assalta (com arma na mão)', reward: 150,
            start: (T) => { T.ev0 = WorldMemory.seq; },
            check: (T) => WorldMemory.events.some((e) => e.n > T.ev0 && (e.kind === 'theft' || e.kind === 'holdup')) && !Witnesses.pending(),
            hint: () => Witnesses.pending() ? '📞 Alguém viu! Alcance a testemunha e aperte E (com arma: intimida · sem arma: suborna) antes que ela ligue' : '' },
        { id: 'rival', title: 'Responda ao Dentinho', sub: 'o campeão do truco do bairro mandou mensagem — aceite (ou não) o desafio', reward: 100,
            start: (T) => { Phone._gen_challenge(window.game); const L = Phone.threads.dentinho || []; T.msg = L.length ? L[L.length - 1].id : null; },
            check: (T) => { const m = (Phone.threads.dentinho || []).find((q) => q.id === T.msg); return !m || m.done; } },
    ],

    active() { return !this.done && this.step < this.STEPS.length; },
    cur() { return this.active() ? this.STEPS[this.step] : null; },
    forces(id) { const s = this.cur(); return !!(s && s.person === id); },

    update(g, dt) {
        if (!this.active() || !g.player || !g._bootDone) { this._card(false); return; }
        this._t -= dt; if (this._t > 0) return; this._t = 0.5;
        const S = this.cur();
        if (!S._started) { S._started = true; try { if (S.start) S.start(this); } catch (e) { console.warn('[TUTORIAL]', e); } this._gps(g, S); }
        let ok = false; try { ok = S.check(this); } catch (e) { ok = false; }
        if (ok) { this._complete(g, S); return; }
        this._card(true, S);
    },
    _gps(g, S) {
        if (!S.person) return;
        const A = Personas._anchors(g); const p = A && A[S.person];
        if (p) g.setGps(p.x, p.z, `Primeiros passos: ${S.title}`);
    },
    _complete(g, S) {
        if (S.reward) { if (typeof Ledger !== 'undefined') Ledger.hold('Metas (recompensas)', 0.6); g.inventory.addCash(S.reward); }
        this.step++;
        if (S.person && g.clearGps) g.gps = null;
        AudioFX.blip(880, 0.1, 0.16); setTimeout(() => AudioFX.blip(1175, 0.12, 0.16), 120);
        if (!this.active()) {
            this.done = true;
            g.inventory.medkits = (g.inventory.medkits || 0) + 1;
            g._flash('✅ PRIMEIROS PASSOS concluídos! +1 kit médico — o resto da cidade é com você (as metas voltam embaixo)');
            this._card(false);
            return;
        }
        g._flash(`✅ ${S.title} (+${brl(S.reward)}) — próximo: ${this.cur().title}`);
        this._t = 0;
    },
    skip() { this.done = true; this._card(false); const g = window.game; if (g) { g.gps = null; g._flash('Primeiros passos pulados — bom jogo!'); } },

    _card(on, S) {
        if (!on) { if (this.el) this.el.style.display = 'none'; document.body.classList.remove('tut-on'); return; }
        if (!this.el) {
            const st = document.createElement('style');
            st.textContent = `
                #tutCard { position: fixed; left: 50%; bottom: 14px; transform: translateX(-50%); z-index: 11; display: flex; align-items: center; gap: 12px; max-width: min(620px, 92vw);
                    padding: 10px 12px 10px 16px; border-radius: 16px; background: var(--glass); border: 1px solid rgba(52,211,153,0.5); color: var(--tx); font: 500 13px/1.4 var(--font);
                    -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); box-shadow: 0 8px 24px rgba(0,0,0,0.35); }
                #tutCard .k { font: 800 10px var(--font-d); letter-spacing: 1.5px; color: #34d399; text-transform: uppercase; }
                #tutCard b { display: block; font: 700 15px var(--font-d); } #tutCard small { color: var(--tx-2); } #tutCard .w { color: #fde68a; display: block; margin-top: 3px; }
                #tutCard button { flex: none; border: 1px solid var(--line-2); background: rgba(255,255,255,0.06); color: var(--tx-2); border-radius: 10px; padding: 7px 10px; font: 600 12px var(--font); cursor: pointer; }
                body.tut-on #goalBox { display: none !important; }
                body.mobile #tutCard { bottom: 6px; max-width: min(420px, 46vw); padding: 7px 8px 7px 12px; font-size: 11px; gap: 8px; } body.mobile #tutCard b { font-size: 13px; }`;
            document.head.appendChild(st);
            const el = this.el = document.createElement('div'); el.id = 'tutCard';
            el.addEventListener('click', (e) => { if (e.target.closest('[data-skip]')) this.skip(); });
            document.body.appendChild(el);
        }
        const h = S.hint ? S.hint() : '';
        const html = `<div style="flex:1;min-width:0"><div class="k">Primeiros passos · ${this.step + 1}/${this.STEPS.length}</div><b>${S.title}</b><small>${S.sub}</small>${h ? `<span class="w">${h}</span>` : ''}</div><button data-skip="1">Pular</button>`;
        if (html !== this._html) { this._html = html; this.el.innerHTML = html; }
        const g = window.game, hide = g && (g.menu.isOpen || g._modalUiOpen() || Interiors.active && S.id !== 'eat');
        this.el.style.display = hide ? 'none' : 'flex';
        document.body.classList.add('tut-on');
    },

    serialize() { return { step: this.step, done: this.done }; },
    load(s) { this.step = s ? s.step || 0 : 0; this.done = s ? !!s.done : false; for (const S of this.STEPS) S._started = false; this._html = null; },
};
