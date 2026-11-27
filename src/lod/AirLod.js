// ============================================================================
// AirLod — O QUE MUDA QUANDO A CÂMERA SOBE (avião, paraquedas). No chão nada disto roda (a névoa da perseguição e as faixas de cada
// sistema já dão conta); no ar, três camadas por distância do OLHO:
//   PERTO  (até ~240 m)   tudo: o detalhe miúdo, os props, a física (os colisores do Havok, só se a câmera estiver baixa)
//   MÉDIA  (~240–950 m)   as malhas mescladas da cidade por pedaço (paredes, telhados, ruas, vegetação até ~520 m); sem detalhe
//                         miúdo e sem física (lod/DetailCuller.js)
//   LONGA  (além de ~950) o mapa de longe: o relevo grosso, as quadras e os prédios em caixas, poucos pedaços (lod/FarProxy.js)
// E mais, coordenado daqui:
//   • o TERRENO em pedaços (map/TerrainBuilder) carrega num raio menor lá no alto (o mapa de longe cobre o resto);
//   • a FÍSICA: acima de Config.lod.physicsAlt o ColliderStreamer para de criar colisores (só descarta os que ficaram longe) e o
//     terreno adia os dos paredões — o avião bate em prédio e morro pela conta dele (Chopper.floorAt / Relief), não pelo Havok, e no
//     voo rápido o streaming criava e destruía corpos à toa. Descendo, tudo volta (os pendentes nascem com o orçamento de sempre);
//   • a névoa e o alcance da câmera crescem com a altitude e a velocidade (CompassCamera.setAir/_chaseFar — o clima e as nuvens
//     encurtam: _vis).
// Liga com histerese (Config.lod.onAlt / offAlt): nada liga e desliga na borda. Avalia a cada 0,25 s ou quando o olho anda 20 m — as
// trocas de faixa são de malha inteira (setEnabled no mapa de longe, máscara de camada no detalhe), nunca por quadro.
// Ciclo de vida: AirLod.update(dt, game) todo quadro (cria tudo na primeira vez que precisa) · AirLod.dispose().
// ============================================================================

