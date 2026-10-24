// ============================================================================
// Traces — what a crime leaves behind besides the record (police/HeatStateMachine.js keeps the record and the identity rules).
//
//   DESCRIPTION     witnesses and cameras describe the OUTFIT (top, legs, head). For 2 days an officer who sees the player up close
//                   (≤ 13 u, wider inside the search area) wearing 2 of those 3 pieces recognizes them → ★. Changing clothes out of
//                   the police's sight breaks the description; changing in front of an officer updates it.
//   SEARCH AREA     when a witness calls after the player left, the radar shows the neighborhood where the cars search.
//   MASK IN PUBLIC  a masked player on the street draws an officer's attention up close (★). K puts on / takes off the last mask.
// Nothing here tracks weapons or vehicles: the police only know what someone saw at the moment of the crime.
// ============================================================================

const Traces = {
    desc: null,           // { top, legs, head, until (absolute game hour), where }
    search: null,         // { x, z, r, t }
    pend: [],             // ligações pendentes: { t, x, z, r, why }
    lastMask: 'balaclava',
    stats: { scenes: 0, clean: 0 },
    game: null,

    now() { const g = this.game; return Economy.day * 24 + (g ? g.dayNight.hour : 0); },
    masked() { const id = Outfit.worn.face; return id && Outfit.ITEMS[id] && Outfit.ITEMS[id].mask ? id : null; },
    fullMask() { return this.masked() === 'balaclava'; },
    sig() {
        const w = Outfit.worn, t = Outfit.tint;
        return { top: (w.top || '') + '|' + (t.top || ''), legs: (w.legs || '') + '|' + (t.legs || ''), head: (w.head || '-') + '|' + (t.head || '') };
    },
    matches() {
        const d = this.desc; if (!d) return false;
        const s = this.sig();
        return (s.top === d.top) + (s.legs === d.legs) + (s.head === d.head) >= 2;
    },

    // ---------------------------------------------------------------- crime scene (a robbery is over)
    // info: { x, z, name, witnesses (awake people who saw it), cams (the recording survived) }. Returns the lines shown to the player.
    scene(game, info) {
        this.game = game;
        const lines = [], masked = this.masked();
        if (info.witnesses > 0 || info.cams) {
            this.desc = Object.assign(this.sig(), { until: this.now() + 48, where: info.name });
            lines.push(I18n.t('traces.scene.outfit'));
        }
        if (!masked && info.cams) lines.push(I18n.t('traces.scene.cameraFace'));
        if (!masked && info.witnesses > 0) lines.push(I18n.t('traces.scene.witnessFace'));
        this.stats.scenes++;
        if (!lines.length) { this.stats.clean++; if (game.achievements && game.achievements.bump) game.achievements.bump('cleanJob'); }
        return lines;
    },

    // Testemunhas que vão ligar daqui a `delay` s (o assalto acabou e você saiu): a polícia por perto vai até a loja e abre a busca.
    call(x, z, delay, why = 'testemunha ligou') { this.pend.push({ t: delay, x, z, r: 240, why }); },
    startSearch(x, z, T = 150, r = 150) { this.search = { x, z, r, t: T }; },

    // ---------------------------------------------------------------- máscara (tecla K)
    toggleMask(game) {
        const cur = this.masked();
        if (cur) { this.lastMask = cur; const r = Outfit.wear(cur); game._flash('😶 Tirou a máscara'); return r; }
        const pick = [this.lastMask, 'balaclava', 'bandana'].find((id) => Outfit.owned.has(id));
        if (!pick) { game._flash('Você não tem máscara — balaclava e bandana na boutique ou na boca de fumo'); return null; }
        const r = Outfit.wear(pick);
        if (r.ok) game._flash(`🥷 ${Outfit.ITEMS[pick].name}: rosto coberto${Interiors.active ? '' : ' — na rua a polícia estranha (K tira)'}`);
        return r;
    },

    // ---------------------------------------------------------------- por quadro
    update(dt, game) {
        this.game = game;
        for (let i = this.pend.length - 1; i >= 0; i--) {
            const c = this.pend[i];
            c.t -= dt;
            if (c.t > 0) continue;
            this.pend.splice(i, 1);
            if (game.policeManager) game.policeManager.alertNear({ x: c.x, z: c.z }, c.r);
            this.startSearch(c.x, c.z);
            game._flash(`📞 ${c.why}: viaturas vasculhando o bairro (círculo amarelo no radar)`);
        }
        if (this.search) { this.search.t -= dt; if (this.search.t <= 0) { this.search = null; game._flash('A busca no bairro acabou'); } }
        this._t = (this._t || 0) - dt;
        if (this._t > 0) return;
        this._t = 0.25;
        this._watchOutfit(game);
        const pm = game.policeManager;
        if (Interiors.active && this._el) this._el.style.display = 'none';
        if (!pm || Interiors.active || game.wanted.level > 0 || game.arrest || game.death || (game.hiding && !game.hiding.seen)) { this._hud(game); return; }
        const pos = game._playerState().pos, inSearch = this.search && hypot(pos.x - this.search.x, pos.z - this.search.z) < this.search.r;
        const desc = this.matches(), masked = game.mode === 'player' && this.masked();
        if (!masked) this._maskWarned = false;
        if (desc || masked) {
            let best = Infinity;
            for (const u of pm.units) if (u.mind && u.mind.sees) best = Math.min(best, hypot(u.position.x - pos.x, u.position.z - pos.z));
            const why = desc && best < (inSearch ? 22 : 13) ? 'Te reconheceram pela descrição! (troque de roupa)'
                : masked && best < 10 ? 'Mascarado na rua: a polícia veio te abordar!' : null;
            if (why) {
                if (masked && !desc && !this._maskWarned) { this._maskWarned = true; game._flash('😷 Um policial está olhando o mascarado… tire a máscara (K)!'); }
                else { this._maskWarned = false; game.wanted.ensureLevel(1); pm.alertNear(pos, 60); game._flash('🚔 ' + why); }
            }
        }
        this._hud(game);
    },

    _watchOutfit(game) {
        if (!this.desc) return;
        const k = JSON.stringify(this.sig());
        if (this._sigK === undefined) this._sigK = k;
        if (k === this._sigK) return;
        this._sigK = k;
        const pm = game.policeManager, pos = game._playerState().pos;
        const watched = pm && pm.units.some((u) => u.mind && u.mind.sees && hypot(u.position.x - pos.x, u.position.z - pos.z) < 30);
        if (watched) { Object.assign(this.desc, this.sig()); game._flash('👀 Um policial te viu trocar de roupa — a descrição agora é a roupa nova'); }
        else if (!this.matches()) game._flash('👕 Roupa trocada: a descrição da polícia não bate mais com você');
    },

    onNewDay() {
        if (this.desc && this.desc.until <= this.now()) this.desc = null;
    },

    // Arrested: the description no longer matters (they already have the player).
    onBusted() { this.desc = null; this.search = null; this.pend = []; },

    // ---------------------------------------------------------------- HUD (chips no canto)
    _hud(game) {
        let el = this._el;
        if (!el) {
            el = this._el = document.createElement('div');
            el.id = 'traceChips';
            el.style.cssText = 'position:fixed;right:16px;top:var(--tr-top,206px);z-index:10;display:flex;flex-direction:column;align-items:flex-end;gap:4px;pointer-events:none;font:600 12px var(--font);color:var(--tx)';
            document.body.appendChild(el);
        }
        const chips = [], chip = (t, c) => `<div style="padding:4px 10px;border-radius:99px;background:rgba(14,17,26,0.82);border:1px solid ${c};white-space:nowrap">${t}</div>`;
        if (this.masked() && !Interiors.active) chips.push(chip(`${this.fullMask() ? '🥷' : '😷'} mascarado — K tira`, 'rgba(251,191,36,0.6)'));
        if (typeof Witnesses !== 'undefined' && Witnesses.pending()) chips.push(chip(Witnesses.hudChip(), 'rgba(251,191,36,0.8)'));
        if (this.search && game.wanted.level === 0) chips.push(chip(`🔎 busca no bairro ${Math.ceil(this.search.t)}s`, 'rgba(251,191,36,0.6)'));
        if (this.desc) chips.push(chip(this.matches() ? '👕 sua roupa está na descrição' : '👕 descrição (roupa trocada ✔)', this.matches() ? 'rgba(244,63,94,0.6)' : 'rgba(52,211,153,0.5)'));
        const status = game.heat && game.heat.statusChip();
        if (status) chips.push(chip(status.text, status.color));
        const html = chips.join(''), h2 = document.getElementById('hud2');
        if (h2 && html && !document.body.classList.contains('mobile')) { const b = h2.getBoundingClientRect().bottom; if (b > 0) el.style.top = Math.round(b + 8) + 'px'; }      // (celular: MobileUI põe abaixo dos atalhos)
        if (html !== this._html) { this._html = html; el.innerHTML = html; }
        el.style.display = html && !game.menu.isOpen && !Interiors.active ? 'flex' : 'none';
    },

    serialize() { return { desc: this.desc, mask: this.lastMask, stats: this.stats }; },
    load(s) {
        this.desc = null; this.search = null; this.pend = []; this.stats = { scenes: 0, clean: 0 };
        if (!s) return;
        this.desc = s.desc || null; this.lastMask = s.mask || 'balaclava';
        this.stats = Object.assign({ scenes: 0, clean: 0 }, s.stats || {});
        this._sigK = undefined;
    },
};
Economy.onDay(() => Traces.onNewDay());
