// ============================================================================
// Diag — o DIAGNÓSTICO para mandar quando algo dá errado numa máquina que não é a de testes.
//   • Guarda (desde a carga da página) os últimos erros e avisos do console, as exceções soltas e as promessas rejeitadas.
//   • report(game): um texto com o navegador, a tela, a placa de vídeo e o que ela aceita, o preset gráfico, os degraus do ajuste
//     automático, o modo seguro, a cadeia de pós-processamento, o FPS, o estado do jogo e os últimos erros — nada pessoal.
//   • open(game): o painel com o texto e o botão "Copiar" (Ajustes › Diagnóstico, ou Ctrl+Shift+D em qualquer lugar).
//   • fatal(e): a carga falhou — a tela de erro com o mesmo painel (em vez de uma tela parada).
// Carregado ANTES de tudo (index.html): pega também os erros da carga.
// ============================================================================

const Diag = {
	MAX: 60,
	log: [],
	t0: performance.now(),

	_text(a) {
		if (a instanceof Error) return a.stack || a.message || String(a);
		if (a && typeof a === 'object') { try { return JSON.stringify(a).slice(0, 300); } catch (e) { return String(a); } }
		return String(a);
	},
	_push(kind, args) {
		const msg = Array.from(args).map((a) => this._text(a)).join(' ').replace(/\s+\n/g, '\n').slice(0, 700);
		const last = this.log[this.log.length - 1];
		if (last && last.msg === msg) { last.n = (last.n || 1) + 1; return; }       // (o mesmo erro todo quadro: conta, não enche a lista)
		this.log.push({ t: ((performance.now() - this.t0) / 1000).toFixed(1), kind, msg });
		if (this.log.length > this.MAX) this.log.shift();
	},

	install() {
		if (this._on) return;
		this._on = true;
		for (const kind of ['error', 'warn']) {
			const orig = console[kind].bind(console);
			console[kind] = (...args) => { try { this._push(kind, args); } catch (e) { /* (o diagnóstico nunca pode quebrar o console) */ } orig(...args); };
		}
		window.addEventListener('error', (e) => this._push('exceção', [e.message + (e.filename ? ` (${e.filename.split('/').slice(-2).join('/')}:${e.lineno})` : '')]));
		window.addEventListener('unhandledrejection', (e) => this._push('promessa', [e.reason]));
		window.addEventListener('keydown', (e) => { if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) { e.preventDefault(); this.open(window.game); } }, true);
	},

	// ------------------------------------------------------------------ o relatório
	report(g) {
		const L = [], put = (k, v) => L.push(`${k}: ${v}`), safe = (f, d = '?') => { try { const v = f(); return v === undefined ? d : v; } catch (e) { return d; } };
		L.push('=== Dirty Money — diagnóstico ===');
		put('data', new Date().toISOString());
		put('endereço', location.origin + location.pathname + location.search);
		put('navegador', navigator.userAgent);
		put('idioma / plataforma', `${navigator.language} / ${navigator.platform || '?'}`);
		put('tela', `${screen.width}×${screen.height} · janela ${innerWidth}×${innerHeight} · densidade ${devicePixelRatio}`);
		put('instalado', safe(() => (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches ? 'sim (app)' : 'não (aba)') + ' · service worker: ' + (navigator.serviceWorker && navigator.serviceWorker.controller ? 'ativo' : 'não') + ('__TAURI_INTERNALS__' in window ? ' · app de PC (Tauri)' : '')));
		const eng = safe(() => g.gameEngine.engine, null);
		if (eng) {
			const C = eng.getCaps(), gpu = safe(() => Graphics.gpu(), {});
			put('placa de vídeo', gpu.renderer || '? (o navegador não informa)');
			put('WebGL', `${eng.webGLVersion} · textura máx ${C.maxTextureSize} · MSAA máx ${C.maxMSAASamples || 0} · compilação paralela ${C.parallelShaderCompile ? 'sim' : 'não'} · tempo de GPU ${C.timerQuery ? 'sim' : 'não'} · por software: ${safe(() => Graphics.software ? 'SIM' : 'não')}`);
			put('resolução interna', `${eng.getRenderWidth()}×${eng.getRenderHeight()} · escala ${safe(() => Config.perf.renderScale)} · teto ${safe(() => Config.perf.fpsCap)} FPS · FPS agora ${safe(() => eng.getFps().toFixed(0))}`);
		} else put('placa de vídeo', 'o motor não chegou a abrir');
		put('preset', `${safe(() => Graphics.level)} (escolha: ${safe(() => g.menu.settings.graphics)}) · ajuste automático: degrau ${safe(() => g.autoQuality.level)}${safe(() => g.autoQuality.level ? ' — ' + AutoQuality.STEPS.slice(0, g.autoQuality.level).map((s) => s[0]).join(', ') : '', '')}`);
		put('teste de desenho', safe(() => GpuCheck.label + (GpuCheck.result ? ` (${GpuCheck.result.ms} ms)` : ''), 'não rodou'));
		put('modo seguro', safe(() => SafeMode.detail(), 'desligado'));
		put('pós-processamento', safe(() => g.camera.camera._postProcesses.filter(Boolean).map((p) => p.name).join(' > ') || 'nenhum'));
		put('personagens 3D', safe(() => `${Char3D.on ? 'ligados' : 'DESLIGADOS'} · ${Char3D.npcs.size} na tela`));
		put('carros 3D', safe(() => Config.art.cars3d ? 'ligados' : 'desligados'));
		put('memória (folhas 2,5D)', safe(() => `${NpcArt.mem().texMB} MB`));
		put('trabalho por quadro', safe(() => `${Perf.frameAvg.toFixed(1)} ms (intervalo real ${Perf.interval.toFixed(1)} ms)${g.menu && g.menu.isOpen ? ' — medido com o jogo PAUSADO: para o custo real, ?perf jogando' : ''}`));
		put('jogo', safe(() => `${g._bootDone ? 'carregado' : 'CARREGANDO'} · modo ${g.mode} · ${typeof Interiors !== 'undefined' && Interiors.active ? 'dentro de ' + Interiors.active.shop.style : 'na rua'} · posição ${Math.round(g.player.position.x)}, ${Math.round(g.player.position.z)} · hora ${g.dayNight.label}`, 'não iniciado'));
		put('salvo', safe(() => `espaço ${SaveGame.slot} · último salvamento automático ${AutoSave.lastAt ? Math.round((Date.now() - AutoSave.lastAt) / 1000) + ' s atrás' : 'ainda não'}`));
		L.push('', `--- últimos erros e avisos (${this.log.length}) ---`);
		for (const e of this.log.slice(-40)) L.push(`[${e.t}s ${e.kind}${e.n ? ' ×' + e.n : ''}] ${e.msg}`);
		if (!this.log.length) L.push('(nenhum)');
		return L.join('\n');
	},

	// ------------------------------------------------------------------ o painel
	open(g, title = '🩺 Diagnóstico', lead = 'Copie e mande para quem cuida do jogo — mostra a máquina, os ajustes e os últimos erros (nada pessoal).') {
		const text = this.report(g);
		let el = document.getElementById('dmDiag');
		if (el) el.remove();
		el = document.createElement('div');
		el.id = 'dmDiag';
		el.style.cssText = 'position:fixed;inset:0;z-index:400;display:flex;align-items:center;justify-content:center;background:rgba(5,7,12,.82);font-family:Inter,system-ui,sans-serif';
		el.innerHTML = `<div style="width:min(760px,94vw);max-height:90vh;display:flex;flex-direction:column;gap:10px;padding:16px;border-radius:16px;background:#0f141d;color:#e8eaf0;border:1px solid rgba(255,255,255,.1);box-shadow:0 20px 60px rgba(0,0,0,.6)">
			<div style="display:flex;align-items:center;gap:10px"><b style="font-size:16px;flex:1">${title}</b><button data-a="x" style="border:0;border-radius:8px;padding:5px 10px;background:#334155;color:#e2e8f0;cursor:pointer">✕</button></div>
			<div style="font-size:13px;color:#94a3b8">${lead}</div>
			<textarea readonly style="flex:1;min-height:280px;width:100%;box-sizing:border-box;resize:vertical;border-radius:10px;border:1px solid #243042;background:#0a0e15;color:#cbd5e1;font:12px/1.4 ui-monospace,Consolas,monospace;padding:10px"></textarea>
			<div style="display:flex;gap:8px;justify-content:flex-end"><span data-a="ok" style="align-self:center;font-size:13px;color:#34d399"></span><button data-a="copy" style="border:0;border-radius:10px;padding:8px 14px;background:#34d399;color:#04130c;font-weight:700;cursor:pointer">📋 Copiar</button></div></div>`;
		document.body.appendChild(el);
		const ta = el.querySelector('textarea');
		ta.value = text;
		el.querySelector('[data-a="x"]').onclick = () => el.remove();
		el.querySelector('[data-a="copy"]').onclick = async () => {
			const ok = await this.copy(text, ta);
			el.querySelector('[data-a="ok"]').textContent = ok ? 'Copiado ✓' : 'Selecione o texto e copie (Ctrl+C)';
		};
		return el;
	},
	async copy(text, ta = null) {
		try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* (sem permissão: o jeito antigo) */ }
		try { if (ta) { ta.focus(); ta.select(); return document.execCommand('copy'); } } catch (e) { /* nada */ }
		return false;
	},

	// A carga falhou: o painel com o erro (a tela de abertura não fica parada para sempre).
	fatal(e) {
		this._push('carga', [e]);
		const el = this.open(window.game, '⚠️ O jogo não conseguiu abrir', 'Algo falhou na carga. Recarregue a página; se continuar, copie o diagnóstico abaixo e mande para quem cuida do jogo.');
		const box = el.firstElementChild, b = document.createElement('button');
		b.textContent = '↻ Recarregar';
		b.style.cssText = 'border:0;border-radius:10px;padding:8px 14px;background:#334155;color:#e2e8f0;font-weight:700;cursor:pointer';
		b.onclick = () => location.reload();
		box.lastElementChild.prepend(b);
	},
};
Diag.install();
