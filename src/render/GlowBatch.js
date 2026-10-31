// ============================================================================
// GlowBatch — milhares de quads dinâmicos numa ÚNICA malha com cor por vértice
// atualizável: 1 draw call. Três tipos de visual (kind):
//   'glow'  brilho aditivo: núcleo + halo com degradê suave/borrado (lâmpadas, faróis, giroflex, postes)
//   'cone'  feixe de luz aditivo no chão (faróis): trapézio com bordas e ponta difusas
//   'puff'  disco em 3 tons com blending normal (gotas, objetos arremessados; a fumaça dos veículos é a PuffSystem, em CarLights)
//   'ring'  anel suave que se abre (marolas)   'arc'  o pedaço da FRENTE de um anel (a borda v = 0 do quad): onda que vai numa direção
//   'flame' língua de fogo (CarDamage.FireField): cor = (calor 0..1, semente, -, alfa); a base é a borda v = 1, a ponta a v = 0
//   'dash'  traço nítido (blending normal): cápsula clara com contorno escuro ao longo de v — a linha tracejada da mira de arremesso
//           (Throwables); cor = (r, g, b, alfa)
// Desenhado depois do mundo (renderingGroup 1) mas ainda testando profundidade, então
// prédios e árvores na frente escondem a luz como deveriam.
// ============================================================================

