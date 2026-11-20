// ============================================================================
// Radio — o RÁDIO DO CARRO: estações com música GERADA no jogo (Web Audio, como todo o som do jogo — nada a mais para baixar).
//   • BAILE 150 FM (105,5): funk carioca — tamborzão de 808, atabaque, palma, grave colado no bumbo, a "corneta" de sintetizador e o
//     vocal picado ("ê", "ah") nas partes de cima.
//   • PAGODE DA LAJE (102,7): pagode — surdo, pandeiro, tamborim no telecoteco, cavaquinho batendo os acordes, baixo andando, palmas e
//     o solo de cavaco nas partes de cima.
//   • NEON 99 (99,9): eletrônica — bumbo reto, contratempo, baixo no contratempo, acordes que "respiram" com o bumbo e arpejo.
//   • RÁDIO CIDADE (98,1): notícias — a trilha de plantão por baixo e um boletim a cada ~25 s (News: o que aconteceu na cidade, inclusive o
//     que VOCÊ fez), lido em voz alta quando o aparelho tem voz em português.
//   Cada MÚSICA sorteia andamento, tom, progressão e variações, em partes (introdução, A, B, A, B, final): 1–2 min, com a vinheta da
//   estação entre uma e outra e o nome da faixa (inventada) no cartão.
//   Só dentro do CARRO (moto, bicicleta e barco não têm). Cada carro guarda a sua estação: o roubado do trânsito vem com a que o dono
//   ouvia (sorteada, às vezes desligado). Troca: R (teclado), ←/→ (controle), ⋯ › RÁDIO (celular). Volume: Ajustes › Rádio do carro.
//   O boletim de notícias (News) entra em qualquer estação: a música abaixa enquanto o cartão está na tela.
// ============================================================================

