// ============================================================================
// Birds — aves da cidade: pombos, gaivotas, rolinhas e bem-te-vis, como sprites pixel art (mesmo SpriteBaker do resto do jogo).
//   • Ficam no chão (bicando e andando) ou pousadas em postes/fios; de vez em quando trocam de lugar sozinhas.
//   • FOGEM quando o jogador (ou um NPC, ou um carro, ou um tiro) chega perto: levantam voo batendo asa, voam alto (com sombra no chão)
//     e pousam de novo mais longe — num poste, se houver um à frente, ou no chão.
//   • Gaivotas vivem na orla e planam; pombos são da cidade (mais na favela); rolinhas e bem-te-vis, do mato e do campo.
//   • Chuva forte e noite esvaziam o céu. Tudo numa única malha dinâmica (1 draw call), população em volta da câmera.
// Atlas: colunas = 8 direções, linhas = espécie × 6 quadros (parada, bicando, 4 de voo) + 1 linha com o blob de sombra.
// ============================================================================

class Birds {
    static get SPECIES() {
        return [
            { name: 'pombo',     S: 1.3,  span: 1.2, glide: false, pal: { body: '#8c929c', wing: '#7a808a', tip: '#454a54', head: '#5f7a8c', beak: '#d6b8b0', belly: '#a7adb6' } },
            { name: 'gaivota',   S: 1.75, span: 2.1,  glide: true,  pal: { body: '#f1f3f5', wing: '#cdd2da', tip: '#262b34', head: '#f7f8fa', beak: '#f2b21e', belly: '#ffffff' } },
            { name: 'rolinha',   S: 1.05, span: 0.9, glide: false, pal: { body: '#b08a66', wing: '#9a7650', tip: '#4a3a2a', head: '#c4a080', beak: '#6a5a50', belly: '#d8bea0' } },
            { name: 'bem-te-vi', S: 1.1,  span: 0.9,  glide: false, pal: { body: '#7a5a3a', wing: '#6a4a2c', tip: '#3a2a1a', head: '#2a2420', beak: '#2a2a2a', belly: '#f2c81e' } },
        ];
    }
    static get SLOT() { return { body: 1, wing: 2, tip: 3, head: 4, beak: 5, belly: 6 }; }
    static get FR() { return 48; }               // px por quadro (2,4 u)
    static get DIRS() { return 8; }
    static get PER() { return 6; }               // quadros por espécie: 0 parada, 1 bicando, 2..5 voo

    // ---------------------------------------------------------------- modelo
    // pose: 'idle' | 'peck' | 'fly0'..'fly3' | 'glide'. Modelo olhando para +Z (norte).
    static model(sp, pose) {
        const B = SpriteBaker, M = Birds.SLOT, S = sp.S, P = [];
        const flying = pose.startsWith('fly');
        P.push(B.ellipsoid(M.body, [0, 0.2, 0], [0.12 * S, 0.1 * S, 0.21 * S], 0));
        P.push(B.sphere(M.belly, [0, 0.19, 0.17 * S], 0.075 * S));                      // peito (aparece à frente do corpo)
        const peck = pose === 'peck';
        P.push(B.sphere(M.head, [0, peck ? 0.13 : 0.25, (peck ? 0.34 : 0.25) * S], 0.078 * S));
        P.push(B.capsule(M.beak, [0, peck ? 0.1 : 0.24, (peck ? 0.39 : 0.31) * S], [0, peck ? 0.06 : 0.23, (peck ? 0.46 : 0.39) * S], 0.026 * S));
        P.push(B.ellipsoid(M.wing, [0, 0.17, -0.27 * S], [0.07 * S, 0.02, 0.13 * S], 0));  // cauda
        if (!flying) {
            for (const sd of [-1, 1]) {                                                   // asas dobradas sobre o corpo
                P.push(B.ellipsoid(M.wing, [sd * 0.095 * S, 0.27, -0.03 * S], [0.06 * S, 0.06, 0.2 * S], 0));
                P.push(B.sphere(M.tip, [sd * 0.08 * S, 0.25, -0.2 * S], 0.05 * S));
            }
        } else {
            const k = { fly0: 1.0, fly1: 0.8, fly2: 0.5, fly3: 0.8 }[pose] || 1, lift = { fly0: -0.02, fly1: 0.06, fly2: 0.2, fly3: 0.06 }[pose] || 0;
            const half = sp.span / 2 * k;
            for (const sd of [-1, 1]) {
                const mx = sd * half * 0.5, tx = sd * half;
                P.push(B.capsule(M.wing, [sd * 0.09 * S, 0.24, 0.04 * S], [mx, 0.25 + lift * 0.5, -0.02 * S], 0.075 * S));
                P.push(B.ellipsoid(M.wing, [mx, 0.25 + lift * 0.5, -0.05 * S], [Math.max(0.05, half * 0.28), 0.025, 0.17 * S], sd * 0.12));
                P.push(B.capsule(M.tip, [mx, 0.25 + lift * 0.5, -0.04 * S], [tx, 0.25 + lift * 1.4, -0.14 * S], 0.05 * S));
            }
        }
        return P;
    }

