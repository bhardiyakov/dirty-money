// ============================================================================
// Robbery — ASSALTO À MÃO ARMADA dentro das lojas (o interior é um palco congelado: Interiors). Carreira: ASSALTANTE (careers/CareerRobber.js).
//
//   ANUNCIAR   com arma de fogo na mão, perto do balcão: E. O atendente levanta as mãos e os fregueses deitam no chão (REFÉNS).
//              Cada tipo de loja tem um PORTE (1 padaria/conveniência … 3 restaurante de luxo/loja de armas, 4 joalheria) e só quem já
//              tem a patente certa de Assaltante consegue (o atendente não leva a sério um pé-de-chinelo numa joalheria).
//   MEDO       atendente e reféns têm medo (0..100): sobe com você perto e de frente com a arma, com o GRITO (G) e com o TIRO DE AVISO
//              (atacar: tiro no teto — todo mundo gela, mas o tiro pode ser ouvido lá fora). Cai sozinho. Com medo baixo:
//                • o atendente aperta o ALARME silencioso (a polícia é chamada);
//                • um refém LEVANTA (aviso) e CORRE para a porta — se sair, chama a polícia e descreve você;
//                • na loja de armas e na joalheria, o atendente/segurança SACA a arma: grite ou dê o tiro de aviso antes que ele atire.
//   FAZER A LIMPA (E nos pontos marcados no chão): CAIXA (o atendente esvazia — só anda com ele com medo e você perto), COFRE do escritório
//              (o gerente abre com medo alto; senão você arromba — a furadeira corta o tempo), PRATELEIRAS (mercadoria pesada: receptador
//              da favela), CARTEIRAS e celulares dos reféns, VITRINES da joalheria. ABRAÇADEIRAS amarram um refém (ele não foge mais).
//              GRAVADOR (DVR): arrancar o HD apaga as câmeras (crime/Traces.js).
//   POLÍCIA    ninguém chamou: cronômetro parado (mas um pedestre pode ver pela vitrine). Chamaram: contagem regressiva (porte da loja,
//              policiamento do distrito, noite, skill Sangue-frio). Zerou com você dentro = CERCO: negociar (Lábia), sair com refém de
//              ESCUDO, sair atirando ou se render.
//   SAIR       antes da polícia: as testemunhas ligam depois (quanto mais medo, mais demoram) e abre a ÁREA DE BUSCA. Com a polícia a
//              caminho: estrelas na porta. Rastros (descrição, rosto, digitais, câmeras, placa) em crime/Traces.js.
// ============================================================================

