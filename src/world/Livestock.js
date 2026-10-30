// ============================================================================
// Livestock — os BICHOS da roça: vaca, cavalo, porco, galinha e cabra, como sprites pixel art (o mesmo SpriteBaker do resto do jogo,
// assados com a câmera inclinada dos personagens). Cada bicho vive no seu cercado (Bairros.pens: pasto, curral, chiqueiro, terreiro):
// fica parado, pasta (cabeça baixa), anda devagar para outro canto e se espanta quando o jogador (ou um carro) chega perto — a galinha
// sai correndo e batendo asa, a vaca só se afasta. Só existem perto da câmera (os cercados longe não custam nada). Uma malha só.
// Atlas: colunas = 8 direções, linhas = espécie × 4 quadros (parado, pastando, passo 1, passo 2); cor por variante (paleta).
// ============================================================================

class Livestock {
    static get SPECIES() {
        // S: escala | v: passo (u/s) | fear: raio de susto | run: multiplicador na fuga
        return {
            vaca:    { row: 0, v: 0.55, fear: 4.5, run: 2.6 },
            cavalo:  { row: 1, v: 0.8,  fear: 6.0, run: 4.2 },
            porco:   { row: 2, v: 0.6,  fear: 3.5, run: 3.0 },
            galinha: { row: 3, v: 0.7,  fear: 3.2, run: 4.6 },
            cabra:   { row: 4, v: 0.7,  fear: 4.0, run: 3.4 },
        };
    }
    static get VARIANTS() {
        return [
            { sp: 'vaca', pal: { body: '#f2efe8', spot: '#2a2622', dark: '#2a2622', light: '#e8b4a8', accent: '#d8d0c0', eye: '#141414' } },      // malhada
            { sp: 'vaca', pal: { body: '#b07a48', spot: '#f0e6d8', dark: '#4a3020', light: '#e0b8a0', accent: '#e8e0d0', eye: '#141414' } },      // caramelo
            { sp: 'vaca', pal: { body: '#e8e2d2', spot: '#e8e2d2', dark: '#5a5048', light: '#d8b0a0', accent: '#f0ece0', eye: '#141414' } },      // nelore
            { sp: 'cavalo', pal: { body: '#7a4a2a', spot: '#f2ead8', dark: '#2a1a12', light: '#9a6a48', accent: '#3a2a20', eye: '#101010' } },    // alazão
            { sp: 'cavalo', pal: { body: '#c8c4bc', spot: '#8a8680', dark: '#3a3a3a', light: '#e8e4dc', accent: '#5a5a5a', eye: '#101010' } },    // tordilho
            { sp: 'cavalo', pal: { body: '#2e2622', spot: '#f2ead8', dark: '#141010', light: '#4a3e36', accent: '#1a1412', eye: '#101010' } },    // preto
            { sp: 'porco', pal: { body: '#e8a8a0', spot: '#c88880', dark: '#a87068', light: '#f2c0b8', accent: '#d89890', eye: '#201818' } },
            { sp: 'porco', pal: { body: '#3a3432', spot: '#e8c8c0', dark: '#2a2422', light: '#5a4e4a', accent: '#4a4240', eye: '#101010' } },     // caipira preto
            { sp: 'galinha', pal: { body: '#f2efe6', spot: '#d8d0c0', dark: '#e8a838', light: '#f8f6f0', accent: '#d8302a', eye: '#141414' } },   // branca
            { sp: 'galinha', pal: { body: '#8a5a32', spot: '#2a1e16', dark: '#e0a030', light: '#c08a50', accent: '#d8302a', eye: '#141414' } },   // carijó
            { sp: 'galinha', pal: { body: '#3a3634', spot: '#2a6a4a', dark: '#e0a030', light: '#5a5450', accent: '#d8302a', eye: '#141414' } },   // preta
            { sp: 'cabra', pal: { body: '#e8e2d6', spot: '#7a6a58', dark: '#4a3e34', light: '#f2ece2', accent: '#a89a88', eye: '#141414' } },
            { sp: 'cabra', pal: { body: '#7a5236', spot: '#f0e8dc', dark: '#3a2a1e', light: '#a07a5a', accent: '#c8bca8', eye: '#141414' } },
        ];
    }
    static get SLOT() { return { body: 1, spot: 2, dark: 3, light: 4, accent: 5, eye: 6 }; }
    static get FR() { return 80; }              // px por quadro (4 u)
    static get DIRS() { return 8; }
    static get PER() { return 4; }              // quadros por espécie: 0 parado, 1 pastando, 2–3 passo

