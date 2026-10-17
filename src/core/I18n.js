// ============================================================================
// I18n — the game's texts by language. Each language is a static, flat JSON dictionary (assets/locales/<lang>.json: key → text,
// `{name}` marks a value filled in by the caller). The chosen one is read once at start (with Portuguese as the fallback for keys a
// translation does not have yet), so asking for a text is one property lookup — no parsing or formatting work while playing.
//
//   I18n.load()            the chosen language (settings.language; Portuguese by default), before the menu shows
//   I18n.t(key, vars)      the text, with {name} filled from `vars`; the key itself when no dictionary has it
//   I18n.apply(root)       elements with data-i18n="key" get their text (the page keeps its Portuguese text if nothing loads)
//   I18n.next(lang), label(lang)   the settings button's cycle and names
// A new language = one more JSON file and its code in LANGS. The menus and the settings are translated so far; the rest of the
// game moves to keys over time.
// ============================================================================

const I18n = {
	BASE: './assets/locales/',
	DEFAULT: 'pt-BR',
	LANGS: ['pt-BR', 'en'],
	LABEL: { 'pt-BR': 'Português', en: 'English' },
	lang: 'pt-BR',
	dict: {},
	base: {},

	// The saved choice (settings.language), or Portuguese.
	chosen() {
		const l = (Store.getJSON('settings', null) || {}).language;
		return this.LANGS.includes(l) ? l : this.DEFAULT;
	},

	async load() {
		this.lang = this.chosen();
		if (typeof document !== 'undefined') document.documentElement.lang = this.lang;
		const [dict, base] = await Promise.all([
			AssetIO.json(this.BASE + this.lang + '.json'),
			this.lang === this.DEFAULT ? null : AssetIO.json(this.BASE + this.DEFAULT + '.json'),
		]);
		this.dict = dict || {};
		this.base = base || this.dict;
		if (!dict) console.warn(`[I18N] ${this.lang}: dictionary not available — texts stay as written`);
	},

	t(key, vars) {
		const s = this.dict[key] ?? this.base[key] ?? key;
		return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s;
	},

	apply(root = document) {
		for (const el of root.querySelectorAll('[data-i18n]')) {
			const key = el.dataset.i18n;
			if (key in this.dict || key in this.base) el.textContent = this.t(key);
		}
	},

	next(lang) { return this.LANGS[(this.LANGS.indexOf(lang) + 1) % this.LANGS.length]; },
	label(lang) { return this.LABEL[this.LANGS.includes(lang) ? lang : this.DEFAULT]; },
};
