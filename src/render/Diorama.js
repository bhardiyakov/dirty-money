// ============================================================================
// Diorama — o visual "maquete / brinquedo" de city builder (low-poly moderno, estilo CityRT): cores sólidas e vivas, luz global clara,
// sombras macias e limpas, nada de textura ruidosa, câmera isométrica em perspectiva.
//
// Módulo autônomo: monta a cena inteira (câmera, luzes, sombras, céu, materiais, pós) sobre um engine qualquer. A demonstração está em
// diorama.html. Não é o visual do modo de jogo (a CompassCamera segue o personagem; ver render/Atmosphere.js): serve para um modo
// construção / editor / mapa.
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
        ip.toneMappingEnabled = true;
        ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;   // contraste de cinema sem estourar os claros
        ip.exposure = o.exposure ?? 1.0;
        ip.contrast = o.contrast ?? 1.2;
        ip.colorCurvesEnabled = true;
        const cc = new BABYLON.ColorCurves();
        cc.globalSaturation = o.saturation ?? 28;                    // o ACES dessatura: devolve as cores vivas de brinquedo
        ip.colorCurves = cc;
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
