import { Matrix, Ray, Vector3 } from '@babylonjs/core';
import type { Camera, Scene } from '@babylonjs/core';

import { Buttons, INPUT_PACKET_SIZE, TICK_SECONDS } from '../net/protocol';
import type { SimLink } from '../net/SimLink';

const TAU = Math.PI * 2;
const AXIS_SCALE = 127;
const DIAGONAL = Math.SQRT1_2;
/** Resend unchanged input at this rate so a lost packet can never leave the player stuck. */
const HEARTBEAT_SECONDS = 0.1;

/**
 * Captures keyboard/mouse and ships 12-byte packets (layout in protocol.rs). Sends on change, capped at the tick rate,
 * plus a heartbeat. Edge-triggered presses are OR-accumulated until sent so a tap is never lost between frames.
 */
export class InputSampler {
	private readonly keys = new Set<string>();
	private readonly ray = new Ray(Vector3.Zero(), Vector3.Forward(), 1);
	private pointerX = 0;
	private pointerY = 0;
	private fireHeld = false;
	private pendingPresses = 0;
	private sequence = 0;
	private lastSentAt = Number.NEGATIVE_INFINITY;
	private lastMoveX = 0;
	private lastMoveZ = 0;
	private lastHeld = 0;
	private lastAim = 0;

	constructor(
		canvas: HTMLCanvasElement,
		private readonly scene: Scene,
		private readonly camera: Camera,
	) {
		window.addEventListener('keydown', (event) => {
			if (event.repeat) {
				return;
			}
			this.keys.add(event.code);
			if (event.code === 'KeyE') {
				this.pendingPresses |= Buttons.Interact;
			}
		});
		window.addEventListener('keyup', (event) => this.keys.delete(event.code));
		window.addEventListener('blur', () => {
			this.keys.clear();
			this.fireHeld = false;
		});
		canvas.addEventListener('pointermove', (event) => {
			this.pointerX = event.offsetX;
			this.pointerY = event.offsetY;
		});
		canvas.addEventListener('pointerdown', (event) => {
			if (event.button === 0) {
				this.fireHeld = true;
				this.pendingPresses |= Buttons.Fire;
			}
		});
		window.addEventListener('pointerup', (event) => {
			if (event.button === 0) {
				this.fireHeld = false;
			}
		});
	}

	/** Call once per display frame, after the camera has been positioned. */
	flush(nowSeconds: number, link: SimLink, playerX: number, playerZ: number): void {
		const right = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
		const forward = Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS'));
		const scale = right !== 0 && forward !== 0 ? DIAGONAL : 1;
		const moveX = Math.round(right * scale * AXIS_SCALE);
		const moveZ = Math.round(forward * scale * AXIS_SCALE);
		const held = (this.fireHeld ? Buttons.Fire : 0) | (this.keys.has('ShiftLeft') ? Buttons.Sprint : 0);
		const aim = this.quantizedAim(playerX, playerZ);

		const elapsed = nowSeconds - this.lastSentAt;
		const changed =
			moveX !== this.lastMoveX || moveZ !== this.lastMoveZ || held !== this.lastHeld || aim !== this.lastAim;
		const due = this.pendingPresses !== 0 || (changed && elapsed >= TICK_SECONDS) || elapsed >= HEARTBEAT_SECONDS;
		if (!due) {
			return;
		}

		// Fresh 12-byte buffer per send (≤ 60/s): invoke() may hold the body asynchronously, so reuse would race.
		const packet = new Uint8Array(INPUT_PACKET_SIZE);
		const view = new DataView(packet.buffer);
		view.setInt8(0, moveX);
		view.setInt8(1, moveZ);
		view.setUint16(2, held, true);
		view.setUint16(4, this.pendingPresses, true);
		view.setUint16(6, aim, true);
		view.setUint32(8, ++this.sequence, true);

		this.pendingPresses = 0;
		this.lastSentAt = nowSeconds;
		this.lastMoveX = moveX;
		this.lastMoveZ = moveZ;
		this.lastHeld = held;
		this.lastAim = aim;
		link.sendInput(packet).catch((error: unknown) => console.warn('input packet rejected', error));
	}

	/** Aim = direction from the player to the cursor's projection on the ground plane (y = 0). */
	private quantizedAim(playerX: number, playerZ: number): number {
		this.scene.createPickingRayToRef(this.pointerX, this.pointerY, Matrix.IdentityReadOnly, this.ray, this.camera);
		const { origin, direction } = this.ray;
		if (direction.y > -1e-6) {
			return this.lastAim;
		}
		const t = -origin.y / direction.y;
		const angle = Math.atan2(origin.z + direction.z * t - playerZ, origin.x + direction.x * t - playerX);
		return Math.round((((angle % TAU) + TAU) % TAU) * (65536 / TAU)) & 0xffff;
	}
}
