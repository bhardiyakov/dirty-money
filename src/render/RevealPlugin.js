// ============================================================================
// RevealPlugin — "círculo de visibilidade": estruturas que ficam ACIMA do jogador/veículo (viaduto,
// teto de túnel, cobertura de posto) ganham um furo pontilhado (dither 2×2 em pixels internos, como o fade das copas)
// em volta do alvo, para ele nunca sumir debaixo delas.
//
// Plugin de material do Babylon (StandardMaterial): injeta um `discard` no começo do fragment shader.
//   Reveal.state = [x, z, raio, y do alvo]  (o jogo atualiza todo frame: WorldBuilder.setReveal)
// Só pontilha o que está ACIMA do alvo (y do fragmento > y do alvo + folga): quem anda EM CIMA da ponte/viaduto não vê furo
// no chão dele. O furo é um círculo no plano XZ do mundo (a câmera é vertical, então é um círculo na tela).
// ============================================================================

const Reveal = {
    state: new Float32Array([0, 0, 0, 0]),      // x, z, raio (0 = desligado), y do alvo

    set(x, z, r, y) { const s = this.state; s[0] = x; s[1] = z; s[2] = r; s[3] = y; },

    // Liga o furo num material (retorna o material, para encadear).
    apply(material) {
        if (!Reveal._cls) Reveal._cls = Reveal._makeClass();
        new Reveal._cls(material);
        return material;
    },

    _makeClass() {
        return class RevealPlugin extends BABYLON.MaterialPluginBase {
            constructor(material) {
                super(material, 'Reveal', 300, { REVEAL: false });
                this._enable(true);
            }
            getClassName() { return 'RevealPlugin'; }
            prepareDefines(defines) { defines.REVEAL = true; }
            getUniforms() {
                return { ubo: [{ name: 'revealP', size: 4, type: 'vec4' }], fragment: 'uniform vec4 revealP;' };
            }
            bindForSubMesh(ub) { const s = Reveal.state; ub.updateFloat4('revealP', s[0], s[1], s[2], s[3], 'revealP'); }
            getCustomCode(shaderType) {
                if (shaderType !== 'fragment') return null;
                // Furo PONTILHADO (dither 2×2 de Bayer nos pixels internos, como o fade das copas): vazio no centro, cheio na borda,
                // com a mesma transição suave de antes. Cada pixel ou é desenhado inteiro (cobre e grava profundidade) ou é descartado
                // (mostra o que está embaixo). O furo com alfa em degradê não servia: a estrutura desenha antes dos carros e grava
                // profundidade (ver WorldBuilder._flush), e no anel semitransparente ela escondia o carro que passava por baixo.
                return {
                    CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
                        #ifdef REVEAL
                        if (revealP.z > 0.0 && vPositionW.y > revealP.w + 0.06) {
                            float rk = length(vPositionW.xz - revealP.xy) / revealP.z;
                            float ra = smoothstep(0.2, 1.0, rk);
                            vec2 q = mod(floor(gl_FragCoord.xy), 2.0);
                            float th = (mod(q.x * 2.0 + q.y * 3.0, 4.0) + 0.5) / 4.0;     // Bayer 2×2: 0,2 / 3,1
                            if (ra < th) discard;
                        }
                        color.a = 1.0;                                   // (ignora o alfa da textura: estas peças são opacas fora do furo)
                        #endif`,
                };
            }
        };
    },
};
