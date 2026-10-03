// ============================================================================
// WorldBuilder — constrói Liberty City em 3D a partir do CityGrid.
// Tudo é geometria MESCLADA (1 malha por material) com UVs em coordenadas de
// mundo e texturas pixel art tileáveis (TileFactory):
//   mar animado + orla | ruas, cruzamentos e faixas de pedestres |
//   calçadas, parques, praias e pátios | prédios (fachada, telhado, platibanda)
// Devolve o que o resto do jogo precisa: piso de física, colisores e malhas
// andáveis para o NavMesh.
// ============================================================================

class WorldBuilder {
    constructor(scene, shadowGenerator) {
        this.scene = scene;
        this.shadow = shadowGenerator;
        this.T = null;
        this.mats = {};
        this.batches = {};
        this.meshes = [];
        this.colliders = [];
        this.navTargets = [];
        this.ground = null;

        this._waterTime = 0;
        this._waterFrame = 0;
    }

    build() {
        const t0 = performance.now();
        this.T = TileFactory.create(this.scene);
        this.props = PropSprites.create(this.scene);
        this._createMaterials();
        this._water();
        this._shore();
        this._roads();
        this._bridges();
        this._medians();
        this._tunnels();
        this._viaducts();
        this._blocks();
        this._buildings();
        this._shops();
        this._rural();
        this._marina();
        this._signalPoles();
        this._streetLamps();
        this._favelaPoles();
        this._shopGlow();
        this._helipads();
        this._props();
        this._flush();
        HouseView.build(this);                // a safe house do protagonista (paredes, telhado, porta e o corte do interior)
        this.street.build();
        // Terreno do mundo grande: pedaços construídos ao redor do foco (já os do ponto de partida, sem pop-in).
        this.terrain = new TerrainBuilder(this);
        this.terrain.prebuild(CityGrid.startPos());
        console.log(`[MUNDO] construído em ${(performance.now() - t0).toFixed(0)} ms (terreno: ${JSON.stringify(this.terrain.info)})`);
        return { ground: this.ground, colliders: this.colliders, navTargets: this.navTargets };
    }

    // ---------------------------------------------------------------- materiais
    _mat(name, tex, opts = {}) {
        const m = new BABYLON.StandardMaterial(name, this.scene);
        if (tex) m.diffuseTexture = tex;
        m.specularColor = BABYLON.Color3.Black();
        if (opts.alphaTest) {
            tex.hasAlpha = true;
            m.useAlphaFromDiffuseTexture = true;
            m.transparencyMode = BABYLON.Material.MATERIAL_ALPHATEST;
            m.alphaCutOff = 0.5;
        }
        if (opts.color) m.diffuseColor = BABYLON.Color3.FromHexString(opts.color);
        return m;
    }

    _createMaterials() {
        const T = this.T, M = this.mats;
        M.water = this._mat('water', T.water[0]);
        M.shore = this._mat('shore', T.shore, { alphaTest: true });
        M.road = this._mat('road', T.road);
        M.asphalt = this._mat('asphalt', T.asphalt);
        M.zebra = this._mat('zebra', T.zebra);
        M.sidewalk = this._mat('sidewalk', T.sidewalk);
        M.grass = this._mat('grass', T.grass);
        M.sand = this._mat('sand', T.sand);
        M.concrete = this._mat('concrete', T.concrete);
        M.dirt = this._mat('dirt', T.dirt);
        M.rock = this._mat('rock', T.rock);
        M.shop = this._mat('shop', T.shops.diffuse);
        M.shop.emissiveTexture = T.shops.emissive; M.shop.emissiveTexture.level = 0;      // acende à noite (setNight)
        M.earth = this._mat('earth', T.earth);
        M.plaza = this._mat('plaza', T.plaza);
        M.curb = this._mat('curb', null, { color: '#a4a9b0' });
        M.solid = this._mat('solid', null);            // peças de cor sólida (vertex colors).
        M.solid.diffuseColor = BABYLON.Color3.White();
        M.hide = HideSprites.create(this.scene);       // topo dos esconderijos (caçamba, caixotes, latão)

        // Estruturas que podem ficar ACIMA do jogador/veículo (viaduto, ponte sobre a água, túnel, cobertura de posto): mesmos
        // materiais, mas com o círculo de visibilidade (RevealPlugin). Chaves de batch 'x…'.
        M.xroad = Reveal.apply(this._mat('xroad', T.road));
        M.xsidewalk = Reveal.apply(this._mat('xsidewalk', T.sidewalk));
        M.xcurb = Reveal.apply(this._mat('xcurb', null, { color: '#a4a9b0' }));
        M.xrock = Reveal.apply(this._mat('xrock', T.rock));
        M.xsolid = Reveal.apply(this._mat('xsolid', null));
        M.xsolid.diffuseColor = BABYLON.Color3.White();
        for (const k of ['xroad', 'xsidewalk', 'xcurb', 'xrock', 'xsolid']) { M[k].alpha = 0.999; M[k].forceDepthWrite = true; }      // (liga a mistura: o furo é um degradê de alfa)

        M.roofs = {};
        for (const k of Object.keys(T.roofs)) M.roofs[k] = this._mat('roof_' + k, T.roofs[k]);

        M.facades = {};
        for (const k of Object.keys(T.facades)) {
            const m = this._mat('facade_' + k, T.facades[k].diffuse);
            m.emissiveTexture = T.facades[k].emissive;
            m.emissiveTexture.level = 0;                 // acende à noite (setNight).
            M.facades[k] = m;
        }
    }

    // Garante um batch com chave (e o material por chave).
    // Com (x, z): a peça vai para o pedaço de 512 u que contém esse ponto (uma malha por material E pedaço (512 u): o frustum descarta
    // o que está longe da tela; sem pedaços, a cidade inteira seria desenhada a cada frame).
    _batch(key, x = null, z = null) {
        if (x !== null) key += '@' + Math.floor(x / 512) + ',' + Math.floor(z / 512);
        return this.batches[key] || (this.batches[key] = new MeshBatch());
    }

    // -------------------------------------------------------------------- mar
    _water() {
        // O plano d'água cobre o mundo inteiro (e uma margem de mar): é também o piso da física.
        const W = Config.world, size = Math.max(W.maxX - W.minX, W.maxZ - W.minZ) + Config.city.waterMargin * 2;
        this.ground = BABYLON.MeshBuilder.CreateGround('water', { width: size, height: size }, this.scene);
        this.ground.position.set((W.minX + W.maxX) / 2, 0, (W.minZ + W.maxZ) / 2);
        this.ground.material = this.mats.water;
        this.ground.receiveShadows = true;
        this.ground.isPickable = false;
        // 1 tile de água = 4u.
        for (const t of this.T.water) { t.uScale = size / 4; t.vScale = size / 4; }
    }

    // (A espuma da costa agora é feita junto com o terreno, por pedaço: TerrainBuilder._foam.)
    _shore() {}

    // ------------------------------------------------------------------ ruas
    // Cada TRECHO do grafo vira faixas de asfalto (ou terra/chão batido) entre os cruzamentos; cada NÓ vira um quadrado liso.
    // Peças longas são partidas em ≤ 96 u (cada uma vai para o seu pedaço de 256 u: o frustum descarta o que está longe).
    _roads() {
        const y = 0.02, MAXP = 96;
        const KEY = { asphalt: 'road', dirt: 'road_dirt', earth: 'road_earth' };
        const cs = (x, z) => { const s = WorldMap.shadeAt(x, z); return [s, s, s]; };
        const piece = (x0, z0, x1, z1, key, uvFn, shade = false) => {
            const alongX = (x1 - x0) >= (z1 - z0), len = alongX ? x1 - x0 : z1 - z0, n = Math.max(1, Math.ceil(len / MAXP));
            for (let k = 0; k < n; k++) {
                const a = (alongX ? x0 : z0) + len * k / n, b = (alongX ? x0 : z0) + len * (k + 1) / n;
                const r = alongX ? [a, z0, b, z1] : [x0, a, x1, b];
                this._batch(shade ? key + '$' : key, r[0], r[1]).top(r[0], r[1], r[2], r[3], y, uvFn, shade ? [cs(r[0], r[3]), cs(r[2], r[3]), cs(r[0], r[1]), cs(r[2], r[1])] : undefined);
            }
        };

        for (const e of RoadPlan.edges) {
            const S = RoadPlan.CLASS[e.cls].surface, key = KEY[S], hw = e.w / 2;
            if (e.v) {
                const xk = e.a.x, za = e.a.z + e.a.hwEW, zb = e.b.z - e.b.hwEW;
                if (zb <= za + 0.01) continue;
                piece(xk - hw, za, xk + hw, zb, key, S === 'asphalt' ? (x, z) => [z / 8, (x - (xk - hw)) / e.w] : (x, z) => [x / 4, z / 4], e.cls === 'fav');
            } else {
                const zm = e.a.z, xa = e.a.x + e.a.hwNS, xb = e.b.x - e.b.hwNS;
                if (xb <= xa + 0.01) continue;
                piece(xa, zm - hw, xb, zm + hw, key, S === 'asphalt' ? (x, z) => [x / 8, ((zm + hw) - z) / e.w] : (x, z) => [x / 4, z / 4], e.cls === 'fav');
            }
        }

        // Cruzamentos e curvas: quadrado liso (asfalto, chão batido ou terra, pela via mais larga que chega).
        for (const n of RoadPlan.nodes) {
            let best = null;
            for (let q = 0; q < 4; q++) if (n.edge[q] && (!best || n.edge[q].w > best.w)) best = n.edge[q];
            const S = RoadPlan.CLASS[best.cls].surface;
            const key = S === 'asphalt' ? 'asphalt' : (S === 'dirt' ? 'road_dirt' : 'road_earth');
            if (n.turnR) { this._turn(n, S === 'asphalt' ? 'asphalt' : key, y); continue; }
            const shd = key === 'road_earth';                                          // favela: o chão segue o morro (tingido pelo relevo)
            this._batch(shd ? key + '$' : key, n.x, n.z).top(n.x - n.hwNS, n.z - n.hwEW, n.x + n.hwNS, n.z + n.hwEW, y, (x, z) => [x / 4, -z / 4], shd ? [cs(n.x - n.hwNS, n.z + n.hwEW), cs(n.x + n.hwNS, n.z + n.hwEW), cs(n.x - n.hwNS, n.z - n.hwEW), cs(n.x + n.hwNS, n.z - n.hwEW)] : undefined);
        }

        // Faixas de pedestres (zebra).
        const zy = 0.03;
        for (const cw of CityGrid.crosswalks) {
            const zebra = this._batch('zebra', cw.x0, cw.z0);
            if (cw.axis === 'x') zebra.top(cw.x0, cw.z0, cw.x1, cw.z1, zy, (x, z) => [(x - cw.x0) / (cw.x1 - cw.x0), (cw.z1 - z) / (cw.z1 - cw.z0)]);     // atravessa em X; listras no eixo Z
            else zebra.top(cw.x0, cw.z0, cw.x1, cw.z1, zy, (x, z) => [(z - cw.z0) / (cw.z1 - cw.z0), (x - cw.x0) / (cw.x1 - cw.x0)]);                  // atravessa em Z; listras no eixo X
        }
    }