class GlowBatch {
    static register() {
        if (GlowBatch._registered) return;
        GlowBatch._registered = true;
        const vertex = `
            precision highp float;
            attribute vec3 position;
            attribute vec2 uv;
            attribute vec4 color;
            uniform mat4 worldViewProjection;
            varying vec2 vUV;
            varying vec4 vColor;
            void main(void) {
                vUV = uv;
                vColor = color;
                gl_Position = worldViewProjection * vec4(position, 1.0);
            }`;
        for (const k of ['glow', 'cone', 'puff', 'ring', 'arc', 'flame', 'dash']) BABYLON.Effect.ShadersStore[k + 'VertexShader'] = vertex;

        // 'dash': cápsula ao longo de v (pontas arredondadas), miolo na cor pedida e contorno escuro fino — legível em qualquer chão.
        BABYLON.Effect.ShadersStore['dashFragmentShader'] = `
            precision highp float;
            varying vec2 vUV;
            varying vec4 vColor;
            uniform float level;
            void main(void) {
                if (vColor.a <= 0.003) discard;
                vec2 p = vUV * 2.0 - 1.0;
                float y = max(abs(p.y) - 0.6, 0.0) / 0.4;                       // (o comprimento é 2,5× a largura: pontas redondas)
                float r = length(vec2(p.x, y));
                if (r >= 1.0) discard;
                float edge = smoothstep(0.55, 0.7, r);
                vec3 c = mix(vColor.rgb, vec3(0.05, 0.05, 0.07), edge);
                float a = 1.0 - smoothstep(0.88, 1.0, r);
                gl_FragColor = vec4(c, vColor.a * a * level);
            }`;

        BABYLON.Effect.ShadersStore['glowFragmentShader'] = `
            precision highp float;
            varying vec2 vUV;
            varying vec4 vColor;
            uniform float level;
            void main(void) {
                if (vColor.a <= 0.003) discard;
                // Degradê suave (blur): núcleo quente e estreito + halo largo, sumindo sem borda no limite do quad.
                float r = length(vUV * 2.0 - 1.0);
                if (r >= 1.0) discard;
                float core = exp(-r * r * 14.0);
                float halo = exp(-r * r * 3.6);
                float a = (core * 0.75 + halo * 0.55) * (1.0 - smoothstep(0.62, 1.0, r));
                if (a < 0.004) discard;
                vec3 c = mix(vColor.rgb, vec3(1.0), core * 0.45) * (1.0 + core * 0.35);
                gl_FragColor = vec4(c, vColor.a * a * level);
            }`;

        // 'ring': anel suave que se abre (marolas na água): brilho concentrado em r ≈ 0,78.
        BABYLON.Effect.ShadersStore['ringFragmentShader'] = `
            precision highp float;
            varying vec2 vUV;
            varying vec4 vColor;
            uniform float level;
            void main(void) {
                if (vColor.a <= 0.003) discard;
                float r = length(vUV * 2.0 - 1.0);
                if (r >= 1.0) discard;
                float d = (r - 0.78) * 6.5;
                float a = exp(-d * d) * (1.0 - smoothstep(0.86, 1.0, r));
                if (a < 0.01) discard;
                gl_FragColor = vec4(vColor.rgb, vColor.a * a * level);
            }`;

        // 'arc': o anel da marola, só o trecho da frente (±~40°, sumindo até ±75°) — a onda que sai na frente de quem anda na água
        // e as da esteira, cada uma indo para o seu lado. A frente é a borda v = 0 do quad (quem emite gira o quad).
        BABYLON.Effect.ShadersStore['arcFragmentShader'] = `
            precision highp float;
            varying vec2 vUV;
            varying vec4 vColor;
            uniform float level;
            void main(void) {
                if (vColor.a <= 0.003) discard;
                vec2 p = vUV * 2.0 - 1.0;
                float r = length(p);
                if (r >= 1.0 || r < 0.05) discard;
                float c = -p.y / r;                                       // cosseno do ângulo com a frente
                float d = (r - 0.78) * 7.5;
                float a = exp(-d * d) * (1.0 - smoothstep(0.86, 1.0, r)) * smoothstep(0.26, 0.78, c);
                if (a < 0.01) discard;
                gl_FragColor = vec4(vColor.rgb, vColor.a * a * level);
            }`;

        // 'flame': uma LÍNGUA DE FOGO — larga e arredondada na base, afinando até a ponta, com as bordas recortadas por ruído que sobe
        // (o fogo "lambe"); cor pelo calor: miolo branco-amarelado, amarelo, laranja, vermelho-escuro nas pontas e ao esfriar. Aditivo.
        BABYLON.Effect.ShadersStore['flameFragmentShader'] = `
            precision highp float;
            varying vec2 vUV;
            varying vec4 vColor;
            uniform float level;
            uniform float time;
            float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
            void main(void) {
                if (vColor.a <= 0.003) discard;
                float y = 1.0 - vUV.y, x = vUV.x * 2.0 - 1.0, s = vColor.g * 37.0;
                // turbulência: duas oitavas de ruído subindo (mais forte na ponta)
                float tb = n2(vec2(x * 2.2 + s, y * 3.0 - time * 3.6 + s)) * 0.65 + n2(vec2(x * 5.0 - s, y * 7.0 - time * 6.5)) * 0.35;
                float xx = x + (tb - 0.5) * 0.7 * (0.25 + y);
                float w = 0.82 * pow(max(1.0 - y, 0.0), 0.72) * smoothstep(-0.05, 0.22, y);       // largura: base cheia, ponta fina
                float d = abs(xx) / max(w, 0.001);
                float body = (1.0 - smoothstep(0.62, 1.0, d)) * smoothstep(0.0, 0.08, y) * (1.0 - smoothstep(0.82, 1.0, y + (tb - 0.5) * 0.25));
                if (body < 0.01) discard;
                float core = (1.0 - smoothstep(0.0, 0.7, d)) * (1.0 - smoothstep(0.1, 0.75, y));
                float t = clamp(vColor.r * (0.55 + 0.55 * core) - y * 0.3 + (tb - 0.5) * 0.15, 0.0, 1.0);
                vec3 c = t < 0.3 ? mix(vec3(0.35, 0.03, 0.0), vec3(0.95, 0.22, 0.02), t / 0.3)
                       : t < 0.62 ? mix(vec3(0.95, 0.22, 0.02), vec3(1.0, 0.62, 0.12), (t - 0.3) / 0.32)
                       : mix(vec3(1.0, 0.62, 0.12), vec3(1.0, 0.95, 0.72), (t - 0.62) / 0.38);
                float a = body * vColor.a * (0.55 + 0.45 * core) * (0.6 + 0.4 * t);
                gl_FragColor = vec4(c * (1.0 + core * 0.4), a * level);
            }`;

        BABYLON.Effect.ShadersStore['coneFragmentShader'] = `
            precision highp float;
            varying vec2 vUV;
            varying vec4 vColor;
            uniform float level;
            void main(void) {
                if (vColor.a <= 0.003) discard;
                // Feixe com bordas laterais e ponta difusas (sem degraus).
                float lat = abs(vUV.x * 2.0 - 1.0);
                float fall = 1.0 - vUV.y;
                // Feixe organico: borda lateral em gaussiana (sem aresta), ponta arredondada e queda suave ao longo do comprimento.
                float lateral = exp(-lat * lat * 2.6);
                float capY = max(0.0, vUV.y - 0.45) / 0.55;
                float cap = 1.0 - smoothstep(0.55, 1.0, sqrt(lat * lat * 0.8 + capY * capY));
                float a = lateral * cap * (0.3 + 0.7 * fall) * 0.75 * smoothstep(0.0, 0.22, vUV.y + 0.03);
                if (a < 0.004) discard;
                gl_FragColor = vec4(vColor.rgb, vColor.a * a * level);
            }`;

        BABYLON.Effect.ShadersStore['puffFragmentShader'] = `
            precision highp float;
            varying vec2 vUV;
            varying vec4 vColor;
            uniform vec3 tint;
            uniform float level;
            void main(void) {
                if (vColor.a <= 0.003) discard;
                float r = length(vUV * 2.0 - 1.0);
                if (r > 1.0) discard;
                float shade = r < 0.42 ? 1.0 : (r < 0.78 ? 0.82 : 0.64);
                gl_FragColor = vec4(vColor.rgb * shade * tint, vColor.a * (r < 0.78 ? 1.0 : 0.7) * level);
            }`;
    }