    // ---------------------------------------------------------------- atlas
    constructor(game) {
        this.g = game;
        this.scene = game.scene;
        const F = Birds.FR, D = Birds.DIRS, PER = Birds.PER, SPS = Birds.SPECIES;
        const rows = SPS.length * PER + 1, W = D * F, H = rows * F;
        const data = new Uint8Array(W * H * 4);
        const poses = ['idle', 'peck', 'fly0', 'fly1', 'fly2', 'fly3'];
        const t0 = performance.now();
        SPS.forEach((sp, si) => {
            poses.forEach((pose, pi) => {
                const prims = Birds.model(sp, pose), fly = pose.startsWith('fly');
                for (let d = 0; d < D; d++) {
                    const img = SpriteBaker.bake(prims, { size: F, heading: (d * Math.PI * 2) / D, shadow: !fly, shadowLen: 0.25 });
                    const cy = (si * PER + pi) * F, cx = d * F;
                    for (let y = 0; y < F; y++) data.set(img.subarray(y * F * 4, (y + 1) * F * 4), ((cy + y) * W + cx) * 4);
                }
            });
        });
        // Última linha: blob de sombra (pixels marcados como sombra: o shader pinta translúcido).
        const sy = (rows - 1) * F;
        for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) {
            const dx = (x - F / 2 + 0.5) / 9, dy = (y - F / 2 + 0.5) / 5.5;
            if (dx * dx + dy * dy <= 1) { const o = ((sy + y) * W + x) * 4; data[o] = 255; data[o + 1] = 0; data[o + 3] = 255; }
        }
        const atlas = BABYLON.RawTexture.CreateRGBATexture(data, W, H, this.scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
        atlas.wrapU = atlas.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        this._W = W; this._H = H; this._rows = rows;

        const PW = 8 * 5, pdata = new Uint8Array(PW * SPS.length * 4);
        SPS.forEach((sp, ri) => {
            for (const slot of Object.keys(Birds.SLOT)) {
                const ramp = Pixel.ramp5(sp.pal[slot]);
                for (let lv = 0; lv < 5; lv++) {
                    const o = (ri * PW + Birds.SLOT[slot] * 5 + lv) * 4;
                    pdata[o] = ramp[lv][0]; pdata[o + 1] = ramp[lv][1]; pdata[o + 2] = ramp[lv][2]; pdata[o + 3] = 255;
                }
            }
        });
        const ptex = BABYLON.RawTexture.CreateRGBATexture(pdata, PW, SPS.length, this.scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
        ptex.wrapU = ptex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        const material = SpriteMaterial.create(this.scene, 'birds', atlas, { texture: ptex, width: PW, height: SPS.length });

        // Duas malhas dinâmicas (2 quads por ave: corpo + sombra): BAIXA = aves no chão e sombras (desenha com o resto do mundo, ABAIXO das copas);
        // ALTA = aves voando ou pousadas em poste (grupo de render 1, depois das copas das árvores, que não escrevem profundidade).
        this.cap = 56;
        const mk = (name, group) => {
            const n = this.cap * 2, pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), col = new Float32Array(n * 16);
            const idx = new Uint32Array(n * 6);
            for (let i = 0; i < n; i++) { const b = i * 4; idx.set([b + 3, b + 1, b, b + 2, b + 3, b], i * 6); }
            const mesh = new BABYLON.Mesh(name, this.scene);
            const vd = new BABYLON.VertexData();
            vd.positions = pos; vd.uvs = uv; vd.colors = col; vd.indices = idx; vd.normals = new Float32Array(n * 12);
            vd.applyToMesh(mesh, true);
            mesh.material = material;
            mesh.isPickable = false;
            mesh.alwaysSelectAsActiveMesh = true;
            mesh.doNotSyncBoundingInfo = true;
            if (group) { mesh.renderingGroupId = group; mesh.alphaIndex = 5; }
            return { mesh, pos, uv, col };
        };
        this.lo = mk('birdsLo', 0);
        this.hi = mk('birdsHi', 1);
        this.scene.setRenderingAutoClearDepthStencil(1, false);
        this.mesh = this.lo.mesh;

        // Poleiros: cabeças de postes de rua e topos dos postes da favela (WorldBuilder.perches), numa grade de 24 u.
        this.grid = new Map();
        for (const p of (game.gameEngine.world.perches || [])) {
            const key = Math.floor(p.x / 24) + ',' + Math.floor(p.z / 24);
            let c = this.grid.get(key); if (!c) this.grid.set(key, c = []);
            c.push({ x: p.x, z: p.z, y: p.y, busy: false });
        }
        this.birds = [];
        this._spawnT = 0; this._thinkT = 0;
        this.enabled = true;
        console.log(`[AVES] ${SPS.length} espécies, ${SPS.length * PER * D} sprites em ${(performance.now() - t0).toFixed(0)} ms, ${[...this.grid.values()].reduce((s, a) => s + a.length, 0)} poleiros`);
    }

