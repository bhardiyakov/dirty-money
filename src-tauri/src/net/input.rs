//! Lock-free input mailbox between the IPC thread and the simulation thread.
//!
//! Continuous state (axes, held buttons, aim) is packed into one `AtomicU64` — last writer wins, which is exactly the
//! semantics of a 60 TPS input sample. Edge-triggered buttons are OR-accumulated in a second atomic and consumed by the
//! next tick, so a tap shorter than one tick is never lost. No queue, no lock, no allocation.

use std::fmt;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};

use super::protocol::INPUT_PACKET_SIZE;
use super::snapshot::dequantize_angle;
use crate::sim::math::Vec2;

#[derive(Clone, Copy, Debug, Default)]
pub struct InputFrame {
	pub move_axis: Vec2,
	pub aim_angle: f32,
	pub held: u16,
	pub pressed: u16,
	pub sequence: u16,
}

impl InputFrame {
	#[inline]
	pub fn is_held(&self, button: u16) -> bool {
		self.held & button != 0
	}

	#[inline]
	pub fn was_pressed(&self, button: u16) -> bool {
		self.pressed & button != 0
	}
}

#[derive(Debug)]
pub struct InvalidInputPacket(pub usize);

impl fmt::Display for InvalidInputPacket {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		write!(f, "input packet must be {INPUT_PACKET_SIZE} bytes, got {}", self.0)
	}
}

#[derive(Default)]
pub struct InputMailbox {
	latest: AtomicU64,
	pressed: AtomicU32,
}

impl InputMailbox {
	pub fn publish(&self, packet: &[u8]) -> Result<(), InvalidInputPacket> {
		if packet.len() != INPUT_PACKET_SIZE {
			return Err(InvalidInputPacket(packet.len()));
		}
		let held = u16::from_le_bytes([packet[2], packet[3]]);
		let pressed = u16::from_le_bytes([packet[4], packet[5]]);
		let aim = u16::from_le_bytes([packet[6], packet[7]]);
		let sequence = u32::from_le_bytes([packet[8], packet[9], packet[10], packet[11]]);
		let packed = packet[0] as u64
			| (packet[1] as u64) << 8
			| (held as u64) << 16
			| (aim as u64) << 32
			| ((sequence & 0xFFFF) as u64) << 48;
		self.latest.store(packed, Ordering::Release);
		self.pressed.fetch_or(pressed as u32, Ordering::AcqRel);
		Ok(())
	}

	/// Called once per simulation tick.
	pub fn take(&self) -> InputFrame {
		let packed = self.latest.load(Ordering::Acquire);
		let pressed = self.pressed.swap(0, Ordering::AcqRel) as u16;
		let axis = |byte: u64| ((byte & 0xFF) as u8 as i8) as f32 / 127.0;
		InputFrame {
			move_axis: Vec2::new(axis(packed), axis(packed >> 8)).clamp_length(1.0),
			held: (packed >> 16) as u16,
			aim_angle: dequantize_angle((packed >> 32) as u16),
			sequence: (packed >> 48) as u16,
			pressed,
		}
	}
}
