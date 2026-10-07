// ============================================================================
// ShadowBoxBatch — os volumes invisíveis que só existem para projetar sombra (chassi e cabine de cada carro, casco de barco, moto)
// desenhados no mapa de sombra como poucas malhas com instâncias finas (thin instances), em vez de uma chamada de desenho por volume.
//
// Cada volume marcado com `mesh._dmShadowBox = [largura, altura, profundidade]` (ver Vehicle) entra no lote com a sua matriz de
// mundo atual e o seu tamanho; `mesh._dmShadowShape` escolhe o FORMATO visto de cima (um lote por formato):
//   'car'   retângulo de cantos arredondados (padrão): a quina macia de um carro
//   'pill'  cápsula: moto e bicicleta (pontas redondas)
//   'hull'  casco: popa reta de cantos redondos e proa afinando até a ponta (+z) — jet ski, lancha, barco
// O filtro de projetores (GameEngine._setupShadowMap) chama begin/add/end a cada quadro em que o mapa de sombra é desenhado.
// ============================================================================

class ShadowBoxBatch {
    constructor(scene, material, layerMask) {
        this.batches = {};
        for (const [shape, ring] of Object.entries(ShadowBoxBatch.OUTLINES())) {
            const mesh = ShadowBoxBatch._prism(scene, ring, 'shadowBatch_' + shape);
            mesh.material = material;
            mesh.layerMask = layerMask;                  // fora da câmera: só o mapa de sombra o desenha
            mesh.isPickable = false;
            mesh.alwaysSelectAsActiveMesh = true;        // o descarte é do filtro de projetores, não do Babylon
            mesh.doNotSyncBoundingInfo = true;
            const b = this.batches[shape] = { mesh, capacity: 0, count: 0, matrices: null };
            this._grow(b, 32);
        }
        this._out = [];
    }

    begin() { for (const k in this.batches) this.batches[k].count = 0; }

    // Matriz de mundo do volume com a escala do seu tamanho aplicada no espaço local (linhas 0–2 = eixos locais).
    add(box) {
        const b = this.batches[box._dmShadowShape] || this.batches.car;
        if (b.count === b.capacity) this._grow(b, b.capacity * 2);
        const w = box.getWorldMatrix().m, s = box._dmShadowBox, o = b.count * 16, d = b.matrices;
        for (let r = 0; r < 3; r++) {
            const k = s[r];
            d[o + r * 4] = w[r * 4] * k; d[o + r * 4 + 1] = w[r * 4 + 1] * k; d[o + r * 4 + 2] = w[r * 4 + 2] * k; d[o + r * 4 + 3] = w[r * 4 + 3];
        }
        d[o + 12] = w[12]; d[o + 13] = w[13]; d[o + 14] = w[14]; d[o + 15] = w[15];
        b.count++;
    }

    // As malhas que têm algo para desenhar (o filtro as põe na lista do mapa de sombra).
    end() {
        const out = this._out;
        out.length = 0;
        for (const k in this.batches) {
            const b = this.batches[k];
            b.mesh.thinInstanceCount = b.count;
            if (b.count) { b.mesh.thinInstanceBufferUpdated('matrix'); out.push(b.mesh); }
        }
        return out;
    }

    // Contornos unitários (x e z em −0,5..0,5, +z = frente), no sentido anti-horário visto de cima. Convexos (tampa em leque).
    static OUTLINES() {
        const arc = (ring, cx, cz, rx, rz, a0, a1, seg) => {
            for (let i = 0; i <= seg; i++) { const a = a0 + (a1 - a0) * i / seg; ring.push([cx + Math.cos(a) * rx, cz + Math.sin(a) * rz]); }
        };
        const rounded = (rx, rz, seg) => {
            const ring = [], H = Math.PI / 2;
            arc(ring, 0.5 - rx, 0.5 - rz, rx, rz, 0, H, seg);
            arc(ring, -(0.5 - rx), 0.5 - rz, rx, rz, H, 2 * H, seg);
            arc(ring, -(0.5 - rx), -(0.5 - rz), rx, rz, 2 * H, 3 * H, seg);
            arc(ring, 0.5 - rx, -(0.5 - rz), rx, rz, 3 * H, 4 * H, seg);
            return ring;
        };
        // Casco: lados retos da popa até z = 0,05; daí a proa fecha numa ogiva até a ponta em z = 0,5.
        const hull = () => {
            const ring = [], seg = 10, zb = 0.05, rs = 0.1;
            for (let i = 0; i <= seg; i++) { const u = i / seg; ring.push([0.5 * Math.pow(Math.cos(u * Math.PI / 2), 0.75), zb + (0.5 - zb) * u]); }   // bordo direito → ponta
            for (let i = seg - 1; i >= 0; i--) { const u = i / seg; ring.push([-0.5 * Math.pow(Math.cos(u * Math.PI / 2), 0.75), zb + (0.5 - zb) * u]); }   // ponta → bordo esquerdo
            arc(ring, -(0.5 - rs), -(0.5 - rs * 0.6), rs, rs * 0.6, Math.PI, Math.PI * 1.5, 4);                       // popa (cantos redondos)
            arc(ring, 0.5 - rs, -(0.5 - rs * 0.6), rs, rs * 0.6, Math.PI * 1.5, Math.PI * 2, 4);
            return ring;
        };
        return { car: rounded(0.3, 0.13, 5), pill: rounded(0.5, 0.2, 6), hull: hull() };
    }

    // Prisma unitário (y em −0,5..0,5) com o contorno `ring` em cima e embaixo.
    static _prism(scene, ring, name) {
        const n = ring.length, pos = [], idx = [];
        let cx = 0, cz = 0;
        for (const [x, z] of ring) { cx += x / n; cz += z / n; }
        // tampas (leque a partir do centro): em cima e embaixo
        for (const y of [0.5, -0.5]) {
            const c = pos.length / 3;
            pos.push(cx, y, cz);
            for (const [x, z] of ring) pos.push(x, y, z);
            for (let i = 0; i < n; i++) {
                const a = c + 1 + i, b = c + 1 + (i + 1) % n;
                if (y > 0) idx.push(c, b, a); else idx.push(c, a, b);
            }
        }
        // laterais
        const s = pos.length / 3;
        for (const [x, z] of ring) pos.push(x, 0.5, z, x, -0.5, z);
        for (let i = 0; i < n; i++) {
            const t0 = s + i * 2, b0 = t0 + 1, t1 = s + ((i + 1) % n) * 2, b1 = t1 + 1;
            idx.push(t0, t1, b0, t1, b1, b0);
        }
        const vd = new BABYLON.VertexData();
        vd.positions = pos; vd.indices = idx; vd.normals = [];
        BABYLON.VertexData.ComputeNormals(pos, idx, vd.normals);
        const m = new BABYLON.Mesh(name, scene);
        vd.applyToMesh(m);
        return m;
    }

    _grow(b, capacity) {
        const next = new Float32Array(capacity * 16);
        if (b.matrices) next.set(b.matrices);
        b.matrices = next;
        b.capacity = capacity;
        b.mesh.thinInstanceSetBuffer('matrix', b.matrices, 16, false);
        b.mesh.thinInstanceCount = b.count;
    }
}
