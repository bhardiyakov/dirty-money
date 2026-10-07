// ============================================================================
// VehicleManager — registro de TODOS os carros civis (circulando, estacionados,
// abandonados) e busca do mais próximo para o roubo. Quem cria e move os carros é
// o TrafficManager. Os barcos (BoatManager) ficam em `boats`, à parte do trânsito.
// ============================================================================

class VehicleManager {
    constructor(scene, physics, shadowGenerator, carLib) {
        this.scene = scene;
        this.physics = physics;
        this.shadowGenerator = shadowGenerator;
        this.carLib = carLib;
        this.vehicles = [];
        this.boats = [];
    }

    // Veículo mais próximo de `pos` dentro de `range`, ou null. Carro: distância ao centro; barco: distância ao casco
    // (o cais encosta na lateral, e o barco tem até 9 u de comprimento).
    nearest(pos, range) {
        let best = null;
        let bestDist = range;
        for (const car of this.vehicles) {
            if (car.destroyed && !car.canRaise) continue;      // pegando fogo ou carcaça: não dá para roubar (moto caída: dá para levantar)
            const d = BABYLON.Vector3.Distance(pos, car.position);
            if (d < bestDist) { bestDist = d; best = car; }
        }
        for (const boat of this.boats) {
            if (boat.destroyed) continue;
            const d = boat.distTo(pos);
            if (d < bestDist) { bestDist = d; best = boat; }
        }
        return best;
    }
}
