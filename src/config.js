// ============================================================================
// DIRTY MONEY - Configuração central (tunables)
// Um único lugar para ajustar sensação de jogo, câmera e mundo.
// ============================================================================

// Dinheiro do jogo é em reais: brl(1500) → "R$ 1.500" (use em TODA interface que mostra valores).
function brl(n) { return "R$ " + Math.round(n).toLocaleString("pt-BR"); }

// Distância euclidiana de 2 ou 3 componentes. Use no lugar de Math.hypot: o do V8 é ~18× mais lento que sqrt e aloca a cada chamada
// (é variádico) — e distâncias são calculadas centenas de vezes por quadro (IA, polícia, trânsito, colisões, pássaros).
// (Sem a proteção contra overflow do Math.hypot, que só importa para valores acima de ~1e154.)
function hypot(x, y, z = 0) { return Math.sqrt(x * x + y * y + z * z); }
// Posição utilizável (finita e dentro do mundo, com folga)? NaN/Infinity dão false. As buscas em grade (`for (i = floor(x/S); i <=
// floor((x+r)/S); i++)`) com x infinito ou gigante (> ~1e17: `i + 1 === i`) NUNCA terminam — um carro lançado para longe pela física
// congelava o jogo inteiro. Quem recebe posições de entidades confere com isto antes de varrer a grade.
function inWorld(x, z) { const W = Config.world; return x > W.minX - 3000 && x < W.maxX + 3000 && z > W.minZ - 3000 && z < W.maxZ + 3000; }

// Tabelas constantes declaradas como `static get NOME() { return {...} }` montavam um objeto NOVO a cada leitura — e várias são lidas em
// laços de todo quadro (Pickups.TYPES, Birds.SPECIES, CarSheet.MODELS...): lixo para o coletor e engasgos no celular. memoStatics troca
// o getter por um que monta a tabela na 1ª leitura e devolve sempre a mesma (ninguém altera essas tabelas). Use no fim do arquivo da classe.
function memoStatics(cls, ...names) {
	for (const n of names) {
		const d = Object.getOwnPropertyDescriptor(cls, n);
		if (!d || !d.get) throw new Error(`memoStatics: ${cls.name}.${n} não é um getter estático`);
		let v, done = false;
		Object.defineProperty(cls, n, { configurable: true, get() { if (!done) { v = d.get.call(cls); done = true; } return v; } });
	}
}

