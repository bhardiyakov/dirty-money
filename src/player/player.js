// ============================================================================
// Player — personagem cinemático (sem física) desenhado como SPRITE 2D pixel art.
// `root` é o nó lógico (posição + giro); o SpriteActor mostra o frame certo do
// clipe atual na direção certa. Movimento vetorial em 8 direções, independente
// de framerate, com colisão círculo×retângulo contra prédios.
//
// Animação: locomoção (idle/walk/run, com ou sem arma) é escolhida pela
// velocidade; AÇÕES (soco, chute, taco, tiro, sacar, roubar carro...) tomam
// o controle até acabarem e travam/limitam o movimento.
//
// TÁTICO (Config.tactics): AGACHADO (furtivo: anda devagar e é notado de mais perto) — encostado num prédio, muro, caçamba ou
// carro fica EM COBERTURA (combat/Cover.js); ROLAMENTO de esquiva (as balas passam por ele durante a janela rollIframes); e, de
// frente para a mira, anda para a frente, para trás e de lado (passo lateral) atirando.
// ============================================================================

class Player {
    constructor(scene, library, startPos = new BABYLON.Vector3(0, 0, 0)) {
        this.scene = scene;
        this.lib = library;
        this.rag = null;           // Ragdoll ativo (arremessado por atropelamento / pulando de um carro)
        this.velocity = new BABYLON.Vector3(0, 0, 0);
        this.speed = 0;
        this.skidding = false;     // braking hard after a sharp reversal while running (_landVelocity)
        this.state = 'idle';       // idle | walk | sprint | <ação>

        this.root = new BABYLON.TransformNode('player', scene);
        this.root.position = startPos.clone();

        this.actor = new SpriteActor(scene, library.sheets.hero || library.sheets.player, 0, 'playerSprite');      // hero = o protagonista 2,5D (NpcArt / PlayerLook)
        this.maxHp = 100;
        this.hp = this.maxHp;
        this.armor = 0;            // colete à prova de balas (pontos restantes)
        this.armorMax = 0;         // capacidade do colete em uso: 50 = nível 1, 100 = nível 2 (0 = sem colete)
        this._sinceHit = 99;
        this.hitFlash = 0;
        this.weapon = 'none';      // none | pistol | smg | shotgun | bat
        this.action = null;        // { name, lock, onDone, holdAim }
        this.aimTimer = 0;         // tempo restante "mirando" parado após sacar/atirar.
        this.aimHeading = null;    // mirando (Aim): direção para onde o corpo aponta; null = livre
        this.aimFree = false;      // ...pela mira livre do analógico direito (Aim._updateFree): anda quase normal, só não corre
        this.crouched = false;     // agachado (furtivo / cobertura)
        this.cover = null;         // superfície de cobertura ao lado (Cover.find) enquanto agachado; null = sem cobertura
        this.roll = null;          // rolamento de esquiva em andamento: { t, dx, dz, heading }
        this.coverSnap = null;     // indo até a cobertura (Q perto dela): { x0, z0, x, z, t, dur }
        this.coverLock = null;     // COLADO na cobertura (Q perto dela): { pull, hold } — o direcional só desliza ao longo dela (_coverMove)
        this._rollCd = 0;
        this._coverT = 0;
        this._combo = 0;

        this.actor.play('idle');
        this._syncSprite();
    }

    // ----------------------------------------------------------------- vida
    get alive() { return this.hp > 0; }

    // Dano de bala. Cambaleia (sem travar o jogador por muito tempo). quiet: sem a animação de cambalear
    // (atropelamento/queda têm a própria animação).
    takeDamage(amount, quiet = false) {
        if (this.hp <= 0 || this.invulnerable) return;       // (rendido: ninguém atira)
        amount *= 1 - (SkillTree.m.dmgTaken || 0) - Outfit.m.dmgTaken;      // habilidade Sangue frio | roupa (jaqueta de couro, coturno)
        if (this.armor > 0) {                                 // colete: absorve 75% do dano até acabar (Colete ajustado: mais)
            const a = Math.min(this.armor, amount * (0.75 + (SkillTree.m.vest || 0)));
            this.armor -= a; amount -= a;
            if (this.armor < 0.5) { this.armor = 0; this.armorMax = 0; }
        }
        this.hp = Math.max(0, this.hp - amount);
        if (this.hp <= 0 && SkillTree.instance && SkillTree.instance.trySecondWind()) this.hp = this.maxHp * 0.3;      // Corpo fechado
        this._sinceHit = 0;
        this.hitFlash = 0.35;                       // vinheta vermelha na tela
        if (!this.busy && !quiet) this.playAction('hurt', { lock: 0.6 });
    }

    // Levou um golpe corpo a corpo (soco, chute, cassetete — Combat.strike): dano, cambaleia e é empurrado; com força (chute,
    // taco) cai no chão e levanta. dx, dz = direção do golpe; M = o golpe (Melee).
    meleeHit(amount, dx, dz, M) {
        if (this.hp <= 0 || this.invulnerable || this.rag) return;
        const fall = M.fall >= Config.ragdoll.minPower;
        this.cancelSequence();
        if (this.action && !fall) this.action = null;                // (o golpe interrompe o que ele fazia)
        this.takeDamage(amount, fall);                               // (cambaleia: o clipe 'hurt')
        if (this.hp <= 0) return;
        if (fall) { this.ragdoll({ dx, dz, power: M.fall * 0.85 }); return; }
        const p = this.root.position;
        p.x += dx * M.push; p.z += dz * M.push;
        MapGeo.resolveCircle(p, 0.35);
    }

    // Arremessado (ragdoll): perde o controle, voa/rola/desliza e levanta. kind: 'hit' (atropelado) | 'bail'
    // (pulou de um veículo: cambalhota). lethal: termina caído (o jogo cuida do "WASTED").
    ragdoll({ dx, dz, power, kind = 'hit', lethal = false }) {
        this.cancelSequence();
        this.diving = false;
        if (kind === 'bail' && typeof Blood !== 'undefined') Blood.dirty(this);     // pulou do veículo andando e rolou no chão: SUJO
        this.resetTactics();
        this.action = null; this.aimTimer = 0;
        this.velocity.setAll(0);
        this.rag = new Ragdoll(
            { actor: this.actor, pos: this.root.position, onEnd: (dead) => this._ragEnd(dead) },
            { dx, dz, power, kind, lethal, onLand: (p) => { if (p > 4) AudioFX.thud(this.position.x, this.position.z); } });
        this.root.rotation.y = this.rag.heading;
        this.state = 'ragdoll';
    }

    _ragEnd(dead) {
        this.root.rotation.y = this.rag.heading;
        this.rag = null;
        this.actor.mesh.position.y = this.baseY;
        this.actor.play(dead ? 'dead' : 'idle', 'none', { restart: true });
        if (dead) this.actor.setPhase(1);                                       // (já deitado: só a pose final, sem refazer a queda)
        this._syncSprite();
    }

    // Regenera devagar depois de alguns segundos sem levar tiro.
    tickHealth(dt) {
        if (this.hitFlash > 0) this.hitFlash -= dt;
        if (this.hp <= 0) return;                         // morto não regenera
        this._sinceHit += dt;
        const cap = this.maxHp * (0.3 + (SkillTree.m.regen || 0));      // (habilidade Recuperação sobe o teto)                      // punitivo: sem tratamento só se recupera até 30% da vida, bem devagar
        if (this._sinceHit > 10 && this.hp < cap) this.hp = Math.min(cap, this.hp + 1.2 * dt);
    }

    // Veste um colete de capacidade `max` (50 = nível 1, 100 = nível 2): recompõe o que faltava até a capacidade.
    wearVest(max) {
        this.armorMax = Math.max(this.armorMax, max);
        this.armor = this.armorMax;
    }

    revive() { this.armor = 0; this.armorMax = 0; this.hp = this.maxHp; this.action = null; this._sinceHit = 0; }

