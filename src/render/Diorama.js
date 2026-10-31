// ============================================================================
// Diorama — o visual "maquete / brinquedo" de city builder (low-poly moderno, estilo CityRT): cores sólidas e vivas, luz global clara,
// sombras macias e limpas, nada de textura ruidosa, câmera isométrica em perspectiva.
//
// Duas formas de uso:
//   • CENA AUTÔNOMA (create): câmera ArcRotate de city builder, luzes, sombras, céu, materiais e pós sobre um engine qualquer —
//     a demonstração está em diorama.html;
//   • O MAPA DO JOGO (Config.render.style = 'diorama', o padrão do visual moderno): o WorldBuilder, o TerrainSplat, as árvores 3D e a
//     água constroem os materiais por surface() / terrainPalette() / treeColor(); a luz da hora passa por grade() e o pós por
//     imageProcessing() (render/Atmosphere.js). A câmera do jogo (CompassCamera, ortográfica, presa ao personagem) continua: o AO
//     do jogo é o OrthoSSAO (o SSAO2 só funciona em perspectiva).
//
//   const D = Diorama.create(engine, canvas, { target, radius, shadowSize: 4096 });
//   const m = D.mat('#6cc04a');                    // PBR fosco de cor sólida (cacheado por cor + opções)
//   D.caster(mesh)                                 // projeta e recebe sombra
//   D.flat(mesh)                                   // facetas à mostra (relevo low-poly)
//   D.water(mesh)                                  // água turquesa translúcida, lisa, com o reflexo do céu
//   D.terrain(name, size, subdivisions, heightFn, colorFn)   // morro low-poly com cor por vértice e facetas
//
// O que o Babylon 6 tem de verdade (e o que muda em relação a uma "receita" genérica):
//   • DefaultRenderingPipeline NÃO tem SSAO (pipeline.samples é o MSAA). O SSAO é o SSAO2RenderingPipeline, criado ANTES do pipeline padrão
//     para o AO entrar antes do tone mapping; o MSAA da cena vai nele (textureSamples / prePassRenderer.samples).
//   • SSAO2 só reconstrói a posição em câmera de PERSPECTIVA: por isso a ArcRotateCamera é perspectiva de FOV estreito ("quase isométrica").
//   • Material não tem `flatShading`: facetas = geometria com normais por face (mesh.convertToFlatShadedMesh(), em flat()).
//   • PBRMaterial.albedoColor é LINEAR: as cores em hex (gama, como o designer vê) passam por toLinearSpace().
//   • O fundo (clearColor) também entra no tone mapping do pós: ele é posto em linear, igual à névoa, para o horizonte casar com o céu.
// ============================================================================

