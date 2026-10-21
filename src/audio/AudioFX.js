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
            if (typeof Ambience !== 'undefined') Ambience.start();           // o som do lugar (trânsito, mar, rádio do bar…)
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
    // delay = começa daqui a `delay` s | att = subida (s) em vez do ataque seco.
    _burst(x, z, { vol = 0.4, dur = 0.12, f0 = 3000, f1 = 300, maxDist = 90, type = 'lowpass', q = 0.8, delay = 0, att = 0 } = {}) {
        if (!this._ok()) return;
        const sp = this._spatial(x, z, maxDist, vol);
        if (!sp) return;
        const ctx = this.ctx, t0 = ctx.currentTime + delay;
        const src = ctx.createBufferSource();
        src.buffer = this._noise();
        const filt = ctx.createBiquadFilter();
        filt.type = type; filt.Q.value = q;
        filt.frequency.setValueAtTime(f0, t0);
        filt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
        const gain = ctx.createGain();
        if (att > 0) { gain.gain.setValueAtTime(0.0008, t0); gain.gain.exponentialRampToValueAtTime(sp.g, t0 + att); }
        else gain.gain.setValueAtTime(sp.g, t0);
        gain.gain.exponentialRampToValueAtTime(0.0008, t0 + Math.max(dur, att + 0.01));
        src.connect(filt); filt.connect(gain);
        if (ctx.createStereoPanner) {
            const pan = ctx.createStereoPanner(); pan.pan.value = sp.pan;
            gain.connect(pan); pan.connect(this.master);
        } else gain.connect(this.master);
        src.start(t0, Math.random() * 0.5);
        src.stop(t0 + Math.max(dur, att + 0.01) + 0.02);
    },

    // ------------------------------------------------------------------ água (WaterFx chama; o jogador e os NPCs por perto)
    // vol: 1 = o jogador (o ouvinte está nele); NPCs passam menos e somem com a distância (maxDist).
    // Braçada: a mão bate na água (tapa curto), o corpo d'água espirra, a puxada borbulha por baixo e as gotas caem de volta.
    waterStroke(x, z, vol = 1, maxDist = 32) {
        const v = 0.3 * vol, s = 0.85 + Math.random() * 0.3;
        this._burst(x, z, { vol: v * 0.9, dur: 0.09, f0: 1700 * s, f1: 800, type: 'bandpass', q: 1.1, maxDist, att: 0.004 });
        this._burst(x, z, { vol: v * 0.8, dur: 0.22, f0: 1100 * s, f1: 260, maxDist, delay: 0.012, att: 0.01 });
        this._burst(x, z, { vol: v * 0.45, dur: 0.26, f0: 380, f1: 720, type: 'bandpass', q: 4, maxDist, delay: 0.09, att: 0.07 });     // puxada (borbulho)
        for (let i = 0; i < 3; i++) this._burst(x, z, { vol: v * (0.12 + Math.random() * 0.12), dur: 0.025, f0: 2800 + Math.random() * 2600, f1: 2400, type: 'bandpass', q: 7, maxDist, delay: 0.16 + Math.random() * 0.3 });
    },
    // Pernada: chacoalhar curto e abafado.
    waterKick(x, z, vol = 1, maxDist = 24) {
        this._burst(x, z, { vol: 0.08 * vol, dur: 0.1, f0: 900, f1: 260, maxDist, att: 0.008 });
        this._burst(x, z, { vol: 0.05 * vol, dur: 0.05, f0: 2400, f1: 1800, type: 'bandpass', q: 1.4, maxDist, delay: 0.02 });
    },
    // Passo no raso (depth01: 0 = tornozelo, 1 = cintura): a perna entra (pancada mais grave quanto mais fundo), a água chacoalha
    // em volta e a perna sai puxando (um "shlup" que sobe), com respingos.
    waterWade(x, z, depth01 = 0.5, run = false, vol = 1, maxDist = 28) {
        const v = (run ? 0.34 : 0.26) * vol, d = Math.max(0, Math.min(1, depth01)), s = 0.9 + Math.random() * 0.2;
        this._burst(x, z, { vol: v * (0.8 + 0.4 * d), dur: 0.16 + 0.1 * d, f0: (1500 - 700 * d) * s, f1: 180, maxDist, att: 0.006 });
        this._burst(x, z, { vol: v * 0.7, dur: 0.18, f0: 2100 * s, f1: 900, type: 'bandpass', q: 0.9, maxDist, delay: 0.01, att: 0.012 });
        this._burst(x, z, { vol: v * (0.35 + 0.4 * d), dur: 0.22, f0: 520, f1: 1500, type: 'bandpass', q: 3.5, maxDist, delay: 0.11 + 0.05 * d, att: 0.06 });   // perna saindo
        for (let i = 0; i < 2 + (run ? 2 : 0); i++) this._burst(x, z, { vol: v * (0.1 + Math.random() * 0.12), dur: 0.03, f0: 3000 + Math.random() * 2500, f1: 2600, type: 'bandpass', q: 6, maxDist, delay: 0.12 + Math.random() * 0.25 });
    },

    // Tiro: cada arma tem seu "estalo" (pistola seco, SMG curto, escopeta grave e longo).
    shot(kind, x, z) {
        if (kind === 'shotgun') this._burst(x, z, { vol: 0.75, dur: 0.34, f0: 2600, f1: 120, maxDist: 140 });
        else if (kind === 'smg') this._burst(x, z, { vol: 0.45, dur: 0.09, f0: 4200, f1: 500, maxDist: 110 });
        else if (kind === 'revolver') this._burst(x, z, { vol: 0.7, dur: 0.22, f0: 3000, f1: 180, maxDist: 135 });
        else if (kind === 'rifle' || kind === 'ak47') this._burst(x, z, { vol: 0.6, dur: 0.12, f0: 3200, f1: 220, maxDist: 130 });
        else if (kind === 'pistol_sil') {                                   // silenciador: um "tuc" abafado e o estalo do ferrolho — ouve-se de perto
            this._burst(x, z, { vol: 0.22, dur: 0.07, f0: 1600, f1: 500, maxDist: 26, type: 'bandpass', q: 1.4 });
            this._burst(x, z, { vol: 0.12, dur: 0.04, f0: 5200, f1: 2600, maxDist: 18, type: 'bandpass', q: 2, delay: 0.03 });
        } else if (kind === 'rpg' || kind === 'launcher') {                // foguete: estouro grave do disparo e o chiado do motor indo embora
            this._burst(x, z, { vol: 0.85, dur: 0.5, f0: 1400, f1: 70, maxDist: 190 });
            this._burst(x, z, { vol: 0.35, dur: 1.1, f0: 7000, f1: 2500, maxDist: 120, type: 'highpass', q: 0.7, delay: 0.05 });
        } else if (kind === 'minigun') this._burst(x, z, { vol: 0.34, dur: 0.05, f0: 3800, f1: 700, maxDist: 125 });      // (20 por segundo: o "brrrt")
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

    roll(x, z) { this._burst(x, z, { vol: 0.16, dur: 0.32, f0: 700, f1: 160, maxDist: 26, q: 0.6, att: 0.04 }); },      // rolamento: roupa e corpo arrastando no chão
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

    // Pneu cantando (derrapagem do carro do jogador: Vehicle.slide). Chame todo frame com a intensidade (0..1); 0 silencia.
    // Ruído estreito em banda (o chiado da borracha) + um tom que oscila (o "uivo"), os dois subindo um pouco com a força.
    screech(level) {
        if (!this._ok()) return;
        if (!this._screech) {
            if (level < 0.05) return;                                          // (só monta a cadeia na 1ª derrapagem de verdade)
            const ctx = this.ctx, src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), gain = ctx.createGain();
            src.buffer = this._noise(); src.loop = true;
            bp.type = 'bandpass'; bp.frequency.value = 2100; bp.Q.value = 7;
            const o = ctx.createOscillator(), og = ctx.createGain(), lfo = ctx.createOscillator(), lfoG = ctx.createGain();
            o.type = 'triangle'; o.frequency.value = 1050; og.gain.value = 0.35;
            lfo.type = 'sine'; lfo.frequency.value = 9; lfoG.gain.value = 45;
            lfo.connect(lfoG); lfoG.connect(o.frequency);
            gain.gain.value = 0;
            src.connect(bp); bp.connect(gain); o.connect(og); og.connect(gain); gain.connect(this.master);
            src.start(); o.start(); lfo.start();
            this._screech = { gain, bp, o };
        }
        const t = this.ctx.currentTime, S = this._screech, l = Math.max(0, Math.min(1, level));
        S.gain.gain.setTargetAtTime(l < 0.08 ? 0 : 0.03 + 0.1 * l, t, l < 0.08 ? 0.12 : 0.05);
        S.bp.frequency.setTargetAtTime(1800 + 700 * l, t, 0.1);
        S.o.frequency.setTargetAtTime(950 + 250 * l, t, 0.1);
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

    // Pedaço de ruído filtrado agendado em `at` (relógio do áudio), já com ganho/pan espaciais `sp`.
    _nz(at, sp, { vol, dur, f0, f1 = f0, type = 'lowpass', q = 0.8, att = 0.002 }) {
        const ctx = this.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        src.buffer = this._noise(); src.loop = dur > 1;
        f.type = type; f.Q.value = q;
        f.frequency.setValueAtTime(f0, at); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), at + dur);
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * sp.g), at + att); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        src.connect(f); f.connect(g);
        if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = sp.pan; g.connect(p); p.connect(this.master); } else g.connect(this.master);
        src.start(at, Math.random() * 0.5); src.stop(at + dur + 0.05);
        return g;
    },

    // Fogos — LANÇAMENTO: o estalo da espoleta, o chiado do propelente subindo (o filtro abre conforme o foguete ganha velocidade,
    // e some ao longe), faíscas crepitando no rastro e, às vezes, o assobio. dur = tempo de subida (s).
    fireworkLaunch(x, z, dur = 0.9) {
        if (!this._ok()) return;
        const sp = this._spatial(x, z, 220, 1);
        if (!sp) return;
        const ctx = this.ctx, t = ctx.currentTime + 0.01;
        this._nz(t, sp, { vol: 0.35, dur: 0.05, f0: 1800, f1: 200, att: 0.001 });                                   // espoleta
        this._nz(t, sp, { vol: 0.18, dur: 0.09, f0: 420, f1: 70, att: 0.002 });
        // chiado: ruído em banda subindo de 700 a 3600 Hz, mais forte no começo e sumindo no alto
        const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
        src.buffer = this._noise(); src.loop = true;
        bp.type = 'bandpass'; bp.Q.value = 1.6; bp.frequency.setValueAtTime(700, t); bp.frequency.exponentialRampToValueAtTime(3600, t + dur);
        hp.type = 'highpass'; hp.frequency.value = 350;
        const v = 0.3 * sp.g;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.04);
        g.gain.exponentialRampToValueAtTime(v * 0.55, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
        src.connect(bp); bp.connect(hp); hp.connect(g);
        let out = g;
        if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = sp.pan; g.connect(p); out = p; }
        out.connect(this.master);
        src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.2);
        for (let i = 0; i < 9; i++) {                                                                                  // faíscas do rastro
            const at = t + 0.05 + Math.random() * dur * 0.9;
            this._nz(at, sp, { vol: 0.07 + Math.random() * 0.06, dur: 0.008 + Math.random() * 0.01, f0: 4000 + Math.random() * 3000, type: 'highpass', q: 0.7, att: 0.0005 });
        }
        if (Math.random() < 0.4) {                                                                                     // foguete de assobio
            const o = ctx.createOscillator(), og = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain();
            o.type = 'sine'; o.frequency.setValueAtTime(1500, t); o.frequency.exponentialRampToValueAtTime(2900 + Math.random() * 800, t + dur);
            vib.frequency.value = 22; vg.gain.value = 45; vib.connect(vg); vg.connect(o.frequency);
            og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.05 * sp.g, t + 0.08); og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(og); og.connect(out === g ? this.master : out);
            o.start(t); vib.start(t); o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
        }
    },

    // Fogos — ESTOURO: chega com o atraso do som (343 m/s); estalo seco + "bum" grave + eco nos prédios + o crepitar das estrelas.
    // De longe: mais baixo e mais abafado (o ar come os agudos).
    fireworkBurst(x, z, y = 15) {
        if (!this._ok()) return;
        const d = hypot(x - this.listener.x, z - this.listener.z, y), sp = this._spatial(x, z, 420, 1);
        if (!sp) return;
        const far = Math.min(1, d / 300), t = this.ctx.currentTime + 0.01 + d / 343, dark = 1 - 0.6 * far;
        this._nz(t, sp, { vol: 0.85, dur: 0.035, f0: 9000 * dark, f1: 2500 * dark, type: 'lowpass', att: 0.0008 });         // estalo
        this._nz(t, sp, { vol: 1.0, dur: 1.4, f0: 1600 * dark, f1: 45, att: 0.003 });                                      // bum
        this._nz(t, sp, { vol: 0.6, dur: 0.6, f0: 260, f1: 40, q: 1.2, att: 0.004 });                                     // pressão grave
        for (const [dl, k] of [[0.19 + Math.random() * 0.08, 0.32], [0.46 + Math.random() * 0.15, 0.18], [0.9 + Math.random() * 0.3, 0.09]])
            this._nz(t + dl, sp, { vol: k, dur: 0.9, f0: 700 * dark, f1: 60, att: 0.02 });                                 // eco nos prédios / morro
        const n = 18 + Math.floor(Math.random() * 16);                                                                    // crepitar das estrelas
        for (let i = 0; i < n; i++) {
            const at = t + 0.35 + Math.pow(Math.random(), 0.8) * 1.3;
            this._nz(at, sp, { vol: (0.06 + Math.random() * 0.1) * (1 - 0.5 * far), dur: 0.01 + Math.random() * 0.015, f0: (3500 + Math.random() * 4000) * dark, type: 'highpass', q: 0.8, att: 0.0005 });
        }
    },

    // Buzina PRESA (motorista morto com a cabeça no volante — TrafficCar.killDriver): a mesma buzina, sem parar. Devolve { set(x, z),
    // stop() }: set a cada quadro (volume e lado pela distância; longe, os osciladores são desligados), stop quando tiram o corpo.
    hornLoop(pitch = 1) {
        const A = this, h = { on: null };
        h.set = (x, z) => {
            const ctx = A.ctx;
            const d = hypot(x - A.listener.x, z - A.listener.z), vol = !ctx || ctx.state !== 'running' || A.muted || d > 85 ? 0 : Math.pow(1 - d / 85, 1.6) * 0.24;
            if (vol < 0.004) { if (h.on) h.off(); return; }
            if (!h.on) {
                const g = ctx.createGain(), lp = ctx.createBiquadFilter(), oscs = [];
                g.gain.value = 0.0001; lp.type = 'lowpass'; lp.frequency.value = 1700;
                let out = lp, pan = null;
                if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); lp.connect(pan); out = pan; }
                g.connect(lp); out.connect(A.master);
                for (const f of [380, 452]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * pitch; o.connect(g); o.start(); oscs.push(o); }
                h.on = { g, pan, oscs };
            }
            const t = ctx.currentTime;
            h.on.g.gain.setTargetAtTime(vol, t, 0.06);
            if (h.on.pan) h.on.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, (x - A.listener.x) / 45)), t, 0.06);
        };
        h.off = () => {
            const ctx = A.ctx, o = h.on;
            h.on = null;
            if (!o || !ctx) return;
            const t = ctx.currentTime;
            o.g.gain.setTargetAtTime(0.0001, t, 0.03);
            for (const s of o.oscs) s.stop(t + 0.15);
        };
        h.stop = () => h.off();
        return h;
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
