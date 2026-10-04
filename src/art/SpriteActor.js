// ============================================================================
// SpriteActor — um personagem 2D: um quad achatado no chão (visto de cima)
// que mostra o frame certo do clipe atual na direção certa.
//   play(clipe, arma)   troca o clipe (sem reiniciar se já está tocando)
//   setHeading(rad)     escolhe a coluna de direção (0 = norte, +X = leste)
//   update(dt, rate)    avança a animação (rate = multiplicador de velocidade)
// O quad fica em y=0.5, acima de calçada (0,18) e rua (0,02): sem z-fighting.
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

        const ppu = Config.art.ppu;
        const h = sheet.frame / ppu / 2;     // meio lado do quad em unidades de mundo.

        this.mesh = new BABYLON.Mesh(name, scene);
        const vd = new BABYLON.VertexData();
        vd.positions = [-h, 0, h, h, 0, h, -h, 0, -h, h, 0, -h];   // TL, TR, BL, BR (norte em cima)
        vd.indices = [3, 1, 0, 2, 3, 0];
        vd.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
        vd.uvs = [0, 0, 1, 0, 0, 1, 1, 1];
        // Cor do vértice = (variante de paleta, sombreamento, -, -): lido pelo shader.
        this._colors = new Float32Array([variant, 1, 0, 1, variant, 1, 0, 1, variant, 1, 0, 1, variant, 1, 0, 1]);
        vd.colors = Array.from(this._colors);
        vd.applyToMesh(this.mesh, true);                            // UVs e cores atualizáveis.
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
    }

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
        this.clip = clip;
        this.time = 0;
        this.frame = 0;
        this.done = false;
        this.mesh.material = clip.material;
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
        const h = sheet.frame / Config.art.ppu / 2;
        this.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, [-h, 0, h, h, 0, h, -h, 0, -h, h, 0, -h]);
        this._setBounds(h);
    }

    // Troca a variante da paleta (ex.: pintura → carcaça carbonizada).
    setVariant(v) {
        this.variant = v;
        for (let i = 0; i < 16; i += 4) this._colors[i] = v;
        this.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, this._colors);
    }

    setHeading(rad) {
        this.heading = rad;
        const D = this.sheet.dirs;
        const step = (Math.PI * 2) / D;
        const d = ((Math.round(rad / step) % D) + D) % D;
        if (d !== this.dir) { this.dir = d; this._applyUV(); }
    }

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
    }

    update(dt, rate = 1) {
        const c = this.clip;
        if (!c) return;
        this._updateShade(dt);
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
        const F = c.frame;
        const u0 = (this.dir * F) / c.W, u1 = ((this.dir + 1) * F) / c.W;
        const v0 = (this.frame * F) / c.H, v1 = ((this.frame + 1) * F) / c.H;
        const uv = this._uv;
        uv[0] = u0; uv[1] = v0; uv[2] = u1; uv[3] = v0;
        uv[4] = u0; uv[5] = v1; uv[6] = u1; uv[7] = v1;
        this.mesh.updateVerticesData(BABYLON.VertexBuffer.UVKind, uv);
    }

    setVisible(v) { this.mesh.setEnabled(v); }

    dispose() { this.mesh.dispose(); }
}