const Radio = {
	STATIONS: [
		{ id: 'baile', name: 'Baile 150 FM', freq: '105,5', color: '#f472b6', icon: '🔊', tag: 'o batidão da favela' },
		{ id: 'pagode', name: 'Pagode da Laje', freq: '102,7', color: '#fbbf24', icon: '🪕', tag: 'pagode de mesa de bar' },
		{ id: 'neon', name: 'Neon 99', freq: '99,9', color: '#22d3ee', icon: '🌃', tag: 'eletrônica para a madrugada' },
		{ id: 'cidade', name: 'Rádio Cidade', freq: '98,1', color: '#a3e635', icon: '📰', tag: 'notícias, trânsito e tempo' },
	],
	level: 0.5,            // volume (Ajustes): 0 = mudo … 1
	cur: -1,               // estação tocando (índice em STATIONS) ou -1 (desligado / fora do carro)
	car: null,             // o carro com o rádio ligado agora
	sess: null,            // a sessão da estação: { g (ganho), st, song, step, next }
	notes: 0,              // notas agendadas (testes)
	songs: 0,              // músicas começadas (testes)

	get playing() { return !!this.sess && !!this.car; },
	get station() { return this.cur >= 0 ? this.STATIONS[this.cur] : null; },
	get label() { const s = this.station; return s ? `${s.name.toUpperCase()} ${s.freq}` : null; },

	// O carro tem rádio? (moto, bicicleta, barco e helicóptero não)
	has(car) { return !!car && !car.isBike && !(car.spec && (car.spec.boat || car.spec.bike)) && !car.isChopper; },

	// ------------------------------------------------------------------ por quadro (Game)
	update(g, dt) {
		const car = g.mode === 'car' && this.has(g.activeCar) && !g.activeCar.destroyed ? g.activeCar : null;
		if (car !== this.car) {
			this.car = car;
			if (car && car.radio === undefined) car.radio = Math.random() < 0.12 ? -1 : Math.floor(Math.random() * this.STATIONS.length);      // (a estação do dono)
			this._switch(car ? car.radio : -1, !!car);
		}
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
	_setup() {
		if (this.out || !this._ok()) return !!this.out;
		const ctx = AudioFX.ctx;
		this.mix = ctx.createGain();                                     // (as estações tocam aqui; o boletim abaixa este ganho)
		const comp = ctx.createDynamicsCompressor();
		comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.16;
		const lo = ctx.createBiquadFilter(); lo.type = 'lowshelf'; lo.frequency.value = 110; lo.gain.value = 3;       // alto-falante de porta: grave
		const hi = ctx.createBiquadFilter(); hi.type = 'highshelf'; hi.frequency.value = 5500; hi.gain.value = -5;     // ...e o agudo abafado
		this.out = ctx.createGain(); this.out.gain.value = 0;
		this.mix.connect(comp); comp.connect(lo); lo.connect(hi); hi.connect(this.out); this.out.connect(AudioFX.master);
		this._timer = setInterval(() => { try { this._pump(); } catch (e) { /* (áudio não pode derrubar o jogo) */ } }, 90);
		return true;
	},
	_vol() { return 0.34 * this.level; },
	setLevel(v) { this.level = Math.max(0, Math.min(1, v)); if (this.out && this.sess) this.out.gain.setTargetAtTime(this._vol(), AudioFX.ctx.currentTime, 0.1); },

	// Liga a estação i (−1 = desliga). show: mostra o cartão (trocou de estação / entrou no carro).
	_switch(i, show) {
		this.cur = i;
		if (!this._setup()) { if (show) this._card(); return; }
		const ctx = AudioFX.ctx, t = ctx.currentTime;
		if (this.sess) { const s = this.sess; s.g.gain.setTargetAtTime(0, t, 0.04); setTimeout(() => { try { s.g.disconnect(); } catch (e) { /* ok */ } }, 700); this.sess = null; }
		this.out.gain.setTargetAtTime(i >= 0 && this.car ? this._vol() : 0, t, 0.08);
		if (show) this._card();
		if (i < 0 || !this.car) return;
		this._static(t, 0.28);                                           // (o chiado da sintonia)
		const g = ctx.createGain(); g.connect(this.mix);
		this.sess = { g, st: this.STATIONS[i], song: null, step: 0, next: t + 0.3, jingle: false };
		this._pump();
	},

	// ------------------------------------------------------------------ o relógio da música (setInterval: não depende do FPS)
	_pump() {
		const S = this.sess;
		if (!S || !this._ok() || AudioFX._paused) return;
		const ctx = AudioFX.ctx;
		if (S.next < ctx.currentTime - 0.25) S.next = ctx.currentTime + 0.05;    // (aba escondida / travada: retoma, sem despejar notas atrasadas)
		const horizon = ctx.currentTime + 0.35;
		let guard = 0;
		while (S.next < horizon && guard++ < 64) {
			if (!S.song) {                                                // vinheta + música nova
				const dur = this._jingle(S, S.next);
				S.song = this._newSong(S.st); S.step = 0; S.next += dur;
				this.songs++;
				this._card(S.song);
				continue;
			}
			const song = S.song, bar = Math.floor(S.step / 16);
			if (bar >= song.bars) { S.song = null; continue; }
			this.GEN[S.st.id].call(this, S, song, S.step % 16, bar, S.next, song.part(bar));
			S.next += song.stepDur(S.step);
			S.step++;
		}
	},

	// ------------------------------------------------------------------ músicas
	_rand(a) { return a[Math.floor(Math.random() * a.length)]; },
	_newSong(st) {
		const R = (a) => this._rand(a), sec = [['intro', 4], ['A', 8], ['B', 8], ['A', 8], ['B', 8], ['out', 4]];
		if (Math.random() < 0.4) sec.splice(4, 0, ['A', 4]);
		const parts = []; for (const [p, n] of sec) for (let k = 0; k < n; k++) parts.push(p);
		const song = { bars: parts.length, part: (b) => parts[Math.min(parts.length - 1, b)], swing: 0 };
		const T = this.TITLES[st.id];
		song.title = R(T.t); song.artist = R(T.a);
		if (st.id === 'baile') {
			song.bpm = R([128, 130, 130, 135, 150]); song.root = 33 + Math.floor(Math.random() * 6);          // (lá 1 … ré 2: o grave do 808)
			song.prog = R([[0, 0, 3, 3], [0, -2, -4, -2], [0, 3, -2, 0], [0, 0, -4, -5]]);
			song.kick = R([[0, 3, 6, 10, 12], [0, 3, 6, 10, 13], [0, 3, 7, 10, 12, 14], [0, 3, 6, 9, 12]]);
			song.tom = R([[7, 11, 14, 15], [5, 9, 13, 15], [7, 14], [2, 11, 15]]);
			song.riff = this._riff([0, 3, 5, 7, 10, 12], [0, 2, 3, 6, 8, 10, 11, 14], 5);
			song.vox = R([[0, 6, 10], [3, 10], [0, 4, 8, 12], [6, 14]]);
		} else if (st.id === 'pagode') {
			song.bpm = 92 + Math.floor(Math.random() * 12); song.root = 48 + Math.floor(Math.random() * 7); song.swing = 0.14;
			song.prog = R([[[0, 'M'], [9, 'm'], [2, 'm'], [7, '7']], [[0, 'M'], [9, '7'], [2, 'm'], [7, '7']], [[0, 'M'], [4, '7'], [9, 'm'], [7, '7']], [[2, 'm'], [7, '7'], [0, 'M'], [0, 'M']]]);
			song.strum = R([[0, 3, 6, 8, 11, 14], [0, 3, 6, 10, 12], [0, 2, 6, 8, 10, 14]]);
			song.solo = this._riff([0, 2, 4, 7, 9, 12, 14], [0, 2, 4, 6, 8, 10, 12, 14], 6);
		} else if (st.id === 'neon') {
			song.bpm = 118 + Math.floor(Math.random() * 7); song.root = 45 + Math.floor(Math.random() * 6);
			song.prog = R([[[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M']], [[0, 'm'], [-2, 'M'], [-4, 'M'], [-5, 'm']], [[0, 'm'], [3, 'M'], [-2, 'M'], [-4, 'M']]]);
			song.arp = R([[0, 1, 2, 1], [0, 1, 2, 3], [0, 2, 1, 3]]);
		} else {
			song.bpm = 100; song.root = 50; song.prog = [[0, 'M'], [5, 'M'], [-3, 'm'], [-5, 'M']]; song.bars = 16;
			song.part = () => 'A';
		}
		const S16 = 60 / song.bpm / 4;
		song.stepDur = (i) => song.swing ? S16 * (i % 2 ? 1 - song.swing : 1 + song.swing) : S16;
		return song;
	},
	// Uma frase de 1 compasso: `n` batidas em `steps`, nas notas `scale` (semitons acima da tônica).
	_riff(scale, steps, n) {
		const at = steps.slice().sort(() => Math.random() - 0.5).slice(0, n).sort((a, b) => a - b), m = {};
		let k = Math.floor(Math.random() * scale.length);
		for (const s of at) { k = Math.max(0, Math.min(scale.length - 1, k + Math.floor(Math.random() * 3) - 1)); m[s] = scale[k]; }
		return m;
	},
	_chord(root, q) {
		const iv = { M: [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10] }[q] || [0, 4, 7];
		return iv.map((x) => root + x);
	},
	_hz(n) { return 440 * Math.pow(2, (n - 69) / 12); },

	// ------------------------------------------------------------------ as estações (um passo de 16 avos por chamada)
	GEN: {
		// FUNK: tamborzão. intro = corneta + palma; A = tudo; B = + vocal picado e chimbal; final = bumbo e grave.
		baile(S, s, i, bar, t, part) {
			const d = S.g, root = s.root + s.prog[bar % 4], full = part === 'A' || part === 'B', ending = part === 'out';
			if ((full || ending) && s.kick.includes(i)) { this._kick(d, t, 46, 0.95, 0.42); this._sub(d, this._hz(root), t, 0.32, 0.5); }
			if (full && s.tom.includes(i)) this._tom(d, t, 120 + (i % 3) * 18, 0.42);
			if ((full || part === 'intro') && (i === 4 || i === 12)) this._clap(d, t, 0.42);
			if (full && bar % 4 === 3 && i === 14) this._clap(d, t, 0.3);
			if (part === 'B' ? i % 2 === 0 : (full && i % 4 === 2)) this._hat(d, t, part === 'B' ? 0.05 : 0.07, false);
			const r = s.riff[i];
			if (r !== undefined && (part === 'intro' || part === 'A' || (part === 'B' && bar % 2))) this._horn(d, this._hz(root + 24 + r), t, 0.11, 0.16);
			if (part === 'B' && s.vox.includes(i) && bar % 2 === 0) this._vox(d, this._hz(root + 31 + (i % 4 ? 0 : 5)), t, 0.16, i % 3 ? 'e' : 'a');
		},
		// PAGODE: intro = cavaco + pandeiro; A = tudo; B = + solo de cavaco e palmas; final = cavaco e surdo.
		pagode(S, s, i, bar, t, part) {
			const d = S.g, [ro, q] = s.prog[bar % s.prog.length], root = s.root + ro, ch = this._chord(root + 12, q);
			const full = part === 'A' || part === 'B';
			if (s.strum.includes(i)) this._strum(d, ch, t, i % 4 === 0 ? 0.12 : 0.085, i % 2 ? -1 : 1);
			this._pandeiro(d, t, i % 4 === 0 ? 1.3 : i % 4 === 3 ? 1 : 0.5, i % 4 === 0);
			if (full || part === 'out') { if (i === 4 || i === 12) this._surdo(d, t, 0.32, true); else if (i === 0 || i === 8) this._surdo(d, t, 0.16, false); }
			if (full && [0, 2, 5, 7, 9, 12, 14].includes(i)) this._tamborim(d, t, 0.09);
			if (full) {
				if (i === 0) this._bass(d, this._hz(root - 12), t, 0.3, 0.24);
				else if (i === 6) this._bass(d, this._hz(root - 5), t, 0.2, 0.2);
				else if (i === 10) this._bass(d, this._hz(root), t, 0.18, 0.18);
				else if (i === 14) { const nx = s.prog[(bar + 1) % s.prog.length][0] + s.root; this._bass(d, this._hz(nx - 13), t, 0.12, 0.17); }
			}
			if (part === 'B' && (i === 4 || i === 12)) this._clap(d, t, 0.22);
			const so = s.solo[i];
			if (part === 'B' && so !== undefined && bar % 2 === 1) this._pluck(d, this._hz(s.root + 24 + so), t, 0.25, 0.1);
		},
		// ELETRÔNICA: intro = acordes + chimbal; A = tudo; B = + arpejo e chimbal aberto; final = acordes + bumbo.
		neon(S, s, i, bar, t, part) {
			const d = S.g, [ro, q] = s.prog[bar % 4], root = s.root + ro, ch = this._chord(root + 12, q), full = part === 'A' || part === 'B';
			if (i === 0) this._pad(S, ch.map((n) => this._hz(n)), t, 16 * s.stepDur(0), part === 'intro' || part === 'out' ? 0.07 : 0.055);
			if ((full || part === 'out') && i % 4 === 0) { this._kick(d, t, 50, 0.85, 0.3); this._padDuck(S, t); }
			if (full && (i === 4 || i === 12)) this._clap(d, t, 0.28);
			if (i % 4 === 2) this._hat(d, t, part === 'B' ? 0.06 : 0.045, part === 'B');
			if (part === 'B' && i % 2 === 1) this._hat(d, t, 0.025, false);
			if (full && i % 4 === 2) this._bass(d, this._hz(root - 12 + (i === 14 ? 12 : 0)), t, 0.14, 0.26, 'sawtooth');
			if (part === 'B' || (part === 'A' && bar % 4 >= 2)) {
				const k = s.arp[i % s.arp.length] + (i >= 8 ? 1 : 0), n = ch[k % ch.length] + 12 * Math.floor(k / ch.length) + 12;
				if (part === 'B' || i % 2 === 0) this._lead(d, this._hz(n), t, 0.09, 0.05);
			}
		},
		// RÁDIO CIDADE: a trilha de plantão (tímpano, tique-taque e acorde) — os boletins entram por cima (_newsTick).
		cidade(S, s, i, bar, t) {
			const d = S.g, [ro, q] = s.prog[bar % 4], ch = this._chord(s.root + ro, q);
			if (i === 0) this._pad(S, ch.map((n) => this._hz(n)), t, 16 * s.stepDur(0), 0.035);
			if (i % 2 === 0) this._hat(d, t, i % 4 === 0 ? 0.03 : 0.015, false);
			if (i === 0 || i === 10) this._tom(d, t, 70, 0.3);
		},
	},

	// ------------------------------------------------------------------ instrumentos (cada nota = poucos nós, descartados no fim)
	_env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); },
	_osc(dest, type, f, t, dur, peak, a = 0.005, filt = null) {
		const ctx = AudioFX.ctx, o = ctx.createOscillator(), g = ctx.createGain();
		o.type = type; o.frequency.setValueAtTime(f, t);
		this._env(g, t, a, peak, dur);
		if (filt) { const f2 = ctx.createBiquadFilter(); f2.type = filt[0]; f2.frequency.value = filt[1]; f2.Q.value = filt[2] || 0.7; o.connect(f2); f2.connect(g); } else o.connect(g);
		g.connect(dest); o.start(t); o.stop(t + dur + 0.03);
		this.notes++;
		return o;
	},
	_noiseHit(dest, t, dur, peak, type, f, q = 0.8) {
		const ctx = AudioFX.ctx, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
		s.buffer = AudioFX._noise(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
		g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		s.connect(fl); fl.connect(g); g.connect(dest); s.start(t, Math.random() * 0.8); s.stop(t + dur + 0.02);
		this.notes++;
	},
	_kick(d, t, f, vol, dur) { const o = this._osc(d, 'sine', f * 3, t, dur, vol, 0.002); o.frequency.exponentialRampToValueAtTime(f, t + 0.07); },
	_sub(d, f, t, vol, dur) { this._osc(d, 'sine', f, t, dur, vol, 0.01); },
	_tom(d, t, f, vol) { const o = this._osc(d, 'sine', f * 1.6, t, 0.22, vol, 0.002); o.frequency.exponentialRampToValueAtTime(f, t + 0.05); this._noiseHit(d, t, 0.03, vol * 0.25, 'bandpass', 900); },
	_clap(d, t, vol) { for (let k = 0; k < 3; k++) this._noiseHit(d, t + k * 0.011, k === 2 ? 0.13 : 0.02, vol * (k === 2 ? 1 : 0.7), 'bandpass', 1300, 1.1); },
	_hat(d, t, vol, open) { this._noiseHit(d, t, open ? 0.2 : 0.045, vol, 'highpass', 7000); },
	_horn(d, f, t, vol, dur) { this._osc(d, 'sawtooth', f, t, dur, vol, 0.008, ['bandpass', f * 2.2, 1.4]); this._osc(d, 'sawtooth', f * 1.005, t, dur, vol * 0.6, 0.008, ['lowpass', 2400]); },
	// vocal picado: dente de serra por dois filtros nas formantes da vogal ("a", "e")
	_vox(d, f, t, vol, v) {
		const ctx = AudioFX.ctx, F = v === 'a' ? [800, 1200] : [450, 2000], o = ctx.createOscillator(), g = ctx.createGain();
		o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 0.97, t + 0.18);
		this._env(g, t, 0.01, vol, 0.2);
		for (const ff of F) { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = ff; b.Q.value = 6; o.connect(b); b.connect(g); }
		g.connect(d); o.start(t); o.stop(t + 0.24);
		this.notes++;
	},
	_pluck(d, f, t, vol, dur) { this._osc(d, 'triangle', f, t, dur, vol, 0.003); this._osc(d, 'square', f * 2, t, dur * 0.5, vol * 0.18, 0.002, ['lowpass', 3000]); },
	_strum(d, notes, t, vol, dir) { const N = dir > 0 ? notes : notes.slice().reverse(); N.forEach((n, k) => this._pluck(d, this._hz(n + 12), t + k * 0.009, vol, 0.16)); },
	_pandeiro(d, t, k, thump) { this._noiseHit(d, t, 0.05, 0.05 * k, 'bandpass', 6500, 1.5); if (thump) this._osc(d, 'sine', 160, t, 0.08, 0.12, 0.002); },
	_surdo(d, t, vol, open) { const o = this._osc(d, 'sine', 95, t, open ? 0.45 : 0.12, vol, 0.003); o.frequency.exponentialRampToValueAtTime(62, t + 0.12); },
	_tamborim(d, t, vol) { this._osc(d, 'triangle', 1150, t, 0.04, vol, 0.001); this._noiseHit(d, t, 0.02, vol * 0.4, 'highpass', 4000); },
	_bass(d, f, t, dur, vol, type = 'triangle') { this._osc(d, type, f, t, dur, vol, 0.006, type === 'sawtooth' ? ['lowpass', 420, 2] : ['lowpass', 900]); },
	_lead(d, f, t, dur, vol) { this._osc(d, 'square', f, t, dur, vol, 0.004, ['lowpass', 2600, 1.2]); },
	// acordes longos (eletrônica, plantão) num ganho próprio da sessão: o bumbo abaixa e solta (_padDuck: o "sidechain")
	_pad(S, F, t, dur, vol) {
		const ctx = AudioFX.ctx;
		if (!S.pad) { S.pad = ctx.createGain(); S.pad.connect(S.g); }
		for (const f of F) for (const det of [-6, 6]) {
			const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
			o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det; lp.type = 'lowpass'; lp.frequency.value = 1100;
			g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.4, dur * 0.3)); g.gain.setValueAtTime(vol, t + dur * 0.85); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
			o.connect(lp); lp.connect(g); g.connect(S.pad); o.start(t); o.stop(t + dur + 0.05);
			this.notes++;
		}
	},
	_padDuck(S, t) { if (!S.pad) return; const G = S.pad.gain; G.cancelScheduledValues(t); G.setValueAtTime(0.25, t); G.linearRampToValueAtTime(1, t + 0.22); },
	_static(t, dur) { this._noiseHit(this.out, t, dur, 0.3, 'bandpass', 2400, 0.4); },

	// Vinheta da estação (entre as músicas): um "varre" subindo e três notas — o motivo de cada uma. Devolve a duração (s).
	_jingle(S, t) {
		const d = S.g, M = { baile: [57, 64, 69], pagode: [60, 64, 67], neon: [57, 60, 64], cidade: [62, 69, 74] }[S.st.id];
		const ctx = AudioFX.ctx, o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
		o.type = 'sawtooth'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.45);
		lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(3000, t + 0.45);
		this._env(g, t, 0.05, 0.06, 0.5); o.connect(lp); lp.connect(g); g.connect(d); o.start(t); o.stop(t + 0.55);
		M.forEach((n, k) => { this._osc(d, 'triangle', this._hz(n + 12), t + 0.5 + k * 0.16, 0.5, 0.16); this._osc(d, 'sine', this._hz(n + 24), t + 0.5 + k * 0.16, 0.35, 0.05); });
		return 1.6;
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
	_card(song = null) {
		let el = document.getElementById('radioCard');
		if (!el) {
			const st = document.createElement('style');
			st.textContent = `#radioCard { position: fixed; left: 50%; top: 74px; transform: translate(-50%, -8px); z-index: 31; pointer-events: none; text-align: center; opacity: 0;
				transition: opacity .35s, transform .35s; padding: 8px 18px 9px; border-radius: 16px; background: var(--glass-2, rgba(12,16,24,.8)); border: 1px solid var(--line-2, rgba(255,255,255,.12));
				-webkit-backdrop-filter: var(--blur, blur(8px)); backdrop-filter: var(--blur, blur(8px)); box-shadow: 0 8px 24px rgba(0,0,0,.4); color: var(--tx, #e8eaf0); font: 500 12px var(--font, Inter, system-ui, sans-serif); max-width: min(420px, 86vw); }
				#radioCard.on { opacity: 1; transform: translate(-50%, 0); }
				#radioCard b { display: block; font: 800 16px var(--font-d, Inter, system-ui, sans-serif); letter-spacing: .04em; }
				#radioCard i { font-style: normal; opacity: .75; }`;
			document.head.appendChild(st);
			el = document.createElement('div'); el.id = 'radioCard'; document.body.appendChild(el);
		}
		const s = this.station, esc = (x) => String(x).replace(/[<>&]/g, '');
		if (!this.car) { el.classList.remove('on'); return; }
		if (!s) el.innerHTML = '<b style="color:#94a3b8">📻 Rádio desligado</b><i>R / ←→ troca a estação</i>';
		else if (song && song.title) el.innerHTML = `<b style="color:${s.color}">${s.icon} ${esc(s.name)} <small style="font-size:11px;opacity:.7">${s.freq}</small></b>${s.id === 'cidade' ? esc(song.title) : `${esc(song.title)} <i>— ${esc(song.artist)}</i>`}`;
		else el.innerHTML = `<b style="color:${s.color}">${s.icon} ${esc(s.name)} <small style="font-size:11px;opacity:.7">${s.freq}</small></b><i>${esc(s.tag)}</i>`;
		el.classList.add('on');
		clearTimeout(this._ct); this._ct = setTimeout(() => el.classList.remove('on'), song ? 3800 : 2600);
	},

	// Nomes inventados (faixa, artista) por estação.
	TITLES: {
		baile: {
			t: ['Passinho do Viaduto', 'Baile da Orla', 'Bonde do Asfalto', 'Tá Tranquilo no Morro', 'Rajada de Grave', 'Fuga de 150', 'Montagem do Plantão', 'Laje Iluminada', 'Tamborzão da Madrugada', 'Sextou no Morro'],
			a: ['MC Bigode do Morro', 'MC Lukinhas', 'DJ Rato 22', 'MC Pretinha da Leste', 'DJ Pancadão', 'MC Fumaça', 'Os Mlk do Passinho'],
		},
		pagode: {
			t: ['Saudade na Laje', 'Churrasco de Domingo', 'Coração de Cavaco', 'Mesa de Bar', 'Fim de Tarde na Orla', 'Promessa de Pagodeiro', 'Roda no Quintal', 'Cerveja e Saudade'],
			a: ['Grupo Sorriso Largo', 'Os Batuqueiros', 'Grupo Toque Manso', 'Pagode do Seu Zé', 'Grupo Raiz da Laje', 'Trio Cavaco de Ouro'],
		},
		neon: {
			t: ['Avenida Neon', 'Túnel 3AM', 'Lagoa Elétrica', 'Viaduto Infinito', 'Madrugada Cromada', 'Luzes do Porto', 'Sinal Vermelho', 'Orla em Neon'],
			a: ['Kaleidoskópio', 'DJ Vapor', 'Synthia Rio', 'Noite Alta', 'Os Cromados', 'Pixel Carioca'],
		},
		cidade: {
			t: ['Plantão da Cidade', 'Trânsito Agora', 'Giro de Notícias', 'Boletim da Tarde', 'Cidade em Foco'],
			a: ['Rádio Cidade'],
		},
	},
};