    // ---------------------------------------------------------------- modelos (olhando para +Z)
    static model(sp, pose) {
        const B = SpriteBaker, M = Livestock.SLOT, P = [], graze = pose === 'graze', step = pose === 'walk0' ? 1 : (pose === 'walk1' ? -1 : 0);
        const legs = (pts, top, r, len, swing) => {               // pernas: [x, z] dos quadris; passo alternado (diagonal)
            pts.forEach(([x, z], i) => { const s = step * swing * ((i === 0 || i === 3) ? 1 : -1); P.push(B.capsule(M.dark, [x, top, z], [x, top - len, z + s], r)); });
        };
        if (sp === 'vaca') {
            P.push(B.ellipsoid(M.body, [0, 0.98, 0], [0.4, 0.4, 0.8], 0));
            P.push(B.sphere(M.spot, [0.24, 1.15, 0.25], 0.22)); P.push(B.sphere(M.spot, [-0.26, 1.05, -0.32], 0.24)); P.push(B.sphere(M.spot, [0.1, 1.28, -0.1], 0.18));
            P.push(B.sphere(M.light, [0, 0.62, -0.28], 0.17));                                             // úbere
            legs([[0.22, 0.5], [-0.22, 0.5], [0.22, -0.5], [-0.22, -0.5]], 0.75, 0.1, 0.72, 0.16);
            const hy = graze ? 0.42 : 1.12, hz = graze ? 1.02 : 0.98;
            P.push(B.capsule(M.body, [0, 1.05, 0.6], [0, hy + 0.08, hz - 0.08], 0.2));                       // pescoço
            P.push(B.ellipsoid(M.body, [0, hy, hz], [0.19, 0.2, 0.28], 0));
            P.push(B.sphere(M.light, [0, hy - 0.06, hz + 0.24], 0.13));                                    // focinho
            for (const s of [-1, 1]) { P.push(B.capsule(M.accent, [s * 0.12, hy + 0.17, hz - 0.08], [s * 0.3, hy + 0.3, hz - 0.12], 0.04)); P.push(B.sphere(M.eye, [s * 0.13, hy + 0.06, hz + 0.1], 0.035)); P.push(B.ellipsoid(M.dark, [s * 0.24, hy + 0.08, hz - 0.12], [0.09, 0.04, 0.05], 0)); }
            P.push(B.capsule(M.dark, [0, 1.1, -0.78], [0.05 * step, 0.5, -0.88], 0.035));                  // rabo
        } else if (sp === 'cavalo') {
            P.push(B.ellipsoid(M.body, [0, 1.3, 0], [0.32, 0.36, 0.78], 0));
            legs([[0.18, 0.5], [-0.18, 0.5], [0.18, -0.5], [-0.18, -0.5]], 1.05, 0.085, 1.02, 0.28);
            const hy = graze ? 0.42 : 1.95, hz = graze ? 1.2 : 1.08;
            P.push(B.capsule(M.body, [0, 1.45, 0.55], [0, hy + 0.1, hz - 0.12], 0.17));                      // pescoço
            P.push(B.capsule(M.accent, [0, 1.62, 0.5], [0, hy + 0.22, hz - 0.22], 0.07));                    // crina
            P.push(B.ellipsoid(M.body, [0, hy, hz + 0.08], [0.13, 0.15, 0.32], 0));
            P.push(B.sphere(M.spot, [0, hy + 0.06, hz + 0.24], 0.07));                                     // estrela na testa
            for (const s of [-1, 1]) { P.push(B.sphere(M.eye, [s * 0.1, hy + 0.06, hz + 0.08], 0.03)); P.push(B.capsule(M.body, [s * 0.06, hy + 0.14, hz - 0.12], [s * 0.08, hy + 0.3, hz - 0.14], 0.04)); }
            P.push(B.capsule(M.accent, [0, 1.42, -0.74], [0.06 * step, 0.8, -0.98], 0.08));                // rabo
        } else if (sp === 'porco') {
            P.push(B.ellipsoid(M.body, [0, 0.48, 0], [0.3, 0.28, 0.52], 0));
            legs([[0.16, 0.3], [-0.16, 0.3], [0.16, -0.3], [-0.16, -0.3]], 0.3, 0.07, 0.3, 0.08);
            const hy = graze ? 0.3 : 0.5, hz = graze ? 0.58 : 0.5;
            P.push(B.sphere(M.body, [0, hy, hz], 0.22));
            P.push(B.ellipsoid(M.light, [0, hy - 0.04, hz + 0.2], [0.1, 0.08, 0.06], 0));                 // focinho
            for (const s of [-1, 1]) { P.push(B.ellipsoid(M.accent, [s * 0.14, hy + 0.17, hz + 0.02], [0.07, 0.03, 0.08], 0)); P.push(B.sphere(M.eye, [s * 0.09, hy + 0.06, hz + 0.17], 0.025)); }
            P.push(B.sphere(M.spot, [0.12, 0.62, -0.1], 0.12)); P.push(B.capsule(M.accent, [0, 0.55, -0.5], [0.04, 0.6, -0.58], 0.03));
        } else if (sp === 'galinha') {
            P.push(B.ellipsoid(M.body, [0, 0.3, 0], [0.14, 0.15, 0.2], 0));
            P.push(B.ellipsoid(M.spot, [0, 0.36, -0.2], [0.07, 0.13, 0.08], 0));                           // rabo
            for (const s of [-1, 1]) P.push(B.ellipsoid(M.light, [s * 0.12, 0.32, -0.02], [0.04, 0.08, 0.14], 0));
            const hy = graze ? 0.16 : 0.46, hz = graze ? 0.26 : 0.16;
            P.push(B.sphere(M.body, [0, hy, hz], 0.085));
            P.push(B.capsule(M.accent, [0, hy + 0.08, hz - 0.04], [0, hy + 0.1, hz + 0.05], 0.03));        // crista
            P.push(B.capsule(M.dark, [0, hy - 0.01, hz + 0.07], [0, hy - 0.02, hz + 0.13], 0.025));         // bico
            P.push(B.sphere(M.accent, [0, hy - 0.07, hz + 0.05], 0.025));                                  // barbela
            for (const s of [-1, 1]) P.push(B.capsule(M.dark, [s * 0.05, 0.18, 0], [s * 0.05, 0.0, 0.04 * step * s], 0.02));
        } else {                                                                                            // cabra
            P.push(B.ellipsoid(M.body, [0, 0.66, 0], [0.22, 0.25, 0.46], 0));
            legs([[0.13, 0.3], [-0.13, 0.3], [0.13, -0.3], [-0.13, -0.3]], 0.5, 0.055, 0.5, 0.12);
            const hy = graze ? 0.3 : 0.98, hz = graze ? 0.66 : 0.6;
            P.push(B.capsule(M.body, [0, 0.72, 0.36], [0, hy, hz - 0.06], 0.1));
            P.push(B.ellipsoid(M.body, [0, hy, hz + 0.06], [0.1, 0.11, 0.18], 0));
            P.push(B.capsule(M.light, [0, hy - 0.1, hz + 0.14], [0, hy - 0.22, hz + 0.12], 0.035));        // barbicha
            for (const s of [-1, 1]) { P.push(B.capsule(M.accent, [s * 0.05, hy + 0.1, hz], [s * 0.1, hy + 0.22, hz - 0.14], 0.03)); P.push(B.sphere(M.eye, [s * 0.07, hy + 0.04, hz + 0.1], 0.022)); P.push(B.ellipsoid(M.spot, [s * 0.13, hy + 0.04, hz - 0.02], [0.07, 0.025, 0.04], 0)); }
            P.push(B.capsule(M.spot, [0, 0.8, -0.44], [0, 0.88, -0.5], 0.04));
        }
        return P;
    }

