// ============================================================================
// Barcos como sprites pré-renderizados vistos de cima (mesmo baker e mesma paleta dos carros), em 32 direções.
//
//   BoatSheet.MODELS  catálogo: jetski, lancha e barco (dimensões e desempenho)
//   BoatSheet         folha de UM modelo (interface igual à CarSheet: frame, dirs, getClip) — funciona com o SpriteActor
//   BoatLibrary       folhas por (modelo, piloto): `sheet(id, rider)`; assadas na primeira vez que são pedidas
//
// Usa os slots de rampa e as pinturas do CarSheet: paint = casco, paint2 = faixa/cabine, sign = convés claro,
// glass = vidros, dark = bancos/motor, chrome = ferragens, head/tail = luzes de navegação, tail também = colete do piloto.
// O corpo físico (caixa) e a sombra continuam sendo do Vehicle; o sprite desenha o casco.
// ============================================================================

class BoatSheet {
    // Catálogo. len/wid em unidades (≈ metros). frame = lado do quadro de sprite (px) — grande o bastante para o casco girado em qualquer direção.
    // grip: aderência lateral na água (baixo = derrapa, como barco) | turnRef: velocidade com autoridade total de leme | maxReverse: ré lenta.
    static get MODELS() {
        return {
            jetski: { name: 'Jet ski', model: 'Aqua Rider 300', len: 3.0, wid: 1.1, mass: 260, power: 6200, maxSpeed: 22, turn: 2.7, cruise: 1.0, weight: 1, hp: 40, blast: 0.55,
                bodyH: 0.5, frame: 96, grip: 3.2, turnRef: 3.0, maxReverse: 3, brakeDrag: 3.2, fire: true, noCabin: true, noExhaust: true, boat: true, open: true, lamps: { x: 0.0, zF: 1.35, zR: -1.4 } },
            lancha: { name: 'Lancha', model: 'Marlin 21 Sport', len: 6.4, wid: 2.3, mass: 1300, power: 13500, maxSpeed: 20, turn: 1.5, cruise: 0.9, weight: 1, hp: 110, blast: 0.9,
                bodyH: 0.55, frame: 160, grip: 2.1, turnRef: 4.0, maxReverse: 4, brakeDrag: 2.2, fire: true, noCabin: true, noExhaust: true, boat: true, open: true, lamps: { x: 0.75, zF: 3.0, zR: -3.1 } },
            barco: { name: 'Barco', model: 'Caiçara 30', len: 9.0, wid: 3.2, mass: 3400, power: 13000, maxSpeed: 10, turn: 0.85, cruise: 0.6, weight: 1, hp: 220, blast: 1.2,
                bodyH: 0.6, frame: 208, grip: 1.7, turnRef: 4.5, maxReverse: 2.5, brakeDrag: 1.4, fire: true, noCabin: true, noExhaust: true, boat: true, open: false, lamps: { x: 1.1, zF: 4.2, zR: -4.3 } },
            // só na Lagoa (map/Lagoa.js): sem motor (pedal: sem som de motor, não pega fogo), devagar
            pedalinho: { name: 'Pedalinho', model: 'Cisne da Lagoa', len: 3.4, wid: 1.9, mass: 240, power: 1100, maxSpeed: 3.4, turn: 1.4, cruise: 0.6, weight: 1, hp: 50, blast: 0.3,
                bodyH: 0.6, frame: 96, grip: 2.6, turnRef: 2.6, maxReverse: 1.5, brakeDrag: 2.6, fire: false, noCabin: true, noExhaust: true, boat: true, open: true, pedal: true, lamps: { x: 0.0, zF: 1.5, zR: -1.5 } },
            caiaque: { name: 'Caiaque', model: 'Remada Lagoa', len: 3.6, wid: 0.8, mass: 40, power: 520, maxSpeed: 4.0, turn: 2.0, cruise: 0.6, weight: 1, hp: 25, blast: 0.2,
                bodyH: 0.3, frame: 96, grip: 3.0, turnRef: 2.8, maxReverse: 1.5, brakeDrag: 2.8, fire: false, noCabin: true, noExhaust: true, boat: true, open: true, pedal: true, lamps: { x: 0.0, zF: 1.7, zR: -1.7 } },
        };
    }

