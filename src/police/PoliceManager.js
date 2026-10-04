// ============================================================================
// PoliceManager — frota de patrulha SEMPRE presente (viaturas + policiais a pé).
// Faz a detecção (a polícia "te vê"?), alterna patrulha/perseguição conforme o
// procurado e reporta a distância da unidade mais próxima (para a prisão).
//
// ARMAS LIBERADAS: a polícia só atira quando o jogador ATIRA ou está com uma ARMA DE FOGO
// na mão à vista (por Config.police.weaponsFreeTime s, renovado a cada tiro/vista).
// Sem isso ela só persegue e prende. Quando liberadas, TODAS as unidades atiram:
//   - quem ouve o tiro (hearRadius) vira perseguidor;
//   - policiais a pé param no alcance, sacam e atiram; as viaturas atiram pelas janelas;
//   - viaturas paradas junto ao jogador a pé despejam REFORÇOS (policiais que descem).
// ============================================================================

class PoliceManager {
    // game: dá acesso ao combate (balas) e aos eventos (mortes, estrelas).
    constructor(scene, physics, nav, shadowGenerator, sprites, carLib, traffic, game) {
        this.scene = scene;
        this.physics = physics;
        this.nav = nav;
        this.shadowGenerator = shadowGenerator;
        this.sprites = sprites;
        this.carLib = carLib;
        this.carSheet = carLib.sheet('sedan');       // viaturas = sedã com a pintura da polícia
        this.traffic = traffic;
        this.game = game;
        this.cars = [];
        this.officers = [];
        this.time = 0;
        this.weaponsFreeUntil = -1;
        this._quiet = 0;             // tempo sem procurado/alerta (limpa os reforços)
        this._nextId = 100;
        this._gunAlertCd = 0;
        this._nextCarId = 50;
        this._nextBackup = 0;        // quando pode chegar a próxima viatura de reforço
        this._respawn = [];                       // instantes de reposição de viaturas de patrulha destruídas
        this._teamAt = { swat: 0, army: 0 };      // quando pode chegar o próximo veículo de cada força
        this.blocks = new Roadblocks(this);       // bloqueios de rua (5★)
        this.heli = null;            // helicóptero (3★+)
        this._heliAt = 0;            // quando ele pode aparecer
        this.heliCooldown = 0;       // tempo até vir outro depois de derrubado
        this.playerPos = new BABYLON.Vector3();   // posição/velocidade REAIS do jogador (o helicóptero usa)
        this.playerVel = new BABYLON.Vector3();
        this.level = 0;
        this.playerSeen = false;     // alguém te enxerga agora (alimenta a fuga)
        this.known = null;           // última posição que o rádio conhece (2★+)
        this._dispT = 0;
        this._tp = new BABYLON.Vector3();
        this._tv = new BABYLON.Vector3();
    }

    get combat() { return this.game.combat; }
    get events() { return this.game.policeEvents; }

    // Armas liberadas? O jogador atirou/sacou arma de fogo há pouco OU o procurado já chegou ao nível
    // em que a polícia atira (Config.police.shootFromStars). Quem atira de fato precisa te ENXERGAR.
    get weaponsFree() {
        return this.time < this.weaponsFreeUntil || this.game.wanted.level >= Config.police.shootFromStars;
    }

    // "Mente" de cada unidade: o que ela sabe do jogador (nada é onisciente).
    //   sees        te enxerga agora (dentro do raio do nível e com linha de visada)
    //   x,z,vx,vz,t última posição conhecida (vista ou ouvida) e quando
    //   dispatched  o rádio mandou esta unidade atrás de você (2★+)
    _mind(u) {
        return u.mind || (u.mind = { sees: false, x: 0, z: 0, vx: 0, vz: 0, t: -1e9, dispatched: false });
    }

    _note(m, x, z, vx, vz, t) {
        m.x = x; m.z = z; m.vx = vx; m.vz = vz; m.t = t;
    }

    // Todas as unidades num raio de `pos` OUVEM algo ali (tiro) e vão ao local.
    alertNear(pos, radius) {
        for (const u of this.units) {
            if (u.distanceTo(pos) < radius) this._note(this._mind(u), pos.x, pos.z, 0, 0, this.time);
        }
    }

