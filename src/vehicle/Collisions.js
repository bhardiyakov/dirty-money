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
    }

    update(dt) {
        const g = this.g;
        if (!g.carDamage) return;
        const C = Config.crash;
        const pl = g.player;
        const onFoot = g.mode !== 'car' && pl.alive;
        const npcs = g.npcManager ? g.npcManager.npcs : [];
        const offs = g.policeManager ? g.policeManager.officers : [];
        if (pl._runCd > 0) pl._runCd -= dt;

        for (const car of g.carDamage.allCars()) {
            const c = car.position, v = car.velocity;
            const sp = Math.hypot(v.x, v.z);
            const d = car.body.getDirection(BABYLON.Axis.Z);
            const dl = Math.hypot(d.x, d.z) || 1, fx = d.x / dl, fz = d.z / dl, rx = fz, rz = -fx;
            const hl = car.halfLen - 0.15, hw = car.halfW - 0.05;          // casco real do corpo (menos a folga)
            const reach = hl + 2.5, reach2 = reach * reach;
            const ctx = { car, c, v, sp, fx, fz, rx, rz, hl, hw, reach2 };

            if (onFoot) this._player(ctx, pl);
            if (sp > C.runOverSpeed) {
                for (const n of npcs) if (n.alive) this._victim(ctx, n, 0.4, 'npc');
                for (const o of offs) if (o.alive) this._victim(ctx, o, 0.45, 'officer');
                if (g.gangs) for (const o of g.gangs.members) if (o.alive) this._victim(ctx, o, 0.45, 'gang');
            }
        }
    }

    // Posição de `e` no sistema do carro (lf = ao longo do eixo, lr = lateral) ou null se fora do casco (+ raio r).
    _local(ctx, e, r) {
        const p = e.position, dx = p.x - ctx.c.x, dz = p.z - ctx.c.z;
        if (dx * dx + dz * dz > ctx.reach2) return null;
        const lf = dx * ctx.fx + dz * ctx.fz, lr = dx * ctx.rx + dz * ctx.rz;
        if (Math.abs(lf) >= ctx.hl + r || Math.abs(lr) >= ctx.hw + r) return null;
        return { dx, dz, lf, lr };
    }

    // Atropelamento conforme a velocidade do carro e o ângulo do impacto: { dmg, power, dx, dz } (dmg 0 = nada).
    // `power` é a velocidade efetiva (m/s) — comanda a força do ragdoll — e (dx, dz) a direção do arremesso:
    // principalmente a do carro, com um pouco de afastamento do casco.
    _runOver(ctx, L) {
        const l = Math.hypot(L.dx, L.dz) || 1;
        const nx = L.dx / l, nz = L.dz / l;
        const cosT = (ctx.v.x * nx + ctx.v.z * nz) / ctx.sp;
        const eff = ctx.sp * (0.35 + 0.65 * Math.max(0, cosT));
        const vx = ctx.v.x / ctx.sp, vz = ctx.v.z / ctx.sp;
        return {
            dmg: Math.max(0, (eff - Config.crash.runOverSpeed) * Config.crash.runOverDmg),
            power: eff, dx: vx * 0.75 + nx * 0.25, dz: vz * 0.75 + nz * 0.25,
        };
    }

    // Jogador a pé: sólido (empurrado para fora do casco) e, se o carro anda, atropelado.
    _player(ctx, pl) {
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
                // O impacto dita o ragdoll: fraco cambaleia e cai; médio é jogado; forte voa capotando.
                if (R.power >= Config.ragdoll.minPower) pl.ragdoll({ dx: R.dx, dz: R.dz, power: R.power, kind: 'hit', lethal });
                this._impactFx(pl.position, 0.3 + Math.min(0.5, R.power * 0.03));
                ctx.car.takeDamage(1 + R.dmg * 0.02, 'env');
            }
        }

        // Empurra para fora pelo lado de menor penetração.
        const penF = ctx.hl + r - Math.abs(L.lf), penR = ctx.hw + r - Math.abs(L.lr);
        const p = pl.position;
        if (penF < penR) { const s = Math.sign(L.lf) || 1, m = (penF + 0.02) * s; p.x += ctx.fx * m; p.z += ctx.fz * m; }
        else { const s = Math.sign(L.lr) || 1, m = (penR + 0.02) * s; p.x += ctx.rx * m; p.z += ctx.rz * m; }
        MapGeo.resolveCircle(p, r);                                                  // sem empurrar para dentro de prédio
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
        e.takeDamage(R.dmg, from, src, { dx: R.dx, dz: R.dz, power: R.power });     // com `impact`: arremessado (ragdoll)
        this._impactFx(e.position, 0.2);
        car.takeDamage(1 + R.dmg * 0.02, 'env');

        if (byPlayer) {
            // Sobreviveu: ainda é crime (matar já é reportado pelo evento de morte do NPC).
            if (kind === 'npc' && e.alive) { g.wanted.reportCrime(); if (g.npcManager) g.npcManager.alertViolence(e.position, 18); }
            if (kind === 'npc' && !e.alive) { /* onKill já reportou e alertou */ }
        }
    }

    _impactFx(p, shake) {
        const g = this.g;
        g.combat.spark(p.x, 1.1, p.z, [1, 0.3, 0.25]);
        AudioFX.thud(p.x, p.z);
        const f = g.camera.target;
        if (Math.hypot(p.x - f.x, p.z - f.z) < 30) g.camera.shake(shake);
    }
}