    // ------------------------------------------------------------- consultas
    perchNear(x, z, r, dirx, dirz) {
        const out = [], c = Math.ceil(r / 24);
        const cx = Math.floor(x / 24), cz = Math.floor(z / 24);
        for (let i = -c; i <= c; i++) for (let j = -c; j <= c; j++) {
            const a = this.grid.get((cx + i) + ',' + (cz + j));
            if (!a) continue;
            for (const p of a) {
                if (p.busy) continue;
                const dx = p.x - x, dz = p.z - z, d = hypot(dx, dz);
                if (d < 4 || d > r) continue;
                if (dirx !== undefined && (dx * dirx + dz * dirz) / d < 0.3) continue;       // só à frente
                out.push(p);
            }
        }
        return out.length ? out[Math.floor(Math.random() * out.length)] : null;
    }

    _freeGround(x, z) {
        if (!MapGeo.isLand(x, z) || WorldMap.waterDepth(x, z) > 0) return false;
        for (const o of CityGrid.obstaclesNear(x, z)) if (o.h > 0.4 && x > o.x0 - 0.3 && x < o.x1 + 0.3 && z > o.z0 - 0.3 && z < o.z1 + 0.3) return false;
        return true;
    }

    // Que espécie combina com o lugar?
    _speciesAt(x, z) {
        const B = WorldMap.B, bio = WorldMap.biomeAt(x, z), sea = WorldMap.seaDist(x, z), r = Math.random();
        if (sea < 55 || bio === B.SAND) return r < 0.7 ? 1 : (r < 0.88 ? 0 : 2);
        if (bio === B.FAVELA) return r < 0.6 ? 0 : (r < 0.8 ? 2 : 3);
        if (bio === B.CITY || CityGrid.isInside(x, z)) return r < 0.62 ? 0 : (r < 0.8 ? 2 : (r < 0.92 ? 3 : 1));
        return r < 0.4 ? 2 : (r < 0.8 ? 3 : 0);
    }

