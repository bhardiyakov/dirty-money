// ============================================================================
// InstancedRenderer — draws the GridManager's placements with Babylon.js THIN INSTANCES: one mesh per (chunk, definition), whose
// matrix buffer holds every placed copy of that definition in that chunk. Hundreds of chairs in a block cost one draw call.
//
// Buffer bookkeeping (per batch):
//   matrixBuffer       Float32Array, 16 floats per instance, capacity doubles when full (the only time the GPU buffer is recreated)
//   slotByPlacementId  id → instance slot. Removal is swap-and-pop: the last instance moves into the hole, so the live range is
//                      always [0, count) and nothing is ever compacted
//   Changes only mark the batch dirty; flushDirtyBatches() (once per frame, before render) uploads each dirty buffer ONCE and
//   refreshes its bounding info, however many items were placed or removed in that frame.
//
// Chunk garbage collection: 'chunkUnloaded' dispose()s every batch mesh of that chunk (never isVisible = false: hidden nodes
// still cost iteration and memory). An item is drawn by its ORIGIN chunk's batch (GridManager record.originChunkKey).
//
// The cursor preview is NOT a thin instance (see PlacementSystem): only confirmed placements reach these buffers.
// createTemplateMesh(definition, scene) → a mesh to be cloned per batch (clones share its geometry); it is kept disabled.
// ============================================================================

class InstancedRenderer {
    static FLOATS_PER_MATRIX = 16;
    static INITIAL_CAPACITY = 16;

    constructor(scene, gridManager, createTemplateMesh) {
        this.scene = scene;
        this.gridManager = gridManager;
        this.createTemplateMesh = createTemplateMesh;
        this.templateMeshByDefinitionId = new Map();
        this.batchesByChunkKey = new Map();               // chunkKey → Map(definitionNumericId → batch)
        this.dirtyBatches = new Set();
        this.scratchMatrix = new BABYLON.Matrix();
        this.scratchRotation = new BABYLON.Quaternion();
        this.scratchPosition = new BABYLON.Vector3();
        this.unitScale = new BABYLON.Vector3(1, 1, 1);
        this.unsubscribers = [
            gridManager.on('placed', (record) => this.addInstance(record)),
            gridManager.on('removed', (record) => this.removeInstance(record)),
            gridManager.on('chunkLoaded', (chunk) => this.addMissingInstancesOfChunk(chunk.key)),
            gridManager.on('chunkUnloaded', (chunk) => this.disposeChunk(chunk.key)),
        ];
        this.beforeRenderObserver = scene.onBeforeRenderObservable.add(() => this.flushDirtyBatches());
    }

    // ---- placement events ----------------------------------------------------------------------------------------------------

    addInstance(record) {
        if (!this.gridManager.loadedChunks.has(record.originChunkKey)) return;     // drawn when its origin chunk loads
        const batch = this.batchFor(record.originChunkKey, record.definition);
        if (batch.slotByPlacementId.has(record.id)) return;
        if (batch.count === batch.capacity) this.growBatch(batch, batch.capacity * 2);
        const slot = batch.count++;
        batch.slotByPlacementId.set(record.id, slot);
        batch.placementIdBySlot[slot] = record.id;
        this.writeInstanceMatrix(batch, slot, record);
        this.markDirty(batch);
    }

    removeInstance(record) {
        const chunkBatches = this.batchesByChunkKey.get(record.originChunkKey);
        const batch = chunkBatches && chunkBatches.get(record.definition.numericId);
        if (!batch || !batch.slotByPlacementId.has(record.id)) return;
        const removedSlot = batch.slotByPlacementId.get(record.id);
        const lastSlot = --batch.count;
        if (removedSlot !== lastSlot) {
            const movedPlacementId = batch.placementIdBySlot[lastSlot];
            const floatsPerMatrix = InstancedRenderer.FLOATS_PER_MATRIX;
            batch.matrixBuffer.copyWithin(removedSlot * floatsPerMatrix, lastSlot * floatsPerMatrix, (lastSlot + 1) * floatsPerMatrix);
            batch.placementIdBySlot[removedSlot] = movedPlacementId;
            batch.slotByPlacementId.set(movedPlacementId, removedSlot);
        }
        batch.placementIdBySlot.length = batch.count;
        batch.slotByPlacementId.delete(record.id);
        if (batch.count === 0) this.disposeBatch(record.originChunkKey, batch);
        else this.markDirty(batch);
    }

    // Records that were alive before their origin chunk loaded (they spilled into a neighbour) get drawn now.
    addMissingInstancesOfChunk(chunkKey) {
        for (const record of this.gridManager.placementsById.values()) {
            if (record.originChunkKey === chunkKey) this.addInstance(record);
        }
    }

    // ---- batches -------------------------------------------------------------------------------------------------------------

