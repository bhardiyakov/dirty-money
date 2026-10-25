// ============================================================================
// SafeHouse — o esconderijo (safe house) do protagonista: um BARRACO de um cômodo só na favela, com interior. É o ponto de
// partida do jogo — o personagem está quebrado: colchão no chão sobre paletes, um armário velho com as poucas mudas de roupa,
// geladeira pequena, fogareiro de duas bocas com o botijão do lado, um caixote de feira como baú, a lata escondida onde se guarda
// dinheiro e um balde aparando a goteira. Acesso livre: a porta da frente é só um vão (sem chave, sem tecla) — entrou, está dentro.
//
// Este arquivo é só o PLANO (geometria e colisão), carregado antes do CityGrid:
//   • reserva um quarteirão da favela (CityGrid chama SafeHouse.plan(bloco) no lugar de sortear casinhas);
//   • registra paredes e móveis como sólidos (CityGrid.obstacles: o jogador, a polícia e as balas respeitam);
//   • marca o interior como "fora da navegação" dos pedestres (CityGrid.navBlocks);
//   • guarda as aberturas (porta e janelas) e o desenho dos móveis para a arte (art/HouseArt.js) e a vista (world/HouseView.js).
// Coordenadas LOCAIS: origem no canto sudoeste (externo) da casa, x → leste, z → norte. Mundo = (ox + x, oz + z).
// ============================================================================

const SafeHouse = {
	blockId: null,                  // (a favela orgânica põe a casa no lugar dela: FavelaPlan.SAFE)
	W: 9.6, D: 7.4,                 // tamanho externo (u): um cômodo só
	T: 0.45,                        // espessura das paredes externas
	H: 2.5,                         // altura das paredes
	ROOF_Y: 2.75,                   // altura do telhado
	MAT_CUT: 4.4,                   // remendo das paredes sul e norte: zinco a oeste, bloco sem reboco a leste
	placed: false,
	ox: 0, oz: 0,

	// Porta da frente (x, na parede sul).
	door: { x0: 6.5, x1: 8.1, h: 2.0 },

	// Janelas: parede ('S' sul, 'N' norte, 'E' leste), faixa [a, b] ao longo dela, peitoril e topo (pequenas, com plástico).
	windows: [
		{ wall: 'S', a: 1.4, b: 2.8, y0: 1.0, y1: 1.8 },
		{ wall: 'N', a: 3.9, b: 5.2, y0: 1.1, y1: 1.9 },
		{ wall: 'E', a: 3.0, b: 4.2, y0: 1.1, y1: 1.8 },
	],

	// Móveis (base no chão: x0, z0, x1, z1) e altura. `use`: o que o E faz (Interiors.homeUse); `prompt`: texto próprio do aviso.
	// A arte desenha cada um (HouseArt).
	furniture: [
		{ kind: 'bed',      x0: 0.7,  z0: 0.8,  x1: 2.9,  z1: 3.8,  h: 0.35, use: 'bed' },
		{ kind: 'tin',      x0: 3.05, z0: 0.8,  x1: 3.55, z1: 1.3,  h: 0.3,  use: 'safe', prompt: '<b>E</b> abrir a lata escondida<small>onde você guarda dinheiro e joias</small>' },
		{ kind: 'wardrobe', x0: 0.65, z0: 5.6,  x1: 2.45, z1: 6.9,  h: 1.9,  use: 'wardrobe' },
		{ kind: 'gas',      x0: 4.5,  z0: 6.25, x1: 5.0,  z1: 6.75, h: 0.7 },
		{ kind: 'stove',    x0: 5.15, z0: 6.0,  x1: 6.6,  z1: 6.9,  h: 0.8 },
		{ kind: 'fridge',   x0: 7.55, z0: 5.75, x1: 9.1,  z1: 6.9,  h: 1.5,  use: 'fridge' },
		{ kind: 'chest',    x0: 7.9,  z0: 0.75, x1: 9.1,  z1: 1.75, h: 0.55, use: 'chest' },
		{ kind: 'bucket',   x0: 4.4,  z0: 3.3,  x1: 4.9,  z1: 3.8,  h: 0.4 },
	],

	// Onde o jogador acorda (ao lado do colchão, de frente para o sul).
	spawn: { x: 3.6, z: 2.5, face: Math.PI },

	// ---------------------------------------------------------------- plano
	// Chamado pelo FavelaPlan (at = canto sudoeste reservado, com o quintal na frente, ao sul) ou pelo CityGrid no quarteirão
	// `blockId` (centrada no pé dele, 3,5 u de quintal): registra sólidos e deixa uma "lote" marcada (o WorldBuilder não desenha o
	// prédio genérico).
	plan(block, grid, at = null) {
		const [fx0, fz0, fx1, fz1] = block.foot;
		this.ox = at ? at.x : Math.round(fx0 + (fx1 - fx0 - this.W) / 2);
		this.oz = at ? at.z : Math.round(fz0 + 3.5);
		this.block = block;
		const W = this.W, D = this.D, H = this.H;
		for (const r of this.solids()) this._solid(grid, r, r[4], r[5]);
		grid.navBlocks.push({ x0: this.ox - 0.2, z0: this.oz - 0.2, x1: this.ox + W + 0.2, z1: this.oz + D + 0.2 });      // pedestres/policiais a pé não entram
		block.lots.push({ x0: this.ox, z0: this.oz, x1: this.ox + W, z1: this.oz + D, floors: 1, height: H, facade: 'brick0', roof: 'zinc0', safehouse: true });
		this.placed = true;
	},

	// Prop (árvore, lixo, poste...) que atrapalha a casa? Copas altas tampam o corte do interior; o resto só não pode encostar nas paredes.
	crowds(p) {
		const m = p.type === 'tree' || p.type === 'pole' ? 6.5 : 1.0;
		return p.x > this.ox - m && p.x < this.ox + this.W + m && p.z > this.oz - m * 0.5 && p.z < this.oz + this.D + m;
	},

	// Walls ('wall') and furniture as solids in local coordinates: [x0, z0, x1, z1, height, kind]. Also the room on the interiors stage.
	solids() {
		const T = this.T, W = this.W, D = this.D, H = this.H, d = this.door;
		const walls = [
			[0, 0, d.x0, T], [d.x1, 0, W, T],                                               // parede sul, com o vão da porta
			[0, D - T, W, D],                                                               // norte
			[0, T, T, D - T], [W - T, T, W, D - T],                                         // oeste e leste
		];
		return walls.map((r) => [...r, H, 'wall']).concat(this.furniture.map((f) => [f.x0, f.z0, f.x1, f.z1, f.h, f.kind]));
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

	// Dentro do cômodo (entre as paredes)? `m` > 0 encolhe, < 0 alarga a área.
	inside(x, z, m = 0) {
		if (!this.placed) return false;
		const lx = x - this.ox, lz = z - this.oz;
		return lx > this.T + m && lx < this.W - this.T - m && lz > this.T * 0.5 + m && lz < this.D - this.T - m;
	},
};
