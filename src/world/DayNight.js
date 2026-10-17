// ============================================================================
// DayNight — ciclo dia/noite. Interpola "pontos do dia" e aplica em:
//   luzes (sol/lua e céu) e direção do sol (muda o comprimento das sombras) |
//   cor ambiente dos SPRITES (tint compartilhado) | janelas acesas e postes de rua |
//   faróis dos carros (via `night`, lido pelo CarLights).
// `night` vai de 0 (dia) a 1 (noite fechada).
// ============================================================================

class DayNight {
	static get EDGE_DIM() { return 0.35; }          // 2.5D edge cut colour = the background colour × this
	constructor(gameEngine) {
		this.ge = gameEngine;
		this.hour = Config.time.start;
		this.night = 0;
		this.sunI = 1;
		this._lastNight = -1;
		this.apply();
	}

	// Pontos do dia: [hora, parâmetros]. Entre dois pontos tudo é interpolado.
	static get KEYS() {
		const night = { sunI: 0.16, sunC: [0.45, 0.55, 1.0], sunH: 1.1, hemiI: 0.34, hemiC: [0.5, 0.56, 0.9], gnd: [0.2, 0.22, 0.38], tint: [0.44, 0.5, 0.75], n: 1, clear: [0.02, 0.04, 0.1] };
		const day = (sunI, sunH, tint, sunC) => ({ sunI, sunC, sunH, hemiI: 0.46, hemiC: [1, 1, 1], gnd: [0.5, 0.52, 0.65], tint, n: 0, clear: [0.16, 0.38, 0.52] });
		return [
			[0.0, night],
			[5.0, night],
			[6.2, { sunI: 0.38, sunC: [1.0, 0.62, 0.42], sunH: 0.55, hemiI: 0.38, hemiC: [0.95, 0.82, 0.9], gnd: [0.42, 0.4, 0.55], tint: [0.85, 0.78, 0.85], n: 0.55, clear: [0.3, 0.36, 0.5] }],
			[8.0, day(0.62, 1.3, [1, 0.99, 0.96], [1.0, 0.93, 0.8])],
			[12.0, day(0.68, 2.2, [1, 1, 1], [1.0, 0.98, 0.92])],
			[16.5, day(0.66, 1.5, [1, 0.98, 0.93], [1.0, 0.94, 0.8])],
			[18.4, { sunI: 0.42, sunC: [1.0, 0.56, 0.32], sunH: 0.5, hemiI: 0.36, hemiC: [0.95, 0.8, 0.82], gnd: [0.42, 0.38, 0.5], tint: [0.92, 0.76, 0.76], n: 0.45, clear: [0.3, 0.3, 0.42] }],
			[19.8, { sunI: 0.2, sunC: [0.7, 0.5, 0.7], sunH: 0.9, hemiI: 0.32, hemiC: [0.6, 0.6, 0.88], gnd: [0.25, 0.26, 0.42], tint: [0.55, 0.58, 0.8], n: 0.95, clear: [0.05, 0.07, 0.15] }],
			[24.0, night],
		];
	}

	_params(h) {
		const K = DayNight.KEYS;
		let i = 0;
		while (i < K.length - 2 && h > K[i + 1][0]) i++;
		const [h0, a] = K[i], [h1, b] = K[i + 1];
		const t = Math.max(0, Math.min(1, (h - h0) / (h1 - h0)));
		const mix = (x, y) => Array.isArray(x) ? x.map((v, k) => v + (y[k] - v) * t) : x + (y - x) * t;
		const out = {};
		for (const k of Object.keys(a)) out[k] = mix(a[k], b[k]);
		return out;
	}

	// Avança o relógio (24h = Config.time.cycleSeconds) e aplica.
	update(dt) {
		this.hour = (this.hour + (dt * 24) / Config.time.cycleSeconds) % 24;
		this.apply();
	}

	skip(hours) {
		this.hour = (this.hour + hours) % 24;
		this.apply();
	}

