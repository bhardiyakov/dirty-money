// ============================================================================
// Rooftops — HELIPONTOS NO TELHADO: os helicópteros civis ficam só em cima de prédios (5 deles, espalhados pela cidade), e cada um
// tem uma ESCADA EXTERNA de metal encostada numa parede, na calçada, do chão até a borda do telhado.
//
//   pads[]  { lot, H, x, z, heading, P,  roof, strip, land: [x0, z0, x1, z1],  o, a, n, Lr, Ld }
//           roof   o telhado (dentro da platibanda)
//           strip  a escada (lance reto, largura W, fora da parede): sobe de 0 (pé, em `o`) até H no fim do lance (Lr), seguindo `a`
//           land   o patamar no alto (Ld): liga o fim do lance ao telhado, por cima da platibanda (aberta ali)
//           n      normal da parede (aponta para fora do prédio)
//
// O jogador "no telhado" usa o mesmo estado do viaduto (Player.onDeck / deckH, ver Player._updateLevel): entra pelo PÉ da escada
// andando para ela, fica preso à escada + patamar + telhado (Rooftops.clamp) e sai descendo de volta pelo pé.
// Roda em WorldBuilder.build, antes dos prédios (marca lot.helipad: telhado sem caixas de ar-condicionado e platibanda com vão).
// ============================================================================

