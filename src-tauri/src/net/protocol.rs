//! Binary wire protocol between the simulation and the WebView. Little-endian, fixed-size records, 4-byte aligned.
//! Every constant here is mirrored in `client/src/net/protocol.ts`; bump `PROTOCOL_VERSION` on any layout change.
//!
//! Snapshot  = Header (24 B) + EntityRecord × entity_count (20 B) + EventRecord × event_count (16 B)
//!
//!   Header        0 u32 magic "DMS1" │ 4 u16 version │ 6 u8 weather │ 7 u8 weather_intensity
//!                 8 u32 tick │ 12 u32 player_id │ 16 u32 entity_count │ 20 u32 event_count
//!   EntityRecord  0 u32 id │ 4 f32 x │ 8 f32 y │ 12 f32 z │ 16 u16 heading (0..65535 ↦ 0..2π) │ 18 u8 kind │ 19 u8 anim
//!   EventRecord   0 u8 kind │ 1 u8 pad │ 2 u16 param │ 4 f32 x │ 8 f32 z │ 12 u32 source_id
//!
//! Input packet (client → sim, 12 B)
//!   0 i8 move_x │ 1 i8 move_z │ 2 u16 held_buttons │ 4 u16 pressed_buttons │ 6 u16 aim (0..65535 ↦ 0..2π) │ 8 u32 sequence
//!
//! Chunk payload (sim → client on request)
//!   Header        0 u32 magic "DMCK" │ 4 u16 version │ 6 u16 group_count │ 8 i32 chunk_x │ 12 i32 chunk_z
//!   Group         0 u16 prototype │ 2 u16 reserved │ 4 u32 count │ then count × InstanceRecord
//!   Instance      x, y, z, yaw, scale_x, scale_y, scale_z (f32 × 7) │ 28 u32 tint RGBA8 (R in the low byte)

use crate::sim::pool::Handle;

pub const TICK_RATE: u32 = 60;

pub const SNAPSHOT_MAGIC: u32 = u32::from_le_bytes(*b"DMS1");
pub const CHUNK_MAGIC: u32 = u32::from_le_bytes(*b"DMCK");
pub const PROTOCOL_VERSION: u16 = 1;

pub const HEADER_SIZE: usize = 24;
pub const ENTITY_RECORD_SIZE: usize = 20;
pub const EVENT_RECORD_SIZE: usize = 16;
pub const INPUT_PACKET_SIZE: usize = 12;
pub const CHUNK_HEADER_SIZE: usize = 16;
pub const CHUNK_GROUP_HEADER_SIZE: usize = 8;
pub const CHUNK_INSTANCE_SIZE: usize = 32;

pub const MAX_SNAPSHOT_ENTITIES: usize = 4096;

pub const KIND_PROJECTILE: u8 = 5;

/// Bit 31 of a wire id separates pools so actor and projectile handles never collide on the client.
pub const PROJECTILE_NAMESPACE_BIT: u32 = 1 << 31;

pub mod buttons {
	pub const FIRE: u16 = 1 << 0;
	pub const SPRINT: u16 = 1 << 1;
	pub const INTERACT: u16 = 1 << 2;
}

#[inline]
pub fn actor_wire_id(handle: Handle) -> u32 {
	handle.raw()
}

#[inline]
pub fn projectile_wire_id(handle: Handle) -> u32 {
	handle.raw() | PROJECTILE_NAMESPACE_BIT
}
