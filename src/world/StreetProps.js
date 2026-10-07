// ============================================================================
// StreetProps — mobiliário urbano com FÍSICA: postes de rua.
//
//   • POSTES: cada poste é dado (não geometria fixa). Os do mesmo pedaço de 256 u viram UMA malha; quando um quebra, o pedaço é
//     remontado sem ele. Carro a mais de ~25 km/h que acerta o poste o QUEBRA: ele tomba (animação) na direção da batida, solta
//     faíscas, e a LUZ APAGA (brilho do cabeçote e poça de luz). O carro leva dano e perde velocidade. O poste caído fica no chão.
// WorldBuilder cria isto em _streetLamps; Game chama update(dt, carros) todo frame.
// ============================================================================

class StreetProps {
    constructor(world, lamps) {
        this.w = world;
        this.scene = world.scene;
        this.lamps = lamps;                       // { x, z, hx, hz, alive, key, glow:[a,b] }
        this.chunks = { l: new Map() };
        this.grid = new Map();                    // célula de 16 u -> [{ k: 'l', i }]
        this.falling = [];                        // postes tombando / caídos
        this.fallen = [];
        this.time = 0;
        this._index = 0;
        lamps.forEach((l, i) => { l.key = StreetProps.keyOf(l.x, l.z); this._add('l', i, l.x, l.z, l.key); });
    }

    static keyOf(x, z) { const C = Config.world.detailChunk; return Math.floor(x / C) + ',' + Math.floor(z / C); }    // (pedaço pequeno: postes são densos em vértices; quebrar um refaz só o pedaço dele)

    _add(k, i, x, z, key) {
        const ch = this.chunks[k];
        let c = ch.get(key); if (!c) ch.set(key, c = { ids: [], mesh: null });
        c.ids.push(i);
        const gk = (Math.floor(x / 16) + 4096) * 8192 + (Math.floor(z / 16) + 4096);      // (chave numérica: a de texto criava strings a cada consulta)
        let g = this.grid.get(gk); if (!g) this.grid.set(gk, g = []);
        g.push({ k, i });
    }

    // ------------------------------------------------------------------- malhas
    _lampGeo(b, l) {
        const pole = [0.22, 0.23, 0.26], head = [0.9, 0.86, 0.7];
        const px = l.x, pz = l.z, hx = l.hx, hz = l.hz;
        b.solid(px - 0.13, pz - 0.13, px + 0.13, pz + 0.13, 0, 5.7, pole);
        b.solid(Math.min(px, hx) - 0.07, Math.min(pz, hz) - 0.07, Math.max(px, hx) + 0.07, Math.max(pz, hz) + 0.07, 5.55, 5.7, pole);
        b.solid(hx - 0.32, hz - 0.22, hx + 0.32, hz + 0.22, 5.38, 5.6, head);
    }

    _rebuild(k, key) {
        const c = this.chunks[k].get(key);
        if (!c) return;
        if (c.mesh) { if (this.w.shadow && k === 'l') this.w.shadow.removeShadowCaster(c.mesh); c.mesh.dispose(); c.mesh = null; }
        const b = new MeshBatch(), list = this.lamps;
        let n = 0;
        for (const i of c.ids) {
            const it = list[i];
            if (it.alive) { this._lampGeo(b, it); n++; }
        }
        if (!n) return;
        c.mesh = b.build('lamps_' + key, this.scene, this.w.mats.solid, { vertexColors: true, receiveShadows: false, alwaysActive: false });
        if (c.mesh && this.w.shadow && k === 'l') this.w.shadow.addShadowCaster(c.mesh);
    }

    build() {
        for (const key of this.chunks.l.keys()) this._rebuild('l', key);
        console.log(`[RUA] ${this.lamps.length} postes com fisica`);
    }

