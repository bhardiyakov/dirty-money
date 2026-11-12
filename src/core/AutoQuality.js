// ============================================================================
// AutoQuality — qualidade adaptativa. Mede o tempo REAL entre quadros (o teto é Config.perf.fpsCap: 30 Hz ≈ 33 ms; 60 no app de PC) e, se o aparelho
// não consegue manter o ritmo por alguns segundos, desce um degrau por vez (o que menos se nota primeiro; nunca sobe sozinho):
//   0) teto 60 → 30 FPS (app de PC)
//   1) mapa de sombras 2048/1024 → 512
//   2) resolução a 85% — quase não se nota e é o que mais rende: o custo do quadro acompanha o número de pixels
//   3) sem MSAA e sem a paralaxe das fachadas (o relevo das janelas fica; saem as ~15 amostras por pixel de parede)
//   4) sem sombras — o mapa de sombras redesenha tudo o que projeta: é um terço a metade dos triângulos do quadro
//   5) resolução a 70%
//   6) sem a vegetação rasteira (tufos, capins, cascalho — Trees3D.COVER) e o espelho da água a cada 3 quadros
//   7) resolução a 58%
//   8) resolução a 45% — só SEM placa de vídeo (abaixo)
// Antes ele só tinha os dois degraus de sombra e desistia: quem ficava a 10 FPS sem sombras continuava a 10 FPS. `level` = a posição,
// nesta lista, do último degrau aplicado.
// SEM PLACA DE VÍDEO (Graphics.software: o navegador desenhando pelo processador — "Microsoft Basic Render Driver", SwiftShader): o
// custo é só o número de pixels, então ele já COMEÇA nos 70% (os degraus até lá, em silêncio) e pode ir até 45%. Não fica fluido —
// quem resolve é ligar a aceleração gráfica (o aviso do menu principal e a dica explicam) —, mas fica jogável.
// NOS TESTES (navegador automatizado, navigator.webdriver) valem só os dois degraus de sombra, como sempre: os outros mexeriam na
// resolução e no MSAA no meio de um teste, e a configuração tem de ser uma só.
// Um segundo só conta como lento se a MAIORIA dos quadros dele foi lenta (um engasgo isolado numa máquina boa não custa qualidade).
// Bem lento (menos da metade do ritmo) desce em 2 s em vez de 4. Quadro de mais de meio segundo é aba em segundo plano e não conta — a
// não ser que venham três seguidos: aí a máquina está se arrastando (a 1 FPS todo quadro passava do meio segundo, e ele nunca descia).
// O degrau alcançado fica guardado (por preset e placa): a sessão
// seguinte já começa UM degrau acima dele, em vez de passar o primeiro minuto de novo a 10 FPS — e ainda pode se recuperar aos poucos.
// Escolher um preset à mão em Ajustes › Gráficos apaga o degrau guardado: a adaptação recomeça do alto.
// O preset de gráficos (src/core/Graphics.js) não é trocado; no Low, que já vem sem sombras, os dois degraus de sombra são pulados.
// `?full` na URL desliga.
// ============================================================================

class AutoQuality {
	// O jogo está sendo dirigido por automação (os testes)? Aí só valem os degraus de sombra.
	static get automated() { return typeof navigator !== 'undefined' && navigator.webdriver === true; }
	// [id, o aviso, é dos que mexem na imagem além das sombras? (fora dos testes)]
	static get STEPS() {
		return [
			['shadow512', 'sombras reduzidas', false],
			['scale85', 'resolução a 85%', true],
			['fill', 'sem antisserrilhado e fachadas simples', true],
			['noShadow', 'sem sombras', false],
			['scale70', 'resolução a 70%', true],
			['cover', 'sem vegetação rasteira', true],
			['scale58', 'resolução a 58%', true],
			['scale45', 'resolução a 45%', true],
		];
	}

	constructor(game) {
		this.g = game;
		this.level = 0;
		this.acc = 0; this.n = 0; this.nSlow = 0; this.bad = 0; this.cool = 6;        // 6 s de carência no início (carregamento e aquecimento de shaders)
		this.slow = 1000 / Config.perf.fpsCap * 1.35;                  // média de ms por quadro acima disto = quadro "ruim"
		this.off = location.search.includes('full');
		this.gpuSteps = !AutoQuality.automated;
		this.soft = this.gpuSteps && typeof Graphics !== 'undefined' && Graphics.software;      // sem placa de vídeo (e fora dos testes)
		this.long = 0;                                                 // quadros seguidos de mais de meio segundo
		this.skip = new Set();                                         // degraus que não valem neste preset
		if (Config.perf.shadows === false) { this.skip.add('shadow512').add('noShadow'); this._shadowsOff(); }      // (Low graphics preset: no sun shadows at all)
		if (!this.soft) this.skip.add('scale45');
		this._resume();
		if (this.soft && !this.off) this._floor('scale70');
	}

