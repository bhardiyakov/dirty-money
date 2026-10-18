// ============================================================================
// PauseMenu — o menu de pausa (Esc / P). O jogo PARA de verdade (física, IA, relógio, áudio) e o fundo fica borrado.
// A moldura e as abas são pixel art; o MAPA é em alta resolução (MapRenderer.drawHD), com zoom, arrastar e cursor.
//   MAPA        mapa tático da cidade: clique/Enter marca o destino (blip vermelho, também no minimapa; sem rota), legenda de lugares
//   INVENTÁRIO  mochila de espaços limitados (estilo Resident Evil): equipar, usar, descartar
//   STATUS / HABILIDADES   reservados (funcionalidades futuras)
//   CONFIGURAÇÕES          volume, efeitos, minimapa, dicas
// Teclas: Esc/P fecha · Q/E ou Tab troca de aba · mapa: setas/WASD cursor, Enter/clique marca, X limpa, +/- zoom, arrastar move.
// Toque: um dedo arrasta, pinça = zoom, toque marca. No celular o mapa ocupa a página, com botões por cima (legenda, tela cheia, zoom,
// centrar); tocar no minimapa abre o mapa EXPANDIDO (openMap: só o mapa, de ponta a ponta).
// Lugares novos (lanchonete, Pay n Pay, loja…) entram no mapa e na legenda só com CityGrid.addPoi({type,name,x,z}).
// ============================================================================

class PauseMenu {
	static get TABS() {
		return [['map', '🗺️ Mapa'], ['inventory', '🎒 Inventário'], ['status', '📊 Status'], ['careers', '💼 Carreiras'], ['business', '🏪 Negócios'], ['empire', '👑 Império'], ['guide', '📖 Guia'], ['settings', '⚙️ Ajustes']];
	}
	static get SET_KEYS() { return ['volume', 'sfx', 'minimap', 'prompts', 'camBounce', 'graphics', 'language', ...(NativeMobile.touch ? ['tiltSteer'] : []), 'cars3d', 'dev']; }      // linhas de Ajustes, na ordem (giroscópio: só em tela de toque)
	static get KEYS_HTML() {
		return '<b>WASD</b> mover · <b>SHIFT</b> correr · <b>ESPAÇO/CLIQUE</b> atacar · <b>BOTÃO DIREITO</b> mirar (o cursor aponta) · <b>E</b> assaltar (com arma)/esconder · <b>C</b> furtar · <b>V</b> pular grade / rolar · <b>Q</b> agachar / cobertura · <b>F</b> veículo · <b>G</b> arrombar · <b>R</b> recarregar · <b>M</b> kit médico · <b>I</b> inventário · <b>O</b> carreiras · <b>K</b> máscara · <b>G</b> gritar (no assalto) · <b>E</b> na frente/atrás do carro: capô/porta-malas · <b>ESC</b> menu · <b>1-9</b> armas';
	}

	// Legenda do mapa: tipos de lugar (a chave é o `type` dos POIs).
	static get POI_TYPES() {
		return {
			lanchonete: { label: 'Lanchonete', icon: 'food' },
			conveniencia: { label: 'Loja de Conveniência', icon: 'cart' },
			paynspray: { label: 'Oficina mecânica (Pay n Pay)', icon: 'wrench' },
			joalheria: { label: 'Joalheria', icon: 'jewels' },
			negocio: { label: 'Seus negócios', icon: 'biz', mine: true },
			home: { label: 'Safe house', icon: 'home' },
			imovel: { label: 'Imóvel à venda', icon: 'home' },
			baile: { label: 'Baile funk', icon: 'music' },
			mototaxi: { label: 'Ponto de mototáxi', icon: 'moto' },
			gunshop: { label: 'Loja de Armas', icon: 'gun' },
			academia: { label: 'Academia', icon: 'gym' },
			boutique: { label: 'Boutique (roupas)', icon: 'shirt' },
			hospital: { label: 'Hospital', icon: 'hospital' },
			station: { label: 'Delegacia', icon: 'station' },
			marina: { label: 'Marina', icon: 'boat' },
			gas: { label: 'Posto de Gasolina', icon: 'fuel' },
			chop: { label: 'Desmanche (carros roubados)', icon: 'chop' },
			dealer: { label: 'Concessionária (carros à venda)', icon: 'dealer' },
			motodealer: { label: 'Concessionária de motos', icon: 'moto' },
			boatshop: { label: 'Loja náutica (jet skis, lanchas, barcos)', icon: 'boat' },
			tuning: { label: 'Loja de tunagem (motor, turbo, pintura, neon, aerofólio)', icon: 'tune' },
			helipad: { label: 'Heliponto (escada externa até o telhado)', icon: 'heli' },
			fachada: { label: 'Suas fachadas (lavagem)', icon: 'cash_bag', mine: true },      // pontos e negócios comprados para lavar dinheiro (Laundry.syncMap)
		};
	}

	constructor(game) {
		this.g = game;
		this.isOpen = false;
		this.tab = 'map';
		this.sel = null;                 // POI destacado na legenda
		this.invSel = 0;                 // item selecionado na mochila
		this.invView = 'equip';          // Inventário: 'equip' (personagem, EquipUI) | 'bag' (grade da mochila)
		this.setRow = 0;                 // linha das configurações
		this._icons = {};
		this._legendIdx = {};
		this.settings = Object.assign({ volume: 0.7, sfx: true, minimap: true, prompts: true, camBounce: true, graphics: 'auto', tiltSteer: false, dev: false }, this._loadSettings());       // tiltSteer: volante por giroscópio (celular)
		delete this.settings.hd; delete this.settings.smooth; delete this.settings.aimAssist;          // (escolhas antigas: o jogo é sempre em alta definição com o gráfico suave e a mira manual)
		this.settings.cars3d = typeof CarArt3D !== 'undefined' && CarArt3D.available();      // (já resolvido em config.js: escolha salva; ?cars2d)
		this.map = { cx: 0, cz: 0, scale: 4.5, cur: { x: 300, y: 200 }, drag: null, init: false };
		this._build();
		// giroscópio negado ou ausente: a opção volta a desligado (aqui e no menu inicial) e o jogo avisa
		TiltSteer.onFail = (msg) => {
			this.settings.tiltSteer = false; this._saveSettings();
			if (this.isOpen && this.tab === 'settings') this._renderSettings();
			window.dispatchEvent(new Event('dm-settings'));
			if (TiltSteer.notify) TiltSteer.notify(msg);
		};
		this.applySettings();
	}

	// ------------------------------------------------------------- configurações
	_loadSettings() { return Store.getJSON('settings', null) || {}; }
	_saveSettings() { Store.setJSON('settings', this.settings); }
	applySettings() {
		const s = this.settings;
		AudioFX.setVolume(s.volume);
		AudioFX.muted = !s.sfx;
		const mm = document.getElementById('minimap');
		if (mm) mm.style.visibility = s.minimap ? '' : 'hidden';
		this.g.showPrompts = s.prompts;
		CompassCamera.bounceOn = s.camBounce !== false;
		TiltSteer.setEnabled(!!s.tiltSteer && NativeMobile.touch);           // (ligar pede a permissão do sensor no iPhone: chamado dentro do toque)
		if (this.g.dev) this.g.dev.setEnabled(s.dev);
		if (typeof CarArt3D !== 'undefined' && !!s.cars3d !== CarArt3D.available()) this._applyCars3d(!!s.cars3d);
	}

	// Carros 3D liga/desliga na hora: cada carro do mundo troca de visual (sprite do atlas ↔ malha 3D) mantendo pintura, amassado e lugar.
	_applyCars3d(on) {
		Config.art.cars3d = on;
		const cd = this.g.carDamage;
		if (cd) for (const car of cd.allCars()) if (car.remakeVisual) car.remakeVisual();
	}

