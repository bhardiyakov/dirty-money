// ============================================================================
// CarArt — os carros a partir do ATLAS PRONTO (assets/cars/carros-atlas.js, gerado por tools/carros/index.html): desenho vetorial
// visto de cima, rasterizado a 40 px/m. Nada é desenhado por código na carga (antes: ~70 ms de CPU por modelo × 32 direções, mais
// amassados e portas assados no meio do jogo).
//
//   • UMA imagem por modelo, girada no shader (o sprite acompanha o carro em qualquer ângulo, sem as 32 direções de antes);
//   • a PINTURA vem de uma tabela (linha = variante, a mesma numeração de CarSheet.PAINTS): cor = K + M1·pintura + M2·pintura2;
//   • os AMASSADOS (fases 0..3) já estão no atlas como limiar + desvio de cor: trocar de fase é mudar um número, sem outra textura;
//   • TODOS os carros do mundo são quads de um único lote (CarBatch): 1 chamada de desenho para os carros e 1 para as portas abertas.
//   • RELEVO (atlas C: altura + normais + vidros, ver tools/carros/atlas.js): o shader ilumina cada carro com o SOL DO MUNDO
//     (setSun, chamado pelo DayNight) — o lado virado para o sol clareia, o outro escurece, a lataria tem brilho e os vidros refletem
//     o céu. A luz não gira junto com o carro: ao fazer uma curva o brilho "escorre" pela carroceria, e é isso que o faz parecer 3D.
//     Força em Config.art.carRelief (0 = o desenho plano de antes). Atlas antigo, sem C: textura neutra (carro plano, como antes).
//
// Formato do atlas (duas texturas com o mesmo layout, pré-multiplicadas pelo alfa — ver tools/carros/atlas.js):
//   A = (K.r, K.g, K.b, alfa)      B = (M1, M2, limiar do amassado, desvio do amassado)
// Os PNGs vêm em base64 dentro do .js (funciona também em file://) e são lidos pelo decodificador do SpriteIO (sem o navegador
// pré-multiplicar nem perder os canais de dados).
// ============================================================================