    // Poste quebrado: o poleiro some (marcado como ocupado para sempre).
    removePerch(x, z) {
        const g = this.grid.get(Math.floor(x / 24) + ',' + Math.floor(z / 24));
        if (g) for (const p of g) if (Math.abs(p.x - x) < 0.5 && Math.abs(p.z - z) < 0.5) p.busy = true;
        for (const b of this.birds) if (b.perch && Math.abs(b.perch.x - x) < 0.5 && Math.abs(b.perch.z - z) < 0.5) this._flee(b, x, z);
    }

    // Espanta as aves num raio (tiro, explosão, buzina...).
    scare(x, z, r) {
        for (const b of this.birds) if (b.state !== 'fly' && hypot(b.x - x, b.z - z) < r) this._flee(b, x, z);
    }

    // --------------------------------------------------------------- criação
    _spawn(cx, cz) {
        if (this.birds.length >= this.cap) return false;
        for (let t = 0; t < 8; t++) {
            const a = Math.random() * Math.PI * 2, d = 28 + Math.random() * 55;
            const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
            if (!this._freeGround(x, z)) continue;
            const sp = this._speciesAt(x, z);
            const b = { sp, x, z, y: 0.3, h: Math.random() * Math.PI * 2, state: 'ground', t: 1 + Math.random() * 4, peck: 0, step: 0, walk: false, fl: 0, perch: null, target: null, fly: 0, cruise: 0, v: 0, stay: 8 + Math.random() * 25, glideT: 0, ph: Math.random() * 6 };
            if (Math.random() < 0.4) {                                                    // parte já pousada num poste
                const p = this.perchNear(x, z, 30);
                if (p) { b.state = 'perch'; b.perch = p; p.busy = true; b.x = p.x; b.z = p.z; b.y = p.y; b.stay = 10 + Math.random() * 35; }
            }
            this.birds.push(b);
            return true;
        }
        return false;
    }

    _remove(b) {
        if (b.perch) b.perch.busy = false;
        if (b.target && b.target.perch) b.target.perch.busy = false;
        const i = this.birds.indexOf(b);
        if (i >= 0) this.birds.splice(i, 1);
    }

    // ----------------------------------------------------------------- fuga
    _flee(b, tx, tz) {
        if (b.perch) { b.perch.busy = false; b.perch = null; }
        if (b.target && b.target.perch) b.target.perch.busy = false;
        b.target = null;
        const away = Math.atan2(b.x - tx, b.z - tz);
        b.h = away + (Math.random() - 0.5) * 1.0;
        b.state = 'fly';
        b.fly = 2.2 + Math.random() * 3.2;                        // tempo mínimo no ar antes de procurar onde pousar
        b.cruise = 6 + Math.random() * 5;
        b.v = 2;
        b.glideT = 0;
        b.fl = 0;
    }

    _threat(b, ctx) {
        const g = this.g;
        const fr = ctx.pr;                                       // raio de susto do jogador
        let dx = ctx.px - b.x, dz = ctx.pz - b.z;
        if (dx * dx + dz * dz < fr * fr) return [ctx.px, ctx.pz];
        const npcs = g.npcManager ? g.npcManager.npcs : null;
        if (npcs) for (let i = 0; i < npcs.length; i++) {
            const p = npcs[i].position;
            dx = p.x - b.x; dz = p.z - b.z;
            if (dx * dx + dz * dz < 20) return [p.x, p.z];
        }
        const cars = g.vehicleManager ? g.vehicleManager.vehicles : null;
        if (cars) for (let i = 0; i < cars.length; i++) {
            const c = cars[i];
            if (!c.position || !(Math.abs(c.speed || 0) > 2.5)) continue;
            dx = c.position.x - b.x; dz = c.position.z - b.z;
            if (dx * dx + dz * dz < 64) return [c.position.x, c.position.z];
        }
        return null;
    }

