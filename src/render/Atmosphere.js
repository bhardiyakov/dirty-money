// ============================================================================
// Atmosphere — o VISUAL MODERNO da cena (Config.render; o preset de gráficos decide o que liga — core/Graphics.js):
//   • LUZ: o sol mais quente (amarelado), o céu (HemisphericLight) azulado com o rebote do chão esverdeado e a LUZ AMBIENTE da cena
//     (scene.ambientColor, acompanhando o dia e a noite) enchendo as sombras — os materiais PBR (render/PBRWorld.js) a somam;
//   • PÓS-PROCESSAMENTO (DefaultRenderingPipeline): tone mapping ACES (contraste equilibrado, sem o verde estourado), exposição,
//     contraste, gradação de cor leve (realces quentes, sombras frias, saturação um pouco menor), bloom sutil nas luzes, FXAA (as bordas
//     serrilhadas das curvas da lagoa e das estradas; o MSAA da geometria continua em render/Smooth.js) e um sharpen leve;
//   • GLOW LAYER: o brilho das lâmpadas, faróis e lanternas (os GlowBatch 'glow') ganha um halo macio à noite;
//   • NÉVOA (FOGMODE_EXP2): neblina de distância com a cor do céu (ver CompassCamera.EDGE_FOG: o corte das bordas da tela continua);
//   • SSAO (oclusão de ambiente em espaço de tela, feita aqui porque a do Babylon só reconstrói a posição para câmera em perspectiva e a
//     do jogo é ORTOGRÁFICA inclinada): profundidade da câmera (DepthRenderer, z do espaço da câmera) → AO em meia resolução (12 amostras
//     numa espiral, normal tirada da própria profundidade) → borrão bilateral (separável) → multiplica a imagem (o 2º pós-processamento).
//     Os sprites (ShaderMaterial: personagens, efeitos) ficam de fora da profundidade: sem halos retangulares em volta deles.
//
// Os materiais escrevem a cor final em espaço GAMA (como sempre — os personagens e efeitos são ShaderMaterial que não conhecem o
// processamento de imagem): o processamento de imagem é só no pós, que converte para linear (fromLinearSpace = false), aplica a
// exposição e o ACES e volta. Por isso os StandardMaterial/PBRMaterial nunca recebem IMAGEPROCESSINGPOSTPROCESS (setupScene).
//   setupScene(ge)   (GameEngine.createScene, antes do mundo) luz ambiente, processamento de imagem, névoa
//   init(game)       (Smooth.apply, com a câmera) pipeline, glow layer e SSAO
//   grade(P) / dayNight(P)   (DayNight.apply) as cores da hora no visual moderno
// ============================================================================

