// ============================================================================
// Bikes — bicicletas e motos.
//
// São `Vehicle`s normais (corpo físico arcade, IA de trânsito, roubáveis, pilotáveis), mas o sprite é o PILOTO
// + o veículo desenhados juntos pela folha `rider` do rig (CharacterRig: clipes ride_*, park_*, fallen_*):
//   ride    andando: bicicleta com pedais girando (acompanham a velocidade); moto inclinando nas curvas
//   park    estacionada, sem piloto (a cor do quadro vem da variante de paleta)
//   fallen  caída de lado (piloto arremessado numa batida)
// A "folha de veículo" abaixo (BikeSheet) só adapta a interface que o Vehicle/SpriteActor esperam.
// ============================================================================

class BikeSheet {
    constructor(sheet, clipName, spec, kind) {
        this.cs = sheet;                 // CharacterSheet `rider`
        this.atlasName = sheet.name;     // (atlas vetorial: tamanho do quad girado)
        this.clipName = clipName;
        this.spec = spec;
        this.modelId = kind;
        this.dirs = sheet.dirs;
        this.frame = sheet.frame;
        this.lib = null;                 // SpriteLibrary (para trocar de estado: andando/estacionada/caída)
    }
    getClip() { return this.cs.getClip(this.clipName); }
}

const Bikes = {
    // Desempenho e tamanho. fire: pega fogo e explode quando a vida zera (bicicleta só quebra) | blast: escala da explosão.
    MODELS: {
        moto: {
            name: 'Moto', model: 'Rider 250', len: 2.8, wid: 0.9, mass: 220, power: 3600, maxSpeed: 31, turn: 2.8, cruise: 1.2, weight: 1, hp: 45,
            bike: 'moto', bodyH: 0.5, noCabin: true, fire: true, blast: 0.55, open: true,
            lamps: { x: 0.0, zF: 1.35, zR: -1.4 },
        },
        bicycle: {
            name: 'Bicicleta', model: 'Urbana BMX', len: 2.6, wid: 0.7, mass: 90, power: 380, maxSpeed: 8, turn: 2.3, cruise: 0.45, weight: 1, hp: 18,
            bike: 'bike', bodyH: 0.5, noCabin: true, fire: false, noExhaust: true, open: true,
            lamps: { x: 0.0, zF: 1.15, zR: -1.2 },
        },
    },

    // Folha de veículo (cacheada) para `kind` ('moto'|'bicycle') no estado `state` ('ride'|'park'|'fallen').
    sheet(sprites, kind, state, sheetName = 'rider') {
        const cache = sprites._bikeSheets || (sprites._bikeSheets = {});
        const key = kind + ':' + state + ':' + sheetName;
        if (!cache[key]) {
            const spec = Object.assign({ id: kind }, Bikes.MODELS[kind]);
            const clip = `${state}_${spec.bike}`;
            cache[key] = new BikeSheet(sprites.sheets[sheetName], clip, spec, kind);
            cache[key].lib = sprites;
        }
        return cache[key];
    },
};
