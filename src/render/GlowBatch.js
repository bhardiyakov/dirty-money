// ============================================================================
// GlowBatch — milhares de quads dinâmicos numa ÚNICA malha com cor por vértice
// atualizável: 1 draw call. Três tipos de visual (kind):
//   'glow'  brilho aditivo: núcleo + halo com degradê suave/borrado (lâmpadas, faróis, giroflex, postes)
//   'cone'  feixe de luz aditivo no chão (faróis): trapézio com bordas e ponta difusas
//   'puff'  fumaça com blending normal: disco em 3 tons (escapamento)
// Desenhado depois do mundo (renderingGroup 1) mas ainda testando profundidade, então
// prédios e árvores na frente escondem a luz como deveriam.
// ============================================================================

class GlowBatch {
    static register() {
        if (GlowBatch._registered) return;
        GlowBatch._registered = true;
        const vertex = `
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
        for (const k of ['glow', 'cone', 'puff', 'ring']) BABYLON.Effect.ShadersStore[k + 'VertexShader'] = vertex;

        BABYLON.Effect.ShadersStore['glowFragmentShader'] = `
            precision highp float;
            varying vec2 vUV;
            varying vec4 vColor;
            void main(void) {
                if (vColor.a <= 0.003) discard;
                // Degradê suave (blur): núcleo quente e estreito + halo largo, sumindo sem borda no limite do quad.
                float r = length(vUV * 2.0 - 1.0);
                if (r >= 1.0) discard;
                float core = exp(-r * r * 14.0);
                float halo = exp(-r * r * 3.6);
                float a = (core * 0.75 + halo * 0.55) * (1.0 - smoothstep(0.62, 1.0, r));
                if (a < 0.004) discard;
                vec3 c = mix(vColor.rgb, vec3(1.0), core * 0.45) * (1.0 + core * 0.35);
                gl_FragColor = vec4(c, vColor.a * a);
            }`;

        // 'ring': anel suave que se abre (marolas na água): brilho concentrado em r ≈ 0,78.
        BABYLON.Effect.ShadersStore['ringFragmentShader'] = `
            precision highp float;
            varying vec2 vUV;
            varying vec4 vColor;
            void main(void) {
                if (vColor.a <= 0.003) discard;
                float r = length(vUV * 2.0 - 1.0);
                if (r >= 1.0) discard;
                float d = (r - 0.78) * 6.5;
                float a = exp(-d * d) * (1.0 - smoothstep(0.86, 1.0, r));
                if (a < 0.01) discard;
                gl_FragColor = vec4(vColor.rgb, vColor.a * a);
            }`;

        BABYLON.Effect.ShadersStore['coneFragmentShader'] = `
            precision highp float;
            varying vec2 vUV;
            varying vec4 vColor;
            void main(void) {
                if (vColor.a <= 0.003) discard;
                // Feixe com bordas laterais e ponta difusas (sem degraus).
                float lat = abs(vUV.x * 2.0 - 1.0);
                float fall = 1.0 - vUV.y;
                // Feixe organico: borda lateral em gaussiana (sem aresta), ponta arredondada e queda suave ao longo do comprimento.
                float lateral = exp(-lat * lat * 2.6);
                float capY = max(0.0, vUV.y - 0.45) / 0.55;
                float cap = 1.0 - smoothstep(0.55, 1.0, sqrt(lat * lat * 0.8 + capY * capY));
                float a = lateral * cap * (0.3 + 0.7 * fall) * 0.75 * smoothstep(0.0, 0.22, vUV.y + 0.03);
                if (a < 0.004) discard;
                gl_FragColor = vec4(vColor.rgb, vColor.a * a);
            }`;

        BABYLON.Effect.ShadersStore['puffFragmentShader'] = `
            precision highp float;
            varying vec2 vUV;
            varying vec4 vColor;
            uniform vec3 tint;
            void main(void) {
                if (vColor.a <= 0.003) discard;
                float r = length(vUV * 2.0 - 1.0);
                if (r > 1.0) discard;
                float shade = r < 0.42 ? 1.0 : (r < 0.78 ? 0.82 : 0.64);
                gl_FragColor = vec4(vColor.rgb * shade * tint, vColor.a * (r < 0.78 ? 1.0 : 0.7));
            }`;
    }

    // capacity: nº máximo de quads | kind: 'glow' | 'cone' | 'puff'
    constructor(scene, capacity, name = 'glow', kind = 'glow') {
        GlowBatch.register();
        this.capacity = capacity;
        this.count = 0;
        this.dirty = false;
        this.posDirty = false;

        this.pos = new Float32Array(capacity * 12);
        this.col = new Float32Array(capacity * 16);
        const uv = new Float32Array(capacity * 8);
        const idx = new Uint32Array(capacity * 6);
        for (let i = 0; i < capacity; i++) {
            uv.set([0, 0, 1, 0, 0, 1, 1, 1], i * 8);
            const b = i * 4;
            idx.set([b + 3, b + 1, b, b + 2, b + 3, b], i * 6);
        }

        this.mesh = new BABYLON.Mesh(name, scene);
        const vd = new BABYLON.VertexData();
        vd.positions = this.pos;
        vd.colors = this.col;
        vd.uvs = uv;
        vd.indices = idx;
        vd.normals = new Float32Array(capacity * 12);
        vd.applyToMesh(this.mesh, true);

        const m = new BABYLON.ShaderMaterial(name + 'Mat', scene, { vertex: kind, fragment: kind }, {
            attributes: ['position', 'uv', 'color'],
            uniforms: ['worldViewProjection', 'tint'],
            needAlphaBlending: true,
        });
        m.alphaMode = kind === 'puff' ? BABYLON.Engine.ALPHA_COMBINE : BABYLON.Engine.ALPHA_ADD;
        m.backFaceCulling = false;
        m.disableDepthWrite = true;
        if (kind === 'puff') m.setColor3('tint', SpriteMaterial.sharedTint());
        this.mesh.material = m;
        this.mesh.renderingGroupId = 1;
        this.mesh.isPickable = false;
        this.mesh.alwaysSelectAsActiveMesh = true;
        this.mesh.doNotSyncBoundingInfo = true;
        scene.setRenderingAutoClearDepthStencil(1, false);   // mantém a profundidade do mundo.
    }

    // Reserva um quad e devolve o índice (reaproveita os que foram devolvidos com free).
    alloc() {
        if (this._free && this._free.length) return this._free.pop();
        if (this.count >= this.capacity) throw new Error('GlowBatch cheio');
        return this.count++;
    }

    // Devolve um quad (apagado) para ser reaproveitado.
    free(i) {
        this.off(i);
        (this._free || (this._free = [])).push(i);
    }

    // Quad achatado de lado `size`, centrado em (x, y, z).
    place(i, x, y, z, size) {
        const h = size / 2, p = this.pos, o = i * 12;
        p[o] = x - h; p[o + 1] = y; p[o + 2] = z + h;
        p[o + 3] = x + h; p[o + 4] = y; p[o + 5] = z + h;
        p[o + 6] = x - h; p[o + 7] = y; p[o + 8] = z - h;
        p[o + 9] = x + h; p[o + 10] = y; p[o + 11] = z - h;
        this.posDirty = true;
    }

    // Quad com 4 cantos livres, na ordem (0,0) (1,0) (0,1) (1,1) do UV. Usado pelos cones de luz.
    quad(i, ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz) {
        const p = this.pos, o = i * 12;
        p[o] = ax; p[o + 1] = ay; p[o + 2] = az;
        p[o + 3] = bx; p[o + 4] = by; p[o + 5] = bz;
        p[o + 6] = cx; p[o + 7] = cy; p[o + 8] = cz;
        p[o + 9] = dx; p[o + 10] = dy; p[o + 11] = dz;
        this.posDirty = true;
    }

    color(i, r, g, b, a = 1) {
        const c = this.col, o = i * 16;
        if (c[o] === r && c[o + 1] === g && c[o + 2] === b && c[o + 3] === a) return;
        for (let k = 0; k < 4; k++) { c[o + k * 4] = r; c[o + k * 4 + 1] = g; c[o + k * 4 + 2] = b; c[o + k * 4 + 3] = a; }
        this.dirty = true;
    }

    off(i) { this.color(i, 0, 0, 0, 0); }

    // Envia ao GPU o que mudou (chame uma vez por frame, depois dos color()/place()).
    flush() {
        if (this.dirty) { this.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, this.col); this.dirty = false; }
        if (this.posDirty) { this.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, this.pos); this.posDirty = false; }
    }
}
