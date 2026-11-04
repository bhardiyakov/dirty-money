// ============================================================================
// RenderStats — o lado da PLACA DE VÍDEO do custo do quadro (o Perf mede a CPU de cada sistema). Desligado por padrão: liga com
// `?perf` (painel no canto), `?bench` (core/Bench) ou abrindo a aba INFO do modo dev — as medições do Babylon têm custo próprio.
//   gpuMs        tempo de GPU do quadro (consulta de tempo da placa: EXT_disjoint_timer_query_webgl2). Nem todo navegador expõe a
//                extensão (o Firefox e o Safari costumam esconder; o Chrome a expõe na maioria das placas): sem ela, null
//   sceneMs      CPU do render da cena (Babylon: escolher as malhas, desenhar) · rttMs: as passadas fora da tela — mapa de sombras
//                e afins (dentro do sceneMs) · activeMs: só a escolha das malhas ativas
//   drawCalls    desenhos por quadro (todas as passadas) · shadowDraws: só os do mapa de sombras · shadowMs: CPU do mapa de sombras
//   activeMeshes / tris   malhas e triângulos na tela (instâncias contadas pelo Babylon) · meshes: todas as da cena
//   texMB / geoMB         memória de vídeo estimada: texturas (com mipmaps, alvos de render e pós) e geometria (vértices + índices)
//   res, dpr, msaa, shadowSize, preset, gpu   o contexto da medição
// sample() devolve um retrato; snapshot() é o mesmo mais as médias do Perf (CPU), para o painel e o benchmark.
// ============================================================================

