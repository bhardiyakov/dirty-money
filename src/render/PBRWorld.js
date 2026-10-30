// ============================================================================
// PBRWorld — os materiais do MUNDO em PBRMaterial (visual moderno: Config.render.pbr) no lugar dos StandardMaterial chapados:
//   • rugosidade (roughness) por superfície: asfalto e concreto foscos com um brilho leve do sol rasante, grama e terra sem brilho
//     nenhum, telhados de metal um pouco acetinados, a ÁGUA quase lisa (o sol brilha nas ondas);
//   • MAPA DE NORMAIS (bumpTexture) procedural e contínuo (sem emenda) para cada tipo de chão: o grão e os buracos do asfalto, a
//     textura do concreto, as touceiras da grama, as ondinhas da areia, os torrões da terra e as fendas da pedra — o relevo reage ao
//     sol e às sombras;
//   • variação de tom em manchas grandes (ruído no mundo): a grama ganha trechos mais secos e mais verdes, o asfalto remendos — o
//     ladrilho de 4 u deixa de parecer um padrão único repetido;
//   • a luz ambiente da cena (scene.ambientColor, ver Atmosphere) enche as sombras;
//   • a água (o plano do mar e da lagoa): ondas em movimento no mapa de normais (no shader, sem textura: funciona com o material
//     congelado), o reflexo do céu (gradiente zênite → horizonte da hora do dia, com fresnel) e a rugosidade baixa só onde é água (a
//     faixa de areia/chão pintada no mesmo plano continua fosca). A cor do raso e da beira continua no WaterPlugin.
//
// Compatibilidade: os plugins de material do mundo (WaterPlugin, GroundBlend, RoofCut, WindowLights, TerrainSplat) foram escritos para
// o StandardMaterial; com o PBR eles usam PBRWorld.albedo (o miolo em `baseColor`, em gama, vira `surfaceAlbedo`, linear) e trocam
// `color` por `finalColor`. As cores por vértice (o relevo tingindo o chão, as peças de cor sólida) continuam em gama, como no
// StandardMaterial (o PBR as multiplicaria em linear: escureceria tudo). O material ganha os apelidos diffuseTexture/diffuseColor.
//   material(scene, name, tex, opts)   o PBRMaterial do mundo (WorldBuilder._mat, TerrainSplat)     isPBR(m)
// ============================================================================

