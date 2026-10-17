// ============================================================================
// CompassCamera — câmera "bússola": quase vertical, norte SEMPRE pra cima,
// SEMPRE centrada no alvo (jogador ou carro), com perspectiva leve.
//
// Por que o personagem nunca fica escondido: o ponto de fuga da perspectiva
// está exatamente em cima do alvo, então o topo de cada prédio é projetado
// PARA FORA do centro — nunca por cima de quem está no centro. Os prédios
// mostram só um pouco das laterais (sensação de cidade 3D) sem esconder nada
// que esteja mais perto do centro do que eles.
//
// Altura fixa + FOV variável: o zoom muda o FOV, então a "força" da perspectiva
// (inclinação dos prédios por unidade de mundo) não muda ao dar zoom.
//
// DIRIGINDO (Config.camera.carCompass): a câmera gira como uma bússola, em passos de 90° — só quando o veículo vira uma esquina ou
// faz o retorno (Config.camera.carTurnTrigger), nunca a cada desvio — para a frente dele ficar para cima, e se adianta
// na direção dele, deixando o carro mais ao sul da tela (vê-se mais do que vem pela frente). A pé, volta suavemente ao norte.
// O giro atual fica em CompassCamera.yaw (rad, 0 = norte em cima, +X = leste): os personagens 2,5D (SpriteActor), a ordem de
// desenho deles (NpcArt) e o minimapa acompanham.
//
// ZOOM AUTOMÁTICO (setAutoZoom, Config.camera.footZoom/carZoom/speedZoom): a pé a câmera se aproxima; no veículo ela se afasta
// proporcionalmente à velocidade (vê-se mais longe quando se anda rápido). Multiplica o zoom escolhido pelo jogador, sem passar de maxView.
//
// BALANÇO ao dirigir (_bounce, Config.camera.bounce; desliga em Ajustes): a câmera vai presa ao veículo por uma MOLA — arrancando ela
// fica para trás, freando passa à frente, nas curvas é jogada para fora e inclina um pouco junto, e quando a força some passa do ponto
// e assenta. Em velocidade o asfalto ainda dá trancos (o zoom pulsa de leve) e trepida. Batida forte = solavanco (somado ao tremor).
// ============================================================================

class CompassCamera {
	constructor(scene, engine, targetPos) {
		this.scene = scene;
		this.engine = engine;
		this.viewHalf = Config.camera.viewHalf;
		this.target = targetPos.clone();
		this.yaw = 0;              // giro da bússola (rad; 0 = norte em cima)
		this.lead = 0;             // adianto na direção do veículo (fração de `view`)
		this.autoMul = 1;          // zoom automático (a pé aproxima, veículo rápido afasta): ver setAutoZoom
		this.bounceMul = 1;        // pulso do zoom pelos trancos do asfalto (balanço ao dirigir)
		this.roll = 0;             // inclinação (rad) somada ao giro nas curvas (balanço ao dirigir)
		this._bs = { x: 0, z: 0, vx: 0, vz: 0, ax: 0, az: 0, pvx: 0, pvz: 0, ph: 0, h: 0, vh: 0, r: 0, vr: 0, yr: 0, bumpT: 0, t: 0, veh: null };
		CompassCamera.yaw = 0;

		const c = Config.camera;
		this.camera = new BABYLON.FreeCamera('compassCamera',
			new BABYLON.Vector3(this.target.x, c.height, this.target.z), scene);

		// Olhando reto pra baixo. O "cima" da tela é o norte (+Z) — daí o upVector,
		// senão o lookAt degenera (olhar paralelo ao up padrão).
		this.camera.upVector = new BABYLON.Vector3(0, 0, 1);
		this.camera.rotation = new BABYLON.Vector3(Math.PI / 2, 0, 0);
		this.camera.minZ = 20;
		this.camera.maxZ = 400;
		this.camera.inputs.clear();            // câmera TRAVADA: nenhum input mexe nela.

		scene.activeCamera = this.camera;
		this._applyFov();
	}

	// FOV vertical que enquadra `viewHalf` unidades acima/abaixo do alvo no chão.
	_applyFov() {
		this.camera.fov = 2 * Math.atan(this.view / Config.camera.height);
	}

	// Metade da altura visível de fato: o zoom do jogador × o de interiores (HouseView: 1 fora, 0,5 dentro da casa) × o automático
	// (a pé / velocidade do veículo). Nunca além de maxView: a bolha acordada do trânsito (Zones) é medida por ela.
	get view() { return Math.min(Config.camera.maxView, this.viewHalf * (this.zoomMul || 1) * (this.autoMul || 1)) * this.bounceMul; }

	// Zoom automático: aproxima-se suavemente de `goal` (multiplicador; < 1 aproxima, > 1 afasta). Afastar é um pouco mais rápido
	// que aproximar — ao acelerar a visão abre logo; ao frear ela fecha sem "respirar" a cada toque no freio.
	setAutoZoom(goal, dt, snap = false) {
		const C = Config.camera, k = goal > this.autoMul ? C.zoomOutLerp : C.zoomInLerp;
		const m = snap ? goal : this.autoMul + (goal - this.autoMul) * (1 - Math.exp(-k * dt));
		if (Math.abs(m - this.autoMul) < 1e-5) return;
		this.autoMul = m;
		this._applyFov();
	}