    // ---------------------------------------------------------------- ações
    get busy() { return !!this.action || !!this.rag || !!this.frozen || !!this.roll; }

    // ---------------------------------------------------------------- tático: agachar, cobertura, rolar
    get inCover() { return this.crouched && !!this.cover; }
    // Balas passam por ele (rolando, na janela Config.tactics.rollIframes).
    get dodging() { const r = this.roll, I = Config.tactics.rollIframes; return !!r && r.t >= I[0] && r.t <= I[1]; }

    setCrouch(on) {
        on = !!on;
        if (on === this.crouched) return;
        this.crouched = on;
        this._coverT = 0;
        if (!on) { this.cover = null; this.coverLock = null; }
        else this.cover = typeof Cover !== 'undefined' ? Cover.find(this.position.x, this.position.z) : null;
    }

    // COBERTURA COLADA (como nos jogos de tiro): o direcional só leva o personagem para a esquerda/direita AO LONGO da superfície
    // (empurrar contra ela não faz nada). Muros em fila (vários obstáculos) são uma cobertura só. Na PONTA ele para; segurando a
    // direção por Config.tactics.coverCorner, contorna a quina (desliza para a face do lado — volta num carro, fim de muro).
    // Puxar para longe dela por coverLeave solta. Devolve a direção de movimento a usar (já ao longo da superfície).
    // Distância de encosto: muro ALTO acima do personagem na tela (a cabeça do desenho 2,5D cresce para cima) — afasta um pouco, senão
    // a cabeça some atrás da parede do prédio.
    static coverStickOf(C) {
        const T = Config.tactics, y = typeof CompassCamera !== 'undefined' ? CompassCamera.yaw || 0 : 0;
        if (!C || C.kind !== 'wall') return T.coverStick;
        const below = -(C.nx * Math.sin(y) + C.nz * Math.cos(y));                       // 1 = o muro está bem acima dele na tela
        return T.coverStick + 0.45 * Math.max(0, below);
    }

    _coverMove(moveDir, dt) {
        const L = this.coverLock, p = this.root.position, T = Config.tactics;
        const C = Cover.find(p.x, p.z, T.coverStick + 1.3);
        if (!C) { this.coverLock = null; return moveDir; }                       // a cobertura sumiu (o carro foi embora)
        this.cover = C;
        if (moveDir.lengthSquared() < 1e-4) { L.pull = 0; L.hold = 0; return moveDir; }
        const tx = -C.nz, tz = C.nx;                                              // tangente da superfície
        let away = moveDir.x * C.nx + moveDir.z * C.nz, along = moveDir.x * tx + moveDir.z * tz;
        // depois de contornar uma quina, a MESMA direção segurada continua valendo como "seguir em frente" na face nova
        const K = L.carry;
        if (K) {
            if (moveDir.x * K.ix + moveDir.z * K.iz > 0.8) { const sd = K.dx * tx + K.dz * tz; along = sd >= 0 ? 1 : -1; away = 0; }
            else L.carry = null;
        }
        if (away > 0.7) {                                                         // puxando para longe: solta depois de um instante
            L.pull = (L.pull || 0) + dt; L.hold = 0;
            if (L.pull > T.coverLeave) { this.coverLock = null; return moveDir; }
            return Player.ZERO;
        }
        L.pull = 0;
        if (Math.abs(along) < 0.2) { L.hold = 0; return Player.ZERO; }            // empurrando contra ela: fica
        const s = Math.sign(along);
        // Logo adiante, a MESMA face continua (ou outro obstáculo alinhado)? Senão é a ponta.
        const N = Cover.find(p.x + tx * s * 0.5, p.z + tz * s * 0.5, T.coverStick + 0.95);
        if (!N || N.nx * C.nx + N.nz * C.nz < 0.95) {
            L.hold = (L.hold || 0) + dt;
            if (N && L.hold > T.coverCorner) { L.hold = 0; this._coverCorner(N, C, s, tx, tz); }
            return Player.ZERO;
        }
        L.hold = 0;
        const v = this._cv || (this._cv = new BABYLON.Vector3()), m = Math.abs(along);
        return v.set(tx * s * m, 0, tz * s * m);
    }

    // Contorna a quina: da ponta (N = o canto) para a face do lado, cuja normal aponta para onde ele andava.
    _coverCorner(N, C, s, tx, tz) {
        const T = Config.tactics, p = this.root.position, nx = tx * s, nz = tz * s;      // (= a direção em que ele andava = a normal da face do lado)
        const x = N.x + nx * T.coverStick - C.nx * 0.35, z = N.z + nz * T.coverStick - C.nz * 0.35;      // (sonda na face do lado)
        const D = Cover.find(x, z, T.coverStick + 0.5);
        if (!D || D.nx * nx + D.nz * nz < 0.7 || D.d < T.coverStick - 0.15) return;      // não há face do lado (ou está tomada)
        const st = Player.coverStickOf(D);
        this.coverSnap = { x0: p.x, z0: p.z, x: D.x + D.nx * st, z: D.z + D.nz * st, t: 0, dur: 0.28 };
        this.coverLock.carry = { ix: nx, iz: nz, dx: -C.nx, dz: -C.nz };      // (segue para "trás" da face nova enquanto segurar)
    }

    // Mantém o personagem encostado: a distância até a superfície volta suavemente a Config.tactics.coverStick.
    _coverStick(dt) {
        const p = this.root.position, T = Config.tactics, C = Cover.find(p.x, p.z, T.coverStick + 1.3);
        if (!C) { this.coverLock = null; return; }
        const k = 1 - Math.exp(-14 * dt), e = (Player.coverStickOf(C) - C.d) * k;
        p.x += C.nx * e; p.z += C.nz * e;
        MapGeo.resolveCircle(p, Config.player.radius, this.underBridge);
        this.cover = C;
    }

    resetTactics() { this.roll = null; this.crouched = false; this.cover = null; this.coverSnap = null; this.coverLock = null; }

    // Rolamento na direção (dx, dz) (normalizada). false se não dá agora (ocupado, na água, recarregando o fôlego do último).
    startRoll(dx, dz) {
        const T = Config.tactics;
        if (this.busy || this.swimming || (this.depth || 0) > 0 || this._rollCd > 0 || this.winded) return false;
        if (this.stamina != null) { if (this.stamina < T.rollStamina * 0.5) return false; this.stamina = Math.max(0, this.stamina - T.rollStamina); }
        const l = Math.hypot(dx, dz) || 1;
        this.roll = { t: 0, dx: dx / l, dz: dz / l, heading: Math.atan2(dx, dz) };
        this.crouched = false; this.cover = null; this.coverLock = null;
        this.aimTimer = 0;
        this.root.rotation.y = this.roll.heading;
        if (!this.actor.play('roll', 'none', { restart: true })) this.actor.play('tumble', 'none', { restart: true });
        return true;
    }

    // Um quadro do rolamento: desliza (rápido no meio, devagar no começo e no fim) sem atravessar paredes e toca o clipe no ritmo dele.
    _updateRoll(dt) {
        const R = this.roll, T = Config.tactics;
        R.t += dt;
        const k = Math.min(1, R.t / T.rollTime), v = (T.rollDist / T.rollTime) * (Math.PI / 2) * Math.sin(Math.PI * k);
        const p = this.root.position, nx = p.x + R.dx * v * dt, nz = p.z + R.dz * v * dt;
        if (MapGeo.canWade(nx, nz)) { p.x = nx; p.z = nz; }
        else if (MapGeo.canWade(nx, p.z)) p.x = nx;
        else if (MapGeo.canWade(p.x, nz)) p.z = nz;
        if (this.onDeck) this._clampToDeck(p); else MapGeo.resolveCircle(p, Config.player.radius, this.underBridge);
        this._updateLevel();
        this.velocity.set(R.dx * v, 0, R.dz * v); this.speed = v;
        this.root.rotation.y = R.heading;
        this.state = 'roll';
        const c = this.actor.clip;
        this._syncSprite();
        this.actor.update(dt, c ? (c.frames / c.fps) / T.rollTime : 1);           // (o clipe inteiro dura exatamente o rolamento)
        if (R.t >= T.rollTime) { this.roll = null; this._rollCd = T.rollCooldown; this.velocity.scaleInPlace(0.3); }
    }