const PBRWorld = {
    get on() { const R = Config.render; return !!(R.modern && R.pbr); },
    isPBR(m) { return !!m && m.getClassName && m.getClassName() === 'PBRMaterial'; },

    // Perfil de cada superfície pelo nome do material: r = rugosidade, n = mapa de normais (tipo, força, ladrilhos por UV), mv = variação
    // de tom (±), ms = escala das manchas (1/u), tint = cor das manchas (rgb × , força), spec = especular.
    profile(name) {
        const P = (r, n, lvl, mv, o = {}) => Object.assign({ r, n, lvl, mv, ms: 0.05, tint: null, spec: 1, uv: 1 }, o);
        const k = name.replace(/^(x|b)(?=road|sidewalk|curb|rock|solid)/, '');
        if (k === 'water') return P(0.08, null, 0, 0, { water: true });
        if (k === 'terrain') return P(0.95, 'grass', 0.55, 0.12, { tint: [1.16, 1.06, 0.7, 0.4], ms: 0.035, relief: true });
        if (/^(road|asphalt)/.test(k)) return P(0.82, 'asphalt', 0.6, 0.08, { tint: [0.8, 0.82, 0.85, 0.35], ms: 0.06 });
        if (k === 'zebra') return P(0.78, 'asphalt', 0.45, 0.05);
        if (/^(sidewalk|plaza|concrete|curb|calcadao)/.test(k)) return P(0.86, 'concrete', 0.45, 0.06, { tint: [0.88, 0.86, 0.82, 0.3] });
        if (/grass/.test(k)) return P(0.97, 'grass', 0.85, 0.14, { tint: [1.18, 1.08, 0.68, 0.45], ms: 0.04, spec: 0.4 });
        if (/sand/.test(k)) return P(0.93, 'sand', 0.6, 0.06, { tint: [1.05, 1.02, 0.94, 0.3] });
        if (/dirt|earth/.test(k)) return P(0.96, 'soil', 0.75, 0.1, { tint: [0.86, 0.82, 0.76, 0.35], spec: 0.5 });
        if (/rock/.test(k)) return P(0.88, 'rock', 0.9, 0.1);
        if (/^roof_|machtop/.test(k)) return P(0.74, 'grain', 0.35, 0.05, { ms: 0.08 });
        if (/^facade_|machside/.test(k)) return P(0.84, 'grain', 0.22, 0.04, { ms: 0.08 });
        if (k === 'shop') return P(0.7, 'grain', 0.2, 0.03);
        return P(0.85, null, 0, 0.04);
    },

    material(scene, name, tex, opts = {}) {
        const pr = this.profile(name), m = new BABYLON.PBRMaterial(name, scene);
        m.metallic = 0;
        m.roughness = pr.r;
        m.albedoColor = BABYLON.Color3.White();
        if (tex) m.albedoTexture = tex;
        m.specularIntensity = pr.spec;
        m.environmentIntensity = 0;
        m.ambientColor = BABYLON.Color3.Black();             // (a luz ambiente entra pelo plugin: acompanha o dia com o material congelado)
        if (opts.alphaTest) {
            tex.hasAlpha = true;
            m.useAlphaFromAlbedoTexture = true;
            m.transparencyMode = BABYLON.Material.MATERIAL_ALPHATEST;
            m.alphaCutOff = 0.5;
        }
        if (opts.color) m.albedoColor = BABYLON.Color3.FromHexString(opts.color).toLinearSpace();
        if (pr.n) m.bumpTexture = this.normalMap(scene, pr.n, pr.lvl, pr.uv);
        // apelidos do StandardMaterial (quem lê/escreve a cor e a textura do material do mundo continua funcionando)
        Object.defineProperty(m, 'diffuseTexture', { get() { return this.albedoTexture; }, set(t) { this.albedoTexture = t; } });
        Object.defineProperty(m, 'diffuseColor', { get() { return this.albedoColor; }, set(c) { this.albedoColor = c; } });
        Object.defineProperty(m, 'specularColor', { get() { return BABYLON.Color3.Black(); }, set() {} });
        this.detail(m, pr);
        return m;
    },

    // O miolo de um CUSTOM_FRAGMENT_UPDATE_DIFFUSE do StandardMaterial (mexe em `baseColor`, gama) rodando no PBR (CUSTOM_FRAGMENT_UPDATE_ALPHA:
    // logo depois do albedo). (sem comentário GLSL aqui: o Babylon corta a linha no ponto e vírgula)
    albedo(code) {
        return `{
            vec4 baseColor = vec4(toGammaSpace(surfaceAlbedo), alpha);
            ${code}
            surfaceAlbedo = toLinearSpace(baseColor.rgb);
        }`;
    },
    // Um trecho que mexe em `color` (CUSTOM_FRAGMENT_BEFORE_FOG / BEFORE_FRAGCOLOR) no PBR, onde a cor se chama finalColor.
    final(code) { return `\n#define color finalColor\n${code}\n#undef color\n`; },
    // getCustomCode de um plugin do StandardMaterial adaptado ao PBR (os pontos de injeção e as variáveis de lá).
    adapt(material, code) {
        if (!code || !this.isPBR(material)) return code;
        const out = {};
        for (const k of Object.keys(code)) {
            let c = code[k].replace(/defined\(DIFFUSE\)/g, 'defined(ALBEDO)').replace(/vDiffuseUV/g, 'vAlbedoUV');
            if (k === 'CUSTOM_FRAGMENT_UPDATE_DIFFUSE') out.CUSTOM_FRAGMENT_UPDATE_ALPHA = (out.CUSTOM_FRAGMENT_UPDATE_ALPHA || '') + this.albedo(c);
            else if (k === 'CUSTOM_FRAGMENT_BEFORE_FOG' || k === 'CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR') out[k] = this.final(c);
            else out[k] = c;
        }
        return out;
    },

    // ------------------------------------------------------------------ o plugin de detalhe (todo material PBR do mundo)
    detail(material, pr) {
        if (!this._cls) this._cls = this._makeClass();
        return new this._cls(material, pr);
    },
    _sun: new BABYLON.Vector3(0, -1, 0),
    _makeClass() {
        const W = this;
        const NOISE = `
            float sdH(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
            float sdN(vec2 p) {
                vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
                return mix(mix(sdH(i), sdH(i + vec2(1.0, 0.0)), f.x), mix(sdH(i + vec2(0.0, 1.0)), sdH(i + vec2(1.0, 1.0)), f.x), f.y);
            }
            vec2 sdWave(vec2 p, vec2 d, float f, float s, float t) { float ph = dot(p, d) * f + t * s; return d * cos(ph) * f; }
            vec2 sdWaves(vec2 p, float t) {
                vec2 g = sdWave(p, vec2(0.8, 0.6), 0.9, 1.3, t) * 0.5;
                g += sdWave(p, vec2(-0.45, 0.89), 1.37, 1.7, t) * 0.32;
                g += sdWave(p, vec2(0.96, -0.28), 2.11, 2.3, t) * 0.2;
                g += sdWave(p, vec2(-0.71, -0.7), 3.3, 3.1, t) * 0.12;
                g += sdWave(p, vec2(0.2, 0.98), 5.7, 4.2, t) * 0.07;
                g += (vec2(sdN(p * 1.9 + t * 0.21), sdN(p * 1.9 - t * 0.17 + 9.1)) - 0.5) * 0.5;
                return g;
            }`;
        return class PBRDetailPlugin extends BABYLON.MaterialPluginBase {
            constructor(material, pr) {
                super(material, 'PBRDetail', 100, { SDETAIL: false, SD_WATER: false, SD_RELIEF: false });
                this.pr = pr;
                this.P = new Float32Array([0, pr.mv, pr.ms, 0]);
                this.T = new Float32Array(pr.tint || [1, 1, 1, 0]);
                this._enable(true);
            }
            getClassName() { return 'PBRDetailPlugin'; }
            prepareDefines(defines) { defines.SDETAIL = true; defines.SD_WATER = !!this.pr.water; defines.SD_RELIEF = !!this.pr.relief; }
            getUniforms() {
                return {
                    ubo: [{ name: 'sdP', size: 4, type: 'vec4' }, { name: 'sdT', size: 4, type: 'vec4' }, { name: 'sdAmb', size: 4, type: 'vec4' },
                        { name: 'sdSkyZ', size: 4, type: 'vec4' }, { name: 'sdSkyH', size: 4, type: 'vec4' }],
                    fragment: 'uniform vec4 sdP;\nuniform vec4 sdT;\nuniform vec4 sdAmb;\nuniform vec4 sdSkyZ;\nuniform vec4 sdSkyH;',
                };
            }
            bindForSubMesh(ub, scene) {
                const a = scene.ambientColor, S = typeof Atmosphere !== 'undefined' ? Atmosphere.sky : null;
                ub.updateFloat4('sdP', (performance.now() / 1000) % 1000, this.P[1], this.P[2], S ? S.night : 0);
                ub.updateFloat4('sdT', this.T[0], this.T[1], this.T[2], this.T[3]);
                ub.updateFloat4('sdAmb', a.r, a.g, a.b, 1);
                if (S) {
                    const z = S.zenith, h = S.horizon, L = (v) => Math.pow(v, 2.2);
                    ub.updateFloat4('sdSkyZ', L(z.r), L(z.g), L(z.b), 1);
                    ub.updateFloat4('sdSkyH', L(h.r), L(h.g), L(h.b), 1);
                }
            }
            getCustomCode(shaderType) {
                if (shaderType !== 'fragment') return null;
                // (sem ponto e vírgula em comentário GLSL: o Babylon corta a linha ali)
                return {
                    CUSTOM_FRAGMENT_DEFINITIONS: `
                        #ifdef SDETAIL
                        ${NOISE}
                        float sdWater = 0.0;
                        #endif`,
                    CUSTOM_FRAGMENT_UPDATE_ALPHA: `
                        #if defined(SDETAIL) && defined(VERTEXCOLOR)
                        surfaceAlbedo = surfaceAlbedo / max(vColor.rgb, vec3(0.004)) * toLinearSpace(vColor.rgb);
                        #endif`,
                    CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
                        #ifdef SDETAIL
                        {
                            vec2 sp = vPositionW.xz + vPositionW.y * vec2(0.37, 0.61);
                            float m1 = sdN(sp * sdP.z), m2 = sdN(sp * sdP.z * 4.3 + 17.3);
                            surfaceAlbedo *= 1.0 + ((m1 * 0.7 + m2 * 0.3) - 0.5) * 2.0 * sdP.y;
                            float pk = smoothstep(0.52, 0.78, sdN(sp * sdP.z * 0.55 + 41.0) * 0.75 + m2 * 0.25);
                            surfaceAlbedo = mix(surfaceAlbedo, surfaceAlbedo * sdT.rgb, pk * sdT.a);
                        }
                        #endif
                        #ifdef SD_WATER
                        {
                            float wsb = 8.0;
                            #ifdef SHORE_SEA
                            wsb = shoreDist(vPositionW.xz);
                            float wlake = shoreLake(vPositionW.xz).x;
                            #else
                            float wlake = 0.0;
                            #endif
                            sdWater = smoothstep(-0.25, 0.7, wsb);
                            vec2 g = sdWaves(vPositionW.xz * 0.55, sdP.x) * mix(0.16, 0.07, wlake) * (0.35 + 0.65 * smoothstep(0.0, 4.0, wsb));
                            normalW = normalize(normalW + vec3(-g.x, 0.0, -g.y) * sdWater);
                        }
                        #endif`,
                    '!float roughness\\s*=\\s*reflectivityOut\\.roughness;': `float roughness = reflectivityOut.roughness;
                        #ifdef SD_WATER
                        roughness = mix(0.9, roughness, sdWater);
                        #endif
                        `,
                    CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
                        #ifdef SDETAIL
                        finalAmbient += sdAmb.rgb * surfaceAlbedo.rgb;
                        #endif
                        #ifdef SD_WATER
                        {
                            vec3 V = normalize(vEyePosition.xyz - vPositionW);
                            vec3 Rw = reflect(-V, normalW);
                            float nv = max(dot(normalW, V), 0.0);
                            float fres = 0.05 + 0.6 * pow(1.0 - nv, 3.0);
                            vec3 sky = mix(sdSkyH.rgb, sdSkyZ.rgb, smoothstep(0.05, 0.95, Rw.y));
                            float refl = sdWater * clamp(0.16 + fres * 2.4, 0.0, 0.62) * (1.0 - 0.75 * sdP.w);
                            finalDiffuse *= 1.0 - refl;
                            finalAmbient *= 1.0 - refl;
                            finalEmissive += sky * refl;
                        }
                        #endif`,
                };
            }
        };
    },

    // ------------------------------------------------------------------ mapas de normais procedurais (ladrilháveis)
    // Um por (tipo, força, escala): a força e a escala moram na textura (bumpTexture.level / uScale).
    normalMap(scene, kind, level = 1, uv = 1) {
        const C = this._maps || (this._maps = {}), key = kind + '|' + level + '|' + uv;
        if (C[key]) return C[key];
        const D = this._data || (this._data = {});
        if (!D[kind]) {
            const N = 256, h = this._height(kind, N), d = new Uint8Array(N * N * 4), S = this.STRENGTH[kind] || 2;
            const at = (x, y) => h[((y + N) % N) * N + ((x + N) % N)];
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                const dx = (at(x + 1, y) - at(x - 1, y)) * S, dy = (at(x, y + 1) - at(x, y - 1)) * S, l = 1 / Math.sqrt(dx * dx + dy * dy + 1), o = (y * N + x) * 4;
                d[o] = Math.round((-dx * l * 0.5 + 0.5) * 255); d[o + 1] = Math.round((-dy * l * 0.5 + 0.5) * 255); d[o + 2] = Math.round((l * 0.5 + 0.5) * 255); d[o + 3] = 255;
            }
            D[kind] = { d, N };
        }
        const t = BABYLON.RawTexture.CreateRGBATexture(D[kind].d, D[kind].N, D[kind].N, scene, true, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
        t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
        t.anisotropicFilteringLevel = 4;
        t.name = 'normal_' + key;
        t.level = level; t.uScale = t.vScale = uv;
        return (C[key] = t);
    },
    STRENGTH: { asphalt: 9, concrete: 6, grass: 7, sand: 5, soil: 8, rock: 10, grain: 5 },
    // Campo de altura 0..1 de cada tipo, periódico em N (o ladrilho repete sem emenda).
    _height(kind, N) {
        let seed = 0;
        for (const ch of kind) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
        const hash = (x, y, s) => { let n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
        // ruído de valor periódico: L células por ladrilho
        const vn = (x, y, L, s) => {
            const fx = x / N * L, fy = y / N * L, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
            const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), w = (i) => ((i % L) + L) % L;
            const a = hash(w(ix), w(iy), s), b = hash(w(ix + 1), w(iy), s), c = hash(w(ix), w(iy + 1), s), e = hash(w(ix + 1), w(iy + 1), s);
            return (a + (b - a) * sx) * (1 - sy) + (c + (e - c) * sx) * sy;
        };
        const fbm = (x, y, L, oct, s) => { let v = 0, a = 0.5, n = 0; for (let o = 0; o < oct; o++) { v += vn(x, y, L << o, s + o * 17) * a; n += a; a *= 0.5; } return v / n; };
        const h = new Float32Array(N * N);
        // pedrinhas/torrões: discos suaves espalhados (periódicos)
        const bumps = (count, r0, r1, amp, s) => {
            for (let i = 0; i < count; i++) {
                const cx = hash(i, 1, s) * N, cy = hash(i, 2, s) * N, r = r0 + (r1 - r0) * hash(i, 3, s), a = amp * (0.5 + hash(i, 4, s));
                const R = Math.ceil(r);
                for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
                    const q = (x * x + y * y) / (r * r); if (q >= 1) continue;
                    const px = ((Math.floor(cx) + x) % N + N) % N, py = ((Math.floor(cy) + y) % N + N) % N, k = py * N + px;
                    h[k] += a * (1 - q) * (1 - q);
                }
            }
        };
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            let v;
            switch (kind) {
                case 'asphalt': v = fbm(x, y, 32, 3, seed) * 0.35 + vn(x, y, 128, seed + 5) * 0.35 + fbm(x, y, 4, 2, seed + 9) * 0.3; break;
                case 'concrete': v = fbm(x, y, 16, 3, seed) * 0.25 + vn(x, y, 128, seed + 3) * 0.2 + fbm(x, y, 4, 2, seed + 7) * 0.55; break;
                case 'grass': v = fbm(x, y, 32, 3, seed) * 0.45 + vn(x, y, 128, seed + 2) * 0.25; break;
                case 'sand': { const wv = Math.sin((y / N) * Math.PI * 2 * 9 + fbm(x, y, 4, 2, seed) * 5.5); v = wv * 0.18 + 0.5 + vn(x, y, 128, seed + 1) * 0.3; break; }
                case 'soil': v = fbm(x, y, 16, 4, seed) * 0.55 + vn(x, y, 64, seed + 4) * 0.2; break;
                case 'rock': { const r = 1 - Math.abs(fbm(x, y, 8, 4, seed) * 2 - 1); v = r * r * 0.8 + vn(x, y, 64, seed + 6) * 0.2; break; }
                default: v = vn(x, y, 128, seed) * 0.5 + fbm(x, y, 32, 2, seed + 1) * 0.5;
            }
            h[y * N + x] = v;
        }
        if (kind === 'asphalt') bumps(900, 0.8, 2.2, 0.18, seed + 11);
        if (kind === 'grass') { bumps(700, 2, 5.5, 0.35, seed + 13); bumps(1600, 0.8, 1.8, 0.2, seed + 14); }
        if (kind === 'soil') bumps(500, 1.2, 4, 0.3, seed + 15);
        if (kind === 'concrete') bumps(300, 0.6, 1.4, 0.12, seed + 16);
        return h;
    },
};
