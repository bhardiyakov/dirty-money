// ============================================================================
// Graphics — the GRAPHICS QUALITY presets (Settings › Gráficos): Low, Medium, High and HD, or Automatic (the default), which picks one
// from what the device tells about itself. Applied once, on page load, right after config.js and before anything reads Config — a change
// in the settings is saved (dm_settings.graphics) and takes effect the next time the game opens.
//
//   level    resolution                     anti-aliasing    sun shadows   2.5D characters                    people / traffic   frame cap
//   low      75% of the window's pixels     off              off           8 directions, 160 MB, no AA        ½ / ½             30
//   medium   the screen's density (up to 1.5×) MSAA 4×        1024          8 directions, 256 MB, 4× SSAA      the light profile 30
//   high     the screen's density (up to 2×) MSAA 4×          2048          16 directions, 640 MB, 16× SSAA    full               30 (60 in the PC app)
//   hd       the screen's density (up to 3×) MSAA 8×          4096          16 directions, 1 GB, 16× SSAA      full               60
// (MSAA = the scene's geometry edges, render/Smooth.js — 8× only while the frame is ≤ 4 Mpx; SSAA = up to that many samples per pixel
// inside the characters' own shader, NpcArt: MSAA cannot smooth the inside of a sprite.)
//
// Automatic: a weak GPU (software renderers, old Mali / Adreno / PowerVR / Intel HD), very little memory or very few cores = low; a phone
// or tablet, ≤ 4 GB, ≤ 4 cores or integrated graphics (Intel UHD / Iris, AMD Radeon Graphics / Vega) = medium; anything else = high (HD is
// only ever chosen by hand). Each preset also has a pixel budget (maxPx: 1.5 / 2.4 / 4.2 Mpx, none at HD): past it — a 4K monitor — the
// picture is drawn smaller and scaled up (GameEngine._applyScale). The AutoQuality still steps the
// shadows down during play when the device cannot keep up. URL overrides for testing: `?gfx=low|medium|high|hd`; the old `?lite` =
// medium and `?full` = high.
// ============================================================================

