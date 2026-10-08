// ============================================================================
// GameEngine — bootstrap do Babylon, luzes/sombras e construção do mundo.
// O visual pixel art vem de renderizar numa resolução interna baixa e ampliar
// o canvas SEM suavizar (image-rendering: pixelated).
// ============================================================================

const SUN_DIST = 160;   // distância do "sol" (câmera de sombra) ao ponto focado.

class GameEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        // Sem MSAA no contexto e sem adaptToDeviceRatio: o controle da escala é nosso (_applyScale). No modo pixel art os pixels são
        // duros; na alta definição o antisserrilhado e a densidade do monitor vêm do gráfico suave (render/Smooth.js), que liga/desliga
        // na hora (o MSAA do contexto não poderia mudar sem recriá-lo).
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
        // useRedTextureType (5º argumento): o PCF lê a sombra da textura de PROFUNDIDADE; o alvo de cor nem é amostrado, então basta
        // 1 canal em vez de RGBA half-float (2048²: 32 → 8 MB de memória de vídeo).
        this.shadowGenerator = new BABYLON.ShadowGenerator(Config.perf.shadowSize || 2048, this.sun, false, undefined, true);
        this.shadowGenerator.usePercentageCloserFiltering = true;
        this.shadowGenerator.filteringQuality = BABYLON.ShadowGenerator.QUALITY_LOW;
        this.shadowGenerator.bias = 0.0008;
        this.shadowGenerator.normalBias = 0.02;
        this.shadowGenerator.setDarkness(0.4);
        // Versão da lista de projetores: o filtro abaixo refaz o cache dos estáticos quando alguém entra/sai (um pedaço de postes
        // refeito porque um poste quebrou, por exemplo).
        this._casterVer = 0;
        const sg = this.shadowGenerator, add = sg.addShadowCaster.bind(sg), rem = sg.removeShadowCaster.bind(sg);
        sg.addShadowCaster = (m, d) => { this._casterVer++; return add(m, d); };
        sg.removeShadowCaster = (m, d) => { this._casterVer++; return rem(m, d); };
        this._setupShadowMap();
    }

    // Ajustes do alvo do mapa de sombra — refeitos sempre que o Babylon recria o alvo (troca de tamanho em setShadowSize).
    _setupShadowMap() {
        const sm = this.shadowGenerator.getShadowMap(), eng = this.engine;
        // Profundidade em 16 bits em vez de float32 (2048²: 16 → 8 MB). A janela da sombra tem 160 u: 16 bits dão ~0,003 u de precisão,
        // bem abaixo do bias (≈0,13 u) — mesma sombra, sem acne.
        if (eng.webGLVersion > 1 && eng._features.supportDepthStencilTexture) {
            sm.createDepthStencilTexture(eng.useReverseDepthBuffer ? BABYLON.Constants.GREATER : BABYLON.Constants.LESS, true, false, 1, BABYLON.Constants.TEXTUREFORMAT_DEPTH16);
        }
        // O mapa de sombra NÃO descarta por conta própria: sem isto ele desenhava, todo quadro, todos os projetores do mundo (carros
        // da cidade inteira, postes e blocos de sombra de todos os pedaços). Só entra quem está na janela da sombra (+ folga para a
        // sombra comprida de um prédio alto que fica fora dela).
        // Projetores ESTÁTICOS (matriz congelada: prédios, acabamentos, postes — a maioria dos ~900) só são re-filtrados quando o foco
        // anda 8 u, a janela muda ou a lista muda; os dinâmicos (carros) são testados todo quadro.
        const out = [], near = [], dyn = [], C = { n: -1, x: 0, z: 0, R: 0 };
        const inRange = (m, f, R) => { const bs = m.getBoundingInfo().boundingSphere, c = bs.centerWorld, r = bs.radiusWorld; return Math.abs(c.x - f.x) < R + r && Math.abs(c.z - f.z) < R + r; };
        sm.getCustomRenderList = (layer, list, n) => {
            const f = this._shadowFocus; if (!f) return null;
            const R = this.sun.shadowFrustumSize * 0.6 + 26;
            if (n !== C.n || this._casterVer !== C.v || Math.abs(f.x - C.x) > 8 || Math.abs(f.z - C.z) > 8 || Math.abs(R - C.R) > 4) {
                C.n = n; C.v = this._casterVer; C.x = f.x; C.z = f.z; C.R = R;
                near.length = 0; dyn.length = 0;
                for (let i = 0; i < n; i++) { const m = list[i]; if (!m.isWorldMatrixFrozen) dyn.push(m); else if (inRange(m, f, R + 12)) near.push(m); }
            }
            out.length = 0;
            for (const m of near) if (m.isEnabled() && m.isVisible && !m.isDisposed()) out.push(m);
            // Caixas de sombra dos veículos (chassi/cabine) vão para um lote único (ShadowBoxBatch): 1 desenho no lugar de 2 por carro.
            const boxes = this._shadowBoxes || (this._shadowBoxes = new ShadowBoxBatch(this.scene, Vehicle._ghostMaterial(this.scene), Vehicle.GHOST_LAYER));
            boxes.begin();
            for (const m of dyn) {
                if (!m.isEnabled() || !m.isVisible || m.isDisposed() || !inRange(m, f, R)) continue;
                if (m._dmShadowBox) boxes.add(m); else out.push(m);
            }
            for (const bm of boxes.end()) out.push(bm);
            return out;
        };
    }

    // Troca a resolução do mapa de sombra (AutoQuality). Não use getShadowMap().resize(): ela recria o alvo SEM a textura de
    // profundidade que o PCF lê (as sombras sumiam) e perde o descarte acima.
    setShadowSize(size) {
        const sg = this.shadowGenerator;
        if (!sg || sg.mapSize === size) return;
        const rate = sg.getShadowMap().refreshRate;
        sg.mapSize = size;                                       // recria o alvo (mantém a lista de projetores)
        sg.getShadowMap().refreshRate = rate;
        this._setupShadowMap();
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
    // Alta definição com o gráfico suave (Smooth): a densidade de pixels do monitor (até Config.perf.dprCap) — a tela não é mais
    // desenhada em "pixels da página" e ampliada pelo navegador (Windows a 125%/150%, telas retina: imagem borrada e serrilhada).
    _applyScale() {
        const A = Config.art;
        const h = this.canvas.clientHeight || window.innerHeight;
        let level = 1;
        if (A.pixelate) {
            const lo = Math.max(1, Math.floor(h / A.internalHeight)), hi = Math.max(1, Math.ceil(h / A.internalHeight));
            const err = (l) => Math.abs(Math.log(h / l / A.internalHeight));
            level = err(lo) <= err(hi) ? lo : hi;
        } else if (A.smooth !== false) level = 1 / Math.max(1, Math.min(window.devicePixelRatio || 1, Config.perf.dprCap || 1));
        this.engine.setHardwareScalingLevel(level);
        this.canvas.style.imageRendering = A.pixelate ? 'pixelated' : 'auto';
        this.renderHeight = Math.round(h / level);                 // linhas de pixels desenhadas de fato (nitidez dos personagens)
        this.viewHeight = A.pixelate ? this.renderHeight : h;      // enquadramento da câmera (fitPixelScale): não muda com a densidade
    }

    runRenderLoop(callback) {
        this.engine.runRenderLoop(callback);
    }

    resize() {
        this._applyScale();
        this.engine.resize();
    }
}
