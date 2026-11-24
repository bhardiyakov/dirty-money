// ============================================================================
// GpuCheck — TESTE DE DESENHO na abertura, antes do mundo existir. Num notebook com Intel Iris Xe (Chrome no Windows, Direct3D 11)
// os MATERIAIS PADRÃO do Babylon (mundo, interiores, fundo) eram "desenhados" (o contador de desenhos subia) sem nada aparecer:
// a tela ficava só com a cor do céu e o jogador por cima (ele e as partículas usam shaders próprios, com uniforms simples).
// Aqui, numa cena descartável, um plano VERMELHO de material padrão — com a luz, a névoa de distância (a mesma conta do jogo:
// core/camera.js EDGE_FOG, na cor VERDE) e os plugins de material do jogo — é desenhado na frente de um fundo AZUL, e o pixel do meio
// diz o que aconteceu:
//   vermelho = ok · verde = a névoa engoliu tudo · azul = nada foi desenhado · outra cor = desenho errado.
// O teste roda COMO O JOGO RODA: com a compilação paralela de shaders (KHR_parallel_shader_compile), se a placa tem. No mesmo notebook
// o Firefox (sem ela) desenhava e o Chrome (com ela) não. Falhou: tenta as saídas conhecidas e fica com a primeira que desenha —
//   1) SEM COMPILAÇÃO PARALELA (o Babylon compila na hora, como no Firefox);
//   2) sem UNIFORM BUFFERS (engine.disableUniformBuffers: cada uniform solto, o caminho do WebGL 1), com e sem a paralela;
//   3) a névoa padrão do Babylon (distância do olho) no lugar da nossa — o corte das bordas da câmera de cima sai.
// Nada desenha: volta ao normal e deixa o resultado no diagnóstico (core/Diag.js) para quem cuida do jogo.
// Custo: uma compilação de shader na carga. `?paralelo=0` força sem compilação paralela, `?ubo=0` sem uniform buffers (e o modo seguro
// pede o mesmo, para a placa, quando nada na cena resolveu); `?desenho=simular` finge que o primeiro desenho falhou.
// ============================================================================

