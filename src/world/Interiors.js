// ============================================================================
// Interiors — entrar e sair das LOJAS. Cada loja da cidade (lot.shops) vira uma porta: em frente à fachada aparece "E entrar".
// Por dentro o jogador é levado para um PALCO (stage) fora do mapa, onde a sala do estilo/variação da loja é montada
// (art/ShopStyles.js). O mundo fica CONGELADO enquanto se está lá dentro (trânsito, pedestres, polícia, física) — por isso não
// dá para entrar com procurado. Saiu, volta exatamente à calçada de onde entrou.
//
//   Interiors.active    { shop, data, ret } enquanto dentro de uma loja
//   Interiors.obstacles sólidos da sala em coordenadas de mundo (MapGeo.resolveCircle usa no lugar do CityGrid)
// Dentro: o atendente (sprite) fica atrás do balcão; E perto dele abre a loja (ui/ShopUI.js, preços em economy/Economy.js).
// Uma SETA DE SAÍDA em alta definição (textura própria, 512 px — a sala é pintada a 20 px/u) fica no chão junto à porta, apontando
// para fora: pulsa e desliza na direção da rua; some de leve quando o jogador já está em cima dela.
// ============================================================================

const Interiors = {
	STAGE: { x: 3000, z: 0 },
	active: null,
	busy: false,                 // transição (fade) em andamento: o jogador fica parado
	obstacles: [],
	_doors: null, _grid: null,
	_rooms: {},
	_actors: [],

	// ------------------------------------------------------------------ índice das portas
	index() {
		if (this._doors) return;
		const doors = this._doors = [], grid = this._grid = new Map(), C = 12, SH = TileFactory.SHOPS;
		const key = (i, j) => i * 100003 + j;
		for (const b of CityGrid.blocks) for (const l of b.lots) for (const s of l.shops || []) {
			const S = SH[s.kind], style = S && Economy.KIND_STYLE[S.id];
			if (!style) continue;
			const m = s.a + 3, o = 1.25;
			const p = s.side === 'S' ? { x: m, z: l.z0 - o, face: Math.PI } : s.side === 'N' ? { x: m, z: l.z1 + o, face: 0 } : s.side === 'W' ? { x: l.x0 - o, z: m, face: -Math.PI / 2 } : { x: l.x1 + o, z: m, face: Math.PI / 2 };
			const ed = s.side === 'S' ? { ex: m, ez: l.z0 } : s.side === 'N' ? { ex: m, ez: l.z1 } : s.side === 'W' ? { ex: l.x0, ez: m } : { ex: l.x1, ez: m };      // ponto da fachada (o vão da porta)
			const id = `${b.id}|${l.x0.toFixed(1)}|${s.side}|${s.a.toFixed(1)}`;
			const shop = Object.assign({ id, kind: S.id, style, name: Economy.nameOf(style, id), district: b.district, faction: b.faction, biome: b.biome, variant: Math.floor(Pixel.hash(Economy._h(id), 11, 5) * 5) % 5 }, p, ed);
			doors.push(shop);
			const k = key(Math.floor(p.x / C), Math.floor(p.z / C));
			(grid.get(k) || grid.set(k, []).get(k)).push(shop);
		}
		// The safe house: one more door (on the grid only — `_doors` lists the shops, which the careers send the player to).
		const home = this.safeHouseDoor();
		if (home) { const k = key(Math.floor(home.x / C), Math.floor(home.z / C)); (grid.get(k) || grid.set(k, []).get(k)).push(home); }
		this._key = key; this._C = C;
		console.log(`[LOJAS] ${doors.length} portas indexadas`);
	},

	// Loja cuja porta está perto de (x, z) (a pé, na calçada em frente).
	shopNear(x, z, r = 1.9) {
		if (!inWorld(x, z)) return null;
		this.index();
		const C = this._C, i0 = Math.floor((x - r) / C), i1 = Math.floor((x + r) / C), j0 = Math.floor((z - r) / C), j1 = Math.floor((z + r) / C);
		let best = null, bd = r * r;
		for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const s of this._grid.get(this._key(i, j)) || []) {
			const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
			if (d < bd) { bd = d; best = s; }
		}
		return best;
	},

	// Jogador dentro do vão da porta de alguma loja? (entra andando, como na safe house)
	doorHit(x, z) {
		const s = this.shopNear(x, z, 2.8);
		if (!s) return null;
		const sn = Math.sin(s.face), cs = Math.cos(s.face), dx = x - s.ex, dz = z - s.ez;
		const depth = -(dx * sn + dz * cs), lat = dx * cs - dz * sn;          // depth > 0: já passou da fachada para dentro do prédio
		return depth > 0.3 && depth < 1.8 && Math.abs(lat) < 1.3 ? s : null;
	},

	// Todo quadro (a pé): atravessou a soleira → entra. Fechada/bloqueada: a porta "trava" e o jogador volta para a calçada.
	autoEnter(game) {
		if (this.active || this.busy || game.mode !== 'player' || game.player.busy || game.motoRide) return;
		// Chegando perto de uma loja: as páginas de quem vai estar lá dentro já vão para a fila (ninguém surge depois de entrar).
		const now = performance.now();
		if (!this._pfT || now - this._pfT > 500) {
			this._pfT = now;
			const pp = game.player.position, near = this.shopNear(pp.x, pp.z, 14);
			if (near) { try { ShopLife.prefetch(near); } catch (e) { console.warn('[LOJAS] pré-carga:', e); } }
		}
		if (this._needRelease) { const ax = game.input.getMoveAxis(); if (Math.abs(ax.x) + Math.abs(ax.z) < 0.1 || performance.now() - this._leftAt > 4000) this._needRelease = false; else { const pp = game.player.position, hs = this.doorHit(pp.x, pp.z); if (hs) { pp.x = hs.x; pp.z = hs.z; } return; } }
		const p = game.player.position, s = this.doorHit(p.x, p.z);
		if (!s) return;
		const c = this.check(game, s);
		if (c.ok) { this.enter(game, s); return; }
		p.x = s.x; p.z = s.z;                                                    // porta trancada: de volta à calçada
		game.player.velocity.setAll(0);
		if (!this._lockT || performance.now() - this._lockT > 1800) { this._lockT = performance.now(); game._flash(c.msg); }
	},

	// The safe house as an interior: its door on the house's south wall (outside = where one comes back to, facing the street).
	safeHouseDoor() {
		if (!SafeHouse.placed) return null;
		if (this._home) return this._home;
		const d = SafeHouse.doorWorld();
		return (this._home = { id: 'safehouse', kind: 'safehouse', style: 'safehouse', name: 'Seu esconderijo', variant: 0, x: d.x, z: SafeHouse.oz - 1.25, face: Math.PI, ex: d.x, ez: SafeHouse.oz, safehouse: true });
	},
	// Wakes up in the safe house, next to the bed (new game, sleeping there, the "home" respawn, a game saved there): straight in,
	// without the fade, leaving whatever interior the player was in.
	wakeAtSafeHouse(game) {
		const home = this.safeHouseDoor(); if (!home) return;
		if (this.active && !this.active.shop.safehouse) this._doLeave(game);
		if (!this.active) this._doEnter(game, home, true);
		const o = this.STAGE, b = SafeHouse.spawn, pl = game.player;
		pl.teleport(new BABYLON.Vector3(o.x + b.x, 0, o.z + b.z));
		pl.root.rotation.y = b.face; pl.velocity.setAll(0);
		this.active.released = this.active.armed = false;
		game.camera.snapTo(this.focus(pl.position, game.camera, game.gameEngine.engine.getAspectRatio(game.camera.camera)));
	},
	// The furniture of a home can be used: the safe house always, a bought property once it is the player's.
	_owned(shop) { return !!shop.safehouse || RealEstate.isOwned(shop.home); },

	// ------------------------------------------------------------------ regras de entrada
	check(game, shop) {
		if (shop.safehouse) return game.wanted.level > 0 ? { ok: false, msg: 'A polícia está na sua cola — não dá para entrar' } : { ok: true };
		const hour = game.dayNight.hour;
		if (!Economy.isOpen(shop.style, hour) && !(shop.bank && Banks.canBreakIn(shop.bank))) return { ok: false, closed: true, msg: `FECHADO — abre às ${Economy.opensAt(shop.style)}h${shop.bank && shop.bank.tier === 'hq' ? ' (ou corte a energia do quarteirão)' : ''}` };
		if (game.wanted.level > 0) return { ok: false, msg: 'A polícia está na sua cola — não dá para entrar' };
		if (typeof Robbery !== 'undefined' && Robbery.closedToday(shop)) return { ok: false, closed: true, msg: 'FECHADO — assaltada hoje: a perícia está lá dentro (reabre amanhã)' };
		if (typeof Heists !== 'undefined' && Heists.closed(shop)) return { ok: false, closed: true, msg: 'FECHADO — a joalheria está reforçando a segurança depois do golpe' };
		return { ok: true };
	},

	// ------------------------------------------------------------------ prompt (texto do HUD)
	prompt(game) {
		const p = game.player.position;
		if (this.active) {
			if (this.active.shop.bank) { const bp = Banks.prompt(game); if (bp) return bp; }
			if (typeof Heists !== 'undefined') { const hp = Heists.scoutPrompt(game); if (hp !== null) return hp; }
			if (typeof Robbery !== 'undefined' && !game.shopUI.open) { const rp = Robbery.prompt(game); if (rp !== null) return rp; }
			const a = this.active, o = this.STAGE;
			if (game.shopUI.open || game.stashUI.open || game.propertyUI.open || game.sleeping) return '';
			if (HomeDecor.active) return '';                                       // (decorando: a barra de móveis tem as instruções)
			if (a.shop.home || a.shop.safehouse) { const hu = this.homeUse(game); if (hu) return this._owned(a.shop) ? (hu.prompt || this.HOME_PROMPT[hu.kind] || '') : (hu.kind === 'desk' ? '<b>E</b> ver a proposta de compra<small>você está só visitando o imóvel</small>' : '<b>VISITA</b><small>só dá para usar depois de comprar o imóvel</small>'); }
			const door = a.data.door, dc = o.x + (door.x0 + door.x1) / 2, nearExit = hypot(p.x - dc, p.z - (o.z + 1.2)) < 2.3;
			const cl = a.data.clerk, nearClerk = cl && hypot(p.x - (o.x + cl.x), p.z - (o.z + cl.z)) < 5.2 && p.z < o.z + cl.z + 0.6;
			const shop = a.shop, S = Economy.STYLES[shop.style] || {};
			if (typeof Phone !== 'undefined' && this.useNear(game, 'pool') && Phone.rivalPrompt(shop)) return Phone.rivalPrompt(shop);      // o Dentinho te esperando na sinuca
			if (typeof BarGames !== 'undefined' && BarGames.busy('pool') && this.useNear(game, 'pool')) return BarGames.prompt('pool');
			if (typeof BarGames !== 'undefined' && this.useNear(game, 'truco')) return BarGames.tablePrompt();      // a mesa de jogos: truco, dominó, porrinha, torneio
			if (this.useNear(game, 'pool')) return `<b>E</b> jogar sinuca<small>bola 8 apostada · de ${brl(Pool.STAKES[0].bet)} a ${brl(Pool.STAKES[Pool.STAKES.length - 1].bet)}</small>`;
			if (this.useNear(game, 'truco')) return `<b>E</b> jogar truco<small>1 × 1 ou em dupla, apostado · de ${brl(Truco.STAKES[0].bet)} a ${brl(Truco.STAKES[Truco.STAKES.length - 1].bet)}</small>`;
			const gu = this.gymUse(game);
			if (gu) { const ex = Gym.EX[gu.kind]; return `<b>E</b> ${ex.verb}<small>${!Physique.hasPass() ? 'compre a diária ou a mensalidade na recepção' : Physique.setsLeft(ex.id) > 0 ? `séries hoje: ${Physique.SETS_PER_DAY - Physique.setsLeft(ex.id)}/${Physique.SETS_PER_DAY} · ${ex.min}–${ex.max} kg` : 'séries de hoje feitas — volte amanhã'}</small>`; }
			if (nearClerk && typeof WorldMemory !== 'undefined' && WorldMemory.refuses(shop)) return `<b>E</b> falar com o atendente<small>ele lembra do assalto — não quer te atender</small>`;
			if (nearClerk) return `<b>E</b> ${S.guns ? 'ver o que tem à venda' : S.clothes ? 'ver roupas, tênis e bolsas' : S.gym ? 'diária, mensalidade e suplementos' : 'ver o cardápio'}<small>${shop.name} · ${Economy.zoneOf(shop).label}${S.gym ? (Physique.hasPass() ? ' · treino liberado' : ' · sem plano') : ''}</small>`;
			if (nearExit) return `<b>E</b> sair ${shop.safehouse ? 'de casa' : 'da loja'}<small>ou ande até a porta</small>`;
			if (HomeDecor.canOpen(game)) return HomeDecor.active ? '' : a.shop.empty && !HomeDecor.uses().length ? '<b>B</b> mobiliar a casa<small>imóvel sem móveis: compre cama, geladeira, cofre, baú e notebook</small>' : '<b>B</b> decorar a casa<small>compre, mova e posicione móveis</small>';
			return '';
		}
		const shop = this.shopNear(p.x, p.z);
		if (!shop || game.mode !== 'player') return '';
		const c = this.check(game, shop), S = Economy.STYLES[shop.style];
		if (shop.safehouse) return c.ok ? '<b>SEU ESCONDERIJO</b><small>a porta está aberta — é só entrar</small>' : `<b>ENTRADA BLOQUEADA</b><small>${c.msg}</small>`;
		if (!c.ok) return `<b>${c.closed ? 'FECHADO' : 'ENTRADA BLOQUEADA'}</b><small>${shop.name} — ${c.msg.replace('FECHADO — ', '')}</small>`;
		return `<b>${shop.name}</b><small>${S.label} · ${Economy.zoneOf(shop).label} — é só entrar pela porta</small>`;
	},

	// E: tenta entrar / sair / falar com o atendente. Retorna true se tratou.
	interact(game) {
		if (this.busy) return true;
		const p = game.player.position;
		if (this.active) {
			if (game.shopUI.open || game.stashUI.open || game.propertyUI.open || game.sleeping) return true;
			if (this.active.shop.bank && Banks.interact(game)) return true;
			if (typeof Heists !== 'undefined' && Heists.scouting(game) && Heists.scoutInteract(game)) return true;
			if (typeof Robbery !== 'undefined') {
				if (Robbery.session) {                                                // assalto em andamento: o E é do assalto (ou da porta)
					if (Robbery.interact(game)) return true;
					const d0 = this.active.data.door, dx = this.STAGE.x + (d0.x0 + d0.x1) / 2;
					if (hypot(p.x - dx, p.z - (this.STAGE.z + 1.2)) < 2.3) this.leave(game);
					return true;
				}
				if (Robbery.interact(game)) return true;                             // anunciar o assalto (arma na mão, no balcão)
			}
			const shop = this.active.shop;
			if (shop.home || shop.safehouse) {
				const hu = this.homeUse(game);
				if (hu && hu.kind !== 'desk' && !this._owned(shop)) { game._flash('Você está só visitando — compre o imóvel para usar isto'); return true; }
				if (hu) { if (hu.kind === 'bed') { if (!this._owned(shop)) game._flash('Só dá para dormir depois de comprar o imóvel'); else if (shop.safehouse) game._startSleep(); else game._startSleep('here', shop.home); } else if (hu.kind === 'desk') game.propertyUI.show(this.active.shop.home); else if (hu.kind === 'wardrobe') { game.menu.invView = 'equip'; game.menu.open('inventory'); } else game.stashUI.show(hu.kind); return true; }
			}
			const a = this.active, o = this.STAGE, door = a.data.door, dc = o.x + (door.x0 + door.x1) / 2;
			const cl = a.data.clerk;
			if (typeof Phone !== 'undefined' && this.useNear(game, 'pool') && Phone.rivalPlay(game, a.shop)) return true;
			if (typeof BarGames !== 'undefined' && BarGames.busy('pool') && this.useNear(game, 'pool')) { BarGames.open(game, 'pool'); return true; }
			if (typeof BarGames !== 'undefined' && this.useNear(game, 'truco')) { BarGames.table(game); return true; }
			if (this.useNear(game, 'pool')) { Pool.open(game, a.shop); return true; }
			if (this.useNear(game, 'truco')) { Truco.open(game, a.shop); return true; }
			const gu = this.gymUse(game);
			if (gu) { Gym.open(game, gu); return true; }
			if (cl && hypot(p.x - (o.x + cl.x), p.z - (o.z + cl.z)) < 5.2 && p.z < o.z + cl.z + 0.6) {
				if (typeof WorldMemory !== 'undefined' && WorldMemory.refuses(a.shop)) {                // assaltou aqui há pouco: sem atendimento
					const ca = ShopLife.active && ShopLife.clerk ? ShopLife.clerk.actor : this._actors[0];
					if (ca) Bubbles.say(ca, ['Não vou te atender. Vai embora!', 'Sai daqui! Eu chamo a polícia!', 'Some da minha loja!'][Math.floor(Math.random() * 3)], { tone: 'angry', ms: 2800, key: 'clerk' });
					game._flash('O atendente se recusa a te atender (ele lembra do assalto)');
					return true;
				}
				game.shopUI.show(a.shop); return true;
			}
			if (hypot(p.x - dc, p.z - (o.z + 1.2)) < 2.3) { this.leave(game); return true; }
			return false;
		}
		if (game.mode !== 'player' || game.player.busy) return false;
		const shop = this.shopNear(p.x, p.z);
		if (!shop) return false;
		const c = this.check(game, shop);
		if (!c.ok) { game._flash(c.msg); return true; }
		this.enter(game, shop);
		return true;
	},

	// ------------------------------------------------------------------ imóveis (casas compradas): mesma sala-palco, sem atendente
	HOME_STYLE: { 'Barraco': 'home_simple', 'Casa popular': 'home_simple', 'Kitnet / apto simples': 'home_simple', 'Apartamento': 'home_apto', 'Apartamento alto padrão': 'home_apto', 'Cobertura frente-mar': 'home_cobertura', 'Mansão / cobertura de luxo': 'home_mansion' },
	enterHome(game, prop) {
		if (this.active || this.busy) return false;
		if (game.wanted.level > 0) { game._flash('A polícia está na sua cola — não dá para entrar'); return true; }
		const style = this.HOME_STYLE[prop.type] || 'home_apto';
		const v = Math.floor(Pixel.hash(Economy._h(prop.id), 17, 3) * 5) % 5;
		const shop = { id: 'home' + prop.id, kind: style, style, name: prop.type, district: 'city', biome: 'residential', variant: v, x: prop.x, z: prop.z, face: 0, home: prop, reform: RealEstate.reformLevel(prop), empty: !RealEstate.isFurnished(prop) };
		this.enter(game, shop);
		return true;
	},
	// Ponto de uso `kind` (ex.: a mesa de sinuca do bar) ao alcance do jogador numa loja, ou null.
	useNear(game, kind, maxD = 1.6) {
		const a = this.active; if (!a) return null;
		const o = this.STAGE, p = game.player.position;
		for (const u of a.data.uses || []) {
			if (u.kind !== kind) continue;
			const cx = Math.max(o.x + u.x0, Math.min(p.x, o.x + u.x1)), cz = Math.max(o.z + u.z0, Math.min(p.z, o.z + u.z1));
			if (hypot(p.x - cx, p.z - cz) <= maxD) return u;
		}
		return null;
	},
	// Móvel de uso mais próximo (a ≤ 1,9 u do retângulo) dentro da casa, ou null.
	homeUse(game, maxD = 1.9) {
		const a = this.active; if (!a || !(a.shop.home || a.shop.safehouse)) return null;
		const o = this.STAGE, p = game.player.position;
		let best = null, bs = 1e9;
		for (const u of (a.data.uses || []).concat(HomeDecor.uses())) {                 // ao alcance (≤ maxD do retângulo): vence o de centro mais perto (móveis da decoração também)
			const cx = Math.max(o.x + u.x0, Math.min(p.x, o.x + u.x1)), cz = Math.max(o.z + u.z0, Math.min(p.z, o.z + u.z1));
			if (hypot(p.x - cx, p.z - cz) > maxD) continue;
			const s = hypot(p.x - (o.x + (u.x0 + u.x1) / 2), p.z - (o.z + (u.z0 + u.z1) / 2));
			if (s < bs) { bs = s; best = u; }
		}
		return best;
	},
	HOME_PROMPT: {
		bed: '<b>E</b> dormir e salvar o jogo<small>8 horas de sono: recupera a vida e grava o progresso</small>',
		fridge: '<b>E</b> abrir a geladeira<small>guarde comida e água</small>',
		safe: '<b>E</b> abrir o cofre<small>dinheiro e joias — dá para vender as joias</small>',
		chest: '<b>E</b> abrir o baú<small>armas, munição, kits e o que mais quiser</small>',
		desk: '<b>E</b> usar o notebook<small>mercado imobiliário: mudar-se, vender o imóvel</small>',
		wardrobe: '<b>E</b> abrir o armário<small>trocar de roupa</small>',
	},

	// ------------------------------------------------------------------ seta de saída (HD)
	_exitArrow(scene) {
		if (this._arrow) return this._arrow;
		const W = 512, H = 640, tex = new BABYLON.DynamicTexture('exitArrowTex', { width: W, height: H }, scene, true);
		const x = tex.getContext(), cx = W / 2;
		x.clearRect(0, 0, W, H);
		// forma: haste + ponta (aponta para baixo no desenho = sul = para a rua); cantos arredondados
		const shape = () => {
			x.beginPath();
			x.moveTo(cx - 80, 200); x.lineTo(cx + 80, 200); x.lineTo(cx + 80, 380); x.lineTo(cx + 196, 380);
			x.lineTo(cx, 600); x.lineTo(cx - 196, 380); x.lineTo(cx - 80, 380); x.closePath();
		};
		x.lineJoin = 'round'; x.lineCap = 'round';
		// brilho externo (halo verde suave)
		x.save(); x.shadowColor = 'rgba(40,255,140,0.9)'; x.shadowBlur = 46; shape(); x.fillStyle = 'rgba(30,200,110,0.55)'; x.fill(); x.restore();
		// sombra escura logo abaixo (descola do piso)
		x.save(); x.translate(0, 10); shape(); x.fillStyle = 'rgba(0,0,0,0.45)'; x.fill(); x.restore();
		// corpo: degradê verde de placa de saída, contorno branco grosso
		const g = x.createLinearGradient(0, 200, 0, 600);
		g.addColorStop(0, '#5dffa8'); g.addColorStop(0.55, '#16c46a'); g.addColorStop(1, '#0a8a48');
		shape(); x.fillStyle = g; x.fill();
		x.lineWidth = 22; x.strokeStyle = '#ffffff'; x.stroke();
		x.lineWidth = 6; x.strokeStyle = 'rgba(0,70,35,0.6)'; shape(); x.save(); x.clip(); x.stroke(); x.restore();
		// reflexo na metade de cima
		x.save(); shape(); x.clip();
		const hl = x.createLinearGradient(cx - 200, 0, cx + 120, 0); hl.addColorStop(0, 'rgba(255,255,255,0.0)'); hl.addColorStop(0.5, 'rgba(255,255,255,0.35)'); hl.addColorStop(1, 'rgba(255,255,255,0.0)');
		x.fillStyle = hl; x.fillRect(cx - 80, 200, 64, 180); x.restore();
		// placa "SAÍDA" acima da seta (horizontal, legível de cima): pílula verde-escura com borda branca
		const pill = (px, py, w, h, r) => { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); };
		x.save(); x.shadowColor = 'rgba(40,255,140,0.8)'; x.shadowBlur = 30; pill(36, 24, W - 72, 138, 44); x.fillStyle = '#0b5a32'; x.fill(); x.restore();
		const pg = x.createLinearGradient(0, 24, 0, 162); pg.addColorStop(0, '#1aa65e'); pg.addColorStop(1, '#0a6a3a');
		pill(36, 24, W - 72, 138, 44); x.fillStyle = pg; x.fill(); x.lineWidth = 12; x.strokeStyle = '#ffffff'; x.stroke();
		x.font = '900 104px Inter, "Segoe UI", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
		x.lineWidth = 12; x.strokeStyle = 'rgba(0,50,25,0.9)'; x.strokeText('SAÍDA', cx, 98); x.fillStyle = '#ffffff'; x.fillText('SAÍDA', cx, 98);
		tex.update(true); tex.hasAlpha = true;
		tex.anisotropicFilteringLevel = 8;
		const m = new BABYLON.StandardMaterial('exitArrow', scene);
		m.diffuseTexture = tex; m.useAlphaFromDiffuseTexture = true; m.emissiveColor = new BABYLON.Color3(1, 1, 1); m.diffuseColor = BABYLON.Color3.Black();
		m.specularColor = BABYLON.Color3.Black(); m.disableLighting = true; m.backFaceCulling = false;
		const mesh = BABYLON.MeshBuilder.CreatePlane('exitArrow', { width: 1.9, height: 2.375 }, scene);
		mesh.rotation.x = Math.PI / 2; mesh.material = m; mesh.isPickable = false; mesh.alphaIndex = -9; mesh.setEnabled(false);      // (logo depois da sala)
		return (this._arrow = mesh);
	},
	// Por quadro (dentro): desliza para a porta e volta, pulsa; mais apagada com o jogador em cima ou de costas para a saída.
	_tickArrow(game, dt) {
		const a = this.active, m = this._arrow; if (!a || !m) return;
		const o = this.STAGE, d = a.data.door, dc = o.x + (d.x0 + d.x1) / 2, p = game.player.position;
		a.at = (a.at || 0) + dt;
		const k = (a.at * 1.25) % 1, slide = 0.28 * (k < 0.7 ? k / 0.7 : 1 - (k - 0.7) / 0.3);
		m.position.set(dc, 0.2, o.z + 2.0 - slide);
		const near = Math.hypot(p.x - dc, p.z - (o.z + 1.4));
		const want = near < 0.9 ? 0.35 : 0.72 + 0.28 * Math.sin(a.at * 4.2);
		m.visibility += (want - m.visibility) * Math.min(1, dt * 8);
	},

	// ------------------------------------------------------------------ transição
	_fadeEl() {
		if (!this._el) {
			const el = this._el = document.createElement('div');
			el.style.cssText = 'position:fixed;inset:0;z-index:44;background:#000;opacity:0;pointer-events:none;display:none';
			document.body.appendChild(el);
		}
		return this._el;
	},
	_fade(cb) { this.busy = true; this._f = { phase: 'out', t: 0, cb }; this._fadeEl().style.display = 'block'; },
	// out (escurece) → troca de lugar → hold (preto até quem está na sala já estar desenhado, no máximo HOLD s) → in (clareia).
	// Uma troca que falha não pode prender a tela no preto: volta para a rua e clareia.
	HOLD: 2.5,
	tickFade(dt) {
		const f = this._f; if (!f) return;
		f.t += dt;
		const el = this._fadeEl(), D = 0.22;
		if (f.phase === 'out') {
			el.style.opacity = String(Math.min(1, f.t / D));
			if (f.t >= D) {
				f.phase = 'hold'; f.t = 0;
				try { f.cb(); } catch (e) { console.error('[LOJAS] a troca de lugar falhou:', e); this._recover(); }
			}
		} else if (f.phase === 'hold') {
			el.style.opacity = '1';
			if (f.t >= this.HOLD || this._stageReady()) { f.phase = 'in'; f.t = 0; }
		} else { el.style.opacity = String(Math.max(0, 1 - f.t / D)); if (f.t >= D) { el.style.display = 'none'; this._f = null; this.busy = false; } }
	},
	// Todos os bonecos da sala já desenhados (a página deles na GPU)? Fora (ou na casa, sem figurantes): pronto.
	_stageReady() {
		if (!this.active) return true;
		const drawn = (x) => !x.mesh.isEnabled() || !x.mesh.isVisible || !x.clip || !x.clip.npc || (x._pg && !x._npcWait);
		return this._actors.every(drawn) && (this._gymActors || []).every(drawn) && ShopLife.ready();
	},
	// Entrar/sair quebrou no meio: de volta à calçada, com a cidade de volta (melhor que a tela preta para sempre).
	_recover() {
		this._dropLife();
		if (this.active) {
			try { this._doLeave(game); } catch (e) {
				console.error('[LOJAS] e a saída também:', e);
				const a = this.active; this.active = null; this.obstacles = [];
				try { game.player.teleport(new BABYLON.Vector3(a.ret.x, 0, a.ret.z)); game.camera.setZoomMul(1); game.camera.snapTo(game.player.position); game.scene.physicsEnabled = true; this._unloadCity(game, false); } catch (e2) { console.error(e2); }
			}
		}
		if (game._flash) game._flash('Não deu para entrar agora');
	},

	enter(game, shop) {
		this._fade(() => this._doEnter(game, shop));
	},
	leave(game) {
		this._fade(() => this._doLeave(game));
	},

	_room(shop) {
		const key = ShopStyles.key(shop.style, shop.variant, shop.reform || 0, !!shop.empty);
		let r = this._rooms[key];
		const lru = this._lru || (this._lru = []);
		const touch = () => { const i = lru.indexOf(key); if (i >= 0) lru.splice(i, 1); lru.push(key); };
		if (r) { touch(); return r; }
		// Cache das salas pintadas: só as 4 mais recentes (cada uma é uma textura grande); as outras são refeitas se você voltar.
		while (lru.length >= 4) {
			const old = lru.shift(), o = this._rooms[old];
			if (o && (!this.active || this.active.room !== o)) { const m = o.mesh.material; o.mesh.dispose(); if (m) { if (m.diffuseTexture) m.diffuseTexture.dispose(); m.dispose(); } delete this._rooms[old]; }
		}
		touch();
		const data = shop.safehouse ? HouseView.stageRoom() : ShopStyles.get(shop.style, shop.variant, shop.reform || 0, !!shop.empty), IN = data.in, o = this.STAGE;
		const tex = data.canvas.toTexture(game.scene, { wrap: false, mips: false });
		data.canvas = null; delete ShopStyles._cache[key];                             // os pixels já estão na GPU
		tex.hasAlpha = true;
		const m = new BABYLON.StandardMaterial('shop_' + key, game.scene);
		m.diffuseTexture = tex; m.useAlphaFromDiffuseTexture = true; m.diffuseColor = BABYLON.Color3.Black(); m.specularColor = BABYLON.Color3.Black();
		m.emissiveColor = new BABYLON.Color3(1, 1, 1); m.disableLighting = true; m.backFaceCulling = false; m.alpha = 0.999; m.forceDepthWrite = false;
		const B = new MeshBatch(), x0 = o.x + IN.x0, x1 = o.x + IN.x1, z0 = o.z + IN.z0, z1 = o.z + IN.z1;
		B.top(x0, z0, x1, z1, 0.14, (x, z) => [(x - x0) / (x1 - x0), (z1 - z) / (z1 - z0)]);
		const mesh = B.build('shopRoom_' + key, game.scene, m, { receiveShadows: false });
		mesh.freezeWorldMatrix(); mesh.setEnabled(false);
		mesh.alphaIndex = -10;                                                           // (piso da sala antes de tudo: a seta de saída e os bonecos por cima)
		return (this._rooms[key] = { data, mesh });
	},

	_backdrop() {
		if (this._bd) return this._bd;
		const sc = game.scene, m = new BABYLON.StandardMaterial('shopBackdrop', sc);
		m.diffuseColor = BABYLON.Color3.Black(); m.emissiveColor = new BABYLON.Color3(0.03, 0.025, 0.03); m.specularColor = BABYLON.Color3.Black(); m.disableLighting = true;
		const g = BABYLON.MeshBuilder.CreateGround('shopBackdrop', { width: 160, height: 120 }, sc);
		g.position.set(this.STAGE.x + 12, 0.06, this.STAGE.z + 8); g.material = m; g.isPickable = false; g.setEnabled(false);
		return (this._bd = g);
	},

	// Atores decorativos (atendente e fregueses): reaproveitados entre as lojas.
	_useActors(game, list, shop) {
		const sc = game.scene, S = game.sprites.sheets, o = this.STAGE;
		const grp = shop.style === 'drugs' ? CharacterRig.VARIANT_GROUPS.poor : (shop.style === 'italian' || shop.style === 'japanese' || shop.style === 'jewelry' ? CharacterRig.VARIANT_GROUPS.biz : CharacterRig.VARIANT_GROUPS.casual);
		// frequentadores com tipo do gerador e um exercício (academia): atores próprios, animados por _gymActor
		const typed = list.filter((e) => e.type && typeof NpcArt !== 'undefined' && NpcArt.atlases && NpcArt.atlases[e.type]);
		list = list.filter((e) => !typed.includes(e));
		const GA = this._gymActors || (this._gymActors = []);
		typed.forEach((e, i) => {
			const sheet = NpcArt.sheet(e.type), nvar = NpcData.nvar(e.type), row = NpcArt.row(e.type, e.variant % nvar);
			let a = GA[i];
			if (!a) a = GA[i] = new SpriteActor(sc, sheet, row, 'gymActor' + i);
			else { if (a.sheet !== sheet) a.useSheet(sheet); a.setVariant(row); }
			a.gym = { clip: e.anim ? e.anim.clip : 'idle', w: e.anim ? e.anim.w : 'none', phase: 'rest', t: 0.5 + Math.random() * 3, reps: 0 };
			a.play(a.gym.clip, a.gym.w, { restart: true }) || a.play('idle', 'none');
			if (a.gym.clip !== 'walk') a.setPhase(0);
			a.setPosition(o.x + e.x, o.z + e.z); a.mesh.computeWorldMatrix(true); a.mesh.refreshBoundingInfo(); a.setHeading(e.face); a.setVisible(true); a.mesh.position.y = 0.5;
		});
		for (let i = typed.length; i < GA.length; i++) GA[i].setVisible(false);
		list.forEach((e, i) => {
			let a = this._actors[i];
			const variant = grp[0] + ((e.variant * 7 + shop.variant * 3) % (grp[1] - grp[0] + 1));
			const sheet = (e.variant & 1) ? S.civB : S.civA;
			if (!a) { a = this._actors[i] = new SpriteActor(sc, sheet, variant, 'shopActor' + i); }
			else { if (a.sheet !== sheet) a.useSheet(sheet); a.setVariant(variant); }
			a.play('idle'); a.setPosition(o.x + e.x, o.z + e.z); a.mesh.computeWorldMatrix(true); a.mesh.refreshBoundingInfo(); a.setHeading(e.face); a.setVisible(true); a.mesh.position.y = 0.5;
		});
		for (let i = list.length; i < this._actors.length; i++) this._actors[i].setVisible(false);
	},

	// `quiet`: waking up inside (no name flash).
	_doEnter(game, shop, quiet = false) {
		const room = this._room(shop), data = room.data, o = this.STAGE, pl = game.player;
		this._backdrop().setEnabled(true); room.mesh.setEnabled(true);
		const ret = { x: shop.x, z: shop.z, face: shop.face };
		this.active = { shop, data, room, ret, t: 0 };
		this.obstacles = data.obs.map((s) => ({ x0: o.x + s.x0, z0: o.z + s.z0, x1: o.x + s.x1, z1: o.z + s.z1, h: s.h }));
		this.obstacles.push({ x0: o.x + data.door.x0 - 0.1, z0: o.z - 6, x1: o.x + data.door.x1 + 0.1, z1: o.z - 0.25, h: 3 });      // tampa o vão da porta por fora: sem cair no vazio (a saída é o gatilho antes dele)
		pl.teleport(new BABYLON.Vector3(o.x + data.spawn.x, 0, o.z + data.spawn.z));
		pl.root.rotation.y = 0; pl.velocity.setAll(0);
		// Loja com clientela viva (ShopLife: atendente, clientes e garçom com rotina): os figurantes fixos saem (fica só quem tem
		// tipo do gerador e papel próprio — o segurança da joalheria, os da academia).
		let life = false;
		try { life = ShopLife.enter(game, shop, data); } catch (e) { console.error('[LOJAS] clientela:', e); this._dropLife(); }
		this._useActors(game, life ? data.patrons.filter((e) => e.type) : (data.clerk ? [data.clerk] : []).concat(data.patrons), shop);
		const ar = this._exitArrow(game.scene); ar.setEnabled(true); ar.visibility = 0; this._tickArrow(game, 0);
		this.zoom = shop.safehouse ? 0.36 : 0.5;                       // (o barraco é um cômodo só: a câmera chega mais perto)
		game.camera.setZoomMul(this.zoom);
		game.camera.snapTo(this.focus(pl.position, game.camera, game.gameEngine.engine.getAspectRatio(game.camera.camera)));
		game.scene.physicsEnabled = false;
		const mm = document.getElementById('minimap'); if (mm) mm.style.opacity = '0';
		if (!quiet) game._flash(`${shop.name}`);
		this._unloadCity(game, true);
		if (shop.bank) Banks.onEnter(game, shop);
		if (typeof Heists !== 'undefined') Heists.onEnter(game, shop);         // golpe em execução: a equipe entra junto
		HomeDecor.onEnterInterior(game, shop);                                  // casa própria: os móveis colocados por você
		if (typeof Bubbles !== 'undefined') Bubbles.clear();
		if (!shop.home && !shop.safehouse && typeof WorldMemory !== 'undefined') this._greet(game, shop, life);
		if (typeof News !== 'undefined') News.tvOn(shop);                     // bar, lanchonete, padaria, pizzaria: a TV ligada no jornal
		if (typeof Phone !== 'undefined' && !shop.home && !shop.safehouse) Phone.onEnterShop(game, shop);      // compromissos do celular (Neguinho, Dentinho)
	},

	// O atendente te reconhece (WorldMemory): cumprimenta pelo que lembra de você; um cliente cochicha; a loja assaltada avisa do PM.
	// (espera a tela clarear: a transição pode segurar no preto até os bonecos chegarem)
	_greet(game, shop, life) {
		const v = WorldMemory.onVisit(shop), G = WorldMemory.greeting(shop, v.first), M = WorldMemory.murmur(shop);
		const here = () => this.active && this.active.shop === shop;
		const L = this._later = [];                                               // (o game._delayed não roda dentro das lojas: Interiors.update)
		const later = (t, fn) => L.push({ t, fn: () => { if (!here()) return; if (this.busy) { later(0.25, fn); return; } fn(); } });
		later(0.7, () => {
			const clerk = life && ShopLife.clerk ? ShopLife.clerk.actor : (this._actors[0] && this._actors[0].mesh.isEnabled() ? this._actors[0] : null);
			if (clerk) Bubbles.say(clerk, G.text, { tone: G.tone, ms: 3800, key: 'clerk' });
		});
		if (M.length && life) later(2.8, () => {
			const cs = ShopLife.agents.filter((a) => a.role === 'customer' && a.actor && a.fade > 0.5 && !a.outside);
			if (cs.length) Bubbles.say(cs[Math.floor(Math.random() * cs.length)].actor, M[Math.floor(Math.random() * M.length)], { tone: 'whisper', ms: 3200 });
		});
		if (WorldMemory.guarded(shop)) later(1.6, () => game._flash('👮 Desde o assalto, tem um PM de plantão na loja'));
	},

	// Clientela fora (quebrou): os bonecos dela somem, o resto da loja segue.
	_dropLife() {
		try { ShopLife.leave(); } catch (e) { for (const ag of ShopLife.agents) if (ag.actor) ag.actor.setVisible(false); ShopLife.agents = []; ShopLife.active = false; }
	},

	_doLeave(game) {
		const a = this.active; if (!a) return;
		const pl = game.player;
		HomeDecor.onLeaveInterior(game);
		this._dropLife();
		if (typeof Bubbles !== 'undefined') Bubbles.clear();
		if (typeof News !== 'undefined') News.tvOff();
		a.room.mesh.setEnabled(false); this._bd.setEnabled(false);
		if (this._arrow) this._arrow.setEnabled(false);
		for (const x of this._actors) x.setVisible(false);
		for (const x of this._gymActors || []) x.setVisible(false);
		this.active = null; this.obstacles = [];
		this._needRelease = true; this._leftAt = performance.now();                  // saiu: só reentra depois de soltar as teclas (sem vai-e-vem na porta)
		pl.teleport(new BABYLON.Vector3(a.ret.x, 0, a.ret.z));
		pl.root.rotation.y = a.ret.face; pl.velocity.setAll(0);
		game.camera.setZoomMul(1);
		game.camera.snapTo(pl.position);
		game.scene.physicsEnabled = true;
		const mm = document.getElementById('minimap'); if (mm) mm.style.opacity = '1';
		game.shopUI.close();
		this._unloadCity(game, false);
		if (a.shop.bank) Banks.onLeave(game);
		if (typeof Robbery !== 'undefined') Robbery.onLeave(game);              // assalto: estrelas, testemunhas e rastros (já na calçada)
	},

	// Inside an interior the city is unloaded from the frame: every mesh of the map (buildings, terrain, props, people and cars) is
	// disabled — out of rendering, the shadow map and picking — and the streamed Havok colliders are released; the terrain stops
	// streaming (WorldBuilder). Leaving brings back exactly the same meshes (the world is frozen inside, nothing else touches them)
	// and the colliders around the door rebuild like after a teleport. The merged city buffers stay on the GPU: rebuilding the city
	// on the way out would freeze the game for seconds.
	_unloadCity(game, unload) {
		const cs = game.colliderStream;
		if (unload) {
			if (cs) cs.releaseAll();
			const lim = this.STAGE.x - 400, keep = this._hidden = [], stage = new Set([this._bd, this.active && this.active.room.mesh]);
			for (const x of this._actors) stage.add(x.mesh);
			for (const x of this._gymActors || []) stage.add(x.mesh);
			for (const m of ShopLife.meshes()) stage.add(m);
			if (this._arrow) stage.add(this._arrow);
			for (const m of game.scene.meshes) {
				if (!m.isEnabled(false) || stage.has(m)) continue;
				const bi = m.getBoundingInfo && m.getBoundingInfo(), cx = bi ? bi.boundingBox.centerWorld.x : m.position.x;
				if (cx > lim && !m.alwaysSelectAsActiveMesh) continue;                // (o palco da loja e o que está nele)
				if (m === game.player.root || (game.player.actor && m === game.player.actor.mesh)) continue;
				m.setEnabled(false); keep.push(m);
			}
			return;
		}
		if (this._hidden) { for (const m of this._hidden) m.setEnabled(true); this._hidden = null; }
		if (cs) cs.update(0, game.camera.target.x, game.camera.target.z);
	},

	// Atualização por quadro DENTRO da loja: anima atores, auto-sair pela porta.
	update(dt, game) {
		const a = this.active; if (!a) return;
		a.t += dt;
		if (this._later) for (let i = this._later.length - 1; i >= 0; i--) { const d = this._later[i]; d.t -= dt; if (d.t <= 0) { this._later.splice(i, 1); d.fn(); } }
		if (typeof News !== 'undefined') News.tvUpdate(dt);
		for (const x of this._actors) if (x.mesh.isEnabled()) x.update(dt, 1);
		for (const x of this._gymActors || []) if (x.mesh.isEnabled() && x.mesh.isVisible) this._gymActor(x, dt);
		if (ShopLife.active) {
			try { ShopLife.update(dt, game); } catch (e) {                             // (clientela quebrou: a loja fica com os figurantes fixos)
				console.error('[LOJAS] clientela:', e);
				this._dropLife();
				this._useActors(game, (a.data.clerk ? [a.data.clerk] : []).concat(a.data.patrons), a.shop);
			}
		}
		if (a.shop.bank) Banks.update(dt, game);
		if (typeof Robbery !== 'undefined') Robbery.update(dt, game);
		if (typeof Heists !== 'undefined') { Heists.interiorTick(dt); Heists.scoutTick(dt, game); }
		this._tickArrow(game, dt);
		const o = this.STAGE, p = game.player.position, d = a.data.door;
		const ax = game.input.getMoveAxis();
		if (Math.abs(ax.x) + Math.abs(ax.z) < 0.1 && a.t > 0.3) a.released = true;                    // a saída só vale depois de soltar as teclas uma vez
		if (a.released && p.z > o.z + 3.4) a.armed = true;
		if (!this.busy && a.armed && a.t > 0.6 && p.z < o.z + 0.55 && p.x > o.x + d.x0 && p.x < o.x + d.x1) this.leave(game);
	},

	// Frequentador da academia: SÉRIES de 6–10 repetições do exercício (o clipe é uma repetição) e DESCANSO entre elas (parado na
	// posição inicial, com a barra). Na esteira: caminha sem parar.
	_gymActor(a, dt) {
		const G = a.gym;
		if (!G || G.clip === 'walk' || G.clip === 'idle') { a.update(dt, G && G.clip === 'walk' ? 0.8 : 1); return; }
		G.t -= dt;
		if (G.phase === 'rest') {
			a.update(dt, 0); a.setPhase(0);
			if (G.t <= 0) { G.phase = 'set'; G.reps = 6 + Math.floor(Math.random() * 5); const c = a.clip; G.t = G.reps * (c ? c.frames / c.fps : 1.4) * 1.15; }
		} else {
			const p0 = a.phase;
			a.update(dt, 0.87);
			if (G.t <= 0 && a.phase < p0) { G.phase = 'rest'; G.t = 4 + Math.random() * 6; a.setPhase(0); }     // (fecha a série quando a repetição volta ao começo)
		}
	},

	// Estação de academia livre ao alcance (uso 'gym_*'), ou null.
	gymUse(game) { for (const k of ['gym_squat', 'gym_bench', 'gym_curl']) { const u = this.useNear(game, k, 1.0); if (u) return u; } return null; },

	// Enquadramento da câmera na sala (centro, com folga para a parede norte pintada).
	focus(pos, cam, aspect) {
		const a = this.active, o = this.STAGE; if (!a) return pos;
		const W = a.data.W, D = a.data.D, view = cam.viewHalf * (this.zoom || 0.5);
		const hx = W / 2 + 0.8, hz = D / 2 + 1.1, cx = o.x + W / 2, cz = o.z + D / 2 + 1.1;
		const halfW = view * Math.max(1, aspect), halfH = view, cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
		this._f2 = this._f2 || { x: 0, z: 0 };
		this._f2.x = hx <= halfW ? cx : cl(pos.x, cx - (hx - halfW), cx + (hx - halfW));
		this._f2.z = hz <= halfH ? cz : cl(pos.z, cz - (hz - halfH), cz + (hz - halfH));
		return this._f2;
	},
};

// Teste: entra direto (sem fade) numa sala de um estilo/variação — Interiors.debugEnter('italian', 2).
Interiors.debugEnter = function (style, v = 0) {
	const p = game.player.position;
	if (this.active) this._doLeave(game);
	const shop = { id: 'dbg' + style + v, kind: style, style, name: Economy.nameOf(style, 'dbg' + style + v), district: 'city', biome: 'commercial', variant: v, x: p.x, z: p.z, face: 0 };
	this._ret = null;
	this._doEnter(game, shop);
	return shop;
};
