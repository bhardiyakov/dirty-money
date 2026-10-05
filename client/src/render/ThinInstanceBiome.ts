import type { Mesh } from '@babylonjs/core';

import type { ChunkData, InstanceGroup, PrototypeExtent } from './ChunkData';

export interface BiomePrototype extends PrototypeExtent {
	readonly id: number;
	/** Source mesh rendered with thin instances. Never rendered as an individual mesh. */
	readonly mesh: Mesh;
	/** Optional cheaper mesh used for chunks farther than the LOD distance. */
	readonly lodMesh?: Mesh;
}

interface RegisteredPrototype {
	readonly definition: BiomePrototype;
	readonly near: InstanceBatch;
	readonly far: InstanceBatch | null;
}

const FALLBACK_EXTENT: PrototypeExtent = { radius: 1, height: 1 };
const INITIAL_BATCH_CAPACITY = 256;

/**
 * Thin-instance generator for every repeated static asset (trees, buildings, streetlights…).
 *
 * One GPU instance buffer per prototype (and per LOD), holding only the instances of currently visible chunks:
 *   draw calls   = number of prototypes with something on screen (independent of instance and chunk counts)
 *   vertex work  = visible chunks only (chunk-level CPU frustum culling happens in ChunkStreamer)
 *   CPU on change = one TypedArray.set (memcpy) per (chunk, prototype) — matrices were baked when the chunk loaded
 * The buffers are rewritten only when the visible chunk set changes, not per frame.
 */
export class ThinInstanceBiome {
	private readonly prototypes = new Map<number, RegisteredPrototype>();

	constructor(private readonly lodDistance = Number.POSITIVE_INFINITY) {}

	register(prototype: BiomePrototype): void {
		this.prototypes.set(prototype.id, {
			definition: prototype,
			near: new InstanceBatch(prototype.mesh),
			far: prototype.lodMesh ? new InstanceBatch(prototype.lodMesh) : null,
		});
	}

	extentOf(prototypeId: number): PrototypeExtent {
		return this.prototypes.get(prototypeId)?.definition ?? FALLBACK_EXTENT;
	}

	/** Packs the visible chunks into the per-prototype buffers. Chunks past `lodDistance` from the focus use LOD meshes. */
	rebuild(visibleChunks: readonly ChunkData[], focusX: number, focusZ: number): void {
		for (const prototype of this.prototypes.values()) {
			prototype.near.reset();
			prototype.far?.reset();
		}
		const lodDistanceSquared = this.lodDistance * this.lodDistance;
		for (const chunk of visibleChunks) {
			const dx = chunk.centerX - focusX;
			const dz = chunk.centerZ - focusZ;
			const isFar = dx * dx + dz * dz > lodDistanceSquared;
			for (const group of chunk.groups) {
				const prototype = this.prototypes.get(group.prototypeId);
				if (!prototype) {
					continue;
				}
				(isFar && prototype.far ? prototype.far : prototype.near).append(group);
			}
		}
		for (const prototype of this.prototypes.values()) {
			prototype.near.commit();
			prototype.far?.commit();
		}
	}

	shadowCasters(): Mesh[] {
		const meshes: Mesh[] = [];
		for (const { definition } of this.prototypes.values()) {
			meshes.push(definition.mesh);
			if (definition.lodMesh) {
				meshes.push(definition.lodMesh);
			}
		}
		return meshes;
	}
}

/** Growable thin-instance buffer bound to one mesh. Grows by doubling (rare), otherwise reuses its arrays forever. */
class InstanceBatch {
	private matrices: Float32Array;
	private colors: Float32Array;
	private capacity = INITIAL_BATCH_CAPACITY;
	private count = 0;

	constructor(private readonly mesh: Mesh) {
		this.matrices = new Float32Array(this.capacity * 16);
		this.colors = new Float32Array(this.capacity * 4);
		// Culling is chunk-level on the CPU; a single bounding box spanning every instance would be useless to Babylon.
		mesh.alwaysSelectAsActiveMesh = true;
		mesh.doNotSyncBoundingInfo = true;
		mesh.isPickable = false;
		mesh.freezeWorldMatrix();
		this.bindBuffers();
		this.commit();
	}

	reset(): void {
		this.count = 0;
	}

	append(group: InstanceGroup): void {
		this.ensureCapacity(this.count + group.count);
		this.matrices.set(group.matrices, this.count * 16);
		this.colors.set(group.colors, this.count * 4);
		this.count += group.count;
	}

	commit(): void {
		this.mesh.thinInstanceCount = this.count;
		if (this.count > 0) {
			// Uploads only the first `thinInstanceCount` instances.
			this.mesh.thinInstanceBufferUpdated('matrix');
			this.mesh.thinInstanceBufferUpdated('color');
		}
		this.mesh.setEnabled(this.count > 0);
	}

	private ensureCapacity(required: number): void {
		if (required <= this.capacity) {
			return;
		}
		while (this.capacity < required) {
			this.capacity *= 2;
		}
		const matrices = new Float32Array(this.capacity * 16);
		const colors = new Float32Array(this.capacity * 4);
		matrices.set(this.matrices.subarray(0, this.count * 16));
		colors.set(this.colors.subarray(0, this.count * 4));
		this.matrices = matrices;
		this.colors = colors;
		this.bindBuffers();
	}

	private bindBuffers(): void {
		this.mesh.thinInstanceSetBuffer('matrix', this.matrices, 16, false);
		this.mesh.thinInstanceSetBuffer('color', this.colors, 4, false);
	}
}