const CarArt = {
    data: null,            // CAR_ATLAS (metadados + PNGs)
    scene: null,           // cena do jogo (CarLibrary): o atlas sobe para a GPU no 1º carro, se ninguém chamou init antes
    ready: null,           // Promise: PNGs do atlas decodificados (começa ao carregar a página, em segundo plano)
    _px: null,             // pixels decodificados { A, B, ms } até subirem para a GPU
    _scene: null,
    _tex: null,            // { a, b, paints }
    _preview: null,        // cópia a meia resolução (A e B) para as miniaturas do HUD
    material: null,
    doorMaterial: null,
    cars: null,            // CarBatch dos carros
    doors: null,           // CarBatch das portas abertas (desenhado depois dos carros)
    tires: null,           // CarBatch das rodas da frente (antes dos carros: só a borda aparece, e mais quando esterçam)

    available() { return typeof CAR_ATLAS !== 'undefined' && !!CAR_ATLAS.models; },

    // Fator de tamanho de TODOS os veículos (carros, motos, bicicletas, barcos): Config.vehicle.scale.
    get K() { return (typeof Config !== 'undefined' && Config.vehicle.scale) || 1; },

    // Aumenta os veículos do atlas em CarArt.K: o desenho (m.k, lido pelo CarActor) e todas as medidas em metros do modelo —
    // comprimento/largura (física e sombra), faróis, porta, rodas, giroflex, caçamba. Uma vez só, antes de qualquer um ler o catálogo.
    _scaleCars() {
        const k = this.K;
        if (CAR_ATLAS._scaled || k === 1) return;
        CAR_ATLAS._scaled = true;
        const mul = (o, keys) => { if (o) for (const f of keys) if (typeof o[f] === 'number') o[f] *= k; };
        for (const m of Object.values(CAR_ATLAS.models)) {
            m.k = k;
            mul(m, ['len', 'wid']);
            mul(m.lamps, ['x', 'zF', 'zR']);
            mul(m.door, ['len', 'thick', 'hingeZ', 'hingeX']);
            mul(m.siren, ['z', 'x']);
            mul(m.bed, ['z0', 'z1']);
            mul(m.tire, ['z', 'x', 'len', 'wid']);
        }
    },

    // Cópia de uma ficha de veículo escrita à mão (motos, barcos: Bikes.MODELS, BoatSheet.MODELS) com as medidas em CarArt.K.
    scaledSpec(spec) {
        const k = this.K, s = Object.assign({}, spec);
        if (k === 1) return s;
        s.len *= k; s.wid *= k;
        if (spec.lamps) s.lamps = { x: spec.lamps.x * k, zF: spec.lamps.zF * k, zR: spec.lamps.zR * k };
        return s;
    },
    // Banco do piloto (m no referencial do veículo) em CarArt.K.
    scaledSeat(seat) { const k = this.K; return seat && { z: seat.z * k, x: seat.x * k }; },
    model(id) { return CAR_ATLAS.models[id] || null; },

    _bytes(b64) { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; },

    // Decodifica os dois PNGs com a descompressão nativa do navegador, sem travar a página (chamado ao carregar o script: quando o
    // jogador clica em "novo jogo" já está pronto). A carga do jogo espera `ready` antes de criar o trânsito.
    load() {
        if (this.ready) return this.ready;
        const t0 = performance.now(), D = this.data = CAR_ATLAS;
        this.ready = Promise.all([PNG.decodeAsync(this._bytes(D.a)), PNG.decodeAsync(this._bytes(D.b)), D.c ? PNG.decodeAsync(this._bytes(D.c)) : null])
            .then(([a, b, c]) => { if (!this._tex) this._px = { A: a.data, B: b.data, C: c ? c.data : null, ms: performance.now() - t0 }; })
            .catch((e) => console.warn('[CARROS] atlas: decodificação assíncrona falhou, vai na hora', e));
        return this.ready;
    },

    // Sobe o atlas para a GPU e cria os lotes. Idempotente (uma vez por cena). Sem os pixels prontos (load não terminou), decodifica na
    // hora (síncrono, mais lento).
    init(scene) {
        if (this._scene === scene) return;
        const t0 = performance.now();
        const D = this.data = CAR_ATLAS, W = D.w, H = D.h;
        let px = this._px, how = 'em segundo plano';
        if (!px) { px = { A: PNG.decode(this._bytes(D.a)).data, B: PNG.decode(this._bytes(D.b)).data, C: D.c ? PNG.decode(this._bytes(D.c)).data : null, ms: performance.now() - t0 }; how = 'na hora'; }
        this._px = null;
        const A = px.A, B = px.B;
        const t1 = performance.now();
        const tex = (data) => {
            const t = new BABYLON.RawTexture(data, W, H, BABYLON.Constants.TEXTUREFORMAT_RGBA, scene, true, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE, BABYLON.Constants.TEXTURETYPE_UNSIGNED_BYTE);
            t.wrapU = t.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
            t.anisotropicFilteringLevel = 1;
            return t;
        };
        // relevo: sem o atlas C, 1 pixel neutro (altura 0, normal para cima, sem vidro) — o carro sai plano, como antes
        const C = px.C ? tex(px.C) : BABYLON.RawTexture.CreateRGBATexture(new Uint8Array([0, 128, 128, 0]), 1, 1, scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
        this._tex = { a: tex(A), b: tex(B), c: C, paints: this._paintTable(scene) };
        this._preview = this._half(A, B, W, H);
        this._scene = scene;
        this.material = this._makeMaterial(scene, 'carArt');
        this.doorMaterial = this._makeMaterial(scene, 'carArtDoors');
        this.cars = new CarBatch(scene, 256, 'carBatch', this.material, -3);
        this.doors = new CarBatch(scene, 32, 'carDoorBatch', this.doorMaterial, -2);
        this.tires = new CarBatch(scene, 128, 'carTireBatch', this.material, -4);          // rodas da frente (esterçam): por BAIXO dos carros
        scene.onBeforeRenderObservable.add(() => { this.cars.flush(); this.tires.flush(); this.doors.flush(); });
        this.stats = { decodeMs: Math.round(px.ms), async: how !== 'na hora', gpuMs: Math.round(performance.now() - t1), models: Object.keys(D.models).length };
        console.log(`[CARROS] atlas ${W}×${H} (${this.stats.models} modelos): PNG ${this.stats.decodeMs} ms (${how}), GPU ${this.stats.gpuMs} ms`);
    },

    // Tabela de pinturas (linha = variante): [pintura, pintura 2, efeitos (r = carcaça queimada, g = desbotado), -].
    _paintTable(scene) {
        const P = CarSheet.PAINTS, n = P.length, d = new Uint8Array(4 * n * 4);
        const hex = (h) => [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16));
        P.forEach((p, row) => {
            const a = hex(p.paint), b = hex(p.paint2 || p.paint), o = row * 16;
            d.set([a[0], a[1], a[2], 255, b[0], b[1], b[2], 255, p.burnt ? 255 : 0, p.worn ? 255 : 0, 0, 255, 0, 0, 0, 255], o);
        });
        const t = BABYLON.RawTexture.CreateRGBATexture(d, 4, n, scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
        t.wrapU = t.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        t._rows = n;
        return t;
    },

    // Atlas a meia resolução (média 2×2 pré-multiplicada) para as miniaturas: o atlas inteiro não fica na RAM (só 1/4 dele).
    _half(A, B, W, H) {
        const w = W >> 1, h = H >> 1, a = new Uint8Array(w * h * 4), b = new Uint8Array(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const o = (y * w + x) * 4, i0 = ((2 * y) * W + 2 * x) * 4, i1 = i0 + 4, i2 = i0 + W * 4, i3 = i2 + 4;
            for (let k = 0; k < 4; k++) {
                a[o + k] = (A[i0 + k] + A[i1 + k] + A[i2 + k] + A[i3 + k] + 2) >> 2;
                b[o + k] = k === 2 ? Math.min(B[i0 + k], B[i1 + k], B[i2 + k], B[i3 + k]) : (B[i0 + k] + B[i1 + k] + B[i2 + k] + B[i3 + k] + 2) >> 2;
            }
        }
        return { w, h, a, b };
    },

    _makeMaterial(scene, name) {
        if (!BABYLON.Effect.ShadersStore.carArtVertexShader) {
            BABYLON.Effect.ShadersStore.carArtVertexShader = `
                precision highp float;
                attribute vec3 position;
                attribute vec2 uv;
                attribute vec4 color;
                attribute vec2 hd;
                uniform mat4 worldViewProjection;
                varying vec2 vUV;
                varying vec4 vC;
                varying vec2 vHd;
                void main(void) {
                    vUV = uv;
                    vC = color;
                    vHd = hd;
                    gl_Position = worldViewProjection * vec4(position, 1.0);
                }`;
            // color: r = variante (linha da tabela de pinturas), g = sombra de prédio (1 = sol), b = fase do amassado (0..3), a = opacidade
            // hd = (seno, cosseno) do ângulo do quad: leva a normal do relevo (espaço da imagem: x = frente, y = lado direito) para o mundo
            BABYLON.Effect.ShadersStore.carArtFragmentShader = `
                precision highp float;
                varying vec2 vUV;
                varying vec4 vC;
                varying vec2 vHd;
                uniform sampler2D atlasA;
                uniform sampler2D atlasB;
                uniform sampler2D atlasC;
                uniform sampler2D paints;
                uniform float paintRows;
                uniform vec3 tint;
                uniform vec3 sunL;              // direção PARA o sol (mundo, normalizada)
                uniform vec3 sunC;              // cor do sol × intensidade relativa (0 = sem sol)
                uniform float relief;           // força do relevo (Config.art.carRelief)
                void main(void) {
                    vec4 a = texture2D(atlasA, vUV);
                    if (a.a < 0.004) discard;
                    vec4 b = texture2D(atlasB, vUV);
                    float row = (floor(vC.r + 0.5) + 0.5) / paintRows;
                    vec3 p1 = texture2D(paints, vec2(0.125, row)).rgb;
                    vec3 p2 = texture2D(paints, vec2(0.375, row)).rgb;
                    vec2 fx = texture2D(paints, vec2(0.625, row)).rg;
                    vec3 c = a.rgb + b.r * p1 + b.g * p2;                                   // (pré-multiplicado)
                    float on = step(b.b * 255.0, vC.b * 64.0 + 0.5);                       // a marca já aparece nesta fase?
                    float s = b.a * 255.0 / 128.0 - 1.0;                                   // <0 escurece, >0 clareia
                    c = mix(c, s < 0.0 ? c * (1.0 + s) : c + (vec3(a.a) - c) * min(1.0, s * 1.008), on);
                    float l = dot(c, vec3(0.3, 0.59, 0.11));
                    c = mix(c, vec3(l) * 0.96, fx.g * 0.35);                               // tinta desbotada (carro velho)
                    c = mix(c, vec3(0.07, 0.06, 0.055) * a.a + l * vec3(0.2, 0.18, 0.16), fx.r);   // carcaça queimada
                    // ---- relevo: normal da imagem → mundo (frente F, direita R, cima Y); céu (de cima) + sol, relativo a uma superfície
                    // plana (teto/capô ficam como o desenho; laterais e rampas clareiam ou escurecem conforme o lado do sol)
                    vec4 rl = texture2D(atlasC, vUV);
                    vec2 nt = (rl.gb * 255.0 - 128.0) / 127.0;
                    float nz = sqrt(max(0.0, 1.0 - dot(nt, nt)));
                    vec3 F = vec3(vHd.x, 0.0, vHd.y), R = vec3(vHd.y, 0.0, -vHd.x);
                    vec3 N = normalize(nt.x * F + nt.y * R + vec3(0.0, nz, 0.0));
                    float sh = clamp((vC.g - 0.62) / 0.38, 0.0, 1.0);                       // na sombra de prédio: sem sol direto
                    vec3 sun = sunC * sh;
                    float sunI = dot(sun, vec3(0.333));
                    float sky = 0.62 + 0.38 * N.y, sky0 = 1.0;
                    float dif = max(dot(N, sunL), 0.0), dif0 = max(sunL.y, 0.0);
                    float lit = (0.7 * sky + sunI * 1.3 * dif) / (0.7 * sky0 + sunI * 1.3 * dif0);
                    float glass = rl.a * (1.0 - fx.r);
                    vec3 Hh = normalize(sunL + vec3(0.0, 1.0, 0.0));
                    float nh = max(dot(N, Hh), 0.0);
                    float paintSpec = pow(nh, 160.0) * 0.55 * (1.0 - fx.r) * (1.0 - 0.6 * fx.g);
                    float glassSpec = pow(nh, 420.0) * 1.4;
                    vec3 spec = sun * mix(paintSpec, glassSpec, glass);
                    // vidro: reflexo do céu — mais forte onde o vidro inclina (para-brisa, vidro traseiro), mais claro para cima
                    vec3 Rv = reflect(vec3(0.0, -1.0, 0.0), N);
                    vec3 skyC = mix(vec3(0.42, 0.5, 0.6), vec3(0.78, 0.86, 0.95), clamp(Rv.y, 0.0, 1.0));
                    float fres = 0.05 + 0.55 * (1.0 - N.y);
                    vec3 refl = skyC * fres * glass * (0.35 + 0.65 * clamp(sunI, 0.0, 1.0));
                    vec3 lc = c * clamp(lit, 0.45, 1.6) + (spec + refl) * a.a;
                    c = mix(c, lc, relief);
                    gl_FragColor = vec4(c * tint * vC.g * vC.a, a.a * vC.a);
                }`;
        }
        const m = new BABYLON.ShaderMaterial(name, scene, { vertex: 'carArt', fragment: 'carArt' }, {
            attributes: ['position', 'uv', 'color', 'hd'],
            uniforms: ['worldViewProjection', 'paintRows', 'tint', 'sunL', 'sunC', 'relief'],
            samplers: ['atlasA', 'atlasB', 'atlasC', 'paints'],
            needAlphaBlending: true,
        });
        m.setTexture('atlasA', this._tex.a);
        m.setTexture('atlasB', this._tex.b);
        m.setTexture('atlasC', this._tex.c);
        m.setFloat('relief', Config.art.carRelief ?? 1);
        (this._mats || (this._mats = [])).push(m);
        this._applySun(m);
        m.setTexture('paints', this._tex.paints);
        m.setFloat('paintRows', this._tex.paints._rows);
        m.setColor3('tint', SpriteMaterial.sharedTint());       // dia/noite: a mesma cor ambiente dos outros sprites
        m.alphaMode = BABYLON.Engine.ALPHA_PREMULTIPLIED;
        m.disableDepthWrite = true;
        m.backFaceCulling = false;
        return m;
    },

    // Sol do mundo (DayNight.apply): direção em que a luz VIAJA, intensidade e cor. O relevo dos carros é iluminado por ele.
    setSun(dir, intensity, color = null) {
        const l = Math.hypot(dir.x, dir.y, dir.z) || 1, k = Math.max(0, Math.min(1.2, intensity / 0.65));      // (0,65 = sol do meio-dia)
        this._sun = { x: -dir.x / l, y: -dir.y / l, z: -dir.z / l, r: k * (color ? color[0] : 1), g: k * (color ? color[1] : 1), b: k * (color ? color[2] : 1) };
        if (this._mats) for (const m of this._mats) this._applySun(m);
    },
    _applySun(m) {
        let s = this._sun;
        if (!s) { const d = Config.light.sunDir, l = Math.hypot(d[0], d[1], d[2]); s = { x: -d[0] / l, y: -d[1] / l, z: -d[2] / l, r: 1, g: 1, b: 1 }; }
        const v = this._sunV || (this._sunV = { l: new BABYLON.Vector3(), c: new BABYLON.Color3() });      // (DayNight chama todo quadro)
        m.setVector3('sunL', v.l.set(s.x, s.y, s.z));
        m.setColor3('sunC', v.c.set(s.r, s.g, s.b));
    },

    // Sprite de um carro (CarActor) no lote.
    actor(modelId, variant, scale = 1) {
        if (!this.cars) this.init(this.scene);
        return new CarActor(this.cars, modelId, variant, scale);
    },

    // Imagem de um modelo (nariz para a DIREITA) já pintada, na CPU — a mesma conta do shader. src: { w, a, b, k } pixels do atlas
    // (k = 1 resolução cheia, 2 = metade). paintRow: linha de PAINTS | dent: fase de amassado (0..3). Retorna { w, h, data (RGBA) }.
    _compose(src, modelId, paintRow = 0, dent = 0) {
        const m = this.model(modelId), k = src.k;
        const hex = (h) => [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16) / 255);
        const p = CarSheet.PAINTS[paintRow] || CarSheet.PAINTS[0], P1 = hex(p.paint), P2 = hex(p.paint2 || p.paint);
        const x0 = Math.floor(m.r[0] / k), y0 = Math.floor(m.r[1] / k), w = Math.ceil(m.r[2] / k), h = Math.ceil(m.r[3] / k);
        const out = new Uint8ClampedArray(w * h * 4), c = [0, 0, 0];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = ((y0 + y) * src.w + x0 + x) * 4, al = src.a[i + 3] / 255;
            if (al <= 0) continue;
            for (let q = 0; q < 3; q++) c[q] = src.a[i + q] / 255 + (src.b[i] / 255) * P1[q] + (src.b[i + 1] / 255) * P2[q];
            if (dent * 64 + 0.5 >= src.b[i + 2]) {
                const s = src.b[i + 3] / 128 - 1;
                for (let q = 0; q < 3; q++) c[q] = s < 0 ? c[q] * (1 + s) : c[q] + (al - c[q]) * Math.min(1, s * 1.008);
            }
            const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
            if (p.worn) for (let q = 0; q < 3; q++) c[q] += (l * 0.96 - c[q]) * 0.35;
            if (p.burnt) { c[0] = 0.07 * al + l * 0.2; c[1] = 0.06 * al + l * 0.18; c[2] = 0.055 * al + l * 0.16; }
            const o = (y * w + x) * 4;
            for (let q = 0; q < 3; q++) out[o + q] = (c[q] / al) * 255;
            out[o + 3] = al * 255;
        }
        return { w, h, data: out };
    },

    // <canvas> do modelo pintado (galeria, ferramentas). Usa os pixels inteiros enquanto ainda estão na memória (antes de subir para a
    // GPU, ou fora do jogo), senão a cópia a meia resolução.
    image(modelId, paintRow = 0, dent = 0) {
        const src = this._px ? { w: this.data.w, a: this._px.A, b: this._px.B, k: 1 } : this._preview && { w: this._preview.w, a: this._preview.a, b: this._preview.b, k: 2 };
        if (!src || !this.model(modelId)) return null;
        const img = this._compose(src, modelId, paintRow, dent), c = document.createElement('canvas');
        c.width = img.w; c.height = img.h;
        c.getContext('2d').putImageData(new ImageData(img.data, img.w, img.h), 0, 0);
        return c;
    },

    // Miniatura do modelo para o HUD: nariz para a DIREITA, na pintura `paintRow`, com contorno claro de 1 px. Retorna um <canvas>
    // a 20 px/m (a densidade do jogo).
    preview(modelId, paintRow = 0) {
        const P = this._preview;
        if (!P || !this.model(modelId)) return null;
        const img = this._compose({ w: P.w, a: P.a, b: P.b, k: 2 }, modelId, paintRow, 0), pad = 2;
        const w = img.w + pad * 2, h = img.h + pad * 2;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const out = c.getContext('2d').createImageData(w, h), solid = new Uint8Array(w * h);
        for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
            const i = (y * img.w + x) * 4;
            if (img.data[i + 3] < 128) continue;
            const o = ((y + pad) * w + x + pad) * 4;
            out.data[o] = img.data[i]; out.data[o + 1] = img.data[i + 1]; out.data[o + 2] = img.data[i + 2]; out.data[o + 3] = 255;
            solid[(y + pad) * w + x + pad] = 1;
        }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {                 // contorno claro (lê bem no painel escuro)
            if (solid[y * w + x]) continue;
            const n = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && solid[yy * w + xx];
            if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) { const o = (y * w + x) * 4; out.data[o] = 238; out.data[o + 1] = 240; out.data[o + 2] = 246; out.data[o + 3] = 255; }
        }
        c.getContext('2d').putImageData(out, 0, 0);
        return c;
    },

    // Retângulo de UV (u0, v0, u1, v1) de um retângulo do atlas em px.
    uvRect(r) { const W = this.data.w, H = this.data.h; return [r[0] / W, r[1] / H, (r[0] + r[2]) / W, (r[1] + r[3]) / H]; },
};

