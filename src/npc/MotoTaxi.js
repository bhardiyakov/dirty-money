// ============================================================================
// MotoTaxi — os MOTOTÁXIS da favela: motos com piloto que cortam os BECOS em alta velocidade, COMPLETAMENTE FORA do sistema de
// trânsito (sem física, sem rotas de carro, sem semáforo, não esperam ninguém). Cada uma segue o grafo dos becos e das ruas do morro
// (FavelaPlan.graph) de ponto a ponto, escolhe sozinha o próximo trecho (sem voltar, a não ser em beco sem saída), desacelera
// um pouco nas curvas. APRESSADOS E IMPACIENTES: costuram — desviam pelo lado livre de pedestres, do jogador, de carros e de outros
// mototáxis (deslocamento lateral na viela), só freiam quando não há espaço, e aí buzinam sem parar. Se mesmo assim pegam alguém (ou
// batem num carro), a moto TOMBA: quem foi atingido leva dano e é arremessado, o piloto voa por cima, levanta, volta andando, levanta
// a moto e segue viagem (Casualty.remount — sem pânico). Barricadas em chamas desviam a rota. Existem só perto do
// jogador (streaming) e sobem de número no baile funk (mais gente circulando).
// ============================================================================

class MotoTaxis {
    constructor(game) {
        this.g = game;
        this.list = [];
        this._t = 0; this._honkCd = 0; this._hitCd = 0;
        this.base = 6;              // quantas rodam (12 no baile)
        this.speed = 15;            // u/s em reta (com pressa)
        this._obs = [];             // obstáculos do quadro (reaproveitados): { x, z, r, kind, ref }
        this._op = [];
    }

    // ---------------------------------------------------------------- grafo dos becos
    _legs(node) {                                                             // trechos abertos a partir de um nó: [{ to }]
        const B = this.g.barricades ? this.g.barricades.list : [];
        const out = [];
        for (const to of node.links) {
            if (B.length && B.some((b) => this._segDist(b.x, b.z, node, to) < 3.5)) continue;      // barricada: ela desvia
            out.push({ to });
        }
        return out;
    }
    _segDist(x, z, a, b) {
        const sx = b.x - a.x, sz = b.z - a.z, L2 = sx * sx + sz * sz || 1, t = Math.max(0, Math.min(1, ((x - a.x) * sx + (z - a.z) * sz) / L2));
        return hypot(x - a.x - sx * t, z - a.z - sz * t);
    }
    _nodeNear(x, z) { return FavelaPlan.built ? FavelaPlan.nodeNear(x, z) : null; }
    // Folga lateral para costurar no trecho atual (rua: 1,9 u; beco: o que sobra da largura) e a pressa (beco estreito: mais devagar).
    _lane(m) {
        const road = m.from.road && m.to.road, w = Math.min(m.from.w || 1.5, m.to.w || 1.5);
        m.LAT = road ? 1.9 : Math.max(0, w / 2 - 0.45);
        m.vmul = road ? 1 : (w < 2 ? 0.62 : 0.78);
    }

    _spawn(pos) {
        const g = this.g, from = this._nodeNear(pos.x, pos.z);
        if (!from) return null;
        const legs = this._legs(from); if (!legs.length) return null;
        const leg = legs[Math.floor(Math.random() * legs.length)];
        const [va, vb] = CharacterRig.VARIANT_GROUPS.poor;
        const actor = Bikes.actor(g, 'moto', va + Math.floor(Math.random() * (vb - va + 1)), 'mototaxi');
        actor.play('static');
        const t = Math.random() * 0.8;                                         // começa no meio do trecho
        const x = from.x + (leg.to.x - from.x) * t, z = from.z + (leg.to.z - from.z) * t;
        const m = { actor, from, to: leg.to, x, z, heading: Math.atan2(leg.to.x - from.x, leg.to.z - from.z), speed: this.speed * (0.85 + Math.random() * 0.3), v: 0, lean: 1, prev: from };
        this._lane(m);
        actor.setY(1.5); actor.setPosition(x, z); actor.setHeading(m.heading);
        this.list.push(m);
        return m;
    }

