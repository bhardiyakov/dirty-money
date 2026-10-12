// ============================================================================
// Barricades — as BARRICADAS DINÂMICAS da favela. Quando a polícia invade (PoliceOperation), os traficantes fecham as RUAS do
// morro (as 3 por onde carro passa) com sofás, paletes, trilhos e pneus em chamas, uma a uma, à frente da incursão. Cada barricada:
//   • fecha o trecho para os CARROS (RoadNet.closed nas duas pontas + corpo físico estático): nem trânsito, nem viatura, nem o seu
//     carro passa;
//   • é um sólido baixo PULÁVEL a pé (CityGrid.vaultables: tecla V / a polícia também pula) e fecha o raster da navegação só na
//     pista (as beiradas ficam livres): quem está a pé dá a volta pela beirada ou pelos becos — gargalos táticos (choke points);
//   • pega fogo: pneus com brilho pulsante e fumaça subindo (vira luz à noite).
// Montadas na operação (2 logo no início, +1 a cada ~18 s, até 5) e desmontadas ~60 s depois que ela termina.
// ============================================================================

class Barricades {
    constructor(game) {
        this.g = game;
        this.list = [];
        this._mats = {};
        this._t = 0; this._spawnT = 0;
        this.fire = new GlowBatch(game.scene, 48, 'barFire', 'glow');
        this.smoke = new GlowBatch(game.scene, 120, 'barSmoke', 'puff');
        this._fid = []; this._sid = [];
        for (let i = 0; i < 48; i++) { this._fid.push(this.fire.alloc()); this.fire.off(i); }
        for (let i = 0; i < 120; i++) { this._sid.push(this.smoke.alloc()); this.smoke.off(i); }
        this._fused = 0; this._sused = 0;
        this._shut = new Map();                                  // perna fechada → quantas barricadas a fecham
    }

    get count() { return this.list.length; }

    _mat(color) {
        let m = this._mats[color];
        if (!m) {
            m = this._mats[color] = new BABYLON.StandardMaterial('bar_' + color, this.g.scene);
            const c = BABYLON.Color3.FromHexString(color);
            m.diffuseColor = BABYLON.Color3.Black(); m.specularColor = BABYLON.Color3.Black(); m.emissiveColor = c; m.disableLighting = true;
        }
        return m;
    }

    // Pontos das ruas da favela onde dá para barrar (a cada ~25 u dos trechos 'fav'): perto de `ref`, no meio do caminho
    // (profundidade 0,12–0,6), longe da safe house e das outras barricadas.
    _pick(ref, n) {
        const home = SafeHouse.spawnWorld(), out = [], P = {};
        for (const e of RoadPlan.edges) {
            if (e.cls !== 'fav' || e.len < 30) continue;
            for (let t = 15; t <= e.len - 15; t += 25) {
                RoadPlan.at(e, t, P);
                const s = { x: P.x, z: P.z, dx: P.tx, dz: P.tz };
                if (!Standing.inFavela(s.x, s.z)) continue;
                const dp = Standing.depth(s.x, s.z);
                if (dp < 0.12 || dp > 0.6) continue;
                if (home && hypot(s.x - home.x, s.z - home.z) < 45) continue;
                if (this.list.some((b) => hypot(b.x - s.x, b.z - s.z) < 32)) continue;
                const dist = hypot(s.x - ref.x, s.z - ref.z);
                out.push({ e, s, score: Math.abs(dist - 90) + Math.random() * 25 });
            }
        }
        out.sort((a, b) => a.score - b.score);
        const res = [];
        for (const c of out) { if (res.length >= n) break; if (!res.some((o) => hypot(o.s.x - c.s.x, o.s.z - c.s.z) < 32)) res.push(c); }
        return res;
    }

    // Fecha/reabre o trecho nas duas pontas (contagem: duas barricadas no mesmo trecho).
    _close(e, on) {
        for (const n of [e.a, e.b]) {
            const a = n.arms.find((k) => k.e === e); if (!a) continue;
            const key = RoadNet.legKey(n, a), c = (this._shut.get(key) || 0) + (on ? 1 : -1);
            if (c > 0) this._shut.set(key, c); else this._shut.delete(key);
            RoadNet.setClosed(n, a, c > 0);
        }
    }