// ----------------------------------------------------------------------------
// CarBatch — quads girados (carros, portas) numa ÚNICA malha dinâmica: posições, UVs e cores por vértice atualizáveis; só a faixa
// alterada sobe para a GPU (como o GlowBatch). Desenhado no grupo 1 (depois do chão, dos pedestres e das motos; antes das copas
// das árvores, alphaIndex -1, e dos brilhos dos faróis), testando a profundidade do mundo: prédios e viadutos na frente escondem.
// ----------------------------------------------------------------------------
class CarBatch {
    constructor(scene, capacity, name, material, alphaIndex) {
        this.scene = scene;
        this.capacity = capacity;
        this.name = name;
        this.material = material;
        this.alphaIndex = alphaIndex;
        this.count = 0;
        this._free = [];
        this._dirty = new Set();             // atores com transformação/aparência para recalcular neste quadro
        this._p0 = Infinity; this._p1 = -1;  // faixa de quads alterados
        this._build(capacity);
    }

    _build(capacity) {
        const old = this.mesh;
        this.pos = this._grow(this.pos, capacity * 12);
        this.uv = this._grow(this.uv, capacity * 8);
        this.col = this._grow(this.col, capacity * 16);
        this.hd = this._grow(this.hd, capacity * 8);
        const idx = new Uint16Array(capacity * 6);
        for (let i = 0; i < capacity; i++) { const b = i * 4, o = i * 6; idx[o] = b + 3; idx[o + 1] = b + 1; idx[o + 2] = b; idx[o + 3] = b + 2; idx[o + 4] = b + 3; idx[o + 5] = b; }
        const mesh = new BABYLON.Mesh(this.name, this.scene);
        const vd = new BABYLON.VertexData();
        vd.positions = this.pos; vd.uvs = this.uv; vd.colors = this.col; vd.indices = idx;
        vd.applyToMesh(mesh, true);
        mesh.setVerticesData('hd', this.hd, true, 2);                 // (seno, cosseno) do ângulo do quad: relevo (ver o shader)
        mesh.material = this.material;
        mesh.renderingGroupId = 1;
        mesh.alphaIndex = this.alphaIndex;
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.doNotSyncBoundingInfo = true;
        this.scene.setRenderingAutoClearDepthStencil(1, false);       // mantém a profundidade do mundo
        this.mesh = mesh;
        this._vbPos = mesh.getVertexBuffer(BABYLON.VertexBuffer.PositionKind);
        this._vbUV = mesh.getVertexBuffer(BABYLON.VertexBuffer.UVKind);
        this._vbCol = mesh.getVertexBuffer(BABYLON.VertexBuffer.ColorKind);
        this._vbHd = mesh.getVertexBuffer('hd');
        this.capacity = capacity;
        this._drawn = -1;
        if (old) old.dispose();
        this._sync();
    }