	// Tempo fechado (Weather): escurece o sol, esfria e acinzenta as cores, acende postes/janelas/faróis com chuva forte e, no
	// relâmpago, ilumina o mundo por um instante. Devolve a intensidade do sol SEM o clarão (para o mapa de sombras).
	_weather(P) {
		const W = Weather.cur, k = W ? W.k : 0, fl = W ? W.flash : 0;
		if (k <= 0.001 && fl <= 0.001) return P.sunI;
		const to = (v, c, a) => v.map((x, i) => x + (c[i] - x) * a);
		P.sunI = P.sunI >= 0.3 ? Math.max(0.27, P.sunI * (1 - 0.58 * k)) : P.sunI * (1 - 0.4 * k);
		P.hemiI *= 1 - 0.1 * k;
		P.sunC = to(P.sunC, [0.62, 0.7, 0.85], 0.5 * k);
		P.hemiC = to(P.hemiC, [0.66, 0.72, 0.86], 0.5 * k);
		P.tint = to(P.tint, [0.6, 0.66, 0.78], 0.55 * k).map((v) => v * (1 - 0.12 * k));
		P.clear = to(P.clear, [0.08, 0.11, 0.16], 0.7 * k);
		P.n = Math.max(P.n, 0.55 * k);
		const shadowI = P.sunI;
		if (fl > 0.001) {                                       // relâmpago
			P.hemiI += fl * 0.9; P.sunI += fl * 0.5;
			P.tint = P.tint.map((v) => Math.min(1.4, v + fl * 0.6));
			P.hemiC = to(P.hemiC, [0.85, 0.9, 1], Math.min(1, fl));
		}
		return shadowI;
	}

	apply() {
		const P = this._params(this.hour);
		const ge = this.ge;
		const shadowI = this._weather(P);
		this.night = P.n;
		this.sunI = P.sunI;

		const hemi = ge.scene.getLightByName('hemi');
		hemi.intensity = P.hemiI;
		hemi.diffuse.copyFromFloats(...P.hemiC);
		hemi.groundColor.copyFromFloats(...P.gnd);

		// Sol: azimute fixo (noroeste), altura muda -> sombras longas no amanhecer/entardecer.
		const dir = new BABYLON.Vector3(0.6, -P.sunH, -0.45).normalize();
		ge.sunDir.copyFrom(dir);
		ge.sun.direction.copyFrom(dir);
		ge.sun.intensity = P.sunI;
		ge.sun.diffuse.copyFromFloats(...P.sunC);
		MapGeo.setSun(dir, P.sunI);
		CarArt.setSun(dir, P.sunI, P.sunC);                 // relevo dos carros: iluminados pelo mesmo sol

		// Sem sol (noite) a passada de sombra é custo à toa: congela o mapa de sombras.
		const sm = ge.shadowGenerator.getShadowMap();
		const wantShadows = shadowI >= 0.25 && !this.forceNoShadows;      // (forceNoShadows: AutoQuality, aparelho fraco)
		if (this._shadowsOn !== wantShadows) { this._shadowsOn = wantShadows; sm.refreshRate = wantShadows ? 1 : 0; }
		// Chuva: sombras mais fracas. Ao anoitecer elas desvanecem (darkness -> 1 = invisivel) ANTES de congelar o mapa; senao o mapa
		// congelado ficava pintado no chao como uma 'marca d'agua' de sombras velhas (e nao acompanhava mais sol nem camera).
		const fade = this.forceNoShadows ? 0 : Math.max(0, Math.min(1, (shadowI - 0.25) / 0.17));
		const dark = Math.round((1 - (1 - (0.4 + 0.4 * (Weather.cur ? Weather.cur.k : 0))) * fade) * 100) / 100;
		if (this._shadowDark !== dark) { this._shadowDark = dark; ge.shadowGenerator.setDarkness(dark); }

		SpriteMaterial.sharedTint().copyFromFloats(...P.tint);
		ge.scene.clearColor.set(P.clear[0], P.clear[1], P.clear[2], 1);
		ge.scene.fogColor.set(P.clear[0] * DayNight.EDGE_DIM, P.clear[1] * DayNight.EDGE_DIM, P.clear[2] * DayNight.EDGE_DIM);      // (the 2.5D edge cut: a darker background)

		// Janelas e postes só quando a noite mudou de verdade (evita reenviar buffers à toa).
		if (Math.abs(P.n - this._lastNight) > 0.015) {
			this._lastNight = P.n;
			ge.world.setNight(P.n);
		}
	}

	// "HH:MM"
	get label() {
		const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
		return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
	}
}
memoStatics(DayNight, 'KEYS');