    // Direção do movimento em relação a para onde o corpo olha (rad): 0 = para a frente, +π/2 = para a direita, ±π = para trás.
    _relMove() {
        const rel = Math.atan2(this.velocity.x, this.velocity.z) - this.root.rotation.y;
        return Math.atan2(Math.sin(rel), Math.cos(rel));
    }

    // Clipe de locomoção mirando/atirando: de frente para a mira, o movimento pode ir para qualquer lado — para a frente (andar
    // armado), para trás (o mesmo, ao contrário) ou de lado (passo lateral; para a esquerda, ao contrário). Devolve o ritmo (com sinal).
    _aimGait(w, base) {
        const rel = this._relMove(), a = Math.abs(rel);
        if (a > 0.87 && a < 2.27 && this.actor.play('strafe', w)) return (rel > 0 ? 1 : -1) * base / 0.37;      // (passo lateral: passada 0,37 da do andar — o pé plantado do clipe, medido)
        this.actor.play('walk', w);
        return a >= 2.27 ? -base : base;
    }

    // Sequência de ações encadeadas (entrar/roubar um carro). Cada passo:
    //   { clip, weapon?, timer?, fit?, glide?:{x,z}, yank?, onStart?, face? }
    // clip: clipe tocado (sem timer, até o fim; com timer, em loop por `timer` s — pode ser encurtado em `action.timer = 0`)
    // glide: durante o passo o personagem desliza até {x,z} | yank: chamado no meio do clipe (Player.YANK) | onStart: ao começar
    // face: para onde olhar neste passo (rad, ou função que devolve) — correr até a porta olhando para ela, depois virar para o carro.
    // opts: { face: heading (rad), onDone, onAbort }. onAbort roda se a sequência for interrompida (ragdoll, teleporte,
    // cancelSequence) — quem chamou devolve o carro/porta ao normal.
    runSequence(steps, { face = null, onDone = null, onAbort = null } = {}) {
        if (this.busy) return false;
        this.velocity.setAll(0);
        if (face !== null) this.root.rotation.y = face;
        const seq = this._seq = { onAbort };
        const run = (i) => {
            if (this._seq !== seq) return;                           // interrompida
            if (i >= steps.length) { this._seq = null; this._glide = null; this.actor.mesh.position.y = this.baseY; if (onDone) onDone(); return; }   // (o deslize acabou junto: não arrasta o que vier depois)
            const s = steps[i];
            if (s.onStart) s.onStart();
            if (this._seq !== seq) return;                           // (onStart pode ter cancelado)
            if (s.face !== undefined) this.root.rotation.y = typeof s.face === 'function' ? s.face() : s.face;
            const ok = this.playAction(s.clip, { lock: 0, weapon: s.weapon || 'none', yank: s.yank || null, onDone: () => run(i + 1) });
            if (!ok) { run(i + 1); return; }
            if (s.timer !== undefined) this.action.timer = s.timer;
            // fit: o clipe (sem loop) dura exatamente o timer — toca uma vez, mais devagar ou mais rápido, e não acaba antes do passo
            if (s.fit && s.timer && this.actor.clip && !this.actor.clip.loop) this.action.rate = this.actor.clip.frames / this.actor.clip.fps / s.timer;
            // glide: ponto {x,z} ou função que o devolve (acompanha um carro que ainda está freando).
            this._glide = s.glide ? { x0: this.root.position.x, z0: this.root.position.z, to: typeof s.glide === 'function' ? s.glide : () => s.glide, t: 0, dur: Math.max(0.05, s.timer || 0.3), arc: s.arc || 0 } : null;
        };
        run(0);
        return true;
    }

    // Interrompe a sequência em andamento (chama o onAbort dela).
    cancelSequence() {
        const seq = this._seq;
        if (!seq) return false;
        this._seq = null; this._glide = null;
        this.actor.mesh.position.y = this.baseY;
        this.action = null;
        this.setCarClip(null);
        if (seq.onAbort) seq.onAbort();
        return true;
    }

    // Entrando no carro: o que do desenho já entrou some debaixo da carroceria de `car` (NpcArt.setClip), dos pés para a cabeça, ao
    // longo de `dur` s (a cabeça some quando ele abaixa para passar pela porta). out = saindo: o contrário — começa todo escondido e
    // aparece da cabeça para os pés. null desliga.
    setCarClip(car, dur = 1, out = false) {
        this._carClip = car ? { car, t: 0, dur, out } : null;
        if (car) this._updateCarClip(0);
        else NpcArt.setClip(this._clipIds(), null);
    }
    _clipIds() { const s = this.actor.sheet; return s && s.isNpc ? s.atlasList() : []; }
    _updateCarClip(dt) {
        const k = this._carClip;
        if (!k) return;
        k.t += dt;
        const s = Math.min(1, k.t / k.dur), u = k.out ? 1 - s : s, e = Math.min(1, Math.max(0, (u - 0.06) / 0.52)), car = k.car, A = CarDoors.axes(car);
        const p = this.root.position, dx = p.x - car.position.x, dz = p.z - car.position.z;
        const inside = Math.abs(dx * A.fx + dz * A.fz) < car.halfLen && Math.abs(dx * A.rx + dz * A.rz) < car.halfW - 0.05;     // (os pés já passaram da soleira)
        NpcArt.setClip(this._clipIds(), { x: car.position.x, z: car.position.z, fx: A.fx, fz: A.fz, hl: car.halfLen * 0.97, hw: car.halfW * 0.97, h: 1.6 * e * e * (3 - 2 * e), inside });
    }