    // O jogador disparou uma arma de fogo: libera as armas e TODOS que ouvem vêm.
    notifyPlayerShot(pos) {
        this.weaponsFreeUntil = this.time + Config.police.weaponsFreeTime;
        this.alertNear(pos, Config.police.hearRadius);
    }

    // O jogador está com arma de fogo na mão e foi visto: armas liberadas enquanto durar a vista.
    notifyGunDrawn(pos) {
        this.weaponsFreeUntil = Math.max(this.weaponsFreeUntil, this.time + 2.5);
        if (this._gunAlertCd <= 0) { this._gunAlertCd = 1.5; this.alertNear(pos, 70); }
    }

    // O procurado mudou de nível (o Game avisa): despacha/dispensa as forças desse nível.
    onWantedChange(level, prev, why) {
        this.level = level;
        if (level > prev && level >= 2) this._nextBackup = Math.min(this._nextBackup, this.time + 2.5);
        // Forças por nível vêm de Config.wanted.levels (helicóptero, SWAT, exército, bloqueios): a 1ª vez que o nível libera cada uma, ela é acionada.
        const L = Config.wanted.levels[level] || {}, P = Config.wanted.levels[prev] || {};
        if (L.heli && !P.heli) this._heliAt = this.time + Config.heli.delay;
        if (L.swat && !P.swat) this._teamAt.swat = this.time + 4;
        if (L.army && !P.army) this._teamAt.army = this.time + 6;
        if (L.blocks && !P.blocks) this.blocks.arm(this.time);
    }

    // ------------------------------------------------- tropa de elite e exército
    // 4★: vans da SWAT | 5★: jipes do exército. Chegam de fora da tela e despejam o esquadrão ao parar perto de você.
    static get TEAMS() {
        return {
            swat: { model: 'van', paint: 10, role: 'swat', kind: 'swat', crew: 4 },
            army: { model: 'suv', paint: 11, role: 'army', kind: 'army', crew: 4, siren: false },
        };
    }

    _manageTeams(L, pos) {
        if (!L) return;
        const T = PoliceManager.TEAMS;
        for (const role of ['swat', 'army']) {
            const have = this.cars.filter((c) => c.role === role).length;
            if (have < L[role] && this.time >= this._teamAt[role]) {
                this._teamAt[role] = this.time + 6;
                this.spawnCar(pos, T[role]);
            }
        }
    }

    // ---------------------------------------------------------------- helicóptero
    _spawnHeli(pos) {
        const a = Math.random() * Math.PI * 2, D = Config.heli.spawnDist;
        this.heli = new Helicopter(this.scene, this.carLib.heliSheet(), this, pos.x + Math.sin(a) * D, pos.z + Math.cos(a) * D);
    }

    removeHeli() {
        if (!this.heli) return;
        this.heli.dispose();
        this.heli = null;
    }

    // Chega nos níveis com helicóptero; quando a poeira baixa, vai embora e some fora da tela.
    _manageHeli(L, pos) {
        if (L && L.heli) {
            if (!this.heli && this.time >= this._heliAt && this.heliCooldown <= 0) this._spawnHeli(pos);
            else if (this.heli && this.heli.alive) this.heli.leaving = false;
        } else if (this.heli && this.heli.alive) {
            if (this._quiet > 8 || L) this.heli.leaving = true;
            const f = this.game.camera.target;
            if (this.heli.leaving && this.heli.distanceTo(f) > 140) this.removeHeli();
        }
    }

    // Volta ao estado "cidade tranquila": reforços removidos, ninguém sabe de nada, armas guardadas.
    reset() {
        this.blocks.dismantleAll();
        for (let i = this.officers.length - 1; i >= 0; i--) {
            if (this.officers[i].temp) { this.officers[i].dispose(); this.officers.splice(i, 1); }
        }
        for (let i = this.cars.length - 1; i >= 0; i--) if (this.cars[i].temp) this._removeCar(this.cars[i]);
        this.removeHeli();
        this.heliCooldown = 0;
        for (const u of this.units) u.mind = null;
        this.known = null;
        this.weaponsFreeUntil = -1;
        this.playerSeen = false;
        this._nextBackup = 0;
    }

