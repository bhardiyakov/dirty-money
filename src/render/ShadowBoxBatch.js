// ============================================================================
// ShadowBoxBatch — as caixas invisíveis que só existem para projetar sombra (chassi e cabine de cada carro/moto) desenhadas no
// mapa de sombra como UMA malha com instâncias finas (thin instances), em vez de uma chamada de desenho por caixa.
//
// Cada caixa marcada com `mesh._dmShadowBox = [largura, altura, profundidade]` (ver Vehicle) entra no lote com a sua matriz de
// mundo atual e o seu tamanho: a sombra fica idêntica. O filtro de projetores (GameEngine._setupShadowMap) chama begin/add/end
// a cada quadro em que o mapa de sombra é desenhado. Com 10 carros: ~20 desenhos → 1.
// ============================================================================

class ShadowBoxBatch {
    constructor(scene, material, layerMask) {
        this.mesh = BABYLON.MeshBuilder.CreateBox('shadowBoxBatch', { size: 1 }, scene);
        this.mesh.material = material;
        this.mesh.layerMask = layerMask;                 // fora da câmera: só o mapa de sombra o desenha
        this.mesh.isPickable = false;
        this.mesh.alwaysSelectAsActiveMesh = true;       // o descarte é do filtro de projetores, não do Babylon
        this.mesh.doNotSyncBoundingInfo = true;
        this.capacity = 0;
        this.count = 0;
        this.matrices = null;
        this._grow(64);
    }

    begin() { this.count = 0; }

    // Matriz de mundo da caixa com a escala do seu tamanho aplicada no espaço local (linhas 0–2 = eixos locais).
    add(box) {
        if (this.count === this.capacity) this._grow(this.capacity * 2);
        const w = box.getWorldMatrix().m, s = box._dmShadowBox, o = this.count * 16, d = this.matrices;
        for (let r = 0; r < 3; r++) {
            const k = s[r];
            d[o + r * 4] = w[r * 4] * k; d[o + r * 4 + 1] = w[r * 4 + 1] * k; d[o + r * 4 + 2] = w[r * 4 + 2] * k; d[o + r * 4 + 3] = w[r * 4 + 3];
        }
        d[o + 12] = w[12]; d[o + 13] = w[13]; d[o + 14] = w[14]; d[o + 15] = w[15];
        this.count++;
    }

    // true se há algo para desenhar (aí o filtro devolve `this.mesh` na lista do mapa de sombra).
    end() {
        this.mesh.thinInstanceCount = this.count;
        if (this.count) this.mesh.thinInstanceBufferUpdated('matrix');
        return this.count > 0;
    }

    _grow(capacity) {
        const next = new Float32Array(capacity * 16);
        if (this.matrices) next.set(this.matrices);
        this.matrices = next;
        this.capacity = capacity;
        this.mesh.thinInstanceSetBuffer('matrix', this.matrices, 16, false);
        this.mesh.thinInstanceCount = this.count;
    }
}
