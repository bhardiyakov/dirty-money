// ============================================================================
// GridPersistence — moves the grid's state OFF the JavaScript thread: every 'placed' / 'removed' becomes a 24-byte delta, batched
// and sent once per idle slice as a raw Uint8Array over IPC to Rust (src-tauri/src/grid), which keeps the working grid of the
// whole city, indexes it by chunk and writes it to disk in binary. JS only ever holds the chunks around the player.
//
// Disk writes follow the game's save rules (SaveGame: only the pause menu or sleeping saves): deltas update Rust's WORKING grid;
// commitToSlot(slot) is what writes it to that slot's file, openSlot(slot) brings the slot's file back as the working grid and
// resetWorkingGrid() starts a new game. A building placed and never saved is gone after loading, like everything else.
//
// Wire format (little-endian). Batch header, 8 bytes:
//   u8 version · u8 reserved · u8 microPerMacro · u8 reserved · u16 chunkMicroCells · u16 recordCount
// Record, 24 bytes:
//   u32 placementId · u16 definitionNumericId · u8 kind (1 place, 2 remove) · u8 layer (0 macro, 1 micro) · i16 level
//   u8 rotation · u8 reserved · i32 cellX · i32 cellZ · u16 width · u16 depth
// grid_load_chunk answers with bare records (kind 1), every placement that overlaps the chunk.
//
// Outside the desktop app (browser build) MemoryGridBackend implements the same commands in JS and commits to Store.
// ============================================================================

class GridPersistence {
    static WIRE_VERSION = 1;
    static HEADER_BYTES = 8;
    static RECORD_BYTES = 24;
    static MAX_RECORDS_PER_BATCH = 0xffff;
    static DELTA_PLACE = 1;
    static DELTA_REMOVE = 2;
    static LAYER_CODES = { macro: 0, micro: 1 };

    constructor(gridManager, backend = GridPersistence.detectBackend()) {
        this.gridManager = gridManager;
        this.backend = backend;
        this.pendingDeltasByPlacementId = new Map();
        this.isFlushScheduled = false;
        this.lastWritePromise = Promise.resolve();
        this.chunkRequestsInFlight = new Map();               // chunkKey → Promise
        this.unsubscribers = [
            gridManager.on('placed', (record) => { if (!record.isRestored) this.queueDelta(record, GridPersistence.DELTA_PLACE); }),
            gridManager.on('removed', (record) => this.queueDelta(record, GridPersistence.DELTA_REMOVE)),
        ];
    }

    static detectBackend() {
        const tauriCore = typeof window !== 'undefined' && window.__TAURI__ && window.__TAURI__.core;
        return tauriCore ? new TauriGridBackend(tauriCore.invoke) : new MemoryGridBackend();
    }

    // ---- outgoing deltas -----------------------------------------------------------------------------------------------------

    queueDelta(record, kind) {
        const pendingDelta = this.pendingDeltasByPlacementId.get(record.id);
        // Placed and removed before the backend ever saw it: nothing to send.
        if (pendingDelta && pendingDelta.kind === GridPersistence.DELTA_PLACE && kind === GridPersistence.DELTA_REMOVE) {
            this.pendingDeltasByPlacementId.delete(record.id);
            return;
        }
        this.pendingDeltasByPlacementId.set(record.id, { kind, record });
        this.scheduleFlush();
    }

    scheduleFlush() {
        if (this.isFlushScheduled) return;
        this.isFlushScheduled = true;
        const flushWhenIdle = () => { this.isFlushScheduled = false; this.flushPendingDeltas(); };
        if (typeof requestIdleCallback === 'function') requestIdleCallback(flushWhenIdle, { timeout: 500 });
        else setTimeout(flushWhenIdle, 100);
    }

    // Sends what is pending now. Writes are chained, so the backend applies them in order and readers can await them.
    flushPendingDeltas() {
        if (this.pendingDeltasByPlacementId.size === 0) return this.lastWritePromise;
        const deltas = [...this.pendingDeltasByPlacementId.values()];
        this.pendingDeltasByPlacementId.clear();
        for (let batchStart = 0; batchStart < deltas.length; batchStart += GridPersistence.MAX_RECORDS_PER_BATCH) {
            const batchBytes = GridPersistence.encodeBatch(deltas.slice(batchStart, batchStart + GridPersistence.MAX_RECORDS_PER_BATCH));
            this.lastWritePromise = this.lastWritePromise
                .then(() => this.backend.applyDeltas(batchBytes))
                .catch((error) => console.warn('[GRID] deltas were not applied:', error));
        }
        return this.lastWritePromise;
    }

