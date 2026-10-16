// ============================================================================
// MotoStands — os PONTOS DE MOTOTÁXI da favela (3 pontos fixos, marcados no mapa) e o serviço de corrida.
// No ponto (E): escolhe o destino — outros pontos, safe house/casa, baile (se rolando), entrada da favela, imóveis seus ou o destino
// marcado no mapa — SÓ dentro da favela e redondezas (`inZone`: favela + 110 u); a cidade não é atendida. Preço bem abaixo de Uber
// e táxi (R$ 3 + R$ 0,012/m; Uber R$ 7 + 0,045/m; táxi R$ 8 + 0,06/m — a tela mostra a comparação). Paga em dinheiro (sujo).
// A corrida é de verdade: o mototaxista leva você pelos becos e ruas do morro (FavelaPlan.route; fora dele, Gps.route) a ~14 u/s,
// fora do trânsito, pedestres saem da frente;
// você vai invisível/invulnerável e a câmera acompanha a moto. Não pega quem está com a polícia no rastro.
// ============================================================================

const MotoStands = {
    stands: null, built: false, near: 110,
    FARE: { base: 3, perM: 0.012 }, UBER: { base: 7, perM: 0.045 }, TAXI: { base: 8, perM: 0.06 },

    inZone(x, z) { return Standing.nearFavela(x, z, this.near); },
    fare(len, k = this.FARE) { return Math.max(1, Math.round(k.base + k.perM * len)); },
    // Caminho da corrida: { pts: [{ x, z }], len }. Dentro do morro, pelos becos (e ruas); para fora, pelas ruas.
    path(from, to) {
        if (FavelaPlan.built && Standing.inFavela(from.x, from.z) && Standing.inFavela(to.x, to.z)) {
            const r = FavelaPlan.route(from.x, from.z, to.x, to.z);
            if (r && r.length) {
                const pts = [{ x: from.x, z: from.z }].concat(r.map((p) => ({ x: p[0], z: p[1] })), [{ x: to.x, z: to.z }]);
                let len = 0; for (let i = 1; i < pts.length; i++) len += hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
                return { pts, len };
            }
        }
        return Gps.route({ x: from.x, z: from.z }, { x: to.x, z: to.z });
    },

    _build(g) {
        this.built = true;
        const b = Standing._bounds(), W = b.x1 - b.x0, home = SafeHouse.spawnWorld();
        const want = [{ name: 'Ponto da Entrada', fx: 0.05, z: (b.z0 + b.z1) / 2 + 40 }, { name: 'Ponto do Meio do Morro', fx: 0.5, z: b.z0 + (b.z1 - b.z0) * 0.3 }, { name: 'Ponto do Alto do Morro', fx: 0.82, z: b.z0 + (b.z1 - b.z0) * 0.62 }];
        this.stands = [];
        const roadNodes = FavelaPlan.built ? FavelaPlan.graph.nodes.filter((n) => n.road && FavelaPlan.inside(n.x, n.z)) : [];
        for (const w of want) {
            const tx = b.x1 - w.fx * W; let best = null, bd = 1e9;
            for (const n of roadNodes) {                                         // na beira de uma das ruas do morro
                if (home && hypot(n.x - home.x, n.z - home.z) < 30) continue;
                const d = hypot(n.x - tx, n.z - w.z);
                if (d < bd) { bd = d; best = n; }
            }
            if (!best) continue;
            let sx = best.x, sz = best.z;
            const r = RoadPlan.nearestRoadPoint(best.x, best.z, 12);
            const F = FavelaPlan, ground = (x, z) => [F.GAP, F.OUT, F.OPEN, F.ALLEY].includes(F.cellAt(x, z));
            search: for (const o of r ? [2.2, 3, 4] : []) for (const sd of [1, -1]) {      // na beirada, fora da pista, do lado que tem chão (não barraco)
                const oo = r.edge.w / 2 + o, x = r.x - r.tz * oo * sd, z = r.z + r.tx * oo * sd;
                if (ground(x, z) && ground(x + 1.2, z) && ground(x - 1.2, z) && ground(x, z + 1.2) && ground(x, z - 1.2)) { sx = x; sz = z; break search; }
            }
            const s = { name: w.name, x: sx, z: sz, actors: [], sign: null };
            this.stands.push(s);
            CityGrid.addPoi({ type: 'mototaxi', name: w.name, x: s.x, z: s.z });
        }
        this.glow = new GlowBatch(g.scene, 8, 'mtStandGlow', 'glow');
        for (let i = 0; i < 8; i++) { this.glow.alloc(); this.glow.off(i); }
        this._t = 0;
    },

    _stream(g, pos) {
        const [va, vb] = CharacterRig.VARIANT_GROUPS.poor;
        for (const s of this.stands) {
            const on = hypot(s.x - pos.x, s.z - pos.z) < 120;
            if (on && !s.actors.length) {
                for (let k = 0; k < 2; k++) {
                    const a = Bikes.actor(g, 'moto', va + Math.floor(Math.random() * (vb - va + 1)), 'mtStand');
                    a.setY(1.5); a.setPosition(s.x + (k ? 1.6 : -0.2), s.z + (k ? -0.4 : 0.5)); a.setHeading(k ? 0.5 : -0.4);
                    s.actors.push(a);
                }
                // placa no chão: faixa amarela e preta com o nome
                const tex = new BABYLON.DynamicTexture('mtSign', { width: 512, height: 128 }, g.scene, false), c = tex.getContext();
                c.fillStyle = '#ffd23a'; c.fillRect(0, 0, 512, 128); c.fillStyle = '#16161a';
                for (let x = -128; x < 512; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 32, 0); c.lineTo(x + 96, 128); c.lineTo(x + 64, 128); c.fill(); }
                c.fillStyle = '#ffd23a'; c.fillRect(40, 24, 432, 80); c.fillStyle = '#16161a'; c.font = 'bold 66px Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('MOTOTÁXI', 256, 66);
                tex.update();
                const m = BABYLON.MeshBuilder.CreateGround('mtSign', { width: 3.6, height: 0.9 }, g.scene), mat = new BABYLON.StandardMaterial('mtSignMat', g.scene);
                mat.diffuseColor = BABYLON.Color3.Black(); mat.specularColor = BABYLON.Color3.Black(); mat.emissiveTexture = tex; mat.disableLighting = true;
                m.material = mat; m.position.set(s.x + 0.6, 0.3, s.z - 1.9); m.isPickable = false; s.sign = { m, mat, tex };
            } else if (!on && s.actors.length) {
                for (const a of s.actors) a.dispose();
                s.actors = [];
                if (s.sign) { s.sign.m.dispose(); s.sign.mat.dispose(); s.sign.tex.dispose(); s.sign = null; }
            }
        }
    },

    update(dt, g, pos) {
        if (!this.built) { if (CityGrid.intersections) this._build(g); else return; }
        this._t += dt;
        this._stream(g, pos);
        const G = this.glow, f = g.camera.target, pulse = 0.7 + 0.3 * Math.sin(this._t * 3);
        this.stands.forEach((s, i) => {
            if (hypot(s.x - f.x, s.z - f.z) > 70) { G.off(i); return; }
            G.place(i, s.x + 0.6, 0.35, s.z - 0.6, 3 + 0.5 * pulse); G.color(i, 1, 0.82, 0.2, 0.7 * pulse);
            for (const a of s.actors) { if (!a.clip) a.play('static'); a.setLean(0); a.update(dt, 0); }          // (parado no ponto: piloto reto)
        });
        G.flush();
    },

    nearStand(g, maxD = 3.4) {
        if (!this.built || g.mode !== 'player' || g.motoRide) return null;
        const p = g.player.position;
        let best = null, bd = maxD;
        for (const s of this.stands) { const d = hypot(s.x - p.x, s.z - p.z); if (d < bd) { bd = d; best = s; } }
        return best;
    },
    prompt(g) { const s = this.nearStand(g); return s ? `<b>E</b> chamar mototáxi — ${s.name}<small>só favela e redondezas · bem mais barato que Uber e táxi</small>` : ''; },
    interact(g) {
        const s = this.nearStand(g);
        if (!s || !g.motoUI) return false;
        if (g.wanted.level > 0) { g._flash('O mototaxista não leva quem está com a polícia no rastro'); return true; }
        g.motoUI.show(s);
        return true;
    },

    // Destinos oferecidos a partir do ponto `from`.
    destinations(g, from) {
        const out = [];
        const add = (label, x, z, note = '') => {
            const len = this.path(from, { x, z }).len;
            out.push({ label, note, x, z, len, fare: this.fare(len), uber: this.fare(len, this.UBER), taxi: this.fare(len, this.TAXI), ok: this.inZone(x, z) });
        };
        for (const s of this.stands) if (s !== from) add(s.name, s.x, s.z);
        const b = Standing._bounds();
        add('Entrada da favela (lado da cidade)', b.x1 - 6, (b.z0 + b.z1) / 2);
        if (SafeHouse.spawnWorld()) { const d = SafeHouse.doorWorld(); add('Safe house da favela', d.x, d.z - 2); }
        if (Baile.on && Baile.c) add('Baile funk 🔊', Baile.c.x, Baile.c.z - 4, 'rolando agora');
        for (const p of RealEstate.list) if (RealEstate.isOwned(p) && this.inZone(p.x, p.z)) add('Meu imóvel: ' + p.type, p.x, p.z);
        if (g.gps) { add('Destino marcado no mapa: ' + (g.gps.label || ''), g.gps.x, g.gps.z); if (!this.inZone(g.gps.x, g.gps.z)) out[out.length - 1].note = 'o mototáxi só roda na favela e redondezas'; }
        return out;
    },
};

