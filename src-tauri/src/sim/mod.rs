//! Authoritative game state and the fixed-step tick. Everything here is allocated in `World::new`; `step` and
//! `write_snapshot` run with zero heap traffic.

pub mod ai;
pub mod entities;
pub mod math;
pub mod physics;
pub mod pool;
pub mod spatial;

use std::f32::consts::TAU;

use entities::{anim, Actor, EventQueue, GameEvent, GameEventKind, Projectile, Weather, PEDESTRIAN_RADIUS};
use math::{Rng, Vec2};
use pool::{Handle, Pool};
use spatial::{DynamicGrid, GridLayout, StaticGrid};

use crate::net::input::InputFrame;
use crate::net::protocol::{actor_wire_id, buttons, projectile_wire_id, KIND_PROJECTILE};
use crate::net::snapshot::{EntityRecord, SnapshotHeader, SnapshotWriter};
use crate::world::pack::{WorldBounds, WorldPack};

pub const MAX_ACTORS: usize = 8192;
pub const MAX_PROJECTILES: usize = 2048;
pub const MAX_EVENTS: usize = 512;

/// Must be ≥ 2 × the largest body radius (see `DynamicGrid::for_each_overlapping_pair`).
const ACTOR_CELL_SIZE: f32 = 8.0;
const STATIC_CELL_SIZE: f32 = 16.0;

/// Area of interest streamed to the client. The camera shows at most ~76 u from the player; the rest is margin so the
/// interpolation buffer never sees an entity pop at the screen edge.
pub const AOI_RADIUS: f32 = 160.0;

const TARGET_CROWD: usize = 1500;
const CROWD_SPAWNS_PER_TICK: usize = 24;
const CROWD_SPAWN_MIN_RADIUS: f32 = 80.0;
const CROWD_DESPAWN_RADIUS: f32 = 200.0;
const INITIAL_CROWD_MIN_RADIUS: f32 = 6.0;

const PLAYER_SPAWN: Vec2 = Vec2::new(0.0, 0.0);
const PLAYER_WALK_SPEED: f32 = 4.5;
const PLAYER_SPRINT_SPEED: f32 = 7.5;
const PLAYER_RESPAWN_DELAY: f32 = 4.0;
const CORPSE_LIFETIME: f32 = 30.0;

const FIRE_INTERVAL: f32 = 0.12;
const BULLET_SPEED: f32 = 140.0;
const BULLET_TTL: f32 = 1.2;
const BULLET_DAMAGE: f32 = 25.0;
const BULLET_HEIGHT: f32 = 1.2;

pub struct World {
	tick: u32,
	bounds: WorldBounds,
	actors: Pool<Actor>,
	projectiles: Pool<Projectile>,
	player: Handle,
	actor_grid: DynamicGrid,
	statics: StaticGrid,
	events: EventQueue,
	/// Index of the first event produced by the current tick (older ones are still waiting for a snapshot).
	step_event_start: usize,
	rng: Rng,
	despawn_queue: Vec<Handle>,
	expired_projectiles: Vec<Handle>,
	fire_cooldown: f32,
	weather: Weather,
}

impl World {
	pub fn new(pack: &WorldPack) -> Self {
		let b = pack.bounds;
		let actor_layout = GridLayout::new(b.min_x, b.min_z, b.max_x, b.max_z, ACTOR_CELL_SIZE);
		let static_layout = GridLayout::new(b.min_x, b.min_z, b.max_x, b.max_z, STATIC_CELL_SIZE);
		let mut world = Self {
			tick: 0,
			bounds: b,
			actors: Pool::with_capacity(MAX_ACTORS),
			projectiles: Pool::with_capacity(MAX_PROJECTILES),
			player: Handle::NULL,
			actor_grid: DynamicGrid::new(actor_layout, MAX_ACTORS),
			statics: StaticGrid::build(static_layout, pack.colliders.clone()),
			events: EventQueue::with_capacity(MAX_EVENTS),
			step_event_start: 0,
			rng: Rng::new(pack.seed),
			despawn_queue: Vec::with_capacity(MAX_ACTORS),
			expired_projectiles: Vec::with_capacity(MAX_PROJECTILES),
			fire_cooldown: 0.0,
			weather: Weather::default(),
		};
		world.player = world.actors.spawn(Actor::player(PLAYER_SPAWN)).expect("actor pool has room for the player");
		world.spawn_crowd(INITIAL_CROWD_MIN_RADIUS, TARGET_CROWD);
		world.rebuild_actor_grid();
		world
	}

