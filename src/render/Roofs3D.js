// ============================================================================
// Roofs3D — os TELHADOS EM POLÍGONOS, no lugar das 27 texturas hd_roof (~32 MB de vídeo no High). `?telhados=2d` volta às texturas.
//
// Cada telhado (WorldBuilder._buildings → add) é coberto por PAINÉIS de ~2 × 2 u: o modelo do painel ([-1, 1]², x = de través, z = no
// sentido da água) vai à placa UMA vez por tipo e nível de detalhe, e cada telhado guarda só as instâncias (matriz + cor) — milhares
// de telhados sem duplicar vértice. O RELEVO é geometria de verdade:
//   • telha colonial: capa e canal em ondas e as FIADAS em degrau (a boca de cada telha faz sombra na de baixo);
//   • telha plana (shingle, ardósia, cedro): fiadas em degrau, as juntas desencontradas;
//   • zinco ondulado: a onda da chapa; chapa com junta em pé (metal): as nervuras;
//   • lona: as rugas do pano (com pedras e pneus segurando, e as cordas);
//   • manta asfáltica: as faixas sobrepostas; telhado verde: o gramado ondulado;
//   • laje crua, laje pintada e laje de concreto: lisas, com o desenho todo no shader.
// O ACABAMENTO é pintado no shader (Roof3DPlugin), sem textura, pela posição no painel e no mundo: o tom de cada telha, o musgo, a
// ferrugem e os escorridos do zinco, a junta da chapa, as tábuas da fôrma na laje, as manchas d'água, a brita da manta, as juntas
// das placas de concreto, o desgaste da laje pintada e o gramado — e o grão fino some com a distância (sem chuvisco).
// AS PEÇAS em cima (pneus, pedras, tijolos, cordas, respiros, vasos, mesas com guarda-sol, cadeiras, baldes, arbustos) são instâncias
// também; as que já existiam (caixa-d'água, condensadoras, antena, cornija — WorldBuilder._roof3d; parabólica, ferro de espera e varal
// — FavelaDetail) continuam.
//
// NÍVEL DE DETALHE POR PAINEL (como nos motores atuais): as instâncias ficam em baldes de BUCKET u; a cada ~0,25 s, se a câmera andou,
// cada balde vai para a faixa dele pela distância — PERTO (LOD.near: o relevo completo e as peças), MEIO (LOD.mid: o relevo simples)
// ou LONGE: a PLACA, UMA instância por telhado (o telhado inteiro liso; o desenho do shader sai do mundo, na grade de 2 u) — e os
// buffers de instâncias das três malhas de cada tipo são remontados (cópia de fatias, só quando muda). As lajes (crua, pintada, de
// concreto) são só a placa a qualquer distância. (Antes cada telhado longe era um painel liso por 2 × 2 u: dezenas de milhares de
// instâncias de 2 triângulos, caras de desenhar — a placa por telhado é ~13× menos instâncias.)
// Uma malha por tipo e faixa no mapa inteiro: poucos desenhos, sem descarte por pedaço (a de perto e a do meio têm a caixa da faixa).
//   Roofs3D.on      ligado (Config.art.roofPoly; `?telhados=2d` = as texturas de antes)
//   add(lot, y)     um telhado (y = a altura do topo no mundo)        build(scene) → malhas        stats()
// ============================================================================

