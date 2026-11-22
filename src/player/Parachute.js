// ============================================================================
// Parachute — o PARAQUEDAS (item da mochila: Items 'paraquedas', vendido no balcão do aeroporto e na loja de armas).
//   SALTAR       F no ar, de avião (vehicle/Plane.js) ou de helicóptero (vehicle/Chopper.js), com o paraquedas na mochila e pelo menos
//                ~25 m de altura. Sem paraquedas: a queda de sempre (Game._updateHeliFall — mortal em terra, a água salva).
//   QUEDA LIVRE  até ~180 km/h. W/S/A/D deslizam (W: mergulho para a frente, A/D giram), o vento ruge; abaixo de 250 m o aviso pisca.
//   ABRIR        ESPAÇO (ou F): o velame infla em ~1,4 s e a queda vira ~4,5 m/s.
//   NO VELAME    A/D curva · W acelera (desce mais rápido) · S freia — frear perto do chão (o "flare") faz o pouso macio.
//   POUSO        tocar o chão descendo devagar: em pé (o paraquedas fica no chão e some); rápido demais: machuca; sem abrir: morte. Na
//                água: nada. Em telhado: desce pela escada (volta à rua). Cada salto gasta um paraquedas (é preciso dobrar de novo).
// O SALTO DO CLUBE (balcão do aeroporto, Airport): o teco-teco do aeroclube te leva a ~650 m sobre o aeroporto; pouse no ALVO (o
// círculo laranja na grama ao lado da pista): quanto mais perto, maior o prêmio.
// ============================================================================

