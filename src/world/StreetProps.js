// ============================================================================
// StreetProps — mobiliário urbano com FÍSICA: postes de rua e hidrantes.
//
//   • POSTES: cada poste é dado (não geometria fixa). Os do mesmo pedaço de 256 u viram UMA malha; quando um quebra, o pedaço é
//     remontado sem ele. Carro a mais de ~25 km/h que acerta o poste o QUEBRA: ele tomba (animação) na direção da batida, solta
//     faíscas, e a LUZ APAGA (brilho do cabeçote e poça de luz). O carro leva dano e perde velocidade. O poste caído fica no chão.
//   • HIDRANTES: vermelhos, na calçada. Carro a mais de ~15 km/h que acerta um arranca o hidrante: jorra água por ~5 s (coluna de
//     névoa + gotas + marolas no chão) e o toco fica no lugar.
// WorldBuilder cria isto em _streetLamps/_hydrants; Game chama update(dt, carros) todo frame.
// ============================================================================

class StreetProps {
    constructor(world, lamps) {
        this.w = world;
        this.scene = world.scene;
        this.lamps = lamps;                       // { x, z, hx, hz, alive, key, glow:[a,b] }
        this.hydrants = [];                       // { x, z, alive, key, jet }
        this.chunks = { l: new Map(), h: new Map() };
        this.grid = new Map();                    // célula de 16 u -> [{ k: 'l'|'h', i }]
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
        const gk = Math.floor(x / 16) + ',' + Math.floor(z / 16);
        let g = this.grid.get(gk); if (!g) this.grid.set(gk, g = []);
        g.push({ k, i });
    }

    // ---------------------------------------------------------------- hidrantes
    // Um por trecho urbano (lado aleatório), longe dos postes.
    placeHydrants() {
        const rng = Pixel.rng(5151);
        for (const e of RoadPlan.edges) {
            if (e.cls !== 'city' && e.cls !== 'isl' && e.cls !== 'ave') continue;
            if (e.len < 40) continue;
            const hw = e.w / 2 + 0.75, count = e.len > 90 ? 2 : 1;
            for (let n = 0; n < count; n++) {
                const side = rng() < 0.5 ? 1 : -1, s = 20 + rng() * (e.len - 40);
                const x = e.v ? e.a.x + side * hw : e.a.x + s, z = e.v ? e.a.z + s : e.a.z + side * hw;
                if (this.lamps.some((l) => hypot(l.x - x, l.z - z) < 2.5)) continue;
                const h = { x, z, alive: true, key: StreetProps.keyOf(x, z), jet: 0 };
                this.hydrants.push(h);
                this._add('h', this.hydrants.length - 1, x, z, h.key);
            }
        }
    }

    // ------------------------------------------------------------------- malhas
    _lampGeo(b, l) {
        const pole = [0.22, 0.23, 0.26], head = [0.9, 0.86, 0.7];
        const px = l.x, pz = l.z, hx = l.hx, hz = l.hz;
        b.solid(px - 0.13, pz - 0.13, px + 0.13, pz + 0.13, 0, 5.7, pole);
        b.solid(Math.min(px, hx) - 0.07, Math.min(pz, hz) - 0.07, Math.max(px, hx) + 0.07, Math.max(pz, hz) + 0.07, 5.55, 5.7, pole);
        b.solid(hx - 0.32, hz - 0.22, hx + 0.32, hz + 0.22, 5.38, 5.6, head);
    }

