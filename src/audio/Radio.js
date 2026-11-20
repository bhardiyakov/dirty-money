// ============================================================================
// Radio — o RÁDIO DO CARRO: 4 estações tocando MÚSICAS DE VERDADE com licença livre (Creative Commons — Atribuição; créditos no Guia ›
// Rádio e músicas e em assets/music/CREDITOS.md). Os arquivos ficam em assets/music/ (mono, 64 kbps, volume igualado).
//   • BAILE 150 FM (105,5): funk/phonk brasileiro.          • PAGODE DA LAJE (102,7): samba.
//   • NEON 99 (99,9): eletrônica.                           • RÁDIO CIDADE (98,1): bossa por baixo e um boletim a cada ~25 s (News: o que
//     aconteceu na cidade, inclusive o que VOCÊ fez), lido em voz alta quando o aparelho tem voz em português.
//   Como uma rádio de verdade, cada estação SEGUE TOCANDO enquanto você ouve outra: cada uma tem a sua lista (embaralhada a cada jogo) num
//   relógio próprio; sintonizar entra no meio da faixa que estiver no ar. Entre uma faixa e outra, a vinheta da estação. O cartão mostra a
//   faixa e o autor (a atribuição que a licença pede).
//   Só dentro do CARRO (moto, bicicleta e barco não têm). Cada carro guarda a sua estação: o roubado do trânsito vem com a que o dono
//   ouvia (sorteada, às vezes desligado). Troca: R (teclado), ←/→ (controle), ⋯ › RÁDIO (celular). Volume: Ajustes › Rádio do carro.
//   O som sai por um <audio> ligado ao Web Audio (AudioFX): o "alto-falante de porta" (grave, agudo abafado), o volume do jogo e a pausa
//   valem para ele. O boletim de notícias (News) entra em qualquer estação: a música abaixa enquanto o cartão está na tela.
// ============================================================================

