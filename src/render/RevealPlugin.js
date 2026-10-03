// ============================================================================
// RevealPlugin — "círculo de visibilidade": estruturas que ficam ACIMA do jogador/veículo (viaduto, ponte sobre a água,
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
                // Furo MACIO (alfa em degradê, como as poças de luz dos faróis): transparente no centro, opaco na borda.
                return {
                    CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
                        #ifdef REVEAL
                        float ra = 1.0;                                  // (ignora o alfa da textura: estas peças são opacas fora do furo)
                        if (revealP.z > 0.0 && vPositionW.y > revealP.w + 0.06) {
                            float rk = length(vPositionW.xz - revealP.xy) / revealP.z;
                            ra = smoothstep(0.2, 1.0, rk);
                        }
                        color.a = ra;
                        #endif`,
                };
            }
        };
    },
};