    // ---------------------------------------------------------------- natação: começar/parar de nadar e MERGULHO
    // Nado normal = NADO PEITO na superfície (o corpo do "parado na água" puxando a água: entra e sai do vadear fundo sem tranco).
    // Com Shift = CRAWL: joga o corpo para a frente (swim_in) e, soltando, volta ao peito (swim_out) — transições animadas. Voltou ao
    // raso nadando crawl: volta ao peito e fica de pé (swim_out → swim_stand → wade_idle). Mergulhado, o fôlego (o mesmo da
    // corrida — Bags.stamina) vai acabando em Config.water.diveTime s; zerou: sobe sozinho, sem fôlego. (Shift mergulhado: a braçada
    // de peito acelera.)
    _updateSwim(dt, depth, sprint = false) {
        const was = this._wasSwim;
        this._wasSwim = this.swimming;
        if (this.diving && (!this.swimming || !this.alive || this.rag)) this.surface(false);
        if (this._plungeT > 0 && (this._plungeT -= dt) <= 0) this.surface(false);           // (entrou de cima: volta à tona sozinho)
        if (this.diving) {
            const max = this.staminaMax || 100, lvl = Bags.fitLevel(this.fit);
            this.stamina = Math.max(0, (this.stamina == null ? max : this.stamina) - max / (Config.water.diveTime * (1 + lvl * 0.03)) * dt);
            if (this.stamina <= 0) { this.winded = true; this.surface(true); }
        }
        if (!this.swimming) {
            // chegou ao raso nadando crawl: volta ao peito (swim_out) e fica de pé (swim_stand: os pés acham o fundo; anda só um pouco
            // — lock 0,2, como os outros golpes de uma vez). Sem o clipe (visual antigo, guardado no aparelho): direto ao wade_idle.
            const stand = () => { if (!this.swimming && this.depth > 0 && !this.rag && !this.action) this.playAction('swim_stand', { lock: 0.2, onDone: () => { this._wlEase = 1; } }); };
            if (was && this._crawl && depth > 0 && !this.action && !this.rag) this.playAction('swim_out', { lock: 0.9, onDone: stand });
            this._crawl = false; return;
        }
        if (this.action && this.action.name === 'swim_stand' && !this.rag) this.action = null;      // levado ao fundo no meio (andando não dá — ver canWade): nada de novo
        if (was === undefined || this.action || this.rag || this.diving) return;
        // a água passou do peito andando: mergulha no nado (wade_dive: impulso no fundo, o corpo deita na água e segue no nado peito)
        if (was === false && this.actor.sheet.getClip('wade_dive', 'none')) { this._crawl = false; this.playAction('wade_dive', { lock: 0.6 }); return; }
        // peito ↔ crawl (Shift): a passagem é animada; só troca de novo depois de terminar (sem pisca-pisca segurando/soltando)
        const crawl = sprint && this.speed > 0.6;
        if (crawl !== !!this._crawl && this.actor.sheet.getClip('swim_in', 'none')) {
            this._crawl = crawl;
            this.playAction(crawl ? 'swim_in' : 'swim_out', { lock: 1 });
        } else this._crawl = crawl;
    }
    // Afunda (Q nadando): o corpo inteiro vai para baixo d'água. Precisa de fôlego.
    dive() {
        if (!this.swimming || this.diving || this.rag || this.frozen || !this.actor.sheet.getClip('dive', 'none')) return false;
        if (this.winded || (this.stamina != null && this.stamina < (this.staminaMax || 100) * 0.15)) return false;
        this.diving = true;
        this.action = null;
        this._crawl = false;                                                    // (o mergulho sai do peito e volta a ele)
        this.playAction('dive_in', { lock: 0.6 });
        return true;
    }
    // Entered the water from above (the jump from the bridge): straight under — the dive loop, no dive_in — for `sec` s, then back up
    // (dive_out and the resurfacing splash).
    plunge(sec) {
        if (!this.actor.sheet.getClip('dive', 'none')) return false;
        this.diving = true;
        this.action = null;
        this._crawl = false;
        this._plungeT = sec;
        return true;
    }
    // Volta à tona (Q de novo, o fôlego acabou ou chegou ao raso). breathless: subiu porque o ar acabou (o jogo avisa).
    surface(breathless = false) {
        if (!this.diving) return false;
        this.diving = false;
        this._plungeT = 0;
        this._surfaced = breathless ? 'breathless' : 'ok';                         // (o Game lê: respingo e aviso — _updateWater)
        if (this.swimming && !this.rag) { this.action = null; this._crawl = false; this.playAction('dive_out', { lock: 0.6 }); }
        return true;
    }

    // Toca um clipe de ação até o fim. lock: fração do movimento permitida (0 = travado).
    playAction(name, { lock = 0.2, weapon = 'none', onDone = null, holdAim = false, yank = null } = {}) {
        if (!this.actor.play(name, weapon, { restart: true })) return false;
        this.action = { name, lock, onDone, holdAim, yank };
        this.state = name;
        return true;
    }

    // Golpe principal conforme a arma na mão: combo de mãos (soco + soco + chute), taco ou tiro.
    // Retorna o nome da ação iniciada ('punch' | 'punchL' | 'kick' | 'swing' | 'shoot') ou null.
    // force: permite reiniciar o clipe de tiro (rajada de SMG) mesmo ocupado atirando.
    primary(force = false) {
        if (this.busy && !(force && this.action.name === 'shoot')) return null;
        const w = this.weapon, look = this.look;
        let ok;
        if (look === 'knife' && this.actor.sheet.getClip('stab', 'knife')) {      // faca: a facada (Melee.stab)
            ok = this.playAction('stab', { lock: 0.35, weapon: 'knife' });
        } else if (look === 'none' || look === 'knife') {           // punhos (e a faca sem o desenho novo): COMBO soco esquerdo → soco direito → chute
            const now = performance.now() / 1000;
            if (now - (this._comboEnd || 0) > Player.COMBO_GAP) this._combo = 0;     // demorou: recomeça do 1º soco
            const name = Player.COMBO[this._combo % Player.COMBO.length];
            ok = this.playAction(name, { lock: name === 'kick' ? 0.2 : 0.25, onDone: () => { this._comboEnd = performance.now() / 1000; } });
            if (ok) this._combo = (this._combo + 1) % Player.COMBO.length;
        } else if (w === 'bat') {
            ok = this.playAction('swing', { lock: 0.3, weapon: w });
        } else {
            // Andando, o tiro NÃO troca o desenho: as pernas seguem no passo (frente/trás/lado — ver update) e o clarão sai na arma
            // (SparkFx). A ação dura o mesmo que o clipe de tiro e termina pelo tempo.
            const sc = this.actor.sheet.getClip('shoot', look), dur = sc ? sc.frames / sc.fps : 0.25;
            if (sc && sc.loop && this.action && this.action.name === 'shoot') {     // minigun: o clipe de tiro (canos girando) segue em loop
                this.action.timer = Math.max(this.action.timer || 0, 0.18);
                return 'shoot';
            }
            if (this.speed >= 0.6 && !this.swimming) {
                this.action = { name: 'shoot', lock: 0.6, onDone: null, holdAim: true, yank: null, timer: dur, moving: true };
                this.actor.done = false;                                               // (o fim é pelo tempo: o "acabou" do tiro anterior não vale)
                this.state = 'shoot';
                ok = true;
            } else {
                ok = this.playAction('shoot', { lock: 0.6, weapon: look, holdAim: true });
                if (ok) this.action.timer = dur;
                if (ok && this.crouched && !this.swimming) this.actor.play('crouch_shoot', look, { restart: true });      // agachado: atira ajoelhado (por cima da mureta)
            }
        }
        return ok ? this.action.name : null;
    }

    // Arma pesada na mão (RPG, lança-foguetes, minigun): fator da velocidade a pé (Weapons[...].heavy).
    get heavyMul() { const W = Weapons[this.weapon]; return (W && W.heavy) || 1; }

    // Arma desenhada na mão (as armas novas reaproveitam o desenho de pistola/SMG).
    get look() {
        if (this.weapon === 'none') return 'none';
        const W = Weapons[this.weapon];
        return (W && W.look) || this.weapon;
    }

    // Troca de arma: saca (com animação) ou guarda.
    equip(kind) {
        if (this.busy || kind === this.weapon) return false;
        this.weapon = kind;
        const look = this.look;
        if (look === 'none' || look === 'bat') return true;
        return this.playAction('draw', { lock: 0.5, weapon: look, holdAim: true });
    }

    // "Vasculhar o inventário" (animação do menu de inventário). lock 0 = parado enquanto vasculha.
    rummage(seconds = 1.4, lock = 0.6) {
        if (this.busy) return false;
        const ok = this.playAction('rummage', { lock });
        if (ok) this.action.timer = seconds;
        return ok;
    }

    // Furto: vira para o alvo e dá a carteirada; no quadro do "pega" chama onGrab (quem decide se deu certo é o Game).
    pickpocket(targetPos, onGrab) {
        if (this.busy) return false;
        this.root.rotation.y = Math.atan2(targetPos.x - this.position.x, targetPos.z - this.position.z);
        this.velocity.setAll(0);
        return this.playAction('pickpocket', { lock: 0.1, yank: onGrab });
    }

    // Interrompe a ação atual (ex.: fechar o inventário).
    cancelAction() {
        this.action = null;
    }

    // Roubo de carro: encara o carro, puxa a porta (no meio do puxão, `onYank` arranca o motorista) e entra.
    // onDone = carro entrou.
    // skipEnter: não toca a animação de entrar no carro (usada ao derrubar um motoqueiro: depois vem a subida na moto).
    startCarjack(carPos, onDone, onYank = null, skipEnter = false) {
        if (this.busy) return false;
        const dx = carPos.x - this.position.x, dz = carPos.z - this.position.z;
        this.root.rotation.y = Math.atan2(dx, dz);
        this.velocity.setAll(0);
        return this.playAction('carjack', {
            lock: 0, yank: onYank,
            onDone: () => { if (skipEnter) onDone(); else this.playAction('enter', { lock: 0, onDone }); },
        });
    }