const AirLod = {
	active: false,
	culler: null,
	proxy: null,
	R: { fine: 240, mid: 520, big: Infinity },
	stats: { active: false, hidden: 0, items: 0, proxyOn: 0, proxyReady: false, terrainMul: 1, physicsHold: false },
	_evalT: 0,
	_eye: null,
	_lastEye: null,

	get wanted() {
		const q = typeof location !== 'undefined' ? location.search : '';
		return !(Config.lod && Config.lod.on === false) && !/[?&]lodvoo=0\b/.test(q);
	},
	// Os raios pelo nível gráfico (aparelho fraco: o detalhe sai mais cedo).
	get scale() { const L = typeof Graphics !== 'undefined' ? Graphics.level : 'high'; return L === 'low' ? 0.75 : L === 'medium' ? 0.88 : L === 'hd' ? 1.2 : 1; },

	update(dt, game) {
		if (!game.scene || !game.camera) return;
		if (!this.wanted) { if (this.active) this._switch(false, game); return; }      // (desligado no meio do voo: devolve tudo)
		const C = Config.lod, cam = game.scene.activeCamera, gc = game.camera, k = gc.airK || 0, alt = gc.airAlt || 0;
		if (!cam) return;
		const indoors = typeof Interiors !== 'undefined' && Interiors.active;
		// o mapa de longe começa a ser montado assim que alguém decola (em fatias: não trava a decolagem)
		if (k > 0 && !indoors) {
			if (!this.proxy) this.proxy = new FarProxy(game.scene);
			if (!this.proxy.ready) { this.proxy.start(); this.proxy.pump(C.buildMs); }
		}
		const on = !indoors && (this.active ? k > 0.3 && alt > C.offAlt : k > 0.5 && alt > C.onAlt);
		if (on !== this.active) this._switch(on, game);
		if (!on) { this._ground(dt, game, cam, indoors); return; }
		if (!this.culler) this.culler = new DetailCuller(game.scene);
		this.culler.scan(dt);
		const E = this._eye || (this._eye = new BABYLON.Vector3()), L = this._lastEye || (this._lastEye = new BABYLON.Vector3(1e9, 0, 0));
		E.copyFrom(cam.globalPosition);
		this._evalT -= dt;
		if (this._evalT > 0 && BABYLON.Vector3.DistanceSquared(E, L) < 400) return;
		this._evalT = 0.25; L.copyFrom(E);
		const s = this.scale, R = this.R, ready = !!(this.proxy && this.proxy.ready);
		R.fine = C.fine * s; R.mid = C.mid * s; R.big = ready ? C.big * s : Infinity;
		this.culler.update(E, R);
		if (ready) this.proxy.show(E, R.big * 0.98);                              // (o longe aparece um pouco antes de o detalhe sair)
		this._terrain(game, alt > C.terrainAlt ? C.terrainMul : 1);
		this._physics(game, alt > C.physicsAlt);
		this._stats();
	},

	// NO CHÃO (aparelho fraco — Config.perf.fineCull, Ajustes › Gráficos): na câmera de perseguição a névoa mede a distância do olho e
	// apaga o longe; o detalhe miúdo (acabamento, meio-fio, fios, postes, pontos, brilhos) sai um pouco ANTES do fim dela, onde já está
	// quase todo na cor do céu — na favela ~25% dos triângulos da tela eram isso. Só a faixa fina; o resto fica como está.
	_ground(dt, game, cam, indoors) {
		const f = Config.perf.fineCull || 0, chase = typeof CompassCamera !== 'undefined' && CompassCamera.chase >= 0.5;
		const want = f > 0 && chase && !indoors, sc = game.scene;
		if (!want) { if (this._groundOn) { this._groundOn = false; if (this.culler) this.culler.restoreAll(); } return; }
		if (!this.culler) this.culler = new DetailCuller(sc);
		this.culler.scan(dt);
		const E = this._eye || (this._eye = new BABYLON.Vector3()), L = this._lastEye || (this._lastEye = new BABYLON.Vector3(1e9, 0, 0));
		E.copyFrom(cam.globalPosition);
		this._evalT -= dt;
		const R = this.R, fine = Math.max(20, sc.fogEnd * f);
		if (this._groundOn && this._evalT > 0 && BABYLON.Vector3.DistanceSquared(E, L) < 16 && Math.abs(fine - R.fine) < 2) return;
		this._groundOn = true; this._evalT = 0.25; L.copyFrom(E);
		R.fine = fine; R.mid = Infinity; R.big = Infinity;
		this.culler.update(E, R);
		this.stats.hidden = this.culler.stats.hidden; this.stats.items = this.culler.stats.items;
	},
	// Ligou: nada a fazer além da próxima avaliação. Desligou: devolve o detalhe, apaga o mapa de longe, o terreno e a física voltam.
	_switch(on, game) {
		this.active = on;
		this._evalT = 0; this._groundOn = false;
		if (this._lastEye) this._lastEye.set(1e9, 0, 0);
		if (!on) {
			if (this.culler) this.culler.restoreAll();
			if (this.proxy) this.proxy.hideAll();
			this._terrain(game, 1);
			this._physics(game, false);
		}
		this._stats();
	},

	_terrain(game, mul) {
		const T = game.gameEngine && game.gameEngine.world && game.gameEngine.world.terrain;
		if (T && T.radiusMul !== mul) { T.radiusMul = mul; T._last = null; }       // (refaz a lista de pedaços na próxima atualização)
	},
	_physics(game, hold) {
		const cs = game.colliderStream, T = game.gameEngine && game.gameEngine.world && game.gameEngine.world.terrain;
		if (cs) cs.hold = hold;
		if (T && T.holdColliders !== hold) { T.holdColliders = hold; if (!hold && T.flushColliders) T.flushColliders(); }
	},
	_stats() {
		const S = this.stats, cs = typeof game !== 'undefined' && game && game.colliderStream, T = typeof game !== 'undefined' && game && game.gameEngine && game.gameEngine.world && game.gameEngine.world.terrain;
		S.active = this.active; S.hidden = this.culler ? this.culler.stats.hidden : 0; S.items = this.culler ? this.culler.stats.items : 0;
		S.proxyOn = this.proxy ? this.proxy.shown : 0; S.proxyReady = !!(this.proxy && this.proxy.ready);
		S.terrainMul = T ? T.radiusMul || 1 : 1; S.physicsHold = !!(cs && cs.hold);
	},

	dispose() {
		if (this.culler) { this.culler.dispose(); this.culler = null; }
		if (this.proxy) { this.proxy.dispose(); this.proxy = null; }
		this.active = false;
	},
};