    // Passaram-se horas (jogador preso/morto): reforços somem e a patrulha NÃO está mais onde estava — viaturas e
    // policiais a pé reaparecem em outros pontos, a pelo menos 70u de `pos` (onde o jogador acordou), em modo patrulha.
    scatter(pos) {
        this.reset();
        for (const c of this.cars) {
            if (c.temp || c.destroyed) continue;
            for (let k = 0; k < 80; k++) {
                const l = RoadNet.randomLanePoint(14, { x: pos.x, z: pos.z, rMin: 70, rMax: 170 });
                if (!l || Math.hypot(l.point.x - pos.x, l.point.z - pos.z) < 70 || !this.traffic._clear(l.point.x, l.point.z, 12)) continue;
                if (this.cars.some((o) => o !== c && Math.hypot(o.position.x - l.point.x, o.position.z - l.point.z) < 12)) continue;
                c.teleport(l.point.x, l.point.z, Math.atan2(l.d.dx, l.d.dz));
                c.route = null; c._reverseT = 0; c._stuckT = 0; c.ramming = false; c._bestDist = Infinity; c._progressT = 0; c._relocCd = 10;
                c.startRoute(l.point.x, l.point.z, l.d);
                c.fsm.setState(new PolicePatrolState(c));
                break;
            }
        }
        for (const o of this.officers) {
            if (o.free && !o.vaulting) o._exitFree();
            if (o.temp || !o.alive || o.rag || o.index < 0) continue;
            let p = null;
            for (let k = 0; k < 20 && !p; k++) { const q = this.nav.randomWalkable(); if (Math.hypot(q.x - pos.x, q.z - pos.z) >= 70) p = q; }
            if (!p) continue;
            this.nav.crowd.agentTeleport(o.index, p);
            o.transform.position.copyFrom(p);
            o.arrest = null; o.drawn = false; o.shooting = false; o.action = null;
            o.fsm.setState(new PolicePatrolState(o));
        }
    }

    // Patrulha em mundo grande: viaturas e policiais a pé que ficaram para trás (> 300 u do jogador, sem perseguir ninguém)
    // reaparecem em outro ponto perto dele (fora da tela). Cidade = muito policiamento; ilha menos; favela e campo, pouco.
    _policeDensity(x, z) {
        if (Standing.policeBanned(x, z)) return 0;                  // dentro da favela não tem polícia (só na entrada)
        const n = RoadPlan.nearestRoadPoint(x, z, 80);
        if (!n) return 0.12;
        switch (n.edge.cls) { case 'city': case 'ave': return 1; case 'isl': return 0.7; case 'bridge': return 0.6; case 'fav': return 0.25; case 'hwy': return 0.3; default: return 0.12; }
    }

    _patrolRecycle(dt) {
        this._recT = (this._recT || 0) - dt;
        if (this._recT > 0) return;
        this._recT = 1.5;
        const f = this.game.camera.target, far2 = 300 * 300;
        const ring = { x: f.x, z: f.z, rMin: 85, rMax: 170 };
        for (const c of this.cars) {
            if (c.temp || c.destroyed || c.role === 'block' || c.fsm.name !== 'PATROL') continue;
            const dx = c.position.x - f.x, dz = c.position.z - f.z;
            if (dx * dx + dz * dz < far2 && !(dx * dx + dz * dz > 3600 && Standing.policeBanned(c.position.x, c.position.z))) continue;      // (ou está dentro da favela, longe da tela: sai)
            for (let k = 0; k < 30; k++) {
                const l = RoadNet.randomLanePoint(14, ring);
                if (!l || !this.traffic._clear(l.point.x, l.point.z, 12) || Math.random() > this._policeDensity(l.point.x, l.point.z)) continue;
                c.teleport(l.point.x, l.point.z, Math.atan2(l.d.dx, l.d.dz));
                c.route = null; c._reverseT = 0; c._stuckT = 0; c.ramming = false; c._bestDist = Infinity; c._progressT = 0; c._relocCd = 10;
                c.startRoute(l.point.x, l.point.z, l.d);
                return;
            }
        }
        for (let i = this.officers.length - 1; i >= 0; i--) {              // reforço que ficou dentro da favela, fora da tela: some
            const o = this.officers[i];
            if (o.temp && !o.guard && !o.rag && o.fsm.name !== 'CHASE' && Standing.policeBanned(o.position.x, o.position.z) && Math.hypot(o.position.x - f.x, o.position.z - f.z) > 60) { o.dispose(); this.officers.splice(i, 1); }
        }
        for (const o of this.officers) {
            if (o.temp || !o.alive || o.rag || o.index < 0 || o.free || o.guard || o.fsm.name === 'CHASE') continue;
            const dx = o.position.x - f.x, dz = o.position.z - f.z;
            if (dx * dx + dz * dz < far2 && !(dx * dx + dz * dz > 3600 && Standing.policeBanned(o.position.x, o.position.z))) continue;
            for (let k = 0; k < 20; k++) {
                const p = this.nav.randomWalkable(85, 230);
                if (Math.random() > this._policeDensity(p.x, p.z)) continue;
                this.nav.crowd.agentTeleport(o.index, p);
                o.transform.position.copyFrom(p);
                return;
            }
        }
    }

