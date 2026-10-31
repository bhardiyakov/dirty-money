// ============================================================================
// Maracana — o COMPLEXO DO MARACANÃ, por fora e por dentro.
// Por fora (estrutura da referência):
//   • o ESTÁDIO: a fachada de pilares inclinados em V com os andares do anel e o vidro escuro entre eles; a COBERTURA branca com as
//     nervuras, a faixa de placas solares e o anel interno; a ARQUIBANCADA azul, amarela e branca com os corredores; o gramado
//     listrado com a pista azul em volta; os placares; as duas RAMPAS HELICOIDAIS de concreto na frente;
//   • a ESPLANADA de pedra em volta (palmeiras, postes, bancos), o ESTACIONAMENTO ao sul (vagas pintadas e a baia das vans) com a placa
//     ESTÁDIO DO MARACANÃ na entrada — os carros dele são carros de VERDADE do trânsito (trancados, roubáveis: update), a ESTAÇÃO DE TREM a leste (plataforma coberta, trilhos, trens) e a PASSARELA elevada sobre os trilhos
//     até a esplanada (anda-se nela: Walkways), o MARACANÃZINHO (a cúpula branca) e o PARQUE AQUÁTICO (piscina com arquibancada).
// Por dentro (Interiors, como as lojas): a porta é o portão sul; a sala é pintada em HD — o SAGUÃO com a BILHETERIA (ingresso: as
// catracas liberam) e a LANCHONETE (cardápio do estádio), as CATRACAS, a ARQUIBANCADA com a torcida, o alambrado com as placas e o
// GRAMADO com os jogadores e a bola de verdade (um jogo rolando, com gol e placar). Na arquibancada: E assiste ao jogo.
//   build()  (Landmarks._stadium)  lugar, sólidos, porta, passarela, POI     meshes(wb)  o exterior     drawMap(...)  no mapa
//   door()   a porta (Interiors.index)     room()  a sala (Interiors._room)    onEnter / onLeave / tick / prompt / interact  lá dentro
//   update(dt, game)  (Game, a cada quadro) o estacionamento: carros de verdade nas vagas quando a câmera chega perto, conforme a hora
// ============================================================================

