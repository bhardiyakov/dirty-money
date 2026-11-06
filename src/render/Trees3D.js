// ============================================================================
// Trees3D — ÁRVORES, PALMEIRAS E ARBUSTOS EM 3D (etapa 5 do upgrade visual; `?arvores=3d`, Config.art.trees3d) no lugar das copas
// desenhadas vistas de cima.
//
// Cada espécie é uma malha low-poly feita aqui (tronco cônico + copa de "bolhas" de icosfera entortadas por ruído, cones empilhados nos
// pinheiros, a umbela da araucária, palmas caídas nas palmeiras e folhas largas na bananeira), com cor por vértice (a copa mais clara
// em cima e escura embaixo: oclusão falsa) e normais "de folhagem" (saindo do centro da copa: luz macia, sem facetas).
// As plantas de uma espécie numa célula de 64 u viram UMA malha com THIN INSTANCES (1 desenho por espécie e célula, também no mapa de
// sombras): cada uma com escala, giro e TOM próprios (o tom sai do lugar dela, no shader). O material é o StandardMaterial do jogo
// (a mesma luz do sol e do céu, a mesma sombra, o mesmo dia e noite) com o BALANÇO DO VENTO no vertex shader (mais no alto da copa,
// mais forte com chuva). As árvores projetam e recebem a sombra do sol e escrevem profundidade: quem passa atrás delas aparece como a
// silhueta dourada (XRaySilhouette), como atrás dos prédios.
// Onde entram: WorldBuilder._spriteQuad (as plantas da cidade, dos parques, do Corcovado, do Maracanã e do mundo grande —
// TerrainBuilder._plant) desvia as espécies daqui para batch.trees; quem monta a malha do batch chama build(). Capim, samambaia,
// flores, juncos, mato seco, pedras e guarda-sóis continuam nos sprites.
//   wants(kind)   add(batch, kind, x, y0, z, s)   build(scene, batches, name, shadow, { lod }) → malhas
// DETALHE (lod): 2 = todas as bolhas da copa com 2 subdivisões (as árvores da cidade, preset Medium para cima); 1 = só a principal
// (cidade no Low); 0 = todas com 1 (o mapa grande — mata, encostas, campo: milhares de árvores). `casts` = false: não entram no mapa
// de sombras (o mapa grande: numa mata fechada o chão debaixo das copas quase não aparece, e a sombra dobrava os desenhos).
// (Base: a versão do visual moderno revertido no #81/#82, agora sem o PBR nem a maquete.)
// ============================================================================