    _build(c) {
        const g = this.g, { e, s } = c, sc = g.scene;
        const ax = { x: s.dx, z: s.dz }, lat = { x: s.dz, z: -s.dx };
        const hw = 3.0, th = 1.1;
        // sólido: quadradinhos ao longo da largura (a rua pode estar torta: um retângulo só cobriria as beiradas também)
        const obs = [];
        for (let l = -hw + 0.55; l <= hw - 0.55 + 1e-6; l += 0.98) {
            const cx = s.x + lat.x * l, cz = s.z + lat.z * l;
            obs.push({ x0: cx - 0.55, z0: cz - 0.55, x1: cx + 0.55, z1: cz + 0.55, h: 1.3, vault: true, kind: 'barricade' });
        }
        CityGrid.addObstacles(obs); for (const o of obs) CityGrid.vaultables.push(o);
        for (const o of obs) g.nav._fill(o.x0, o.z0, o.x1, o.z1, 0);              // só a pista: as beiradas ficam livres
        this._close(e, true);

        // visual (peças de caixas emissivas) sob um nó que "sobe" na montagem
        const root = new BABYLON.TransformNode('barricade', sc); root.position.set(s.x, 0, s.z); root.scaling.y = 0.05;
        const th0 = Math.atan2(-lat.z, lat.x);
        const piece = (w, h, dd, lx, ly, vx, color, rotY = 0) => {
            const m = BABYLON.MeshBuilder.CreateBox('barP', { width: w, height: h, depth: dd }, sc);
            m.material = this._mat(color); m.parent = root; m.rotation.y = th0 + rotY; m.isPickable = false;
            m.position.set(lat.x * lx + ax.x * vx, ly, lat.z * lx + ax.z * vx);
            return m;
        };
        const sofa = ['#8a3a3a', '#3a6a7a', '#7a6a3a', '#5a3a6a'][Math.floor(Math.random() * 4)];
        piece(2.6, 0.7, 1.0, -1.3, 0.35, 0.0, sofa);                 // sofá (assento)
        piece(2.6, 0.7, 0.3, -1.3, 0.85, -0.35, this._shade(sofa));  // encosto
        piece(1.7, 0.18, 1.3, 1.1, 0.09, 0.1, '#9a7040'); piece(1.6, 0.18, 1.2, 1.2, 0.27, -0.1, '#8a6232'); piece(1.5, 0.18, 1.1, 1.0, 0.45, 0.0, '#a27a46');      // paletes empilhados
        piece(5.8, 0.14, 0.14, 0, 1.0, 0.0, '#7a7a82');              // trilho atravessado
        const tires = [];
        for (const lx of [-2.5, 0.2, 2.5]) {
            const t = BABYLON.MeshBuilder.CreateCylinder('barT', { diameter: 1.0, height: 0.45, tessellation: 12 }, sc);
            t.material = this._mat('#18181a'); t.parent = root; t.isPickable = false;
            t.position.set(lat.x * lx + ax.x * 0.5, 0.25, lat.z * lx + ax.z * 0.5);
            tires.push({ x: s.x + lat.x * lx + ax.x * 0.5, z: s.z + lat.z * lx + ax.z * 0.5 });
        }

        // física (carros e o resto): caixa estática atravessada na rua
        let agg = null, node = null;
        if (g.physics && g.physics.ready) {
            node = new BABYLON.TransformNode('barCollider', sc);
            node.position.set(s.x, 0.7, s.z); node.rotation.y = th0;
            agg = g.physics.addStaticBox(node, new BABYLON.Vector3(hw * 2, 1.4, th * 2));
        }
        const b = { e, x: s.x, z: s.z, obs, root, tires, agg, node, t: 0, built: 0, fid: [], sid: [], puffT: 0 };
        for (let i = 0; i < 3 && this._fused < this._fid.length; i++) b.fid.push(this._fid[this._fused++]);
        for (let i = 0; i < 5 && this._sused < this._sid.length; i++) b.sid.push(this._sid[this._sused++]);
        b.puffs = b.sid.map((id, i) => ({ id, age: i / b.sid.length * 2.4, tire: tires[i % 3] }));
        this.list.push(b);
        AudioFX.thud(s.x, s.z);
    }