	// Alvo do zoom automático: a pé = footZoom; no veículo = carZoom + speedZoom × (velocidade / speedRef), até o máximo.
	static autoZoomGoal(speed = null) {
		const C = Config.camera;
		if (speed === null) return C.footZoom;
		return C.carZoom + C.speedZoom * Math.min(1, Math.max(0, speed) / C.speedRef);
	}

	setZoomMul(m) {
		if (m === this.zoomMul) return;
		this.zoomMul = m;
		this._applyFov();
	}

	// Acompanha o alvo (suavização independente de framerate; alta = colada). `vehicle`: dirigindo — modo bússola (ver o topo).
	follow(targetPos, dt, vehicle = null) {
		const C = Config.camera;
		const wrap = (a) => { a %= Math.PI * 2; return a > Math.PI ? a - Math.PI * 2 : (a < -Math.PI ? a + Math.PI * 2 : a); };
		let goalYaw = 0, goalLead = 0;
		if (vehicle && C.carCompass) {
			const f = vehicle.fwdToRef(this._f || (this._f = new BABYLON.Vector3()));
			const h = f.x * f.x + f.z * f.z > 1e-4 ? Math.atan2(f.x, f.z) : null;
			// A câmera NÃO segue cada desvio: guarda uma direção (_carYaw) e só gira em passos de 90° quando o carro se afasta dela
			// mais que carTurnTrigger (virou uma esquina, fez o retorno). Ao entrar no carro, parte da direção dele.
			if (this._carVeh !== vehicle) { this._carVeh = vehicle; this._carYaw = h != null ? h : this.yaw; }
			else if (h != null) {
				const off = wrap(h - this._carYaw);
				if (Math.abs(off) > C.carTurnTrigger) this._carYaw = wrap(this._carYaw + Math.round(off / (Math.PI / 2)) * (Math.PI / 2));
			}
			goalYaw = this._carYaw;
			goalLead = C.carLead;
		} else this._carVeh = null;
		const d = wrap(goalYaw - this.yaw);
		this.yaw += d * (1 - Math.exp(-C.yawLerp * dt));
		if (Math.abs(this.yaw) < 1e-4 && !vehicle) this.yaw = 0;
		this.lead += (goalLead - this.lead) * (1 - Math.exp(-C.leadLerp * dt));
		const bo = this._bounce(vehicle, dt);
		CompassCamera.yaw = this.yaw + this.roll;
		const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), L = this.lead * this.view;      // (adianto em fração da meia-altura)
		this.camera.upVector.set(Math.sin(this.yaw + this.roll), 0, Math.cos(this.yaw + this.roll));
		const t = 1 - Math.exp(-C.followLerp * dt);
		this.target.x += (targetPos.x + sy * L - this.target.x) * t;
		this.target.z += (targetPos.z + cy * L - this.target.z) * t;
		// Tremor (batidas e explosões): desloca só a câmera, não o foco, e some rápido.
		let sx = 0, sz = 0;
		if (this._shake > 0.01) {
			sx = (Math.random() - 0.5) * this._shake; sz = (Math.random() - 0.5) * this._shake;
			this._shake *= Math.exp(-7 * dt);
		} else this._shake = 0;
		this.camera.position.x = this.target.x + sx + bo.x;
		this.camera.position.z = this.target.z + sz + bo.z;
	}

	// Balanço ao dirigir (ver o topo). Molas pouco amortecidas, independentes de FPS (passo limitado). Devolve o deslocamento da câmera
	// {x, z} (u) e atualiza bounceMul (pulso do zoom) e roll (inclinação). Sem veículo — ou desligado em Ajustes — tudo volta a zero.
	_bounce(vehicle, dt) {
		const B = Config.camera.bounce, S = this._bs, out = this._bo || (this._bo = { x: 0, z: 0 });
		const on = !!(vehicle && B && CompassCamera.bounceOn && dt > 0);
		let tx = 0, tz = 0, tr = 0;
		if (on) {
			const v = vehicle.velocity, f = vehicle.fwdToRef(this._bf || (this._bf = new BABYLON.Vector3())), hd = Math.atan2(f.x, f.z);
			if (S.veh === vehicle) {
				// aceleração (do chão) medida quadro a quadro, com teto: batida forte vira um solavanco, não um arremesso da câmera
				let ax = (v.x - S.pvx) / dt, az = (v.z - S.pvz) / dt;
				const al = Math.sqrt(ax * ax + az * az);
				if (al > B.maxAcc) { ax *= B.maxAcc / al; az *= B.maxAcc / al; }
				const k = 1 - Math.exp(-B.accLerp * dt);
				S.ax += (ax - S.ax) * k; S.az += (az - S.az) * k;
				let dh = hd - S.ph; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
				S.yr += (dh / dt - S.yr) * k;
			} else { S.veh = vehicle; S.ax = S.az = S.yr = 0; }
			S.pvx = v.x; S.pvz = v.z; S.ph = hd;
			tx = -S.ax * B.lag; tz = -S.az * B.lag;                                    // inércia: a câmera "fica para trás" da aceleração
			tr = Math.max(-B.rollMax, Math.min(B.rollMax, S.yr * B.roll));             // inclina junto com a curva
			const sp = Math.sqrt(v.x * v.x + v.z * v.z), fr = Math.min(1, sp / B.rumbleRef);
			S.bumpT -= dt * fr;                                                        // trancos do asfalto: mais frequentes quanto mais rápido
			if (S.bumpT <= 0) { S.bumpT = 0.5 + Math.random() * 1.4; if (sp > 4) S.vh += (0.4 + 0.6 * Math.random()) * B.bump * fr * (Math.random() < 0.5 ? -1 : 1); }
			S.t += dt;
		} else S.veh = null;
		const h = Math.min(dt, 1 / 30);
		S.vx += (B.stiff * (tx - S.x) - B.damp * S.vx) * h; S.x += S.vx * h;
		S.vz += (B.stiff * (tz - S.z) - B.damp * S.vz) * h; S.z += S.vz * h;
		S.vr += (B.stiff * (tr - S.r) - B.damp * S.vr) * h; S.r += S.vr * h;
		S.vh += (-B.hStiff * S.h - B.hDamp * S.vh) * h; S.h += S.vh * h;
		let jx = 0, jz = 0;
		if (on) {                                                                      // trepidação: senoides somadas (não um ruído por quadro)
			const v = vehicle.velocity, a = B.rumble * Math.min(1, Math.sqrt(v.x * v.x + v.z * v.z) / B.rumbleRef), t = S.t;
			jx = a * (Math.sin(t * 31.7) + 0.6 * Math.sin(t * 53.1 + 1.3)); jz = a * (Math.sin(t * 27.3 + 0.7) + 0.6 * Math.sin(t * 47.9 + 2.1));
		}
		const quiet = !on && Math.abs(S.x) + Math.abs(S.z) + Math.abs(S.r) + Math.abs(S.h) < 1e-4 && Math.abs(S.vx) + Math.abs(S.vz) + Math.abs(S.vr) + Math.abs(S.vh) < 1e-4;
		if (quiet) { S.x = S.z = S.r = S.h = S.vx = S.vz = S.vr = S.vh = 0; }
		this.roll = S.r;
		const bm = 1 + S.h;
		if (bm !== this.bounceMul) { this.bounceMul = bm; this._applyFov(); }
		out.x = S.x + jx; out.z = S.z + jz;
		return out;
	}

	// Ponto do chão (x, z) → posição na tela (0..1, y para baixo), sem a perspectiva (boa o bastante perto do centro).
	screenUV(x, z, aspect) {
		const dx = x - this.target.x, dz = z - this.target.z, s = Math.sin(this.yaw + this.roll), c = Math.cos(this.yaw + this.roll);
		const u = dx * c - dz * s, v = dx * s + dz * c, V = this.view;
		return { u: 0.5 + u / (2 * V * aspect), v: 0.5 - v / (2 * V) };
	}

	// Balança a câmera (unidades de mundo; ~0,3 = batida, ~1,2 = explosão perto). Soma com o tremor atual.
	shake(mag) {
		this._shake = Math.min(1.6, (this._shake || 0) + mag);
	}

	// Teleporta o foco (spawn, prisão): sem deslizar pelo mapa.
	snapTo(pos) {
		this.target.x = pos.x;
		this.target.z = pos.z;
		this.camera.position.x = pos.x;
		this.camera.position.z = pos.z;
	}

	// delta > 0 afasta (zoom out) | delta < 0 aproxima (zoom in).
	zoom(delta) {
		this._userZoomed = true;
		this.viewHalf = BABYLON.Scalar.Clamp(this.viewHalf + delta, Config.camera.minView, Config.camera.maxView);
		this._applyFov();
	}

	// Zoom "pixel-perfect": 1 texel da arte (Config.art.ppu por unidade) = 1 pixel interno.
	// Só vale enquanto o jogador não mexeu no zoom.
	fitPixelScale(renderHeight) {
		if (this._userZoomed) return;
		this.viewHalf = BABYLON.Scalar.Clamp(renderHeight / (2 * Config.art.ppu), Config.camera.minView, Config.camera.maxView);
		this._applyFov();
	}

	// Base de movimento alinhada à TELA: "cima" = norte girado pelo yaw (a pé o yaw volta a 0 — norte fixo).
	getGroundBasis() {
		const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
		return {
			forward: new BABYLON.Vector3(s, 0, c),
			right: new BABYLON.Vector3(c, 0, -s),
		};
	}

	onResize() {
		this._applyFov();
	}
}

CompassCamera.yaw = 0;      // giro atual da bússola (rad): lido pelos sprites 2,5D, pela ordem de desenho e pelo minimapa
CompassCamera.bounceOn = true;      // balanço da câmera ao dirigir (Ajustes › Balanço da câmera: PauseMenu.applySettings)
