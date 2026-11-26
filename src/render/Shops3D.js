// ============================================================================
// Shops3D — as VITRINES DAS LOJAS em polígonos, no lugar do atlas pintado (hd_shops + hd_shops_e: 1800 × 864 cada, ~16 MB de vídeo).
// `?lojas=2d` volta ao atlas.
//
// Cada loja (CityGrid._addShops: 6 u de parede no térreo, num dos lados do lote) ganha uma FRENTE DE LOJA de verdade, saliente da
// parede: o revestimento na cor da loja (pilares, verga, bandeira), o rodapé de granito embaixo das vitrines, duas VITRINES com o
// caixilho de alumínio e o montante, e o vidro afastado do fundo — atrás dele, a sala (o fundo, as prateleiras e a mercadoria, em
// caixinhas coloridas) aparece com paralaxe de verdade; a PORTA de vidro com o puxador; e em cima o LETREIRO, uma caixa de luz
// saliente na cor da loja, com a moldura, o ÍCONE e o NOME escritos. A oficina (Pay n Pay) tem o PORTÃO DE ENROLAR (as lâminas em
// relevo, o rolo em cima e a luz da oficina escapando embaixo).
//
// Três lotes no WorldBuilder (pedaços do mapa, como o resto):
//   shop3      as peças sólidas (cor no vértice). O ALFA do vértice é o código da LUZ DA NOITE (1 = nenhuma; menos = acende, ShopGlow):
//              a sala atrás do vidro, a caixa do letreiro e a fresta do portão brilham quando escurece.
//   shopglass  os vidros (mistura pelo alfa do vértice: o reflexo do céu em cima, mais transparente embaixo, e o brilho do sol)
//   shoptext   o nome e o ícone: um quad por loja sobre o letreiro, do atlas SÓ DE TEXTO (luminância + alfa, 512 × 1024 = 16 linhas de
//              64 px, ~1 MB com mipmaps) — o texto é branco (a cor vem do vértice) e acende à noite (WindowLights).
// ============================================================================

