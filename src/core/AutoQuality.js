// ============================================================================
// AutoQuality — qualidade adaptativa. Mede o tempo REAL entre quadros (o teto é Config.perf.fpsCap: 60 Hz nos presets Médio, Alto e HD; 30 no Baixo) e, se o aparelho
// não consegue manter o ritmo por alguns segundos, desce um degrau por vez (o que menos se nota primeiro; nunca sobe sozinho):
//   0) teto 60 → 30 FPS
//   1) mapa de sombras 2048/1024 → 512
//   2) resolução a 85% — quase não se nota e é o que mais rende: o custo do quadro acompanha o número de pixels
//   3) sem MSAA e sem a paralaxe das fachadas (o relevo das janelas fica; saem as ~15 amostras por pixel de parede)
//   4) sem sombras — o mapa de sombras redesenha tudo o que projeta: é um terço a metade dos triângulos do quadro
//   5) resolução a 70%
//   6) sem a vegetação rasteira (tufos, capins, cascalho — Trees3D.COVER) e o espelho da água a cada 3 quadros
//   7) resolução a 58%
// Antes ele só tinha os dois degraus de sombra e desistia: quem ficava a 10 FPS sem sombras continuava a 10 FPS. Os outros cinco são
// os de PLACA DE VÍDEO (preenchimento e vértices) e só valem com uma de verdade: num rasterizador por software (Graphics.software — o
// navegador dos testes) nada disso deixa o jogo fluido; lá ele faz só os dois de sombra, como antes, e os testes continuam com uma
// configuração só. `level` = a posição, nesta lista, do último degrau aplicado.
// Um segundo só conta como lento se a MAIORIA dos quadros dele foi lenta (um engasgo isolado numa máquina boa não custa qualidade).
// Bem lento (menos da metade do ritmo) desce em 2 s em vez de 4. O degrau alcançado fica guardado (por preset e placa): a sessão
// seguinte já começa UM degrau acima dele, em vez de passar o primeiro minuto de novo a 10 FPS — e ainda pode se recuperar aos poucos.
// Escolher um preset à mão em Ajustes › Gráficos apaga o degrau guardado: a adaptação recomeça do alto.
// O preset de gráficos (src/core/Graphics.js) não é trocado; no Low, que já vem sem sombras, os dois degraus de sombra são pulados.
// `?full` na URL desliga.
// ============================================================================

class AutoQuality {
	// Quadro LENTO = acima de SLOW_K × o tempo do teto de FPS (30 FPS: 38 ms — um quadro que perde a vez de 33 ms já passa disso).
	static get SLOW_K() { return 1.15; }
	// [id, o aviso, só com placa de vídeo?]
	static get STEPS() {
		return [
			['npc3d', 'personagens com menos detalhe', true],
			['shadow512', 'sombras reduzidas', false],
			['scale85', 'resolução a 85%', true],
			['fill', 'sem antisserrilhado, brilho e fachadas simples', true],
			['noShadow', 'sem sombras', false],
			['npc3dOff', 'personagens com pouco detalhe', true],
			['scale70', 'resolução a 70%', true],
			['cover', 'sem vegetação rasteira', true],
			['scale58', 'resolução a 58%', true],
		];
	}

	// ESCADA DE PROCESSADOR (aparelho com CPU fraca: o trabalho do quadro — Perf.frameAvg — passa de 85% do tempo do quadro): os
	// degraus de placa de vídeo acima não ajudam aí. Estes aliviam o JavaScript: a pose de quem está longe menos vezes, menos movimento
	// na rua e a distância de visão (menos prédios, carros e pessoas por quadro). Também só com placa de vídeo de verdade.
	static get CPU_STEPS() {
		return [
			['anim', 'animação de quem está longe mais leve'],
			['life', 'menos movimento na rua'],
			['dist', 'distância de visão menor'],
			['dist2', 'distância de visão bem menor'],
			['pecas', 'menos peças miúdas nas casas e sem pássaros'],
			['near', 'quem está longe se mexe com menos detalhe'],
		];
	}