    _grow(a, n) { const b = new Float32Array(n); if (a) b.set(a.subarray(0, Math.min(a.length, n))); return b; }

    alloc() {
        let i;
        if (this._free.length) i = this._free.pop();
        else {
            if (this.count >= this.capacity) this._build(this.capacity * 2);   // cresce (raro: muitos carros na tela)
            i = this.count++;
        }
        this._sync();
        return i;
    }

    free(i) { this.hide(i); this._free.push(i); this._sync(); }

    // Desenha só a faixa de quads já usada, e nada quando o lote está vazio (o lote das portas, quase sempre): sem chamada de desenho à toa.
    _sync() {
        const live = this.count - this._free.length, m = this.mesh;
        m.isVisible = live > 0;
        if (this._drawn !== this.count) {
            this._drawn = this.count;
            m.subMeshes = [];
            new BABYLON.SubMesh(0, 0, Math.max(4, this.count * 4), 0, Math.max(6, this.count * 6), m);
        }
    }

    // Quad degenerado: nenhum fragmento.
    hide(i) {
        const p = this.pos, o = i * 12;
        for (let k = 0; k < 12; k++) p[o + k] = 0;
        this._touch(i);
    }

    // Quad de comprimento 2·hl (ao longo de `heading`) e largura 2·hw, centrado em (x, y, z). uv = [u0, v0, u1, v1] da imagem com o
    // NARIZ À DIREITA (u: traseira → frente; v: lado esquerdo → direito). ox/oz: deslocamento do centro (já girado) — portas.
    place(i, x, y, z, heading, hl, hw, uv) {
        const s = Math.sin(heading), c = Math.cos(heading);
        const fx = s * hl, fz = c * hl, rx = c * hw, rz = -s * hw;        // frente × hl, direita × hw
        const p = this.pos, o = i * 12;
        p[o] = x + fx - rx; p[o + 1] = y; p[o + 2] = z + fz - rz;          // frente-esquerda
        p[o + 3] = x + fx + rx; p[o + 4] = y; p[o + 5] = z + fz + rz;      // frente-direita
        p[o + 6] = x - fx - rx; p[o + 7] = y; p[o + 8] = z - fz - rz;      // trás-esquerda
        p[o + 9] = x - fx + rx; p[o + 10] = y; p[o + 11] = z - fz + rz;    // trás-direita
        const u = this.uv, q = i * 8;
        u[q] = uv[2]; u[q + 1] = uv[1]; u[q + 2] = uv[2]; u[q + 3] = uv[3];
        u[q + 4] = uv[0]; u[q + 5] = uv[1]; u[q + 6] = uv[0]; u[q + 7] = uv[3];
        this._setHd(i, s, c);
        this._touch(i);
    }

