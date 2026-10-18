// ============================================================================
// PlacementSystem — the build cursor: ray from the pointer → mathematical floor plane → snapped cell → matrix validation → place.
//
//   Picking   the floor is a BABYLON.Plane at the current level's height (level × FLOOR_HEIGHT), not a mesh: the camera ray from
//             scene.createPickingRay is intersected with it analytically (Ray.intersectsPlane). No ground mesh, no physics collider
//             and no scene.pickWithRay mesh traversal is involved, so picking costs the same with 10 or 10 000 items placed.
//   Snapping  the footprint is CENTRED on the cursor, then its min corner is rounded to the active layer's cells (macro or micro).
//   Preview   a plain clone of the definition's template (ghost material, green = valid / red = invalid). It follows the mouse
//             every frame, so it never touches the thin-instance buffers; only confirmPlacement() writes to the grid, and the
//             InstancedRenderer adds the instance from the grid's 'placed' event. Validation reruns only when the snapped cell or
//             the rotation changes.
//
//   beginPlacement(definition) · rotatePreview() · updatePreview(pointerX, pointerY) · confirmPlacement() · cancelPlacement()
//   removeAtPointer(pointerX, pointerY) · setFloorLevel(level) · bindPointerInput() (optional default mouse/keyboard bindings)
//   setGridOffset(offset)   world = grid + offset: the grid region is drawn elsewhere (pair it with InstancedRenderer's rootNode)
// ============================================================================

class PlacementSystem {
    static FLOOR_HEIGHT = 3.2;
    static VALID_PREVIEW_COLOR = new BABYLON.Color3(0.2, 0.9, 0.45);
    static INVALID_PREVIEW_COLOR = new BABYLON.Color3(0.95, 0.25, 0.3);

    constructor(scene, camera, gridManager, instancedRenderer) {
        this.scene = scene;
        this.camera = camera;
        this.gridManager = gridManager;
        this.instancedRenderer = instancedRenderer;
        this.floorLevel = 0;
        this.gridOffset = BABYLON.Vector3.Zero();
        this.floorPlane = this.createFloorPlane();
        this.activeDefinition = null;
        this.previewRotation = 0;
        this.previewMesh = null;
        this.previewMaterial = this.createPreviewMaterial();
        this.lastSnappedCell = null;
        this.lastValidation = { isValid: false, reason: 'nothing selected' };
        this.identityMatrix = BABYLON.Matrix.Identity();
        this.pickingRay = new BABYLON.Ray(BABYLON.Vector3.Zero(), BABYLON.Vector3.Forward(), 1);
        this.inputObservers = [];
    }

    createFloorPlane() {
        const floorHeight = this.gridOffset.y + this.floorLevel * PlacementSystem.FLOOR_HEIGHT;
        return BABYLON.Plane.FromPositionAndNormal(new BABYLON.Vector3(0, floorHeight, 0), BABYLON.Vector3.Up());
    }

    setFloorLevel(level) {
        this.floorLevel = level;
        this.floorPlane = this.createFloorPlane();
        this.lastSnappedCell = null;
    }

    setGridOffset(offset) {
        this.gridOffset.copyFrom(offset);
        this.floorPlane = this.createFloorPlane();
        this.lastSnappedCell = null;
    }

    // ---- picking and snapping ------------------------------------------------------------------------------------------------

    // Pointer (canvas CSS pixels) → point on the current floor plane in GRID space (world minus the grid offset), or null when the
    // ray misses it (pointing at the sky).
    pickFloorPoint(pointerX, pointerY) {
        this.scene.createPickingRayToRef(pointerX, pointerY, this.identityMatrix, this.pickingRay, this.camera);
        const hitDistance = this.pickingRay.intersectsPlane(this.floorPlane);
        if (hitDistance === null || hitDistance < 0) return null;
        return this.pickingRay.origin.add(this.pickingRay.direction.scale(hitDistance)).subtractInPlace(this.gridOffset);
    }

    // Min-corner cell of a footprint centred on `worldPoint`, in `layer` cells.
    static snapFootprintToGrid(layer, worldPoint, width, depth) {
        const cellSize = GridManager.cellSizeOf(layer);
        return {
            cellX: Math.round(worldPoint.x / cellSize - width / 2),
            cellZ: Math.round(worldPoint.z / cellSize - depth / 2),
        };
    }

    // ---- preview -------------------------------------------------------------------------------------------------------------

    createPreviewMaterial() {
        const material = new BABYLON.StandardMaterial('placementPreviewMaterial', this.scene);
        material.alpha = 0.5;
        material.disableLighting = true;
        material.emissiveColor = PlacementSystem.VALID_PREVIEW_COLOR.clone();
        material.backFaceCulling = false;
        return material;
    }

    beginPlacement(definition) {
        this.cancelPlacement();
        this.activeDefinition = definition;
        this.previewRotation = 0;
        this.previewMesh = this.instancedRenderer.templateFor(definition).clone(`placementPreview_${definition.name}`);
        this.previewMesh.material = this.previewMaterial;
        this.previewMesh.isPickable = false;
        this.previewMesh.setEnabled(false);               // shown once the cursor is on the floor
        this.lastSnappedCell = null;
    }

