// ============================================================================
// Footprints — PEGADAS na areia: o jogador e os pedestres (banhistas, policiais, traficantes…) deixam a marca de cada passo na praia,
// alternando pé esquerdo e direito, viradas para onde a pessoa anda — mais espaçadas correndo. Elas vão sumindo aos poucos (LIFE s:
// inteiras por uns 60% do tempo e depois esmaecendo), como a areia assentando.
//
// Um lote único (uma malha, um desenho), como o sangue (Blood) e as marcas de pneu (SkidMarks): anel de N pegadas (quads) — a mais
// antiga é reaproveitada. Cada vértice guarda a hora em que nasceu, o lado (esquerdo/direito) e uma semente: o shader desenha a sola
// (planta + calcanhar afundados, com a borda de areia empurrada para fora, mais clara) e apaga com o tempo — nada de CPU por pegada.
// Areia: a mesma regra dos passos (Footsteps): quarteirão de praia (por dentro da calçada) ou o bioma de areia do mapa.
// ============================================================================

const Footprints = {
    N: 700,             // pegadas no anel
    LIFE: 32,           // segundos até sumir
    W: 0.09,            // meia-largura da pegada (m)
    L: 0.17,            // meio-comprimento (m)
    time: 0,
    mesh: null,
    _st: new WeakMap(), // por pessoa: { x, z, d (andado desde o último passo), side }
    _sand: new Map(),   // cache "é areia?" por célula de 2 m

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
        const mesh = new BABYLON.Mesh('footprints', scene), vd = new BABYLON.VertexData();
        vd.positions = this.pos; vd.colors = this.col; vd.uvs = this.uv; vd.indices = idx;
        vd.applyToMesh(mesh, true);
        if (!BABYLON.Effect.ShadersStore.footprintVertexShader) {
            BABYLON.Effect.ShadersStore.footprintVertexShader = `
                precision highp float;
                attribute vec3 position;
                attribute vec4 color;            // r = nascimento (s), g = lado (-1 esquerdo, 1 direito), b = semente, a = força (0..1: correndo afunda mais)
                attribute vec2 uv;               // -1..1 no quad (v: do calcanhar para a ponta)
                uniform mat4 worldViewProjection;
                uniform float time;
                uniform float life;
                varying float vA;
                varying float vSide;
                varying float vSeed;
                varying vec2 vUV;
                void main(void) {
                    float age = time - color.r;
                    vA = color.a * (1.0 - smoothstep(life * 0.6, life, age)) * step(0.0, age) * smoothstep(0.0, 0.15, age);
                    vSide = color.g; vSeed = color.b; vUV = uv;
                    gl_Position = worldViewProjection * vec4(position, 1.0);
                }`;
            BABYLON.Effect.ShadersStore.footprintFragmentShader = `
                precision highp float;
                varying float vA;
                varying float vSide;
                varying float vSeed;
                varying vec2 vUV;
                uniform vec3 tint;
                float h(float n) { return fract(sin(n) * 43758.5453); }
                // distância "elíptica" (< 1 dentro)
                float ell(vec2 p, vec2 c, vec2 r) { vec2 q = (p - c) / r; return dot(q, q); }
                void main(void) {
                    vec2 p = vec2(vUV.x * vSide, vUV.y);                          // espelha o pé esquerdo
                    // sola: planta larga na frente (puxada para o lado de dentro), arco estreito, calcanhar redondo atrás
                    float ball = ell(p, vec2(-0.08, 0.42), vec2(0.78, 0.5));
                    float arch = ell(p, vec2(0.12, -0.05), vec2(0.5, 0.45));
                    float heel = ell(p, vec2(0.05, -0.62), vec2(0.62, 0.36));
                    float toes = ell(p, vec2(-0.15, 0.9), vec2(0.6, 0.16));
                    float d = min(min(ball, heel), min(arch * 1.4, toes * 1.2));
                    float jit = 0.08 * (h(vSeed + floor(p.x * 6.0) * 3.1 + floor(p.y * 9.0) * 7.7) - 0.5);    // grãos na borda
                    float inside = 1.0 - smoothstep(0.75 + jit, 1.0 + jit, d);
                    float rim = smoothstep(0.85, 1.05, d) * (1.0 - smoothstep(1.05, 1.55, d));                  // areia empurrada (clara)
                    vec3 dent = vec3(0.4, 0.31, 0.2), lip = vec3(1.0, 0.93, 0.76);
                    float aDent = inside * (0.68 - 0.22 * smoothstep(0.0, 0.9, d));                               // mais fundo no meio
                    float aLip = rim * 0.35 * step(-0.2, p.y + 0.3);                                             // (a borda aparece mais na frente)
                    float al = max(aDent, aLip) * vA;
                    if (al < 0.015) discard;
                    vec3 col = aDent >= aLip ? dent : lip;
                    gl_FragColor = vec4(col * tint, al);
                }`;
        }
        const m = new BABYLON.ShaderMaterial('footprintMat', scene, { vertex: 'footprint', fragment: 'footprint' }, {
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
        // Depois do mundo (grupo 1, como os brilhos do GlowBatch, testando a profundidade): a água da praia é transparente e desenhada
        // por último no grupo 0 — por cima da areia da beira ela cobriria as pegadas. Os personagens (mais perto da câmera) continuam na frente.
        mesh.renderingGroupId = 1;
        mesh.alphaIndex = -100;
        scene.setRenderingAutoClearDepthStencil(1, false);
        mesh.isVisible = false;                                   // (aparece com a 1ª pegada)
        this.mesh = mesh; this.mat = m;
        this._vbP = mesh.getVertexBuffer(BABYLON.VertexBuffer.PositionKind);
        this._vbC = mesh.getVertexBuffer(BABYLON.VertexBuffer.ColorKind);
        this.next = 0; this._a = Infinity; this._b = -1; this._wrap = false;
        this.time = 0;
    },

    // É areia em (x, z)? (praia por dentro da calçada, ou bioma de areia fora da grade) — com cache por célula de 2 m.
    isSand(x, z) {
        const k = Math.floor(x / 2) * 100003 + Math.floor(z / 2), c = this._sand.get(k);
        if (c !== undefined) return c;
        let s = false;
        const blk = CityGrid._blockAtPoint ? CityGrid._blockAtPoint(x, z) : null;
        if (blk) {
            const b = blk.slab, inner = x > b[0] + 2.2 && x < b[2] - 2.2 && z > b[1] + 2.2 && z < b[3] - 2.2;
            s = inner && (CityGrid.BIOMES[blk.biome] || {}).ground === 'sand';
        } else if (typeof WorldMap !== 'undefined' && WorldMap.biomeAt) s = WorldMap.biomeAt(x, z) === WorldMap.B.SAND;
        if (this._sand.size > 20000) this._sand.clear();
        this._sand.set(k, s);
        return s;
    },

    // Uma pegada em (x, z) virada para (fx, fz). side: -1 esquerdo, 1 direito. k: força (correndo afunda mais).
    print(x, z, y, fx, fz, side, k) {
        if (!this.mesh) return;
        const d = Math.hypot(fx, fz) || 1, ux = fx / d, uz = fz / d, W = this.W, L = this.L;
        const ax = ux * L, az = uz * L, px = uz * W, pz = -ux * W;                // (px, pz) = para a direita de quem anda
        const i = this.next, p = this.pos, c = this.col, o = i * 12, q = i * 16, t = this.time, s = Math.random() * 97;
        // uv: (-1,-1) (1,-1) (-1,1) (1,1) → x = esquerda→direita, y = calcanhar→ponta
        p[o] = x - px - ax; p[o + 1] = y; p[o + 2] = z - pz - az;
        p[o + 3] = x + px - ax; p[o + 4] = y; p[o + 5] = z + pz - az;
        p[o + 6] = x - px + ax; p[o + 7] = y; p[o + 8] = z - pz + az;
        p[o + 9] = x + px + ax; p[o + 10] = y; p[o + 11] = z + pz + az;
        for (let v = 0; v < 4; v++) { c[q + v * 4] = t; c[q + v * 4 + 1] = side; c[q + v * 4 + 2] = s; c[q + v * 4 + 3] = k; }
        if (i < this._a) this._a = i;
        if (i > this._b) this._b = i;
        this.mesh.isVisible = true;
        this.next = (i + 1) % this.N;
        if (this.next === 0) this._wrap = true;
    },

    // Quem anda na areia deixa um passo a cada meia passada (andando ~0,7 m, correndo ~1,05 m), alternando os pés.
    _walk(ent, x, z, run, y = 0.205) {
        let S = this._st.get(ent);
        if (!S) { S = { x, z, d: 0, side: 1, fx: 0, fz: 1 }; this._st.set(ent, S); return; }
        const dx = x - S.x, dz = z - S.z, m = Math.hypot(dx, dz);
        S.x = x; S.z = z;
        if (m < 0.002 || m > 3) { if (m > 3) S.d = 0; return; }                  // parado / teleporte
        S.fx += (dx / m - S.fx) * 0.5; S.fz += (dz / m - S.fz) * 0.5;           // direção suavizada (curvas sem pegada torta)
        S.d += m;
        const step = run ? 1.05 : 0.7;
        if (S.d < step) return;
        S.d -= step;
        S.side = -S.side;
        if (!this.isSand(x, z) || MapGeo.waterDepth(x, z) > 0) return;
        const l = Math.hypot(S.fx, S.fz) || 1, ux = S.fx / l, uz = S.fz / l;
        this.print(x + uz * 0.11 * S.side, z - ux * 0.11 * S.side, y, ux, uz, S.side, run ? 0.95 : 0.8);
    },

    update(dt, game) {
        if (!this.mesh) return;
        this.time += dt;
        this.mat.setFloat('time', this.time);
        if (game) {
            const pl = game.player;
            if (pl && game.mode === 'player' && pl.alive && !pl.rag && !pl.swimming && !(typeof Interiors !== 'undefined' && Interiors.active) && !pl.onDeck)
                this._walk(pl, pl.position.x, pl.position.z, pl.state === 'sprint');
            const near = (e) => e.alive && !e.rag && e.actor && (typeof Zones === 'undefined' || Zones.near(e.position.x, e.position.z, 12));
            const M = game.npcManager;
            if (M) for (const n of M.npcs) if (near(n)) this._walk(n, n.position.x, n.position.z, n.fleeing || n.state === 'FLEE');
            if (game.policeManager) for (const o of game.policeManager.officers) if (near(o)) this._walk(o, o.position.x, o.position.z, false);
            if (game.gangs) for (const o of game.gangs.members) if (near(o)) this._walk(o, o.position.x, o.position.z, false);
        }
        if (this._b < 0) return;
        let a = this._a, b = this._b + 1;
        if (this._wrap) { a = 0; b = this.N; this._wrap = false; }
        this._vbP.updateDirectly(this.pos.subarray(a * 12, b * 12), a * 12);
        this._vbC.updateDirectly(this.col.subarray(a * 16, b * 16), a * 16);
        this._a = Infinity; this._b = -1;
    },
};
