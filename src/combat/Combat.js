// ============================================================================
// Combat — armas, projéteis e dano.
//
// Armas de fogo disparam PROJÉTEIS (rastro luminoso) que andam em linha reta e param no
// primeiro alvo (pedestre, policial, jogador), carro ou prédio. Corpo a corpo (soco, chute,
// taco) acerta o alvo mais próximo no cone à frente, no frame do golpe.
//
// Toda entidade atingível implementa: position, alive, takeDamage(amount, fromPos, source).
// `source` é 'player' ou 'police' (decide quem pode ferir quem: sem fogo amigo na polícia).
// ============================================================================

const Weapons = {
    fists:   { name: 'Punhos',          melee: true },
    bat:     { name: 'Taco',            melee: true, dmg: 34, range: 2.5, cooldown: 0.55 },
    pistol:  { name: 'Pistola',         gun: true, dmg: 24, cooldown: 0.36, spread: 0.035, range: 44, speed: 74, mag: 12, pellets: 1, auto: false },
    smg:     { name: 'Submetralhadora', gun: true, dmg: 11, cooldown: 0.105, spread: 0.08, range: 38, speed: 74, mag: 30, pellets: 1, auto: true },
    shotgun: { name: 'Escopeta',        gun: true, dmg: 10, cooldown: 0.95, spread: 0.17, range: 22, speed: 64, mag: 6, pellets: 8, auto: false },
    // Fuzil automático (polícia/exército e agora também achado no chão).
    rifle:   { name: 'Fuzil',           gun: true, dmg: 14, cooldown: 0.1, spread: 0.055, range: 46, speed: 82, mag: 30, pellets: 1, auto: true, look: 'smg' },
    // Armas achadas no chão. `look` = qual arma do boneco é desenhada na mão (só há pistola/SMG/escopeta/taco no rig).
    revolver: { name: 'Revólver',       gun: true, dmg: 38, cooldown: 0.55, spread: 0.03, range: 48, speed: 80, mag: 6, pellets: 1, auto: false, look: 'pistol' },
    ak47:    { name: 'AK-47',           gun: true, dmg: 19, cooldown: 0.12, spread: 0.07, range: 46, speed: 80, mag: 30, pellets: 1, auto: true, look: 'smg' },
    knife:   { name: 'Faca',            melee: true, dmg: 24, range: 2.0, cooldown: 0.32, look: 'none' },
};

// Golpes sem arma.
const Melee = {
    punch: { dmg: 9, range: 1.9, delay: 0.19 },
    punchL: { dmg: 9, range: 1.9, delay: 0.19 },
    kick: { dmg: 14, range: 2.2, delay: 0.22 },
    swing: { dmg: 34, range: 2.6, delay: 0.27 },
};

class Combat {
    constructor(scene, game) {
        this.game = game;
        this.MAXB = 48;
        this.MAXS = 96;
        // Rastro de cada bala = 3 quads (cabeça, meio, cauda); faíscas = 1 quad cada.
        this.glow = new GlowBatch(scene, this.MAXB * 3 + this.MAXS, 'combatGlow', 'glow');
        for (let i = 0; i < this.MAXB * 3 + this.MAXS; i++) this.glow.alloc();

        this.bullets = [];
        for (let i = 0; i < this.MAXB; i++) this.bullets.push({ on: false });
        this.sparks = [];
        for (let i = 0; i < this.MAXS; i++) this.sparks.push({ on: false });
        this._targets = [];
        this.shots = { player: 0, police: 0, gang: 0 };      // contadores (HUD/testes)
    }

    // --------------------------------------------------------------- disparo
    // shooter: { x, z, angle, owner: 'player'|'police', ref }
    fire(shooter, weaponKey) {
        const W = Weapons[weaponKey];
        const n = W.pellets || 1;
        const muzzle = 1.15;
        const mx = shooter.x + Math.sin(shooter.angle) * muzzle, mz = shooter.z + Math.cos(shooter.angle) * muzzle;
        for (let k = 0; k < n; k++) {
            const b = this.bullets.find((q) => !q.on);
            if (!b) break;
            // Espalhamento: soma de 2 uniformes ≈ sino (mais tiros no centro).
            const a = shooter.angle + (Math.random() + Math.random() - 1) * W.spread * (shooter.spreadMul || 1);
            const sp = W.speed * (0.95 + Math.random() * 0.1);
            b.on = true; b.owner = shooter.owner; b.ref = shooter.ref; b.fly = !!shooter.fly;   // fly: tiro vindo do alto passa por cima dos prédios
            b.x = mx; b.z = mz; b.px = mx; b.pz = mz;
            b.vx = Math.sin(a) * sp; b.vz = Math.cos(a) * sp;
            b.dmg = W.dmg * (shooter.dmgMul || 1); b.left = W.range; b.dirx = Math.sin(a); b.dirz = Math.cos(a);
        }
        this.shots[shooter.owner]++;
        AudioFX.shot(weaponKey, shooter.x, shooter.z);
        return n;
    }

