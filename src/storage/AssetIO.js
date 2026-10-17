// ============================================================================
// AssetIO — how the game reads its static files (assets/: the baked atlases, their manifests, npc-data.json, the sprite sheets),
// behind one API so the source can change without touching the game. Today it is the network (fetch, served next to index.html);
// the desktop app (Tauri) can plug in a native reader with `AssetIO.use(reader)` — files straight from the installation folder or a
// packed archive — and every loader follows.
//
//   bytes(path, opts) → Promise<ArrayBuffer | null>   (null = not found; network errors too)
//   json(path, opts)  → Promise<object | null>
//   use({ bytes(path, opts): Promise<ArrayBuffer | null> })
// `opts.fresh`: skip the HTTP cache (manifests that change between builds).
// ============================================================================

const AssetIO = {
	reader: null,

	// Whether files can be read at all (the network reader needs http(s): a page opened from file:// has none).
	get available() {
		return !!this.reader || (typeof fetch === 'function' && typeof location !== 'undefined' && /^https?:$/.test(location.protocol));
	},

	use(reader) { this.reader = reader; },

	async bytes(path, opts = {}) {
		if (this.reader) return this.reader.bytes(path, opts);
		try {
			const r = await fetch(path, opts.fresh ? { cache: 'no-cache' } : undefined);
			return r.ok ? r.arrayBuffer() : null;
		} catch (e) { return null; }
	},

	async json(path, opts = {}) {
		const b = await this.bytes(path, opts);
		if (!b) return null;
		try { return JSON.parse(new TextDecoder().decode(b)); } catch (e) { console.warn(`[ASSETS] ${path} is not valid JSON:`, e); return null; }
	},
};
