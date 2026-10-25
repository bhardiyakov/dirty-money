// ============================================================================
// SaveGame — grava e carrega o progresso em 3 ESPAÇOS (storage/Store.js, chaves 'save1'..'save3'; o save antigo, 'save', vira o
// espaço 1). Nada é salvo sozinho: só quando o jogador SALVA no menu de pausa (aba Salvar, ui/SaveSlots.js) ou DORME (Game.sleep, no
// espaço do jogo em andamento, `slot`). O menu principal escolhe o espaço ao carregar ou ao começar um jogo novo. Guarda: hora e clima, vida/colete/arma, posição, mochila e o
// que está guardado em casa (Stash) e os SEUS carros (Garage: os das garagens). Não guarda o trânsito, pedestres nem a polícia
// (o mundo recomeça "fresco" ao carregar). Os móveis da decoração (world/HomeDecor.js) vão junto: a grade é gravada no mesmo espaço.
// ============================================================================

const SaveGame = {
	KEY: 'save',
	VERSION: 2,
	// Migrações: MIGRATE[n] converte um save da versão n para a n+1 (nunca apaga progresso; o que é novo começa vazio). Um save de
	// versão ANTIGA é convertido ao listar e ao carregar; de versão mais NOVA que este jogo (voltou para um jogo velho) fica intocado.
	MIGRATE: {
		// 1 → 2: Primeiros passos (world/Tutorial.js) — quem já tinha jogo salvo não recebe as missões de introdução.
		1: (s) => { s.tutorial = s.tutorial || { done: true, step: 99 }; return s; },
	},
	upgrade(s) {
		if (!s || typeof s !== 'object') return null;
		let v = typeof s.v === 'number' ? s.v : 1;
		if (v > this.VERSION) return null;
		while (v < this.VERSION) { const f = this.MIGRATE[v]; if (!f) return null; s = f(s) || s; v++; s.v = v; }
		return s;
	},
	SLOTS: 3,
	slot: 1,                    // o espaço do jogo em andamento (dormir salva nele; o menu escolhe outro)

	keyOf(i) { return this.KEY + i; },
	// O save de antes dos espaços ('save') passa a ser o espaço 1, uma vez.
	_migrate() {
		if (this._migrated) return;
		this._migrated = true;
		const old = Store.getJSON(this.KEY);
		if (old && !Store.getJSON(this.keyOf(1)) && Store.setJSON(this.keyOf(1), old)) Store.remove(this.KEY);
	},
	// Os 3 espaços: [save | null] (índice 0 = espaço 1).
	list() { this._migrate(); return [...Array(this.SLOTS).keys()].map((i) => this.upgrade(Store.getJSON(this.keyOf(i + 1)))); },
	firstEmpty() { const L = this.list(), i = L.indexOf(null); return i < 0 ? 0 : i + 1; },
	latest() { const L = this.list(); let b = 0; L.forEach((s, i) => { if (s && (!b || s.savedAt > L[b - 1].savedAt)) b = i + 1; }); return b; },
	remove(slot) {
		if (typeof GridPersistence !== 'undefined') GridPersistence.detectBackend().deleteSlot(slot).catch((e) => console.warn('[SAVE] móveis do espaço não apagados:', e));
		return Store.remove(this.keyOf(slot));
	},
	// Dá para salvar agora? (null = sim; senão, o motivo)
	blocked(g) {
		if (!g || !g._bootDone) return 'O jogo ainda está carregando';
		if (g.death || !g.player.alive) return 'Não dá para salvar morto';
		if (g.arrest) return 'Não dá para salvar sendo preso';
		if (g.wanted && g.wanted.level > 0) return 'Com a polícia no seu rastro não dá para salvar';
		if ((typeof Robbery !== 'undefined' && Robbery.session) || (typeof Heists !== 'undefined' && Heists.run)) return 'Termine o assalto antes de salvar';
		return null;
	},

	snapshot(g) {
		const p = g.player, inv = g.inventory, at = this._where(g);
		const weapons = {};
		for (const k of Object.keys(inv.weapons)) weapons[k] = Object.assign({}, inv.weapons[k]);
		return {
			v: this.VERSION, savedAt: Date.now(),
			hour: g.dayNight.hour, weather: g.weather.state,
			info: { cash: Math.round((g.inventory.cash || 0) + (g.inventory.clean || 0)), place: this._place(g), played: Math.round(g.time || 0) },
			player: { x: at.x, z: at.z, rot: at.rot, hp: p.hp, armor: p.armor, armorMax: p.armorMax, weapon: p.weapon },
			inventory: { cash: inv.cash, clean: inv.clean, medkits: inv.medkits, hacks: inv.hacks, keys: inv.keys, food: inv.food, water: inv.water, jewels: inv.jewels, jewelValue: inv.jewelValue, bag: inv.bag, spareBags: inv.spareBags.slice(), weapons, gear: Object.assign({}, inv.gear || {}), booster: inv.boosterUses || 0 },
			fitness: p.fit ? p.fit.xp : 0, strength: p.str ? p.str.xp : 0, physique: Physique.serialize(),
			stash: g.stash.serialize(), day: Economy.day, standing: Standing.serialize(), laundry: Laundry.serialize(), realestate: RealEstate.serialize(), garage: Garage.serialize(), goals: g.goals ? g.goals.serialize() : null, careers: g.careers ? g.careers.serialize() : null, skills: g.skills ? g.skills.serialize() : null, achievements: g.achievements ? g.achievements.serialize() : null, empire: g.empire ? g.empire.serialize() : null, banks: Banks.serialize(), outfit: Outfit.serialize(),
			traces: Traces.serialize(), heat: g.heat.serialize(), robbery: Robbery.serialize(), heists: Heists.serialize(), business: Business.serialize(),
			decor: HomeDecor.serialize(), worldMemory: WorldMemory.serialize(), news: News.serialize(), needs: Needs.serialize(), phone: Phone.serialize(), ledger: Ledger.serialize(), rivalArc: RivalArc.serialize(), witnesses: Witnesses.serialize(), calendar: Calendar.serialize(), personas: Personas.serialize(), tutorial: Tutorial.serialize(),
		};
	},

	write(g, slot = this.slot) {
		let snap;
		try { snap = this.snapshot(g); } catch (e) { console.error('[SAVE] falha ao montar o save:', e); return false; }
		this._migrate();
		if (Store.setJSON(this.keyOf(slot), snap)) { this.slot = slot; HomeDecor.commitToSlot(slot); return true; }
		console.error('[SAVE] falha ao gravar: sem onde guardar');
		return false;
	},

	read(slot = this.latest()) {
		return slot ? this.list()[slot - 1] : null;
	},

	// Aplica um save no jogo recém-carregado (chamado no fim do boot).
	apply(g, s) {
		s = this.upgrade(s);
		if (!s) return false;
		const p = g.player, inv = g.inventory, I = s.inventory || {};
		for (const k of ['cash', 'clean', 'medkits', 'hacks', 'keys', 'food', 'water', 'jewels', 'jewelValue']) if (typeof I[k] === 'number') inv[k] = I[k];
		for (const k of Object.keys(I.weapons || {})) if (inv.weapons[k]) Object.assign(inv.weapons[k], I.weapons[k]);
		inv.gear = {}; for (const [k, n] of Object.entries(I.gear || {})) if (Items.DEFS[k] && n > 0) inv.gear[k] = n;
		inv.boosterUses = I.booster || 0;
		inv.bag = Bags.DEFS[I.bag] ? I.bag : 'pack';                       // saves antigos (antes das bolsas): a mochila 5×4 de sempre
		inv.spareBags = (I.spareBags || []).filter((b, i, a) => Bags.DEFS[b] && b !== 'none' && b !== inv.bag && a.indexOf(b) === i);
		Outfit.load(s.outfit || null);                                        // roupas e acessórios (saves antigos: o visual de sempre)
		p.fit = { xp: s.fitness || 0 };
		p.str = { xp: s.strength || 0 };
		Physique.load(s.physique || null);
		g.stash.load(s.stash); Standing.load(s.standing); Laundry.load(s.laundry); RealEstate.load(s.realestate); Garage.load(s.garage || null); if (g.goals) g.goals.load(s.goals); if (g.careers) g.careers.load(s.careers); if (g.skills) g.skills.load(s.skills); if (g.achievements) g.achievements.load(s.achievements); if (g.empire) g.empire.load(s.empire); Banks.load(s.banks); Economy.day = s.day || 0; Economy.shops = {};
		Traces.load(s.traces || null); Robbery.load(s.robbery || null); Heists.load(s.heists || null); Business.load(s.business || null);
		HomeDecor.load(s.decor || null);
		WorldMemory.load(s.worldMemory || null); News.load(s.news || null); Needs.load(s.needs || null); Phone.load(s.phone || null); Ledger.load(s.ledger || null); RivalArc.load(s.rivalArc || null); Witnesses.load(s.witnesses || null); Calendar.load(s.calendar || null); Personas.load(s.personas || null); Tutorial.load(s.tutorial || { done: true }); Phone._ready = true;                              // o que o mundo lembra de você (saves antigos: ninguém te conhece)                                      // (os móveis em si vêm da grade: HomeDecor.startSession)
		const pl = s.player || {};
		p.teleport(new BABYLON.Vector3(pl.x, 0, pl.z));
		if (CityGrid.blockedAt(pl.x, pl.z, 0.4)) p.teleport(g.nav.closestPoint(new BABYLON.Vector3(pl.x, 0, pl.z), 30));      // (o mapa mudou: salvou onde agora tem parede)
		p.root.rotation.y = pl.rot || 0;
		p.hp = Math.max(1, pl.hp || p.maxHp); p.armor = pl.armor || 0; p.armorMax = pl.armorMax || 0;
		p.weapon = inv.owned(pl.weapon) ? pl.weapon : 'none';
		g.camera.snapTo(p.position);
		if (typeof s.hour === 'number') { g.dayNight.hour = s.hour; g.dayNight.apply(); }
		g.heat.load(s.heat || null, s.traces || null);                  // after the clock: parole and lawyer are measured in game hours
		if (s.weather && g.weather) g.weather.set(s.weather, true);
		return true;
	},

	// Where the player is saved: inside an interior (the stage off the map), the city point it stands for — the safe house's bed
	// (loading wakes up in there again) or the pavement in front of the shop / property.
	_where(g) {
		const a = typeof Interiors !== 'undefined' && Interiors.active, p = g.player;
		if (!a) return { x: p.position.x, z: p.position.z, rot: p.root.rotation.y };
		const bed = a.shop.safehouse && SafeHouse.spawnWorld();
		return bed ? { x: bed.x, z: bed.z, rot: bed.face } : { x: a.ret.x, z: a.ret.z, rot: a.ret.face };
	},

	// Nome do lugar onde salvou (a região do mapa), para o card do espaço.
	_place(g) {
		try { const p = g.player.position; return (typeof RealEstate !== 'undefined' && RealEstate.locate) ? RealEstate.locate(p.x, p.z).region || '' : ''; } catch (e) { return ''; }
	},

	// "dd/mm hh:mm" do último save (para o menu principal).
	label(s) {
		if (!s || !s.savedAt) return '';
		const d = new Date(s.savedAt), z = (n) => String(n).padStart(2, '0');
		return `${z(d.getDate())}/${z(d.getMonth() + 1)} ${z(d.getHours())}:${z(d.getMinutes())}`;
	},
};
