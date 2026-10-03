// ============================================================================
// CompassCamera — câmera "bússola": quase vertical, norte SEMPRE pra cima,
// SEMPRE centrada no alvo (jogador ou carro), com perspectiva leve.
//
// Por que o personagem nunca fica escondido: o ponto de fuga da perspectiva
// está exatamente em cima do alvo, então o topo de cada prédio é projetado
// PARA FORA do centro — nunca por cima de quem está no centro. Os prédios
// mostram só um pouco das laterais (sensação de cidade 3D) sem esconder nada
// que esteja mais perto do centro do que eles.
//
// Altura fixa + FOV variável: o zoom muda o FOV, então a "força" da perspectiva
// (inclinação dos prédios por unidade de mundo) não muda ao dar zoom.
// ============================================================================

class CompassCamera {
    constructor(scene, engine, targetPos) {
        this.scene = scene;
        this.engine = engine;
        this.viewHalf = Config.camera.viewHalf;
        this.target = targetPos.clone();

        const c = Config.camera;
        this.camera = new BABYLON.FreeCamera('compassCamera',
            new BABYLON.Vector3(this.target.x, c.height, this.target.z), scene);

        // Olhando reto pra baixo. O "cima" da tela é o norte (+Z) — daí o upVector,
        // senão o lookAt degenera (olhar paralelo ao up padrão).
        this.camera.upVector = new BABYLON.Vector3(0, 0, 1);
        this.camera.rotation = new BABYLON.Vector3(Math.PI / 2, 0, 0);
        this.camera.minZ = 20;
        this.camera.maxZ = 400;
        this.camera.inputs.clear();            // câmera TRAVADA: nenhum input mexe nela.

        scene.activeCamera = this.camera;
        this._applyFov();
    }

    // FOV vertical que enquadra `viewHalf` unidades acima/abaixo do alvo no chão.
    _applyFov() {
        this.camera.fov = 2 * Math.atan(this.view / Config.camera.height);
    }

    // Metade da altura visível de fato: o zoom do jogador × o zoom automático de interiores (HouseView: 1 fora, 0,5 dentro da casa).
    get view() { return this.viewHalf * (this.zoomMul || 1); }

    setZoomMul(m) {
        if (m === this.zoomMul) return;
        this.zoomMul = m;
        this._applyFov();
    }

    // Acompanha o alvo (suavização independente de framerate; alta = colada).
    follow(targetPos, dt) {
        const t = 1 - Math.exp(-Config.camera.followLerp * dt);
        this.target.x += (targetPos.x - this.target.x) * t;
        this.target.z += (targetPos.z - this.target.z) * t;
        // Tremor (batidas e explosões): desloca só a câmera, não o foco, e some rápido.
        let sx = 0, sz = 0;
        if (this._shake > 0.01) {
            sx = (Math.random() - 0.5) * this._shake; sz = (Math.random() - 0.5) * this._shake;
            this._shake *= Math.exp(-7 * dt);
        } else this._shake = 0;
        this.camera.position.x = this.target.x + sx;
        this.camera.position.z = this.target.z + sz;
    }

    // Balança a câmera (unidades de mundo; ~0,3 = batida, ~1,2 = explosão perto). Soma com o tremor atual.
    shake(mag) {
        this._shake = Math.min(1.6, (this._shake || 0) + mag);
    }

    // Teleporta o foco (spawn, prisão): sem deslizar pelo mapa.
    snapTo(pos) {
        this.target.x = pos.x;
        this.target.z = pos.z;
        this.camera.position.x = pos.x;
        this.camera.position.z = pos.z;
    }

    // delta > 0 afasta (zoom out) | delta < 0 aproxima (zoom in).
    zoom(delta) {
        this._userZoomed = true;
        this.viewHalf = BABYLON.Scalar.Clamp(this.viewHalf + delta, Config.camera.minView, Config.camera.maxView);
        this._applyFov();
    }

    // Zoom "pixel-perfect": 1 texel da arte (Config.art.ppu por unidade) = 1 pixel interno.
    // Só vale enquanto o jogador não mexeu no zoom.
    fitPixelScale(renderHeight) {
        if (this._userZoomed) return;
        this.viewHalf = BABYLON.Scalar.Clamp(renderHeight / (2 * Config.art.ppu), Config.camera.minView, Config.camera.maxView);
        this._applyFov();
    }

    // Base de movimento alinhada à TELA: norte fixo, então é constante.
    getGroundBasis() {
        return {
            forward: new BABYLON.Vector3(0, 0, 1),
            right: new BABYLON.Vector3(1, 0, 0),
        };
    }

    onResize() {
        this._applyFov();
    }
}
