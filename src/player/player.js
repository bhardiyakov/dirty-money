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
        if (!on) this.cover = null;
        else this.cover = typeof Cover !== 'undefined' ? Cover.find(this.position.x, this.position.z) : null;
    }

    resetTactics() { this.roll = null; this.crouched = false; this.cover = null; this.coverSnap = null; }

    // Rolamento na direção (dx, dz) (normalizada). false se não dá agora (ocupado, na água, recarregando o fôlego do último).
    startRoll(dx, dz) {
        const T = Config.tactics;
        if (this.busy || this.swimming || (this.depth || 0) > 0 || this._rollCd > 0 || this.winded) return false;
        if (this.stamina != null) { if (this.stamina < T.rollStamina * 0.5) return false; this.stamina = Math.max(0, this.stamina - T.rollStamina); }
        const l = Math.hypot(dx, dz) || 1;
        this.roll = { t: 0, dx: dx / l, dz: dz / l, heading: Math.atan2(dx, dz) };
        this.crouched = false; this.cover = null;
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
        if (a > 0.87 && a < 2.27 && this.actor.play('strafe', w)) return (rel > 0 ? 1 : -1) * base / 0.7;      // (passo lateral: passada 0,7)
        this.actor.play('walk', w);
        return a >= 2.27 ? -base : base;
    }

    // Sequência de ações encadeadas (entrar/roubar um carro). Cada passo:
    //   { clip, weapon?, timer?, glide?:{x,z}, yank?, onStart? }
    // clip: clipe tocado (sem timer, até o fim; com timer, em loop por `timer` s — pode ser encurtado em `action.timer = 0`)
    // glide: durante o passo o personagem desliza até {x,z} | yank: chamado no meio do clipe (frame ≥ 3) | onStart: ao começar.
    // opts: { face: heading (rad), onDone, onAbort }. onAbort roda se a sequência for interrompida (ragdoll, teleporte,
    // cancelSequence) — quem chamou devolve o carro/porta ao normal.
    runSequence(steps, { face = null, onDone = null, onAbort = null } = {}) {
        if (this.busy) return false;
        this.velocity.setAll(0);
        if (face !== null) this.root.rotation.y = face;
        const seq = this._seq = { onAbort };
        const run = (i) => {
            if (this._seq !== seq) return;                           // interrompida
            if (i >= steps.length) { this._seq = null; if (onDone) onDone(); return; }
            const s = steps[i];
            if (s.onStart) s.onStart();
            if (this._seq !== seq) return;                           // (onStart pode ter cancelado)
            const ok = this.playAction(s.clip, { lock: 0, weapon: s.weapon || 'none', yank: s.yank || null, onDone: () => run(i + 1) });
            if (!ok) { run(i + 1); return; }
            if (s.timer !== undefined) this.action.timer = s.timer;
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
        if (seq.onAbort) seq.onAbort();
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
        if (look === 'none') {                                      // punhos e faca: COMBO soco esquerdo → soco direito → chute
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
            if (this.speed >= 0.6 && !this.swimming) {
                this.action = { name: 'shoot', lock: 0.6, onDone: null, holdAim: true, yank: null, timer: dur, moving: true };
                this.actor.done = false;                                               // (o fim é pelo tempo: o "acabou" do tiro anterior não vale)
                this.state = 'shoot';
                ok = true;
            } else {
                ok = this.playAction('shoot', { lock: 0.6, weapon: look, holdAim: true });
                if (ok) this.action.timer = dur;
            }
        }
        return ok ? this.action.name : null;
    }

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
        // Dentro do carro (esperando a porta fechar): parado e invisível.
        if (this.frozen) {
            Bags.stamina(this, false, false, dt);                                   // (sentado no carro: recupera o fôlego)
            this.velocity.setAll(0); this.speed = 0;
            this._syncSprite();
            return;
        }
        if (this._rollCd > 0) this._rollCd -= dt;
        if (this.roll) { Bags.stamina(this, false, true, dt); this._updateRoll(dt); return; }
        // Fim de ação?
        let lock = 1;
        if (this.action) {
            const a = this.action;
            lock = a.lock;
            if (a.yank && this.actor.frame >= 3) { const y = a.yank; a.yank = null; y(); }    // meio do puxão do roubo
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

        // Agachado: correr levanta; parado/andando, a cobertura ao lado é reconferida (andar ao longo do muro segue nela).
        if (this.crouched && sprinting && moveDir.lengthSquared() > 1e-4) this.setCrouch(false);
        if (this.crouched) {
            this._coverT -= dt;
            if (this._coverT <= 0) { this._coverT = 0.12; this.cover = typeof Cover !== 'undefined' ? Cover.find(this.root.position.x, this.root.position.z) : null; }
            sprinting = false;
        }
        // Fôlego: só corre enquanto tiver (e sem sobrecarga de peso). Ver Bags.stamina.
        sprinting = Bags.stamina(this, sprinting, lock > 0 && moveDir.lengthSquared() > 1e-4, dt);

        // Na água: raso (0 a wadeDepth m da margem) = anda devagar, cada vez mais; fundo = nada (ainda mais devagar).
        // (sob a ponte o tabuleiro não é chão: vale a água de baixo — ver _updateLevel)
        const W = Config.water, depth = this.underBridge ? MapGeo.waterDepthBelow(this.root.position.x, this.root.position.z) : MapGeo.waterDepth(this.root.position.x, this.root.position.z);
        this.depth = depth;
        this.swimming = depth > W.wadeDepth;
        if (this.crouched && depth > 0) this.setCrouch(false);                     // (na água não dá para agachar)
        // vadeando: a água sobe da canela (na beira) à cintura (perto de nadar) — o desenho afunda até ali (SpriteActor.setWaterline)
        this.waterline = depth > 0 && !this.swimming ? 0.25 + 0.75 * Math.min(1, depth / W.wadeDepth) : 0;
        this.actor.setWaterline(this.waterline);
        const wf = depth <= 0 ? 1 : (depth <= W.wadeDepth ? 0.85 - 0.4 * (depth / W.wadeDepth) : (sprinting ? 0.52 : 0.4));
        // Relevo: subir qualquer encosta pode, mas devagar (MapGeo.slopeSpeed) — e o desenho troca para subindo/escalando
        // (SpriteActor.setSlope). Inclinação medida na direção do movimento e suavizada (sem tranco de célula em célula).
        const onGround = depth <= 0 && !this.onDeck && !this.underBridge && !(typeof HouseView !== 'undefined' && HouseView.inside);
        const g = onGround && moveDir.lengthSquared() > 1e-4 ? MapGeo.slopeAlong(this.root.position.x, this.root.position.z, moveDir.x, moveDir.z) : 0;
        this.slope = (this.slope || 0) + (g - (this.slope || 0)) * Math.min(1, dt * 6);
        this.actor.setSlope(this.speed > 0.3 ? this.slope : 0);
        const maxSpeed = ((sprinting && depth <= 0) ? Bags.runSpeed(this) : Config.player.maxSpeed * (1 + Outfit.m.walk)) * lock * wf * (depth > 0 ? 1 + (SkillTree.m.swim || 0) : 1) * (this.loadMul || 1) * (this.winded ? 0.88 : 1) * (aiming ? (this.aimFree ? 0.85 : 0.6) : 1) * (this.crouched ? Config.tactics.sneakSpeed : 1) * MapGeo.slopeSpeed(this.slope);      // Outfit: tênis/roupa (ver Outfit) | loadMul: peso carregado (Bags) | sem fôlego: arrasta o passo | mirando: devagar | relevo

        // Acelera/desacelera suavemente rumo à velocidade alvo (frame-independent).
        const targetVel = moveDir.scale(maxSpeed);
        const t = 1 - Math.exp(-Config.player.accel * dt);
        this.velocity = BABYLON.Vector3.Lerp(this.velocity, targetVel, t);
        if (this.velocity.lengthSquared() < 1e-4) this.velocity.setAll(0);

        // Integra posição, mas confinado à terra (desliza na beira da água).
        const prev = this.root.position;
        const nx = prev.x + this.velocity.x * dt;
        const nz = prev.z + this.velocity.z * dt;
        if (MapGeo.canWade(nx, nz)) {
            prev.x = nx; prev.z = nz;
        } else if (MapGeo.canWade(nx, prev.z)) {
            prev.x = nx; this.velocity.z = 0;
        } else if (MapGeo.canWade(prev.x, nz)) {
            prev.z = nz; this.velocity.x = 0;
        } else {
            this.velocity.setAll(0);
        }
        if (this.onDeck) this._clampToDeck(prev);                           // no viaduto: só as muretas (o que há lá embaixo não bate)
        else if (!this._glide) MapGeo.resolveCircle(prev, Config.player.radius, this.underBridge || depth > 0);   // não atravessa prédios (no pulo, passa por cima); na água, passa sob a mureta da ponte
        this._updateLevel();
        this.speed = this.velocity.length();

        // Gira o corpo em direção ao movimento (menor caminho angular) — só fora de ações. Mirando: sempre para a mira (até atirando).
        if (aiming && (!this.action || this.action.name === 'shoot' || this.action.name === 'draw')) {
            this.root.rotation.y = this._lerpAngle(this.root.rotation.y, this.aimHeading, 1 - Math.exp(-22 * dt));
        } else if (!this.action && moveDir.lengthSquared() > 1e-4) {
            const targetY = Math.atan2(moveDir.x, moveDir.z);
            const rt = 1 - Math.exp(-Config.player.turnLerp * dt);
            this.root.rotation.y = this._lerpAngle(this.root.rotation.y, targetY, rt);
        }

        // Animação de locomoção (ações já controlam o próprio clipe).
        let rate = 1;
        // Atirando: andando, as pernas seguem (frente, trás, lado; agachado, o andar agachado); parou no meio, a pose de mirar.
        if (this.action && this.action.name === 'shoot' && !this.swimming) {
            const w = this.look, base = Math.max(0.5, this.speed / (Config.anim.walk * Config.player.stride));
            if (this.speed >= 0.3) {
                if (this.crouched && !this.inCover && this.actor.play('sneak', w)) rate = (Math.cos(this._relMove()) < -0.5 ? -1 : 1) * base / 0.72;
                else rate = this._aimGait(w, base);
            } else if (this.actor.clipName !== 'shoot') this.actor.play(this.crouched && !this.inCover && this.actor.sheet.getClip('crouch', w) ? 'crouch' : 'aim', w);
            this._syncSprite(); this.actor.update(dt, rate); return;
        }
        if (!this.action) {
            const w = this.look;
            let clip;
            if (this.swimming) {                                  // nadando: crawl (mais devagar parado, "boiando")
                clip = 'swim'; this.state = 'swim';
                rate = this.speed < 0.3 ? 0.35 : Math.max(0.6, this.speed / 1.4);
                if (this.speed < 0.3 && this.actor.play('swim_idle', 'none')) rate = 1;          // 2,5D: parado, bate as pernas no lugar
                else this.actor.play('swim', 'none');
                this._syncSprite();
                this.actor.update(dt, rate);
                return;
            }
            if (depth > 0) {                                      // vadeando: passos lentos e pesados
                clip = this.speed < 0.3 ? 'idle' : 'walk'; this.state = this.speed < 0.3 ? 'idle' : 'wade';
                rate = Math.max(0.4, this.speed / (Config.anim.walk * Config.player.stride)) * 0.9;
                this.actor.play(clip, w);
                this._syncSprite();
                this.actor.update(dt, rate);
                return;
            }
            const gun = w === 'pistol' || w === 'smg' || w === 'shotgun';
            // Agachado (furtivo / cobertura). Mirando EM COBERTURA ele levanta para atirar por cima (desenho de pé, abaixo).
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
            } else if (sprinting) {
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
            if (cw && this.actor.play(cw[0], cw[1])) { this._syncSprite(); this.actor.update(dt, rate); return; }
            this.actor.play(clip, w);
        }

        this._syncSprite();
        this.actor.update(dt, rate);
    }

    _syncSprite() {
        this.actor.setPosition(this.root.position.x, this.root.position.z);
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
    //   underBridge  sob uma ponte cidade ↔ ilha: chegou à área do tabuleiro vindo da ÁGUA (nadando ou no raso) e fica até sair dela.
    get baseY() { return this.underBridge ? 0.1 : 0.5 + (this.deckH || 0); }

    // Altura do furo: a CABEÇA (a pé, a mureta ao lado não abre furo); sob a ponte, abaixo do tabuleiro.
    get revealY() { return this.underBridge ? 0.1 : this.baseY + 1.2; }

    _updateLevel() {
        const p = this.root.position, wasY = this.baseY;
        const onB = RoadPlan.onBridge(p.x, p.z);
        if (!onB) this.underBridge = false;
        else if (!this.underBridge && this._wasInWater) this.underBridge = true;
        this._wasInWater = !onB && MapGeo.waterDepth(p.x, p.z) > 0;

        if (RoadPlan.viaducts && RoadPlan.viaducts.length) {
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
        this.onDeck = false; this.deckH = 0; this.underBridge = false; this._wasInWater = false;
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

Player.ZERO = new BABYLON.Vector3(0, 0, 0);          // (só leitura: "sem movimento" sem alocar)