    // ---------------------------------------------------------------- atlas e malha
    constructor(game) {
        this.g = game;
        this.scene = game.scene;
        const F = Livestock.FR, D = Livestock.DIRS, PER = Livestock.PER, SP = Livestock.SPECIES, names = Object.keys(SP), VAR = Livestock.VARIANTS;
        const rows = names.length * PER, W = D * F, H = rows * F, poses = ['idle', 'graze', 'walk0', 'walk1'];
        const t0 = performance.now();
        if (typeof SpriteHD !== 'undefined' && SpriteHD.on) this._hdInit(poses);
        else this._atlasPixel(poses, rows, W, H);
        this._mesh();
        console.log(`[BICHOS] ${names.length} espécies, ${names.length * PER * D} sprites ${this._hdJob ? 'em alta definição (assados aos poucos durante o jogo)' : ''} em ${(performance.now() - t0).toFixed(0)} ms, ${this.pens.length} cercados`);
    }

    // Atlas em ALTA DEFINIÇÃO (art/SpriteHD.js): pelo, penas, sombra macia; cada variante de cor pintada à parte (a geometria de cada
    // espécie × pose × direção é feita uma vez). Os bichos só existem na Vila da Roça, longe do começo do jogo: o atlas é assado aos
    // poucos (~4 ms por quadro, _hdStep) em vez de pesar na carga, e eles aparecem quando ele fica pronto.
    // Arrumação: 3 variantes lado a lado (8 direções cada) por faixa; a faixa tem as 4 poses.
    _hdInit(poses) {
        const F = Livestock.FR, D = Livestock.DIRS, PER = Livestock.PER, VAR = Livestock.VARIANTS, VC = 3, groups = Math.ceil(VAR.length / VC);
        const q = Math.min(SpriteHD.Q, 1.25), FP = Math.round(F * q), W = VC * D * FP, H = groups * PER * FP;
        this._W = VC * D * F; this._H = groups * PER * F; this._VC = VC;
        const list = [];
        for (const sp of Object.keys(Livestock.SPECIES)) poses.forEach((pose, pi) => { for (let d = 0; d < D; d++) list.push({ sp, pose, pi, d }); });
        this._hdJob = { list, n: 0, q, FP, W, H, data: new Uint8Array(W * H * 4) };
    }
    _hdStep(budgetMs) {
        const J = this._hdJob, t0 = performance.now(), D = Livestock.DIRS, PER = Livestock.PER, VAR = Livestock.VARIANTS, M = Livestock.SLOT, VC = this._VC;
        while (J.n < J.list.length && performance.now() - t0 < budgetMs) {
            const { sp, pose, pi, d } = J.list[J.n++], vars = this.byVar[sp], fe = sp === 'galinha' ? 'feather' : 'fur';
            const tex = { [M.body]: fe, [M.spot]: fe, [M.dark]: sp === 'galinha' ? 'plain' : fe, [M.light]: fe, [M.accent]: 'plain', [M.eye]: 'plastic' };
            const colors = vars.map((vi) => { const c = {}; for (const k of Object.keys(M)) c[M[k]] = VAR[vi].pal[k]; return c; });
            const res = SpriteHD.bake(Livestock.model(sp, pose), { size: Livestock.FR, q: J.q, heading: (d * Math.PI * 2) / D, shadowLen: 0.45, elev: 48, colors, tex, seed: 3 });
            vars.forEach((vi, k) => {
                const cx = ((vi % VC) * D + d) * J.FP, cy = (Math.floor(vi / VC) * PER + pi) * J.FP, img = res.rgba[k];
                for (let y = 0; y < J.FP; y++) J.data.set(img.subarray(y * J.FP * 4, (y + 1) * J.FP * 4), ((cy + y) * J.W + cx) * 4);
            });
        }
        if (J.n < J.list.length) return;
        this.material = SpriteHD.material(this.scene, 'livestock', SpriteHD.texture(this.scene, J.data, J.W, J.H, { mips: false, name: 'livestockHD' }));
        this.mesh.material = this.material;
        this.mesh.isVisible = true;
        this._hdJob = null;
        console.log('[BICHOS] atlas em alta definição pronto');
    }

