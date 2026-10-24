// ============================================================================
// Game — orquestrador.
// Fase 1: Engine + Câmera iso + Player.
// Fase 2: Navigation (Recast) + pedestres com FSM + roubo por distância.
// O NavMesh carrega de forma assíncrona; o loop começa antes e a IA "entra"
// quando fica pronta (o player já é jogável nesse meio-tempo).
// ============================================================================

class Game {
	// Interface modules live in the open world and inside an interior (ui/UiLoop.js).
	static UI_WORLD = ['minimap', 'panel', 'prompt', 'hud'];
	static UI_INTERIOR = ['panel', 'prompt', 'hud'];
	// Teclas de troca de arma (1–9, 0, − e =). Uma tecla pode ter mais de uma arma: apertar de novo passa para a próxima que você tem
	// (2: pistola ↔ pistola com silenciador; =: as pesadas — RPG, lança-foguetes, minigun). WEAPON_SLOTS: tecla → a 1ª arma dela.
	static get WEAPON_KEYS() {
		return { '1': ['none'], '2': ['pistol', 'pistol_sil'], '3': ['smg'], '4': ['shotgun'], '5': ['bat'], '6': ['revolver'], '7': ['ak47'], '8': ['rifle'], '9': ['knife'], '0': ['grenade'], '-': ['molotov'], '=': ['rpg', 'launcher', 'minigun'] };
	}
	static get WEAPON_SLOTS() { const o = {}; for (const [k, l] of Object.entries(Game.WEAPON_KEYS)) o[k] = l[0]; return o; }
	// Todas as armas com a tecla de cada uma: [[tecla, arma], …] (na ordem das teclas).
	static get WEAPON_LIST() { return Object.entries(Game.WEAPON_KEYS).flatMap(([k, l]) => l.map((w) => [k, w])); }
	// Que arma a tecla `key` pega agora: a próxima que você tem depois da que está na mão (ou a 1ª que tem). null = nenhuma.
	_slotPick(key) {
		const l = Game.WEAPON_KEYS[key], inv = this.inventory, cur = this.player.weapon;
		if (!l) return null;
		if (this._cycleTo && l.includes(this._cycleTo)) { const w = this._cycleTo; this._cycleTo = null; return w; }
		const own = l.filter((w) => inv.owned(w === 'none' ? 'fists' : w));
		if (!own.length) return l[0];                                          // (quem chamou avisa que não tem)
		const i = own.indexOf(cur);
		return own[(i + 1) % own.length];
	}

	constructor(canvasId) {
		this.gameEngine = new GameEngine(canvasId);
		this.scene = this.gameEngine.createScene();

		this.input = new InputManager();
		this.input.onWeaponCycle = (d) => this._cycleWeapon(d);
		this.sprites = new SpriteLibrary(this.scene);
		Outfit.load(null);                           // roupa de sempre (o save, se houver, veste o que estava vestido); pinta a paleta do jogador
		this.carLib = new CarLibrary(this.scene);
		this.signals = new TrafficSignals(this.scene);
		this.dayNight = new DayNight(this.gameEngine);
		this.weather = new Weather(this);            // chuva fraca/forte e tempestade com trovões (escurece o dia, molha a pista)
		this.carLights = new CarLights(this.scene);
		this.carDamage = new CarDamage(this);        // fumaça, fogo, explosão e carcaças
		this.collisions = new Collisions(this);      // personagem × carro: empurrão e atropelamento
		this.doors = new CarDoors(this);             // portas dos carros abrindo/fechando (entrar, roubar, sair)
		this.lockpick = new Lockpick(this);          // mini-game de arrombar (roubo furtivo)
		this.tribunal = new TribunalUI(this);        // Tribunal do Crime (morte dentro da favela)
		this.endScreen = new EndScreen();            // telas "DETIDO" e "FIM DA LINHA" (pixel art)
		this.arrest = null;                          // rendição em andamento
		this.holdup = null;                          // assalto em andamento: { victim, t, dur, alertT, seen }
		this.hiding = null;                          // escondido numa caçamba/caixote: { spot, phase, seen, t, edge }
		this.death = null;                           // morte em andamento
		Vehicle.onImpact = (car, dv, dmg, dvx, dvz) => this._onCarImpact(car, dv, dmg, dvx, dvz);
		Vehicle.onThrow = (bike, variant, dx, dz, power, kind) => this._onThrow(bike, variant, dx, dz, power, kind);
		this.casualties = [];                        // pessoas avulsas arremessadas (motorista arrancado, ciclista caído)
		this.combat = new Combat(this.scene, this);
		Cover.game = this;                                   // cobertura: carros parados também contam (combat/Cover.js)
		this.fireworks = new Fireworks(this.scene);  // fogos de artifício (alarme dos fogueteiros)
		this._delayed = [];       // ações com atraso (faíscas, portas, sequências)
		this.inventory = new Inventory();
		this.pickups = new Pickups(this.scene, this);
		this.pickups.spawnInitial();
		this.inventoryOpen = false;
		this.reloading = 0;
		this._reloadWeapon = 'pistol';
		this._fireCd = 0;
		this._invTimer = 0;

		// Eventos de combate que mexem em "procurado".
		this.policeEvents = {
			// Ferir policial sobe ★ no ritmo normal; matar sobe 1★ na hora.
			onOfficerHit: (o, source) => { if (source === 'player') this.heat.commit('cop_assault', CrimeExposure.POLICE); },
			onOfficerKilled: (o, source) => {
				// O policial solta munição, dinheiro e, às vezes, uma arma ou kit (tropa de elite e exército: fuzil e mais $).
				if (source !== 'gang' && source !== 'police') this.pickups.dropLoot(o.position, o.kind || 'cop');      // (morto pelo tráfico: sem loot)
				if (source === 'player' && typeof WorldMemory !== 'undefined') WorldMemory.crime('cop', o.position.x, o.position.z);
				if (source === 'player') { this.heat.commit('cop_killed'); this._flash('Policial morto! Eles não vão deixar barato!'); if (o.op) { Standing.add('traffic', 4); if (this.missions) this.missions.onCopKilled(); } if (Standing.nearFavela(o.position.x, o.position.z)) Standing.addHeat(30, 'policial morto'); }       // (na operação o tráfico gosta; perto da favela, a pressão sobe)
			},
		};
		this.npcCtx = {
			game: this,                                          // (briga: o pedestre que revida precisa do jogador e do Combat)
			signals: this.signals,
			playerPos: () => this._playerState().pos,
			night: () => this.dayNight.night,
			events: {
				onKill: (npc, source) => {
					// Quem morre solta dinheiro (de qualquer causa); matar é crime se foi o jogador.
					this.pickups.dropLoot(npc.position, 'civilian');
					if (source !== 'player') return;
					if (typeof WorldMemory !== 'undefined') WorldMemory.crime(npc.mugger ? 'fight' : 'kill', npc.position.x, npc.position.z);
					this.heat.commit(npc.mugger ? 'assault' : 'homicide');
					if (!npc.mugger) Standing.harm(this, 6);                 // (o assaltante de rua: o bairro não chora — ver StreetCrime)
					if (this.npcManager) this.npcManager.alertViolence(npc.position, 18);
					this._flash(npc.mugger ? 'Assaltante abatido! A vítima escapou' : `Pedestre #${npc.id} morto!`);
				},
			},
		};
		this._warmSprites();
		this.player = new Player(this.scene, this.sprites, CityGrid.startPos());
		if (typeof PlayerLook !== 'undefined') PlayerLook.attach(this);      // visual do jogador (roupa, bolsa, aparência) no personagem 2,5D
		this.xray = new XRaySilhouette(this.scene, this.player.actor);      // 2.5D camera: the player's silhouette through what hides him
		const sp = SafeHouse.spawnWorld();
		if (sp) this.player.root.rotation.y = sp.face;      // acorda dentro da safe house, de frente para a porta
		this.camera = new CompassCamera(this.scene, this.gameEngine.engine, this.player.position);
		this.camera.fitPixelScale(this.gameEngine.viewHeight);
		Smooth.apply(this);                                  // gráfico suave (alta definição): antisserrilhado, densidade do monitor, texturas filtradas
		this.minimap = new Minimap('minimap');

		// IA (preenchida de forma assíncrona em _initAI).
		this.nav = new Navigation(this.scene);
		this.npcManager = null;
		this.aiReady = false;
		this.navDebugVisible = false;

		// Física + veículos (preenchidos de forma assíncrona em _initPhysics).
		this.physics = new Physics(this.scene);
		this.vehicleManager = null;
		this.physicsReady = false;

		// Desacoplamento do input: quem o teclado controla agora.
		this.mode = 'player';   // 'player' | 'car'
		this.activeCar = null;

		// Procurado + polícia (PoliceManager criado quando física E NavMesh prontos).
		this.wanted = new WantedSystem();
		this.heat = new HeatStateMachine(this);                       // flagrant, crime record, arrest and parole (police/HeatStateMachine.js)
		this.wanted.onChange = (n, prev, why) => { this.heat.onWantedChange(n); this._onWantedChange(n, prev, why); };
		this.policeManager = null;
		this.bustTimer = 0;

		this.hud = {
			pos: document.getElementById('playerPos'),
			vel: document.getElementById('playerVel'),
			state: document.getElementById('playerState'),
			fps: document.getElementById('fps'),
			npcs: document.getElementById('npcCount'),
			wanted: document.getElementById('wantedLevel'),
			action: document.getElementById('actionLog'),
			mode: document.getElementById('controlMode'),
			clock: document.getElementById('clock'),
			weather: document.getElementById('weatherText'),
			hp: document.getElementById('hpText'),
			weapon: document.getElementById('weaponText'),
			cash: document.getElementById('cashText'),
			hit: document.getElementById('hit'),
			forcesRow: document.getElementById('forcesRow'),
			forces: document.getElementById('forcesText'),
			prompt: document.getElementById('prompt'),
		};
		this._promptHtml = '';
		this.actionTimer = 0;
		this.touch = new TouchControls(this);        // botões na tela (celular sem controle) + interface responsiva
		this.ui = new Hud(this);                     // interface em pixel art (arma, procurado, vida/colete, veículo, mensagens)
		// Interface modules on their own clock, run after the scene is drawn (ui/UiLoop.js); the frame only says which ones are live.
		this.uiLoop = new UiLoop();
		this.uiLoop.add('minimap', 20, () => this._updateMinimap());
		this.uiLoop.add('panel', 15, (elapsed) => this.ui.update(elapsed));
		this.uiLoop.add('prompt', 10, () => this._updatePrompt());
		this.uiLoop.add('hud', 10, () => this._updateHud());
		this.wheel = new WeaponWheel(this);          // roda de armas (Tab / LB / botão ARMA), como a do GTA V
		this.gps = null;                             // destino marcado no mapa: { x, z, label } (só um marcador, sem rota)
		this.showPrompts = true;
		this.birds = new Birds(this);                 // aves: pombos, gaivotas, rolinhas, bem-te-vis (fogem de gente, carros e tiros)
		this.gameEngine.world.game = this;            // StreetProps (postes) usa os efeitos do jogo
		this.puddles = new Puddles(this);             // poças nas ruas: enchem com chuva forte e somem aos poucos
		this.chopper = null;                          // helicóptero que o jogador pilota (modo 'heli')
		this.choppers = [];                           // todos os helicópteros civis dos helipontos
		this.heliFall = null;                         // jogador caindo do helicóptero
		this._spawnChoppers();
		this.waterFx = new WaterFx(this.scene);       // marolas ao vadear/nadar
		this.dev = new DevMode(this);                // modo dev (ligado nas Configurações): painel de testes
		this.menu = new PauseMenu(this);             // menu de pausa (mapa HD, inventário, configurações)
		this.minimap.iconOf = (k) => this.menu.icon(k);      // selos dos lugares no radar (os mesmos do mapa de pausa)
		this.aim = new Aim(this);                    // mira do jogador (manual: mouse, analógico direito ou o botão de tiro do celular — combat/Aim.js)
		PadNav.init(this);                           // controle nas telas de mouse/teclado (menus, janelas, tela inicial, sinuca)
		this.stash = new Stash();                    // geladeira, cofre e baú da safe house
		this.stashUI = new StashUI(this);
		this.shopUI = new ShopUI(this);              // compra nas lojas (interiores)
		Traces.game = this; Business.game = this; CarCare.game = this; Mechanic.game = this;      // rastros, negócios, mecânica (crime/, economy/, vehicle/)
		this.sleeping = null;                        // dormindo na cama (salva o jogo): { phase, t }
		// Janelas que só nascem quando física + navegação ficam prontas (_maybeInitPolice): até lá (ou se o Havok não carregar — sem
		// internet na 1ª visita, CDN fora do ar) ficam estes "vazios", e o jogo não quebra lendo .open/.cool a cada quadro.
		const idleUI = () => ({ open: false, cool: 0, update() {}, show() {} });
		this.motoUI = idleUI(); this.motoRide = null;
		this.propertyUI = idleUI(); this.carUI = idleUI();

		this._bindResize();
		// O carregamento só começa quando o menu principal chama begin(); NADA é desenhado até tudo estar pronto (ver _boot).
	}

	// Chamado pelo MainMenu: 'new' ou 'load' (dados do save em localStorage). Roda a fila de carregamento uma única vez.
	begin(mode, saveData) {
		if (this._beginCalled) return this._bootPromise;
		this._beginCalled = true;
		this._pendingSave = mode === 'load' ? saveData : null;
		this._bootPromise = this._boot();
		return this._bootPromise;
	}

	// "Fotografa" os clipes mais usados já na carga, para não engasgar no primeiro uso (listas em CharacterSheet.sets / ESSENTIAL).
	_warmSprites() {
		const t0 = performance.now();
		const S = this.sprites.sheets, sets = CharacterSheet.sets();
		// Essencial agora (o que aparece no primeiro segundo de jogo).
		for (const [k, list] of Object.entries(CharacterSheet.ESSENTIAL)) S[k].warm(list);
		console.log(`[SPRITES] essencial em ${(performance.now() - t0).toFixed(0)} ms`);
		// O resto é assado aos poucos (fila). Tropa de elite e exército NÃO entram na carga: só com 3★/5★, e a varredura de memória
		// (_sweep) descartava os clipes sem uso 60 s depois — eram assados na hora, travando o jogo no meio da perseguição. Ver _queueForces.
		for (const k of ['player', 'civA', 'civB', 'police', 'courier', 'rider']) S[k].queue(sets[k]);
	}

	// Tropa de elite (SWAT, metralhadora; entra com 3★) e exército (fuzil, desenhado com a arma longa; entra com 5★): assados aos poucos,
	// em segundo plano, assim que o procurado chega a 2★/4★ — um nível antes de precisar deles.
	_queueForces(stars) {
		const S = this.sprites.sheets, sets = CharacterSheet.sets();
		if (stars >= 2) S.swat.queue(sets.swat);
		if (stars >= 4) S.army.queue(sets.army);
	}

	async _initPhysics() {
		try {
			await this.physics.init();
			this.physics.plugin.setTimeStep(1 / 60); this.physics.plugin._useDeltaForWorldStep = false;      // física em passo fixo (ver _render)
			this.physics.addStaticGround(this.gameEngine.ground);
			this.colliderStream = new ColliderStreamer(this.physics, this.gameEngine.colliders, Config.perf.colliderRadius, 50);        // só os colisores perto da câmera existem no Havok
			this.colliderStream.refresh(this.camera.target.x, this.camera.target.z);
			if (this.gameEngine.world.terrain) this.gameEngine.world.terrain.attachPhysics(this.physics);      // paredões das serras

			await CarArt.ready;                             // atlas dos carros (decodificado desde a carga da página)
			CarArt.init(this.scene);
			if (CarArt3D.available()) { await CarArt3D.ready; CarArt3D.init(this.scene); }      // carros em 3D (descomprimidos desde a carga da página)
			SkidMarks.init(this.scene); SkidMarks.game = this;                  // marcas de pneu no chão (derrapagem, freada, arrancada)
			Blood.init(this.scene);                                              // sangue no chão (respingo de tiro, rastro de quem sangra)
			Footprints.init(this.scene);                                         // pegadas na areia (jogador e pedestres; somem aos poucos)
			Throwables.init(this);                                               // granada e molotov: mira tracejada, voo, explosão, fogo no chão
			Rockets.init(this);                                                  // foguetes do RPG e do lança-foguetes (e a trava dele)
			SparkFx.init(this.scene);                                            // faíscas em riscos e lascas (pneu furado a tiro)
			this.vehicleManager = new VehicleManager(this.scene, this.physics, this.gameEngine.shadowGenerator, this.carLib);
			this.traffic = new TrafficManager(this.scene, this.physics, this.vehicleManager, this.carLib, this.signals, this.gameEngine.shadowGenerator);
			this.traffic.sprites = this.sprites;            // (bicicletas e motos usam os sprites de piloto)
			this.traffic.spawn();
			this.boatLib = new BoatLibrary(this.scene, this.carLib.palette);        // jet skis, lanchas e barcos (marina + soltos pela água)
			this.boats = new BoatManager(this, this.scene, this.physics, this.vehicleManager, this.boatLib, this.gameEngine.shadowGenerator);
			this.boats.spawn();
			this.physicsReady = true;
			this._flash(`${this.vehicleManager.vehicles.length} carros na cidade — chega perto e aperta F`);
			this._maybeInitPolice();
		} catch (err) {
			console.error('[FÍSICA] Falha ao iniciar Havok:', err);
			this._flash('Havok falhou (ver console)');
		}
	}

	async _initAI() {
		try {
			await this.nav.init(this.gameEngine.world.street ? this.gameEngine.world.street.lamps : []);
			this.npcManager = new NPCManager(this.scene, this.nav, this.sprites, this.npcCtx);
			this.npcManager.spawn(Config.npc.count);
			this.aiReady = true;
			this._flash(`${this.npcManager.count} pedestres na rua`);
			this._maybeInitPolice();
		} catch (err) {
			console.error('[IA] Falha ao iniciar navegação:', err);
			this._flash('NavMesh falhou (ver console)');
		}
	}

	// A polícia precisa de física (viaturas) E NavMesh (policiais a pé).
	_maybeInitPolice() {
		if (this.policeManager || !this.aiReady || !this.physicsReady) return;
		this.policeManager = new PoliceManager(this.scene, this.physics, this.nav, this.gameEngine.shadowGenerator, this.sprites, this.carLib, this.traffic, this);
		this.policeManager.spawn();
		this.gangs = new GangManager(this);
		this.motoTaxis = new MotoTaxis(this);                 // mototáxis: rápidos, só nas vielas, fora do trânsito
		this.barricades = new Barricades(this);              // barricadas em chamas nas vielas durante a operação
		this.watch = new FavelaWatch(this);                  // fogueteiros (telhados) e olheiros (cantos): alarme da favela
		Laundry.game = this;                                 // fachadas: renda diária e avisos
		this.motoUI = new MotoTaxiUI(this); this.motoRide = null;     // ponto de mototáxi: tela de destinos e corrida
		// ESC só abre o menu de pausa quando é a ÚNICA função dele naquele momento: se havia uma janela (loja, baú, imóvel, mototáxi,
		// tribunal, arrombar…) aberta quando a tecla desceu, o ESC é dela (fecha/cancela) e é descartado aqui (fase de captura, antes dos handlers).
		this._escModal = false;
		window.addEventListener('keydown', (e) => { if (e.key === 'Escape') this._escModal = this._modalUiOpen(); }, true);
		this.propertyUI = new PropertyUI(this);              // ficha dos imóveis à venda / casas compradas
		this.carUI = new CarUI(this); Garage.game = this;      // concessionárias e garagens (economy/Dealers.js, economy/Garage.js)
		PersonalBike.init(this);                     // a bicicleta do jogador, no quintal de casa (economy/PersonalBike.js)
		this.goals = new Goals(this);                        // metas de carreira (o que fazer a seguir + recompensas)
		this.missions = new Missions(this);                  // missões do tráfico (pedidas na boca de fumo)
		this.careers = new Careers(this);                    // carreiras do crime: desmanche, ladrão, armeiro, estelionato, jogo do bicho
		this.skills = new SkillTree(this);                   // nível do personagem, árvore de habilidades e notoriedade
		this.achievements = new Achievements(this);          // conquistas e platina
		this.empire = new Empire(this);                      // império: soldados, lavagem, influência, domínio, estações
		Physique.game = this; Physique.load(null);           // físico: começa normal (o save, se houver, sobrescreve)
		this.op = new PoliceOperation(this);                 // operação policial na favela (única hora em que a polícia entra)
		this._flash(`Polícia patrulhando: ${this.policeManager.cars.length} viaturas, ${this.policeManager.officers.length} a pé`);
	}

	_bindResize() {
		window.addEventListener('resize', () => {
			this.gameEngine.resize();
			this.camera.fitPixelScale(this.gameEngine.viewHeight);
			this.camera.onResize();
			this._redraw = true;                         // redimensionar apaga a tela: com o mundo parado (menu/tela de fim) redesenha 1×
		});
	}

	// ------------------------------------------------------------ carregamento
	_loading(text, p) {
		const t = document.getElementById('ls-text'), f = document.getElementById('ls-fill');
		if (t) t.textContent = text;
		if (f) f.style.width = Math.round(p * 100) + '%';
		if (window.Intro) Intro.progress(p);
	}

