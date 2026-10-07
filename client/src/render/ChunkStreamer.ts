import { Frustum, Matrix } from '@babylonjs/core';
import type { Camera, Plane } from '@babylonjs/core';

import { chunkKey, chunkXOf, chunkZOf, decodeChunk } from './ChunkData';
import type { ChunkBounds, ChunkData } from './ChunkData';
import type { ThinInstanceBiome } from './ThinInstanceBiome';

export interface ChunkSource {
	fetchChunk(chunkX: number, chunkZ: number): Promise<ArrayBuffer>;
}

export interface ChunkStreamerOptions {
	readonly chunkSize: number;
	readonly worldBounds: { readonly minX: number; readonly minZ: number; readonly maxX: number; readonly maxZ: number };
	/** Chunks within this radius (in chunks) of the focus are kept resident. */
	readonly loadRadius: number;
	/** Hysteresis: resident chunks are evicted only beyond this radius, so oscillating at a border never thrashes. */
	readonly unloadRadius: number;
	readonly maxConcurrentLoads: number;
	/** XZ padding for the frustum test so off-screen shadow casters still land in the shadow map. */
	readonly cullingMargin: number;
}

/**
 * Residency + visibility for biome chunks.
 *
 *   Residency   ring of chunks around the focus (player), loaded nearest-first with bounded concurrency, evicted with
 *               hysteresis. Only decoded CPU-side arrays live per chunk; GPU memory holds just the visible set.
 *   Visibility  each frame the camera matrix changed, resident chunk AABBs are tested against the frustum planes
 *               (p-vertex test, no allocation). The biome buffers are rebuilt only when the visible set changes.
 */
export class ChunkStreamer {
	private readonly resident = new Map<number, ChunkData>();
	private readonly inFlight = new Set<number>();
	private readonly loadQueue: number[] = [];
	private loadQueueHead = 0;
	private readonly visible: ChunkData[] = [];
	private visibleKeys: number[] = [];
	private candidateKeys: number[] = [];
	private readonly frustumPlanes: Plane[] = Frustum.GetPlanes(Matrix.Identity());
	private readonly chunkRange: { minX: number; maxX: number; minZ: number; maxZ: number };

	private focusChunkX = Number.NaN;
	private focusChunkZ = Number.NaN;
	private focusX = 0;
	private focusZ = 0;
	private lastCameraUpdateFlag = -1;
	private visibilityDirty = true;
	private forceRebuild = true;

	constructor(
		private readonly camera: Camera,
		private readonly biome: ThinInstanceBiome,
		private readonly source: ChunkSource,
		private readonly options: ChunkStreamerOptions,
	) {
		const { chunkSize, worldBounds } = options;
		this.chunkRange = {
			minX: Math.floor(worldBounds.minX / chunkSize),
			maxX: Math.floor(worldBounds.maxX / chunkSize),
			minZ: Math.floor(worldBounds.minZ / chunkSize),
			maxZ: Math.floor(worldBounds.maxZ / chunkSize),
		};
	}

	get residentCount(): number {
		return this.resident.size;
	}

	get visibleCount(): number {
		return this.visible.length;
	}

	update(focusX: number, focusZ: number): void {
		this.focusX = focusX;
		this.focusZ = focusZ;
		const chunkX = Math.floor(focusX / this.options.chunkSize);
		const chunkZ = Math.floor(focusZ / this.options.chunkSize);
		if (chunkX !== this.focusChunkX || chunkZ !== this.focusChunkZ) {
			this.focusChunkX = chunkX;
			this.focusChunkZ = chunkZ;
			this.evictDistant();
			this.planLoads();
			// LOD routing depends on the focus, so force a rebuild even if the visible set stays the same.
			this.visibilityDirty = true;
			this.forceRebuild = true;
		}
		this.pumpLoads();
		this.refreshVisibility();
	}

	private distanceFromFocus(chunkX: number, chunkZ: number): number {
		return Math.max(Math.abs(chunkX - this.focusChunkX), Math.abs(chunkZ - this.focusChunkZ));
	}