const RenderStats = {
    on: false,
    _drawCalls: 0, _shadowDraws: 0, _shadowMs: 0, _mem: null, _memT: 0,
    // canais por formato de textura do Babylon (ALPHA, LUMINANCE, LUMINANCE_ALPHA, RGB, RGBA, R, RG)
    CHANNELS: { 0: 1, 1: 1, 2: 2, 4: 3, 5: 4, 6: 1, 7: 2 },

    enable(game) {
        if (this.on || !game || !game.scene) return;
        this.on = true;
        this.g = game;
        const sc = game.scene, eng = sc.getEngine();
        this.si = new BABYLON.SceneInstrumentation(sc);
        this.si.captureFrameTime = true;
        this.si.captureRenderTime = true;
        this.si.captureRenderTargetsRenderTime = true;
        this.si.captureActiveMeshesEvaluationTime = true;
        this.gpuOk = !!(eng.getCaps().timerQuery);
        if (this.gpuOk) { this.ei = new BABYLON.EngineInstrumentation(eng); this.ei.captureGPUFrameTime = true; }
        // Desenhos por quadro: o contador cru do Babylon só zera em beginFrame; mede a diferença dele ao redor de cada render real
        // (como o DevMode) e, separado, ao redor do mapa de sombras.
        const dc = eng._drawCalls;
        let d0 = 0;
        sc.onBeforeRenderObservable.add(() => { d0 = dc.current; });
        sc.onAfterRenderObservable.add(() => { const d = dc.current - d0; if (d >= 0) this._drawCalls = d; });
        this._dc = dc;
        this._hookShadow();
        console.log(`[RENDER] medição ligada (tempo de GPU: ${this.gpuOk ? 'sim' : 'não disponível neste navegador/placa'})`);
    },

    // O mapa de sombras é recriado quando o tamanho muda (AutoQuality): reengata nele.
    _hookShadow() {
        const sg = this.g.gameEngine.shadowGenerator, sm = sg && sg.getShadowMap();
        if (!sm || sm === this._sm) return;
        this._sm = sm;
        let d0 = 0, t0 = 0;
        sm.onBeforeRenderObservable.add(() => { d0 = this._dc.current; t0 = performance.now(); });
        sm.onAfterRenderObservable.add(() => {
            const d = this._dc.current - d0;
            this._shadowDraws = d >= 0 ? d : 0;
            this._shadowMs = this._shadowMs * 0.9 + (performance.now() - t0) * 0.1;
        });
    },

    // Memória de vídeo estimada (refeita a cada 2 s: percorre todas as texturas e geometrias).
    _memory() {
        const now = performance.now();
        if (this._mem && now - this._memT < 2000) return this._mem;
        this._memT = now;
        const eng = this.g.scene.getEngine(), C = BABYLON.Constants;
        let tex = 0, geo = 0;
        for (const t of eng.getLoadedTexturesCache()) {
            const w = t.width || t.baseWidth || 0, h = t.height || t.baseHeight || 0;
            if (!w || !h) continue;
            // bytes por pixel = canais do formato × bytes do tipo (os atlas dos personagens são de 2 canais de 1 byte: RG8)
            const ch = this.CHANNELS[t.format] || 4, bytes = t.type === C.TEXTURETYPE_FLOAT ? 4 : t.type === C.TEXTURETYPE_HALF_FLOAT ? 2 : 1;
            const layers = t.isCube ? 6 : Math.max(1, t.depth || 1);
            tex += w * h * ch * bytes * layers * (t.generateMipMaps ? 4 / 3 : 1) * Math.max(1, t.samples || 1);
        }
        for (const g of this.g.scene.geometries) {
            const n = g.getTotalVertices();
            for (const k of g.getVerticesDataKinds()) { const vb = g.getVertexBuffer(k); if (vb) geo += n * vb.getSize() * 4; }
            const idx = g.getTotalIndices(); geo += idx * (n > 65535 ? 4 : 2);
        }
        return (this._mem = { texMB: tex / 1048576, geoMB: geo / 1048576 });
    },

    sample() {
        if (!this.on) return null;
        this._hookShadow();
        const g = this.g, sc = g.scene, eng = sc.getEngine(), si = this.si, sg = g.gameEngine.shadowGenerator;
        const gpu = this.gpuOk && this.ei.gpuFrameTimeCounter.count ? this.ei.gpuFrameTimeCounter.lastSecAverage * 1e-6 : null;
        const mem = this._memory();
        const shadowOn = !!(sg && sg.getShadowMap().refreshRate !== 0);
        return {
            gpuMs: gpu,
            sceneMs: si.renderTimeCounter.lastSecAverage, rttMs: si.renderTargetsRenderTimeCounter.lastSecAverage,
            activeMs: si.activeMeshesEvaluationTimeCounter.lastSecAverage,
            drawCalls: this._drawCalls, shadowDraws: shadowOn ? this._shadowDraws : 0, shadowMs: shadowOn ? this._shadowMs : 0,
            activeMeshes: sc.getActiveMeshes().length, meshes: sc.meshes.length, tris: Math.round(sc.getActiveIndices() / 3),
            texMB: mem.texMB, geoMB: mem.geoMB, npcMB: typeof NpcArt !== 'undefined' && NpcArt.mem ? NpcArt.mem().texMB : null,
            res: `${eng.getRenderWidth()}×${eng.getRenderHeight()}`, dpr: +(1 / eng.getHardwareScalingLevel()).toFixed(2),
            msaa: typeof Smooth !== 'undefined' && Smooth.pp ? Smooth.pp.samples || 0 : 0,
            shadowSize: shadowOn ? sg.mapSize : 0, preset: typeof Graphics !== 'undefined' ? Graphics.level : '?',
        };
    },

    // O retrato do render mais a CPU (Perf): o que o painel e o benchmark mostram.
    snapshot() {
        const r = this.sample();
        if (!r) return null;
        return Object.assign(r, {
            fps: Math.round(this.g.gameEngine.engine.getFps()), intervalMs: Perf.interval, cpuMs: Perf.frameAvg, p95Ms: Perf.p95,
            heapMB: Perf.heapMB, heapCoarse: Perf.heapCoarse !== false, cap: Config.perf.fpsCap,
        });
    },

    // Painel `?perf`: canto superior esquerdo, 4 vezes por segundo, sem capturar o mouse.
    showHud() {
        if (this._hud) return;
        const d = this._hud = document.createElement('pre');
        d.id = 'perfHud';
        d.style.cssText = 'position:fixed;left:8px;top:8px;z-index:150;margin:0;padding:8px 10px;border-radius:8px;pointer-events:none;'
            + 'background:rgba(8,10,14,0.78);color:#dfe6ee;font:600 11px/1.45 ui-monospace,Consolas,monospace;white-space:pre';
        document.body.appendChild(d);
        const f = (v, n = 1) => (v == null ? '—' : v.toFixed(n));
        setInterval(() => {
            const s = this.snapshot();
            if (!s) return;
            const pace = s.intervalMs > 1000 / s.cap * 1.08 ? '  ⚠ abaixo do teto' : '';
            d.textContent = [
                `${s.fps} FPS (teto ${s.cap}) · ${f(s.intervalMs)} ms entre quadros${pace}`,
                `CPU ${f(s.cpuMs)} ms (p95 ${f(s.p95Ms)}) · render ${f(s.sceneMs)} ms · GPU ${f(s.gpuMs)} ms`,
                `desenhos ${s.drawCalls} (sombra ${s.shadowDraws}, ${f(s.shadowMs)} ms) · fora da tela ${f(s.rttMs)} ms`,
                `malhas ${s.activeMeshes}/${s.meshes} · ${(s.tris / 1000).toFixed(0)} mil triângulos`,
                `texturas ${f(s.texMB, 0)} MB (personagens ${f(s.npcMB, 0)}) · geometria ${f(s.geoMB, 0)} MB · heap ${s.heapCoarse ? '≈' : ''}${f(s.heapMB, 0)} MB`,
                `${s.preset} · ${s.res} (×${s.dpr}) · MSAA ${s.msaa || 'não'} · sombra ${s.shadowSize || 'não'}`,
            ].join('\n');
        }, 250);
    },

    // Nome da placa de vídeo (para a tabela do benchmark).
    gpuName() {
        try {
            const gl = this.g.scene.getEngine()._gl, ext = gl.getExtension('WEBGL_debug_renderer_info');
            return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
        } catch (e) { return '?'; }
    },
};
