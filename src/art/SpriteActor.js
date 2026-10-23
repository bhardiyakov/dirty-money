// ============================================================================
// SpriteActor — um personagem 2D: um quad achatado no chão (visto de cima)
// que mostra o frame certo do clipe atual na direção certa.
//   play(clipe, arma)   troca o clipe (sem reiniciar se já está tocando)
//   setHeading(rad)     escolhe a coluna de direção (0 = norte, +X = leste)
//   update(dt, rate)    avança a animação (rate = multiplicador de velocidade; negativo = ao contrário, em clipe com loop)
//   phase / setPhase(u) fase do clipe (0..1: no loop, a posição no ciclo; sem loop, quanto já tocou) — lida/posta sem contar quadros
//   setLean(v)          inclinação pilotando (ride_moto/ride_jetski): v = +1 → 1º quadro (+12°), 0 → o do meio, −1 → o último; contínuo
// O quad fica em y=0.5, acima de calçada (0,18) e rua (0,02): sem z-fighting.
// 2,5D (NpcArt): a textura de cada direção mora numa PÁGINA do atlas, carregada sob demanda — enquanto a página não chega, o ator
// mantém o último quadro desenhado (ou a direção vizinha já pronta); ator novo, sem nada desenhado ainda, fica escondido.
//
// Dois tipos de clipe:
//   • folha de direções (barcos, helicóptero, e o que não estiver no atlas): colunas = direções; o quad não gira;
//   • VETORIAL (personagens do atlas, CharArt: clip.vector): um quadro por pose, olhando para a frente — o quad GIRA no ângulo
//     exato, tem o tamanho do quadro (+ folga da sombra) e o shader desenha a sombra no chão. setOverlay põe uma camada por cima
//     (a bolsa do jogador), com os mesmos quadros.
// ============================================================================

class SpriteActor {
	constructor(scene, sheet, variant, name) {
		this.scene = scene;
		this._seedName = name;
		this.npcRow = 0;           // linha da paleta dos personagens 2,5D (NpcArt); `variant` = a da paleta antiga
		this.variant = variant;
		sheet = this._adopt(sheet, variant);
		this.sheet = sheet;
		variant = this.variant;
		this.clip = null;
		this.frame = 0;
		this.time = 0;
		this.dir = 0;
		this.heading = 0;
		this.done = false;       // clipe não-loop chegou ao fim.
		this.overlay = null;     // camada vetorial por cima (bolsa): nome do tipo ('cross'|'pack'|'tactical') ou null

		const ppu = Config.art.ppu;
		const h = this._half = sheet.frame / ppu / 2;     // meio lado do quad em unidades de mundo.

		this.mesh = new BABYLON.Mesh(name, scene);
		const vd = new BABYLON.VertexData();
		vd.positions = [-h, 0, h, h, 0, h, -h, 0, -h, h, 0, -h];   // TL, TR, BL, BR (norte em cima)
		vd.indices = [3, 1, 0, 2, 3, 0];
		vd.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
		vd.uvs = [0, 0, 1, 0, 0, 1, 1, 1];
		// Cor do vértice = (variante de paleta, sombreamento, sombra no chão u, v): lido pelo shader.
		this._colors = new Float32Array([variant, 1, 0, 1, variant, 1, 0, 1, variant, 1, 0, 1, variant, 1, 0, 1]);
		vd.colors = Array.from(this._colors);
		vd.applyToMesh(this.mesh, true);                            // UVs e cores atualizáveis.
		this._fr = new Float32Array(16);                           // retângulo do quadro no atlas (só o shader vetorial lê)
		this.mesh.setVerticesData('fr', this._fr, true, 4);
		this._fr2 = new Float32Array(16);                          // próximo quadro + peso da mistura (personagens 2,5D: _blendNext)
		this.mesh.setVerticesData('fr2', this._fr2, true, 4);
		this._pos = new Float32Array(12);
		this.shade = 1;                // 1 = ao sol, ~0,66 = na sombra de um prédio.
		this._shadeTimer = Math.random() * 0.3;
		this.mesh.position.y = 0.5;
		this.mesh.isPickable = false;
		this.mesh.isVisible = false;   // só aparece quando recebe a 1ª posição (senão nasce na origem (0,0) e "pisca" lá por um quadro)
		// Culling por frustum (antes ficava sempre ativo: TODO pedestre e carro do mundo era desenhado, mesmo fora da tela). O quad tem
		// tamanho fixo, então a caixa envolvente é trivial; a esfera basta (mais barata) e uma folga cobre o sprite alto.
		this.mesh.cullingStrategy = BABYLON.AbstractMesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;
		this._setBounds(h);

		this._uv = new Float32Array(8);
		SpriteActor.live.add(this);      // registro dos atores vivos (a varredura de 3 s sabe quais clipes estão em uso)
	}

