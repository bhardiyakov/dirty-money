// ============================================================================
// SparkFx — efeitos de partícula em lote (cada tipo é UMA malha / um desenho; anel de N partículas atualizadas na CPU, que só
// sobe para a GPU quando há alguma viva):
//
//   • 'spark'   faísca em RISCO: quad fino esticado na direção em que voa (mais rápida = mais comprida), brilho aditivo — ponta
//               quente quase branca, cauda laranja; perde velocidade e apaga em ~0,2–0,5 s (pneu furado, ricochete, boca do cano);
//   • 'chunk'   lasca escura e irregular de borracha, girando, que voa e some;
//   • 'flash'   o FOGO da boca do cano: núcleo branco, línguas de fogo irregulares para a frente, pétalas em estrela dos lados;
//               dura ~70 ms (cada tiro sorteia o formato);
//   • 'casing'  CÁPSULA ejetada: sai pela direita da arma girando, escorrega e fica no chão uns segundos (latão; cartucho vermelho
//               da escopeta);
//   • 'tracer'  TRAÇANTE da bala: risco luminoso do trecho já percorrido até a bala (posições dadas pelo Combat a cada quadro).
//
// API: burst()/trail() (pneu — Combat._tireShot / Vehicle._rimFx), muzzle()/casing() (Combat.fire), impact() (ricochete),
// tracer(i, …)/tracerOff(i)/flushTracers() (Combat.update).
// ============================================================================

class ParticleStreaks {
    // kind: 'spark' | 'chunk' | 'flash' | 'casing' | 'tracer'
    constructor(scene, N, kind) {
        this.N = N; this.kind = kind; this.next = 0;
        this.p = []; for (let i = 0; i < N; i++) this.p.push({ t: 1, max: 1 });
        this.pos = new Float32Array(N * 12); this.col = new Float32Array(N * 16);
        const uv = new Float32Array(N * 8), idx = new Uint32Array(N * 6);
        for (let i = 0; i < N; i++) {
            uv.set([0, 0, 1, 0, 0, 1, 1, 1], i * 8);
            const b = i * 4, o = i * 6; idx[o] = b; idx[o + 1] = b + 1; idx[o + 2] = b + 2; idx[o + 3] = b + 2; idx[o + 4] = b + 1; idx[o + 5] = b + 3;
        }
        const mesh = new BABYLON.Mesh('fx_' + kind, scene), vd = new BABYLON.VertexData();
        vd.positions = this.pos; vd.colors = this.col; vd.uvs = uv; vd.indices = idx;
        vd.applyToMesh(mesh, true);
        ParticleStreaks.register();
        const frag = { spark: 'fxSpark', tracer: 'fxSpark', chunk: 'fxChunk', flash: 'fxFlash', casing: 'fxCasing' }[kind];
        const add = kind === 'spark' || kind === 'tracer' || kind === 'flash';
        const m = new BABYLON.ShaderMaterial('fxMat_' + kind, scene, { vertex: 'fxStreak', fragment: frag },
            { attributes: ['position', 'color', 'uv'], uniforms: ['worldViewProjection', 'tint'], needAlphaBlending: true });
        if (add) m.alphaMode = BABYLON.Engine.ALPHA_ADD;
        else m.setColor3('tint', SpriteMaterial.sharedTint());
        m.disableDepthWrite = true; m.backFaceCulling = false;
        mesh.material = m; mesh.isPickable = false; mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true;
        if (kind === 'casing') { mesh.renderingGroupId = 0; mesh.alphaIndex = -97; }                 // no chão (sob os personagens), como o sangue
        else { mesh.renderingGroupId = 1; mesh.alphaIndex = { spark: -1.2, tracer: -1.18, flash: -1.15, chunk: -1.25 }[kind]; }   // por cima de carros e pedestres, sob as copas
        mesh.isVisible = false;
        this.mesh = mesh;
        this._vbP = mesh.getVertexBuffer(BABYLON.VertexBuffer.PositionKind);
        this._vbC = mesh.getVertexBuffer(BABYLON.VertexBuffer.ColorKind);
        this._dirty = false;
    }

