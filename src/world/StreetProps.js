// ============================================================================
// StreetProps — mobiliário urbano com FÍSICA: postes de rua e PLACAS de trânsito.
//
//   • POSTES: cada poste é dado (não geometria fixa). Os do mesmo pedaço de 256 u viram UMA malha; quando um quebra, o pedaço é
//     remontado sem ele. Carro a mais de ~25 km/h que acerta o poste o QUEBRA: ele tomba (animação) na direção da batida, solta
//     faíscas, e a LUZ APAGA (brilho do cabeçote e poça de luz). O carro leva dano e perde velocidade. O poste caído fica no chão.
//   • PLACAS (StreetDetail.signs — PARE, velocidade, lombada, curva...): poste fino; qualquer batida a partir de ~15 km/h derruba (tomba
//     como o poste, sem faíscas), com dano e freada pequenos. Malhas por pedaço: o poste (cor por vértice) e as faces (atlas do RoadArt).
// WorldBuilder cria isto em _streetLamps (e addSigns); Game chama update(dt, carros) todo frame.
// ============================================================================

class StreetProps {
    constructor(world, lamps) {
        this.w = world;
        this.scene = world.scene;
        this.lamps = lamps;                       // { x, z, hx, hz, alive, key, glow:[a,b] }
        this.chunks = { l: new Map(), s: new Map() };
        this.signs = [];
        this.grid = new Map();                    // célula de 16 u -> [{ k: 'l', i }]
        this.falling = [];                        // postes tombando / caídos
        this.fallen = [];
        this.time = 0;
        this._index = 0;
        lamps.forEach((l, i) => { l.key = StreetProps.keyOf(l.x, l.z); this._add('l', i, l.x, l.z, l.key); });
    }