    // Subir numa bicicleta/moto: vai para o lugar dela e passa a perna por cima (clipe `mount`, quadro maior com o
    // veículo desenhado junto). side: -1 esquerda / +1 direita (de onde o jogador chegou).
    startMount(kind, bikePos, bikeHeading, side, onDone) {
        if (this.busy) return false;
        // (2,5D: o clipe mount está na própria folha do jogador, com o visual dele; o boneco antigo usa a folha do piloto)
        if (!this.actor.sheet.isNpc) { this._baseSheet = this.actor.sheet; this.actor.useSheet(this.lib.sheets.rider); }
        this.root.position.set(bikePos.x, 0, bikePos.z);
        this.root.rotation.y = bikeHeading;
        this.actor._dirD = 0;                    // (sem a histerese: a direção desenhada mais perto do rumo da moto — o recorte do clipe conta com ela)
        this.velocity.setAll(0);
        const ok = this.playAction('mount', {
            weapon: side < 0 ? kind + 'L' : kind, lock: 0,
            onDone: () => { this.endMount(); onDone(); },
        });
        if (!ok) this.endMount();
        return ok;
    }

    // Volta ao sprite normal do jogador (depois de subir na moto, ou ao cancelar).
    endMount() {
        if (this._baseSheet) { this.actor.useSheet(this._baseSheet); this._baseSheet = null; }
    }

