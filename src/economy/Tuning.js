// ============================================================================
// Tuning — as LOJAS DE TUNAGEM: chegue DIRIGINDO um carro SEU (comprado ou guardado na sua garagem), pare na frente e aperte E.
// A loja abre a GARAGEM POR DENTRO (TuneGarage: showroom 3D, câmera que vai até a peça) com a janela de lado; o carro aparece com as
// peças escolhidas na hora (prévia) e só fica com elas se você pagar — fechar desfaz tudo.
//   PINTURA      as cores de fábrica (R$ 1.800) e as ESPECIAIS (fosco, cromado, perolizado/camaleão: CarSheet.PAINTS[].fx)
//   MOTOR        estágios 1..3 (mais força e máxima) · TURBO: força, máxima e o assobio/blow-off no som (EngineAudio.profileOf)
//   FREIOS       1..3 (frenagem mais forte: Vehicle.tuneBrake) · SUSPENSÃO 1..3 (rebaixa o carro 3D e segura mais na curva: tuneGrip)
//   NEON         luz colorida no chão embaixo do carro (CarLights) · AEROFÓLIO: lip, asa GT, asa GT de carbono (CarArt3D._wing)
//   BODYKIT      kit de rua, kit de corrida (splitter, canards, difusor de carbono) e wide body (alargadores) — CarArt3D._kit
// As peças moram em car.mods / registro da Garage (salvo com o jogo); Tuning.apply refaz o carro a partir delas (spawn da garagem,
// desmanche). Preço × porte do carro (um superesportivo paga mais caro pela mesma peça). Acima de R$ 800, só dinheiro limpo.
// ============================================================================