const Diorama = {
    // Paleta de brinquedo (gama/sRGB, como no editor de cor).
    PALETTE: {
        sky: '#9fd3f2', grass: '#7cc957', grassDark: '#5fae43', asphalt: '#5a6270', sidewalk: '#d9d4c7', line: '#f4f1e6',
        water: '#2cc6c9', sand: '#efd9a2', dirt: '#c9a06c', rock: '#a7a49c', trunk: '#8a5a3b', leaf: '#4fb548', leafLight: '#7ed35c',
        roof: ['#e8604c', '#f2a541', '#4a90d9', '#7c6fd6', '#3fb39b'], wall: ['#f6efe3', '#ffd9a8', '#cfe6f7', '#f2c4c4', '#e3e8d0', '#d9d2f0'],
    },

    // ================================================================== O MAPA DO JOGO no visual de maquete
    get on() { const R = typeof Config !== 'undefined' && Config.render; return !!(R && R.modern && R.style === 'diorama'); },
    // Cada superfície do mapa (pelo nome do material do WorldBuilder) numa cor sólida da paleta. O que não está aqui (telhados, fachadas,
    // casas de máquinas) sai da COR MÉDIA da própria textura (tex._dmAvg, calculada quando ela é pintada), avivada: a cidade continua com
    // os seus telhados laranja, azuis e de zinco, só que lisos.
    SURFACE: {
        road: '#545d6b', asphalt: '#545d6b', road_dirt: '#c9a06c', sidewalk: '#dcd6c8', plaza: '#e4ddcc', concrete: '#cfc9bd', curb: '#eeeae0',
        grass: '#8cc265', sand: '#efd9a2', dirt: '#cfa877', earth: '#d0a272', rock: '#a7a49c', water: '#2bbfc4',
        corcovadoHill: '#7fb85e', paoDeAcucar: '#b3ab9d',
    },
    // Ficam com a textura (são informação, não ruído): faixas de pedestre, letreiros e vitrines das lojas.
    KEEP: /^(zebra|shop|stadiumPitch|hsGlass|hsDoor)$/,
    // Os tipos de chão do terreno do mundo grande (TerrainSplat.IDS) — a mesma família de cores.
    TERRAIN: { sand: '#efd9a2', grass: '#8cc265', forest: '#62a352', scrub: '#b2bd6a', rock: '#aaa69e', swamp: '#76a06c', earth: '#d0a272',
        farm0: '#bb8b5a', farm1: '#8ccf52', farm2: '#e9cb5c' },
    // Folhagem das árvores 3D (Trees3D: a cor de cada modelo).
    TREES: { oak: '#57a84a', juca: '#63b45a', orchard: '#74bf58', jungle: '#4a9646', ipe: '#ec86c0', ipeY: '#f2cf4a', pine: '#3a8550',
        cypress: '#3e8752', araucaria: '#387b48', palm: '#5daa4c', banana: '#7fbd55', bush: '#5fab4c', trunk: '#8a5a3b' },
    // Luz do jogo na maquete: as luzes da cena continuam as do DayNight (calibradas para os sprites e os StandardMaterial); os materiais
    // da maquete multiplicam a luz direta por DIRECT (PBRMaterial.directIntensity) — o mesmo balanço céu/sol da cena autônoma.
    GAME: { direct: 2.3, shadowBase: 0.12, exposure: 1.0, contrast: 1.18, saturation: 12, haze: 0.0028, aoStrength: 0.85, aoRadius: 2.8 },

    // Hex da paleta → Color3 linear (o PBR guarda o albedo em linear).
    lin(hex) { return BABYLON.Color3.FromHexString(hex).toLinearSpace(); },
    // Cor média de uma textura (gama) mais viva e limpa: saturação para cima, sem extremos de claro/escuro.
    vivid(rgb) {
        const c = new BABYLON.Color3(rgb[0], rgb[1], rgb[2]), hsv = c.toHSV();
        const s = Math.min(1, hsv.g * 1.45 + 0.04), v = Math.max(0.35, Math.min(0.95, hsv.b * 1.08 + 0.04));
        return BABYLON.Color3.FromHSV(hsv.r, s, v);
    },
    colorOf(name, tex, opts = {}) {
        const k = name.replace(/^(x|b)(?=road|sidewalk|curb|rock|solid)/, '').replace(/^blend_/, '');
        if (this.SURFACE[k]) return this.lin(this.SURFACE[k]);
        if (tex && tex._dmAvg) return this.vivid(tex._dmAvg).toLinearSpace();
        if (opts.color) return this.vivid(BABYLON.Color3.FromHexString(opts.color).asArray()).toLinearSpace();
        return null;                                        // (peças de cor por vértice: o branco do material vezes a cor do vértice)
    },

    // O material de uma superfície do mapa (WorldBuilder._mat, TerrainSplat, Trees3D): PBR fosco (metallic 0; rugosidade 0,85 — 0,7 nos
    // telhados, 0,1 na água), a cor sólida por cima da textura (que fica só para as UVs: janelas, plugins), sem mapa de normais nem
    // variação ruidosa. opts: { alphaTest, color, windows (o ladrilho das janelas: vidro de dia), solid: false (a cor vem de outro plugin) }.
    surface(scene, name, tex, opts = {}) {
        const pr = PBRWorld.profile(name), m = new BABYLON.PBRMaterial(name, scene);
        m.metallic = 0;
        m.roughness = pr.water ? 0.1 : /^(x|b)?(roof_|machtop)/.test(name) ? 0.7 : 0.88;
        m.albedoColor = BABYLON.Color3.White();
        if (tex) m.albedoTexture = tex;
        m.directIntensity = this.GAME.direct;
        m.specularIntensity = pr.water ? 1 : 0.45;
        m.environmentIntensity = 0;
        m.ambientColor = BABYLON.Color3.Black();
        if (opts.alphaTest) {
            tex.hasAlpha = true;
            m.useAlphaFromAlbedoTexture = true;
            m.transparencyMode = BABYLON.Material.MATERIAL_ALPHATEST;
            m.alphaCutOff = 0.5;
        }
        PBRWorld.alias(m);
        PBRWorld.detail(m, Object.assign({}, pr, { mv: 0, tint: null, n: null }));      // (luz ambiente, cor por vértice em gama, ondas e céu na água)
        const keep = this.KEEP.test(name);
        if (keep && opts.color) m.albedoColor = BABYLON.Color3.FromHexString(opts.color).toLinearSpace();
        if (!keep && opts.solid !== false) {
            const c = this.colorOf(name, tex, opts);
            if (c) this.solid(m, c, opts.windows || null);
        }
        return m;
    },

    // Plugin da cor sólida: troca o albedo da textura pela cor (vezes a cor por vértice, se houver) e, nas fachadas, desenha as janelas
    // do ladrilho como vidro escuro (de noite elas acendem: render/WindowLights.js).
    solid(material, color, windows) {
        if (!this._solidCls) this._solidCls = this._makeSolid();
        return new this._solidCls(material, color, windows);
    },
    _makeSolid() {
        return class DioramaSolidPlugin extends BABYLON.MaterialPluginBase {
            constructor(m, color, win) {
                super(m, 'DioramaSolid', 95, { DMSOLID: false, DMWIN: false });
                this.c = color; this.win = win;
                this._enable(true);
            }
            getClassName() { return 'DioramaSolidPlugin'; }
            prepareDefines(d) { d.DMSOLID = true; d.DMWIN = !!this.win; }
            getSamplers(s) { s.push('dmWin'); }
            getUniforms() { return { ubo: [{ name: 'dmSolid', size: 4, type: 'vec4' }], fragment: 'uniform vec4 dmSolid;' }; }
            bindForSubMesh(ub) { ub.updateFloat4('dmSolid', this.c.r, this.c.g, this.c.b, 1); if (this.win) ub.setTexture('dmWin', this.win); }
            getCustomCode(type) {
                if (type !== 'fragment') return null;
                // (sem ponto e vírgula em comentário GLSL: o Babylon corta a linha ali)
                return {
                    CUSTOM_FRAGMENT_DEFINITIONS: `
                        #ifdef DMWIN
                        uniform sampler2D dmWin;
                        #endif`,
                    CUSTOM_FRAGMENT_UPDATE_ALPHA: `
                        #ifdef DMSOLID
                        surfaceAlbedo = dmSolid.rgb;
                        #if defined(VERTEXCOLOR) || defined(INSTANCESCOLOR) && defined(INSTANCES)
                        surfaceAlbedo *= vColor.rgb;
                        #endif
                        #if defined(DMWIN) && defined(ALBEDO)
                        {
                            vec3 dw = texture2D(dmWin, vAlbedoUV).rgb;
                            float dk = smoothstep(0.06, 0.25, max(dw.r, max(dw.g, dw.b)));
                            surfaceAlbedo = mix(surfaceAlbedo, vec3(0.045, 0.07, 0.1), dk * 0.88);
                        }
                        #endif
                        #endif`,
                };
            }
        };
    },

    // GLSL: a cor de cada tipo de chão do terreno (índice em TerrainSplat.IDS), em gama — o TerrainSplat mistura as divisas como sempre.
    terrainPalette(ids) {
        const f = (v) => v.toFixed(4), rows = ids.map((k, i) => {
            const c = BABYLON.Color3.FromHexString(this.TERRAIN[k] || this.TERRAIN.grass);
            return `if (id < ${i}.5) return vec3(${f(c.r)}, ${f(c.g)}, ${f(c.b)});`;
        });
        return `vec3 tPal(float id) {\n${rows.join('\n')}\nreturn vec3(0.5);\n}`;
    },
    treeColor(model) { const h = this.TREES[model]; return h ? BABYLON.Color3.FromHexString(h).asArray() : null; },

    // A luz da hora na maquete (DayNight → Atmosphere.grade): de dia o céu é azul-claro, o rebote do chão esverdeado/terroso e o sol quente;
    // o fundo (e a névoa, que sai dele) fica azul-celeste. De noite, o DayNight manda.
    grade(P) {
        const day = 1 - P.n, mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
        P.hemiC = mix(P.hemiC, [0.82, 0.91, 1.0], 0.8 * day);
        P.gnd = mix(P.gnd, [0.46, 0.5, 0.36], 0.8 * day);
        P.sunC = mix(P.sunC, [1.0, 0.94, 0.84], 0.6 * day);
        P.clear = mix(P.clear, [0.62, 0.83, 0.95], 0.85 * day);
    },
    // O processamento de imagem da maquete (o da cena autônoma e o do jogo): ACES de contraste firme, cores vivas de brinquedo.
    imageProcessing(ip, o = {}) {
        ip.toneMappingEnabled = true;
        ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;   // contraste de cinema sem estourar os claros
        ip.exposure = o.exposure ?? 1.0;
        ip.contrast = o.contrast ?? 1.2;
        ip.colorCurvesEnabled = true;
        const cc = new BABYLON.ColorCurves();
        cc.globalSaturation = o.saturation ?? 28;                    // o ACES dessatura: devolve as cores vivas de brinquedo
        ip.colorCurves = cc;
    },

    // ================================================================== CENA AUTÔNOMA
    // o: { target, alpha, beta, radius, fov, minBeta, maxBeta, minRadius, maxRadius, panLimit, hemi, sun, shadowSize, contactHardening,
    //      sky, fog, ssao, aoRadius, aoStrength, msaa, exposure, contrast, saturation, bloom }
    create(engine, canvas, o = {}) {
        const scene = new BABYLON.Scene(engine), D = { scene, engine, _mats: new Map() };
        D.sky = BABYLON.Color3.FromHexString(o.sky || this.PALETTE.sky);
        this._sky(D, o);
        D.camera = this._camera(D, canvas, o);
        this._lights(D, o);
        this._pipeline(D, o);
        D.mat = (color, opts) => this.material(D, color, opts);
        D.caster = (mesh, receive = true) => { D.shadows.addShadowCaster(mesh, true); for (const m of [mesh, ...mesh.getChildMeshes()]) m.receiveShadows = receive; return mesh; };
        D.flat = (mesh) => this.flat(mesh);
        D.water = (mesh, opts) => this.water(D, mesh, opts);
        D.terrain = (...a) => this.terrain(D, ...a);
        return D;
    },

    // ------------------------------------------------------------------ 1. câmera de city builder
    // ArcRotateCamera presa: beta (ângulo a partir da vertical) entre 30° e 60° — sempre de cima para baixo —, giro livre em volta,
    // zoom e pan com inércia (pan no plano do chão: mapPanning), alvo preso a uma área (panningDistanceLimit).
    _camera(D, canvas, o) {
        const deg = Math.PI / 180, tgt = o.target || BABYLON.Vector3.Zero();
        const cam = new BABYLON.ArcRotateCamera('cityCam', o.alpha ?? -Math.PI / 4, o.beta ?? 52 * deg, o.radius ?? 90, tgt.clone(), D.scene);
        cam.fov = o.fov ?? 0.6;                         // FOV estreito: pouca distorção de perspectiva, "quase isométrico"
        cam.lowerBetaLimit = (o.minBeta ?? 30) * deg;
        cam.upperBetaLimit = (o.maxBeta ?? 60) * deg;
        cam.lowerRadiusLimit = o.minRadius ?? 25;
        cam.upperRadiusLimit = o.maxRadius ?? 220;
        cam.minZ = 1; cam.maxZ = 2000;
        cam.inertia = 0.88;                             // giro e zoom deslizam e param devagar
        cam.panningInertia = 0.88;
        cam.wheelDeltaPercentage = 0.012;               // zoom proporcional à distância (suave perto e longe)
        cam.pinchDeltaPercentage = 0.004;
        cam.panningSensibility = 60;
        cam.mapPanning = true;                          // pan desliza no plano XZ (o alvo nunca sobe nem afunda)
        cam.panningOriginTarget.copyFrom(tgt);
        cam.panningDistanceLimit = o.panLimit ?? 160;
        cam.angularSensibilityX = cam.angularSensibilityY = 1600;
        if (cam.inputs.attached.pointers) cam.inputs.attached.pointers.buttons = [0, 1, 2];   // esquerdo gira, direito/meio arrasta
        cam.attachControl(canvas, true);
        return cam;
    },

    // ------------------------------------------------------------------ 2. luz brilhante e estilizada
    _lights(D, o) {
        const sc = D.scene;
        const hemi = D.hemi = new BABYLON.HemisphericLight('skyLight', new BABYLON.Vector3(0, 1, 0), sc);
        hemi.intensity = o.hemi ?? 0.85;
        hemi.diffuse = new BABYLON.Color3(0.82, 0.91, 1.0);        // céu azul-claro
        hemi.groundColor = new BABYLON.Color3(0.46, 0.5, 0.36);    // rebote do chão: esverdeado / terroso
        hemi.specular = BABYLON.Color3.Black();                    // (sem brilho chapado do céu: o brilho é só o do sol)

        const sun = D.sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-1, -2, -1).normalize(), sc);
        sun.intensity = o.sun ?? 1.7;                               // (o ACES satura acima de ~2: mais sol que isso apaga a sombra)
        sun.diffuse = new BABYLON.Color3(1.0, 0.94, 0.84);         // levemente quente
        sun.specular = new BABYLON.Color3(1.0, 0.94, 0.84);
        // A janela da sombra (ortográfica) segue o alvo da câmera, do tamanho do que se vê: resolução onde se olha. O "sol" fica a
        // SUN_DIST do alvo e a profundidade cobre do topo dos prédios ao chão (Z explícito: com o Z da câmera, 1–2000 u, o bias do PCF
        // virava metros e a sombra sumia).
        const SUN_DIST = 220;
        sun.autoUpdateExtends = false;
        sun.shadowMinZ = SUN_DIST - 180;
        sun.shadowMaxZ = SUN_DIST + 140;
        const follow = () => {
            const t = D.camera.target;
            sun.shadowFrustumSize = Math.max(90, Math.min(420, D.camera.radius * 2.2));
            sun.position.copyFrom(t).subtractInPlace(sun.direction.scale(SUN_DIST));
        };
        follow();
        sc.onBeforeRenderObservable.add(follow);

        // Sombra limpa e macia: PCF de alta qualidade (ou PCSS: borda que endurece no contato) num mapa grande; bias + normalBias contra acne.
        const sg = D.shadows = new BABYLON.ShadowGenerator(o.shadowSize ?? 4096, sun);
        if (o.contactHardening) {
            sg.useContactHardeningShadow = true;
            sg.contactHardeningLightSizeUVRatio = 0.04;
        } else sg.usePercentageCloserFiltering = true;
        sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
        sg.bias = 0.0015;
        sg.normalBias = 0.03;
        sg.setDarkness(0);                                          // na sombra só falta o sol: o que sobra é o céu azulado (nunca preto)
        sg.transparencyShadow = true;
    },

    // ------------------------------------------------------------------ 5. céu e fundo
    // Cor sólida de céu e névoa EXP da mesma cor: o chão longe se funde com o horizonte. Ambos em linear (o pós converte de volta).
    _sky(D, o) {
        const sc = D.scene, lin = D.sky.toLinearSpace();
        sc.clearColor = new BABYLON.Color4(lin.r, lin.g, lin.b, 1);
        sc.ambientColor = new BABYLON.Color3(0.08, 0.09, 0.1);
        sc.fogMode = BABYLON.Scene.FOGMODE_EXP;
        sc.fogDensity = o.fog ?? 0.0011;                            // (a 120 u — a distância de trabalho — ~12%: só o horizonte some)
        sc.fogColor = D.sky.clone();                                // (o PBR passa a névoa para linear sozinho; o fundo já está em linear)
        // o reflexo da água: um cubo de céu de 16 px em degradê (zênite → horizonte → chão), sem foto nenhuma
        D.skyCube = this._skyCube(sc, D.sky);
    },
    _skyCube(scene, sky) {
        const N = 16, zen = BABYLON.Color3.FromHexString('#5fa8e6'), hor = sky, gnd = new BABYLON.Color3(0.5, 0.62, 0.55);
        const px = (c) => [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), 255];
        const face = (fn) => { const d = new Uint8Array(N * N * 4); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) d.set(px(fn(x / (N - 1), y / (N - 1))), (y * N + x) * 4); return d; };
        const side = face((u, v) => BABYLON.Color3.Lerp(zen, hor, Math.pow(v, 1.6)));
        const faces = [side, side, face(() => zen), face(() => gnd), side, side];     // +x −x +y −y +z −z
        const t = new BABYLON.RawCubeTexture(scene, faces, N, BABYLON.Constants.TEXTUREFORMAT_RGBA, BABYLON.Constants.TEXTURETYPE_UNSIGNED_BYTE, true);
        t.gammaSpace = true;
        return t;
    },

    // ------------------------------------------------------------------ 4. pós-processamento: a "mágica" da maquete
    _pipeline(D, o) {
        const sc = D.scene, cam = D.camera, eng = D.engine, msaa = Math.min(o.msaa ?? 4, eng.getCaps().maxMSAASamples || 1);
        // SSAO PRIMEIRO (o AO multiplica a cena antes do tone mapping). Raio na escala dos prédios: escurece a junção prédio/chão,
        // os cantos entre prédios e embaixo das copas — o que dá o ar de miniatura.
        if (o.ssao !== false && eng.webGLVersion >= 2) {
            const ao = D.ssao = new BABYLON.SSAO2RenderingPipeline('diorama-ssao', sc, { ssaoRatio: 0.75, blurRatio: 1 }, [cam]);
            ao.radius = o.aoRadius ?? 4;
            ao.totalStrength = o.aoStrength ?? 2.0;
            ao.base = 0.08;                                          // (nunca preto: maquete clara)
            ao.samples = 16;
            ao.maxZ = 600;
            ao.minZAspect = 0.4;
            ao.expensiveBlur = true;
            ao.bilateralSamples = 16; ao.bilateralSoften = 0.5; ao.bilateralTolerance = 0.2;
            ao.textureSamples = msaa;                                // MSAA da cena (é nele que a cena é desenhada)
            if (sc.prePassRenderer) sc.prePassRenderer.samples = msaa;
        }
        const p = D.pipeline = new BABYLON.DefaultRenderingPipeline('diorama', true, sc, [cam]);
        if (!D.ssao) p.samples = msaa;
        p.fxaaEnabled = true;                                        // sem serrilhado nas bordas finas (faixas, meio-fio, copas)
        p.imageProcessingEnabled = true;
        const ip = p.imageProcessing;
        this.imageProcessing(ip, o);
        ip.vignetteEnabled = true; ip.vignetteWeight = 0.9; ip.vignetteStretch = 0.3; ip.vignetteColor = new BABYLON.Color4(0.12, 0.2, 0.3, 0);
        p.bloomEnabled = !!o.bloom;                                  // (desligado: maquete de dia não brilha; ligue para luzes à noite)
        p.sharpenEnabled = true; p.sharpen.edgeAmount = 0.15;
    },

    // ------------------------------------------------------------------ 3. materiais: plástico fosco / argila
    // PBR de cor sólida (sem textura). opts: { roughness (0.85), metallic (0), emissive (hex), alpha, flatShadedLook }.
    material(D, color, opts = {}) {
        const key = color + JSON.stringify(opts);
        if (D._mats.has(key)) return D._mats.get(key);
        const m = new BABYLON.PBRMaterial('toy_' + color.replace('#', '') + '_' + D._mats.size, D.scene);
        m.albedoColor = BABYLON.Color3.FromHexString(color).toLinearSpace();
        m.metallic = opts.metallic ?? 0.0;
        m.roughness = opts.roughness ?? 0.85;
        m.environmentIntensity = 0;                                  // (luz só das lâmpadas: o céu é a HemisphericLight)
        m.specularIntensity = opts.specular ?? 0.6;
        if (opts.emissive) m.emissiveColor = BABYLON.Color3.FromHexString(opts.emissive).toLinearSpace();
        if (opts.vertexColors) m.albedoColor = BABYLON.Color3.White();
        D._mats.set(key, m);
        return m;
    },

    // Água: turquesa sólida, lisa (roughness 0,1), um pouco transparente, com o reflexo do céu em degradê e o brilho do sol.
    water(D, mesh, opts = {}) {
        const m = new BABYLON.PBRMaterial('toyWater', D.scene);
        m.albedoColor = BABYLON.Color3.FromHexString(opts.color || this.PALETTE.water).toLinearSpace();
        m.metallic = 0; m.roughness = opts.roughness ?? 0.1;
        m.alpha = opts.alpha ?? 0.82;
        m.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
        m.reflectionTexture = D.skyCube;
        m.environmentIntensity = 0.9;
        m.useRadianceOverAlpha = true;                               // o reflexo não fica transparente
        m.useSpecularOverAlpha = true;
        mesh.material = m;
        mesh.receiveShadows = true;
        return m;
    },

    // Facetas à mostra: uma normal por face (o material não tem "flatShading"; a geometria é que decide).
    flat(mesh) { mesh.convertToFlatShadedMesh(); return mesh; },

    // Morro / relevo low-poly: grade size × size com `subdivisions` cortes, altura heightFn(x, z), cor colorFn(x, z, y) → hex; facetado.
    terrain(D, name, size, subdivisions, heightFn, colorFn) {
        const g = BABYLON.MeshBuilder.CreateGround(name, { width: size, height: size, subdivisions, updatable: true }, D.scene);
        const pos = g.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        for (let i = 0; i < pos.length; i += 3) pos[i + 1] = heightFn(pos[i], pos[i + 2]);
        g.updateVerticesData(BABYLON.VertexBuffer.PositionKind, pos);
        this.flat(g);                                                // (duplica os vértices: cada face com a sua cor e normal)
        const P = g.getVerticesData(BABYLON.VertexBuffer.PositionKind), cols = new Float32Array(P.length / 3 * 4);
        for (let i = 0; i < P.length; i += 9) {                      // uma cor por triângulo (pelo centro dele)
            const cx = (P[i] + P[i + 3] + P[i + 6]) / 3, cy = (P[i + 1] + P[i + 4] + P[i + 7]) / 3, cz = (P[i + 2] + P[i + 5] + P[i + 8]) / 3;
            const c = BABYLON.Color3.FromHexString(colorFn(cx, cz, cy)).toLinearSpace();
            for (let k = 0; k < 3; k++) cols.set([c.r, c.g, c.b, 1], (i / 3 + k) * 4);
        }
        g.setVerticesData(BABYLON.VertexBuffer.ColorKind, cols);
        g.material = this.material(D, '#ffffff', { vertexColors: true, roughness: 0.95 });
        g.receiveShadows = true;
        return g;
    },
};