    // ----------------------------------------------------------------- loop
    // moveDir: BABYLON.Vector3 já no espaço de mundo, normalizado (ou zero).
    update(moveDir, sprinting, dt) {
        // Arremessado: sem controle; o Ragdoll comanda posição, giro e sprite.
        if (this.rag) {
            this.rag.update(dt);
            this.velocity.setAll(0); this.speed = 0;
            this.state = 'ragdoll';
            return;
        }
        // Treinando na academia (minigames/Gym.js): parado no aparelho; o mini-game comanda o quadro do sprite.
        if (this.gym) { this.velocity.setAll(0); this.speed = 0; this.state = 'gym'; this._syncSprite(); return; }
        this._updateCarClip(dt);
        // Dentro do carro (esperando a porta fechar): parado e invisível.
        if (this.frozen) {
            Bags.stamina(this, false, false, dt);                                   // (sentado no carro: recupera o fôlego)
            this.velocity.setAll(0); this.speed = 0;
            this._syncSprite();
            this.actor.update(dt);                                                  // (o clipe segue: morto, o corpo cai até deitar no chão)
            return;
        }
        if (this._rollCd > 0) this._rollCd -= dt;
        if (this.roll) { Bags.stamina(this, false, true, dt); this._updateRoll(dt); return; }
        // Fim de ação?
        let lock = 1;
        if (this.action) {
            const a = this.action;
            lock = a.lock;
            if (a.yank && this.actor.phase >= (Player.YANK[a.name] || 0.5)) { const y = a.yank; a.yank = null; y(); }    // meio do puxão do roubo (Player.YANK)
            if (a.timer !== undefined) { a.timer -= dt; if (a.timer <= 0) this.actor.done = true; }
            if (this.actor.done) {
                this.action = null;
                lock = 1;
                this.aimTimer = a.holdAim ? 1.4 : 0;
                if (a.onDone) a.onDone();
            }
        }
        if (this.aimTimer > 0) this.aimTimer -= dt;

        // Deslize até a porta do carro (passo `glide` de uma sequência).
        if (this._glide) {
            const g = this._glide;
            if (!this.action) { this._glide = null; this.actor.mesh.position.y = this.baseY; }
            else {
                g.t = Math.min(1, g.t + dt / g.dur);
                const e = g.t * g.t * (3 - 2 * g.t);
                const to = g.to();
                this.root.position.x = g.x0 + (to.x - g.x0) * e;
                this.root.position.z = g.z0 + (to.z - g.z0) * e;
                if (g.arc) this.actor.mesh.position.y = this.baseY + g.arc * Math.sin(Math.PI * g.t);      // arco do pulo
                if (g.t >= 1) { this._glide = null; this.actor.mesh.position.y = this.baseY; }
            }
        }

        // Indo até a cobertura (Q perto de um muro, caçamba ou carro): desliza rápido até encostar nela, já agachando.
        if (this.coverSnap) {
            const s = this.coverSnap, p = this.root.position;
            s.t = Math.min(1, s.t + dt / s.dur);
            const e = s.t * (2 - s.t);
            p.x = s.x0 + (s.x - s.x0) * e; p.z = s.z0 + (s.z - s.z0) * e;
            MapGeo.resolveCircle(p, Config.player.radius, this.underBridge);
            if (s.t >= 1 || !this.crouched) { this.coverSnap = null; this._coverT = 0; }
            moveDir = Player.ZERO;
        }

        // Mirando (Aim): não corre e anda devagar, de frente para a mira (pode andar de lado/de costas).
        const aiming = this.aimHeading != null;
        if (aiming) { sprinting = false; this.aimTimer = Math.max(this.aimTimer, 0.3); }
        // Colado na cobertura: o direcional só desliza ao longo dela (ver _coverMove).
        if (this.coverLock && this.crouched && !this.coverSnap) { moveDir = this._coverMove(moveDir, dt); if (this.coverLock) sprinting = false; }

        // Agachado: correr levanta; parado/andando, a cobertura ao lado é reconferida (andar ao longo do muro segue nela).
        if (this.crouched && sprinting && moveDir.lengthSquared() > 1e-4) this.setCrouch(false);
        if (this.crouched) {
            this._coverT -= dt;
            if (this._coverT <= 0) { this._coverT = 0.12; this.cover = typeof Cover !== 'undefined' ? Cover.find(this.root.position.x, this.root.position.z) : null; }
            sprinting = false;
        }
        // Fôlego: só corre enquanto tiver (e sem sobrecarga de peso). Ver Bags.stamina. Mergulhado, não recupera (gasta: _updateDive).
        if (this.diving) this._rest = 0;
        sprinting = Bags.stamina(this, sprinting, lock > 0 && moveDir.lengthSquared() > 1e-4, dt);

        // Na água: raso (0 a wadeDepth m da margem) = anda devagar, cada vez mais; fundo = nada (ainda mais devagar).
        // (sob a ponte o tabuleiro não é chão: vale a água de baixo — ver _updateLevel)
        const W = Config.water, depth = this.underBridge ? MapGeo.waterDepthBelow(this.root.position.x, this.root.position.z) : MapGeo.waterDepth(this.root.position.x, this.root.position.z);
        this.depth = depth;
        this.swimming = depth > W.wadeDepth;
        if (this.crouched && depth > 0) this.setCrouch(false);                     // (na água não dá para agachar)
        this._updateSwim(dt, depth, sprinting);
        // vadeando: a água sobe da canela (na beira) à cintura (perto de nadar) — o desenho afunda até ali (SpriteActor.setWaterline)
        // (nos clipes de começar/parar de nadar e de mergulhar a água já vem desenhada)
        const wetClip = this.action && /^(swim_|dive)/.test(this.action.name);
        this.waterline = depth > 0 && !this.swimming && !wetClip ? 0.25 + 0.75 * Math.min(1, depth / W.wadeDepth) : 0;
        // acabou o swim_stand: a água desenhada nele está a 1 m do corpo; a do jogo desce até a daqui em 0,4 s (sem degrau na linha)
        if (this._wlEase > 0) { if (this.waterline > 0) this.waterline += (1 - this.waterline) * this._wlEase; this._wlEase = Math.max(0, this._wlEase - dt / 0.4); }
        this.actor.setWaterline(this.waterline);
        const wf = depth <= 0 || this.swimming ? 1 : 0.85 - 0.4 * (depth / W.wadeDepth);
        // nadando: peito (normal), crawl (Shift: puxa da corrida e cansa como ela), mergulho (Shift: braçada mais forte)
        const walkV = Config.player.maxSpeed * (1 + Outfit.m.walk) * Physique.speedMul();      // (físico: gordo anda mais devagar)
        const swimV = !this.swimming ? 0 : this.diving ? walkV * (sprinting ? W.diveFast : W.dive)
            : sprinting ? Math.max(walkV * W.crawlMin, Bags.runSpeed(this) * W.crawl) : walkV * W.breast;
        // Relevo: subir qualquer encosta pode, mas devagar (MapGeo.slopeSpeed) — e o desenho troca para subindo/escalando
        // (SpriteActor.setSlope). Inclinação medida na direção do movimento e suavizada (sem tranco de célula em célula).
        const onGround = depth <= 0 && !this.onDeck && !this.underBridge && !(typeof HouseView !== 'undefined' && HouseView.inside);
        const g = onGround && moveDir.lengthSquared() > 1e-4 ? MapGeo.slopeAlong(this.root.position.x, this.root.position.z, moveDir.x, moveDir.z) : 0;
        this.slope = (this.slope || 0) + (g - (this.slope || 0)) * Math.min(1, dt * 6);
        this.actor.setSlope(this.speed > 0.3 ? this.slope : 0);
        const maxSpeed = (this.swimming ? swimV : (sprinting && depth <= 0) ? Bags.runSpeed(this) : walkV) * lock * wf * (depth > 0 ? 1 + (SkillTree.m.swim || 0) : 1) * (this.loadMul || 1) * (this.winded ? 0.88 : 1) * (aiming ? (this.aimFree ? 0.85 : 0.6) : 1) * (this.crouched ? Config.tactics.sneakSpeed : 1) * MapGeo.slopeSpeed(this.slope) * (this.swimming ? 1 : this.heavyMul);      // Outfit: tênis/roupa (ver Outfit) | loadMul: peso carregado (Bags) | sem fôlego: arrasta o passo | mirando: devagar | relevo

        // Acelera/desacelera rumo à velocidade alvo (frame-independent): na água embala e desliza; em terra, inércia e derrapagem.
        if (depth > 0) {
            const t = 1 - Math.exp(-(this.swimming ? W.accel : Config.player.accel * 0.5) * dt);
            this.velocity = BABYLON.Vector3.Lerp(this.velocity, moveDir.scale(maxSpeed), t);
            this.skidding = false;
            this._steered = false;                                                  // (na água o corpo vira para onde nada — o giro abaixo; o de terra não roda aqui)
        } else this._landVelocity(moveDir, maxSpeed, dt, aiming || !!this.coverLock || !!this.action);
        if (this.velocity.lengthSquared() < 1e-4) this.velocity.setAll(0);

        // Integra posição, mas confinado à terra (desliza na beira da água). Na água, as ondas levam junto (Waves.current: vai e volta
        // com cada onda; na beira, a onda empurra para a areia e a ressaca puxa); mergulhado, bem menos. (Não muda a velocidade
        // própria: a animação segue a braçada.)
        const prev = this.root.position;
        let wx = 0, wz = 0;
        if (depth > 0 && !this.onDeck && !this._glide && typeof Waves !== 'undefined') {
            const c = Waves.current(prev.x, prev.z, depth, this._wc || (this._wc = {})), k = this.diving ? 0.3 : 1;
            wx = c.x * k; wz = c.z * k;
        }
        const nx = prev.x + (this.velocity.x + wx) * dt;
        const nz = prev.z + (this.velocity.z + wz) * dt;
        // ficando de pé no raso (swim_stand): os pés já acharam o fundo — não volta a nadar no meio do clipe (ele não tem volta)
        const standing = this.action && this.action.name === 'swim_stand' && !this.underBridge;
        const canWade = (x, z) => MapGeo.canWade(x, z) && !(standing && MapGeo.waterDepth(x, z) > W.wadeDepth);
        if (canWade(nx, nz)) {
            prev.x = nx; prev.z = nz;
        } else if (canWade(nx, prev.z)) {
            prev.x = nx; this.velocity.z = 0;
        } else if (canWade(prev.x, nz)) {
            prev.z = nz; this.velocity.x = 0;
        } else {
            this.velocity.setAll(0);
        }
        if (this.onDeck) this._clampToDeck(prev);                           // no viaduto: só as muretas (o que há lá embaixo não bate)
        else if (!this._glide) MapGeo.resolveCircle(prev, Config.player.radius, this.underBridge || depth > 0);   // não atravessa prédios (no pulo, passa por cima); na água, passa sob a mureta da ponte
        if (this.coverLock && this.crouched && !this.coverSnap) this._coverStick(dt);       // (encostado: mantém a distância da superfície)
        this._updateLevel();
        this.speed = this.velocity.length();

        // Gira o corpo em direção ao movimento (menor caminho angular) — só fora de ações. Mirando: sempre para a mira (até atirando).
        if (aiming && (!this.action || this.action.name === 'shoot' || this.action.name === 'draw')) {
            this.root.rotation.y = this._lerpAngle(this.root.rotation.y, this.aimHeading, 1 - Math.exp(-22 * dt));
        } else if (!this.action && !this._steered && moveDir.lengthSquared() > 1e-4) {      // (em terra o _landVelocity já virou o corpo)
            const targetY = Math.atan2(moveDir.x, moveDir.z);
            const rt = 1 - Math.exp(-Config.player.turnLerp * (this.swimming ? W.turn : 1) * dt);
            this.root.rotation.y = this._lerpAngle(this.root.rotation.y, targetY, rt);
        } else if (!this.action && this.coverLock && this.cover && !this.coverSnap) {
            // parado na cobertura: de costas para ela (de frente para fora)
            this.root.rotation.y = this._lerpAngle(this.root.rotation.y, Math.atan2(this.cover.nx, this.cover.nz), 1 - Math.exp(-10 * dt));
        }

        // Animação de locomoção (ações já controlam o próprio clipe).
        let rate = 1;
        // Atirando: andando, as pernas seguem (frente, trás, lado; agachado, o andar agachado); parou no meio, a pose de mirar.
        if (this.action && this.action.name === 'shoot' && !this.swimming) {
            const w = this.look, base = Math.max(0.5, this.speed / (Config.anim.walk * Config.player.stride));
            if (this.speed >= 0.3) {
                if (this.crouched && !this.inCover && this.actor.play('sneak', w)) rate = (Math.cos(this._relMove()) < -0.5 ? -1 : 1) * base / 0.72;
                else rate = this._aimGait(w, base);
            } else if (this.actor.clipName !== 'shoot' && this.actor.clipName !== 'crouch_shoot') {
                if (!(this.crouched && this.actor.play('crouch_aim', w))) this.actor.play(this.crouched && !this.inCover && this.actor.sheet.getClip('crouch', w) ? 'crouch' : 'aim', w);
            }
            this._syncSprite(); this.actor.update(dt, rate); return;
        }
        if (!this.action) {
            const w = this.look;
            let clip;
            // Na água o ritmo da braçada/passada acompanha a velocidade e muda devagar (_wRate): acelerar e parar ficam suaves.
            const wRate = (want) => { this._wRate = this._wRate == null ? want : this._wRate + (want - this._wRate) * (1 - Math.exp(-4 * dt)); return this._wRate; };
            if (this.swimming && this.diving && this.actor.play('dive', 'none')) {      // mergulhado: nado peito debaixo d'água (Shift: mais forte)
                this.state = 'dive';
                rate = wRate(this.speed < 0.3 ? 0.4 : Math.max(0.55, Math.min(1.7, this.speed / 1.6)));
                this._syncSprite();
                this.actor.update(dt, rate);
                return;
            }
            if (this.swimming) {
                this.state = 'swim';
                if (this._crawl && this.speed >= 0.3) { this.actor.play('swim', 'none'); rate = wRate(Math.max(0.6, Math.min(1.45, this.speed / 3.0))); }      // crawl (Shift)
                else if (this.speed >= 0.3 && this.actor.play('swim_breast', 'none')) rate = wRate(Math.max(0.55, Math.min(1.5, this.speed / 1.8)));      // nado peito
                else if (this.speed < 0.3 && this.actor.play('swim_idle', 'none')) rate = wRate(1);                                                          // parado: bate as pernas no lugar
                else { this.actor.play('swim', 'none'); rate = wRate(this.speed < 0.3 ? 0.35 : Math.max(0.6, this.speed / 1.4)); }
                this._syncSprite();
                this.actor.update(dt, rate);
                return;
            }
            if (depth > 0) {                                      // vadeando: passos lentos e pesados; acima da metade do corpo, braços puxando a água
                const deep = depth >= W.wadeDepth * W.deepWade, moving = this.speed >= 0.3;
                this.state = moving ? 'wade' : 'idle';
                if (deep && this.actor.play(moving ? 'wade' : 'wade_idle', 'none')) rate = wRate(moving ? Math.max(0.45, this.speed / (Config.anim.walk * Config.player.stride * 0.54)) : 1);   // (passada do `wade`: 0,54 da do andar, medida)
                else { this.actor.play(moving ? 'walk' : 'idle', w); rate = wRate(moving ? Math.max(0.4, this.speed / (Config.anim.walk * Config.player.stride)) * 0.9 : 1); }
                this._syncSprite();
                this.actor.update(dt, rate);
                return;
            }
            this._wRate = null;
            const gun = Player.GUN_LOOKS.has(w);
            // Agachado (furtivo / cobertura): andando, o passo furtivo; parado, mirando = ajoelhado com a arma no ombro (crouch_aim);
            // encostado na cobertura = ajoelhado de costas para ela, a mão na mureta (cover); senão, agachado. (Sem esses clipes no
            // atlas: mirando em cobertura ele levanta para atirar por cima — o desenho de pé, abaixo.)
            const kneel = this.crouched && this.speed < 0.3 && (gun && aiming ? this.actor.play('crouch_aim', w) : this.inCover && (this.actor.play('cover', w) || this.actor.play('cover', 'none')));
            if (kneel) { this.state = aiming ? 'aim' : 'crouch'; this._syncSprite(); this.actor.update(dt, 1); return; }
            if (this.crouched && !(aiming && this.inCover)) {
                const moving = this.speed >= 0.3, cn = moving ? 'sneak' : 'crouch';
                if (this.actor.play(cn, w) || this.actor.play(cn, 'none')) {
                    this.state = moving ? 'sneak' : 'crouch';
                    rate = moving ? Math.max(0.4, this.speed / (Config.anim.walk * Config.player.stride * 0.72)) : 1;      // (passada agachada: 0,72)
                    if (moving && gun && aiming && Math.cos(this._relMove()) < -0.5) rate = -rate;                         // (mirando para trás: passos ao contrário)
                    this._syncSprite(); this.actor.update(dt, rate); return;
                }
            }
            if (this.speed < 0.3) {
                clip = (this.aimTimer > 0 && gun) ? 'aim' : 'idle';
                this.state = 'idle';
            } else if (gun && (aiming || this.aimTimer > 0) && !sprinting) {
                // De frente para a mira: para a frente, para trás ou de lado (passo lateral), no ritmo da velocidade.
                this.state = 'walk';
                rate = this._aimGait(w, Math.max(0.5, this.speed / (Config.anim.walk * Config.player.stride)));
                this._syncSprite(); this.actor.update(dt, rate); return;
            } else if (this._running(walkV)) {
                clip = 'run';
                this.state = 'sprint';
                rate = Math.max(0.5, this.speed / (Config.anim.run * Config.player.stride));                 // (ritmo pela velocidade: pés plantados — Config.anim)
            } else {
                clip = 'walk';
                this.state = 'walk';
                rate = Math.max(0.5, this.speed / (Config.anim.walk * Config.player.stride));
            }
            // Anunciando um assalto (arma apontada, a outra mão pedindo "passa tudo") — só existe no personagem 2,5D.
            if (this.holdingUp && clip !== 'walk' && clip !== 'run' && w !== 'none' && w !== 'bat' && this.actor.play('holdup', w)) { this._syncSprite(); this.actor.update(dt, rate); return; }
            // Carregando peso (Bags): bolsa/maleta/mala na mão, mala puxada nas rodinhas, ou andar curvado de sobrecarga.
            const cw = Bags.clipFor(this, clip, w);
            if (cw && this.actor.play(cw[0], cw[1])) { this._syncSprite(); this.actor.update(dt, cw[0] === 'walk_heavy' ? rate / 0.55 : rate); return; }      // (walk_heavy: passada 0,55 × a do andar)
            this.actor.play(clip, w);
        }

        if (this.action && this.action.rate) rate = this.action.rate;            // (passo `fit` de uma sequência: o clipe acompanha o timer)
        this._syncSprite();
        this.actor.update(dt, rate);
    }

