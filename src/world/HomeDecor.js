// ============================================================================
// HomeDecor — DECORATION MODE at home: inside the safe house or a bought property, B opens the furniture catalogue and the player
// places 3D furniture on the floor (FurnitureCatalog pieces on the placement grid of src/placement/).
//
// Every home owns a REGION of the grid: one chunk (64 u) at chunk (regionIndex, 0), level 0, with the room's local coordinates
// (origin at its south-west corner, like Interiors' stage) offset by regionIndex × 64. All homes are drawn on the same interiors
// stage, so the renderer's root node and the cursor's grid offset translate region → stage. Entering a home loads its chunk
// (GridPersistence → Rust); leaving garbage-collects it (matrices out of RAM, thin-instance meshes disposed).
//
// The room itself is matrix data too: outside the floor, the walls, built-in furniture (data.obs), the doorway and a ring around
// what the player uses (bed, fridge, safe…) are STATIC_BLOCKER cells, rebuilt on every load. Placed furniture (except rugs) becomes
// a solid of Interiors.obstacles, so the player walks around it.
//
// Money: a piece costs its price (dirty cash first, then clean); removing it gives half back in cash; MOVING one is free. Pieces
// with a `use` (bed, fridge, chest, safe, notebook desk) work like the painted ones (Interiors.homeUse merges uses()), which is
// what makes a home bought WITHOUT FURNITURE (RealEstate.FURNISH) livable. When the room changes under the furniture (a reform, or
// furnishing an empty home "porteira fechada"), pieces that now overlap the room's own furniture go back to the player, paid in full.
//
// Saves: SaveGame's snapshot keeps the regions map and a per-home summary (value and uses, so the property sheet and the sale price
// know a home's furniture without loading it); the grid itself is written by GridPersistence.commitToSlot when the game is saved.
//
// Controls in decoration mode: click a piece in the bar · move the mouse · left click places · R rotates · right click cancels the
// piece (or, with none selected, removes the piece under the cursor) · left click on a placed piece picks it up to move it ·
// W/A/S/D pan the camera · B or Esc leave.
// ============================================================================

