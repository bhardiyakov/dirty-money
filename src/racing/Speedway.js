// ============================================================================
// Speedway — o AUTÓDROMO (oval de corrida fechada, estilo NASCAR) no campo ao sul da cidade: o palco das corridas de estádio do
// StreetRacing. Um oval de duas retas e duas curvas de 180°, asfalto com as faixas brancas e a linha de chegada quadriculada, muro
// externo de concreto com as faixas dos patrocinadores, muro interno (o do gramado), arquibancada coberta com a torcida ao longo da
// reta principal, torres de iluminação (acesas à noite) e o nome do autódromo pintado no gramado.
//
//   build()        (CityGrid.finish, antes da limpeza de vegetação) escolhe o lugar (SITES: o 1º que estiver livre — terra firme,
//                  sem paredão, sem rua, sem construção), registra no mapa (POI 'speedway') e os sólidos para quem anda a pé.
//   init(game)     malhas e os muros na física (Havok: caixas giradas ao longo das curvas), quando a física estiver pronta.
//   at(s, lat)     ponto da pista a `s` m da largada (volta inteira = L), deslocado `lat` m para a ESQUERDA de quem corre (+ = para
//                  dentro: as curvas são todas para a esquerda, como no oval de verdade) → { x, z, tx, tz }.
//   gridSlot(i)    vaga i do grid de largada (fila dupla atrás da linha de chegada).
//   covers(x, z)   o ponto está no terreno do autódromo? (TerrainBuilder/CityGrid não plantam mato aqui)
//
// Frame local: o eixo comprido do oval é o z do mundo (u = z − cz), o transversal é o x (v = x − cx). Sentido de corrida: anti-horário
// visto de cima (sobe pela reta leste — a da arquibancada —, curva norte, desce pela reta oeste, curva sul).
// ============================================================================

