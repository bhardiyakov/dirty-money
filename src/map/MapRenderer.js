// ============================================================================
// MapRenderer — desenha o mundo (top-down) em qualquer canvas 2D: GPS (minimapa) e mapa de pausa, no estilo de mapa ilustrado.
//   • camada de baixo: o TERRENO pintado em alta definição (MapPaint: mar com degradê de profundidade e espuma, relevo sombreado,
//     copas da mata, talhões das fazendas) — em ladrilhos por nível de zoom, pintados quando aparecem;
//   • por cima, VETORIAL e só do que está na tela: calçadas e quarteirões, ruas com meio-fio (rodovias e a Via Expressa em laranja),
//     prédios com o telhado de cada um e a sombra para o sudeste, árvores dos parques, os marcos (Landmarks: Maracanã, Cristo,
//     bondinho, calçadão, píeres e barcos, pontes estaiadas), o autódromo, nomes de ruas e os territórios — drawView.
// Mapeia o mundo para o canvas por (cx, cz, scale = px por unidade); +Z (norte) fica no topo.
// ============================================================================

const MapRenderer = {
    colors: {
        asphalt: '#50545b',
        dirt: '#b8966a',
        earth: '#a68a68',
        bridge: '#5b5f66',
        sidewalk: '#b9bcc0',
        laneLine: 'rgba(255,255,255,0.42)',
        grass: '#6aa84f',
        sand: '#e6d6a0',
        concrete: '#9fa2a6',
        plaza: '#c9c4b8',
        tree: '#2f6b2a',
        buildingEdge: 'rgba(20,24,30,0.5)',
    },
    // Ruas por classe (RoadPlan.CLASS): [preenchimento, meio-fio/borda]. Rodovias e a Via Expressa: laranja, como nos mapas.
    ROAD: {
        city: ['#50545b', '#2c2f35'], isl: ['#50545b', '#2c2f35'], ave: ['#5c6068', '#2c2f35'], via: ['#666a72', '#2a2d33'],
        hwy: ['#f0a032', '#9a4f14'], express: ['#f0a032', '#9a4f14'], serra: ['#6a6d73', '#3a3c40'],
        fav: ['#b9b3a7', '#6d685f'], dirt: ['#bf9c6e', '#7d6244'], trail: ['#c9ab80', null], bridge: ['#5b5f66', '#d3d6da'],
    },
    // O que falta pintar do terreno (ladrilhos): quem chama redesenha no próximo quadro.
    pending: false,

    // Cor do prédio pelo prefixo do estilo de fachada (quando não há telhado conhecido).
    lotColor(facade) {
        if (facade.startsWith('office')) return '#7b9bb5';
        if (facade.startsWith('brick')) return '#a0614c';
        if (facade.startsWith('house')) return '#d8c9a0';
        if (facade.startsWith('metal')) return '#8b97a3';
        if (facade.startsWith('vid')) return { vid0: '#e98ab0', vid1: '#f2cf4a', vid2: '#4cc3c0', vid3: '#f08a3c', vid4: '#a98ad8', vid5: '#7fc46a' }[facade] || '#e98ab0';
        if (facade.startsWith('caipira') || facade.startsWith('taipa')) return '#e8dcc0';
        if (facade.startsWith('chalet')) return '#c9a27a';
        if (facade.startsWith('stone')) return '#a49a8a';
        return '#b0ada4';
    },
    // Cor do TELHADO do lote no mapa (o mesmo telhado do 3D: TileFactory.roofStyles), um pouco mais clara; os prédios altos
    // (8+ andares) puxam para o vidro azulado dos arranha-céus.
    roofColor(l) {
        if (l.landmark === 'hospital') return '#eef1f3';
        if (l.landmark === 'station') return '#2f4a8a';
        const key = (l.roof || '') + '|' + l.facade + '|' + ((l.floors || 1) >= 8 ? 1 : 0), cache = this._roofCache || (this._roofCache = new Map());
        let c = cache.get(key);
        if (c) return c;
        const st = typeof TileFactory !== 'undefined' && TileFactory.roofStyles[l.roof];
        let hex = st ? (Array.isArray(st.base) ? st.base[1] : (st.base || (st.colors ? st.colors[0] : st.a))) : null;
        if (!hex) hex = this.lotColor(l.facade || '');
        let [r, g, b] = Pixel.hex(hex);
        const lift = st && st.kind === 'tar' ? 1.32 : 1.08;
        r *= lift; g *= lift; b *= lift;
        if ((l.floors || 1) >= 8) { r += (126 - r) * 0.45; g += (158 - g) * 0.45; b += (196 - b) * 0.45; }
        c = `rgb(${Math.min(255, r | 0)},${Math.min(255, g | 0)},${Math.min(255, b | 0)})`;
        cache.set(key, c);
        return c;
    },
    // Cor de uma rua (e a da borda).
    roadStyle(e) { return this.ROAD[e.express ? 'express' : e.cls] || this.ROAD.city; },

    // Compatibilidade: o mundo inteiro pintado (MapPaint, 0,5 px/u). Chamado para assar de antemão (GPS, pausa).
    drawWorld() { return { canvas: MapPaint.world(), ppu: MapPaint.WORLD_PPU }; },

    // Desenha a janela do mundo centrada em (cx, cz) num canvas W×H com `scale` px/u.
    // opts: { labels: nomes de ruas e regiões, budget: ms por quadro para pintar ladrilhos novos (ou defer: só anota, MapPaint.work),
    //        dpr: px do aparelho por px }.
    drawView(ctx, W, H, cx, cz, scale, opts = {}) {
        const C = this.colors, k = scale;
        const X = (x) => W / 2 + (x - cx) * k, Y = (z) => H / 2 - (z - cz) * k;
        const vx0 = cx - W / 2 / k, vx1 = cx + W / 2 / k, vz0 = cz - H / 2 / k, vz1 = cz + H / 2 / k;
        const vis = (x0, z0, x1, z1) => x1 >= vx0 && x0 <= vx1 && z1 >= vz0 && z0 <= vz1;
        const rect = (x0, z0, x1, z1, color) => { ctx.fillStyle = color; ctx.fillRect(X(x0), Y(z1), (x1 - x0) * k, (z1 - z0) * k); };
        const rrect = (x0, z0, x1, z1, r, color) => { if (!ctx.roundRect || r * k < 1.5) return rect(x0, z0, x1, z1, color); ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(X(x0), Y(z1), (x1 - x0) * k, (z1 - z0) * k, r * k); ctx.fill(); };
        const path = (P) => { ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); };
        const poly = (P, color) => { ctx.fillStyle = color; path(P); ctx.closePath(); ctx.fill(); };

        // 1) Terreno pintado (ladrilhos HD; o que ainda não está pronto sai do mundo inteiro, ampliado).
        this.pending = MapPaint.drawTerrain(ctx, W, H, cx, cz, k, { budget: opts.budget, res: k * (opts.dpr || 1), defer: opts.defer });
        ctx.imageSmoothingEnabled = false;

        // 2) Favela (FavelaPlan): chão de terra, becos cimentados, quadra e campinho (as ruas passam por cima).
        for (const F of (typeof Favelas !== 'undefined' ? Favelas.built : [])) {
            if (!vis(F.R.x0 - 8, F.R.z0 - 8, F.R.x1 + 8, F.R.z1 + 8)) continue;
            for (const b of F.groundBoxes) if (vis(b[0], b[1], b[2], b[3])) rect(b[0], b[1], b[2], b[3], C.earth);
            ctx.strokeStyle = '#bcb6aa'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            for (const a of F.alleys) {
                const p0 = a.pts[0], p1 = a.pts[a.pts.length - 1];
                if (!vis(Math.min(p0[0], p1[0]) - 4, Math.min(p0[1], p1[1]) - 4, Math.max(p0[0], p1[0]) + 4, Math.max(p0[1], p1[1]) + 4)) continue;
                ctx.lineWidth = Math.max(1, Math.max(a.w, 1.44) * k); path(a.pts); ctx.stroke();
            }
            for (const q of F.squares) rect(q.x0, q.z0, q.x1, q.z1, q.kind === 'quadra' ? '#4f8fbf' : '#7fae4f');
        }

        // 3) Chão da cidade: calçadas de borda, quarteirões (parques, praças, o pátio de cada quarteirão).
        for (const p of CityGrid.perimeter) if (vis(p.x0, p.z0, p.x1, p.z1)) rect(p.x0, p.z0, p.x1, p.z1, C.sidewalk);
        for (const st of CityGrid.perimeterStrips || []) { const c = st.inner[st.inner.length >> 1]; if (vis(c[0] - 60, c[1] - 60, c[0] + 60, c[1] + 60)) poly(st.poly, C.sidewalk); }
        for (const ap of CityGrid.roundAprons || []) {                      // anel de calçada das rotatórias
            const pts = ap.inner.concat(ap.outer.slice().reverse());
            if (vis(pts[0][0] - 20, pts[0][1] - 20, pts[0][0] + 20, pts[0][1] + 20)) poly(pts, C.sidewalk);
        }
        const blocks = [];
        for (const b of CityGrid.blocks.concat(CityGrid.extraBlocks || [])) {
            const s = b.slab;
            if (b.virtual || b.organic) { blocks.push(b); continue; }
            if (!vis(s[0], s[1], s[2], s[3])) continue;
            blocks.push(b);
            if (b.poly) {                                                   // quarteirão em polígono (cortado por diagonal)
                if (b.open) poly(b.poly, C[b.ground] || C.grass);
                else { poly(b.poly, C.sidewalk); if (b.footPoly) poly(b.footPoly, C[b.ground] || C.plaza); }
            } else if (b.open) rrect(s[0], s[1], s[2], s[3], b.r || 0, C[b.ground] || C.grass);
            else { rrect(s[0], s[1], s[2], s[3], b.r || 0, C.sidewalk); rect(b.foot[0], b.foot[1], b.foot[2], b.foot[3], C[b.ground] || C.plaza); }
        }

        // 4) Ruas: primeiro a BORDA (meio-fio escuro; a grade de proteção da ponte) de todas, depois o asfalto — os cruzamentos se fundem.
        const edges = new Set(), P = RoadPlan, S = P.CELL;
        for (let i = Math.floor(vx0 / S); i <= Math.floor(vx1 / S); i++) for (let j = Math.floor(vz0 / S); j <= Math.floor(vz1 / S); j++) {
            const c = P._eg.get(P._key(i, j)); if (c) for (const e of c) edges.add(e);
        }
        const cw = k >= 0.55 ? Math.max(0.7, 1 / k) : 0;                    // largura da borda (u)
        const edgeRect = (e) => {
            const hw = e.w / 2, x0 = Math.min(e.a.x, e.b.x), x1 = Math.max(e.a.x, e.b.x), z0 = Math.min(e.a.z, e.b.z), z1 = Math.max(e.a.z, e.b.z);
            return e.v ? [x0 - hw, z0 - e.a.hwEW, x1 + hw, z1 + e.b.hwEW] : [x0 - e.a.hwNS, z0 - hw, x1 + e.b.hwNS, z1 + hw];
        };
        const nodeStyle = (n) => { let best = null; for (const a of n.arms) if (!best || a.e.w > best.w || (a.e.cls === 'hwy' && best.cls !== 'hwy')) best = a.e; return best ? this.roadStyle(best) : this.ROAD.city; };
        const turnArc = (n) => {
            const sv = n.nbr[0] ? 1 : -1, sh = n.nbr[2] ? 1 : -1, R = n.turnR, cx0 = n.x + sh * R, cz0 = n.z + sv * R, a0 = Math.atan2(0, -sh), a1 = Math.atan2(-sv, 0);
            let dd = a1 - a0; while (dd > Math.PI) dd -= 2 * Math.PI; while (dd < -Math.PI) dd += 2 * Math.PI;
            ctx.beginPath();
            for (let s = 0; s <= 12; s++) { const t = a0 + dd * s / 12, px = X(cx0 + R * Math.cos(t)), py = Y(cz0 + R * Math.sin(t)); if (s) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
        };
        for (const pass of [0, 1]) {
            if (pass === 0 && !cw) continue;
            for (const e of edges) {
                const st = this.roadStyle(e), col = st[pass ? 0 : 1], g = pass ? 0 : (e.cls === 'bridge' ? 3 : cw);
                if (!col) continue;
                if (e.free) {                                               // via livre: polilinha grossa com a largura da via
                    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, (e.w + 2 * g) * k); ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
                    path(e.pts); ctx.stroke();
                    continue;
                }
                const r = edgeRect(e);
                if (!vis(r[0] - 4, r[1] - 4, r[2] + 4, r[3] + 4)) continue;
                if (pass === 0 && (e.cls === 'bridge' || e.cls === 'via')) {   // a sombra do tabuleiro no chão (ou na água)
                    ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = '#06121c'; ctx.fillRect(X(r[0] - g) + 2 * k, Y(r[3] + g) + 2 * k, (r[2] - r[0] + 2 * g) * k, (r[3] - r[1] + 2 * g) * k); ctx.restore();
                }
                const ga = e.v ? g : 0, gb = e.v ? 0 : g;                   // (a borda corre dos lados, não atravessa o cruzamento)
                rect(Math.max(r[0] - ga, vx0 - 1), Math.max(r[1] - gb, vz0 - 1), Math.min(r[2] + ga, vx1 + 1), Math.min(r[3] + gb, vz1 + 1), col);
            }
            for (const n of P.nodes) {
                const vr = (n.turnR || ((n.round || n.poly) ? n.hwNS + 8 : 8)) + 2; if (!vis(n.x - vr, n.z - vr, n.x + vr, n.z + vr)) continue;
                if (n.uturn) continue;                                      // retorno: a pista segue direto (o vão é do canteiro)
                const st = nodeStyle(n), col = pass ? st[0] : st[1] || st[0], g = pass ? 0 : cw;
                if (n.round) {                                              // rotatória: disco de asfalto e a ilha verde
                    const R = n.round;
                    ctx.fillStyle = pass ? C.asphalt : '#2c2f35'; ctx.beginPath(); ctx.arc(X(R.cx), Y(R.cz), (R.R + g) * k, 0, Math.PI * 2); ctx.fill();
                    if (pass) { ctx.fillStyle = C.grass; ctx.beginPath(); ctx.arc(X(R.cx), Y(R.cz), Math.max(1, R.r * k), 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#d9dbde'; ctx.lineWidth = Math.max(1, 0.5 * k); ctx.stroke(); }
                    continue;
                }
                if (n.poly) {                                               // nó com perna livre: o polígono do cruzamento
                    if (pass) poly(n.poly, col); else { ctx.strokeStyle = col; ctx.lineWidth = 2 * g * k; ctx.lineJoin = 'round'; path(n.poly); ctx.closePath(); ctx.stroke(); }
                    continue;
                }
                if (n.turnR) {                                              // curva larga: arco com a largura da via
                    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, (Math.max(n.wNS, n.wEW) + 2 * g) * k); ctx.lineCap = 'butt';
                    turnArc(n); ctx.stroke(); continue;
                }
                if (pass) rect(n.x - n.hwNS, n.z - n.hwEW, n.x + n.hwNS, n.z + n.hwEW, col);
            }
        }
        // Faixas (só com zoom): a linha amarela contínua das rodovias e o tracejado branco das ruas.
        if (k >= 1.2) {
            for (const hwyPass of [false, true]) {
                ctx.strokeStyle = hwyPass ? 'rgba(255,232,160,0.95)' : C.laneLine; ctx.lineWidth = Math.max(1, (hwyPass ? 0.45 : 0.6) * k);
                ctx.setLineDash(hwyPass ? [] : [4 * k, 5 * k]);
                ctx.beginPath();
                for (const e of edges) {
                    if (e.cls === 'fav' || e.cls === 'dirt' || e.cls === 'trail') continue;
                    if ((e.cls === 'hwy' || e.express) !== hwyPass) continue;
                    if (e.free) {
                        const A = RoadPlan.at(e, e.cutA || 0); ctx.moveTo(X(A.x), Y(A.z));
                        for (let i = 1; i + 1 < e.pts.length; i++) if (e.cum[i] > (e.cutA || 0) && e.cum[i] < e.len - (e.cutB || 0)) ctx.lineTo(X(e.pts[i][0]), Y(e.pts[i][1]));
                        const B = RoadPlan.at(e, e.len - (e.cutB || 0)); ctx.lineTo(X(B.x), Y(B.z));
                        continue;
                    }
                    if (e.v) { ctx.moveTo(X(e.a.x), Y(e.a.z + e.cutA)); ctx.lineTo(X(e.a.x), Y(e.b.z - e.cutB)); }
                    else { ctx.moveTo(X(e.a.x + e.cutA), Y(e.a.z)); ctx.lineTo(X(e.b.x - e.cutB), Y(e.a.z)); }
                }
                ctx.stroke();
            }
            ctx.setLineDash([]);
        }

        // 5) Prédios: a sombra de todos (para o sudeste, mais comprida nos altos) e depois os telhados, com a quina iluminada (noroeste)
        //    e a escura (sudeste); os marcos (cruz do hospital, distintivo da delegacia). Árvores dos parques e contêineres.
        const lots = [];
        for (const b of blocks) {
            for (const l of b.lots) if (vis(l.x0 - 4, l.z0 - 4, l.x1 + 4, l.z1 + 4)) lots.push(l);
            if (b.open && k >= 1.5 && !b.virtual) for (const p of b.props) {
                if (p.type !== 'tree' || !vis(p.x - 2, p.z - 2, p.x + 2, p.z + 2)) continue;
                const r = Math.max(1, (p.kind === 'bush' ? 0.8 : 1.5) * k);
                ctx.fillStyle = 'rgba(10,30,10,0.3)'; ctx.beginPath(); ctx.arc(X(p.x) + r * 0.35, Y(p.z) + r * 0.35, r, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = C.tree; ctx.beginPath(); ctx.arc(X(p.x), Y(p.z), r, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#4f8f3c'; ctx.beginPath(); ctx.arc(X(p.x) - r * 0.28, Y(p.z) - r * 0.28, r * 0.55, 0, Math.PI * 2); ctx.fill();
            }
            if (k >= 1.5 && !b.virtual && !b.organic) for (const p of b.props) if (p.type === 'container') rect(p.x - p.w / 2, p.z - p.d / 2, p.x + p.w / 2, p.z + p.d / 2, p.color);
        }
        if (k >= 0.6) {
            ctx.fillStyle = 'rgba(8,12,20,0.3)';
            for (const l of lots) { const d = Math.min(5, 0.5 + (l.height || 4) * 0.07); ctx.fillRect(X(l.x0 + d), Y(l.z1 - d), (l.x1 - l.x0) * k, (l.z1 - l.z0) * k); }
        }
        const bev = k >= 1.6 ? Math.max(1, 0.35 * k) : 0;
        for (const l of lots) {
            const x = X(l.x0), y = Y(l.z1), w = (l.x1 - l.x0) * k, h = (l.z1 - l.z0) * k;
            ctx.fillStyle = this.roofColor(l); ctx.fillRect(x, y, w, h);
            if (bev && w > 3 * bev && h > 3 * bev) {
                ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x, y, w, bev); ctx.fillRect(x, y, bev, h);
                ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x, y + h - bev, w, bev); ctx.fillRect(x + w - bev, y, bev, h);
            }
            if (k >= 1.2) { ctx.strokeStyle = C.buildingEdge; ctx.lineWidth = Math.max(1, 0.25 * k); ctx.strokeRect(x, y, w, h); }
            if (l.landmark && k >= 0.6) {                                   // cruz vermelha (hospital) / distintivo dourado (delegacia)
                const mx = X((l.x0 + l.x1) / 2), my = Y((l.z0 + l.z1) / 2), r = Math.max(3, 4.5 * k);
                ctx.fillStyle = l.landmark === 'hospital' ? '#d21f26' : '#e6bd3f';
                if (l.landmark === 'hospital') { ctx.fillRect(mx - r * 0.3, my - r, r * 0.6, r * 2); ctx.fillRect(mx - r, my - r * 0.3, r * 2, r * 0.6); }
                else { ctx.beginPath(); ctx.arc(mx, my, r * 0.8, 0, Math.PI * 2); ctx.fill(); }
            }
        }

        // 6) Marina (cais e píeres), os marcos e o autódromo.
        if (typeof Marina !== 'undefined' && Marina.docks) for (const d of Marina.docks) if (vis(d.x0, d.z0, d.x1, d.z1)) rect(d.x0, d.z0, d.x1, d.z1, d.kind === 'wall' ? '#b9bcbe' : '#a07a4c');
        if (typeof Landmarks !== 'undefined' && Landmarks.built) Landmarks.drawMap(ctx, X, Y, k, vis);
        if (typeof Speedway !== 'undefined') Speedway.drawMap(ctx, X, Y, k, vis);       // o autódromo (oval, arquibancada, chegada)

        // 7) Nomes de ruas (com bastante zoom): um por trecho longo.
        if (opts.labels && k >= 3.2) {
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
            ctx.font = `700 ${Math.min(2.6 * k, 26)}px "Arial Narrow", "Roboto Condensed", Arial, sans-serif`;
            for (const e of edges) {
                if (e.len < 30 || (e.cls === 'fav' && !e.name)) continue;
                const M = RoadPlan.at(e, e.len / 2), mx = M.x, mz = M.z;
                if (!vis(mx - 2, mz - 2, mx + 2, mz + 2)) continue;
                const txt = CityGrid.streetName(e);
                if (txt.length * 2.1 * k * 0.5 > e.len * k - 10 * k) continue;
                let rot = e.free ? -Math.atan2(M.tz, M.tx) : (e.v ? -Math.PI / 2 : 0);              // via livre: ao longo dela (sempre de pé)
                if (rot > Math.PI / 2) rot -= Math.PI; else if (rot < -Math.PI / 2) rot += Math.PI;
                ctx.save(); ctx.translate(X(mx), Y(mz)); if (rot) ctx.rotate(rot);
                ctx.lineWidth = Math.max(2, 0.7 * k); ctx.strokeStyle = 'rgba(14,18,24,0.9)'; ctx.strokeText(txt, 0, 0);
                ctx.fillStyle = '#f4f6fa'; ctx.fillText(txt, 0, 0);
                ctx.restore();
            }
        }

        // 8) Territórios de facção (área de risco): véu da cor da facção, borda tracejada e, no mapa grande, o nome.
        if (typeof Standing !== 'undefined') for (const t of Standing.territories) {
            const b = t.rect(), L = t.poly && t.poly();
            if (b.x1 < b.x0 || !vis(b.x0, b.z0, b.x1, b.z1)) continue;
            const x = X(b.x0), y = Y(b.z1), w = (b.x1 - b.x0) * k, h = (b.z1 - b.z0) * k;
            ctx.save();
            const tc = Standing.policeOp ? '#ff4a3d' : t.color;
            ctx.beginPath();                                                // contorno do território (a mancha da favela); sem ele, a caixa
            if (L && L.length > 2) { L.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.closePath(); } else ctx.rect(x, y, w, h);
            ctx.fillStyle = tc + '2e'; ctx.fill();
            ctx.strokeStyle = tc; ctx.lineWidth = Math.max(1.5, Math.min(4, 1.2 * k + 1)); ctx.setLineDash([Math.max(5, 8 * k), Math.max(4, 5 * k)]); ctx.lineJoin = 'round';
            ctx.stroke();
            if (opts.labels) {
                const size = Math.max(11, Math.min(26, 12 * k + 8)), cx0 = (Math.max(x, 0) + Math.min(x + w, W)) / 2, cy0 = Math.max(y, 0) + 16 + size * 0.5;      // (ancorado na parte visível)
                ctx.setLineDash([]); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
                ctx.font = `800 ${size}px "Arial Narrow", "Roboto Condensed", Arial, sans-serif`; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(6,14,8,0.95)';
                const hdr = Standing.policeOp ? '🚨 OPERAÇÃO POLICIAL' : '⚠ ÁREA DE RISCO'; ctx.fillStyle = '#ff5a4d'; ctx.strokeText(hdr, cx0, cy0); ctx.fillText(hdr, cx0, cy0);
                ctx.fillStyle = tc; ctx.strokeText(`${t.name} (${t.sigla})`, cx0, cy0 + size * 1.15); ctx.fillText(`${t.name} (${t.sigla})`, cx0, cy0 + size * 1.15);
            }
            ctx.restore();
        }
    },
};
