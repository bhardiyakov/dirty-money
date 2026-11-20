// ============================================================================
// SafeMode — o MODO SEGURO: o jogo confere, nos primeiros segundos, se a imagem está chegando à tela. Cada navegador traduz os
// shaders do seu jeito (o Chrome no Windows, para Direct3D), e um que falhe numa placa pode deixar a tela só com a cor do céu ou
// preta — com o jogo rodando atrás. Aqui isso deixa de ser o fim da linha:
//   • VIGIA: depois da carga, uma vez por segundo, lê 25 pontos do meio da tela. Todos da mesma cor — a do céu (a cor de limpeza)
//     ou preto — por 4 checagens seguidas = a imagem não está chegando.
//   • DEGRAUS: desliga um por vez e confere de novo — 1) os efeitos de tela (pós-processamento: gradação, TV de tubo, borrão,
//     antisserrilhado), 2) os personagens 3D (volta o desenho 2,5D), 3) as sombras. Avisa o que desligou.
//   • Lembra (por placa de vídeo): na próxima abertura já começa assim. Ajustes › "Modo seguro" desliga e tenta de novo.
//   • Nada resolveu: a tela explica e oferece o diagnóstico (core/Diag.js).
// ============================================================================

const SafeMode = {
	KEY: 'safeMode',
	STEPS: [
		['pp', 'efeitos de tela'],
		['char3d', 'personagens 3D'],
		['shadows', 'sombras'],
	],
	state: null,               // { gpu, steps: ['pp', …] } — os degraus aplicados nesta placa
	applied: new Set(),

	_gpu() { try { const g = Graphics.gpu(); return (g.renderer || '?').slice(0, 160); } catch (e) { return '?'; } },
	get active() { return this.applied.size > 0; },
	describe() { return this.applied.size ? 'LIGADO — desligou: ' + this.STEPS.filter((s) => this.applied.has(s[0])).map((s) => s[1]).join(', ') : 'desligado'; },

	// Na carga (Game, depois do pós-processamento montado): os degraus guardados para esta placa.
	init(g) {
		const s = Store.getJSON(this.KEY);
		this.state = s && s.gpu === this._gpu() ? s : null;
		this.watch(g);
	},
	reset(g) {
		Store.remove(this.KEY);
		this.state = null;
		if (g && g._flash) g._flash('Modo seguro desligado — reabra o jogo para tentar com tudo ligado');
	},

	_apply(g, id) {
		if (this.applied.has(id)) return;
		this.applied.add(id);
		try {
			if (id === 'pp') {
				const cam = g.camera.camera;
				if (typeof Trails !== 'undefined') Trails.off = true;
				if (g.crt && g.crt.enabled) g.crt.setEnabled(false);
				for (const pp of cam._postProcesses.slice()) if (pp) { cam.detachPostProcess(pp); pp.dispose(cam); }
				cam._postProcesses.length = 0;
				if (typeof Lighting !== 'undefined') { Lighting.grade = null; Lighting.crt = null; Lighting.horizon = null; }
				if (typeof Smooth !== 'undefined') Smooth.pp = null;
			} else if (id === 'char3d') { if (typeof Char3D !== 'undefined' && Char3D.on) Char3D.disable(); }
			else if (id === 'shadows') { if (g.autoQuality && g.autoQuality._shadowsOff) g.autoQuality._shadowsOff(); }
		} catch (e) { console.warn('[SEGURO] degrau ' + id + ' falhou:', e); }
	},
	_remember() {
		this.state = { gpu: this._gpu(), steps: [...this.applied] };
		Store.setJSON(this.KEY, this.state);
	},

	// ------------------------------------------------------------------ a vigia
	watch(g) {
		const scene = g.scene, eng = g.gameEngine.engine;
		let t0 = 0, last = 0, bad = 0, good = 0;
		const obs = scene.onAfterRenderObservable.add(() => {
			if (!g._bootDone || document.hidden) return;
			const now = performance.now();
			if (!t0) {                                                       // (1º quadro do jogo carregado: os degraus guardados desta placa)
				t0 = now;
				if (this.state) for (const id of this.state.steps || []) this._apply(g, id);
				if (this.applied.size) console.warn('[SEGURO] modo seguro desta placa: ' + this.describe());
			}
			if (now - last < 1000) return;
			last = now;
			const blank = this._blank(scene, eng);
			if (blank === null) return;
			if (blank) { bad++; good = 0; } else { good++; bad = 0; }
			if (bad >= 4) {
				bad = 0;
				const next = this.STEPS.find((s) => !this.applied.has(s[0]));
				if (next) {
					this._apply(g, next[0]);
					this._remember();
					console.warn(`[SEGURO] a imagem não estava chegando à tela: desliguei ${next[1]}`);
					if (g._flash) g._flash(`🛟 Modo seguro: a imagem não aparecia nesta placa de vídeo — desliguei ${next[1]}`);
				} else { this._giveUp(g); scene.onAfterRenderObservable.remove(obs); }
			}
			if (good >= 8 || now - t0 > 90000) scene.onAfterRenderObservable.remove(obs);      // (imagem ok por 8 s, ou passou o começo: para de olhar)
		});
	},

	// A imagem na tela é uma cor só (a do céu ou preto)? 25 pontos do meio da tela, lidos logo depois do quadro desenhado.
	_blank(scene, eng) {
		const gl = eng._gl;
		if (!gl) return null;
		try {
			eng.restoreDefaultFramebuffer();
			const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = this._px || (this._px = new Uint8Array(4));
			let mn = [255, 255, 255], mx = [0, 0, 0], sum = [0, 0, 0];
			for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
				gl.readPixels(Math.floor(W * (0.2 + i * 0.15)), Math.floor(H * (0.2 + j * 0.15)), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
				for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], px[k]); mx[k] = Math.max(mx[k], px[k]); sum[k] += px[k]; }
			}
			if (mx[0] - mn[0] > 4 || mx[1] - mn[1] > 4 || mx[2] - mn[2] > 4) return false;           // tem desenho
			const c = scene.clearColor, avg = sum.map((v) => v / 25);
			const sky = Math.abs(avg[0] - c.r * 255) < 10 && Math.abs(avg[1] - c.g * 255) < 10 && Math.abs(avg[2] - c.b * 255) < 10;
			const black = avg[0] < 8 && avg[1] < 8 && avg[2] < 8;
			return sky || black;
		} catch (e) { return null; }
	},

	_giveUp(g) {
		console.error('[SEGURO] mesmo com o modo seguro a imagem não aparece nesta placa');
		if (typeof Diag !== 'undefined') Diag.open(g, '⚠️ A imagem do jogo não está aparecendo', 'O jogo está rodando, mas este navegador não está desenhando a imagem nesta placa de vídeo — mesmo com os efeitos, os personagens 3D e as sombras desligados. Tente: atualizar o navegador e o driver da placa de vídeo, ligar "Usar aceleração gráfica" nas configurações do navegador, ou abrir em outro navegador (Edge, Firefox). E mande este diagnóstico para quem cuida do jogo.');
	},
};