    // ----------------------------------------------------------------- reforços
    _removeCar(c) {
        const i = this.cars.indexOf(c);
        if (i >= 0) this.cars.splice(i, 1);
        this.game.carLights.release(c);
        c.dispose(this.shadowGenerator);
        if (c.role === 'block') this.blocks.forgetCar(c);        // sem as viaturas, a rua reabre
    }

    // Viatura de bloqueio de rua: corpo ESTÁTICO (imóvel até para o seu carro), de lado, giroflex ligado.
    makeBlockCar(x, z, heading) {
        const car = new PoliceCar(this.scene, this.physics, { x, z }, this._nextCarId++, this.carLib.sheet('sedan'), this.traffic, heading,
            { paint: 6, role: 'block', temp: true });
        car.manager = this;
        car.phys.setMotionType(BABYLON.PhysicsMotionType.STATIC);
        if (this.shadowGenerator) this.shadowGenerator.addShadowCaster(car.body);
        this.cars.push(car);
        return car;
    }

    // Guarda de bloqueio: combatente que fica no posto (atira se te vir ao alcance, não persegue).
    makeGuard(x, z, kind) {
        if (this.officers.length >= Config.police.maxOfficers) return null;
        const pos = this.nav.closestPoint(new BABYLON.Vector3(x, 0, z));
        const o = new PoliceOfficer(this.scene, this.nav, pos, this._nextId++, this.sprites, this, true, kind);
        o.guard = { x: pos.x, z: pos.z };
        this.officers.push(o);
        return o;
    }

    // Viatura de reforço: nasce numa faixa FORA da tela (75–115u de `pos`), já sabendo para onde ir.
    // opts: { model, paint, role, siren } — por padrão, uma viatura comum.
    spawnCar(pos, opts = {}) {
        const { model = 'sedan', paint = 6, role = 'patrol', siren = true } = opts;
        for (let t = 0; t < 80; t++) {
            const l = RoadNet.randomLanePoint(14, { x: pos.x, z: pos.z, rMin: 75, rMax: 115 });
            if (!l) continue;
            const d = Math.hypot(l.point.x - pos.x, l.point.z - pos.z);
            if (d < 75 || d > 115) continue;
            if (!this.traffic._clear(l.point.x, l.point.z, 12) || Standing.policeBanned(l.point.x, l.point.z)) continue;
            if (this.cars.some((c) => Math.hypot(c.position.x - l.point.x, c.position.z - l.point.z) < 12)) continue;
            const car = new PoliceCar(this.scene, this.physics, l.point, this._nextCarId++, this.carLib.sheet(model), this.traffic,
                Math.atan2(l.d.dx, l.d.dz), { paint, role, siren, temp: true });
            car.manager = this;
            car.team = opts.kind ? { kind: opts.kind, crew: opts.crew } : null;     // quem desce do veículo
            car.crewLeft = opts.crew || 0;
            car.resupplyT = 0;
            car.startRoute(l.point.x, l.point.z, l.d);
            if (this.shadowGenerator) this.shadowGenerator.addShadowCaster(car.body);
            this.cars.push(car);
            const m = this._mind(car);
            m.dispatched = true;
            if (this.known) { const k = this.known; this._note(m, k.x, k.z, k.vx, k.vz, k.t); }
            return car;
        }
        return null;
    }

    // Quem desce do carro já chega sabendo o que o carro sabia.
    _inherit(off, car) {
        const cm = this._mind(car), m = this._mind(off);
        this._note(m, cm.x, cm.z, cm.vx, cm.vz, cm.t);
        m.dispatched = true;
    }