	// Giro da câmera bússola (CompassCamera.yaw): o personagem 2,5D fica "de pé" para cima da TELA, não do norte.
	static viewYaw() { return typeof CompassCamera !== 'undefined' ? CompassCamera.yaw || 0 : 0; }
	// 2.5D camera (CompassCamera.tilted): 2.5D characters STAND UP — a vertical quad turned to the camera (BILLBOARDMODE_Y), stretched by
	// 1/cos(tilt) so the art, rendered at that same angle, shows 1:1 on screen. The top-down camera keeps them lying on the ground.
	static standing() { return typeof CompassCamera !== 'undefined' && !!CompassCamera.tilted; }
	static get STAND_SCALE() { return 1 / Math.cos(((typeof Config !== 'undefined' && Config.camera.tilt) || 56) * Math.PI / 180); }

	// O sprite gira no ângulo exato (clipe vetorial)? (CarLights e quem mais precisar da frente desenhada.)
	get rotates() { return !!(this.clip && this.clip.vector); }

	// Personagem 2,5D (NpcArt): a folha antiga de pedestre/policial (civA, civB, police, swat, army) vira um TIPO novo do pacote de
	// NPCs (escolhido pelo lugar da variante de cor antiga e pelo nome do sprite) — todo o resto do jogo segue pedindo "civA, cor 30".
	// Folha 2,5D passada direto: `variant` é a linha da paleta nova.
	_adopt(sheet, variant) {
		if (sheet && sheet.npcRemap) {
			const r = sheet.npcRemap(variant, this._seedName);
			if (r) { this._legacySheet = sheet; this.variant = variant; this.npcRow = r.row; this.npcType = r.type; return r.sheet; }
		}
		this._legacySheet = null;
		if (sheet && sheet.isNpc) { this.npcRow = variant; this.variant = sheet.legacyVariant; this.npcType = sheet.id; }
		else this.variant = variant;
		return sheet;
	}

