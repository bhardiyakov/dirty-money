import { MAX_SNAPSHOT_ENTITIES, TICK_SECONDS } from './protocol';
import { SnapshotFrame } from './SnapshotDecoder';

const TAU = Math.PI * 2;
/** Past the newest snapshot we extrapolate linearly for at most this long, then hold (covers a dropped packet). */
const MAX_EXTRAPOLATION_SECONDS = 0.1;
/** A jump larger than this between two ticks is a teleport/respawn: snap instead of sliding across the map. */
const TELEPORT_DISTANCE_SQUARED = 10 * 10;
/** Clock estimate is rebuilt from scratch when a sample disagrees by more than this (sim hitch, window restore). */
const CLOCK_RESYNC_SECONDS = 0.25;
/** Early samples pull the estimate quickly (they reveal true latency); late samples are jitter and pull slowly. */
const CLOCK_GAIN_EARLY = 0.2;
const CLOCK_GAIN_LATE = 0.02;

/** Render-ready entity state for the current display frame. Preallocated; rewritten every `sample`. */
export class InterpolatedState {
	count = 0;
	tick = 0;
	playerRow = -1;
	weather = 0;
	weatherIntensity = 0;

	readonly ids = new Uint32Array(MAX_SNAPSHOT_ENTITIES);
	readonly x = new Float32Array(MAX_SNAPSHOT_ENTITIES);
	readonly y = new Float32Array(MAX_SNAPSHOT_ENTITIES);
	readonly z = new Float32Array(MAX_SNAPSHOT_ENTITIES);
	readonly heading = new Float32Array(MAX_SNAPSHOT_ENTITIES);
	readonly kind = new Uint8Array(MAX_SNAPSHOT_ENTITIES);
	readonly anim = new Uint8Array(MAX_SNAPSHOT_ENTITIES);
}

/**
 * Snapshot interpolation between the 60 TPS simulation and an arbitrary display rate (60/144/240 Hz).
 *
 * The client renders `delaySeconds` in the past on an estimated server clock, so there are almost always two snapshots
 * bracketing the render time. Frames live in a fixed ring plus one spare: an incoming message is decoded into the spare
 * and swapped in on commit, so a rejected (late/duplicate) message never corrupts a frame still in use.
 */
export class InterpolationBuffer {
	readonly state = new InterpolatedState();

	private readonly frames: SnapshotFrame[];
	private spare = new SnapshotFrame();
	private oldest = 0;
	private size = 0;
	private clockOffset = 0;
	private clockSynced = false;
	private lastDispatchedTick = -1;

	constructor(
		private readonly capacity = 16,
		private readonly delaySeconds = 2 * TICK_SECONDS + 0.008,
	) {
		this.frames = Array.from({ length: capacity }, () => new SnapshotFrame());
	}

	/** Frame to decode the next message into. It joins the ring only through `commit`. */
	acquireWriteFrame(): SnapshotFrame {
		return this.spare;
	}

	commit(localSeconds: number): void {
		const frame = this.spare;
		if (this.size > 0 && frame.tick <= this.at(this.size - 1).tick) {
			return;
		}
		this.syncClock(frame.serverTime - localSeconds);
		const slot = (this.oldest + this.size) % this.capacity;
		if (this.size === this.capacity) {
			this.oldest = (this.oldest + 1) % this.capacity;
		} else {
			this.size++;
		}
		this.spare = this.frames[slot];
		this.frames[slot] = frame;
	}

	sample(localSeconds: number): InterpolatedState {
		const out = this.state;
		if (this.size === 0) {
			out.count = 0;
			out.playerRow = -1;
			return out;
		}
		if (this.size === 1) {
			this.blend(this.at(0), this.at(0), 0);
			return out;
		}

		const renderTime = this.renderTime(localSeconds);
		let older = this.at(this.size - 2);
		let newer = this.at(this.size - 1);
		for (let i = 1; i < this.size; i++) {
			const candidate = this.at(i);
			if (candidate.serverTime >= renderTime) {
				older = this.at(i - 1);
				newer = candidate;
				break;
			}
		}
		const span = newer.serverTime - older.serverTime;
		const maxAlpha = 1 + MAX_EXTRAPOLATION_SECONDS / span;
		const alpha = Math.min(Math.max((renderTime - older.serverTime) / span, 0), maxAlpha);
		this.blend(older, newer, alpha);
		return out;
	}

	/** Hands every not-yet-dispatched frame whose time has been reached to `visit` (one-shot VFX/SFX events). */
	drainEvents(localSeconds: number, visit: (frame: SnapshotFrame) => void): void {
		const renderTime = this.renderTime(localSeconds);
		for (let i = 0; i < this.size; i++) {
			const frame = this.at(i);
			if (frame.tick > this.lastDispatchedTick && frame.serverTime <= renderTime) {
				this.lastDispatchedTick = frame.tick;
				if (frame.eventCount > 0) {
					visit(frame);
				}
			}
		}
	}

	private renderTime(localSeconds: number): number {
		return localSeconds + this.clockOffset - this.delaySeconds;
	}

	private at(index: number): SnapshotFrame {
		return this.frames[(this.oldest + index) % this.capacity];
	}

	private syncClock(sample: number): void {
		if (!this.clockSynced || Math.abs(sample - this.clockOffset) > CLOCK_RESYNC_SECONDS) {
			this.clockOffset = sample;
			this.clockSynced = true;
			return;
		}
		const gain = sample > this.clockOffset ? CLOCK_GAIN_EARLY : CLOCK_GAIN_LATE;
		this.clockOffset += (sample - this.clockOffset) * gain;
	}

	/** Entities present only in `older` (despawned / left the AOI) are dropped; ones only in `newer` appear in place. */
	private blend(older: SnapshotFrame, newer: SnapshotFrame, alpha: number): void {
		const out = this.state;
		const headingAlpha = Math.min(alpha, 1);
		out.playerRow = -1;
		for (let row = 0; row < newer.count; row++) {
			const id = newer.ids[row];
			let x = newer.x[row];
			let y = newer.y[row];
			let z = newer.z[row];
			let heading = newer.heading[row];
			const previous = older.rowOf(id);
			if (previous >= 0) {
				const dx = x - older.x[previous];
				const dz = z - older.z[previous];
				if (dx * dx + dz * dz < TELEPORT_DISTANCE_SQUARED) {
					x = older.x[previous] + dx * alpha;
					y = older.y[previous] + (y - older.y[previous]) * alpha;
					z = older.z[previous] + dz * alpha;
					heading = lerpAngle(older.heading[previous], heading, headingAlpha);
				}
			}
			out.ids[row] = id;
			out.x[row] = x;
			out.y[row] = y;
			out.z[row] = z;
			out.heading[row] = heading;
			out.kind[row] = newer.kind[row];
			out.anim[row] = newer.anim[row];
			if (id === newer.playerId) {
				out.playerRow = row;
			}
		}
		out.count = newer.count;
		out.tick = newer.tick;
		out.weather = newer.weather;
		out.weatherIntensity = newer.weatherIntensity;
	}
}

function lerpAngle(from: number, to: number, t: number): number {
	let delta = (to - from) % TAU;
	if (delta > Math.PI) {
		delta -= TAU;
	} else if (delta < -Math.PI) {
		delta += TAU;
	}
	return from + delta * t;
}
