// ============================================================================
// AudioFX — efeitos sonoros sintetizados com Web Audio (sem arquivos).
// O navegador só libera áudio depois de um gesto do usuário: init() é chamado no
// primeiro toque de tecla/clique. Tudo é espacial de forma simples: volume cai com a
// distância ao "ouvinte" (o jogador) e o pan segue o lado em X.
// ============================================================================

const AudioFX = {
    ctx: null,
    master: null,
    listener: { x: 0, z: 0 },
    honkCount: 0,            // quantas buzinas tocaram (também serve p/ testes)
    muted: false,

    // Chamar dentro de um evento do usuário (keydown/mousedown).
    init() {
        if (this.ctx) { if (this.ctx.state === 'suspended' && !this._paused) this.ctx.resume(); return; }
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this.master.gain.value = this.volume;
            this.master.connect(this.ctx.destination);
        } catch (e) { this.ctx = null; }
    },

    volume: 0.7,                 // volume geral (0..1), ajustado nas Configurações
    setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; },

    // Pausa do jogo: o áudio todo (sirene, rotor, buzinas) congela junto.
    pause() { this._paused = true; if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); },
    unpause() { this._paused = false; if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },

    setListener(x, z) { this.listener.x = x; this.listener.z = z; },

    // Pronto para tocar? (áudio liberado, não mudo)
    _ok() { return this.ctx && this.ctx.state === 'running' && !this.muted; },

    // Ganho/pan espaciais a partir da posição do som. Retorna null se longe demais.
    _spatial(x, z, maxDist, vol) {
        const d = hypot(x - this.listener.x, z - this.listener.z);
        if (d > maxDist) return null;
        const g = Math.pow(1 - d / maxDist, 1.4) * vol;
        if (g < 0.01) return null;
        return { g, pan: Math.max(-1, Math.min(1, (x - this.listener.x) / 45)) };
    },

    // Buffer de ruído branco reaproveitado.
    _noise() {
        if (!this._noiseBuf) {
            const n = this.ctx.sampleRate * 1.2;
            const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
            const d = b.getChannelData(0);
            for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
            this._noiseBuf = b;
        }
        return this._noiseBuf;
    },

    // Rajada de ruído filtrada (base de tiro, impacto e soco). cutoff cai de f0 a f1.
    _burst(x, z, { vol = 0.4, dur = 0.12, f0 = 3000, f1 = 300, maxDist = 90, type = 'lowpass', q = 0.8 } = {}) {
        if (!this._ok()) return;
        const sp = this._spatial(x, z, maxDist, vol);
        if (!sp) return;
        const ctx = this.ctx, t0 = ctx.currentTime;
        const src = ctx.createBufferSource();
        src.buffer = this._noise();
        const filt = ctx.createBiquadFilter();
        filt.type = type; filt.Q.value = q;
        filt.frequency.setValueAtTime(f0, t0);
        filt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(sp.g, t0);
        gain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
        src.connect(filt); filt.connect(gain);
        if (ctx.createStereoPanner) {
            const pan = ctx.createStereoPanner(); pan.pan.value = sp.pan;
            gain.connect(pan); pan.connect(this.master);
        } else gain.connect(this.master);
        src.start(t0, Math.random() * 0.5);
        src.stop(t0 + dur + 0.02);
    },

    // Tiro: cada arma tem seu "estalo" (pistola seco, SMG curto, escopeta grave e longo).
    shot(kind, x, z) {
        if (kind === 'shotgun') this._burst(x, z, { vol: 0.75, dur: 0.34, f0: 2600, f1: 120, maxDist: 140 });
        else if (kind === 'smg') this._burst(x, z, { vol: 0.45, dur: 0.09, f0: 4200, f1: 500, maxDist: 110 });
        else if (kind === 'revolver') this._burst(x, z, { vol: 0.7, dur: 0.22, f0: 3000, f1: 180, maxDist: 135 });
        else if (kind === 'rifle' || kind === 'ak47') this._burst(x, z, { vol: 0.6, dur: 0.12, f0: 3200, f1: 220, maxDist: 130 });
        else this._burst(x, z, { vol: 0.55, dur: 0.16, f0: 3600, f1: 260, maxDist: 120 });
    },

    // Batida de carro: pancada grave + chapa amassando (power 0..1).
    crash(x, z, power = 0.5) {
        this._burst(x, z, { vol: 0.25 + 0.55 * power, dur: 0.14 + 0.2 * power, f0: 1500, f1: 140, maxDist: 110 });
        this._burst(x, z, { vol: 0.12 + 0.3 * power, dur: 0.22 + 0.3 * power, f0: 3400, f1: 700, maxDist: 90, type: 'bandpass', q: 1.2 });
    },

    // Explosão de carro: estouro longo e grave + estalo agudo na frente.
    explosion(x, z) {
        this._burst(x, z, { vol: 1.0, dur: 1.15, f0: 1800, f1: 45, maxDist: 260 });
        this._burst(x, z, { vol: 0.55, dur: 0.45, f0: 6500, f1: 320, maxDist: 170, type: 'bandpass', q: 0.7 });
    },

    hit(x, z) { this._burst(x, z, { vol: 0.22, dur: 0.07, f0: 5200, f1: 1200, maxDist: 45, type: 'bandpass', q: 1.5 }); },
    thud(x, z) { this._burst(x, z, { vol: 0.5, dur: 0.1, f0: 520, f1: 70, maxDist: 40 }); },
    dryfire(x, z) { this._burst(x, z, { vol: 0.25, dur: 0.04, f0: 6000, f1: 3000, maxDist: 30, type: 'highpass', q: 2 }); },

    // Vidro quebrando: estalo agudo + chuva de cacos.
    glass(x, z) {
        this._burst(x, z, { vol: 0.6, dur: 0.16, f0: 8000, f1: 3000, maxDist: 75, type: 'highpass', q: 1.2 });
        this._burst(x, z, { vol: 0.32, dur: 0.5, f0: 6200, f1: 2400, maxDist: 60, type: 'bandpass', q: 3 });
    },

    // Porta do carro: abrindo (rangido leve) ou batendo ao fechar (pancada seca).
    door(x, z, open) {
        if (open) this._burst(x, z, { vol: 0.22, dur: 0.1, f0: 1500, f1: 350, maxDist: 35, type: 'bandpass', q: 1.4 });
        else this._burst(x, z, { vol: 0.5, dur: 0.13, f0: 1100, f1: 90, maxDist: 55 });
    },

    // Alarme de carro: bipes alternando dois tons (chame a cada ~0,28 s alternando `hi`).
    alarm(x, z, hi) {
        const ctx = this.ctx;
        if (!ctx || ctx.state !== 'running' || this.muted) return;
        const d = hypot(x - this.listener.x, z - this.listener.z);
        if (d > 95) return;
        const vol = Math.pow(1 - d / 95, 1.5) * 0.2;
        if (vol < 0.008) return;
        const t0 = ctx.currentTime, dur = 0.24;
        const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
        o.type = 'square'; o.frequency.value = hi ? 1320 : 880;
        lp.type = 'lowpass'; lp.frequency.value = 2600;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
        g.gain.setValueAtTime(vol, t0 + dur - 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(lp); lp.connect(g);
        if (ctx.createStereoPanner) {
            const pan = ctx.createStereoPanner(); pan.pan.value = Math.max(-1, Math.min(1, (x - this.listener.x) / 45));
            g.connect(pan); pan.connect(this.master);
        } else g.connect(this.master);
        o.start(t0); o.stop(t0 + dur + 0.02);
    },

    // Som curto "plim" de coleta/recarga.
    blip(freq = 880, dur = 0.12, vol = 0.18) {
        if (!this._ok()) return;
        const ctx = this.ctx, t0 = ctx.currentTime;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(freq, t0);
        o.frequency.exponentialRampToValueAtTime(freq * 1.6, t0 + dur);
        g.gain.setValueAtTime(vol, t0);
        g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
        o.connect(g); g.connect(this.master);
        o.start(t0); o.stop(t0 + dur + 0.02);
    },

    // Sirene contínua (uuuiu-uuuiu). Chame todo frame: active liga/desliga, near = distância da viatura mais próxima.
    siren(active, near) {
        if (!this._ok()) return;
        if (!this._siren) {
            const ctx = this.ctx;
            const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
            o.type = 'sawtooth'; lp.type = 'lowpass'; lp.frequency.value = 1500;
            g.gain.value = 0;
            o.connect(lp); lp.connect(g); g.connect(this.master);
            o.start();
            this._siren = { o, g };
        }
        const { o, g } = this._siren, t = this.ctx.currentTime;
        const target = active ? Math.pow(Math.max(0, 1 - near / 110), 1.5) * 0.09 : 0;
        g.gain.setTargetAtTime(target, t, 0.15);
        // Varredura de frequência (≈ 0,8 Hz entre 600 e 1100 Hz).
        const ph = (t * 0.8) % 1;
        o.frequency.setTargetAtTime(600 + 500 * (ph < 0.5 ? ph * 2 : 2 - ph * 2), t, 0.05);
    },

    // Rotor do helicóptero: zumbido grave com "pá-pá-pá" (tremolo ~13 Hz). Chame todo frame: active liga/desliga,
    // near = distância ao helicóptero.
    heli(active, near) {
        if (!this._ok()) return;
        if (!this._heli) {
            const ctx = this.ctx;
            const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), mod = ctx.createGain(), vol = ctx.createGain();
            o.type = 'sawtooth'; o.frequency.value = 52;
            lp.type = 'lowpass'; lp.frequency.value = 340; lp.Q.value = 2;
            mod.gain.value = 0.5; vol.gain.value = 0;
            const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
            lfo.type = 'square'; lfo.frequency.value = 13; lfoG.gain.value = 0.5;
            lfo.connect(lfoG); lfoG.connect(mod.gain);                 // mod.gain oscila entre 0 e 1
            o.connect(lp); lp.connect(mod); mod.connect(vol); vol.connect(this.master);
            o.start(); lfo.start();
            this._heli = { vol };
        }
        const t = this.ctx.currentTime;
        const target = active ? Math.pow(Math.max(0, 1 - near / 170), 1.3) * 0.2 : 0;
        this._heli.vol.gain.setTargetAtTime(target, t, 0.25);
    },

    // Rotor do helicóptero DO JOGADOR: mesmo timbre do da polícia, mas a rotação (rpm 0..1) muda a frequência e o "pá-pá-pá".
    // Chame todo frame: rpm 0 silencia; near = distância da câmera ao helicóptero.
    chopper(rpm, near, stress = 0) {
        if (!this._ok()) return;
        if (!this._chop) {
            const ctx = this.ctx;
            const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), mod = ctx.createGain(), vol = ctx.createGain();
            o.type = 'sawtooth'; o.frequency.value = 40;
            lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 2;
            mod.gain.value = 0.5; vol.gain.value = 0;
            const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
            lfo.type = 'square'; lfo.frequency.value = 6; lfoG.gain.value = 0.5;
            lfo.connect(lfoG); lfoG.connect(mod.gain);
            o.connect(lp); lp.connect(mod); mod.connect(vol); vol.connect(this.master);
            o.start(); lfo.start();
            this._chop = { vol, o, lfo };
        }
        const t = this.ctx.currentTime, c = this._chop;
        c.vol.gain.setTargetAtTime(rpm > 0.02 ? Math.pow(Math.max(0, 1 - near / 200), 1.2) * 0.27 * Math.min(1, rpm * 1.3) : 0, t, 0.2);
        c.o.frequency.setTargetAtTime(30 + rpm * 24 + stress * 18, t, 0.2);
        c.lfo.frequency.setTargetAtTime(2 + rpm * 11 + stress * 5, t, 0.2);
    },

    // Chuva contínua: ruído filtrado em loop. Chame todo frame com a intensidade (0..1); 0 silencia.
    rain(level) {
        if (!this._ok()) return;
        if (!this._rain) {
            const ctx = this.ctx, src = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), gain = ctx.createGain();
            src.buffer = this._noise(); src.loop = true;
            hp.type = 'highpass'; hp.frequency.value = 650; lp.type = 'lowpass'; lp.frequency.value = 7200;
            gain.gain.value = 0;
            src.connect(hp); hp.connect(lp); lp.connect(gain); gain.connect(this.master);
            src.start();
            this._rain = { gain, lp };
        }
        const t = this.ctx.currentTime;
        this._rain.gain.gain.setTargetAtTime(level < 0.03 ? 0 : Math.pow(level, 1.15) * 0.2, t, 0.5);
        this._rain.lp.frequency.setTargetAtTime(5200 + 2600 * level, t, 0.5);
    },

    // Trovão: estalo seco seguido de um ronco grave longo e tremulante. power 0..1 (longe = mais fraco).
    thunder(power = 1) {
        if (!this._ok()) return;
        const ctx = this.ctx, t0 = ctx.currentTime;
        const mk = (type, f0, f1, dur, vol, q = 0.7) => {
            const src = ctx.createBufferSource(), filt = ctx.createBiquadFilter(), gain = ctx.createGain();
            src.buffer = this._noise(); src.loop = true;
            filt.type = type; filt.Q.value = q;
            filt.frequency.setValueAtTime(f0, t0); filt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
            gain.gain.setValueAtTime(0.0001, t0);
            gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.04);
            // ronco com "ondas" de volume (eco entre nuvens)
            for (let i = 1; i < 6; i++) gain.gain.linearRampToValueAtTime(vol * (0.35 + 0.65 * Math.random()) * (1 - i / 7), t0 + 0.04 + (dur * i) / 6);
            gain.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
            src.connect(filt); filt.connect(gain); gain.connect(this.master);
            src.start(t0, Math.random() * 0.4); src.stop(t0 + dur + 0.05);
        };
        mk('bandpass', 2400, 500, 0.18, 0.5 * power, 0.8);                    // estalo
        mk('lowpass', 520, 45, 2.2 + 1.6 * power, 0.95 * power, 0.9);         // ronco
        mk('lowpass', 160, 38, 3.0 + 1.2 * power, 0.7 * power, 1.2);          // base grave
    },

    // Buzina de carro: duas ondas quadradas (acorde de terça menor, ~380/450 Hz) por um
    // lowpass, com ataque/queda rápidos. pitch varia por motorista; dur em segundos.
    honk(x, z, pitch = 1, dur = 0.3) {
        this.honkCount++;
        const ctx = this.ctx;
        if (!ctx || ctx.state !== 'running' || this.muted) return;
        const d = hypot(x - this.listener.x, z - this.listener.z);
        if (d > 80) return;
        const vol = Math.pow(1 - d / 80, 1.6) * 0.32;
        if (vol < 0.01) return;

        const t0 = ctx.currentTime;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
        gain.gain.setValueAtTime(vol, t0 + dur - 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1700;

        let out = lp;
        if (ctx.createStereoPanner) {
            const pan = ctx.createStereoPanner();
            pan.pan.value = Math.max(-1, Math.min(1, (x - this.listener.x) / 45));
            lp.connect(pan);
            out = pan;
        }
        gain.connect(lp);
        out.connect(this.master);

        for (const f of [380, 452]) {
            const o = ctx.createOscillator();
            o.type = 'square';
            o.frequency.value = f * pitch;
            o.connect(gain);
            o.start(t0);
            o.stop(t0 + dur + 0.02);
        }
    },
};
