// ============================================================================
// AutoSave — o SALVAMENTO AUTOMÁTICO (além de dormir e da aba Salvar do menu, que continuam): no espaço do jogo em andamento
// (SaveGame.slot), sem pedir nada:
//   • a cada `every` segundos de jogo, quando der (as regras do SaveGame.blocked — vivo, sem polícia no rastro, sem assalto — e mais:
//     a pé, fora de transição de porta, sem estar dormindo, escondido, de ônibus ou num mini-jogo). Não deu: tenta de novo a cada
//     `retry` s — assim que a perseguição acaba, salva;
//   • quando a página some (minimizou, trocou de aba ou de app no celular, fechou a aba): nada de perder a sessão;
//   • antes de aplicar uma versão nova do jogo ("Atualizar agora", src/main.js).
// Um selo "💾 Jogo salvo" aparece no canto por um instante. Ajustes › "Salvamento automático" desliga.
// ============================================================================

const AutoSave = {
	every: 180,
	retry: 10,
	minGap: 20,               // s: a página sumindo logo depois de um salvamento não salva de novo
	t: 0, pending: false, lastAt: 0,

	get on() { const g = window.game; return !(g && g.menu && g.menu.settings && g.menu.settings.autosave === false); },

	// Dá para salvar agora? null = sim; senão, o motivo.
	blocked(g) {
		const b = SaveGame.blocked(g);
		if (b) return b;
		if (g.mode !== 'player') return 'dirigindo';
		if (g.sleeping || g.hiding || g.holdup || g.player.frozen) return 'ocupado';
		if (typeof Interiors !== 'undefined' && Interiors.busy) return 'entrando/saindo';
		if (typeof Buses !== 'undefined' && Buses.ride) return 'de ônibus';
		if ((typeof Pool !== 'undefined' && Pool.active) || (typeof Truco !== 'undefined' && Truco.active) || (typeof Porrinha !== 'undefined' && Porrinha.active) || (typeof Domino !== 'undefined' && Domino.active) || (typeof Gym !== 'undefined' && Gym.active)) return 'mini-jogo';
		return null;
	},

	install(g) {
		if (this._installed) return;
		this._installed = true;
		const away = () => { if (Date.now() - this.lastAt > this.minGap * 1000) this.now(g, 'saiu'); };
		document.addEventListener('visibilitychange', () => { if (document.hidden) away(); });
		window.addEventListener('pagehide', away);
	},

	update(g, dt) {
		if (!g._bootDone || !this.on) return;
		this.t += dt;
		if (this.t < (this.pending ? this.retry : this.every)) return;
		this.t = 0;
		this.now(g, 'auto');
	},

	// Salva já, se der. true = salvou.
	now(g, why = 'auto') {
		if (!g || !g._bootDone || !this.on) return false;
		const b = this.blocked(g);
		if (b) { this.pending = true; return false; }
		const ok = SaveGame.write(g);
		this.pending = !ok;
		if (ok) { this.lastAt = Date.now(); this.t = 0; if (why !== 'saiu') this._badge(); }
		return ok;
	},

	_badge() {
		let el = document.getElementById('dmSaved');
		if (!el) {
			el = document.createElement('div'); el.id = 'dmSaved';
			el.style.cssText = 'position:fixed;right:16px;top:14px;z-index:60;padding:6px 11px;border-radius:12px;background:rgba(10,14,22,.82);color:#a7f3d0;font:600 12px Inter,system-ui,sans-serif;pointer-events:none;transition:opacity .4s;opacity:0';
			el.textContent = '💾 Jogo salvo';
			document.body.appendChild(el);
		}
		el.style.opacity = '1';
		clearTimeout(this._bt);
		this._bt = setTimeout(() => { el.style.opacity = '0'; }, 1800);
	},
};