	// Aplica, em silêncio, todos os degraus até `id` (sem placa de vídeo: de saída a 70% da resolução).
	_floor(id) {
		const to = AutoQuality.STEPS.findIndex((s) => s[0] === id) + 1;
		for (let n = this._next(); n && n <= to; n = this._next()) { this.level = n; try { this._apply(n); } catch (e) { console.warn('[QUALIDADE]', e); break; } }
		console.log(`[QUALIDADE] sem placa de vídeo (${Graphics.gpu().renderer.slice(0, 80)}): começa no degrau ${this.level}`);
	}

	// Quem é esta máquina para o degrau guardado: o preset e a placa (trocou um dos dois, começa do zero).
	_sig() { return (typeof Graphics !== 'undefined' ? Graphics.level + '|' + Graphics.gpu().renderer : '?').slice(0, 160); }
	// O próximo degrau depois de `from` que vale nesta máquina (os de placa de vídeo, só com uma de verdade; os pulados, nunca). 0 = acabou.
	_next(from = this.level) {
		const S = AutoQuality.STEPS;
		for (let i = from + 1; i <= S.length; i++) if (!this.skip.has(S[i - 1][0]) && (this.gpuSteps || !S[i - 1][2])) return i;
		return 0;
	}
	// Sessão seguinte: começa um degrau ACIMA do que precisou da última vez (em silêncio).
	_resume() {
		if (this.off || !this.gpuSteps || typeof Store === 'undefined') return;
		const s = Store.getJSON('autoQuality', null);
		if (!s || s.sig !== this._sig() || !(s.level > 1)) return;
		for (let n = this._next(); n && n < s.level; n = this._next()) { this.level = n; try { this._apply(n); } catch (e) { console.warn('[QUALIDADE]', e); break; } }
		if (this.level > 0) console.log(`[QUALIDADE] começa no degrau ${this.level} (a última sessão precisou do ${s.level})`);
	}
	_remember() { if (this.gpuSteps && typeof Store !== 'undefined') Store.setJSON('autoQuality', { sig: this._sig(), level: this.level }); }

	// Chamado todo quadro com o dt REAL em segundos (antes do teto de 50 ms do jogo).
	tick(dtReal, paused) {
		if (this.off || paused) return;                               // menu: não conta
		// Um quadro de mais de meio segundo é a aba voltando do segundo plano: não conta. Três seguidos (de até 5 s) são a máquina se
		// arrastando — contam, e cada um vale uma janela inteira.
		if (dtReal > 0.5) { if (++this.long < 3 || dtReal > 5) return; } else this.long = 0;
		if (typeof Interiors !== 'undefined' && Interiors.active) return;      // (dentro de loja o mundo não é desenhado: não mede nada)
		if (this.cool > 0) { this.cool -= dtReal; return; }
		const ms = dtReal * 1000;
		this.acc += ms; this.n++; if (ms > this.slow) this.nSlow++;
		if (this.acc < 1000) return;                                   // janela de 1 s
		const avg = this.acc / this.n, share = this.nSlow / this.n;
		this.acc = 0; this.n = 0; this.nSlow = 0;
		// Janela ruim = a MAIORIA dos quadros lentos, não só a média: um engasgo isolado (carregar um pedaço do mapa, compilar um shader)
		// puxa a média de uma máquina boa e não pode custar qualidade. Bem lento (menos da metade do ritmo, quase todo quadro) conta em
		// dobro: desce em 2 s.
		const slow = avg > this.slow && share >= 0.6, crawl = avg > this.slow * 1.8 && share >= 0.8;
		this.bad = crawl ? this.bad + 2 : slow ? this.bad + 1 : Math.max(0, this.bad - 1);
		if (this.bad >= 4) { this.bad = 0; this.cool = crawl ? 3 : 5; this._down(); }
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
		else if (id === 'scale45') this._scale(0.45);
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
		const next = this._next();
		if (!next) {
			this.off = true;
			if (this.gpuSteps && g._flash) g._flash('Este computador está no limite: em Ajustes › Gráficos, escolha um nível mais leve');
			return;
		}
		this.level = next;
		try { this._apply(next); } catch (e) { console.warn('[QUALIDADE]', e); }
		this._remember();
		console.log(`[QUALIDADE] desempenho baixo: degrau ${this.level} (${S[next - 1][1]})`);
		if (g._flash) g._flash(S[next - 1][2] ? `Modo econômico: ${S[next - 1][1]} para manter a fluidez` : 'Modo econômico: sombras reduzidas para manter a fluidez');
	}
}
memoStatics(AutoQuality, 'STEPS');
