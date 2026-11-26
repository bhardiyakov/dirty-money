// ============================================================================
// GroundVariety — o CHÃO SEM PLANEJAMENTO (Config.art.groundVariety; `?chao=0` desliga): a cidade não foi asfaltada de uma vez, a
// calçada de cada quadra é de um jeito, a rua velha do porto é de paralelepípedo e a da favela é remendo sobre remendo.
//
// MAPA DE ZONAS (uma textura de 256 × 256 sobre o mundo inteiro, ~10 u por texel, montada na carga a partir do bairro de cada quadra e
// de ruído): R = a idade do asfalto (novo, preto e liso → velho, cinza, rachado), G = paralelepípedo, B = o tipo da calçada
// (placas de cimento, ladrilho hidráulico sextavado, pedra portuguesa em ondas, cimento quebrado), A = a sujeira (terra, manchas).
// O SHADER (um plugin nos materiais do chão: rua, asfalto, calçada, praça, terra, cimento, areia, grama) lê a zona pela posição e
// pinta por cima da textura de hoje, sem textura nova:
//   • asfalto: o tom pela idade (as faixas pintadas ficam), REMENDOS retangulares (o asfalto novo preto e o de cimento claro, com a
//     junta), as RACHADURAS do velho (o couro de jacaré), a brita aparente; nas zonas de paralelepípedo, os blocos de granito em fiadas;
//   • calçada: placas de cimento com junta e mancha, ladrilho hidráulico sextavado, a pedra portuguesa preta e branca em ondas (a da
//     orla), o cimento quebrado com terra e mato nas frestas;
//   • terra batida (favela, roça): as manchas úmidas, a brita solta, as pedrinhas, a poça seca; areia com as ondinhas do vento;
//     cimento com as juntas e as rachaduras; grama com as manchas secas.
// O detalhe fino some com a distância (sem chuvisco) e o custo é uma leitura do mapa e uns poucos ruídos por pixel.
//   GroundVariety.on    build() (depois da CityGrid)    apply(material, tipo)
// ============================================================================