    // ----------------------------------------------------------------- quebrar
    breakLamp(i, dx, dz) {
        const l = this.lamps[i];
        if (!l || !l.alive) return;
        l.alive = false;
        this._rebuild('l', l.key);
        const g = this.w.lampGlow;
        if (l.glow) { g.off(l.glow[0]); g.off(l.glow[1]); g.flush(); }
        const game = this.w.game;
        if (game) {
            for (let k = 0; k < 5; k++) game.combat.spark(l.x + (Math.random() - 0.5), 0.4 + Math.random() * 1.5, l.z + (Math.random() - 0.5), [0.8, 0.9, 1]);
            AudioFX.crash(l.x, l.z, 0.7);
            if (game.birds) { game.birds.scare(l.x, l.z, 16); game.birds.removePerch(l.hx, l.hz); }
        }
        // Tomba na direção da batida (pivô no pé): um nó no pé do poste com o poste, o braço e o cabeçote como filhos.
        const dl = hypot(dx, dz) || 1, ux = dx / dl, uz = dz / dl;
        const node = new BABYLON.TransformNode('pole_fall', this.scene);
        node.position.set(l.x, 0, l.z);
        const mat = this.w.fallMaterial || (this.w.fallMaterial = (() => { const m = new BABYLON.StandardMaterial('poleFall', this.scene); m.diffuseColor = new BABYLON.Color3(0.22, 0.23, 0.26); m.specularColor = BABYLON.Color3.Black(); return m; })());
        const headMat = this.w.fallHeadMaterial || (this.w.fallHeadMaterial = (() => { const m = new BABYLON.StandardMaterial('poleFallHead', this.scene); m.diffuseColor = new BABYLON.Color3(0.9, 0.86, 0.7); m.emissiveColor = new BABYLON.Color3(0.2, 0.18, 0.12); m.specularColor = BABYLON.Color3.Black(); return m; })());
        const mk = (name, w, h, d, x, y, z, m) => { const b = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, this.scene); b.parent = node; b.position.set(x, y, z); b.material = m; b.isPickable = false; return b; };
        const rx = l.hx - l.x, rz = l.hz - l.z;
        const parts = [
            mk('pole', 0.26, 5.7, 0.26, 0, 2.85, 0, mat),
            mk('arm', Math.abs(rx) + 0.14, 0.15, Math.abs(rz) + 0.14, rx / 2, 5.62, rz / 2, mat),
            mk('head', 0.64, 0.22, 0.44, rx, 5.49, rz, headMat),
        ];
        if (this.w.shadow) for (const p of parts) this.w.shadow.addShadowCaster(p);
        this.falling.push({ node, parts, t: 0, ux, uz, ang: 0, w: 0.4, done: false, x: l.x, z: l.z });
    }

    // ------------------------------------------------------------------ quadro
    // cars: veículos terrestres com { position, halfLen, halfW, speed, body, phys }.
    update(dt, cars, game) {
        this.time += dt;
        // 1) Colisão carro × poste.
        for (const car of cars) {
            if (!car || car.wrecked || car.isBoat || car._asleep) continue;
            const sp = Math.abs(car.speed || 0);
            if (sp < 4.2) continue;
            const p = car.position;
            if (!inWorld(p.x, p.z)) continue;                                // (física lançou o carro para longe: o laço da grade não terminaria)
            const f = car.fwdToRef ? car.fwdToRef(this._f || (this._f = new BABYLON.Vector3())) : car.body.getDirection(BABYLON.Axis.Z), fl = hypot(f.x, f.z) || 1, fx = f.x / fl, fz = f.z / fl, rx = fz, rz = -fx;
            const R = car.halfLen + 0.8;
            for (let gx = Math.floor((p.x - R) / 16); gx <= Math.floor((p.x + R) / 16); gx++) {
                for (let gz = Math.floor((p.z - R) / 16); gz <= Math.floor((p.z + R) / 16); gz++) {
                    const g = this.grid.get((gx + 4096) * 8192 + (gz + 4096));
                    if (!g) continue;
                    for (const e of g) {
                        const it = this.lamps[e.i];
                        if (!it.alive) continue;
                        const dx = it.x - p.x, dz = it.z - p.z;
                        const lz = dx * fx + dz * fz, lx = dx * rx + dz * rz;
                        const rad = 0.18;
                        if (Math.abs(lz) > car.halfLen + rad || Math.abs(lx) > car.halfW + rad) continue;
                        const v = car.phys ? car.phys.getLinearVelocity() : null, vl = v ? hypot(v.x, v.z) : 0;
                        const vx = v && vl > 0.1 ? v.x : fx * sp, vz = v && vl > 0.1 ? v.z : fz * sp;
                        if (sp < 7) continue;                              // devagar: o poste aguenta (o carro só raspa)
                        this.breakLamp(e.i, vx, vz);
                        car.takeDamage && car.takeDamage(Math.min(30, 6 + sp * 1.1), car.controlled ? 'player' : 'env');
                        if (v) car.phys.setLinearVelocity(new BABYLON.Vector3(v.x * 0.72, v.y, v.z * 0.72));
                    }
                }
            }
        }

        // 2) Postes tombando: gira em torno do pé acelerando; ao chegar no chão quica uma vez e fica deitado.
        for (let i = this.falling.length - 1; i >= 0; i--) {
            const f = this.falling[i];
            if (f.done) continue;
            f.w += 6 * dt;                                                      // aceleração angular
            f.ang += f.w * dt;
            if (f.ang >= Math.PI / 2 - 0.04) {
                if (!f.bounced) {                                               // batida no chão: quica um pouco
                    f.bounced = true; f.ang = Math.PI / 2 - 0.04; f.w = -f.w * 0.28;
                    if (game) { AudioFX.crash(f.x + f.ux * 3, f.z + f.uz * 3, 0.6); for (let k = 0; k < 4; k++) game.combat.spark(f.x + f.ux * (2 + Math.random() * 3), 0.3, f.z + f.uz * (2 + Math.random() * 3), [1, 0.8, 0.4]); }
                } else { f.ang = Math.PI / 2 - 0.04; f.done = true; this.fallen.push(f); if (this.fallen.length > 80) this._dropFallen(); }
            }
            // eixo = perpendicular à direção da queda: o topo vai para (ux, uz)
            f.node.rotationQuaternion = BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(f.uz, 0, -f.ux), f.ang);
        }

    }

    _dropFallen() {
        const f = this.fallen.shift();
        if (!f) return;
        for (const p of f.parts) { if (this.w.shadow) this.w.shadow.removeShadowCaster(p); p.dispose(); }
        f.node.dispose();
    }
}