    _hydrantGeo(b, h) {
        const red = [0.78, 0.12, 0.1], dark = [0.55, 0.08, 0.07], gray = [0.5, 0.5, 0.54], chrome = [0.85, 0.82, 0.55];
        const x = h.x, z = h.z;
        b.solid(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 0, 0.12, gray);                     // base
        b.solid(x - 0.14, z - 0.14, x + 0.14, z + 0.14, 0.12, 0.7, red);                // corpo
        b.solid(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 0.7, 0.82, dark);                   // calota
        b.solid(x - 0.07, z - 0.07, x + 0.07, z + 0.07, 0.82, 0.92, red);               // topo
        b.solid(x - 0.3, z - 0.07, x + 0.3, z + 0.07, 0.36, 0.5, red);                  // bocais laterais
        b.solid(x - 0.34, z - 0.06, x - 0.28, z + 0.06, 0.37, 0.49, chrome);
        b.solid(x + 0.28, z - 0.06, x + 0.34, z + 0.06, 0.37, 0.49, chrome);
    }

    _rebuild(k, key) {
        const c = this.chunks[k].get(key);
        if (!c) return;
        if (c.mesh) { if (this.w.shadow && k === 'l') this.w.shadow.removeShadowCaster(c.mesh); c.mesh.dispose(); c.mesh = null; }
        const b = new MeshBatch(), list = k === 'l' ? this.lamps : this.hydrants;
        let n = 0;
        for (const i of c.ids) {
            const it = list[i];
            if (it.alive) { if (k === 'l') this._lampGeo(b, it); else this._hydrantGeo(b, it); n++; }
            else if (k === 'h') { const x = it.x, z = it.z; b.solid(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 0, 0.12, [0.5, 0.5, 0.54]); b.solid(x - 0.07, z - 0.07, x + 0.07, z + 0.07, 0.12, 0.3, [0.55, 0.08, 0.07]); n++; }   // toco
        }
        if (!n) return;
        c.mesh = b.build((k === 'l' ? 'lamps_' : 'hydr_') + key, this.scene, this.w.mats.solid, { vertexColors: true, receiveShadows: false, alwaysActive: false });
        if (c.mesh && this.w.shadow && k === 'l') this.w.shadow.addShadowCaster(c.mesh);
    }

