// ============================================================================
// Graphics — the GRAPHICS QUALITY presets (Settings › Gráficos): Low, Medium, High and HD, or Automatic (the default), which picks one
// from what the device tells about itself. Applied once, on page load, right after config.js and before anything reads Config — a change
// in the settings is saved (dm_settings.graphics) and takes effect the next time the game opens.
//
//   level    resolution                     anti-aliasing   sun shadows   2.5D characters      people / traffic   frame cap
//   low      75% of the window's pixels     off             off           8 directions, 160 MB  ½ / ½             30
//   medium   the screen's density (up to 1.5×) on            1024          8 directions, 256 MB  the light profile 30
//   high     the screen's density (up to 2×) on             2048          16 directions, 640 MB full               30 (60 in the PC app)
//   hd       the screen's density (up to 3×) on             4096          16 directions, 1 GB   full               60
//
// Automatic: a weak GPU (software renderers, old Mali / Adreno / PowerVR / Intel HD), very little memory or very few cores = low; a phone
// or tablet, ≤ 4 GB or ≤ 4 cores = medium; anything else = high (HD is only ever chosen by hand). The AutoQuality still steps the
// shadows down during play when the device cannot keep up. URL overrides for testing: `?gfx=low|medium|high|hd`; the old `?lite` =
// medium and `?full` = high.
// ============================================================================

const Graphics = {
	LEVELS: ['low', 'medium', 'high', 'hd'],
	CHOICES: ['auto', 'low', 'medium', 'high', 'hd'],
	LABEL: { auto: 'Automático', low: 'Low', medium: 'Medium', high: 'High', hd: 'HD' },
	PRESETS: {
		low: { renderScale: 0.75, smooth: false, shadows: false, shadowSize: 512, npcDirs: 8, vramMB: 160, uploadMB: 1, crowd: 0.5, colliderRadius: 160, fps: 30 },
		medium: { renderScale: 1, dprCap: 1.5, smooth: true, shadows: true, shadowSize: 1024, npcDirs: 8, vramMB: 256, uploadMB: 1, crowd: 0.7, colliderRadius: 190, fps: 30 },
		high: { renderScale: 1, dprCap: 2, smooth: true, shadows: true, shadowSize: 2048, npcDirs: 16, vramMB: 640, uploadMB: 3, crowd: 1, colliderRadius: 220, fps: 30 },
		hd: { renderScale: 1, dprCap: 3, smooth: true, shadows: true, shadowSize: 4096, npcDirs: 16, vramMB: 1024, uploadMB: 4, crowd: 1, colliderRadius: 220, fps: 60 },
	},
	// GPUs that cannot carry the high preset (WEBGL_debug_renderer_info): software rasterisers and old mobile/integrated chips.
	WEAK_GPU: /swiftshader|llvmpipe|software|mali-[2-4]\d\d|mali-t|adreno \(tm\) [2-5]\d\d|powervr sgx|powervr rogue g[e6]|intel.*hd graphics [2-5]\d{2,3}\b|gma/i,
	choice: 'auto',
	level: 'high',

	// The saved choice (or the URL override), the level it resolves to, and the preset written into Config.
	init() {
		const q = typeof location !== 'undefined' ? location.search : '';
		this.choice = this._saved();
		const forced = /[?&]gfx=(low|medium|high|hd)\b/.exec(q);
		this.level = forced ? forced[1] : q.includes('lite') ? 'medium' : q.includes('full') ? 'high' : this.choice === 'auto' ? this.detect() : this.choice;
		this.apply(this.PRESETS[this.level]);
		console.log(`[GRÁFICOS] ${this.LABEL[this.level]}${this.choice === 'auto' && !forced ? ' (automático)' : ''}`);
	},
	_saved() {
		const g = (Store.getJSON('settings', null) || {}).graphics;
		return this.CHOICES.includes(g) ? g : 'auto';
	},
	// The choice after `choice` in the settings button's cycle, and how the button names a choice (Automatic shows what it picks here).
	next(choice) { return this.CHOICES[(this.CHOICES.indexOf(choice) + 1) % this.CHOICES.length]; },
	label(choice) {
		const c = this.CHOICES.includes(choice) ? choice : 'auto';
		if (c !== 'auto') return this.LABEL[c];
		return `${this.LABEL.auto} (${this.LABEL[this._auto || (this._auto = this.detect())]})`;
	},

	// Automatic level from the device: the GPU first (a weak one decides alone), then touch, memory and cores.
	detect() {
		const nav = typeof navigator !== 'undefined' ? navigator : {}, mem = nav.deviceMemory || 8, cores = nav.hardwareConcurrency || 8;
		const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
		const gpu = this.gpu();
		if (this.WEAK_GPU.test(gpu.renderer) || gpu.maxTexture < 4096 || mem <= 2 || cores <= 2) return 'low';
		if (touch || !gpu.webgl2 || mem <= 4 || cores <= 4) return 'medium';
		return 'high';
	},
	// What a throwaway WebGL context tells about the GPU (renderer name, WebGL 2, largest texture).
	gpu() {
		const out = { renderer: '', webgl2: false, maxTexture: 8192 };
		try {
			const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
			if (!gl) return Object.assign(out, { maxTexture: 0 });
			out.webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
			out.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
			const dbg = gl.getExtension('WEBGL_debug_renderer_info');
			out.renderer = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
			const lose = gl.getExtension('WEBGL_lose_context');
			if (lose) lose.loseContext();
		} catch (e) { /* keep the defaults */ }
		return out;
	},

	// Writes a preset into Config (before the game reads it).
	apply(p) {
		const P = Config.perf, A = Config.art, desktopApp = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
		P.renderScale = p.renderScale; P.dprCap = p.dprCap || 1; P.shadows = p.shadows; P.shadowSize = p.shadowSize; P.colliderRadius = p.colliderRadius;
		const fps60 = desktopApp || (typeof location !== 'undefined' && location.search.includes('fps60'));      // (PC app, or `?fps60` to test)
		P.fpsCap = p.fps > 30 || (fps60 && this.level === 'high') ? 60 : 30;
		P.lite = this.level === 'low' || this.level === 'medium';
		A.smooth = p.smooth; A.npcDirs = p.npcDirs; A.vramMB = p.vramMB; A.uploadMB = p.uploadMB;
		this._crowd(p.crowd);
		if (P.lite && typeof document !== 'undefined') document.documentElement.classList.add('no-blur');      // (no frosted-glass panels: ver Theme)
	},
	// People and traffic in the living world: the light profile at medium, half of it at low.
	_crowd(k) {
		if (k >= 1) return;
		const T = Config.traffic, cut = (n) => Math.max(1, Math.round(n * k));
		Config.npc.count = cut(Config.npc.count);
		for (const key of ['count', 'parked', 'motos', 'motosParked', 'bicycles', 'bicyclesParked', 'couriers']) T[key] = cut(T[key]);
		T.spawnMax = Math.round(T.spawnMax * (0.5 + k / 2)); T.recycleDist = Math.round(T.recycleDist * (0.85 + k * 0.15));
		Config.npc.recycleDist = 200;
	},
};

Graphics.init();          // (before the rest of the game reads Config)
