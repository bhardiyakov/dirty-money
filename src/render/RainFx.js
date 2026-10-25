// ============================================================================
// RainFx — the rain INSIDE the 3D scene (Weather drives it). Before, the rain was a 2D canvas over the game: 1 px pixel-art streaks
// that the scene's MSAA (render/Smooth.js) never saw, and "splashes" scattered over the screen. Now:
//   • STREAKS: one static mesh of thin quads, animated entirely in the vertex shader. Each drop has a fixed seed and falls in a box
//     that wraps around the camera focus, anchored to the WORLD (walking does not drag the rain along). They fall at an angle with
//     the wind (sideways on screen, like before), are hidden behind buildings (depth test) and, being geometry, get the scene's MSAA:
//     smooth edges instead of stair-stepped pixels. Width in screen pixels (constant with the zoom); length grows with the intensity.
//   • DROPS HITTING THE GROUND (only in heavy rain and storms): a ring that opens on the ground and a crown of droplets that jumps and
//     falls back, each one born in a new random spot of the visible ground every cycle. Same mesh trick: one draw call.
// Intensity `k` (Weather.k, 0..1) sets how many drops are alive (the seeds are ranked), their length and their alpha; the ground hits
// fade in from HIT_FROM. Lit by the same ambient tint as the sprites (day/night) and by the lightning flash. Hidden in interiors.
// ============================================================================

class RainFx {
    static DROPS = 4200;                // streaks at full storm
    static HITS = 520;                  // ground hits at full storm
    static FALL = 26;                   // height (m) the drops fall from
    static SPEED = 17;                  // fall speed (m/s)
    static HIT_FROM = 0.55;             // intensity where the drops hitting the ground start (heavy rain = 0.7, storm = 1)

    constructor(scene) {
        this.scene = scene;
        this.t = 0;
        this._fwd = new BABYLON.Vector3();
        this._center = new BABYLON.Vector3();
        RainFx._shaders();
        this.drops = this._mesh('rainDrops', RainFx.DROPS, 1, 'rainDrop', 50);
        this.hits = this._mesh('rainHits', RainFx.HITS, 2, 'rainHit', 40);
    }

    // k: intensity · flash: lightning (0..1) · camera: the CompassCamera · tint: ambient Color3 · dt: s
    update(dt, k, flash, camera, tint, hidden) {
        const on = k > 0.02 && !hidden;
        if (this.drops.isEnabled() !== on) { this.drops.setEnabled(on); }
        const hitK = on ? Math.min(1, Math.max(0, (k - RainFx.HIT_FROM) / (0.95 - RainFx.HIT_FROM))) : 0;
        if (this.hits.isEnabled() !== hitK > 0) this.hits.setEnabled(hitK > 0);
        if (!on) return;
        this.t += dt;
        const cam = camera.camera, f = camera.focus, eng = this.scene.getEngine();
        cam.getDirectionToRef(BABYLON.Axis.Z, this._fwd);
        const view = camera.view, upp = 2 * view / Math.max(1, eng.getRenderHeight());      // metres per screen pixel (orthographic)
        const g = camera.groundHalf(), tilt = Config.camera.tilt * Math.PI / 180;
        const reach = RainFx.FALL / Math.tan(tilt);                                          // drops high up show further down the screen
        this._center.set(f.x - this._fwd.x * reach * 0.5, 0, f.z - this._fwd.z * reach * 0.5);
        const yaw = camera.yaw, wind = (Weather.cur ? Weather.cur.wind : 0.2) * RainFx.SPEED * 1.1;
        const wx = Math.cos(yaw) * wind, wz = -Math.sin(yaw) * wind;                         // wind along the screen's right
        const light = 0.55 + 0.45 * flash;
        // square boxes (world-aligned): they cover the screen whatever way the 360° camera points
        const dropBox = Math.max(g.x * 2, g.z * 2 + reach) + 8, hitBox = Math.max(g.x, g.z) * 2;
        for (const [mesh, n, box] of [[this.drops, k, dropBox], [this.hits, hitK, hitBox]]) {
            if (!mesh.isEnabled()) continue;
            const m = mesh.material;
            m.setFloat('time', this.t);
            m.setFloat('alive', n);
            m.setFloat('k', k);
            m.setVector3('center', mesh === this.hits ? this._centerHits(f) : this._center);
            m.setVector2('box', this._v2(mesh, box, box));
            m.setVector3('fwd', this._fwd);
            m.setVector2('wind', this._v2w(mesh, wx, wz));
            m.setFloat('upp', upp);
            m.setColor3('tint', tint);
            m.setFloat('light', light + (mesh === this.hits ? 0.15 : 0));
        }
    }

