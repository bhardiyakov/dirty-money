//! Plain-data entity records stored in the pools. `Copy` + small so the hot loops stream through contiguous memory.

use super::math::{Rng, Vec2};
use super::pool::Handle;

/// Wire values are mirrored in `client/src/net/protocol.ts` (`EntityKind`).
#[repr(u8)]
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ActorKind {
	#[default]
	Pedestrian = 0,
	Player = 1,
	Police = 2,
	Gangster = 3,
	Vehicle = 4,
}

/// Wire values are mirrored in `client/src/net/protocol.ts` (`AnimState`).
pub mod anim {
	pub const IDLE: u8 = 0;
	pub const WALK: u8 = 1;
	pub const RUN: u8 = 2;
	pub const DEAD: u8 = 3;
}

#[repr(u8)]
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum AiMode {
	#[default]
	Idle,
	Wander,
	Flee,
}

pub const PEDESTRIAN_RADIUS: f32 = 0.45;
const PLAYER_RADIUS: f32 = 0.45;
const PLAYER_HEALTH: f32 = 100.0;
const PEDESTRIAN_HEALTH: f32 = 40.0;

#[derive(Clone, Copy, Debug, Default)]
pub struct Actor {
	pub kind: ActorKind,
	pub ai: AiMode,
	pub anim: u8,
	pub pos: Vec2,
	pub elevation: f32,
	pub vel: Vec2,
	/// Radians from +X towards +Z.
	pub heading: f32,
	pub radius: f32,
	/// 0 = immovable in actor-vs-actor resolution.
	pub inv_mass: f32,
	pub max_speed: f32,
	pub health: f32,
	pub ai_target: Vec2,
	/// Multi-purpose countdown: AI decision timer while alive, corpse / respawn timer while dead.
	pub ai_timer: f32,
}

impl Actor {
	pub fn player(pos: Vec2) -> Self {
		Self {
			kind: ActorKind::Player,
			pos,
			radius: PLAYER_RADIUS,
			inv_mass: 0.25,
			max_speed: 7.5,
			health: PLAYER_HEALTH,
			..Self::default()
		}
	}

	pub fn pedestrian(pos: Vec2, rng: &mut Rng) -> Self {
		Self {
			kind: ActorKind::Pedestrian,
			pos,
			heading: rng.range(0.0, std::f32::consts::TAU),
			radius: PEDESTRIAN_RADIUS,
			inv_mass: 1.0,
			max_speed: rng.range(3.5, 5.0),
			health: PEDESTRIAN_HEALTH,
			ai_timer: rng.range(0.0, 2.0),
			..Self::default()
		}
	}

	#[inline]
	pub fn is_dead(&self) -> bool {
		self.anim == anim::DEAD
	}

	pub fn kill(&mut self, corpse_timer: f32) {
		self.anim = anim::DEAD;
		self.vel = Vec2::ZERO;
		self.ai = AiMode::Idle;
		self.ai_timer = corpse_timer;
	}
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Projectile {
	pub pos: Vec2,
	pub vel: Vec2,
	pub ttl: f32,
	pub damage: f32,
	pub owner: Handle,
}

/// Wire values are mirrored in `client/src/net/protocol.ts` (`GameEventKind`).
#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GameEventKind {
	Gunshot = 1,
	Impact = 2,
	Death = 3,
}

/// One-shot facts the client turns into VFX/SFX (muzzle flash, blood, ragdoll trigger). Never drives client-side logic.
#[derive(Clone, Copy, Debug)]
pub struct GameEvent {
	pub kind: GameEventKind,
	pub param: u16,
	pub pos: Vec2,
	pub source: u32,
}

/// Bounded outbox: events accumulate across catch-up ticks and are cleared once a snapshot carried them.
pub struct EventQueue {
	events: Vec<GameEvent>,
	capacity: usize,
}

impl EventQueue {
	pub fn with_capacity(capacity: usize) -> Self {
		Self { events: Vec::with_capacity(capacity), capacity }
	}

	/// Drops the event when full: cosmetic data, never worth an allocation mid-tick.
	#[inline]
	pub fn push(&mut self, event: GameEvent) -> bool {
		if self.events.len() == self.capacity {
			return false;
		}
		self.events.push(event);
		true
	}

	#[inline]
	pub fn len(&self) -> usize {
		self.events.len()
	}

	#[inline]
	pub fn as_slice(&self) -> &[GameEvent] {
		&self.events
	}

	#[inline]
	pub fn clear(&mut self) {
		self.events.clear();
	}
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Weather {
	/// Mirrored in the client: 0 clear, 1 drizzle, 2 rain, 3 storm.
	pub kind: u8,
	/// 0..=255 → 0..1 on the client.
	pub intensity: u8,
}