const GroundVariety = {
    get on() {
        if (typeof location !== 'undefined' && /[?&]chao=0\b/.test(location.search)) return false;
        return !!(typeof Config !== 'undefined' && Config.art && Config.art.groundVariety !== false);
    },
    N: 256,
    KIND: { asphalt: 1, sidewalk: 2, plaza: 3, earth: 4, concrete: 5, sand: 6, grass: 7 },
    tex: null,
    // por bairro: [idade do asfalto, chance de paralelepípedo, tipo de calçada (0 placa · 1 ladrilho · 2 pedra portuguesa · 3 quebrada), sujeira]
    DISTRICT: {
        downtown: [0.45, 0.22, 2, 0.25], commercial: [0.6, 0.18, 1, 0.35], residential: [0.5, 0.15, 0, 0.3], industrial: [0.85, 0.35, 3, 0.65],
        port: [0.9, 0.55, 3, 0.7], park: [0.4, 0.1, 2, 0.3], forest: [0.75, 0.05, 3, 0.6], beach: [0.25, 0, 2, 0.35], plaza: [0.35, 0.3, 2, 0.25],
        resort: [0.2, 0.05, 2, 0.15], favela: [0.95, 0.12, 3, 0.85], lagoa: [0.15, 0, 2, 0.12], zonasul: [0.2, 0.04, 2, 0.15],
    },
    DEF: [0.6, 0.1, 0, 0.4],

    build() {
        if (!this.on || typeof CityGrid === 'undefined') return null;
        const t0 = performance.now(), W = Config.world, N = this.N, sx = (W.maxX - W.minX) / N, sz = (W.maxZ - W.minZ) / N;
        const val = new Array(N * N).fill(null);
        const H = (x, z, s) => { let h = (Math.round(x) * 73856093) ^ (Math.round(z) * 19349663) ^ (s * 83492791); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
        const noise = (x, z, s) => {                                            // ruído de valor (para as manchas de idade e do paralelepípedo)
            const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
            const a = H(i, j, s), b = H(i + 1, j, s), c = H(i, j + 1, s), d = H(i + 1, j + 1, s);
            return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
        };
        // 1) os texels dentro de uma quadra: o bairro dela
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
            const x = W.minX + (i + 0.5) * sx, z = W.minZ + (j + 0.5) * sz, b = CityGrid._blockAtPoint(x, z);
            if (b) val[j * N + i] = this.DISTRICT[b.district] || this.DEF;
        }
        // 2) as ruas entre as quadras: o bairro do vizinho (espalha alguns passos)
        for (let pass = 0; pass < 4; pass++) {
            const next = val.slice();
            for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
                if (val[j * N + i]) continue;
                for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
                    const a = i + di, b = j + dj;
                    if (a >= 0 && b >= 0 && a < N && b < N && val[b * N + a]) { next[j * N + i] = val[b * N + a]; break; }
                }
            }
            for (let k = 0; k < val.length; k++) val[k] = next[k];
        }
        // 3) os números, com o ruído: a idade varia em manchas (o trecho recapeado ao lado do esburacado), o paralelepípedo em zonas
        const D = new Uint8Array(N * N * 4);
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
            const v = val[j * N + i] || this.DEF, k = (j * N + i) * 4;
            const age = Math.max(0, Math.min(1, v[0] + (noise(i / 6, j / 6, 11) - 0.5) * 0.7 + (noise(i / 2, j / 2, 12) - 0.5) * 0.25));
            const cob = noise(i / 5, j / 5, 13) > 1 - v[1] * 1.15 ? 1 : 0;
            let side = v[2];
            const hs = H(i >> 2, j >> 2, 14);                                      // (a calçada muda de quadra em quadra: ~40 u)
            if (hs < 0.3) side = (side + 1 + Math.floor(H(i >> 2, j >> 2, 15) * 3)) % 4;
            D[k] = Math.round(age * 255); D[k + 1] = cob * 255; D[k + 2] = Math.round((side + 0.5) / 4 * 255);
            D[k + 3] = Math.round(Math.max(0, Math.min(1, v[3] + (noise(i / 3, j / 3, 16) - 0.5) * 0.5)) * 255);
        }
        // (o paralelepípedo com a borda macia: um passo de média no G)
        const G = new Uint8Array(N * N);
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
            let s = 0, n = 0;
            for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < N && b < N) { s += D[(b * N + a) * 4 + 1]; n++; } }
            G[j * N + i] = s / n;
        }
        for (let k = 0; k < N * N; k++) D[k * 4 + 1] = G[k];
        this._data = D;
        const sc = BABYLON.Engine.LastCreatedScene;
        const tex = this.tex = new BABYLON.RawTexture(D, N, N, BABYLON.Constants.TEXTUREFORMAT_RGBA, sc, false, false, BABYLON.Texture.BILINEAR_SAMPLINGMODE);
        tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        tex.name = 'groundZones';
        this.P = [W.minX, W.minZ, 1 / (W.maxX - W.minX), 1 / (W.maxZ - W.minZ)];
        console.log(`[CHÃO] mapa de zonas ${N}×${N} em ${Math.round(performance.now() - t0)} ms`);
        return tex;
    },
    // a zona num ponto do mundo (para os testes): { age, cobble, side (0..3), dirt }
    zoneAt(x, z) {
        const D = this._data, W = Config.world, N = this.N;
        if (!D) return null;
        const i = Math.max(0, Math.min(N - 1, Math.floor((x - W.minX) / (W.maxX - W.minX) * N))), j = Math.max(0, Math.min(N - 1, Math.floor((z - W.minZ) / (W.maxZ - W.minZ) * N))), k = (j * N + i) * 4;
        return { age: D[k] / 255, cobble: D[k + 1] / 255, side: Math.floor(D[k + 2] / 255 * 4), dirt: D[k + 3] / 255 };
    },

    apply(m, kind) {
        if (!this.on || !m) return m;
        if (!this.tex) this.build();
        if (!this.tex) return m;
        if (!this._cls) this._cls = this._plugin();
        new this._cls(m, this.KIND[kind] || 0);
        return m;
    },

    _plugin() {
        const GV = this;
        return class GroundVarietyPlugin extends BABYLON.MaterialPluginBase {
            constructor(m, kind) { super(m, 'GroundVariety', 128, { GROUNDVAR: false, GVKIND: 0 }); this.kind = kind; this._enable(true); }
            getClassName() { return 'GroundVarietyPlugin'; }
            prepareDefines(d) { d.GROUNDVAR = !GroundVariety._lite; d.GVKIND = this.kind; }      // (cada tipo de chão compila só o seu desenho; _lite: medir sem o código)
            getSamplers(s) { s.push('gvTex'); }
            getUniforms() { return { ubo: [{ name: 'gvP', size: 4, type: 'vec4' }, { name: 'gvK', size: 4, type: 'vec4' }], fragment: 'uniform vec4 gvP;\nuniform vec4 gvK;' }; }
            bindForSubMesh(ub) {
                const P = GV.P;
                ub.updateFloat4('gvP', P[0], P[1], P[2], P[3]);
                ub.updateFloat4('gvK', this.kind, GV.shade, 0, 0);
                ub.setTexture('gvTex', GV.tex);
            }
            getCustomCode(type) {
                if (type !== 'fragment') return null;
                return { CUSTOM_FRAGMENT_DEFINITIONS: GroundVariety.GLSL_DEFS, CUSTOM_FRAGMENT_BEFORE_LIGHTS: GroundVariety.GLSL_MAIN };
            }
        };
    },
    shade: 1,
};