// ----------------------------------------------------------------------------- a corrida
class MotoRide {
    constructor(game, dest, from) {
        this.g = game;
        const r = MotoStands.path(from, dest);
        this.pts = r.pts.filter((p, i, a) => i === 0 || hypot(p.x - a[i - 1].x, p.z - a[i - 1].z) > 0.5);
        this.dest = dest; this.i = 1; this.t = 0;
        const [va, vb] = CharacterRig.VARIANT_GROUPS.poor;
        this.actor = Bikes.actor(game, 'moto', va + Math.floor(Math.random() * (vb - va + 1)), 'mtRide');
        this.actor.play('static');
        const p0 = this.pts[0], n = this.pts[1] || p0;
        this.x = p0.x; this.z = p0.z; this.v = 0; this.speed = 14;
        this.heading = Math.atan2(n.x - p0.x, n.z - p0.z);
        const pl = game.player;
        pl.setVisible(false); pl.invulnerable = true; pl.velocity.setAll(0);
        this.actor.setY(1.5); this.actor.setPosition(this.x, this.z);
        game.camera.snapTo(pl.position);
    }
    finish() {
        const g = this.g, pl = g.player, d = this.dest;
        const p = g.nav.closestPoint(new BABYLON.Vector3(d.x, 0, d.z), 12);
        pl.teleport(p); pl.setVisible(true); pl.invulnerable = false; pl.velocity.setAll(0);
        this.actor.dispose(); g.motoRide = null;
        g.camera.snapTo(pl.position);
        g._flash('🛵 Chegamos! Boa viagem');
        AudioFX.blip(880, 0.15, 0.16);
    }
    update(dt) {
        const g = this.g; this.t += dt;
        if (!this.actor.clip) this.actor.play('static');
        const tgt = this.pts[this.i];
        if (!tgt) { this.finish(); return; }
        const dx = tgt.x - this.x, dz = tgt.z - this.z, L = hypot(dx, dz), ux = L > 0.001 ? dx / L : 0, uz = L > 0.001 ? dz / L : 0;
        const want = Math.atan2(ux, uz);
        let da = (want - this.heading) % (Math.PI * 2); if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
        this.heading += da * (1 - Math.exp(-10 * dt));
        const lastLeg = this.i >= this.pts.length - 1, vt = this.speed * (1 - 0.5 * Math.min(1, Math.abs(da) / 1.2)) * (lastLeg && L < 8 ? 0.5 : 1);
        this.v += (vt - this.v) * (1 - Math.exp(-4 * dt));
        const step = this.v * dt;
        if (step >= L) { this.x = tgt.x; this.z = tgt.z; this.i++; } else { this.x += ux * step; this.z += uz * step; }
        this.actor.setPosition(this.x, this.z); this.actor.setHeading(this.heading);
        this.actor.update(dt, 0); this.actor.setLean(Math.max(-1, Math.min(1, da / 0.45)), dt);     // (da > 0 = virando para a direita: deita para a direita)
        // o jogador "vai na garupa": a posição dele acompanha a moto (polícia, câmera, mapa, tudo enxerga)
        g.player.teleport(new BABYLON.Vector3(this.x, 0, this.z)); g.player.velocity.setAll(0);
        if (g.motoTaxis) g.motoTaxis._pedestrians(this, ux, uz);
        if (this.i >= this.pts.length) this.finish();
    }
}

