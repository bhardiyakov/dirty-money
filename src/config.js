// ============================================================================
// DIRTY MONEY - Configuração central (tunables)
// Um único lugar para ajustar sensação de jogo, câmera e mundo.
// ============================================================================

// Dinheiro do jogo é em reais: brl(1500) → "R$ 1.500" (use em TODA interface que mostra valores).
function brl(n) { return "R$ " + Math.round(n).toLocaleString("pt-BR"); }

const Config = {
    // Desempenho (navegador, celular, Capacitor/Tauri): teto de quadros por segundo do jogo inteiro (lógica + render).
    // `lite` (celular, tablet ou aparelho fraco) liga o perfil leve: mapa de sombras menor, menos pedestres/carros e menos colisores vivos.
    // O AutoQuality (core/AutoQuality.js) ainda pode descer mais um nível em tempo real se o aparelho não aguentar os 30 quadros.
    perf: { fpsCap: 30, lite: false, shadowSize: 2048, colliderRadius: 220, dprCap: 2 },

    // Pixel art: tudo (texturas do mundo e sprites) é desenhado nesta densidade,
    // e o jogo é renderizado numa resolução interna baixa e ampliado sem suavizar.
    art: {
        ppu: 20,               // pixels de textura por unidade de mundo (1u ≈ 1m).
        pixelate: true,        // renderiza em baixa resolução + upscale "crocante".
        internalHeight: (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ? 440 : 560,   // altura interna alvo (px) quando pixelate = true (celular: menor, mais leve).
    },

    camera: {
        // "Bússola": norte sempre pra cima, sempre centrada no alvo. Perspectiva leve
        // (câmera alta + FOV estreito): prédios mostram um pouco das laterais, mas como o
        // ponto de fuga fica EM CIMA do alvo, os telhados se projetam para fora e nunca
        // o escondem.
        height: 150,           // altura da câmera (u). Maior = perspectiva mais sutil.
        viewHalf: 15,          // metade da altura visível no chão (zoom padrão).
        minView: 8,            // zoom máximo (aproximado).
        maxView: 34,           // zoom mínimo (afastado).
        zoomSpeed: 22,         // velocidade de zoom por tecla (unidades/s).
        wheelStep: 1.5,        // passo de zoom por "tick" da roda do mouse.
        followLerp: 60,        // suavidade do acompanhamento (alto = praticamente colada).
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
        maxSpeed: 9,           // Velocidade de caminhada (unidades/s).
        sprintSpeed: 16,       // Velocidade de corrida (Shift).
        accel: 12,             // Taxa de aproximação da velocidade alvo (maior = mais responsivo).
        turnLerp: 16,          // Velocidade de giro do corpo em direção ao movimento.
        radius: 0.55,          // Raio de colisão contra prédios.
    },

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

        wanderSpeed: 3.5,      // Velocidade andando (unidades/s).
        jogSpeed: 5.4,         // Velocidade de quem corre na orla.
        swimSpeed: 2.4,        // Velocidade nadando (na água rasa, anda devagar).
        mix: { jog: 0.17, sun: 0.14, swim: 0.12 },   // fração dos pedestres que correm na orla, tomam sol e nadam (o resto perambula).
        sunTime: [40, 110],    // Segundos deitado ao sol.
        swimTime: [45, 110],   // Segundos na água.
        fleeSpeed: 8,          // Velocidade em pânico.

        wanderRadius: 30,      // Raio para sortear destinos de perambulação.
        reachDist: 2,          // Distância p/ considerar "chegou" ao destino.
        wanderTime: 7,         // Tempo máx. perambulando até re-sortear destino.

        panicRadius: 13,       // Raio de contágio do pânico numa tentativa de roubo.
        robRange: 2.5,         // Alcance para roubar de fato o NPC mais próximo.
        fleeTime: 5,           // Tempo mínimo fugindo antes de voltar a perambular.

        // Inteligência de pedestre.
        hurrySpeed: 5.5,       // Velocidade ao terminar de atravessar com o sinal já fechando.
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

    // Assalto (E, com arma na mão: a vítima se rende e entrega tudo) e furto (C: carteirada, sem arma).
    robbery: {
        holdRange: 5,          // Alcance para apontar a arma e render o pedestre mais próximo.
        holdLeash: 7.5,        // Se você se afastar mais que isto da vítima, o assalto é cancelado.
        holdTime: 4.5,         // Segundos que a vítima leva para entregar tudo (você precisa manter a mira).
        holdLoot: [90, 340],   // Dinheiro do assalto, mín–máx.
        crimeWindow: 15,       // Janela de flagrante do assalto (s): bem maior que a de um crime comum (police.crimeVisibleTime).
        policeAlertRadius: 55, // Viaturas/policiais neste raio ouvem o chamado e vão ao local.
        witnessRadius: 14,     // Testemunhas (pedestres que veem) até esta distância: fogem e chamam a polícia (+1★ ao fim).
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
        pedFlash: 3.5,         // Últimos segundos do verde em que o pedestre NÃO deve começar a atravessar.
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
        turnRate: 2.0,         // Guinada máx. (rad/s) em velocidade plena.
        turnSpeedRef: 6,       // Velocidade (m/s) para direção com autoridade total.
        grip: 10,              // Aderência lateral: maior = mata a derrapagem mais rápido.
        linearDamping: 0.1,    // Arrasto do chassi.
        brakeDrag: 8,          // Freio-motor (m/s²) quando solta o acelerador.
        waterDrag: 6,          // Atola o carro fora da terra (não atravessa água).
        hijackRange: 4,        // Distância do player ao carro para roubá-lo.
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
    water: { wadeDepth: 10, maxDepth: 230 },

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
        minDv: 2.6,            // Queda brusca de velocidade (m/s) abaixo da qual não é batida.
        dmgPerMs: 3.4,         // Dano ao carro por m/s acima de minDv (bater a 15 m/s ≈ 42 de dano).
        cooldown: 0.3,         // s entre danos de batida do mesmo carro.
        bulletMul: 0.35,       // Fração do dano da bala que o carro leva.
        runOverSpeed: 3.0,     // Velocidade (m/s) a partir da qual o carro machuca quem está na frente.
        runOverDmg: 7.5,       // Dano em quem é atropelado por m/s acima de runOverSpeed (8 m/s ≈ 38; 17 m/s ≈ 105).
        smokeBelow: 0.35,      // Fração de vida abaixo da qual sai fumaça.
        burnTime: [4.5, 6.5],  // Segundos pegando fogo antes de explodir.
        explosionR: 9,         // Raio da explosão (u).
        wreckLife: 45,         // Segundos até a carcaça poder sumir (fora da tela).
    },

    wanted: {
        maxLevel: 5,
        escalateEvery: 6,      // s mínimos entre estrelas por crimes comuns (matar policial sobe na hora)
        levels: [
            null,
            { sight: 38, lose: 8,  radio: false, dispatchR: 60,  cars: 1, heli: false, swat: 0, army: 0, blocks: 0 },
            { sight: 52, lose: 16, radio: true,  dispatchR: 140, cars: 3, heli: true,  swat: 0, army: 0, blocks: 0 },
            { sight: 64, lose: 24, radio: true,  dispatchR: 190, cars: 4, heli: true,  swat: 1, army: 0, blocks: 2 },
            { sight: 78, lose: 32, radio: true,  dispatchR: 260, cars: 6, heli: true,  swat: 2, army: 0, blocks: 4 },
            { sight: 96, lose: 45, radio: true,  dispatchR: 999, cars: 8, heli: true,  swat: 3, army: 2, blocks: 7 },
        ],
    },

    // Helicóptero da polícia (3★+): enxerga por cima dos prédios, holofote, metralhadora a partir de `fireFrom`★.
    heli: {
        hp: 380,               // Dá para derrubá-lo a tiros (pistola ≈ 16 tiros).
        speed: 24,             // m/s: quase o máximo de um carro, então fugir de carro na reta é possível.
        accel: 15,
        alt: 14,               // Altura de voo.
        sight: 100,            // Enxerga o jogador (sem linha de visada) até esta distância.
        orbit: 7,              // Raio da órbita sobre o jogador.
        fireFrom: 4,           // ★ a partir das quais ele atira.
        fireRange: 46,
        spawnDist: 170,        // Entra voando de tão longe.
        delay: 3,              // Segundos entre chegar ao nível e o helicóptero aparecer.
        cooldown: 30,          // Segundos até vir outro depois de derrubado.
    },

    police: {
        // Patrulha sempre presente no mapa.
        patrolCars: 5,
        patrolOfficers: 8,

        shootFromStars: 2,     // A partir de quantas ★ a polícia atira mesmo sem você atirar (99 = nunca: só reage a tiros do jogador).
        hearMemory: 22,        // Quanto tempo (s) quem ouviu um tiro continua indo ao local.
        weaponsFreeTime: 24,   // Segundos de "armas liberadas" após um tiro do jogador.
        shootRange: 44,        // Alcance em que policiais (a pé e nas viaturas) atiram com armas liberadas.
        hearRadius: 150,       // Quem ouve um tiro do jogador nesse raio vira perseguidor (todos atiram).
        maxOfficers: 42,       // Teto de policiais a pé (patrulha + reforços que descem das viaturas).
        sightRange: 55,        // Alcance em que a polícia te "vê" (gera/mantém procurado).
        crimeVisibleTime: 8,   // Janela após o crime em que ser visto gera procurado.

        bustRange: 8,          // Distância da polícia que conta para a prisão.
        bustTime: 1.2,         // Segundos colado na polícia para ser preso.

        // Interceptação preditiva (viaturas).
        interceptSpeed: 22,
        leadTimeMax: 2.4,

        // Policiais a pé.
        officerRadius: 0.4,
        officerPatrolSpeed: 2.6,
        officerChaseSpeed: 11,
        officerWanderRadius: 30,
        closeNoEscape: 32,     // Policial a menos disso (u) te impede de escapar mesmo sem linha de visada (atrás de parede).
        fineBase: 0.5, finePerStar: 0.1,    // Multa ao ser preso: fração do dinheiro = fineBase + finePerStar × ★ (máx. 0,75).
    },
};

// Perfil de desempenho: detecta aparelho de toque / pouca memória / poucos núcleos e enxuga o mundo vivo. `?lite` força, `?full` desliga.
(function applyPerfProfile() {
    const q = typeof location !== 'undefined' ? location.search : '';
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const nav = typeof navigator !== 'undefined' ? navigator : {};
    const weak = (nav.deviceMemory && nav.deviceMemory <= 4) || (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4);
    let saved = null;
    try { saved = localStorage.getItem('dm_quality'); } catch (e) { /* sem storage */ }
    const lite = q.includes('lite') || (!q.includes('full') && (coarse || weak || saved === 'lite'));
    if (!lite) return;
    const P = Config.perf;
    P.lite = true; P.shadowSize = 1024; P.colliderRadius = 190; P.dprCap = 1.5;
    Config.npc.count = 48;
    Config.traffic.count = 18; Config.traffic.parked = 8; Config.traffic.motos = 2; Config.traffic.motosParked = 2; Config.traffic.bicycles = 2; Config.traffic.bicyclesParked = 2;
    Config.traffic.spawnMax = 150; Config.traffic.recycleDist = 185;
    Config.npc.recycleDist = 200;
})();
