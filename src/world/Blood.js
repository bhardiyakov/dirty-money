// ============================================================================
// Blood — sangue no chão: respingo do tiro e rastro de quem está ferido.
//   • hit(x, z, dx, dz, dmg, ent): acertado (bala, taco, atropelamento) — respingo aos pés e manchas alongadas ATRÁS do alvo, na
//     direção do golpe (o sangue "sai pelas costas");
//   • wound(ent, dmg, shot): sangra por BLEED (3) segundos depois de cada acerto — andando, um rastro de gotas (mais juntas e
//     maiores quanto pior o ferimento); parado, pinga no lugar e forma uma poça. Morreu ou sumiu: para. Tiro: a camada BALEADO
//     do sprite ganha um furo;
//   • deathPool(actor): quem morreu (SpriteActor.play('dead')) ganha, quando o corpo assenta, a POÇA debaixo do tronco — as mesmas
//     manchas do rastro, crescendo por alguns segundos e durando POOL_LIFE (num anel à parte, que um tiroteio não apaga);
//   • beat(ent, dmg): pancada — a camada ESPANCADO do sprite (hematomas, sangue do nariz) sobe de nível;
//   • cond(ent, nível): o ESTADO da roupa/corpo (SpriteActor.setWounds, por cima de qualquer roupa): 1 SUJO — atropelado ou rolou no
//     chão (dirty); 2 MACHUCADO — apanhou ou levou 1 tiro; 3 MUITO MACHUCADO — 2 ou mais tiros. No jogador a VIDA também puxa
//     (abaixo de 60%: machucado; de 30%: muito machucado). Só piora; volta ao normal quando ele se cura (vida cheia: comida, kit,
//     hospital, dormir) — e o pedestre, quando vira outra pessoa.
//     As camadas (SpriteActor.setWounds) ficam no sprite: no NPC até ele virar outra pessoa; no jogador, até se curar (vida cheia).
//   • As manchas do chão duram LIFE (~4,5) s e somem sozinhas: um tiroteio não acumula sangue (nem memória).
//
// Um lote único (uma malha, um desenho), como as marcas de pneu (SkidMarks): anel de N manchas (quads) — a mais antiga é
// reaproveitada. Cada vértice guarda a hora em que nasceu, a força e uma semente: o shader desenha a mancha (borda irregular e
// gotinhas em volta, a partir da semente), escurece o sangue secando e apaga com o tempo — nada de textura nem CPU por mancha.
// ============================================================================

