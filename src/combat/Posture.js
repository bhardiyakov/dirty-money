// ============================================================================
// Posture — o EQUILÍBRIO de quem briga (Config.posture). Golpe não tira só vida: gasta a barra oculta de equilíbrio do NPC. Zerou:
//   • golpe LEVE (soco, faca, bala) → ATORDOADO por `stun` s (cambaleia, 😵): não ataca, apanha mais (× stunDmg) e o próximo golpe pesado
//     o derruba;
//   • golpe PESADO (chute, taco, cassetete) → ARREMESSADO (Ragdoll com força `knock`): voa, desliza e, se bater numa parede ou num carro
//     forte o bastante, fica PRENSADO (Ragdoll._move → NPC._wallSplat).
// Acertar alguém durante a ANTECIPAÇÃO do golpe dele (FightState.windup) é CONTRA-ATAQUE: gasta × counter e cancela o golpe dele.
// Sem apanhar por regenDelay s, a barra volta regen/s (FightState.update chama tick).
//   hit(t, kind)      → null (não briga) | { broken, heavy, counter } — já descontado
//   stunned(t)        atordoado agora?        prone(t)   caído no chão (deslizando ou parado)?
// ============================================================================

const Posture = {
	HEAVY: { kick: 1, swing: 1, baton: 1 },
	maxOf(t) {
		const P = Config.posture.max, S = t.fsm && t.fsm.current;
		return t.mugger || t.gang || (S && S.armed && S.armed !== 'none') ? P.tough : P.civil;
	},
	// (só quem está numa briga — FightState — tem a barra; o pedestre comum continua como antes)
	_fight(t) { const S = t && t.fsm && t.fsm.current; return S && S.name === 'FIGHT' ? S : null; },
	hit(t, kind) {
		const S = this._fight(t);
		if (!S) return null;
		const C = Config.posture, counter = S.windup > 0, heavy = !!this.HEAVY[kind];
		if (t._poise == null) t._poise = this.maxOf(t);
		const cost = (C.cost[kind] || C.cost.punch) * (counter ? C.counter : 1);
		t._poise -= cost; t._poiseIdle = 0;
		let broken = false;
		if (t._poise <= 0) { broken = true; t._poise = this.maxOf(t); }
		return { broken, heavy, counter, stunned: S.stun > 0 };
	},
	tick(t, dt) {
		if (t._poise == null) return;
		t._poiseIdle = (t._poiseIdle || 0) + dt;
		const C = Config.posture, M = this.maxOf(t);
		if (t._poiseIdle > C.regenDelay && t._poise < M) t._poise = Math.min(M, t._poise + C.regen * dt);
	},
	stunned(t) { const S = this._fight(t); return !!(S && S.stun > 0); },
	prone(t) { const r = t && t.rag; return !!(r && (r.phase === 'slide' || r.phase === 'rest')); },
};