    // capacity: nº máximo de quads | kind: 'glow' | 'cone' | 'puff' | 'ring' | 'arc' | 'flame' | 'dash'
    constructor(scene, capacity, name = 'glow', kind = 'glow') {
        GlowBatch.register();
        this.count = 0;
        // Faixa de quads alterados desde o último flush (cor e posição): só ela vai para a GPU. Antes o buffer INTEIRO era reenviado a
        // cada mudança — o lote dos postes (14 mil quads, ~1,5 MB) subia por completo a cada degrau do anoitecer, e um único item piscando
        // num lote grande custava o lote todo.
        this._c0 = Infinity; this._c1 = -1;
        this._p0 = Infinity; this._p1 = -1;
        this._level = 1;

        this.mesh = new BABYLON.Mesh(name, scene);
        this._geometry(capacity);

        const m = new BABYLON.ShaderMaterial(name + 'Mat', scene, { vertex: kind, fragment: kind }, {
            attributes: ['position', 'uv', 'color'],
            uniforms: ['worldViewProjection', 'tint', 'level', 'time'],
            needAlphaBlending: true,
        });
        m.alphaMode = kind === 'puff' || kind === 'dash' ? BABYLON.Engine.ALPHA_COMBINE : BABYLON.Engine.ALPHA_ADD;
        m.backFaceCulling = false;
        m.disableDepthWrite = true;
        m.setFloat('level', 1);
        if (kind === 'puff') m.setColor3('tint', SpriteMaterial.sharedTint());
        this.material = m;
        this.mesh.material = m;
        this.mesh.renderingGroupId = 1;
        this.mesh.isPickable = false;
        this.mesh.alwaysSelectAsActiveMesh = true;
        this.mesh.doNotSyncBoundingInfo = true;
        scene.setRenderingAutoClearDepthStencil(1, false);   // mantém a profundidade do mundo.
    }

    // Luz do MUNDO que cai no chão (poça de poste, porta, vitrine): desenhada ANTES dos personagens 2,5D (NpcArt.ALPHA = −1,5), não
    // depois de tudo. Desenhada por último ela somava luz por cima deles (o boneco "estourava" de branco), mas não por cima das motos e
    // carros 3D (que gravam profundidade) — à noite o veículo parecia uma sombra escura sobreposta ao personagem.
    static get UNDER() { return -1.8; }
    under() { this.mesh.alphaIndex = GlowBatch.UNDER; return this; }

    // Intensidade GLOBAL do lote (0..1), multiplicada no shader: acender/apagar todos os postes ao anoitecer custa um uniform, não um
    // reenvio do buffer. Em 0 a malha nem é desenhada.
    setLevel(v) {
        if (v === this._level) return;
        this._level = v;
        this.material.setFloat('level', v);
        this.mesh.isVisible = v > 0;
    }

