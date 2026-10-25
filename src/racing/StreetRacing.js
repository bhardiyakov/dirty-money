// ============================================================================
// StreetRacing — as CORRIDAS (referências: Need for Speed Underground 2 e Burnout).
//
//   PONTOS DE RACHA   na rua em frente a alguns postos de gasolina (anel aceso no chão, ícone 🏁 no mapa) e o portão do AUTÓDROMO
//                     (Speedway, ícone 🏎️). Chegue DE CARRO, pare no anel e aperte E: a lista das corridas do dia.
//   MODALIDADES       RACHA (1×1 numa reta de ~400 m: arrancada, quem cruzar primeiro) · CORRIDA DE RUA (do A ao B pelas ruas, com o
//                     trânsito, checkpoints como no GTA V — o cilindro do próximo, a seta para o seguinte e o radar apontando) ·
//                     CIRCUITO (algumas voltas por um quarteirão, também com checkpoints) · AUTÓDROMO (oval fechado, várias voltas,
//                     grid de até 8 carros, sem trânsito — "NASCAR") · RACHA VALENDO O DOCUMENTO (só lendas: quem ganha leva o carro).
//   NA CORRIDA        largada com semáforo (acelerar bem no VAI! = largada perfeita, com nitro; acelerar antes = queimou a largada e
//                     o carro segura); NITRO no Shift / A do controle / botão NITRO no celular (carga por corrida); TAKEDOWN (Burnout):
//                     jogar um rival no muro ou no trânsito até ele capotar/explodir rende reputação e enche o nitro. Batida muito
//                     forte capota e explode (Game._burnout) — o seu carro também: aí você está fora.
//   RIVAIS            RaceCar: pilotos da IA com carros tunados (neon, aerofólio, bodykit) por dificuldade — populares
//                     envenenados → esportivos → superesportivos — e um "elástico" leve (quem dispara alivia, quem fica para trás aperta).
//   PRÊMIOS           rua: dinheiro SUJO (e à noite, +25%); autódromo: dinheiro LIMPO (evento legal). Inscrição (a dos iniciantes é
//                     de graça). 1º leva o prêmio; 2º e 3º, uma parte (racha: o vencedor leva tudo).
//   REPUTAÇÃO         a fama no meio underground (TIERS: de Desconhecido a Rei das ruas): sobe com a colocação, os takedowns e a largada
//                     perfeita, e libera as corridas mais caras (e o racha de documento). Salva com o jogo.
//   POLÍCIA           racha na rua com viatura por perto vira procurado (1 estrela).
//
// Game chama: update(game, dt) · control(game, car, axis, dt) (true = o carro do jogador está segurado) · carPrompt/carInteract ·
// onImpact (batidas) · onTumbleEnd (capotou) · blips(out) / gpsTarget() (radar) · serialize/load.
// ============================================================================