    _centerHits(f) { const c = this._ch || (this._ch = new BABYLON.Vector3()); c.set(f.x, 0, f.z); return c; }
    _v2(mesh, x, y) { const v = mesh._box || (mesh._box = new BABYLON.Vector2()); v.set(x, y); return v; }
    _v2w(mesh, x, y) { const v = mesh._wind || (mesh._wind = new BABYLON.Vector2()); v.set(x, y); return v; }

    // N items of `quads` quads each. uv.x = side (−1..1), uv.y = along (0..1); color = seed (r, g: spot · b: phase · a: rank 0..1, the
    // order in which drops come alive as the rain thickens) and the quad index inside the item in the normal's x.
    _mesh(name, n, quads, shader, alphaIndex) {
        const v = n * quads * 4, pos = new Float32Array(v * 3), nrm = new Float32Array(v * 3), uv = new Float32Array(v * 2);
        const col = new Float32Array(v * 4), idx = new Uint32Array(n * quads * 6);
        const rng = Pixel.rng(name === 'rainDrops' ? 4242 : 5151);
        let q = 0;
        for (let i = 0; i < n; i++) {
            const s = [rng(), rng(), rng(), (i + rng()) / n];
            for (let j = 0; j < quads; j++, q++) {
                for (let c = 0; c < 4; c++) {
                    const o = q * 4 + c;
                    uv[o * 2] = c & 1 ? 1 : -1; uv[o * 2 + 1] = c & 2 ? 1 : 0;
                    col.set(s, o * 4);
                    nrm[o * 3] = j;
                }
                const b = q * 4;
                idx.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], q * 6);
            }
        }
        const mesh = new BABYLON.Mesh(name, this.scene);
        const vd = new BABYLON.VertexData();
        vd.positions = pos; vd.normals = nrm; vd.uvs = uv; vd.colors = col; vd.indices = idx;
        vd.applyToMesh(mesh, false);
        const m = new BABYLON.ShaderMaterial(name + 'Mat', this.scene, { vertex: shader, fragment: shader }, {
            attributes: ['position', 'normal', 'uv', 'color'],
            uniforms: ['viewProjection', 'time', 'alive', 'k', 'center', 'box', 'fwd', 'wind', 'upp', 'tint', 'light'],
            needAlphaBlending: true,
        });
        m.backFaceCulling = false;
        m.disableDepthWrite = true;
        mesh.material = m;
        mesh.hasVertexAlpha = true;
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh = true;                      // positions come from the shader: the bounding box means nothing
        mesh.doNotSyncBoundingInfo = true;
        mesh.renderingGroupId = 1;                                 // after the world, depth-tested (buildings hide the rain behind them)
        mesh.alphaIndex = alphaIndex;                              // last of the group: over the sprites, the cars and the tree tops
        mesh.setEnabled(false);
        return mesh;
    }

    static _shaders() {
        const S = BABYLON.Effect.ShadersStore;
        if (S.rainDropVertexShader) return;
        // shared: the world-anchored wrap of a seed inside the box around `center`
        const wrap = `
            vec2 spot(vec2 seed, vec3 center, vec2 box) {
                vec2 lo = center.xz - box * 0.5;
                return lo + mod(seed * box - lo, box);
            }`;
        S.rainDropVertexShader = `
            precision highp float;
            attribute vec3 position; attribute vec3 normal; attribute vec2 uv; attribute vec4 color;
            uniform mat4 viewProjection;
            uniform float time, alive, k, upp;
            uniform vec3 center, fwd;
            uniform vec2 box, wind;
            varying vec2 vUV; varying float vA;
            ${wrap}
            void main(void) {
                vUV = uv;
                if (color.a > alive) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; return; }
                float speed = ${RainFx.SPEED.toFixed(1)} * (0.85 + 0.3 * fract(color.r * 37.1));
                float H = ${RainFx.FALL.toFixed(1)};
                float fallen = fract(color.b + time * speed / H) * H;           // metres fallen in this cycle
                vec2 xz = spot(color.rg, center, box) + wind * (fallen / speed);
                vec3 head = vec3(xz.x, H - fallen, xz.y);
                vec3 vel = normalize(vec3(wind.x, -speed, wind.y));
                float len = (0.7 + 1.5 * k) * (0.7 + 0.6 * fract(color.g * 53.7));
                vec3 side = normalize(cross(vel, fwd)) * upp * (0.75 + 0.35 * fract(color.b * 91.3));
                vec3 p = head - vel * len * uv.y + side * uv.x;
                vA = (0.22 + 0.3 * fract(color.r * 17.9)) * (0.55 + 0.45 * k) * smoothstep(0.0, 1.5, H - fallen);
                gl_Position = viewProjection * vec4(p, 1.0);
            }`;
        S.rainDropFragmentShader = `
            precision highp float;
            uniform vec3 tint; uniform float light;
            varying vec2 vUV; varying float vA;
            void main(void) {
                float a = vA * (1.0 - vUV.y * 0.85);                                // bright head, fading tail
                vec3 c = vec3(0.78, 0.86, 0.98) * mix(vec3(1.0), tint, 0.85) * (0.75 + light);
                gl_FragColor = vec4(c, a);
            }`;
        // a ground hit: quad 0 lies on the ground (the ring), quad 1 stands facing the camera (the crown of droplets)
        S.rainHitVertexShader = `
            precision highp float;
            attribute vec3 position; attribute vec3 normal; attribute vec2 uv; attribute vec4 color;
            uniform mat4 viewProjection;
            uniform float time, alive, upp;
            uniform vec3 center, fwd;
            uniform vec2 box;
            varying vec2 vUV; varying float vU; varying float vQuad; varying float vSeed;
            ${wrap}
            float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            void main(void) {
                vUV = uv; vQuad = normal.x;
                if (color.a > alive) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vU = 1.0; vSeed = 0.0; return; }
                float life = 0.42 + 0.2 * fract(color.r * 19.3);
                float cyc = time / life + color.b;
                float n = floor(cyc);
                vU = fract(cyc);
                vSeed = hash(color.rg + n);
                vec2 xz = spot(vec2(hash(color.rg * 7.3 + n), hash(color.gr * 3.1 + n * 1.7)), center, box);
                vec3 base = vec3(xz.x, 0.06, xz.y);
                float size = 0.32 + 0.22 * vSeed;
                vec3 p;
                if (normal.x < 0.5) {
                    p = base + vec3(uv.x * size, 0.0, (uv.y * 2.0 - 1.0) * size);        // flat on the ground
                } else {
                    vec3 right = normalize(vec3(fwd.z, 0.0, -fwd.x));
                    p = base + right * uv.x * size * 0.8 + vec3(0.0, uv.y * size * 1.1, 0.0);   // upright, facing the camera
                }
                gl_Position = viewProjection * vec4(p, 1.0);
            }`;
        S.rainHitFragmentShader = `
            precision highp float;
            uniform vec3 tint; uniform float light, k;
            varying vec2 vUV; varying float vU; varying float vQuad; varying float vSeed;
            void main(void) {
                float a = 0.0;
                if (vQuad < 0.5) {
                    vec2 p = vec2(vUV.x, vUV.y * 2.0 - 1.0);
                    float r = length(p), R = 0.18 + 0.8 * vU;
                    a = smoothstep(0.11, 0.0, abs(r - R)) * (1.0 - vU) * 0.55;          // the ring opening on the water film
                    a += smoothstep(0.22, 0.0, r) * smoothstep(0.25, 0.0, vU) * 0.6;    // the impact spot
                } else {
                    float up = clamp(vU * 1.6, 0.0, 1.0);
                    for (int i = 0; i < 5; i++) {                                         // droplets jumping out and falling back
                        float fi = float(i), dir = (fi - 2.0) / 2.0 + (vSeed - 0.5) * 0.3;
                        float h = 4.0 * up * (1.0 - up) * (0.55 + 0.35 * fract(vSeed * (fi + 3.0) * 7.7));
                        vec2 d = vec2(dir * 0.85 * up, h * 0.9) - vec2(vUV.x, vUV.y);
                        a += smoothstep(0.075, 0.03, length(d)) * (1.0 - up);
                    }
                    a *= 0.85;
                }
                if (a < 0.01) discard;
                vec3 c = vec3(0.82, 0.9, 1.0) * mix(vec3(1.0), tint, 0.85) * (0.7 + light);
                gl_FragColor = vec4(c, min(1.0, a) * (0.6 + 0.4 * k));
            }`;
    }
}