// ----------------------------------------------------------------------------- tela de destinos
class MotoTaxiUI {
    constructor(game) {
        this.g = game; this.open = false; this.cool = 0; this.sel = 0; this.opts = [];
        const st = document.createElement('style');
        st.textContent = `
        #motoUI .mp{width:min(680px,95vw);max-height:92vh;overflow:auto}
        #motoUI .opt b{color:#86efac;font:700 14px var(--font-d);float:right}
        #motoUI .msg{color:#fda4af !important}`;
        document.head.appendChild(st);
        const r = this.root = document.createElement('div'); r.id = 'motoUI';
        r.innerHTML = '<div class="mp"><h3>🛵 Mototáxi</h3><div class="sub"></div><div class="opts"></div><div class="msg"></div></div>';
        document.body.appendChild(r);
        this.$sub = r.querySelector('.sub'); this.$opts = r.querySelector('.opts'); this.$msg = r.querySelector('.msg');
        r.addEventListener('mousedown', (e) => { if (e.target === r) this.close(); });
        window.addEventListener('keydown', (e) => this._key(e));
    }
    update(dt) { if (this.cool > 0) this.cool -= dt; }
    show(stand) {
        this.stand = stand; this.open = true; this.sel = 0; this.$msg.textContent = '';
        this.root.style.display = 'flex';
        if (this.g.input.releaseVirtual) this.g.input.releaseVirtual('pad');
        AudioFX.blip(480, 0.1, 0.15);
        this.render();
    }
    close() { if (!this.open) return; this.open = false; this.cool = 0.35; this.root.style.display = 'none'; AudioFX.blip(360, 0.1, 0.12); }
    render() {
        const g = this.g, inv = g.inventory;
        this.$sub.innerHTML = `${this.stand.name.toUpperCase()}<br>SEU DINHEIRO: ${brl(inv.cash)} · só favela e redondezas · a cidade não é atendida`;
        this.opts = MotoStands.destinations(g, this.stand).map((d) => Object.assign(d, { can: d.ok && inv.cash >= d.fare }));
        this.sel = Math.max(0, Math.min(this.sel, this.opts.length - 1));
        this.$opts.replaceChildren(...this.opts.map((d, i) => {
            const b = document.createElement('button');
            b.className = 'opt' + (i === this.sel ? ' sel' : '') + (d.can ? '' : ' off');
            const eco = Math.round((1 - d.fare / d.uber) * 100);
            b.innerHTML = `${d.label}<b>${brl(d.fare)}</b><small>${Math.round(d.len)} m · Uber ${brl(d.uber)} · Táxi ${brl(d.taxi)} · você economiza ${eco}% ${d.note ? '· ' + d.note : ''}${!d.ok ? ' · FORA DA ÁREA' : (inv.cash < d.fare ? ' · sem dinheiro' : '')}</small>`;
            b.addEventListener('click', () => { this.sel = i; this.choose(); });
            return b;
        }));
    }
    choose() {
        const d = this.opts[this.sel], g = this.g;
        if (!d || !d.can) { this.$msg.textContent = !d ? '' : (d.ok ? 'Dinheiro insuficiente' : 'O mototáxi só roda na favela e redondezas'); AudioFX.blip(160, 0.1, 0.14); return; }
        g.inventory.cash -= d.fare;
        this.close();
        g._flash(`🛵 Corrida paga (-${brl(d.fare)}). Segura aí!`);
        g.motoRide = new MotoRide(g, { x: d.x, z: d.z }, this.stand);
    }
    _key(e) {
        if (!this.open) return;
        const k = e.key;
        if (k === 'Escape' || k === 'e' || k === 'E' || k === 'Backspace') { this.close(); e.preventDefault(); e.stopPropagation(); return; }
        if (k === 'ArrowUp' || k === 'w' || k === 'W') this.sel = (this.sel + this.opts.length - 1) % this.opts.length;
        else if (k === 'ArrowDown' || k === 's' || k === 'S') this.sel = (this.sel + 1) % this.opts.length;
        else if (k === 'Enter' || k === ' ') { this.choose(); e.preventDefault(); e.stopPropagation(); return; }
        else return;
        e.preventDefault(); e.stopPropagation();
        this.render();
    }
}