	constructor(game) {
		this.g = game;
		this.level = 0; this.cpuLevel = 0; this.nLate = 0; this.lateBad = 0;
		this.acc = 0; this.n = 0; this.nSlow = 0; this.bad = 0; this.cool = 6;        // 6 s de carência no início (carregamento e aquecimento de shaders)
		this.slow = 1000 / Config.perf.fpsCap * AutoQuality.SLOW_K;                  // média de ms por quadro acima disto = quadro "ruim"
		this.off = location.search.includes('full') || ((typeof Store !== 'undefined' && (Store.getJSON('settings', null) || {}).gfx) || {}).autoQ === false;      // (Ajustes › Gráficos avançados)
		this.gpuSteps = !(typeof Graphics !== 'undefined' && Graphics.software);
		this.skip = new Set();                                         // degraus que não valem neste preset
		if (Config.perf.shadows === false) { this.skip.add('shadow512').add('noShadow'); this._shadowsOff(); }      // (Low graphics preset: no sun shadows at all)
		this._resume();
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
		if (!s || s.sig !== this._sig()) return;
		for (let c = 0; c < (s.cpu | 0) - 1 && c < AutoQuality.CPU_STEPS.length; c++) { this.cpuLevel = c + 1; try { this._cpuApply(AutoQuality.CPU_STEPS[c][0]); } catch (e) { console.warn('[QUALIDADE]', e); break; } }
		if (!(s.level > 1)) return;
		for (let n = this._next(); n && n < s.level; n = this._next()) { this.level = n; try { this._apply(n); } catch (e) { console.warn('[QUALIDADE]', e); break; } }
		if (this.level > 0) console.log(`[QUALIDADE] começa no degrau ${this.level} (a última sessão precisou do ${s.level})`);
	}
	_remember() { if (this.gpuSteps && typeof Store !== 'undefined') Store.setJSON('autoQuality', { sig: this._sig(), level: this.level, cpu: this.cpuLevel }); }

	// Desce um degrau da escada de processador (e avisa).
	_cpuDown() {
		const g = this.g, CS = AutoQuality.CPU_STEPS;
		if (this.cpuLevel >= CS.length) return;
		const [id, txt] = CS[this.cpuLevel++];
		try { this._cpuApply(id); } catch (e) { console.warn('[QUALIDADE]', e); }
		this._remember();
		// (a escada acabou no Low automático: a próxima abertura já vem no Mínimo — Graphics.init; escolher o nível à mão apaga o aviso)
		if (this.cpuLevel >= CS.length && typeof Graphics !== 'undefined' && Graphics.level === 'low' && !Graphics.minimal && Graphics.choice === 'auto' && typeof Store !== 'undefined') Store.setJSON('gfxMinNext', 1);
		console.log(`[QUALIDADE] processador no limite (${typeof Perf !== 'undefined' ? Perf.frameAvg.toFixed(1) : '?'} ms por quadro): ${txt}`);
		if (g._flash) g._flash(`Modo econômico: ${txt} para manter a fluidez`);
	}
	// Um degrau da escada de processador.
	_cpuApply(id) {
		const H = Config.camera && Config.camera.chase;
		if (id === 'anim' && typeof Char3D !== 'undefined') { Char3D.LOD_EVERY = Char3D.LOD_EVERY[1] > 1 ? [1, 2, 4, 6] : [1, 2, 3, 4]; if (!Char3D.safe) Char3D.lodBias *= 1.3; }
		else if (id === 'life' && typeof Life !== 'undefined') Life.forceLow = true;
		else if ((id === 'dist' || id === 'dist2') && H) { H.far = Math.min(H.far, Math.max(Config.perf.minimal ? 36 : 50, Math.round(H.far * 0.85))); H.near = Math.round(H.far * 0.45); }      // (−15%, até 50 m — 36 no Mínimo; nunca aumenta)
		else if (id === 'pecas') {
			const sc = this.g.scene;
			if (typeof Walls3D !== 'undefined') { Walls3D.minimal = true; if (Walls3D._built) Walls3D._tick(sc, true); }
			if (typeof Roofs3D !== 'undefined') { Roofs3D.noProps = true; if (Roofs3D._built) Roofs3D._tick(sc, true); }
			if (this.g.birds) { this.g.birds.enabled = false; if (typeof Animals3D !== 'undefined') Animals3D.clear('ave'); }
		}
		else if (id === 'near') { Config.perf.halfFar = true; Config.perf.halfFarR = Math.min(Config.perf.halfFarR || 22, Config.perf.minimal ? 6 : 12); }
	}

