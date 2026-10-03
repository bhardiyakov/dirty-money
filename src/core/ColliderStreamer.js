// ============================================================================
// ColliderStreamer — o mundo tem ~2.700 colisores estáticos (prédios, píeres, muretas), mas só os que estão perto do foco da
// câmera precisam existir no Havok. Manter todos custava ~4 ms por frame (o Havok varre todos os corpos a cada passo).
// Aqui os PhysicsAggregate nascem quando o colisor entra no raio `radius` e são destruídos (dispose) quando passa de
// `radius + gap` (histerese). Grade espacial de 128 u: a consulta só olha as células em volta.
// ============================================================================

class ColliderStreamer {
    constructor(physics, colliders, radius = 220, gap = 50) {
        this.physics = physics;
        this.radius = radius; this.gap = gap;
        this.items = colliders.map((c) => ({ c, x: c.node.position.x, z: c.node.position.z, agg: null }));
        this.cell = 128;
        this.grid = new Map();
        for (const it of this.items) {
            const k = this._key(Math.floor(it.x / this.cell), Math.floor(it.z / this.cell));
            let a = this.grid.get(k); if (!a) this.grid.set(k, a = []); a.push(it);
        }
        this.active = [];
        this._t = 0; this._last = null;
    }

    _key(i, j) { return (i + 4096) * 8192 + (j + 4096); }

    _make(it) {
        const agg = this.physics.addStaticBox(it.c.node, it.c.size);
        this.physics.staticBodies.pop();                                  // (quem manda na vida do corpo é o streamer)
        if (it.c.mask && agg.shape) agg.shape.filterMembershipMask = it.c.mask;      // (2 = guarda-corpo do viaduto: só a camada de cima colide)
        it.agg = agg;
        this.active.push(it);
    }

    // budget: nº máximo de corpos criados neste chamado (Infinity = tudo, no começo ou depois de um teleporte).
    refresh(fx, fz, budget = Infinity) {
        const R = this.radius, S = this.cell, r2 = R * R;
        const i0 = Math.floor((fx - R) / S), i1 = Math.floor((fx + R) / S), j0 = Math.floor((fz - R) / S), j1 = Math.floor((fz + R) / S);
        let made = 0;
        for (let i = i0; i <= i1 && made < budget; i++) for (let j = j0; j <= j1 && made < budget; j++) {
            const a = this.grid.get(this._key(i, j)); if (!a) continue;
            for (const it of a) {
                if (it.agg) continue;
                const dx = it.x - fx, dz = it.z - fz;
                if (dx * dx + dz * dz > r2) continue;
                this._make(it);
                if (++made >= budget) break;
            }
        }
        const far2 = (R + this.gap) * (R + this.gap);
        for (let k = this.active.length - 1; k >= 0; k--) {
            const it = this.active[k], dx = it.x - fx, dz = it.z - fz;
            if (dx * dx + dz * dz <= far2) continue;
            it.agg.dispose(); it.agg = null;
            this.active[k] = this.active[this.active.length - 1]; this.active.pop();
        }
    }

    update(dt, fx, fz) {
        this._t -= dt;
        if (this._t > 0) return;
        this._t = 0.25;
        const jump = !this._last || Math.abs(fx - this._last.x) + Math.abs(fz - this._last.z) > 160;
        this._last = { x: fx, z: fz };
        this.refresh(fx, fz, jump ? Infinity : 40);
    }
}
