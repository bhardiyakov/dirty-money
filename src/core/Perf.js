// ============================================================================
// Perf — medidor barato do custo de cada sistema por quadro + "capacidade" (quanto o jogo ainda pode crescer).
//   • lap(nome): soma o tempo desde o lap anterior na seção `nome` (performance.now, ~1 µs). O _update marca as fronteiras dos sistemas;
//     o _render separa a cena (Babylon) da física. Média móvel exponencial (~2 s) por seção.
//   • capacity(): de 0 a 100% — quanto sobra antes de o jogo NÃO segurar mais 30 FPS ou começar a apertar a memória. É o MENOR de três folgas:
//       CPU  = 1 − (tempo de trabalho do quadro ÷ orçamento). O orçamento é 33,3 ms (30 FPS) × 0,8 (deixa 20% para o navegador, GC e
//              picos). O tempo de trabalho é medido (update + render + física), não o intervalo entre quadros — por isso a barra mede
//              folga real mesmo com o teto de 30 FPS escondendo o quanto o aparelho aguentaria.
//       PICO = mesma conta com o p95 dos quadros dos últimos ~3 s (engasgos frequentes contam, não só a média; um GC isolado não).
//       MEM  = 1 − (heap JS usado ÷ orçamento). Orçamento = min(1 GB, 60% do limite do heap do navegador). Sem performance.memory
//              (Firefox/Safari) a folga de memória fica de fora.
//       RITMO = o intervalo REAL entre quadros (inclui a GPU): acima de ~36 ms o aparelho já não segura 30 FPS e a barra cai a 0.
//     Também acompanha a TENDÊNCIA do heap (MB/min, regressão linear numa janela de ~2 min): subindo sem parar = vazamento.
// ============================================================================

