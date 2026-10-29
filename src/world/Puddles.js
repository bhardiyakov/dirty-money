// ============================================================================
// Puddles — poças d'água nas ruas. Quando a chuva aperta (chuva forte e tempestade) o "nível de água" sobe; cada poça tem o seu
// limiar, então elas vão aparecendo e crescendo uma a uma. Quando a chuva passa o nível desce devagar e as poças encolhem e somem
// aos poucos (as mais rasas primeiro). Com chuva caindo, as poças ganham anéis de marola.
// Locais fixos e determinísticos sobre o asfalto (perto das sarjetas); só as ~180 em volta da câmera têm quad (1 malha dinâmica).
// ============================================================================

class Puddles {
    constructor(game) {
        this.g = game;
        this.scene = game.scene;
        this.level = 0;                      // 0 = seco | 1 = tudo alagado
        this.t = 0;
        this._q = 0;
        this._lastLevel = -1;
        this._buildSites();
        this._buildMesh();
    }

    // ---------------------------------------------------------------- locais
    _buildSites() {
        const rng = Pixel.rng(9090), sites = [], grid = new Map(), CELL = 64;
        for (const e of RoadPlan.edges) {
            if (e.cls !== 'city' && e.cls !== 'isl' && e.cls !== 'ave' && e.cls !== 'hwy' && e.cls !== 'serra') continue;     // asfalto de chão (sem ponte/viaduto/terra)
            const hw = e.w / 2, L = e.len;
            for (let s = 10 + rng() * 8; s < L - 10; s += 9 + rng() * 12) {
                const gutter = rng() < 0.7, side = rng() < 0.5 ? 1 : -1;
                let off = gutter ? side * (hw - 1.5 - rng() * 1.7) : side * rng() * (hw - 2.5);
                if (e.cls === 'ave' && Math.abs(off) < 3.6) off = side * (3.8 + rng());                // fora do canteiro
                const len = 3.4 + rng() * 3.8, wid = 1.8 + rng() * 1.8;
                let x, z, sx, sz;
                if (e.free) { const q = RoadPlan.at(e, s); x = q.x + q.tz * off; z = q.z - q.tx * off; sx = sz = wid; }            // via livre: poça redonda
                else { x = e.v ? e.a.x + off : e.a.x + s; z = e.v ? e.a.z + s : e.a.z + off; sx = e.v ? wid : len; sz = e.v ? len : wid; }
                const p = { x, z, sx, sz, th: rng() * 0.8, seed: rng() };
                sites.push(p);
                const key = Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
                let c = grid.get(key); if (!c) grid.set(key, c = []);
                c.push(p);
            }
        }
        this.sites = sites; this.grid = grid; this.CELL = CELL;
        console.log(`[POCAS] ${sites.length} locais de poça`);
    }

    // ----------------------------------------------------------------- malha
    _buildMesh() {
        const scene = this.scene;
        if (!BABYLON.Effect.ShadersStore['puddleVertexShader']) {
            BABYLON.Effect.ShadersStore['puddleVertexShader'] = `
                precision highp float;
                attribute vec3 position;
                attribute vec2 uv;
                attribute vec4 color;
                uniform mat4 worldViewProjection;
                varying vec2 vUV;
                varying vec4 vColor;
                void main(void) {
                    vUV = uv;
                    vColor = color;
                    gl_Position = worldViewProjection * vec4(position, 1.0);
                }`;
            BABYLON.Effect.ShadersStore['puddleFragmentShader'] = `
                precision highp float;
                varying vec2 vUV;
                varying vec4 vColor;
                uniform vec3 tint;
                uniform float time;
                uniform float rain;
                uniform float night;
                void main(void) {
                    float vis = vColor.g;
                    if (vis <= 0.01) discard;
                    vec2 p = vUV * 2.0 - 1.0;
                    float seed = vColor.r;
                    float ang = atan(p.y, p.x);
                    float edge = (0.80 + 0.12 * sin(ang * 3.0 + seed * 20.0) + 0.08 * sin(ang * 5.0 + seed * 41.0) + 0.05 * sin(ang * 7.0 + seed * 9.0)) * vis;
                    float rr = length(p);
                    if (rr > edge) discard;
                    float depth = rr / edge;
                    vec3 rim = vec3(0.07, 0.09, 0.13), deep = vec3(0.16, 0.24, 0.34), sky = vec3(0.45, 0.62, 0.78);
                    vec3 c = mix(deep, rim, smoothstep(0.55, 0.95, depth));
                    float refl = smoothstep(0.14, 0.0, abs(p.x * 0.7 - p.y * 0.5 + (seed - 0.5) * 0.6)) * (1.0 - depth);
                    c = mix(c, sky, refl * 0.55);
                    float r0 = fract(time * 0.7 + seed * 3.1), r1 = fract(time * 0.7 + seed * 3.1 + 0.5);
                    float ring = smoothstep(0.07, 0.0, abs(depth - r0)) * (1.0 - r0) + smoothstep(0.07, 0.0, abs(depth - r1)) * (1.0 - r1);
                    c = mix(c, sky, clamp(ring, 0.0, 1.0) * rain * 0.8);
                    c = floor(c * 7.0 + 0.5) / 7.0;
                    c = c * tint + night * vec3(0.04, 0.05, 0.08);
                    gl_FragColor = vec4(c, 0.88);
                }`;
        }
        this.cap = 200;
        const n = this.cap;
        this.pos = new Float32Array(n * 12);
        this.col = new Float32Array(n * 16);
        const uv = new Float32Array(n * 8), idx = new Uint32Array(n * 6);
        for (let i = 0; i < n; i++) { uv.set([0, 1, 1, 1, 0, 0, 1, 0], i * 8); const b = i * 4; idx.set([b + 3, b + 1, b, b + 2, b + 3, b], i * 6); }
        this.mesh = new BABYLON.Mesh('puddles', scene);
        const vd = new BABYLON.VertexData();
        vd.positions = this.pos; vd.colors = this.col; vd.uvs = uv; vd.indices = idx; vd.normals = new Float32Array(n * 12);
        vd.applyToMesh(this.mesh, true);
        const m = new BABYLON.ShaderMaterial('puddleMat', scene, { vertex: 'puddle', fragment: 'puddle' }, {
            attributes: ['position', 'uv', 'color'],
            uniforms: ['worldViewProjection', 'tint', 'time', 'rain', 'night'],
            needAlphaBlending: true,
        });
        m.setColor3('tint', SpriteMaterial.sharedTint());
        m.setFloat('time', 0); m.setFloat('rain', 0); m.setFloat('night', 0);
        m.backFaceCulling = false;
        m.disableDepthWrite = true;
        this.mesh.material = m;
        this.mesh.isPickable = false;
        this.mesh.alwaysSelectAsActiveMesh = true;
        this.mesh.doNotSyncBoundingInfo = true;
        this.active = [];
        this.mesh.setEnabled(false);
    }

