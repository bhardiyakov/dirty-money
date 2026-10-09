// ============================================================================
// Collisions — personagens × carros.
//
//   - O JOGADOR a pé não atravessa carros: é empurrado para fora do casco (retângulo do corpo do carro).
//   - ATROPELAMENTO: carro em movimento (> Config.crash.runOverSpeed) que toca alguém machuca:
//       dano = (velocidade efetiva − limite) × runOverDmg; a velocidade efetiva pesa mais de frente
//       (de lado, só um raspão). 8 m/s ≈ 38 de dano; 17 m/s ≈ 105 (mata o jogador, pedestre e policial comum).
//     Vale para o jogador a pé (leva dano e é arremessado), pedestres e policiais (a pé).
//   - Crime: atropelar com o carro do JOGADOR é crime dele (procurado, pedestres fogem, policial ferido sobe ★).
// Pedestres e policiais são agentes do NavMesh (sem física): só levam o atropelamento, não bloqueiam o carro.
// ============================================================================

class Collisions {
    constructor(game) {
        this.g = game;
        // Objetos reaproveitados (antes: um contexto, um vetor de direção e dois resultados novos por carro por quadro).
        this._ctx = { car: null, c: null, v: new BABYLON.Vector3(), sp: 0, fx: 0, fz: 0, rx: 0, rz: 0, hl: 0, hw: 0, reach2: 0 };
        this._dir = new BABYLON.Vector3();
        this._L = { dx: 0, dz: 0, lf: 0, lr: 0 };
        this._R = { dmg: 0, power: 0, dx: 0, dz: 0 };
        this._grid = new SpatialHash(8);
        this._q = [];
    }

    update(dt) {
        const g = this.g;
        if (!g.carDamage) return;
        const C = Config.crash;
        const pl = g.player;
        const onFoot = g.mode !== 'car' && pl.alive;
        const npcs = g.npcManager ? g.npcManager.npcs : [];
        const offs = g.policeManager ? g.policeManager.officers : [];
        const gang = g.gangs ? g.gangs.members : [];
        if (pl._runCd > 0) pl._runCd -= dt;
        const ctx = this._ctx;
        let built = false;

        for (const car of g.carDamage.allCars()) {
            const c = car.position;
            if (!Zones.near(c.x, c.z, 40)) continue;                        // longe da tela: ninguém vê o atropelamento nem o empurrão
            const v = ctx.v.copyFrom(car.velocity);
            const sp = Math.sqrt(v.x * v.x + v.z * v.z);
            const moving = sp > C.runOverSpeed;
            const hl = car.halfLen - 0.15, hw = car.halfW - 0.05;          // casco real do corpo (menos a folga)
            const reach = hl + 2.5, reach2 = reach * reach;
            if (!moving) {                                                  // parado: só o jogador a pé (empurrão) — e só se estiver perto
                if (!onFoot) continue;
                const dx = pl.position.x - c.x, dz = pl.position.z - c.z;
                if (dx * dx + dz * dz > reach2) continue;
            }
            const d = this._dir;
            car.fwdToRef(d);                                           // (do quaternião: sem matriz de mundo)
            const dl = Math.sqrt(d.x * d.x + d.z * d.z) || 1, fx = d.x / dl, fz = d.z / dl;
            ctx.car = car; ctx.c = c; ctx.sp = sp; ctx.fx = fx; ctx.fz = fz; ctx.rx = fz; ctx.rz = -fx;
            ctx.hl = hl; ctx.hw = hw; ctx.reach2 = reach2;

            const lv = Vehicle.levelOf(car);                                // (viaduto / ponte: só pega quem está no MESMO nível)
            ctx.lv = lv;
            if (onFoot && Math.abs(Vehicle.levelOf(pl) - lv) < 1.5) this._player(ctx, pl);
            if (moving) {
                // Quem pode ser atropelado fica numa grade (montada uma vez por quadro, só se algum carro anda): cada carro consulta só a
                // vizinhança em vez de testar todos os pedestres, policiais e traficantes do mundo (antes ~7 mil testes por quadro).
                if (!built) { built = true; this._fill(npcs, offs, gang); }
                for (const e of this._grid.query(c.x, c.z, reach, this._q)) {
                    if (e.alive && Math.abs(Vehicle.levelOf(e) - lv) < 1.5) this._victim(ctx, e, e._ck ? 0.45 : 0.4, Collisions.KINDS[e._ck]);
                }
            }
        }
        ctx.car = null; ctx.c = null;
    }