const Roofs3D = {
    get on() {
        if (typeof location !== 'undefined' && /[?&]telhados=2d\b/.test(location.search)) return false;
        return !!(typeof Config !== 'undefined' && Config.art && Config.art.roofPoly !== false);
    },
    PANEL: 2,                      // u: o lado do painel (o modelo é [-1, 1]²; esticado para caber certinho no telhado)
    BUCKET: 24,                    // u: os baldes de instâncias (a faixa de detalhe é escolhida por balde)
    LOD: { near: 30, mid: 95 },    // u: até onde vai o relevo completo e o simples (× lodScale), da câmera à borda do balde
    get lodScale() { const L = typeof Graphics !== 'undefined' ? Graphics.level : 'high'; return L === 'low' ? 0.6 : L === 'medium' ? 0.8 : L === 'hd' ? 1.3 : 1; },
    KINDS: ['tile', 'shingle', 'zinc', 'metal', 'tarp', 'slab', 'tar', 'concrete', 'laje', 'garden'],
    shade: 1,                      // 1 = o acabamento pintado no shader; 0 = só a cor e o relevo (medir o custo por pixel)
    _list: [],
    _built: null,

    reset() { this._list = []; this._built = null; },
    kindOf(style) {
        if (/^(shingle|slate|cedar)/.test(style)) return 'shingle';
        const st = typeof TileFactory !== 'undefined' && TileFactory.roofStyles[style];
        const k = st ? st.kind : 'concrete';
        return this.KINDS.includes(k) ? k : 'concrete';
    },
    // a cor média do estilo (a do desenho antigo) — a instância leva ela; o shader varia por telha, chapa, placa
    colorOf(style) {
        const st = (typeof TileFactory !== 'undefined' && TileFactory.roofStyles[style]) || {};
        const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
        const avg = (L) => { const c = L.map(hex); return [0, 1, 2].map((i) => c.reduce((s, x) => s + x[i], 0) / c.length); };
        if (st.colors) return avg(st.colors);
        if (Array.isArray(st.base)) return avg(st.base);
        if (typeof st.base === 'string') return hex(st.base);
        if (st.a) return avg([st.a, st.b || st.a]);
        return [0.6, 0.6, 0.6];
    },
    // ajustes por estilo para o shader: [ferrugem/musgo 0..1, sujeira 0..1]
    wearOf(style) {
        return { zinc0: [0.25, 0.4], zinc1: [0.7, 0.6], tile0: [0.25, 0.3], tile1: [0.35, 0.4], clay0: [0.7, 0.6], cedar0: [0.45, 0.4], slate0: [0.15, 0.2],
            shingle: [0.2, 0.3], tarp0: [0, 0.35], tarp1: [0, 0.35], tarp2: [0, 0.35], slab0: [0, 0.6], slab1: [0, 0.5], tar0: [0, 0.4], tar1: [0, 0.5],
            redmetal: [0.3, 0.2], metal0: [0.05, 0.15], metal1: [0.1, 0.2], hosp: [0, 0.05], police: [0, 0.05] }[style] || [0.1, 0.3];
    },

    // ------------------------------------------------------------------ montagem
    // Um telhado: o retângulo do lote, a altura do topo no mundo e o estilo. Escolhe o sentido da água (o lado menor, como um
    // telhado de duas águas), divide em painéis de ~2 u e sorteia as peças de cima.
    add(lot, y, fav = false) {
        this._list.push({ x0: lot.x0, z0: lot.z0, x1: lot.x1, z1: lot.z1, y, style: lot.roof, fav, clean: !!(lot.landmark) });      // (o sorteio é pelo lugar: não mexe no rng da cidade)
    },

    build(scene) {
        const t0 = performance.now(), B = this.BUCKET;
        const per = {}, plates = {};                                          // tipo → [[balde, matriz(16), cor(4)]]: painéis e a placa de cada telhado
        const props = {};                                                     // peça → idem
        const put = (T, key, bk, m, c) => { (T[key] || (T[key] = [])).push([bk, m, c]); };
        const mat = (cx, y, cz, th, sx, sy, sz) => {                         // T · Ry(th) · S(sx, sy, sz): +X do modelo → (cos, -sen), +Z → (sen, cos)
            const c = Math.cos(th), s = Math.sin(th);
            return [c * sx, 0, -s * sx, 0, 0, sy, 0, 0, s * sz, 0, c * sz, 0, cx, y, cz, 1];
        };
        const R = (seed) => { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
        let roofs = 0, panels = 0, nprops = 0;
        for (const f of this._list) {
            const w = f.x1 - f.x0, d = f.z1 - f.z0;
            if (w < 0.6 || d < 0.6) continue;
            roofs++;
            const kind = this.kindOf(f.style), col = this.colorOf(f.style), rnd = R(Math.round(f.x0 * 7 + f.z0 * 131 + 17));
            const v = 0.93 + 0.14 * rnd(), wear = this.wearOf(f.style);
            const ic = [col[0] * v, col[1] * v, col[2] * v, 1];
            // sentido da água: ao longo do lado MENOR (a cumeeira no maior); a lona e as lajes, tanto faz
            const alongX = w < d, la = alongX ? w : d, lc = alongX ? d : w;
            const na = Math.max(1, Math.round(la / this.PANEL)), nc = Math.max(1, Math.round(lc / this.PANEL)), ca = la / na, cc = lc / nc;
            const flip = rnd() < 0.5 ? Math.PI : 0, th = (alongX ? Math.PI / 2 : 0) + flip;
            const cx0 = (f.x0 + f.x1) / 2, cz0 = (f.z0 + f.z1) / 2, bk = Math.floor(cx0 / B) + ',' + Math.floor(cz0 / B);
            // (a cor leva no alfa o desgaste para o shader: 1 + ferrugem + 10·sujeira, +1000 na placa — lido no Roof3DPlugin)
            const code = 1 + Math.round(wear[0] * 9) + Math.round(wear[1] * 9) * 10, lods = this.LODS[kind];
            put(plates, kind, bk, mat(cx0, f.y, cz0, th, lc / 2, 1, la / 2), [ic[0], ic[1], ic[2], code + 1000]);      // a PLACA: o telhado inteiro, lisa (longe, e as lajes sempre)
            if (lods[0] !== 2 || lods[1] !== 2) for (let a = 0; a < na; a++) for (let c = 0; c < nc; c++) {
                const ua = -la / 2 + ca * (a + 0.5), uc = -lc / 2 + cc * (c + 0.5);
                const px = cx0 + (alongX ? ua : uc), pz = cz0 + (alongX ? uc : ua);
                // (o painel: x = de través = lc/nc, z = no sentido da água = la/na)
                put(per, kind, bk, mat(px, f.y, pz, th, cc / 2, 1, ca / 2), [ic[0], ic[1], ic[2], code]);
                panels++;
            }
            nprops += this._props(f, kind, w, d, rnd, (key, x, yy, z, rot, s, c, sx, sz) => put(props, key, Math.floor(x / B) + ',' + Math.floor(z / B), mat(x, yy, z, rot, sx || s, s, sz || s), c || [1, 1, 1, 1]));
        }
        // malhas: cada tipo/peça com as instâncias ordenadas por balde (cada balde guarda a fatia dos painéis e a das placas)
        const out = [], kinds = [], parts = [];
        const sort = (L, keys) => {
            const by = new Map();
            for (const k of keys || []) by.set(k, []);
            for (const e of L) { let g = by.get(e[0]); if (!g) by.set(e[0], g = []); g.push(e); }
            const M = new Float32Array(Math.max(1, L.length) * 16), C = new Float32Array(Math.max(1, L.length) * 4), buckets = [];
            let i = 0;
            for (const [key, g] of by) {
                const [bx, bz] = key.split(',').map(Number), s = i;
                let y = 0;
                for (const e of g) { M.set(e[1], i * 16); C.set(e[2], i * 4); y += e[1][13]; i++; }
                buckets.push({ key, s, n: g.length, cx: (bx + 0.5) * B, cz: (bz + 0.5) * B, y: g.length ? y / g.length : 0, band: -1 });
            }
            return { M, C, buckets, n: L.length };
        };
        for (const kind of Object.keys(plates)) {
            const Q = sort(plates[kind]), P = sort(per[kind] || [], Q.buckets.map((b) => b.key)), lods = this.LODS[kind], mat = this._mat(scene, kind);
            const m0 = lods[0] !== 2 ? this._mesh(scene, 'roof_3d_' + kind + '_perto', this._panelGPU(scene, kind, lods[0]), mat, P.n) : null;
            const m1 = lods[1] !== 2 && lods[1] !== lods[0] ? this._mesh(scene, 'roof_3d_' + kind + '_meio', this._panelGPU(scene, kind, lods[1]), mat, P.n) : null;
            const mp = this._mesh(scene, 'roof_3d_' + kind + '_placa', this._panelGPU(scene, kind, 2), mat, Q.n);
            const byKey = new Map(P.buckets.map((b) => [b.key, b]));
            for (const b of Q.buckets) b.p = byKey.get(b.key);                // (o mesmo balde nos painéis)
            kinds.push({ kind, D: Q, P, meshes: [m0, m1, mp] });
            for (const m of [m0, m1, mp]) if (m) out.push(m);
        }
        for (const key of Object.keys(props)) {
            const D = sort(props[key]), m = this._mesh(scene, 'roof_3d_peca_' + key, this._propGPU(scene, key), this._propMat(scene), D.n);
            parts.push({ key, D, meshes: [m, null, null], props: true });
            out.push(m);
        }
        this._built = { kinds, parts, scene, last: null, t: 0 };
        this._st = { roofs, panels, props: nprops, ms: Math.round(performance.now() - t0) };
        this._list = [];
        scene.onBeforeRenderObservable.add(() => this._tick(scene));
        this._tick(scene, true);
        console.log(`[TELHADOS] ${roofs} telhados em polígonos: ${panels} painéis, ${nprops} peças (${kinds.length} tipos, ${parts.length} peças) em ${this._st.ms} ms`);
        return out;
    },
    stats() {
        const B = this._built;
        if (!B) return null;
        const lv = (m) => (m && m.isVisible ? m.thinInstanceCount : 0), tris = (m) => (m && m.isVisible ? m.thinInstanceCount * m.getTotalIndices() / 3 : 0);
        const o = Object.assign({}, this._st, { near: 0, mid: 0, far: 0, propsOn: 0, tris: 0, draws: 0, inst: 0 });
        for (const K of B.kinds) { o.near += lv(K.meshes[0]); o.mid += lv(K.meshes[1]); o.far += lv(K.meshes[2]); for (const m of K.meshes) { o.tris += tris(m); o.inst += lv(m); if (lv(m)) o.draws++; } }
        for (const P of B.parts) { o.propsOn += lv(P.meshes[0]); o.tris += tris(P.meshes[0]); o.inst += lv(P.meshes[0]); if (lv(P.meshes[0])) o.draws++; }
        o.tris = Math.round(o.tris);
        return o;
    },

    // Malha de um tipo/faixa: os buffers do modelo (na placa uma vez) e o buffer de instâncias com a capacidade total.
    _mesh(scene, name, G, material, cap) {
        const m = new BABYLON.Mesh(name, scene);
        for (const [kind, buf, size] of G.vb) m.setVerticesBuffer(buf.createVertexBuffer(kind, 0, size));
        G.ib.references++; G.ib.is32Bits = G.i32;
        m.setIndexBuffer(G.ib, G.nV, G.nI);
        G.ib.is32Bits = G.i32;
        m.material = material; m.useVertexColors = true; m.isPickable = false; m.receiveShadows = true;
        m._rfM = new Float32Array(Math.max(1, cap) * 16); m._rfC = new Float32Array(Math.max(1, cap) * 4);
        m.thinInstanceSetBuffer('matrix', m._rfM, 16, false);
        m.thinInstanceSetBuffer('color', m._rfC, 4, false);
        m.thinInstanceCount = 0;
        m.isVisible = false;
        // (SEM matriz congelada e sempre candidata no RenderCuller — core/Spatial.js: ele arquiva as malhas congeladas na grade pela caixa
        // da carga, e estas mudam de lugar com a câmera; o frustum do Babylon continua valendo, pela caixa da faixa)
        m._cullAlways = true;
        m.doNotSyncBoundingInfo = true;
        return m;
    },

    // ------------------------------------------------------------------ nível de detalhe (por balde, ~4 vezes por segundo)
    _tick(scene, force = false) {
        const B = this._built;
        if (!B) return;
        const now = performance.now();
        if (!force && now - B.t < 250) return;
        B.t = now;
        const cam = scene.activeCamera;
        if (!cam) return;
        const P = cam.globalPosition || cam.position;
        // ALÉM DO PLANO DE CORTE da câmera (no Low ele fica colado na névoa — Config.perf.tightFar): o balde sai de todas as faixas. Antes
        // as placas da cidade INTEIRA iam para a placa de vídeo a cada quadro (a caixa delas cobria o mapa, sempre no frustum) — até no
        // meio da mata, longe de qualquer telhado: ~10 desenhos e milhares de instâncias que o recorte jogava fora depois.
        const far = cam.maxZ > 0 ? cam.maxZ : Infinity;
        if (!force && B.last && Math.hypot(P.x - B.last.x, P.y - B.last.y, P.z - B.last.z) < 2.5 && (far === B.last.far || Math.abs(far - B.last.far) < 4)) return;
        B.last = { x: P.x, y: P.y, z: P.z, far };
        const k = this.lodScale, NEAR = this.LOD.near * k, MID = this.LOD.mid * k, R = this.BUCKET * 0.72, FAR = far + 6;
        const band = (b) => { const d = Math.max(0, Math.hypot(b.cx - P.x, b.y - P.y, b.cz - P.z) - R); return d > FAR ? 3 : d < (b.band === 0 ? NEAR * 1.1 : NEAR) ? 0 : d < (b.band === 1 ? MID * 1.1 : MID) ? 1 : 2; };
        for (const K of B.kinds.concat(B.parts)) {
            const D = K.D, M = K.meshes;
            let changed = force;
            for (const b of D.buckets) {
                let nb = band(b);
                if (K.props) nb = nb === 0 && !this.noProps && !Config.perf.minimal ? 0 : -2;                              // (peças: só perto — e nenhuma com noProps, AutoQuality)
                else if (nb === 0 && !M[0]) nb = M[1] ? 1 : 2;                                      // (sem relevo de perto: o do meio ou a placa)
                else if (nb === 1 && !M[1]) nb = 2;                                                 // (sem relevo do meio: a placa)
                if (b.p && !b.p.n && nb < 3) nb = 2;                                                // (balde sem painéis: a placa)
                if (nb !== b.band) { b.band = nb; changed = true; }
            }
            if (!changed) continue;
            for (let L = 0; L < 3; L++) {
                const m = M[L];
                if (!m) continue;
                const S = K.props || L === 2 ? D : K.P;                             // (perto e meio: os painéis; longe: as placas)
                let n = 0, x0 = Infinity, z0 = Infinity, y0 = Infinity, x1 = -Infinity, z1 = -Infinity, y1 = -Infinity;
                for (const q of D.buckets) {
                    if (q.band !== L) continue;
                    const b = K.props || L === 2 ? q : q.p;
                    if (!b || !b.n) continue;
                    m._rfM.set(S.M.subarray(b.s * 16, (b.s + b.n) * 16), n * 16);
                    m._rfC.set(S.C.subarray(b.s * 4, (b.s + b.n) * 4), n * 4);
                    n += b.n;
                    const h = this.BUCKET / 2 + 2;
                    if (b.cx - h < x0) x0 = b.cx - h; if (b.cx + h > x1) x1 = b.cx + h; if (b.cz - h < z0) z0 = b.cz - h; if (b.cz + h > z1) z1 = b.cz + h;
                    if (b.y - 2 < y0) y0 = b.y - 2; if (b.y + 4 > y1) y1 = b.y + 4;
                }
                m.thinInstanceCount = n;
                m.isVisible = n > 0;
                if (!n) continue;
                m.thinInstancePartialBufferUpdate('matrix', m._rfM.subarray(0, n * 16), 0);
                m.thinInstancePartialBufferUpdate('color', m._rfC.subarray(0, n * 4), 0);
                const bi = new BABYLON.BoundingInfo(new BABYLON.Vector3(x0, y0, z0), new BABYLON.Vector3(x1, y1, z1));
                m.setBoundingInfo(bi);
                bi.update(m.getWorldMatrix());
            }
        }
    },

    // ------------------------------------------------------------------ os painéis (modelo [-1, 1]², y = 0 no plano do telhado)
    // Nível de cada faixa por tipo (perto, meio, longe): o mesmo número = a mesma malha (a faixa do meio usa a de perto ou a de longe).
    LODS: { tile: [0, 1, 2], shingle: [0, 1, 2], zinc: [0, 1, 2], metal: [0, 2, 2], tarp: [0, 1, 2], slab: [2, 2, 2], tar: [0, 2, 2], concrete: [2, 2, 2], laje: [2, 2, 2], garden: [0, 1, 2] },
    _panelGPU(scene, kind, lod) {
        const C = this._gpuC || (this._gpuC = {}), key = kind + '|' + lod;
        if (C[key] && C[key].eng === scene.getEngine()) return C[key];
        const g = this.panel(kind, lod);
        return (C[key] = this._upload(scene, g));
    },
    _upload(scene, g) {
        const eng = scene.getEngine();
        const vb = [['position', new Float32Array(g.p), 3], ['normal', new Float32Array(g.n), 3], ['color', new Float32Array(g.c), 4]].map(([k, d, s]) => [k, new BABYLON.Buffer(eng, d, false, s), s]);
        const nV = g.p.length / 3, I = nV > 65535 ? new Uint32Array(g.i) : new Uint16Array(g.i);
        return { eng, vb, ib: eng.createIndexBuffer(I), i32: I instanceof Uint32Array, nV, nI: I.length, tris: I.length / 3 };
    },
    _G() { return { p: [], n: [], c: [], i: [] }; },
    _v(g, x, y, z, nx, ny, nz, c) { g.p.push(x, y, z); const l = Math.hypot(nx, ny, nz) || 1; g.n.push(nx / l, ny / l, nz / l); g.c.push(c, c, c, 1); return g.p.length / 3 - 1; },
    // superfície sobre a grade xs × zs com a altura h(x, z) e o tom t(x, z, y); normais pela derivada de h (triângulos virados para cima)
    _grid(g, xs, zs, h, t) {
        const base = g.p.length / 3, nx = xs.length, e = 0.003;
        for (const z of zs) for (const x of xs) {
            const y = h(x, z), dx = (h(x + e, z) - h(x - e, z)) / (2 * e), dz = (h(x, z + e) - h(x, z - e)) / (2 * e);
            this._v(g, x, y, z, -dx, 1, -dz, t(x, z, y));
        }
        for (let j = 0; j + 1 < zs.length; j++) for (let i = 0; i + 1 < nx; i++) {
            const a = base + j * nx + i, b = a + 1, c = a + nx, d = c + 1;
            g.i.push(a, b, c, b, d, c);                                         // (face da frente para cima: a normal visível é −(b−a)×(c−a), como no MeshBatch)
        }
    },
    // degrau vertical virado para +z (a boca da telha/fiada) entre ya(x) em cima e yb(x) embaixo, em z
    _skirt(g, xs, z, ya, yb, t) {
        const base = g.p.length / 3, nx = xs.length;
        for (const x of xs) this._v(g, x, ya(x), z, 0, 0.25, 1, t);
        for (const x of xs) this._v(g, x, yb(x), z, 0, 0.25, 1, t * 0.8);
        for (let i = 0; i + 1 < nx; i++) { const a = base + i, b = a + 1, c = a + nx, d = c + 1; g.i.push(a, b, c, b, d, c); }
    },
    _lin(a, b, n) { const o = []; for (let i = 0; i <= n; i++) o.push(a + (b - a) * i / n); return o; },
    // fiadas em degrau (telha colonial e plana): `courses` fiadas no sentido da água, cada uma subindo `lip` até a boca, perfil p(x)
    _courses(g, xs, courses, lip, p, tone) {
        const L = 2 / courses;
        for (let k = 0; k < courses; k++) {
            const za = -1 + k * L, zb = za + L;
            this._grid(g, xs, [za, zb], (x, z) => p(x) + lip * (z - za) / L, (x, z, y) => tone(x, y) * (0.86 + 0.16 * (z - za) / L));
            this._skirt(g, xs, zb, (x) => p(x) + lip, (x) => p(x), 0.66);
        }
    },
    panel(kind, lod) {
        const g = this._G(), flat = (y = 0, t = 0.95) => this._grid(g, [-1, 1], [-1, 1], () => y, () => t);
        if (lod === 2) { flat(kind === 'tarp' ? 0.035 : kind === 'garden' ? 0.07 : kind === 'tile' ? 0.03 : 0, kind === 'tile' ? 0.86 : 0.95); return g; }
        switch (kind) {
            case 'tile': {                                                      // telha colonial: capa e canal, fiadas em degrau
                const A = 0.055, per = 5, P = 2 / per, sp = lod === 0 ? 4 : 2;
                const prof = (x) => A * Math.pow(Math.abs(Math.sin(Math.PI * (x + 1) / P)), 0.75);
                this._courses(g, this._lin(-1, 1, per * sp), lod === 0 ? 4 : 2, lod === 0 ? 0.04 : 0.05, prof, (x, y) => 0.72 + 0.34 * (y / A > 1 ? 1 : y / A));
                break;
            }
            case 'shingle': this._courses(g, [-1, 1], lod === 0 ? 7 : 3, lod === 0 ? 0.022 : 0.03, () => 0, () => 0.98); break;
            case 'zinc': {                                                      // a onda da chapa (crista mais clara)
                const A = 0.02, per = lod === 0 ? 10 : 5, sp = lod === 0 ? 4 : 2, P = 2 / per;
                this._grid(g, this._lin(-1, 1, per * sp), [-1, 1], (x) => A + A * Math.sin(2 * Math.PI * (x + 1) / P + 1.2), (x, z, y) => 0.8 + 0.28 * (y / (2 * A)));
                break;
            }
            case 'metal': {                                                     // chapa com junta em pé: 4 nervuras
                const xs = [-1], hy = new Map();
                for (const s of [-0.75, -0.25, 0.25, 0.75]) for (const [o, y] of [[-0.04, 0], [-0.013, 0.042], [0.013, 0.042], [0.04, 0]]) { xs.push(s + o); hy.set(s + o, y); }
                xs.push(1);
                const hf = (x) => { if (hy.has(x)) return hy.get(x); for (const s of [-0.75, -0.25, 0.25, 0.75]) { const d = Math.abs(x - s); if (d < 0.04) return d < 0.013 ? 0.042 : 0.042 * (0.04 - d) / 0.027; } return 0; };
                this._grid(g, xs, [-1, 1], hf, (x, z, y) => (y > 0.03 ? 1.12 : y > 0.001 ? 1.0 : 0.93));
                break;
            }
            case 'tarp': {                                                      // rugas do pano (periódicas: casam com o painel vizinho)
                const n = lod === 0 ? 7 : 3, H = (x, z) => 0.035 + 0.026 * Math.sin(Math.PI * (2 * x + z) + 0.7) + 0.014 * Math.sin(Math.PI * (x - 3 * z) + 2.1) + 0.008 * Math.sin(Math.PI * (4 * x + 2 * z));
                this._grid(g, this._lin(-1, 1, n), this._lin(-1, 1, n), H, (x, z, y) => 0.86 + 2.2 * (y - 0.035));
                break;
            }
            case 'tar': {                                                       // manta: duas faixas sobrepostas (a borda de cima faz degrau)
                for (const [a, b] of [[-1, 0], [0, 1]]) {
                    this._grid(g, [a, b], [-1, 1], (x) => 0.012 * (x - a), (x) => 0.9 + 0.1 * (x - a));
                    const base = g.p.length / 3;
                    for (const z of [-1, 1]) { this._v(g, b, 0.012, z, 1, 0.2, 0, 0.62); this._v(g, b, 0, z, 1, 0.2, 0, 0.55); }
                    g.i.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
                }
                break;
            }
            case 'garden': {                                                    // gramado ondulado sobre a manta
                const n = lod === 0 ? 8 : 3, H = (x, z) => 0.07 + 0.03 * Math.sin(Math.PI * (2 * x + 1.3)) * Math.sin(Math.PI * (2 * z + 0.4)) + 0.012 * Math.sin(Math.PI * (4 * x - 2 * z));
                this._grid(g, this._lin(-1, 1, n), this._lin(-1, 1, n), H, (x, z, y) => 0.85 + 2.5 * (y - 0.07));
                break;
            }
            default: flat();
        }
        return g;
    },

    // ------------------------------------------------------------------ as peças de cima (sorteadas por telhado)
    // emit(peça, x, y, z, giro, escala, cor[4], sx, sz)
    _props(f, kind, w, d, rnd, emit) {
        const { x0, z0, x1, z1, y } = f, pad = 0.45, at = () => [x0 + pad + rnd() * Math.max(0.01, w - 2 * pad), z0 + pad + rnd() * Math.max(0.01, d - 2 * pad)];
        let n = 0;
        const one = (key, yy, s = 1, c, sx, sz, p) => { const [x, z] = p || at(); emit(key, x, yy, z, rnd() * 6.283, s, c, sx, sz); n++; };
        if (f.clean) return 0;
        if (kind === 'zinc') {
            if (rnd() < 0.35) for (let k = 0, m = 1 + Math.floor(rnd() * 3); k < m; k++) one('tire', y + 0.04, 0.85 + rnd() * 0.3);
            if (rnd() < 0.55) for (let k = 0, m = 2 + Math.floor(rnd() * 4); k < m; k++) one('stone', y + 0.03, 0.7 + rnd() * 0.6);
            if (rnd() < 0.3) for (let k = 0, m = 1 + Math.floor(rnd() * 3); k < m; k++) one('brick', y + 0.04, 1);
        } else if (kind === 'tarp') {
            const alongX = w < d, L = alongX ? w : d, ncord = w * d > 10 ? 2 : 1, cc = [[0.85, 0.82, 0.7, 1], [0.9, 0.9, 0.9, 1], [0.95, 0.75, 0.25, 1]][Math.floor(rnd() * 3)];
            for (let k = 0; k < ncord; k++) {                                   // corda de lado a lado, presa por pedras nas pontas
                const t = (k + 1) / (ncord + 1), cx = alongX ? x0 + w / 2 : x0 + w * t, cz = alongX ? z0 + d * t : z0 + d / 2;
                emit('cord', cx, y + 0.07, cz, alongX ? Math.PI / 2 : 0, 1, cc, 1, L + 0.3); n++;
                for (const e of [-1, 1]) { const ex = alongX ? cx + e * (w / 2 - 0.15) : cx, ez = alongX ? cz : cz + e * (d / 2 - 0.15); one('stone', y + 0.06, 0.8, null, null, null, [ex, ez]); }
            }
            if (rnd() < 0.5) for (let k = 0, m = 1 + Math.floor(rnd() * 3); k < m; k++) one(rnd() < 0.5 ? 'tire' : 'brick', y + 0.06, 1);
        } else if (kind === 'slab') {
            if (rnd() < 0.25) one('bricks', y, 0.8 + rnd() * 0.4);
            if (rnd() < 0.25) one('bucket', y, 1, [[0.2, 0.45, 0.8, 1], [0.85, 0.2, 0.15, 1], [0.95, 0.75, 0.15, 1], [0.25, 0.25, 0.25, 1]][Math.floor(rnd() * 4)]);
            if (rnd() < 0.15) one('chair', y, 1, rnd() < 0.6 ? [0.95, 0.95, 0.93, 1] : [0.8, 0.2, 0.15, 1]);
            if (rnd() < 0.3) one('stone', y + 0.02, 0.9);
        } else if (kind === 'tar' || kind === 'concrete') {
            if (rnd() < 0.7) for (let k = 0, m = 1 + Math.floor(rnd() * 3); k < m; k++) one('vent', y, 0.9 + rnd() * 0.3);
            if (w * d > 60 && rnd() < 0.5) one('hatch', y, 1);
        } else if (kind === 'laje') {
            const party = (TileFactory.roofStyles[f.style] || {}).party, pc = [[0.72, 0.38, 0.22, 1], [0.85, 0.85, 0.82, 1], [0.3, 0.3, 0.32, 1]];
            for (let k = 0, m = 2 + Math.floor(rnd() * 4); k < m; k++) {        // vasos com planta na beirada
                const e = Math.floor(rnd() * 4), t = rnd(), px = e < 2 ? x0 + 0.5 + t * (w - 1) : (e === 2 ? x0 + 0.45 : x1 - 0.45), pz = e >= 2 ? z0 + 0.5 + t * (d - 1) : (e === 0 ? z0 + 0.45 : z1 - 0.45);
                one('pot', y, 0.8 + rnd() * 0.5, pc[Math.floor(rnd() * pc.length)], null, null, [px, pz]);
            }
            if (party && w > 3 && d > 3) {
                for (let k = 0, m = 1 + Math.floor(rnd() * 2); k < m; k++) {
                    const [tx, tz] = at();
                    emit('table', tx, y, tz, rnd() * 6.283, 1, [[0.85, 0.2, 0.2, 1], [0.2, 0.5, 0.85, 1], [0.95, 0.8, 0.2, 1], [0.25, 0.65, 0.35, 1]][Math.floor(rnd() * 4)]); n++;
                    for (let c = 0; c < 3; c++) { const a = rnd() * 6.283; emit('chair', tx + Math.cos(a) * 0.85, y, tz + Math.sin(a) * 0.85, a + Math.PI / 2, 1, rnd() < 0.7 ? [0.95, 0.95, 0.93, 1] : [0.85, 0.2, 0.15, 1]); n++; }
                }
            }
        } else if (kind === 'garden') {
            for (let k = 0, m = 2 + Math.floor(rnd() * 4); k < m; k++) one('shrub', y + 0.06, 0.7 + rnd() * 0.6, [0.85 + rnd() * 0.3, 0.9 + rnd() * 0.25, 0.85, 1]);
        } else if (kind === 'metal') {
            if (w * d > 30 && rnd() < 0.5) one('skylight', y + 0.04, 1);
        }
        return n;
    },
    _propGPU(scene, key) {
        const C = this._gpuP || (this._gpuP = {});
        if (C[key] && C[key].eng === scene.getEngine()) return C[key];
        const b = new MeshBatch();
        this.PROP[key](b);
        const g = { p: b.pos, n: b.nor, c: b.col, i: b.idx };
        return (C[key] = this._upload(scene, g));
    },
    // os modelos das peças (MeshBatch na origem: y = 0 no telhado)
    PROP: {
        tire(b) {                                                              // pneu deitado: anel de 10 gomos
            const N = 10, R = 0.3, r = 0.1, col = [0.11, 0.11, 0.12];
            for (let i = 0; i < N; i++) {
                const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
                b.tube([Math.cos(a0) * R, r, Math.sin(a0) * R], [Math.cos(a1) * R, r, Math.sin(a1) * R], r, r, col, 5);
            }
        },
        stone(b) {                                                             // pedra: caixa torta com o topo chanfrado
            b.obox(0, 0, 1, 0, 0.16, 0.12, 0, 0.13, [0.55, 0.53, 0.5], 0.11, 0.08);
            b.obox(0.05, 0.03, 0.7, 0.7, 0.08, 0.07, 0.1, 0.17, [0.6, 0.58, 0.55], 0.05, 0.04);
        },
        brick(b) { b.obox(0, 0, 1, 0, 0.1, 0.2, 0, 0.09, [0.68, 0.33, 0.22]); b.obox(0, 0, 1, 0, 0.1, 0.2, 0.09, 0.1, [0.58, 0.28, 0.2], 0.09, 0.19); },
        bricks(b) {                                                            // pilha de tijolos (sobra da obra)
            for (let l = 0; l < 3; l++) for (let k = 0; k < 3 - l; k++) b.obox(-0.2 + k * 0.21 + l * 0.1, 0, l % 2 ? 0 : 1, l % 2 ? 1 : 0, 0.2, 0.1, l * 0.1, l * 0.1 + 0.095, [0.66 + 0.05 * ((k + l) % 2), 0.32, 0.21]);
        },
        cord(b) { b.tube([0, 0, -0.5], [0, 0, 0.5], 0.018, 0.018, [1, 1, 1], 4); },      // (esticada pela instância: escala z = o comprimento)
        vent(b) {                                                              // respiro: cano com chapéu
            b.cyl(0, 0, 0.09, 0, 0.55, [0.62, 0.63, 0.65], 8);
            b.cyl(0, 0, 0.16, 0.55, 0.6, [0.5, 0.51, 0.53], 8);
            b.obox(0, 0, 1, 0, 0.18, 0.18, 0.6, 0.66, [0.56, 0.57, 0.6], 0.02, 0.02);
        },
        hatch(b) { b.solid(-0.55, -0.55, 0.55, 0.55, 0, 0.35, [0.5, 0.5, 0.52]); b.solid(-0.5, -0.5, 0.5, 0.5, 0.35, 0.4, [0.38, 0.4, 0.43]); },
        bucket(b) { b.cyl(0, 0, 0.13, 0, 0.3, [1, 1, 1], 8); b.cyl(0, 0, 0.11, 0.3, 0.31, [0.15, 0.15, 0.15], 8); },
        chair(b) {                                                             // cadeira de plástico (assento, encosto, pernas)
            b.solid(-0.22, -0.22, 0.22, 0.22, 0.4, 0.45, [1, 1, 1]);
            b.obox(0, -0.22, 1, 0, 0.22, 0.03, 0.45, 0.85, [1, 1, 1]);
            for (const [x, z] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) b.solid(x - 0.025, z - 0.025, x + 0.025, z + 0.025, 0, 0.4, [0.92, 0.92, 0.92]);
        },
        table(b) {                                                             // mesa redonda com guarda-sol (a cor vem da instância)
            b.cyl(0, 0, 0.45, 0.7, 0.74, [0.95, 0.95, 0.93], 10);
            b.cyl(0, 0, 0.035, 0, 0.7, [0.8, 0.8, 0.8], 6);
            b.cyl(0, 0, 0.025, 0.74, 2.1, [0.9, 0.9, 0.9], 6);
            const N = 8, R = 1.1;
            for (let i = 0; i < N; i++) {
                const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2, col = i % 2 ? [1, 1, 1] : [0.82, 0.82, 0.82];
                b.tri([0, 2.25, 0], [Math.cos(a0) * R, 1.85, Math.sin(a0) * R], [Math.cos(a1) * R, 1.85, Math.sin(a1) * R], [0, 1, 0], [[0, 0], [0, 0], [0, 0]], col);
                b.tri([0, 2.25, 0], [Math.cos(a0) * R, 1.85, Math.sin(a0) * R], [Math.cos(a1) * R, 1.85, Math.sin(a1) * R], [0, -1, 0], [[0, 0], [0, 0], [0, 0]], col.map((v) => v * 0.6));
            }
        },
        pot(b) {                                                               // vaso (cor da instância) com a folhagem
            b.obox(0, 0, 1, 0, 0.17, 0.17, 0, 0.32, [1, 1, 1], 0.21, 0.21);
            b.obox(0, 0, 0.7, 0.7, 0.22, 0.22, 0.3, 0.55, [0.3, 0.55, 0.26], 0.12, 0.12);
            b.obox(0.04, 0.02, 1, 0, 0.16, 0.16, 0.45, 0.75, [0.35, 0.62, 0.3], 0.05, 0.05);
        },
        shrub(b) {                                                             // arbusto do telhado verde
            b.obox(0, 0, 1, 0, 0.32, 0.32, 0, 0.3, [0.3, 0.52, 0.24], 0.22, 0.22);
            b.obox(0.05, -0.04, 0.7, 0.7, 0.2, 0.2, 0.25, 0.48, [0.36, 0.6, 0.28], 0.08, 0.08);
        },
        skylight(b) {                                                          // claraboia: moldura e o vidro claro
            b.solid(-0.6, -0.9, 0.6, 0.9, 0, 0.12, [0.7, 0.71, 0.73]);
            b.obox(0, 0, 0, 1, 0.82, 0.52, 0.12, 0.2, [0.62, 0.78, 0.86], 0.78, 0.48);
        },
    },

    // ------------------------------------------------------------------ materiais
    _mat(scene, kind) {
        const C = this._mats || (this._mats = {});
        if (C[kind] && C[kind].getScene() === scene) return C[kind];
        const m = new BABYLON.StandardMaterial('roof_3d_' + kind, scene);
        const spec = { zinc: 0.22, metal: 0.3, tarp: 0.06, tar: 0.03, laje: 0.04 }[kind] || 0;
        m.specularColor = new BABYLON.Color3(spec, spec, spec);
        m.specularPower = kind === 'metal' || kind === 'zinc' ? 48 : 16;
        if (!this._cls) this._cls = this._plugin();
        new this._cls(m, this.KINDS.indexOf(kind) + 1);
        return (C[kind] = m);
    },
    _propMat(scene) {
        if (this._pm && this._pm.getScene() === scene) return this._pm;
        const m = new BABYLON.StandardMaterial('roof_3d_pecas', scene);
        m.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
        return (this._pm = m);
    },
    _plugin() {
        return class Roof3DPlugin extends BABYLON.MaterialPluginBase {
            // (ROOFK: cada tipo compila só o seu desenho — o shader com os 10 tipos era executado inteiro em cada pixel no renderizador
            // por software)
            constructor(m, kind) { super(m, 'Roof3D', 125, { ROOF3D: false, ROOFK: 0 }); this.kind = kind; this._enable(true); }
            getClassName() { return 'Roof3DPlugin'; }
            prepareDefines(d) { d.ROOF3D = true; d.ROOFK = this.kind; }
            getUniforms() { return { ubo: [{ name: 'rfK', size: 4, type: 'vec4' }], fragment: 'uniform vec4 rfK;' }; }
            bindForSubMesh(ub) { ub.updateFloat4('rfK', this.kind, Roofs3D.shade, 0, 0); }
            getCustomCode(type) {
                // (sem ponto e vírgula em comentário GLSL: o Babylon corta a linha ali)
                if (type === 'vertex') return {
                    CUSTOM_VERTEX_DEFINITIONS: `
                        #ifdef ROOF3D
                        varying vec3 rfL;
                        varying vec2 rfS;
                        #endif`,
                    CUSTOM_VERTEX_MAIN_END: `
                        #ifdef ROOF3D
                        rfL = position;
                        rfS = vec2(fract(sin(dot(finalWorld[3].xz, vec2(12.9898, 78.233))) * 43758.5453), 0.0);
                        #ifdef INSTANCESCOLOR
                        rfS.y = instanceColor.a;
                        vColor.a = 1.0;
                        #endif
                        #endif`,
                };
                if (type === 'fragment') return {
                    CUSTOM_FRAGMENT_DEFINITIONS: `
                        #ifdef ROOF3D
                        varying vec3 rfL;
                        varying vec2 rfS;
                        float rfH(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
                        float rfN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(rfH(i), rfH(i + vec2(1.0, 0.0)), f.x), mix(rfH(i + vec2(0.0, 1.0)), rfH(i + vec2(1.0, 1.0)), f.x), f.y); }
                        #endif`,
                    CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
                        #ifdef ROOF3D
                        if (rfK.y > 0.5) {
                            float rk = rfK.x, sd = rfS.x * 97.0, code = floor(rfS.y + 0.5), plate = step(999.5, code);
                            code = code - 1.0 - 1000.0 * plate;
                            float rust = mod(code, 10.0) / 9.0, dirt = floor(code / 10.0) / 9.0;
                            vec2 W = vPositionW.xz;
                            vec3 L = plate > 0.5 ? vec3(fract(W.x * 0.5) * 2.0 - 1.0, 0.0, fract(W.y * 0.5) * 2.0 - 1.0) : rfL;
                            #ifdef WEBGL2
                            float fw = length(fwidth(L.xz));
                            #else
                            float fw = 0.02;
                            #endif
                            float fine = 1.0 - smoothstep(0.015, 0.06, fw), mid = 1.0 - smoothstep(0.06, 0.25, fw);
                            float k = 1.0;
                            float big = rfN(W * 0.35 + sd) * 0.65 + rfN(W * 1.1 - sd) * 0.35;
                            if (rk < 1.5) {
#if ROOFK == 1
                                // telha colonial: o tom de cada telha, telhas trocadas, musgo e limo nas juntas
                                vec2 c = floor(vec2((L.x + 1.0) * 2.5, (L.z + 1.0) * 2.5));
                                float h = rfH(c + sd), h2 = rfH(c * 1.7 + sd + 3.1);
                                k = mix(1.0, 0.8 + 0.36 * h, mid);
                                baseColor.rgb *= mix(vec3(1.0), h2 > 0.86 ? vec3(1.12, 0.95, 0.86) : (h2 < 0.1 ? vec3(0.78, 0.74, 0.72) : vec3(1.0)), mid);
                                baseColor.rgb = mix(baseColor.rgb, vec3(0.3, 0.33, 0.22), smoothstep(1.0 - 0.5 * rust, 1.0, big + 0.25) * 0.55);
#endif
                            } else if (rk < 2.5) {
#if ROOFK == 2
                                // telha plana / ardósia / cedro: fiadas, juntas desencontradas e o tom de cada peça
                                float row = floor((L.z + 1.0) * 3.5), u = (L.x + 1.0) * 2.6 + 0.5 * mod(row, 2.0), j = fract(u);
                                float h = rfH(vec2(floor(u), row) + sd);
                                k = mix(1.0, 0.84 + 0.3 * h, mid) * mix(1.0, 0.55, (1.0 - smoothstep(0.0, 0.05, j)) * fine);
                                baseColor.rgb = mix(baseColor.rgb, vec3(0.28, 0.32, 0.22), smoothstep(1.0 - 0.45 * rust, 1.0, big + 0.2) * 0.5);
#endif
                            } else if (rk < 3.5) {
#if ROOFK == 3
                                // zinco: chapa por chapa, a sobreposição no meio, ferrugem e escorridos no sentido da água
                                float sheet = floor((L.x + 1.0) * 1.0), h = rfH(vec2(sheet, sd));
                                k = 0.88 + 0.2 * h;
                                k *= mix(1.0, 0.68, (1.0 - smoothstep(0.0, 0.025, abs(L.z))) * mid);
                                k *= mix(1.0, 0.75, (1.0 - smoothstep(0.0, 0.02, abs(fract((L.x + 1.0) * 0.5 + 0.5) - 0.5) * 2.0)) * mid);
                                float st = rfN(vec2(L.x * 14.0 + sd * 3.0, L.z * 0.9 + sd));
                                float r = smoothstep(1.0 - 0.75 * rust, 1.05, big * 0.75 + st * 0.35);
                                baseColor.rgb = mix(baseColor.rgb, vec3(0.5, 0.29, 0.14) * (0.75 + 0.4 * st), r);
                                k *= mix(1.0, 0.86 + 0.14 * st, mid);
#endif
                            } else if (rk < 4.5) {
#if ROOFK == 4
                                // chapa com junta em pé: a nervura clara, tom por chapa
                                float s = abs(fract((L.x + 1.0) * 2.0) - 0.5);
                                k = (0.92 + 0.14 * rfH(vec2(floor((L.x + 1.0) * 2.0), sd))) * mix(1.0, 1.15, (1.0 - smoothstep(0.02, 0.05, 0.5 - s)) * mid);
                                baseColor.rgb = mix(baseColor.rgb, vec3(0.42, 0.26, 0.15), smoothstep(1.0 - 0.4 * rust, 1.05, big) * 0.6);
#endif
                            } else if (rk < 5.5) {
#if ROOFK == 5
                                // lona: desbotada pelo sol em manchas, sujeira nas dobras
                                float f = rfN(W * 0.8 + sd);
                                baseColor.rgb = mix(baseColor.rgb, vec3(dot(baseColor.rgb, vec3(0.33)) * 1.25), smoothstep(0.55, 0.9, f) * 0.45);
                                k = 0.94 + 0.12 * rfN(W * 3.0 - sd);
#endif
                            } else if (rk < 6.5) {
#if ROOFK == 6
                                // laje crua: as tábuas da fôrma, manchas d'água, a emenda das placas
                                float bd = (L.z + 1.0) * 4.0, seam = smoothstep(0.93, 1.0, abs(fract(bd) - 0.5) * 2.0);
                                k = mix(1.0, 0.95 + 0.08 * rfH(vec2(floor(bd), sd)), mid) * mix(1.0, 0.88, seam * fine);
                                k *= 0.9 + 0.2 * rfN(W * 1.7 + sd);
                                k *= mix(1.0, 0.8 + 0.4 * rfH(floor(W * 30.0)), fine * 0.5);
                                k *= mix(1.0, 0.7, smoothstep(0.62, 0.8, big) * dirt);
#endif
                            } else if (rk < 7.5) {
#if ROOFK == 7
                                // manta asfáltica: brita e poças
                                k = mix(1.0, 0.8 + 0.4 * rfH(floor(W * 40.0)), fine * 0.6) * mix(1.0, 0.72, smoothstep(0.6, 0.78, big) * dirt);
#endif
                            } else if (rk < 8.5) {
#if ROOFK == 8
                                // concreto: as juntas das placas (a borda do painel), o tom de cada placa e as manchas
                                float e = min(1.0 - abs(L.x), 1.0 - abs(L.z));
                                k = (0.93 + 0.12 * rfH(vec2(sd, 1.0))) * mix(1.0, 0.62, (1.0 - smoothstep(0.004, 0.018, e)) * mid) * mix(1.0, 0.8, smoothstep(0.66, 0.82, big) * dirt);
#endif
                            } else if (rk < 9.5) {
#if ROOFK == 9
                                // laje pintada: a tinta gasta (aparece o cimento) e as juntas
                                float wv = smoothstep(0.62, 0.8, big * 0.7 + rfN(W * 2.2 + sd) * 0.3);
                                baseColor.rgb = mix(baseColor.rgb, vec3(0.62, 0.61, 0.58), wv * 0.7);
                                float e = min(1.0 - abs(L.x), 1.0 - abs(L.z));
                                k = mix(1.0, 0.75, (1.0 - smoothstep(0.004, 0.02, e)) * mid);
#endif
                            } else {
#if ROOFK == 10
                                // telhado verde: o gramado em tufos, manchas secas
                                float gr = rfN(W * 3.5 + sd) * 0.6 + rfN(W * 9.0) * 0.4 * fine;
                                k = 0.78 + 0.42 * gr;
                                baseColor.rgb = mix(baseColor.rgb, vec3(0.62, 0.58, 0.3), smoothstep(0.7, 0.9, big) * 0.5);
#endif
                            }
                            baseColor.rgb *= k * (1.0 + (rfH(floor(W * 24.0)) - 0.5) * 0.1 * fine);
                        }
                        #endif`,
                };
                return null;
            }
        };
    },
};
