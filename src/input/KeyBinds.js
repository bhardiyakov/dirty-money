// ============================================================================
// KeyBinds — TROCAR TECLAS do teclado (Ajustes › Teclas). O jogo inteiro continua lendo as teclas de sempre ("teclas lógicas": `e`,
// `f`, `shift`, ' '…); aqui fica só a tradução TECLA APERTADA → TECLA LÓGICA, feita no InputManager antes de tudo. Assim nenhum
// sistema precisa saber de teclas trocadas.
//   • ACTIONS: as ações que dá para trocar (a tecla lógica, o nome, o grupo). Números (armas), Esc e as setas ficam fixos.
//   • set(ação, tecla): põe a ação na tecla; se outra ação estava nela, as duas TROCAM (nunca duas ações na mesma tecla nem tecla
//     sem ação no meio). reset(): volta tudo ao padrão. Guardado em Ajustes (settings.keys: só o que mudou).
//   • map(tecla apertada) → a tecla lógica, null (uma tecla padrão cuja ação foi para outra: apertá-la não faz nada) ou ela mesma.
//   • label(tecla) → como aparece na tela ('ESPAÇO', 'SHIFT', 'E'…); render(html) troca as teclas das dicas (<b>F</b>, <kbd>F</kbd>)
//     pela tecla escolhida — como o PadGlyphs faz com os botões do controle.
// ============================================================================

const KeyBinds = {
	ACTIONS: [
		['w', 'Frente / acelerar', 'mover'], ['s', 'Trás / frear e ré', 'mover'], ['a', 'Esquerda', 'mover'], ['d', 'Direita', 'mover'],
		['shift', 'Sprint (tocar repetido = mais rápido) / nitro', 'mover'], ['v', 'Pular grade / rolar', 'mover'], ['q', 'Agachar / cobertura', 'mover'],
		[' ', 'Atacar · freio de mão · subir (helicóptero)', 'ação'], ['e', 'Interagir (assaltar, comprar, esconder)', 'ação'], ['f', 'Entrar / sair do veículo', 'ação'],
		['r', 'Recarregar · trocar a estação do rádio', 'ação'], ['c', 'Furtar', 'ação'], ['g', 'Arrombar · gritar no assalto', 'ação'], ['k', 'Máscara', 'ação'],
		['m', 'Kit médico', 'ação'], ['tab', 'Roda de armas', 'ação'], ['h', 'Buzina', 'veículo'], ['l', 'Faróis', 'veículo'],
		['i', 'Mochila', 'menus'], ['o', 'Carreiras', 'menus'], ['b', 'Decorar a casa', 'menus'], ['z', 'Zoom +', 'câmera'], ['x', 'Zoom −', 'câmera'],
	],
	binds: {},             // ação (tecla lógica) → tecla escolhida (só as trocadas)
	_rev: null,            // tecla escolhida → ação (todas as ações)
	NAMES: { ' ': 'ESPAÇO', shift: 'SHIFT', tab: 'TAB', control: 'CTRL', alt: 'ALT', enter: 'ENTER', backspace: '⌫', capslock: 'CAPS', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', escape: 'ESC' },
	// teclas que não podem receber ação (Esc abre o menu, os números trocam de arma)
	RESERVED: new Set(['escape', 'p', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '=', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'enter', 'meta', 'contextmenu']),

	isAction(k) { return this.ACTIONS.some((a) => a[0] === k); },
	key(action) { return this.binds[action] || action; },
	label(k) { return this.NAMES[k] || (k.length === 1 ? k.toUpperCase() : k.toUpperCase()); },
	changed() { return Object.keys(this.binds).length > 0; },

	load(obj) {
		this.binds = {};
		if (obj && typeof obj === 'object') for (const [a, k] of Object.entries(obj)) if (this.isAction(a) && typeof k === 'string' && k && k !== a && !this.RESERVED.has(k)) this.binds[a] = k;
		this._fix();
	},
	save() { return Object.assign({}, this.binds); },

	// Põe a ação `action` na tecla `k` (troca com quem estava nela). false = tecla reservada.
	set(action, k) {
		k = String(k).toLowerCase();
		if (!this.isAction(action) || this.RESERVED.has(k)) return false;
		const old = this.key(action), other = this._rev && this._rev[k];
		if (other && other !== action) this._put(other, old);
		this._put(action, k);
		this._fix();
		return true;
	},
	reset() { this.binds = {}; this._fix(); },
	_put(a, k) { if (k === a) delete this.binds[a]; else this.binds[a] = k; },
	// (garante que cada tecla tenha no máximo uma ação: uma combinação salva quebrada volta ao padrão)
	_fix() {
		const rev = {};
		for (const [a] of this.ACTIONS) { const k = this.key(a); if (rev[k]) { this.binds = {}; return this._fix(); } rev[k] = a; }
		this._rev = rev;
	},

	// Tecla apertada → tecla lógica (o que o jogo lê).
	map(k) {
		if (!this.changed()) return k;
		const a = this._rev[k];
		if (a) return a;
		return this.isAction(k) ? null : k;
	},

	// Dicas da tela: troca <b>F</b> / <kbd>F</kbd> (e "W/S", "WASD", "ESPAÇO/CLIQUE") pela tecla escolhida.
	_DEF: { ESPAÇO: ' ', SHIFT: 'shift', TAB: 'tab' },
	_one(t) {
		const up = t.trim().toUpperCase(), a = this._DEF[up] || (up.length === 1 ? up.toLowerCase() : null);
		return a && this.isAction(a) ? this.label(this.key(a)) : null;
	},
	_text(t) {
		const up = t.trim().toUpperCase();
		if (up === 'WASD') return ['w', 'a', 's', 'd'].map((a) => this.label(this.key(a))).join('');
		if (up.includes('/')) { const parts = t.split('/'); const out = parts.map((p) => this._one(p) || p); return out.join('/'); }
		return this._one(t);
	},
	render(html) {
		if (!html || !this.changed()) return html;
		return html.replace(/<(b|kbd)>([^<]{1,16})<\/\1>/g, (m, tag, t) => { const r = this._text(t); return r ? `<${tag}>${r}</${tag}>` : m; });
	},
};
