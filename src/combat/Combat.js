// ============================================================================
// Combat — armas, projéteis e dano.
//
// Armas de fogo disparam PROJÉTEIS (rastro luminoso) que andam em linha reta e param no
// primeiro alvo (pedestre, policial, jogador), carro ou prédio. Corpo a corpo (soco, chute, taco,
// cassetete) é uma colisão casada com a animação: ver Melee e Combat.strike.
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
    knife:   { name: 'Faca',            melee: true, dmg: 24, range: 2.0, cooldown: 0.32, look: 'knife' },     // (na mão: o desenho da faca; golpe: a facada — Melee.stab)
    // Armas novas (desenho no atlas protagonista_armas). silenced: o tiro só é percebido bem de perto (não chama a polícia de longe).
    // rocket: dispara um foguete (combat/Rockets.js) — dmg = acerto direto (o helicóptero tem Config.heli.hp: um acerto derruba).
    // heavy: pesada — anda mais devagar com ela na mão e não dá para correr no talo (Player). spinUp: a minigun gira os canos antes
    // de atirar (s). reload: tempo de recarga (s; padrão 1,25).
    pistol_sil: { name: 'Pistola com silenciador', gun: true, dmg: 22, cooldown: 0.34, spread: 0.03, range: 42, speed: 74, mag: 15, pellets: 1, auto: false, silenced: true },
    rpg:     { name: 'RPG',             gun: true, rocket: true, dmg: 520, cooldown: 0.9, spread: 0.02, range: 160, speed: 40, mag: 1, pellets: 1, auto: false, heavy: 0.9, reload: 2.2 },
    launcher: { name: 'Lança-foguetes', gun: true, rocket: true, dmg: 400, cooldown: 0.7, spread: 0.04, range: 200, speed: 20, mag: 4, pellets: 1, auto: false, heavy: 0.88, reload: 3.0 },
    minigun: { name: 'Minigun',         gun: true, dmg: 12, cooldown: 0.05, spread: 0.08, range: 46, speed: 82, mag: 250, pellets: 1, auto: true, heavy: 0.84, spinUp: 0.5, reload: 3.4 },
    // Arremessáveis (combat/Throwables.js): contados em unidades (inventário: reserve). Segurar o botão = preparar (pino / acender) e
    // carregar a FORÇA com a linha tracejada mostrando onde cai; soltar = arremessar.
    grenade: { name: 'Granada',         throwable: true, look: 'none' },
    molotov: { name: 'Coquetel molotov', throwable: true, look: 'none' },
};

// Golpes corpo a corpo (jogador, pedestres que revidam, polícia com cassetete, traficantes de perto). Cada golpe é uma COLISÃO de
// verdade, casada com a animação: durante a janela em que o punho/pé/taco está estendido (t0..t1, em s desde o início do clipe),
// a cada quadro uma cápsula vai do peito de quem bate até a ponta do golpe (reach, m; raio w) e acerta quem o corpo (círculo de
// BODY_R) encostar nela — cada alvo leva um acerto por golpe, e só com linha de visada (não atravessa parede).
//   sweep  taco/cassetete: a ponta varre um arco de +sweep a −sweep rad (direita → esquerda) durante a janela (pega mais de um)
//   push   empurrão de quem apanha (m)           fall: força (m/s) do arremesso; ≥ Config.ragdoll.minPower derruba (Ragdoll)
//   shake  tremor de câmera quando o jogador acerta/apanha       car: fração do dano que a lataria leva (só o jogador bate em carro)
// `range` = alcance da mira assistida do jogador (vira para o alvo mais perto à frente ao começar o golpe).
const Melee = {
    punch: { dmg: 9, t0: 0.09, t1: 0.25, reach: 1.15, w: 0.24, push: 0.35, fall: 0, shake: 0.12, car: 0.1, range: 1.9 },
    punchL: { dmg: 8, t0: 0.05, t1: 0.2, reach: 1.1, w: 0.24, push: 0.3, fall: 0, shake: 0.1, car: 0.1, range: 1.9 },
    kick: { dmg: 14, t0: 0.12, t1: 0.33, reach: 1.3, w: 0.3, push: 0.6, fall: 4.4, shake: 0.3, car: 0.5, range: 2.1 },
    swing: { dmg: 34, t0: 0.17, t1: 0.38, reach: 1.7, w: 0.26, sweep: 1.15, push: 0.8, fall: 6.0, shake: 0.4, car: 1, multi: true, range: 2.4 },
    stab: { dmg: 24, t0: 0.12, t1: 0.32, reach: 1.3, w: 0.18, push: 0.25, fall: 0, shake: 0.2, car: 0.1, range: 1.9, cut: true },   // facada: corta (sangra)
    baton: { dmg: 9, t0: 0.17, t1: 0.36, reach: 1.45, w: 0.26, sweep: 0.8, push: 0.45, fall: 0, shake: 0.25, car: 0.3, range: 2.0 },
};
const BODY_R = 0.32;          // raio do corpo de quem apanha (m)

