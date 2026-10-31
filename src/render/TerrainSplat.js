// ============================================================================
// TerrainSplat — o chão do mundo grande num material só, com as divisas de bioma em DEGRADÊ e de contorno arredondado.
//
// Antes: um material por bioma, uma célula de 4 u = um quadrado de uma textura; na divisa, sub-quadrados de 2 u sorteados (bordas
// em escada, "Minecraft"), e as curvas de nível eram traços retos na borda das células.
// Agora (plugin no StandardMaterial: luz, sombra, vértice colorido do relevo e noite continuam do Babylon):
//   • splatMap (1 texel por célula): R = tipo de chão (índice em IDS; 255 = mar/cidade, que não entram na mistura), G/B = altura;
//   • splatAtlas: as texturas de 80 px (4 u) dos tipos de chão lado a lado;
//   • cada pixel mistura as 4 células em volta com pesos bilineares "apertados" (a transição tem ~2 u) num ponto ENTORTADO por ruído:
//     as divisas viram curvas orgânicas, sem quinas, e a troca de textura é gradual;
//   • curvas de nível: linhas onde a altura interpolada cruza múltiplos de Config.world.contour (curvas, não degraus);
//   • tudo na grade de pixels do mundo (20 px/u): continua pixel art — com o gráfico suave (Smooth), sem a grade e com a textura
//     filtrada (bilinear feito à mão dentro do ladrilho do atlas, que repete).
//   • com a cidade em alta definição (art/CityHD.js): os ladrilhos são os pintados em HD (Q × 80 px, com relevo) e há um segundo
//     atlas em meia resolução; o shader mistura os dois pelo tamanho do texel na tela (sem cintilar de longe — o atlas não tem mipmaps).
// ============================================================================

