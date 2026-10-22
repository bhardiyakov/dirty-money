// ============================================================================
// Calendar — o CALENDÁRIO DA CIDADE: dias marcados que mudam a rua, os bares e o que você tem para fazer.
//   ⚽ CLÁSSICO        quarta e domingo, 16h–18h: jogo do Portuários na TV dos bares (placar ao vivo, bar lotado, GOL com grito da
//                      galera). Antes do jogo (8h–16h) dá para APOSTAR no balcão do bar (mesa de jogos › futebol). Vitória do
//                      Portuários: buzinaço e fogos na rua.
//   🔥 FESTA JUNINA    dias 10–12 de cada mês (o mês tem 28 dias), 18h–0h, na praça do morro: fogueira, bandeirinhas, quadrilha
//                      dançando, sanfona e zabumba (som 3D), barraca de comida típica (E: quentão, pamonha, canjica, milho).
//   🎉 BLOCO           na estação do Carnaval (Empire), 15h–20h: um bloco de rua passa perto de você — a multidão andando e sambando
//                      atrás do estandarte, com a bateria tocando de verdade.
//   🎆 RÉVEILLON       último dia do mês, 22h–1h, na orla: a multidão de branco, contagem regressiva e a queima de fogos à meia-noite.
//   📅 AGENDA          aba no celular (próximos 7 dias) e o jornal avisa na véspera. Também lista o torneio de truco e o baile.
// ============================================================================

