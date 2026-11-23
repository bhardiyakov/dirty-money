// ============================================================================
// GpuCheck — TESTE DE DESENHO na abertura, antes do mundo existir. Num notebook com Intel Iris Xe (Chrome no Windows, Direct3D 11)
// os MATERIAIS PADRÃO do Babylon (mundo, interiores, fundo) eram "desenhados" (o contador de desenhos subia) sem nada aparecer:
// a tela ficava só com a cor do céu e o jogador por cima (ele e as partículas usam shaders próprios, com uniforms simples).
// Aqui, numa cena descartável, um plano VERMELHO de material padrão — com a luz, a névoa de distância (a mesma conta do jogo:
// core/camera.js EDGE_FOG, na cor VERDE) e os plugins de material do jogo — é desenhado na frente de um fundo AZUL, e o pixel do meio
// diz o que aconteceu:
//   vermelho = ok · verde = a névoa engoliu tudo · azul = nada foi desenhado · outra cor = desenho errado.
// Falhou: tenta as saídas conhecidas, uma de cada vez, e fica com a primeira que desenha —
//   1) sem UNIFORM BUFFERS (engine.disableUniformBuffers: cada uniform solto, o caminho do WebGL 1);
//   2) a névoa padrão do Babylon (distância do olho) no lugar da nossa — o corte das bordas da câmera de cima sai;
//   3) as duas juntas.
// Nada desenha: volta ao normal e deixa o resultado no diagnóstico (core/Diag.js) para quem cuida do jogo.
// Custo: uma compilação de shader (síncrona) na carga. `?ubo=0` força o modo sem uniform buffers; `?desenho=simular` finge que o
// primeiro desenho falhou (para testar as saídas).
// ============================================================================

