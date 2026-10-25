// ============================================================================
// Ambience — o SOM DO LUGAR, sintetizado (Web Audio, sem arquivos), que muda com o lugar, a hora e o tempo. Roda num relógio
// próprio (~8×/s): continua com os mini-jogos abertos (o mundo para; o bar não fica mudo).
//   Camadas contínuas (ganho suave para o alvo): trânsito (ronco grave, mais no rush), multidão (burburinho: na rua comercial de dia;
//   dentro das lojas, cresce com a lotação), ondas (na orla), grilos (à noite, em bairro, parque, favela), zumbido de lâmpada
//   (mercado, farmácia, banco), a chuva abafada no telhado (dentro, chovendo).
//   Música: o RÁDIO DO BAR (pagode de cavaquinho e pandeiro, com som de caixinha), a batida da academia, o funk distante na favela à
//   noite (quando não tem baile).
//   Sons avulsos: buzina, freio de ônibus, cachorro latindo, passarinhos de manhã, gaivotas na praia, copos tilintando no bar e no
//   restaurante, o bipe do caixa.
// ============================================================================

const Ambience = {
    L: null, started: false, t: 0, oneT: {},

    start() {
        if (this.started) return;
        this.started = true;
        setInterval(() => { try { this._tick(0.12); } catch (e) { /* (áudio não pode derrubar o jogo) */ } }, 120);
    },
    _ok() { return typeof AudioFX !== 'undefined' && AudioFX._ok(); },

    // ------------------------------------------------------------------ camadas
    _layer(name, { type = 'lowpass', f = 400, q = 0.7, f2 = null, rate = 1 } = {}) {
        const ctx = AudioFX.ctx, src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), gain = ctx.createGain();
        src.buffer = this._brown(); src.loop = true; src.playbackRate.value = rate;
        flt.type = type; flt.frequency.value = f; flt.Q.value = q;
        gain.gain.value = 0;
        src.connect(flt);
        let last = flt;
        if (f2) { const f2n = ctx.createBiquadFilter(); f2n.type = 'highpass'; f2n.frequency.value = f2; flt.connect(f2n); last = f2n; }
        last.connect(gain); gain.connect(AudioFX.master);
        src.start(ctx.currentTime + Math.random() * 0.5);
        return { gain, flt, v: 0 };
    },
    // Ruído "marrom" (mais grave que o branco): fundo de trânsito, mar, multidão.
    _brown() {
        if (this._bBuf) return this._bBuf;
        const ctx = AudioFX.ctx, n = ctx.sampleRate * 3, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
        let last = 0;
        for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
        return (this._bBuf = b);
    },
    _setup() {
        if (this.L) return;
        this.L = {
            traffic: this._layer('traffic', { type: 'lowpass', f: 260, q: 0.6 }),
            crowd: this._layer('crowd', { type: 'bandpass', f: 650, q: 0.9, rate: 1.6 }),
            waves: this._layer('waves', { type: 'lowpass', f: 900, q: 0.5, rate: 0.9 }),
            roof: this._layer('roof', { type: 'lowpass', f: 700, q: 0.4, rate: 2.2 }),
        };
        const ctx = AudioFX.ctx;                                         // o zumbido da lâmpada fluorescente (120 Hz + harmônico)
        const hum = ctx.createGain(); hum.gain.value = 0; hum.connect(AudioFX.master);
        for (const [f, v] of [[120, 1], [240, 0.5], [360, 0.2]]) { const o = ctx.createOscillator(); o.frequency.value = f; const g = ctx.createGain(); g.gain.value = v; o.connect(g); g.connect(hum); o.start(); }
        this.L.hum = { gain: hum, v: 0 };
        this.radio = ctx.createGain(); this.radio.gain.value = 0;          // a música passa por um "alto-falante" pequeno
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 0.55;
        this.radio.connect(bp); bp.connect(AudioFX.master);
        this.music = ctx.createGain(); this.music.gain.value = 0; this.music.connect(AudioFX.master);       // (batida sem filtro: academia, funk longe)
        this.funkLp = ctx.createBiquadFilter(); this.funkLp.type = 'lowpass'; this.funkLp.frequency.value = 220;
        this.funk = ctx.createGain(); this.funk.gain.value = 0; this.funk.connect(this.funkLp); this.funkLp.connect(AudioFX.master);
    },
    _to(node, v, tc = 0.6) { if (!node) return; node.gain.setTargetAtTime(v, AudioFX.ctx.currentTime, tc); },

    // ------------------------------------------------------------------ onde estou, que horas são
    _where(g) {
        const P = g.player ? g.player.position : { x: 0, z: 0 }, out = { inside: !!(typeof Interiors !== 'undefined' && Interiors.active), shop: null, biome: null, district: null };
        if (out.inside) { out.shop = Interiors.active.shop; return out; }
        const b = typeof CityGrid !== 'undefined' ? CityGrid._blockAtPoint(P.x, P.z) : null;
        out.biome = b ? b.biome : null; out.district = b ? b.district : null;
        if (!this._beachT || performance.now() - this._beachT > 1500) {        // perto do mar? (amostra em volta)
            this._beachT = performance.now(); let n = 0;
            for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, q = CityGrid._blockAtPoint(P.x + Math.cos(a) * 45, P.z + Math.sin(a) * 45); if (!q || q.biome === 'beach') n++; }
            this._beach = n / 8;
        }
        out.beach = this._beach || 0;
        return out;
    },

    _tick(dt) {
        const g = window.game;
        if (!g || !g.dayNight || !this._ok()) return;
        this._setup();
        this.t += dt;
        const W = this._where(g), h = g.dayNight.hour, night = h >= 20 || h < 5, rain = typeof Weather !== 'undefined' && Weather.cur ? Weather.cur.k : 0;
        const dens = typeof StreetLife !== 'undefined' ? StreetLife.density(h, rain) : 1, L = this.L;
        const mini = (typeof Pool !== 'undefined' && Pool.active) || (typeof Truco !== 'undefined' && Truco.active) || (typeof Porrinha !== 'undefined' && Porrinha.active) || (typeof Domino !== 'undefined' && Domino.active);
        const duck = mini ? 0.55 : 1;                                     // (no mini-jogo o bar fica de fundo)
        let traffic = 0, crowd = 0, waves = 0, roof = 0, hum = 0, radio = 0, music = 0, funk = 0;
        if (W.inside) {
            const st = W.shop.style, n = typeof ShopLife !== 'undefined' && ShopLife.active ? ShopLife.agents.length : 3;
            traffic = 0.012;
            crowd = ['bar', 'burger', 'pizza', 'italian', 'japanese', 'bakery', 'fit'].includes(st) ? 0.012 + Math.min(0.05, n * 0.0045) : 0.006 + n * 0.0015;
            hum = ['mart', 'pharmacy', 'bank_branch', 'bank_hq', 'guns', 'clothes', 'jewelry'].includes(st) ? 0.006 : 0;
            radio = st === 'bar' ? 0.09 : ['burger', 'bakery', 'pizza'].includes(st) ? 0.045 : 0;
            music = st === 'gym' ? 0.08 : 0;
            roof = rain > 0.05 ? 0.05 * rain : 0;
            this._ones(g, W, h, night, true);
        } else {
            const city = W.biome && ['downtown', 'commercial', 'port', 'plaza', 'residential', 'industrial'].includes(W.biome);
            traffic = (city ? 0.07 : W.district === 'favela' ? 0.03 : 0.035) * Math.min(1.4, dens) * (night ? 0.6 : 1);
            crowd = (W.biome === 'commercial' || W.biome === 'downtown' || W.biome === 'plaza') && !night ? 0.025 * dens : W.district === 'favela' && !night ? 0.018 : 0;
            waves = 0.11 * W.beach * (0.75 + 0.25 * Math.sin(this.t * 0.9));
            funk = W.district === 'favela' && (h >= 21 || h < 4) && !(typeof Baile !== 'undefined' && Baile.on) ? 0.12 : 0;
            if (night && !mini) this._crickets(W);
            this._ones(g, W, h, night, false);
        }
        this._to(L.traffic.gain, traffic * duck); this._to(L.crowd.gain, crowd * duck); this._to(L.waves.gain, waves * duck, 0.3);
        this._to(L.roof.gain, roof * duck); this._to(L.hum.gain, hum * duck); this._to(this.radio, radio * duck, 0.4); this._to(this.music, music * duck, 0.4); this._to(this.funk, funk * duck, 1.2);
        // chuva: dentro, o som da rua some quase todo (o telhado é a camada `roof`)
        if (AudioFX._rain) { AudioFX._rain.lp.frequency.setTargetAtTime(W.inside ? 650 : 5200 + 2600 * rain, AudioFX.ctx.currentTime, 0.3); if (W.inside) AudioFX._rain.gain.gain.setTargetAtTime(rain * 0.04, AudioFX.ctx.currentTime, 0.3); }
        if (radio > 0) this._pagode(dt);
        if (music > 0) this._gymBeat(dt);
        if (funk > 0) this._funkBeat(dt);
    },

    // ------------------------------------------------------------------ música
    // Pagode no rádio do bar (~96 bpm em 16 avos): acordes de cavaquinho (I–vi–ii–V), surdo no 2, pandeiro em todas.
    _pagode(dt) {
        const ctx = AudioFX.ctx, S = 60 / 96 / 4;
        this._pq = (this._pq || 0) + dt;
        if (this._pNext == null || this._pNext < ctx.currentTime) this._pNext = ctx.currentTime + 0.05;
        while (this._pNext < ctx.currentTime + 0.3) {                      // agenda um pouco à frente (o relógio é grosso)
            const i = (this._pStep = ((this._pStep || 0) + 1)) % 16, bar = Math.floor(this._pStep / 16) % 4, t = this._pNext;
            const CH = [[60, 64, 67], [57, 60, 64], [62, 65, 69], [55, 59, 62]][bar];
            if ([0, 3, 6, 8, 10, 14].includes(i)) for (const n of CH) this._pluck(this.radio, 440 * Math.pow(2, (n + 12 - 69) / 12), t, 0.06, 0.16);
            if (i === 4 || i === 12) this._drum(this.radio, 90, t, 0.5, 0.3);
            this._hat(this.radio, t, i % 4 === 2 ? 0.07 : 0.03);
            this._pNext += S;
        }
    },
    _gymBeat(dt) {
        const ctx = AudioFX.ctx, S = 60 / 124 / 4;
        if (this._gNext == null || this._gNext < ctx.currentTime) this._gNext = ctx.currentTime + 0.05;
        while (this._gNext < ctx.currentTime + 0.3) {
            const i = (this._gStep = ((this._gStep || 0) + 1)) % 16, t = this._gNext;
            if (i % 4 === 0) this._drum(this.music, 60, t, 0.9, 0.25);
            if (i % 4 === 2) this._hat(this.music, t, 0.08);
            if (i === 4 || i === 12) this._snare(this.music, t, 0.25);
            this._gNext += S;
        }
    },
    _funkBeat(dt) {                                                       // tamborzão longe (abafado pelo lowpass)
        const ctx = AudioFX.ctx, S = 60 / 130 / 4;
        if (this._fNext == null || this._fNext < ctx.currentTime) this._fNext = ctx.currentTime + 0.05;
        while (this._fNext < ctx.currentTime + 0.3) {
            const i = (this._fStep = ((this._fStep || 0) + 1)) % 16, t = this._fNext;
            if ([0, 3, 6, 10, 12].includes(i)) this._drum(this.funk, 55, t, 1, 0.3);
            this._fNext += S;
        }
    },
    _pluck(dest, f, t, vol, dur) {
        const ctx = AudioFX.ctx, o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
    },
    _drum(dest, f, t, vol, dur) {
        const ctx = AudioFX.ctx, o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(f * 2.2, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
    },
    _hat(dest, t, vol) {
        const ctx = AudioFX.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        s.buffer = AudioFX._noise(); f.type = 'highpass'; f.frequency.value = 6500;
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + 0.07);
    },
    _snare(dest, t, vol) {
        const ctx = AudioFX.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        s.buffer = AudioFX._noise(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
        s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + 0.16);
    },

    // ------------------------------------------------------------------ sons avulsos
    _every(key, min, max) { const now = this.t; if (this.oneT[key] == null) this.oneT[key] = now + min + Math.random() * (max - min); if (now < this.oneT[key]) return false; this.oneT[key] = now + min + Math.random() * (max - min); return true; },
    _around(r0, r1) { const L = AudioFX.listener, a = Math.random() * Math.PI * 2, r = r0 + Math.random() * (r1 - r0); return { x: L.x + Math.cos(a) * r, z: L.z + Math.sin(a) * r }; },
    _ones(g, W, h, night, inside) {
        const ctx = AudioFX.ctx;
        if (inside) {
            const st = W.shop.style;
            if (['bar', 'italian', 'japanese', 'pizza'].includes(st) && this._every('clink', 2.5, 7)) { const t = ctx.currentTime; for (const [f, d] of [[2400 + Math.random() * 600, 0], [3300, 0.04]]) this._ping(f, t + d, 0.035); }
            if (['mart', 'pharmacy', 'burger', 'bakery'].includes(st) && this._every('beep', 6, 14)) { const t = ctx.currentTime; this._beep(1800, t, 0.04); this._beep(1800, t + 0.12, 0.04); }
            return;
        }
        const city = W.biome && ['downtown', 'commercial', 'port', 'plaza'].includes(W.biome);
        if (city && !night && this._every('honk', 9, 22)) { const p = this._around(25, 70); this._honk(p.x, p.z); }
        if (city && this._every('bus', 25, 60)) { const p = this._around(20, 60); this._busBrake(p.x, p.z); }
        if ((night || W.district === 'favela') && this._every('dog', 14, 40)) { const p = this._around(25, 80); this._bark(p.x, p.z); }
        if (h >= 5 && h < 9 && (W.biome === 'park' || W.biome === 'residential' || W.biome === 'forest' || W.biome === 'plaza') && this._every('bird', 2, 6)) { const p = this._around(8, 30); this._bird(p.x, p.z); }
        if (W.beach > 0.3 && !night && this._every('gull', 6, 16)) { const p = this._around(15, 50); this._gull(p.x, p.z); }
    },
    _out(x, z, maxD, vol) { const s = AudioFX.ctx && AudioFX._spatial(x, z, maxD, vol); if (!s) return null; const ctx = AudioFX.ctx, g = ctx.createGain(); g.gain.value = s.g; if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = s.pan; g.connect(p); p.connect(AudioFX.master); } else g.connect(AudioFX.master); return g; },
    _ping(f, t, vol) { const ctx = AudioFX.ctx, o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); o.connect(g); g.connect(AudioFX.master); o.start(t); o.stop(t + 0.4); },
    _beep(f, t, vol) { const ctx = AudioFX.ctx, o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.setValueAtTime(vol, t); g.gain.setValueAtTime(0.0001, t + 0.08); o.connect(g); g.connect(AudioFX.master); o.start(t); o.stop(t + 0.1); },
    _honk(x, z) {
        const out = this._out(x, z, 90, 0.16); if (!out) return;
        const ctx = AudioFX.ctx, t = ctx.currentTime, d = 0.18 + Math.random() * 0.3, lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.connect(out);
        for (const f of [392, 494]) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.02); g.gain.setValueAtTime(0.5, t + d); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.05); o.connect(g); g.connect(lp); o.start(t); o.stop(t + d + 0.08); }
    },
    _busBrake(x, z) {
        const out = this._out(x, z, 80, 0.12); if (!out) return;
        const ctx = AudioFX.ctx, t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        s.buffer = AudioFX._noise(); s.loop = true; f.type = 'bandpass'; f.Q.value = 6; f.frequency.setValueAtTime(3800, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.9);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.8, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
        s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + 1.2);
    },
    _bark(x, z) {
        const out = this._out(x, z, 100, 0.2); if (!out) return;
        const ctx = AudioFX.ctx, n = 2 + Math.floor(Math.random() * 3);
        for (let k = 0; k < n; k++) {
            const t = ctx.currentTime + k * (0.22 + Math.random() * 0.12), o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
            o.type = 'sawtooth'; o.frequency.setValueAtTime(520 + Math.random() * 120, t); o.frequency.exponentialRampToValueAtTime(260, t + 0.12);
            f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.4;
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
            o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + 0.17);
        }
    },
    _bird(x, z) {
        const out = this._out(x, z, 40, 0.07); if (!out) return;
        const ctx = AudioFX.ctx, n = 2 + Math.floor(Math.random() * 4), base = 2600 + Math.random() * 1600;
        for (let k = 0; k < n; k++) {
            const t = ctx.currentTime + k * 0.11, o = ctx.createOscillator(), g = ctx.createGain();
            o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.4), t + 0.06);
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
            o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.1);
        }
    },
    _gull(x, z) {
        const out = this._out(x, z, 70, 0.09); if (!out) return;
        const ctx = AudioFX.ctx;
        for (let k = 0; k < 2; k++) {
            const t = ctx.currentTime + k * 0.32, o = ctx.createOscillator(), g = ctx.createGain();
            o.type = 'triangle'; o.frequency.setValueAtTime(1350, t); o.frequency.exponentialRampToValueAtTime(820, t + 0.26);
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
            o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.3);
        }
    },
    // Grilos: trinados curtos e agudos, em vários pontos à volta.
    _crickets(W) {
        if (!['residential', 'park', 'forest', 'favela', 'plaza', 'beach'].includes(W.biome) && W.district !== 'favela') return;
        if (!this._every('cricket', 0.4, 1.4)) return;
        const p = this._around(6, 25), out = this._out(p.x, p.z, 30, 0.035); if (!out) return;
        const ctx = AudioFX.ctx, f = 4200 + Math.random() * 900;
        for (let k = 0; k < 3; k++) {
            const t = ctx.currentTime + k * 0.06, o = ctx.createOscillator(), g = ctx.createGain();
            o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
            o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.05);
        }
    },
};
