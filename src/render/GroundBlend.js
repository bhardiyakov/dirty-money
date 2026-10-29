// ============================================================================
// GroundBlend — as DIVISAS dos pisos em degradê: grama, areia e terra não terminam numa linha reta contra o asfalto, a calçada ou o mato.
//
// Ao longo de cada divisa (WorldBuilder._groundBlend) vai uma FAIXA com a textura de um dos lados, por cima do outro: opaca na divisa
// e sumindo para fora, com a borda recortada por ruído (2 escalas, no espaço do mundo — as faixas vizinhas casam). Exemplos:
//   • a areia da praia espalhada sobre o asfalto da orla; a grama do parque e do quintal avançando sobre o meio-fio e a calçada;
//   • por dentro dos gramados, uma faixa de terra batida gasta (o pisoteio da beirada), em manchas;
//   • nas estradas do interior, o acostamento de terra que se mistura ao mato (e a terra da estrada de chão espalhada nas margens).
// A franja escurece e puxa para a cor de terra (o solo aparecendo entre as folhas, a areia úmida).
//
// Plugin de material do Babylon (StandardMaterial): a malha tem cor por vértice com alfa (hasVertexAlpha) — o alfa é o degradê da faixa
// (1 na divisa → 0 na ponta) — e o plugin troca o alfa final pelo degradê entortado pelo ruído. Luz, sombra, noite e neblina são as do
// material de sempre (o mesmo ladrilho do chão).
// ============================================================================

const GroundBlend = {
    // o: { freq (ruído, ciclos por m), amp (quanto o ruído entorta a borda), soft (largura da transição), soil: [r, g, b, força] }
    apply(material, o = {}) {
        if (!this._cls) this._cls = this._makeClass();
        const P = new Float32Array([o.freq || 0.8, o.amp || 1.0, o.soft || 0.12, 0]);
        const s = o.soil || [0.75, 0.62, 0.48, 0.5], S = new Float32Array(s);
        new this._cls(material, P, S);
        return material;
    },

    _makeClass() {
        return class GroundBlendPlugin extends BABYLON.MaterialPluginBase {
            constructor(material, P, S) {
                super(material, 'GroundBlend', 260, { GBLEND: false });
                this.P = P; this.S = S;
                this._enable(true);
            }
            getClassName() { return 'GroundBlendPlugin'; }
            prepareDefines(defines) { defines.GBLEND = true; }
            getUniforms() {
                return { ubo: [{ name: 'gbP', size: 4, type: 'vec4' }, { name: 'gbS', size: 4, type: 'vec4' }], fragment: 'uniform vec4 gbP;\nuniform vec4 gbS;' };
            }
            bindForSubMesh(ub) { const P = this.P, S = this.S; ub.updateFloat4('gbP', P[0], P[1], P[2], P[3]); ub.updateFloat4('gbS', S[0], S[1], S[2], S[3]); }
            getCustomCode(shaderType) {
                if (shaderType !== 'fragment') return null;
                // (sem ponto e vírgula em comentário GLSL: o Babylon corta a linha ali)
                return {
                    CUSTOM_FRAGMENT_DEFINITIONS: `
                        #ifdef GBLEND
                        float gbH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
                        float gbN(vec2 p) {
                            vec2 i = floor(p), f = fract(p);
                            f = f * f * (3.0 - 2.0 * f);
                            return mix(mix(gbH(i), gbH(i + vec2(1.0, 0.0)), f.x), mix(gbH(i + vec2(0.0, 1.0)), gbH(i + vec2(1.0, 1.0)), f.x), f.y);
                        }
                        #endif`,
                    CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
                        #if defined(GBLEND) && defined(VERTEXALPHA)
                        {
                            vec2 gp = vPositionW.xz * gbP.x;
                            float gn = gbN(gp) * 0.55 + gbN(gp * 2.7 + 17.3) * 0.3 + gbN(gp * 8.1 + 5.1) * 0.15;
                            float ga = smoothstep(0.5 - gbP.z, 0.5 + gbP.z, vColor.a + (gn - 0.5) * gbP.y);
                            float rim = 1.0 - abs(2.0 * smoothstep(0.0, 0.85, ga) - 1.0);
                            color.rgb *= mix(vec3(1.0), gbS.rgb, rim * gbS.a);
                            color.a = ga;
                        }
                        #endif`,
                };
            }
        };
    },
};
