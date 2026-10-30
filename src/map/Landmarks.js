// ============================================================================
// Landmarks — os MARCOS do mapa (estrutura do mapa de referência), com os nomes do jogo mantidos:
//   • MARACANÃ: o complexo a oeste do Centro — estádio, esplanada, estacionamento, estação, Maracanãzinho, parque aquático, e o
//     interior entrável — fica em Maracana.js;
//   • CRISTO no alto do CORCOVADO (a serra no lugar do antigo lago do norte): o complexo inteiro — morro, escadarias, elevador, trem —
//     fica em Corcovado.js;
//   • PÃO DE AÇÚCAR: o penedo na ponta leste da praia do sul, com o BONDINHO subindo da areia;
//   • a PRAIA DO SUL: o CALÇADÃO de ondas pretas e brancas ao longo da Av. do Contorno, quiosques, postos de salva-vidas, coqueiros e
//     guarda-sóis na areia;
//   • as PONTES ESTAIADAS: pilones e estais nas pontes norte e do meio;
//   • PÍERES com barcos atracados no canal (anda-se neles como em terra: MapGeo.onDock) — barcos de verdade, roubáveis (BoatManager).
//   build()         (CityGrid.finish, antes do campo) lugares, sólidos, POIs e os props da praia
//   covers(x, z, m) o ponto é terreno de um marco? (nada de mato, fazenda ou casinha em cima)
//   onPier(x, z)    em cima de um píer
//   meshes(wb)      (WorldBuilder) a geometria
//   update(dt)      o bondinho indo e vindo (e o passeio: E na estação da praia, paga a passagem, sobe e volta na cabine)
//   prompt(g) / interact(g) / zoomFor(pl)   o passeio de bondinho (Game)
// ============================================================================