const Maracana = {
    S: { name: 'Maracanã', x: -408, z: 118, rx: 56, rz: 46, h: 13.2 },
    AREA: [-512, -2, -298, 188],                         // o terreno do complexo (grama, piso, nada de fazenda)
    PARK: [-452, 24, -364, 56],                          // estacionamento
    ROWS: [4, 15.5, 22.5],                               // as fileiras de vagas de 7 u (z a partir do sul do estacionamento), com os corredores; as vans ao norte
    SLOT: 3,                                             // largura da vaga
    LOT_CAP: 40,                                         // carros de verdade no estacionamento, no máximo
    STATION: { x0: -314, x1: -305, z0: 86, z1: 142, tracks: [-321.5, -329] },
    DOME: { x: -482, z: 166, r: 17 },                    // Maracanãzinho
    POOL: [-508, 74, -476, 104],                         // parque aquático (a piscina e a arquibancada a oeste)
    BRIDGE: { h: 5.4, w: 3, pts: [[-309.5, 118], [-309.5, 131], [-338, 131], [-351, 131]] },
    RAMPS: [Math.PI * 1.22, Math.PI * 1.78],             // as rampas helicoidais (ângulo na elipse): sudoeste e sudeste
    built: false,

    E(k, a) { const S = this.S; return [S.x + Math.cos(a) * S.rx * k, S.z + Math.sin(a) * S.rz * k]; },
    inEllipse(x, z, k) { const S = this.S, u = (x - S.x) / (S.rx * k), v = (z - S.z) / (S.rz * k); return u * u + v * v < 1; },

    // ---------------------------------------------------------------- lugar, sólidos, porta
    build() {
        if (this.built) return;
        this.built = true;
        const S = this.S, O = [];
        WorldMap.regions.push({ name: 'MARACANÃ', x: S.x, z: S.z + S.rz + 30, size: 0.75 });
        // o anel (caixas ao longo da elipse), com o vão do portão sul; o miolo inteiro
        const n = 48, gate = -Math.PI / 2, g = this.E(1, gate);
        for (let i = 0; i < n; i++) {
            const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
            const p = this.E(1.02, a0), q = this.E(1.02, a1), o = { x0: Math.min(p[0], q[0]) - 1.4, z0: Math.min(p[1], q[1]) - 1.4, x1: Math.max(p[0], q[0]) + 1.4, z1: Math.max(p[1], q[1]) + 1.4, h: S.h };
            if (o.z0 < g[1] + 4 && o.x0 < g[0] + 2 && o.x1 > g[0] - 2) { if (o.x0 + o.x1 < g[0] * 2) o.x1 = g[0] - 2; else o.x0 = g[0] + 2; }     // (o vão do portão: 4 u)
            O.push(o);
        }
        for (const [x0, x1] of [[S.x - S.rx * 0.88, g[0] - 1.6], [g[0] + 1.6, S.x + S.rx * 0.88]]) O.push({ x0, z0: g[1] + 0.6, x1, z1: g[1] + 4, h: S.h });     // (atrás do anel, ao lado do portão)
        O.push({ x0: S.x - S.rx * 0.9, z0: g[1] + 4, x1: S.x + S.rx * 0.9, z1: S.z + S.rz * 0.9, h: S.h });
        // rampas, Maracanãzinho, parque aquático, a plataforma (pilares da cobertura), a placa
        for (const a of this.RAMPS) { const c = this.E(1.17, a); O.push({ x0: c[0] - 6.6, z0: c[1] - 6.6, x1: c[0] + 6.6, z1: c[1] + 6.6, h: 12 }); }
        const D = this.DOME; O.push({ x0: D.x - D.r * 0.92, z0: D.z - D.r * 0.92, x1: D.x + D.r * 0.92, z1: D.z + D.r * 0.92, h: 14 });
        const P = this.POOL; O.push({ x0: P[0], z0: P[1], x1: P[0] + 6, z1: P[3], h: 5 }, { x0: P[0] + 7, z0: P[1] + 4, x1: P[2] - 2, z1: P[3] - 4, h: 1.2 });
        const T = this.STATION;
        for (let z = T.z0 + 2; z < T.z1; z += 8) O.push({ x0: T.x1 - 1.1, z0: z - 0.3, x1: T.x1 - 0.5, z1: z + 0.3, h: 4 });
        O.push({ x0: -362.4, z0: 24.1, x1: -361.6, z1: 24.9, h: 3 }, { x0: -352.4, z0: 24.1, x1: -351.6, z1: 24.9, h: 3 });
        // embaixo das escadas da passarela (o pé fica livre)
        const B = this.BRIDGE;
        for (const [a, b] of [[B.pts[0], B.pts[1]], [B.pts[3], B.pts[2]]]) {
            const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
            for (let u = 2.1; u < L * 0.45; u += 0.9) O.push({ x0: a[0] + ux * u - 0.75, z0: a[1] + uz * u - 0.75, x1: a[0] + ux * u + 0.75, z1: a[1] + uz * u + 0.75, h: 2, stair: true });
        }
        for (let x = -334; x > -340; x -= 4.5) O.push({ x0: x - 0.4, z0: 129.6, x1: x + 0.4, z1: 132.4, h: B.h });
        CityGrid.addObstacles(O);
        this.solids = O;
        this.slots = this._slots();
        // a barraca de churrasquinho na esplanada, perto do portão (Stands: vende de verdade, com o carrinho e o churrasqueiro)
        if (typeof Stands !== 'undefined') Stands.add({ id: 'churrasquinho_maracana', name: 'Churrasquinho do Maracanã', emo: '🍢', x: -396, z: 63.6, r: 2.8, hours: [9, 24], items: Stands.MENUS.estadio, sub: 'Antes do jogo, um espetinho!',
            cart: true, vendor: { x: -396, z: 64.5, h: Math.PI, type: 'civil_ambulante' } });
        this._walk();
        CityGrid.addPoi({ type: 'estadio', name: 'Estádio do Maracanã (entrada pelo portão sul)', x: g[0], z: g[1] - 5 });
    },
    // A passarela da estação: escada da plataforma (sobe para o norte), a travessia sobre os trilhos e a escada que desce na esplanada.
    _walk() {
        const B = this.BRIDGE, h = B.h, [p0, p1, p2, p3] = B.pts, w = B.w, parts = [];
        parts.push({ seg: true, a: [p0[0], p0[1], 0], b: [p1[0], p1[1], h], w, entry: true });
        parts.push({ seg: true, a: [p1[0], p1[1], h], b: [p2[0], p2[1], h], w });
        parts.push({ seg: true, a: [p3[0], p3[1], 0], b: [p2[0], p2[1], h], w, entry: true });
        for (const c of [p1, p2]) parts.push({ rect: [c[0] - w / 2, c[1] - w / 2, c[0] + w / 2, c[1] + w / 2], h });
        this.net = Walkways.add({ name: 'Passarela do Maracanã', parts });
    },
    covers(x, z, m = 0) {
        if (!this.built) return false;
        const A = this.AREA;
        return x > A[0] - m && x < A[2] + m && z > A[1] - m && z < A[3] + m;
    },
    // A porta do estádio para Interiors (como a da safe house: só na grade de portas).
    door() {
        if (!this.built) return null;
        if (this._door) return this._door;
        const g = this.E(1, -Math.PI / 2);
        return (this._door = { id: 'maracana', kind: 'stadium', style: 'stadium', stadium: true, name: 'Estádio do Maracanã', district: 'city', biome: 'commercial', variant: 0,
            x: g[0], z: g[1] - 1.25, face: Math.PI, ex: g[0], ez: g[1] });
    },

    // ---------------------------------------------------------------- gente, som e luz (NPCManager, StreetLife, Ambience)
    _hour() { return typeof game !== 'undefined' && game && game.dayNight ? game.dayNight.hour : 12; },
    // Movimento de pedestres (Landmarks.crowd): a esplanada e o estacionamento cheios com o estádio aberto; o gramado em volta, pouco.
    crowd(x, z) {
        const A = this.AREA, P = this.PARK;
        if (!this.built || x < A[0] || x > A[2] || z < A[1] || z > A[3]) return null;
        const open = Economy.isOpen('stadium', this._hour());
        if (this.inEllipse(x, z, 1.32) || (x > P[0] && x < P[2] && z > P[1] && z < P[3] + 10)) return open ? 1 : 0.12;
        return open ? 0.3 : 0.06;
    },
    // Dia de jogo (StreetLife._extras: a torcida chegando): o estádio aberto no fim da tarde/noite, com o jogador por perto.
    matchDay(x, z, h) { return this.built && Economy.isOpen('stadium', h) && h >= 15 && h < 23 && hypot(x - this.S.x, z - this.S.z) < 170; },
    crowdSound(x, z, h) {
        if (!this.built || !Economy.isOpen('stadium', h)) return 0;
        const d = hypot(x - this.S.x, z - this.S.z);
        return d < 130 ? 0.065 * (1 - d / 130) * (h >= 16 && h < 23 ? 1.5 : 1) : 0;
    },
    // À noite, com o estádio aberto, os refletores acendem (o anel sob a cobertura e o gramado iluminado).
    _lights(game) {
        const n = game.dayNight ? game.dayNight.night : 0, on = Economy.isOpen('stadium', game.dayNight.hour) ? n : 0;
        if (this._lightK !== undefined && Math.abs(on - this._lightK) < 0.02) return;
        this._lightK = on;
        if (this._ringMat) this._ringMat.emissiveColor.set(0.25 + 0.75 * on, 0.25 + 0.73 * on, 0.25 + 0.62 * on);
        const pm = this._wb && this._wb.mats.stadiumPitch;
        if (pm) pm.emissiveColor.set(0.5 * on, 0.55 * on, 0.45 * on);
    },

    // ---------------------------------------------------------------- o estacionamento (carros de verdade)
    // As vagas: 3 fileiras (a do sul de frente para o corredor, as duas do meio de costas uma para a outra) e a baia das vans ao norte.
    _slots() {
        const P = this.PARK, out = [];
        this.ROWS.forEach((d, r) => {
            const z = P[1] + d;
            for (let x = P[0] + 2; x + this.SLOT <= P[2] - 2 + 0.01; x += this.SLOT) out.push({ x: x + this.SLOT / 2, z, h: r === 1 ? Math.PI : 0, row: r });
        });
        for (let i = 0; i < 4; i++) out.push({ x: P[0] + 16 + i * 14, z: P[3] - 1.7, h: Math.PI / 2, van: true });
        return out;
    },
    // Quanto do estacionamento está ocupado na hora h (0..1): de madrugada, um ou outro; de dia, meio cheio; no jogo da noite, lotado.
    occupancy(h) {
        if (!Economy.isOpen('stadium', h)) return 0.1;
        return h >= 16 && h < 23 ? 0.62 : 0.36;
    },
    // Que carro estaciona aqui (torcida de todo bairro: populares, sedãs, SUVs, picapes, uns velhos, um ou outro esportivo).
    _carFor(g, van) {
        const W = (t) => { let r = Math.random() * t.reduce((a, e) => a + e[1], 0); for (const [k, w] of t) if ((r -= w) <= 0) return k; return t[0][0]; };
        const cls = van ? 'van' : W([['hatch', 26], ['sedan', 22], ['suv', 16], ['pickup', 9], ['old', 12], ['sports', 6], ['taxi', 4], ['super', 1]]);
        const model = g.carLib.variantOf(cls), old = cls === 'old', oldP = [13, 14, 15, 16, 17, 18];
        return { model, old, paint: cls === 'taxi' ? 2 : old ? oldP[Math.floor(Math.random() * oldP.length)] : g.carLib.randomPaint(model) };
    },
    // Por quadro (Game): a câmera chegou perto (150 u) → os carros estacionam nas vagas (conforme a hora); longe (230 u) → somem os que
    // ficaram na vaga. São carros do trânsito (vehicleManager): trancados — mixa, chave de fenda, vidro quebrado, alarme, polícia, desmanche,
    // tudo vale. O que o jogador tirou da vaga deixa de ser do estacionamento: vira um carro comum do trânsito (largado, é reciclado).
    update(dt, game) {
        if (!this.built || !this.slots || !game.vehicleManager || !game.carLib || !game.traffic) return;
        this._lotT = (this._lotT || 0) - dt;
        if (this._lotT > 0) return;
        this._lotT = 0.5;
        this._lights(game);
        const f = game.camera.target, P = this.PARK, r = hypot((P[0] + P[2]) / 2 - f.x, (P[1] + P[3]) / 2 - f.z), V = game.vehicleManager.vehicles;
        // quem saiu da vaga (ou virou carcaça e foi trocado) não é mais do estacionamento
        for (const q of this.slots) {
            const c = q.car;
            if (!c) continue;
            if (c._gone || !V.includes(c)) { q.car = null; continue; }
            if (c.controlled || hypot(c.position.x - q.x, c.position.z - q.z) > 4) { c.keep = false; c.lot = null; q.car = null; }
        }
        if (r < 150 && !this.lotOn) this._fillLot(game);
        else if (r > 230 && this.lotOn) this._emptyLot(game);
        // a TORCIDA: pedestres de verdade (NPCManager: dá para assaltar, brigar, fugir...) na esplanada e no estacionamento, com o
        // estádio aberto — chegam aos poucos (4 a cada meio segundo) quando a câmera se aproxima e vão embora quando ela se afasta
        const rs = hypot(this.S.x - f.x, this.S.z - f.z), want = rs < 170 && !Interiors.active && game.npcManager && game.nav ? this.fansFor(game.dayNight.hour) : 0;
        this._fans = (this._fans || []).filter((n) => n.alive);
        if (this._fans.length < want) this._addFans(game, Math.min(4, want - this._fans.length));
        else if (rs > 240 && this._fans.length) { for (const n of this._fans) game.npcManager.removeNpc(n); this._fans = []; }
    },
    // Quantos torcedores (0 com o estádio fechado; o jogo da noite enche).
    fansFor(h) { return !Economy.isOpen('stadium', h) ? 0 : h >= 16 && h < 23 ? 28 : 14; },
    _addFans(game, n) {
        const P = this.PARK, nav = game.nav;
        for (let i = 0, t = 0; i < n && t < n * 8; t++) {
            const q = Math.random() < 0.75 ? this.E(1.12 + Math.random() * 0.2, Math.random() * Math.PI * 2) : [P[0] + Math.random() * (P[2] - P[0]), P[1] + Math.random() * (P[3] - P[1])];
            const p = nav.closestPoint(new BABYLON.Vector3(q[0], 0, q[1]), 6);
            if (!nav.walk(p.x, p.z) || hypot(p.x - q[0], p.z - q[1]) > 4) continue;
            const npc = new NPC(game.scene, nav, p, 15000 + (this._fanId = (this._fanId || 0) + 1), game.sprites, game.npcCtx, null);
            npc.setStyle(Math.random() < 0.65 ? 'sport' : 'casual'); npc.party = true;
            game.npcManager.npcs.push(npc); this._fans.push(npc); i++;
        }
    },
    _fillLot(game) {
        this.lotOn = true;
        const free = this.slots.filter((q) => !q.car), cars = free.filter((q) => !q.van), vans = free.filter((q) => q.van), occ = this.occupancy(game.dayNight.hour);
        let n = Math.min(this.LOT_CAP, Math.round(occ * cars.length)) - this.slots.filter((q) => q.car && !q.van).length;
        for (let i = cars.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cars[i], cars[j]] = [cars[j], cars[i]]; }
        const put = (q) => {
            const m = this._carFor(game, q.van), h = q.h + (q.van ? 0 : (Math.random() < 0.5 ? 0 : Math.PI));     // (uns de ré na vaga)
            const car = Garage.spawnCar(game, m.model, m.paint, q.x + (Math.random() - 0.5) * 0.3, q.z + (Math.random() - 0.5) * 0.4, h + (Math.random() - 0.5) * 0.06);
            if (!car) return;
            car.locked = true; car.keep = true; car.lot = this;                // trancado como o do meio-fio (Garage.spawnCar o deixa aberto)
            if (m.old) { car.hp = Math.round(car.hp * 0.7); car.old = true; }
            q.car = car;
        };
        for (const q of cars) { if (n-- <= 0) break; put(q); }
        for (const q of vans) if (Math.random() < 0.3 + occ) put(q);
    },
    _emptyLot(game) {
        this.lotOn = false;
        for (const q of this.slots) {
            const c = q.car;
            if (!c) continue;
            q.car = null;
            if (c.controlled || c.hold) { c.keep = false; c.lot = null; continue; }
            Garage.despawn(game, c);
        }
    },

    // ---------------------------------------------------------------- geometria (por fora)
    meshes(wb) {
        if (!this.built) return;
        const t0 = performance.now();
        this._wb = wb;
        this._meshGround(wb);
        this._meshStadium(wb);
        this._meshRamps(wb);
        this._meshDome(wb);
        this._meshPool(wb);
        this._meshParking(wb);
        this._meshStation(wb);
        this._meshPalms(wb);
        for (const o of this.solids) if (!o.stair && o.h > 3) wb._collider('maracana', o.x0, o.z0, o.x1, o.z1, o.h);
        console.log(`[MARACANÃ] geometria em ${(performance.now() - t0).toFixed(0)} ms`);
    },
    _c(c, k = 1) { return Landmarks._c(c, k); },
    _beam(bt, a, b, t, col) { Landmarks._beam(bt, a, b, t, col); },
    // Caixa orientada de p a q (pontos [x, z]), da lateral l0 a l1, com fundo/topo em p (ya0, ya1) e em q (yb0, yb1).
    _prism(bt, p, q, l0, l1, ya0, ya1, yb0, yb1, col, top = null) {
        if (l0 > l1) [l0, l1] = [l1, l0];
        const dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, nx = -uz, nz = ux, z3 = [[0, 0], [0, 0], [0, 0]];
        const V = (b, l, y) => [b[0] + nx * l, y, b[1] + nz * l];
        const A0 = V(p, l0, ya1), A1 = V(p, l1, ya1), B0 = V(q, l0, yb1), B1 = V(q, l1, yb1), a0 = V(p, l0, ya0), a1 = V(p, l1, ya0), b0 = V(q, l0, yb0), b1 = V(q, l1, yb0);
        const face = (a, b, c, d, n, k) => { bt.tri(a, b, c, n, z3, k); bt.tri(a, c, d, n, z3, k); };
        const s = Math.hypot(yb1 - ya1, L), up = [-ux * (yb1 - ya1) / s, L / s, -uz * (yb1 - ya1) / s];
        face(A0, A1, B1, B0, up, top || col);
        face(A0, B0, b0, a0, [-nx, 0, -nz], col); face(A1, B1, b1, a1, [nx, 0, nz], col);
        face(A0, A1, a1, a0, [-ux, 0, -uz], col); face(B0, B1, b1, b0, [ux, 0, uz], col);
    },
    // Placa de texto virada para o sul, em coordenadas do mundo (a mesma do Corcovado).
    _sign(wb, text, x, y, z, w, h, bg, fg) { return Corcovado._sign.call({ W: (a, b) => [a, b] }, wb, text, x, y, z, w, h, bg, fg); },

    // O chão do complexo: a esplanada de pedra em volta do estádio, as calçadas que ligam tudo, a grama fica do terreno.
    _meshGround(wb) {
        const S = this.S, pz = wb._batch('open_plaza', S.x, S.z), c = this._c.bind(this);
        Landmarks._ring(pz, S.x, S.z, S.rx, S.rz, 0.98, 1.3, 0.05, 0.05, 72, () => [1, 1, 1], true, 6);
        const uv = (x, z) => [x / 6, -z / 6];
        const strip = (x0, z0, x1, z1) => wb._batch('open_plaza', (x0 + x1) / 2, (z0 + z1) / 2).top(x0, z0, x1, z1, 0.05, uv, [1, 1, 1]);
        strip(-452, 56, -364, 66);                                                    // do estacionamento à esplanada
        strip(-356, 120, -312, 142);                                                  // da esplanada à estação (sob a passarela)
        strip(-470, 150, -456, 170); strip(-476, 104, -466, 112);                     // ao Maracanãzinho e ao parque aquático
        // canteiros (grama mais escura em volta das palmeiras) e bancos ao longo da esplanada
        const bt = wb._batch('trim', S.x, S.z);
        for (let i = 0; i < 28; i++) {
            const a = (i / 28) * Math.PI * 2 + 0.06;
            if (Math.abs(Math.sin(a) + 1) < 0.02) continue;
            const p = this.E(1.27, a);
            Landmarks._ring(bt, p[0], p[1], 1.6, 1.6, 0, 1, 0.08, 0.08, 10, () => c('#3f7d3a'));
            Landmarks._wall(bt, p[0], p[1], 1.6, 1.6, 1, 0.05, 0.3, 10, () => c('#bdb7aa'));
            if (i % 2) { const q = this.E(1.22, a + 0.06); bt.solid(q[0] - 1, q[1] - 0.3, q[0] + 1, q[1] + 0.3, 0.05, 0.45, c('#7a5a3a')); }
            if (i % 4 === 1) { const q = this.E(1.24, a - 0.07); this._beam(bt, [q[0], 0, q[1]], [q[0], 4.2, q[1]], 0.14, c('#2e3238')); bt.solid(q[0] - 0.35, q[1] - 0.2, q[0] + 0.35, q[1] + 0.2, 4.0, 4.3, c('#fff1c4')); }
        }
    },

    // O ESTÁDIO.
    _meshStadium(wb) {
        const S = this.S, c = this._c.bind(this), R = Landmarks._ring.bind(Landmarks), Wl = Landmarks._wall.bind(Landmarks), N = 96;
        const bt = (a) => { const p = this.E(1, a); return wb._batch('trim', p[0], p[1]); }, mid = wb._batch('trim', S.x, S.z);
        const conc = c('#d8d5cd'), concD = c('#b9b5ab'), dark = c('#3e444c'), glass = c('#4f5d6b'), white = c('#f3f4f6');
        // térreo: a base com os portões (vãos escuros) e o vidro escuro dos andares, recuado
        Wl(mid, S.x, S.z, S.rx, S.rz, 0.965, 0.1, S.h - 0.4, N, (i) => (i % 2 ? glass : dark));
        Wl(mid, S.x, S.z, S.rx, S.rz, 1.0, 0.05, 3.0, N, (i) => { const a = ((i + 0.5) / N) * Math.PI * 2; return Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2))) < 0.04 || i % 6 === 3 ? null : conc; });
        R(mid, S.x, S.z, S.rx, S.rz, 0.965, 1.0, 3.0, 3.0, N, () => concD);
        // os andares do anel (lajes salientes)
        for (const y of [4.6, 8.8]) {
            R(mid, S.x, S.z, S.rx, S.rz, 0.965, 1.05, y, y, N, () => conc);
            Wl(mid, S.x, S.z, S.rx, S.rz, 1.05, y - 0.55, y, N, () => concD);
        }
        // os pilares em V (dois braços de cada pilar se abrem do chão até a cobertura)
        for (let i = 0; i < 64; i++) {
            const a = (i / 64) * Math.PI * 2, a0 = a - 0.022, a1 = a + 0.022, top = this.E(1.075, a);
            const b = bt(a);
            for (const aa of [a0, a1]) { const g = this.E(1.005, aa); this._beam(b, [g[0], 0, g[1]], [top[0], S.h - 0.3, top[1]], 0.75, conc); }
            const k = this.E(1.04, a); this._beam(b, [k[0], 4.5, k[1]], [k[0], 4.9, k[1]], 0.9, concD);
        }
        // a COBERTURA: membrana branca levemente inclinada para dentro, a faixa de placas solares, as nervuras e o anel de compressão
        R(mid, S.x, S.z, S.rx, S.rz, 1.09, 0.67, S.h, S.h + 0.9, N, () => white);
        Wl(mid, S.x, S.z, S.rx, S.rz, 1.09, S.h - 0.5, S.h, N, () => c('#c9cdd3'));
        R(mid, S.x, S.z, S.rx, S.rz, 1.06, 0.98, S.h + 0.22, S.h + 0.4, N, (i) => c(i % 2 ? '#34465f' : '#2c3c54'));      // (acima da membrana: sem briga de profundidade)
        for (let i = 0; i < 96; i++) {
            const a = (i / 96) * Math.PI * 2, p = this.E(1.08, a), q = this.E(0.68, a);
            this._beam(bt(a), [p[0], S.h + 0.12, p[1]], [q[0], S.h + 0.98, q[1]], 0.16, c('#d4d8de'));
        }
        Wl(mid, S.x, S.z, S.rx, S.rz, 0.67, S.h + 0.1, S.h + 1.1, N, () => c('#5b626b'), -1);
        // os REFLETORES: a faixa de luz no topo do anel interno (malha própria: acende à noite com o estádio aberto — _lights)
        {
            const pos = [], idx = [], nor = [], y = S.h + 1.14, M = 96;
            for (let i = 0; i <= M; i++) {
                const a = (i / M) * Math.PI * 2, p = this.E(0.655, a), q = this.E(0.69, a);
                pos.push(p[0], y, p[1], q[0], y, q[1]); nor.push(0, 1, 0, 0, 1, 0);
                if (i < M) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
            }
            const ring = new BABYLON.Mesh('stadiumLights', wb.scene), vd = new BABYLON.VertexData();
            vd.positions = pos; vd.indices = idx; vd.normals = nor; vd.applyToMesh(ring);
            const rm = this._ringMat = new BABYLON.StandardMaterial('stadiumLights', wb.scene);
            rm.diffuseColor = new BABYLON.Color3(0.3, 0.31, 0.33); rm.specularColor = BABYLON.Color3.Black(); rm.emissiveColor = new BABYLON.Color3(0.25, 0.25, 0.25); rm.backFaceCulling = false;
            ring.material = rm; ring.isPickable = false; ring.freezeWorldMatrix();
            wb.meshes.push(ring);
        }
        // a ARQUIBANCADA: degraus em anéis, setores azuis, amarelos e brancos, com os corredores (vistos pela abertura)
        const sect = ['#2a5ea8', '#f0c63a', '#2a5ea8', '#f2f2ee', '#2a5ea8', '#f0c63a', '#2f6fb8', '#e8b830'];
        const tiers = 10;
        for (let r = 0; r < tiers; r++) {
            const k0 = 0.67 - r * 0.0195, k1 = k0 - 0.0195, y0 = S.h - 1.4 - r * 1.05, y1 = y0 - 1.05;
            R(mid, S.x, S.z, S.rx, S.rz, k0, k1, y0, y1, N, (i) => (i % 8 === 0 ? c('#d9d6ce') : c(sect[Math.floor(i / 12) % sect.length], r % 2 ? 0.88 : 1)));
            Wl(mid, S.x, S.z, S.rx, S.rz, k1, y1 - 0.3, y1, N, () => c('#8c8a86'), -1);
        }
        Wl(mid, S.x, S.z, S.rx, S.rz, 0.475, 0.4, 1.6, N, () => c('#e7e7e3'), -1);                         // o muro em volta do campo (placas)
        R(mid, S.x, S.z, S.rx, S.rz, 0.475, 0.0, 0.42, 0.42, N, () => c('#2c66a8'));                     // a pista azul
        // os placares (sob a borda da cobertura, nas pontas)
        for (const s of [-1, 1]) { const p = this.E(0.7, s > 0 ? Math.PI / 2 : -Math.PI / 2); mid.solid(p[0] - 5.5, p[1] - 0.3, p[0] + 5.5, p[1] + 0.3, S.h - 3.6, S.h - 0.6, c('#16181c')); }
        // o GRAMADO (textura própria: listras e as linhas)
        const hx = S.rx * 0.36, hz = S.rz * 0.33, mesh = BABYLON.MeshBuilder.CreateGround('stadiumPitch', { width: hx * 2, height: hz * 2 }, wb.scene);
        mesh.position.set(S.x, 0.46, S.z);
        const m = wb._mat('stadiumPitch', Landmarks._pitchTex(wb.scene));      // (maquete: fica a textura — as listras e as linhas são informação)
        mesh.material = m; mesh.isPickable = false; mesh.receiveShadows = true; mesh.freezeWorldMatrix();
        wb.meshes.push(mesh); wb.mats.stadiumPitch = m;
        // os portões: o portão sul (a entrada: marquise e a placa)
        const g = this.E(1, -Math.PI / 2), gb = wb._batch('trim', g[0], g[1]);
        gb.solid(g[0] - 3.4, g[1] - 2.2, g[0] + 3.4, g[1] + 0.4, 3.4, 3.8, c('#e9e9e6'));
        for (const s of [-1, 1]) gb.solid(g[0] + s * 3.2 - 0.25, g[1] - 2.1, g[0] + s * 3.2 + 0.25, g[1] - 1.6, 0, 3.4, c('#3b3f46'));
        this._sign(wb, 'PORTÃO 18 — MARACANÃ', g[0], 3.85, g[1] - 2.25, 6.6, 0.9, '#123f7a', '#ffffff');
    },

    // As RAMPAS HELICOIDAIS: núcleo de concreto e a rampa em espiral (2,5 voltas) com mureta, até o anel.
    _meshRamps(wb) {
        const c = this._c.bind(this), S = this.S;
        for (const a of this.RAMPS) {
            const C = this.E(1.17, a), bt = wb._batch('trim', C[0], C[1]), turns = 2.5, n = 72, H = 11.4;
            Landmarks._wall(bt, C[0], C[1], 3.6, 3.6, 1, 0, H + 0.6, 24, () => c('#c9c5bc'));
            Landmarks._ring(bt, C[0], C[1], 3.6, 3.6, 0, 1, H + 0.6, H + 0.6, 24, () => c('#bdb9b0'));
            for (let i = 0; i < n; i++) {
                const t0 = i / n, t1 = (i + 1) / n, a0 = a + t0 * turns * Math.PI * 2, a1 = a + t1 * turns * Math.PI * 2, y0 = 0.3 + t0 * H, y1 = 0.3 + t1 * H;
                const P = (an, r) => [C[0] + Math.cos(an) * r, C[1] + Math.sin(an) * r];
                const z3 = [[0, 0], [0, 0], [0, 0]], q = (an, r, y) => { const p = P(an, r); return [p[0], y, p[1]]; };
                const A = q(a0, 3.6, y0), B = q(a1, 3.6, y1), Cc = q(a1, 6.2, y1), D = q(a0, 6.2, y0), deck = c(i % 2 ? '#d2cec5' : '#c8c4bb');
                bt.tri(A, B, Cc, [0, 1, 0], z3, deck); bt.tri(A, Cc, D, [0, 1, 0], z3, deck);
                const Ab = q(a0, 3.6, y0 - 0.6), Bb = q(a1, 3.6, y1 - 0.6), Cb = q(a1, 6.2, y1 - 0.6), Db = q(a0, 6.2, y0 - 0.6);
                const nn = [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)];
                bt.tri(D, Cc, Cb, nn, z3, c('#aaa69c')); bt.tri(D, Cb, Db, nn, z3, c('#aaa69c'));
                void Ab; void Bb;
                const m0 = q(a0, 6.2, y0 + 1.0), m1 = q(a1, 6.2, y1 + 1.0);                 // mureta
                bt.tri(D, Cc, m1, nn, z3, c('#dedad2')); bt.tri(D, m1, m0, nn, z3, c('#dedad2'));
            }
            // a ligação da rampa com o anel
            const top = this.E(1.06, a);
            this._prism(bt, [C[0], C[1]], top, -1.4, 1.4, H - 0.4, H + 0.3, H - 0.4, H + 0.3, c('#c8c4bb'), c('#d6d2ca'));
        }
        void S;
    },

    // O MARACANÃZINHO: a cúpula branca com as nervuras, o anel de base com os pilares.
    _meshDome(wb) {
        const D = this.DOME, c = this._c.bind(this), bt = wb._batch('trim', D.x, D.z);
        Landmarks._wall(bt, D.x, D.z, D.r, D.r, 1, 0, 4.2, 48, (i) => (i % 3 === 1 ? c('#3e4650') : c('#d6d3cb')));
        Landmarks._ring(bt, D.x, D.z, D.r, D.r, 1.06, 0.96, 4.2, 4.6, 48, () => c('#c9c6be'));
        const rings = 9;
        for (let i = 0; i < rings; i++) {
            const t0 = i / rings, t1 = (i + 1) / rings, k0 = Math.cos(t0 * Math.PI / 2), k1 = Math.cos(t1 * Math.PI / 2), y0 = 4.6 + Math.sin(t0 * Math.PI / 2) * 7, y1 = 4.6 + Math.sin(t1 * Math.PI / 2) * 7;
            Landmarks._ring(bt, D.x, D.z, D.r * 0.98, D.r * 0.98, k0, Math.max(0.001, k1), y0, y1, 48, (j) => c(j % 4 === 0 ? '#d2d6dc' : '#f1f2f4', 1 - i * 0.012));
        }
        for (let j = 0; j < 24; j++) {                                                   // as nervuras
            const a = (j / 24) * Math.PI * 2;
            let prev = null;
            for (let i = 0; i <= 8; i++) {
                const t = i / 8, k = Math.cos(t * Math.PI / 2) * D.r * 0.99, y = 4.62 + Math.sin(t * Math.PI / 2) * 7 + 0.06, p = [D.x + Math.cos(a) * k, y, D.z + Math.sin(a) * k];
                if (prev) this._beam(bt, prev, p, 0.18, c('#c3c8cf'));
                prev = p;
            }
        }
        Landmarks._ring(bt, D.x, D.z, 2.6, 2.6, 0, 1, 11.65, 11.65, 16, () => c('#b8bec6'));
    },

    // O PARQUE AQUÁTICO: a piscina olímpica (raias), o deque e a arquibancada coberta a oeste.
    _meshPool(wb) {
        const P = this.POOL, c = this._c.bind(this), bt = wb._batch('trim', (P[0] + P[2]) / 2, (P[1] + P[3]) / 2);
        bt.solid(P[0], P[1], P[2], P[3], 0, 0.3, c('#d9d6cf'));
        const x0 = P[0] + 8, x1 = P[2] - 3, z0 = P[1] + 5, z1 = P[3] - 5;
        bt.solid(x0, z0, x1, z1, 0.3, 0.32, c('#2f9fd6'));
        for (let i = 1; i < 8; i++) { const z = z0 + (z1 - z0) * i / 8; bt.solid(x0 + 0.4, z - 0.07, x1 - 0.4, z + 0.07, 0.32, 0.34, c(i % 2 ? '#f2f2f2' : '#e64a3a')); }
        for (let r = 0; r < 6; r++) bt.solid(P[0] + r * 1.0, P[1] + 1, P[0] + (r + 1) * 1.0, P[3] - 1, 0.3, 0.6 + (5 - r) * 0.75, c(r % 2 ? '#3b6fb5' : '#e8eaec'));
        bt.solid(P[0] - 0.4, P[1] + 0.6, P[0] + 6.6, P[3] - 0.6, 5.2, 5.5, c('#eef0f2'));
        for (const z of [P[1] + 1, P[3] - 1]) this._beam(bt, [P[0] + 6.4, 0.3, z], [P[0] + 6.4, 5.2, z], 0.3, c('#8d949c'));
    },

    // O ESTACIONAMENTO: asfalto, as vagas pintadas, os carros e os ônibus; a placa ESTÁDIO DO MARACANÃ na entrada.
    _meshParking(wb) {
        const P = this.PARK, c = this._c.bind(this), ab = wb._batch('asphalt', (P[0] + P[2]) / 2, (P[1] + P[3]) / 2);
        ab.top(P[0], P[1], P[2], P[3], 0.06, (x, z) => [x / 6, -z / 6], [1, 1, 1]);
        const bt = wb._batch('trim', (P[0] + P[2]) / 2, (P[1] + P[3]) / 2), line = c('#f2f2f0'), yel = c('#e8c23a');
        // as vagas pintadas (os carros são de verdade: update) e a baia das vans, em amarelo
        for (const zr of this.ROWS.map((d) => P[1] + d)) for (let x = P[0] + 2; x <= P[2] - 2 + 0.01; x += this.SLOT) bt.solid(x - 0.06, zr - 3.4, x + 0.06, zr + 3.4, 0.06, 0.075, line);
        for (const v of this.slots.filter((q) => q.van)) {
            for (const s of [-1, 1]) bt.solid(v.x + s * 4.6 - 0.07, v.z - 1.7, v.x + s * 4.6 + 0.07, v.z + 1.7, 0.06, 0.075, yel);
            bt.solid(v.x - 4.6, v.z - 1.77, v.x + 4.6, v.z - 1.63, 0.06, 0.075, yel);
        }
        // a placa ESTÁDIO DO MARACANÃ (azul, na entrada do estacionamento)
        bt.solid(-362.4, 24.1, -361.6, 24.9, 0, 2.8, c('#3b3f46')); bt.solid(-352.4, 24.1, -351.6, 24.9, 0, 2.8, c('#3b3f46'));
        this._sign(wb, 'ESTÁDIO DO MARACANÃ', -357, 1.7, 24.0, 11, 1.2, '#1f4f9a', '#ffffff');
    },

    // A ESTAÇÃO: plataforma coberta, os dois trilhos com dormentes, um trem parado; a PASSARELA elevada (escadas, travessia).
    _meshStation(wb) {
        const T = this.STATION, c = this._c.bind(this), bt = wb._batch('trim', T.x0, (T.z0 + T.z1) / 2);
        bt.solid(T.x0, T.z0, T.x1, T.z1, 0, 1.0, c('#c9c4b8'));
        bt.solid(T.x0, T.z0, T.x0 + 0.4, T.z1, 1.0, 1.02, c('#f0c63a'));
        for (let z = T.z0 + 2; z < T.z1; z += 8) this._beam(bt, [T.x1 - 0.8, 1, z], [T.x1 - 0.8, 4.6, z], 0.28, c('#5b626b'));
        bt.solid(T.x0 - 1.2, T.z0 + 0.5, T.x1 + 0.4, T.z1 - 0.5, 4.6, 4.9, c('#e9ecef'));
        for (const x of T.tracks) {
            const tb = wb._batch('trim', x, 100);
            for (let z = -2; z < 188; z += 1.0) tb.solid(x - 1.3, z, x + 1.3, z + 0.3, 0.02, 0.14, c('#6b5a48'));
            for (const s of [-0.72, 0.72]) tb.solid(x + s - 0.07, -2, x + s + 0.07, 188, 0.14, 0.26, c('#7d838b'));
        }
        // um trem parado na plataforma (6 carros), outro chegando
        for (const [x, z0, n] of [[T.tracks[0], T.z0 + 1, 5], [T.tracks[1], 20, 4]]) {
            const tb = wb._batch('trim', x, z0 + 20);
            for (let i = 0; i < n; i++) {
                const z = z0 + i * 10.4;
                tb.solid(x - 1.5, z, x + 1.5, z + 10, 0.4, 3.6, c('#e8ebee'));
                tb.solid(x - 1.55, z + 0.4, x + 1.55, z + 9.6, 1.7, 2.6, c('#26313d'));
                tb.solid(x - 1.56, z + 0.2, x + 1.56, z + 9.8, 0.9, 1.25, c('#2b8a4a'));
                tb.solid(x - 1.3, z + 0.3, x + 1.3, z + 9.7, 3.6, 3.8, c('#c3c8ce'));
            }
        }
        // a passarela
        const B = this.BRIDGE, h = B.h, [p0, p1, p2, p3] = B.pts, w = B.w, pb = wb._batch('trim', p2[0], p2[1]);
        const deck = c('#c8c4bb'), side = c('#a9a59c'), rail = c('#3b3f46');
        const flight = (a, b, ha, hb) => {
            const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, n = Math.max(2, Math.round(Math.abs(hb - ha) / 0.3)), at = (u) => [a[0] + ux * u, a[1] + uz * u];
            if (Math.abs(hb - ha) < 0.1) this._prism(pb, a, b, -w / 2, w / 2, ha - 0.7, ha, hb - 0.7, hb, side, deck);
            else for (let i = 0; i < n; i++) { const y1 = ha + (hb - ha) * (i + 1) / n; this._prism(pb, at(L * i / n), at(L * (i + 1) / n), -w / 2, w / 2, y1 - 0.45, y1, y1 - 0.45, y1, side, c(i % 2 ? '#d2cec5' : '#c6c2b8')); }
            for (const s of [-1, 1]) {
                const n2 = Math.max(1, Math.round(L / 1.8));
                for (let i = 0; i <= n2; i++) { const p = at(L * i / n2), y = ha + (hb - ha) * i / n2, nx = -uz * s * (w / 2), nz = ux * s * (w / 2); this._beam(pb, [p[0] + nx, y, p[1] + nz], [p[0] + nx, y + 1.05, p[1] + nz], 0.08, rail); }
                const A = at(0), Bq = at(L), nx = -uz * s * (w / 2), nz = ux * s * (w / 2);
                this._beam(pb, [A[0] + nx, ha + 1.05, A[1] + nz], [Bq[0] + nx, hb + 1.05, Bq[1] + nz], 0.08, rail);
            }
        };
        flight(p0, p1, 0, h); flight(p1, p2, h, h); flight(p3, p2, 0, h);
        for (const q of [p1, p2]) pb.solid(q[0] - w / 2, q[1] - w / 2, q[0] + w / 2, q[1] + w / 2, h - 0.7, h, deck);
        for (let x = -334; x > -340; x -= 4.5) pb.solid(x - 0.35, 129.65, x + 0.35, 132.35, 0, h - 0.7, c('#9a958b'));
        pb.solid(p1[0] - 0.35, p1[1] - 0.35, p1[0] + 0.35, p1[1] + 0.35, 0, h - 0.7, c('#9a958b'));
        pb.solid(p2[0] - 0.35, p2[1] - 0.35, p2[0] + 0.35, p2[1] + 0.35, 0, h - 0.7, c('#9a958b'));
    },

    // Palmeiras e árvores (sprites do campo) ao longo da esplanada, das calçadas e em volta do estacionamento.
    _meshPalms(wb) {
        const base = PropSprites.FRAME / Config.art.ppu, spots = [], rng = Pixel.rng(1963);
        for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2 + 0.06; if (Math.abs(Math.sin(a) + 1) >= 0.02) spots.push([...this.E(1.27, a), 'palm']); }
        for (let x = -450; x < -364; x += 7) spots.push([x + 3.5, 60.5, 'palm']);                    // (ao sul, o estacionamento encosta na avenida)
        for (let z = 92; z < 142; z += 7) spots.push([-302, z, 'palm']);
        for (let i = 0; i < 70; i++) {                                                  // arvoredo nos gramados em volta
            const x = this.AREA[0] + 4 + rng() * (this.AREA[2] - this.AREA[0] - 8), z = this.AREA[1] + 4 + rng() * (this.AREA[3] - this.AREA[1] - 8);
            if (this.inEllipse(x, z, 1.34) || this._busy(x, z)) continue;
            spots.push([x, z, rng() < 0.4 ? 'palm' : (rng() < 0.5 ? 'oak' : 'ipe')]);
        }
        for (const [x, z, kind] of spots) {
            const fr = wb.props.pick(kind, Pixel.hash(x * 7 | 0, z * 7 | 0, 41)), high = PropSprites.HEIGHT[kind] > 2;
            wb._spriteQuad(wb._batch(high ? 'veg_hi' : 'veg_lo', x, z), fr.index, fr.row, x, z, base * (1 + Pixel.hash(x | 0, z | 0, 42) * 0.3), PropSprites.HEIGHT[kind]);
        }
    },
    // Ponto ocupado por alguma construção do complexo (sem árvore em cima).
    _busy(x, z) {
        const inR = (R, m = 2) => x > R[0] - m && x < R[2] + m && z > R[1] - m && z < R[3] + m;
        const T = this.STATION, D = this.DOME;
        if (inR(this.PARK, 4) || inR(this.POOL, 3) || inR([T.tracks[1] - 4, -4, T.x1 + 3, 190], 1)) return true;
        if (Math.hypot(x - D.x, z - D.z) < D.r + 4) return true;
        for (const a of this.RAMPS) { const C = this.E(1.17, a); if (Math.hypot(x - C[0], z - C[1]) < 9) return true; }
        if (RoadPlan.onPavement(x, z, 3)) return true;
        return false;
    },

    // ---------------------------------------------------------------- mapa
    drawMap(ctx, X, Y, k, vis) {
        if (!this.built) return;
        const S = this.S, A = this.AREA;
        if (!vis(A[0], A[1], A[2], A[3])) return;
        const rect = (x0, z0, x1, z1, col) => { ctx.fillStyle = col; ctx.fillRect(X(x0), Y(z1), (x1 - x0) * k, (z1 - z0) * k); };
        const ell = (x, z, rx, rz, col, a0 = 0, a1 = Math.PI * 2) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(X(x), Y(z), Math.max(0.5, rx * k), Math.max(0.5, rz * k), 0, a0, a1); ctx.fill(); };
        // esplanada e calçadas
        ell(S.x, S.z, S.rx * 1.3, S.rz * 1.3, '#d3cdc0');
        rect(-452, 56, -364, 66, '#d3cdc0'); rect(-356, 120, -312, 142, '#d3cdc0'); rect(-470, 150, -456, 170, '#d3cdc0'); rect(-476, 104, -466, 112, '#d3cdc0');
        // estacionamento (vagas e carros de perto)
        const P = this.PARK; rect(P[0], P[1], P[2], P[3], '#4c5056');
        if (k >= 1.2) for (const zr of this.ROWS.map((d) => P[1] + d)) for (let x = P[0] + 2; x <= P[2] - 2 + 0.01; x += this.SLOT) rect(x - 0.06, zr - 3.4, x + 0.06, zr + 3.4, '#e8e8e4');
        if (k >= 1.2) for (const v of this.slots.filter((q) => q.van)) rect(v.x - 4.6, v.z - 1.7, v.x + 4.6, v.z - 1.6, '#e8c23a');
        // estação, trilhos, trens e a passarela
        const T = this.STATION;
        for (const x of T.tracks) rect(x - 1.3, A[1], x + 1.3, A[3], '#8c7a66');
        rect(T.tracks[0] - 1.5, T.z0 + 1, T.tracks[0] + 1.5, T.z0 + 52, '#e8ebee'); rect(T.tracks[1] - 1.5, 20, T.tracks[1] + 1.5, 61, '#e8ebee');
        rect(T.x0 - 1.2, T.z0 + 0.5, T.x1 + 0.4, T.z1 - 0.5, '#e9ecef');
        const B = this.BRIDGE; ctx.strokeStyle = '#a9a59c'; ctx.lineWidth = Math.max(1, B.w * k); ctx.lineCap = 'butt'; ctx.beginPath();
        B.pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.stroke();
        // o Maracanãzinho e o parque aquático
        const D = this.DOME; ell(D.x, D.z, D.r, D.r, '#eef0f2');
        if (k >= 0.8) { ctx.strokeStyle = '#c3c8cf'; ctx.lineWidth = 1; for (let j = 0; j < 12; j++) { const a = (j / 12) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(X(D.x), Y(D.z)); ctx.lineTo(X(D.x + Math.cos(a) * D.r), Y(D.z + Math.sin(a) * D.r)); ctx.stroke(); } }
        const Q = this.POOL; rect(Q[0], Q[1], Q[2], Q[3], '#d9d6cf'); rect(Q[0] + 8, Q[1] + 5, Q[2] - 3, Q[3] - 5, '#2f9fd6'); rect(Q[0], Q[1] + 1, Q[0] + 6, Q[3] - 1, '#3b6fb5');
        // o estádio: sombra, cobertura (com nervuras), a arquibancada pela abertura, a pista e o gramado
        ctx.save(); ctx.globalAlpha = 0.3; ctx.translate(3 * k, 3 * k); ell(S.x, S.z, S.rx * 1.09, S.rz * 1.09, '#000'); ctx.restore();
        ell(S.x, S.z, S.rx * 1.09, S.rz * 1.09, '#f3f4f6');
        ctx.strokeStyle = '#2c3c54'; ctx.lineWidth = Math.max(1, 2 * k); ctx.beginPath(); ctx.ellipse(X(S.x), Y(S.z), S.rx * 1.02 * k, S.rz * 1.02 * k, 0, 0, Math.PI * 2); ctx.stroke();
        if (k >= 0.8) { ctx.strokeStyle = 'rgba(150,158,168,0.6)'; ctx.lineWidth = 1; for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(X(S.x + Math.cos(a) * S.rx * 1.08), Y(S.z + Math.sin(a) * S.rz * 1.08)); ctx.lineTo(X(S.x + Math.cos(a) * S.rx * 0.68), Y(S.z + Math.sin(a) * S.rz * 0.68)); ctx.stroke(); } }
        const sect = ['#2a5ea8', '#f0c63a', '#2a5ea8', '#f2f2ee', '#2a5ea8', '#f0c63a', '#2f6fb8', '#e8b830'];
        for (let i = 0; i < 8; i++) { ctx.fillStyle = sect[i]; ctx.beginPath(); ctx.moveTo(X(S.x), Y(S.z)); ctx.ellipse(X(S.x), Y(S.z), S.rx * 0.67 * k, S.rz * 0.67 * k, 0, -((i + 1) / 8) * Math.PI * 2, -(i / 8) * Math.PI * 2); ctx.closePath(); ctx.fill(); }
        ell(S.x, S.z, S.rx * 0.475, S.rz * 0.475, '#2c66a8');
        const hx = S.rx * 0.36, hz = S.rz * 0.33;
        for (let i = 0; i < 12; i++) rect(S.x - hx + (i * 2 * hx) / 12, S.z - hz, S.x - hx + ((i + 1) * 2 * hx) / 12, S.z + hz, i % 2 ? '#3f9a3c' : '#4aab45');
        if (k >= 1) { ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(1, 0.25 * k); ctx.strokeRect(X(S.x - hx * 0.95), Y(S.z + hz * 0.93), hx * 1.9 * k, hz * 1.86 * k); ctx.beginPath(); ctx.moveTo(X(S.x), Y(S.z + hz * 0.93)); ctx.lineTo(X(S.x), Y(S.z - hz * 0.93)); ctx.stroke(); ctx.beginPath(); ctx.arc(X(S.x), Y(S.z), hz * 0.25 * k, 0, Math.PI * 2); ctx.stroke(); }
        for (const a of this.RAMPS) { const C = this.E(1.17, a); ell(C[0], C[1], 6.4, 6.4, '#c8c4bb'); ell(C[0], C[1], 3.6, 3.6, '#a9a59c'); }
        const g = this.E(1, -Math.PI / 2); rect(g[0] - 3.4, g[1] - 2.2, g[0] + 3.4, g[1] + 0.4, '#123f7a');
    },

    // ================================================================ POR DENTRO (Interiors)
    W: 60, D: 40,
    TICKET: 40,                                      // o ingresso (R$)
    // A sala (formato do ShopCtx.finish): o quadro pintado em HD, os sólidos, a porta, onde se nasce, o atendente e a torcida.
    room() {
        const W = this.W, D = this.D, IN = { x0: -0.5, z0: -1, x1: W + 0.5, z1: D + 1 }, PPU = 28;
        const cv = document.createElement('canvas');
        cv.width = Math.round((IN.x1 - IN.x0) * PPU); cv.height = Math.round((IN.z1 - IN.z0) * PPU);
        const g = cv.getContext('2d');
        this._paint(g, IN, PPU);
        const obs = [], add = (x0, z0, x1, z1, h = 2.5, extra = {}) => obs.push(Object.assign({ x0, z0, x1, z1, h }, extra));
        const door = { x0: W / 2 - 1.3, x1: W / 2 + 1.3 };
        add(-0.6, -0.6, 0.6, D, 3); add(W - 0.6, -0.6, W + 0.6, D, 3);                  // paredes laterais
        add(-0.6, -0.6, door.x0, 0.6, 3); add(door.x1, -0.6, W + 0.6, 0.6, 3);          // a frente, com o vão da porta
        add(2, 5.4, 12.2, 9.4, 2.4); add(47.8, 5.4, 58, 9.4, 2.4);                       // bilheteria e lanchonete
        add(0.7, 5.6, 1.9, 7.2, 1.2); add(56, 4.6, 58, 5.4, 1);                         // o cofre e o estoque (Robbery)
        add(0.6, 9.4, 18, 10.4, 3); add(42, 9.4, W - 0.6, 10.4, 3);                      // o muro das catracas
        add(0.6, 26, W - 0.6, 28.2, 1.4);                                                // o alambrado (ninguém invade o campo)
        const gates = [];                                                                // as catracas (liberam com o ingresso)
        for (let i = 0; i < 6; i++) { const x = 18 + i * 4; gates.push({ x0: x, z0: 9.5, x1: x + 4, z1: 10.3, h: 1.1, gate: true }); }
        const patrons = [], fan = (x, z, face) => patrons.push({ x, z, face, variant: patrons.length * 3 + 1 });
        for (const [x, z] of [[8, 16.2], [11, 19.2], [18, 17.2], [22, 22.2], [26, 15.2], [34, 18.2], [37, 21.2], [41, 16.2], [48, 19.2], [52, 23.2], [55, 17.2], [5, 22.2], [24, 24.2], [44, 24.2]]) fan(x, z, Math.PI);
        for (const [x, z, f] of [[20, 4.5, 0], [24, 6.2, Math.PI / 2], [38, 3.8, -Math.PI / 2], [43, 7, Math.PI]]) fan(x, z, f);
        patrons.push({ x: 7, z: 7.9, face: Math.PI, variant: 7 });                      // a bilheteira
        return {
            canvas: { toTexture: (scene) => { const t = new BABYLON.DynamicTexture('stadiumRoom', cv, scene, false); t.update(false); t.wrapU = t.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE; return t; } },
            in: IN, W, D, obs, gates, door, spawn: { x: W / 2, z: 2.2 },
            clerk: { x: 52.9, z: 7.9, face: Math.PI, variant: 4 }, patrons,
            uses: [{ kind: 'ticket', x0: 2, z0: 3.4, x1: 12.2, z1: 5.4 }, { kind: 'watch', x0: 1, z0: 13, x1: W - 1, z1: 26 },
                // no assalto (Robbery, como numa loja): o cofre da bilheteria, o HD das câmeras e o estoque da lanchonete
                { kind: 'safe', x0: 0.7, z0: 5.6, x1: 1.9, z1: 7.2 }, { kind: 'dvr', x0: 12.3, z0: 6.2, x1: 13.1, z1: 7 }, { kind: 'stock', x0: 56, z0: 4.6, x1: 58, z1: 5.4 }],
            seats: [], tables: [], counters: [],
        };
    },

    // O quadro da sala, pintado em HD (canvas 2D): coordenadas da sala (x leste, z norte, origem no canto sudoeste).
    _paint(g, IN, PPU) {
        const W = this.W, D = this.D, X = (x) => (x - IN.x0) * PPU, Y = (z) => (IN.z1 - z) * PPU;
        const R = (x0, z0, x1, z1, col) => { g.fillStyle = col; g.fillRect(X(x0), Y(z1), (x1 - x0) * PPU, (z1 - z0) * PPU); };
        const rng = Pixel.rng(950);
        g.fillStyle = '#0d0f12'; g.fillRect(0, 0, g.canvas.width, g.canvas.height);
        // ---- o GRAMADO (z 28 → D): listras de corte, as linhas, a grande área e o gol ao norte
        for (let i = 0; i < 14; i++) R((i * W) / 14, 28.2, ((i + 1) * W) / 14, D + 0.5, i % 2 ? '#3d9a3a' : '#48aa44');
        for (let n = 0; n < 900; n++) { g.fillStyle = `rgba(${rng() < 0.5 ? '255,255,255' : '0,40,0'},0.05)`; g.fillRect(X(rng() * W), Y(28.2 + rng() * (D - 28)), 2, 2); }
        g.strokeStyle = 'rgba(255,255,255,0.92)'; g.lineWidth = 0.18 * PPU;
        g.strokeRect(X(2), Y(D + 0.6), (W - 4) * PPU, (D + 0.6 - 29.4) * PPU);
        g.strokeRect(X(W / 2 - 10), Y(D + 0.6), 20 * PPU, 6.4 * PPU);                      // a grande área
        g.strokeRect(X(W / 2 - 4.5), Y(D + 0.6), 9 * PPU, 2.4 * PPU);                       // a pequena área
        g.beginPath(); g.arc(X(W / 2), Y(D - 5.4), 4.6 * PPU, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(X(W / 2), Y(D - 3.8), 0.18 * PPU, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(X(W / 2), Y(29.4), 5 * PPU, Math.PI, 2 * Math.PI); g.stroke();  // o meio do círculo central (lá embaixo)
        // o gol (trave e rede)
        g.fillStyle = 'rgba(255,255,255,0.35)';
        for (let x = W / 2 - 3.6; x <= W / 2 + 3.6; x += 0.35) g.fillRect(X(x), Y(D + 1), 1, 0.9 * PPU);
        g.fillStyle = '#f4f4f4'; g.fillRect(X(W / 2 - 3.7), Y(D + 0.2), 7.4 * PPU, 0.22 * PPU);
        // ---- o ALAMBRADO e as placas de publicidade (z 26 → 28.2)
        const ads = [['#c8102e', 'GOL!'], ['#1f4f9a', 'RIO'], ['#f0c63a', 'MARACANÃ'], ['#2b8a4a', 'BRASIL'], ['#111', 'FUTEBOL'], ['#e8682a', 'TORCIDA'], ['#1f4f9a', 'CARIOCA']];
        for (let i = 0; i < 12; i++) {
            const x0 = 0.6 + i * (W - 1.2) / 12, x1 = x0 + (W - 1.2) / 12 - 0.15, [bg, tx] = ads[i % ads.length];
            R(x0, 26.9, x1, 28.0, bg);
            g.fillStyle = bg === '#f0c63a' ? '#123f7a' : '#fff'; g.font = `900 ${0.62 * PPU}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText(tx, X((x0 + x1) / 2), Y(27.45));
        }
        R(0.6, 26.3, W - 0.6, 26.9, '#5b6168');
        g.strokeStyle = 'rgba(40,60,50,0.55)'; g.lineWidth = 1;
        for (let x = 0.6; x < W - 0.6; x += 0.25) { g.beginPath(); g.moveTo(X(x), Y(26.9)); g.lineTo(X(x + 0.25), Y(26.3)); g.stroke(); }
        // ---- a ARQUIBANCADA (z 13 → 26): degraus, cadeiras em setores (azul, amarelo, branco) e os corredores de escada
        const aisles = [[14, 16], [29, 31], [44, 46]], inAisle = (x) => aisles.some(([a, b]) => x > a && x < b);
        const sectorCol = (x) => { const s = Math.floor(x / 15); return [['#2a5ea8', '#3468b4'], ['#f0c63a', '#e2b52c'], ['#2a5ea8', '#3468b4'], ['#f2f2ee', '#dcdcd6']][s % 4]; };
        for (let r = 0; r < 13; r++) {
            const z0 = 13 + r, shade = 0.86 + r * 0.012;
            R(0.6, z0, W - 0.6, z0 + 1, `rgb(${Math.round(150 * shade)},${Math.round(148 * shade)},${Math.round(142 * shade)})`);
            R(0.6, z0 + 0.92, W - 0.6, z0 + 1, 'rgba(0,0,0,0.35)');
            for (let x = 0.8; x < W - 1; x += 0.62) {
                if (inAisle(x) || inAisle(x + 0.5)) continue;
                const [a, b] = sectorCol(x);
                g.fillStyle = (Math.floor(x / 0.62) + r) % 2 ? a : b;
                const px = X(x), py = Y(z0 + 0.86), pw = 0.52 * PPU, ph = 0.5 * PPU;
                g.beginPath(); g.roundRect ? g.roundRect(px, py, pw, ph, 3) : g.rect(px, py, pw, ph); g.fill();
                g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px, py + ph - 3, pw, 3);
            }
        }
        for (const [a, b] of aisles) {
            R(a, 13, b, 26.3, '#c9c6be');
            for (let z = 13; z < 26.3; z += 0.5) R(a, z, b, z + 0.06, 'rgba(60,60,60,0.45)');
            R(a, 13, a + 0.12, 26.3, '#f0c63a'); R(b - 0.12, 13, b, 26.3, '#f0c63a');
        }
        // ---- o VOMITÓRIO (corredor, z 10.4 → 13) e o muro das CATRACAS (z 9.4 → 10.4)
        R(0.6, 10.4, W - 0.6, 13, '#6d6f73');
        for (let x = 0.6; x < W - 0.6; x += 2.4) R(x, 10.4, x + 0.06, 13, 'rgba(0,0,0,0.25)');
        R(0.6, 9.4, 18, 10.4, '#c9c6be'); R(42, 9.4, W - 0.6, 10.4, '#c9c6be');
        R(0.6, 9.4, 18, 9.6, '#9a9890'); R(42, 9.4, W - 0.6, 9.6, '#9a9890');
        for (let i = 0; i < 6; i++) {                                                       // catracas (poste, braços, luz verde)
            const x = 18 + i * 4;
            R(x + 0.2, 9.5, x + 0.9, 10.3, '#5b6168'); R(x + 0.9, 9.8, x + 3.6, 10.0, '#c0c4ca');
            g.fillStyle = '#2fd16a'; g.beginPath(); g.arc(X(x + 0.55), Y(10.0), 0.16 * PPU, 0, Math.PI * 2); g.fill();
        }
        // ---- o SAGUÃO (z 0.6 → 9.4): piso de granito, faixas azul e branca nas paredes, bilheteria, lanchonete, bancos e banners
        for (let z = 0.6; z < 9.4; z += 1.2) for (let x = 0.6; x < W - 0.6; x += 1.2) R(x, z, x + 1.2, z + 1.2, ((x / 1.2 + z / 1.2) | 0) % 2 ? '#d8d6d0' : '#cfcdc6');
        g.strokeStyle = 'rgba(120,118,110,0.35)'; g.lineWidth = 1;
        for (let z = 0.6; z < 9.4; z += 1.2) { g.beginPath(); g.moveTo(X(0.6), Y(z)); g.lineTo(X(W - 0.6), Y(z)); g.stroke(); }
        for (let x = 0.6; x < W - 0.6; x += 1.2) { g.beginPath(); g.moveTo(X(x), Y(0.6)); g.lineTo(X(x), Y(9.4)); g.stroke(); }
        R(W / 2 - 4, 0.6, W / 2 + 4, 9.4, 'rgba(31,79,154,0.18)');                          // a passadeira azul até as catracas
        // bilheteria: guichês de vidro, balcão, placa
        R(2, 5.4, 12.2, 9.4, '#2a3340'); R(2.2, 6.2, 12, 9.2, '#8fb8c9'); R(2, 5.4, 12.2, 6.2, '#e3e0d8');
        for (let x = 4.5; x < 12; x += 2.5) R(x, 6.2, x + 0.12, 9.2, '#2a3340');
        R(2, 9.1, 12.2, 9.4, '#1f4f9a');
        // lanchonete: balcão, vitrine, chapa, placa
        R(47.8, 5.4, 58, 9.4, '#7a4a2a'); R(48, 6.2, 57.8, 9.2, '#e9e2d2'); R(47.8, 5.4, 58, 6.2, '#c0392b');
        for (const [x, col] of [[49, '#f0c63a'], [51, '#e8682a'], [53.5, '#c0392b'], [55.5, '#8a5a30']]) { g.fillStyle = col; g.beginPath(); g.arc(X(x), Y(5.8), 0.28 * PPU, 0, Math.PI * 2); g.fill(); }
        R(48.4, 8.2, 52, 9, '#3a3c40'); R(53, 8.2, 57.4, 9, '#b9bdc2');
        const sign = (x, z, w, h, bg, fg, text) => {
            R(x - w / 2, z - h / 2, x + w / 2, z + h / 2, bg);
            g.fillStyle = fg; g.font = `900 ${h * 0.62 * PPU}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, X(x), Y(z));
        };
        sign(7.1, 9.75, 7, 0.7, '#1f4f9a', '#fff', 'BILHETERIA'); sign(52.9, 9.75, 7, 0.7, '#c0392b', '#fff', 'LANCHONETE');
        // o cofre da bilheteria (no corredor de serviço), o rack das câmeras e o estoque da lanchonete (Robbery)
        R(0.7, 5.6, 1.9, 7.2, '#3a3f46'); R(0.85, 5.75, 1.75, 7.05, '#59606a'); g.fillStyle = '#c9cfd6'; g.beginPath(); g.arc(X(1.3), Y(6.4), 0.22 * PPU, 0, Math.PI * 2); g.fill();
        R(12.3, 6.2, 13.1, 7, '#22262b'); for (let i = 0; i < 3; i++) R(12.4, 6.3 + i * 0.24, 13.0, 6.42 + i * 0.24, i === 1 ? '#3ad06a' : '#4a5059');
        for (let i = 0; i < 4; i++) R(56 + (i % 2) * 1, 4.62 + Math.floor(i / 2) * 0.4, 56.9 + (i % 2) * 1, 4.98 + Math.floor(i / 2) * 0.4, ['#b8862e', '#8a5a2b', '#c9a227', '#7a4a22'][i]);
        sign(30, 0.9, 10, 0.6, '#f0c63a', '#123f7a', 'ESTÁDIO DO MARACANÃ');
        // bancos e lixeiras no saguão
        for (const x of [17, 25, 35, 43]) { R(x - 1.4, 1.6, x + 1.4, 2.2, '#7a5a3a'); R(x - 1.4, 2.1, x + 1.4, 2.25, '#5e4429'); }
        // ---- as paredes (casca): as laterais e a frente com o vão da porta
        R(-0.5, -1, 0.6, D + 1, '#3a3f46'); R(W - 0.6, -1, W + 0.5, D + 1, '#3a3f46');
        R(-0.5, -1, W / 2 - 1.3, 0.6, '#4a5059'); R(W / 2 + 1.3, -1, W + 0.5, 0.6, '#4a5059');
        R(-0.5, 0.45, W / 2 - 1.3, 0.6, '#1f4f9a'); R(W / 2 + 1.3, 0.45, W + 0.5, 0.6, '#1f4f9a');
        // luz: holofotes no campo, mais escuro no saguão de baixo
        const lg = g.createLinearGradient(0, Y(D), 0, Y(0));
        lg.addColorStop(0, 'rgba(255,255,240,0.08)'); lg.addColorStop(0.55, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,0.12)');
        g.fillStyle = lg; g.fillRect(0, 0, g.canvas.width, g.canvas.height);
    },

    // Entrou: as catracas fecham (sem ingresso), o jogo começa (jogadores e bola), a torcida.
    onEnter(game, data) {
        const o = Interiors.STAGE;
        this.ticket = false;
        this._gateObs = data.gates.map((s) => ({ x0: o.x + s.x0, z0: o.z + s.z0, x1: o.x + s.x1, z1: o.z + s.z1, h: s.h, gate: true }));
        Interiors.obstacles.push(...this._gateObs);
        this._match(game);
    },
    onLeave() {
        for (const p of this._players || []) p.actor.setVisible(false);
        if (this._ball) this._ball.setEnabled(false);
        this._watching = null;
    },
    // O jogo: 8 jogadores correndo atrás da bola no campo (metade de cima da sala), gols de vez em quando, o placar.
    _match(game) {
        const sc = game.scene, S = game.sprites.sheets, o = Interiors.STAGE;
        if (!this._players) {
            this._players = [];
            for (let i = 0; i < 8; i++) {
                const a = new SpriteActor(sc, S.civA, this.KITS[i % 2][(i >> 1) % 4], 'stadiumPlayer' + i);
                this._players.push({ actor: a, team: i % 2, x: 0, z: 0, tx: 0, tz: 0 });
            }
            const b = this._ball = BABYLON.MeshBuilder.CreateSphere('stadiumBall', { diameter: 0.42, segments: 8 }, sc), m = new BABYLON.StandardMaterial('stadiumBall', sc);
            m.diffuseColor = new BABYLON.Color3(1, 1, 1); m.emissiveColor = new BABYLON.Color3(0.6, 0.6, 0.6); b.material = m; b.isPickable = false;
        }
        this._players.forEach((p, i) => {
            p.x = 6 + (i * 6.5) % 48; p.z = 30 + (i * 3.1) % 8; p.tx = p.x; p.tz = p.z;
            p.actor.setVisible(true); p.actor.play('run'); p.actor.setPosition(o.x + p.x, o.z + p.z); p.actor.mesh.position.y = 0.5;
            p.actor.mesh.computeWorldMatrix(true); p.actor.mesh.refreshBoundingInfo();        // (no palco: a cidade que sai na entrada não o leva junto)
        });
        this._ballP = { x: this.W / 2, z: 33, vx: 3, vz: 1.4 };
        this._ball.setEnabled(true); this._ball.position.set(o.x + this.W / 2, 0.42, o.z + 33); this._ball.computeWorldMatrix(true); this._ball.refreshBoundingInfo();
        this.score = this.score || [0, 0];
        this._goalT = 0;
    },
    TEAMS: ['Fla', 'Flu'],
    KITS: [[7, 14, 15, 24], [17, 19, 17, 19]],          // variações de roupa com camisa vermelha (Fla) e verde (Flu)
    // Por quadro (Interiors.update): a bola rola, os jogadores correm atrás dela, gol na rede do norte.
    tick(dt, game) {
        const B = this._ballP, o = Interiors.STAGE, W = this.W, D = this.D;
        if (!B) return;
        B.x += B.vx * dt; B.z += B.vz * dt; B.vx *= Math.pow(0.6, dt); B.vz *= Math.pow(0.6, dt);
        if (B.x < 3 || B.x > W - 3) { B.vx = -B.vx; B.x = Math.max(3, Math.min(W - 3, B.x)); }
        if (B.z < 29.6) { B.vz = Math.abs(B.vz); B.z = 29.6; }
        if (B.z > D - 0.3) {                                                                  // no gol (ou pela linha de fundo)
            if (Math.abs(B.x - W / 2) < 3.6 && this._goalT <= 0) {
                const t = Math.floor(Math.random() * 2); this.score[t]++; this._goalT = 4;
                game._flash(`⚽ GOOOL do ${this.TEAMS[t]}! ${this.TEAMS[0]} ${this.score[0]} × ${this.score[1]} ${this.TEAMS[1]} — a arquibancada explode`);
                for (const a of Interiors._actors) if (a.mesh.isEnabled() && Math.random() < 0.6 && typeof Bubbles !== 'undefined') Bubbles.say(a, ['GOOOL!', 'É CAMPEÃO!', 'Uhuuu!', 'Vamo, vamo!'][Math.floor(Math.random() * 4)], { tone: 'happy', ms: 1800 });
            }
            B.z = D - 0.3; B.vz = -Math.abs(B.vz) - 2; B.vx += (Math.random() - 0.5) * 6;
        }
        this._goalT -= dt;
        let near = null, nd = 1e9;
        for (const p of this._players) {
            const d = Math.hypot(p.x - B.x, p.z - B.z);
            if (d < nd) { nd = d; near = p; }
            // cada um vai para um ponto do seu lado da bola (o mais perto vai na bola)
            p.tx = B.x + (p.team ? 1 : -1) * (2 + (this._players.indexOf(p) % 4) * 2.5); p.tz = Math.max(29.5, Math.min(D - 0.8, B.z + ((this._players.indexOf(p) % 3) - 1) * 3));
        }
        if (near) { near.tx = B.x; near.tz = B.z; if (nd < 0.7) { const up = near.team ? 1 : 0.6; B.vx = (Math.random() - 0.5) * 10; B.vz = (Math.random() < up ? 1 : -1) * (4 + Math.random() * 5); } }
        for (const p of this._players) {
            const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz), sp = 4.2;
            if (d > 0.2) { p.x += (dx / d) * Math.min(d, sp * dt); p.z += (dz / d) * Math.min(d, sp * dt); p.actor.setHeading(Math.atan2(dx, dz)); }
            p.actor.setPosition(o.x + p.x, o.z + p.z); p.actor.update(dt, d > 0.2 ? 1 : 0.2);
        }
        this._ball.position.set(o.x + B.x, 0.42, o.z + B.z);
        this._ball.rotation.x += B.vz * dt * 2; this._ball.rotation.z -= B.vx * dt * 2;
        if (this._watching) {
            this._watching.t -= dt;
            if (this._watching.t <= 0) {
                this._watching = null;
                const dn = game.dayNight; dn.hour = (dn.hour + 1.5) % 24; dn.apply();
                game._flash(`Fim de jogo: ${this.TEAMS[0]} ${this.score[0]} × ${this.score[1]} ${this.TEAMS[1]} — 90 minutos de arquibancada`);
            }
        }
    },

    // O E e o texto do HUD lá dentro (antes do resto da loja): o ingresso na bilheteria, assistir ao jogo da arquibancada.
    prompt(game) {
        const u = Interiors.useNear(game, 'ticket', 0.6), w = Interiors.useNear(game, 'watch', 0.1);
        if (u) return this.ticket ? '<b>INGRESSO NA MÃO</b><small>passe pelas catracas e suba para a arquibancada</small>' : `<b>E</b> comprar ingresso — ${brl(this.TICKET)}<small>as catracas liberam a arquibancada</small>`;
        if (w) return this._watching ? '<b>ASSISTINDO AO JOGO</b><small>a torcida canta, o jogo rola</small>' : `<b>E</b> assistir ao jogo<small>${this.TEAMS[0]} ${this.score[0]} × ${this.score[1]} ${this.TEAMS[1]} · passa 1h30</small>`;
        const p = game.player.position, o = Interiors.STAGE;
        if (!this.ticket && p.z < o.z + 9.4 && p.z > o.z + 7.6 && p.x > o.x + 18 && p.x < o.x + 42) return '<b>CATRACA FECHADA</b><small>compre o ingresso na bilheteria (à esquerda)</small>';
        return null;
    },
    interact(game) {
        if (Interiors.useNear(game, 'ticket', 0.6)) {
            if (this.ticket) { game._flash('Você já tem o ingresso — as catracas estão liberadas'); return true; }
            const inv = game.inventory;
            if (inv.cash < this.TICKET) { game._flash(`Ingresso: ${brl(this.TICKET)} — dinheiro insuficiente`); return true; }
            inv.cash -= this.TICKET; this.ticket = true;
            Interiors.obstacles = Interiors.obstacles.filter((s) => !s.gate);
            game._flash(`Ingresso comprado (${brl(this.TICKET)}) — as catracas liberaram`);
            return true;
        }
        if (Interiors.useNear(game, 'watch', 0.1)) {
            if (!this._watching) { this._watching = { t: 6 }; game._flash('Você senta na arquibancada e assiste ao jogo…'); }
            return true;
        }
        return false;
    },
};