    _fill(npcs, offs, gang) {
        const G = this._grid;
        G.clear();
        for (const n of npcs) if (n.alive) { n._ck = 0; G.insert(n, n.position.x, n.position.z); }
        for (const o of offs) if (o.alive) { o._ck = 1; G.insert(o, o.position.x, o.position.z); }
        for (const o of gang) if (o.alive) { o._ck = 2; G.insert(o, o.position.x, o.position.z); }
    }

    // Posição de `e` no sistema do carro (lf = ao longo do eixo, lr = lateral) ou null se fora do casco (+ raio r).
    // (Devolve sempre o mesmo objeto: use antes da próxima chamada.)
    _local(ctx, e, r) {
        const p = e.position, dx = p.x - ctx.c.x, dz = p.z - ctx.c.z;
        if (dx * dx + dz * dz > ctx.reach2) return null;
        const lf = dx * ctx.fx + dz * ctx.fz, lr = dx * ctx.rx + dz * ctx.rz;
        if (Math.abs(lf) >= ctx.hl + r || Math.abs(lr) >= ctx.hw + r) return null;
        const L = this._L;
        L.dx = dx; L.dz = dz; L.lf = lf; L.lr = lr;
        return L;
    }

    // Atropelamento conforme a velocidade do carro e o ângulo do impacto: { dmg, power, dx, dz } (dmg 0 = nada).
    // `power` é a velocidade efetiva (m/s) — comanda a força do ragdoll — e (dx, dz) a direção do arremesso:
    // principalmente a do carro, com um pouco de afastamento do casco. (Devolve sempre o mesmo objeto.)
    _runOver(ctx, L) {
        const l = Math.sqrt(L.dx * L.dx + L.dz * L.dz) || 1;
        const nx = L.dx / l, nz = L.dz / l;
        const cosT = (ctx.v.x * nx + ctx.v.z * nz) / ctx.sp;
        const eff = ctx.sp * (0.35 + 0.65 * Math.max(0, cosT));
        const vx = ctx.v.x / ctx.sp, vz = ctx.v.z / ctx.sp;
        const R = this._R;
        R.dmg = Math.max(0, (eff - Config.crash.runOverSpeed) * Config.crash.runOverDmg);
        R.power = eff; R.dx = vx * 0.75 + nx * 0.25; R.dz = vz * 0.75 + nz * 0.25;
        return R;
    }

    // Jogador a pé: sólido (empurrado para fora do casco) e, se o carro anda, atropelado.
    _player(ctx, pl) {
        if (pl.boarding === ctx.car && (pl.action || pl.frozen)) return;      // subindo nele / entrando por ele: o corpo passa por dentro do casco
        const r = Config.player.radius;
        const L = this._local(ctx, pl, r);
        if (!L) return;
        const g = this.g;

        if (ctx.sp > Config.crash.runOverSpeed && !(pl._runCd > 0) && !pl.rag) {
            const R = this._runOver(ctx, L);
            if (R.dmg > 0) {
                pl._runCd = 0.6;
                const lethal = pl.hp - R.dmg <= 0;
                pl.takeDamage(R.dmg, true);
                if (R.dmg >= 15 && typeof Blood !== 'undefined') { Blood.hit(pl.position.x, pl.position.z, R.dx, R.dz, R.dmg * 0.6, pl); Blood.wound(pl, R.dmg * 0.5, false); }
                if (typeof Blood !== 'undefined') Blood.beat(pl, R.dmg, 1);                   // atropelado: SUJO (e ralado)
                // O impacto dita o ragdoll: fraco cambaleia e cai; médio é jogado; forte voa capotando.
                if (R.power >= Config.ragdoll.minPower) pl.ragdoll({ dx: R.dx, dz: R.dz, power: R.power, kind: 'hit', lethal });
                this._impactFx(pl.position, 0.3 + Math.min(0.5, R.power * 0.03));
                ctx.car.takeDamage(1 + R.dmg * 0.02, 'env');
                this._riderFalls(ctx, R);
            }
        }

        // Empurra para fora pelo lado de menor penetração.
        const penF = ctx.hl + r - Math.abs(L.lf), penR = ctx.hw + r - Math.abs(L.lr);
        const p = pl.position;
        if (penF < penR) { const s = Math.sign(L.lf) || 1, m = (penF + 0.02) * s; p.x += ctx.fx * m; p.z += ctx.fz * m; }
        else { const s = Math.sign(L.lr) || 1, m = (penR + 0.02) * s; p.x += ctx.rx * m; p.z += ctx.rz * m; }
        MapGeo.resolveCircle(p, r, false, true);                                              // sem empurrar para dentro de prédio
        pl._syncSprite();
    }