const Parachute = {
    s: null,                         // o salto em andamento: { phase: 'free'|'opening'|'open', x, z, y (absoluto), vx, vz, vy, heading, t, k }
    stats: { jumps: 0, landed: 0, hard: 0, splat: 0, best: null },
    target: null,                    // { x, z, r } — o alvo do salto do clube
    TERM: 52,                        // velocidade terminal (m/s)

    has(game) { return Items.has(game.inventory, 'paraquedas'); },
    get active() { return !!this.s; },
    agl() { const s = this.s; return s ? s.y - this._ground(s.x, s.z) : 0; },
    _ground(x, z) { return (typeof Relief !== 'undefined' ? Relief.at(x, z) : 0) + Chopper.floorAt(x, z); },

    // ---------------------------------------------------------------- saltar
    jump(game, x, z, y, vx = 0, vz = 0) {
        const pl = game.player;
        this.s = { phase: 'free', x, z, y, vx, vz, vy: -2, heading: Math.atan2(vx || 0.001, vz || 1), t: 0, k: 0, warn: false };
        this.stats.jumps++;
        pl.frozen = true; pl.velocity.setAll(0); pl.setVisible(true);
        pl.actor.play('flail', 'none', { restart: true });
        this._canopy(game).setEnabled(false);
        AudioFX.blip(300, 0.15, 0.2);
        game._flash(`🪂 Saltou! Queda livre — ESPAÇO abre o paraquedas · W/A/S/D desliza · ${Math.round(this.agl())} m de altura`);
        this._place(game);
    },
    // Abrir o velame.
    open(game) {
        const s = this.s; if (!s || s.phase !== 'free') return;
        s.phase = 'opening'; s.t = 0;
        this._canopy(game).setEnabled(true);
        AudioFX.blip(180, 0.2, 0.25); AudioFX.thud && AudioFX.thud(s.x, s.z);
        game.camera.shake(0.25);
    },

    // ---------------------------------------------------------------- por quadro (Game, junto da queda do helicóptero)
    update(dt, game) {
        const s = this.s;
        if (!s) { if (this._wind) AudioFX.wind && AudioFX.wind(0); this._tickGround(dt, game); this._tickTarget(dt, game); return; }
        const inp = game.input, ax = inp.getMoveAxis(), G = 9.8;
        s.t += dt;
        if (s.phase === 'free') {
            if (inp.consumePress(' ') | inp.consumePress('f') | inp.consumePress('padjump')) { this.open(game); }
            s.heading += ax.x * 1.5 * dt;
            const fx = Math.sin(s.heading), fz = Math.cos(s.heading), fwd = 6 + Math.max(-4, ax.z * 10);
            const tx = fx * fwd, tz = fz * fwd, k = Math.min(1, dt * 0.8);
            s.vx += (tx - s.vx) * k; s.vz += (tz - s.vz) * k;
            s.vy += (-G - Math.sign(s.vy) * (G / (this.TERM * this.TERM)) * s.vy * s.vy) * dt;
            if (!s.warn && this.agl() < 250) { s.warn = true; game._flash('⚠ ABRA O PARAQUEDAS — ESPAÇO!'); }
            AudioFX.wind && AudioFX.wind(Math.min(1, -s.vy / this.TERM));
        } else {
            if (s.phase === 'opening') { s.k = Math.min(1, s.t / 1.4); if (s.k >= 1) { s.phase = 'open'; game._flash('🪂 Velame aberto! A/D curva · W acelera · S freia — freie antes de tocar o chão'); } }
            const turn = ax.x * 0.95 * (s.phase === 'open' ? 1 : 0.3);
            s.heading += turn * dt; s.bank = (s.bank || 0) + (-turn * 0.45 - (s.bank || 0)) * Math.min(1, dt * 3);
            const fwd = ax.z > 0.2 ? 13 : ax.z < -0.2 ? 4 : 9, sink = ax.z > 0.2 ? 6.5 : ax.z < -0.2 ? 2.6 : 4.5;
            const kk = Math.min(1, dt * (s.phase === 'opening' ? 2.5 : 1.6));
            s.vx += (Math.sin(s.heading) * fwd - s.vx) * kk; s.vz += (Math.cos(s.heading) * fwd - s.vz) * kk;
            s.vy += (-sink - s.vy) * Math.min(1, dt * (s.phase === 'opening' ? 2.2 : 2.5));
            s.flare = ax.z < -0.2;
            AudioFX.wind && AudioFX.wind(0.12 + Math.hypot(s.vx, s.vz) / 60);
            if (typeof Weather !== 'undefined' && Weather.cur && Weather.cur.k > 0.3) { s.vx += (Math.random() - 0.5) * 3 * Weather.cur.k * dt; s.vz += (Math.random() - 0.5) * 3 * Weather.cur.k * dt; }
        }
        s.x += s.vx * dt; s.z += s.vz * dt; s.y += s.vy * dt;
        const W = Config.world; s.x = Math.max(W.minX + 5, Math.min(W.maxX - 5, s.x)); s.z = Math.max(W.minZ + 5, Math.min(W.maxZ - 5, s.z));
        const gy = this._ground(s.x, s.z);
        if (s.y <= gy) { this._land(game, gy); return; }
        this._place(game);
        this._tickTarget(dt, game);
    },
    _place(game) {
        const s = this.s, pl = game.player, a = pl.actor, g = typeof Relief !== 'undefined' ? Relief.at(s.x, s.z) : 0;
        pl.root.position.x = s.x; pl.root.position.z = s.z; pl.velocity.setAll(0);
        a.setPosition(s.x, s.z); a.setHeading(s.heading);
        a.mesh.position.y = (pl.baseY != null ? pl.baseY : 0.5) + Math.max(0, s.y - g);                 // (o ator já sobe com o relevo: SpriteActor.lift)
        const fc = a.clip; if (s.phase === 'free' && fc && fc.fps > 0) a.setPhase(s.t * fc.fps / fc.frames * 0.6);
        const C = this._cv;
        if (C && s.phase !== 'free') {
            C.position.set(s.x, s.y + 0.2, s.z); C.rotation.y = s.heading; C.rotation.z = s.bank || 0;
            const k = s.phase === 'opening' ? 0.25 + 0.75 * s.k : 1; C.scaling.set(k, s.flare ? 0.9 : 1, k);
        }
        const cam = game.camera;
        if (cam.setAir) cam.setAir(Math.min(1, (cam.airK || 0) + 0.05), Math.max(0, s.y - g));
    },
    // A altura que a câmera sobe junto (Game: o ramo a pé).
    lift() { const s = this.s; return s ? Math.max(0, s.y - (typeof Relief !== 'undefined' ? Relief.at(s.x, s.z) : 0)) : 0; },

    _land(game, gy) {
        const s = this.s, pl = game.player, a = pl.actor, roof = Chopper.floorAt(s.x, s.z);
        this.s = null;
        AudioFX.wind && AudioFX.wind(0);
        if (game.camera.setAir) game.camera.setAir(0);
        pl.frozen = false;
        const water = roof === 0 && typeof MapGeo !== 'undefined' && MapGeo.waterDepth(s.x, s.z) > 0.6;
        let pos = new BABYLON.Vector3(s.x, 0, s.z);
        if (roof > 0) { const q = game.nav && game.nav.closestPoint ? game.nav.closestPoint(pos, 40) : null; if (q) pos = new BABYLON.Vector3(q.x, 0, q.z); }
        const sink = -s.vy, opened = s.phase !== 'free';
        if (opened) {
            Items.take(game.inventory, 'paraquedas', 1);
            this._drop(game, s, roof > 0 ? pos : null);
        } else this._canopy(game).setEnabled(false);
        pl.teleport(pos); pl.setVisible(true);
        if (water) {
            for (let i = 0; i < 6; i++) game.waterFx && game.waterFx.ripple(s.x + (Math.random() - 0.5) * 2, s.z + (Math.random() - 0.5) * 2, 0.8, 5, 1.4, 0.8);
            AudioFX.splash && AudioFX.splash(s.x, s.z, !opened);
            this.stats.landed++;
            game._flash(opened ? '🪂 Pousou na água — solte o velame e nade' : 'Caiu na água em queda livre… e sobreviveu!');
        } else if (!opened) {
            this.stats.splat++;
            pl.hp = 0; pl.armor = 0;
            pl.ragdoll({ dx: s.vx || 0.01, dz: s.vz || 0.01, power: 12, kind: 'hit', lethal: true });
            AudioFX.thud(s.x, s.z); game.camera.shake(0.9);
            game._flash('O paraquedas não abriu…');
        } else if (sink > 7.5) {
            this.stats.hard++;
            pl.takeDamage(Math.min(pl.hp - 5, (sink - 7.5) * 14 + 10), true);
            pl.ragdoll({ dx: s.vx || 0.01, dz: s.vz || 0.01, power: 6, kind: 'bail' });
            AudioFX.thud(s.x, s.z);
            game._flash('🪂 Pouso duro! Freie (S) antes de tocar o chão');
        } else {
            this.stats.landed++;
            a.play('idle');
            const soft = s.flare || sink < 3.5;
            game._flash(roof > 0 ? '🪂 Pousou no telhado e desceu pela escada' : soft ? '🪂 Pouso perfeito!' : '🪂 Pousou');
        }
        a.mesh.position.y = pl.baseY != null ? pl.baseY : 0.5;
        if (this.target) this._score(game, s, opened && !water);
    },

    // ---------------------------------------------------------------- o velame (3D: células listradas em arco, as linhas até o arnês)
    _canopy(game) {
        if (this._cv) return this._cv;
        const sc = game.scene, b = new MeshBatch(), C = (h) => PlaneVisual.C(h), cols = [C('#e8402f'), C('#f6f2ea'), C('#f2b52a'), C('#f6f2ea'), C('#e8402f'), C('#1f4f9a'), C('#e8402f')];
        const N = 7, R = 6.2, H = 6.6, ch = 1.45, uv = [[0, 0], [0, 0], [0, 0]];
        const P = (i, z, dy) => { const a = -0.62 + 1.24 * i / N; return [Math.sin(a) * R, Math.cos(a) * R - R + H + dy, z]; };
        for (let i = 0; i < N; i++) {
            const col = cols[i % cols.length], q = (A, B, Cc, D, n) => { b.tri(A, B, Cc, n, uv, col); b.tri(A, Cc, D, n, uv, col); };
            const am = -0.62 + 1.24 * (i + 0.5) / N, n = [Math.sin(am), Math.cos(am), 0];
            q(P(i, -ch, 0.3), P(i + 1, -ch, 0.3), P(i + 1, ch, 0.3), P(i, ch, 0.3), n);                                  // a capa de cima
            q(P(i, -ch, 0), P(i, ch, 0), P(i + 1, ch, 0), P(i + 1, -ch, 0), [-n[0], -n[1], 0]);                          // a de baixo
            q(P(i, ch, 0), P(i, ch, 0.3), P(i + 1, ch, 0.3), P(i + 1, ch, 0), [0, 0, 1]);                                 // a boca (frente)
        }
        for (let i = 0; i <= N; i += 1) for (const z of [-ch * 0.8, ch * 0.6]) b.tube(P(i, z, 0), [0, 1.25, z * 0.1], 0.015, 0.015, C('#d9d6ce'), 3);      // as linhas
        const m = b.build('parachute', sc, PlaneVisual.mats(sc).body, { vertexColors: true, receiveShadows: false, alwaysActive: true });
        m.unfreezeWorldMatrix();
        this._cv = m;
        m.setEnabled(false);
        return m;
    },
    // Depois do pouso: o velame murcho no chão por alguns segundos.
    _drop(game, s, at) {
        const C = this._canopy(game), x = at ? at.x : s.x + Math.sin(s.heading) * 3.5, z = at ? at.z : s.z + Math.cos(s.heading) * 3.5;
        C.setEnabled(true); C.position.set(x, (typeof Relief !== 'undefined' ? Relief.at(x, z) : 0) - 5.9, z); C.rotation.z = 0; C.scaling.set(1.1, 0.12, 1.1);
        this._groundT = 5;
    },
    _tickGround(dt, game) {
        if (!(this._groundT > 0)) return;
        this._groundT -= dt;
        if (this._groundT <= 0 && this._cv) this._cv.setEnabled(false);
    },

    // ---------------------------------------------------------------- o salto do clube (alvo e prêmio)
    startClubJump(game) {
        const A = typeof Airport !== 'undefined' ? Airport : null, gx = -700, gz = 40;
        if (!this.has(game)) Items.add(game.inventory, 'paraquedas', 1);
        this.target = { x: A ? A.TARGET.x : gx, z: A ? A.TARGET.z : gz, r: 6 };
        const y = (typeof Relief !== 'undefined' ? Relief.at(gx, gz) : 0) + 650;
        // o teco-teco do aeroclube passa lá em cima e volta sozinho para o pátio
        const plane = game.choppers.find((c) => c.isPlane && c.M.id === 'teco' && c.alive && !c.pilot);
        if (plane && plane.ghostFly) plane.ghostFly(gx - 30, y + 2, gz - 120, 0.25);
        Interiors._fade ? Interiors._fade(() => this.jump(game, gx - 25, gz - 110, y, Math.sin(0.25) * 30, Math.cos(0.25) * 30)) : this.jump(game, gx - 25, gz - 110, y, 8, 30);
        return '🪂 Salto do aeroclube: o teco-teco te leva a 650 m — pouse no alvo laranja ao lado da pista';
    },
    _score(game, s, ok) {
        const T = this.target; this.target = null;
        if (this._tg) { for (let i = 0; i < this._tgN; i++) this._tg.off(i); this._tg.flush(); }
        if (!ok) return;
        const d = Math.hypot(s.x - T.x, s.z - T.z), prize = d < 5 ? 500 : d < 15 ? 200 : d < 40 ? 60 : 0;
        if (this.stats.best == null || d < this.stats.best) this.stats.best = Math.round(d * 10) / 10;
        if (prize) game.inventory.cash += prize;
        game._delayed.push({ t: 1.6, fn: () => game._flash(`🎯 A ${d.toFixed(1)} m do alvo${prize ? ` — prêmio do aeroclube: +${brl(prize)}` : ' — longe demais para o prêmio'}`) });
    },
    // O alvo: um anel laranja na grama (pisca de leve).
    _tickTarget(dt, game) {
        const T = this.target; if (!T) return;
        if (!this._tg) { this._tgN = 18; this._tg = new GlowBatch(game.scene, this._tgN, 'skyTarget', 'glow'); for (let i = 0; i < this._tgN; i++) this._tg.alloc(); }
        this._tt = (this._tt || 0) + dt;
        const k = 0.7 + 0.3 * Math.sin(this._tt * 3);
        for (let i = 0; i < this._tgN - 1; i++) { const a = i / (this._tgN - 1) * Math.PI * 2; this._tg.place(i, T.x + Math.cos(a) * T.r * 2, 0.2, T.z + Math.sin(a) * T.r * 2, 2.2); this._tg.color(i, 1 * k, 0.45 * k, 0.05, 0.9); }
        this._tg.place(this._tgN - 1, T.x, 0.2, T.z, 5); this._tg.color(this._tgN - 1, 1 * k, 0.5 * k, 0.1, 0.9);
        this._tg.flush();
    },

    // O texto do HUD durante o salto (Game).
    prompt() {
        const s = this.s; if (!s) return null;
        const h = Math.round(this.agl()), v = Math.round(-s.vy * 3.6), T = this.target, td = T ? ` · alvo a ${Math.round(Math.hypot(s.x - T.x, s.z - T.z))} m` : '';
        if (s.phase === 'free') return `<b>ESPAÇO</b> ABRIR O PARAQUEDAS<small>${h} m · caindo a ${v} km/h · <b>W</b> mergulha · <b>A/D</b> gira${td}</small>`;
        return `<b>A/D</b> curva · <b>W</b> acelera · <b>S</b> freia<small>${h} m · descendo ${(-s.vy).toFixed(1)} m/s${h < 25 ? ' · <b>FREIE AGORA (S)</b>' : ''}${td}</small>`;
    },
    serialize() { return { stats: this.stats }; },
    load(d) { this.s = null; this.target = null; this.stats = Object.assign({ jumps: 0, landed: 0, hard: 0, splat: 0, best: null }, (d && d.stats) || {}); },
};