    // Reforços que cumpriram o papel somem quando a poeira baixa — mas só fora da tela (ou muito depois).
    _cleanup() {
        if (this._quiet <= 20) return;
        const f = this.game.camera.target, force = this._quiet > 70;
        const away = (u) => Math.hypot(u.position.x - f.x, u.position.z - f.z) > 75;
        for (let i = this.officers.length - 1; i >= 0; i--) {
            const o = this.officers[i];
            if (o.temp && (force || away(o))) { o.dispose(); this.officers.splice(i, 1); }
        }
        for (let i = this.cars.length - 1; i >= 0; i--) {
            const c = this.cars[i];
            if (c.temp && (force || away(c))) this._removeCar(c);
        }
    }

    spawn() {
        this.carLib.heliSheet();            // assa o helicóptero já na carga (evita engasgo quando ele chega)

        // Viaturas de patrulha (física) — nas ruas.
        for (let i = 0; i < Config.police.patrolCars; i++) this._spawnPatrolCar(i);

        // Policiais a pé (NavMesh) — nas calçadas.
        for (let i = 0; i < Config.police.patrolOfficers; i++) {
            let pos = this.nav.randomWalkable();
            for (let k = 0; k < 10 && Standing.policeBanned(pos.x, pos.z); k++) pos = this.nav.randomWalkable();
            this.officers.push(new PoliceOfficer(this.scene, this.nav, pos, i, this.sprites, this));
        }
    }

    // Viatura de patrulha (circula pelas faixas). avoid: { x, z, r } = não nascer perto desse ponto (fora da tela).
    _spawnPatrolCar(id, avoid = null) {
        let lane = null;
        for (let t = 0; t < 60 && !lane; t++) {
            const f = this.game ? this.game.camera.target : { x: 0, z: 0 };
            const c = RoadNet.randomLanePoint(14, { x: f.x, z: f.z, rMin: 60, rMax: 170 });
            if (!c || !this.traffic._clear(c.point.x, c.point.z, 12) || Standing.policeBanned(c.point.x, c.point.z)) continue;
            if (avoid && Math.hypot(c.point.x - avoid.x, c.point.z - avoid.z) < avoid.r) continue;
            lane = c;
        }
        if (!lane) return null;
        const car = new PoliceCar(this.scene, this.physics, lane.point, id, this.carSheet, this.traffic, Math.atan2(lane.d.dx, lane.d.dz));
        car.manager = this;
        car.startRoute(lane.point.x, lane.point.z, lane.d);
        if (this.shadowGenerator) this.shadowGenerator.addShadowCaster(car.body);
        this.cars.push(car);
        return car;
    }

    // Carcaça de viatura que cumpriu o papel (fora da tela): some; a de patrulha é reposta mais tarde, longe do jogador.
    // (Carcaças de bloqueio de rua ficam: continuam fechando a pista.)
    removeWreck(car) {
        if (car.role === 'block') return;
        const patrol = car.role === 'patrol' && !car.temp;
        this._removeCar(car);
        if (patrol) this._respawn.push(this.time + 35);
    }

    // Unidades em campo (policiais mortos ficam de fora).
    get units() {
        return [...this.cars.filter((c) => !c.destroyed), ...this.officers.filter((o) => o.alive)];
    }

    // Distância da unidade mais próxima (Infinity se não há nenhuma).
    nearestDist(pos) {
        let best = Infinity;
        for (const u of this.units) best = Math.min(best, u.distanceTo(pos));
        return best;
    }

    // Decide quem vem atrás de você (2★+, via rádio): policiais a pé dentro do raio do nível, em torno
    // da última posição conhecida, e as `cars` viaturas mais próximas.
    _dispatch(L, pos) {
        if (!L || !L.radio) { for (const u of this.units) this._mind(u).dispatched = false; return; }
        const k = this.known || { x: pos.x, z: pos.z };
        for (const o of this.officers) {
            if (!o.alive) continue;
            this._mind(o).dispatched = Math.hypot(o.position.x - k.x, o.position.z - k.z) < L.dispatchR;
        }
        const d2 = (c) => (c.position.x - k.x) ** 2 + (c.position.z - k.z) ** 2;
        const cars = this.cars.filter((c) => c.role === 'patrol' && !c.destroyed).sort((a, b) => d2(a) - d2(b));
        cars.forEach((c, i) => { this._mind(c).dispatched = i < L.cars; });

        // Faltam viaturas por perto? Manda vir mais uma (de fora da tela), a cada poucos segundos.
        const close = cars.filter((c) => c.mind.dispatched && d2(c) < 170 * 170).length;
        if (close < L.cars && this.time >= this._nextBackup && cars.filter((c) => c.temp).length < 6) {
            this._nextBackup = this.time + 3.5;
            this.spawnCar(pos);
        }
    }