const HomeDecor = {
    LEVEL: 0,
    FLOOR_Y: 0.14,                                        // the painted floor of the stage room (Interiors._room)
    WALL_THICKNESS: 0.7,
    DOOR_CLEARANCE: 2.4,
    USE_CLEARANCE: 0.9,
    REFUND_SHARE: 0.5,
    CAMERA_PAN_SPEED: 9,

    ready: false,
    active: false,
    regionsByHomeId: {},
    summariesByHomeId: {},                                // homeId → { value, uses: { bed: n, … } }
    movingPiece: null,                                    // { definition, cellX, cellZ, rotation } while a placed piece is carried
    currentHome: null,                                    // { homeId, regionIndex, data, isLoaded }
    selectedDefinition: null,
    cameraFocus: { x: 0, z: 0 },                          // camera target while decorating (W/A/S/D pan it)
    barShift: 0,
    baseObstacles: [],

    // ---- lifecycle -----------------------------------------------------------------------------------------------------------

    init(game) {
        if (this.ready) return;
        this.game = game;
        this.definitions = FurnitureCatalog.registry();
        this.gridManager = new GridManager(this.definitions);
        this.stageRoot = new BABYLON.TransformNode('homeDecorRoot', game.scene);
        // alwaysActive: the game's RenderCuller places a parented mesh by its ROOT's position, and the root sits one region away
        // from the stage per home (2936 for region 1…); there are only a few furniture batches, and only inside a home.
        this.renderer = new InstancedRenderer(game.scene, this.gridManager, (definition, scene) => FurnitureCatalog.createTemplateMesh(definition, scene), { rootNode: this.stageRoot, alwaysActive: true });
        this.placementSystem = new PlacementSystem(game.scene, game.camera.camera, this.gridManager, this.renderer);
        this.persistence = new GridPersistence(this.gridManager);
        this.gridManager.on('placed', () => this.rebuildObstacles());
        this.gridManager.on('removed', () => this.rebuildObstacles());
        this.ready = true;
    },

    // New game (saveSlot null) or a loaded save: the backend's working grid starts from that slot.
    async startSession(saveSlot) {
        this.regionsByHomeId = {};
        this.summariesByHomeId = {};
        if (saveSlot) await this.persistence.openSlot(saveSlot);
        else await this.persistence.resetWorkingGrid();
    },

    serialize() {
        return { regions: Object.assign({}, this.regionsByHomeId), summaries: JSON.parse(JSON.stringify(this.summariesByHomeId)) };
    },

    load(savedDecor) {
        this.regionsByHomeId = Object.assign({}, (savedDecor && savedDecor.regions) || {});
        this.summariesByHomeId = Object.assign({}, (savedDecor && savedDecor.summaries) || {});
    },

    // What the decoration of a home is worth (sum of the prices paid) and whether it has a working piece of a kind.
    valueOf(homeId) {
        const summary = this.summariesByHomeId[String(homeId)];
        return summary ? summary.value : 0;
    },

    hasUse(homeId, use) {
        const summary = this.summariesByHomeId[String(homeId)];
        return !!(summary && summary.uses[use]);
    },

    commitToSlot(saveSlot) {
        if (!this.ready) return Promise.resolve();
        return this.persistence.commitToSlot(saveSlot).catch((error) => console.error('[DECOR] the furniture was not saved:', error));
    },

    // ---- homes ---------------------------------------------------------------------------------------------------------------

    homeIdOf(shop) {
        if (shop.safehouse) return 'safehouse';
        return shop.home ? String(shop.home.id) : null;
    },

    regionFor(homeId) {
        if (this.regionsByHomeId[homeId] === undefined) {
            const usedRegions = Object.values(this.regionsByHomeId);
            this.regionsByHomeId[homeId] = usedRegions.length ? Math.max(...usedRegions) + 1 : 0;
        }
        return this.regionsByHomeId[homeId];
    },

    regionOriginX(regionIndex) {
        return regionIndex * GridManager.CHUNK_WORLD_SIZE;
    },

    // Interiors._doEnter: an owned home loads its furniture.
    onEnterInterior(game, shop) {
        if (!this.ready || !Interiors._owned(shop)) return;
        const homeId = this.homeIdOf(shop);
        if (!homeId) return;
        const regionIndex = this.regionFor(homeId), stage = Interiors.STAGE;
        const home = this.currentHome = { homeId, regionIndex, data: Interiors.active.data, isLoaded: false };
        this.baseObstacles = Interiors.obstacles.slice();
        const gridOffset = new BABYLON.Vector3(stage.x - this.regionOriginX(regionIndex), this.FLOOR_Y, stage.z);
        this.stageRoot.position.copyFrom(gridOffset);
        this.placementSystem.setGridOffset(gridOffset);
        this.persistence.requestChunk(this.LEVEL, regionIndex, 0).then(() => {
            if (this.currentHome !== home) return;
            home.isLoaded = true;
            this.refreshStaticBlockers();
            this.returnPiecesInTheWay(game);
            this.rebuildObstacles();
        });
    },

    // Interiors._doLeave: the home's chunk leaves memory (GridManager GC → InstancedRenderer disposes its meshes).
    onLeaveInterior() {
        if (!this.currentHome) return;
        this.close();
        const { regionIndex } = this.currentHome;
        this.currentHome = null;
        this.baseObstacles = [];
        this.gridManager.unloadChunk(this.LEVEL, regionIndex, 0);
    },

    // RealEstate.sell: the furniture stays with the property (removed from the grid; the region is free again).
    async forgetHome(homeId) {
        if (!this.ready) return;
        const regionIndex = this.regionsByHomeId[String(homeId)];
        if (regionIndex === undefined) return;
        delete this.regionsByHomeId[String(homeId)];
        delete this.summariesByHomeId[String(homeId)];
        await this.persistence.requestChunk(this.LEVEL, regionIndex, 0);
        const regionChunkKey = GridManager.chunkKey(this.LEVEL, regionIndex, 0);
        const recordsOfRegion = [...this.gridManager.placementsById.values()].filter((record) => record.originChunkKey === regionChunkKey);
        for (const record of recordsOfRegion) this.gridManager.removePlacement(record.id);
        if (!this.currentHome || this.currentHome.regionIndex !== regionIndex) this.gridManager.unloadChunk(this.LEVEL, regionIndex, 0);
    },

    // ---- room as matrix data -------------------------------------------------------------------------------------------------

    // Local rect (room coordinates, u) → micro cells, growing (cover) or shrinking (inside) to whole cells.
    localRectToCells(regionIndex, x0, z0, x1, z1, mode) {
        const cellSize = GridManager.MICRO_CELL_SIZE, originX = this.regionOriginX(regionIndex);
        const lower = mode === 'cover' ? Math.floor : Math.ceil, upper = mode === 'cover' ? Math.ceil : Math.floor;
        return [lower((originX + x0) / cellSize), lower(z0 / cellSize), upper((originX + x1) / cellSize), upper(z1 / cellSize)];
    },

    // Everything but the free floor becomes STATIC_BLOCKER; `extraRects` (local) too (the player while decorating).
    refreshStaticBlockers(extraRects = []) {
        const home = this.currentHome;
        if (!home || !home.isLoaded) return;
        const grid = this.gridManager, level = this.LEVEL, regionIndex = home.regionIndex, data = home.data;
        const chunkCells = GridManager.CHUNK_MICRO_CELLS;
        const chunkBounds = [regionIndex * chunkCells, 0, (regionIndex + 1) * chunkCells, chunkCells];
        const roomBlockers = home.roomBlockerCells = [];                 // the room's own solids (for returnPiecesInTheWay)
        const mark = (cells, isRoomBlocker = true) => {
            if (isRoomBlocker) roomBlockers.push(cells);
            grid.markStaticBlockers('micro', level, ...cells);
        };
        grid.clearStaticBlockers('micro', level, ...chunkBounds);
        mark(chunkBounds, false);
        const wall = this.WALL_THICKNESS;
        home.floorCells = this.localRectToCells(regionIndex, wall, wall, data.W - wall, data.D - wall, 'inside');
        grid.clearStaticBlockers('micro', level, ...home.floorCells);
        for (const solid of data.obs) mark(this.localRectToCells(regionIndex, solid.x0, solid.z0, solid.x1, solid.z1, 'cover'));
        const doorClearance = this.DOOR_CLEARANCE;
        mark(this.localRectToCells(regionIndex, data.door.x0 - 0.4, 0, data.door.x1 + 0.4, wall + doorClearance, 'cover'));
        const useClearance = this.USE_CLEARANCE;
        for (const use of data.uses || []) {
            mark(this.localRectToCells(regionIndex, use.x0 - useClearance, use.z0 - useClearance, use.x1 + useClearance, use.z1 + useClearance, 'cover'));
        }
        for (const rect of extraRects) mark(this.localRectToCells(regionIndex, rect.x0, rect.z0, rect.x1, rect.z1, 'cover'), false);
    },

    recordsOfCurrentHome() {
        const home = this.currentHome;
        if (!home) return [];
        const regionChunkKey = GridManager.chunkKey(this.LEVEL, home.regionIndex, 0);
        return [...this.gridManager.placementsById.values()].filter((record) => record.originChunkKey === regionChunkKey);
    },

    // The room changed under the furniture (reform, furnished later): pieces off the floor or over the room's own solids go back
    // to the player at full price.
    returnPiecesInTheWay(game) {
        const home = this.currentHome;
        const overlaps = (record, [x0, z0, x1, z1]) => record.cellX < x1 && record.cellX + record.width > x0 && record.cellZ < z1 && record.cellZ + record.depth > z0;
        const insideFloor = (record) => {
            const [x0, z0, x1, z1] = home.floorCells;
            return record.cellX >= x0 && record.cellZ >= z0 && record.cellX + record.width <= x1 && record.cellZ + record.depth <= z1;
        };
        const piecesInTheWay = this.recordsOfCurrentHome().filter((record) => !insideFloor(record) || home.roomBlockerCells.some((cells) => overlaps(record, cells)));
        if (!piecesInTheWay.length) return;
        let refund = 0;
        for (const record of piecesInTheWay) {
            this.gridManager.removePlacement(record.id);
            refund += record.definition.price;
        }
        game.inventory.cash += refund;
        this.refreshStaticBlockers();
        game._flash(`${piecesInTheWay.length} móvel(is) seu(s) ficaram no caminho da mobília nova e foram devolvidos (+${brl(refund)})`);
    },

    // Summary of the current home (value and working pieces), kept for when its chunk is not loaded.
    updateCurrentSummary() {
        const home = this.currentHome;
        if (!home || !home.isLoaded) return;
        const summary = { value: 0, uses: {} };
        for (const record of this.recordsOfCurrentHome()) {
            summary.value += record.definition.price;
            if (record.definition.use) summary.uses[record.definition.use] = (summary.uses[record.definition.use] || 0) + 1;
        }
        this.summariesByHomeId[home.homeId] = summary;
    },

    // Working pieces of the current home as use rects in room coordinates (Interiors.homeUse adds them to the room's own).
    uses() {
        const home = this.currentHome;
        if (!home || !home.isLoaded) return [];
        const cellSize = GridManager.MICRO_CELL_SIZE, originX = this.regionOriginX(home.regionIndex);
        return this.recordsOfCurrentHome().filter((record) => record.definition.use).map((record) => ({
            kind: record.definition.use,
            x0: record.cellX * cellSize - originX, z0: record.cellZ * cellSize,
            x1: (record.cellX + record.width) * cellSize - originX, z1: (record.cellZ + record.depth) * cellSize,
        }));
    },

    // Interiors.obstacles = the room's own solids + every placed piece of this home that is not walkable (rugs are).
    rebuildObstacles() {
        const home = this.currentHome;
        if (!home || !Interiors.active) return;
        this.updateCurrentSummary();
        const cellSize = GridManager.MICRO_CELL_SIZE, stage = Interiors.STAGE, originX = this.regionOriginX(home.regionIndex);
        const furnitureSolids = [];
        for (const record of this.recordsOfCurrentHome()) {
            if (record.definition.walkable) continue;
            furnitureSolids.push({
                x0: stage.x + record.cellX * cellSize - originX, z0: stage.z + record.cellZ * cellSize,
                x1: stage.x + (record.cellX + record.width) * cellSize - originX, z1: stage.z + (record.cellZ + record.depth) * cellSize,
                h: 1.2, decor: true,
            });
        }
        Interiors.obstacles = this.baseObstacles.concat(furnitureSolids);
    },

    // ---- decoration mode -----------------------------------------------------------------------------------------------------

    canOpen(game) {
        const shop = Interiors.active && Interiors.active.shop;
        return !!(this.ready && shop && (shop.home || shop.safehouse) && Interiors._owned(shop));
    },

    toggle(game) {
        if (this.active) { this.close(); return; }
        if (!this.canOpen(game)) return;
        if (!this.currentHome || !this.currentHome.isLoaded) { game._flash('Carregando os móveis da casa…'); return; }
        this.active = true;
        const player = game.player.position, stage = Interiors.STAGE, playerRadius = 0.6;
        const playerLocalX = player.x - stage.x, playerLocalZ = player.z - stage.z;
        this.refreshStaticBlockers([{ x0: playerLocalX - playerRadius, z0: playerLocalZ - playerRadius, x1: playerLocalX + playerRadius, z1: playerLocalZ + playerRadius }]);
        game.player.velocity.setAll(0);
        this.bindInput();
        this.renderBar();
        // The room's usual framing, raised by the bar's height so the south of the room is not hidden behind the catalogue.
        const roomFraming = Interiors.focus(player, game.camera, game.gameEngine.engine.getAspectRatio(game.camera.camera));
        const worldUnitsPerPixel = (2 * game.camera.view) / Math.max(1, window.innerHeight);
        this.barShift = this.barElement.offsetHeight * worldUnitsPerPixel;
        this.cameraFocus = { x: roomFraming.x, z: roomFraming.z - this.barShift };
    },

    close() {
        if (!this.active) return;
        this.putBackMovingPiece();
        this.active = false;
        this.selectedDefinition = null;
        this.placementSystem.cancelPlacement();
        this.unbindInput();
        this.refreshStaticBlockers();
        if (this.barElement) this.barElement.classList.remove('open');
    },

    select(definition) {
        this.putBackMovingPiece();
        this.selectedDefinition = definition;
        if (definition) this.placementSystem.beginPlacement(definition);
        else this.placementSystem.cancelPlacement();
        this.renderBar();
    },

    // Per frame while decorating (Game._updateInterior): camera pan and the cursor ghost.
    update(dt, game) {
        if (!this.active) return;
        const axis = game.input.getMoveAxis();
        if (Math.abs(axis.x) + Math.abs(axis.z) > 0.01) {
            const { forward, right } = game.camera.getGroundBasis(), step = this.CAMERA_PAN_SPEED * dt;
            const data = this.currentHome.data, stage = Interiors.STAGE;
            this.cameraFocus.x = Math.max(stage.x, Math.min(stage.x + data.W, this.cameraFocus.x + (right.x * axis.x + forward.x * axis.z) * step));
            this.cameraFocus.z = Math.max(stage.z - this.barShift, Math.min(stage.z + data.D, this.cameraFocus.z + (right.z * axis.x + forward.z * axis.z) * step));
        }
        if (!this.selectedDefinition) return;
        const pointer = this.canvasPointer(game.input.mouseX, game.input.mouseY);
        const validation = this.placementSystem.updatePreview(pointer.x, pointer.y);
        this.showHint(validation.isValid ? null : this.reasonText(validation.reason));
    },

    canvasPointer(clientX, clientY) {
        const canvasBounds = this.game.gameEngine.engine.getRenderingCanvas().getBoundingClientRect();
        return { x: clientX - canvasBounds.left, y: clientY - canvasBounds.top };
    },

    reasonText(reason) {
        return {
            'cell occupied': 'Já tem um móvel aí',
            'blocked': 'Não cabe aí (parede, porta ou móvel da casa)',
            'area not loaded': 'Carregando…',
            'pointer off the floor': '',
        }[reason] || '';
    },

    // ---- money ---------------------------------------------------------------------------------------------------------------

    totalMoney(inventory) {
        return (inventory.cash || 0) + (inventory.clean || 0);
    },

    charge(inventory, price) {
        const fromCash = Math.min(inventory.cash || 0, price);
        inventory.cash -= fromCash;
        inventory.clean -= price - fromCash;
    },

    placeSelected() {
        const definition = this.selectedDefinition, inventory = this.game.inventory;
        if (!definition) return;
        if (this.movingPiece) {
            if (!this.placementSystem.confirmPlacement()) return;
            this.movingPiece = null;                      // moved: nothing to pay
            this.select(null);
            if (typeof AudioFX !== 'undefined') AudioFX.blip(520, 0.08, 0.12);
            return;
        }
        if (this.totalMoney(inventory) < definition.price) {
            this.game._flash(`Falta ${brl(definition.price - this.totalMoney(inventory))} para comprar: ${definition.name}`);
            return;
        }
        const record = this.placementSystem.confirmPlacement();
        if (!record) return;
        this.charge(inventory, definition.price);
        if (typeof AudioFX !== 'undefined') AudioFX.blip(620, 0.08, 0.12);
        this.renderBar();
    },

    recordUnderPointer(clientX, clientY) {
        const pointer = this.canvasPointer(clientX, clientY);
        const floorPoint = this.placementSystem.pickFloorPoint(pointer.x, pointer.y);
        if (!floorPoint) return null;
        const { cellX, cellZ } = GridManager.worldToCell('micro', floorPoint.x, floorPoint.z);
        return this.gridManager.placementAtCell('micro', this.LEVEL, cellX, cellZ);
    },

    // Left click on a placed piece (nothing selected): carry it. Placing it again is free; cancelling puts it back where it was.
    pickUpUnderPointer(clientX, clientY) {
        const record = this.recordUnderPointer(clientX, clientY);
        if (!record || !this.gridManager.removePlacement(record.id)) return;
        this.select(record.definition);
        this.movingPiece = { definition: record.definition, cellX: record.cellX, cellZ: record.cellZ, rotation: record.rotation };
        this.placementSystem.previewRotation = record.rotation;
        this.renderBar();
    },

    putBackMovingPiece() {
        const movingPiece = this.movingPiece;
        if (!movingPiece) return;
        this.movingPiece = null;
        this.gridManager.place({ definition: movingPiece.definition, level: this.LEVEL, cellX: movingPiece.cellX, cellZ: movingPiece.cellZ, rotation: movingPiece.rotation });
    },

    removeUnderPointer(clientX, clientY) {
        const pointer = this.canvasPointer(clientX, clientY);
        const record = this.placementSystem.removeAtPointer(pointer.x, pointer.y);
        if (!record) return;
        const refund = Math.round(record.definition.price * this.REFUND_SHARE);
        this.game.inventory.cash += refund;
        this.game._flash(`${record.definition.name} retirado (+${brl(refund)})`);
        if (typeof AudioFX !== 'undefined') AudioFX.blip(300, 0.08, 0.12);
        this.renderBar();
    },

    // ---- input ---------------------------------------------------------------------------------------------------------------

    bindInput() {
        const canvas = this.game.gameEngine.engine.getRenderingCanvas();
        this.pointerDownListener = (event) => {
            if (event.button === 0 && !this.selectedDefinition) this.pickUpUnderPointer(event.clientX, event.clientY);
            else if (event.button === 0) this.placeSelected();
            else if (event.button === 2 && this.selectedDefinition) this.select(null);
            else if (event.button === 2) this.removeUnderPointer(event.clientX, event.clientY);
        };
        this.keyDownListener = (event) => {
            const key = event.key.toLowerCase();
            if (key === 'r' && this.selectedDefinition) this.placementSystem.rotatePreview();
            else if (key === 'b' || key === 'escape') this.close();
        };
        canvas.addEventListener('pointerdown', this.pointerDownListener);
        window.addEventListener('keydown', this.keyDownListener);
    },

    unbindInput() {
        const canvas = this.game.gameEngine.engine.getRenderingCanvas();
        canvas.removeEventListener('pointerdown', this.pointerDownListener);
        window.removeEventListener('keydown', this.keyDownListener);
    },

    // ---- catalogue bar -------------------------------------------------------------------------------------------------------

    injectStyles() {
        if (this.stylesInjected) return;
        this.stylesInjected = true;
        const style = document.createElement('style');
        style.textContent = `
        #decorBar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:60;display:none;flex-direction:column;gap:8px;width:min(980px,96vw);
            padding:12px 14px;border-radius:18px;background:rgba(12,14,22,.86);border:1px solid rgba(255,255,255,.14);color:#f2f4f8;font:500 13px var(--font,'Inter',sans-serif)}
        #decorBar.open{display:flex}
        #decorBar .dc-head{display:flex;justify-content:space-between;align-items:center;gap:10px}
        #decorBar .dc-head b{font:700 16px var(--font-d,'Outfit',sans-serif)}
        #decorBar .dc-head .dc-side{display:flex;align-items:center;gap:12px}
        #decorBar .dc-sheet{cursor:pointer;padding:5px 10px;border-radius:99px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);font-weight:600}
        #decorBar .dc-sheet:hover{background:rgba(255,255,255,.16)}
        #decorBar .dc-worth{color:#9aa3b5;font-size:12px}
        #decorBar .dc-use{position:absolute;top:4px;right:6px;font-size:10px;color:#7dd3fc}
        #decorBar .dc-item{position:relative}
        #decorBar .dc-money{color:#86efac;font-weight:700}
        #decorBar .dc-list{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}
        #decorBar .dc-item{flex:none;width:96px;padding:8px 6px;border-radius:12px;cursor:pointer;text-align:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1)}
        #decorBar .dc-item:hover{background:rgba(255,255,255,.12)}
        #decorBar .dc-item.on{border-color:#34d399;background:rgba(52,211,153,.18)}
        #decorBar .dc-item.poor{opacity:.45}
        #decorBar .dc-icon{font-size:26px;line-height:32px}
        #decorBar .dc-name{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #decorBar .dc-price{color:#9aa3b5;font-size:12px}
        #decorBar .dc-hint{color:#9aa3b5;font-size:12px;min-height:16px}
        #decorBar .dc-hint .warn{color:#fda4af}`;
        document.head.appendChild(style);
    },

    renderBar() {
        this.injectStyles();
        if (!this.barElement) {
            this.barElement = document.createElement('div');
            this.barElement.id = 'decorBar';
            this.barElement.addEventListener('click', (event) => {
                if (event.target.closest('[data-sheet]')) { this.openPropertySheet(); return; }
                const item = event.target.closest('[data-piece]');
                if (!item) return;
                const definition = this.definitions.get(Number(item.dataset.piece));
                this.select(this.selectedDefinition === definition ? null : definition);
            });
            this.barElement.addEventListener('contextmenu', (event) => event.preventDefault());
            document.body.appendChild(this.barElement);
        }
        const money = this.totalMoney(this.game.inventory);
        const useLabels = { bed: 'dorme', fridge: 'guarda', chest: 'guarda', safe: 'guarda', desk: 'ficha' };
        // Working pieces first: in a home bought without furniture they are what the player needs.
        const ordered = [...this.definitions.values()].sort((a, b) => (b.use ? 1 : 0) - (a.use ? 1 : 0));
        const items = ordered.map((definition) => `
            <div class="dc-item${this.selectedDefinition === definition ? ' on' : ''}${money < definition.price && !this.movingPiece ? ' poor' : ''}" data-piece="${definition.numericId}">
                ${definition.use ? `<span class="dc-use">⚙ ${useLabels[definition.use]}</span>` : ''}
                <div class="dc-icon">${definition.icon}</div><div class="dc-name">${definition.name}</div><div class="dc-price">${brl(definition.price)}</div>
            </div>`).join('');
        const controls = this.movingPiece
            ? `Movendo: ${this.movingPiece.definition.name} (de graça) · Clique: soltar aqui · R: girar · Botão direito: devolver ao lugar`
            : this.selectedDefinition
                ? 'Clique: colocar · R: girar · Botão direito: soltar a peça · W/A/S/D: mover a câmera · B/Esc: sair'
                : 'Escolha um móvel · Clique num móvel: mover · Botão direito num móvel: retirar (metade do preço de volta) · B/Esc: sair';
        const property = Interiors.active && Interiors.active.shop.home;
        const homeValue = this.currentHome ? this.valueOf(this.currentHome.homeId) : 0;
        this.barElement.innerHTML = `<div class="dc-head"><b>🏠 Decorar a casa</b><span class="dc-side">
                ${homeValue ? `<span class="dc-worth">móveis desta casa: ${brl(homeValue)}</span>` : ''}
                ${property ? '<span class="dc-sheet" data-sheet="1">📋 Ficha do imóvel</span>' : ''}
                <span class="dc-money">${brl(money)}</span></span></div>
            <div class="dc-list">${items}</div><div class="dc-hint"><span class="dc-controls">${controls}</span> <span class="warn"></span></div>`;
        this.barElement.classList.add('open');
    },

    // The property's sheet (sell, reform, furnish, sleep…) — reachable even in an empty home without a notebook desk.
    openPropertySheet() {
        const property = Interiors.active && Interiors.active.shop.home;
        if (!property) return;
        this.close();
        this.game.propertyUI.show(property);
    },

    showHint(warningText) {
        const warningElement = this.barElement && this.barElement.querySelector('.warn');
        if (warningElement && warningElement.textContent !== (warningText || '')) warningElement.textContent = warningText || '';
    },
};
