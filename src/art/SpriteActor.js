// ============================================================================
// SpriteActor — um personagem 2D: um quad achatado no chão (visto de cima)
// que mostra o frame certo do clipe atual na direção certa.
//   play(clipe, arma)   troca o clipe (sem reiniciar se já está tocando)
//   setHeading(rad)     escolhe a coluna de direção (0 = norte, +X = leste)
//   update(dt, rate)    avança a animação (rate = multiplicador de velocidade)
// O quad fica em y=0.5, acima de calçada (0,18) e rua (0,02): sem z-fighting.
//
// Dois tipos de clipe:
//   • folha de direções (barcos, helicóptero, e o que não estiver no atlas): colunas = direções; o quad não gira;
//   • VETORIAL (personagens do atlas, CharArt: clip.vector): um quadro por pose, olhando para a frente — o quad GIRA no ângulo
//     exato, tem o tamanho do quadro (+ folga da sombra) e o shader desenha a sombra no chão. setOverlay põe uma camada por cima
//     (a bolsa do jogador), com os mesmos quadros.
// ============================================================================

class SpriteActor {
    constructor(scene, sheet, variant, name) {
        this.scene = scene;
        this.sheet = sheet;
        this.variant = variant;
        this.clip = null;
        this.frame = 0;
        this.time = 0;
        this.dir = 0;
        this.heading = 0;
        this.done = false;       // clipe não-loop chegou ao fim.
        this.overlay = null;     // camada vetorial por cima (bolsa): nome do tipo ('cross'|'pack'|'tactical') ou null

        const ppu = Config.art.ppu;
        const h = this._half = sheet.frame / ppu / 2;     // meio lado do quad em unidades de mundo.

        this.mesh = new BABYLON.Mesh(name, scene);
        const vd = new BABYLON.VertexData();
        vd.positions = [-h, 0, h, h, 0, h, -h, 0, -h, h, 0, -h];   // TL, TR, BL, BR (norte em cima)
        vd.indices = [3, 1, 0, 2, 3, 0];
        vd.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
        vd.uvs = [0, 0, 1, 0, 0, 1, 1, 1];
        // Cor do vértice = (variante de paleta, sombreamento, sombra no chão u, v): lido pelo shader.
        this._colors = new Float32Array([variant, 1, 0, 1, variant, 1, 0, 1, variant, 1, 0, 1, variant, 1, 0, 1]);
        vd.colors = Array.from(this._colors);
        vd.applyToMesh(this.mesh, true);                            // UVs e cores atualizáveis.
        this._fr = new Float32Array(16);                           // retângulo do quadro no atlas (só o shader vetorial lê)
        this.mesh.setVerticesData('fr', this._fr, true, 4);
        this._pos = new Float32Array(12);
        this.shade = 1;                // 1 = ao sol, ~0,66 = na sombra de um prédio.
        this._shadeTimer = Math.random() * 0.3;
        this.mesh.position.y = 0.5;
        this.mesh.isPickable = false;
        this.mesh.isVisible = false;   // só aparece quando recebe a 1ª posição (senão nasce na origem (0,0) e "pisca" lá por um quadro)
        // Culling por frustum (antes ficava sempre ativo: TODO pedestre e carro do mundo era desenhado, mesmo fora da tela). O quad tem
        // tamanho fixo, então a caixa envolvente é trivial; a esfera basta (mais barata) e uma folga cobre o sprite alto.
        this.mesh.cullingStrategy = BABYLON.AbstractMesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;
        this._setBounds(h);

        this._uv = new Float32Array(8);
        SpriteActor.live.add(this);      // registro dos atores vivos (a varredura de 3 s sabe quais clipes estão em uso)
    }

    // O sprite gira no ângulo exato (clipe vetorial)? (CarLights e quem mais precisar da frente desenhada.)
    get rotates() { return !!(this.clip && this.clip.vector); }

    // Caixa envolvente do quad (lado 2h) com um pouco de altura: o frustum descarta o sprite fora da tela.
    _setBounds(h) {
        this.mesh.setBoundingInfo(new BABYLON.BoundingInfo(new BABYLON.Vector3(-h, -1, -h), new BABYLON.Vector3(h, 3, h)));
    }

    // Fixa o frame do clipe (animação dirigida por código: cambalhota, inclinação da moto...). O update() volta a avançar daqui.
    setFrame(f) {
        if (!this.clip) return;
        f = Math.max(0, Math.min(this.clip.frames - 1, f | 0));
        this.time = f;
        if (f !== this.frame) { this.frame = f; this._applyUV(); }
    }