    _remove(i) { const m = this.list[i]; if (m.ad) m.ad.gone = true; m.actor.dispose(); this.list.splice(i, 1); }
    clear() { for (let i = this.list.length - 1; i >= 0; i--) this._remove(i); }

    // Escolhe a próxima viela ao chegar a um cruzamento.
    _next(m) {
        const node = m.to, legs = this._legs(node).filter((l) => l.to !== m.prev);
        const pool = legs.length ? legs : this._legs(node);                    // beco sem saída (ou barricada): volta
        if (!pool.length) { m.v = 0; m.stuck = true; return; }
        const leg = pool[Math.floor(Math.random() * pool.length)];
        m.prev = node; m.from = node; m.to = leg.to;
        this._lane(m);
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
        if (this.list.length) this._gather(pos);
        for (let i = this.list.length - 1; i >= 0; i--) {
            const m = this.list[i], d = hypot(m.x - pos.x, m.z - pos.z);
            if (!near || d > 260) { this._remove(i); continue; }
            if (m.down) { m.actor.update(dt, 0); continue; }                   // tombada: o piloto está voltando (Casualty.remount)
            if (m.stuck) { m.stuck = false; this._next(m); }
            // anda em linha reta rumo ao próximo cruzamento
            const dx = m.to.x - m.x, dz = m.to.z - m.z, L = hypot(dx, dz);
            const ux = L > 0.001 ? dx / L : 0, uz = L > 0.001 ? dz / L : 0;
            const tgt = Math.atan2(ux, uz);
            let da = (tgt - m.heading) % (Math.PI * 2); if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
            m.heading += da * (1 - Math.exp(-9 * dt));
            const turning = Math.min(1, Math.abs(da) / 1.2);
            let vt = m.speed * (m.vmul || 1) * (1 - 0.55 * turning) * (L < 6 ? 0.7 : 1);                 // freia um pouco antes da curva
            // costurando: desvia pelo lado livre de quem está no caminho; sem espaço, freia (e buzina, impaciente)
            const av = d < 90 ? this._avoid(m, ux, uz) : null;
            m.latT = av ? av.lat : 0;
            const dl = Math.max(-m.LAT, Math.min(m.LAT, m.latT)) - (m.lat || 0); m.lat = (m.lat || 0) + Math.sign(dl) * Math.min(Math.abs(dl), (av && av.ahead < 5 ? 6 : 3.5) * dt);
            if (av) {
                vt *= av.brake;
                m.honkCd = (m.honkCd || 0) - dt;
                if (av.brake < 0.9 && m.honkCd <= 0 && d < 60) { m.honkCd = av.brake < 0.4 ? 0.7 : 1.6; AudioFX.honk(m.x, m.z, m.pitch || (m.pitch = 1.15 + Math.random() * 0.3), av.brake < 0.4 ? 0.45 : 0.22); }
            }
            m.v += (vt - m.v) * (1 - Math.exp(-(vt < m.v ? 9 : 5) * dt));       // freia forte, arranca forte
            const step = m.v * dt;
            if (step >= L) { m.x = m.to.x; m.z = m.to.z; this._next(m); } else { m.x += ux * step; m.z += uz * step; }
            const steerLat = dl * 0.35;                                          // inclina para o lado em que está costurando
            m.lean = Math.max(-1, Math.min(1, (da + steerLat) / 0.45));       // (da > 0 = virando para a direita: deita para a direita)
            const hx = m.x + uz * m.lat, hz = m.z - ux * m.lat;                  // posição desenhada (deslocada para o lado)
            m.hx = hx; m.hz = hz;
            if (!m.actor.clip) m.actor.play('static');                         // (folha ainda sendo assada: tenta de novo)
            m.actor.setPosition(hx, hz); m.actor.setHeading(m.heading); m.actor.update(dt, 0); m.actor.setLean(m.lean, dt);

            // pedestre bem na frente ainda dá um pulo para o lado; quem a moto pega mesmo assim é atingido — e a moto vai ao chão
            if (d < 70) this._pedestrians(m, ux, uz);
            if (m.v > 4.5 && d < 70) { const o = this._touch(m, hx, hz); if (o) this._crash(m, o, ux, uz); }
        }
    }

