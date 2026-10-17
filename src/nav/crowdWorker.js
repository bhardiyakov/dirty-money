// ============================================================================
// Crowd worker — the walking crowd off the main thread (nav/CrowdSim.js on nav/NavGrid.js). The main thread (core/navigation.js,
// CrowdProxy) sends the raster once and then one `step` per frame with that frame's commands; the worker answers with every agent's
// position, velocity and state in one transferred Float32Array, which the main thread hands back for reuse with the next step.
// ============================================================================

importScripts('./NavGrid.js', './CrowdSim.js');

const PATH_MS = 6;              // A* time per step: off the main thread, it can spend more than the 3 ms the frame used to allow
let sim = null;

self.onmessage = (ev) => {
	const m = ev.data;
	if (m.t === 'init') { sim = new CrowdSim(new NavGrid(m.w, m.h, m.minX, m.minZ, new Uint8Array(m.grid))); return; }
	if (m.t !== 'step' || !sim) return;
	sim.apply(m.cmds);
	sim.setWorld(m.cars, m.player);
	sim.step(m.dt, PATH_MS);
	const out = sim.write(m.buf ? new Float32Array(m.buf) : null);
	self.postMessage({ t: 'state', seq: m.seq, buf: out.buffer, n: sim.agents.length, stats: sim.nav.stats }, [out.buffer]);
};
