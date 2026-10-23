// ============================================================================
// Footsteps — passos do jogador, sintetizados (Web Audio) e presos à ANIMAÇÃO: o som sai na FASE do ciclo em que o pé bate no chão
// (Footsteps.strikes: personagem 2,5D = calcanhar direito no início do ciclo e o esquerdo na metade, qualquer nº de quadros; boneco
// antigo, CharacterRig.gait = 0,25 e 0,75), então cai junto com o desenho — andando, correndo, carregando peso, vadeando.
//
// Cada passo = calcanhar (pancada) + ponta do pé (raspada), com o timbre do CHÃO e do CALÇADO:
//   chão:     asfalto/calçada · grama · folhas (mata) · areia · terra · cascalho · lama (mangue) · água rasa · madeira (casa) ·
//             piso de loja — e, chovendo, o respingo por cima no chão duro.
//   calçado:  tênis (abafado) · sapato social (salto estalando) · coturno (pesado) · chinelo (o "plec" da sola batendo no calcanhar).
//   correndo: mais forte e curto; com a bolsa pesada: pisada mais grave.
// ============================================================================

const Footsteps = {
	_phase: null,
	MARKS: [0.25, 0.75],                // boneco antigo (CharacterRig.gait): o pé direito bate em 0,25, o esquerdo em 0,75
	MARKS_25D: [0, 0.5],                // clipes de passada 2,5D (NpcGenAnims; medido: 0,98–1,0 e 0,48–0,5): direito no início, esquerdo na metade
	// Fases do ciclo do clipe `c` em que os pés tocam o chão: [[fase, lado (1 = direito, −1 = esquerdo)], …] (WaterFx usa também).
	strikes(c) { return c && c.npc ? this._S25 || (this._S25 = [[this.MARKS_25D[0], 1], [this.MARKS_25D[1], -1]]) : this._S || (this._S = [[this.MARKS[0], 1], [this.MARKS[1], -1]]); },
	// Clipes de passada que soam (andar/correr em qualquer arma e carga, subida, escalada, de lado, agachado, vadeando).
	GAIT: /^(walk|run|climb|strafe|sneak|wade$)/,

	// Chão sob o jogador.
	surface(game) {
		const pl = game.player, p = pl.position;
		if ((pl.depth || 0) > 0) return 'water';
		if (typeof HouseView !== 'undefined' && HouseView.inside) return 'wood';
		if (typeof Interiors !== 'undefined' && Interiors.active) return 'tile';
		if (pl.onDeck) return 'concrete';
		const blk = CityGrid._blockAtPoint ? CityGrid._blockAtPoint(p.x, p.z) : null;
		if (blk) {
			const s = blk.slab, inner = p.x > s[0] + 2.2 && p.x < s[2] - 2.2 && p.z > s[1] + 2.2 && p.z < s[3] - 2.2;      // (borda = calçada)
			const ground = (CityGrid.BIOMES[blk.biome] || {}).ground;
			if (inner && ground === 'grass') return blk.biome === 'forest' ? 'leaves' : 'grass';
			if (inner && ground === 'sand') return 'sand';
			if (blk.biome === 'favela') return 'dirt';
			return 'concrete';
		}
		const B = WorldMap.B;
		switch (WorldMap.biomeAt(p.x, p.z)) {
			case B.SAND: return 'sand';
			case B.GRASS: case B.FARM: case B.SCRUB: return 'grass';
			case B.FOREST: return 'leaves';
			case B.SWAMP: return 'mud';
			case B.ROCK: return 'gravel';
			case B.FAVELA: return 'dirt';
			default: return 'concrete';                                         // ruas, estradas, centro
		}
	},

	shoe() {
		const id = typeof Outfit !== 'undefined' ? Outfit.worn.shoes : '';
		return id === 'chinelo' ? 'flip' : id === 'coturno' ? 'boot' : id === 'sapato_social' ? 'dress' : 'sneaker';
	},

	update(game, dt) {
		const pl = game.player;
		if (!AudioFX._ok() || game.mode !== 'player' || !pl || !pl.alive || pl.frozen || pl.swimming || !(pl.state === 'walk' || pl.state === 'jog' || pl.state === 'sprint' || pl.state === 'wade' || pl.state === 'sneak')) { this._phase = null; return; }
		const a = pl.actor, c = a && a.clip, name = a && a.clipName;
		if (!c || !c.loop || !c.frames || !this.GAIT.test(name || '')) { this._phase = null; return; }
		const ph = a.phase;                                                                 // (0..1; clipe tocado ao contrário: o tempo é negativo)
		if (this._phase != null) {
			let p0 = this._phase, p1 = ph;
			if ((((ph - p0) % 1) + 1.5) % 1 - 0.5 < 0) { p0 = ph; p1 = this._phase; }      // andando para trás no ciclo: confere o trecho ao contrário
			for (const [m] of this.strikes(c)) if (p1 >= p0 ? (p0 < m && p1 >= m) : (p0 < m || p1 >= m)) this.step(game, pl.state === 'sprint' || /^run/.test(name), pl.state === 'sneak');
		}
		this._phase = ph;
	},

	// Um pedaço de ruído filtrado com envelope, agendado em `at` (s, relógio do áudio).
	_hit(at, { vol, dur, f0, f1 = f0, type = 'lowpass', q = 0.8, att = 0.002 }) {
		const ctx = AudioFX.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
		src.buffer = AudioFX._noise();
		f.type = type; f.Q.value = q;
		f.frequency.setValueAtTime(f0, at); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), at + dur);
		g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), at + att); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
		src.connect(f); f.connect(g); g.connect(this._out());
		src.start(at, Math.random() * 1.0); src.stop(at + dur + 0.03);
	},
	_tone(at, f0, f1, dur, vol) {                                               // rangido / chiado de borracha
		const ctx = AudioFX.ctx, o = ctx.createOscillator(), g = ctx.createGain();
		o.type = 'sine'; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + dur);
		g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
		o.connect(g); g.connect(this._out()); o.start(at); o.stop(at + dur + 0.02);
	},
	_out() {
		if (this._bus && this._bus.context === AudioFX.ctx) return this._bus;
		const g = AudioFX.ctx.createGain(); g.gain.value = 1; g.connect(AudioFX.master);
		return (this._bus = g);
	},

	step(game, run, quiet = false) {
		if (!AudioFX._ok()) return;
		const surf = this.surface(game), shoe = this.shoe(), t = AudioFX.ctx.currentTime + 0.005;
		const heavy = Math.min(1, Math.max(0, ((game.player.loadRatio || 0) - 0.4) / 0.8));       // bolsa pesada: pisada mais grave
		const V = (run ? 1.45 : 1) * (quiet ? 0.3 : 1) * (0.11 + 0.05 * heavy) * (0.85 + Math.random() * 0.3), D = run ? 0.85 : 1, toe = run ? 0.035 : 0.06;      // (agachado: pisada macia)
		const low = 1 - 0.3 * heavy;
		const S = { sneaker: { thump: 0.8, click: 0.25, lp: 1500 }, dress: { thump: 0.6, click: 1.0, lp: 2600 }, boot: { thump: 1.25, click: 0.45, lp: 1100 }, flip: { thump: 0.5, click: 0.2, lp: 1300 } }[shoe];
		const hard = surf === 'concrete' || surf === 'tile' || surf === 'wood';
		switch (surf) {
			case 'concrete': case 'tile': {
				this._hit(t, { vol: V * 2.2 * S.thump, dur: 0.05 * D, f0: S.lp * low, f1: 160, att: 0.0015 });
				this._hit(t, { vol: V * (surf === 'tile' ? 1.6 : 1.1) * S.click, dur: 0.018, f0: surf === 'tile' ? 4800 : 3600, type: 'bandpass', q: 2.4, att: 0.001 });
				this._hit(t + toe, { vol: V * 0.8 * S.thump, dur: 0.035 * D, f0: 2200, f1: 900, type: 'bandpass', q: 1 });
				if (shoe === 'sneaker' && surf === 'tile' && run && Math.random() < 0.18) this._tone(t + toe, 2300, 2700, 0.07, V * 0.25);      // tênis chiando no piso
				break;
			}
			case 'wood': {
				this._hit(t, { vol: V * 2.4 * S.thump, dur: 0.09 * D, f0: 240 * low, type: 'bandpass', q: 3.5, att: 0.002 });
				this._hit(t, { vol: V * 0.9 * S.click, dur: 0.02, f0: 2600, type: 'bandpass', q: 2 });
				this._hit(t + toe, { vol: V * 0.6, dur: 0.04, f0: 1400, f1: 700, type: 'bandpass', q: 1.2 });
				if (Math.random() < 0.06) this._tone(t + 0.05, 420 + Math.random() * 200, 300, 0.22, V * 0.08);                    // tábua rangendo
				break;
			}
			case 'grass': case 'leaves': {
				const br = surf === 'leaves' ? 1.35 : 1;
				this._hit(t, { vol: V * 1.3 * S.thump, dur: 0.06, f0: 420 * low, f1: 90 });
				for (let i = 0; i < (surf === 'leaves' ? 5 : 3); i++) this._hit(t + 0.012 + i * (0.016 + Math.random() * 0.014), { vol: V * (0.7 + Math.random() * 0.5) * br, dur: 0.03 + Math.random() * 0.03, f0: 2600 * br + Math.random() * 1800, type: 'bandpass', q: 0.9 });
				break;
			}
			case 'sand': {
				this._hit(t, { vol: V * 1.4, dur: 0.13 * D, f0: 1100, f1: 300, att: 0.012 });
				this._hit(t + 0.02, { vol: V * 0.55, dur: 0.09, f0: 2600, type: 'bandpass', q: 0.6, att: 0.01 });
				break;
			}
			case 'dirt': case 'gravel': {
				this._hit(t, { vol: V * 1.8 * S.thump, dur: 0.06 * D, f0: 700 * low, f1: 110 });
				const n = surf === 'gravel' ? 6 : 3;
				for (let i = 0; i < n; i++) this._hit(t + 0.006 + i * (0.011 + Math.random() * 0.012), { vol: V * (surf === 'gravel' ? 0.9 : 0.55) * (0.6 + Math.random() * 0.6), dur: 0.018 + Math.random() * 0.02, f0: (surf === 'gravel' ? 3600 : 2200) + Math.random() * 1600, type: 'bandpass', q: 1.6 });
				break;
			}
			case 'mud': {
				this._hit(t, { vol: V * 1.6, dur: 0.16, f0: 900, f1: 260, type: 'bandpass', q: 5, att: 0.008 });
				this._hit(t + 0.05, { vol: V * 0.7, dur: 0.12, f0: 600, f1: 1500, type: 'bandpass', q: 4, att: 0.01 });          // sucção ao tirar o pé
				break;
			}
			case 'water': {                                                     // raso: mais grave e arrastado quanto mais fundo (AudioFX.waterWade)
				const p = game.player.position;
				AudioFX.waterWade(p.x, p.z, (game.player.depth || 0) / Config.water.wadeDepth, run, 1);
				break;
			}
		}
		// chinelo: a sola bate de volta no calcanhar ("plec")
		if (shoe === 'flip' && surf !== 'water' && surf !== 'mud') this._hit(t + (run ? 0.05 : 0.085), { vol: V * 1.5, dur: 0.025, f0: 2600, type: 'bandpass', q: 0.7, att: 0.001 });
		// chuva: respingo no chão duro e na rua
		const wet = Weather.cur ? Weather.cur.k : 0;
		if (wet > 0.2 && (hard && surf !== 'tile' && surf !== 'wood' || surf === 'dirt')) this._hit(t + 0.01, { vol: V * 1.2 * wet, dur: 0.11, f0: 2400, f1: 900, type: 'bandpass', q: 0.9, att: 0.004 });
	},
};