    // Curva larga de uma estrada (nó de 2 pernas com raio): faixa de asfalto em arco (quarto de coroa) entre a entrada e a saída.
    _turn(n, key, y) {
        const sv = n.nbr[0] ? 1 : -1, sh = n.nbr[2] ? 1 : -1, R = n.turnR, w = Math.max(n.wNS, n.wEW);
        const C = { x: n.x + sh * R, z: n.z + sv * R };
        const a0 = Math.atan2(0, -sh), a1 = Math.atan2(-sv, 0);
        let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        const N = 14, pt = (k, r) => { const t = a0 + d * k / N; return [C.x + r * Math.cos(t), C.z + r * Math.sin(t)]; };
        const ro = R + w / 2, ri = R - w / 2;
        for (let k = 0; k < N; k++) {
            let a = pt(k, ro), b = pt(k + 1, ro), c = pt(k, ri), e = pt(k + 1, ri);
            const cross = (e[0] - b[0]) * (a[1] - b[1]) - (e[1] - b[1]) * (a[0] - b[0]);       // orientação de (d,b,a) vista de cima
            if (cross < 0) { [a, b] = [b, a]; [c, e] = [e, c]; }
            const uv = (p) => [p[0] / 4, -p[1] / 4];
            this._batch(key, n.x, n.z).quad([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], [e[0], y, e[1]], [0, 1, 0], [uv(a), uv(b), uv(c), uv(e)]);
        }
    }

    // Canteiro central das avenidas (classe 'ave'): divisória de concreto com meio-fio, entre os cruzamentos.
    // (Sem grama nem palmeiras: o canteiro faz parte da pista e vegetação é proibida em via.)
    _medians() {
        const h = Config.city.curbHeight;
        for (const e of RoadPlan.edges) {
            if (e.cls !== 'ave') continue;
            const mw = RoadPlan.CLASS.ave.median / 2;
            let x0, x1, z0, z1;
            if (e.v) { x0 = e.a.x - mw; x1 = e.a.x + mw; z0 = e.a.z + e.a.hwEW + 3; z1 = e.b.z - e.b.hwEW - 3; }
            else { z0 = e.a.z - mw; z1 = e.a.z + mw; x0 = e.a.x + e.a.hwNS + 3; x1 = e.b.x - e.b.hwNS - 3; }
            if (x1 <= x0 + 1 || z1 <= z0 + 1) continue;
            this._batch('open_concrete', x0, z0).top(x0, z0, x1, z1, h, (x, z) => [x / 4, -z / 4]);
            this._batch('curb', x0, z0).walls(x0, z0, x1, z1, 0, h, () => [0, 0]);
        }
    }

    // Túneis (CityGrid._planTunnels): maciço de pedra sobre a pista, com portais de concreto nas duas bocas.
    _tunnels() {
        const rock = [0.42, 0.4, 0.37], rockD = [0.3, 0.28, 0.26], conc = [0.62, 0.61, 0.58], dark = [0.05, 0.05, 0.07], H = 7;
        for (const t of RoadPlan.tunnels || []) {
            const hw = t.w / 2, m = 6.5, v = t.v, cx = v ? t.x0 : (t.x0 + t.x1) / 2, cz = v ? (t.z0 + t.z1) / 2 : t.z0;      // centro da via
            const bx0 = v ? cx - hw - m : t.x0, bx1 = v ? cx + hw + m : t.x1, bz0 = v ? t.z0 : cz - hw - m, bz1 = v ? t.z1 : cz + hw + m;
            const tr = this._batch('xtrim', bx0, bz0), tp = this._batch('open_xrock', bx0, bz0);
            // dois "ombros" de pedra (laterais da pista) e a laje do teto
            if (v) { tr.solid(bx0, bz0, cx - hw, bz1, 0.1, H, rock); tr.solid(cx + hw, bz0, bx1, bz1, 0.1, H, rock); }
            else { tr.solid(bx0, bz0, bx1, cz - hw, 0.1, H, rock); tr.solid(bx0, cz + hw, bx1, bz1, 0.1, H, rock); }
            tr.solid(bx0, bz0, bx1, bz1, 4.6, H + 0.4, rockD);
            tp.top(bx0, bz0, bx1, bz1, H + 0.42, (x, z) => [x / 4, -z / 4]);                                                   // textura de pedra no topo
            // portais: pilares + viga de concreto e faixa escura (a boca)
            for (const end of [0, 1]) {
                if (v) { const z = end ? bz1 - 1.6 : bz0, z2 = z + 1.6; tr.solid(bx0, z, bx1, z2, 0.1, H + 0.5, conc); tr.solid(cx - hw, z - (end ? 0 : 0), cx + hw, z2, 0.1, 4.6, dark); }
                else { const x = end ? bx1 - 1.6 : bx0, x2 = x + 1.6; tr.solid(x, bz0, x2, bz1, 0.1, H + 0.5, conc); tr.solid(x, cz - hw, x2, cz + hw, 0.1, 4.6, dark); }
            }
            // sólidos a pé: as laterais de pedra (a pista continua passável)
            if (v) { CityGrid.addObstacles([{ x0: bx0, z0: bz0, x1: cx - hw, z1: bz1, h: H }, { x0: cx + hw, z0: bz0, x1: bx1, z1: bz1, h: H }]); }
            else { CityGrid.addObstacles([{ x0: bx0, z0: bz0, x1: bx1, z1: cz - hw, h: H }, { x0: bx0, z0: cz + hw, x1: bx1, z1: bz1, h: H }]); }
            // colisão dos carros: as duas paredes laterais (a física não vê as obstacles)
            if (v) { this._collider('tun_l', bx0, bz0, cx - hw, bz1, 6); this._collider('tun_r', cx + hw, bz0, bx1, bz1, 6); }
            else { this._collider('tun_l', bx0, bz0, bx1, cz - hw, 6); this._collider('tun_r', bx0, cz + hw, bx1, bz1, 6); }
        }
    }

    // VIADUTOS: tabuleiro elevado (rampas nas pontas), pista com faixas, guarda-corpos e pilares. O tabuleiro cobre as ruas que
    // passam por baixo; os carros daqui de cima sobem junto (Vehicle.syncVisual) e ficam em outra camada de colisão.
    _viaducts() {
        const conc = [0.6, 0.6, 0.58], rail = [0.72, 0.72, 0.7], dark = [0.25, 0.26, 0.29], stripe = [0.8, 0.65, 0.2];
        for (const e of RoadPlan.viaducts || []) {
            if (!e.v) continue;
            const hw = e.w / 2, SW = 1.2, xk = e.a.x, H = e.elev, R = e.ramp, L = e.len;
            const yAt = (z) => { const s = z - e.a.z; return Math.max(0, Math.min(H, s / R * H, (L - s) / R * H)); };
            const z0 = e.a.z + e.a.hwEW, z1 = e.b.z - e.b.hwEW, step = 4;
            for (let z = z0; z < z1 - 0.01; z += step) {
                const zb = Math.min(z1, z + step), ya = yAt(z) + 0.2, yb = yAt(zb) + 0.2;
                const bt = this._batch('xroad', xk, z);
                // pista (quad inclinado nas rampas) com o UV da rua; calçadinha lateral e muretas em caixas escalonadas
                bt.quad([xk - hw, yb, zb], [xk + hw, yb, zb], [xk - hw, ya, z], [xk + hw, ya, z], [0, 1, 0], [[z / 8 * 0 + zb / 8, 0], [zb / 8, 1], [z / 8, 0], [z / 8, 1]]);
                const tr = this._batch('xtrim', xk, z), ym = Math.max(ya, yb);
                tr.solid(xk - hw - SW, z, xk + hw + SW, zb, ym - 1.0, ym - 0.12, conc);                                       // viga sob a pista
                for (const s of [-1, 1]) {
                    const rx = xk + s * (hw + SW * 0.5);
                    tr.solid(rx - SW * 0.5, z, rx + SW * 0.5, zb, ym - 0.12, ym + 1.0, rail);                                 // mureta
                    tr.solid(rx - SW * 0.5 - 0.02, z, rx + SW * 0.5 + 0.02, zb, ym + 0.92, ym + 1.0, stripe);
                }
            }
            // Pilares a cada 28 u onde o tabuleiro já está alto.
            for (let z = z0 + 14; z < z1 - 8; z += 28) {
                const y = yAt(z);
                if (y < 1.4) continue;
                const tr = this._batch('xtrim', xk, z);
                tr.solid(xk - 0.9, z - 0.9, xk + 0.9, z + 0.9, 0, y - 0.8, dark);
                tr.solid(xk - 5, z - 0.9, xk + 5, z + 0.9, y - 1.4, y - 0.8, conc);                                          // cabeçote do pilar
                CityGrid.addObstacles([{ x0: xk - 0.9, z0: z - 0.9, x1: xk + 0.9, z1: z + 0.9, h: y }]);
                this._collider('via_pil', xk - 0.9, z - 0.9, xk + 0.9, z + 0.9, y);
            }
            // Guarda-corpos físicos (só a camada do viaduto colide com eles).
            for (const s of [-1, 1]) { const rx = xk + s * (hw + SW * 0.5); this._collider('via_rail', rx - SW * 0.5, z0 + 40, rx + SW * 0.5, z1 - 40, 1.0, 2); }
        }
    }

