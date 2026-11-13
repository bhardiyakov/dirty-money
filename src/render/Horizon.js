// ============================================================================
// Horizon — a ILUSÃO do horizonte na câmera de perseguição (a pé ou dirigindo): perto, a cidade de verdade; longe, uma FOTO dela.
//
// Antes: a névoa da perseguição fechava em ~125 m (a cor do céu) e a câmera ainda desenhava a cidade até ~385 m, toda escondida nela —
// a placa trabalhava à toa e o horizonte era uma parede de névoa. Agora:
//   • a câmera corta o desenho de verdade em R m (Config.camera.horizon.R) — o que fica além nem é desenhado;
//   • QUATRO FOTOS de 90° (norte, leste, sul, oeste), tiradas do lugar da câmera com uma câmera que só vê de R até `deep` m, mostram a
//     paisagem distante (prédios, morros, o mar, o Cristo) num cubo logo atrás do corte — onde a foto é transparente, o céu de sempre;
//   • a névoa vira uma BRUMA leve (fogNear..fogFar), a mesma nas duas partes: a emenda some.
// As fotos são refeitas uma por quadro (sem engasgo) quando a câmera anda `move` m do lugar delas ou a cada `refresh` s (a luz do dia
// muda). Só vale na perseguição em perspectiva, fora dos interiores. `?horizonte=0` (ou on: false) volta à névoa de antes.
// ============================================================================

const Horizon = {
	get C() { return Config.camera.horizon || {}; },
	get on() { const q = typeof location !== 'undefined' ? location.search : ''; return this.C.on !== false && !/[?&]horizonte=0\b/.test(q); },
	active: false,                // ligado agora (perseguição, fora de interior, fotos prontas)
	LAYER: 0x10000000,            // (o cubo das fotos: a câmera do jogo vê; as câmeras das fotos, não)

	init(scene) {
		if (!this.on || this._scene) return;
		this._scene = scene;
		const C = this.C, size = C.size || 512, R = C.R || 150;
		// direções das 4 fotos: frente (o centro) e o "cima" da foto
		const D = [[0, 0, 1], [1, 0, 0], [0, 0, -1], [-1, 0, 0]];
		this.faces = D.map((f, i) => {
			const cam = new BABYLON.FreeCamera('horizonte_cam' + i, new BABYLON.Vector3(0, 0, 0), scene);
			cam.fov = Math.PI / 2; cam.minZ = R * 0.97; cam.maxZ = C.deep || 1600; cam.layerMask = 0x0FFFFFFF;
			cam.fovMode = BABYLON.Camera.FOVMODE_VERTICAL_FIXED;
			const rtt = new BABYLON.RenderTargetTexture('horizonte_foto' + i, size, scene, false, true);
			rtt.activeCamera = cam;
			rtt.renderList = null;                                              // (tudo o que a câmera da foto vê…)
			rtt.renderListPredicate = (m) => !m._horizon && !m._char3d && m.isEnabled() && m.isVisible;      // (…menos o próprio cubo e os bonecos)
			rtt.clearColor = new BABYLON.Color4(0, 0, 0, 0);
			rtt.refreshRate = BABYLON.RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
			rtt.wrapU = rtt.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
			scene.customRenderTargets.push(rtt);
			return { f, cam, rtt, done: false };
		});
		this._cube();
		this.center = new BABYLON.Vector3(1e9, 0, 1e9);
		this._t = 0; this._next = 0;
	},

	// O cubo: 4 paredes a Rs m do centro das fotos, cada uma com a foto da sua direção (a mesma projeção: o que estava atrás do corte
	// aparece exatamente onde a câmera o veria).
	_cube() {
		const sc = this._scene, Rs = (this.C.R || 150) + 4;
		this.root = new BABYLON.TransformNode('horizonte', sc);
		for (const F of this.faces) {
			const f = F.f, r = [f[2], 0, -f[0]];                                  // (direita da foto, olhando na direção f — mão esquerda)
			const P = (sx, sy) => [Rs * (f[0] + r[0] * sx), Rs * sy, Rs * (f[2] + r[2] * sx)];
			const m = new BABYLON.Mesh('horizonte_parede', sc), vd = new BABYLON.VertexData();
			vd.positions = [...P(-1, -1), ...P(1, -1), ...P(1, 1), ...P(-1, 1)];
			vd.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
			vd.indices = [0, 2, 1, 0, 3, 2];
			vd.normals = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
			vd.applyToMesh(m);
			const mat = new BABYLON.StandardMaterial('horizonte_mat', sc);
			mat.diffuseTexture = F.rtt; mat.emissiveTexture = F.rtt; mat.diffuseTexture.hasAlpha = true; mat.useAlphaFromDiffuseTexture = true;
			mat.disableLighting = true; mat.emissiveColor = BABYLON.Color3.White(); mat.backFaceCulling = false; mat.fogEnabled = false; mat.disableDepthWrite = true;
			m.material = mat; m.parent = this.root; m.isPickable = false; m._horizon = true; m.alwaysSelectAsActiveMesh = true;
			m.alphaIndex = -1e6;                                                  // (o mais distante: desenhado antes dos outros transparentes)
			F.mesh = m;
		}
		this.root.setEnabled(false);
	},

	// A cada quadro (Game): liga/desliga conforme a câmera, refaz as fotos quando precisa (uma por quadro) e põe o cubo no lugar delas.
	tick(dt, camera) {
		if (!this._scene) return;
		const sc = this._scene, cam = sc.activeCamera, want = !!(cam && camera && camera.persp && camera.chase >= 0.5 && !camera.flat && !(typeof Interiors !== 'undefined' && Interiors.active));
		if (!want) { if (this.active) this._set(false, camera); return; }
		const eye = cam.globalPosition || cam.position, C = this.C;
		this._t += dt;
		const far = Math.hypot(eye.x - this.center.x, eye.z - this.center.z) > (C.move || 35) || Math.abs(eye.y - this.center.y) > 20;
		if (far || this._t > (C.refresh || 20)) {                                  // (novo centro: as 4 fotos de novo, uma por quadro)
			this._t = 0; this._pend = [0, 1, 2, 3]; this._eye = eye.clone();
			// (as fotos antigas seguem à mostra enquanto as novas são tiradas: o cubo só muda de lugar quando a 4ª fica pronta)
			if (far) { this.center.copyFrom(eye); this._eyeC = null; }
			else this._eyeC = this.center.clone();
		}
		if (this._pend && this._pend.length) {
			const F = this.faces[this._pend.shift()], at = far || !this._eyeC ? this.center : this._eyeC;
			F.cam.position.copyFrom(at);
			F.cam.setTarget(new BABYLON.Vector3(at.x + F.f[0], at.y, at.z + F.f[2]));
			F.rtt.resetRefreshCounter();
			F.pending = true;
			F.rtt.onAfterRenderObservable.addOnce(() => { F.done = true; F.pending = false; if (this.faces.every((q) => q.done)) this._place(at); });
		}
		const ready = this.faces.every((q) => q.done);
		if (ready !== this.active) this._set(ready, camera);
	},
	_place(at) { this.root.position.copyFrom(at); },
	// Liga: a câmera corta em R e a névoa vira bruma (CompassCamera._applyMode / _applyFog leem `active`). Desliga: tudo como antes.
	_set(on, camera) {
		this.active = on;
		this.root.setEnabled(on);
		if (!on) for (const F of this.faces) F.done = false;
		if (camera && camera._applyFov) camera._applyFov();
	},
};
