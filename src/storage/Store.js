// ============================================================================
// Store — the game's persistence (the saved game and the settings) behind one small key-value API, so the medium can change
// without touching the game. Today it is the browser's localStorage; in the desktop app (Tauri) a native backend — SQLite through a
// Rust command, for example — plugs in with `Store.attach(backend)`.
//
// Reads are SYNCHRONOUS: the game reads its settings while the scripts load (Graphics, config.js), before anything asynchronous can
// run. They come from the local mirror (localStorage). An attached backend first fills the mirror with its own values, then
// receives every write, so the next start still finds them in the mirror even before the backend answers.
//
//   get(key) · getJSON(key, fallback) · set(key, text) · setJSON(key, value) → kept? · remove(key)
//   attach({ load(): Promise<{ key: text }>, write(key, text | null): Promise })
// Keys are short names ('save', 'settings'); the mirror stores them as 'dm_<key>' (the names the game always used).
// ============================================================================

const Store = {
	PREFIX: 'dm_',
	backend: null,

	_mirror() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } },

	get(key) {
		const m = this._mirror();
		try { return m ? m.getItem(this.PREFIX + key) : null; } catch (e) { return null; }
	},
	getJSON(key, fallback = null) {
		const raw = this.get(key);
		if (raw == null) return fallback;
		try { return JSON.parse(raw); } catch (e) { return fallback; }
	},

	// Saves `text` under `key`. Returns false when nothing could keep it (no storage, or full and no backend).
	set(key, text) {
		const m = this._mirror();
		let kept = false;
		try { if (m) { m.setItem(this.PREFIX + key, text); kept = true; } } catch (e) { console.warn(`[STORE] '${key}' did not fit in the local mirror:`, e); }
		if (this.backend) { this._send(key, text); kept = true; }
		return kept;
	},
	setJSON(key, value) { return this.set(key, JSON.stringify(value)); },

	remove(key) {
		const m = this._mirror();
		try { if (m) m.removeItem(this.PREFIX + key); } catch (e) { /* no storage */ }
		if (this.backend) this._send(key, null);
	},

	// Plugs in a native backend: its values replace the mirror's, and every write from now on goes to it too.
	async attach(backend) {
		const all = await backend.load();
		const m = this._mirror();
		for (const [key, text] of Object.entries(all || {})) try { if (m) m.setItem(this.PREFIX + key, text); } catch (e) { /* mirror full: the backend still has it */ }
		this.backend = backend;
	},
	_send(key, text) {
		Promise.resolve().then(() => this.backend.write(key, text)).catch((e) => console.error(`[STORE] backend did not save '${key}':`, e));
	},
};
