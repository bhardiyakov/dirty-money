// ============================================================================
// EngineAudio — ronco de motor sintetizado (Web Audio, sem arquivos), um TIMBRE por tipo de veículo.
//
//   Como soa um motor: cada explosão num cilindro é um "pulso" de pressão no escapamento (um estalo grave que ressoa no cano).
//   Aqui o ciclo do motor (2 voltas do virabrequim num 4 tempos) é ASSADO num buffer: N pulsos por ciclo (N = cilindros), cada um
//   com as ressonâncias do escapamento do perfil, pequenas variações de força/tempo (motor velho = irregular) e o "desequilíbrio"
//   de bancada (o V8 de virabrequim cruzado alterna o lado que estoura — é daí que sai o borbulhar do muscle car).
//   O buffer toca em loop e a ROTAÇÃO muda a velocidade de reprodução. Dois buffers (assados a 1000 e a 4500 rpm) se misturam
//   conforme o giro, para o timbre não "esticar" demais. Por cima: distorção e filtro que abrem com a CARGA (pé no acelerador),
//   ruído de admissão/escape, o grito agudo dos superesportivos, assobio de turbo, estalos de escapamento ao tirar o pé.
//
//   Câmbio automático simulado: a rotação sai da velocidade e da marcha; troca para cima perto do giro de troca (mais alto com o pé
//   embaixo), reduz ao frear ou ao pisar fundo (kick-down), bate no corte de giro.
//   Ignição: o motor de arranque gira (os pulsos de compressão a ~230 rpm), o motor pega com uma acelerada e cai para a marcha lenta.
//   Ligação direta = várias tentativas até pegar. Sem gasolina ou motor quebrado: engasga e morre. Saindo do carro: desliga.
//   Trânsito: os 3 carros com motorista mais perto também roncam (cada um com o perfil do modelo).
//   Elétrico: sem explosões — zumbido do inversor que sobe com a velocidade e um "plim" ao ligar.
// ============================================================================