const Robbery = {
    TIER: { mart: 1, bakery: 1, burger: 1, pharmacy: 1, fit: 1, bar: 2, pizza: 2, clothes: 2, gym: 2, italian: 3, japanese: 3, guns: 3, jewelry: 4 },
    TIER_NAME: ['', 'comércio pequeno', 'comércio médio', 'comércio de luxo', 'joalheria'],
    RANK_FOR: [0, 0, 1, 2, 2],                                    // porte → patente mínima de Assaltante
    REG: [null, [450, 1300], [1100, 2900], [2600, 6200], [3500, 8000]],
    SAFE: [null, [900, 2600], [2200, 6000], [5500, 14000], [16000, 38000]],
    POLICE: [null, 75, 65, 55, 40],                               // s até a viatura chegar depois do chamado
    STOCK: {                                                     // [o quê, R$ por prateleira, kg]
        mart: ['cigarros e bebidas', 260, 3], bakery: ['frios e bebidas', 140, 3], burger: ['bebidas e congelados', 120, 3], pharmacy: ['remédios controlados', 520, 1],
        fit: ['suplementos', 220, 2], bar: ['uísque e destilados', 420, 4], pizza: ['vinhos e bebidas', 240, 3], clothes: ['roupas de grife', 650, 3], gym: ['suplementos e equipamentos', 380, 4],
        italian: ['vinhos importados', 900, 4], japanese: ['saquês e bebidas importadas', 760, 4], guns: ['munição e acessórios', 1100, 5], jewelry: ['relógios', 2400, 1],
    },
    robbedDay: {},                // id da loja → dia do último assalto (fica fechada para perícia até o dia seguinte)
    session: null,
    count: 0,

    // ---------------------------------------------------------------- regras
    tierOf(shop) { return shop && !shop.bank && !shop.home ? (this.TIER[shop.style] || 0) : 0; },
    robber(game) { return game.careers && game.careers.by.robber; },
    closedToday(shop) { return this.robbedDay[shop.id] === Economy.day; },
    gunInHand(game) { const W = Weapons[game.player.weapon]; return !!(W && W.gun); },

    // Por que não dá para anunciar o assalto aqui (null = dá).
    why(game, shop) {
        const tier = this.tierOf(shop);
        if (!tier) return 'Aqui não dá para assaltar';
        if (shop.district === 'favela') return 'Roubar comércio do morro? O tráfico não deixa (e cobra no Tribunal)';
        if (typeof Business !== 'undefined' && Business.isOwned(shop)) return 'Esse negócio é seu';
        if (typeof Heists !== 'undefined' && Heists.lockedStore(shop)) return 'A joalheria está no seu plano de golpe: faça pelo quadro (aba CARREIRAS › Assaltante)';
        const R = this.robber(game), need = this.RANK_FOR[tier];
        if (R && R.rank < need) return `Você ainda não tem cancha para assaltar ${tier === 4 ? 'uma joalheria' : 'um ' + this.TIER_NAME[tier]} — precisa ser ${R.ranks[need].name} (Assaltante)`;
        return null;
    },

    _clerkNear(game, r = 5.2) {
        const a = Interiors.active, cl = a && a.data.clerk; if (!cl) return false;
        const o = Interiors.STAGE, p = game.player.position;
        return hypot(p.x - (o.x + cl.x), p.z - (o.z + cl.z)) < r && p.z < o.z + cl.z + 0.6;
    },

    // ---------------------------------------------------------------- começo
    start(game, heist = null) {
        const a = Interiors.active; if (!a || this.session) return false;
        const shop = a.shop, tier = this.tierOf(shop), o = Interiors.STAGE, d = a.data, R = this.robber(game);
        if (!heist && typeof WorldMemory !== 'undefined' && WorldMemory.guarded(shop)) {          // assaltada há poucos dias: PM de plantão na porta
            game._flash('👮 Tem um PM de plantão aqui desde o último assalto — agora não dá');
            return false;
        }
        const intim = R ? R.skill('intimidacao') : 0;
        // atores: [atendente, ...fregueses] na ordem do Interiors (os com tipo do gerador vão para os atores "de academia")
        const list = (d.clerk ? [d.clerk] : []).concat(d.patrons), typed = [], plain = [];
        for (const e of list) (e.type && typeof NpcArt !== 'undefined' && NpcArt.atlases && NpcArt.atlases[e.type] ? typed : plain).push(e);
        const actorOf = (e) => { const i = typed.indexOf(e); return i >= 0 ? (Interiors._gymActors || [])[i] : Interiors._actors[plain.indexOf(e)]; };
        const mk = (e, role) => { const ac = actorOf(e); if (!ac) return null; if (ac.gym) ac.gym = null; return { a: ac, e, role, x: o.x + e.x, z: o.z + e.z, fear: 50, st: 'down', t: 0 }; };
        // Loja com clientela viva (world/ShopLife.js): o atendente e os clientes que estão lá dentro AGORA viram atendente e reféns.
        const cast = typeof ShopLife !== 'undefined' && ShopLife.active ? ShopLife.robberyCast() : null;
        const mkLive = (c, role) => (c ? { a: c.a, e: { x: c.x, z: c.z }, role, x: o.x + c.x, z: o.z + c.z, fear: 50, st: 'down', t: 0 } : null);
        const gunMul = this._gunMul(game);
        const s = this.session = {
            shop, tier, t: 0, heist, phase: 'hold', police: null, siege: null, done: {}, act: null, shoutCd: 0, shots: 0,
            loot: { cash: 0, goods: 0, kg: 0, jewels: 0, jv: 0 }, prints: false, dvr: !d.uses.some((u) => u.kind === 'dvr'), out: 0, noticed: 0,
            clerk: cast ? mkLive(cast.clerk, 'clerk') : d.clerk ? mk(d.clerk, 'clerk') : null, hostages: [], guard: null, alarmWhy: '', armedLeft: 2,
        };
        for (const e of d.patrons) { if (cast && !e.type) continue; const h = mk(e, e.guard ? 'guard' : 'hostage'); if (!h) continue; if (e.guard) s.guard = h; else s.hostages.push(h); }
        if (cast) for (const c of cast.hostages) s.hostages.push(mkLive(c, 'hostage'));
        if (s.clerk) { s.clerk.fear = 38 + 9 * intim + gunMul * 12 - (shop.style === 'guns' ? 22 : 0); s.clerk.armed = shop.style === 'guns'; }
        if (s.guard) { s.guard.fear = 22 + 6 * intim; s.guard.armed = true; }
        for (const h of s.hostages) h.fear = 55 + 6 * intim + gunMul * 8;
        const sleep = heist && heist.approach === 'stealth';
        for (const h of this.people()) {
            h.a.setHeading(Math.atan2(game.player.position.x - h.x, game.player.position.z - h.z));
            if (sleep) { h.st = 'asleep'; h.a.play('dead'); }
            else if (h.role === 'hostage') { h.a.play('kneel'); }
            else h.a.play('surrender');
        }
        if (heist && heist.gunman >= 2 && s.guard && !sleep) { s.guard.armed = false; s.guard.fear = 90; s.guard.st = 'down'; s.guard.a.play('kneel'); }
        this._markers(game);
        game.player.setCrouch && game.player.setCrouch(false);
        if (!heist) {
            AudioFX.blip(320, 0.2, 0.25);
            game._flash(`🔫 ASSALTO! "Mãos pra cima, ninguém se mexe!" — ${shop.name}`);
            if (!Traces.fullMask()) game._flash('⚠ Sem balaclava: atendente, reféns e câmeras estão vendo o seu rosto');
        }
        if (game.empire) game.empire.spend(4, 12);
        this._hudOn(true);
        return true;
    },

    people() { const s = this.session; if (!s) return []; return [s.clerk, s.guard, ...s.hostages].filter(Boolean); },
    _gunMul(game) { const w = game.player.weapon; return { shotgun: 1.35, rifle: 1.35, ak47: 1.4, smg: 1.2 }[w] || 1; },

    // Polícia chamada: começa a contagem (só encurta se já estava correndo).
    callPolice(game, why, mul = 1, loud = false) {
        const s = this.session; if (!s) return;
        if (loud) s.loud = true;
        const R = this.robber(game), sangue = R ? R.skill('sanguefrio') : 0;
        const d = game.empire ? game.empire.districtAt(s.shop.x, s.shop.z) : 'comercio', D = (Empire.DISTRICTS[d] || {}).police || 1;
        const night = game.dayNight.night ? 1.15 : 1, hack = s.heist ? 1 + 0.25 * (s.heist.hacker || 0) : 1;
        const T = this.POLICE[s.tier] / D * (1 + 0.07 * sangue) * night * hack * mul;
        if (!s.police) { s.police = { t: T, T }; s.alarmWhy = why; game._flash(`🚨 ${why}! Polícia a caminho: ${Math.round(T)}s — faça a limpa e suma`); AudioFX.blip(220, 0.4, 0.25); }
        else if (T < s.police.t) { s.police.t = T; game._flash(`🚨 ${why}! A polícia acelerou: ${Math.round(T)}s`); }
    },

    // ---------------------------------------------------------------- entrada do jogador (dentro da loja, sem janela aberta)
    input(game) {
        const s = this.session, inp = game.input; if (!s || s.siege) return;
        if (inp.consumePress('g')) this.shout(game);
        if ((inp.consumePress('mouse0') | inp.consumePress(' ')) && this.gunInHand(game)) this.warningShot(game);
    },

    shout(game) {
        const s = this.session, pl = game.player; if (!s || s.shoutCd > 0 || pl.busy) return;
        const R = this.robber(game), k = 1 + 0.12 * (R ? R.skill('intimidacao') : 0), p = pl.position;
        s.shoutCd = 2.2;
        let calmed = 0;
        for (const h of this.people()) {
            if (h.st === 'gone' || h.st === 'asleep') continue;
            const d = hypot(h.x - p.x, h.z - p.z);
            if (d > 8.5) continue;
            h.fear = Math.min(100, h.fear + (h.role === 'hostage' ? 30 : 22) * k);
            if ((h.st === 'rising' || (h.st === 'run' && d < 6.5)) && h.role === 'hostage') { h.st = 'down'; h.t = 0; h.a.play('kneel'); calmed++; }
            if (h.st === 'draw') { h.st = 'down'; h.a.play('surrender'); calmed++; }
        }
        AudioFX.blip(170, 0.18, 0.3);
        game._flash(calmed ? '🗣 "NO CHÃO! NINGUÉM SE MEXE!" — eles voltaram para o chão' : '🗣 "NINGUÉM SE MEXE!"');
    },

    warningShot(game) {
        const s = this.session, pl = game.player, inv = game.inventory, key = pl.weapon; if (!s || pl.busy) return;
        if (inv.mag(key) <= 0) { AudioFX.dryfire(pl.position.x, pl.position.z); game._flash('Sem bala no pente (R recarrega)'); return; }
        inv.consume(key);
        pl.primary();
        AudioFX.shot(key, pl.position.x, pl.position.z);
        s.shots++;
        for (const h of this.people()) {
            if (h.st === 'gone' || h.st === 'asleep') continue;
            h.fear = 100;
            if (h.role === 'hostage' && (h.st === 'rising' || h.st === 'run')) { h.st = 'down'; h.a.play('kneel'); }
            if (h.st === 'draw') { h.st = 'down'; h.a.play('surrender'); }
        }
        const silenced = game.careers && game.careers.silenced(key);
        if (!silenced && !s.police && Math.random() < 0.75) this.callPolice(game, 'O tiro foi ouvido na rua', 0.85);
        game._flash(`💥 Tiro de aviso no teto — todo mundo gelou${silenced ? ' (silenciador: ninguém lá fora ouviu)' : ''}`);
    },

    // ---------------------------------------------------------------- pontos de saque
    // Lista dos pontos de uso ao alcance: { kind, key, x0..z1 (mundo), d }. Mais perto vence.
    _uses() {
        const a = Interiors.active, o = Interiors.STAGE;
        return (a ? a.data.uses : []).filter((u) => ['safe', 'dvr', 'stock', 'case'].includes(u.kind)).map((u) => ({ kind: u.kind, key: u.kind + u.x0.toFixed(1) + u.z0.toFixed(1), x0: o.x + u.x0, z0: o.z + u.z0, x1: o.x + u.x1, z1: o.z + u.z1 }));
    },
    _nearUse(game, maxD = 1.7) {
        const p = game.player.position, s = this.session;
        let best = null, bd = maxD;
        for (const u of this._uses()) {
            if (s && s.done[u.key]) continue;
            const cx = Math.max(u.x0, Math.min(p.x, u.x1)), cz = Math.max(u.z0, Math.min(p.z, u.z1)), d = hypot(p.x - cx, p.z - cz);
            if (d < bd) { bd = d; best = u; }
        }
        return best;
    },
    _nearHostage(game, maxD = 1.8) {
        const s = this.session, p = game.player.position; if (!s) return null;
        let best = null, bd = maxD;
        for (const h of s.hostages) { if (h.st !== 'down' && h.st !== 'tied' && h.st !== 'asleep') continue; const d = hypot(h.x - p.x, h.z - p.z); if (d < bd && (!h.robbed || (!h.tied && Items.has(game.inventory, 'abracadeira') && h.st !== 'asleep'))) { bd = d; best = h; } }
        return best;
    },

    LABEL: { register: 'mandar esvaziar o caixa', safe: 'abrir o cofre do escritório', dvr: 'arrancar o HD das câmeras', stock: 'limpar a prateleira', case: 'quebrar a vitrine', wallet: 'pegar carteira e celular do refém', tie: 'amarrar o refém (abraçadeira)' },

    // ---------------------------------------------------------------- prompt (dentro de uma loja)
    // Retorna o texto do HUD, ou null para deixar o Interiors seguir com o dele.
    prompt(game) {
        const s = this.session, a = Interiors.active; if (!a) return null;
        if (!s) {
            if (!this.gunInHand(game) || !this._clerkNear(game) || game.shopUI.open || !this.tierOf(a.shop)) return null;
            if (this.closedToday(a.shop)) return null;
            const why = this.why(game, a.shop);
            if (why) return `<b>ASSALTO</b><small>${why} · guarde a arma (1) para comprar</small>`;
            return `<b>E</b> ANUNCIAR O ASSALTO<small>${a.shop.name} · ${this.TIER_NAME[this.tierOf(a.shop)]}${Traces.fullMask() ? ' · rosto coberto' : ' · SEM MÁSCARA'} · guarde a arma (1) para comprar</small>${Traces.masked() ? '' : '<br><b>K</b> pôr a máscara'}`;
        }
        if (s.siege) return '';
        if (s.act) return `<b>${s.act.label.toUpperCase()}</b> ${crBar(s.act.t / s.act.dur)}<small>${s.act.stall ? s.act.stall + ' · ' : ''}${this._status()}</small>`;
        const u = this._nearUse(game), h = !u && this._nearHostage(game);
        let line = '';
        if (u) line = `<b>E</b> ${this.LABEL[u.kind]}<small>${this._hint(game, u)} · ${this._status()}</small>`;
        else if (h) line = `<b>E</b> ${h.robbed ? this.LABEL.tie : this.LABEL.wallet}<small>${this._status()}</small>`;
        else if (s.clerk && !s.done.register && this._clerkNear(game)) line = s.clerk.st === 'asleep' ? `<b>E</b> esvaziar o caixa<small>o atendente está dormindo · ${this._status()}</small>` : `<b>E</b> ${this.LABEL.register}<small>ele só abre com medo — fique perto e de frente · ${this._status()}</small>`;
        else line = `<b>ASSALTO</b> ${s.heist && s.heist.window > 0 ? `HACKER ${Math.ceil(s.heist.window)}s` : ''}<small>${this._status()} · saia pela porta para fugir</small>`;
        return line + `<br><b>G</b> gritar${this.gunInHand(game) ? ' <b>ESPAÇO</b> tiro de aviso' : ''}${Traces.masked() ? '' : ' <b>K</b> máscara'}`;
    },
    _hint(game, u) {
        const s = this.session;
        if (u.kind === 'safe') return s.clerk && s.clerk.fear >= 75 && s.done.register ? 'o gerente abre (medo alto)' : `arrombar: ${Items.has(game.inventory, 'furadeira') ? 'com a furadeira' : 'demora (furadeira corta pela metade)'}`;
        if (u.kind === 'dvr') return s.dvr ? 'já arrancado' : 'apaga as câmeras';
        if (u.kind === 'stock') return `${(this.STOCK[s.shop.style] || ['mercadoria'])[0]} (pesado: receptador)`;
        if (u.kind === 'case') return s.heist ? 'vai para o malote da equipe' : 'joias na mochila — o sensor do vidro dispara o alarme';
        return '';
    },
    _status() {
        const s = this.session; if (!s) return '';
        const P = s.police, l = s.loot;
        return `${P ? `🚨 POLÍCIA EM ${Math.max(0, Math.ceil(P.t))}s` : 'ninguém chamou a polícia'} · ${brl(l.cash + l.goods + l.jv)}`;
    },

    // ---------------------------------------------------------------- E (dentro da loja). true = tratou.
    interact(game) {
        const a = Interiors.active; if (!a) return false;
        const s = this.session, pl = game.player;
        if (!s) {
            if (!this.gunInHand(game) || !this._clerkNear(game) || !this.tierOf(a.shop) || this.closedToday(a.shop)) return false;
            const why = this.why(game, a.shop);
            if (why) return false;                                                   // (sem patente: abre a loja normal)
            return this.start(game);
        }
        if (s.siege || s.act || pl.busy) return true;
        const u = this._nearUse(game), h = !u && this._nearHostage(game), R = this.robber(game), sangue = R ? R.skill('sanguefrio') : 0, fast = 1 - 0.07 * sangue;
        if (u) {
            if (u.kind === 'dvr' && s.dvr) { game._flash('O HD já foi arrancado'); return true; }
            let dur = { safe: 18, dvr: 2.5, stock: 3, case: 1.3 }[u.kind] * fast;
            if (u.kind === 'safe') {
                if (s.clerk && s.clerk.fear >= 75 && s.done.register) { dur = 6 * fast; game._flash('"Abre o cofre! Agora!" — o gerente digita a senha tremendo'); }
                else { const el = game.careers ? game.careers.by.burglar.skill('eletronica') : 0; dur *= (Items.has(game.inventory, 'furadeira') ? 0.5 : 1) * (1 - 0.06 * el); }
            }
            this._begin(game, { kind: u.kind, key: u.key, label: this.LABEL[u.kind], dur, u });
            if (u.kind === 'case' && !(s.heist && s.heist.window > 0)) this.callPolice(game, 'O sensor da vitrine disparou o alarme', 0.8, true);
            return true;
        }
        if (h) { this._begin(game, { kind: h.robbed ? 'tie' : 'wallet', label: h.robbed ? this.LABEL.tie : this.LABEL.wallet, dur: h.robbed ? 1.8 : 1.4, h }); return true; }
        if (s.clerk && !s.done.register && this._clerkNear(game)) {
            if (s.clerk.st === 'asleep') { this._begin(game, { kind: 'register', label: 'esvaziar o caixa', dur: 4 * fast }); return true; }      // (golpe furtivo: o atendente dorme — você mesmo abre)
            this._begin(game, { kind: 'register', label: this.LABEL.register, dur: 7 * fast, clerk: true }); game._flash('"O dinheiro do caixa, tudo na sacola!"'); return true;
        }
        return false;
    },

    _begin(game, act) {
        const s = this.session, pl = game.player;
        act.t = 0;
        s.act = act;
        if (!act.clerk) { pl.playAction('rummage', { lock: 0 }); if (pl.action) pl.action.timer = act.dur + 0.2; }
        if (['safe', 'stock', 'case', 'register'].includes(act.kind) && !Traces.gloved()) s.prints = true;
        AudioFX.blip(act.kind === 'case' ? 1400 : 600, 0.08, 0.14);
        if (act.kind === 'case') AudioFX.glass && AudioFX.glass(pl.position.x, pl.position.z);
    },

    _finishAct(game, A) {
        const s = this.session, inv = game.inventory, zone = Economy.zoneOf(s.shop).mul || 1, R = this.robber(game), rnd = () => 0.85 + Math.random() * 0.3;
        const range = (r) => Math.round((r[0] + Math.random() * (r[1] - r[0])) * zone / 10) * 10;
        if (A.kind === 'register') {
            s.done.register = true;
            const ago = typeof WorldMemory !== 'undefined' ? WorldMemory.daysSinceRobbed(s.shop) : null, thin = ago != null && ago <= 10;
            const v = Math.round(range(this.REG[s.tier]) * (thin ? 0.4 : 1) / 10) * 10; inv.addCash(v); s.loot.cash += v;
            game._flash(`💵 Caixa: +${brl(v)}${thin ? ' — depois do último assalto eles quase não deixam dinheiro no caixa' : ''}`); AudioFX.blip(980, 0.12, 0.2);
        } else if (A.kind === 'safe') {
            s.done[A.key] = 1;
            const v = range(this.SAFE[s.tier]);
            if (s.heist) { Heists.take(v, 'cofre'); s.loot.cash += v; } else { inv.addCash(v); s.loot.cash += v; }
            game._flash(`💰 Cofre aberto: +${brl(v)}${s.heist ? ' (no malote)' : ''}`); AudioFX.blip(1100, 0.2, 0.22);
        } else if (A.kind === 'dvr') {
            s.done[A.key] = 1; s.dvr = true;
            game._flash('📹 HD do gravador arrancado: as câmeras não têm mais nada de você');
        } else if (A.kind === 'stock') {
            const S = this.STOCK[s.shop.style] || ['mercadoria', 200, 3], v = Math.round(S[1] * zone * rnd() / 10) * 10, kg = S[2];
            if (Bags.room(game) < kg) { game._flash(`🎒 Não cabe: ${S[0]} pesa ${kg} kg (${Bags.label(game)})`); return; }
            s.done[A.key] = 1;
            const B = game.careers.by.burglar.data; B.goods += v; B.weight += kg; s.loot.goods += v; s.loot.kg += kg;
            game._flash(`📦 ${S[0]} (${brl(v)}, +${kg} kg) — venda no receptador da favela`);
        } else if (A.kind === 'case') {
            s.done[A.key] = 1;
            const n = 2 + Math.floor(Math.random() * 3);
            let got = 0, val = 0;
            for (let i = 0; i < n; i++) {
                const v = Math.round((2400 + Math.random() * 4200) * zone * (s.heist ? s.heist.valueMul || 1 : 1) / 10) * 10;
                if (s.heist) { Heists.take(v, 'joias'); got++; val += v; continue; }
                if (inv.slotsNeeded({ kind: 'jewel' }) > inv.slotsFree()) break;
                inv.addJewel(v); got++; val += v;
            }
            s.loot.jewels += got; s.loot.jv += val;
            game._flash(got ? `💎 Vitrine quebrada: ${got} peças (${brl(val)})${s.heist ? ' no malote' : ''}${got < n ? ' — a mochila encheu' : ''}` : '🎒 Mochila cheia: não cabe mais nenhuma joia');
            AudioFX.blip(1300, 0.1, 0.16);
        } else if (A.kind === 'wallet') {
            const v = Math.round((40 + Math.random() * 380) * zone / 5) * 5; inv.addCash(v); s.loot.cash += v;
            A.h.robbed = true; A.h.fear = Math.min(100, A.h.fear + 10);
            if (game.careers && Math.random() < 0.5) game.careers.onPickpocket({ id: -1 }, game.player.position);      // (às vezes um celular para o Estelionato)
            game._flash(`👛 Carteira do refém: +${brl(v)}`);
        } else if (A.kind === 'tie') {
            if (!Items.take(inv, 'abracadeira', 1)) { game._flash('Sem abraçadeiras'); return; }
            A.h.tied = true; A.h.st = 'tied'; A.h.fear = 100;
            game._flash(`➰ Refém amarrado: esse não foge mais (${Items.count(inv, 'abracadeira')} abraçadeiras)`);
        }
        if (R) R.addXp(A.kind === 'dvr' || A.kind === 'tie' ? 6 : 12);
    },

    // ---------------------------------------------------------------- por quadro (Interiors.update)
    update(dt, game) {
        const s = this.session; if (!s) return;
        s.t += dt;
        if (s.shoutCd > 0) s.shoutCd -= dt;
        this._tickMarkers(game, dt);
        this._hud(game);
        if (s.siege) { this._updateSiege(dt, game); return; }
        const pl = game.player, p = pl.position, H = s.heist;
        if (this.gunInHand(game)) pl.aimTimer = Math.max(pl.aimTimer || 0, 0.25);
        // janela do hacker (golpe): acabou → alarme
        if (H && H.window > 0) { H.window -= dt; if (H.window <= 0) { H.window = 0; this.callPolice(game, 'A janela do hacker fechou: o alarme da joalheria tocou', 1, true); } }
        // polícia (com alarme sonoro tocando, a sirene da loja bipa sem parar)
        if (s.police) {
            s.police.t -= dt;
            if (s.loud) { s.beep = (s.beep || 0) - dt; if (s.beep <= 0) { s.beep = 0.45; s.beepHi = !s.beepHi; AudioFX.alarm(p.x, p.z, s.beepHi); } }
            if (s.police.t <= 0) { this._startSiege(game); return; }
        }
        else if (!H) {                                                                // alguém lá fora vê pela vitrine
            const pOut = (0.004 + 0.003 * s.tier) * (game.dayNight.night ? 0.5 : 1) * dt;
            if (Math.random() < pOut) this.callPolice(game, 'Um pedestre viu o assalto pela vitrine e ligou 190');
        }
        // medo e reações
        const R = this.robber(game), intim = R ? R.skill('intimidacao') : 0, gun = this.gunInHand(game), heading = pl.root.rotation.y;
        const gm = H ? (H.gunman || 0) : 0, decayH = 2.6 * (1 - 0.1 * intim) * [1, 0.75, 0.45, 0][gm];
        for (const h of this.people()) {
            if (h.st === 'gone' || h.st === 'asleep' || h.st === 'tied') continue;
            const dx = h.x - p.x, dz = h.z - p.z, d = hypot(dx, dz);
            let face = Math.abs(((Math.atan2(dx, dz) - heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
            const press = gun && (d < 3 || (d < 5.5 && face < 1.05));
            const up = press ? (h.role === 'hostage' ? 10 : 13) * this._gunMul(game) * (1 + 0.15 * intim) : 0;
            h.fear = Math.max(0, Math.min(100, h.fear + (up - (h.role === 'hostage' ? decayH : 3.2)) * dt));
            if (h.role === 'hostage') this._hostage(game, h, dt, d);
            else this._staff(game, h, dt, d);
        }
        // ação em andamento
        const A = s.act;
        if (A) {
            if (A.clerk) {
                const c = s.clerk, near = this._clerkNear(game, 5.0);
                A.stall = !near ? 'fique perto do caixa' : c.fear < 35 ? 'ELE ESTÁ ENROLANDO — pressione' : '';
                if (!A.stall) A.t += dt;
            } else A.t += dt;
            if (A.t >= A.dur) { s.act = null; this._finishAct(game, A); if (pl.action && pl.action.name === 'rummage') pl.action.timer = 0; }
        }
    },

    _hostage(game, h, dt, d) {
        const s = this.session, o = Interiors.STAGE, door = Interiors.active.data.door, dx = o.x + (door.x0 + door.x1) / 2, dz = o.z + 0.4;
        if (h.st === 'down' && h.fear < 22) { h.st = 'rising'; h.t = 1.8; h.a.play('scared'); game._flash('⚠ Um refém está levantando — grite (G) ou aponte a arma para ele!'); }
        else if (h.st === 'rising') {
            if (h.fear > 38) { h.st = 'down'; h.a.play('kneel'); return; }
            h.t -= dt;
            if (h.t <= 0) { h.st = 'run'; h.a.play('run'); game._flash('🏃 Um refém está correndo para a porta!'); }
        } else if (h.st === 'run') {
            if (h.fear > 70 && d < 6.5) { h.st = 'down'; h.a.play('kneel'); return; }
            const vx = dx - h.x, vz = dz - h.z, L = hypot(vx, vz);
            if (L < 0.5) {
                h.st = 'gone'; h.a.setVisible(false); s.out++;
                this.callPolice(game, 'Um refém fugiu e chamou a polícia', 0.65);
                return;
            }
            const sp = 3.8 * dt / L; h.x += vx * sp; h.z += vz * sp;
            h.a.setPosition(h.x, h.z); h.a.setHeading(Math.atan2(vx, vz));
        }
    },

    _staff(game, h, dt, d) {
        const s = this.session;
        if (h.role === 'clerk' && !s.police && h.fear < 40) {                          // alarme silencioso (escondido atrás do balcão)
            const p = (40 - h.fear) / 40 * 0.3 * (d > 2.6 ? 1.5 : 0.5) * dt;
            if (Math.random() < p) { this.callPolice(game, 'Você viu o atendente apertar o botão do alarme'); h.fear += 15; }
        }
        if (h.armed && s.armedLeft > 0) {
            if (h.st !== 'draw' && h.fear < 28) { h.st = 'draw'; h.t = 1.5; h.a.play('scared'); game._flash(`⚠ ${h.role === 'guard' ? 'O segurança' : 'O balconista'} vai sacar a arma — GRITE (G) ou dê o tiro de aviso!`); AudioFX.blip(240, 0.15, 0.25); }
            else if (h.st === 'draw') {
                if (h.fear > 55) { h.st = 'down'; h.a.play('surrender'); return; }
                h.t -= dt;
                if (h.t <= 0) {
                    s.armedLeft--;
                    const pl = game.player;
                    pl.takeDamage(22 + Math.random() * 14);
                    AudioFX.shot('pistol', h.x, h.z);
                    game.input.rumble && game.input.rumble(0.8, 0.8, 220);
                    h.st = 'down'; h.fear = 70; h.a.play('surrender');
                    game._flash(`💥 ${h.role === 'guard' ? 'O segurança' : 'O balconista'} atirou em você!`);
                    if (!s.police) this.callPolice(game, 'Teve tiro dentro da loja', 0.8);
                }
            }
        }
    },

    // ---------------------------------------------------------------- cerco
    _startSiege(game) {
        const s = this.session;
        s.siege = { turns: 2, grace: 0, breach: 0, msg: 'A polícia cercou a loja. "Solta os reféns e sai com as mãos na cabeça!"' };
        if (s.act) { s.act = null; if (game.player.action) game.player.action.timer = 0; }
        AudioFX.blip(150, 0.7, 0.3);
        this._drawSiege(game);
    },
    _hostagesDown() { const s = this.session; return s ? s.hostages.filter((h) => h.st === 'down' || h.st === 'tied').length + (s.clerk && s.clerk.st !== 'gone' ? 1 : 0) : 0; },
    _updateSiege(dt, game) {
        const S = this.session.siege;
        if (S.breach > 0) { S.breach -= dt; if (S.breach <= 0) { this._end(game, 'busted'); return; } this._drawSiege(game); return; }
        if (S.grace > 0) { S.grace -= dt; if (S.grace <= 0) { S.msg = 'A trégua acabou. O negociador voltou ao telefone.'; this._drawSiege(game); } }
    },
    negotiate(game, how) {
        const s = this.session, S = s && s.siege; if (!S || S.breach > 0 || S.grace > 0) return;
        if (how === 'surrender') { S.breach = 0.01; return; }
        if (how === 'fight') { this._siegeExit = 'fight'; this._hideSiege(); Interiors.leave(game); return; }
        const R = this.robber(game), n = this._hostagesDown(), labia = (SkillTree.m.labia || 0) + (game.careers ? game.careers.by.scam.skill('labia') * 0.05 : 0);
        if (how === 'shield') {
            if (!this.gunInHand(game) || n <= 0) { S.msg = 'Sem refém e sem arma na mão não tem escudo.'; this._drawSiege(game); return; }
            const ok = Math.random() < 0.45 + 0.07 * (R ? R.skill('intimidacao') : 0);
            S.turns--;
            if (ok) { this._siegeExit = 'shield'; this._hideSiege(); game._flash('🛡 Você sai agarrado num refém: a polícia segura o fogo por alguns segundos — corra!'); Interiors.leave(game); return; }
            S.msg = 'Eles não acreditaram que você atiraria no refém.';
        } else {
            const ok = Math.random() < 0.3 + 0.06 * n + labia;
            S.turns--;
            if (ok) { S.grace = 25; S.msg = 'O negociador topou esperar: 25 s de trégua. Termine e saia (com a polícia na porta, saem estrelas).'; this._hideSiege(); game._flash('⏳ Trégua de 25 s — saia pela porta antes que acabe'); return; }
            S.msg = 'O negociador não caiu na conversa.';
        }
        if (S.turns <= 0) { S.breach = 5; S.msg = 'Negociação encerrada: o BOPE vai invadir!'; }
        this._drawSiege(game);
    },
    _drawSiege(game) {
        const s = this.session, S = s && s.siege; if (!S) return;
        if (!this._sp) this._sp = new Panel('robSiege', { width: 560, closable: false, onAct: (a) => this.negotiate(game, a) });
        if (S.grace > 0) return;
        const n = this._hostagesDown(), B = Panel.btn;
        this._sp.show('🚔 CERCADO', S.msg, S.breach > 0 ? `<div style="font:700 26px var(--font-d);color:#ff3a3a;text-align:center">INVASÃO EM ${Math.ceil(S.breach)}s</div>`
            : `<div class="dm-note" style="text-align:center">Tentativas: ${S.turns} · reféns sob controle: ${n} · ${brl(s.loot.cash + s.loot.goods + s.loot.jv)} com você</div>
               <div class="dm-btns" style="flex-direction:column">${B('talk', '🗣 LÁBIA — pedir tempo ao negociador')}${B('shield', '🛡 SAIR COM UM REFÉM DE ESCUDO (precisa de arma e refém)', { on: n > 0 && this.gunInHand(game) })}${B('fight', '🔫 SAIR ATIRANDO (3 estrelas)')}${B('surrender', '🙌 RENDER-SE')}</div>`);
    },
    _hideSiege() { if (this._sp && this._sp.open) { this._sp.open = false; this._sp.root.style.display = 'none'; } },

    // ---------------------------------------------------------------- saída da loja (Interiors._doLeave)
    onLeave(game) {
        const s = this.session; if (!s) return;
        let how = this._siegeExit || (s.siege ? (s.siege.grace > 0 ? 'truce' : 'fight') : (s.police ? 'called' : 'quiet'));
        this._siegeExit = null;
        this._end(game, how);
    },

    // Fim do assalto: how = 'quiet' | 'called' | 'truce' | 'shield' | 'fight' | 'busted'
    _end(game, how) {
        const s = this.session; if (!s) return;
        this.session = null;
        this._hideSiege(); this._hudOn(false); this._markersOff();
        const shop = s.shop, pos = { x: shop.x, z: shop.z }, R = this.robber(game), pm = game.policeManager;
        this.robbedDay[shop.id] = Economy.day; this.count++;
        if (typeof WorldMemory !== 'undefined' && !s.heist) WorldMemory.onRobbed(shop, how, s.loot.cash + s.loot.goods + s.loot.jv);
        for (const h of [s.clerk, s.guard, ...s.hostages]) if (h && h.a) h.a.play('idle');      // (o Interiors repõe posição e visibilidade na próxima loja)
        const awake = [s.clerk, s.guard, ...s.hostages].filter((h) => h && h.st !== 'asleep').length + s.out;
        const total = s.loot.cash + s.loot.goods + s.loot.jv;
        if (how === 'busted') {
            if (Interiors.active) Interiors._doLeave(game);
            game._busted();
            if (s.heist) Heists.onFail(game, 'preso no cerco');
            return;
        }
        // rastros e testemunhas
        const tr = Traces.scene(game, { x: pos.x, z: pos.z, name: shop.name, witnesses: awake, cams: !s.dvr, prints: s.prints, value: total });
        if (tr.length) game._delayed.push({ t: 1.2, fn: () => game._flash(`🧾 Rastros deixados: ${tr.join(', ')}`) });
        // polícia na saída
        if (how === 'quiet') {
            const fearAvg = awake ? [s.clerk, ...s.hostages].filter((h) => h && h.st !== 'gone').reduce((a, h) => a + h.fear, 0) / Math.max(1, awake) : 100;
            const delay = s.heist && s.heist.approach === 'stealth' ? 60 : 6 + fearAvg / 9;
            Traces.call(pos.x, pos.z, delay, s.heist ? 'Acordaram na joalheria e ligaram 190' : 'As testemunhas ligaram 190');
            game._flash(`🤫 Saiu sem ninguém chamar a polícia: as testemunhas vão ligar em ~${Math.round(delay)} s — some da área!`);
        } else if (how === 'called') {
            const left = s.police.t;
            game.wanted.reportCrime(30);
            if (pm) pm.alertNear(pos, 260);
            Traces.startSearch(pos.x, pos.z, 180, 170);
            if (left < 14) { game.wanted.ensureLevel(2); game._flash('🚔 A polícia chegou na hora que você saiu!'); }
            else game._flash(`🚔 Viaturas chegando em ${Math.round(left)} s — some antes que te vejam!`);
        } else if (how === 'truce') {
            game.wanted.ensureLevel(2); if (pm) pm.alertNear(pos, 300);
        } else if (how === 'shield') {
            game.wanted.ensureLevel(2); if (pm) pm.alertNear(pos, 300);
            const keep = Config.police.shootFromStars; Config.police.shootFromStars = 99; if (pm) pm.weaponsFreeUntil = 0;
            game._delayed.push({ t: 9, fn: () => { Config.police.shootFromStars = keep; } });
        } else if (how === 'fight') {
            game.wanted.ensureLevel(3); if (pm) { pm.alertNear(pos, 320); pm.weaponsFreeUntil = pm.time + 30; }
            game._flash('🔫 Saiu atirando: a polícia está na porta!');
        }
        if (s.heist) { Heists.onExit(game, s, how); return; }
        // pagamento em XP e conquistas
        if (R && total > 0) {
            const xp = (70 * s.tier + total / 45) * (how === 'quiet' ? 1.4 : 1) * (s.dvr ? 1.1 : 1);
            R.addXp(xp);
            R.data.robs = (R.data.robs || 0) + 1; R.data.best = Math.max(R.data.best || 0, total); R.data.total = (R.data.total || 0) + total;
            R.onRobbery(shop, how, total);
        }
        if (game.skills) game.skills.addXp(20 * s.tier);
        if (game.achievements && game.achievements.bump) game.achievements.bump('storeRobs');
        if (total > 0) game._delayed.push({ t: 2.6, fn: () => game._flash(`💼 Assalto à ${shop.name}: ${brl(total)} (caixa/cofre ${brl(s.loot.cash)}${s.loot.goods ? `, mercadoria ${brl(s.loot.goods)}` : ''}${s.loot.jv ? `, joias ${brl(s.loot.jv)}` : ''})`) });
    },

    // Morreu/preso no meio (fora da loja não há sessão; dentro, o cerco resolve).
    abort() { if (this.session) { this.session = null; this._hideSiege(); this._hudOn(false); this._markersOff(); } },

    // ---------------------------------------------------------------- marcadores no chão (pontos de saque)
    _markers(game) {
        const s = this.session, o = Interiors.STAGE;
        if (!this._glow) { this._glow = new GlowBatch(game.scene, 24, 'robGlow', 'glow'); for (let i = 0; i < 24; i++) { this._glow.alloc(); this._glow.off(i); } }
        const pts = [];
        const cl = Interiors.active.data.clerk;
        if (cl) pts.push({ key: 'register', x: o.x + cl.x, z: o.z + cl.z - 1.3, col: [1, 0.8, 0.2] });
        for (const u of this._uses()) pts.push({ key: u.key, x: (u.x0 + u.x1) / 2, z: Math.max(u.z0 - 0.5, (u.z0 + u.z1) / 2 - 0.9), col: { safe: [1, 0.75, 0.2], dvr: [0.3, 0.85, 1], stock: [0.4, 1, 0.5], case: [0.85, 0.5, 1] }[u.kind] });
        s.marks = pts.slice(0, 24);
        this._t = 0;
    },
    _tickMarkers(game, dt) {
        const s = this.session, G = this._glow; if (!G || !s.marks) return;
        this._t += dt;
        const k = 0.55 + 0.45 * Math.sin(this._t * 4.5);
        s.marks.forEach((m, i) => {
            const done = m.key === 'register' ? s.done.register : s.done[m.key];
            if (done || s.siege) { G.off(i); return; }
            G.place(i, m.x, 0.22, m.z, 1.1 + 0.25 * k); G.color(i, m.col[0] * k, m.col[1] * k, m.col[2] * k, 0.45);
        });
        G.flush();
    },
    _markersOff() { const G = this._glow; if (!G) return; for (let i = 0; i < 24; i++) G.off(i); G.flush(); },

    // ---------------------------------------------------------------- HUD do assalto (topo da tela)
    _hudOn(on) {
        if (!this._el) {
            const st = document.createElement('style');
            st.textContent = `
                #robHud { position: fixed; left: 50%; top: 64px; transform: translateX(-50%); z-index: 12; min-width: 300px; max-width: min(560px, 94vw); padding: 10px 16px 12px; pointer-events: none;
                    background: rgba(24,6,12,0.82); border: 1px solid rgba(244,63,94,0.55); border-radius: 18px; box-shadow: 0 10px 40px rgba(120,0,20,0.4); font-family: var(--font); color: #fff; display: none; }
                #robHud .rt { display: flex; justify-content: space-between; gap: 12px; font: 700 14px var(--font-d); letter-spacing: .04em; }
                #robHud .rt b { color: #ff6a7a; } #robHud .rt b.calm { color: #fde68a; } #robHud .rt b.hack { color: #67e8f9; }
                #robHud .rr { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #fecdd3; margin-top: 6px; }
                #robHud .rr span { width: 92px; flex: none; } #robHud .rr i { flex: 1; height: 7px; border-radius: 99px; background: rgba(255,255,255,0.1); overflow: hidden; } #robHud .rr i s { display: block; height: 100%; border-radius: 99px; transition: width .2s; }
                #robHud .hs { font-family: var(--emoji); letter-spacing: 3px; font-size: 15px; }
                #robHud .ev { font-size: 11px; color: #fda4af; margin-top: 6px; }
                body.mobile #robHud { left: 8px; top: 8px; transform: none; min-width: 0; width: min(300px, 42vw); padding: 6px 10px; font-size: 11px; } body.mobile #robHud .rt { font-size: 12px; } body.mobile #robHud .rr { margin-top: 3px; font-size: 11px; } body.mobile #robHud .rr span { width: 66px; }`;      /* (no celular, dentro da loja o canto do radar fica livre) */
            document.head.appendChild(st);
            this._el = document.createElement('div'); this._el.id = 'robHud'; document.body.appendChild(this._el);
        }
        this._el.style.display = on ? 'block' : 'none';
        this._hh = '';
    },
    _hud(game) {
        const s = this.session, el = this._el; if (!s || !el) return;
        this._ht = (this._ht || 0) - (game._dt || 0.03);
        if (this._ht > 0) return;
        this._ht = 0.15;
        const P = s.police, H = s.heist, l = s.loot, fearCol = (f) => f > 60 ? '#34d399' : f > 35 ? '#fbbf24' : '#f43f5e';
        const icon = (h) => ({ down: '🙇', tied: '➰', rising: '⚠️', run: '🏃', gone: '❌', asleep: '💤' }[h.st] || '🙇');
        const rows = [];
        const fearRow = (nm, h) => h.st === 'asleep' ? `<div class="rr"><span>${nm}</span><b class="hs">💤</b> dormindo</div>` : `<div class="rr"><span>${nm}</span><i><s style="width:${h.fear}%;background:${fearCol(h.fear)}"></s></i></div>`;
        if (s.clerk) rows.push(fearRow('Atendente', s.clerk));
        if (s.guard) rows.push(fearRow(s.guard.armed ? 'Segurança 🔫' : 'Segurança', s.guard));
        if (s.hostages.length) rows.push(`<div class="rr"><span>Reféns</span><div class="hs">${s.hostages.map(icon).join('')}</div></div>`);
        const ev = [Traces.fullMask() ? '🥷 rosto coberto' : '👤 ROSTO À MOSTRA', s.camsLooped ? '📹 câmeras em loop (hacker)' : s.dvr ? '📹 câmeras apagadas' : '📹 câmeras gravando', s.prints ? '🖐 digitais' : (Traces.gloved() ? '🧤 sem digitais' : '')].filter(Boolean).join(' · ');
        const pol = s.siege ? '<b>CERCADO</b>' : P ? `<b>🚨 POLÍCIA EM ${Math.max(0, Math.ceil(P.t))}s</b>` : H && H.window > 0 ? `<b class="hack">💻 HACKER ${Math.ceil(H.window)}s</b>` : '<b class="calm">sem polícia</b>';
        const html = `<div class="rt"><span>${H ? 'GOLPE' : 'ASSALTO'} · ${s.shop.name}</span>${pol}</div>${rows.join('')}<div class="rr"><span>Na sacola</span><b style="color:#fde68a">${brl(l.cash + l.goods + l.jv)}</b></div><div class="ev">${ev}</div>`;
        if (html !== this._hh) { this._hh = html; el.innerHTML = html; }
    },

    serialize() { return { rd: this.robbedDay, n: this.count }; },
    load(s) { this.robbedDay = (s && s.rd) || {}; this.count = (s && s.n) || 0; this.abort(); },
};