// (sem ponto e vírgula em comentário GLSL: o Babylon corta a linha ali — os comentários ficam fora das strings)
GroundVariety.GLSL_DEFS = `
#ifdef GROUNDVAR
uniform sampler2D gvTex;
float gvh(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float gvn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(gvh(i), gvh(i + vec2(1.0, 0.0)), f.x), mix(gvh(i + vec2(0.0, 1.0)), gvh(i + vec2(1.0, 1.0)), f.x), f.y); }
float gvdet(float size, float fw) { return 1.0 - smoothstep(size * 0.1, size * 0.45, fw); }
#endif`;

GroundVariety.GLSL_MAIN = `
#ifdef GROUNDVAR
if (gvK.y > 0.5 && normalW.y > 0.6) {
    vec2 W = vPositionW.xz;
    vec4 Z = texture2D(gvTex, (W - gvP.xy) * gvP.zw);
    #ifdef WEBGL2
    float fw = max(length(fwidth(W)), 0.0005);
    #else
    float fw = 0.03;
    #endif
    float kind = gvK.x;
    vec3 c = baseColor.rgb;
    float lum = dot(c, vec3(0.3, 0.59, 0.11));
    float big = gvn(W * 0.11);
    if (kind < 1.5) {
#if GVKIND == 1
        float age = Z.r, mark = smoothstep(0.5, 0.66, lum);
        vec3 gray = vec3(lum) * vec3(1.02, 1.01, 0.98);
        vec3 aged = mix(c * vec3(0.74, 0.76, 0.8), mix(c, gray * 1.22 + 0.04, 0.5), age);
        c = mix(aged, c, mark);
        vec2 cell = floor(W / 7.0);
        float hp = gvh(cell + 0.5);
        if (hp < 0.1 + 0.32 * age) {
            vec2 cc = (cell + 0.25 + 0.5 * vec2(gvh(cell + 1.3), gvh(cell + 2.7))) * 7.0;
            vec2 hs = vec2(0.6 + 1.9 * gvh(cell + 3.1), 0.5 + 1.4 * gvh(cell + 4.7));
            vec2 dd = abs(W - cc) - hs;
            float e = max(dd.x, dd.y), inP = 1.0 - smoothstep(-0.01, 0.01, e);
            vec3 pc = hp < 0.06 + 0.12 * age ? c * 0.62 + vec3(0.0, 0.0, 0.01) : mix(c, vec3(0.6, 0.59, 0.56), 0.6);
            c = mix(c, pc, inP * (1.0 - mark));
            c *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.05, abs(e))) * gvdet(0.06, fw);
        }
        float cr = abs(gvn(W * 0.8 + 3.0) - 0.5);
        c *= 1.0 - 0.38 * (1.0 - smoothstep(0.0, 0.018 + 0.02 * smoothstep(0.55, 0.75, big), cr)) * smoothstep(0.55, 0.9, age) * gvdet(0.04, fw);
        c *= 1.0 + (gvh(floor(W * 28.0)) - 0.5) * 0.22 * age * gvdet(0.03, fw);
        c = mix(c, c * vec3(0.82, 0.78, 0.72), smoothstep(0.6, 0.85, big) * Z.a * 0.5);
        if (Z.g > 0.02) {
            float row = floor(W.y / 0.12), x = W.x / 0.21 + 0.5 * mod(row, 2.0);
            vec2 sc = vec2(floor(x), row), f = vec2(fract(x) * 0.21, fract(W.y / 0.12) * 0.12);
            float e = min(min(f.x, 0.21 - f.x), min(f.y, 0.12 - f.y)), hs = gvh(sc);
            vec3 cb = vec3(0.47, 0.46, 0.44) * (0.78 + 0.4 * hs) * (0.88 + 0.16 * smoothstep(0.0, 0.12, f.y));
            cb = mix(cb, vec3(0.42, 0.4, 0.33), smoothstep(0.7, 0.9, big) * 0.4);
            cb = mix(cb, vec3(0.18, 0.17, 0.15), (1.0 - smoothstep(0.006, 0.02, e)) * gvdet(0.1, fw));
            cb = mix(vec3(0.42, 0.41, 0.39), cb, gvdet(0.12, fw));
            c = mix(c, cb, smoothstep(0.35, 0.65, Z.g) * (1.0 - mark * 0.6));
        }
#endif
    } else if (kind < 2.5) {
#if GVKIND == 2
        float side = floor(Z.b * 4.0), dt = gvdet(0.15, fw);
        if (side > 0.5 && side < 1.5) {
            vec2 r = vec2(1.0, 1.7320508), p = W / 0.18;
            vec2 a = mod(p, r) - r * 0.5, b = mod(p - r * 0.5, r) - r * 0.5;
            vec2 g = dot(a, a) < dot(b, b) ? a : b;
            vec2 id = p - g;
            float hx = max(abs(g.x) * 0.866 + abs(g.y) * 0.5, abs(g.y));
            vec3 tc = gvh(id) < 0.5 ? vec3(0.62, 0.3, 0.24) : vec3(0.58, 0.57, 0.54);
            tc *= 0.88 + 0.2 * gvh(id * 1.7);
            tc = mix(tc, vec3(0.32, 0.31, 0.3), smoothstep(0.43, 0.48, hx));
            c = mix(mix(c, vec3(0.6, 0.45, 0.4), 0.5), tc, dt);
        } else if (side > 1.5 && side < 2.5) {
            float wv = sin(W.x * 0.9 + sin(W.y * 0.45) * 2.2) + sin(W.y * 0.6) * 0.2;
            float bw = smoothstep(-0.05, 0.05, wv);
            vec2 st = floor(W / 0.06);
            float hs = gvh(st);
            vec3 stone = mix(vec3(0.16, 0.16, 0.17), vec3(0.88, 0.87, 0.83), bw) * (0.86 + 0.24 * hs);
            float jn = 1.0 - smoothstep(0.0, 0.12, min(min(fract(W.x / 0.06), 1.0 - fract(W.x / 0.06)), min(fract(W.y / 0.06), 1.0 - fract(W.y / 0.06))));
            stone = mix(stone, vec3(0.45, 0.43, 0.4), jn * 0.5 * gvdet(0.06, fw));
            c = mix(mix(c, vec3(0.55), 0.6), stone, gvdet(0.5, fw) * 0.9 + 0.1);
        } else if (side > 2.5) {
            float br = smoothstep(0.55, 0.7, gvn(W * 0.9 + 5.0) * 0.7 + Z.a * 0.4);
            c *= 0.9 + 0.16 * gvn(W * 1.5);
            vec3 dirt = vec3(0.45, 0.37, 0.28) * (0.8 + 0.3 * gvn(W * 6.0));
            c = mix(c, dirt, br * 0.85);
            float cr = abs(gvn(W * 1.6 + 9.0) - 0.5);
            c *= 1.0 - 0.45 * (1.0 - smoothstep(0.0, 0.02, cr)) * gvdet(0.04, fw);
            c = mix(c, vec3(0.24, 0.34, 0.15), (1.0 - smoothstep(0.0, 0.012, cr)) * smoothstep(0.4, 0.7, Z.a) * 0.6 * gvdet(0.04, fw));
        } else {
            c *= 0.92 + 0.12 * gvh(floor(W / 1.0) + 0.5);
            c = mix(c, c * vec3(0.78, 0.76, 0.72), smoothstep(0.62, 0.85, big) * (0.3 + Z.a * 0.5));
        }
        c = mix(c, c * vec3(0.8, 0.76, 0.7), smoothstep(0.66, 0.9, big) * Z.a * 0.6);
#endif
    } else if (kind < 3.5) {
#if GVKIND == 3
        c *= 0.92 + 0.14 * gvn(W * 0.3);
        c = mix(c, c * vec3(0.8, 0.78, 0.74), smoothstep(0.65, 0.88, big) * (0.25 + Z.a * 0.4));
#endif
    } else if (kind < 4.5) {
#if GVKIND == 4
        float wet = smoothstep(0.6, 0.85, big);
        c = mix(c, c * vec3(0.66, 0.62, 0.58), wet * 0.6);
        float gr = gvh(floor(W * 22.0)), dg = gvdet(0.04, fw);
        c = mix(c, mix(vec3(0.55, 0.54, 0.52), vec3(0.35, 0.33, 0.3), gvh(floor(W * 22.0) + 3.0)), step(0.9, gr) * dg * (0.4 + Z.a * 0.5));
        vec2 sp = fract(W / 0.7) - 0.5, si = floor(W / 0.7);
        float hs = gvh(si);
        if (hs > 0.82) c = mix(c, vec3(0.5, 0.48, 0.45) * (0.8 + 0.4 * gvh(si + 2.0)), (1.0 - smoothstep(0.06, 0.09, length(sp - (vec2(gvh(si + 4.0), gvh(si + 5.0)) - 0.5) * 0.6))) * gvdet(0.08, fw));
        c *= 0.9 + 0.18 * gvn(W * 3.0);
#endif
    } else if (kind < 5.5) {
#if GVKIND == 5
        vec2 sl = fract(W / 2.0), si = floor(W / 2.0);
        float j = 1.0 - smoothstep(0.0, 0.012, min(min(sl.x, 1.0 - sl.x), min(sl.y, 1.0 - sl.y)) * 2.0);
        c *= 0.92 + 0.12 * gvh(si);
        c *= 1.0 - 0.3 * j * gvdet(0.04, fw);
        float cr = abs(gvn(W * 1.2 + 4.0) - 0.5);
        c *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.015, cr)) * smoothstep(0.5, 0.8, big) * gvdet(0.04, fw);
        c = mix(c, c * vec3(0.74, 0.72, 0.68), smoothstep(0.62, 0.88, big) * (0.3 + Z.a * 0.5));
#endif
    } else if (kind < 6.5) {
#if GVKIND == 6
        float rp = sin(W.x * 4.2 + W.y * 1.3 + gvn(W * 0.5) * 6.0);
        c *= 1.0 + 0.05 * rp * gvdet(0.4, fw);
        c *= 0.94 + 0.1 * gvn(W * 0.6);
        c = mix(c, c * vec3(0.86, 0.84, 0.8), smoothstep(0.7, 0.9, big) * 0.5);
#endif
    } else {
#if GVKIND == 7
        float dry = smoothstep(0.62, 0.82, big);
        c = mix(c, c * vec3(1.18, 1.08, 0.72), dry * 0.45);
        c *= 0.9 + 0.16 * gvn(W * 1.3);
#endif
    }
    baseColor.rgb = c;
}
#endif`;