const Atmosphere = {
    on: false,
    hazeDensity: 0,
    sky: { zenith: new BABYLON.Color3(0.3, 0.5, 0.78), horizon: new BABYLON.Color3(0.68, 0.78, 0.86), night: 0 },      // (reflexo na água: PBRWorld)
    pipeline: null, glow: null, ao: null,
    _glowMeshes: new Set(),

    setupScene(ge) {
        const R = Config.render;
        this.on = !!R.modern;
        if (!this.on) return;
        const sc = this.scene = ge.scene;
        this.ge = ge;
        this.hazeDensity = R.haze;
        sc.ambientColor = new BABYLON.Color3(0.1, 0.11, 0.13);
        sc.fogMode = BABYLON.Scene.FOGMODE_EXP2;
        sc.fogDensity = 0;
        // Processamento de imagem SÓ no pós: os materiais escrevem gama (ver o cabeçalho).
        const ip = sc.imageProcessingConfiguration, prep = ip.prepareDefines.bind(ip);
        ip.prepareDefines = (defines, forPostProcess = false) => { prep(defines, forPostProcess); if (!forPostProcess) defines.IMAGEPROCESSINGPOSTPROCESS = false; };
        ip.applyByPostProcess = true;
    },

    // ------------------------------------------------------------------ pipeline, glow, SSAO
    init(game) {
        if (!this.on || this.pipeline) return;
        const R = Config.render, sc = this.scene, cam = game.camera.camera, eng = sc.getEngine();
        this.game = game;
        if (R.ssao && eng.webGLVersion >= 2 && eng.getCaps().textureFloatRender) this.ao = new OrthoSSAO(sc, cam);

        const p = this.pipeline = new BABYLON.DefaultRenderingPipeline('modernLook', true, sc, [cam]);
        p.samples = 1;                                           // (o MSAA da geometria é o 1º pós-processamento: Smooth.pp)
        p.fxaaEnabled = R.fxaa !== false;
        p.bloomEnabled = !!R.bloom;
        if (p.bloomEnabled) { p.bloomThreshold = 0.8; p.bloomWeight = 0.22; p.bloomKernel = 48; p.bloomScale = 0.5; }
        p.sharpenEnabled = true;
        p.sharpen.edgeAmount = 0.18; p.sharpen.colorAmount = 1;
        p.imageProcessingEnabled = true;
        const ip = p.imageProcessing;
        ip.toneMappingEnabled = true;
        ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
        ip.exposure = R.exposure;
        ip.contrast = R.contrast;
        ip.colorCurvesEnabled = true;
        const cc = new BABYLON.ColorCurves();
        cc.globalSaturation = R.saturation;                     // (tira o verde "estourado")
        cc.highlightsHue = 38; cc.highlightsDensity = 18; cc.highlightsSaturation = 22;      // realces levemente quentes (o sol)
        cc.shadowsHue = 215; cc.shadowsDensity = 22; cc.shadowsSaturation = 18;             // sombras levemente frias (o céu)
        ip.colorCurves = cc;
        ip.vignetteEnabled = false;
        ip.ditheringEnabled = true; ip.ditheringIntensity = 1 / 255;
        // a cena chega em gama (ver o cabeçalho): o pós converte para linear antes do ACES
        const gammaIn = () => { if (p.imageProcessing) p.imageProcessing.fromLinearSpace = false; };
        gammaIn();
        p.onBuildObservable.add(gammaIn);

        if (R.glow) {
            const g = this.glow = new BABYLON.GlowLayer('modernGlow', sc, { mainTextureRatio: 0.5, blurKernelSize: 40, camera: cam });
            g.intensity = 0;
            for (const m of sc.meshes) this._maybeGlow(m);
            sc.onNewMeshAddedObservable.add((m) => this._maybeGlow(m));
        }
        if (this.ao) this.ao.attach(cam);
        console.log(`[VISUAL] moderno: PBR ${R.pbr ? 'sim' : 'não'}, árvores 3D ${R.trees3d ? 'sim' : 'não'}, sombra ${game.gameEngine.esm ? 'ESM macia' : 'PCF'}, SSAO ${this.ao ? 'sim' : 'não'}, glow ${this.glow ? 'sim' : 'não'}`);
    },

    // As luzes (GlowBatch 'glow': postes, faróis, lanternas, giroflex) entram no glow layer com o próprio material (o halo é borrado dele).
    _maybeGlow(m) {
        if (!this.glow || m._dmGlowKind !== 'glow' || this._glowMeshes.has(m)) return;
        this._glowMeshes.add(m);
        this.glow.addIncludedOnlyMesh(m);
        this.glow.referenceMeshToUseItsOwnMaterial(m);
        m.onDisposeObservable.add(() => { this._glowMeshes.delete(m); if (this.glow) { this.glow.removeIncludedOnlyMesh(m); this.glow.unReferenceMeshFromUsingItsOwnMaterial(m); } });
    },

    // ------------------------------------------------------------------ hora do dia
    // As cores da hora (DayNight._params + o tempo) no visual moderno: o sol amarelado, o céu azul com o rebote do chão esverdeado.
    grade(P) {
        const n = P.n, day = 1 - n;
        P.sunC = [P.sunC[0], P.sunC[1] * (1 - 0.04 * day), P.sunC[2] * (1 - 0.12 * day)];
        P.sunI *= 1 + 0.12 * day;
        P.hemiC = [P.hemiC[0] * (1 - 0.1 * day), P.hemiC[1] * (1 - 0.04 * day), P.hemiC[2]];
        P.gnd = [P.gnd[0] * (1 - 0.12 * day), P.gnd[1] * (1 + 0.02 * day), P.gnd[2] * (1 - 0.3 * day)];
        P.hemiI *= 0.92;
    },
    // Depois da luz aplicada: a cor da névoa (o céu perto do horizonte), a luz ambiente, o reflexo do céu na água e o glow das luzes.
    dayNight(P, ge) {
        const sc = ge.scene, c = P.clear, n = P.n, W = typeof Weather !== 'undefined' && Weather.cur ? Weather.cur.k : 0;
        const k = 0.5 * (1 - n);                                                        // de dia o horizonte é mais claro que o fundo
        const hz = [c[0] + (0.66 - c[0]) * k, c[1] + (0.76 - c[1]) * k, c[2] + (0.82 - c[2]) * k];
        sc.fogColor.set(hz[0], hz[1], hz[2]);
        if (sc.fogMode === BABYLON.Scene.FOGMODE_EXP2 && sc.fogStart < CompassCamera.NO_FOG) sc.fogDensity = this.hazeDensity * (1 + 0.9 * W + 0.35 * n);
        const a = Config.render.ambient * (0.35 + 0.65 * Math.min(1, P.hemiI / 0.46));
        sc.ambientColor.set(P.hemiC[0] * a * 0.92, P.hemiC[1] * a, P.hemiC[2] * a * 1.08);
        const S = this.sky;
        S.horizon.set(hz[0], hz[1], hz[2]);
        S.zenith.set(c[0] * 0.85 + 0.06, c[1] * 0.95 + 0.08, Math.min(1, c[2] * 1.1 + 0.16));
        S.night = n;
        if (this.glow) {
            const g = Math.max(0, Math.min(1, (n - 0.2) / 0.5));
            this.glow.intensity = 0.85 * g;
            this.glow.isEnabled = g > 0.01;
        }
    },
};

