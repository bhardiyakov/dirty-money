// ============================================================================
// GridManager — the DUAL-LAYER placement grid as pure data: no Babylon node exists for a cell, empty or not.
//
//   MACRO layer   coarse cells (MACRO_CELL_SIZE m): terrain, logistics, walls, room slabs — the "empire" layer
//   MICRO layer   fine cells (MICRO_CELL_SIZE m, MICRO_PER_MACRO per macro side): furniture and decoration — the "Sims" layer
//
// Space is partitioned into square CHUNKS (CHUNK_MACRO_CELLS macro cells per side) per floor level. A loaded chunk owns two
// typed occupancy matrices (macro + micro) whose entries are placement ids (0 = free); nothing else is allocated per cell.
// Placements live in one dictionary (id → record) and are reference-counted by the loaded chunks they overlap: an item that
// straddles a border survives while ANY of its chunks is loaded and is dropped from RAM with the last one.
//
//   loadChunk(level, chunkX, chunkZ, records?)  allocates the matrices and stamps persisted placements (from GridPersistence)
//   unloadChunk(level, chunkX, chunkZ)          HARD garbage collection: matrices + orphaned records leave the JS heap and
//                                               'chunkUnloaded' tells the renderer to dispose() that chunk's Babylon nodes
//   collectChunksOutside(level, x, z, radius)   unloads every chunk farther than `radius` (call it when the player moves)
//   validatePlacement(request) → { isValid, reason }   overlap test against the matrices only (no physics, no bounding boxes)
//   place(request) → record | null · removePlacement(id) · placementAtCell(layer, level, cellX, cellZ)
//   on(eventName, listener)   'placed' · 'removed' · 'chunkLoaded' · 'chunkUnloaded'
//
// A request is { definition, layer, level, cellX, cellZ, rotation } with the cell in its own layer's coordinates. Definitions:
//   { numericId, name, layer: 'macro'|'micro', width, depth, height?, blocksMicro?, providesInterior?, requiresInterior? }
//   blocksMicro        macro only: its macro cells reject every micro item (walls, machinery)
//   providesInterior   macro only: its macro cells are an indoor floor (room slab)
//   requiresInterior   micro only: every micro cell must sit on a providesInterior macro cell (furniture)
// ============================================================================

class GridManager {
    static MACRO_CELL_SIZE = 4;
    static MICRO_PER_MACRO = 8;
    static MICRO_CELL_SIZE = GridManager.MACRO_CELL_SIZE / GridManager.MICRO_PER_MACRO;
    static CHUNK_MACRO_CELLS = 16;
    static CHUNK_MICRO_CELLS = GridManager.CHUNK_MACRO_CELLS * GridManager.MICRO_PER_MACRO;
    static CHUNK_WORLD_SIZE = GridManager.CHUNK_MACRO_CELLS * GridManager.MACRO_CELL_SIZE;
    static LAYERS = ['macro', 'micro'];
    static EMPTY_CELL = 0;

    constructor(definitionRegistry) {
        this.definitionRegistry = definitionRegistry;      // numericId → definition (to rebuild records loaded from disk)
        this.loadedChunks = new Map();                     // chunkKey → { level, chunkX, chunkZ, macroCells, microCells, placementIds }
        this.placementsById = new Map();                   // id → record
        this.listenersByEvent = new Map();
        this.nextPlacementId = 1;
    }

    // ---- events --------------------------------------------------------------------------------------------------------------

    on(eventName, listener) {
        if (!this.listenersByEvent.has(eventName)) this.listenersByEvent.set(eventName, new Set());
        this.listenersByEvent.get(eventName).add(listener);
        return () => this.listenersByEvent.get(eventName).delete(listener);
    }

    emit(eventName, payload) {
        const listeners = this.listenersByEvent.get(eventName);
        if (!listeners) return;
        for (const listener of listeners) listener(payload);
    }

    // ---- coordinates ---------------------------------------------------------------------------------------------------------

    static cellSizeOf(layer) {
        return layer === 'macro' ? GridManager.MACRO_CELL_SIZE : GridManager.MICRO_CELL_SIZE;
    }

    static chunkCellsOf(layer) {
        return layer === 'macro' ? GridManager.CHUNK_MACRO_CELLS : GridManager.CHUNK_MICRO_CELLS;
    }

    static chunkKey(level, chunkX, chunkZ) {
        return `${level}:${chunkX}:${chunkZ}`;
    }

    static worldToCell(layer, worldX, worldZ) {
        const cellSize = GridManager.cellSizeOf(layer);
        return { cellX: Math.floor(worldX / cellSize), cellZ: Math.floor(worldZ / cellSize) };
    }