	// Chamado todo quadro com o dt REAL em segundos (antes do teto de 50 ms do jogo).
	tick(dtReal, paused) {
		if (this.off || paused || dtReal > 0.5) return;               // aba em segundo plano / menu: não conta
		if (typeof Interiors !== 'undefined' && Interiors.active) return;      // (dentro de loja o mundo não é desenhado: não mede nada)
		if (this.cool > 0) { this.cool -= dtReal; return; }
		const ms = dtReal * 1000;
		this.acc += ms; this.n++; if (ms > this.slow) this.nSlow++;
		if (ms > 1000 / Config.perf.fpsCap * 1.08) this.nLate = (this.nLate || 0) + 1;      // (perdeu a vez do quadro)
		if (this.acc < 1000) return;                                   // janela de 1 s
		const avg = this.acc / this.n, share = this.nSlow / this.n, late = (this.nLate || 0) / this.n;
		this.acc = 0; this.n = 0; this.nSlow = 0; this.nLate = 0;
		// PROCESSADOR NO LIMITE, MAS SÓ ÀS VEZES: a média cabe e ~1 quadro em 8 perde a vez (os picos de quem está perto do limite). A
		// regra de baixo (a maioria lenta) não pegaria isso; 3 s seguidos assim com a CPU como gargalo descem UM degrau da escada de
		// processador — que é quase invisível — e o ritmo fica estável.
		if (this.gpuSteps && late >= 0.12 && typeof Perf !== 'undefined' && Perf.frameAvg > 1000 / Config.perf.fpsCap * 0.6 && this.cpuLevel < AutoQuality.CPU_STEPS.length) {
			if (++this.lateBad >= 3) { this.lateBad = 0; this.cool = 4; this._cpuDown(); return; }
		} else this.lateBad = Math.max(0, (this.lateBad || 0) - 1);
		// Janela ruim = a MAIORIA dos quadros lentos, não só a média: um engasgo isolado (carregar um pedaço do mapa, compilar um shader)
		// puxa a média de uma máquina boa e não pode custar qualidade. Bem lento (menos da metade do ritmo, quase todo quadro) conta em
		// dobro: desce em 2 s.
		// (antes: lento = acima de 1,35× o tempo alvo e 60% dos quadros — no teto de 30 FPS isso aceitava ficar em 22–29 FPS sem baixar nada:
		// a 60 Hz um jogo que não cabe em 33 ms alterna quadros de 33 e 50 ms, e a média ficava abaixo de 45 ms)
		const slow = avg > this.slow && share >= 0.5, crawl = avg > this.slow * 1.6 && share >= 0.8;
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
		const N3 = Config.art && Config.art.char3d && Config.art.char3d.npc;
		// (sem 2,5D — Char3D.no2d: ninguém pode sumir; o degrau baixa o NÍVEL DE DETALHE mais cedo — lodBias — em vez de cortar bonecos)
		const no2d = typeof Char3D !== 'undefined' && Char3D.no2d;
		if (id === 'npc3d') { if (no2d) Char3D.lodBias *= 1.5; else if (N3) { N3.nearDist = Math.min(N3.nearDist || 17, 10); N3.midDist = Math.min(N3.midDist || 30, 20); N3.max = Math.ceil((N3.max | 0) / 2); } }      // (os bonecos de pontos: metade deles, os detalhados só bem perto)
		else if (id === 'npc3dOff') { if (no2d) Char3D.lodBias *= 2; else if (N3) { N3.nearDist = 6; N3.midDist = 14; N3.max = Math.min(N3.max | 0, 2); } }                // (só os 2 mais perto, quase todos com o modelo leve)
		else if (id === 'shadow512') { if (ge.shadowGenerator) ge.setShadowSize(512); }
		else if (id === 'noShadow') this._shadowsOff();
		else if (id === 'fill') {
			if (typeof Smooth !== 'undefined' && Smooth.pp && Smooth.pp.samples > 1) Smooth.pp.samples = 1;
			if (typeof Lighting !== 'undefined' && Lighting.bloomFx) Lighting.setBloom(false);      // (o brilho de verdade: volta ao brilho barato da gradação)
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
		// Degrau zero (quem começa a 60 FPS): volta ao teto de 30 sem perder nada da imagem.
		if (Config.perf.fpsCap > 30) {
			Config.perf.fpsCap = 30;
			this.slow = 1000 / Config.perf.fpsCap * AutoQuality.SLOW_K;
			console.log('[QUALIDADE] desempenho baixo: teto de 60 → 30 FPS');
			return;
		}
		// CPU no limite (o trabalho do quadro passa de 85% do tempo dele): os degraus de processador primeiro — os de placa não ajudam
		if (this.gpuSteps && typeof Perf !== 'undefined' && Perf.frameAvg > 1000 / Config.perf.fpsCap * 0.85 && this.cpuLevel < AutoQuality.CPU_STEPS.length) { this._cpuDown(); return; }
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