// ============================================================================
// OrthoSSAO — a oclusão de ambiente (ver Atmosphere). Funciona com a câmera ortográfica (2,5D) e com a de perspectiva (interiores).
// ============================================================================
class OrthoSSAO {
    constructor(scene, cam) {
        this.scene = scene; this.cam = cam;
        const eng = this.eng = scene.getEngine(), R = Config.render;
        this.strength = R.aoStrength; this.radius = R.aoRadius;
        this.depth = scene.enableDepthRenderer(cam, false, true, BABYLON.Texture.NEAREST_SAMPLINGMODE, true);      // (z da câmera, float 32)
        const dm = this.depthMap = this.depth.getDepthMap();
        // Fora da profundidade: sprites e efeitos (ShaderMaterial) e o que é transparente — só a geometria opaca do mundo faz sombra de contato.
        const out = [];
        dm.getCustomRenderList = (layer, list, n) => {
            out.length = 0;
            for (let i = 0; i < n; i++) {
                const m = list[i], mat = m.material;
                if (!mat || mat instanceof BABYLON.ShaderMaterial || m._dmNoAO || (mat.needAlphaBlending && mat.needAlphaBlending() && !mat.forceDepthWrite)) continue;
                out.push(m);
            }
            return out;
        };
        this.renderer = new BABYLON.EffectRenderer(eng);
        const common = { engine: eng, samplerNames: ['depthSampler'] };
        this.fxAO = new BABYLON.EffectWrapper(Object.assign({}, common, { name: 'dmSSAO', fragmentShader: OrthoSSAO.AO, uniformNames: ['proj', 'prm'] }));
        this.fxBlur = new BABYLON.EffectWrapper(Object.assign({}, common, { name: 'dmSSAOBlur', fragmentShader: OrthoSSAO.BLUR, uniformNames: ['dir', 'zTol'], samplerNames: ['depthSampler', 'aoSampler'] }));
        this.rtA = this.rtB = null;
        this._size(true);
        // Só recalcula quando a profundidade foi desenhada de fato neste quadro (uma malha nova ainda compilando o shader faz o Babylon
        // pular a passada): senão fica o AO do quadro anterior.
        dm.onAfterRenderObservable.add(() => { this._fresh = true; });
        dm.onAfterUnbindObservable.add(() => { if (this._fresh) this._compute(); this._fresh = false; });
        eng.onResizeObservable.add(() => this._size());
    }

