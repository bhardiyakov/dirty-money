//! Kinematic 2.5D physics: integration, actor-vs-actor separation (grid broadphase), actor-vs-static push-out and
//! swept projectile hits. No allocation; every pass is O(n · local density).
//!
//! Vehicles currently collide as circles. Oriented boxes / tyre models belong in a dedicated `vehicle.rs` (or rapier2d)
//! fed by the same grids — the broadphase does not change.

use super::entities::{Actor, EventQueue, GameEvent, GameEventKind, Projectile};
use super::math::Vec2;
use super::pool::{Handle, Pool};
use super::spatial::{DynamicGrid, StaticGrid};
use crate::net::protocol::actor_wire_id;

const SEPARATION_EPSILON: f32 = 1e-4;

pub fn integrate_actors(actors: &mut Pool<Actor>, dt: f32) {
	actors.for_each_mut(|_, actor| actor.pos += actor.vel * dt);
}

/// Mass-weighted positional correction for every overlapping living pair.
pub fn resolve_actor_overlaps(grid: &DynamicGrid, actors: &mut Pool<Actor>) {
	grid.for_each_overlapping_pair(|a, b| {
		let (slot_a, slot_b) = (a.slot as usize, b.slot as usize);
		let (pos_a, weight_a, dead_a) = {
			let actor = actors.slot(slot_a);
			(actor.pos, actor.inv_mass, actor.is_dead())
		};
		let (pos_b, weight_b, dead_b) = {
			let actor = actors.slot(slot_b);
			(actor.pos, actor.inv_mass, actor.is_dead())
		};
		let total_weight = weight_a + weight_b;
		if dead_a || dead_b || total_weight <= 0.0 {
			return;
		}
		// Narrowphase on current positions: earlier pairs this tick may already have moved these bodies.
		let delta = pos_b - pos_a;
		let reach = a.radius + b.radius;
		let distance_squared = delta.length_squared();
		if distance_squared >= reach * reach {
			return;
		}
		let distance = distance_squared.sqrt();
		let normal = if distance > SEPARATION_EPSILON { delta / distance } else { Vec2::X };
		let correction = normal * ((reach - distance) / total_weight);
		actors.slot_mut(slot_a).pos -= correction * weight_a;
		actors.slot_mut(slot_b).pos += correction * weight_b;
	});
}

/// Pushes actors out of static colliders and removes the velocity component driving them into the wall.
pub fn resolve_static_overlaps(statics: &mut StaticGrid, actors: &mut Pool<Actor>) {
	actors.for_each_mut(|_, actor| {
		let (x, z, radius) = (actor.pos.x, actor.pos.z, actor.radius);
		let mut push = Vec2::ZERO;
		statics.query_circle(x, z, radius, |aabb| {
			let (closest_x, closest_z) = aabb.closest_point(x, z);
			let offset = Vec2::new(x - closest_x, z - closest_z);
			let distance_squared = offset.length_squared();
			if distance_squared > SEPARATION_EPSILON * SEPARATION_EPSILON {
				let distance = distance_squared.sqrt();
				push += offset * ((radius - distance) / distance);
				return;
			}
			// Centre inside the box (tunnelled or spawned inside): exit through the nearest face.
			let exits = [
				(x - aabb.min_x, Vec2::new(-(x - aabb.min_x + radius), 0.0)),
				(aabb.max_x - x, Vec2::new(aabb.max_x - x + radius, 0.0)),
				(z - aabb.min_z, Vec2::new(0.0, -(z - aabb.min_z + radius))),
				(aabb.max_z - z, Vec2::new(0.0, aabb.max_z - z + radius)),
			];
			let nearest = exits.iter().min_by(|a, b| a.0.total_cmp(&b.0)).map_or(Vec2::ZERO, |exit| exit.1);
			push += nearest;
		});
		if push == Vec2::ZERO {
			return;
		}
		actor.pos += push;
		let normal = push.normalize_or(Vec2::ZERO);
		let into_wall = actor.vel.dot(normal);
		if into_wall < 0.0 {
			actor.vel -= normal * into_wall;
		}
	});
}

/// Swept segment-vs-circle hits against the actor grid, point test against statics. Expired or hitting projectiles are
/// queued in `expired` (pre-allocated) and despawned by the caller after the pass.
pub fn step_projectiles(
	projectiles: &mut Pool<Projectile>,
	actors: &mut Pool<Actor>,
	grid: &DynamicGrid,
	statics: &mut StaticGrid,
	events: &mut EventQueue,
	expired: &mut Vec<Handle>,
	dt: f32,
) {
	let query_padding = grid.max_radius();
	projectiles.for_each_mut(|handle, projectile| {
		projectile.ttl -= dt;
		if projectile.ttl <= 0.0 {
			expired.push(handle);
			return;
		}
		let start = projectile.pos;
		let travel = projectile.vel * dt;
		let middle = start + travel * 0.5;
		let owner_slot = projectile.owner.index() as u32;

		let mut nearest_hit: Option<(u32, f32)> = None;
		grid.query_radius(middle.x, middle.z, travel.length() * 0.5 + query_padding, |entry| {
			if entry.slot == owner_slot || actors.slot(entry.slot as usize).is_dead() {
				return;
			}
			let hit = segment_circle_hit(start, travel, Vec2::new(entry.x, entry.z), entry.radius);
			if let Some(t) = hit {
				if nearest_hit.map_or(true, |(_, best)| t < best) {
					nearest_hit = Some((entry.slot, t));
				}
			}
		});

		if let Some((slot, t)) = nearest_hit {
			let target = actors.slot_mut(slot as usize);
			target.health -= projectile.damage;
			let point = start + travel * t;
			events.push(GameEvent {
				kind: GameEventKind::Impact,
				param: 1,
				pos: point,
				source: actor_wire_id(actors.handle_at(slot as usize)),
			});
			expired.push(handle);
			return;
		}

		let end = start + travel;
		if statics.intersects_circle(end.x, end.z, 0.0) {
			events.push(GameEvent { kind: GameEventKind::Impact, param: 0, pos: end, source: 0 });
			expired.push(handle);
			return;
		}
		projectile.pos = end;
	});
}

/// First intersection parameter t ∈ [0, 1] of `origin + direction · t` with the circle, if any.
#[inline]
fn segment_circle_hit(origin: Vec2, direction: Vec2, centre: Vec2, radius: f32) -> Option<f32> {
	let offset = origin - centre;
	let a = direction.length_squared();
	let c = offset.length_squared() - radius * radius;
	if c <= 0.0 {
		return Some(0.0);
	}
	if a < 1e-12 {
		return None;
	}
	let b = offset.dot(direction);
	let discriminant = b * b - a * c;
	if discriminant < 0.0 {
		return None;
	}
	let t = (-b - discriminant.sqrt()) / a;
	(0.0..=1.0).contains(&t).then_some(t)
}
