// ============================================================================
// SoundBank — sons GRAVADOS (assets/sfx: passos em cada chão, tiros, cápsulas, socos, batidas, vidro, pneu, sirene, buzina,
// burburinho, motor, câmbio). As gravações são de domínio público/CC0 (ver assets/sfx/CREDITOS.md); tools/sfx/build_sfx.py recorta,
// normaliza e monta os loops.
//
//   sfx.json: { grupo: [{ f: arquivo, d: duração, rpm?, ls?, le? }, …] } — cada grupo tem variações (passo_1…5), sorteadas sem
//   repetir a última, com um tom levemente diferente a cada vez (rate ± jitter). Loops (ls/le): o trecho de ls a le emenda sem
//   buraco mesmo com o atraso do decodificador de MP3.
//   Carrega depois do 1º gesto (AudioFX.init); enquanto não chega, cada som cai no sintetizado de antes (play devolve null).
//   Longe: mais baixo e mais abafado (o ar come os agudos); o lado segue o pan de AudioFX._spatial.
// ============================================================================

const SoundBank = {
    base: 'assets/sfx/',
    man: null,                 // sfx.json
    bufs: {},                  // grupo → [AudioBuffer|undefined, …] (na ordem do manifesto)
    _last: {},                 // grupo → última variação tocada
    ready: false,              // manifesto lido e todos os pedidos feitos
    loaded: 0, failed: 0,
    played: {},                // grupo → quantas vezes tocou (testes / depuração)
    off: false,                // (testes: força o sintetizado)

    // Começa a baixar tudo (1,2 MB). Os que o jogo mais usa primeiro: passos, tiros, motor.
    load() {
        if (this._loading || typeof fetch === 'undefined' || !AudioFX.ctx) return;
        this._loading = true;
        fetch(this.base + 'sfx.json').then((r) => r.json()).then((m) => {
            this.man = m;
            const first = /^(step_|run_|gun_|eng_|starter|tire|siren|crash|punch)/, keys = Object.keys(m);
            const order = keys.filter((k) => first.test(k)).concat(keys.filter((k) => !first.test(k)));
            const jobs = [];
            for (const g of order) m[g].forEach((e, i) => jobs.push([g, i, e]));
            let at = 0;
            const next = () => {
                if (at >= jobs.length) return;
                const [g, i, e] = jobs[at++];
                this._fetch(e.f).then((b) => { (this.bufs[g] || (this.bufs[g] = []))[i] = b; this.loaded++; }, () => { this.failed++; }).then(next);
            };
            for (let k = 0; k < 6; k++) next();                                    // (6 de cada vez)
            this.ready = true;
        }).catch(() => { this._loading = false; });
    },
    _fetch(f) {
        return fetch(this.base + f).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
            .then((a) => new Promise((ok, no) => { const p = AudioFX.ctx.decodeAudioData(a, ok, no); if (p && p.catch) p.catch(no); }));
    },

    // O grupo tem alguma variação pronta?
    has(g) { const b = !this.off && this.bufs[g]; return !!(b && b.some((x) => x)); },
    // { buf, meta } de uma variação (sorteada, sem repetir a última quando há mais de uma).
    pick(g) {
        const B = this.bufs[g];
        if (this.off || !B) return null;
        const ok = []; for (let i = 0; i < B.length; i++) if (B[i]) ok.push(i);
        if (!ok.length) return null;
        let i = ok[Math.floor(Math.random() * ok.length)];
        if (ok.length > 1 && i === this._last[g]) i = ok[(ok.indexOf(i) + 1 + Math.floor(Math.random() * (ok.length - 1))) % ok.length];
        this._last[g] = i;
        return { buf: B[i], meta: this.man[g][i] };
    },

    // Toca uma variação do grupo. x/z = posição (null = no ouvinte, sem espaço); o = { vol, maxDist, rate, jitter, delay, dur, fo,
    // out (nó de saída), dark (abafar mais com a distância) }. Devolve o BufferSource (ou null: sem amostra → quem chamou usa o sintetizado).
    play(g, x, z, o = {}) {
        if (!AudioFX._ok()) return null;
        const v = this.pick(g);
        if (!v) return null;
        const ctx = AudioFX.ctx, vol = o.vol == null ? 0.5 : o.vol;
        let sp = { g: vol, pan: 0 }, d = 0;
        if (x != null) {
            sp = AudioFX._spatial(x, z, o.maxDist || 90, vol);
            if (!sp) return v && null;
            d = hypot(x - AudioFX.listener.x, z - AudioFX.listener.z) / (o.maxDist || 90);
        }
        const t0 = ctx.currentTime + (o.delay || 0), src = ctx.createBufferSource(), g0 = ctx.createGain();
        src.buffer = v.buf;
        src.playbackRate.value = (o.rate || 1) * (1 + ((Math.random() * 2 - 1) * (o.jitter == null ? 0.05 : o.jitter)));
        let head = src;
        if (d > 0.12 || o.lp) {                                                     // longe: o ar come os agudos
            const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
            lp.frequency.value = o.lp || Math.max(700, 16000 * Math.pow(1 - Math.min(1, d), (o.dark || 1) * 2.2));
            src.connect(lp); head = lp;
        }
        head.connect(g0);
        g0.gain.setValueAtTime(sp.g, t0);
        const dur = o.dur ? Math.min(o.dur, v.buf.duration) : 0;
        if (dur) { const fo = o.fo || 0.04; g0.gain.setValueAtTime(sp.g, t0 + Math.max(0, dur - fo)); g0.gain.linearRampToValueAtTime(0.0001, t0 + dur); }
        let out = g0;
        if (x != null && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = sp.pan; g0.connect(p); out = p; }
        out.connect(o.out || AudioFX.master);
        src.start(t0, o.offset || 0);
        if (dur) src.stop(t0 + dur + 0.02);
        this.played[g] = (this.played[g] || 0) + 1;
        return src;
    },

    // Loop contínuo do grupo (motor, sirene, pneu, multidão): { src, gain, meta } com ganho 0 — quem usa sobe o volume e a rotação.
    // Sem amostra pronta: null.
    loop(g, out) {
        if (!AudioFX.ctx) return null;
        const v = this.pick(g);
        if (!v) return null;
        const ctx = AudioFX.ctx, src = ctx.createBufferSource(), gain = ctx.createGain();
        src.buffer = v.buf; src.loop = true;
        const ls = v.meta.ls || 0, le = v.meta.le || v.buf.duration;
        src.loopStart = ls; src.loopEnd = Math.min(le, v.buf.duration);
        gain.gain.value = 0;
        src.connect(gain); gain.connect(out || AudioFX.master);
        src.start(0, ls + Math.random() * Math.max(0, le - ls - 0.05));
        this.played[g] = (this.played[g] || 0) + 1;
        return { src, gain, meta: v.meta };
    },
};
