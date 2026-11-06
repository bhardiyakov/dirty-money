// ============================================================================
// Speedway — o AUTÓDROMO (referência: a folha de arquibancadas, pista e boxes): um circuito misto no campo a oeste (no pé do Corcovado),
// palco das corridas de estádio do StreetRacing. O traçado é um polígono de controle com as curvas arredondadas (POLY: [v, u, raio]):
// reta dos boxes (leste, subindo), o S do miolo, o grampo e a reta oposta; sentido anti-horário visto de cima (como o oval antigo).
//   • PISTA: asfalto com borracha nas tangências e marcas de freada, faixas brancas, ZEBRAS verde-amarelas (internas e de saída) nas
//     curvas, caixas de BRITA e BARREIRAS DE PNEUS por fora das curvas, MURO de concreto com as placas de patrocínio e o ALAMBRADO
//     (tela de proteção) nas retas; grid de largada pintado, a linha quadriculada e o PÓRTICO de treliça com o semáforo e os painéis;
//   • BOXES: pit lane com a entrada e a saída (linhas vermelhas e amarelas, placas), o muro dos boxes, o PRÉDIO DAS GARAGENS (portas
//     abertas com o carro, ferramentas e pneus; o andar de vidro em cima), a TORRE DE CONTROLE com bandeiras e o PÓDIO, a ÁREA VIP com
//     tendas;
//   • PÚBLICO: ARQUIBANCADA PRINCIPAL descoberta (no miolo, de frente para a reta), ARQUIBANCADA COBERTA com a cobertura metálica
//     curva, PASSARELA de pedestres sobre a pista, POSTOS DOS FISCAIS (com as bandeiras) por fora das curvas, torres de iluminação;
//   • PADDOCK: ambulância, carro dos bombeiros, trator de resgate com guindaste, geradores, banheiros químicos, tenda, bilheteria.
// Tudo em MeshBatch (cor por vértice; texturas: torcida, patrocínios, quadriculado, nome no gramado), com o relevo (o patamar é plano).
//
//   build()        (CityGrid.finish) escolhe o lugar (SITES), registra o POI 'speedway' e os sólidos para quem anda a pé.
//   init(game)     malhas e as barreiras na física (Havok: caixas giradas), quando a física estiver pronta.
//   at(s, lat)     ponto do eixo a `s` m da largada (volta = L), deslocado `lat` m para a ESQUERDA de quem corre → { x, z, tx, tz }.
//   project(x, z)  → { s, lat } do ponto do eixo mais perto.  radiusAt(s): raio da curva (Infinity nas retas).
//   gridSlot(i)    vaga i do grid (fila dupla atrás da linha de chegada).  covers(x, z, m): dentro do terreno do autódromo?
//   footprint(q)   a caixa do terreno para o lugar q (WorldMap: o patamar plano).
// ============================================================================

