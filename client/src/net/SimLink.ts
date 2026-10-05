import { Channel, invoke } from '@tauri-apps/api/core';

import { InterpolationBuffer } from './InterpolationBuffer';
import { decodeSnapshot } from './SnapshotDecoder';

export interface WorldInfo {
	readonly bounds: { readonly minX: number; readonly minZ: number; readonly maxX: number; readonly maxZ: number };
	readonly chunkSize: number;
	readonly tickRate: number;
}

/** Thin transport over Tauri IPC. All payloads on hot paths are raw bytes; nothing here touches JSON per frame. */
export class SimLink {
	constructor(private readonly interpolation: InterpolationBuffer) {}

	worldInfo(): Promise<WorldInfo> {
		return invoke<WorldInfo>('world_info');
	}

	async connect(): Promise<void> {
		const channel = new Channel<ArrayBuffer | number[]>();
		channel.onmessage = (message) => this.onSnapshot(message);
		await invoke('subscribe_snapshots', { channel });
	}

	sendInput(packet: Uint8Array): Promise<void> {
		return invoke('push_input', packet);
	}

	fetchChunk(chunkX: number, chunkZ: number): Promise<ArrayBuffer> {
		return invoke<ArrayBuffer>('get_chunk', { chunkX, chunkZ });
	}

	private onSnapshot(message: ArrayBuffer | number[]): void {
		// Raw channel bodies arrive as ArrayBuffer; the array branch only guards against a JSON fallback in the runtime.
		const buffer = message instanceof ArrayBuffer ? message : new Uint8Array(message).buffer;
		const frame = this.interpolation.acquireWriteFrame();
		if (decodeSnapshot(buffer, frame)) {
			this.interpolation.commit(performance.now() / 1000);
		}
	}
}
