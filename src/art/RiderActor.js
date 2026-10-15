// ============================================================================
// RiderActor — moto, bicicleta, jet ski, lancha e barco: o VEÍCULO vem do atlas dos carros (CarArt: mesmo desenho vetorial, mesmo
// lote, mesma pintura e amassados dos carros) e o PILOTO é o sprite do personagem (atlas dos personagens, clipes ride_*) desenhado
// POR CIMA, no banco. Antes o piloto e a moto eram um sprite só, feito das primitivas do rig (e os barcos, uma folha de 32 direções
// em pixel art): agora tudo que tem motor tem o mesmo acabamento. Com os personagens 2,5D (NpcArt) o piloto é o tipo de NPC (ou o
// jogador) sentado, em 16 direções, com a origem no banco: as folhas 'rider'/'courier' viram tipos 2,5D sozinhas (NpcArt.attach).
//
// Mesma interface do CarActor (setPosition / setHeading / setY / setVariant / setDamage / setVisible / update / animate / dispose,
// heading, y, rotates), mais:
//   setModel(id)                     troca o desenho (moto em pé ↔ caída)
//   setRider(variante, folha, clipe) põe/tira o piloto (variante = linha da paleta dos personagens; null = sem piloto)
//   setLean(v, dt)                   inclinação do piloto pelo guidão (moto, jet ski): v = −1..+1, + = curva para a DIREITA
//                                    (Vehicle.lastSteer > 0, rumo aumentando); dt > 0 = suaviza (o corpo deita aos poucos)
//   setFrame(f)                      quadro do clipe do piloto (código antigo: prefira setLean)
// ============================================================================

class RiderActor {
    // seat: onde fica a origem do piloto, em m no referencial do veículo (z = frente, x = direita).
    constructor(scene, modelId, paint, seat = null, scale = 1) {
        this.scene = scene;
        this.body = CarArt.actor(modelId, paint, scale);
        this.seat = seat || { z: 0, x: 0 };
        this.rider = null;
        this.riderVariant = null;
        this._clipName = null;
        this.x = 0; this.z = 0; this.y = 1.5; this.heading = 0;
        this.visible = true;
        this.rotates = true;
    }

    get variant() { return this.body.variant; }
    get modelId() { return this.body.modelId; }
    get tire() { return null; }
    get clip() { return this.body; }                 // (código antigo das motos de NPC: "já tem clipe?")
    play() { return true; }

    setModel(id) { this.body.setModel(id); }

    setRider(variant, sheet = null, clip = 'ride_moto') {
        if (variant == null || !sheet) {
            this.riderVariant = null;
            if (this.rider) this.rider.setVisible(false);
            return;
        }
        if (!this.rider) {
            this.rider = new SpriteActor(this.scene, sheet, variant, 'piloto');
            const m = this.rider.mesh;
            m.renderingGroupId = 1;                  // depois do lote dos carros (grupo 1, alphaIndex -3): o piloto fica POR CIMA do veículo
            m.alphaIndex = -2.5;
            this._clipName = null;
        } else if (this.rider.sheet !== sheet) { this.rider.useSheet(sheet); this._clipName = null; }
        if (this.riderVariant !== variant) this.rider.setVariant(variant);
        this.riderVariant = variant;
        // (2,5D: ride_moto/bike/jetski/boat em 16 direções; o boneco antigo só tem ride_moto/ride_bike — jet ski e lancha usam o da moto)
        if (this._clipName !== clip) { if (this.rider.play(clip, 'none', { restart: true }) || this.rider.play('ride_moto', 'none', { restart: true })) this._clipName = clip; }
        this.rider.setVisible(this.visible);
        this._place();
    }

    _place() {
        const r = this.rider;
        if (!r || this.riderVariant == null) return;
        const s = Math.sin(this.heading), c = Math.cos(this.heading), S = this.seat;
        r.setPosition(this.x + s * S.z + c * S.x + s * this.body.sz, this.z + c * S.z - s * S.x + c * this.body.sz);     // (vai junto com a suspensão)
        r.setHeading(this.heading);
        r.mesh.position.y = this.y + 0.08;
    }

    setPosition(x, z) { this.x = x; this.z = z; this.body.setPosition(x, z); this._place(); }
    setHeading(h) { this.heading = h; this.body.setHeading(h); this._place(); }
    setY(y) { this.y = y; this.body.setY(y); this._place(); }
    setVariant(v) { this.body.setVariant(v); }
    setDamage(d) { this.body.setDamage(d); }
    setVisible(v) {
        this.visible = !!v;
        this.body.setVisible(v);
        if (this.rider) this.rider.setVisible(this.visible && this.riderVariant != null);
    }
    setFrame(f) { if (this.rider && this.riderVariant != null) this.rider.setFrame(f); }
    // Inclinação pilotando: os quadros de ride_moto/ride_jetski são degraus de inclinação (o 1º, +12°, deitado para a direita — o do
    // meio, reto — o último, para a esquerda; SpriteActor.setLean escolhe/mistura pelo valor contínuo). Os outros clipes (bicicleta
    // pedalando, lancha) seguem o próprio ritmo. v = −1..+1 (+ = curva para a direita); dt > 0: segue o alvo a LEAN_K/s, sem pulo.
    setLean(v, dt = 0) {
        v = Math.max(-1, Math.min(1, +v || 0));
        const L = this._leanV = dt > 0 && this._leanV != null ? this._leanV + (v - this._leanV) * (1 - Math.exp(-RiderActor.LEAN_K * dt)) : v;
        const r = this.rider;
        if (r && this.riderVariant != null && RiderActor.LEAN.test(r.clipName)) r.setLean(L);
    }
    static get LEAN() { return /^ride_(moto|jetski)$/; }
    static get LEAN_K() { return 7; }
    animate(dt, aF, aL, steer) { this.body.animate(dt, aF, aL, steer); }

    update(dt, rate = 1) {
        this.body.update(dt);
        if (this.rider && this.riderVariant != null && this.visible) this.rider.update(dt, rate);
    }

    dispose() {
        this.body.dispose();
        if (this.rider) { this.rider.dispose(); this.rider = null; }
    }
}
