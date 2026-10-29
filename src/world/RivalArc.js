// ============================================================================
// RivalArc — o ARCO DO DENTINHO: o rival do bar (Phone) entra no crime e disputa a cidade com você.
//   1. EXPANSÃO   alguns dias depois do primeiro encontro, ele avisa que "entrou no movimento" e abre uma BOCA num bairro do asfalto
//                 (mesa, guarda-sol e 3–5 capangas armados de vigia). A cada poucos dias abre outra (até 4). Cada boca viva:
//                 cobra pedágio dos seus soldados naquele distrito (o cofre do galpão perde) e o comércio de lá encarece (taxa dele).
//                 Chegou perto: os capangas avisam ("Rala!") e, se você insistir ou atacar, abrem fogo.
//   2. GUERRA     estourar uma boca (derrubar os vigias e apertar E na mesa: o dinheiro do movimento é seu) declara a guerra:
//                 os capangas passam a atirar de cara, e o "bonde" dele te embosca na rua um tempo depois de cada boca perdida.
//   3. CONFRONTO  com 3 bocas estouradas e nenhuma de pé, ele te chama para o GALPÃO do porto: 6 capangas e ele, de fuzil.
//                 Ferido, ele se rende — e você decide: ACABAR com ele, EXPULSAR da cidade ou fazer dele SÓCIO (ele reabre duas bocas
//                 e te repassa uma parte todo dia… e pode te trair).
//   Ex-rival (Phone.rival.friend, perdeu 3× para você na sinuca): em vez de declarar guerra, ele já chega oferecendo sociedade.
// Os capangas são PoliceOfficer (gang1–3) dentro de game.gangs.members (combate, mira, atropelamento, explosões já funcionam), mas
// quem manda neles é este arquivo (u.crew = true: o GangManager não mexe).
// ============================================================================

