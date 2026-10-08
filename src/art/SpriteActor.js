// ============================================================================
// SpriteActor — um personagem 2D: um quad achatado no chão (visto de cima)
// que mostra o frame certo do clipe atual na direção certa.
//   play(clipe, arma)   troca o clipe (sem reiniciar se já está tocando)
//   setHeading(rad)     escolhe a coluna de direção (0 = norte, +X = leste)
//   update(dt, rate)    avança a animação (rate = multiplicador de velocidade; negativo = ao contrário, em clipe com loop)
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
        this._seedName = name;
        this.npcRow = 0;           // linha da paleta dos personagens 2,5D (NpcArt); `variant` = a da paleta antiga
        this.variant = variant;
        sheet = this._adopt(sheet, variant);
        this.sheet = sheet;
        variant = this.variant;
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

    // Giro da câmera bússola (CompassCamera.yaw): o personagem 2,5D fica "de pé" para cima da TELA, não do norte.
    static viewYaw() { return typeof CompassCamera !== 'undefined' ? CompassCamera.yaw || 0 : 0; }
    // Câmera inclinada (CompassCamera.tilt): o quad 2,5D se levanta do chão no mesmo ângulo (gira pelos pés, em torno do eixo
    // horizontal da tela) e fica de frente para a câmera — senão o desenho sairia achatado. O shader lê a posição LOCAL: nada muda nele.
    static viewTilt() { return typeof CompassCamera !== 'undefined' ? CompassCamera.curTilt || 0 : 0; }

    // O sprite gira no ângulo exato (clipe vetorial)? (CarLights e quem mais precisar da frente desenhada.)
    get rotates() { return !!(this.clip && this.clip.vector); }

    // Personagem 2,5D (NpcArt): a folha antiga de pedestre/policial (civA, civB, police, swat, army) vira um TIPO novo do pacote de
    // NPCs (escolhido pelo lugar da variante de cor antiga e pelo nome do sprite) — todo o resto do jogo segue pedindo "civA, cor 30".
    // Folha 2,5D passada direto: `variant` é a linha da paleta nova.
    _adopt(sheet, variant) {
        if (sheet && sheet.npcRemap) {
            const r = sheet.npcRemap(variant, this._seedName);
            if (r) { this._legacySheet = sheet; this.variant = variant; this.npcRow = r.row; this.npcType = r.type; return r.sheet; }
        }
        this._legacySheet = null;
        if (sheet && sheet.isNpc) { this.npcRow = variant; this.variant = sheet.legacyVariant; this.npcType = sheet.id; }
        else this.variant = variant;
        return sheet;
    }

    // Linha de paleta que o clipe atual usa (a nova para os 2,5D, a antiga para o resto).
    _syncRow() {
        const v = this.clip && this.clip.npc ? this.npcRow : this.variant;
        if (this._colors[0] === v) return;
        for (let i = 0; i < 16; i += 4) this._colors[i] = v;
        this.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, this._colors);
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

    // Inclinação do chão na direção em que anda (MapGeo.slopeAlong; 0 = plano/parado). Quem move o personagem informa todo quadro;
    // aí 'walk'/'run' viram, se o tipo tiver o clipe (2,5D, sem arma na mão): subida (> 0,15) = 'walk_up' (inclinado, passo curto) e
    // encosta íngreme (> 0,6) = 'climb' (escalando com as mãos) — e o ritmo é corrigido pela passada mais curta (_rateK).
    setSlope(g) { this._slope = g || 0; this._slopeFresh = true; }
    static get CLIMB() { return { up: 0.15, steep: 0.6, upStride: 0.77, climbStride: 0.59 }; }

    // Troca de clipe. Retorna false se o clipe não existe para essa arma.
    play(name, weapon = 'none', opts = {}) {
        this._rateK = 1;
        const C = SpriteActor.CLIMB;
        if ((name === 'walk' || name === 'run') && weapon === 'none' && this._slope > C.up) {
            const up = this._slope > C.steep ? 'climb' : (name === 'walk' ? 'walk_up' : null);
            if (up && this.sheet.getClip(up, 'none')) {
                this._rateK = up === 'walk_up' ? 1 / C.upStride : (name === 'run' ? Config.anim.run / (Config.anim.walk * C.climbStride) : 1 / C.climbStride);
                name = up;
            }
        }
        return this._play(name, weapon, opts);
    }
    _play(name, weapon = 'none', { restart = false } = {}) {
        const clip = this.sheet.getClip(name, weapon);
        if (!clip) return false;
        if (this.clip === clip && !restart) return true;
        const was = this._mode || 0, mode = clip.vector ? 1 : clip.npc ? 2 : 0;
        this.clip = clip;
        this.time = 0;
        this.frame = 0;
        this.done = false;
        this.mesh.material = clip.material;
        // Personagens (clipe vetorial) são desenhados em Config.art.charScale: o quad encolhe e o shader acompanha (lê a posição local).
        const k = clip.vector ? (Config.art.charScale || 1) : 1;
        this.mesh.scaling.x = this.mesh.scaling.z = k;
        const dirsWas = this._dirs; this._dirs = clip.dirs;
        if (mode !== was) { this._mode = mode; this._modeChanged(); }
        else if (clip.npc && dirsWas !== clip.dirs && this.heading != null) { this.dir = -1; this.setHeading(this.heading); }     // (8 ↔ 16 direções)
        if (clip.vector) { this._setQuad(this.mesh, clip.pk.box); this._ovClip = null; }
        else if (clip.npc && this._npcBox !== clip.pk.box) {                 // 2,5D: o quad (fixo, sem girar) tem a caixa do clipe
            const b = this._npcBox = clip.pk.box;
            this._setQuad(this.mesh, b);
            this._setBounds(Math.max(-b[0], b[2], -b[1], b[3]));
        }
        this._syncRow();
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
        const keepRow = sheet && sheet.isNpc && !sheet.npcRemap ? this.npcRow : null;
        sheet = sheet && sheet.npcRemap ? this._adopt(sheet, this.variant) : sheet;
        if (keepRow !== null) this.npcRow = keepRow;                   // (o jogador volta da moto para a própria folha 2,5D)
        this.sheet = sheet;
        this.clip = null;
        this._npcBox = null;
        const h = this._half = sheet.frame / Config.art.ppu / 2;
        this.mesh.rotation.y = 0; this._yaw = null; this.mesh.rotation.x = 0; this._tilt = 0;
        this.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, [-h, 0, h, h, 0, h, -h, 0, -h, h, 0, -h]);
        this._setBounds(h);
    }

    // Troca a variante da paleta (ex.: pintura → carcaça carbonizada). Pedestre 2,5D: outra variante = outra pessoa do mesmo lugar.
    setVariant(v) {
        this.clearWounds();                                                // outra pessoa: sem os ferimentos da anterior
        if (this._legacySheet) {
            const sheet = this._adopt(this._legacySheet, v);
            if (sheet !== this.sheet) { const name = this.clipName || 'idle', w = this.clip ? this.clip.weapon : 'none'; this.useSheet(sheet); this.play(name, w, { restart: true }); }
            this._syncRow();
            return;
        }
        this.variant = v;
        this._syncRow();
        if (this._ov) this._ovColors(this._ov);
    }

    setHeading(rad) {
        this.heading = rad;
        if (this.rotates) { this._rotate(); return; }
        const D = this.clip && this.clip.npc ? this.clip.dirs || 8 : this.sheet.dirs;          // (2,5D: 8 direções; pilotando, 16)
        if (this.clip && this.clip.npc) rad -= this._yaw || 0;                 // 2,5D: a direção desenhada é relativa à tela (câmera bússola)
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
        this._npcBox = null;
        if (typeof NpcArt !== 'undefined') NpcArt.sortMesh(this.mesh, !!(this.clip && this.clip.npc));
        if (this.rotates) {
            this._shH = null;
            const H = CharArt.half(this.sheet.atlasName || this.sheet.name);
            this._setBounds(Math.max(this._half, H));
            this._rotate();
        } else if (this.clip && this.clip.npc) {                           // 2,5D: quad fixo (a caixa vem no play), 8 direções desenhadas
            this.mesh.rotation.y = this._yaw = SpriteActor.viewYaw();      // (de pé "para cima da tela": gira junto com a câmera bússola)
            this.mesh.rotation.x = -(this._tilt = SpriteActor.viewTilt());
            // (b, a guardavam a sombra do vetorial; no 2,5D b = toldo, a = água) — nos 4 vértices: sobrando um valor velho em
            // algum deles, o shader interpola "água no corpo" e o desenho aparece afundado mesmo em terra
            this._cover = -1;
            for (let i = 0; i < 16; i += 4) { this._colors[i + 2] = 0; this._colors[i + 3] = this._wl || 0; }
            this.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, this._colors);
            if (this._ov) this._ov.setEnabled(false);
            this.dir = -1;
            const h = this.heading; this.heading = null; this.setHeading(h || 0);
        } else {
            this.mesh.rotation.y = 0; this.mesh.rotation.x = 0; this._tilt = 0;
            const h = this._half;
            this.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, [-h, 0, h, h, 0, h, -h, 0, -h, h, 0, -h]);
            this._setBounds(h);
            if (this._ov) this._ov.setEnabled(false);
            const hd = this.heading; this.dir = -1; this.heading = null; if (this.clip) this.setHeading(hd || 0); else this.heading = hd;
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

    // 2,5D: pés debaixo de um toldo/cobertura (MapGeo.coverAt) → a altura dele vai na cor do vértice (b) e o shader mantém o desenho
    // inteiro abaixo dela. Sem isso a cabeça (que testa a profundidade "de pé", bem alta) atravessava o toldo e só o corpo sumia.
    _updateCover() {
        const p = this.mesh.position;
        if (this._coverX === p.x && this._coverZ === p.z) return;
        this._coverX = p.x; this._coverZ = p.z;
        const h = MapGeo.coverAt(p.x, p.z);
        if (h === this._cover) return;
        this._cover = h;
        for (let i = 2; i < 16; i += 4) this._colors[i] = h;
        this.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, this._colors);
    }

    // 2,5D, vadeando: altura da água no corpo (m; 0 = seco). Vai na cor do vértice (a) e o shader do NpcArt afunda o que está abaixo
    // dela (tinge, some aos poucos, linha de espuma ondulando). Nadando não precisa: a água já está desenhada no clipe de natação.
    // Vale só no quadro em que é informada (como setSlope): quem não informa (NPC que renasceu, foi arremessado, saiu da água por outro
    // caminho, policial, corpo caído…) volta a seco sozinho em update — nunca fica "dentro d'água" em terra.
    setWaterline(h) {
        this._wl = h > 0.02 ? Math.round(h * 50) / 50 : 0;
        this._wlFresh = true;
        this._applyWaterline();
    }
    _applyWaterline() {
        const h = this._wl || 0;
        if (!(this.clip && this.clip.npc) || this._colors[3] === h) return;
        for (let i = 3; i < 16; i += 4) this._colors[i] = h;
        this.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, this._colors);
    }

    update(dt, rate = 1) {
        let c = this.clip;
        if (!c) return;
        // 2,5D: o desenho do tipo foi trocado (alta definição pronta — NpcArt.hd): toca o mesmo clipe, no mesmo quadro, no atlas novo
        if (c.npc && c.gen !== NpcArt.genOf(c.atlas)) {
            const n = c.name, w = c.weapon, t = this.time, f = this.frame, done = this.done;
            this.clip = null;
            if (!this.play(n, w, { restart: true })) return;
            this.frame = -1; this.setFrame(f); this.time = t; this.done = done;
            c = this.clip;
        }
        this._updateShade(dt);
        if (c.npc) this._updateCover();
        if (c.npc && this._yaw !== SpriteActor.viewYaw()) {                // câmera bússola girou: o quad acompanha e a direção desenhada é refeita
            this.mesh.rotation.y = this._yaw = SpriteActor.viewYaw();
            if (this.heading != null) { this.dir = -1; this.setHeading(this.heading); }
        }
        if (c.npc && this._tilt !== SpriteActor.viewTilt()) this.mesh.rotation.x = -(this._tilt = SpriteActor.viewTilt());
        // água no corpo e inclinação valem só no quadro em que foram informadas (antes deste update): sem aviso, zeram
        if (!this._wlFresh) this._wl = 0;
        this._wlFresh = false;
        if (c.npc) this._applyWaterline();                     // (também acerta a cor na troca de modo — o alfa do vértice nasce em 1)
        if (!this._slopeFresh) this._slope = 0;
        this._slopeFresh = false;
        if (c.vector) this._rotate();
        this.time += dt * c.fps * rate * (this._rateK || 1);
        let f;
        if (c.loop) f = ((Math.floor(this.time) % c.frames) + c.frames) % c.frames;          // (ritmo negativo: anda para trás no ciclo)
        else { f = Math.min(Math.floor(this.time), c.frames - 1); if (this.time >= c.frames) this.done = true; }
        if (f !== this.frame) { this.frame = f; this._applyUV(); }
    }

    // Retângulo do frame/direção atual dentro do atlas do clipe.
    _applyUV() {
        const c = this.clip;
        if (!c) return;
        if (c.vector) { this._setFr(this.mesh, c.pk, this.frame, this._fr); this._applyOverlay(); return; }
        if (c.npc) { this._setFr(this.mesh, c.pk, Math.max(0, this.dir) * c.pk.n + Math.min(this.frame, c.pk.n - 1), this._fr, true); return; }
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

    // Camadas de ferimento por cima da skin (personagens 2,5D): `shot` = BALEADO (furos e sangue na roupa) e `beat` = ESPANCADO
    // (hematomas e sangue do nariz/boca), níveis 0..4 — cada nível, mais uma marca. Ficam no sprite até a pessoa ser outra
    // (renasceu / trocou de variante) ou se curar (clearWounds). Vão no 4º número do atributo `fr` (livre) com uma semente por
    // pessoa: o shader do NpcArt desenha as marcas (shotMask / beatMask).
    setWounds(shot, beat) {
        shot = Math.max(0, Math.min(4, shot | 0)); beat = Math.max(0, Math.min(4, beat | 0));
        if (this._wShot === shot && this._wBeat === beat) return;
        this._wShot = shot; this._wBeat = beat;
        if (this._woundSeed == null) this._woundSeed = Math.floor(Math.random() * 250);
        const w = shot || beat ? this._woundSeed * 25 + shot * 5 + beat : 0, R = this._fr;
        for (let k = 3; k < 16; k += 4) R[k] = w;
        this.mesh.updateVerticesData('fr', R);
    }
    get wounds() { return { shot: this._wShot || 0, beat: this._wBeat || 0 }; }
    clearWounds() { if (!this._wShot && !this._wBeat) return; this._woundSeed = null; this.setWounds(0, 0); }

    // Quadro f do clipe vetorial: um único atributo (3 números) — o mesmo custo de antes, quando só a UV mudava.
    _setFr(mesh, pk, f, R, raw = false) {
        const i = (raw ? f : Math.min(f, pk.n - 1)) * 3, a = pk.fr[i], b = pk.fr[i + 1], c = pk.fr[i + 2];      // raw: índice já calculado (2,5D: direção × quadros + quadro)
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