const Tuning = {
    NAMES: ['Dirty Tuning Garage', 'Neon Motorsport', 'Turbo Zona Norte'],
    N: 3,
    // Cores do neon (rgb 0..1) — índice = car.mods.neon.
    NEON: { 1: [0.15, 0.55, 1], 2: [0.95, 0.15, 0.85], 3: [0.2, 1, 0.45], 4: [1, 0.15, 0.12], 5: [1, 0.8, 0.15], 6: [0.92, 0.94, 1], 7: [0.55, 0.2, 1] },
    NEON_NAMES: { 1: 'azul', 2: 'rosa', 3: 'verde', 4: 'vermelho', 5: 'amarelo', 6: 'branco', 7: 'roxo' },
    // Categorias: chave em car.mods, nome, níveis [nome, preço base] (nível 0 = de fábrica / nenhum).
    PARTS: {
        tEng: { name: 'Motor', icon: '⚙️', lv: [['De fábrica', 0], ['Estágio 1 — remap e filtro esportivo', 4000], ['Estágio 2 — admissão, escape e comando', 9500], ['Estágio 3 — forjado, bicos e mapa de pista', 19000]] },
        turbo: { name: 'Turbo', icon: '🌀', lv: [['Aspirado', 0], ['Kit turbo com intercooler e blow-off', 14000]] },
        tBrk: { name: 'Freios', icon: '🛑', lv: [['De fábrica', 0], ['Pastilhas cerâmicas e fluido de corrida', 2500], ['Discos ventilados e pinças de 4 pistões', 6000], ['Big brake de 6 pistões', 12000]] },
        tSus: { name: 'Suspensão', icon: '🔩', lv: [['De fábrica', 0], ['Molas esportivas (−2,5 cm)', 3000], ['Coilover regulável (−5 cm)', 7000], ['Suspensão a ar (−7,5 cm)', 13000]] },
        kit: { name: 'Bodykit', icon: '🧩', lv: [['De fábrica', 0], ['Kit de rua — lip, saias e saia traseira na cor do carro', 5500], ['Kit de corrida — splitter, canards e difusor de carbono', 9000], ['Wide body — alargadores nas 4 rodas, saias largas e difusor', 16000]] },
        wing: { name: 'Aerofólio', icon: '🪽', lv: [['Nenhum', 0], ['Lip na tampa (cor do carro)', 2200], ['Asa GT (cor do carro)', 4800], ['Asa GT de carbono', 8500]] },
    },
    NEON_PRICE: 3500, PAINT_PRICE: 1800, SPECIAL_PRICE: 6500, REMOVE: 300,
    // multiplicadores por nível
    ENG_POW: [1, 1.1, 1.22, 1.36], ENG_TOP: [0, 0.03, 0.06, 0.1], BRK: [1, 1.15, 1.3, 1.5], SUS_GRIP: [1, 1.06, 1.12, 1.18], SUS_LOW: [0, 0.025, 0.05, 0.075],

    shops: [], built: false, game: null,

    // ---------------------------------------------------------------- lugares (como as concessionárias: porta na calçada de um lote)
    build(game) {
        if (this.built || !RealEstate.built || !Dealers.built) return;
        this.built = true; this.game = game;
        const rng = Pixel.rng(5150), home = SafeHouse.spawnWorld(), cands = [];
        for (const b of CityGrid.blocks) {
            if (b.open || b.virtual || b.organic || b.district === 'favela') continue;
            for (const l of b.lots) {
                if (l.landmark || l.safehouse || l.helipad || l.marina || (l.x1 - l.x0) * (l.z1 - l.z0) < 80) continue;
                const d = CityGrid.lotDoor(b, l);
                if (!d) continue;
                const loc = RealEstate.locate((l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2, b);
                if (loc.idx < 0.15 || loc.idx > 0.9) continue;
                if (home && hypot(d.x - home.x, d.z - home.z) < 60) continue;
                if (RealEstate.list.some((p) => hypot(p.x - d.x, p.z - d.z) < 16) || Dealers.list.some((p) => hypot(p.x - d.x, p.z - d.z) < 60)) continue;
                const r = RoadPlan.nearestRoadPoint(d.x, d.z, 14);
                if (!r) continue;
                cands.push({ door: d, bay: { x: r.x, z: r.z }, region: loc.region });
            }
        }
        while (this.shops.length < this.N && cands.length) {
            const c = cands.splice(Math.floor(rng() * cands.length), 1)[0];
            if (this.shops.some((s) => hypot(s.x - c.door.x, s.z - c.door.z) < 260)) continue;
            const s = { id: 'tune' + this.shops.length, name: this.NAMES[this.shops.length % this.NAMES.length], x: c.door.x, z: c.door.z, bay: c.bay, region: c.region };
            this.shops.push(s);
            CityGrid.addPoi({ type: 'tuning', name: `${s.name} — tunagem`, x: s.x, z: s.z });
        }
        this.glow = new GlowBatch(game.scene, this.shops.length + 1, 'tuneGlow', 'glow');
        for (let i = 0; i <= this.shops.length; i++) { this.glow.alloc(); this.glow.off(i); }
        this._t = 0;
        console.log(`[TUNAGEM] ${this.shops.map((s) => `${s.name} (${s.region})`).join(' · ')}`);
    },

    update(dt) {
        if (!this.built) return;
        const f = this.game.camera.target, G = this.glow;
        this._t += dt;
        const pulse = 0.7 + 0.3 * Math.sin(this._t * 3.4);
        this.shops.forEach((s, i) => {
            if (hypot(s.bay.x - f.x, s.bay.z - f.z) > 80) { G.off(i); return; }
            G.place(i, s.bay.x, 0.3, s.bay.z, 4.2 + 0.6 * pulse); G.color(i, 0.95, 0.25, 0.9, 0.7 * pulse);
        });
        G.flush();
    },

    // Loja cuja vaga (onde o carro para) está perto.
    at(x, z) {
        let best = null, bd = 8;
        for (const s of this.shops) { const d = Math.min(hypot(s.bay.x - x, s.bay.z - z), hypot(s.x - x, s.z - z) + 2); if (d < bd) { bd = d; best = s; } }
        return best;
    },
    // Dá para tunar? (carro de verdade: não moto, bicicleta, barco nem helicóptero)
    tunable(car) { return !!car && !car.isBike && !car.isBoat && !car.isChopper && !!CarSheet.MODELS[car.spec.id] && !car.destroyed; },

    // ---------------------------------------------------------------- peças → carro
    // Refaz a ficha (a partir da de fábrica, guardada na 1ª vez), freios, aderência e o visual com as peças de car.mods.
    apply(car) {
        if (!car || !car.spec) return;
        const base = car._specBase || (car._specBase = car.spec), m = car.mods || {};
        const eng = m.tEng | 0, brk = m.tBrk | 0, sus = m.tSus | 0, pm = (m.engine ? 1.25 : 1) * this.ENG_POW[eng] * (m.turbo ? 1.18 : 1);
        if (pm === 1) car.spec = base;
        else car.spec = Object.assign({}, base, { power: base.power * pm, t100: base.t100 ? base.t100 / pm : undefined, maxSpeed: base.maxSpeed * (1 + this.ENG_TOP[eng] + (m.turbo ? 0.05 : 0)) + (m.engine ? 4 : 0) });
        car.tuneBrake = this.BRK[brk]; car.tuneGrip = this.SUS_GRIP[sus];
        const v = car.visual;
        if (v && 'wing' in v) { v.wing = m.wing | 0; v.kit = m.kit | 0; v.lower = this.SUS_LOW[sus]; }
    },
    // Ficha de comparação: máxima (km/h) e 0–100 (s).
    stats(car) { return { top: Math.round(car.spec.maxSpeed * 3.6), t100: car.spec.t100 ? car.spec.t100.toFixed(1).replace('.', ',') : '—' }; },
    mul(car) { const v = ChopCareer.value(car._specBase || car.spec); return Math.max(0.85, Math.min(2.5, 0.85 + v / 6000)); },
    priceOf(car, k, lv) { return Math.round(this.PARTS[k].lv[lv][1] * this.mul(car) / 50) * 50; },
    paintPrice(car, row) { const P = CarSheet.PAINTS[row]; return Math.round((P && P.fx ? this.SPECIAL_PRICE : this.PAINT_PRICE) * this.mul(car) / 50) * 50; },
    // Cores à venda: as de fábrica civis (sem viatura, táxi, forças especiais, queimado e as velhas) e as especiais da tunagem.
    paints() {
        if (!this._paints) {
            const P = CarSheet.PAINTS, out = { normal: [], special: [] };
            P.forEach((p, i) => { if (p.fx) out.special.push(i); else if (!p.burnt && !p.worn && ![2, 6, 10, 11].includes(i)) out.normal.push(i); });
            this._paints = out;
        }
        return this._paints;
    },

    // ---------------------------------------------------------------- dirigindo: E na loja
    carPrompt(game) {
        const car = game.activeCar;
        if (game.mode !== 'car' || !this.tunable(car) || car.speed > 1.5) return '';
        const s = this.at(car.position.x, car.position.z);
        if (!s) return '';
        return `<b>E</b> tunar o carro<small>${s.name} · ${car.ownedRec ? 'bodykit, motor, turbo, freios, suspensão, pintura, neon e aerofólio' : '⚠ só tunamos carro SEU (comprado ou guardado na sua garagem)'}</small>`;
    },
    carInteract(game) {
        if (!this.carPrompt(game)) return false;
        const car = game.activeCar;
        if (!car.ownedRec) { game._flash('A loja só mexe em carro seu: compre um ou guarde este na vaga de uma casa sua (E na garagem)'); return true; }
        this.open(game, car, this.at(car.position.x, car.position.z));
        return true;
    },

    // ---------------------------------------------------------------- a janela (prévia ao vivo)
    _panel(game) {
        if (!this._p) {
            this._p = new Panel('tuneUI', { width: 470, onAct: (a, arg) => this._act(game, a, arg), onClose: () => { this._revert(); if (typeof TuneGarage !== 'undefined') TuneGarage.leave(game); } });
            const st = document.createElement('style');
            st.textContent = `#tuneUI.dm-modal{background:transparent!important;justify-content:flex-end;pointer-events:none}
                #tuneUI .dm-pp{pointer-events:auto;margin-right:2vw}
                #tuneUI .tn-row{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 2px}
                #tuneUI .tn-row .btn{padding:6px 9px;font-size:12px}
                #tuneUI .tn-row .btn.on{outline:2px solid #f0abfc;background:rgba(240,171,252,.18)}
                #tuneUI .tn-sw{display:inline-block;width:16px;height:16px;border-radius:5px;vertical-align:-3px;border:1px solid rgba(255,255,255,.45)}
                #tuneUI .tn-cap{font-size:12px;color:var(--tx-2);margin-top:8px}
                @media (max-width:640px){#tuneUI.dm-modal{justify-content:center;align-items:flex-end}#tuneUI .dm-pp{margin:0;max-height:55vh}}`;
            document.head.appendChild(st);
        }
        return this._p;
    },
    open(game, car, shop) {
        this._car = car; this._shop = shop;
        if (!car.mods) car.mods = {};
        this._orig = { paint: car.visual ? car.visual.variant : car.ownedRec.paint, mods: Object.assign({}, car.mods || {}) };
        this._sel = { paint: this._orig.paint, tEng: car.mods.tEng | 0, turbo: car.mods.turbo | 0, tBrk: car.mods.tBrk | 0, tSus: car.mods.tSus | 0, kit: car.mods.kit | 0, wing: car.mods.wing | 0, neon: car.mods.neon | 0 };
        this._cat = 'paint';
        if (typeof TuneGarage !== 'undefined') TuneGarage.enter(game, car, shop);        // a garagem por dentro (showroom 3D), se o carro tem modelo 3D
        this._render(game);
    },
    // O que mudou e quanto custa: [{ k, name, price }]
    _bill() {
        const car = this._car, o = this._orig, s = this._sel, out = [];
        if (s.paint !== o.paint) out.push({ k: 'paint', name: `Pintura ${CarSheet.PAINTS[s.paint].name}`, price: this.paintPrice(car, s.paint) });
        for (const k of Object.keys(this.PARTS)) {
            const was = o.mods[k] | 0, now = s[k];
            if (now !== was) out.push({ k, name: now ? this.PARTS[k].lv[now][0] : `Tirar: ${this.PARTS[k].name.toLowerCase()}`, price: now ? this.priceOf(car, k, now) : this.REMOVE });
        }
        if (s.neon !== (o.mods.neon | 0)) out.push({ k: 'neon', name: s.neon ? `Neon ${this.NEON_NAMES[s.neon]}` : 'Tirar o neon', price: s.neon ? Math.round(this.NEON_PRICE * this.mul(car) / 50) * 50 : this.REMOVE });
        return out;
    },
    // Põe a seleção no carro (prévia: ainda não pago).
    _preview(game) {
        const car = this._car, s = this._sel;
        car.mods = Object.assign({}, this._orig.mods, { tEng: s.tEng, turbo: s.turbo, tBrk: s.tBrk, tSus: s.tSus, kit: s.kit, wing: s.wing, neon: s.neon });
        if (car.visual && car.visual.setVariant) car.visual.setVariant(s.paint);
        this.apply(car);
        if (game.carLights) game.carLights.update(0, game.dayNight.night, game.camera.target, game.carDamage.allCars());
        if (typeof TuneGarage !== 'undefined') TuneGarage.sync(car, this._cat);
    },
    _revert() {
        const car = this._car;
        if (!car) return;
        car.mods = Object.assign({}, this._orig.mods);
        if (car.visual && car.visual.setVariant) car.visual.setVariant(this._orig.paint);
        this.apply(car);
        const g = this.game; if (g && g.carLights) g.carLights.update(0, g.dayNight.night, g.camera.target, g.carDamage.allCars());
    },
    _render(game) {
        const P = this._panel(game), car = this._car, s = this._sel, B = Panel.btn, inv = game.inventory;
        this._preview(game);
        const st = this.stats(car), bill = this._bill(), total = bill.reduce((t, b) => t + b.price, 0);
        const cats = [['paint', '🎨 Pintura'], ['kit', '🧩 Bodykit'], ['tEng', '⚙️ Motor'], ['turbo', '🌀 Turbo'], ['tBrk', '🛑 Freios'], ['tSus', '🔩 Suspensão'], ['neon', '💡 Neon'], ['wing', '🪽 Aerofólio']];
        const on = (cond) => (cond ? ' on' : '');
        let h = `<div class="tn-row">${cats.map(([k, n]) => `<button class="btn${on(this._cat === k)}" data-act="cat" data-arg="${k}">${n}</button>`).join('')}</div>`;
        const sw = (row) => `<i class="tn-sw" style="background:linear-gradient(135deg,${CarSheet.PAINTS[row].paint} 55%,${CarSheet.PAINTS[row].paint2 || CarSheet.PAINTS[row].paint})"></i>`;
        if (this._cat === 'paint') {
            const L = this.paints();
            h += `<div class="tn-cap">Cores · ${brl(this.paintPrice(car, L.normal[0]))}</div><div class="tn-row">${L.normal.map((r) => `<button class="btn${on(s.paint === r)}" data-act="paint" data-arg="${r}" title="${CarSheet.PAINTS[r].name}">${sw(r)}</button>`).join('')}</div>`;
            h += `<div class="tn-cap">Especiais — fosco, cromado, perolizado · ${brl(this.paintPrice(car, L.special[0]))}</div><div class="tn-row">${L.special.map((r) => `<button class="btn${on(s.paint === r)}" data-act="paint" data-arg="${r}" title="${CarSheet.PAINTS[r].name}">${sw(r)} ${CarSheet.PAINTS[r].name}</button>`).join('')}</div>`;
        } else if (this._cat === 'neon') {
            h += `<div class="tn-cap">Neon embaixo do carro (aparece com o motor ligado; à noite, forte) · ${brl(Math.round(this.NEON_PRICE * this.mul(car) / 50) * 50)}</div><div class="tn-row">`
                + `<button class="btn${on(!s.neon)}" data-act="neon" data-arg="0">Sem neon</button>`
                + Object.keys(this.NEON).map((i) => { const c = this.NEON[i].map((v) => Math.round(v * 255)).join(','); return `<button class="btn${on(s.neon === +i)}" data-act="neon" data-arg="${i}"><i class="tn-sw" style="background:rgb(${c});box-shadow:0 0 8px rgb(${c})"></i> ${this.NEON_NAMES[i]}</button>`; }).join('') + '</div>';
        } else {
            const C = this.PARTS[this._cat], was = this._orig.mods[this._cat] | 0;
            h += `<div class="tn-cap">${C.icon} ${C.name}</div><div class="tn-row" style="flex-direction:column">${C.lv.map(([n], i) => `<button class="btn${on(s[this._cat] === i)}" style="text-align:left" data-act="lv" data-arg="${i}">${n}<small style="float:right;margin-left:10px;color:#86efac">${i === was ? 'instalado' : i ? brl(this.priceOf(car, this._cat, i)) : brl(this.REMOVE)}</small></button>`).join('')}</div>`;
        }
        const o = this._orig;
        h += `<div class="tn-cap">FICHA: máx <b>${st.top} km/h</b> · 0–100 <b>${st.t100} s</b> · freios ×${this.BRK[s.tBrk].toFixed(2).replace('.', ',')} · aderência ×${this.SUS_GRIP[s.tSus].toFixed(2).replace('.', ',')}</div>`;
        h += bill.length ? `<div class="tn-cap">${bill.map((b) => `• ${b.name} — ${brl(b.price)}`).join('<br>')}</div>` : '<div class="tn-cap">Escolha as peças: o carro já aparece com elas. Fechar desfaz o que não foi pago.</div>';
        h += `<div class="dm-btns" style="justify-content:space-between;margin-top:10px">${B('close', 'Fechar')}${B('pay', `Pagar ${brl(total)}`, { pri: true, on: bill.length > 0 })}</div>
              <p class="dm-note">Acima de R$ 800, só dinheiro limpo. Você tem ${brl(inv.cash)} sujos e ${brl(inv.clean)} limpos.</p>`;
        P.show(`🏁 ${this._shop.name.toUpperCase()}`, `${car.spec.name} ${car.spec.model} · ${o.paint === s.paint ? CarSheet.PAINTS[s.paint].name : `${CarSheet.PAINTS[o.paint].name} → ${CarSheet.PAINTS[s.paint].name}`}`, h);
    },
    _act(game, a, arg) {
        const P = this._p, s = this._sel;
        if (a === 'close') { P.close(); return; }
        if (!this._car || game.activeCar !== this._car) { P.close(); return; }
        if (a === 'cat') this._cat = arg;
        else if (a === 'paint') s.paint = +arg;
        else if (a === 'neon') s.neon = +arg;
        else if (a === 'lv') s[this._cat] = +arg;
        else if (a === 'pay') { this._pay(game); return; }
        this._render(game);
    },
    _pay(game) {
        const car = this._car, bill = this._bill(), total = bill.reduce((t, b) => t + b.price, 0);
        if (!bill.length) return;
        const err = Mechanic.pay(game, { kind: 'tuning' }, total);
        if (err) { this._p.msg(err, false); AudioFX.blip(200, 0.1, 0.16); return; }
        const rec = car.ownedRec, turboWas = !!this._orig.mods.turbo;
        this._preview(game);
        rec.paint = this._sel.paint; rec.mods = Object.assign({}, car.mods);
        if (!!car.mods.turbo !== turboWas && typeof EngineAudio !== 'undefined') EngineAudio.refresh(car);
        this._orig = { paint: this._sel.paint, mods: Object.assign({}, car.mods) };
        AudioFX.blip(820, 0.12, 0.18);
        this._render(game);
        this._p.msg(`Pronto: ${bill.length} serviço(s) feito(s) por ${brl(total)}`);
    },
};