    static encodeBatch(deltas) {
        const bytes = new Uint8Array(GridPersistence.HEADER_BYTES + deltas.length * GridPersistence.RECORD_BYTES);
        const view = new DataView(bytes.buffer);
        view.setUint8(0, GridPersistence.WIRE_VERSION);
        view.setUint8(2, GridManager.MICRO_PER_MACRO);
        view.setUint16(4, GridManager.CHUNK_MICRO_CELLS, true);
        view.setUint16(6, deltas.length, true);
        deltas.forEach(({ kind, record }, index) => GridPersistence.encodeRecord(view, GridPersistence.HEADER_BYTES + index * GridPersistence.RECORD_BYTES, kind, record));
        return bytes;
    }

    static encodeRecord(view, offset, kind, record) {
        view.setUint32(offset, record.id, true);
        view.setUint16(offset + 4, record.definition.numericId, true);
        view.setUint8(offset + 6, kind);
        view.setUint8(offset + 7, GridPersistence.LAYER_CODES[record.layer]);
        view.setInt16(offset + 8, record.level, true);
        view.setUint8(offset + 10, record.rotation);
        view.setInt32(offset + 12, record.cellX, true);
        view.setInt32(offset + 16, record.cellZ, true);
        view.setUint16(offset + 20, record.width, true);
        view.setUint16(offset + 22, record.depth, true);
    }

    static decodeRecords(arrayBuffer) {
        const view = new DataView(arrayBuffer);
        const persistedRecords = [];
        for (let offset = 0; offset + GridPersistence.RECORD_BYTES <= view.byteLength; offset += GridPersistence.RECORD_BYTES) {
            persistedRecords.push({
                id: view.getUint32(offset, true),
                definitionNumericId: view.getUint16(offset + 4, true),
                level: view.getInt16(offset + 8, true),
                rotation: view.getUint8(offset + 10),
                cellX: view.getInt32(offset + 12, true),
                cellZ: view.getInt32(offset + 16, true),
            });
        }
        return persistedRecords;
    }

    // ---- chunk streaming -----------------------------------------------------------------------------------------------------

    // Loads the missing chunks within `loadRadius` and garbage-collects the ones beyond `unloadRadius` (> loadRadius: hysteresis,
    // so walking along a chunk border does not load and drop the same chunk every frame). Call it a few times per second.
    streamAround(level, worldX, worldZ, loadRadius, unloadRadius) {
        this.gridManager.collectChunksOutside(worldX, worldZ, unloadRadius);
        for (const { chunkX, chunkZ } of this.gridManager.missingChunksAround(level, worldX, worldZ, loadRadius)) {
            this.requestChunk(level, chunkX, chunkZ);
        }
    }

    // Resolves once the chunk is in the GridManager (a second request for a chunk on its way shares the first one).
    requestChunk(level, chunkX, chunkZ) {
        const chunkKey = GridManager.chunkKey(level, chunkX, chunkZ);
        if (this.chunkRequestsInFlight.has(chunkKey)) return this.chunkRequestsInFlight.get(chunkKey);
        const request = this.loadChunkFromBackend(level, chunkX, chunkZ).finally(() => this.chunkRequestsInFlight.delete(chunkKey));
        this.chunkRequestsInFlight.set(chunkKey, request);
        return request;
    }

    async loadChunkFromBackend(level, chunkX, chunkZ) {
        try {
            await this.flushPendingDeltas();              // the backend must know our last edits before it answers for this chunk
            const recordBytes = await this.backend.loadChunk(level, chunkX, chunkZ);
            if (!this.gridManager.isChunkLoaded(level, chunkX, chunkZ)) {
                this.gridManager.loadChunk(level, chunkX, chunkZ, GridPersistence.decodeRecords(recordBytes));
            }
        } catch (error) {
            console.warn(`[GRID] chunk ${GridManager.chunkKey(level, chunkX, chunkZ)} failed to load:`, error);
        }
    }

    // ---- save slots ----------------------------------------------------------------------------------------------------------

    async openSlot(saveSlot) {
        await this.flushPendingDeltas();
        this.unloadAllChunks();
        const nextPlacementId = await this.backend.openSlot(saveSlot);
        this.gridManager.nextPlacementId = Math.max(1, nextPlacementId);
    }

    async resetWorkingGrid() {
        this.pendingDeltasByPlacementId.clear();
        await this.lastWritePromise;
        this.unloadAllChunks();
        await this.backend.resetWorkingGrid();
        this.gridManager.nextPlacementId = 1;
    }

    async commitToSlot(saveSlot) {
        await this.flushPendingDeltas();
        await this.backend.commitToSlot(saveSlot);
    }

    deleteSlot(saveSlot) {
        return this.backend.deleteSlot(saveSlot);
    }

    unloadAllChunks() {
        for (const chunk of [...this.gridManager.loadedChunks.values()]) this.gridManager.unloadChunk(chunk.level, chunk.chunkX, chunk.chunkZ);
    }

    dispose() {
        for (const unsubscribe of this.unsubscribers) unsubscribe();
        return this.flushPendingDeltas();
    }
}

