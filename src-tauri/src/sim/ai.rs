//! Crowd AI. Decisions are staggered across ticks (each pedestrian thinks every `DECISION_STAGGER` ticks); steering runs
//! every tick so motion stays smooth. Stimuli (gunshots) reach agents through grid radius queries — O(events × nearby),
//! never O(events × all agents).

use std::f32::consts::TAU;

use super::entities::{anim, Actor, ActorKind, AiMode, GameEvent, GameEventKind};
use super::math::{Rng, Vec2};
use super::pool::Pool;
use super::spatial::DynamicGrid;

const DECISION_STAGGER: u32 = 4;
const WALK_FRACTION: f32 = 0.35;
const STEERING_RESPONSE: f32 = 6.0;
const ARRIVAL_RADIUS_SQUARED: f32 = 1.5 * 1.5;
const MOVING_THRESHOLD: f32 = 0.2;
const FLEE_RADIUS: f32 = 45.0;
const FLEE_DISTANCE: f32 = 60.0;
const FLEE_DURATION: f32 = 6.0;

pub fn update(actors: &mut Pool<Actor>, rng: &mut Rng, tick: u32, dt: f32) {
	actors.for_each_mut(|handle, actor| {
		if actor.kind != ActorKind::Pedestrian || actor.is_dead() {
			return;
		}
		actor.ai_timer -= dt;
		if (handle.index() as u32).wrapping_add(tick) % DECISION_STAGGER == 0 {
			decide(actor, rng);
		}
		steer(actor, dt);
	});
}

pub fn react_to_events(events: &[GameEvent], grid: &DynamicGrid, actors: &mut Pool<Actor>) {
	for event in events.iter().filter(|event| event.kind == GameEventKind::Gunshot) {
		grid.query_radius(event.pos.x, event.pos.z, FLEE_RADIUS, |entry| {
			let actor = actors.slot_mut(entry.slot as usize);
			if actor.kind != ActorKind::Pedestrian || actor.is_dead() {
				return;
			}
			let away = (actor.pos - event.pos).normalize_or(Vec2::from_angle(entry.slot as f32));
			actor.ai = AiMode::Flee;
			actor.ai_target = actor.pos + away * FLEE_DISTANCE;
			actor.ai_timer = FLEE_DURATION;
		});
	}
}

pub fn locomotion_anim(speed: f32, walk_speed: f32) -> u8 {
	if speed < MOVING_THRESHOLD {
		anim::IDLE
	} else if speed <= walk_speed * 1.2 {
		anim::WALK
	} else {
		anim::RUN
	}
}

fn decide(actor: &mut Actor, rng: &mut Rng) {
	let expired = actor.ai_timer <= 0.0;
	match actor.ai {
		AiMode::Idle if expired => {
			actor.ai = AiMode::Wander;
			actor.ai_target = actor.pos + Vec2::from_angle(rng.range(0.0, TAU)) * rng.range(8.0, 30.0);
			actor.ai_timer = rng.range(4.0, 10.0);
		}
		AiMode::Wander if expired || (actor.ai_target - actor.pos).length_squared() < ARRIVAL_RADIUS_SQUARED => {
			actor.ai = AiMode::Idle;
			actor.ai_timer = rng.range(1.0, 3.0);
		}
		AiMode::Flee if expired => {
			actor.ai = AiMode::Idle;
			actor.ai_timer = rng.range(0.5, 1.5);
		}
		_ => {}
	}
}

fn steer(actor: &mut Actor, dt: f32) {
	let walk_speed = actor.max_speed * WALK_FRACTION;
	let toward_target = (actor.ai_target - actor.pos).normalize_or(Vec2::ZERO);
	let desired = match actor.ai {
		AiMode::Idle => Vec2::ZERO,
		AiMode::Wander => toward_target * walk_speed,
		AiMode::Flee => toward_target * actor.max_speed,
	};
	actor.vel = actor.vel.lerp(desired, (dt * STEERING_RESPONSE).min(1.0));
	let speed = actor.vel.length();
	if speed > MOVING_THRESHOLD {
		actor.heading = actor.vel.angle();
	}
	actor.anim = locomotion_anim(speed, walk_speed);
}