	// ------------------------------------------------------------------ montagem
	_build() {
		const css = document.createElement('style');
		css.textContent = `
			#pause { position: fixed; inset: 0; z-index: 30; display: none; flex-direction: column; gap: 16px; padding: 20px 32px 14px;
				-webkit-backdrop-filter: blur(20px) brightness(0.55) saturate(1.1); backdrop-filter: blur(20px) brightness(0.55) saturate(1.1);
				background: radial-gradient(1400px 800px at 50% 0%, rgba(30,38,58,0.45), rgba(5,7,12,0.78));
				font-family: var(--font); color: var(--tx); user-select: none; }
			#pause.show { display: flex; animation: pmIn .2s ease-out; }
			@keyframes pmIn { from { opacity: 0; } to { opacity: 1; } }
			.pm-tabs { display: flex; gap: 4px; justify-content: center; flex-wrap: wrap; align-self: center; padding: 5px; border-radius: var(--r-pill);
				background: rgba(255,255,255,0.06); border: 1px solid var(--line); }
			.pm-tab { padding: 9px 20px; font: 600 14px var(--font); color: var(--tx-2); cursor: pointer; border-radius: var(--r-pill); transition: background .15s, color .15s; white-space: nowrap; }
			.pm-tab:hover { color: var(--tx); background: rgba(255,255,255,0.06); }
			.pm-tab.on { color: #0b0e14; background: var(--tx); box-shadow: 0 4px 14px rgba(0,0,0,0.35); }
			.pm-tab.pm-new::after, #pmInvSeg > div.pm-new::after { content: ''; display: inline-block; width: 8px; height: 8px; margin-left: 7px; border-radius: 50%; background: #fbbf24; box-shadow: 0 0 6px rgba(251,191,36,0.8); vertical-align: 1px; }
			.pm-main { flex: 1; min-height: 0; display: flex; }
			.pm-page { display: none; flex: 1; min-height: 0; gap: 16px; }
			.pm-page.on { display: flex; }
			.pm-hints { display: flex; gap: 22px; justify-content: center; flex-wrap: wrap; font-size: 12px; color: var(--tx-3); }
			.pm-hints b { color: var(--tx); font-weight: 700; padding: 2px 7px; border-radius: 6px; background: rgba(255,255,255,0.1); margin-right: 4px; }
			#pause .px { background: var(--glass); border: 1px solid var(--line-2); border-radius: var(--r); box-shadow: var(--shadow); overflow: hidden; }
			#pause .px-title { text-align: left; font: 700 12px var(--font); letter-spacing: 0.12em; text-transform: uppercase; color: var(--tx-2); padding: 14px 18px 8px; background: none; }
			.pm-col { display: flex; flex-direction: column; min-height: 0; }
			.pm-mappanel { flex: 1; min-width: 0; }
			.pm-mapwrap { position: relative; flex: 1; min-height: 0; background: #2c5877; overflow: hidden; margin: 0 12px; border-radius: var(--r-2); }
			.pm-mapwrap canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; cursor: none; touch-action: none; }
			.pm-note { padding: 10px 18px 12px; font-size: 12px; color: var(--tx-3); }
			/* celular: botões por cima do mapa (legenda, tela cheia, zoom, centrar em você) e o destino num chip */
			.pm-mapui { display: none; position: absolute; z-index: 2; gap: 8px; }
			body.mobile .pm-mapui { display: flex; }
			.pm-mapbtns { flex-direction: column; right: max(10px, env(safe-area-inset-right)); bottom: 10px; }
			.pm-mapbtns.top { flex-direction: row; left: max(10px, env(safe-area-inset-left)); right: auto; top: 10px; bottom: auto; }
			.pm-mapbtns > div { min-width: 44px; height: 44px; padding: 0 14px; box-sizing: border-box; border-radius: 22px; display: flex; align-items: center; justify-content: center;
				font: 700 12px var(--font); letter-spacing: 0.04em; color: #fff; background: rgba(14,17,26,0.82); border: 1.5px solid rgba(255,255,255,0.22); box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
			.pm-mapbtns:not(.top) > div { padding: 0; font: 600 26px/1 var(--font); }
			.pm-mapbtns > div:active, #pause.legend-on .pm-mapbtns [data-mb=legend] { background: rgba(52,211,153,0.8); color: #04130c; }
			.pm-mapbtns i.me { width: 18px; height: 18px; border-radius: 50%; border: 2px solid #fff; box-sizing: border-box; background: radial-gradient(circle, #37d65a 0 3px, transparent 4px); }
			.pm-mapdest2 { left: max(10px, env(safe-area-inset-left)); bottom: 10px; max-width: calc(100% - 90px); align-items: center; padding: 6px 6px 6px 12px; border-radius: 22px;
				background: rgba(14,17,26,0.85); border: 1.5px solid rgba(255,255,255,0.22); font: 700 13px/1.25 var(--font); color: #fff; }
			.pm-mapdest2.none { padding-right: 14px; font-weight: 500; color: var(--tx-2); }
			.pm-mapdest2 > div { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .pm-mapdest2 .d { color: var(--gold); font-weight: 500; font-size: 12px; }
			.pm-mapdest2 .x { flex: none; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: #e11d48; font-size: 14px; }
			body.mobile #pause .pm-page[data-page=map] { position: relative; }
			body.mobile #pause .pm-mappanel > .px-title, body.mobile #pause .pm-mappanel > .pm-note { display: none; }
			body.mobile #pause .pm-mapwrap { margin: 0; border-radius: 0; }
			body.mobile #pause .pm-page[data-page=map] > .pm-side { position: absolute; z-index: 3; top: 62px; right: max(8px, env(safe-area-inset-right)); bottom: 8px; width: min(300px, 50vw) !important; max-height: none !important; display: none; }
			body.mobile #pause.legend-on .pm-page[data-page=map] > .pm-side { display: flex; }
			body.mobile #pause.legend-on .pm-mapbtns:not(.top) { right: calc(min(300px, 50vw) + max(8px, env(safe-area-inset-right)) + 10px); }      /* (o zoom não fica atrás da gaveta) */
			body.mobile #pause .pm-page[data-page=map] > .pm-side > .pm-dest { display: none; }
			/* mapa expandido (toque no minimapa): só o mapa, de ponta a ponta — o ✕ VOLTAR do canto volta ao jogo */
			#pause.mapfull { padding: 0 !important; gap: 0 !important; }
			#pause.mapfull > .pm-tabs, #pause.mapfull > .pm-hints { display: none !important; }
			#pause.mapfull .pm-mappanel { border: none; border-radius: 0; }
			.pm-side { width: 300px; gap: 16px; overflow-y: auto; }
			.pm-side > .px { flex: none; }
			.pm-dest { padding: 14px 16px; display: flex; gap: 12px; align-items: center; font: 700 15px/1.3 var(--font-d); }
			.pm-dest .t { flex: 1; } .pm-dest .d { color: var(--gold); font: 500 13px var(--font); margin-top: 2px; }
			.pm-side > .pm-legend { flex: 1 1 0; min-height: 170px; display: flex; flex-direction: column; }
			.pm-legend-list { flex: 1; overflow-y: auto; padding: 0 8px 10px; display: flex; flex-direction: column; gap: 2px; }
			.lg { display: flex; align-items: center; gap: 12px; padding: 7px 10px; font-size: 14px; font-weight: 500; cursor: pointer; border-radius: var(--r-3); border: 1px solid transparent; }
			.lg:hover { background: var(--card-h); } .lg.on { border-color: var(--gold); background: rgba(251,191,36,0.1); }
			.lg.off { color: var(--tx-3); } .lg.off canvas { opacity: 0.4; filter: grayscale(1); }
			.lg small { margin-left: auto; font-size: 12px; color: var(--tx-3); font-weight: 600; }
			.pm-inv { gap: 12px; }
			.pm-seg { display: flex; gap: 4px; align-self: center; padding: 4px; border-radius: var(--r-pill); background: rgba(255,255,255,0.05); border: 1px solid var(--line); }
			.pm-seg > div { padding: 6px 18px; font: 600 13px var(--font); color: var(--tx-2); cursor: pointer; border-radius: var(--r-pill); }
			.pm-seg > div:hover { color: var(--tx); } .pm-seg > div.on { background: var(--gold); color: #1a1205; }
			.pm-invview { display: none; flex: 1; min-height: 0; } .pm-invview.on { display: flex; }
			.pm-gridwrap { flex: 1; min-height: 0; overflow: auto; padding: 0 12px; }
			.pm-grid { position: relative; margin: 12px auto; }
			.pm-cell { position: absolute; background: rgba(255,255,255,0.035); border: 1px dashed rgba(255,255,255,0.08); border-radius: 14px; box-sizing: border-box; }
			.pm-item { position: absolute; box-sizing: border-box; background: linear-gradient(160deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04)); border: 1px solid var(--line-2);
				border-radius: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform .12s, border-color .12s, background .12s; }
			.pm-item:hover { transform: translateY(-2px); border-color: rgba(255,255,255,0.3); }
			.pm-item.on { border-color: var(--gold); background: linear-gradient(160deg, rgba(251,191,36,0.22), rgba(251,191,36,0.06)); box-shadow: 0 0 0 1px var(--gold), 0 8px 22px rgba(251,191,36,0.2); }
			.pm-item canvas { pointer-events: none; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.4)); }
			.pm-item .n { position: absolute; right: 7px; bottom: 5px; font: 700 12px var(--font-d); color: var(--tx); padding: 1px 6px; border-radius: 99px; background: rgba(0,0,0,0.45); }
			.pm-item .n:empty { display: none; }
			/* armas NO CORPO (Inventory.body): fora da grade, acima dela */
			.pm-body { display: flex; gap: 8px; justify-content: center; margin: 12px auto 0; flex-wrap: wrap; }
			.pm-body .pm-bslot { display: flex; flex-direction: column; gap: 4px; align-items: center; }
			.pm-body .pm-bslot > b { font: 700 10px var(--font); letter-spacing: 0.1em; text-transform: uppercase; color: var(--tx-3); }
			.pm-body .pm-item { position: relative; }
			.pm-body .pm-empty { box-sizing: border-box; border: 1px dashed rgba(255,255,255,0.14); border-radius: 14px; display: flex; align-items: center; justify-content: center; font: 600 11px var(--font); color: var(--tx-3); }
			.pm-bodynote { text-align: center; font: 500 11px var(--font); color: var(--tx-3); margin-top: 6px; }
			.pm-info { width: 340px; gap: 16px; } .pm-info .body { padding: 4px 18px 18px; font-size: 14px; line-height: 1.55; flex: 1; overflow: auto; color: var(--tx-2); }
			.pm-info h4 { font: 700 20px var(--font-d); color: var(--tx); margin-bottom: 8px; }
			.pm-btns { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
			.pm-btn { padding: 9px 14px; font: 600 13px var(--font); color: var(--tx); background: var(--card-h); cursor: pointer; border: 1px solid var(--line-2); border-radius: var(--r-3); transition: background .15s; }
			.pm-btn:hover { background: rgba(255,255,255,0.16); }
			.pm-btn:first-child { background: var(--acc); color: #04130c; border-color: transparent; }
			.pm-btn:first-child:hover { background: #5cf0b5; }
			.pm-stats { padding: 14px 18px; font-size: 13px; line-height: 1.8; color: var(--tx-2); }
			.pm-stats span { color: var(--tx); font-weight: 700; float: right; }
			.pm-stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); grid-auto-rows: max-content; gap: 16px; padding: 4px; align-content: start; overflow-y: auto; overflow-x: hidden; width: 100%; max-height: 100%; min-height: 0; }
			.pm-stat-grid > .px { flex: none; overflow: visible; }
			.pm-stat-grid .px .body { padding: 4px 18px 16px; display: flex; flex-direction: column; gap: 10px; }
			.pm-stat-grid .sr { display: flex; justify-content: space-between; gap: 10px; font-size: 14px; color: var(--tx-2); } .pm-stat-grid .sr b { color: var(--tx); font-weight: 700; }
			.pm-stat-grid .sb { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--tx-2); }
			.pm-stat-grid .sb i { display: block; height: 8px; border-radius: 99px; background: rgba(255,255,255,0.08); overflow: hidden; }
			.pm-stat-grid .sb i s { display: block; height: 100%; border-radius: 99px; }
			.pm-stat-grid .tag { align-self: flex-start; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 99px; border: 1px solid currentColor; }
			.pm-soon { margin: auto; text-align: center; padding: 40px 48px; max-width: 560px; }
			.pm-soon h2 { font: 700 28px var(--font-d); color: var(--tx); margin-bottom: 12px; } .pm-soon p { font-size: 15px; color: var(--tx-2); line-height: 1.6; }
			.pm-page[data-page=settings] { overflow-y: auto; padding: 4px 0; }
			.pm-set { margin: auto; width: min(640px, 92%); flex: none; }          /* (margem auto: centra quando cabe, rola quando não cabe) */
			.pm-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 14px 18px; margin: 0 8px; font-size: 15px; font-weight: 600; border-radius: var(--r-3); cursor: pointer; }
			.pm-row + .pm-row { border-top: 1px solid var(--line); }
			.pm-row.on { background: var(--card-h); }
			.pm-row input[type=range] { width: 240px; }
			.pm-toggle { padding: 6px 16px; min-width: 76px; text-align: center; border-radius: 99px; font-size: 13px; font-weight: 700; background: var(--card-h); color: var(--tx-2); border: 1px solid var(--line-2); }
			.pm-toggle.is-on { background: var(--acc); color: #04130c; border-color: transparent; }
			.pm-keys { padding: 16px 20px 18px; font-size: 13px; line-height: 2.1; color: var(--tx-2); } .pm-keys b { color: var(--tx); padding: 2px 7px; border-radius: 6px; background: rgba(255,255,255,0.1); font-weight: 700; }`;
		document.head.appendChild(css);

		const root = this.root = document.createElement('div');
		root.id = 'pause';
		root.innerHTML = `
			<div class="pm-tabs"></div>
			<div class="pm-main">
			  <div class="pm-page" data-page="map">
				<div class="px pm-col pm-mappanel"><div class="px-title">Cidade dos Prazeres · mapa tático</div>
				  <div class="pm-mapwrap"><canvas id="pmMap"></canvas>
					<div class="pm-mapui pm-mapbtns top"><div data-mb="legend">☰ LEGENDA</div><div data-mb="full" id="pmFullBtn">TELA CHEIA</div></div>
					<div class="pm-mapui pm-mapbtns"><div data-mb="in">+</div><div data-mb="out">−</div><div data-mb="me"><i class="me"></i></div></div>
					<div class="pm-mapui pm-mapdest2" id="pmDest2"></div></div>
				  <div class="pm-note">Saindo do menu, o marcador aparece no minimapa (na borda, apontando, se estiver longe).</div></div>
				<div class="pm-col pm-side">
				  <div class="px pm-dest"><div id="pmPin"></div><div class="t" id="pmDest">Sem destino<div class="d">Clique no mapa para marcar</div></div></div>
				  <div class="px pm-legend"><div class="px-title">Legenda</div><div class="pm-legend-list" id="pmLegend"></div></div>
				</div>
			  </div>
			  <div class="pm-page pm-inv" data-page="inventory" style="flex-direction:column">
				<div class="pm-seg" id="pmInvSeg"><div data-view="equip">👤 Equipamento</div><div data-view="bag">🎒 Mochila</div></div>
				<div id="pmInvEquip" class="pm-invview"></div>
				<div id="pmInvBag" class="pm-invview" style="gap:16px">
				  <div class="px pm-col" style="flex:1;min-width:0"><div class="px-title" id="pmInvTitle">MOCHILA</div><div class="pm-gridwrap"><div class="pm-grid" id="pmGrid"></div></div></div>
				  <div class="pm-col pm-info">
					<div class="px pm-col" style="flex:1;min-height:0"><div class="px-title">Item</div><div class="body" id="pmInfo"></div></div>
					<div class="px pm-stats" id="pmStats"></div>
				  </div>
				</div>
			  </div>
			  <div class="pm-page" data-page="status"><div class="pm-stat-grid" id="pmStatus"></div></div>
			  <div class="pm-page" data-page="careers"><div id="pmCareers"></div></div>
			  <div class="pm-page" data-page="business"><div id="pmBiz"></div></div>
			  <div class="pm-page" data-page="empire"><div id="pmEmpire"></div></div>
			  <div class="pm-page" data-page="guide"><div id="pmGuide"></div></div>
			  <div class="pm-page" data-page="settings">
				<div class="px pm-set"><div class="px-title">Configurações</div><div id="pmSet"></div>
				  <div class="pm-keys">${PauseMenu.KEYS_HTML}</div></div>
			  </div>
			</div>
			<div class="pm-hints" id="pmHints"></div>`;
		document.body.appendChild(root);

		// Abas
		const tabs = root.querySelector('.pm-tabs');
		for (const [id, label] of PauseMenu.TABS) {
			const b = document.createElement('div');
			b.className = 'pm-tab'; b.dataset.tab = id; b.textContent = label;
			b.addEventListener('click', () => this.setTab(id));
			tabs.appendChild(b);
		}
		this.$ = (id) => document.getElementById(id);

		// Inventário: Equipamento ↔ Mochila
		this.equipUI = new EquipUI(this.g, this);
		root.querySelectorAll('#pmInvSeg > div').forEach((b) => b.addEventListener('click', () => this.setInvView(b.dataset.view)));
		window.addEventListener('resize', () => { if (this.isOpen && this.tab === 'inventory' && this.invView === 'equip') this.equipUI._drawLines(); });

		// Mapa
		this.mapCv = this.$('pmMap');
		this.mapCtx = this.mapCv.getContext('2d');
		const cv = this.mapCv;
		this._bindMapPointer(cv);
		cv.addEventListener('contextmenu', (e) => { e.preventDefault(); if (this._touchMap) return; this.g.clearGps(); this._refreshDest(); });      // (toque longo no celular não apaga o destino)
		cv.addEventListener('wheel', (e) => { e.preventDefault(); this._zoom(e.deltaY < 0 ? 1.18 : 1 / 1.18, this._cursorFromEvent(e)); }, { passive: false });
		root.querySelectorAll('[data-mb]').forEach((b) => b.addEventListener('click', () => this._mapButton(b.dataset.mb)));
		this.$('pmDest2').addEventListener('click', (e) => { if (e.target.closest('[data-clear]')) { this.g.clearGps(); this._refreshDest(); } });
		window.addEventListener('keydown', (e) => this._onKey(e));
		window.addEventListener('resize', () => { if (this.isOpen) this._fitCanvas(); });
		this._buildLegend();
		if (Emoji.ready) Emoji.ready.then(() => { this._icons = {}; this._buildLegend(); });      // a fonte de emoji chegou: redesenha os selos
	}