    _setHd(i, s, c) { const h = this.hd, q = i * 8; for (let k = 0; k < 8; k += 2) { h[q + k] = s; h[q + k + 1] = c; } }

    // Quad livre: 4 cantos (frente-esq., frente-dir., trás-esq., trás-dir.) — a lâmina da porta girando em volta da dobradiça.
    quad(i, y, ax, az, bx, bz, cx, cz, dx, dz, uv) {
        const p = this.pos, o = i * 12;
        p[o] = ax; p[o + 1] = y; p[o + 2] = az; p[o + 3] = bx; p[o + 4] = y; p[o + 5] = bz;
        p[o + 6] = cx; p[o + 7] = y; p[o + 8] = cz; p[o + 9] = dx; p[o + 10] = y; p[o + 11] = dz;
        const u = this.uv, q = i * 8;
        u[q] = uv[2]; u[q + 1] = uv[1]; u[q + 2] = uv[2]; u[q + 3] = uv[3];
        u[q + 4] = uv[0]; u[q + 5] = uv[1]; u[q + 6] = uv[0]; u[q + 7] = uv[3];
        const fx = ax - cx, fz = az - cz, fl = Math.hypot(fx, fz) || 1;      // frente = trás → frente (lado esquerdo)
        this._setHd(i, fx / fl, fz / fl);
        this._touch(i);
    }

