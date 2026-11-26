// ============================================================================
// StoreBurglary — ROUBO FURTIVO DE LOJA: entrar na loja FECHADA, sem ninguém dentro, sem refém, sem tiro.
//
//   ENERGIA     cada quarteirão com comércio tem uma CAIXA DE FORÇA na fachada (ao lado da primeira loja): E sabota (3 s, faíscas). Derrubar
//               um POSTE com o carro também apaga os quarteirões em volta. Sem energia (4–7 h de jogo, até a companhia religar): as
//               vitrines e os postes do quarteirão apagam, as lojas FECHAM (até as abertas: "sem luz"), as câmeras da fachada e de dentro
//               param e o alarme não arma. (Power, abaixo — police/CrimeExposure.js e Interiors.check perguntam a ele.)
//   ARROMBAR    na porta de uma loja fechada: E abre o mini-game de fechadura (ui/Lockpick.js; o kit de GAZUAS e a skill Eletrônica
//               facilitam). Errou demais: a porta vai no tranco — BARULHO na rua e marca de arrombamento.
//   LÁ DENTRO   escuro (só a lanterna do celular; com energia, a luz de vigia). Pontos marcados no chão: CAIXA (o troco que fica),
//               COFRE (o apurado do dia dorme nele — furadeira corta o tempo), PRATELEIRAS (mercadoria para o receptador; na LOJA DE ARMAS
//               saem armas e munição), VITRINES da joalheria, o GRAVADOR das câmeras (HD) e, com energia, a CENTRAL DO ALARME ao lado da
//               porta (o sensor dá uns segundos — a Eletrônica dá mais — antes de disparar).
//               BARULHO: correr, quebrar vidro e furar o cofre fazem barulho; cheio, quem estiver na rua ouve e liga.
//   PISTAS      sem LUVAS, cada coisa tocada deixa DIGITAIS (dá para limpar na saída, perto da porta); câmeras gravando (energia ligada e HD
//               no lugar); alguém vendo você entrar ou sair; o alarme; o barulho. A polícia só investiga quando DESCOBREM o arrombamento —
//               na hora (alarme, vizinho ligou) ou quando a loja abre. A PERÍCIA chega 2 h depois: digitais → seu nome na ficha (inquérito);
//               vídeo → a ficha (de rosto coberto, não) e a descrição da roupa; nada → CASO ARQUIVADO.
// ============================================================================

const Power = {
    out: {},                 // id do quarteirão → { until (hora absoluta: Traces.now()), why, prints (digitais na caixa) }
    boxes: null,             // caixas de força: { bid, x, z, fx, fz (frente, para fora), lx, lz (eixo da fachada), shop }
    stats: { cuts: 0, poles: 0, restored: 0 },
    HOURS: [4, 7],

    blockOf(shop) { return shop && shop.id ? String(shop.id).split('|')[0] : null; },
    isOutBlock(bid) { const o = bid && this.out[bid]; return !!o && o.until > Traces.now(); },
    forShop(shop) { return !!shop && !shop.safehouse && !shop.home && this.isOutBlock(this.blockOf(shop)); },
    isOut(x, z) { const b = CityGrid._blockAtPoint(x, z); return !!b && this.isOutBlock(b.id); },
    untilLabel(bid) { const o = this.out[bid]; if (!o) return ''; const h = Math.floor(o.until % 24), m = Math.floor((o.until % 1) * 60); return `${h}h${m ? String(m).padStart(2, '0') : ''}`; },

    // Uma caixa por quarteirão com loja: na fachada, ao lado da primeira porta (do lado sem outra porta perto).
    _build() {
        if (this.boxes) return this.boxes;
        Interiors.index();
        const by = new Map();
        for (const s of Interiors._doors || []) { const b = this.blockOf(s); if (b && !by.has(b) && s.ex != null) by.set(b, s); }
        if (typeof Residences !== 'undefined') for (const r of Residences.build()) if (!by.has(r.block)) by.set(r.block, r);      // (quarteirão só de casas: a caixa ao lado da primeira porta)
        const all = Interiors._doors || [], out = [];
        for (const [bid, s] of by) {
            const fx = Math.sin(s.face), fz = Math.cos(s.face), lx = Math.cos(s.face), lz = -Math.sin(s.face);
            let side = 2.5;
            const clash = (k) => all.some((d) => d !== s && hypot(d.ex - (s.ex + lx * k), d.ez - (s.ez + lz * k)) < 1.9);
            if (clash(side)) side = -side;
            if (clash(side)) side = 4.2;
            out.push({ bid, x: s.ex + lx * side + fx * 0.14, z: s.ez + lz * side + fz * 0.14, fx, fz, lx, lz, shop: s });
        }
        this.boxes = out;
        return out;
    },
    boxNear(x, z, r = 1.6) {
        let best = null, bd = r;
        for (const b of this._build()) { const d = hypot(b.x + b.fx * 0.55 - x, b.z + b.fz * 0.55 - z); if (d < bd) { bd = d; best = b; } }
        return best;
    },

    // A malha das caixas (uma só, com todas): corpo cinza, a porta com a fresta, a placa amarela de perigo; a sabotada fica aberta e preta.
    _mesh(game) {
        const W = game && game.gameEngine && game.gameEngine.world; if (!W || !W.mats || typeof MeshBatch === 'undefined') return;
        if (this._m) { this._m.dispose(); this._m = null; }
        const fb = new MeshBatch(), gray = [0.5, 0.53, 0.56], dark = [0.3, 0.32, 0.35], yel = [0.95, 0.78, 0.12], blk = [0.06, 0.06, 0.07], red = [0.85, 0.2, 0.1];
        for (const b of this._build()) {
            const cut = this.isOutBlock(b.bid);
            fb.obox(b.x, b.z, b.lx, b.lz, 0.3, 0.12, 0.75, 1.65, gray);
            fb.obox(b.x + b.fx * 0.125, b.z + b.fz * 0.125, b.lx, b.lz, 0.27, 0.008, 0.8, 1.6, cut ? blk : dark);
            fb.obox(b.x + b.fx * 0.135, b.z + b.fz * 0.135, b.lx, b.lz, 0.07, 0.006, 1.36, 1.5, cut ? red : yel);
            if (cut) fb.obox(b.x + b.fx * 0.36 + b.lx * 0.28, b.z + b.fz * 0.36 + b.lz * 0.28, b.fx, b.fz, 0.24, 0.012, 0.8, 1.6, dark);      // (a porta arrancada, aberta)
        }
        this._m = fb.build('powerBoxes', game.scene, W.mats.bsolid, { vertexColors: true, receiveShadows: true, alwaysActive: false, relief: true });
        this._dirty = false;
    },

    // ---------------------------------------------------------------- cortar / religar
    cutBlock(bid, why, prints = false) {
        if (!bid) return false;
        const now = Traces.now(), cur = this.out[bid], H = this.HOURS;
        const until = now + H[0] + Math.random() * (H[1] - H[0]), was = !!cur;
        this.out[bid] = { until: Math.max(until, cur && cur.until > now ? cur.until : 0), why, prints: !!(prints || (cur && cur.prints && cur.until > now)) };
        this.stats.cuts++;
        if (!was) this._lights(bid, false);                                          // (já estava apagado: só estica o prazo)
        this._dirty = true;
        return true;
    },
    // Poste derrubado: os quarteirões a menos de r m dele apagam.
    cutAt(x, z, r, why) {
        let n = 0;
        for (const b of CityGrid.blocks || []) {
            const s = b.slab; if (!s) continue;
            const dx = Math.max(s[0] - x, 0, x - s[2]), dz = Math.max(s[1] - z, 0, z - s[3]);
            if (dx * dx + dz * dz > r * r) continue;
            if (!this._bids) this._bids = new Set(this._build().map((q) => q.bid));
            if (!this._bids.has(b.id)) continue;                                     // (só quarteirão com caixa de força: comércio ou casas)
            if (this.cutBlock(b.id, why)) n++;
        }
        if (n) this.stats.poles++;
        return n;
    },
    restore(bid) {
        delete this.out[bid];
        this._lights(bid, true);
        this.stats.restored++;
        this._dirty = true;
    },

    // Postes e vitrines do quarteirão: apagam (e voltam) — o halo do poste, a poça da vitrine e a luz de verdade (NightLights).
    _lights(bid, on) {
        const W = window.game && game.gameEngine && game.gameEngine.world; if (!W) return;
        const b = (CityGrid.blocks || []).find((q) => q.id === bid); if (!b || !b.slab) return;
        const s = b.slab, m = 3.5, inside = (x, z) => x > s[0] - m && x < s[2] + m && z > s[1] - m && z < s[3] + m;
        const LG = W.lampGlow;
        for (const l of W.streetLamps || []) {
            if (!inside(l.x, l.z)) continue;
            if (!on) { l.dark = (l.dark || 0) + 1; if (LG && l.glow) LG.off(l.glow[0]); }
            else { l.dark = Math.max(0, (l.dark || 0) - 1); if (!l.dark && l.alive !== false && LG && l.glow) { const t = l.tint || [1.0, 0.8, 0.5]; LG.color(l.glow[0], 0.35 + t[0] * 0.65, 0.35 + t[1] * 0.65, 0.35 + t[2] * 0.65, 0.9); } }
        }
        if (LG) LG.flush();
        const SG = W.shopGlow;
        for (const q of W.shopList || []) {
            if (!inside(q.x, q.z)) continue;
            if (!on) { q.dark = (q.dark || 0) + 1; if (SG) SG.off(q.id); }
            else { q.dark = Math.max(0, (q.dark || 0) - 1); if (!q.dark && SG) SG.color(q.id, q.c[0], q.c[1], q.c[2], 0.42); }
        }
        if (SG) SG.flush();
    },

    update(dt, game) {
        this._t = (this._t || 0) - dt;
        if (this._t > 0) return;
        this._t = 1;
        const now = Traces.now();
        for (const bid of Object.keys(this.out)) if (this.out[bid].until <= now) {
            this.restore(bid);
            const pp = game.player && game.player.position, b = pp && !Interiors.active && CityGrid._blockAtPoint(pp.x, pp.z);
            if (b && b.id === bid) game._flash('💡 A companhia de luz religou o quarteirão');
        }
        if (this._dirty || (!this._m && this._build().length)) this._mesh(game);
    },

    serialize() { return { out: this.out }; },
    load(s) {
        for (const bid of Object.keys(this.out)) this._lights(bid, true);
        this.out = {};
        const now = Traces.now();
        for (const [bid, o] of Object.entries((s && s.out) || {})) if (o && o.until > now) { this.out[bid] = o; this._lights(bid, false); }
        this._dirty = true;
    },
};

