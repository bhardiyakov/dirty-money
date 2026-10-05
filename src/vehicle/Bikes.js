// ============================================================================
// Bikes — bicicletas e motos.
//
// São `Vehicle`s normais (corpo físico arcade, IA de trânsito, roubáveis, pilotáveis). O desenho do VEÍCULO vem do atlas dos carros
// (CarArt: modelos 'moto' e 'bicicleta', e as versões caídas '*_caida'), repintável como um carro; o PILOTO é o sprite do personagem
// por cima (RiderActor), com os clipes do rig:
//   ride_bike   pedalando (os pés giram com a velocidade)
//   ride_moto   pilotando: 3 quadros de inclinação pelo guidão
// Estacionada = só o veículo; caída = o desenho de lado (piloto arremessado numa batida).
// A "folha de veículo" abaixo (BikeSheet) só adapta a interface que o Vehicle espera.
// ============================================================================

class BikeSheet {
    constructor(sheet, clipName, spec, kind) {
        this.cs = sheet;                 // CharacterSheet do piloto (`rider` ou `courier`)
        this.atlasName = sheet.name;
        this.clipName = clipName;
        this.spec = spec;
        this.modelId = kind;
        this.dirs = sheet.dirs;
        this.frame = sheet.frame;
        this.lib = null;                 // SpriteLibrary (folhas dos pilotos)
        this.art = Bikes.art() ? 'rider' : false;      // o Vehicle cria um RiderActor (veículo do atlas + piloto por cima)
        this.vehModel = Bikes.ART[kind];
        this.seat = CarArt.scaledSeat(Bikes.SEAT[kind]);
        this.scale = Bikes.SCALE[kind];
    }
    getClip() { return this.cs.getClip(this.clipName); }
}

const Bikes = {
    // Desempenho e tamanho. fire: pega fogo e explode quando a vida zera (bicicleta só quebra) | blast: escala da explosão.
    MODELS: {
        moto: {
            name: 'Moto', model: 'Rider 250', len: 2.8, wid: 0.9, mass: 220, power: 3600, maxSpeed: 31, turn: 2.8, cruise: 1.2, weight: 1, hp: 45,
            bike: 'moto', bodyH: 0.5, noCabin: true, fire: true, blast: 0.55, open: true,
            lamps: { x: 0.0, zF: 0.95, zR: -1.0 },
        },
        bicycle: {
            name: 'Bicicleta', model: 'Urbana BMX', len: 2.6, wid: 0.7, mass: 90, power: 380, maxSpeed: 8, turn: 2.3, cruise: 0.45, weight: 1, hp: 18,
            bike: 'bike', bodyH: 0.5, noCabin: true, fire: false, noExhaust: true, open: true,
            lamps: { x: 0.0, zF: 0.8, zR: -0.85 },
        },
    },

    // Desenho no atlas dos carros, e onde fica a origem do piloto (m: z = frente, x = direita) — as mãos do rig no guidão.
    ART: { moto: 'moto', bicycle: 'bicicleta' },
    SEAT: { moto: { z: -0.04, x: 0 }, bicycle: { z: -0.12, x: 0 } },
    // O piloto do rig é "chibi" (cabeça e ombros grandes): o veículo é desenhado um pouco maior que o real para aparecer em volta dele.
    // O piloto é desenhado em Config.art.charScale: a moto acompanha, para o guidão continuar nas mãos dele.
    get SCALE() { const k = Config.art.charScale || 1; return { moto: 1.18 * k, bicycle: 1.12 * k }; },
    // Cores de fábrica (linhas de CarSheet.PAINTS). Entregador: vermelha (com o baú vermelho).
    PAINTS: { moto: [0, 1, 5, 4, 7, 8, 9, 26, 29, 33, 20, 28], bicycle: [1, 0, 3, 7, 24, 34, 36, 25, 4, 5, 30] },
    COURIER_PAINT: 0,

    art() { return typeof CarArt !== 'undefined' && CarArt.available() && !!CarArt.model('moto'); },
    paintOf(kind, id) { const P = this.PAINTS[kind] || this.PAINTS.moto; return P[(id * 7 + 3) % P.length]; },

    // Folha de veículo (cacheada) para `kind` ('moto'|'bicycle') no estado `state` ('ride'|'park'|'fallen').
    sheet(sprites, kind, state, sheetName = 'rider') {
        const cache = sprites._bikeSheets || (sprites._bikeSheets = {});
        const key = kind + ':' + state + ':' + sheetName;
        if (!cache[key]) {
            const spec = Object.assign({ id: kind }, CarArt.scaledSpec(Bikes.MODELS[kind]));         // (medidas em Config.vehicle.scale)
            const clip = `${state}_${spec.bike}`;
            cache[key] = new BikeSheet(sprites.sheets[sheetName], clip, spec, kind);
            cache[key].lib = sprites;
        }
        return cache[key];
    },

    // Moto "de enfeite" com piloto (pontos de mototáxi, corridas): sem física. variant = piloto (paleta dos personagens).
    actor(game, kind, variant, name = 'moto') {
        if (!this.art()) {                                  // (sem o atlas: a folha antiga do rig, piloto + moto num sprite)
            const a = new SpriteActor(game.scene, this.sheet(game.sprites, kind, 'ride'), variant, name);
            a.play('static');
            a.setY = (y) => { a.mesh.position.y = y; };
            return a;
        }
        const a = new RiderActor(game.scene, this.ART[kind], this.paintOf(kind, Math.floor(Math.random() * 97)), CarArt.scaledSeat(this.SEAT[kind]), this.SCALE[kind]);
        a.setRider(variant, game.sprites.sheets.rider, kind === 'moto' ? 'ride_moto' : 'ride_bike');
        return a;
    },
};
