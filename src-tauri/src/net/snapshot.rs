//! Serialises the area of interest into one contiguous byte buffer. The buffer is allocated once at its worst-case size
//! and reused every tick (`clear` keeps capacity), so writing a snapshot never allocates.

use std::f32::consts::TAU;

use super::protocol::{
	ENTITY_RECORD_SIZE, EVENT_RECORD_SIZE, HEADER_SIZE, PROTOCOL_VERSION, SNAPSHOT_MAGIC,
};
use crate::sim::entities::GameEvent;

const ENTITY_COUNT_OFFSET: usize = 16;
const EVENT_COUNT_OFFSET: usize = 20;

pub struct SnapshotHeader {
	pub tick: u32,
	pub player_id: u32,
	pub weather: u8,
	pub weather_intensity: u8,
}

pub struct EntityRecord {
	pub id: u32,
	pub x: f32,
	pub y: f32,
	pub z: f32,
	pub heading: f32,
	pub kind: u8,
	pub anim: u8,
}

pub struct SnapshotWriter {
	buffer: Vec<u8>,
	entity_count: u32,
	event_count: u32,
	max_entities: u32,
	max_events: u32,
}

impl SnapshotWriter {
	pub fn new(max_entities: usize, max_events: usize) -> Self {
		let capacity = HEADER_SIZE + max_entities * ENTITY_RECORD_SIZE + max_events * EVENT_RECORD_SIZE;
		Self {
			buffer: Vec::with_capacity(capacity),
			entity_count: 0,
			event_count: 0,
			max_entities: max_entities as u32,
			max_events: max_events as u32,
		}
	}

	pub fn begin(&mut self, header: &SnapshotHeader) {
		self.buffer.clear();
		self.entity_count = 0;
		self.event_count = 0;
		self.put_u32(SNAPSHOT_MAGIC);
		self.put_u16(PROTOCOL_VERSION);
		self.put_u8(header.weather);
		self.put_u8(header.weather_intensity);
		self.put_u32(header.tick);
		self.put_u32(header.player_id);
		self.put_u32(0);
		self.put_u32(0);
		debug_assert_eq!(self.buffer.len(), HEADER_SIZE);
	}

	/// Entities must all be written before the first event. Returns false when the record budget is exhausted.
	pub fn push_entity(&mut self, record: &EntityRecord) -> bool {
		debug_assert_eq!(self.event_count, 0, "entity records must precede event records");
		if self.entity_count == self.max_entities {
			return false;
		}
		self.put_u32(record.id);
		self.put_f32(record.x);
		self.put_f32(record.y);
		self.put_f32(record.z);
		self.put_u16(quantize_angle(record.heading));
		self.put_u8(record.kind);
		self.put_u8(record.anim);
		self.entity_count += 1;
		true
	}

	pub fn push_event(&mut self, event: &GameEvent) -> bool {
		if self.event_count == self.max_events {
			return false;
		}
		self.put_u8(event.kind as u8);
		self.put_u8(0);
		self.put_u16(event.param);
		self.put_f32(event.pos.x);
		self.put_f32(event.pos.z);
		self.put_u32(event.source);
		self.event_count += 1;
		true
	}

	/// Patches the record counts into the header and exposes the finished bytes.
	pub fn finish(&mut self) -> &[u8] {
		self.buffer[ENTITY_COUNT_OFFSET..ENTITY_COUNT_OFFSET + 4].copy_from_slice(&self.entity_count.to_le_bytes());
		self.buffer[EVENT_COUNT_OFFSET..EVENT_COUNT_OFFSET + 4].copy_from_slice(&self.event_count.to_le_bytes());
		&self.buffer
	}

	#[inline]
	fn put_u8(&mut self, value: u8) {
		self.buffer.push(value);
	}

	#[inline]
	fn put_u16(&mut self, value: u16) {
		self.buffer.extend_from_slice(&value.to_le_bytes());
	}

	#[inline]
	fn put_u32(&mut self, value: u32) {
		self.buffer.extend_from_slice(&value.to_le_bytes());
	}

	#[inline]
	fn put_f32(&mut self, value: f32) {
		self.buffer.extend_from_slice(&value.to_le_bytes());
	}
}

#[inline]
pub fn quantize_angle(angle: f32) -> u16 {
	((angle.rem_euclid(TAU) * (65_536.0 / TAU)) as u32 & 0xFFFF) as u16
}

#[inline]
pub fn dequantize_angle(value: u16) -> f32 {
	value as f32 * (TAU / 65_536.0)
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::sim::entities::GameEventKind;
	use crate::sim::math::Vec2;

	#[test]
	fn layout_matches_protocol_sizes() {
		let mut writer = SnapshotWriter::new(2, 1);
		writer.begin(&SnapshotHeader { tick: 7, player_id: 3, weather: 2, weather_intensity: 128 });
		let record = EntityRecord { id: 1, x: 1.0, y: 0.0, z: 2.0, heading: 1.0, kind: 0, anim: 1 };
		assert!(writer.push_entity(&record));
		assert!(writer.push_entity(&record));
		assert!(!writer.push_entity(&record));
		writer.push_event(&GameEvent { kind: GameEventKind::Gunshot, param: 0, pos: Vec2::ZERO, source: 1 });
		let capacity_before = writer.buffer.capacity();
		let bytes = writer.finish();
		assert_eq!(bytes.len(), HEADER_SIZE + 2 * ENTITY_RECORD_SIZE + EVENT_RECORD_SIZE);
		assert_eq!(u32::from_le_bytes(bytes[16..20].try_into().unwrap()), 2);
		assert_eq!(u32::from_le_bytes(bytes[20..24].try_into().unwrap()), 1);
		assert_eq!(writer.buffer.capacity(), capacity_before);
	}
}