    // (Re)cria os buffers para `capacity` quads, preservando os que já existem (crescer o lote).
    _geometry(capacity) {
        const pos = new Float32Array(capacity * 12), col = new Float32Array(capacity * 16);
        if (this.pos) { pos.set(this.pos); col.set(this.col); }
        this.pos = pos; this.col = col; this.capacity = capacity;
        const uv = new Float32Array(capacity * 8);
        const idx = capacity * 4 > 65535 ? new Uint32Array(capacity * 6) : new Uint16Array(capacity * 6);
        for (let i = 0; i < capacity; i++) {
            const u = i * 8, b = i * 4, o = i * 6;
            uv[u + 2] = 1; uv[u + 5] = 1; uv[u + 6] = 1; uv[u + 7] = 1;                 // (0,0) (1,0) (0,1) (1,1)
            idx[o] = b + 3; idx[o + 1] = b + 1; idx[o + 2] = b; idx[o + 3] = b + 2; idx[o + 4] = b + 3; idx[o + 5] = b;
        }
        const vd = new BABYLON.VertexData();
        vd.positions = this.pos;
        vd.colors = this.col;
        vd.uvs = uv;
        vd.indices = idx;                                   // (sem normais: o shader não as usa — era memória de vídeo à toa)
        vd.applyToMesh(this.mesh, true);
        this._vbCol = this.mesh.getVertexBuffer(BABYLON.VertexBuffer.ColorKind);
        this._vbPos = this.mesh.getVertexBuffer(BABYLON.VertexBuffer.PositionKind);
        this._c0 = Infinity; this._c1 = -1; this._p0 = Infinity; this._p1 = -1;      // (os buffers novos já subiram inteiros)
    }

    // Reserva um quad e devolve o índice (reaproveita os que foram devolvidos com free). Lote cheio: CRESCE (dobra) — antes lançava
    // um erro que, no meio do quadro, matava o laço do jogo (ex.: muitos carros com farol aceso no teste de carga = jogo congelado).
    alloc() {
        if (this._free && this._free.length) return this._free.pop();
        if (this.count >= this.capacity) {
            const n = Math.max(16, this.capacity * 2);
            console.warn(`[GlowBatch] ${this.mesh.name}: ${this.capacity} → ${n} quads`);
            this._geometry(n);
        }
        return this.count++;
    }

    // Devolve um quad (apagado) para ser reaproveitado.
    free(i) {
        this.off(i);
        (this._free || (this._free = [])).push(i);
    }

    // Quad achatado de lado `size`, centrado em (x, y, z).
    place(i, x, y, z, size) {
        const h = size / 2, p = this.pos, o = i * 12;
        p[o] = x - h; p[o + 1] = y; p[o + 2] = z + h;
        p[o + 3] = x + h; p[o + 4] = y; p[o + 5] = z + h;
        p[o + 6] = x - h; p[o + 7] = y; p[o + 8] = z - h;
        p[o + 9] = x + h; p[o + 10] = y; p[o + 11] = z - h;
        if (i < this._p0) this._p0 = i;
        if (i > this._p1) this._p1 = i;
    }

    // Quad com 4 cantos livres, na ordem (0,0) (1,0) (0,1) (1,1) do UV. Usado pelos cones de luz.
    quad(i, ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz) {
        const p = this.pos, o = i * 12;
        p[o] = ax; p[o + 1] = ay; p[o + 2] = az;
        p[o + 3] = bx; p[o + 4] = by; p[o + 5] = bz;
        p[o + 6] = cx; p[o + 7] = cy; p[o + 8] = cz;
        p[o + 9] = dx; p[o + 10] = dy; p[o + 11] = dz;
        if (i < this._p0) this._p0 = i;
        if (i > this._p1) this._p1 = i;
    }

    color(i, r, g, b, a = 1) {
        const c = this.col, o = i * 16;
        if (c[o] === r && c[o + 1] === g && c[o + 2] === b && c[o + 3] === a) return;
        for (let k = 0; k < 4; k++) { c[o + k * 4] = r; c[o + k * 4 + 1] = g; c[o + k * 4 + 2] = b; c[o + k * 4 + 3] = a; }
        if (i < this._c0) this._c0 = i;
        if (i > this._c1) this._c1 = i;
    }