	// Rodapé com as teclas da aba — no controle, os botões dele (Xbox ou PlayStation, ver PadGlyphs).
	_renderHints() {
		const id = this.tab, inp = this.g.input, pad = inp.usingPad ? inp.padType : '';
		this._hintsPad = pad;
		const hint = (k, t) => `<span><b>${k}</b> ${t}</span>`, g = (b) => PadGlyphs.glyph(b, pad), ph = (h, t) => `<span>${h} ${t}</span>`;
		if (pad) {
			const common = ph(g('b'), 'Voltar ao jogo') + ph(g('lb') + g('rb'), 'Abas');
			this.$('pmHints').innerHTML = id === 'map' ? common + ph(g('ls'), 'Mover cursor') + ph(g('a'), 'Marcar destino') + ph(g('x'), 'Limpar marcador') + ph(g('lt') + g('rt'), 'Zoom')
				: id === 'inventory' ? common + ph(g('dpadlr'), 'Selecionar') + ph(g('a'), 'Usar/Equipar') + ph(g('x'), 'Descartar') + ph(g('y'), this.invView === 'equip' ? 'Mochila' : 'Equipamento') + (this.invView === 'equip' ? ph(g('lt') + g('rt'), 'Categoria') : '')
				: id === 'settings' ? common + ph(g('up') + g('down'), 'Opção') + ph(g('dpadlr'), 'Ajustar') + ph(g('a'), 'Alternar')
				: common + ph(g('ls'), 'Navegar') + ph(g('a'), 'Selecionar') + ph(g('rstick'), 'Rolar');
		} else {
			const common = hint('ESC', 'Voltar ao jogo') + hint('Q / E', 'Abas');
			this.$('pmHints').innerHTML = id === 'map' ? common + hint('SETAS/MOUSE', 'Mover cursor') + hint('ENTER/CLIQUE', 'Marcar destino') + hint('X', 'Limpar marcador') + hint('+ / -', 'Zoom')
				: id === 'inventory' ? common + hint('SETAS', 'Selecionar') + hint('ENTER', 'Usar/Equipar') + hint('DEL', 'Descartar') + hint('C', this.invView === 'equip' ? 'Mochila' : 'Equipamento') + (this.invView === 'equip' ? hint('[ ]', 'Categoria') : '')
				: id === 'settings' ? common + hint('↑ ↓', 'Opção') + hint('← →', 'Ajustar') + hint('ENTER', 'Alternar') : common;
		}
		const keys = this.root.querySelector('.pm-keys');
		if (keys) keys.innerHTML = pad
			? `<b style="background:none;padding:0">A pé:</b> ${g('ls')} mover · ${g('a')} correr (segurar) / pular grade · ${g('l3')} agachar / cobertura · ${g('rb')} rolar · ${g('x')} interagir/assaltar/esconder · ${g('y')} veículo · ${g('rt')} atacar (sem arma: combo soco + soco + chute) · ${g('b')} recarregar · ${g('lt')} mirar (${g('rstick')} aponta/troca de alvo) · ${g('down')} arrombar · ${g('rs')} furtar · ${g('lb')} roda de armas (segurar) · ${g('dpadlr')} armas · ${g('up')} kit médico<br>`
			+ `<b style="background:none;padding:0">Carro:</b> ${g('rt')} acelerar · ${g('lt')} freio/ré · ${g('y')} sair · ${g('x')} abastecer/desmanchar · ${g('l3')} buzina · ${g('down')} faróis<br>`
			+ `<b style="background:none;padding:0">Helicóptero:</b> ${g('rt')} sobe · ${g('lt')} desce · ${g('rstick')} gira · ${g('y')} descer/pular<br>`
			+ `${g('back')} inventário · ${g('start')} menu · ${g('rstick')} zoom (na mira manual com arma, ${g('rstick')} aponta)`
			: PauseMenu.KEYS_HTML;
	}