const Perf = {
    sec: {},                   // nome → { ms (quadro atual), avg (média) }
    order: [],
    _t: 0, _f0: 0,
    frameMs: 0, frameAvg: 0,   // trabalho real do quadro (ms)
    _peaks: [], peak: 0, p95: 0,   // pior quadro da janela e o p95
    _heap: [],                 // [t (s), MB] amostrados a cada 3 s
    heapMB: 0, heapSlope: 0, heapLimitMB: 0,
    budgetMs: 1000 / 30 * 0.8,
    hitchMs: 250,              // acima disso o quadro é um ENGASGO: entra limitado na média (ver frameEnd)
    hitch: null,               // último engasgo: { ms, sec (sistema que mais gastou), secMs, at }

    frameStart() {
        const n = performance.now();
        if (this._f0) { const iv = n - this._f0; if (iv < 500) this.interval = this.interval ? this.interval * 0.94 + iv * 0.06 : iv; }
        this._t = this._f0 = n;
        const m = performance.memory; this._h0 = m ? m.usedJSHeapSize : 0;      // (engasgo + heap caindo = coleta de lixo, ver frameEnd)
        HangProbe.frameStart();
    },
    interval: 0,               // intervalo REAL entre quadros (ms): inclui a GPU e o navegador
    lap(name) {
        const n = performance.now();
        let s = this.sec[name];
        if (!s) { s = this.sec[name] = { ms: 0, avg: 0 }; this.order.push(name); }
        s.ms += n - this._t; this._t = n;
        HangProbe.lap(name);
    },
    frameEnd() {
        const n = performance.now(), f = n - this._f0;
        this.frameMs = f;
        // Um quadro isolado enorme (compilar shader na 1ª vez que algo aparece, GC grande, a janela travada pelo sistema) não pode
        // dominar a MÉDIA: um de 15 s sozinho a punha em ~900 ms com o p95 em 10 ms. A média recebe no máximo `hitchMs`; o quadro
        // inteiro vai para o pico/p95 e fica anotado em `hitch` (quanto durou e qual sistema gastou mais), mostrado no painel dev.
        const k = f > this.hitchMs ? this.hitchMs / f : 1;
        if (f > this.hitchMs) {
            let worst = '', wm = 0;
            for (const name of this.order) { const s = this.sec[name]; if (s.ms > wm) { wm = s.ms; worst = name; } }
            // Se o heap caiu muito neste quadro, foi uma COLETA DE LIXO grande: ela pausa o jogo onde estiver, e a seção "culpada" é
            // só quem estava rodando na hora — gcMB diz quanto foi liberado (aí o remédio é alocar menos, não mexer na seção).
            const m = performance.memory, gcMB = m && this._h0 ? (this._h0 - m.usedJSHeapSize) / 1048576 : 0;
            this.hitch = { ms: f, sec: worst, secMs: wm, at: n, gcMB };
        }
        this.frameAvg = this.frameAvg ? this.frameAvg * 0.94 + f * k * 0.06 : f * k;
        for (const name of this.order) { const s = this.sec[name]; s.avg = s.avg * 0.94 + s.ms * k * 0.06; s.ms = 0; }
        this._peaks.push(f); if (this._peaks.length > 90) this._peaks.shift();        // ~3 s a 30 FPS
        let p = 0; for (const v of this._peaks) if (v > p) p = v; this.peak = p;
        if ((this._pk = (this._pk || 0) + 1) % 15 === 0) { const srt = this._peaks.slice().sort((x, y) => y - x); this.p95 = srt[Math.min(srt.length - 1, 4)] || 0; }    // 5º pior de 90 ≈ p95
    },

    // Amostra de memória (chamada pela varredura de 3 s — ver World maintenance em game.js).
    sampleHeap() {
        const m = performance.memory;
        if (!m) return;
        const t = performance.now() / 1000, mb = m.usedJSHeapSize / 1048576;
        this.heapMB = mb; this.heapLimitMB = m.jsHeapSizeLimit / 1048576;
        this._heap.push([t, mb]); if (this._heap.length > 40) this._heap.shift();       // 40 × 3 s = 2 min
        const H = this._heap, n = H.length;
        if (n < 8) { this.heapSlope = 0; return; }
        let sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (const [x, y] of H) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
        this.heapSlope = (n * sxy - sx * sy) / Math.max(1e-6, n * sxx - sx * sx) * 60;    // MB/min
    },

    // Folgas de 0 a 1 e a capacidade (a menor delas).
    capacity() {
        const cpu = 1 - this.frameAvg / this.budgetMs;
        const peak = 1 - (this.p95 || 0) / (1000 / 30);                              // engasgos frequentes (p95: um GC isolado não zera a barra)
        const memBudget = this.heapLimitMB ? Math.min(1024, this.heapLimitMB * 0.6) : 0;
        const mem = memBudget ? 1 - this.heapMB / memBudget : 1;
        // RITMO: se o intervalo real passa de ~36 ms, o aparelho já não segura 30 FPS (GPU ou navegador no limite, mesmo com a CPU folgada).
        const pace = 1 - Math.max(0, this.interval - 1000 / 30 * 1.08) / (1000 / 30);
        const c = (v) => Math.max(0, Math.min(1, v));
        const out = { cpu: c(cpu), peak: c(peak), mem: c(mem), pace: c(pace), memBudget };
        out.total = Math.min(out.cpu, out.peak, out.mem, out.pace);
        out.limit = out.total === out.pace && out.pace < 1 ? 'GPU/ritmo (< 30 FPS)' : out.total === out.cpu ? 'CPU (média)' : out.total === out.peak ? 'engasgos (pico)' : 'memória';
        // Quantas vezes o conteúdo atual ainda cabe (o custo cresce ~linear com entidades/malhas ativas).
        out.growth = Math.max(0, Math.min(this.budgetMs / Math.max(0.1, this.frameAvg), memBudget ? memBudget / Math.max(1, this.heapMB) : 99));
        return out;
    },

    // Seções ordenadas pelo custo médio (para o painel).
    top(n = 12) { return this.order.map((k) => [k, this.sec[k].avg]).sort((a, b) => b[1] - a[1]).slice(0, n); },
};