    // Poças a até 80 u do foco ganham um quad (as mais próximas, no máximo `cap`).
    _requery(fx, fz) {
        if (!inWorld(fx, fz)) return;
        const C = this.CELL, R = 80, list = [];
        for (let i = Math.floor((fx - R) / C); i <= Math.floor((fx + R) / C); i++) {
            for (let j = Math.floor((fz - R) / C); j <= Math.floor((fz + R) / C); j++) {
                const c = this.grid.get(i + ',' + j);
                if (!c) continue;
                for (const p of c) { const d = hypot(p.x - fx, p.z - fz); if (d < R) list.push([d, p]); }
            }
        }
        list.sort((a, b) => a[0] - b[0]);
        this.active = list.slice(0, this.cap).map((e) => e[1]);
        const P = this.pos, y = 0.045;
        P.fill(0);
        this.active.forEach((p, i) => {
            const o = i * 12, hx = p.sx / 2, hz = p.sz / 2;
            P[o] = p.x - hx; P[o + 1] = y; P[o + 2] = p.z + hz;
            P[o + 3] = p.x + hx; P[o + 4] = y; P[o + 5] = p.z + hz;
            P[o + 6] = p.x - hx; P[o + 7] = y; P[o + 8] = p.z - hz;
            P[o + 9] = p.x + hx; P[o + 10] = y; P[o + 11] = p.z - hz;
        });
        this.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, P);
        this._lastLevel = -1;                                // força reenviar as cores
    }

    // ------------------------------------------------------------- por quadro
    update(dt) {
        const g = this.g, k = typeof Weather !== 'undefined' && Weather.cur ? Weather.cur.k : 0;
        this.t += dt;
        // Nível da água: sobe com chuva forte/tempestade (mais rápido quanto mais forte); desce devagar (evaporação/escoamento) quando passa.
        if (k > 0.5) this.level = Math.min(1, this.level + (k - 0.5) * 0.07 * dt);
        else this.level = Math.max(0, this.level - (k < 0.3 ? 0.012 : 0.004) * dt);

        const tg = g.camera.target;
        this._q -= dt;
        const moved = this._fx === undefined || hypot(tg.x - this._fx, tg.z - this._fz) > 14;
        if (this.level <= 0 && !this.mesh.isEnabled()) { return; }
        if (this._q <= 0 || moved) { this._q = 1; this._fx = tg.x; this._fz = tg.z; this._requery(tg.x, tg.z); }

        const show = this.level > 0.001;
        if (this.mesh.isEnabled() !== show) this.mesh.setEnabled(show);
        if (!show) return;
        const m = this.mesh.material;
        m.setFloat('time', this.t); m.setFloat('rain', k); m.setFloat('night', g.dayNight ? g.dayNight.night : 0);
        if (Math.abs(this.level - this._lastLevel) > 0.002) {
            this._lastLevel = this.level;
            const C = this.col;
            C.fill(0);
            this.active.forEach((p, i) => {
                const vis = Math.max(0, Math.min(1, (this.level - p.th) / 0.22));
                for (let v = 0; v < 4; v++) { const o = i * 16 + v * 4; C[o] = p.seed; C[o + 1] = vis; C[o + 2] = 0; C[o + 3] = 1; }
            });
            this.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, C);
        }
    }
}
