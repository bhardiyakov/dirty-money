// ============================================================================
// Player — personagem cinemático (sem física) desenhado como SPRITE 2D pixel art.
// `root` é o nó lógico (posição + giro); o SpriteActor mostra o frame certo do
// clipe atual na direção certa. Movimento vetorial em 8 direções, independente
// de framerate, com colisão círculo×retângulo contra prédios.
//
// Animação: locomoção (idle/walk/run, com ou sem arma) é escolhida pela
// velocidade; AÇÕES (soco, chute, taco, tiro, sacar, roubar carro...) tomam
// o controle até acabarem e travam/limitam o movimento.
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

        this.actor = new SpriteActor(scene, library.sheets.player, 0, 'playerSprite');
        this.maxHp = 100;
        this.hp = this.maxHp;
        this.armor = 0;            // colete à prova de balas (pontos restantes)
        this.armorMax = 0;         // capacidade do colete em uso: 50 = nível 1, 100 = nível 2 (0 = sem colete)
        this._sinceHit = 99;
        this.hitFlash = 0;
        this.weapon = 'none';      // none | pistol | smg | shotgun | bat
        this.action = null;        // { name, lock, onDone, holdAim }
        this.aimTimer = 0;         // tempo restante "mirando" parado após sacar/atirar.
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
        if (this.armor > 0) {                                 // colete: absorve 75% do dano até acabar
            const a = Math.min(this.armor, amount * 0.75);
            this.armor -= a; amount -= a;
            if (this.armor < 0.5) { this.armor = 0; this.armorMax = 0; }
        }
        this.hp = Math.max(0, this.hp - amount);
        this._sinceHit = 0;
        this.hitFlash = 0.35;                       // vinheta vermelha na tela
        if (!this.busy && !quiet) this.playAction('hurt', { lock: 0.6 });
    }

    // Arremessado (ragdoll): perde o controle, voa/rola/desliza e levanta. kind: 'hit' (atropelado) | 'bail'
    // (pulou de um veículo: cambalhota). lethal: termina caído (o jogo cuida do "WASTED").
    ragdoll({ dx, dz, power, kind = 'hit', lethal = false }) {
        this.cancelSequence();
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
        this.actor.mesh.position.y = 0.5;
        this.actor.play(dead ? 'dead' : 'idle', 'none', { restart: true });
        this._syncSprite();
    }

    // Regenera devagar depois de alguns segundos sem levar tiro.
    tickHealth(dt) {
        if (this.hitFlash > 0) this.hitFlash -= dt;
        if (this.hp <= 0) return;                         // morto não regenera
        this._sinceHit += dt;
        const cap = this.maxHp * 0.3;                      // punitivo: sem tratamento só se recupera até 30% da vida, bem devagar
        if (this._sinceHit > 10 && this.hp < cap) this.hp = Math.min(cap, this.hp + 1.2 * dt);
    }

    // Veste um colete de capacidade `max` (50 = nível 1, 100 = nível 2): recompõe o que faltava até a capacidade.
    wearVest(max) {
        this.armorMax = Math.max(this.armorMax, max);
        this.armor = this.armorMax;
    }

    revive() { this.armor = 0; this.armorMax = 0; this.hp = this.maxHp; this.action = null; this._sinceHit = 0; }

    // ---------------------------------------------------------------- ações
    get busy() { return !!this.action || !!this.rag || !!this.frozen; }

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
        this.actor.mesh.position.y = 0.5;
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

    // Golpe principal conforme a arma na mão: soco (alternando), taco ou tiro.
    // Retorna o nome da ação iniciada ('punch' | 'punchL' | 'swing' | 'shoot') ou null.
    // force: permite reiniciar o clipe de tiro (rajada de SMG) mesmo ocupado atirando.
    primary(force = false) {
        if (this.busy && !(force && this.action.name === 'shoot')) return null;
        const w = this.weapon, look = this.look;
        let ok;
        if (look === 'none') {                                      // punhos e faca: socos alternados
            this._combo ^= 1;
            ok = this.playAction(this._combo ? 'punch' : 'punchL', { lock: 0.25 });
        } else if (w === 'bat') {
            ok = this.playAction('swing', { lock: 0.3, weapon: w });
        } else {
            ok = this.playAction('shoot', { lock: 0.6, weapon: look, holdAim: true });
        }
        return ok ? this.action.name : null;
    }

    // Arma desenhada na mão (as armas novas reaproveitam o desenho de pistola/SMG).
    get look() {
        if (this.weapon === 'none') return 'none';
        const W = Weapons[this.weapon];
        return (W && W.look) || this.weapon;
    }

    kick() {
        if (this.busy) return false;
        return this.playAction('kick', { lock: 0.2 });
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
        this._baseSheet = this.actor.sheet;
        this.actor.useSheet(this.lib.sheets.rider);
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
            this.velocity.setAll(0); this.speed = 0;
            this._syncSprite();
            return;
        }
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
            if (!this.action) { this._glide = null; this.actor.mesh.position.y = 0.5; }
            else {
                g.t = Math.min(1, g.t + dt / g.dur);
                const e = g.t * g.t * (3 - 2 * g.t);
                const to = g.to();
                this.root.position.x = g.x0 + (to.x - g.x0) * e;
                this.root.position.z = g.z0 + (to.z - g.z0) * e;
                if (g.arc) this.actor.mesh.position.y = 0.5 + g.arc * Math.sin(Math.PI * g.t);      // arco do pulo
                if (g.t >= 1) { this._glide = null; this.actor.mesh.position.y = 0.5; }
            }
        }

        // Na água: raso (0 a wadeDepth m da margem) = anda devagar, cada vez mais; fundo = nada (ainda mais devagar).
        const W = Config.water, depth = MapGeo.waterDepth(this.root.position.x, this.root.position.z);
        this.depth = depth;
        this.swimming = depth > W.wadeDepth;
        const wf = depth <= 0 ? 1 : (depth <= W.wadeDepth ? 0.85 - 0.4 * (depth / W.wadeDepth) : (sprinting ? 0.52 : 0.4));
        const maxSpeed = ((sprinting && depth <= 0) ? Config.player.sprintSpeed : Config.player.maxSpeed) * lock * wf * (this.loadMul || 1);      // loadMul: carga pesada (eletrônicos roubados)

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
        if (!this._glide) MapGeo.resolveCircle(prev, Config.player.radius);   // não atravessa prédios (no pulo, passa por cima)
        this.speed = this.velocity.length();

        // Gira o corpo em direção ao movimento (menor caminho angular) — só fora de ações.
        if (!this.action && moveDir.lengthSquared() > 1e-4) {
            const targetY = Math.atan2(moveDir.x, moveDir.z);
            const rt = 1 - Math.exp(-Config.player.turnLerp * dt);
            this.root.rotation.y = this._lerpAngle(this.root.rotation.y, targetY, rt);
        }

        // Animação de locomoção (ações já controlam o próprio clipe).
        let rate = 1;
        if (!this.action) {
            const w = this.look;
            let clip;
            if (this.swimming) {                                  // nadando: crawl (mais devagar parado, "boiando")
                clip = 'swim'; this.state = 'swim';
                rate = this.speed < 0.3 ? 0.35 : Math.max(0.6, this.speed / 4) * 1.1;
                this.actor.play('swim', 'none');
                this._syncSprite();
                this.actor.update(dt, rate);
                return;
            }
            if (depth > 0) {                                      // vadeando: passos lentos e pesados
                clip = this.speed < 0.3 ? 'idle' : 'walk'; this.state = this.speed < 0.3 ? 'idle' : 'wade';
                rate = 0.55 * (0.5 + this.speed / Config.player.maxSpeed);
                this.actor.play(clip, w);
                this._syncSprite();
                this.actor.update(dt, rate);
                return;
            }
            if (this.speed < 0.3) {
                clip = (this.aimTimer > 0 && (w === 'pistol' || w === 'smg' || w === 'shotgun')) ? 'aim' : 'idle';
                this.state = 'idle';
            } else if (sprinting) {
                clip = 'run';
                this.state = 'sprint';
                rate = Math.max(0.6, this.speed / Config.player.sprintSpeed) * 1.5;
            } else {
                clip = 'walk';
                this.state = 'walk';
                rate = Math.max(0.6, this.speed / Config.player.maxSpeed) * 1.5;
            }
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

    teleport(pos) {
        this.cancelSequence();
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
        this.actor.mesh.position.y = 0.5;
        this._syncSprite();
        this.actor.mesh.computeWorldMatrix(true); this.actor.mesh.refreshBoundingInfo();             // o sprite não sincroniza o volume sozinho: após um salto longo (loja, safe house) o culling o esconderia
    }
}