// Desktop app: the Rust commands of src-tauri/src/grid. Raw Uint8Array bodies, raw ArrayBuffer answers (no JSON on the hot path).
class TauriGridBackend {
    constructor(invoke) {
        this.invoke = invoke;
    }

    applyDeltas(batchBytes) { return this.invoke('grid_apply_deltas', batchBytes); }
    loadChunk(level, chunkX, chunkZ) { return this.invoke('grid_load_chunk', { level, chunkX, chunkZ }); }
    openSlot(saveSlot) { return this.invoke('grid_open_slot', { saveSlot }); }
    resetWorkingGrid() { return this.invoke('grid_reset_working'); }
    commitToSlot(saveSlot) { return this.invoke('grid_commit_slot', { saveSlot }); }
    deleteSlot(saveSlot) { return this.invoke('grid_delete_slot', { saveSlot }); }
}

// Browser build: the same contract in JS. The working grid is a map of encoded records; a commit stores it in Store (base64).
class MemoryGridBackend {
    constructor() {
        this.workingRecordsById = new Map();              // id → Uint8Array(24)
    }

    async applyDeltas(batchBytes) {
        const view = new DataView(batchBytes.buffer, batchBytes.byteOffset, batchBytes.byteLength);
        const recordCount = view.getUint16(6, true);
        for (let index = 0; index < recordCount; index++) {
            const offset = GridPersistence.HEADER_BYTES + index * GridPersistence.RECORD_BYTES;
            const placementId = view.getUint32(offset, true);
            if (view.getUint8(offset + 6) === GridPersistence.DELTA_REMOVE) this.workingRecordsById.delete(placementId);
            else this.workingRecordsById.set(placementId, batchBytes.slice(offset, offset + GridPersistence.RECORD_BYTES));
        }
    }

    async loadChunk(level, chunkX, chunkZ) {
        const overlappingRecords = [];
        for (const recordBytes of this.workingRecordsById.values()) {
            const view = new DataView(recordBytes.buffer, recordBytes.byteOffset, recordBytes.byteLength);
            if (view.getInt16(8, true) !== level) continue;
            const layer = view.getUint8(7) === GridPersistence.LAYER_CODES.macro ? 'macro' : 'micro';
            const range = GridManager.chunkRangeOf(layer, view.getInt32(12, true), view.getInt32(16, true), view.getUint16(20, true), view.getUint16(22, true));
            if (chunkX >= range.minChunkX && chunkX <= range.maxChunkX && chunkZ >= range.minChunkZ && chunkZ <= range.maxChunkZ) overlappingRecords.push(recordBytes);
        }
        const answer = new Uint8Array(overlappingRecords.length * GridPersistence.RECORD_BYTES);
        overlappingRecords.forEach((recordBytes, index) => answer.set(recordBytes, index * GridPersistence.RECORD_BYTES));
        return answer.buffer;
    }

    async openSlot(saveSlot) {
        this.workingRecordsById.clear();
        const savedBytes = MemoryGridBackend.fromBase64(Store.get(MemoryGridBackend.storeKey(saveSlot)) || '');
        let nextPlacementId = 1;
        for (let offset = 0; offset + GridPersistence.RECORD_BYTES <= savedBytes.length; offset += GridPersistence.RECORD_BYTES) {
            const recordBytes = savedBytes.slice(offset, offset + GridPersistence.RECORD_BYTES);
            const placementId = new DataView(recordBytes.buffer).getUint32(0, true);
            this.workingRecordsById.set(placementId, recordBytes);
            nextPlacementId = Math.max(nextPlacementId, placementId + 1);
        }
        return nextPlacementId;
    }

    async resetWorkingGrid() {
        this.workingRecordsById.clear();
    }

    async commitToSlot(saveSlot) {
        const allRecords = new Uint8Array(this.workingRecordsById.size * GridPersistence.RECORD_BYTES);
        [...this.workingRecordsById.values()].forEach((recordBytes, index) => allRecords.set(recordBytes, index * GridPersistence.RECORD_BYTES));
        Store.set(MemoryGridBackend.storeKey(saveSlot), MemoryGridBackend.toBase64(allRecords));
    }

    async deleteSlot(saveSlot) {
        Store.remove(MemoryGridBackend.storeKey(saveSlot));
    }

    static storeKey(saveSlot) { return `grid${saveSlot}`; }

    static toBase64(bytes) {
        let binaryText = '';
        for (let index = 0; index < bytes.length; index += 0x8000) binaryText += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
        return btoa(binaryText);
    }

    static fromBase64(text) {
        const binaryText = atob(text);
        const bytes = new Uint8Array(binaryText.length);
        for (let index = 0; index < binaryText.length; index++) bytes[index] = binaryText.charCodeAt(index);
        return bytes;
    }
}