    // As PONTES: tabuleiro de asfalto com calçada de 3 u de cada lado, mureta de concreto e pilares na água. O tabuleiro fica
    // rente ao chão (y 0,22) para o jogador e os carros (física plana) andarem em cima dele sem "afundar".
    _bridges() {
        const h = 0.22, trim = this._batch('xtrim');
        const conc = [0.62, 0.62, 0.6], dark = [0.2, 0.22, 0.26], paint = [0.78, 0.62, 0.18];
        for (const e of RoadPlan.edges) {
            if (e.cls !== 'bridge') continue;
            const hw = e.w / 2, SW = 3;
            const x0 = e.a.x + (e.v ? 0 : e.a.hwNS), x1 = e.b.x - (e.v ? 0 : e.b.hwNS), z0 = e.a.z + (e.v ? e.a.hwEW : 0), z1 = e.b.z - (e.v ? e.b.hwEW : 0);
            if (e.v) continue;                                                            // (as pontes do plano são todas L-O)
            const zm = e.a.z, MAXP = 96, n = Math.max(1, Math.ceil((x1 - x0) / MAXP));
            for (let k = 0; k < n; k++) {
                const a = x0 + (x1 - x0) * k / n, b = x0 + (x1 - x0) * (k + 1) / n;
                this._batch('xroad', a, zm).top(a, zm - hw, b, zm + hw, h, (x, z) => [x / 8, ((zm + hw) - z) / e.w]);                   // pista
                for (const s of [-1, 1]) {
                    const za = s < 0 ? zm - hw - SW : zm + hw, zb = s < 0 ? zm - hw : zm + hw + SW;
                    this._batch('xsidewalk', a, zm).top(a, za, b, zb, h + 0.02, (x, z) => [x / 4, z / 4]);                                  // calçada
                    this._batch('xcurb', a, zm).walls(a, za, b, zb, 0, h + 0.02, () => [0, 0]);
                }
                // Muretas (concreto com faixa amarela no topo) nos dois lados + postes de proteção a cada 12 u.
                for (const s of [-1, 1]) {
                    const zc = zm + s * (hw + SW + 0.2);
                    trim.solid(a, zc - 0.2, b, zc + 0.2, h, h + 1.0, conc);
                    trim.solid(a, zc - 0.21, b, zc + 0.21, h + 0.95, h + 1.02, paint);
                }
            }
            // Pilares (escuros) saindo da água, a cada 40 u: aparecem pela perspectiva sob as bordas do tabuleiro.
            for (let x = x0 + 20; x < x1 - 10; x += 40) {
                for (const s of [-1, 1]) trim.solid(x - 1.2, zm + s * (hw + SW - 1) - 1.2, x + 1.2, zm + s * (hw + SW - 1) + 1.2, -2, h, dark);
            }
            // Colisão: muretas viram sólidos (a pé e de carro).
            for (const s of [-1, 1]) {
                const zc = zm + s * (hw + SW + 0.2);
                const r = { x0, z0: zc - 0.25, x1, z1: zc + 0.25, h: 1.0 };
                CityGrid.addObstacles([r]);
                this._collider(`bridge_${zm}_${s}`, r.x0, r.z0, r.x1, r.z1, 1.2);
            }
        }
    }

    // Postes de semáforo nos 4 cantos de cada cruzamento (as luzes são brilhos do TrafficSignals).
    _signalPoles() {
        const pole = [0.2, 0.21, 0.24], head = [0.12, 0.13, 0.15], box = [0.16, 0.17, 0.2];
        for (const inter of CityGrid.intersections) {
            const trim = this._batch('trim', inter.x, inter.z);
            for (const p of inter.poles) {
                trim.solid(p.x - 0.15, p.z - 0.15, p.x + 0.15, p.z + 0.15, 0, 5.0, pole);                                      // poste
                trim.solid(p.x - p.sx * 0.3 - 0.6, p.z - p.sz * 0.3 - 0.6, p.x - p.sx * 0.3 + 0.6, p.z - p.sz * 0.3 + 0.6, 5.0, 5.3, head);   // cabeçote
                trim.solid(p.x - p.sx * 0.25 - 0.3, p.z - p.sz * 0.25 - 0.3, p.x - p.sx * 0.25 + 0.3, p.z - p.sz * 0.25 + 0.3, 2.3, 2.95, box); // caixa do pedestre
            }
        }
    }

    // ------------------------------------------------------------- quarteirões
    // Arcos de canto de um retângulo arredondado (CCW: SE, NE, NO, SO): { corners: [{ c: centro, pts: [..], K: canto reto, I: canto interno }], ... }
    _roundCorners(x0, z0, x1, z1, r, M = 5) {
        const spec = [[x1 - r, z0 + r, -90, x1, z0], [x1 - r, z1 - r, 0, x1, z1], [x0 + r, z1 - r, 90, x0, z1], [x0 + r, z0 + r, 180, x0, z0]];
        return spec.map(([cx, cz, a, kx, kz]) => {
            const pts = [];
            for (let k = 0; k <= M; k++) { const t = (a + 90 * k / M) * Math.PI / 180; pts.push([cx + r * Math.cos(t), cz + r * Math.sin(t)]); }
            return { c: [cx, cz], pts, K: [kx, kz] };
        });
    }

    _blocks() {
        const h = Config.city.curbHeight, up = [0, 1, 0];
        const uvTile = (tile) => (x, z) => [x / tile, -z / tile];
        const cs = (x, z) => { const s = WorldMap.shadeAt(x, z); return [s, s, s]; };
        const colAt = (shade, x, z) => (shade ? cs(x, z) : [1, 1, 1]);
        const uvT = (p) => [p[0] / 4, -p[1] / 4];

        // Laje com topo texturizado (batch `key`) e meio-fio em volta. shade: tinge pelo relevo (favela, que segue o morro).
        const slab = (key, x0, z0, x1, z1, shade = false) => {
            if (x1 <= x0 + 0.001 || z1 <= z0 + 0.001) return;
            this._batch(shade ? key + '$' : key, x0, z0).top(x0, z0, x1, z1, h, uvTile(4), shade ? [cs(x0, z1), cs(x1, z1), cs(x0, z0), cs(x1, z0)] : undefined);
            this._batch('curb', x0, z0).walls(x0, z0, x1, z1, 0, h, () => [0, 0]);
        };

        // Meio-fio ao longo de uma polilinha fechada (CCW): uma parede por segmento, voltada para fora.
        const curbLoop = (pts, bx, bz) => {
            const cb = this._batch('curb', bx, bz);
            for (let i = 0; i < pts.length; i++) {
                const p = pts[i], q = pts[(i + 1) % pts.length], dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz) || 1, n = [dz / l, 0, -dx / l];
                if (l < 1e-3) continue;
                cb.tri([p[0], 0, p[1]], [q[0], 0, q[1]], [q[0], h, q[1]], n, [[0, 0], [0, 0], [0, 0]]);
                cb.tri([p[0], 0, p[1]], [q[0], h, q[1]], [p[0], h, p[1]], n, [[0, 0], [0, 0], [0, 0]]);
            }
        };

        // Quarteirão com cantos ARREDONDADOS. inner = null: laje inteira (parque, praia...). inner = [fx0,fz0,fx1,fz1]: só o anel
        // de calçada em volta da pegada (a pegada/pátio é desenhada à parte). Preenche com asfalto o que sobra nos cantos.
        const roundBlock = (key, s, inner, r, shade) => {
            const [x0, z0, x1, z1] = s, k = shade ? key + '$' : key, bt = this._batch(k, x0, z0), asph = this._batch('asphalt', x0, z0);
            const C = this._roundCorners(x0, z0, x1, z1, r), loop = [];
            for (const c of C) for (const p of c.pts) loop.push(p);
            const T = (batch, a, b, c, n, y, colFn, yA) => batch.tri([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], n, [uvT(a), uvT(b), uvT(c)], colFn ? colFn(a) : [1, 1, 1]);
            if (!inner) {
                const ctr = [(x0 + x1) / 2, (z0 + z1) / 2];
                for (let i = 0; i < loop.length; i++) T(bt, ctr, loop[i], loop[(i + 1) % loop.length], up, h, shade ? (p) => cs(p[0], p[1]) : null);
            } else {
                const I = [[inner[2], inner[1]], [inner[2], inner[3]], [inner[0], inner[3]], [inner[0], inner[1]]];       // SE, NE, NO, SO
                for (let ci = 0; ci < 4; ci++) {
                    const pts = C[ci].pts, nx = C[(ci + 1) % 4].pts;
                    for (let k2 = 0; k2 + 1 < pts.length; k2++) T(bt, I[ci], pts[k2], pts[k2 + 1], up, h, shade ? (p) => cs(p[0], p[1]) : null);      // leque do canto
                    const os = pts[pts.length - 1], oe = nx[0];                                                                              // faixa lateral
                    T(bt, os, oe, I[(ci + 1) % 4], up, h, shade ? (p) => cs(p[0], p[1]) : null);
                    T(bt, os, I[(ci + 1) % 4], I[ci], up, h, shade ? (p) => cs(p[0], p[1]) : null);
                }
            }
            curbLoop(loop, x0, z0);
            // Asfalto nos cantos (entre o arco e o canto reto): a "curva de meio-fio" do cruzamento.
            for (const c of C) for (let k2 = 0; k2 + 1 < c.pts.length; k2++) T(asph, c.K, c.pts[k2], c.pts[k2 + 1], up, 0.02, null);
        };

        // Calçadas de BORDA: lados de ruas urbanas sem quarteirão (orla do canal, fim da cidade...).
        for (const p of CityGrid.perimeter) slab('sidewalk', p.x0, p.z0, p.x1, p.z1);