    _shade(hex) { const c = BABYLON.Color3.FromHexString(hex).scale(0.75); return c.toHexString(); }

    _dismantle(b) {
        const g = this.g, i = this.list.indexOf(b);
        if (i >= 0) this.list.splice(i, 1);
        this._close(b.e, false);
        const S = CityGrid.CELL;
        for (const ob of b.obs) {
            const k = CityGrid.obstacles.indexOf(ob); if (k >= 0) CityGrid.obstacles.splice(k, 1);
            const v = CityGrid.vaultables.indexOf(ob); if (v >= 0) CityGrid.vaultables.splice(v, 1);
            for (let ci = Math.floor(ob.x0 / S); ci <= Math.floor(ob.x1 / S); ci++) for (let cj = Math.floor(ob.z0 / S); cj <= Math.floor(ob.z1 / S); cj++) {
                const cell = CityGrid._grid.get(CityGrid._gridKey(ci, cj)); if (!cell) continue;
                const q = cell.indexOf(ob); if (q >= 0) cell.splice(q, 1);
            }
            g.nav._fill(ob.x0, ob.z0, ob.x1, ob.z1, 1);
        }
        if (b.agg) { b.agg.dispose(); const j = g.physics.staticBodies.indexOf(b.agg); if (j >= 0) g.physics.staticBodies.splice(j, 1); }
        if (b.node) b.node.dispose();
        b.root.getChildMeshes().forEach((m) => m.dispose()); b.root.dispose();
        for (const id of b.fid) this.fire.off(id);
        for (const id of b.sid) this.smoke.off(id);
    }

    dismantleAll() { while (this.list.length) this._dismantle(this.list[0]); }

    // `op`: PoliceOperation (active, t, center). Monta/desmonta conforme a operação.
    update(dt, op, inside = true) {
        const g = this.g;
        this._t += dt;
        const active = op && op.active && inside;
        if (!inside && this.list.length) { this.dismantleAll(); this._idle = 0; }               // fora da favela as barricadas somem na hora (é como se não existissem)
        if (active) {
            this._spawnT -= dt;
            const target = op.t > 5 ? Math.min(5, 2 + Math.floor((op.t - 5) / 18)) : 0;
            if (this._spawnT <= 0 && this.list.length < target) {
                this._spawnT = 3;
                const [c] = this._pick(op.center, 1);
                if (c) this._build(c);
            }
        } else if (this.list.length) {
            this._idle = (this._idle || 0) + dt;
            if (this._idle > 60) { this._idle = 0; this.dismantleAll(); }
        } else this._idle = 0;
        if (active) this._idle = 0;

        // animação: montagem, fogo, fumaça
        const F = this.fire, S = this.smoke;
        for (const b of this.list) {
            b.t += dt;
            b.root.scaling.y = Math.min(1, 0.05 + b.t / 1.2);
            const k = Math.min(1, b.t / 1.2);
            b.tires.forEach((t, i) => {
                const id = b.fid[i]; if (id === undefined) return;
                const p = 0.7 + 0.3 * Math.sin(this._t * 9 + i * 2.1 + b.x), q = 0.5 + 0.5 * Math.sin(this._t * 5.3 + i * 1.3);
                F.place(id, t.x, 0.9 + 0.25 * q, t.z, 2.2 + 1.2 * p * k);
                F.color(id, 1, 0.45 + 0.25 * q, 0.1, 0.85 * k);
            });
            for (const pf of b.puffs) {
                pf.age += dt; if (pf.age > 2.6) pf.age = 0;
                const a = pf.age / 2.6;
                S.place(pf.id, pf.tire.x + a * 1.2, 1.0 + a * 5.5, pf.tire.z + a * 0.8, 1.2 + a * 3.2);
                S.color(pf.id, 0.18, 0.18, 0.2, Math.max(0, (1 - a) * 0.55 * k));
            }
        }
        F.flush(); S.flush();
    }
}