    static cellToChunk(layer, cellX, cellZ) {
        const chunkCells = GridManager.chunkCellsOf(layer);
        return { chunkX: Math.floor(cellX / chunkCells), chunkZ: Math.floor(cellZ / chunkCells) };
    }

    static worldToChunk(worldX, worldZ) {
        const chunkWorldSize = GridManager.CHUNK_WORLD_SIZE;
        return { chunkX: Math.floor(worldX / chunkWorldSize), chunkZ: Math.floor(worldZ / chunkWorldSize) };
    }

    // Footprint in cells after a quarter-turn rotation (0..3): odd turns swap width and depth.
    static rotatedFootprint(definition, rotation) {
        const isQuarterTurn = rotation % 2 === 1;
        return { width: isQuarterTurn ? definition.depth : definition.width, depth: isQuarterTurn ? definition.width : definition.depth };
    }

    // World-space centre of a footprint whose min corner is (cellX, cellZ).
    static footprintCenter(layer, cellX, cellZ, width, depth) {
        const cellSize = GridManager.cellSizeOf(layer);
        return { x: (cellX + width / 2) * cellSize, z: (cellZ + depth / 2) * cellSize };
    }

    // ---- chunk lifecycle -----------------------------------------------------------------------------------------------------

    isChunkLoaded(level, chunkX, chunkZ) {
        return this.loadedChunks.has(GridManager.chunkKey(level, chunkX, chunkZ));
    }

    loadChunk(level, chunkX, chunkZ, persistedRecords = []) {
        const chunkKey = GridManager.chunkKey(level, chunkX, chunkZ);
        if (this.loadedChunks.has(chunkKey)) return this.loadedChunks.get(chunkKey);
        const chunk = {
            key: chunkKey, level, chunkX, chunkZ,
            macroCells: new Uint32Array(GridManager.CHUNK_MACRO_CELLS * GridManager.CHUNK_MACRO_CELLS),
            microCells: new Uint32Array(GridManager.CHUNK_MICRO_CELLS * GridManager.CHUNK_MICRO_CELLS),
            placementIds: new Set(),
        };
        this.loadedChunks.set(chunkKey, chunk);
        // Items already alive (they spill in from a loaded neighbour) only need their cells stamped into the new matrices.
        for (const record of this.placementsById.values()) {
            if (record.level === level && this.recordOverlapsChunk(record, chunkX, chunkZ)) this.stampRecordIntoChunk(record, chunk);
        }
        for (const persistedRecord of persistedRecords) this.restorePersistedRecord(persistedRecord);
        this.emit('chunkLoaded', chunk);
        return chunk;
    }

    unloadChunk(level, chunkX, chunkZ) {
        const chunkKey = GridManager.chunkKey(level, chunkX, chunkZ);
        const chunk = this.loadedChunks.get(chunkKey);
        if (!chunk) return;
        this.loadedChunks.delete(chunkKey);
        for (const placementId of chunk.placementIds) {
            const record = this.placementsById.get(placementId);
            if (!record) continue;
            record.loadedChunkKeys.delete(chunkKey);
            if (record.loadedChunkKeys.size === 0) this.placementsById.delete(placementId);
        }
        chunk.placementIds.clear();
        chunk.macroCells = null;
        chunk.microCells = null;
        this.emit('chunkUnloaded', { key: chunkKey, level, chunkX, chunkZ });
    }

    // Unloads every chunk (any level) whose centre is farther than `radius` metres from (worldX, worldZ). Returns how many.
    collectChunksOutside(worldX, worldZ, radius) {
        const halfChunk = GridManager.CHUNK_WORLD_SIZE / 2;
        const chunksToUnload = [];
        for (const chunk of this.loadedChunks.values()) {
            const centerX = chunk.chunkX * GridManager.CHUNK_WORLD_SIZE + halfChunk;
            const centerZ = chunk.chunkZ * GridManager.CHUNK_WORLD_SIZE + halfChunk;
            if (Math.hypot(centerX - worldX, centerZ - worldZ) > radius) chunksToUnload.push(chunk);
        }
        for (const chunk of chunksToUnload) this.unloadChunk(chunk.level, chunk.chunkX, chunk.chunkZ);
        return chunksToUnload.length;
    }

    // Chunk keys (level, chunkX, chunkZ) within `radius` metres that are not loaded yet: what the streamer should request.
    missingChunksAround(level, worldX, worldZ, radius) {
        const chunkWorldSize = GridManager.CHUNK_WORLD_SIZE;
        const minChunk = GridManager.worldToChunk(worldX - radius, worldZ - radius);
        const maxChunk = GridManager.worldToChunk(worldX + radius, worldZ + radius);
        const missingChunks = [];
        for (let chunkX = minChunk.chunkX; chunkX <= maxChunk.chunkX; chunkX++) {
            for (let chunkZ = minChunk.chunkZ; chunkZ <= maxChunk.chunkZ; chunkZ++) {
                const centerX = (chunkX + 0.5) * chunkWorldSize, centerZ = (chunkZ + 0.5) * chunkWorldSize;
                if (Math.hypot(centerX - worldX, centerZ - worldZ) > radius) continue;
                if (!this.isChunkLoaded(level, chunkX, chunkZ)) missingChunks.push({ level, chunkX, chunkZ });
            }
        }
        return missingChunks;
    }

