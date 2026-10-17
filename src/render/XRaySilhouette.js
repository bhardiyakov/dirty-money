// ============================================================================
// XRaySilhouette — the player seen THROUGH whatever stands between him and the 2.5D camera (a building to his south, a parked truck, a
// wall): a second draw of his sprite — the same quad, frame and billboard, sharing its geometry — that lands only where the depth buffer
// already holds something closer to the camera (NpcArt.silhouetteOf: depthFunction GREATER, no depth write) and paints a flat tinted
// silhouette there. Everything happens on the GPU: no ray casts, no per-frame CPU work beyond picking the material of his current page.
// Only with the 2.5D camera (the top-down camera never hides him).
// ============================================================================

class XRaySilhouette {
	constructor(scene, actor) {
		this.actor = actor;
		const m = this.mesh = actor.mesh.clone(actor.mesh.name + '_xray', actor.mesh);
		m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scaling.set(1, 1, 1);
		m.billboardMode = BABYLON.AbstractMesh.BILLBOARDMODE_NONE;          // (the parent sprite already faces the camera)
		m.isPickable = false;
		m.isVisible = true;                                                 // (the sprite is created hidden until placed: its own visibility rules)
		m.alwaysSelectAsActiveMesh = true;
		m.renderingGroupId = actor.mesh.renderingGroupId;
		m.alphaIndex = XRaySilhouette.DRAW_FIRST;
		m.setEnabled(false);
	}
	// First of the transparent pass: only what was drawn before it (buildings, walls, terrain — the opaque world) counts as hiding the
	// player, not tree canopies or awnings drawn later in the same group (they fade over him instead).
	static get DRAW_FIRST() { return -1e6; }

	// Every frame, before rendering: on while the player's standing 2.5D drawing is on screen, with the X-ray twin of its page material.
	update() {
		const a = this.actor, P = a._pg, src = a.mesh;
		const on = SpriteActor.standing() && !!(a.clip && a.clip.npc && P && P.tex) && src.isEnabled() && src.isVisible;
		if (this.mesh.isEnabled() !== on) this.mesh.setEnabled(on);
		if (!on) return;
		this.mesh.material = NpcArt.silhouetteOf(P);
		this.mesh.renderingGroupId = src.renderingGroupId;
	}
}