// O paraquedas na mochila e os serviços do balcão do aeroporto (Economy: ShopUI).
if (typeof Items !== 'undefined') {
    Items.DEFS.paraquedas = { name: 'Paraquedas', emo: '🪂', w: 2, stack: 1, kg: 7, price: 900, cat: 'tool', desc: 'Salte de avião ou helicóptero (F no ar) e abra com ESPAÇO — gasta um por salto' };
    if (typeof Emoji !== 'undefined') Emoji.CHAR[Items.key('paraquedas')] = '🪂';
}
if (typeof Economy !== 'undefined') {
    const E = Economy, svc = (id, name, emo, base, desc, act, can) => { E.ITEMS[id] = { name, icon: 'svc_' + id, base, kind: 'service', desc, act, can }; if (typeof Emoji !== 'undefined') Emoji.CHAR['svc_' + id] = emo; };
    E.ITEMS.it_paraquedas = { name: 'Paraquedas', icon: Items.key('paraquedas'), base: 900, kind: 'item', item: 'paraquedas', desc: Items.DEFS.paraquedas.desc };
    const rent = (m) => (game) => { const p = game.choppers.find((c) => c.isPlane && c.M.id === m && c.alive); p.rented = true; p.stolenWarned = false; return `${p.M.name} alugado: vá ao pátio pelo portão de embarque (à direita do terminal) e F para embarcar`; };
    const avail = (m) => (game) => { const p = game.choppers.find((c) => c.isPlane && c.M.id === m); return !p || !p.alive ? 'Esse avião não está no pátio agora' : p.rented ? 'Esse já está alugado para você' : p.pilot ? 'Esse avião está em uso' : null; };
    svc('air_teco', 'Aluguel: teco-teco', '🛩️', Plane.MODELS.teco.rent, 'Monomotor de asa alta: decola curto, voa devagar — o melhor para aprender', rent('teco'), avail('teco'));
    svc('air_bimotor', 'Aluguel: bimotor', '🛩️', Plane.MODELS.bimotor.rent, 'Executivo de dois motores: mais rápido e sobe mais', rent('bimotor'), avail('bimotor'));
    svc('air_jato', 'Aluguel: jatinho', '✈️', Plane.MODELS.jato.rent, 'Jato executivo: o mais rápido — precisa da pista quase toda', rent('jato'), avail('jato'));
    svc('air_salto', 'Salto de paraquedas (aeroclube)', '🪂', 350, 'O teco-teco do clube te leva a 650 m (paraquedas incluso) — pouse no alvo e ganhe o prêmio', (game) => Parachute.startClubJump(game), (game) => (Parachute.active ? 'Você já está saltando' : null));
    E.STYLES.airport = { label: 'Balcão do Aeroporto', tier: 1.0, hours: [5, 23], fixed: true, stock: [['air_salto'], ['it_paraquedas'], ['air_teco'], ['air_bimotor'], ['air_jato']] };
    E.STYLES.guns.stock.push(['it_paraquedas', 0.6, 2]);
}
