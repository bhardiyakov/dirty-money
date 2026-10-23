// ============================================================================
// Bikes — bicicletas e motos.
//
// São `Vehicle`s normais (corpo físico arcade, IA de trânsito, roubáveis, pilotáveis). O desenho do VEÍCULO vem do atlas dos carros
// (CarArt: modelos 'moto' e 'bicicleta', e as versões caídas '*_caida'), repintável como um carro; o PILOTO é o sprite do personagem
// por cima (RiderActor), com os clipes do rig:
//   ride_bike   pedalando (os pés giram com a velocidade)
//   ride_moto   pilotando: 7 degraus de inclinação (±28,6°, o corpo todo deitando com a moto; 64 direções), escolhidos pela física
//               da curva (Vehicle._animateBike → RiderActor.setLean: contínuo, + = deitado para a direita)
// Estacionada = só o veículo; caída = o desenho de lado (piloto arremessado numa batida).
// A "folha de veículo" abaixo (BikeSheet) só adapta a interface que o Vehicle espera.
//
// Motos em 3D (CarArt3D, assets/cars/veiculos3d.js): a de rua ('moto', a do motoboy — com baú no entregador), a scooter, a de trilha,
// a esportiva e a custom de viagem — e a bicicleta. Sem o arquivo 3D, as motos usam o desenho da moto do atlas (e a bicicleta, o dela).
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
        this.seat = CarArt.scaledSeat(Bikes.SEAT[Bikes.base(kind)]);
        this.scale = Bikes.SCALE[Bikes.base(kind)];
    }
    getClip() { return this.cs.getClip(this.clipName); }
}

