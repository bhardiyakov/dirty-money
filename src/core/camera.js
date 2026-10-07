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
//
// DIRIGINDO (Config.camera.carCompass): a câmera gira como uma bússola, em passos de 90° — só quando o veículo vira uma esquina ou
// faz o retorno (Config.camera.carTurnTrigger), nunca a cada desvio — para a frente dele ficar para cima, e se adianta
// na direção dele, deixando o carro mais ao sul da tela (vê-se mais do que vem pela frente). A pé, volta suavemente ao norte.
// O giro atual fica em CompassCamera.yaw (rad, 0 = norte em cima, +X = leste): os personagens 2,5D (SpriteActor), a ordem de
// desenho deles (NpcArt) e o minimapa acompanham.
// ============================================================================

class CompassCamera {
    constructor(scene, engine, targetPos) {
        this.scene = scene;
        this.engine = engine;
        this.viewHalf = Config.camera.viewHalf;
        this.target = targetPos.clone();
        this.yaw = 0;              // giro da bússola (rad; 0 = norte em cima)
        this.lead = 0;             // adianto na direção do veículo (fração de `view`)
        CompassCamera.yaw = 0;

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

    // Acompanha o alvo (suavização independente de framerate; alta = colada). `vehicle`: dirigindo — modo bússola (ver o topo).
    follow(targetPos, dt, vehicle = null) {
        const C = Config.camera;
        const wrap = (a) => { a %= Math.PI * 2; return a > Math.PI ? a - Math.PI * 2 : (a < -Math.PI ? a + Math.PI * 2 : a); };
        let goalYaw = 0, goalLead = 0;
        if (vehicle && C.carCompass) {
            const f = vehicle.fwdToRef(this._f || (this._f = new BABYLON.Vector3()));
            const h = f.x * f.x + f.z * f.z > 1e-4 ? Math.atan2(f.x, f.z) : null;
            // A câmera NÃO segue cada desvio: guarda uma direção (_carYaw) e só gira em passos de 90° quando o carro se afasta dela
            // mais que carTurnTrigger (virou uma esquina, fez o retorno). Ao entrar no carro, parte da direção dele.
            if (this._carVeh !== vehicle) { this._carVeh = vehicle; this._carYaw = h != null ? h : this.yaw; }
            else if (h != null) {
                const off = wrap(h - this._carYaw);
                if (Math.abs(off) > C.carTurnTrigger) this._carYaw = wrap(this._carYaw + Math.round(off / (Math.PI / 2)) * (Math.PI / 2));
            }
            goalYaw = this._carYaw;
            goalLead = C.carLead;
        } else this._carVeh = null;
        const d = wrap(goalYaw - this.yaw);
        this.yaw += d * (1 - Math.exp(-C.yawLerp * dt));
        if (Math.abs(this.yaw) < 1e-4 && !vehicle) this.yaw = 0;
        this.lead += (goalLead - this.lead) * (1 - Math.exp(-C.leadLerp * dt));
        CompassCamera.yaw = this.yaw;
        const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), L = this.lead * this.view;      // (adianto em fração da meia-altura)
        this.camera.upVector.set(sy, 0, cy);
        const t = 1 - Math.exp(-C.followLerp * dt);
        this.target.x += (targetPos.x + sy * L - this.target.x) * t;
        this.target.z += (targetPos.z + cy * L - this.target.z) * t;
        // Tremor (batidas e explosões): desloca só a câmera, não o foco, e some rápido.
        let sx = 0, sz = 0;
        if (this._shake > 0.01) {
            sx = (Math.random() - 0.5) * this._shake; sz = (Math.random() - 0.5) * this._shake;
            this._shake *= Math.exp(-7 * dt);
        } else this._shake = 0;
        this.camera.position.x = this.target.x + sx;
        this.camera.position.z = this.target.z + sz;
    }

    // Ponto do chão (x, z) → posição na tela (0..1, y para baixo), sem a perspectiva (boa o bastante perto do centro).
    screenUV(x, z, aspect) {
        const dx = x - this.target.x, dz = z - this.target.z, s = Math.sin(this.yaw), c = Math.cos(this.yaw);
        const u = dx * c - dz * s, v = dx * s + dz * c, V = this.view;
        return { u: 0.5 + u / (2 * V * aspect), v: 0.5 - v / (2 * V) };
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

    // Base de movimento alinhada à TELA: "cima" = norte girado pelo yaw (a pé o yaw volta a 0 — norte fixo).
    getGroundBasis() {
        const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
        return {
            forward: new BABYLON.Vector3(s, 0, c),
            right: new BABYLON.Vector3(c, 0, -s),
        };
    }

    onResize() {
        this._applyFov();
    }
}

CompassCamera.yaw = 0;      // giro atual da bússola (rad): lido pelos sprites 2,5D, pela ordem de desenho e pelo minimapa
