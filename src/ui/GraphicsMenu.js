// ============================================================================
// GraphicsMenu — AJUSTES › GRÁFICOS AVANÇADOS: o que a pessoa pode trocar, item por item, para o jogo rodar melhor na máquina dela.
//
// Cada linha mostra o valor de agora ("Automático (…)" = o do nível gráfico) e se a troca vale NA HORA ou AO REABRIR o jogo (o que
// é montado na carga: o mapa de sombras, os shaders das fachadas). Os valores ficam em settings.gfx { chave: valor } — sem a chave
// (ou 'auto'), vale o do nível. Na abertura, Graphics._custom aplica tudo por cima do nível; aqui, os que valem na hora também são
// aplicados na hora. Os mais pesados primeiro: resolução, distância, sombras, antisserrilhado, brilho.
//   Teclado: ↑ ↓ escolhe · ← → troca · Enter/clique avança · Esc/Backspace volta. Controle: o mesmo (B volta). Toque: ◀ ▶ e a linha.
//   GraphicsMenu.render(el, menu) · key(k, menu) → true se tratou · set(key, value, game) (testes) · reset(game)
// ============================================================================

const GraphicsMenu = {
	row: 0,

	// As linhas: k = chave em settings.gfx (ou em settings, com own), C = os valores, name(v) = o texto, base() = o do nível, live =
	// vale na hora (função: decide pelo valor), apply(v, g) = aplica na hora (v já resolvido: o do nível quando 'auto').
	get OPTS() {
		const B = () => (typeof Graphics !== 'undefined' && Graphics.base) || {}, pct = (v) => Math.round(v * 100) + '%', onoff = (v) => (v ? 'Ligado' : 'Desligado');
		return [
			{ k: 'level', own: 'graphics', icon: '🖥️', label: 'Nível gráfico', hint: 'o ponto de partida de tudo abaixo (Low, Medium, High, HD)', C: () => Graphics.CHOICES, name: (v) => Graphics.label(v), live: false },
			{ k: 'scale', icon: '🔍', label: 'Resolução', hint: 'quantos pixels são desenhados — o que mais pesa na placa de vídeo; menor = mais leve e menos nítido',
				C: () => ['auto', 0.5, 0.6, 0.7, 0.85, 1], name: pct, base: () => B().renderScale, live: true,
				apply: (v, g) => { Config.perf.renderScale = v; const ge = g.gameEngine; ge.resize(); if (g.camera) { g.camera.fitPixelScale(ge.viewHeight); g.camera.onResize(); } } },
			{ k: 'dist', icon: '🔭', label: 'Distância de visão', hint: 'até onde a cidade aparece antes da névoa — menos = menos prédios, carros e árvores por quadro',
				C: () => ['auto', 55, 70, 85, 100, 125], name: (v) => v + ' m', base: () => B().chaseFar, live: true,
				apply: (v) => { const H = Config.camera.chase; if (H) { H.far = v; H.near = Math.round(v * 0.45); } } },
			{ k: 'shadows', icon: '🌗', label: 'Sombras do sol', hint: 'a sombra em tempo real de carros, pessoas e árvores (a dos prédios já vem pintada)',
				C: () => ['auto', 'off', 'low', 'high'], name: (v) => ({ off: 'Desligadas', low: 'Baixas', high: 'Altas' })[v] || v,
				base: () => (B().shadows ? (B().shadowSize >= 2048 ? 'high' : 'low') : 'off'),
				// (desligar vale na hora; ligar ou mudar o tamanho precisa do mapa de sombras montado na carga)
				live: (v, g) => v === 'off' || (!!g.gameEngine.shadowGenerator && GraphicsMenu._shadowSize(g) === v),
				apply: (v, g) => { const sg = g.gameEngine.shadowGenerator, dn = g.dayNight; if (v === 'off') { if (dn) dn.forceNoShadows = true; if (sg) sg.getShadowMap().refreshRate = 0; } else if (sg && dn) { dn.forceNoShadows = false; dn._shadowRate = null; } } },
			{ k: 'aa', icon: '🪚', label: 'Antisserrilhado', hint: 'suaviza as bordas serrilhadas (MSAA) — 4× e 8× pesam na placa de vídeo',
				C: () => ['auto', 0, 2, 4, 8], name: (v) => (v ? v + '×' : 'Desligado'), base: () => B().msaa || 0, live: true,
				apply: (v, g) => GraphicsMenu._aa(v, g) },
			{ k: 'bloom', icon: '✨', label: 'Brilho das luzes', hint: 'o halo de faróis, postes e do sol (3 passadas a mais na tela)',
				C: () => ['auto', true, false], name: onoff, base: () => B().bloom, live: true,
				apply: (v) => { Config.perf.bloom = v; if (typeof Lighting !== 'undefined' && Lighting.setBloom) Lighting.setBloom(v); } },
			{ k: 'water', icon: '🌊', label: 'Reflexo na água', hint: 'prédios e árvores espelhados no mar e na lagoa (redesenha o que está perto da água)',
				C: () => ['auto', true, false], name: onoff, base: () => B().waterMirror,
				live: (v) => !v || (typeof Water !== 'undefined' && !!Water.mirror),
				apply: (v) => { if (typeof Water !== 'undefined') { Water.off = !v; if (v) Water._chk = 0; } } },
			{ k: 'pom', icon: '🧱', label: 'Relevo das fachadas', hint: 'tijolos e reboco em profundidade nas paredes (~15 leituras de textura por pixel)',
				C: () => ['auto', true, false], name: onoff, base: () => B().pom, live: false },
			{ k: 'cover', icon: '🌿', label: 'Vegetação rasteira', hint: 'capim, samambaias, cascalho e entulho no chão (muitos desenhos pequenos)',
				C: () => ['auto', true, false], name: onoff, base: () => B().cover, live: true,
				apply: (v) => { Config.perf.cover = v; if (typeof Trees3D !== 'undefined' && Trees3D.setCover) Trees3D.setCover(v); } },
			{ k: 'veg', icon: '🌳', label: 'Densidade da mata', hint: 'quantas árvores no mato e nos morros — vale para o terreno que carregar daqui em diante (todo ele ao reabrir)',
				C: () => ['auto', 0.4, 0.6, 0.8, 1], name: pct, base: () => B().vegDensity, live: true,
				apply: (v) => { Config.perf.vegDensity = v; } },
			{ k: 'detail', icon: '🪴', label: 'Distância dos detalhes', hint: 'até onde aparecem os objetos miúdos (lixo, vasos, peças de fachada) antes do fim da névoa',
				C: () => ['auto', 0.6, 0.75, 0.9, 0], name: (v) => (v ? pct(v) + ' da névoa' : 'Até o fim'), base: () => B().fineCull || 0, live: true,
				apply: (v) => { Config.perf.fineCull = v; if (typeof AirLod !== 'undefined') { AirLod._evalT = 0; if (AirLod._lastEye) AirLod._lastEye.set(1e9, 0, 0); } } },
			{ k: 'npc', icon: '🧍', label: 'Detalhe das pessoas', hint: 'a distância em que cada pessoa passa ao modelo mais leve',
				C: () => ['auto', 2.2, 1.7, 1.25, 1, 0.85], name: (v) => ({ 2.2: 'Mínimo', 1.7: 'Baixo', 1.25: 'Médio', 1: 'Alto', 0.85: 'Máximo' })[v] || v, base: () => B().lodBias || 1, live: true,
				apply: (v) => { Config.perf.lodBias = v; if (typeof Char3D !== 'undefined' && !Char3D.safe) Char3D.lodBias = v; } },
			{ k: 'clouds', icon: '☁️', label: 'Nuvens no voo', hint: 'as nuvens que se atravessam de avião e helicóptero', C: () => ['auto', true, false], name: onoff, base: () => true, live: true,
				apply: (v) => { Config.perf.clouds = v; } },
			{ k: 'life', own: 'life', icon: '🏙️', label: 'Vida da cidade', hint: 'pedestres extras no rush, acontecimentos de rua e movimento das lojas (pesa no processador)', C: () => Life.LEVELS, name: (v) => Life.label(v), live: true },
			{ k: 'fps', own: 'fps', icon: '🎞️', label: 'Taxa de quadros', hint: '30 = estável e mais frio · 60 = mais fluido, esquenta mais', C: () => Graphics.FPS_CHOICES, name: (v) => (v === 30 ? '30 FPS' : v === 60 ? '60 FPS' : `Automático (${Config.perf.fpsCap})`), live: true },
			{ k: 'showFps', icon: '📈', label: 'Mostrar FPS na tela', hint: 'o contador no canto: quadros por segundo e o tempo de cada quadro', C: () => [false, true], name: onoff, live: true,
				apply: (v) => FpsMeter.setEnabled(v) },
			{ k: 'autoQ', icon: '🤖', label: 'Qualidade automática', hint: 'baixa sombras, resolução e efeitos sozinha quando a máquina não dá conta', C: () => [true, false], name: onoff, live: true,
				apply: (v, g) => { if (g.autoQuality) g.autoQuality.off = !v; } },
		];
	},

	// O valor guardado (ou 'auto'/padrão) de uma linha.
	value(o, s) {
		if (o.own) return o.own === 'graphics' ? s.graphics || 'auto' : o.own === 'life' ? s.life || 'auto' : s.fps || 'auto';
		const v = (s.gfx || {})[o.k];
		if (o.k === 'showFps') return !!v;
		if (o.k === 'autoQ') return v !== false;
		return v === undefined || v === null ? 'auto' : v;
	},
	// O valor que vale de fato (o do nível no 'auto').
	resolved(o, v) { return v === 'auto' && o.base ? o.base() : v; },
	// O que valia na abertura (Graphics._custom): o que só vale ao reabrir fica "pendente" enquanto for diferente disto.
	_boot(k) { const c = (typeof Graphics !== 'undefined' && Graphics.bootCustom) || {}; return c[k] === undefined || c[k] === null ? 'auto' : c[k]; },
	// Na abertura: o contador de FPS e a qualidade automática como ficaram guardados.
	boot(g, s) {
		const G = (s && s.gfx) || {};
		FpsMeter.setEnabled(!!G.showFps);
		if (G.autoQ === false && g && g.autoQuality) g.autoQuality.off = true;
	},
	_shadowSize(g) { const sg = g.gameEngine.shadowGenerator; return sg ? (sg.getShadowMap().getSize().width >= 2048 ? 'high' : 'low') : 'off'; },
	_aa(n, g) {
		const A = Config.art, cam = g.camera && g.camera.camera, eng = g.gameEngine.engine;
		A.aaOff = !n;
		if (n > 0) A.msaa = n;
		if (!n && Graphics.base && Graphics.base.smooth === false && A.smooth !== false) { A.smooth = false; Smooth.apply(g); return; }      // (de volta ao Low: o visual de sempre dele)
		if (n > 0 && A.smooth === false) { A.smooth = true; Smooth.apply(g); return; }      // (Low: liga o visual suave junto)
		if (!Smooth.on || !cam) return;
		if (!n) Smooth._antialias(cam, eng, false);
		else if (!Smooth.pp) Smooth._antialias(cam, eng, true);
		else if ('samples' in Smooth.pp) Smooth.pp.samples = Smooth.samples(eng);
	},

	// ------------------------------------------------------------------ trocar
	// d: −1 / +1 = anterior / próximo (sem dar a volta) · 0 = o próximo, dando a volta (Enter, clique).
	adjust(i, d, menu) {
		const g = menu.g, s = menu.settings;
		if (i === 0) { menu._gfxView = false; return 'back'; }
		const L = this.OPTS, n = L.length + 1;
		if (i === n) { this.reset(g, menu); return; }
		const o = L[i - 1], C = o.C(), cur = this.value(o, s);
		let j = C.indexOf(cur); if (j < 0) j = 0;
		if (cur === 'auto' && d !== 0 && o.base) {
			// (no Automático as setas partem do valor do nível: ← um degrau abaixo dele, → um acima — sem voltar ao Automático)
			const r = o.base();
			let b = C.indexOf(r);
			if (b < 0 && typeof r === 'number') { let best = Infinity; C.forEach((x, q) => { if (typeof x === 'number' && Math.abs(x - r) < best) { best = Math.abs(x - r); b = q; } }); }
			j = Math.max(1, Math.min(C.length - 1, (b < 1 ? 1 : b) + d));
		} else j = d < 0 ? Math.max(C[0] === 'auto' ? 1 : 0, j - 1) : d > 0 ? Math.min(C.length - 1, j + 1) : (j + 1) % C.length;
		this.set(o.k, C[j], g, menu);
	},
	// Guarda e, se vale na hora, aplica. (Também é a porta dos testes: GraphicsMenu.set('scale', 0.6, game).)
	set(k, v, g, menu = g.menu) {
		const s = menu.settings, o = this.OPTS.find((q) => q.k === k);
		if (!o) return;
		if (o.own === 'graphics') { s.graphics = v; Store.remove('autoQuality'); }      // (escolha à mão: o degrau guardado do AutoQuality recomeça do alto)
		else if (o.own === 'life') s.life = v;
		else if (o.own === 'fps') {
			s.fps = v;
			const want = v === 30 ? 30 : v === 60 ? 60 : (Graphics.PRESETS[Graphics.level].fps > 30 ? 60 : 30), q = g.autoQuality;
			Config.perf.fpsCap = want; if (q) q.slow = 1000 / want * AutoQuality.SLOW_K;
		} else {
			const G = s.gfx || (s.gfx = {});
			if (v === 'auto') delete G[k]; else G[k] = v;
			if (k === 'showFps' && !v) delete G[k];
			if (k === 'autoQ' && v) delete G[k];
		}
		const r = this.resolved(o, v), live = typeof o.live === 'function' ? o.live(r, g) : o.live;
		if (live && o.apply) { try { o.apply(r, g); } catch (e) { console.warn('[GRÁFICOS] ajuste', k, e); } }
		menu._saveSettings();
		if (o.own === 'graphics' || o.own === 'life') menu.applySettings();
		if (g._flash) g._flash(`${o.icon} ${o.label}: ${o.name(v === 'auto' ? r : v)}${v === 'auto' ? ' (do nível)' : ''}${live ? '' : ' — vale ao reabrir o jogo'}`);
	},
	// Tudo de volta ao nível (os que valem na hora voltam já).
	reset(g, menu = g.menu) {
		const s = menu.settings;
		s.gfx = {};
		for (const o of this.OPTS) {
			if (o.own || !o.apply) continue;
			const r = this.resolved(o, this.value(o, s)), live = typeof o.live === 'function' ? o.live(r, g) : o.live;
			if (live) { try { o.apply(r, g); } catch (e) { /* segue */ } }
		}
		menu._saveSettings();
		if (g._flash) g._flash('🎛️ Gráficos de volta ao padrão do nível');
	},

	// ------------------------------------------------------------------ desenho
	render(el, menu) {
		const s = menu.settings, g = menu.g, L = this.OPTS, n = L.length + 2;
		this.row = Math.max(0, Math.min(n - 1, this.row));
		const sub = (t) => `<small style="display:block;font-weight:500;color:var(--tx-3);font-size:12px">${t}</small>`;
		const tag = (live) => `<span style="font:600 10px var(--font);letter-spacing:.06em;text-transform:uppercase;padding:2px 6px;border-radius:6px;${live ? 'color:#7ee08a;border:1px solid #7ee08a55' : 'color:#f2c230;border:1px solid #f2c23055'}">${live ? 'na hora' : 'ao reabrir'}</span>`;
		const btn = (dir, ch) => `<div class="pm-toggle is-on" data-d="${dir}" style="min-width:28px;text-align:center;padding-left:8px;padding-right:8px">${ch}</div>`;
		let pending = false;
		let h = `<div class="pm-row ${this.row === 0 ? 'on' : ''}" data-i="0"><span>⬅️ Voltar ${sub(`nível ${Graphics.LABEL[Graphics.level]}${Graphics.phoneOn ? ' · celular' : ''} · ${Math.round(1000 / Math.max(1, Perf.interval || 33))} FPS agora · quadro ${Perf.frameAvg.toFixed(1)} ms`)}</span><span></span></div>`;
		L.forEach((o, k) => {
			const i = k + 1, v = this.value(o, s), r = this.resolved(o, v), live = typeof o.live === 'function' ? o.live(r, g) : o.live;
			const shown = v === 'auto' && o.base ? `Automático (${o.name(r)})` : o.name(v);
			const changed = o.own === 'graphics' ? (s.graphics || 'auto') !== Graphics.choice : !o.own && !live && v !== this._boot(o.k);
			if (changed) pending = true;
			h += `<div class="pm-row ${i === this.row ? 'on' : ''}" data-i="${i}"><span>${o.icon} ${o.label} ${sub(o.hint)}</span><span style="display:flex;gap:8px;align-items:center">${tag(live)}${btn(-1, '◀')}<div class="pm-toggle is-on" style="min-width:118px;text-align:center">${shown}</div>${btn(1, '▶')}</span></div>`;
		});
		h += `<div class="pm-row ${this.row === n - 1 ? 'on' : ''}" data-i="${n - 1}"><span>↩️ Restaurar o padrão do nível ${sub('volta tudo acima para o automático do nível gráfico')}</span><span><div class="pm-toggle is-on">restaurar</div></span></div>`;
		if (pending) h += `<div style="padding:10px 6px;color:#f2c230;font:600 12px var(--font)">⚠️ Há mudanças que só valem na próxima vez que o jogo abrir.</div>`;
		el.innerHTML = h;
		const on = el.querySelector('.pm-row.on'); if (on) on.scrollIntoView({ block: 'nearest' });
		el.querySelectorAll('.pm-row').forEach((row) => row.addEventListener('click', (e) => {
			e.stopPropagation();
			const i = +row.dataset.i, b = e.target.closest && e.target.closest('[data-d]');
			this.row = i;
			const r = this.adjust(i, b ? +b.dataset.d : 0, menu);
			if (r === 'back') this.row = 0;
			menu._renderSettings();
		}));
	},

	// Teclado (e o controle, que chega aqui como teclas): true = tratou.
	key(k, menu) {
		const n = this.OPTS.length + 2;
		if (k === 'escape' || k === 'backspace') { menu._gfxView = false; menu._renderSettings(); return true; }
		if (k === 'arrowup') this.row = (this.row + n - 1) % n;
		else if (k === 'arrowdown') this.row = (this.row + 1) % n;
		else if (k === 'arrowleft' || k === 'arrowright') { if (this.row > 0 && this.row < n - 1) this.adjust(this.row, k === 'arrowleft' ? -1 : 1, menu); }
		else if (k === 'enter' || k === ' ') { if (this.adjust(this.row, 0, menu) === 'back') this.row = 0; }
		else return false;
		menu._renderSettings();
		return true;
	},
};