    batchFor(chunkKey, definition) {
        if (!this.batchesByChunkKey.has(chunkKey)) this.batchesByChunkKey.set(chunkKey, new Map());
        const chunkBatches = this.batchesByChunkKey.get(chunkKey);
        let batch = chunkBatches.get(definition.numericId);
        if (batch) return batch;
        const mesh = this.templateFor(definition).clone(`placed_${definition.name}_${chunkKey}`);
        mesh.setEnabled(true);
        mesh.isPickable = false;                          // picking is mathematical (PlacementSystem), never against these meshes
        batch = { mesh, definitionNumericId: definition.numericId, matrixBuffer: null, capacity: 0, count: 0, slotByPlacementId: new Map(), placementIdBySlot: [] };
        this.growBatch(batch, InstancedRenderer.INITIAL_CAPACITY);
        chunkBatches.set(definition.numericId, batch);
        return batch;
    }

    templateFor(definition) {
        let templateMesh = this.templateMeshByDefinitionId.get(definition.numericId);
        if (!templateMesh) {
            templateMesh = this.createTemplateMesh(definition, this.scene);
            templateMesh.setEnabled(false);
            templateMesh.isPickable = false;
            this.templateMeshByDefinitionId.set(definition.numericId, templateMesh);
        }
        return templateMesh;
    }

    // New, larger CPU buffer; the GPU buffer is re-created on the next flush (thinInstanceSetBuffer), not here.
    growBatch(batch, newCapacity) {
        const grownBuffer = new Float32Array(newCapacity * InstancedRenderer.FLOATS_PER_MATRIX);
        if (batch.matrixBuffer) grownBuffer.set(batch.matrixBuffer.subarray(0, batch.count * InstancedRenderer.FLOATS_PER_MATRIX));
        batch.matrixBuffer = grownBuffer;
        batch.capacity = newCapacity;
        batch.needsBufferRebind = true;
        this.markDirty(batch);
    }

    writeInstanceMatrix(batch, slot, record) {
        const center = GridManager.footprintCenter(record.layer, record.cellX, record.cellZ, record.width, record.depth);
        this.scratchPosition.set(center.x, record.level * PlacementSystem.FLOOR_HEIGHT, center.z);
        BABYLON.Quaternion.RotationYawPitchRollToRef(record.rotation * Math.PI / 2, 0, 0, this.scratchRotation);
        BABYLON.Matrix.ComposeToRef(this.unitScale, this.scratchRotation, this.scratchPosition, this.scratchMatrix);
        this.scratchMatrix.copyToArray(batch.matrixBuffer, slot * InstancedRenderer.FLOATS_PER_MATRIX);
    }

    markDirty(batch) {
        this.dirtyBatches.add(batch);
    }

    // One upload per dirty batch per frame.
    flushDirtyBatches() {
        for (const batch of this.dirtyBatches) {
            if (batch.mesh.isDisposed()) continue;
            if (batch.needsBufferRebind) {
                batch.mesh.thinInstanceSetBuffer('matrix', batch.matrixBuffer, InstancedRenderer.FLOATS_PER_MATRIX, false);
                batch.needsBufferRebind = false;
            } else {
                batch.mesh.thinInstanceBufferUpdated('matrix');
            }
            batch.mesh.thinInstanceCount = batch.count;
            batch.mesh.thinInstanceRefreshBoundingInfo(false);
        }
        this.dirtyBatches.clear();
    }

    // ---- disposal ------------------------------------------------------------------------------------------------------------

    disposeBatch(chunkKey, batch) {
        this.dirtyBatches.delete(batch);
        batch.mesh.dispose(false, false);                 // keep the shared geometry and material: the template still owns them
        batch.matrixBuffer = null;
        batch.slotByPlacementId.clear();
        batch.placementIdBySlot.length = 0;
        const chunkBatches = this.batchesByChunkKey.get(chunkKey);
        if (!chunkBatches) return;
        chunkBatches.delete(batch.definitionNumericId);
        if (chunkBatches.size === 0) this.batchesByChunkKey.delete(chunkKey);
    }

    disposeChunk(chunkKey) {
        const chunkBatches = this.batchesByChunkKey.get(chunkKey);
        if (!chunkBatches) return;
        for (const batch of [...chunkBatches.values()]) this.disposeBatch(chunkKey, batch);
    }

    dispose() {
        for (const unsubscribe of this.unsubscribers) unsubscribe();
        this.scene.onBeforeRenderObservable.remove(this.beforeRenderObserver);
        for (const chunkKey of [...this.batchesByChunkKey.keys()]) this.disposeChunk(chunkKey);
        for (const templateMesh of this.templateMeshByDefinitionId.values()) templateMesh.dispose();
        this.templateMeshByDefinitionId.clear();
    }

    drawCallCount() {
        let batchCount = 0;
        for (const chunkBatches of this.batchesByChunkKey.values()) batchCount += chunkBatches.size;
        return batchCount;
    }
}