const Speedway = {
    NAME: 'Autódromo Arena Sul',
    SITES: [{ x: -360, z: -600 }, { x: -920, z: 490 }],
    S: 130,                // comprimento de cada reta (m)
    R: 38,                 // raio da curva no eixo da pista (m)
    W: 15,                 // largura da pista (m)
    WALL: 0.8,             // espessura dos muros (m)
    site: null,
    built: false,

    get L() { return 2 * this.S + 2 * Math.PI * this.R; },                    // comprimento da volta no eixo
    get outerR() { return this.R + this.W / 2 + 0.6; },                      // face de dentro do muro externo (a partir do eixo de cada curva)
    get innerR() { return this.R - this.W / 2 - 0.6; },

    // ---------------------------------------------------------------- lugar
    build() {
        if (this.site) return;
        const half = { u: this.S / 2 + this.outerR + 6, v: this.outerR + 18 };      // (18: arquibancada a leste)
        for (const c of this.SITES) {
            const box = { x0: c.x - this.outerR - 6, x1: c.x + half.v, z0: c.z - half.u, z1: c.z + half.u };
            if (!this._free(box)) continue;
            this.site = { cx: c.x, cz: c.z, box };
            break;
        }
        if (!this.site) { console.warn('[AUTÓDROMO] nenhum lugar livre — sem corridas de estádio'); return; }
        const S = this.site;
        S.start = this.at(this.S / 2, 0);                                        // linha de chegada: meio da reta leste
        S.gate = this.local(this.S / 2 + 16, this.R + this.W / 2 + 7);             // portão: fora do muro, na ponta norte da arquibancada
        CityGrid.addPoi({ type: 'speedway', name: this.NAME, x: S.gate.x, z: S.gate.z });
        CityGrid.addObstacles(this._footSolids());
        console.log(`[AUTÓDROMO] ${this.NAME} em (${S.cx}, ${S.cz}) · volta de ${this.L.toFixed(0)} m`);
    },
    _free(b) {
        const B = WorldMap.B, ok = [B.GRASS, B.FARM, B.SCRUB, B.FOREST];
        for (let x = b.x0; x <= b.x1; x += 8) for (let z = b.z0; z <= b.z1; z += 8) {
            const k = WorldMap.index(x, z);
            if (k < 0 || !WorldMap.land[k] || (WorldMap.flags[k] & 1) || !ok.includes(WorldMap.biome[k])) return false;
            if (RoadPlan.onPavement(x, z, 2)) return false;
        }
        const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
        return !CityGrid.obstaclesAround(cx, cz, Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2).some((o) => o.x1 > b.x0 && o.x0 < b.x1 && o.z1 > b.z0 && o.z0 < b.z1);
    },
    covers(x, z, m = 0) { const b = this.site && this.site.box; return !!b && x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m; },
    // Ponto do frame local (u ao longo, v transversal) no mundo.
    local(u, v) { return { x: this.site.cx + v, z: this.site.cz + u }; },

    // ---------------------------------------------------------------- a pista
    // Eixo da pista: reta leste (s 0..S, subindo), curva norte (S..S+πR), reta oeste (descendo), curva sul. lat > 0 = esquerda.
    at(s, lat = 0, out = {}) {
        const S = this.S, R = this.R, A = Math.PI * R, L = this.L;
        s = ((s % L) + L) % L;
        let u, v, tu, tv;
        if (s < S) { u = -S / 2 + s; v = R; tu = 1; tv = 0; }
        else if (s < S + A) { const t = (s - S) / R; u = S / 2 + R * Math.sin(t); v = R * Math.cos(t); tu = Math.cos(t); tv = -Math.sin(t); }
        else if (s < 2 * S + A) { u = S / 2 - (s - S - A); v = -R; tu = -1; tv = 0; }
        else { const t = (s - 2 * S - A) / R; u = -S / 2 - R * Math.sin(t); v = -R * Math.cos(t); tu = -Math.cos(t); tv = Math.sin(t); }
        // esquerda de quem anda (tx, tz) = (−tz, tx); no frame local, x = v e z = u
        const tx = tv, tz = tu;
        out.x = this.site.cx + v - tz * lat; out.z = this.site.cz + u + tx * lat; out.tx = tx; out.tz = tz;
        return out;
    },
    // s (distância na volta) do ponto mais próximo do eixo — e a distância lateral até ele (+ = esquerda/dentro).
    project(x, z) {
        const S = this.S, R = this.R, A = Math.PI * R, u = z - this.site.cz, v = x - this.site.cx;
        let s, lat;
        if (u >= -S / 2 && u <= S / 2) {
            if (v >= 0) { s = u + S / 2; lat = R - v; }
            else { s = S + A + (S / 2 - u); lat = v + R; }
        } else if (u > S / 2) {
            const a = Math.atan2(u - S / 2, v); s = S + Math.max(0, Math.min(A, a * R)); lat = R - Math.hypot(u - S / 2, v);
        } else {
            const a = Math.atan2(-(u + S / 2), -v); s = 2 * S + A + Math.max(0, Math.min(A, a * R)); lat = R - Math.hypot(u + S / 2, v);
        }
        return { s, lat };
    },
    // Vaga i do grid: fila dupla atrás da linha de chegada (a pole à direita, por fora).
    gridSlot(i) {
        const s = this.S / 2 - 9 - Math.floor(i / 2) * 9, p = this.at(s, i % 2 ? 3.4 : -3.4);
        return { x: p.x, z: p.z, h: Math.atan2(p.tx, p.tz) };
    },
    // Raio da curva do eixo em s (Infinity nas retas) — o piloto da IA freia por ele.
    radiusAt(s) { const S = this.S, A = Math.PI * this.R, L = this.L; s = ((s % L) + L) % L; return (s < S || (s >= S + A && s < 2 * S + A)) ? Infinity : this.R; },

    // ---------------------------------------------------------------- sólidos
    // Para quem anda a pé (CityGrid.blockedAt; a física dos carros usa os muros girados de init): retângulos curtos ao longo dos muros.
    _footSolids() {
        const out = [], seg = (a, b, h) => out.push({ x0: Math.min(a.x, b.x) - 0.4, z0: Math.min(a.z, b.z) - 0.4, x1: Math.max(a.x, b.x) + 0.4, z1: Math.max(a.z, b.z) + 0.4, h });
        const wall = (lat, h) => { let p = this.at(0, lat); for (let s = 3; s <= this.L + 0.1; s += 3) { const q = this.at(s, lat); seg(p, q, h); p = q; } };
        wall(-(this.W / 2 + 0.6 + this.WALL / 2), 1.3);
        wall(this.W / 2 + 0.6 + this.WALL / 2, 1.0);
        const a = this.local(-this.S / 2, this.R + this.W / 2 + 2.2), b = this.local(this.S / 2, this.R + this.W / 2 + 15);
        out.push({ x0: a.x, z0: a.z, x1: b.x, z1: b.z, h: 6 });                   // arquibancada
        return out;
    },
    // Muros na física: caixas estáticas giradas, uma por trecho (as retas inteiras; nas curvas, de 6 em 6°).
    _physics(game) {
        if (this._phys || !game.physicsReady || !game.physics) return;
        this._phys = [];
        const P = game.physics, sc = game.scene;
        const box = (a, b, lat, h, th) => {
            const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, len = Math.hypot(b.x - a.x, b.z - a.z) + 0.5;
            const node = new BABYLON.TransformNode('speedwayWall' + this._phys.length, sc);
            node.position.set(mx, h / 2, mz); node.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
            this._phys.push(P.addStaticBox(node, new BABYLON.Vector3(th, h, len)));
        };
        for (const [lat, h] of [[-(this.W / 2 + 0.6 + this.WALL / 2), 2.4], [this.W / 2 + 0.6 + this.WALL / 2, 2.0]]) {
            const S = this.S, A = Math.PI * this.R, marks = [0, S, S + A, 2 * S + A, this.L];
            for (let k = 0; k < 4; k++) {
                const s0 = marks[k], s1 = marks[k + 1], straight = k % 2 === 0, n = straight ? 1 : 30;
                for (let i = 0; i < n; i++) box(this.at(s0 + (s1 - s0) * i / n, lat), this.at(s0 + (s1 - s0) * (i + 1) / n, lat), lat, h, this.WALL);
            }
        }
    },

    // ---------------------------------------------------------------- desenho
    init(game) {
        if (!this.site) return;
        this._physics(game);
        if (this.built) return;
        this.built = true;
        const sc = game.scene;
        this._geo = {};
        this._track(); this._walls(); this._stands(); this._towers();
        const mat = (name, opts = {}) => {
            const m = new BABYLON.StandardMaterial('speedway_' + name, sc);
            m.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
            if (opts.tex) { m.diffuseTexture = opts.tex; }
            if (opts.emit) m.emissiveColor = new BABYLON.Color3(opts.emit, opts.emit, opts.emit);
            return m;
        };
        this.meshes = [];
        for (const [name, G] of Object.entries(this._geo)) {
            if (!G.idx.length) continue;
            const m = new BABYLON.Mesh('speedway_' + name, sc), vd = new BABYLON.VertexData();
            vd.positions = G.pos; vd.normals = G.nor; vd.colors = G.col; vd.indices = G.idx; if (G.uv.length) vd.uvs = G.uv;
            vd.applyToMesh(m, false);
            m.material = mat(name, { tex: name === 'logo' ? this._logoTex(sc) : name === 'crowd' ? this._crowdTex(sc) : name === 'checker' ? this._checkerTex(sc) : null, emit: name === 'logo' || name === 'checker' ? 0.15 : 0 });
            if (name === 'logo' || name === 'checker') { m.material.diffuseTexture.hasAlpha = true; m.material.useAlphaFromDiffuseTexture = true; m.material.backFaceCulling = false; }      // (o quad do logo sai virado para baixo: as duas faces)
            m.isPickable = false; m.freezeWorldMatrix(); m.receiveShadows = true;
            this.meshes.push(m);
        }
        this._geo = null;
        // luzes das torres (acesas à noite)
        this.glow = new GlowBatch(sc, this.lamps.length + 2, 'speedwayLamps', 'glow');
        for (let i = 0; i < this.lamps.length; i++) this.glow.alloc();
    },
    // Torres acesas à noite (e nas corridas noturnas, mais fortes). Chamado pelo StreetRacing.
    update(game) {
        if (!this.glow) return;
        const n = game.dayNight ? game.dayNight.night : 0, f = game.camera.target, near = Math.hypot(f.x - this.site.cx, f.z - this.site.cz) < 260;
        this.lamps.forEach((L, i) => { if (n > 0.2 && near) { this.glow.place(i, L.x, L.y, L.z, 9); this.glow.color(i, 1, 0.96, 0.85, 0.75 * n); } else this.glow.off(i); });
        this.glow.flush();
    },

    // Acumuladores de geometria (um por material): posição, normal, cor (rgba), uv e índices.
    _g(name) { return this._geo[name] || (this._geo[name] = { pos: [], nor: [], col: [], uv: [], idx: [] }); },
    _quad(name, a, b, c, d, col, n = [0, 1, 0], uv = null) {           // a b (frente) c d (atrás), anti-horário visto de onde a normal aponta
        const G = this._g(name), i = G.pos.length / 3;
        for (const p of [a, b, c, d]) { G.pos.push(p[0], p[1], p[2]); G.nor.push(n[0], n[1], n[2]); G.col.push(col[0], col[1], col[2], 1); }
        if (uv) G.uv.push(...uv); else if (G.uv.length) G.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
        G.idx.push(i, i + 2, i + 1, i, i + 3, i + 2);
    },
    // Faixa ao longo da pista entre lat0 e lat1, na altura y, de s0 a s1 (passo ds); col(s) = cor.
    _ribbon(name, lat0, lat1, y, s0, s1, ds, col) {
        for (let s = s0; s < s1 - 1e-6; s += ds) {
            const e = Math.min(s1, s + ds), A = this.at(s, lat0), B = this.at(s, lat1), C = this.at(e, lat1), D = this.at(e, lat0), c = col(s);
            this._quad(name, [A.x, y, A.z], [B.x, y, B.z], [C.x, y, C.z], [D.x, y, D.z], c);
        }
    },
    // Muro ao longo da pista (face de dentro em `lat`, espessura th para fora — sinal de `side`), de y0 a y1.
    _wallStrip(name, lat, side, th, y0, y1, col) {
        const ds = 3;
        for (let s = 0; s < this.L - 1e-6; s += ds) {
            const e = Math.min(this.L, s + ds), a = this.at(s, lat), b = this.at(e, lat), ao = this.at(s, lat + side * th), bo = this.at(e, lat + side * th);
            const c = col(s), nx = -(b.z - a.z), nz = b.x - a.x, nl = Math.hypot(nx, nz) || 1, n = [nx / nl * -side, 0, nz / nl * -side];
            this._quad(name, [a.x, y1, a.z], [b.x, y1, b.z], [b.x, y0, b.z], [a.x, y0, a.z], c, n);                       // face da pista
            this._quad(name, [ao.x, y1, ao.z], [bo.x, y1, bo.z], [b.x, y1, b.z], [a.x, y1, a.z], [c[0] * 0.92, c[1] * 0.92, c[2] * 0.92]);     // topo
            this._quad(name, [bo.x, y1, bo.z], [ao.x, y1, ao.z], [ao.x, y0, ao.z], [bo.x, y0, bo.z], [c[0] * 0.8, c[1] * 0.8, c[2] * 0.8], [-n[0], 0, -n[2]]);
        }
    },
    _track() {
        const W = this.W, y = 0.06, L = this.L;
        const asphalt = (s) => { const k = 0.2 + 0.02 * Math.sin(s * 0.7) + 0.015 * Math.sin(s * 2.3); return [k, k * 1.02, k * 1.08]; };
        this._ribbon('track', -W / 2 - 0.6, W / 2 + 0.6, y, 0, L, 2, asphalt);
        this._ribbon('track', W / 2 + 0.6, W / 2 + 3.2, y - 0.01, 0, L, 3, () => [0.33, 0.34, 0.36]);              // faixa de escape (dentro)
        this._ribbon('track', -W / 2 - 4.2, -W / 2 - 1.4, y - 0.01, 0, L, 3, () => [0.36, 0.37, 0.39]);             // (fora, atrás do muro: o calçamento)
        this._ribbon('track', -W / 2 + 0.25, -W / 2 + 0.55, y + 0.01, 0, L, 2, () => [0.92, 0.92, 0.9]);            // faixa branca de fora
        this._ribbon('track', W / 2 - 0.55, W / 2 - 0.25, y + 0.01, 0, L, 2, () => [0.92, 0.92, 0.9]);              // de dentro
        this._ribbon('track', W / 2 + 0.6, W / 2 + 1.6, y + 0.012, this.S, this.S + Math.PI * this.R, 1.5, (s) => (Math.floor(s / 1.5) % 2 ? [0.9, 0.12, 0.1] : [0.95, 0.95, 0.95]));     // zebras nas curvas
        this._ribbon('track', W / 2 + 0.6, W / 2 + 1.6, y + 0.012, 2 * this.S + Math.PI * this.R, L, 1.5, (s) => (Math.floor(s / 1.5) % 2 ? [0.9, 0.12, 0.1] : [0.95, 0.95, 0.95]));
        // linha de chegada (quadriculada, textura) e as marcas do grid
        const s0 = this.S / 2, A = this.at(s0 - 1.2, -W / 2), B = this.at(s0 - 1.2, W / 2), C = this.at(s0 + 1.2, W / 2), D = this.at(s0 + 1.2, -W / 2);
        this._quad('checker', [A.x, y + 0.015, A.z], [B.x, y + 0.015, B.z], [C.x, y + 0.015, C.z], [D.x, y + 0.015, D.z], [1, 1, 1], [0, 1, 0], [0, 0, 6, 0, 6, 1, 0, 1]);
        for (let i = 0; i < 8; i++) {
            const g = this.gridSlot(i), sg = this.project(g.x, g.z).s, lat = i % 2 ? 3.4 : -3.4;
            this._ribbon('track', lat - 1.3, lat + 1.3, y + 0.012, sg + 2.6, sg + 2.9, 0.3, () => [0.95, 0.95, 0.95]);
        }
        // nome no gramado (textura)
        // (textura 2:1: a largura da textura corre ao longo das retas, de sul a norte — o nome se lê de baixo para cima, como numa
        // pista de verdade; o quad tem a mesma proporção para as letras não esticarem)
        const c = this.local(0, 0), hw = this.R - W / 2 - 8, hl = Math.min(this.S / 2 + 4, hw * 2);
        this._quad('logo', [c.x + hw, 0.05, c.z - hl], [c.x + hw, 0.05, c.z + hl], [c.x - hw, 0.05, c.z + hl], [c.x - hw, 0.05, c.z - hl], [1, 1, 1], [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1]);
    },
    _walls() {
        const W = this.W;
        // externo: concreto branco com a faixa vermelha no topo e as placas de patrocínio (blocos azul/amarelo/verde a cada 24 m)
        const spons = [[0.12, 0.3, 0.75], [0.95, 0.75, 0.1], [0.1, 0.55, 0.3], [0.85, 0.15, 0.15], [0.55, 0.2, 0.75]];
        this._wallStrip('walls', -(W / 2 + 0.6), -1, this.WALL, 0, 0.9, (s) => (Math.floor(s / 12) % 2 ? spons[Math.floor(s / 24) % spons.length] : [0.9, 0.9, 0.88]));
        this._wallStrip('walls', -(W / 2 + 0.6), -1, this.WALL, 0.9, 1.3, () => [0.85, 0.12, 0.1]);
        // grade de proteção (alambrado) por cima do externo: um painel escuro, fino
        this._wallStrip('walls', -(W / 2 + 0.6) - this.WALL + 0.05, -1, 0.06, 1.3, 3.4, () => [0.25, 0.27, 0.3]);
        // interno: mureta cinza com faixa amarela
        this._wallStrip('walls', W / 2 + 0.6, 1, this.WALL, 0, 0.75, () => [0.72, 0.72, 0.7]);
        this._wallStrip('walls', W / 2 + 0.6, 1, this.WALL, 0.75, 1.0, () => [0.95, 0.8, 0.1]);
    },
    // Arquibancada coberta ao longo da reta leste (fora do muro): degraus com a torcida (textura), estrutura e a cobertura.
    _stands() {
        const v0 = this.R + this.W / 2 + 2.4, u0 = -this.S / 2 + 4, u1 = this.S / 2 - 4, N = 9, step = 1.25, rise = 0.65;
        for (let k = 0; k < N; k++) {
            const va = v0 + k * step, vb = va + step, ya = 0.5 + k * rise, yb = ya + rise;
            const a = this.local(u0, va), b = this.local(u1, va), c = this.local(u1, vb), d = this.local(u0, vb);
            this._quad('crowd', [a.x, yb, a.z], [b.x, yb, b.z], [c.x, yb, c.z], [d.x, yb, d.z], [1, 1, 1], [0, 1, 0], [0, k / N, 8, k / N, 8, (k + 1) / N, 0, (k + 1) / N]);
            // espelho do degrau (concreto)
            this._quad('stands', [a.x, ya, a.z], [b.x, ya, b.z], [b.x, yb, b.z], [a.x, yb, a.z], [0.62, 0.62, 0.6], [-1, 0, 0]);
        }
        const vb = v0 + N * step, top = 0.5 + N * rise;
        const A = this.local(u0, vb), B = this.local(u1, vb), A0 = this.local(u0, v0), B0 = this.local(u1, v0);
        this._quad('stands', [B.x, 0, B.z], [A.x, 0, A.z], [A.x, top + 4.5, A.z], [B.x, top + 4.5, B.z], [0.48, 0.5, 0.55], [1, 0, 0]);          // costas
        for (const [u, uu] of [[u0, u0], [u1, u1]]) {                                                                                          // laterais
            const p = this.local(u, v0), q = this.local(uu, vb);
            this._quad('stands', [p.x, 0, p.z], [q.x, 0, q.z], [q.x, top, q.z], [p.x, 0.5, p.z], [0.55, 0.56, 0.6], [0, 0, u === u0 ? -1 : 1]);
        }
        // cobertura (laje fina inclinada, vermelha) só sobre as fileiras de trás — a câmera de cima ainda vê a torcida — e os pilares
        const R0 = this.local(u0, v0 + (N - 4) * step), R1 = this.local(u1, v0 + (N - 4) * step);
        this._quad('roof', [R0.x, top + 4.2, R0.z], [R1.x, top + 4.2, R1.z], [B.x, top + 4.8, B.z], [A.x, top + 4.8, A.z], [0.78, 0.2, 0.12]);
        this._quad('roof', [A.x, top + 4.6, A.z], [B.x, top + 4.6, B.z], [R1.x, top + 4.0, R1.z], [R0.x, top + 4.0, R0.z], [0.3, 0.3, 0.33], [0, -1, 0]);
        for (let u = u0; u <= u1 + 0.1; u += (u1 - u0) / 6) {
            const p = this.local(u, vb - 0.4);
            this._box('stands', p.x, p.z, 0.5, 0.5, 0, top + 4.6, [0.4, 0.42, 0.46]);
        }
        // placar na ponta sul da arquibancada
        const sb = this.local(u0 - 3, v0 + 6);
        this._box('stands', sb.x, sb.z, 1.2, 0.6, 0, 7, [0.25, 0.25, 0.28]);
        this._box('stands', sb.x, sb.z, 6, 0.5, 7, 10.5, [0.08, 0.08, 0.1]);
        this._quad('stands', [sb.x - 2.8, 7.3, sb.z - 0.27], [sb.x + 2.8, 7.3, sb.z - 0.27], [sb.x + 2.8, 10.2, sb.z - 0.27], [sb.x - 2.8, 10.2, sb.z - 0.27], [0.95, 0.55, 0.1], [0, 0, -1]);
    },
    // Torres de iluminação nas 4 pontas do oval (as lâmpadas acendem à noite: update).
    _towers() {
        this.lamps = [];
        const r = this.outerR + 6;
        for (const [u, sv] of [[this.S / 2, 1], [this.S / 2, -1], [-this.S / 2, 1], [-this.S / 2, -1]]) {
            const p = this.local(u + Math.sign(u) * r * 0.62, sv * r * 0.78);
            this._box('stands', p.x, p.z, 0.6, 0.6, 0, 22, [0.5, 0.52, 0.56]);
            this._box('stands', p.x, p.z, 3.2, 1.0, 22, 24, [0.2, 0.2, 0.22]);
            this.lamps.push({ x: p.x, y: 23, z: p.z });
        }
    },
    _box(name, x, z, w, d, y0, y1, col) {
        const a = [x - w / 2, z - d / 2], b = [x + w / 2, z - d / 2], c = [x + w / 2, z + d / 2], e = [x - w / 2, z + d / 2];
        this._quad(name, [a[0], y1, a[1]], [b[0], y1, b[1]], [c[0], y1, c[1]], [e[0], y1, e[1]], col);
        const side = (p, q, n) => this._quad(name, [p[0], y1, p[1]], [q[0], y1, q[1]], [q[0], y0, q[1]], [p[0], y0, p[1]], [col[0] * 0.85, col[1] * 0.85, col[2] * 0.85], n);
        side(b, a, [0, 0, -1]); side(c, b, [1, 0, 0]); side(e, c, [0, 0, 1]); side(a, e, [-1, 0, 0]);
    },

    // ---------------------------------------------------------------- texturas
    _logoTex(sc) {
        const t = new BABYLON.DynamicTexture('speedwayLogo', { width: 1024, height: 512 }, sc, true), c = t.getContext();
        c.clearRect(0, 0, 1024, 512);
        c.save(); c.translate(512, 256);
        c.font = '900 120px Arial Black, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineWidth = 14; c.lineJoin = 'round'; c.strokeStyle = 'rgba(20,20,24,0.65)'; c.fillStyle = 'rgba(245,245,240,0.82)';
        c.strokeText('ARENA', 0, -80); c.fillText('ARENA', 0, -80);
        c.font = '900 92px Arial Black, Arial, sans-serif'; c.fillStyle = 'rgba(230,40,30,0.85)';
        c.strokeText('SPEEDWAY', 0, 70); c.fillText('SPEEDWAY', 0, 70);
        c.restore();
        t.update();
        return t;
    },
    _crowdTex(sc) {
        const W = 512, H = 72, t = new BABYLON.DynamicTexture('speedwayCrowd', { width: W, height: H }, sc, true), c = t.getContext();
        const seats = ['#2f5fb8', '#c8302a', '#e7c22a'];
        for (let y = 0; y < H; y += 8) { c.fillStyle = seats[(y / 8) % 3]; c.fillRect(0, y, W, 8); }
        const shirts = ['#f2f2f2', '#d93a2f', '#2f64c8', '#f2c92a', '#2fa04a', '#1d1d22', '#e86ab0', '#ff8a1e'];
        let r = 7;
        const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < 2600; i++) { if (rnd() < 0.18) continue; c.fillStyle = shirts[Math.floor(rnd() * shirts.length)]; const x = rnd() * W, y = Math.floor(rnd() * 9) * 8 + 2; c.fillRect(x, y, 3, 4); c.fillStyle = '#c99a72'; c.fillRect(x + 0.5, y - 2, 2, 2); }
        t.update();
        t.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
        return t;
    },
    _checkerTex(sc) {
        const t = new BABYLON.DynamicTexture('speedwayChecker', { width: 64, height: 16 }, sc, true), c = t.getContext();
        for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { c.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4'; c.fillRect(i * 4, j * 4, 4, 4); }
        t.update();
        t.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
        t.updateSamplingMode(BABYLON.Texture.NEAREST_SAMPLINGMODE);
        return t;
    },

    // ---------------------------------------------------------------- mapa (MapRenderer.drawView)
    drawMap(ctx, X, Y, k, vis) {
        const S = this.site;
        if (!S || !vis(S.box.x0, S.box.z0, S.box.x1, S.box.z1)) return;
        const ring = (lat) => { ctx.beginPath(); for (let s = 0; s <= this.L + 0.1; s += 4) { const p = this.at(s, lat); if (s) ctx.lineTo(X(p.x), Y(p.z)); else ctx.moveTo(X(p.x), Y(p.z)); } ctx.closePath(); };
        ctx.save();
        ring(-this.W / 2 - 1.4); ctx.fillStyle = '#9a9ca0'; ctx.fill();
        ring(-this.W / 2 - 0.6); ctx.fillStyle = '#34363b'; ctx.fill();
        ring(this.W / 2 + 0.6); ctx.fillStyle = '#7fae55'; ctx.fill();
        const a = this.local(-this.S / 2 + 4, this.R + this.W / 2 + 2.4), b = this.local(this.S / 2 - 4, this.R + this.W / 2 + 13.6);
        ctx.fillStyle = '#c8302a'; ctx.fillRect(X(a.x), Y(b.z), (b.x - a.x) * k, (b.z - a.z) * k);
        const f0 = this.at(this.S / 2, -this.W / 2), f1 = this.at(this.S / 2, this.W / 2);
        ctx.strokeStyle = '#f4f4f4'; ctx.lineWidth = Math.max(1, 1.2 * k); ctx.beginPath(); ctx.moveTo(X(f0.x), Y(f0.z)); ctx.lineTo(X(f1.x), Y(f1.z)); ctx.stroke();
        ctx.restore();
    },
};
