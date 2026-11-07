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
    // (a remasterização da vegetação — referência: a folha de árvores e arbustos brasileiros: TODA a vegetação viva é 3D — árvores, palmeiras,
    // arbustos, samambaias, capins e flores; as espécies novas — mangueira, flamboyant, jacarandá, quaresmeira, palmeira imperial,
    // eucalipto, espada-de-são-jorge, cacto, bambu e costela-de-adão — saem do sorteio por lugar (variant) ou são postas direto)
    KIND: { oak: 'oak', jungle: 'jungle', juca: 'juca', ipe: 'ipe', orchard: 'orchard', pine: 'pine', cypress: 'cypress', araucaria: 'araucaria',
        palm: 'palm', banana: 'banana', bush: 'bush', fern: 'fern', flowers: 'roadside', reed: 'reed', dry: 'dry', tuft: 'tuft',
        mango: 'mango', flamboyant: 'flamboyant', jacaranda: 'jacaranda', quaresmeira: 'quaresmeira', imperial: 'imperial', eucalyptus: 'eucalyptus',
        sansevieria: 'sansevieria', cactus: 'cactus', bamboo: 'bamboo', monstera: 'monstera',
        capim: 'capim', boulder: 'rock', rock: 'rock', pebbles: 'pebbles',
        // objetos do cenário que eram desenhos chapados (PropSprites): guarda-sol, monte de lixo, entulho, fardo de feno, silo
        umbrella: 'parasol', trash: 'trashpile', debris: 'rubble', hay: 'haybale', silo: 'silo' },
    // RÍGIDOS: não balançam com o vento (o alfa da cor = 0,2 — o shader pula o vento e pinta a cor lisa)
    RIGID: new Set(['parasol', 'trashpile', 'rubble', 'haybale', 'silo']),
    // altura do modelo na escala 1 (u): quem põe o canteiro e o desvio do vento usam
    TALL: { eucalyptus: 30, imperial: 14, silo: 9 },
    // A espécie de cada planta: algumas viram variações pelo lugar (sorteio estável por posição). Na cidade e nos bairros, o "carvalho"
    // vira a árvore de rua brasileira (mangueira, flamboyant, jacarandá, quaresmeira); a palmeira, a imperial ou o coqueiro.
    variant(kind, x, z, h) {
        const urban = typeof CityGrid !== 'undefined' && CityGrid.inCity && CityGrid.inCity(x, z);
        switch (kind) {
            case 'ipe': return h < 0.4 ? 'ipe' : h < 0.85 ? 'ipeY' : 'jacaranda';
            case 'oak': return !urban ? (h < 0.6 ? 'oak' : 'mango') : h < 0.38 ? 'mango' : h < 0.78 ? 'oak' : h < 0.86 ? 'flamboyant' : h < 0.93 ? 'jacaranda' : 'quaresmeira';
            case 'palm': return urban && h < 0.55 ? 'imperial' : 'palm';
            // PINHEIRO e CIPRESTE são exóticos: só no Alto da Serra (a araucária, o nativo) e nas praças da cidade; no mato, as nativas
            case 'pine': return typeof Bairros !== 'undefined' && Bairros.zoneAt(x, z) === 'serra' ? (h < 0.6 ? 'araucaria' : 'pine') : h < 0.4 ? 'jungle' : h < 0.7 ? 'juca' : h < 0.85 ? 'mango' : 'oak';
            case 'cypress': return urban || (typeof Bairros !== 'undefined' && Bairros.zoneAt(x, z) === 'serra') ? 'cypress' : 'juca';
            case 'rock': case 'boulder': return h < 0.5 ? 'rock' : 'rockB';
            case 'bush': return h < 0.5 ? 'bush' : h < 0.75 ? 'bushR' : 'bushY';
            default: return this.KIND[kind];
        }
    },
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
                const model = this.variant(kind, x, z, h);
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
            getUniforms() { return { ubo: [{ name: 'trW', size: 4, type: 'vec4' }, { name: 'trP', size: 4, type: 'vec4' }], vertex: 'uniform vec4 trW;', fragment: 'uniform vec4 trW;\nuniform vec4 trP;' }; }
            bindForSubMesh(ub) {
                const t = (performance.now() / 1000) % 1000, w = typeof Weather !== 'undefined' && Weather.cur ? Weather.cur.k : 0;
                ub.updateFloat4('trW', t, 0.05 + 0.13 * w, 0.8, 0.6);
                // o ALVO da câmera (o personagem ou o veículo): a copa entre a câmera e ele vira pontilhado (w = 1: ligado na perseguição)
                const C = typeof CompassCamera !== 'undefined' && CompassCamera.current, T = C && C.target;
                if (T && C.chase > 0.3) ub.updateFloat4('trP', T.x, (C.lift || 0) + 1.0, T.z, 1); else ub.updateFloat4('trP', 0, 0, 0, 0);
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
                        #ifdef TREEWIND
                        if (trP.w > 0.5) {
                            // NA FRENTE do personagem (perseguição, a pé ou dirigindo): a copa perto do segmento câmera → alvo (num cilindro de
                            // ~2,6 m, antes dele) e a colada na câmera somem num pontilhado ordenado (4 × 4) — o personagem aparece de verdade,
                            // não só a silhueta, e a copa em volta continua lá
                            vec3 trE = vEyePosition.xyz, trS = trP.xyz - trE;
                            float trL = length(trS), trT = clamp(dot(vPositionW - trE, trS) / (trL * trL), 0.0, 1.0);
                            float trR = length(vPositionW - (trE + trS * trT)), trCd = length(vPositionW - trE);
                            float trK = max(trT < 0.94 ? 1.0 - smoothstep(1.6, 2.8, trR) : 0.0, 1.0 - smoothstep(5.0, 9.0, trCd));
                            if (trK > 0.0) {
                                vec2 trG = mod(floor(gl_FragCoord.xy), 4.0);
                                float trB = mod(trG.x * 8.0 + trG.y * 4.0 + mod(trG.y, 2.0) * 2.0 + mod(trG.x + trG.y, 2.0), 16.0) / 16.0;
                                if (trB < trK * 0.88) discard;
                            }
                        }
                        #endif
                        #if defined(TREEWIND) && defined(VERTEXCOLOR)
                        if (vColor.a > 0.25) {
                            // BORDA DA COPA RECORTADA: onde a superfície da bolha fica de lado para a câmera (a silhueta), o ruído das folhas
                            // abre buracos — a copa tem contorno de folhagem, não de bolha lisa
                            {
                                vec3 trV = normalize(vEyePosition.xyz - vPositionW);
                                float trRim = 1.0 - abs(dot(normalize(normalW), trV));
                                float trLf = tfN(vPositionW * 4.2 + 2.7) * 0.62 + tfN(vPositionW * 8.5) * 0.38;
                                if (trRim > 0.3 && trLf < (trRim - 0.3) * 1.75) discard;
                            }
                            float trFl = vColor.a > 0.755 ? 1.0 : 0.0;
                            float trSh = 0.4 + 0.9 * clamp((vColor.a - mix(0.5, 0.76, trFl)) / 0.24, 0.0, 1.0);
                            vec3 trP = vPositionW;
                            float trN = tfN(trP * 1.25) * 0.54 + tfN(trP * 2.9 + 7.1) * 0.26 + tfN(trP * 6.1 + 3.3) * 0.12 + tfN(trP * 9.5) * 0.08;      // (a última: o grão das folhas)
                            if (trFl > 0.5) {
                                float trM = smoothstep(0.3, 0.5, tfN(trP * 1.6 + 11.0) * 0.55 + trN * 0.45);      // (a copa quase toda em flor, com vãos de folha)
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
                            float hy = min(max(positionUpdated.y - 0.8, 0.0), 7.0);
                            #ifdef VERTEXCOLOR
                            if (abs(color.a - 0.2) < 0.04) hy = 0.0;                     // (objeto rígido: guarda-sol, silo, entulho — sem vento)
                            #endif
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
                // COPA VOLUMOSA: o miolo e uma porção de cachos menores espalhados na casca (folhagem densa em camadas, contorno
                // irregular — não uma bolha só)
                B.blob(g, [0, crownY + 0.3, 0], [P.r * 0.8, P.r * 0.66, P.r * 0.8], P.c, R, 0.18, sMain, P.fl ? 'flower' : 'leaf');
                B.clumps(g, [0, crownY + 0.3, 0], [P.r * 0.78, P.r * 0.62, P.r * 0.78], P.n + 4, P.r * 0.46, P.c, R, sAll, P.fl ? 'flower' : 'leaf');
                if (P.fl) B.blob(g, [0, 0.02, 0], [P.r * 1.3, 0.015, P.r * 1.3], P.c, R, 0.08, 1, 'flower');      // o tapete de flores caídas
                if (model === 'orchard') for (let k = 0; k < 9; k++) { const a = R() * Math.PI * 2, y = crownY - 0.3 + R() * 1.2, r = P.r * 0.85; B.cyl(g, [Math.cos(a) * r, y, Math.sin(a) * r], [Math.cos(a) * r, y - 0.14, Math.sin(a) * r], 0.08, 0.07, 4, [0.98, 0.6, 0.1], [0.9, 0.5, 0.1]); }
                break;
            }
            case 'bush': case 'bushR': case 'bushY': {                                    // arbustos variados (verde, flor vermelha, flor amarela)
                const fl = model === 'bushR' ? [0.86, 0.14, 0.12] : model === 'bushY' ? [0.98, 0.82, 0.18] : null;
                for (let k = 0; k < 3; k++) {
                    const a = k * 2.1 + R(), d = k === 0 ? 0 : 0.42;
                    B.blob(g, [Math.cos(a) * d, 0.55 - k * 0.08, Math.sin(a) * d], [0.82 - k * 0.14, 0.6 - k * 0.08, 0.82 - k * 0.14], fl || [0.26, 0.46, 0.18], R, 0.24, k === 0 ? sMain : 1, fl ? 'flower' : 'leaf');
                }
                for (let k = 0; k < 4; k++) B.cyl(g, [0, 0, 0], [Math.cos(k * 1.7) * 0.3, 0.45, Math.sin(k * 1.7) * 0.3], 0.04, 0.025, 4, trunk, dark);
                break;
            }
            case 'mango': {                                                                // mangueira: tronco grosso, copa densa e escura, mangas
                B.cyl(g, [0, 0, 0], [0.1, 2.4, 0], 0.36, 0.26, 7, trunk, dark);
                for (const [bx, bz] of [[1.1, 0.4], [-0.9, 0.7], [0.2, -1.1]]) B.cyl(g, [0.05, 2.0, 0], [bx, 3.6, bz], 0.16, 0.08, 5, trunk, dark);
                const cc = [0.17, 0.36, 0.13];
                B.blob(g, [0, 4.6, 0], [2.5, 1.9, 2.5], cc, R, 0.2, sMain);
                B.clumps(g, [0, 4.4, 0], [2.4, 1.8, 2.4], 13, 1.05, cc, R, sAll);
                for (let k = 0; k < 12; k++) {                                              // as mangas (laranja e vermelho) penduradas na borda da copa
                    const a = R() * Math.PI * 2, y = 3.0 + R() * 2.6, r = 2.4 + R() * 0.5;
                    B.cyl(g, [Math.cos(a) * r, y, Math.sin(a) * r], [Math.cos(a) * r, y - 0.2, Math.sin(a) * r], 0.1, 0.08, 4, R() < 0.5 ? [0.95, 0.55, 0.12] : [0.9, 0.3, 0.12], [0.85, 0.5, 0.1]);
                }
                break;
            }
            case 'flamboyant': {                                                           // flamboyant: galhos abertos e a copa em guarda-chuva vermelha
                B.cyl(g, [0, 0, 0], [0, 2.2, 0], 0.3, 0.22, 7, trunk, dark);
                for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + 0.4; B.cyl(g, [0, 2.0, 0], [Math.cos(a) * 2.4, 3.6, Math.sin(a) * 2.4], 0.14, 0.06, 5, trunk, dark); }
                B.blob(g, [0, 4.0, 0], [3.6, 1.1, 3.6], [0.86, 0.3, 0.12], R, 0.2, sMain, 'flower');
                for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + R(); B.blob(g, [Math.cos(a) * 2.6, 3.7 + R() * 0.5, Math.sin(a) * 2.6], [1.6, 0.8, 1.6], [0.88, 0.36, 0.14], R, 0.22, sAll, 'flower'); }
                break;
            }
            case 'jacaranda': case 'quaresmeira': {                                        // jacarandá (azul-violeta, alto) e quaresmeira (roxa, baixa)
                const J = model === 'jacaranda', H = J ? 5.6 : 3.4, rr = J ? 2.1 : 1.6, col = J ? [0.5, 0.46, 0.8] : [0.6, 0.36, 0.76];
                B.cyl(g, [0, 0, 0], [0.2, H - rr, 0.1], J ? 0.22 : 0.14, 0.1, 6, trunk, dark);
                if (!J) for (let k = 0; k < 3; k++) { const a = k * 2.1; B.cyl(g, [0, 0.3, 0], [Math.cos(a) * 0.9, H - rr, Math.sin(a) * 0.9], 0.08, 0.05, 4, trunk, dark); }
                B.blob(g, [0.2, H - 0.2, 0.1], [rr, rr * 0.8, rr], col, R, 0.22, sMain, 'flower');
                for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + R(); B.blob(g, [Math.cos(a) * rr * 0.75, H - rr * 0.5 + R() * 0.6, Math.sin(a) * rr * 0.75], [rr * 0.65, rr * 0.55, rr * 0.65], col, R, 0.22, sAll, 'flower'); }
                if (J) B.blob(g, [0, 0.02, 0], [2.4, 0.015, 2.4], col, R, 0.05, 1, 'flower');      // flores caídas no chão
                break;
            }
            case 'imperial': {                                                             // palmeira imperial: tronco reto e liso, palmito verde, palmas
                B.cyl(g, [0, 0, 0], [0, 1.0, 0], 0.48, 0.36, 8, [0.72, 0.71, 0.67], [0.6, 0.58, 0.54]);
                B.cyl(g, [0, 1.0, 0], [0, 11.6, 0], 0.36, 0.28, 8, [0.8, 0.79, 0.75], [0.72, 0.71, 0.67]);
                B.cyl(g, [0, 11.6, 0], [0, 13.4, 0], 0.3, 0.24, 8, [0.36, 0.5, 0.24], [0.42, 0.56, 0.28]);
                for (let k = 0; k < 12; k++) B.frond(g, [0, 13.4, 0], k / 12 * Math.PI * 2 + R() * 0.25, 3.6 + R() * 0.6, 0.55 + R() * 0.2, 0.42, [0.28, 0.48, 0.2], [0.2, 0.36, 0.14]);
                break;
            }
            case 'eucalyptus': {                                                           // eucalipto de plantação: tronco branco altíssimo, copa estreita no alto
                const H = 30;
                for (let s = 0; s < 6; s++) B.cyl(g, [0, s * H * 0.14, 0], [0.04 * Math.sin(s), (s + 1) * H * 0.14, 0.03 * Math.cos(s)], 0.34 - s * 0.035, 0.34 - (s + 1) * 0.035, 6, s % 2 ? [0.86, 0.84, 0.78] : [0.74, 0.68, 0.58], [0.8, 0.77, 0.7]);
                const cc = [0.36, 0.47, 0.37];
                for (let k = 0; k < 6; k++) {
                    const y = H * 0.62 + k * H * 0.065, a = k * 2.4 + R(), d = 0.3 + R() * 0.6;
                    B.cyl(g, [0, y - 0.8, 0], [Math.cos(a) * d * 1.6, y, Math.sin(a) * d * 1.6], 0.06, 0.03, 4, [0.78, 0.74, 0.66], [0.7, 0.66, 0.58]);
                    B.blob(g, [Math.cos(a) * d * 1.7, y + 0.4, Math.sin(a) * d * 1.7], [1.25 - k * 0.08, 1.9, 1.25 - k * 0.08], cc, R, 0.25, k < 2 ? sMain : 1);
                }
                B.blob(g, [0, H + 0.6, 0], [0.9, 1.6, 0.9], cc, R, 0.25, 1);
                break;
            }
            case 'fern': {                                                                 // samambaia: frondes em roseta, arqueadas
                for (let k = 0; k < 14; k++) B.frond(g, [0, 0.12, 0], k / 14 * Math.PI * 2 + R() * 0.3, 1.0 + R() * 0.35, 0.95, 0.2, [0.22, 0.5, 0.18], [0.3, 0.6, 0.22]);
                break;
            }
            case 'roadside': {                                                             // vegetação de beira de estrada: capim com flores miúdas
                B.blades(g, 16, 0.55, 0.7, 0.05, [0.32, 0.5, 0.2], [0.5, 0.62, 0.28], R);
                const F = [[0.98, 0.98, 0.95], [0.98, 0.85, 0.2], [0.95, 0.5, 0.7], [0.65, 0.45, 0.9], [0.98, 0.55, 0.15]];
                for (let k = 0; k < 9; k++) { const a = R() * Math.PI * 2, r = R() * 0.5, y = 0.35 + R() * 0.35; B.cyl(g, [Math.cos(a) * r, 0, Math.sin(a) * r], [Math.cos(a) * r, y, Math.sin(a) * r], 0.012, 0.012, 3, [0.3, 0.45, 0.2], [0.3, 0.45, 0.2]); B.cyl(g, [Math.cos(a) * r, y, Math.sin(a) * r], [Math.cos(a) * r, y + 0.06, Math.sin(a) * r], 0.06, 0.05, 5, F[k % F.length], F[k % F.length]); }
                break;
            }
            case 'reed': B.blades(g, 22, 0.6, 1.5, 0.06, [0.4, 0.5, 0.22], [0.66, 0.68, 0.36], R); break;          // capim alto (e junco)
            case 'dry': B.blades(g, 16, 0.5, 0.95, 0.05, [0.56, 0.52, 0.28], [0.8, 0.72, 0.42], R); break;          // capim seco
            case 'tuft': B.blades(g, 16, 0.4, 0.5, 0.04, [0.28, 0.46, 0.16], [0.5, 0.64, 0.28], R); break;          // tufo de grama
            case 'capim': {                                                                // capim-colonião: touceira alta, folhas largas arqueadas, pontas secas
                B.blades(g, 26, 0.55, 1.7, 0.07, [0.3, 0.46, 0.17], [0.7, 0.68, 0.36], R);
                for (let k = 0; k < 7; k++) { const a = R() * Math.PI * 2, r = R() * 0.3, h = 1.5 + R() * 0.6, p = [Math.cos(a) * r, 0, Math.sin(a) * r]; B.blade(g, p, a, h, 0.012, 0.25, [0.5, 0.5, 0.3], [0.82, 0.74, 0.5]); }      // as hastes com a panícula
                break;
            }
            case 'rock': case 'rockB': {                                                   // pedra: bloco de granito meio enterrado, com musgo em cima
                const sq = model === 'rock' ? [1.0, 0.55, 0.8] : [0.8, 0.75, 1.0];
                B.rock(g, [0, 0.12, 0], sq, R, 1.0);
                if (R() < 0.8) B.rock(g, [0.9, 0.0, 0.5], [0.45, 0.3, 0.4], R, 0.9);
                break;
            }
            case 'parasol': {                                                              // guarda-sol de praia: mastro, copa em gomos listrados, a franja
                const C = [[0.92, 0.18, 0.15], [0.12, 0.42, 0.78], [0.98, 0.78, 0.12], [0.1, 0.6, 0.32], [0.95, 0.45, 0.1]][Math.floor(R() * 5)], W = [0.96, 0.95, 0.9];
                B.cyl(g, [0, 0, 0], [0, 2.9, 0], 0.05, 0.04, 6, [0.85, 0.85, 0.82], [0.7, 0.7, 0.68]);
                const n = 10, top = [0, 2.95, 0], rr = 1.75, rim = 2.3;
                for (let k = 0; k < n; k++) {                                              // gomos: o meio do gomo um pouco mais baixo (a lona cede)
                    const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2, am = (a0 + a1) / 2, col = k % 2 ? C : W;
                    const P0 = [Math.cos(a0) * rr, rim, Math.sin(a0) * rr], P1 = [Math.cos(a1) * rr, rim, Math.sin(a1) * rr], PM = [Math.cos(am) * rr * 0.62, rim + 0.32, Math.sin(am) * rr * 0.62];
                    for (const [a, b, c] of [[top, P0, PM], [top, PM, P1], [PM, P0, P1]]) {
                        const base = g.p.length / 3, nx = 0, ny = 1, nz = 0;
                        for (const p of [a, b, c]) B._push(g, p[0], p[1], p[2], p[0] * 0.3 + nx, ny, p[2] * 0.3 + nz, col.map((v) => v * (p === top ? 1.05 : 0.92)));
                        g.i.push(base, base + 1, base + 2);
                    }
                    const F0 = [P0[0], rim - 0.16, P0[2]], F1 = [P1[0], rim - 0.16, P1[2]], base = g.p.length / 3;      // franja
                    for (const p of [P0, P1, F1, F0]) B._push(g, p[0], p[1], p[2], Math.cos(am), 0, Math.sin(am), col.map((v) => v * 0.85));
                    g.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
                }
                break;
            }
            case 'trashpile': {                                                            // monte de lixo: sacos pretos, caixas e garrafa
                const bag = [[0.07, 0.07, 0.08], [0.12, 0.13, 0.14], [0.2, 0.28, 0.45], [0.85, 0.85, 0.82]];
                for (let k = 0; k < 6; k++) { const a = R() * 6.28, r = R() * 0.5, s = 0.28 + R() * 0.16; B.blob(g, [Math.cos(a) * r, s * 0.8 + (k > 3 ? 0.25 : 0), Math.sin(a) * r], [s, s * 0.85, s * 1.1], bag[Math.floor(R() * bag.length)], R, 0.18, 1, 'wood'); }
                for (let k = 0; k < 2; k++) { const a = R() * 6.28, r = 0.4 + R() * 0.3; B.cyl(g, [Math.cos(a) * r, 0, Math.sin(a) * r], [Math.cos(a) * r, 0.3, Math.sin(a) * r], 0.2, 0.2, 4, [0.62, 0.48, 0.3], [0.5, 0.38, 0.24]); }
                B.cyl(g, [0.55, 0.05, -0.2], [0.75, 0.08, -0.35], 0.05, 0.03, 6, [0.2, 0.55, 0.3], [0.2, 0.55, 0.3]);
                break;
            }
            case 'rubble': {                                                               // entulho: cacos de tijolo, blocos, tábuas, areia
                B.blob(g, [0, 0.05, 0], [0.75, 0.16, 0.65], [0.62, 0.56, 0.48], R, 0.25, 1, 'wood');
                for (let k = 0; k < 9; k++) {                                              // cacos: tijolo (vermelho) e bloco (cinza)
                    const a = R() * 6.28, r = R() * 0.6, y = 0.12 + R() * 0.12, brick = R() < 0.5, c0 = g.c.length;
                    B.rock(g, [Math.cos(a) * r, y, Math.sin(a) * r], [0.12 + R() * 0.08, 0.07, 0.1], R, 1);
                    const col = brick ? [0.72, 0.36, 0.22] : [0.62, 0.61, 0.58];
                    for (let q = c0; q < g.c.length; q += 4) { const v = 0.8 + 0.25 * R(); g.c[q] = col[0] * v; g.c[q + 1] = col[1] * v; g.c[q + 2] = col[2] * v; }
                }
                for (let k = 0; k < 2; k++) { const a = R() * 6.28; B.cyl(g, [Math.cos(a) * 0.6, 0.18, Math.sin(a) * 0.6], [-Math.cos(a) * 0.5, 0.3, -Math.sin(a) * 0.5], 0.05, 0.05, 4, [0.5, 0.38, 0.24], [0.42, 0.32, 0.2]); }
                break;
            }
            case 'haybale': {                                                              // fardo de feno (rolo deitado)
                B.cyl(g, [-0.62, 0.62, 0], [0.62, 0.62, 0], 0.62, 0.62, 12, [0.86, 0.72, 0.38], [0.78, 0.64, 0.32]);      // (o giro vem da instância)
                for (const s of [-1, 1]) B.blob(g, [s * 0.63, 0.62, 0], [0.05, 0.6, 0.6], [0.8, 0.66, 0.34], R, 0.05, 1, 'wood');
                break;
            }
            case 'silo': {                                                                 // silo: cilindro de chapa, o teto cônico e a escada
                B.cyl(g, [0, 0, 0], [0, 7.2, 0], 1.6, 1.6, 14, [0.78, 0.8, 0.82], [0.62, 0.64, 0.66]);
                B.cyl(g, [0, 7.2, 0], [0, 8.6, 0], 1.65, 0.12, 14, [0.7, 0.72, 0.74], [0.7, 0.72, 0.74]);
                for (let k = 1; k < 7; k++) B.cyl(g, [0, k * 1.05, 0], [0, k * 1.05 + 0.06, 0], 1.63, 1.63, 14, [0.55, 0.57, 0.6], [0.55, 0.57, 0.6]);      // os anéis da chapa
                B.cyl(g, [1.68, 0, 0.25], [1.68, 7.4, 0.25], 0.03, 0.03, 4, [0.3, 0.3, 0.32], [0.3, 0.3, 0.32]); B.cyl(g, [1.68, 0, -0.25], [1.68, 7.4, -0.25], 0.03, 0.03, 4, [0.3, 0.3, 0.32], [0.3, 0.3, 0.32]);
                break;
            }
            case 'pebbles': for (let k = 0; k < 9; k++) { const a = R() * Math.PI * 2, r = 0.2 + R() * 0.75, s = 0.08 + R() * 0.16; B.rock(g, [Math.cos(a) * r, 0, Math.sin(a) * r], [s, s * 0.7, s * 0.9], R, 0.6); } break;      // cascalho
            case 'sansevieria': {                                                          // espada-de-são-jorge: lâminas eretas com a borda amarela
                for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + R(), r = 0.12 + R() * 0.1; B.blade(g, [Math.cos(a) * r, 0, Math.sin(a) * r], a, 0.85 + R() * 0.4, 0.09, 0.08, [0.16, 0.36, 0.16], [0.62, 0.62, 0.22]); }
                break;
            }
            case 'cactus': {                                                               // mandacaru: coluna e dois braços
                const cc = [0.3, 0.5, 0.26], cd = [0.22, 0.4, 0.2];
                B.cyl(g, [0, 0, 0], [0, 2.8, 0], 0.22, 0.2, 8, cc, cd); B.blob(g, [0, 2.8, 0], [0.2, 0.12, 0.2], cc, R, 0.02, 1, 'wood');
                for (const [sx, y0, h] of [[1, 0.9, 1.3], [-1, 1.4, 1.0]]) {
                    B.cyl(g, [0, y0, 0], [sx * 0.6, y0 + 0.1, 0], 0.15, 0.15, 6, cc, cd);
                    B.cyl(g, [sx * 0.6, y0 + 0.05, 0], [sx * 0.6, y0 + h, 0], 0.15, 0.14, 6, cc, cd); B.blob(g, [sx * 0.6, y0 + h, 0], [0.14, 0.09, 0.14], cc, R, 0.02, 1, 'wood');
                }
                break;
            }
            case 'bamboo': {                                                               // bambuzal: touceira de colmos finos, arqueados, com folhas no alto
                for (let k = 0; k < 14; k++) {
                    const a = R() * Math.PI * 2, r = R() * 0.7, h = 6 + R() * 3, lean = 0.6 + R() * 1.2, bx = Math.cos(a) * r, bz = Math.sin(a) * r;
                    B.cyl(g, [bx, 0, bz], [bx + Math.cos(a) * lean, h, bz + Math.sin(a) * lean], 0.05, 0.035, 4, [0.5, 0.6, 0.24], [0.42, 0.52, 0.2]);
                    B.blob(g, [bx + Math.cos(a) * lean * 1.05, h - 0.6, bz + Math.sin(a) * lean * 1.05], [0.7, 1.1, 0.7], [0.32, 0.52, 0.2], R, 0.3, 1);
                }
                break;
            }
            case 'monstera': {                                                             // folhagens tropicais (costela-de-adão): folhas largas em hastes
                for (let k = 0; k < 8; k++) {
                    const a = k / 8 * Math.PI * 2 + R() * 0.4, l = 0.5 + R() * 0.3, top = [Math.cos(a) * 0.25, 0.5 + R() * 0.35, Math.sin(a) * 0.25];
                    B.cyl(g, [0, 0, 0], top, 0.02, 0.015, 3, [0.3, 0.45, 0.2], [0.3, 0.45, 0.2]);
                    B.frond(g, top, a, l + 0.3, 0.5, 0.42, [0.14, 0.42, 0.16], [0.2, 0.5, 0.2]);
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
            case 'araucaria': {                                                            // pinheiro-do-paraná: o candelabro — galhos em taça com tufos nas pontas
                B.cyl(g, [0, 0, 0], [0, 8.4, 0], 0.3, 0.14, 6, [0.42, 0.32, 0.24], dark);
                const cc = [0.17, 0.33, 0.16];
                for (let t = 0; t < 2; t++) for (let k = 0; k < 7; k++) {
                    const a = k / 7 * Math.PI * 2 + t * 0.45, y0 = 6.2 + t * 1.2, r = 2.8 - t * 0.9, tip = [Math.cos(a) * r, y0 + 1.0 - t * 0.2, Math.sin(a) * r];
                    B.cyl(g, [0, y0, 0], [Math.cos(a) * r * 0.6, y0 - 0.1, Math.sin(a) * r * 0.6], 0.08, 0.06, 4, [0.4, 0.3, 0.22], dark);
                    B.cyl(g, [Math.cos(a) * r * 0.6, y0 - 0.1, Math.sin(a) * r * 0.6], tip, 0.06, 0.04, 4, [0.4, 0.3, 0.22], dark);
                    B.blob(g, tip, [0.8, 0.32, 0.8], cc, R, 0.22, t === 0 && k < 2 ? sMain : 1);
                }
                B.blob(g, [0, 8.6, 0], [0.9, 0.4, 0.9], cc, R, 0.2, 1);
                break;
            }
            case 'palm': {
                const top = B.trunkCurve(g, 6.8, 0.22, 0.15, 0.9, [0.52, 0.42, 0.3], [0.36, 0.28, 0.2]);
                for (let k = 0; k < 11; k++) B.frond(g, top, k / 11 * Math.PI * 2 + R() * 0.3, 3.2 + R() * 0.7, 0.62 + R() * 0.2, 0.42 + R() * 0.25, [0.3, 0.52, 0.2], [0.24, 0.4, 0.14]);
                for (let k = 0; k < 5; k++) { const a = k * 1.3; B.blob(g, [top[0] + Math.cos(a) * 0.28, top[1] - 0.35, top[2] + Math.sin(a) * 0.28], [0.2, 0.22, 0.2], [0.42, 0.36, 0.16], R, 0.05, 1, 'wood'); }      // os cocos
                break;
            }
            case 'banana': {
                const top = B.trunkCurve(g, 1.9, 0.2, 0.16, 0.15, [0.46, 0.5, 0.28], [0.34, 0.38, 0.2]);
                for (let k = 0; k < 8; k++) B.frond(g, top, k / 8 * Math.PI * 2 + R() * 0.5, 2.0 + R() * 0.5, 0.7 + R() * 0.3, 0.6 + R() * 0.2, [0.36, 0.6, 0.22], [0.3, 0.5, 0.18]);
                B.cyl(g, [top[0] + 0.25, top[1] - 0.1, top[2]], [top[0] + 0.45, top[1] - 0.9, top[2] + 0.1], 0.16, 0.12, 6, [0.48, 0.62, 0.24], [0.4, 0.54, 0.2]);      // o cacho
                B.blob(g, [top[0] + 0.5, top[1] - 1.15, top[2] + 0.12], [0.12, 0.22, 0.12], [0.5, 0.18, 0.32], R, 0.05, 1, 'wood');                                   // o coração (a flor)
                break;
            }
        }
        if (this.RIGID.has(model)) for (let k = 3; k < g.c.length; k += 4) g.c[k] = 0.2;      // (rígido: sem vento)
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
    // CACHOS de folhagem na casca de um elipsoide (centro c, raios r): `n` bolhas de raio ~`s` espalhadas por igual (espiral de
    // Fibonacci, mais em cima que embaixo) — a copa ganha volume e contorno recortado
    clumps(g, c, r, n, s, col, R, sub = 1, mode = 'leaf') {
        for (let k = 0; k < n; k++) {
            const y = 1 - (k + 0.5) / n * 1.55, rad = Math.sqrt(Math.max(0, 1 - y * y)), a = k * 2.39996 + R() * 0.6;
            const q = s * (0.75 + 0.5 * R()) * (y < -0.2 ? 0.8 : 1);
            this.blob(g, [c[0] + Math.cos(a) * rad * r[0], c[1] + y * r[1], c[2] + Math.sin(a) * rad * r[2]], [q, q * 0.85, q], col, R, 0.22, sub, mode);
        }
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
    // PEDRA (cor sólida — alfa 0, sem o shader da folhagem): icosfera entortada por ruído, achatada `sq`, granito cinza-quente com o
    // topo esverdeado (musgo) e a base mais escura (terra encostada); `k` = claridade.
    rock(g, c, sq, R, k = 1) {
        const I = this.ico(2), base = g.p.length / 3, ph = R() * 10, tint = [0.5 + R() * 0.08, 0.48 + R() * 0.06, 0.44 + R() * 0.05];
        for (let i = 0; i < I.p.length; i += 3) {
            const x = I.p[i], y = I.p[i + 1], z = I.p[i + 2];
            const w = 1 + 0.22 * Math.sin(x * 4.1 + ph) * Math.sin(y * 3.3 + ph * 0.7) * Math.sin(z * 3.7 - ph) + (R() - 0.5) * 0.12 + (y > 0.55 ? -0.18 * (y - 0.55) : 0);      // (topo aplainado)
            const px = c[0] + x * sq[0] * w, py = c[1] + y * sq[1] * w, pz = c[2] + z * sq[2] * w;
            const moss = Math.max(0, y - 0.35) * 1.2 * (0.5 + R() * 0.5), sh = (0.62 + 0.4 * (y * 0.5 + 0.5)) * k, low = y < -0.2 ? 0.75 : 1;
            const col = [(tint[0] * (1 - moss) + 0.3 * moss) * sh * low, (tint[1] * (1 - moss) + 0.42 * moss) * sh * low, (tint[2] * (1 - moss) + 0.2 * moss) * sh * low];
            this._push(g, px, py, pz, x * sq[1] * sq[2], y * sq[0] * sq[2] + 0.15, z * sq[0] * sq[1], col);
        }
        for (const i of I.i) g.i.push(base + i);
    },
    // Lâmina (capim, espada-de-são-jorge): sai de p na direção a, sobe `h`, largura w afinando, curvando `bend` para fora.
    blade(g, p, a, h, w, bend, col, colTip) {
        const seg = 3, dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx, base = g.p.length / 3;
        for (let s = 0; s <= seg; s++) {
            const t = s / seg, ww = w * (1 - t * 0.85), c = [col[0] + (colTip[0] - col[0]) * t, col[1] + (colTip[1] - col[1]) * t, col[2] + (colTip[2] - col[2]) * t];
            const x = p[0] + dx * bend * h * t * t, y = p[1] + h * t, z = p[2] + dz * bend * h * t * t;
            this._push(g, x + px * ww, y, z + pz * ww, dx, 0.6, dz, c, this.leaf(0.6 + t * 0.6));
            this._push(g, x - px * ww, y, z - pz * ww, dx, 0.6, dz, c, this.leaf(0.6 + t * 0.6));
        }
        for (let s = 0; s < seg; s++) { const o = base + s * 2; g.i.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
    },
    // Moita de n lâminas num raio r, alturas até h.
    blades(g, n, r, h, w, col, colTip, R) {
        for (let k = 0; k < n; k++) { const a = R() * Math.PI * 2, d = Math.sqrt(R()) * r; this.blade(g, [Math.cos(a) * d * 0.5, 0, Math.sin(a) * d * 0.5], a, h * (0.55 + 0.45 * R()), w, 0.25 + R() * 0.35, col, colTip); }
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
