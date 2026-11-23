// ============================================================================
// SceneProbe — EXPERIMENTOS NA CENA DE VERDADE quando a imagem não chega (core/SafeMode.js: a vigia viu só a cor do céu). Num notebook
// com Iris Xe (Direct3D 11) o teste de desenho da abertura (core/GpuCheck.js) passava — o material padrão desenha numa cena isolada —,
// mas no jogo só o jogador e as partículas apareciam. A diferença está em algo que só a cena do jogo tem; aqui, uma suspeita por vez:
// liga a mudança, espera os shaders, desenha um quadro e olha a tela (SafeMode._blank). A 1ª que faz o mundo aparecer FICA (e o modo
// seguro lembra dela na próxima abertura, se der para repetir); as que não ajudam voltam como estavam. Tudo vai para o diagnóstico.
//   rtt       texturas desenhadas fora da tela (sombra, luz da noite, espelho d'água): cada uma regrava, no meio do quadro, a câmera
//             no uniform buffer da cena que os materiais padrão leem (o jogador recebe a matriz solta)
//   fog       a névoa (empurrada para o infinito)
//   plugins   o plugin de material que vale para TODOS os materiais padrão (render/NightLights.js; os outros são só do mundo)
//   lights    as luzes (fica só a cor própria/emissiva)
//   textures  as texturas
// ============================================================================

const SceneProbe = {
	results: null,             // [[id, 'IMAGEM' | 'céu' | '?']]
	kept: null,                // o id que ficou ligado
	running: false,
	NAMES: { rtt: 'texturas fora da tela', fog: 'névoa', plugins: 'o plugin de luz da noite nos materiais', lights: 'luzes', textures: 'texturas' },
	ORDER: ['rtt', 'fog', 'plugins', 'lights', 'textures'],
	THAW: { plugins: true, lights: true, textures: true },          // (trocam os defines: os materiais congelados do mundo precisam soltar)

	get label() {
		if (this.running) return 'rodando…';
		if (!this.results) return 'não rodou';
		const r = this.results.map(([id, v]) => `sem ${this.NAMES[id]}: ${v}`).join(' · ');
		return (this.kept ? `o mundo voltou sem ${this.NAMES[this.kept]} (fica assim) — ` : 'nada fez o mundo aparecer — ') + r + (this.info ? ' · ' + this.info : '') + (this.errors ? ' · erros de desenho: ' + this.errors : '');
	},

	// Liga uma mudança; devolve a função que desfaz.
	set(g, id) {
		const s = g.scene;
		if (id === 'rtt') { const v = s.renderTargetsEnabled; s.renderTargetsEnabled = false; return () => { s.renderTargetsEnabled = v; }; }
		if (id === 'fog') {                                                              // (a névoa para o infinito: sem recompilar shader nenhum)
			this.noFog = true; const a = s.fogStart, b = s.fogEnd;
			const keep = () => { s.fogStart = CompassCamera.NO_FOG; s.fogEnd = CompassCamera.NO_FOG + 1; };
			keep(); const o = s.onBeforeRenderObservable.add(keep);                       // (a câmera refaz a névoa todo quadro)
			return () => { this.noFog = false; s.onBeforeRenderObservable.remove(o); s.fogStart = a; s.fogEnd = b; };
		}
		if (id === 'lights') { const v = s.lightsEnabled; s.lightsEnabled = false; return () => { s.lightsEnabled = v; }; }
		if (id === 'textures') { const v = s.texturesEnabled; s.texturesEnabled = false; return () => { s.texturesEnabled = v; }; }
		if (id === 'plugins') {                                                          // (o plugin que vale para TODOS os materiais padrão)
			if (typeof NightLights === 'undefined') return () => {};
			NightLights.off = true; s.markAllMaterialsAsDirty(BABYLON.Constants.MATERIAL_AllDirtyFlag);
			return () => { NightLights.off = false; s.markAllMaterialsAsDirty(BABYLON.Constants.MATERIAL_AllDirtyFlag); };
		}
		return () => {};
	},
	// Na abertura: repete o que ficou guardado (SafeMode: degrau 'x:id').
	apply(g, id) {
		if (this.THAW[id]) this._thaw(g);
		this.set(g, id);
		this.kept = id;
	},
	// Os materiais do mundo ficam congelados depois da carga (não reavaliam os defines): soltos, as mudanças valem para eles também.
	_thaw(g) {
		for (const m of g.scene.materials) if (m.isFrozen) m.unfreeze();
		if (typeof Smooth !== 'undefined') clearTimeout(Smooth._refreeze);
	},

	async run(g, look) {
		if (this.running) return this.kept;
		this.running = true; this.results = []; this.kept = null;
		const s = g.scene, cam = s.activeCamera;
		try {
			this.info = cam ? `câmera ${cam.mode === 1 ? 'ortográfica' : 'perspectiva'} perto ${(+cam.minZ).toFixed(2)} longe ${Math.round(cam.maxZ)} · alvos fora da tela: ${s.customRenderTargets.length} + ${s.lights.filter((l) => l.getShadowGenerator && l.getShadowGenerator()).length} sombra` : '';
			if (typeof GpuCheck !== 'undefined') this.errors = GpuCheck.frameErrors(s);
			for (const id of this.ORDER) {
				if (this.THAW[id]) this._thaw(g);
				const undo = this.set(g, id);
				await Promise.race([s.whenReadyAsync(), new Promise((r) => setTimeout(r, 8000))]);
				let v = '?';
				for (let k = 0; k < 3 && v === '?'; k++) { s.render(); const b = look(); if (b !== null) v = b ? 'céu' : 'IMAGEM'; }
				this.results.push([id, v]);
				console.warn(`[SEGURO] teste da cena — sem ${this.NAMES[id]}: ${v}`);
				if (v === 'IMAGEM') { this.kept = id; break; }
				undo();
			}
		} catch (e) { console.warn('[SEGURO] teste da cena falhou:', e); }
		this.running = false;
		return this.kept;
	},
};