    static register() {
        if (ParticleStreaks._reg) return;
        ParticleStreaks._reg = true;
        BABYLON.Effect.ShadersStore.fxStreakVertexShader = `
            precision highp float;
            attribute vec3 position; attribute vec4 color; attribute vec2 uv;
            uniform mat4 worldViewProjection;
            varying vec4 vC; varying vec2 vUV;
            void main(void) { vC = color; vUV = uv; gl_Position = worldViewProjection * vec4(position, 1.0); }`;
        // faísca / traçante: uv.x = 0 cauda → 1 ponta; uv.y = largura. Cor em rgb (a = brilho que resta).
        BABYLON.Effect.ShadersStore.fxSparkFragmentShader = `
            precision highp float;
            varying vec4 vC; varying vec2 vUV;
            void main(void) {
                if (vC.a <= 0.004) discard;
                float across = 1.0 - abs(vUV.y * 2.0 - 1.0);
                float body = smoothstep(0.0, 0.55, across) * smoothstep(0.0, 0.35, vUV.x);
                float hot = smoothstep(0.6, 1.0, vUV.x) * smoothstep(0.35, 1.0, across);
                vec3 c = mix(vC.rgb * vec3(1.0, 0.55, 0.25), vC.rgb, vUV.x) + vec3(1.0, 0.95, 0.8) * hot * 0.8;
                float a = body * vC.a;
                gl_FragColor = vec4(c * a, a);
            }`;
        // lasca: forma irregular (cantos recortados pela "semente" em vC.b) em tons de borracha.
        BABYLON.Effect.ShadersStore.fxChunkFragmentShader = `
            precision highp float;
            varying vec4 vC; varying vec2 vUV;
            uniform vec3 tint;
            void main(void) {
                if (vC.a <= 0.01) discard;
                vec2 p = vUV * 2.0 - 1.0;
                float s = vC.b * 31.0, r = 0.75 + 0.25 * sin(atan(p.y, p.x) * 3.0 + s) + 0.12 * sin(atan(p.y, p.x) * 5.0 + s * 1.7);
                if (length(p) > r) discard;
                vec3 c = mix(vec3(0.05, 0.05, 0.06), vec3(0.2, 0.2, 0.22), vC.r) * tint;
                gl_FragColor = vec4(c, vC.a);
            }`;
        // fogo da boca do cano (quad quadrado: comprimento L ao longo do tiro × largura W): uv.x = 0 atrás do cano → 1 à frente;
        // uv.y = através. vC.b = semente (formato), vC.r = tamanho do núcleo, vC.g = W / L / 2 (para medir ângulos sem distorção).
        // Estrela de PÉTALAS (lobos) em ângulos fixos com tremor sorteado: longa para a frente, diagonais, laterais e uma curtinha
        // para trás; borda serrilhada; núcleo branco e halo.
        BABYLON.Effect.ShadersStore.fxFlashFragmentShader = `
            precision highp float;
            varying vec4 vC; varying vec2 vUV;
            float lobe(float a, float a0, float wd, float r, float len) { float d = (a - a0) / wd; return exp(-d * d) * exp(-r / len); }
            void main(void) {
                if (vC.a <= 0.004) discard;
                float s = vC.b * 40.0;
                vec2 q = vec2(vUV.x - 0.3, (vUV.y * 2.0 - 1.0) * vC.g);          // em "comprimentos" a partir do núcleo
                float r = length(q), a = atan(q.y, q.x), aa = abs(a);
                float l = lobe(a, 0.06 * sin(s), 0.2, r, 0.3)
                        + lobe(aa, 0.55 + 0.1 * sin(s * 1.7), 0.15, r, 0.17 + 0.05 * sin(s * 2.3))
                        + lobe(aa, 1.35 + 0.12 * sin(s * 1.3), 0.17, r, 0.13 + 0.04 * sin(s * 3.1))
                        + lobe(aa, 2.5, 0.3, r, 0.05) * 0.6;
                l *= 0.72 + 0.28 * sin(r * 70.0 - a * 6.0 + s);                // borda serrilhada / línguas
                float core = exp(-r * r / (0.0035 + 0.003 * vC.r));
                float halo = exp(-r * r / 0.035) * 0.45;
                float i = clamp(l * 1.25 + core * 1.9 + halo, 0.0, 1.9);
                vec3 c = mix(vec3(1.0, 0.36, 0.08), vec3(1.0, 0.78, 0.32), clamp(i, 0.0, 1.0));
                c = mix(c, vec3(1.0, 0.98, 0.9), clamp(core * 1.3, 0.0, 1.0));
                float al = clamp(i, 0.0, 1.0) * vC.a;
                gl_FragColor = vec4(c * al, al);
            }`;
        // cápsula: cilindro curto visto de cima — latão com brilho no meio e a boca escura numa ponta; vC.r > 0,5 = cartucho
        // de escopeta (corpo vermelho com a base de latão).
        BABYLON.Effect.ShadersStore.fxCasingFragmentShader = `
            precision highp float;
            varying vec4 vC; varying vec2 vUV;
            uniform vec3 tint;
            void main(void) {
                if (vC.a <= 0.01) discard;
                vec2 p = vUV * 2.0 - 1.0;
                vec2 e = vec2(max(abs(p.x) - 0.62, 0.0) / 0.38, p.y);
                if (length(e) > 1.0) discard;
                float sh = 1.0 - abs(p.y);
                vec3 brass = mix(vec3(0.42, 0.28, 0.07), vec3(0.98, 0.8, 0.36), sh * sh) + vec3(0.35, 0.3, 0.2) * smoothstep(0.75, 1.0, sh);
                vec3 red = mix(vec3(0.35, 0.03, 0.03), vec3(0.85, 0.15, 0.12), sh * sh);
                vec3 c = vC.r > 0.5 ? (p.x < -0.35 ? brass : red) : brass;
                if (p.x > 0.82 && vC.r < 0.5) c *= 0.35;                      // boca da cápsula
                gl_FragColor = vec4(c * tint, vC.a);
            }`;
    }

