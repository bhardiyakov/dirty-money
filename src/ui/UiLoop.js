// ============================================================================
// UiLoop — the interface modules (HUD panels, prompt, minimap) on their own clock, out of the scene's update/render path.
//
// The game no longer calls them in the middle of its frame: where it used to, it only says which modules are live this frame
// (`advance(dt, names)` — the world, an interior and the pause menu show different ones). Each module runs at its own rate (a
// text panel does not need 30 updates a second) and only AFTER the scene has been drawn (`flush()`, called by the frame loop once
// the GPU has the frame's commands), so interface work never delays the next picture, and the modules are staggered so they
// rarely land on the same frame. A module receives the time since its previous run.
// ============================================================================

class UiLoop {
	constructor() {
		this.tasks = new Map();          // name → { period, fn, acc, elapsed, due }
	}

	// `hz` = updates per second; `fn(elapsed)` does the module's work.
	add(name, hz, fn) {
		const period = 1 / hz, k = this.tasks.size;
		this.tasks.set(name, { period, fn, acc: period * ((k * 0.37) % 1), elapsed: 0, due: false });      // (staggered start)
	}

	// The modules in `names` are live this frame: their clocks advance; the ones whose turn came run at the next flush.
	advance(dt, names) {
		for (const name of names) {
			const t = this.tasks.get(name);
			if (!t) continue;
			t.elapsed += dt; t.acc += dt;
			if (t.acc >= t.period) { t.acc = Math.min(t.acc - t.period, t.period); t.due = true; }
		}
	}

	// After the scene is drawn: runs the modules whose turn came. Returns how many ran.
	flush() {
		let ran = 0;
		for (const t of this.tasks.values()) {
			if (!t.due) continue;
			t.due = false;
			const e = t.elapsed;
			t.elapsed = 0;
			t.fn(e);
			ran++;
		}
		return ran;
	}
}
