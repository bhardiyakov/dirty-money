// ============================================================================
// Wardrobe Worker (equipment screen). Bundled with the generator and src/storage/LookStore.js into assets/baked/wardrobe.worker.js
// (bake.cjs) and loaded only by src/player/Wardrobe.js while the equipment screen is open — once it closes, the Worker is terminated and
// nothing of the generator stays in the game's memory.
//
// Messages (the main thread only orchestrates: no pixel of the look goes through it):
//   { type: 'preview', job, spec, k, dirs }        → { job, frames: [RGBA per direction], W, H, k }    (the spinning figure on screen)
//   { type: 'clips', job, ck, part, spec, keys, k, dirs }
//        draws the clips not yet on the device and stores each one (deflated) in  part|<ck>|<part>|<clip>
//        → { job, clip, of } per finished clip, { job, frac } halfway through a clip, { job, done: true } at the end ({ job, cancelled } / { job, error })
//   { type: 'pack', job, ck, sets: [{ key, part, keys }], k }
//        reads the stored clips of each set, packs the pages (G.packPages), stores the finished atlas in <key> (LookStore format: one
//        PNG Blob per page) and deletes the loose clips → { job, packed: [keys] }
//   { type: 'cancel', job }                       stops between two frames (what is already stored stays: it resumes later)
// ============================================================================
const G = {};
NpcGenCore(G); NpcGenChar(G); NpcGenRender(G); NpcGenAnims(G); NpcGenTypes(G); NpcGenBuild(G); NpcGenMesh(G);

// ---------------------------------------------------------------- device storage (LookStore: the same database the main thread reads)
const LOOKS_MAX = 32, RAW_MAX = 8, PARTS_LOOKS = 3;
// '#t' table (key → when it was stored): at most LOOKS_MAX packed atlases (RAW_MAX with raw pages); the oldest goes — never one of the
// look being stored right now (ck). Bookkeeping failures do not fail the look.
function touch(keys, raw, ck) {
	return LookStore.transact('readwrite', async (st) => {
		const T = (await LookStore.request(st.get('#t'))) || {}, now = Date.now();
		for (const k of keys) T[k] = now;
		const max = raw ? RAW_MAX : LOOKS_MAX, old = Object.keys(T).filter((k) => !k.startsWith(ck)).sort((a, b) => T[a] - T[b]);
		while (Object.keys(T).length > max && old.length) { const k = old.shift(); delete T[k]; st.delete(k); }
		st.put(T, '#t');
	}).catch(() => {});
}
// Loose clips of at most PARTS_LOOKS looks (the ones tried most recently): those of older looks go.
function touchParts(ck) {
	return LookStore.transact('readwrite', async (st) => {
		const T = (await LookStore.request(st.get('#parts'))) || {};
		T[ck] = Date.now();
		for (const k of Object.keys(T).sort((a, b) => T[b] - T[a]).slice(PARTS_LOOKS)) { delete T[k]; st.delete(IDBKeyRange.bound('part|' + k + '|', 'part|' + k + '|￿')); }
		st.put(T, '#parts');
	}).catch(() => {});
}

// ---------------------------------------------------------------- compressão (CompressionStream; sem ela, cru)
const canZip = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
const deflate = async (u8) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
const inflate = async (u8) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());

// ---------------------------------------------------------------- packed page → stored Blob
// A PNG of the 2-byte pixels (R = byte 0, G = byte 1, B = 0, opaque: no premultiplication, so the bytes survive exactly), decoded later
// off the main thread like the baked WebP pages (AtlasDecoder). Without OffscreenCanvas here (Safari < 16.4): the raw bytes.
const canPng = typeof OffscreenCanvas === 'function' && typeof OffscreenCanvas.prototype.convertToBlob === 'function';
async function pageBlob(p) {
	if (!canPng) return new Blob([p.data], { type: LookStore.RAW_TYPE });
	const n = p.w * p.h, rgba = new Uint8ClampedArray(n * 4);
	for (let i = 0, j = 0; i < n; i++, j += 4) { rgba[j] = p.data[i * 2]; rgba[j + 1] = p.data[i * 2 + 1]; rgba[j + 3] = 255; }
	const canvas = new OffscreenCanvas(p.w, p.h);
	canvas.getContext('2d').putImageData(new ImageData(rgba, p.w, p.h), 0, 0);
	return canvas.convertToBlob({ type: 'image/png' });
}