	// Ciclo de vida: o loop de render NÃO existe até tudo o que é pesado terminar, tudo escondido atrás das telas de abertura:
	//   PRÉ-CARGA (preload — não depende de novo/carregar, então roda já na tela do estúdio, antes do menu):
	//     1) física (Havok) e navegação;  2) assar TODOS os sprites (personagens, barcos; os carros vêm prontos do atlas) sem orçamento por
	//     quadro;  3) congelar os materiais estáticos do mundo;  4) preparar o 1º estado do jogo e COMPILAR os shaders de tudo que existe
	//     (scene.whenReadyAsync);
	//   BOOT (_boot — depois de Novo Jogo / Carregar, na tela de carregamento #main-menu): espera a pré-carga (normalmente já pronta: a
	//     barra só corre pelos passos que faltam), aplica o save e só então começa o loop — a tela some DEPOIS do 1º quadro desenhado (_start).
	// (Quase tudo é gerado por código; os carros vêm do atlas embutido em assets/cars/carros-atlas.js, decodificado desde a carga da página.)
	// `report(texto, fração 0..1, ms estimados do passo)` mostra o andamento: a tela do estúdio ou, se ainda rodando no boot, a barra.
	preload(report = null) {
		if (report) this._preReport = report;
		return this._preP || (this._preP = this._preload());
	}
	async _preload() {
		const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));      // (um quadro: a tela mostra o passo antes do pesado)
		const say = (t, p, ms) => { if (this._preReport) this._preReport(t, p, ms); };
		try {
			say('Ligando a física, o trânsito e os pedestres…', 0.5, 3500);
			await frame();
			await Promise.all([this._initAI(), this._initPhysics()]);

			say('Montando os personagens…', 0.62, 1500);
			await Promise.race([SpriteIO.ready, new Promise((r) => setTimeout(r, 15000))]);      // arte em PNG ainda baixando (rede lenta: segue procedural)
			await CharArt.ready;                                                      // atlas dos personagens (decodificado desde a carga da página)
			if (typeof NpcArt !== 'undefined' && NpcArt.ready) await NpcArt.ready;     // personagens 2,5D (assets/baked: o protagonista, decodificado durante a abertura)
			const s0 = performance.now();
			for (let guard = 0; guard < 2000; guard++) {
				const more = this.sprites.pump(40);                                   // (personagens e carros vêm dos atlas: quase nada a assar)
				if (!more) break;
				if (guard % 3 === 0) { say('Montando os personagens…', 0.62 + 0.1 * Math.min(1, (performance.now() - s0) / 6000), 600); await frame(); }
			}

			say('Preparando os materiais…', 0.76, 300);
			await frame();
			this._freezeStaticMaterials();

			say('Compilando os gráficos…', 0.97, 2500);
			await frame();
			this._update(1 / 30);                                    // 1º estado do jogo (carros, NPCs, luzes) para os materiais existirem
			await this.scene.whenReadyAsync();                       // todas as malhas ativas com shader compilado e texturas prontas
			this.scene.render();                                     // aquece o pipeline (sombras, sprites, brilhos) fora da vista
			this.scene.render();
			say('Pronto', 1, 300);
		} catch (err) {
			console.error('[BOOT] falha na pré-carga:', err);
			this._preFailed = true;
		}
		this._preDone = true;
	}

	async _boot() {
		const wait = (ms) => new Promise((r) => setTimeout(r, ms));
		if (!this._preDone) {                                       // (sem a tela do estúdio, ou ela foi pulada: a barra mostra a pré-carga de verdade)
			this._loading('Ligando a física, o trânsito e os pedestres…', 0.06);
			await this.preload((t, p) => this._loading(t, 0.06 + 0.86 * p));
		} else {                                                    // o pesado já foi na tela do estúdio: a barra corre pelos passos que faltam,
			this._loading('Preparando a cidade…', 0.38); await wait(430);      // num ritmo em que dá para vê-la encher (transição de 0,5 s)
			this._loading(this._pendingSave ? 'Carregando o seu jogo…' : 'Acordando no esconderijo…', 0.74); await wait(430);
		}
		this._loading(this._preFailed ? 'Falha ao carregar (veja o console) — iniciando assim mesmo' : 'Pronto!', 1);
		if (this._preDone) await wait(450);                         // (a barra chega aos 100% antes da tela sair)
		this._bootDone = true;
		HomeDecor.init(this);
		try { await HomeDecor.startSession(this._pendingSave ? SaveGame.slot : null); } catch (e) { console.error('[DECOR] falha ao abrir os móveis do save:', e); }
		if (this._pendingSave) {
			try { if (SaveGame.apply(this, this._pendingSave)) this._flash('Jogo carregado — ' + SaveGame.label(this._pendingSave)); } catch (e) { console.error('[SAVE] falha ao aplicar:', e); }
		}
		this._releaseStaticGeometry();
		this.renderCuller = new RenderCuller(this.scene);           // particionamento espacial do render (core/Spatial.js)
		this.renderCuller.build();
		console.log(`[RENDER] grade de culling: ${this.renderCuller.stats.static} malhas estáticas em células de ${this.renderCuller.cell} u`);
		const p0 = this.player.position;
		if (SafeHouse.inside(p0.x, p0.z)) Interiors.wakeAtSafeHouse(this);      // (começo de jogo, ou um jogo salvo na safe house)
		if (!this._pendingSave && SafeHouse.placed) this._flash('Você acordou no seu esconderijo, na favela — a porta turquesa fica ao sul');
		this._pendingSave = null;
		this._start();
	}

	// Varredura de manutenção (a cada 3 s): solta da memória o que foi carregado e não está em uso. NÃO apaga o mundo (recarregar a cidade
	// custaria segundos de travada): o que é caro de refazer e está em uso fica; o resto sai.
	//   • clipes de animação das forças SITUACIONAIS (SWAT, exército) sem uso há 60 s. As folhas do dia a dia (jogador, civis, polícia,
	//     motos) ficam inteiras na memória (~55 MB, número fechado): re-assar um clipe na hora custa 20–50 ms no PC e 150–400 ms num
	//     celular — sacar a arma de novo depois de um minuto travava o jogo. As forças só voltam com 2★/4★ (ver _queueForces);
	//   • folhas de carro (amassados, portas, modelos) sem uso — CarLibrary.sweep;
	//   • lista de atores vivos (atores cujo quad já foi descartado saem do registro);
	//   • amostra o heap para a barra de capacidade e a tendência de vazamento (Perf).
	_sweep() {
		const now = performance.now() / 1000;
		let actors = 0;
		for (const a of SpriteActor.live) {
			if (!a.mesh || a.mesh.isDisposed()) { SpriteActor.live.delete(a); continue; }
			actors++;
			if (a.clip) a.clip._used = now;
			if (a.sheet) a.sheet._used = now;
		}
		let freed = 0, clips = 0;
		for (const [name, sh] of Object.entries(this.sprites.sheets)) {
			const situational = name === 'swat' || name === 'army';
			for (const [key, c] of Object.entries(sh.clips)) {
				clips++;
				if (!situational || c.shared) continue;                              // (atlas vetorial: textura única, nunca sai)
				if (c._used === undefined) { c._used = now; continue; }              // recém-assado: conta a partir de agora
				if (now - c._used < 60) continue;
				c.material.dispose(); c.texture.dispose(); delete sh.clips[key]; freed++;
			}
		}
		// carros: nada a liberar — todos os modelos, cores, amassados e portas estão num atlas único (CarArt), sempre na GPU
		const cars = CarArt.cars ? CarArt.cars.count - CarArt.cars._free.length : 0;
		if (freed) console.log(`[MEMÓRIA] ${freed} clipes/folhas sem uso liberados da GPU`);
		this._sweepFreed = (this._sweepFreed || 0) + freed;
		Perf.sampleHeap();
		this._sweepInfo = `${actors} atores · ${clips} clipes de personagem · ${cars} carros no lote do atlas · ${typeof CarArt3D !== 'undefined' ? CarArt3D.live.size : 0} carros 3D · ${this._sweepFreed} liberados desde o início`;
	}

	// Malhas estáticas (transform congelado, buffers não atualizáveis): a GPU já tem os vértices; a cópia na RAM de normais, UVs e
	// cores (o Babylon guarda para picking/serialização, que o jogo não usa) é liberada. ~80 MB a menos de heap. Repetido de vez em quando para pegar
	// o que é refeito em jogo (postes quebrados etc.). O chão fica de fora (a física dele é uma malha de triângulos).
	_releaseStaticGeometry() {
		let freed = 0;
		for (const g of this.scene.geometries) {
			if (g._dmReleased || !g.meshes.length) continue;
			const vbs = g.getVertexBuffers(); if (!vbs) continue;
			if (Object.values(vbs).some((vb) => vb.isUpdatable())) { g._dmReleased = true; continue; }
			if (!g.meshes.every((m) => m.isWorldMatrixFrozen && m !== this.gameEngine.ground && !m.physicsBody)) continue;
			// posições e índices ficam (caixas envolventes, ordenação de transparentes); normais, UVs e cores só vivem na GPU
			for (const [kind, vb] of Object.entries(vbs)) if (kind !== BABYLON.VertexBuffer.PositionKind && vb._buffer && vb._buffer._data) { vb._buffer._data = null; freed++; }
			g._dmReleased = true;
		}
		if (freed) console.log(`[MEMÓRIA] ${freed} buffers de vértices estáticos liberados da RAM (ficam só na GPU)`);
	}

	// Materiais do mundo que nunca mudam de estado de shader (defines): congela (não reavalia a cada quadro). A água entra também: a
	// animação reescreve os pixels da MESMA textura (WorldBuilder.update), sem trocar textura nem offset.
	_freezeStaticMaterials() {
		const world = this.gameEngine.world, list = [];
		const walk = (o) => { for (const k of Object.keys(o)) { const m = o[k]; if (m instanceof BABYLON.Material) list.push(m); else if (m && typeof m === 'object' && !(m instanceof BABYLON.BaseTexture)) walk(m); } };
		walk(world.mats);
		for (const m of list) m.freeze();
		console.log(`[CARGA] ${list.length} materiais congelados`);
	}

	_start() {
		// Teto de FPS (Config.perf.fpsCap, 30 por padrão): o próprio loop do motor só dispara a cada 1000/fpsCap ms
		// (GameEngine: customAnimationFrameRequester), então lógica, render e o contador de FPS rodam juntos a 30 Hz,
		// com o dt real entre eles.
		let last = performance.now();
		this.autoQuality = new AutoQuality(this);
		// Caixa-preta (core/HangProbe.js): marca também as bordas do quadro do motor, para separar "dentro" de "entre" quadros.
		const eng = this.gameEngine.engine;
		eng.onBeginFrameObservable.add(() => HangProbe.mark('motor: começo do quadro'));
		eng.onEndFrameObservable.add(() => HangProbe.mark('motor: fim do quadro'));
		this.gameEngine.runRenderLoop(() => {
			const now = performance.now();
			if (Pool.active || Truco.active || Porrinha.active || Domino.active) { last = now; return; }  // mini-jogos do bar: o mundo para por completo
			HangProbe.mark('laço: AutoQuality');
			this.autoQuality.tick((now - last) / 1000, this.menu.isOpen);
			const dt = Math.min((now - last) / 1000 * (this.timeScale || 1), 0.05);
			last = now;
			Perf.frameStart();
			// Um erro em QUALQUER sistema não pode congelar o jogo: sem o try, a exceção subia até o laço do Babylon, que parava de
			// agendar quadros (tela travada para sempre). Agora o quadro com erro é pulado, o erro vai para o console (1× por mensagem
			// a cada 5 s, sem inundar) e o jogo segue.
			try { this._update(dt); } catch (e) { this._frameError('update', e); }
			try { this._render(dt); } catch (e) { this._frameError('render', e); }
			try { this.uiLoop.flush(); } catch (e) { this._frameError('interface', e); }      // (a cena já foi entregue à GPU)
			Perf.lap('interface');
			Perf.frameEnd();
			HangProbe.mark('laço: fim do quadro');
			if (this._bootDone && !this._loadingHidden) {            // 1º quadro real desenhado: agora (depois da pintura) a tela de carregamento sai
				this._loadingHidden = true;
				requestAnimationFrame(() => requestAnimationFrame(() => {
					if (window.Intro) Intro.done();                  // a tela inicial (fundos + barra) some em fade
				}));
			}
		});
	}

	// Resgate: veículo (ou o jogador) que a física lançou para fora do mundo — posição infinita, gigante ou NaN, típico de um corpo que
	// nasce/é teleportado dentro de outro — volta, parado, para o último lugar bom (guardado a cada 0,5 s). Sem isto, a primeira
	// busca em grade com essa posição (objetos de rua, IA, câmera…) entrava em laço infinito e a aba congelava. Roda logo depois
	// dos passos de física, antes de qualquer sistema usar as posições.
	_rescueStrays(dt) {
		const ok = (p) => inWorld(p.x, p.z) && Number.isFinite(p.y);
		for (const car of this.carDamage ? this.carDamage.allCars() : []) {
			if (!car || !car.body || car.body.isDisposed()) continue;
			const p = car.position;
			if (ok(p)) {
				car._safeT = (car._safeT || 0) - dt;
				if (car._safeT <= 0) {
					car._safeT = 0.5;
					const f = car.fwdToRef(this._rsF || (this._rsF = new BABYLON.Vector3())), s = car._safe || (car._safe = { x: 0, z: 0, h: 0 });
					s.x = p.x; s.z = p.z; s.h = Math.atan2(f.x, f.z);
				}
				continue;
			}
			const s = car._safe || { x: this.camera.target.x, z: this.camera.target.z, h: 0 };
			console.warn(`[RESGATE] ${car.spec && car.spec.id} fora do mundo em (${p.x}, ${p.y}, ${p.z}) — devolvido a (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
			HangProbe.mark('resgate: veículo fora do mundo');
			car.teleport(s.x, s.z, s.h);
		}
		if (this.mode === 'player' && this.player) {
			const p = this.player.position;
			if (ok(p)) {
				this._plSafeT = (this._plSafeT || 0) - dt;
				if (this._plSafeT <= 0) { this._plSafeT = 0.5; (this._plSafe || (this._plSafe = new BABYLON.Vector3())).set(p.x, 0, p.z); }
			} else {
				const s = this._plSafe || new BABYLON.Vector3(this.camera.target.x, 0, this.camera.target.z);
				console.warn(`[RESGATE] jogador fora do mundo em (${p.x}, ${p.y}, ${p.z}) — devolvido a (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
				HangProbe.mark('resgate: jogador fora do mundo');
				this.player.teleport(s.clone());
				if (this.player.velocity) this.player.velocity.setAll(0);
			}
		}
	}

	_frameError(where, e) {
		const k = where + ':' + (e && e.message), now = performance.now(), log = this._errLog || (this._errLog = new Map());
		if (now - (log.get(k) || -1e9) < 5000) return;
		log.set(k, now);
		console.error(`[QUADRO] erro em ${where} (o jogo continua):`, e);
	}

	// Desenha e avança a física em passos FIXOS de 1/60 s (independente do FPS visual): com o teto de 30 FPS, cada quadro roda
	// 2 passos do Havok — entrada, colisão e veículos continuam em 60 Hz e nada atravessa mureta fina por causa de um dt grande.
	_render(dt) {
		this._frameDt = dt * 1000;
		Perf.lap('outros');
		// Mundo PARADO atrás de um blur (menu de pausa, telas "DETIDO" / "FIM DA LINHA"): a imagem não muda, então desenha mais 2 quadros
		// (para assentar) e para — a tela guarda o último. Antes a cena inteira (com todos os carros) era redesenhada 30×/s só para o
		// navegador borrar de novo a cada quadro, e a física continuava andando atrás das telas de fim: em GPU fraca o jogo parecia travado.
		const still = this.menu.isOpen || (this.arrest && this.arrest.phase === 'screen') || (this.death && this.death.phase === 'screen');
		this._stillN = still ? (this._stillN || 0) + 1 : 0;
		if (this._stillN > 2 && !this._redraw) { Perf.lap('render (cena)'); Perf.lap('física'); return; }
		this._redraw = false;
		this.xray.update();
		this.scene.render();                                         // (1 passo de 1/60 dentro do render)
		Perf.lap('render (cena)');
		const pe = this.scene.getPhysicsEngine();
		if (pe && this.physicsReady && !Interiors.active && !this.menu.isOpen) for (let n = Math.min(3, Math.round(dt * 60)) - 1; n > 0; n--) pe._step(1 / 60);
		Vehicle.physFrame++;                                          // a física andou: as velocidades guardadas dos veículos ficam velhas
		this._rescueStrays(dt);
		Perf.lap('física');
	}

	// Controle (Xbox) e toque viram teclas virtuais: ver InputManager. No menu/telas de fim o jogo solta tudo o que o controle segurava.
	_pollInput() {
		const inp = this.input;
		inp.carMode = this.mode === 'car' && !!this.activeCar;
		inp.heliMode = this.mode === 'heli' && !!this.chopper;
		inp.bikeMode = inp.carMode && !!this.activeCar.spec && this.activeCar.spec.bike === 'bike';      // (pedalando: L3 é o sprint)
		const W = this.player && Weapons[this.player.weapon];
		inp.gunInHand = !!(W && W.gun);
		// Menu de pausa ou janela aberta (loja, baú, imóvel, mototáxi, Tribunal): o controle navega nela (PauseMenu._pad / PadNav), não no jogo.
		const ui = this.menu.isOpen || Panel.anyOpen() || !!(this.motoUI && (this.shopUI.open || this.stashUI.open || this.propertyUI.open || this.carUI.open || this.motoUI.open || this.tribunal.open));
		if (ui) inp.releaseVirtual('pad'); else { if (this._uiWas) inp.suppressPad = true; inp.poll(); }      // (ao voltar, o botão que fechou a janela ainda está apertado)
		this._uiWas = ui;
		if (this.touch) this.touch.update();
	}

	// CÂMERA 360° (CompassCamera.turn): o arrasto do mouse (botão direito — o do meio com arma de fogo na mão, onde o direito é a mira
	// firme) e do dedo no lado direito da tela (InputManager.takeLook, lido no começo do quadro) e o analógico direito ↔ (resposta
	// quadrática), a não ser quando ele aponta (LT mirando, granada sendo preparada), no helicóptero (gira ele) ou na roda de armas.
	_look(dt) {
		const inp = this.input, C = Config.camera;
		if (inp.wheelOpen) return;
		let d = this._lookD || 0;
		if (inp.padConnected && !inp.stickAim && this.mode !== 'heli') { const x = inp.rstick.x; d += Math.sign(x) * x * x * C.lookPad * dt; }
		this.camera.lookHeld = inp.lookHeld(this.mode === 'player' && inp.gunInHand);
		if (d) this.camera.turn(d);
	}

	// Nos interiores (lojas, casas, a safe house) o personagem só ANDA — menos no meio de um assalto, de um golpe, de uma missão ou
	// de um trabalho de carreira, ou fugindo da polícia: aí trota e corre como na rua (Config.player).
	_walkIndoors() {
		if (Robbery.session || (typeof Heists !== 'undefined' && Heists.run)) return false;
		if ((this.missions && this.missions.cur) || (this.careers && this.careers.job) || (this.wanted && this.wanted.level > 0)) return false;
		return true;
	}

	// Bicicleta: o sprint (o mesmo impulso proporcional de correr e nadar) pedala forte — Vehicle.drive lê car.pedal — e gasta fôlego
	// como correr (Bags.stamina); sem fôlego, só pedala normal.
	_pedal(car, dt) {
		const drive = this.empire && this.empire.tired ? 0 : this.input.sprint, moving = Math.abs(car.forwardSpeed || 0) > 0.5;
		car.pedal = Bags.stamina(this.player, drive > 0.02, moving, dt, drive) ? drive : 0;
	}

	// Próxima/anterior arma que o jogador tem (D-pad ←/→ e botão da tela): aperta a tecla de troca dela.
	_cycleWeapon(dir) {
		if (this.wheel && this.wheel.open) { this.wheel.cycle(dir); return; }      // (roda aberta: troca dentro da categoria)
		if (this.mode !== 'player') return;
		const list = Game.WEAPON_LIST.filter(([, w]) => this.inventory.owned(w === 'none' ? 'fists' : w));
		if (list.length < 2) return;
		const cur = list.findIndex(([, w]) => w === this.player.weapon), i = ((cur < 0 ? 0 : cur) + dir + list.length) % list.length;
		this._cycleTo = list[i][1];
		this.input.justPressed[list[i][0]] = true;
	}

	_update(dt) {
		this._dt = dt;
		this._pollInput();
		this.input.sprintTick(dt);                                              // impulso do sprint (a pé, nadando, pedalando): InputManager
		this._lookD = this.input.takeLook(this.mode === 'player' && this.input.gunInHand);      // giro da câmera arrastando (aplicado em _look)
		Panel.tick(dt);
		this.dev.update(dt);
		Interiors.tickFade(dt);
		Perf.lap('outros');
		Needs.update(this, dt);                                                  // fome e cansaço (leves)
		Phone.update(this, dt);                                                  // o celular: mensagens, compromissos, entregas
		Hints.update(this, dt); Ledger.update(this, dt); Witnesses.update(this, dt); Calendar.update(this, dt); Personas.update(this, dt); Tutorial.update(this, dt); MobileUI.start();                         // dicas de primeira vez; livro-caixa (de onde vem o dinheiro)
		Perf.lap('mundo vivo (celular/festas/personagens)');
		// Assa sprites pendentes (personagens; os carros vêm prontos do atlas) com o tempo que SOBRA no quadro: orçamento de 30 FPS (com 20%
		// de folga) menos o trabalho medido do quadro, entre 1 e 8 ms. Antes eram 9 ms fixos — num celular que já gasta 25 ms por quadro,
		// isso derrubava o FPS enquanto havia fila.
		Perf.lap('outros');
		const bk = Perf.sec['sprites (bake)'], spare = Math.max(1, Math.min(8, 1000 / Config.perf.fpsCap * 0.8 - (Perf.frameAvg - (bk ? bk.avg : 0))));
		this.sprites.pump(spare);
		Perf.lap('sprites (bake)');
		Zones.update(this);                                                               // retângulo da câmera → zonas ativa/perto/dormindo

		// Menu de pausa: o jogo para de verdade (a física também) e o menu roda por conta própria.
		if (this.menu.isOpen) { if (this.wheel.open) this.wheel.close(false); this.menu.update(dt); return; }
		if (this._escModal) { this.input.justPressed['escape'] = false; this._escModal = false; }                   // o ESC foi usado para fechar uma janela
		this.wheel.update();                                                              // roda de armas (segurar Tab / LB; o ESC fecha ela antes da pausa)
		if (Gym.active) Gym.update(dt);                                                   // academia: o mini-game usa as teclas (espaço, ← →, ESC)
		if (this._canPause() && (this.input.consumePress('escape') || this.input.consumePress('p') || this._padStart())) { this.menu.open('map'); return; }
		if (this._canPause() && this.input.consumePress('i')) { this.menu.open('inventory'); return; }
		if (this._canPause() && this.input.consumePress('o')) { this.menu.open('careers'); return; }

		// Tela "DETIDO": o mundo fica parado (atrás do blur) até qualquer tecla/botão.
		if (this.arrest && this.arrest.phase === 'screen') { this._updateArrest(dt); return; }
		if (this.death && this.death.phase === 'screen') { this._updateDeath(dt); return; }

		Bags.update(this, dt);                                                            // peso carregado, bolsa no sprite
		Physique.update(dt, this);                                                        // fome, gordura, músculo (o relógio do jogo)
		if (this.mode !== 'player') Bags.stamina(this.player, false, false, dt);         // (dirigindo/pilotando: recupera o fôlego)
		if (Interiors.active) { this._updateInterior(dt); return; }                       // dentro de uma loja: o mundo fica congelado
		const frozenUI = this.stashUI.open || this.carUI.open || !!this.sleeping || Interiors.busy || this.motoUI.open || !!this.motoRide || Panel.anyOpen() || !!CarCare.job;                              // janela do baú aberta / dormindo: personagem parado
		if (frozenUI) for (const k of Object.keys(this.input.justPressed)) delete this.input.justPressed[k];
		this.stashUI.update(dt);
		if (this.sleeping) this._updateSleep(dt);
		const axis = frozenUI ? { x: 0, z: 0 } : this.input.getMoveAxis();
		if (this.aim) this.aim.update(dt);                   // mira (LT / botão direito): vira o corpo e mostra o círculo
		if (!frozenUI) this._look(dt);                       // câmera 360° (analógico direito, mouse arrastando, dedo no lado direito)

		// --- Controle desacoplado: player OU carro recebem o input ---
		if (this.mode === 'car' && this.activeCar) {
			// Direção crua (estilo veículo): W/S = acelerador, A/D = volante.
			const car = this.activeCar;
			if (car.spec && car.spec.bike === 'bike') this._pedal(car, dt);    // bicicleta: o sprint pedala forte (e gasta fôlego)
			car.drive(axis.z, axis.x, dt);
			this._fuelUpdate(dt);
			if (this.careers && !frozenUI && this.careers.carPrompt() && this.input.consumePress('e')) this.careers.carInteract();      // desmanche: E desmancha o carro
			else if (!frozenUI && Garage.carPrompt(this) && this.input.consumePress('e')) Garage.carInteract(this);      // garagem: E guarda o carro na vaga
			else if (!frozenUI && !Panel.anyCool() && Tuning.carPrompt(this) && this.input.consumePress('e')) Tuning.carInteract(this);      // loja de tunagem
			else if (!frozenUI && !Panel.anyCool() && Mechanic.carPrompt(this) && this.input.consumePress('e')) Mechanic.carInteract(this);      // oficina / borracharia / mecânico do morro
			// (uma batida forte pode arremessar o piloto de dentro do drive(): aí o foco é o jogador)
			const drv = this.mode === 'car' && this.activeCar ? this.activeCar : null;
			this.camera.setFlat(false);
			this.camera.follow((drv || this.player).position, dt, drv);       // dirigindo: câmera bússola (gira com o carro)
		} else if (this.mode === 'heli' && this.chopper) {
			// Helicóptero: o controle é lido em _updateChoppers (que também prende o jogador invisível à posição dele e segue a câmera).
		} else {
			// Movimento relativo à câmera (a pé).
			const { forward, right } = this.camera.getGroundBasis();
			const move = right.scale(axis.x).add(forward.scale(axis.z));
			if (move.lengthSquared() > 1e-4) move.normalize();
			else move.setAll(0);

			this.lockpick.update(dt);
			if (!this.lockpick.active && !this.arrest && !this.death && !this.hiding && !frozenUI) this._playerActions(dt);      // (arrombando/rendido: sem ações)
			// trote padrão; sprint pelo impulso (exausto: não corre); andar com o analógico pouco inclinado ou dentro da safe house
			const walk = this.input.moveTilt < Config.player.walkTilt || (typeof HouseView !== 'undefined' && HouseView.inside && this._walkIndoors());
			this.player.update(move, this.empire && this.empire.tired ? 0 : this.input.sprint, dt, walk);
			this._bumpPeople();                                  // esbarra em quem está no caminho (não atravessa as pessoas)
			if (!frozenUI) Interiors.autoEnter(this);            // lojas: atravessar o vão da porta = entrar
			HouseView.update(dt, this);                          // safe house: porta, luzes, seta (entrar = a porta de Interiors)
			this.camera.setFlat(false);
			this.camera.follow(this.player.position, dt);
		}

		AudioFX.screech(this.mode === 'car' && this.activeCar ? this.activeCar.slide || 0 : 0);      // pneu cantando na derrapagem (Vehicle.slide)
		Perf.lap('jogador');
		this._updateHeliFall(dt);
		this._updateChoppers(dt);

		// --- Zoom ---
		// Automático: a pé aproxima; no veículo (carro, moto, barco, helicóptero) afasta conforme a velocidade.
		const zSpeed = this.mode === 'car' && this.activeCar ? this.activeCar.speed : (this.mode === 'heli' && this.chopper ? this.chopper.speed : null);
		this.camera.setAutoZoom(this.camera.zoomMul < 0.999 ? 1 : CompassCamera.autoZoomGoal(zSpeed), dt);
		const zoom = this.input.consumeZoom();
		if (zoom.keys) this.camera.zoom(zoom.keys * Config.camera.zoomSpeed * dt);
		if (zoom.wheel) this.camera.zoom(zoom.wheel * Config.camera.wheelStep);
		if (this.sprites.npc) this.sprites.npc.setZoom(this.gameEngine.renderHeight / (2 * this.camera.view));      // personagens 2,5D: nítidos de perto, suaves de longe
		Smooth.zoom(this, this.gameEngine.renderHeight / (2 * this.camera.view));       // árvores e mobiliário de rua: bordas suaves no gráfico suave

		// --- Círculo de visibilidade: o alvo (a pé ou o veículo dele) nunca some debaixo de viaduto, ponte, túnel, cobertura ou copa ---
		const rv = this.mode === 'car' && this.activeCar ? this.activeCar : null, rp = rv ? rv.position : this.player.position;
		// (o furo só se abre no que está ACIMA do alvo: a pé, a altura vem do personagem — cabeça no chão ou no viaduto, abaixo do
		// tabuleiro quando nada sob a ponte; de veículo, a altura do sprite dele — barco sob a ponte fica rebaixado)
		this.gameEngine.world.setReveal(rp.x, rp.z, rv ? (Math.max(rv.halfLen, rv.halfW) + 1.6) * 3 : 9.0, rv && rv.visual ? (rv.visual.mesh ? rv.visual.mesh.position.y : rv.visual.y) : this.player.revealY);

		// --- Mundo (água animada, sombra seguindo o foco) ---
		if (this.mode !== 'player') HouseView.update(dt, this);          // (de carro/helicóptero: a porta e a seta continuam)
		Perf.lap('outros');
		this.gameEngine.update(dt, this.camera.target, this.camera.groundHalf());
		Perf.lap('mundo (água/sombra)');

		// --- Hijack (entrar/sair do carro) ---
		if (this.physicsReady && this.input.consumePress('f')) this._toggleHijack();
		if (this.physicsReady && this.input.consumePress('g')) this._lockpickKey();
		const crouchKey = this.input.consumePress('q'), rollKey = this.input.consumePress('roll');      // (consumidas sempre: Q no helicóptero gira)
		if (this.mode !== 'player' && this.player.crouched) this.player.setCrouch(false);                  // (entrou num veículo: sai levantado)
		if (this.mode === 'player' && crouchKey) this._toggleCrouch();
		if (this.mode === 'player' && rollKey) this._tryRoll();
		if (this.mode === 'player' && this.input.consumePress('v')) this._tryVault();
		if (this.input.consumePress('k') && this.mode === 'player' && !frozenUI) Traces.toggleMask(this);      // máscara (crime/Traces.js)
		if (this.mode === 'player' && this.input.consumePress('padjump') && !this.player.busy && !this.lockpick.active && !this.hiding && CityGrid.nearestVault(this.player.position.x, this.player.position.z, 1.5)) this._tryVault();      // controle: A/✕ só pula se houver grade/muro

		if (this.arrest) this._updateArrest(dt);
		if (this.holdup) this._updateHoldup(dt);
		this.player.holdingUp = !!this.holdup;                  // (animação de anunciar o assalto: ver Player.update)
		if (this.death) this._updateDeath(dt);
		if (this.hiding) this._updateHiding(dt);

		// --- Combate: balas, ações com atraso, vida do jogador ---
		Perf.lap('outros');
		this.combat.update(dt);
		this.fireworks.update(dt);
		if (typeof News !== 'undefined') News.radioUpdate(dt, this);          // boletim no rádio do carro
		for (let i = this._delayed.length - 1; i >= 0; i--) {
			const d = this._delayed[i];
			d.t -= dt;
			if (d.t <= 0) { this._delayed.splice(i, 1); d.fn(); }
		}
		this.player.tickHealth(dt);
		if (this.player.hp < (this._hpPrev === undefined ? this.player.hp : this._hpPrev) - 1) this.input.rumble(0.5, 0.7, 160);      // levou dano: o controle vibra
		this._hpPrev = this.player.hp;
		if (this.player.hp <= 0 && !this.player.rag && !this.death) this._startDeath();      // (atropelado: primeiro voa e cai, depois "FIM DA LINHA")

		Perf.lap('combate');
		// --- Itens no chão (coleta só a pé) e painel do inventário ---
		this._updateGps(dt);
		if (this.birds) this.birds.update(dt);
		if (this.puddles) this.puddles.update(dt);
		if (this.vehicleManager && this.gameEngine.world.street) {
			this.gameEngine.world.street.update(dt, this.carDamage.allCars(), this);       // (lista reaproveitada; barcos são ignorados lá)
		}
		{   // água em volta do jogador (marolas, esteira, respingos e sons presos à animação — WaterFx.track); NPCs: NPC.update
			const pl = this.player, inW = this.mode === 'player' && pl.alive;
			if (pl._surfaced) {                                                                       // voltou à tona: respingo (e sem ar, o aviso)
				const p = pl.position;
				this.waterFx.splash(p.x, p.z + 0.1, 12, 1.1); this.waterFx.ripple(p.x, p.z, 0.5, 2.6, 1.0, 0.45);
				AudioFX.waterStroke(p.x, p.z, 1);
				if (pl._surfaced === 'breathless') this._flash('Sem fôlego! Voltou à tona');
				pl._surfaced = null;
			}
			this.waterFx.track(pl, dt, { x: pl.position.x, z: pl.position.z, depth: inW ? (pl.depth || 0) : 0, speed: pl.speed, swimming: !!pl.swimming, diving: !!pl.diving,
				heading: pl.actor.heading, actor: pl.actor, wl: pl.waterline, who: 'player', wadeSound: false });      // (passos no raso: Footsteps)
			this.waterFx.update(dt);
			if (typeof NpcArt !== 'undefined') NpcArt.tick(performance.now() / 1000);                                // linha d'água ondulando em quem vadeia
		}
		this.pickups.update(dt, this.mode === 'player' ? this.player.position : this.camera.target,this.mode === 'player' && !this.player.busy);
		if (this.inventoryOpen) {
			this._invTimer -= dt;
			if (this._invTimer <= 0) { this._invTimer = 0.2; this._renderInventory(); }
		}

		Perf.lap('rua (props/itens/pássaros)');
		// --- Relógio do jogo (sol, ambiente, janelas, postes) ---
		this.weather.update(dt);
		if (this.input.consumePress('y')) this.weather.cycle();
		Economy.tick(this.dayNight.hour);
		Laundry.update(dt);
		this.dayNight.update(dt);
		if (this.input.consumePress('t')) { this.dayNight.skip(2); this._flash(`Hora: ${this.dayNight.label}`); }

		// --- Trânsito: IA dos carros (e sprites seguindo os corpos físicos) ---
		AudioFX.setListener(this.camera.target.x, this.camera.target.z);
		Perf.lap('clima/hora');
		if (this.traffic) this.traffic.update(dt, this);
		Perf.lap('trânsito');
		if (this.boats) this.boats.update(dt, this);
		if (this.colliderStream) this.colliderStream.update(dt, this.camera.target.x, this.camera.target.z);
		Perf.lap('barcos/colisores');
		if (this.vehicleManager) { this.carDamage.update(dt); Throwables.update(dt); Rockets.update(dt); this.collisions.update(dt); this.doors.update(dt); this._updateAlarms(dt); }
		Perf.lap('veículos (dano/colisão)');
		if (this.vehicleManager) EngineAudio.update(this, dt);                 // ronco dos motores (o seu e o do trânsito perto)
		Footsteps.update(this, dt);                                            // passos (presos à animação de andar/correr)
		for (let i = this.casualties.length - 1; i >= 0; i--) {
			if (!this.casualties[i].update(dt)) { this.casualties[i].dispose(); this.casualties.splice(i, 1); }
		}
		if (this.vehicleManager) {
			// Faróis, lanternas, setas, giroflex e fumaça de todos os carros próximos.
			this.carLights.update(dt, this.dayNight.night, this.camera.target, this.carDamage.allCars());      // (lista reaproveitada: sem arrays novos por quadro)
			SkidMarks.focus = this.camera.target; SkidMarks.update(dt);
			Blood.update(dt, null, this);
			Footprints.update(dt, this);
			SparkFx.update(dt);
			if (this.mode === 'car' && this.activeCar && this.input.consumePress('l')) this.activeCar.lightsOn = !this.activeCar.lightsOn;
		}
		if (this.mode === 'car' && this.activeCar && this.input.consumePress('h')) {
			const cp = this.activeCar.position;
			AudioFX.honk(cp.x, cp.z, 1);
		}

		// --- Semáforos ---
		this.signals.update(dt);
		Perf.lap('luzes/semáforos');

		// --- IA (pedestres) ---
		if (this.aiReady) {
			const ps0 = this._playerState();
			this.nav.focus.x = ps0.pos.x; this.nav.focus.z = ps0.pos.z;
			this._crowdWorld();
			this.nav.update(dt);
			const chasers = this.policeManager
				? this.policeManager.units.filter((u) => u.fsm.name === 'CHASE').map((u) => ({ position: u.position, car: !!u.body }))
				: [];
			Perf.lap('navegação (crowd)');
			this.npcManager.update(dt, { playerPos: ps0.pos, wanted: this.wanted.level, chasers });
			if (typeof StreetCrime !== 'undefined') StreetCrime.update(this, dt);          // assalto entre NPCs (de vez em quando, perto do jogador)
			RoadRage.update(this, dt);                                                     // brigas de trânsito (motoristas que desceram do carro)
			Perf.lap('pedestres');

			if (this.mode === 'player' && this.input.consumePress('e')) this._interact();
			if (this.mode === 'player' && this.input.consumePress('c') && !this.hiding && !this.arrest && !this.death && !this.lockpick.active && !this.inventoryOpen) this._tryPickpocket();
			// controle ↓: arromba o carro trancado encostado (G) ou, sem ele, furta quem está perto (C)
			if (this.mode === 'player' && this.input.consumePress('padsteal') && !this.hiding && !this.arrest && !this.death && !this.lockpick.active && !this.inventoryOpen) {
				const car = this._hijackTarget();
				if (car && !car.isBike && !car.isBoat && car.locked && this.physicsReady) this._lockpickKey(); else this._tryPickpocket();
			}
			if (this.input.consumePress('n')) this._toggleNavDebug();
		}

		// --- Traficantes da favela (mais fundo = mais armados) ---
		if (this.gangs && this.aiReady) {
			const gs = this._playerState();
			this.gangs.update(dt, gs.pos, gs.vel, !!(this.hiding && !this.hiding.seen) || this.mode === 'heli');
			if (this.op) this.op.update(dt, gs.pos);
			Perf.lap('favela (gangues/moto/missões)');
			RivalArc.update(this, dt);                                          // o arco do Dentinho: bocas, capangas, emboscadas, o galpão
			Perf.lap('Dentinho (bocas/capangas)');
			if (this.watch) this.watch.update(dt, gs.pos);
			if (this.barricades) this.barricades.update(dt, this.op, Standing.nearFavela(gs.pos.x, gs.pos.z, 20));
			Baile.update(dt, this);
			Pelada.update(dt, this);                                     // o futebol dos meninos na quadra da favela (de dia)
			Perf.lap('favela (gangues/moto/missões)');
			StreetLife.update(this, dt);                                  // a rua viva: movimento por hora, acontecimentos, conversas
			Perf.lap('rua viva');
			if (this.motoTaxis) this.motoTaxis.update(dt, gs.pos);
			MotoStands.update(dt, this, gs.pos); this.motoUI.update(dt);
			if (this.motoRide) this.motoRide.update(dt);
			if (this.missions) this.missions.update(dt, gs.pos);
			RealEstate.build(this); RealEstate.update(dt); this.propertyUI.update(dt);
			Laundry.syncMap(this, dt);                                                       // fachadas compradas → mapa e radar
			Heists.build(this); Mechanic.build(this); Business.syncMap(this, dt);           // joalherias, oficinas, seus negócios no mapa
			Dealers.build(this); Dealers.update(dt); Tuning.build(this); Tuning.update(dt); Garage.update(dt); PersonalBike.update(dt); this.carUI.update(dt);      // concessionárias (vitrine) e garagens (seus carros)
		}

		Perf.lap('favela (gangues/moto/missões)');
		// --- Polícia: detecção -> procurado -> perseguição/prisão ---
		if (this.policeManager) {
			const ps = this._playerState();
			// Percepção da polícia (raio do nível + linha de visada) -> procurado e FUGA.
			if (this.empire) this.wanted.escalateMul = this.empire.escalateMul(ps.pos.x, ps.pos.z);
			if (this.skills) this.wanted.loseMul = this.skills.policeMul * (1 - (SkillTree.m.lose || 0) - Outfit.m.lose - (this.mode === 'car' ? (SkillTree.m.carLose || 0) : 0));
			this.policeManager.update(dt, ps.pos, ps.vel, this.wanted.level);
			const seen = this.policeManager.playerSeen;

			// (Estar armado e à vista NÃO libera mais a polícia: só atirar — ver _onAttack/notifyPlayerShot.)
			// Fuga: policial colado (mesmo atrás de parede) PAUSA a contagem; fora da área de busca ela anda mais rápido.
			const S = this.policeManager.search;
			const hold = this.wanted.level > 0 && this.policeManager.nearestDist(ps.pos) < (this.wanted.level === 1 ? Config.police.oneStar.closeNoEscape : Config.police.closeNoEscape);
			const rate = S && hypot(ps.pos.x - S.x, ps.pos.z - S.z) > S.r ? Config.wanted.outsideRate : 1;
			this.wanted.update(dt, seen, hold, rate);

			Traces.update(dt, this); this.heat.update(dt);                                                         // descrição, placa, mandado, área de busca
			const alerted = this.wanted.level > 0;

			// Prisão: polícia colada em você por bustTime segundos (só quando procurado).
			// (com armas liberadas a polícia atira em vez de prender)
			if (this.arrest || this.death || this.hiding || this.mode === 'heli' || this.heliFall) {
				this.bustTimer = 0;
			} else if (alerted && !this.policeManager.weaponsFree && this.policeManager.nearestDist(ps.pos) < (this.wanted.level === 1 ? Config.police.oneStar.bustRange : Config.police.bustRange)) {
				this.bustTimer += dt;
				if (this.bustTimer >= Config.police.bustTime && !this.player.rag) this._startArrest();
			} else {
				this.bustTimer = 0;
			}
		}

		Perf.lap('polícia');

		// --- Interface (minimapa, painéis, dica): roda depois do desenho da cena, no ritmo de cada módulo (UiLoop) ---
		if (this.actionTimer > 0) this.actionTimer -= dt;
		this._updateHitFlash();
		this.uiLoop.advance(dt, Game.UI_WORLD);
		if (this.careers) this.careers.update(dt);
		CarCare.hud(this, dt);                                                                  // painel do carro + troca de peça em andamento
		if (this.goals) this.goals.update(dt);
		if (this.achievements) this.achievements.update(dt);
		if (this.empire) { this.empire.update(dt); EmpireUI.hud(this); }
		Perf.lap('HUD/carreiras/império');
		this._geoT = (this._geoT || 0) + dt;
		if (this._geoT > 15) { this._geoT = 0; this._releaseStaticGeometry(); }
		this._sweepT = (this._sweepT || 0) + dt;
		if (this._sweepT > 3) { this._sweepT = 0; this._sweep(); }
	}

	// Dentro de uma loja (Interiors): só o jogador, a câmera, o relógio e a interface rodam; trânsito, pedestres, polícia e física ficam parados.
	_updateInterior(dt) {
		const decorating = HomeDecor.active;
		const frozen = this.shopUI.open || Interiors.busy || this.stashUI.open || this.propertyUI.open || !!this.sleeping || Panel.anyOpen() || decorating;
		if (frozen) for (const k of Object.keys(this.input.justPressed)) delete this.input.justPressed[k];
		AudioFX.setListener(this.player.position.x, this.player.position.z);           // (os sons de dentro da sala: tiro de aviso, alarme)
		if (Traces._el && Traces._el.style.display !== 'none') Traces._el.style.display = 'none';      // (os avisos de rastro são da rua)
		if (!frozen) this._interiorKeys(dt);
		this.shopUI.update(dt); this.stashUI.update(dt); this.propertyUI.update(dt);
		if (this.sleeping) this._updateSleep(dt);
		const axis = frozen ? { x: 0, z: 0 } : this.input.getMoveAxis();
		const { forward, right } = this.camera.getGroundBasis();
		const move = right.scale(axis.x).add(forward.scale(axis.z));
		if (move.lengthSquared() > 1e-4) move.normalize(); else move.setAll(0);
		const indoors = this._walkIndoors();                                     // (lojas e casas: só anda — menos em assalto, golpe, missão, fuga)
		this.player.update(move, indoors ? 0 : this.input.sprint, dt, indoors || this.input.moveTilt < Config.player.walkTilt);
		this.camera.setAutoZoom(1, dt, true);                                            // (a loja já tem o enquadramento dela: sem zoom automático)
		this.camera.setFlat(true);                                                       // (interiors are painted for the top-down camera)
		HomeDecor.update(dt, this);                                                      // modo decoração: WASD move a câmera, o mouse a peça
		this.camera.follow(decorating ? HomeDecor.cameraFocus : Interiors.focus(this.player.position, this.camera, this.gameEngine.engine.getAspectRatio(this.camera.camera)), dt);
		Interiors.update(dt, this);
		if (!frozen && this.input.consumePress('e')) Interiors.interact(this);
		if (!frozen && this.input.consumePress('b')) HomeDecor.toggle(this);
		this.gameEngine.update(dt, this.camera.target, this.camera.groundHalf());
		this.player.tickHealth(dt);
		this.weather.update(dt);
		this.dayNight.update(dt);
		Economy.tick(this.dayNight.hour);
		if (this.actionTimer > 0) this.actionTimer -= dt;
		this._updateHitFlash();
		this.uiLoop.advance(dt, Game.UI_INTERIOR);
	}

	// Dentro de um interior (loja): trocar de arma (1-9), recarregar, pôr/tirar a máscara (K) e as teclas do assalto (G grita, ataque = tiro
	// de aviso — crime/Robbery.js). O resto do combate não existe lá dentro (o mundo está congelado).
	_interiorKeys(dt) {
		const inp = this.input, p = this.player, inv = this.inventory;
		if (this.reloading > 0) { this.reloading -= dt; if (this.reloading <= 0) { const n = inv.reload(this._reloadWeapon); if (n > 0) this._flash(`Recarregou: ${inv.ammoText(this._reloadWeapon)}`); } }
		for (const key of Object.keys(Game.WEAPON_KEYS)) {
			if (!inp.consumePress(key)) continue;
			const kind = this._slotPick(key);
			if (Weapons[kind] && Weapons[kind].throwable) continue;
			if (!inv.owned(kind === 'none' ? 'fists' : kind)) { this._flash(`Você não tem: ${Weapons[kind === 'none' ? 'fists' : kind].name}`); continue; }
			this.reloading = 0;
			if (p.equip(kind) || p.weapon === kind) this._flash(`Arma: ${Weapons[kind === 'none' ? 'fists' : kind].name}${inv.isGun(kind) ? ' ' + inv.ammoText(kind) : ''}`);
		}
		if (inp.consumePress('r')) this._startReload();
		if (inp.consumePress('k')) Traces.toggleMask(this);
		if (inp.consumePress('padsteal')) inp.justPressed['g'] = true;                                                   // (controle ↓ aqui dentro: G, gritar no assalto)
		if (this.wheel.open) { inp.consumePress('mouse0'); inp.consumePress(' '); inp.consumePress('g'); return; }      // (roda de armas aberta)
		Robbery.input(this);
		if (!Robbery.session) { inp.consumePress('mouse0'); inp.consumePress(' '); inp.consumePress('g'); }      // (sem assalto, ataque e G não fazem nada aqui)
	}

	// Ações a pé: golpe/tiro (com munição), chute, troca de arma, recarga, kit médico e inventário.
	_playerActions(dt) {
		const inp = this.input;
		const p = this.player;
		const inv = this.inventory;
		if (Gym.active) return;                                          // treinando: o mini-game comanda

		// Relógios das ações.
		if (this._fireCd > 0) this._fireCd -= dt;
		if (this._autoReload > 0 && (this._autoReload -= dt) <= 0 && p.weapon === this._autoReloadW) { if (p.busy) this._autoReload = 0.2; else this._startReload(); }
		if (this.reloading > 0) {
			this.reloading -= dt;
			if (this.reloading <= 0) {
				const n = inv.reload(this._reloadWeapon);
				if (n > 0) this._flash(`Recarregou: ${inv.ammoText(this._reloadWeapon)}`);
			}
		}

		// Inventário (I abre/fecha; Esc fecha). Aberto, o personagem fica parado vasculhando a mochila.
		if (inp.consumePress('i')) this._toggleInventory();
		if (inp.consumePress('escape') && this.inventoryOpen) this._toggleInventory(false);

		// Troca de arma (também funciona com o inventário aberto). Só quem tem a arma.
		for (const key of Object.keys(Game.WEAPON_KEYS)) {
			if (!inp.consumePress(key)) continue;
			const kind = this._slotPick(key);
			if (kind === p.weapon) continue;                                 // (a tecla só tem a que já está na mão)
			this.equipWeapon(kind);
		}
		if (this.inventoryOpen || p.swimming) return;                 // nadando: sem ataques nem recarga

		if (inp.consumePress('r')) this._startReload();
		if (inp.consumePress('m')) this._useMedkit();
		if (this.wheel.open) { inp.consumePress('mouse0'); inp.consumePress(' '); return; }      // roda de armas aberta: o ataque não sai

		// Golpe/tiro principal. SMG dispara em rajada enquanto o botão/espaço estiver apertado.
		const pressed = inp.consumePress('mouse0') | inp.consumePress(' ');
		// Granada / molotov: apertar prepara (pino / acender), segurar mira e carrega a força, soltar arremessa (Throwables).
		if (Weapons[p.weapon] && Weapons[p.weapon].throwable) { if (pressed) Throwables.press(); return; }
		if (Throwables.busy()) return;
		const held = (inp.keys[' '] || inp.mouseDown) && !!Weapons[p.weapon] && Weapons[p.weapon].gun && Weapons[p.weapon].auto;
		const during = p.action && Player.COMBO.includes(p.action.name) ? p.action : null;      // golpe de mão já em andamento
		// Minigun: segurando o gatilho, os canos GIRAM primeiro (W.spinUp s, com o zumbido) e só então ela cospe balas; soltou, param
		// devagar (apertar logo de novo já sai atirando).
		const auto = !!(this.aim && this.aim.autoFire);                      // (celular: a mira passando por cima de um alvo atira sozinha)
		const W0 = Weapons[p.weapon], trig = (inp.keys[' '] || inp.mouseDown || pressed || auto) && this.reloading <= 0 && !p.busy || (p.action && p.action.name === 'shoot' && (inp.keys[' '] || inp.mouseDown || auto));
		let spun = true;
		if (W0 && W0.spinUp) {
			const was = this._spin || 0;
			this._spin = Math.max(0, Math.min(1, was + (trig ? dt / W0.spinUp : -dt / (W0.spinUp * 2.2))));
			if (trig && was === 0) AudioFX._burst(p.position.x, p.position.z, { vol: 0.3, dur: W0.spinUp, f0: 250, f1: 1400, maxDist: 60, type: 'bandpass', q: 4 });
			if (trig) p.aimTimer = Math.max(p.aimTimer, 0.6);                 // (girando: na pose de mirar)
			spun = this._spin >= 1;
		} else this._spin = 0;
		if ((pressed || held || auto) && spun) this._tryPrimary();

		// Combo de mãos (soco + soco + chute — Player.COMBO): apertou no MEIO de um golpe → guarda o aperto e solta o próximo golpe
		// assim que este acabar (não precisa acertar o tempo). Um aperto guardado por vez.
		if (pressed && during) this._comboBuf = during;
		else if (this._comboBuf && p.action !== this._comboBuf) {
			const go = !p.busy;
			this._comboBuf = null;
			if (go) this._tryPrimary();
		}
	}

	// Troca para a arma `kind` ('none' = punhos) — teclas, roda de armas. Só quem tem; no meio de um arremesso não troca. Atirando,
	// sacando ou no meio de um golpe, a troca interrompe (como no GTA). Retorna true se trocou.
	equipWeapon(kind) {
		const p = this.player, inv = this.inventory;
		if (kind === 'fists') kind = 'none';
		const key = kind === 'none' ? 'fists' : kind, W = Weapons[key];
		if (!W || kind === p.weapon) return false;
		if (!inv.owned(key)) { this._flash(`Você não tem: ${W.name} (${inv.isThrow(kind) ? 'compre na boca de fumo' : W.heavy || W.silenced ? 'compre no mercado clandestino' : 'procure pelo chão ou nos drops'})`); return false; }
		if (Throwables.busy()) return false;                                 // (no meio de um arremesso não troca)
		if (Interiors.active && W.throwable) return false;                   // (dentro da loja não se arremessa nada)
		this.reloading = 0;                                                  // trocar de arma cancela a recarga
		let ok = p.equip(kind);
		if (!ok && p.weapon !== kind && !p.rag && !p.frozen && !p._seq && p.action && ['shoot', 'draw', 'punch', 'punchL', 'kick', 'swing', 'stab'].includes(p.action.name)) {
			p.action = null;
			ok = p.equip(kind);
		}
		if (!ok) return false;
		this._flash(`Arma: ${W.name}${inv.isGun(kind) || inv.isThrow(kind) ? ' ' + inv.ammoText(kind) : ''}`);
		if (typeof PlayerLook !== 'undefined') PlayerLook.wantArms();      // (arma nova num visual gerado: o desenho dela)
		return true;
	}

	// Ataque principal respeitando recarga, cadência e munição.
	_tryPrimary() {
		const p = this.player, inv = this.inventory, key = p.weapon === 'none' ? 'fists' : p.weapon;
		const W = Weapons[key];
		if (this.reloading > 0) return;

		if (W.gun) {
			if (this._fireCd > 0) return;
			if (inv.mag(key) <= 0) {                                  // pente vazio
				this._fireCd = 0.4;
				if (inv.canReload(key)) this._startReload();
				else { AudioFX.dryfire(p.position.x, p.position.z); this._flash('Sem munição!'); }
				return;
			}
			const started = p.primary(true);                          // true: pode reiniciar o clipe (rajada)
			if (!started) return;
			inv.consume(key);
			this._fireCd = W.spinUp ? Math.max(this._fireCd, -W.cooldown) + W.cooldown : W.cooldown;      // (minigun: guarda a sobra do quadro — 20 tiros/s mesmo a 30 qps)
			this._onAttack('shoot');
			if (inv.mag(key) === 0 && inv.canReload(key)) {
				this._fireCd = Math.max(this._fireCd, 0.25);
				if (W.rocket) { this._autoReload = 0.75; this._autoReloadW = key; }      // (RPG/lança-foguetes: põe o próximo foguete sozinho)
			}
			return;
		}
		if (W.cooldown && this._fireCd > 0) return;                  // taco e faca têm cadência
		const started = p.primary();
		if (!started) return;
		if (W.cooldown) this._fireCd = W.cooldown;
		this._onAttack(started, key);
	}

	_startReload() {
		const p = this.player, inv = this.inventory, key = p.weapon;
		if (!inv.isGun(key) || this.reloading > 0) return;
		if (!inv.canReload(key)) { this._flash(inv.reserve(key) <= 0 ? 'Sem munição na mochila!' : 'Carregador cheio'); return; }
		if (p.busy && p.action.name !== 'shoot') return;
		this.reloading = ((Weapons[key] && Weapons[key].reload) || 1.25) * (1 - (SkillTree.m.reload || 0));      // (as pesadas demoram mais)
		this._reloadWeapon = key;
		p.playAction('draw', { lock: 0.55, weapon: p.look });          // (visual: mexe na arma)
		AudioFX.blip(260, 0.2, 0.2);
		this._flash('Recarregando…');
	}

	_useMedkit() {
		const p = this.player, inv = this.inventory;
		if (inv.medkits <= 0) { this._flash('Sem kit médico'); return; }
		if (p.hp >= p.maxHp - 1) { this._flash('Vida cheia'); return; }
		inv.medkits--;
		p.hp = Math.min(p.maxHp, p.hp + 55);
		AudioFX.blip(520, 0.25, 0.22);
		this._flash(`Kit médico usado (restam ${inv.medkits})`);
	}

	// Come/bebe um item da mochila (recupera vida).
	// (come mesmo sem fome: o excesso vira gordura — Physique)
	_eat(kind) {
		const p = this.player, inv = this.inventory;
		if (!(inv[kind] > 0)) return;
		inv[kind]--;
		p.hp = Math.min(p.maxHp, p.hp + Inventory.HEAL[kind]);
		const fx = Physique.eat(kind === 'food' ? Inventory.HEAL[kind] : Inventory.HEAL[kind] * 0.4);
		AudioFX.blip(kind === 'food' ? 380 : 700, 0.2, 0.2);
		this._flash(`${kind === 'food' ? 'Comeu' : 'Bebeu'}: +${Inventory.HEAL[kind]} de vida · ${Physique.hungerLabel().toLowerCase()}${fx}`);
	}

	// ---------------------------------------------------------------- inventário
	// Área de perseguição para o radar (estilo GTA V): com ★, um círculo em volta de onde a polícia acha que você está
	// (onde te viu pela última vez; em você mesmo se está à vista). O raio vem do alcance de visão do nível e ENCOLHE
	// conforme você some da vista (fuga). `seen` = alguém te enxerga agora (o radar pisca vermelho/azul).
	_pursuit(center) {
		const pm = this.policeManager, lvl = this.wanted.level;
		if (pm && lvl <= 0 && Traces.search) { const S = Traces.search; return { x: S.x, z: S.z, r: S.r, seen: false, escaping: false, search: true }; }      // área de busca depois do assalto (amarela)
		if (!pm || lvl <= 0) return null;
		const L = Config.wanted.levels[lvl], seen = pm.playerSeen && !(this.hiding && !this.hiding.seen);
		const S = pm.search, k = S && !seen ? S : center;            // a área de busca de verdade (a mesma que a fuga usa)
		const esc = this.wanted.escape || 0;
		return { x: k.x, z: k.z, r: S ? S.r : L.sight * Config.wanted.searchK, seen, escaping: esc > 0.02 };
	}

	// O inventário agora é uma aba do menu de pausa (a mochila com espaços); este atalho só abre o menu nela.
	_toggleInventory(force) {
		if (force === false) return;
		if (this._canPause()) this.menu.open('inventory');
	}

	// Alguma janela/diálogo que usa o ESC está aberta (ou acabou de fechar)? Então o ESC não deve abrir o menu de pausa.
	_modalUiOpen() {
		return !!(Gym.active || Pool.active || Truco.active || Porrinha.active || Domino.active || Panel.anyOpen() || this.stashUI.open || this.shopUI.open || this.propertyUI.open || this.carUI.open || this.motoUI.open || this.tribunal.open
			|| this.endScreen.visible || this.sleeping || this.motoRide || HomeDecor.active);          // (arrombar e inventário legado consomem o ESC sozinhos; _canPause já bloqueia a pausa neles)
	}

	// Dá para pausar? Não durante as telas de fim (detido/morte), enquanto arromba (Esc cancela o mini-game) nem sem o jogo pronto.
	_canPause() {
		if (this.menu.isOpen) return false;
		if (Gym.active || Pool.active || Truco.active || Porrinha.active || Domino.active || Panel.anyOpen() || Panel.anyCool() || (Robbery.session && Robbery.session.siege) || this.lockpick.active || this.endScreen.visible || this.tribunal.open || this.motoUI.open || this.motoUI.cool > 0 || this.inventoryOpen || !!this.motoRide || this.propertyUI.open || this.propertyUI.cool > 0 || this.carUI.open || this.carUI.cool > 0 || this.shopUI.open || this.shopUI.cool > 0 || Interiors.busy || this.stashUI.open || this.stashUI.cool > 0 || this.sleeping || HomeDecor.active) return false;
		if ((this.arrest && this.arrest.phase === 'screen') || (this.death && this.death.phase === 'screen')) return false;
		return true;
	}

	// Botão Start do controle (borda de subida).
	_padStart() {
		const pads = navigator.getGamepads ? navigator.getGamepads() : [], p = [...pads].find((x) => x);
		const down = !!(p && p.buttons[9] && p.buttons[9].pressed), hit = down && !this._startWas;
		this._startWas = down;
		return hit;
	}

	// ---------------------------------------------------------------- Marcador de destino (como o blip vermelho do GTA San Andreas)
	// Só um ponto no mapa: aparece no minimapa (na borda, apontando, se estiver longe) e no mapa grande. Sem rota pelas ruas e sem
	// recálculo — o caminho é por sua conta. (Antes era um GPS que recalculava a rota a cada 0,7 s; ver docs/otimizacao.md.)
	// Os nomes setGps/clearGps/this.gps ficaram para não mexer em quem marca destinos (missões, carreiras, bancos, mototáxi).
	setGps(x, z, label = 'Ponto marcado') {
		this.gps = { x, z, label, t: 0 };
		this._flash(`📍 Marcado no mapa: ${label}`);
	}

	clearGps() { if (this.gps) { this.gps = null; this._flash('Marcador removido'); } }

	// Some ao chegar (conferido ~4×/s: só uma distância).
	_updateGps(dt) {
		const G = this.gps;
		if (!G) return;
		G.t -= dt;
		if (G.t > 0) return;
		G.t = 0.25;
		const from = this._playerState().pos;
		if (hypot(G.x - from.x, G.z - from.z) < 9) { this.gps = null; this._flash('Você chegou ao destino!'); AudioFX.blip(880, 0.2, 0.2); }
	}

	_renderInventory() {
		const el = document.getElementById('invBody');
		if (!el) return;
		const inv = this.inventory, p = this.player;
		const slots = Game.WEAPON_LIST.map(([k, w]) => [k, w === 'none' ? 'fists' : w]);
		const cur = p.weapon === 'none' ? 'fists' : p.weapon;
		const rows = slots.map(([k, key]) => {
			const own = inv.owned(key);
			const mark = key === cur ? '▶' : '&nbsp;';
			return `<div class="inv-row ${own ? '' : 'off'} ${key === cur ? 'cur' : ''}"><span>${mark} [${k}] ${Weapons[key].name}</span><span>${own ? inv.ammoText(key) : 'não possui'}</span></div>`;
		}).join('');
		el.innerHTML =
			`<div class="inv-row big"><span>Dinheiro</span><span>${brl(inv.cash)}</span></div>` +
			`<div class="inv-row"><span>Vida</span><span>${Math.round(p.hp)} / ${p.maxHp}</span></div>` +
			`<div class="inv-row"><span>Kits médicos</span><span>${inv.medkits}</span></div>` +
			`<div class="inv-row"><span>Módulos de hackeio</span><span>${inv.hacks}</span></div>` +
			`<div class="inv-row"><span>Chaves roubadas</span><span>${inv.keys}</span></div>` +
			`<div class="inv-sep">ARMAS</div>${rows}`;
	}

	// Consequências de um ataque do jogador: tiro é OUVIDO por todos num raio grande;
	// soco/chute/taco é VISTO por quem tem linha de visada (e quem leva o golpe cambaleia).
	_onAttack(kind, weaponKey = null) {
		if (!this.aiReady) return;
		const p = this.player, pos = p.position, heading = p.root.rotation.y;

		if (kind !== 'shoot') Bags.train(p, 1.5);                         // soco, chute, taco, facada: treina a força
		if (kind === 'shoot') {
			// Tiro de verdade: projéteis (na direção da mira), ouvido por todos; libera as armas da polícia.
			const angle = this.aim ? this.aim.shotAngle(pos.x, pos.z, heading, p.weapon) : heading;
			const high = this.aim ? this.aim.shotOpts() : null;                    // (alvo no alto: a bala passa por cima dos prédios, só nele)
			if (!(this.aim && this.aim.active)) p.root.rotation.y = angle;      // tiro do quadril travado: o corpo vira para o alvo (como no soco)
			const crit = Math.random() < (SkillTree.m.crit || 0);
			this.combat.fire({ x: pos.x, z: pos.z, angle, owner: 'player', ref: p, over: !!high, only: high ? high.only : null, spreadMul: this.aim ? this.aim.spreadMul() : 1 - (SkillTree.m.spread || 0), dmgMul: (1 + (SkillTree.m.gunDmg || 0)) * (crit ? 2 : 1) }, p.weapon);
			if (this.aim) this.aim.onShot(p.weapon);                          // coice: desfirma a mira um pouco
			Temper.onPlayerShot(this, pos, angle);                              // quem ele mirou e anda armado revida (antes do alerta: o resto foge)
			if ((Weapons[p.weapon] && Weapons[p.weapon].silenced) || (this.careers && this.careers.silenced(p.weapon))) {      // silenciador (a pistola com ele, ou o do Armeiro): só quem está muito perto e vê percebe
				this.npcManager.alertViolence(pos, 8);
				this.heat.commit('gunfire');
			} else if (Baile.covers(pos.x, pos.z)) {                                // o baile abafa o tiro: só quem está a < 14 u (e a vista) percebe
				this.npcManager.alertViolence(pos, 14);
				this.heat.commit('gunfire');
				Baile.onShot(pos);
			} else {
				this.npcManager.alertShot(pos);
				this.heat.commit('gunfire');
				if (this.policeManager) this.policeManager.notifyPlayerShot(pos);
			}
			if (this.birds) this.birds.scare(pos.x, pos.z, 28);
			return;
		}

		// Chute NA BOLA da pelada (Player.primary escolheu o chute perto dela): vira para a bola e não acerta ninguém — a Pelada chuta.
		if (kind === 'kick' && Pelada.ballNear(pos, heading)) { const B = Pelada.E.ball; p.root.rotation.y = Math.atan2(B.x - pos.x, B.z - pos.z); return; }

		// Corpo a corpo: vira para o alvo mais perto à frente (mira assistida) e o golpe vira uma COLISÃO testada durante a animação
		// (Combat.strike: punho/pé/taco estendido). Quem leva cambaleia e é empurrado; chute e taco derrubam. Quem vê, foge.
		const sk = kind === 'swing' ? 'swing' : kind, M = Melee[sk];
		if (!M) return;
		const tgt = this.combat.meleeAim(pos.x, pos.z, heading, sk);
		if (tgt) p.root.rotation.y = Math.atan2(tgt.position.x - pos.x, tgt.position.z - pos.z);
		const knife = weaponKey === 'knife';                                   // faca: soco com lâmina
		this.combat.strike({ position: p.position, heading: () => p.root.rotation.y, ok: () => p.alive && !p.rag && !!p.action && p.action.name === kind }, sk, {
			source: 'player', ref: p,
			dmgMul: (1 + (SkillTree.m.melee || 0) + Outfit.m.melee) * (knife ? Weapons.knife.dmg / M.dmg : 1) * Physique.meleeMul(this.player),      // (força do físico: magro bate fraco, forte bate forte)
			onHit: (t) => {
				if (t.halfLen) { this.npcManager.alertViolence(p.position, 10); return; }      // (carro: vandalismo, só assusta)
				this.npcManager.alertViolence(p.position, this._witnessR(), [t]);
				this.heat.commit('assault');
				this._flash(`Agrediu #${t.id}!`);
			},
		});
	}

	_weaponName(kind) {
		return { none: 'punhos', pistol: 'pistola', smg: 'submetralhadora', shotgun: 'escopeta', bat: 'taco' }[kind];
	}

	_updateMinimap() {                                             // (20 Hz, pelo UiLoop: é um canvas 2D caro e a olho nu não faz diferença)
		let center, heading;
		if (this.mode === 'car' && this.activeCar) {
			center = this.activeCar.position;
			const fwd = this.activeCar.body.getDirection(BABYLON.Axis.Z);
			heading = Math.atan2(fwd.x, fwd.z);
		} else if (this.mode === 'heli' && this.chopper) {
			center = this.chopper.position;
			heading = this.chopper.heading;
		} else {
			center = this.player.position;
			heading = this.player.root.rotation.y;
		}

		const blips = [];
		if (this.physicsReady) {
			for (const v of this.vehicleManager.vehicles) {
				blips.push({ pos: v.position, color: v === this.activeCar ? '#ffe14d' : v.personal ? '#5ad1ff' : '#ff5050' });      // (azul-claro: a sua bicicleta)
			}
			for (const b of this.vehicleManager.boats) blips.push({ pos: b.position, color: b === this.activeCar ? '#ffe14d' : '#4fd8ff' });
		}
		if (this.policeManager) {
			// RADAR: sem estrelas e armado (ou com um crime em flagrante), cada policial aparece com o círculo do que ele enxerga —
			// crime cometido fora dos círculos (e longe o bastante para não ouvirem o tiro) não dá estrela.
			const pm = this.policeManager, armed = this.wanted.level === 0 && this.mode === 'player' && (this.player.weapon !== 'none'), ring = 0;
			// Procurado (ou armado / com crime em flagrante): cada unidade a menos de ~1 tela mostra o CONE do que ela enxerga (como no GTA V)
			// — a polícia só vê o que está à frente dela; fora dos cones (e longe o bastante para não ouvir), dá para agir.
			const cones = (this.wanted.level > 0 || armed) && pm.sightR, cp = this._playerState().pos;
			for (const u of pm.units) {
				// Polícia = azul | SWAT = lilás claro | exército = verde.
				const k = u.kind || u.role;
				let cone = null;
				if (cones && hypot(u.position.x - cp.x, u.position.z - cp.z) < Config.minimap.rangeUnits) { const f = pm._face(u); cone = { a: Math.atan2(f.x, f.z), r: pm.sightR, seen: !!(u.mind && u.mind.sees) }; }
				blips.push({ pos: u.position, color: k === 'swat' ? '#c9b8ff' : (k === 'army' ? '#7fe04a' : (k === 'block' ? '#ff5a4d' : '#3a7bff')), ring, cone });
			}
			const h = pm.heli;
			if (h && h.alive) blips.push({ pos: h.position, color: '#ffffff', ring: this.wanted.level > 0 ? (Config.heli.sight + Math.max(0, this.wanted.level - 3) * 6) * this.weather.sightMul : 0 });
if (this.barricades) for (const b of this.barricades.list) blips.push({ pos: { x: b.x, z: b.z }, color: '#ff8a2a' });      // barricadas em chamas
if (Baile.on && Baile.c) blips.push({ pos: Baile.c, color: Math.floor(performance.now() / 300) % 2 ? '#ff3ad0' : '#35e0ff' });      // baile funk (pisca)        if (MotoStands.built) for (const s of MotoStands.stands) blips.push({ pos: { x: s.x, z: s.z }, color: '#ffd23a' });      // pontos de mototáxi
		if (MotoStands.built) for (const s of MotoStands.stands) blips.push({ pos: { x: s.x, z: s.z }, color: '#ffd23a' });      // pontos de mototáxi
		}
		// Itens no chão: azul = arma, verde = munição, vermelho = kit, amarelo = dinheiro.
		for (const it of this.pickups.active) {
			const c = Pickups.TYPES[it.type].color;
			blips.push({ pos: { x: it.x, z: it.z }, color: `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})` });
		}

		const hp = CityGrid.pois.find((q) => q.type === 'home');                // safe house (ou o imóvel que virou casa): sempre no radar
		this.minimap.update(center, heading, blips, this.gps, this._pursuit(center), hp ? { x: hp.x, z: hp.z, icon: this.menu.icon('home') } : null,
			Laundry.mapPois, Laundry.mapPois.length ? this.menu.icon('cash_bag') : null);      // fachadas de lavagem (ícone 💰 no radar)
	}

	// ---------------------------------------------------------------- helicóptero
	// Modo 'heli': o jogador está dentro de um Chopper. O Player fica INVISÍVEL e INVULNERÁVEL com a posição presa à do helicóptero, então
	// pedestres, polícia, câmera e minimapa seguem "o jogador" sem saber que ele voa. Sair no chão: F; no ar: F = se jogar.
	_spawnChoppers() {
		const V = [4, 0, 4, 3, 7];
		(CityGrid.helipads || []).forEach((p, i) => this.choppers.push(new Chopper(this, p.x, p.z, p.heading, V[i % V.length])));
	}

	// Helicóptero estacionado ao alcance de quem está a pé.
	_chopperNear() {
		if (this.mode !== 'player' || !this.player.alive) return null;
		const pp = this.player.position;
		let best = null, bd = 7.5;
		for (const c of this.choppers) {
			if (!c.alive || c.pilot || c.state === 'failing' || c.alt > c.floor + 0.6) continue;
			if (Math.abs(c.alt - (this.player.onDeck ? this.player.deckH || 0 : 0)) > 1.5) continue;      // (no telhado: só subindo a escada)
			const d = c.distanceTo(pp);
			if (d < bd) { bd = d; best = c; }
		}
		return best;
	}

	_boardChopper(ch) {
		const pl = this.player;
		if (pl.busy || this.heliFall) return;
		ch.board();
		pl.roof = null; pl.onDeck = false; pl.deckH = 0;
		pl.cancelSequence();
		pl.action = null;
		pl.velocity.setAll(0);
		pl.setVisible(false);
		pl.frozen = true;
		pl.invulnerable = true;
		this.mode = 'heli';
		this.chopper = ch;
		this.ui.showVehicle(ch);
		this._flash('Helicóptero! Espaço sobe · Shift desce · W/S frente e ré · A/D lados · Q/E gira · F desce/pula');
	}

	// Comandos do piloto (-1..1): W/S frente-ré, A/D lados, Q/E guinada, ESPAÇO sobe, SHIFT desce.
	_chopperInput() {
		const inp = this.input, ax = inp.getMoveAxis(), k = inp.keys;
		return {
			fwd: ax.z, strafe: ax.x,
			yaw: Math.max(-1, Math.min(1, (k['e'] ? 1 : 0) - (k['q'] ? 1 : 0) + inp.yawAxis)),        // (controle: analógico direito)
			climb: (k[' '] ? 1 : 0) - (k['shift'] ? 1 : 0),
		};
	}

	_updateChoppers(dt) {
		this._chT = (this._chT || 0) + dt;
		const tg = this.camera.target, heli = this.mode === 'heli' && this.chopper;
		let loud = null, ld = 1e9;
		for (const c of this.choppers) {
			const mine = heli && c === this.chopper;
			if (!c.alive) {                                                    // destruído: um novo aparece no heliponto depois de um tempo
				if (this._chT - c.deadAt > 90 && c.distanceTo(tg) > 90) c.revive();
				continue;
			}
			if (!mine && c.state === 'parked' && c.rpm < 0.01 && c.distanceTo(tg) > 150) continue;       // parado e longe: dorme
			c.update(dt, mine ? this._chopperInput() : null);
			if (c.rpm > 0.02) { const d = c.distanceTo(tg); if (d < ld) { ld = d; loud = c; } }
		}
		AudioFX.chopper(loud ? loud.rpm : 0, loud ? ld : 999, loud && loud.state === 'failing' ? 1 : 0);
		if (this.mode === 'heli' && this.chopper) {
			const ch = this.chopper, pl = this.player;
			pl.root.position.x = ch.position.x; pl.root.position.z = ch.position.z;
			pl.velocity.set(ch.vx, 0, ch.vz);
			pl.root.rotation.y = ch.heading;
			this.camera.setFlat(false);
			this.camera.follow(ch.position, dt);
		}
	}

	// F no helicóptero: parado no chão/telhado = desce pelo lado; no ar = SE JOGA (cai; água salva, chão mata).
	_leaveChopper() {
		const ch = this.chopper, pl = this.player;
		if (!ch) return;
		if (ch.alt - ch.floor < 1.2 && ch.speed < 3 && ch.state !== 'failing') {
			const rx = Math.cos(ch.heading), rz = -Math.sin(ch.heading), p = ch.position;
			ch.release();
			this._chopperRelease();
			const pad = ch.floor > 2 && Rooftops.padUnder(p.x, p.z);
			if (pad) {                                                          // pousado num heliponto: desce no telhado (volta pela escada)
				const q = Rooftops.onRoof(pad, p.x + rx * 3.6, p.z + rz * 3.6, 1.2);
				pl.teleport(new BABYLON.Vector3(q.x, 0, q.z));
				pl.roof = pad; pl._roofLast = { x: q.x, z: q.z }; pl.onDeck = true; pl.deckH = pad.H; pl.actor.mesh.position.y = pl.baseY;
				this._flash('Você desceu do helicóptero — a escada externa fica na beira do telhado');
				return;
			}
			pl.teleport(new BABYLON.Vector3(p.x + rx * 3.6, 0, p.z + rz * 3.6));
			this._flash('Você desceu do helicóptero');
			return;
		}
		const p = ch.position, h0 = ch.alt;
		this.heliFall = { x: p.x, z: p.z, h: h0, h0, vy: ch.vy, vx: ch.vx * 0.7, vz: ch.vz * 0.7, t: 0, heading: ch.heading };
		ch.release();
		if (ch.state !== 'failing') ch.fail();                              // sem piloto no ar, ele também cai (sem aviso)
		this._chopperRelease(true);
		pl.setVisible(true);
		pl.actor.mesh.renderingGroupId = 2;                                 // visível por cima de tudo durante a queda
		pl.actor.play('flail', 'none', { restart: true });
		this._flash('Você se jogou do helicóptero!');
	}

	// O jogador deixa o modo 'heli' (keepFrozen: continua sem controle — vai cair).
	_chopperRelease(keepFrozen = false) {
		const pl = this.player;
		this.mode = 'player';
		this.chopper = null;
		pl.invulnerable = false;
		if (!keepFrozen) { pl.frozen = false; pl.setVisible(true); }
	}

	// Queda do jogador (de ~8 m para cima mata em terra firme; na água não machuca; pouco mais baixo = dano e rolamento).
	_updateHeliFall(dt) {
		const F = this.heliFall;
		if (!F) return;
		const pl = this.player, a = pl.actor;
		F.t += dt;
		F.vy -= 24 * dt;
		F.h += F.vy * dt;
		const k = Math.exp(-0.5 * dt);
		F.vx *= k; F.vz *= k;
		F.x += F.vx * dt; F.z += F.vz * dt;
		F.heading += 7 * dt;
		pl.root.position.x = F.x; pl.root.position.z = F.z;
		pl.velocity.setAll(0);
		const floor = Chopper.floorAt(F.x, F.z);
		a.setPosition(F.x, F.z);
		a.setHeading(F.heading);
		const fc = a.clip;                                                   // (o flail no ritmo do próprio clipe, pela fase: qualquer nº de quadros)
		if (fc && fc.fps > 0) a.setPhase(F.t * fc.fps / fc.frames);
		a.mesh.position.y = 0.5 + Math.max(0, F.h);
		if (F.h > floor) return;

		// Tocou o chão (ou o telhado).
		this.heliFall = null;
		a.mesh.renderingGroupId = a.mesh._ysort ? 1 : 0;                   // (2,5D: grupo 1, ver NpcArt.init)
		const pos = new BABYLON.Vector3(F.x, 0, F.z), dx = F.vx || 0.01, dz = F.vz || 0.01;
		const water = floor === 0 && MapGeo.waterDepth(F.x, F.z) > 0;
		pl.frozen = false;
		if (water) {
			for (let i = 0; i < 4; i++) this.waterFx.ripple(F.x + (Math.random() - 0.5) * 2, F.z + (Math.random() - 0.5) * 2, 0.8, 5, 1.4, 0.8);
			for (let i = 0; i < 8; i++) this.carLights.puffs.emit(F.x, 0.5, F.z, (Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4, 0.4, 1.5, 0.9, 0.6, [0.93, 0.97, 1]);
			AudioFX.thud(F.x, F.z);
			pl.teleport(pos);
			pl.setVisible(true);
			this._flash('Você caiu na água e sobreviveu!');
		} else if (F.h0 - floor > 5) {
			pl.teleport(pos);
			pl.setVisible(true);
			pl.hp = 0; pl.armor = 0;
			pl.ragdoll({ dx, dz, power: 9, kind: 'hit', lethal: true });
			AudioFX.thud(F.x, F.z);
			this.camera.shake(0.7);
			this._flash('Você caiu de uma altura mortal…');
		} else {
			const dmg = Math.min(pl.hp - 5, (F.h0 - floor) * 9);
			pl.teleport(pos);
			pl.setVisible(true);
			pl.takeDamage(Math.max(0, dmg), true);
			pl.ragdoll({ dx, dz, power: 7, kind: 'bail' });
			AudioFX.thud(F.x, F.z);
			this._flash(`Pulou do helicóptero baixo! −${Math.round(Math.max(0, dmg))} de vida`);
		}
	}

	// O helicóptero explodiu com o jogador dentro.
	_chopperDown() {
		const ch = this.chopper, pl = this.player;
		if (!ch) return;
		const p = ch.position;
		this._chopperRelease();
		pl.teleport(new BABYLON.Vector3(p.x, 0, p.z));
		pl.setVisible(true);
		pl.hp = 0; pl.armor = 0;
		pl.ragdoll({ dx: ch.vx || 0.01, dz: ch.vz || 0.01, power: 12, kind: 'hit', lethal: true });
		this._flash('O helicóptero explodiu!');
	}

	// F: entra no veículo mais próximo (carro: puxa o motorista para fora; bicicleta/moto: derruba o piloto e sobe)
	// ou, dirigindo, desce (parado: ao lado; em movimento: pula rolando e se machuca).
	// Carro estacionado = desligado, vazio e TRANCADO: F é o roubo rápido (quebra o vidro, dispara o alarme) e
	// G o furtivo (mini-game de arrombar, sem alarme se der certo). Carro destrancado (o que você largou) ou com
	// motorista: F entra/rouba.
	_toggleHijack() {
		if (this.mode === 'heli') { this._leaveChopper(); return; }
		if (this.mode === 'car') { this._leaveVehicle(); return; }
		if (this.player.busy) return;
		const car = this._hijackTarget();
		const ch = this._chopperNear();
		if (ch && (!car || ch.distanceTo(this.player.position) < hypot(car.position.x - this.player.position.x, car.position.z - this.player.position.z))) { this._boardChopper(ch); return; }
		if (!car) { this._flash(this._hijackTarget(false) ? 'Chegue mais perto da porta' : 'Nenhum veículo por perto'); return; }
		if (car.isBoat) this._boardBoat(car);
		else if (car.isBike && car.display) this._flash('Moto de vitrine (presa no cavalete) — compre uma na loja');
		else if (car.isBike) this._mountBike(car);
		else if (car.locked && this.inventory.keys > 0) {                                // chave roubada: destranca sem barulho
			this.inventory.keys--;
			car.locked = false;
			this._flash(`Chave roubada: carro destrancado sem alarme (restam ${this.inventory.keys})`);
			this._enterCar(car, null);
		} else this._enterCar(car, car.locked ? 'smash' : null);
	}

	// G: arrombar o carro trancado sem alarme.
	_lockpickKey() {
		if (this.mode === 'car' || this.player.busy) return;
		const car = this._hijackTarget();
		if (!car || car.isBike || car.isBoat) { this._flash('Nenhum carro trancado por perto'); return; }
		if (!car.locked) { this._flash('Esse carro está aberto — aperte F'); return; }
		this._enterCar(car, 'pick');
	}

	// Veículo roubável mais próximo do jogador a pé (ou null) — e só se ele está ENCOSTADO nele (reach): a até Config.vehicle.jackReach
	// da porta de um dos lados do carro, ou do lado da moto/bicicleta (o roubo começa dali, sem puxar ninguém de longe). Barco: pela
	// distância ao casco (sobe pela borda). reach = false: o mais próximo no raio de procura, perto ou não.
	_hijackTarget(reach = true) {
		if (!this.physicsReady || this.mode === 'car' || this.mode === 'heli' || !this.player.alive) return null;
		const car = this.vehicleManager.nearest(this.player.position, Config.vehicle.hijackRange, this.player);
		if (!car || !reach || car.isBoat) return car;
		const p = this.player.position, R = Config.vehicle.jackReach;
		if (car.isBike) return hypot(car.position.x - p.x, car.position.z - p.z) <= R + 0.8 ? car : null;
		for (const s of [-1, 1]) { const q = this.doors.doorPoint(car, s); if (hypot(q.x - p.x, q.z - p.z) <= R) return car; }
		return null;
	}

	// Entrar num carro, com a porta de verdade: o personagem vai até a porta, abre, entra, e a porta fecha.
	//   how = null    carro aberto (o que você largou) ou com motorista: abre a porta; se há motorista, ele é arrancado
	//                 no meio do puxão (ragdoll) antes de você entrar;
	//   how = 'smash' roubo RÁPIDO de carro trancado: soco no vidro (estilhaça, dispara o alarme), abre e entra;
	//   how = 'pick'  roubo FURTIVO: mini-game de arrombar; se der certo, abre e entra sem alarme; barulho demais
	//                 dispara o alarme e você desiste.
	// O carro só vira controlável depois que a porta fecha.
	_enterCar(car, how = null) {
		const pl = this.player, S = this._sideOf(car), sign = S.sign;
		const driver = car.driver !== false;
		const door = () => this.doors.doorPoint(car, sign);
		car.hold = true;                                              // o carro para enquanto você mexe nele
		car._wasLocked = !!car.locked && !car.isBike && !car.isBoat;    // trancado (sem chave): vai precisar de ligação direta
		this.doors.prewarm(car);
		const open = () => this.doors.set(car, sign, true);
		const atDoor = () => door().face;                             // (virado para o carro)
		// 1) CORRE até a porta, olhando para onde vai (perto: anda; carro em movimento: espera ele frear e acompanha)
		const wait = Math.max(0.3, Math.min(1.2, car.speed / 12)), d0 = door(), dist = hypot(d0.x - pl.position.x, d0.z - pl.position.z);
		const steps = [];
		if (dist > 0.3 || car.speed > 0.5) {
			const run = dist > 1.5;
			steps.push({ clip: run ? 'run' : 'walk', timer: Math.max(wait, Math.min(1.6, dist / (run ? 5.5 : 2.5))), glide: door,
				face: () => { const q = door(), p = pl.position; return hypot(q.x - p.x, q.z - p.z) > 0.25 ? Math.atan2(q.x - p.x, q.z - p.z) : q.face; } });
		}
		// 2) abre a porta (trancado: quebra o vidro ou arromba antes) e, com motorista, arranca ele lá de dentro
		// (cada gesto na porta encosta nela de novo — glide: o carro que ainda freava não deixa o ladrão puxando de longe)
		if (how === 'smash') steps.push({ clip: 'punch', face: atDoor, glide: door, yank: () => this._smashWindow(car, sign) });
		if (how === 'pick') steps.push({ clip: 'pick', face: atDoor, timer: 600, onStart: () => this._startLockpick(car) });
		if (driver) steps.push({ clip: 'carjack', face: atDoor, glide: door, onStart: open, yank: () => { if (typeof WorldMemory !== 'undefined') WorldMemory.crime('carjack', pl.position.x, pl.position.z); this._yankDriver(car, sign); } });
		else steps.push({ clip: 'opendoor', face: atDoor, glide: door, onStart: open });
		// 3) entra: põe o pé lá dentro, gira, senta no banco e recolhe a outra perna, deslizando da porta até o banco enquanto a
		//    carroceria esconde o que já entrou (clipe `sitin`; sem ele — visual antigo guardado no aparelho —, o `enter` de antes)
		const side = sign < 0 ? 'L' : 'R', SI = NpcData.SIT_IN, sc = SI && pl.actor.sheet.getClip('sitin', side);
		if (sc) {
			const dur = sc.fps > 0 ? sc.frames / sc.fps : SI.n / SI.fps, A = CarDoors.axes(car);     // (a duração do clipe do ATLAS — o visual guardado pode ser de outra versão)
			const seat = () => { const q = door(); return { x: q.x - A.rx * sign * SI.travel, z: q.z - A.rz * sign * SI.travel }; };
			steps.push({ clip: 'sitin', weapon: side, face: atDoor, timer: dur, glide: seat, onStart: () => { pl.boarding = car; pl.setCarClip(car, dur); } });
		} else steps.push({ clip: 'enter', face: atDoor });
		const ok = pl.runSequence(steps, {
			face: door().face,
			onDone: () => this._enteredCar(car, sign),
			onAbort: () => this._entryAborted(car),
		});
		if (!ok) { car.hold = false; return; }
		this._flash(driver ? 'Roubando o carro…' : (how === 'smash' ? 'Quebrando o vidro!' : (how === 'pick' ? 'Arrombando a fechadura…' : 'Entrando no carro…')));
	}

	// Entrou: some do mundo, a porta fecha e só então o carro é seu.
	_enteredCar(car, sign) {
		const pl = this.player;
		pl.setVisible(false);
		pl.setCarClip(null);
		pl.frozen = true;
		this.doors.set(car, sign, false);
		this.doors.whenShut(car, () => {
			pl.boarding = null;
			if (!pl.frozen) { car.hold = false; return; }             // (foi teleportado/preso enquanto a porta fechava)
			pl.frozen = false;
			car.hold = false;
			if (car.destroyed) { pl.setVisible(true); return; }       // (o carro pegou fogo nesse meio-tempo)
			car.locked = false;
			car.setControlled(true);
			this.activeCar = car;
			this.mode = 'car';
			if (this.empire && (car._wasLocked || car._xpGiven !== true)) this.empire.spend(4, car.windowBroken ? 8 : 3);
			if (car._wasLocked) { car.hotwire = car.hotwireMax = this.careers ? this.careers.hotwireTime() : 3; car._wasLocked = false; }
			if (this.careers) this.careers.onCarEntered(car);
			if (this.skills && car._xpGiven !== true) { car._xpGiven = true; this.skills.addXp(car.driver === false ? 8 : 12); }
			this.ui.showVehicle(car);                                 // modelo do carro por 3 s
			this._flash(car.ownedRec ? `Seu ${Garage.label(car.ownedRec)} (F pra sair)` : `Carro #${car.id} roubado! (F pra sair)`);
		});
	}

	// Entrada interrompida (ragdoll, tiro que derrubou, arrombar desistido ou alarmado): solta o carro e fecha a porta.
	_entryAborted(car) {
		car.hold = false;
		this.doors.close(car);
		if (this.lockpick.active) this.lockpick.cancel();
		const pl = this.player;
		pl.boarding = null;
		pl.setCarClip(null);
		if (pl.frozen) { pl.frozen = false; pl.setVisible(true); }
	}

	// Soco no vidro: estilhaça e dispara o alarme (a pessoa é VISTA arrombando: é crime e assusta quem está perto).
	_smashWindow(car, sign) {
		const c = car.position, A = CarDoors.axes(car), D = DoorSheet.SPEC[car.spec.id];
		const wx = c.x + A.fx * (D.h - D.len * 0.45) + A.rx * sign * car.halfW;
		const wz = c.z + A.fz * (D.h - D.len * 0.45) + A.rz * sign * car.halfW;
		for (let i = 0; i < 9; i++) {
			this._delayed.push({ t: i * 0.015, fn: () => this.combat.spark(wx + (Math.random() - 0.5) * 0.9, 1.0 + Math.random() * 0.5, wz + (Math.random() - 0.5) * 0.9, [0.62, 0.85, 1]) });
		}
		AudioFX.glass(wx, wz);
		car.windowBroken = true;
		if (car.breakGlass) car.breakGlass(sign < 0 ? 2 : 3);                // (a janela da porta, estilhaçada no carro 3D)
		this._triggerAlarm(car, 'Vidro quebrado — o alarme disparou!');
	}

	// Mini-game de arrombar (roubo furtivo). Acertar os pinos segue a sequência (abre a porta e entra); barulho
	// demais dispara o alarme e interrompe; Esc desiste.
	_startLockpick(car) {
		if (this.inventory.hacks > 0) {                                                   // módulo de hackeio: abre sozinho
			this.inventory.hacks--;
			this._flash(`Módulo de hackeio: fechadura aberta (restam ${this.inventory.hacks})`);
			this._delayed.push({ t: 0.8, fn: () => { if (this.player.action && this.player._seq) this.player.action.timer = 0; } });
			return;
		}
		this.lockpick.start({
			difficulty: (car.lockLevel || (car.lockLevel = 0.85 + Math.random() * 0.5)) * (this.careers ? this.careers.lockpickMul() : 1),
			onEnd: (res) => {
				const pl = this.player;
				if (res === 'ok') { if (pl.action) pl.action.timer = 0; return; }       // acabou o passo: abre a porta
				if (res === 'alarm') this._triggerAlarm(car, 'Barulho demais! O alarme disparou');
				else this._flash('Você desistiu de arrombar');
				pl.cancelSequence();                                                    // (solta o carro)
			},
		});
	}

	// Alarme do carro: buzina em bipes + pisca-alerta por um tempo; é crime (se a polícia vir) e assusta quem está perto.
	_triggerAlarm(car, msg) {
		if (car.alarm > 0) return;
		car.alarm = Config.theft.alarmTime;
		car._alarmT = 0;
		this.heat.commit('car_theft');
		if (this.npcManager) this.npcManager.alertViolence(car.position, Config.theft.alarmRadius);
		this._flash(msg);
	}

	// Buzina presa (motorista morto ao volante): segue o carro; queimou/virou carcaça, cala.
	_hornTick(car) {
		if (!car.horn) return;
		if (car.destroyed || car.wrecked) car.clearDeadDriver();
		else car.horn.set(car.position.x, car.position.z);
	}

	_updateAlarms(dt) {
		if (this.policeManager) for (const car of this.policeManager.cars) this._hornTick(car);     // (viaturas: o motorista também pode morrer)
		for (const car of this.vehicleManager.vehicles) {
			this._hornTick(car);
			if (!(car.alarm > 0)) continue;
			car.alarm -= dt;
			if (car.destroyed || car.alarm <= 0) { car.alarm = 0; car.hazard = false; continue; }
			car._alarmT -= dt;
			if (car._alarmT <= 0) {
				car._alarmT = 0.28;
				car.hazard = !car.hazard;
				const p = car.position;
				AudioFX.alarm(p.x, p.z, car.hazard);
			}
		}
	}

	// Dica de interação (F/G) quando há um veículo ao alcance.
	_updatePrompt() {
		const el = this.hud.prompt;
		if (!el) return;
		// A dica junta ~12 buscas (veículos, esconderijos, muros, lojas, imóveis, pedestres com linha de visada…): recalcula ~10 vezes por
		// segundo — imperceptível num texto de ajuda — e na hora quando o modo (a pé/carro/helicóptero) muda. As teclas (E/F/G/V) não
		// dependem daqui: cada ação procura o próprio alvo quando é apertada.
		this._promptT = (this._promptT || 0) - (this._dt || 0);
		if (this._promptT > 0 && this.mode === this._promptMode && !!Interiors.active === this._promptIn) return;
		this._promptT = 0.1; this._promptMode = this.mode; this._promptIn = !!Interiors.active;
		let html = '';
		const TS = Throwables.s;
		const tAim = TS ? `${Math.round(TS.dist || 0)} m · força ${Math.round(TS.power * 100)}% · ${TS.src === 'mouse' ? 'mire com o mouse' : TS.src === 'stick' ? 'mire com o analógico direito (incline mais = mais longe)' : 'segure para ir mais longe'}` : '';
		if (Gym.active) html = '';                                                  // (treinando: o painel do mini-game já explica tudo)
		else if (TS && TS.phase !== 'throw') html = TS.kind === 'grenade'
			? `<b>SOLTE</b> para jogar a granada<small>${tAim}${TS.armed ? ` · pavio ${Math.max(0, TS.fuse).toFixed(1)} s` : ' · puxando o pino…'}</small>`
			: `<b>SOLTE</b> para jogar o molotov<small>${tAim}${TS.armed ? ' · pano aceso' : ' · acendendo…'}</small>`;
		else if (Interiors.active) html = Interiors.prompt(this);                    // (com as dicas desligadas o texto é montado igual — os botões de toque leem — mas não aparece)
		else if (this.hiding && this.hiding.phase === 'hidden') {
			html = `<b>E</b> sair do esconderijo<small>${this.hiding.seen ? 'a polícia te viu entrar — eles estão vindo!' : 'ninguém te viu entrar'}</small>`;
		} else if (this.holdup) {
			const H = this.holdup, n = 10, on = Math.min(n, Math.floor(H.t / H.dur * n));
			html = `<b>ASSALTO</b> ${'▮'.repeat(on)}${'▯'.repeat(n - on)} ${Math.max(0, Math.ceil(H.dur - H.t))}s<small>mantenha a arma e fique perto — <b>E</b> baixar a arma</small>`;
		} else if (this.mode === 'heli' && this.chopper) {
			const ch = this.chopper;
			if (ch.state === 'failing') html = '<b>PANE!</b> <b>F</b> pule agora!<small>o helicóptero vai explodir ao tocar o chão</small>';
			else if (ch.alt - ch.floor < 1.2) html = '<b>F</b> descer do helicóptero<small><b>ESPAÇO</b> sobe · <b>W/S</b> frente/ré · <b>A/D</b> lados · <b>Q/E</b> gira</small>';
			else html = `<b>F</b> SE JOGAR (${ch.alt > 5 ? 'queda mortal em terra' : 'queda baixa'}; a água salva)<small><b>SHIFT</b> desce · <b>ESPAÇO</b> sobe · <b>W/S</b> <b>A/D</b> <b>Q/E</b> · altura ${Math.round(ch.alt)} m</small>`;
		} else if (this.mode === 'car' && this.activeCar && this.activeCar.hotwire > 0) {
			const hw = this.activeCar;
			html = `<b>LIGAÇÃO DIRETA</b> ${crBar(1 - hw.hotwire / (hw.hotwireMax || 1))}<small>você está exposto na rua — a skill Mecânica (Desmanche) encurta</small>`;
		} else if (this.mode === 'car' && this.careers && this.careers.carPrompt()) {
			html = this.careers.carPrompt();
		} else if (this.mode === 'car' && Garage.carPrompt(this)) {
			html = Garage.carPrompt(this);
		} else if (this.mode === 'car' && Tuning.carPrompt(this)) {
			html = Tuning.carPrompt(this);
		} else if (this.mode === 'car' && Mechanic.carPrompt(this)) {
			html = Mechanic.carPrompt(this);
		} else if (this.mode === 'car' && this._fuelPrompt) {
			html = this._fuelPrompt;
		} else if (this.mode === 'player' && CarCare.job) {
			html = CarCare.prompt(this);
		} else if (this.mode === 'player' && !this.player.busy && !this.lockpick.active) {
			const car = this._hijackTarget();
			const chop = this._chopperNear();
			const spot = !car && !chop && this._nearHideSpot();
			const fence = !car && !spot && CityGrid.nearestVault(this.player.position.x, this.player.position.z, 1.6);
			const shopP = (!car && !chop) ? (this.careers && this.careers.prompt()) || (this.missions && this.missions.prompt()) || (this.propertyUI.cool <= 0 && RealEstate.prompt(this)) || (this.carUI.cool <= 0 && (Dealers.prompt(this) || Garage.prompt(this))) || (this.motoUI.cool <= 0 && MotoStands.prompt(this)) || Mechanic.prompt(this) || StreetLife.prompt(this) || Witnesses.prompt(this) || Calendar.prompt(this) || Personas.prompt(this) || RivalArc.prompt(this) || Aid.prompt(this) || Interiors.prompt(this) : '';
			if (shopP) html = shopP;
			else if (spot) html = `<b>E</b> esconder-se ${spot.kind === 'dumpster' ? 'na caçamba' : (spot.kind === 'barrel' ? 'no latão' : 'no caixote')}<small>se a polícia não te viu entrar, você some do radar</small>`;
			else if (fence && fence.bridgeRail && (this.player.underBridge || this.player.depth > 0)) html = '';      // (nadando sob a ponte: não dá para subir)
			else if (fence) html = fence.bridgeRail ? '<b>V</b> pular da ponte na água' : `<b>V</b> pular ${fence.kind === 'wall' ? 'o muro' : 'a grade'}`;
			else if (!car && this.npcManager) {
				const R = Config.robbery, pp = this.player.position;
				const steal = this.npcManager.nearestTarget(pp, R.theftRange, (n) => !n.surrendered && !n.fleeing && !n.pickpocketed && n.state !== 'HURT', this.player);
				const rob = this.npcManager.nearestTarget(pp, R.holdRange, (n) => !n.surrendered, this.player);
				if (rob) html = `<b>E</b> assaltar${this.player.weapon === 'none' ? ' <small>(precisa de arma na mão)</small>' : '<small>arriscado: chama muito a atenção da polícia</small>'}`;
				if (steal) html += `${html ? '<br>' : ''}<b>C</b> furtar<small>discreto, mas pode dar errado</small>`;
			}
			if (chop && !car) html = '<b>F</b> pilotar o helicóptero<small>Bell 206 — decola com ESPAÇO</small>';
			if (car) {
				if (car.isBoat) html = car.pilot ? `<b>F</b> tomar o leme: ${car.spec.name.toLowerCase()}<small>o piloto cai na água — é crime</small>` : `<b>F</b> pilotar: ${car.spec.name.toLowerCase()} ${car.spec.model}`;
				else if (car.isBike) html = car.wrecked ? `<b>F</b> levantar a ${car.spec.name.toLowerCase()} e subir` : car.riderVariant != null ? `<b>F</b> derrubar o piloto e roubar a ${car.spec.name.toLowerCase()}` : `<b>F</b> subir na ${car.spec.name.toLowerCase()}`;
				else if (car.locked) { html = '<b>F</b> roubo rápido — quebra o vidro e dispara o alarme<small><b>G</b> arrombar na manha — furtivo, sem alarme</small>'; this.doors.prewarm(car); }
				else if (car.driver === false) { html = '<b>F</b> entrar no carro'; this.doors.prewarm(car); }
				else { html = '<b>F</b> roubar o carro (tira o motorista)'; this.doors.prewarm(car); }
				const cp = !car.isBoat && CarCare.prompt(this);                         // a pé na frente/atrás do carro: capô ou porta-malas
				if (cp) html = cp + '<br>' + html;
			}
			if (!html && this.player.crouched) html = this.player.coverLock      // agachado: o estado e como sair dele
				? '<b>Q</b> sair da cobertura<small>colado — mova para os lados para deslizar; segure na ponta para contornar; afaste-se para soltar</small>'
				: this.player.inCover
				? '<b>Q</b> grudar na cobertura<small>em cobertura — tiros do outro lado param no obstáculo; quem está lá não te vê</small>'
				: '<b>Q</b> levantar<small>agachado (furtivo) — a polícia e as testemunhas só te notam bem de perto</small>';
			if (!html && this.player.swimming) {                                        // nadando: o mergulho e o fôlego (o mesmo da corrida)
				const pl = this.player, f = Math.round(100 * (pl.stamina == null ? 1 : pl.stamina / (pl.staminaMax || 100)));
				html = pl.diving ? `<b>Q</b> voltar à tona<small>mergulhado — fôlego ${f}% (acabou, ele sobe sozinho)</small>`
					: `<b>Q</b> mergulhar<small>${pl.winded || f < 15 ? 'sem fôlego — espere recuperar' : `fôlego ${f}%`}</small>`;
			}
			if (!html) html = Interiors.prompt(this);
		}
		const pad = this.input.usingPad ? this.input.padType : '';          // jogando no controle: as teclas viram os botões dele (Xbox/PlayStation)
		if (html === this._promptHtml && this.showPrompts === this._promptShown && pad === this._promptPad) return;
		this._promptHtml = html; this._promptShown = this.showPrompts; this._promptPad = pad;     // (_promptHtml fica com as teclas: os botões de toque leem)
		el.innerHTML = pad ? PadGlyphs.render(html, pad) : html;
		el.style.display = html && this.showPrompts ? 'block' : 'none';
	}

	// Lado do veículo em que o jogador está: vetor lateral unitário (rx, rz) e sinal (+1 direita / −1 esquerda).
	_sideOf(car) {
		const r = car.body.getDirection(BABYLON.Axis.X), l = hypot(r.x, r.z) || 1;
		const rx = r.x / l, rz = r.z / l, p = this.player.position, c = car.position;
		return { rx, rz, sign: ((p.x - c.x) * rx + (p.z - c.z) * rz) >= 0 ? 1 : -1 };
	}

	// ---------------------------------------------------------------- gasolina
	// Posto cuja área cobre (x, z) e com uma bomba a até 7 u, ou null.
	_stationAt(p) {
		for (const s of CityGrid.stations || []) {
			const z = s.zone;
			if (p.x < z[0] || p.x > z[2] || p.z < z[1] || p.z > z[3]) continue;
			if (s.pumps.some((b) => hypot(b.x - p.x, b.z - p.z) < 7)) return s;
		}
		return null;
	}

	// Dirigindo um veículo a motor: avisos de tanque baixo/vazio e, parado perto de uma bomba, E (segurar) abastece cobrando o litro.
	_fuelUpdate(dt) {
		const car = this.activeCar, F = Config.fuel;
		this._fuelPrompt = '';
		if (!car || car.tank <= 0) return;
		const frac = car.fuel / car.tank;
		if (frac < F.warn && !car._fuelWarned) { car._fuelWarned = true; this._flash(`⛽ Pouca gasolina (${Math.round(frac * 100)}%) — procure um posto no mapa`); }
		else if (frac > F.warn + 0.1) car._fuelWarned = false;
		if (car.fuel <= 0 && !car._fuelEmpty) { car._fuelEmpty = true; this._flash('⛽ SEM GASOLINA! O motor morreu — empurre até um posto ou roube outro carro'); }
		else if (car.fuel > 0) car._fuelEmpty = false;

		const st = this._stationAt(car.position);
		if (!st) return;
		if (car.speed > 2.5) { this._fuelPrompt = `<b>${st.name}</b><small>pare perto de uma bomba para abastecer</small>`; return; }
		if (frac > 0.999) { this._fuelPrompt = `<b>${st.name}</b><small>tanque cheio</small>`; return; }
		const inv = this.inventory;
		if (this.input.keys['e']) {
			const liters = Math.min(car.tank - car.fuel, F.fillRate * dt, (inv.cash + 0.99) / F.price);
			if (liters <= 0) { this._fuelPrompt = '<b>Sem dinheiro</b><small>você não tem como pagar a gasolina</small>'; return; }
			car.fuel += liters;
			this._fuelDebt = (this._fuelDebt || 0) + liters * F.price;
			const whole = Math.floor(this._fuelDebt);
			if (whole > 0) { inv.cash = Math.max(0, inv.cash - whole); this._fuelDebt -= whole; }
			this._fuelTick = (this._fuelTick || 0) - dt;
			if (this._fuelTick <= 0) { this._fuelTick = 0.22; AudioFX.blip(300 + frac * 500, 0.05, 0.08); }
			if (car.fuel >= car.tank - 0.01) this._flash(`⛽ Tanque cheio — ${st.name}`);
		}
		const n = 10, on = Math.round(frac * n);
		this._fuelPrompt = `<b>E</b> (segure) abastecer — R$ ${F.price.toFixed(2).replace('.', ',')}/L<small>${'▮'.repeat(on)}${'▯'.repeat(n - on)} ${Math.round(car.fuel)}/${car.tank} L · ${brl(inv.cash)}</small>`;
	}

	// Barco: o jogador vai até o casco (de qualquer lado do píer, ou nadando) e sobe. Se há piloto ao leme (barco navegando), ele
	// é jogado na água na hora — é crime à vista. Sem porta: só "entra" e o barco fica sob controle.
	// Nadando: vai até a borda do lado dele, agarra, sobe e fica de pé no convés (clipe `board_boat`; sem ele — visual antigo guardado
	// no aparelho —, o jeito de antes). Com piloto, ele cai na água quando o jogador sobe. Do píer/raso: chega e entra.
	_boardBoat(boat) {
		const pl = this.player, pp = pl.position;
		if (pl.busy) return;
		boat.hold = true;
		const spot = boat.boardPoint(pp), face = Math.atan2(boat.position.x - pp.x, boat.position.z - pp.z);
		const bc = pl.swimming && pl.actor.sheet.getClip('board_boat', 'none');
		let steps;
		if (bc) {
			const S0 = boat.sidePoints(pp), d = hypot(S0.out.x - pp.x, S0.out.z - pp.z), dur = bc.frames / bc.fps;
			steps = [];
			if (d > 0.3) steps.push({ clip: 'swim_breast', timer: Math.max(0.3, Math.min(1.4, d / 1.4)), glide: () => boat.sidePoints(pl.position).out, face: () => { const q = boat.sidePoints(pl.position).out, p = pl.position; return Math.atan2(q.x - p.x, q.z - p.z); } });
			steps.push({ clip: 'board_boat', timer: dur, fit: true, face: () => boat.sidePoints(pl.position).face, glide: () => boat.sidePoints(pl.position).in, onStart: () => { if (boat.pilot) this._dumpPilot(boat); } });
		} else steps = [
			{ clip: pl.swimming ? 'swim' : 'walk', timer: 0.3, glide: () => boat.boardPoint(pl.position) },
			{ clip: boat.pilot ? 'carjack' : 'enter', yank: () => this._dumpPilot(boat) },
		];
		const ok = pl.runSequence(steps, {
			face,
			onDone: () => {
				boat.hold = false;
				pl.setVisible(false);
				if (boat.destroyed) { pl.setVisible(true); return; }
				boat.setControlled(true);
				this.activeCar = boat; this.mode = 'car';
				this.ui.showVehicle(boat);
				this._flash(`${boat.spec.name} roubad${boat.spec.id === 'lancha' ? 'a' : 'o'}! W/S acelera e dá ré, A/D leme (F pra descer perto da margem)`);
			},
			onAbort: () => { boat.hold = false; if (pl.frozen) { pl.frozen = false; pl.setVisible(true); } },
		});
		if (!ok) { boat.hold = false; return; }
		this._flash(boat.pilot ? 'Tomando o leme…' : 'Subindo no barco…');
	}

	// O piloto da IA cai na água (splash) e o jogador é visto: crime.
	_dumpPilot(boat) {
		if (!boat.pilot) return;
		boat.dismissPilot();
		const p = boat.position;
		for (let k = 0; k < 3; k++) this.waterFx.ripple(p.x + (Math.random() - 0.5) * 2, p.z + (Math.random() - 0.5) * 2, 0.8, 4.5, 1.3, 0.7);
		for (let k = 0; k < 6; k++) this.carLights.puffs.emit(p.x, 0.5, p.z, (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.4, 1.4, 0.8, 0.6, [0.93, 0.97, 1]);
		AudioFX.thud(p.x, p.z);
		this.heat.commit('carjacking');
		if (this.npcManager) this.npcManager.alertViolence(p, 22);
		this._flash('O piloto caiu na água!');
	}

	// Desce do barco: só devagar e perto da margem/píer (não dá para pular com o barco a toda); o jogador aparece na terra ou
	// no píer mais próximo (a menos de 9 u) ou, se não houver, boiando ao lado (dá para nadar a até 230 m da costa).
	_leaveBoat(boat, sp) {
		if (sp > 4.5) { this._flash('Reduza a velocidade para descer do barco'); return; }
		const c = boat.position, f = boat.body.getDirection(BABYLON.Axis.Z), l = hypot(f.x, f.z) || 1, fx = f.x / l, fz = f.z / l, rx = fz, rz = -fx;
		let best = null, bd = 1e9;
		for (let r = 2; r <= 9 && !best; r += 1.5) {
			for (let a = 0; a < 16; a++) {
				const ang = a * Math.PI / 8, ox = Math.cos(ang) * (boat.halfLen * 0.4 + r), oz = Math.sin(ang) * (boat.halfW + r);
				const x = c.x + fx * ox + rx * oz, z = c.z + fz * ox + rz * oz;
				if (!MapGeo.isLand(x, z) || CityGrid.blockedAt(x, z, 0.5)) continue;
				const d = hypot(x - c.x, z - c.z);
				if (d < bd) { bd = d; best = { x, z }; }
			}
		}
		const water = !best;
		if (water) best = { x: c.x + rx * (boat.halfW + 1.4), z: c.z + rz * (boat.halfW + 1.4) };
		boat.setControlled(false);
		this.player.teleport(new BABYLON.Vector3(best.x, 0, best.z));
		this.player.setVisible(true);
		this.mode = 'player';
		this.activeCar = null;
		this._flash(water ? `Pulou na água, ao lado d${boat.spec.id === 'lancha' ? 'a' : 'o'} ${boat.spec.name.toLowerCase()}` : `Desceu d${boat.spec.id === 'lancha' ? 'a' : 'o'} ${boat.spec.name.toLowerCase()}`);
	}

	// Todo carro (menos o abandonado) tem alguém ao volante: sai pela porta do lado do ladrão, como ragdoll.
	_yankDriver(car, sign = null) {
		if (car.driver === false) return;
		const dead = !!car.driverDead;                                          // (baleado ao volante: sai o corpo e a buzina para)
		if (car.clearDeadDriver) car.clearDeadDriver();
		car.driver = false;
		const c = car.position, S = this._sideOf(car);
		if (sign === null) sign = S.sign;
		// O motorista sai pela porta aberta do lado do ladrão (logo na soleira, de onde é arremessado).
		const A = CarDoors.axes(car), D = DoorSheet.SPEC[car.spec.id];
		const seat = { x: c.x + A.fx * (D.h - D.len * 0.5) + A.rx * sign * (car.halfW - 0.3), z: c.z + A.fz * (D.h - D.len * 0.5) + A.rz * sign * (car.halfW - 0.3) };
		this.casualties.push(new Casualty(this, seat, {
			variant: 2 + (car.id * 7) % this.sprites.civilianVariants, sheet: car.id % 2 ? 'civB' : 'civA',
			threat: this.player.position, dx: S.rx * S.sign, dz: S.rz * S.sign, power: dead ? 4.5 : 6.5, kind: 'eject', lethal: dead,
		}));
		this.heat.commit('carjacking');
		if (this.npcManager) this.npcManager.alertViolence(c, 20);
		AudioFX.thud(c.x, c.z);
	}

	// Bicicleta/moto: com piloto, o jogador derruba ele (o piloto vira ragdoll) e então sobe na moto. Caída (depois de uma batida),
	// primeiro ele a levanta: vai até o lado dela, abaixa, puxa pelo guidão e põe de pé — aí sobe.
	_mountBike(bike) {
		const kind = bike.spec.bike, S = this._sideOf(bike);
		if (bike.wrecked) {
			if (!bike.canRaise) return;
			const P = bike.position, sx = S.rx * S.sign, sz = S.rz * S.sign;
			const side = () => ({ x: bike.position.x + sx * 0.95, z: bike.position.z + sz * 0.95 });
			bike.hold = true;
			const ok = this.player.runSequence([
				{ clip: 'walk', timer: 0.25, glide: side },
				{ clip: 'pick', timer: 0.5 },
				{ clip: 'opendoor', yank: () => { if (bike.raise()) { AudioFX.thud(P.x, P.z); this.camera.shake(0.08); } } },
			], {
				face: Math.atan2(-sx, -sz),
				onDone: () => { bike.hold = false; if (!bike.wrecked && this.mode === 'player') this._mountBike(bike); },
				onAbort: () => { bike.hold = false; },
			});
			if (!ok) { bike.hold = false; return; }
			this._flash(`Levantando a ${bike.spec.name.toLowerCase()}…`);
			return;
		}
		const f = bike.body.getDirection(BABYLON.Axis.Z), heading = Math.atan2(f.x, f.z);
		bike.hold = true;
		// Onde a subida começa: de pé ao lado do banco (o 1º quadro do clipe `mount` — ~0,6 m para o lado, um pouco atrás do centro).
		const start = () => ({ x: bike.position.x + S.rx * S.sign * 0.6 - f.x * 0.15, z: bike.position.z + S.rz * S.sign * 0.6 - f.z * 0.15 });
		const go = () => {
			const pl = this.player, p = pl.position, s = start(), d = hypot(s.x - p.x, s.z - p.z);
			pl.boarding = bike;                                          // (a colisão não o empurra para fora da moto: o corpo passa por cima dela)
			if (d < 0.25) { mount(); return; }
			// longe do banco: vai andando até lá (sem isso o boneco "pulava" para o lado da moto no 1º quadro)
			const ok = pl.runSequence([{ clip: d > 1.4 ? 'run' : 'walk', timer: Math.max(0.2, Math.min(0.7, d / (d > 1.4 ? 5.5 : 3))), glide: start }], {
				face: Math.atan2(s.x - p.x, s.z - p.z),
				onDone: mount,
				onAbort: () => { pl.boarding = null; bike.hold = false; },
			});
			if (!ok) { pl.boarding = null; bike.hold = false; }
		};
		const mount = () => {
			// (o veículo continua à vista: o sprite da subida só desenha a pessoa — RiderActor; a moto sai do descanso e fica em pé, como no
			// recorte assado do clipe)
			const B3 = bike.visual && bike.visual.body;
			if (B3 && B3.setLean) B3.setLean(0);
			const ok = this.player.startMount(kind, bike.position, heading, S.sign, () => {
				this.player.boarding = null;
				if (bike.visual) bike.visual.setVisible(true);
				bike.setRider(0);                                        // quem pilota agora é o jogador (variante 0)
				this.player.setVisible(false);
				bike.hold = false;
				bike.setControlled(true);
				this.activeCar = bike;
				this.mode = 'car';
				this.ui.showVehicle(bike);
				this._flash(bike.personal ? 'Sua bicicleta (F pra descer) — largada longe, ela volta para o quintal de casa' : `${bike.spec.name} roubada! (F pra descer)`);
			});
			if (!ok) { this.player.boarding = null; if (bike.visual) bike.visual.setVisible(true); bike.hold = false; }
		};
		if (bike.riderVariant != null) {
			// vai até o lado do piloto (andando; a moto freia) e só então o puxa do banco — encostado nele
			const pl = this.player, p = pl.position, s = start(), d = hypot(s.x - p.x, s.z - p.z), toBike = () => Math.atan2(bike.position.x - pl.position.x, bike.position.z - pl.position.z);
			const steps = [];
			if (d > 0.25) steps.push({ clip: d > 1.4 ? 'run' : 'walk', timer: Math.max(0.25, Math.min(0.8, d / (d > 1.4 ? 5.5 : 3))), glide: start, face: () => Math.atan2(start().x - pl.position.x, start().z - pl.position.z) });
			steps.push({ clip: 'carjack', face: toBike, glide: start, yank: () => bike.throwRider(S.rx * S.sign, S.rz * S.sign, 6.5, 'eject') });
			const ok = pl.runSequence(steps, { face: toBike(), onDone: go, onAbort: () => { bike.hold = false; } });
			if (!ok) { bike.hold = false; return; }
			this._flash('Derrubando o piloto…');
		} else {
			this._flash(`Subindo na ${bike.spec.name.toLowerCase()}…`);
			go();
		}
	}

	// Desce do veículo. Em movimento, o jogador PULA rolando (cambalhota), pela porta do motorista, e perde vida
	// pelo impacto (proporcional à velocidade; nunca mata). Parado, só reaparece ao lado.
	_leaveVehicle() {
		const car = this.activeCar, sp = car.speed;
		if (car.isBoat) { this._leaveBoat(car, sp); return; }
		if (sp > Config.bail.minSpeed) { this._bail(car, sp); return; }
		let exitPos, face = null, sign = 0;
		if (car.isBike) {
			const side = car.body.getDirection(BABYLON.Axis.X).scale(1.5);
			side.y = 0;
			exitPos = car.position.add(side);
		} else {
			// Desce pela porta do motorista (esquerda); se o chão dali não é terra, pela direita.
			sign = -1;
			let d = this.doors.doorPoint(car, sign);
			if (!MapGeo.isLand(d.x, d.z)) { sign = 1; d = this.doors.doorPoint(car, sign); }
			exitPos = new BABYLON.Vector3(d.x, 0, d.z);
			face = d.face + Math.PI;                                  // de costas para o carro, de saída
			if (!car._onDeck && this._climbOut(car, sign)) return;    // com a animação: sai do banco pela porta
		}
		exitPos.y = 0;
		car.setControlled(false);
		if (car.isBike) car.setRider(null);
		this.player.teleport(exitPos);
		if (car._onDeck) { this.player.onDeck = true; this.player.deckH = car.elev; this.player.actor.mesh.position.y = this.player.baseY; }      // desceu do carro EM CIMA do viaduto
		else if (car.isBoat && RoadPlan.onBridge(exitPos.x, exitPos.z)) { this.player.underBridge = true; this.player.actor.mesh.position.y = this.player.baseY; }      // saiu do barco SOB a ponte: na água
		if (face !== null) this.player.root.rotation.y = face;
		this.player.setVisible(true);
		this.mode = 'player';
		this.activeCar = null;
		this._lastCar = car;                                          // (revista do porta-malas se for preso perto dele)
		if (sign) {                                                   // porta abre, a pessoa sai, a porta fecha
			this.doors.set(car, sign, true);
			this._delayed.push({ t: 0.9, fn: () => { if (!car.hold && this.activeCar !== car) this.doors.set(car, sign, false); } });
		}
		this._flash(car.isBike ? `Desceu da ${car.spec.name.toLowerCase()}` : 'Saiu do carro');
	}

	// Sair do carro de verdade: a porta abre e ele sai do BANCO — o `sitin` ao contrário (sitout): gira para a porta, põe a perna para
	// fora, levanta e fica de pé ao lado, deslizando do banco até a porta enquanto a carroceria vai revelando o corpo (da cabeça para
	// os pés); a porta fecha atrás dele. false = sem o clipe (visual antigo guardado no aparelho): aparece do lado, como antes.
	_climbOut(car, sign) {
		const pl = this.player, side = sign < 0 ? 'L' : 'R', SI = NpcData.SIT_IN, sc = SI && pl.actor.sheet.getClip('sitout', side);
		if (!sc) return false;
		const A = CarDoors.axes(car), d0 = this.doors.doorPoint(car, sign), dur = sc.fps > 0 ? sc.frames / sc.fps : SI.n / SI.fps;     // (a duração do clipe do atlas)
		car.setControlled(false);
		car.hold = true;
		this.mode = 'player';
		this.activeCar = null;
		pl.teleport(new BABYLON.Vector3(d0.x - A.rx * sign * SI.travel, 0, d0.z - A.rz * sign * SI.travel));     // no banco
		pl.boarding = car;
		pl.setVisible(true);
		this.doors.set(car, sign, true);
		const release = () => { pl.setCarClip(null); pl.boarding = null; car.hold = false; };
		const ok = pl.runSequence([{ clip: 'sitout', weapon: side, timer: dur, glide: () => this.doors.doorPoint(car, sign) }], {
			face: d0.face,
			onDone: () => { release(); this.doors.set(car, sign, false); },
			onAbort: () => { release(); this.doors.close(car); },
		});
		pl.setCarClip(car, dur, true);                                  // (depois do teleporte, que limpa o recorte)
		if (!ok) { release(); pl.teleport(new BABYLON.Vector3(d0.x, 0, d0.z)); }
		this._flash('Saiu do carro');
		return true;
	}

	_bail(car, sp) {
		const c = car.position, v = car.velocity;
		const r = car.body.getDirection(BABYLON.Axis.X), rl = hypot(r.x, r.z) || 1;
		const ox = -r.x / rl, oz = -r.z / rl;                           // lado do motorista (esquerda)
		const dx = v.x / sp * 0.7 + ox * 0.55, dz = v.z / sp * 0.7 + oz * 0.55;
		const start = new BABYLON.Vector3(c.x + ox * (car.halfW + 0.45), 0, c.z + oz * (car.halfW + 0.45));
		car.setControlled(false);
		if (car.isBike) { car.setRider(null); if (sp > 7) car.fall(); }  // a moto sem piloto tomba
		this.player.teleport(start);
		this.player.setVisible(true);
		this.mode = 'player';
		this.activeCar = null;
		const B = Config.bail, pl = this.player;
		const dmg = Math.min(pl.maxHp * B.maxDmg, (sp - 4) * B.dmgPerMs);
		pl.takeDamage(dmg, true);
		if (pl.hp < 5) pl.hp = 5;                                        // pular nunca mata
		pl.ragdoll({ dx, dz, power: sp * 0.75, kind: 'bail' });
		this._flash(`Pulou do veículo em movimento! −${Math.round(dmg)} de vida`);
	}

	// O piloto de uma bicicleta/moto foi arremessado (batida, tiro, roubo, explosão). Se é o jogador: voa e cai
	// (dano pelo impacto); se é um piloto avulso: vira Casualty (ragdoll que depois foge, ou fica caído se morreu).
	_onThrow(bike, variant, dx, dz, power, kind) {
		if (bike === this.activeCar) {
			const pl = this.player, p = bike.position;
			bike._playerFell = RoadRage.now;                              // (numa batida: o outro motorista vem tirar satisfação com ele a pé)
			bike.setControlled(false);
			this.player.teleport(new BABYLON.Vector3(p.x, 0, p.z));
			this.player.setVisible(true);
			this.mode = 'player';
			this.activeCar = null;
			const dmg = Math.min(60, power * 1.8);
			const lethal = pl.hp - dmg <= 0;
			pl.takeDamage(dmg, true);
			pl.ragdoll({ dx, dz, power, kind: 'hit', lethal });
			this._flash(`Você foi arremessado da ${bike.spec.name.toLowerCase()}!`);
			return;
		}
		const p = bike.position;
		// Queda numa BATIDA (kind 'crash': bateu num carro, numa pessoa): piloto do trânsito/entregador cai, levanta e volta para a moto
		// (Casualty.remount) — não sai correndo apavorado. Tiro, fogo e roubo continuam como antes (foge).
		const lethal = kind !== 'eject' && power > 15, back = kind === 'crash' && !lethal && bike.mode !== undefined;
		const ra = bike.visual && bike.visual.rider;                       // (2,5D: quem cai é o mesmo tipo/visual que pilotava)
		const look = ra && ra.sheet && ra.sheet.isNpc ? { sheet: ra.sheet, row: ra.npcRow } : null;
		// Briga de trânsito: quem voou levanta brigando (um pedestre do pool com o desenho do piloto) em vez da Casualty de sempre.
		if (back && RoadRage.onThrow(this, bike, variant, dx, dz, power, look)) { bike.mode = 'abandoned'; bike.route = null; return; }
		if (bike.courier && variant >= CharacterRig.VARIANT_COURIER && !back) Couriers.onThrown(this, bike);       // o pedido cai no chão
		this.casualties.push(new Casualty(this, p, {
			variant, sheet: variant % 2 ? 'civB' : 'civA', look, threat: kind === 'eject' ? this.player.position : p,
			dx, dz, power, kind: kind === 'eject' ? 'eject' : 'hit', lethal,
			remount: back ? { bike, variant, onMount: (b) => { if (b.courier) Couriers.onRemount(b); } } : null,
		}));

		if (bike.mode !== undefined && !bike.controlled) { bike.mode = 'abandoned'; bike.route = null; }     // sem piloto, para
		if (kind === 'eject') {
			this.heat.commit('carjacking');
			if (this.npcManager) this.npcManager.alertViolence(p, 20);
			AudioFX.thud(p.x, p.z);
		}
	}

	// ---------------------------------------------------------------- dormir (a cama da safe house ou de um imóvel: Interiors)
	// Dormir: escurece a tela, passa a noite, cura, grava o jogo e clareia de novo.
	_startSleep(at = 'safehouse', prop = null) {
		if (this.wanted.level > 0) { this._flash('Com a polícia no seu rastro não dá para dormir'); return; }
		if (this.hiding || this.arrest || this.death) return;
		if (!this._sleepEl) {
			const el = this._sleepEl = document.createElement('div');
			el.style.cssText = "position:fixed;inset:0;z-index:45;background:#000;opacity:0;pointer-events:none;display:none;align-items:center;justify-content:center;flex-direction:column;gap:14px;font-family:var(--font);font-size:18px;font-weight:600;color:#e6ebf5;text-align:center;padding:20px";
			document.body.appendChild(el);
		}
		this.player.velocity.setAll(0);
		this.sleeping = { phase: 'out', t: 0, at, prop };
		this._sleepEl.style.display = 'flex';
		this._sleepEl.innerHTML = '';
	}

	_updateSleep(dt) {
		const s = this.sleeping, el = this._sleepEl;
		if (!s) return;
		s.t += dt;
		if (s.phase === 'out') {
			el.style.opacity = String(Math.min(1, s.t / 1.0));
			if (s.t >= 1.0) {
				s.phase = 'black'; s.t = 0;
				el.innerHTML = '<div style="font-size:22px;letter-spacing:6px">Zzz…</div>';
				// a noite passa
				const pl = this.player;
				this.dayNight.skip(RealEstate.sleepHours(s.prop));
				pl.hp = pl.maxHp;
				Needs.sleep();                                                       // acordou descansado
				if (s.at !== 'here') Interiors.wakeAtSafeHouse(this);
				if (this.policeManager) this.policeManager.scatter(pl.position);
				s.perks = RealEstate.wakePerks(this, s.prop);
				if (this.empire) { this.empire.onSleep(); this.empire.onWake(); }
				const ok = SaveGame.write(this);
				s.ok = ok;
			}
		} else if (s.phase === 'black') {
			if (s.t > 0.9 && !s.shown) {
				s.shown = true;
				el.innerHTML = `<div style="font-size:12px">${this.dayNight.label} — você acordou descansado</div>${s.perks && s.perks.length ? '<div style="font-size:9px;color:#ffd23a">' + s.perks.join(' · ').toUpperCase() + '</div>' : ''}<div style="font-size:10px;color:${s.ok ? '#8be08b' : '#ff8a8a'}">${s.ok ? 'JOGO SALVO' : 'NÃO FOI POSSÍVEL SALVAR'}</div>`;
			}
			if (s.t >= 2.6) { s.phase = 'in'; s.t = 0; }
		} else {
			el.style.opacity = String(Math.max(0, 1 - s.t / 1.0));
			if (s.t >= 1.0) { el.style.display = 'none'; this.sleeping = null; this._flash(s.ok ? 'Jogo salvo' : 'Falha ao salvar o jogo'); }
		}
	}

	// ---------------------------------------------------------------- esconderijos e pulos
	// E: sair do esconderijo | entrar no esconderijo ao alcance (caçamba, caixote, latão) | senão, assaltar.
	_interact() {
		if (this.careers && this.careers.interact()) return;
		if (this.missions && this.missions.interact()) return;
		if (!this.propertyUI.open && this.propertyUI.cool <= 0 && RealEstate.interact(this)) return;
		if (!this.carUI.open && this.carUI.cool <= 0 && (Dealers.interact(this) || Garage.interact(this))) return;      // concessionária / garagem
		if (!Panel.anyCool() && this.stashUI.cool <= 0 && (CarCare.interact(this) || Mechanic.interact(this))) return;      // capô, porta-malas, balcão de peças
		if (!this.motoUI.open && this.motoUI.cool <= 0 && MotoStands.interact(this)) return;
		if (Interiors.interact(this)) return;
		if (this.hiding) { if (this.hiding.phase === 'hidden') this._leaveHiding(); return; }
		if (this.holdup) { this._cancelHoldup('Você baixou a arma — a vítima fugiu'); return; }
		if (this.player.busy) return;
		if (StreetLife.interact(this)) return;                           // separar a briga, devolver a bolsa, comprar no carrinho
		if (Witnesses.interact(this)) return;                            // intimidar ou subornar a testemunha
		if (Calendar.interact(this)) return;                             // a barraca da festa junina
		if (Personas.interact(this)) return;                             // conversar com Seu Zé, Tia Nena, o pastor, o Jorginho, Dona Rosa
		if (RivalArc.interact(this)) return;                             // estourar a boca do Dentinho; o destino dele
		if (Aid.interact(this)) return;                                  // desarmado perto de um morador da favela: ajudar (dar comida/água/kit)
		const spot = this._nearHideSpot();
		if (spot) this._startHiding(spot); else this._tryRob();
	}

	// Esconderijo mais próximo do jogador (distância até o retângulo < maxD), ou null.
	_nearHideSpot(maxD = 2.3) {
		const p = this.player.position;
		return CityGrid.nearestHideSpot(p.x, p.z, maxD);
	}

	// Entra no esconderijo: vai até a beirada, "mergulha" nele e some. Se a polícia (já atrás de você) te VÊ entrando,
	// eles vão até lá; se não viu, você some do radar e foge quando passar o tempo sem ninguém te ver.
	_startHiding(spot) {
		const pl = this.player, p = pl.position;
		const px = Math.max(spot.x - spot.w / 2, Math.min(p.x, spot.x + spot.w / 2)), pz = Math.max(spot.z - spot.d / 2, Math.min(p.z, spot.z + spot.d / 2));
		let dx = p.x - px, dz = p.z - pz, d = hypot(dx, dz);
		if (d < 0.01) { dx = 0; dz = -1; d = 1; }
		const edge = { x: px + (dx / d) * 0.95, z: pz + (dz / d) * 0.95 };
		const pm = this.policeManager;
		const seen = this.wanted.level > 0 && !!pm && pm.playerSeen && !(SkillTree.m.hideAlways);      // (Sumir no mapa: sempre funciona)
		this.hiding = { spot, phase: 'in', seen, t: 0, edge };
		const face = Math.atan2(px - edge.x, pz - edge.z);
		const ok = pl.runSequence([{ clip: 'walk', timer: 0.25, glide: edge }, { clip: 'enter' }], {
			face, onDone: () => this._hidden(), onAbort: () => { this.hiding = null; },
		});
		if (!ok) this.hiding = null;
		else AudioFX.door(p.x, p.z, true);
	}

	_hidden() {
		const pl = this.player, H = this.hiding;
		if (!H) return;
		pl.setVisible(false);
		pl.frozen = true;
		pl.invulnerable = true;
		H.phase = 'hidden'; H.t = 0;
		AudioFX.thud(pl.position.x, pl.position.z);
		this._flash(H.seen ? 'Você se escondeu… mas a polícia te viu entrar!' : (this.wanted.level > 0 ? 'Escondido! Ninguém viu você entrar — aguarde a poeira baixar' : 'Escondido (E para sair)'));
	}

	_leaveHiding() {
		const pl = this.player;
		this.hiding = null;
		pl.frozen = false; pl.invulnerable = false;
		pl.setVisible(true);
		this._flash('Saiu do esconderijo');
	}

	// Por frame, escondido: se a polícia te viu entrar, quando o primeiro policial chega perto ele te acha.
	_updateHiding(dt) {
		const H = this.hiding;
		if (!H || H.phase !== 'hidden') return;
		H.t += dt;
		if (H.seen && this.wanted.level > 0 && this.policeManager) {
			const pm = this.policeManager, p = this.player.position;
			const near = pm.officers.some((o) => o.alive && !o.rag && o.distanceTo(p) < 5.5);
			if ((near && H.t > 0.8) || (H.t > 12 && pm.nearestDist(p) < 22)) this._foundHiding();
		}
	}

	// Te acharam: sai do esconderijo à força e a rendição/prisão segue o fluxo normal.
	_foundHiding() {
		const pl = this.player;
		this.hiding = null;
		pl.frozen = false; pl.invulnerable = false;
		pl.setVisible(true);
		this._flash('Te acharam!');
		this._startArrest();
	}

	// V: pula a grade/muro mais próximo (precisa haver espaço livre do outro lado).
	// ---------------------------------------------------------------- tático: agachar / cobertura / rolar (Config.tactics)
	// Q (L3 no controle): agacha (furtivo) ou levanta. Perto (coverSnap) de um prédio, muro, caçamba, contêiner ou carro parado, vai
	// até ele e fica EM COBERTURA (combat/Cover.js).
	_toggleCrouch() {
		const pl = this.player;
		if (pl.swimming && !this.death && !this.arrest) {                                     // nadando, o Q mergulha e volta à tona
			if (pl.diving) pl.surface();
			else if (!pl.dive()) this._flash(pl.winded || pl.stamina < (pl.staminaMax || 100) * 0.15 ? 'Sem fôlego para mergulhar' : 'Não dá para mergulhar agora');
			return;
		}
		if (pl.busy || pl.swimming || (pl.depth || 0) > 0 || this.hiding || this.holdup || this.arrest || this.death || this.lockpick.active) return;
		const p = pl.position, T = Config.tactics, C = Cover.find(p.x, p.z, T.coverSnap);
		if (pl.crouched && (pl.coverLock || !C)) { pl.setCrouch(false); return; }          // colado (ou sem cobertura perto): levanta
		// Perto de cobertura: vai até ela e GRUDA (o direcional passa a deslizar ao longo dela — Player._coverMove)
		const st = Player.coverStickOf(C);
		if (C && Math.abs(C.d - st) > 0.08) pl.coverSnap = { x0: p.x, z0: p.z, x: C.x + C.nx * st, z: C.z + C.nz * st, t: 0, dur: 0.12 + 0.08 * C.d };
		pl.setCrouch(true);
		if (C) pl.coverLock = { pull: 0, hold: 0 };
		if (C && !this._tipCover) { this._tipCover = true; this._flash('Em cobertura: tiros vindos do outro lado param no obstáculo e quem está lá não te vê'); }
		else if (!C && !this._tipSneak) { this._tipSneak = true; this._flash('Agachado: furtivo — a polícia e as testemunhas só te notam bem de perto'); }
	}

	// V (longe de grade/muro) ou RB: rola na direção em que anda (parado: para a frente). As balas passam por você no meio do rolamento.
	_tryRoll() {
		const pl = this.player;
		if (this.mode !== 'player' || pl.busy || pl.swimming || this.hiding || this.holdup || this.arrest || this.death || this.lockpick.active || this.sleeping) return;
		const ax = this.input.getMoveAxis(), { forward, right } = this.camera.getGroundBasis();
		let dx = right.x * ax.x + forward.x * ax.z, dz = right.z * ax.x + forward.z * ax.z;
		if (dx * dx + dz * dz < 0.04) { const h = pl.root.rotation.y; dx = Math.sin(h); dz = Math.cos(h); }
		if (pl.startRoll(dx, dz)) AudioFX.roll(pl.position.x, pl.position.z);
		else if (pl.winded || (pl.stamina != null && pl.stamina < Config.tactics.rollStamina * 0.5)) this._flash('Sem fôlego para rolar');
	}

	// Raio em que as testemunhas notam um crime do jogador: agachado (furtivo), bem menor.
	_witnessR(r = Config.npc.violenceRadius) { return this.player.crouched ? r * Config.tactics.stealthWitness : r; }

	_tryVault() {
		const pl = this.player;
		if (pl.busy || this.hiding) return;
		const p = pl.position, o = CityGrid.nearestVault(p.x, p.z, 1.5);
		if (!o) { this._tryRoll(); return; }                         // (longe de grade/muro, V rola)
		pl.setCrouch(false);
		if (o.bridgeRail && (pl.underBridge || pl.depth > 0)) { this._flash('Alto demais para subir daqui'); return; }      // (nadando sob a ponte)
		const land = CityGrid.vaultLanding(o, p.x, p.z, true);
		if (!land) { this._flash(o.bridgeRail ? 'Aqui embaixo não tem água' : 'Sem espaço do outro lado'); return; }
		const face = Math.atan2(land.x - p.x, land.z - p.z);
		if (land.water) {                                                    // da ponte para o mar: salto de cabeça e mergulho
			const dive = !!pl.actor.sheet.getClip('bridge_dive', 'none');
			const step = dive ? { clip: 'bridge_dive', timer: 0.95, fit: true, glide: land, arc: 2.2 } : { clip: 'vault', timer: 0.85, fit: true, glide: land, arc: 1.6 };   // (fit: o clipe tocado uma vez, esticado até o timer)
			pl.runSequence([step], { face, onDone: () => this._splash(land.x, land.z, dive) });
		} else {
			pl.runSequence([{ clip: 'vault', timer: 0.6, glide: land, arc: 0.9 }], { face });
		}
		AudioFX.thud(p.x, p.z);
	}

	// Mergulho (pulou da ponte): o tchibum e a gota que volta da água (WaterFx.plunge) no ponto onde o jogador caiu; de cabeça, ele vai
	// ao fundo e volta à tona sozinho (Player.plunge: o mergulho e o dive_out).
	_splash(x, z, headFirst = false) {
		if (!this.waterFx) return;
		this.waterFx.plunge(x, z);
		this.waterFx.ripple(x + 0.6, z - 0.4, 0.8, 3.5, 1.0, 0.6);
		AudioFX.thud(x, z);
		if (headFirst && this.player.swimming) this.player.plunge(1.2);
	}

	// ---------------------------------------------------------------- assalto e furto
	// ASSALTO (E): exige arma na mão. A vítima se rende (mãos ao alto, ajoelha) e leva `holdTime` s para entregar tudo —
	// você precisa manter a arma e ficar perto. Policial perto vendo a cena = procurado; testemunhas fogem e ligam ao fim, mas só
	// vem a polícia que estiver por perto (Config.police.callRadius).
	_tryRob() {
		const pl = this.player, R = Config.robbery;
		if (pl.busy || this.holdup) return;
		const victim = this.npcManager.nearestTarget(pl.position, R.holdRange, (n) => !n.surrendered, this.player);
		if (!victim) { this._flash('Ninguém por perto pra assaltar…'); return; }
		if (pl.weapon === 'none') { this._flash(this.inventory.armed ? 'Saque uma arma pra assaltar (teclas 1-9)' : 'Sem arma não tem assalto — arrume uma'); return; }
		pl.setCrouch(false);                                           // (anunciar o assalto é de pé)
		victim.surrender(pl.position);
		pl.root.rotation.y = Math.atan2(victim.position.x - pl.position.x, victim.position.z - pl.position.z);
		pl.velocity.setAll(0);
		this.holdup = { victim, t: 0, dur: R.holdTime, alertT: 0, seen: false };
		if (this.empire) this.empire.spend(5, 12);
		this.heat.commit('mugging');                                     // flagrante: só um policial perto vendo a cena (renovado a cada 1 s)
		this.holdup.seen = this.npcManager.alertViolence(pl.position, R.witnessRadius + 8, victim) > 0;
		AudioFX.blip(320, 0.18, 0.22);
		this._flash('Mãos pra cima! Mantenha a mira…');
	}

	// Por frame durante o assalto: confere se ainda vale, mantém a mira e, no fim, a vítima entrega o dinheiro.
	_updateHoldup(dt) {
		const H = this.holdup, pl = this.player, R = Config.robbery, v = H.victim;
		const d = hypot(v.position.x - pl.position.x, v.position.z - pl.position.z);
		if (!v.alive || v.rag || !v.surrendered) { this.holdup = null; return; }       // levou golpe/tiro: acabou (ele já reagiu)
		if (this.mode !== 'player' || pl.rag || pl.weapon === 'none' || pl.swimming || this.arrest || this.death || this.hiding) { this._cancelHoldup('Você baixou a arma — a vítima fugiu'); return; }
		if (d > R.holdLeash) { this._cancelHoldup('A vítima escapou!'); return; }

		H.t += dt;
		pl.aimTimer = Math.max(pl.aimTimer, 0.3);                      // segue de arma em punho (mirando)
		H.alertT -= dt;
		if (H.alertT <= 0) {                                           // quem chega e vê a cena foge e vira testemunha
			H.alertT = 1;
			this.heat.commit('mugging');
			if (this.npcManager.alertViolence(pl.position, R.witnessRadius, v) > 0) H.seen = true;
		}
		if (H.t < H.dur) return;

		// Entregou tudo.
		this.holdup = null;
		const loot = R.holdLoot[0] + Math.floor(Math.random() * (R.holdLoot[1] - R.holdLoot[0] + 1));
		this.inventory.addCash(loot);
		if (typeof WorldMemory !== 'undefined') WorldMemory.crime('holdup', pl.position.x, pl.position.z, { value: loot });
		AudioFX.blip(980, 0.12, 0.2);
		v.endSurrender(pl.position);
		Standing.harm(this, 4);
		this.heat.commit('mugging');
		// Testemunhas ligam — mas só vem a polícia que estiver por perto (Config.police.callRadius); ela vai ao local e, se te achar
		// enquanto investiga, você vira procurado. Sem polícia por perto a ligação não dá em nada.
		const coming = H.seen && this.policeManager ? this.policeManager.callPolice(pl.position) : 0;
		if (coming) this._flash(`Assalto: +${brl(loot)}! Testemunhas ligaram e tem polícia perto — vaza antes que te achem!`);
		else if (H.seen) this._flash(`Assalto: +${brl(loot)}! Testemunhas ligaram, mas não tem polícia por perto — some daqui`);
		else this._flash(`Assalto: +${brl(loot)}! Some daqui antes que alguém te veja`);
	}

	_cancelHoldup(msg) {
		const H = this.holdup;
		this.holdup = null;
		if (H.victim.alive) H.victim.endSurrender(this.player.position);
		if (msg) this._flash(msg);
	}

	// FURTO (C): carteirada discreta, sem arma. Chance aleatória de dar certo; se falhar o alvo percebe e dá o alarme,
	// mas é bem menos arriscado que um assalto (nenhum flagrante longo, sem polícia avisada).
	_tryPickpocket() {
		const pl = this.player, R = Config.robbery;
		if (pl.busy || this.holdup) return;
		const target = this.npcManager.nearestTarget(pl.position, R.theftRange, (n) => !n.surrendered && !n.fleeing && n.state !== 'HURT', this.player);
		if (!target) { this._flash('Ninguém por perto pra furtar…'); return; }
		if (target.pickpocketed) { this._flash('Esse já está sem nada no bolso'); return; }
		pl.pickpocket(target.position, () => this._resolveTheft(target));
	}

	// Probabilidade de o furto dar certo. Por enquanto fixa/aleatória; depois virá do status do personagem.
	_theftChance(npc) { return Math.min(0.95, Config.robbery.theftChance + (SkillTree.m.theft || 0) + (this.empire ? this.empire.fx('theft', 0) : 0) + (this.player.crouched ? Config.tactics.theftBonus : 0)); }      // (agachado: chega de mansinho)

	_resolveTheft(npc) {
		const pl = this.player, R = Config.robbery;
		const gone = !npc.alive || npc.rag || hypot(npc.position.x - pl.position.x, npc.position.z - pl.position.z) > R.theftRange + 1;
		if (gone) { this._flash('Ele se afastou — não deu tempo'); return; }
		if (Math.random() < this._theftChance(npc)) {
			npc.pickpocketed = true;
			const loot = R.theftLoot[0] + Math.floor(Math.random() * (R.theftLoot[1] - R.theftLoot[0] + 1));
			this.inventory.addCash(loot);
			if (this.careers) this.careers.onPickpocket(npc, pl.position);
			if (this.skills) this.skills.addXp(5);
			if (this.achievements) this.achievements.bump('thefts');
			if (typeof WorldMemory !== 'undefined') WorldMemory.crime('theft', npc.position.x, npc.position.z);
			if (this.empire) this.empire.spend(2, 3);
			AudioFX.blip(1180, 0.08, 0.14);
			this._flash(`Furto: +${brl(loot)} — ele nem percebeu`);
		} else {
			npc.panic(pl.position);                                    // percebeu: grita e sai correndo
			if (this.empire) this.empire.spend(2, 10);
			Standing.harm(this, 3);
			this.heat.commit('theft');
			this.npcManager.alertViolence(pl.position, this._witnessR(9), npc);
			AudioFX.blip(190, 0.2, 0.22);
			this._flash('Te pegaram no flagra! Ladrão!');
		}
	}

	// Posição e velocidade do que o jogador controla (a pé ou carro).
	_playerState() {
		if (this.mode === 'car' && this.activeCar) {
			return { pos: this.activeCar.position, vel: this.activeCar.velocity };
		}
		return { pos: this.player.position, vel: this.player.velocity };
	}

	// Sai do carro na marra (preso/morto): o carro fica abandonado e o jogador volta a pé.
	_dropFromCar() {
		if (this.mode !== 'car') return;
		this.activeCar.setControlled(false);
		if (this.activeCar.isBike) this.activeCar.setRider(null);
		this.mode = 'player';
		this.activeCar = null;
		this.player.setVisible(true);
	}

	// Cercado pelo tempo todo: o jogador se RENDE. Sai do veículo (se estava num), ergue as mãos e se ajoelha enquanto o
	// policial mais próximo corre até ele; então aparece a tela "DETIDO" (jogo parado atrás de um blur total) até
	// qualquer tecla/botão — só aí vem a multa e a ida à delegacia (_busted).
	_startArrest() {
		HangProbe.arm('prisão (rendição e tela)', 600);
		const pm = this.policeManager, pl = this.player;
		this.bustTimer = 0;
		this._closeInventory();
		if (this.mode === 'car' && this.activeCar) {                       // desce do veículo, que fica parado/largado
			const car = this.activeCar, c = car.position, r = car.body.getDirection(BABYLON.Axis.X), rl = hypot(r.x, r.z) || 1;
			this._dropFromCar();
			pl.teleport(new BABYLON.Vector3(c.x + r.x / rl * 2.4, 0, c.z + r.z / rl * 2.4));
		}
		if (pl.action) pl.cancelAction();
		let best = null, bd = Infinity;
		for (const o of pm.officers) {
			if (!o.alive || o.rag || (o.index < 0 && !o.free)) continue;
			const d = o.distanceTo(pl.position);
			if (d < bd) { bd = d; best = o; }
		}
		const stars = this.wanted.level;
		if (!best) { this._busted(null, null, stars); return; }            // ninguém a pé para prender: como antes
		if (bd > 13) {                                                     // longe demais: um policial chega "do nada" a ~9u, fora de cena
			const a = Math.random() * Math.PI * 2;
			const p = this.nav.closestPoint(new BABYLON.Vector3(pl.position.x + Math.cos(a) * 9, 0, pl.position.z + Math.sin(a) * 9));
			if (best.index >= 0) this.nav.crowd.agentTeleport(best.index, p);
			best.transform.position.copyFrom(p);
		}
		pl.invulnerable = true;
		best.arrest = { target: () => pl.position, arrived: false };
		const face = Math.atan2(best.position.x - pl.position.x, best.position.z - pl.position.z);
		pl.runSequence([{ clip: 'surrender' }, { clip: 'kneel', timer: 9999 }], { face });
		this.arrest = { phase: 'approach', officer: best, t: 0, lost: 0, stars };
		this._flash('Você se rendeu! Mãos para cima!');
	}

	_updateArrest(dt) {
		const A = this.arrest;
		A.t += dt;
		if (A.phase === 'approach') {
			const arrived = !A.officer.arrest || A.officer.arrest.arrived || !A.officer.alive;
			if ((arrived && A.t > 1.4) || A.t > 6) { A.phase = 'cuff'; A.t = 0; }
		} else if (A.phase === 'cuff') {
			if (A.t > 0.9) {                                               // policial parado diante do ajoelhado: tela de detido
				A.phase = 'screen'; A.t = 0;
				const light = A.stars === 1, O = Config.police.oneStar;
				A.report = this.heat.arrest(A.stars);                     // ARRESTED: bail, confiscation, record wiped → PAROLE
				A.wake = this._wakeInfo(light ? O.hours : null);
				this.endScreen.show({ title: I18n.t('heat.arrest.title'), lines: [
					...this.heat.arrestLines(A.report),
					{ text: I18n.t(light ? 'heat.arrest.released' : 'heat.arrest.wake', { time: A.wake.label }), color: '#9ec5ff' },
				] });
				AudioFX.blip(180, 0.5, 0.25);
				this._anyPress();                                          // (descarta teclas apertadas antes da tela)
			}
		} else if (A.t > 0.7 && this._anyPress()) this._finishArrest();
	}

	// Qualquer tecla, clique ou botão de controle apertado neste frame (consome tudo).
	_anyPress() {
		let hit = false;
		for (const k of Object.keys(this.input.justPressed)) { if (this.input.justPressed[k]) hit = true; this.input.justPressed[k] = false; }
		const pads = navigator.getGamepads ? navigator.getGamepads() : [];
		const down = [...pads].some((p) => p && p.buttons.some((b) => b.pressed));
		if (down && !this._padWas) hit = true;
		this._padWas = down;
		return hit;
	}

	_finishArrest() {
		const A = this.arrest;
		this.arrest = null;
		this.endScreen.hide();
		this.player.invulnerable = false;
		HangProbe.mark('prisão: policial termina a prisão');
		if (A.officer) A.officer.endArrest();
		this._busted(A.report, A.wake ? A.wake.hours : null, A.stars);
	}

	// Horas que passam até o jogador acordar (no mínimo Config.respawn.hoursMin) e a hora do relógio em que isso cai.
	_wakeInfo(range = null) {
		const R = Config.respawn, [h0, h1] = range || [R.hoursMin, R.hoursMax], hours = h0 + Math.random() * (h1 - h0);
		const t = (this.dayNight.hour + hours) % 24, h = Math.floor(t), m = Math.floor((t - h) * 60);
		return { hours, label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
	}

	// Acorda no prédio `kind` ('hospital' | 'station'), na calçada da frente, depois de `hours` horas.
	_respawn(kind, hours) {
		HangProbe.arm('respawn: ' + kind, 600);
		HangProbe.mark('respawn: ponto de despertar');
		const home = kind === 'home' ? (RealEstate.homeSpawn() || SafeHouse.spawnWorld()) : null;      // 'home': ao lado da cama (ou na porta do imóvel-casa)
		const p = home ? new BABYLON.Vector3(home.x, 0, home.z) : CityGrid.landmarkSpawn(kind);
		HangProbe.mark('respawn: teleporte');
		this.player.teleport(p);
		this.player.root.rotation.y = home ? home.face : 0;                // de frente para o prédio (norte) / para a porta
		this.player.hp = this.player.maxHp;
		this.player.armor = 0; this.player.armorMax = 0;                   // sem colete
		this.player.weapon = 'none';                                       // acorda de punhos (armas guardadas na mochila, ou confiscadas)
		this.player.aimTimer = 0;
		this.camera.snapTo(this.player.position);
		HangProbe.mark('respawn: pular horas');
		this.dayNight.skip(hours === null ? this._wakeInfo().hours : hours);
		HangProbe.mark('respawn: império');
		if (this.empire) this.empire.onWake();
		HangProbe.mark('respawn: gangues');
		if (this.gangs) this.gangs.clear();
		HangProbe.mark('respawn: espalhar polícia');
		if (this.policeManager) this.policeManager.scatter(p);              // horas depois: a polícia já não está onde estava
		if (home && !RealEstate.homeSpawn()) Interiors.wakeAtSafeHouse(this);      // (a safe house: ao lado da cama, lá dentro)
		HangProbe.arm('acordou: ' + kind, 20);                              // (caixa-preta: grava os próximos 20 s, ver core/HangProbe.js)
	}

	// Preso: multa e acorda na DELEGACIA, 12h+ depois.
	_busted(report = null, hours = null, stars = this.wanted.level) {
		const light = stars === 1, O = Config.police.oneStar;
		HangProbe.arm('preso', 600);
		if (typeof WorldMemory !== 'undefined' && stars >= 1) { const p = this.player.position; WorldMemory.log('busted', { district: this.empire ? this.empire.districtAt(p.x, p.z) : null, stars }); }
		HangProbe.mark('preso: ficha, fiança e confisco');
		if (!report) report = this.heat.arrest(stars);                 // ARRESTED: stars and record wiped, bail, confiscation → PAROLE
		this.bustTimer = 0;
		HangProbe.mark('preso: sair do veículo');
		const trunkMsg = CarCare.onBusted(this, this.activeCar || this._lastCar);      // revista do porta-malas (o fundo falso esconde)
		Robbery.abort(); Traces.onBusted();
		this._dropFromCar();
		this._closeInventory();
		HangProbe.mark('preso: cédulas marcadas');
		if (typeof Banks !== 'undefined') Banks.lose();                    // (e as cédulas marcadas)
		this._respawn('station', hours === null && light ? this._wakeInfo(O.hours).hours : hours);
		this._flash(this.heat.arrestSummary(report) + (trunkMsg || ''));
	}

	// Desce do veículo no lugar onde ele parou (o jogador a pé fica sem posição enquanto dirige).
	_stepOutOfCar() {
		if (this.mode !== 'car' || !this.activeCar) return;
		const car = this.activeCar, c = car.position, r = car.body.getDirection(BABYLON.Axis.X), rl = hypot(r.x, r.z) || 1;
		this._dropFromCar();
		this.player.teleport(new BABYLON.Vector3(c.x + r.x / rl * 2.4, 0, c.z + r.z / rl * 2.4));
	}

	// Vida zerada: o personagem cai (sprite de morto), o mundo segue por um instante, e aparece "FIM DA LINHA" (jogo
	// parado atrás do blur) até qualquer tecla/botão; só então vêm a conta e o despertar no HOSPITAL, 12h+ depois.
	_startDeath() {
		HangProbe.arm('morte (queda e tela)', 600);
		const pl = this.player;
		this.bustTimer = 0;
		this._closeInventory();
		this.lockpick.cancel();
		this._stepOutOfCar();
		if (this.mode === 'heli') this._chopperRelease();
		pl.cancelSequence();
		pl.action = null;
		pl.velocity.setAll(0);
		pl.frozen = true;                                                  // sem controle; o corpo fica no chão
		pl.setVisible(true);
		pl.actor.play('dead', 'none', { restart: true });
		this.reloading = 0;
		const court = Standing.isResident(Standing.territoryAt(this.player.position.x, this.player.position.z)) && !!SafeHouse.spawnWorld();      // morador caído no território da própria facção: tribunal (estranho não é julgado)
		this.death = { phase: 'fall', t: 0, court };
		this._flash(court ? '☠ Você caiu no território do tráfico…' : '☠ Você morreu');
	}

	_updateDeath(dt) {
		const D = this.death;
		D.t += dt;
		if (D.phase === 'fall') {
			if (D.t > 1.8 && D.court) {
				D.phase = 'court'; D.t = 0;
				this.tribunal.show();
			} else if (D.t > 1.8) {
				D.phase = 'screen'; D.t = 0;
				D.lost = this.inventory.fine(0.5); this.inventory.ravage();                   // morrer custa metade do dinheiro e os suprimentos
				D.wake = this._wakeInfo();
				this.endScreen.show({ title: 'FIM DA LINHA', lines: [
					{ text: `CONTA DO HOSPITAL: ${brl(D.lost)}`, color: '#ffd23f' },
					{ text: 'PERDEU KITS, COMIDA, ÁGUA, JOIAS E METADE DA MUNIÇÃO', color: '#ff7a6e' },
					{ text: `VOCÊ ACORDA NO HOSPITAL ÀS ${D.wake.label}`, color: '#ff9ea0' },
				] });
				AudioFX.blip(120, 0.7, 0.25);
				this._anyPress();
			}
		} else if (D.phase === 'court') {
			// aguardando o veredito (TribunalUI → _courtVerdict)
		} else if (D.t > 0.7 && this._anyPress()) {
			this.death = null;
			this.endScreen.hide();
			this._wasted(D.lost, D.wake.hours);
		}
	}

	// Veredito do Tribunal do Crime ('pay' | 'seize' | 'labia'): quem sobrevive acorda na safe house; a execução leva ao HOSPITAL (como uma morte comum).
	_courtVerdict(kind) {
		const D = this.death, inv = this.inventory, S = Standing;
		let lost = 0, text = '';
		if (kind === 'labia' && Math.random() >= S.labiaChance()) {
			// execução: não é game over — o personagem é dado como morto, perde como numa morte comum e acorda no HOSPITAL
			D.phase = 'screen'; D.t = 0;
			D.lost = inv.fine(0.5); inv.ravage();
			D.wake = this._wakeInfo();
			this.endScreen.show({ title: 'EXECUTADO', lines: [
				{ text: 'A LÁBIA NÃO CONVENCEU O TRIBUNAL', color: '#ff7a6e' },
				{ text: `CONTA DO HOSPITAL: ${brl(D.lost)}`, color: '#ffd23f' },
				{ text: 'PERDEU KITS, COMIDA, ÁGUA, JOIAS E METADE DA MUNIÇÃO', color: '#ff7a6e' },
				{ text: `VOCÊ ACORDA NO HOSPITAL ÀS ${D.wake.label}`, color: '#ff9ea0' },
			] });
			AudioFX.blip(90, 0.9, 0.3);
			this._anyPress();
			return;
		}
		if (kind === 'pay') { lost = inv.cash; inv.cash = 0; S.add('traffic', 8); text = `Multa paga: -${brl(lost)}. Dívida quitada`; }
		else if (kind === 'seize') { inv.confiscate(); inv.ravage(); S.add('traffic', -3); text = 'Levaram tudo: armas, kits e joias'; }
		else { lost = inv.fine(0.3); S.add('traffic', -4); text = `Você convenceu o tribunal (-${brl(lost)}). Mais uma chance`; }
		this.death = null;
		this._wasted(lost, null, 'home');
		this._flash(`⚖ ${text}. Acordou na safe house`);
	}

	// Morreu: sem procurado, conta do hospital, e acorda no HOSPITAL 12h+ depois.
	_wasted(lost = null, hours = null, where = 'hospital') {
		HangProbe.arm('morte: ' + where, 600);
		HangProbe.mark('morte: zerar procurado');
		const custody = this.heat.onPlayerDown();                      // killed during a chase: the police take the player in (ARRESTED)
		this.bustTimer = 0;
		HangProbe.mark('morte: sair do veículo');
		Robbery.abort();
		this._dropFromCar();
		this._closeInventory();
		this.reloading = 0;
		HangProbe.mark('morte: reviver');
		this.player.revive();
		HangProbe.mark('morte: conta do hospital');
		if (lost === null) { lost = this.inventory.fine(0.5 * (1 - (SkillTree.m.hospital || 0))); this.inventory.ravage(); }
		this._respawn(where, hours);
		if (where === 'hospital') this._flash(`☠ Você acordou no hospital. Conta: -${brl(lost)}`);
		if (custody) this._flash(this.heat.arrestSummary(custody));
	}

	_closeInventory() {
		if (this.inventoryOpen) this._toggleInventory(false);
	}

	// Batida de carro (Vehicle detectou a queda brusca de velocidade): dano ao carro, som, faíscas, tremor.
	// Se o outro carro envolvido é o do jogador, a culpa é dele (e bater forte é crime).
	_onCarImpact(car, dv, dmg, dvx = 0, dvz = 0) {
		let src = 'crash';
		const ac = this.activeCar;
		if (ac && car !== ac && BABYLON.Vector3.Distance(car.position, ac.position) < 5.5) src = 'player';
		car.takeDamage(dmg, src);
		if (car.cond) CarCare.onImpact(car, dv, dmg, dvx, dvz);              // radiador, suspensão, vazamento de óleo (vehicle/CarCare.js)

		// Bicicleta/moto: numa batida forte o piloto é ARREMESSADO (continua no sentido em que vinha) e o veículo tomba.
		// (entregador: apressado, costurando o trânsito — qualquer batida mais firme já derruba; ele levanta e volta para a moto)
		if (car.isBike && dv > (car.courier ? 4.5 : 5.5) && car.riderVariant != null) {
			car.throwRider(-dvx, -dvz, dv * 0.9, car.controlled ? 'hit' : 'crash');
			if (dv > (car.courier ? 6 : 8)) car.fall();
		}

		RoadRage.onImpact(this, car, dv, dvx, dvz);                       // batida entre dois veículos: às vezes vira briga de trânsito

		const p = car.position;
		AudioFX.crash(p.x, p.z, Math.min(1, dv / 16));
		if (car === ac) this.input.rumble(Math.min(1, dv / 12), 0.6, 120 + dv * 12);
		this.combat.spark(p.x, 1.0, p.z, [1, 0.85, 0.45]);
		const f = this.camera.target;
		if (hypot(p.x - f.x, p.z - f.z) < 45) this.camera.shake(Math.min(0.7, dv * 0.045));

		if (car === ac && this.mode === 'car') {
			// O motorista também sente a batida forte.
			if (dv > 8) this.player.takeDamage((dv - 8) * 3);
		} else if (src === 'player' && dv > 5 && this.wanted) {
			this.heat.commit('hit_and_run');
		}
	}

	// O carro do jogador explodiu: ele é jogado para fora, ao lado (o dano da explosão vem depois).
	_ejectPlayer(car) {
		if (this.mode !== 'car' || this.activeCar !== car) return;
		const side = car.body.getDirection(BABYLON.Axis.X).scale(2.6);
		side.y = 0;
		const exitPos = car.position.add(side);
		exitPos.y = 0;
		car.setControlled(false);
		this.player.teleport(exitPos);
		if (car._onDeck) { this.player.onDeck = true; this.player.deckH = car.elev; this.player.actor.mesh.position.y = this.player.baseY; }      // desceu do carro EM CIMA do viaduto
		else if (car.isBoat && RoadPlan.onBridge(exitPos.x, exitPos.z)) { this.player.underBridge = true; this.player.actor.mesh.position.y = this.player.baseY; }      // saiu do barco SOB a ponte: na água
		this.player.setVisible(true);
		this.mode = 'player';
		this.activeCar = null;
		this._flash('💥 O carro explodiu!');
	}

	// O nível de procurado mudou: avisa o jogador e manda a polícia reagir.
	_onWantedChange(n, prev, why) {
		const msg = {
			1: '★ A polícia te viu! Saia do raio deles ou se esconda atrás dos prédios',
			2: '★★ Viaturas pelo rádio! Quebre a linha de visão e saia do círculo de busca',
			3: '★★★ Helicóptero e SWAT a caminho! Ele não te vê debaixo de viaduto, ponte ou toldo',
			4: '★★★★ SWAT de metralhadora e bloqueios nas ruas — o helicóptero atira',
			5: '★★★★★ INIMIGO DO ESTADO! Ruas fechadas, SWAT e exército atrás de você',
		};
		if (n > prev) this._queueForces(n);
		if (this.goals) this.goals.onWanted(n, prev, why);
		if (this.careers) this.careers.onWanted(n, prev);
		if (this.empire && n > prev) this.empire.spend(0, 10 * (n - prev));
		const fled = n === 0 && (why === 'escape' || why === 'paint');                     // (pintura express na oficina também é fuga)
		if (this.skills && fled) this.skills.addXp(25 * prev * prev);
		if (fled && prev >= 2 && typeof WorldMemory !== 'undefined') { const p = this.player.position; WorldMemory.log('escape', { district: this.empire ? this.empire.districtAt(p.x, p.z) : null, stars: prev }); }
		if (this.achievements && fled && prev >= 5) this.achievements.bump('escape5');      // fugir de muitas estrelas vale muito
		if (n > prev && msg[n]) this._flash(msg[n]);
		else if (n === 0 && why === 'escape') this._flash('Você se safou! A polícia perdeu o seu rastro');
		if (this.policeManager) this.policeManager.onWantedChange(n, prev, why);
	}

	_toggleNavDebug() {
		const mesh = this.nav.getDebugMesh();
		if (!mesh) return;
		this.navDebugVisible = !this.navDebugVisible;
		mesh.setEnabled(this.navDebugVisible);
		this._flash(`NavMesh ${this.navDebugVisible ? 'ON' : 'OFF'}`);
	}

	_flash(msg) {
		if (this.ui) this.ui.toast(msg);
		if (this.hud.action) this.hud.action.textContent = msg;
		this.actionTimer = 2.5;
	}

	// What the walking crowd must know each step (CrowdSim.setWorld): the footprints of the cars near the camera, at ground level (on
	// a viaduct they are not in the people's way), and the player on foot — people step aside from him.
	_crowdWorld() {
		const f = this.nav.focus, R2 = 70 * 70, out = this._crowdCars || (this._crowdCars = []), fw = this._crowdFw || (this._crowdFw = new BABYLON.Vector3());
		out.length = 0;
		if (this.carDamage) for (const c of this.carDamage.allCars()) {
			const p = c.position;
			if (c.spec.boat || (c.elev || 0) > 1 || (p.x - f.x) * (p.x - f.x) + (p.z - f.z) * (p.z - f.z) > R2) continue;
			c.fwdToRef(fw);
			const fl = Math.hypot(fw.x, fw.z) || 1;
			out.push(p.x, p.z, fw.x / fl, fw.z / fl, c.halfLen, c.halfW);
		}
		const pl = this.player, onFoot = this.mode === 'player' && pl.alive && !pl.rag && !pl.swimming;
		this.nav.crowd.setWorld(new Float32Array(out), onFoot ? { x: pl.position.x, z: pl.position.z, vx: pl.velocity.x, vz: pl.velocity.z, r: Config.player.radius } : null);
	}

	// The player bumps into people instead of walking through them: the overlap holds him back (the part of his velocity into the
	// person is lost) and shoves the person aside — crowd agents through the worker (CrowdProxy.push), people out of the crowd (on
	// the beach, in the water) directly.
	_bumpPeople() {
		const pl = this.player;
		if (this.mode !== 'player' || !pl.alive || pl.rag || pl.swimming || !this.npcManager) return;
		const p = pl.position, v = pl.velocity, R = Config.player.radius;
		const people = this.policeManager ? this.npcManager.npcs.concat(this.policeManager.officers) : this.npcManager.npcs;
		let hit = false;
		for (const n of people) {
			if (!n.alive || n.rag || !n.position || !Vehicle.sameLevel(n, pl)) continue;      // (sob a ponte: quem anda lá em cima não esbarra)
			const q = n.position, dx = p.x - q.x, dz = p.z - q.z, d2 = dx * dx + dz * dz, rr = R + ((n.params && n.params.radius) || 0.4);
			if (d2 >= rr * rr || d2 < 1e-6) continue;
			const d = Math.sqrt(d2), over = rr - d, ux = dx / d, uz = dz / d, into = -(v.x * ux + v.z * uz);
			p.x += ux * over * 0.5; p.z += uz * over * 0.5;                         // he gives way by half the overlap...
			if (into > 0) { v.x += ux * into * 0.7; v.z += uz * into * 0.7; }       // ...and loses most of the speed into the person
			const push = over * 0.5 + Math.min(0.2, Math.max(0, into) * 0.04);
			if (n.index >= 0 && this.nav) this.nav.crowd.push(n.index, -ux * push, -uz * push);
			else if (n.transform) { n.transform.position.x -= ux * push; n.transform.position.z -= uz * push; }
			hit = true;
		}
		if (hit) MapGeo.resolveCircle(p, R, pl.underBridge);
	}

	// Vinheta vermelha de dano: todo quadro (é um fade), mas só escreve no DOM quando muda.
	_updateHitFlash() {
		if (!this.hud.hit) return;
		const o = Math.round(Math.min(0.6, Math.max(0, this.player.hitFlash) * 1.7) * 100) / 100;
		if (o !== this._hitOp) { this._hitOp = o; this.hud.hit.style.opacity = String(o); }
	}

	_updateHud() {
		// O painel #hud antigo é `display:none` (só aparece com ?debug): sem ele visível, todas as escritas no DOM abaixo são
		// trabalho jogado fora (e `textContent` invalida o estilo mesmo com o mesmo texto). Reconfere a visibilidade a cada 0.5 s.
		const now = performance.now();
		if (now - (this._hudCheckT || 0) > 500) { this._hudCheckT = now; this._hudShown = !!(this.hud.pos && this.hud.pos.offsetParent); }
		if (this._hudShown === false) {
			if (this.hud.action && this.actionTimer <= 0 && this.hud.action.textContent) this.hud.action.textContent = '';
			return;
		}
		const driving = this.mode === 'car' && this.activeCar;
		const flying = this.mode === 'heli' && this.chopper;
		const p = driving ? this.activeCar.position : this.player.position;

		this.hud.pos.textContent = `X: ${p.x.toFixed(2)} Z: ${p.z.toFixed(2)}`;
		this.hud.vel.textContent = flying ? `${Math.round(this.chopper.speed * 3.6)} km/h · ${Math.round(this.chopper.alt)} m` : driving
			? `${Math.round(this.activeCar.speed * 3.6)} km/h`
			: `${this.player.speed.toFixed(2)} m/s`;
		this.hud.state.textContent = flying ? 'FLYING' : (driving ? 'DRIVING' : this.player.state.toUpperCase());
		this.hud.fps.textContent = Math.round(this.gameEngine.engine.getFps());

		if (this.hud.mode) {
			if (flying) {
				const ch = this.chopper, blocks = Math.max(0, Math.min(8, Math.round(ch.hpFrac * 8)));
				this.hud.mode.textContent = `HELICÓPTERO ${'█'.repeat(blocks)}${'░'.repeat(8 - blocks)}${ch.state === 'failing' ? ' 🔥 PANE' : ''}`;
				this.hud.mode.style.color = ch.hpFrac < 0.3 ? '#ff5a4d' : '#00ff00';
			} else if (driving) {
				// Estado do carro: barra de vida (e aviso quando fumaça/fogo).
				const car = this.activeCar, blocks = Math.max(0, Math.min(8, Math.round(car.hpFrac * 8)));
				const tag = car.burning > 0 ? ' 🔥' : (car.hpFrac < Config.crash.smokeBelow ? ' ♨' : '');
				const fb = car.tank > 0 ? Math.max(0, Math.min(5, Math.round(car.fuel / car.tank * 5))) : -1, fuelTxt = fb < 0 ? '' : ` ⛽${'█'.repeat(fb)}${'░'.repeat(5 - fb)}`;
				this.hud.mode.textContent = `${car.spec.name.toUpperCase()} ${'█'.repeat(blocks)}${'░'.repeat(8 - blocks)}${tag}${fuelTxt}`;
				this.hud.mode.style.color = car.hpFrac < 0.3 ? '#ff5a4d' : '#00ff00';
			} else {
				this.hud.mode.textContent = 'A PÉ';
				this.hud.mode.style.color = '#00ff00';
			}
		}
		if (this.hud.clock) this.hud.clock.textContent = this.dayNight.label;
		if (this.hud.weather) this.hud.weather.textContent = this.weather.label;

		// Vida, arma/munição, dinheiro e a vinheta vermelha ao levar dano.
		const pl = this.player, inv = this.inventory, wk = pl.weapon === 'none' ? 'fists' : pl.weapon;
		if (this.hud.hp) {
			const n = Math.round(pl.hp), blocks = Math.max(0, Math.round((pl.hp / pl.maxHp) * 10));
			this.hud.hp.textContent = `${'█'.repeat(blocks)}${'░'.repeat(10 - blocks)} ${n}`;
			this.hud.hp.style.color = pl.hp < 30 ? '#ff5a4d' : '#00ff00';
		}
		if (this.hud.weapon) {
			this.hud.weapon.textContent = `${Weapons[wk].name}${inv.isGun(wk) ? ' ' + inv.ammoText(wk) : ''}${this.reloading > 0 ? ' ↻' : ''}`;
		}
		if (this.hud.cash) this.hud.cash.textContent = `${brl(inv.cash)}`;

		if (this.hud.npcs) {
			this.hud.npcs.textContent = this.aiReady
				? `${this.npcManager.count} (${this.npcManager.fleeingCount} fugindo, ${this.npcManager.waitingCount} no sinal)`
				: 'carregando…';
		}
		if (this.hud.wanted) {
			const lvl = this.wanted.level;
			const el = this.hud.wanted;
			if (lvl <= 0) {
				el.textContent = 'LIMPO';
				el.style.color = '#00ff00';
			} else if (this.bustTimer > 0) {
				const left = Math.max(0, Config.police.bustTime - this.bustTimer);
				el.textContent = `${'★'.repeat(lvl)}  PRESO EM ${left.toFixed(1)}s`;
				el.style.color = '#ff5a4d';
			} else if (this.wanted.lose > 0.3) {
				// Fuga em andamento: ninguém te enxerga.
				el.textContent = `${'★'.repeat(lvl)}  ESCAPANDO ${this.wanted.left.toFixed(1)}s`;
				el.style.color = '#7dff9a';
			} else {
				el.textContent = '★'.repeat(lvl) + '☆'.repeat(Config.wanted.maxLevel - lvl);
				el.style.color = lvl >= 4 ? '#ff5a4d' : '#ffd23f';
			}
		}
		// Forças em campo atrás de você (só com ★): o que a cidade mandou.
		if (this.hud.forcesRow && this.policeManager) {
			const pm = this.policeManager, lvl = this.wanted.level;
			this.hud.forcesRow.style.display = lvl > 0 ? '' : 'none';
			if (lvl > 0) {
				const n = (f) => pm.officers.filter((o) => o.alive && f(o)).length;
				const cars = pm.cars.filter((c) => c.role !== 'block' && c.fsm.name === 'CHASE').length;
				const parts = [`${cars} viat.`, `${n((o) => o.kind === 'cop' && o.fsm.name === 'CHASE')} a pé`];
				if (pm.heli && pm.heli.alive) parts.push('🚁');
				if (n((o) => o.kind === 'swat')) parts.push(`SWAT ${n((o) => o.kind === 'swat')}`);
				if (n((o) => o.kind === 'army')) parts.push(`EB ${n((o) => o.kind === 'army')}`);
				if (pm.blocks.active) parts.push(`${pm.blocks.active} bloq.`);
				this.hud.forces.textContent = parts.join(' · ');
			}
		}
		if (this.hud.action && this.actionTimer <= 0 && this.hud.action.textContent) {
			this.hud.action.textContent = '';
		}
	}
}
memoStatics(Game, 'WEAPON_KEYS', 'WEAPON_SLOTS', 'WEAPON_LIST');