    // ---------------------------------------------------------------- por quadro
    update(dt) {
        if (!this.enabled) return;
        const g = this.g, tg = g.camera.target;
        const night = g.dayNight ? g.dayNight.night : 0, rain = typeof Weather !== 'undefined' && Weather.cur ? Weather.cur.k : 0;
        const target = Math.round(30 * (1 - 0.75 * night) * (1 - 0.85 * rain));

        // População em volta da câmera.
        this._spawnT -= dt;
        if (this._spawnT <= 0 && this.birds.length < target) { this._spawnT = 0.25; this._spawn(tg.x, tg.z); }
        const speed = g.mode === 'car' && g.activeCar ? Math.abs(g.activeCar.speed || 0) : (g.player && g.player.speed) || 0;
        const ctx = { px: tg.x, pz: tg.z, pr: g.mode === 'car' ? 7 + Math.min(8, speed * 0.6) : (speed > 3.2 ? 9 : (speed > 0.2 ? 6.5 : 4.2)) };

        const checkThreat = (this._thinkT -= dt) <= 0;
        if (checkThreat) this._thinkT = 0.12;

        for (let i = this.birds.length - 1; i >= 0; i--) {
            const b = this.birds[i];
            const dc = hypot(b.x - tg.x, b.z - tg.z);
            if (b.airT > 30) { this._remove(b); continue; }                                  // preso no ar (beco sem saida): some
            if (dc > 120 || (this.birds.length > target + 2 && dc > 70 && b.state !== 'fly')) { this._remove(b); continue; }
            if (checkThreat && b.state !== 'fly') {
                const th = this._threat(b, ctx);
                if (th) { this._flee(b, th[0], th[1]); }
            }
            this._step(b, dt, ctx, checkThreat);
        }
        this._render();
    }

    _step(b, dt, ctx, think) {
        const sp = Birds.SPECIES[b.sp];
        if (b.state === 'ground') {
            b.stay -= dt;
            b.t -= dt;
            if (b.peck > 0) b.peck -= dt;
            if (b.t <= 0) {
                const r = Math.random();
                if (r < 0.45) { b.peck = 0.35; b.t = 0.5 + Math.random() * 1.6; b.walk = false; }
                else if (r < 0.8) { b.walk = true; b.h += (Math.random() - 0.5) * 2.2; b.t = 0.5 + Math.random() * 1.2; }
                else { b.walk = false; b.h += (Math.random() - 0.5) * 1.5; b.t = 0.8 + Math.random() * 1.6; }
            }
            if (b.walk) {
                const nx = b.x + Math.sin(b.h) * 0.9 * dt, nz = b.z + Math.cos(b.h) * 0.9 * dt;
                if (this._freeGround(nx, nz)) { b.x = nx; b.z = nz; b.step += dt * 8; } else b.walk = false;
            }
            if (b.stay <= 0) {                                                            // enjoou do lugar: voa para outro
                this._flee(b, b.x - Math.sin(b.h), b.z - Math.cos(b.h));
                b.fly = 1.5 + Math.random() * 2;
            }
        } else if (b.state === 'perch') {
            b.stay -= dt;
            if (Math.random() < dt * 0.15) b.h += (Math.random() - 0.5) * 1.6;
            if (b.stay <= 0) { this._flee(b, b.x - Math.sin(b.h), b.z - Math.cos(b.h)); b.fly = 1.5 + Math.random() * 2; }
        } else {
            this._fly(b, dt, sp, ctx);
        }
    }

    // ---- Prédios: a ave NUNCA entra num sólido. Passa por cima se couber (teto de voo da espécie); senão, contorna.
    // Altura mínima para estar acima do sólido em (x, z) (0 se livre); `solid` = true se a ave, na altura y, estaria DENTRO dele.
    _clearance(x, z, y) {
        let need = 0, inside = false, hit = null;
        for (const o of CityGrid.obstaclesNear(x, z)) {
            if (o.h < 2.2 || (o.x1 - o.x0 < 0.8 && o.z1 - o.z0 < 0.8)) continue;        // cercas, caixotes baixos e postes finos não contam
            if (x > o.x0 - 0.5 && x < o.x1 + 0.5 && z > o.z0 - 0.5 && z < o.z1 + 0.5) {
                if (o.h + 1.4 > need) need = o.h + 1.4;
                if (y < o.h + 0.5) { inside = true; hit = o; }
            }
        }
        return { need, inside, hit };
    }

