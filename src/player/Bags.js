// ============================================================================
// Bags — bolsa que o jogador usa, PESO do que ele carrega e FÔLEGO (estamina).
//   • Bolsa: define a grade da mochila (células) e a carga confortável (kg). Sem bolsa = só os bolsos. Mala transversal, mochila e
//     mochila tática se compram (conveniência / loja de armas / boca) e APARECEM no sprite do personagem (folha própria do rig).
//   • Peso: armas, munição, kits, comida, joias, dinheiro vivo (cédulas: R$ 50 ≈ 1 g), mercadoria do ladrão e cédulas marcadas de
//     banco. Até metade da carga: normal; até a carga cheia: cada vez mais lento; acima dela: sobrecarga (bem lento e sem correr).
//   • Fôlego: correr gasta (mais com peso); parado ou andando recupera. Zerou = sem fôlego até recuperar 35%. EVOLUI com o uso:
//     correr treina o condicionamento (mais fôlego máximo e recuperação mais rápida).
// ============================================================================

const Bags = {
    DEFS: {
        none:     { name: 'Bolsos', cols: 3, rows: 2, kg: 8, emo: '👖', look: null },
        cross:    { name: 'Mala transversal', cols: 4, rows: 3, kg: 14, emo: '👜', look: 'cross' },
        pack:     { name: 'Mochila', cols: 5, rows: 4, kg: 24, emo: '🎒', look: 'pack' },
        tactical: { name: 'Mochila tática', cols: 6, rows: 5, kg: 38, emo: '🎒', look: 'tactical' },
    },
    // kg por unidade
    W: { pistol: 1.0, revolver: 1.2, smg: 2.8, shotgun: 3.4, rifle: 4.0, ak47: 4.3, bat: 0.9, knife: 0.3 },
    AMMO: { pistol: 0.012, revolver: 0.014, smg: 0.01, shotgun: 0.045, rifle: 0.017, ak47: 0.017 },
    ITEM: { medkits: 0.6, hacks: 0.25, keys: 0.05, food: 0.5, water: 0.6, jewels: 0.12 },

    // Clipes do jogador assados em segundo plano (a folha base e a de cada bolsa).
    PLAYER_CLIPS: [
        ['punch'], ['punchL'], ['kick'], ['carjack'], ['vault'], ['swim'], ['opendoor'], ['enter'], ['pick'], ['surrender'], ['kneel'], ['rummage'], ['pickpocket'],
        ...['pistol', 'smg', 'shotgun', 'bat'].flatMap((w) => [['idle', w], ['walk', w], ['run', w]]),
        ...['pistol', 'smg', 'shotgun'].flatMap((w) => [['draw', w], ['aim', w], ['shoot', w]]),
        ['swing', 'bat'], ['hurt'], ['dead'], ['flail'], ['lie'], ['getup'], ['tumble'],
    ],

    def(inv) { return this.DEFS[(inv && inv.bag) || 'none'] || this.DEFS.none; },

    // Peso total carregado (kg).
    weight(game) {
        const inv = game.inventory; let w = 0;
        for (const [k, s] of Object.entries(inv.weapons)) {
            if (k === 'fists' || !s.owned) continue;
            w += this.W[k] || 0;
            w += ((s.reserve || 0) + (s.mag || 0)) * (this.AMMO[k] || 0);
        }
        for (const [k, kg] of Object.entries(this.ITEM)) w += (inv[k] || 0) * kg;
        w += Math.max(0, inv.cash) / 50000;                                         // cédulas de R$ 50: 1 g cada
        const B = game.careers && game.careers.by && game.careers.by.burglar;
        if (B && B.data) w += B.data.weight || 0;                                   // eletrônicos furtados
        if (typeof Banks !== 'undefined') w += Banks.hotKg || 0;                    // cédulas marcadas
        return w;
    },

    // Multiplicador de velocidade pela carga (1 = normal).
    speedMul(r) {
        if (r <= 0.5) return 1;
        if (r <= 1) return 1 - 0.3 * (r - 0.5) / 0.5;
        return Math.max(0.35, 0.7 - 0.5 * (r - 1));
    },

    // Por quadro: peso, carga e fôlego.
    update(game, dt) {
        const pl = game.player, inv = game.inventory, D = this.def(inv);
        this._t = (this._t || 0) - dt;
        if (this._t <= 0) { this._t = 0.25; this.kg = this.weight(game); }
        this.cap = D.kg; this.ratio = (this.kg || 0) / D.kg;
        pl.loadMul = this.speedMul(this.ratio);
        pl.overloaded = this.ratio > 1;
        this._sheetSwap(game);
    },

    // --------------------------------------------------------------- fôlego (chamado pelo Player.update)
    // Devolve se o jogador PODE correr agora (e gasta/recupera o fôlego).
    stamina(pl, wantSprint, moving, dt) {
        const F = pl.fit || (pl.fit = { xp: 0 });
        const lvl = this.fitLevel(F), max = 100 + lvl * 6, r = this.ratio || 0;
        if (pl.stamina == null) pl.stamina = max;
        pl.staminaMax = max;
        const can = wantSprint && moving && !pl.winded && !pl.overloaded && pl.stamina > 0;
        if (can) {
            pl.stamina -= 15 * (1 + 0.8 * Math.min(1, r)) * (1 - Math.min(0.35, lvl * 0.012)) * dt;
            pl._rest = 0;
            F.xp += dt * (1 + r);                                                   // treino: correr (com peso, treina mais)
            if (pl.stamina <= 0) { pl.stamina = 0; pl.winded = true; }
        } else {
            pl._rest = (pl._rest || 0) + dt;
            if (pl._rest > 0.6) pl.stamina = Math.min(max, pl.stamina + (moving ? 13 : 22) * (1 + lvl * 0.03) * dt);
            if (pl.winded && pl.stamina >= max * 0.35) pl.winded = false;
        }
        return can;
    },
    fitLevel(F) { return Math.min(20, Math.floor(Math.sqrt((F && F.xp || 0) / 25))); },     // 0..20 (nível 20 ≈ 2,8 h correndo)

    // --------------------------------------------------------------- bolsas
    // Troca de bolsa (compra). Recusa se o que se carrega não cabe na grade nova.
    equip(game, id) {
        const inv = game.inventory, D = this.DEFS[id];
        if (!D) return { ok: false, msg: '?' };
        if ((inv.bag || 'none') === id) return { ok: false, msg: 'Você já está com essa bolsa' };
        const used = inv.slotsUsed();
        if (used > D.cols * D.rows) return { ok: false, msg: `Não cabe o que você carrega (${used} espaços; ela tem ${D.cols * D.rows})` };
        inv.bag = id;
        this._want = id;
        return { ok: true, msg: `${D.emo} ${D.name}: ${D.cols * D.rows} espaços, carga confortável ${D.kg} kg` };
    },

    // Folha do jogador com a bolsa desenhada (criada sob demanda). Troca o sprite só quando andar/parado/correr já estão assados.
    sheetFor(lib, id) {
        const look = this.DEFS[id] && this.DEFS[id].look;
        if (!look) return lib.sheets.player;
        const key = 'player_' + id;
        if (!lib.sheets[key]) {
            const base = lib.sheets.player;
            lib.sheets[key] = new CharacterSheet(lib.scene, lib.palette, { name: key, dirs: base.dirs, frame: base.frame, look: Object.assign({}, base.look, { bag: look }) });
        }
        return lib.sheets[key];
    },
    _sheetSwap(game) {
        const pl = game.player, id = (game.inventory.bag || 'none');
        if (this._shown === id || pl._baseSheet) return;                            // (montando na moto: troca depois)
        // Atlas vetorial: a bolsa é uma CAMADA por cima do jogador (só os pixels que ela muda), não uma cópia de todas as animações.
        if (CharArt.available() && CharArt.data.sheets.player.bags) {
            const look = this.DEFS[id] && this.DEFS[id].look;
            pl.actor.setOverlay(look || null);
            this._shown = id;
            return;
        }
        const lib = pl.lib, sheet = this.sheetFor(lib, id), w = pl.actor.clip ? pl.actor.clip.weapon : 'none';
        const need = [['idle', 'none'], ['walk', 'none'], ['run', 'none']].concat(w && w !== 'none' ? [['idle', w], ['walk', w], ['run', w]] : []);
        if (this._queued !== id) { sheet.queue(need); if (sheet !== lib.sheets.player) sheet.queue(this.PLAYER_CLIPS); this._queued = id; }
        const ready = need.every(([n, wp]) => { const r = sheet._resolve(n, wp); return !r || sheet.clips[r.key]; });
        if (!ready && id !== 'none') return;
        const old = pl.actor.sheet;
        const clipName = pl.actor.clipName || 'idle', weapon = pl.actor.clip ? pl.actor.clip.weapon : 'none';
        pl.actor.useSheet(sheet);
        pl.actor.play(clipName, weapon, { restart: true }) || pl.actor.play('idle', 'none', { restart: true });
        this._shown = id;
        // a folha antiga (de outra bolsa) libera as texturas
        if (old && old !== sheet && old !== lib.sheets.player && old.name && old.name.startsWith('player_')) { old.disposeClips(); delete lib.sheets[old.name]; }
    },

    // Rótulo curto para a interface.
    label(game) {
        const D = this.def(game.inventory), kg = this.kg || 0;
        return `${D.emo} ${D.name} · ${kg.toFixed(1)}/${D.kg} kg`;
    },
};