    color(i, variant, shade, dent, alpha = 1) {
        const c = this.col, o = i * 16;
        if (c[o] === variant && c[o + 1] === shade && c[o + 2] === dent && c[o + 3] === alpha) return;
        for (let k = 0; k < 16; k += 4) { c[o + k] = variant; c[o + k + 1] = shade; c[o + k + 2] = dent; c[o + k + 3] = alpha; }
        this._touch(i);
    }

    _touch(i) { if (i < this._p0) this._p0 = i; if (i > this._p1) this._p1 = i; }

    // Recalcula os atores marcados e envia só a faixa alterada (uma vez por quadro, antes do render).
    flush() {
        if (this._dirty.size) { for (const a of this._dirty) a._apply(); this._dirty.clear(); }
        if (this._p1 < 0) return;
        const a = this._p0, b = this._p1 + 1;
        this._vbPos.updateDirectly(this.pos.subarray(a * 12, b * 12), a * 12);
        this._vbUV.updateDirectly(this.uv.subarray(a * 8, b * 8), a * 8);
        this._vbCol.updateDirectly(this.col.subarray(a * 16, b * 16), a * 16);
        this._vbHd.updateDirectly(this.hd.subarray(a * 8, b * 8), a * 8);
        this._p0 = Infinity; this._p1 = -1;
    }
}

