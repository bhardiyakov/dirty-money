// ============================================================================
// Garage — as GARAGENS das suas casas e os SEUS CARROS.
//
// Toda casa sua tem garagem: a safe house da favela e cada imóvel comprado (RealEstate). A garagem são vagas no meio-fio em
// frente à porta (a mesma regra das vagas do trânsito), pintadas no chão, com tantas vagas quanto o padrão do imóvel permite
// (barraco 1 … mansão 4). Os carros guardados são REGISTROS (modelo, pintura, lataria, gasolina, peças do desmanche) — o carro de
// verdade só existe quando você está perto da garagem (some quando você vai longe, sem custar nada ao mundo).
//
//   • Carro COMPRADO (Dealers) nasce na garagem escolhida. Largou na rua e foi embora? Volta sozinho para a garagem. Destruído?
//     O seguro paga: volta para a garagem em 1 minuto, com franquia de 5% do preço (dinheiro limpo, o que tiver).
//   • Carro ROUBADO: estacione numa vaga da sua garagem e aperte E — passa a ser seu (fica salvo). Largado na rua também volta,
//     mas se for DESTRUÍDO, já era (sem seguro).
//   • Estacionar um carro seu na vaga de OUTRA casa sua e apertar E muda a garagem dele; ou, pela janela da garagem (ui/CarUI.js,
//     modo 'garage'), o manobrista leva para outra casa com vaga (R$ 150).
// Tudo é salvo com o jogo (SaveGame: serialize/load).
// ============================================================================