    // Obstáculos à volta (uma vez por quadro): pedestres, traficantes, policiais, o jogador a pé, carros e os próprios mototáxis.
    _gather(pos) {
        const g = this.g, out = this._obs, pool = this._op;
        out.length = 0;
        let k = 0;
        const add = (x, z, r, kind, ref) => {
            if ((x - pos.x) ** 2 + (z - pos.z) ** 2 > 110 * 110) return;
            const o = pool[k] || (pool[k] = {}); k++;
            o.x = x; o.z = z; o.r = r; o.kind = kind; o.ref = ref; out.push(o);
        };
        if (g.mode === 'player' && g.player.alive) add(g.player.position.x, g.player.position.z, 0.45, 'player', g.player);
        const M = g.npcManager; if (M) for (const n of M.npcs) if (n.alive) add(n.position.x, n.position.z, 0.42, 'npc', n);
        if (g.gangs) for (const n of g.gangs.members) if (n.alive) add(n.position.x, n.position.z, 0.42, 'npc', n);
        if (g.policeManager) for (const n of g.policeManager.officers) if (n.alive) add(n.position.x, n.position.z, 0.42, 'npc', n);
        if (g.vehicleManager) for (const c of g.vehicleManager.vehicles) add(c.position.x, c.position.z, Math.max(c.halfW || 1, (c.halfLen || 2) * 0.8), 'car', c);
        for (const m of this.list) if (m.hx !== undefined) add(m.hx, m.hz, 0.6, 'moto', m);
    }

    // Quem está no corredor à frente (até ~12 m): devolve { lat, brake, ahead } — o deslocamento lateral que contorna o mais próximo
    // (o lado livre e mais perto do centro da viela) e quanto frear (1 = nada). null = caminho livre.
    _avoid(m, ux, uz) {
        const LAT = m.LAT !== undefined ? m.LAT : 1.9, lat = m.lat || 0;
        let best = null, ba = 1e9;
        for (const o of this._obs) {
            if (o.ref === m) continue;
            const dx = o.x - m.x, dz = o.z - m.z, ahead = dx * ux + dz * uz;
            if (ahead < -0.6 || ahead > 12) continue;
            const s = dx * uz - dz * ux, cl = o.r + 0.55;
            if (Math.abs(s - lat) < cl + 0.25 && ahead < ba) { ba = ahead; best = o; best._s = s; }
        }
        if (!best) return null;
        const s = best._s, cl = best.r + 0.7;
        const free = (L) => {
            if (Math.abs(L) > LAT) return false;
            for (const o of this._obs) {
                if (o === best || o.ref === m) continue;
                const dx = o.x - m.x, dz = o.z - m.z, ahead = dx * ux + dz * uz;
                if (ahead < -0.6 || ahead > ba + 4) continue;
                if (Math.abs(dx * uz - dz * ux - L) < o.r + 0.55) return false;
            }
            return true;
        };
        const cands = [s + cl, s - cl].sort((a, b) => Math.abs(a - lat) - Math.abs(b - lat));
        for (const L of cands) if (free(L)) return { lat: L, brake: ba < 3 ? 0.6 : 0.82, ahead: ba };
        // sem espaço dos lados: espera atrás (freia até parar, colado), buzinando
        return { lat, brake: Math.max(0, Math.min(1, (ba - 1.6) / 9)), ahead: ba };
    }

    // A moto encostou em alguém/algo (posição desenhada hx, hz)?
    _touch(m, hx, hz) {
        for (const o of this._obs) {
            if (o.ref === m || (o.kind === 'moto' && o.ref.down)) continue;
            const r = o.kind === 'car' ? o.r * 0.85 : o.r + 0.4;
            if ((o.x - hx) ** 2 + (o.z - hz) ** 2 < r * r) return o;
        }
        return null;
    }

