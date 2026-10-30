// ============================================================================
// MapGeo — geometria de jogo derivada do CityGrid.
// "Terra" = dentro da ilha de Liberty City; fora é água (carro atola, player
// não entra). Também resolve colisão círculo×retângulo contra os sólidos da
// cidade (prédios e contêineres), usada pelo Player.
// ============================================================================

const MapGeo = {
    // Metros DENTRO da água (distância da margem da ilha; 0 em terra firme).
    // (O mundo grande: continente, lagos, ilha e mar vêm do WorldMap; a cidade é terra por definição.)
    waterDepth(x, z) {
        if (Interiors.active) return 0;                                            // dentro de uma loja (palco fora do mapa): sempre firme
        return RoadPlan.onBridge(x, z) || this.onDock(x, z) ? 0 : WorldMap.waterDepth(x, z);
    },

    // Profundidade SOB as pontes (quem nada/navega por baixo do tabuleiro): a ponte não conta como chão; o píer continua contando.
    waterDepthBelow(x, z) {
        if (Interiors.active) return 0;
        return this.onDock(x, z) ? 0 : WorldMap.waterDepth(x, z);
    },

    // Terra para um BARCO: margem e píer encalham; a ponte não (o barco passa por baixo do tabuleiro).
    isShore(x, z) {
        return WorldMap.isLand(x, z) || this.onDock(x, z);
    },

    // Sobre um píer da marina (cais e dedos)? Para andar a pé como em terra firme.
    onDock(x, z) {
        if (typeof Landmarks !== 'undefined' && Landmarks.piers.length && Landmarks.onPier(x, z)) return true;      // (os píeres do canal)
        if (typeof Lagoa !== 'undefined' && Lagoa.onDeck(x, z)) return true;                                          // (os deques da Lagoa)
        const M = typeof Marina !== 'undefined' ? Marina : null;
        if (!M || !M.docks) return false;
        const b = M.box;
        if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) return false;
        for (const d of M.docks) if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return true;
        return false;
    },

    // Dá para estar aqui a pé? Terra firme ou água até Config.water.maxDepth da margem (e dentro do mundo).
    canWade(x, z) {
        return this.waterDepth(x, z) <= Config.water.maxDepth;
    },

    isLand(x, z) {
        return WorldMap.isLand(x, z) || RoadPlan.onBridge(x, z) || this.onDock(x, z);
    },

    // Está na malha urbana (a cidade em grade)?
    isCity(x, z) {
        return CityGrid.isInside(x, z);
    },

    // Direção (a luz VIAJA nela) e intensidade do sol — o ciclo dia/noite chama isto.
    setSun(dir, intensity) {
        const h = hypot(dir.x, dir.z) || 1e-6;
        this._sun = { dx: -dir.x / h, dz: -dir.z / h, slope: Math.abs(dir.y) / h };
        this._sunReach = 48 / this._sun.slope;
        this._sunI = intensity;
    },

    // Sombra do sol sobre o ponto (x, z)? Raio do chão em direção ao sol: sobe `slope`
    // unidades por unidade horizontal; bloqueado se atravessa um sólido mais alto que o raio.
    // Serve para escurecer sprites (o chão recebe a sombra real do shadow map).
    inShadow(x, z) {
        if (!this._sun) this.setSun(new BABYLON.Vector3(...Config.light.sunDir).normalize(), 1);
        const s = this._sun;
        if (this._sunI < 0.3) return false;               // de noite não há sombra de sol
        // O sol é um ponto: alcance máximo da sombra do prédio mais alto (≈ 48u).
        for (let u = 0.9; u <= this._sunReach; u += 0.9) {
            const qx = x + s.dx * u, qz = z + s.dz * u, ray = s.slope * u;
            for (const o of CityGrid.obstaclesNear(qx, qz)) {
                if (o.h >= ray && qx > o.x0 && qx < o.x1 && qz > o.z0 && qz < o.z1) return true;
            }
        }
        return false;
    },

    // Altura da cobertura sobre (x, z): o lado de baixo do toldo de loja ou da cobertura de posto; 0 = céu aberto. Quem tem os
    // pés debaixo dela é desenhado INTEIRO por baixo (SpriteActor → shader do NpcArt), sem a cabeça "furar" o toldo.
    coverAt(x, z) {
        if (!this._cover) {
            const G = this._cover = new Map(), C = 8;
            const add = (x0, z0, x1, z1, h) => {
                const r = { x0, z0, x1, z1, h };
                for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++) for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) {
                    const k = i + ',' + j;
                    (G.get(k) || G.set(k, []).get(k)).push(r);
                }
            };
            for (const b of CityGrid.blocks) for (const l of b.lots) for (const s of l.shops || []) add(...CityGrid.awningRect(l, s), CityGrid.AWNING.y0);
            for (const b of CityGrid.blocks.concat(CityGrid.extraBlocks || [])) for (const c of b.canopies || []) add(c.x0, c.z0, c.x1, c.z1, c.h);
        }
        const L = this._cover.get(Math.floor(x / 8) + ',' + Math.floor(z / 8));
        if (L) for (const r of L) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return r.h;
        return 0;
    },

    // Inclinação do chão andando na direção (dx, dz) (normalizada) a partir de (x, z): m de subida por m andado (> 0 sobe, < 0 desce).
    slopeAlong(x, z, dx, dz) {
        if (Interiors.active) return 0;
        const e = 2.0;
        return (WorldMap.heightAt(x + dx * e, z + dz * e) - WorldMap.heightAt(x - dx * e, z - dz * e)) / (2 * e) * (Config.world.heightScale || 1);
    },
    // Velocidade a pé pela inclinação: subindo cai bem (30% numa encosta de 45°, ~35% num paredão); descendo leve é um pouco mais
    // rápido, descida forte freia (cuidado para não rolar).
    slopeSpeed(g) {
        if (g > 0) return Math.max(0.3, 1 / (1 + 1.9 * g));
        return Math.max(0.6, 1 + Math.min(0.1, -g * 0.25) - Math.max(0, -g - 0.6) * 0.6);
    },

    // Linha de visada entre dois pontos do chão: bloqueada por prédios/contêineres
    // (sólidos com mais de 2u de altura). Amostra a cada 1,2u.
    hasLineOfSight(ax, az, bx, bz) {
        const dx = bx - ax, dz = bz - az;
        const dist = hypot(dx, dz);
        const n = Math.ceil(dist / 1.2);
        for (let k = 1; k < n; k++) {
            const t = k / n, x = ax + dx * t, z = az + dz * t;
            for (const o of CityGrid.obstaclesNear(x, z)) {
                if (o.h > 2 && x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1) return false;
            }
        }
        return true;
    },

    // Empurra um círculo (pos.x/pos.z, raio r) para fora de todos os sólidos.
    // Modifica `pos` e devolve true se houve contato.
    // inWater: quem está NA ÁGUA (nadando, ou sob a ponte) passa por baixo da mureta das pontes (que fica lá em cima, no tabuleiro).
    // vehicle = true: os paredões do relevo também seguram (carro não sobe parede). A pé (padrão) eles NÃO seguram: qualquer encosta
    // se sobe, só que devagar (slopeSpeed) e escalando (SpriteActor.setSlope).
    resolveCircle(pos, r, inWater = false, vehicle = false) {
        let hit = false;
        for (const o of (Interiors.active ? Interiors.obstacles : CityGrid.obstaclesAround(pos.x, pos.z, r))) {
            if (inWater && o.bridgeRail) continue;
            if (o.cliff && !vehicle) continue;
            const cx = Math.max(o.x0, Math.min(pos.x, o.x1));
            const cz = Math.max(o.z0, Math.min(pos.z, o.z1));
            const dx = pos.x - cx, dz = pos.z - cz;
            const d2 = dx * dx + dz * dz;
            if (d2 >= r * r) continue;
            hit = true;
            if (d2 > 1e-8) {
                const d = Math.sqrt(d2);
                const k = (r - d) / d;
                pos.x += dx * k;
                pos.z += dz * k;
            } else {
                // Centro dentro do retângulo: sai pela borda mais próxima.
                const l = pos.x - o.x0, rt = o.x1 - pos.x, b = pos.z - o.z0, t = o.z1 - pos.z;
                const m = Math.min(l, rt, b, t);
                if (m === l) pos.x = o.x0 - r;
                else if (m === rt) pos.x = o.x1 + r;
                else if (m === b) pos.z = o.z0 - r;
                else pos.z = o.z1 + r;
            }
        }
        return hit;
    },
};