    _size(force) {
        const w = Math.max(1, this.eng.getRenderWidth() >> 1), h = Math.max(1, this.eng.getRenderHeight() >> 1);
        if (!force && this.rtA && this.rtA.getSize().width === w && this.rtA.getSize().height === h) return;
        const mk = (n) => {
            const t = new BABYLON.RenderTargetTexture(n, { width: w, height: h }, this.scene, false, true, BABYLON.Constants.TEXTURETYPE_UNSIGNED_BYTE, false, BABYLON.Texture.BILINEAR_SAMPLINGMODE, false);
            t.wrapU = t.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
            return t;
        };
        if (this.rtA) { this.rtA.dispose(); this.rtB.dispose(); }
        this.rtA = mk('dmSSAO_A'); this.rtB = mk('dmSSAO_B');
        const dm = this.depthMap, W = this.eng.getRenderWidth(), H = this.eng.getRenderHeight();
        if (dm.getSize().width !== W || dm.getSize().height !== H) dm.resize({ width: W, height: H });
    }

    // Logo depois da passada de profundidade: AO em meia resolução e o borrão bilateral (horizontal, vertical), fora da cadeia da câmera.
    _compute() {
        if (!this.fxAO.effect.isReady() || !this.fxBlur.effect.isReady()) return;
        const cam = this.cam, ortho = cam.mode === BABYLON.Camera.ORTHOGRAPHIC_CAMERA, dm = this.depthMap;
        const W = dm.getSize().width, H = dm.getSize().height;
        let px, py;
        if (ortho) { px = cam.orthoRight; py = cam.orthoTop; } else { py = Math.tan(cam.fov / 2); px = py * this.eng.getAspectRatio(cam); }
        const aoRadius = this.radius * (ortho ? Math.max(0.7, Math.min(1.6, py / 18)) : 1);
        this.fxAO.onApplyObservable.addOnce(() => {
            const e = this.fxAO.effect;
            e.setTexture('depthSampler', dm);
            e.setFloat4('proj', px, py, ortho ? 1 : 0, aoRadius);
            e.setFloat4('prm', 1.6, 0.04 * aoRadius, 1 / W, 1 / H);
        });
        this.renderer.render(this.fxAO, this.rtA);
        const tol = ortho ? 1.2 : 0.6;
        this.fxBlur.onApplyObservable.addOnce(() => { const e = this.fxBlur.effect; e.setTexture('depthSampler', dm); e.setTexture('aoSampler', this.rtA); e.setFloat2('dir', 1 / this.rtA.getSize().width, 0); e.setFloat('zTol', tol); });
        this.renderer.render(this.fxBlur, this.rtB);
        this.fxBlur.onApplyObservable.addOnce(() => { const e = this.fxBlur.effect; e.setTexture('depthSampler', dm); e.setTexture('aoSampler', this.rtB); e.setFloat2('dir', 0, 1 / this.rtA.getSize().height); e.setFloat('zTol', tol); });
        this.renderer.render(this.fxBlur, this.rtA);
        this.ready = true;
    }

    // O AO multiplica a imagem logo depois do MSAA (Smooth.pp), antes do bloom e do tone mapping.
    attach(cam) {
        if (!BABYLON.Effect.ShadersStore.dmSSAOCombineFragmentShader) BABYLON.Effect.ShadersStore.dmSSAOCombineFragmentShader = OrthoSSAO.COMBINE;
        const pp = this.pp = new BABYLON.PostProcess('dmSSAOCombine', 'dmSSAOCombine', ['strength'], ['aoSampler'], 1.0, null, BABYLON.Texture.BILINEAR_SAMPLINGMODE, this.eng);
        pp.onApply = (e) => { e.setTexture('aoSampler', this.rtA); e.setFloat('strength', this.ready ? this.strength : 0); };
        const first = typeof Smooth !== 'undefined' && Smooth.pp && cam._postProcesses[0] === Smooth.pp;
        cam.attachPostProcess(pp, first ? 1 : 0);
    }
}