    // Land locomotion with heavy steps: the body turns toward the stick at a speed-limited rate (quick pivot standing, wide turns at a
    // sprint) and the velocity always points where the body faces — no sideways drift. Speed builds up at moveAccel and drops at
    // stopDecel (a couple of planted steps, no slide); while still turning, less of it (cos of what is left to turn). Running and
    // reversing (cos of facing → stick ≤ skidDot): skid — hard braking along the facing without turning, then the pivot.
    // `free`: aiming, glued to cover or in an action — the old free approach (strafing, sliding along the cover).
    _landVelocity(moveDir, maxSpeed, dt, free) {
        const P = Config.player, v = this.velocity, inputLen = Math.hypot(moveDir.x, moveDir.z), hasInput = inputLen > 1e-2;
        this._steered = !free;                                                  // (on land this owns the body's heading, skid included)
        if (free) {
            this.skidding = false;
            const t = 1 - Math.exp(-P.accel * dt);
            v.x += (moveDir.x * maxSpeed - v.x) * t;
            v.z += (moveDir.z * maxSpeed - v.z) * t;
            return;
        }
        let heading = this.root.rotation.y, speed = Math.hypot(v.x, v.z), target = 0, decel = P.stopDecel;
        if (this.skidding) {
            decel = P.skidFriction;
            if (speed <= P.skidExitSpeed) this.skidding = false;
        } else if (hasInput) {
            const diff = this._wrapAngle(Math.atan2(moveDir.x, moveDir.z) - heading);
            if (maxSpeed > 0 && speed >= P.skidMinSpeed && Math.cos(diff) <= P.skidDot) { this.skidding = true; decel = P.skidFriction; }
            else {
                const k = Math.max(0, Math.min(1, (speed - 3) / 7)), rate = P.turnRateWalk + (P.turnRateSprint - P.turnRateWalk) * k;
                const turn = Math.max(-rate * dt, Math.min(rate * dt, diff));
                heading += turn;
                target = maxSpeed * Math.max(0, Math.cos(diff - turn)) ** 0.6 * Math.min(1, inputLen);
            }
        }
        speed = target > speed ? Math.min(target, speed + P.moveAccel * dt) : Math.max(target, speed - decel * dt);
        this.root.rotation.y = heading;
        v.x = Math.sin(heading) * speed;
        v.z = Math.cos(heading) * speed;
    }
    _wrapAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

    // Run or walk clip by the ACTUAL speed, not the sprint button (hysteresis): releasing sprint he keeps the running stride while
    // decelerating, and skidding keeps the running legs slowing down with the speed.
    _running(walkSpeed) {
        const P = Config.player;
        this._run = this.skidding || this.speed > walkSpeed * (this._run ? P.runExit : P.runEnter);
        return this._run;
    }

    _syncSprite() {
        const p = this.root.position;
        // nadando (na superfície): o desenho sobe e desce com a onda (Waves.lift: a altura vira deslocamento para cima da TELA)
        const b = this.swimming && !this.diving && typeof Waves !== 'undefined' ? Waves.lift(p.x, p.z, this.depth || 0) : 0, yaw = b ? CompassCamera.yaw || 0 : 0;
        this.actor.setPosition(p.x + Math.sin(yaw) * b, p.z + Math.cos(yaw) * b);
        this.actor.setHeading(this.root.rotation.y);
        if (Interiors.active) { this.actor.mesh.computeWorldMatrix(true); this.actor.mesh.refreshBoundingInfo(); }      // (no palco das lojas o volume antigo ficava longe: o sprite sumia)
    }