// ----------------------------------------------------------------------------
// FpsMeter — o contador no canto da tela (Ajustes › Gráficos avançados › Mostrar FPS): FPS de verdade (o intervalo entre quadros,
// GPU incluída) e o tempo de trabalho do quadro (Perf.frameAvg), 2× por segundo.
// ----------------------------------------------------------------------------
const FpsMeter = {
	el: null, _t: null,
	setEnabled(on) {
		if (!on) { clearInterval(this._t); this._t = null; if (this.el) this.el.style.display = 'none'; return; }
		if (!this.el) {
			const d = this.el = document.createElement('div');
			d.id = 'fpsMeter';
			d.style.cssText = 'position:fixed;top:6px;right:8px;z-index:40;pointer-events:none;font:700 12px/1.2 ui-monospace,monospace;color:#e8ffe8;background:rgba(0,0,0,.55);padding:3px 7px;border-radius:6px;text-shadow:0 1px 0 #000';
			document.body.appendChild(d);
		}
		this.el.style.display = '';
		const tick = () => {
			const iv = (typeof Perf !== 'undefined' && Perf.interval) || 0, fps = iv ? 1000 / iv : 0, w = typeof Perf !== 'undefined' ? Perf.frameAvg : 0;
			this.el.textContent = `${fps.toFixed(0)} FPS · ${w.toFixed(1)} ms`;
			this.el.style.color = fps >= 28 ? '#9dff9d' : fps >= 22 ? '#ffe27a' : '#ff8a7a';
		};
		tick();
		if (!this._t) this._t = setInterval(tick, 500);
	},
};