    _atlasPixel(poses, rows, W, H) {
        const F = Livestock.FR, D = Livestock.DIRS, PER = Livestock.PER, SP = Livestock.SPECIES, names = Object.keys(SP), VAR = Livestock.VARIANTS, data = new Uint8Array(W * H * 4);
        names.forEach((sp) => poses.forEach((pose, pi) => {
            const prims = Livestock.model(sp, pose);
            for (let d = 0; d < D; d++) {
                const img = SpriteBaker.bake(prims, { size: F, heading: (d * Math.PI * 2) / D, shadowLen: 0.45, elev: 48 });
                const cy = (SP[sp].row * PER + pi) * F, cx = d * F;
                for (let y = 0; y < F; y++) data.set(img.subarray(y * F * 4, (y + 1) * F * 4), ((cy + y) * W + cx) * 4);
            }
        }));
        const atlas = BABYLON.RawTexture.CreateRGBATexture(data, W, H, this.scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
        atlas.wrapU = atlas.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        this._W = W; this._H = H;
        const PW = 8 * 5, pdata = new Uint8Array(PW * VAR.length * 4);
        VAR.forEach((v, ri) => {
            for (const slot of Object.keys(Livestock.SLOT)) {
                const ramp = Pixel.ramp5(v.pal[slot]);
                for (let lv = 0; lv < 5; lv++) { const o = (ri * PW + Livestock.SLOT[slot] * 5 + lv) * 4; pdata[o] = ramp[lv][0]; pdata[o + 1] = ramp[lv][1]; pdata[o + 2] = ramp[lv][2]; pdata[o + 3] = 255; }
            }
        });
        const ptex = BABYLON.RawTexture.CreateRGBATexture(pdata, PW, VAR.length, this.scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
        ptex.wrapU = ptex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        this.material = SpriteMaterial.create(this.scene, 'livestock', atlas, { texture: ptex, width: PW, height: VAR.length });
    }

    _mesh() {
        const VAR = Livestock.VARIANTS;
        this.cap = 90;
        const n = this.cap, pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), col = new Float32Array(n * 16), idx = new Uint32Array(n * 6);
        for (let i = 0; i < n; i++) { const b = i * 4; idx.set([b + 3, b + 1, b, b + 2, b + 3, b], i * 6); }
        const mesh = this.mesh = new BABYLON.Mesh('livestock', this.scene), vd = new BABYLON.VertexData();
        vd.positions = pos; vd.uvs = uv; vd.colors = col; vd.indices = idx; vd.normals = new Float32Array(n * 12);
        vd.applyToMesh(mesh, true);
        mesh.material = this.material || null; mesh.isPickable = false; mesh.alwaysSelectAsActiveMesh = true; mesh.doNotSyncBoundingInfo = true;
        mesh.isVisible = !!this.material;                                                // (HD: aparece quando o atlas fica pronto)
        this.buf = { pos, uv, col };
        // variantes por espécie
        this.byVar = {};
        VAR.forEach((v, i) => (this.byVar[v.sp] || (this.byVar[v.sp] = [])).push(i));
        this.pens = (typeof Bairros !== 'undefined' ? Bairros.pens : []).map((p, i) => Object.assign({ id: i, live: null }, p));
        this.animals = [];
        this._t = 0;
        this.enabled = true;
    }

    // ---------------------------------------------------------------- população
    _spawnPen(pen) {
        const rng = Pixel.rng(1000 + pen.id * 7), vars = this.byVar[pen.sp], list = [];
        const v = vars[Math.floor(rng() * vars.length)];                                  // (a criação de um sítio é parecida: uma variante dominante)
        for (let k = 0; k < pen.n && this.animals.length < this.cap; k++) {
            const a = { pen, sp: pen.sp, S: Livestock.SPECIES[pen.sp], vr: rng() < 0.7 ? v : vars[Math.floor(rng() * vars.length)],
                x: pen.x0 + 0.8 + rng() * (pen.x1 - pen.x0 - 1.6), z: pen.z0 + 0.8 + rng() * (pen.z1 - pen.z0 - 1.6), h: rng() * Math.PI * 2,
                state: rng() < 0.6 ? 'graze' : 'idle', t: 1 + rng() * 6, tx: 0, tz: 0, step: rng() * 4, flee: 0 };
            this.animals.push(a); list.push(a);
        }
        pen.live = list;
    }
    _despawnPen(pen) {
        this.animals = this.animals.filter((a) => a.pen !== pen);
        pen.live = null;
    }

    // ---------------------------------------------------------------- por quadro
    update(dt) {
        if (!this.enabled || !this.pens.length) return;
        if (this._hdJob) this._hdStep(4);
        const g = this.g, tg = g.camera.target;
        this._t -= dt;
        if (this._t <= 0) {                                                               // cercados entrando/saindo da bolha (2×/s)
            this._t = 0.5;
            for (const p of this.pens) {
                const d = hypot((p.x0 + p.x1) / 2 - tg.x, (p.z0 + p.z1) / 2 - tg.z);
                if (!p.live && d < 140) this._spawnPen(p);
                else if (p.live && d > 180) this._despawnPen(p);
            }
        }
        if (!this.animals.length) { if (this._drawn) { this.buf.pos.fill(0); this._flush(); this._drawn = false; } return; }
        const P = g.player && g.player.position, car = g.mode === 'car' && g.activeCar, threat = car ? car.position : P;
        const tr = car ? 9 : (g.player && g.player.speed > 3 ? 1.6 : 1);
        for (const a of this.animals) this._step(a, dt, threat, tr);
        this._render();
    }

    _step(a, dt, th, tr) {
        const pen = a.pen, S = a.S, m = 0.5;
        // susto: o jogador (ou carro) perto — sai na direção oposta, dentro do cercado
        if (th) {
            const dx = a.x - th.x, dz = a.z - th.z, d = hypot(dx, dz);
            if (d < S.fear * tr) { a.flee = 1.2 + Math.random() * 0.8; a.h = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.8; a.state = 'walk'; }
        }
        let v = 0;
        if (a.flee > 0) { a.flee -= dt; v = S.v * S.run; }
        else {
            a.t -= dt;
            if (a.t <= 0) {
                const r = Math.random();
                if (r < 0.45) { a.state = 'graze'; a.t = 2 + Math.random() * 6; }
                else if (r < 0.7) { a.state = 'idle'; a.t = 1 + Math.random() * 3; a.h += (Math.random() - 0.5) * 1.2; }
                else { a.state = 'walk'; a.t = 1.5 + Math.random() * 3.5; a.tx = pen.x0 + m + Math.random() * (pen.x1 - pen.x0 - 2 * m); a.tz = pen.z0 + m + Math.random() * (pen.z1 - pen.z0 - 2 * m); }
            }
            if (a.state === 'walk') {
                const dx = a.tx - a.x, dz = a.tz - a.z;
                if (hypot(dx, dz) < 0.4) { a.state = 'graze'; a.t = 2 + Math.random() * 4; }
                else { let da = Math.atan2(dx, dz) - a.h; da = Math.atan2(Math.sin(da), Math.cos(da)); a.h += Math.max(-2 * dt, Math.min(2 * dt, da)); v = S.v; }
            }
        }
        if (v > 0) {
            const nx = a.x + Math.sin(a.h) * v * dt, nz = a.z + Math.cos(a.h) * v * dt;
            const cx = Math.max(pen.x0 + m, Math.min(pen.x1 - m, nx)), cz = Math.max(pen.z0 + m, Math.min(pen.z1 - m, nz));
            if (cx !== nx || cz !== nz) { a.h += Math.PI * (0.5 + Math.random() * 0.5); if (a.flee <= 0) a.t = 0; }      // encostou na cerca: vira
            a.x = cx; a.z = cz; a.step += dt * (3 + v * 2);
        }
        a.moving = v > 0;
    }

    _render() {
        const { pos, uv, col } = this.buf, F = Livestock.FR, D = Livestock.DIRS, PER = Livestock.PER, W = this._W, H = this._H, half = F / Config.art.ppu / 2;
        pos.fill(0);
        let i = 0;
        for (const a of this.animals) {
            if (i >= this.cap) break;
            const dir = ((Math.round(a.h / (Math.PI * 2) * D) % D) + D) % D;
            const fr = a.moving ? 2 + (Math.floor(a.step) % 2) : (a.state === 'graze' ? 1 : 0);
            const VC = this._VC, row = VC ? Math.floor(a.vr / VC) * PER + fr : a.S.row * PER + fr, cl = VC ? (a.vr % VC) * D + dir : dir;      // (HD: uma faixa por variante)
            const u0 = (cl * F) / W, v0 = (row * F) / H, u1 = u0 + F / W, v1 = v0 + F / H;
            const o = i * 12, x = a.x, z = a.z, y = 0.45;
            pos[o] = x - half; pos[o + 1] = y; pos[o + 2] = z + half; pos[o + 3] = x + half; pos[o + 4] = y; pos[o + 5] = z + half;
            pos[o + 6] = x - half; pos[o + 7] = y; pos[o + 8] = z - half; pos[o + 9] = x + half; pos[o + 10] = y; pos[o + 11] = z - half;
            const q = i * 8; uv[q] = u0; uv[q + 1] = v0; uv[q + 2] = u1; uv[q + 3] = v0; uv[q + 4] = u0; uv[q + 5] = v1; uv[q + 6] = u1; uv[q + 7] = v1;
            const c = i * 16; for (let k = 0; k < 4; k++) { col[c + k * 4] = a.vr; col[c + k * 4 + 1] = 1; col[c + k * 4 + 2] = 0; col[c + k * 4 + 3] = 1; }
            i++;
        }
        this._flush();
        this._drawn = true;
    }
    _flush() {
        const m = this.mesh, b = this.buf;
        m.updateVerticesData(BABYLON.VertexBuffer.PositionKind, b.pos);
        m.updateVerticesData(BABYLON.VertexBuffer.UVKind, b.uv);
        m.updateVerticesData(BABYLON.VertexBuffer.ColorKind, b.col);
    }
}
memoStatics(Livestock, 'SPECIES', 'VARIANTS', 'SLOT');