const Calendar = {
    TEAMS: [['Portuários', 78], ['Rio Seco FC', 70], ['Atlético do Morro', 66], ['Nacional da Orla', 72], ['União Praiana', 62], ['Esporte Clube Ilha', 68]],
    DOW: ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'],
    match: null, bets: [], fest: null, said: {}, record: { w: 0, d: 0, l: 0 },

    // ---------------------------------------------------------------- o que acontece em cada dia
    matchOf(day) {
        if (![2, 6].includes(day % 7)) return null;
        const n = Math.floor(day / 3.5), opp = this.TEAMS[1 + (n % (this.TEAMS.length - 1))], home = day % 7 === 6;
        const P = this.TEAMS[0], H = home ? P : opp, A = home ? opp : P;
        const d = (H[1] + 4 - A[1]) / 32, pH = Math.max(0.15, Math.min(0.7, 0.45 + d * 0.5)), pA = Math.max(0.12, Math.min(0.6, 0.28 - d * 0.45)), pD = Math.max(0.15, 1 - pH - pA);
        const odd = (p) => Math.max(1.25, Math.round(0.92 / p * 10) / 10);
        return { day, home: H[0], away: A[0], sH: H[1], sA: A[1], odds: { home: odd(pH), draw: odd(pD), away: odd(pA) } };
    },
    season() { const g = window.game; return g && g.empire ? g.empire.seasonId : null; },
    eventsOn(day) {
        const out = [], c = day % 28, M = this.matchOf(day);
        if (M) out.push({ id: 'jogo', h0: 16, h1: 18, icon: '⚽', name: `${M.home} × ${M.away}`, where: 'na TV dos bares (aposta no balcão até 16h)' });
        if (c >= 9 && c <= 11) out.push({ id: 'junina', h0: 18, h1: 24, icon: '🔥', name: 'Festa junina', where: 'na praça do morro' });
        if (this._carnaval(day)) out.push({ id: 'bloco', h0: 15, h1: 20, icon: '🎉', name: 'Blocos de carnaval', where: 'nas ruas (passa um perto de você)' });
        if (c === 27) out.push({ id: 'reveillon', h0: 22, h1: 25, icon: '🎆', name: 'Réveillon', where: 'na orla — queima de fogos à meia-noite' });
        if (day % 7 === 5) out.push({ id: 'truco', h0: 19, h1: 23, icon: '🏆', name: 'Torneio de truco', where: 'nos bares (inscrição R$ 500)' });
        if (day % 7 === 4 || day % 7 === 5) out.push({ id: 'baile', h0: 21, h1: 29, icon: '🔊', name: 'Baile funk', where: 'no morro' });
        return out;
    },
    _carnaval(day) {
        const g = window.game, E = g && g.empire;
        if (E && day === Economy.day) return E.seasonId === 'carnaval';
        if (E) { const left = E.seasonLeft, d = day - Economy.day; if (E.seasonId === 'carnaval') return d < left; const nxt = Empire.SEASON_ORDER[(E.season.idx + 1) % Empire.SEASON_ORDER.length]; return nxt === 'carnaval' && d >= left && d < left + 14; }
        return false;
    },
    upcoming(n = 7) {
        const out = [], g = window.game, h = g && g.dayNight ? g.dayNight.hour : 0;
        for (let d = Economy.day; d < Economy.day + n; d++) for (const e of this.eventsOn(d)) { if (d === Economy.day && h >= e.h1) continue; out.push(Object.assign({ day: d }, e)); }
        return out;
    },
    whenTxt(e) {
        const d = e.day - Economy.day, hh = (h) => `${String(h % 24).padStart(2, '0')}h`;
        return `${d === 0 ? 'Hoje' : d === 1 ? 'Amanhã' : this.DOW[e.day % 7][0].toUpperCase() + this.DOW[e.day % 7].slice(1)} · ${hh(e.h0)}–${hh(e.h1)}`;
    },
    liveNow(id) { const g = window.game; if (!g || !g.dayNight) return false; const h = g.dayNight.hour; return this.eventsOn(Economy.day).some((e) => e.id === id && h >= e.h0 && h < e.h1) || (id === 'reveillon' && h < 1 && this.eventsOn(Economy.day - 1).some((e) => e.id === 'reveillon')); },

    onNewDay() {
        const tomorrow = this.eventsOn(Economy.day + 1).filter((e) => ['jogo', 'junina', 'reveillon', 'bloco'].includes(e.id));
        if (typeof News !== 'undefined') for (const e of tomorrow) News.onEvent({ kind: 'agenda', day: Economy.day, text: e.id === 'jogo' ? `Amanhã tem clássico: ${e.name}, às 16h` : e.id === 'junina' ? 'Começa amanhã a festa junina do morro: quadrilha, quentão e fogueira' : e.id === 'reveillon' ? 'Amanhã é Réveillon: prefeitura promete 15 minutos de fogos na orla' : 'Carnaval: blocos tomam as ruas a partir de amanhã' });
        this.said = {};
    },

    // ---------------------------------------------------------------- por quadro
    update(g, dt) {
        if (!g.dayNight || !g.player) return;
        const h = g.dayNight.hour, day = Economy.day;
        // avisos do dia (uma vez)
        for (const e of this.eventsOn(day)) {
            const k = e.id + day;
            if (!this.said[k] && h >= e.h0 - 1 && h < e.h0 && ['jogo', 'junina', 'reveillon', 'bloco'].includes(e.id)) {
                this.said[k] = true;
                g._flash(`${e.icon} ${e.id === 'jogo' ? `Às 16h: ${e.name} — assista num bar (e aposte no balcão até começar)` : `${e.name} ${e.where}, a partir das ${e.h0}h`}`);
            }
        }
        this._matchUpdate(g, dt, h, day);
        this._festUpdate(g, dt, h, day);
    },

    // ---------------------------------------------------------------- futebol
    _matchUpdate(g, dt, h, day) {
        const info = this.matchOf(day);
        if (info && h >= 16 && h < 18 && (!this.match || this.match.day !== day)) {
            const pois = (l) => { let k = 0, p = Math.exp(-l), s = p, u = Math.random(); while (u > s && k < 7) { k++; p *= l / k; s += p; } return k; };
            const gh = pois(1.25 + (info.sH - info.sA) / 40), ga = pois(1.0 - (info.sH - info.sA) / 50), goals = [];
            for (let i = 0; i < gh; i++) goals.push({ min: 1 + Math.floor(Math.random() * 90), side: 'home' });
            for (let i = 0; i < ga; i++) goals.push({ min: 1 + Math.floor(Math.random() * 90), side: 'away' });
            goals.sort((a, b) => a.min - b.min);
            this.match = Object.assign({}, info, { goals, shown: 0, H: 0, A: 0, over: false });
            if (this._inBar(g)) g._flash(`⚽ Começou! ${info.home} × ${info.away}`);
        }
        const M = this.match;
        if (!M || M.over || M.day !== day) return;
        const min = Math.min(90, Math.floor((h - 16) / 2 * 90));
        while (M.shown < M.goals.length && M.goals[M.shown].min <= min) {
            const G = M.goals[M.shown++]; if (G.side === 'home') M.H++; else M.A++;
            const ours = (G.side === 'home') === (M.home === 'Portuários');
            if (this._inBar(g)) {
                g._flash(`⚽ GOL ${G.side === 'home' ? 'do ' + M.home : 'do ' + M.away}! ${M.home} ${M.H} × ${M.A} ${M.away} (${G.min}')`);
                this._crowd(g, ours);
            }
        }
        if (h >= 18) {
            M.over = true;
            const res = M.H > M.A ? 'home' : M.H < M.A ? 'away' : 'draw', P = 'Portuários', won = (res === 'home' && M.home === P) || (res === 'away' && M.away === P);
            this.record[won ? 'w' : res === 'draw' ? 'd' : 'l']++;
            const txt = `Futebol: ${M.home} ${M.H} × ${M.A} ${M.away}${won ? ' — festa da torcida do Portuários' : res === 'draw' ? ' — empate no clássico' : ''}`;
            if (typeof News !== 'undefined') News.onEvent({ kind: 'futebol', day, text: txt });
            for (const b of this.bets.filter((q) => q.day === day)) {
                if (b.pick === res) { const pay = Math.round(b.amt * b.odds); if (typeof Ledger !== 'undefined') Ledger.hold('Apostas no futebol', 1); g.inventory.cash += pay; g._flash(`⚽ Aposta certa (${M.home} ${M.H} × ${M.A} ${M.away}): +${brl(pay)}`); AudioFX.blip(880, 0.12, 0.2); }
                else g._flash(`⚽ ${M.home} ${M.H} × ${M.A} ${M.away}: você perdeu a aposta de ${brl(b.amt)}`);
            }
            this.bets = this.bets.filter((q) => q.day !== day);
            if (won && !Interiors.active && g.fireworks) { this._honk = 8; for (let k = 0; k < 4; k++) setTimeout(() => { const P2 = g.player.position, a = Math.random() * 6.28; g.fireworks.launch(P2.x + Math.cos(a) * 40, P2.z + Math.sin(a) * 40, 1); }, 1500 + k * 900); }
            if (this._inBar(g)) this._crowd(g, won);
        }
        if (this._honk > 0) { this._honk -= dt; if (Math.random() < dt * 1.5 && typeof Ambience !== 'undefined' && Ambience._honk && !Interiors.active) { const P = g.player.position, a = Math.random() * 6.28; Ambience._honk(P.x + Math.cos(a) * 30, P.z + Math.sin(a) * 30); } }
    },
    _inBar(g) { return Interiors.active && typeof News !== 'undefined' && News.TV_STYLES.includes(Interiors.active.shop.style); },
    _crowd(g, cheer) {
        const P = g.player.position;
        if (typeof AudioFX !== 'undefined' && AudioFX._burst) for (let k = 0; k < (cheer ? 6 : 2); k++) AudioFX._burst(P.x, P.z, { vol: cheer ? 0.35 : 0.15, dur: cheer ? 1.6 : 0.8, f0: 1400, f1: 500, type: 'bandpass', q: 0.7, delay: k * 0.12, att: 0.15, maxDist: 40 });
        if (typeof ShopLife !== 'undefined' && ShopLife.active && typeof Bubbles !== 'undefined') {
            const A = ShopLife.agents.filter((a) => a.role === 'customer' && a.actor);
            for (const a of A.slice(0, 4)) Bubbles.say(a.actor, cheer ? this._pick(['GOOOOOL!', 'É DO PORTUÁRIOS!', 'Chupa, Rio Seco!', 'UHUUUL!']) : this._pick(['Não acredito…', 'Juiz ladrão!', 'Que zaga é essa?!']), { tone: cheer ? 'shout' : 'angry', ms: 2200, y: 2.2 });
        }
    },
    _pick(a) { return a[Math.floor(Math.random() * a.length)]; },
    tvLive() {
        const M = this.match, g = window.game; if (!M || M.over || !g || M.day !== Economy.day) return null;
        const min = Math.min(90, Math.floor((g.dayNight.hour - 16) / 2 * 90));
        return `⚽ AO VIVO: ${M.home} ${M.H} × ${M.A} ${M.away} · ${min}'`;
    },
    // Movimento extra nos bares durante o jogo (ShopLife.targetCustomers).
    demandBoost(style, h) { return style === 'bar' && this.matchOf(Economy.day) && h >= 15.3 && h < 18.6 ? 0.95 : 0; },

    // Apostas no balcão (BarGames.table).
    betOpen() { const g = window.game; return !!this.matchOf(Economy.day) && g && g.dayNight.hour >= 8 && g.dayNight.hour < 16; },
    betCard() {
        if (!this.betOpen()) return null;
        const M = this.matchOf(Economy.day), mine = this.bets.filter((b) => b.day === Economy.day);
        return { title: `Apostar no clássico: ${M.home} × ${M.away}`, sub: mine.length ? `Sua aposta: ${mine.map((b) => `${brl(b.amt)} no ${b.pick === 'draw' ? 'empate' : M[b.pick]}`).join(', ')}` : `Começa às 16h · ${M.home} ${M.odds.home} · empate ${M.odds.draw} · ${M.away} ${M.odds.away}` };
    },
    betPanel(game) {
        const M = this.matchOf(Economy.day); if (!M) return;
        if (!this._bp) this._bp = new Panel('calBet', { width: 520, onAct: (a, arg) => this._bet(game, a, arg) });
        this._sel = this._sel || 'home';
        const pk = (k, label) => Panel.btn('pick', `${label} · paga ${M.odds[k]}×`, { arg: k, on: this._sel === k });
        this._bp.show(`⚽ ${M.home} × ${M.away}`, `Hoje às 16h · retrospecto do Portuários: ${this.record.w}V ${this.record.d}E ${this.record.l}D`,
            `<div style="display:flex;flex-direction:column;gap:6px">${pk('home', M.home)}${pk('draw', 'Empate')}${pk('away', M.away)}</div>
             <p style="margin:12px 0 6px">Quanto? (dinheiro vivo: ${brl(game.inventory.cash)})</p>
             <div style="display:flex;gap:6px;flex-wrap:wrap">${[200, 1000, 5000, 20000].map((v) => Panel.btn('amt', brl(v), { arg: v, pri: true })).join('')}</div>`);
    },
    _bet(game, a, arg) {
        if (a === 'pick') { this._sel = arg; this.betPanel(game); return; }
        if (a !== 'amt') return;
        const M = this.matchOf(Economy.day), amt = +arg;
        if (!this.betOpen()) { this._bp.msg('As apostas fecharam: o jogo já começou', false); return; }
        if (game.inventory.cash < amt) { this._bp.msg('Dinheiro vivo insuficiente', false); return; }
        game.inventory.cash -= amt;
        this.bets.push({ day: Economy.day, pick: this._sel, amt, odds: M.odds[this._sel] });
        this._bp.msg(`Apostado: ${brl(amt)} no ${this._sel === 'draw' ? 'empate' : M[this._sel]} (paga ${brl(Math.round(amt * M.odds[this._sel]))})`);
    },

    // ---------------------------------------------------------------- festas na rua (cenário + gente + som)
    _festUpdate(g, dt, h, day) {
        let want = this.liveNow('junina') ? 'junina' : this.liveNow('reveillon') ? 'reveillon' : this.liveNow('bloco') ? 'bloco' : null;
        if (!want && this.fest && this.fest.kind === 'reveillon' && h < 1) want = 'reveillon';          // (a virada: a festa segue até 1h, mesmo antes do dia virar no calendário)
        const F = this.fest;
        if (F && (F.kind !== want || Interiors.active || (F.x != null && hypot(F.x - g.player.position.x, F.z - g.player.position.z) > 320))) { this._festEnd(); }
        if (!this.fest && want && !Interiors.active && g.aiReady) {
            this._fT = (this._fT || 0) - dt;
            if (this._fT <= 0) { this._fT = 1.5; try { this['_start_' + want](g); } catch (e) { console.warn('[CALENDÁRIO]', want, e); this._festEnd(); } }
        }
        if (this.fest) this['_upd_' + this.fest.kind](g, dt, this.fest);
    },
    _festEnd() {
        const F = this.fest; this.fest = null; if (!F) return;
        for (const a of F.actors || []) { try { a.dispose(); } catch (e) { /* ok */ } }
        for (const m of F.meshes || []) { try { m.dispose(); } catch (e) { /* ok */ } }
        if (F.light) F.light.dispose();
    },
    _mat(sc, c, emis = false) { return FlatMat.get(sc, c, emis); },
    _crowd(n, min = 4) { return Math.max(min, Math.round(n * (typeof Life !== 'undefined' ? Life.mul() : 1))); },      // (vida da cidade baixa: festa mais vazia)
    _box(F, sc, w, hh, d, x, y, z, c, emis) { const b = BABYLON.MeshBuilder.CreateBox('calBox', { width: w, height: hh, depth: d }, sc); b.position.set(x, y, z); b.material = this._mat(sc, c, emis); b.isPickable = false; F.meshes.push(b); return b; },
    _walkPt(g, x, z, r = 6) { const M = g.nav.map; const q = M.closestPoint(x, z, r); return q && M.walk(q.x, q.z) ? q : null; },
    _tone(x, z, f, dur, vol, type = 'sawtooth', maxDist = 70) {
        const A = typeof AudioFX !== 'undefined' ? AudioFX : null; if (!A || !A._ok || !A._ok()) return;
        const sp = A._spatial(x, z, maxDist, vol); if (!sp) return;
        const ctx = A.ctx, t0 = ctx.currentTime, o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), gn = ctx.createGain();
        o.type = type; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = 1800;
        gn.gain.setValueAtTime(0.0008, t0); gn.gain.exponentialRampToValueAtTime(sp.g, t0 + 0.03); gn.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
        o.connect(lp); lp.connect(gn); gn.connect(A.master); o.start(t0); o.stop(t0 + dur + 0.05);
    },

    // 🔥 festa junina: na praça do morro (perto da entrada, onde todo mundo chega)
    _start_junina(g) {
        if (typeof Standing === 'undefined') return;
        const P = g.player.position, b = Standing._bounds();
        let s = null;
        let best = -1;                                                  // (a praça: o ponto do morro com mais chão livre em volta)
        for (let k = 0; k < 90; k++) {
            const x = b.x1 - (0.08 + Math.random() * 0.3) * (b.x1 - b.x0), z = b.z0 + 30 + Math.random() * (b.z1 - b.z0 - 60), q = this._walkPt(g, x, z, 5);
            if (!q || !Standing.inFavela(q.x, q.z)) continue;
            let n = 0; for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) if (g.nav.map.walk(q.x + i * 2, q.z + j * 2)) n++;
            if (n > best) { best = n; s = q; }
        }
        if (!s || hypot(s.x - P.x, s.z - P.z) > 300) return;
        const sc = g.scene, F = this.fest = { kind: 'junina', x: s.x, z: s.z, actors: [], meshes: [], dancers: [], beat: 0, step: 0, singT: 3 };
        // fogueira
        const fire = BABYLON.MeshBuilder.CreateCylinder('calFire', { diameterTop: 0, diameterBottom: 1.4, height: 1.3, tessellation: 8 }, sc); fire.position.set(s.x, 0.65, s.z); fire.material = this._mat(sc, '#ff7a1a', true); fire.isPickable = false; F.meshes.push(fire); F.fire = fire;
        this._box(F, sc, 1.8, 0.25, 0.3, s.x, 0.12, s.z, '#5b3a1e'); this._box(F, sc, 0.3, 0.25, 1.8, s.x, 0.12, s.z, '#5b3a1e');
        F.light = new BABYLON.PointLight('calFireL', new BABYLON.Vector3(s.x, 2, s.z), sc); F.light.diffuse = new BABYLON.Color3(1, 0.55, 0.2); F.light.range = 14; F.light.intensity = 1.2;
        // bandeirinhas: 4 varais em zigue-zague
        const cols = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];
        const byCol = {};                                               // (uma malha por cor: 6 desenhos em vez de 68)
        for (let r = 0; r < 4; r++) for (let k = -8; k <= 8; k++) { const a = r * Math.PI / 4, x = s.x + Math.cos(a) * k * 0.9, z = s.z + Math.sin(a) * k * 0.9, col = cols[(k + 8 + r) % cols.length]; const b = BABYLON.MeshBuilder.CreateBox('calFlagB', { width: 0.32, height: 0.02, depth: 0.32 }, sc); b.position.set(x, 3.1 - Math.abs(k) * 0.03, z); (byCol[col] || (byCol[col] = [])).push(b); }
        for (const [col, L] of Object.entries(byCol)) { const m = BABYLON.Mesh.MergeMeshes(L, true); if (m) { m.material = this._mat(sc, col); m.isPickable = false; m.freezeWorldMatrix(); F.meshes.push(m); } }
        // barraca de comida
        const bx = s.x + 6, bz = s.z + 4; this._box(F, sc, 2.2, 0.9, 1.0, bx, 0.45, bz, '#c2a36b'); this._box(F, sc, 2.6, 0.1, 1.4, bx, 2.0, bz, '#dc2626'); F.stall = { x: bx, z: bz };
        F.actors.push(StreetLife._actor(g, 'civil_vovo', bx, bz - 1, 0));
        // sanfoneiro e zabumbeiro
        F.actors.push(StreetLife._actor(g, StreetLife._civ(), s.x - 5, s.z - 3, Math.atan2(5, 3))); F.actors.push(StreetLife._actor(g, StreetLife._civ(), s.x - 5.8, s.z - 2, Math.atan2(5.8, 2)));
        // quadrilha: duas filas de 6, frente a frente, indo e voltando
        const nq = this._crowd(12, 6), half = Math.ceil(nq / 2);
        for (let i = 0; i < nq; i++) {
            const side = i < half ? -1 : 1, k = i % half, x = s.x - 4 + k * 1.6, z = s.z + side * 2.6 - 4;
            const a = StreetLife._actor(g, StreetLife._civ(), x, z, side < 0 ? 0 : Math.PI, 'walk');
            F.actors.push(a); F.dancers.push({ a, x, z, side, ph: k * 0.5 });
        }
        g._flash('🔥 Festa junina na praça do morro: quadrilha, fogueira e quentão!');
    },
    _upd_junina(g, dt, F) {
        for (const a of F.actors) a.update(dt, 0.7);
        F.t = (F.t || 0) + dt;
        const cyc = (F.t % 8) / 8, approach = Math.sin(cyc * Math.PI * 2);           // anavantu / anarriê
        for (const d of F.dancers) { d.a.setPosition(d.x + Math.sin(F.t * 2 + d.ph) * 0.2, d.z - d.side * approach * 1.1); d.a.setHeading((d.side < 0 ? 0 : Math.PI) + Math.sin(F.t * 3 + d.ph) * 0.3); }
        if (F.fire) { const f = 1 + Math.sin(F.t * 13) * 0.06 + Math.sin(F.t * 7.3) * 0.05; F.fire.scaling.set(f, 1 + Math.sin(F.t * 9) * 0.08, f); if (F.light) F.light.intensity = 1.1 + Math.sin(F.t * 11) * 0.25; }
        // forró (~120 bpm em colcheias): zabumba, triângulo e a sanfona nos acordes (I–IV–V–I em sol)
        F.beat += dt; const S = 60 / 120 / 2, CH = [[196, 247, 294], [262, 330, 392], [294, 370, 440], [196, 247, 294]];
        while (F.beat >= S) {
            F.beat -= S; const i = F.step++ % 16, bar = Math.floor(F.step / 16) % 4;
            if (!AudioFX._burst) continue;
            if (i % 4 === 0) AudioFX._burst(F.x, F.z, { vol: 0.45, dur: 0.2, f0: 120, f1: 45, maxDist: 75 });
            if (i % 4 === 3) AudioFX._burst(F.x, F.z, { vol: 0.25, dur: 0.12, f0: 220, f1: 90, maxDist: 75 });
            AudioFX._burst(F.x, F.z, { vol: i % 2 ? 0.05 : 0.1, dur: i % 2 ? 0.05 : 0.18, f0: 6200, f1: 5800, type: 'bandpass', q: 18, maxDist: 55 });
            if (i % 4 === 0 || i % 4 === 2) for (const f of CH[bar]) this._tone(F.x - 5, F.z - 3, f, 0.26, 0.05);
        }
        F.singT -= dt;
        if (F.singT <= 0) { F.singT = 5 + Math.random() * 5; const a = this._pick(F.actors); if (a) Bubbles.say(a, this._pick(['Anarriê!', 'Olha a cobra! — É mentira!', '♪ Olha pro céu, meu amor… ♪', 'Balancê!', 'Olha a chuva! — Já passou!', '♪ Pula a fogueira, Iaiá… ♪']), { ms: 2600 }); }
    },
    FOOD: [['quentao', '🍶 Quentão', 8, 120, 2], ['pamonha', '🌽 Pamonha', 7, 320, 6], ['canjica', '🥣 Canjica', 6, 300, 5], ['pipoca', '🍿 Pipoca', 4, 150, 2], ['pacoca', '🥜 Paçoca', 2, 110, 1]],

    // 🎉 bloco de carnaval: anda pela rua perto de você
    _start_bloco(g) {
        const P = g.player.position, M = g.nav.map;
        for (let k = 0; k < 30; k++) {
            const a = Math.random() * 6.28, r = 50 + Math.random() * 60, s = this._walkPt(g, P.x + Math.cos(a) * r, P.z + Math.sin(a) * r, 6); if (!s) continue;
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => Math.random() - 0.5)) {
                let n = 0; while (n < 18 && M.walk(s.x + dx * (n + 1) * 8, s.z + dz * (n + 1) * 8)) n++;
                if (n < 10) continue;
                const sc = g.scene, F = this.fest = { kind: 'bloco', x: s.x, z: s.z, sx: s.x, sz: s.z, dx, dz, len: n * 8, pos: 0, dir: 1, actors: [], meshes: [], dancers: [], beat: 0, step: 0, singT: 2 };
                F.name = this._pick(['Bloco do Vira-Lata', 'Simpatia é Quase Amor', 'Cordão do Bola Preta', 'Bloco das Piranhas', 'Suvaco do Cristo', 'Bloco da Orla']);
                const flag = BABYLON.MeshBuilder.CreatePlane('calFlag', { width: 1.6, height: 1.1 }, sc); flag.material = FlatMat.get(sc, this._pick(['#f59e0b', '#16a34a', '#db2777', '#2563eb']), true, true); flag.isPickable = false; F.meshes.push(flag); F.flag = flag;
                for (let i = 0, nb = this._crowd(20, 8); i < nb; i++) { const a2 = StreetLife._actor(g, StreetLife._civ(), s.x, s.z, 0, 'walk'); F.actors.push(a2); F.dancers.push({ a: a2, ox: (Math.random() - 0.5) * 5, oz: -1.5 - Math.random() * 9, ph: Math.random() * 6.28 }); }
                g._flash(`🎉 O ${F.name} está passando aqui perto!`);
                return;
            }
        }
    },
    _upd_bloco(g, dt, F) {
        F.t = (F.t || 0) + dt;
        F.pos += F.dir * dt * 1.1;
        if (F.pos > F.len) { F.pos = F.len; F.dir = -1; } else if (F.pos < 0) { F.pos = 0; F.dir = 1; }
        const dx = F.dx * F.dir, dz = F.dz * F.dir, px = -dz, pz = dx;
        F.x = F.sx + F.dx * F.pos; F.z = F.sz + F.dz * F.pos;
        const head = Math.atan2(dx, dz);
        if (F.flag) { F.flag.position.set(F.x, 2.6, F.z); F.flag.rotation.y = head + Math.PI / 2; F.flag.rotation.x = Math.PI / 2.4; }
        for (const d of F.dancers) {
            const x = F.x + dx * d.oz + px * d.ox, z = F.z + dz * d.oz + pz * d.ox;
            d.a.setPosition(x + Math.sin(F.t * 3 + d.ph) * 0.15, z); d.a.setHeading(head + Math.sin(F.t * 2.5 + d.ph) * 0.5); d.a.update(dt, 0.9);
        }
        // bateria do bloco (~126 bpm): surdos, caixa e tamborim
        F.beat += dt; const S = 60 / 126 / 4;
        while (F.beat >= S) {
            F.beat -= S; const i = F.step++ % 16;
            if (!AudioFX._burst) continue;
            if (i === 4 || i === 12) AudioFX._burst(F.x, F.z, { vol: 0.6, dur: 0.24, f0: 130, f1: 40, maxDist: 90 });
            if (i === 0 || i === 8) AudioFX._burst(F.x, F.z, { vol: 0.4, dur: 0.18, f0: 170, f1: 55, maxDist: 90 });
            AudioFX._burst(F.x, F.z, { vol: [2, 6, 10, 14].includes(i) ? 0.16 : 0.08, dur: 0.06, f0: 2600, f1: 1800, type: 'bandpass', q: 1.2, maxDist: 70 });
            if ([0, 3, 6, 10, 12].includes(i)) AudioFX._burst(F.x, F.z, { vol: 0.12, dur: 0.04, f0: 3300, f1: 2900, type: 'bandpass', q: 4, maxDist: 70 });
        }
        F.singT -= dt;
        if (F.singT <= 0) { F.singT = 4 + Math.random() * 4; const d = this._pick(F.dancers); if (d) Bubbles.say(d.a, this._pick(['♪ Ô abre alas, que eu quero passar ♪', '♪ Mamãe eu quero, mamãe eu quero mamar ♪', '♪ Allah-la-ô, ô ô ô ♪', '♪ Cidade maravilhosa… ♪', 'É CARNAVAAAL!', '♪ Me dá um dinheiro aí! ♪']), { ms: 2600 }); }
    },

    // 🎆 Réveillon na orla
    _start_reveillon(g) {
        const P = g.player.position;
        let best = null, bd = 1e9;
        for (const b of CityGrid.blocks || []) if (b.biome === 'beach') { const cx = (b.slab[0] + b.slab[2]) / 2, cz = (b.slab[1] + b.slab[3]) / 2, d = hypot(cx - P.x, cz - P.z); if (d < bd) { bd = d; best = { x: cx, z: cz }; } }
        if (!best || bd > 300) return;
        const s = this._walkPt(g, best.x, best.z, 20) || best;
        const F = this.fest = { kind: 'reveillon', x: s.x, z: s.z, actors: [], meshes: [], dancers: [], count: null, show: 0, fireT: 0 };
        for (let i = 0, nr = this._crowd(34, 10); i < nr; i++) { const a = Math.random() * 6.28, r = 2 + Math.random() * 14, x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r; const act = StreetLife._actor(g, this._pick(['civil_praia', 'civil_senhor', 'civil_executiva', 'civil_estudante', 'civil_vovo', 'civil_trancas']), x, z, Math.random() * 6.28, 'idle'); F.actors.push(act); F.dancers.push({ a: act, x, z, ph: Math.random() * 6.28 }); }
        g._flash('🎆 Réveillon na orla: a multidão está esperando a meia-noite!');
    },
    _upd_reveillon(g, dt, F) {
        F.t = (F.t || 0) + dt;
        for (const d of F.dancers) { d.a.setPosition(d.x + Math.sin(F.t * 1.5 + d.ph) * 0.1, d.z); d.a.update(dt, 0.6); }
        const h = g.dayNight.hour;
        if (F.count == null && h >= 23.66 && !F.done) { F.count = 10; F.ct = 0; }
        if (F.count != null && F.count > 0) {
            F.ct -= dt;
            if (F.ct <= 0) { F.ct = 1; const a = this._pick(F.dancers); if (a) Bubbles.say(a.a, `${F.count}!`, { tone: 'shout', ms: 900, key: 'cd' }); g._flash(`🎆 ${F.count}…`); F.count--; if (F.count === 0) { F.show = 70; F.done = true; g._flash('🎆 FELIZ ANO NOVO!'); for (const d of F.dancers.slice(0, 6)) Bubbles.say(d.a, this._pick(['FELIZ ANO NOVO!', 'Uhuuul!', 'Saúde e dinheiro!', 'Que venha o ano!']), { tone: 'shout', ms: 2600 }); } }
        }
        if (F.show > 0 && g.fireworks) {
            F.show -= dt; F.fireT -= dt;
            if (F.fireT <= 0) { F.fireT = 0.35 + Math.random() * 0.4; const a = Math.random() * 6.28, r = 10 + Math.random() * 30; g.fireworks.launch(F.x + Math.cos(a) * r, F.z + Math.sin(a) * r, 1); }
        }
    },

    // Barraca da festa junina (E perto dela).
    prompt(g) {
        const F = this.fest; if (!F || F.kind !== 'junina' || !F.stall || g.mode !== 'player') return '';
        return hypot(F.stall.x - g.player.position.x, F.stall.z - g.player.position.z) < 2.6 ? '<b>E</b> barraca da festa junina<small>quentão, pamonha, canjica, pipoca, paçoca</small>' : '';
    },
    interact(g) {
        if (!this.prompt(g)) return false;
        if (!this._fp) this._fp = new Panel('calFood', { width: 420, onAct: (a, arg) => this._buy(g, arg) });
        this._fp.show('🔥 Barraca da festa', 'Tudo feito pela Dona Lurdes', this.FOOD.map(([id, label, price]) => Panel.btn('buy', `${label} — ${brl(price)}`, { arg: id })).join(''));
        return true;
    },
    _buy(g, id) {
        const it = this.FOOD.find((q) => q[0] === id); if (!it) return;
        const [, label, price, kcal, heal] = it, inv = g.inventory, pl = g.player;
        if (inv.cash < price) { this._fp.msg('Dinheiro insuficiente', false); return; }
        inv.cash -= price;
        if (typeof Physique !== 'undefined') Physique.eat(kcal);
        if (id === 'quentao' && typeof Needs !== 'undefined') Needs.onEat('quentao', 60);
        pl.hp = Math.min(pl.maxHp, pl.hp + heal);
        this._fp.msg(`${label}: uma delícia! (−${brl(price)})`);
    },

    agendaHtml(esc) {
        const L = this.upcoming(7);
        if (!L.length) return '<p style="color:#94a3b8;text-align:center;margin-top:30px">Nada marcado.</p>';
        return L.map((e) => `<div class="ct" style="cursor:default"><span class="av">${e.icon}</span><span style="flex:1;min-width:0"><b>${esc(e.name)}</b><small>${this.whenTxt(e)} · ${esc(e.where)}</small></span></div>`).join('');
    },

    serialize() { return { bets: this.bets, record: this.record }; },
    load(s) { this._festEnd(); this.match = null; this.bets = (s && s.bets) || []; this.record = (s && s.record) || { w: 0, d: 0, l: 0 }; this.said = {}; },
};
Economy.onDay(() => Calendar.onNewDay());