    // Sentido do giro (+1/-1) para sair da frente de uma parede: o primeiro desvio livre; o lado preferido fica fixo para não oscilar.
    _avoidTurn(b) {
        const s = b.side || (b.side = Math.random() < 0.5 ? 1 : -1);
        for (const off of [0.5 * s, -0.5 * s, 1.0 * s, -1.0 * s, 1.6 * s, -1.6 * s, 2.4 * s, -2.4 * s]) {
            if (!this._look(b, b.h + off, b.v).wall) return Math.sign(off);
        }
        return s;
    }

    _pushOut(b) {
        for (const o of CityGrid.obstaclesNear(b.x, b.z)) {
            if (o.h < 2.2 || b.x <= o.x0 - 0.5 || b.x >= o.x1 + 0.5 || b.z <= o.z0 - 0.5 || b.z >= o.z1 + 0.5) continue;
            const l = b.x - o.x0, r = o.x1 - b.x, d = b.z - o.z0, u = o.z1 - b.z, m = Math.min(l, r, d, u);
            if (m === l) b.x = o.x0 - 1; else if (m === r) b.x = o.x1 + 1; else if (m === d) b.z = o.z0 - 1; else b.z = o.z1 + 1;
            return;
        }
    }

    _ceiling(b) { return 11 + Birds.SPECIES[b.sp].S * 2; }

    // Olha à frente (3 distâncias) na direção `h`: altura necessária para passar por cima e se há prédio alto demais (intransponível).
    _look(b, h, v) {
        const ceil = this._ceiling(b);
        let need = 0, wall = false;
        for (const d of [2.5, 5.5 + v * 0.4, 10 + v * 0.8]) {
            const c = this._clearance(b.x + Math.sin(h) * d, b.z + Math.cos(h) * d, 99);
            if (c.need > need) need = c.need;
            if (c.need > ceil) wall = true;
        }
        return { need, wall };
    }