    // Mira assistida (não há mouse): puxa o ângulo para o alvo vivo mais próximo dentro de um cone.
    aimAssist(x, z, angle, range = 30, cone = 0.2) {
        let best = null, bestScore = Infinity;
        const consider = (t, reach = range) => {
            const dx = t.position.x - x, dz = t.position.z - z;
            const d = Math.hypot(dx, dz);
            if (d > reach || d < 0.5) return;
            let da = Math.atan2(dx, dz) - angle;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            if (Math.abs(da) > cone) return;
            if (!t.flying && !MapGeo.hasLineOfSight(x, z, t.position.x, t.position.z)) return;   // quem voa não é tapado por prédio
            const score = Math.abs(da) * 20 + d * 0.25;
            if (score < bestScore) { bestScore = score; best = { angle: angle + da, target: t }; }
        };
        const g = this.game;
        if (g.npcManager) for (const n of g.npcManager.npcs) if (n.alive) consider(n);
        if (g.policeManager) {
            for (const o of g.policeManager.officers) if (o.alive) consider(o);
            const h = g.policeManager.heli;
            if (h && h.alive) consider(h, 40);
        }
        if (g.gangs) for (const o of g.gangs.members) if (o.alive) consider(o);
        if (g.watch && g.watch.lookouts) for (const o of g.watch.lookouts) if (o.alive && o.actor) consider(o);
        return best ? best.angle : angle;
    }

    // ---------------------------------------------------------- corpo a corpo
    // Acerta o alvo vivo mais próximo no cone frontal (60°) até `range`. Retorna o alvo ou null.
    melee(x, z, heading, dmg, range, source = 'player') {
        const fx = Math.sin(heading), fz = Math.cos(heading);
        const g = this.game;
        let best = null, bestD = range;
        const consider = (t) => {
            const dx = t.position.x - x, dz = t.position.z - z;
            const d = Math.hypot(dx, dz);
            if (d > bestD || d < 0.01) return;
            if ((dx * fx + dz * fz) / d < 0.5) return;
            best = t; bestD = d;
        };
        if (g.npcManager) for (const n of g.npcManager.npcs) if (n.alive) consider(n);
        if (g.policeManager && source === 'player') for (const o of g.policeManager.officers) if (o.alive) consider(o);
        if (g.gangs && source === 'player') for (const o of g.gangs.members) if (o.alive) consider(o);
        if (g.watch && g.watch.lookouts && source === 'player') for (const o of g.watch.lookouts) if (o.alive && o.actor) consider(o);
        if (best) {
            best.takeDamage(dmg, { x, z }, source);
            this.spark(best.position.x, 1.2, best.position.z, [1, 0.45, 0.35]);
            AudioFX.thud(best.position.x, best.position.z);
        }
        return best;
    }

    // ------------------------------------------------------------------ efeitos
    spark(x, y, z, color = [1, 0.8, 0.4], life = 0.2) {
        const s = this.sparks.find((q) => !q.on);
        if (!s) return;
        s.on = true; s.age = 0; s.life = life; s.x = x; s.y = y; s.z = z; s.c = color;
    }

    // ------------------------------------------------------------------ frame
    _collectTargets() {
        const g = this.game, T = this._targets;
        let n = 0;
        const add = (ref, kind, r) => { const o = T[n] || (T[n] = {}); o.ref = ref; o.kind = kind; o.r = r; n++; };
        if (g.npcManager) for (const npc of g.npcManager.npcs) if (npc.alive) add(npc, 'npc', 0.55);
        if (g.policeManager) {
            for (const o of g.policeManager.officers) if (o.alive) add(o, 'officer', 0.55);
            for (const c of g.policeManager.cars) add(c, 'car', 1.5);
            const h = g.policeManager.heli;
            if (h && h.alive) add(h, 'heli', 2.3);
        }
        if (g.gangs) for (const o of g.gangs.members) if (o.alive) add(o, 'gang', 0.55);
        if (g.watch && g.watch.lookouts) for (const o of g.watch.lookouts) if (o.alive && o.actor) add(o, 'lookout', 0.55);
        if (g.vehicleManager) for (const c of g.vehicleManager.vehicles) add(c, 'car', 1.4);
        if (g.vehicleManager) for (const c of g.vehicleManager.boats) add(c, 'car', Math.max(0.9, c.halfW));
        if (g.player.alive && g.mode === 'player') add(g.player, 'player', 0.6);
        if (g.choppers) for (const c of g.choppers) if (c.alive) add(c, 'chopper', 2.6);
        T.length = n;
        return T;
    }

