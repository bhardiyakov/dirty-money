// ============================================================================
// MapData — a cidade em vetores (coordenadas em "pixels de mapa", 1500x820).
// Reconstrução estilizada do mapa de Liberty City e arredores.
// É a FONTE ÚNICA: o chão 3D e o GPS leem exatamente estes mesmos dados.
//
// Conversão mapa<->mundo (worldScale = unidades por pixel):
//   worldX = (px - 750) * s        px = worldX / s + 750
//   worldZ = (410 - py) * s        py = 410 - worldZ / s
// (+Z = norte = topo da imagem)
// ============================================================================

const MapData = {
    size: { w: 1500, h: 820 },

    colors: {
        ocean: '#39617d',
        water: '#4a7390',
        urban: '#c4c8cd',
        urbanEdge: '#9aa0a6',
        forest: '#86a06a',
        forestEdge: '#6f8a55',
        park: '#9cbb78',
        industrial: '#b0aa9c',
        beach: '#e6dca6',
        street: '#e9ecef',
        avenue: '#f1c153',
        hwy: '#e4813a',
        hwyCasing: '#a85f27',
        runway: '#5a5f66',
        runwayLine: '#e8e8e8',
        labelDark: '#2b2f33',
        labelHalo: 'rgba(255,255,255,0.75)',
        waterLabel: 'rgba(230,240,248,0.8)',
    },

    // Massas de terra verdes (montanhas/florestas do entorno) — desenhadas primeiro.
    forests: [
        { poly: [[0, 0], [470, 0], [360, 150], [150, 300], [0, 360]] },               // NW (Acter / Le Havre)
        { poly: [[0, 390], [170, 300], [330, 470], [250, 700], [0, 780], [0, 390]] }, // W-S (Normandy)
        { poly: [[1060, 0], [1500, 0], [1500, 300], [1280, 250], [1100, 110]] },      // NE (Meadows)
        { poly: [[1300, 300], [1500, 330], [1500, 640], [1340, 610], [1285, 450]] },  // E (Francis/Meadows)
        { poly: [[1180, 650], [1500, 700], [1500, 820], [1150, 820], [1120, 720]] },  // SE corner
    ],

    // Ilhas urbanas (cinza). `angle` inclina o grid de ruas; `grid` liga o grid.
    lands: [
        { name: 'Alderney', kind: 'urban', grid: true, angle: 0.08,
          poly: [[300, 150], [440, 175], [450, 360], [410, 520], [300, 625], [205, 560], [240, 360], [262, 235]] },
        { name: 'Algonquin', kind: 'urban', grid: true, angle: -0.12,
          poly: [[500, 120], [625, 150], [658, 320], [642, 480], [585, 632], [520, 658], [486, 520], [470, 340], [486, 200]] },
        { name: 'Dukes', kind: 'urban', grid: true, angle: 0.05,
          poly: [[790, 100], [1015, 122], [1038, 282], [832, 300], [786, 190]] },
        { name: 'Broker', kind: 'urban', grid: true, angle: 0.05,
          poly: [[800, 332], [1012, 322], [1022, 492], [905, 566], [800, 530], [776, 422]] },
        { name: 'Bohan', kind: 'urban', grid: true, angle: 0.0,
          poly: [[1120, 340], [1255, 360], [1268, 470], [1180, 522], [1095, 460]] },
        { name: 'Outlook', kind: 'urban', grid: true, angle: 0.1,
          poly: [[1040, 540], [1205, 560], [1218, 672], [1092, 692], [1038, 612]] },
        { name: 'Port Tudor', kind: 'industrial', grid: true, angle: 0.0,
          poly: [[210, 575], [360, 605], [338, 728], [182, 700]] },
    ],

    // Parques dentro das ilhas (verde por cima do urbano).
    parks: [
        { poly: [[545, 250], [605, 258], [598, 430], [540, 422]] }, // Middle Park (Algonquin)
        { poly: [[300, 300], [360, 308], [352, 410], [296, 402]] }, // Parque em Alderney
        { poly: [[860, 370], [920, 376], [914, 452], [856, 446]] }, // Parque em Broker
    ],

    // Praias (areia) em bordas de ilha voltadas ao oceano.
    beaches: [
        { poly: [[1218, 560], [1250, 575], [1232, 672], [1205, 672]] }, // Firefly Beach (Outlook)
        { poly: [[1022, 360], [1052, 372], [1040, 470], [1016, 468]] }, // Broker leste
    ],

    // Aeroporto Francis International (leste, perto de Dukes).
    airport: {
        poly: [[1075, 120], [1235, 140], [1222, 250], [1068, 228]],
        runways: [
            [1088, 150, 1215, 170],
            [1095, 200, 1205, 222],
        ],
    },

    // Rodovias (laranja). Trechos sobre água = pontes.
    highways: [
        { path: [[300, 360], [470, 362], [540, 340], [565, 250], [575, 175], [690, 165], [820, 180], [1010, 205]] },
        { path: [[560, 150], [560, 320], [562, 500], [585, 632]] },
        { path: [[560, 360], [645, 430], [800, 432], [1012, 430], [1125, 420]] },
        { path: [[1012, 430], [1180, 500], [1150, 560], [1092, 600]] },
        { path: [[585, 540], [660, 560], [880, 566], [1045, 600], [1150, 615]] },
        { path: [[300, 520], [300, 620], [280, 700]] },
    ],

    // Avenidas principais (amarelo) — eixos dentro das ilhas.
    avenues: [
        { path: [[520, 170], [600, 600]] },
        { path: [[500, 340], [650, 360]] },
        { path: [[320, 200], [400, 560]] },
        { path: [[820, 200], [1000, 260]] },
        { path: [[810, 360], [1010, 470]] },
    ],

    // Rótulos.
    labels: [
        { text: 'LIBERTY CITY', x: 548, y: 330, size: 22, kind: 'city' },
        { text: 'Algonquin', x: 556, y: 400, size: 16, kind: 'district' },
        { text: 'Alderney', x: 300, y: 300, size: 16, kind: 'district' },
        { text: 'Dukes', x: 910, y: 150, size: 16, kind: 'district' },
        { text: 'Broker', x: 890, y: 430, size: 16, kind: 'district' },
        { text: 'Bohan', x: 1180, y: 430, size: 15, kind: 'district' },
        { text: 'Outlook', x: 1120, y: 630, size: 15, kind: 'district' },
        { text: 'Port Tudor', x: 270, y: 665, size: 12, kind: 'small' },
        { text: 'Francis Intl', x: 1150, y: 195, size: 11, kind: 'small' },
        { text: 'West River', x: 470, y: 470, size: 13, kind: 'water' },
        { text: 'Broker Bay', x: 1070, y: 520, size: 13, kind: 'water' },
        { text: 'ATLANTIC OCEAN', x: 800, y: 760, size: 18, kind: 'water' },
    ],
};