// ----------------------------------------------------------------------------
// CarActor — o sprite de UM carro (um quad do CarBatch). Mesma interface que o Vehicle usava do SpriteActor:
// setPosition / setHeading / setVariant / setVisible / update / dispose, mais setDamage (fase 0..3) e setY (altura: viaduto).
// A transformação só é recalculada uma vez por quadro (CarBatch.flush), por mais que o carro mude no meio.
// ----------------------------------------------------------------------------
class CarActor {
    constructor(batch, modelId, variant, scale = 1) {
        this.scale = scale;
        this.batch = batch;
        this.i = batch.alloc();
        this.variant = variant;
        this.dent = 0;
        this.shade = 1;
        this._shadeTimer = Math.random() * 0.3;
        this.x = 0; this.z = 0; this.y = 1.5; this.heading = 0;
        this.visible = true;
        this._placed = false;                        // só aparece quando recebe a 1ª posição (senão "pisca" na origem)
        this.rotates = true;                         // (CarLights: o sprite segue o ângulo exato, não 32 direções)
        // Suspensão: a carroceria escorrega um pouco sobre as rodas com a transferência de peso (freada = mergulha para a frente,
        // arrancada = senta atrás, curva = inclina para fora) — mola amortecida, com um leve balanço quando a força some.
        this.sx = 0; this.sz = 0; this._vx = 0; this._vz = 0;      // deslocamento (m) da carroceria: lateral (direita +) e longitudinal (frente +)
        this.ry = 0; this._vr = 0;                   // giro (rad) da carroceria sobre o chassi: "atrasa" ao entrar na curva e balança ao sair (peso)
        this.steer = 0;                              // ângulo das rodas da frente (rad, + = direita)
        this.ti = null;                              // quads das rodas da frente no lote CarArt.tires
        batch.hide(this.i);
        batch.color(this.i, variant, 1, 0, 1);
        this.setModel(modelId);
    }

    // Troca o desenho (ex.: moto em pé → caída) mantendo posição, pintura e amassado.
    setModel(modelId) {
        if (modelId === this.modelId) return;
        const m = CarArt.model(modelId);
        if (!m) return;
        this.modelId = modelId;
        this.uv = CarArt.uvRect(m.r);
        const k = (this.scale || 1) * (m.k || 1);    // (motos e bicicletas: um pouco maiores que o real, para aparecer embaixo do piloto; m.k = Config.vehicle.scale)
        this.hl = m.r[2] / CarArt.data.ppu / 2 * k;  // meio comprimento da imagem (com a margem dos retrovisores), em metros
        this.hw = m.r[3] / CarArt.data.ppu / 2 * k;
        this.tire = m.tire && CarArt.data.tire ? m.tire : null;
        const T = CarArt.tires;
        if (this.tire && !this.ti && T) { this.ti = [T.alloc(), T.alloc()]; this._tuv = CarArt.uvRect(CarArt.data.tire); for (const i of this.ti) T.color(i, 0, 1, 0, 1); }
        else if (!this.tire && this.ti) { for (const i of this.ti) T.free(i); this.ti = null; }
        this._mark();
    }