    // Nova partícula: posição, velocidade (m/s), vida (s), comprimento/largura (m), cor/dados [r,g,b], giro, ângulo (flash).
    emit(x, y, z, vx, vz, life, len, w, r = 1, g = 0.8, b = 0.35, spin = 0, ang = null) {
        const q = this.p[this.next];
        q.x = x; q.y = y; q.z = z; q.vx = vx; q.vz = vz; q.t = 0; q.max = life; q.len = len; q.w = w; q.r = r; q.g = g; q.b = b;
        q.spin = spin; q.ang = ang == null ? Math.random() * 6.28 : ang;
        this.next = (this.next + 1) % this.N;
        this.mesh.isVisible = true;
    }

    _quad(i, cx, cy, cz, dx, dz, L, W, r, g, b, a) {
        const P = this.pos, C = this.col, o = i * 12, c = i * 16;
        const hx = dx * L * 0.5, hz = dz * L * 0.5, nx = -dz * W * 0.5, nz = dx * W * 0.5;
        // cantos: 0 trás-esq, 1 frente-esq, 2 trás-dir, 3 frente-dir (uv: x ao longo, y através)
        P[o] = cx - hx + nx; P[o + 1] = cy; P[o + 2] = cz - hz + nz;
        P[o + 3] = cx + hx + nx; P[o + 4] = cy; P[o + 5] = cz + hz + nz;
        P[o + 6] = cx - hx - nx; P[o + 7] = cy; P[o + 8] = cz - hz - nz;
        P[o + 9] = cx + hx - nx; P[o + 10] = cy; P[o + 11] = cz + hz - nz;
        for (let k = 0; k < 4; k++) { C[c + k * 4] = r; C[c + k * 4 + 1] = g; C[c + k * 4 + 2] = b; C[c + k * 4 + 3] = a; }
    }

