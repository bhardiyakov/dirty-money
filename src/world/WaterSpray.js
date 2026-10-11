// ============================================================================
// WaterSpray — água JORRANDO em pixel art. A folha de quadros é desenhada aqui mesmo, por código (WaterSprayArt), na paleta e nas
// fases de um jorro de verdade: os jatos sobem em leque, estouram em espuma, viram gotas que caem e assentam numa marola.
// Dois desenhos — 'plume' (leque inclinado para um lado, onda quebrando) e 'crown' (coroa simétrica) — em um tipo por USO, cada um
// já no tamanho em que aparece e na densidade de pixel do resto do jogo (KINDS): proa do jet ski e da lancha, rabo de galo de lado
// e de trás, espuma da hélice (BoatManager._spray), a mão de cada braçada e as pernadas (WaterFx.track), o tchibum (WaterFx.burst).
// emit(x, z, o): o quad nasce com a BASE no ponto da água e fica "de pé" para cima da TELA (gira com a câmera bússola, como os
// personagens 2,5D); o jato inclina para o lado da direção pedida (espelhado quando ela aponta para a esquerda da tela) e pode
// andar junto com quem o soltou (vx, vz), perdendo velocidade. Tudo numa malha dinâmica (1 draw call). Dono: WaterFx.
// SUAVE: o desenho é pixel art, mas aparece desfocado — filtro bilinear + o shader tira a média de 9 amostras em volta (miolo) e
// mistura 8 mais afastadas (uma névoa clara em volta do jorro), com alfa pré-multiplicado (sem contorno escuro). Força em SOFT.
// ============================================================================