    // Interpola ângulos pelo caminho mais curto (evita giro de 360°).
    _lerpAngle(a, b, t) {
        let d = (b - a) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        return a + d * t;
    }

    get position() {
        return this.root.position;
    }

    setVisible(v) {
        this.actor.setVisible(v);
    }

    // ---------------------------------------------------------------- andar de cima / de baixo
    // O mundo é plano (2D): "estar em cima" do viaduto ou "embaixo" de uma ponte é só um estado, que decide a altura do desenho,
    // com o que se bate e se o furo (RevealPlugin) se abre — ele só abre quando há algo ACIMA do personagem.
    //   onDeck       no tabuleiro do viaduto: entra pelo pé da rampa andando ao longo da via e fica até sair pela outra ponta.
    //                (com `roof` = um heliponto de Rooftops: na escada externa ou no telhado do prédio — sai descendo pelo pé da escada)
    //   underBridge  sob uma ponte cidade ↔ ilha: chegou à área do tabuleiro sem ser pela pista (nadando, no raso ou pela margem) e fica
    //                até sair dela.
    get baseY() { return this.underBridge ? 0.1 : 0.5 + (this.deckH || 0); }

    // Altura do furo: a CABEÇA (a pé, a mureta ao lado não abre furo); sob a ponte, abaixo do tabuleiro.
    get revealY() { return this.underBridge ? 0.1 : this.baseY + 1.2; }

    _updateLevel() {
        const p = this.root.position, wasY = this.baseY;
        // Ponte sobre a água: chegou à área do tabuleiro pela PISTA (rua, calçada) = em cima dela; por qualquer outro lado (nadando,
        // pela água rasa ou andando pela margem/areia que passa por baixo) = embaixo, até sair da área.
        const onB = RoadPlan.onBridge(p.x, p.z);
        if (!onB) this.underBridge = false;
        else if (!this.underBridge && this._fromBelow) this.underBridge = true;
        if (!onB) this._fromBelow = MapGeo.waterDepth(p.x, p.z) > 0 || !RoadPlan.onPavement(p.x, p.z, 1.5);

        // Escada externa do heliponto (Rooftops): entra pelo pé andando para ela; daí, a altura é a do degrau / telhado.
        if (this.roof) this.deckH = Rooftops.heightAt(this.roof, p.x, p.z);
        else if (!this.onDeck && !this.underBridge && this.speed > 0.3 && typeof Rooftops !== 'undefined') {
            const r = Rooftops.entry(p.x, p.z, this.velocity.x, this.velocity.z);
            if (r) { this.roof = r; this._roofLast = { x: p.x, z: p.z }; this.onDeck = true; this.deckH = Rooftops.heightAt(r, p.x, p.z); }
        }
        if (!this.roof && RoadPlan.viaducts && RoadPlan.viaducts.length) {
            if (this.onDeck) {
                this.deckH = RoadPlan.elevAt(p.x, p.z);
                if (this.deckH <= 0) { this.onDeck = false; this.deckH = 0; }
            } else if (this.speed > 0.3 && !this.underBridge) {
                const e = RoadPlan.elevAt(p.x, p.z, this.velocity.x, this.velocity.z);
                if (e > 0 && e < 1.2) { this.onDeck = true; this.deckH = e; }       // só pelo PÉ da rampa (embaixo do tabuleiro não sobe)
            }
        }
        if (this.baseY !== wasY && !this._glide && !this.rag) this.actor.mesh.position.y = this.baseY;
        // No viaduto o sprite vai para a camada 1, junto do tabuleiro (as estruturas 'x' de lá cobrem a camada 0 inteira): desenha
        // depois dele e, estando mais alto, passa no teste de profundidade — como os carros que andam lá em cima.
        const group = this.onDeck || this.actor.mesh._ysort ? 1 : 0;                   // (personagem 2,5D: sempre no grupo 1 — ver NpcArt.init)
        if (this.actor.mesh.renderingGroupId !== group) {
            this.actor.mesh.renderingGroupId = group;
            for (const m of this.actor.mesh.getChildMeshes()) m.renderingGroupId = group;
        }
    }

    // No tabuleiro do viaduto: as muretas seguram de lado (largura da pista).
    _clampToDeck(p) {
        if (this.roof) {                                                    // escada / telhado do heliponto (desceu pelo pé: volta ao chão)
            if (!Rooftops.clamp(this.roof, this._roofLast, p, Config.player.radius)) { this.roof = null; this.onDeck = false; this.deckH = 0; }
            return;
        }
        const r = Config.player.radius + 0.2;
        for (const e of RoadPlan.viaducts) {
            if (!e.v) continue;
            const z0 = Math.min(e.a.z, e.b.z), z1 = Math.max(e.a.z, e.b.z);
            if (p.z < z0 || p.z > z1) continue;
            const hw = e.w / 2 - r, cx = e.a.x;
            if (p.x < cx - hw) { p.x = cx - hw; this.velocity.x = 0; }
            else if (p.x > cx + hw) { p.x = cx + hw; this.velocity.x = 0; }
            return;
        }
    }

    teleport(pos) {
        this.cancelSequence();
        this.resetTactics();
        this.onDeck = false; this.deckH = 0; this.underBridge = false; this._fromBelow = false; this.roof = null;
        this.diving = false; this._wasSwim = undefined;                // (sem mergulho nem "começar a nadar" de um teleporte)
        if (this.frozen) { this.frozen = false; this.actor.setVisible(true); }
        this.root.position.copyFrom(pos);
        if (!MapGeo.canWade(pos.x, pos.z)) {                       // (largado no mar aberto, longe da margem: leva para o ponto mais próximo onde dá para estar a pé)
            for (let r = 12; r <= 900; r += 12) {
                let hit = null;
                for (let a = 0; a < 16 && !hit; a++) { const x = pos.x + Math.cos(a * Math.PI / 8) * r, z = pos.z + Math.sin(a * Math.PI / 8) * r; if (MapGeo.canWade(x, z)) hit = [x, z]; }
                if (hit) { this.root.position.x = hit[0]; this.root.position.z = hit[1]; break; }
            }
        }
        this.velocity.setAll(0);
        this.action = null;
        this.rag = null;
        this.endMount();
        this.actor.mesh.position.y = this.baseY;
        this._syncSprite();
        this.actor.mesh.computeWorldMatrix(true); this.actor.mesh.refreshBoundingInfo();             // o sprite não sincroniza o volume sozinho: após um salto longo (loja, safe house) o culling o esconderia
    }
}

// Combo de mãos (punhos e faca): cada clique/Espaço/RT solta o próximo golpe; parado mais que COMBO_GAP s depois de um golpe,
// recomeça do 1º. O chute fecha o combo (derruba — ver Melee.kick).
Player.COMBO = ['punchL', 'punch', 'kick'];
Player.COMBO_GAP = 0.6;
// Puxão (yank) de uma ação: a FASE do clipe (0..1, vale para qualquer nº de quadros) em que o gesto acontece. Padrão 0,5 = o antigo
// "quadro 3 de 6": carjack (as duas mãos agarraram o motorista, logo antes de jogar o corpo para trás), pickpocket (a mão no bolso:
// pegou), enter. opendoor: 3 de 5 (puxou a porta: a moto tombada sobe). punch (quebrar o vidro): o punho esticado (0,17 s de 0,43).
Player.YANK = { opendoor: 0.6, punch: 0.4 };
// Desenhos de arma de fogo com pose de mirar / passo lateral (o revólver usa o da pistola; fuzil e AK, o da SMG).
Player.GUN_LOOKS = new Set(['pistol', 'smg', 'shotgun', 'pistol_sil', 'rpg', 'launcher', 'minigun']);

Player.ZERO = new BABYLON.Vector3(0, 0, 0);          // (só leitura: "sem movimento" sem alocar)
