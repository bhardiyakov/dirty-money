// ============================================================================
// Throwables — GRANADA e COQUETEL MOLOTOV (armas 0 e − ; compram-se na boca de fumo).
//
// Controle (o mesmo botão do tiro: clique esquerdo / espaço / gatilho):
//   APERTOU  → prepara: granada = pega e PUXA O PINO (o pavio começa a correr: FUSE s — segurar demais explode na mão!);
//              molotov = ACENDE o pano com o isqueiro.
//   SEGURANDO → mira com o MOUSE (o ponto de queda é o próprio cursor) ou o ANALÓGICO DIREITO (direção = para onde aponta,
//              distância = o quanto ele está inclinado). Mais longe = arremesso mais FORTE: a velocidade de saída é calculada para
//              cair exatamente no alvo, até o alcance máximo (maxR, que cresce com a força do personagem). Sem mouse nem analógico
//              (teclado/toque), vai para onde o corpo aponta e a distância cresce enquanto segura (FORCE_T). Uma LINHA TRACEJADA
//              parabólica mostra a trajetória de verdade (a mesma simulação do voo: bate em parede, carro e gente) e um anel marca
//              onde cai e o tamanho do estrago.
//   SOLTOU   → arremessa (clipe *_throw; o objeto sai da mão no RELEASE do clipe).
// Voo: balístico (gravidade), visto em 2,5D (a altura h desenha o objeto h × 0,56 m "acima" no chão, como o fogo dos carros), com
// sombra. Granada quica no chão/paredes/carros e rola até parar; explode quando o pavio acaba (CarDamage.boomAt: dano em área,
// arremessa pessoas, estraga e explode carros). Na água afunda e explode num chafariz (dano menor).
// Molotov quebra no primeiro impacto (vidro) e espalha FOGO no chão: FIRE_T s (no mínimo 30), forma irregular, chamas de verdade
// (CarDamage.flameFx), brilho e fumaça. O fogo machuca TUDO que estiver nele — jogador, pedestres, policiais, traficantes, carros
// (que acabam pegando fogo e explodindo) — e quem passa pelo fogo SAI EM CHAMAS por alguns segundos (continua queimando e corre).
// Crime: arremessar perto de gente e cada vítima contam como violência do jogador.
// ============================================================================

