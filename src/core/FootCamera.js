// ============================================================================
// FootCamera — a câmera A PÉ, de terceira pessoa (como GTA San Andreas e Zelda), independente da câmera de dirigir (CompassCamera
// cuida do veículo):
//   • ÓRBITA em volta do personagem: o GIRO (yaw) e a ALTURA DO OLHAR (pitch, graus acima do horizonte) pelo mouse arrastando (botão
//     direito — o do meio com arma de fogo na mão), pelo analógico direito (↔ gira, ↕ sobe/desce o olhar) e pelos dois dedos torcidos;
//   • o movimento é RELATIVO À CÂMERA (Config.camera.worldMove = false): cima no analógico = para onde a câmera olha;
//   • SEGUE DEVAGAR: andando, depois de followDelay s sem o jogador mexer na câmera, ela vai aos poucos para as COSTAS do personagem —
//     mais depressa quanto mais rápido ele anda; correndo em direção à câmera ela não dá meia-volta (como no GTA SA);
//   • ao descer de um veículo (reset) ela começa atrás do personagem; nos interiores a CompassCamera segura a câmera de cima.
// Config.camera.foot3p (padrão: ligado). CompassCamera.follow lê `yaw` e o tiltDeg dela usa `pitch` na perseguição a pé.
// ============================================================================

const FootCamera = {
	yaw: 0,                 // rumo da câmera (rad; 0 = olhando para o norte)
	pitch: null,            // altura do olhar (graus acima do horizonte); null = a padrão (Config.camera.foot3p.pitch)
	idle: 9,                // s desde a última mexida do jogador na câmera
	get C() { return Config.camera.foot3p || {}; },
	get on() { return !!Config.camera.foot3p && Config.camera.foot3p.on !== false; },
	get pitchDeg() { const C = this.C; return this.pitch === null ? C.pitch : this.pitch; },
	_wrap(a) { a %= Math.PI * 2; return a > Math.PI ? a - Math.PI * 2 : (a < -Math.PI ? a + Math.PI * 2 : a); },

	// Começa atrás do personagem (heading = para onde ele olha), com o olhar na altura padrão.
	// pitchFrom (graus): a altura do olhar de agora (a da câmera do carro) — passa aos poucos para a padrão (_ease).
	reset(heading, pitchFrom = null) {
		this.yaw = this._wrap(heading || 0); this.idle = 9;
		const C = this.C;
		if (pitchFrom != null && C.pitchMin != null) { this.pitch = Math.max(C.pitchMin, Math.min(C.pitchMax, pitchFrom)); this._ease = true; }
		else { this.pitch = null; this._ease = false; }
	},
	// O jogador gira a câmera (rad; + = para a direita).
	turn(d) { if (d) { this.yaw = this._wrap(this.yaw + d); this.idle = 0; } },
	// O jogador sobe/desce o olhar (graus; + = mais de cima).
	tilt(d) {
		if (!d) return;
		const C = this.C;
		this.pitch = Math.max(C.pitchMin, Math.min(C.pitchMax, this.pitchDeg + d));
		this.idle = 0; this._ease = false;
	},
	// A cada quadro (CompassCamera.follow, a pé): o seguir devagar. held = o jogador ainda segura o giro (mouse, dedo, analógico).
	update(dt, walker, held) {
		const C = this.C;
		this.idle = held ? 0 : this.idle + dt;
		if (this._ease && this.pitch !== null) {                                       // (desceu do carro: o olhar volta à altura padrão)
			this.pitch += (C.pitch - this.pitch) * (1 - Math.exp(-2.5 * dt));
			if (Math.abs(this.pitch - C.pitch) < 0.2) { this.pitch = null; this._ease = false; }
		}
		if (!walker || this.idle < C.followDelay) return;
		const v = walker.velocity, sp = v ? Math.hypot(v.x, v.z) : 0;
		if (sp < C.followMinSpeed) return;
		const head = walker.root ? walker.root.rotation.y : Math.atan2(v.x, v.z), off = this._wrap(head - this.yaw);
		const back = Math.abs(off) > C.noFlip ? 0 : 1;                           // (vindo na direção da câmera: não dá meia-volta)
		const k = C.followRate * Math.min(1, sp / C.followSpeed) * back;
		this.yaw = this._wrap(this.yaw + off * (1 - Math.exp(-k * dt)));
	},
};
