// ============================================================================
// CarParts — o DANO POR PEÇA dos carros 3D, no estilo dos GTA da era PS2 (San Andreas / Vice City): cada modelo tem as peças dele
// (tools/carros3d/parts.js: capô, porta-malas ou tampa traseira ou tampa da caçamba, portas, para-choques, portas traseiras do furgão)
// e cada uma tem vida própria.
//
//   BATIDA (Game._onCarImpact → hit): o lado batido vem da variação de velocidade (a batida na frente freia o carro para trás). A
//            região ganha AMASSADO (0..1 por região: frente, traseira, esquerda, direita — exagerado, como no Vice City: o shader do
//            carro encurta a ponta, empena o capô e afunda a lateral) e as peças daquela região perdem vida: com pouca, a peça
//            DESTRAVA (porta, capô e tampa abrem e BALANÇAM com o movimento do carro — a freada abre a porta, o vento levanta o capô,
//            o buraco faz a tampa pular — e o para-choque PENDE de um lado e vai raspando no chão); sem vida, CAI. Os faróis e as
//            lanternas do lado batido quebram; as batidas feias estouram o vidro da frente, de trás ou das janelas.
//   QUEDA    a peça some do carro e vira um DESTROÇO (só visual, como o jogador escolheu): sai com a velocidade do carro mais o tranco,
//            gira, quica no chão e some em ~10 s (no máximo MAX ao mesmo tempo). O destroço é a própria peça do modelo desenhada numa
//            instância a mais (CarArt3D.debris) — sem malha nova, sem desenho a mais.
//   EXPLOSÃO (CarDamage._explode → explode): o capô voa, as portas e a tampa saem ou ficam penduradas, tudo amassa, faróis e vidros
//            quebram.
//   PORTAS   abrir e fechar ao entrar e sair (CarDoors → doorOpen): gira a porta do PRÓPRIO modelo; o capô e a tampa abrem pelo E do
//            CarCare (setOpen).
//   CONSERTO a funilaria (CarCare, Pay n Pay, mecânico do morro, desmanche) devolve a vida e zera o amassado: aqui as peças voltam
//            (o carro reparado sem amassado e com a vida cheia é reconhecido sozinho, venha de onde vier o conserto).
// O BLINDADO (spec.armored) só amassa (pouco): nenhuma peça destrava ou cai e os faróis aguentam.
// Só os carros com alguma peça mexida ou batida estão em `cars` (o resto não custa nada).
// ============================================================================