const Radio = {
	BASE: 'assets/music/',
	GAP: 1.6,              // a vinheta entre as faixas (s)
	// Faixas: f = arquivo (assets/music/f.mp3), t = título, a = autor, d = duração (s), l = licença, u = a página da obra, ai = o autor
	// declara que fez com IA (no todo ou em parte).
	STATIONS: [
		{
			id: 'baile', name: 'Baile 150 FM', freq: '105,5', color: '#f472b6', icon: '🔊', tag: 'funk e phonk brasileiro', bed: 1,
			tracks: [
				{ f: 'baile-heavy-bass-drop', t: 'Brazilian Phonk With Heavy Bass Drop', a: 'Alex Morgan', d: 101.5, l: 'by-4.0', u: 'https://freemusicarchive.org/music/alex-morgan/phonk-drift/brazilian-phonk-with-heavy-bass-drop/', ai: true },
				{ f: 'baile-phonk-bounce', t: 'Brazilian Phonk Bounce for Dance Reels', a: 'Alex Morgan', d: 113.8, l: 'by-4.0', u: 'https://freemusicarchive.org/music/alex-morgan/phonk-drift/brazilian-phonk-bounce-for-dance-reels/', ai: true },
				{ f: 'baile-aura', t: 'Phonk Brazilian Aura Short Loop', a: 'Alex Morgan', d: 86.3, l: 'by-4.0', u: 'https://freemusicarchive.org/music/alex-morgan/phonk-drift/phonk-brazilian-aura-short-loop/', ai: true },
				{ f: 'baile-latin-industries', t: 'Latin Industries', a: 'Kevin MacLeod', d: 200.8, l: 'by-4.0', u: 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1200015' },
			],
		},
		{
			id: 'pagode', name: 'Pagode da Laje', freq: '102,7', color: '#fbbf24', icon: '🪕', tag: 'samba de mesa de bar', bed: 1,
			tracks: [
				{ f: 'pagode-samba-isobel', t: 'Samba Isobel', a: 'Kevin MacLeod', d: 250.2, l: 'by-4.0', u: 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1700071' },
				{ f: 'pagode-leblon', t: 'Leblon', a: 'Kevin MacLeod', d: 196.8, l: 'by-4.0', u: 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100866' },
				{ f: 'pagode-sambarama', t: 'Sambarama', a: 'Juanitos', d: 264.0, l: 'by-2.0-fr', u: 'https://freemusicarchive.org/music/Juanitos/Exotica/juanitos_-_04_-_sambarama/' },
				{ f: 'pagode-modern-jazz-samba', t: 'Modern Jazz Samba', a: 'Kevin MacLeod', d: 248.6, l: 'by-4.0', u: 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100153' },
				{ f: 'pagode-suco-de-abacaxi', t: 'Suco de Abacaxi', a: 'Guifrog', d: 200.5, l: 'by-3.0', u: 'https://freemusicarchive.org/music/Guifrog/Suco_de_Abacaxi/Guifrog_-_Suco_de_Abacaxi/' },
			],
		},
		{
			id: 'neon', name: 'Neon 99', freq: '99,9', color: '#22d3ee', icon: '🌃', tag: 'eletrônica para a madrugada', bed: 1,
			tracks: [
				{ f: 'neon-raving-energy', t: 'Raving Energy', a: 'Kevin MacLeod', d: 267.6, l: 'by-4.0', u: 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1900013' },
				{ f: 'neon-brain-dance', t: 'Brain Dance', a: 'Kevin MacLeod', d: 214.9, l: 'by-4.0', u: 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN2300006' },
				{ f: 'neon-laserpack', t: 'Laserpack', a: 'Kevin MacLeod', d: 185.7, l: 'by-4.0', u: 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1800018' },
				{ f: 'neon-ethernight-club', t: 'Ethernight Club', a: 'Kevin MacLeod', d: 305.7, l: 'by-4.0', u: 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN2100002' },
			],
		},
		{
			id: 'cidade', name: 'Rádio Cidade', freq: '98,1', color: '#a3e635', icon: '📰', tag: 'notícias, trânsito e tempo', bed: 0.6,      // (a música por baixo dos boletins)
			tracks: [
				{ f: 'cidade-bossa-antigua', t: 'Bossa Antigua', a: 'Kevin MacLeod', d: 283.4, l: 'by-4.0', u: 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1700069' },
				{ f: 'cidade-casa-bossa-nova', t: 'Casa Bossa Nova', a: 'Kevin MacLeod', d: 242.2, l: 'by-4.0', u: 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1600012' },
				{ f: 'cidade-brazilian-sunsets', t: 'Brazilian Sunsets', a: 'Ketsa', d: 212.1, l: 'by-4.0', u: 'https://freemusicarchive.org/music/Ketsa/cc-by-free-to-use-for-anything/brazilian-sunsets/' },
			],
		},
	],
	LICENSES: {
		'by-4.0': ['CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/'],
		'by-3.0': ['CC BY 3.0', 'https://creativecommons.org/licenses/by/3.0/'],
		'by-2.0-fr': ['CC BY 2.0 FR', 'https://creativecommons.org/licenses/by/2.0/fr/'],
	},
	level: 0.5,            // volume (Ajustes): 0 = mudo … 1
	cur: -1,               // estação tocando (índice em STATIONS) ou -1 (desligado / fora do carro)
	car: null,             // o carro com o rádio ligado agora
	clock: 0,              // o relógio das estações (s): anda com o jogo, também fora do carro
	now: null,             // o que está no ar: { st, k (posição na lista), tr (faixa) } — null entre faixas / desligado
	tracks: 0,             // faixas começadas (testes)

	get playing() { return this.cur >= 0 && !!this.car; },
	get station() { return this.cur >= 0 ? this.STATIONS[this.cur] : null; },
	get label() { const s = this.station; return s ? `${s.name.toUpperCase()} ${s.freq}` : null; },

	// O carro tem rádio? (moto, bicicleta, barco e helicóptero não)
	has(car) { return !!car && !car.isBike && !(car.spec && (car.spec.boat || car.spec.bike)) && !car.isChopper; },

	// ------------------------------------------------------------------ por quadro (Game)
	update(g, dt) {
		this.clock += dt || 0;
		const car = g.mode === 'car' && this.has(g.activeCar) && !g.activeCar.destroyed ? g.activeCar : null;
		if (car !== this.car) {
			this.car = car;
			if (car && car.radio === undefined) car.radio = Math.random() < 0.12 ? -1 : Math.floor(Math.random() * this.STATIONS.length);      // (a estação do dono)
			this._switch(car ? car.radio : -1, !!car);
		} else if (car && this.cur >= 0 && !this.out && this._ok()) this._switch(this.cur, false);      // (o som do jogo voltou: liga agora)
		if (this._duckT > 0) { this._duckT -= dt; if (this._duckT <= 0) this._duck(false); }
		if (car && this.cur === 3) this._newsTick(g, dt);
	},

	// Próxima (+1) / anterior (−1) estação, passando pelo "desligado".
	step(g, d = 1) {
		if (!this.car) return;
		const n = this.STATIONS.length + 1, i = ((this.cur + 1 + d) % n + n) % n - 1;      // (−1 = desligado)
		this.car.radio = i;
		this._switch(i, true);
	},

	_ok() { return typeof AudioFX !== 'undefined' && AudioFX._ok() && !!AudioFX.ctx; },
	// O caminho do som: <audio> → mix (o boletim abaixa este) → compressor → "alto-falante de porta" → out (volume) → AudioFX.master.
	_setup() {
		if (this.out || !this._ok()) return !!this.out;
		const ctx = AudioFX.ctx;
		this.el = new Audio(); this.el.preload = 'auto';
		this.el.addEventListener('ended', () => this._ended());
		this.el.addEventListener('error', () => this._ended(true));
		this.el.addEventListener('playing', () => { this._fails = 0; if (this._cardTr && this.now && this.now.tr === this._cardTr) this._card(this._cardTr); this._cardTr = null; });
		this.mix = ctx.createGain();
		const comp = ctx.createDynamicsCompressor();
		comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2;
		const lo = ctx.createBiquadFilter(); lo.type = 'lowshelf'; lo.frequency.value = 110; lo.gain.value = 3;       // alto-falante de porta: grave
		const hi = ctx.createBiquadFilter(); hi.type = 'highshelf'; hi.frequency.value = 5500; hi.gain.value = -5;     // ...e o agudo abafado
		this.bed = ctx.createGain();                                     // (Rádio Cidade: a música mais baixa, por baixo dos boletins)
		this.out = ctx.createGain(); this.out.gain.value = 0;
		ctx.createMediaElementSource(this.el).connect(this.bed); this.bed.connect(this.mix);
		this.mix.connect(comp); comp.connect(lo); lo.connect(hi); hi.connect(this.out); this.out.connect(AudioFX.master);
		this._timer = setInterval(() => { try { this._sync(); } catch (e) { /* (áudio não pode derrubar o jogo) */ } }, 250);
		return true;
	},
	_vol() { return 0.5 * this.level; },
	setLevel(v) { this.level = Math.max(0, Math.min(1, v)); if (this.out && this.playing) this.out.gain.setTargetAtTime(this._vol(), AudioFX.ctx.currentTime, 0.1); },

	// Liga a estação i (−1 = desliga). show: mostra o cartão (trocou de estação / entrou no carro).
	_switch(i, show) {
		this.cur = i;
		this._tok = (this._tok || 0) + 1;                                // (cancela a vinheta/faixa agendada da estação anterior)
		this.now = null; this._fails = 0;
		if (!this._setup()) { if (show) this._card(); return; }
		const ctx = AudioFX.ctx, t = ctx.currentTime;
		this.el.pause();
		this.out.gain.setTargetAtTime(i >= 0 && this.car ? this._vol() : 0, t, 0.08);
		if (show) this._card();
		if (i < 0 || !this.car) return;
		const st = this.STATIONS[i];
		this.bed.gain.setValueAtTime(st.bed, t);
		this._static(t, 0.28);                                           // (o chiado da sintonia)
		const w = this._where(st);
		if (w.wait > 0) this._later(w.wait, () => this._play(st, w.k, 0));          // (entre faixas: o fim da vinheta)
		else this._play(st, w.k, w.o);
	},

	// A lista da estação (embaralhada uma vez por jogo) e onde o relógio dela está agora: { k (posição), o (segundos dentro da faixa), wait
	// (> 0: na vinheta, falta isso para a próxima) }.
	_list(st) {
		if (!st.order) {
			st.order = st.tracks.map((_, i) => i).sort(() => Math.random() - 0.5);
			st.total = st.tracks.reduce((a, tr) => a + tr.d + this.GAP, 0);
			st.off = Math.random() * st.total;                           // (as estações não começam juntas)
		}
		return st.order;
	},
	_where(st) {
		const L = this._list(st);
		let p = (this.clock + st.off) % st.total;
		for (let k = 0; k < L.length; k++) {
			const d = st.tracks[L[k]].d;
			if (p < d - 3) return { k, o: p, wait: 0 };
			if (p < d + this.GAP) return { k: (k + 1) % L.length, o: 0, wait: Math.max(0.3, d + this.GAP - p) };
			p -= d + this.GAP;
		}
		return { k: 0, o: 0, wait: 0 };
	},
	_later(s, fn) { const tok = this._tok; setTimeout(() => { if (tok === this._tok) fn(); }, s * 1000); },

	// Põe no ar a faixa k da lista, a partir de `o` s (sintonizou no meio dela).
	_play(st, k, o) {
		if (!this.el || this.STATIONS[this.cur] !== st) return;
		const tr = st.tracks[this._list(st)[k]];
		this.now = { st, k, tr };
		this.el.src = this.BASE + tr.f + '.mp3' + (o > 1 ? '#t=' + o.toFixed(1) : '');
		this.tracks++;
		this._want = true;
		this._cardTr = tr;                                               // (o cartão da faixa quando ela começar a tocar de fato)
		this._sync();
	},
	// Acabou a faixa (ou o arquivo falhou — sem rede, por exemplo): a vinheta e a próxima. Falhou a lista inteira: a estação fica muda.
	_ended(fail) {
		const N = this.now;
		if (!N || !this.playing || this.STATIONS[this.cur] !== N.st) return;
		this.now = null; this._want = false;
		if (fail && (this._fails = (this._fails || 0) + 1) >= N.st.tracks.length) return;
		if (!fail && this._ok()) this._jingle(N.st, AudioFX.ctx.currentTime + 0.05);
		this._later(fail ? 2 : this.GAP, () => this._play(N.st, (N.k + 1) % N.st.order.length, 0));
	},
	// O <audio> acompanha o jogo: pausado no menu (AudioFX pausado), com o som desligado, com a aba escondida ou fora do carro.
	_sync() {
		const el = this.el;
		if (!el) return;
		const on = this._want && !!this.now && this.playing && this._ok() && !AudioFX._paused && !document.hidden;
		if (on && el.paused) { const p = el.play(); if (p && p.catch) p.catch(() => { /* (sem gesto do jogador ainda: tenta no próximo) */ }); }
		else if (!on && !el.paused) el.pause();
	},

	// ------------------------------------------------------------------ sons do próprio rádio (a sintonia e a vinheta)
	_env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); },
	_osc(dest, type, f, t, dur, peak, a = 0.005) {
		const ctx = AudioFX.ctx, o = ctx.createOscillator(), g = ctx.createGain();
		o.type = type; o.frequency.setValueAtTime(f, t);
		this._env(g, t, a, peak, dur);
		o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.03);
		return o;
	},
	_hz(n) { return 440 * Math.pow(2, (n - 69) / 12); },
	_static(t, dur) {
		const ctx = AudioFX.ctx, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
		s.buffer = AudioFX._noise(); fl.type = 'bandpass'; fl.frequency.value = 2400; fl.Q.value = 0.4;
		g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		s.connect(fl); fl.connect(g); g.connect(this.out); s.start(t, Math.random() * 0.8); s.stop(t + dur + 0.02);
	},
	// Vinheta da estação (entre as faixas): um "varre" subindo e três notas — o motivo de cada uma (GAP s).
	_jingle(st, t) {
		const d = this.mix, M = { baile: [57, 64, 69], pagode: [60, 64, 67], neon: [57, 60, 64], cidade: [62, 69, 74] }[st.id];
		const ctx = AudioFX.ctx, o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
		o.type = 'sawtooth'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.45);
		lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(3000, t + 0.45);
		this._env(g, t, 0.05, 0.06, 0.5); o.connect(lp); lp.connect(g); g.connect(d); o.start(t); o.stop(t + 0.55);
		M.forEach((n, k) => { this._osc(d, 'triangle', this._hz(n + 12), t + 0.5 + k * 0.16, 0.5, 0.16); this._osc(d, 'sine', this._hz(n + 24), t + 0.5 + k * 0.16, 0.35, 0.05); });
	},

	// ------------------------------------------------------------------ notícias (Rádio Cidade) e o boletim em qualquer estação
	_newsTick(g, dt) {
		this._newsT = (this._newsT == null ? 6 : this._newsT) - dt;
		if (this._newsT > 0 || typeof News === 'undefined' || !News.bulletin) return;
		this._newsT = 22 + Math.random() * 12;
		News.bulletin(g, true);
	},
	// News mostrou um boletim: a música abaixa enquanto o cartão está na tela; na Rádio Cidade, o locutor lê (se houver voz em português).
	onBulletin(text) {
		if (!this.playing) return;
		this._duck(true); this._duckT = 7;
		if (this.cur === 3) this._say(text);
	},
	_duck(on) { if (this.mix && AudioFX.ctx) this.mix.gain.setTargetAtTime(on ? 0.3 : 1, AudioFX.ctx.currentTime, 0.25); },
	_say(text) {
		try {
			const S = window.speechSynthesis;
			if (!S || typeof SpeechSynthesisUtterance === 'undefined' || this.level <= 0) return;
			const v = S.getVoices().find((x) => /^pt(-|_)BR/i.test(x.lang)) || S.getVoices().find((x) => /^pt/i.test(x.lang));
			if (!v) return;
			S.cancel();
			const u = new SpeechSynthesisUtterance(text);
			u.voice = v; u.lang = v.lang; u.rate = 1.05; u.volume = Math.min(1, (AudioFX.volume || 0.7) * (0.4 + this.level * 0.6));
			S.speak(u);
		} catch (e) { /* (sem voz: só o cartão) */ }
	},

	// ------------------------------------------------------------------ o cartão (estação e faixa)
	_card(tr = null) {
		let el = document.getElementById('radioCard');
		if (!el) {
			const st = document.createElement('style');
			st.textContent = `#radioCard { position: fixed; left: 50%; top: 74px; transform: translate(-50%, -8px); z-index: 31; pointer-events: none; text-align: center; opacity: 0;
				transition: opacity .35s, transform .35s; padding: 8px 18px 9px; border-radius: 16px; background: var(--glass-2, rgba(12,16,24,.8)); border: 1px solid var(--line-2, rgba(255,255,255,.12));
				-webkit-backdrop-filter: var(--blur, blur(8px)); backdrop-filter: var(--blur, blur(8px)); box-shadow: 0 8px 24px rgba(0,0,0,.4); color: var(--tx, #e8eaf0); font: 500 12px var(--font, Inter, system-ui, sans-serif); max-width: min(420px, 86vw); }
				#radioCard.on { opacity: 1; transform: translate(-50%, 0); }
				#radioCard b { display: block; font: 800 16px var(--font-d, Inter, system-ui, sans-serif); letter-spacing: .04em; }
				#radioCard i { font-style: normal; opacity: .75; }
				body.mobile #radioCard { top: auto; bottom: calc(max(8px, env(safe-area-inset-bottom)) + 38px); padding: 5px 12px 6px; font-size: 11px; }
				body.mobile #radioCard b { font-size: 13px; }`;
			document.head.appendChild(st);
			el = document.createElement('div'); el.id = 'radioCard'; document.body.appendChild(el);
		}
		const s = this.station, esc = (x) => String(x).replace(/[<>&]/g, '');
		if (!this.car) { el.classList.remove('on'); return; }
		const head = s && `<b style="color:${s.color}">${s.icon} ${esc(s.name)} <small style="font-size:11px;opacity:.7">${s.freq}</small></b>`;
		if (!s) el.innerHTML = '<b style="color:#94a3b8">📻 Rádio desligado</b><i>R / ←→ troca a estação</i>';
		else if (tr) el.innerHTML = `${head}♪ ${esc(tr.t)} <i>— ${esc(tr.a)}</i>`;
		else el.innerHTML = `${head}<i>${esc(s.tag)}</i>`;
		el.classList.add('on');
		clearTimeout(this._ct); this._ct = setTimeout(() => el.classList.remove('on'), tr ? 3800 : 2600);
	},

	// Os créditos (Guia › Rádio e músicas): faixa, autor, licença e a página da obra.
	creditsHtml() {
		const esc = (x) => String(x).replace(/[<>&"]/g, '');
		let h = '';
		for (const s of this.STATIONS) {
			h += `<h3>${s.icon} ${esc(s.name)} ${s.freq}</h3><table><tr><th>Faixa</th><th>Autor</th><th>Licença</th></tr>`;
			for (const tr of s.tracks) {
				const [ln, lu] = this.LICENSES[tr.l];
				h += `<tr><td><a href="${esc(tr.u)}" target="_blank" rel="noopener">${esc(tr.t)}</a></td><td>${esc(tr.a)}${tr.ai ? ' <small>(feita com IA)</small>' : ''}</td><td><a href="${lu}" target="_blank" rel="noopener">${ln}</a></td></tr>`;
			}
			h += '</table>';
		}
		return h;
	},
};
