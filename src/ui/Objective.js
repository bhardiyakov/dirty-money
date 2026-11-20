// ============================================================================
// Objective — "O QUE FAZER AGORA", sempre na tela (item 6 do polimento; pensado primeiro para o celular). Uma linha embaixo, no meio
// — entre o analógico e os botões no celular; acima das metas no PC —, com UMA coisa, nesta ordem:
//   1. a MISSÃO / o TRABALHO de carreira em andamento (título, o que fazer, tempo, distância);
//   2. o DESTINO marcado no mapa (nome e distância);
//   3. a PRÓXIMA META (a trilha mais adiantada de Goals, com a barrinha).
// Com alvo no mundo, a seta (➤) aponta para ele NA TELA (girada com a câmera) e a distância vai junto. Substitui o painel de missão
// (#hMission) e, no celular, a fila de metas (#goalBox). Some no menu, nos interiores calmos, preso, morto e dormindo.
// ============================================================================

const Objective = {
	_t: 0, cur: null,

	_build() {
		if (this.el) return;
		const st = document.createElement('style');
		st.textContent = `
			#objChip { position: fixed; left: 50%; bottom: max(8px, env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 11; pointer-events: none; display: none;
				align-items: center; gap: 8px; max-width: min(52vw, 560px); padding: 6px 13px 7px; border-radius: 999px; background: rgba(10,12,18,0.84);
				border: 1px solid rgba(255,255,255,0.14); color: #f2f4f8; font: 600 12px/1.25 var(--font, Inter, system-ui, sans-serif); box-sizing: border-box; }
			#objChip.on { display: flex; }
			#objChip .oi { font-family: var(--emoji, sans-serif); font-size: 14px; flex: none; }
			#objChip .ot { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
			#objChip .ot b { color: var(--gold, #fbbf24); font-weight: 800; margin-right: 6px; }
			#objChip .od { color: #93c5fd; font-weight: 800; white-space: nowrap; flex: none; font-variant-numeric: tabular-nums; }
			#objChip.low .od { color: #fb7185; }
			#objChip .oa { display: inline-block; flex: none; color: #ff5a4f; font-size: 13px; line-height: 1; transition: transform .2s linear; }
			#objChip .op { position: absolute; left: 14px; right: 14px; bottom: 2px; height: 2px; border-radius: 2px; background: rgba(255,255,255,0.12); overflow: hidden; }
			#objChip .op i { display: block; height: 100%; background: var(--gold, #fbbf24); }
			body:not(.mobile) #objChip { left: 16px; top: 16px; bottom: auto; transform: none; max-width: 440px; font-size: 14px; padding: 8px 18px 9px; gap: 10px; }
			body:not(.mobile) #objChip .oi { font-size: 16px; }
			body.mobile #hMission, body.mobile #goalBox { display: none !important; }
			#hMission { display: none !important; }`;
		document.head.appendChild(st);
		const el = this.el = document.createElement('div');
		el.id = 'objChip';
		el.innerHTML = '<span class="oi"></span><span class="ot"></span><span class="od"></span><span class="oa">➤</span><span class="op"><i></i></span>';
		document.body.appendChild(el);
		this.$ = { i: el.children[0], t: el.children[1], d: el.children[2], a: el.children[3], p: el.children[4], pf: el.children[4].firstChild };
	},

	// O objetivo de agora: { icon, title, text, extra, low, at: {x, z} | null, pct: 0..1 | null } ou null.
	pick(g) {
		const mi = (g.careers && g.careers.hud && g.careers.hud()) || (g.missions && g.missions.hud ? g.missions.hud() : null);
		if (mi) {
			const job = g.careers && g.careers.job, m = g.missions && g.missions.cur;
			const at = job && job.tx != null ? { x: job.tx, z: job.tz } : m && m.to ? { x: m.to.x, z: m.to.z } : g.gps ? { x: g.gps.x, z: g.gps.z } : null;
			return { icon: job ? '💼' : '🎯', title: mi.title, text: mi.text, extra: (mi.extra || '').replace(/\s*·?\s*\d+\s*M$/i, ''), low: !!mi.low, at, pct: null };
		}
		if (g.gps) return { icon: '📍', title: '', text: g.gps.label || 'Ponto marcado', extra: '', low: false, at: { x: g.gps.x, z: g.gps.z }, pct: null };
		const P = g.goals && g.goals.pending ? g.goals.pending() : [];
		if (P.length) {
			const best = P.reduce((a, b) => (b.cur / b.target > a.cur / a.target ? b : a));
			const fmt = g.goals._fmt ? (v) => g.goals._fmt(best.key, v) : String;
			return { icon: '🏆', title: 'Meta', text: `${best.label} ${fmt(best.target)}`, extra: `${fmt(Math.min(best.cur, best.target))}`, low: false, at: null, pct: Math.min(1, best.cur / best.target) };
		}
		return null;
	},

	update(g, dt) {
		this._t -= dt;
		if (this._t > 0) return;
		this._t = 0.25;
		this._build();
		const hide = g.menu.isOpen || g.death || g.arrest || g.sleeping || (g.endScreen && g.endScreen.visible) || (typeof Interiors !== 'undefined' && Interiors.active && !(g.careers && g.careers.job) && !(g.missions && g.missions.cur));
		const o = hide ? null : this.pick(g);
		this.cur = o;
		this.el.classList.toggle('on', !!o);
		if (!o) return;
		const $ = this.$, key = o.icon + o.title + o.text + o.extra;
		if (key !== this._key) {
			this._key = key;
			$.i.textContent = o.icon;
			$.t.innerHTML = (o.title ? `<b>${this._esc(o.title)}</b>` : '') + this._esc(o.text);
		}
		this.el.classList.toggle('low', o.low);
		let dist = '';
		if (o.at) {
			const p = g._playerState().pos, dx = o.at.x - p.x, dz = o.at.z - p.z, d = Math.hypot(dx, dz);
			dist = d >= 1000 ? (d / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(d) + ' m';
			const yaw = typeof CompassCamera !== 'undefined' ? CompassCamera.yaw || 0 : 0, a = Math.atan2(dx, dz) - yaw;
			$.a.style.transform = `rotate(${(a * 180 / Math.PI - 90).toFixed(0)}deg)`;      // (➤ aponta para a direita: −90° = para cima)
		}
		$.a.style.display = o.at ? '' : 'none';
		$.d.textContent = [o.extra, dist].filter(Boolean).join(' · ');
		$.p.style.display = o.pct == null ? 'none' : '';
		if (o.pct != null) $.pf.style.width = Math.round(o.pct * 100) + '%';
	},
	_esc(t) { return String(t).replace(/[<>&]/g, ''); },
};
