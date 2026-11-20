// ============================================================================
// StreetReact — a rua REAGE ao jogador dirigindo, buzinando e atirando (Config.react):
//   • SAI DA FRENTE: o carro do jogador vindo na direção de um pedestre (na pista ou na calçada, a mais de `minSpeed` m/s): depois de
//     um tempo de reação (reactT, sorteado por pessoa) ele pula para o lado de fora da trajetória (NPC.dodge) e foge, xingando às
//     vezes. Quem não teve tempo é atropelado como sempre; uns poucos (`freeze`) travam de susto.
//   • BUZINA (o jogador, H / L3): quem está na frente ou rente ao carro sai do caminho na hora; quem está perto olha e reclama. O
//     carro da cidade parado na frente (sem ser o sinal vermelho) às vezes buzina de volta.
//   • TIRO (NPCManager.alertShot — do jogador ou de qualquer um): os motoristas da cidade que ouvem entram em PÂNICO por uns segundos
//     (TrafficCar._scared): aceleram, furam o sinal e buzinam.
// ============================================================================

const StreetReact = {
	stats: { dodges: 0, hornDodges: 0, hornBack: 0, scared: 0 },      // (testes)
	LINES: {
		car: ['Tá maluco?!', 'Olha o carro!', 'Quer me matar?!', 'Aprende a dirigir!', 'Ô barbeiro!', 'Tá cego?!'],
		horn: ['Calma!', 'Tá com pressa?!', 'Já vai, já vai!', 'Buzina pra tua mãe!', 'Que isso, meu irmão?!'],
		look: ['Que isso?!', 'Calma aí!', 'Ih, que estresse…'],
		back: ['Tá vendo o trânsito não?!', 'Vai voar por cima?!', 'Calma, maluco!'],
	},
	_pick(L) { return L[Math.floor(Math.random() * L.length)]; },
	_t: 0,

	// A cada quadro (Game): o carro do jogador vindo nos pedestres.
	update(g, dt) {
		const R = Config.react;
		if (!R || !g.npcManager || g.mode !== 'car') return;
		this._t -= dt;
		if (this._t > 0) return;
		const step = 0.1; this._t = step;
		const car = g.activeCar;
		if (!car || car.isBoat || (car.spec && car.spec.boat)) return;
		const v = car.velocity, sp = Math.hypot(v.x, v.z);
		if (sp < R.minSpeed) return;
		const P = car.position, ux = v.x / sp, uz = v.z / sp, range = sp * R.lookTime + (car.halfLen || 2) + 2, wide = (car.halfW || 1) + R.margin;
		for (const n of g.npcManager.npcs) {
			if (!n.alive || n.rag || n._dodge || n.free) continue;
			const dx = n.position.x - P.x, dz = n.position.z - P.z;
			if (Math.abs(dx) > range || Math.abs(dz) > range) { n._carSeen = 0; continue; }
			const along = dx * ux + dz * uz, lat = dx * uz - dz * ux;
			if (along < 0 || along > range || Math.abs(lat) > wide) { n._carSeen = 0; continue; }
			if (!Vehicle.sameLevel(n, car)) continue;
			if (!n._carSeen) { n._react = R.reactT[0] + Math.random() * (R.reactT[1] - R.reactT[0]); n._froze = Math.random() < R.freeze; }
			n._carSeen = (n._carSeen || 0) + step;
			const tti = (along - (car.halfLen || 2)) / sp;
			if (n._froze || n._carSeen < n._react || tti < 0.12) continue;      // (travou de susto / ainda não viu / tarde demais)
			this._dodgeFrom(n, P, ux, uz, lat, wide, Math.random() < R.sayChance ? this._pick(this.LINES.car) : null) && this.stats.dodges++;
		}
	},
	// Pula para o lado de fora da trajetória (lat: de que lado ele está; quase no meio: um lado qualquer).
	_dodgeFrom(n, P, ux, uz, lat, wide, say) {
		const side = Math.abs(lat) < 0.2 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(lat);
		const dist = Math.max(1.6, Math.min(3.6, wide - Math.abs(lat) + 0.9));
		return n.dodge(uz * side, -ux * side, P, dist, say);
	},

	// O jogador buzinou (Game: H no carro / L3).
	onHorn(g, car) {
		const R = Config.react;
		if (!R || !car || !g.npcManager) return;
		const P = car.position, f = car.fwdToRef ? car.fwdToRef(this._f || (this._f = new BABYLON.Vector3())) : null;
		if (!f) return;
		const fl = Math.hypot(f.x, f.z) || 1, ux = f.x / fl, uz = f.z / fl, wide = (car.halfW || 1) + R.hornMargin;
		for (const n of g.npcManager.npcs) {
			if (!n.alive || n.rag || n._dodge || n.free) continue;
			const dx = n.position.x - P.x, dz = n.position.z - P.z, d = Math.hypot(dx, dz);
			if (d > R.hornRange) continue;
			const along = dx * ux + dz * uz, lat = dx * uz - dz * ux;
			if (along > -1 && along < R.hornRange && Math.abs(lat) < wide) {
				if (this._dodgeFrom(n, P, ux, uz, lat, wide, Math.random() < 0.6 ? this._pick(this.LINES.horn) : null)) this.stats.hornDodges++;
			} else if (d < R.hornLook && Math.random() < 0.3 && typeof Bubbles !== 'undefined') Bubbles.say(n, this._pick(this.LINES.look), { tone: 'talk', ms: 1800, key: 'horn' + n.id });
		}
		// o carro da cidade parado na frente (sem ser o sinal) buzina de volta
		const vm = g.vehicleManager;
		if (!vm) return;
		for (const c of vm.vehicles) {
			if (c === car || c.controlled || c.mode !== 'drive' || c.role || c.reason === 'sinal' || !(c.speed < 2)) continue;
			const dx = c.position.x - P.x, dz = c.position.z - P.z, along = dx * ux + dz * uz, lat = dx * uz - dz * ux;
			if (along < 3 || along > 22 || Math.abs(lat) > 3) continue;
			if (Math.random() >= R.hornBack) continue;
			this.stats.hornBack++;
			setTimeout(() => { if (c.destroyed) return; AudioFX.honk(c.position.x, c.position.z, 0.85 + Math.random() * 0.3, 0.45); if (typeof Bubbles !== 'undefined') Bubbles.say(c, this._pick(this.LINES.back), { tone: 'angry', ms: 2000, y: 1.6 }); }, 450);
			break;
		}
	},

	// Tiro em (x, z) (NPCManager.alertShot): os motoristas da cidade que ouvem entram em pânico.
	onShot(g, pos) {
		const R = Config.react, vm = g && g.vehicleManager;
		if (!R || !vm) return;
		for (const c of vm.vehicles) {
			if (c.controlled || c.mode !== 'drive' || c.role || c.driver === false || c.driverDead || !c.aiUpdate) continue;
			const d = Math.hypot(c.position.x - pos.x, c.position.z - pos.z);
			if (d > R.shotRadius) continue;
			if (!(c._scared > 0)) { this.stats.scared++; if (Math.random() < 0.35) setTimeout(() => { if (!c.destroyed) AudioFX.honk(c.position.x, c.position.z, 0.9 + Math.random() * 0.3, 0.6); }, 200 + Math.random() * 600); }
			c._scared = R.scaredTime[0] + Math.random() * (R.scaredTime[1] - R.scaredTime[0]);
		}
	},
};