// Clipe desenhado → registro do aparelho: os quadros num buffer só (comprimido) + os retângulos.
async function clipRecord(c) {
	let n = 0;
	for (const row of c.frames) for (const f of row) n += f.data.length;
	const buf = new Uint8Array(n), fr = [];
	let o = 0;
	for (const row of c.frames) fr.push(row.map((f) => { buf.set(f.data, o); const r = [f.w, f.h, f.ox, f.oy, o]; o += f.data.length; return r; }));
	return { key: c.key, fps: c.fps, loop: c.loop, n: c.n, dirs: c.dirs, fr, z: canZip ? await deflate(buf) : null, raw: canZip ? null : buf };
}
async function clipFrom(r) {
	const buf = r.z ? await inflate(r.z) : r.raw;
	const frames = r.fr.map((row) => row.map(([w, h, ox, oy, o]) => ({ w, h, ox, oy, data: buf.subarray(o, o + w * h * 2) })));
	return { key: r.key, fps: r.fps, loop: r.loop, n: r.n, dirs: r.dirs, frames };
}

// ---------------------------------------------------------------- desenho, com pausa para ouvir 'cancel'
const drop = new Set(), STOP = {};
let tYield = 0;
const tick = () => new Promise((ok) => { const ch = new MessageChannel(); ch.port1.onmessage = () => ok(); ch.port2.postMessage(0); });
async function breathe(job) {
	if (performance.now() - tYield < 30) return;
	await tick();
	tYield = performance.now();
	if (drop.has(job)) throw STOP;
}
const partKey = (ck, part, key) => `part|${ck}|${part}|${key}`;

async function runClips(m) {
	await touchParts(m.ck);
	const opts = { hand: m.spec.hand || null, dirs: m.dirs || undefined };
	let lastFrac = 0;
	for (const key of m.keys) {
		const pk = partKey(m.ck, m.part, key);
		if (await LookStore.has(pk)) { self.postMessage({ job: m.job, clip: key, cached: true }); continue; }
		const R = G.rendererFor(m.spec, { k: m.k }), [name, w0] = key.split(':'), cd = G.clipDef(name, w0, null, opts);
		const total = cd.poses.length * (opts.dirs && opts.dirs < cd.dirs ? opts.dirs : cd.dirs), it = G.clipSteps(R, key, null, opts);
		let c, i = 0;
		for (let r = it.next(); ; r = it.next(), i++) {
			if (r.done) { c = r.value; break; }
			await breathe(m.job);
			const t = performance.now();
			if (t - lastFrac > 400) { lastFrac = t; self.postMessage({ job: m.job, frac: i / total }); }
		}
		await LookStore.put(pk, await clipRecord(c));
		self.postMessage({ job: m.job, clip: key });
	}
}
async function runPack(m) {
	const done = [], raw = !canPng;
	for (const S of m.sets) {
		const clips = [];
		for (const key of S.keys) {
			const r = await LookStore.get(partKey(m.ck, S.part, key));
			if (!r) throw new Error('clip ' + key + ' (' + S.part + ') is not on the device');
			clips.push(await clipFrom(r));
		}
		const a = G.packPages(clips), pages = [];
		clips.length = 0;
		for (const p of a.pages) {
			pages.push({ w: p.w, h: p.h, g: p.g, par: p.par, blob: await pageBlob(p) });
			p.data = null;
		}
		await LookStore.put(S.key, { k: m.k, v: G.SHADE === 'cel' ? 1 : 2, frame: G.frameFor(m.k), clips: a.clips, pages, gen: GEN_HASH, t: Date.now() });
		await LookStore.deletePrefix(`part|${m.ck}|${S.part}|`).catch(() => {});
		done.push(S.key);
	}
	await touch(done, raw, m.ck);
	return done;
}
function runPreview(m) {
	const k = m.k || G.OUT_K, R = G.rendererFor(m.spec, { k }), pose = G.CLIPS.idle.fn(m.spec.weaponLook || 'none')[0], ramps = G.rampsFor(m.spec), frames = [];
	const D = m.dirs || 8;
	for (let d = 0; d < D; d++) frames.push(G.colorize(R.render(pose, (-360 / D) * d, false), ramps));      // (sem a sombra no chão: o pedestal já é o chão)
	self.postMessage({ job: m.job, frames, W: G.frameFor(k), H: G.frameFor(k), k }, frames.map((f) => f.buffer));
}

let chain = Promise.resolve();
async function run(m) {
	if (drop.has(m.job)) { self.postMessage({ job: m.job, cancelled: true }); return; }
	try {
		if (m.type === 'preview') runPreview(m);
		else if (m.type === 'clips') { await runClips(m); self.postMessage({ job: m.job, done: true }); }
		else if (m.type === 'pack') self.postMessage({ job: m.job, packed: await runPack(m) });
	} catch (err) {
		if (err === STOP) self.postMessage({ job: m.job, cancelled: true });
		else self.postMessage({ job: m.job, error: String((err && err.stack) || err) });
	}
}
self.onmessage = (e) => {
	const m = e.data;
	if (m.type === 'cancel') { drop.add(m.job); return; }
	chain = chain.then(() => run(m));
};