const Shops3D = {
    get on() {
        if (typeof location !== 'undefined' && /[?&]lojas=2d\b/.test(location.search)) return false;
        return !!(typeof Config !== 'undefined' && Config.art && Config.art.shopPoly !== false);
    },
    W: 512, ROW: 64,
    Y0: 0.2,                         // u: a altura da calçada (o pé da frente de loja)
    stats: null,
    _UV0: [[0, 0], [0, 0], [0, 0], [0, 0]],

    // hash inteiro (o mesmo das fachadas): sorteios estáveis por loja
    _h(a, b, c) { return (((a * 37 + b * 101 + c * 59 + a * b * 13 + a * a * 7 + c * b * 3) % 97) + 97) % 97 / 97; },

    // ------------------------------------------------------------------ o atlas de texto
    // Linha k = a loja TileFactory.SHOPS[k]: o ícone no círculo à esquerda e o nome centrado no resto, brancos, com a sombra preta
    // (luminância 0) embaixo. Guardado como luminância + alfa.
    textAtlas(scene) {
        if (this._tex && this._tex.getScene() === scene) return this._tex;
        const W = this.W, R = this.ROW, S = TileFactory.SHOPS, H = 1024, cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const g = cv.getContext('2d');
        g.clearRect(0, 0, W, H);
        S.forEach((sh, k) => {
            const oy = k * R, cy = oy + R / 2;
            // o selo do ícone: o círculo (meio-tom) e o desenho branco dentro
            g.save(); g.translate(36, cy);
            g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(1.5, 2, 25, 0, Math.PI * 2); g.fill();
            g.fillStyle = 'rgb(150,150,150)'; g.beginPath(); g.arc(0, 0, 25, 0, Math.PI * 2); g.fill();
            g.fillStyle = 'rgb(255,255,255)'; g.beginPath(); g.arc(0, 0, 21, 0, Math.PI * 2); g.fill();
            g.translate(-15, -15); g.scale(3, 3);
            this._icon(g, sh.icon);
            g.restore();
            // o nome: o maior que couber (negrito), com a sombra
            const avail = W - 84 - 14;
            let fs = 40;
            g.font = `800 ${fs}px Outfit, "Arial Black", Arial, sans-serif`;
            const tw = g.measureText(sh.name).width;
            if (tw > avail) fs = Math.max(16, Math.floor(fs * avail / tw));
            g.font = `800 ${fs}px Outfit, "Arial Black", Arial, sans-serif`;
            g.textAlign = 'center'; g.textBaseline = 'middle';
            const tx = 84 + avail / 2;
            g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(sh.name, tx + 2, cy + 3);
            g.fillStyle = '#ffffff'; g.fillText(sh.name, tx, cy + 1);
        });
        const img = g.getImageData(0, 0, W, H).data, D = new Uint8Array(W * H * 2);
        for (let i = 0, j = 0; i < img.length; i += 4, j += 2) { D[j] = img[i]; D[j + 1] = img[i + 3]; }
        cv.width = cv.height = 0;
        const t = new BABYLON.RawTexture(D, W, H, BABYLON.Constants.TEXTUREFORMAT_LUMINANCE_ALPHA, scene, true, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
        t.name = 'shopText'; t.wrapU = t.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE; t.hasAlpha = true; t.anisotropicFilteringLevel = 8;
        return (this._tex = t);
    },
    // Os ícones (o mesmo desenho do letreiro pintado), num quadro 10 × 10: branco; as partes internas em cinza (o vértice tinge).
    _icon(g, icon) {
        const W = '#000', S = 'rgb(120,120,120)';
        const R = (x, y, w, h, c = W) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
        const D = (x, y, r, c = W) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
        const E = (x, y, rx, ry, a, c = W) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, Math.PI * 2); g.fill(); };
        // (ícone ESCURO no selo branco: o letreiro é colorido, o selo é claro e o desenho sai na cor escura)
        if (icon === 'cross') { R(3.2, 0, 3.6, 10); R(0, 3.2, 10, 3.6); }
        else if (icon === 'cup') { R(0.5, 1.5, 7.5, 7.5); R(7.8, 3, 2.2, 3.5); R(1.5, 2.5, 5.5, 2, S); }
        else if (icon === 'cart') { R(0, 1, 10, 1); R(1, 3, 8, 4); D(2.2, 9, 1.1); D(7.8, 9, 1.1); }
        else if (icon === 'shirt') { R(2, 0, 6, 3); R(0, 2, 10, 3); R(2, 4.5, 6, 5); }
        else if (icon === 'coin') { D(5, 5, 5); D(5, 5, 3.4, S); }
        else if (icon === 'phone') { R(2, 0, 6, 10); R(3, 1, 4, 7, S); }
        else if (icon === 'wrench') { R(0, 4, 10, 2); R(7, 1, 3, 8); }
        else if (icon === 'gun') { R(0, 2, 10, 3); R(1, 4.5, 3, 4.5); }
        else if (icon === 'pizza') { D(5, 5, 5); D(4, 4, 1, S); D(7, 7, 1, S); D(3, 7, 0.8, S); }
        else if (icon === 'leaf') { E(5, 5, 2.4, 4.6, 0.5); R(4.6, 6, 0.8, 4); }
        else if (icon === 'fork') { R(1, 0, 1, 9); R(4, 0, 1, 9); R(7, 0, 2, 9); R(0, 0, 9, 3); }
        else if (icon === 'fish') { E(4, 5, 4, 2.6, 0); R(7, 3, 3, 4); }
        else if (icon === 'smoke') { D(5, 5, 4, S); D(5, 4, 2); }
        else if (icon === 'dumbbell') { R(0, 2, 2, 6); R(2, 3, 1, 4); R(3, 4, 4, 2); R(7, 3, 1, 4); R(8, 2, 2, 6); }
        else D(5, 5, 4);
    },

    // ------------------------------------------------------------------ materiais
    // { solid, glass, text } — o sólido acende a noite pelo alfa do vértice (ShopGlow); o texto pelo WindowLights (a textura branca).
    materials(scene) {
        const solid = new BABYLON.StandardMaterial('shop3', scene);
        solid.specularColor = new BABYLON.Color3(0.12, 0.12, 0.12); solid.specularPower = 24;
        this._glow(solid);
        const glass = new BABYLON.StandardMaterial('shopGlass', scene);
        glass.specularColor = new BABYLON.Color3(0.9, 0.9, 0.9); glass.specularPower = 96;
        glass.emissiveColor = new BABYLON.Color3(0.05, 0.06, 0.07);
        glass.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND; glass.backFaceCulling = false;
        const text = new BABYLON.StandardMaterial('shopText', scene);
        text.diffuseTexture = this.textAtlas(scene); text.useAlphaFromDiffuseTexture = true;
        text.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
        text.specularColor = BABYLON.Color3.Black();
        text.emissiveColor = new BABYLON.Color3(0.42, 0.42, 0.4);          // (a letra do letreiro é clara mesmo na sombra)
        text.zOffset = -1; text.zOffsetUnits = -2;
        if (typeof WindowLights !== 'undefined') WindowLights.apply(text, text.diffuseTexture, [0, 0], 'shop');
        return { solid, glass, text };
    },
    // ShopGlow: color += cor do vértice × (1 − alfa) × 2 × noite (WindowLights.state[0]).
    _glow(material) {
        if (!this._GlowCls) {
            this._GlowCls = class ShopGlowPlugin extends BABYLON.MaterialPluginBase {
                constructor(m) { super(m, 'ShopGlow', 251, { SHOPGLOW: false }); this._enable(true); }
                getClassName() { return 'ShopGlowPlugin'; }
                prepareDefines(d) { d.SHOPGLOW = true; }
                getUniforms() { return { ubo: [{ name: 'sgN', size: 1, type: 'float' }], fragment: 'uniform float sgN;' }; }
                bindForSubMesh(ub) { ub.updateFloat('sgN', typeof WindowLights !== 'undefined' ? WindowLights.state[0] : 0); }
                // (sem VERTEXALPHA o Babylon zera o alfa do vColor: o código vai num varying próprio, lido do atributo)
                getCustomCode(type) {
                    if (type === 'vertex') return {
                        CUSTOM_VERTEX_DEFINITIONS: 'varying float sgA;',
                        CUSTOM_VERTEX_MAIN_END: `
                            #ifdef VERTEXCOLOR
                            sgA = color.a;
                            #else
                            sgA = 1.0;
                            #endif`,
                    };
                    return {
                        CUSTOM_FRAGMENT_DEFINITIONS: 'varying float sgA;',
                        CUSTOM_FRAGMENT_BEFORE_FOG: `
                            #if defined(SHOPGLOW) && defined(VERTEXCOLOR)
                            if (sgN > 0.002 && sgA < 0.995) color.rgb += vColor.rgb * (1.0 - sgA) * 2.0 * sgN;
                            #endif`,
                    };
                }
            };
        }
        return new this._GlowCls(material);
    },

    // ------------------------------------------------------------------ a geometria
    // Uma loja `s` do lote `l`: b = lote sólido, gl = vidros, tx = texto. As medidas são do lado de FORA da parede: s ao longo dela
    // (0..6 a partir de s.a), d para fora (0 = a parede), y a partir da calçada.
    add(l, s, b, gl, tx) {
        const SH = TileFactory.SHOPS[s.kind], hex = (h, k = 1) => { const c = Pixel.hex(h); return [c[0] / 255 * k, c[1] / 255 * k, c[2] / 255 * k]; };
        const side = s.side, Y0 = this.Y0, a = s.a;
        const mix = (c, d, t) => [c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t, c[2] + (d[2] - c[2]) * t];
        const ga = (c, glow) => [c[0], c[1], c[2], 1 - glow];
        // caixa local → mundo (sempre alinhada aos eixos: as lojas estão nos lados do lote)
        const rect = (s0, s1, d0, d1) => side === 'S' ? [a + s0, l.z0 - d1, a + s1, l.z0 - d0] : side === 'N' ? [a + 6 - s1, l.z1 + d0, a + 6 - s0, l.z1 + d1]
            : side === 'W' ? [l.x0 - d1, a + 6 - s1, l.x0 - d0, a + 6 - s0] : [l.x1 + d0, a + s0, l.x1 + d1, a + s1];
        const box = (B, s0, s1, d0, d1, y0, y1, col) => { const r = rect(s0, s1, d0, d1); B.solid(r[0], r[1], r[2], r[3], Y0 + y0, Y0 + y1, col); };
        // peça pequena atrás do vidro (mercadoria, prateleira): só a frente e o topo — os lados nem aparecem
        const uv0 = () => [0, 0];
        const item = (B, s0, s1, d0, d1, y0, y1, col) => { face(B, s0, s1, y0, y1, d1, null, col); const r = rect(s0, s1, d0, d1); B.top(r[0], r[1], r[2], r[3], Y0 + y1, uv0, col); };
        // quad virado para fora (o lado de quem olha da rua): cantos em (s, y) a d da parede
        const face = (B, s0, s1, y0, y1, d, uv, col) => {
            const P = (ss, yy) => {
                const yw = Y0 + yy;
                if (side === 'S') return [a + ss, yw, l.z0 - d];
                if (side === 'N') return [a + 6 - ss, yw, l.z1 + d];
                if (side === 'W') return [l.x0 - d, yw, a + 6 - ss];
                return [l.x1 + d, yw, a + ss];
            };
            const n = side === 'S' ? [0, 0, -1] : side === 'N' ? [0, 0, 1] : side === 'W' ? [-1, 0, 0] : [1, 0, 0];
            B.quad(P(s0, y1), P(s1, y1), P(s0, y0), P(s1, y0), n, uv || this._UV0, col);
        };
        const wall = hex(SH.wall), sign = hex(SH.sign), glassC = hex(SH.glass);
        const clad = mix(wall, [1, 1, 1], 0.08), cladD = mix(wall, [0, 0, 0], 0.18), granite = mix(wall, [0.12, 0.11, 0.1], 0.72);
        const alu = [0.17, 0.18, 0.2], room = mix([0.44, 0.35, 0.25], wall, 0.18), seed = Math.round(a * 7) + (side.charCodeAt(0) << 3) + s.kind * 13;
        const D = 0.24, G = 0.15;                                     // a frente sai D da parede; o vidro fica a G
        // ---- o letreiro: a moldura escura, a caixa de luz (acende) e o texto
        box(b, 0.04, 5.96, 0, D + 0.05, 2.17, 2.79, cladD);
        box(b, 0.1, 5.9, D + 0.05, D + 0.09, 2.21, 2.75, ga(sign, 0.5));
        const r0 = (s.kind + 0.06) / 16, r1 = (s.kind + 0.94) / 16;                   // (textura crua: a 1ª linha dos dados é v = 0)
        face(tx, 0.18, 5.82, 2.25, 2.71, D + 0.095, [[0, r0], [1, r0], [0, r1], [1, r1]], [1, 0.98, 0.92]);
        // ---- a frente: pilares, verga e a bandeira (revestimento na cor da loja)
        box(b, 0, 6, 0, D, 1.94, 2.17, clad);                          // verga
        if (SH.id === 'oficina') {
            // PORTÃO DE ENROLAR: os pilares largos, o rolo em cima e as lâminas (em degrau: a sombra de cada uma), a luz embaixo
            box(b, 0, 0.6, 0, D, 0, 1.94, clad); box(b, 5.4, 6, 0, D, 0, 1.94, clad);
            box(b, 0.55, 5.45, 0.02, D + 0.08, 1.74, 1.94, [0.42, 0.44, 0.47]);
            const n = 13, h = 1.62 / n;
            for (let k = 0; k < n; k++) {
                const y0 = 0.12 + k * h, c = k % 2 ? [0.66, 0.68, 0.71] : [0.58, 0.6, 0.64];
                box(b, 0.6, 5.4, 0.04, 0.09 + (k % 2) * 0.015, y0, y0 + h, c);
            }
            box(b, 0.6, 5.4, 0.04, 0.11, 0.06, 0.12, [0.16, 0.16, 0.18]);                    // a barra de baixo
            box(b, 0.6, 5.4, 0.0, 0.035, 0, 0.06, ga([1, 0.72, 0.4], 0.75));                // a fresta com a luz da oficina
            box(b, 0, 6, 0, D + 0.02, -0.02, 0.06, granite);
        } else {
            for (const [p0, p1] of [[0, 0.32], [2.26, 2.54], [3.46, 3.74], [5.68, 6]]) box(b, p0, p1, 0, D, 0, 1.94, clad);
            for (const [w0, w1] of [[0.32, 2.26], [3.74, 5.68]]) {
                box(b, w0, w1, 0, D + 0.02, -0.02, 0.42, granite);                          // rodapé de granito (o parapeito da vitrine)
                box(b, w0, w1, 0, D + 0.04, 0.42, 0.47, mix(granite, [1, 1, 1], 0.25));      // a pingadeira
                box(b, w0, w1, 0, D, 1.78, 1.94, clad);                                    // a bandeira em cima do vidro
                // o caixilho de alumínio (no plano do vidro) e o montante no meio
                box(b, w0, w0 + 0.05, G - 0.03, G + 0.03, 0.47, 1.78, alu); box(b, w1 - 0.05, w1, G - 0.03, G + 0.03, 0.47, 1.78, alu);
                box(b, w0, w1, G - 0.03, G + 0.03, 1.73, 1.78, alu); box(b, w0, w1, G - 0.03, G + 0.03, 0.47, 0.52, alu);
                const wm = (w0 + w1) / 2;
                box(b, wm - 0.025, wm + 0.025, G - 0.03, G + 0.03, 0.52, 1.73, alu);
                // a SALA atrás do vidro: o fundo (acende), a bancada e duas prateleiras com a mercadoria
                face(b, w0, w1, 0.47, 1.78, 0.004, null, ga(room, 0.42));
                item(b, w0, w1, 0.004, 0.11, 0.47, 0.58, ga(mix(room, [0, 0, 0], 0.35), 0.1));
                for (let r = 0; r < 2; r++) {
                    const sy = 0.9 + r * 0.44;
                    item(b, w0 + 0.05, w1 - 0.05, 0.004, 0.1, sy - 0.025, sy, [0.3, 0.24, 0.19, 0.96]);
                    let x = w0 + 0.1 + this._h(seed, r, 3) * 0.1;
                    for (let k = 0; x < w1 - 0.22 && k < 9; k++) {
                        const hh = this._h(seed + k, r, 7), w = 0.1 + hh * 0.1, ht = 0.1 + this._h(k, seed, r) * 0.16;
                        const pc = [[0.79, 0.27, 0.23], [0.85, 0.69, 0.31], [0.18, 0.53, 0.82], [0.91, 0.89, 0.83], [0.25, 0.64, 0.3], [0.83, 0.42, 0.62]][Math.floor(this._h(k + r, seed, 11) * 6)];
                        item(b, x, x + w, 0.02, 0.07 + hh * 0.02, sy, sy + ht, ga(pc, 0.22));
                        x += w + 0.04 + this._h(k, r, seed) * 0.06;
                    }
                }
                // o vidro: reflexo do céu em cima, mais transparente embaixo
                const top = mix(glassC, [0.86, 0.92, 1], 0.45), bot = mix(glassC, [0, 0, 0], 0.25);
                face(gl, w0 + 0.05, w1 - 0.05, 0.52, 1.73, G, null, [[top[0], top[1], top[2], 0.62], [top[0], top[1], top[2], 0.55], [bot[0], bot[1], bot[2], 0.3], [bot[0], bot[1], bot[2], 0.38]]);
            }
            // ---- a PORTA: o batente, a folha de vidro com o caixilho, o puxador; a sala atrás
            box(b, 2.54, 2.6, 0, D, 0, 1.94, alu); box(b, 3.4, 3.46, 0, D, 0, 1.94, alu);
            box(b, 2.6, 3.4, G - 0.03, G + 0.03, 1.84, 1.94, alu);
            box(b, 2.6, 3.4, G - 0.03, G + 0.03, 0, 0.12, alu);
            box(b, 2.6, 2.66, G - 0.03, G + 0.03, 0.12, 1.84, alu); box(b, 3.34, 3.4, G - 0.03, G + 0.03, 0.12, 1.84, alu);
            box(b, 3.22, 3.26, G + 0.03, G + 0.08, 0.86, 1.3, [0.78, 0.8, 0.83]);
            face(b, 2.6, 3.4, 0, 1.94, 0.004, null, ga(mix(room, [0, 0, 0], 0.15), 0.38));
            box(b, 2.54, 3.46, 0, D + 0.03, -0.02, 0.0, [0.4, 0.4, 0.42]);                      // a soleira
            const top = mix(glassC, [0.86, 0.92, 1], 0.35), bot = mix(glassC, [0, 0, 0], 0.3);
            face(gl, 2.66, 3.34, 0.12, 1.84, G, null, [[top[0], top[1], top[2], 0.58], [top[0], top[1], top[2], 0.52], [bot[0], bot[1], bot[2], 0.34], [bot[0], bot[1], bot[2], 0.4]]);
        }
        if (this.stats) this.stats.shops++;
    },
};