const Throwables = {
	DEF: {
		grenade: { prep: 'grenade_pin', hold: 'grenade_hold', throw: 'grenade_throw', minR: 1.5, maxR: 24, fuse: 3.4, col: [0.95, 0.95, 0.9] },
		molotov: { prep: 'molotov_light', hold: 'molotov_hold', throw: 'molotov_throw', minR: 1.5, maxR: 20, col: [1.0, 0.82, 0.45] },
	},
	FORCE_T: 1.25,          // (sem mouse nem analógico) s segurando até o alcance máximo
	STICK_DZ: 0.22,         // zona morta do analógico direito (abaixo disso, mantém a última mira)
	RELEASE: 0.13,          // s depois do início do *_throw em que o objeto sai da mão (a chave "voando" do clipe, 2/16 s: em segundos, vale para qualquer nº de quadros)
	ANGLE: 0.66,            // ângulo de saída (rad, ~38°)
	GRAV: 14,               // gravidade do voo (m/s²: um pouco mais "seca" que a real — o arremesso fica legível)
	H0: 1.75,               // altura da mão ao soltar (m)
	FIRE_T: [32, 40],       // duração do fogo do molotov (s)
	FIRE_R: 3.4,            // raio da poça de fogo (m)
	BLAST_BL: 1.0,          // força da explosão da granada (× a de um carro: Config.crash.explosionR × bl de raio)
	DASHES: 48,

	s: null,                // arremesso do jogador em andamento: { kind, phase: 'prep'|'hold'|'throw', t, power, dir, fuse, armed, thrown }
	list: [],               // objetos voando/rolando: { kind, x, z, h, vx, vz, vh, fuse, slots, t, rest }
	fires: [],              // poças de fogo: { x, z, r, t, dur, blobs, slot, acc, tick }
	burning: new Map(),     // gente pegando fogo: entidade → segundos restantes

	init(game) {
		if (this.g === game) return;
		this.g = game;
		const sc = game.scene;
		this.dash = new GlowBatch(sc, this.DASHES, 'throwAim', 'dash');
		for (let i = 0; i < this.DASHES; i++) this.dash.alloc();
		this.mark = new GlowBatch(sc, 4, 'throwMark', 'ring');
		for (let i = 0; i < 4; i++) this.mark.alloc();
		this.objs = new GlowBatch(sc, 48, 'throwObjs', 'puff');           // o objeto voando (2 quads: ele e a sombra)
		for (let i = 0; i < 48; i++) this.objs.alloc();
		this._objFree = [...Array(24).keys()];
		this._aimOn = false;
	},

	held() { const inp = this.g.input; return !!(inp.keys[' '] || inp.mouseDown); },
	def(kind) { return this.DEF[kind]; },
	busy() { return !!this.s; },

	// Botão apertado com granada/molotov na mão (Game._playerActions).
	press() {
		const g = this.g, p = g.player, inv = g.inventory, kind = p.weapon;
		if (this.s || !Weapons[kind] || !Weapons[kind].throwable || g.mode !== 'player') return false;
		if (inv.reserve(kind) <= 0) { g._flash(`Sem ${Weapons[kind].name.toLowerCase()} — compre na boca de fumo`); return false; }
		if (p.busy || p.swimming || p.rag || (p.depth || 0) > 0) return false;
		const D = this.DEF[kind];
		if (!p.playAction(D.prep, { lock: 0, onDone: () => this._toHold() })) return false;
		this.s = { kind, phase: 'prep', t: 0, power: 0, dist: null, dir: p.root.rotation.y, fuse: D.fuse || 0, armed: false };
		return true;
	},

	_toHold() {
		const s = this.s, p = this.g.player;
		if (!s || s.phase !== 'prep') return;
		s.phase = 'hold';
		p.playAction(this.DEF[s.kind].hold, { lock: 0 });
	},

	_throw() {
		const s = this.s, p = this.g.player;
		s.phase = 'throw'; s.t = 0;
		if (!p.playAction(this.DEF[s.kind].throw, { lock: 0, onDone: () => this._end() })) { this._launch(); this._end(); }
		AudioFX._burst(p.position.x, p.position.z, { vol: 0.18, dur: 0.18, f0: 900, f1: 300, maxDist: 25, type: 'bandpass', q: 0.8, att: 0.03 });      // o "fuuu" do braço
	},

	_end() {
		const g = this.g, p = g.player, s = this.s;
		this.s = null;
		this._aim(false);
		if (s && !g.inventory.owned(s.kind)) { p.weapon = 'none'; g._flash(`Acabou: ${Weapons[s.kind].name.toLowerCase()}`); }
	},

	// Mira do quadro: direção e DISTÂNCIA até o ponto de queda.
	//   mouse: o cursor no chão (direção e distância, limitada ao alcance); analógico direito: direção para onde aponta e distância
	//   pela inclinação (zona morta → mantém a última mira); nenhum dos dois: para onde anda / o corpo aponta, e a distância cresce
	//   enquanto segura (FORCE_T). Devolve { dir, dist }.
	_aimTarget(p, s, dt) {
		const g = this.g, inp = g.input, D = this.DEF[s.kind], maxR = this.maxRange(s.kind), P = p.position;
		if (!inp.usingPad && g.aim && g.aim._mouseGround && inp.mouseX >= 0) {
			const m = g.aim._mouseGround();
			if (m) {
				const d = Math.hypot(m.x - P.x, m.z - P.z);
				if (d > 0.3) { s.src = 'mouse'; return { dir: Math.atan2(m.x - P.x, m.z - P.z), dist: Math.max(D.minR, Math.min(maxR, d)) }; }
			}
		}
		const rs = inp.rstick, mag = rs ? Math.hypot(rs.x, rs.y) : 0;
		if (mag > this.STICK_DZ) {
			const k = Math.min(1, (mag - this.STICK_DZ) / (0.95 - this.STICK_DZ)), want = D.minR + (maxR - D.minR) * k;
			s.src = 'stick';
			s.stickDist = s.stickDist == null ? want : s.stickDist + (want - s.stickDist) * (1 - Math.exp(-10 * dt));      // (suave: o analógico treme)
			return { dir: Aim.stickAngle(rs), dist: s.stickDist };
		}
		if (s.src === 'stick') return { dir: s.dir, dist: s.dist };           // soltou o analógico: fica onde estava
		// teclado / toque: direção do movimento (ou do corpo) e a distância carregando com o tempo segurando
		s.src = 'hold';
		const ax = inp.getMoveAxis();
		const dir = Math.abs(ax.x) + Math.abs(ax.z) > 0.3 ? Math.atan2(ax.x, ax.z) + (typeof CompassCamera !== 'undefined' ? CompassCamera.yaw || 0 : 0) : p.root.rotation.y;
		if (s.phase === 'hold') s.charge = Math.min(1, (s.charge || 0) + dt / this.FORCE_T);
		return { dir, dist: D.minR + (maxR - D.minR) * (s.charge || 0) };
	},

	// Alcance máximo (m): cresce com a força do personagem (até +20%).
	maxRange(kind) {
		const str = typeof Bags !== 'undefined' ? Bags.strLevel(this.g.player.str) : 0;
		return this.DEF[kind].maxR * (1 + str * 0.01);
	},
	// Distância (m) em que um arremesso a v m/s, saindo da mão (altura H0) no ângulo ANGLE, desce até a altura `th` (0 = a rua; um
	// telhado/muro mais alto). Se nem chega lá em cima: 0.
	_rangeOf(v, th = 0) {
		const vs = v * Math.sin(this.ANGLE), vc = v * Math.cos(this.ANGLE), G = this.GRAV, q = vs * vs + 2 * G * (this.H0 - th);
		return q < 0 ? 0 : vc * (vs + Math.sqrt(q)) / G;
	},
	// Velocidade de saída que cai EXATAMENTE a `dist` m, na altura `th` (mais longe = mais forte): busca binária em _rangeOf.
	_v0(dist, th = 0) {
		let lo = 0, hi = 40;
		for (let i = 0; i < 26; i++) { const m = (lo + hi) / 2; if (this._rangeOf(m, th) < dist) lo = m; else hi = m; }
		return (lo + hi) / 2;
	},
	// Altura do alvo (m): o topo do sólido sob o ponto mirado (telhado, muro, contêiner) — ou 0 na rua.
	_targetH(x, z) { return this._floorAt(x, z, 1e3); },
	_start(dir, kind, dist) {
		const p = this.g.player.position, fx = Math.sin(dir), fz = Math.cos(dir);
		const th = Math.min(12, this._targetH(p.x + fx * dist, p.z + fz * dist));
		const v = this._v0(Math.max(0.2, dist - 0.45), th), hv = v * Math.cos(this.ANGLE);      // (sai 0,45 m à frente do corpo)
		return { x: p.x + fx * 0.45 + fz * 0.22, z: p.z + fz * 0.45 - fx * 0.22, h: this.H0, vx: fx * hv, vz: fz * hv, vh: v * Math.sin(this.ANGLE) };
	},

	// Um passo de voo (o mesmo para a linha da mira e o objeto de verdade). Devolve o que aconteceu: null | 'ground' | 'wall' |
	// 'car' | 'body' (+ o.hit = o atingido) — e já quica/para (granada) quando `bounce`.
	// ------------------------------------------------------------------ colisão com o mapa (3D)
	// Os sólidos do mapa (CityGrid: prédios, muros, cercas, quiosques, contêineres, postes, paredões…) são caixas com altura `h` (m).
	// Sólido que contém o ponto (x, z) na altura h — ou null. (Dentro de uma loja/casa: os móveis da sala.)
	_solidAt(x, z, h) {
		const L = typeof Interiors !== 'undefined' && Interiors.active ? Interiors.obstacles : CityGrid.obstaclesNear(x, z);
		for (const s of L) if (x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1 && h < (s.h || 3)) return s;
		return null;
	},
	// Altura do "chão" sob (x, z) para quem está na altura h: o topo do sólido mais alto que fica ABAIXO dele (telhado, muro), ou 0.
	_floorAt(x, z, h) {
		const L = typeof Interiors !== 'undefined' && Interiors.active ? Interiors.obstacles : CityGrid.obstaclesNear(x, z);
		let f = 0;
		for (const s of L) { const top = s.h || 3; if (x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1 && top <= h + 0.05 && top > f) f = top; }
		return f;
	},

	_step(o, dt, bounce, ignore = null) {
		const nx = o.x + o.vx * dt, nz = o.z + o.vz * dt;
		let nh = o.h + o.vh * dt;
		o.vh -= this.GRAV * dt;
		// prédio / muro / estrutura: entrou numa caixa sólida neste passo?
		const S = this._solidAt(nx, nz, nh);
		if (S) {
			const top = S.h || 3;
			if (o.h >= top - 0.02) {                                           // veio de cima: caiu no TELHADO / no alto do muro
				o.x = nx; o.z = nz; o.h = top; o.floor = top;
				if (!bounce) return 'ground';
				if (Math.abs(o.vh) > 2.2) { o.vh = Math.abs(o.vh) * 0.3; o.vx *= 0.55; o.vz *= 0.55; } else { o.vh = 0; o.rolling = true; }
				return 'ground';
			}
			o.hit = S;
			if (!bounce) return 'wall';                                        // (molotov: quebra na parede, do lado de cá)
			const inX = o.x > S.x0 && o.x < S.x1, inZ = o.z > S.z0 && o.z < S.z1;     // por qual face entrou: rebate só aquela componente
			if (!inX) o.vx *= -0.35; else o.vx *= 0.6;
			if (!inZ) o.vz *= -0.35; else o.vz *= 0.6;
			if (inX && inZ) { o.vx *= -1; o.vz *= -1; }                        // (já estava dentro: devolve para trás)
			o.vh = Math.min(o.vh, 0) * 0.6;
			o.h = Math.max(o.floor || 0, nh);
			return 'wall';
		}
		// carros
		const cd = this.g.carDamage;
		if (cd && nh < 1.7) for (const c of cd.allCars()) {
			const dx = nx - c.position.x, dz = nz - c.position.z;
			if (dx * dx + dz * dz > 16) continue;
			const f = c.fwdToRef(this._f || (this._f = new BABYLON.Vector3())), lf = dx * f.x + dz * f.z, lr = dx * f.z - dz * f.x;
			if (Math.abs(lf) < (c.halfLen || 2) && Math.abs(lr) < (c.halfW || 1)) {
				o.hit = c;
				if (!bounce) return 'car';
				if (o.h > 1.3) { o.vh = Math.abs(o.vh) * 0.35; o.vx *= 0.6; o.vz *= 0.6; o.h = 1.4; }      // quicou no teto/capô
				else { o.vx *= -0.35; o.vz *= -0.35; }
				return 'car';
			}
		}
		// gente (só o molotov quebra; a granada bate e cai)
		if (nh < 2.0) {
			const hitBody = (e) => e && e !== ignore && e.alive && !e.rag && (nx - e.position.x) ** 2 + (nz - e.position.z) ** 2 < 0.2;
			const g = this.g, pl = g.mode === 'player' ? g.player : null;
			let who = hitBody(pl) ? pl : null;
			if (!who && g.npcManager) for (const n of g.npcManager.npcs) if (hitBody(n)) { who = n; break; }
			if (!who && g.policeManager) for (const n of g.policeManager.officers) if (hitBody(n)) { who = n; break; }
			if (!who && g.gangs) for (const n of g.gangs.members) if (hitBody(n)) { who = n; break; }
			if (who) {
				o.hit = who;
				if (!bounce) { o.x = nx; o.z = nz; o.h = nh; return 'body'; }
				o.vx *= -0.25; o.vz *= -0.25;
				return 'body';
			}
		}
		o.x = nx; o.z = nz; o.h = nh;
		const fl = o.floor = this._floorAt(nx, nz, Math.max(nh, 0) + 0.3);   // chão aqui: a rua (0) ou um telhado/muro por baixo
		if (o.h <= fl) {
			o.h = fl;
			if (!bounce) return 'ground';
			if (Math.abs(o.vh) > 2.2) { o.vh = -o.vh * 0.3; o.vx *= 0.55; o.vz *= 0.55; return 'ground'; }
			o.vh = 0; o.rolling = true;
			return null;
		}
		return null;
	},

	// ------------------------------------------------------------------ por quadro
	update(dt) {
		const g = this.g;
		if (!g) return;
		this._player(dt);
		this._fly(dt);
		this._fires(dt);
		this._burnPeople(dt);
		this.objs.flush();
	},

	_player(dt) {
		const g = this.g, s = this.s, p = g.player;
		if (!s) return;
		const D = this.DEF[s.kind];
		s.t += dt;
		// interrompido (atropelado, morreu, entrou na água/no carro): granada sem pino cai VIVA no pé; molotov aceso quebra ali
		if (!p.alive || p.rag || g.mode !== 'player' || p.swimming) {
			if (s.phase !== 'throw' || !s.thrown) {
				if (s.kind === 'grenade' && s.armed) this._spawn('grenade', { x: p.position.x, z: p.position.z, h: 0.9, vx: 0, vz: 0, vh: 0 }, s.fuse);
				else if (s.kind === 'molotov' && s.armed) this._ignite(p.position.x, p.position.z, null);
				if (s.armed) g.inventory.weapons[s.kind].reserve--;
			}
			this.s = null; this._aim(false);
			return;
		}
		// preparo: o pino sai / o pano acende no meio do clipe
		if (!s.armed && s.t > (s.kind === 'grenade' ? 0.3 : 0.45)) {
			s.armed = true;
			const P = p.position;
			if (s.kind === 'grenade') { AudioFX._burst(P.x, P.z, { vol: 0.28, dur: 0.05, f0: 5200, f1: 3800, maxDist: 25, type: 'bandpass', q: 6 }); AudioFX._burst(P.x, P.z, { vol: 0.2, dur: 0.06, f0: 2600, f1: 2200, maxDist: 25, type: 'bandpass', q: 8, delay: 0.09 }); }
			else { AudioFX._burst(P.x, P.z, { vol: 0.22, dur: 0.05, f0: 4200, f1: 2600, maxDist: 25, type: 'highpass', q: 2 }); AudioFX._burst(P.x, P.z, { vol: 0.25, dur: 0.6, f0: 700, f1: 260, maxDist: 30, att: 0.12 }); }
		}
		if (s.kind === 'grenade' && s.armed && !s.thrown) {
			s.fuse -= dt;
			if (s.fuse <= 0) {                                                // segurou demais: explode na mão
				g.inventory.weapons.grenade.reserve--;
				this.s = null; this._aim(false); p.action = null;
				g._flash('💥 A granada explodiu na sua mão! (solte antes do pavio acabar)');
				g.carDamage.boomAt(p.position.x, p.position.z, 'player', this.BLAST_BL, false);
				return;
			}
		}
		if (s.phase !== 'throw') {
			const A = this._aimTarget(p, s, dt);
			s.dir = A.dir; s.dist = A.dist;
			s.power = Math.max(0, Math.min(1, (s.dist - this.DEF[s.kind].minR) / Math.max(1, this.maxRange(s.kind) - this.DEF[s.kind].minR)));      // (só para o HUD e a cor da linha)
			p.root.rotation.y = p._lerpAngle(p.root.rotation.y, s.dir, 1 - Math.exp(-12 * dt));
			if (!this.held()) s.release = true;
			if (s.phase === 'hold' && s.release) this._throw();
			else this._preview(s);
		}
		if (s.phase === 'throw') {
			this._aim(false);
			if (!s.thrown && s.t >= this.RELEASE) this._launch();
		}
	},

	_launch() {
		const g = this.g, s = this.s, p = g.player;
		if (!s || s.thrown) return;
		s.thrown = true;
		g.inventory.weapons[s.kind].reserve--;
		this._spawn(s.kind, this._start(s.dir, s.kind, s.dist == null ? this.DEF[s.kind].minR : s.dist), s.fuse, p);
		if (g.npcManager) g.npcManager.alertViolence(p.position, s.kind === 'grenade' ? 30 : 22);
		if (g.heat && (s.kind === 'grenade' || this._peopleNear(p.position.x, p.position.z, 30))) g.heat.commit(s.kind === 'grenade' ? 'explosion' : 'arson');
	},

	_peopleNear(x, z, r) {
		const M = this.g.npcManager;
		return !!(M && M.npcs.some((n) => n.alive && Math.hypot(n.position.x - x, n.position.z - z) < r));
	},

	_spawn(kind, st, fuse, thrower = null) {
		const id = this._objFree.pop();
		if (id === undefined) return;
		this.list.push(Object.assign({ kind, fuse: kind === 'grenade' ? Math.max(0.2, fuse) : 0, id, t: 0, thrower, rolling: false, spin: Math.random() * 6 }, st));
	},

	// ------------------------------------------------------------------ linha tracejada (mira)
	_preview(s) {
		const o = this._start(s.dir, s.kind, s.dist == null ? this.DEF[s.kind].minR : s.dist), pts = [{ x: o.x, z: o.z, h: o.h }], dt = 1 / 60, p = this.g.player;
		let end = null, hit = null;
		for (let i = 0; i < 240 && !end; i++) {
			const r = this._step(o, dt, false, p);
			if (i % 2 === 1 || r) pts.push({ x: o.x, z: o.z, h: o.h });
			if (r) { end = r; hit = o.hit; }
		}
		// traços ao longo da curva (desenhada em 2,5D: altura h → h × 0,56 m para o norte), a cada ~0,55 m, piscando de leve
		const D = this.DEF[s.kind], U = CompassCamera.NORTH_PER_METRE, gap = 0.55, ph = (performance.now() / 1000 * 1.6) % 1;
		let acc = -ph * gap * 2, n = 0;
		for (let i = 1; i < pts.length && n < this.DASHES; i++) {
			const a = pts[i - 1], b = pts[i], ax = a.x, az = a.z + a.h * U, bx = b.x, bz = b.z + b.h * U, L = Math.hypot(bx - ax, bz - az);
			acc += L;
			if (acc < gap * 2) continue;
			acc = 0;
			const ux = (bx - ax) / (L || 1), uz = (bz - az) / (L || 1), w = 0.075, l = 0.2, y = 1.3 + b.h;
			const px = uz * w, pz = -ux * w;
			this.dash.quad(n, bx - px + ux * l, y, bz - pz + uz * l, bx + px + ux * l, y, bz + pz + uz * l, bx - px - ux * l, y, bz - pz - uz * l, bx + px - ux * l, y, bz + pz - uz * l);
			const f = i / pts.length;                                         // a cor esquenta com a força (amarelo → laranja → vermelho)
			this.dash.color(n, D.col[0], D.col[1] * (1 - 0.45 * s.power), D.col[2] * (1 - 0.8 * s.power), 0.95 - 0.25 * f);
			n++;
		}
		for (let i = n; i < this.DASHES; i++) this.dash.off(i);
		this.dash.flush();
		// anel onde cai: o tamanho do estrago (explosão / fogo)
		const last = pts[pts.length - 1], R = s.kind === 'grenade' ? Config.crash.explosionR * this.BLAST_BL * 0.7 : this.FIRE_R;
		const pulse = 1 + 0.06 * Math.sin(performance.now() / 120);
		const lz = last.z + last.h * CompassCamera.NORTH_PER_METRE, ly = 0.35 + last.h;                 // (caiu num telhado / bateu alto na parede: o anel lá em cima)
		this.mark.place(0, last.x, ly, lz, R * 2 * pulse);
		this.mark.color(0, 1.0, s.kind === 'grenade' ? 0.35 : 0.55, 0.12, 0.85);
		this.mark.place(1, last.x, ly, lz, 0.9);
		this.mark.color(1, 1.0, 1.0, 0.9, 0.9);
		this.mark.flush();
		this._aimOn = true;
		this.preview = { x: last.x, z: last.z, end, hit, power: s.power };
	},
	_aim(on) {
		if (on || !this._aimOn) return;
		this._aimOn = false;
		for (let i = 0; i < this.DASHES; i++) this.dash.off(i);
		this.dash.flush();
		for (let i = 0; i < 4; i++) this.mark.off(i);
		this.mark.flush();
	},

	// ------------------------------------------------------------------ voo
	_fly(dt) {
		const g = this.g, U = CompassCamera.NORTH_PER_METRE, B = this.objs;
		for (let i = this.list.length - 1; i >= 0; i--) {
			const o = this.list[i];
			o.t += dt;
			let ev = null;
			if (!o.sunk) {
				if (o.rolling) {                                               // rolando no chão (ou no telhado) até parar
					const k = Math.exp(-3.2 * dt), nx = o.x + o.vx * dt, nz = o.z + o.vz * dt;
					const W = this._solidAt(nx, nz, o.h + 0.05);
					if (W) {                                                   // bateu numa parede: volta
						if (!(o.x > W.x0 && o.x < W.x1)) o.vx *= -0.3;
						if (!(o.z > W.z0 && o.z < W.z1)) o.vz *= -0.3;
					} else {
						o.x = nx; o.z = nz;
						const fl = this._floorAt(nx, nz, o.h + 0.05);
						if (fl < o.h - 0.05) { o.rolling = false; o.vh = 0; }  // passou da beirada do telhado/muro: cai
						else o.h = fl;
					}
					o.vx *= k; o.vz *= k;
				} else {
					const sub = 3;
					for (let k = 0; k < sub && !ev; k++) ev = this._step(o, dt / sub, o.kind === 'grenade', o.t < 0.25 ? o.thrower : null);
				}
				if (MapGeo.waterDepth(o.x, o.z) > 0 && o.h <= 0.05) {          // caiu na água
					if (o.kind === 'molotov') { this._fizz(o.x, o.z); this._drop(i); continue; }
					o.sunk = true; o.vx = o.vz = 0; this._splash(o.x, o.z);
				}
			}
			if (o.kind === 'molotov' && ev) { this._shatter(o, ev); this._drop(i); continue; }
			if (o.kind === 'grenade') {
				if (ev && (ev === 'ground' || ev === 'wall' || ev === 'car') && o.t > 0.05) AudioFX._burst(o.x, o.z, { vol: 0.16, dur: 0.04, f0: 3200, f1: 1800, maxDist: 30, type: 'bandpass', q: 3 });     // "tlim"
				o.fuse -= dt;
				if (o.fuse <= 0) { this._explode(o); this._drop(i); continue; }
			}
			// desenho: o objeto (com a altura) e a sombra no chão
			const j = o.id * 2, s = o.kind === 'grenade' ? 0.34 : 0.42, y = 1.3 + o.h;
			if (o.sunk) { B.off(j); B.off(j + 1); continue; }
			B.place(j, o.x, y, o.z + o.h * U, s);
			if (o.kind === 'grenade') B.color(j, 0.23, 0.29, 0.16, 1);
			else B.color(j, 0.45, 0.25, 0.08, 1);
			B.place(j + 1, o.x, 0.3, o.z, s * (1 - Math.min(0.5, o.h * 0.08)));
			B.color(j + 1, 0, 0, 0, 0.35);
			if (o.kind === 'molotov' && g.carDamage) {                         // o pano queimando no ar (rastro de fogo)
				g.carDamage.flameFx.emit(o.x, o.z, o.h + 0.2, 0.42, 0.28, 1.0, 0.6, -o.vx * 0.15, -o.vz * 0.15);
			}
			if (o.kind === 'grenade' && o.rolling && o.fuse < 1.2 && Math.random() < dt * 8 && g.combat) g.combat.spark(o.x, 0.6, o.z, [1, 0.8, 0.3]);      // pavio chiando
		}
	},
	_drop(i) {
		const o = this.list[i], B = this.objs;
		B.off(o.id * 2); B.off(o.id * 2 + 1);
		this._objFree.push(o.id);
		this.list.splice(i, 1);
	},

	_explode(o) {
		const g = this.g;
		if (o.sunk) {                                                          // debaixo d'água: chafariz e onda de choque menor
			this._splash(o.x, o.z, 3);
			AudioFX._burst(o.x, o.z, { vol: 0.7, dur: 0.6, f0: 600, f1: 60, maxDist: 160 });
			g.carDamage._blast(o.x, o.z, Config.crash.explosionR * 0.45, 'player', null, 0.5);
			g.heat.commit('explosion');
			return;
		}
		g.carDamage.boomAt(o.x, o.z, 'player', this.BLAST_BL, false);
	},

	_splash(x, z, k = 1) {
		const g = this.g;
		if (g.waterFx && g.waterFx.burst) { g.waterFx.burst(x, z, k > 1.5); g.waterFx.ripple(x, z, 0.6, 2.5 * k, 1.2, 0.6); }
		else if (g.combat) for (let i = 0; i < 8 * k; i++) g.combat.spark(x + (Math.random() - 0.5) * k, 0.4 + Math.random() * k, z + (Math.random() - 0.5) * k, [0.8, 0.9, 1.0]);
		AudioFX._burst(x, z, { vol: 0.2 * k, dur: 0.25, f0: 1400, f1: 300, maxDist: 40, att: 0.01 });
	},
	_fizz(x, z) {
		this._splash(x, z);
		AudioFX._burst(x, z, { vol: 0.18, dur: 0.5, f0: 5000, f1: 2500, maxDist: 30, type: 'highpass', q: 1 });
		const P = this.g.carDamage && this.g.carDamage.puffs;
		if (P) for (let i = 0; i < 6; i++) P.emit(x, 0.8, z, (Math.random() - 0.5), 1.5 + Math.random(), (Math.random() - 0.5), 0.4, 1.6, 1.2, 0.35, [0.85, 0.85, 0.88]);
	},

	// Molotov quebrou: vidro e o fogo se espalhando (num carro: no chão em volta dele, e o carro sente o golpe; numa pessoa: ela pega fogo).
	_shatter(o, ev) {
		const g = this.g;
		AudioFX.glass(o.x, o.z);
		if (g.combat) for (let i = 0; i < 10; i++) g.combat.spark(o.x + (Math.random() - 0.5), 0.5 + Math.random(), o.z + (Math.random() - 0.5), [1, 0.75, 0.3]);
		let h = o.h;
		if (ev === 'wall') {                                                 // quebrou na parede: o líquido escorre até o chão, do lado de cá
			const d = Math.hypot(o.vx, o.vz) || 1;
			o.x -= o.vx / d * 0.35; o.z -= o.vz / d * 0.35;
			h = this._floorAt(o.x, o.z, o.h);
		} else if (ev !== 'ground') h = 0;
		if (ev === 'car' && o.hit && o.hit.takeDamage) o.hit.takeDamage(25, 'player');
		if (ev === 'body' && o.hit) this._setOnFire(o.hit, 7);
		this._ignite(o.x, o.z, ev === 'car' ? o.hit : null, h);
	},

	// Fogo no chão em (x, z) — ou no alto (h: telhado, muro), onde ninguém pisa: só queima e apaga.
	_ignite(x, z, car, h = 0) {
		if (h < 0.3 && MapGeo.waterDepth(x, z) > 0) { this._fizz(x, z); return; }
		const g = this.g, R = this.FIRE_R * (0.9 + Math.random() * 0.2), blobs = [];
		for (let i = 0; i < 6; i++) { const a = Math.random() * Math.PI * 2, d = Math.random() * R * 0.55; blobs.push({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, r: R * (0.35 + Math.random() * 0.3) }); }
		if (h > 0.3) for (const b of blobs) { b.x = x + (b.x - x) * 0.6; b.z = z + (b.z - z) * 0.6; b.r *= 0.7; }      // (no telhado a poça é menor)
		this.fires.push({ x, z, h, r: R, t: 0, dur: this.FIRE_T[0] + Math.random() * (this.FIRE_T[1] - this.FIRE_T[0]), blobs, acc: 0, tick: 0, slot: null, car });
		AudioFX._burst(x, z, { vol: 0.55, dur: 0.9, f0: 400, f1: 90, maxDist: 90, att: 0.05 });            // "vuuush"
		if (g.carDamage) g.carDamage._burst(x, z, 0.45);
		if (g.npcManager) g.npcManager.alertViolence({ x, z }, 30);
		if (this._peopleNear(x, z, 25)) g.heat.commit('arson');
	},

	// ------------------------------------------------------------------ fogo no chão
	// Está dentro do fogo `F` (a poça irregular: a união dos borrões)?
	_inFire(F, x, z, pad = 0) {
		for (const b of F.blobs) if ((x - b.x) ** 2 + (z - b.z) ** 2 < (b.r + pad) ** 2) return true;
		return false;
	},

	_fires(dt) {
		const g = this.g, cd = g.carDamage, f = g.camera.target;
		for (let i = this.fires.length - 1; i >= 0; i--) {
			const F = this.fires[i];
			F.t += dt;
			const I = Math.min(1, F.t / 0.5) * Math.max(0, Math.min(1, (F.dur - F.t) / 6));     // acende rápido; nos últimos 6 s vai baixando
			if (F.t >= F.dur) { if (F.slot != null) cd.fire.free(F.slot); this.fires.splice(i, 1); continue; }
			const near = Math.hypot(F.x - f.x, F.z - f.z) < 80;
			if (near) {
				// chamas espalhadas pela poça (mais nos borrões), brasas e fumaça
				F.acc += dt * 95 * I;
				while (F.acc >= 1) {
					F.acc -= 1;
					const b = F.blobs[Math.floor(Math.random() * F.blobs.length)], a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * b.r;
					cd.flameFx.emit(b.x + Math.cos(a) * r, b.z + Math.sin(a) * r, (F.h || 0) + 0.02, (0.75 + Math.random() * 0.8) * (0.55 + 0.45 * I), 0.45 + Math.random() * 0.45, 0.85 + 0.15 * Math.random(), 1.1 + Math.random() * 1.1);
				}
				if (F.slot == null) F.slot = cd.fire.alloc();
				cd.fire.place(F.slot, F.x, 0.3 + (F.h || 0), F.z + (F.h || 0) * CompassCamera.NORTH_PER_METRE, (F.r * 2.6 + 2) * (0.7 + 0.3 * I) + Math.sin(cd.time * 11 + i) * 0.8);
				cd.fire.color(F.slot, 1.0, 0.45, 0.12, 0.12 + 0.12 * I);
				F.sm = (F.sm || 0) - dt;
				if (F.sm <= 0) { F.sm = 0.3; cd.puffs.emit(F.x + (Math.random() - 0.5) * F.r, 2.2 + (F.h || 0), F.z + (F.h || 0) * CompassCamera.NORTH_PER_METRE + F.r * 0.4 + (Math.random() - 0.5) * F.r, (Math.random() - 0.5) * 0.6, 2.4 + Math.random(), (Math.random() - 0.5) * 0.6 + 0.4, 0.4, 2.0, 2.2, 0.22 * I + 0.06, [0.12, 0.12, 0.13]); }      // (fumaça rala subindo — a mais densa é a dos carros)
			}
			// dano: 4×/s em tudo que está no fogo
			F.tick -= dt;
			if (F.tick > 0 || I < 0.15 || (F.h || 0) > 1.2) continue;          // (fogo lá no alto: não alcança ninguém)
			F.tick = 0.25;
			this._burnArea(F, 0.25, I);
		}
	},

	_burnArea(F, dt, I) {
		const g = this.g, from = { x: F.x, z: F.z }, pl = g.player;
		if (pl.alive && g.mode === 'player' && this._inFire(F, pl.position.x, pl.position.z, 0.3)) {
			pl.takeDamage(22 * I * dt, true);
			this._setOnFire(pl, 2.5);
			if (!this._msgT || F.t - this._msgT > 3 || F.t < this._msgT) { this._msgT = F.t; g._flash('🔥 Você está pegando fogo! Saia das chamas'); }
		}
		const burn = (e) => { if (e.alive && this._inFire(F, e.position.x, e.position.z, 0.3)) { e.takeDamage(30 * I * dt, from, 'player'); this._setOnFire(e, 6); } };
		if (g.npcManager) for (const n of g.npcManager.npcs) burn(n);
		if (g.policeManager) for (const o of g.policeManager.officers) burn(o);
		if (g.gangs) for (const o of g.gangs.members) burn(o);
		if (g.carDamage) for (const c of g.carDamage.allCars()) {
			if (c.wrecked || !(c.hp > 0)) continue;
			const hw = Math.max(c.halfW || 1, c.halfLen || 2);
			if (this._inFire(F, c.position.x, c.position.z, hw * 0.8)) c.takeDamage(14 * I * dt * (c === F.car ? 1.5 : 1), 'player');        // a lataria esquenta até pegar fogo de vez
		}
	},

	// Gente em chamas: continua queimando por `sec` s depois de sair do fogo (chamas no corpo, dano e — pedestre — correndo apavorado).
	_setOnFire(e, sec) {
		const cur = this.burning.get(e) || 0;
		if (sec > cur) this.burning.set(e, sec);
		if (e.panic && !cur && e.alive) { try { e.panic(e.position, true); } catch (err) { /* (nem todo NPC entra em pânico) */ } }
	},
	_burnPeople(dt) {
		const g = this.g, F = g.carDamage && g.carDamage.flameFx;
		for (const [e, t] of this.burning) {
			const left = t - dt;
			if (left <= 0 || !e.alive || (e === g.player && (g.mode !== 'player' || e.swimming || (e.depth || 0) > 0))) { this.burning.delete(e); continue; }
			this.burning.set(e, left);
			const p = e.position;
			if (F && Math.random() < dt * 22) F.emit(p.x + (Math.random() - 0.5) * 0.4, p.z + (Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 1.0, 0.5 + Math.random() * 0.35, 0.35 + Math.random() * 0.3, 0.95, 1.6);
			if (e === g.player) e.takeDamage(7 * dt, true);
			else e.takeDamage(12 * dt, { x: p.x, z: p.z }, 'player');
		}
	},

	// Fogo/explosão de arremessáveis por perto (o HUD/testes): quantos objetos e poças ativos.
	get active() { return this.list.length + this.fires.length; },
};