    _fly(b, dt, sp, ctx) {
        b.fl += dt;
        b.airT = (b.airT || 0) + dt;
        b.fly -= dt;
        const ceil = this._ceiling(b);
        let ty = Math.min(b.cruise, ceil), v = 6.5 + sp.S * 1.2;
        let landing = false;
        if (b.target) {
            const dx = b.target.x - b.x, dz = b.target.z - b.z, d = hypot(dx, dz);
            const want = Math.atan2(dx, dz);
            let da = want - b.h; da = Math.atan2(Math.sin(da), Math.cos(da));
            b.h += Math.max(-3.2 * dt, Math.min(3.2 * dt, da));
            landing = d < 9;
            if (landing) { ty = b.target.y + 0.15 + (d / 9) * (ty - b.target.y) * 0.6; v = Math.max(1.6, 2.2 + d * 0.5); }
            if (d < 0.5 && Math.abs(b.y - b.target.y) < 0.5) { this._land(b); return; }
            if (d < 1.2) { b.x += dx * Math.min(1, dt * 5); b.z += dz * Math.min(1, dt * 5); b.y += (b.target.y - b.y) * Math.min(1, dt * 7); return; }
        } else {
            b.h += Math.sin(b.fl * 0.8 + b.ph) * 0.35 * dt;                                // serpenteia levemente
            if (b.fly <= 0) this._seekLanding(b, ctx);
        }

        // Desvio de prédios: sobe se dá para passar por cima; se for alto demais, vira para o lado livre mais próximo.
        const look = this._look(b, b.h, b.v);
        if (look.need > ty && look.need <= ceil && !landing) ty = look.need;
        if (look.wall) {
            b.h += this._avoidTurn(b) * 2.8 * dt;
            v *= 0.6;
            if (b.target && b.target.y < 1 && this._look(b, Math.atan2(b.target.x - b.x, b.target.z - b.z), b.v).wall) { b.stuck = (b.stuck || 0) + dt; }
        }
        if (b.stuck > 3) { if (b.target && b.target.perch) b.target.perch.busy = false; b.target = null; b.fly = 1.5; b.stuck = 0; }

        b.v += (v - b.v) * Math.min(1, dt * 3);
        const nx = b.x + Math.sin(b.h) * b.v * dt, nz = b.z + Math.cos(b.h) * b.v * dt;
        const ny = b.y + Math.max(-5 * dt, Math.min(5 * dt, ty - b.y));
        // Garantia final: o passo não pode terminar dentro de um sólido (nem atravessá-lo na altura em que ele está).
        const c = this._clearance(nx, nz, ny);
        if (c.inside && !(b.target && b.target.perch && hypot(nx - b.target.x, nz - b.target.z) < 1.5)) {
            b.y += Math.max(0, Math.min(5 * dt, Math.min(c.need, ceil) - b.y));              // não anda adiante: sobe, vira e se afasta da parede
            const o = c.hit;
            if (o) {
                const qx = Math.max(o.x0, Math.min(b.x, o.x1)), qz = Math.max(o.z0, Math.min(b.z, o.z1));
                let ax = b.x - qx, az = b.z - qz, al = hypot(ax, az);
                if (al < 1e-3) { ax = b.x - (o.x0 + o.x1) / 2; az = b.z - (o.z0 + o.z1) / 2; al = hypot(ax, az) || 1; }
                b.x += (ax / al) * 3 * dt; b.z += (az / al) * 3 * dt;
                let da = Math.atan2(ax, az) - b.h; da = Math.atan2(Math.sin(da), Math.cos(da));
                b.h += Math.max(-3.5 * dt, Math.min(3.5 * dt, da));                          // vira para longe do sólido
            } else b.h += this._avoidTurn(b) * 2.8 * dt;
            b.v *= 0.5;
            b.trapped = (b.trapped || 0) + dt;
            if (b.trapped > 0.6) { this._pushOut(b); b.trapped = 0; }                    // preso dentro de um sólido (não deveria acontecer): sai pela borda mais próxima
            return;
        }
        b.trapped = 0;
        if (!look.wall) b.side = 0;
        b.x = nx; b.z = nz; b.y = ny;
        if (b.y > ceil + 3) b.y = ceil + 3;
    }

    // Escolhe onde pousar: poste à frente (preferência) ou um pedaço de chão livre, longe do jogador.
    _seekLanding(b, ctx) {
        const dirx = Math.sin(b.h), dirz = Math.cos(b.h);
        let p = Math.random() < 0.55 ? this.perchNear(b.x, b.z, 38, dirx, dirz) : null;
        if (p && hypot(p.x - ctx.px, p.z - ctx.pz) < ctx.pr + 3) p = null;
        if (p) { p.busy = true; b.target = { x: p.x, z: p.z, y: p.y, perch: p }; return; }
        for (let t = 0; t < 10; t++) {
            const a = b.h + (Math.random() - 0.5) * 1.3, d = 10 + Math.random() * 22;
            const x = b.x + Math.sin(a) * d, z = b.z + Math.cos(a) * d;
            if (!this._freeGround(x, z) || hypot(x - ctx.px, z - ctx.pz) < ctx.pr + 4) continue;
            b.target = { x, z, y: 0.3, perch: null };
            return;
        }
        b.fly = 0.8;                                                                       // sem lugar bom: voa mais um pouco
    }

    _land(b) {
        const t = b.target;
        b.x = t.x; b.z = t.z; b.y = t.y; b.v = 0;
        if (t.perch) { b.state = 'perch'; b.perch = t.perch; b.stay = 12 + Math.random() * 35; }
        else { b.state = 'ground'; b.stay = 8 + Math.random() * 25; }
        b.target = null;
        b.airT = 0;
        b.t = 0.4 + Math.random();
        b.walk = false;
        b.peck = 0;
    }