const TerrainSplat = {
    IDS: ['sand', 'grass', 'forest', 'scrub', 'rock', 'swamp', 'earth', 'farm0', 'farm1', 'farm2'],
    NONE: 255,
    TILE: 80, COLS: 4, ROWS: 3,
    HK: 32,                                  // altura × HK em 16 bits (até ~2000 u)

    // idOf(i, j) → índice em IDS ou NONE. Devolve o material.
    create(scene, idOf) {
        const M = WorldMap, W = Config.world, nx = M.nx, nz = M.nz, hd = typeof CityHD !== 'undefined' && CityHD.on, T = hd ? this.TILE * CityHD.Q : this.TILE;
        // atlas com as mesmas texturas (e sementes) do TileFactory.create — ou as pintadas em alta definição
        const F = TileFactory, H = (n, ...a) => { const t = CityHD.paint(n, ...a); const d = t.g.getImageData(0, 0, T, T).data; t.cv.width = t.cv.height = 0; return { data: d }; };
        const src = hd ? { sand: H('sand', 61), grass: H('grass', 51), forest: H('forest', 171), scrub: H('scrub', 161), rock: H('rock', 111),
            swamp: H('swamp', 121), earth: H('earth', 181), farm0: H('farm', 131, 0), farm1: H('farm', 141, 1), farm2: H('farm', 151, 2) }
            : { sand: F.sand(61), grass: F.grass(51), forest: F.forest(171), scrub: F.scrub(161), rock: F.rock(111),
                swamp: F.swamp(121), earth: F.earth(181), farm0: F.farm(131, 0), farm1: F.farm(141, 1), farm2: F.farm(151, 2) };
        if (hd) CityHD.release();
        const AW = T * this.COLS, AH = T * this.ROWS, atlas = new Uint8Array(AW * AH * 4);
        this.IDS.forEach((key, n) => {
            const d = src[key].data, ox = (n % this.COLS) * T, oy = Math.floor(n / this.COLS) * T;
            for (let y = 0; y < T; y++) atlas.set(d.subarray(y * T * 4, (y + 1) * T * 4), ((oy + y) * AW + ox) * 4);
        });
        const atlasTex = BABYLON.RawTexture.CreateRGBATexture(atlas, AW, AH, scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
        atlasTex.wrapU = atlasTex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        // HD: o mesmo atlas em meia resolução (média de 2×2), para longe
        let atlas2Tex = null;
        if (hd) {
            const BW = AW >> 1, BH = AH >> 1, a2 = new Uint8Array(BW * BH * 4);
            for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
                const o = (y * BW + x) * 4, i = (2 * y * AW + 2 * x) * 4, j = i + AW * 4;
                for (let c = 0; c < 4; c++) a2[o + c] = (atlas[i + c] + atlas[i + 4 + c] + atlas[j + c] + atlas[j + 4 + c] + 2) >> 2;
            }
            atlas2Tex = BABYLON.RawTexture.CreateRGBATexture(a2, BW, BH, scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
            atlas2Tex.wrapU = atlas2Tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        }

        const map = new Uint8Array(nx * nz * 4);
        for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
            const k = j * nx + i, o = k * 4, h = Math.max(0, Math.min(65535, Math.round(M.h[k] * this.HK)));
            map[o] = idOf(i, j); map[o + 1] = h >> 8; map[o + 2] = h & 255; map[o + 3] = M.flags[k] & 1 ? 0 : 255;      // A: 0 = paredão
        }
        const mapTex = BABYLON.RawTexture.CreateRGBATexture(map, nx, nz, scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
        mapTex.wrapU = mapTex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

        const m = new BABYLON.StandardMaterial('terrain', scene);
        m.diffuseTexture = atlasTex;                         // (só liga o caminho "com textura" do shader; a cor vem do plugin)
        m.specularColor = BABYLON.Color3.Black();
        m.transparencyMode = BABYLON.Material.MATERIAL_OPAQUE;      // (a textura RGBA "tem alfa": sem isto o chão iria para a passada transparente)
        this._plugin(m, mapTex, atlasTex, { minX: W.minX, minZ: W.minZ, cell: W.cell, nx, nz, contour: W.contour, tile: T, atlas2: atlas2Tex, lod: !!atlas2Tex && scene.getEngine().webGLVersion >= 2 });
        return m;
    },

    _plugin(material, mapTex, atlasTex, P) {
        const f = (v) => Number(v).toFixed(6), S = this, TL = P.tile || S.TILE, A2 = P.atlas2 || atlasTex;
        const GLSL = `
            uniform sampler2D splatMap;
            uniform sampler2D splatAtlas;
            uniform sampler2D splatAtlas2;
            float tLod = 0.0;
            float tHash(vec2 p) { return fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453); }
            float tNoise(vec2 p) {
                vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
                return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), f.x), f.y);
            }
            vec4 tCell(vec2 c) { return texture2D(splatMap, (clamp(c, vec2(0.0), vec2(${f(P.nx - 1)}, ${f(P.nz - 1)})) + 0.5) / vec2(${f(P.nx)}, ${f(P.nz)})); }
            float tId(vec4 c) { return floor(c.r * 255.0 + 0.5); }
            float tH(vec4 c) { return (floor(c.g * 255.0 + 0.5) * 256.0 + floor(c.b * 255.0 + 0.5)) / ${f(S.HK)}; }
            vec3 tPx(vec2 o, vec2 t) { return texture2D(splatAtlas, (o + mod(t, ${f(TL)}) + 0.5) / vec2(${f(TL * S.COLS)}, ${f(TL * S.ROWS)})).rgb; }
            vec3 tPx2(vec2 o, vec2 t) { return texture2D(splatAtlas2, (o + mod(t, ${f(TL / 2)}) + 0.5) / vec2(${f(TL / 2 * S.COLS)}, ${f(TL / 2 * S.ROWS)})).rgb; }
            vec3 tTex(float id, vec2 p) {
                vec2 o = vec2(mod(id, ${f(S.COLS)}), floor(id / ${f(S.COLS)})) * ${f(TL)};
                vec2 q = fract(p / 4.0) * ${f(TL)};
                if (tSmooth > 0.5) {                                                                // gráfico suave: bilinear DENTRO do ladrilho (repete)
                    vec2 i = floor(q - 0.5), w = q - 0.5 - i;
                    vec3 c0 = mix(mix(tPx(o, i), tPx(o, i + vec2(1.0, 0.0)), w.x), mix(tPx(o, i + vec2(0.0, 1.0)), tPx(o, i + vec2(1.0, 1.0)), w.x), w.y);
                    if (tLod <= 0.01) return c0;
                    vec2 o2 = o * 0.5, q2 = q * 0.5, i2 = floor(q2 - 0.5), w2 = q2 - 0.5 - i2;                 // longe: o atlas de meia resolução
                    vec3 c1 = mix(mix(tPx2(o2, i2), tPx2(o2, i2 + vec2(1.0, 0.0)), w2.x), mix(tPx2(o2, i2 + vec2(0.0, 1.0)), tPx2(o2, i2 + vec2(1.0, 1.0)), w2.x), w2.y);
                    return mix(c0, c1, tLod);
                }
                return tPx(o, floor(q));
            }
            float tW(float w, float id) { return id > 250.0 ? 0.0 : w * w * w; }               // peso apertado, mar e cidade fora (sem ponto e vírgula em comentário GLSL: o Babylon corta a linha ali)
            vec3 terrainColor(vec2 p) {
                vec2 org = vec2(${f(P.minX)}, ${f(P.minZ)});
                // divisas: ponto entortado por ruído (2 escalas) → curvas orgânicas, sem quinas de célula
                vec2 warp = (vec2(tNoise(p * 0.21), tNoise(p * 0.21 + 37.7)) - 0.5) * 3.0 + (vec2(tNoise(p * 0.9 + 11.0), tNoise(p * 0.9 + 5.3)) - 0.5) * 0.9;
                vec2 f = (p + warp - org) / ${f(P.cell)} - 0.5, i0 = floor(f), t = f - i0;
                vec4 c00 = tCell(i0), c10 = tCell(i0 + vec2(1.0, 0.0)), c01 = tCell(i0 + vec2(0.0, 1.0)), c11 = tCell(i0 + vec2(1.0, 1.0));
                float a = tId(c00), b = tId(c10), c = tId(c01), d = tId(c11);
                float own = tId(tCell(floor((p - org) / ${f(P.cell)})));
                vec3 col;
                if (a == b && a == c && a == d && a < 250.0) col = tTex(a, p);                    // miolo do bioma: uma amostra só
                else {
                    float wa = tW((1.0 - t.x) * (1.0 - t.y), a), wb = tW(t.x * (1.0 - t.y), b), wc = tW((1.0 - t.x) * t.y, c), wd = tW(t.x * t.y, d);
                    float wo = own > 250.0 ? 0.0 : 1e-4, sum = wa + wb + wc + wd + wo;
                    col = sum > 0.0 ? (tTex(a, p) * wa + tTex(b, p) * wb + tTex(c, p) * wc + tTex(d, p) * wd + (wo > 0.0 ? tTex(own, p) * wo : vec3(0.0))) / sum : tTex(1.0, p);
                }
                // curvas de nível: isolinhas da altura interpolada (sem o entortado), onde o terreno é alto, pedra ou favela
                vec2 g = (p - org) / ${f(P.cell)} - 0.5, j0 = floor(g), s = g - j0;
                vec4 h00 = tCell(j0), h10 = tCell(j0 + vec2(1.0, 0.0)), h01 = tCell(j0 + vec2(0.0, 1.0)), h11 = tCell(j0 + vec2(1.0, 1.0));
                float ha = tH(h00), hb = tH(h10), hc = tH(h01), hd = tH(h11);
                float hh = mix(mix(ha, hb, s.x), mix(hc, hd, s.x), s.y);
                vec2 gr = vec2(mix(hb - ha, hd - hc, s.y), mix(hc - ha, hd - hb, s.x)) / ${f(P.cell)};
                // paredão: a encosta íngreme escurece (sombra), seguindo a curva da altura, não a borda da célula
                float cliff = 1.0 - mix(mix(h00.a, h10.a, s.x), mix(h01.a, h11.a, s.x), s.y);         // marca de paredão, interpolada
                if (cliff > 0.0) col *= 1.0 - 0.45 * smoothstep(0.3, 0.7, cliff) * smoothstep(0.6, 0.95, length(gr) + (tNoise(p * 1.7) - 0.5) * 0.15);
                if ((max(max(ha, hb), max(hc, hd)) > 8.0 || own == 4.0 || own == 6.0) && length(gr) > 0.04) {      // (platô plano: sem linha)
                    float lv = hh / ${f(P.contour)}, m = floor(lv + 0.5);
                    float dist = abs(lv - m) * ${f(P.contour)} / max(length(gr), 0.02);
                    bool major = mod(m, 4.0) < 0.5;
                    float th = major ? 0.17 : 0.10, dk = major ? 0.36 : 0.52;
                    if (dist < th && m > 0.5) col = vec3(0.32 * dk + 0.1, 0.27 * dk + 0.08, 0.2 * dk + 0.05);
                }
                return col;
            }`;
        class TerrainSplatPlugin extends BABYLON.MaterialPluginBase {
            constructor(mat) { super(mat, 'TerrainSplat', 200, { TSPLAT: false }); this._enable(true); }
            getClassName() { return 'TerrainSplatPlugin'; }
            prepareDefines(defines) { defines.TSPLAT = true; }
            getSamplers(samplers) { samplers.push('splatMap', 'splatAtlas', 'splatAtlas2'); }
            getUniforms() { return { ubo: [{ name: 'tSmooth', size: 1, type: 'float' }], fragment: 'uniform float tSmooth;' }; }
            bindForSubMesh(ub) { ub.setTexture('splatMap', mapTex); ub.setTexture('splatAtlas', atlasTex); ub.setTexture('splatAtlas2', A2); ub.updateFloat('tSmooth', P.atlas2 || (typeof Smooth !== 'undefined' && Smooth.on) ? 1 : 0); }
            getCustomCode(shaderType) {
                if (shaderType !== 'fragment') return null;
                return {
                    CUSTOM_FRAGMENT_DEFINITIONS: `
                        #ifdef TSPLAT
                        ${GLSL}
                        #endif`,
                    CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
                        #ifdef TSPLAT
                        ${P.lod ? `tLod = clamp(log2(max(length(dFdx(vPositionW.xz)), length(dFdy(vPositionW.xz))) * ${f(TL / 4)}) - 0.2, 0.0, 1.0);` : 'tLod = 0.0;'}
                        baseColor.rgb = terrainColor(tSmooth > 0.5 ? vPositionW.xz : (floor(vPositionW.xz * 20.0) + 0.5) / 20.0);     // (pixel art: na grade do mundo)
                        #ifdef VERTEXCOLOR
                        baseColor.rgb *= vColor.rgb;                                                   // (relevo: brilho por canto)
                        #endif
                        #endif`,
                };
            }
        }
        new TerrainSplatPlugin(material);
        S.glsl = GLSL; S.tex = { map: mapTex, atlas: atlasTex, atlas2: A2 };       // (o mar usa o mesmo chão onde a beira suavizada entra nas células de mar: WaterPlugin)
    },
};