    // Traçante (posições dadas): de (x0, z0) a (x1, z1).
    line(i, x0, z0, x1, z1, y, w, r, g, b, a) {
        const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 0.001;
        this._quad(i, (x0 + x1) / 2, y, (z0 + z1) / 2, dx / L, dz / L, L, w, r, g, b, a);
        this.mesh.isVisible = true; this._dirty = true;
    }
    lineOff(i) { const c = i * 16; if (this.col[c + 3] !== 0) { for (let k = 0; k < 4; k++) this.col[c + k * 4 + 3] = 0; this._dirty = true; } }
    flushLines() {
        if (!this._dirty) return;
        this._dirty = false;
        this._vbP.updateDirectly(this.pos, 0); this._vbC.updateDirectly(this.col, 0);
        let any = false; for (let i = 3; i < this.col.length; i += 16) if (this.col[i] > 0) { any = true; break; }
        this.mesh.isVisible = any;
    }

    update(dt) {
        if (!this.mesh.isVisible || this.kind === 'tracer') return;
        const C = this.col, k = this.kind;
        let n = 0;
        for (let i = 0; i < this.N; i++) {
            const q = this.p[i], c = i * 16;
            if (q.t >= q.max) { if (C[c + 3] !== 0) { for (let j = 0; j < 4; j++) C[c + j * 4 + 3] = 0; } continue; }
            n++;
            q.t += dt;
            const drag = Math.exp(-({ spark: 3.2, chunk: 4.5, casing: 5.5, flash: 0 }[k]) * dt);
            q.vx *= drag; q.vz *= drag;
            q.x += q.vx * dt; q.z += q.vz * dt;
            const life = Math.max(0, 1 - q.t / q.max);
            if (k === 'spark') {
                const sp = Math.hypot(q.vx, q.vz) || 0.001;
                this._quad(i, q.x, q.y, q.z, q.vx / sp, q.vz / sp, Math.min(q.len, 0.15 + sp * 0.11), q.w, q.r, q.g, q.b, life * life * 1.4);
            } else if (k === 'flash') {
                const dx = Math.sin(q.ang), dz = Math.cos(q.ang), L = q.len * (0.85 + 0.3 * (1 - life));
                this._quad(i, q.x + dx * L * 0.2, q.y, q.z + dz * L * 0.2, dx, dz, L, q.w * (0.85 + 0.3 * (1 - life)), q.r, q.g, q.b, Math.min(1, life * 1.6));      // (núcleo na boca do cano: 30% do quad)
            } else {
                q.ang += q.spin * dt; q.spin *= Math.exp(-(k === 'casing' ? 2.2 : 0) * dt);
                const L = q.len, W = k === 'casing' ? q.w : q.len;
                this._quad(i, q.x, q.y, q.z, Math.cos(q.ang), Math.sin(q.ang), L, W, q.r, q.g, q.b, k === 'casing' ? Math.min(1, (q.max - q.t) / 1.5) : Math.min(1, life * 3));
            }
        }
        this._vbP.updateDirectly(this.pos, 0); this._vbC.updateDirectly(C, 0);
        if (!n) this.mesh.isVisible = false;
    }
}