    // ---- matrix access -------------------------------------------------------------------------------------------------------

    // Occupancy id at a layer cell; undefined when its chunk is not loaded (unknown is never "free").
    occupantAt(layer, level, cellX, cellZ) {
        const { chunkX, chunkZ } = GridManager.cellToChunk(layer, cellX, cellZ);
        const chunk = this.loadedChunks.get(GridManager.chunkKey(level, chunkX, chunkZ));
        if (!chunk) return undefined;
        const chunkCells = GridManager.chunkCellsOf(layer);
        const localIndex = (cellZ - chunkZ * chunkCells) * chunkCells + (cellX - chunkX * chunkCells);
        return (layer === 'macro' ? chunk.macroCells : chunk.microCells)[localIndex];
    }

    placementAtCell(layer, level, cellX, cellZ) {
        const occupantId = this.occupantAt(layer, level, cellX, cellZ);
        return occupantId ? this.placementsById.get(occupantId) || null : null;
    }

    writeCells(record, chunk, value) {
        const chunkCells = GridManager.chunkCellsOf(record.layer);
        const cells = record.layer === 'macro' ? chunk.macroCells : chunk.microCells;
        const chunkMinX = chunk.chunkX * chunkCells, chunkMinZ = chunk.chunkZ * chunkCells;
        const fromX = Math.max(record.cellX, chunkMinX), toX = Math.min(record.cellX + record.width, chunkMinX + chunkCells);
        const fromZ = Math.max(record.cellZ, chunkMinZ), toZ = Math.min(record.cellZ + record.depth, chunkMinZ + chunkCells);
        for (let cellZ = fromZ; cellZ < toZ; cellZ++) {
            const rowOffset = (cellZ - chunkMinZ) * chunkCells - chunkMinX;
            cells.fill(value, rowOffset + fromX, rowOffset + toX);
        }
    }

    stampRecordIntoChunk(record, chunk) {
        this.writeCells(record, chunk, record.id);
        chunk.placementIds.add(record.id);
        record.loadedChunkKeys.add(chunk.key);
    }

    // Chunks (x, z ranges, inclusive) covered by a footprint.
    static chunkRangeOf(layer, cellX, cellZ, width, depth) {
        const minChunk = GridManager.cellToChunk(layer, cellX, cellZ);
        const maxChunk = GridManager.cellToChunk(layer, cellX + width - 1, cellZ + depth - 1);
        return { minChunkX: minChunk.chunkX, minChunkZ: minChunk.chunkZ, maxChunkX: maxChunk.chunkX, maxChunkZ: maxChunk.chunkZ };
    }

    recordOverlapsChunk(record, chunkX, chunkZ) {
        const range = GridManager.chunkRangeOf(record.layer, record.cellX, record.cellZ, record.width, record.depth);
        return chunkX >= range.minChunkX && chunkX <= range.maxChunkX && chunkZ >= range.minChunkZ && chunkZ <= range.maxChunkZ;
    }

    // ---- validation (matrix data only) ---------------------------------------------------------------------------------------

    validatePlacement({ definition, layer = definition.layer, level = 0, cellX, cellZ, rotation = 0 }) {
        if (layer !== definition.layer) return { isValid: false, reason: `${definition.name} belongs to the ${definition.layer} layer` };
        const { width, depth } = GridManager.rotatedFootprint(definition, rotation);
        for (let offsetZ = 0; offsetZ < depth; offsetZ++) {
            for (let offsetX = 0; offsetX < width; offsetX++) {
                const occupantId = this.occupantAt(layer, level, cellX + offsetX, cellZ + offsetZ);
                if (occupantId === undefined) return { isValid: false, reason: 'area not loaded' };
                if (occupantId !== GridManager.EMPTY_CELL) return { isValid: false, reason: 'cell occupied', blockingPlacementId: occupantId };
            }
        }
        if (layer === 'micro') return this.validateMicroSupport(definition, level, cellX, cellZ, width, depth);
        return { isValid: true, reason: null };
    }

