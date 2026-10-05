// ============================================================================
// Interiors — entrar e sair das LOJAS. Cada loja da cidade (lot.shops) vira uma porta: em frente à fachada aparece "E entrar".
// Por dentro o jogador é levado para um PALCO (stage) fora do mapa, onde a sala do estilo/variação da loja é montada
// (art/ShopStyles.js). O mundo fica CONGELADO enquanto se está lá dentro (trânsito, pedestres, polícia, física) — por isso não
// dá para entrar com procurado. Saiu, volta exatamente à calçada de onde entrou.
//
//   Interiors.active    { shop, data, ret } enquanto dentro de uma loja
//   Interiors.obstacles sólidos da sala em coordenadas de mundo (MapGeo.resolveCircle usa no lugar do CityGrid)
// Dentro: o atendente (sprite) fica atrás do balcão; E perto dele abre a loja (ui/ShopUI.js, preços em economy/Economy.js).
// ============================================================================

const Interiors = {
    STAGE: { x: 3000, z: 0 },
    active: null,
    busy: false,                 // transição (fade) em andamento: o jogador fica parado
    obstacles: [],
    _doors: null, _grid: null,
    _rooms: {},
    _actors: [],

    // ------------------------------------------------------------------ índice das portas
    index() {
        if (this._doors) return;
        const doors = this._doors = [], grid = this._grid = new Map(), C = 12, SH = TileFactory.SHOPS;
        const key = (i, j) => i * 100003 + j;
        for (const b of CityGrid.blocks) for (const l of b.lots) for (const s of l.shops || []) {
            const S = SH[s.kind], style = S && Economy.KIND_STYLE[S.id];
            if (!style) continue;
            const m = s.a + 3, o = 1.25;
            const p = s.side === 'S' ? { x: m, z: l.z0 - o, face: Math.PI } : s.side === 'N' ? { x: m, z: l.z1 + o, face: 0 } : s.side === 'W' ? { x: l.x0 - o, z: m, face: -Math.PI / 2 } : { x: l.x1 + o, z: m, face: Math.PI / 2 };
            const ed = s.side === 'S' ? { ex: m, ez: l.z0 } : s.side === 'N' ? { ex: m, ez: l.z1 } : s.side === 'W' ? { ex: l.x0, ez: m } : { ex: l.x1, ez: m };      // ponto da fachada (o vão da porta)
            const id = `${b.id}|${l.x0.toFixed(1)}|${s.side}|${s.a.toFixed(1)}`;
            const shop = Object.assign({ id, kind: S.id, style, name: Economy.nameOf(style, id), district: b.district, biome: b.biome, variant: Math.floor(Pixel.hash(Economy._h(id), 11, 5) * 5) % 5 }, p, ed);
            doors.push(shop);
            const k = key(Math.floor(p.x / C), Math.floor(p.z / C));
            (grid.get(k) || grid.set(k, []).get(k)).push(shop);
        }
        this._key = key; this._C = C;
        console.log(`[LOJAS] ${doors.length} portas indexadas`);
    },

    // Loja cuja porta está perto de (x, z) (a pé, na calçada em frente).
    shopNear(x, z, r = 1.9) {
        if (!inWorld(x, z)) return null;
        this.index();
        const C = this._C, i0 = Math.floor((x - r) / C), i1 = Math.floor((x + r) / C), j0 = Math.floor((z - r) / C), j1 = Math.floor((z + r) / C);
        let best = null, bd = r * r;
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const s of this._grid.get(this._key(i, j)) || []) {
            const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
            if (d < bd) { bd = d; best = s; }
        }
        return best;
    },

    // Jogador dentro do vão da porta de alguma loja? (entra andando, como na safe house)
    doorHit(x, z) {
        const s = this.shopNear(x, z, 2.8);
        if (!s) return null;
        const sn = Math.sin(s.face), cs = Math.cos(s.face), dx = x - s.ex, dz = z - s.ez;
        const depth = -(dx * sn + dz * cs), lat = dx * cs - dz * sn;          // depth > 0: já passou da fachada para dentro do prédio
        return depth > 0.3 && depth < 1.8 && Math.abs(lat) < 1.3 ? s : null;
    },

    // Todo quadro (a pé): atravessou a soleira → entra. Fechada/bloqueada: a porta "trava" e o jogador volta para a calçada.
    autoEnter(game) {
        if (this.active || this.busy || game.mode !== 'player' || game.player.busy || game.motoRide) return;
        if (this._needRelease) { const ax = game.input.getMoveAxis(); if (Math.abs(ax.x) + Math.abs(ax.z) < 0.1 || performance.now() - this._leftAt > 4000) this._needRelease = false; else { const pp = game.player.position, hs = this.doorHit(pp.x, pp.z); if (hs) { pp.x = hs.x; pp.z = hs.z; } return; } }
        const p = game.player.position, s = this.doorHit(p.x, p.z);
        if (!s) return;
        const c = this.check(game, s);
        if (c.ok) { this.enter(game, s); return; }
        p.x = s.x; p.z = s.z;                                                    // porta trancada: de volta à calçada
        game.player.velocity.setAll(0);
        if (!this._lockT || performance.now() - this._lockT > 1800) { this._lockT = performance.now(); game._flash(c.msg); }
    },

    // ------------------------------------------------------------------ regras de entrada
    check(game, shop) {
        const hour = game.dayNight.hour;
        if (!Economy.isOpen(shop.style, hour) && !(shop.bank && Banks.canBreakIn(shop.bank))) return { ok: false, closed: true, msg: `FECHADO — abre às ${Economy.opensAt(shop.style)}h${shop.bank && shop.bank.tier === 'hq' ? ' (ou corte a energia do quarteirão)' : ''}` };
        if (game.wanted.level > 0) return { ok: false, msg: 'A polícia está na sua cola — não dá para entrar' };
        return { ok: true };
    },

    // ------------------------------------------------------------------ prompt (texto do HUD)
    prompt(game) {
        const p = game.player.position;
        if (this.active) {
            if (this.active.shop.bank) { const bp = Banks.prompt(game); if (bp) return bp; }
            const a = this.active, o = this.STAGE;
            if (game.shopUI.open || game.stashUI.open || game.propertyUI.open || game.sleeping) return '';
            if (a.shop.home) { const hu = this.homeUse(game); if (hu) return RealEstate.isOwned(a.shop.home) ? (this.HOME_PROMPT[hu.kind] || '') : (hu.kind === 'desk' ? '<b>E</b> ver a proposta de compra<small>você está só visitando o imóvel</small>' : '<b>VISITA</b><small>só dá para usar depois de comprar o imóvel</small>'); }
            const door = a.data.door, dc = o.x + (door.x0 + door.x1) / 2, nearExit = hypot(p.x - dc, p.z - (o.z + 1.2)) < 2.3;
            const cl = a.data.clerk, nearClerk = cl && hypot(p.x - (o.x + cl.x), p.z - (o.z + cl.z)) < 5.2 && p.z < o.z + cl.z + 0.6;
            const shop = a.shop, S = Economy.STYLES[shop.style] || {};
            if (this.useNear(game, 'pool')) return `<b>E</b> jogar sinuca<small>bola 8 apostada · de ${brl(Pool.STAKES[0].bet)} a ${brl(Pool.STAKES[Pool.STAKES.length - 1].bet)}</small>`;
            if (nearClerk) return `<b>E</b> ${S.guns ? 'ver o que tem à venda' : 'ver o cardápio'}<small>${shop.name} · ${Economy.zoneOf(shop).label}</small>`;
            if (nearExit) return '<b>E</b> sair da loja<small>ou ande até a porta</small>';
            return '';
        }
        const shop = this.shopNear(p.x, p.z);
        if (!shop || game.mode !== 'player') return '';
        const c = this.check(game, shop), S = Economy.STYLES[shop.style];
        if (!c.ok) return `<b>${c.closed ? 'FECHADO' : 'ENTRADA BLOQUEADA'}</b><small>${shop.name} — ${c.msg.replace('FECHADO — ', '')}</small>`;
        return `<b>${shop.name}</b><small>${S.label} · ${Economy.zoneOf(shop).label} — é só entrar pela porta</small>`;
    },

    // E: tenta entrar / sair / falar com o atendente. Retorna true se tratou.
    interact(game) {
        if (this.busy) return true;
        const p = game.player.position;
        if (this.active) {
            if (game.shopUI.open || game.stashUI.open || game.propertyUI.open || game.sleeping) return true;
            if (this.active.shop.bank && Banks.interact(game)) return true;
            if (this.active.shop.home) {
                const hu = this.homeUse(game);
                if (hu && hu.kind !== 'desk' && !RealEstate.isOwned(this.active.shop.home)) { game._flash('Você está só visitando — compre o imóvel para usar isto'); return true; }
                if (hu) { if (hu.kind === 'bed') { if (!RealEstate.isOwned(this.active.shop.home)) game._flash('Só dá para dormir depois de comprar o imóvel'); else game._startSleep('here', this.active.shop.home); } else if (hu.kind === 'desk') game.propertyUI.show(this.active.shop.home); else game.stashUI.show(hu.kind); return true; }
            }
            const a = this.active, o = this.STAGE, door = a.data.door, dc = o.x + (door.x0 + door.x1) / 2;
            const cl = a.data.clerk;
            if (this.useNear(game, 'pool')) { Pool.open(game, a.shop); return true; }
            if (cl && hypot(p.x - (o.x + cl.x), p.z - (o.z + cl.z)) < 5.2 && p.z < o.z + cl.z + 0.6) { game.shopUI.show(a.shop); return true; }
            if (hypot(p.x - dc, p.z - (o.z + 1.2)) < 2.3) { this.leave(game); return true; }
            return false;
        }
        if (game.mode !== 'player' || game.player.busy) return false;
        const shop = this.shopNear(p.x, p.z);
        if (!shop) return false;
        const c = this.check(game, shop);
        if (!c.ok) { game._flash(c.msg); return true; }
        this.enter(game, shop);
        return true;
    },

    // ------------------------------------------------------------------ imóveis (casas compradas): mesma sala-palco, sem atendente
    HOME_STYLE: { 'Barraco': 'home_simple', 'Casa popular': 'home_simple', 'Kitnet / apto simples': 'home_simple', 'Apartamento': 'home_apto', 'Apartamento alto padrão': 'home_apto', 'Cobertura frente-mar': 'home_cobertura', 'Mansão / cobertura de luxo': 'home_mansion' },
    enterHome(game, prop) {
        if (this.active || this.busy) return false;
        if (game.wanted.level > 0) { game._flash('A polícia está na sua cola — não dá para entrar'); return true; }
        const style = this.HOME_STYLE[prop.type] || 'home_apto';
        const v = Math.floor(Pixel.hash(Economy._h(prop.id), 17, 3) * 5) % 5;
        const shop = { id: 'home' + prop.id, kind: style, style, name: prop.type, district: 'city', biome: 'residential', variant: v, x: prop.x, z: prop.z, face: 0, home: prop, reform: RealEstate.reformLevel(prop) };
        this.enter(game, shop);
        return true;
    },
    // Ponto de uso `kind` (ex.: a mesa de sinuca do bar) ao alcance do jogador numa loja, ou null.
    useNear(game, kind, maxD = 1.6) {
        const a = this.active; if (!a) return null;
        const o = this.STAGE, p = game.player.position;
        for (const u of a.data.uses || []) {
            if (u.kind !== kind) continue;
            const cx = Math.max(o.x + u.x0, Math.min(p.x, o.x + u.x1)), cz = Math.max(o.z + u.z0, Math.min(p.z, o.z + u.z1));
            if (hypot(p.x - cx, p.z - cz) <= maxD) return u;
        }
        return null;
    },
    // Móvel de uso mais próximo (a ≤ 1,9 u do retângulo) dentro da casa, ou null.
    homeUse(game, maxD = 1.9) {
        const a = this.active; if (!a || !a.shop.home) return null;
        const o = this.STAGE, p = game.player.position;
        let best = null, bs = 1e9;
        for (const u of a.data.uses || []) {                                             // ao alcance (≤ maxD do retângulo): vence o de centro mais perto
            const cx = Math.max(o.x + u.x0, Math.min(p.x, o.x + u.x1)), cz = Math.max(o.z + u.z0, Math.min(p.z, o.z + u.z1));
            if (hypot(p.x - cx, p.z - cz) > maxD) continue;
            const s = hypot(p.x - (o.x + (u.x0 + u.x1) / 2), p.z - (o.z + (u.z0 + u.z1) / 2));
            if (s < bs) { bs = s; best = u; }
        }
        return best;
    },
    HOME_PROMPT: {
        bed: '<b>E</b> dormir e salvar o jogo<small>8 horas de sono: recupera a vida e grava o progresso</small>',
        fridge: '<b>E</b> abrir a geladeira<small>guarde comida e água</small>',
        safe: '<b>E</b> abrir o cofre<small>dinheiro e joias — dá para vender as joias</small>',
        chest: '<b>E</b> abrir o baú<small>armas, munição, kits e o que mais quiser</small>',
        desk: '<b>E</b> usar o notebook<small>mercado imobiliário: mudar-se, vender o imóvel</small>',
    },

    // ------------------------------------------------------------------ transição
    _fadeEl() {
        if (!this._el) {
            const el = this._el = document.createElement('div');
            el.style.cssText = 'position:fixed;inset:0;z-index:44;background:#000;opacity:0;pointer-events:none;display:none';
            document.body.appendChild(el);
        }
        return this._el;
    },
    _fade(cb) { this.busy = true; this._f = { phase: 'out', t: 0, cb }; this._fadeEl().style.display = 'block'; },
    tickFade(dt) {
        const f = this._f; if (!f) return;
        f.t += dt;
        const el = this._fadeEl(), D = 0.22;
        if (f.phase === 'out') { el.style.opacity = String(Math.min(1, f.t / D)); if (f.t >= D) { f.cb(); f.phase = 'in'; f.t = 0; } }
        else { el.style.opacity = String(Math.max(0, 1 - f.t / D)); if (f.t >= D) { el.style.display = 'none'; this._f = null; this.busy = false; } }
    },

    enter(game, shop) {
        this._fade(() => this._doEnter(game, shop));
    },
    leave(game) {
        this._fade(() => this._doLeave(game));
    },

    _room(shop) {
        const key = shop.style + shop.variant + (shop.reform ? 'r' + shop.reform : '');
        let r = this._rooms[key];
        const lru = this._lru || (this._lru = []);
        const touch = () => { const i = lru.indexOf(key); if (i >= 0) lru.splice(i, 1); lru.push(key); };
        if (r) { touch(); return r; }
        // Cache das salas pintadas: só as 4 mais recentes (cada uma é uma textura grande); as outras são refeitas se você voltar.
        while (lru.length >= 4) {
            const old = lru.shift(), o = this._rooms[old];
            if (o && (!this.active || this.active.room !== o)) { const m = o.mesh.material; o.mesh.dispose(); if (m) { if (m.diffuseTexture) m.diffuseTexture.dispose(); m.dispose(); } delete this._rooms[old]; }
        }
        touch();
        const data = ShopStyles.get(shop.style, shop.variant, shop.reform || 0), IN = data.in, o = this.STAGE;
        const tex = data.canvas.toTexture(game.scene, { wrap: false, mips: false });
        data.canvas = null; delete ShopStyles._cache[shop.style + shop.variant + (shop.reform ? 'r' + shop.reform : '')];   // os pixels já estão na GPU
        tex.hasAlpha = true;
        const m = new BABYLON.StandardMaterial('shop_' + key, game.scene);
        m.diffuseTexture = tex; m.useAlphaFromDiffuseTexture = true; m.diffuseColor = BABYLON.Color3.Black(); m.specularColor = BABYLON.Color3.Black();
        m.emissiveColor = new BABYLON.Color3(1, 1, 1); m.disableLighting = true; m.backFaceCulling = false; m.alpha = 0.999; m.forceDepthWrite = false;
        const B = new MeshBatch(), x0 = o.x + IN.x0, x1 = o.x + IN.x1, z0 = o.z + IN.z0, z1 = o.z + IN.z1;
        B.top(x0, z0, x1, z1, 0.14, (x, z) => [(x - x0) / (x1 - x0), (z1 - z) / (z1 - z0)]);
        const mesh = B.build('shopRoom_' + key, game.scene, m, { receiveShadows: false });
        mesh.freezeWorldMatrix(); mesh.setEnabled(false);
        return (this._rooms[key] = { data, mesh });
    },

    _backdrop() {
        if (this._bd) return this._bd;
        const sc = game.scene, m = new BABYLON.StandardMaterial('shopBackdrop', sc);
        m.diffuseColor = BABYLON.Color3.Black(); m.emissiveColor = new BABYLON.Color3(0.03, 0.025, 0.03); m.specularColor = BABYLON.Color3.Black(); m.disableLighting = true;
        const g = BABYLON.MeshBuilder.CreateGround('shopBackdrop', { width: 160, height: 120 }, sc);
        g.position.set(this.STAGE.x + 12, 0.06, this.STAGE.z + 8); g.material = m; g.isPickable = false; g.setEnabled(false);
        return (this._bd = g);
    },

    // Atores decorativos (atendente e fregueses): reaproveitados entre as lojas.
    _useActors(game, list, shop) {
        const sc = game.scene, S = game.sprites.sheets, o = this.STAGE;
        const grp = shop.style === 'drugs' ? CharacterRig.VARIANT_GROUPS.poor : (shop.style === 'italian' || shop.style === 'japanese' ? CharacterRig.VARIANT_GROUPS.biz : CharacterRig.VARIANT_GROUPS.casual);
        list.forEach((e, i) => {
            let a = this._actors[i];
            const variant = grp[0] + ((e.variant * 7 + shop.variant * 3) % (grp[1] - grp[0] + 1));
            const sheet = (e.variant & 1) ? S.civB : S.civA;
            if (!a) { a = this._actors[i] = new SpriteActor(sc, sheet, variant, 'shopActor' + i); }
            else { if (a.sheet !== sheet) a.useSheet(sheet); a.setVariant(variant); }
            a.play('idle'); a.setPosition(o.x + e.x, o.z + e.z); a.mesh.computeWorldMatrix(true); a.mesh.refreshBoundingInfo(); a.setHeading(e.face); a.setVisible(true); a.mesh.position.y = 0.5;
        });
        for (let i = list.length; i < this._actors.length; i++) this._actors[i].setVisible(false);
    },

    _doEnter(game, shop) {
        const room = this._room(shop), data = room.data, o = this.STAGE, pl = game.player;
        this._backdrop().setEnabled(true); room.mesh.setEnabled(true);
        const ret = { x: shop.x, z: shop.z, face: shop.face };
        this.active = { shop, data, room, ret, t: 0 };
        this.obstacles = data.obs.map((s) => ({ x0: o.x + s.x0, z0: o.z + s.z0, x1: o.x + s.x1, z1: o.z + s.z1, h: s.h }));
        this.obstacles.push({ x0: o.x + data.door.x0 - 0.1, z0: o.z - 6, x1: o.x + data.door.x1 + 0.1, z1: o.z - 0.25, h: 3 });      // tampa o vão da porta por fora: sem cair no vazio (a saída é o gatilho antes dele)
        pl.teleport(new BABYLON.Vector3(o.x + data.spawn.x, 0, o.z + data.spawn.z));
        pl.root.rotation.y = 0; pl.velocity.setAll(0);
        this._useActors(game, (data.clerk ? [data.clerk] : []).concat(data.patrons), shop);
        game.camera.setZoomMul(0.5);
        game.camera.snapTo(this.focus(pl.position, game.camera, game.gameEngine.engine.getAspectRatio(game.camera.camera)));
        game.scene.physicsEnabled = false;
        const mm = document.getElementById('minimap'); if (mm) mm.style.opacity = '0';
        if (HouseView.ready) { HouseView.inside = false; HouseView.t = 0; HouseView._first = true; }
        game._flash(`${shop.name}`);
        this._hideCity(game, true);
        if (shop.bank) Banks.onEnter(game, shop);
    },

    _doLeave(game) {
        const a = this.active; if (!a) return;
        const pl = game.player;
        a.room.mesh.setEnabled(false); this._bd.setEnabled(false);
        for (const x of this._actors) x.setVisible(false);
        this.active = null; this.obstacles = [];
        this._needRelease = true; this._leftAt = performance.now();                  // saiu: só reentra depois de soltar as teclas (sem vai-e-vem na porta)
        pl.teleport(new BABYLON.Vector3(a.ret.x, 0, a.ret.z));
        pl.root.rotation.y = a.ret.face; pl.velocity.setAll(0);
        game.camera.setZoomMul(1);
        game.camera.snapTo(pl.position);
        game.scene.physicsEnabled = true;
        const mm = document.getElementById('minimap'); if (mm) mm.style.opacity = '1';
        game.shopUI.close();
        if (game.colliderStream) game.colliderStream.refresh(game.camera.target.x, game.camera.target.z);
        this._hideCity(game, false);
        if (a.shop.bank) Banks.onLeave(game);
    },

    // Dentro de um interior a cidade não aparece: some com todas as malhas visíveis do mapa (a GPU para de avaliá-las e o mapa de sombras
    // fica leve) e devolve exatamente as mesmas ao sair. O mundo está congelado lá dentro, então ninguém muda essa visibilidade no meio.
    _hideCity(game, hide) {
        if (hide) {
            const lim = this.STAGE.x - 400, keep = this._hidden = [], stage = new Set([this._bd, this.active && this.active.room.mesh]);
            for (const x of this._actors) stage.add(x.mesh);
            for (const m of game.scene.meshes) {
                if (!m.isVisible || stage.has(m)) continue;
                const bi = m.getBoundingInfo && m.getBoundingInfo(), cx = bi ? bi.boundingBox.centerWorld.x : m.position.x;
                if (cx > lim && !m.alwaysSelectAsActiveMesh) continue;                // (o palco da loja e o que está nele)
                if (m === game.player.root || (game.player.actor && m === game.player.actor.mesh)) continue;
                m.isVisible = false; keep.push(m);
            }
        } else if (this._hidden) { for (const m of this._hidden) m.isVisible = true; this._hidden = null; }
    },

    // Atualização por quadro DENTRO da loja: anima atores, auto-sair pela porta.
    update(dt, game) {
        const a = this.active; if (!a) return;
        a.t += dt;
        for (const x of this._actors) if (x.mesh.isEnabled()) x.update(dt, 1);
        if (a.shop.bank) Banks.update(dt, game);
        const o = this.STAGE, p = game.player.position, d = a.data.door;
        const ax = game.input.getMoveAxis();
        if (Math.abs(ax.x) + Math.abs(ax.z) < 0.1 && a.t > 0.3) a.released = true;                    // a saída só vale depois de soltar as teclas uma vez
        if (a.released && p.z > o.z + 3.4) a.armed = true;
        if (!this.busy && a.armed && a.t > 0.6 && p.z < o.z + 0.55 && p.x > o.x + d.x0 && p.x < o.x + d.x1) this.leave(game);
    },

    // Enquadramento da câmera na sala (centro, com folga para a parede norte pintada).
    focus(pos, cam, aspect) {
        const a = this.active, o = this.STAGE; if (!a) return pos;
        const W = a.data.W, D = a.data.D, view = cam.viewHalf * 0.5;
        const hx = W / 2 + 0.8, hz = D / 2 + 1.1, cx = o.x + W / 2, cz = o.z + D / 2 + 1.1;
        const halfW = view * Math.max(1, aspect), halfH = view, cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        this._f2 = this._f2 || { x: 0, z: 0 };
        this._f2.x = hx <= halfW ? cx : cl(pos.x, cx - (hx - halfW), cx + (hx - halfW));
        this._f2.z = hz <= halfH ? cz : cl(pos.z, cz - (hz - halfH), cz + (hz - halfH));
        return this._f2;
    },
};

// Teste: entra direto (sem fade) numa sala de um estilo/variação — Interiors.debugEnter('italian', 2).
Interiors.debugEnter = function (style, v = 0) {
    const p = game.player.position;
    if (this.active) this._doLeave(game);
    const shop = { id: 'dbg' + style + v, kind: style, style, name: Economy.nameOf(style, 'dbg' + style + v), district: 'city', biome: 'commercial', variant: v, x: p.x, z: p.z, face: 0 };
    this._ret = null;
    this._doEnter(game, shop);
    return shop;
};
