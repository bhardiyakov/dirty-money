// ============================================================================
// WaterPlugin — a orla: a passagem do mar para a areia em DEGRADÊ, com a quebra da onda subindo e descendo na areia.
//
// O mar continua em pixel art (TileFactory.water, 4 quadros). Antes a orla era uma faixa de espuma por célula costeira, com alfa
// pontilhado, e a beira da areia era a RETA das células de 4 u. Agora:
//   • Water.field: distância COM SINAL até a linha d'água em todo o mapa (+ mar, − terra; 1 texel = 2 u, lida com filtro bilinear,
//     então a costa em escada de células vira uma curva suave);
//   • o mesmo cálculo roda em dois plugins de material (StandardMaterial: luz, sombra e noite continuam do Babylon):
//       sea  (o plano d'água)   raso turquesa em faixas que somem mar adentro e uma linha de onda que chega de fora;
//       land (areia, grama e chão do terreno)   a lâmina d'água TRANSLÚCIDA que sobe e desce por cima do chão, com a espuma na ponta
//            e a areia molhada (mais escura) atrás;
//     dos dois lados a cor é a mesma função da distância, então onde as malhas se encontram (a escada) não aparece emenda;
//   • a espuma fica na grade de pixels do mundo (20 px/u), em pixel art. o degradê do raso (turquesa até o azul, e a lâmina d'água na areia)
//     é suave e sem faixas, calculado fora da grade.
// O tempo vem de uma textura de 5 px (Water.clock, Water.tick a cada quadro): os materiais do mundo são congelados
// (Game._freezeStaticMaterials) e um uniforme poderia não ser reenviado; o conteúdo de uma textura sempre vale.
//   px 0: as fases da orla · px 1–4: a fase de cada ondulação do mar aberto (16 bits) e, no px 1, a força do mar (Waves).
// Mar aberto (o plano d'água longe da beira): as ondulações de Waves — a mesma conta da física — clareiam a face das cristas virada
// para o sol e escurecem os cavados, andando; com mar agitado, carneirinhos (espuma no alto das cristas).
// ============================================================================