    _mark() { this.batch._dirty.add(this); }
    _apply() {
        if (this._disposed) return;
        const T = CarArt.tires;
        if (!this.visible || !this._placed) { this.batch.hide(this.i); if (this.ti) for (const i of this.ti) T.hide(i); return; }
        const s = Math.sin(this.heading), c = Math.cos(this.heading);
        // carroceria: deslocada pela suspensão (frente = (s, c), direita = (c, -s))
        this.batch.place(this.i, this.x + s * this.sz + c * this.sx, this.y, this.z + c * this.sz - s * this.sx, this.heading + this.ry, this.hl, this.hw, this.uv);
        this.batch.color(this.i, this.variant, this.shade, this.dent, 1);
        if (this.ti) {
            // rodas da frente presas ao chassi (não balançam com a carroceria), giradas pelo volante; o desenho do pneu tem 2 px de margem
            const t = this.tire, hl = t.len * 0.5 * (74 / 70), hw = t.wid * 0.5 * (22 / 18), h = this.heading + this.steer;
            const y = this.y - 0.02, sh = this.shade;
            for (let k = 0; k < 2; k++) {
                const side = k ? 1 : -1, ox = s * t.z + c * t.x * side, oz = c * t.z - s * t.x * side;
                T.place(this.ti[k], this.x + ox, y, this.z + oz, h, hl, hw, this._tuv);
                T.color(this.ti[k], 0, sh, 0, 1);
            }
        }
    }

    setPosition(x, z) { if (x === this.x && z === this.z && this._placed) return; this.x = x; this.z = z; this._placed = true; this._mark(); }
    setHeading(h) { if (h === this.heading) return; this.heading = h; this._mark(); }
    setY(y) { if (y === this.y) return; this.y = y; this._mark(); }
    setVariant(v) { if (v === this.variant) return; this.variant = v; this._mark(); }
    setDamage(d) { d = Math.max(0, Math.min(3, d | 0)); if (d === this.dent) return; this.dent = d; this._mark(); }
    setVisible(v) { v = !!v; if (v === this.visible) return; this.visible = v; this._mark(); }

    // Física visual da carroceria (chamada pelo Vehicle a cada quadro): aF/aL = aceleração à frente / para a direita (m/s²),
    // steer = volante (-1..1, + = direita). Rodas viram até ~27°; a carroceria segue uma mola amortecida para o alvo.
    // yr = giro do chassi (rad/s) — só CARROS (moto e barco passam null): o PESO fica visível — a carroceria rola bem mais para
    // fora da curva e gira um pouco atrasada em relação ao chassi (mola pouco amortecida: ao sair da curva ela passa do ponto e assenta).
    animate(dt, aF, aL, steer, yr = null) {
        if (dt <= 0) return;
        const st = Math.max(-1, Math.min(1, steer || 0)) * 0.47;
        const want = this.steer + (st - this.steer) * Math.min(1, dt * 10);
        const K = 140, C = 9.5, lim = (v, m) => Math.max(-m, Math.min(m, v)), car = yr !== null;
        const tz = lim(-aF * 0.0105, 0.1), tx = car ? lim(-aL * 0.0065, 0.2) : lim(-aL * 0.0085, 0.075);      // freando (aF<0) → a carroceria vai para a frente; curva → para fora
        const h = Math.min(dt, 1 / 30);                                              // (passo estável mesmo num quadro longo)
        this._vz += (K * (tz - this.sz) - C * this._vz) * h; this.sz += this._vz * h;
        this._vx += (K * (tx - this.sx) - (car ? 7 : C) * this._vx) * h; this.sx += this._vx * h;
        if (car) { const ty = lim(-yr * 0.03, 0.06); this._vr += (90 * (ty - this.ry) - 7 * this._vr) * h; this.ry += this._vr * h; }
        if (Math.abs(want - this.steer) > 1e-4 || Math.abs(this._vz) + Math.abs(this._vx) + Math.abs(this._vr) > 1e-4) { this.steer = want; this._mark(); }
    }

    // Escurece o sprite quando está na sombra de um prédio (suave, a ~4 consultas/s) — como o SpriteActor.
    update(dt) {
        this._shadeTimer -= dt;
        if (this._shadeTimer <= 0) {
            this._shadeTimer = 0.25;
            this._shadeTarget = MapGeo.inShadow(this.x, this.z) ? 0.66 : 1;
        }
        if (this._shadeTarget === undefined || Math.abs(this._shadeTarget - this.shade) < 0.004) return;
        this.shade += (this._shadeTarget - this.shade) * Math.min(1, dt * 9);
        this._mark();
    }

    dispose() {
        if (this._disposed) return;
        this._disposed = true;
        this.batch._dirty.delete(this);
        this.batch.free(this.i);
        if (this.ti) { for (const i of this.ti) CarArt.tires.free(i); this.ti = null; }
    }
}

if (CarArt.available()) { CarArt._scaleCars(); CarArt.load(); }          // decodifica o atlas já durante a carga da página / menu