const GpuCheck = {
	result: null,              // { mode: 'ok' | 'semUBO' | 'névoaPadrão' | 'semUBO+névoaPadrão' | 'falhou' | 'pulado', tries: [[nome, cor]], ms }
	fogPlain: false,           // a névoa padrão do Babylon (a nossa falhou): a câmera de cima fica sem névoa (CompassCamera._applyFog)

	get label() {
		const r = this.result;
		if (!r) return 'não rodou';
		const T = r.tries.map(([n, c]) => `${n}: ${c}`).join(' · ');
		return { ok: 'ok', pulado: 'pulado' }[r.mode] || (r.mode === 'falhou' ? `FALHOU (${T})` : `modo compatível «${r.mode}» (${T})`);
	},

	run(eng) {
		const q = typeof location !== 'undefined' ? location.search : '', t0 = performance.now();
		const tries = [];
		if (/[?&]ubo=0\b/.test(q)) { eng.disableUniformBuffers = true; this.result = { mode: 'semUBO', tries: [['forçado por ?ubo=0', '-']], ms: 0 }; return this.result; }
		if (/[?&]desenho=0\b/.test(q) || !eng._gl) { this.result = { mode: 'pulado', tries, ms: 0 }; return this.result; }
		const fake = /[?&]desenho=simular\b/.test(q);
		const ubo0 = eng.disableUniformBuffers, S = BABYLON.Effect.IncludesShadersStore, fog0 = S.fogFragmentDeclaration;
		const plainFog = typeof CompassCamera !== 'undefined' && CompassCamera.BJS_FOG;
		const variants = [['normal', false, false], ['sem UBO', true, false]];
		if (plainFog) variants.push(['névoa padrão', false, true], ['sem UBO + névoa padrão', true, true]);
		let mode = 'falhou';
		for (const [name, noUbo, fogStd] of variants) {
			eng.disableUniformBuffers = noUbo || ubo0;
			S.fogFragmentDeclaration = fogStd ? plainFog : fog0;
			let c = this._draw(eng);
			if (fake && name === 'normal') c = 'azul (simulado)';
			tries.push([name, c]);
			if (c === 'vermelho') { mode = name === 'normal' ? 'ok' : name === 'sem UBO' ? 'semUBO' : name === 'névoa padrão' ? 'névoaPadrão' : 'semUBO+névoaPadrão'; break; }
		}
		if (mode === 'falhou') { eng.disableUniformBuffers = ubo0; S.fogFragmentDeclaration = fog0; }
		else this.fogPlain = S.fogFragmentDeclaration !== fog0;
		this.result = { mode, tries, ms: Math.round(performance.now() - t0) };
		if (mode === 'falhou') console.error('[DESENHO] o material padrão não desenhou em nenhum modo: ' + this.label);
		else if (mode !== 'ok') console.warn('[DESENHO] o material padrão não desenhava nesta placa — ' + this.label);
		return this.result;
	},

	// Uma cena descartável: plano vermelho (material padrão, cor por vértice branca, luz, névoa de perseguição verde) a 3 m da câmera,
	// fundo azul. A cor do pixel do meio, por nome.
	_draw(eng) {
		const caps = eng.getCaps(), par = caps.parallelShaderCompile;
		caps.parallelShaderCompile = undefined;                                  // (compila na hora: o teste é síncrono)
		let sc = null, out = 'erro';
		try {
			sc = new BABYLON.Scene(eng);
			sc.clearColor = new BABYLON.Color4(0, 0, 1, 1);
			const cam = new BABYLON.FreeCamera('gpuCheckCam', new BABYLON.Vector3(0, 0, -3), sc);
			cam.setTarget(BABYLON.Vector3.Zero()); cam.minZ = 0.1; cam.maxZ = 100;
			new BABYLON.HemisphericLight('gpuCheckHemi', new BABYLON.Vector3(0, 1, 0), sc).intensity = 0.2;
			const sun = new BABYLON.DirectionalLight('gpuCheckSun', new BABYLON.Vector3(0.3, -1, 0.4), sc); sun.intensity = 0.2;
			new BABYLON.PointLight('gpuCheckLamp', new BABYLON.Vector3(0, 1, -1), sc).intensity = 0.2;     // (três luzes, como no cômodo do esconderijo)
			const m = BABYLON.MeshBuilder.CreatePlane('gpuCheckPlane', { size: 4, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, sc);
			const n = m.getTotalVertices(), col = new Float32Array(n * 4).fill(1);
			m.setVerticesData(BABYLON.VertexBuffer.ColorKind, col, false, 4);
			const mat = new BABYLON.StandardMaterial('gpuCheckMat', sc);
			mat.maxSimultaneousLights = 6;
			mat.diffuseColor = new BABYLON.Color3(0.1, 0, 0); mat.specularColor = BABYLON.Color3.Black(); mat.emissiveColor = new BABYLON.Color3(1, 0, 0);
			m.material = mat;
			sc.fogMode = BABYLON.Scene.FOGMODE_LINEAR; sc.fogColor = new BABYLON.Color3(0, 1, 0);
			sc.fogStart = 36; sc.fogEnd = 80; sc.fogDensity = -1000;             // (a névoa de perseguição do jogo: distância do olho)
			for (let i = 0; i < 4 && !mat.isReady(m); i++) sc.render();          // (1º: cria o efeito; os seguintes: compilado)
			sc.render();
			const gl = eng._gl, px = new Uint8Array(4);
			eng.restoreDefaultFramebuffer();
			gl.readPixels(gl.drawingBufferWidth >> 1, gl.drawingBufferHeight >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
			const [r, g, b] = px;
			out = r > 150 && g < 90 && b < 90 ? 'vermelho' : g > 150 && r < 90 && b < 90 ? 'verde' : b > 150 && r < 90 && g < 90 ? 'azul' : `rgb(${r},${g},${b})`;
			if (!mat.isReady(m)) out += ' (shader não ficou pronto)';
		} catch (e) { out = 'erro: ' + (e && e.message || e); }
		try { if (sc) sc.dispose(); } catch (e) { /* segue */ }
		try { eng.releaseEffects(); } catch (e) { /* segue */ }                 // (o cache de efeitos não sabe do modo: o jogo compila do zero)
		caps.parallelShaderCompile = par;
		return out;
	},
};
