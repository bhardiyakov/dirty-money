import type { Mesh } from '@babylonjs/core';

import type { InterpolatedState } from '../net/InterpolationBuffer';
import { headingToYaw, writeTrsMatrix } from './matrix';

export interface EntityVisual {
	readonly kind: number;
	readonly mesh: Mesh;
	readonly capacity: number;
}

/**
 * Dynamic entities (crowd, police, projectiles) as one thin-instance batch per kind: thousands of NPCs cost one draw
 * call per kind. Matrices are rewritten from the interpolated state every display frame into fixed-size buffers.
 * The simulation already limits the stream to the area of interest, so no per-entity culling is done here.
 */
export class EntityRenderer {
	private readonly batchByKind: (DynamicBatch | undefined)[] = [];
	private readonly batches: DynamicBatch[] = [];

	register(visual: EntityVisual): void {
		const batch = new DynamicBatch(visual.mesh, visual.capacity);
		this.batchByKind[visual.kind] = batch;
		this.batches.push(batch);
	}

	render(state: InterpolatedState): void {
		for (const batch of this.batches) {
			batch.reset();
		}
		for (let row = 0; row < state.count; row++) {
			this.batchByKind[state.kind[row]]?.push(state.x[row], state.y[row], state.z[row], headingToYaw(state.heading[row]));
		}
		for (const batch of this.batches) {
			batch.commit();
		}
	}

	shadowCasters(): Mesh[] {
		return this.batches.map((batch) => batch.mesh);
	}
}

class DynamicBatch {
	private readonly matrices: Float32Array;
	private count = 0;

	constructor(
		readonly mesh: Mesh,
		private readonly capacity: number,
	) {
		this.matrices = new Float32Array(capacity * 16);
		mesh.alwaysSelectAsActiveMesh = true;
		mesh.doNotSyncBoundingInfo = true;
		mesh.isPickable = false;
		mesh.thinInstanceSetBuffer('matrix', this.matrices, 16, false);
		mesh.thinInstanceCount = 0;
	}

	reset(): void {
		this.count = 0;
	}

	push(x: number, y: number, z: number, yaw: number): void {
		if (this.count === this.capacity) {
			return;
		}
		writeTrsMatrix(this.matrices, this.count * 16, x, y, z, yaw, 1, 1, 1);
		this.count++;
	}

	commit(): void {
		this.mesh.thinInstanceCount = this.count;
		if (this.count > 0) {
			this.mesh.thinInstanceBufferUpdated('matrix');
		}
		this.mesh.setEnabled(this.count > 0);
	}
}
