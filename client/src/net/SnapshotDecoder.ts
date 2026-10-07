import {
	ANGLE_FROM_U16,
	ENTITY_RECORD_SIZE,
	EVENT_RECORD_SIZE,
	HEADER_SIZE,
	MAX_SNAPSHOT_ENTITIES,
	MAX_SNAPSHOT_EVENTS,
	PROTOCOL_VERSION,
	SLOT_KEY_SPACE,
	SNAPSHOT_MAGIC,
	TICK_SECONDS,
	slotKey,
} from './protocol';

/**
 * One decoded snapshot in structure-of-arrays form. Frames are pooled by the InterpolationBuffer and decoded into in
 * place, so steady-state decoding allocates nothing besides the DataView over each incoming message.
 */
export class SnapshotFrame {
	tick = 0;
	serverTime = 0;
	playerId = 0;
	weather = 0;
	weatherIntensity = 0;
	count = 0;
	eventCount = 0;

	readonly ids = new Uint32Array(MAX_SNAPSHOT_ENTITIES);
	readonly x = new Float32Array(MAX_SNAPSHOT_ENTITIES);
	readonly y = new Float32Array(MAX_SNAPSHOT_ENTITIES);
	readonly z = new Float32Array(MAX_SNAPSHOT_ENTITIES);
	readonly heading = new Float32Array(MAX_SNAPSHOT_ENTITIES);
	readonly kind = new Uint8Array(MAX_SNAPSHOT_ENTITIES);
	readonly anim = new Uint8Array(MAX_SNAPSHOT_ENTITIES);

	readonly eventKind = new Uint8Array(MAX_SNAPSHOT_EVENTS);
	readonly eventParam = new Uint16Array(MAX_SNAPSHOT_EVENTS);
	readonly eventX = new Float32Array(MAX_SNAPSHOT_EVENTS);
	readonly eventZ = new Float32Array(MAX_SNAPSHOT_EVENTS);
	readonly eventSource = new Uint32Array(MAX_SNAPSHOT_EVENTS);

	/** slotKey(id) → row, -1 when absent. O(1) id matching between frames without a Map. */
	private readonly rowBySlot = new Int32Array(SLOT_KEY_SPACE).fill(-1);

	/** Row of `id` in this frame, or -1. The id comparison rejects a recycled slot with a newer generation. */
	rowOf(id: number): number {
		const key = slotKey(id);
		if (key === SLOT_KEY_SPACE) {
			return -1;
		}
		const row = this.rowBySlot[key];
		return row >= 0 && this.ids[row] === id ? row : -1;
	}

	/** Clears only the rows this frame indexed last time (O(count), not O(slot space)). */
	resetIndex(): void {
		for (let row = 0; row < this.count; row++) {
			this.rowBySlot[slotKey(this.ids[row])] = -1;
		}
	}

	indexRow(row: number): void {
		this.rowBySlot[slotKey(this.ids[row])] = row;
	}
}

/** Decodes `buffer` into `frame`. Returns false (frame left untouched) for malformed or foreign payloads. */
export function decodeSnapshot(buffer: ArrayBufferLike, frame: SnapshotFrame): boolean {
	if (buffer.byteLength < HEADER_SIZE) {
		return false;
	}
	const view = new DataView(buffer);
	if (view.getUint32(0, true) !== SNAPSHOT_MAGIC || view.getUint16(4, true) !== PROTOCOL_VERSION) {
		return false;
	}
	const entityCount = view.getUint32(16, true);
	const eventCount = view.getUint32(20, true);
	const expectedLength = HEADER_SIZE + entityCount * ENTITY_RECORD_SIZE + eventCount * EVENT_RECORD_SIZE;
	if (entityCount > MAX_SNAPSHOT_ENTITIES || eventCount > MAX_SNAPSHOT_EVENTS || buffer.byteLength < expectedLength) {
		return false;
	}

	frame.resetIndex();
	frame.weather = view.getUint8(6);
	frame.weatherIntensity = view.getUint8(7);
	frame.tick = view.getUint32(8, true);
	frame.serverTime = frame.tick * TICK_SECONDS;
	frame.playerId = view.getUint32(12, true);

	let offset = HEADER_SIZE;
	let row = 0;
	for (let i = 0; i < entityCount; i++, offset += ENTITY_RECORD_SIZE) {
		const id = view.getUint32(offset, true);
		if (slotKey(id) === SLOT_KEY_SPACE) {
			continue;
		}
		frame.ids[row] = id;
		frame.x[row] = view.getFloat32(offset + 4, true);
		frame.y[row] = view.getFloat32(offset + 8, true);
		frame.z[row] = view.getFloat32(offset + 12, true);
		frame.heading[row] = view.getUint16(offset + 16, true) * ANGLE_FROM_U16;
		frame.kind[row] = view.getUint8(offset + 18);
		frame.anim[row] = view.getUint8(offset + 19);
		frame.indexRow(row);
		row++;
	}
	frame.count = row;

	for (let i = 0; i < eventCount; i++, offset += EVENT_RECORD_SIZE) {
		frame.eventKind[i] = view.getUint8(offset);
		frame.eventParam[i] = view.getUint16(offset + 2, true);
		frame.eventX[i] = view.getFloat32(offset + 4, true);
		frame.eventZ[i] = view.getFloat32(offset + 8, true);
		frame.eventSource[i] = view.getUint32(offset + 12, true);
	}
	frame.eventCount = eventCount;
	return true;
}