const Landmarks = {
    BONDE: { a: [214, -1012, 5], b: [338, -1066, 46] },                       // (a estação do alto é uma torre sobre o cume: o cabo passa por cima da pedra)
    BONDE_FARE: 30,                                                              // a passagem do bondinho (ida e volta)
    BONDE_T: [22, 6, 22],                                                        // o passeio: subida, lá em cima, descida (s)
    PIERS_CITY: [392, -214, -812],
    PIERS_ISLAND: [452, -318],

    stadium: null, cristo: null, beach: null, piers: [], boats: [], pylons: [], kiosks: [], towers: [],
    built: false,

    // ---------------------------------------------------------------- lugares
    build() {
        if (this.built) return;
        this.built = true;
        this._stadium();
        this._cristo();
        this._beach();
        this._pylons();
        console.log(`[MARCOS] estádio ${this.stadium ? 'ok' : 'SEM LUGAR'}, Cristo, calçadão (${this.beach ? this.beach.strips.length : 0} trechos, ${this.kiosks.length} quiosques), ${this.piers.length} píeres, ${this.pylons.length} pilones`);
    },

    _stadium() {
        Maracana.build();                                                        // o complexo do Maracanã (Maracana.js)
        this.stadium = Maracana.S;
    },

    _cristo() {
        Corcovado.build();                                                       // o Corcovado: morro, mirante, escadarias, elevador, trem
        this.cristo = Corcovado.C;
        const B = this.BONDE, P = WorldMap.PAO;
        CityGrid.addPoi({ type: 'bondinho', name: 'Bondinho do Pão de Açúcar', x: B.a[0] - 6, z: B.a[1] + 4 });
        // o penedo: sólido no pé (a pedra sobe acima da pista: ninguém atravessa)
        CityGrid.addObstacles([{ x0: P.x - 50, z0: P.z - 33, x1: P.x + 50, z1: P.z + 33, h: 30 }, { x0: P.x - 33, z0: P.z - 42, x1: P.x + 33, z1: P.z + 42, h: 30 }]);
    },

    // O calçadão: do lado de fora da Av. do Contorno, no trecho da praia do sul, depois da calçada de borda — 9 u de largura.
    _beach() {
        const BE = WorldMap.BEACH, W = 9, strips = [], Q = {}, rng = Pixel.rng(4242);
        for (const e of RoadPlan.edges) {
            if (!e.free || e.name !== 'Av. do Contorno') continue;
            const hw = e.w / 2, SW = 4, s0 = 0, s1 = e.len;                       // (do lado da areia não entra rua: o calçadão segue pelos cruzamentos)
            let run = null;
            const flush = () => { if (run && run.inner.length >= 3) strips.push(run); run = null; };
            for (let s = s0; ; s = Math.min(s1, s + 2.5)) {
                RoadPlan.at(e, s, Q);
                // lado de fora: o que não é cidade
                let nx = -Q.tz, nz = Q.tx;
                if (CityGrid.inCity(Q.x + nx * (hw + 3), Q.z + nz * (hw + 3))) { nx = -nx; nz = -nz; }
                const ix = Q.x + nx * (hw + SW), iz = Q.z + nz * (hw + SW), ox = ix + nx * W, oz = iz + nz * W;
                const inBeach = ix > BE.x0 && ix < BE.x1 && iz < BE.z1 + 30 && nz < -0.35 && WorldMap.isLand(ox, oz);
                if (inBeach) {
                    if (!run) run = { inner: [], outer: [], n: [], s: [] };
                    run.inner.push([ix, iz]); run.outer.push([ox, oz]); run.n.push([nx, nz]); run.s.push(s);
                } else flush();
                if (s >= s1) break;
            }
            flush();
        }
        if (!strips.length) return;
        this.beach = { strips, W };
        // quiosques e postos de salva-vidas na areia, logo depois do calçadão; coqueiros na beira; guarda-sóis espalhados na areia
        const props = CityGrid.coastProps;
        for (const st of strips) {
            let since = 30, sinceT = 70, sinceP = 0;
            for (let i = 1; i < st.outer.length; i++) {
                const p = st.outer[i], q = st.outer[i - 1], n = st.n[i], d = hypot(p[0] - q[0], p[1] - q[1]);
                since += d; sinceT += d; sinceP += d;
                if (sinceP >= 14) { sinceP = 0; props.push({ type: 'tree', kind: 'palm', x: p[0] + n[0] * 2.2, z: p[1] + n[1] * 2.2, s: 0.95 + rng() * 0.25, seed: Math.floor(rng() * 1000) }); }
                if (since >= 64) {
                    since = 0;
                    const k = { x: p[0] + n[0] * 7, z: p[1] + n[1] * 7, a: Math.atan2(n[0], n[1]), c: ['#2e8b57', '#d9482b', '#1f6fb5', '#e8a33a'][this.kiosks.length % 4] };
                    this.kiosks.push(k);
                    if (typeof Stands !== 'undefined') Stands.add({ id: 'kiosk' + this.kiosks.length, name: 'Quiosque da praia', emo: '🥥', x: k.x, z: k.z, r: 3.8, hours: [8, 23], items: Stands.MENUS.kiosk, sub: 'Coco gelado, mate e biscoito — é praia!',      // (vende de verdade, com o quiosqueiro)
                        vendor: { x: k.x + n[1] * 2.6, z: k.z - n[0] * 2.6, h: Math.atan2(-n[0], -n[1]), type: 'civil_ambulante' } });      // (ao lado do balcão)
                    CityGrid.addObstacles([{ x0: k.x - 1.8, z0: k.z - 1.8, x1: k.x + 1.8, z1: k.z + 1.8, h: 2.6 }]);
                    for (let t = 0; t < 4; t++) props.push({ type: 'prop', kind: 'umbrella', x: k.x + (t % 2 ? 4 : -4) + (rng() - 0.5), z: k.z + n[1] * (t < 2 ? 4 : 8) + (rng() - 0.5), s: 0.75, seed: Math.floor(rng() * 1000) });
                } else if (sinceT >= 150) {
                    sinceT = 0;
                    const t = { x: p[0] + n[0] * 26, z: p[1] + n[1] * 26 };
                    if (WorldMap.isLand(t.x, t.z) && MapGeo.waterDepth(t.x, t.z) <= 0) { this.towers.push(t); CityGrid.addObstacles([{ x0: t.x - 1.2, z0: t.z - 1.2, x1: t.x + 1.2, z1: t.z + 1.2, h: 4 }]); }
                }
            }
        }
        // guarda-sóis em grupos na areia (entre o calçadão e a água)
        for (let tries = 0, n = 0; tries < 900 && n < 70; tries++) {
            const x = BE.x0 + 20 + rng() * (BE.x1 - BE.x0 - 70), z = BE.z1 - 40 - rng() * 170;
            if (!WorldMap.isLand(x, z) || WorldMap.biomeAt(x, z) !== WorldMap.B.SAND || WorldMap.waterDist(x, z) < 8 || this._nearBeachStrip(x, z, 14) || CityGrid.inCity(x, z)) continue;
            props.push({ type: 'prop', kind: 'umbrella', x, z, s: 0.75 + rng() * 0.2, seed: Math.floor(rng() * 1000) });
            n++;
        }
    },
    _nearBeachStrip(x, z, m) {
        if (!this.beach) return false;
        const bb = this.beach.box || (this.beach.box = this.beach.strips.reduce((b, st) => { for (const p of st.inner.concat(st.outer)) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); } return b; }, [1e9, 1e9, -1e9, -1e9]));
        if (x < bb[0] - m - 9 || x > bb[2] + m + 9 || z < bb[1] - m - 9 || z > bb[3] + m + 9) return false;
        for (const st of this.beach.strips) for (let i = 0; i < st.outer.length; i += 2) { const p = st.outer[i]; if (Math.abs(p[0] - x) < m + 9 && Math.abs(p[1] - z) < m + 9) return true; }
        return false;
    },

    // (depois da marina: os píeres ficam longe dela)
    buildPiers() { if (!this.piers.length) this._piers(); },

    // Píeres: do primeiro ponto de água a leste da cidade (ou a oeste da ilha), 34 u canal adentro; barcos atracados dos dois lados.
    _piers() {
        const add = (z, dir, x0, x1) => {
            let xs = null;
            for (let x = x0; dir > 0 ? x < x1 : x > x1; x += dir) if (MapGeo.waterDepth(x, z) > 0.5) { xs = x - dir * 3; break; }
            if (xs === null) return;
            if (typeof Marina !== 'undefined' && Marina.box && z > Marina.box[1] - 30 && z < Marina.box[3] + 30) return;
            for (const b of [714, 0, -630]) if (Math.abs(z - b) < 40) return;
            const L = 34, w = 2.2, xa = Math.min(xs, xs + dir * L), xb = Math.max(xs, xs + dir * L);
            const P = { x0: xa, x1: xb, z0: z - w, z1: z + w, dir, head: [Math.min(xs + dir * (L - 6), xs + dir * L), z - 7, Math.max(xs + dir * (L - 6), xs + dir * L), z + 7] };
            this.piers.push(P);
            const tip = xs + dir * (L - 14);
            const h = dir > 0 ? Math.PI / 2 : -Math.PI / 2;                                // (a proa para o canal)
            this.boats.push({ kind: 'barco', x: tip, z: z + 5.6, h }, { kind: 'lancha', x: tip - dir * 12, z: z - 5.2, h });      // barcos de verdade (BoatManager.spawn)
        };
        for (const z of this.PIERS_CITY) add(z, 1, 150, 340);
        for (const z of this.PIERS_ISLAND) add(z, -1, 470, 300);
    },
    onPier(x, z) {
        for (const p of this.piers) {
            if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return true;
            const h = p.head; if (x > h[0] && x < h[2] && z > h[1] && z < h[3]) return true;
        }
        return false;
    },

    // Pontes estaiadas: dois pilones (pernas fora do tabuleiro, na água) nas pontes norte e do meio.
    _pylons() {
        for (const e of RoadPlan.edges) {
            if (e.cls !== 'bridge' || e.v) continue;
            const zm = e.a.z;
            if (Math.abs(zm - 714) > 4 && Math.abs(zm) > 4) continue;
            const hw = e.w / 2, SW = 3, x0 = e.a.x + e.a.hwNS, x1 = e.b.x - e.b.hwNS;
            for (const t of [0.34, 0.66]) {
                const x = x0 + (x1 - x0) * t, off = hw + SW + 2.4;
                this.pylons.push({ x, zm, off, hw, SW, span: (x1 - x0) * 0.16 });
                for (const s of [-1, 1]) CityGrid.addObstacles([{ x0: x - 1.2, z0: zm + s * off - 1.2, x1: x + 1.2, z1: zm + s * off + 1.2, h: 30 }]);
            }
        }
    },

    covers(x, z, m = 0) {
        if (this.stadium && Maracana.covers(x, z, m)) return true;
        if (this.cristo && Corcovado.covers(x, z, m)) return true;
        const P = WorldMap.PAO;
        if (hypot(x - P.x, z - P.z) < 50 + m) return true;
        for (const k of this.kiosks) if (Math.abs(x - k.x) < 4 + m && Math.abs(z - k.z) < 4 + m) return true;
        return false;
    },

    // ---------------------------------------------------------------- mapa (MapRenderer.drawView)
    // Os marcos vistos de cima, no mapa da pausa e no GPS: X/Y do mundo para o canvas, k px por u, vis(x0, z0, x1, z1) na tela?
    drawMap(ctx, X, Y, k, vis) {
        const rect = (x0, z0, x1, z1, c) => { ctx.fillStyle = c; ctx.fillRect(X(x0), Y(z1), (x1 - x0) * k, (z1 - z0) * k); };
        const shadow = (fn) => { ctx.save(); ctx.globalAlpha = 0.3; ctx.translate(1.6 * k, 1.6 * k); fn('#0a0e14'); ctx.restore(); };
        // o calçadão (ondas pretas e brancas) e, na areia, quiosques e postos de salva-vidas
        if (this.beach) for (const st of this.beach.strips) {
            const bx = st.box || (st.box = st.inner.concat(st.outer).reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [1e9, 1e9, -1e9, -1e9]));
            if (!vis(bx[0], bx[1], bx[2], bx[3])) continue;
            ctx.beginPath();
            st.inner.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
            for (let i = st.outer.length - 1; i >= 0; i--) ctx.lineTo(X(st.outer[i][0]), Y(st.outer[i][1]));
            ctx.closePath();
            ctx.fillStyle = k >= 1.4 ? this._wavePattern(ctx, k) : '#dedad0'; ctx.fill();
        }
        if (k >= 0.9) {
            for (const q of this.kiosks) if (vis(q.x - 3, q.z - 3, q.x + 3, q.z + 3)) { shadow((c) => rect(q.x - 1.9, q.z - 1.9, q.x + 1.9, q.z + 1.9, c)); rect(q.x - 1.9, q.z - 1.9, q.x + 1.9, q.z + 1.9, q.c); rect(q.x - 0.9, q.z - 0.9, q.x + 0.9, q.z + 0.9, '#f4efe2'); }
            for (const t of this.towers) if (vis(t.x - 2, t.z - 2, t.x + 2, t.z + 2)) { rect(t.x - 1.2, t.z - 1.2, t.x + 1.2, t.z + 1.2, '#d8402f'); rect(t.x - 0.5, t.z - 0.5, t.x + 0.5, t.z + 0.5, '#f4f4f4'); }
        }
        if (this.stadium) Maracana.drawMap(ctx, X, Y, k, vis);                      // o complexo do Maracanã
        if (this.cristo) Corcovado.drawMap(ctx, X, Y, k, vis);                     // o Corcovado (escadarias, terraço, elevador, trem, mirante)
        // o BONDINHO do Pão de Açúcar: o cabo, as estações e as cabines
        const Bd = this.BONDE;
        if (vis(Math.min(Bd.a[0], Bd.b[0]) - 8, Math.min(Bd.a[1], Bd.b[1]) - 8, Math.max(Bd.a[0], Bd.b[0]) + 8, Math.max(Bd.a[1], Bd.b[1]) + 8)) {
            ctx.save(); ctx.strokeStyle = '#2b2f36'; ctx.lineWidth = Math.max(1, 0.4 * k); ctx.setLineDash([Math.max(2, 2 * k), Math.max(2, 1.4 * k)]);
            ctx.beginPath(); ctx.moveTo(X(Bd.a[0]), Y(Bd.a[1])); ctx.lineTo(X(Bd.b[0]), Y(Bd.b[1])); ctx.stroke(); ctx.restore();
            for (const [p, w, d] of [[Bd.a, 5.4, 3.9], [Bd.b, 4.4, 3.4]]) { shadow((c) => rect(p[0] - w, p[1] - d, p[0] + w, p[1] + d, c)); rect(p[0] - w, p[1] - d, p[0] + w, p[1] + d, '#9a3b2c'); }
            if (k >= 1.2) for (const cb of this._cabins || []) { const q = cb.mesh.position; rect(q.x - 1.2, q.z - 1.2, q.x + 1.2, q.z + 1.2, '#d1291f'); }
        }
        // PÍERES de madeira e os barcos atracados
        for (const P of this.piers) {
            if (!vis(P.x0 - 4, P.head[1] - 6, P.x1 + 4, P.head[3] + 6)) continue;
            shadow((c) => { rect(P.x0, P.z0, P.x1, P.z1, c); rect(P.head[0], P.head[1], P.head[2], P.head[3], c); });
            rect(P.x0, P.z0, P.x1, P.z1, '#9b7550'); rect(P.head[0], P.head[1], P.head[2], P.head[3], '#a47c55');
            if (k >= 2) { ctx.fillStyle = 'rgba(60,40,24,0.45)'; for (let x = P.x0; x < P.x1; x += 1.2) ctx.fillRect(X(x), Y(P.z1), Math.max(1, 0.12 * k), (P.z1 - P.z0) * k); }
        }
        // PONTES ESTAIADAS: os pilones (fora do tabuleiro) e o leque de estais
        for (const p of this.pylons) {
            if (!vis(p.x - p.span - 4, p.zm - p.off - 4, p.x + p.span + 4, p.zm + p.off + 4)) continue;
            if (k >= 0.9) {
                ctx.strokeStyle = 'rgba(236,240,245,0.85)'; ctx.lineWidth = Math.max(0.6, 0.15 * k); ctx.beginPath();
                for (const s of [-1, 1]) for (let j = 1; j <= 4; j++) for (const d of [-1, 1]) { ctx.moveTo(X(p.x), Y(p.zm + s * p.off)); ctx.lineTo(X(p.x + d * p.span * j / 4), Y(p.zm + s * (p.hw + p.SW * 0.5))); }
                ctx.stroke();
            }
            for (const s of [-1, 1]) rect(p.x - 1.3, p.zm + s * p.off - 1.3, p.x + 1.3, p.zm + s * p.off + 1.3, '#e9ebee');
            rect(p.x - 0.5, p.zm - p.off, p.x + 0.5, p.zm + p.off, 'rgba(233,235,238,0.7)');
        }
    },
    // A textura do calçadão no mapa: ondas pretas sobre o branco (um período = 6 u).
    _wavePattern(ctx, k) {
        if (!this._waveCv) {
            const cv = document.createElement('canvas'); cv.width = 64; cv.height = 32;
            const g = cv.getContext('2d'); g.fillStyle = '#f1efe8'; g.fillRect(0, 0, 64, 32);
            g.fillStyle = '#22252a'; g.beginPath();
            for (let x = 0; x <= 64; x++) g.lineTo(x, 16 + Math.sin((x / 64) * Math.PI * 2) * 7 - 4);
            for (let x = 64; x >= 0; x--) g.lineTo(x, 16 + Math.sin((x / 64) * Math.PI * 2) * 7 + 4);
            g.closePath(); g.fill();
            this._waveCv = cv;
        }
        const pat = ctx.createPattern(this._waveCv, 'repeat'), s = (6 * k) / 64;
        if (pat.setTransform && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix([s, 0, 0, s, 0, 0]));
        return pat;
    },

    // ---------------------------------------------------------------- geometria
    meshes(wb) {
        if (!this.built) return;
        this._wb = wb;
        const t0 = performance.now();
        if (this.stadium) Maracana.meshes(wb);
        if (this.cristo) Corcovado.meshes(wb);
        this._meshPao(wb);
        if (this.beach) this._meshBeach(wb);
        this._meshPiers(wb);
        this._meshPylons(wb);
        console.log(`[MARCOS] geometria em ${(performance.now() - t0).toFixed(0)} ms`);
    },

    // Cor de vértice a partir de '#rrggbb' (ou [r, g, b]) com um fator.
    _c(c, k = 1) { if (Array.isArray(c)) return [c[0] * k, c[1] * k, c[2] * k]; const p = Pixel.hex(c); return [p[0] / 255 * k, p[1] / 255 * k, p[2] / 255 * k]; },
    // Viga entre dois pontos 3D (seção quadrada t), cor col, no lote bt.
    _beam(bt, a, b, t, col) {
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1, d = [dx / L, dy / L, dz / L];
        let u = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        let s = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
        const sl = Math.hypot(...s); s = s.map((v) => v / sl * t / 2);
        u = [d[1] * s[2] - d[2] * s[1], d[2] * s[0] - d[0] * s[2], d[0] * s[1] - d[1] * s[0]].map((v) => v / (t / 2) * t / 2);
        const P = (p, i, j) => [p[0] + s[0] * i + u[0] * j, p[1] + s[1] * i + u[1] * j, p[2] + s[2] * i + u[2] * j];
        const A = [P(a, -1, -1), P(a, 1, -1), P(a, 1, 1), P(a, -1, 1)], B = [P(b, -1, -1), P(b, 1, -1), P(b, 1, 1), P(b, -1, 1)], z3 = [[0, 0], [0, 0], [0, 0]];
        for (let i = 0; i < 4; i++) {
            const j = (i + 1) % 4, c = [(A[i][0] + A[j][0]) / 2 - a[0], (A[i][1] + A[j][1]) / 2 - a[1], (A[i][2] + A[j][2]) / 2 - a[2]], cl = Math.hypot(...c) || 1, n = c.map((v) => v / cl);
            bt.tri(A[i], A[j], B[j], n, z3, col); bt.tri(A[i], B[j], B[i], n, z3, col);
        }
        bt.tri(B[0], B[1], B[2], d, z3, col); bt.tri(B[0], B[2], B[3], d, z3, col);
    },
    // Anel elíptico (cx, cz, rx, rz) entre as razões k0 → k1 nas alturas y0 → y1 (inclinado se y0 ≠ y1), n gomos; colFn(i) → cor.
    // tex > 0: lote texturizado (piso de praça...), UV no plano do mundo com um ladrilho a cada `tex` u.
    _ring(bt, cx, cz, rx, rz, k0, k1, y0, y1, n, colFn, up = true, tex = 0) {
        const P = (a, k, y) => [cx + Math.cos(a) * rx * k, y, cz + Math.sin(a) * rz * k], z3 = [[0, 0], [0, 0], [0, 0]];
        const uv = (...p) => (tex ? p.map((q) => [q[0] / tex, -q[2] / tex]) : z3);
        for (let i = 0; i < n; i++) {
            const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, col = colFn(i);
            const A = P(a0, k0, y0), B = P(a1, k0, y0), C = P(a1, k1, y1), D = P(a0, k1, y1);
            const nn = up ? [0, 1, 0] : [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)];
            bt.tri(A, B, C, nn, uv(A, B, C), col); bt.tri(A, C, D, nn, uv(A, C, D), col);
        }
    },
    // Parede da elipse (razão k) de y0 a y1, normal para fora (out = 1) ou para dentro (−1).
    _wall(bt, cx, cz, rx, rz, k, y0, y1, n, colFn, out = 1) {
        const P = (a, y) => [cx + Math.cos(a) * rx * k, y, cz + Math.sin(a) * rz * k], z3 = [[0, 0], [0, 0], [0, 0]];
        for (let i = 0; i < n; i++) {
            const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2, col = colFn(i);
            if (!col) continue;
            const nn = [Math.cos(am) / rx * out, 0, Math.sin(am) / rz * out], l = Math.hypot(nn[0], nn[2]);
            bt.tri(P(a0, y0), P(a1, y0), P(a1, y1), [nn[0] / l, 0, nn[2] / l], z3, col); bt.tri(P(a0, y0), P(a1, y1), P(a0, y1), [nn[0] / l, 0, nn[2] / l], z3, col);
        }
    },

    _pitchTex(scene) {
        const W = 640, H = 480, t = new BABYLON.DynamicTexture('stadiumPitchTex', { width: W, height: H }, scene, true);
        const g = t.getContext();
        for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#3f9a3c' : '#4aab45'; g.fillRect((i * W) / 12, 0, W / 12 + 1, H); }
        g.strokeStyle = 'rgba(255,255,255,0.92)'; g.lineWidth = 4;
        const m = 26, w = W - 2 * m, h = H - 2 * m;
        g.strokeRect(m, m, w, h);
        g.beginPath(); g.moveTo(W / 2, m); g.lineTo(W / 2, H - m); g.stroke();
        g.beginPath(); g.arc(W / 2, H / 2, 54, 0, Math.PI * 2); g.stroke();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(W / 2, H / 2, 5, 0, Math.PI * 2); g.fill();
        for (const s of [0, 1]) {
            const x = s ? W - m : m, d = s ? -1 : 1;
            g.strokeRect(Math.min(x, x + d * 98), H / 2 - 120, 98, 240);
            g.strokeRect(Math.min(x, x + d * 34), H / 2 - 56, 34, 112);
            g.beginPath(); g.arc(x + d * 70, H / 2, 5, 0, Math.PI * 2); g.fill();
            g.beginPath(); g.arc(x + d * 70, H / 2, 54, s ? Math.PI - 0.93 : -0.93, s ? Math.PI + 0.93 : 0.93); g.stroke();
            g.fillStyle = '#f4f4f4'; g.fillRect(s ? W - m : m - 10, H / 2 - 24, 10, 48); g.fillStyle = '#fff';
            for (const cz of [m, H - m]) { g.beginPath(); g.arc(x, cz, 12, s ? (cz === m ? Math.PI / 2 : Math.PI) : (cz === m ? 0 : -Math.PI / 2), s ? (cz === m ? Math.PI : Math.PI * 1.5) : (cz === m ? Math.PI / 2 : 0)); g.stroke(); }
        }
        t.update(true);
        t.anisotropicFilteringLevel = 4;
        return t;
    },

    // O PÃO DE AÇÚCAR: um penedo arredondado (malha própria, normais suaves), pedra cinza com veios e a mata no pé; o BONDINHO sobe da
    // estação da praia até o topo (dois cabos, duas cabines indo e vindo).
    _meshPao(wb) {
        const P = WorldMap.PAO, scene = wb.scene, R = 18, A = 48, rx = 58, rz = 46, H = 36, pos = [], col = [], idx = [], uvs = [];
        for (let i = 0; i <= R; i++) {
            const r = (i / R) * 1.12;
            for (let j = 0; j < A; j++) {
                const a = (j / A) * Math.PI * 2, n = WorldMap._fbm(Math.cos(a) * 3 + 11, Math.sin(a) * 3 + r * 2, 3, 81);
                const rr = r * (0.92 + 0.16 * n), x = P.x + Math.cos(a) * rx * rr, z = P.z + Math.sin(a) * rz * rr;
                const h = r < 1 ? H * Math.pow(Math.max(0, 1 - Math.pow(r, 2.6)), 0.55) * (0.94 + 0.12 * n) : 0;
                pos.push(x, h - 0.6, z);
                // a cor do vértice tinge a textura da pedra: veios verticais (a chuva escorrendo) e a mata no pé, em manchas
                const streak = 0.82 + 0.3 * WorldMap._fbm(x / 3, h / 9, 2, 82), base = Math.max(0, Math.min(1, (10 - h + 6 * (WorldMap._fbm(x / 7, z / 7, 2, 83) - 0.5)) / 6));
                const rock = [1.02 * streak, 0.98 * streak, 0.92 * streak], green = [0.42, 0.66, 0.34];
                col.push(rock[0] + (green[0] - rock[0]) * base, rock[1] + (green[1] - rock[1]) * base, rock[2] + (green[2] - rock[2]) * base, 1);
                uvs.push(x / 9, (h - z) / 9);
            }
        }
        for (let i = 0; i < R; i++) for (let j = 0; j < A; j++) {
            const a = i * A + j, b = i * A + (j + 1) % A, c = (i + 1) * A + j, d = (i + 1) * A + (j + 1) % A;
            idx.push(a, d, b, a, c, d);
        }
        const mesh = new BABYLON.Mesh('paoDeAcucar', scene), vd = new BABYLON.VertexData(), nor = [];
        BABYLON.VertexData.ComputeNormals(pos, idx, nor);
        vd.positions = pos; vd.indices = idx; vd.normals = nor; vd.colors = col; vd.uvs = uvs;
        vd.applyToMesh(mesh);
        const m = new BABYLON.StandardMaterial('paoDeAcucar', scene);
        m.diffuseTexture = wb.mats.rock.diffuseTexture;                                     // (a mesma pedra HD do terreno)
        m.specularColor = new BABYLON.Color3(0.06, 0.06, 0.06);
        mesh.material = m; mesh.useVertexColors = true; mesh.isPickable = false; mesh.receiveShadows = true; mesh.freezeWorldMatrix();
        if (wb.shadow) wb.shadow.addShadowCaster(mesh);
        wb.meshes.push(mesh); wb.mats.paoDeAcucar = m;
        wb._collider('pao_a', P.x - 50, P.z - 33, P.x + 50, P.z + 33, 30);
        // bondinho: estações, cabos e as cabines (que andam: update)
        const B = this.BONDE, bt = wb._batch('trim', B.a[0], B.a[1]), c = this._c.bind(this);
        bt.solid(B.a[0] - 5, B.a[1] - 3.5, B.a[0] + 5, B.a[1] + 3.5, 0.2, 5.2, c('#e9e4d6'));
        bt.solid(B.a[0] - 5.4, B.a[1] - 3.9, B.a[0] + 5.4, B.a[1] + 3.9, 5.2, 5.8, c('#9a3b2c'));
        bt.solid(B.b[0] - 4, B.b[1] - 3, B.b[0] + 4, B.b[1] + 3, 30, B.b[2] + 0.6, c('#e9e4d6'));
        bt.solid(B.b[0] - 4.4, B.b[1] - 3.4, B.b[0] + 4.4, B.b[1] + 3.4, B.b[2] + 0.6, B.b[2] + 1.1, c('#9a3b2c'));
        const dx = B.b[0] - B.a[0], dz = B.b[1] - B.a[1], L = Math.hypot(dx, dz), px = -dz / L, pz = dx / L;
        this._cable = [];
        for (const s of [-1.3, 1.3]) {
            const a = [B.a[0] + px * s, B.a[2] + 0.4, B.a[1] + pz * s], b = [B.b[0] + px * s, B.b[2] + 0.4, B.b[1] + pz * s];
            this._beam(bt, a, b, 0.14, c('#3b3f46'));
            this._cable.push([a, b]);
        }
        const cabins = [];
        for (let k = 0; k < 2; k++) {
            const box = BABYLON.MeshBuilder.CreateBox('bondinho' + k, { width: 2.4, height: 2.2, depth: 2.4 }, scene), bm = new BABYLON.StandardMaterial('bondinho' + k, scene);
            bm.diffuseColor = new BABYLON.Color3(0.82, 0.16, 0.12); bm.specularColor = new BABYLON.Color3(0.25, 0.25, 0.25); bm.emissiveColor = new BABYLON.Color3(0.08, 0.02, 0.02);
            box.material = bm; box.isPickable = false;
            const win = BABYLON.MeshBuilder.CreateBox('bondinhoV' + k, { width: 2.5, height: 0.7, depth: 2.5 }, scene), wm = new BABYLON.StandardMaterial('bondinhoV' + k, scene);
            wm.diffuseColor = new BABYLON.Color3(0.55, 0.75, 0.86); wm.specularColor = new BABYLON.Color3(0.5, 0.5, 0.5);
            win.material = wm; win.parent = box; win.position.y = 0.35; win.isPickable = false;
            cabins.push({ mesh: box, t: k ? 0.85 : 0.15, dir: k ? -1 : 1, cable: this._cable[k] });
            wb.meshes.push(box, win);
        }
        this._cabins = cabins;
        this.update(0);
    },
    // ---------------------------------------------------------------- gente e som (NPCManager, Ambience)
    // Movimento de pedestres no lugar (0..1, como NPCManager._density) ou null fora dos marcos: a esplanada e o estacionamento do
    // Maracanã (cheios com o estádio aberto), a praça do portão do Corcovado, o calçadão.
    crowd(x, z) {
        if (!this.built) return null;
        if (this.stadium) { const m = Maracana.crowd(x, z); if (m !== null) return m; }
        if (this.cristo) { const g = Corcovado.W(-8, -71); if (Math.abs(x - g[0]) < 24 && Math.abs(z - g[1]) < 16) return 0.85; }
        if (this.beach && this._nearBeachStrip(x, z, 1)) return 1;
        return null;
    },
    // Quem anda por ali (NPCManager._style): a torcida de camisa na esplanada do Maracanã, turistas no portão do Corcovado; null: o normal.
    crowdStyle(x, z, r) {
        if (!this.built) return null;
        if (this.stadium && Maracana.crowd(x, z) === 1) return r < 0.6 ? 'sport' : 'casual';
        if (this.cristo) { const g = Corcovado.W(-8, -71); if (Math.abs(x - g[0]) < 24 && Math.abs(z - g[1]) < 16) return r < 0.6 ? 'tourist' : 'casual'; }
        return null;
    },
    // O burburinho da torcida em volta do Maracanã aberto (mais alto no jogo da noite).
    crowdSound(x, z, h) { return this.stadium ? Maracana.crowdSound(x, z, h) : 0; },

    // ---------------------------------------------------------------- o passeio de bondinho
    _bondeSpot(g) {
        if (!this._cabins || this.ride || g.mode !== 'player') return false;
        const pl = g.player, B = this.BONDE;
        return !pl.onDeck && !pl.underBridge && !pl.busy && !pl.frozen && hypot(pl.position.x - B.a[0], pl.position.z - B.a[1]) < 7.5;
    },
    prompt(g) { return this._bondeSpot(g) ? `<b>E</b> Bondinho do Pão de Açúcar — ${brl(this.BONDE_FARE)}<small>passeio até o alto do penedo e volta</small>` : ''; },
    interact(g) {
        if (!this._bondeSpot(g)) return false;
        const pl = g.player, inv = g.inventory;
        if (inv.cash < this.BONDE_FARE) { g._flash(`Bondinho: ${brl(this.BONDE_FARE)} — dinheiro insuficiente`); return true; }
        inv.cash -= this.BONDE_FARE;
        pl.cancelSequence(); pl.action = null; pl.velocity.setAll(0);
        pl.setVisible(false); pl.frozen = true; pl.invulnerable = true;
        this._net = this._net || { name: 'Bondinho', parts: [] };                  // (lá em cima a câmera mira a cabine: Game, pl.walk/deckH)
        pl.walk = this._net; pl.onDeck = true; pl.roof = null;
        this.ride = { g, t: 0, back: { x: pl.position.x, z: pl.position.z }, top: false };
        g._flash(`🚡 Bondinho do Pão de Açúcar (−${brl(this.BONDE_FARE)}): subindo…`);
        return true;
    },
    // Multiplicador do zoom automático no passeio: abre com a altura da cabine.
    zoomFor(pl) { return this.ride && pl.walk === this._net ? 1 + 1.25 * Math.min(1, (pl.deckH || 0) / 30) : 1; },
    _rideStep(dt) {
        const R = this.ride, g = R.g, pl = g.player, [tu, tw, td] = this.BONDE_T, C = this._cabins;
        R.t += dt;
        const e = (k) => k * k * (3 - 2 * k), t = R.t;
        const k = t < tu ? e(t / tu) : t < tu + tw ? 1 : 1 - e(Math.min(1, (t - tu - tw) / td));
        C[0].t = k; C[0].dir = 0; C[1].t = 1 - k; C[1].dir = 0;                      // (as duas cabines se cruzam no meio, como o de verdade)
        if (!R.top && t >= tu) { R.top = true; g._flash('🚡 Alto do Pão de Açúcar — a baía inteira lá embaixo'); }
        if (!pl.alive || t >= tu + tw + td) {
            pl.frozen = false; pl.invulnerable = false; pl.setVisible(true);
            pl.position.x = R.back.x; pl.position.z = R.back.z;
            pl.walk = null; pl.onDeck = false; pl.deckH = 0; pl.actor.mesh.position.y = pl.baseY;
            C[0].dir = 1; C[1].dir = -1;
            this.ride = null;
            g._flash('De volta à estação da praia');
            return;
        }
        const q = C[0].mesh.position;
        pl.position.x = q.x; pl.position.z = q.z; pl.deckH = Math.max(0, q.y - 0.5); pl._walkSt = { x: q.x, z: q.z, h: pl.deckH };
    },

    update(dt) {
        if (this.cristo) Corcovado.update(dt);                                  // (o elevador, o trem e as viagens)
        if (!this._cabins) return;
        if (this.ride) this._rideStep(dt);
        for (const C of this._cabins) {
            C.t += C.dir * dt / 70;                                                             // ~70 s de uma estação à outra
            if (C.t > 1) { C.t = 1; C.dir = -1; } else if (C.t < 0) { C.t = 0; C.dir = 1; }
            const [a, b] = C.cable, t = C.t, sag = Math.sin(t * Math.PI) * 1.4;
            C.mesh.position.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - 1.6 - sag, a[2] + (b[2] - a[2]) * t);
        }
    },

    _meshBeach(wb) {
        const scene = wb.scene, B = this.beach, pos = [], uv = [], idx = [], nor = [];
        for (const st of B.strips) {
            let along = 0;
            for (let i = 0; i < st.inner.length; i++) {
                if (i) along += hypot(st.inner[i][0] - st.inner[i - 1][0], st.inner[i][1] - st.inner[i - 1][1]);
                const a = st.inner[i], b = st.outer[i], base = pos.length / 3;
                pos.push(a[0], 0.19, a[1], b[0], 0.19, b[1]); nor.push(0, 1, 0, 0, 1, 0); uv.push(along / 6, 0, along / 6, B.W / 6);
                if (i) idx.push(base - 2, base, base - 1, base - 1, base, base + 1);
            }
        }
        const mesh = new BABYLON.Mesh('calcadao', scene), vd = new BABYLON.VertexData();
        vd.positions = pos; vd.indices = idx; vd.normals = nor; vd.uvs = uv;
        vd.applyToMesh(mesh);
        // (a orientação de cada trecho depende do sentido da via: os dois lados)
        const m = new BABYLON.StandardMaterial('calcadao', scene);
        m.diffuseTexture = this._calcadaoTex(scene); m.specularColor = BABYLON.Color3.Black(); m.backFaceCulling = false;
        mesh.material = m; mesh.isPickable = false; mesh.receiveShadows = true; mesh.freezeWorldMatrix();
        wb.meshes.push(mesh); wb.mats.calcadao = m;
        // meio-fio do lado da areia; quiosques e postos de salva-vidas
        const c = this._c.bind(this);
        for (const st of B.strips) for (let i = 1; i < st.outer.length; i++) {
            const p = st.outer[i - 1], q = st.outer[i], bt = wb._batch('trim', p[0], p[1]);
            this._beam(bt, [p[0], 0.1, p[1]], [q[0], 0.1, q[1]], 0.26, c('#d6d3cb'));
        }
        for (const k of this.kiosks) {
            const bt = wb._batch('trim', k.x, k.z);
            bt.solid(k.x - 1.5, k.z - 1.5, k.x + 1.5, k.z + 1.5, 0, 2.4, c(k.c));
            bt.solid(k.x - 1.6, k.z - 1.6, k.x + 1.6, k.z + 1.6, 0.95, 1.1, c('#f4efe2'));
            bt.solid(k.x - 2.4, k.z - 2.4, k.x + 2.4, k.z + 2.4, 2.4, 2.75, c('#c99a52'));
            bt.solid(k.x - 1.9, k.z - 1.9, k.x + 1.9, k.z + 1.9, 2.75, 3.05, c('#a8783a'));
        }
        for (const t of this.towers) {
            const bt = wb._batch('trim', t.x, t.z);
            for (const [ax, az] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) this._beam(bt, [t.x + ax, 0, t.z + az], [t.x + ax * 0.7, 2.6, t.z + az * 0.7], 0.22, c('#f2f2f2'));
            bt.solid(t.x - 1.2, t.z - 1.2, t.x + 1.2, t.z + 1.2, 2.6, 4.2, c('#e1342b'));
            bt.solid(t.x - 1.4, t.z - 1.4, t.x + 1.4, t.z + 1.4, 4.2, 4.5, c('#f7f7f7'));
        }
    },
    // O calçadão de Copacabana: ondas largas de pedra portuguesa preta sobre a branca (ladrilho de 6 × 9 u, repete ao longo).
    _calcadaoTex(scene) {
        const W = 512, H = 768, t = new BABYLON.DynamicTexture('calcadaoTex', { width: W, height: H }, scene, true);
        const g = t.getContext();
        g.fillStyle = '#ece8df'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#26272b';
        const wave = (y0, amp) => {
            g.beginPath(); g.moveTo(0, y0);
            for (let x = 0; x <= W; x += 4) g.lineTo(x, y0 + Math.sin((x / W) * Math.PI * 2) * amp);
            for (let x = W; x >= 0; x -= 4) g.lineTo(x, y0 + 58 + Math.sin((x / W) * Math.PI * 2) * amp);
            g.closePath(); g.fill();
        };
        for (let y = 40; y < H; y += 150) wave(y, 52);
        // as pedrinhas: rejunte miúdo
        const rnd = Pixel.rng(99);
        for (let i = 0; i < 9000; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.10)'; g.fillRect(rnd() * W, rnd() * H, 3 + rnd() * 3, 3 + rnd() * 3); }
        t.update(true);
        t.anisotropicFilteringLevel = 4;
        t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
        return t;
    },

    _meshPiers(wb) {
        const c = this._c.bind(this), wood = c('#9a7448'), woodD = c('#6e5233'), post = c('#4a3a28');
        for (const p of this.piers) {
            const bt = wb._batch('trim', p.x0, p.z0);
            bt.solid(p.x0, p.z0, p.x1, p.z1, 0.25, 0.5, wood);
            const h = p.head; bt.solid(h[0], h[1], h[2], h[3], 0.25, 0.5, wood);
            for (let x = p.x0 + 1; x < p.x1; x += 4) for (const z of [p.z0 + 0.2, p.z1 - 0.2]) bt.solid(x - 0.2, z - 0.2, x + 0.2, z + 0.2, -1.5, 0.75, post);
            for (const z of [h[1] + 0.3, h[3] - 0.3]) bt.solid(h[0], z - 0.12, h[2], z + 0.12, 0.5, 1.4, woodD);
        }
    },

    _meshPylons(wb) {
        const c = this._c.bind(this), white = c('#eef0f2'), cable = c('#b8bcc2');
        for (const P of this.pylons) {
            const bt = wb._batch('btrim', P.x, P.zm), top = 31;
            const legs = [-1, 1].map((s) => ({ b: [P.x, -1.5, P.zm + s * P.off], t: [P.x, top, P.zm + s * (P.off - 3.2)] }));
            for (const L of legs) this._beam(bt, L.b, L.t, 1.9, white);
            this._beam(bt, [P.x, 22, P.zm - P.off + 1.2], [P.x, 22, P.zm + P.off - 1.2], 1.4, white);
            this._beam(bt, [P.x, top - 0.6, P.zm - P.off + 3.2], [P.x, top - 0.6, P.zm + P.off - 3.2], 1.2, white);
            // estais: leque dos dois lados (ao longo da ponte), do alto de cada perna até a borda do tabuleiro
            for (const L of legs) for (const d of [-1, 1]) for (let k = 0; k < 7; k++) {
                const dx = 8 + k * (P.span / 7), y = top - 1 - k * 0.7, zEdge = P.zm + Math.sign(L.b[2] - P.zm) * (P.hw + P.SW + 0.2);
                this._beam(bt, [L.t[0], y, L.t[2]], [P.x + d * dx, 1.15, zEdge], 0.16, cable);
            }
            for (const L of legs) wb._collider('pylon', L.b[0] - 1.1, L.b[2] - 1.1, L.b[0] + 1.1, L.b[2] + 1.1, 30);
        }
    },
};