    off(i) { this.color(i, 0, 0, 0, 0); }

    // Algo mudou desde o último flush?
    get dirty() { return this._c1 >= 0 || this._p1 >= 0; }

    // Envia ao GPU SÓ a faixa de quads que mudou (chame uma vez por frame, depois dos color()/place()).
    flush() {
        if (this._c1 >= 0) { this._vbCol.updateDirectly(this.col.subarray(this._c0 * 16, (this._c1 + 1) * 16), this._c0 * 16); this._c0 = Infinity; this._c1 = -1; }
        if (this._p1 >= 0) { this._vbPos.updateDirectly(this.pos.subarray(this._p0 * 12, (this._p1 + 1) * 12), this._p0 * 12); this._p0 = Infinity; this._p1 = -1; }
    }
}

// ============================================================================
// GlowGrid — brilhos FIXOS espalhados pelo mundo (postes, semáforos, poças das lojas) em vários GlowBatch, um por célula de `cell` u,
// cada um com a caixa envolvente da sua região e matriz congelada: o RenderCuller e o frustum só desenham os da vizinhança da câmera.
// (Um único lote com todos os semáforos ou postes do mapa tinha ~50 mil vértices processados pela GPU todo quadro, quase todos fora da tela.)
// Mesma API do GlowBatch; alloc(x, z) recebe a posição do quad (define o lote). Depois de posicionar tudo, chame seal().
//   xzs: posições [[x, z], …] de TODOS os quads que serão alocados (só para dimensionar cada lote).
// ============================================================================
class GlowGrid {
    constructor(scene, name, xzs, kind = 'glow', cell = Config.world.detailChunk) {
        this.cell = cell;
        const count = new Map();
        for (const [x, z] of xzs) { const k = this._key(x, z); count.set(k, (count.get(k) || 0) + 1); }
        this.batches = [];
        this._byKey = new Map();
        for (const [k, n] of count) {
            const b = new GlowBatch(scene, n, `${name}@${k}`, kind);
            b.mesh.alwaysSelectAsActiveMesh = false;
            b._box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
            this._byKey.set(k, this.batches.length);
            this.batches.push(b);
        }
        this._b = new Int32Array(Math.max(1, xzs.length));          // quad global → lote
        this._i = new Int32Array(Math.max(1, xzs.length));          // quad global → índice no lote
        this.count = 0;
        this._dirty = new Set();
    }

    _key(x, z) { return Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell); }
    under() { for (const b of this.batches) b.under(); return this; }       // (ver GlowBatch.under)

    alloc(x, z) {
        const bi = this._byKey.get(this._key(x, z));
        if (bi === undefined) throw new Error('GlowGrid: posição fora das previstas');
        const h = this.count++;
        this._b[h] = bi; this._i[h] = this.batches[bi].alloc();
        return h;
    }

    place(h, x, y, z, size) {
        const b = this.batches[this._b[h]], B = b._box, r = size / 2;
        b.place(this._i[h], x, y, z, size);
        if (x - r < B[0]) B[0] = x - r; if (y < B[1]) B[1] = y; if (z - r < B[2]) B[2] = z - r;
        if (x + r > B[3]) B[3] = x + r; if (y > B[4]) B[4] = y; if (z + r > B[5]) B[5] = z + r;
        this._dirty.add(b);
    }

    color(h, r, g, b, a = 1) { const B = this.batches[this._b[h]]; B.color(this._i[h], r, g, b, a); this._dirty.add(B); }
    off(h) { this.color(h, 0, 0, 0, 0); }

    flush() { for (const b of this._dirty) b.flush(); this._dirty.clear(); }

    setLevel(v) { for (const b of this.batches) b.setLevel(v); }

    // Fecha a montagem: caixa envolvente de cada lote (a GPU já tem as posições) e matriz congelada (vira malha estática do RenderCuller).
    seal() {
        this.flush();
        for (const b of this.batches) {
            const B = b._box;
            if (B[0] > B[3]) continue;
            b.mesh.setBoundingInfo(new BABYLON.BoundingInfo(new BABYLON.Vector3(B[0], B[1] - 0.5, B[2]), new BABYLON.Vector3(B[3], B[4] + 0.5, B[5])));
            b.mesh.freezeWorldMatrix();
        }
    }
}
