// ============================================================================
// CrtFilter — CRT (tube TV) look + a real reduction of the internal render resolution.
//
//   • Resolution: the internal resolution is scaled by `renderScale` through the engine's own path (Config.perf.renderScale →
//     GameEngine._applyScale → engine.setHardwareScalingLevel), so window resizes and AutoQuality keep the reduction instead of
//     undoing it. The browser upscales the smaller canvas: real fill-rate savings on high-resolution PC monitors.
//   • Post-process (one fullscreen pass, last in the camera chain): barrel distortion with black outside the tube, soft horizontal
//     scanlines locked to the output rows (no flicker), edge vignette and a light chromatic aberration that grows toward the edges.
//   • No per-frame allocations: uniforms are written in onApply from cached numbers.
//
//   const crt = CrtFilter.attach(game.camera.camera, game.gameEngine, { renderScale: 0.75 });
//   crt.setEnabled(false);   // back to the plain image (and the original resolution)
//   crt.dispose();
// `?crt=0` in the URL disables it.
// ============================================================================

const CrtFilter = {
    DEFAULTS: {
        renderScale: 0.75,      // internal resolution multiplier (1 = native); applied on top of the graphics preset
        curvature: 0.045,       // barrel distortion strength (0 = flat glass)
        scanlines: 0.16,        // darkening between scanlines (0..1)
        lineScale: 0.5,         // scanlines per output row (0.5 = one dark band every 2 rows)
        vignette: 0.32,         // edge darkening (0..1)
        aberration: 0.0016,     // chromatic aberration at the corners (UV units; 0 = off)
    },

    get disabledByUrl() {
        return typeof location !== 'undefined' && /[?&]crt=0\b/.test(location.search);
    },

    registerShader() {
        if (BABYLON.Effect.ShadersStore.crtFragmentShader) return;
        BABYLON.Effect.ShadersStore.crtFragmentShader = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D textureSampler;
            uniform vec2 screenSize;     // output size (px)
            uniform float curvature;
            uniform float scanlines;
            uniform float lineScale;
            uniform float vignette;
            uniform float aberration;

            vec2 barrel(vec2 uv) {
                vec2 c = uv * 2.0 - 1.0;
                c *= 1.0 + curvature * dot(c, c);
                return c * 0.5 + 0.5;
            }

            void main(void) {
                vec2 uv = barrel(vUV);
                if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                    return;
                }
                vec2 c = uv - 0.5;
                float edge = dot(c, c) * 4.0;
                vec3 color;
                if (aberration > 0.0) {
                    vec2 shift = c * aberration * edge;
                    color = vec3(
                        texture2D(textureSampler, uv + shift).r,
                        texture2D(textureSampler, uv).g,
                        texture2D(textureSampler, uv - shift).b
                    );
                } else {
                    color = texture2D(textureSampler, uv).rgb;
                }
                float line = 0.5 + 0.5 * cos(uv.y * screenSize.y * lineScale * 6.2831853);
                color *= 1.0 - scanlines * (1.0 - line);
                color *= 1.0 - vignette * smoothstep(0.35, 1.25, edge);
                gl_FragColor = vec4(color, 1.0);
            }`;
    },

    // camera: the scene's main camera; gameEngine: the GameEngine (owns the hardware scaling level).
    attach(camera, gameEngine, options = {}) {
        const settings = Object.assign({}, this.DEFAULTS, options);
        const filter = new CrtPass(camera, gameEngine, settings);
        if (this.disabledByUrl) filter.setEnabled(false);
        return filter;
    },
};

class CrtPass {
    constructor(camera, gameEngine, settings) {
        CrtFilter.registerShader();
        this.camera = camera;
        this.gameEngine = gameEngine;
        this.settings = settings;
        this.enabled = false;
        this.baseScale = Config.perf.renderScale || 1;
        this.postProcess = null;
        this.setEnabled(true);
    }

    setEnabled(on) {
        if (on === this.enabled) return;
        this.enabled = on;
        if (on) {
            this.baseScale = Config.perf.renderScale || 1;
            Config.perf.renderScale = this.baseScale * this.settings.renderScale;
            this.postProcess = this._createPass();
        } else {
            Config.perf.renderScale = this.baseScale;
            if (this.postProcess) this.postProcess.dispose(this.camera);
            this.postProcess = null;
        }
        this.gameEngine.resize();
    }

    _createPass() {
        const engine = this.gameEngine.engine, s = this.settings;
        const pass = new BABYLON.PostProcess(
            'crt', 'crt',
            ['screenSize', 'curvature', 'scanlines', 'lineScale', 'vignette', 'aberration'],
            null, 1.0, this.camera, BABYLON.Texture.BILINEAR_SAMPLINGMODE, engine,
        );
        pass.onApply = (effect) => {
            effect.setFloat2('screenSize', pass.width, pass.height);
            effect.setFloat('curvature', s.curvature);
            effect.setFloat('scanlines', s.scanlines);
            effect.setFloat('lineScale', s.lineScale);
            effect.setFloat('vignette', s.vignette);
            effect.setFloat('aberration', s.aberration);
        };
        return pass;
    }

    dispose() {
        this.setEnabled(false);
    }
}