const GpuCheck = {
	result: null,              // { mode: 'ok' | nome da variante que desenhou | 'forçado' | 'falhou' | 'pulado', tries: [[nome, cor]], ms }
	hadParallel: false,        // a placa oferece compilação paralela (KHR_parallel_shader_compile)
	fogPlain: false,           // a névoa padrão do Babylon (a nossa falhou): a câmera de cima fica sem névoa (CompassCamera._applyFog)

	get label() {
		const r = this.result;
		if (!r) return 'não rodou';
		const T = r.tries.map(([n, c]) => `${n}: ${c}`).join(' · ');
		return { ok: 'ok', pulado: 'pulado' }[r.mode] || (r.mode === 'falhou' ? `FALHOU (${T})` : r.mode === 'forçado' ? `forçado: ${r.tries.map((t) => t[0]).join(', ')}` : `modo compatível «${r.mode}» (${T})`);
	},

	run(eng) {
		const q = typeof location !== 'undefined' ? location.search : '', t0 = performance.now();
		const caps = eng.getCaps(), par0 = caps.parallelShaderCompile, tries = [];
		this.hadParallel = !!par0;
		// pedidos: na URL, ou do modo seguro para esta placa (core/SafeMode.js: a imagem não chegou e nada na cena resolveu)
		let sm = null;
		try { const s = Store.getJSON('safeMode'); if (s && s.rev === SafeMode.REV && s.gpu === SafeMode._gpu()) sm = s; } catch (e) { /* segue */ }
		const forced = [];
		// a placa de vídeo REINICIOU o jogo nos últimos 7 dias (engine.js anota): a próxima abertura compila sem paralelismo, como o
		// Firefox — o Chrome bloqueia o WebGL do site depois de algumas reinicializações da placa ("WebGL not supported" até reabrir)
		let lost = null;
		try { const L = Store.getJSON('gpuLost', []) || [], me = SafeMode._gpu(); lost = L.filter((x) => x.gpu === me && Date.now() - x.t < 7 * 864e5); } catch (e) { /* segue */ }
		// INTEL NO DIRECT3D 11 (Iris Xe, UHD… no Chrome e no Edge): já abre sem paralelismo. No notebook Iris Xe o Chrome (com ela) não
		// desenhava o mundo, travou a placa até o Windows reiniciar o driver (a tela piscando) e acabou bloqueando o WebGL do site; o
		// Firefox (que não tem a compilação paralela no Direct3D) rodava o Medium a 25–30 FPS. `?paralelo=1` liga mesmo assim.
		let gpuName = '';
		try { gpuName = SafeMode._gpu(); } catch (e) { /* segue */ }
		const keepPar = /[?&]paralelo=1\b/.test(q);
		if (par0 && !keepPar && this.noParallelFor(gpuName)) { caps.parallelShaderCompile = undefined; forced.push('sem compilação paralela (placa Intel no Direct3D 11: o modo do Firefox)'); }
		else if (lost && lost.length && par0 && !keepPar) { caps.parallelShaderCompile = undefined; forced.push(`sem compilação paralela (a placa reiniciou o jogo ${lost.length}× em 7 dias)`); }
		if (/[?&]paralelo=0\b/.test(q) || (sm && sm.noParallel)) { caps.parallelShaderCompile = undefined; forced.push('sem compilação paralela' + (sm && sm.noParallel ? ' (pedido pelo modo seguro)' : ' (?paralelo=0)')); }
		if (/[?&]ubo=0\b/.test(q) || (sm && sm.ubo0)) { eng.disableUniformBuffers = true; forced.push('sem uniform buffers' + (sm && sm.ubo0 ? ' (pedido pelo modo seguro)' : ' (?ubo=0)')); }
		if (forced.length) { this.result = { mode: 'forçado', tries: forced.map((f) => [f, '-']), ms: 0 }; return this.result; }
		if (/[?&]desenho=0\b/.test(q) || !eng._gl) { this.result = { mode: 'pulado', tries, ms: 0 }; return this.result; }
		const fake = /[?&]desenho=simular\b/.test(q);
		const ubo0 = eng.disableUniformBuffers, S = BABYLON.Effect.IncludesShadersStore, fog0 = S.fogFragmentDeclaration;
		const plainFog = typeof CompassCamera !== 'undefined' && CompassCamera.BJS_FOG, P = !!par0;
		// [nome, compilação paralela, sem uniform buffers, névoa padrão] — o normal é COMO O JOGO RODA (com a compilação paralela, se a
		// placa tem): no notebook Iris Xe o Firefox (sem ela) desenhava e o Chrome (com ela) não, na mesma placa e no mesmo Direct3D 11
		const V = [['normal', P, false, false]];
		if (P) V.push(['sem compilação paralela', false, false, false]);
		V.push(['sem UBO', P, true, false]);
		if (P) V.push(['sem paralela e sem UBO', false, true, false]);
		if (plainFog) V.push(['névoa padrão', P, false, true], ['sem paralela, sem UBO e névoa padrão', false, true, true]);
		let pick = null;
		for (const v of V) {
			const [name, par, noUbo, fogStd] = v;
			eng.disableUniformBuffers = noUbo || ubo0;
			S.fogFragmentDeclaration = fogStd ? plainFog : fog0;
			let c = this._draw(eng, par);
			if (fake && name === 'normal') c = 'azul (simulado)';
			tries.push([name, c]);
			if (c === 'vermelho') { pick = v; break; }
		}
		if (!pick) { eng.disableUniformBuffers = ubo0; S.fogFragmentDeclaration = fog0; caps.parallelShaderCompile = par0; }
		else {
			caps.parallelShaderCompile = pick[1] ? par0 : undefined;
			eng.disableUniformBuffers = pick[2] || ubo0;
			S.fogFragmentDeclaration = pick[3] ? plainFog : fog0;
			this.fogPlain = !!pick[3];
		}
		const mode = !pick ? 'falhou' : pick[0] === 'normal' ? 'ok' : pick[0];
		this.result = { mode, tries, ms: Math.round(performance.now() - t0) };
		if (mode === 'falhou') console.error('[DESENHO] o material padrão não desenhou em nenhum modo: ' + this.label);
		else if (mode !== 'ok') console.warn('[DESENHO] o material padrão não desenhava nesta placa — ' + this.label);
		return this.result;
	},

	// Placas que abrem sem a compilação paralela de shaders: Intel traduzida para Direct3D 11 pelo ANGLE (o nome que o navegador dá:
	// "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics … Direct3D11 …)").
	noParallelFor(renderer) { return /intel/i.test(renderer || '') && /direct3d ?11|d3d11/i.test(renderer || ''); },

	// ERROS DE DESENHO num quadro da cena do jogo: depois de CADA desenho de malha, pergunta à placa (gl.getError) se ele foi recusado —
	// e anota qual malha. (O Chrome escreve esses erros só no console dele, que o jogo não lê.) Para o diagnóstico.
	frameErrors(scene) {
		const eng = scene.getEngine(), gl = eng._gl;
		if (!gl) return 'sem WebGL';
		for (let i = 0; i < 20 && gl.getError(); i++);
		const P = BABYLON.Mesh.prototype, orig = P._draw, errs = new Map();
		let draws = 0;
		P._draw = function (...a) {
			const r = orig.apply(this, a); draws++;
			const e = gl.getError();
			if (e) { const k = '0x' + e.toString(16); if (!errs.has(k)) errs.set(k, []); const L = errs.get(k); if (L.length < 6) L.push(this.name); }
			return r;
		};
		let other = 0;
		try { scene.render(); other = gl.getError(); } catch (e) { return 'erro no quadro: ' + (e && e.message || e); } finally { P._draw = orig; }
		if (!errs.size && !other) return `nenhum em ${draws} desenhos`;
		return [...errs].map(([k, L]) => `GL ${k} em ${L.join(', ')}`).join(' · ') + (other ? ` · depois do quadro GL 0x${other.toString(16)}` : '') + ` (${draws} desenhos)`;
	},

	// Uma cena descartável: plano vermelho (material padrão, cor por vértice branca, luz, névoa de perseguição verde) a 3 m da câmera,
	// fundo azul. A cor do pixel do meio, por nome.
	_draw(eng, parallel) {
		const caps = eng.getCaps(), par = caps.parallelShaderCompile;
		if (!parallel) caps.parallelShaderCompile = undefined;                   // (sem ela: compila na hora)
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
			const tw = performance.now();                                         // (com a compilação paralela o shader fica pronto depois:
			do sc.render(); while (!mat.isReady(m) && performance.now() - tw < 2500);  //  a placa compila enquanto o quadro vazio se repete)
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
