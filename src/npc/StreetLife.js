// ============================================================================
// StreetLife — a rua viva: o movimento muda com a hora, coisas acontecem perto de você e quem passa conversa.
//   • ROTINA POR HORA: a cidade enche no rush (7–9h, 17–19h) e no almoço, esvazia de madrugada (os pedestres reaparecem mais
//     longe: NPCManager.recycleMin), corre-se na orla de manhã cedo e no fim da tarde, toma-se sol ao meio-dia. Chuva esvazia a rua.
//   • ACONTECIMENTOS (um de cada vez, perto do jogador a pé, a cada ~1–2 min):
//       briga       dois pedestres saem no braço — E separa (respeito no bairro) ou deixa rolar
//       pivete      um moleque arranca a bolsa de alguém e corre — pegue ele (bater) e devolva a bolsa (E) ou fique com ela
//       ambulante   vendedor com carrinho (água, milho, churros, picolé) — E compra (mata a fome, cura um pouco)
//       samba       roda de samba/pagode no fim de semana à noite na praça — gente sambando, batucada de verdade (som 3D)
//       pelada      futebol de rua de dia (fim de semana): a bola rolando, todo mundo correndo atrás
//       pregação    domingo de manhã: o pastor na praça e os fiéis ouvindo
//   • CONVERSAS: quem passa perto fala (balão): o que deu no jornal do bairro, conversa fiada e, às vezes, uma DICA de verdade
//     ("o caixa da Farmácia X fica cheio depois das 18h" — vale: Robbery paga mais nesse horário). No bairro onde você é temido,
//     cochicham ("É ele…").
// ============================================================================

