// ============================================================================
// SafeMode — o MODO SEGURO: o jogo confere, nos primeiros segundos, se a imagem está chegando à tela. Cada navegador traduz os
// shaders do seu jeito (o Chrome no Windows, para Direct3D), e um que falhe numa placa pode deixar a tela só com a cor do céu ou
// preta — com o jogo rodando atrás. Aqui isso deixa de ser o fim da linha:
//   • VIGIA: depois da carga, uma vez por segundo, lê 25 pontos do meio da tela. Todos da mesma cor e ela é a do céu (a cor de
//     limpeza, clara) por 4 checagens seguidas = a imagem não está chegando. Tela toda escura NÃO conta: numa madrugada sem luz
//     ela é legítima, e desligar coisas por engano (e lembrar disso) seria pior que não ajudar.
//   • DEGRAUS: desliga um por vez e confere de novo — 1) os efeitos de tela (pós-processamento: gradação, TV de tubo, borrão,
//     antisserrilhado), 2) os personagens 3D (volta o desenho 2,5D), 3) as sombras. Avisa o que desligou.
//   • Lembra (por placa de vídeo): na próxima abertura já começa assim. Ajustes › "Modo seguro" desliga e tenta de novo.
//   • NÃO PARA SEMPRE: o que ficou guardado numa REVISÃO anterior do desenho (REV: sobe quando os shaders mudam — uma placa que
//     falhava pode passar a desenhar) ou há mais de RETRY_DAYS dias (o navegador e o driver se atualizam) é tentado de novo com
//     tudo ligado. A imagem chegou por 8 checagens = esquece o modo seguro; não chegou = os degraus voltam um a um, como da 1ª vez;
//     não deu para saber (tela escura de noite: RETRY_UNKNOWN checagens sem veredito, ou o fim da vigia sem 3 boas) = volta ao que
//     estava guardado e tenta na próxima abertura. (Contado em checagens, não em segundos: num aparelho lento cada quadro demora.)
//   • Nada resolveu: a tela explica e oferece o diagnóstico (core/Diag.js).
// ============================================================================

