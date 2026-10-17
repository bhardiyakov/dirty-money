// ============================================================================
// NpcData — os DADOS dos personagens 2,5D que o jogo precisa, lidos de assets/baked/npc-data.json (gravado por
// tools/asset_baker/bake.cjs). Nada do gerador procedural roda na thread principal: os desenhos vêm prontos (atlas WebP, NpcArt), e
// aqui ficam só as tabelas — tipos e onde aparecem, variantes de cor, paletas, a ficha e os clipes do jogador, a ponta do cano das armas,
// o deslize de sentar no carro — e as poucas contas sobre elas (cores de uma ficha, chave de forma, tamanho do quadro).
//
//   NpcData.load()              Promise (uma vez): busca o JSON. Sem ele (file://, rede fora) → rejeita: o jogo usa os bonecos antigos.
//   NpcData.rampsFor(ficha)     material → 5 cores (a mesma conta do gerador; o bake confere as duas — checkRamps)
//   NpcData.shapeKey(ficha)     chave de FORMA (dois visuais com a mesma chave usam o mesmo atlas)
//   NpcData.variantSpec(id, v)  ficha (as cores) da variante v do tipo id
//   NpcData.typesFor(grupo)     tipos que aparecem num lugar/papel
// ============================================================================

const NpcData = {
	BASE: './assets/baked/',
	d: null,
	ready: null,

	load() {
		if (this.ready) return this.ready;
		if (!AssetIO.available) return (this.ready = Promise.reject(new Error('sem leitura de arquivos (file://)')));
		return (this.ready = AssetIO.json(this.BASE + 'npc-data.json').then((d) => {
			if (!d) throw new Error('npc-data.json indisponível');
			return this.use(d);
		}));
	},
	use(d) { this.d = d; this._byId = null; return d; },
	get ok() { return !!this.d; },

	get genHash() { return this.d.genHash; },
	get M() { return this.d.M; },
	get PAL() { return this.d.PAL; },
	get SPECIAL() { return this.d.SPECIAL; },
	get SIT_IN() { return this.d ? this.d.SIT_IN : null; },
	get TYPES() { return this.d.types; },
	get player() { return this.d.player; },
	get PLAYER_DEFAULT() { return this.d.player.DEFAULT; },
	get HD_K() { return this.d.HD_K; },
	get OUT_K() { return this.d.OUT_K; },

	type(id) { return (this.d && this.d.types[id]) || null; },
	nvar(id) { const t = this.type(id); return t ? t.nvar : 1; },
	typesFor(group) { return Object.keys(this.d.types).filter((id) => this.d.types[id].groups.includes(group)); },
	scaleOf(id) { const t = this.type(String(id).replace(/#d\d+$/, '')); return (t && t.scale) || 1; },
	muzzle(look) { return (this.d && this.d.muzzle && this.d.muzzle[look]) || null; },
	dmgClips(player) { return player ? this.d.dmg.player : this.d.dmg.npc; },

	// Quadro de trabalho e os pés nele, por resolução k (o atlas tem frame × frame px; pivô = os pés).
	frameFor(k) { const g = this.d.geom; return Math.round((g.frame * k) / g.refK); },
	pivFor(k) { const g = this.d.geom; return [Math.round((g.pivot[0] * k) / g.refK), Math.round((g.pivot[1] * k) / g.refK)]; },

	fullSpec(spec) { return Object.assign({}, this.d.DEFAULT, spec || {}); },
	shapeKey(spec) {
		const s = this.fullSpec(spec);
		return this.d.SHAPE_KEYS.map((k) => k + '=' + (s[k] === undefined || s[k] === null || s[k] === false ? '' : s[k])).join(';');
	},
	variantSpec(id, v = 0) {
		const L = this.d.variants[id];
		return this.fullSpec(L ? L[v % L.length] : {});
	},

	// Rampas de cor (material → 5 cores, escuro → claro) de uma ficha — a mesma conta do rampsFor do gerador (NpcGenChar).
	rampsFor(spec) {
		const s = this.fullSpec(spec), M = this.d.M, PAL = this.d.PAL, R = {};
		const pal = (name, fb) => PAL[name] || PAL[fb] || PAL.cinza, darker = (r) => [r[0], r[0], r[1], r[2], r[3]];
		R[M.skin] = pal(s.skin, 'pele_parda'); R[M.hair] = pal(s.hair_color, 'preto'); R[M.shirt] = pal(s.top_color, 'branco');
		R[M.jeans] = pal(s.bottom_color, 'jeans'); R[M.shoe] = pal(s.shoe_color, 'tenis_preto'); R[M.sole] = pal(s.sole_color, 'sola_escura');
		R[M.lace] = pal(s.lace_color, 'cadarco'); R[M.bag] = pal(s.bag_color, 'mochila'); R[M.strap] = pal(s.strap_color, 'alca');
		R[M.metal] = PAL.metal; R[M.wood] = PAL.madeira; R[M.eye] = PAL.olho; R[M.eyew] = PAL.olho_branco;
		R[M.mouth] = PAL[s.gender === 'f' ? 'batom' : 'boca']; R[M.green] = PAL.granada; R[M.batwood] = PAL.taco; R[M.chrome] = PAL.cromo;
		R[M.brow] = s.hair_color === 'castanho' ? PAL.sobrancelha : darker(pal(s.hair_color, 'preto'));
		R[M.tape] = PAL.fita; R[M.vest] = pal(s.vest_color, 'tatico'); R[M.hat] = pal(s.hat_color, 'roupa_preta');
		R[M.accent] = pal(s.accent, 'branco'); R[M.accent2] = pal(s.accent2, 'amarelo');
		R[M.beard] = darker(pal(s.hair_color, 'preto')); R[M.gold] = PAL.dourado; R[M.lens] = PAL.lente;
		R[M.glove] = PAL.tatico; R[M.sock] = PAL.branco; R[M.visor] = PAL.lente;
		R[M.cargo] = pal(s.cargo_color || s.bag_color, 'mochila'); R[M.flesh] = PAL.carne;
		return R;
	},

	hexrgb(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; },
	// Hash de texto (FNV-1a, o mesmo do gerador): a semente de quem é quem.
	hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; },
};