const StoreBurglary = {
    session: null,                 // dentro de uma loja arrombada
    box: null,                     // sabotando uma caixa de força: { b, t, dur, at }
    cases: [],                     // arrombamentos à espera de serem descobertos / da perícia
    hit: {},                       // id da loja → dia do arrombamento (cadeado novo por 3 dias)
    stats: { breaks: 0, forced: 0, clean: 0, filed: 0, prints: 0, cams: 0, guns: 0, heard: 0, wiped: 0, alarms: 0 },
    COOLDOWN_DAYS: 3,
    REG_FRAC: 0.22,                // o troco que fica no caixa de noite (fração do caixa do dia — Robbery.REG)
    GUNS: [['pistol', 0.3, 48], ['revolver', 0.2, 36], ['shotgun', 0.17, 24], ['pistol_sil', 0.13, 36], ['smg', 0.12, 90], ['rifle', 0.08, 30]],
    LABEL: { register: 'abrir a gaveta do caixa', safe: 'arrombar o cofre', dvr: 'arrancar o HD do gravador', stock: 'limpar a prateleira', case: 'quebrar a vitrine', alarm: 'desligar a central do alarme', wipe: 'limpar as digitais' },

    tierOf(shop) { if (shop && shop.res) return shop.tier || 1; return shop && !shop.bank && !shop.home && !shop.safehouse && !shop.stadium ? (Robbery.TIER[shop.style] || 0) : 0; },
    gloves() { return typeof Outfit !== 'undefined' && Outfit.worn && Outfit.worn.hands === 'luvas'; },
    burglar(game) { return game.careers && game.careers.by && game.careers.by.burglar; },
    skill(game, k) { const B = this.burglar(game); return B ? B.skill(k) : 0; },

    // ---------------------------------------------------------------- na rua
    // Dá para arrombar esta loja agora? (null = dá; senão, o motivo)
    why(game, shop) {
        if (!this.tierOf(shop)) return 'não tem o que roubar';
        if (game.wanted.level > 0) return 'a polícia está na sua cola';
        if (Robbery.closedToday(shop)) return 'a perícia está lá dentro';
        const d = this.hit[shop.id];
        if (d != null && Economy.day - d < this.COOLDOWN_DAYS) return shop.res ? 'invadida há pouco: trocaram a fechadura e o vizinho está de olho' : 'arrombada há pouco: trocaram a fechadura e puseram cadeado';
        if (shop.res && Residences.who(shop, game) === 'awake') return 'tem gente acordada em casa';
        if (typeof Heists !== 'undefined' && Heists.closed && Heists.closed(shop)) return 'reforçaram a segurança depois do golpe';
        return null;
    },
    closedNow(game, shop) { return Power.forShop(shop) || !Economy.isOpen(shop.style, game.dayNight.hour); },

    // O texto do HUD na rua (a caixa de força) — null deixa o Interiors seguir.
    outPrompt(game) {
        if (game.mode !== 'player' || Interiors.active) return null;
        if (this.box) return `<b>SABOTANDO A CAIXA DE FORÇA</b> ${crBar(this.box.t / this.box.dur)}<small>fique aí — faíscas e barulho</small>`;
        const p = game.player.position, b = Power.boxNear(p.x, p.z);
        if (!b) return null;
        if (Power.isOutBlock(b.bid)) return `<b>CAIXA DE FORÇA</b><small>sabotada — o quarteirão está sem luz até ~${Power.untilLabel(b.bid)}</small>`;
        return `<b>E</b> sabotar a caixa de força<small>apaga o quarteirão por algumas horas: vitrines, alarmes e câmeras das lojas · ${this.gloves() ? '🧤 de luvas' : '🖐 sem luvas: deixa digitais'}</small>`;
    },
    closedPrompt(game, shop, c) {
        const why = this.why(game, shop);
        const head = `<b>FECHADO</b><small>${shop.name} — ${c.msg.replace('FECHADO — ', '')}</small>`;
        if (why || game.player.busy) return head;
        const T = this.tierOf(shop), pw = Power.forShop(shop);
        const risk = pw ? '⚡ sem energia: sem alarme e sem câmera' : '⚠ energia ligada: alarme e câmeras (sabote a caixa de força)';
        return `<b>E</b> arrombar a porta (furtivo)<small>${shop.name} · ${Robbery.TIER_NAME[T]} · ${risk}${Items.has(game.inventory, 'gazua') ? ' · 🗝 gazuas' : ''}${this.gloves() ? '' : ' · 🖐 sem luvas'}</small>`;
    },

    outInteract(game) {
        if (game.mode !== 'player' || Interiors.active || this.box || game.player.busy || game.lockpick.active) return false;
        const p = game.player.position, b = Power.boxNear(p.x, p.z);
        if (!b) return false;
        if (Power.isOutBlock(b.bid)) { game._flash(`A caixa já está sabotada — sem luz até ~${Power.untilLabel(b.bid)}`); return true; }
        const dur = 3.2 * (1 - 0.06 * this.skill(game, 'eletronica'));
        this.box = { b, t: 0, dur, x: p.x, z: p.z, sp: 0 };
        game.player.playAction('pick', { lock: 0 }); if (game.player.action) game.player.action.timer = dur + 0.2;
        AudioFX.blip(420, 0.08, 0.12);
        return true;
    },

    _boxTick(dt, game) {
        const B = this.box; if (!B) return;
        const p = game.player.position;
        if (game.mode !== 'player' || hypot(p.x - B.x, p.z - B.z) > 1.0 || Interiors.active) { this.box = null; if (game.player.action && game.player.action.name === 'pick') game.player.action.timer = 0; game._flash('Sabotagem interrompida'); return; }
        B.t += dt; B.sp -= dt;
        const b = B.b;
        if (B.sp <= 0) { B.sp = 0.35; if (game.combat && game.combat.spark) game.combat.spark(b.x + b.fx * 0.2, 1.2 + Math.random() * 0.3, b.z + b.fz * 0.2, [1, 0.85, 0.4]); }
        if (B.t < B.dur) return;
        this.box = null;
        if (game.player.action && game.player.action.name === 'pick') game.player.action.timer = 0;
        Power.cutBlock(b.bid, 'caixa de força sabotada', !this.gloves());
        for (let k = 0; k < 6; k++) if (game.combat && game.combat.spark) game.combat.spark(b.x + b.fx * 0.2, 1.1 + Math.random() * 0.5, b.z + b.fz * 0.2, [0.8, 0.9, 1]);
        AudioFX.crash(b.x, b.z, 0.35);
        if (game.heat) game.heat.commit('vandalism');                              // (delito leve: só o flagrante da polícia conta)
        const B2 = this.burglar(game); if (B2) B2.addXp(8);
        game._flash(`⚡ Caixa de força sabotada: o quarteirão apagou — lojas sem alarme e sem câmera até ~${Power.untilLabel(b.bid)}${this.gloves() ? '' : ' (você deixou digitais na caixa)'}`);
    },

    // E na porta fechada: o mini-game da fechadura.
    breakIn(game, shop) {
        if (game.lockpick.active || game.player.busy) return true;
        const why = this.why(game, shop);
        if (why) { game._flash(`Não dá para arrombar: ${why}`); return true; }
        const T = this.tierOf(shop), el = this.skill(game, 'eletronica');
        const diff = (0.92 + 0.11 * T + (shop.res && shop.apt && shop.stars >= 3 ? 0.12 : 0)) * (Items.has(game.inventory, 'gazua') ? 0.72 : 1) * (1 - 0.06 * el);
        game.player.playAction('pick', { lock: 0 }); if (game.player.action) game.player.action.timer = 30;
        game.lockpick.start({ difficulty: diff, onEnd: (res) => {
            if (game.player.action && game.player.action.name === 'pick') game.player.action.timer = 0;
            if (res === 'cancel') return;
            this._opened(game, shop, res !== 'ok');
        } });
        return true;
    },

    // A porta abriu (forced: no tranco, depois de errar a fechadura). Quem viu, viu: a fachada, a rua, a polícia.
    _opened(game, shop, forced) {
        const pw = Power.forShop(shop), x = shop.x, z = shop.z;
        const exp = CrimeExposure.evaluate(game);
        const rep = { exp, gloves: this.gloves(), mask: Traces.fullMask() };
        if (forced) {
            this.stats.forced++;
            AudioFX.crash(x, z, 0.5);
            game._flash('💥 A fechadura não cedeu — você forçou a porta no tranco: BARULHO');
            this._heard(game, shop, 'O estrondo na porta acordou a vizinhança');
        }
        if (exp && game.heat) game.heat.commit('burglary', exp);                  // (polícia: estrelas; câmera da fachada: a ficha; testemunha: leva o relato)
        if (game.wanted.level > 0) { game._flash('🚔 Te viram arrombando — fuja!'); return; }
        this.stats.breaks++;
        this._pend = { shop, forced, pw, rep, heard: this._heardNow };
        this._heardNow = null;
        Interiors._burgle = shop;
        Interiors.enter(game, shop);
    },

    // Alguém na rua ouviu (barulho na porta ou lá dentro): vizinho/pedestre perto da loja liga daqui a pouco.
    _heard(game, shop, why) {
        const M = game.npcManager; if (!M) return false;
        const R = 26 * (game.dayNight.night ? 0.85 : 1);
        const n = M.npcs.find((q) => q.alive && !q.rag && hypot(q.position.x - shop.x, q.position.z - shop.z) < R);
        const late = game.dayNight.hour < 5 || game.dayNight.hour >= 23;
        if (!n && !(late && Math.random() < 0.25)) return false;                  // (de madrugada, um morador do prédio de cima às vezes)
        const delay = 20 + Math.random() * 25;
        Traces.call(shop.x, shop.z, delay, `${why}: ligaram 190`, { r: 200, T: 150, R: 130 });
        this.stats.heard++;
        if (this.session) this.session.heard = true; else this._heardNow = true;
        game._flash(`👂 ${n ? 'Alguém na rua ouviu' : 'Um morador ouviu'} o barulho — a polícia deve vir em ~${Math.round(delay)} s`);
        return true;
    },

    // ---------------------------------------------------------------- dentro (Interiors._doEnter chama)
    onEnter(game, shop) {
        const P = this._pend || { shop, forced: false, pw: Power.forShop(shop), rep: { exp: 0, gloves: this.gloves(), mask: Traces.fullMask() } };
        this._pend = null;
        const a = Interiors.active, uses = a ? a.data.uses || [] : [];
        const hasDvr = uses.some((u) => u.kind === 'dvr');
        const el = this.skill(game, 'eletronica');
        const s = this.session = {
            shop, res: !!shop.res, tier: this.tierOf(shop), power: !P.pw, forced: P.forced, t: 0,
            done: {}, act: null, noise: P.forced ? 45 : 8, heard: !!P.heard, loot: { cash: 0, goods: 0, jv: 0, kg: 0, guns: [] },
            prints: P.rep.gloves ? 0 : 1, touched: P.rep.gloves ? [] : ['a maçaneta da porta'], wiped: false,
            cams: !P.pw && hasDvr, dvr: false,
            alarm: !P.pw ? { t: (P.forced ? 0.5 : 9) + 2.5 * el, off: false, rang: false } : null,
            police: null, entryExp: P.rep.exp || 0, mask: P.rep.mask,
        };
        if (shop.res) {
            s.day = game.dayNight.hour >= 7 && game.dayNight.hour < 18;
            HomeBurglary.onEnter(game, s);
            this._dark(game, true); this._markers(game); this._hudOn(true);
            const n = s.sleepers.length;
            game._flash(`${s.day ? '🏠' : '🔦'} ${shop.name}: ${s.who === 'asleep' ? `💤 ${n > 1 ? n + ' moradores dormindo' : 'o morador está dormindo'} — agachado e devagar` : 'ninguém em casa'}${s.alarm ? ' · ⚠ ALARME ARMADO: a central fica ao lado da porta' : ''}${s.cams ? ' · 📹 câmera Wi-Fi gravando (na nuvem)' : ''}`);
            if (s.alarm && s.forced) this._ring(game, 'A porta forçada disparou o alarme');
            return;
        }
        this._dark(game, true);
        this._markers(game);
        this._hudOn(true);
        game._flash(s.power ? `🔦 Lá dentro, no escuro de luz de vigia — ⚠ ALARME ARMADO: desligue a central ao lado da porta${s.cams ? ' · 📹 câmeras gravando' : ''}` : '🔦 Lá dentro, no breu (sem energia): sem alarme, sem câmera — só não faça barulho');
        if (s.power && s.forced) { this._ring(game, 'A porta forçada disparou o sensor do alarme'); }
    },

    // Luz: com energia, a luz de vigia (fraca); sem, breu — e a lanterna do celular na mão.
    get dim() { const s = this.session; return !s ? 1 : s.day ? 0.8 : s.power ? (s.res ? 0.26 : 0.42) : 0.16; },
    _dark(game, on) {
        const a = Interiors.active, R = a && a.room && a.room.i3d;
        if (on) {
            this._off = [];
            if (R) {
                const k = this.session ? (this.session.day ? 0.85 : this.dim < 0.2 ? 0.13 : this.session.res ? 0.2 : 0.3) : 1;      // (a pintura da sala tem luz própria: escurece junto)
                for (const m of R.mats || []) if (m.emissiveColor && !m.disableLighting) { if (!m._burgE) m._burgE = m.emissiveColor.clone(); m.emissiveColor.copyFrom(m._burgE).scaleInPlace(k); this._off.push({ mat: m }); }
                for (const l of R.lights || []) l.setEnabled(false);
                for (const m of R.meshes || []) if (m.material && /sala3d_(lampadas|feixeMat|brilho|luzMat)/.test(m.material.name) && m.isEnabled(false)) { m.setEnabled(false); this._off.push(m); }
            }
            if (!this._lamp) {
                const L = this._lamp = new BABYLON.SpotLight('burgFlash', new BABYLON.Vector3(0, 1.3, 0), new BABYLON.Vector3(0, -0.25, 1), Math.PI / 3.2, 6, game.scene);
                L.diffuse = new BABYLON.Color3(1, 0.96, 0.86); L.specular = new BABYLON.Color3(0.2, 0.2, 0.2); L.range = 9;
            }
            this._lamp.intensity = this.session && this.session.day ? 0.5 : 1.6;
            this._lamp.includedOnlyMeshes = R ? R.meshes.slice() : [];
            this._lamp.setEnabled(true);
            return;
        }
        for (const m of this._off || []) { if (m.mat) { if (m.mat._burgE) m.mat.emissiveColor.copyFrom(m.mat._burgE); } else m.setEnabled(true); }
        this._off = [];
        if (this._lamp) this._lamp.setEnabled(false);
    },
    // Multiplicador da luz do mundo lá dentro (world/DayNight.js).
    lightMul() { return this.session && Interiors.active ? this.dim : 1; },

    _uses() {
        const a = Interiors.active, o = Interiors.STAGE, s = this.session; if (!a || !s) return [];
        const kinds = s.res ? HomeBurglary.KINDS : ['safe', 'dvr', 'stock', 'case'];
        const out = (a.data.uses || []).filter((u) => kinds.includes(u.kind)).map((u) => ({ kind: u.kind, key: u.kind + u.x0.toFixed(1) + u.z0.toFixed(1), x0: o.x + u.x0, z0: o.z + u.z0, x1: o.x + u.x1, z1: o.z + u.z1 }))
            .filter((u) => !s.res || HomeBurglary.useOk(s, u));
        const cl = a.data.clerk;
        if (cl && !s.res) out.push({ kind: 'register', key: 'register', x0: o.x + cl.x - 0.8, z0: o.z + cl.z - 1.6, x1: o.x + cl.x + 0.8, z1: o.z + cl.z - 0.6 });
        if (s.alarm) { const d = a.data.door, ax = o.x + d.x1 + 1.0; out.push({ kind: 'alarm', key: 'alarm', x0: ax - 0.3, z0: o.z + 0.3, x1: ax + 0.3, z1: o.z + 0.9 }); }
        return out;
    },
    _nearUse(game, maxD = 1.7) {
        const p = game.player.position, s = this.session;
        let best = null, bs = Infinity;
        for (const u of this._uses()) {                                              // (ao alcance: vence o de centro mais perto — móveis vizinhos)
            if (s.done[u.key] || (u.kind === 'alarm' && (s.alarm.off || s.alarm.rang))) continue;
            const cx = Math.max(u.x0, Math.min(p.x, u.x1)), cz = Math.max(u.z0, Math.min(p.z, u.z1));
            if (hypot(p.x - cx, p.z - cz) > maxD) continue;
            const sc = hypot(p.x - (u.x0 + u.x1) / 2, p.z - (u.z0 + u.z1) / 2);
            if (sc < bs) { bs = sc; best = u; }
        }
        return best;
    },
    _nearDoor(game) {
        const a = Interiors.active, o = Interiors.STAGE, p = game.player.position; if (!a) return false;
        const d = a.data.door, dc = o.x + (d.x0 + d.x1) / 2;
        return hypot(p.x - dc, p.z - (o.z + 1.2)) < 2.4;
    },
    _label(u) { const s = this.session; return s && s.res && HomeBurglary.ACT[u.kind] ? HomeBurglary.ACT[u.kind][0] : this.LABEL[u.kind]; },
    _hint(game, u) {
        const s = this.session;
        if (s.res && HomeBurglary.ACT[u.kind]) return HomeBurglary.hint(game, s, u);
        if (u.kind === 'safe') return Items.has(game.inventory, 'furadeira') ? 'o apurado do dia · com a furadeira (barulho)' : 'o apurado do dia · demora (a furadeira corta pela metade) e faz barulho';
        if (u.kind === 'dvr') return s.cams ? 'apaga o que as câmeras gravaram' : 'sem energia: não gravou nada (leva o HD mesmo assim)';
        if (u.kind === 'stock') return s.shop.style === 'guns' ? 'armas e munição' : `${(Robbery.STOCK[s.shop.style] || ['mercadoria'])[0]} (pesado: receptador)`;
        if (u.kind === 'case') return s.power && !s.alarm.off ? 'joias — o sensor do vidro DISPARA o alarme' : 'joias — vidro quebrando faz barulho';
        if (u.kind === 'register') return 'o troco que fica de noite';
        if (u.kind === 'alarm') return `o sensor dispara em ${Math.max(0, Math.ceil(s.alarm.t))} s`;
        return '';
    },

    prompt(game) {
        const s = this.session; if (!s || !Interiors.active) return null;
        if (s.act) return `<b>${s.act.label.toUpperCase()}</b> ${crBar(s.act.t / s.act.dur)}<small>${this._status()}</small>`;
        const u = this._nearUse(game);
        if (u) { const h = this._hint(game, u); return `<b>E</b> ${this._label(u)}<small>${h ? h + ' · ' : ''}${this._status()}</small>`; }
        if (this._nearDoor(game)) {
            if (s.prints > 0 && !s.wiped) return `<b>E</b> limpar as digitais (${Math.round(this._wipeDur(game))} s)<small>${s.touched.slice(0, 3).join(', ')} · ou ande até a porta para sair</small>`;
            return `<b>SAIR</b> pela porta<small>${this._status()}</small>`;
        }
        return `<b>${s.res ? 'INVASÃO' : 'ARROMBAMENTO'}</b><small>${this._status()} · ${s.sleepers && s.sleepers.length && !s.woke ? 'agachado (C) perto de quem dorme' : 'ande, não corra'}</small>`;
    },
    _status() {
        const s = this.session; if (!s) return '';
        const l = s.loot, al = !s.alarm ? '' : s.alarm.rang ? '🚨 ALARME TOCANDO' : s.alarm.off ? 'alarme desligado' : `⚠ alarme em ${Math.max(0, Math.ceil(s.alarm.t))} s`;
        const pol = s.police ? ` · 🚔 POLÍCIA EM ${Math.max(0, Math.ceil(s.police.t))} s` : '';
        return `${al ? al + ' · ' : ''}${brl(l.cash + l.goods + l.jv)}${pol}`;
    },
    _wipeDur(game) { return 6 * (1 - 0.08 * this.skill(game, 'furtividade')); },

    interact(game) {
        const s = this.session; if (!s || !Interiors.active) return false;
        const pl = game.player;
        if (s.act || pl.busy) return true;
        const u = this._nearUse(game), fast = 1 - 0.06 * this.skill(game, 'furtividade');
        if (u) {
            const el = this.skill(game, 'eletronica');
            const H = s.res && HomeBurglary.ACT[u.kind];
            let dur = (H ? H[1] : { register: 3.5, safe: 20, dvr: 2.5, stock: 3, case: 1.4, alarm: 4 }[u.kind]) * fast;
            if (H && H[2]) this._noise(game, H[2]);
            if (u.kind === 'safe') dur *= (Items.has(game.inventory, 'furadeira') ? 0.5 : 1) * (1 - 0.06 * el);
            if (u.kind === 'alarm') dur *= 1 - 0.1 * el;
            this._begin(game, { kind: u.kind, key: u.key, label: this._label(u), dur, u });
            if (u.kind === 'case') { AudioFX.glass && AudioFX.glass(pl.position.x, pl.position.z); this._noise(game, 38); if (s.alarm && !s.alarm.off && !s.alarm.rang) this._ring(game, 'O sensor da vitrine disparou o alarme'); }
            return true;
        }
        if (this._nearDoor(game) && s.prints > 0 && !s.wiped) { this._begin(game, { kind: 'wipe', key: 'wipe', label: this.LABEL.wipe, dur: this._wipeDur(game) }); return true; }
        return false;
    },
    _begin(game, act) {
        const s = this.session, pl = game.player;
        act.t = 0; act.x = pl.position.x; act.z = pl.position.z;
        s.act = act;
        pl.playAction('rummage', { lock: 0 }); if (pl.action) pl.action.timer = act.dur + 0.2;
        AudioFX.blip(act.kind === 'case' ? 1400 : 560, 0.07, 0.12);
    },
    _touch(what) {
        const s = this.session; if (!s || this.gloves()) return;
        s.prints++; if (!s.touched.includes(what)) s.touched.push(what);
        s.wiped = false;
    },
    _noise(game, n) { const s = this.session; if (s) s.noise = Math.min(100, s.noise + n * (1 - 0.1 * this.skill(game, 'furtividade'))); },

    _finishAct(game, A) {
        const s = this.session, inv = game.inventory, zone = Economy.zoneOf(s.shop).mul || 1, rnd = () => 0.85 + Math.random() * 0.3;
        const range = (r) => Math.round((r[0] + Math.random() * (r[1] - r[0])) * zone / 10) * 10, B = this.burglar(game);
        if (A.kind === 'wipe') { s.wiped = true; this.stats.wiped++; game._flash(`🧽 Digitais limpas: ${s.touched.join(', ')}`); return; }
        if (A.kind === 'alarm') { s.alarm.off = true; s.done.alarm = 1; this._touch('a central do alarme'); game._flash('🔕 Central do alarme desligada: o sensor não dispara mais'); if (B) B.addXp(10); return; }
        s.done[A.key] = 1;
        if (s.res) { HomeBurglary.finish(game, s, A); return; }
        if (A.kind === 'register') {
            const v = Math.round(range(Robbery.REG[s.tier]) * this.REG_FRAC / 10) * 10;
            inv.addCash(v); s.loot.cash += v; this._touch('a gaveta do caixa');
            game._flash(`💵 Gaveta do caixa: +${brl(v)} (o troco da noite)`); AudioFX.blip(980, 0.1, 0.18);
        } else if (A.kind === 'safe') {
            const v = range(Robbery.SAFE[s.tier]);
            inv.addCash(v); s.loot.cash += v; this._touch('o cofre');
            game._flash(`💰 Cofre aberto: +${brl(v)} — o apurado do dia`); AudioFX.blip(1100, 0.2, 0.22);
        } else if (A.kind === 'dvr') {
            s.dvr = true; this._touch('o gravador');
            game._flash(s.cams ? '📹 HD do gravador arrancado: as câmeras não têm mais nada de você' : '📹 HD arrancado (sem energia, não tinha gravado nada)');
        } else if (A.kind === 'stock') {
            this._touch('as prateleiras');
            if (s.shop.style === 'guns') { this._gun(game); }
            else {
                const S = Robbery.STOCK[s.shop.style] || ['mercadoria', 200, 3], v = Math.round(S[1] * zone * rnd() / 10) * 10, kg = S[2];
                if (typeof Bags !== 'undefined' && Bags.room(game) < kg) { s.done[A.key] = 0; game._flash(`🎒 Não cabe: ${S[0]} pesa ${kg} kg (${Bags.label(game)})`); return; }
                const D = B && B.data; if (D) { D.goods += v; D.weight += kg; }
                s.loot.goods += v; s.loot.kg += kg;
                game._flash(`📦 ${S[0]} (${brl(v)}, +${kg} kg) — venda no receptador da favela`);
            }
        } else if (A.kind === 'case') {
            this._touch('o vidro da vitrine');
            const n = 2 + Math.floor(Math.random() * 3);
            let got = 0, val = 0;
            for (let i = 0; i < n; i++) {
                if (inv.slotsNeeded({ kind: 'jewel' }) > inv.slotsFree()) break;
                const v = Math.round((2400 + Math.random() * 4200) * zone / 10) * 10; inv.addJewel(v); got++; val += v;
            }
            s.loot.jv += val;
            game._flash(got ? `💎 Vitrine: ${got} peças (${brl(val)})${got < n ? ' — a mochila encheu' : ''}` : '🎒 Mochila cheia: não cabe mais nenhuma joia');
        }
        if (B) B.addXp(A.kind === 'dvr' ? 6 : 12);
    },
    // Loja de armas: cada prateleira, uma arma (nova ou mais munição para a que já tem).
    _gun(game) {
        const s = this.session, inv = game.inventory;
        let r = Math.random() * this.GUNS.reduce((a, g) => a + g[1], 0), pick = this.GUNS[0];
        for (const g of this.GUNS) { r -= g[1]; if (r <= 0) { pick = g; break; } }
        const [key, , ammo] = pick;
        if (!inv.weapons || !inv.weapons[key]) { s.loot.goods += 900; game._flash('🔫 Munição e acessórios (vendidos no receptador)'); return; }
        const isNew = inv.addWeapon(key, ammo);
        const nm = (typeof Weapons !== 'undefined' && Weapons[key] && Weapons[key].name) || key;
        s.loot.guns.push(key); this.stats.guns++;
        s.loot.goods += Math.round(((Economy.ITEMS[key] && Economy.ITEMS[key].base) || 1500) * 0.6);
        game._flash(`🔫 ${nm}${isNew ? ' (nova)' : ''} +${ammo} balas — arma sem registro`);
    },

    // O alarme tocou: a sirene da loja e a polícia a caminho.
    _ring(game, why) {
        const s = this.session; if (!s || (s.alarm && s.alarm.rang) || s.police) return;
        if (s.alarm) { s.alarm.rang = true; this.stats.alarms++; }                       // (sem alarme: o morador que acordou liga 190)
        const H = Robbery.HEAT[s.tier] || Robbery.HEAT[2];
        s.police = { t: H.police * 0.9 };
        game._flash(`🚨 ${why}! A polícia chega em ~${Math.round(s.police.t)} s — pegue o que der e suma`);
    },

    update(dt, game) {
        const s = this.session; if (!s) return;
        s.t += dt;
        const pl = game.player, p = pl.position;
        // a lanterna do celular na mão, para onde ele olha
        if (this._lamp) {
            const h = pl.root.rotation.y;
            this._lamp.position.set(p.x + Math.sin(h) * 0.25, 1.35, p.z + Math.cos(h) * 0.25);
            this._lamp.direction.set(Math.sin(h), -0.32, Math.cos(h));
        }
        this._tickMarkers(game, dt);
        this._hud(game);
        // alarme (energia ligada): o sensor de presença conta até disparar
        if (s.alarm && !s.alarm.off && !s.alarm.rang) { s.alarm.t -= dt; if (s.alarm.t <= 0) this._ring(game, 'O sensor de presença disparou o alarme'); }
        if (s.alarm && s.alarm.rang) { s.beep = (s.beep || 0) - dt; if (s.beep <= 0) { s.beep = 0.45; s.beepHi = !s.beepHi; AudioFX.alarm && AudioFX.alarm(p.x, p.z, s.beepHi); } }
        if (s.police) {
            s.police.t -= dt;
            if (s.police.t <= 0 && !s.police.door) { s.police.door = true; game._flash('🚔 A polícia está na porta da loja! Sair agora é dar de cara com ela'); }
            if (s.police.t <= -30) { game._flash('🚔 A polícia entrou na loja'); this._end(game, 'busted'); return; }
        }
        // barulho: passos (correr faz barulho), as ferramentas; cheio, quem estiver na rua ouve
        const sp = pl.speed || 0, P = Config.player;
        const step = sp > P.jogSpeed * 1.15 ? 14 : sp > P.maxSpeed * 1.3 ? 4 : 0;
        if (step) this._noise(game, step * dt);
        const A = s.act;
        if (A && A.kind === 'safe') this._noise(game, (Items.has(game.inventory, 'furadeira') ? 7 : 4.5) * dt);
        if (s.res) HomeBurglary.tick(dt, game, s);
        s.noise = Math.max(0, s.noise - 6 * dt);
        if (s.noise >= 80 && !s.heard && !(s.alarm && s.alarm.rang)) { if (!this._heard(game, s.shop, 'Barulho dentro da loja fechada')) s.noise = 60; }
        // ação em andamento (andou para longe: cancela)
        if (A) {
            if (hypot(p.x - A.x, p.z - A.z) > 1.3) { s.act = null; if (A.kind === 'safe') s.done[A.key] = 0; game._flash('Interrompido'); if (pl.action && pl.action.name === 'rummage') pl.action.timer = 0; return; }
            A.t += dt;
            if (A.t >= A.dur) { s.act = null; this._finishAct(game, A); if (pl.action && pl.action.name === 'rummage') pl.action.timer = 0; }
        }
    },

    // Saiu pela porta (Interiors._doLeave).
    onLeave(game) {
        if (!this.session) return;
        this._end(game, 'out');
    },

    // Fim: how = 'out' | 'busted'. As pistas viram um CASO que a polícia investiga quando descobrir o arrombamento.
    _end(game, how) {
        const s = this.session; if (!s) return;
        this._dark(game, false);
        this.session = null;
        this._hudOn(false); this._markersOff();
        if (game.player.action && game.player.action.name === 'rummage') game.player.action.timer = 0;
        const shop = s.shop, total = s.loot.cash + s.loot.goods + s.loot.jv, B = this.burglar(game);
        this.hit[shop.id] = Economy.day;
        if (how === 'busted') {
            if (Interiors.active) Interiors._doLeave(game);
            if (game.heat) game.heat.commit('burglary', CrimeExposure.POLICE);
            game._busted && game._busted();
            return;
        }
        // na calçada: quem vê você saindo (e a polícia, se chegou)
        const police = s.police && s.police.t < 8;
        let exp = police ? CrimeExposure.POLICE : CrimeExposure.evaluate(game);
        if (!police) exp &= ~(s.entryExp & (CrimeExposure.CAMERA | CrimeExposure.WITNESS));      // (o que já viu a entrada já contou)
        if (exp && game.heat) game.heat.commit('burglary', exp);
        const pm = game.policeManager;
        if (police) { game.wanted.ensureLevel(2); if (pm) pm.alertNear({ x: shop.x, z: shop.z }, 200); game._flash('🚔 Deu de cara com a polícia na saída!'); }
        else if (s.police) { if (pm) pm.alertNear({ x: shop.x, z: shop.z }, 220); Traces.startSearch(shop.x, shop.z, 150, 140); game._flash(`🚔 Viaturas chegando em ${Math.round(s.police.t)} s — some antes que te vejam!`); }
        // o caso: digitais, vídeo, alarme/vizinho (descoberto já) ou a loja abrindo
        const prints = (s.prints > 0 && !s.wiped) || !!(Power.out[Power.blockOf(shop)] && Power.out[Power.blockOf(shop)].prints);
        const cam = s.cams && !s.dvr;
        const now = Traces.now(), hour = game.dayNight.hour, open = shop.res ? 0 : Economy.opensAt(shop.style);
        const nowFound = !!(s.alarm && s.alarm.rang) || s.heard || !!s.woke;
        const at = nowFound ? now : shop.res ? Residences.discoverAt(shop, s.who, now, hour) : now + ((open - hour + 24) % 24 || 24) + 0.25;
        const C = { id: shop.id, name: shop.name, x: shop.x, z: shop.z, style: shop.style, res: !!shop.res, at, found: false, prints, cam, seen: !!s.seen, masked: !!s.mask || Traces.fullMask(), forced: s.forced, loot: total, day: Economy.day };
        this.cases.push(C);
        if (!shop.res) Robbery.robbedDay[shop.id] = Math.floor(at / 24);
        if (B && total > 0) {
            const xp = 60 * s.tier + total / 50 + (s.alarm && s.alarm.rang ? 0 : 40) + (prints || cam ? 0 : 50);
            B.addXp(xp);
        }
        if (game.skills) game.skills.addXp(15 * s.tier);
        const L = [];
        if (prints) L.push('🖐 digitais');
        if (cam) L.push('📹 câmeras gravaram');
        if (s.forced) L.push('marca de arrombamento');
        if (exp & CrimeExposure.WITNESS) L.push('👁 alguém te viu sair');
        if (s.seen) L.push('👁 o morador viu seu rosto');
        game._delayed.push({ t: 1.4, fn: () => game._flash(L.length ? `🧾 Pistas deixadas: ${L.join(', ')}` : '🧤 Nenhuma pista: trabalho limpo') });
        const when = nowFound ? 'já descobriram' : shop.res ? `descobrem ${s.who === 'asleep' ? 'quando acordarem' : 'quando voltarem para casa'} (~${Math.floor(at % 24)}h)` : `descobrem quando a loja abrir (${open}h)`;
        if (total > 0) game._delayed.push({ t: 3.0, fn: () => game._flash(`💼 ${shop.res ? 'Invasão' : 'Arrombamento'} — ${shop.name}: ${brl(total)}${s.loot.guns.length ? ` · ${s.loot.guns.length} arma(s)` : ''} — ${when}`) });
    },

    // ---------------------------------------------------------------- a investigação (por quadro, dentro e fora)
    tick(dt, game) {
        Power.update(dt, game);
        if (this.box) this._boxTick(dt, game);
        this._ct = (this._ct || 0) - dt;
        if (this._ct > 0) return;
        this._ct = 0.5;
        const now = Traces.now();
        for (let i = this.cases.length - 1; i >= 0; i--) {
            const C = this.cases[i];
            if (!C.found && now >= C.at) { C.found = true; C.lab = now + 2; game._flash(`🔎 Descobriram ${C.res ? 'a invasão' : 'o arrombamento'} — ${C.name}: a perícia vai ao local`); continue; }
            if (C.found && now >= C.lab) { this.cases.splice(i, 1); this._solve(game, C); }
        }
    },
    _solve(game, C) {
        const H = game.heat, rep = { type: 'burglary', severity: CRIME_SEVERITY.burglary, masked: C.masked, x: C.x, z: C.z };
        const L = [];
        if (C.prints) { if (H) H.fileEvidence('burglary'); this.stats.prints++; L.push('🖐 as digitais são suas — seu nome está na ficha'); }
        if (C.cam) {
            this.stats.cams++;
            const named = H ? H.fileReport(rep) : false;
            if (!C.masked && typeof Traces !== 'undefined') Traces.desc = Object.assign(Traces.sig(), { until: Traces.now() + 48, where: C.name });
            L.push(named ? '📹 o vídeo mostra seu rosto' : '📹 o vídeo só mostra um mascarado');
        }
        if (C.seen && !C.cam) {
            const named = H ? H.fileReport(rep) : false;
            if (!C.masked) Traces.desc = Object.assign(Traces.sig(), { until: Traces.now() + 48, where: C.name });
            L.push(named ? '👁 o morador te descreveu e reconheceu no álbum' : '👁 o morador só viu um mascarado');
        }
        if (!L.length) {
            this.stats.clean++;
            if (game.achievements && game.achievements.bump) game.achievements.bump('cleanJob');
            game._flash(`📁 ${C.res ? 'Invasão' : 'Arrombamento'} — ${C.name}: a perícia não achou pistas — caso arquivado`);
            return;
        }
        this.stats.filed++;
        game._flash(`🕵 Perícia na ${C.name}: ${L.join(' · ')}`);
    },
    // Chip no canto (crime/Traces.js): o próximo caso.
    chip() {
        const C = this.cases.slice().sort((a, b) => a.at - b.at)[0]; if (!C) return null;
        const t = C.found ? C.lab : C.at, h = Math.floor(t % 24);
        return C.found ? `🕵 perícia — ${C.name} até ${h}h` : `🔎 ${C.res ? 'invasão' : 'arrombamento'} — ${C.name}: descobrem às ${h}h`;
    },

    // ---------------------------------------------------------------- marcadores no chão e HUD
    _markers(game) {
        if (!this._glow) { this._glow = new GlowBatch(game.scene, 16, 'burgGlow', 'glow'); for (let i = 0; i < 16; i++) { this._glow.alloc(); this._glow.off(i); } }
        const COL = { safe: [1, 0.75, 0.2], dvr: [0.3, 0.85, 1], stock: [0.4, 1, 0.5], case: [0.85, 0.5, 1], register: [1, 0.85, 0.3], alarm: [1, 0.3, 0.3],
            bed: [1, 0.85, 0.3], chest: [1, 0.85, 0.3], closet: [0.85, 0.5, 1], tv: [0.4, 1, 0.5], desk: [0.4, 1, 0.5], cabinet: [0.4, 1, 0.5], jewelbox: [0.85, 0.5, 1] };
        this.session.marks = this._uses().slice(0, 16).map((u) => ({ key: u.key, kind: u.kind, x: (u.x0 + u.x1) / 2, z: Math.max(u.z0 - 0.5, (u.z0 + u.z1) / 2 - 0.9), col: COL[u.kind] }));
        this._mt = 0;
    },
    _tickMarkers(game, dt) {
        const s = this.session, G = this._glow; if (!G || !s.marks) return;
        this._mt += dt;
        const k = 0.45 + 0.35 * Math.sin(this._mt * 4);
        s.marks.forEach((m, i) => {
            const done = s.done[m.key] || (m.kind === 'alarm' && (s.alarm.off || s.alarm.rang));
            if (done) { G.off(i); return; }
            G.place(i, m.x, 0.22, m.z, 1.0 + 0.2 * k); G.color(i, m.col[0] * k, m.col[1] * k, m.col[2] * k, 0.4);
        });
        G.flush();
    },
    _markersOff() { const G = this._glow; if (!G) return; for (let i = 0; i < 16; i++) G.off(i); G.flush(); },

    _hudOn(on) {
        if (!this._el) {
            const st = document.createElement('style');
            st.textContent = `
                #burgHud { position: fixed; left: 50%; top: 64px; transform: translateX(-50%); z-index: 12; min-width: 300px; max-width: min(540px, 94vw); padding: 10px 16px 12px; pointer-events: none;
                    background: rgba(8,10,20,0.84); border: 1px solid rgba(129,140,248,0.55); border-radius: 18px; box-shadow: 0 10px 40px rgba(20,20,80,0.4); font-family: var(--font); color: #fff; display: none; }
                #burgHud .bt { display: flex; justify-content: space-between; gap: 12px; font: 700 14px var(--font-d); letter-spacing: .04em; }
                #burgHud .bt b { color: #a5b4fc; } #burgHud .bt b.hot { color: #ff6a7a; }
                #burgHud .br { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #c7d2fe; margin-top: 6px; }
                #burgHud .br span { width: 80px; flex: none; } #burgHud .br i { flex: 1; height: 7px; border-radius: 99px; background: rgba(255,255,255,0.1); overflow: hidden; } #burgHud .br i s { display: block; height: 100%; border-radius: 99px; }
                #burgHud .ev { font-size: 11px; color: #a5b4fc; margin-top: 6px; }
                body.mobile #burgHud { left: 8px; top: 8px; transform: none; min-width: 0; width: min(300px, 42vw); padding: 6px 10px; font-size: 11px; }`;
            document.head.appendChild(st);
            this._el = document.createElement('div'); this._el.id = 'burgHud'; document.body.appendChild(this._el);
        }
        this._el.style.display = on ? 'block' : 'none';
        this._hh = '';
    },
    _hud(game) {
        const s = this.session, el = this._el; if (!s || !el) return;
        this._ht = (this._ht || 0) - (game._dt || 0.03);
        if (this._ht > 0) return;
        this._ht = 0.15;
        const l = s.loot, nz = s.noise, col = nz > 70 ? '#f43f5e' : nz > 40 ? '#fbbf24' : '#34d399';
        const al = !s.alarm ? '<b>⚡ sem energia</b>' : s.alarm.rang ? '<b class="hot">🚨 ALARME</b>' : s.alarm.off ? '<b>🔕 alarme desligado</b>' : `<b class="hot">⚠ ALARME EM ${Math.max(0, Math.ceil(s.alarm.t))}s</b>`;
        const cam = s.res ? (s.cams ? '📹 câmera Wi-Fi GRAVANDO' : s.shop.cams ? '📹 câmera sem energia' : '') : !s.power ? '📹 câmeras sem energia' : s.dvr ? '📹 HD arrancado' : s.cams ? '📹 câmeras GRAVANDO' : '📹 sem câmera';
        const zz = s.res && s.sleepers && s.sleepers.length ? (s.woke ? '😱 o morador ACORDOU' : `💤 ${s.sleepers.length} dormindo`) : '';
        const ev = [zz, this.gloves() ? '🧤 de luvas' : `🖐 digitais: ${s.wiped ? 'limpas' : s.prints}`, cam, s.police ? `🚔 polícia em ${Math.max(0, Math.ceil(s.police.t))}s` : s.heard ? '👂 ouviram — ligaram' : ''].filter(Boolean).join(' · ');
        const al2 = s.res && !s.alarm ? (s.shop.alarm ? '<b>⚡ alarme sem energia</b>' : '<b>sem alarme</b>') : al;
        const html = `<div class="bt"><span>${s.res ? 'INVASÃO' : 'ARROMBAMENTO'} · ${s.shop.name}</span>${s.res ? al2 : al}</div><div class="br"><span>Barulho</span><i><s style="width:${nz.toFixed(0)}%;background:${col}"></s></i></div><div class="br"><span>Na sacola</span><b style="color:#fde68a">${brl(l.cash + l.goods + l.jv)}</b></div><div class="ev">${ev}</div>`;
        if (html !== this._hh) { this._hh = html; el.innerHTML = html; }
    },

    abort(game) { if (this.session) { this._dark(game || window.game, false); this.session = null; this._hudOn(false); this._markersOff(); } this.box = null; },
    serialize() { return { power: Power.serialize(), cases: this.cases, hit: this.hit, stats: this.stats }; },
    load(s) {
        this.abort();
        Power.load(s && s.power);
        this.cases = (s && s.cases) || [];
        this.hit = (s && s.hit) || {};
        this.stats = Object.assign({ breaks: 0, forced: 0, clean: 0, filed: 0, prints: 0, cams: 0, guns: 0, heard: 0, wiped: 0, alarms: 0 }, (s && s.stats) || {});
    },
};
