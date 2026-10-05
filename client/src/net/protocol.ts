// Mirror of src-tauri/src/net/protocol.rs — layouts are documented there. Keep both files in lockstep.

export const TICK_RATE = 60;
export const TICK_SECONDS = 1 / TICK_RATE;

export const SNAPSHOT_MAGIC = 0x31534d44; // "DMS1" little-endian
export const CHUNK_MAGIC = 0x4b434d44; // "DMCK" little-endian
export const PROTOCOL_VERSION = 1;

export const HEADER_SIZE = 24;
export const ENTITY_RECORD_SIZE = 20;
export const EVENT_RECORD_SIZE = 16;
export const INPUT_PACKET_SIZE = 12;
export const CHUNK_HEADER_SIZE = 16;
export const CHUNK_GROUP_HEADER_SIZE = 8;
export const CHUNK_INSTANCE_SIZE = 32;

export const MAX_SNAPSHOT_ENTITIES = 4096;
export const MAX_SNAPSHOT_EVENTS = 512;

export const ACTOR_SLOT_CAPACITY = 8192;
export const PROJECTILE_SLOT_CAPACITY = 2048;
export const SLOT_KEY_SPACE = ACTOR_SLOT_CAPACITY + PROJECTILE_SLOT_CAPACITY;

const HANDLE_INDEX_MASK = 0xfffff;

export const ANGLE_FROM_U16 = (Math.PI * 2) / 65536;

export const EntityKind = {
	Pedestrian: 0,
	Player: 1,
	Police: 2,
	Gangster: 3,
	Vehicle: 4,
	Projectile: 5,
} as const;

export const AnimState = {
	Idle: 0,
	Walk: 1,
	Run: 2,
	Dead: 3,
} as const;

export const GameEventKind = {
	Gunshot: 1,
	Impact: 2,
	Death: 3,
} as const;

export const Buttons = {
	Fire: 1 << 0,
	Sprint: 1 << 1,
	Interact: 1 << 2,
} as const;

/**
 * Dense lookup key for a wire id: actors occupy [0, ACTOR_SLOT_CAPACITY), projectiles the range after it (bit 31 is the
 * pool namespace). Returns SLOT_KEY_SPACE for ids outside the declared capacities.
 */
export function slotKey(id: number): number {
	const index = id & HANDLE_INDEX_MASK;
	if (id >>> 31) {
		return index < PROJECTILE_SLOT_CAPACITY ? ACTOR_SLOT_CAPACITY + index : SLOT_KEY_SPACE;
	}
	return index < ACTOR_SLOT_CAPACITY ? index : SLOT_KEY_SPACE;
}