const Garage = {
    cars: [],              // registros: { uid, model, paint, hp (0..1), fuel (0..1), mods, bought, paid, dirty, garage, slot, readyAt }
    nextUid: 1,
    game: null,
    _g: {},                // garagens já calculadas (id → { id, name, x, z, cap, slots: [{ x, z, h }] })
    SPAWN_R: 130, DESPAWN_R: 190, RETURN_R: 160,
    VALET: 150,            // manobrista: levar um carro para outra casa
    CAP: { 'Barraco': 1, 'Casa popular': 1, 'Kitnet / apto simples': 1, 'Apartamento': 2, 'Apartamento alto padrão': 2, 'Cobertura frente-mar': 3, 'Mansão / cobertura de luxo': 4 },

    // ---------------------------------------------------------------- vagas no meio-fio
    // Até n vagas na rua mais próxima de (x, z), do lado da calçada da porta, uma atrás da outra (6,5 u), longe de cruzamentos.
    curbSlots(x, z, n) {
        const r = RoadNet.nearestRoadPoint(x, z);
        if (!r || !r.edge || r.d > 22) return [];
        const e = r.edge, fav = e.cls === 'fav', off = fav ? e.w / 2 + 0.8 : e.w / 2 - 0.1, out = [];      // (rua do morro é estreita: estaciona fora da pista)
        const fwd = (x - r.x) * r.tz - (z - r.z) * r.tx >= 0;                     // do lado da porta: andando nesse sentido, a calçada fica à direita
        const t0 = r.s;
        for (let k = 0; out.length < n && k < n * 3; k++) {
            const t = t0 + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 6.5;
            if (t < 9 || t > e.len - 9) continue;
            const p = RoadPlan.at(e, t), d = { dx: fwd ? p.tx : -p.tx, dz: fwd ? p.tz : -p.tz }, sx = p.x + d.dz * off, sz = p.z - d.dx * off;
            if (CityGrid.intersectionNear(sx, sz, 12) || RoadPlan.inTunnel(e, t)) continue;
            if (fav && !FavelaPlan.roomForCar(sx, sz, d.dx, d.dz)) continue;
            out.push({ x: sx, z: sz, h: Math.atan2(d.dx, d.dz) });
        }
        return out;
    },

    // ---------------------------------------------------------------- garagens
    // A garagem da casa `id` ('safehouse' ou o id do imóvel), calculada na 1ª consulta.
    byId(id) {
        if (this._g[id]) return this._g[id];
        let name, x, z, cap;
        if (id === 'safehouse') { const d = SafeHouse.doorWorld(); name = 'Safe house da favela'; x = d.x; z = d.z - 1.2; cap = 2; }
        else { const p = RealEstate.byId[id]; if (!p) return null; name = `${p.type} (${p.region})`; x = p.x; z = p.z; cap = this.CAP[p.type] || 1; }
        const slots = (id === 'safehouse' && FavelaPlan.built && FavelaPlan.yardSlots()) || this.curbSlots(x, z, cap);      // safe house: no quintal
        return (this._g[id] = { id, name, x, z, cap: slots.length, slots });
    },
    usable(G) { return !!G && G.cap > 0 && (G.id === 'safehouse' || RealEstate.owned[G.id]); },
    // Todas as garagens que você tem (a da safe house primeiro).
    mine() { return ['safehouse', ...Object.keys(RealEstate.owned)].map((id) => this.byId(id)).filter((G) => this.usable(G)); },
    carsIn(G) { return this.cars.filter((c) => c.garage === G.id); },
    free(G) { return G.cap - this.carsIn(G).length; },
    _freeSlot(G) { const used = new Set(this.carsIn(G).map((c) => c.slot)); for (let i = 0; i < G.cap; i++) if (!used.has(i)) return i; return -1; },
    // Garagem padrão de um carro novo: a da casa onde você mora, ou a primeira com vaga.
    defaultFor() {
        const mine = this.mine(), home = this.byId(RealEstate.homeId);
        if (home && this.usable(home) && this.free(home) > 0) return home;
        return mine.find((G) => this.free(G) > 0) || null;
    },

    // Novo carro seu, na garagem G.
    add(rec, G) {
        rec.uid = this.nextUid++; rec.garage = G.id; rec.slot = this._freeSlot(G); rec.readyAt = 0;
        this.cars.push(rec);
        return rec;
    },
    // Muda a garagem do registro (o carro de verdade some e reaparece lá quando você chegar perto).
    move(rec, G) {
        if (!this.usable(G) || this.free(G) <= 0) return false;
        const car = this._live(rec);
        if (car && !car.controlled) this.despawn(this.game, car);
        rec.garage = G.id; rec.slot = this._freeSlot(G);
        return true;
    },
    remove(rec, why) {
        const i = this.cars.indexOf(rec);
        if (i >= 0) this.cars.splice(i, 1);
        const car = this._live(rec);
        if (car) car.ownedRec = null;
    },
    label(rec) { const s = CarSheet.MODELS[rec.model]; return s ? `${s.name} ${s.model}` : rec.model; },
    where(rec) { const car = this._live(rec); if (car && car.controlled) return 'com você'; const G = this.byId(rec.garage); return rec.readyAt > this._now() ? `no seguro (volta para ${G ? G.name : '?'})` : (G ? G.name : '?'); },

    // ---------------------------------------------------------------- carros de verdade
    _live(rec) { return rec && rec._car && !rec._car._gone ? rec._car : null; },
    _now() { return this.game ? (this.game.time || performance.now() / 1000) : 0; },

    // Um carro estacionado (aberto, sem motorista) em (x, z) virado para h. Fora do trânsito (não é reciclado).
    spawnCar(g, model, paint, x, z, h) {
        if (!g.vehicleManager || !g.carLib || !CarSheet.MODELS[model]) return null;
        const car = new TrafficCar(g.scene, g.physics, { x, z }, g.traffic._nextId++, g.carLib.sheet(model), paint, h, g.traffic);
        if (g.gameEngine.shadowGenerator) g.gameEngine.shadowGenerator.addShadowCaster(car.body);
        g.vehicleManager.vehicles.push(car);
        car.baseMode = 'parked'; car.park(); car.locked = false; car.keep = true;
        return car;
    },
    despawn(g, car) {
        if (!car || car._gone) return;
        car._gone = true;
        const V = g.vehicleManager.vehicles, i = V.indexOf(car);
        if (i >= 0) V.splice(i, 1);
        if (g.doors) g.doors.reset(car);
        if (g.carLights) g.carLights.release(car);
        car.dispose(g.traffic && g.traffic.shadow);
    },
    _spawn(rec) {
        const g = this.game, G = this.byId(rec.garage), s = G && G.slots[rec.slot];
        if (!s) return;
        const car = this.spawnCar(g, rec.model, rec.paint, s.x, s.z, s.h);
        if (!car) return;
        car.ownedRec = rec; rec._car = car; car._xpGiven = true;
        const m = rec.mods || {};
        if (m.engine) car.spec = Object.assign({}, car.spec, { power: car.spec.power * 1.25, t100: car.spec.t100 ? car.spec.t100 / 1.25 : undefined, maxSpeed: car.spec.maxSpeed + 4 });
        if (m.armor) car.maxHp = Math.round(car.maxHp * 1.6);
        car.mods = Object.assign({}, m);
        car.hp = Math.max(1, rec.hp * car.maxHp);
        car.dent = rec.hp > 0.75 ? 0 : rec.hp > 0.5 ? 1 : rec.hp > 0.25 ? 2 : 3;
        if (car.tank > 0) car.fuel = rec.fuel * car.tank;
    },
    // Guarda o estado do carro de verdade no registro.
    _sync(rec, car) {
        rec.hp = Math.max(0.05, car.hpFrac);
        if (car.tank > 0) rec.fuel = Math.max(0, Math.min(1, car.fuel / car.tank));
        rec.mods = Object.assign({}, car.mods || {});
        if (typeof CarCare !== 'undefined') { CarCare.syncRec(car); CarCare.syncTrunk(car); }      // peças e porta-malas (vehicle/CarCare.js)
    },
    syncAll() { for (const r of this.cars) { const c = this._live(r); if (c) this._sync(r, c); } },

    // ---------------------------------------------------------------- guardar um carro na garagem (dirigindo)
    // Vaga de uma casa sua ao alcance do carro: { G, slot } ou null.
    slotNear(x, z, maxD = 4.5) {
        let best = null, bd = maxD;
        for (const G of this.mine()) for (let i = 0; i < G.slots.length; i++) {
            const s = G.slots[i], d = hypot(s.x - x, s.z - z);
            if (d < bd) { bd = d; best = { G, slot: i }; }
        }
        return best;
    },
    _storable(car) { return car && !car.isBoat && !car.isChopper && !car.display && !car.destroyed && car.spec && CarSheet.MODELS[car.spec.id]; },
    carPrompt(game) {
        const car = game.activeCar;
        if (game.mode !== 'car' || !this._storable(car) || car.speed > 1.5) return '';
        const n = this.slotNear(car.position.x, car.position.z);
        if (!n) return '';
        const rec = car.ownedRec;
        if (rec && rec.garage === n.G.id) return `<b>GARAGEM</b> ${n.G.name}<small>esta vaga é dele — é só descer (F)</small>`;
        if (!rec && this.free(n.G) <= 0) return `<b>GARAGEM CHEIA</b> ${n.G.name}<small>${n.G.cap} vaga(s) — libere uma pela janela da garagem</small>`;
        if (rec && this.free(n.G) <= 0) return `<b>GARAGEM CHEIA</b> ${n.G.name}<small>não cabe mais um carro aqui</small>`;
        return rec ? `<b>E</b> mudar o carro para esta garagem<small>${n.G.name} · ${this.free(n.G)} vaga(s) livre(s)</small>`
            : `<b>E</b> guardar este carro na garagem<small>${n.G.name} · fica salvo · roubado: se for destruído, perde</small>`;
    },
    carInteract(game) {
        const car = game.activeCar;
        if (!this.carPrompt(game) || !this._storable(car)) return false;
        const n = this.slotNear(car.position.x, car.position.z);
        if (!n || this.free(n.G) <= 0 || (car.ownedRec && car.ownedRec.garage === n.G.id)) return false;
        let rec = car.ownedRec;
        if (rec) { rec.garage = n.G.id; rec.slot = this._freeSlot(n.G); }
        else {
            rec = this.add({ model: car.spec.id, paint: car.visual ? car.visual.variant : 0, hp: 1, fuel: 1, mods: {}, bought: false, paid: 0 }, n.G);
            rec._car = car; car.ownedRec = rec; car.keep = true;
            if (game.achievements && game.achievements.bump) game.achievements.bump('garage');
        }
        this._sync(rec, car);
        const s = n.G.slots[rec.slot];
        car.teleport(s.x, s.z, s.h);                                              // encosta certinho na vaga e desce
        game._leaveVehicle();
        car.park();
        game._flash(rec.bought ? `${this.label(rec)} agora fica na garagem de ${n.G.name}` : `${this.label(rec)} guardado na garagem de ${n.G.name} — agora é seu (se for destruído, já era)`);
        return true;
    },

    // ---------------------------------------------------------------- por frame (meio segundo)
    update(dt) {
        const g = this.game;
        if (!g || !g.vehicleManager || !RealEstate.built) return;
        this._t = (this._t || 0) - dt;
        if (this._t > 0) return;
        this._t = 0.5;
        const P = g.camera.target, now = this._now();
        for (const rec of this.cars.slice()) {
            const car = this._live(rec), G = this.byId(rec.garage);
            if (!G) continue;
            if (car) {
                if (car.destroyed && !car.canRaise) { this._destroyed(rec, car); continue; }      // (moto só caída não é perda: dá para levantar)
                if (car.controlled || car.hold) { this._sync(rec, car); continue; }
                const s = G.slots[rec.slot], home = s && hypot(car.position.x - s.x, car.position.z - s.z) < 4;
                const dP = hypot(car.position.x - P.x, car.position.z - P.z);
                if (home ? dP > this.DESPAWN_R : dP > this.RETURN_R) {               // longe: some (o registro guarda tudo) e volta para a vaga
                    this._sync(rec, car); this.despawn(g, car); rec._car = null;
                }
                continue;
            }
            if (rec.readyAt > now) continue;                                         // no seguro
            const s = G.slots[rec.slot];
            if (s && hypot(s.x - P.x, s.z - P.z) < this.SPAWN_R && this._clear(s)) this._spawn(rec);
        }
        this._paint();
    },
    _clear(s) { for (const c of this.game.vehicleManager.vehicles) if (hypot(c.position.x - s.x, c.position.z - s.z) < 3.2) return false; return true; },
    _destroyed(rec, car) {
        const g = this.game;
        car.ownedRec = null; car.keep = false; rec._car = null;
        if (!rec.bought) { this.remove(rec); g._flash(`${this.label(rec)} foi destruído — era roubado, não tem seguro: perdeu`); return; }
        const fee = Math.round(rec.paid * 0.05 / 10) * 10, pay = Math.min(fee, Math.max(0, g.inventory.clean));
        g.inventory.clean -= pay;
        rec.hp = 1; rec.fuel = 0.5; rec.readyAt = this._now() + 60;
        g._flash(`Seguro acionado: ${this.label(rec)} volta para a garagem em 1 minuto (franquia ${brl(pay)})`);
    },

    // ---------------------------------------------------------------- vagas pintadas no chão (só as das suas casas, perto)
    _paint() {
        const g = this.game, P = g.camera.target;
        if (!this.glow) { this.glow = new GlowBatch(g.scene, 24, 'garageGlow', 'glow'); for (let i = 0; i < 24; i++) { this.glow.alloc(); this.glow.off(i); } }
        let i = 0;
        for (const G of this.mine()) for (const s of G.slots) {
            if (i >= 24) break;
            if (hypot(s.x - P.x, s.z - P.z) > 80) continue;
            this.glow.place(i, s.x, 0.25, s.z, 4.2); this.glow.color(i, 0.4, 0.75, 1, 0.22); i++;
        }
        for (; i < 24; i++) this.glow.off(i);
        this.glow.flush();
    },

    // ---------------------------------------------------------------- a pé: abrir a janela da garagem
    nearGarage(game, maxD = 3.5) {
        if (game.mode !== 'player') return null;
        const p = game.player.position;
        for (const G of this.mine()) for (const s of G.slots) if (hypot(s.x - p.x, s.z - p.z) < maxD) return G;      // (nas vagas — a porta é do imóvel)
        return null;
    },
    prompt(game) {
        const G = this.nearGarage(game);
        return G ? `<b>E</b> garagem — ${G.name}<small>${this.carsIn(G).length}/${G.cap} vaga(s) ocupada(s) · ver e transferir seus carros</small>` : '';
    },
    interact(game) {
        const G = this.nearGarage(game);
        if (!G || !game.carUI) return false;
        game.carUI.showGarage(G);
        return true;
    },

    // ---------------------------------------------------------------- save
    serialize() {
        this.syncAll();
        return { next: this.nextUid, cars: this.cars.map((r) => ({ uid: r.uid, model: r.model, paint: r.paint, hp: r.hp, fuel: r.fuel, mods: r.mods || {}, bought: !!r.bought, paid: r.paid || 0, dirty: !!r.dirty, garage: r.garage, slot: r.slot, cond: r.cond || null, trunk: r.trunk || null })) };
    },
    load(s) {
        for (const r of this.cars) { const c = this._live(r); if (c && this.game) this.despawn(this.game, c); }
        this.cars = []; this.nextUid = 1; this._g = {};
        if (!s) return;
        this.nextUid = s.next || 1;
        for (const r of s.cars || []) if (CarSheet.MODELS[r.model]) this.cars.push(Object.assign({ readyAt: 0 }, r, typeof RealEstate !== 'undefined' && RealEstate.remap[r.garage] !== undefined ? { garage: RealEstate.remap[r.garage] } : {}));      // (imóvel que mudou de código: RealEstate._migrate)
    },
};
