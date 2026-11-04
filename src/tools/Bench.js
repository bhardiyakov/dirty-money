// ============================================================================
// Bench — o BENCHMARK de rota fixa do render: as mesmas cenas, nas mesmas horas e no mesmo clima, para comparar uma máquina com outra
// e uma mudança de gráficos com a anterior (cada etapa do upgrade visual tem de provar que não piorou isto).
//   • `?bench` na URL: roda sozinho depois da carga e mostra a tabela, com o botão para copiar (o resultado também fica no console
//     e em Bench.result). Junte `?gfx=low|medium|high|hd` para escolher o preset.
//   • tests/bench.cjs: o mesmo, no Chromium dos testes, nos presets Low e High (renderização por software: só compara etapas).
// Cada cena: teleporta, prepara o terreno em volta, espera aquecer (shaders, streaming) e mede N segundos. Durante a medição:
//   o TETO DE FPS sai (mede a folga real, até a taxa do monitor), o relógio e o clima ficam travados e o AutoQuality fica desligado
//   (ele trocaria a qualidade no meio da medição); tudo volta ao fim.
// Mede por quadro o intervalo real (inclui a GPU e o navegador) e amostra o RenderStats (GPU, desenhos, triângulos, sombra, memória)
// e o Perf (CPU do jogo).
// ============================================================================