    // Troca de clipe. Retorna false se o clipe não existe para essa arma.
    play(name, weapon = 'none', { restart = false } = {}) {
        const clip = this.sheet.getClip(name, weapon);
        if (!clip) return false;
        if (this.clip === clip && !restart) return true;
        const was = this.clip && this.clip.vector;
        this.clip = clip;
        this.time = 0;
        this.frame = 0;
        this.done = false;
        this.mesh.material = clip.material;
        // Personagens (clipe vetorial) são desenhados em Config.art.charScale: o quad encolhe e o shader acompanha (lê a posição local).
        const k = clip.vector ? (Config.art.charScale || 1) : 1;
        this.mesh.scaling.x = this.mesh.scaling.z = k;
        if (!!clip.vector !== !!was) this._modeChanged();
        if (clip.vector) { this._setQuad(this.mesh, clip.pk.box); this._ovClip = null; }
        this._applyUV();
        return true;
    }

    get clipName() { return this.clip ? this.clip.name : ''; }

    // Troca a folha de sprites (ex.: carro que amassou) mantendo posição e direção. Folha ainda não assada = ignora.
    setSheet(sheet) {
        if (!sheet.getClip()) return false;
        this.sheet = sheet;
        this.clip = null;
        return this.play('static', 'none', { restart: true });
    }