    // Pedestre/policial atropelado por carro em movimento.
    _victim(ctx, e, r, kind) {
        const now = this.g.policeManager ? this.g.policeManager.time : performance.now() / 1000;
        if (e._runUntil && now < e._runUntil) return;
        if (e.rag) return;                                   // já voando/caído: não toma outro atropelamento
        const L = this._local(ctx, e, r);
        if (!L) return;
        const R = this._runOver(ctx, L);
        if (R.dmg <= 0) return;
        e._runUntil = now + 0.7;

        const g = this.g;
        const car = ctx.car, byPlayer = car.controlled;
        const src = byPlayer ? 'player' : (car.role ? 'police' : 'env');
        const from = { x: ctx.c.x, z: ctx.c.z };
        e.takeDamage(R.dmg, from, src, { dx: R.dx, dz: R.dz, power: R.power });     // com `impact`: arremessado (ragdoll) (cópia: R é reaproveitado)
        if (R.dmg >= 15 && typeof Blood !== 'undefined') { Blood.hit(e.position.x, e.position.z, R.dx, R.dz, R.dmg * 0.6, e); Blood.wound(e, R.dmg * 0.5, false); }   // batida forte: sangue
        if (typeof Blood !== 'undefined') Blood.beat(e, R.dmg, 1);                                             // atropelado: ralado e roxo (ESPANCADO) e SUJO
        this._impactFx(e.position, 0.2);
        car.takeDamage(1 + R.dmg * 0.02, 'env');
        this._riderFalls(ctx, R);

        if (byPlayer) {
            // Sobreviveu: ainda é crime (matar já é reportado pelo evento de morte do NPC).
            if (kind === 'npc' && e.alive) { g.wanted.reportCrime(); if (g.npcManager) g.npcManager.alertViolence(e.position, 18); }
            if (kind === 'npc' && !e.alive) { /* onKill já reportou e alertou */ }
        }
    }

    // Moto/bicicleta do trânsito (entregador, mototaxista, ciclista) que pega alguém em cheio também vai ao chão: o piloto voa por cima
    // (e depois volta para a moto — Game._onThrow, kind 'crash'); batida forte tomba a moto.
    _riderFalls(ctx, R) {
        const b = ctx.car;
        if (!b.isBike || b.controlled || b.riderVariant == null || R.power < 4) return;
        b.throwRider(ctx.fx, ctx.fz, R.power * 0.75, 'crash');
        if (R.power > 6) b.fall();
    }

    _impactFx(p, shake) {
        const g = this.g;
        g.combat.spark(p.x, 1.1, p.z, [1, 0.3, 0.25]);
        AudioFX.thud(p.x, p.z);
        const f = g.camera.target;
        const dx = p.x - f.x, dz = p.z - f.z;
        if (dx * dx + dz * dz < 900) g.camera.shake(shake);
    }
}
Collisions.KINDS = ['npc', 'officer', 'gang'];