const StreetLife = {
    g: null, ev: null, extras: [], tips: [],
    nextT: 35, chatT: 6,

    // ------------------------------------------------------------------ rotina por hora
    // Quanto de gente na rua (1 = o normal do NPCManager).
    density(h, rain = 0) {
        const T = [[0, 0.35], [5, 0.55], [7, 1.45], [9, 1.0], [12, 1.3], [14, 1.0], [17, 1.55], [19, 1.15], [22, 0.6], [24, 0.35]];
        let d = 1;
        for (let i = 0; i < T.length - 1; i++) if (h >= T[i][0] && h < T[i + 1][0]) { const k = (h - T[i][0]) / (T[i + 1][0] - T[i][0]); d = T[i][1] + (T[i + 1][1] - T[i][1]) * k; break; }
        return d * (1 - 0.45 * rain);
    },
    // Mistura de papéis (NPCManager._roleFor): corrida de manhã cedo e fim de tarde; sol e banho de mar no meio do dia, sem chuva.
    mix() {
        const g = this.g; if (!g || !g.dayNight) return null;
        const h = g.dayNight.hour, rain = typeof Weather !== 'undefined' && Weather.cur ? Weather.cur.k : 0, M = Config.npc.mix;
        const jog = (h >= 5.5 && h < 8.5) || (h >= 16.5 && h < 19) ? M.jog * 1.8 : h >= 22 || h < 5 ? 0.02 : M.jog * 0.6;
        const day = h >= 9 && h < 17 && rain < 0.2 ? 1 : 0, peak = h >= 11 && h < 15 ? 1.5 : 1;
        return { jog, sun: M.sun * day * peak, swim: M.swim * day * peak };
    },

    update(game, dt) {
        this.g = game;
        if (!game.npcManager || !game.aiReady || Interiors.active) return;
        const h = game.dayNight.hour, rain = typeof Weather !== 'undefined' && Weather.cur ? Weather.cur.k : 0, d = this.density(h, rain);
        game.npcManager.recycleMin = d < 0.8 ? 75 + (0.8 - d) * 180 : 75;   // (de madrugada: quem some, reaparece longe)
        this._extras(game, dt, d);
        this._events(game, dt);
        this._chatter(game, dt);
    },

    // Rush / almoço: pedestres EXTRAS perto do jogador (somem quando o movimento cai ou ficam longe).
    _extras(game, dt, d) {
        this._exT = (this._exT || 0) - dt; if (this._exT > 0) return; this._exT = 1.2;
        const M = game.npcManager, P = game.player.position, h = game.dayNight.hour, W = typeof Weather !== 'undefined' && Weather.cur;
        const b = CityGrid._blockAtPoint(P.x, P.z), beachHot = b && (b.biome === 'beach' || b.biome === 'resort') && h >= 10.5 && h < 16 && !(W && W.k > 0.1);
        const want = Math.round((Math.round(Math.max(0, d - 1) * 55) + (beachHot ? 30 : 0)) * (typeof Life !== 'undefined' ? Life.mul() : 1));          // (sol quente: a praia lota)
        this.extras = this.extras.filter((n) => n.alive);
        for (const n of this.extras.slice()) {
            if (this.extras.length > want || hypot(n.position.x - P.x, n.position.z - P.z) > 230) { M.removeNpc(n); this.extras.splice(this.extras.indexOf(n), 1); if (this.extras.length <= want) break; }
        }
        for (let k = 0; k < 3 && this.extras.length < want; k++) {
            const { pos, role } = M._place(M._roleFor(Math.random()), 60, 170);
            const npc = new NPC(game.scene, game.nav, pos, 12000 + (this._exId = (this._exId || 0) + 1), game.sprites, game.npcCtx, role);
            npc.setStyle(M._style(pos, role)); npc.party = true;
            M.npcs.push(npc); this.extras.push(npc);
        }
    },

    // ------------------------------------------------------------------ acontecimentos
    _events(game, dt) {
        if (this.ev) { this._evUpdate(game, dt); return; }
        this.nextT -= dt;
        if (this.nextT > 0) return;
        this.nextT = (55 + Math.random() * 60) / (typeof Life !== 'undefined' ? Math.max(0.45, Life.mul()) : 1);      // (vida da cidade baixa: menos acontecimentos)
        if (game.mode !== 'player' || game.holdup || game.arrest || game.death || (game.wanted && game.wanted.level > 0)) return;
        const h = game.dayNight.hour, wd = Economy.day % 7, rain = typeof Weather !== 'undefined' && Weather.cur ? Weather.cur.k : 0;
        const opts = [['briga', 3], ['pivete', 3]];
        if (h >= 8 && h < 20 && rain < 0.3) opts.push(['ambulante', 4]);
        if ((wd === 4 || wd === 5 || wd === 6) && h >= 18 && h < 24 && rain < 0.3) opts.push(['samba', 5]);
        if ((wd === 5 || wd === 6 || h >= 16) && h >= 8 && h < 18.5 && rain < 0.3) opts.push(['pelada', 3]);
        if (wd === 6 && h >= 8 && h < 12) opts.push(['pregacao', 4]);
        let s = Math.random() * opts.reduce((a, o) => a + o[1], 0), kind = opts[0][0];
        for (const [k, w] of opts) { if ((s -= w) <= 0) { kind = k; break; } }
        try { this['_start_' + kind](game); } catch (e) { console.warn('[RUA]', kind, e); this._end(game); }
    },
    _end(game) {
        const E = this.ev; this.ev = null; if (!E) return;
        for (const a of E.actors || []) { try { a.dispose(); } catch (e) { /* ok */ } }
        for (const m of E.meshes || []) { try { m.dispose(); } catch (e) { /* ok */ } }
        if (E.npcs) for (const n of E.npcs) if (n.alive && n.party && game.npcManager) game.npcManager.removeNpc(n);
    },
    _evUpdate(game, dt) {
        const E = this.ev, P = game.player.position;
        E.t += dt;
        const far = E.x != null && hypot(E.x - P.x, E.z - P.z) > 150;
        if (E.t > E.life || far) { this._end(game); return; }
        const f = this['_upd_' + E.kind]; if (f) f.call(this, game, dt, E);
    },
    // Um ponto andável perto do jogador (preferindo um tipo de quadra: praça, parque…).
    _spot(game, rMin, rMax, biomes = null) {
        const P = game.player.position, nav = game.nav;
        for (let k = 0; k < 40; k++) {
            const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin), x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
            const b = CityGrid._blockAtPoint(x, z);
            if (biomes && (!b || !biomes.includes(b.biome)) && k < 30) continue;
            const p = nav.closestPoint(new BABYLON.Vector3(x, 0, z), 6);
            if (p && nav.walk(p.x, p.z)) return { x: p.x, z: p.z };
        }
        return null;
    },
    _actor(game, type, x, z, heading = 0, clip = 'idle') {
        const ok = typeof NpcArt !== 'undefined' && NpcArt.atlases && NpcArt.atlases[type];
        const sheet = ok ? NpcArt.sheet(type) : game.sprites.sheets.civA;
        const row = ok ? NpcArt.row(type, Math.floor(Math.random() * (NpcData.nvar(type) || 1))) : 2 + Math.floor(Math.random() * 6);
        const a = new SpriteActor(game.scene, sheet, row, 'streetLife' + (this._aid = (this._aid || 0) + 1));
        a.play(clip, 'none') || a.play('idle', 'none');
        a.setPosition(x, z); a.setHeading(heading); a.mesh.position.y = 0.5;
        return a;
    },
    _civ() { const T = ['civil_trabalhador', 'civil_senhor', 'civil_praia', 'civil_executiva', 'civil_estudante', 'civil_black_power', 'civil_mano', 'civil_chanel', 'civil_trancas', 'civil_topete', 'civil_repartido', 'civil_torcedor', 'civil_vovo']; return T[Math.floor(Math.random() * T.length)]; },
    _calm(n) { return n.alive && !n.rag && !n.free && n.index >= 0 && n.fsm && n.fsm.name === 'WANDER' && n.actor; },
    _pick(a) { return a[Math.floor(Math.random() * a.length)]; },

    // --- briga: dois pedestres saem no braço
    _start_briga(game) {
        const P = game.player.position, L = game.npcManager.npcs.filter((n) => this._calm(n) && hypot(n.position.x - P.x, n.position.z - P.z) > 8 && hypot(n.position.x - P.x, n.position.z - P.z) < 35);
        if (L.length < 2) return;
        const a = L[Math.floor(Math.random() * L.length)], b = L.filter((n) => n !== a).sort((m, n) => hypot(m.position.x - a.position.x, m.position.z - a.position.z) - hypot(n.position.x - a.position.x, n.position.z - a.position.z))[0];
        if (!b || hypot(b.position.x - a.position.x, b.position.z - a.position.z) > 14) return;
        a.fsm.setState(new FightState(a, b)); b.fsm.setState(new FightState(b, a));
        this.ev = { kind: 'briga', t: 0, life: 22, a, b, x: a.position.x, z: a.position.z };
        Bubbles.say(a, this._pick(['Tá olhando o quê?!', 'Vem, que eu te quebro!', 'Repete se for homem!']), { tone: 'angry', ms: 2400 });
        setTimeout(() => b.alive && Bubbles.say(b, this._pick(['Vem! Vem!', 'Segura eu, senão eu mato!', 'Ah, é assim?!']), { tone: 'angry', ms: 2200 }), 1200);
        game.npcManager.alertViolence(a.position, 10, [a, b]);
    },
    _upd_briga(game, dt, E) {
        E.x = E.a.position.x; E.z = E.a.position.z;
        if (!E.a.alive || !E.b.alive || E.a.fsm.name !== 'FIGHT' && E.b.fsm.name !== 'FIGHT') this._end(game);
    },
    // --- pivete: arranca a bolsa e corre
    _start_pivete(game) {
        const P = game.player.position, L = game.npcManager.npcs.filter((n) => this._calm(n) && hypot(n.position.x - P.x, n.position.z - P.z) > 6 && hypot(n.position.x - P.x, n.position.z - P.z) < 26);
        if (L.length < 2) return;
        const v = L[Math.floor(Math.random() * L.length)], t = game.npcManager.npcs.filter((n) => n !== v && this._calm(n) && hypot(n.position.x - v.position.x, n.position.z - v.position.z) < 18)
            .sort((m, n) => hypot(m.position.x - v.position.x, m.position.z - v.position.z) - hypot(n.position.x - v.position.x, n.position.z - v.position.z))[0];
        if (!t) return;
        t.setStyle('poor');
        t.panic(v.position, true);                                     // (sai correndo, para longe da vítima)
        t.thief = true;
        const value = 80 + Math.floor(Math.random() * 380);
        this.ev = { kind: 'pivete', t: 0, life: 75, v, thief: t, value, got: false, x: v.position.x, z: v.position.z, hp0: t.hp };
        Bubbles.say(v, this._pick(['Pega ladrão! Minha bolsa!', 'SOCORRO! Levaram a minha bolsa!', 'Pega! Pega aquele moleque!']), { tone: 'shout', ms: 3200 });
        game._flash('👜 Um pivete arrancou a bolsa de alguém! Pegue ele (bata) para recuperar');
    },
    _upd_pivete(game, dt, E) {
        const T = E.thief;
        E.x = E.v.position.x; E.z = E.v.position.z;
        if (!E.got && (T.hp < E.hp0 || !T.alive || T.rag)) {
            E.got = true;
            game._flash(`👜 Você pegou a bolsa (${brl(E.value)})! Devolva para a vítima (E perto dela) — ou fique com ela`);
            if (T.alive) Bubbles.say(T, 'Ai! Tá bom, tá bom, toma!', { ms: 2000 });
            E.life = E.t + 60;
        }
        if (E.got && E.t >= E.life - 0.1 && !E.done) {                // ficou com a bolsa
            E.done = true; game.inventory.addCash(E.value);
            game._flash(`👜 Você ficou com a bolsa: +${brl(E.value)}`);
            if (typeof WorldMemory !== 'undefined') WorldMemory.crime('theft', E.x, E.z);
        }
    },
    // --- ambulante: o carrinho
    ITEMS: [['agua', '💧 Água de coco', 6, 0, 8], ['milho', '🌽 Milho cozido', 8, 280, 6], ['churros', '🥖 Churros', 10, 340, 4], ['picole', '🍦 Picolé', 5, 120, 3], ['espetinho', '🍢 Espetinho', 12, 420, 8]],
    _start_ambulante(game) {
        const s = this._spot(game, 12, 40, ['commercial', 'downtown', 'beach', 'plaza', 'park', 'favela']); if (!s) return;
        const a = this._actor(game, 'civil_ambulante', s.x, s.z, Math.random() * 6.28);
        const cart = this._cart(game, s.x + 0.9, s.z);
        this.ev = { kind: 'ambulante', t: 0, life: 200, x: s.x, z: s.z, actors: [a], meshes: cart, a, shoutT: 1 };
    },
    _cart(game, x, z) {
        const sc = game.scene, out = [];
        const mat = (c) => { const m = new BABYLON.StandardMaterial('cartM', sc); m.diffuseColor = BABYLON.Color3.FromHexString(c); m.specularColor = BABYLON.Color3.Black(); return m; };
        const box = BABYLON.MeshBuilder.CreateBox('cart', { width: 1.0, height: 0.75, depth: 0.6 }, sc); box.position.set(x, 0.55, z); box.material = mat('#d9d2c0'); out.push(box);
        const top = BABYLON.MeshBuilder.CreateCylinder('cartUmb', { diameterTop: 0, diameterBottom: 1.7, height: 0.35, tessellation: 12 }, sc); top.position.set(x, 1.85, z); top.material = mat(this._pick(['#d9453a', '#f2b705', '#2f6fb5', '#2f8a48'])); out.push(top);
        const pole = BABYLON.MeshBuilder.CreateCylinder('cartPole', { diameter: 0.05, height: 1.3 }, sc); pole.position.set(x, 1.15, z); pole.material = mat('#777777'); out.push(pole);
        for (const m of out) m.isPickable = false;
        return out;
    },
    _upd_ambulante(game, dt, E) {
        E.a.update(dt, 1);
        E.shoutT -= dt;
        if (E.shoutT <= 0) { E.shoutT = 9 + Math.random() * 8; Bubbles.say(E.a, this._pick(['Olha a água de coco geladinha!', 'Milho verde! Olha o milho!', 'Churros, churros quentinho!', 'Picolé, picolé! Três por dez!', 'Espetinho na brasa, freguesia!']), { tone: 'shout', ms: 2600 }); }
    },
    // --- roda de samba (fim de semana à noite)
    _start_samba(game) {
        const s = this._spot(game, 18, 55, ['plaza', 'commercial', 'favela', 'park']); if (!s) return;
        const actors = [], D = [];
        for (let k = 0; k < 6; k++) { const a = Math.PI * 2 * k / 6; actors.push(this._actor(game, this._civ(), s.x + Math.cos(a) * 1.4, s.z + Math.sin(a) * 1.4, Math.atan2(-Math.cos(a), -Math.sin(a)))); }
        for (let k = 0; k < 10; k++) {
            const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 3.5, x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
            if (!game.nav.walk(x, z)) continue;
            const act = this._actor(game, this._civ(), x, z, Math.atan2(s.x - x, s.z - z), 'walk');
            actors.push(act); D.push({ a: act, x, z, ph: Math.random() * 6.28 });
        }
        this.ev = { kind: 'samba', t: 0, life: 300, x: s.x, z: s.z, actors, dancers: D, beat: 0, step: 0, singT: 2 };
        game._flash('🥁 Tem roda de samba rolando aqui perto!');
    },
    _upd_samba(game, dt, E) {
        for (const a of E.actors) a.update(dt, 0.75);
        for (const d of E.dancers) { d.ph += dt * 3.2; d.a.setHeading(Math.atan2(E.x - d.x, E.z - d.z) + Math.sin(d.ph) * 0.6); d.a.setPosition(d.x + Math.sin(d.ph * 0.5) * 0.12, d.z); }
        // batucada (2/4, ~100 bpm, em 16 avos): surdo no 2, pandeiro em todas, tamborim no desenho
        E.beat += dt; const S = 60 / 100 / 4;
        while (E.beat >= S) {
            E.beat -= S; const i = E.step++ % 16, F = typeof AudioFX !== 'undefined' && AudioFX._burst;
            if (!F) continue;
            if (i === 4 || i === 12) AudioFX._burst(E.x, E.z, { vol: 0.5, dur: 0.22, f0: 140, f1: 45, maxDist: 70 });
            if (i === 0 || i === 8) AudioFX._burst(E.x, E.z, { vol: 0.3, dur: 0.16, f0: 180, f1: 60, maxDist: 70 });
            AudioFX._burst(E.x, E.z, { vol: i % 4 === 2 ? 0.12 : 0.06, dur: 0.05, f0: 7000, f1: 4000, type: 'highpass', q: 0.6, maxDist: 60 });
            if ([0, 3, 6, 10, 12].includes(i)) AudioFX._burst(E.x, E.z, { vol: 0.1, dur: 0.04, f0: 3200, f1: 2800, type: 'bandpass', q: 4, maxDist: 60 });
        }
        E.singT -= dt;
        if (E.singT <= 0) { E.singT = 5 + Math.random() * 5; Bubbles.say(this._pick(E.actors), this._pick(['♪ Deixa a vida me levar… ♪', '♪ Vou festejar, vou festejar! ♪', '♪ É o samba que mexe com a gente ♪', 'Alô, alô! Mais uma!', '♪ Lá lá laiá… ♪']), { ms: 2600 }); }
    },
    // --- pelada
    _start_pelada(game) {
        const s = this._spot(game, 20, 60, ['park', 'favela', 'plaza', 'residential']); if (!s) return;
        const sc = game.scene, ball = BABYLON.MeshBuilder.CreateSphere('peladaBall', { diameter: 0.28, segments: 8 }, sc);
        const bm = new BABYLON.StandardMaterial('ballM', sc); bm.diffuseColor = new BABYLON.Color3(0.96, 0.96, 0.94); bm.emissiveColor = new BABYLON.Color3(0.25, 0.25, 0.25); ball.material = bm; ball.isPickable = false;
        ball.position.set(s.x, 0.16, s.z);
        const P = [];
        for (let k = 0; k < 8; k++) { const x = s.x + (Math.random() - 0.5) * 10, z = s.z + (Math.random() - 0.5) * 6; P.push({ a: this._actor(game, Math.random() < 0.5 ? 'civil_estudante' : 'civil_torcedor', x, z, 0, 'run'), x, z, team: k % 2 }); }
        this.ev = { kind: 'pelada', t: 0, life: 240, x: s.x, z: s.z, actors: P.map((p) => p.a), meshes: [ball], P, ball: { x: s.x, z: s.z, vx: 0, vz: 0, m: ball }, shoutT: 3 };
    },
    _upd_pelada(game, dt, E) {
        const B = E.ball, nav = game.nav;
        // a bola: rola e freia; não sai do campinho (raio 9 m)
        B.x += B.vx * dt; B.z += B.vz * dt; B.vx *= Math.pow(0.35, dt); B.vz *= Math.pow(0.35, dt);
        const dx = B.x - E.x, dz = B.z - E.z, r = hypot(dx, dz);
        if (r > 9 || !nav.walk(B.x, B.z)) { B.vx = -B.vx * 0.6 - dx * 0.3; B.vz = -B.vz * 0.6 - dz * 0.3; B.x -= dx * 0.05; B.z -= dz * 0.05; }
        B.m.position.set(B.x, 0.16, B.z); B.m.rotation.x += B.vz * dt * 3; B.m.rotation.z -= B.vx * dt * 3;
        // cada um corre atrás da bola (os dois mais perto); os outros se posicionam
        const order = E.P.slice().sort((p, q) => hypot(p.x - B.x, p.z - B.z) - hypot(q.x - B.x, q.z - B.z));
        E.P.forEach((p) => {
            const chase = order.indexOf(p) < 3, tx = chase ? B.x : E.x + (p.team ? 4 : -4) + Math.sin(E.t * 0.7 + p.x) * 2, tz = chase ? B.z : E.z + Math.cos(E.t * 0.5 + p.z) * 3;
            const ex = tx - p.x, ez = tz - p.z, d = hypot(ex, ez), sp = chase ? 4.2 : 1.6;
            if (d > 0.35) { const k = Math.min(1, sp * dt / d); const nx = p.x + ex * k, nz = p.z + ez * k; if (nav.walk(nx, nz)) { p.x = nx; p.z = nz; } p.a.setHeading(Math.atan2(ex, ez)); }
            p.a.setPosition(p.x, p.z); p.a.play(d > 0.6 ? (chase ? 'run' : 'walk') : 'idle', 'none'); p.a.update(dt, 1);
            if (chase && d < 0.55 && hypot(B.vx, B.vz) < 3) {                     // chuta (para o gol do outro time)
                const gx = E.x + (p.team ? -9 : 9) - B.x, gz = E.z + (Math.random() - 0.5) * 4 - B.z, gl = hypot(gx, gz) || 1, v = 6 + Math.random() * 5;
                B.vx = gx / gl * v; B.vz = gz / gl * v;
                if (typeof AudioFX !== 'undefined' && AudioFX._burst) AudioFX._burst(B.x, B.z, { vol: 0.25, dur: 0.05, f0: 900, f1: 300, maxDist: 40 });
            }
        });
        E.shoutT -= dt;
        if (E.shoutT <= 0) { E.shoutT = 4 + Math.random() * 5; Bubbles.say(this._pick(E.actors), this._pick(['Toca! Toca!', 'GOOOL!', 'Ladrão! Foi falta!', 'Passa a bola, fominha!', 'Olha a marcação!', 'Chuta!']), { tone: Math.random() < 0.3 ? 'shout' : 'talk', ms: 1800 }); }
    },
    // --- pregação (domingo de manhã)
    _start_pregacao(game) {
        const s = this._spot(game, 15, 50, ['plaza', 'commercial', 'favela', 'park']); if (!s) return;
        const pastor = this._actor(game, 'civil_executivo', s.x, s.z, Math.PI);
        const actors = [pastor];
        for (let k = 0; k < 7; k++) { const x = s.x + (Math.random() - 0.5) * 6, z = s.z - 2 - Math.random() * 3; if (game.nav.walk(x, z)) actors.push(this._actor(game, Math.random() < 0.5 ? 'civil_vovo' : this._civ(), x, z, Math.atan2(s.x - x, s.z - z))); }
        this.ev = { kind: 'pregacao', t: 0, life: 260, x: s.x, z: s.z, actors, pastor, talkT: 1.5 };
    },
    _upd_pregacao(game, dt, E) {
        for (const a of E.actors) a.update(dt, 1);
        E.talkT -= dt;
        if (E.talkT <= 0) {
            E.talkT = 4 + Math.random() * 3;
            if (Math.random() < 0.7) Bubbles.say(E.pastor, this._pick(['Irmãos, Jesus te ama!', 'Aleluia! O Senhor é fiel!', 'Larga essa vida, meu filho! Ainda dá tempo!', 'Quem tem fé não tem medo!', 'Glória a Deus!']), { tone: 'shout', ms: 2800 });
            else Bubbles.say(this._pick(E.actors.slice(1)), this._pick(['Amém!', 'Aleluia!', 'Glória!', 'Amém, pastor!']), { ms: 1800 });
        }
    },

    // ------------------------------------------------------------------ E: separar a briga, devolver a bolsa, comprar no carrinho
    prompt(game) {
        const E = this.ev; if (!E || game.mode !== 'player') return '';
        const P = game.player.position;
        if (E.kind === 'briga' && hypot(E.a.position.x - P.x, E.a.position.z - P.z) < 4) return '<b>E</b> separar a briga<small>o bairro vai lembrar</small>';
        if (E.kind === 'pivete' && E.got && !E.done && hypot(E.v.position.x - P.x, E.v.position.z - P.z) < 3) return `<b>E</b> devolver a bolsa<small>${brl(E.value)} — ou fique com ela</small>`;
        if (E.kind === 'ambulante' && hypot(E.x - P.x, E.z - P.z) < 2.8) return '<b>E</b> comprar no carrinho<small>água de coco, milho, churros, picolé, espetinho</small>';
        return '';
    },
    interact(game) {
        if (!this.prompt(game)) return false;
        const E = this.ev, P = game.player.position;
        if (E.kind === 'briga') {
            for (const n of [E.a, E.b]) if (n.alive) { n.toWander ? n.toWander() : n.panic(P); }
            Bubbles.say(E.a, this._pick(['Tá bom, tá bom… valeu.', 'Ele que começou!', 'Só porque é você, chefe.']), { ms: 2400 });
            if (typeof WorldMemory !== 'undefined') WorldMemory.good(P.x, P.z, 6, 'separou uma briga');
            game._flash('🤝 Você separou a briga — o bairro gosta de quem segura a onda');
            this._end(game); return true;
        }
        if (E.kind === 'pivete') {
            E.done = true;
            const tip = Math.round(E.value * (0.25 + Math.random() * 0.25));
            game.inventory.addCash(tip);
            Bubbles.say(E.v, this._pick(['Deus te pague, meu filho!', 'Muito obrigada! Toma, é pra você.', 'Nem acredito! Obrigado!']), { ms: 2600 });
            if (typeof WorldMemory !== 'undefined') WorldMemory.good(P.x, P.z, 8, 'devolveu uma bolsa');
            game._flash(`🙏 Bolsa devolvida — a vítima te dá ${brl(tip)} de gorjeta`);
            this._end(game); return true;
        }
        if (E.kind === 'ambulante') {
            if (!this._vp) this._vp = new Panel('streetVendor', { width: 440, onAct: (a, arg) => this._buy(game, arg) });
            this._vp.show('🛒 Carrinho do ambulante', 'Tudo fresquinho, freguês!', this.ITEMS.map(([id, label, price, kcal, heal]) => Panel.btn('buy', `${label} — ${brl(price)}`, { arg: id, on: game.inventory.cash >= price })).join(' '));
            return true;
        }
        return false;
    },
    _buy(game, id) {
        const it = this.ITEMS.find((q) => q[0] === id); if (!it) return;
        const [, label, price, kcal, heal] = it, inv = game.inventory, pl = game.player;
        if (inv.cash < price) { this._vp.msg('Dinheiro insuficiente', false); return; }
        inv.cash -= price;
        if (kcal && typeof Physique !== 'undefined') Physique.eat(kcal);
        if (id === 'agua' && typeof Needs !== 'undefined') Needs.drink(25);
        pl.hp = Math.min(pl.maxHp, pl.hp + heal);
        this._vp.msg(`${label}: bom demais! (−${brl(price)})`);
        if (this.ev && this.ev.a) Bubbles.say(this.ev.a, 'Valeu, freguês! Volte sempre!', { ms: 2000 });
    },

    // ------------------------------------------------------------------ conversas na rua
    _chatter(game, dt) {
        this.chatT -= dt; if (this.chatT > 0) return;
        this.chatT = 5 + Math.random() * 6;
        if (game.mode !== 'player' || typeof Bubbles === 'undefined') return;
        const P = game.player.position, L = game.npcManager.npcs.filter((n) => this._calm(n) && !n.thief && hypot(n.position.x - P.x, n.position.z - P.z) > 2 && hypot(n.position.x - P.x, n.position.z - P.z) < 9);
        if (!L.length) return;
        const n = L[Math.floor(Math.random() * L.length)], d = game.empire ? game.empire.districtAt(P.x, P.z) : null;
        const F = typeof WorldMemory !== 'undefined' ? WorldMemory.fameAt(P.x, P.z) : { fear: 0, respect: 0 };
        if (F.fear >= 45 && Math.random() < 0.5) { Bubbles.say(n, this._pick(['É ele… não olha.', 'Fala baixo, é aquele cara.', 'Atravessa a rua, vai.', 'Esse aí é perigoso…']), { tone: 'whisper', ms: 2600 }); return; }
        if (F.respect >= 40 && Math.random() < 0.25) { Bubbles.say(n, this._pick(['E aí, chefe! Tudo certo?', 'Salve! Valeu por aquela!', 'Fala, meu amigo!']), { ms: 2400 }); return; }
        if (Math.random() < 0.12) { const t = this._newTip(game, d); if (t) { Bubbles.say(n, t, { tone: 'hint', ms: 4600 }); return; } }
        Bubbles.say(n, typeof News !== 'undefined' ? News.chatter(d) : '…', { ms: 3200 });
    },
    // Uma dica de verdade: o caixa de uma loja do bairro fica cheio num horário (Robbery.tipMul paga mais nesse horário, por 2 dias).
    _newTip(game, d) {
        if (typeof Interiors === 'undefined' || typeof Robbery === 'undefined') return null;
        Interiors.index();
        const P = game.player.position, doors = Interiors._doors.filter((s) => Robbery.TIER[s.style] && s.style !== 'jewelry' && hypot(s.x - P.x, s.z - P.z) < 600);
        if (!doors.length) return null;
        const s = doors[Math.floor(Math.random() * doors.length)], h0 = 17 + Math.floor(Math.random() * 4), h1 = h0 + 2;
        this.tips.push({ id: s.id, h0, h1, until: Economy.day + 2, name: s.name });
        if (this.tips.length > 6) this.tips.shift();
        return this._pick([`(cochicho) ${s.name}… o caixa fica cheio entre ${h0}h e ${h1}h.`, `${s.name}, sabe? Só mandam o dinheiro pro banco depois das ${h1}h.`, `Meu primo trabalha ali, ${s.name}: das ${h0}h às ${h1}h o caixa estoura.`]);
    },
    tipMul(shop) {
        const g = this.g, h = g && g.dayNight ? g.dayNight.hour : 12;
        const t = this.tips.find((q) => q.id === shop.id && Economy.day <= q.until && h >= q.h0 && h < q.h1);
        return t ? 1.7 : 1;
    },
};