    // Pinturas (linhas de CarSheet.PAINTS) que cada modelo usa no casco: [casco, faixa/cabine]. Índices de PAINTS: 0 vermelho, 1 azul, 3 verde,
    // 4 branco, 5 preto, 6 viatura (azul-marinho + branco), 7 laranja, 8 prata, 9 bordo.
    static get PAINT_ROWS() { return { jetski: [0, 1, 7, 3, 9, 5, 2], lancha: [4, 6, 0, 1, 8, 7], barco: [4, 1, 3, 9, 6, 7], pedalinho: [4], caiaque: [7, 0, 3, 1] }; }

    // Modelo `id` visto de cima, olhando para +Z (proa). rider: com piloto desenhado (jetski e lancha).
    static model(id, rider = false) {
        const B = SpriteBaker, S = CarSheet.SLOT, P = [], TAU = Math.PI * 2;
        if (id === 'jetski') {
            P.push(B.ellipsoid(S.paint, [0, 0.32, -0.05], [0.52, 0.32, 1.42]));                                 // casco
            P.push(B.ellipsoid(S.paint2, [0, 0.5, 0.85], [0.4, 0.2, 0.62]));                                    // capô (faixa)
            P.push(B.box(S.sign, [0, 0.46, -1.2], [0.36, 0.06, 0.28], 0, 0.04));                                // plataforma traseira
            for (const sx of [-1, 1]) P.push(B.box(S.sign, [sx * 0.47, 0.5, -0.45], [0.05, 0.05, 0.8], 0, 0.03));   // frisos laterais
            P.push(B.box(S.dark, [0, 0.66, -0.42], [0.2, 0.12, 0.62], 0, 0.08));                                // banco
            P.push(B.box(S.chrome, [0, 0.82, 0.3], [0.05, 0.1, 0.05], 0, 0.02));                                // coluna do guidão
            P.push(B.box(S.chrome, [0, 0.93, 0.3], [0.4, 0.04, 0.05], 0, 0.02));                                // guidão
            P.push(B.sphere(S.head, [0, 0.62, 1.38], 0.07));                                                    // luz de proa
            if (rider) {
                P.push(B.capsule(S.tail, [0, 0.9, -0.42], [0, 1.15, 0.0], 0.22));                                // colete
                P.push(B.sphere(S.sign, [0, 1.42, 0.08], 0.17));                                                 // cabeça
                for (const sx of [-1, 1]) P.push(B.capsule(S.tail, [sx * 0.2, 1.1, 0.0], [sx * 0.36, 0.95, 0.3], 0.07));   // braços no guidão
            }
        } else if (id === 'lancha') {
            P.push(B.ellipsoid(S.paint, [0, 0.5, -0.3], [1.1, 0.5, 2.95]));                                     // casco
            P.push(B.ellipsoid(S.paint, [0, 0.55, 1.85], [0.78, 0.42, 1.5]));                                   // proa afilada
            P.push(B.box(S.paint, [0, 0.55, -2.9], [0.95, 0.35, 0.3], 0, 0.1));                                 // espelho de popa
            P.push(B.ellipsoid(S.sign, [0, 0.92, -0.1], [0.96, 0.12, 2.65]));                                   // convés
            for (const sx of [-1, 1]) P.push(B.box(S.paint2, [sx * 1.0, 0.78, -0.3], [0.06, 0.1, 2.3], 0, 0.03));  // faixas laterais
            P.push(B.ellipsoid(S.paint2, [0, 1.0, 1.9], [0.5, 0.08, 1.15]));                                    // capota de proa
            P.push(B.box(S.dark, [0, 1.06, 0.2], [0.36, 0.2, 0.28], 0, 0.1));                                   // console
            P.push(B.box(S.glass, [0, 1.3, 0.62], [0.78, 0.2, 0.07], 0, 0.03));                                 // para-brisa
            P.push(B.box(S.chrome, [0, 1.52, 0.62], [0.8, 0.03, 0.04], 0, 0.02));
            P.push(B.box(S.dark, [0, 1.02, -1.55], [0.82, 0.12, 0.3], 0, 0.06));                                // banco de popa
            for (const sx of [-1, 1]) P.push(B.box(S.dark, [sx * 0.45, 1.02, -0.5], [0.26, 0.1, 0.28], 0, 0.06));  // bancos
            P.push(B.box(S.dark, [0, 0.82, -3.38], [0.28, 0.45, 0.22], 0, 0.08));                               // motor de popa
            P.push(B.box(S.chrome, [0, 1.12, -3.38], [0.2, 0.06, 0.16], 0, 0.03));
            P.push(B.sphere(S.head, [0, 0.95, 3.12], 0.09)); P.push(B.sphere(S.tail, [0, 1.1, -3.05], 0.08));    // luzes de navegação
            if (rider) {
                P.push(B.capsule(S.tail, [-0.45, 1.1, -0.5], [-0.45, 1.3, 0.05], 0.2));                           // piloto no banco da esquerda
                P.push(B.sphere(S.sign, [-0.45, 1.58, 0.1], 0.16));
            }
        } else if (id === 'barco') {
            P.push(B.ellipsoid(S.paint, [0, 0.6, -0.5], [1.58, 0.65, 4.2]));                                    // casco
            P.push(B.ellipsoid(S.paint, [0, 0.7, 2.8], [1.1, 0.55, 2.0]));                                      // proa
            P.push(B.box(S.paint, [0, 0.66, -4.15], [1.3, 0.45, 0.3], 0, 0.1));                                 // popa
            for (const sx of [-1, 1]) P.push(B.box(S.paint2, [sx * 1.5, 0.98, -0.5], [0.06, 0.12, 3.7], 0, 0.03));  // faixa d'água
            P.push(B.ellipsoid(S.sign, [0, 1.22, -0.4], [1.4, 0.12, 4.0]));                                     // convés
            P.push(B.box(S.paint2, [0, 1.9, 0.9], [1.1, 0.62, 1.5], 0, 0.14));                                  // cabine
            P.push(B.box(S.glass, [0, 2.06, 2.42], [0.85, 0.22, 0.05], 0, 0.03));                               // vidro frontal
            for (const sx of [-1, 1]) P.push(B.box(S.glass, [sx * 1.12, 2.0, 0.9], [0.03, 0.2, 1.0], 0, 0.02));   // vidros laterais
            P.push(B.box(S.sign, [0, 2.56, 0.9], [1.22, 0.06, 1.65], 0, 0.05));                                 // teto
            P.push(B.capsule(S.chrome, [0, 2.6, 0.5], [0, 4.1, 0.5], 0.06));                                     // mastro
            P.push(B.box(S.dark, [0, 4.2, 0.5], [0.4, 0.05, 0.12], 0, 0.02));                                    // radar
            P.push(B.box(S.dark, [0, 1.42, -2.4], [0.9, 0.2, 0.42], 0, 0.08));                                  // caixa de pesca
            for (const sx of [-1, 1]) P.push(B.capsule(S.chrome, [sx * 1.1, 1.5, -3.3], [sx * 1.3, 2.4, -4.2], 0.04));   // varas
            for (const sx of [-1, 1]) P.push(B.capsule(S.chrome, [sx * 1.25, 1.5, 1.0], [sx * 0.7, 1.55, 3.6], 0.035));  // guarda-corpo
            P.push(B.sphere(S.head, [0, 1.35, 4.3], 0.1)); P.push(B.sphere(S.tail, [0, 1.45, -4.2], 0.09));
        } else if (id === 'pedalinho') {                                                                    // o CISNE da Lagoa
            P.push(B.ellipsoid(S.paint, [0, 0.45, -0.1], [0.95, 0.45, 1.55]));                                  // corpo
            for (const sx of [-1, 1]) P.push(B.ellipsoid(S.paint, [sx * 0.86, 0.78, -0.25], [0.16, 0.34, 0.95]));   // asas
            P.push(B.capsule(S.paint, [0, 0.8, 1.15], [0, 1.75, 1.45], 0.17));                                   // pescoço
            P.push(B.sphere(S.paint, [0, 1.84, 1.58], 0.21));                                                    // cabeça
            P.push(B.box(S.tail, [0, 1.8, 1.86], [0.08, 0.06, 0.16], 0, 0.03));                                  // bico
            P.push(B.box(S.dark, [0, 0.98, -0.35], [0.66, 0.1, 0.42], 0, 0.06));                                 // banco
            for (const sx of [-1, 1]) for (const sz of [-0.85, 0.35]) P.push(B.capsule(S.chrome, [sx * 0.62, 1.0, sz], [sx * 0.62, 1.7, sz], 0.035));   // varetas
            P.push(B.box(S.paint2, [0, 1.74, -0.25], [0.78, 0.05, 0.75], 0, 0.04));                              // toldo
            if (rider) { P.push(B.capsule(S.tail, [0, 1.05, -0.35], [0, 1.3, -0.15], 0.2)); P.push(B.sphere(S.sign, [0, 1.55, -0.1], 0.16)); }
        } else if (id === 'caiaque') {
            P.push(B.ellipsoid(S.paint, [0, 0.22, 0], [0.36, 0.2, 1.8]));                                       // casco
            P.push(B.ellipsoid(S.dark, [0, 0.38, -0.15], [0.22, 0.05, 0.45]));                                   // o cockpit
            P.push(B.ellipsoid(S.paint2, [0, 0.36, 0.95], [0.18, 0.04, 0.5]));                                   // faixa da proa
            if (rider) {
                P.push(B.capsule(S.tail, [0, 0.45, -0.15], [0, 0.85, -0.05], 0.18)); P.push(B.sphere(S.sign, [0, 1.08, -0.02], 0.15));
                P.push(B.box(S.chrome, [0, 0.8, 0.12], [1.15, 0.03, 0.05], 0.3, 0.02));                         // o remo
            }
        }
        return P;
    }

