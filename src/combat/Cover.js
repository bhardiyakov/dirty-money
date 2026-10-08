// ============================================================================
// Cover — COBERTURA do jogador agachado: qualquer prédio, muro, caçamba, caixote, latão, contêiner ou carro parado (grade é vazada:
// não conta). Agachado a até Config.tactics.coverReach de uma dessas superfícies, o jogador está "em cobertura":
//   • bala que vem do LADO da cobertura (atravessaria o obstáculo para chegar nele) para nela — levantando para mirar/atirar ele fica
//     parcialmente exposto (Config.tactics.coverExposed);
//   • quem está do outro lado não o enxerga (polícia, facção): a cobertura tapa a visão.
// A superfície é { x, z (ponto mais perto nela), nx, nz (normal: da cobertura para o jogador), d (distância), h, kind, ref }.
// ============================================================================

const Cover = {
    game: null,

    // Superfície de cobertura mais perto de (x, z) até `reach` (u), ou null.
    find(x, z, reach = Config.tactics.coverReach) {
        const T = Config.tactics;
        let best = null, bd = reach;
        const take = (cx, cz, h, kind, ref) => {
            const dx = x - cx, dz = z - cz, d = Math.sqrt(dx * dx + dz * dz);
            if (d >= bd || d < 1e-3) return;                                   // (d = 0: dentro do obstáculo — não é cobertura)
            bd = d;
            best = { x: cx, z: cz, nx: dx / d, nz: dz / d, d, h, kind, ref };
        };
        const g = this.game, pl = g && g.player, up = !!(pl && (pl.onDeck || pl.underBridge));      // no viaduto / sob a ponte: os muros do chão não valem
        if (!up) for (const o of CityGrid.obstaclesAround(x, z, reach)) {
            if (o.h < T.coverMinH || o.kind === 'fence') continue;
            if (Math.max(o.x1 - o.x0, o.z1 - o.z0) < 0.8) continue;           // poste, placa: fino demais para esconder alguém
            take(Math.max(o.x0, Math.min(o.x1, x)), Math.max(o.z0, Math.min(o.z1, z)), o.h, o.h > 2.2 ? 'wall' : 'low', o);
        }
        if (g) {
            const f = this._f || (this._f = new BABYLON.Vector3());
            const cars = (c) => {
                if (!c || !c.body || c.isBike || c.isBoat || c.controlled || c.speed > 1.5) return;   // carro andando não é cobertura
                if (pl && !Vehicle.sameLevel(c, pl)) return;                                       // (o carro lá em cima do viaduto, não)
                const P = c.position;
                if (Math.abs(P.x - x) > reach + 4 || Math.abs(P.z - z) > reach + 4) return;
                c.fwdToRef(f);
                const fl = Math.hypot(f.x, f.z) || 1, fx = f.x / fl, fz = f.z / fl;
                const dx = x - P.x, dz = z - P.z, lz = dx * fx + dz * fz, lx = dx * fz - dz * fx;          // no referencial do carro
                const cz = Math.max(-c.halfLen, Math.min(c.halfLen, lz)), cx = Math.max(-c.halfW, Math.min(c.halfW, lx));
                take(P.x + fx * cz + fz * cx, P.z + fz * cz - fx * cx, 1.3, 'car', c);
            };
            if (g.vehicleManager) for (const c of g.vehicleManager.vehicles) cars(c);
            if (g.policeManager) for (const c of g.policeManager.cars) cars(c);
        }
        return best;
    },

    // Uma bala indo na direção (dx, dz) (normalizada) chega em quem está atrás de C passando pela cobertura?
    blocks(C, dx, dz) { return !!C && dx * C.nx + dz * C.nz > 0.2; },

    // FURTIVO: fator do alcance de visão de quem procura o jogador (polícia, facção) — agachado, ele é notado de bem mais perto
    // (procurado, a polícia está atenta: o efeito é menor).
    sightMul(game, wanted = false) {
        const p = game && game.player, T = Config.tactics;
        return game && game.mode === 'player' && p && p.crouched ? (wanted ? T.stealthSightWanted : T.stealthSight) : 1;
    },
    // A cobertura do jogador agachado tapa a vista de quem olha de (ox, oz)?
    hiddenFrom(game, ox, oz) {
        const p = game && game.player;
        return !!(game && game.mode === 'player' && p && p.inCover && this.hides(p.cover, ox, oz, p.position.x, p.position.z));
    },

    // Quem olha de (ox, oz) para o jogador em (px, pz) tem a vista tapada pela cobertura C (está do outro lado dela)?
    hides(C, ox, oz, px, pz) {
        if (!C) return false;
        const dx = px - ox, dz = pz - oz, d = Math.sqrt(dx * dx + dz * dz) || 1;
        return d > C.d + 0.6 && (dx * C.nx + dz * C.nz) / d > 0.2;
    },
};