    rotatePreview() {
        if (!this.activeDefinition) return;
        this.previewRotation = (this.previewRotation + 1) % 4;
        this.lastSnappedCell = null;                      // the footprint changed: snap and validate again
    }

    updatePreview(pointerX, pointerY) {
        if (!this.activeDefinition) return this.lastValidation;
        const floorPoint = this.pickFloorPoint(pointerX, pointerY);
        if (!floorPoint) {
            this.previewMesh.setEnabled(false);
            this.lastValidation = { isValid: false, reason: 'pointer off the floor' };
            return this.lastValidation;
        }
        const layer = this.activeDefinition.layer;
        const { width, depth } = GridManager.rotatedFootprint(this.activeDefinition, this.previewRotation);
        const snappedCell = PlacementSystem.snapFootprintToGrid(layer, floorPoint, width, depth);
        if (this.lastSnappedCell && this.lastSnappedCell.cellX === snappedCell.cellX && this.lastSnappedCell.cellZ === snappedCell.cellZ) {
            return this.lastValidation;
        }
        this.lastSnappedCell = snappedCell;
        this.lastValidation = this.gridManager.validatePlacement(this.currentRequest());
        this.movePreviewTo(snappedCell, width, depth);
        this.previewMaterial.emissiveColor.copyFrom(this.lastValidation.isValid ? PlacementSystem.VALID_PREVIEW_COLOR : PlacementSystem.INVALID_PREVIEW_COLOR);
        return this.lastValidation;
    }

    movePreviewTo(snappedCell, width, depth) {
        const center = GridManager.footprintCenter(this.activeDefinition.layer, snappedCell.cellX, snappedCell.cellZ, width, depth);
        this.previewMesh.position.set(center.x, this.floorLevel * PlacementSystem.FLOOR_HEIGHT, center.z).addInPlace(this.gridOffset);
        this.previewMesh.rotation.y = this.previewRotation * Math.PI / 2;
        this.previewMesh.setEnabled(true);
    }

    currentRequest() {
        return {
            definition: this.activeDefinition,
            layer: this.activeDefinition.layer,
            level: this.floorLevel,
            cellX: this.lastSnappedCell.cellX,
            cellZ: this.lastSnappedCell.cellZ,
            rotation: this.previewRotation,
        };
    }

    // ---- actions -------------------------------------------------------------------------------------------------------------

    // Places the previewed item (the preview stays active for the next copy). Returns the record, or null if invalid.
    confirmPlacement() {
        if (!this.activeDefinition || !this.lastSnappedCell || !this.lastValidation.isValid) return null;
        const record = this.gridManager.place(this.currentRequest());
        if (!record) return null;
        this.lastSnappedCell = null;                      // the cell is taken now: the next updatePreview turns the ghost red
        return record;
    }

    cancelPlacement() {
        if (this.previewMesh) this.previewMesh.dispose(false, false);
        this.previewMesh = null;
        this.activeDefinition = null;
        this.lastSnappedCell = null;
        this.lastValidation = { isValid: false, reason: 'nothing selected' };
    }

    // Removes what is under the pointer: micro item first (furniture), else the macro structure.
    removeAtPointer(pointerX, pointerY) {
        const floorPoint = this.pickFloorPoint(pointerX, pointerY);
        if (!floorPoint) return null;
        for (const layer of ['micro', 'macro']) {
            const { cellX, cellZ } = GridManager.worldToCell(layer, floorPoint.x, floorPoint.z);
            const record = this.gridManager.placementAtCell(layer, this.floorLevel, cellX, cellZ);
            if (record) return this.gridManager.removePlacement(record.id);
        }
        return null;
    }

    // ---- default input (optional: the game may drive the methods above from its own input layer) -----------------------------

    bindPointerInput() {
        const pointerObserver = this.scene.onPointerObservable.add((pointerInfo) => {
            const pointerX = this.scene.pointerX, pointerY = this.scene.pointerY;
            if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERMOVE) this.updatePreview(pointerX, pointerY);
            if (pointerInfo.type !== BABYLON.PointerEventTypes.POINTERDOWN) return;
            const pressedButton = pointerInfo.event.button;
            if (pressedButton === 0) {
                this.confirmPlacement();
                this.updatePreview(pointerX, pointerY);
            } else if (pressedButton === 2 && this.activeDefinition) {
                this.cancelPlacement();
            } else if (pressedButton === 2) {
                this.removeAtPointer(pointerX, pointerY);
            }
        });
        const keyboardObserver = this.scene.onKeyboardObservable.add((keyboardInfo) => {
            if (keyboardInfo.type !== BABYLON.KeyboardEventTypes.KEYDOWN) return;
            if (keyboardInfo.event.key === 'r' || keyboardInfo.event.key === 'R') {
                this.rotatePreview();
                this.updatePreview(this.scene.pointerX, this.scene.pointerY);
            }
            if (keyboardInfo.event.key === 'Escape') this.cancelPlacement();
        });
        this.inputObservers = [[this.scene.onPointerObservable, pointerObserver], [this.scene.onKeyboardObservable, keyboardObserver]];
    }

    dispose() {
        for (const [observable, observer] of this.inputObservers) observable.remove(observer);
        this.inputObservers = [];
        this.cancelPlacement();
        this.previewMaterial.dispose();
    }
}