    update(dt) {
        const T = this._collectTargets();
        const g = this.glow;

        for (let i = 0; i < this.MAXB; i++) {
            const b = this.bullets[i];
            const base = i * 3;
            if (!b.on) { g.off(base); g.off(base + 1); g.off(base + 2); continue; }

            b.px = b.x; b.pz = b.z;
            b.x += b.vx * dt; b.z += b.vz * dt;
            const step = Math.hypot(b.vx * dt, b.vz * dt);
            b.left -= step;

            // 1) Alvos: o mais próximo ao longo do segmento (px,pz)->(x,z).
            let hit = null, hitT = 2;
            const sx = b.x - b.px, sz = b.z - b.pz, sl2 = sx * sx + sz * sz || 1e-6;
            for (const t of T) {
                if (t.ref === b.ref) continue;
                if (b.owner === 'gang' && t.kind === 'gang') continue;
                if (b.owner === 'police' && (t.kind === 'officer' || t.kind === 'heli' || (t.kind === 'car' && t.ref.role))) continue;   // sem fogo amigo
                if (b.owner === 'player' && t.kind === 'player') continue;
                const p = t.ref.position;
                const u = Math.max(0, Math.min(1, ((p.x - b.px) * sx + (p.z - b.pz) * sz) / sl2));
                const dx = b.px + sx * u - p.x, dz = b.pz + sz * u - p.z;
                if (dx * dx + dz * dz < t.r * t.r && u < hitT) { hit = t; hitT = u; }
            }
            if (hit) {
                const hx = b.px + sx * hitT, hz = b.pz + sz * hitT;
                if (hit.kind === 'car') {
                    this.spark(hx, 1.0, hz, [1, 0.9, 0.5]); AudioFX.hit(hx, hz);
                    // A lataria leva parte do dano (carros amassam, soltam fumaça e podem explodir a tiros).
                    if (hit.ref.takeDamage) hit.ref.takeDamage(b.dmg * Config.crash.bulletMul, b.owner);
                    // O carro do jogador protege, mas parte do tiro atravessa a lataria/vidro.
                    if ((b.owner === 'police' || b.owner === 'gang') && hit.ref === this.game.activeCar && this.game.mode === 'car') this.game.player.takeDamage(b.dmg * 0.4);
                }
                else {
                    hit.ref.takeDamage(b.dmg, { x: b.px, z: b.pz }, b.owner);
                    this.spark(hx, 1.2, hz, [1, 0.35, 0.3]);
                    AudioFX.hit(hx, hz);
                }
                b.on = false; g.off(base); g.off(base + 1); g.off(base + 2);
                continue;
            }

            // 2) Prédios/contêineres altos: a bala para e solta faíscas.
            let wall = false;
            const dist = Math.sqrt(sl2), n = b.fly ? 0 : Math.max(1, Math.ceil(dist / 0.8));
            for (let k = 1; k <= n && !wall; k++) {
                const x = b.px + sx * (k / n), z = b.pz + sz * (k / n);
                for (const o of CityGrid.obstaclesNear(x, z)) {
                    if (o.h > 1.6 && x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1) { wall = true; this.spark(x, 1.3, z, [1, 0.85, 0.5]); AudioFX.hit(x, z); break; }
                }
            }
            if (wall || b.left <= 0 || !MapGeo.isLand(b.x, b.z)) { b.on = false; g.off(base); g.off(base + 1); g.off(base + 2); continue; }

            // 3) Visual: cabeça brilhante + cauda em 2 pontos atrás.
            g.place(base, b.x, 1.3, b.z, 0.5);
            g.place(base + 1, b.x - b.dirx * 0.9, 1.3, b.z - b.dirz * 0.9, 0.4);
            g.place(base + 2, b.x - b.dirx * 1.8, 1.3, b.z - b.dirz * 1.8, 0.3);
            g.color(base, 1.0, 0.92, 0.55, 1);
            g.color(base + 1, 1.0, 0.8, 0.35, 0.6);
            g.color(base + 2, 1.0, 0.65, 0.2, 0.3);
        }

        // Faíscas de impacto.
        const off0 = this.MAXB * 3;
        for (let i = 0; i < this.MAXS; i++) {
            const s = this.sparks[i], id = off0 + i;
            if (!s.on) { g.off(id); continue; }
            s.age += dt;
            if (s.age >= s.life) { s.on = false; g.off(id); continue; }
            const t = s.age / s.life;
            g.place(id, s.x, s.y, s.z, 0.6 + t * 1.5);
            g.color(id, s.c[0], s.c[1], s.c[2], 1 - t);
        }
        g.flush();
    }
}
