// ============================================================================
// MeshBatch — acumula quads no espaço de mundo e gera UMA malha mesclada.
// Cidade inteira = poucas malhas (1 por material) => poucos draw calls.
//
// Convenção dos cantos de um quad: A=TL, B=TR, C=BL, D=BR como vistos DE FORA
// da face (mesma ordem de índices do CreateGround do Babylon).
// UVs são calculadas em coordenadas de mundo pelo chamador (texturas contínuas).
// ============================================================================

class MeshBatch {
    constructor() {
        this.pos = [];
        this.nor = [];
        this.uv = [];
        this.col = [];
        this.idx = [];
    }

    get empty() { return this.idx.length === 0; }

    // a,b,c,d: [x,y,z] | n: normal | uvs: [[u,v] x4] | color: [r,g,b] opcional (vertex color).
    // color: [r,g,b] para os 4 cantos, ou [[r,g,b] x4] (um por canto A,B,C,D) para degradês (sombreado do relevo).
    quad(a, b, c, d, n, uvs, color = [1, 1, 1]) {
        const base = this.pos.length / 3;
        const per = Array.isArray(color[0]);
        // (sem `for (const p of [a, b, c, d])`: o array e o iterador eram lixo a cada quad — milhares por pedaço de terreno)
        this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
        for (let k = 0; k < 4; k++) {
            this.nor.push(n[0], n[1], n[2]);
            const c4 = per ? color[k] : color;
            this.col.push(c4[0], c4[1], c4[2], c4.length > 3 ? c4[3] : 1);
            this.uv.push(uvs[k][0], uvs[k][1]);
        }
        this.idx.push(base + 3, base + 1, base, base + 2, base + 3, base);
    }

    // Triângulo orientado: a face visível aponta para `n` (troca b/c se preciso). uvs: [[u,v] x3].
    tri(a, b, c, n, uvs, color = [1, 1, 1]) {
        const cx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
        const cy = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
        const cz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        const facing = -(cx * n[0] + cy * n[1] + cz * n[2]);          // a face visível tem normal = -cross(b-a, c-a)
        if (facing < 0) { [b, c] = [c, b]; uvs = [uvs[0], uvs[2], uvs[1]]; }
        const base = this.pos.length / 3;
        this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
        for (let k = 0; k < 3; k++) {
            this.nor.push(n[0], n[1], n[2]);
            this.col.push(color[0], color[1], color[2], 1);
            this.uv.push(uvs[k][0], uvs[k][1]);
        }
        this.idx.push(base, base + 1, base + 2);
    }

    // Face de cima. uvFn(x, z) -> [u, v] (em unidades de tile).
    top(x0, z0, x1, z1, y, uvFn, color) {
        this.quad(
            [x0, y, z1], [x1, y, z1], [x0, y, z0], [x1, y, z0], [0, 1, 0],
            [uvFn(x0, z1), uvFn(x1, z1), uvFn(x0, z0), uvFn(x1, z0)], color
        );
    }

    // Quatro paredes de um prisma de y0 a y1. uvFn(s, y, face) -> [u, v],
    // onde s = distância ao longo da parede, crescendo para a direita de quem olha de fora.
    walls(x0, z0, x1, z1, y0, y1, uvFn, color) {
        // Norte (z = z1, normal +z): a direita de quem olha é -x.
        this.quad([x1, y1, z1], [x0, y1, z1], [x1, y0, z1], [x0, y0, z1], [0, 0, 1],
            [uvFn(0, y1, 'n'), uvFn(x1 - x0, y1, 'n'), uvFn(0, y0, 'n'), uvFn(x1 - x0, y0, 'n')], color);
        // Sul (z = z0, normal -z): direita = +x.
        this.quad([x0, y1, z0], [x1, y1, z0], [x0, y0, z0], [x1, y0, z0], [0, 0, -1],
            [uvFn(0, y1, 's'), uvFn(x1 - x0, y1, 's'), uvFn(0, y0, 's'), uvFn(x1 - x0, y0, 's')], color);
        // Leste (x = x1, normal +x): direita = +z.
        this.quad([x1, y1, z0], [x1, y1, z1], [x1, y0, z0], [x1, y0, z1], [1, 0, 0],
            [uvFn(0, y1, 'e'), uvFn(z1 - z0, y1, 'e'), uvFn(0, y0, 'e'), uvFn(z1 - z0, y0, 'e')], color);
        // Oeste (x = x0, normal -x): direita = -z.
        this.quad([x0, y1, z1], [x0, y1, z0], [x0, y0, z1], [x0, y0, z0], [-1, 0, 0],
            [uvFn(0, y1, 'w'), uvFn(z1 - z0, y1, 'w'), uvFn(0, y0, 'w'), uvFn(z1 - z0, y0, 'w')], color);
    }

    // Caixa completa (topo + paredes) com UVs triviais — para peças de cor sólida.
    solid(x0, z0, x1, z1, y0, y1, color) {
        const uv0 = () => [0, 0];
        this.top(x0, z0, x1, z1, y1, uv0, color);
        this.walls(x0, z0, x1, z1, y0, y1, uv0, color);
    }

    // Cria a malha no Babylon (já em coordenadas de mundo; transform congelado).
    // alwaysActive: false para malhas por pedaço (o frustum descarta as que estão fora da tela).
    build(name, scene, material, { vertexColors = false, receiveShadows = true, alwaysActive = true } = {}) {
        if (this.empty) return null;
        const mesh = new BABYLON.Mesh(name, scene);
        const vd = new BABYLON.VertexData();
        // Arrays tipados (Float32/Uint16|32): metade da memória dos arrays comuns de doubles, e a malha guarda ESTA cópia (o batch
        // passa a apontar para ela — nada duplicado). O que não é usado (cor) é descartado.
        this.pos = new Float32Array(this.pos); this.nor = new Float32Array(this.nor); this.uv = new Float32Array(this.uv);
        this.idx = this.pos.length / 3 > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx);
        vd.positions = this.pos;
        vd.indices = this.idx;
        vd.normals = this.nor;
        vd.uvs = this.uv;
        if (vertexColors) { this.col = new Float32Array(this.col); vd.colors = this.col; } else this.col = null;
        vd.applyToMesh(mesh);
        mesh.material = material;
        mesh.useVertexColors = vertexColors;
        mesh.receiveShadows = receiveShadows;
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh = alwaysActive;   // malha gigante: dispensa culling por frame.
        mesh.freezeWorldMatrix();
        return mesh;
    }
}
