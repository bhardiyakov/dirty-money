// ============================================================================
// AutoQuality — qualidade adaptativa. Mede o tempo REAL entre quadros (o teto é Config.perf.fpsCap: 30 Hz ≈ 33 ms; 60 no app de PC) e, se o aparelho
// não consegue manter o ritmo por alguns segundos, desce um degrau por vez (o que menos se nota primeiro; nunca sobe sozinho):
//   0) teto 60 → 30 FPS (app de PC)
//   1) mapa de sombras 2048/1024 → 512
//   2) sem sombras — o mapa de sombras redesenha tudo o que projeta: é um terço a metade dos triângulos do quadro
//   3) sem MSAA e sem a paralaxe das fachadas (o relevo das janelas fica; saem as ~15 amostras por pixel de parede)
//   4) resolução a 85%
//   5) sem a vegetação rasteira (tufos, capins, cascalho — Trees3D.COVER) e o espelho da água a cada 3 quadros
//   6) resolução a 70%      7) resolução a 58%
// Antes ele só tinha os degraus 0 a 2 e desistia: quem ficava a 10 FPS sem sombras continuava a 10 FPS. Os degraus 3 em diante são os
// de PLACA DE VÍDEO (preenchimento e vértices) e só valem com uma de verdade: num rasterizador por software (Graphics.software — o
// navegador dos testes) nada disso deixa o jogo fluido, e os testes continuam com uma configuração só.
// Bem lento (menos da metade do ritmo) desce em 2 s em vez de 4. O degrau alcançado fica guardado (por preset e placa): a sessão
// seguinte já começa UM degrau acima dele, em vez de passar o primeiro minuto de novo a 10 FPS — e ainda pode se recuperar aos poucos.
// O preset de gráficos (src/core/Graphics.js) não é trocado; no Low, que já vem sem sombras, começa no degrau 2. `?full` na URL desliga.
// ============================================================================

class AutoQuality {
	// [id, o aviso, só com placa de vídeo?]
	static get STEPS() {
		return [
			['shadow512', 'sombras reduzidas', false],
			['noShadow', 'sem sombras', false],
			['fill', 'sem antisserrilhado e fachadas simples', true],
			['scale85', 'resolução a 85%', true],
			['cover', 'sem vegetação rasteira', true],
			['scale70', 'resolução a 70%', true],
			['scale58', 'resolução a 58%', true],
		];
	}

	constructor(game) {
		this.g = game;
		this.level = 0;
		this.acc = 0; this.n = 0; this.bad = 0; this.cool = 6;        // 6 s de carência no início (carregamento e aquecimento de shaders)
		this.slow = 1000 / Config.perf.fpsCap * 1.35;                  // média de ms por quadro acima disto = quadro "ruim"
		this.off = location.search.includes('full');
		this.gpuSteps = !(typeof Graphics !== 'undefined' && Graphics.software);
		if (Config.perf.shadows === false) { this.level = 2; this._shadowsOff(); }      // (Low graphics preset: no sun shadows at all)
		this._resume();
	}

	// Quem é esta máquina para o degrau guardado: o preset e a placa (trocou um dos dois, começa do zero).
	_sig() { return (typeof Graphics !== 'undefined' ? Graphics.level + '|' + Graphics.gpu().renderer : '?').slice(0, 160); }
	// Sessão seguinte: começa um degrau ACIMA do que precisou da última vez (em silêncio).
	_resume() {
		if (this.off || !this.gpuSteps || typeof Store === 'undefined') return;
		const s = Store.getJSON('autoQuality', null);
		if (!s || s.sig !== this._sig() || !(s.level > 1)) return;
		const to = Math.min(AutoQuality.STEPS.length, s.level - 1);
		while (this.level < to) { this.level++; try { this._apply(this.level); } catch (e) { console.warn('[QUALIDADE]', e); break; } }
		if (this.level > 0) console.log(`[QUALIDADE] começa no degrau ${this.level} (a última sessão precisou do ${s.level})`);
	}
	_remember() { if (this.gpuSteps && typeof Store !== 'undefined') Store.setJSON('autoQuality', { sig: this._sig(), level: this.level }); }