const SafeMode = {
	KEY: 'safeMode',
	STEPS: [
		['pp', 'efeitos de tela'],
		['char3d', 'personagens 3D'],
		['shadows', 'sombras'],
	],
	REV: 2,                    // revisão do desenho (1 = antes do céu/brilho/sombras novos); suba ao mexer nos shaders de tela
	RETRY_DAYS: 14,
	RETRY_UNKNOWN: 8,          // tentando de novo: 8 checagens sem veredito (tela escura) = volta aos degraus guardados
	GOOD_N: 8,                 // checagens seguidas com imagem = está tudo bem (para de olhar; tentando de novo: esquece o modo seguro)
	WATCH_MS: 90000,           // a vigia só olha o começo do jogo
	state: null,               // { gpu, steps: ['pp', …], rev, when, why } — os degraus aplicados nesta placa
	retry: null,               // o estado antigo, quando esta abertura está tentando de novo com tudo ligado
	applied: new Set(),

	_gpu() { try { const g = Graphics.gpu(); return (g.renderer || '?').slice(0, 160); } catch (e) { return '?'; } },
	get active() { return this.applied.size > 0; },
	_names(ids) { return this.STEPS.filter((s) => ids.includes(s[0])).map((s) => s[1]).join(', '); },
	describe() { return this.applied.size ? 'LIGADO — desligou: ' + this._names([...this.applied]) : 'desligado'; },
	// Para o diagnóstico: o que está ligado, desde quando, em que revisão — ou que esta abertura está tentando de novo.
	detail() {
		const day = (t) => { try { return new Date(t).toLocaleDateString('pt-BR'); } catch (e) { return '?'; } };
		const from = (s) => (s.when ? ' desde ' + day(s.when) : ' (data desconhecida)') + ` · revisão ${s.rev || 1} (atual ${this.REV})` + (s.why ? ' · motivo: ' + s.why : '');
		if (this.retry && !this.applied.size) return 'tentando de novo com tudo ligado (estava: ' + this._names(this.retry.steps || []) + from(this.retry) + ')';
		return this.describe() + (this.applied.size && this.state ? from(this.state) : '');
	},
	// Guardado numa revisão anterior do desenho, sem data ou há mais de RETRY_DAYS dias: vale tentar de novo.
	_stale(s) { return (s.rev || 1) !== this.REV || !(Date.now() - (s.when || 0) < this.RETRY_DAYS * 864e5); },

	// Na carga (Game, depois do pós-processamento montado): os degraus guardados para esta placa.
	init(g) {
		const s = Store.getJSON(this.KEY);
		this.state = s && s.gpu === this._gpu() ? s : null;
		this.retry = null;
		if (this.state && this._stale(this.state)) { this.retry = this.state; this.state = null; }
		this.watch(g);
	},
	reset(g) {
		Store.remove(this.KEY);
		this.state = null;
		this.retry = null;
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
				if (typeof Lighting !== 'undefined') { Lighting.grade = null; Lighting.crt = null; Lighting.horizon = null; Lighting.bloomFx = null; }
				if (typeof Smooth !== 'undefined') Smooth.pp = null;
			} else if (id === 'char3d') { if (typeof Char3D !== 'undefined' && Char3D.on) Char3D.disable(); }
			else if (id === 'shadows') { if (g.autoQuality && g.autoQuality._shadowsOff) g.autoQuality._shadowsOff(); }
		} catch (e) { console.warn('[SEGURO] degrau ' + id + ' falhou:', e); }
	},
	_remember() {
		this.state = { gpu: this._gpu(), steps: [...this.applied], rev: this.REV, when: Date.now(), why: 'tela só com a cor do céu' };
		this.retry = null;
		Store.setJSON(this.KEY, this.state);
	},

	// ------------------------------------------------------------------ a vigia
	watch(g) {
		const scene = g.scene, eng = g.gameEngine.engine;
		let t0 = 0, last = 0, bad = 0, good = 0, unknown = 0;
		if (this._obs) scene.onAfterRenderObservable.remove(this._obs);                   // (uma vigia só: init de novo troca a anterior)
		const stop = () => { scene.onAfterRenderObservable.remove(obs); if (this._obs === obs) this._obs = null; };
		const back = () => {                                                              // (tentando de novo e sem veredito: volta ao guardado)
			const old = this.retry; this.retry = null; this.state = old;
			for (const id of old.steps || []) this._apply(g, id);
			console.warn('[SEGURO] não deu para conferir a imagem (tela escura?): voltei ao modo seguro guardado — ' + this.describe());
			stop();
		};
		const obs = this._obs = scene.onAfterRenderObservable.add(() => {
			if (!g._bootDone || document.hidden) return;
			const now = performance.now();
			if (!t0) {                                                       // (1º quadro do jogo carregado: os degraus guardados desta placa)
				t0 = now;
				if (this.state) for (const id of this.state.steps || []) this._apply(g, id);
				if (this.applied.size) console.warn('[SEGURO] modo seguro desta placa: ' + this.detail());
				if (this.retry) console.warn('[SEGURO] ' + this.detail());
			}
			if (now - last < 1000) return;
			last = now;
			const retrying = this.retry && !this.applied.size;
			const blank = this._blank(scene, eng);
			const late = now - t0 > this.WATCH_MS, few = Math.min(3, this.GOOD_N);
			if (blank === null) { if (retrying && ++unknown >= this.RETRY_UNKNOWN) back(); else if (late) { if (retrying && good < few) back(); else stop(); } return; }
			if (blank) { bad++; good = 0; } else { good++; bad = 0; }
			if (bad >= 4) {
				bad = 0;
				const next = this.STEPS.find((s) => !this.applied.has(s[0]));
				if (next) {
					this._apply(g, next[0]);
					this._remember();
					console.warn(`[SEGURO] a imagem não estava chegando à tela: desliguei ${next[1]}`);
					if (g._flash) g._flash(`🛟 Modo seguro: a imagem não aparecia nesta placa de vídeo — desliguei ${next[1]}`);
				} else { this._giveUp(g); stop(); }
			}
			if (this.retry && !this.applied.size && (good >= this.GOOD_N || late)) {          // (tentou de novo com tudo ligado: chegou?)
				if (good >= this.GOOD_N || good >= few && !bad) {
					console.warn('[SEGURO] tentei de novo com tudo ligado e a imagem chegou: modo seguro desligado nesta placa');
					Store.remove(this.KEY);
					this.retry = null;
				} else { back(); return; }
			}
			if (good >= this.GOOD_N || late) stop();          // (imagem ok por 8 checagens, ou passou o começo: para de olhar)
		});
	},

	// A imagem na tela é uma cor só, a do céu (clara)? 25 pontos do meio da tela, lidos logo depois do quadro desenhado.
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
			if (Math.max(avg[0], avg[1], avg[2]) < 40) return null;                                    // escuro: noite/interior — não dá para afirmar
			return Math.abs(avg[0] - c.r * 255) < 10 && Math.abs(avg[1] - c.g * 255) < 10 && Math.abs(avg[2] - c.b * 255) < 10;
		} catch (e) { return null; }
	},

	_giveUp(g) {
		console.error('[SEGURO] mesmo com o modo seguro a imagem não aparece nesta placa');
		if (typeof Diag !== 'undefined') Diag.open(g, '⚠️ A imagem do jogo não está aparecendo', 'O jogo está rodando, mas este navegador não está desenhando a imagem nesta placa de vídeo — mesmo com os efeitos, os personagens 3D e as sombras desligados. Tente: atualizar o navegador e o driver da placa de vídeo, ligar "Usar aceleração gráfica" nas configurações do navegador, ou abrir em outro navegador (Edge, Firefox). E mande este diagnóstico para quem cuida do jogo.');
	},
};
