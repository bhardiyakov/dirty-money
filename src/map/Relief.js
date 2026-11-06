// ============================================================================
// Relief — o RELEVO DE VERDADE (Config.relief): o mapa de alturas do WorldMap (morros, favelas, encostas — até ~80 m) deixa de ser só
// sombreado e vira altura na tela. A física, a navegação e a lógica do jogo seguem no plano (x, z); quem DESENHA soma a altura do chão:
//   • o mundo estático: MeshBatch.build desloca cada vértice (o chão e as ruas seguem a encosta — os pisos grandes são subdivididos
//     antes); construção (MeshBatch.anchor) fica NIVELADA: a parte de cima sobe por igual (a altura do meio do lote) e só a base desce
//     até o chão — no morro, a casa ganha a parede de baixo, como um barraco em cima de pilares;
//   • árvores 3D, brilhos (GlowBatch), personagens 2,5D (SpriteActor), carros 3D (inclinados pela encosta), sombras e a câmera.
//   at(x, z)            altura do chão (m) em (x, z) — 0 com o relevo desligado (`?relevo=0`)
//   slope(x, z, dx, dz) inclinação (m/m) andando na direção (dx, dz) normalizada
// ============================================================================

const Relief = {
	get on() { return !!(Config.relief && Config.relief.on && typeof WorldMap !== 'undefined' && WorldMap.h); },
	at(x, z) {
		if (!this.on || !WorldMap.inWorld(x, z)) return 0;                 // (fora do mundo — o palco dos interiores: chão plano)
		return WorldMap.heightAt(x, z) * Config.relief.scale;
	},
	slope(x, z, dx, dz) {
		if (!this.on) return 0;
		const e = 1.5;
		return (this.at(x + dx * e, z + dz * e) - this.at(x - dx * e, z - dz * e)) / (2 * e);
	},
};
