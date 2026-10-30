// ============================================================================
// XRaySilhouette — the player seen THROUGH whatever stands between him and the 2.5D camera: a building to his south, a parked truck, a
// wall, a tree canopy above him. Nothing turns see-through any more (the canopies used to fade around him): he shows as a flat golden
// silhouette, drawn twice over the world as twins of his sprite (the same quad, frame and billboard, sharing its geometry):
//   1. behind what writes depth (buildings, walls, cars, structures): the twin lands only where the depth buffer already holds something
//      closer to the camera (NpcArt.silhouetteOf: depthFunction GREATER, no depth write), and marks 2 in the stencil where it painted;
//   2. under a canopy (canopies are blended and write no depth): the canopy MASK (addMask — the opaque core of the canopies near him,
//      drawn again without color) marks 1 in the stencil, and the second twin paints where the stencil is still 1, with no depth test.
// Both draw last in his rendering group, after the canopies. Everything happens on the GPU: no ray casts, no per-frame CPU work beyond
// picking the material of his current page and switching on the canopy masks near him.
// Only with the 2.5D camera (the top-down camera never hides him).
// ============================================================================

class XRaySilhouette {
	constructor(scene, actor) {
		this.actor = actor;
		const C = BABYLON.Constants;
		this.mesh = this._twin('_xray', XRaySilhouette.DRAW_LAST, C.ALWAYS, 2, C.REPLACE);
		this.canopy = this._twin('_xrayC', XRaySilhouette.DRAW_LAST + 1, C.EQUAL, 1, C.KEEP);
	}
	// After everything else in the group (the canopies included): whatever hides the player has already been drawn.
	static get DRAW_LAST() { return 1e6; }

	_twin(suffix, alphaIndex, func, ref, pass) {
		const a = this.actor, m = a.mesh.clone(a.mesh.name + suffix, a.mesh);
		m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scaling.set(1, 1, 1);
		m.billboardMode = BABYLON.AbstractMesh.BILLBOARDMODE_NONE;          // (the parent sprite already faces the camera)
		m.isPickable = false;
		m.isVisible = true;                                                 // (the sprite is created hidden until placed: its own visibility rules)
		m.alwaysSelectAsActiveMesh = true;
		m.renderingGroupId = a.mesh.renderingGroupId;
		m.alphaIndex = alphaIndex;
		m.setEnabled(false);
		XRaySilhouette.stencil(m, func, ref, pass);
		return m;
	}

	// Every frame, before rendering: on while the player's standing 2.5D drawing is on screen, with the X-ray twins of its page material.
	update() {
		const a = this.actor, P = a._pg, src = a.mesh;
		const on = SpriteActor.standing() && !!(a.clip && a.clip.npc && P && P.tex) && src.isEnabled() && src.isVisible;
		XRaySilhouette.updateMasks(src.position.x, src.position.z, on);
		for (const [m, over] of [[this.mesh, false], [this.canopy, true]]) {
			if (m.isEnabled() !== on) m.setEnabled(on);
			if (!on) continue;
			m.material = NpcArt.silhouetteOf(P, over);
			m.renderingGroupId = src.renderingGroupId;
		}
	}

	// Stencil state for one mesh's draw (Babylon 6 has no per-material stencil): set before it renders, put back after.
	static stencil(mesh, func, ref, pass) {
		const eng = mesh.getScene().getEngine();
		let s = null;
		mesh.onBeforeRenderObservable.add(() => {
			s = [eng.getStencilBuffer(), eng.getStencilFunction(), eng.getStencilFunctionReference(), eng.getStencilFunctionMask(), eng.getStencilOperationPass(), eng.getStencilMask()];
			eng.setStencilBuffer(true); eng.setStencilMask(0xff); eng.setStencilFunctionMask(0xff);
			eng.setStencilFunction(func); eng.setStencilFunctionReference(ref); eng.setStencilOperationPass(pass);
		});
		mesh.onAfterRenderObservable.add(() => {
			if (!s) return;
			eng.setStencilBuffer(s[0]); eng.setStencilFunction(s[1]); eng.setStencilFunctionReference(s[2]); eng.setStencilFunctionMask(s[3]); eng.setStencilOperationPass(s[4]); eng.setStencilMask(s[5]);
			s = null;
		});
	}

	// The MASK of a canopy mesh (WorldBuilder / TerrainBuilder): a clone sharing its geometry, drawn right after it with the mask material
	// (PropSprites maskMaterial: the opaque core only — no shadow, no soft rim — and no color), marking 1 in the stencil. Off unless the
	// player is near it (updateMasks). Returns the clone (whoever owns the canopy disposes it too).
	static addMask(mesh, material) {
		if (!mesh || !material) return null;
		const m = mesh.clone(mesh.name + '_mask');
		m.material = material;
		m.renderingGroupId = mesh.renderingGroupId;
		m.alphaIndex = mesh.alphaIndex + 0.05;
		m.isPickable = false;
		m.isVisible = false;
		const C = BABYLON.Constants;
		XRaySilhouette.stencil(m, C.ALWAYS, 1, C.REPLACE);
		XRaySilhouette.masks.add(m);
		m.onDisposeObservable.add(() => XRaySilhouette.masks.delete(m));
		return m;
	}
	static updateMasks(x, z, on) {
		for (const m of XRaySilhouette.masks) {
			const b = m.getBoundingInfo().boundingBox, lo = b.minimumWorld, hi = b.maximumWorld;
			const near = on && x > lo.x - 6 && x < hi.x + 6 && z > lo.z - 6 && z < hi.z + 6;
			if (m.isVisible !== near) m.isVisible = near;
		}
	}
}
XRaySilhouette.masks = new Set();