const StreetRacing = {
    rep: 0,
    stats: { races: 0, wins: 0, podiums: 0, takedowns: 0, earned: 0, pinks: 0 },
    best: {},
    meets: [], built: false, cur: null, game: null,
    TIERS: [[0, 'Desconhecido'], [150, 'Novato do asfalto'], [500, 'Piloto de rua'], [1200, 'Respeitado'], [2500, 'Temido'], [5000, 'Lenda do asfalto'], [9000, 'Rei das ruas']],
    MIN_TIER: [0, 2, 4, 5],                        // reputação (nível) para cada dificuldade 0..3
    PRIZE: { drag: [500, 1400, 4000, 11000], sprint: [800, 2200, 6500, 16000], circuit: [1000, 2800, 8000, 19000], oval: [1200, 3500, 9500, 24000] },
    REPB: { drag: [50, 110, 240, 500], sprint: [70, 150, 320, 650], circuit: [80, 170, 360, 700], oval: [90, 190, 400, 800] },
    PLACE: [1, 0.5, 0.3, 0.12],                    // reputação por colocação (fração da base)
    MODELS: [
        ['hatch_esportivo', 'sedan_medio', 'sedan_70', 'hatch_moderno', 'sedan_popular'],
        ['hatch_esportivo', 'sedan_luxo', 'esportivo', 'sedan_70', 'muscle'],
        ['esportivo', 'muscle', 'sedan_luxo', 'super'],
        ['super', 'super2', 'muscle', 'esportivo'],
    ],
    SKILL: [[0.8, 0.88], [0.86, 0.94], [0.92, 1.0], [0.97, 1.05]],
    NAMES: ['Japa do Turbo', 'Neguinho do Grau', 'Tatá Nitro', 'Mancha', 'Beto Escapamento', 'Dona Fumaça', 'Kiko Turbina', 'Rafa Rebaixado',
        'Gringo', 'Caveira', 'Lelê Drift', 'Marrento', 'Paty Neon', 'Zé do Opala', 'Dentuço', 'Bia Racha'],
    BOSS: 'Rei da Zona Sul',
    TYPE: { drag: '🏁 Racha 1×1', sprint: '🏙️ Corrida de rua', circuit: '🔄 Circuito', oval: '🏎️ Autódromo', pink: '👑 Racha valendo o documento' },

    get racing() { return !!(this.cur && this.cur.phase === 'race'); },
    tier(rep = this.rep) { let t = 0; for (let i = 0; i < this.TIERS.length; i++) if (rep >= this.TIERS[i][0]) t = i; return t; },
    tierName(t = this.tier()) { return this.TIERS[t][1]; },

    // ---------------------------------------------------------------- pontos de racha
    build(game) {
        if (this.built || !game.physicsReady || !CityGrid.pois) return;
        this.built = true; this.game = game;
        const st = (CityGrid.stations || []).slice().sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)), picked = [];
        for (const s of st) {
            if (picked.length >= 5) break;
            if (picked.some((m) => Math.hypot(m.st.x - s.x, m.st.z - s.z) < 380)) continue;
            const r = RoadPlan.nearestRoadPoint(s.x, s.z, 60);
            if (!r || r.edge.cls === 'trail' || r.edge.cls === 'fav') continue;
            // o anel fica na RUA em frente ao posto (na faixa), afastado da borracharia (a vaga do posto é a do Mechanic)
            const t = RoadPlan.at(r.edge, Math.max(14, Math.min(r.edge.len - 14, r.s + 16))), lane = r.edge.w / 4;
            picked.push({ st: s, x: t.x + t.tz * lane, z: t.z - t.tx * lane, tx: t.tx, tz: t.tz });
        }
        picked.forEach((m, i) => {
            let name = `Racha do ${m.st.name.replace(/^Posto\s+/i, '')}`;
            if (this.meets.some((q) => q.name === name)) name += ' ' + ['II', 'III', 'IV', 'V'][this.meets.filter((q) => q.name.startsWith(name)).length - 1];
            this.meets.push({ id: 'rua' + i, kind: 'street', name, x: m.x, z: m.z, tx: m.tx, tz: m.tz });
            CityGrid.addPoi({ type: 'racemeet', name, x: m.x, z: m.z });
        });
        if (Speedway.site) { const g = Speedway.site.gate; this.meets.push({ id: 'arena', kind: 'speedway', name: Speedway.NAME, x: g.x, z: g.z }); }
        this.glow = new GlowBatch(game.scene, this.meets.length + 2, 'raceMeets', 'ring');
        for (let i = 0; i < this.meets.length; i++) { this.glow.alloc(); this.glow.off(i); }
        console.log(`[CORRIDAS] ${this.meets.length} pontos de racha: ${this.meets.map((m) => m.name).join(' · ')}`);
    },
    meetAt(x, z, r = 9) { let best = null, bd = r; for (const m of this.meets) { const d = Math.hypot(m.x - x, m.z - z); if (d < bd) { bd = d; best = m; } } return best; },

    // ---------------------------------------------------------------- as corridas do dia (por ponto)
    _rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; },
    events(meet) {
        const g = this.game, day = typeof Economy !== 'undefined' ? Economy.day || 0 : 0, block = Math.floor((g.dayNight.hour || 0) / 6), t = this.tier();
        const key = `${meet.id}|${day}|${block}|${t}`;
        if (meet._key === key) return meet._events;
        const rng = this._rng(NpcData.hashStr ? NpcData.hashStr(key) : day * 977 + block * 31 + 7), d0 = Math.min(3, Math.floor(t / 2)), list = [];
        const night = g.dayNight.night > 0.5;
        const mk = (type, d, extra = {}) => {
            const base = type === 'pink' ? 'drag' : type, prize = Math.round(this.PRIZE[base][d] * (meet.kind === 'street' && night ? 1.25 : 1) * (0.9 + rng() * 0.2) / 50) * 50;
            const ev = Object.assign({ id: `${meet.id}:${type}:${d}`, type, d, prize, fee: d === 0 ? 0 : Math.round(prize * 0.2 / 50) * 50, rep: Math.round(this.REPB[base][d] * (night && meet.kind === 'street' ? 1.25 : 1)),
                minTier: this.MIN_TIER[d], night: night && meet.kind === 'street', seed: Math.floor(rng() * 1e9) }, extra);
            list.push(ev);
            return ev;
        };
        if (meet.kind === 'speedway') {
            mk('oval', 0, { name: 'Copa Arena — Estreantes', rivals: 4, laps: 3 });
            mk('oval', 1, { name: 'Copa Arena — Profissional', rivals: 5, laps: 5 });
            mk('oval', 2, { name: 'Grande Prêmio Arena', rivals: 7, laps: 6 });
            mk('oval', 3, { name: 'Desafio dos Campeões', rivals: 7, laps: 8 });
        } else {
            mk('drag', d0, { name: 'Racha na reta', rivals: 1 });
            mk('sprint', d0, { name: 'Corrida pela cidade', rivals: 3 });
            mk('circuit', Math.min(3, d0 + (rng() < 0.5 ? 0 : 1)), { name: 'Circuito do quarteirão', rivals: 3, laps: 2 });
            if (d0 < 3) mk('sprint', d0 + 1, { name: 'Corrida dos grandes', rivals: 3 });
            mk('pink', 3, { name: 'Racha valendo o documento', rivals: 1, minTier: 5, fee: 0, prize: 0 });
        }
        meet._key = key; meet._events = list;
        return list;
    },

    // ---------------------------------------------------------------- traçados
    _ovalPath() {
        if (this._oval) return this._oval;
        const pts = [];
        for (let s = 0; s < Speedway.L - 0.5; s += 3) { const p = Speedway.at(s, 0); pts.push({ x: p.x, z: p.z }); }
        return (this._oval = new RacePath(pts, { loop: true, halfW: Speedway.W / 2 - 1.6 }));
    },
    // Ponto de largada na rua: o eixo da via em frente ao ponto de racha, no sentido dela.
    _streetStart(meet) {
        const r = RoadPlan.nearestRoadPoint(meet.x, meet.z, 30);
        return r ? { x: r.x, z: r.z, tx: meet.tx || r.tx, tz: meet.tz || r.tz, e: r.edge, s: r.s } : null;
    },
    _route(meet, ev) {
        if (ev.route !== undefined) return ev.route;
        const S = this._streetStart(meet);
        ev.route = null;
        if (!S) return null;
        if (ev.type === 'drag' || ev.type === 'pink') {
            // uma reta de 402 m (o quarto de milha; ao menos 260), para um lado ou para o outro, pela perna mais reta de cada cruzamento
            // (rua levemente curva vale; esquina, não) — na rua do ponto de racha ou, sem reta lá, numa ali perto (o grid vai para lá)
            for (let k = 0; k < 24 && !ev.route; k++) {
                let S2 = S;
                if (k) { const p = RoadNet.randomLanePoint(14, { x: S.x, z: S.z, rMin: 30, rMax: 260 }), r = p && RoadPlan.nearestRoadPoint(p.point.x, p.point.z, 20); if (!r) continue; S2 = { x: r.x, z: r.z, tx: r.tx, tz: r.tz, e: r.edge, s: r.s }; }
                for (const sg of [1, -1]) { const pts = this._straight(S2, sg, 402, 260); if (pts) { ev.route = { pts, len: new RacePath(pts, { halfW: 4 }).len }; break; } }
            }
            return ev.route;
        }
        const pick = (rMin, rMax) => { for (let i = 0; i < 30; i++) { const p = RoadNet.randomLanePoint(14, { x: S.x, z: S.z, rMin, rMax }); if (p && p.e.cls !== 'trail' && p.e.cls !== 'fav') return p.point; } return null; };
        for (let tries = 0; tries < 12 && !ev.route; tries++) {
            if (ev.type === 'sprint') {
                const B = pick(650, 1100 + ev.d * 150);
                if (!B) continue;
                const r = Gps.route(S, B), pts = this._join([r], false);
                if (r.len > 700 && r.len < 2600 && pts.length >= 3 && this._sane(pts, false)) ev.route = { pts, len: r.len };
            } else {
                const pts = this._blockLoop(S, tries % 2 ? -1 : 1, 40 + Math.random() * 160, 90 + Math.random() * 220);
                if (!pts) continue;
                const len = new RacePath(pts, { loop: true, halfW: 4 }).len;
                if (len > 500 && len < 1700 && this._sane(pts, true)) ev.route = { pts, len, loop: true };
            }
        }
        return ev.route;
    },

    // Polilinha de até `L` m pela rua a partir de S (no sentido sg da faixa), sempre pela perna mais reta, sem se desviar mais de ~20°
    // do rumo inicial em ponto nenhum. null = a rua vira, acaba ou vira caminho de terra antes de `minL` m.
    _straight(S, sg, L, minL = L) {
        const E = S.e, tx = S.tx * sg, tz = S.tz * sg, ok = (e) => !e.layer && e.cls !== 'trail' && e.cls !== 'fav';
        if (!E || !ok(E)) return null;
        const pts = [{ x: S.x, z: S.z }];
        let len = 0;
        const add = (x, z) => {
            const l = pts[pts.length - 1], d = Math.hypot(x - l.x, z - l.z);
            if (d < 0.5) return true;
            if (((x - l.x) * tx + (z - l.z) * tz) / d < 0.94) return false;
            if (len + d >= L) { const k = (L - len) / d; pts.push({ x: l.x + (x - l.x) * k, z: l.z + (z - l.z) * k }); len = L; return true; }
            pts.push({ x, z }); len += d;
            return true;
        };
        const walkEdge = (e, from) => {                                            // os pontos do eixo do trecho, a partir do nó `from`
            const P = e.pts, back = e.b === from;
            for (let i = 1; i < P.length && len < L; i++) { const p = P[back ? P.length - 1 - i : i]; if (!add(p[0], p[1])) return false; }
            return true;
        };
        // o resto do trecho de S até o nó da frente
        const ahead = (E.b.x - E.a.x) * tx + (E.b.z - E.a.z) * tz > 0 ? E.b : E.a, P = E.pts, C = E.cum;
        if (ahead === E.b) { for (let i = 0; i < P.length && len < L; i++) if (C[i] > S.s + 0.5 && !add(P[i][0], P[i][1])) return len >= minL ? pts : null; }
        else { for (let i = P.length - 1; i >= 0 && len < L; i--) if (C[i] < S.s - 0.5 && !add(P[i][0], P[i][1])) return len >= minL ? pts : null; }
        let n = ahead;
        for (let k = 0; k < 40 && len < L; k++) {
            const l = pts[pts.length - 1], q = pts[Math.max(0, pts.length - 2)], hl = Math.hypot(l.x - q.x, l.z - q.z) || 1, hx = pts.length > 1 ? (l.x - q.x) / hl : tx, hz = pts.length > 1 ? (l.z - q.z) / hl : tz;
            let best = null, bd = 0.94;
            for (const a of n.arms) { const d = a.dx * hx + a.dz * hz; if (d > bd && ok(a.e)) { bd = d; best = a; } }
            if (!best || !walkEdge(best.e, n)) break;
            n = best.to;
        }
        return len >= minL ? pts : null;
    },
    // CIRCUITO: a volta em torno de um ou mais quarteirões, pelo grafo das ruas (sem GPS: rotas de ida e volta pelo GPS repetem as
    // mesmas ruas). Do ponto de racha S, no sentido da faixa dele: segue reto d1 m, vira (turn = 1 direita, −1 esquerda), segue d2 m,
    // vira, volta até passar da esquina de trás do trecho de S, vira, segue até a linha da rua de S, vira e chega por trás em S —
    // um retângulo. Rua que não deixa (sem a esquina certa, beco, caminho de terra): null (tenta outro tamanho).
    _blockLoop(S, turn, d1, d2) {
        const E = S.e;
        if (!E || !E.a || !E.b) return null;
        const fwd = (E.b.x - E.a.x) * S.tx + (E.b.z - E.a.z) * S.tz > 0, N0 = fwd ? E.b : E.a, NB = fwd ? E.a : E.b;
        const l0 = Math.hypot(N0.x - NB.x, N0.z - NB.z) || 1, dx = (N0.x - NB.x) / l0, dz = (N0.z - NB.z) / l0;
        const ok = (e) => e.cls !== 'trail' && e.cls !== 'fav' && !e.layer;
        const arm = (n, hx, hz) => n.arms.find((a) => a.dx * hx + a.dz * hz > 0.85 && ok(a.e)) || null;
        const pts = [{ x: S.x, z: S.z }, { x: N0.x, z: N0.z }];
        let n = N0, hx = dx, hz = dz, phase = 0, run = 0, len = l0;
        for (let step = 0; step < 80; step++) {
            const rx = hz * turn, rz = -hx * turn;                                 // (a direita de (hx, hz) é (hz, −hx); à esquerda, o contrário)
            const along = (n.x - NB.x) * dx + (n.z - NB.z) * dz, off = Math.abs((n.x - NB.x) * dz - (n.z - NB.z) * dx);
            if (phase >= 3 && n === NB) return pts;                                // chegou à esquina de trás: o trecho de S fecha a volta
            const wantTurn = phase === 0 ? run >= d1 : phase === 1 ? run >= d2 : phase === 2 ? along < 1 : phase === 3 ? off < 3 : false;
            let a = null;
            if (wantTurn) { a = arm(n, rx, rz); if (a) { phase++; run = 0; } }
            if (!a) a = arm(n, hx, hz);
            if (!a || a.e === E) return null;
            const e = a.e, back = e.b === n;
            if (e.pts && e.pts.length > 2) for (let i = 1; i + 1 < e.pts.length; i++) { const p = e.pts[back ? e.pts.length - 1 - i : i]; pts.push({ x: p[0], z: p[1] }); }
            const m = a.to, L = Math.hypot(m.x - n.x, m.z - n.z);
            run += L; len += L;
            if (len > 1700) return null;
            const last = pts[pts.length - 1], ll = Math.hypot(m.x - last.x, m.z - last.z) || 1;
            hx = (m.x - last.x) / ll; hz = (m.z - last.z) / ll;
            n = m;
            if (n !== NB) pts.push({ x: n.x, z: n.z });
            else if (phase >= 3) { pts.push({ x: n.x, z: n.z }); return pts; }
            else return null;                                                      // (passou pela esquina de trás fora de hora)
        }
        return null;
    },
    // Junta as rotas do GPS numa polilinha só, sem os "degraus" de poucos metros (cada rota começa e termina no ponto da FAIXA e passa
    // pelo eixo da rua: dois pontos a ~2 m, uma quina falsa que faria o piloto frear do nada).
    _join(list, loop) {
        const out = [];
        for (const r of list) for (const p of r.pts) {
            const l = out[out.length - 1];
            if (!l || Math.hypot(l.x - p.x, l.z - p.z) >= 5) out.push({ x: p.x, z: p.z });
        }
        const all = list[list.length - 1].pts, end = all[all.length - 1], l = out[out.length - 1];
        if (!loop && l && (l.x !== end.x || l.z !== end.z)) { if (out.length > 1) out.pop(); out.push({ x: end.x, z: end.z }); }      // (a chegada exata)
        if (loop && out.length > 2 && Math.hypot(out[0].x - l.x, out[0].z - l.z) < 5) out.pop();                                          // (a volta fecha sozinha)
        return out;
    },
    // Traçado corrível? Sem meia-volta (duas rotas do GPS que voltam pela mesma rua) e sem trecho passando por cima de outro (os carros
    // ficariam rodando em círculo: o ponto mais perto do traçado seria o da ida, não o da volta).
    _sane(pts, loop) {
        const n = pts.length;
        for (let i = 0; i < n; i++) {
            const a = pts[i - 1] || (loop ? pts[n - 1] : null), b = pts[i], c = pts[i + 1] || (loop ? pts[0] : null);
            if (!a || !c) continue;
            const ax = b.x - a.x, az = b.z - a.z, cx = c.x - b.x, cz = c.z - b.z;
            if (Math.abs(Math.atan2(ax * cz - az * cx, ax * cx + az * cz)) > 2.3) return false;
        }
        const path = new RacePath(pts, { loop, halfW: 4 }), S = [];
        for (let s = 0; s < path.len; s += 8) { const q = path.at(s); S.push([s, q.x, q.z]); }
        for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
            let ds = S[j][0] - S[i][0];
            if (loop) ds = Math.min(ds, path.len - ds);
            if (ds > 45 && Math.hypot(S[i][1] - S[j][1], S[i][2] - S[j][2]) < 9) return false;
        }
        return true;
    },

    // ---------------------------------------------------------------- a janela (lista do dia)
    carPrompt(game) {
        if (game.mode !== 'car' || this.cur || !this.built) return '';
        const car = game.activeCar;
        if (!car || car.isBike || car.isBoat || car.isChopper || car.speed > 3) return '';
        const m = this.meetAt(car.position.x, car.position.z);
        if (!m) return '';
        return `<b>E</b> ${m.kind === 'speedway' ? 'inscrever-se nas provas do autódromo' : 'ver os rachas da noite'}<small>${m.name} · reputação: ${this.tierName()}</small>`;
    },
    carInteract(game) {
        if (!this.carPrompt(game)) return false;
        const car = game.activeCar;
        if (car.destroyed) { game._flash('Com o carro assim, ninguém corre contra você'); return true; }
        this.open(game, this.meetAt(car.position.x, car.position.z));
        return true;
    },
    _panel(game) {
        if (!this._p) this._p = new Panel('raceBoard', { width: 760, onAct: (a, arg) => this._act(game, a, arg) });
        return this._p;
    },
    open(game, meet) {
        this._meet = meet;
        const P = this._panel(game), t = this.tier(), next = this.TIERS[t + 1], inv = game.inventory, car = game.activeCar;
        const evs = this.events(meet);
        const repBar = next ? Panel.bar((this.rep - this.TIERS[t][0]) / (next[0] - this.TIERS[t][0]), '#ffb02e') : Panel.bar(1, '#ffd23a');
        let h = `<div class="dm-kv"><span>Reputação no meio</span><b>${this.tierName(t)} · ${this.rep}${next ? ` / ${next[0]} (${next[1]})` : ''}</b></div>${repBar}`;
        h += `<div class="dm-kv"><span>Seu carro</span><b>${car.spec.name} ${car.spec.model} · máx. ${Math.round(car.spec.maxSpeed * 3.6)} km/h · lataria ${Math.round(car.hpFrac * 100)}%</b></div>`;
        h += '<div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">';
        for (const ev of evs) {
            const locked = t < ev.minTier, pink = ev.type === 'pink', owned = !!car.ownedRec;
            const route = !locked && meet.kind === 'street' ? this._route(meet, ev) : null, noRoute = meet.kind === 'street' && !locked && !route;
            const money = ev.type === 'oval' ? 'limpo' : 'sujo', cash = inv.cash + inv.clean;
            const dist = ev.type === 'oval' ? `${ev.laps} voltas · ${(Speedway.L * ev.laps / 1000).toFixed(1)} km` : route ? (ev.type === 'circuit' ? `${ev.laps} voltas · ${(route.len * ev.laps / 1000).toFixed(1)} km` : `${(route.len / 1000).toFixed(1)} km`) : '';
            const stars = '★'.repeat(ev.d + 1) + '☆'.repeat(3 - ev.d);
            const why = locked ? `precisa de reputação: ${this.TIERS[ev.minTier][1]}` : noRoute ? 'sem traçado aqui hoje' : pink && !owned ? 'só com carro SEU (o documento vai na aposta)' : cash < ev.fee ? `faltam ${brl(ev.fee - cash)} da inscrição` : '';
            h += `<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,${locked ? 0.03 : 0.06});${locked ? 'opacity:.55' : ''}">
                <div style="flex:1"><b>${this.TYPE[ev.type]}</b> — ${ev.name} <span style="color:#ffb02e">${stars}</span>${ev.night ? ' <span title="à noite paga mais">🌙</span>' : ''}<br>
                <small>${ev.rivals} ${ev.rivals > 1 ? 'rivais' : 'rival'}${dist ? ' · ' + dist : ''} · ${pink ? 'quem ganha leva o carro do outro' : `prêmio ${brl(ev.prize)} (${money})`} · +${ev.rep} de reputação · inscrição ${ev.fee ? brl(ev.fee) : 'grátis'}${why ? ` · <span style="color:#ff9a8a">${why}</span>` : ''}</small></div>
                ${Panel.btn('race', locked ? '🔐' : 'Correr', { arg: ev.id, on: !why, pri: !why })}</div>`;
        }
        h += '</div>';
        const st = this.stats;
        h += `<div class="sub" style="margin-top:10px">Corridas ${st.races} · vitórias ${st.wins} · pódios ${st.podiums} · takedowns ${st.takedowns} · prêmios ${brl(st.earned)}</div>`;
        P.show(meet.kind === 'speedway' ? `🏎️ ${meet.name.toUpperCase()}` : `🏁 ${meet.name.toUpperCase()}`, meet.kind === 'speedway' ? 'Provas oficiais no oval: prêmio em dinheiro LIMPO · sem trânsito, muita pancada' : 'Rachas de rua: prêmio em dinheiro SUJO · trânsito de verdade e a polícia de olho', h);
    },
    _act(game, a, arg) {
        if (a !== 'race') return;
        const ev = (this._meet && this.events(this._meet) || []).find((e) => e.id === arg);
        if (!ev) return;
        const r = this.start(game, this._meet, ev);
        if (r.ok) this._p.close(); else this._p.msg(r.msg, false);
    },

    // ---------------------------------------------------------------- a corrida
    start(game, meet, ev) {
        const car = game.activeCar, inv = game.inventory;
        if (this.cur) return { ok: false, msg: 'Já tem uma corrida rolando' };
        if (game.mode !== 'car' || !car || car.isBike || car.destroyed) return { ok: false, msg: 'Só de carro' };
        if (inv.cash + inv.clean < ev.fee) return { ok: false, msg: 'Sem dinheiro para a inscrição' };
        if (ev.type === 'pink' && !car.ownedRec) return { ok: false, msg: 'O documento tem que ser seu' };
        let path, grid = [];
        const n = ev.rivals + 1;
        if (ev.type === 'oval') {
            if (!Speedway.site) return { ok: false, msg: 'Autódromo fechado' };
            Speedway.init(game);
            path = this._ovalPath();
            for (let i = 0; i < n; i++) grid.push(Speedway.gridSlot(i));
        } else {
            const route = this._route(meet, ev);
            if (!route) return { ok: false, msg: 'Não deu para montar o traçado aqui' };
            path = new RacePath(route.pts, { loop: !!route.loop });
            const P0 = path.at(0), drag = ev.type === 'drag' || ev.type === 'pink', hw = path.halfW(0);
            for (let i = 0; i < n; i++) {
                const row = drag ? 0 : Math.floor(i / 2), side = drag ? (i ? 1 : -1) : (i % 2 ? 1 : -1), lat = side * Math.min(2.1, hw - 0.4), s = -row * 8.5;
                const Q = path.loop ? path.at(s) : { x: P0.x + P0.tx * s, z: P0.z + P0.tz * s, tx: P0.tx, tz: P0.tz };      // (volta: o grid fica no fim da volta, atrás da linha)
                grid.push({ x: Q.x - Q.tz * lat, z: Q.z + Q.tx * lat, h: Math.atan2(Q.tx, Q.tz) });
            }
        }
        // inscrição: sujo primeiro na rua; limpo primeiro no autódromo
        if (ev.fee) {
            const clean = ev.type === 'oval';
            let left = ev.fee;
            const take = (k) => { const v = Math.min(inv[k], left); inv[k] -= v; left -= v; };
            if (clean) { take('clean'); take('cash'); } else { take('cash'); take('clean'); }
        }
        // o jogador numa vaga do meio do grid (no racha, ao lado do rival)
        const me = ev.type === 'oval' ? Math.min(n - 1, 2 + Math.floor(Math.random() * Math.max(1, n - 3))) : (ev.type === 'drag' || ev.type === 'pink' ? 0 : Math.min(n - 1, 1 + Math.floor(Math.random() * (n - 1))));
        const slot = grid[me];
        this._clearAround(game, grid, path);
        car.teleport(slot.x, slot.z, slot.h);
        car.nosOn = false;
        game.camera.snapTo(car.position);
        const used = new Set(), rivals = [];
        for (let i = 0, k = 0; i < n; i++) {
            if (i === me) continue;
            const rc = this._spawnRival(game, grid[i], ev, k++, used, path);
            if (rc) rivals.push(rc);
        }
        const st = path.project(car.position.x, car.position.z, -1);
        this.cur = {
            ev, meet, path, car, rivals, phase: 'count', t: 0, count: 3.6, street: ev.type !== 'oval', loop: path.loop,
            laps: ev.type === 'oval' || ev.type === 'circuit' ? ev.laps : 1,
            pl: { s: st.s, seg: st.seg, lap: path.loop && st.s > path.len / 2 ? -1 : 0, done: false, time: null, offT: 0 },
            cps: [], cpIdx: 0, nos: 1, takedowns: 0, perfect: false, jump: 0, holdT: 0, policeT: 1, copped: false, deadT: 0,
            startPos: { x: meet.x, z: meet.z },
        };
        for (const r of rivals) { const q = path.project(r.position.x, r.position.z, -1); r.R.s = q.s; r.R.seg = q.seg; r.R.lap = path.loop && q.s > path.len / 2 ? -1 : 0; }
        if (ev.type === 'sprint' || ev.type === 'circuit') {                    // checkpoints a cada ~150 m (o último = a chegada / a linha)
            const N = Math.max(3, Math.round(path.len / 150));
            for (let i = 1; i <= N; i++) this.cur.cps.push(path.len * i / N);
        }
        if (game.wanted && game.wanted.level > 0 && this.cur.street) game._flash('Correndo procurado: a polícia continua atrás de você');
        RaceHUD.show();
        game._flash(`${this.TYPE[ev.type]}: ${ev.name} — prepare-se`);
        return { ok: true };
    },
    // Tira do caminho o trânsito em volta do grid e do começo do traçado (estacionados ficam: são paisagem).
    _clearAround(game, grid, path) {
        const tm = game.traffic;
        if (!tm) return;
        for (const c of game.vehicleManager.vehicles.slice()) {
            if (c.controlled || c.keep || c.R || c.mode === 'parked') continue;
            const p = c.position;
            let near = grid.some((g) => Math.hypot(g.x - p.x, g.z - p.z) < 18);
            if (!near) { const q = path.project(p.x, p.z, -1); near = q.d < 9 && q.s < 70; }
            if (near) tm._relocate(c, 'drive', { x: p.x, z: p.z, rMin: 150, rMax: 320 });
        }
    },
    _spawnRival(game, slot, ev, k, used, path) {
        const tm = game.traffic;
        if (!tm) return null;
        const d = ev.type === 'pink' ? 3 : ev.d, models = this.MODELS[d];
        const model = ev.type === 'pink' ? (k ? 'super' : 'super2') : models[(ev.seed + k * 7) % models.length];
        const sheet = game.carLib.sheet(model), paint = game.carLib.randomPaint(model);
        const car = new RaceCar(game.scene, game.physics, { x: slot.x, z: slot.z }, tm._nextId++, sheet, paint, slot.h, tm);
        if (tm.shadow) tm.shadow.addShadowCaster(car.body);
        game.vehicleManager.vehicles.push(car);
        car.baseMode = 'drive'; car.driver = true; car.locked = true;
        // visual de rua tunado (NFSU2): neon, aerofólio e bodykit pela dificuldade; motor também
        const r = this._rng(ev.seed + k * 131 + 7);
        car.mods = { neon: r() < 0.35 + d * 0.2 ? 1 + Math.floor(r() * 7) : 0, wing: r() < 0.3 + d * 0.2 ? 1 + Math.floor(r() * 3) : 0, kit: r() < 0.25 + d * 0.2 ? 1 + Math.floor(r() * 3) : 0, tEng: Math.min(3, d + (r() < 0.5 ? 0 : 1)), tSus: Math.min(3, d), turbo: d >= 2 && r() < 0.6 ? 1 : 0 };
        Tuning.apply(car);
        let name;
        do { name = ev.type === 'pink' ? this.BOSS : this.NAMES[Math.floor(r() * this.NAMES.length)]; } while (used.has(name) && used.size < this.NAMES.length && ev.type !== 'pink');
        used.add(name);
        const [s0, s1] = this.SKILL[d];
        // (a faixa preferida é a do grid: todos mirando o meio da pista se espremem e travam um no outro na largada)
        const q = path.project(slot.x, slot.z, -1), hw = path.halfW(q.s);
        car.R = { path, s: q.s, seg: q.seg, lap: 0, skill: s0 + r() * (s1 - s0), band: 1, lat: q.lat, latT: q.lat, pref: Math.max(-hw * 0.7, Math.min(hw * 0.7, q.lat)), latHold: 0, nos: 1, nosT: 0, stuck: 0, rev: 0, done: false, dnf: false, time: null, name };
        return car;
    },

    // Controle do carro do jogador (Game, antes do drive): segura no grid e na queimada de largada, liga o nitro. true = segurado.
    control(game, car, axis, dt) {
        const C = this.cur;
        if (!C || car !== C.car) { if (car && car.nosOn) car.nosOn = false; return false; }
        const inp = game.input, gas = axis.z > 0.4;
        if (C.phase === 'count') {
            if (gas && C.count < 0.9 && C.count > 0.15) C.jump += dt;              // pisou antes da hora (no amarelo do semáforo)
            car.nosOn = false;
            return true;
        }
        if (C.phase !== 'race') { car.nosOn = false; return false; }
        if (C.holdT > 0) { C.holdT -= dt; return true; }
        if (C.t < 0.45 && gas && !C.launched) {                                  // acelerou bem no VAI!
            C.launched = true;
            if (C.jump < 0.25) { C.perfect = true; C.boostT = 1.3; RaceHUD.flash('LARGADA PERFEITA!', '+nitro', '#3cff7a', 1.4); AudioFX.blip(1180, 0.2, 0.25); }
        }
        const want = !!inp.keys['shift'] || C.boostT > 0;
        if (C.boostT > 0) C.boostT -= dt;
        car.nosOn = want && (C.nos > 0.01 || C.boostT > 0) && gas;
        if (car.nosOn && !(C.boostT > 0)) C.nos = Math.max(0, C.nos - dt * 0.24);
        return false;
    },

    update(game, dt) {
        if (!this.built) this.build(game);
        if (!this.built) return;
        Speedway.init(game);
        Speedway.update(game);
        this._markers(game, dt);
        const C = this.cur;
        if (!C) return;
        C.t += dt;
        if (C.phase === 'count') {
            C.count -= dt;
            const n = C.count > 2.4 ? 3 : C.count > 1.2 ? 2 : C.count > 0 ? 1 : 0;
            RaceHUD.countdown(n);
            for (const r of C.rivals) r.raceHold = true;
            if (C.count <= 0) {
                C.phase = 'race'; C.t = 0; C.goT = performance.now();
                for (const r of C.rivals) r.raceHold = false;
                if (C.jump >= 0.25) { C.holdT = 0.8; RaceHUD.flash('QUEIMOU A LARGADA!', 'o motor engasgou', '#ff6b5a', 1.2); }
                setTimeout(() => RaceHUD.countdown(null), 700);
            }
            this._hud(game);
            return;
        }
        if (C.phase === 'race') this._race(game, dt);
        else if (C.phase === 'end' && C.t - C.endT > 2.4 && !C.shown) { C.shown = true; this._results(game); }
        this._hud(game);
        this._cpFx(game);
    },

    _race(game, dt) {
        const C = this.cur, car = C.car, path = C.path;
        // saiu da corrida?
        if (game.mode !== 'car' || game.activeCar !== car) return this.abort(game, 'Você saiu do carro');
        if (game.arrest || game.death) return this.abort(game, 'Fim de corrida');
        if (car.destroyed) { C.deadT += dt; if (C.deadT > 2) return this.abort(game, car.capsized ? 'Seu carro capotou' : 'Seu carro foi destruído'); }
        // progresso do jogador
        const pr = path.project(car.position.x, car.position.z, C.pl.seg), P = C.pl;
        if (path.loop) {
            const ds = pr.s - P.s;
            if (ds < -path.len / 2) {                                           // cruzou a linha
                if (P.lap < 0 || !C.cps.length || C.cpIdx >= C.cps.length - 1) {      // (largou atrás da linha; o último checkpoint da volta é a própria linha)
                    P.lap++; C.cpIdx = 0;
                    if (P.lap >= C.laps) this._finishPlayer(game);
                    else if (P.lap >= 0) { RaceHUD.flash(P.lap === C.laps - 1 ? 'ÚLTIMA VOLTA!' : `VOLTA ${P.lap + 1}/${C.laps}`, '', '#ffe14d', 1.2); AudioFX.blip(880, 0.15, 0.2); }
                }
            } else if (ds > path.len / 2) P.lap--;                               // (voltou de ré pela linha)
        }
        P.s = pr.s; P.seg = pr.seg;
        // checkpoints (rua): passar pelo cilindro, na ordem — perto dele ou já adiante dele no traçado (cortando a esquina rente ao
        // muro o carro pode passar fora do cilindro; pegar um atalho por outra rua não vale: aí a distância ao traçado é grande)
        if (C.cps.length && C.cpIdx < C.cps.length && !P.done) {
            const cs = C.cps[C.cpIdx], q = path.at(cs), hw = path.halfW(cs), past = cs < path.len - 1 && P.s >= cs && P.s - cs < 80 && pr.d < hw + 14;
            if (past || Math.hypot(car.position.x - q.x, car.position.z - q.z) < hw + 7) {
                C.cpIdx++;
                AudioFX.blip(1040, 0.1, 0.22);
                if (!path.loop && C.cpIdx >= C.cps.length) this._finishPlayer(game);
            }
        }
        if (!path.loop && !C.cps.length && P.s >= path.len - 1 && !P.done) this._finishPlayer(game);          // racha: a reta toda
        // fora do traçado por muito tempo (rua)
        C.pl.offT = pr.d > (C.street ? 120 : 40) ? C.pl.offT + dt : 0;
        if (C.pl.offT > 7) return this.abort(game, 'Você abandonou o percurso');
        // rivais: elástico, chegada, fora da corrida, takedown
        const myProg = this._prog(P, path, C);
        for (const r of C.rivals) {
            const R = r.R;
            if (R.done || R.dnf) continue;
            const gap = this._rprog(R, path) - myProg;
            const want = gap > 90 ? 0.93 : gap < -110 ? 1.07 : 1;
            R.band += (want - R.band) * Math.min(1, dt * 0.6);
            if (r.destroyed) {
                R.dnf = true;
                if (r._tdT != null && C.t - r._tdT < 3) this._takedown(game, r);
                else RaceHUD.flash(`${R.name} ESTÁ FORA!`, r.capsized ? 'capotou' : 'bateu feio', '#ff9a5a', 1.4);
                continue;
            }
            if (r.tumble && r._tdT != null && C.t - r._tdT < 3 && !R.td) this._takedown(game, r);
            if (path.loop ? R.lap >= C.laps : R.s >= path.len - 2) { R.done = true; R.time = C.t; }
        }
        // polícia (rua): uma viatura perto vê o racha
        if (C.street && !C.copped && game.policeManager && (C.policeT -= dt) <= 0) {
            C.policeT = 1;
            const p = car.position;
            if (car.speed > 16 && game.policeManager.nearestDist(p) < 55) { C.copped = true; game.wanted.ensureLevel(1, 'racha'); RaceHUD.flash('🚨 OS GAMBÉ CHEGARAM!', 'polícia no racha — continue ou fuja', '#5aa0ff', 2); }
        }
        // todos os rivais chegaram e você ainda não: 60 s para terminar
        if (!P.done && C.rivals.every((r) => r.R.done || r.R.dnf)) { C.waitT = (C.waitT || 0) + dt; if (C.waitT > 60) this._finishPlayer(game, true); }
    },
    _prog(P, path, C) {
        if (path.loop) return Math.max(-1, P.lap) * path.len + P.s;
        if (C.cps.length) return Math.min(P.s, (C.cps[C.cpIdx] || path.len) + 30);
        return P.s;
    },
    _rprog(R, path) { return path.loop ? R.lap * path.len + R.s : R.s; },
    _standings() {
        const C = this.cur, path = C.path, rows = [];
        rows.push({ me: true, name: 'VOCÊ', done: C.pl.done, out: false, time: C.pl.time, prog: C.pl.done ? Infinity : this._prog(C.pl, path, C), car: C.car });
        for (const r of C.rivals) rows.push({ me: false, name: r.R.name, done: r.R.done, out: r.R.dnf, time: r.R.time, prog: r.R.done ? Infinity : r.R.dnf ? -Infinity : this._rprog(r.R, path), car: r });
        rows.sort((a, b) => (a.done && b.done) ? a.time - b.time : (b.prog - a.prog));
        return rows;
    },
    _finishPlayer(game, late = false) {
        const C = this.cur;
        if (C.pl.done) return;
        C.pl.done = true; C.pl.time = late ? C.t + 99 : C.t;
        const rows = this._standings(), place = rows.findIndex((r) => r.me);
        C.place = place; C.phase = 'end'; C.endT = C.t;
        RaceHUD.flash(place === 0 ? '🏆 1º LUGAR!' : `${place + 1}º LUGAR`, `tempo ${RaceHUD.clock(C.pl.time)}`, place === 0 ? '#ffd23a' : '#f4f6fa', 2.4);
        AudioFX.blip(place === 0 ? 1320 : 660, 0.4, 0.3);
        if (C.car) C.car.nosOn = false;
    },
    _takedown(game, rival) {
        const C = this.cur, R = rival.R;
        if (R.td) return;
        R.td = true; C.takedowns++;
        C.nos = Math.min(1, C.nos + 0.35);
        RaceHUD.flash('💥 TAKEDOWN!', `${R.name} · +25 de reputação · +nitro`, '#ff5a3a', 1.6);
        game.slowMo(0.4, 0.8);
    },
    abort(game, why) {
        const C = this.cur;
        if (!C) return;
        C.place = -1; C.why = why;
        if (C.phase !== 'end') { C.phase = 'end'; C.endT = C.t - 1.6; }
        RaceHUD.flash('DESCLASSIFICADO', why, '#ff6b5a', 2);
        if (C.car) C.car.nosOn = false;
    },

    // ---------------------------------------------------------------- resultado
    _results(game) {
        const C = this.cur, ev = C.ev, rows = this._standings(), inv = game.inventory, dnf = C.place < 0;
        const n = rows.length, place = dnf ? n : C.place;
        let money = 0, rep = 0, extra = '';
        const pink = ev.type === 'pink', drag = ev.type === 'drag' || pink;
        if (!dnf) {
            if (place === 0) money = ev.prize; else if (!drag && place === 1 && n >= 3) money = ev.prize * 0.4; else if (!drag && place === 2 && n >= 4) money = ev.prize * 0.15;
            money = Math.round(money / 10) * 10;
            rep = Math.round(ev.rep * (drag && place > 0 ? 0.2 : this.PLACE[Math.min(3, place)])) + C.takedowns * 25 + (C.perfect ? 10 : 0);      // (racha 1×1: quem perde ganha pouco)
            if (pink) rep = place === 0 ? 900 : 0;
        }
        if (money > 0) {
            if (typeof Ledger !== 'undefined') Ledger.hold(ev.type === 'oval' ? 'Autódromo (prêmios)' : 'Rachas de rua', 1);
            if (ev.type === 'oval') inv.clean += money; else inv.cash += money;
        }
        // racha de documento
        if (pink && !dnf) extra = this._pinkSlip(game, place === 0, rows.find((r) => !r.me));
        const before = this.tier();
        this.rep += rep;
        const S = this.stats;
        S.races++; if (!dnf && place === 0) S.wins++; if (!dnf && place <= 2 && n >= 3) S.podiums++; S.takedowns += C.takedowns; S.earned += money;
        if (!dnf && C.pl.time && (!this.best[ev.id] || C.pl.time < this.best[ev.id])) { this.best[ev.id] = C.pl.time; extra += '<div class="dm-kv"><span>🕒 Recorde pessoal</span><b>' + RaceHUD.clock(C.pl.time) + '</b></div>'; }
        const P = this._panel(game), t = this.tier();
        let h = '<div style="display:flex;flex-direction:column;gap:4px">';
        rows.forEach((r, i) => {
            const label = r.car && r.car.spec ? `${r.car.spec.name} ${r.car.spec.model}` : '';
            h += `<div class="dm-kv" style="${r.me ? 'color:#ffe14d' : ''}"><span>${i + 1}º · ${r.name} <small style="opacity:.65">${label}</small></span><b>${r.out ? 'fora' : r.done ? RaceHUD.clock(r.time) : '—'}</b></div>`;
        });
        h += '</div><div style="margin-top:10px">';
        h += Panel.kv(ev.type === 'oval' ? 'Prêmio (dinheiro limpo)' : 'Prêmio (dinheiro sujo)', money ? '+' + brl(money) : '—');
        h += Panel.kv('Reputação', rep ? `+${rep}${C.takedowns ? ` (${C.takedowns} takedown${C.takedowns > 1 ? 's' : ''})` : ''}${C.perfect ? ' · largada perfeita' : ''}` : '—');
        h += Panel.kv('Nível no meio', `${this.tierName(t)} · ${this.rep}`) + extra;
        if (t > before) h += `<div style="margin-top:8px;color:#ffd23a;font-weight:800">⭐ Subiu de nível: ${this.tierName(t)}! Novas corridas liberadas.</div>`;
        h += `<div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">${Panel.btn('done', 'Fechar', { pri: true })}</div></div>`;
        const title = dnf ? `❌ DESCLASSIFICADO — ${C.why || ''}` : place === 0 ? '🏆 VOCÊ VENCEU!' : `🏁 ${place + 1}º LUGAR`;
        P.onAct = (a) => { if (a === 'done') P.close(); };
        P.onClose = () => { P.onClose = null; P.onAct = (a, arg) => this._act(game, a, arg); this.finish(game); };
        P.show(title, `${this.TYPE[ev.type]} — ${ev.name}`, h);
    },
    // Racha valendo o documento: ganhou, o carro do rival vai para a sua garagem (sem vaga: vende para o desmanche na hora); perdeu, o
    // seu vai embora com ele (você desce do carro).
    _pinkSlip(game, won, rival) {
        const C = this.cur, rc = rival && rival.car;
        this.stats.pinks += won ? 1 : 0;
        if (won && rc) {
            const G = Garage.defaultFor(), model = rc.spec.id;
            if (G) { Garage.add({ model, paint: rc.visual ? rc.visual.variant : 0, hp: 1, fuel: 1, mods: Object.assign({}, rc.mods || {}), bought: false, paid: 0 }, G); return Panel.kv('Documento', `o ${rc.spec.name} ${rc.spec.model} é SEU — está em ${G.name}`); }
            const v = 25000; game.inventory.cash += v; return Panel.kv('Documento', `sem vaga na garagem: o ${rc.spec.model} foi vendido no desmanche (+${brl(v)})`);
        }
        const car = C.car, rec = car && car.ownedRec;
        if (rec) { Garage.remove(rec, 'pink'); car.ownedRec = null; C.lostCar = true; }
        return Panel.kv('Documento', 'você perdeu o carro: ele vai embora com o rival');
    },
    // Fim: os rivais viram trânsito; no autódromo, o carro volta para o portão; o carro perdido no racha de documento vai embora.
    finish(game) {
        const C = this.cur;
        if (!C) return;
        this.cur = null;
        RaceHUD.hide(); this._cpHide();
        for (const r of C.rivals) r.retire(C.street);
        const car = C.car;
        if (car) car.nosOn = false;
        if (C.ev.type === 'oval' && car && !car.destroyed && game.activeCar === car) {
            const g = Speedway.site.gate;
            car.teleport(g.x - 6, g.z, Math.PI / 2);
            game.camera.snapTo(car.position);
        }
        if (C.lostCar && car && game.activeCar === car) {
            game._leaveVehicle();
            car.driver = true; car.mode = 'drive'; car.locked = true; car.keep = false; if (car.reroute) car.reroute();      // (vira trânsito: some longe de você)
            game._flash('O rival foi embora com o seu carro');
        }
    },

    // ---------------------------------------------------------------- impactos (Game)
    onImpact(game, car, dv, src) {
        const C = this.cur;
        if (!C || C.phase !== 'race' || !car.R) return;
        if (src === 'player' && dv > 6) car._tdT = C.t;                          // batida do jogador: se ele cair nos próximos segundos, é takedown
    },
    onTumbleEnd(game, car, upsideDown) { /* (o update vê car.destroyed / car.tumble) */ },

    // ---------------------------------------------------------------- radar e checkpoints
    blips(out) {
        const C = this.cur;
        if (!C) return;
        for (const r of C.rivals) if (!r.R.dnf) out.push({ pos: r.position, color: '#ff9a2e' });
        const t = this.gpsTarget();
        if (t) out.push({ pos: { x: t.x, z: t.z }, color: '#ffe14d', ring: 0 });
    },
    gpsTarget() {
        const C = this.cur;
        if (!C || C.phase !== 'race') return null;
        if (C.cps.length && C.cpIdx < C.cps.length) { const q = C.path.at(C.cps[C.cpIdx]); return { x: q.x, z: q.z, label: `Checkpoint ${C.cpIdx + 1}` }; }
        if (!C.path.loop) { const q = C.path.at(C.path.len); return { x: q.x, z: q.z, label: 'Chegada' }; }
        return null;
    },
    _cpFx(game) {
        const C = this.cur;
        const show = C && C.phase === 'race' && (C.cps.length || !C.path.loop);
        if (!show) return this._cpHide();
        const sc = game.scene;
        if (!this._cp) {
            const mat = (r, g, b, a) => { const m = new BABYLON.StandardMaterial('raceCp' + r + g, sc); m.diffuseColor = new BABYLON.Color3(r, g, b); m.emissiveColor = new BABYLON.Color3(r, g, b); m.alpha = a; m.disableLighting = true; m.backFaceCulling = false; m.disableDepthWrite = true; return m; };
            const cyl = (name, d, h, m) => { const c = BABYLON.MeshBuilder.CreateCylinder(name, { diameter: d, height: h, tessellation: 32, cap: BABYLON.Mesh.NO_CAP }, sc); c.material = m; c.isPickable = false; c.renderingGroupId = 1; return c; };
            this._cp = { a: cyl('raceCpA', 10, 7, mat(1, 0.82, 0.15, 0.32)), b: cyl('raceCpB', 7, 4, mat(1, 0.82, 0.15, 0.14)), fin: mat(0.95, 0.95, 0.95, 0.38), norm: null, arrow: this._arrowMesh(sc, mat(1, 0.85, 0.2, 0.9)) };
            this._cp.norm = this._cp.a.material;
        }
        const M = this._cp, path = C.path;
        let sA, sB = null, fin = false;
        if (C.cps.length) { sA = C.cps[C.cpIdx]; sB = C.cps[C.cpIdx + 1] != null ? C.cps[C.cpIdx + 1] : (path.loop ? C.cps[0] : null); fin = C.cpIdx === C.cps.length - 1 && (!path.loop || C.pl.lap >= C.laps - 1); }
        else { sA = path.len; fin = true; }
        const A = path.at(sA), hw = path.halfW(sA), d = Math.max(9, hw * 2 + 2);
        M.a.setEnabled(true); M.a.position.set(A.x, 3.5, A.z); M.a.scaling.set(d / 10, 1, d / 10);
        M.a.material = fin ? M.fin : M.norm;
        if (sB != null && !fin) {
            const B = path.at(sB);
            M.b.setEnabled(true); M.b.position.set(B.x, 2, B.z);
            M.arrow.setEnabled(true); M.arrow.position.set(A.x, 3.2 + 0.25 * Math.sin(C.t * 4), A.z); M.arrow.rotation.y = Math.atan2(B.x - A.x, B.z - A.z);
        } else { M.b.setEnabled(false); M.arrow.setEnabled(false); }
    },
    _cpHide() { if (this._cp) { this._cp.a.setEnabled(false); this._cp.b.setEnabled(false); this._cp.arrow.setEnabled(false); } },
    // Seta (chevron duplo) deitada, apontando para +z local — gira para o próximo checkpoint.
    _arrowMesh(sc, mat) {
        const P = [], I = [], add = (pts) => { const i = P.length / 3; for (const [x, z] of pts) P.push(x, 0, z); I.push(i, i + 1, i + 2, i, i + 2, i + 3); };
        for (const o of [0, 1.7]) { add([[-1.8, o - 0.6], [0, o + 1.2], [0, o + 2.2], [-1.8, o + 0.4]]); add([[0, o + 1.2], [1.8, o - 0.6], [1.8, o + 0.4], [0, o + 2.2]]); }
        const m = new BABYLON.Mesh('raceArrow', sc), vd = new BABYLON.VertexData();
        vd.positions = P; vd.indices = I; vd.normals = []; BABYLON.VertexData.ComputeNormals(P, I, vd.normals);
        vd.applyToMesh(m); m.material = mat; m.renderingGroupId = 1; m.isPickable = false; m.scaling.set(1.3, 1, 1.3);
        return m;
    },

    // Anéis acesos nos pontos de racha (perto da câmera, fora de corrida).
    _markers(game, dt) {
        if (!this.glow) return;
        this._mt = (this._mt || 0) + dt;
        const f = game.camera.target, pulse = 0.7 + 0.3 * Math.sin(this._mt * 3), G = this.glow;
        this.meets.forEach((m, i) => {
            if (this.cur || Math.hypot(m.x - f.x, m.z - f.z) > 90) { G.off(i); return; }
            const c = m.kind === 'speedway' ? [0.2, 0.9, 1] : [1, 0.55, 0.1];
            G.place(i, m.x, 0.3, m.z, 6 + pulse); G.color(i, c[0], c[1], c[2], 0.75 * pulse);
        });
        G.flush();
    },

    _hud(game) {
        const C = this.cur;
        if (!C) return;
        const rows = this._standings(), place = rows.findIndex((r) => r.me) + 1;
        let lap;
        if (C.pl.done) lap = C.place === 0 ? 'Venceu!' : 'Chegou';
        else if (C.path.loop) lap = `Volta ${Math.min(C.laps, Math.max(1, C.pl.lap + 1))}/${C.laps}${C.cps.length ? ` · CP ${Math.min(C.cps.length, C.cpIdx + 1)}/${C.cps.length}` : ''}`;
        else if (C.cps.length) lap = `Checkpoint ${Math.min(C.cps.length, C.cpIdx + 1)}/${C.cps.length}`;
        else lap = `${Math.max(0, Math.round(C.path.len - C.pl.s))} m até a chegada`;
        RaceHUD.update({ pos: place, n: rows.length, lap, time: C.phase === 'count' ? 0 : (C.pl.done ? C.pl.time : C.t), nos: C.nos, nosOn: !!(C.car && C.car.nosOn), rows });
    },

    // ---------------------------------------------------------------- save
    serialize() { return { rep: this.rep, stats: Object.assign({}, this.stats), best: Object.assign({}, this.best) }; },
    load(s) {
        this.rep = (s && s.rep) || 0;
        this.stats = Object.assign({ races: 0, wins: 0, podiums: 0, takedowns: 0, earned: 0, pinks: 0 }, (s && s.stats) || {});
        this.best = Object.assign({}, (s && s.best) || {});
    },
};