	// Chamado todo quadro com o dt REAL em segundos (antes do teto de 50 ms do jogo).
	tick(dtReal, paused) {
		if (this.off || paused || dtReal > 0.5) return;               // aba em segundo plano / menu: não conta
		if (typeof Interiors !== 'undefined' && Interiors.active) return;      // (dentro de loja o mundo não é desenhado: não mede nada)
		if (this.cool > 0) { this.cool -= dtReal; return; }
		this.acc += dtReal * 1000; this.n++;
		if (this.acc < 1000) return;                                   // janela de 1 s
		const avg = this.acc / this.n;
		this.acc = 0; this.n = 0;
		// (muito lento — menos da metade do ritmo — conta em dobro: desce em 2 s)
		this.bad = avg > this.slow * 1.8 ? this.bad + 2 : avg > this.slow ? this.bad + 1 : Math.max(0, this.bad - 1);
		if (this.bad >= 4) { this.bad = 0; this.cool = avg > this.slow * 1.8 ? 3 : 5; this._down(); }
	}

	_shadowsOff() {
		const g = this.g, sg = g.gameEngine.shadowGenerator;
		if (g.dayNight) g.dayNight.forceNoShadows = true;
		if (sg) sg.getShadowMap().refreshRate = 0;
	}

	// A resolução de desenho × k (GameEngine._applyScale) e a câmera reencaixada, como numa troca de tamanho da janela.
	_scale(k) {
		const g = this.g, ge = g.gameEngine;
		Config.perf.autoScale = k;
		ge.resize();
		if (g.camera) { g.camera.fitPixelScale(ge.viewHeight); g.camera.onResize(); }
	}

	// O que cada degrau faz (1 = o primeiro de STEPS).
	_apply(level) {
		const g = this.g, ge = g.gameEngine, id = AutoQuality.STEPS[level - 1][0];
		if (id === 'shadow512') { if (ge.shadowGenerator) ge.setShadowSize(512); }
		else if (id === 'noShadow') this._shadowsOff();
		else if (id === 'fill') {
			if (typeof Smooth !== 'undefined' && Smooth.pp && Smooth.pp.samples > 1) Smooth.pp.samples = 1;
			const F = ge.world && ge.world.mats && ge.world.mats.facades;
			let n = 0;
			if (F) for (const m of Object.values(F)) if (m && m.useParallaxOcclusion) { m.useParallaxOcclusion = false; n++; }
			if (n && typeof Smooth !== 'undefined') Smooth._thaw(g.scene);      // (materiais congelados: descongela para o shader novo valer)
		}
		else if (id === 'cover') {
			if (typeof Trees3D !== 'undefined') Trees3D.setCover(false);
			if (typeof Water !== 'undefined') { Water._rate = Math.max(Water._rate || 1, 3); if (Water.mirror && Water._seen) Water.mirror.refreshRate = Water._rate; }
		}
		else if (id === 'scale85') this._scale(0.85);
		else if (id === 'scale70') this._scale(0.7);
		else if (id === 'scale58') this._scale(0.58);
	}

	_down() {
		const g = this.g, S = AutoQuality.STEPS;
		// Degrau zero (só no app de PC, que começa a 60 FPS): volta ao teto de 30 sem perder nada da imagem.
		if (Config.perf.fpsCap > 30) {
			Config.perf.fpsCap = 30;
			this.slow = 1000 / Config.perf.fpsCap * 1.35;
			console.log('[QUALIDADE] desempenho baixo: teto de 60 → 30 FPS');
			return;
		}
		// o próximo degrau que vale nesta máquina (os de placa de vídeo, só com uma de verdade)
		let next = this.level + 1;
		while (next <= S.length && S[next - 1][2] && !this.gpuSteps) next++;
		if (next > S.length) {
			this.off = true;
			if (this.gpuSteps && g._flash) g._flash('Este computador está no limite: em Ajustes › Gráficos, escolha um nível mais leve');
			return;
		}
		this.level = next;
		try { this._apply(next); } catch (e) { console.warn('[QUALIDADE]', e); }
		this._remember();
		console.log(`[QUALIDADE] desempenho baixo: degrau ${this.level} (${S[next - 1][1]})`);
		if (g._flash) g._flash(next <= 2 ? 'Modo econômico: sombras reduzidas para manter a fluidez' : `Modo econômico: ${S[next - 1][1]} para manter a fluidez`);
	}
}
memoStatics(AutoQuality, 'STEPS');