	private planLoads(): void {
		const radius = this.options.loadRadius;
		const range = this.chunkRange;
		this.loadQueue.length = 0;
		this.loadQueueHead = 0;
		for (let dz = -radius; dz <= radius; dz++) {
			for (let dx = -radius; dx <= radius; dx++) {
				const chunkX = this.focusChunkX + dx;
				const chunkZ = this.focusChunkZ + dz;
				if (chunkX < range.minX || chunkX > range.maxX || chunkZ < range.minZ || chunkZ > range.maxZ) {
					continue;
				}
				const key = chunkKey(chunkX, chunkZ);
				if (!this.resident.has(key) && !this.inFlight.has(key)) {
					this.loadQueue.push(key);
				}
			}
		}
		this.loadQueue.sort((a, b) => this.squaredChunkDistance(a) - this.squaredChunkDistance(b));
	}

	private squaredChunkDistance(key: number): number {
		const dx = chunkXOf(key) - this.focusChunkX;
		const dz = chunkZOf(key) - this.focusChunkZ;
		return dx * dx + dz * dz;
	}

	private pumpLoads(): void {
		while (this.inFlight.size < this.options.maxConcurrentLoads && this.loadQueueHead < this.loadQueue.length) {
			const key = this.loadQueue[this.loadQueueHead++];
			if (this.resident.has(key) || this.inFlight.has(key)) {
				continue;
			}
			const chunkX = chunkXOf(key);
			const chunkZ = chunkZOf(key);
			this.inFlight.add(key);
			this.source
				.fetchChunk(chunkX, chunkZ)
				.then((buffer) => this.onChunkLoaded(chunkX, chunkZ, buffer))
				.catch((error: unknown) => console.warn(`chunk ${chunkX},${chunkZ} failed to load`, error))
				.finally(() => this.inFlight.delete(key));
		}
	}

	private onChunkLoaded(chunkX: number, chunkZ: number, buffer: ArrayBuffer): void {
		if (this.distanceFromFocus(chunkX, chunkZ) > this.options.unloadRadius) {
			return;
		}
		const chunk = decodeChunk(buffer, chunkX, chunkZ, this.options.chunkSize, (id) => this.biome.extentOf(id));
		if (!chunk) {
			console.warn(`chunk ${chunkX},${chunkZ} is corrupt`);
			return;
		}
		this.resident.set(chunk.key, chunk);
		this.visibilityDirty = true;
	}

	private evictDistant(): void {
		for (const [key, chunk] of this.resident) {
			if (this.distanceFromFocus(chunk.chunkX, chunk.chunkZ) > this.options.unloadRadius) {
				this.resident.delete(key);
				this.visibilityDirty = true;
			}
		}
	}

	private refreshVisibility(): void {
		const transform = this.camera.getTransformationMatrix();
		if (!this.visibilityDirty && transform.updateFlag === this.lastCameraUpdateFlag) {
			return;
		}
		this.lastCameraUpdateFlag = transform.updateFlag;
		this.visibilityDirty = false;
		Frustum.GetPlanesToRef(transform, this.frustumPlanes);

		this.visible.length = 0;
		this.candidateKeys.length = 0;
		for (const chunk of this.resident.values()) {
			if (intersectsFrustum(chunk.bounds, this.frustumPlanes, this.options.cullingMargin)) {
				this.visible.push(chunk);
				this.candidateKeys.push(chunk.key);
			}
		}
		if (!this.forceRebuild && sameKeys(this.candidateKeys, this.visibleKeys)) {
			return;
		}
		this.forceRebuild = false;
		[this.visibleKeys, this.candidateKeys] = [this.candidateKeys, this.visibleKeys];
		this.biome.rebuild(this.visible, this.focusX, this.focusZ);
	}
}

/** AABB vs frustum, p-vertex form: outside as soon as the box corner farthest along a plane normal is behind it. */
function intersectsFrustum(bounds: ChunkBounds, planes: Plane[], margin: number): boolean {
	const minX = bounds.minX - margin;
	const maxX = bounds.maxX + margin;
	const minZ = bounds.minZ - margin;
	const maxZ = bounds.maxZ + margin;
	for (let i = 0; i < planes.length; i++) {
		const { normal, d } = planes[i];
		const x = normal.x >= 0 ? maxX : minX;
		const y = normal.y >= 0 ? bounds.maxY : bounds.minY;
		const z = normal.z >= 0 ? maxZ : minZ;
		if (normal.x * x + normal.y * y + normal.z * z + d < 0) {
			return false;
		}
	}
	return true;
}

function sameKeys(a: readonly number[], b: readonly number[]): boolean {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return false;
		}
	}
	return true;
}