	pub fn step(&mut self, input: &InputFrame, dt: f32) {
		self.step_event_start = self.events.len();
		self.spawn_crowd(CROWD_SPAWN_MIN_RADIUS, CROWD_SPAWNS_PER_TICK);
		self.apply_player_input(input, dt);
		ai::update(&mut self.actors, &mut self.rng, self.tick, dt);
		physics::integrate_actors(&mut self.actors, dt);
		self.rebuild_actor_grid();
		physics::resolve_actor_overlaps(&self.actor_grid, &mut self.actors);
		physics::resolve_static_overlaps(&mut self.statics, &mut self.actors);
		physics::step_projectiles(
			&mut self.projectiles,
			&mut self.actors,
			&self.actor_grid,
			&mut self.statics,
			&mut self.events,
			&mut self.expired_projectiles,
			dt,
		);
		ai::react_to_events(&self.events.as_slice()[self.step_event_start..], &self.actor_grid, &mut self.actors);
		self.update_player_life(dt);
		self.reap_actors(dt);
		for handle in self.expired_projectiles.drain(..) {
			self.projectiles.despawn(handle);
		}
		self.tick = self.tick.wrapping_add(1);
	}

	/// Area-of-interest snapshot: the grid gives the actors near the player without scanning the pool.
	pub fn write_snapshot(&self, writer: &mut SnapshotWriter) {
		let focus = self.player_position();
		writer.begin(&SnapshotHeader {
			tick: self.tick,
			player_id: actor_wire_id(self.player),
			weather: self.weather.kind,
			weather_intensity: self.weather.intensity,
		});
		self.actor_grid.query_radius(focus.x, focus.z, AOI_RADIUS, |entry| {
			let slot = entry.slot as usize;
			let actor = self.actors.slot(slot);
			writer.push_entity(&EntityRecord {
				id: actor_wire_id(self.actors.handle_at(slot)),
				x: actor.pos.x,
				y: actor.elevation,
				z: actor.pos.z,
				heading: actor.heading,
				kind: actor.kind as u8,
				anim: actor.anim,
			});
		});
		let aoi_squared = AOI_RADIUS * AOI_RADIUS;
		self.projectiles.for_each(|handle, projectile| {
			if (projectile.pos - focus).length_squared() <= aoi_squared {
				writer.push_entity(&EntityRecord {
					id: projectile_wire_id(handle),
					x: projectile.pos.x,
					y: BULLET_HEIGHT,
					z: projectile.pos.z,
					heading: projectile.vel.angle(),
					kind: KIND_PROJECTILE,
					anim: 0,
				});
			}
		});
		for event in self.events.as_slice() {
			writer.push_event(event);
		}
	}

	/// Called after each publish so events produced during catch-up ticks still reach exactly one snapshot.
	pub fn clear_events(&mut self) {
		self.events.clear();
		self.step_event_start = 0;
	}

	fn player_position(&self) -> Vec2 {
		self.actors.get(self.player).map_or(PLAYER_SPAWN, |player| player.pos)
	}

	fn rebuild_actor_grid(&mut self) {
		let Self { actors, actor_grid, .. } = self;
		actor_grid.begin();
		actors.for_each(|handle, actor| {
			actor_grid.insert(handle.index() as u32, actor.pos.x, actor.pos.z, actor.radius);
		});
		actor_grid.finish();
	}