const Graphics = {
	LEVELS: ['low', 'medium', 'high', 'hd'],
	CHOICES: ['auto', 'low', 'medium', 'high', 'hd'],
	LABEL: { auto: 'Automático', low: 'Low', medium: 'Medium', high: 'High', hd: 'HD' },
	PRESETS: {
		low: { renderScale: 0.75, smooth: false, shadows: false, shadowSize: 512, npcDirs: 8, npcAA: 1, npcHalf: true, vramMB: 160, uploadMB: 1, crowd: 0.5, colliderRadius: 160, fps: 30, chaseFar: 80, maxPx: 1.5e6 },
		medium: { renderScale: 1, dprCap: 1.5, smooth: true, msaa: 4, shadows: true, shadowSize: 1024, npcDirs: 8, npcAA: 2, vramMB: 256, uploadMB: 1, crowd: 0.7, colliderRadius: 190, fps: 30, chaseFar: 95, maxPx: 2.4e6 },
		high: { renderScale: 1, dprCap: 2, smooth: true, msaa: 4, shadows: true, shadowSize: 2048, npcDirs: 16, npcAA: 4, vramMB: 640, uploadMB: 3, crowd: 1, colliderRadius: 220, fps: 30, chaseFar: 110, hdCar: true, maxPx: 4.2e6 },
		hd: { renderScale: 1, dprCap: 3, smooth: true, msaa: 8, shadows: true, shadowSize: 4096, npcDirs: 16, npcAA: 4, vramMB: 1024, uploadMB: 4, crowd: 1, colliderRadius: 220, fps: 60, chaseFar: 125, hdCar: true },
	},
	// GPUs that cannot carry the high preset (WEBGL_debug_renderer_info): software rasterisers and old mobile/integrated chips.
	// ("Microsoft Basic Render Driver" / WARP: o Windows sem driver de vídeo ou com a aceleração do navegador desligada — desenha na CPU)
	WEAK_GPU: /swiftshader|llvmpipe|software|basic render|\bwarp\b|mali-[2-4]\d\d|mali-t|adreno \(tm\) [2-5]\d\d|powervr sgx|powervr rogue g[e6]|intel.*hd graphics [2-5]\d{2,3}\b|gma/i,
	// Integrated graphics that draw the game but not at the high preset (shared memory, a fraction of a card's fill rate): Intel HD / UHD /
	// Iris (the old HD 2000–5000 are WEAK above) and the AMD APUs (Radeon Graphics, Vega, R5/R7). Automatic starts them at medium; the
	// AutoQuality steps down from there if needed. (Intel Arc and Apple's chips are not in the list: they carry the high preset.)
	MID_GPU: /intel\(r\) (u?hd|iris)|iris\(r\)|iris (xe|plus|pro)|radeon\(tm\) (vega|graphics|r[3-7] graphics)|radeon (vega|graphics)\b|vega \d+ graphics/i,
	// Software rasterisers (the test browser, a PC with no driver): no quality step makes them playable, so the AutoQuality's GPU steps
	// stay out of the way there (and the automated tests keep one, predictable configuration).
	SOFT_GPU: /swiftshader|llvmpipe|software|basic render|\bwarp\b/i,
	choice: 'auto',
	level: 'high',

	// The saved choice (or the URL override), the level it resolves to, and the preset written into Config.
	init() {
		const q = typeof location !== 'undefined' ? location.search : '';
		this.choice = this._saved();
		const forced = /[?&]gfx=(low|medium|high|hd)\b/.exec(q);
		this.level = forced ? forced[1] : q.includes('lite') ? 'medium' : q.includes('full') ? 'high' : this.choice === 'auto' ? this.detect() : this.choice;
		// Desenho na CPU (SOFT_GPU) num navegador de gente (não o dos testes): o Low mesmo se outro foi escolhido à mão — High ali dá ~1 FPS.
		// O aviso (softwareNotice) explica como ligar a placa de vídeo. `?gfx=` ainda força.
		this.softCapped = !forced && this.level !== 'low' && this.realSoftware;
		if (this.softCapped) this.level = 'low';
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
		return `${I18n.t('graphics.auto')} (${this.LABEL[this._auto || (this._auto = this.detect())]})`;
	},

	// Automatic level from the device: the GPU first (a weak one decides alone), then touch, memory and cores.
	detect() {
		const nav = typeof navigator !== 'undefined' ? navigator : {}, mem = nav.deviceMemory || 8, cores = nav.hardwareConcurrency || 8;
		const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
		const gpu = this.gpu();
		if (this.WEAK_GPU.test(gpu.renderer) || gpu.maxTexture < 4096 || mem <= 2 || cores <= 2) return 'low';
		if (touch || !gpu.webgl2 || mem <= 4 || cores <= 4 || this.MID_GPU.test(gpu.renderer)) return 'medium';
		return 'high';
	},
	// Is the picture drawn by the CPU? (see SOFT_GPU)
	get software() { return this.SOFT_GPU.test(this.gpu().renderer); },
	// ...on a player's browser, not the automated tests' one (Playwright sets navigator.webdriver).
	get realSoftware() { return this.software && !(typeof navigator !== 'undefined' && navigator.webdriver); },

	// Aviso na tela quando o navegador desenha na CPU: o jogo não tem como ficar fluido assim (nenhum preset resolve) — o jogador precisa
	// ligar a aceleração de hardware / o driver de vídeo. Uma vez por sessão; "Não mostrar de novo" guarda em dm_softGpuHide (fora de
	// dm_settings: o menu de pausa regrava aquele objeto inteiro).
	softwareNotice() {
		if (!this.realSoftware || typeof document === 'undefined') return;
		if (Store.get('softGpuHide')) return;
		const t = (k, v) => (typeof I18n !== 'undefined' ? I18n.t(k, v) : k), esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
		const el = document.createElement('div');
		el.id = 'soft-gpu-notice';
		el.setAttribute('role', 'alert');
		el.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:100000;max-width:min(560px,calc(100vw - 32px));box-sizing:border-box;'
			+ 'background:#1d1a17;color:#f3ece2;border:1px solid #e0a43a;border-radius:10px;padding:14px 16px;font:14px/1.45 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5)';
		const steps = ['gpu.soft.step1', 'gpu.soft.step2', 'gpu.soft.step3', 'gpu.soft.step4'].map((k) => `<li>${esc(t(k))}</li>`).join('');
		el.innerHTML = `<b style="color:#e0a43a">${esc(t('gpu.soft.title'))}</b><div style="margin:6px 0">${esc(t('gpu.soft.body', { gpu: this.gpu().renderer }))}</div>`
			+ `<ol style="margin:6px 0 10px 18px;padding:0">${steps}</ol>`
			+ `<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button data-k="hide">${esc(t('gpu.soft.hide'))}</button><button data-k="ok">${esc(t('gpu.soft.ok'))}</button></div>`;
		for (const b of el.querySelectorAll('button')) {
			b.style.cssText = 'font:inherit;padding:6px 12px;border-radius:6px;cursor:pointer;border:1px solid #e0a43a;' + (b.dataset.k === 'ok' ? 'background:#e0a43a;color:#1d1a17' : 'background:transparent;color:#f3ece2');
			b.addEventListener('click', (e) => {
				e.stopPropagation();
				if (b.dataset.k === 'hide') Store.set('softGpuHide', '1');
				el.remove();
			});
		}
		document.body.appendChild(el);
		console.warn(`[GRÁFICOS] desenho por software (${this.gpu().renderer})${this.softCapped ? ' — limitado ao Low' : ''}`);
	},
	// What a throwaway WebGL context tells about the GPU (renderer name, WebGL 2, largest texture).
	gpu() {
		if (this._gpu) return this._gpu;                                // (asked once: the answer does not change)
		const out = this._gpu = { renderer: '', webgl2: false, maxTexture: 8192 };
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
		P.renderScale = p.renderScale; P.dprCap = p.dprCap || 1; P.maxPixels = p.maxPx || 0; P.autoScale = 1; P.shadows = p.shadows; P.shadowSize = p.shadowSize; P.colliderRadius = p.colliderRadius;
		const fps60 = desktopApp || (typeof location !== 'undefined' && location.search.includes('fps60'));      // (PC app, or `?fps60` to test)
		P.fpsCap = p.fps > 30 || (fps60 && this.level === 'high') ? 60 : 30;
		P.lite = this.level === 'low' || this.level === 'medium';
		A.smooth = p.smooth; A.msaa = p.msaa || 0; A.npcDirs = p.npcDirs; A.npcAA = p.npcAA || 1; A.vramMB = p.vramMB; A.uploadMB = p.uploadMB; A.npcHalf = !!p.npcHalf;
		this._crowd(p.crowd);
		// câmera de perseguição: até onde se vê dirigindo (a névoa de distância começa na metade) — o horizonte custa desenhos e triângulos
		A.hdCar = !!p.hdCar;                                       // (o carro dirigido em alta definição: ~50 mil triângulos — Game._hdDrive)
		if (p.chaseFar && Config.camera.chase) { Config.camera.chase.far = p.chaseFar; Config.camera.chase.near = Math.round(p.chaseFar * 0.45); }
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
