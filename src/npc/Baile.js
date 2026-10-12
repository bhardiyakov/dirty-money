// ============================================================================
// Baile — o BAILE FUNK da favela. Sexta e sábado à noite (21h–5h), na QUADRA do meio do morro, rola um baile: palco com DJ e
// caixas de som, luzes coloridas piscando no ritmo, uma multidão dançando e o tamborzão (batida de funk sintetizada) que se ouve de
// longe. Mecânica: o som alto MASCARA os tiros — um disparo dentro do raio do baile (`covers`) não é ouvido pela polícia nem por
// quem está longe (só quem está a < 14 u escuta), o que permite assassinatos furtivos. Quem dança entra em pânico se tiver tiro por
// perto. Aparece no mapa (POI "Baile funk") e como blip rosa no minimapa. Para teste: `Baile.force = true`.
// ============================================================================

const Baile = {
    force: false,
    on: false, c: null, radius: 60,
    day0: 4,                              // 0=dom… : sexta (5) e sábado (6) com Economy.day%7 começando em 4 → 4,5 = "noites de baile"
    _built: false, _dancers: [], _meshes: [], _mats: {}, _poi: null, _partyList: [], _base: 0,
    _beat: 0, _step: 0, STEP: 60 / 130 / 4,

    // ---------------------------------------------------------------- agenda
    scheduled(game) {
        const h = game.dayNight.hour, d = Economy.day;
        const night = h >= 21 ? d : (h < 5 ? d - 1 : -1);
        return night >= 0 && (night % 7 === this.day0 || night % 7 === this.day0 + 1);
    },

    site() {
        if (this.c) return this.c;
        const q = FavelaPlan.built && FavelaPlan.squares.find((s) => s.kind === 'quadra');
        if (q) return (this.c = { x: (q.x0 + q.x1) / 2, z: (q.z0 + q.z1) / 2 - 1 });      // a quadra (o palco fica na metade norte)
        const b = Standing._bounds(), W = b.x1 - b.x0, tx = b.x1 - 0.47 * W, tz = (b.z0 + b.z1) / 2, home = SafeHouse.spawnWorld();
        let best = null, bd = 1e9;
        for (const n of RoadPlan.nodes) {
            if (!Standing.inFavela(n.x, n.z)) continue;
            const dp = Standing.depth(n.x, n.z);
            if (dp < 0.3 || dp > 0.65) continue;
            if (home && hypot(n.x - home.x, n.z - home.z) < 50) continue;
            const d = hypot(n.x - tx, n.z - tz);
            if (d < bd) { bd = d; best = n; }
        }
        this.c = best ? { x: best.x, z: best.z } : { x: tx, z: tz };
        return this.c;
    },

    covers(x, z) { return this.on && this.c && hypot(x - this.c.x, z - this.c.z) < this.radius; },

    // ---------------------------------------------------------------- reação a tiros (chamado pelo Game)
    onShot(pos) {
        if (!this.on || !this._built) return;
        for (const D of this._dancers) if (hypot(D.x - pos.x, D.z - pos.z) < 26) D.flee = 7;
    },

    // ---------------------------------------------------------------- construção (só perto do jogador)
    _mat(color) {
        if (!this._mats[color]) {
            const m = this._mats[color] = new BABYLON.StandardMaterial('baile_' + color, game.scene);
            m.diffuseColor = BABYLON.Color3.Black(); m.specularColor = BABYLON.Color3.Black(); m.emissiveColor = BABYLON.Color3.FromHexString(color); m.disableLighting = true;
        }
        return this._mats[color];
    },
    _matA(color, alpha) {                                                       // material translúcido (lonas das tendas)
        const k = color + '@' + alpha;
        if (!this._mats[k]) { const m = this._mats[k] = this._mat(color).clone('baileA_' + k); m.alpha = alpha; m.backFaceCulling = false; }
        return this._mats[k];
    },
    _box(w, h, d, x, y, z, color, alpha = 1) {
        const m = BABYLON.MeshBuilder.CreateBox('baileP', { width: w, height: h, depth: d }, game.scene);
        m.material = alpha < 1 ? this._matA(color, alpha) : this._mat(color); m.position.set(x, y, z); m.isPickable = false; this._meshes.push(m); return m;
    },

    _build(g) {
        const c = this.c, nav = g.nav, [va, vb] = CharacterRig.VARIANT_GROUPS.casual, [pa, pb] = CharacterRig.VARIANT_GROUPS.poor;
        // palco ao NORTE do cruzamento, virado para o sul (a multidão fica em frente), com as TENDAS coloridas por cima
        const st = nav.closestPoint(new BABYLON.Vector3(c.x, 0, c.z + 7));
        this.stage = { x: st.x, z: st.z };
        this._box(8.6, 0.45, 3.4, st.x, 0.22, st.z, '#2a2a30');
        this._box(2.2, 0.8, 0.8, st.x, 0.85, st.z - 0.4, '#3a3a44'); this._box(1.8, 0.08, 0.5, st.x, 1.28, st.z - 0.4, '#ff3ad0');
        for (const dx of [-3.9, 3.9]) { this._box(1.3, 2.9, 1.3, st.x + dx, 1.45, st.z, '#101014'); this._box(0.9, 0.9, 0.06, st.x + dx, 0.9, st.z - 0.68, '#4a4a54'); this._box(0.6, 0.6, 0.06, st.x + dx, 2.2, st.z - 0.68, '#4a4a54'); }
        // tendas (lonas de duas cores, como nos bailes de verdade): quatro faixas sobre o palco, acima dos telhados vizinhos
        const TY = 9.8, panels = [['#f2c230', '#2a63c8'], ['#d9302a', '#f2c230'], ['#14141a', '#2a63c8'], ['#e6c64a', '#1f3fa8']];
        panels.forEach((p, i) => {
            const x = st.x + (i - 1.5) * 3.05;
            this._box(2.95, 0.14, 3.6, x, TY, st.z - 1.75, p[0], 0.93);                // metade da frente (sul)
            this._box(2.95, 0.14, 3.6, x, TY + 0.05, st.z + 1.85, p[1], 0.93);        // metade de trás (norte)
        });
        this._box(0.2, 0.5, 7.4, st.x - 6.35, TY - 0.3, st.z, '#d9302a', 0.95); this._box(0.2, 0.5, 7.4, st.x + 6.35, TY - 0.3, st.z, '#2a63c8', 0.95);      // lonas laterais
        for (const dx of [-6.0, 6.0]) for (const dz of [-3.4, 3.4]) this._box(0.16, TY, 0.16, st.x + dx, TY / 2, st.z + dz, '#7a7a82');                        // varões
        // faixa com o nome do baile na beira da frente (neon)
        const tex = new BABYLON.DynamicTexture('baileBanner', { width: 1024, height: 128 }, g.scene, false), ctx = tex.getContext();
        ctx.fillStyle = '#12121a'; ctx.fillRect(0, 0, 1024, 128);
        const grd = ctx.createLinearGradient(0, 0, 1024, 0); grd.addColorStop(0, '#ff3ad0'); grd.addColorStop(0.5, '#ffe14a'); grd.addColorStop(1, '#35e0ff');
        ctx.fillStyle = grd; ctx.font = 'bold 84px Impact, "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('BAILE DO MORRO', 512, 68);
        ctx.fillStyle = '#35e0ff'; ctx.fillRect(0, 0, 1024, 6); ctx.fillStyle = '#ff3ad0'; ctx.fillRect(0, 122, 1024, 6);
        tex.update();
        const bm = BABYLON.MeshBuilder.CreateGround('baileBanner', { width: 12, height: 1.5 }, g.scene), bmat = new BABYLON.StandardMaterial('baileBannerMat', g.scene);
        bmat.diffuseColor = BABYLON.Color3.Black(); bmat.specularColor = BABYLON.Color3.Black(); bmat.emissiveTexture = tex; bmat.disableLighting = true; bmat.backFaceCulling = false;
        bm.material = bmat; bm.position.set(st.x, TY + 0.2, st.z - 3.9); bm.isPickable = false; this._meshes.push(bm); this._bannerMat = bmat; this._bannerTex = tex;
        // DJ e multidão
        const mk = (x, z, variant, sheet) => { const a = new SpriteActor(g.scene, sheet, variant, 'baileDancer'); a.play('idle', 'none'); a.setPosition(x, z); a.mesh.position.y = 0.5; return a; };
        const dj = mk(st.x, st.z + 0.5, va + 3, g.sprites.sheets.civA); dj.setHeading(Math.PI);   // de frente para o público (sul)
        this._dancers = [{ a: dj, x: st.x, z: st.z + 0.5, hx: st.x, hz: st.z + 0.5, ph: 0, flee: 0, dj: true }];
        let n = 0;
        for (let t = 0; t < 140 && n < 24; t++) {
            const ang = Math.random() * Math.PI * 2, r = 2.5 + Math.random() * 10, x = c.x + Math.cos(ang) * r, z = c.z + Math.sin(ang) * r;
            if (!nav.walk(x, z) || hypot(x - st.x, z - st.z) < 3.4) continue;
            if (this._dancers.some((D) => hypot(D.x - x, D.z - z) < 1.1)) continue;
            const poor = Math.random() < 0.5, variant = poor ? pa + Math.floor(Math.random() * (pb - pa + 1)) : va + Math.floor(Math.random() * (vb - va + 1));
            const a = mk(x, z, variant, Math.random() < 0.5 ? g.sprites.sheets.civA : g.sprites.sheets.civB);
            a.setHeading(Math.atan2(st.x - x, st.z - z));
            this._dancers.push({ a, x, z, hx: x, hz: z, ph: Math.random() * 6.28, flee: 0, fx: 0, fz: 0 });
            n++;
        }
        // luzes
        this.glow = new BABYLON.TransformNode('baileRoot', g.scene);
        this._lights = new GlowBatch(g.scene, 20, 'baileLights', 'glow');
        for (let i = 0; i < 20; i++) { this._lights.alloc(); this._lights.off(i); }
        this._built = true;
    },

    _destroy() {
        for (const D of this._dancers) D.a.dispose();
        this._dancers = [];
        for (const m of this._meshes) m.dispose();
        this._meshes = [];
        if (this._lights) { this._lights.mesh.dispose(); this._lights = null; }
        if (this._bannerTex) { this._bannerTex.dispose(); this._bannerMat.dispose(); this._bannerTex = this._bannerMat = null; }
        if (this.glow) { this.glow.dispose(); this.glow = null; }
        this._built = false;
    },


    // ---------------------------------------------------------------- multidão em volta da favela (×5 os pedestres)
    // Enquanto o baile rola e o jogador está por perto (<280 u), nascem moradores EXTRAS pela favela e arredores (a maioria perto do
    // baile): o total de pedestres ali vira ~5× o normal. Somem quando o baile acaba ou o jogador se afasta.
    _party(g, dist) {
        const M = g.npcManager; if (!M) return;
        const want = this.on && this._in && dist < 280;
        if (!want) { if (this._partyList.length) this._partyClear(M); this._base = 0; return; }
        if (!this._base) {                                                          // quantos pedestres "normais" há agora na favela e arredores
            const n = M.npcs.filter((q) => !q.party && q.alive && Standing.nearFavela(q.position.x, q.position.z, 60)).length;
            this._base = Math.max(36, n);
        }
        const target = Math.min(150, 4 * this._base);              // (teto por desempenho: ~150 extras)
        this._partyT = (this._partyT || 0) - 1;
        if (this._partyT > 0 || this._partyList.length >= target) return;
        this._partyT = 8;                                                           // ~4 por segundo
        const c = this.c, b = Standing._bounds();
        for (let i = 0; i < 4 && this._partyList.length < target; i++) {
            let x, z;
            if (Math.random() < 0.7) { const a = Math.random() * 6.283, r = 6 + Math.random() * 90; x = c.x + Math.cos(a) * r; z = c.z + Math.sin(a) * r; }
            else { x = b.x0 - 30 + Math.random() * (b.x1 - b.x0 + 60); z = b.z0 - 30 + Math.random() * (b.z1 - b.z0 + 60); }      // resto da favela e arredores
            const p = g.nav.closestPoint(new BABYLON.Vector3(x, 0, z), 14);
            if (!g.nav.walk(p.x, p.z) || !Standing.nearFavela(p.x, p.z, 40)) continue;
            const npc = new NPC(g.scene, g.nav, p, 9000 + (this._partyId = (this._partyId || 0) + 1), g.sprites, g.npcCtx, null);
            npc.setStyle(Math.random() < 0.7 ? 'poor' : 'casual');
            npc.party = true;
            M.npcs.push(npc); this._partyList.push(npc);
        }
    },
    _partyClear(M) {
        for (const npc of this._partyList) M.removeNpc(npc);
        this._partyList = [];
    },
    // ---------------------------------------------------------------- batida (tamborzão ~130 bpm)
    _tick(dist, step) {
        if (dist > 95 || !this._in) return;
        const k = Math.pow(Math.max(0, 1 - dist / 95), 1.5) * (Interiors.active ? 0.3 : 1);
        const v = 0.24 * k;
        if (v < 0.004) return;
        const kick = [0, 3, 6, 10, 12].includes(step), clap = step === 4 || step === 12, hat = step % 2 === 1;
        if (kick) AudioFX.blip(52, 0.11, v);
        if (clap) AudioFX.blip(880, 0.05, v * 0.55);
        if (hat) AudioFX.blip(4200, 0.025, v * 0.18);
        if (step === 0 || step === 8) AudioFX.blip(110, 0.2, v * 0.5);                    // baixo
    },

    // ---------------------------------------------------------------- por quadro
    update(dt, game) {
        if (!CityGrid || !Standing.inFavela) return;
        const g = game, was = this.on;
        const h = g.dayNight.hour, night = h >= 21 || h < 5;                         // baile só rola de noite (21h–5h), mesmo no modo de teste
        this.on = night && (this.force || this.scheduled(g));
        if (!this.c) this.site();
        if (this.on !== was) {
            if (this.on) {
                this._poi = CityGrid.addPoi({ type: 'baile', name: 'Baile funk (21h–5h)', x: this.c.x, z: this.c.z });
                const p = g.player.position;
                if (Standing.nearFavela(p.x, p.z, 450)) g._flash('🔊 Hoje tem BAILE FUNK na favela! (até 5h) — o som alto mascara tiros');
            } else {
                const i = CityGrid.pois.indexOf(this._poi); if (i >= 0) CityGrid.pois.splice(i, 1);
                this._poi = null;
            }
        }
        const p = g._playerState().pos, dist = hypot(p.x - this.c.x, p.z - this.c.z);
        this._in = Standing.nearFavela(p.x, p.z, 20);                       // luzes, som e multidão só com o jogador na favela
        this._party(g, dist);
        const want = this.on && this._in && dist < 130 && !Interiors.active;
        if (want && !this._built) this._build(g);
        else if (!want && this._built) this._destroy();
        if (!this.on) return;

        // batida e luzes
        this._beat += dt;
        while (this._beat >= this.STEP) { this._beat -= this.STEP; this._step = (this._step + 1) % 16; this._tick(dist, this._step); }
        if (!this._built) return;
        const t = performance.now() / 1000, pulse = 1 - (this._beat / this.STEP), kickNow = [0, 3, 6, 10, 12].includes(this._step) ? pulse : 0.25 * pulse;
        const cols = [[1, 0.2, 0.8], [0.2, 0.9, 1], [1, 0.9, 0.2], [0.4, 1, 0.4]], L = this._lights, c = this.c;
        for (let i = 0; i < 8; i++) {
            const a = i / 8 * Math.PI * 2 + t * 0.4, col = cols[(i + Math.floor(t * 1.5)) % 4];
            L.place(i, c.x + Math.cos(a) * 9, 4.5, c.z + Math.sin(a) * 9, 8 + 5 * kickNow);
            L.color(i, col[0], col[1], col[2], 0.25 + 0.55 * kickNow);
        }
        const fc = cols[Math.floor(t * 2) % 4];
        L.place(8, c.x, 0.3, c.z, 24); L.color(8, fc[0], fc[1], fc[2], 0.12 + 0.3 * kickNow);
        L.place(9, this.stage.x, 3.4, this.stage.z, 9 + 4 * kickNow); L.color(9, 1, 0.3, 0.9, 0.35 + 0.4 * kickNow);
        for (let i = 0; i < 6; i++) { const lc = cols[(i + Math.floor(t * 3)) % 4]; L.place(10 + i, this.stage.x + (i - 2.5) * 2.2, 10.2, this.stage.z - 3.9, 4 + 2 * kickNow); L.color(10 + i, lc[0], lc[1], lc[2], 0.55 + 0.4 * kickNow); }      // neon da faixa
        L.flush();

        // dançarinos
        const beatT = this._step / 16 + (1 - pulse) / 16;
        for (const D of this._dancers) {
            let x = D.x, z = D.z;
            if (D.dj) { D.a.mesh.position.y = 0.95 + 0.06 * Math.sin(t * 6); }
            else if (D.flee > 0) {                                           // tiro por perto: sai correndo para longe do centro
                D.flee -= dt;
                const dx = D.x - c.x, dz = D.z - c.z, d = hypot(dx, dz) || 1;
                D.x += dx / d * 5 * dt; D.z += dz / d * 5 * dt; x = D.x; z = D.z;
                if (!g.nav.walk(D.x, D.z)) { D.x -= dx / d * 5 * dt; D.z -= dz / d * 5 * dt; }
                D.a.play('run', 'none'); D.a.setHeading(Math.atan2(dx, dz));
                D.a.mesh.position.y = 0.5;
            } else {
                D.x += (D.hx - D.x) * Math.min(1, dt * 1.2); D.z += (D.hz - D.z) * Math.min(1, dt * 1.2); x = D.x; z = D.z;
                D.a.play('idle', 'none');
                D.a.mesh.position.y = 0.5 + 0.22 * Math.abs(Math.sin(beatT * Math.PI * 4 + D.ph));
                x += 0.22 * Math.sin(t * 2 + D.ph); z += 0.22 * Math.cos(t * 2.3 + D.ph);
                D.a.setHeading(Math.atan2(this.stage.x - D.x, this.stage.z - D.z) + 0.5 * Math.sin(t * 1.5 + D.ph));
            }
            D.a.setPosition(x, z); D.a.update(dt, D.flee > 0 ? 1.6 : 1);
        }
    },
};