    // Troca a folha de PERSONAGEM (clipes por nome) — inclusive de tamanho de quadro diferente (ex.: o jogador sobe
    // numa moto e passa a usar a folha de 80 px). O quad é redimensionado; o próximo play() pega o clipe da nova folha.
    useSheet(sheet) {
        this.sheet = sheet;
        this.clip = null;
        const h = this._half = sheet.frame / Config.art.ppu / 2;
        this.mesh.rotation.y = 0;
        this.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, [-h, 0, h, h, 0, h, -h, 0, -h, h, 0, -h]);
        this._setBounds(h);
    }

    // Troca a variante da paleta (ex.: pintura → carcaça carbonizada).
    setVariant(v) {
        this.variant = v;
        for (let i = 0; i < 16; i += 4) this._colors[i] = v;
        this.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, this._colors);
        if (this._ov) this._ovColors(this._ov);
    }

    setHeading(rad) {
        this.heading = rad;
        if (this.rotates) { this._rotate(); return; }
        const D = this.sheet.dirs;
        const step = (Math.PI * 2) / D;
        const d = ((Math.round(rad / step) % D) + D) % D;
        if (d !== this.dir) { this.dir = d; this._applyUV(); }
    }

    // Clipe vetorial: gira o quad e recalcula para onde cai a sombra (fixa no mundo: sudeste) nas coordenadas do quadro.
    _rotate() {
        const h = this.heading;
        if (this.mesh.rotation.y === h && this._shH === h) return;
        this.mesh.rotation.y = h;
        this._shH = h;
        const c = Math.cos(h), s = Math.sin(h), [wx, wz] = CharArt.SUN, ppu = CharArt.data.ppu;
        const lx = wx * c - wz * s, lz = wx * s + wz * c;
        const u = Math.round(lx * ppu * 2) / 2, v = Math.round(-lz * ppu * 2) / 2, C = this._colors;     // (meio px: girar devagar não reenvia)
        if (C[2] === u && C[3] === v) return;
        for (let i = 0; i < 16; i += 4) { C[i + 2] = u; C[i + 3] = v; }
        this.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, C);
    }

    // Passou de folha de direções para vetorial (ou o contrário): o quad passa a girar / volta ao quadrado fixo.
    _modeChanged() {
        if (this.rotates) {
            this._shH = null;
            const H = CharArt.half(this.sheet.atlasName || this.sheet.name);
            this._setBounds(Math.max(this._half, H));
            this._rotate();
        } else {
            this.mesh.rotation.y = 0;
            const h = this._half;
            this.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, [-h, 0, h, h, 0, h, -h, 0, -h, h, 0, -h]);
            this._setBounds(h);
            if (this._ov) this._ov.setEnabled(false);
        }
    }

    // Camada vetorial por cima do personagem (bolsa do jogador): 'cross' | 'pack' | 'tactical' | null.
    setOverlay(kind) {
        if (this.overlay === kind) return;
        this.overlay = kind;
        if (kind && !this._ov) {
            const m = this._ov = new BABYLON.Mesh(this.mesh.name + '_camada', this.scene);
            const vd = new BABYLON.VertexData();
            vd.positions = new Float32Array(12); vd.indices = [3, 1, 0, 2, 3, 0]; vd.uvs = new Float32Array(8); vd.colors = new Float32Array(16);
            vd.applyToMesh(m, true);
            m.setVerticesData('fr', new Float32Array(16), true, 4);
            m.parent = this.mesh;
            m.position.y = 0.03;                                     // um pouco mais perto da câmera: desenhado depois do corpo
            m.isPickable = false;
            m.alwaysSelectAsActiveMesh = true;
            this._ovColors(m);
        }
        this._applyUV();
    }
    _ovColors(m) { const c = new Float32Array(16); for (let i = 0; i < 16; i += 4) { c[i] = this.variant; c[i + 1] = this.shade; c[i + 2] = 1e5; c[i + 3] = 1e5; } m.updateVerticesData(BABYLON.VertexBuffer.ColorKind, c); }

    setPosition(x, z) {
        this.mesh.position.x = x;
        this.mesh.position.z = z;
        if (!this._placed) { this._placed = true; this.mesh.isVisible = true; }
    }

    // Escurece o sprite quando está na sombra de um prédio (suave, a ~4 consultas/s).
    _updateShade(dt) {
        this._shadeTimer -= dt;
        if (this._shadeTimer <= 0) {
            this._shadeTimer = 0.25;
            this._shadeTarget = MapGeo.inShadow(this.mesh.position.x, this.mesh.position.z) ? 0.66 : 1;
        }
        if (this._shadeTarget === undefined || Math.abs(this._shadeTarget - this.shade) < 0.004) return;
        this.shade += (this._shadeTarget - this.shade) * Math.min(1, dt * 9);
        for (let i = 1; i < 16; i += 4) this._colors[i] = this.shade;
        this.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, this._colors);
        if (this._ov && this._ov.isEnabled()) this._ovColors(this._ov);
    }

    update(dt, rate = 1) {
        const c = this.clip;
        if (!c) return;
        this._updateShade(dt);
        if (c.vector) this._rotate();
        this.time += dt * c.fps * rate;
        let f;
        if (c.loop) f = Math.floor(this.time) % c.frames;
        else { f = Math.min(Math.floor(this.time), c.frames - 1); if (this.time >= c.frames) this.done = true; }
        if (f !== this.frame) { this.frame = f; this._applyUV(); }
    }

    // Retângulo do frame/direção atual dentro do atlas do clipe.
    _applyUV() {
        const c = this.clip;
        if (!c) return;
        if (c.vector) { this._setFr(this.mesh, c.pk, this.frame, this._fr); this._applyOverlay(); return; }
        const F = c.frame;
        const u0 = (this.dir * F) / c.W, u1 = ((this.dir + 1) * F) / c.W;
        const v0 = (this.frame * F) / c.H, v1 = ((this.frame + 1) * F) / c.H;
        const uv = this._uv;
        uv[0] = u0; uv[1] = v0; uv[2] = u1; uv[3] = v0;
        uv[4] = u0; uv[5] = v1; uv[6] = u1; uv[7] = v1;
        this.mesh.updateVerticesData(BABYLON.VertexBuffer.UVKind, uv);
    }

    // Quad fixo de um clipe vetorial: a caixa (x0, z0, x1, z1) em metros relativa aos pés (já com a folga da sombra).
    _setQuad(mesh, b, P = this._pos) {
        P[0] = b[0]; P[1] = 0; P[2] = b[3]; P[3] = b[2]; P[4] = 0; P[5] = b[3]; P[6] = b[0]; P[7] = 0; P[8] = b[1]; P[9] = b[2]; P[10] = 0; P[11] = b[1];
        mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, P);
    }

    // Quadro f do clipe vetorial: um único atributo (3 números) — o mesmo custo de antes, quando só a UV mudava.
    _setFr(mesh, pk, f, R) {
        const i = Math.min(f, pk.n - 1) * 3, a = pk.fr[i], b = pk.fr[i + 1], c = pk.fr[i + 2];
        if (R[0] === a && R[1] === b && R[2] === c) return;
        for (let k = 0; k < 16; k += 4) { R[k] = a; R[k + 1] = b; R[k + 2] = c; }
        mesh.updateVerticesData('fr', R);
    }

    _applyOverlay() {
        const m = this._ov;
        if (!m) return;
        const c = this.clip, key = c && c.vector && this.overlay && this.sheet.name === 'player' ? c.name + ':' + c.weapon : null;
        const pk = key ? CharArt.bagFrames(this.overlay, key) : null;
        if (!pk) { m.setEnabled(false); return; }
        m.setEnabled(true);
        m.material = c.material;
        if (this._ovClip !== pk) { this._ovClip = pk; this._setQuad(m, pk.box, this._ovPos || (this._ovPos = new Float32Array(12))); }
        this._setFr(m, pk, this.frame, this._ovR || (this._ovR = new Float32Array(16)));
    }

    setVisible(v) { this.mesh.setEnabled(v); }

    dispose() { this.mesh.dispose(); SpriteActor.live.delete(this); }
}
SpriteActor.live = new Set();
