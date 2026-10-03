// ============================================================================
// WaterFx — marolas na água: anéis claros que se abrem e somem (GlowBatch 'ring', aditivo) enquanto o jogador vadeia
// ou nada. Pool pequeno e reaproveitado; o resto do jogo só chama `ripple(x, z, size)`.
// ============================================================================

class WaterFx {
    constructor(scene, capacity = 90) {
        this.batch = new GlowBatch(scene, capacity, 'waterRipples', 'ring');
        this.n = capacity;
        this.r = [];
        for (let i = 0; i < capacity; i++) { this.batch.alloc(); this.r.push({ on: false, age: 0, life: 1, x: 0, z: 0, s0: 1, s1: 2, a: 0.5 }); }
        this.next = 0;
        this.cd = 0;
    }

    // Uma marola em (x, z) que cresce de `s0` a `s1` unidades em `life` s.
    ripple(x, z, s0 = 0.8, s1 = 2.8, life = 0.9, a = 0.55) {
        for (let k = 0; k < this.n; k++) {
            const q = this.r[(this.next + k) % this.n];
            if (q.on) continue;
            q.on = true; q.age = 0; q.life = life; q.x = x; q.z = z; q.s0 = s0; q.s1 = s1; q.a = a;
            this.next = (this.next + k + 1) % this.n;
            return;
        }
    }

    // Segue o jogador: depth = metros dentro da água (0 = fora), speed = velocidade a pé, swimming = nadando.
    follow(dt, pos, depth, speed, swimming) {
        if (depth > 0) {
            this.cd -= dt;
            const moving = speed > 0.5;
            if (this.cd <= 0 && (moving || swimming)) {
                this.cd = swimming ? 0.3 : 0.2;
                const jitter = () => (Math.random() - 0.5) * 0.5;
                this.ripple(pos.x + jitter(), pos.z + jitter(), swimming ? 1.2 : 0.8, swimming ? 4.2 : 2.6, swimming ? 1.2 : 0.8, swimming ? 0.5 : 0.6);
            } else if (this.cd <= 0) {                                   // parado: marola lenta ao redor
                this.cd = 0.9;
                this.ripple(pos.x, pos.z, 1.0, 3.4, 1.6, 0.35);
            }
        }
        this.update(dt);
    }

    update(dt) {
        const b = this.batch;
        for (let i = 0; i < this.n; i++) {
            const q = this.r[i];
            if (!q.on) continue;
            q.age += dt;
            if (q.age >= q.life) { q.on = false; b.off(i); continue; }
            const t = q.age / q.life;
            b.place(i, q.x, 0.2, q.z, q.s0 + (q.s1 - q.s0) * Math.sqrt(t));
            b.color(i, 0.75, 0.92, 1.0, q.a * (1 - t) * (1 - t * 0.3));
        }
        b.flush();
    }
}
