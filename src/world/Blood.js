// ============================================================================
// Blood — sangue no chão: respingo do tiro e rastro de quem está ferido.
//   • hit(x, z, dx, dz, dmg, ent): acertado (bala, taco, atropelamento) — respingo aos pés e manchas alongadas ATRÁS do alvo, na
//     direção do golpe (o sangue "sai pelas costas");
//   • wound(ent, dmg, shot): sangra por BLEED (3) segundos depois de cada acerto — andando, um rastro de gotas (mais juntas e
//     maiores quanto pior o ferimento); parado, pinga no lugar e forma uma poça. Morreu (o sprite de morto já tem a poça) ou
//     sumiu: para. Tiro: a camada BALEADO do sprite ganha um furo;
//   • beat(ent, dmg): pancada — a camada ESPANCADO do sprite (hematomas, sangue do nariz) sobe de nível.
//     As camadas (SpriteActor.setWounds) ficam no sprite: no NPC até ele virar outra pessoa; no jogador, até se curar (vida cheia).
//   • As manchas do chão duram LIFE (~4,5) s e somem sozinhas: um tiroteio não acumula sangue (nem memória).
//
// Um lote único (uma malha, um desenho), como as marcas de pneu (SkidMarks): anel de N manchas (quads) — a mais antiga é
// reaproveitada. Cada vértice guarda a hora em que nasceu, a força e uma semente: o shader desenha a mancha (borda irregular e
// gotinhas em volta, a partir da semente), escurece o sangue secando e apaga com o tempo — nada de textura nem CPU por mancha.
// ============================================================================

const Blood = {
    N: 256,             // manchas no anel (vivem pouco: num tiroteio o anel se renova sem crescer)
    LIFE: 4.5,          // segundos até sumir: ~3 s inteira e ~1,5 s esmaecendo (como nos games — não acumula)
    BLEED: 3,           // segundos sangrando depois de cada acerto
    BEAT_STEP: 18,      // dano de pancada acumulado por nível da camada ESPANCADO (4 níveis)
    SIZE: 1.6,          // escala de todas as manchas (ajuste fino do tamanho na tela)
    time: 0,
    mesh: null,
    _wounded: new Set(),

    init(scene) {
        if (this.mesh && this.scene === scene) return;
        this.scene = scene;
        const N = this.N;
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
                attribute vec4 color;            // r = nascimento (s), g = força (0..1), b = semente
                attribute vec2 uv;               // -1..1 no quad
                uniform mat4 worldViewProjection;
                uniform float time;
                uniform float life;
                varying float vA;
                varying float vSeed;
                varying float vDry;
                varying vec2 vUV;
                void main(void) {
                    float age = time - color.r;
                    vA = color.g * (1.0 - smoothstep(life * 0.66, life, age)) * step(0.0, age);
                    vDry = smoothstep(1.0, 4.0, age);
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
                uniform vec3 tint;
                float h(float n) { return fract(sin(n) * 43758.5453); }
                void main(void) {
                    vec2 p = vUV;
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
            attributes: ['position', 'color', 'uv'], uniforms: ['worldViewProjection', 'time', 'life', 'tint'], needAlphaBlending: true,
        });
        m.setFloat('life', this.LIFE);
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
        this.next = 0; this._a = Infinity; this._b = -1; this._wrap = false;
        this.time = 0;
        this._wounded.clear();
    },

    // Uma mancha em (x, z): meia-largura w, meio-comprimento l ao longo de (dx, dz), força k (0..1).
    splat(x, z, y, w, l, dx, dz, k) {
        if (!this.mesh || MapGeo.waterDepth(x, z) > 0) return;              // (na água o sangue se dilui)
        w *= this.SIZE; l *= this.SIZE;
        const d = Math.hypot(dx, dz) || 1, fx = dx / d * l, fz = dz / d * l, px = -dz / d * w, pz = dx / d * w;
        const i = this.next, p = this.pos, c = this.col, o = i * 12, q = i * 16, t = this.time, s = Math.random() * 97;
        p[o] = x - px - fx; p[o + 1] = y; p[o + 2] = z - pz - fz;
        p[o + 3] = x + px - fx; p[o + 4] = y; p[o + 5] = z + pz - fz;
        p[o + 6] = x - px + fx; p[o + 7] = y; p[o + 8] = z - pz + fz;
        p[o + 9] = x + px + fx; p[o + 10] = y; p[o + 11] = z + pz + fz;
        for (let v = 0; v < 4; v++) { c[q + v * 4] = t; c[q + v * 4 + 1] = k; c[q + v * 4 + 2] = s; }
        if (i < this._a) this._a = i;
        if (i > this._b) this._b = i;
        this.next = (i + 1) % this.N;
        if (this.next === 0) this._wrap = true;
        this.mesh.isVisible = true;
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
        if (A) { const w = A.wounds; A.setWounds(w.shot + (dmg >= 40 ? 2 : 1), w.beat); }
    },

    // Apanhou (soco, chute, cassetete, taco, atropelamento): a camada ESPANCADO sobe um nível a cada ~BEAT_STEP de dano acumulado.
    beat(ent, dmg) {
        const A = this._actor(ent);
        if (!A) return;
        ent._beatDmg = (A.wounds.beat ? ent._beatDmg || 0 : 0) + dmg;
        A.setWounds(A.wounds.shot, Math.ceil(ent._beatDmg / this.BEAT_STEP));
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
        if (pl && pl.hp >= pl.maxHp && pl.actor && (pl.actor._wShot || pl.actor._wBeat)) { pl.actor.clearWounds(); pl._beatDmg = 0; }
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
