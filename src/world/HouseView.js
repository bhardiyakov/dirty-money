// ============================================================================
// HouseView — a safe house na tela: a casa por fora (paredes, telhado, porta, janelas) e o CORTE por dentro.
//
// Por fora: a casa é um barraco de verdade da favela (tijolo, zinco, tábua), com a porta turquesa na frente, luz quente saindo
//   pelo vão e uma SETA amarela pulando em frente à porta — o jeito de dizer "dá para entrar aqui". A porta abre sozinha quando
//   o jogador chega perto. Não há tecla nem chave: é só caminhar até a porta — e ele já aparece do lado de dentro.
// Por dentro: ao cruzar a soleira, o telhado e as paredes de fora somem (fade) e entra o corte da casa (art/HouseArt.interior),
//   com a câmera dando zoom 2× e enquadrando o cômodo inteiro, como na arte de referência. Saiu, tudo volta.
//
// `HouseView.t` vai de 0 (fora) a 1 (dentro). O Game consulta `focusFor` (enquadramento) e `inside`.
// ============================================================================

const HouseView = {
    t: 0,                  // 0 = fora, 1 = dentro (suavizado)
    inside: false,         // jogador dentro do cômodo (com histerese na soleira)
    ready: false,

    // ------------------------------------------------------------------ construção
    build(world) {
        const S = SafeHouse;
        if (!S.placed) return;
        const scene = world.scene, ox = S.ox, oz = S.oz, W = S.W, D = S.D, T = S.T, H = S.H;
        this.world = world; this.scene = scene;
        const A = HouseArt;
        const tex = (pc, wrap = true) => pc.toTexture(scene, { wrap, mips: wrap, aniso: 1 });
        const std = (name, texture, opts = {}) => {
            const m = new BABYLON.StandardMaterial(name, scene);
            if (texture) m.diffuseTexture = texture;
            m.specularColor = BABYLON.Color3.Black();
            if (opts.color) m.diffuseColor = BABYLON.Color3.FromHexString(opts.color);
            return m;
        };
        this.ext = [];                        // materiais que somem quando o jogador entra
        this.extMeshes = [];
        const fadeMat = (m) => { m.alpha = 0.999; m.forceDepthWrite = true; this.ext.push(m); return m; };

        const mats = {
            brick: fadeMat(std('hsBrick', tex(A.brick()))),
            zinc: fadeMat(std('hsZinc', tex(A.zinc()))),
            plank: fadeMat(std('hsPlank', tex(A.plank()))),
            cap: fadeMat(std('hsCap', null)),
            roofTop: fadeMat(std('hsRoofTop', tex(A.roof(), false))),
            roofSlab: fadeMat(std('hsRoofSlab', null)),
            glass: fadeMat(std('hsGlass', tex(A.window(), false))),
            door: fadeMat(std('hsDoor', tex(A.door(), false))),
        };
        mats.cap.diffuseColor = BABYLON.Color3.White(); mats.roofSlab.diffuseColor = BABYLON.Color3.White();
        this.mats = mats;

        // --- paredes de fora (caixas por trecho, com vãos para a porta e as janelas) ---
        const B = { brick: new MeshBatch(), zinc: new MeshBatch(), plank: new MeshBatch(), cap: new MeshBatch(), glass: new MeshBatch() };
        const CAP = [0.5, 0.48, 0.44], WOOD = [0.29, 0.21, 0.14];
        const piece = (kind, x0, z0, x1, z1, y0, y1, vertical) => {          // caixa de parede [x0..x1]×[z0..z1] de y0 a y1 (coords locais → mundo)
            if (x1 - x0 < 1e-3 || z1 - z0 < 1e-3 || y1 - y0 < 1e-3) return;
            const wx0 = ox + x0, wz0 = oz + z0, wx1 = ox + x1, wz1 = oz + z1, off = (x0 + z0) * 0.7;
            B[kind].walls(wx0, wz0, wx1, wz1, y0, y1, (s, y) => [(s + off) / 3.2, (H - y) / 3.2]);
            B.cap.top(wx0, wz0, wx1, wz1, y1, () => [0, 0], CAP);
        };
        // uma parede reta ao longo de `axis` ('x' ou 'z'), faixa transversal [c0, c1], de a0 a a1, com aberturas [{a,b,y0,y1}]
        const run = (axis, a0, a1, c0, c1, ops, pick) => {
            const list = ops.slice().sort((p, q) => p.a - q.a), put = (a, b, y0, y1) => {
                if (b - a < 1e-3) return;
                // materiais por trecho (zinco no lado do quarto, tijolo na cozinha)
                const cuts = pick.cuts ? [a].concat(pick.cuts.filter((c) => c > a && c < b), [b]) : [a, b];
                for (let i = 0; i + 1 < cuts.length; i++) {
                    const m = pick.fn((cuts[i] + cuts[i + 1]) / 2);
                    if (axis === 'x') piece(m, cuts[i], c0, cuts[i + 1], c1, y0, y1); else piece(m, c0, cuts[i], c1, cuts[i + 1], y0, y1);
                }
            };
            let cur = a0;
            for (const o of list) {
                put(cur, o.a, 0, H);
                if (o.y0 > 0) put(o.a, o.b, 0, o.y0);
                if (o.y1 < H) put(o.a, o.b, o.y1, H);
                cur = o.b;
            }
            put(cur, a1, 0, H);
        };
        const byWall = (w) => S.windows.filter((q) => q.wall === w).map((q) => ({ a: q.a, b: q.b, y0: q.y0, y1: q.y1 }));
        const d = S.door;
        const southOps = byWall('S').concat([{ a: d.x0, b: d.x1, y0: 0, y1: d.h }]);
        const splitPick = { cuts: [S.PX + S.PT], fn: (x) => (x < S.PX ? 'zinc' : 'brick') };
        run('x', 0, W, 0, T, southOps, splitPick);
        run('x', 0, W, D - T, D, byWall('N'), splitPick);
        run('z', T, D - T, 0, T, [], { fn: () => 'plank' });                                  // oeste
        run('z', T, D - T, W - T, W, byWall('E'), { fn: () => 'brick' });                    // leste

        // vidros das janelas (um quad no meio da parede, voltado para fora)
        const eps = 0.02, glassUV = [[0, 0], [1, 0], [0, 1], [1, 1]];
        for (const w of S.windows) {
            const y0 = w.y0, y1 = w.y1;
            if (w.wall === 'S') B.glass.quad([ox + w.a, y1, oz - eps], [ox + w.b, y1, oz - eps], [ox + w.a, y0, oz - eps], [ox + w.b, y0, oz - eps], [0, 0, -1], glassUV);
            else if (w.wall === 'N') B.glass.quad([ox + w.b, y1, oz + D + eps], [ox + w.a, y1, oz + D + eps], [ox + w.b, y0, oz + D + eps], [ox + w.a, y0, oz + D + eps], [0, 0, 1], glassUV);
            else if (w.wall === 'E') B.glass.quad([ox + W + eps, y1, oz + w.a], [ox + W + eps, y1, oz + w.b], [ox + W + eps, y0, oz + w.a], [ox + W + eps, y0, oz + w.b], [1, 0, 0], glassUV);
        }
        // batentes da porta e trave
        const post = (x0) => B.cap.solid(ox + x0, oz - 0.08, ox + x0 + 0.18, oz + T + 0.08, 0, d.h + 0.1, WOOD);
        post(d.x0 - 0.18); post(d.x1);
        B.cap.solid(ox + d.x0 - 0.18, oz - 0.08, ox + d.x1 + 0.18, oz + T + 0.08, d.h, d.h + 0.18, WOOD);
        // toldo listrado (turquesa e creme) sobre a porta: de cima é a marca visível da entrada
        { const n = 5, w = (d.x1 - d.x0 + 1.0) / n, x0 = d.x0 - 0.5;
          for (let k = 0; k < n; k++) B.cap.solid(ox + x0 + k * w, oz - 1.1, ox + x0 + (k + 1) * w, oz - 0.05, 2.5, 2.68, k % 2 ? [0.93, 0.88, 0.74] : [0.16, 0.6, 0.62]);
          for (const px of [x0 + 0.05, x0 + n * w - 0.17]) B.cap.solid(ox + px, oz - 1.0, ox + px + 0.12, oz - 0.88, 0, 2.5, WOOD); }

        const build = (key, mat, opts = {}) => {
            const mesh = B[key].build('hs_' + key, scene, mat, Object.assign({ receiveShadows: true, alwaysActive: true }, opts));
            if (mesh) { mesh.freezeWorldMatrix(); this.extMeshes.push(mesh); }
            return mesh;
        };
        build('brick', mats.brick); build('zinc', mats.zinc); build('plank', mats.plank);
        build('cap', mats.cap, { vertexColors: true });
        const glass = build('glass', mats.glass, { receiveShadows: false });
        if (glass) { mats.glass.backFaceCulling = false; }

        // --- telhado: chapa de zinco pintada (24×16 u) com beiral, + laje fina de borda ---
        const rx0 = ox - 0.5, rz0 = oz + 0.05, rx1 = ox + W + 0.5, rz1 = oz + D + 0.5, ry = S.ROOF_Y;      // (sem beiral na frente: a porta fica à vista)
        const RB = new MeshBatch(), SL = new MeshBatch();
        SL.solid(rx0, rz0, rx1, rz1, ry - 0.3, ry, [0.4, 0.37, 0.33]);
        RB.top(rx0, rz0, rx1, rz1, ry + 0.012, (x, z) => [(x - rx0) / (rx1 - rx0), (rz1 - z) / (rz1 - rz0)]);
        const slab = SL.build('hs_roofSlab', scene, mats.roofSlab, { vertexColors: true, receiveShadows: true });
        const top = RB.build('hs_roofTop', scene, mats.roofTop, { receiveShadows: true });
        for (const m of [slab, top]) if (m) { m.freezeWorldMatrix(); this.extMeshes.push(m); }
        mats.roofTop.diffuseTexture.wrapU = mats.roofTop.diffuseTexture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

        // --- porta (folha que gira na dobradiça) ---
        const pivot = new BABYLON.TransformNode('hsDoorPivot', scene);
        pivot.position.set(ox + d.x0, 0, oz + T * 0.5);
        const leaf = BABYLON.MeshBuilder.CreateBox('hsDoorLeaf', { width: d.x1 - d.x0, height: d.h, depth: 0.12 }, scene);
        leaf.parent = pivot; leaf.position.set((d.x1 - d.x0) / 2, d.h / 2, 0);
        leaf.material = mats.door; leaf.isPickable = false; leaf.receiveShadows = true;
        this.pivot = pivot; this.leaf = leaf; this.extMeshes.push(leaf);
        this.open = 0;

        // --- degrau da entrada (permanente) ---
        const ST = new MeshBatch();
        ST.solid(ox + d.x0 - 0.5, oz - 1.1, ox + d.x1 + 0.5, oz - 0.02, 0, 0.14, [0.52, 0.5, 0.46]);
        const stoop = ST.build('hs_stoop', scene, world.mats.solid, { vertexColors: true, receiveShadows: true });
        if (stoop) stoop.freezeWorldMatrix();

        // --- o corte do interior: um quadro pintado deitado no chão ---
        const art = A.interior(), IN = art.in;
        const itex = tex(art.canvas, false);
        itex.hasAlpha = true;
        const im = new BABYLON.StandardMaterial('hsInterior', scene);
        im.diffuseTexture = itex; im.useAlphaFromDiffuseTexture = true;
        im.diffuseColor = BABYLON.Color3.Black(); im.specularColor = BABYLON.Color3.Black();
        im.emissiveColor = new BABYLON.Color3(1, 1, 1); im.disableLighting = true;
        im.backFaceCulling = false; im.alpha = 0.999; im.forceDepthWrite = false;
        const IB = new MeshBatch();
        const ix0 = ox + IN.x0, ix1 = ox + IN.x1, iz0 = oz + IN.z0, iz1 = oz + IN.z1;
        IB.top(ix0, iz0, ix1, iz1, 0.14, (x, z) => [(x - ix0) / (ix1 - ix0), (iz1 - z) / (iz1 - iz0)]);
        const interior = IB.build('hs_interior', scene, im, { receiveShadows: false });
        interior.freezeWorldMatrix(); interior.setEnabled(false);
        this.interior = interior; this.interiorMat = im;

        // --- sombra: uma caixa-fantasma (volume da casa) sempre projeta, mesmo com o telhado "apagado" por dentro ---
        if (world.shadow && world._ghost) {
            const g = BABYLON.MeshBuilder.CreateBox('hs_shadow', { width: W + 1, height: S.ROOF_Y, depth: D + 1 }, scene);
            g.position.set(ox + W / 2, S.ROOF_Y / 2, oz + D / 2);
            g.material = world._ghost; g.isPickable = false; g.receiveShadows = false; g.layerMask = 0x10000000; g.freezeWorldMatrix();
            world.shadow.addShadowCaster(g);
        }

        // --- colisores para os carros (a física não enxerga CityGrid.obstacles): paredes e a porta ---
        for (const o of CityGrid.obstacles) if (o.home === 'wall') world._collider('hs_wall_' + o.x0.toFixed(1) + '_' + o.z0.toFixed(1), o.x0, o.z0, o.x1, o.z1, H);
        world._collider('hs_door', ox + d.x0, oz, ox + d.x1, oz + T, d.h);

        // --- brilhos: lâmpada (dentro), luz saindo pela porta e pelas janelas (fora) ---
        const G = new GlowBatch(scene, 8, 'houseGlow', 'glow');
        this.glow = G;
        this.g = { bulb: G.alloc(), bulb2: G.alloc(), door: G.alloc(), doorCore: G.alloc(), win: [G.alloc(), G.alloc(), G.alloc()] };
        const bx = ox + art.bulb.x, bz = oz + art.bulb.z;
        G.place(this.g.bulb, bx, 0.9, bz, 3.2); G.place(this.g.bulb2, bx, 0.12, bz, 14);
        const dc = S.doorWorld();
        G.place(this.g.door, dc.x, 0.25, dc.z - 2.6, 9); G.place(this.g.doorCore, dc.x, 0.9, dc.z - 0.2, 3);
        const wins = [S.windows[0], S.windows[1], S.windows[3]];
        wins.forEach((w, i) => {
            const wx = w.wall === 'E' ? ox + W + 1.3 : ox + (w.a + w.b) / 2, wz = w.wall === 'S' ? oz - 1.2 : (w.wall === 'N' ? oz + D + 1.2 : oz + (w.a + w.b) / 2);
            G.place(this.g.win[i], wx, 0.2, wz, 5);
        });
        G.flush();

        // --- seta de entrada (acima do telhado, sempre visível): pulando em frente à porta ---
        const at = A.arrow().toTexture(scene, { wrap: false, mips: false });
        at.hasAlpha = true;
        const am = new BABYLON.StandardMaterial('hsArrow', scene);
        am.diffuseTexture = at; am.useAlphaFromDiffuseTexture = true; am.diffuseColor = BABYLON.Color3.Black();
        am.emissiveColor = new BABYLON.Color3(1, 1, 1); am.disableLighting = true; am.specularColor = BABYLON.Color3.Black();
        am.transparencyMode = BABYLON.Material.MATERIAL_ALPHATEST; am.alphaCutOff = 0.5; am.backFaceCulling = false;
        const arrow = BABYLON.MeshBuilder.CreateGround('hsArrow', { width: 2.4, height: 3.0 }, scene);
        arrow.material = am; arrow.isPickable = false; arrow.renderingGroupId = 1; arrow.alwaysSelectAsActiveMesh = true;
        this.arrow = arrow; this.arrowMat = am;
        this.arrowBase = { x: dc.x, z: dc.z - 3.3 };
        arrow.position.set(this.arrowBase.x, 5.4, this.arrowBase.z);

        this.time = 0;
        this.ready = true;
        console.log(`[SAFE HOUSE] em (${ox}, ${oz}); porta em x=${dc.x.toFixed(1)}`);
    },

    // ------------------------------------------------------------------ por quadro
    update(dt, game) {
        if (!this.ready) return;
        const S = SafeHouse;
        let p = game.player.position;
        this.time += dt;
        const onFoot = game.mode === 'player' && !game.heliFall;
        // Entrar: chegou à porta pelo lado de fora → já aparece DENTRO de casa (logo depois da soleira, virado para o cômodo), com o
        // corte e o zoom na hora (sem precisar atravessar a soleira andando). Rearma só depois de se afastar da porta (sair não re-entra).
        if (onFoot && !this.inside && !game.player.busy && !game.player.rag) {
            const dc = S.doorWorld(), dd = Math.hypot(p.x - dc.x, p.z - dc.z);
            if (dd > 3.2) this._reArm = true;
            const lz = p.z - S.oz;
            if (this._reArm && Math.abs(p.x - dc.x) < (S.door.x1 - S.door.x0) / 2 + 0.5 && lz > -1.6 && lz < 0.5) {
                this._reArm = false;
                game.player.teleport(new BABYLON.Vector3(dc.x, 0, S.oz + S.T + 1.4));
                game.player.root.rotation.y = 0;
                p = game.player.position;
                if (game.player.velocity) game.player.velocity.setAll(0);
                this.inside = true; this.t = 1; this._first = true;
                game.camera.setZoomMul(0.5);
                game.camera.snapTo(this.focusFor(game.player.position, game.camera, game.gameEngine.engine.getAspectRatio(game.camera.camera)));
            }
        }
        if (onFoot) this.inside = this.inside ? S.inside(p.x, p.z, -0.35) : S.inside(p.x, p.z, 0);
        else this.inside = false;

        // transição fora ↔ dentro
        const target = this.inside ? 1 : 0, prev = this.t;
        if (!this._init) { this._init = true; this.t = target; this._first = true; }              // (o jogo já começa dentro de casa: sem fade de abertura)
        this.t += (target - this.t) * (1 - Math.exp(-7 * dt));
        if (Math.abs(target - this.t) < 0.004) this.t = target;
        const t = this.t;
        if (t !== prev || this._first) {
            this._first = false;
            const extA = Math.max(0, Math.min(1, 1 - t * 1.2)), inA = Math.max(0, Math.min(1, (t - 0.12) * 1.3));
            for (const m of this.ext) m.alpha = Math.min(0.999, extA);
            for (const m of this.extMeshes) m.setEnabled(extA > 0.01);
            this.interiorMat.alpha = Math.min(0.999, inA);
            this.interior.setEnabled(inA > 0.01);
            game.camera.setZoomMul(1 - 0.5 * t * t * (3 - 2 * t));
        }

        // o minimapa não serve dentro de casa (e taparia a cama): some com o corte
        const mm = document.getElementById('minimap');
        if (mm && t !== this._mmT) { this._mmT = t; mm.style.opacity = String(1 - Math.min(1, t * 1.6)); mm.style.transition = 'none'; }

        // porta: abre quando alguém chega perto, nos dois lados
        const dc = S.doorWorld(), near = Math.hypot(p.x - dc.x, p.z - dc.z) < 3.6;
        this.open += ((near ? 1 : 0) - this.open) * (1 - Math.exp(-6 * dt));
        this.pivot.rotation.y = -this.open * 1.5;

        // luz: à noite o interior fica mais escuro (só a lâmpada ilumina) e as janelas acendem
        const night = game.dayNight ? game.dayNight.night : 0;
        const k = 1 - 0.3 * night;
        this.interiorMat.emissiveColor.set(k, k * 0.97, k * 0.92);
        this.mats.glass.emissiveColor.set(0.5 * night, 0.34 * night, 0.12 * night);
        const flick = 0.92 + 0.05 * Math.sin(this.time * 7.3) + 0.03 * Math.sin(this.time * 19.1);
        const G = this.glow, g = this.g;
        G.color(g.bulb, 1.0, 0.82, 0.45, 0.3 * t * flick);
        G.color(g.bulb2, 1.0, 0.78, 0.38, (0.16 + 0.3 * night) * t * flick);
        G.color(g.door, 1.0, 0.8, 0.42, (0.16 + 0.5 * night) * (1 - t) * (0.7 + 0.3 * this.open));
        G.color(g.doorCore, 1.0, 0.85, 0.5, (0.12 + 0.3 * night) * (1 - t) * this.open);
        for (const w of g.win) G.color(w, 1.0, 0.8, 0.4, 0.5 * night * (1 - t));
        G.flush();

        // seta: pula em frente à porta; some quando se está dentro ou longe
        const dist = Math.hypot(p.x - dc.x, p.z - dc.z), vis = (1 - t) * (dist < 80 ? 1 : 0);
        this.hint = (!this.inside && onFoot && dist < 7 && t < 0.05) ? '<b>SEU ESCONDERIJO</b><small>a porta está aberta — é só entrar</small>' : '';
        this.arrow.setEnabled(vis > 0.05);
        if (vis > 0.05) {
            const bob = Math.abs(Math.sin(this.time * 3.2));
            this.arrow.position.z = this.arrowBase.z - 0.15 + bob * 0.7;
            const s = 0.9 + 0.12 * Math.sin(this.time * 6.4) + (dist < 14 ? 0.12 : 0);
            this.arrow.scaling.set(s, 1, s);
        }
    },

    // Retângulo da casa (com a face norte pintada) em pixels do canvas de efeitos (w×h = tamanho interno do render), ou null.
    screenRect(scene, w, h) {
        const cam = scene.activeCamera, S = SafeHouse;
        if (!cam) return null;
        const vp = cam.viewport.toGlobal(w, h), M = scene.getTransformMatrix();
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const [x, z] of [[S.ox - 0.1, S.oz - 0.3], [S.ox + S.W + 0.1, S.oz - 0.3], [S.ox - 0.1, S.oz + S.D + 2.5], [S.ox + S.W + 0.1, S.oz + S.D + 2.5]]) {
            const p = BABYLON.Vector3.Project(new BABYLON.Vector3(x, 0.14, z), BABYLON.Matrix.IdentityReadOnly, M, vp);
            x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
        }
        return { x0: Math.floor(x0), y0: Math.floor(y0), x1: Math.ceil(x1), y1: Math.ceil(y1) };
    },

    // Enquadramento da câmera: dentro da casa ela mira no cômodo inteiro (se couber na tela; senão segue o jogador sem sair dos limites).
    focusFor(pos, cam, aspect) {
        const t = this.t;
        if (!this.ready || t < 0.002) return pos;
        const S = SafeHouse, c = S.center(), view = cam.viewHalf * 0.5;
        const hx = S.W / 2 + 0.8, hz = S.D / 2 + 1.1, cz = c.z + 1.1;
        const halfW = view * Math.max(1, aspect), halfH = view;
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        const fx = hx <= halfW ? c.x : clamp(pos.x, c.x - (hx - halfW), c.x + (hx - halfW));
        const fz = hz <= halfH ? cz : clamp(pos.z, cz - (hz - halfH), cz + (hz - halfH));
        const e = t * t * (3 - 2 * t);
        this._focus = this._focus || { x: 0, z: 0 };
        this._focus.x = pos.x + (fx - pos.x) * e; this._focus.z = pos.z + (fz - pos.z) * e;
        return this._focus;
    },
};
