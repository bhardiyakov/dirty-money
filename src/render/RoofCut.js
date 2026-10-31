// ============================================================================
// RoofCut — "tirar o teto": a estrutura que fica EM CIMA do jogador (ou do veículo dele) — o trecho do viaduto, o vão da ponte, o túnel,
// a cobertura do posto — some inteira enquanto ele está embaixo, como o telhado de uma loja quando se entra nela, e volta quando ele
// sai (esmaece em ~0,2 s e volta em ~0,35 s). Antes era um furo pontilhado em volta dele: agora a peça sai inteira, com borda reta.
//
// Plugin de material do Babylon (StandardMaterial), como o WindowLights: o uniform vai a cada desenho, então funciona com os materiais
// do mundo congelados. Os construtores (WorldBuilder) registram as PEÇAS — `add(cut, act, y, under)`:
//   cut    [x0, z0, x1, z1] — o que é cortado (só nos materiais das estruturas: 'x…' e 'b…');
//   act    [x0, z0, x1, z1] ou { pts, r } (perto de uma polilinha) — onde o alvo a ativa;
//   y      o corte: some o que está acima desta altura (o tabuleiro e a viga, não o pé do pilar; as paredes do túnel até 1 m);
//   under  o alvo só está "embaixo" com a cabeça abaixo disto (quem anda EM CIMA do viaduto ou da ponte não corta nada).
// Até SLOTS peças cortadas ao mesmo tempo (as que estão sumindo têm a vez; as que voltam pegam o que sobrar).
// ============================================================================

const RoofCut = {
    SLOTS: 4,
    units: [],
    _live: new Set(),
    // 4 retângulos (x0, z0, x1, z1), as 4 alturas de corte e as 4 visibilidades (1 = inteira, 0 = sumiu)
    state: new Float32Array(24),

    reset() { this.units = []; this._live.clear(); this._clear(); },
    add(cut, act, y, under) { this.units.push({ c: cut, a: act, y, under, k: 1, on: false }); },

    _clear() { const s = this.state; for (let i = 0; i < 4; i++) { s.set([1e9, 1e9, -1e9, -1e9], i * 4); s[16 + i] = 1e9; s[20 + i] = 1; } },
    _in(a, x, z) {
        if (a.pts) {                                                   // perto da polilinha (túnel em curva)
            const P = a.pts, r2 = a.r * a.r;
            for (let i = 0; i + 1 < P.length; i++) {
                const ax = P[i][0], az = P[i][1], dx = P[i + 1][0] - ax, dz = P[i + 1][1] - az, l2 = dx * dx + dz * dz || 1;
                const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), ex = ax + dx * t - x, ez = az + dz * t - z;
                if (ex * ex + ez * ez <= r2) return true;
            }
            return false;
        }
        return x > a[0] && x < a[2] && z > a[1] && z < a[3];
    },

    // A cada quadro (Game): o alvo em (x, z), com a cabeça (ou o teto do veículo) na altura y.
    update(dt, x, z, y) {
        const L = this._live;
        for (const u of this.units) {
            u.on = y < u.under && this._in(u.a, x, z);
            if (u.on) L.add(u);
        }
        for (const u of L) {
            u.k = u.on ? Math.max(0, u.k - dt / 0.2) : Math.min(1, u.k + dt / 0.35);
            if (!u.on && u.k >= 1) L.delete(u);
        }
        const list = [...L].sort((a, b) => (b.on - a.on) || (a.k - b.k)), s = this.state;
        this._clear();
        list.forEach((u, i) => {
            if (i >= this.SLOTS) { if (!u.on) { u.k = 1; L.delete(u); } return; }       // sem vaga: a que voltava volta de vez
            s.set(u.c, i * 4); s[16 + i] = u.y; s[20 + i] = u.k;
        });
    },
    // Alguma peça cortada agora (testes, DevMode)?
    get active() { let n = 0; for (const u of this._live) if (u.k < 1) n++; return n; },

    // Liga o corte num material (retorna o material, para encadear).
    apply(material) {
        if (!this._cls) this._cls = this._makeClass();
        new this._cls(material);
        return material;
    },

    _makeClass() {
        const S = this;
        return class RoofCutPlugin extends BABYLON.MaterialPluginBase {
            constructor(material) {
                super(material, 'RoofCut', 300, { ROOFCUT: false });
                this._enable(true);
            }
            getClassName() { return 'RoofCutPlugin'; }
            prepareDefines(defines) { defines.ROOFCUT = true; }
            getUniforms() {
                const ubo = ['rcR0', 'rcR1', 'rcR2', 'rcR3', 'rcY', 'rcK'].map((name) => ({ name, size: 4, type: 'vec4' }));
                return { ubo, fragment: 'uniform vec4 rcR0;\nuniform vec4 rcR1;\nuniform vec4 rcR2;\nuniform vec4 rcR3;\nuniform vec4 rcY;\nuniform vec4 rcK;' };
            }
            bindForSubMesh(ub) {
                const s = S.state;
                for (let i = 0; i < 4; i++) ub.updateFloat4('rcR' + i, s[i * 4], s[i * 4 + 1], s[i * 4 + 2], s[i * 4 + 3]);
                ub.updateFloat4('rcY', s[16], s[17], s[18], s[19]);
                ub.updateFloat4('rcK', s[20], s[21], s[22], s[23]);
            }
            getCustomCode(shaderType) {
                if (shaderType !== 'fragment') return null;
                // (sem ponto e vírgula em comentário GLSL: o Babylon corta a linha ali)
                // Enquanto some ou volta, a peça se desfaz em pontilhado (Bayer 4×4) — cada pixel ou é desenhado inteiro (cobre e grava a
                // profundidade) ou é descartado. Sumida, nada dela é desenhado.
                return {
                    CUSTOM_FRAGMENT_DEFINITIONS: `
                        #ifdef ROOFCUT
                        float rcIn(vec3 p, vec4 r, float y, float k) { return (p.x > r.x && p.x < r.z && p.z > r.y && p.z < r.w && p.y > y) ? 1.0 - k : 0.0; }
                        float rcBayer(vec2 f) {
                            vec2 a = mod(f, 2.0), b = mod(floor(f * 0.5), 2.0);
                            return (mod(a.x * 2.0 + a.y * 3.0, 4.0) * 4.0 + mod(b.x * 2.0 + b.y * 3.0, 4.0) + 0.5) / 16.0;
                        }
                        #endif`,
                    CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
                        #ifdef ROOFCUT
                        float rcH = max(max(rcIn(vPositionW, rcR0, rcY.x, rcK.x), rcIn(vPositionW, rcR1, rcY.y, rcK.y)), max(rcIn(vPositionW, rcR2, rcY.z, rcK.z), rcIn(vPositionW, rcR3, rcY.w, rcK.w)));
                        if (rcH > 0.0 && rcH > rcBayer(floor(gl_FragCoord.xy))) discard;
                        color.a = 1.0;
                        #endif`,
                };
            }
        };
    },
};