	// Linha de paleta que o clipe atual usa (a nova para os 2,5D, a antiga para o resto).
	_syncRow() {
		const v = this.clip && this.clip.npc ? this.npcRow : this.variant;
		if (this._colors[0] === v) return;
		for (let i = 0; i < 16; i += 4) this._colors[i] = v;
		this.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, this._colors);
	}

	// Caixa envolvente do quad (lado 2h) com um pouco de altura: o frustum descarta o sprite fora da tela. Já posta no mundo: a caixa
	// nova só seria levada à posição na próxima vez que a matriz mudasse — quem fica PARADO (atendente, freguês sentado) ficava com a
	// caixa na origem e o frustum o descartava (sumia da tela).
	_setBounds(h) {
		const bi = new BABYLON.BoundingInfo(new BABYLON.Vector3(-h, -1, -h), new BABYLON.Vector3(h, 3, h));
		bi.update(this.mesh.computeWorldMatrix(true));
		this.mesh.setBoundingInfo(bi);
	}

	// Fixa o frame do clipe (animação dirigida por código). O update() volta a avançar daqui. (Prefira setPhase/setLean: o número de
	// quadros dos clipes muda com o atlas.)
	setFrame(f) {
		if (!this.clip) return;
		f = Math.max(0, Math.min(this.clip.frames - 1, f | 0));
		this.time = f;
		this._lean = null;
		if (f !== this.frame) { this.frame = f; this._applyUV(); }
		if (this.clip.npc) this._blendNext(this.clip);                    // (no início do quadro a mistura é 0: nada do clipe anterior sobra em fr2)
	}

	// Fase do clipe: em loop, a posição no ciclo (0..1); sem loop, quanto já tocou (1 = no fim).
	get phase() {
		const c = this.clip;
		if (!c || !c.frames) return 0;
		if (c.loop) { const n = c.frames; return (((this.time % n) + n) % n) / n; }
		return Math.max(0, Math.min(1, this.time / c.frames));
	}
	// Põe o clipe na fase u (como `phase`): quadro e mistura com o próximo recalculados na hora (sem esperar o update).
	setPhase(u) {
		const c = this.clip;
		if (!c) return;
		const n = c.frames;
		u = +u || 0;
		this.time = (c.loop ? u - Math.floor(u) : Math.max(0, Math.min(1, u))) * n;
		this.done = !c.loop && this.time >= n;
		this._lean = null;
		const f = c.loop ? Math.floor(this.time) % n : Math.min(Math.floor(this.time), n - 1);
		if (f !== this.frame) { this.frame = f; this._applyUV(); }
		if (c.npc) this._blendNext(c);
	}
	// Inclinação pilotando: os quadros de ride_moto/ride_jetski são passos de inclinação (+12°, +6°, 0, −6°, −12°; fps 0). v = +1 → o 1º,
	// 0 → o do meio, −1 → o último, contínuo (com o gráfico suave, mistura os dois passos vizinhos). O update não mexe mais no quadro.
	setLean(v) {
		const c = this.clip;
		if (!c) return;
		const n = c.frames, p = ((1 - Math.max(-1, Math.min(1, +v || 0))) / 2) * (n - 1);
		this._lean = c;
		this.time = p; this.done = false;
		const smooth = c.npc && typeof Smooth !== 'undefined' && Smooth.on;
		const f = Math.min(n - 1, smooth ? Math.floor(p) : Math.round(p));
		if (f !== this.frame) { this.frame = f; this._applyUV(); }
		if (c.npc) this._blendNext(c);
	}

	// Inclinação do chão na direção em que anda (MapGeo.slopeAlong; 0 = plano/parado). Quem move o personagem informa todo quadro;
	// aí 'walk'/'run' viram, se o tipo tiver o clipe (2,5D, sem arma na mão): subida (> 0,15) = 'walk_up' (inclinado, passo curto) e
	// encosta íngreme (> 0,6) = 'climb' (escalando com as mãos) — e o ritmo é corrigido pela passada mais curta (_rateK).
	setSlope(g) { this._slope = g || 0; this._slopeFresh = true; }
	static get CLIMB() { return { up: 0.15, steep: 0.6, upStride: 0.77, climbStride: 0.46 }; }      // (passadas × a do andar: o pé plantado dos clipes, medido)
	// Clipes de passada (loop): trocar de um para outro (andar → correr, sacar a arma andando, subida…) mantém a FASE do ciclo — o pé
	// que está no chão continua no chão, em vez de o passo recomeçar do zero.
	static get GAIT() { return /^(walk|run|walk_up|climb|scared|sneak|strafe|wade|walk_hold|run_hold|walk_pull|walk_heavy|run_heavy)$/; }

	// Troca de clipe. Retorna false se o clipe não existe para essa arma.
	play(name, weapon = 'none', opts = {}) {
		this._rateK = 1;
		const C = SpriteActor.CLIMB;
		if ((name === 'walk' || name === 'run') && weapon === 'none' && this._slope > C.up) {
			const up = this._slope > C.steep ? 'climb' : (name === 'walk' ? 'walk_up' : null);
			if (up && this.sheet.getClip(up, 'none')) {
				this._rateK = up === 'walk_up' ? 1 / C.upStride : (name === 'run' ? Config.anim.run / (Config.anim.walk * C.climbStride) : 1 / C.climbStride);
				name = up;
			}
		}
		return this._play(name, weapon, opts);
	}
	_play(name, weapon = 'none', { restart = false } = {}) {
		const clip = this.sheet.getClip(name, weapon);
		if (!clip) return false;
		if (this.clip === clip && !restart) return true;
		if (name === 'dead' && clip.npc && (!this.clip || this.clip.name !== 'dead') && typeof Blood !== 'undefined') Blood.deathPool(this);   // poça de sangue (Blood)
		const was = this._mode || 0, mode = clip.vector ? 1 : clip.npc ? 2 : 0, prev = this.clip, G = SpriteActor.GAIT;
		const carry = !restart && prev && prev.loop && clip.loop && G.test(prev.name) && G.test(name) ? this.phase : 0;
		this.clip = clip;
		this.time = carry * clip.frames;
		this.frame = Math.min(clip.frames - 1, Math.floor(this.time));
		this.done = false;
		this._lean = null;
		this._rate = 1;                                                    // (o ritmo do clipe anterior — andando de costas — não inverte a mistura de um clipe dirigido por setPhase/setFrame; o update repõe o dele)
		if (!clip.npc) { this.mesh.material = clip.material; if (this._npcWait) { this._npcWait = false; this._vis(); } }     // (2,5D: o material vem da página — _npcDraw)
		// Personagens (clipe vetorial) são desenhados em Config.art.charScale: o quad encolhe e o shader acompanha (lê a posição local).
		const k = clip.vector ? (Config.art.charScale || 1) : 1;
		this.mesh.scaling.x = this.mesh.scaling.z = k;
		const dirsWas = this._dirs; this._dirs = clip.dirs;
		if (mode !== was) { this._mode = mode; this._modeChanged(); }
		else if (clip.npc && dirsWas !== clip.dirs && this.heading != null) { this.dir = -1; this.setHeading(this.heading); }     // (8 ↔ 16 direções)
		if (clip.vector) { this._setQuad(this.mesh, clip.pk.box); this._ovClip = null; }
		this._syncRow();
		if (clip.npc) NpcArt.wantClip(clip);                                // (as páginas do clipe para a fila; a da direção atual, já)
		this._applyUV();
		return true;
	}

	get clipName() { return this.clip ? this.clip.name : ''; }

	// Procura o clipe atual de novo na folha (o atlas mudou: visual novo do jogador, dano pintado pronto, atlas descartado…) e segue
	// na mesma FASE (o clipe novo pode ter outro número de quadros) — ou na mesma inclinação (setLean). false = a folha não tem o clipe.
	replay() {
		const c = this.clip;
		if (!c) return false;
		const ph = this.phase, done = this.done, lean = this._lean === c && c.frames > 1 ? 1 - (2 * this.time) / (c.frames - 1) : null;
		if (!this.play(c.name, c.weapon, { restart: true })) return false;     // (com o clipe antigo ainda em this.clip: nada de nova poça de sangue)
		this.frame = -1;
		if (lean !== null) this.setLean(lean);
		else { this.setPhase(ph); this.done = done; }
		return true;
	}

	// Troca a folha de sprites (ex.: carro que amassou) mantendo posição e direção. Folha ainda não assada = ignora.
	setSheet(sheet) {
		if (!sheet.getClip()) return false;
		this.sheet = sheet;
		this.clip = null;
		return this.play('static', 'none', { restart: true });
	}

	// Troca a folha de PERSONAGEM (clipes por nome) — inclusive de tamanho de quadro diferente (ex.: o jogador sobe
	// numa moto e passa a usar a folha de 80 px). O quad é redimensionado; o próximo play() pega o clipe da nova folha.
	useSheet(sheet) {
		const keepRow = sheet && sheet.isNpc && !sheet.npcRemap ? this.npcRow : null, was = this.npcType;
		sheet = sheet && sheet.npcRemap ? this._adopt(sheet, this.variant) : sheet;
		if (keepRow !== null) this.npcRow = keepRow;                   // (o jogador volta da moto para a própria folha 2,5D)
		this.sheet = sheet;
		this.clip = null;
		this._npcBox = null;
		const h = this._half = sheet.frame / Config.art.ppu / 2;
		this.mesh.rotation.y = 0; this._yaw = null;
		// outra PESSOA (pedestre reciclado, NPC vestido de assaltante): não segura o desenho da anterior — some até a página nova chegar
		if (this._pg && keepRow === null && sheet && sheet.isNpc && this.npcType !== was) { this._pg = null; this._drawClip = null; if (!this._npcWait) { this._npcWait = true; this._vis(); } }
		if (this._pg) return;                                              // (2,5D já desenhado: segura o quadro e a caixa até a página nova chegar)
		this.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, [-h, 0, h, h, 0, h, -h, 0, -h, h, 0, -h]);
		this._setBounds(h);
	}

	// Troca a variante da paleta (ex.: pintura → carcaça carbonizada). Pedestre 2,5D: outra variante = outra pessoa do mesmo lugar.
	setVariant(v) {
		this.clearWounds();                                                // outra pessoa: sem os ferimentos da anterior
		if (this._legacySheet) {
			const sheet = this._adopt(this._legacySheet, v);
			if (sheet !== this.sheet) { const name = this.clipName || 'idle', w = this.clip ? this.clip.weapon : 'none'; this.useSheet(sheet); this.play(name, w, { restart: true }); }
			this._syncRow();
			return;
		}
		this.variant = v;
		this._syncRow();
		if (this._ov) this._ovColors(this._ov);
	}

	setHeading(rad) {
		this.heading = rad;
		if (this.rotates) { this._rotate(); return; }
		const npc = !!(this.clip && this.clip.npc), D = npc ? this.clip.dirs || 8 : this.sheet.dirs;      // (2,5D: 16 direções; atlas antigos, 8)
		if (npc) rad -= this._yaw || 0;                                    // 2,5D: a direção desenhada é relativa à tela (câmera bússola)
		// perfil leve (NpcArt.dirs = 8): clipe de 16 direções só nas pares (as páginas ímpares nem são carregadas)
		const S = npc && D > 8 && NpcArt.lite ? 2 : 1, N = D / S, x = rad / ((Math.PI * 2) / N);
		let d = (((Math.round(x) % N) + N) % N) * S;
		// HISTERESE (2,5D): fica na direção atual enquanto o rumo estiver a até 0,5 + 0,18 passo dela — rumo tremendo na fronteira
		// (multidão, polícia mirando, balanço da câmera) não faz o desenho piscar entre duas direções
		if (npc && this.dir >= 0 && this._dirD === D && d !== this.dir) {
			let e = x - this.dir / S;
			e -= Math.round(e / N) * N;
			if (Math.abs(e) <= 0.68) d = this.dir;
		}
		this._dirD = D;
		if (d !== this.dir) { this.dir = d; this._applyUV(); }
	}

	// Clipe vetorial: gira o quad e recalcula para onde cai a sombra (fixa no mundo: sudeste) nas coordenadas do quadro.
	_rotate() {
		const h = this.heading;
		if (this.mesh.rotation.y === h && this._shH === h) return;
		this.mesh.rotation.y = h;
		this._shH = h;
		const c = Math.cos(h), s = Math.sin(h), [wx, wz] = CharArt.SUN, ppu = CharArt.data.ppu;
		const lx = wx * c - wz * s, lz = wx * s + wz * c;
		const u = Math.round(lx * ppu * 2) / 2, v = Math.round(-lz * ppu * 2) / 2, C = this._colors;     // (meio px: girar devagar não reenvia)
		if (C[2] === u && C[3] === v) return;
		for (let i = 0; i < 16; i += 4) { C[i + 2] = u; C[i + 3] = v; }
		this.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, C);
	}

	// Passou de folha de direções para vetorial (ou o contrário): o quad passa a girar / volta ao quadrado fixo.
	_modeChanged() {
		this._npcBox = null;
		if (typeof NpcArt !== 'undefined') NpcArt.sortMesh(this.mesh, !!(this.clip && this.clip.npc));
		if (this.rotates) {
			this._shH = null;
			const H = CharArt.half(this.sheet.atlasName || this.sheet.name);
			this._setBounds(Math.max(this._half, H));
			this._rotate();
		} else if (this.clip && this.clip.npc) {                           // 2,5D: quad fixo (a caixa vem no play), 8 direções desenhadas
			this._yaw = SpriteActor.viewYaw();
			this._setStanding(SpriteActor.standing());                     // (de pé "para cima da tela": gira junto com a câmera bússola)
			// (b, a guardavam a sombra do vetorial; no 2,5D b = toldo, a = água) — nos 4 vértices: sobrando um valor velho em
			// algum deles, o shader interpola "água no corpo" e o desenho aparece afundado mesmo em terra
			this._cover = -1;
			for (let i = 0; i < 16; i += 4) { this._colors[i + 2] = 0; this._colors[i + 3] = this._wl || 0; }
			this.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, this._colors);
			if (this._ov) this._ov.setEnabled(false);
			this._pg = null; this._drawClip = null;                        // (o que estava na tela era de outro shader: nada 2,5D desenhado ainda)
			this.dir = -1;
			const h = this.heading; this.heading = null; this.setHeading(h || 0);
		} else {
			this._setStanding(false);
			this.mesh.rotation.y = 0;
			const h = this._half;
			this.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, [-h, 0, h, h, 0, h, -h, 0, -h, h, 0, -h]);
			this._setBounds(h);
			if (this._ov) this._ov.setEnabled(false);
			const hd = this.heading; this.dir = -1; this.heading = null; if (this.clip) this.setHeading(hd || 0); else this.heading = hd;
		}
	}

	// Camada vetorial por cima do personagem (bolsa do jogador): 'cross' | 'pack' | 'tactical' | null.
	setOverlay(kind) {
		if (this.overlay === kind) return;
		this.overlay = kind;
		if (kind && !this._ov) {
			const m = this._ov = new BABYLON.Mesh(this.mesh.name + '_camada', this.scene);
			const vd = new BABYLON.VertexData();
			vd.positions = new Float32Array(12); vd.indices = [3, 1, 0, 2, 3, 0]; vd.uvs = new Float32Array(8); vd.colors = new Float32Array(16);
			vd.applyToMesh(m, true);
			m.setVerticesData('fr', new Float32Array(16), true, 4);
			m.parent = this.mesh;
			m.position.y = 0.03;                                     // um pouco mais perto da câmera: desenhado depois do corpo
			m.isPickable = false;
			m.alwaysSelectAsActiveMesh = true;
			this._ovColors(m);
		}
		this._applyUV();
	}
	_ovColors(m) { const c = new Float32Array(16); for (let i = 0; i < 16; i += 4) { c[i] = this.variant; c[i + 1] = this.shade; c[i + 2] = 1e5; c[i + 3] = 1e5; } m.updateVerticesData(BABYLON.VertexBuffer.ColorKind, c); }

	setPosition(x, z) {
		this.mesh.position.x = x;
		this.mesh.position.z = z;
		if (!this._placed) { this._placed = true; this._vis(); }
	}
	// Aparece quando já tem posição e — 2,5D — algo desenhado (a página do clipe chegou).
	_vis() { const v = !!this._placed && !this._npcWait; if (this.mesh.isVisible !== v) this.mesh.isVisible = v; }

	// Escurece o sprite quando está na sombra de um prédio (suave, a ~4 consultas/s).
	_updateShade(dt) {
		this._shadeTimer -= dt;
		if (this._shadeTimer <= 0) {
			this._shadeTimer = 0.25;
			this._shadeTarget = MapGeo.inShadow(this.mesh.position.x, this.mesh.position.z) ? 0.66 : 1;
		}
		if (this._shadeTarget === undefined || Math.abs(this._shadeTarget - this.shade) < 0.004) return;
		this.shade += (this._shadeTarget - this.shade) * Math.min(1, dt * 9);
		for (let i = 1; i < 16; i += 4) this._colors[i] = this.shade;
		this.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, this._colors);
		if (this._ov && this._ov.isEnabled()) this._ovColors(this._ov);
	}

	// 2,5D: pés debaixo de um toldo/cobertura (MapGeo.coverAt) → a altura dele vai na cor do vértice (b) e o shader mantém o desenho
	// inteiro abaixo dela. Sem isso a cabeça (que testa a profundidade "de pé", bem alta) atravessava o toldo e só o corpo sumia.
	_updateCover() {
		const p = this.mesh.position;
		if (this._coverX === p.x && this._coverZ === p.z) return;
		this._coverX = p.x; this._coverZ = p.z;
		const h = MapGeo.coverAt(p.x, p.z);
		if (h === this._cover) return;
		this._cover = h;
		for (let i = 2; i < 16; i += 4) this._colors[i] = h;
		this.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, this._colors);
	}

	// 2,5D, vadeando: altura da água no corpo (m; 0 = seco). Vai na cor do vértice (a) e o shader do NpcArt afunda o que está abaixo
	// dela (tinge, some aos poucos, linha de espuma ondulando). Nadando não precisa: a água já está desenhada no clipe de natação.
	// Vale só no quadro em que é informada (como setSlope): quem não informa (NPC que renasceu, foi arremessado, saiu da água por outro
	// caminho, policial, corpo caído…) volta a seco sozinho em update — nunca fica "dentro d'água" em terra.
	setWaterline(h) {
		this._wl = h > 0.02 ? Math.round(h * 50) / 50 : 0;
		this._wlFresh = true;
		this._applyWaterline();
	}
	_applyWaterline() {
		const h = this._wl || 0;
		if (!(this.clip && this.clip.npc) || this._colors[3] === h) return;
		for (let i = 3; i < 16; i += 4) this._colors[i] = h;
		this.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, this._colors);
	}

	update(dt, rate = 1) {
		let c = this.clip;
		if (!c) return;
		// 2,5D: o atlas do clipe foi trocado ou descartado (NpcArt.genOf: visual novo, dano sem uso que saiu…): o mesmo clipe, na mesma fase
		if (c.npc && c.gen !== NpcArt.genOf(c.atlas)) {
			if (!this.replay()) { this.clip = null; return; }               // (sem o clipe: para até o jogo pedir outro)
			c = this.clip;
		}
		if (c.npc) {                                                       // página do atlas: marca o uso (LRU); saiu da GPU ou ainda não chegou → tenta de novo
			const P = this._pg;
			if (P && P.tex) { if (this.mesh.isEnabled()) P.used = NpcArt.now; }         // (escondido não conta como uso)
			else if (P && !this._wait) { this._wait = P; this._waitT = 0.5; }         // (saiu da GPU: pede de volta já)
			if (this._wait && (this._waitT = (this._waitT || 0) + dt) >= 0.5) { this._waitT = 0; this._applyUV(); }    // (chegando, o NpcArt já avisa: _pageReady)
		}
		this._updateShade(dt);
		if (c.npc) this._updateCover();
		if (c.npc && this._stand !== SpriteActor.standing()) this._setStanding(SpriteActor.standing());      // (entered/left an interior)
		if (c.npc && this._yaw !== SpriteActor.viewYaw()) {                // câmera bússola girou: o quad acompanha e a direção desenhada é refeita
			this._yaw = SpriteActor.viewYaw();
			if (!this._stand) this.mesh.rotation.y = this._yaw;            // (standing, the billboard already faces the camera)
			if (this.heading != null) this.setHeading(this.heading);      // (com a histerese: o balanço da câmera não faz o desenho piscar)
		}
		// água no corpo e inclinação valem só no quadro em que foram informadas (antes deste update): sem aviso, zeram
		if (!this._wlFresh) this._wl = 0;
		this._wlFresh = false;
		if (c.npc) this._applyWaterline();                     // (também acerta a cor na troca de modo — o alfa do vértice nasce em 1)
		if (!this._slopeFresh) this._slope = 0;
		this._slopeFresh = false;
		if (c.vector) this._rotate();
		if (this._lean !== c) {                                            // (inclinação pilotando: quem pilota escolhe o quadro — setLean)
			this.time += dt * c.fps * rate * (this._rateK || 1) * (c.gaitK || 1);     // (gaitK: passada 2,5D pela escala do tipo — NpcArt.scaleOf)
			this._rate = rate;
			let f;
			if (c.loop) f = ((Math.floor(this.time) % c.frames) + c.frames) % c.frames;          // (ritmo negativo: anda para trás no ciclo)
			else { f = Math.min(Math.floor(this.time), c.frames - 1); if (this.time >= c.frames) this.done = true; }
			if (f !== this.frame) { this.frame = f; this._applyUV(); }
		}
		if (c.npc) this._blendNext(c);
	}

	// Mistura de quadros (personagens 2,5D, com o gráfico suave): na segunda metade de cada quadro o PRÓXIMO entra em degradê
	// (atributo fr2: o retângulo dele + o peso), então a pose muda suave em vez do salto seco. Sem o gráfico suave, peso 0. Sempre na
	// direção e na página do que está DESENHADO (esperando a página do clipe: peso 0). Inclinação (setLean): mistura linear contínua.
	_blendNext(c) {
		const n = Math.min(c.frames, c.pk.n), R = this._fr2, P = this._pg;
		let w = 0, f2 = this.frame;
		if (this._drawClip === c && P && P.tex && typeof Smooth !== 'undefined' && Smooth.on && n > 1 && (c.loop || this.frame < n - 1)) {
			if (this._lean === c) {
				// (degraus de inclinação: mistura só no meio do caminho entre dois — perto de um degrau, o desenho dele inteiro; a mistura
				// o tempo todo dava um piloto "fantasma", com dois pares de braços, na curva)
				const k = Math.max(0, Math.min(1, (this.time - Math.floor(this.time) - 0.3) / 0.4));
				w = k * k * (3 - 2 * k); f2 = Math.min(this.frame + 1, n - 1);
			}
			else {
				let t = this.time - Math.floor(this.time);
				if (this._rate < 0) t = 1 - t;                         // (andando para trás no ciclo: o próximo é o anterior)
				const k = Math.max(0, Math.min(1, (t - 0.45) / 0.55));
				w = k * k * (3 - 2 * k);
				f2 = c.loop ? (this.frame + (this._rate < 0 ? n - 1 : 1)) % n : this.frame + 1;
			}
		}
		if (w < 0.004) { if (R[3] !== 0) { for (let k = 3; k < 16; k += 4) R[k] = 0; this.mesh.updateVerticesData('fr2', R); } return; }
		const i = (Math.max(0, this._drawDir) * c.pk.n + Math.min(f2, c.pk.n - 1)) * 3, a = c.pk.fr[i], b = c.pk.fr[i + 1], d = c.pk.fr[i + 2];
		w = Math.round(w * 64) / 64;
		if (R[0] === a && R[1] === b && R[2] === d && R[3] === w) return;
		for (let k = 0; k < 16; k += 4) { R[k] = a; R[k + 1] = b; R[k + 2] = d; R[k + 3] = w; }
		this.mesh.updateVerticesData('fr2', R);
	}

	// Retângulo do frame/direção atual dentro do atlas do clipe.
	_applyUV() {
		const c = this.clip;
		if (!c) return;
		if (c.vector) { this._setFr(this.mesh, c.pk, this.frame, this._fr); this._applyOverlay(); return; }
		if (c.npc) { this._npcDraw(c); return; }
		const F = c.frame;
		const u0 = (this.dir * F) / c.W, u1 = ((this.dir + 1) * F) / c.W;
		const v0 = (this.frame * F) / c.H, v1 = ((this.frame + 1) * F) / c.H;
		const uv = this._uv;
		uv[0] = u0; uv[1] = v0; uv[2] = u1; uv[3] = v0;
		uv[4] = u0; uv[5] = v1; uv[6] = u1; uv[7] = v1;
		this.mesh.updateVerticesData(BABYLON.VertexBuffer.UVKind, uv);
	}

	// 2,5D: desenha o quadro atual se a página da direção já está na GPU; senão a direção vizinha (outra paridade) já pronta; senão
	// mantém o último quadro desenhado (material e fr intactos, mistura 0) — e o ator que ainda não desenhou nada fica escondido. Quem
	// espera fica na lista do NpcArt (_pageReady: tenta de novo quando uma página chega) e pede a página na frente da fila se está na tela.
	_npcDraw(c) {
		const D = c.dirs, d = Math.max(0, this.dir) % D;
		let P = c.pages[c.pd[d]], dd = d;
		if (!P.tex && !NpcArt.want(P, P.pri > 0 && this._onScreen() ? 0 : NpcArt._pri(P) - 0.5)) {      // (fora da tela: a paridade da direção atual antes da outra)
			this._wait = P;
			NpcArt._waiters.add(this);
			dd = -1;
			if (D > 8) for (const e of [(d + 1) % D, (d + D - 1) % D]) { const Q = c.pages[c.pd[e]]; if (Q.tex || NpcArt.want(Q)) { dd = e; P = Q; break; } }
			if (dd < 0) {
				if (this._fr2[3] !== 0) { for (let k = 3; k < 16; k += 4) this._fr2[k] = 0; this.mesh.updateVerticesData('fr2', this._fr2); }
				if (!this._pg && !this._npcWait) { this._npcWait = true; this._vis(); }
				return;
			}
		} else if (this._wait) { this._wait = null; NpcArt._waiters.delete(this); }
		if (this.mesh.material !== P.mat) this.mesh.material = P.mat;
		if (this._npcBox !== c.pk.box) {                                  // o quad (fixo, sem girar) tem a caixa do clipe desenhado
			const b = this._npcBox = c.pk.box;
			this._setQuad(this.mesh, b, this._pos, this._stand);
			this._setBounds(Math.max(-b[0], b[2], -b[1], b[3]));
		}
		this._pg = P; this._drawClip = c; this._drawDir = dd;
		P.used = NpcArt.now;
		this._setFr(this.mesh, c.pk, dd * c.pk.n + Math.min(this.frame, c.pk.n - 1), this._fr, true);
		if (this._npcWait) { this._npcWait = false; this._vis(); }
	}
	// Uma página chegou (NpcArt._upload): quem esperava tenta desenhar de novo.
	_pageReady() {
		if (!this.mesh || this.mesh.isDisposed()) { NpcArt._waiters.delete(this); return; }
		if (this.clip && this.clip.npc) { this._applyUV(); this._blendNext(this.clip); } else NpcArt._waiters.delete(this);
	}
	// O atlas do que está desenhado foi descartado (NpcArt.dropAtlas): some até desenhar de novo (o update refaz o clipe).
	_lostPage() {
		this._pg = null; this._drawClip = null; this._npcBox = null;
		this._wait = 1; this._waitT = 1;
		if (!this._npcWait) { this._npcWait = true; this._vis(); }
	}
	// Na tela agora? (pedir a página na frente da fila)
	_onScreen() {
		const m = this.mesh, F = this.scene.frustumPlanes;
		if (!this._placed || !m.isEnabled()) return false;
		if (!F) return true;
		m.computeWorldMatrix();
		return m.isInFrustum(F);
	}

	// Quad fixo de um clipe vetorial: a caixa (x0, z0, x1, z1) em metros relativa aos pés (já com a folga da sombra). stand: the same
	// box upright, in the quad's XY plane (image "north" = up).
	_setQuad(mesh, b, P = this._pos, stand = false) {
		const u = stand ? 1 : 2, f = stand ? 2 : 1;                       // (index of the image-height axis / of the flat axis)
		P[0] = b[0]; P[f] = 0; P[u] = b[3]; P[3] = b[2]; P[3 + f] = 0; P[3 + u] = b[3]; P[6] = b[0]; P[6 + f] = 0; P[6 + u] = b[1]; P[9] = b[2]; P[9 + f] = 0; P[9 + u] = b[1];
		mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, P);
	}
	// Standing (2.5D camera) or lying on the ground (top-down) — see standing().
	_setStanding(on) {
		if (this._stand === on) return;
		this._stand = on;
		const m = this.mesh;
		m.billboardMode = on ? BABYLON.AbstractMesh.BILLBOARDMODE_Y : BABYLON.AbstractMesh.BILLBOARDMODE_NONE;
		m.scaling.y = on ? SpriteActor.STAND_SCALE : 1;
		m.rotation.y = on ? 0 : this._yaw || 0;
		this._npcBox = null;                                               // (the quad is rebuilt in the other plane on the next draw)
		if (this.clip && this.clip.npc) this._applyUV();
	}

	// Ferimentos da pessoa: `shot` = tiros (0..4), `beat` = pancadas (0..4) e `cond` = o ESTADO DE DANO (Blood.cond): 1 SUJO, 2 MACHUCADO,
	// 3 MUITO MACHUCADO. O estado é PINTADO no desenho (NpcGenMesh.paintDamage — terra, cortes, rasgos e sangue presos à roupa e à pele,
	// girando com o corpo): mudou, o ator troca de atlas — o jogador pelo visual (PlayerLook, via onCond), o NPC pela folha machucada
	// do tipo (NpcArt.applyDamage). Fica até a pessoa ser outra (renasceu) ou se curar (clearWounds).
	setWounds(shot, beat, cond = this._wCond || 0) {
		shot = Math.max(0, Math.min(4, shot | 0)); beat = Math.max(0, Math.min(4, beat | 0)); cond = Math.max(0, Math.min(3, cond | 0));
		const was = this._wCond || 0;
		this._wShot = shot; this._wBeat = beat; this._wCond = cond;
		if (cond === was) return;
		if (this.onCond) this.onCond(cond);
		else if (typeof NpcArt !== 'undefined' && this.sheet && this.sheet.isNpc) NpcArt.applyDamage(this, cond);
	}
	get wounds() { return { shot: this._wShot || 0, beat: this._wBeat || 0, cond: this._wCond || 0 }; }
	clearWounds() { this._hits = 0; if (!this._wShot && !this._wBeat && !this._wCond) return; this.setWounds(0, 0, 0); }

	// Quadro f do clipe vetorial: um único atributo (3 números) — o mesmo custo de antes, quando só a UV mudava.
	_setFr(mesh, pk, f, R, raw = false) {
		const i = (raw ? f : Math.min(f, pk.n - 1)) * 3, a = pk.fr[i], b = pk.fr[i + 1], c = pk.fr[i + 2];      // raw: índice já calculado (2,5D: direção × quadros + quadro)
		if (R[0] === a && R[1] === b && R[2] === c) return;
		for (let k = 0; k < 16; k += 4) { R[k] = a; R[k + 1] = b; R[k + 2] = c; }
		mesh.updateVerticesData('fr', R);
	}

	_applyOverlay() {
		const m = this._ov;
		if (!m) return;
		const c = this.clip, key = c && c.vector && this.overlay && this.sheet.name === 'player' ? c.name + ':' + c.weapon : null;
		const pk = key ? CharArt.bagFrames(this.overlay, key) : null;
		if (!pk) { m.setEnabled(false); return; }
		m.setEnabled(true);
		m.material = c.material;
		if (this._ovClip !== pk) { this._ovClip = pk; this._setQuad(m, pk.box, this._ovPos || (this._ovPos = new Float32Array(12))); }
		this._setFr(m, pk, this.frame, this._ovR || (this._ovR = new Float32Array(16)));
	}

	setVisible(v) { this.mesh.setEnabled(v); }

	dispose() { this.mesh.dispose(); SpriteActor.live.delete(this); if (typeof NpcArt !== 'undefined') NpcArt._waiters.delete(this); }
}
SpriteActor.live = new Set();