const Trees3D = {
    get on() {
        const m = typeof location !== 'undefined' && location.search.match(/[?&]arvores=([^&]*)/);
        if (m) return m[1] === '3d';
        return !!(typeof Config !== 'undefined' && Config.art && Config.art.trees3d);
    },
    // espécie do sprite → modelo (altura em u na escala 1)
    KIND: { oak: 'oak', jungle: 'jungle', juca: 'juca', ipe: 'ipe', orchard: 'orchard', pine: 'pine', cypress: 'cypress', araucaria: 'araucaria',
        palm: 'palm', banana: 'banana' },      // (arbustos: ficam os desenhados — muitos, baixos e melhores assim)
    wants(kind) { return this.on && !!this.KIND[kind]; },
    // As instâncias são agrupadas em células de CELL u (uma malha por modelo e célula): o descarte por frustum e a janela da sombra
    // deixam de fora o que está longe da tela (num pedaço de 128 u de mata são ~1.500 plantas; na tela cabem algumas centenas).
    CELL: 128,
    castShadows: true,

    // Uma planta: (x, z) no chão a y0, escala s (a do sprite).
    add(batch, kind, x, y0, z, s) {
        (batch.trees || (batch.trees = [])).push(kind, x, y0, z, s);
    },

    // As malhas (uma por modelo) das plantas guardadas nos batches. shadow: o gerador de sombras (elas projetam).
    build(scene, batches, name, shadow, { lod = this.lod, casts = true } = {}) {
        const groups = new Map(), out = [];
        for (const b of batches) {
            const T = b && b.trees;
            if (!T) continue;
            for (let i = 0; i < T.length; i += 5) {
                const kind = T[i], x = T[i + 1], y0 = T[i + 2] + (typeof Relief !== 'undefined' ? Relief.at(T[i + 1], T[i + 3]) : 0), z = T[i + 3], s = T[i + 4];      // (relevo: no chão do morro)
                const h = this._hash(x * 13.1, z * 7.7);
                const model = kind === 'ipe' ? (h < 0.5 ? 'ipe' : 'ipeY') : this.KIND[kind];
                const key = model + '@' + Math.floor(x / this.CELL) + ',' + Math.floor(z / this.CELL);
                let g = groups.get(key);
                if (!g) groups.set(key, g = []);
                g.push(x, y0, z, s, h);
            }
            b.trees = null;
        }
        const M = BABYLON.Matrix, Q = BABYLON.Quaternion, V = BABYLON.Vector3;
        const sc = new V(), tr = new V(), q = new Q(), mtx = new M();
        for (const [key, g] of groups) {
            // Geometria PRÓPRIA por malha (não clones dividindo uma): o Babylon guarda o VAO na geometria por shader, gravado com o buffer de
            // instâncias de quem desenhou primeiro — clones que dividem a geometria desenhavam todos as árvores do primeiro (longe da tela).
            const model = key.slice(0, key.indexOf('@')), n = g.length / 5;
            const mesh = new BABYLON.Mesh(`${name}_${model}${key.slice(key.indexOf('@'))}`, scene);
            this._model(scene, model, lod).applyToMesh(mesh);
            mesh.material = this.material(scene);
            mesh.useVertexColors = true;
            const mats = new Float32Array(n * 16);
            for (let k = 0; k < n; k++) {
                const x = g[k * 5], y0 = g[k * 5 + 1], z = g[k * 5 + 2], s = g[k * 5 + 3], h = g[k * 5 + 4];
                const h2 = this._hash(z * 3.3 + 1.7, x * 5.9), h3 = this._hash(x * 1.9 - 4.1, z * 2.3 + 8.2);
                const k1 = s * (0.88 + 0.24 * h2), k2 = k1 * (0.9 + 0.2 * h3);          // escala (um pouco mais larga ou mais alta)
                sc.set(k1, k2, k1);
                Q.RotationYawPitchRollToRef(h * Math.PI * 2, (h3 - 0.5) * 0.08, (h2 - 0.5) * 0.08, q);       // giro e uma inclinação leve
                tr.set(x, y0, z);
                M.ComposeToRef(sc, q, tr, mtx);
                mtx.copyToArray(mats, k * 16);
            }
            mesh.thinInstanceSetBuffer('matrix', mats, 16, false);          // (staticBuffer = false, como no resto do jogo: com true as instâncias não eram desenhadas)
            mesh.thinInstanceRefreshBoundingInfo(false);
            mesh.alwaysSelectAsActiveMesh = false;
            mesh.receiveShadows = true;
            mesh.isPickable = false;
            mesh.freezeWorldMatrix();
            if (shadow && this.castShadows && casts) shadow.addShadowCaster(mesh);
            out.push(mesh);
        }
        return out;
    },
    _hash(x, z) { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); },

    // ------------------------------------------------------------------ o material (o do jogo + vento)
    material(scene) {
        if (this._mat) return this._mat;
        const m = new BABYLON.StandardMaterial('trees3d', scene);
        m.specularColor = BABYLON.Color3.Black();
        m.backFaceCulling = false;                 // (as palmas e as folhas são finas: os dois lados)
        // (sem twoSidedLighting: as palmas viradas para baixo ficavam com a normal invertida — pretas; os dois lados usam a normal de cima)
        if (!this._wind) this._wind = this._windClass();
        new this._wind(m);
        return (this._mat = m);
    },
    _windClass() {
        return class TreeWindPlugin extends BABYLON.MaterialPluginBase {
            constructor(m) { super(m, 'TreeWind', 120, { TREEWIND: false }); this._enable(true); }
            getClassName() { return 'TreeWindPlugin'; }
            prepareDefines(d) { d.TREEWIND = true; }
            getUniforms() { return { ubo: [{ name: 'trW', size: 4, type: 'vec4' }], vertex: 'uniform vec4 trW;', fragment: 'uniform vec4 trW;' }; }
            bindForSubMesh(ub) {
                const t = (performance.now() / 1000) % 1000, w = typeof Weather !== 'undefined' && Weather.cur ? Weather.cur.k : 0;
                ub.updateFloat4('trW', t, 0.05 + 0.13 * w, 0.8, 0.6);
            }
            getCustomCode(shaderType) {
                // (sem ponto e vírgula em comentário GLSL: o Babylon corta a linha ali)
                // O TOM de cada planta (mais clara/escura, mais amarela/azulada) sai do lugar dela (a translação da instância): sem buffer de
                // cor por instância
                if (shaderType === 'fragment') return {
                    CUSTOM_FRAGMENT_DEFINITIONS: `
                        #ifdef TREEWIND
                        varying vec2 trTone;
                        float tfH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
                        float tfN(vec3 p) {
                            vec3 i = floor(p), f = fract(p);
                            f = f * f * (3.0 - 2.0 * f);
                            return mix(mix(mix(tfH(i), tfH(i + vec3(1.0, 0.0, 0.0)), f.x), mix(tfH(i + vec3(0.0, 1.0, 0.0)), tfH(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
                                       mix(mix(tfH(i + vec3(0.0, 0.0, 1.0)), tfH(i + vec3(1.0, 0.0, 1.0)), f.x), mix(tfH(i + vec3(0.0, 1.0, 1.0)), tfH(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
                        }
                        #endif`,
                    // FOLHAGEM (o alfa da cor do vértice: 0 = madeira, 0,5..0,74 = folha, 0,76..1 = flor — PARTS._push): tufos claros e vãos
                    // escuros de um ruído 3D no espaço do mundo (3 escalas), o sombreado da copa decodificado do alfa, as manchas de flor
                    // sobre o verde (ipês) e, no WebGL 2, as normais entortadas pelo mesmo ruído (gradiente de superfície): a luz do sol
                    // pega os tufos — a copa deixa de ser uma bolha lisa.
                    CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
                        #if defined(TREEWIND) && defined(VERTEXCOLOR)
                        if (vColor.a > 0.25) {
                            float trFl = vColor.a > 0.755 ? 1.0 : 0.0;
                            float trSh = 0.4 + 0.9 * clamp((vColor.a - mix(0.5, 0.76, trFl)) / 0.24, 0.0, 1.0);
                            vec3 trP = vPositionW;
                            float trN = tfN(trP * 1.25) * 0.6 + tfN(trP * 2.9 + 7.1) * 0.28 + tfN(trP * 6.1 + 3.3) * 0.12;
                            if (trFl > 0.5) {
                                float trM = smoothstep(0.42, 0.6, tfN(trP * 0.9 + 11.0) * 0.65 + trN * 0.35);
                                vec3 trTn = baseColor.rgb / max(vColor.rgb, vec3(0.001));
                                baseColor.rgb = mix(vec3(0.27, 0.45, 0.19) * trTn, baseColor.rgb, trM);
                            }
                            baseColor.rgb *= trSh * (0.74 + 0.48 * trN);
                            #ifdef WEBGL2
                            {
                                vec3 trDx = dFdx(vPositionW), trDy = dFdy(vPositionW), trR1 = cross(trDy, normalW), trR2 = cross(normalW, trDx);
                                float trDet = dot(trDx, trR1);
                                vec3 trG = sign(trDet) * (dFdx(trN) * trR1 + dFdy(trN) * trR2);
                                normalW = normalize(abs(trDet) * normalW - 0.8 * trG);
                            }
                            #endif
                        }
                        #endif`,
                    CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
                        #ifdef TREEWIND
                        baseColor.rgb *= mix(0.8, 1.14, trTone.x) * vec3(1.0 + (trTone.y - 0.5) * 0.24, 1.0, 1.0 - (trTone.y - 0.5) * 0.34);
                        #endif`,
                };
                return {
                    CUSTOM_VERTEX_DEFINITIONS: `
                        #ifdef TREEWIND
                        varying vec2 trTone;
                        #endif`,
                    CUSTOM_VERTEX_UPDATE_WORLDPOS: `
                        #ifdef TREEWIND
                        {
                            vec2 o = finalWorld[3].xz;
                            trTone = fract(sin(vec2(dot(o, vec2(12.9898, 78.233)), dot(o, vec2(39.346, 11.135)))) * 43758.5453);
                            float hy = max(positionUpdated.y - 0.8, 0.0);
                            float ph = trW.x * 1.3 + dot(worldPos.xz, vec2(0.11, 0.17));
                            float sw = (sin(ph) * 0.6 + sin(ph * 2.3 + 1.7) * 0.25 + sin(trW.x * 0.37 + worldPos.x * 0.02) * 0.4) * trW.y;
                            worldPos.xz += vec2(trW.z, trW.w) * sw * hy * hy * 0.06;
                        }
                        #endif`,
                };
            }
        };
    },

    // ------------------------------------------------------------------ os modelos (os vértices de cada um, prontos para cada malha)
    // Detalhe das copas: 2 = bolhas de icosfera com 2 subdivisões (copas redondas); 1 (preset Low) = a principal com 2, as outras com 1.
    get lod() { return typeof Graphics !== 'undefined' && Graphics.level === 'low' ? 1 : 2; },
    _model(scene, model, lod = this.lod) {
        const C = this._models || (this._models = {}), key = model + '|' + lod, sMain = lod >= 1 ? 2 : 1, sAll = lod >= 2 ? 2 : 1;
        if (C[key]) return C[key];
        const g = { p: [], n: [], c: [], i: [] }, R = this._rng(model.length * 977 + model.charCodeAt(0) * 31);
        const B = this.PARTS, trunk = [0.36, 0.27, 0.19], dark = [0.27, 0.21, 0.15];
        switch (model) {
            case 'oak': case 'juca': case 'orchard': case 'jungle': case 'ipe': case 'ipeY': {
                const P = {
                    oak: { h: 4.8, r: 1.9, c: [0.33, 0.53, 0.2], n: 4 }, juca: { h: 5.4, r: 1.75, c: [0.36, 0.58, 0.26], n: 4 },
                    orchard: { h: 3.2, r: 1.4, c: [0.38, 0.58, 0.23], n: 3 }, jungle: { h: 6.2, r: 2.2, c: [0.24, 0.48, 0.2], n: 5 },
                    ipe: { h: 5.0, r: 1.8, c: [0.94, 0.5, 0.74], n: 4, fl: true }, ipeY: { h: 5.0, r: 1.8, c: [1.0, 0.84, 0.28], n: 4, fl: true },
                }[model];
                const crownY = P.h - P.r * 0.85;
                B.cyl(g, [0, 0, 0], [0.15, crownY, -0.1], 0.24 * P.r / 2, 0.12 * P.r / 2, 6, trunk, dark);
                B.cyl(g, [0.1, crownY * 0.6, -0.05], [P.r * 0.45, crownY + 0.4, 0.3], 0.1, 0.06, 5, trunk, dark);
                for (let k = 0; k < P.n; k++) {
                    const a = k / P.n * Math.PI * 2 + R() * 0.8, d = k === 0 ? 0 : P.r * (0.35 + 0.25 * R());
                    const rr = P.r * (k === 0 ? 0.82 : 0.55 + 0.2 * R());
                    B.blob(g, [Math.cos(a) * d, crownY + (k === 0 ? 0.3 : (R() - 0.3) * P.r * 0.5), Math.sin(a) * d], [rr, rr * 0.82, rr], P.c, R, 0.18, k === 0 ? sMain : sAll, P.fl ? 'flower' : 'leaf');
                }
                break;
            }
            case 'bush': {
                for (let k = 0; k < 2; k++) {
                    const a = k * 2.1 + R(), d = k === 0 ? 0 : 0.45;
                    B.blob(g, [Math.cos(a) * d, 0.55, Math.sin(a) * d], [0.85 - k * 0.12, 0.62 - k * 0.08, 0.85 - k * 0.12], [0.26, 0.44, 0.18], R, 0.22);
                }
                break;
            }
            case 'pine': case 'cypress': {
                const cy = model === 'cypress';
                B.cyl(g, [0, 0, 0], [0, cy ? 1.2 : 1.6, 0], 0.22, 0.18, 6, trunk, dark);
                if (cy) B.blob(g, [0, 3.6, 0], [0.95, 2.8, 0.95], [0.2, 0.36, 0.2], R, 0.12, sMain);
                else for (let k = 0; k < 4; k++) B.cone(g, [0, 1.3 + k * 1.35, 0], 2.0 - k * 0.42, 2.2 - k * 0.2, 8, [0.17, 0.34, 0.2], R);
                break;
            }
            case 'araucaria': {
                B.cyl(g, [0, 0, 0], [0, 7.2, 0], 0.26, 0.14, 6, [0.4, 0.3, 0.22], dark);
                for (let k = 0; k < 3; k++) {                                               // a umbela: discos achatados no alto
                    const y = 5.4 + k * 0.85, r = 2.7 - k * 0.7;
                    B.blob(g, [0, y, 0], [r, 0.42, r], [0.2, 0.36, 0.18], R, 0.2, k === 0 ? sMain : sAll);
                }
                break;
            }
            case 'palm': {
                const top = B.trunkCurve(g, 6.8, 0.22, 0.15, 0.9, [0.52, 0.42, 0.3], [0.36, 0.28, 0.2]);
                for (let k = 0; k < 8; k++) B.frond(g, top, k / 8 * Math.PI * 2 + R() * 0.3, 3.2 + R() * 0.6, 0.62, 0.4 + R() * 0.3, [0.3, 0.5, 0.2], [0.2, 0.36, 0.14]);
                B.blob(g, top, [0.42, 0.36, 0.42], [0.34, 0.3, 0.16], R, 0.1, 1, 'wood');   // os cocos
                break;
            }
            case 'banana': {
                const top = B.trunkCurve(g, 1.9, 0.2, 0.16, 0.15, [0.46, 0.5, 0.28], [0.34, 0.38, 0.2]);
                for (let k = 0; k < 7; k++) B.frond(g, top, k / 7 * Math.PI * 2 + R() * 0.5, 1.9 + R() * 0.4, 0.9, 0.35 + R() * 0.25, [0.36, 0.56, 0.22], [0.26, 0.42, 0.16]);
                break;
            }
        }
        const vd = new BABYLON.VertexData();
        vd.positions = new Float32Array(g.p); vd.normals = new Float32Array(g.n); vd.colors = new Float32Array(g.c);
        vd.indices = g.p.length / 3 > 65535 ? new Uint32Array(g.i) : new Uint16Array(g.i);
        return (C[key] = vd);
    },
    _rng(seed) { let s = seed >>> 0 || 1; return () => { s = Math.imul(s ^ (s >>> 15), 2246822519) ^ Math.imul(s ^ (s >>> 13), 3266489917); s >>>= 0; return (s & 0xffffff) / 0x1000000; }; },
};