	/// Keeps the crowd at `TARGET_CROWD` inside a ring around the player (GTA-style population bubble). Recycled pool
	/// slots make this free of allocation; attempts are bounded so a blocked area never stalls the tick.
	fn spawn_crowd(&mut self, min_radius: f32, max_spawns: usize) {
		const ATTEMPTS_PER_SPAWN: usize = 4;
		let focus = self.player_position();
		let mut spawned = 0;
		for _ in 0..max_spawns * ATTEMPTS_PER_SPAWN {
			if self.actors.len() > TARGET_CROWD || spawned == max_spawns {
				return;
			}
			let angle = self.rng.range(0.0, TAU);
			let distance = self.rng.range(min_radius, AOI_RADIUS);
			let pos = focus + Vec2::from_angle(angle) * distance;
			if !self.bounds.contains(pos.x, pos.z) || self.statics.intersects_circle(pos.x, pos.z, PEDESTRIAN_RADIUS) {
				continue;
			}
			let pedestrian = Actor::pedestrian(pos, &mut self.rng);
			if self.actors.spawn(pedestrian).is_none() {
				return;
			}
			spawned += 1;
		}
	}

	fn apply_player_input(&mut self, input: &InputFrame, dt: f32) {
		self.fire_cooldown = (self.fire_cooldown - dt).max(0.0);
		let Some(player) = self.actors.get_mut(self.player) else {
			return;
		};
		if player.is_dead() {
			return;
		}
		let speed = if input.is_held(buttons::SPRINT) { PLAYER_SPRINT_SPEED } else { PLAYER_WALK_SPEED };
		player.vel = input.move_axis * speed;
		player.heading = input.aim_angle;
		player.anim = ai::locomotion_anim(player.vel.length(), PLAYER_WALK_SPEED);

		let wants_fire = input.is_held(buttons::FIRE) || input.was_pressed(buttons::FIRE);
		if !wants_fire || self.fire_cooldown > 0.0 {
			return;
		}
		let direction = Vec2::from_angle(input.aim_angle);
		let muzzle = player.pos + direction * (player.radius + 0.3);
		self.fire_cooldown = FIRE_INTERVAL;
		let bullet = Projectile {
			pos: muzzle,
			vel: direction * BULLET_SPEED,
			ttl: BULLET_TTL,
			damage: BULLET_DAMAGE,
			owner: self.player,
		};
		if self.projectiles.spawn(bullet).is_some() {
			self.events.push(GameEvent {
				kind: GameEventKind::Gunshot,
				param: 0,
				pos: muzzle,
				source: actor_wire_id(self.player),
			});
		}
	}

	fn update_player_life(&mut self, dt: f32) {
		let Some(player) = self.actors.get_mut(self.player) else {
			return;
		};
		if !player.is_dead() {
			if player.health <= 0.0 {
				player.kill(PLAYER_RESPAWN_DELAY);
				self.events.push(GameEvent {
					kind: GameEventKind::Death,
					param: player.kind as u16,
					pos: player.pos,
					source: actor_wire_id(self.player),
				});
			}
			return;
		}
		player.ai_timer -= dt;
		if player.ai_timer <= 0.0 {
			*player = Actor::player(PLAYER_SPAWN);
		}
	}

	/// Turns lethal damage into corpses, expires corpses and recycles pedestrians that left the population bubble.
	fn reap_actors(&mut self, dt: f32) {
		let focus = self.player_position();
		let despawn_radius_squared = CROWD_DESPAWN_RADIUS * CROWD_DESPAWN_RADIUS;
		let Self { actors, events, despawn_queue, player, .. } = self;
		let player = *player;
		actors.for_each_mut(|handle, actor| {
			if handle == player {
				return;
			}
			if actor.anim == anim::DEAD {
				actor.ai_timer -= dt;
				if actor.ai_timer <= 0.0 {
					despawn_queue.push(handle);
				}
				return;
			}
			if actor.health <= 0.0 {
				actor.kill(CORPSE_LIFETIME);
				events.push(GameEvent {
					kind: GameEventKind::Death,
					param: actor.kind as u16,
					pos: actor.pos,
					source: actor_wire_id(handle),
				});
				return;
			}
			if (actor.pos - focus).length_squared() > despawn_radius_squared {
				despawn_queue.push(handle);
			}
		});
		for handle in despawn_queue.drain(..) {
			actors.despawn(handle);
		}
	}
}