const CarParts = {
	MAX: 24,                     // destroços ao mesmo tempo
	LIFE: 10,                    // s até o destroço sumir
	cars: new Set(),
	debris: [],
	// peça → índice (peça − 7) e onde o ângulo dela vai no ator (Car3DActor.pa / pb)
	SLOT: { 7: ['pb', 0], 8: ['pb', 1], 9: ['pa', 0], 10: ['pa', 1], 11: ['pa', 2], 12: ['pa', 3], 13: ['pb', 2], 14: ['pb', 3], 15: ['pb', 1], 16: ['pb', 1] },

	parts(car) {
		const v = car && car.visual;
		if (!v || !v.pa || typeof CarArt3D === 'undefined') return null;
		const D = CarArt3D._defs && CarArt3D._defs[v.modelId];
		return D && D.parts ? D.parts : null;
	},
	// O estado do carro (criado na 1ª vez): vida de cada peça, estado (0 presa · 1 solta · 2 caiu), ângulo e velocidade do balanço,
	// a abertura pedida (porta ao entrar, capô no CarCare), o amassado por região e os faróis/lanternas quebrados.
	state(car) {
		const P = this.parts(car);
		if (car._parts && car._parts.P === P) { this.cars.add(car); return car._parts; }      // (trocou de modelo: estado novo)
		if (!P) return null;
		const S = car._parts = { P, hp: new Float32Array(17).fill(1), st: new Uint8Array(17), ang: new Float32Array(17), vel: new Float32Array(17), open: new Float32Array(17), zone: [0, 0, 0, 0], lamps: 0, scrape: new Float32Array(17), hit: false, seed: Math.random() * 1000 };
		this.cars.add(car);
		return S;
	},

	// ---------------------------------------------------------------- batida
	// (ix, iz): direção NO MUNDO, do centro do carro para o ponto batido. dmg: o dano da batida (vida do carro).
	hit(car, ix, iz, dmg) {
		if (!car || car.isBike || car.isBoat || dmg <= 0) return;
		const S = this.state(car);
		if (!S) return;
		const f = car.body.getDirection(BABYLON.Axis.Z), l = Math.hypot(f.x, f.z) || 1, fx = f.x / l, fz = f.z / l;
		const il = Math.hypot(ix, iz) || 1, lz = (ix * fx + iz * fz) / il, lx = (ix * fz - iz * fx) / il;      // (frente +, direita +)
		const arm = !!car.spec.armored, k = Math.min(1.5, dmg / Math.max(30, car.maxHp || 100));
		// o lado: o carro é comprido, então a lateral só ganha quando o golpe é bem de lado
		const wF = Math.max(0, lz) ** 2, wR = Math.max(0, -lz) ** 2, wL = Math.max(0, -lx) ** 2 * 1.3, wD = Math.max(0, lx) ** 2 * 1.3, sw = wF + wR + wL + wD || 1;
		const W = [wF / sw, wR / sw, wL / sw, wD / sw], gain = arm ? 0.7 : 2.1;
		for (let i = 0; i < 4; i++) S.zone[i] = Math.min(arm ? 0.45 : 1, S.zone[i] + W[i] * k * gain);
		S.hit = true;
		if (arm) return;
		// as peças da região (peso por região: frente, traseira, esquerda, direita); a lateral divide entre a porta da frente e a de trás
		const front = Math.random() < 0.55;
		const WP = { 7: [1, 0, 0.12, 0.12], 8: [0, 1, 0.12, 0.12], 9: [0.18, 0, front ? 1 : 0.45, 0], 10: [0.18, 0, 0, front ? 1 : 0.45], 11: [0, 0.12, front ? 0.45 : 1, 0], 12: [0, 0.12, 0, front ? 0.45 : 1], 13: [1.25, 0, 0.2, 0.2], 14: [0, 1.25, 0.2, 0.2], 15: [0, 1, 0.3, 0], 16: [0, 1, 0, 0.3] };
		for (const code of Object.keys(S.P)) {
			const c = +code, w = WP[c];
			if (!w || S.st[c] === 2) continue;
			const d = (w[0] * W[0] + w[1] * W[1] + w[2] * W[2] + w[3] * W[3]) * k * 2.4 * (0.75 + Math.random() * 0.5);
			if (d <= 0.01) continue;
			S.hp[c] -= d;
			if (S.hp[c] <= 0) this.detach(car, c, ix / il, iz / il, Math.min(14, 4 + k * 10));
			else if (S.hp[c] < 0.55 && S.st[c] === 0) { S.st[c] = 1; S.vel[c] += (S.P[c].t === 2 ? 1 : 2.5) * (0.5 + Math.random()); }
		}
		// faróis (na frente) e lanternas (atrás) do lado batido
		const side = lx < 0 ? 0 : 1;
		if (W[0] * k > 0.12) S.lamps |= side ? 65536 : 32768;
		if (W[0] * k > 0.35) S.lamps |= 32768 | 65536;
		if (W[1] * k > 0.12) S.lamps |= side ? 262144 : 131072;
		if (W[1] * k > 0.35) S.lamps |= 131072 | 262144;
		// vidros: a batida feia estoura o da frente / de trás / as janelas do lado (Vehicle.breakGlass: 0 frente, 1 trás, 2..5 janelas)
		if (car.breakGlass) {
			if (S.zone[0] > 0.75 && W[0] > 0.4) car.breakGlass(0);
			if (S.zone[1] > 0.75 && W[1] > 0.4) car.breakGlass(1);
			if (S.zone[2] > 0.6 && W[2] > 0.4) car.breakGlass(Math.random() < 0.6 ? 2 : 4);
			if (S.zone[3] > 0.6 && W[3] > 0.4) car.breakGlass(Math.random() < 0.6 ? 3 : 5);
		}
	},

	// A peça `code` cai: some do carro e vira destroço, saindo com a velocidade do carro + o tranco (dx, dz: para onde, power m/s).
	detach(car, code, dx = 0, dz = 0, power = 4) {
		const S = this.state(car);
		if (!S || S.st[code] === 2 || !S.P[code]) return;
		S.st[code] = 2; S.hp[code] = 0; S.ang[code] = 0; S.vel[code] = 0;
		const v = car.visual, P = S.P[code], k = v.k || 1, h = v.heading, s = Math.sin(h), c = Math.cos(h);
		// (o destroço gira em volta do CENTRO da peça; o eixo mais fino dela é o que fica em pé quando ela deita no chão)
		const px = P.c[0] * k, pz = P.c[2] * k, gy = typeof Relief !== 'undefined' && Relief.on ? Relief.at(v.x, v.z) : 0;
		const x = v.x + px * c + pz * s, z = v.z - px * s + pz * c, y = v.y - 1.5 + gy + P.c[1] * k;
		const H = P.h, ti = H[0] <= H[1] && H[0] <= H[2] ? 0 : H[1] <= H[2] ? 1 : 2;
		const cv = car.phys && car.phys.getLinearVelocity ? car.phys.getLinearVelocity() : null;
		// para fora do carro, do lado da peça (porta: o lado dela; capô: para cima e para a frente; para-choque: para o lado dele)
		let ox = P.c[0] * c + P.c[2] * s, oz = -P.c[0] * s + P.c[2] * c;
		const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
		const up = code === 7 ? 4.5 + power * 0.35 : 1.5 + Math.random() * 2;
		const b = {
			model: v.modelId, k: code - 7, variant: v.variant, s: k, fade: 1, t: 0,
			x, y, z, vx: (cv ? cv.x : 0) * 0.85 + (ox * 0.6 + dx * 0.4) * power, vy: up, vz: (cv ? cv.z : 0) * 0.85 + (oz * 0.6 + dz * 0.4) * power,
			q: [0, Math.sin(h / 2), 0, Math.cos(h / 2)], w: [(Math.random() - 0.5) * 7, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 7],
			off: [P.c[0] - P.p[0], P.c[1] - P.p[1], P.c[2] - P.p[2]], thin: ti, rest: Math.min(0.25, H[ti] * k) + 0.03,
		};
		if (this.debris.length >= this.MAX) this.debris.shift();
		this.debris.push(b);
		if (typeof AudioFX !== 'undefined' && AudioFX.crash) AudioFX.crash(x, z, 0.35);
	},

	// Explosão: o capô voa, as portas e as tampas saem ou ficam penduradas, tudo amassa, faróis quebram.
	explode(car) {
		const S = this.state(car);
		if (!S) return;
		for (let i = 0; i < 4; i++) S.zone[i] = Math.max(S.zone[i], 0.5 + Math.random() * 0.35);
		S.lamps = 32768 | 65536 | 131072 | 262144; S.hit = true;
		if (car.spec.armored) return;
		const left = Object.keys(S.P).map(Number).filter((c) => S.st[c] !== 2);
		let flew = 0;
		for (const c of left) {
			const r = Math.random(), out = c === 7 ? 0.85 : c === 13 || c === 14 ? 0.45 : 0.4;
			if (r < out) { this.detach(car, c, 0, 0, c === 7 ? 9 : 6 + Math.random() * 4); flew++; }
			else { S.st[c] = 1; S.hp[c] = 0.2; S.vel[c] += 4; }
		}
		// (sempre voa alguma coisa: o capô se ainda estiver lá, senão uma peça qualquer das que sobraram)
		if (!flew && left.length) { const c = left.includes(7) ? 7 : left[Math.floor(Math.random() * left.length)]; this.detach(car, c, 0, 0, c === 7 ? 9 : 7); }
	},

	// Conserto: tudo volta (as peças caídas também, como no Pay 'n' Spray).
	repair(car) {
		const S = car._parts;
		if (!S) return;
		S.hp.fill(1); S.st.fill(0); S.ang.fill(0); S.vel.fill(0); S.scrape.fill(0);
		S.zone[0] = S.zone[1] = S.zone[2] = S.zone[3] = 0; S.lamps = 0; S.hit = false;
	},

	// Abertura pedida (0..1 do ângulo máximo): a porta ao entrar/sair (CarDoors), o capô e a tampa no CarCare.
	setOpen(car, code, t) {
		const S = this.state(car);
		if (S && S.P[code]) S.open[code] = Math.max(0, Math.min(1, t));
	},
	// O jogador abriu o CAPÔ ou o PORTA-MALAS (E no CarCare: o mecânico / o baú): a peça abre e fica aberta enquanto ele está a pé
	// perto do carro; ao se afastar (ou entrar num veículo) ela fecha. No furgão, o porta-malas são as duas portas de trás.
	lid(game, car, end) {
		const S = this.state(car);
		if (!S) return;
		const codes = end === 'hood' ? [7] : S.P[8] ? [8] : [15, 16];
		S.lid = codes.filter((c) => S.P[c]);
		if (S.lid.length && typeof AudioFX !== 'undefined' && AudioFX.door) AudioFX.door(car.position.x, car.position.z, true);
	},
	_lid(car, S, h, game) {
		if (!S.lid) return;
		const pl = game && game.player, near = pl && !game.activeCar && Math.hypot(pl.position.x - car.position.x, pl.position.z - car.position.z) < (car.halfLen || 2.2) + 1.6;
		let any = false;
		for (const c of S.lid) {
			S.open[c] = Math.max(0, Math.min(1, S.open[c] + (near ? 1.6 : -2.2) * h));
			if (S.open[c] > 0) any = true;
		}
		if (!near && !any) { if (typeof AudioFX !== 'undefined' && AudioFX.door) AudioFX.door(car.position.x, car.position.z, false); S.lid = null; }
	},

	// A porta da FRENTE do lado `sign` (−1 esquerda, +1 direita) aberta em t (CarDoors). false = o modelo não tem essa porta.
	doorOpen(car, sign, t) {
		const code = sign < 0 ? 9 : 10, P = this.parts(car);
		if (!P || !P[code]) return false;
		this.setOpen(car, code, t);
		return true;
	},

	// ---------------------------------------------------------------- por quadro
	update(dt, game) {
		if (dt <= 0) return;
		const h = Math.min(dt, 1 / 30);
		for (const car of this.cars) {
			const S = car._parts, v = car.visual;
			if (!S || !v || !v.pa || v._disposed || car._removed) { this.cars.delete(car); continue; }
			// consertado (vida cheia e sem amassado, venha de onde vier o conserto): as peças voltam
			if (S.hit && car.hp >= car.maxHp - 0.01 && !car.dent && !car.wrecked && !car.burning) this.repair(car);
			this._lid(car, S, dt, game);
			this._swing(car, S, h);
			this._write(car, S, v);
			if (!S.hit && !S.lid && !S.open.some((x) => x > 0)) this.cars.delete(car);      // (nada mexido: sai da lista; o ator fica zerado)
		}
		this._debris(dt);
		if (typeof CarArt3D !== 'undefined') CarArt3D.debris = this.debris;
	},

	// O balanço das peças SOLTAS (mola fraca, atrito, batente nas duas pontas), empurradas pelo movimento do carro: a freada abre a
	// porta (a ponta solta continua indo para a frente), a arrancada fecha; a curva abre a porta de fora; o vento em velocidade fecha a
	// porta, LEVANTA o capô e fecha a tampa; os trancos do asfalto fazem tudo pular; a tampa da caçamba cai aberta. O para-choque solto
	// pende, balança e — raspando no chão com o carro andando — acaba caindo.
	_swing(car, S, h) {
		const sp = car.speed || 0, aF = car._aF || 0, aL = car._aL || 0;
		const g = car._partT = (car._partT || 0) + h;
		for (const code of Object.keys(S.P)) {
			const c = +code, P = S.P[c];
			if (S.st[c] !== 1) { S.ang[c] = 0; S.vel[c] = 0; continue; }
			const max = P.t === 1 ? 1 : P.m;
			let acc = 0;
			const jig = Math.sin(g * 17.3 + c * 3.1 + S.seed) * Math.sin(g * 5.7 + c) * Math.min(1, sp / 14) * 9;
			if (c >= 9 && c <= 12) {                                                     // portas (dobradiça na frente)
				const out = c % 2 === 1 ? -aL : aL;                                       // (9 e 11 à esquerda: a curva para a direita abre)
				acc = -aF * 1.6 + out * 0.9 - 0.012 * sp * sp * Math.sin(S.ang[c]) + jig;
			} else if (c === 7) acc = 0.016 * sp * sp * (1 - S.ang[c] / max) - 9 * Math.cos(S.ang[c]) * 0.35 + jig * 1.4;          // capô: o vento levanta
			else if (c === 8 && P.a[0] < 0 && P.t === 0 && P.p[1] < 0.9) acc = 9 * Math.sin(Math.max(0.15, S.ang[c])) * 0.8 + jig;   // tampa da caçamba: cai aberta
			else if (c === 8) acc = -0.01 * sp * sp - 9 * Math.cos(S.ang[c]) * 0.3 + jig * 1.6;                                        // porta-malas / tampa
			else if (c === 15 || c === 16) acc = aF * 1.4 + jig;                                                                       // portas de trás do furgão
			else if (c === 13 || c === 14) {                                                                                           // para-choque pendendo
				const want = 0.32 * (c === 13 ? 1 : -1) * (S.seed % 2 < 1 ? 1 : -1);
				acc = (want - S.ang[c]) * 30 + jig * 0.5;
				if (sp > 9) { S.scrape[c] += h * (sp / 15); if (S.scrape[c] > 5 + (S.seed % 4)) { this.detach(car, c, 0, 0, 2); continue; } }
				S.vel[c] += acc * h; S.vel[c] *= Math.exp(-4 * h); S.ang[c] += S.vel[c] * h;
				continue;
			}
			S.vel[c] += acc * h; S.vel[c] *= Math.exp(-1.6 * h);
			S.ang[c] += S.vel[c] * h;
			if (S.ang[c] < 0) { S.ang[c] = 0; S.vel[c] = Math.abs(S.vel[c]) * 0.35; }           // bate fechando (e volta um pouco)
			if (S.ang[c] > max) { S.ang[c] = max; S.vel[c] = -Math.abs(S.vel[c]) * 0.3; }        // bate no batente
		}
	},

	// Passa o estado para o ator (o shader do carro gira as peças, esconde as caídas, amassa e apaga as lâmpadas).
	_write(car, S, v) {
		v.pa[0] = v.pa[1] = v.pa[2] = v.pa[3] = 0; v.pb[0] = v.pb[1] = v.pb[2] = v.pb[3] = 0;
		let gone = 0;
		for (const code of Object.keys(S.P)) {
			const c = +code, P = S.P[c], slot = this.SLOT[c];
			if (S.st[c] === 2) { gone += 2 ** (c - 7); continue; }
			if (!slot) continue;
			const max = P.t === 1 ? 1 : P.m, want = Math.max(S.ang[c], S.open[c] * max);
			const A = v[slot[0]];
			A[slot[1]] = P.t === 2 ? S.ang[c] : Math.max(A[slot[1]], want);
		}
		v.gone = gone;
		v.pc[0] = S.zone[0]; v.pc[1] = S.zone[1]; v.pc[2] = S.zone[2]; v.pc[3] = S.zone[3];
		v.lampBits = S.lamps;
	},

	// Os destroços: gravidade, o chão (com o relevo), quicam, rolam e param; somem encolhendo no último segundo.
	// (em passos de no máximo 1/30 s: com o quadro lento a peça cai no mesmo tempo, sem câmera lenta)
	_debris(dt) {
		const D = this.debris, n = Math.max(1, Math.min(6, Math.ceil(dt * 30 - 1e-6))), h = Math.min(dt, 6 / 30) / n;
		for (let i = D.length - 1; i >= 0; i--) {
			const b = D[i];
			b.t += dt;
			if (b.t > this.LIFE) { D.splice(i, 1); continue; }
			b.fade = Math.min(1, (this.LIFE - b.t) / 0.8);
			for (let k = 0; k < n && !b.still; k++) this._step(b, h);
		}
	},
	_step(b, h) {
		b.vy -= 9.8 * h;
		b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
		const gy = (typeof Relief !== 'undefined' && Relief.on ? Relief.at(b.x, b.z) : 0) + b.rest;
		if (b.y < gy) {
			b.y = gy;
			if (b.vy < -1.2) { b.vy = -b.vy * 0.28; b.w[0] *= 0.55; b.w[2] *= 0.55; }
			else b.vy = 0;
			b.vx *= 0.82; b.vz *= 0.82; b.w[1] *= 0.8;
			// no chão, a peça vai deitando (o giro em volta dos eixos de lado some)
			b.w[0] *= 0.9; b.w[2] *= 0.9;
			// e DEITA: o eixo fino da peça vai para a vertical (a porta, o capô e a tampa param de chapa no chão, não em pé)
			const flat = this._flatten(b, h);
			if (flat && Math.hypot(b.vx, b.vz) < 0.15 && Math.abs(b.vy) < 0.1) { b.still = true; return; }
		}
		// integra o giro: q += ½ (0, w) q dt
		const [qx, qy, qz, qw] = b.q, [wx, wy, wz] = b.w, k = 0.5 * h;
		const nx = qx + k * (wx * qw + wy * qz - wz * qy), ny = qy + k * (wy * qw + wz * qx - wx * qz), nz = qz + k * (wz * qw + wx * qy - wy * qx), nw = qw - k * (wx * qx + wy * qy + wz * qz);
		const l = Math.hypot(nx, ny, nz, nw) || 1;
		b.q[0] = nx / l; b.q[1] = ny / l; b.q[2] = nz / l; b.q[3] = nw / l;
	},

	// Gira a peça um pouco (em volta de um eixo horizontal) para o eixo fino dela ficar em pé. true = já está deitada.
	_flatten(b, h) {
		const [x, y, z, w] = b.q, t = b.thin;
		// a imagem do eixo t da peça (linha t da matriz de rotação)
		const a = t === 0 ? [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)]
			: t === 1 ? [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)]
				: [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)];
		const sy = a[1] >= 0 ? 1 : -1, cx = -a[2] * sy, cz = a[0] * sy, sn = Math.hypot(cx, cz);
		if (sn < 0.04) return true;
		const ang = Math.min(Math.asin(Math.min(1, sn)), 3 * h) * 0.5, si = Math.sin(ang) / sn, rx = cx * si, rz = cz * si, rw = Math.cos(ang);
		// q ← r · q (r: o giro no mundo)
		const nx = rw * x + rx * w - rz * y, ny = rw * y - rx * z + rz * x, nz = rw * z + rx * y + rz * w, nw = rw * w - rx * x - rz * z;
		const l = Math.hypot(nx, ny, nz, nw) || 1;
		b.q[0] = nx / l; b.q[1] = ny / l; b.q[2] = nz / l; b.q[3] = nw / l;
		return false;
	},

	stats() { return { cars: this.cars.size, debris: this.debris.length }; },
};