const Water = {
    field: null,
    clock: null,
    _fieldK: null,                       // [minX, minZ, 1/largura, 1/altura]: u → coordenada da textura do campo
    RANGE: 8,                            // o campo guarda −8…+8 u

    init(scene) {
        this._makeField(scene);
        this.clock = BABYLON.RawTexture.CreateRGBATexture(new Uint8Array(20), 5, 1, scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
        this._clk = new Uint8Array(20);
    },
    sea(material) { return this._apply(material, 'sea'); },
    land(material) { return this._apply(material, 'land'); },
    _apply(material, mode) {
        if (!this.field) return material;
        if (!Water._cls) Water._cls = Water._makeClass();
        new Water._cls(material, mode);
        return material;
    },

    // Fases das ondas (0–1, uma volta = 1): R = a água subindo/descendo na areia (7,4 s), G = a linha de onda que chega (14 s);
    // px 1–4: as ondulações do mar aberto (Waves: fase em 16 bits, R alto, G baixo) e, no px 1, B = a força do mar (M / 2,5).
    tick(t) {
        if (!this.clock) return;
        const c = this._clk;
        c[0] = Math.floor((t / 7.4 % 1) * 256) & 255; c[1] = Math.floor((t / 14 % 1) * 256) & 255;
        if (typeof Waves !== 'undefined') {
            Waves.setTime(t);
            for (let i = 0; i < 4; i++) { const v = Math.floor(Waves.phase(i) * 65536) & 65535, o = (i + 1) * 4; c[o] = v >> 8; c[o + 1] = v & 255; }
            c[6] = Math.max(0, Math.min(255, Math.round(Waves.M / 2.5 * 255)));
        }
        this.clock.update(c);
    },

    // Distância com sinal até a linha d'água, por texel de 2 u, a partir das células do WorldMap (tudo que não é mar é terra:
    // continente, ilhas, cidade). Chanfro 1/√2 em 2 passadas, para o mar e para a terra.
    _makeField(scene) {
        const M = WorldMap, W = Config.world, B = M.B, S = 2, c = W.cell / S, nx = M.nx * S, nz = M.nz * S, N = nx * nz, R2 = Math.SQRT2, BIG = 1e6;
        const isSea = new Uint8Array(N);
        for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) isSea[j * nx + i] = M.biome[(j / S | 0) * M.nx + (i / S | 0)] === B.SEA ? 1 : 0;
        const dist = (target) => {                  // distância (texels) até o texel mais perto que NÃO é `target`
            const D = new Float32Array(N);
            for (let k = 0; k < N; k++) D[k] = isSea[k] === target ? BIG : 0;
            for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
                const k = j * nx + i; let d = D[k];
                if (!d) continue;
                if (i > 0) d = Math.min(d, D[k - 1] + 1);
                if (j > 0) { d = Math.min(d, D[k - nx] + 1); if (i > 0) d = Math.min(d, D[k - nx - 1] + R2); if (i < nx - 1) d = Math.min(d, D[k - nx + 1] + R2); }
                D[k] = d;
            }
            for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
                const k = j * nx + i; let d = D[k];
                if (!d) continue;
                if (i < nx - 1) d = Math.min(d, D[k + 1] + 1);
                if (j < nz - 1) { d = Math.min(d, D[k + nx] + 1); if (i < nx - 1) d = Math.min(d, D[k + nx + 1] + R2); if (i > 0) d = Math.min(d, D[k + nx - 1] + R2); }
                D[k] = d;
            }
            return D;
        };
        const DS = dist(1), DL = dist(0), data = new Uint8Array(N), R = this.RANGE;
        for (let k = 0; k < N; k++) {
            const s = isSea[k] ? (DS[k] - 0.5) * c : -(DL[k] - 0.5) * c;          // do centro do texel até a borda (a linha d'água)
            data[k] = Math.round((Math.max(-R, Math.min(R, s)) / R * 0.5 + 0.5) * 255);
        }
        const tex = BABYLON.RawTexture.CreateLuminanceTexture(data, nx, nz, scene, false, false, BABYLON.Texture.BILINEAR_SAMPLINGMODE);
        tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        this._fieldK = [W.minX, W.minZ, 1 / (nx * c), 1 / (nz * c)];
        return (this.field = tex);
    },

    // ------------------------------------------------------------------ shader
    _makeClass() {
        const K = this._fieldK.map((v) => v.toFixed(9)), R = this.RANGE.toFixed(1);
        // ondulações de Waves (constantes no shader; a fase de cada uma vem do relógio): h normalizado (soma das amplitudes = 1) e a
        // inclinação normalizada (soma de A·k = 1)
        const WC = Waves._init(), f = (v) => v.toFixed(6);
        const swellTerms = WC.map((c, i) => `
                {   vec4 t = texture2D(shoreClock, vec2(${f((i + 1.5) / 5)}, 0.5));
                    float th = dot(p, vec2(${f(c.k * c.dx)}, ${f(c.k * c.dz)})) - (t.r * 65280.0 + t.g * 255.0) / 65536.0 * 6.2831853 + ${f(c.ph)};
                    float co = cos(th);
                    r.x += ${f(c.A / Waves.sumA)} * sin(th); r.y += ${f(c.A * c.k * c.dx / Waves.sumAk)} * co; r.z += ${f(c.A * c.k * c.dz / Waves.sumAk)} * co; }`).join('');
        // Cor da orla. q = ponto na grade de pixels; s = distância com sinal (+ mar); sea/ground = cor do mar e do chão nesse ponto.
        const GLSL = `
            uniform sampler2D shoreField;
            uniform sampler2D shoreClock;
            float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float wNoise(vec2 p) {
                vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
                return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y);
            }
            // limiar: degrau duro (pixel art) ou, no gráfico suave (wSmooth), uma transição de largura w (~1–2 px da tela)
            float wStep(float e, float x, float w) { return wSmooth > 0.5 ? smoothstep(e - w, e + w, x) : step(e, x); }
            // mar aberto: (altura, inclinação x, inclinação z), normalizados, no ponto p — a mesma soma de Waves.sample
            vec3 swell(vec2 p) {
                vec3 r = vec3(0.0);${swellTerms}
                return r;
            }
            // cristas e cavados passando (luz do sol na face virada para ele) e, com mar agitado, carneirinhos: riscos de espuma no alto
            // das cristas, compridos ao longo delas, que andam junto com a ondulação maior (miolo cheio, franja salpicada)
            vec3 swellColor(vec3 col, vec2 q, float sw) {
                vec4 c1 = texture2D(shoreClock, vec2(0.3, 0.5));
                float M = c1.b * 2.5;
                vec3 r = swell(q);
                float lit = dot(r.yz, vec2(0.8, -0.6));                                          // (o sol vem do noroeste: Config.light.sunDir)
                float sh = (lit * 0.24 + r.x * 0.09) * sw * min(1.3, 0.6 + M * 0.35);
                if (wSmooth < 0.5) sh = floor(sh * 16.0 + 0.5) / 16.0;                            // pixel art: em degraus
                col *= 1.0 + sh;
                float cap = smoothstep(0.64, 0.9, r.x) * smoothstep(1.0, 1.9, M) * sw;
                if (cap <= 0.0) return col;
                vec2 adv = vec2(${f(WC[0].dx)}, ${f(WC[0].dz)}) * ((c1.r * 65280.0 + c1.g * 255.0) / 65536.0 * ${f(Waves.COMP[0].L)});   // (andam com a ondulação 1)
                vec2 d0 = vec2(${f(WC[0].dx)}, ${f(WC[0].dz)}), q2 = q - adv;
                float patchN = wNoise(vec2(dot(q2, d0) * 1.5, dot(q2, vec2(-d0.y, d0.x)) * 0.3));   // (fino na direção da onda, comprido ao longo da crista)
                float speck = wSmooth > 0.5 ? wNoise(q * 6.0) : wHash(floor(q * 20.0));
                float on = wStep(0.8 - cap * 0.32, patchN, 0.03) * (0.6 + 0.4 * wStep(0.3, speck, 0.05));
                return mix(col, vec3(0.92, 0.97, 0.98), cap * on * 0.9);
            }
            float shoreDist(vec2 q) { return (texture2D(shoreField, (q - vec2(${K[0]}, ${K[1]})) * vec2(${K[2]}, ${K[3]})).r - 0.5) * 2.0 * ${R}; }
            // s = distância na grade de pixels (espuma, pixel art) | sb = distância sem grade (degradê suave, "borrado")
            vec3 shoreColor(vec3 sea, vec3 ground, vec2 q, float s, float sb) {
                vec4 clk = texture2D(shoreClock, vec2(0.1, 0.5));
                vec2 cell = floor(q * 20.0);
                float n = wNoise(q * 0.16), n2 = wSmooth > 0.5 ? wNoise(q * 9.0 + 3.1) : wHash(cell), n3 = wNoise(q * 0.9 + 31.0);     // (salpicado: sorteio por pixel ou ruído suave)
                vec3 shallow = vec3(0.373, 0.769, 0.753), mid = vec3(0.243, 0.624, 0.706), foamC = vec3(0.91, 0.965, 0.965);
                float lap = 0.5 + 0.5 * sin(clk.r * 6.2832 + n * 5.0);                            // a água sobe (1) e desce (0)
                float reach = 0.35 + 2.3 * lap + (n3 - 0.5) * 0.7;                                   // até onde ela chega na areia (u)
                float foam = 0.0;
                vec3 col;
                if (sb <= 0.0) {
                    float L = -s, Lb = -sb;
                    float wet = 1.0 - smoothstep(0.0, 4.2, Lb);                                      // areia molhada: até onde as ondas maiores vão
                    vec3 g = ground * (1.0 - 0.24 * wet * wet);
                    float a = 1.0 - smoothstep(reach * 0.05, reach * 1.1, Lb);                       // lâmina d'água: some (fica transparente) na ponta, em degradê suave
                    col = mix(g, shallow, min(1.0, a * 0.85 + 0.15 * (1.0 - smoothstep(0.0, 0.8, Lb))));    // (= o lado do mar em s = 0)
                    float fp = abs(L - reach * 0.88);                                               // espuma na ponta da onda: miolo cheio, franja salpicada
                    foam = max(1.0 - wStep(0.09, fp, 0.025), (1.0 - wStep(0.26, fp, 0.025)) * wStep(0.45, n2 + 0.2 * lap, 0.05));
                    foam = max(foam, wStep(0.86, n2, 0.04) * a * (1.0 - lap) * 0.9);                        // bolhas que ficam quando ela recua
                } else {
                    float k = 1.0 - smoothstep(-0.5, 8.0, sb - (n - 0.5) * 1.2); k = k * k * (3.0 - 2.0 * k);   // raso: some mar adentro em degradê suave (sem faixas)
                    vec3 sh = mix(shallow, mid, smoothstep(0.5, 4.5, sb));
                    col = mix(sea, sh, min(1.0, k * 0.85 + 0.15 * (1.0 - smoothstep(0.0, 0.8, sb))));
                    // linha de onda chegando: tracejada, mais fraca longe, e se desfaz ao chegar na beira
                    float wave = clk.g, wp = 5.5 - wave * 5.0;
                    float lp = abs(s - wp - (n3 - 0.5) * 0.8);
                    float on = smoothstep(0.35, 0.6, wNoise(q * vec2(0.45, 0.45) + vec2(wave * 3.0, 0.0)));
                    foam = (1.0 - wStep(0.16, lp, 0.025)) * on * wStep(0.35, n2, 0.05) * smoothstep(0.0, 0.15, wave) * (1.0 - smoothstep(0.75, 1.0, wave)) * 0.85;
                }
                return mix(col, foamC, clamp(foam, 0.0, 1.0));
            }`;
        return class WaterPlugin extends BABYLON.MaterialPluginBase {
            constructor(material, mode) {
                super(material, 'Water', 310, { SHORE_SEA: false, SHORE_LAND: false });
                this._mode = mode;
                this._enable(true);
            }
            getClassName() { return 'WaterPlugin'; }
            prepareDefines(defines) { defines.SHORE_SEA = this._mode === 'sea'; defines.SHORE_LAND = this._mode === 'land'; }
            getSamplers(samplers) { samplers.push('shoreField', 'shoreClock'); }
            getUniforms() { return { ubo: [{ name: 'wSmooth', size: 1, type: 'float' }], fragment: 'uniform float wSmooth;' }; }
            bindForSubMesh(ub) { ub.setTexture('shoreField', Water.field); ub.setTexture('shoreClock', Water.clock); ub.updateFloat('wSmooth', typeof Smooth !== 'undefined' && Smooth.on ? 1 : 0); }
            getCustomCode(shaderType) {
                if (shaderType !== 'fragment') return null;
                return {
                    CUSTOM_FRAGMENT_DEFINITIONS: `
                        #if defined(SHORE_SEA) || defined(SHORE_LAND)
                        ${GLSL}
                        #endif`,
                    CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
                        #if defined(SHORE_SEA) || defined(SHORE_LAND)
                        {
                            vec2 q = wSmooth > 0.5 ? vPositionW.xz : (floor(vPositionW.xz * 20.0) + 0.5) / 20.0;     // grade de pixels do mundo (pixel art)
                            float s = shoreDist(q), sb = shoreDist(vPositionW.xz);
                            #ifdef SHORE_SEA
                            float sw = smoothstep(0.8, 7.0, sb);                                  // (na beira a ondulação vira a orla)
                            if (sw > 0.0) baseColor.rgb = swellColor(baseColor.rgb, q, sw);
                            if (s < ${R} - 0.5) baseColor.rgb = shoreColor(baseColor.rgb, vec3(0.80, 0.70, 0.49), q, s, sb);
                            #else
                            if (s > -4.5 && vPositionW.y < 0.4) baseColor.rgb = shoreColor(vec3(0.17, 0.41, 0.54), baseColor.rgb, q, s, sb);
                            #endif
                        }
                        #endif`,
                };
            }
        };
    },
};
