// ============================================================================
// MapRenderer — desenha o mundo (top-down) em qualquer canvas 2D: GPS (minimapa) e mapa de pausa.
//   • camada de baixo: o MUNDO inteiro raster (terreno com relevo, mar, ilha) — drawWorld, 1 px/u, desenhado uma vez;
//   • por cima, VETORIAL e só do que está na tela: ruas (por classe de via), pontes, calçadas, quarteirões, prédios,
//     árvores e nomes de ruas — drawView. Funciona em qualquer zoom (sem canvas gigante).
// Mapeia o mundo para o canvas por (cx, cz, scale = px por unidade); +Z (norte) fica no topo.
// ============================================================================

const MapRenderer = {
    colors: {
        asphalt: '#383b40',
        dirt: '#a98d62',
        earth: '#9b8569',
        bridge: '#4a4d54',
        sidewalk: '#a9adb3',
        laneLine: 'rgba(234,182,44,0.55)',
        grass: '#5f9a45',
        sand: '#e3d398',
        concrete: '#8a8d90',
        plaza: '#9d9ca2',
        tree: '#2f6b2a',
        buildingEdge: 'rgba(20,24,30,0.55)',
    },

    // Cor do prédio pelo prefixo do estilo de fachada.
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

    // Cores do terreno por bioma (WorldMap.B) no mapa.
    worldColors: {
        0: [53, 96, 125], 1: [226, 212, 152], 2: [98, 160, 70], 3: [54, 112, 48], 4: [190, 160, 84], 5: [70, 98, 68],
        6: [136, 133, 126], 7: [172, 140, 104], 8: [168, 158, 94], 9: [138, 141, 146], 10: [112, 170, 92],
    },

    // O MUNDO inteiro (continente, relevo, ilha, mar) num canvas: `ppu` pixels por unidade. Células com sombreado de relevo e
    // curvas de nível. Cacheado por ppu.
    drawWorld(ppu = 1) {
        this._world = this._world || {};
        if (this._world[ppu]) return this._world[ppu];
        const W = Config.world, M = WorldMap, c = W.cell, w = Math.round((W.maxX - W.minX) * ppu), h = Math.round((W.maxZ - W.minZ) * ppu);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d'), img = ctx.createImageData(w, h), d = img.data, cols = this.worldColors;
        const nx = M.nx, nz = M.nz, L = [0.32, 0.24];
        const hAt = (i, j) => M.h[Math.max(0, Math.min(nz - 1, j)) * nx + Math.max(0, Math.min(nx - 1, i))];
        for (let py = 0; py < h; py++) {
            const j = Math.min(nz - 1, Math.floor(((h - 1 - py) / ppu) / c));
            for (let px = 0; px < w; px++) {
                const i = Math.min(nx - 1, Math.floor((px / ppu) / c)), k = j * nx + i, b = M.biome[k];
                let col = cols[b], s = 1;
                if (b === 0) {                                                     // mar: mais claro perto da costa
                    const t = Math.max(0, 1 - M.dist[k] / 28);
                    col = [53 + 36 * t, 96 + 42 * t, 125 + 30 * t];
                } else if (b !== 9) {
                    const gx = (hAt(i + 1, j) - hAt(i - 1, j)) / (2 * c), gz = (hAt(i, j + 1) - hAt(i, j - 1)) / (2 * c);
                    s = 1 + (-gx * (-L[0]) - gz * L[1]) * 1.6;
                    s = Math.max(0.55, Math.min(1.25, s));
                    if (M.flags[k] & 1) s = 0.45;
                    else if (M.h[k] > 8 && Math.floor(M.h[k] / W.contour) !== Math.floor(hAt(i + 1, j) / W.contour) && (px % Math.max(1, Math.round(c * ppu))) === 0) s *= 0.7;   // curva de nível
                }
                const o = (py * w + px) * 4;
                d[o] = Math.min(255, col[0] * s); d[o + 1] = Math.min(255, col[1] * s); d[o + 2] = Math.min(255, col[2] * s); d[o + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        return (this._world[ppu] = { canvas, ppu });
    },

    // Desenha a janela do mundo centrada em (cx, cz) num canvas W×H com `scale` px/u.
    // opts: { labels: nomes de ruas e regiões }.
    drawView(ctx, W, H, cx, cz, scale, opts = {}) {
        const C = this.colors, WD = Config.world, k = scale;
        const X = (x) => W / 2 + (x - cx) * k, Y = (z) => H / 2 - (z - cz) * k;
        const vx0 = cx - W / 2 / k, vx1 = cx + W / 2 / k, vz0 = cz - H / 2 / k, vz1 = cz + H / 2 / k;
        const vis = (x0, z0, x1, z1) => x1 >= vx0 && x0 <= vx1 && z1 >= vz0 && z0 <= vz1;
        const rect = (x0, z0, x1, z1, color) => { ctx.fillStyle = color; ctx.fillRect(X(x0), Y(z1), (x1 - x0) * k, (z1 - z0) * k); };
        const rrect = (x0, z0, x1, z1, r, color) => { if (!ctx.roundRect || r * k < 1.5) return rect(x0, z0, x1, z1, color); ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(X(x0), Y(z1), (x1 - x0) * k, (z1 - z0) * k, r * k); ctx.fill(); };

        // 1) Mundo raster por baixo.
        const WL = this.drawWorld(1), wp = WL.ppu;
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#2c5877'; ctx.fillRect(0, 0, W, H);
        ctx.drawImage(WL.canvas, (cx - WD.minX) * wp - W / 2 / k * wp, (WD.maxZ - cz) * wp - H / 2 / k * wp, W / k * wp, H / k * wp, 0, 0, W, H);

        // 1b) Favela (FavelaPlan): chão de terra, becos cimentados, quadra e campinho (as ruas passam por cima).
        for (const F of (typeof Favelas !== 'undefined' ? Favelas.built : [])) {
            if (!vis(F.R.x0 - 8, F.R.z0 - 8, F.R.x1 + 8, F.R.z1 + 8)) continue;
            for (const b of F.groundBoxes) if (vis(b[0], b[1], b[2], b[3])) rect(b[0], b[1], b[2], b[3], C.earth);
            ctx.strokeStyle = C.sidewalk; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            for (const a of F.alleys) {
                const p0 = a.pts[0], p1 = a.pts[a.pts.length - 1];
                if (!vis(Math.min(p0[0], p1[0]) - 4, Math.min(p0[1], p1[1]) - 4, Math.max(p0[0], p1[0]) + 4, Math.max(p0[1], p1[1]) + 4)) continue;
                ctx.lineWidth = Math.max(1, Math.max(a.w, 1.44) * k); ctx.beginPath();
                a.pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
                ctx.stroke();
            }
            for (const q of F.squares) rect(q.x0, q.z0, q.x1, q.z1, q.kind === 'quadra' ? C.sidewalk : C.dirt);
        }

        // 2) Ruas (retângulo de cada trecho, com a largura da via) e cruzamentos.
        const edges = new Set(), P = RoadPlan, S = P.CELL;
        for (let i = Math.floor(vx0 / S); i <= Math.floor(vx1 / S); i++) for (let j = Math.floor(vz0 / S); j <= Math.floor(vz1 / S); j++) {
            const c = P._eg.get(P._key(i, j)); if (c) for (const e of c) edges.add(e);
        }
        const surf = (cls) => { const s = RoadPlan.CLASS[cls].surface; return cls === 'bridge' ? C.bridge : (s === 'dirt' ? C.dirt : (s === 'earth' ? C.earth : (s === 'concrete' ? C.concrete : C.asphalt))); };
        const poly = (P, color) => { ctx.fillStyle = color; ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.closePath(); ctx.fill(); };
        for (const e of edges) {
            if (e.free) {                                                   // via livre: polilinha grossa com a largura da via
                ctx.strokeStyle = surf(e.cls); ctx.lineWidth = Math.max(1, e.w * k); ctx.lineCap = 'butt'; ctx.lineJoin = 'round'; ctx.beginPath();
                e.pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
                ctx.stroke();
                continue;
            }
            const hw = e.w / 2, x0 = Math.min(e.a.x, e.b.x), x1 = Math.max(e.a.x, e.b.x), z0 = Math.min(e.a.z, e.b.z), z1 = Math.max(e.a.z, e.b.z);
            const r = e.v ? [x0 - hw, z0 - e.a.hwEW, x1 + hw, z1 + e.b.hwEW] : [x0 - e.a.hwNS, z0 - hw, x1 + e.b.hwNS, z1 + hw];
            if (!vis(r[0], r[1], r[2], r[3])) continue;
            if (e.cls === 'bridge') { const sw = 3; if (e.v) rect(r[0] - sw, r[1], r[2] + sw, r[3], C.sidewalk); else rect(r[0], r[1] - sw, r[2], r[3] + sw, C.sidewalk); }
            rect(Math.max(r[0], vx0 - 1), Math.max(r[1], vz0 - 1), Math.min(r[2], vx1 + 1), Math.min(r[3], vz1 + 1), surf(e.cls));
        }
        for (const n of P.nodes) {
            const vr = (n.turnR || ((n.round || n.poly) ? n.hwNS + 8 : 8)) + 2; if (!vis(n.x - vr, n.z - vr, n.x + vr, n.z + vr)) continue;
            if (n.uturn) continue;                                          // retorno: a pista segue direto (o vão é do canteiro)
            if (n.round) {                                                  // rotatória: disco de asfalto e a ilha verde
                const R = n.round;
                ctx.fillStyle = C.asphalt; ctx.beginPath(); ctx.arc(X(R.cx), Y(R.cz), R.R * k, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = C.grass; ctx.beginPath(); ctx.arc(X(R.cx), Y(R.cz), Math.max(1, R.r * k), 0, Math.PI * 2); ctx.fill();
                continue;
            }
            let best = null; for (const a of n.arms) if (!best || a.e.w > best.w) best = a.e;
            if (n.poly) { poly(n.poly, surf(best.cls)); continue; }                // nó com perna livre: o polígono do cruzamento
            if (n.turnR) {                                                  // curva larga: arco com a largura da via
                const sv = n.nbr[0] ? 1 : -1, sh = n.nbr[2] ? 1 : -1, R = n.turnR, cx0 = n.x + sh * R, cz0 = n.z + sv * R, a0 = Math.atan2(0, -sh), a1 = Math.atan2(-sv, 0);
                let dd = a1 - a0; while (dd > Math.PI) dd -= 2 * Math.PI; while (dd < -Math.PI) dd += 2 * Math.PI;
                ctx.strokeStyle = surf(best.cls); ctx.lineWidth = Math.max(1, Math.max(n.wNS, n.wEW) * k); ctx.lineCap = 'butt'; ctx.beginPath();
                for (let s = 0; s <= 12; s++) { const t = a0 + dd * s / 12, px = X(cx0 + R * Math.cos(t)), py = Y(cz0 + R * Math.sin(t)); if (s) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
                ctx.stroke(); continue;
            }
            rect(n.x - n.hwNS, n.z - n.hwEW, n.x + n.hwNS, n.z + n.hwEW, surf(best.cls));
        }
        // Faixa central tracejada (só com zoom).
        if (k >= 1.2) {
            ctx.strokeStyle = C.laneLine; ctx.lineWidth = Math.max(1, 1.0 * k); ctx.setLineDash([5 * k, 6 * k]);
            ctx.beginPath();
            for (const e of edges) {
                if (e.cls === 'fav' || e.cls === 'dirt' || e.cls === 'trail') continue;
                if (e.free) {
                    const A = RoadPlan.at(e, e.cutA || 0); ctx.moveTo(X(A.x), Y(A.z));
                    for (let i = 1; i + 1 < e.pts.length; i++) if (e.cum[i] > (e.cutA || 0) && e.cum[i] < e.len - (e.cutB || 0)) ctx.lineTo(X(e.pts[i][0]), Y(e.pts[i][1]));
                    const B = RoadPlan.at(e, e.len - (e.cutB || 0)); ctx.lineTo(X(B.x), Y(B.z));
                    continue;
                }
                if (e.v) { ctx.moveTo(X(e.a.x), Y(e.a.z + e.cutA)); ctx.lineTo(X(e.a.x), Y(e.b.z - e.cutB)); }
                else { ctx.moveTo(X(e.a.x + e.cutA), Y(e.a.z)); ctx.lineTo(X(e.b.x - e.cutB), Y(e.a.z)); }
            }
            ctx.stroke(); ctx.setLineDash([]);
        }

        // 3) Calçadas de borda, quarteirões, prédios.
        for (const p of CityGrid.perimeter) if (vis(p.x0, p.z0, p.x1, p.z1)) rect(p.x0, p.z0, p.x1, p.z1, C.sidewalk);
        for (const st of CityGrid.perimeterStrips || []) { const c = st.inner[st.inner.length >> 1]; if (vis(c[0] - 60, c[1] - 60, c[0] + 60, c[1] + 60)) poly(st.poly, C.sidewalk); }
        for (const ap of CityGrid.roundAprons || []) {                      // anel de calçada das rotatórias
            const pts = ap.inner.concat(ap.outer.slice().reverse());
            if (!vis(pts[0][0] - 20, pts[0][1] - 20, pts[0][0] + 20, pts[0][1] + 20)) continue;
            ctx.fillStyle = C.sidewalk; ctx.beginPath();
            pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
            ctx.fill();
        }
        for (const b of CityGrid.blocks.concat(CityGrid.extraBlocks || [])) {
            const s = b.slab;
            if (b.virtual) {                                              // campo: só os prédios (lotes) e árvores
                for (const l of b.lots) if (vis(l.x0, l.z0, l.x1, l.z1)) rect(l.x0, l.z0, l.x1, l.z1, this.lotColor(l.facade));
                continue;
            }
            if (!vis(s[0], s[1], s[2], s[3])) continue;
            if (b.organic) {                                                // favela: só os barracos (chão e becos já foram)
                for (const l of b.lots) {
                    rect(l.x0, l.z0, l.x1, l.z1, this.lotColor(l.facade));
                    if (k >= 2) { ctx.strokeStyle = C.buildingEdge; ctx.lineWidth = Math.max(1, 0.6 * k); ctx.strokeRect(X(l.x0), Y(l.z1), (l.x1 - l.x0) * k, (l.z1 - l.z0) * k); }
                }
                continue;
            }
            if (b.poly) {                                                   // quarteirão em polígono (cortado por diagonal)
                if (b.open) poly(b.poly, C[b.ground] || C.grass);
                else { poly(b.poly, C.sidewalk); if (b.footPoly) poly(b.footPoly, C[b.ground] || C.plaza); }
            } else if (b.open) rrect(s[0], s[1], s[2], s[3], b.r || 0, C[b.ground] || C.grass);
            if (b.open) {
                if (k >= 1.5) for (const p of b.props) {
                    if (p.type !== 'tree') continue;
                    ctx.fillStyle = C.tree; ctx.beginPath(); ctx.arc(X(p.x), Y(p.z), Math.max(1, (p.kind === 'bush' ? 0.7 : 1.3) * k), 0, Math.PI * 2); ctx.fill();
                }
                continue;
            }
            if (!b.poly) { rrect(s[0], s[1], s[2], s[3], b.r || 0, C.sidewalk); rect(b.foot[0], b.foot[1], b.foot[2], b.foot[3], C[b.ground] || C.plaza); }
            for (const l of b.lots) {
                rect(l.x0, l.z0, l.x1, l.z1, l.landmark === 'hospital' ? '#eef1f3' : (l.landmark === 'station' ? '#2f4a8a' : this.lotColor(l.facade)));
                if (k >= 1.2) { ctx.strokeStyle = C.buildingEdge; ctx.lineWidth = Math.max(1, 0.8 * k); ctx.strokeRect(X(l.x0), Y(l.z1), (l.x1 - l.x0) * k, (l.z1 - l.z0) * k); }
                if (l.landmark && k >= 0.6) {                               // cruz vermelha (hospital) / distintivo dourado (delegacia)
                    const mx = X((l.x0 + l.x1) / 2), my = Y((l.z0 + l.z1) / 2), r = Math.max(3, 4.5 * k);
                    ctx.fillStyle = l.landmark === 'hospital' ? '#d21f26' : '#e6bd3f';
                    if (l.landmark === 'hospital') { ctx.fillRect(mx - r * 0.3, my - r, r * 0.6, r * 2); ctx.fillRect(mx - r, my - r * 0.3, r * 2, r * 0.6); }
                    else { ctx.beginPath(); ctx.arc(mx, my, r * 0.8, 0, Math.PI * 2); ctx.fill(); }
                }
            }
            if (k >= 1.5) for (const p of b.props) if (p.type === 'container') rect(p.x - p.w / 2, p.z - p.d / 2, p.x + p.w / 2, p.z + p.d / 2, p.color);
        }

        // Marina: cais e píeres de madeira (paredões de concreto nas pontas).
        if (typeof Marina !== 'undefined' && Marina.docks) for (const d of Marina.docks) if (vis(d.x0, d.z0, d.x1, d.z1)) rect(d.x0, d.z0, d.x1, d.z1, d.kind === 'wall' ? '#b9bcbe' : '#a07a4c');

        if (typeof Speedway !== 'undefined') Speedway.drawMap(ctx, X, Y, k, vis);       // o autódromo (oval, arquibancada, chegada)

        // 4) Nomes de ruas (com bastante zoom): um por trecho longo.
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

        // 5) Territórios de facção (área de risco): véu da cor da facção, borda tracejada e, no mapa grande, o nome.
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