    // pos/vel: posição e velocidade REAIS do jogador | level: estrelas atuais.
    // Cada unidade só sabe o que viu (dentro do raio do nível e com linha de visada) ou ouviu; com rádio (2★+)
    // quem viu avisa os despachados. `playerSeen` diz se alguém te enxerga agora (alimenta a fuga).
    update(dt, pos, vel, level) {
        this.time += dt;
        this._gunAlertCd -= dt;
        this.heliCooldown -= dt;
        this.level = level;
        this.playerPos.copyFrom(pos);
        this.playerVel.copyFrom(vel);
        const L = level > 0 ? Config.wanted.levels[level] : null;
        const cover = Standing.cover(pos.x, pos.z);                                       // moradores acobertam (moral alta) ou delatam (baixa) dentro da favela
        if (cover.state !== this._coverState) { this._coverState = cover.state; if (cover.state && L) this.game._flash(cover.state === 'hide' ? 'Os moradores estão te acobertando: a polícia perde seu rastro' : 'Os moradores estão te delatando para a polícia!'); }
        const sk = this.game && this.game.skills, R = (L ? L.sight : Config.police.sightRange) * (Weather.cur ? Weather.cur.sightMul : 1) * cover.sight * (sk ? sk.policeMul * (1 - (SkillTree.m.sight || 0)) : 1) * (this.game.empire ? this.game.empire.policeSightMul(pos.x, pos.z) : 1);      // alerta tático, delegado aliado, domínio, estação      // notoriedade vê mais longe; Discreto, mais perto       // chuva/tempestade: enxergam menos longe
        const memory = (L ? L.lose + 3 : Config.police.hearMemory) * cover.mem;

        // 1) Percepção: raio do nível + linha de visada (esconder-se atrás de prédios funciona).
        //    O helicóptero enxerga POR CIMA dos prédios (só o alcance conta).
        let seen = false;
        const heli = this.heli;
        const hide = !!(this.game.hiding && !this.game.hiding.seen);   // escondido sem ter sido visto entrando: ninguém te enxerga
        if (heli) { heli.update(dt); if (heli.sees && !hide) seen = true; }       // (ao cair, ele se remove sozinho)
        const units = this.units;
        for (const u of units) {
            const m = this._mind(u), p = u.position;
            m.sees = !hide && Math.hypot(p.x - pos.x, p.z - pos.z) < R && MapGeo.hasLineOfSight(p.x, p.z, pos.x, pos.z);
            if (m.sees) {
                seen = true;
                if (L) this._note(m, pos.x, pos.z, vel.x, vel.z, this.time);     // sem ★ ver não faz ninguém te perseguir
            }
        }
        this.playerSeen = seen;

        // 2) Rádio e despacho.
        if (!L) this.known = null;
        else if (L.radio && seen) this.known = { x: pos.x, z: pos.z, vx: vel.x, vz: vel.z, t: this.time };
        if (this._respawn.length && this.time >= this._respawn[0]) {
            const f = this.game.camera.target;
            if (this._spawnPatrolCar(this._nextCarId++, { x: f.x, z: f.z, r: 90 })) this._respawn.shift();
            else this._respawn[0] = this.time + 5;
        }
        this._patrolRecycle(dt);
        this._dispT -= dt;
        if (this._dispT <= 0) {
            this._dispT = 0.5;
            this._dispatch(L, pos); this._manageHeli(L, pos); this._manageTeams(L, pos);
            this.blocks.update(L, pos, vel);
        }

        // 3) Cada unidade age conforme o que SABE.
        for (const u of units) {
            if (u.rag) { u.update(dt); continue; }          // voando/caído (atropelado): o ragdoll comanda
            const m = u.mind;
            if (L && L.radio && m.dispatched && this.known && this.known.t > m.t) {
                const k = this.known; this._note(m, k.x, k.z, k.vx, k.vz, k.t);
            }
            const inFav = Standing.policeBanned(u.position.x, u.position.z);
            if (inFav) m.t = -1e9;                          // quem está dentro da favela perde o rastro e volta para a entrada
            const fresh = this.time - m.t < memory;
            const recent = this.time - m.t < 0.6;           // velocidade só vale se a visão é recente
            this._tp.set(m.x, 0, m.z);
            if (Standing.policeBanned(m.x, m.z)) { const e = Standing.clampToEntrance(m.x, m.z); this._tp.set(e.x, 0, e.z); }     // perseguição para na entrada da favela
            this._tv.set(recent ? m.vx : 0, 0, recent ? m.vz : 0);
            u.setTarget(this._tp, this._tv);
            u.setAlert(!inFav && (m.sees && !!L || fresh));
            if (u.op && this.game.op) this.game.op.steer(u);       // operação na favela: confronta os traficantes
            // Zonas (core/Spatial.js): patrulha calma fora da tela "dorme" (a cada 2 quadros perto da tela, a cada 5 longe, com o dt somado).
            // Quem te vê, persegue ou está numa operação roda todo quadro.
            const tier = (m.sees || fresh || u.op) ? 0 : Zones.tier(u.position.x, u.position.z);
            if (tier > 0) {
                u._lodDt = (u._lodDt || 0) + dt;
                if (!Zones.every(u.id, tier, 2, 5)) continue;
                u.update(Math.min(u._lodDt, 0.2)); u._lodDt = 0;
                continue;
            }
            if (u._lodDt) { u.update(u._lodDt + dt); u._lodDt = 0; continue; }
            u.update(dt);
        }
        // Mortos continuam "vivendo" só para o corpo aparecer e depois reaparecer.
        for (const o of this.officers) if (!o.alive) o.update(dt);
        // Viaturas pegando fogo/carcaças: ficam paradas (e o sprite acompanha amassado/queimado).
        for (const c of this.cars) if (c.destroyed) c.update(dt);

        this._reinforce(dt, pos);

        // Sirene só enquanto alguma viatura persegue (volume pela distância ao jogador).
        let near = Infinity;
        for (const c of this.cars) if (c.sirenOn) near = Math.min(near, c.distanceTo(pos));
        AudioFX.siren(near < Infinity, near);
        AudioFX.heli(!!(this.heli && this.heli.alive), this.heli ? this.heli.distanceTo(pos) : 999);
    }