    build() {
        for (const key of this.chunks.l.keys()) this._rebuild('l', key);
        for (const key of this.chunks.h.keys()) this._rebuild('h', key);
        console.log(`[RUA] ${this.lamps.length} postes e ${this.hydrants.length} hidrantes com fisica`);
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

    breakHydrant(i, vx, vz) {
        const h = this.hydrants[i];
        if (!h || !h.alive) return;
        h.alive = false;
        h.jet = 4.6 + Math.random() * 0.8;                                    // ~5 s de jato
        h.vx = vx; h.vz = vz;
        this._rebuild('h', h.key);
        const game = this.w.game;
        if (game) {
            for (let k = 0; k < 6; k++) game.combat.spark(h.x + (Math.random() - 0.5), 0.3 + Math.random(), h.z + (Math.random() - 0.5), [0.6, 0.8, 1]);
            AudioFX.crash(h.x, h.z, 0.5);
            if (game.npcManager) game.npcManager.alertViolence({ x: h.x, z: h.z }, 12);
        }
        this.jets = this.jets || [];
        this.jets.push(h);
    }

    // ------------------------------------------------------------------ quadro
    // cars: veículos terrestres com { position, halfLen, halfW, speed, body, phys }.
    update(dt, cars, game) {
        this.time += dt;
        // 1) Colisão carro × poste/hidrante.
        for (const car of cars) {
            if (!car || car.wrecked || car.isBoat) continue;
            const sp = Math.abs(car.speed || 0);
            if (sp < 4.2) continue;
            const p = car.position;
            const f = car.body.getDirection(BABYLON.Axis.Z), fl = hypot(f.x, f.z) || 1, fx = f.x / fl, fz = f.z / fl, rx = fz, rz = -fx;
            const R = car.halfLen + 0.8;
            for (let gx = Math.floor((p.x - R) / 16); gx <= Math.floor((p.x + R) / 16); gx++) {
                for (let gz = Math.floor((p.z - R) / 16); gz <= Math.floor((p.z + R) / 16); gz++) {
                    const g = this.grid.get(gx + ',' + gz);
                    if (!g) continue;
                    for (const e of g) {
                        const it = e.k === 'l' ? this.lamps[e.i] : this.hydrants[e.i];
                        if (!it.alive) continue;
                        const dx = it.x - p.x, dz = it.z - p.z;
                        const lz = dx * fx + dz * fz, lx = dx * rx + dz * rz;
                        const rad = e.k === 'l' ? 0.18 : 0.22;
                        if (Math.abs(lz) > car.halfLen + rad || Math.abs(lx) > car.halfW + rad) continue;
                        const v = car.phys ? car.phys.getLinearVelocity() : null, vl = v ? hypot(v.x, v.z) : 0;
                        const vx = v && vl > 0.1 ? v.x : fx * sp, vz = v && vl > 0.1 ? v.z : fz * sp;
                        if (e.k === 'l') {
                            if (sp < 7) continue;                              // devagar: o poste aguenta (o carro só raspa)
                            this.breakLamp(e.i, vx, vz);
                            car.takeDamage && car.takeDamage(Math.min(30, 6 + sp * 1.1), car.controlled ? 'player' : 'env');
                            if (v) car.phys.setLinearVelocity(new BABYLON.Vector3(v.x * 0.72, v.y, v.z * 0.72));
                        } else {
                            this.breakHydrant(e.i, vx, vz);
                            car.takeDamage && car.takeDamage(Math.min(14, 3 + sp * 0.5), car.controlled ? 'player' : 'env');
                            if (v) car.phys.setLinearVelocity(new BABYLON.Vector3(v.x * 0.85, v.y, v.z * 0.85));
                        }
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

        // 3) Jatos dos hidrantes.
        if (this.jets && this.jets.length && game) {
            for (let i = this.jets.length - 1; i >= 0; i--) {
                const h = this.jets[i];
                h.jet -= dt;
                if (h.jet <= 0) { this.jets.splice(i, 1); continue; }
                const k = Math.min(1, h.jet / 1.0);                              // no último segundo o jato enfraquece
                const near = hypot(h.x - game.camera.target.x, h.z - game.camera.target.z) < 90;
                if (!near) continue;
                h._acc = (h._acc || 0) + dt * 60 * k;
                while (h._acc >= 1) {
                    h._acc -= 1;
                    const a = Math.random() * Math.PI * 2, s = 0.5 + Math.random() * 1.1;
                    game.carLights.puffs.emit(h.x, 0.85, h.z, Math.cos(a) * s * 0.7, 6 + Math.random() * 5 * k, Math.sin(a) * s * 0.7, 0.45, 1.5 + Math.random() * 1.0, 0.9 + Math.random() * 0.5, 0.8 * k + 0.1, [1, 1, 1]);
                    if (Math.random() < 0.35) game.carLights.puffs.emit(h.x + (Math.random() - 0.5) * 0.6, 0.35, h.z + (Math.random() - 0.5) * 0.6, Math.cos(a) * 3, 0.5, Math.sin(a) * 3, 0.7, 2.8, 0.9, 0.38 * k, [0.92, 0.97, 1]);      // neblina rente ao chao
                }
                if (Math.random() < dt * 22 * k) game.combat.spark(h.x + (Math.random() - 0.5) * 1.6, 1.5 + Math.random() * 2.5, h.z + (Math.random() - 0.5) * 1.6, [0.7, 0.88, 1]);
                h._rt = (h._rt || 0) - dt;
                if (h._rt <= 0) { h._rt = 0.18; game.waterFx.ripple(h.x + (Math.random() - 0.5) * 3.5, h.z + (Math.random() - 0.5) * 3.5, 0.6, 3.2, 0.9, 0.75 * k + 0.1); }
            }
        }
    }

    _dropFallen() {
        const f = this.fallen.shift();
        if (!f) return;
        for (const p of f.parts) { if (this.w.shadow) this.w.shadow.removeShadowCaster(p); p.dispose(); }
        f.node.dispose();
    }
}