        for (const blk of CityGrid.blocks) {
            const [x0, z0, x1, z1] = blk.slab;
            const [fx0, fz0, fx1, fz1] = blk.foot;
            const sh = blk.district === 'favela', r = blk.r || 0;

            if (blk.open) {
                // Parque / mata / praia: tudo andável.
                if (r > 0.5) roundBlock('open_' + blk.ground, blk.slab, null, r, sh); else slab('open_' + blk.ground, x0, z0, x1, z1, sh);
            } else {
                // Calçada = anel em volta da pegada (andável).
                if (r > 0.5) roundBlock('sidewalk', blk.slab, blk.foot, r, sh);
                else { slab('sidewalk', x0, z0, x1, fz0, sh); slab('sidewalk', x0, fz1, x1, z1, sh); slab('sidewalk', x0, fz0, fx0, fz1, sh); slab('sidewalk', fx1, fz0, x1, fz1, sh); }
                // Pátio interno (não andável): um pouco abaixo da calçada.
                this._batch(sh ? 'yard_' + blk.ground + '$' : 'yard_' + blk.ground, fx0, fz0).top(fx0, fz0, fx1, fz1, 0.1, uvTile(4), sh ? [cs(fx0, fz1), cs(fx1, fz1), cs(fx0, fz0), cs(fx1, fz0)] : undefined);
            }
        }
    }

    // ----------------------------------------------------------------- prédios
    _buildings() {
        const hexTrim = [0.73, 0.71, 0.68];
        const hvac = [0.62, 0.65, 0.68];
        const rng = Pixel.rng(2024);

        for (const blk of CityGrid.blocks.concat(CityGrid.extraBlocks || [])) {
            for (const lot of blk.lots) {
                if (lot.safehouse) continue;           // a safe house tem construção própria (world/HouseView.js)
                const { x0, z0, x1, z1, height: H } = lot;
                const so = rng() * 6, ro = rng();     // desloca padrões p/ quebrar repetição.
                const trim = this._batch('trim', x0, z0);

                // Paredes: u = distância/6 (2 baias), v = (H - y)/6 (2 andares).
                this._batch('walls_' + lot.facade, x0, z0).walls(x0, z0, x1, z1, 0, H,
                    (s, y) => [(s + so) / 6, (H - y) / 6]);

                // Telhado: tile de 8u.
                this._batch('roof_' + lot.roof, x0, z0).top(x0, z0, x1, z1, H,
                    (x, z) => [x / 8 + ro, -z / 8 + ro]);

                // Platibanda (parapeito de 0,5u). Na favela: só nas lajes de concreto (e mais baixa); zinco e lona não têm.
                const fav = blk.district === 'favela';
                const t = fav ? 0.3 : 0.45, ph = fav ? 0.35 : 0.5;
                if (!fav || lot.roof.startsWith('slab')) {
                    const pc = fav ? [0.58, 0.55, 0.5] : hexTrim;
                    trim.solid(x0, z0, x1, z0 + t, H, H + ph, pc);
                    trim.solid(x0, z1 - t, x1, z1, H, H + ph, pc);
                    trim.solid(x0, z0 + t, x0 + t, z1 - t, H, H + ph, pc);
                    trim.solid(x1 - t, z0 + t, x1, z1 - t, H, H + ph, pc);
                }

                // Hospital / delegacia: letreiro e emblema pintados no telhado (sem caixas de ar-condicionado).
                if (lot.landmark) { this._landmarkRoof(lot); this._collider(`bld_${blk.i}_${blk.j}_${lot.x0.toFixed(0)}`, x0, z0, x1, z1, H); continue; }

                // Caixas no telhado (casa de máquinas / ar-condicionado): só nos prédios de verdade.
                const w = x1 - x0, d = z1 - z0;
                const n = fav ? 0 : (w * d > 200 ? 2 : 1);
                for (let k = 0; k < n; k++) {
                    const bw = 1.6 + rng() * 2.2, bd = 1.6 + rng() * 2.2, bh = 0.9 + rng() * 1.2;
                    const bx = x0 + 1.5 + rng() * Math.max(0.1, w - 3 - bw);
                    const bz = z0 + 1.5 + rng() * Math.max(0.1, d - 3 - bd);
                    trim.solid(bx, bz, bx + bw, bz + bd, H, H + bh, hvac);
                }

                this._collider(`bld_${blk.i}_${blk.j}_${lot.x0.toFixed(0)}`, x0, z0, x1, z1, H);
            }
        }
    }

    // Vitrines e toldos das lojas (CityGrid._addShops): um quad vertical por loja, com o UV do atlas, e o toldo listrado.
    _shops() {
        const SH = TileFactory.SHOPS, T = this.T.shops, eps = 0.03, y0 = 0.2, y1 = 3.0;
        const awn = [[1, 1, 1], [0.92, 0.9, 0.84]];
        for (const blk of CityGrid.blocks) for (const l of blk.lots) {
            for (const s of l.shops || []) {
                const S = SH[s.kind], u0 = (s.kind % T.cols) / T.cols, v0 = Math.floor(s.kind / T.cols) / T.rows, u1 = u0 + 1 / T.cols, v1 = v0 + 1 / T.rows;
                const uv = [[u0, v0], [u1, v0], [u0, v1], [u1, v1]], a = s.a, b = s.a + 6;
                const batch = this._batch('shop', l.x0, l.z0), trim = this._batch('trim', l.x0, l.z0);
                const c = Pixel.hex(S.sign), col = [c[0] / 255, c[1] / 255, c[2] / 255];
                if (s.side === 'S') { const z = l.z0 - eps; batch.quad([a, y1, z], [b, y1, z], [a, y0, z], [b, y0, z], [0, 0, -1], uv); for (let k = 0; k < 3; k++) trim.solid(a + k * 2, l.z0 - 1.5, a + k * 2 + 2, l.z0, 2.55, 2.8, k % 2 ? awn[0] : col); }
                else if (s.side === 'N') { const z = l.z1 + eps; batch.quad([b, y1, z], [a, y1, z], [b, y0, z], [a, y0, z], [0, 0, 1], uv); for (let k = 0; k < 3; k++) trim.solid(a + k * 2, l.z1, a + k * 2 + 2, l.z1 + 1.5, 2.55, 2.8, k % 2 ? awn[0] : col); }
                else if (s.side === 'W') { const x = l.x0 - eps; batch.quad([x, y1, b], [x, y1, a], [x, y0, b], [x, y0, a], [-1, 0, 0], uv); for (let k = 0; k < 3; k++) trim.solid(l.x0 - 1.5, a + k * 2, l.x0, a + k * 2 + 2, 2.55, 2.8, k % 2 ? awn[0] : col); }
                else { const x = l.x1 + eps; batch.quad([x, y1, a], [x, y1, b], [x, y0, a], [x, y0, b], [1, 0, 0], uv); for (let k = 0; k < 3; k++) trim.solid(l.x1, a + k * 2, l.x1 + 1.5, a + k * 2 + 2, 2.55, 2.8, k % 2 ? awn[0] : col); }
            }
        }
    }

    // Peças soltas do campo (RuralPlan): coberturas e bombas de posto, placas, torres (água, rádio, eólicas) e docas do pântano.
    _rural() {
        const col = (h) => { const c = Pixel.hex(h); return [c[0] / 255, c[1] / 255, c[2] / 255]; };
        const steel = [0.55, 0.58, 0.62], white = [0.92, 0.93, 0.95], red = [0.85, 0.2, 0.18], wood = [0.46, 0.34, 0.21], dark = [0.2, 0.22, 0.25];
        for (const blk of CityGrid.blocks.concat(CityGrid.extraBlocks || [])) {
            for (const c of blk.canopies || []) {
                const t = this._batch('xtrim', c.x0, c.z0);
                for (const [px, pz] of [[c.x0 + 0.6, c.z0 + 0.6], [c.x1 - 0.6, c.z0 + 0.6], [c.x0 + 0.6, c.z1 - 0.6], [c.x1 - 0.6, c.z1 - 0.6]]) t.solid(px - 0.3, pz - 0.3, px + 0.3, pz + 0.3, 0, c.h, white);
                t.solid(c.x0, c.z0, c.x1, c.z1, c.h, c.h + 0.5, c.color);
                t.solid(c.x0, c.z0, c.x1, c.z0 + 0.7, c.h + 0.5, c.h + 0.56, white); t.solid(c.x0, c.z1 - 0.7, c.x1, c.z1, c.h + 0.5, c.h + 0.56, white);        // frisos brancos (a cor do posto aparece no resto)
            }
            for (const d of blk.docks || []) {
                const t = this._batch('trim', d.x0, d.z0);
                t.solid(d.x0, d.z0, d.x1, d.z1, 0.18, 0.3, wood);
                const alongX = (d.x1 - d.x0) > (d.z1 - d.z0);
                for (let s = 2; s < (alongX ? d.x1 - d.x0 : d.z1 - d.z0); s += 3) { const px = alongX ? d.x0 + s : (d.x0 + d.x1) / 2, pz = alongX ? (d.z0 + d.z1) / 2 : d.z0 + s; t.solid(px - 0.2, pz - 0.2, px + 0.2, pz + 0.2, 0, 0.9, dark); }
            }
            for (const w of blk.towers || []) {
                const t = this._batch('trim', w.x, w.z), x = w.x, z = w.z;
                if (w.kind === 'pump') { t.solid(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 0, 1.6, white); t.solid(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 1.1, 1.6, red); }
                else if (w.kind === 'sign') { t.solid(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 0, 8, steel); t.solid(x - 1.8, z - 0.3, x + 1.8, z + 0.3, 6.4, 8.2, red); t.solid(x - 1.5, z - 0.35, x + 1.5, z + 0.35, 7.0, 7.6, white); }
                else if (w.kind === 'water') {                                                       // caixa-d'água elevada: 4 pernas, tanque e tampa
                    for (const [a, b] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) t.solid(x + a - 0.35, z + b - 0.35, x + a + 0.35, z + b + 0.35, 0, 13, steel);
                    t.solid(x - 3, z - 3, x + 3, z + 3, 13, 14, dark); t.solid(x - 3.6, z - 3.6, x + 3.6, z + 3.6, 14, 19, [0.7, 0.75, 0.8]); t.solid(x - 2.4, z - 2.4, x + 2.4, z + 2.4, 19, 20.2, [0.55, 0.6, 0.66]);
                    t.solid(x - 3.7, z - 3.7, x + 3.7, z + 3.7, 16, 16.6, red);
                } else if (w.kind === 'mast') {                                                       // mastro de rádio listrado de branco e vermelho
                    for (let h = 0; h < 40; h += 4) t.solid(x - 0.4, z - 0.4, x + 0.4, z + 0.4, h, h + 4, (h / 4) % 2 ? white : red);
                    t.solid(x - 1.4, z - 1.4, x + 1.4, z + 1.4, 0, 0.8, dark);
                } else if (w.kind === 'turbine') {                                                    // eólica: torre, cabine e pás em cruz
                    t.solid(x - 0.7, z - 0.7, x + 0.7, z + 0.7, 0, 30, white);
                    t.solid(x - 1.2, z - 2.2, x + 1.2, z + 1.8, 30, 32, [0.85, 0.87, 0.9]);
                    t.solid(x - 7, z + 1.8, x + 7, z + 2.2, 31, 31.4, [0.95, 0.95, 0.97]); t.solid(x - 0.2, z + 1.8, x + 0.2, z + 2.2, 24, 38, [0.95, 0.95, 0.97]);
                }
            }
        }
    }

    // A MARINA (src/map/Marina.js): cais de madeira, píeres com cabeços e estacas, paredões de concreto nas pontas e "MARINA" no telhado da sede.
    // Os píeres são sólidos só para a física dos barcos (colliders); a pé dá para andar (MapGeo.onDock).
    _marina() {
        if (typeof Marina === 'undefined' || !Marina.docks) return;
        const wood = [0.52, 0.38, 0.23], woodD = [0.36, 0.26, 0.16], conc = [0.66, 0.66, 0.64], pile = [0.17, 0.15, 0.13], bol = [0.82, 0.78, 0.2], pole = [0.22, 0.23, 0.26], head = [0.9, 0.86, 0.7];
        const Y = 0.32;
        for (const d of Marina.docks) {
            const tr = this._batch('trim', d.x0, d.z0), alongX = (d.x1 - d.x0) >= (d.z1 - d.z0);
            if (d.kind === 'wall') {                                                  // paredão de concreto da ponta (quebra-mar)
                tr.solid(d.x0, d.z0, d.x1, d.z1, -0.3, Y + 0.9, [0.5, 0.52, 0.54]);
                tr.solid(d.x0 - 0.05, d.z0 - 0.05, d.x1 + 0.05, d.z1 + 0.05, Y + 0.82, Y + 0.95, [0.68, 0.69, 0.7]);
                for (let x = d.x0 + 3; x < d.x1; x += 6) tr.solid(x, d.z0 + 0.35, x + 0.5, d.z1 - 0.35, Y + 0.95, Y + 1.0, [0.9, 0.78, 0.2]);                // faixas de sinalização
                this._collider('marina_wall', d.x0, d.z0, d.x1, d.z1, 1.6);
                continue;
            }
            tr.solid(d.x0, d.z0, d.x1, d.z1, -0.3, Y, wood);                          // tabuleiro
            if (alongX) for (let x = d.x0 + 1.2; x < d.x1; x += 1.6) tr.solid(x, d.z0, x + 0.07, d.z1, Y, Y + 0.012, woodD);        // tábuas
            else for (let z = d.z0 + 1.2; z < d.z1; z += 1.6) tr.solid(d.x0, z, d.x1, z + 0.07, Y, Y + 0.012, woodD);
            if (d.kind === 'finger') {
                this._collider('marina_pier', d.x0, d.z0, d.x1, d.z1, 1.0);
                for (let x = d.x0 + 3; x <= d.x1 - 0.5; x += 6) for (const z of [d.z0 + 0.12, d.z1 - 0.12]) tr.solid(x - 0.13, z - 0.13, x + 0.13, z + 0.13, Y, Y + 0.34, bol);     // cabeços
                tr.solid(d.x1 - 0.3, d.z0 - 0.1, d.x1 + 0.1, d.z1 + 0.1, -1.2, Y + 0.7, pile);                                                                       // estaca da ponta
            } else {                                                                  // cais principal: estacas na borda do mar e postes de luz
                for (let z = d.z0 + 2; z < d.z1; z += 6) tr.solid(d.x1 - 0.25, z - 0.2, d.x1 + 0.15, z + 0.2, -1.2, Y + 0.5, pile);
                for (let z = d.z0 + 6; z < d.z1 - 3; z += 16) {
                    const px = d.x0 + 3.5;
                    tr.solid(px - 0.13, z - 0.13, px + 0.13, z + 0.13, Y, 5.4, pole);
                    tr.solid(px - 0.3, z - 0.2, px + 0.5, z + 0.2, 5.25, 5.45, head);
                }
            }
        }
        const lot = Marina.lot;
        if (lot) {
            const cx = (lot.x0 + lot.x1) / 2, cell = 0.5;
            this._roofText('MARINA', cx, lot.z1 - 3.2, lot.height + 0.03, cell, [0.9, 0.93, 0.98]);
            const tr = this._batch('trim', lot.x0, lot.z0);                                      // faixa azul do telhado
            tr.solid(lot.x0 + 1.5, lot.z0 + 3, lot.x1 - 1.5, lot.z0 + 4.6, lot.height + 0.03, lot.height + 0.06, [0.2, 0.45, 0.75]);
        }
    }

    // Letras 5×7 (colunas × linhas) para pintar letreiros no telhado com blocos.
    static get GLYPHS() {
        return {
            M: ['X...X', 'XX.XX', 'X.X.X', 'X.X.X', 'X...X', 'X...X', 'X...X'],
            R: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X.X..', 'X..X.', 'X...X'],
            N: ['X...X', 'XX..X', 'X.X.X', 'X..XX', 'X...X', 'X...X', 'X...X'],
            H: ['X...X', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
            O: ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
            S: ['.XXXX', 'X....', 'X....', '.XXX.', '....X', '....X', 'XXXX.'],
            P: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X....', 'X....', 'X....'],
            I: ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', 'XXXXX'],
            T: ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', '..X..'],
            A: ['.XXX.', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
            L: ['X....', 'X....', 'X....', 'X....', 'X....', 'X....', 'XXXXX'],
            C: ['.XXXX', 'X....', 'X....', 'X....', 'X....', 'X....', '.XXXX'],
        };
    }

    // Pinta `text` no telhado (y), centrado em cx, com a linha de cima em z = zTop (norte), em blocos de `cell` u.
    _roofText(text, cx, zTop, y, cell, color) {
        const trim = this._batch('trim', cx, zTop), G = WorldBuilder.GLYPHS;
        const cols = text.length * 6 - 1, x0 = cx - (cols * cell) / 2;
        let col = 0;
        for (const ch of text) {
            const g = G[ch];
            if (g) for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
                if (g[r][c] !== 'X') continue;
                const x = x0 + (col + c) * cell, z = zTop - r * cell;
                trim.solid(x, z - cell, x + cell, z, y, y + 0.05, color);
            }
            col += 6;
        }
    }

    // Emblema do prédio especial no telhado: hospital = nome + cruz vermelha com heliponto; delegacia = nome + distintivo.
    _landmarkRoof(lot) {
        const trim = this._batch('trim', lot.x0, lot.z0), H = lot.height, y = H + 0.03;
        const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2, w = lot.x1 - lot.x0;
        const hosp = lot.landmark === 'hospital';
        const text = hosp ? 'HOSPITAL' : 'POLICIA';
        const cells = text.length * 6 - 1, cell = Math.min(0.46, (w - 4) / cells);
        const textTop = lot.z1 - 2.2;
        if (hosp) {
            const red = [0.82, 0.12, 0.14], white = [0.96, 0.97, 0.98];
            this._roofText(text, cx, textTop, y, cell, [0.78, 0.1, 0.12]);
            const my = cz - 1.6, s = 3.4;                                    // cruz grande
            trim.solid(cx - 4.3, my - 4.3, cx + 4.3, my + 4.3, y, y + 0.04, white);
            trim.solid(cx - s / 2 * 0.62, my - s, cx + s / 2 * 0.62, my + s, y + 0.04, y + 0.08, red);
            trim.solid(cx - s, my - s / 2 * 0.62, cx + s, my + s / 2 * 0.62, y + 0.04, y + 0.08, red);
        } else {
            const navy = [0.1, 0.16, 0.34], gold = [0.9, 0.74, 0.25], white = [0.95, 0.96, 0.98];
            this._roofText(text, cx, textTop, y, cell, white);
            const my = cz - 1.6;                                              // distintivo: ouro, miolo azul e estrela
            trim.solid(cx - 3.8, my - 3.8, cx + 3.8, my + 3.8, y, y + 0.04, gold);
            trim.solid(cx - 3.0, my - 3.0, cx + 3.0, my + 3.0, y + 0.04, y + 0.08, navy);
            trim.solid(cx - 0.55, my - 2.4, cx + 0.55, my + 2.4, y + 0.08, y + 0.12, gold);
            trim.solid(cx - 2.4, my - 0.55, cx + 2.4, my + 0.55, y + 0.08, y + 0.12, gold);
            trim.solid(cx - 1.6, my - 1.6, cx + 1.6, my + 1.6, y + 0.08, y + 0.1, gold);
            trim.solid(cx - 1.1, my - 1.1, cx + 1.1, my + 1.1, y + 0.1, y + 0.14, navy);
        }
    }

    // Quad de sprite achatado (visto de cima) com o frame `idx` do atlas de props.
    // Plantas que balançam usam os atlas animados (UV do quadro 0; o shader soma o deslocamento do quadro) e levam uma fase própria no alfa da cor.
    _spriteQuad(batch, idx, row, x, z, size, y) {
        const sway = PropSprites.SWAY[PropSprites.FRAMES[idx].kind] || 0;
        const [u0, v0, u1, v1] = (sway && this.props.animRect(idx)) || this.props.rect(idx);
        const h = size / 2, s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453, phase = s - Math.floor(s);
        batch.quad([x - h, y, z + h], [x + h, y, z + h], [x - h, y, z - h], [x + h, y, z - h], [0, 1, 0],
            [[u0, v0], [u1, v0], [u0, v1], [u1, v1]], [row, 1, sway, phase]);
    }

    // Postes de iluminação ao longo das calçadas (2 por trecho de rua e por lado, alternados).
    // A lâmpada acende à noite: brilho no cabeçote + poça de luz no chão (GlowBatch).
    _streetLamps() {
        const pole = [0.22, 0.23, 0.26], head = [0.9, 0.86, 0.7];
        const lamps = [];           // { hx, hz } posição do cabeçote
        const add = (px, pz, tx, tz) => {                       // (px,pz) = pé do poste; (tx,tz) = direção p/ a rua
            const hx = px + tx * 1.8, hz = pz + tz * 1.8;
            lamps.push({ x: px, z: pz, hx, hz, alive: true });      // a geometria (poste, braço e cabeçote) é montada por StreetProps: postes quebram
        };

        // Em cada trecho urbano: 2 lâmpadas por lado, alternadas (14 e 26 u de um lado; 20 e 32 u do outro) a partir do cruzamento
        // de origem, repetindo a cada 12 u nos trechos longos. Vias rurais e vielas não têm poste de rua.
        for (const e of RoadPlan.edges) {
            if (e.cls !== 'city' && e.cls !== 'isl' && e.cls !== 'bridge' && e.cls !== 'ave') continue;
            const hw = e.w / 2 + 0.9, L = e.len;
            if (e.v) {
                for (let s = 14; s <= L - 8; s += 12) add(e.a.x + hw, e.a.z + s, -1, 0);        // lado leste, aponta p/ oeste
                for (let s = 20; s <= L - 8; s += 12) add(e.a.x - hw, e.a.z + s, 1, 0);         // lado oeste, aponta p/ leste
            } else {
                for (let s = 14; s <= L - 8; s += 12) add(e.a.x + s, e.a.z + hw, 0, -1);        // lado norte
                for (let s = 20; s <= L - 8; s += 12) add(e.a.x + s, e.a.z - hw, 0, 1);         // lado sul
            }
        }

        this.perches = lamps.map((l) => ({ x: l.hx, z: l.hz, y: 5.75 }));          // poleiros das aves (Birds)

        // Brilhos: cabeçote (alto) + poça no chão, por poste.
        this.lampGlow = new GlowBatch(this.scene, lamps.length * 2, 'lampGlow', 'glow');
        this._lampIds = lamps.map((l) => {
            const a = this.lampGlow.alloc(), b = this.lampGlow.alloc();
            this.lampGlow.place(a, l.hx, 5.75, l.hz, 2.6);
            this.lampGlow.place(b, l.hx, 0.24, l.hz, 14);
            l.glow = [a, b];
            return [a, b];
        });
        this.lampGlow.flush();
        this.street = new StreetProps(this, lamps);
        this.street.placeHydrants();
    }

    // Vento atual (0..~1,3) que balança a vegetação: brisa leve por padrão; sobe com a chuva e dispara na tempestade (rajadas).
    // Modo de sprites do vento: 0 leve (tempo bom) | 1 forte (garoa e chuva forte) | 2 intenso (tempestade). Com histerese para não piscar.
    windMode() {
        const k = typeof Weather !== 'undefined' && Weather.cur ? Weather.cur.k : 0;
        let m = this._windMode || 0;
        if (m === 0 && k > 0.22) m = 1;
        else if (m === 1 && k < 0.16) m = 0;
        if (m === 1 && k > 0.86) m = 2;
        else if (m === 2 && k < 0.8) m = 1;
        return (this._windMode = m);
    }

    windStrength() {
        const k = typeof Weather !== 'undefined' && Weather.cur ? Weather.cur.k : 0, t = this._windTime || 0;
        return Math.min(1.3, 0.1 + 0.95 * k + 0.18 * k * Math.sin(t * 0.9) + 0.04 * Math.sin(t * 0.37));
    }

    // FAVELA: postes de madeira com 'gato' (ligação clandestina): fiação embolada, fios cruzando a viela, caixas de emenda,
    // transformador remendado e luz fraca que pisca (algumas lâmpadas já queimaram). Mais lixo e entulho nas bordas das ruas de terra.
    _favelaPoles() {
        const rng = Pixel.rng(4242);
        const poles = [];                                              // { x, z, arm: 'x'|'z' }
        const trashKinds = ['trash', 'trash', 'trash', 'debris', 'stain'];
        const dirt = (x, z, s = 0.8 + rng() * 0.5) => {                // sujeira num ponto (sprite baixo, sem balanço)
            const kind = trashKinds[Math.floor(rng() * trashKinds.length)], fr = this.props.pick(kind, rng());
            this._spriteQuad(this._batch('veg_lo', x, z), fr.index, fr.row, x, z, (PropSprites.FRAME / Config.art.ppu) * s, PropSprites.HEIGHT[kind], 0);
        };

        // Postes ao longo das ruas de terra da favela (alternando os lados) e sujeira nas bordas.
        for (const e of RoadPlan.edges) {
            if (e.cls !== 'fav') continue;
            const hw = e.w / 2 + 0.7, L = e.len;
            let side = rng() < 0.5 ? 1 : -1;
            for (let s = 6 + rng() * 6; s < L - 4; s += 15 + rng() * 9) {
                const px = e.v ? e.a.x + side * hw : e.a.x + s, pz = e.v ? e.a.z + s : e.a.z + side * hw;
                poles.push({ x: px, z: pz, arm: e.v ? 'x' : 'z', dir: -side });
                side = -side;
            }
            for (let s = 3 + rng() * 5; s < L - 2; s += 7 + rng() * 9) {
                if (rng() < 0.5) continue;
                const sd = rng() < 0.5 ? 1 : -1, off = hw + 0.5 + rng() * 0.8;
                dirt(e.v ? e.a.x + sd * off : e.a.x + s, e.v ? e.a.z + s : e.a.z + sd * off);
            }
        }
        // Postes dentro dos quarteirões da favela (vielas): dados vindos de CityGrid (props type 'pole').
        for (const blk of CityGrid.blocks) {
            if (blk.biome !== 'favela') continue;
            for (const p of blk.props) if (p.type === 'pole') poles.push({ x: p.x, z: p.z, arm: rng() < 0.5 ? 'x' : 'z', dir: rng() < 0.5 ? 1 : -1 });
        }

        const WOOD = [0.3, 0.2, 0.12], WOOD2 = [0.24, 0.16, 0.1];
        const WIRE = [[0.05, 0.05, 0.06], [0.08, 0.08, 0.09], [0.16, 0.16, 0.18], [0.5, 0.1, 0.09], [0.12, 0.2, 0.45], [0.75, 0.74, 0.68]];
        const wire = (x0, z0, x1, z1, y, c) => {                       // fio fino alinhado a um eixo, com barriga (3 trechos) no meio
            const trim = this._batch('trim', x0, z0), t = 0.03;
            if (Math.abs(x1 - x0) < 0.01 && Math.abs(z1 - z0) < 0.01) return;
            const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 5));
            for (let i = 0; i < n; i++) {
                const a = i / n, b = (i + 1) / n, mid = 1 - Math.abs((a + b) - 1);        // 0 nas pontas, 1 no centro
                const xa = x0 + (x1 - x0) * a, xb = x0 + (x1 - x0) * b, za = z0 + (z1 - z0) * a, zb = z0 + (z1 - z0) * b;
                const yy = y - 0.5 * mid * Math.min(1, Math.hypot(x1 - x0, z1 - z0) / 12);
                trim.solid(Math.min(xa, xb) - t, Math.min(za, zb) - t, Math.max(xa, xb) + t, Math.max(za, zb) + t, yy, yy + 0.05, c);
            }
        };

        this._favLamps = [];
        this.perches = this.perches || [];
        for (const p of poles) {
            this.perches.push({ x: p.x, z: p.z, y: 6.1 });
            const trim = this._batch('trim', p.x, p.z), ax = p.arm === 'x';
            // Poste de madeira torto (dois troncos emendados), travessa e remendos.
            trim.solid(p.x - 0.15, p.z - 0.15, p.x + 0.15, p.z + 0.15, 0, 6.0, WOOD);
            trim.solid(p.x - 0.12, p.z - 0.12, p.x + 0.18, p.z + 0.18, 3.0, 3.6, WOOD2);
            trim.solid(ax ? p.x - 1.1 : p.x - 0.1, ax ? p.z - 0.1 : p.z - 1.1, ax ? p.x + 1.1 : p.x + 0.1, ax ? p.z + 0.1 : p.z + 1.1, 5.5, 5.65, WOOD2);
            // Gato: emboladão de fios no topo (cada fio com cor/altura/eixo/comprimento diferentes) + caixas de emenda + laços pendurados.
            const n = 7 + Math.floor(rng() * 5);
            for (let k = 0; k < n; k++) {
                const len = 0.8 + rng() * 2.4, y = 4.5 + rng() * 1.1, c = WIRE[Math.floor(rng() * WIRE.length)];
                const o = (rng() - 0.5) * 0.7, along = rng() < 0.5;
                const x0 = p.x + (along ? -len * rng() : o), z0 = p.z + (along ? o : -len * rng());
                trim.solid(x0, z0, x0 + (along ? len : 0.05), z0 + (along ? 0.05 : len), y, y + 0.05, c);
            }
            for (let k = 0; k < 3; k++) {
                const bx = p.x + (rng() - 0.5) * 1.1, bz = p.z + (rng() - 0.5) * 1.1, y = 4.6 + rng() * 0.8;
                trim.solid(bx - 0.14, bz - 0.12, bx + 0.14, bz + 0.12, y, y + 0.26, k === 0 ? [0.55, 0.52, 0.45] : [0.12, 0.12, 0.14]);
            }
            for (let k = 0; k < 2; k++) {
                const lx = p.x + (rng() - 0.5) * 1.6, lz = p.z + (rng() - 0.5) * 1.6;
                trim.solid(lx - 0.02, lz - 0.02, lx + 0.02, lz + 0.02, 3.9 + rng() * 0.5, 5.1, WIRE[Math.floor(rng() * 3)]);
            }
            if (rng() < 0.4) trim.solid(p.x + 0.3, p.z - 0.3, p.x + 1.0, p.z + 0.4, 4.9, 5.7, [0.34, 0.38, 0.34]);        // transformador remendado
            // Lâmpada fraca presa na travessa: tipo 0 = fraca e estável, 1 = pisca, 2 = quase morta, 3 = queimada.
            if (rng() < 0.7) {
                const hx = p.x + (ax ? p.dir : 0) * 1.0, hz = p.z + (ax ? 0 : p.dir) * 1.0;
                trim.solid(hx - 0.18, hz - 0.18, hx + 0.18, hz + 0.18, 5.15, 5.5, [0.7, 0.68, 0.55]);
                const r = rng(), type = r < 0.28 ? 0 : (r < 0.62 ? 1 : (r < 0.82 ? 2 : 3));
                this._favLamps.push({ x: hx, z: hz, type, ph: rng() * 6.28, timer: rng() * 2, on: rng() < 0.6 });
            }
        }
        // Fios ligando cada poste ao mais próximo (em "L": um trecho ao longo de X e outro ao longo de Z), em duas alturas — cruzam as vielas.
        for (let i = 0; i < poles.length; i++) {
            const a = poles[i];
            const near = [];
            for (let j = 0; j < poles.length; j++) {
                if (j === i) continue;
                const d = Math.hypot(poles[j].x - a.x, poles[j].z - a.z);
                if (d < 34) near.push([d, j]);
            }
            near.sort((u, v) => u[0] - v[0]);
            for (const [, j] of near.slice(0, 2)) {
                if (j < i && near.length > 1 && rng() < 0.5) continue;                 // evita dobrar tudo
                const b = poles[j];
                for (let k = 0; k < 2; k++) {
                    const y = 5.45 - k * 0.3 - rng() * 0.15, c = WIRE[Math.floor(rng() * 4)], jx = (rng() - 0.5) * 0.4, jz = (rng() - 0.5) * 0.4;
                    wire(a.x + jx, a.z + jz, b.x + jx, a.z + jz, y, c);
                    wire(b.x + jx, a.z + jz, b.x + jx, b.z + jz, y - 0.05, c);
                }
            }
        }

        // Luz precária: 2 brilhos por lâmpada (cabeça pequena + poça fraca no chão), amarelo-esverdeado doente.
        this.favGlow = new GlowBatch(this.scene, Math.max(1, this._favLamps.length * 2), 'favGlow', 'glow');
        this._favLamps.forEach((l) => {
            l.a = this.favGlow.alloc(); l.b = this.favGlow.alloc();
            this.favGlow.place(l.a, l.x, 5.5, l.z, 1.8);
            this.favGlow.place(l.b, l.x, 0.24, l.z, 9);
        });
        this.favGlow.flush();
        this._favT = 0;
    }

    // Pisca-pisca da iluminação da favela (só à noite).
    _favFlicker(dt) {
        const g = this.favGlow, list = this._favLamps;
        if (!g || !list || !list.length) return;
        const q = this._lampLevel || 0;
        if (q <= 0) {
            if (this._favOn) { for (const l of list) { g.off(l.a); g.off(l.b); } g.flush(); this._favOn = false; }
            return;
        }
        this._favOn = true;
        this._favT += dt;
        for (const l of list) {
            let f = 0;
            if (l.type === 0) f = 0.6 + 0.1 * Math.sin(this._favT * 3.1 + l.ph) + 0.05 * Math.sin(this._favT * 11 + l.ph);
            else if (l.type === 1) {
                l.timer -= dt;
                if (l.timer <= 0) { l.on = Math.random() < 0.65; l.timer = l.on ? 0.3 + Math.random() * 2.2 : 0.04 + Math.random() * 0.2; }
                f = l.on ? 0.7 : 0;
            } else if (l.type === 2) {
                l.timer -= dt;
                if (l.timer <= 0) { l.on = Math.random() < 0.22; l.timer = l.on ? 0.05 + Math.random() * 0.15 : 0.6 + Math.random() * 3.5; }
                f = l.on ? 0.9 : 0.04;
            }
            const a = f * q;
            if (a <= 0.01) { g.off(l.a); g.off(l.b); continue; }
            g.color(l.a, 0.95, 0.88, 0.5, 0.75 * a);
            g.color(l.b, 0.9, 0.8, 0.4, 0.3 * a);
        }
        g.flush();
    }

    // Brilho das lojas à noite: uma poça de luz colorida (cor do letreiro) na calçada em frente a cada loja.
    _shopGlow() {
        const list = [];
        for (const blk of CityGrid.blocks) for (const l of blk.lots) for (const s of l.shops || []) {
            const c = Pixel.hex(TileFactory.SHOPS[s.kind].sign), m = s.a + 3, o = 2.6;
            list.push({ x: s.side === 'W' ? l.x0 - o : (s.side === 'E' ? l.x1 + o : m), z: s.side === 'S' ? l.z0 - o : (s.side === 'N' ? l.z1 + o : m), c: [c[0] / 255, c[1] / 255, c[2] / 255] });
        }
        this.shopGlow = new GlowBatch(this.scene, Math.max(1, list.length), 'shopGlow', 'glow');
        this._shopIds = list.map((s) => { const i = this.shopGlow.alloc(); this.shopGlow.place(i, s.x, 0.26, s.z, 9); s.id = i; return s; });
        this.shopGlow.flush();
    }

    // Helipontos: laje de concreto com um H amarelo, onde os helicópteros civis ficam estacionados (ver Chopper / Game._spawnChoppers).
    // Um fica no pátio livre mais perto do ponto de partida; os outros em parques, na orla e no porto. Limpa as árvores/props em cima da laje.
    _helipads() {
        const c = CityGrid.center(), pads = [], H = 7;
        const freeSquare = (b) => {                                                         // quadrado de 2H×2H sem lotes (prédios) nem contêineres
            const [x0, z0, x1, z1] = b.foot, R = H + 1.6;
            for (let z = z0 + R; z <= z1 - R; z += 3) for (let x = x0 + R; x <= x1 - R; x += 3) {
                let ok = true;
                for (const l of b.lots) if (x + R > l.x0 && x - R < l.x1 && z + R > l.z0 && z - R < l.z1) { ok = false; break; }
                if (ok) for (const p of b.props) if (p.type === 'container' && Math.abs(p.x - x) < R + p.w / 2 && Math.abs(p.z - z) < R + p.d / 2) { ok = false; break; }
                if (ok) return [x, z];
            }
            return null;
        };
        const spot = (b) => (b._pad !== undefined ? b._pad : (b._pad = (b.foot[2] - b.foot[0] >= 24 && b.foot[3] - b.foot[1] >= 24 && b.biome !== 'downtown') ? (b.open ? [(b.foot[0] + b.foot[2]) / 2, (b.foot[1] + b.foot[3]) / 2] : freeSquare(b)) : null));
        const near = (list, x, z) => list.filter((b) => spot(b)).sort((a, b) => Math.hypot(spot(a)[0] - x, spot(a)[1] - z) - Math.hypot(spot(b)[0] - x, spot(b)[1] - z));
        const all = CityGrid.blocks, chosen = [];
        const take = (b) => { if (b && !chosen.includes(b) && chosen.every((o) => Math.hypot(spot(o)[0] - spot(b)[0], spot(o)[1] - spot(b)[1]) > 60)) chosen.push(b); };
        take(near(all, c.x, c.z)[0]);                                                       // o do ponto de partida
        const parks = all.filter((b) => b.biome === 'park');
        take(near(parks, c.x, c.z)[0]);
        take(near(parks, -470, 500)[0]);
        take(near(all.filter((b) => b.biome === 'port'), c.x, c.z)[0]);
        take(near(all.filter((b) => b.biome === 'beach' || b.biome === 'resort'), 610, 0)[0]);
        const slab = [0.46, 0.48, 0.5], yel = [0.95, 0.8, 0.15];
        for (const b of chosen) {
            const [cx, cz] = spot(b);
            b.props = b.props.filter((p) => !(Math.abs(p.x - cx) < H + 3 && Math.abs(p.z - cz) < H + 3));
            const t = this._batch('trim', cx, cz);
            t.solid(cx - H, cz - H, cx + H, cz + H, 0.05, 0.27, slab);
            const w = 0.35, e = H - 0.9;                                                   // anel amarelo
            t.solid(cx - e, cz - e, cx + e, cz - e + w, 0.27, 0.3, yel); t.solid(cx - e, cz + e - w, cx + e, cz + e, 0.27, 0.3, yel);
            t.solid(cx - e, cz - e, cx - e + w, cz + e, 0.27, 0.3, yel); t.solid(cx + e - w, cz - e, cx + e, cz + e, 0.27, 0.3, yel);
            t.solid(cx - 2.6, cz - 3.2, cx - 1.8, cz + 3.2, 0.27, 0.3, yel);               // o "H"
            t.solid(cx + 1.8, cz - 3.2, cx + 2.6, cz + 3.2, 0.27, 0.3, yel);
            t.solid(cx - 1.8, cz - 0.4, cx + 1.8, cz + 0.4, 0.27, 0.3, yel);
            pads.push({ x: cx, z: cz, heading: ((pads.length * 1.7) % 6.28) });
        }
        CityGrid.helipads = pads;
        console.log(`[HELIPONTOS] ${pads.length} helipontos`);
    }

    // Contêineres e vegetação vindos de CityGrid.blocks[].props.
    _props() {
        const trimAt = (x, z) => this._batch('trim', x, z), hideAt = (x, z) => this._batch('hide_top', x, z);
        const rng = Pixel.rng(77);
        const base = PropSprites.FRAME / Config.art.ppu;

        const SIDE = { dumpster: [0.16, 0.32, 0.21], crate_big: [0.5, 0.33, 0.16], crate: [0.5, 0.33, 0.16], barrel: [0.32, 0.35, 0.4] };
        const fenceC = [0.52, 0.56, 0.6], postC = [0.28, 0.3, 0.34], wallC = [0.74, 0.71, 0.66], capC = [0.86, 0.84, 0.8];

        // Grades e muros dos quintais: grade = tela fina com mourões; muro = concreto com capa clara.
        for (const blk of CityGrid.blocks.concat(CityGrid.extraBlocks || [])) {
            for (const f of blk.fences || []) {
                const trim = trimAt(f.x0, f.z0);
                if (f.kind === 'wall') {
                    trim.solid(f.x0, f.z0, f.x1, f.z1, 0.18, f.h - 0.12, wallC);
                    trim.solid(f.x0 - 0.04, f.z0 - 0.04, f.x1 + 0.04, f.z1 + 0.04, f.h - 0.12, f.h, capC);
                } else {
                    trim.solid(f.x0, f.z0, f.x1, f.z1, 0.18, f.h, fenceC);
                    const alongX = (f.x1 - f.x0) >= (f.z1 - f.z0), len = alongX ? f.x1 - f.x0 : f.z1 - f.z0;
                    for (let s = 0; s <= len + 0.01; s += 1.6) {
                        const px = alongX ? f.x0 + s : (f.x0 + f.x1) / 2, pz = alongX ? (f.z0 + f.z1) / 2 : f.z0 + s;
                        trim.solid(px - 0.14, pz - 0.14, px + 0.14, pz + 0.14, 0.18, f.h + 0.25, postC);
                    }
                }
            }
        }

        for (const props of CityGrid.blocks.concat(CityGrid.extraBlocks || []).map((b) => b.props).concat([CityGrid.coastProps])) {
            for (const p of props) {
                if (p.type === 'hide') {
                    const x0 = p.x - p.w / 2, x1 = p.x + p.w / 2, z0 = p.z - p.d / 2, z1 = p.z + p.d / 2;
                    trimAt(x0, z0).walls(x0, z0, x1, z1, 0.18, p.h, () => [0, 0], SIDE[p.kind]);
                    const [u0, v0, u1, v1] = HideSprites.rects[p.kind];
                    hideAt(x0, z0).top(x0, z0, x1, z1, p.h + 0.01, (x, z) => [u0 + ((x - x0) / (x1 - x0)) * (u1 - u0), v0 + ((z1 - z) / (z1 - z0)) * (v1 - v0)]);
                    continue;
                }
                if (p.type === 'tree' || p.type === 'prop') {
                    const fr = this.props.pick(p.kind, rng());
                    const high = PropSprites.HEIGHT[p.kind] > 2;
                    this._spriteQuad(this._batch(high ? 'veg_hi' : 'veg_lo', p.x, p.z), fr.index, fr.row, p.x, p.z, base * p.s, PropSprites.HEIGHT[p.kind], PropSprites.SWAY[p.kind] || 0);
                    continue;
                }
                if (p.type !== 'container') continue;
                const c = BABYLON.Color3.FromHexString(p.color);
                const col = [c.r, c.g, c.b], trim = trimAt(p.x, p.z);
                const x0 = p.x - p.w / 2, z0 = p.z - p.d / 2;
                trim.solid(x0, z0, x0 + p.w, z0 + p.d, 0.18, 0.18 + p.h, col);
                // Nervuras escuras no topo (leitura de "contêiner").
                const dark = [c.r * 0.55, c.g * 0.55, c.b * 0.55];
                const alongX = p.w > p.d;
                const n = 5;
                for (let k = 1; k < n; k++) {
                    const f = k / n;
                    if (alongX) trim.solid(x0 + p.w * f - 0.07, z0 + 0.1, x0 + p.w * f + 0.07, z0 + p.d - 0.1, 0.18 + p.h, 0.18 + p.h + 0.04, dark);
                    else trim.solid(x0 + 0.1, z0 + p.d * f - 0.07, x0 + p.d - 0.1, z0 + p.d * f + 0.07, 0.18 + p.h, 0.18 + p.h + 0.04, dark);
                }
                this._collider(`cnt_${p.x.toFixed(0)}_${p.z.toFixed(0)}`, x0, z0, x0 + p.w, z0 + p.d, p.h);
            }
        }
    }

    // Colisor só para a física: TransformNode (sem malha) não pesa na avaliação de
    // malhas ativas a cada frame, ao contrário de ~300 caixas invisíveis.
    _collider(name, x0, z0, x1, z1, h, mask = 0) {
        const node = new BABYLON.TransformNode(name, this.scene);
        node.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
        this.colliders.push({ node, size: new BABYLON.Vector3(x1 - x0, h, z1 - z0), mask });
    }

    // ---------------------------------------------------------- malhas finais
    _flush() {
        const M = this.mats;
        const matFor = (key) => {
            if (key === 'veg_hi') return this.props.hiMaterial;
            if (key === 'veg_lo') return this.props.loMaterial;
            if (key === 'shore') return M.shore;
            if (key === 'road') return M.road;
            if (key === 'xroad') return M.xroad;
            if (key === 'xsidewalk') return M.xsidewalk;
            if (key === 'xcurb') return M.xcurb;
            if (key === 'xtrim') return M.xsolid;
            if (key === 'shop') return M.shop;
            if (key === 'road_dirt') return M.dirt;
            if (key === 'road_earth') return M.earth;
            if (key === 'asphalt') return M.asphalt;
            if (key === 'zebra') return M.zebra;
            if (key === 'sidewalk') return M.sidewalk;
            if (key === 'curb') return M.curb;
            if (key === 'trim') return M.solid;
            if (key === 'hide_top') return M.hide;
            if (key.startsWith('open_') || key.startsWith('yard_')) return M[key.slice(key.indexOf('_') + 1)];
            if (key.startsWith('walls_')) return M.facades[key.slice(6)];
            if (key.startsWith('roof_')) return M.roofs[key.slice(5)];
            throw new Error('batch sem material: ' + key);
        };

        // Sombras: as malhas por material NÃO projetam sombra (seriam dezenas de draws no mapa de sombra). Em vez disso, cada
        // pedaço ganha UMA malha "fantasma" (só posições, material sem cor nem profundidade) com a geometria de todos os
        // casters dele: 1 draw por pedaço no mapa de sombra.
        const proxies = new Map();
        for (const full of Object.keys(this.batches)) {
            const batch = this.batches[full];
            if (batch.empty) continue;
            const at = full.indexOf('@'), key0 = at < 0 ? full : full.slice(0, at);       // 'walls_brick0@1,-2' -> 'walls_brick0'
            const shaded = key0.endsWith('$'), key = shaded ? key0.slice(0, -1) : key0;      // 'sidewalk$' = chão tingido pelo relevo (vertex colors)
            const isTrim = key === 'trim' || key === 'xtrim';
            const isVeg = key.startsWith('veg_');
            const mesh = batch.build('world_' + full, this.scene, matFor(key), { vertexColors: isTrim || isVeg || shaded, receiveShadows: !isVeg, alwaysActive: at < 0 });
            this.meshes.push(mesh);
            if (key === 'veg_hi') { mesh.renderingGroupId = 1; mesh.alphaIndex = -1; }      // copas: desenham DEPOIS de pedestres, carros e sprites do chao (que nao escrevem profundidade), sempre por cima
            if (key0.startsWith('x') || key0.startsWith('open_x')) { mesh.renderingGroupId = 1; mesh.alphaIndex = 10; }      // estruturas com furo macio: desenham DEPOIS dos sprites (e dos brilhos), com profundidade

            const caster = key.startsWith('walls_') || key.startsWith('roof_') || isTrim || key === 'hide_top';
            if (!caster || !this.shadow) continue;
            const pk = at < 0 ? '' : full.slice(at);
            let px = proxies.get(pk);
            if (!px) proxies.set(pk, px = { pos: [], idx: [] });
            const base = px.pos.length / 3;
            for (let i = 0; i < batch.pos.length; i++) px.pos.push(batch.pos[i]);
            for (let i = 0; i < batch.idx.length; i++) px.idx.push(batch.idx[i] + base);
        }
        if (this.shadow) {
            if (!this._ghost) { this._ghost = new BABYLON.StandardMaterial('shadowGhost', this.scene); this._ghost.disableColorWrite = true; this._ghost.disableDepthWrite = true; }
            for (const [pk, px] of proxies) {
                const m = new BABYLON.Mesh('shadow' + pk, this.scene), vd = new BABYLON.VertexData();
                vd.positions = new Float32Array(px.pos); vd.indices = px.pos.length / 3 > 65535 ? new Uint32Array(px.idx) : new Uint16Array(px.idx);      // (tipados: metade da memória)
                vd.applyToMesh(m);
                m.material = this._ghost; m.isPickable = false; m.receiveShadows = false; m.alwaysSelectAsActiveMesh = false;
                m.freezeWorldMatrix();
                this.shadow.addShadowCaster(m);
                this.meshes.push(m);
            }
        }
    }

    // ------------------------------------------------------------------ runtime
    // Anima a água (troca de frame + deriva lenta) e acende/apaga as janelas.
    // Alvo da câmera (jogador ou veículo) a proteger: raio do círculo de visibilidade e altura do sprite dele.
    // Vale para as copas (fade) e para tudo que está acima do alvo (viaduto, ponte, túnel, cobertura): ver RevealPlugin.
    setReveal(x, z, r, y) {
        Reveal.set(x, z, r, y);
        this._revealR = r;
    }

    update(dt, focus) {
        this._windTime = (this._windTime || 0) + dt;
        this.props.setWind(this._windTime, this.windMode());
        this._favFlicker(dt);
        if (focus) this.props.setFocus(focus.x, focus.z, this._revealR);   // fade das copas sobre o jogador.
        if (focus && this.terrain && !Interiors.active) this.terrain.update(dt, focus);
        this._waterTime += dt;
        const frame = Math.floor(this._waterTime * 3) % 4;
        if (frame !== this._waterFrame) {
            this._waterFrame = frame;
            this.mats.water.diffuseTexture = this.T.water[frame];
        }
        const off = this._waterTime * 0.012;
        for (const t of this.T.water) { t.uOffset = off; t.vOffset = off * 0.6; }
    }

    // 0 = dia, 1 = noite: liga as janelas (mapa emissivo) e os postes de rua.
    setNight(f) {
        for (const k of Object.keys(this.mats.facades)) this.mats.facades[k].emissiveTexture.level = f;
        this.mats.shop.emissiveTexture.level = f;
        const on = Math.max(0, (f - 0.25) / 0.6);              // postes acendem no começo da noite
        const q = Math.round(Math.min(1, on) * 30) / 30;       // degraus: evita reenviar o buffer toda hora
        if (q === this._lampLevel) return;
        this._lampLevel = q;
        const g = this.lampGlow;
        for (let li = 0; li < this._lampIds.length; li++) {
            const [a, b] = this._lampIds[li];
            if (this.street && !this.street.lamps[li].alive) { g.off(a); g.off(b); continue; }          // poste quebrado: luz apagada
            if (q > 0) { g.color(a, 1.0, 0.86, 0.55, 0.9 * q); g.color(b, 1.0, 0.78, 0.42, 0.45 * q); }
            else { g.off(a); g.off(b); }
        }
        g.flush();
        const sg = this.shopGlow;                                // lojas: poças coloridas na calçada
        for (const s of this._shopIds) { if (q > 0) sg.color(s.id, s.c[0], s.c[1], s.c[2], 0.42 * q); else sg.off(s.id); }
        sg.flush();
    }
}