const Bench = {
    SCENES: [
        { id: 'favela', name: 'Favela (início)', hour: 15, weather: 'clear', at: () => CityGrid.startPos() },
        { id: 'centro', name: 'Centro', hour: 15, weather: 'clear', at: () => CityGrid.center() },
        { id: 'lagoa', name: 'Lagoa', hour: 15, weather: 'clear', at: () => new BABYLON.Vector3(-330, 0, -560) },
        { id: 'mata', name: 'Mata atlântica', hour: 15, weather: 'clear', at: () => new BABYLON.Vector3(-700, 0, 420) },
        { id: 'noite', name: 'Centro à noite com chuva', hour: 21.5, weather: 'rain', at: () => CityGrid.center() },
    ],
    running: false,
    result: null,

    // opts: { warmS, warmFrames, measureS, measureFrames, uncapped, only: ['centro', ...] } — mínimo de tempo E de quadros em cada fase;
    // `only` roda só essas cenas (pelo id).
    async run(game, opts = {}) {
        if (this.running) return null;
        this.running = true;
        const o = Object.assign({ warmS: 3, warmFrames: 15, measureS: 8, measureFrames: 40, uncapped: true }, opts);
        RenderStats.enable(game);
        const eng = game.gameEngine.engine, aq = game.autoQuality, saved = { cap: Config.perf.fpsCap, cycle: Config.time.cycleSeconds, aqOff: aq && aq.off, hour: game.dayNight.hour, weather: game.weather.state, override: game.weather.override };
        if (Interiors.active) { Interiors.leave(game); await this._until(() => !Interiors.active && !Interiors.busy, 60000); }
        if (aq) aq.off = true;
        Config.time.cycleSeconds = 1e12;
        if (o.uncapped) Config.perf.fpsCap = 240;
        // intervalo real entre quadros (ms), quadro a quadro
        let last = 0, frames = null;
        const obs = eng.onEndFrameObservable.add(() => { const t = performance.now(); if (last && frames) frames.push(t - last); last = t; });
        const scenes = [];
        try {
            for (const S of this.SCENES.filter((x) => !o.only || o.only.includes(x.id))) {
                const p = S.at();
                game.dayNight.hour = S.hour; game.dayNight.apply();
                game.weather.set(S.weather, true, true); game.weather.override = 1e9;
                game.player.teleport(new BABYLON.Vector3(p.x, 0, p.z));
                game.camera.snapTo(game.player.position);
                const tb = game.gameEngine.world && game.gameEngine.world.terrain;
                if (tb) tb.prebuild(p);
                frames = []; await this._phase(frames, o.warmS, o.warmFrames);
                frames = []; const samples = [];
                const iv = setInterval(() => { const s = RenderStats.snapshot(); if (s) samples.push(s); }, 250);
                await this._phase(frames, o.measureS, o.measureFrames);
                clearInterval(iv);
                scenes.push(this._summary(S, frames, samples));
                console.log(`[BENCH] ${S.name}: ${scenes[scenes.length - 1].fps} FPS`);
            }
        } finally {
            eng.onEndFrameObservable.remove(obs);
            Config.perf.fpsCap = saved.cap; Config.time.cycleSeconds = saved.cycle;
            if (aq) aq.off = saved.aqOff;
            game.dayNight.hour = saved.hour; game.weather.set(saved.weather, true, false); game.weather.override = saved.override;
            this.running = false;
        }
        const r0 = RenderStats.sample(), sg = game.gameEngine.shadowGenerator;
        this.result = {
            date: new Date().toISOString(), preset: r0.preset, gpu: RenderStats.gpuName(), res: r0.res, dpr: r0.dpr, msaa: r0.msaa,
            shadowSize: sg && Config.perf.shadows !== false ? sg.mapSize : 0, gpuTimer: RenderStats.gpuOk, uncapped: !!o.uncapped, browser: navigator.userAgent, scenes,
        };
        console.log('[BENCH]\n' + this.table(this.result));
        return this.result;
    },

    _until(fn, ms) { return new Promise((res) => { const t0 = performance.now(); const k = setInterval(() => { if (fn() || performance.now() - t0 > ms) { clearInterval(k); res(); } }, 100); }); },
    _phase(frames, s, n) { const t0 = performance.now(); return this._until(() => performance.now() - t0 >= s * 1000 && frames.length >= n, 1e9); },

    _summary(S, frames, samples) {
        const srt = frames.slice().sort((a, b) => a - b), q = (p) => srt.length ? srt[Math.min(srt.length - 1, Math.floor(p * srt.length))] : 0;
        const avg = (k) => { const v = samples.map((s) => s[k]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
        const total = frames.reduce((a, b) => a + b, 0);
        const r = (v, n = 1) => (v == null ? null : +v.toFixed(n));
        return {
            id: S.id, name: S.name, frames: frames.length, fps: r(total ? frames.length / total * 1000 : 0),
            msMedian: r(q(0.5)), ms95: r(q(0.95)), cpuMs: r(avg('cpuMs')), sceneMs: r(avg('sceneMs')), gpuMs: r(avg('gpuMs')),
            drawCalls: Math.round(avg('drawCalls') || 0), shadowDraws: Math.round(avg('shadowDraws') || 0), shadowMs: r(avg('shadowMs')),
            tris: Math.round(avg('tris') || 0), activeMeshes: Math.round(avg('activeMeshes') || 0),
            texMB: r(avg('texMB'), 0), npcMB: r(avg('npcMB'), 0), geoMB: r(avg('geoMB'), 0), heapMB: r(avg('heapMB'), 0),
        };
    },

    // A tabela em texto (console, painel, script de teste).
    table(R) {
        const f = (v, n = 1) => (v == null ? '—' : typeof v === 'number' ? v.toFixed(n) : String(v));
        const head = ['cena', 'FPS', 'ms med', 'ms p95', 'CPU ms', 'GPU ms', 'desenhos', 'sombra', 'mil tri', 'malhas'];
        const rows = R.scenes.map((s) => [s.name, f(s.fps), f(s.msMedian), f(s.ms95), f(s.cpuMs), f(s.gpuMs), String(s.drawCalls), `${s.shadowDraws} (${f(s.shadowMs)} ms)`, f(s.tris / 1000, 0), String(s.activeMeshes)]);
        const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
        const line = (r) => r.map((c, i) => (i ? c.padStart(w[i]) : c.padEnd(w[i]))).join('  ');
        const last = R.scenes[R.scenes.length - 1] || {};
        return [
            `preset ${R.preset} · ${R.res} (×${R.dpr}) · MSAA ${R.msaa || 'não'} · sombra ${R.shadowSize || 'não'} · ${R.uncapped ? 'sem teto de FPS' : 'com teto'}`,
            `placa: ${R.gpu}${R.gpuTimer ? '' : ' (sem tempo de GPU neste navegador)'}`,
            line(head), ...rows.map(line),
            `memória de vídeo (estimada): texturas ${f(last.texMB, 0)} MB (atlas dos personagens ${f(last.npcMB, 0)} MB) · geometria ${f(last.geoMB, 0)} MB · heap JS ${f(last.heapMB, 0)} MB`,
        ].join('\n');
    },

    // `?bench`: espera a carga, roda e mostra o resultado na tela.
    async auto(game) {
        await this._until(() => game._loadingHidden, 600000);
        await new Promise((r) => setTimeout(r, 1500));
        const box = document.createElement('div');
        box.style.cssText = 'position:fixed;inset:auto 12px 12px auto;z-index:200;max-width:min(96vw,980px);padding:12px 14px;border-radius:10px;'
            + 'background:rgba(8,10,14,0.9);color:#e6edf3;font:600 12px/1.5 ui-monospace,Consolas,monospace';
        box.textContent = 'Benchmark rodando… (5 cenas, ~1 min)';
        document.body.appendChild(box);
        const R = await this.run(game);
        if (!R) return;
        const txt = this.table(R);
        box.textContent = '';
        const pre = document.createElement('pre'); pre.style.cssText = 'margin:0 0 8px;white-space:pre;overflow:auto'; pre.textContent = txt;
        const mk = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'margin-right:6px;padding:4px 10px;border:0;border-radius:6px;background:#34d399;color:#04130c;font:inherit;cursor:pointer'; b.onclick = fn; box.appendChild(b); return b; };
        box.appendChild(pre);
        const copy = mk('Copiar resultado', async () => { try { await navigator.clipboard.writeText(txt + '\n\n' + JSON.stringify(R)); copy.textContent = 'Copiado'; } catch (e) { copy.textContent = 'Não deu: copie do console'; } });
        mk('Fechar', () => box.remove());
    },
};