const Config = {
	// Desempenho (navegador, celular, Capacitor/Tauri): teto de quadros por segundo do jogo inteiro (lógica + render).
	// `lite` (celular, tablet ou aparelho fraco) liga o perfil leve: mapa de sombras menor, menos pedestres/carros e menos colisores vivos.
	// O AutoQuality (core/AutoQuality.js) ainda pode descer mais um nível em tempo real se o aparelho não aguentar os 30 quadros.
	perf: { fpsCap: 30, lite: false, shadowSize: 2048, colliderRadius: 220, dprCap: 2 },

	// Pixel art: tudo (texturas do mundo e sprites) é desenhado nesta densidade,
	// e o jogo é renderizado numa resolução interna baixa e ampliado sem suavizar.
	art: {
		ppu: 20,               // pixels de textura por unidade de mundo (1u ≈ 1m).
		pixelate: false,       // (o jogo é sempre em alta definição: a tela fica na resolução real, sem o modo pixel art)
		hd: true,              // ALTA DEFINIÇÃO, sempre: tela na resolução real e personagens 2,5D em 2× (atlas prontos em alta: assets/baked).
		smooth: true,          // GRÁFICO SUAVE, sempre: antisserrilhado (MSAA), densidade real do monitor, texturas do chão filtradas e sombras macias. Ver render/Smooth.js.
		carRelief: 1,          // relevo dos carros (CarArt): luz do sol do mundo na carroceria, brilho e reflexo nos vidros. 0 = desenho plano.
		cars3d: true,          // carros em 3D (CarArt3D, assets/cars/carros3d.js): rodas que rolam e esterçam, carroceria balançando na suspensão. false (ou ?cars2d) = sprites do atlas.
		charScale: 0.8,        // escala do DESENHO dos personagens (atlas vetorial). Os carros são de tamanho real; isto aproxima a proporção.
		npcPpu: 26,            // personagens 2,5D (NpcArt): px do atlas por metro — adultos na mesma escala dos veículos. = NpcGenBuild.PPU (pilotos × motos)
		npcDirs: 16,           // direções desenhadas dos personagens 2,5D. Perfil leve: 8 (só as páginas pares dos atlas; os visuais do guarda-roupa saem com 8)
		vramMB: 640,           // orçamento das páginas dos atlas 2,5D na GPU (MB): passou, as sem uso há 15 s saem (NpcArt._lru). Perfil leve: 256
		uploadMB: 3,           // envio das páginas 2,5D à GPU: MB por quadro, em faixas (NpcArt._upStep — sem travar quando um tipo novo aparece). Perfil leve: 1
		internalHeight: (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ? 440 : 560,   // altura interna alvo (px) quando pixelate = true (celular: menor, mais leve).
	},

	camera: {
		// "Bússola": norte sempre pra cima, sempre centrada no alvo. Perspectiva leve
		// (câmera alta + FOV estreito): prédios mostram um pouco das laterais, mas como o
		// ponto de fuga fica EM CIMA do alvo, os telhados se projetam para fora e nunca
		// o escondem.
		height: 150,           // altura da câmera (u). Maior = perspectiva mais sutil.
		// 2.5D camera (the default; `?cam=top` = the old top-down camera everywhere): orthographic, tilted `tilt` degrees above the horizon — the angle the
		// character atlases were rendered at (tools/asset_baker) — looking north from the south. Interiors and the safe house keep the
		// top-down camera above (their art is painted for it). `distance` = how far back along the view ray it sits (depth range only).
		tilted: !(typeof location !== 'undefined' && /[?&]cam=top\b/.test(location.search)),
		tilt: 56,
		distance: 150,
		tallest: 42,           // tallest building (m): its top shows up to tallest·cot(tilt) beyond the bottom edge — culling margin
		// 2.5D edge cut (scene fog, CompassCamera._applyFog): the world fades into the background colour from `fogStart` to `fogEnd` of
		// the way from the centre of the screen to its nearest edge — nothing past the immediate surroundings shows or pops in.
		fogStart: 0.86,
		fogEnd: 1.0,
		viewHalf: 15,          // metade da altura visível no chão (zoom padrão).
		minView: 8,            // zoom máximo (aproximado).
		maxView: 34,           // zoom mínimo (afastado).
		zoomSpeed: 22,         // velocidade de zoom por tecla (unidades/s).
		wheelStep: 1.5,        // passo de zoom por "tick" da roda do mouse.
		followLerp: 60,        // suavidade do acompanhamento (alto = praticamente colada).
		// Zoom automático (CompassCamera.setAutoZoom): multiplica o zoom escolhido. A pé aproxima; no veículo afasta conforme a velocidade:
		// carZoom parado, + speedZoom inteiro a partir de speedRef m/s. Os lerps são a rapidez da transição (afastar / aproximar).
		footZoom: 0.78,
		carZoom: 1.0,
		speedZoom: 0.75,
		speedRef: 38,          // m/s (≈ 137 km/h): acima disso o afastamento já é o máximo
		zoomOutLerp: 1.4,
		zoomInLerp: 0.9,
		// Dirigindo: câmera "bússola" — gira com o veículo (frente sempre para cima) e o deixa mais ao sul da tela.
		carCompass: true,
		carLead: 0.45,         // adianto à frente do veículo (fração da meia-altura visível): 0,45 = carro a ~72% da altura da tela
		carTurnTrigger: 1.13,  // só gira (em passos de 90°) quando o carro se afasta ~65° da direção da câmera: desvios não balançam a tela
		yawLerp: 3.5,          // rapidez do giro da câmera quando ela gira (maior = mais rápido; menor = mais suave)
		leadLerp: 2.5,         // rapidez com que o adianto entra (ao entrar no carro) e sai (ao descer)
		// BALANÇO ao dirigir (CompassCamera._bounce): a câmera presa ao veículo por uma mola. lag = deslocamento (u) por m/s² de
		// aceleração (arrancada, freada, curva), até maxAcc; stiff/damp = a mola (pouco amortecida: passa do ponto e assenta);
		// roll = inclinação (rad) por rad/s de giro, até rollMax; bump = força dos trancos do asfalto (pulso no zoom, mola hStiff/hDamp);
		// rumble = trepidação (u) a partir de rumbleRef m/s.
		bounce: { lag: 0.07, maxAcc: 22, accLerp: 10, stiff: 26, damp: 3.6, roll: 0.012, rollMax: 0.03, bump: 0.18, hStiff: 60, hDamp: 6, rumble: 0.05, rumbleRef: 30 },
		// Borrão de velocidade (SpeedBlur): começa a 80% da velocidade máxima do veículo e chega ao máximo nela.
		blurFrom: 0.8,
		blurMax: 0.04,         // força máxima (fração da distância ao carro que cada pixel "arrasta")
	},

	// Relógio do jogo: 24h do jogo duram `cycleSeconds` reais. Começa no fim da tarde para
	// a noite chegar logo (faróis, postes e janelas acesas).
	time: {
		cycleSeconds: 720,
		start: 16.8,
	},

	// Luz do sol (direção em que a luz VIAJA). Luz vem do noroeste, sombras caem p/ sudeste,
	// coerente com o sombreamento baked dos sprites (luz no canto superior esquerdo).
	light: {
		sunDir: [0.6, -1.8, -0.45],
	},

	player: {
		// Velocidades (1 u = 1 m) no ritmo de jogo (2× o real): andar 10 km/h; correr de 20 a 54 km/h conforme o fôlego (Bags.runSpeed).
		// Correndo, começa no pique e vai perdendo o pace conforme o fôlego acaba.
		maxSpeed: 2.78,        // Velocidade de caminhada (m/s) = 10 km/h.
		sprintSpeed: 15,       // Pique máximo correndo (m/s) = 54 km/h, com o condicionamento no máximo (nível 20).
		sprintStart: 0.89,     // Pique no condicionamento 0 (× sprintSpeed ≈ 48 km/h); cresce até 1 no nível 20.
		sprintMin: 0.37,       // Correndo sem fôlego (× sprintSpeed ≈ 20 km/h).
		stride: 2,             // Passada do jogador × a normal (Config.anim): no ritmo 2×, as pernas mantêm a cadência em vez de dobrá-la.
		staminaBase: 100,      // Fôlego no condicionamento 0 (+staminaPerLvl por nível).
		staminaPerLvl: 8,
		staminaDrain: 4,       // Fôlego gasto por segundo correndo (≈ 25 s de corrida no nível 0; ≈ 90 s no nível 20).
		accel: 12,             // Taxa de aproximação da velocidade alvo (maior = mais responsivo).
		turnLerp: 16,          // Velocidade de giro do corpo em direção ao movimento.
		radius: 0.55,          // Raio de colisão contra prédios.
	},

	// Ritmo das animações de andar/correr dos personagens 2,5D: a velocidade (m/s) em que os pés ficam PLANTADOS com o clipe no ritmo
	// normal (passada do adulto — NpcGenAnims.gait). O jogo toca o clipe em velocidade ÷ isto: quem anda mais rápido dá passos mais
	// rápidos, sem "patinar".
	anim: { walk: 1.6, run: 4.3 },

	// Liberty City: grade de quarteirões (fonte do mundo 3D e do GPS).
	// As bordas da grade são quarteirões de costa (praia/porto/mata) sem rua externa.
	city: {
		cols: 8,               // nº de quarteirões no eixo X.
		rows: 10,              // nº de quarteirões no eixo Z.
		pitch: 42,             // distância entre eixos de rua (quarteirão + rua).
		roadW: 10,             // largura do asfalto (cabe 2 carros folgado).
		sidewalkW: 4,          // largura da calçada de cada lado.
		curbHeight: 0.18,      // altura da calçada (relevo).
		floorH: 3,             // altura de um andar (prédios são múltiplos disto).
		waterMargin: 260,      // quanto de mar é desenhado além da ilha.
		promenadeW: 14,        // largura da ORLA entre a avenida de contorno e o mar: calçadão (4u, onde se corre) + faixa de areia (resto).
		coastSides: ['E'],     // lados da cidade que dão para o mar (canal da ilha): só neles há areia, guarda-sóis e entrada na água.
	},

	// Mundo grande: a cidade fica no centro, o continente (área rural, serras, favela) a oeste/norte/sul e a ilha praiana a leste,
	// do outro lado do canal. O terreno é um campo de altura/bioma em células de `cell` u, desenhado em pedaços (chunks) de
	// `chunk` u só ao redor do jogador (src/map/WorldMap.js e TerrainBuilder.js).
	world: {
		minX: -1500, maxX: 1000, minZ: -1250, maxZ: 1250,    // 2500 × 2500 u
		cell: 4,               // resolução do campo de relevo/bioma (u por célula).
		chunk: 128,            // lado de um pedaço de terreno (u).
		loadRadius: 230,       // pedaços dentro deste raio do foco são construídos (a câmera enxerga no máx. ~70u).
		unloadExtra: 120,      // folga antes de descartar um pedaço distante.
		buildBudgetMs: 5,      // tempo máx. por frame construindo pedaços.
		meshChunk: 512,        // lado (u) dos pedaços de malha mesclada da cidade (1 malha por material e pedaço; o frustum descarta os de fora)
		meshChunkOffset: 256,  // desloca essa grade: sem isto o centro da cidade (0,0) caía na quina de 4 pedaços e cada material lá era desenhado 4× (−40% de draw calls no centro)
		detailChunk: 128,      // ...e das camadas densas em vértices (acabamentos, meio-fio, postes): ver WorldBuilder._batch
		seed: 20261003,
		legacyPlan: false,     // true = só a cidade antiga (8×10 quarteirões); false = o mundo todo (faixa urbana, ilha, pontes, favela, rodovias).

		heightScale: 1.0,      // exagero do relevo no sombreado.
		contour: 3,            // intervalo (u de altura) das curvas de nível.
		cliffSlope: 1.05,      // inclinação (u/u) a partir da qual a encosta vira paredão intransponível.
	},

	spawn: {
		radius: 150,           // raio de spawn de NPCs/polícia ao redor do centro.
	},

	// GPS no canto inferior esquerdo.
	minimap: {
		size: 210,             // tamanho do widget em px.
		rangeUnits: 110,       // quantas unidades de mundo cabem na largura do GPS (zoom).
	},

	nav: {
		maxAgents: 160,        // Capacidade do crowd do Recast.
		// Parâmetros de geração do NavMesh (unidades em "voxels" = cs).
		navMeshParams: {
			cs: 0.5,                    // cell size fino para resolver as calçadas (~4u).
			ch: 0.2,                    // cell height (resolução vertical).
			walkableSlopeAngle: 35,
			walkableHeight: 1,
			walkableClimb: 1,
			walkableRadius: 1,          // Folga dos agentes em relação às paredes.
			maxEdgeLen: 12,
			maxSimplificationError: 1.3,
			minRegionArea: 8,
			mergeRegionArea: 20,
			maxVertsPerPoly: 6,
			detailSampleDist: 6,
			detailSampleMaxError: 1,
		},
	},

	npc: {
		count: 72,             // Nº de pedestres (caminhando, correndo na orla, tomando sol e nadando).
		radius: 0.4,
		height: 1.6,
		accel: 40,             // maxAcceleration do agente.

		wanderSpeed: 1.6,      // Velocidade andando (m/s; um pouco mais devagar que o jogador).
		jogSpeed: 3.4,         // Velocidade de quem corre na orla (trote).
		swimSpeed: 1.5,        // Velocidade nadando no peito (com pressa — voltando, assustado — nada crawl, mais rápido; na água rasa, anda devagar).
		mix: { jog: 0.17, sun: 0.14, swim: 0.12 },   // fração dos pedestres que correm na orla, tomam sol e nadam (o resto perambula).
		sunTime: [40, 110],    // Segundos deitado ao sol.
		swimTime: [45, 110],   // Segundos na água.
		fleeSpeed: 5.2,        // Velocidade em pânico (o jogador correndo alcança).

		wanderRadius: 30,      // Raio para sortear destinos de perambulação.
		reachDist: 2,          // Distância p/ considerar "chegou" ao destino.
		wanderTime: 7,         // Tempo máx. perambulando até re-sortear destino.

		panicRadius: 13,       // Raio de contágio do pânico numa tentativa de roubo.
		robRange: 2.5,         // Alcance para roubar de fato o NPC mais próximo.
		fleeTime: 5,           // Tempo mínimo fugindo antes de voltar a perambular.

		// Inteligência de pedestre.
		hurrySpeed: 2.6,       // Velocidade ao terminar de atravessar com o sinal já fechando.
		idleChance: 0.35,      // Chance de parar e ficar de bobeira ao chegar no destino.
		idleTime: [2, 6],      // Tempo parado (s), mín–máx.

		// Medo: o que faz um pedestre fugir (precisa VER, exceto tiro que é ouvido).
		violenceRadius: 14,    // Raio em que vê soco/chute/taco/assalto.
		shotRadius: 42,        // Raio em que ouve um tiro.
		chaseRadiusCar: 16,    // Foge de viatura em perseguição até esta distância.
		chaseRadiusOfficer: 11, // ...e de policial correndo atrás de você.
		recycleDist: 250,      // Pedestre mais longe que isto do jogador reaparece perto dele (o mundo é grande).
		wantedRadius: 9,       // Foge de VOCÊ (procurado) até esta distância.
		herdRadius: 5.5,       // Pânico contagia vizinhos até esta distância.
		herdChance: 0.6,
	},

	// Mira assistida das armas de fogo (combat/Aim.js e Combat.assistTarget): trava em quem estiver até `cone` graus (para cada lado)
	// da direção em que o personagem olha — não precisa estar alinhado. Mirando (botão direito/LT) o cone de busca é mais largo.
	aim: { cone: 30 },

	// TÁTICO do jogador a pé (player.js e combat/Cover.js): AGACHAR (Q · L3 no controle) = furtivo; agachado encostado num prédio,
	// muro, caçamba, contêiner ou carro parado = EM COBERTURA; ROLAR (V longe de grade/muro · RB) = esquiva de balas.
	tactics: {
		sneakSpeed: 0.55,      // agachado anda a esta fração do passo normal (não corre: correr levanta)
		stealthSight: 0.55,    // agachado, a polícia e a facção só te notam até esta fração do alcance de visão de sempre...
		stealthSightWanted: 0.75,   // ...ou esta, já procurado (a polícia está atenta)
		stealthWitness: 0.5,   // ...e as testemunhas de um crime (assalto, furto, briga), idem
		theftBonus: 0.25,      // furto agachado: + esta chance de dar certo
		coverReach: 1.3,       // distância (u) até a superfície da cobertura para estar "em cobertura"
		coverSnap: 2.4,        // apertando Q até esta distância de uma cobertura, o personagem vai até ela
		coverMinH: 0.8,        // altura mínima (u) de um obstáculo para servir de cobertura (grade vazada não serve; mureta da ponte, 1 u, serve)
		coverStick: 0.62,      // COLADO na cobertura (Player._coverMove): distância do centro do personagem até a superfície
		coverLeave: 0.3,       // segundos puxando para LONGE da cobertura até soltar dela
		coverCorner: 0.35,     // segundos segurando a direção na PONTA da cobertura até contornar a quina (carro, fim de muro)
		coverExposed: 0.5,     // levantado para mirar/atirar da cobertura: chance de uma bala vinda do lado dela passar
		rollTime: 0.6,         // duração do rolamento (s)
		rollDist: 4.4,         // distância percorrida rolando (u)
		rollIframes: [0.05, 0.48],   // janela (s desde o início) em que as balas passam por você
		rollCooldown: 0.35,    // intervalo mínimo entre dois rolamentos (s)
		rollStamina: 12,       // fôlego gasto por rolamento
	},

	// Assalto (E, com arma na mão: a vítima se rende e entrega tudo) e furto (C: carteirada, sem arma).
	robbery: {
		holdRange: 5,          // Alcance para apontar a arma e render o pedestre mais próximo.
		holdLeash: 7.5,        // Se você se afastar mais que isto da vítima, o assalto é cancelado.
		holdTime: 4.5,         // Segundos que a vítima leva para entregar tudo (você precisa manter a mira).
		holdLoot: [90, 340],   // Dinheiro do assalto, mín–máx.
		witnessRadius: 14,     // Testemunhas (pedestres que veem) até esta distância: fogem e LIGAM para a polícia ao fim — só atende quem
							   // estiver a até police.callRadius (sem viatura/policial por perto, ninguém vem e não há estrela).
		theftRange: 2.2,       // Alcance da carteirada.
		theftChance: 0.4,      // Chance de sucesso do furto (por enquanto aleatória; depois virá do status do personagem).
		theftLoot: [8, 55],    // Dinheiro do furto, mín–máx.
	},

	// Trânsito: carros-IA em mão direita, uma faixa por sentido.
	traffic: {
		count: 26,             // Carros circulando.
		parked: 12,            // Carros estacionados no meio-fio (roubáveis, não bloqueiam a pista).
		motos: 4,              // Motos circulando (com piloto) e estacionadas (vazias, roubáveis).
		motosParked: 3,
		bicycles: 4,           // Bicicletas circulando (pedalando devagar pelas faixas) e estacionadas.
		bicyclesParked: 3,
		couriers: 6,           // Entregadores de aplicativo (moto, baú vermelho): correm de restaurante em restaurante pela cidade.
		laneOffset: 2.5,       // Distância do eixo da rua ao centro da faixa (rua tem 5u de meio a meio-fio).
		parkOffset: 4.9,       // ...e do eixo ao centro de um carro estacionado (as rodas sobem um pouco no meio-fio).
		cruiseMin: 9,          // Velocidade de cruzeiro (m/s), mín–máx por motorista.
		cruiseMax: 14.5,
		turnSpeed: 5.5,        // Velocidade nas curvas dos cruzamentos.
		accel: 5,              // Aceleração suave da IA (m/s²).
		brake: 11,             // Frenagem máxima (m/s²).
		stopGap: 1.6,          // Distância de parada atrás do carro da frente (para-choque a para-choque).
		honkAfter: 2.4,        // Buzina se ficar bloqueado por mais que isto (s) com via livre pelo semáforo.
		honkCooldown: 3.5,
		abandonDist: 48,       // Carro abandonado some do meio da pista quando você se afasta tanto.
		// Mundo grande: o trânsito só existe PERTO do jogador. Quem passa de `recycleDist` reaparece numa rua entre spawnMin e spawnMax.
		spawnMin: 90, spawnMax: 170, recycleDist: 205, relocPerSec: 3,
	},

	// Semáforos dos cruzamentos (ciclo: eixo N-S, depois eixo L-O).
	signals: {
		green: 10,             // Verde (s) de cada eixo.
		yellow: 2.2,           // Amarelo.
		allRed: 1.3,           // Tudo vermelho entre as fases (limpa o cruzamento).
		pedFlash: 5,           // Últimos segundos do verde em que o pedestre NÃO deve começar a atravessar (andando a ~1,6 m/s).
	},

	physics: {
		gravity: -9.81,
	},

	vehicle: {
		count: 3,              // Carros estacionados pelo mapa.
		mass: 900,
		enginePower: 10000,    // "Empuxo" do motor; aceleração = enginePower/mass (~11 m/s²).
		maxSpeed: 26,          // Velocidade máx. à frente (m/s).
		maxReverse: 9,         // Velocidade máx. de ré (m/s).
		hpMul: 2.2,            // Resistência de TODOS os veículos × a do catálogo (spec.hp): lataria mais dura (batidas e tiros).
		turnRate: 2.0,         // Guinada máx. (rad/s) em velocidade plena.
		turnSpeedRef: 6,       // Velocidade (m/s) para direção com autoridade total.
		grip: 10,              // Aderência lateral: maior = mata a derrapagem mais rápido.
		// PESO e DERRAPAGEM do carro que o jogador dirige (Vehicle._applyMotion; motos, bicicletas e barcos ficam de fora):
		understeer: 0.3,       // quanto a guinada cai na velocidade understeerRef (m/s) ou acima: carro rápido vira menos
		understeerRef: 32,
		yawInertia: 5,         // rapidez (1/s) com que a guinada segue o volante num carro de 1 t (√ da massa: mais pesado = mais lento)
		slipLimit: 27,         // aceleração lateral (m/s², velocidade × guinada) que os pneus seguram no seco; acima disso derrapa
		slipMinSpeed: 13,      // abaixo disso (m/s ≈ 47 km/h) nunca derrapa por excesso de curva
		slipGain: 2.5,         // quão rápido o excesso vira derrapagem plena
		slipGrip: 0.85,        // fração da aderência lateral perdida derrapando de vez
		slipYaw: 0.45,         // derrapando, a traseira escapa: o carro gira até 45% além do que o volante pede
		slipScrub: 0.15,       // perda de velocidade (1/s) arrastando de lado
		linearDamping: 0.1,    // Arrasto do chassi.
		brakeDrag: 8,          // Freio-motor (m/s²) quando solta o acelerador.
		waterDrag: 6,          // Atola o carro fora da terra (não atravessa água).
		hijackRange: 5,        // Distância do player ao carro para roubá-lo (do centro do carro: acompanha o vehicle.scale).
		scale: 1.3,            // Tamanho de TODOS os veículos — carros, motos, bicicletas, jet skis, barcos (desenho, física, sombra, portas, luzes).
	},

	// Procurado (★) e FUGA. Cada nível define quão fácil é se safar e o que a cidade manda atrás de você.
	//   sight     raio (u≈m) em que um policial te enxerga; sair dele OU se esconder atrás de prédios = não te vê
	//   lose      segundos seguidos sem ninguém te ver para se safar (zera as estrelas)
	//   radio     quem te viu avisa todos (posição compartilhada); sem rádio, cada um só segue o que viu/ouviu
	//   dispatchR policiais a pé até esse raio da última posição conhecida vêm atrás
	//   cars      viaturas em perseguição (as mais próximas; o resto é completado com viaturas novas)
	//   heli      helicóptero (enxerga por cima dos prédios) | swat: vans da tropa de elite
	//   army      jipes do exército | blocks: bloqueios de rua em volta de você
	// Ragdoll (arremesso por atropelamento): impacto (m/s efetivos) mínimo para derrubar/arremessar.
	ragdoll: {
		minPower: 3.5,
	},

	// Pular de um veículo em movimento: acima de minSpeed (m/s) o jogador sai rolando (cambalhota) e se machuca:
	// dano = (velocidade − 4) × dmgPerMs, no máximo `maxDmg` da vida (e nunca mata).
	bail: { minSpeed: 4.5, dmgPerMs: 1.6, maxDmg: 0.35 },

	// Depois de morrer (hospital) ou ser preso (delegacia) o relógio do jogo avança de hoursMin a hoursMax horas.
	respawn: { hoursMin: 12, hoursMax: 14 },

	// Gasolina (só veículos terrestres): burn = litros/s com o acelerador a fundo e o carro em velocidade máxima (0,1 do valor em marcha
	// lenta); price = $ por litro; fillRate = litros/s ao abastecer (segurar E num posto); warn = fração do tanque que dispara o aviso.
	fuel: { burn: 0.2, price: 1.6, fillRate: 7, warn: 0.2 },

	// Clima (src/world/Weather.js): estados clear | drizzle (chuva fraca) | rain (chuva forte) | storm (tempestade com raios e trovões).
	// Chuva NÃO é diária: cada dia do jogo sorteia se chove (rainDayChance); dia seco = céu limpo. Dia chuvoso tem 1–2 episódios
	// (episodesPerRainyDay) de episodeHours horas do jogo (1 h = 30 s reais), em horas aleatórias, com pico sorteado por peakWeights
	// (garoa → pico → garoa). O 1º dia chove com firstDayChance, logo no começo. boltEvery = intervalo dos raios na tempestade (s).
	weather: {
		start: 'clear',
		rainDayChance: 0.3,
		firstDayChance: 0.6,
		episodesPerRainyDay: [1, 2],
		episodeHours: [1.5, 4],
		peakWeights: { drizzle: 0.45, rain: 0.35, storm: 0.2 },
		boltEvery: [3.5, 9],
	},

	// Água: raso (0..wadeDepth m da margem) = o personagem anda devagar; além disso, nada (animação de natação). maxDepth = até onde dá para ir.
	water: { wadeDepth: 10, maxDepth: 230, diveTime: 14,          // diveTime: segundos de mergulho com o fôlego cheio (Player._updateSwim)
		// Velocidades na água (× a caminhada, Config.player.maxSpeed): nado peito (o normal), crawl com Shift (× a corrida — Bags.runSpeed —
		// e no mínimo crawlMin × caminhada; gasta fôlego como correr), mergulho (peito debaixo d'água) e mergulho com Shift.
		breast: 0.66, crawl: 0.3, crawlMin: 1.1, dive: 0.55, diveFast: 0.95,
		deepWade: 0.8,             // fração de wadeDepth a partir da qual a água passa da metade do corpo (vadear "fundo": braços puxando a água)
		accel: 3.2, turn: 0.45 },  // nadando: acelera/freia devagar (desliza) e vira mais devagar (× Config.player.turnLerp)

	// Roubo de carro estacionado (trancado): rápido (quebra o vidro, dispara o alarme) ou furtivo (mini-game).
	theft: {
		alarmTime: 16,         // Segundos de alarme tocando (buzina + pisca-alerta).
		alarmRadius: 26,       // Pedestres num raio desse tamanho (com visada) se assustam com o vidro quebrando.
		doorOpenSpeed: 3.2,    // Velocidade de abrir/fechar a porta (fração por segundo).
		// Mini-game de arrombar: pinos a travar; errar o tempo faz barulho; barulho demais dispara o alarme.
		lockpick: { pins: 3, maxNoise: 3, speed: 1.15, speedStep: 0.28, zone: 0.2, zoneStep: 0.035 },
	},

	// Batidas, atropelamento e destruição dos carros.
	crash: {
		minDv: 4.0,            // Queda brusca de velocidade (m/s) abaixo da qual não é batida (encostões e raspadas não contam).
		// Dano = dmgK × (dv − minDv)^dmgExp — curva: batida leve quase nada, batida feia muito (com vehicle.hpMul, um popular aguenta
		// ~12 batidas a 36 km/h, ~6 a 54 km/h e 2–3 a 90 km/h). Antes era linear (3,4 por m/s) e 3 batidas já explodiam o carro.
		dmgK: 1.6,
		dmgExp: 1.25,
		tireChance: 0.05,      // Bala que acerta um carro DURANTE UMA PERSEGUIÇÃO (procurado): chance de furar o pneu mais perto.
		cooldown: 0.3,         // s entre danos de batida do mesmo carro.
		bulletMul: 0.5,        // Fração do dano da bala que o carro leva (viaturas inclusive).
		driverHp: 100,         // Vida de quem dirige um carro de trânsito ou uma viatura: tiros pelo LADO DO MOTORISTA vão tirando (Combat._carShot).
		glassDriver: 0.85,     // Fração do dano da bala em quem dirige quando ela entra pelo vidro (pela porta/lataria: doorDriver).
		doorDriver: 0.45,
		runOverSpeed: 3.0,     // Velocidade (m/s) a partir da qual o carro machuca quem está na frente.
		runOverDmg: 7.5,       // Dano em quem é atropelado por m/s acima de runOverSpeed (8 m/s ≈ 38; 17 m/s ≈ 105).
		smokeBelow: 0.35,      // Fração de vida abaixo da qual sai fumaça.
		burnTime: [4.5, 6.5],  // Segundos pegando fogo antes de explodir.
		explosionR: 9,         // Raio da explosão (u).
		wreckLife: 45,         // Segundos até a carcaça poder sumir (fora da tela) — e nunca antes de o fogo apagar (wreckBurn + 25 s).
		wreckBurn: [60, 100],  // Segundos que a CARCAÇA continua em chamas depois da explosão (as chamas vão baixando até virar só fumaça).
	},

	wanted: {
		maxLevel: 5,
		escalateEvery: 6,      // s mínimos entre estrelas por crimes comuns (matar policial sobe na hora)
		// FUGA (estilo GTA): a polícia enxerga num cone à frente (fovCos) com linha de visada — de perto (nearSense) sente em volta.
		// Sem ninguém te ver, a contagem `lose` anda; fora da ÁREA DE BUSCA (círculo em volta de onde te viram por último, raio
		// sight × searchK) ela anda `outsideRate`× mais rápido. Policial colado (closeNoEscape) sem te ver só PAUSA a contagem.
		fovCos: 0.34,          // cos do meio-ângulo do cone de visão (≈ 70° para cada lado)
		nearSense: 11,         // u: de tão perto a polícia percebe você mesmo de costas
		searchK: 1.15,         // raio da área de busca = sight do nível × isto
		outsideRate: 1.8,      // fora da área de busca a fuga anda este tanto mais rápido
		levels: [
			null,
			{ sight: 30, lose: 5,  radio: false, dispatchR: 40,  cars: 0, heli: false, swat: 0, army: 0, blocks: 0 },     // 1★: só quem viu (sem rádio, sem viatura extra)
			{ sight: 46, lose: 11, radio: true,  dispatchR: 130, cars: 2, heli: false, swat: 0, army: 0, blocks: 0 },
			{ sight: 54, lose: 17, radio: true,  dispatchR: 170, cars: 3, heli: true,  swat: 1, army: 0, blocks: 0 },
			{ sight: 62, lose: 24, radio: true,  dispatchR: 230, cars: 4, heli: true,  swat: 2, army: 0, blocks: 2 },
			{ sight: 72, lose: 32, radio: true,  dispatchR: 320, cars: 6, heli: true,  swat: 3, army: 2, blocks: 4 },
		],
	},

	// Helicóptero da polícia (3★+): enxerga por cima dos prédios, holofote, metralhadora a partir de `fireFrom`★.
	// Não vê quem está debaixo de cobertura (viaduto, ponte, toldo, posto) nem escondido; sem te ver, varre a área em espiral.
	heli: {
		hp: 380,               // Dá para derrubá-lo a tiros (pistola ≈ 16 tiros).
		speed: 18,             // m/s (65 km/h): acompanha carro na cidade, mas quem acelera na avenida (25+) abre distância.
		accel: 9,
		alt: 14,               // Altura de voo.
		sight: 48,             // Te acompanhando, não te perde até esta distância (sem linha de visada; +6 por ★ acima de 3; −30% num
							   // alvo rápido: o holofote não acompanha um carro a 100 km/h)...
		spot: 20,              // ...mas para te ACHAR (de novo) você precisa cair no holofote: até isto do ponto embaixo/à frente dele.
		orbit: 7,              // Raio da órbita sobre o jogador.
		fireFrom: 4,           // ★ a partir das quais ele atira.
		fireRange: 46,
		spawnDist: 170,        // Entra voando de tão longe.
		delay: 16,             // Segundos entre chegar ao nível e o helicóptero aparecer.
		cooldown: 45,          // Segundos até vir outro depois de derrubado.
		sortie: [0, 0, 0, 70, 95, 0],   // Autonomia por ★ (s no ar; 0 = sem limite): acabou, ele vai abastecer — a brecha para sumir.
		refuel: 35,            // Segundos fora (abastecendo) até voltar.
	},

	police: {
		// Patrulha sempre presente no mapa.
		patrolCars: 5,
		patrolOfficers: 8,

		shootFromStars: 2,     // A partir de quantas ★ a polícia atira mesmo sem você atirar (99 = nunca: só reage a tiros do jogador).
		hearMemory: 22,        // Quanto tempo (s) quem ouviu um tiro continua indo ao local.
		weaponsFreeTime: 24,   // Segundos de "armas liberadas" após um tiro do jogador.
		shootRange: 44,        // Alcance em que policiais (a pé e nas viaturas) atiram com armas liberadas.
		// RADAR da polícia: um crime só vira procurado se a polícia estiver PERTO — presenciando (sightRange, com linha de visada,
		// até crimeVisibleTime s depois) ou ouvindo/sendo chamada (hearRadius/callRadius: aí ela vai ao local e o flagrante fica aberto
		// por investigateTime enquanto investiga). Longe da polícia, tiro e assalto não dão estrela.
		hearRadius: 55,        // Policial a até isto de um tiro do jogador OUVE: vai ao local e passa a atirar (armas liberadas).
		maxOfficers: 42,       // Teto de policiais a pé (patrulha + reforços que descem das viaturas).
		sightRange: 28,        // SEM estrelas: alcance em que um policial presencia um crime (≈ a tela). Com ★ vale o `sight` do nível.
		crimeVisibleTime: 3,   // O crime precisa ser visto na hora (até isto de s depois)...
		investigateTime: 10,   // ...ou, se a polícia por perto ouviu/foi chamada, enquanto ela investiga o local.
		callRadius: 70,        // Testemunhas que ligam (assalto) só trazem a polícia que estiver a até isto do local.

		bustRange: 8,          // Distância da polícia que conta para a prisão.
		bustTime: 5,           // Segundos colado na polícia para ser preso (dá tempo de reagir e fugir a pé).

		// Interceptação preditiva (viaturas).
		interceptSpeed: 22,
		leadTimeMax: 2.4,

		// Policiais a pé.
		officerRadius: 0.4,
		officerPatrolSpeed: 1.5,
		officerChaseSpeed: 5.8,        // (a pé, perseguindo: um pouco mais lento que o jogador correndo — dá para fugir enquanto houver fôlego)
		officerWanderRadius: 30,
		closeNoEscape: 16,     // Policial a menos disso (u), mesmo sem te ver (atrás de parede), PAUSA a contagem da fuga.
		movingSpread: 14,      // Atirar num carro em movimento: o erro cresce 1× a cada isto de m/s (até 2,4×).
		maxChasers: 1.5,       // Viaturas de reforço no máximo = viaturas do nível × isto (o resto patrulha).
		// 1★ (delito leve): a polícia é bem menos punitiva — corre menos, precisa chegar mais perto para prender, perde você mais fácil
		// atrás de paredes; preso com 1★ = multa pequena, armas NÃO são confiscadas e você é liberado em poucas horas.
		oneStar: { bustRange: 4.5, closeNoEscape: 14, chaseMul: 0.8, fine: 0.15, keepWeapons: true, hours: [3, 5] },
		fineBase: 0.5, finePerStar: 0.1,    // Multa ao ser preso: fração do dinheiro = fineBase + finePerStar × ★ (máx. 0,75).
	},
};

// Saved choices that shape Config before the game reads it (the graphics preset itself: src/core/Graphics.js, loaded right after).
(function applySavedChoices() {
	try { localStorage.removeItem('dm_quality'); } catch (e) { /* sem storage */ }      // (o AutoQuality antigo gravava o perfil leve: não vale mais)
	try { const s = JSON.parse(localStorage.getItem('dm_settings') || '{}'); if (typeof s.cars3d === 'boolean') Config.art.cars3d = s.cars3d; } catch (e) { /* sem storage */ }
})();
