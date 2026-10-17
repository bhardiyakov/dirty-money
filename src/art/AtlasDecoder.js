// ============================================================================
// AtlasDecoder — decodes the ready-made 2.5D atlas pages (assets/baked/npcs, tools/asset_baker/bake.cjs; or a wardrobe look stored as
// PNG Blobs in IndexedDB) OFF the main thread: Worker (from a Blob URL — decoding only, none of the generator) → fetch or Blob →
// createImageBitmap (the browser's native decoder) → OffscreenCanvas → RGBA pixels → the 2 bytes per pixel of the atlas (R = byte 0,
// G = byte 1). With a damage layer (ov) both are merged right there: layer pixel ≠ (0, 0) = the damaged pixel. Returns { w, h, data }
// (interleaved RG, w × h × 2), already transferred.
//   • png(): the legacy character atlas (CharArt) — a base64 PNG decoded by the game's own PNG reader (SpriteIO's PNG._parse and
//     _unfilter, sent to the Worker as text): bit-exact RGBA, no colour management or premultiplied alpha.
//   • No colour management or premultiplied alpha (colorSpaceConversion/premultiplyAlpha 'none'; the pages are opaque RGB without a
//     profile): the bytes come out exactly as they were written.
//   • Without OffscreenCanvas/createImageBitmap in a Worker (Safari < 16.4), or when a Worker job fails: the same kernel runs on the
//     main thread for that job. A Worker that crashes is replaced; only after MAX_STRIKES failures in a row that the main thread then
//     decoded are the Workers given up for the session.
// ============================================================================