const RivalArc = {
    phase: 0,            // 0 nada · 1 expansão · 2 guerra · 3 confronto (galpão) · 4 resolvido
    bocas: [], razed: 0, outcome: null, partner: null, ambush: null, qg: null, startDay: null, nextOpen: 0, offer: false,
    members: [], time: 0, provoked: 0, _st: 0, _chk: 0, _nid: 9000,

    // ---------------------------------------------------------------- interface do PoliceOfficer (como o GangManager)
    get game() { return window.game; },
    get nav() { return window.game.nav; },
    get combat() { return window.game.combat; },
    get weaponsFree() { return true; },
    moveSpread: 1,
    get events() {
        return this._events || (this._events = {
            onOfficerHit: (o, source) => { if (source === 'player') this._hit(o); },
            onOfficerKilled: (o, source) => { if (source === 'player' || (source !== 'police' && source !== 'gang')) this.game.pickups.dropLoot(o.position, 'gang'); if (source === 'player') this._killed(o); },
        });
    },
    groupDest(o) {
        const G = o.group, a = (o.slot / Math.max(1, G.size)) * Math.PI * 2 + this.time * 0.04, r = G.ring || 3;
        o.dest = this.nav.closestPoint(new BABYLON.Vector3(G.x + Math.cos(a) * r, 0, G.z + Math.sin(a) * r));
        this.nav.crowd.agentGoto(o.index, o.dest);
        o._wanderTimer = 4 + Math.random() * 3;
    },

    // ---------------------------------------------------------------- estado
    alive() { return this.bocas.filter((b) => !b.razed); },
    dName(d) { const e = this.game && this.game.empire; return e ? e.dName(d) : d; },
    active() { return this.phase > 0 && this.phase < 4 || (this.outcome === 'partner'); },
    msg(text, actions = null, quiet = false) { if (typeof Phone !== 'undefined') Phone._msg('dentinho', text, actions, quiet); },

    // ---------------------------------------------------------------- começo e dia a dia
    _maybeStart(g) {
        if (this.phase !== 0 || this.outcome || typeof Phone === 'undefined') return;
        const R = Phone.rival, met = R.w + R.l >= 1;
        if (!(Economy.day >= 3 && met) && Economy.day < 6) return;
        if (R.friend) {
            if (this.offer) return;
            this.offer = true;
            this.msg('Parceiro, tô entrando no movimento: vou abrir uns pontos no asfalto. Você é o único que eu respeito por aqui. Bora ser sócio? Eu toco, você leva uma parte.',
                [{ label: 'Fechado, sócio', act: 'arcPartner' }, { label: 'Tô fora — e não pisa no meu caminho', act: 'arcWar' }]);
            return;
        }
        this.phase = 1; this.startDay = Economy.day;
        const b = this._openBoca(g);
        this.msg(b ? `Agora eu tô no movimento, freguês 😁 Abri minha boca em ${this.dName(b.d)}. Fica longe que é melhor pra você.` : 'Agora eu tô no movimento, freguês 😁 Fica esperto.');
    },
    onPhoneAct(act) {
        const g = this.game;
        if (act === 'arcPartner') { this._partner(g, 'oferta'); return 'Fechado, sócio.'; }
        if (act === 'arcWar') { this.phase = 1; this.startDay = Economy.day; const b = this._openBoca(g); this.msg(b ? `Pena. Então cada um no seu canto: minha boca é em ${this.dName(b.d)}.` : 'Pena. Cada um no seu canto, então.', null, true); return 'Tô fora.'; }
        if (act === 'arcGo' && this.qg) { g.setGps(this.qg.x, this.qg.z, 'Galpão do Dentinho (o confronto)'); return 'Tô indo.'; }
        if (act === 'arcGps') { const b = this.alive()[0]; if (b) g.setGps(b.x, b.z, b.name); return 'Onde?'; }
        return null;
    },
    onNewDay() {
        const g = this.game; if (!g) return;
        // pedágio nos seus soldados (cofre do galpão) por boca viva no distrito deles
        const E = g.empire;
        if (E && this.phase >= 1 && this.phase < 4) {
            const ds = new Set(this.alive().map((b) => b.d)), hit = E.biz.soldiers.filter((s) => s.d && ds.has(s.d) && !s.jail).length;
            if (hit && E.biz.vault > 0) { const lost = Math.round(E.biz.vault * Math.min(0.4, 0.1 * hit)); E.biz.vault -= lost; g._flash(`😁 Os capangas do Dentinho cobraram pedágio dos seus soldados: −${brl(lost)} do cofre do galpão`); }
        }
        // sócio: a parte do dia (e o risco de traição)
        if (this.outcome === 'partner' && this.partner) {
            const P = this.partner, n = this.alive().length, cut = 700 * Math.max(1, n);
            g.inventory.cash += cut; P.days++;
            this.msg(`Sua parte de ontem: ${brl(cut)} 💵 (já tá no seu bolso)`);
            const trust = typeof Phone !== 'undefined' ? Phone.trust.dentinho || 0 : 0;
            if (P.days >= 4 && trust < 50 && Math.random() < 0.07) this._betray(g);
            return;
        }
        if (this.phase === 1 || this.phase === 2) {
            const want = Math.min(4, 1 + Math.floor((Economy.day - (this.startDay || 0)) / 3));
            if (this.alive().length < want && Economy.day >= this.nextOpen) {
                const b = this._openBoca(g);
                if (b) { this.nextOpen = Economy.day + 2; this.msg(this.phase === 2 ? `Achou que ia me parar? Abri outra em ${this.dName(b.d)} 😁` : `Os negócios vão bem: mais uma boca em ${this.dName(b.d)} 😁`); if (typeof WorldMemory !== 'undefined') WorldMemory.log('rivalboca', { district: b.d, place: this.dName(b.d) }); }
            }
        }
    },

    // ---------------------------------------------------------------- bocas
    _openBoca(g) {
        if (typeof Interiors === 'undefined' || !g.empire || !g.nav || !g.nav.map) return null;
        Interiors.index();
        const P = g.player.position, E = g.empire, M = g.nav.map, used = new Set(this.bocas.filter((b) => !b.razed).map((b) => b.d));
        const doors = Interiors._doors.filter((d) => { const k = E.districtAt(d.x, d.z); return !Empire.OUTSKIRTS.includes(k) && k !== 'ilha' && !used.has(k) && hypot(d.x - P.x, d.z - P.z) > 200; });
        for (let t = 0; t < 40 && doors.length; t++) {
            const d = doors[Math.floor(Math.random() * doors.length)], q = this._sidewalk(M, d);
            if (!q || !M.walk(q.x, q.z) || this.bocas.some((b) => hypot(b.x - q.x, b.z - q.z) < 160)) continue;
            const k = E.districtAt(q.x, q.z), n = this.bocas.length;
            const b = { id: ++this._nid, x: Math.round(q.x * 10) / 10, z: Math.round(q.z * 10) / 10, d: k, name: `Boca do Dentinho (${this.dName(k)})`, size: Math.min(5, 3 + Math.floor(n / 2)), dead: 0, razed: false, day: Economy.day };
            this.bocas.push(b); this._poi(b, true);
            return b;
        }
        return null;
    },
    // Na calçada, ao lado de uma porta de loja (a porta fica na calçada; anda-se ao longo da fachada): nunca no meio da rua.
    _sidewalk(M, d) {
        const ax = Math.abs(Math.sin(d.face || 0)) > 0.5, s = Math.random() < 0.5 ? -1 : 1;
        for (const k of [5, 7, 3.5]) { const x = d.x + (ax ? 0 : s * k), z = d.z + (ax ? s * k : 0); if (M.walk(x, z)) return { x, z }; }
        return M.walk(d.x, d.z) ? { x: d.x, z: d.z } : null;
    },
    _poi(b, on) {
        if (!CityGrid.pois) return;
        const i = CityGrid.pois.findIndex((p) => p.rival === b.id);
        if (on && i < 0) CityGrid.pois.push({ type: 'boca_rival', x: b.x, z: b.z, name: b.name, rival: b.id });
        if (!on && i >= 0) CityGrid.pois.splice(i, 1);
    },
    // Taxa do Dentinho no comércio do distrito (Economy.factors).
    priceFactors(shop) {
        if (!(this.phase >= 1 && this.phase < 4) || !this.game || !this.game.empire) return [];
        const d = this.game.empire.districtAt(shop.x, shop.z);
        return this.alive().some((b) => b.d === d) ? [{ label: 'Taxa do Dentinho no bairro', mul: 1.06 }] : [];
    },

    // ---------------------------------------------------------------- capangas (streaming, como os grupos do GangManager)
    _spawn(G, kind, n, hp) {
        const g = this.game;
        for (let i = 0; i < n; i++) {
            const a = i / Math.max(1, n) * Math.PI * 2, p = g.nav.closestPoint(new BABYLON.Vector3(G.x + Math.cos(a) * (G.ring || 3), 0, G.z + Math.sin(a) * (G.ring || 3)));
            const o = new PoliceOfficer(g.scene, g.nav, p, this._nid++, g.sprites, this, true, typeof kind === 'function' ? kind(i) : kind);
            o.crew = true; o.drawn = true; o.group = G; o.slot = i;
            if (hp) { o.maxHp = o.hp = hp; }
            G.members.push(o); this.members.push(o); g.gangs.members.push(o);
        }
        G.active = true;
    },
    _despawn(G) {
        const g = this.game;
        for (const o of G.members) { this._drop(o); if (o.alive || o.deadTimer > 0) o.dispose(); }
        G.members = []; G.active = false;
    },
    _drop(o) {
        const g = this.game, i = this.members.indexOf(o); if (i >= 0) this.members.splice(i, 1);
        const k = g.gangs ? g.gangs.members.indexOf(o) : -1; if (k >= 0) g.gangs.members.splice(k, 1);
    },
    _groups() {
        const out = [];
        for (const b of this.bocas) if (!b.razed) { const G = b.G || (b.G = { x: b.x, z: b.z, size: b.size, ring: 3.2, members: [], active: false, boca: b }); out.push(G); }
        if (this.qg && !this.qg.done) { const Q = this.qg, G = Q.G || (Q.G = { x: Q.x, z: Q.z, size: 7, ring: 5, members: [], active: false, qg: Q }); out.push(G); }
        if (this.ambush && this.ambush.G) out.push(this.ambush.G);
        return out;
    },
    _hit(o) {
        if (o.boss && !o.surrender && o.hp <= o.maxHp * 0.3) this._surrender(o);
        this.provoked = 60;
        if (o.group && o.group.boca && this.phase === 1) this._declareWar('Você mexeu com os meus! Agora é guerra 😠');
    },
    _killed(o) {
        const G = o.group;
        if (G && G.boca) G.boca.dead++;
        if (o.boss) { this._resolve(this.game, 'dead'); return; }
        if (G && G.boca && this.phase === 1) this._declareWar('Mataram um dos meus. Agora é guerra 😠');
    },
    _declareWar(text) {
        if (this.phase !== 1) return;
        this.phase = 2; this.msg(text);
    },

    update(g, dt) {
        this.time += dt;
        if (this.provoked > 0) this.provoked -= dt;
        this._chk -= dt;
        if (this._chk <= 0) { this._chk = 5; this._maybeStart(g); this._checkFinale(g); }
        if (!g.gangs || !g.aiReady || Interiors.active || !g.player) return;
        const pos = g._playerState().pos, vel = g._playerState().vel, pl = g.player, hidden = !!(g.hiding && !g.hiding.seen) || g.mode === 'heli';
        // emboscada pronta? (a pé ou de carro, fora da favela, sem polícia atrás)
        const A = this.ambush;
        if (A && !A.G) { A.t -= dt; if (A.t <= 0 && pl.alive && g.wanted.level === 0 && !Standing.inFavela(pos.x, pos.z) && !g.sleeping) this._startAmbush(g, pos); }
        // streaming
        this._st -= dt;
        if (this._st <= 0) {
            this._st = 0.5;
            for (const G of this._groups()) {
                const d = hypot(G.x - pos.x, G.z - pos.z);
                if (!G.active && d < 130) {
                    if (G.boca) { const n = G.boca.size - G.boca.dead; if (n > 0) this._spawn(G, (i) => i === 0 && G.boca.size >= 4 ? 'gang3' : 'gang2', n); else G.active = true; this._props(G, true); }
                    else if (G.qg) { this._spawn(G, (i) => i < 2 ? 'gang3' : 'gang2', G.qg.left != null ? G.qg.left : 6); const boss = this._spawnBoss(G); this._props(G, true); }
                } else if (G.active && d > 170) {
                    if (G.boca) G.boca.dead = G.boca.size - G.members.filter((o) => o.alive).length;
                    if (G.qg) G.qg.left = G.members.filter((o) => o.alive && !o.boss).length;
                    if (G.ambushG) { this.ambush = null; }
                    this._despawn(G); this._props(G, false);
                }
            }
        }
        // percepção e ação
        const war = this.phase >= 2 && this.outcome !== 'partner';
        for (let i = this.members.length - 1; i >= 0; i--) {
            const u = this.members[i], G = u.group;
            if (!u.alive) { u.update(dt); if (u.deadTimer <= 0) { this._drop(u); u.dispose(); if (G) G.members.splice(G.members.indexOf(u), 1); } continue; }
            if (u.surrender) { u.setAlert(false); u._setSpeed && u._setSpeed(0); continue; }        // (rendido: parado, mãos para cima — você decide)
            if (u.rag) { u.update(dt); continue; }
            const m = u.mind || (u.mind = { sees: false, x: 0, z: 0, vx: 0, vz: 0, t: -1e9 }), p = u.position, dist = hypot(p.x - pos.x, p.z - pos.z);
            let hostile = (war || this.provoked > 0 || (G && (G.qg || G.ambushG))) && this.outcome !== 'partner';
            if (!hostile && G && G.boca && dist < 10 && pl.alive) {          // chegou perto da boca: o aviso, e depois bala
                if (!G.warnT) { G.warnT = this.time; if (typeof Bubbles !== 'undefined') Bubbles.say(u, this.outcome === 'partner' ? this._pick(['Fala, sócio! Tá tudo certo por aqui.', 'Movimento bom hoje, chefe 👍']) : this._pick(['Aí, aqui é do Dentinho. Rala!', 'Tá olhando o quê? Vaza!', 'Some daqui, parceiro.']), { tone: this.outcome === 'partner' ? 'talk' : 'angry', ms: 3000 }); }
                else if (this.outcome === 'partner') { /* (sócio: só cumprimentam) */ }
                else if (this.time - G.warnT > 5) { this.provoked = 60; this._declareWar('Te avisaram pra sair da minha boca. Agora aguenta 😠'); hostile = true; }
            } else if (G && G.warnT && dist > 16) G.warnT = 0;
            m.sees = hostile && !hidden && pl.alive && dist < 32 && MapGeo.hasLineOfSight(p.x, p.z, pos.x, pos.z) && !(typeof Cover !== 'undefined' && Cover.hiddenFrom(g, p.x, p.z));
            if (m.sees) { m.x = pos.x; m.z = pos.z; m.vx = vel ? vel.x : 0; m.vz = vel ? vel.z : 0; m.t = this.time; if (G) for (const o of G.members) if (o !== u && o.alive && o.mind) Object.assign(o.mind, { x: m.x, z: m.z, t: m.t }); }
            const fresh = this.time - m.t < 6;
            if (G && G.ambushG && G.wpT !== undefined) { G.x = pos.x; G.z = pos.z; }          // (o bonde vai atrás de você)
            u.setTarget(new BABYLON.Vector3(m.x, 0, m.z), new BABYLON.Vector3(m.sees ? m.vx : 0, 0, m.sees ? m.vz : 0));
            u.setAlert(hostile && (m.sees || fresh || (G && G.ambushG)));
            u.update(dt);
        }
        // fim da emboscada: todos caíram
        if (this.ambush && this.ambush.G && this.ambush.G.active && !this.ambush.G.members.some((o) => o.alive)) {
            this.ambush = null; this.msg(this._pick(['Meus moleques não deram conta… da próxima vez eu mesmo vou.', 'Sorte sua. Da próxima não escapa.']));
        }
    },
    _pick(a) { return a[Math.floor(Math.random() * a.length)]; },

    // A boca e o galpão: mesa, guarda-sol vermelho, cadeiras de plástico, caixa de som (só perto de você).
    _props(G, on) {
        if (!on) { if (G.meshes) for (const m of G.meshes) m.dispose(); G.meshes = null; return; }
        if (G.meshes) return;
        const sc = this.game.scene, out = G.meshes = [], x = G.x, z = G.z;
        const mat = (c) => FlatMat.get(sc, c);
        const box = (w, h, d, px, py, pz, c) => { const b = BABYLON.MeshBuilder.CreateBox('rvBox', { width: w, height: h, depth: d }, sc); b.position.set(px, py, pz); b.material = mat(c); b.isPickable = false; out.push(b); return b; };
        if (G.boca && !G.boca.razed) {
            box(1.2, 0.08, 0.8, x, 0.75, z, '#e8e8e8'); box(0.06, 0.72, 0.06, x - 0.5, 0.36, z - 0.32, '#cfcfcf'); box(0.06, 0.72, 0.06, x + 0.5, 0.36, z + 0.32, '#cfcfcf');
            const umb = BABYLON.MeshBuilder.CreateCylinder('rvUmb', { diameterTop: 0, diameterBottom: 2.4, height: 0.45, tessellation: 12 }, sc); umb.position.set(x, 2.15, z); umb.material = mat('#c81e1e'); umb.isPickable = false; out.push(umb);
            const pole = BABYLON.MeshBuilder.CreateCylinder('rvPole', { diameter: 0.05, height: 2 }, sc); pole.position.set(x, 1.1, z); pole.material = mat('#777777'); pole.isPickable = false; out.push(pole);
            box(0.45, 0.45, 0.45, x + 1.1, 0.23, z - 0.6, '#f1f1f1'); box(0.45, 0.45, 0.45, x - 1.1, 0.23, z + 0.5, '#f1f1f1');
            box(0.4, 0.6, 0.35, x + 0.2, 1.08, z - 0.05, '#1a1a1a');                   // caixa de som
            box(0.5, 0.3, 0.35, x - 0.3, 0.94, z + 0.1, '#8b5a2b');                    // a caixa do movimento
        } else if (G.qg) {
            for (let k = 0; k < 5; k++) box(1.2, 1.2, 1.2, x + Math.cos(k * 1.3) * 6, 0.6, z + Math.sin(k * 1.3) * 6, k % 2 ? '#6b4f2a' : '#4b5563');
            box(2.4, 0.08, 1.2, x, 0.8, z, '#3f3f46');
        }
    },

    // Estourar a boca: todos os vigias no chão, E na mesa.
    prompt(g) {
        if (g.mode !== 'player' || Interiors.active) return '';
        const P = g.player.position;
        for (const b of this.alive()) if (b.G && b.G.active && hypot(b.x - P.x, b.z - P.z) < 3.2) {
            const up = b.G.members.filter((o) => o.alive).length;
            return up ? `<b>BOCA DO DENTINHO</b><small>${up} vigia(s) de pé — derrube todos para estourar a boca</small>` : `<b>E</b> estourar a boca do Dentinho<small>o dinheiro do movimento é seu · ele vai revidar</small>`;
        }
        const B = this._boss();
        if (B && B.surrender && B.alive && hypot(B.position.x - P.x, B.position.z - P.z) < 3.5) return '<b>E</b> decidir o destino do Dentinho<small>ele se rendeu</small>';
        return '';
    },
    interact(g) {
        if (g.mode !== 'player' || Interiors.active) return false;
        const P = g.player.position;
        for (const b of this.alive()) if (b.G && b.G.active && hypot(b.x - P.x, b.z - P.z) < 3.2 && !b.G.members.some((o) => o.alive)) { this._raze(g, b); return true; }
        const B = this._boss();
        if (B && B.surrender && B.alive && hypot(B.position.x - P.x, B.position.z - P.z) < 3.5) { this._choice(g); return true; }
        return false;
    },
    _raze(g, b) {
        const loot = Math.round((2500 + Math.random() * 4000) * (1 + this.razed * 0.2) / 10) * 10;
        if (typeof Ledger !== 'undefined') Ledger.hold('Guerra com o Dentinho', 1);
        g.inventory.cash += loot;
        b.razed = true; this.razed++; this._poi(b, false); this._props(b.G, false);
        for (const o of b.G.members) this._drop(o);
        b.G.active = false;
        g._flash(`💥 Boca do Dentinho estourada em ${this.dName(b.d)}: +${brl(loot)} do movimento`); AudioFX.blip(220, 0.3, 0.2);
        if (typeof WorldMemory !== 'undefined') { WorldMemory.crime('boca', b.x, b.z, { place: this.dName(b.d), value: loot }); WorldMemory.good(b.x, b.z, 4, 'tirou a boca do bairro'); }
        if (this.phase === 1) this.phase = 2;
        this.ambush = { t: 90 + Math.random() * 150 };
        this.msg(this._pick(['Você estourou minha boca?! Vou te achar 😡', 'Isso foi um erro. Um erro grande. 😡', 'Meus moleques já estão na rua atrás de você.']));
        if (typeof Achievements !== 'undefined' && g.achievements && g.achievements.bump) g.achievements.bump('rivalBocas');
    },
    _startAmbush(g, pos) {
        const M = g.nav.map;
        for (let t = 0; t < 20; t++) {
            const a = Math.random() * 6.28, r = 42 + Math.random() * 14, q = M.closestPoint(pos.x + Math.cos(a) * r, pos.z + Math.sin(a) * r, 8);
            if (!q || !M.walk(q.x, q.z)) continue;
            const G = { x: q.x, z: q.z, size: 3, ring: 2, members: [], active: false, ambushG: true, wpT: 0 };
            this.ambush.G = G;
            this._spawn(G, 'gang2', 3 + (this.razed >= 2 ? 1 : 0));
            g._flash('😁 O bonde do Dentinho te achou! Três capangas vindo atrás de você');
            AudioFX.blip(160, 0.4, 0.2);
            return;
        }
        this.ambush.t = 30;
    },

    // ---------------------------------------------------------------- confronto final
    _checkFinale(g) {
        if (this.phase !== 2 || this.qg || this.razed < 3 || this.alive().length) return;
        const E = g.empire; if (!E || !g.nav.map) return;
        Interiors.index();
        const P = g.player.position, M = g.nav.map;
        const ds = Interiors._doors.filter((d) => E.districtAt(d.x, d.z) === 'industrial');
        const pool = ds.length ? ds : Interiors._doors;
        for (let t = 0; t < 30; t++) {
            const d = pool[Math.floor(Math.random() * pool.length)], q = this._sidewalk(M, d);
            if (!q || !M.walk(q.x, q.z) || hypot(q.x - P.x, q.z - P.z) < 180) continue;
            this.qg = { x: q.x, z: q.z, left: 6, done: false };
            this.phase = 3;
            CityGrid.pois.push({ type: 'boca_rival', x: q.x, z: q.z, name: 'Galpão do Dentinho', rival: -1 });
            this.msg('Chega de brincadeira. Tô no galpão do porto com os meus. Vem resolver isso cara a cara — se tiver coragem.', [{ label: 'Marcar no GPS', act: 'arcGo' }]);
            if (typeof News !== 'undefined') News.onEvent({ kind: 'rivalwar', day: Economy.day, district: 'industrial' });
            return;
        }
    },
    _spawnBoss(G) {
        const g = this.game, p = g.nav.closestPoint(new BABYLON.Vector3(G.x, 0, G.z));
        const o = new PoliceOfficer(g.scene, g.nav, p, this._nid++, g.sprites, this, true, 'gang3');
        o.crew = true; o.drawn = true; o.group = G; o.slot = 0; o.boss = true; o.maxHp = o.hp = 420;
        G.members.push(o); this.members.push(o); g.gangs.members.push(o);
        if (typeof Bubbles !== 'undefined') setTimeout(() => o.alive && Bubbles.say(o, 'Chegou a hora, freguês! 😁', { tone: 'shout', ms: 3500 }), 600);
        return o;
    },
    _boss() { return this.members.find((o) => o.boss); },
    _surrender(o) {
        o.surrender = true; o.hp = Math.max(o.hp, 30); o.shooting = false; o.setAlert(false);
        const G = o.group;
        for (const u of G.members.slice()) if (u !== o && u.alive) { this._drop(u); u.dispose(); G.members.splice(G.members.indexOf(u), 1); }
        this.game._flash('🏳️ O Dentinho se rendeu e os capangas fugiram — chegue perto e aperte E para decidir');
        if (typeof Bubbles !== 'undefined') Bubbles.say(o, 'Tá bom, tá bom! Chega! Eu me rendo!', { tone: 'shout', ms: 4000 });
    },
    _choice(g) {
        if (!this._cp) this._cp = new Panel('rivalEnd', { width: 560, closable: false, onAct: (a) => { this._cp.close(); this._resolve(g, a); } });
        this._cp.show('😁 O destino do Dentinho', 'Ele está no chão, ferido, de mãos para cima.',
            `<p style="margin:0 0 10px">"Faz o que quiser… mas lembra que eu sei de muita coisa."</p>`
            + `<p style="margin:0 0 10px;font-size:12px;opacity:.75">Acabar: o bairro passa a ter medo · Expulsar: ele some e o bairro respeita · Sócio: ele reabre duas bocas e te repassa uma parte todo dia — mas pode trair.</p>`
            + Panel.btn('dead', '🔫 Acabar com ele', { pri: true }) + Panel.btn('exiled', '🚌 Expulsar da cidade') + Panel.btn('partner', '🤝 Fazer dele seu sócio'));
    },
    _resolve(g, how) {
        const B = this._boss(), at = B ? { x: B.position.x, z: B.position.z } : this.qg || g.player.position;
        if (this.qg) { this.qg.done = true; const i = CityGrid.pois.findIndex((p) => p.rival === -1); if (i >= 0) CityGrid.pois.splice(i, 1); if (this.qg.G) { this._despawn(this.qg.G); this._props(this.qg.G, false); } }
        else if (B) { this._drop(B); B.dispose(); }
        if (how === 'dead') {
            this.outcome = 'dead'; this.phase = 4;
            if (typeof WorldMemory !== 'undefined') WorldMemory.crime('kill', at.x, at.z, { rival: true });
            g._flash('☠ O Dentinho está morto. A cidade é sua — e todo mundo sabe quem foi.');
            if (typeof Phone !== 'undefined') { Phone.CONTACTS.dentinho.role = 'Falecido'; Phone.CONTACTS.dentinho.about = 'Era o campeão do truco do bairro.'; }
            if (typeof News !== 'undefined') News.onEvent({ kind: 'rivaldead', day: Economy.day, district: 'industrial' });
        } else if (how === 'exiled') {
            this.outcome = 'exiled'; this.phase = 4;
            if (typeof WorldMemory !== 'undefined') WorldMemory.good(at.x, at.z, 10, 'expulsou o Dentinho');
            g._flash('🚌 O Dentinho pegou o primeiro ônibus para fora da cidade. Você venceu.');
            if (typeof Phone !== 'undefined') { Phone.CONTACTS.dentinho.role = 'Expulso da cidade'; setTimeout(() => this.msg('Tô longe. Você ganhou, freguês. Mas se um dia precisar de um truco… 😁', null), 4000); }
            if (typeof News !== 'undefined') News.onEvent({ kind: 'rivalgone', day: Economy.day, district: 'industrial' });
        } else this._partner(g, 'rendição');
        if (typeof Achievements !== 'undefined' && g.achievements && g.achievements.bump) g.achievements.bump('rivalEnd');
    },
    _partner(g, why) {
        this.outcome = 'partner'; this.phase = 4; this.partner = { since: Economy.day, days: 0 };
        while (this.alive().length < 2) { const b = this._openBoca(g); if (!b) break; }
        for (const b of this.alive()) { b.name = `Boca do sócio (${this.dName(b.d)})`; this._poi(b, false); this._poi(b, true); }
        if (typeof Phone !== 'undefined') { Phone.CONTACTS.dentinho.role = 'Sócio'; Phone.trust.dentinho = Math.max(Phone.trust.dentinho || 0, why === 'oferta' ? 35 : 10); }
        g._flash(`🤝 O Dentinho agora é seu sócio: ele toca ${this.alive().length} boca(s) e te repassa uma parte todo dia`);
        this.msg(why === 'oferta' ? 'Fechou! Toda manhã cai a sua parte. Confia em mim 😁' : 'Obrigado por… você sabe. Não vou esquecer. Toda manhã cai a sua parte.', null, true);
    },
    _betray(g) {
        this.outcome = null; this.partner = null; this.phase = 2; this.startDay = Economy.day; this.nextOpen = Economy.day + 1;
        g.wanted.ensureLevel(2);
        if (typeof Phone !== 'undefined') { Phone.CONTACTS.dentinho.role = 'Traidor'; Phone.trust.dentinho = -80; }
        this.msg('Nada pessoal, sócio. Passei teu nome pra polícia e fiquei com tudo 😁 A cidade é pequena demais pra nós dois.');
        g._flash('🐍 O Dentinho te traiu: deu teu nome à polícia (★★) e quer a cidade só pra ele');
        if (typeof News !== 'undefined') News.onEvent({ kind: 'rivalbetray', day: Economy.day });
    },

    // ---------------------------------------------------------------- texto do status (menu)
    statusHtml(row) {
        const P = ['—', 'Expandindo (abrindo bocas)', 'Em guerra com você', 'Confronto marcado no galpão', ''][this.phase] || '';
        const O = { dead: 'Morto', exiled: 'Expulso da cidade', partner: 'Seu sócio' };
        if (!this.phase && !this.outcome) return row('Dentinho', 'ainda é só o campeão do truco do bairro');
        return row('Situação', this.outcome ? O[this.outcome] : P) + row('Bocas dele de pé', this.alive().length + (this.alive().length ? ' — ' + this.alive().map((b) => this.dName(b.d)).join(', ') : ''))
            + row('Bocas estouradas por você', this.razed) + (this.partner ? row('Dias de sociedade', this.partner.days) : '');
    },

    serialize() {
        return { phase: this.phase, bocas: this.bocas.map((b) => ({ id: b.id, x: b.x, z: b.z, d: b.d, name: b.name, size: b.size, dead: b.dead, razed: b.razed, day: b.day })), razed: this.razed, outcome: this.outcome, partner: this.partner,
            ambush: this.ambush && !this.ambush.G ? { t: this.ambush.t } : null, qg: this.qg && !this.qg.done ? { x: this.qg.x, z: this.qg.z, left: this.qg.left } : null, startDay: this.startDay, nextOpen: this.nextOpen, offer: this.offer, nid: this._nid };
    },
    load(s) {
        for (const G of this._groups()) { if (G.active) this._despawn(G); this._props(G, false); }
        if (CityGrid.pois) for (let i = CityGrid.pois.length - 1; i >= 0; i--) if (CityGrid.pois[i].type === 'boca_rival') CityGrid.pois.splice(i, 1);
        s = s || {};
        this.phase = s.phase || 0; this.bocas = (s.bocas || []).map((b) => Object.assign({}, b, { G: null })); this.razed = s.razed || 0; this.outcome = s.outcome || null; this.partner = s.partner || null;
        this.ambush = s.ambush || null; this.qg = s.qg ? Object.assign({ done: false }, s.qg) : null; this.startDay = s.startDay != null ? s.startDay : null; this.nextOpen = s.nextOpen || 0; this.offer = !!s.offer; this._nid = s.nid || 9000;
        this.members = [];
        for (const b of this.alive()) this._poi(b, true);
        if (this.qg) CityGrid.pois.push({ type: 'boca_rival', x: this.qg.x, z: this.qg.z, name: 'Galpão do Dentinho', rival: -1 });
        if (this.outcome && typeof Phone !== 'undefined') Phone.CONTACTS.dentinho.role = { dead: 'Falecido', exiled: 'Expulso da cidade', partner: 'Sócio' }[this.outcome];
    },
};
Economy.onDay(() => RivalArc.onNewDay());