const SparkFx = {
    sparks: null, chunks: null, flashes: null, casings: null, tracers: null,
    init(scene) {
        if (this.sparks && this.scene === scene) return;
        this.scene = scene;
        this.sparks = new ParticleStreaks(scene, 420, 'spark');
        this.chunks = new ParticleStreaks(scene, 90, 'chunk');
        this.flashes = new ParticleStreaks(scene, 24, 'flash');
        this.casings = new ParticleStreaks(scene, 160, 'casing');
        this.tracers = new ParticleStreaks(scene, 48, 'tracer');           // (um por bala do Combat: o índice é o da bala)
    },
    update(dt) {
        if (!this.sparks) return;
        this.sparks.update(dt); this.chunks.update(dt); this.flashes.update(dt); this.casings.update(dt);
    },

    // Leque de faíscas saindo de (x, z): direção-base (bx, bz) normalizada, abertura `spread` (rad), n riscos, velocidade [v0, v1].
    _fan(x, z, y, bx, bz, spread, n, v0, v1, life = 0.35, len = 1.0, w = 0.06) {
        for (let i = 0; i < n; i++) {
            const a = (Math.random() - 0.5) * spread, c = Math.cos(a), s = Math.sin(a), v = v0 + Math.random() * (v1 - v0);
            const dx = bx * c - bz * s, dz = bx * s + bz * c, hot = Math.random();
            this.sparks.emit(x + (Math.random() - 0.5) * 0.2, y, z + (Math.random() - 0.5) * 0.2, dx * v, dz * v, life * (0.5 + Math.random()),
                len * (1 + Math.random() * 1.4), w * (1 + Math.random() * 0.8), 1, 0.62 + 0.3 * hot, 0.22 + 0.25 * hot);
        }
    },

    // ------------------------------------------------------------------ tiro
    // Tamanho do fogo e da fumaça por arma: [comprimento, largura, faíscas, fumaça] (m).
    MUZZLE: { pistol: [1.05, 1.0, 3, 1], revolver: [1.3, 1.25, 4, 2], smg: [1.0, 0.95, 2, 1], shotgun: [1.7, 1.65, 7, 3], rifle: [1.45, 1.3, 3, 2], ak47: [1.5, 1.35, 4, 2] },
    // Cápsula: [comprimento, largura, cartucho de escopeta?] — o revólver não ejeta.
    SHELL: { pistol: [0.17, 0.08, 0], smg: [0.17, 0.08, 0], rifle: [0.26, 0.09, 0], ak47: [0.26, 0.095, 0], shotgun: [0.3, 0.14, 1] },

    // Fogo na boca do cano em (x, z), apontando para `angle` (rad, 0 = norte): clarão em estrela, umas faíscas para a frente e
    // fumaça que fica no ar.
    muzzle(game, x, z, angle, weapon, y = 1.15) {
        if (!this.flashes) return;
        const M = this.MUZZLE[weapon] || this.MUZZLE.pistol, fx = Math.sin(angle), fz = Math.cos(angle);
        const k = 0.85 + Math.random() * 0.3;
        this.flashes.emit(x, y + 0.05, z, 0, 0, 0.055 + Math.random() * 0.03, M[0] * k, M[1] * k, Math.random(), M[1] / M[0] / 2, Math.random(), 0, angle + (Math.random() - 0.5) * 0.08);
        this._fan(x + fx * 0.25, z + fz * 0.25, y, fx, fz, 0.9, M[2], 8, 16, 0.14, 0.5, 0.04);
        const pf = game && game.carLights && game.carLights.puffs;
        if (pf) for (let i = 0; i < M[3]; i++) pf.emit(x + fx * (0.3 + i * 0.25), y, z + fz * (0.3 + i * 0.25), fx * (0.6 + Math.random()) + (Math.random() - 0.5) * 0.5, 0.35, fz * (0.6 + Math.random()) + (Math.random() - 0.5) * 0.5, 0.25, 1.1 + M[0] * 0.5, 0.9 + Math.random() * 0.6, 0.2, [0.62, 0.62, 0.64]);
    },

    // Cápsula ejetada pela DIREITA da arma de quem atirou em (x, z), olhando para `angle`: gira, escorrega e fica no chão.
    casing(x, z, angle, weapon) {
        const S = this.SHELL[weapon];
        if (!S || !this.casings) return;
        const fx = Math.sin(angle), fz = Math.cos(angle), rx = fz, rz = -fx;                    // direita = frente girada 90°
        const v = 2.4 + Math.random() * 2.2, back = 0.4 + Math.random() * 1.1;
        this.casings.emit(x + fx * 0.5 + rx * 0.25, 0.22, z + fz * 0.5 + rz * 0.25, rx * v - fx * back + (Math.random() - 0.5) * 0.8, rz * v - fz * back + (Math.random() - 0.5) * 0.8,
            6 + Math.random() * 3, S[0], S[1], S[2], 0, 0, (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 16));
    },

    // Ricochete: a bala bateu em parede/carro em (x, z) vindo na direção (dx, dz): faíscas espirrando de volta e para os lados.
    impact(x, z, dx, dz, y = 1.2, n = 6) {
        if (!this.sparks) return;
        const l = Math.hypot(dx, dz) || 1;
        this._fan(x, z, y, -dx / l, -dz / l, 2.4, n, 4, 11, 0.22, 0.6, 0.045);
    },

    // Traçante da bala i: do rabo (x0, z0) à ponta (x1, z1). (Combat chama todo quadro; flushTracers no fim.)
    tracer(i, x0, z0, x1, z1, y = 1.3, w = 0.08) { if (this.tracers) this.tracers.line(i, x0, z0, x1, z1, y, w, 1, 0.86, 0.5, 1); },
    tracerOff(i) { if (this.tracers) this.tracers.lineOff(i); },
    flushTracers() { if (this.tracers) this.tracers.flushLines(); },

    // ------------------------------------------------------------------ pneu furado
    // Estouro do pneu: chuva de faíscas para os dois lados e para trás, lascas de borracha voando e um sopro de fumaça.
    burst(game, x, z, car) {
        if (!this.sparks) return;
        const v = car ? car.velocity : { x: 0, z: 0 }, sp = Math.hypot(v.x, v.z), f = car ? car.fwdToRef(new BABYLON.Vector3()) : { x: 0, z: 1 };
        const rx = f.z, rz = -f.x, bx = sp > 1 ? -v.x / sp : -f.x, bz = sp > 1 ? -v.z / sp : -f.z;
        this._fan(x, z, 0.55, rx, rz, 1.6, 22, 7, 19, 0.5);
        this._fan(x, z, 0.55, -rx, -rz, 1.6, 22, 7, 19, 0.5);
        this._fan(x, z, 0.55, bx, bz, 1.1, 18, 6, 15 + sp * 0.5, 0.5);
        for (let i = 0; i < 12; i++) {
            const a = Math.random() * 6.28, s = 2 + Math.random() * 5;
            this.chunks.emit(x, 0.5, z, Math.cos(a) * s + v.x * 0.4, Math.sin(a) * s + v.z * 0.4, 0.6 + Math.random() * 0.7, 0.08 + Math.random() * 0.12, 0, Math.random(), 0, Math.random(), (Math.random() - 0.5) * 18);
        }
        const pf = game && game.carLights && game.carLights.puffs;
        if (pf) for (let i = 0; i < 4; i++) pf.emit(x, 0.5, z, (Math.random() - 0.5) * 1.5 + v.x * 0.3, 0.6, (Math.random() - 0.5) * 1.5 + v.z * 0.3, 0.4, 1.8, 0.8 + Math.random() * 0.4, 0.4, [0.55, 0.55, 0.57]);
    },

    // Aro raspando no asfalto (todo quadro, roda furada, carro andando): leque mais curto e "sutil" para trás e para o lado de fora,
    // umas lasquinhas de vez em quando e fumaça cinza fina.
    trail(game, car, wx, wz, outX, outZ, dt) {
        if (!this.sparks) return;
        const v = car.velocity, sp = Math.hypot(v.x, v.z);
        if (sp < 2.5) return;
        const bx = -v.x / sp, bz = -v.z / sp, rate = 34 + sp * 4.5;               // riscos por segundo (sobe com a velocidade)
        const n = rate * dt, k = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
        for (let i = 0; i < k; i++) {
            const side = Math.random() < 0.6, dx = side ? bx * 0.55 + outX * 0.8 : bx, dz = side ? bz * 0.55 + outZ * 0.8 : bz, l = Math.hypot(dx, dz) || 1;
            this._fan(wx, wz, 0.4, dx / l, dz / l, 1.0, 1, 5 + sp * 0.3, 10 + sp * 0.6, 0.34);
        }
        if (Math.random() < dt * (1.5 + sp * 0.12)) this.chunks.emit(wx, 0.45, wz, bx * (2 + Math.random() * 3) + outX * 2, bz * (2 + Math.random() * 3) + outZ * 2, 0.5 + Math.random() * 0.5, 0.05 + Math.random() * 0.07, 0, Math.random(), 0, Math.random(), (Math.random() - 0.5) * 14);
        const pf = game && game.carLights && game.carLights.puffs;
        if (pf && Math.random() < dt * 7) pf.emit(wx, 0.45, wz, bx * 1.2 + (Math.random() - 0.5), 0.5, bz * 1.2 + (Math.random() - 0.5), 0.3, 1.4 + sp * 0.04, 0.6 + Math.random() * 0.4, 0.22, [0.5, 0.5, 0.52]);
    },
};
