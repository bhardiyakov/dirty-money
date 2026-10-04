// ============================================================================
// MotoTaxi — os MOTOTÁXIS da favela: motos com piloto que cortam as VIELAS em alta velocidade, COMPLETAMENTE FORA do sistema de
// trânsito (sem física, sem rotas de carro, sem semáforo, não esperam ninguém). Cada uma segue o grafo de vielas ('fav' do RoadPlan)
// em linha reta de cruzamento a cruzamento, escolhe sozinha a próxima viela (sem voltar, a não ser em beco sem saída), desacelera
// um pouco nas curvas e buzina ao passar perto do jogador. Pedestres que estão no caminho se assustam e saem da frente; quem a moto
// pega a pé (jogador) leva dano e é empurrado. Barricadas fechadas (RoadNet.closed) desviam a rota. Existem só perto do jogador
// (streaming) e sobem de número no baile funk (mais gente circulando).
// ============================================================================

class MotoTaxis {
    constructor(game) {
        this.g = game;
        this.list = [];
        this._t = 0; this._honkCd = 0; this._hitCd = 0;
        this.base = 6;              // quantas rodam (12 no baile)
        this.speed = 13.5;          // u/s em reta
    }

    // ---------------------------------------------------------------- grafo das vielas
    _legs(node) {                                                             // pernas 'fav' abertas de um nó: [{ di, to }]
        const out = [];
        for (let di = 0; di < 4; di++) {
            const nb = node.nbr[di], ed = node.edge && node.edge[di];
            if (!nb || !ed || ed.cls !== 'fav') continue;
            if (RoadNet.isClosed(node, RoadNet.DIRS[di])) continue;           // barricada: ela desvia
            out.push({ di, to: nb });
        }
        return out;
    }
    _nodeNear(x, z) {
        let best = null, bd = 1e9;
        for (const n of RoadPlan.nodes) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd && Standing.inFavela(n.x, n.z)) { bd = d; best = n; } }
        return best;
    }

    _spawn(pos) {
        const g = this.g, from = this._nodeNear(pos.x, pos.z);
        if (!from) return null;
        const legs = this._legs(from); if (!legs.length) return null;
        const leg = legs[Math.floor(Math.random() * legs.length)];
        const [va, vb] = CharacterRig.VARIANT_GROUPS.poor;
        const actor = new SpriteActor(g.scene, Bikes.sheet(g.sprites, 'moto', 'ride'), va + Math.floor(Math.random() * (vb - va + 1)), 'mototaxi');
        actor.play('static');
        const t = Math.random() * 0.8;                                         // começa no meio do trecho
        const x = from.x + (leg.to.x - from.x) * t, z = from.z + (leg.to.z - from.z) * t;
        const m = { actor, from, to: leg.to, di: leg.di, x, z, heading: Math.atan2(leg.to.x - from.x, leg.to.z - from.z), speed: this.speed * (0.85 + Math.random() * 0.3), v: 0, lean: 1, prev: from };
        actor.setPosition(x, z); actor.mesh.position.y = 1.5; actor.setHeading(m.heading);
        this.list.push(m);
        return m;
    }

    _remove(i) { this.list[i].actor.dispose(); this.list.splice(i, 1); }
    clear() { for (let i = this.list.length - 1; i >= 0; i--) this._remove(i); }

    // Escolhe a próxima viela ao chegar a um cruzamento.
    _next(m) {
        const node = m.to, legs = this._legs(node).filter((l) => l.to !== m.prev);
        const pool = legs.length ? legs : this._legs(node);                    // beco sem saída (ou barricada): volta
        if (!pool.length) { m.v = 0; m.stuck = true; return; }
        const leg = pool[Math.floor(Math.random() * pool.length)];
        m.prev = node; m.from = node; m.to = leg.to; m.di = leg.di;
    }

    update(dt, pos) {
        const g = this.g;
        this._t -= dt; this._honkCd -= dt; this._hitCd -= dt;
        const b = Standing._bounds();
        const near = pos.x > b.x0 - 200 && pos.x < b.x1 + 200 && pos.z > b.z0 - 200 && pos.z < b.z1 + 200;
        const want = near ? (Baile.on ? this.base * 2 : this.base) : 0;
        if (this._t <= 0) {
            this._t = 1.2;
            if (this.list.length < want) {                                    // nasce fora da tela (50–170 u do jogador), numa viela
                for (let k = 0; k < 10; k++) {
                    const a = Math.random() * 6.283, r = 50 + Math.random() * 120, x = pos.x + Math.cos(a) * r, z = pos.z + Math.sin(a) * r;
                    if (!Standing.inFavela(x, z)) continue;
                    if (this._spawn({ x, z })) break;
                }
            }
        }
        for (let i = this.list.length - 1; i >= 0; i--) {
            const m = this.list[i], d = hypot(m.x - pos.x, m.z - pos.z);
            if (!near || d > 260) { this._remove(i); continue; }
            if (m.stuck) { m.stuck = false; this._next(m); }
            // anda em linha reta rumo ao próximo cruzamento
            const dx = m.to.x - m.x, dz = m.to.z - m.z, L = hypot(dx, dz);
            const ux = L > 0.001 ? dx / L : 0, uz = L > 0.001 ? dz / L : 0;
            const tgt = Math.atan2(ux, uz);
            let da = (tgt - m.heading) % (Math.PI * 2); if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
            m.heading += da * (1 - Math.exp(-9 * dt));
            const turning = Math.min(1, Math.abs(da) / 1.2);
            const vt = m.speed * (1 - 0.55 * turning) * (L < 6 ? 0.7 : 1);                 // freia um pouco antes da curva
            m.v += (vt - m.v) * (1 - Math.exp(-5 * dt));
            const step = m.v * dt;
            if (step >= L) { m.x = m.to.x; m.z = m.to.z; this._next(m); } else { m.x += ux * step; m.z += uz * step; }
            m.lean = Math.abs(da) < 0.18 ? 1 : (da > 0 ? 2 : 0);
            if (!m.actor.clip) m.actor.play('static');                         // (folha ainda sendo assada: tenta de novo)
            m.actor.setPosition(m.x, m.z); m.actor.setHeading(m.heading); m.actor.setFrame(m.lean); m.actor.update(dt, 0);

            // pedestres na frente se assustam; o jogador a pé é atropelado
            if (d < 70) this._pedestrians(m, ux, uz);
            if (d < 14 && this._honkCd <= 0 && m.v > 6) { this._honkCd = 2.5; AudioFX.blip(330, 0.18, 0.1 * (1 - d / 14)); }
            if (d < 1.15 && m.v > 6 && this._hitCd <= 0 && g.mode === 'player' && g.player.alive) {
                this._hitCd = 1.6;
                g.player.takeDamage(12);
                g.player.velocity.x += ux * 9; g.player.velocity.z += uz * 9;
                g._flash('🛵 Mototáxi te atropelou na viela!');
                AudioFX.thud(m.x, m.z); g.camera.shake(0.25);
            }
        }
    }

    _pedestrians(m, ux, uz) {
        const M = this.g.npcManager; if (!M) return;
        const P = new BABYLON.Vector3(m.x - ux * 2, 0, m.z - uz * 2);
        for (const n of M.npcs) {
            if (!n.alive || n.state === 'FLEE' || n.state === 'HURT') continue;
            const dx = n.position.x - m.x, dz = n.position.z - m.z, ahead = dx * ux + dz * uz;
            if (ahead > -1 && ahead < 9 && Math.abs(dx * uz - dz * ux) < 2.2) n.panic(P);          // quem está na frente sai da frente
        }
    }
}
