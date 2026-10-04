// ============================================================================
// GameEngine — bootstrap do Babylon, luzes/sombras e construção do mundo.
// O visual pixel art vem de renderizar numa resolução interna baixa e ampliar
// o canvas SEM suavizar (image-rendering: pixelated).
// ============================================================================

const SUN_DIST = 160;   // distância do "sol" (câmera de sombra) ao ponto focado.

class GameEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        // Sem MSAA e sem adaptToDeviceRatio: queremos pixels duros e controle da escala.
        this.engine = new BABYLON.Engine(this.canvas, false, {
            antialias: false,
            adaptToDeviceRatio: false,
            // Não guarda na RAM uma cópia de cada textura/buffer só para recriar tudo se o contexto WebGL cair: o jogo gera centenas
            // de folhas de sprites, e essas cópias dobravam a memória. (Perder o contexto é raro; o jogo pede recarregar.)
            doNotHandleContextLost: true,
            powerPreference: 'high-performance',
        }, false);
        // Sem as cópias acima, um contexto perdido (driver reiniciou, aba em segundo plano no celular por muito tempo) não volta sozinho.
        this.canvas.addEventListener('webglcontextlost', () => {
            if (document.getElementById('ctxLost')) return;
            const d = document.createElement('div'); d.id = 'ctxLost';
            d.style.cssText = 'position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;background:rgba(5,7,12,0.92);color:#f2f4f8;font:600 16px Inter,system-ui,sans-serif;text-align:center;padding:24px';
            d.innerHTML = 'A placa de vídeo reiniciou o jogo.<br><button style="margin-top:14px;padding:10px 18px;border-radius:12px;border:0;background:#34d399;color:#04130c;font:700 15px Inter,sans-serif;cursor:pointer" onclick="location.reload()">Recarregar (o progresso salvo continua)</button>';
            document.body.appendChild(d);
        });
        // Teto de FPS DE VERDADE: o motor só é "acordado" a cada 1000/fpsCap ms (rAF encadeado até passar o intervalo). Assim o
        // callback do loop — begin/endFrame, lógica, render e o contador de FPS do próprio Babylon — roda a no máximo `fpsCap` Hz.
        const raf = (f) => window.requestAnimationFrame(f), caf = (id) => window.cancelAnimationFrame(id);
        let lastTick = 0, pending = 0;
        this.engine.customAnimationFrameRequester = {
            requestAnimationFrame: (cb) => {
                const gap = 1000 / Config.perf.fpsCap - 2.5;
                const tick = (t) => {
                    if (t - lastTick < gap) { pending = raf(tick); return; }
                    lastTick = t; cb(t);
                };
                pending = raf(tick);
                return pending;
            },
            cancelAnimationFrame: () => caf(pending),
        };
        this.scene = null;
        this.shadowGenerator = null;
        this.sun = null;
        this.sunDir = null;
        this.world = null;
        this.ground = null;        // plano d'água = piso de física de tudo.
        this.colliders = [];       // caixas invisíveis (prédios, contêineres) p/ o Havok.
        this._navTargets = [];

        this._applyScale();
    }

    createScene() {
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.clearColor = BABYLON.Color4.FromHexString('#2a6586ff');
        // O jogo não usa o mouse para escolher malhas: desliga o picking por movimento/clique (raycast em todas as malhas a cada evento).
        this.scene.skipPointerMovePicking = true;
        this.scene.skipPointerDownPicking = true;
        this.scene.skipPointerUpPicking = true;
        this.scene.autoClear = true;
        this.scene.autoClearDepthAndStencil = true;

        this._createLights();

        this.world = new WorldBuilder(this.scene, this.shadowGenerator);
        const w = this.world.build();
        this.ground = w.ground;
        this.colliders = w.colliders;
        this._navTargets = w.navTargets;

        return this.scene;
    }

    // O NavMesh é gerado SÓ sobre calçadas e áreas abertas -> pedestres não pisam na rua.
    get navTargets() {
        return this._navTargets.length ? this._navTargets : [this.ground];
    }

    _createLights() {
        const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), this.scene);
        // Exposição: face voltada pra cima iluminada ≈ 1,0 (cor da textura, sem estourar);
        // à sombra cai para ~0,68. Paredes ficam mais escuras que telhados (leitura de volume).
        hemi.intensity = 0.46;
        hemi.diffuse = new BABYLON.Color3(1, 1, 1);
        hemi.groundColor = new BABYLON.Color3(0.5, 0.52, 0.65);
        hemi.specular = BABYLON.Color3.Black();

        const d = Config.light.sunDir;
        this.sunDir = new BABYLON.Vector3(d[0], d[1], d[2]).normalize();
        this.sun = new BABYLON.DirectionalLight('sun', this.sunDir.clone(), this.scene);
        this.sun.intensity = 0.68;
        this.sun.diffuse = new BABYLON.Color3(1, 0.96, 0.88);
        this.sun.specular = BABYLON.Color3.Black();
        this.sun.autoUpdateExtends = false;       // a sombra segue a câmera (alta resolução perto do jogador).
        this.sun.shadowFrustumSize = 120;
        // O sol fica a SUN_DIST do foco; o que importa (chão até o topo dos prédios) cabe nesta janela.
        this.sun.shadowMinZ = SUN_DIST - 90;
        this.sun.shadowMaxZ = SUN_DIST + 70;
        this.sun.position = this.sunDir.scale(-SUN_DIST);

        // PCF (borda nítida, barato, sem blur): combina com o visual pixel art e evita a
        // perda de precisão do ESM em janelas de profundidade grandes.
        this.shadowGenerator = new BABYLON.ShadowGenerator(Config.perf.shadowSize || 2048, this.sun);
        this.shadowGenerator.usePercentageCloserFiltering = true;
        this.shadowGenerator.filteringQuality = BABYLON.ShadowGenerator.QUALITY_LOW;
        this.shadowGenerator.bias = 0.0008;
        this.shadowGenerator.normalBias = 0.02;
        this.shadowGenerator.setDarkness(0.4);
        // O mapa de sombra NÃO descarta por conta própria: sem isto ele desenhava, todo quadro, todos os projetores do mundo (carros
        // da cidade inteira, postes e blocos de sombra de todos os pedaços). Só entra quem está na janela da sombra (+ folga para a
        // sombra comprida de um prédio alto que fica fora dela).
        const out = [];
        this.shadowGenerator.getShadowMap().getCustomRenderList = (layer, list, n) => {
            const f = this._shadowFocus; if (!f) return null;
            const R = this.sun.shadowFrustumSize * 0.6 + 26;
            out.length = 0;
            for (let i = 0; i < n; i++) {
                const m = list[i]; if (!m.isEnabled() || !m.isVisible) continue;
                const bs = m.getBoundingInfo().boundingSphere, c = bs.centerWorld, r = bs.radiusWorld;
                if (Math.abs(c.x - f.x) < R + r && Math.abs(c.z - f.z) < R + r) out.push(m);
            }
            return out;
        };
    }

    // Chamado todo frame: anima o mundo e centra o frustum da sombra no foco.
    update(dt, focus, viewHalf) {
        if (this.world) this.world.update(dt, focus);
        if (this.sun && focus) {
            this._shadowFocus = focus;
            this.sun.position.copyFrom(focus).subtractInPlace(this.sunDir.scale(SUN_DIST));
            const aspect = this.engine.getAspectRatio(this.scene.activeCamera);
            this.sun.shadowFrustumSize = Math.max(60, viewHalf * 2 * Math.max(1, aspect) * 1.25);
        }
    }

    // Resolução interna baixa + upscale nítido => pixels grandes e consistentes. A escala é
    // INTEIRA (cada pixel interno vira NxN pixels da tela, sem pixels de tamanhos desiguais),
    // escolhida para a altura interna ficar o mais perto possível de Config.art.internalHeight.
    _applyScale() {
        const A = Config.art;
        const h = this.canvas.clientHeight || window.innerHeight;
        let level = 1;
        if (A.pixelate) {
            const lo = Math.max(1, Math.floor(h / A.internalHeight)), hi = Math.max(1, Math.ceil(h / A.internalHeight));
            const err = (l) => Math.abs(Math.log(h / l / A.internalHeight));
            level = err(lo) <= err(hi) ? lo : hi;
        }
        this.engine.setHardwareScalingLevel(level);
        this.canvas.style.imageRendering = A.pixelate ? 'pixelated' : 'auto';
        this.renderHeight = Math.round(h / level);
    }

    runRenderLoop(callback) {
        this.engine.runRenderLoop(callback);
    }

    resize() {
        this._applyScale();
        this.engine.resize();
    }
}
