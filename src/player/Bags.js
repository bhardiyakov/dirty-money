// ============================================================================
// Bags — bolsa que o jogador usa, PESO do que ele carrega e FÔLEGO (estamina).
//   • Bolsa: define a grade da mochila (células) e a carga confortável (kg). Sem bolsa = só os bolsos. Mala transversal, mochila e
//     mochila tática se compram (conveniência / loja de armas / boca) e APARECEM no sprite do personagem (folha própria do rig).
//   • Peso: armas, munição, kits, comida, joias, dinheiro vivo (cédulas: R$ 50 ≈ 1 g), mercadoria do ladrão e cédulas marcadas de
//     banco. As armas NO CORPO (até 3 — Inventory.body: coldre, cinto, bandoleira) pesam metade (bem distribuídas). Até 70% da
//     carga: normal; até a carga cheia: um pouco mais lento; acima dela: cada vez mais lento; acima de 125%, sobrecarga (sem correr).
//   • Fôlego: correr gasta (mais com peso); parado ou andando recupera. Zerou = sem fôlego até recuperar 35%. EVOLUI com o uso:
//     correr treina o condicionamento (mais fôlego máximo e recuperação mais rápida).
//   • Força: andar com peso nas costas e brigar treina a força de carregar (nível 0..20, `str`), que entra na FORÇA do físico
//     (Physique.strength: massa muscular da academia + esse nível − fraqueza de quem está magro). Quanto mais forte, mais peso sem
//     pesar (somado à roupa — calça cargo, colete de carga — e à habilidade Costas largas). O físico também mexe no fôlego e no pique.
// ============================================================================