const Rooftops = {
    W: 1.8,                 // largura da escada
    LD: 2.2,                // comprimento do patamar
    RISE: 0.95,             // altura por metro de lance (≈ 44°: escada de incêndio)
    pads: [],

    build() {
        this.pads = [];
        const fits = [];
        for (const blk of CityGrid.blocks) {
            if (blk.organic || blk.open || blk.district === 'favela') continue;
            for (const lot of blk.lots) {
                if (lot.safehouse || lot.landmark || lot.marina || lot.height < 6 || lot.height > 21) continue;
                if (lot.x1 - lot.x0 < 13 || lot.z1 - lot.z0 < 13) continue;
                const pad = this._fit(blk, lot);
                if (pad) fits.push(pad);
            }
        }
        // Um perto do ponto de partida; os outros o mais longe possível dos já escolhidos (espalhados pela cidade).
        const s = CityGrid.startPos(), dist = (p, q) => hypot(p.x - q.x, p.z - q.z);
        fits.sort((a, b) => dist(a, s) - dist(b, s));
        if (fits.length) this.pads.push(fits[0]);
        while (this.pads.length < 5) {
            let best = null, bd = 120;
            for (const f of fits) { const d = Math.min(...this.pads.map((p) => dist(p, f))); if (d > bd) { bd = d; best = f; } }
            if (!best) break;
            this.pads.push(best);
        }
        for (const p of this.pads) {
            p.lot.helipad = p;
            const [x0, z0, x1, z1] = p.solid;
            CityGrid.addObstacles([{ x0, z0, x1, z1, h: 2, stair: true }]);                      // (o vão de baixo da escada: carro e pedestre não passam)
            CityGrid.addPoi({ type: 'helipad', name: 'Heliponto (suba pela escada externa)', x: p.foot.x, z: p.foot.z });
        }
        CityGrid.helipads = this.pads.map((p) => ({ x: p.x, z: p.z, heading: p.heading, roof: p }));
        console.log(`[HELIPONTOS] ${this.pads.length} no telhado: ${this.pads.map((p) => `(${p.x.toFixed(0)}, ${p.z.toFixed(0)}) ${p.H} m`).join(' · ')}`);
    },

    // A escada cabe numa parede do lote sem loja, com a faixa ao lado livre (nada construído, fora da pista, em terra) até o pé?
    _fit(blk, lot) {
        const H = lot.height, Lr = H / this.RISE, Ld = this.LD, W = this.W;
        const sides = [
            { s: 'S', n: [0, -1], a: [1, 0], wall: lot.z0, c0: lot.x0, c1: lot.x1 },
            { s: 'E', n: [1, 0], a: [0, 1], wall: lot.x1, c0: lot.z0, c1: lot.z1 },
            { s: 'W', n: [-1, 0], a: [0, -1], wall: lot.x0, c0: lot.z0, c1: lot.z1 },
            { s: 'N', n: [0, 1], a: [-1, 0], wall: lot.z1, c0: lot.x0, c1: lot.x1 },          // (por último: a fachada norte fica de costas para a câmera)
        ];
        for (const S of sides) {
            if ((lot.shops || []).some((q) => q.side === S.s) || S.c1 - S.c0 < Lr + Ld + 1.6) continue;
            // Lance ao longo da parede: o patamar fica a 0,8 m da quina do fim (no sentido de `a`).
            const [ax, az] = S.a, [nx, nz] = S.n, horiz = az === 0;
            const end = (horiz ? (ax > 0 ? S.c1 : S.c0) : (az > 0 ? S.c1 : S.c0)) - (horiz ? ax : az) * 0.8;
            const start = end - (horiz ? ax : az) * (Lr + Ld);
            const o = horiz ? { x: start, z: S.wall } : { x: S.wall, z: start };
            const P = (u, w) => [o.x + ax * u + nx * w, o.z + az * u + nz * w];
            const rect = (u0, w0, u1, w1) => { const p = P(u0, w0), q = P(u1, w1); return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])]; };
            const strip = rect(0, 0, Lr + Ld, W), solid = rect(1.4, 0, Lr + Ld, W), reach = rect(-2, 0, Lr + Ld, W + 0.8);
            const near = CityGrid.obstaclesAround((strip[0] + strip[2]) / 2, (strip[1] + strip[3]) / 2, Lr + Ld + 2);
            const hit = near.some((ob) => !(ob.x0 >= lot.x0 - 0.01 && ob.x1 <= lot.x1 + 0.01 && ob.z0 >= lot.z0 - 0.01 && ob.z1 <= lot.z1 + 0.01)
                && ob.x0 < reach[2] + 0.3 && ob.x1 > reach[0] - 0.3 && ob.z0 < reach[3] + 0.3 && ob.z1 > reach[1] - 0.3);
            if (hit) continue;
            let bad = false;
            for (let u = -1.5; u <= Lr + Ld && !bad; u += 1) for (const w of [0.3, W - 0.3]) {
                const [x, z] = P(u, w);
                if (!MapGeo.isLand(x, z) || MapGeo.waterDepth(x, z) > 0 || RoadPlan.onPavement(x, z, 0.3)) { bad = true; break; }
            }
            if (bad) continue;
            const t = 0.55, roof = [lot.x0 + t, lot.z0 + t, lot.x1 - t, lot.z1 - t];
            const land = rect(Lr, -2, Lr + Ld, W);
            const w = lot.x1 - lot.x0, d = lot.z1 - lot.z0;
            // Laje do heliponto no meio do telhado, um pouco afastada do patamar.
            const x = (lot.x0 + lot.x1) / 2 - nx * 0.8, z = (lot.z0 + lot.z1) / 2 - nz * 0.8;
            const pad = { lot, H, x, z, heading: horiz ? 0 : Math.PI / 2, P: Math.min(6.5, Math.min(w, d) / 2 - 1.4), roof, strip, land, solid, o, a: { x: ax, z: az }, n: { x: nx, z: nz }, Lr, Ld, side: S.s,
                foot: { x: P(-0.6, W / 2)[0], z: P(-0.6, W / 2)[1] } };
            return pad;
        }
        return null;
    },

    // Altura do chão da escada/telhado em (x, z) (no lance: sobe com a distância do pé).
    heightAt(pad, x, z) {
        if (this._in(pad.strip, x, z, 0) && !this._in(pad.land, x, z, 0)) {
            const u = (x - pad.o.x) * pad.a.x + (z - pad.o.z) * pad.a.z;
            return pad.H * Math.max(0, Math.min(1, u / pad.Lr));
        }
        return pad.H;
    },

    // A pé, andando PARA a escada pelo pé dela: começa a subir (devolve o heliponto).
    entry(x, z, vx, vz) {
        for (const p of this.pads) {
            if (!this._in(p.strip, x, z, 0)) continue;
            const u = (x - p.o.x) * p.a.x + (z - p.o.z) * p.a.z;
            if (u < 1.3 && vx * p.a.x + vz * p.a.z > 0.2) return p;
        }
        return null;
    },

    _in(R, x, z, m) { return x >= R[0] + m && x <= R[2] - m && z >= R[1] + m && z <= R[3] - m; },

    // Prende o círculo (p, raio r) à escada + patamar + telhado. `last` = última posição válida (atualizada aqui).
    // Devolve false quando ele DESCEU pelo pé (sai do estado: volta ao chão).
    clamp(pad, last, p, r) {
        const regs = [pad.roof, pad.land, pad.strip], m = Math.min(r, 0.6);
        const inside = (x, z) => regs.some((R) => this._in(R, x, z, R === pad.strip ? Math.min(m, this.W / 2 - 0.15) : m));
        if (inside(p.x, p.z)) { last.x = p.x; last.z = p.z; return true; }
        if (this.heightAt(pad, last.x, last.z) < 0.7 && this._in(pad.strip, last.x, last.z, 0)) return false;       // desceu pelo pé
        // Fora: fica no lugar válido mais próximo (desliza ao longo da borda).
        if (inside(p.x, last.z)) p.z = last.z;
        else if (inside(last.x, p.z)) p.x = last.x;
        else { p.x = last.x; p.z = last.z; }
        last.x = p.x; last.z = p.z;
        return true;
    },

    // Helicóptero estacionado neste telhado? (para descer nele: o heliponto)
    padUnder(x, z) {
        for (const p of this.pads) if (this._in(p.roof, x, z, -0.5)) return p;
        return null;
    },
    // Ponto do telhado mais próximo de (x, z) (dentro da platibanda, com folga r).
    onRoof(pad, x, z, r) {
        const R = pad.roof;
        return { x: Math.max(R[0] + r, Math.min(R[2] - r, x)), z: Math.max(R[1] + r, Math.min(R[3] - r, z)) };
    },
};