OrthoSSAO.AO = `
precision highp float;
varying vec2 vUV;
uniform sampler2D depthSampler;
uniform vec4 proj;
uniform vec4 prm;
vec3 vpos(vec2 uv) {
    float z = texture2D(depthSampler, uv).r;
    vec2 n = uv * 2.0 - 1.0;
    return proj.z > 0.5 ? vec3(n * proj.xy, z) : vec3(n * proj.xy * z, z);
}
void main(void) {
    vec3 P = vpos(vUV);
    if (P.z > 1e6) { gl_FragColor = vec4(1.0); return; }
    vec2 t = prm.zw;
    vec3 pr = vpos(vUV + vec2(t.x, 0.0)), pl = vpos(vUV - vec2(t.x, 0.0)), pu = vpos(vUV + vec2(0.0, t.y)), pd = vpos(vUV - vec2(0.0, t.y));
    vec3 dx = abs(pr.z - P.z) < abs(P.z - pl.z) ? pr - P : P - pl;
    vec3 dy = abs(pu.z - P.z) < abs(P.z - pd.z) ? pu - P : P - pd;
    vec3 cr = cross(dx, dy);
    if (dot(cr, cr) < 1e-14) { gl_FragColor = vec4(1.0); return; }
    vec3 N = normalize(cr);
    if (N.z > 0.0) N = -N;
    float R = proj.w, R2 = R * R;
    vec2 ruv = proj.z > 0.5 ? R / proj.xy * 0.5 : R / (proj.xy * P.z) * 0.5;
    float ang = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float occ = 0.0;
    for (int i = 0; i < 12; i++) {
        float fi = (float(i) + 0.5) / 12.0;
        float a = ang + fi * 16.336;
        vec3 S = vpos(clamp(vUV + vec2(cos(a), sin(a)) * fi * ruv, vec2(0.001), vec2(0.999)));
        vec3 v = S - P;
        float vv = dot(v, v), vn = dot(v, N), f = max(R2 - vv, 0.0);
        occ += f * f * f * max((vn - prm.y) / (0.01 + vv), 0.0);
    }
    float ao = clamp(1.0 - occ * prm.x / (R2 * R2 * R2) * (5.0 / 12.0), 0.0, 1.0);
    if (!(ao >= 0.0)) ao = 1.0;
    gl_FragColor = vec4(vec3(ao), 1.0);
}`;
OrthoSSAO.BLUR = `
precision highp float;
varying vec2 vUV;
uniform sampler2D depthSampler;
uniform sampler2D aoSampler;
uniform vec2 dir;
uniform float zTol;
void main(void) {
    float z0 = texture2D(depthSampler, vUV).r, sum = 0.0, wsum = 0.0;
    for (int i = -4; i <= 4; i++) {
        vec2 uv = vUV + dir * float(i) * 1.5;
        float z = texture2D(depthSampler, uv).r;
        float w = exp(-float(i * i) / 9.0) * max(0.0, 1.0 - abs(z - z0) / zTol);
        sum += texture2D(aoSampler, uv).r * w; wsum += w;
    }
    gl_FragColor = vec4(vec3(wsum > 0.0 ? sum / wsum : 1.0), 1.0);
}`;
OrthoSSAO.COMBINE = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D aoSampler;
uniform float strength;
void main(void) {
    vec4 c = texture2D(textureSampler, vUV);
    float ao = texture2D(aoSampler, vUV).r;
    if (!(ao >= 0.0 && ao <= 1.0)) ao = 1.0;
    c.rgb *= mix(1.0, ao, strength);
    gl_FragColor = c;
}`;
