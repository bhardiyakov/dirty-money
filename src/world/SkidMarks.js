// ============================================================================
// SkidMarks — marcas de pneu no chão: derrapagem (de lado), freada brusca e arrancada cantando pneu. Fumaça branca de borracha
// quando a derrapagem é forte.
//
// Um lote único (uma malha, um desenho): anel de N trechos (quads) — o mais antigo é reaproveitado. Cada vértice guarda a hora em
// que nasceu e a força da marca; o shader apaga a marca com o tempo (nada de CPU para "envelhecer" as marcas). Só a faixa de trechos
// escrita no quadro sobe para a GPU.
//
// O Vehicle chama `track(car, wheel, x, z, y, k)` para cada roda que está marcando (k = 0..1 = força) e `lift(car)` quando para de
// marcar; `smoke(...)` solta a fumaça. Game.update chama `update(dt)` (relógio do shader).
// ============================================================================

const SkidMarks = {
    N: 1600,            // trechos no anel (~1600 × 0,4 m = 640 m de marcas)
    LIFE: 40,           // segundos até sumir (os últimos 15 s esmaecendo)
    W: 0.2,             // largura da marca (m)
    SEG: 0.35,          // comprimento mínimo de um trecho (m)
    time: 0,
    mesh: null,

    init(scene) {
        if (this.mesh && this.scene === scene) return;
        this.scene = scene;
        const N = this.N;
        this.pos = new Float32Array(N * 12);
        this.col = new Float32Array(N * 16);
        for (let i = 0; i < N; i++) for (let k = 0; k < 4; k++) this.col[i * 16 + k * 4] = -1e4;      // nascidos "há muito tempo": invisíveis
        const idx = new Uint32Array(N * 6);
        for (let i = 0; i < N; i++) { const b = i * 4, o = i * 6; idx[o] = b; idx[o + 1] = b + 1; idx[o + 2] = b + 2; idx[o + 3] = b + 2; idx[o + 4] = b + 1; idx[o + 5] = b + 3; }
        const mesh = new BABYLON.Mesh('skidMarks', scene), vd = new BABYLON.VertexData();
        vd.positions = this.pos; vd.colors = this.col; vd.indices = idx;
        vd.applyToMesh(mesh, true);
        if (!BABYLON.Effect.ShadersStore.skidVertexShader) {
            BABYLON.Effect.ShadersStore.skidVertexShader = `
                precision highp float;
                attribute vec3 position;
                attribute vec4 color;            // r = nascimento (s), g = força (0..1)
                uniform mat4 worldViewProjection;
                uniform float time;
                uniform float life;
                varying float vA;
                void main(void) {
                    float age = time - color.r;
                    vA = color.g * (1.0 - smoothstep(life * 0.62, life, age)) * step(0.0, age);
                    gl_Position = worldViewProjection * vec4(position, 1.0);
                }`;
            BABYLON.Effect.ShadersStore.skidFragmentShader = `
                precision highp float;
                varying float vA;
                uniform vec3 tint;
                void main(void) {
                    if (vA < 0.01) discard;
                    gl_FragColor = vec4(vec3(0.045, 0.043, 0.05) * tint, vA * 0.62);
                }`;
        }
        const m = new BABYLON.ShaderMaterial('skidMat', scene, { vertex: 'skid', fragment: 'skid' }, {
            attributes: ['position', 'color'], uniforms: ['worldViewProjection', 'time', 'life', 'tint'], needAlphaBlending: true,
        });
        m.setFloat('life', this.LIFE);
        m.setColor3('tint', SpriteMaterial.sharedTint());              // (dia/noite: a mesma cor ambiente dos sprites)
        m.disableDepthWrite = true;
        m.backFaceCulling = false;
        mesh.material = m;
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.doNotSyncBoundingInfo = true;
        mesh.alphaIndex = -100;                                   // antes dos outros transparentes do chão (pedestres, poças de luz)
        mesh.isVisible = false;                                   // (aparece com a 1ª marca)
        this.mesh = mesh; this.mat = m;
        this._vbP = mesh.getVertexBuffer(BABYLON.VertexBuffer.PositionKind);
        this._vbC = mesh.getVertexBuffer(BABYLON.VertexBuffer.ColorKind);
        this.next = 0; this._a = Infinity; this._b = -1; this._wrap = false;
        this.time = 0;
    },

    // Um trecho de A até B, largura W, força k.
    _seg(ax, az, bx, bz, y, k) {
        const dx = bx - ax, dz = bz - az, l = Math.sqrt(dx * dx + dz * dz) || 1, nx = -dz / l * this.W * 0.5, nz = dx / l * this.W * 0.5;
        const i = this.next, p = this.pos, c = this.col, o = i * 12, q = i * 16, t = this.time;
        p[o] = ax + nx; p[o + 1] = y; p[o + 2] = az + nz;
        p[o + 3] = ax - nx; p[o + 4] = y; p[o + 5] = az - nz;
        p[o + 6] = bx + nx; p[o + 7] = y; p[o + 8] = bz + nz;
        p[o + 9] = bx - nx; p[o + 10] = y; p[o + 11] = bz - nz;
        for (let v = 0; v < 4; v++) { c[q + v * 4] = t; c[q + v * 4 + 1] = k; }
        if (i < this._a) this._a = i;
        if (i > this._b) this._b = i;
        this.next = (i + 1) % this.N;
        if (this.next === 0) this._wrap = true;
        this.mesh.isVisible = true;
    },

    // Roda `w` do carro está marcando o chão em (x, z), na altura y, com força k (0..1).
    track(car, w, x, z, y, k) {
        if (!this.mesh) return;
        const S = car._skid || (car._skid = []);
        const s = S[w] || (S[w] = { x, z, on: false, k: 0 });
        if (!s.on) { s.on = true; s.x = x; s.z = z; s.k = k; return; }
        const dx = x - s.x, dz = z - s.z, d2 = dx * dx + dz * dz;
        if (d2 < this.SEG * this.SEG) return;
        if (d2 > 9) { s.x = x; s.z = z; return; }                  // salto (teleporte, quadro muito longo): recomeça
        this._seg(s.x, s.z, x, z, y, Math.max(k, s.k) * 0.5 + Math.min(k, s.k) * 0.5);
        s.x = x; s.z = z; s.k = k;
    },
    lift(car) { const S = car._skid; if (S) for (const s of S) if (s) s.on = false; },

    // Fumaça de borracha queimada (branca) saindo da roda.
    smoke(game, x, z, vx, vz, k) {
        if (!game || !game.carLights || Math.random() > k * 0.55) return;
        game.carLights.puffs.emit(x, 0.35, z, -vx * 0.15 + (Math.random() - 0.5) * 1.2, 0.5 + Math.random() * 0.6, -vz * 0.15 + (Math.random() - 0.5) * 1.2,
            0.5, 2.2 + k * 1.6, 1.4 + Math.random() * 0.8, 0.28 + k * 0.25, [0.92, 0.92, 0.94]);
    },

    // Relógio do shader + envio do que foi escrito neste quadro.
    update(dt, tint) {
        if (!this.mesh) return;
        this.time += dt;
        this.mat.setFloat('time', this.time);
        if (tint) this.mat.setColor3('tint', tint);
        if (this._b < 0) return;
        let a = this._a, b = this._b + 1;
        if (this._wrap) { a = 0; b = this.N; this._wrap = false; }        // deu a volta no anel no meio do quadro: manda tudo
        this._vbP.updateDirectly(this.pos.subarray(a * 12, b * 12), a * 12);
        this._vbC.updateDirectly(this.col.subarray(a * 16, b * 16), a * 16);
        this._a = Infinity; this._b = -1;
    },
};