const EngineAudio = {
    // cyl: cilindros | idle/red: marcha lenta e corte (rpm) | gears: marchas | res: ressonâncias do escape (Hz, no buffer a 1000 rpm)
    // tau: duração do pulso (s) | rough: irregularidade | noise: chiado no pulso | bank: força de cada cilindro na ordem de ignição
    // lp: filtro [fechado, aberto] (Hz) | drive: distorção com carga | vol | scream: grito agudo (V10/V12) | turbo | knock: diesel
    // pops: estalos ao tirar o pé | crank: segundos girando o arranque | starter: Hz do motor de arranque | two: 2 tempos
    PROFILES: {
        small4:   { cyl: 4, idle: 850, red: 6300, gears: 5, res: [105, 210, 400], tau: 0.009, rough: 0.07, noise: 0.25, lp: [520, 3400], drive: 1.2, vol: 0.75, crank: 0.6, starter: 190, turbo: 0.15 },
        rough4:   { cyl: 4, idle: 820, red: 5800, gears: 5, res: [95, 190, 380], tau: 0.010, rough: 0.16, noise: 0.32, lp: [480, 3000], drive: 1.3, vol: 0.78, crank: 0.9, starter: 175 },
        old4:     { cyl: 4, idle: 760, red: 5200, gears: 4, res: [85, 165, 330], tau: 0.012, rough: 0.22, noise: 0.38, lp: [430, 2500], drive: 1.4, vol: 0.85, crank: 1.4, starter: 160, sputter: 1 },
        boxer:    { cyl: 4, idle: 880, red: 4800, gears: 4, res: [120, 260, 560], tau: 0.008, rough: 0.24, noise: 0.5, bank: [1, 0.7, 0.92, 0.74], lp: [600, 3000], drive: 1.5, vol: 0.85, crank: 1.2, starter: 170, sputter: 1 },
        i6old:    { cyl: 6, idle: 640, red: 4800, gears: 4, res: [70, 140, 280], tau: 0.014, rough: 0.12, noise: 0.28, lp: [380, 2300], drive: 1.6, vol: 0.95, crank: 1.1, starter: 150, bass: 5 },
        sedan4:   { cyl: 4, idle: 760, red: 6500, gears: 5, res: [100, 200, 390], tau: 0.009, rough: 0.04, noise: 0.18, lp: [480, 3200], drive: 1.0, vol: 0.62, crank: 0.55, starter: 200 },
        suv4:     { cyl: 4, idle: 740, red: 6000, gears: 6, res: [90, 180, 360], tau: 0.010, rough: 0.05, noise: 0.22, lp: [450, 3000], drive: 1.1, vol: 0.7, crank: 0.6, starter: 185, turbo: 0.3 },
        v6:       { cyl: 6, idle: 700, red: 6400, gears: 6, res: [85, 170, 350], tau: 0.011, rough: 0.05, noise: 0.2, bank: [1, 0.85, 1, 0.85, 1, 0.85], lp: [420, 3000], drive: 1.3, vol: 0.8, crank: 0.6, starter: 180, bass: 3 },
        lux6:     { cyl: 6, idle: 640, red: 6500, gears: 8, res: [90, 180, 360], tau: 0.010, rough: 0.02, noise: 0.12, lp: [380, 2600], drive: 0.9, vol: 0.5, crank: 0.45, starter: 210, turbo: 0.35 },
        turbo4:   { cyl: 4, idle: 880, red: 7000, gears: 6, res: [110, 230, 450], tau: 0.008, rough: 0.05, noise: 0.3, lp: [600, 4200], drive: 1.6, vol: 0.85, crank: 0.55, starter: 200, turbo: 1, pops: 0.45 },
        i6sport:  { cyl: 6, idle: 820, red: 7800, gears: 7, res: [120, 250, 500], tau: 0.008, rough: 0.03, noise: 0.25, lp: [600, 5200], drive: 1.6, vol: 0.9, crank: 0.5, starter: 210, turbo: 0.5, pops: 0.6, scream: 0.25 },
        // V8 de virabrequim cruzado (ordem 1-5-4-2-6-3-7-8: bancadas D E D D E D E E) → o borbulhar irregular
        v8muscle: { cyl: 8, idle: 660, red: 6800, gears: 6, res: [52, 105, 205], tau: 0.017, rough: 0.12, noise: 0.3, bank: [1, 0.72, 1, 1, 0.72, 1, 0.72, 0.72], lag: [0, 0.018, 0, 0, 0.018, 0, 0.018, 0.018], lp: [340, 3000], drive: 2.3, vol: 1.15, crank: 0.75, starter: 165, pops: 1, bass: 8 },
        v8truck:  { cyl: 8, idle: 620, red: 5200, gears: 6, res: [48, 95, 190], tau: 0.018, rough: 0.1, noise: 0.3, bank: [1, 0.8, 1, 1, 0.8, 1, 0.8, 0.8], lag: [0, 0.014, 0, 0, 0.014, 0, 0.014, 0.014], lp: [320, 2400], drive: 1.8, vol: 1.0, crank: 0.8, starter: 155, bass: 6 },
        v8marine: { cyl: 8, idle: 700, red: 5000, gears: 1, res: [55, 110, 220], tau: 0.016, rough: 0.1, noise: 0.35, bank: [1, 0.8, 1, 1, 0.8, 1, 0.8, 0.8], lp: [300, 2200], drive: 1.6, vol: 0.95, crank: 0.8, starter: 160, bass: 6, boat: 1 },
        v12super: { cyl: 12, idle: 1000, red: 8800, gears: 7, res: [150, 320, 660], tau: 0.006, rough: 0.03, noise: 0.22, lp: [800, 7000], drive: 1.9, vol: 1.05, crank: 0.7, starter: 220, scream: 1, pops: 0.7 },
        v10super: { cyl: 10, idle: 950, red: 8500, gears: 7, res: [125, 270, 560], tau: 0.007, rough: 0.05, noise: 0.28, bank: [1, 0.86, 1, 0.86, 1, 0.86, 1, 0.86, 1, 0.86], lp: [700, 6200], drive: 2.1, vol: 1.1, crank: 0.7, starter: 215, scream: 0.75, pops: 1 },
        diesel4:  { cyl: 4, idle: 720, red: 4200, gears: 5, res: [70, 140, 600], tau: 0.011, rough: 0.09, noise: 0.35, knock: 0.9, lp: [420, 2100], drive: 1.2, vol: 0.92, crank: 1.0, starter: 150, turbo: 0.55 },
        diesel6:  { cyl: 6, idle: 600, red: 3200, gears: 1, res: [55, 110, 500], tau: 0.014, rough: 0.08, noise: 0.35, knock: 0.7, lp: [320, 1700], drive: 1.2, vol: 0.95, crank: 1.1, starter: 140, boat: 1 },
        moto1:    { cyl: 1, idle: 1350, red: 8800, gears: 5, res: [130, 270, 540], tau: 0.009, rough: 0.12, noise: 0.3, lp: [650, 4200], drive: 1.6, vol: 0.85, crank: 0.45, starter: 260 },
        outboard: { cyl: 3, idle: 1100, red: 7200, gears: 1, two: 1, res: [140, 300, 620], tau: 0.006, rough: 0.12, noise: 0.45, lp: [650, 4600], drive: 1.6, vol: 0.85, crank: 0.5, starter: 240, boat: 1 },
        electric: { electric: 1, idle: 0, red: 9000, gears: 1, vol: 0.55 },
    },
    // modelo (CarSheet.MODELS / Bikes / Boat) → perfil
    MODEL: {
        hatch_moderno: 'small4', hatch_moderno2: 'small4', compacto_aventureiro: 'rough4', quadradinho: 'rough4', hatch_esportivo: 'turbo4', mini_eletrico: 'electric',
        besouro: 'boxer', brasilia: 'boxer', kombi: 'boxer', seda_classico: 'old4', hatch_90: 'old4', hatch_80: 'old4', sedan_70: 'i6old', perua_antiga: 'i6old',
        suv_compacto: 'suv4', suv_cupe: 'suv4', suv_quadrado: 'suv4', suv_grande: 'v6', jipe_offroad: 'diesel4',
        sedan_popular: 'sedan4', sedan_medio: 'sedan4', sedan_luxo: 'lux6', taxi_sp: 'sedan4', taxi_rio: 'sedan4', viatura: 'sedan4',
        esportivo: 'i6sport', muscle: 'v8muscle', super: 'v12super', super2: 'v10super',
        picape_pequena: 'small4', picape_media: 'diesel4', picape_grande: 'v8truck', van_furgao: 'diesel4', minivan: 'sedan4',
        swat_van: 'diesel4', militar: 'diesel4', moto: 'moto1', jetski: 'outboard', lancha: 'v8marine', barco: 'diesel6',
    },
    AMBIENT: 3,               // carros do trânsito com som ao mesmo tempo
    AMBIENT_DIST: 55,         // até onde se ouve um carro do trânsito (m)

    _bufs: {},
    player: null,             // { car, voice }
    ambient: [],              // [{ car, voice }]
    bus: null,

    profileOf(car) {
        if (!car || !car.spec || car.spec.bike === 'bike' || car.spec.id === 'bicycle') return null;
        const k = this.MODEL[car.spec.id] || (car.spec.boat ? 'outboard' : car.spec.bike ? 'moto1' : 'sedan4');
        return Object.assign({ key: k }, this.PROFILES[k]);
    },

    // ------------------------------------------------------------------ buffers do ciclo do motor
    _rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); },

    _cycle(P, base) {
        const key = P.key + '@' + base;
        if (this._bufs[key]) return this._bufs[key];
        const ctx = AudioFX.ctx, SR = ctx.sampleRate, rnd = this._rng(base * 31 + P.key.length * 977 + P.cyl * 7);
        const cycT = (P.two ? 60 : 120) / base, per = Math.round(cycT * SR), nCyc = Math.max(4, Math.ceil(0.5 / cycT)), N = per * nCyc;
        const d = new Float32Array(N);
        const tau = P.tau * (base > 2000 ? 0.7 : 1), L = Math.min(Math.round(tau * 7 * SR), N), W = [1, 0.55, 0.3];
        const res = P.res.map((f) => f * (base > 2000 ? 1.25 : 1));
        for (let c = 0; c < nCyc; c++) for (let k = 0; k < P.cyl; k++) {
            const off = k / P.cyl + (P.lag ? P.lag[k] : 0) + (rnd() - 0.5) * P.rough * 0.06 / P.cyl;
            const s0 = Math.round((c + off) * per), amp = (P.bank ? P.bank[k] : 1) * (1 + (rnd() - 0.5) * P.rough * 1.6);
            const fj = 1 + (rnd() - 0.5) * 0.04;
            // senoides amortecidas por RECORRÊNCIA (rotação + decaimento multiplicativo): sem sin/exp por amostra
            const cx = [], cy = [], rc = [], rs = [], dk = [];
            for (let i = 0; i < 3; i++) {
                const w = 6.2832 * res[i] * fj / SR, ph = rnd() * 6.2832;
                cx.push(Math.cos(ph) * W[i]); cy.push(Math.sin(ph) * W[i]); rc.push(Math.cos(w)); rs.push(Math.sin(w)); dk.push(Math.exp(-1 / (SR * tau * (1 - i * 0.22))));
            }
            const dn = Math.exp(-1 / (SR * tau * 0.45)), dkn = Math.exp(-1 / (SR * 0.0013)), da = Math.exp(-1 / (SR * 0.0005));
            let en = P.noise, ek = P.knock || 0, ea = 1;
            for (let j = 0; j < L; j++) {
                let s = 0;
                for (let i = 0; i < 3; i++) {
                    const x = cx[i] * rc[i] - cy[i] * rs[i], y = cx[i] * rs[i] + cy[i] * rc[i];
                    cx[i] = x * dk[i]; cy[i] = y * dk[i]; s += y;
                }
                s += en * (rnd() * 2 - 1); en *= dn;
                if (ek) { s += ek * (rnd() * 2 - 1); ek *= dkn; }                   // batida do diesel (estalo agudo a cada injeção)
                d[(s0 + j) % N] += amp * (1 - ea) * s; ea *= da;
            }
        }
        let mean = 0, peak = 0;
        for (let i = 0; i < N; i++) mean += d[i];
        mean /= N;
        for (let i = 0; i < N; i++) { d[i] -= mean; peak = Math.max(peak, Math.abs(d[i])); }
        const b = ctx.createBuffer(1, N, SR), ch = b.getChannelData(0), g = 0.85 / (peak || 1);
        for (let i = 0; i < N; i++) ch[i] = d[i] * g;
        return (this._bufs[key] = b);
    },

    // Pronto para tocar sem travar? (os dois buffers do perfil já assados)
    _ready(P) { return P.electric || (this._bufs[P.key + '@1000'] && this._bufs[P.key + '@4500']); },
    // Assa os buffers em segundo plano: no máximo um por quadro (os perfis pedidos agora vêm primeiro).
    _want(P) { if (!this._ready(P)) (this._queue || (this._queue = [])).unshift(P.key); },
    _warm() {
        if (!this._qInit) { this._qInit = true; this._queue = (this._queue || []).concat(Object.keys(this.PROFILES).filter((k) => !this.PROFILES[k].electric)); }
        const Q = this._queue;
        while (Q.length) {
            const k = Q[0], P = Object.assign({ key: k }, this.PROFILES[k]);
            if (this._ready(P)) { Q.shift(); continue; }
            this._cycle(P, this._bufs[k + '@1000'] ? 4500 : 1000);
            return;
        }
    },

    _curve() {
        if (this._crv) return this._crv;
        const n = 1024, c = new Float32Array(n);
        for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(2.6 * x) / Math.tanh(2.6); }
        return (this._crv = c);
    },

    _bus() {
        if (this.bus) return this.bus;
        const ctx = AudioFX.ctx, g = ctx.createGain(), comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2;
        g.connect(comp); comp.connect(AudioFX.master);
        return (this.bus = g);
    },

    // ------------------------------------------------------------------ voz (um motor tocando)
    _voice(P) {
        const ctx = AudioFX.ctx, bus = this._bus(), v = { P, nodes: [], dead: false };
        const mk = (n) => { v.nodes.push(n); return n; };
        v.out = mk(ctx.createGain()); v.out.gain.value = 0;
        if (ctx.createStereoPanner) { v.pan = mk(ctx.createStereoPanner()); v.out.connect(v.pan); v.pan.connect(bus); } else v.out.connect(bus);
        if (P.electric) {
            v.w1 = mk(ctx.createOscillator()); v.w1.type = 'sine';
            v.w2 = mk(ctx.createOscillator()); v.w2.type = 'triangle';
            v.wg = mk(ctx.createGain()); v.wg.gain.value = 0;
            v.w1.connect(v.wg); v.w2.connect(v.wg); v.wg.connect(v.out);
            v.hum = mk(ctx.createOscillator()); v.hum.type = 'sine'; v.hum.frequency.value = 60;
            v.hg = mk(ctx.createGain()); v.hg.gain.value = 0.15; v.hum.connect(v.hg); v.hg.connect(v.out);
            v.w1.start(); v.w2.start(); v.hum.start();
            return v;
        }
        // corpo: dois loops do ciclo (1000 e 4500 rpm) → distorção → filtro → (graves) → saída
        v.lo = mk(ctx.createBufferSource()); v.lo.buffer = this._cycle(P, 1000); v.lo.loop = true;
        v.hi = mk(ctx.createBufferSource()); v.hi.buffer = this._cycle(P, 4500); v.hi.loop = true;
        v.gLo = mk(ctx.createGain()); v.gHi = mk(ctx.createGain()); v.gHi.gain.value = 0;
        v.pre = mk(ctx.createGain());
        v.shp = mk(ctx.createWaveShaper()); v.shp.curve = this._curve(); v.shp.oversample = '2x';
        v.lp = mk(ctx.createBiquadFilter()); v.lp.type = 'lowpass'; v.lp.Q.value = 0.9;
        v.lo.connect(v.gLo); v.hi.connect(v.gHi); v.gLo.connect(v.pre); v.gHi.connect(v.pre); v.pre.connect(v.shp); v.shp.connect(v.lp);
        let tail = v.lp;
        if (P.bass) { v.bs = mk(ctx.createBiquadFilter()); v.bs.type = 'lowshelf'; v.bs.frequency.value = 160; v.bs.gain.value = P.bass; tail.connect(v.bs); tail = v.bs; }
        v.body = mk(ctx.createGain()); tail.connect(v.body); v.body.connect(v.out);
        // admissão/escape: ruído em banda que acompanha o giro
        v.nz = mk(ctx.createBufferSource()); v.nz.buffer = AudioFX._noise(); v.nz.loop = true;
        v.nbp = mk(ctx.createBiquadFilter()); v.nbp.type = 'bandpass'; v.nbp.Q.value = 1.1;
        v.ng = mk(ctx.createGain()); v.ng.gain.value = 0;
        v.nz.connect(v.nbp); v.nbp.connect(v.ng); v.ng.connect(v.out);
        // grito (V10/V12/6 em linha esportivo): dente-de-serra na frequência de ignição, em banda no 2º harmônico
        if (P.scream) {
            v.sc = mk(ctx.createOscillator()); v.sc.type = 'sawtooth';
            v.sbp = mk(ctx.createBiquadFilter()); v.sbp.type = 'bandpass'; v.sbp.Q.value = 2.2;
            v.sg = mk(ctx.createGain()); v.sg.gain.value = 0;
            v.sc.connect(v.sbp); v.sbp.connect(v.sg); v.sg.connect(v.out); v.sc.start();
        }
        // assobio do turbo
        if (P.turbo) { v.tw = mk(ctx.createOscillator()); v.tw.type = 'sine'; v.tg = mk(ctx.createGain()); v.tg.gain.value = 0; v.tw.connect(v.tg); v.tg.connect(v.out); v.tw.start(); }
        // motor de arranque: zumbido agudo com o "puxão" de cada compressão
        v.st = mk(ctx.createOscillator()); v.st.type = 'sawtooth'; v.st.frequency.value = P.starter || 180;
        v.sbp2 = mk(ctx.createBiquadFilter()); v.sbp2.type = 'bandpass'; v.sbp2.frequency.value = (P.starter || 180) * 5; v.sbp2.Q.value = 1.4;
        v.stg = mk(ctx.createGain()); v.stg.gain.value = 0;
        v.st.connect(v.sbp2); v.sbp2.connect(v.stg); v.stg.connect(v.out); v.st.start();
        v.lo.start(0, Math.random() * 0.3); v.hi.start(0, Math.random() * 0.3); v.nz.start(0, Math.random());
        return v;
    },

    _free(v) {
        if (!v || v.dead) return;
        v.dead = true;
        const t = AudioFX.ctx.currentTime;
        v.out.gain.cancelScheduledValues(t); v.out.gain.setTargetAtTime(0, t, 0.08);
        this._kill(v, 600);
    },
    _kill(v, ms) {
        v.dead = true;
        setTimeout(() => { for (const n of v.nodes) { try { if (n.stop) n.stop(); } catch (e) { /* já parado */ } try { n.disconnect(); } catch (e) { /* ok */ } } }, ms);
    },

    // ------------------------------------------------------------------ simulação: rotação, marcha e carga
    _state(car, P) {
        let s = car._eng;
        if (!s || s.key !== P.key) s = car._eng = { key: P.key, state: 'off', rpm: 0, gear: 1, load: 0, shiftT: 0, t: 0, flare: 0, boost: 0, lim: 0, prevLoad: 0, lastV: 0, popCd: 0 };
        return s;
    },

    _ratios(n) { return { 1: [1], 4: [0.3, 0.52, 0.76, 1.06], 5: [0.24, 0.42, 0.6, 0.8, 1.06], 6: [0.2, 0.35, 0.5, 0.66, 0.84, 1.06], 7: [0.17, 0.3, 0.43, 0.56, 0.7, 0.86, 1.06], 8: [0.15, 0.26, 0.37, 0.48, 0.6, 0.72, 0.86, 1.06] }[n]; },

    // Avança o motor do carro: devolve { rpm, load, rf } e dispara os eventos (troca, estalos, blow-off).
    _sim(car, P, s, dt, mine) {
        const fwd = car.forwardSpeed, v = Math.abs(fwd), max = car.spec.maxSpeed * (mine ? 1 + (typeof SkillTree !== 'undefined' ? SkillTree.m.topSpeed || 0 : 0) : 1);
        let thr;
        if (mine) thr = car.throttle || 0;
        else { const a = (v - s.lastV) / Math.max(dt, 1e-3); thr = car.accelerating ? Math.min(1, 0.35 + Math.max(0, a) / 3) : (a < -1 ? -0.5 : 0); }
        s.lastV = v;
        const R = this._ratios(P.gears) || this._ratios(5), idle = P.idle, red = P.red;
        const forward = fwd > -0.3 && !(thr < -0.05 && v < 0.6 && fwd < 0.3);
        let want, load = forward ? Math.max(0, thr) : Math.abs(Math.min(0, thr));
        if (forward && thr < 0) load = 0;                                     // freando: motor solto
        if (P.gears === 1) {                                                  // barco: hélice direto, o giro segue a carga e a velocidade
            want = idle + (red - idle) * Math.min(1, 0.55 * v / max + 0.5 * load);
        } else if (!forward) {
            s.gear = 0;
            want = idle + (red * 0.7 - idle) * Math.min(1, v / (max * 0.24)) + 600 * load;
        } else {
            if (s.gear < 1) s.gear = 1;
            const rg = (g) => idle * 0.85 + (red - idle * 0.85) * v / (max * R[g - 1]);
            if (s.shiftT <= 0) {
                const upAt = red * (0.58 + 0.34 * load);
                if (s.gear < R.length && rg(s.gear) > upAt) { s.gear++; s.shiftT = P.cyl >= 10 ? 0.12 : 0.2; this._onShift(car, P, s, load); }
                else if (s.gear > 1 && (rg(s.gear) < idle * 1.3 || (load > 0.85 && rg(s.gear - 1) < red * 0.74))) { s.gear--; s.shiftT = 0.16; }
            }
            want = rg(s.gear);
            if (s.gear === 1) want = Math.max(want, idle + (red * 0.5 - idle) * load * Math.max(0, 1 - v / (max * R[0])));      // embreagem patinando na saída
        }
        want = Math.max(idle, want);
        if (s.shiftT > 0) { s.shiftT -= dt; load *= 0.12; }
        if (want >= red * 0.995) {                                             // corte de giro
            want = red; s.lim = (s.lim + dt * 15) % 1;
            if (s.lim < 0.5) { load *= 0.25; want = red * 0.955; }
        }
        if (s.flare > 0) { s.flare -= dt; want = Math.max(want, idle * (1 + 1.0 * Math.max(0, s.flare) / 0.7)); }         // acelerada de quem acabou de ligar
        const k = want > s.rpm ? (P.cyl >= 10 ? 10 : 7) : 4.5;
        s.rpm += (want - s.rpm) * (1 - Math.exp(-k * (s.shiftT > 0 ? 2.2 : 1) * dt));
        s.rpm *= 1 + (P.rough || 0) * 0.04 * Math.sin(performance.now() / 1000 * (3.1 + P.cyl * 0.3)) * dt * 8;          // marcha lenta "respirando"
        const L = 0.12 + 0.88 * load;
        // tirou o pé em giro alto: estalos de escape (esportivos) e o blow-off do turbo
        if (P.pops && s.prevLoad > 0.7 && L < 0.25 && s.rpm > red * 0.5) this._pops(car, P, 2 + Math.floor(Math.random() * 4 * P.pops));
        if (P.turbo && s.boost > 0.55 && s.prevLoad > 0.6 && L < 0.25) this._blowoff(car, P, s.boost);
        s.load += (L - s.load) * (1 - Math.exp(-14 * dt));
        s.prevLoad = L;
        s.boost += ((P.turbo ? load * Math.min(1, s.rpm / (red * 0.6)) : 0) - s.boost) * (1 - Math.exp(-(load > s.boost ? 1.6 : 5) * dt));
        return { rpm: s.rpm, load: s.load, rf: Math.max(0, Math.min(1, (s.rpm - idle) / (red - idle))) };
    },

    _onShift(car, P, s, load) {
        if (load > 0.75 && P.pops) this._pops(car, P, 1);                    // estalo na troca com o pé embaixo
        if (P.turbo && s.boost > 0.6 && load > 0.6) this._blowoff(car, P, s.boost * 0.6);
    },

    _pops(car, P, n) {
        const p = car.position;
        for (let i = 0; i < n; i++) setTimeout(() => {
            AudioFX._burst(p.x, p.z, { vol: 0.35 * P.pops, dur: 0.03 + Math.random() * 0.05, f0: 2400 + Math.random() * 1600, f1: 400, maxDist: 70, type: 'bandpass', q: 0.9 });
            if (Math.random() < 0.5) AudioFX._burst(p.x, p.z, { vol: 0.3 * P.pops, dur: 0.06, f0: 500, f1: 90, maxDist: 70 });
        }, 40 + i * (60 + Math.random() * 140));
    },

    _blowoff(car, P, boost) {
        const p = car.position;
        AudioFX._burst(p.x, p.z, { vol: 0.16 * P.turbo * boost, dur: 0.38, f0: 5200, f1: 1500, maxDist: 45, type: 'highpass', q: 0.8 });
    },

    // ------------------------------------------------------------------ escrever os parâmetros na voz
    _apply(v, P, sim, gain, pan, extra = {}) {
        const t = AudioFX.ctx.currentTime, tc = 0.035, set = (prm, val, c = tc) => prm.setTargetAtTime(val, t, c);
        if (v.pan) set(v.pan.pan, pan, 0.08);
        if (P.electric) {
            const sp = extra.speed || 0;
            set(v.w1.frequency, 180 + sp * 52); set(v.w2.frequency, 360 + sp * 104);
            set(v.wg.gain, (0.05 + 0.12 * sim.load) * Math.min(1, 0.15 + sp / 8));
            set(v.out.gain, gain * P.vol);
            return;
        }
        const rpm = Math.max(60, sim.rpm), x = Math.max(0, Math.min(1, (rpm - 1600) / 2000));
        set(v.lo.playbackRate, rpm / 1000); set(v.hi.playbackRate, rpm / 4500);
        set(v.gLo.gain, Math.cos(x * 1.5708)); set(v.gHi.gain, Math.sin(x * 1.5708));
        set(v.pre.gain, 0.55 + P.drive * 0.75 * sim.load);
        set(v.lp.frequency, (P.lp[0] + (P.lp[1] - P.lp[0]) * sim.rf) * (0.5 + 0.5 * sim.load) * (extra.lpMul || 1));
        set(v.body.gain, (0.34 + 0.66 * sim.load) * (0.62 + 0.38 * sim.rf));
        set(v.nbp.frequency, 260 + rpm * 0.38);
        set(v.ng.gain, P.noise * 0.22 * sim.load * (0.3 + sim.rf));
        const fire = rpm / 60 * P.cyl / (P.two ? 1 : 2);
        if (v.sc) { set(v.sc.frequency, fire); set(v.sbp.frequency, fire * 2); set(v.sg.gain, P.scream * 0.2 * sim.load * sim.rf * sim.rf); }
        if (v.tw) { const b = extra.boost || 0; set(v.tw.frequency, 1700 + b * 5200); set(v.tg.gain, P.turbo * 0.022 * b * b); }
        set(v.stg.gain, extra.starter || 0, 0.02);
        set(v.out.gain, gain * P.vol, extra.fast ? 0.012 : 0.05);
    },

    // ------------------------------------------------------------------ por quadro
    // O motor do carro do jogador ainda não pegou (arranque) ou morreu? Então o Vehicle não dá força. Só vale com o áudio rodando
    // de verdade (sem som liberado, o estado do motor não anda — o carro não pode ficar preso esperando a partida).
    gates(car) {
        const s = car._eng;
        if (!s || !this._liveAt || performance.now() - this._liveAt > 400 || !this.player || this.player.car !== car) return false;
        return s.state === 'crank' || s.state === 'off' || s.state === 'stall';
    },

    update(game, dt) {
        if (!AudioFX.ctx || AudioFX.ctx.state !== 'running') return;
        this._liveAt = performance.now();
        this._warm();
        const bus = this._bus(), t = AudioFX.ctx.currentTime;
        bus.gain.setTargetAtTime(AudioFX.muted ? 0 : 1, t, 0.05);
        this._updatePlayer(game, dt);
        this._updateAmbient(game, dt);
    },

    // Motor do veículo do jogador: ignição, ronco, morrer, desligar.
    _updatePlayer(game, dt) {
        const car = game.mode === 'car' && game.activeCar && !game.activeCar.wrecked ? game.activeCar : null, P = car && this.profileOf(car);
        const cur = this.player;
        if (cur && (cur.car !== car)) {                                        // desceu / trocou de veículo: desliga o motor
            const s = cur.car._eng;
            if (s && s.state !== 'off') { s.state = 'stop'; s.t = 0; this._shutdown(cur); }
            else this._free(cur.voice);
            this.player = null;
        }
        if (!car || !P) return;
        if (!this.player) {
            const s = this._state(car, P);
            this._dropAmbient(car);                                            // (estava roncando como trânsito)
            this.player = { car, voice: this._voice(P) };
            if (s.state !== 'run') this._ignite(car, P, s);
        }
        const { voice } = this.player, s = car._eng;
        s.t += dt;
        const fuelOut = car.tank > 0 && car.fuel <= 0, broken = car.engineDead;
        let starter = 0, gain = 0.42, fast = false;
        if (s.state === 'crank') {
            // arranque: 230 rpm de compressão; ligação direta = tentativas de 0,9 s com pausas
            const hot = car.hotwire > 0, cyc = hot ? s.t % 1.5 : s.t, on = !hot || cyc < 0.9;
            s.rpm = on ? 200 + 60 * Math.sin(s.t * 23) : Math.max(0, s.rpm - dt * 900);
            starter = on ? 0.05 : 0;
            if (P.electric) { if (s.t > 0.1) { s.state = 'run'; this._chime(); } }
            else if (!hot && s.t >= s.crankDur) {
                if (fuelOut || broken) { s.state = 'off'; s.rpm = 0; s.failed = true; }
                else { s.state = 'run'; s.flare = 0.7; s.rpm = P.idle * 1.3; if (P.sputter) s.sput = 0.6; }
            }
            this._apply(voice, P, { rpm: s.rpm, load: 0.22, rf: 0 }, on ? gain * 0.75 : 0.0, 0, { starter, lpMul: 0.7, fast: true });
            return;
        }
        if (s.state === 'run' && (fuelOut || broken)) { s.state = 'stall'; s.t = 0; }
        if (s.state === 'off') {
            // parado e desligado com o jogador dentro: acelerar tenta ligar de novo (se der)
            const press = Math.abs(car.throttleIn || 0) > 0.1, edge = press && !s.pressed; s.pressed = press;
            if (press && (!s.failed || edge)) this._ignite(car, P, s);           // (sem gasolina / motor quebrado: cada pisada gira o arranque, mas não pega)
            if (s.failed && !fuelOut && !broken) s.failed = false;
            this._apply(voice, P, { rpm: 0, load: 0, rf: 0 }, 0, 0);
            return;
        }
        const sim = this._sim(car, P, s, dt, true);
        if (s.state === 'stall') {                                             // engasga: cortes rápidos e o giro despencando
            s.rpm = Math.max(0, s.rpm - dt * P.idle * 0.9);
            gain *= Math.random() < 0.35 ? 0.05 : Math.max(0, 1 - s.t);
            fast = true;
            if (s.t > 1 || s.rpm < P.idle * 0.3) { s.state = 'off'; s.rpm = 0; s.failed = true; if (game._flash) game._flash(fuelOut ? 'O motor morreu: tanque vazio' : 'O motor morreu'); }
        } else if (s.sput > 0) { s.sput -= dt; if (Math.random() < 0.25) { gain *= 0.25; fast = true; } }           // carro velho pegando "falhando"
        this._apply(voice, P, sim, gain, 0, { boost: s.boost, speed: Math.abs(car.forwardSpeed), fast });
    },

    _ignite(car, P, s) {
        s.state = 'crank'; s.t = 0; s.failed = false;
        s.crankDur = (P.crank || 0.6) * (0.8 + Math.random() * 0.5) * (car.hpFrac < 0.4 ? 1.6 : 1);
        if (car.tank > 0 && car.fuel <= 0) s.crankDur = 1.4;
    },

    _shutdown(entry) {
        const v = entry.voice, s = entry.car._eng, P = v.P, t0 = AudioFX.ctx.currentTime;
        if (!P.electric) {
            v.lo.playbackRate.cancelScheduledValues(t0); v.hi.playbackRate.cancelScheduledValues(t0);
            v.lo.playbackRate.setValueAtTime(Math.max(0.1, s.rpm / 1000), t0); v.lo.playbackRate.linearRampToValueAtTime(0.12, t0 + 0.55);
            v.hi.playbackRate.setValueAtTime(Math.max(0.05, s.rpm / 4500), t0); v.hi.playbackRate.linearRampToValueAtTime(0.03, t0 + 0.55);
            v.gLo.gain.setTargetAtTime(1, t0, 0.05); v.gHi.gain.setTargetAtTime(0, t0, 0.05);
        }
        v.out.gain.cancelScheduledValues(t0); v.out.gain.setTargetAtTime(0, t0 + 0.25, 0.12);
        s.state = 'off'; s.rpm = 0;
        const p = entry.car.position;
        setTimeout(() => AudioFX._burst(p.x, p.z, { vol: 0.12, dur: 0.12, f0: 380, f1: 60, maxDist: 30 }), 520);       // o "tranco" do motor parando
        this._kill(v, 1400);
    },

    _chime() {
        AudioFX.blip(660, 0.12, 0.1);
        setTimeout(() => AudioFX.blip(990, 0.16, 0.09), 130);
    },

    // Trânsito: os AMBIENT carros com motorista mais perto do ouvinte.
    _updateAmbient(game, dt) {
        this._ambT = (this._ambT || 0) - dt;
        const L = AudioFX.listener, me = this.player && this.player.car;
        if (this._ambT <= 0) {
            this._ambT = 0.4;
            const pick = [];
            for (const c of game.carDamage ? game.carDamage.allCars() : []) {
                if (c === me || c.controlled || c.wrecked || c.engineDead || c.driver === false || c.mode === 'parked' || c.mode === 'abandoned' || c.mode === 'anchored' || (c.isBike && c.riderVariant == null)) continue;
                const Pc = this.profileOf(c);
                if (!Pc) continue;
                if (!this._ready(Pc)) { this._want(Pc); continue; }                // (ainda assando o som desse motor)
                const d = hypot(c.position.x - L.x, c.position.z - L.z);
                if (d < this.AMBIENT_DIST) pick.push([d, c]);
            }
            pick.sort((a, b) => a[0] - b[0]);
            const want = pick.slice(0, this.AMBIENT).map((p) => p[1]);
            for (const a of this.ambient) if (!want.includes(a.car)) this._free(a.voice);
            this.ambient = this.ambient.filter((a) => want.includes(a.car));
            for (const c of want) if (!this.ambient.some((a) => a.car === c)) {
                const P = this.profileOf(c), s = this._state(c, P);
                if (s.state !== 'run') { s.state = 'run'; s.rpm = P.idle; }
                this.ambient.push({ car: c, voice: this._voice(P) });
            }
        }
        // o trânsito some longe da câmera (TrafficManager descarta o carro): solta a voz antes de ler o corpo físico
        for (const a of this.ambient) if (this._gone(a.car)) this._free(a.voice);
        this.ambient = this.ambient.filter((a) => !a.voice.dead);
        for (const a of this.ambient) {
            const c = a.car, P = a.voice.P, s = c._eng, p = c.position;
            const d = hypot(p.x - L.x, p.z - L.z), g = d > this.AMBIENT_DIST ? 0 : Math.pow(1 - d / this.AMBIENT_DIST, 1.6) * 0.24;
            const sim = this._sim(c, P, s, dt, false);
            this._apply(a.voice, P, sim, g, Math.max(-1, Math.min(1, (p.x - L.x) / 35)), { boost: s.boost, speed: Math.abs(c.forwardSpeed), lpMul: 0.8 });
        }
    },

    _gone(c) { return !c.body || (c.body.isDisposed && c.body.isDisposed()) || !c.phys; },

    _dropAmbient(car) {
        const i = this.ambient.findIndex((a) => a.car === car);
        if (i >= 0) { this._free(this.ambient[i].voice); this.ambient.splice(i, 1); }
    },
};
