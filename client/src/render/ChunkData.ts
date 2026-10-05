import {
	CHUNK_GROUP_HEADER_SIZE,
	CHUNK_HEADER_SIZE,
	CHUNK_INSTANCE_SIZE,
	CHUNK_MAGIC,
	PROTOCOL_VERSION,
} from '../net/protocol';
import { writeTrsMatrix } from './matrix';

export interface PrototypeExtent {
	/** Horizontal reach of the unit prototype from its pivot (multiplied by max(scaleX, scaleZ)). */
	readonly radius: number;
	/** Height of the unit prototype above its pivot (multiplied by scaleY). */
	readonly height: number;
}

/** Per-prototype instance data of one chunk, already in GPU layout. Copied into batches with TypedArray.set (memcpy). */
export interface InstanceGroup {
	readonly prototypeId: number;
	readonly count: number;
	readonly matrices: Float32Array;
	readonly colors: Float32Array;
}

export interface ChunkBounds {
	minX: number;
	minY: number;
	minZ: number;
	maxX: number;
	maxY: number;
	maxZ: number;
}

export interface ChunkData {
	readonly key: number;
	readonly chunkX: number;
	readonly chunkZ: number;
	readonly centerX: number;
	readonly centerZ: number;
	readonly groups: readonly InstanceGroup[];
	/** Conservative world-space AABB of everything in the chunk, including instances overhanging its border. */
	readonly bounds: ChunkBounds;
}

const KEY_BIAS = 32768;
const KEY_STRIDE = 65536;
const BYTE_TO_UNIT = 1 / 255;

export function chunkKey(chunkX: number, chunkZ: number): number {
	return (chunkX + KEY_BIAS) * KEY_STRIDE + (chunkZ + KEY_BIAS);
}

export function chunkXOf(key: number): number {
	return Math.floor(key / KEY_STRIDE) - KEY_BIAS;
}

export function chunkZOf(key: number): number {
	return (key % KEY_STRIDE) - KEY_BIAS;
}

/**
 * Decodes a chunk payload (layout in src-tauri/src/net/protocol.rs) and bakes every instance into its final matrix and
 * colour once, at load time. An empty payload is a valid, empty chunk. Returns null for corrupt data.
 */
export function decodeChunk(
	buffer: ArrayBuffer,
	chunkX: number,
	chunkZ: number,
	chunkSize: number,
	extentOf: (prototypeId: number) => PrototypeExtent,
): ChunkData | null {
	const minX = chunkX * chunkSize;
	const minZ = chunkZ * chunkSize;
	const bounds: ChunkBounds = { minX, minY: 0, minZ, maxX: minX + chunkSize, maxY: 0, maxZ: minZ + chunkSize };
	const chunk: ChunkData = {
		key: chunkKey(chunkX, chunkZ),
		chunkX,
		chunkZ,
		centerX: minX + chunkSize * 0.5,
		centerZ: minZ + chunkSize * 0.5,
		groups: [],
		bounds,
	};
	if (buffer.byteLength === 0) {
		return chunk;
	}
	if (buffer.byteLength < CHUNK_HEADER_SIZE) {
		return null;
	}

	const view = new DataView(buffer);
	if (view.getUint32(0, true) !== CHUNK_MAGIC || view.getUint16(4, true) !== PROTOCOL_VERSION) {
		return null;
	}
	const groupCount = view.getUint16(6, true);
	const groups: InstanceGroup[] = [];
	let offset = CHUNK_HEADER_SIZE;
	let minY = Infinity;
	let maxY = -Infinity;

	for (let g = 0; g < groupCount; g++) {
		if (offset + CHUNK_GROUP_HEADER_SIZE > buffer.byteLength) {
			return null;
		}
		const prototypeId = view.getUint16(offset, true);
		const count = view.getUint32(offset + 4, true);
		offset += CHUNK_GROUP_HEADER_SIZE;
		if (offset + count * CHUNK_INSTANCE_SIZE > buffer.byteLength) {
			return null;
		}

		const extent = extentOf(prototypeId);
		const matrices = new Float32Array(count * 16);
		const colors = new Float32Array(count * 4);
		for (let i = 0; i < count; i++, offset += CHUNK_INSTANCE_SIZE) {
			const x = view.getFloat32(offset, true);
			const y = view.getFloat32(offset + 4, true);
			const z = view.getFloat32(offset + 8, true);
			const yaw = view.getFloat32(offset + 12, true);
			const scaleX = view.getFloat32(offset + 16, true);
			const scaleY = view.getFloat32(offset + 20, true);
			const scaleZ = view.getFloat32(offset + 24, true);
			const tint = view.getUint32(offset + 28, true);

			writeTrsMatrix(matrices, i * 16, x, y, z, yaw, scaleX, scaleY, scaleZ);
			colors[i * 4] = (tint & 0xff) * BYTE_TO_UNIT;
			colors[i * 4 + 1] = ((tint >>> 8) & 0xff) * BYTE_TO_UNIT;
			colors[i * 4 + 2] = ((tint >>> 16) & 0xff) * BYTE_TO_UNIT;
			colors[i * 4 + 3] = (tint >>> 24) * BYTE_TO_UNIT;

			const reach = extent.radius * Math.max(scaleX, scaleZ);
			bounds.minX = Math.min(bounds.minX, x - reach);
			bounds.maxX = Math.max(bounds.maxX, x + reach);
			bounds.minZ = Math.min(bounds.minZ, z - reach);
			bounds.maxZ = Math.max(bounds.maxZ, z + reach);
			minY = Math.min(minY, y);
			maxY = Math.max(maxY, y + extent.height * scaleY);
		}
		groups.push({ prototypeId, count, matrices, colors });
	}

	if (minY <= maxY) {
		bounds.minY = minY;
		bounds.maxY = maxY;
	}
	return { ...chunk, groups };
}