    // Micro items look one layer down: the macro cell under each micro cell must not block it, and must be indoor if required.
    validateMicroSupport(definition, level, cellX, cellZ, width, depth) {
        const microPerMacro = GridManager.MICRO_PER_MACRO;
        const minMacroX = Math.floor(cellX / microPerMacro), maxMacroX = Math.floor((cellX + width - 1) / microPerMacro);
        const minMacroZ = Math.floor(cellZ / microPerMacro), maxMacroZ = Math.floor((cellZ + depth - 1) / microPerMacro);
        for (let macroZ = minMacroZ; macroZ <= maxMacroZ; macroZ++) {
            for (let macroX = minMacroX; macroX <= maxMacroX; macroX++) {
                const supportingRecord = this.placementAtCell('macro', level, macroX, macroZ);
                const supportingDefinition = supportingRecord ? supportingRecord.definition : null;
                if (supportingDefinition && supportingDefinition.blocksMicro) return { isValid: false, reason: `blocked by ${supportingDefinition.name}` };
                if (definition.requiresInterior && !(supportingDefinition && supportingDefinition.providesInterior)) {
                    return { isValid: false, reason: 'needs an indoor floor' };
                }
            }
        }
        return { isValid: true, reason: null };
    }

    // A macro structure cannot be removed while micro items stand on its cells (no floating furniture).
    validateRemoval(record) {
        if (record.layer !== 'macro' || !record.definition.providesInterior) return { isValid: true, reason: null };
        const microPerMacro = GridManager.MICRO_PER_MACRO;
        const microMinX = record.cellX * microPerMacro, microMinZ = record.cellZ * microPerMacro;
        for (let cellZ = microMinZ; cellZ < microMinZ + record.depth * microPerMacro; cellZ++) {
            for (let cellX = microMinX; cellX < microMinX + record.width * microPerMacro; cellX++) {
                const occupantId = this.occupantAt('micro', record.level, cellX, cellZ);
                if (occupantId) return { isValid: false, reason: 'remove the furniture on it first', blockingPlacementId: occupantId };
            }
        }
        return { isValid: true, reason: null };
    }

    // ---- mutation ------------------------------------------------------------------------------------------------------------

    place(request) {
        const validation = this.validatePlacement(request);
        if (!validation.isValid) return null;
        const { definition, level = 0, cellX, cellZ, rotation = 0 } = request;
        const record = this.createRecord(this.nextPlacementId++, definition, level, cellX, cellZ, rotation);
        this.insertRecord(record);
        this.emit('placed', record);
        return record;
    }

    removePlacement(placementId) {
        const record = this.placementsById.get(placementId);
        if (!record || !this.validateRemoval(record).isValid) return null;
        for (const chunkKey of record.loadedChunkKeys) {
            const chunk = this.loadedChunks.get(chunkKey);
            this.writeCells(record, chunk, GridManager.EMPTY_CELL);
            chunk.placementIds.delete(record.id);
        }
        record.loadedChunkKeys.clear();
        this.placementsById.delete(placementId);
        this.emit('removed', record);
        return record;
    }

    createRecord(id, definition, level, cellX, cellZ, rotation) {
        const { width, depth } = GridManager.rotatedFootprint(definition, rotation);
        const origin = GridManager.cellToChunk(definition.layer, cellX, cellZ);
        return {
            id, definition, layer: definition.layer, level, cellX, cellZ, rotation, width, depth,
            originChunkKey: GridManager.chunkKey(level, origin.chunkX, origin.chunkZ),   // the chunk whose renderer batch draws it
            loadedChunkKeys: new Set(),
        };
    }

    insertRecord(record) {
        this.placementsById.set(record.id, record);
        const range = GridManager.chunkRangeOf(record.layer, record.cellX, record.cellZ, record.width, record.depth);
        for (let chunkX = range.minChunkX; chunkX <= range.maxChunkX; chunkX++) {
            for (let chunkZ = range.minChunkZ; chunkZ <= range.maxChunkZ; chunkZ++) {
                const chunk = this.loadedChunks.get(GridManager.chunkKey(record.level, chunkX, chunkZ));
                if (chunk) this.stampRecordIntoChunk(record, chunk);
            }
        }
    }

    // A record from disk ({ id, definitionNumericId, level, cellX, cellZ, rotation }). Ids already alive are skipped: the
    // backend sends a straddling item with every chunk it overlaps.
    restorePersistedRecord(persistedRecord) {
        this.nextPlacementId = Math.max(this.nextPlacementId, persistedRecord.id + 1);
        if (this.placementsById.has(persistedRecord.id)) return;
        const definition = this.definitionRegistry.get(persistedRecord.definitionNumericId);
        if (!definition) {
            console.warn(`[GRID] unknown definition ${persistedRecord.definitionNumericId} for placement ${persistedRecord.id}`);
            return;
        }
        const { id, level, cellX, cellZ, rotation } = persistedRecord;
        const record = this.createRecord(id, definition, level, cellX, cellZ, rotation);
        this.insertRecord(record);
        this.emit('placed', Object.assign(record, { isRestored: true }));
    }
}