const AtlasDecoder = {
	WORKERS: 2,
	MAX_STRIKES: 3,
	_workers: null, _jobs: new Map(), _seq: 0, _off: false, _strikes: 0, _mainKernel: null,

	// src / ov: page and damage layer — a URL (relative to the page) or a Blob; ov may be null.
	rg(src, ov = null) {
		return this._run({ kind: 'rg', src: this._abs(src), ov: this._abs(ov) });
	},
	// RGBA pixels of a PNG (base64 text or bytes): { w, h, data }.
	png(data) {
		return this._run({ kind: 'png', data });
	},

	_abs(src) { return typeof src === 'string' ? new URL(src, location.href).href : src || null; },
	_run(task) {
		const pool = this._off ? null : this._pool();
		if (!pool) return this._runMain(task);
		return new Promise((resolve, reject) => {
			const job = ++this._seq, worker = pool.reduce((a, b) => (b._load < a._load ? b : a));
			worker._load++;
			this._jobs.set(job, { resolve, reject, task, worker });
			worker.postMessage(Object.assign({ job }, task));
		});
	},
	_runMain(task) {
		const K = this._mainKernel || (this._mainKernel = this._kernel(typeof PNG !== 'undefined' ? PNG : null));
		return task.kind === 'png' ? K.png(task.data) : K.rg(task.src, task.ov);
	},

	_pool() {
		if (this._workers) return this._workers.length ? this._workers : null;
		this._workers = [];
		if (typeof Worker !== 'function' || typeof Blob !== 'function' || typeof OffscreenCanvas !== 'function' || typeof createImageBitmap !== 'function') return null;
		try {
			const png = typeof PNG !== 'undefined' ? `const PNG = { ${PNG._parse}, ${PNG._unfilter} };` : 'const PNG = null;';
			this._url = URL.createObjectURL(new Blob([`${png}\n(${this._serve})((${this._kernel})(PNG));`], { type: 'text/javascript' }));
			for (let i = 0; i < this.WORKERS; i++) this._workers.push(this._spawn());
		} catch (e) { this._workers = []; return null; }
		return this._workers;
	},
	_spawn() {
		const worker = new Worker(this._url);
		worker._load = 0;
		worker.onmessage = (e) => this._done(worker, e.data);
		worker.onerror = (e) => { e.preventDefault(); this._crashed(worker, e.message || 'Worker error'); };
		return worker;
	},
	// A Worker died: it is replaced, and its pending jobs go through the failure path (decoded on the main thread).
	_crashed(worker, message) {
		const i = this._workers.indexOf(worker);
		if (i < 0) return;
		worker.terminate();
		this._workers[i] = this._spawn();
		for (const [job, J] of this._jobs) if (J.worker === worker) this._done(worker, { job, error: message });
	},
	_done(worker, m) {
		const J = this._jobs.get(m.job);
		if (!J) return;
		this._jobs.delete(m.job); worker._load--;
		if (!m.error) { this._strikes = 0; J.resolve({ w: m.w, h: m.h, data: m.data }); return; }
		if (m.http) { J.reject(new Error(m.error)); return; }              // (missing file: retrying here would not help)
		this._runMain(J.task).then((img) => { this._strike(m.error); J.resolve(img); }, J.reject);
	},
	// The Worker failed where the main thread succeeded: tolerated a few times in a row, then the Workers are given up.
	_strike(error) {
		if (++this._strikes < this.MAX_STRIKES || this._off) return;
		this._off = true;
		console.warn(`[ATLAS] decoding Worker failed ${this._strikes}× in a row (${error}) — decoding on the main thread from now on`);
	},

	// Worker glue (sent as text): one job per message, the result transferred back.
	_serve: function (kernel) {
		self.onmessage = async (e) => {
			const { job, kind, src, ov, data } = e.data;
			try {
				const r = kind === 'png' ? await kernel.png(data) : await kernel.rg(src, ov);
				self.postMessage({ job, w: r.w, h: r.h, data: r.data }, [r.data.buffer]);
			} catch (err) { self.postMessage({ job, error: String((err && err.message) || err), http: !!(err && err.http) }); }
		};
	},

	// Decoding kernel: the same code runs inside the Workers (sent as text: it sees nothing of the page) and, as the fallback, on the
	// main thread. PNG = SpriteIO's reader (inside a Worker only _parse and _unfilter; null where it was not loaded).
	_kernel: function (PNG) {
		let canvas = null, ctx = null;
		const canvasOf = (w, h) => {
			if (typeof OffscreenCanvas !== 'function') return Object.assign(document.createElement('canvas'), { width: w, height: h }).getContext('2d', { willReadFrequently: true });
			if (!canvas || canvas.width < w || canvas.height < h) {
				canvas = new OffscreenCanvas(Math.max(w, canvas ? canvas.width : 0), Math.max(h, canvas ? canvas.height : 0));
				ctx = canvas.getContext('2d', { willReadFrequently: true });
			}
			ctx.clearRect(0, 0, w, h);
			return ctx;
		};
		const blobOf = async (src) => {
			if (typeof src !== 'string') return src;
			const r = await fetch(src);
			if (!r.ok) { const e = new Error(src + ': HTTP ' + r.status); e.http = true; throw e; }
			return r.blob();
		};
		const pixels = async (src) => {
			const blob = await blobOf(src);
			let image, w, h;
			if (typeof createImageBitmap === 'function') { image = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); w = image.width; h = image.height; }
			else { image = new Image(); image.src = URL.createObjectURL(blob); await image.decode(); w = image.naturalWidth; h = image.naturalHeight; URL.revokeObjectURL(image.src); }
			const c = canvasOf(w, h);
			c.drawImage(image, 0, 0);
			if (image.close) image.close();
			return { w, h, px: c.getImageData(0, 0, w, h).data };
		};
		const bytesOf = (data) => {
			if (typeof data !== 'string') return data;
			const s = atob(data), u = new Uint8Array(s.length);
			for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
			return u;
		};
		const inflate = async (z) => new Uint8Array(await new Response(new Blob([z]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
		return {
			async rg(src, ov) {
				const a = await pixels(src), n = a.w * a.h, out = new Uint8Array(n * 2);
				let px = a.px;
				for (let i = 0, j = 0; i < n; i++, j += 4) { out[i * 2] = px[j]; out[i * 2 + 1] = px[j + 1]; }
				if (ov) {
					const b = await pixels(ov);
					if (b.w !== a.w || b.h !== a.h) throw new Error(`damage layer ${b.w}×${b.h}, page ${a.w}×${a.h}`);
					px = b.px;
					for (let i = 0, j = 0; i < n; i++, j += 4) { const r = px[j], g = px[j + 1]; if (r | g) { out[i * 2] = r; out[i * 2 + 1] = g; } }
				}
				return { w: a.w, h: a.h, data: out };
			},
			async png(data) {
				if (!PNG) throw new Error('no PNG reader');
				const bytes = bytesOf(data);
				let img;
				if (typeof DecompressionStream === 'function') { const info = PNG._parse(bytes); img = PNG._unfilter(info, await inflate(info.z)); }
				else if (PNG.decode) img = PNG.decode(bytes);                   // (main thread of an old browser: SpriteIO's JS inflate)
				else throw new Error('no DecompressionStream');
				return { w: img.w, h: img.h, data: img.data };
			},
		};
	},
};