const Blood = {
    N: 256,             // manchas no anel (vivem pouco: num tiroteio o anel se renova sem crescer)
    P: 48,              // manchas no anel das POÇAS de quem morreu (logo depois do anel principal)
    POOL_LIFE: 40,      // segundos de uma poça (o corpo do pedestre fica ~28 s)
    LIFE: 4.5,          // segundos até sumir: ~3 s inteira e ~1,5 s esmaecendo (como nos games — não acumula)
    BLEED: 3,           // segundos sangrando depois de cada acerto
    BEAT_STEP: 18,      // dano de pancada acumulado por nível da camada ESPANCADO (4 níveis)
    SIZE: 1.6,          // escala de todas as manchas (ajuste fino do tamanho na tela)
    time: 0,
    mesh: null,
    _wounded: new Set(),
    _pending: [],       // poças esperando o corpo assentar: { actor, t }

    init(scene) {
        if (this.mesh && this.scene === scene) return;
        this.scene = scene;
        const N = this.N + this.P;
        this.pos = new Float32Array(N * 12);
        this.col = new Float32Array(N * 16);
        this.uv = new Float32Array(N * 8);
        for (let i = 0; i < N; i++) {
            for (let k = 0; k < 4; k++) this.col[i * 16 + k * 4] = -1e4;      // nascidas "há muito tempo": invisíveis
            this.uv.set([-1, -1, 1, -1, -1, 1, 1, 1], i * 8);
        }
        const idx = new Uint32Array(N * 6);
        for (let i = 0; i < N; i++) { const b = i * 4, o = i * 6; idx[o] = b; idx[o + 1] = b + 1; idx[o + 2] = b + 2; idx[o + 3] = b + 2; idx[o + 4] = b + 1; idx[o + 5] = b + 3; }
        const mesh = new BABYLON.Mesh('bloodMarks', scene), vd = new BABYLON.VertexData();
        vd.positions = this.pos; vd.colors = this.col; vd.uvs = this.uv; vd.indices = idx;
        vd.applyToMesh(mesh, true);
        if (!BABYLON.Effect.ShadersStore.bloodVertexShader) {
            BABYLON.Effect.ShadersStore.bloodVertexShader = `
                precision highp float;
                attribute vec3 position;
                attribute vec4 color;            // r = nascimento (s), g = força (0..1), b = semente, a = poça: segundos crescendo (0 = mancha)
                attribute vec2 uv;               // -1..1 no quad
                uniform mat4 worldViewProjection;
                uniform float time;
                uniform float life;
                uniform float poolLife;
                varying float vA;
                varying float vGrow;
                varying float vSeed;
                varying float vDry;
                varying vec2 vUV;
                void main(void) {
                    float age = time - color.r;
                    float pool = step(0.001, color.a);
                    float L = mix(life, poolLife, pool);
                    vA = color.g * (1.0 - smoothstep(L * mix(0.66, 0.85, pool), L, age)) * step(0.0, age);
                    vDry = pool > 0.5 ? smoothstep(8.0, 32.0, age) : smoothstep(1.0, 4.0, age);
                    float g = clamp(age / max(color.a, 0.001), 0.0, 1.0);
                    vGrow = pool > 0.5 ? mix(0.3, 1.0, 1.0 - (1.0 - g) * (1.0 - g) * (1.0 - g)) : 1.0;    // a poça se espalha (rápido e depois devagar)
                    vSeed = color.b;
                    vUV = uv;
                    gl_Position = worldViewProjection * vec4(position, 1.0);
                }`;
            BABYLON.Effect.ShadersStore.bloodFragmentShader = `
                precision highp float;
                varying float vA;
                varying float vSeed;
                varying float vDry;
                varying vec2 vUV;
                varying float vGrow;
                uniform vec3 tint;
                float h(float n) { return fract(sin(n) * 43758.5453); }
                void main(void) {
                    vec2 p = vUV / vGrow;
                    float r = length(p), a = atan(p.y, p.x), s = vSeed;
                    // borda irregular: o raio varia com o ângulo (3 ondas de fases sorteadas)
                    float edge = 0.6 + 0.11 * sin(a * 3.0 + s * 6.3) + 0.07 * sin(a * 7.0 + s * 13.1) + 0.04 * sin(a * 13.0 + s * 29.7);
                    float m = 1.0 - smoothstep(edge - 0.05, edge + 0.02, r);
                    float core = smoothstep(0.0, 0.45, edge - r);                       // mais grosso no meio = mais escuro
                    // gotinhas em volta
                    for (int i = 0; i < 4; i++) {
                        float fi = float(i), an = h(s * 17.0 + fi) * 6.2832, d = 0.68 + 0.26 * h(s * 31.0 + fi);
                        float rr = 0.05 + 0.08 * h(s * 7.0 + fi);
                        m = max(m, 1.0 - smoothstep(rr - 0.02, rr + 0.01, length(p - vec2(cos(an), sin(an)) * d)));
                    }
                    float al = m * vA;
                    if (al < 0.02) discard;
                    vec3 fresh = mix(vec3(0.55, 0.03, 0.05), vec3(0.33, 0.0, 0.02), core);
                    vec3 dry = mix(vec3(0.3, 0.05, 0.04), vec3(0.18, 0.03, 0.03), core);  // secando: escurece e puxa para o marrom
                    gl_FragColor = vec4(mix(fresh, dry, vDry) * tint, al * 0.9);
                }`;
        }
        const m = new BABYLON.ShaderMaterial('bloodMat', scene, { vertex: 'blood', fragment: 'blood' }, {
            attributes: ['position', 'color', 'uv'], uniforms: ['worldViewProjection', 'time', 'life', 'poolLife', 'tint'], needAlphaBlending: true,
        });
        m.setFloat('life', this.LIFE);
        m.setFloat('poolLife', this.POOL_LIFE);
        m.setColor3('tint', SpriteMaterial.sharedTint());              // (dia/noite: a mesma cor ambiente dos sprites)
        m.disableDepthWrite = true;
        m.backFaceCulling = false;
        mesh.material = m;
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.doNotSyncBoundingInfo = true;
        mesh.alphaIndex = -99;                                    // logo depois das marcas de pneu, antes dos pedestres
        mesh.isVisible = false;                                   // (aparece com a 1ª mancha)
        this.mesh = mesh; this.mat = m;
        this._vbP = mesh.getVertexBuffer(BABYLON.VertexBuffer.PositionKind);
        this._vbC = mesh.getVertexBuffer(BABYLON.VertexBuffer.ColorKind);
        this.next = 0; this.nextP = 0; this._pending.length = 0; this._a = Infinity; this._b = -1; this._wrap = false;
        this.time = 0;
        this._wounded.clear();
    },

    // Uma mancha em (x, z): meia-largura w, meio-comprimento l ao longo de (dx, dz), força k (0..1). grow > 0: é uma POÇA (anel
    // à parte, dura POOL_LIFE) que leva `grow` s para se espalhar.
    splat(x, z, y, w, l, dx, dz, k, grow = 0) {
        if (!this.mesh || MapGeo.waterDepth(x, z) > 0) return;              // (na água o sangue se dilui)
        w *= this.SIZE; l *= this.SIZE;
        const d = Math.hypot(dx, dz) || 1, fx = dx / d * l, fz = dz / d * l, px = -dz / d * w, pz = dx / d * w;
        const i = grow > 0 ? this.N + this.nextP : this.next, p = this.pos, c = this.col, o = i * 12, q = i * 16, t = this.time, s = Math.random() * 97;
        p[o] = x - px - fx; p[o + 1] = y; p[o + 2] = z - pz - fz;
        p[o + 3] = x + px - fx; p[o + 4] = y; p[o + 5] = z + pz - fz;
        p[o + 6] = x - px + fx; p[o + 7] = y; p[o + 8] = z - pz + fz;
        p[o + 9] = x + px + fx; p[o + 10] = y; p[o + 11] = z + pz + fz;
        for (let v = 0; v < 4; v++) { c[q + v * 4] = t; c[q + v * 4 + 1] = k; c[q + v * 4 + 2] = s; c[q + v * 4 + 3] = grow; }
        if (i < this._a) this._a = i;
        if (i > this._b) this._b = i;
        this.mesh.isVisible = true;
        if (grow > 0) { this.nextP = (this.nextP + 1) % this.P; return; }
        this.next = (i + 1) % this.N;
        if (this.next === 0) this._wrap = true;
    },

    // Altura do chão sob a entidade (no viaduto, o tabuleiro).
    _y(ent) { return (ent && ent.onDeck && ent.baseY ? ent.baseY - 0.5 : 0) + 0.21; },

    // Acertado em (x, z) por um golpe vindo na direção (dx, dz) (bala: a velocidade dela). dmg: o tamanho do estrago.
    hit(x, z, dx, dz, dmg, ent = null) {
        if (!this.mesh) return;
        const d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d, y = this._y(ent), k = Math.min(1, dmg / 40);
        this.splat(x + (Math.random() - 0.5) * 0.2, z + (Math.random() - 0.5) * 0.2, y, 0.28 + 0.2 * k, 0.32 + 0.2 * k, ux, uz, 1);    // aos pés
        const n = 2 + Math.round(3 * k);
        for (let i = 0; i < n; i++) {                                       // espirrado para trás, alongado na direção do golpe
            const a = (Math.random() - 0.5) * 0.7, ca = Math.cos(a), sa = Math.sin(a), vx = ux * ca - uz * sa, vz = ux * sa + uz * ca;
            const r = 0.45 + Math.random() * (0.9 + 0.8 * k), sz = 0.09 + Math.random() * 0.14 + 0.1 * k;
            this.splat(x + vx * r, z + vz * r, y, sz, sz * (1.6 + Math.random()), vx, vz, 0.75 + Math.random() * 0.25);
        }
    },

    // Passa a sangrar por BLEED segundos (um acerto novo recomeça a contagem). shot: foi tiro — a camada BALEADO do sprite ganha
    // mais um furo (dois, se o tiro foi forte).
    wound(ent, dmg, shot = true) {
        if (!ent || !this.mesh) return;
        ent._bleedK = Math.min(1, Math.max(ent._bleed > 0 ? ent._bleedK || 0 : 0, dmg / 35));    // gravidade (o pior ferimento até estancar)
        ent._bleed = this.BLEED;
        if (!ent._bleedAt) ent._bleedAt = { x: ent.position.x, z: ent.position.z, t: 0, pool: 0 };
        this._wounded.add(ent);
        const A = shot && this._actor(ent);
        if (A) {
            const w = A.wounds;
            A._hits = (A._hits || 0) + 1;                                       // tiros levados desde a última cura
            A.setWounds(w.shot + (dmg >= 40 ? 2 : 1), w.beat);
            this.cond(ent, A._hits >= 2 ? 3 : 2);
        }
    },

    // Estado da roupa/corpo (só piora): 1 sujo, 2 machucado, 3 muito machucado. Machucado já vem com o rosto marcado (hematomas e
    // sangue do nariz); muito machucado, com a ferida na cabeça (camada ESPANCADO no mínimo 1 / 3).
    cond(ent, lvl) {
        const A = this._actor(ent);
        if (!A) return;
        const w = A.wounds;
        if (lvl <= w.cond) return;
        A.setWounds(w.shot, Math.max(w.beat, lvl >= 3 ? 3 : lvl >= 2 ? 1 : 0), lvl);
    },
    // Atropelado / rolou no chão: sujo de terra (e ralado — ESPANCADO —, sem passar de sujo).
    dirty(ent) { this.cond(ent, 1); },

    // Morreu: a poça nasce quando o corpo assenta no chão (o fim da queda do clipe de morto) — debaixo do tronco, que no corpo
    // deitado fica ~0,45 m atrás dos pés (ele cai de costas).
    deathPool(actor) {
        if (!this.mesh || !actor || !actor.mesh || this._pending.some((q) => q.actor === actor)) return;
        this._pending.push({ actor, t: 0.5 });
    },
    _pool(actor) {
        const m = actor.mesh, hd = actor.heading || 0, fx = Math.sin(hd), fz = Math.cos(hd);
        if (!m.isVisible || (m.isDisposed && m.isDisposed())) return;
        const P = m.getAbsolutePosition();                                                 // (o do jogador é filho da raiz dele)
        const x = P.x - fx * 0.45, z = P.z - fz * 0.45, y = Math.max(0, P.y - 0.5) + 0.21;
        if (typeof Zones !== 'undefined' && !Zones.near(x, z, 30)) return;               // (longe da tela: ninguém vê)
        const j = () => (Math.random() - 0.5) * 0.2;
        this.splat(x + j(), z + j(), y, 0.62, 0.7, fx, fz, 1, 3.5);                        // a poça (do tronco, ao longo do corpo)
        this.splat(x + fx * 0.32 + j(), z + fz * 0.32 + j(), y, 0.36, 0.42, fx, fz, 0.95, 4.5);
        this.splat(x - fx * 0.3 + fz * 0.2 + j(), z - fz * 0.3 - fx * 0.2 + j(), y, 0.3, 0.34, 1, 0, 0.9, 6);   // escorrendo para o lado
    },

    // Apanhou (soco, chute, cassetete, taco, atropelamento): a camada ESPANCADO sobe um nível a cada ~BEAT_STEP de dano acumulado.
    // cond: o estado que a pancada deixa (2 = machucado; atropelado: 1 = sujo).
    beat(ent, dmg, cond = 2) {
        const A = this._actor(ent);
        if (!A) return;
        ent._beatDmg = (A.wounds.beat ? ent._beatDmg || 0 : 0) + dmg;
        A.setWounds(A.wounds.shot, Math.ceil(ent._beatDmg / this.BEAT_STEP));
        this.cond(ent, cond);
    },
    _actor(ent) { const a = ent && ent.actor; return a && a.setWounds ? a : (a && a.body && a.body.setWounds ? a.body : null); },

    // Gotas de quem está sangrando (Game.update) e o relógio do shader + envio do que foi escrito neste quadro.
    update(dt, tint, game) {
        if (!this.mesh) return;
        this.time += dt;
        this.mat.setFloat('time', this.time);
        if (tint) this.mat.setColor3('tint', tint);
        // jogador curado (vida cheia: comida, kit, hospital, dormir, renascer): o sprite volta limpo
        const pl = game && game.player;
        if (pl && pl.hp >= pl.maxHp && pl.actor && (pl.actor._wShot || pl.actor._wBeat || pl.actor._wCond)) { pl.actor.clearWounds(); pl._beatDmg = 0; }
        else if (pl && pl.alive !== false && pl.maxHp && pl.hp < pl.maxHp) this.cond(pl, pl.hp < pl.maxHp * 0.3 ? 3 : pl.hp < pl.maxHp * 0.6 ? 2 : 0);   // a vida puxa o estado
        for (let i = this._pending.length - 1; i >= 0; i--) {
            const q = this._pending[i];
            if ((q.t -= dt) > 0) continue;
            this._pending.splice(i, 1);
            if (q.actor.clip && q.actor.clip.name === 'dead') this._pool(q.actor);       // (ainda morto: não levantou nem virou outro)
        }
        for (const e of this._wounded) {
            e._bleed -= dt;
            const gone = e.actor && e.actor.mesh && e.actor.mesh.isDisposed && e.actor.mesh.isDisposed();
            if (e._bleed <= 0 || !e.alive || gone) { e._bleed = 0; e._bleedK = 0; e._bleedAt = null; this._wounded.delete(e); continue; }
            if (game && e === game.player && game.mode !== 'player') continue;            // (dentro do carro: não pinga na rua)
            if (e.rag) continue;                                                          // (voando/rolando: o Ragdoll cuida)
            const p = e.position, B = e._bleedAt;
            if (typeof Zones !== 'undefined' && !Zones.near(p.x, p.z, 12)) { B.x = p.x; B.z = p.z; continue; }   // longe da tela: nada
            const k = e._bleedK * Math.min(1, 0.4 + e._bleed / this.BLEED);     // estancando: pinga menos
            const dx = p.x - B.x, dz = p.z - B.z, moved = Math.hypot(dx, dz);
            B.t += dt;
            if (moved > 1.1 - 0.6 * k) {                                        // andando: rastro de gotas
                if (moved < 6) {
                    const sz = 0.07 + 0.07 * k + Math.random() * 0.06;
                    this.splat(p.x + (Math.random() - 0.5) * 0.3, p.z + (Math.random() - 0.5) * 0.3, this._y(e), sz, sz * (1.2 + Math.random() * 0.6), dx, dz, 0.85);
                    if (k > 0.5 && Math.random() < 0.5) this.splat(p.x + (Math.random() - 0.5) * 0.4, p.z + (Math.random() - 0.5) * 0.4, this._y(e), sz * 0.5, sz * 0.6, dx, dz, 0.8);
                }
                B.x = p.x; B.z = p.z; B.t = 0; B.pool = 0;
            } else if (B.t > 0.9 - 0.5 * k && B.pool < 4) {                     // parado: pinga no lugar e a poça cresce
                B.t = 0; B.pool++;
                const sz = 0.1 + 0.05 * B.pool + 0.08 * k;
                this.splat(p.x + (Math.random() - 0.5) * 0.15, p.z + (Math.random() - 0.5) * 0.15, this._y(e), sz, sz, 1, 0, 0.9);
            }
        }
        if (this._b < 0) return;
        let a = this._a, b = this._b + 1;
        if (this._wrap) { a = 0; b = this.N; this._wrap = false; }        // deu a volta no anel no meio do quadro: manda tudo
        this._vbP.updateDirectly(this.pos.subarray(a * 12, b * 12), a * 12);
        this._vbC.updateDirectly(this.col.subarray(a * 16, b * 16), a * 16);
        this._a = Infinity; this._b = -1;
    },
};