    // --------------------------------------------------------------- desenho
    _render() {
        const L = this.lo, Hh = this.hi, F = Birds.FR, D = Birds.DIRS, PER = Birds.PER, W = this._W, H = this._H, ppu = Config.art.ppu;
        const sun = Config.light.sunDir, sk = 0.3 / Math.max(0.2, Math.abs(sun[1]));
        const half = F / ppu / 2;
        const shadowRow = this._rows - 1;
        let nl = 0, nh = 0;
        L.pos.fill(0); Hh.pos.fill(0);
        for (const b of this.birds) {
            const sp = Birds.SPECIES[b.sp];
            const dir = ((Math.round(b.h / (Math.PI * 2) * D) % D) + D) % D;
            let fr;
            if (b.state === 'fly') {
                let k;
                if (sp.glide) { const c = b.fl % 3.2; k = c < 1.3 ? 2 + (Math.floor(b.fl * 7) % 4) : 2; }       // gaivota: bate asa e plana
                else k = 2 + (Math.floor((b.fl + b.ph) * 14) % 4);
                if (b.target && b.y < (b.target.y + 1.5)) k = 2 + (Math.floor(b.fl * 20) % 4);                  // pousando: bate asa rápido
                fr = k;
            } else fr = b.state === 'ground' && (b.peck > 0 || (b.walk && Math.floor(b.step) % 2 === 1)) ? 1 : 0;
            const row = b.sp * PER + fr;
            const u0 = (dir * F) / W, v0 = (row * F) / H, u1 = u0 + F / W, v1 = v0 + F / H;
            // Sombra no chão (voo): deslocada pela luz, maior e mais fraca quanto mais alto.
            if (b.state === 'fly' || b.y > 1) {
                const s = half * sp.S * (0.9 - Math.min(0.35, b.y * 0.03));
                const sx = b.x + sun[0] * sk * b.y, sz = b.z + sun[2] * sk * b.y;
                const sv0 = (shadowRow * F) / H;
                this._quad(L.pos, L.uv, L.col, nl++, sx, 0.27, sz, s, 0, sv0, F / W, sv0 + F / H, 0, 1);
            }
            if (b.state === 'ground') this._quad(L.pos, L.uv, L.col, nl++, b.x, 0.3, b.z, half, u0, v0, u1, v1, b.sp, 1);
            else this._quad(Hh.pos, Hh.uv, Hh.col, nh++, b.x, b.y, b.z, half, u0, v0, u1, v1, b.sp, 1);
        }
        for (const m of [L, Hh]) {
            m.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, m.pos);
            m.mesh.updateVerticesData(BABYLON.VertexBuffer.UVKind, m.uv);
            m.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, m.col);
        }
    }

    _quad(P, UV, C, i, x, y, z, h, u0, v0, u1, v1, variant, shade) {
        const o = i * 12;
        P[o] = x - h; P[o + 1] = y; P[o + 2] = z + h;
        P[o + 3] = x + h; P[o + 4] = y; P[o + 5] = z + h;
        P[o + 6] = x - h; P[o + 7] = y; P[o + 8] = z - h;
        P[o + 9] = x + h; P[o + 10] = y; P[o + 11] = z - h;
        const q = i * 8;
        UV[q] = u0; UV[q + 1] = v0; UV[q + 2] = u1; UV[q + 3] = v0; UV[q + 4] = u0; UV[q + 5] = v1; UV[q + 6] = u1; UV[q + 7] = v1;
        const c = i * 16;
        for (let k = 0; k < 4; k++) { C[c + k * 4] = variant; C[c + k * 4 + 1] = shade; C[c + k * 4 + 2] = 0; C[c + k * 4 + 3] = 1; }
    }
}
memoStatics(Birds, 'SPECIES', 'SLOT');
