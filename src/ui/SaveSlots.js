// ============================================================================
// SaveSlots — os 3 ESPAÇOS de save (SaveGame), em cartas: número, data, dia do jogo, dinheiro, lugar e hora no jogo; vazio = "Espaço
// livre". Três modos:
//   'save'  menu de pausa (aba Salvar): grava o jogo no espaço escolhido (ocupado: pede confirmação para substituir)
//   'load'  menu principal → Carregar: começa o jogo daquele espaço (🗑 apaga, com confirmação)
//   'new'   menu principal → Novo jogo com os 3 ocupados: escolhe o espaço que o jogo novo vai usar (nada é apagado agora: o save
//           antigo só é substituído quando você salvar)
// render(el, mode, onPick) desenha num container (a página da aba); open(mode, onPick) abre por cima de tudo (o menu principal).
// ============================================================================

const SaveSlots = {
	_css() {
		if (this._styled) return;
		this._styled = true;
		const st = document.createElement('style');
		st.textContent = `
		.ss-wrap{display:flex;flex-direction:column;gap:12px;width:min(640px,94vw);margin:0 auto}
		.ss-wrap h2{margin:0;text-align:center;font:700 20px var(--font-d,'Outfit','Inter',sans-serif);color:#f2f4f8}
		.ss-wrap .ss-sub{text-align:center;font:500 13px/1.5 var(--font,'Inter',sans-serif);color:#9aa3b5}
		.ss-card{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:16px;cursor:pointer;background:rgba(18,21,31,.78);border:1px solid rgba(255,255,255,.14);
			color:#f2f4f8;font:500 13px var(--font,'Inter',sans-serif);transition:background .15s,border-color .15s,transform .1s;text-align:left}
		.ss-card:hover,.ss-card.on{background:rgba(40,46,62,.9);border-color:rgba(52,211,153,.7)}
		.ss-card:active{transform:translateY(1px)}
		.ss-card.cur{border-color:rgba(125,211,252,.6)}
		.ss-n{flex:none;width:46px;height:46px;border-radius:12px;display:flex;align-items:center;justify-content:center;font:800 22px var(--font-d,'Outfit',sans-serif);background:rgba(255,255,255,.07);color:#7dd3fc}
		.ss-card.empty .ss-n{color:#6f7689}
		.ss-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
		.ss-txt b{font:700 15px var(--font-d,'Outfit',sans-serif)}
		.ss-txt span{color:#9aa3b5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
		.ss-act{flex:none;font:700 12px var(--font,'Inter',sans-serif);padding:8px 12px;border-radius:99px;background:#10b981;color:#04130c}
		.ss-act.warn{background:#f59e0b}
		.ss-del{flex:none;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(244,63,94,.16);border:1px solid rgba(244,63,94,.45);cursor:pointer}
		.ss-del.ask{background:#e11d48;width:auto;padding:0 12px;border-radius:99px;font:700 12px var(--font,'Inter',sans-serif);color:#fff}
		.ss-msg{min-height:18px;text-align:center;font:600 13px var(--font,'Inter',sans-serif)}
		.ss-back{align-self:center;font:600 14px var(--font,'Inter',sans-serif);padding:11px 26px;border-radius:14px;cursor:pointer;color:#f2f4f8;background:rgba(16,19,28,.62);border:1px solid rgba(255,255,255,.16)}
		#ssOverlay{position:fixed;inset:0;z-index:140;display:none;align-items:center;justify-content:center;background:rgba(4,6,10,.72);padding:16px;overflow-y:auto}
		#ssOverlay.open{display:flex}`;
		document.head.appendChild(st);
	},

	// Uma carta: o que tem no espaço i (1..3).
	_card(i, s, mode) {
		const z = (n) => String(n).padStart(2, '0');
		let title = `Espaço ${i}`, line1 = 'Espaço livre', line2 = mode === 'save' ? 'Salvar aqui' : mode === 'new' ? 'Começar aqui' : '—';
		if (s) {
			const I = s.info || {}, inv = s.inventory || {}, cash = I.cash != null ? I.cash : (inv.cash || 0) + (inv.clean || 0);
			const h = Math.floor(s.hour || 0), m = Math.floor(((s.hour || 0) % 1) * 60);
			title = `Espaço ${i} · Dia ${(s.day || 0) + 1}`;
			line1 = `Salvo em ${SaveGame.label(s)} · ${z(h)}:${z(m)} no jogo`;
			line2 = `${typeof brl === 'function' ? brl(cash) : 'R$ ' + cash}${I.place ? ' · ' + I.place : ''}`;
		}
		const act = mode === 'load' ? (s ? 'Carregar' : '') : mode === 'save' ? (s ? 'Substituir' : 'Salvar') : (s ? 'Usar este' : 'Começar');
		return { title, line1, line2, act, warn: !!s && mode !== 'load' };
	},

	// Desenha os 3 espaços em `el`. onPick(slot, save) quando escolhe (no 'save' e no 'new' ocupado, depois de confirmar).
	render(el, mode, onPick, { title = null, sub = null, back = null } = {}) {
		this._css();
		const L = SaveGame.list(), state = { ask: 0, del: 0 };
		const draw = (msg = '', ok = true) => {
			const cards = L.map((s, k) => {
				const i = k + 1, C = this._card(i, s, mode), off = mode === 'load' && !s;
				const ask = state.ask === i, cur = mode === 'save' && SaveGame.slot === i;
				return `<div class="ss-card${s ? '' : ' empty'}${ask ? ' on' : ''}${cur ? ' cur' : ''}" data-i="${i}" style="${off ? 'opacity:.45;cursor:default' : ''}">
					<div class="ss-n">${i}</div><div class="ss-txt"><b>${C.title}${cur ? ' <small style="color:#7dd3fc;font-weight:600">· jogo atual</small>' : ''}</b><span>${C.line1}</span><span>${C.line2}</span></div>
					${C.act ? `<div class="ss-act${C.warn ? ' warn' : ''}">${ask ? 'Confirmar?' : C.act}</div>` : ''}
					${mode === 'load' && s ? `<div class="ss-del${state.del === i ? ' ask' : ''}" data-del="${i}" title="Apagar este save">${state.del === i ? 'Apagar?' : '🗑'}</div>` : ''}</div>`;
			}).join('');
			el.innerHTML = `<div class="ss-wrap">${title ? `<h2>${title}</h2>` : ''}${sub ? `<div class="ss-sub">${sub}</div>` : ''}${cards}
				<div class="ss-msg" style="color:${ok ? '#86efac' : '#fda4af'}">${msg}</div>${back ? '<div class="ss-back" data-back="1">Voltar</div>' : ''}</div>`;
		};
		el.onclick = (e) => {
			if (e.target.closest('[data-back]')) { back(); return; }
			const d = e.target.closest('[data-del]');
			if (d) {
				const i = +d.dataset.del;
				if (state.del !== i) { state.del = i; state.ask = 0; draw(); return; }
				SaveGame.remove(i); L[i - 1] = null; state.del = 0; draw(`Espaço ${i} apagado`);
				if (typeof AudioFX !== 'undefined') AudioFX.blip(300, 0.08, 0.14);
				return;
			}
			const c = e.target.closest('.ss-card'); if (!c) return;
			const i = +c.dataset.i, s = L[i - 1];
			state.del = 0;
			if (mode === 'load' && !s) return;
			if (mode !== 'load' && s && state.ask !== i) { state.ask = i; draw(mode === 'save' ? `O save do espaço ${i} vai ser substituído — clique de novo para confirmar` : `O jogo novo vai usar o espaço ${i}: o save de lá só é substituído quando você salvar`, false); return; }
			state.ask = 0;
			const r = onPick(i, s);
			if (r && r.msg) { if (r.ok) L[i - 1] = SaveGame.list()[i - 1]; draw(r.msg, r.ok); }
		};
		draw();
	},

	// Por cima de tudo (menu principal). close() fecha.
	open(mode, onPick, opts = {}) {
		this._css();
		let o = document.getElementById('ssOverlay');
		if (!o) { o = document.createElement('div'); o.id = 'ssOverlay'; document.body.appendChild(o); }
		o.classList.add('open');
		const close = () => o.classList.remove('open');
		this.render(o, mode, (i, s) => { close(); return onPick(i, s); }, Object.assign({ back: close }, opts));
		this._esc = this._esc || ((e) => { if (e.key === 'Escape' && o.classList.contains('open')) { e.stopPropagation(); close(); } });
		window.removeEventListener('keydown', this._esc, true); window.addEventListener('keydown', this._esc, true);
		return close;
	},
};