    // Bateu: quem foi atingido leva o impacto; a moto tomba e o piloto voa por cima (depois volta para ela).
    _crash(m, o, ux, uz) {
        const g = this.g, pw = m.v * 0.7, from = { x: m.hx, z: m.hz };
        if (o.kind === 'player') {
            const pl = o.ref, dmg = Math.round(6 + m.v * 0.6), lethal = pl.hp - dmg <= 0;
            pl.takeDamage(dmg, true);
            if (typeof Blood !== 'undefined') Blood.beat(pl, dmg, 1);
            if (pw >= Config.ragdoll.minPower) pl.ragdoll({ dx: ux, dz: uz, power: pw, kind: 'hit', lethal });
            else { pl.velocity.x += ux * 7; pl.velocity.z += uz * 7; }
            g._flash('🛵 Um mototáxi te pegou na viela!');
            g.camera.shake(0.25);
        } else if (o.kind === 'npc') {
            o.ref.takeDamage(Math.round(5 + m.v * 0.5), from, 'env', { dx: ux, dz: uz, power: pw });
            if (typeof Blood !== 'undefined') Blood.beat(o.ref, 10, 1);
        } else if (o.kind === 'car') {
            if (o.ref.takeDamage) o.ref.takeDamage(2, 'env');
            AudioFX.crash(m.hx, m.hz, Math.min(1, m.v / 16));
        } else if (o.kind === 'moto') this._fall(o.ref, -ux, -uz);
        AudioFX.thud(m.hx, m.hz);
        if (g.combat) g.combat.spark(m.hx, 0.8, m.hz, [1, 0.85, 0.45]);
        this._fall(m, ux, uz);
    }

    // Moto ao chão: desenho tombado, o piloto vira um Casualty que levanta e volta (remount → adaptador desta moto).
    _fall(m, ux, uz) {
        if (m.down) return;
        const g = this.g, a = m.actor, r = a.rider, x = m.hx !== undefined ? m.hx : m.x, z = m.hz !== undefined ? m.hz : m.z;
        const variant = a.riderVariant != null ? a.riderVariant : 2, pw = Math.max(4, m.v * 0.75);
        m.down = true; m.v = 0;
        if (a.setModel) { a.setModel(Bikes.ART.moto + '_caida'); a.setRider(null); }
        const ad = m.ad = {
            gone: false, controlled: false, hold: false, burning: 0, mode: undefined, canRaise: true,
            get position() { return { x: m.hx !== undefined ? m.hx : m.x, z: m.hz !== undefined ? m.hz : m.z }; },
            get riderVariant() { return m.down || ad.up ? null : variant; },
            get wrecked() { return m.down && !ad.up; },
            raise() { ad.up = true; if (a.setModel) a.setModel(Bikes.ART.moto); return true; },
            setRider(v) {
                m.down = false; ad.up = false; m.v = 0; m.honkCd = 0;
                if (a.setRider) a.setRider(v, g.sprites.sheets.rider, 'ride_moto');
                AudioFX.honk(x, z, m.pitch || 1.2, 0.35);                         // voltou xingando
            },
        };
        g.casualties.push(new Casualty(g, { x, z }, {
            variant, sheet: variant % 2 ? 'civB' : 'civA', look: r && r.sheet && r.sheet.isNpc ? { sheet: r.sheet, row: r.npcRow } : null,
            threat: { x, z }, dx: ux, dz: uz, power: pw, kind: 'hit', lethal: false,
            remount: { bike: ad, variant },
        }));
    }

    _pedestrians(m, ux, uz) {
        const M = this.g.npcManager; if (!M) return;
        const P = new BABYLON.Vector3(m.x - ux * 2, 0, m.z - uz * 2);
        for (const n of M.npcs) {
            if (!n.alive || n.state === 'FLEE' || n.state === 'HURT') continue;
            const dx = n.position.x - m.x, dz = n.position.z - m.z, ahead = dx * ux + dz * uz;
            if (m.v > 6 && ahead > -1 && ahead < 3.5 && Math.abs(dx * uz - dz * ux - (m.lat || 0)) < 0.9) n.panic(P);      // (a moto não conseguiu desviar: pula da frente)
        }
    }
}