const Bikes = {
    // Desempenho e tamanho. fire: pega fogo e explode quando a vida zera (bicicleta só quebra) | blast: escala da explosão.
    // t100 = 0–100 km/h em s (a arrancada, como nos carros: Vehicle.drive — sem ele, power/mass dava ~16 m/s² na moto de rua e ~29 na
    // esportiva, um foguete); brakeA = desaceleração máxima no freio (m/s²; power/mass passava de 3 g). A bicicleta não chega a 100:
    // o t100 dela só dá a arrancada de quem pedala (~1,5 m/s²).
    MODELS: {
        moto: {
            name: 'Moto', model: 'Rider 250', len: 2.8, wid: 0.9, mass: 220, power: 3600, maxSpeed: 31, t100: 7.0, brakeA: 9, turn: 2.8, cruise: 1.2, weight: 1, hp: 45,
            bike: 'moto', bodyH: 0.5, noCabin: true, fire: true, blast: 0.55, open: true,
            lamps: { x: 0.0, zF: 0.95, zR: -1.0 },
        },
        moto_scooter: {
            name: 'Scooter', model: 'Urban 160', len: 2.6, wid: 0.85, mass: 150, power: 2600, maxSpeed: 24, t100: 10.5, brakeA: 8, turn: 3.0, cruise: 1.0, weight: 1, hp: 38,
            bike: 'moto', bodyH: 0.5, noCabin: true, fire: true, blast: 0.5, open: true,
            lamps: { x: 0.0, zF: 0.9, zR: -0.95 },
        },
        moto_trilha: {
            name: 'Moto de trilha', model: 'Trilheira 300', len: 2.9, wid: 0.95, mass: 180, power: 3500, maxSpeed: 30, t100: 6.8, brakeA: 8.5, turn: 3.0, cruise: 1.2, weight: 1, hp: 48,
            bike: 'moto', bodyH: 0.6, noCabin: true, fire: true, blast: 0.55, open: true,
            lamps: { x: 0.0, zF: 1.0, zR: -1.05 },
        },
        moto_esportiva: {
            name: 'Esportiva', model: 'Furia 1000RR', len: 2.9, wid: 0.85, mass: 200, power: 5800, maxSpeed: 44, t100: 3.2, brakeA: 10.5, turn: 2.6, cruise: 1.3, weight: 1, hp: 45,
            bike: 'moto', bodyH: 0.5, noCabin: true, fire: true, blast: 0.6, open: true,
            lamps: { x: 0.0, zF: 1.0, zR: -1.05 },
        },
        moto_custom: {
            name: 'Custom', model: 'Estradeira 1800', len: 3.3, wid: 1.05, mass: 330, power: 4800, maxSpeed: 34, t100: 5.0, brakeA: 9, turn: 2.3, cruise: 1.1, weight: 1, hp: 62,
            bike: 'moto', bodyH: 0.5, noCabin: true, fire: true, blast: 0.65, open: true,
            lamps: { x: 0.0, zF: 1.15, zR: -1.2 },
        },
        bicycle: {
            name: 'Bicicleta', model: 'Urbana BMX', len: 2.6, wid: 0.7, mass: 90, power: 380, maxSpeed: 8, t100: 18, brakeA: 5, turn: 2.3, cruise: 0.45, weight: 1, hp: 18,
            bike: 'bike', bodyH: 0.5, noCabin: true, fire: false, noExhaust: true, open: true,
            lamps: { x: 0.0, zF: 0.8, zR: -0.85 },
        },
    },

    // Desenho do veículo (modelo 3D; sem ele, o do atlas dos carros), e onde fica a origem do piloto (m: z = frente, x = direita) — as
    // mãos do rig no guidão. Toda moto que não é a 'moto' cai na tabela da 'moto' (base) para o banco, a escala e as cores.
    MOTOS: ['moto', 'moto_scooter', 'moto_trilha', 'moto_esportiva', 'moto_custom'],
    base(kind) { return kind === 'bicycle' ? 'bicycle' : 'moto'; },
    art3d(id) { return typeof CarArt3D !== 'undefined' && CarArt3D.has(id); },
    get ART() {
        const A = { moto: 'moto', bicycle: 'bicicleta' };
        for (const k of this.MOTOS) A[k] = this.art3d(k) ? k : 'moto';
        return A;
    },
    // Entregador: a moto de rua com o baú (3D) — no atlas, a mesma moto.
    courierArt() { return this.art3d('moto_entrega') ? 'moto_entrega' : 'moto'; },
    // Motos que circulam (peso de cada modelo no trânsito); só as que existem em 3D.
    pickMoto(r = Math.random()) {
        const W = [['moto', 5], ['moto_scooter', 3], ['moto_trilha', 1.5], ['moto_esportiva', 1.2], ['moto_custom', 1]].filter(([k]) => k === 'moto' || this.art3d(k));
        let t = r * W.reduce((a, w) => a + w[1], 0);
        for (const [k, w] of W) if ((t -= w) <= 0) return k;
        return 'moto';
    },
    // Piloto 2,5D (NpcArt): a origem é o BANCO do desenho (moto: a frente do banco; bicicleta: o selim), em m do desenho × SCALE —
    // as mãos e pés das animações ride_* já vêm nas manoplas/pedais (NpcGenAnims.RIDE). Boneco antigo: as mãos do rig no guidão.
    get SEAT() {
        if (Bikes.npc()) return { moto: { z: -0.129 * 0.9, x: 0 }, bicycle: { z: -0.271 * 0.9, x: 0 } };
        return { moto: { z: -0.04, x: 0 }, bicycle: { z: -0.12, x: 0 } };
    },
    npc() { return typeof NpcArt !== 'undefined' && NpcArt.available(); },
    // O piloto do rig é "chibi" (cabeça e ombros grandes): o veículo é desenhado um pouco maior que o real para aparecer em volta dele.
    // O piloto é desenhado em Config.art.charScale: a moto acompanha, para o guidão continuar nas mãos dele.
    // Piloto 2,5D: adulto na escala dos veículos (Config.art.npcPpu) — 0,9 (× Config.vehicle.scale) casa com as animações ride_*.
    get SCALE() { if (Bikes.npc()) return { moto: 0.9, bicycle: 0.9 }; const k = Config.art.charScale || 1; return { moto: 1.18 * k, bicycle: 1.12 * k }; },
    // Cores de fábrica (linhas de CarSheet.PAINTS). Entregador: vermelha (com o baú vermelho).
    PAINTS: { moto: [0, 1, 5, 4, 7, 8, 9, 26, 29, 33, 20, 28], bicycle: [1, 0, 3, 7, 24, 34, 36, 25, 4, 5, 30] },
    COURIER_PAINT: 0,

    art() { return typeof CarArt !== 'undefined' && CarArt.available() && !!CarArt.model('moto'); },
    paintOf(kind, id) { const P = this.PAINTS[this.base(kind)]; return P[(id * 7 + 3) % P.length]; },

    // Folha de veículo (cacheada) para `kind` ('moto'|'bicycle') no estado `state` ('ride'|'park'|'fallen').
    sheet(sprites, kind, state, sheetName = 'rider') {
        const cache = sprites._bikeSheets || (sprites._bikeSheets = {});
        const key = kind + ':' + state + ':' + sheetName;
        if (!cache[key]) {
            const spec = Object.assign({ id: kind }, CarArt.scaledSpec(Bikes.MODELS[kind]));         // (medidas em Config.vehicle.scale)
            const clip = `${state}_${spec.bike}`;
            cache[key] = new BikeSheet(sprites.sheets[sheetName], clip, spec, kind);
            if (sheetName === 'courier') cache[key].vehModel = Bikes.courierArt();
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
        const b = this.base(kind);
        const a = new RiderActor(game.scene, this.ART[kind], this.paintOf(kind, Math.floor(Math.random() * 97)), CarArt.scaledSeat(this.SEAT[b]), this.SCALE[b]);
        a.setRider(variant, game.sprites.sheets.rider, kind === 'moto' ? 'ride_moto' : 'ride_bike');
        return a;
    },
};
