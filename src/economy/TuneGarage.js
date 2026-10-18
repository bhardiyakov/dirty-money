// ============================================================================
// TuneGarage — a garagem POR DENTRO da loja de tunagem, no estilo do Need for Speed Underground 2: ao abrir a loja (Tuning.open) a
// cena troca para um SHOWROOM fechado fora do mapa (palco em STAGE): piso escuro com grade, plataforma giratória com anel de neon,
// paredes com faixas de luz e o nome da loja, pneus e gaveteiros nos cantos. O carro (o mesmo modelo 3D, com as peças da prévia)
// fica na plataforma e uma CÂMERA 3D de verdade (perspectiva, perto) gira em volta dele e vai até a peça que se está escolhendo:
// frente para o motor, roda para os freios, de lado e baixo para a suspensão, atrás para o aerofólio, luz baixa para o neon...
// Arrastar com o mouse/dedo gira a câmera; a rodinha aproxima. Fechar a loja devolve a cidade, a câmera e o HUD.
//   CarArt3D.studio: luz dos refletores no lugar do sol, profundidade de verdade e só o carro da plataforma é desenhado.
// A cidade fica desligada enquanto isso (como nos interiores: Interiors._unloadCity), o mundo continua parado atrás da janela.
// ============================================================================

const TuneGarage = {
    STAGE: { x: 3600, z: 0 },
    active: false, built: false, meshes: [], actor: null,
    // Enquadramento por categoria: a = ângulo em volta do carro (π/2 = de frente, −π/2 = de trás, 0 = lado direito), b = altura
    // (ângulo a partir do alto), r = distância, tz = ponto mirado ao longo do carro (+ = frente), ty = altura do ponto, orbit = gira sozinha.
    VIEWS: {
        paint: { a: 0.75, b: 1.12, r: 9.2, tz: 0, ty: 0.6, orbit: 0.22 },
        kit: { a: 0.9, b: 1.28, r: 8.4, tz: 0.2, ty: 0.5, orbit: 0.16 },
        tEng: { a: 1.25, b: 0.95, r: 7.0, tz: 1.0, ty: 0.7 },
        turbo: { a: 1.9, b: 1.0, r: 6.8, tz: 1.0, ty: 0.7 },
        tBrk: { a: 0.32, b: 1.36, r: 4.6, tz: 1.3, ty: 0.4 },
        tSus: { a: 0.02, b: 1.45, r: 8.2, tz: 0, ty: 0.45 },
        neon: { a: 0.55, b: 1.3, r: 8.6, tz: 0, ty: 0.3, dim: true },
        wing: { a: -1.0, b: 1.05, r: 7.4, tz: -1.0, ty: 0.9 },
    },

    // ---------------------------------------------------------------- entrar / sair
    // Só carros com modelo 3D (os do atlas 2D ficam com a janela na rua, como antes). Devolve true se entrou.
    enter(game, car, shop) {
        if (this.active || !CarArt3D.has(car.spec.id) || !car.visual || !('wing' in car.visual)) return false;
        this.game = game; this.car = car; this.shop = shop; this.active = true;
        this._fade(() => this._show(true));
        return true;
    },
    leave(game) {
        if (!this.active) return;
        this.active = false;
        this._fade(() => this._show(false));
    },
    // Tela preta curta para a troca (a troca acontece com a tela escura).
    _fade(fn) {
        let f = document.getElementById('tuneFade');
        if (!f) {
            f = document.createElement('div'); f.id = 'tuneFade';
            f.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .18s;z-index:41';
            document.body.appendChild(f);
            const st = document.createElement('style');
            st.textContent = `body.tuneGarage #hud,body.tuneGarage #hud2,body.tuneGarage #hMission,body.tuneGarage #minimap,body.tuneGarage #prompt,body.tuneGarage #vehPop,
                body.tuneGarage #opVignette,body.tuneGarage #actionLog,body.tuneGarage #toast,body.tuneGarage #touchUI,body.tuneGarage #dash,body.tuneGarage #goalBox{visibility:hidden!important}
                body.tuneGarage #tuneUI .dm-pp{background:linear-gradient(160deg,rgba(14,10,24,.92),rgba(8,12,22,.9));border-color:rgba(232,121,249,.55);box-shadow:0 0 28px rgba(192,38,211,.35)}
                body.tuneGarage #tuneUI h3{color:#f5d0fe;text-shadow:0 0 12px rgba(232,121,249,.8);letter-spacing:.06em}`;
            document.head.appendChild(st);
        }
        f.style.opacity = '1';
        setTimeout(() => { try { fn(); } finally { f.style.opacity = '0'; } }, 190);
    },

    _show(on) {
        const g = this.game, sc = g.scene;
        if (on) {
            this._build(g);
            const keep = new Set(this.meshes);
            this._hidden = [];
            for (const m of sc.meshes) {
                if (!m.isEnabled(false) || keep.has(m) || m.name.startsWith('car3d_')) continue;
                m.setEnabled(false); this._hidden.push(m);
            }
            for (const m of this.meshes) m.setEnabled(true);
            // o carro da plataforma: o mesmo modelo, com as peças e a cor da prévia, faróis acesos
            const v = this.car.visual, o = this.STAGE;
            this.actor = this._actor(this.car.spec.id, v.variant);
            const car = this.car;                                                   // o modelo em ALTA definição chega em seguida e substitui o do jogo
            CarArt3D.loadHD(car.spec.id).then((k) => { if (k && this.active && this.car === car && this.actor && this.actor.modelId !== k) { this.actor.dispose(); this.actor = this._actor(k, car.visual.variant); this.sync(car, this.cat, true); } });
            this.user = { a: 0, b: 0, r: 0 }; this.cat = null;
            this.sync(this.car, (typeof Tuning !== 'undefined' && Tuning._cat) || 'paint');
            CarArt3D.studio = { l: new BABYLON.Vector3(0.35, 0.86, 0.38).normalize(), c: new BABYLON.Color3(1, 0.98, 0.95), tint: new BABYLON.Color3(1, 1, 1) };
            // câmera 3D
            this._prevCam = sc.activeCamera;
            const V = this.VIEWS.paint, cam = this.cam = new BABYLON.ArcRotateCamera('tuneCam', V.a, V.b, V.r, new BABYLON.Vector3(o.x, V.ty, o.z), sc);
            cam.fov = 0.78; cam.minZ = 0.05; cam.maxZ = 120;
            cam.targetScreenOffset = new BABYLON.Vector2(0, 0.4);         // (o carro no meio da tela, um pouco acima do carrossel de peças — TuneHUD)
            sc.activeCamera = cam;
            const eng = sc.getEngine();                                             // antisserrilhado (o MSAA do jogo fica na câmera da cidade)
            if (eng.webGLVersion >= 2 && eng.getCaps().maxMSAASamples > 1) { this.aa = new BABYLON.PassPostProcess('tuneMsaa', 1.0, cam, BABYLON.Texture.BILINEAR_SAMPLINGMODE, eng); this.aa.samples = Math.min(4, eng.getCaps().maxMSAASamples); }
            else this.aa = new BABYLON.FxaaPostProcess('tuneFxaa', 1.0, cam, BABYLON.Texture.BILINEAR_SAMPLINGMODE, eng);
            this.cur = { a: V.a + 0.9, b: V.b - 0.25, r: V.r + 3, tz: 0, ty: V.ty };            // (entra "voando" até o enquadramento)
            this.spin = V.a;
            this._fog = [sc.fogStart, sc.fogEnd];
            this._obs = sc.onBeforeRenderObservable.add(() => this._frame());
            this._input(true);
            document.body.classList.add('tuneGarage');
            sc.physicsEnabled = false;                                          // (o mundo fica parado atrás da janela da loja)
            this._sign(this.shop && this.shop.name);
            return;
        }
        if (this._obs) { sc.onBeforeRenderObservable.remove(this._obs); this._obs = null; }
        this._input(false);
        if (this._prevCam) sc.activeCamera = this._prevCam;
        if (this.aa) { this.aa.dispose(); this.aa = null; }
        if (this.cam) { this.cam.dispose(); this.cam = null; }
        if (this._fog) { sc.fogStart = this._fog[0]; sc.fogEnd = this._fog[1]; }
        CarArt3D.studio = null;
        if (this.actor) { this.actor.dispose(); this.actor = null; }
        for (const m of this.meshes) m.setEnabled(false);
        if (this._hidden) { for (const m of this._hidden) m.setEnabled(true); this._hidden = null; }
        g.scene.physicsEnabled = true;
        document.body.classList.remove('tuneGarage');
    },

    // O carro da plataforma (modelo id: o do jogo ou o '<id>@hd'), só desenhado no estúdio.
    _actor(id, variant) {
        const a = CarArt3D.actor(id, variant), o = this.STAGE;
        a.studio = true; a.shade = 1;
        a.setPosition(o.x, o.z); a.setY(1.5 + 0.13); a.setHeading(0);
        return a;
    },

    // A prévia mudou (Tuning._preview): o carro da plataforma copia cor, peças, rebaixamento e o neon; a câmera vai para a categoria.
    sync(car, cat, keepView = false) {
        if (!this.actor || car !== this.car) return;
        const v = car.visual, a = this.actor, m = car.mods || {};
        a.setVariant(v.variant); a.wing = v.wing | 0; a.kit = v.kit | 0; a.lower = v.lower || 0;
        a.setLamps(1, 0.45, false, false, 0, false);
        const nc = m.neon && Tuning.NEON[m.neon];
        if (this.neon) {
            this.neon.isVisible = !!nc;
            if (nc) this.neon.material.emissiveColor.set(nc[0], nc[1], nc[2]);
        }
        if (cat !== this.cat && !keepView) { this.cat = cat; this.user.a = this.user.b = this.user.r = 0; const V = this.VIEWS[cat] || this.VIEWS.paint; this.spin = V.a; }
    },

    // Por quadro (antes do render): câmera desliza até o enquadramento da categoria, plataforma e anel giram, sem a névoa da borda.
    _frame() {
        const g = this.game, sc = g.scene, dt = Math.min(0.05, sc.getEngine().getDeltaTime() / 1000), o = this.STAGE;
        if (!this.cam || !this.actor) return;
        sc.fogStart = CompassCamera.NO_FOG; sc.fogEnd = CompassCamera.NO_FOG + 1;
        const V = this.VIEWS[this.cat] || this.VIEWS.paint, c = this.cur, k = 1 - Math.exp(-3.2 * dt);
        if (V.orbit && !this._drag) this.spin += V.orbit * dt;
        const ta = (V.orbit ? this.spin : V.a) + this.user.a;
        let da = ta - c.a; da = Math.atan2(Math.sin(da), Math.cos(da));
        c.a += da * k;
        c.b += (Math.max(0.5, Math.min(1.52, V.b + this.user.b)) - c.b) * k;
        c.r += (Math.max(3, Math.min(13, V.r + this.user.r)) - c.r) * k;
        c.tz += (V.tz - c.tz) * k; c.ty += (V.ty - c.ty) * k;
        const cam = this.cam;
        cam.alpha = c.a; cam.beta = c.b; cam.radius = c.r;
        cam.target.set(o.x, c.ty, o.z + c.tz);
        // luz: no neon o salão escurece (o neon aparece)
        const S = CarArt3D.studio, dim = V.dim ? 0.42 : 1;
        S.tint.r += (dim - S.tint.r) * k; S.tint.g = S.tint.b = S.tint.r;
        if (this.ring) this.ring.rotation.y += dt * 0.6;
        if (this.plat) this.plat.rotation.y += dt * 0.6;
        if (this.pool) this.pool.material.alpha = 0.55 * S.tint.r + 0.1;
        this.actor.setLamps(1, 0.45, false, false, 0, false);
    },

    // Arrastar gira (e sobe/desce) a câmera; rodinha aproxima.
    _input(on) {
        const cv = this.game.scene.getEngine().getRenderingCanvas();
        if (!cv) return;
        if (!this._h) {
            this._h = {
                down: (e) => { this._drag = { x: e.clientX, y: e.clientY }; },
                move: (e) => { const d = this._drag; if (!d) return; this.user.a -= (e.clientX - d.x) * 0.008; this.user.b -= (e.clientY - d.y) * 0.005; d.x = e.clientX; d.y = e.clientY; },
                up: () => { this._drag = null; },
                wheel: (e) => { this.user.r += Math.sign(e.deltaY) * 0.6; e.preventDefault(); },
            };
        }
        const H = this._h, f = on ? 'addEventListener' : 'removeEventListener';
        cv[f]('pointerdown', H.down); window[f]('pointermove', H.move); window[f]('pointerup', H.up); cv[f]('wheel', H.wheel, { passive: false });
        if (!on) this._drag = null;
    },

    // Letreiro das paredes com o nome desta loja.
    _sign(name) {
        const t = this._signT; if (!t || this._signName === name) return;
        this._signName = name;
        const c = t.getContext(), w = 1024, h = 192;
        c.clearRect(0, 0, w, h); c.font = 'bold 112px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.shadowColor = '#e879f9'; c.shadowBlur = 30; c.fillStyle = '#fbe7ff'; c.fillText(String(name || 'DIRTY TUNING').toUpperCase(), w / 2, h / 2, w - 40);
        t.update();
    },

    // ---------------------------------------------------------------- o salão (uma vez; fica desligado fora da loja)
    _build(g) {
        if (this.built) return;
        this.built = true;
        const sc = g.scene, o = this.STAGE, M = this.meshes;
        const mat = (name, hex, tex, alpha) => {
            const m = new BABYLON.StandardMaterial(name, sc);
            m.disableLighting = true; m.fogEnabled = false; m.backFaceCulling = false;
            m.diffuseColor = BABYLON.Color3.Black(); m.specularColor = BABYLON.Color3.Black();
            m.emissiveColor = hex ? BABYLON.Color3.FromHexString(hex) : new BABYLON.Color3(1, 1, 1);
            if (tex && !alpha) { m.emissiveTexture = tex; m.emissiveColor = BABYLON.Color3.Black(); }       // (a textura emissiva SOMA com a cor; luz aditiva: só a cor, recortada pela opacidade)
            if (alpha) { m.opacityTexture = alpha; m.alphaMode = BABYLON.Engine.ALPHA_ADD; m.disableDepthWrite = true; }
            return m;
        };
        const tex = (name, w, h, draw) => { const t = new BABYLON.DynamicTexture(name, { width: w, height: h }, sc, true); draw(t.getContext(), w, h); t.update(); return t; };
        const add = (m, x, y, z) => { m.position.set(o.x + x, y, o.z + z); m.isPickable = false; m.setEnabled(false); M.push(m); return m; };
        // piso: concreto escuro polido com a grade das placas
        const floorT = tex('tuneFloorT', 512, 512, (c, w, h) => {
            c.fillStyle = '#16181d'; c.fillRect(0, 0, w, h);
            for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
            c.strokeStyle = '#272a32'; c.lineWidth = 3; for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * w / 4, 0); c.lineTo(i * w / 4, h); c.moveTo(0, i * h / 4); c.lineTo(w, i * h / 4); c.stroke(); }
        });
        floorT.uScale = floorT.vScale = 6;
        add(BABYLON.MeshBuilder.CreateGround('tuneFloor', { width: 30, height: 30 }, sc), 0, 0, 0).material = mat('tuneFloorM', '#ffffff', floorT);
        // poça de luz do refletor em volta da plataforma
        const radial = (name, inner) => tex(name, 256, 256, (c, w) => { const gr = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, '#fff'); gr.addColorStop(inner, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, w); });
        const pool = this.pool = add(BABYLON.MeshBuilder.CreateGround('tunePool', { width: 13, height: 13 }, sc), 0, 0.012, 0);
        pool.material = mat('tunePoolM', '#9aa4c4', null, radial('tunePoolA', 0.4)); pool.material.alpha = 0.6;
        // plataforma giratória + anel de neon
        const plat = this.plat = add(BABYLON.MeshBuilder.CreateCylinder('tunePlat', { diameter: 6.4, height: 0.13, tessellation: 64 }, sc), 0, 0.065, 0);
        const platT = tex('tunePlatT', 256, 256, (c, w) => { c.fillStyle = '#2a2d34'; c.fillRect(0, 0, w, w); c.strokeStyle = '#3a3e48'; c.lineWidth = 4; for (let i = 0; i < 16; i++) { c.beginPath(); c.moveTo(w / 2, w / 2); const t = i / 16 * Math.PI * 2; c.lineTo(w / 2 + Math.cos(t) * w, w / 2 + Math.sin(t) * w); c.stroke(); } });
        plat.material = mat('tunePlatM', '#ffffff', platT);
        const ring = this.ring = add(BABYLON.MeshBuilder.CreateTorus('tuneRing', { diameter: 6.45, thickness: 0.07, tessellation: 72 }, sc), 0, 0.13, 0);
        ring.material = mat('tuneRingM', '#e879f9');
        // neon do carro (no chão, sob ele): cor da peça escolhida
        const neon = this.neon = add(BABYLON.MeshBuilder.CreateGround('tuneNeon', { width: 3.6, height: 6.2 }, sc), 0, 0.14, 0);
        neon.material = mat('tuneNeonM', '#ff40ff', null, radial('tuneNeonA', 0.5)); neon.isVisible = false;
        // salão: caixa vista por dentro, painéis escuros com duas faixas de luz azul em volta
        const wallT = tex('tuneWallT', 512, 512, (c, w, h) => {
            const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#07080c'); gr.addColorStop(1, '#14161d'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
            c.strokeStyle = '#1d2029'; c.lineWidth = 4; for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * w / 4, 0); c.lineTo(i * w / 4, h); c.stroke(); }
            c.fillStyle = '#53c8ff'; c.fillRect(0, h * 0.62, w, 6); c.fillStyle = 'rgba(83,200,255,.25)'; c.fillRect(0, h * 0.62 - 8, w, 22);
            c.fillStyle = '#c05cff'; c.fillRect(0, h * 0.86, w, 4);
        });
        wallT.uScale = 3;
        const room = add(BABYLON.MeshBuilder.CreateBox('tuneRoom', { width: 30, height: 9, depth: 30, sideOrientation: BABYLON.Mesh.BACKSIDE }, sc), 0, 4.49, 0);
        room.material = mat('tuneRoomM', '#ffffff', wallT);
        // letreiro com o nome da loja nas quatro paredes
        const signT = this._signT = new BABYLON.DynamicTexture('tuneSignT', { width: 1024, height: 192 }, sc, true);
        signT.hasAlpha = true;
        const signM = mat('tuneSignM', '#ffffff', signT); signM.opacityTexture = signT;
        for (const [x, z, ry] of [[0, -14.9, Math.PI], [0, 14.9, 0], [14.9, 0, Math.PI / 2], [-14.9, 0, -Math.PI / 2]]) {
            const s = add(BABYLON.MeshBuilder.CreatePlane('tuneSign', { width: 11, height: 2.06 }, sc), x, 6.6, z);
            s.rotation.y = ry; s.material = signM;
        }
        // pilhas de pneus e gaveteiros vermelhos nos cantos
        const tire = mat('tuneTireM', '#121214'), chest = mat('tuneChestM', '#a61d24'), steel = mat('tuneSteelM', '#8a8f99');
        for (const [x, z] of [[-11.5, -11.5], [11.5, -11.5], [-11.5, 11.5]]) for (let i = 0; i < 4; i++) add(BABYLON.MeshBuilder.CreateCylinder('tuneTire', { diameter: 1.25, height: 0.42, tessellation: 24 }, sc), x, 0.21 + i * 0.43, z).material = tire;
        for (const [x, z, ry] of [[12.4, 6, Math.PI / 2], [-12.4, -5, Math.PI / 2], [6, 12.4, 0]]) {
            const b = add(BABYLON.MeshBuilder.CreateBox('tuneChest', { width: 2.4, height: 1.3, depth: 0.8 }, sc), x, 0.65, z); b.rotation.y = ry; b.material = chest;
            const t = add(BABYLON.MeshBuilder.CreateBox('tuneChestTop', { width: 2.45, height: 0.06, depth: 0.85 }, sc), x, 1.33, z); t.rotation.y = ry; t.material = steel;
        }
        for (const m of M) { m.renderingGroupId = 0; m.alwaysSelectAsActiveMesh = true; }
    },
};
