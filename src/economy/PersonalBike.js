// ============================================================================
// PersonalBike — a BICICLETA do jogador: o veículo dele desde o começo, fixo, sempre à mão. Fica estacionada no quintal da safe
// house, ao lado da porta (aberta: F e sobe, sem roubo nem crime). Como os carros da garagem (Garage), é um registro que só vira
// veículo de verdade com o jogador por perto:
//   • largada longe (ou o jogador foi para longe dela) → some e VOLTA para o quintal (aparece lá quando ele se aproxima de casa);
//   • quebrada (sem conserto) → uma nova está no quintal RESPAWN s depois.
// O trânsito não a recicla (keep) e o radar a mostra em azul-claro.
// ============================================================================

const PersonalBike = {
    SPAWN_R: 130, DESPAWN_R: 190, RETURN_R: 160, RESPAWN: 20,
    PAINT: 3,                 // cor do quadro (linha de CarSheet.PAINTS: azul)
    game: null, bike: null, _t: 0, _wait: 0,

    init(game) { this.game = game; this.bike = null; this._t = 0; this._wait = 0; },

    // Onde ela fica: no quintal, entre a porta e a vaga da direita, de lado para a casa (encostada na parede da frente).
    home() {
        if (typeof FavelaPlan === 'undefined' || !FavelaPlan.yard || typeof SafeHouse === 'undefined') return null;
        const S = FavelaPlan.SAFE, dx = S.x + (SafeHouse.door.x0 + SafeHouse.door.x1) / 2;
        return { x: dx + 2.9, z: S.z - 1.5, h: Math.PI / 2 };
    },
    is(car) { return !!car && car === this.bike; },

    _spawn(at) {
        const g = this.game, id = g.traffic._nextId++;
        const bike = new TrafficCar(g.scene, g.physics, { x: at.x, z: at.z }, id, Bikes.sheet(g.sprites, 'bicycle', 'park'), this.PAINT, at.h, g.traffic);
        bike.baseMode = 'parked'; bike.frameVariant = 2;
        if (g.gameEngine.shadowGenerator) g.gameEngine.shadowGenerator.addShadowCaster(bike.body);
        g.vehicleManager.vehicles.push(bike);
        bike.park(); bike.locked = false; bike.keep = true; bike.personal = true; bike._xpGiven = true;
        if (bike.visual && bike.visual.setVariant) bike.visual.setVariant(this.PAINT);
        this.bike = bike;
        return bike;
    },
    _clear(at) {
        for (const v of this.game.vehicleManager.vehicles) if (v !== this.bike && hypot(v.position.x - at.x, v.position.z - at.z) < 2.6) return false;
        return true;
    },

    // A cada 0,5 s: devolve para casa o que ficou longe, refaz a que quebrou e põe no quintal quando o jogador chega perto.
    update(dt) {
        const g = this.game;
        if (!g || !g.vehicleManager || !g.traffic) return;
        if (this._wait > 0) this._wait -= dt;
        if ((this._t -= dt) > 0) return;
        this._t = 0.5;
        const at = this.home(), p = g.player.position, b = this.bike;
        if (!at) return;
        if (b) {
            if (b._gone || !g.vehicleManager.vehicles.includes(b)) { this.bike = null; return; }      // (tirada do mundo por outro caminho)
            if (b.destroyed && !b.canRaise) { if (!b.controlled) { Garage.despawn(g, b); this.bike = null; this._wait = this.RESPAWN; } return; }
            if (b.controlled || b.hold) return;
            const home = hypot(b.position.x - at.x, b.position.z - at.z) < 3, d = hypot(b.position.x - p.x, b.position.z - p.z);
            if (d > (home ? this.DESPAWN_R : this.RETURN_R)) { Garage.despawn(g, b); this.bike = null; }
            return;
        }
        if (this._wait <= 0 && hypot(at.x - p.x, at.z - p.z) < this.SPAWN_R && this._clear(at)) this._spawn(at);
    },
};