// Peças de geometria (acrescentam em g = { p, n, c, i }).
Trees3D.PARTS = {
    _ico: {},
    // icosfera unitária: 2 subdivisões (80 triângulos) na bolha principal da copa, 1 (20) nas menores
    ico(sub) {
        if (this._ico[sub]) return this._ico[sub];
        const vd = BABYLON.CreateIcoSphereVertexData({ radius: 1, subdivisions: sub, flat: false });
        return (this._ico[sub] = { p: Array.from(vd.positions), i: Array.from(vd.indices) });
    },
    // a = o ALFA da cor do vértice, que diz ao shader o que é (Trees3D._windClass): 0 = madeira (a cor já sombreada); folha e flor =
    // a cor da espécie SEM sombra e o sombreado (a oclusão falsa) codificado no alfa — leaf(sh) / flower(sh).
    _push(g, x, y, z, nx, ny, nz, c, a = 0) {
        g.p.push(x, y, z);
        const l = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz || 1);
        g.n.push(nx * l, ny * l, nz * l);
        g.c.push(c[0], c[1], c[2], a);
    },
    leaf(sh) { return 0.5 + 0.24 * Math.max(0, Math.min(1, (sh - 0.4) / 0.9)); },
    flower(sh) { return 0.76 + 0.24 * Math.max(0, Math.min(1, (sh - 0.4) / 0.9)); },
    // Bolha de folhagem: icosfera com raios (rx, ry, rz) entortada por ruído; mais clara em cima, escura embaixo. mode: 'leaf' (folhagem,
    // o shader põe os tufos), 'flower' (a cor da flor, em manchas sobre o verde) ou 'wood' (cor lisa: os cocos).
    blob(g, c, r, col, R, jit, sub = 1, mode = 'leaf') {
        const I = this.ico(sub), base = g.p.length / 3, ph = R() * 10;
        for (let k = 0; k < I.p.length; k += 3) {
            const x = I.p[k], y = I.p[k + 1], z = I.p[k + 2];
            const w = 1 + (Math.sin(x * 3.1 + ph) * Math.sin(y * 2.7 + ph * 1.3) * Math.sin(z * 3.3 - ph) + (R() - 0.5) * 0.25) * jit;      // (ruído suave: a copa ondulada, não facetada)
            const sh = 0.62 + 0.45 * (y * 0.5 + 0.5) + (R() - 0.5) * 0.05;
            const px = c[0] + x * r[0] * w, py = c[1] + y * r[1] * w, pz = c[2] + z * r[2] * w;
            if (mode === 'wood') this._push(g, px, py, pz, x, y + 0.35, z, [col[0] * sh, col[1] * sh, col[2] * sh]);
            else this._push(g, px, py, pz, x, y + 0.35, z, col, mode === 'flower' ? this.flower(sh) : this.leaf(sh));
        }
        for (const i of I.i) g.i.push(base + i);
    },
    // Tronco cônico de a até b (raios ra → rb), `n` lados.
    cyl(g, a, b, ra, rb, n, col, colLow) {
        const base = g.p.length / 3, dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const ax = [dx / L, dy / L, dz / L], t = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        const u = [ax[1] * t[2] - ax[2] * t[1], ax[2] * t[0] - ax[0] * t[2], ax[0] * t[1] - ax[1] * t[0]], ul = Math.hypot(...u);
        u[0] /= ul; u[1] /= ul; u[2] /= ul;
        const v = [ax[1] * u[2] - ax[2] * u[1], ax[2] * u[0] - ax[0] * u[2], ax[0] * u[1] - ax[1] * u[0]];
        for (let s = 0; s <= 1; s++) {
            const P = s ? b : a, r = s ? rb : ra, cc = s ? col : colLow;
            for (let k = 0; k < n; k++) {
                const an = k / n * Math.PI * 2, cx = Math.cos(an), sx = Math.sin(an);
                const nx = u[0] * cx + v[0] * sx, ny = u[1] * cx + v[1] * sx, nz = u[2] * cx + v[2] * sx;
                this._push(g, P[0] + nx * r, P[1] + ny * r, P[2] + nz * r, nx, ny, nz, cc);
            }
        }
        for (let k = 0; k < n; k++) { const k1 = (k + 1) % n; g.i.push(base + k, base + n + k, base + k1, base + k1, base + n + k, base + n + k1); }
    },
    // Cone de galhos (pinheiro): base de raio r em c, altura h.
    cone(g, c, r, h, n, col, R) {
        const base = g.p.length / 3;
        for (let k = 0; k < n; k++) {
            const an = k / n * Math.PI * 2, rr = r * (0.85 + 0.3 * R()), dy = (R() - 0.5) * 0.25;
            const sh = 0.7 + (R() - 0.5) * 0.15;
            this._push(g, c[0] + Math.cos(an) * rr, c[1] + dy, c[2] + Math.sin(an) * rr, Math.cos(an), 0.55, Math.sin(an), col, this.leaf(sh));
        }
        this._push(g, c[0], c[1] + h, c[2], 0, 1, 0, col, this.leaf(1.25));
        this._push(g, c[0], c[1] + 0.25, c[2], 0, -1, 0, col, this.leaf(0.5));
        for (let k = 0; k < n; k++) { const k1 = (k + 1) % n; g.i.push(base + k, base + n, base + k1, base + k1, base + n + 1, base + k); }
    },
    // Tronco curvo (palmeira, bananeira): devolve o topo.
    trunkCurve(g, h, r0, r1, bend, col, colLow) {
        const seg = 6;
        let prev = [0, 0, 0];
        for (let s = 1; s <= seg; s++) {
            const t = s / seg, p = [bend * t * t, h * t, bend * 0.35 * t * t];
            const ra = r0 + (r1 - r0) * (s - 1) / seg, rb = r0 + (r1 - r0) * t;
            this.cyl(g, prev, p, ra, rb, 6, s % 2 ? col : colLow, s % 2 ? colLow : col);
            prev = p;
        }
        return prev;
    },
    // Palma/folha: fita que sai do topo na direção `a`, comprimento L, caindo `droop`, largura w.
    frond(g, top, a, L, droop, w, col, colTip) {
        const seg = 5, dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx, base = g.p.length / 3;
        for (let s = 0; s <= seg; s++) {
            const t = s / seg, x = top[0] + dx * L * t, y = top[1] + 0.35 * L * t - droop * L * t * t * 1.1, z = top[2] + dz * L * t;
            const ww = w * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.08)) * (1 - t * 0.35);
            const c = [col[0] + (colTip[0] - col[0]) * t, col[1] + (colTip[1] - col[1]) * t, col[2] + (colTip[2] - col[2]) * t];
            const ny = 1, nx = dx * (droop * 2 * t - 0.35), nz = dz * (droop * 2 * t - 0.35);
            this._push(g, x + px * ww, y - ww * 0.25, z + pz * ww, nx + px * 0.4, ny, nz + pz * 0.4, c, this.leaf(1));
            this._push(g, x - px * ww, y - ww * 0.25, z - pz * ww, nx - px * 0.4, ny, nz - pz * 0.4, c, this.leaf(1));
        }
        for (let s = 0; s < seg; s++) { const o = base + s * 2; g.i.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
    },
};