class Combat {
    constructor(scene, game) {
        this.game = game;
        this.MAXB = 72;                 // (a minigun põe ~20 balas por segundo no ar)
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
        if (W.rocket) return this._fireRocket(shooter, weaponKey);
        let mx, mz;
        const tip = shooter.fly ? null : Combat.muzzleOffset(W.look || weaponKey, shooter.angle);
        if (tip && MapGeo.hasLineOfSight(shooter.x, shooter.z, shooter.x + tip[0], shooter.z + tip[1])) { mx = shooter.x + tip[0]; mz = shooter.z + tip[1]; }
        else {                                                                      // (helicóptero, ou a ponta do cano do desenho do outro lado de uma parede)
            const muzzle = shooter.fly ? 1.15 : 1.15 * (Config.art.charScale || 1);
            mx = shooter.x + Math.sin(shooter.angle) * muzzle; mz = shooter.z + Math.cos(shooter.angle) * muzzle;
        }
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
            b.trav = 0;                                                                  // (comprimento do traçante: cresce até o máximo)
        }
        this.shots[shooter.owner]++;
        AudioFX.shot(weaponKey, shooter.x, shooter.z);
        if (typeof SparkFx !== 'undefined') {                               // fogo na boca do cano (+ faíscas e fumaça) e a cápsula ejetada
            SparkFx.muzzle(this.game, mx, mz, shooter.angle, weaponKey, shooter.fly ? 2.2 : 1.15);
            if (!shooter.fly) SparkFx.casing(shooter.x, shooter.z, shooter.angle, weaponKey);
        }
        return n;
    }

    // Foguete (RPG / lança-foguetes): sai da boca do tubo no desenho, com o estrondo e o clarão; o voo é do Rockets.
    _fireRocket(shooter, key) {
        const tip = Combat.muzzleOffset(key, shooter.angle);
        let mx = shooter.x + Math.sin(shooter.angle) * 1.3, mz = shooter.z + Math.cos(shooter.angle) * 1.3;
        if (tip && MapGeo.hasLineOfSight(shooter.x, shooter.z, shooter.x + tip[0], shooter.z + tip[1])) { mx = shooter.x + tip[0]; mz = shooter.z + tip[1]; }
        if (!Rockets.fire(shooter, key, mx, mz)) return 0;
        this.shots[shooter.owner]++;
        AudioFX.shot(key, shooter.x, shooter.z);
        if (typeof SparkFx !== 'undefined') SparkFx.muzzle(this.game, mx, mz, shooter.angle, key, 1.45);
        return 1;
    }

    // Ponta do cano NO DESENHO de quem atira (personagens 2,5D): [leste, norte] em metros a partir dos pés, para a direção (das 8 do
    // sprite) mais perto de `angle`. Sai do gerador (o clarão do quadro de tiro do clipe `shoot`, projetado como o atlas é desenhado:
    // câmera a 56°, a altura vira "para cima" na tela), então o fogo, o traçante e a bala saem de onde a arma aparece. null = sem arma
    // desenhada (ou sem o gerador): quem chamou usa o ponto padrão à frente do corpo.
    static muzzleOffset(look, angle) {
        const T = Combat._muzzle || (Combat._muzzle = {});
        if (!(look in T)) {
            T[look] = null;
            try {
                if (look && look !== 'none' && look !== 'bat' && typeof NpcArt !== 'undefined' && NpcArt.available()) {
                    const G = NpcArt.gen(), spec = G.fullSpec(G.PLAYER_DEFAULT), w = G.weaponFor('protagonista', look);
                    G.setRig(G.rigFor(spec));
                    const P = G.CLIPS.shoot.fn(w).map((q) => (q.adult ? q.adult() : q)).find((q) => q.effects && q.effects.some((e) => e.type === 'flash'));
                    if (P) {
                        const pos = P.effects.find((e) => e.type === 'flash').pos, R = new G.Camera().R, k = (spec.scale || 1) / 52;     // (52 unidades do gerador por metro)
                        T[look] = [];
                        for (let d = 0; d < 8; d++) {                    // direção d do atlas = desenho girado −45°·d (0 = norte, sentido horário)
                            const q = G.mv3(G.Rz(G.deg(-45 * d)), pos);
                            T[look].push([(q[0] * R[0] + q[1] * R[1] + q[2] * R[2]) * k, (q[0] * R[3] + q[1] * R[4] + q[2] * R[5]) * k]);
                        }
                    }
                }
            } catch (e) { console.warn('[COMBATE] ponta do cano de ' + look + ':', e); T[look] = null; }
        }
        const L = T[look];
        return L ? L[((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8] : null;
    }

    // Abertura da mira assistida (rad, para cada lado): trava em quem estiver até Config.aim.cone graus de onde o personagem olha.
    static get ASSIST_CONE() { return ((Config.aim && Config.aim.cone) || 30) * Math.PI / 180; }

    // Alvo da mira assistida: o melhor vivo e à vista dentro de ±cone da direção `angle` (rad) e de `range`. null se ninguém.
    // Preferência: perto do centro do cone e do atirador; polícia e facção (que atiram de volta) antes dos pedestres.
    assistTarget(x, z, angle, range = 30, cone = Combat.ASSIST_CONE) {
        let best = null, bestScore = Infinity;
        const consider = (t, w, reach = range) => {
            const dx = t.position.x - x, dz = t.position.z - z;
            const d = hypot(dx, dz);
            if (d > reach || d < 0.5) return;
            let da = Math.atan2(dx, dz) - angle;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            if (Math.abs(da) > cone) return;
            const score = (Math.abs(da) * 20 + d * 0.25) * w;
            if (score >= bestScore) return;
            if (!t.flying && !MapGeo.hasLineOfSight(x, z, t.position.x, t.position.z)) return;   // quem voa não é tapado por prédio
            bestScore = score; best = t;
        };
        const g = this.game;
        if (g.npcManager) for (const n of g.npcManager.npcs) if (n.alive) consider(n, 1);
        if (g.policeManager) {
            for (const o of g.policeManager.officers) if (o.alive) consider(o, 0.7);
            const h = g.policeManager.heli;
            if (h && h.alive) consider(h, 0.8, Math.max(range, 40));
        }
        if (g.gangs) for (const o of g.gangs.members) if (o.alive) consider(o, 0.7);
        if (g.watch && g.watch.lookouts) for (const o of g.watch.lookouts) if (o.alive && o.actor) consider(o, 0.9);
        return best;
    }

    // Mira assistida sem travar (tiro "do quadril"): o ângulo para o melhor alvo do cone (já adiantado se ele corre) ou `angle`.
    aimAssist(x, z, angle, range = 30, cone = Combat.ASSIST_CONE, speed = 0) {
        const t = this.assistTarget(x, z, angle, range, cone);
        return t ? this.leadAngle(x, z, t, speed) : angle;
    }

    // Ângulo para acertar `t` saindo de (x, z) com a bala a `speed` m/s: mira onde ele VAI estar quando ela chegar (velocidade
    // estimada em _trackVel). Sem isso quem foge correndo (todo mundo, depois do 1º tiro) era errado por mais que o corpo dele.
    leadAngle(x, z, t, speed = 0) {
        const p = t.position, vx = t._tvx || 0, vz = t._tvz || 0;
        let ax = p.x, az = p.z;
        if (speed > 0 && (vx || vz)) {
            for (let k = 0; k < 2; k++) {
                const tt = Math.min(1.2, hypot(ax - x, az - z) / speed);
                ax = p.x + vx * tt; az = p.z + vz * tt;
            }
        }
        return Math.atan2(ax - x, az - z);
    }

    // Velocidade (suavizada) de cada alvo vivo, pela diferença de posição entre quadros: a mira assistida adianta o tiro com ela.
    // Saltos grandes (reciclado para longe, teletransporte) não contam.
    _trackVel(T, dt) {
        if (dt <= 0) return;
        const k = 1 - Math.exp(-12 * dt);
        for (const e of T) {
            if (e.kind === 'car' || e.kind === 'chopper') continue;
            const r = e.ref, p = r.position;
            if (r._tpx === undefined) { r._tpx = p.x; r._tpz = p.z; r._tvx = 0; r._tvz = 0; continue; }
            const vx = (p.x - r._tpx) / dt, vz = (p.z - r._tpz) / dt;
            r._tpx = p.x; r._tpz = p.z;
            if (vx * vx + vz * vz > 1600) { r._tvx = 0; r._tvz = 0; continue; }
            r._tvx += (vx - r._tvx) * k; r._tvz += (vz - r._tvz) * k;
        }
    }

    // ---------------------------------------------------------- corpo a corpo
    // Quem pode levar um golpe de `source`: o jogador bate em todo mundo (pedestres, polícia, traficantes, olheiros); os outros só
    // no jogador (a pé e de pé).
    _meleeTargets(source, out = []) {
        out.length = 0;
        const g = this.game, ok = (t) => t.alive && !t.rag && (!t.actor || t.actor.visible !== false);
        if (source !== 'player') {
            const p = g.player;
            if (p && p.alive && g.mode === 'player' && !p.rag && !p.invulnerable && !g.hiding && !p.dodging) out.push(p);
            return out;
        }
        if (g.npcManager) for (const n of g.npcManager.npcs) if (ok(n)) out.push(n);
        if (g.policeManager) for (const o of g.policeManager.officers) if (ok(o)) out.push(o);
        if (g.gangs) for (const o of g.gangs.members) if (ok(o) && !out.includes(o)) out.push(o);
        if (g.watch && g.watch.lookouts) for (const o of g.watch.lookouts) if (o.alive && o.actor && !o.rag) out.push(o);
        return out;
    }

    // Alvo para a mira assistida do golpe: o mais perto dentro de `range` e ±55° à frente (e à vista). null se ninguém.
    meleeAim(x, z, heading, kind, source = 'player') {
        const M = Melee[kind];
        if (!M) return null;
        let best = null, bs = Infinity;
        for (const t of this._meleeTargets(source, this._mt || (this._mt = []))) {
            const dx = t.position.x - x, dz = t.position.z - z, d = hypot(dx, dz);
            if (d > M.range || d < 0.05) continue;
            let da = Math.atan2(dx, dz) - heading;
            da = Math.atan2(Math.sin(da), Math.cos(da));
            if (Math.abs(da) > 0.96) continue;
            if (!MapGeo.hasLineOfSight(x, z, t.position.x, t.position.z)) continue;
            const s = d + Math.abs(da) * 1.2;
            if (s < bs) { bs = s; best = t; }
        }
        return best;
    }

    // Começa um golpe. who = { position (vivo), heading(): rad, ok(): ainda pode bater (não apanhou/caiu) } ;
    // opts: { source: 'player'|'npc'|'police'|'gang', dmgMul, kind (Melee), onHit(alvo, golpe), ref (quem bate: não se acerta) }.
    // A colisão é testada em update() durante a janela do golpe. Retorna o golpe (ou null).
    strike(who, kind, opts = {}) {
        const M = Melee[kind];
        if (!M) return null;
        const s = { who, kind, M, t: 0, hit: new Set(), source: opts.source || 'player', dmgMul: opts.dmgMul || 1, onHit: opts.onHit || null, ref: opts.ref || who, carHit: false };
        (this.strikes || (this.strikes = [])).push(s);
        return s;
    }

    _updateStrikes(dt) {
        const L = this.strikes;
        if (!L || !L.length) return;
        for (let i = L.length - 1; i >= 0; i--) {
            const s = L[i], M = s.M;
            s.t += dt;
            if (s.who.ok && !s.who.ok()) { L.splice(i, 1); continue; }          // quem bate apanhou/caiu: o golpe some
            if (s.t >= M.t0) this._strikeTest(s);
            if (s.t >= M.t1) L.splice(i, 1);
        }
    }

    // Um quadro da janela do golpe: cápsula do peito até a ponta contra o corpo de cada alvo.
    _strikeTest(s) {
        const M = s.M, P = s.who.position, h = s.who.heading();
        const u = Math.min(1, Math.max(0, (s.t - M.t0) / Math.max(0.01, M.t1 - M.t0)));
        const a = M.sweep ? h + M.sweep * (1 - 2 * u) : h;                     // taco: varre da direita para a esquerda
        const reach = M.sweep ? M.reach : M.reach * (0.75 + 0.25 * Math.min(1, u * 2.5));      // soco/chute: o punho vai à frente
        const ax = P.x + Math.sin(h) * 0.15, az = P.z + Math.cos(h) * 0.15;
        const bx = P.x + Math.sin(a) * reach, bz = P.z + Math.cos(a) * reach;
        const sx = bx - ax, sz = bz - az, sl2 = sx * sx + sz * sz || 1e-6, R = M.w + BODY_R;
        let landed = false;
        for (const t of this._meleeTargets(s.source, this._mt || (this._mt = []))) {
            if (t === s.ref || s.hit.has(t)) continue;
            if (!M.multi && s.hit.size) break;
            const p = t.position, k = Math.max(0, Math.min(1, ((p.x - ax) * sx + (p.z - az) * sz) / sl2));
            const cx = ax + sx * k, cz = az + sz * k;
            if ((p.x - cx) ** 2 + (p.z - cz) ** 2 > R * R) continue;
            if (!MapGeo.hasLineOfSight(P.x, P.z, p.x, p.z)) continue;
            s.hit.add(t);
            landed = true;
            this._land(s, t, cx, cz);
        }
        // Só o jogador acerta carro (lataria amassa com chute e taco; soco só faz barulho) — se não pegou ninguém.
        if (!landed && !s.hit.size && !s.carHit && s.source === 'player' && u > 0.4) {
            const car = this._carAt(bx, bz, M.w);
            if (car) {
                s.carHit = true;
                if (M.car > 0.2 && car.takeDamage) car.takeDamage(M.dmg * M.car * s.dmgMul * (Config.crash.bulletMul || 1), 'player');
                this.spark(bx, 1.0, bz, [1, 0.9, 0.5]);
                AudioFX.hit(bx, bz);
                if (M.car > 0.2 && this.game.camera) this.game.camera.shake(M.shake * 0.6);
                if (s.onHit) s.onHit(car, s);
            }
        }
    }

    // Acertou `t` (ponto de contato cx, cz): dano, empurrão, queda (com força) e efeitos.
    _land(s, t, cx, cz) {
        const M = s.M, P = s.who.position, g = this.game;
        let dx = t.position.x - P.x, dz = t.position.z - P.z;
        const l = hypot(dx, dz) || 1; dx /= l; dz /= l;
        const dmg = M.dmg * s.dmgMul;
        const fall = M.fall >= Config.ragdoll.minPower ? { dx, dz, power: M.fall * (0.9 + Math.random() * 0.2) } : null;
        if (t === g.player) t.meleeHit(dmg, dx, dz, M);
        else {
            t.takeDamage(dmg, { x: P.x, z: P.z }, s.source, fall);
            if (t.alive && !t.rag) this.shove(t, dx * M.push, dz * M.push);
        }
        if (typeof Blood !== 'undefined' && M.cut) {                          // faca: corte — espirra e sangra (machucado, como um tiro)
            Blood.hit(t.position.x, t.position.z, dx, dz, dmg * 0.8, t);
            Blood.wound(t, dmg * 0.8, false);
            Blood.cond(t, 2);
        } else if (typeof Blood !== 'undefined') {
            Blood.beat(t, dmg);                                               // camada ESPANCADO do sprite (hematomas, nariz sangrando)
            if (M.dmg >= 20) {                                                // taco: abre o supercílio — pinga no chão (soco e chute não)
                Blood.hit(t.position.x, t.position.z, dx, dz, dmg * 0.5, t);
                Blood.wound(t, dmg * 0.4, false);
            }
        }
        this.spark(cx, 1.15, cz, [1, 0.45, 0.35]);
        AudioFX.thud(t.position.x, t.position.z);
        if ((s.source === 'player' || t === g.player) && g.camera) g.camera.shake(M.shake);
        if (s.onHit) s.onHit(t, s);
    }

    // Empurra um pedestre/policial (agente da multidão) — fica no chão andável, não atravessa parede.
    shove(t, dx, dz) {
        if (!dx && !dz) return;
        const p = t.position, to = new BABYLON.Vector3(p.x + dx, p.y, p.z + dz);
        if (!MapGeo.hasLineOfSight(p.x, p.z, to.x, to.z)) return;
        if (t.nav && t.index >= 0) {
            const q = t.nav.closestPoint(to);
            if (hypot(q.x - to.x, q.z - to.z) < 0.4) t.nav.crowd.agentTeleport(t.index, q);
        } else if (t.transform) { p.x = to.x; p.z = to.z; }
    }

    // Carro (ou moto/bicicleta) cuja lataria contém o ponto (x, z), com folga r.
    _carAt(x, z, r) {
        const g = this.game, list = [];
        if (g.vehicleManager) list.push(...g.vehicleManager.vehicles);
        if (g.policeManager) list.push(...g.policeManager.cars);
        for (const c of list) {
            if (!c.body || c.wrecked && c.isBike) continue;
            const p = c.position, f = c.body.getDirection(BABYLON.Axis.Z), fl = hypot(f.x, f.z) || 1, fx = f.x / fl, fz = f.z / fl;
            const dx = x - p.x, dz = z - p.z;
            if (Math.abs(dx * fx + dz * fz) <= (c.halfLen || 2) + r && Math.abs(dx * fz - dz * fx) <= (c.halfW || 1) + r) return c;
        }
        return null;
    }

    // Bala que acertou um carro: por onde ela ENTROU no casco (o raio da bala contra o retângulo do carro). Pela frente → para-brisa;
    // por trás → vidro traseiro; pelo lado, na altura da cabine → a janela daquela porta (70%; o resto pega na porta). Vidro inteiro:
    // ESPATIFA (cacos e som; o carro 3D mostra o buraco). Quem DIRIGE só se machuca pelo LADO DO MOTORISTA (esquerda: o para-brisa do
    // lado dele, a janela ou a porta da frente) — o jogador leva o dano normal; o motorista NPC (trânsito ou viatura) vai perdendo vida
    // (Config.crash.driverHp) e, zerada, morre ao volante: o carro para e a buzina dispara (TrafficCar.killDriver).
    _carShot(car, b) {
        if (!car.position || car.isBike || car.isBoat || car.wrecked || !CarDoors) return;
        const D = typeof DoorSheet !== 'undefined' && car.spec && DoorSheet.SPEC[car.spec.id];
        const A = CarDoors.axes(car), c = car.position, hl = car.halfLen || 2, hw = car.halfW || 1;
        // raio da bala (de um pouco antes de onde ela estava neste quadro) contra o retângulo do carro, no espaço dele (u frente, v direita)
        const ox = b.px - b.dirx * 4 - c.x, oz = b.pz - b.dirz * 4 - c.z;
        const u0 = ox * A.fx + oz * A.fz, v0 = ox * A.rx + oz * A.rz, du = b.dirx * A.fx + b.dirz * A.fz, dv = b.dirx * A.rx + b.dirz * A.rz;
        let tmin = -Infinity, tmax = Infinity, face = null;
        for (const [p0, d, h, f] of [[u0, du, hl, 'u'], [v0, dv, hw, 'v']]) {
            if (Math.abs(d) < 1e-6) { if (Math.abs(p0) > h) return; continue; }
            let t1 = (-h - p0) / d, t2 = (h - p0) / d;
            if (t1 > t2) { const q = t1; t1 = t2; t2 = q; }
            if (t1 > tmin) { tmin = t1; face = f; }
            tmax = Math.min(tmax, t2);
        }
        if (!face || tmin > tmax || tmin < 0) return;
        const u = u0 + du * tmin, v = v0 + dv * tmin, wx = c.x + A.fx * u + A.rx * v, wz = c.z + A.fz * u + A.rz * v;
        const front = D ? D.h + 0.15 : hl * 0.45, back = D ? D.h - D.len * 1.9 : -hl * 0.55, doorEnd = D ? D.h - D.len : 0;
        let win = -1, driverSide = false;
        if (face === 'u') { win = u > 0 ? 0 : 1; driverSide = u > 0 && v < 0; }
        else if (u < front && u > back) {
            const left = v < 0, fr = u > doorEnd;
            if (Math.random() < 0.7) win = (left ? 2 : 3) + (fr ? 0 : 2);
            driverSide = left && fr;
        }
        const glassHit = win >= 0;
        if (glassHit && car.breakGlass && car.breakGlass(win)) {             // espatifou: chuva de cacos e o som
            for (let i = 0; i < 12; i++) this.spark(wx + (Math.random() - 0.5) * 0.8, 0.9 + Math.random() * 0.6, wz + (Math.random() - 0.5) * 0.8, [0.62, 0.85, 1]);
            if (typeof SparkFx !== 'undefined') SparkFx.impact(wx, wz, b.dirx, b.dirz, 1.2, 8);
            AudioFX.glass(wx, wz);
        }
        if (!driverSide) return;
        const g = this.game, k = glassHit ? Config.crash.glassDriver : Config.crash.doorDriver;
        if (car === g.activeCar && g.mode === 'car') {                        // o jogador dirigindo (o tiro dele mesmo não)
            if (b.owner !== 'player') g.player.takeDamage(b.dmg * k);
            return;
        }
        if (!car.killDriver || car.driver === false || car.driverDead || car.controlled) return;
        if (car.driverHp === undefined) car.driverHp = Config.crash.driverHp;
        car.driverHp -= b.dmg * k;
        this.spark(wx, 1.25, wz, [0.75, 0.05, 0.05]);
        if (b.owner === 'player' && g.wanted) g.wanted.reportCrime();
        if (car.driverHp > 0 || !car.killDriver()) return;
        if (g.npcManager) g.npcManager.alertViolence(car.position, 22);
    }

    // ------------------------------------------------------------------ efeitos
    // Bala que acertou um carro durante uma PERSEGUIÇÃO (procurado): Config.crash.tireChance de pegar o pneu mais perto do ponto
    // atingido — chuva de faíscas na roda, estouro, e o carro passa a escorregar (Vehicle.puncture / _applyMotion).
    _tireShot(car, hx, hz) {
        const g = this.game;
        if (!car || !car.puncture || !g.wanted || !(g.wanted.level > 0) || Math.random() >= Config.crash.tireChance) return;
        const i = car.nearestWheel(hx, hz);
        if (!car.puncture(i)) return;
        const w = car.wheelWorld(i);
        if (typeof SparkFx !== 'undefined') SparkFx.burst(g, w.x, w.z, car);        // leque de faíscas, lascas de borracha e fumaça
        this.spark(w.x, 0.4, w.z, [1, 0.85, 0.5], 0.15);                            // (clarão do estouro)
        AudioFX.thud(w.x, w.z);
        const side = ['dianteiro esquerdo', 'dianteiro direito', 'traseiro esquerdo', 'traseiro direito'][i];
        if (car === g.activeCar && g.mode === 'car') { g._flash(`💥 Pneu ${side} furado! O carro vai escorregar`); g.input.rumble(0.8, 0.8, 260); }
        else if (car.role) g._flash('💥 Você furou o pneu da viatura!');
    }

    // A cobertura do jogador segura esta bala? (vem do lado do obstáculo; mirando/atirando de pé, só às vezes)
    _coverStops(pl, b) {
        if (!pl.inCover || typeof Cover === 'undefined' || !Cover.blocks(pl.cover, b.dirx, b.dirz)) return false;
        const g = this.game, exposed = (g.aim && g.aim.active) || (pl.action && pl.action.name === 'shoot');
        return !exposed || Math.random() >= Config.tactics.coverExposed;
    }

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
        if (g.player.alive && g.mode === 'player' && !g.player.dodging) add(g.player, 'player', g.player.crouched ? 0.5 : 0.6);      // (rolando: as balas passam; agachado: alvo menor)
        if (g.choppers) for (const c of g.choppers) if (c.alive) add(c, 'chopper', 2.6);
        T.length = n;
        return T;
    }

    update(dt) {
        this._updateStrikes(dt);
        const T = this._collectTargets();
        this._trackVel(T, dt);
        const g = this.glow;

        for (let i = 0; i < this.MAXB; i++) {
            const b = this.bullets[i];
            const base = i * 3;
            if (!b.on) { g.off(base); g.off(base + 1); g.off(base + 2); if (typeof SparkFx !== 'undefined') SparkFx.tracerOff(i); continue; }

            b.px = b.x; b.pz = b.z;
            b.x += b.vx * dt; b.z += b.vz * dt;
            const step = hypot(b.vx * dt, b.vz * dt);
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
            // Jogador em COBERTURA e a bala vem do lado dela: para no obstáculo (levantado para mirar/atirar, parte passa).
            if (hit && hit.kind === 'player' && this._coverStops(hit.ref, b)) {
                const C = hit.ref.cover;
                this.spark(C.x, 1.0, C.z, [1, 0.85, 0.5]);
                if (typeof SparkFx !== 'undefined') SparkFx.impact(C.x, C.z, b.dirx, b.dirz);
                AudioFX.hit(C.x, C.z);
                if (C.kind === 'car' && C.ref.takeDamage) C.ref.takeDamage(b.dmg * Config.crash.bulletMul, b.owner);
                b.on = false; g.off(base); g.off(base + 1); g.off(base + 2);
                continue;
            }
            if (hit) {
                const hx = b.px + sx * hitT, hz = b.pz + sz * hitT;
                if (hit.kind === 'car') {
                    this.spark(hx, 1.0, hz, [1, 0.9, 0.5]); if (typeof SparkFx !== 'undefined') SparkFx.impact(hx, hz, b.dirx, b.dirz, 1.0, 5); AudioFX.hit(hx, hz);
                    // A lataria leva parte do dano (carros amassam, soltam fumaça e podem explodir a tiros).
                    if (hit.ref.takeDamage) hit.ref.takeDamage(b.dmg * Config.crash.bulletMul, b.owner);
                    this._carShot(hit.ref, b);                                    // vidro estilhaçado e quem dirige (lado do motorista)
                    this._tireShot(hit.ref, hx, hz);
                }
                else {
                    const wasAlive = hit.ref.alive !== false;
                    hit.ref.takeDamage(b.dmg, { x: b.px, z: b.pz }, b.owner);
                    if (wasAlive && hit.kind !== 'heli' && typeof Blood !== 'undefined') {     // sangue: respingo atrás do alvo e ferida que sangra
                        const p = hit.ref.position;
                        Blood.hit(p.x, p.z, b.vx, b.vz, b.dmg, hit.ref);
                        Blood.wound(hit.ref, b.dmg);
                    }
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
                    if (o.h > 1.6 && x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1) { wall = true; this.spark(x, 1.3, z, [1, 0.85, 0.5]); if (typeof SparkFx !== 'undefined') SparkFx.impact(x, z, b.dirx, b.dirz); AudioFX.hit(x, z); break; }
                }
            }
            if (wall || b.left <= 0 || !MapGeo.isLand(b.x, b.z)) { b.on = false; g.off(base); g.off(base + 1); g.off(base + 2); continue; }

            // 3) Visual: TRAÇANTE — um risco luminoso do trecho percorrido (até 3,2 m) até a bala (SparkFx), com um halo fraco na ponta.
            b.trav += step;
            const L = Math.min(b.trav, 3.2);
            if (typeof SparkFx !== 'undefined') {
                SparkFx.tracer(i, b.x - b.dirx * L, b.z - b.dirz * L, b.x, b.z, 1.3, 0.075);
                g.place(base, b.x, 1.3, b.z, 0.3); g.color(base, 1.0, 0.9, 0.55, 0.45);
                g.off(base + 1); g.off(base + 2);
            } else {
                g.place(base, b.x, 1.3, b.z, 0.5); g.color(base, 1.0, 0.92, 0.55, 1);
                g.off(base + 1); g.off(base + 2);
            }
        }
        if (typeof SparkFx !== 'undefined') SparkFx.flushTracers();

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