    // Viatura parada junto ao jogador a pé durante a perseguição: um policial desce.
    // Quando tudo acalma por ~20s, os reforços somem.
    _reinforce(dt, targetPos) {
        const active = this.game.wanted.level > 0 || this.weaponsFree || this.cars.some((c) => c.sirenOn && c.role !== 'block') || !!(this.game.op && this.game.op.active);
        this._quiet = active ? 0 : this._quiet + dt;
        this._cleanup();
        if (!active) return;

        for (const car of this.cars) {
            car.dismountCd -= dt;
            const team = car.team;
            // Esquadrão (van da SWAT/jipe do exército): se todos caíram e a van segue parada, chega outro esquadrão.
            if (team && car.crewLeft <= 0) {
                const alive = this.officers.some((o) => o.alive && o.kind === team.kind && o.distanceTo(car.position) < 60);
                car.resupplyT = alive ? 0 : car.resupplyT + dt;
                if (car.resupplyT > 25) { car.crewLeft = team.crew; car.resupplyT = 0; }
            }
            if (!car.stoppedNear || car.dismountCd > 0 || this.officers.length >= Config.police.maxOfficers) continue;
            if (team && car.crewLeft <= 0) continue;
            const f = car.body.getDirection(BABYLON.Axis.Z);
            const p = car.position;
            // Desce pela porta do lado direito do carro (o esquadrão desce um por um, de lado a lado).
            const side = team ? (car.crewLeft % 2 ? 2.6 : -2.6) : 2.6;
            const pos = this.nav.closestPoint(new BABYLON.Vector3(p.x + f.z * side, 0, p.z - f.x * side));
            const off = new PoliceOfficer(this.scene, this.nav, pos, this._nextId++, this.sprites, this, true, team ? team.kind : 'cop');
            this._inherit(off, car);
            this.officers.push(off);
            if (team) { car.crewLeft--; car.dismountCd = 0.45; } else car.dismountCd = 9;
        }
    }
}