const Bags = {
    // look: desenho nas costas (camada sobre todos os clipes) | hand: levada NA MÃO (clipes *_hold / *_pull: o jogador anda pendendo
    // para o lado, o braço da bolsa quase parado) — bolsa de lona e mala são as que dão conta de um cofre de banco inteiro.
    // wheels: mala de rodinhas — andando, as rodinhas carregam boa parte do peso (correndo, ela vai levantada).
    DEFS: {
    // self: peso da bolsa VAZIA (kg) — só conta nas bolsas de reserva que o jogador leva sem usar (inv.spareBags).
    // icon: chave do emoji (Theme/Emoji) | base: preço de catálogo (raridade no menu de equipamento)
        none:      { name: 'Bolsos', cols: 3, rows: 2, kg: 12, emo: '👖', look: null, self: 0, icon: 'pockets', base: 0 },
        cross:     { name: 'Mala transversal', cols: 4, rows: 3, kg: 18, emo: '👜', look: 'cross', self: 0.5, icon: 'bag_cross', base: 120 },
        pack:      { name: 'Mochila', cols: 5, rows: 4, kg: 30, emo: '🎒', look: 'pack', self: 0.9, icon: 'bag_pack', base: 350 },
        tactical:  { name: 'Mochila tática', cols: 6, rows: 5, kg: 46, emo: '🎒', look: 'tactical', self: 1.6, icon: 'bag_tactical', base: 2200 },
        briefcase: { name: 'Maleta de alumínio', cols: 4, rows: 2, kg: 16, emo: '💼', look: null, hand: 'briefcase', self: 1.4, icon: 'bag_brief', base: 650 },
        duffel:    { name: 'Bolsa de lona', cols: 7, rows: 5, kg: 60, emo: '👝', look: null, hand: 'duffel', self: 1.1, icon: 'bag_duffel', base: 380 },
        suitcase:  { name: 'Mala de rodinhas', cols: 6, rows: 6, kg: 54, emo: '🧳', look: null, hand: 'suitcase', wheels: true, self: 3.2, icon: 'bag_suit', base: 900 },
    },
    HARD: 2.0,             // acima de 200% da carga confortável não dá para levar mais nada (e quase não se anda)
    OVER: 1.25,            // acima de 125%: sobrecarga — não corre
    BODY_KG: 0.5,          // fração do peso de uma arma que está NO CORPO (coldre, cinto, bandoleira)
    // kg por unidade
    W: { pistol: 1.0, pistol_sil: 1.2, revolver: 1.2, smg: 2.8, shotgun: 3.4, rifle: 4.0, ak47: 4.3, bat: 0.9, knife: 0.3, grenade: 0.4, molotov: 0.75, rpg: 6.5, launcher: 9.0, minigun: 14.0 },     // (arremessáveis: por unidade)
    AMMO: { pistol: 0.012, pistol_sil: 0.012, revolver: 0.014, smg: 0.01, shotgun: 0.045, rifle: 0.017, ak47: 0.017, rpg: 1.8, launcher: 1.5, minigun: 0.02 },
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
        const inv = game.inventory, body = inv.body ? inv.body() : []; let w = 0;
        for (const [k, s] of Object.entries(inv.weapons)) {
            if (Weapons[k] && Weapons[k].throwable) { w += (s.reserve || 0) * (this.W[k] || 0); continue; }
            if (k === 'fists' || !s.owned) continue;
            w += (this.W[k] || 0) * (body.includes(k) ? this.BODY_KG : 1);
            w += ((s.reserve || 0) + (s.mag || 0)) * (this.AMMO[k] || 0);
        }
        for (const [k, kg] of Object.entries(this.ITEM)) w += (inv[k] || 0) * kg;
        if (typeof Items !== 'undefined') w += Items.weight(inv);                  // peças, ferramentas e equipamento (player/Items.js)
        if (typeof Heists !== 'undefined') w += Heists.carryKg || 0;                // o malote do golpe (joias da equipe)
        w += Math.max(0, inv.cash) / 50000;                                         // cédulas de R$ 50: 1 g cada
        const B = game.careers && game.careers.by && game.careers.by.burglar;
        if (B && B.data) w += B.data.weight || 0;                                   // eletrônicos furtados
        if (typeof Banks !== 'undefined') w += Banks.hotKg || 0;                    // cédulas marcadas
        for (const id of inv.spareBags || []) w += (this.DEFS[id] && this.DEFS[id].self) || 0;      // bolsas de reserva (vazias)
        return w;
    },

    // Multiplicador de velocidade pela carga (1 = normal).
    speedMul(r) {
        if (r <= 0.7) return 1;
        if (r <= 1) return 1 - 0.12 * (r - 0.7) / 0.3;
        return Math.max(0.45, 0.88 - 0.4 * (r - 1));
    },

    // Por quadro: peso, carga e fôlego.
    update(game, dt) {
        const pl = game.player, inv = game.inventory, D = this.def(inv);
        this._g = game;
        this._t = (this._t || 0) - dt;
        if (this._t <= 0) { this._t = 0.25; this.kg = this.weight(game); }
        const cap = D.kg * this.carryMul(pl);                                      // (força, roupa: calça cargo, colete de carga…)
        this.cap = cap; this.ratio = (this.kg || 0) / cap;
        // mala de rodinhas: andando, as rodinhas levam ~45% do peso (correndo ela vai levantada: peso cheio)
        const r = D.wheels && pl.state !== 'sprint' ? this.ratio * 0.55 : this.ratio;
        // treino de força: andar carregando peso (de verdade: acima de 25% da carga) — correndo com peso treina mais
        if (r > 0.25 && pl.speed > 1 && game.mode === 'player') this.train(pl, dt * Math.min(1.75, r) * (pl.state === 'sprint' ? 1.5 : 1));
        pl.loadMul = this.speedMul(r);
        pl.overloaded = r > this.OVER;
        pl.loadRatio = r;
        pl.handBag = D.hand || null;
        this._sheetSwap(game);
    },

    // --------------------------------------------------------------- força
    strLevel(S) { return Math.min(20, Math.floor(Math.sqrt((S && S.xp || 0) / 20))); },      // 0..20 (nível 20 ≈ 2,2 h carregando peso)
    // Multiplicador da carga confortável: força (+4%/nível) + roupa + habilidade (Costas largas).
    carryMul(pl, O) {
        O = O || (typeof Outfit !== 'undefined' ? Outfit.m : {});
        const T = typeof SkillTree !== 'undefined' ? SkillTree.m : {};
        return 1 + (typeof Physique !== 'undefined' ? Physique.carryBonus(pl) : this.strLevel(pl && pl.str) * 0.04) + (O.carry || 0) + (T.carry || 0);
    },
    // Treino de força (xp ≈ segundos carregando peso; golpes corpo a corpo também contam). Avisa quando sobe de nível.
    train(pl, xp) {
        const S = pl.str || (pl.str = { xp: 0 }), L0 = this.strLevel(S);
        S.xp += xp;
        const L = this.strLevel(S);
        if (L > L0 && this._g) this._g._flash(`💪 Força de carregar ${L}/20 — FORÇA ${Math.round(Physique.strength(pl))}/100`);
    },

    // Quanto ainda cabe (kg) antes do limite máximo (HARD × carga confortável).
    room(game) { return Math.max(0, (this.cap || this.def(game.inventory).kg) * this.HARD - this.weight(game)); },

    // Clipe de locomoção com a bolsa da mão / o peso: [clipe, arma] ou null (fica o normal). clip = 'idle'|'aim'|'walk'|'run'.
    // Bolsa na mão: só dá para usar a pistola (a outra mão está ocupada); com arma de duas mãos a bolsa vai "pendurada" (sem desenho).
    // Carga pesada sem bolsa na mão: o fardo nas costas, curvado segurando as alças — parado, andando E correndo (não some na corrida).
    clipFor(pl, clip, w) {
        const H = pl.handBag;
        if (H && (w === 'none' || w === 'pistol')) {
            if (clip === 'idle' || clip === 'aim') return [H === 'suitcase' && w === 'none' ? 'idle_pull' : 'idle_hold', w];
            if (clip === 'walk') return [H === 'suitcase' && w === 'none' ? 'walk_pull' : 'walk_hold', w];
            if (clip === 'run') return ['run_hold', w];
        }
        if (!H && w === 'none' && (pl.loadRatio || 0) > 1) {
            if (clip === 'walk') return ['walk_heavy', 'none'];
            if (clip === 'run') return ['run_heavy', 'none'];
            if (clip === 'idle') return ['idle_heavy', 'none'];
        }
        return null;
    },

    // --------------------------------------------------------------- fôlego (chamado pelo Player.update)
    // Devolve se o jogador PODE correr agora (e gasta/recupera o fôlego).
    stamina(pl, wantSprint, moving, dt) {
        const F = pl.fit || (pl.fit = { xp: 0 });
        const O = typeof Outfit !== 'undefined' ? Outfit.m : {};          // roupa: tênis de corrida, roupa de academia (ver Outfit)
        const lvl = this.fitLevel(F), max = this.staminaMax(lvl, O), r = pl.loadRatio != null ? pl.loadRatio : (this.ratio || 0);
        if (pl.stamina == null) pl.stamina = max;
        pl.staminaMax = max;
        const can = wantSprint && moving && !pl.winded && !pl.overloaded && pl.stamina > 0;
        if (can) {
            pl.stamina -= Config.player.staminaDrain * (1 + 0.5 * Math.max(0, Math.min(1.5, r) - 0.3)) * (1 - Math.min(0.3, lvl * 0.015)) * (1 - (O.stamina || 0)) * (typeof Physique !== 'undefined' ? Physique.staminaDrainMul() : 1) * dt;      // (gordo cansa mais)
            pl._rest = 0;
            F.xp += dt * (1 + r);                                                   // treino: correr (com peso, treina mais)
            if (pl.stamina <= 0) { pl.stamina = 0; pl.winded = true; }
        } else {
            pl._rest = (pl._rest || 0) + dt;
            // recupera proporcional ao máximo: cheio em ~12 s andando / ~7 s parado (no nível 0)
            if (pl._rest > 0.6) pl.stamina = Math.min(max, pl.stamina + max * (moving ? 0.08 : 0.14) * (1 + lvl * 0.03 + (O.regen || 0)) * dt);
            if (pl.winded && pl.stamina >= max * 0.35) pl.winded = false;
        }
        return can;
    },
    fitLevel(F) { return Math.min(20, Math.floor(Math.sqrt((F && F.xp || 0) / 25))); },     // 0..20 (nível 20 ≈ 2,8 h correndo)
    staminaMax(lvl, O) { const P = Config.player; return Math.round((P.staminaBase + lvl * P.staminaPerLvl + ((O && O.staminaMax) || 0)) * (typeof Physique !== 'undefined' ? Physique.staminaMaxMul() : 1)); },

    // Velocidade correndo (m/s): o pique cresce com o condicionamento (24 → 27 km/h) e cai com o fôlego até ~10 km/h — começa bem
    // e vai perdendo o pace aos poucos (raiz: segura perto do pique com o fôlego cheio e despenca no fim). Tênis/árvore somam ao
    // pique, sem passar do máximo (Config.player.sprintSpeed).
    runSpeed(pl) {
        const P = Config.player, lvl = this.fitLevel(pl.fit), O = typeof Outfit !== 'undefined' ? Outfit.m : {};
        const S = typeof SkillTree !== 'undefined' ? SkillTree.m : {};
        const top = Math.min(P.sprintSpeed, P.sprintSpeed * (P.sprintStart + (1 - P.sprintStart) * lvl / 20) * (1 + (S.sprint || 0) + (O.sprint || 0))) * (typeof Physique !== 'undefined' ? Physique.speedMul() : 1);
        const lo = P.sprintSpeed * P.sprintMin, f = Math.max(0, Math.min(1, (pl.stamina == null ? 1 : pl.stamina / (pl.staminaMax || 100))));
        return lo + (top - lo) * Math.sqrt(f);
    },

    // --------------------------------------------------------------- bolsas
    // O jogador USA uma bolsa (inv.bag) e pode levar outras de RESERVA, vazias (inv.spareBags: pesam o próprio peso). As de reserva
    // trocam-se no menu (Inventário → Equipamento), guardam-se no baú de casa (Stash 'bag:<id>') ou vão para o lixo.
    has(inv, id) { return id !== 'none' && ((inv.bag || 'none') === id || (inv.spareBags || []).includes(id)); },

    // Passa a usar a bolsa `id` (uma de reserva, ou 'none' = só os bolsos). A que estava em uso vira reserva.
    // Recusa se o que se carrega não cabe na grade nova.
    equip(game, id) {
        const inv = game.inventory, D = this.DEFS[id], cur = inv.bag || 'none';
        if (!D) return { ok: false, msg: '?' };
        if (cur === id) return { ok: false, msg: id === 'none' ? 'Você já está sem bolsa' : 'Você já está com essa bolsa' };
        if (id !== 'none' && !(inv.spareBags || []).includes(id)) return { ok: false, msg: 'Você não tem essa bolsa' };
        const used = inv.slotsUsed();
        if (used > D.cols * D.rows) return { ok: false, msg: `Não cabe o que você carrega (${used} espaços; ${id === 'none' ? 'os bolsos têm' : 'ela tem'} ${D.cols * D.rows})` };
        inv.spareBags = (inv.spareBags || []).filter((b) => b !== id);
        if (cur !== 'none') inv.spareBags.push(cur);
        inv.bag = id;
        this._want = id;
        this.kg = this.weight(game);
        return { ok: true, msg: id === 'none' ? 'Tirou a bolsa: só os bolsos (3×2)' : `${D.emo} ${D.name}: ${D.cols * D.rows} espaços, carga confortável ${D.kg} kg` };
    },

    // Bolsa nova (compra / tirada do baú): entra como reserva e já passa a ser usada se couber (senão fica de reserva).
    acquire(game, id) {
        const inv = game.inventory;
        inv.spareBags = inv.spareBags || [];
        if (!inv.spareBags.includes(id) && inv.bag !== id) inv.spareBags.push(id);
        const r = this.equip(game, id);
        return r.ok ? r : { ok: true, msg: `${this.DEFS[id].name}: ficou de reserva (${r.msg})` };
    },

    // Larga a bolsa (descartar ou guardar no baú). A que está em uso só sai se o que se carrega couber nos bolsos.
    remove(game, id) {
        const inv = game.inventory;
        if ((inv.bag || 'none') === id) { const r = this.equip(game, 'none'); if (!r.ok) return { ok: false, msg: 'Esvazie a bolsa antes — ' + r.msg }; }
        if (!(inv.spareBags || []).includes(id)) return { ok: false, msg: 'Você não tem essa bolsa' };
        inv.spareBags = inv.spareBags.filter((b) => b !== id);
        this.kg = this.weight(game);
        return { ok: true, msg: '' };
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
        // Personagem 2,5D: a bolsa faz parte do desenho do jogador (PlayerLook gera o visual com ela).
        if (pl.actor.sheet && pl.actor.sheet.isNpc && typeof PlayerLook !== 'undefined') { this._shown = id; PlayerLook.sync(); return; }
        // Atlas vetorial: a bolsa é uma CAMADA por cima do jogador (só os pixels que ela muda), não uma cópia de todas as animações.
        if (CharArt.available() && CharArt.data.sheets.player.bags) {
            const D = this.DEFS[id], look = D && (D.look || D.hand);      // (bolsa da mão: camada só nos clipes de carregar)
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
        return `${D.emo} ${D.name} · ${kg.toFixed(1)}/${Math.round(this.cap || D.kg)} kg`;
    },
};
