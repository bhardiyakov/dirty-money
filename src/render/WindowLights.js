// ============================================================================
// WindowLights — as JANELAS ACESAS à noite (fachadas dos prédios e casas, vitrines e letreiros das lojas).
//
// Plugin de material do Babylon (StandardMaterial), como o RevealPlugin: o uniform é reenviado a cada desenho, então funciona com os
// materiais do mundo CONGELADOS (Game._freezeStaticMaterials). Antes a luz era o emissiveTexture do material com o `level` mudando
// à noite — e com o material congelado o Babylon não reenviava o nível: as janelas nunca acendiam.
//
// O ladrilho de luz (art/CityHDFacades.js) tem TODAS as janelas acesas; o shader decide, janela por janela, qual está acesa agora:
//   • cada janela ocupa sozinha uma célula da grade do estilo (GRID: colunas × andares no ladrilho); a célula da UV da parede
//     (WorldBuilder: cada prédio e cada lado têm um deslocamento inteiro nas UVs) vira um sorteio próprio — nenhum prédio repete o
//     vizinho;
//   • a fração acesa segue a hora: casas acendem ao escurecer e vão apagando madrugada adentro (alguns acordam cedo); escritórios
//     e galpões ficam acesos no fim do expediente e esvaziam à noite;
//   • cada janela tem a sua luz (quente, neutra ou fria) e algumas, a TV ligada (azul, piscando).
// Lojas (grade 0): letreiro e vitrine sempre acesos à noite.
// ============================================================================

const WindowLights = {
    // nível (0 de dia .. 1 noite fechada), fração acesa das casas, relógio (s), fração acesa dos escritórios
    state: new Float32Array([0, 0, 0, 0]),
    // [hora, fração das janelas acesas], interpolados.
    HOME: [[0, 0.34], [1.5, 0.22], [4, 0.12], [5.2, 0.24], [6.5, 0.3], [8, 0.15], [16.5, 0.22], [18.2, 0.5], [19.5, 0.7], [22, 0.64], [23.3, 0.48], [24, 0.34]],
    OFFICE: [[0, 0.1], [5.5, 0.08], [7, 0.35], [9, 0.6], [17.5, 0.78], [19, 0.62], [20.5, 0.4], [22.5, 0.18], [24, 0.1]],

    frac(K, h) {
        let i = 0;
        while (i < K.length - 2 && h > K[i + 1][0]) i++;
        const [h0, a] = K[i], [h1, b] = K[i + 1], t = Math.max(0, Math.min(1, (h - h0) / (h1 - h0)));
        return a + (b - a) * t;
    },
    // DayNight.apply (todo quadro): escuridão (0..1) e hora.
    update(night, hour) {
        const s = this.state, k = Math.max(0, Math.min(1, (night - 0.12) / 0.7));
        s[0] = k * k * (3 - 2 * k);
        s[1] = this.frac(this.HOME, hour);
        s[2] = (performance.now() / 1000) % 600;
        s[3] = this.frac(this.OFFICE, hour);
    },

    // Liga a luz num material: `tex` = ladrilho de luz, `grid` = [colunas, andares] ([0, 0]: tudo aceso), `occ` = 'home' | 'office' | 'shop'.
    apply(material, tex, grid = [0, 0], occ = 'home') {
        if (!this._cls) this._cls = this._makeClass();
        const g = new Float32Array([grid[0], grid[1], occ === 'office' ? 1 : 0, occ === 'office' ? 0.78 : 1]);
        return new this._cls(material, tex, g);
    },

    _makeClass() {
        const S = this;
        return class WindowLightsPlugin extends BABYLON.MaterialPluginBase {
            constructor(material, tex, grid) {
                super(material, 'WindowLights', 250, { WINLIGHTS: false });
                this.tex = tex; this.grid = grid;
                this._enable(true);
            }
            getClassName() { return 'WindowLightsPlugin'; }
            prepareDefines(defines) { defines.WINLIGHTS = true; }
            getSamplers(samplers) { samplers.push('winSampler'); }
            getUniforms() {
                return { ubo: [{ name: 'winP', size: 4, type: 'vec4' }, { name: 'winG', size: 4, type: 'vec4' }], fragment: 'uniform vec4 winP;\nuniform vec4 winG;' };
            }
            bindForSubMesh(ub) {
                const s = S.state, g = this.grid;
                ub.updateFloat4('winP', s[0], s[1], s[2], s[3]);
                ub.updateFloat4('winG', g[0], g[1], g[2], g[3]);
                ub.setTexture('winSampler', this.tex);
            }
            getCustomCode(shaderType) {
                if (shaderType !== 'fragment') return null;
                // (sem ponto e vírgula em comentário GLSL: o Babylon corta a linha ali)
                return {
                    CUSTOM_FRAGMENT_DEFINITIONS: `
                        #ifdef WINLIGHTS
                        uniform sampler2D winSampler;
                        float wlHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
                        #endif`,
                    CUSTOM_FRAGMENT_BEFORE_FOG: `
                        #if defined(WINLIGHTS) && defined(DIFFUSE)
                        if (winP.x > 0.002) {
                            vec3 wl = texture2D(winSampler, vDiffuseUV).rgb;
                            if (winG.x > 0.5) {
                                vec2 wc = floor(vDiffuseUV * winG.xy);
                                float h1 = wlHash(wc), h2 = wlHash(wc + vec2(17.31, 5.17));
                                wl *= step(h1, winG.z > 0.5 ? winP.w : winP.y);
                                vec3 tint = h2 < 0.5 ? vec3(1.0) : (h2 < 0.76 ? vec3(0.84, 0.93, 1.12) : vec3(1.1, 0.86, 0.64));
                                if (h2 > 0.93 && winG.z < 0.5) tint = vec3(0.42, 0.62, 1.25) * (0.72 + 0.28 * sin(winP.z * 7.0 + h1 * 60.0) * sin(winP.z * 2.3 + h2 * 90.0));
                                wl *= tint * (0.72 + 0.45 * fract(h1 * 13.7));
                            }
                            color.rgb += wl * winP.x * winG.w;
                        }
                        #endif`,
                };
            }
        };
    },
};
