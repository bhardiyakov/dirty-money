// ============================================================================
// SafeHouse — o esconderijo (safe house) do protagonista: uma casa DE VERDADE na favela, com interior.
// É o ponto de partida do jogo. Acesso livre: a porta da frente é só um vão (sem chave, sem tecla) — entrou, está dentro.
//
// Este arquivo é só o PLANO (geometria e colisão), carregado antes do CityGrid:
//   • reserva um quarteirão da favela (CityGrid chama SafeHouse.plan(bloco) no lugar de sortear casinhas);
//   • registra paredes e móveis como sólidos (CityGrid.obstacles: o jogador, a polícia e as balas respeitam);
//   • marca o interior como "fora da navegação" dos pedestres (CityGrid.navBlocks);
//   • guarda as aberturas (porta e janelas) e o desenho dos móveis para a arte (art/HouseArt.js) e a vista (world/HouseView.js).
// Coordenadas LOCAIS: origem no canto sudoeste (externo) da casa, x → leste, z → norte. Mundo = (ox + x, oz + z).
// ============================================================================

const SafeHouse = {
    blockId: 'favela:7,4',          // quarteirão da favela, perto da avenida (a cidade fica logo a leste)
    W: 23, D: 15,                   // tamanho externo (u)
    T: 0.7,                         // espessura das paredes externas
    H: 2.8,                         // altura das paredes
    ROOF_Y: 3.1,                    // altura do telhado
    PX: 14.0, PT: 0.6,              // divisória (x e espessura): quarto/sala a oeste, cozinha a leste
    placed: false,
    ox: 0, oz: 0,

    // Vão da divisória (z) e porta da frente (x, na parede sul).
    gapZ: [3.4, 6.2],
    door: { x0: 16.0, x1: 18.2, h: 2.2 },

    // Janelas: parede ('S' sul, 'N' norte, 'E' leste), faixa [a, b] ao longo dela, peitoril e topo.
    windows: [
        { wall: 'S', a: 5.0, b: 8.4, y0: 0.9, y1: 2.0 },
        { wall: 'N', a: 9.8, b: 12.4, y0: 1.0, y1: 2.1 },
        { wall: 'N', a: 17.8, b: 20.4, y0: 1.0, y1: 2.1 },
        { wall: 'E', a: 8.0, b: 11.0, y0: 1.0, y1: 2.1 },
    ],

    // Móveis (base no chão: x0, z0, x1, z1) e altura. `solid`: bloqueia o jogador. A arte desenha cada um (HouseArt).
    furniture: [
        { kind: 'shelf',    x0: 1.0,  z0: 12.4, x1: 6.8,  z1: 14.3, h: 2.2 },
        { kind: 'boxes',    x0: 7.3,  z0: 12.9, x1: 9.0,  z1: 14.3, h: 1.1 },
        { kind: 'bed',      x0: 1.2,  z0: 1.3,  x1: 6.6,  z1: 4.6,  h: 0.8, use: 'bed' },
        { kind: 'stand',    x0: 1.3,  z0: 5.3,  x1: 3.2,  z1: 7.1,  h: 0.9 },
        { kind: 'tv',       x0: 9.6,  z0: 8.4,  x1: 12.9, z1: 10.4, h: 1.0 },
        { kind: 'stove',    x0: 15.0, z0: 12.3, x1: 18.0, z1: 14.3, h: 0.9 },
        { kind: 'gas',      x0: 15.1, z0: 10.5, x1: 16.1, z1: 11.5, h: 1.3 },
        { kind: 'fridge',   x0: 18.0, z0: 12.3, x1: 19.9, z1: 14.3, h: 2.0, use: 'fridge' },
        { kind: 'counter',  x0: 19.9, z0: 12.3, x1: 22.3, z1: 14.3, h: 0.9 },
        { kind: 'sink',     x0: 20.2, z0: 5.4,  x1: 22.3, z1: 12.3, h: 0.95 },
        { kind: 'chest',    x0: 20.3, z0: 1.2,  x1: 22.1, z1: 2.9,  h: 0.9, use: 'chest' },
        { kind: 'safe',     x0: 0.8,  z0: 8.4,  x1: 2.4,  z1: 10.0, h: 1.1, use: 'safe' },
    ],

    // Onde o jogador acorda (ao lado da cama, de frente para o sul) e o centro/enquadramento do corte.
    spawn: { x: 8.4, z: 4.0, face: Math.PI },

    // ---------------------------------------------------------------- plano
    // Chamado pelo CityGrid no quarteirão `blockId`: posiciona a casa dentro do pé do quarteirão (quintal de 3,5 u na frente, ao sul),
    // registra sólidos e deixa uma "lote" marcada (o resto do quarteirão evita a casa; o WorldBuilder não desenha o prédio genérico).
    plan(block, grid) {
        const [fx0, fz0, fx1, fz1] = block.foot;
        this.ox = Math.round(fx0 + (fx1 - fx0 - this.W) / 2);
        this.oz = Math.round(fz0 + 3.5);
        this.block = block;
        const T = this.T, W = this.W, D = this.D, H = this.H;
        const s = [];                                                                       // sólidos em coordenadas locais
        const d = this.door;
        s.push([0, 0, d.x0, T], [d.x1, 0, W, T]);                                           // parede sul, com o vão da porta
        s.push([0, D - T, W, D]);                                                           // norte
        s.push([0, T, T, D - T], [W - T, T, W, D - T]);                                     // oeste e leste
        s.push([this.PX, T, this.PX + this.PT, this.gapZ[0]], [this.PX, this.gapZ[1], this.PX + this.PT, D - T]);   // divisória com vão
        for (const r of s) this._solid(grid, r, H, 'wall');
        for (const f of this.furniture) this._solid(grid, [f.x0, f.z0, f.x1, f.z1], f.h, f.kind);
        grid.navBlocks.push({ x0: this.ox - 0.2, z0: this.oz - 0.2, x1: this.ox + W + 0.2, z1: this.oz + D + 0.2 });      // pedestres/policiais a pé não entram
        block.lots.push({ x0: this.ox, z0: this.oz, x1: this.ox + W, z1: this.oz + D, floors: 1, height: H, facade: 'brick0', roof: 'zinc0', safehouse: true });
        this.placed = true;
    },

    // Prop (árvore, lixo, poste...) que atrapalha a casa? Copas altas tampam o corte do interior; o resto só não pode encostar nas paredes.
    crowds(p) {
        const m = p.type === 'tree' || p.type === 'pole' ? 6.5 : 1.0;
        return p.x > this.ox - m && p.x < this.ox + this.W + m && p.z > this.oz - m * 0.5 && p.z < this.oz + this.D + m;
    },

    _solid(grid, r, h, kind) {
        const o = { x0: this.ox + r[0], z0: this.oz + r[1], x1: this.ox + r[2], z1: this.oz + r[3], h, home: kind };
        grid.obstacles.push(o);
    },

    // ------------------------------------------------------------ consultas
    world(x, z) { return { x: this.ox + x, z: this.oz + z }; },
    spawnWorld() { return this.placed ? { x: this.ox + this.spawn.x, z: this.oz + this.spawn.z, face: this.spawn.face } : null; },
    center() { return { x: this.ox + this.W / 2, z: this.oz + this.D / 2 }; },
    doorWorld() { return { x: this.ox + (this.door.x0 + this.door.x1) / 2, z: this.oz + this.T / 2 }; },

    // Móvel de uso (cama, geladeira, cofre, baú) ao alcance de quem está em (x, z) dentro da casa: { use, f } ou null.
    nearestUse(x, z) {
        if (!this.inside(x, z, -0.3)) return null;
        let best = null, bd = 1.5;
        for (const f of this.furniture) {
            if (!f.use) continue;
            const dx = Math.max(this.ox + f.x0 - x, 0, x - (this.ox + f.x1)), dz = Math.max(this.oz + f.z0 - z, 0, z - (this.oz + f.z1)), d = Math.hypot(dx, dz);
            if (d < bd) { bd = d; best = { use: f.use, f }; }
        }
        return best;
    },

    // Dentro do cômodo (entre as paredes)? `m` > 0 encolhe, < 0 alarga a área.
    inside(x, z, m = 0) {
        if (!this.placed) return false;
        const lx = x - this.ox, lz = z - this.oz;
        return lx > this.T + m && lx < this.W - this.T - m && lz > this.T * 0.5 + m && lz < this.D - this.T - m;
    },
};