	// ------------------------------------------------------------------ ícones (estilo emoji, HD)
	// Selo redondo com o emoji do lugar (mapa e legenda): canvas 96×96, desenhado no tamanho que o chamador pedir.
	icon(name, k = 2) {
		if (this._icons[name]) return this._icons[name];
		const S = 96, c = document.createElement('canvas'); c.width = c.height = S;
		const x = c.getContext('2d');
		x.fillStyle = Emoji.VECTOR[name] ? 'rgba(226,231,240,0.95)' : 'rgba(12,15,24,0.9)';      // (arma em vetor é metal escuro: selo claro, senão some no radar)
		x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 3, 0, Math.PI * 2); x.fill();
		x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 5; x.stroke();
		const src = Emoji.canvas(name, 128), r = src.width / src.height, w = r > 1 ? S * 0.66 : S * 0.6 * r, h = r > 1 ? w / r : S * 0.6;
		x.drawImage(src, (S - w) / 2, (S - h) / 2, w, h);
		return (this._icons[name] = c);
	}

	// Ícone de item: { canvas HD, w, h } — w×h é o tamanho lógico (os chamadores multiplicam por um fator inteiro).
	// Itens com emoji: 40×40; armas de fogo (arte vetorial 2:1): 80×40.
	itemIcon(key, id) {
		const k = (id && Emoji.char(id)) ? id : key, ck = 'item:' + k;
		if (this._icons[ck]) return this._icons[ck];
		const c = Emoji.canvas(k, 128), wide = c.width > c.height;
		return (this._icons[ck] = { canvas: c, w: wide ? 80 : 40, h: wide ? 40 : 40 });
	}

	// ------------------------------------------------------------------ STATUS (personagem, facção, dinheiro, procurado, casa)
	_renderStatus() {
		const g = this.g, pl = g.player, inv = g.inventory, el = this.$('pmStatus'); if (!el) return;
		const bar = (label, v, col, note = '') => `<div class="sb"><span>${label}${note ? ` <b style="color:#8fb4ff">${note}</b>` : ''}</span><i><s style="width:${Math.max(0, Math.min(100, v))}%;background:${col}"></s></i></div>`;
		const row = (k, v) => `<div class="sr"><span>${k}</span><b>${v}</b></div>`;
		const p = pl.position, terr = Standing.territoryAt(p.x, p.z), cv = Standing.territories[0], res = Standing.isResident(cv), hos = Standing.hostile(cv);
		const armor = pl.armorMax > 0 ? Math.round(pl.armor / pl.armorMax * 100) : 0;
		const owned = RealEstate.list.filter((q) => RealEstate.isOwned(q)), worth = owned.reduce((s, q) => s + RealEstate.price(q), 0);
		const home = RealEstate.home;
		const panel = (title, body) => `<div class="px"><div class="px-title">${title}</div><div class="body">${body}</div></div>`;
		el.innerHTML =
			panel('PERSONAGEM', bar('VIDA', pl.hp / pl.maxHp * 100, 'linear-gradient(90deg,#ff3a8a,#4a7cff)', `${Math.round(pl.hp)}/${pl.maxHp}`) + bar('COLETE', armor, 'linear-gradient(90deg,#2a7cff,#35c8ff)', `${armor}%`)
				+ bar('FÔLEGO', (pl.stamina == null ? 1 : pl.stamina / (pl.staminaMax || 100)) * 100, 'linear-gradient(90deg,#10b981,#a3e635)', `condicionamento ${Bags.fitLevel(pl.fit)}/20`) + row('Carga', Bags.label(g))
				+ bar('PONTARIA', Aim.quality() * 100, 'linear-gradient(90deg,#ff9a3a,#ffd23a)', `${Math.round(Aim.quality() * 100)}% — sobe com Mão firme e Olho de águia`)
				+ row('Arma na mão', pl.weapon === 'none' ? 'Punhos' : Weapons[pl.weapon].name) + row('Kits médicos', inv.medkits) + row('Hora', g.dayNight.label))
			+ panel('FÍSICO E ATRIBUTOS', this._physiqueHtml(pl, bar, row))
			+ panel(`FACÇÃO · ${cv.name} (${cv.sigla})`, `<span class="tag" style="color:${hos ? '#ff5a4d' : '#5ac07a'}">${res ? (hos ? 'MORADOR · HOSTIL' : 'MORADOR · NEUTRO') : 'ESTRANHO · HOSTIL'}</span>`
				+ row('Patente', Missions.rankName) + row('Missões cumpridas', Standing.missionsDone || 0)
				+ bar('MORAL COM O TRÁFICO', Standing.traffic, '#d65a4a', Math.round(Standing.traffic)) + bar('MORAL COM A COMUNIDADE', Standing.community, '#5ac07a', Math.round(Standing.community))
				+ bar('PRESSÃO POLICIAL NA FAVELA', Standing.heat, Standing.heat >= 65 ? '#ff3a2a' : '#ff9a3a', Math.round(Standing.heat) + '%')
				+ row('Operação policial', Standing.policeOp ? '<span style="color:#ff5a4d">EM ANDAMENTO</span>' : 'não') + row('Baile funk', Baile.on ? 'rolando (21h–5h)' : 'não'))
			+ panel('DINHEIRO E NEGÓCIOS', row('Dinheiro sujo', brl(inv.cash)) + row('Dinheiro limpo', brl(inv.clean)) + row('Fachadas', Laundry.count) + row('Contabilidade', `nv ${Laundry.level} · perda ${Math.round(Laundry.lossRate * 100)}%`)
				+ bar('RECEITA / PF', Laundry.taxHeat, '#9a7aff', Math.round(Laundry.taxHeat) + '%'))
			+ panel('CASA E IMÓVEIS', row('Safe house', home ? `${home.type} (${home.region})` : 'Casa na favela') + row('Imóveis seus', owned.length) + row('Valor de mercado', brl(worth)) + (home ? row('Reforma', RealEstate.reformLevel(home) ? RealEstate.REFORMS[RealEstate.reformLevel(home)].name : 'original') : ''))
			+ panel('PROCURADO', row('Nível', `${g.wanted.level}★`) + row('Situação', g.wanted.level > 0 ? 'A polícia está atrás de você' : 'Limpo'));
	}

	// ------------------------------------------------------------------ abrir / fechar
	open(tab = 'map') {
		if (this.isOpen) { this.setTab(tab); return; }
		const g = this.g;
		this.isOpen = true;
		this.root.classList.add('show');
		this._touchMap = !!(g.touch && g.touch.shown);
		if (this._touchMap) { this.map.cur.x = this.map.cur.y = -999; this.map.cur.set = true; }      // celular: sem seta de mouse no mapa
		const pad = typeof PadNav !== 'undefined' && PadNav.pad();
		this._padPrev = pad ? Array.from(pad.buttons, (x) => !!(x && x.pressed)) : null;      // o Start que abriu o menu ainda está apertado: não fecha de novo
		g.scene.physicsEnabled = false;               // a física congela (o mundo "para de verdade")
		AudioFX.pause();
		MapRenderer.drawWorld(1);
		this.lookBadge();
		this.setTab(tab);
	}
	// Ponto amarelo em Inventário e em Equipamento enquanto há um visual novo para montar no guarda-roupa (PlayerLook.want).
	lookBadge() {
		if (!this.root) return;
		const on = typeof PlayerLook !== 'undefined' && !!PlayerLook.want, tip = on ? 'Visual novo para montar em Equipamento' : '';
		for (const el of this.root.querySelectorAll('.pm-tab[data-tab="inventory"], #pmInvSeg > div[data-view="equip"]')) { el.classList.toggle('pm-new', on); el.title = tip; }
	}
	// O guarda-roupa (Wardrobe: o gerador do visual, num Worker) só existe com Inventário → Equipamento aberto.
	_syncWardrobe() { if (typeof Wardrobe !== 'undefined') Wardrobe.setActive(this.isOpen && this.tab === 'inventory' && this.invView === 'equip'); }

	// Mapa expandido (toque no minimapa, no celular): abre direto no mapa, de ponta a ponta e centrado em você.
	openMap(full = true) {
		this.open('map');
		this._touchMap = true;                       // (veio de um toque: sem a seta do mouse até alguém mexer o mouse)
		this.root.classList.toggle('mapfull', full);
		this._centerOnPlayer();
	}

	close() {
		if (!this.isOpen) return;
		this.isOpen = false;
		this.root.classList.remove('show', 'mapfull', 'legend-on');
		this._ptrs.clear(); this._pinch = null;
		this.g.scene.physicsEnabled = true;
		AudioFX.unpause();
		this.g.input.justPressed = {};                // teclas apertadas no menu não valem no jogo
		this.map.drag = null;
		if (typeof FocusNav !== 'undefined') FocusNav.clear();         // tira o destaque do controle
		this._syncWardrobe();
	}

	setTab(id) {
		this.tab = id;
		this._syncWardrobe();                          // (antes de desenhar a tela: o boneco do equipamento usa o guarda-roupa)
		if (id !== 'map') this.root.classList.remove('mapfull', 'legend-on');      // (sem a barra de abas o mapa expandido só vale para o mapa)
		for (const b of this.root.querySelectorAll('.pm-tab')) b.classList.toggle('on', b.dataset.tab === id);
		for (const pg of this.root.querySelectorAll('.pm-page')) pg.classList.toggle('on', pg.dataset.page === id);
		this._renderHints();
		if (id === 'map') {
			this._fitCanvas();
			if (!this.map.init) { const p = this.g._playerState().pos; this.map.cx = p.x; this.map.cz = p.z; this.map.init = true; }
			this._refreshDest(); this._buildLegend();
		} else if (id === 'inventory') { this._renderInventory(); }
		else if (id === 'status') this._renderStatus();
		else if (id === 'careers') { if (this.g.careers) this.g.careers.ui.render(this.$('pmCareers')); }
		else if (id === 'empire') { if (this.g.empire) (this.empireUI || (this.empireUI = new EmpireUI(this.g))).render(this.$('pmEmpire')); }
		else if (id === 'business') (this.bizUI || (this.bizUI = new BusinessUI(this.g))).render(this.$('pmBiz'));
		else if (id === 'guide') { (this.guide || (this.guide = new GuideUI(this.g))).render(this.$('pmGuide')); }
		else if (id === 'settings') this._renderSettings();
	}

	_fitCanvas() {
		const wrap = this.mapCv.parentElement, w = Math.max(200, wrap.clientWidth), h = Math.max(200, wrap.clientHeight);
		if (this.mapCv.width !== w || this.mapCv.height !== h) { this.mapCv.width = w; this.mapCv.height = h; }
		const m = this.map;
		if (!m.cur.set) { m.cur.x = w / 2; m.cur.y = h / 2; m.cur.set = true; }
		const WD = Config.world;
		m.min = Math.min(w / (WD.maxX - WD.minX + 40), h / (WD.maxZ - WD.minZ + 40));        // enquadra o MUNDO inteiro
		m.scale = Math.max(m.min, Math.min(11, m.scale));
		const fb = this.$('pmFullBtn');
		if (fb) fb.textContent = this.root.classList.contains('mapfull') ? 'MENU' : 'TELA CHEIA';
	}

	_centerOnPlayer() {
		const p = this.g._playerState().pos, m = this.map;
		this._fitCanvas();
		m.cx = p.x; m.cz = p.z; m.init = true;
		this._clampCenter();
		if (this._touchMap) m.cur.x = m.cur.y = -999;                       // no toque não há cursor (nem dica de lugar) até tocar
		else { m.cur.x = this.mapCv.width / 2; m.cur.y = this.mapCv.height / 2; }
	}

	// Botões por cima do mapa (celular).
	_mapButton(id) {
		const R = this.root.classList;
		if (id === 'legend') R.toggle('legend-on');
		else if (id === 'full') { R.toggle('mapfull'); this._fitCanvas(); }
		else if (id === 'in' || id === 'out') this._zoom(id === 'in' ? 1.5 : 1 / 1.5);
		else if (id === 'me') this._centerOnPlayer();
		AudioFX.blip(700, 0.05, 0.08);
	}

	// ------------------------------------------------------------------ teclado
	_onKey(e) {
		if (!this.isOpen) return;
		const k = e.key.toLowerCase();
		if (['tab', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'backspace'].includes(k)) e.preventDefault();
		if (k === 'escape' || k === 'p') { this.close(); return; }
		const tabs = PauseMenu.TABS.map((t) => t[0]), i = tabs.indexOf(this.tab);
		if (k === 'tab') { this.setTab(tabs[(i + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length]); return; }
		if (k === 'q') { this.setTab(tabs[(i + tabs.length - 1) % tabs.length]); return; }
		if (k === 'e') { this.setTab(tabs[(i + 1) % tabs.length]); return; }
		if (this.tab === 'map') {
			if (k === 'enter' || k === ' ') this._markAtCursor();
			else if (k === 'x' || k === 'delete' || k === 'backspace') { this.g.clearGps(); this._refreshDest(); }
			else if (k === '+' || k === '=') this._zoom(1.25);
			else if (k === '-' || k === '_') this._zoom(1 / 1.25);
		} else if (this.tab === 'inventory') {
			if (k === 'c') { this.setInvView(this.invView === 'equip' ? 'bag' : 'equip'); return; }
			if (this.invView === 'equip') { this.equipUI.key(k); return; }
			const L = this._layout || [];
			if (!L.length) return;
			const cur = L[Math.min(this.invSel, L.length - 1)];
			const dir = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k];
			if (dir) {
				let best = null, bd = Infinity;
				for (const it of L) {
					if (it === cur) continue;
					const dx = (it.x + it.w / 2) - (cur.x + cur.w / 2), dy = it.y - cur.y;
					if (dx * dir[0] + dy * dir[1] <= 0) continue;
					const d = Math.abs(dx) * (dir[1] ? 1 : 0.3) + Math.abs(dy) * (dir[0] ? 1 : 0.3) + hypot(dx, dy) * 0.2;
					if (d < bd) { bd = d; best = it; }
				}
				if (best) { this.invSel = L.indexOf(best); this._renderInventory(); }
			} else if (k === 'enter') this._invAction('primary');
			else if (k === 'delete' || k === 'backspace') this._invAction('discard');
		} else if (this.tab === 'settings') {
			const nRows = PauseMenu.SET_KEYS.length;
			if (k === 'arrowup') this.setRow = (this.setRow + nRows - 1) % nRows;
			else if (k === 'arrowdown') this.setRow = (this.setRow + 1) % nRows;
			else if (k === 'arrowleft') this._setAdjust(-1);
			else if (k === 'arrowright') this._setAdjust(1);
			else if (k === 'enter' || k === ' ') this._setAdjust(0);
			this._renderSettings();
		}
	}

	// ------------------------------------------------------------------ mapa: coordenadas
	_w2s(x, z) { const m = this.map, c = this.mapCv; return [c.width / 2 + (x - m.cx) * m.scale, c.height / 2 - (z - m.cz) * m.scale]; }
	_s2w(sx, sy) { const m = this.map, c = this.mapCv; return { x: m.cx + (sx - c.width / 2) / m.scale, z: m.cz - (sy - c.height / 2) / m.scale }; }
	_cursorFromEvent(e) {
		const r = this.mapCv.getBoundingClientRect();
		return { x: (e.clientX - r.left) * (this.mapCv.width / r.width), y: (e.clientY - r.top) * (this.mapCv.height / r.height) };
	}
	_clampCenter() {
		const B = Config.world, m = this.map;
		m.cx = Math.max(B.minX, Math.min(B.maxX, m.cx));
		m.cz = Math.max(B.minZ, Math.min(B.maxZ, m.cz));
	}
	_zoom(f, at = null) {
		const m = this.map, c = at || { x: this.mapCv.width / 2, y: this.mapCv.height / 2 };
		const before = this._s2w(c.x, c.y);
		m.scale = Math.max(m.min || 1, Math.min(11, m.scale * f));
		const after = this._s2w(c.x, c.y);
		m.cx += before.x - after.x; m.cz += before.z - after.z;
		this._clampCenter();
	}

	// Mouse e toque pelos Pointer Events. Um dedo (ou o botão esquerdo) arrasta o mapa; toque/clique sem arrastar marca o destino;
	// dois dedos = pinça: zoom em volta do meio deles, e o mapa acompanha os dedos (arrastar e dar zoom ao mesmo tempo).
	_bindMapPointer(cv) {
		const P = this._ptrs = new Map();
		cv.addEventListener('pointerdown', (e) => {
			if (e.pointerType === 'mouse' && e.button !== 0) return;
			e.preventDefault();
			this._touchMap = e.pointerType !== 'mouse';
			try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ok */ }
			P.set(e.pointerId, this._cursorFromEvent(e));
			if (P.size === 1) this._mouse(e, 'down');
			else if (P.size === 2) { this.map.drag = null; this._pinchStart(); }
		});
		cv.addEventListener('pointermove', (e) => {
			if (e.pointerType === 'mouse') this._touchMap = false;
			if (P.has(e.pointerId)) P.set(e.pointerId, this._cursorFromEvent(e));
			if (this._pinch) this._pinchMove();
			else if (e.pointerType === 'mouse' || P.has(e.pointerId)) this._mouse(e, 'move');
		});
		const up = (e) => {
			if (!P.has(e.pointerId)) return;
			P.delete(e.pointerId);
			if (this._pinch) {
				if (P.size >= 2) { this._pinchStart(); return; }
				this._pinch = null;
				const rest = P.values().next().value, m = this.map;          // sobrou um dedo: continua arrastando dali (sem marcar ao soltar)
				if (rest) m.drag = { x: rest.x, y: rest.y, cx: m.cx, cz: m.cz, moved: true };
				return;
			}
			if (e.type !== 'pointerup') { this.map.drag = null; return; }      // (cancelado pelo sistema: não marca nada)
			this._mouse(e, 'up');
		};
		cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('lostpointercapture', up);
	}

	_pinchStart() {
		const [a, b] = this._ptrs.values(), m = this.map;
		this._pinch = { d0: Math.max(12, hypot(a.x - b.x, a.y - b.y)), s0: m.scale, w: this._s2w((a.x + b.x) / 2, (a.y + b.y) / 2) };
	}

	_pinchMove() {
		const [a, b] = this._ptrs.values(), m = this.map, p = this._pinch, c = this.mapCv;
		const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
		m.scale = Math.max(m.min || 1, Math.min(11, p.s0 * hypot(a.x - b.x, a.y - b.y) / p.d0));
		m.cx = p.w.x - (mx - c.width / 2) / m.scale; m.cz = p.w.z + (my - c.height / 2) / m.scale;      // o ponto entre os dedos fica entre os dedos
		this._clampCenter();
	}

	_mouse(e, type) {
		const m = this.map, p = this._cursorFromEvent(e);
		if (type === 'move') {
			if (m.drag) {
				const dx = p.x - m.drag.x, dy = p.y - m.drag.y;
				if (Math.abs(dx) + Math.abs(dy) > (this._touchMap ? 12 : 5)) m.drag.moved = true;      // (o dedo treme mais que o mouse)
				if (m.drag.moved) { m.cx = m.drag.cx - dx / m.scale; m.cz = m.drag.cz + dy / m.scale; this._clampCenter(); }
			}
			m.cur.x = p.x; m.cur.y = p.y;
		} else if (type === 'down') { m.drag = { x: p.x, y: p.y, cx: m.cx, cz: m.cz, moved: false }; m.cur.x = p.x; m.cur.y = p.y; }
		else if (type === 'up' && m.drag) {
			const was = m.drag; m.drag = null;
			if (!was.moved) { m.cur.x = was.x; m.cur.y = was.y; this._markAtCursor(); }
			else if (this._touchMap) m.cur.x = m.cur.y = -999;                 // toque: depois de arrastar, sem "cursor" esquecido no mapa
		}
	}

	// Lugares no mapa: POIs da cidade (os esconderijos — caçambas, caixotes, latões — ficam fora: só poluíam o mapa).
	pois() { return CityGrid.pois; }

	// De perto, o mapa também mostra as portas em que dá para entrar e que não têm ponto na legenda (farmácia, bar, padaria, banco,
	// boca…) — os mesmos ícones do minimapa. Refiltrado só quando a lista do minimapa muda.
	static get DOORS_ZOOM() { return 2.6; }
	_extraPlaces() {
		const all = Minimap.places();
		if (this._xpSrc === all) return this._xp;
		const pois = this.pois();
		this._xpSrc = all;
		return (this._xp = all.filter((q) => q.door && !pois.some((p) => Math.abs(p.x - q.x) < 4 && Math.abs(p.z - q.z) < 4)));
	}

	// Lugar mais perto do ponto do mundo `w` (raio em px de tela): POIs e, de perto, as portas extras.
	_placeNear(w, px) {
		const m = this.map;
		let best = null, bd = px / m.scale;
		const scan = (list) => { for (const p of list) { const d = hypot(p.x - w.x, p.z - w.z); if (d < bd) { bd = d; best = p; } } };
		scan(this.pois());
		if (m.scale >= PauseMenu.DOORS_ZOOM) scan(this._extraPlaces());
		return best;
	}

	_placeLabel(p) {
		if (p.door) return p.label && !p.name.includes(p.label) ? p.label + ' — ' + p.name : p.name;
		return PauseMenu.POI_TYPES[p.type].label + (p.name ? ' — ' + p.name : '');
	}

	// Marca o destino onde está o cursor (encaixa no lugar mais próximo, se houver um a < 16 px — 30 px no toque: o dedo é grosso).
	_markAtCursor() {
		const m = this.map, w = this._s2w(m.cur.x, m.cur.y), best = this._placeNear(w, this._touchMap ? 30 : 16);
		if (!best && !WorldMap.isLand(w.x, w.z)) return;                      // no mar: não marca (em terra, qualquer lugar)
		this.g.setGps(best ? best.x : w.x, best ? best.z : w.z, best ? this._placeLabel(best) : 'Ponto marcado');
		this._refreshDest();
		AudioFX.blip(900, 0.08, 0.14);
	}

	_refreshDest() {
		const g = this.g, el = this.$('pmDest'), pin = this.$('pmPin'), chip = this.$('pmDest2');
		if (!pin.firstChild) { const c = document.createElement('canvas'); c.width = 40; c.height = 52; c.style.width = '40px'; c.style.height = '52px'; this._drawPin(c.getContext('2d'), 20, 48, '#ff3b3b', 1.2); pin.appendChild(c); }
		chip.classList.toggle('none', !g.gps);
		if (!g.gps) {
			el.innerHTML = `Sem destino<div class="d">${g.input.touchDevice ? 'Toque' : 'Clique'} no mapa para marcar</div>`;
			chip.textContent = `${g.input.touchDevice ? 'Toque' : 'Clique'} no mapa para marcar o destino`;
			return;
		}
		const pp = g._playerState().pos, len = hypot(g.gps.x - pp.x, g.gps.z - pp.z);
		const dist = len >= 1000 ? (len / 1000).toFixed(1) + ' km' : Math.round(len) + ' m';
		el.innerHTML = `${g.gps.label}<div class="d">${dist} em linha reta</div>`;
		chip.innerHTML = `<div>${g.gps.label}<div class="d">${dist} em linha reta</div></div><div class="x" data-clear>✕</div>`;
	}

	// ------------------------------------------------------------------ mapa: legenda
	_buildLegend() {
		const list = this.$('pmLegend');
		list.replaceChildren();
		const all = this.pois();
		for (const [type, T] of Object.entries(PauseMenu.POI_TYPES)) {
			const n = all.filter((p) => p.type === type).length;
			const row = document.createElement('div');
			row.className = 'lg' + (n ? '' : ' off') + (this.sel && this.sel.type === type ? ' on' : '');
			const c = this.icon(T.icon).cloneNode(); c.getContext('2d').drawImage(this.icon(T.icon), 0, 0); c.style.width = c.style.height = '30px'; row.appendChild(c);
			row.append(document.createTextNode(T.label));
			const s = document.createElement('small'); s.textContent = n ? n : (T.mine ? 'nenhuma ainda' : 'em breve'); row.appendChild(s);
			row.addEventListener('click', () => this._focusType(type));
			list.appendChild(row);
		}
	}

	// Clique na legenda: centra no próximo lugar daquele tipo (cada clique vai para o seguinte) e põe o cursor nele.
	_focusType(type) {
		const list = this.pois().filter((p) => p.type === type);
		if (!list.length) { this.g._flash(`${PauseMenu.POI_TYPES[type].label}: nenhum no mapa ainda`); return; }
		const i = (this._legendIdx[type] = ((this._legendIdx[type] ?? -1) + 1) % list.length), p = list[i];
		this.sel = p;
		const m = this.map;
		m.cx = p.x; m.cz = p.z;
		this._clampCenter();
		m.cur.x = this.mapCv.width / 2; m.cur.y = this.mapCv.height / 2;
		this._buildLegend();
	}

	// ------------------------------------------------------------------ mapa: desenho
	_drawPin(ctx, x, y, fill, k = 1) {
		ctx.save();
		ctx.translate(x, y); ctx.scale(k, k);
		ctx.lineWidth = 3; ctx.strokeStyle = '#07090d'; ctx.fillStyle = fill;
		ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-15, -17, -15, -40, 0, -40); ctx.bezierCurveTo(15, -40, 15, -17, 0, 0);
		ctx.stroke(); ctx.fill();
		ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-4, -30, 4, 7, -0.4, 0, Math.PI * 2); ctx.fill();
		ctx.fillStyle = '#0d1520'; ctx.beginPath(); ctx.arc(0, -27, 6.5, 0, Math.PI * 2); ctx.fill();
		ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(0, 1, 11, 4, 0, 0, Math.PI * 2); ctx.stroke();
		ctx.restore();
	}

	_label(ctx, text, x, y, size = 15) {
		ctx.font = `700 ${size}px Inter, Arial, sans-serif`;
		ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
		ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(8,10,16,0.92)'; ctx.strokeText(text, x, y);
		ctx.fillStyle = '#ffffff'; ctx.fillText(text, x, y);
	}

	// Nome de região: letras espaçadas, contorno grosso e uma faixa escura atrás — legível por cima de ícones e ruas.
	_regionLabel(ctx, text, x, y, size) {
		ctx.save();
		ctx.font = `800 ${size}px Outfit, Inter, Arial, sans-serif`;
		if ('letterSpacing' in ctx) ctx.letterSpacing = Math.round(size * 0.12) + 'px';
		ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
		const w = ctx.measureText(text).width, h = size * 1.25;
		ctx.fillStyle = 'rgba(8,10,16,0.55)';
		ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2 - 10, y - h / 2, w + 20, h, h / 2) : ctx.rect(x - w / 2 - 10, y - h / 2, w + 20, h); ctx.fill();
		ctx.lineWidth = Math.max(4, size * 0.28); ctx.strokeStyle = 'rgba(8,10,16,0.95)'; ctx.strokeText(text, x, y);
		ctx.fillStyle = '#ffffff'; ctx.fillText(text, x, y);
		ctx.restore();
	}

	_drawMap() {
		const g = this.g, c = this.mapCv, ctx = this.mapCtx, m = this.map, W = c.width, H = c.height;
		MapRenderer.drawView(ctx, W, H, m.cx, m.cz, m.scale, { labels: true });          // mundo raster + ruas/prédios vetoriais, em qualquer zoom
		ctx.imageSmoothingEnabled = false;
		const on =(x, y, pad = 40) => x > -pad && y > -pad && x < W + pad && y < H + pad;
		const ik = Math.max(1.3, Math.min(2.6, m.scale / 3));                     // tamanho dos ícones acompanha o zoom

		// De perto: as outras portas em que dá para entrar (menores, por baixo dos lugares da legenda).
		if (m.scale >= PauseMenu.DOORS_ZOOM) {
			const w = 13 * ik;
			for (const p of this._extraPlaces()) {
				const [x, y] = this._w2s(p.x, p.z);
				if (on(x, y)) ctx.drawImage(this.icon(p.icon), x - w / 2, y - w / 2, w, w);
			}
		}

		// Lugares (hospital, delegacia, lojas…).
		for (const p of this.pois()) {
			const [x, y] = this._w2s(p.x, p.z);
			if (!on(x, y)) continue;
			const T = PauseMenu.POI_TYPES[p.type], src = this.icon(T.icon);
			const w = 17 * ik, hh = w;
			ctx.drawImage(src, x - w / 2, y - hh / 2, w, hh);
			if (this.sel === p) { ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, w / 2 + 4, 0, Math.PI * 2); ctx.stroke(); }
		}

		// Barricadas em chamas (laranja) durante a operação.
		if (g.barricades) for (const b of g.barricades.list) { const [x, y] = this._w2s(b.x, b.z); if (!on(x, y)) continue; ctx.fillStyle = '#2a1a10'; ctx.fillRect(x - 9, y - 5, 18, 10); ctx.fillStyle = '#ff8a2a'; ctx.fillRect(x - 7, y - 3, 14, 6); ctx.fillStyle = '#ffd23f'; ctx.fillRect(x - 3, y - 2, 6, 4); }

		// Polícia (azul), como no minimapa.
		if (g.policeManager) {
			for (const u of g.policeManager.units) {
				const [x, y] = this._w2s(u.position.x, u.position.z);
				if (!on(x, y)) continue;
				ctx.fillStyle = '#e8ecf5'; ctx.fillRect(x - 7, y - 5, 14, 10);
				ctx.fillStyle = '#2f55b0'; ctx.fillRect(x - 6, y - 4, 12, 8);
				ctx.fillStyle = '#d23030'; ctx.fillRect(x - 5, y - 3, 4, 3); ctx.fillStyle = '#4aa8ff'; ctx.fillRect(x + 1, y - 3, 4, 3);
			}
		}

		// Marcador de destino: alfinete vermelho (sem rota pelas ruas).
		if (g.gps) {
			const [dx, dy] = this._w2s(g.gps.x, g.gps.z);
			if (on(dx, dy, 80)) { this._drawPin(ctx, dx, dy, '#ff3b3b', 1.1); this._label(ctx, 'DESTINO', dx + 52, dy - 24, 17); }
		}

		// Nomes das regiões POR CIMA dos ícones da legenda (só com o mapa afastado; de perto aparecem os nomes das ruas).
		if (m.scale < 2.4) {
			const a = Math.min(1, (2.4 - m.scale) / 0.8), size = Math.max(13, Math.min(24, 9 + m.scale * 26));
			ctx.save(); ctx.globalAlpha = a;
			for (const r of WorldMap.regions) { const [rx, ry] = this._w2s(r.x, r.z); if (rx > -80 && ry > -30 && rx < W + 80 && ry < H + 30) this._regionLabel(ctx, r.name, rx, ry, size * r.size); }
			ctx.restore();
		}

		// Jogador: alfinete verde e nome.
		const pp = g._playerState().pos, [px, py] = this._w2s(pp.x, pp.z);
		if (on(px, py, 80)) {
			this._drawPin(ctx, px, py, '#37d65a', 1.1);
			this._label(ctx, 'PLAYER', px, py + 17, 17);
		}

		// Dica do lugar sob o cursor (no toque: o último lugar tocado).
		const hover = this._placeNear(this._s2w(m.cur.x, m.cur.y), this._touchMap ? 30 : 14);
		if (hover) { const [hx, hy] = this._w2s(hover.x, hover.z); this._label(ctx, hover.name, hx, hy - 30 * ik / 2 - 14, 16); }

		// Cursor em pixel art (seta). No toque não tem cursor: o dedo é o cursor.
		if (this._touchMap) return;
		ctx.save();
		ctx.translate(m.cur.x, m.cur.y);
		ctx.lineJoin = 'miter'; ctx.lineWidth = 3; ctx.strokeStyle = '#07090d'; ctx.fillStyle = '#f4f6fa';
		ctx.beginPath(); [[0, 0], [0, 22], [5, 17], [9, 26], [13, 24], [9, 16], [16, 16]].forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath();
		ctx.stroke(); ctx.fill();
		ctx.restore();
	}

	// ------------------------------------------------------------------ inventário
	setInvView(v) { this.invView = v; this._syncWardrobe(); this._renderHints(); this._renderInventory(); }

	_renderInventory() {
		for (const b of this.root.querySelectorAll('#pmInvSeg > div')) b.classList.toggle('on', b.dataset.view === this.invView);
		this.$('pmInvEquip').classList.toggle('on', this.invView === 'equip');
		this.$('pmInvBag').classList.toggle('on', this.invView === 'bag');
		if (this.invView === 'equip') { this.equipUI.render(this.$('pmInvEquip')); return; }
		const inv = this.g.inventory, grid = this.$('pmGrid'), CELL = (inv.cols > 5 || inv.rows > 4) ? 70 : 84, GAP = 4;
		const C = inv.cols, R = inv.rows;
		this._layout = inv.layout();
		this.invSel = Math.max(0, Math.min(this.invSel, this._layout.length - 1));
		this.$('pmInvTitle').textContent = `${Bags.def(inv).emo} ${Bags.def(inv).name} · ${inv.slotsUsed()}/${inv.capacity} · ${(Bags.kg || 0).toFixed(1)}/${Math.round(Bags.cap || Bags.def(inv).kg)} kg`;
		grid.style.width = C * CELL + (C - 1) * GAP + 'px';
		grid.style.height = R * CELL + (R - 1) * GAP + 'px';
		grid.replaceChildren();
		// armas no corpo (coldre, cinto, bandoleira): uma fileira acima da grade
		let bodyEl = this.$('pmBody');
		if (!bodyEl) { bodyEl = document.createElement('div'); bodyEl.id = 'pmBody'; grid.parentNode.insertBefore(bodyEl, grid); }
		bodyEl.replaceChildren();
		const bw = Math.min(2 * CELL + GAP, 150), bh = Math.round(CELL * 0.8);
		const strip = document.createElement('div'); strip.className = 'pm-body';
		for (let s = 0; s < Inventory.BODY_SLOTS; s++) {
			const it = this._layout.find((q) => q.body && q.x === s * 2), box = document.createElement('div');
			box.className = 'pm-bslot';
			box.innerHTML = `<b>${it ? it.slot : 'No corpo'}</b>`;
			if (!it) { const e = document.createElement('div'); e.className = 'pm-empty'; e.style.cssText = `width:${bw}px;height:${bh}px`; e.textContent = 'vazio'; box.appendChild(e); strip.appendChild(box); continue; }
			box.appendChild(this._invItemEl(it, this._layout.indexOf(it), bw, bh, inv));
			strip.appendChild(box);
		}
		const note = document.createElement('div'); note.className = 'pm-bodynote';
		note.textContent = 'No corpo: até 3 armas (as maiores) sem ocupar a mochila, com metade do peso';
		bodyEl.append(strip, note);
		for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
			const d = document.createElement('div');
			d.className = 'pm-cell';
			d.style.cssText = `left:${x * (CELL + GAP)}px;top:${y * (CELL + GAP)}px;width:${CELL}px;height:${CELL}px`;
			grid.appendChild(d);
		}
		this._layout.forEach((it, i) => {
			if (it.body) return;                                                  // (na fileira do corpo, acima)
			const w = it.w * CELL + (it.w - 1) * GAP, d = this._invItemEl(it, i, w, CELL, inv);
			d.style.left = it.x * (CELL + GAP) + 'px'; d.style.top = it.y * (CELL + GAP) + 'px';
			grid.appendChild(d);
		});
		const on = grid.querySelector('.pm-item.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		this._renderInfo();
		const g = this.g, pl = g.player;
		const spare = (inv.spareBags || []).map((b) => Bags.DEFS[b].name);
		this.$('pmStats').innerHTML = `DINHEIRO <span>${brl(inv.cash)}</span><br>VIDA <span>${Math.round(pl.hp)}/${pl.maxHp}</span>${pl.armorMax > 0 ? `<br>COLETE <span>${Math.round(pl.armor)}/${pl.armorMax} (NÍVEL ${pl.armorMax >= 100 ? 2 : 1})</span>` : ''}<br>ARMA <span>${pl.weapon === 'none' ? 'PUNHOS' : Weapons[pl.weapon].name}</span>`
			+ (spare.length ? `<br>BOLSAS DE RESERVA <span>${spare.length}</span><div style="font-size:11px;color:var(--tx-3);line-height:1.4">${spare.join(', ')} — troque em 👤 Equipamento ou guarde no baú</div>` : '');
	}

	// Um item da mochila (ou do corpo) w×h px: ícone, contador e clique para selecionar.
	_invItemEl(it, i, w, h, inv) {
		const d = document.createElement('div');
		d.className = 'pm-item' + (i === this.invSel ? ' on' : '');
		d.style.width = w + 'px'; d.style.height = h + 'px';
		const ic = this.itemIcon(it.key === 'carkey' ? 'carkey' : (it.kind === 'ammo' ? (Weapons[it.key] && Weapons[it.key].rocket ? 'ammo_rocket' : 'ammo_pistol') : it.key));
		const k = Math.max(1, Math.min(4, Math.floor(Math.min((w - 14) / ic.w, (h - 14) / ic.h))));
		const cv = ic.canvas.cloneNode(); cv.getContext('2d').drawImage(ic.canvas, 0, 0);
		cv.style.width = ic.w * k + 'px'; cv.style.height = ic.h * k + 'px';
		d.appendChild(cv);
		const n = document.createElement('div'); n.className = 'n';
		n.textContent = it.kind === 'weapon' ? (Weapons[it.key].gun ? `${inv.mag(it.key)}` : '') : 'x' + it.count;
		d.appendChild(n);
		d.addEventListener('click', () => { this.invSel = i; this._renderInventory(); });
		return d;
	}

	// Físico e atributos evoluíveis (player/Physique.js): o porte, gordura, massa muscular, saciedade, força, fôlego e velocidade, e o
	// treino do dia na academia (minigames/Gym.js).
	_physiqueHtml(pl, bar, row) {
		const P = Physique, fit = Bags.fitLevel(pl.fit), S = Math.round(P.strength(pl));
		const s0 = pl.stamina; pl.stamina = pl.staminaMax || 100; const top = Bags.runSpeed(pl) * 3.6; pl.stamina = s0;      // (pique com o fôlego cheio)
		const walk = Config.player.maxSpeed * (1 + Outfit.m.walk) * P.speedMul() * 3.6;
		const col = { Obeso: '#f87171', Gordo: '#fb923c', 'Muito magro': '#f87171', Magro: '#fbbf24', Normal: '#86efac', Forte: '#7dd3fc', Musculoso: '#a78bfa' }[P.label()] || '#e8edf8';
		const tr = ['curl', 'bench', 'squat'].map((k, i) => `${['rosca', 'supino', 'agach.'][i]} ${P.SETS_PER_DAY - P.setsLeft(k)}/${P.SETS_PER_DAY}`).join(' · ');
		const pass = P.hasPass() ? `liberada até o dia ${Math.floor((P.passUntil - 0.01) / 24)}` : 'sem plano (diária na recepção)';
		return `<span class="tag" style="color:${col}">PORTE: ${P.label().toUpperCase()}</span>`
			+ bar('GORDURA', P.fat, 'linear-gradient(90deg,#fde68a,#fb923c,#ef4444)', `${Math.round(P.fat)}% · ${P.fat >= 62 ? 'acima do peso: mais lento, menos fôlego' : P.fat <= 12 ? 'abaixo do peso: menos força' : 'normal'}`)
			+ bar('MASSA MUSCULAR', P.muscle, 'linear-gradient(90deg,#93c5fd,#6366f1)', `${Math.round(P.muscle)}/100 · academia + comida em dia`)
			+ bar('SACIEDADE', P.fed, 'linear-gradient(90deg,#f59e0b,#84cc16)', P.hungerLabel())
			+ bar('FORÇA', S, 'linear-gradient(90deg,#f472b6,#ef4444)', `${S}/100 · carga +${Math.round((Bags.carryMul(pl) - 1) * 100)}% · golpes ×${P.meleeMul(pl).toFixed(2)}`)
			+ bar('FÔLEGO', fit / 20 * 100, 'linear-gradient(90deg,#10b981,#a3e635)', `condicionamento ${fit}/20 · máx ${pl.staminaMax || Bags.staminaMax(fit, Outfit.m)} — sobe correndo`)
			+ bar('VELOCIDADE', top / 54 * 100, 'linear-gradient(90deg,#22d3ee,#3b82f6)', `pique ${Math.round(top)} km/h · andando ${walk.toFixed(1)} km/h`)
			+ row('Máximo na academia', `rosca ${Math.round(P.maxLift('curl', pl))} · supino ${Math.round(P.maxLift('bench', pl))} · agach. ${Math.round(P.maxLift('squat', pl))} kg`)
			+ row('Treino de hoje', tr) + row('Academia', pass);
	}

	_renderInfo() {
		const el = this.$('pmInfo'), it = this._layout[this.invSel], inv = this.g.inventory;
		if (!it) { el.innerHTML = '<h4>MOCHILA VAZIA</h4>Pegue itens pela cidade.'; return; }
		let desc = '', btns = [];
		if (it.kind === 'weapon') {
			const W = Weapons[it.key], eq = this.g.player.weapon === it.key;
			desc = (W.gun ? `Dano ${W.dmg}${W.pellets > 1 ? ' ×' + W.pellets : ''}<br>Alcance ${W.range} · ${W.auto ? 'Automática' : 'Tiro a tiro'}<br>Carregador ${inv.mag(it.key)}/${inv.magOf(it.key)} · reserva ${inv.reserve(it.key)}` : `Dano ${W.dmg} · corpo a corpo`)
				+ (it.body ? `<br><span style="color:var(--gold)">No corpo (${it.slot.toLowerCase()}): não ocupa a mochila e pesa metade</span>` : '');
			btns = [[eq ? 'EM USO' : 'EQUIPAR', 'primary'], ['DESCARTAR', 'discard']];
		} else if (it.kind === 'ammo') { desc = `Munição de ${Weapons[it.key].name}<br>${it.count} balas na mochila.`; btns = [['DESCARTAR', 'discard']]; }
		else if (it.kind === 'medkit') { desc = `Recupera 55 de vida.<br>${it.count} no estoque (M também usa).`; btns = [['USAR', 'primary'], ['DESCARTAR', 'discard']]; }
		else if (it.kind === 'hack') { desc = 'Abre uma fechadura de carro sozinho, sem mini-game (tecla G).'; btns = [['DESCARTAR', 'discard']]; }
		else if (it.kind === 'food' || it.kind === 'water') { desc = `Recupera ${Inventory.HEAL[it.kind]} de vida.<br>${it.count} aqui · guarde o resto na geladeira de casa.`; btns = [[it.kind === 'food' ? 'COMER' : 'BEBER', 'primary'], ['DESCARTAR', 'discard']]; }
		else if (it.kind === 'grenade' || it.kind === 'molotov') {
			const eq = this.g.player.weapon === it.kind;
			desc = it.kind === 'grenade' ? `Tecla 0. Segure o ataque: puxa o pino e mira com o mouse (cai no cursor) ou o analógico direito (inclinar mais = mais longe): mais longe, mais forte. Solte para jogar.<br>Explode ~3 s depois do pino — segurar demais explode na mão.<br>${inv.reserve('grenade')} na mochila.`
				: `Tecla −. Segure o ataque: acende o pano e mira com o mouse ou o analógico direito (linha tracejada). Solte para jogar.<br>Quebra no impacto e deixa o chão em chamas por 30 s ou mais: queima gente e carros.<br>${inv.reserve('molotov')} na mochila.`;
			btns = [[eq ? 'EM USO' : 'EQUIPAR', 'primary'], ['DESCARTAR 1', 'discard']];
		}
		else if (it.kind === 'jewel') { desc = `Peças de joalheria (~${brl(Math.round(inv.jewelValue))} no total).<br>Guarde no cofre de casa ou venda lá.`; btns = [['DESCARTAR', 'discard']]; }
		else if (it.kind === 'item') { const D = Items.def(it.item); desc = `${D.desc}<br>${D.kg} kg cada · ${it.count} aqui${D.cat === 'part' ? '<br>Troque no capô: a pé, na frente do carro, E.' : D.cat === 'use' ? '<br>Use no capô do carro (a pé, E na frente dele).' : ''}`; btns = [['DESCARTAR 1', 'discard']]; }
		else { desc = 'Destranca um carro estacionado sem alarme (tecla F).'; btns = [['DESCARTAR', 'discard']]; }
		el.innerHTML = `<h4>${it.label.toUpperCase()}${it.count > 1 && it.kind !== 'ammo' ? ' ×' + it.count : ''}</h4>${desc}<div class="pm-btns"></div>`;
		const box = el.querySelector('.pm-btns');
		for (const [label, act] of btns) { const b = document.createElement('div'); b.className = 'pm-btn'; b.textContent = label; b.addEventListener('click', () => this._invAction(act)); box.appendChild(b); }
	}

	_invAction(act) {
		const it = this._layout && this._layout[this.invSel];
		if (!it) return;
		const g = this.g, inv = g.inventory, pl = g.player;
		if (act === 'primary') {
			if (it.kind === 'weapon') { if (!pl.equip(it.key)) { pl.weapon = it.key; pl.aimTimer = 0; } g.reloading = 0; g._flash(`Arma: ${Weapons[it.key].name}`); }
			else if (it.kind === 'grenade' || it.kind === 'molotov') { if (!Throwables.busy() && !pl.equip(it.kind)) { pl.weapon = it.kind; pl.aimTimer = 0; } g._flash(`Arma: ${Weapons[it.kind].name} ${inv.ammoText(it.kind)}`); }
			else if (it.kind === 'medkit') g._useMedkit();
			else if (it.kind === 'food' || it.kind === 'water') g._eat(it.kind);
		} else if (act === 'discard') {
			if (it.kind === 'weapon') { const w = inv.weapons[it.key]; w.owned = false; w.mag = 0; w.reserve = 0; if (pl.weapon === it.key) pl.weapon = 'none'; }
			else if (it.kind === 'ammo') inv.weapons[it.key].reserve = 0;
			else if (it.kind === 'grenade' || it.kind === 'molotov') { const w = inv.weapons[it.kind]; w.reserve = Math.max(0, w.reserve - 1); if (w.reserve <= 0 && pl.weapon === it.kind) pl.weapon = 'none'; }
			else if (it.kind === 'medkit') inv.medkits = Math.max(0, inv.medkits - 1);
			else if (it.kind === 'hack') inv.hacks = Math.max(0, inv.hacks - 1);
			else if (it.kind === 'food' || it.kind === 'water') inv[it.kind] = Math.max(0, inv[it.kind] - 1);
			else if (it.kind === 'jewel') { const avg = inv.jewelValue / Math.max(1, inv.jewels); inv.jewels = Math.max(0, inv.jewels - 1); inv.jewelValue = Math.max(0, inv.jewelValue - avg); }
			else if (it.kind === 'item') Items.take(inv, it.item, 1);
			else inv.keys = Math.max(0, inv.keys - 1);
			g._flash(`Descartou: ${it.label}`);
		}
		this._renderInventory();
	}

	// ------------------------------------------------------------------ configurações
	_setAdjust(d) {
		const s = this.settings;
		if (this.setRow === 0) s.volume = Math.max(0, Math.min(1, Math.round((s.volume + d * 0.1) * 10) / 10));
		else if (PauseMenu.SET_KEYS[this.setRow] === 'graphics') this._cycle('graphics', Graphics.CHOICES, 'auto', d, (c) => I18n.t('settings.graphics.flash', { choice: Graphics.label(c) }));
		else if (PauseMenu.SET_KEYS[this.setRow] === 'language') this._cycle('language', I18n.LANGS, I18n.lang, d, (c) => I18n.t('settings.language.flash', { choice: I18n.label(c) }));
		else if (d === 0 || true) { const k = PauseMenu.SET_KEYS[this.setRow]; if (this.setRow > 0) s[k] = d === 0 ? !s[k] : d > 0; }
		this._saveSettings(); this.applySettings();
	}

	// Graphics preset and language: ← → / Enter walk the choices; saved now, applied the next time the game opens (the world was built
	// for the current preset, the texts were read in the current language).
	_cycle(key, C, current, d, flash) {
		const s = this.settings, i = Math.max(0, C.indexOf(s[key] || current));
		s[key] = d < 0 ? C[(i + C.length - 1) % C.length] : C[(i + 1) % C.length];
		if (this.g._flash) this.g._flash(flash(s[key]));
	}

	_renderSettings() {
		const s = this.settings, el = this.$('pmSet');
		const T = (k, v) => I18n.t(k, v), tog = (v) => `<div class="pm-toggle ${v ? 'is-on' : ''}">${T(v ? 'common.on' : 'common.off')}</div>`;
		const sub = (t) => `<small style="display:block;font-weight:500;color:var(--tx-3);font-size:12px">${t}</small>`;
		const R = {
			volume: ['🔊 ' + T('settings.volume'), `<input type="range" min="0" max="100" value="${Math.round(s.volume * 100)}" id="pmVol"><span>${Math.round(s.volume * 100)}%</span>`],
			sfx: ['🎵 ' + T('settings.sfx'), tog(s.sfx)], minimap: ['🗺️ ' + T('settings.minimap'), tog(s.minimap)], prompts: ['💬 ' + T('settings.prompts'), tog(s.prompts)],
			camBounce: ['🚗 ' + T('settings.camBounce') + ' ' + sub(T('settings.camBounce.hint')), tog(s.camBounce !== false)],
			graphics: ['🖥️ ' + T('settings.graphics') + ' ' + sub(T('settings.graphics.hint', { level: Graphics.LABEL[Graphics.level] })), `<div class="pm-toggle is-on">${Graphics.label(s.graphics)}</div>`],
			language: ['🌐 ' + T('settings.language') + ' ' + sub(T('settings.language.hint')), `<div class="pm-toggle is-on">${I18n.label(s.language || I18n.lang)}</div>`],
			tiltSteer: ['📱 ' + T('settings.tilt') + ' ' + sub(T('settings.tilt.hint')), tog(s.tiltSteer)],
			cars3d: ['🚘 ' + T('settings.cars3d') + ' ' + sub(T('settings.cars3d.hint')), tog(s.cars3d)],
			dev: ['🛠️ ' + T('settings.dev'), tog(s.dev)],
		};
		const rows = PauseMenu.SET_KEYS.map((k) => R[k]);
		el.innerHTML = rows.map((r, i) => `<div class="pm-row ${i === this.setRow ? 'on' : ''}" data-i="${i}"><span>${r[0]}</span><span style="display:flex;gap:12px;align-items:center">${r[1]}</span></div>`).join('');
		const on = el.querySelector('.pm-row.on'); if (on) on.scrollIntoView({ block: 'nearest' });       // (teclado/controle: a linha escolhida não some da tela)
		el.querySelectorAll('.pm-row').forEach((row) => row.addEventListener('click', (e) => {
			this.setRow = +row.dataset.i;
			if (this.setRow > 0) this._setAdjust(0);
			this._renderSettings();
		}));
		const vol = this.$('pmVol');
		if (vol) vol.addEventListener('input', () => { s.volume = vol.value / 100; this._saveSettings(); this.applySettings(); vol.nextSibling.textContent = vol.value + '%'; });
	}

	// ------------------------------------------------------------------ por frame (o jogo está pausado)
	update(dt) {
		const inp = this.g.input, m = this.map;
		this._pad(dt);
		if (this.tab === 'map') {
			// Cursor pelo teclado: setas/WASD movem; perto da borda o mapa rola.
			const ax = (inp.keys['arrowright'] || inp.keys['d'] ? 1 : 0) - (inp.keys['arrowleft'] || inp.keys['a'] ? 1 : 0);
			const az = (inp.keys['arrowdown'] || inp.keys['s'] ? 1 : 0) - (inp.keys['arrowup'] || inp.keys['w'] ? 1 : 0);
			if (ax || az) this._moveCursor(ax, az, dt);
			this._drawMap();
			if (Standing.policeOp) this._opBanner();
		} else if (this.tab === 'status') { this._stT = (this._stT || 0) - dt; if (this._stT <= 0) { this._stT = 0.5; this._renderStatus(); } }
	}

	// Faixa piscando no topo do mapa durante a operação policial na favela.
	_opBanner() {
		const ctx = this.mapCtx, W = this.mapCv.width, on = Math.floor(performance.now() / 380) % 2 === 0, h = Math.max(26, Math.min(40, W / 22));
		ctx.save();
		ctx.fillStyle = on ? 'rgba(200,24,24,0.88)' : 'rgba(110,10,10,0.88)'; ctx.fillRect(0, 0, W, h);
		ctx.fillStyle = '#ffe9a8'; for (let x = (on ? 0 : 14); x < W; x += 28) ctx.fillRect(x, h - 5, 14, 5);       // listra de aviso
		ctx.font = `800 ${Math.round(h * 0.55)}px Outfit, Inter, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		ctx.fillStyle = '#fff'; ctx.fillText('🚨 OPERAÇÃO POLICIAL EM ANDAMENTO — ÁREA DE RISCO 🚨', W / 2, h / 2 - 2);
		ctx.restore();
	}

	_moveCursor(ax, az, dt) {
		const m = this.map, c = this.mapCv, sp = 520 * dt;
		this._touchMap = false;                                             // (setas/controle: volta a ter cursor)
		m.cur.x = Math.max(0, Math.min(c.width, m.cur.x + ax * sp)); m.cur.y = Math.max(0, Math.min(c.height, m.cur.y + az * sp));
		const edge = 70, pan = (360 * dt) / m.scale;
		if (m.cur.x < edge) m.cx -= pan; if (m.cur.x > c.width - edge) m.cx += pan;
		if (m.cur.y < edge) m.cz += pan; if (m.cur.y > c.height - edge) m.cz -= pan;
		this._clampCenter();
	}

	// Controle: B/Start fecha, LB/RB abas. Em cada aba:
	//   MAPA        analógico/direcional move o cursor · A/Y marca o destino · X limpa · RT/LT ou analógico direito zoom
	//   INVENTÁRIO  direcional escolhe o item · A usa/equipa · X descarta
	//   AJUSTES     ↑/↓ opção · ←/→ ajusta · A alterna
	//   STATUS, CARREIRAS, IMPÉRIO, GUIA   destaque nos botões/cartões (FocusNav) · A clica · analógico direito rola
	_pad(dt) {
		const p = PadNav.pad();
		if (!p) { this._padPrev = null; return; }
		const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed), prev = this._padPrev || [];
		const edge = (i) => b(i) && !prev[i];
		const inp = this.g.input;
		if (p.buttons.some((x) => x && x.pressed)) { inp.usingPad = true; if (p.id) inp.padType = PadGlyphs.type(p.id); }      // (o InputManager não lê o controle com o menu aberto)
		if ((inp.usingPad ? inp.padType : '') !== this._hintsPad) this._renderHints();                                         // trocou teclado ↔ controle: refaz o rodapé
		const tabs = PauseMenu.TABS.map((t) => t[0]), i = tabs.indexOf(this.tab);
		this._padPrev = Array.from(p.buttons, (x) => !!(x && x.pressed));
		if (edge(1) || edge(9)) { FocusNav.clear(); this.close(); return; }
		if (edge(4)) { FocusNav.clear(); this.setTab(tabs[(i + tabs.length - 1) % tabs.length]); return; }
		if (edge(5)) { FocusNav.clear(); this.setTab(tabs[(i + 1) % tabs.length]); return; }
		const key = (k) => this._onKey({ key: k, shiftKey: false, preventDefault() {} });
		if (this.tab === 'map') {
			if (edge(0) || edge(3)) this._markAtCursor();
			if (edge(2)) { this.g.clearGps(); this._refreshDest(); }
			const ax = (b(15) ? 1 : 0) - (b(14) ? 1 : 0) || (Math.abs(p.axes[0]) > 0.3 ? p.axes[0] : 0), az = (b(13) ? 1 : 0) - (b(12) ? 1 : 0) || (Math.abs(p.axes[1]) > 0.3 ? p.axes[1] : 0);
			if (ax || az) this._moveCursor(ax, az, dt);
			const zin = (p.buttons[7] ? p.buttons[7].value : 0) - (p.buttons[6] ? p.buttons[6].value : 0) - (Math.abs(p.axes[3] || 0) > 0.25 ? p.axes[3] : 0);
			if (Math.abs(zin) > 0.1) this._zoom(Math.pow(2.2, zin * dt), { x: this.map.cur.x, y: this.map.cur.y });
			return;
		}
		const d = PadNav.dir(p, dt);
		if (this.tab === 'inventory' || this.tab === 'settings') {
			if (d) key(d.dx > 0 ? 'ArrowRight' : d.dx < 0 ? 'ArrowLeft' : d.dy > 0 ? 'ArrowDown' : 'ArrowUp');
			if (edge(0)) key('Enter');
			if (edge(2) && this.tab === 'inventory') key('Delete');
			if (this.tab === 'inventory') {
				if (edge(3)) key('c');                                                          // Y: Equipamento ↔ Mochila
				if (this.invView === 'equip') { if (edge(6)) key('['); if (edge(7)) key(']'); }   // LT/RT: categoria
			}
			return;
		}
		// Abas de cartões e botões: navegação genérica.
		const root = this.root.querySelector('.pm-page.on');
		if (!root) return;
		const cur = FocusNav.sync(root);
		if (d) {
			if (!cur || !FocusNav.move(root, d.dx, d.dy)) { if (d.dy) FocusNav.scroll(root, d.dy * 140); }
		}
		if (edge(0)) FocusNav.activate();
		const ry = p.axes[3] || 0;
		if (Math.abs(ry) > 0.25) FocusNav.scroll(root, ry * 900 * dt);
	}
}
memoStatics(PauseMenu, 'TABS', 'POI_TYPES', 'KEYS_HTML', 'SET_KEYS');
