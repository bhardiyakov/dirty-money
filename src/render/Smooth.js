// ============================================================================
// Smooth — GRÁFICO SUAVE (sempre ligado: o jogo é só em alta definição):
//   • resolução real do monitor: a tela é desenhada na densidade de pixels do aparelho (até Config.perf.dprCap), sem o navegador
//     ampliar a imagem (Windows a 125%/150%, telas retina) — ver GameEngine._applyScale;
//   • MSAA nas bordas da geometria (prédios, meios-fios, postes, carros 3D; 4×, 8× no preset HD): o jogo é desenhado num alvo
//     multiamostrado — o 1º pós-processamento da câmera — e resolvido na tela. Sem WebGL 2: FXAA. (Os personagens 2,5D são sprites:
//     o antisserrilhado deles é o supersampling no próprio shader — NpcArt, Config.art.npcAA);
//   • texturas do mundo (asfalto, calçada, faixas, telhados: Pixel.toTexture) com filtro trilinear e anisotrópico, e o chão do mundo
//     grande (TerrainSplat) sem a grade de 5 cm: sem o grão "serrilhado" nem pixels de tamanhos desiguais com a câmera andando;
//   • sombras com borda macia (PCF de qualidade média em vez da baixa).
// (Config.art.smooth = false ou pixelate = true, só para depurar, voltam ao de antes. O AutoQuality não mexe nele.)
// ============================================================================

const Smooth = {
	on: false,
	pp: null,              // pós-processamento do antisserrilhado (MSAA ou FXAA), o 1º da câmera

	// Ligado nos Ajustes e fora do modo pixel art.
	get wanted() { const A = Config.art; return !A.pixelate && A.smooth !== false; },

	// Aplica o estado desejado (boot, Ajustes, AutoQuality). Refaz a escala da tela (a densidade do monitor só vale com ele ligado).
	apply(game) {
		const on = this.wanted, ge = game.gameEngine;
		if (on === this.on && !!this.pp === on) return;
		this.on = on;
		if (ge && ge.resize) { ge.resize(); if (game.camera) { game.camera.fitPixelScale(ge.viewHeight); game.camera.onResize(); } }
		if (game.camera) this._antialias(game.camera.camera, ge.engine, on);
		this._textures(game.scene, on);
		if (ge && ge.shadowGenerator) ge.shadowGenerator.filteringQuality = on ? BABYLON.ShadowGenerator.QUALITY_MEDIUM : BABYLON.ShadowGenerator.QUALITY_LOW;
		this._thaw(game.scene);
		console.log(`[GRÁFICO] suave ${on ? 'ligado' : 'desligado'}${on ? ` (${this.pp ? this.pp.name : '-'}, ${ge.engine.getRenderWidth()}×${ge.engine.getRenderHeight()})` : ''}`);
	},

	// Zoom (Game, todo quadro, com os px da tela por metro): árvores, arbustos e mobiliário de rua (PropSprites, atlas de paleta) com
	// o gráfico suave usam o bilinear à mão "nítido" — o miolo de cada pixel da arte fica duro e só a borda entre pixels é suavizada,
	// na medida do zoom (como os personagens 2,5D, NpcArt.setZoom).
	zoom(game, screenPxPerMeter) {
		const props = game.gameEngine.world && game.gameEngine.world.props;
		if (props && props.setSharp) props.setSharp(this.on ? Math.max(1, Math.round(screenPxPerMeter / Config.art.ppu * 8) / 8) : 0);
	},

	// Os materiais do mundo são congelados depois da carga (Game._freezeStaticMaterials): não reavaliam os defines (qualidade da
	// sombra) nem reenviam o uniform do chão (TerrainSplat). Trocando o ajuste no meio do jogo, descongela e congela de novo depois
	// que os shaders novos ficaram prontos.
	_thaw(scene) {
		const list = scene.materials.filter((m) => m.isFrozen);
		if (!list.length) return;
		for (const m of list) m.unfreeze();
		clearTimeout(this._refreeze);
		this._refreeze = setTimeout(() => { for (const m of list) if (!m.isFrozen) m.freeze(); }, 2000);
	},

	_antialias(cam, eng, on) {
		if (on && !this.pp) {
			if (eng.webGLVersion >= 2 && eng.getCaps().maxMSAASamples > 1) {
				this.pp = new BABYLON.PassPostProcess('msaa', 1.0, cam, BABYLON.Texture.BILINEAR_SAMPLINGMODE, eng);
				this.pp.samples = this.samples(eng);
			} else this.pp = new BABYLON.FxaaPostProcess('fxaa', 1.0, cam, BABYLON.Texture.BILINEAR_SAMPLINGMODE, eng);
			// o MSAA só vale no 1º pós-processamento (é nele que a cena é desenhada): na frente do borrão de velocidade, se houver
			if (cam._postProcesses[0] !== this.pp) { cam.detachPostProcess(this.pp); cam.attachPostProcess(this.pp, 0); }
		} else if (!on && this.pp) {
			cam.detachPostProcess(this.pp);
			this.pp.dispose();
			this.pp = null;
		}
	},

	// Amostras do MSAA: as do preset (Config.art.msaa — 4; 8 no HD), até o que a placa aceita; 8× só com a tela de até 4 Mpx (num
	// monitor 4K o alvo multiamostrado passaria de meio GB).
	samples(eng) {
		const want = Config.art.msaa || 4, px = eng.getRenderWidth() * eng.getRenderHeight();
		return Math.max(2, Math.min(want > 4 && px > 4.2e6 ? 4 : want, eng.getCaps().maxMSAASamples));
	},

	// Amostragem das texturas do mundo (as feitas por Pixel.toTexture com mipmaps e repetição: os ladrilhos do chão e dos telhados).
	// Atlas de sprites (sem repetição) continuam nítidos: filtrar misturaria os vizinhos no atlas.
	sampling(tex) { return this.on ? BABYLON.Texture.TRILINEAR_SAMPLINGMODE : BABYLON.Texture.NEAREST_NEAREST_MIPNEAREST; },
	_textures(scene, on) {
		for (const t of scene.textures) {
			if (!t._dmTile) continue;
			t.updateSamplingMode(this.sampling(t));
			t.anisotropicFilteringLevel = on ? Math.max(4, t._dmAniso || 1) : (t._dmAniso || 1);
		}
	},
};