const WaterSprayArt = {
    // paleta (do fundo para a espuma): azul fundo, azul, azul médio, ciano, ciano claro, espuma
    PAL: [[20, 66, 140], [36, 104, 192], [70, 154, 222], [128, 202, 240], [192, 236, 251], [244, 253, 255]],
    // Um tipo por USO, já no tamanho em que aparece: 20 px = 1 u (1 m), a mesma densidade de pixel dos carros, barcos e personagens —
    // o quad nunca é esticado (pixel maior ou menor que o do resto do jogo fica falso). w×h px · type: 'plume' (leque inclinado,
    // onda quebrando para um lado) | 'crown' (coroa simétrica) · ax: onde fica a base do jorro (fração da largura) · spread: abertura
    // da coroa (1 = leque largo).
    KINDS: {
        bowL:   { w: 32, h: 18, type: 'plume', frames: 10, vars: 3, ax: 0.14 },              // proa da lancha e do barco; curva da lancha
        bowS:   { w: 22, h: 13, type: 'plume', frames: 9, vars: 3, ax: 0.14 },               // proa do jet ski (e da lancha devagar)
        tail:   { w: 28, h: 24, type: 'plume', frames: 10, vars: 3, ax: 0.14 },              // rabo de galo visto de lado; curva do jet ski
        tailC:  { w: 18, h: 24, type: 'crown', frames: 10, vars: 3, ax: 0.5, spread: 0.45 }, // rabo de galo visto de trás/de frente
        churn:  { w: 22, h: 10, type: 'crown', frames: 8, vars: 3, ax: 0.5 },                // espuma da hélice (baixa e larga)
        stroke: { w: 13, h: 11, type: 'crown', frames: 8, vars: 4, ax: 0.5, spread: 0.8 },   // mão entrando na água (crawl)
        kick:   { w: 9, h: 7, type: 'crown', frames: 6, vars: 3, ax: 0.5, spread: 0.8 },     // pernada; cabeça saindo no nado peito
        burst:  { w: 34, h: 32, type: 'crown', frames: 10, vars: 2, ax: 0.5, spread: 0.8 },  // tchibum: mergulho da ponte, explosão na água
    },

    G: 4,                     // margem vazia (px) em volta de cada quadro na folha: o desfoque do shader não puxa o quadro vizinho
    E: 3,                     // quanto o quad passa do quadro (px de cada lado): a névoa do desfoque não fica cortada na borda

    // Monta (uma vez) a folha: linhas = tipo × variante, colunas = quadros (cada um numa célula com margem G). RGB pré-multiplicado
    // pelo alfa (o vazio é preto transparente: o filtro bilinear não escurece a borda). → { data RGBA, W, H, E, rect(kind, v, f) }
    build() {
        if (this._atlas) return this._atlas;
        const K = this.KINDS, names = Object.keys(K), G = this.G, E = this.E;
        const W = Math.max(...names.map((n) => (K[n].w + 2 * G) * K[n].frames));
        let H = 0;
        const row0 = {};
        for (const n of names) { row0[n] = H; H += (K[n].h + 2 * G) * K[n].vars; }
        const data = new Uint8Array(W * H * 4);
        for (const n of names) {
            const k = K[n];
            for (let v = 0; v < k.vars; v++) {
                const els = this._elements(n, k, v);
                for (let f = 0; f < k.frames; f++) {
                    const grid = this._frame(n, k, els, f / (k.frames - 1));
                    const ox = f * (k.w + 2 * G) + G, oy = row0[n] + v * (k.h + 2 * G) + G;
                    for (let y = 0; y < k.h; y++) for (let x = 0; x < k.w; x++) {
                        const c = grid[y * k.w + x];
                        if (c < 0) continue;
                        const o = ((oy + y) * W + ox + x) * 4, p = this.PAL[c];
                        data[o] = p[0]; data[o + 1] = p[1]; data[o + 2] = p[2]; data[o + 3] = 255;
                    }
                }
            }
        }
        const rect = (n, v, f) => {                                                    // o quadro + E px de cada lado
            const k = K[n], x0 = f * (k.w + 2 * G) + G - E, y0 = row0[n] + v * (k.h + 2 * G) + G - E;
            return [x0 / W, y0 / H, (x0 + k.w + 2 * E) / W, (y0 + k.h + 2 * E) / H];
        };
        return (this._atlas = { data, W, H, E, rect });
    },

    // Os elementos de uma variante (fixos em todos os quadros, para a animação ser contínua): o corpo do jorro, os jatos da crista,
    // os bolos de espuma e as gotas. Tudo em proporção do quadro (w, h): o mesmo desenho serve do respingo da braçada ao tchibum.
    _elements(name, k, v) {
        let s = 9137 + v * 7919 + name.length * 104729 + k.w * 31;
        const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
        const crown = k.type === 'crown', w = k.w, h = k.h, base = h - 2, x0 = w * k.ax, sp0 = k.spread || 1;
        const cl = (x, a, b) => Math.max(a, Math.min(b, Math.round(x)));
        const jets = [], foam = [], drops = [], bubbles = [];
        // corpo: plume = rampa que sobe da base para a frente (onda quebrando para a direita); crown = monte baixo no meio
        const body = crown ? { x0: x0 - w * 0.21, w: w * 0.42, H: h * 0.3, peak: 0.5 } : { x0: x0 - w * 0.06, w: w * (0.66 + rnd() * 0.08), H: h * (0.55 + rnd() * 0.12), peak: 0.62 + rnd() * 0.1 };
        body.ph = rnd() * 6.28;
        const nJ = crown ? cl(w / 3, 4, 7) : cl(w / 3.7, 5, 13);
        for (let j = 0; j < nJ; j++) {
            const u = (j + 0.5) / nJ + (rnd() - 0.5) * 0.05;
            // plume: os jatos nascem na crista do corpo e apontam para cima e para a frente (mais deitados na frente);
            // crown: leque aberto para os dois lados, os do meio mais altos
            const ang = crown ? (-1.0 + 2.0 * u + (rnd() - 0.5) * 0.3 + (v - 1) * 0.07) * sp0 : (0.35 + u * 0.75 + (rnd() - 0.5) * 0.35);
            const L = crown ? h * (0.42 + 0.4 * (1 - Math.abs(u - 0.5) * 2) + rnd() * 0.12) : h * (0.2 + 0.32 * rnd()) * (0.55 + 0.8 * Math.sin(Math.PI * Math.min(1, u * 1.1)));
            jets.push({ u, dx: Math.sin(ang), dy: -Math.cos(ang), L, r: h * (crown ? 0.04 + rnd() * 0.03 : 0.022 + rnd() * 0.022), droop: L * (crown ? 0.45 : 0.35), delay: rnd() * 0.1 });
        }
        const nF = crown ? cl(w / 8, 1, 3) : cl(w / 5.3, 2, 9), fu = 0.45 + rnd() * 0.2;  // (plume: um cacho de bolos, como couve-flor)
        for (let i = 0; i < nF; i++) foam.push({ u: crown ? 0.35 + rnd() * 0.3 : fu + (rnd() - 0.5) * 0.4, a: 0.6 + rnd() * 0.5, R: h * (crown ? 0.075 + rnd() * 0.05 : 0.07 + rnd() * 0.06), t0: 0.15 + rnd() * 0.16 });
        const nD = crown ? cl(w / 2, 4, 12) : cl(w / 2, 6, 24), small = h < 14;
        for (let i = 0; i < nD; i++) {
            const j = jets[Math.floor(rnd() * nJ)], sp = (0.6 + rnd() * 0.8) * h * (crown ? 0.9 : 0.75);
            drops.push({ j, tb: 0.22 + rnd() * 0.38, vx: j.dx * sp * (crown ? 1.0 : 1.3) + (rnd() - 0.3) * w * 0.17, vy: j.dy * sp * (crown ? 0.7 : 0.45) - rnd() * h * 0.1, size: !small && rnd() < 0.35 ? 2 : 1 });
        }
        if (!small) for (let i = 0; i < (crown ? 3 : 5); i++) bubbles.push({ x: x0 + (rnd() - 0.3) * w * (crown ? 0.7 : 0.6), y: base - h * 0.08 - rnd() * h * 0.15, t0: 0.62 + rnd() * 0.2 });
        return { body, jets, foam, drops, bubbles, base, x0, crown, g: h * (crown ? 3.5 : 1.5), vf: Math.sqrt(40 / h) };
    },

    // Um quadro (t = 0..1 da animação) como grade de índices da paleta (-1 = vazio).
    _frame(name, k, E, t) {
        const w = k.w, h = k.h, base = E.base, crown = E.crown, B = E.body, vf = E.vf;
        const den = new Float32Array(w * h);
        const put = (x, y, d) => { x |= 0; y |= 0; if (x < 1 || y < 1 || x >= w - 1 || y > base) return; const i = y * w + x; if (d > den[i]) den[i] = d; };
        const sstep = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
        // altura e largura do corpo no tempo: sobe rápido, se espalha para a frente e assenta numa marola baixa
        const rise = sstep(0, crown ? 0.28 : 0.34, t), fall = sstep(crown ? 0.45 : 0.5, 1, t);
        const bH = Math.max(1.5, B.H * rise * (1 - 0.88 * fall)), bW = B.w * (0.45 + 0.55 * rise) * (1 + fall * (crown ? 0.4 : 0.55));
        const top = (u) => {                                                          // crista do corpo em u = 0..1 (y em px)
            if (u <= 0 || u >= 1) return base;
            const p = B.peak, f = u < p ? Math.pow(u / p, crown ? 1.0 : 1.7) : Math.pow(1 - (u - p) / (1 - p), crown ? 1.0 : 0.8);
            return base - bH * f;
        };
        // corpo: azul médio, mais claro no alto, com veios claros inclinados (o "redemoinho" da água subindo)
        for (let x = Math.floor(B.x0); x <= B.x0 + bW + 1; x++) {
            const u = (x - B.x0) / bW, ty = top(u);
            for (let y = Math.floor(ty); y <= base + 1; y++) {
                const hf = (base - y) / Math.max(1, bH), xr = x - B.x0, vein = Math.sin((xr * (crown ? 0.45 : 0.42) - (base - y) * (crown ? 0.25 : 0.75)) * vf + Math.sin(xr * 0.21 * vf + B.ph) * 1.4 + B.ph + t * 3);
                put(x, y, 0.27 + 0.2 * hf + (vein > 0.72 ? 0.22 : vein < -0.8 ? -0.08 : 0));
            }
        }
        // jatos da crista: espinhos finos que saem do alto do corpo, crescem, se soltam por cima (viram gotas) e afinam
        for (const j of E.jets) {
            const grow = sstep(0.04, crown ? 0.34 : 0.42, t - j.delay), cut = Math.max(0, (t - 0.4) / 0.48) * 0.98, thin = 1 - 0.5 * Math.max(0, (t - 0.42) / 0.58);
            if (grow <= cut + 0.02) continue;
            const ox = B.x0 + j.u * bW, oy = top(j.u) + 1, steps = Math.ceil(j.L * 1.6) + 2;
            for (let i = 0; i <= steps; i++) {
                const sA = cut + (grow - cut) * (i / steps);
                const px = ox + j.dx * j.L * sA, py = oy + j.dy * j.L * sA + j.droop * sA * sA * (0.3 + t);
                const r = (j.r * (1 - 0.7 * sA) + 0.4) * thin, R = Math.ceil(r + 1);
                for (let yy = -R; yy <= R; yy++) for (let xx = -R; xx <= R; xx++) {
                    const d = 1 - Math.hypot(xx, yy) / (r + 0.35);
                    if (d > 0) put(px + xx, py + yy, 0.3 + d * (0.5 - 0.2 * sA));
                }
            }
        }
        // espuma: bolos brancos que incham por cima do corpo no meio do jorro e murcham
        for (const f of E.foam) {
            const g = Math.sin(Math.PI * Math.max(0, Math.min(1, (t - f.t0) / 0.5)));
            if (g <= 0.08) continue;
            const R = f.R * g, cx = B.x0 + f.u * bW, cy = top(f.u) + (base - top(f.u)) * (1 - f.a) * 0.35 + R * 0.15;
            for (let yy = -Math.ceil(R); yy <= R; yy++) for (let xx = -Math.ceil(R); xx <= R; xx++) {
                const d = 1 - Math.hypot(xx, yy * 1.15) / R;
                if (d > 0) put(cx + xx, cy + yy, 0.5 + d * 0.55);
            }
        }
        // índices da paleta pela "densidade"; a linha d'água sempre azul
        const out = new Int8Array(w * h).fill(-1);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const d = den[y * w + x];
            if (d <= 0.02) continue;
            let c = d > 0.86 ? 5 : d > 0.66 ? 4 : d > 0.44 ? 3 : d > 0.3 ? 2 : 1;
            if (y >= base) c = d > 0.36 ? 1 : 2; else if (y >= base - 1) c = Math.min(c, 2);      // (linha d'água: azul, sem virar uma régua escura)
            out[y * w + x] = c;
        }
        // volume: luz de cima à esquerda (a borda de cima clareia), sombra embaixo à direita
        const sh = Int8Array.from(out);
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
            const i = y * w + x, c = out[i];
            if (c < 0 || y >= base - 1) continue;
            if (out[i - w] < 0 || out[i - 1] < 0) { if (c < 5) sh[i] = Math.min(5, c + (c >= 3 ? 2 : 1)); }
            else if (out[i + w] < 0 || out[i + 1] < 0) sh[i] = Math.max(1, c - 1);
        }
        const set = (xx, yy, c) => { if (xx > 0 && xx < w - 1 && yy > 0 && yy < base - 1) sh[yy * w + xx] = c; };
        // gotas: saem das pontas dos jatos, sobem e caem (miolo claro, um pixel azul embaixo)
        for (const d of E.drops) {
            const a = t - d.tb;
            if (a <= 0) continue;
            const j = d.j, ox = B.x0 + j.u * B.w, oy = base - B.H * 0.8;
            const xi = Math.round(ox + j.dx * j.L + d.vx * a), yi = Math.round(oy + j.dy * j.L + d.vy * a + E.g * a * a);
            if (yi >= base - 1) continue;
            set(xi, yi, d.size > 1 ? 5 : 4);
            if (d.size > 1) { set(xi + 1, yi, 4); set(xi, yi + 1, 3); set(xi + 1, yi + 1, 2); } else set(xi, yi + 1, 2);
        }
        // no fim: bolhas estourando na superfície (anelzinho claro) e um risco de espuma sobre a marola
        for (const b of E.bubbles) {
            if (t < b.t0) continue;
            const xi = Math.round(b.x + (t - b.t0) * w * 0.12), yi = Math.round(b.y);
            set(xi, yi - 1, 4); set(xi - 1, yi, 3); set(xi + 1, yi, 3); set(xi, yi + 1, 2);
        }
        if (t > 0.55) for (let x = Math.floor(B.x0 + bW * 0.1); x < B.x0 + bW * (0.55 + 0.3 * fall); x++) if (Math.sin(x * 0.7 + B.ph) > -0.3) set(x, base - 2, 4);
        return sh;
    },
};