    // Onde fica a origem do piloto (m: z = frente, x = direita): no jet ski, no banco com as mãos no guidão; na lancha, no timão (direita).
    // Piloto 2,5D (NpcArt): a origem é o banco (jet ski: atrás do guidão; lancha: o banco do timão) — ver NpcGenAnims.RIDE.
    static get SEATS() {
        if (typeof NpcArt !== 'undefined' && NpcArt.available()) return { jetski: { z: -0.357, x: 0 }, lancha: { z: -0.21, x: 0.41 }, barco: { z: 0, x: 0 }, pedalinho: { z: -0.3, x: 0 }, caiaque: { z: -0.1, x: 0 } };
        return { jetski: { z: -0.5, x: 0 }, lancha: { z: -0.35, x: 0.41 }, barco: { z: 0, x: 0 }, pedalinho: { z: -0.3, x: 0 }, caiaque: { z: -0.1, x: 0 } };
    }

    constructor(scene, modelId, palette, rider = false) {
        this.scene = scene;
        this.modelId = modelId;
        this.spec = Object.assign({ id: modelId }, CarArt.scaledSpec(BoatSheet.MODELS[modelId]));      // (medidas em Config.vehicle.scale)
        if (typeof CarArt !== 'undefined' && CarArt.available() && CarArt.model(modelId)) {        // desenho vetorial do atlas dos carros: nada a assar
            this.art = 'rider'; this.vehModel = modelId; this.seat = CarArt.scaledSeat(BoatSheet.SEATS[modelId]);
            this.dirs = 32; this.frame = this.spec.frame; this.rider = rider; this.name = modelId; this.palette = palette; this.lib = null; this.ready = true;
            return;
        }
        this.dirs = 32;
        this.frame = this.spec.frame;
        this.rider = rider;
        this.name = modelId + (rider ? '+piloto' : '');
        this.palette = palette;
        this.lib = null;
        this._clip = null;
        this.ready = false;
        this._bake();
    }