const Speedway = {
    NAME: 'Autódromo Arena Sul',
    SITES: [{ x: -914, z: 470 }, { x: -912, z: 474 }, { x: -920, z: 470 }],
    W: 14,                 // largura da pista (m)
    WALL: 0.6,             // espessura do muro (m)
    // polígono de controle no frame local (v = x − cx, u = z − cz) e o raio de cada curva
    POLY: [[24, -92, 24], [24, 92, 22], [-10, 110, 24], [-44, 76, 13], [-18, 36, 18], [-50, -6, 20], [-46, -84, 22], [-8, -110, 24]],
    BOUNDS: { v0: -72, v1: 76, u0: -128, u1: 128, cut: [[-90, 107, -41.5, 150]] },      // terreno do autódromo (frame local); cut: cantos sem nada (o sítio vizinho)
    site: null,
    built: false,

    // ---------------------------------------------------------------- traçado
    _layout() {
        if (this._lay) return this._lay;
        const P = this.POLY, n = P.length, pieces = [];
        const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], len = (a) => Math.hypot(a[0], a[1]), nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
        // cada vértice vira um arco tangente às duas arestas (raio reduzido se não couber)
        const F = P.map((B, i) => {
            const A = P[(i + n - 1) % n], C = P[(i + 1) % n], d1 = nrm(sub(B, A)), d2 = nrm(sub(C, B));
            const cr = d1[0] * d2[1] - d1[1] * d2[0], th = Math.acos(Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1])));
            let R = B[2], t = R * Math.tan(th / 2);
            const tmax = 0.46 * Math.min(len(sub(B, A)), len(sub(C, B)));
            if (t > tmax) { t = tmax; R = t / Math.tan(th / 2); }
            const T1 = [B[0] - d1[0] * t, B[1] - d1[1] * t], T2 = [B[0] + d2[0] * t, B[1] + d2[1] * t], sg = cr > 0 ? 1 : -1;
            const left = [-d1[1], d1[0]], c = [T1[0] + left[0] * R * sg, T1[1] + left[1] * R * sg];      // (v, u): "esquerda" de (dv, du) = (−du, dv)
            return { T1, T2, R, th, sg, c, a0: Math.atan2(T1[1] - c[1], T1[0] - c[0]) };
        });
        const V = [], U = [], K = [];
        const push = (v, u, k) => { V.push(v); U.push(u); K.push(k); };
        for (let i = 0; i < n; i++) {
            const f = F[i], g = F[(i + 1) % n];
            const al = f.R * f.th, na = Math.max(2, Math.ceil(al));
            for (let j = 0; j < na; j++) { const a = f.a0 + f.sg * f.th * j / na; push(f.c[0] + Math.cos(a) * f.R, f.c[1] + Math.sin(a) * f.R, f.sg / f.R); }
            const ln = len(sub(g.T1, f.T2)), nl = Math.max(1, Math.ceil(ln));
            for (let j = 0; j < nl; j++) { const t = j / nl; push(f.T2[0] + (g.T1[0] - f.T2[0]) * t, f.T2[1] + (g.T1[1] - f.T2[1]) * t, 0); }
        }
        // largada: no meio da reta dos boxes (v = POLY[0].v, u = 8)
        let i0 = 0, bd = Infinity;
        for (let i = 0; i < V.length; i++) { const d = Math.hypot(V[i] - P[0][0], U[i] - 8); if (d < bd) { bd = d; i0 = i; } }
        const rot = (a) => a.slice(i0).concat(a.slice(0, i0)), v = rot(V), u = rot(U), k = rot(K);
        const N = v.length, cum = new Float64Array(N + 1);
        for (let i = 1; i <= N; i++) cum[i] = cum[i - 1] + Math.hypot(v[i % N] - v[i - 1], u[i % N] - u[i - 1]);
        return (this._lay = { v, u, k, cum, N, L: cum[N] });
    },
    get L() { return this._layout().L; },
    get outerR() { return this.W / 2 + 12; },                                   // (compat.: a folga das barreiras de fora)

    // ---------------------------------------------------------------- lugar
    footprint(q) { const B = this.BOUNDS; return [q.x + B.v0, q.z + B.u0, q.x + B.v1, q.z + B.u1]; },
    build() {
        if (this.site) return;
        for (const c of this.SITES) {
            const f = this.footprint(c), box = { x0: f[0], z0: f[1], x1: f[2], z1: f[3] };
            if (!this._free(box, c)) continue;
            this.site = { cx: c.x, cz: c.z, box };
            break;
        }
        if (!this.site) { console.warn('[AUTÓDROMO] nenhum lugar livre — sem corridas de estádio'); return; }
        const S = this.site;
        S.start = this.at(0, 0);
        S.gate = this.local(30, 70);                                             // portão do paddock (atrás do prédio dos boxes)
        CityGrid.addPoi({ type: 'speedway', name: this.NAME, x: S.gate.x, z: S.gate.z });
        CityGrid.addObstacles(this._footSolids());
        console.log(`[AUTÓDROMO] ${this.NAME} em (${S.cx}, ${S.cz}) · circuito misto de ${this.L.toFixed(0)} m`);
    },
    _free(b, c) {
        const B = WorldMap.B, ok = [B.GRASS, B.FARM, B.SCRUB, B.FOREST];
        const cut = (x, z) => (this.BOUNDS.cut || []).some((q) => x - c.x >= q[0] && x - c.x <= q[2] && z - c.z >= q[1] && z - c.z <= q[3]);
        for (let x = b.x0; x <= b.x1; x += 8) for (let z = b.z0; z <= b.z1; z += 8) {
            if (cut(x, z)) continue;
            const k = WorldMap.index(x, z);
            if (k < 0 || !WorldMap.land[k] || (WorldMap.flags[k] & 1) || !ok.includes(WorldMap.biome[k])) return false;
            if (RoadPlan.onPavement(x, z, 2)) return false;
        }
        const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
        return !CityGrid.obstaclesAround(cx, cz, Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2).some((o) => o.x1 > b.x0 && o.x0 < b.x1 && o.z1 > b.z0 && o.z0 < b.z1 && !(cut(o.x0, o.z0) && cut(o.x1, o.z1)));
    },
    covers(x, z, m = 0) { const b = this.site && this.site.box; return !!b && x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m; },
    local(u, v) { return { x: this.site.cx + v, z: this.site.cz + u }; },

    // ---------------------------------------------------------------- consultas
    _idx(s) {
        const Y = this._layout(), L = Y.L; s = ((s % L) + L) % L;
        let i = Math.min(Y.N - 1, Math.floor(s / L * Y.N));
        while (i > 0 && Y.cum[i] > s) i--;
        while (i < Y.N - 1 && Y.cum[i + 1] <= s) i++;
        return { i, t: (s - Y.cum[i]) / ((Y.cum[i + 1] - Y.cum[i]) || 1) };
    },
    at(s, lat = 0, out = {}) {
        const Y = this._layout(), { i, t } = this._idx(s), j = (i + 1) % Y.N;
        const v = Y.v[i] + (Y.v[j] - Y.v[i]) * t, u = Y.u[i] + (Y.u[j] - Y.u[i]) * t;
        let tv = Y.v[j] - Y.v[i], tu = Y.u[j] - Y.u[i]; const l = Math.hypot(tv, tu) || 1; tv /= l; tu /= l;
        const tx = tv, tz = tu;                                                  // (frame local: x = v, z = u)
        out.x = this.site.cx + v - tz * lat; out.z = this.site.cz + u + tx * lat; out.tx = tx; out.tz = tz;
        return out;
    },
    curv(s) { const Y = this._layout(); return Y.k[this._idx(s).i]; },
    project(x, z) {
        const Y = this._layout(), v = x - this.site.cx, u = z - this.site.cz;
        let bi = 0, bd = Infinity;
        for (let i = 0; i < Y.N; i += 4) { const d = (Y.v[i] - v) ** 2 + (Y.u[i] - u) ** 2; if (d < bd) { bd = d; bi = i; } }
        for (let k = -6; k <= 6; k++) { const i = (bi + k + Y.N) % Y.N, d = (Y.v[i] - v) ** 2 + (Y.u[i] - u) ** 2; if (d < bd) { bd = d; bi = i; } }
        const p = this.at(Y.cum[bi], 0);
        return { s: Y.cum[bi], lat: (x - p.x) * -p.tz + (z - p.z) * p.tx };
    },
    radiusAt(s) { const k = this.curv(s); return k ? 1 / Math.abs(k) : Infinity; },
    gridSlot(i) {
        const s = -9 - Math.floor(i / 2) * 9, p = this.at(s, i % 2 ? 3.2 : -3.2);
        return { x: p.x, z: p.z, h: Math.atan2(p.tx, p.tz) };
    },
    // trecho da reta dos boxes (s de/até) e onde fica a pit lane (à direita de quem corre)
    get PIT() { const L = this.L; return { s0: -78, s1: 70, lat0: -(this.W / 2 + 3), lat1: -(this.W / 2 + 10.5), bld0: -(this.W / 2 + 11.5), bld1: -(this.W / 2 + 24), L }; },
    _inPit(s) { const P = this.PIT, L = this.L; let d = ((s % L) + L) % L; if (d > L / 2) d -= L; return d > P.s0 - 18 && d < P.s1 + 18; },
    _sd(s) { const L = this.L; let d = ((s % L) + L) % L; if (d > L / 2) d -= L; return d; },      // s com sinal (−L/2..L/2) em volta da largada

    // FOLGA de cada lado (do bordo da pista até a barreira): grama estreita nas retas; brita larga por fora das curvas; a pit lane na reta.
    _runoff() {
        if (this._run) return this._run;
        const Y = this._layout(), N = Y.N, base = 3.2, out = 11, L = [], R = [];
        for (let i = 0; i < N; i++) { L.push(base); R.push(base); }
        for (let i = 0; i < N; i++) {
            const k = Y.k[i]; if (!k) continue;
            const A = k > 0 ? R : L;                                                // curva para a esquerda: o lado de fora é o direito
            for (let d = -14; d <= 26; d++) { const j = (i + d + N) % N; A[j] = Math.max(A[j], out * (d < 0 ? 1 + d / 15 : d > 18 ? 1 - (d - 18) / 9 : 1)); }
        }
        const sm = (A) => A.map((_, i) => { let s = 0; for (let d = -5; d <= 5; d++) s += A[(i + d + N) % N]; return Math.max(base, s / 11); });
        const RL = sm(L), RR = sm(R);
        for (let i = 0; i < N; i++) if (this._inPit(Y.cum[i])) RR[i] = Math.max(RR[i], -this.PIT.bld0 - this.W / 2);
        return (this._run = { L: RL, R: RR });
    },
    runAt(s, side) { const r = this._runoff(), i = this._idx(s).i; return side > 0 ? r.L[i] : r.R[i]; },

    // ---------------------------------------------------------------- sólidos
    _footSolids() {
        const out = [], seg = (a, b, h) => out.push({ x0: Math.min(a.x, b.x) - 0.4, z0: Math.min(a.z, b.z) - 0.4, x1: Math.max(a.x, b.x) + 0.4, z1: Math.max(a.z, b.z) + 0.4, h });
        for (const side of [1, -1]) { let p = null; for (let s = 0; s <= this.L + 0.1; s += 3) { const q = this.at(s, side * (this.W / 2 + this.runAt(s, side) + this.WALL / 2)); if (p) seg(p, q, 1.3); p = q; } }
        for (const b of this._solidBoxes()) out.push(b);
        return out;
    },
    // retângulos (mundo) das construções: arquibancadas, boxes, torre, VIP
    _solidBoxes() {
        const o = [], box = (u0, v0, u1, v1, h) => { const a = this.local(u0, v0), b = this.local(u1, v1); o.push({ x0: Math.min(a.x, b.x), z0: Math.min(a.z, b.z), x1: Math.max(a.x, b.x), z1: Math.max(a.z, b.z), h }); };
        const P = this.PIT, v = this.POLY[0][0];
        box(P.s0 + 10, v - P.bld0, P.s1 - 14, v - P.bld1, 8);                        // prédio dos boxes
        box(P.s1 - 12, v - P.bld0 - 1, P.s1 - 2, v - P.bld1, 14);                     // torre de controle
        box(P.s0 - 6, v - P.bld0 - 2, P.s0 + 8, v - P.bld1, 4);                       // área VIP
        box(-60, v - this.W / 2 - 3.6, 50, v - this.W / 2 - 16.5, 7);                 // arquibancada principal (miolo)
        box(-78, -30, -18, -16, 9);                                                   // arquibancada coberta (miolo, na reta oposta)
        return o;
    },
    // barreiras e prédios na física: caixas giradas (as retas fundidas em caixas longas)
    _physics(game) {
        if (this._phys || !game.physicsReady || !game.physics) return;
        this._phys = [];
        const P = game.physics, sc = game.scene;
        const box = (a, b, h, th) => {
            const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, len = Math.hypot(b.x - a.x, b.z - a.z) + 0.4;
            const node = new BABYLON.TransformNode('speedwayWall' + this._phys.length, sc);
            node.position.set(mx, h / 2, mz); node.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
            this._phys.push(P.addStaticBox(node, new BABYLON.Vector3(th, h, len)));
        };
        for (const side of [1, -1]) {
            let a = null, ad = null, prev = null;
            for (let s = 0; s <= this.L + 0.01; s += 2) {
                const q = this.at(s, side * (this.W / 2 + this.runAt(s, side) + this.WALL / 2));
                if (!a) { a = q; prev = q; continue; }
                const d = [q.x - prev.x, q.z - prev.z], dl = Math.hypot(d[0], d[1]) || 1, dir = [d[0] / dl, d[1] / dl];
                if (!ad) ad = dir;
                if (ad[0] * dir[0] + ad[1] * dir[1] < 0.9985 || Math.hypot(q.x - a.x, q.z - a.z) > 40) { box(a, prev, 2.2, this.WALL + 0.3); a = prev; ad = dir; }
                prev = q;
            }
            if (a && prev && a !== prev) box(a, prev, 2.2, this.WALL + 0.3);
        }
        // muro dos boxes (entre a pista e a pit lane) e as construções
        const Pt = this.PIT;
        box(this.at(Pt.s0 + 14, -(this.W / 2 + 1.6)), this.at(Pt.s1 - 12, -(this.W / 2 + 1.6)), 1.2, 0.6);
        for (const b of this._solidBoxes()) {
            const node = new BABYLON.TransformNode('speedwayBld' + this._phys.length, sc);
            node.position.set((b.x0 + b.x1) / 2, b.h / 2, (b.z0 + b.z1) / 2);
            this._phys.push(P.addStaticBox(node, new BABYLON.Vector3(b.x1 - b.x0, b.h, b.z1 - b.z0)));
        }
    },

    // ---------------------------------------------------------------- desenho
    init(game) {
        if (!this.site) return;
        this._physics(game);
        if (this.built) return;
        this.built = true;
        const t0 = performance.now(), sc = game.scene, W = game.gameEngine && game.gameEngine.world;
        this._b = { ground: new MeshBatch(), solid: new MeshBatch(), crowd: new MeshBatch(), ads: new MeshBatch(), checker: new MeshBatch(), logo: new MeshBatch() };
        this.lamps = [];
        this._track(); this._kerbs(); this._barriers(); this._grid(); this._gantry(); this._pits(); this._stands(); this._covered();
        this._footbridge(); this._marshals(); this._towers(); this._paddock();
        MeshBatch.anchor = null;
        const mat = (name, tex, emit = 0) => {
            const m = new BABYLON.StandardMaterial('speedway_' + name, sc);
            m.specularColor = new BABYLON.Color3(0.04, 0.04, 0.04);
            if (tex) m.diffuseTexture = tex;
            if (emit) m.emissiveColor = new BABYLON.Color3(emit, emit, emit);
            return m;
        };
        const tex = { crowd: this._crowdTex(sc), ads: this._adsTex(sc), checker: this._checkerTex(sc), logo: this._logoTex(sc), signs: RoadArt.signTex || (RoadArt.signs(sc), RoadArt.signTex) };
        this.meshes = [];
        const parts = [];
        for (const [name, b] of Object.entries(this._b)) {
            if (b.empty) continue;
            if (name === 'solid' || name === 'ground') for (const [k, q] of this._split(b, 64)) parts.push([name, q, k]);       // (pedaços de 64 m: a câmera descarta o que não vê)
            else parts.push([name, b, '']);
        }
        for (const [name, b, key] of parts) {
            const m = b.build('speedway_' + name + key, sc, name === 'signs' ? RoadArt.signs(sc) : mat(name, tex[name] || null, name === 'ads' || name === 'logo' || name === 'checker' ? 0.18 : 0), { vertexColors: !tex[name], receiveShadows: true, alwaysActive: false, relief: true });
            if (!m) continue;
            if (name === 'logo') { m.material.diffuseTexture.hasAlpha = true; m.material.useAlphaFromDiffuseTexture = true; m.material.transparencyMode = BABYLON.Material.MATERIAL_ALPHATEST; m.material.alphaCutOff = 0.4; }
            m.isPickable = false;
            if (name === 'solid' && W && W.shadow) W.shadow.addShadowCaster(m);
            this.meshes.push(m);
        }
        this._b = null;
        this.glow = new GlowBatch(sc, this.lamps.length + 2, 'speedwayLamps', 'glow');
        for (let i = 0; i < this.lamps.length; i++) this.glow.alloc();
        console.log(`[AUTÓDROMO] montado em ${(performance.now() - t0).toFixed(0)} ms`);
    },
    update(game) {
        if (!this.glow) return;
        const n = game.dayNight ? game.dayNight.night : 0, f = game.camera.target, near = Math.hypot(f.x - this.site.cx, f.z - this.site.cz) < 300;
        this.lamps.forEach((L, i) => { if (n > 0.2 && near) { this.glow.place(i, L.x, L.y + (typeof Relief !== 'undefined' ? Relief.at(L.x, L.z) : 0), L.z, 9); this.glow.color(i, 1, 0.96, 0.85, 0.75 * n); } else this.glow.off(i); });
        this.glow.flush();
    },

    // Reparte um lote em pedaços de `size` m (pelo centro de cada triângulo) → [[chave, MeshBatch]].
    _split(b, size) {
        const out = new Map(), P = b.pos, A = b.anc;
        for (let t = 0; t < b.idx.length; t += 3) {
            const i0 = b.idx[t], i1 = b.idx[t + 1], i2 = b.idx[t + 2];
            const cx = (P[i0 * 3] + P[i1 * 3] + P[i2 * 3]) / 3, cz = (P[i0 * 3 + 2] + P[i1 * 3 + 2] + P[i2 * 3 + 2]) / 3, key = '@' + Math.floor(cx / size) + ',' + Math.floor(cz / size);
            let q = out.get(key);
            if (!q) { q = new MeshBatch(); q._map = new Map(); if (A) q.anc = []; out.set(key, q); }
            for (const i of [i0, i1, i2]) {
                let j = q._map.get(i);
                if (j === undefined) {
                    j = q.pos.length / 3; q._map.set(i, j);
                    q.pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); q.nor.push(b.nor[i * 3], b.nor[i * 3 + 1], b.nor[i * 3 + 2]);
                    q.uv.push(b.uv[i * 2], b.uv[i * 2 + 1]); q.col.push(b.col[i * 4], b.col[i * 4 + 1], b.col[i * 4 + 2], b.col[i * 4 + 3]);
                    if (A) q.anc.push(A[i]);
                }
                q.idx.push(j);
            }
        }
        for (const q of out.values()) q._map = null;
        return [...out.entries()];
    },

    // ---- utilidades de geometria
    _anchorAt(x, z) { MeshBatch.anchor = typeof Relief !== 'undefined' && Relief.on ? { h: Relief.at(x, z) } : null; },
    _tri(b, a, c, d, col, n = [0, 1, 0], uv) { b.tri(a, c, d, n, uv || [[0, 0], [0, 0], [0, 0]], col); },
    // faixa ao longo da pista entre lat0 e lat1 (podem variar com s: funções), na altura y, de s0 a s1
    _ribbon(b, lat0, lat1, y, s0, s1, ds, col, uvFn = null) {
        const f0 = typeof lat0 === 'function' ? lat0 : () => lat0, f1 = typeof lat1 === 'function' ? lat1 : () => lat1;
        for (let s = s0; s < s1 - 1e-6; s += ds) {
            const e = Math.min(s1, s + ds), A = this.at(s, f0(s)), B = this.at(s, f1(s)), C = this.at(e, f1(e)), D = this.at(e, f0(e)), c = typeof col === 'function' ? col(s) : col;
            if (!c) continue;
            const uv = uvFn ? [uvFn(s, 0), uvFn(s, 1), uvFn(e, 1), uvFn(e, 0)] : null;
            b.tri([A.x, y, A.z], [B.x, y, B.z], [C.x, y, C.z], [0, 1, 0], uv ? [uv[0], uv[1], uv[2]] : [[0, 0], [0, 0], [0, 0]], c);
            b.tri([A.x, y, A.z], [C.x, y, C.z], [D.x, y, D.z], [0, 1, 0], uv ? [uv[0], uv[2], uv[3]] : [[0, 0], [0, 0], [0, 0]], c);
        }
    },
    // caixa no frame local (u ao longo do eixo z, v ao longo de x), centro (u, v), meias medidas hu/hv, de y0 a y1
    _lbox(b, u, v, hu, hv, y0, y1, col) { const p = this.local(u, v); b.solid(p.x - hv, p.z - hu, p.x + hv, p.z + hu, y0, y1, col); },

    // ---------------------------------------------------------------- pista
    _track() {
        const b = this._b.ground, W = this.W, L = this.L, y = 0.05;
        const asphalt = (s) => { const k = 0.21 + 0.018 * Math.sin(s * 0.37) + 0.012 * Math.sin(s * 1.9); return [k, k * 1.01, k * 1.06]; };
        this._ribbon(b, -W / 2, W / 2, y, 0, L, 2, asphalt);
        // borracha: a linha de tangência mais escura nas curvas (por dentro no ápice) e marcas de freada antes delas
        this._ribbon(b, (s) => { const k = this.curv(s); return k ? Math.sign(k) * (W / 2 - 4.2) - 1.2 : -1; }, (s) => { const k = this.curv(s); return k ? Math.sign(k) * (W / 2 - 4.2) + 1.2 : 1; }, y + 0.004, 0, L, 2, (s) => (this.curv(s) ? [0.15, 0.15, 0.16] : null));
        for (let s = 0; s < L; s += 2) {
            if (this.curv(s) || !this.curv(s + 14)) continue;
            for (const o of [-2.4, 2.4]) this._ribbon(b, o - 0.18, o + 0.18, y + 0.006, s - 22, s, 2, [0.12, 0.12, 0.13]);       // freada (pares de pneus)
            s += 40;
        }
        for (const o of [-1, 1]) this._ribbon(b, o * (W / 2 - 0.55), o * (W / 2 - 0.25), y + 0.02, 0, L, 1, [0.92, 0.92, 0.9]);        // faixas brancas
        // grama aparada e brita: entre o bordo e a barreira (brita onde a folga é larga — por fora das curvas)
        for (const side of [1, -1]) {
            const run = (s) => this.runAt(s, side);
            this._ribbon(b, (s) => side * W / 2, (s) => side * (W / 2 + run(s)), y - 0.02, 0, L, 2, (s) => (this._inPit(s) && side < 0 ? null : run(s) > 6 ? [0.74, 0.65, 0.5] : [0.3, 0.47, 0.22]));
        }
        // linha de chegada e o nome no gramado do miolo
        this._ribbon(this._b.checker, -W / 2, W / 2, y + 0.01, -1.2, 1.2, 2.4, [1, 1, 1], (s, k) => [k * 7, (s + 1.2) / 2.4]);
        const c = this.local(4, -12), hw = 12, hl = 6;
        this._b.logo.tri([c.x - hw, 0.04, c.z + hl], [c.x + hw, 0.04, c.z + hl], [c.x + hw, 0.04, c.z - hl], [0, 1, 0], [[0, 0], [1, 0], [1, 1]], [1, 1, 1]);
        this._b.logo.tri([c.x - hw, 0.04, c.z + hl], [c.x + hw, 0.04, c.z - hl], [c.x - hw, 0.04, c.z - hl], [0, 1, 0], [[0, 0], [1, 1], [0, 1]], [1, 1, 1]);
    },
    // ZEBRAS: verde e amarelo, por dentro das curvas (no ápice) e por fora na saída; em dente-de-serra, um pouco altas
    _kerbs() {
        const b = this._b.ground, W = this.W, L = this.L, y = 0.06, Y = this._layout();
        const col = (s) => (Math.floor(s / 1.4) % 2 ? [0.95, 0.82, 0.1] : [0.1, 0.55, 0.2]);
        let s = 0;
        while (s < L) {
            const k = this.curv(s);
            if (!k) { s += 1; continue; }
            let e = s; while (e < L && Math.sign(this.curv(e)) === Math.sign(k)) e += 1;
            const inner = Math.sign(k), a = s - 6, z = e + 6;
            this._ribbon(b, inner * (W / 2 - 0.1), inner * (W / 2 + 1.3), y, a, z, 1.4, col);                            // zebra interna
            this._ribbon(b, -inner * (W / 2 - 0.1), -inner * (W / 2 + 1.1), y, (a + z) / 2, z + 14, 1.4, col);          // externa, na saída
            s = e + 1;
        }
    },
    // BARREIRAS: muro de concreto com placas e o alambrado nas retas; pneus empilhados (e o alambrado) onde a brita é larga
    _barriers() {
        const W = this.W, L = this.L, sol = this._b.solid, ads = this._b.ads, Y = this._layout();
        const C = [[0.08, 0.08, 0.09], [0.08, 0.08, 0.09], [0.08, 0.08, 0.09], [0.85, 0.15, 0.12], [0.94, 0.94, 0.92]];
        for (const side of [1, -1]) {
            for (let s = 0; s < L; s += 2.5) {
                if (side < 0 && this._inPit(s)) continue;
                const run = this.runAt(s, side), lat = side * (W / 2 + run + this.WALL / 2), p = this.at(s, lat), q = this.at(s + 2.5, side * (W / 2 + this.runAt(s + 2.5, side) + this.WALL / 2));
                const tx = q.x - p.x, tz = q.z - p.z, tl = Math.hypot(tx, tz) || 1, ux = tx / tl, uz = tz / tl, mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2;
                MeshBatch.anchor = null;
                const hl = tl / 2 + 0.03;
                if (run > 6) {                                                                         // pneus: duas fileiras, pilhas de 3
                    const nT = Math.max(2, Math.round(tl / 0.62));
                    for (let r = 0; r < 2; r++) for (let k = 0; k < nT; k++) {
                        const o = (k - (nT - 1) / 2) * (tl / nT), off = side * (r * 0.6 - 0.3), x = mx + ux * o - uz * off, z = mz + uz * o + ux * off;
                        sol.cyl(x, z, 0.3, 0, 0.75, C[(k + r + Math.floor(s / 10)) % C.length], 7);
                        sol.cyl(x, z, 0.16, 0.75, 0.76, [0.03, 0.03, 0.03], 6);
                    }
                    sol.obox(mx, mz, ux, uz, hl, 0.02, 0.18, 0.62, [0.12, 0.12, 0.14]);                        // cinta
                } else {
                    sol.obox(mx, mz, ux, uz, hl, this.WALL / 2, 0, 1.0, [0.82, 0.82, 0.8], hl, this.WALL / 2 - 0.1);       // muro
                    // placa de patrocínio na face da pista (atlas 4 × 4)
                    const ad = Math.floor(s / 10) % 16, cu = (ad % 4) / 4, cv = Math.floor(ad / 4) / 4, f = -side * (this.WALL / 2 + 0.01);
                    const P0 = [mx - ux * hl - uz * f, 0.1, mz - uz * hl + ux * f], P1 = [mx + ux * hl - uz * f, 0.1, mz + uz * hl + ux * f];
                    const A = side > 0 ? P0 : P1, B = side > 0 ? P1 : P0;                      // (a esquerda da placa à esquerda de quem olha da pista)
                    const n = [-uz * -side, 0, ux * -side], fr = (Math.floor(s / 2.5) % 4) / 4;
                    ads.tri([A[0], 0.9, A[2]], [B[0], 0.9, B[2]], [B[0], 0.1, B[2]], n, [[cu + fr / 4, cv], [cu + (fr + 0.25) / 4, cv], [cu + (fr + 0.25) / 4, cv + 0.25]], [1, 1, 1]);
                    ads.tri([A[0], 0.9, A[2]], [B[0], 0.1, B[2]], [A[0], 0.1, A[2]], n, [[cu + fr / 4, cv], [cu + (fr + 0.25) / 4, cv + 0.25], [cu + fr / 4, cv + 0.25]], [1, 1, 1]);
                }
                // alambrado: postes, tela (cabos) e o arame de cima
                const fo = side * 0.35, fx = mx - uz * fo, fz = mz + ux * fo;
                sol.tube([fx - ux * hl, run > 6 ? 0 : 1.0, fz - uz * hl], [fx - ux * hl, 4.2, fz - uz * hl], 0.05, 0.05, [0.4, 0.42, 0.45], 4);
                for (const h of [1.6, 2.4, 3.2, 4.1]) sol.tube([fx - ux * hl, h, fz - uz * hl], [fx + ux * hl, h, fz + uz * hl], 0.012, 0.012, [0.32, 0.34, 0.37], 3);
                for (let g = -hl + 0.3; g <= hl; g += 0.5) sol.tube([fx + ux * g, run > 6 ? 0.8 : 1.0, fz + uz * g], [fx + ux * g, 4.1, fz + uz * g], 0.008, 0.008, [0.4, 0.42, 0.45], 3);
            }
        }
    },
    // grid de largada: o "⌐" branco de cada vaga e o número
    _grid() {
        const b = this._b.ground, y = 0.062;
        for (let i = 0; i < 12; i++) {
            const lat = i % 2 ? 3.2 : -3.2, s = -9 - Math.floor(i / 2) * 9 + 2.6;
            this._ribbon(b, lat - 1.4, lat + 1.4, y, s, s + 0.3, 0.3, [0.95, 0.95, 0.93]);
            this._ribbon(b, lat - 1.4, lat - 1.1, y, s - 1.8, s, 1.8, [0.95, 0.95, 0.93]);
            this._ribbon(b, lat + 1.1, lat + 1.4, y, s - 1.8, s, 1.8, [0.95, 0.95, 0.93]);
        }
    },
    // PÓRTICO DE LARGADA: duas torres de treliça e a viga sobre a pista, com o semáforo (5 luzes) e os painéis
    _truss(b, p, q, w, col) {                                                       // treliça quadrada de p a q ([x, y, z]), largura w
        const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], L = Math.hypot(...d), t = d.map((c) => c / L);
        const h = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        let a = [t[1] * h[2] - t[2] * h[1], t[2] * h[0] - t[0] * h[2], t[0] * h[1] - t[1] * h[0]]; const al = Math.hypot(...a); a = a.map((c) => c / al * w / 2);
        const c2 = [t[1] * a[2] - t[2] * a[1], t[2] * a[0] - t[0] * a[2], t[0] * a[1] - t[1] * a[0]];
        const corner = [[1, 1], [1, -1], [-1, -1], [-1, 1]], P = (o, k) => [o[0] + a[0] * corner[k][0] + c2[0] * corner[k][1], o[1] + a[1] * corner[k][0] + c2[1] * corner[k][1], o[2] + a[2] * corner[k][0] + c2[2] * corner[k][1]];
        for (let k = 0; k < 4; k++) b.tube(P(p, k), P(q, k), 0.05, 0.05, col, 4);
        const n = Math.max(2, Math.round(L / w));
        for (let i = 0; i < n; i++) {
            const o0 = p.map((c, j) => c + d[j] * i / n), o1 = p.map((c, j) => c + d[j] * (i + 1) / n);
            for (let k = 0; k < 4; k++) b.tube(P(o0, k), P(o1, (k + 1) % 4), 0.025, 0.025, col, 3);
        }
    },
    _gantry() {
        const b = this._b.solid, W = this.W, s = 0.6, g = [0.62, 0.64, 0.68], H = 6.6;
        const A = this.at(s, W / 2 + 1.6), B = this.at(s, -(W / 2 + 1.6));
        this._anchorAt(A.x, A.z);
        this._truss(b, [A.x, 0, A.z], [A.x, H + 0.6, A.z], 0.8, g);
        this._truss(b, [B.x, 0, B.z], [B.x, H + 0.6, B.z], 0.8, g);
        this._truss(b, [A.x, H, A.z], [B.x, H, B.z], 0.8, g);
        // semáforo: caixa preta com 5 pares de luzes vermelhas, voltada para o grid (para trás: -t)
        const C = this.at(s, 0), tx = C.tx, tz = C.tz, ux = -tz, uz = tx;
        b.obox(C.x - tx * 0.5, C.z - tz * 0.5, ux, uz, 1.6, 0.18, H - 1.1, H - 0.4, [0.06, 0.06, 0.07]);
        for (let k = 0; k < 5; k++) for (const yy of [H - 0.6, H - 0.9]) FavelaDetail.disc(b, [C.x - tx * 0.69 + ux * (k - 2) * 0.62, yy, C.z - tz * 0.69 + uz * (k - 2) * 0.62], [-tx, 0, -tz], 0.12, [0.85, 0.08, 0.06], 8);
        // painéis de LED nas torres (tempo / posição) e o painel do patrocínio na viga
        for (const P of [A, B]) b.obox(P.x - tx * 0.6, P.z - tz * 0.6, ux, uz, 0.9, 0.1, 3.0, 4.4, [0.05, 0.05, 0.06]);
        for (const P of [A, B]) for (let r = 0; r < 4; r++) b.obox(P.x - tx * 0.71, P.z - tz * 0.71, ux, uz, 0.7, 0.02, 3.2 + r * 0.3, 3.36 + r * 0.3, r % 2 ? [0.95, 0.8, 0.15] : [0.2, 0.85, 0.3]);
        const ads = this._b.ads, n = [-tx, 0, -tz], hl = W / 2 - 1, cu = 0.25, cv = 0.75;
        const P1 = [C.x - tx * 0.45 + ux * hl, 0, C.z - tz * 0.45 + uz * hl], P2 = [C.x - tx * 0.45 - ux * hl, 0, C.z - tz * 0.45 - uz * hl];
        ads.tri([P1[0], H + 1.4, P1[2]], [P2[0], H + 1.4, P2[2]], [P2[0], H + 0.5, P2[2]], n, [[cu, cv], [cu + 0.25, cv], [cu + 0.25, cv + 0.25]], [1, 1, 1]);
        ads.tri([P1[0], H + 1.4, P1[2]], [P2[0], H + 0.5, P2[2]], [P1[0], H + 0.5, P1[2]], n, [[cu, cv], [cu + 0.25, cv + 0.25], [cu, cv + 0.25]], [1, 1, 1]);
        MeshBatch.anchor = null;
    },

    // ---------------------------------------------------------------- boxes
    _pits() {
        const P = this.PIT, W = this.W, g = this._b.ground, b = this._b.solid, y = 0.055, v0 = this.POLY[0][0];
        // pit lane: entrada (do bordo até a faixa) e saída, a faixa reta, as linhas
        const lane = (s) => { if (s < P.s0) return Math.max(0, 1 - (P.s0 - s) / 26); if (s > P.s1) return Math.max(0, 1 - (s - P.s1) / 26); return 1; };
        const in0 = (s) => -(W / 2) + (P.lat0 + W / 2) * lane(s), in1 = (s) => -(W / 2) + (P.lat1 + W / 2) * lane(s);
        this._ribbon(g, in0, in1, y, P.s0 - 26, P.s1 + 26, 2, [0.24, 0.24, 0.26]);
        this._ribbon(g, (s) => in1(s) + 0.3, in1, y + 0.005, P.s0 - 26, P.s1 + 26, 2, [0.95, 0.82, 0.12]);                    // amarela (limite)
        this._ribbon(g, (s) => in0(s) - 0.35, in0, y + 0.006, P.s0 - 26, P.s0 + 4, 1.2, (s) => (Math.floor(s / 1.2) % 2 ? [0.9, 0.12, 0.1] : [0.95, 0.82, 0.12]));      // entrada: vermelha e amarela
        this._ribbon(g, (s) => in0(s) - 0.35, in0, y + 0.006, P.s1 - 4, P.s1 + 26, 1.2, (s) => (Math.floor(s / 1.2) % 2 ? [0.9, 0.12, 0.1] : [0.95, 0.82, 0.12]));
        this._ribbon(g, P.lat0 - 0.4, P.lat0 - 0.1, y + 0.006, P.s0 + 4, P.s1 - 4, 2, [0.95, 0.95, 0.93]);                       // faixa de rolagem
        // muro dos boxes (concreto baixo, placas, tela em cima)
        const mw = -(W / 2 + 1.6);
        for (let s = P.s0 + 14; s < P.s1 - 12; s += 3) {
            const a = this.at(s, mw), c = this.at(s + 3, mw), ux = c.x - a.x, uz = c.z - a.z, l = Math.hypot(ux, uz) || 1;
            b.obox((a.x + c.x) / 2, (a.z + c.z) / 2, ux / l, uz / l, 1.55, 0.3, 0, 1.1, [0.84, 0.84, 0.82], 1.55, 0.22);
            b.tube([a.x, 1.1, a.z], [a.x, 3.6, a.z], 0.04, 0.04, [0.4, 0.42, 0.45], 4);
            for (const h of [1.8, 2.7, 3.55]) b.tube([a.x, h, a.z], [c.x, h, c.z], 0.012, 0.012, [0.32, 0.34, 0.37], 3);
        }
        // PRÉDIO DOS BOXES: garagens no térreo (portas abertas com o carro dentro), andar de vidro e cobertura
        const u0 = P.s0 + 10, u1 = P.s1 - 14, vf = v0 - P.bld0, vb = v0 - P.bld1, H1 = 4.2, H2 = 7.6;
        const mid = this.local((u0 + u1) / 2, (vf + vb) / 2);
        this._anchorAt(mid.x, mid.z);
        this._lbox(b, (u0 + u1) / 2, (vf + vb) / 2 + 1.2, (u1 - u0) / 2, (vb - vf) / 2 - 1.2, 0, H1, [0.82, 0.82, 0.8]);       // fundo/paredes
        const nG = Math.floor((u1 - u0) / 9), gw = (u1 - u0) / nG, cars = [[0.85, 0.1, 0.1], [0.1, 0.35, 0.8], [0.95, 0.75, 0.1], [0.1, 0.6, 0.3], [0.9, 0.9, 0.9], [0.55, 0.15, 0.6]];
        for (let i = 0; i < nG; i++) {
            const uc = u0 + gw * (i + 0.5);
            this._lbox(b, u0 + gw * i + 0.25, vf + 2, 0.25, 2, 0, H1, [0.86, 0.86, 0.84]);                                   // pilar entre as portas
            this._lbox(b, uc, vf + 3.6, gw / 2 - 0.4, 0.05, 0, H1 - 0.2, [0.07, 0.07, 0.08]);                                 // fundo escuro da garagem
            this._lbox(b, uc, vf + 3.5, gw / 2 - 0.4, 2.1, 0, 0.04, [0.55, 0.56, 0.58]);                                       // piso
            this._lbox(b, uc, vf + 0.25, gw / 2 - 0.4, 0.25, H1 - 0.7, H1, [0.94, 0.94, 0.92]);                                // verga (porta aberta)
            const c = cars[i % cars.length];                                                                                  // o carro de corrida
            this._lbox(b, uc, vf + 2.4, 1.0, 2.0, 0.15, 0.55, c); this._lbox(b, uc, vf + 2.6, 0.45, 0.7, 0.55, 0.95, [0.1, 0.1, 0.12]);
            this._lbox(b, uc, vf + 0.6, 1.1, 0.25, 0.1, 0.25, c); this._lbox(b, uc, vf + 4.2, 1.0, 0.2, 0.7, 0.9, c);         // asas
            for (const du of [-1.05, 1.05]) for (const dv of [1.0, 3.6]) { const p = this.local(uc + du, vf + dv); b.cyl(p.x, p.z, 0.32, 0.0, 0.32, [0.05, 0.05, 0.05], 8); }
            for (let k = 0; k < 3; k++) { const p = this.local(uc + gw / 2 - 1.2, vf + 3.5); b.cyl(p.x, p.z, 0.3, k * 0.28, k * 0.28 + 0.26, [0.06, 0.06, 0.06], 8); }       // pneus empilhados
            this._lbox(b, uc - gw / 2 + 1.0, vf + 3.6, 0.3, 0.4, 0, 1.1, [0.8, 0.15, 0.12]);                                   // armário de ferramentas
            // vaga pintada na frente (o box)
            const s0 = uc - 2.2, s1 = uc + 2.2;
            this._ribbon(g, P.lat1 + 0.4, P.lat1 + 0.7, y + 0.006, s0, s1, 4.4, [0.95, 0.95, 0.93]);
            this._ribbon(g, P.lat1 + 0.4, P.lat0 - 1.2, y + 0.006, s0, s0 + 0.3, 0.3, [0.95, 0.95, 0.93]);
            this._ribbon(g, P.lat1 + 0.4, P.lat0 - 1.2, y + 0.006, s1 - 0.3, s1, 0.3, [0.95, 0.95, 0.93]);
        }
        this._lbox(b, (u0 + u1) / 2, (vf + vb) / 2, (u1 - u0) / 2 + 0.3, (vb - vf) / 2 + 0.3, H1, H1 + 0.35, [0.9, 0.9, 0.88]);     // laje
        this._lbox(b, (u0 + u1) / 2, (vf + vb) / 2 + 0.8, (u1 - u0) / 2, (vb - vf) / 2 - 0.8, H1 + 0.35, H2, [0.32, 0.46, 0.58]);   // vidro
        for (let u = u0 + 3; u < u1; u += 3) this._lbox(b, u, vf + 0.75, 0.08, 0.06, H1 + 0.35, H2, [0.2, 0.22, 0.25]);       // caixilhos
        this._lbox(b, (u0 + u1) / 2, vf + 0.15, (u1 - u0) / 2, 0.05, H1 + 0.35, H1 + 1.4, [0.7, 0.85, 0.92]);                    // guarda-corpo de vidro do terraço
        this._lbox(b, (u0 + u1) / 2, (vf + vb) / 2, (u1 - u0) / 2 + 0.6, (vb - vf) / 2 + 0.6, H2, H2 + 0.4, [0.56, 0.58, 0.6]);    // cobertura
        this._lbox(b, (u0 + u1) / 2, vf - 0.3, (u1 - u0) / 2 + 0.6, 0.3, H2 - 0.2, H2 + 0.9, [0.9, 0.9, 0.88]);                     // platibanda da frente
        for (let u = u0 + 6; u < u1 - 4; u += 11) { this._lbox(b, u, (vf + vb) / 2 + 2, 1.2, 0.9, H2 + 0.4, H2 + 1.4, [0.8, 0.8, 0.8]); this._lbox(b, u + 3.2, (vf + vb) / 2 + 2.5, 0.7, 0.7, H2 + 0.4, H2 + 1.1, [0.7, 0.72, 0.74]); }
        for (let u = u0 + 2; u < u1 - 2; u += 2.2) this._lbox(b, u, vb - 1.2, 0.9, 0.6, H2 + 0.4, H2 + 0.55, [0.2, 0.26, 0.42]);     // placas solares
        {
            const ads = this._b.ads;                                                                                                // faixa de patrocínio na platibanda (para a pista)
            for (let u = u0; u < u1 - 0.1; u += 12) {
                const ad = (Math.floor((u - u0) / 12) + 2) % 16, cu = (ad % 4) / 4, cv = Math.floor(ad / 4) / 4, A = this.local(u, vf - 0.62), B = this.local(Math.min(u1, u + 12), vf - 0.62);
                ads.tri([A.x, H2 + 0.85, A.z], [B.x, H2 + 0.85, B.z], [B.x, H2 - 0.15, B.z], [-1, 0, 0], [[cu, cv], [cu + 0.25, cv], [cu + 0.25, cv + 0.25]], [1, 1, 1]);
                ads.tri([A.x, H2 + 0.85, A.z], [B.x, H2 - 0.15, B.z], [A.x, H2 - 0.15, A.z], [-1, 0, 0], [[cu, cv], [cu + 0.25, cv + 0.25], [cu, cv + 0.25]], [1, 1, 1]);
            }
        }
        // TORRE DE CONTROLE (ponta norte): 3 andares, o de cima de vidro, mastros com bandeiras; e o PÓDIO no terraço da frente
        const tu = P.s1 - 7, tv = (vf + vb) / 2 + 2;
        const tp = this.local(tu, tv); this._anchorAt(tp.x, tp.z);
        this._lbox(b, tu, tv, 4.5, 5, 0, 8.5, [0.84, 0.84, 0.82]);
        this._lbox(b, tu, tv, 4.8, 5.3, 8.5, 11.6, [0.3, 0.45, 0.58]);
        this._lbox(b, tu, tv, 5.2, 5.7, 11.6, 12.1, [0.75, 0.75, 0.73]);
        for (const [du, fc] of [[-3.5, [0.1, 0.6, 0.25]], [0, [0.95, 0.95, 0.95]], [3.5, [0.9, 0.12, 0.1]]]) {
            const p = this.local(tu + du, tv - 4.5);
            b.tube([p.x, 12.1, p.z], [p.x, 16.5, p.z], 0.04, 0.04, [0.7, 0.72, 0.75], 4);
            b.obox(p.x + 0.55, p.z, 1, 0, 0.55, 0.02, 15.6, 16.3, fc);
            if (du === -3.5) { b.obox(p.x + 0.55, p.z, 1, 0, 0.3, 0.025, 15.75, 16.15, [0.95, 0.8, 0.1]); }      // (verde e amarela)
        }
        for (const [du, h, c] of [[-1.5, 0.6, [0.8, 0.8, 0.82]], [0, 1.0, [0.95, 0.8, 0.15]], [1.5, 0.4, [0.75, 0.5, 0.25]]]) this._lbox(b, tu - 2 + du, vf - 1.8, 0.7, 0.9, 4.55, 4.55 + h, c);      // pódio 2-1-3 no terraço
        // escadas externas da torre
        for (let k = 0; k < 8; k++) this._lbox(b, tu + 5 + k * 0.45, vb - 1, 0.25, 0.7, k * 1.0, k * 1.0 + 0.12, [0.5, 0.52, 0.56]);
        // ÁREA VIP (ponta sul): térreo de vidro, terraço com tendas brancas, guarda-corpo
        const au = P.s0 + 1, av = (vf + vb) / 2;
        const ap = this.local(au, av); this._anchorAt(ap.x, ap.z);
        this._lbox(b, au, av, 7, (vb - vf) / 2, 0, 3.4, [0.36, 0.5, 0.62]);
        this._lbox(b, au, av, 7.3, (vb - vf) / 2 + 0.3, 3.4, 3.7, [0.9, 0.9, 0.88]);
        for (let k = 0; k < 3; k++) {
            const cu = au - 4.6 + k * 4.6, p = this.local(cu, vf + 3.5);
            b.tube([p.x, 3.7, p.z], [p.x, 5.6, p.z], 0.05, 0.05, [0.8, 0.8, 0.8], 4);
            b.tube([p.x, 5.2, p.z], [p.x, 6.4, p.z], 2.0, 0.05, [0.97, 0.95, 0.88], 4);                                          // tenda
            this._lbox(b, cu, vf + 3.5, 0.5, 0.5, 3.7, 4.45, [0.85, 0.85, 0.82]);
        }
        this._lbox(b, au, vf + 0.2, 7, 0.05, 3.7, 4.7, [0.7, 0.85, 0.92]);
        MeshBatch.anchor = null;
        // placas da entrada e da saída dos boxes
        const sp = (s, kind) => { const p = this.at(s, -(W / 2 + 1.0)); this._anchorAt(p.x, p.z); const t = this.at(s, 0); RoadArt.sign(b, this._signFaces(), p.x, p.z, -t.tx, -t.tz, kind, 2.0); MeshBatch.anchor = null; };
        sp(P.s0 - 30, 'v60'); sp(P.s1 + 8, 'pare');
    },
    _signFaces() { return this._b.signs || (this._b.signs = new MeshBatch()); },

    // ---------------------------------------------------------------- público
    // ARQUIBANCADA PRINCIPAL (descoberta) no miolo, de frente para a reta dos boxes: degraus de concreto com os assentos coloridos e a
    // torcida (textura), escadarias, a estrutura por trás e o guarda-corpo
    _standTiers(b, crowd, u0, u1, vFront, dir, N, step, rise, y0, seats) {
        for (let k = 0; k < N; k++) {
            const va = vFront + dir * k * step, vb = va + dir * step, ya = y0 + k * rise, yb = ya + rise;
            const a = this.local(u0, va), c = this.local(u1, vb), x0 = Math.min(a.x, c.x), x1 = Math.max(a.x, c.x), z0 = Math.min(a.z, c.z), z1 = Math.max(a.z, c.z);
            b.solid(x0, z0, x1, z1, 0, ya, [0.66, 0.66, 0.64]);
            // assentos com gente: faixas texturizadas (blocos de cores), deixando as escadarias livres
            for (let u = u0; u < u1 - 0.1; u += 12) {
                const ue = Math.min(u1, u + 11), blk = Math.floor((u - u0) / 12), sc = seats[blk % seats.length], row = k / N;
                const A = this.local(u + 0.5, va), B = this.local(ue - 0.5, va), C = this.local(ue - 0.5, vb), D = this.local(u + 0.5, vb), u0t = sc / 3, u1t = (sc + 1) / 3;
                crowd.tri([A.x, yb, A.z], [B.x, yb, B.z], [C.x, yb, C.z], [0, 1, 0], [[u0t, row + 1 / N], [u1t, row + 1 / N], [u1t, row]], [1, 1, 1]);
                crowd.tri([A.x, yb, A.z], [C.x, yb, C.z], [D.x, yb, D.z], [0, 1, 0], [[u0t, row + 1 / N], [u1t, row], [u0t, row]], [1, 1, 1]);
                b.solid(Math.min(A.x, C.x), Math.min(A.z, C.z), Math.max(A.x, C.x), Math.max(A.z, C.z), ya, yb - 0.02, [0.6, 0.6, 0.58]);
            }
        }
    },
    _stands() {
        const b = this._b.solid, crowd = this._b.crowd, v0 = this.POLY[0][0], vFront = v0 - this.W / 2 - 3.8, N = 10, step = 1.3, rise = 0.62, u0 = -60, u1 = 50;
        const c = this.local((u0 + u1) / 2, vFront - 6); this._anchorAt(c.x, c.z);
        this._standTiers(b, crowd, u0, u1, vFront, -1, N, step, rise, 0.9, [0, 1, 2]);
        const vb = vFront - N * step, top = 0.9 + N * rise;
        this._lbox(b, (u0 + u1) / 2, vb - 0.2, (u1 - u0) / 2, 0.2, 0, top + 1.1, [0.58, 0.58, 0.56]);                      // costas
        for (const u of [u0, u1]) this._lbox(b, u, (vFront + vb) / 2, 0.25, (vFront - vb) / 2, 0, top + 0.6, [0.62, 0.62, 0.6]);       // laterais
        for (let u = u0 + 12; u < u1; u += 12) this._lbox(b, u - 0.5, (vFront + vb) / 2, 0.45, (vFront - vb) / 2, 0, top, [0.7, 0.7, 0.68]);       // escadarias
        this._lbox(b, (u0 + u1) / 2, vFront + 0.2, (u1 - u0) / 2, 0.15, 0, 1.6, [0.75, 0.75, 0.73]);                      // mureta da frente
        for (let u = u0; u <= u1; u += 4) { const p = this.local(u, vb - 0.1); b.tube([p.x, top, p.z], [p.x, top + 1.1, p.z], 0.03, 0.03, [0.5, 0.52, 0.56], 4); }
        // placas na mureta da frente (para a pista)
        const ads = this._b.ads;
        for (let u = u0; u < u1 - 0.1; u += 10) {
            const ad = Math.floor((u - u0) / 10) % 16, cu = (ad % 4) / 4, cv = Math.floor(ad / 4) / 4, A = this.local(u, vFront + 0.36), B = this.local(u + 10, vFront + 0.36);
            ads.tri([A.x, 1.55, A.z], [B.x, 1.55, B.z], [B.x, 0.25, B.z], [1, 0, 0], [[cu, cv], [cu + 0.25, cv], [cu + 0.25, cv + 0.25]], [1, 1, 1]);
            ads.tri([A.x, 1.55, A.z], [B.x, 0.25, B.z], [A.x, 0.25, A.z], [1, 0, 0], [[cu, cv], [cu + 0.25, cv + 0.25], [cu, cv + 0.25]], [1, 1, 1]);
        }
        MeshBatch.anchor = null;
    },
    // ARQUIBANCADA COBERTA no miolo, de frente para a reta oposta (oeste): cobertura metálica curva sobre pilares de aço
    _covered() {
        const b = this._b.solid, crowd = this._b.crowd, u0 = -78, u1 = -18, vFront = -30, N = 8, step = 1.3, rise = 0.6;
        const c = this.local((u0 + u1) / 2, vFront + 6); this._anchorAt(c.x, c.z);
        this._standTiers(b, crowd, u0, u1, vFront, 1, N, step, rise, 0.8, [1, 0, 2]);
        const vb = vFront + N * step, top = 0.8 + N * rise;
        this._lbox(b, (u0 + u1) / 2, vb + 0.2, (u1 - u0) / 2, 0.2, 0, top + 4.2, [0.55, 0.56, 0.6]);
        for (const u of [u0, u1]) this._lbox(b, u, (vFront + vb) / 2, 0.25, (vb - vFront) / 2, 0, top + 0.6, [0.62, 0.62, 0.6]);
        // pilares e a cobertura em arco (gomos de chapa ondulada, mais claros e mais escuros)
        const R0 = (vb - vFront) / 2 + 1.5, cvv = (vFront + vb) / 2, base = top + 3.6;
        for (let u = u0; u <= u1 + 0.1; u += 10) for (const v of [vFront + 0.3, vb]) { const p = this.local(u, v); b.tube([p.x, 0, p.z], [p.x, base + (v > cvv ? 0.2 : 0), p.z], 0.12, 0.12, [0.48, 0.5, 0.54], 6); }
        const n = 10;
        for (let k = 0; k < n; k++) {
            const a0 = Math.PI * k / n, a1 = Math.PI * (k + 1) / n, va = cvv - Math.cos(a0) * R0, vb2 = cvv - Math.cos(a1) * R0, ya = base + Math.sin(a0) * 2.2, yb = base + Math.sin(a1) * 2.2;
            for (let u = u0 - 1; u < u1 + 1; u += 2) {
                const A = this.local(u, va), B = this.local(u + 2, va), C = this.local(u + 2, vb2), D = this.local(u, vb2), col = Math.floor(u / 2) % 2 ? [0.72, 0.74, 0.78] : [0.62, 0.64, 0.68];
                b.tri([A.x, ya, A.z], [B.x, ya, B.z], [C.x, yb, C.z], [0, 1, 0], [[0, 0], [0, 0], [0, 0]], col); b.tri([A.x, ya, A.z], [C.x, yb, C.z], [D.x, yb, D.z], [0, 1, 0], [[0, 0], [0, 0], [0, 0]], col);
                b.tri([A.x, ya - 0.05, A.z], [C.x, yb - 0.05, C.z], [B.x, ya - 0.05, B.z], [0, -1, 0], [[0, 0], [0, 0], [0, 0]], [0.4, 0.42, 0.45]); b.tri([A.x, ya - 0.05, A.z], [D.x, yb - 0.05, D.z], [C.x, yb - 0.05, C.z], [0, -1, 0], [[0, 0], [0, 0], [0, 0]], [0.4, 0.42, 0.45]);
            }
        }
        // faixa de patrocínio na frente
        const ads = this._b.ads;
        for (let u = u0; u < u1 - 0.1; u += 10) {
            const ad = (Math.floor((u - u0) / 10) + 5) % 16, cu = (ad % 4) / 4, cv = Math.floor(ad / 4) / 4, A = this.local(u, vFront - 0.05), B = this.local(u + 10, vFront - 0.05);
            ads.tri([A.x, 1.3, A.z], [B.x, 1.3, B.z], [B.x, 0.2, B.z], [-1, 0, 0], [[cu, cv], [cu + 0.25, cv], [cu + 0.25, cv + 0.25]], [1, 1, 1]);
            ads.tri([A.x, 1.3, A.z], [B.x, 0.2, B.z], [A.x, 0.2, A.z], [-1, 0, 0], [[cu, cv], [cu + 0.25, cv + 0.25], [cu, cv + 0.25]], [1, 1, 1]);
        }
        this._lbox(b, (u0 + u1) / 2, vFront - 0.2, (u1 - u0) / 2, 0.15, 0, 0.2, [0.75, 0.75, 0.73]);
        MeshBatch.anchor = null;
    },
    // PASSARELA de pedestres sobre a reta oposta: torres de escada dos dois lados, o tabuleiro coberto e a faixa
    _footbridge() {
        const b = this._b.solid, s = this.project(this.local(-50, -48).x, this.local(-50, -48).z).s, W = this.W, H = 6.2, g = [0.6, 0.62, 0.66];
        const A = this.at(s, W / 2 + this.runAt(s, 1) + 2.5), B = this.at(s, -(W / 2 + this.runAt(s, -1) + 2.5));
        this._anchorAt((A.x + B.x) / 2, (A.z + B.z) / 2);
        this._truss(b, [A.x, H, A.z], [B.x, H, B.z], 1.6, g);
        const dx = B.x - A.x, dz = B.z - A.z, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
        b.obox((A.x + B.x) / 2, (A.z + B.z) / 2, ux, uz, l / 2, 0.85, H - 0.85, H - 0.75, [0.55, 0.56, 0.6]);                     // piso
        for (let k = 0; k < 8; k++) { const a0 = Math.PI * k / 8, a1 = Math.PI * (k + 1) / 8; const o0 = -Math.cos(a0) * 0.95, o1 = -Math.cos(a1) * 0.95, y0 = H + 0.9 + Math.sin(a0) * 0.6, y1 = H + 0.9 + Math.sin(a1) * 0.6; b.obox((A.x + B.x) / 2 - uz * (o0 + o1) / 2, (A.z + B.z) / 2 + ux * (o0 + o1) / 2, ux, uz, l / 2, 0.08, Math.min(y0, y1), Math.max(y0, y1) + 0.04, [0.68, 0.7, 0.74]); }
        for (const P of [A, B]) {                                                                                                  // torres de escada
            this._truss(b, [P.x, 0, P.z], [P.x, H, P.z], 1.6, g);
            for (let k = 0; k < 10; k++) b.obox(P.x + uz * 1.4, P.z - ux * 1.4, ux, uz, 0.6, 0.5, k * H / 10, k * H / 10 + 0.1, [0.5, 0.52, 0.56]);
        }
        const ads = this._b.ads, C = [(A.x + B.x) / 2, (A.z + B.z) / 2], t = this.at(s, 0), n = [-t.tx, 0, -t.tz];
        for (const sg of [1, -1]) {
            // (cada face legível de frente: a ponta "esquerda" da textura fica à esquerda de quem olha para ela)
            const o = sg * 0.86, nx = t.tx * sg, nz = t.tz * sg, rx = -nz, rz = nx, P1 = [C[0] - rx * 5 + t.tx * o, C[1] - rz * 5 + t.tz * o], P2 = [C[0] + rx * 5 + t.tx * o, C[1] + rz * 5 + t.tz * o], cu = 0.75, cv = 0.75;
            ads.tri([P1[0], H + 0.5, P1[1]], [P2[0], H + 0.5, P2[1]], [P2[0], H - 0.7, P2[1]], [t.tx * sg, 0, t.tz * sg], [[cu, cv], [cu + 0.25, cv], [cu + 0.25, cv + 0.25]], [1, 1, 1]);
            ads.tri([P1[0], H + 0.5, P1[1]], [P2[0], H - 0.7, P2[1]], [P1[0], H - 0.7, P1[1]], [t.tx * sg, 0, t.tz * sg], [[cu, cv], [cu + 0.25, cv + 0.25], [cu, cv + 0.25]], [1, 1, 1]);
        }
        MeshBatch.anchor = null;
    },
    // POSTOS DOS FISCAIS por fora das curvas: torre baixa com cobertura, o fiscal, as bandeiras e a pilha de pneus
    _marshals() {
        const b = this._b.solid, Y = this._layout(), W = this.W, done = [];
        for (let s = 0; s < this.L; s += 4) {
            const k = this.curv(s); if (!k || done.some((d) => Math.abs(d - s) < 70)) continue;
            const side = -Math.sign(k), p = this.at(s + 10, side * (W / 2 + this.runAt(s + 10, side) + 2.2));
            if (this.covers(p.x, p.z, -3) === false) continue;
            done.push(s);
            this._anchorAt(p.x, p.z);
            for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) b.tube([p.x + dx, 0, p.z + dz], [p.x + dx, 3.2, p.z + dz], 0.05, 0.05, [0.5, 0.52, 0.56], 4);
            b.solid(p.x - 1, p.z - 1, p.x + 1, p.z + 1, 1.6, 1.75, [0.6, 0.6, 0.62]);
            b.obox(p.x, p.z, 1, 0, 1.15, 1.15, 3.2, 3.6, [0.75, 0.77, 0.8], 0.9, 0.9);
            for (let k2 = 0; k2 < 6; k2++) b.solid(p.x + 1.1, p.z - 1 + k2 * 0.3, p.x + 1.8, p.z - 0.7 + k2 * 0.3, k2 * 0.27, k2 * 0.27 + 0.1, [0.45, 0.47, 0.5]);      // escada
            b.tube([p.x, 1.75, p.z], [p.x, 2.55, p.z], 0.17, 0.15, [0.95, 0.5, 0.1], 6); b.cyl(p.x, p.z, 0.12, 2.55, 2.8, [0.8, 0.6, 0.45], 6);      // fiscal (macacão laranja)
            for (const [o, c] of [[-0.6, [0.95, 0.85, 0.1]], [0.6, [0.15, 0.65, 0.25]]]) { b.tube([p.x + o, 1.75, p.z - 0.9], [p.x + o, 3.0, p.z - 0.9], 0.02, 0.02, [0.3, 0.3, 0.3], 3); b.obox(p.x + o + 0.3, p.z - 0.9, 1, 0, 0.3, 0.015, 2.55, 2.95, c); }
            for (let r = 0; r < 6; r++) b.cyl(p.x - 1.6 + (r % 3) * 0.62, p.z + 1.6 + Math.floor(r / 3) * 0.62, 0.3, 0, 0.75, [0.06, 0.06, 0.06], 7);
        }
        MeshBatch.anchor = null;
    },
    _towers() {
        const b = this._b.solid;
        for (const [u, v] of [[-118, 40], [118, 30], [96, -62], [-110, -64], [10, -66], [0, 70]]) {
            const p = this.local(u, v); this._anchorAt(p.x, p.z);
            b.tube([p.x, 0, p.z], [p.x, 22, p.z], 0.35, 0.22, [0.55, 0.57, 0.6], 6);
            b.solid(p.x - 1.6, p.z - 0.5, p.x + 1.6, p.z + 0.5, 22, 24, [0.2, 0.2, 0.22]);
            this.lamps.push({ x: p.x, y: 23, z: p.z });
        }
        MeshBatch.anchor = null;
    },
    // PADDOCK atrás dos boxes: ambulância, bombeiros, trator de resgate com guindaste, geradores, banheiros químicos, tenda e bilheteria
    _paddock() {
        const b = this._b.solid, v = this.POLY[0][0] - this.PIT.bld1 + 4;           // (logo atrás do prédio)
        const veh = (u, vv, body, stripe, tall) => {
            const p = this.local(u, vv); this._anchorAt(p.x, p.z);
            this._lbox(b, u, vv, 2.6, 1.05, 0.35, tall, body); this._lbox(b, u + 1.9, vv, 0.7, 1.0, 0.35, tall * 0.62, body);
            this._lbox(b, u, vv, 2.62, 1.07, tall * 0.45, tall * 0.55, stripe);
            this._lbox(b, u + 2.0, vv, 0.6, 1.0, tall * 0.62 - 0.6, tall * 0.62 - 0.1, [0.2, 0.3, 0.38]);
            this._lbox(b, u - 0.5, vv, 0.3, 0.25, tall, tall + 0.18, [0.2, 0.4, 0.95]);
            for (const du of [-1.7, 1.6]) for (const dv of [-1.0, 1.0]) { const q = this.local(u + du, vv + dv); b.tube([q.x - 0.12, 0.38, q.z], [q.x + 0.12, 0.38, q.z], 0.38, 0.38, [0.06, 0.06, 0.06], 8); }
            MeshBatch.anchor = null;
        };
        veh(-40, v + 4, [0.97, 0.97, 0.95], [0.85, 0.1, 0.1], 2.7);                   // ambulância
        veh(-32, v + 4, [0.85, 0.12, 0.1], [0.98, 0.85, 0.2], 2.0);                   // bombeiros
        // trator de resgate com o braço do guindaste (laranja)
        const tr = this.local(-20, v + 5); this._anchorAt(tr.x, tr.z);
        RuralArt._tractor(b, { x: tr.x, z: tr.z, fx: 0, fz: 1, color: [0.92, 0.5, 0.1] });
        b.tube([tr.x, 1.4, tr.z - 0.8], [tr.x, 3.6, tr.z + 2.6], 0.16, 0.12, [0.92, 0.5, 0.1], 6);
        b.tube([tr.x, 3.6, tr.z + 2.6], [tr.x, 2.6, tr.z + 2.8], 0.03, 0.03, [0.2, 0.2, 0.2], 3);
        // geradores, banheiros químicos, tenda e bilheteria
        for (let k = 0; k < 2; k++) { const p = this.local(-8 + k * 4, v + 3); this._anchorAt(p.x, p.z); this._lbox(b, -8 + k * 4, v + 3, 1.2, 0.7, 0.2, 1.5, k ? [0.85, 0.86, 0.88] : [0.95, 0.8, 0.1]); this._lbox(b, -8 + k * 4, v + 3, 1.25, 0.72, 1.3, 1.36, [0.2, 0.2, 0.22]); }
        for (let k = 0; k < 4; k++) { const u = 6 + k * 1.4, p = this.local(u, v + 3); this._anchorAt(p.x, p.z); this._lbox(b, u, v + 3, 0.6, 0.6, 0, 2.3, [0.15, 0.45, 0.85]); this._lbox(b, u, v + 3, 0.62, 0.62, 2.3, 2.45, [0.9, 0.9, 0.9]); }
        { const p = this.local(18, v + 6); this._anchorAt(p.x, p.z); for (const [du, dv] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) { const q = this.local(18 + du, v + 6 + dv); b.tube([q.x, 0, q.z], [q.x, 2.4, q.z], 0.04, 0.04, [0.7, 0.7, 0.72], 4); } b.obox(p.x, p.z, 1, 0, 2.0, 2.0, 2.4, 3.2, [0.15, 0.35, 0.8], 0.1, 0.1); }
        const g = this.site.gate; this._anchorAt(g.x, g.z);
        b.solid(g.x - 1, g.z + 3, g.x + 1, g.z + 4.6, 0, 2.4, [0.2, 0.5, 0.3]); b.solid(g.x - 1.1, g.z + 2.9, g.x + 1.1, g.z + 4.7, 2.4, 2.6, [0.9, 0.9, 0.88]);       // bilheteria
        b.solid(g.x - 0.9, g.z + 2.95, g.x + 0.9, g.z + 3.0, 1.0, 1.9, [0.6, 0.78, 0.86]);
        MeshBatch.anchor = null;
    },

    // ---------------------------------------------------------------- texturas
    _canvasTex(sc, name, w, h, fn, wrap = false) {
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const c = cv.getContext('2d'); fn(c, w, h);
        const img = c.getImageData(0, 0, w, h), t = BABYLON.RawTexture.CreateRGBATexture(new Uint8Array(img.data.buffer), w, h, sc, true, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
        t.name = name; t.wrapU = t.wrapV = wrap ? BABYLON.Texture.WRAP_ADDRESSMODE : BABYLON.Texture.CLAMP_ADDRESSMODE; t.anisotropicFilteringLevel = 4;
        return t;
    },
    _logoTex(sc) {
        return this._canvasTex(sc, 'speedwayLogo', 1024, 512, (c) => {
            c.save(); c.translate(512, 256);
            c.font = '900 170px Arial Black, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.lineWidth = 18; c.lineJoin = 'round'; c.strokeStyle = 'rgba(20,20,24,1)'; c.fillStyle = 'rgba(245,245,240,1)';
            c.strokeText('ARENA', 0, -95); c.fillText('ARENA', 0, -95);
            c.font = '900 150px Arial Black, Arial, sans-serif'; c.fillStyle = 'rgba(30,150,60,1)';
            c.strokeText('SUL', 0, 105); c.fillText('SUL', 0, 105);
            c.restore();
        });
    },
    // torcida: 3 colunas de assento (azul, vermelho, amarelo) × fileiras, com a gente sentada (camisas, cabeças)
    _crowdTex(sc) {
        return this._canvasTex(sc, 'speedwayCrowd', 384, 160, (c, W, H) => {
            const seats = ['#2f5fb8', '#c8302a', '#e7c22a'], rows = 10, rh = H / rows;
            for (let k = 0; k < 3; k++) { c.fillStyle = seats[k]; c.fillRect(k * 128, 0, 128, H); }
            const shirts = ['#f2f2f2', '#d93a2f', '#2f64c8', '#f2c92a', '#2fa04a', '#1d1d22', '#e86ab0', '#ff8a1e'], skins = ['#c99a72', '#8d5a3a', '#e8c3a0', '#5e3a24'];
            let r = 7; const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
            for (let y = 0; y < rows; y++) for (let x = 2; x < W; x += 5) {
                if (rnd() < 0.28) continue;
                const px = x + rnd() * 1.5, py = y * rh + rh * 0.35;
                c.fillStyle = shirts[Math.floor(rnd() * shirts.length)]; c.fillRect(px, py, 3.4, rh * 0.5);
                c.fillStyle = skins[Math.floor(rnd() * skins.length)]; c.fillRect(px + 0.6, py - rh * 0.3, 2.2, rh * 0.3);
            }
        });
    },
    // patrocínios (fictícios): atlas 4 × 4 de 256 × 64
    ADS: [['TURBO', '#d62828', '#fff'], ['VELOX', '#1d4f9c', '#ffd23f'], ['CORRIDA', '#1b7a44', '#fff'], ['BRASIL', '#f2c200', '#1b7a44'], ['NITRO', '#111', '#3ddc5a'], ['MOTORAMA', '#ff7a00', '#111'],
        ['ARENA SUL', '#fff', '#1b7a44'], ['PNEUS FORTE', '#222', '#ffd23f'], ['GUARANÁ', '#16883a', '#fff'], ['AUTO PEÇAS', '#c8102e', '#fff'], ['RÁDIO 98', '#5a2d82', '#fff'], ['ÓLEO MAX', '#0b3d6b', '#ffcf2e'],
        ['VAI BRASIL', '#1b7a44', '#ffd23f'], ['FAROL', '#e9e9e2', '#c8102e'], ['TOP CAR', '#111', '#fff'], ['RACING', '#d62828', '#ffd23f']],
    _adsTex(sc) {
        return this._canvasTex(sc, 'speedwayAds', 1024, 256 * 4 / 4 * 1, (c) => {
            // (4 colunas × 4 linhas de 256 × 64: a textura tem 1024 × 256)
            this.ADS.forEach(([t, bg, fg], i) => {
                const x = (i % 4) * 256, y = Math.floor(i / 4) * 64;
                c.fillStyle = bg; c.fillRect(x, y, 256, 64);
                c.fillStyle = fg; c.fillRect(x, y + 56, 256, 4);
                c.font = '900 40px Arial Black, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
                const m = c.measureText(t).width; c.save(); c.translate(x + 128, y + 30); if (m > 230) c.scale(230 / m, 1);
                c.fillStyle = fg; c.fillText(t, 0, 0); c.restore();
            });
        });
    },
    _checkerTex(sc) {
        return this._canvasTex(sc, 'speedwayChecker', 64, 16, (c) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { c.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4'; c.fillRect(i * 4, j * 4, 4, 4); } }, true);
    },

    // ---------------------------------------------------------------- mapa (MapRenderer.drawView)
    drawMap(ctx, X, Y, k, vis) {
        const S = this.site;
        if (!S || !vis(S.box.x0, S.box.z0, S.box.x1, S.box.z1)) return;
        const path = (lat) => { ctx.beginPath(); for (let s = 0; s <= this.L + 0.1; s += 3) { const p = this.at(s, lat); if (s) ctx.lineTo(X(p.x), Y(p.z)); else ctx.moveTo(X(p.x), Y(p.z)); } ctx.closePath(); };
        ctx.save();
        ctx.lineJoin = 'round';
        path(0); ctx.strokeStyle = '#c9b48c'; ctx.lineWidth = Math.max(2, (this.W + 10) * k); ctx.stroke();
        path(0); ctx.strokeStyle = '#34363b'; ctx.lineWidth = Math.max(1.5, this.W * k); ctx.stroke();
        for (const b of this._solidBoxes()) { ctx.fillStyle = b.h > 7 ? '#8a8d93' : '#c8302a'; ctx.fillRect(X(b.x0), Y(b.z1), (b.x1 - b.x0) * k, (b.z1 - b.z0) * k); }
        const f0 = this.at(0, -this.W / 2), f1 = this.at(0, this.W / 2);
        ctx.strokeStyle = '#f4f4f4'; ctx.lineWidth = Math.max(1, 1.2 * k); ctx.beginPath(); ctx.moveTo(X(f0.x), Y(f0.z)); ctx.lineTo(X(f1.x), Y(f1.z)); ctx.stroke();
        ctx.restore();
    },
};