class WaterSpray {
    constructor(scene, capacity = 96) {
        this.scene = scene;
        this.n = capacity;
        const A = WaterSprayArt.build();
        this.atlas = A;
        const tex = BABYLON.RawTexture.CreateRGBATexture(A.data, A.W, A.H, scene, false, false, BABYLON.Texture.BILINEAR_SAMPLINGMODE);
        tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        WaterSpray._register();
        const m = new BABYLON.ShaderMaterial('waterSprayMat', scene, { vertex: 'waterSpray', fragment: 'waterSpray' }, {
            attributes: ['position', 'uv', 'color'], uniforms: ['worldViewProjection', 'tint', 'texel', 'soft'], samplers: ['atlas'], needAlphaBlending: true,
        });
        m.setTexture('atlas', tex);
        m.setVector2('texel', new BABYLON.Vector2(1 / A.W, 1 / A.H));
        const S = WaterSpray.SOFT;
        m.setVector3('soft', new BABYLON.Vector3(S.blur, S.mist, S.mistMix));
        m.setColor3('tint', SpriteMaterial.sharedTint());                  // (dia/noite: a mesma cor ambiente dos sprites)
        m.alphaMode = BABYLON.Engine.ALPHA_PREMULTIPLIED;
        m.backFaceCulling = false;
        m.disableDepthWrite = true;
        const n = capacity, pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), col = new Float32Array(n * 16), idx = new Uint16Array(n * 6);
        for (let i = 0; i < n; i++) { const b = i * 4; idx.set([b + 3, b + 1, b, b + 2, b + 3, b], i * 6); }
        const mesh = this.mesh = new BABYLON.Mesh('waterSpray', scene);
        const vd = new BABYLON.VertexData();
        vd.positions = pos; vd.uvs = uv; vd.colors = col; vd.indices = idx;
        vd.applyToMesh(mesh, true);
        mesh.material = m;
        mesh.renderingGroupId = 1;                                         // (depois do mundo, testando a profundidade: a ponte cobre)
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.doNotSyncBoundingInfo = true;
        mesh.isVisible = false;
        scene.setRenderingAutoClearDepthStencil(1, false);
        this.pos = pos; this.uv = uv; this.col = col;
        this.p = [];
        for (let i = 0; i < n; i++) this.p.push({ on: false });
        this.next = 0;
        this.live = 0;
    }

    // Desfoque (em px da folha = px do jogo): blur = raio do miolo, mist = raio da névoa em volta, mistMix = quanto da névoa entra.
    static get SOFT() { return { blur: 0.9, mist: 2.2, mistMix: 0.3 }; }

    static _register() {
        if (WaterSpray._reg) return;
        WaterSpray._reg = true;
        BABYLON.Effect.ShadersStore['waterSprayVertexShader'] = `
            precision highp float;
            attribute vec3 position;
            attribute vec2 uv;
            attribute vec4 color;
            uniform mat4 worldViewProjection;
            varying vec2 vUV;
            varying vec4 vColor;
            void main(void) { vUV = uv; vColor = color; gl_Position = worldViewProjection * vec4(position, 1.0); }`;
        BABYLON.Effect.ShadersStore['waterSprayFragmentShader'] = `
            precision highp float;
            varying vec2 vUV;
            varying vec4 vColor;
            uniform sampler2D atlas;
            uniform vec3 tint;
            uniform vec2 texel;
            uniform vec3 soft;
            vec4 tap(vec2 o) { return texture2D(atlas, vUV + o * texel); }
            void main(void) {
                if (vColor.a <= 0.01) discard;
                float r = soft.x, R = soft.y, d = soft.y * 0.7071;
                // miolo: média ponderada 3×3 (1 2 1) — tira o serrilhado do pixel art
                vec4 c = tap(vec2(0.0)) * 4.0
                    + (tap(vec2(r, 0.0)) + tap(vec2(-r, 0.0)) + tap(vec2(0.0, r)) + tap(vec2(0.0, -r))) * 2.0
                    + tap(vec2(r, r)) + tap(vec2(-r, r)) + tap(vec2(r, -r)) + tap(vec2(-r, -r));
                c /= 16.0;
                // névoa: 8 amostras mais longe, misturadas por cima (borda esfumaçada, como borrifo)
                vec4 h = tap(vec2(R, 0.0)) + tap(vec2(-R, 0.0)) + tap(vec2(0.0, R)) + tap(vec2(0.0, -R))
                    + tap(vec2(d, d)) + tap(vec2(-d, d)) + tap(vec2(d, -d)) + tap(vec2(-d, -d));
                c = mix(c, h / 8.0, soft.z);
                if (c.a < 0.01) discard;
                gl_FragColor = vec4(c.rgb * tint * vColor.rgb, c.a) * vColor.a;      // (pré-multiplicado)
            }`;
    }

    // Um jorro em (x, z) — a base na água. o = { kind (WaterSprayArt.KINDS), dir: [dx, dz] para onde a água vai (inclina o leque
    // para esse lado da tela), life (s; padrão: ~18 quadros/s), vx/vz (m/s: anda junto com quem soltou, perdendo velocidade — drag/s),
    // a (opacidade), v (variante; sorteada se faltar) }. Sempre no tamanho da folha: 20 px = 1 u, como o resto do jogo.
    emit(x, z, o = {}) {
        const kind = o.kind || 'bowL', K = WaterSprayArt.KINDS[kind];
        let q = null;
        for (let k = 0; k < this.n; k++) { const c = this.p[(this.next + k) % this.n]; if (!c.on) { q = c; this.next = (this.next + k + 1) % this.n; break; } }
        if (!q) { q = this.p[this.next]; this.next = (this.next + 1) % this.n; }      // (cheio: troca o mais antigo da fila)
        if (!q.on) this.live++;
        q.on = true; q.kind = kind; q.K = K; q.age = 0; q.life = o.life || K.frames * 0.055;
        q.v = o.v != null ? o.v : Math.floor(Math.random() * K.vars);
        q.x = x; q.z = z; q.vx = o.vx || 0; q.vz = o.vz || 0; q.drag = o.drag != null ? o.drag : 2.2; q.a = o.a != null ? o.a : 0.94;
        q.dx = o.dir ? o.dir[0] : 1; q.dz = o.dir ? o.dir[1] : 0; q.f = -1;
    }

    update(dt) {
        if (!this.live && !this._drawn) return;
        const yaw = typeof CompassCamera !== 'undefined' ? CompassCamera.yaw || 0 : 0;
        const ux = Math.sin(yaw), uz = Math.cos(yaw), rx = uz, rz = -ux;                  // "para cima" e "para a direita" da TELA, no chão
        const P = this.pos, UV = this.uv, C = this.col, ppu = 20, Y = 0.66;
        let live = 0;
        for (let i = 0; i < this.n; i++) {
            const q = this.p[i];
            if (!q.on) continue;
            q.age += dt;
            const o = i * 12;
            if (q.age >= q.life) { q.on = false; for (let k = 0; k < 16; k++) C[i * 16 + k] = 0; P.fill(0, o, o + 12); continue; }
            live++;
            q.x += q.vx * dt; q.z += q.vz * dt;
            const drag = Math.max(0, 1 - q.drag * dt); q.vx *= drag; q.vz *= drag;
            const K = q.K, E = this.atlas.E, w = (K.w + 2 * E) / ppu, h = (K.h + 2 * E) / ppu, e = E / ppu;      // (o quad passa E px do quadro)
            const flip = q.dx * rx + q.dz * rz < 0, ax = (E + (flip ? 1 - K.ax : K.ax) * K.w) / (K.w + 2 * E);   // (água indo para a esquerda da tela: espelha)
            const lx = q.x - rx * w * ax - ux * e, lz = q.z - rz * w * ax - uz * e, Rx = rx * w, Rz = rz * w, Ux = ux * h, Uz = uz * h;
            // cantos na ordem do UV (0,0) (1,0) (0,1) (1,1): em cima à esquerda, em cima à direita, embaixo à esquerda, embaixo à direita
            P[o] = lx + Ux; P[o + 1] = Y; P[o + 2] = lz + Uz;
            P[o + 3] = lx + Rx + Ux; P[o + 4] = Y; P[o + 5] = lz + Rz + Uz;
            P[o + 6] = lx; P[o + 7] = Y; P[o + 8] = lz;
            P[o + 9] = lx + Rx; P[o + 10] = Y; P[o + 11] = lz + Rz;
            const f = Math.min(K.frames - 1, Math.floor(q.age / q.life * K.frames));
            if (f !== q.f || flip !== q.flip) {
                q.f = f; q.flip = flip;
                const [u0, v0, u1, v1] = this.atlas.rect(q.kind, q.v, f), a = flip ? u1 : u0, b = flip ? u0 : u1, u = i * 8;
                UV[u] = a; UV[u + 1] = v0; UV[u + 2] = b; UV[u + 3] = v0; UV[u + 4] = a; UV[u + 5] = v1; UV[u + 6] = b; UV[u + 7] = v1;
            }
            const fade = q.a * Math.min(1, (1 - q.age / q.life) * 4);                         // (some no último quarto)
            for (let k = 0; k < 4; k++) { const c = i * 16 + k * 4; C[c] = 1; C[c + 1] = 1; C[c + 2] = 1; C[c + 3] = fade; }
        }
        const m = this.mesh;
        m.updateVerticesData(BABYLON.VertexBuffer.PositionKind, P, false, false);
        m.updateVerticesData(BABYLON.VertexBuffer.UVKind, UV, false, false);
        m.updateVerticesData(BABYLON.VertexBuffer.ColorKind, C, false, false);
        m.isVisible = live > 0;
        this._drawn = live > 0;
        this.live = live;
    }
}