    _bake() {
        const t0 = performance.now(), F = this.frame, D = this.dirs, W = D * F, data = new Uint8Array(W * F * 4), prims = BoatSheet.model(this.modelId, this.rider);
        for (let d = 0; d < D; d++) {
            const img = SpriteBaker.bake(prims, { size: F, heading: (d * TAU_BOAT) / D, shadow: false });
            for (let y = 0; y < F; y++) data.set(img.subarray(y * F * 4, (y + 1) * F * 4), (y * W + d * F) * 4);
        }
        const tex = SpriteMaterial.atlasTexture(this.scene, data, W, F);
        const material = SpriteMaterial.create(this.scene, 'boat_' + this.name, tex, this.palette);
        this._clip = { name: 'static', weapon: 'none', frames: 1, dirs: D, fps: 1, loop: true, texture: tex, material, frame: F, W, H: F };
        this.ready = true;
        console.log(`[BARCOS] ${this.name}: ${D} direções em ${(performance.now() - t0).toFixed(0)} ms`);
    }

    getClip() { return this._clip; }

    // Imagem do modelo para o HUD (de lado, proa à direita), na pintura `paintRow`, recortada, com contorno claro de 1 px.
    static preview(modelId, paintRow = 4) {
        const F = BoatSheet.MODELS[modelId].frame, img = SpriteBaker.bake(BoatSheet.model(modelId, false), { size: F, heading: Math.PI / 2, shadow: false });
        const ramps = CarSheet.rampsFor(paintRow);
        let x0 = F, y0 = F, x1 = 0, y1 = 0;
        for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) if (img[(y * F + x) * 4 + 3] >= 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        const pad = 2, w = x1 - x0 + 1 + pad * 2, h = y1 - y0 + 1 + pad * 2, c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d'), out = ctx.createImageData(w, h), solid = new Uint8Array(w * h);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const i = (y * F + x) * 4;
            if (img[i + 3] < 128) continue;
            const col = ramps[img[i]] ? ramps[img[i]][img[i + 1]] : [255, 0, 255], o = ((y - y0 + pad) * w + (x - x0 + pad)) * 4;
            out.data[o] = col[0]; out.data[o + 1] = col[1]; out.data[o + 2] = col[2]; out.data[o + 3] = 255;
            solid[(y - y0 + pad) * w + (x - x0 + pad)] = 1;
        }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (solid[y * w + x]) continue;
            const n = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && solid[yy * w + xx];
            if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) { const o = (y * w + x) * 4; out.data[o] = 238; out.data[o + 1] = 240; out.data[o + 2] = 246; out.data[o + 3] = 255; }
        }
        ctx.putImageData(out, 0, 0);
        return c;
    }
}
const TAU_BOAT = Math.PI * 2;

// Folhas dos barcos, assadas na primeira vez que são pedidas (a paleta é a dos carros).
class BoatLibrary {
    constructor(scene, palette) {
        this.scene = scene;
        this.palette = palette;
        this.sheets = {};
    }

    // Folha do modelo; rider = com piloto (jetski e lancha). O barco (cabine fechada) só tem uma.
    sheet(modelId, rider = false) {
        if (modelId === 'barco') rider = false;
        const key = modelId + (rider ? '+' : '');
        if (!this.sheets[key]) { this.sheets[key] = new BoatSheet(this.scene, modelId, this.palette, rider); this.sheets[key].lib = this; }
        return this.sheets[key];
    }
}
memoStatics(BoatSheet, 'MODELS', 'PAINT_ROWS', 'SEATS');