    addSigns(list) {
        const base = this.signs.length;
        list.forEach((s, i) => { s.key = StreetProps.keyOf(s.x, s.z); this.signs.push(s); this._add('s', base + i, s.x, s.z, s.key); });
    }
    _list(k) { return k === 's' ? this.signs : this.lamps; }

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
        StreetFurniture.lamp(b, l.x, l.z, l.hx, l.hz);
    }

    _rebuild(k, key) {
        const c = this.chunks[k].get(key);
        if (!c) return;
        if (c.mesh) { if (this.w.shadow) this.w.shadow.removeShadowCaster(c.mesh); c.mesh.dispose(); c.mesh = null; }
        if (c.face) { c.face.dispose(); c.face = null; }
        const b = new MeshBatch(), f = k === 's' ? new MeshBatch() : null, list = this._list(k);
        let n = 0;
        for (const i of c.ids) {
            const it = list[i];
            if (!it.alive) continue;
            MeshBatch.anchor = typeof Relief !== 'undefined' && Relief.on ? { h: Relief.at(it.x, it.z) } : null;      // (relevo: o poste em pé na altura do pé dele)
            if (k === 's') RoadArt.sign(b, f, it.x, it.z, it.fx, it.fz, it.kind); else this._lampGeo(b, it);
            n++;
        }
        MeshBatch.anchor = null;
        if (!n) return;
        if (f) {
            c.mesh = b.build('signs_' + key, this.scene, this.w.mats.bsolid, { vertexColors: true, receiveShadows: false, alwaysActive: false, relief: true });
            c.face = f.build('signf_' + key, this.scene, this.w.mats.signs, { receiveShadows: false, alwaysActive: false, relief: true });
            return;
        }
        // (material das peças da ponte: com o vão cortado — RoofCut —, o poste em cima dele some junto, em vez de ficar de pé na água)
        c.mesh = b.build('lamps_' + key, this.scene, this.w.mats.bsolid, { vertexColors: true, receiveShadows: false, alwaysActive: false, relief: true });
        if (c.mesh && this.w.shadow && k === 'l') this.w.shadow.addShadowCaster(c.mesh);
    }

    build() {
        for (const key of this.chunks.l.keys()) this._rebuild('l', key);
        for (const key of this.chunks.s.keys()) this._rebuild('s', key);
        console.log(`[RUA] ${this.lamps.length} postes e ${this.signs.length} placas com fisica`);
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
        // (o mesmo desenho do poste em pé — StreetFurniture.lamp —, em coordenadas locais, filho do nó do pé)
        const fb = new MeshBatch();
        StreetFurniture.lamp(fb, 0, 0, l.hx - l.x, l.hz - l.z);
        const pm = fb.build('pole_fall_mesh', this.scene, this.w.mats.bsolid, { vertexColors: true, receiveShadows: false, alwaysActive: true });
        pm.unfreezeWorldMatrix(); pm.parent = node;
        const parts = [pm];
        if (this.w.shadow) for (const p of parts) this.w.shadow.addShadowCaster(p);
        this.falling.push({ node, parts, t: 0, ux, uz, ang: 0, w: 0.4, done: false, x: l.x, z: l.z });
    }

    // Placa derrubada: tomba como o poste (pivô no pé), sem faíscas nem luz.
    breakSign(i, dx, dz) {
        const s = this.signs[i];
        if (!s || !s.alive) return;
        s.alive = false;
        this._rebuild('s', s.key);
        if (this.w.game) AudioFX.hit(s.x, s.z);
        const dl = hypot(dx, dz) || 1, ux = dx / dl, uz = dz / dl;
        const node = new BABYLON.TransformNode('sign_fall', this.scene);
        node.position.set(s.x, typeof Relief !== 'undefined' && Relief.on ? Relief.at(s.x, s.z) : 0, s.z);
        const fb = new MeshBatch(), ff = new MeshBatch();
        RoadArt.sign(fb, ff, 0, 0, s.fx, s.fz, s.kind);
        const pm = fb.build('sign_fall_mesh', this.scene, this.w.mats.bsolid, { vertexColors: true, receiveShadows: false, alwaysActive: true });
        const fm = ff.build('sign_fall_face', this.scene, this.w.mats.signs, { receiveShadows: false, alwaysActive: true });
        for (const m of [pm, fm]) { m.unfreezeWorldMatrix(); m.parent = node; }
        this.falling.push({ node, parts: [pm, fm], t: 0, ux, uz, ang: 0, w: 1.2, done: false, x: s.x, z: s.z, light: true });
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
                        const sign = e.k === 's', it = sign ? this.signs[e.i] : this.lamps[e.i];
                        if (!it.alive) continue;
                        const dx = it.x - p.x, dz = it.z - p.z;
                        const lz = dx * fx + dz * fz, lx = dx * rx + dz * rz;
                        const rad = sign ? 0.1 : 0.18;
                        if (Math.abs(lz) > car.halfLen + rad || Math.abs(lx) > car.halfW + rad) continue;
                        const v = car.phys ? car.phys.getLinearVelocity() : null, vl = v ? hypot(v.x, v.z) : 0;
                        const vx = v && vl > 0.1 ? v.x : fx * sp, vz = v && vl > 0.1 ? v.z : fz * sp;
                        if (sign) {                                        // placa: poste fino, cai com qualquer batida
                            this.breakSign(e.i, vx, vz);
                            car.takeDamage && car.takeDamage(Math.min(6, 1 + sp * 0.25), car.controlled ? 'player' : 'env');
                            if (v) car.phys.setLinearVelocity(new BABYLON.Vector3(v.x * 0.93, v.y, v.z * 0.93));
                            continue;
                        }
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
                    if (game && f.light) AudioFX.hit(f.x, f.z);
                    else if (game) { AudioFX.crash(f.x + f.ux * 3, f.z + f.uz * 3, 0.6); for (let k = 0; k < 4; k++) game.combat.spark(f.x + f.ux * (2 + Math.random() * 3), 0.3, f.z + f.uz * (2 + Math.random() * 3), [1, 0.8, 0.4]); }
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
