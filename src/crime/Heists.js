// ============================================================================
// Heists — as JOALHERIAS da cidade e os GOLPES planejados nelas (como os "heists" do GTA V). Tela: o QUADRO DO GOLPE (Panel 'heistBoard',
// aberto pela carreira ASSALTANTE). Um golpe por vez; cada etapa de campo usa o espaço de trabalho das carreiras (um trabalho por vez).
//
//   JOALHERIAS   5 lojas da cidade viram joalheria (interior em art/JewelryStyles.js): 4 "de bairro" e a MAISON do Distrito Financeiro.
//                Com patente Profissional dá para quebrar as vitrines sozinho (crime/Robbery.js) — o alarme toca na hora. O golpe rende
//                muito mais: a equipe leva o malote inteiro (vitrines × multiplicador da loja + cofre) e um receptador paga 85%.
//   ETAPAS       1. ALVO        joalheria de bairro (Profissional) ou a Maison (Mestre do Golpe).
//                2. RECONHECIMENTO  entrar sem arma no horário e FOTOGRAFAR vitrines, câmeras e cofre (E nos pontos).
//                3. ABORDAGEM   FURTIVA (gás sonífero pelo duto: todo mundo dorme, o hacker desliga alarme e câmeras por um tempo) ou
//                               AGRESSIVA (invasão armada: alarme na hora, o atirador segura os reféns, o hacker atrasa a polícia).
//                4. PREPARAÇÃO  furtiva: gás (porto) + uniformes de dedetizadora · agressiva: armamento da equipe (favela) · as duas: carro
//                               de fuga opcional (um carro rápido roubado deixado perto da loja — senão o motorista traz o dele).
//                5. EQUIPE      HACKER, MOTORISTA e ATIRADOR: 3 opções de cada, com ★ e o CORTE (% do bruto). Quem participa de golpes
//                               ganha experiência (+1★ a cada 2 golpes, até ★★★). A equipe de elite pede Mestre do Golpe.
//                6. EXECUTAR    vá até a joalheria, entre (de máscara!), faça a limpa no tempo, saia e leve o malote até o PONTO DE
//                               ENTREGA sem estrelas. Lá o receptador paga e a equipe recebe os cortes; azar da equipe ruim
//                               (atirador baleado, motorista que bate) leva parte do malote.
// ============================================================================

const Heists = {
    STORE_NAMES: ['Joalheria Diamante Real', 'Ouro & Prata Rosé', 'Joias Atlântica', 'Gemma Fine Jewelry'],
    MAISON: 'Maison Diamante — Centro',
    CREW: {
        hacker: [
            { id: 'pixel', name: 'Pixel', base: 1, cut: 0.05, desc: 'Estudante que se acha hacker. Janela curta e às vezes é rastreado.' },
            { id: 'cica', name: 'Ciça Byte', base: 2, cut: 0.10, desc: 'Ex-funcionária de banco. Janela boa, quase nunca falha.' },
            { id: 'zero', name: 'Doutor Zero', base: 3, cut: 0.15, elite: true, desc: 'Lenda da deep web. Janela longa e a polícia demora muito a ser chamada.' },
        ],
        driver: [
            { id: 'zepedal', name: 'Zé Pedal', base: 1, cut: 0.05, desc: 'Motoboy de aplicativo. Traz um sedã popular; às vezes bate na fuga.' },
            { id: 'rafa', name: 'Rafa Turbo', base: 2, cut: 0.09, desc: 'Piloto de racha. Traz um hatch esportivo.' },
            { id: 'lia', name: 'Lia Volante', base: 3, cut: 0.14, elite: true, desc: 'Ex-dublê de cinema. Esportivo e rotas que tiram uma estrela da fuga.' },
        ],
        gunman: [
            { id: 'tonhao', name: 'Tonhão', base: 1, cut: 0.06, desc: 'Segurança de baile. Os reféns se acalmam rápido; pode tomar tiro na fuga.' },
            { id: 'caveira', name: 'Caveira', base: 2, cut: 0.10, desc: 'Ex-soldado do tráfico. Rende o segurança da loja na entrada.' },
            { id: 'brito', name: 'Sargento Brito', base: 3, cut: 0.16, elite: true, desc: 'Ex-BOPE. Ninguém levanta do chão e ninguém da equipe se fere.' },
        ],
    },
    ROLE: { hacker: '💻 Hacker', driver: '🚗 Motorista', gunman: '🔫 Atirador' },
    PREP: {
        gas: { name: 'Gás sonífero (BZ)', icon: '🧪', approach: 'stealth', desc: 'Busque as latas com o contato no porto (R$ 4.000) e traga para a favela ou para casa sem estrelas.' },
        uniforms: { name: 'Uniformes de dedetizadora', icon: '🧥', approach: 'stealth', desc: 'Pegue os uniformes na van da dedetizadora estacionada no comércio — se um policial vir, é crime.' },
        guns: { name: 'Armamento da equipe', icon: '🔫', approach: 'loud', desc: 'Compre os fuzis da equipe com o contato do atirador na favela (R$ 6.000).' },
        car: { name: 'Carro de fuga (opcional)', icon: '🏎', approach: null, opt: true, desc: 'Roube um carro rápido e deixe estacionado no ponto marcado perto da loja. Carro frio: a placa não é sua.' },
    },

    list: [], built: false, glow: null,
    plan: null,                   // { store, scouted, photos: {}, approach, prep: {}, car: { model, paint }, crew: { hacker, driver, gunman } }
    xp: {},                       // id do membro → golpes feitos
    cool: {},                     // id da joalheria → dia até quando fica fechada
    done: 0, best: 0, history: [],
    run: null,                    // golpe em execução: { take, window, ... } (ver HeistRunJob)
    carryKg: 0,

    // ---------------------------------------------------------------- rede de joalherias
    build(game) {
        if (this.built || !CityGrid.blocks || (typeof Banks !== 'undefined' && !Banks.built)) return;      // (os bancos escolhem as portas primeiro)
        this.built = true;
        Interiors.index();
        const pool = Interiors._doors.filter((d) => d.district !== 'favela' && !d.bank && d.style !== 'guns' && d.style !== 'drugs' && d.style !== 'gym').sort((a, b) => (a.id < b.id ? -1 : 1));
        const used = [], far = (d, m) => used.every((u) => hypot(u.x - d.x, u.z - d.z) > m);
        const pick = (ok, m) => { const c = pool.find((d) => !d.bank && !d.jewel && ok(d) && far(d, m)); if (c) used.push(c); return c; };
        const mk = (d, name, tier, v) => {
            if (!d) return;
            const J = { id: 'jw' + this.list.length, name, tier, x: d.x, z: d.z, door: d, sec: tier === 'centro' ? 3 : 1 + (this.list.length % 2), mul: tier === 'centro' ? 1.8 : 1 + 0.12 * (this.list.length % 3) };
            d.jewel = J; d.style = 'jewelry'; d.variant = v; d.name = name;
            this.list.push(J);
        };
        mk(pick((d) => d.biome === 'downtown', 80) || pick(() => true, 80), this.MAISON, 'centro', 0);
        const prefs = [(d) => d.district === 'island', (d) => d.biome === 'commercial', (d) => d.biome === 'residential' || d.biome === 'commercial', () => true];
        this.STORE_NAMES.forEach((n, i) => mk(pick(prefs[i], 140) || pick(() => true, 90), n, 'bairro', 1 + (i % 2)));
        this.glow = new GlowBatch(game.scene, this.list.length, 'jewelGlow', 'glow');
        for (const J of this.list) { const i = this.glow.alloc(); this.glow.place(i, J.x, 0.2, J.z, J.tier === 'centro' ? 4 : 3); this.glow.color(i, 0.75, 0.4, 0.95, 1); CityGrid.addPoi({ type: 'joalheria', name: J.name, x: J.x, z: J.z }); }
        this.glow.flush();
        Minimap._placesKey = null;
        console.log(`[JOALHERIAS] ${this.list.length} joalherias`);
    },
    get(id) { return this.list.find((j) => j.id === id) || null; },
    ofShop(shop) { return shop && shop.jewel ? shop.jewel : null; },
    closed(shop) { const J = this.ofShop(shop); return !!J && (this.cool[J.id] || 0) > Economy.day; },
    // A joalheria do plano em andamento não pode ser roubada "solta" (o golpe é pelo quadro).
    lockedStore(shop) { const J = this.ofShop(shop); return !!J && !!this.plan && this.plan.store === J.id && !this.run; },
    rankFor(J) { return J.tier === 'centro' ? 3 : 2; },
    estimate(J) {
        const cases = J.tier === 'centro' ? 8 : 7, z = 1.18;
        const mid = cases * 3 * 4500 * J.mul * z + (Robbery.SAFE[4][0] + Robbery.SAFE[4][1]) / 2 * z * (J.tier === 'centro' ? 1.5 : 1);
        return [Math.round(mid * 0.7 / 1000) * 1000, Math.round(mid * 1.15 / 1000) * 1000];
    },

    // ---------------------------------------------------------------- equipe
    member(role, id) { return this.CREW[role].find((m) => m.id === id) || null; },
    stars(m) { return m ? Math.min(3, m.base + Math.floor((this.xp[m.id] || 0) / 2)) : 0; },
    cuts() { const p = this.plan; if (!p || !p.crew) return 0; let c = 0; for (const r of ['hacker', 'driver', 'gunman']) { const m = this.member(r, p.crew[r]); if (m) c += m.cut; } return c; },
    crewOk() { const p = this.plan; return !!(p && p.crew && p.crew.hacker && p.crew.driver && p.crew.gunman); },
    prepsFor(ap) { return Object.keys(this.PREP).filter((k) => this.PREP[k].approach === ap || this.PREP[k].approach === null); },
    prepsOk() { const p = this.plan; return !!(p && p.approach && this.prepsFor(p.approach).every((k) => this.PREP[k].opt || p.prep[k])); },
    ready() { const p = this.plan; return !!(p && p.store && p.scouted && p.approach && this.prepsOk() && this.crewOk()); },

    // ---------------------------------------------------------------- execução (malote)
    take(v) { if (!this.run) return; this.run.take += v; this.carryKg = this.run.take / 25000; },
    lose() { if (this.run) this.run.take = 0; this.carryKg = 0; },

    // Entrou na joalheria do golpe com a execução em andamento: começa o assalto com o contexto da equipe (Interiors._doEnter).
    onEnter(game, shop) {
        const R = this.run, J = this.ofShop(shop); if (!R || !J || J.id !== this.plan.store || R.stage !== 'go') return;
        const p = this.plan, hk = this.stars(this.member('hacker', p.crew.hacker)), gm = this.stars(this.member('gunman', p.crew.gunman));
        const stealth = p.approach === 'stealth';
        let window = stealth ? [0, 40, 60, 85][hk] : 0;
        if (stealth && Math.random() < [0, 0.25, 0.08, 0][hk]) { window = Math.round(window * 0.5); game._flash('💻 O hacker foi detectado no meio — a janela vai ser curta!'); game.heat.fileEvidence('cybercrime'); }
        const H = { approach: p.approach, hacker: hk, gunman: gm, window, valueMul: J.mul };
        Robbery.start(game, H);
        if (stealth && Robbery.session) { Robbery.session.dvr = true; Robbery.session.camsLooped = true; }      // (o hacker põe as câmeras em loop: não grava nada)
        R.stage = 'inside'; R.H = H;
        if (stealth) game._flash(`🧪 A equipe jogou o gás pelo duto: todo mundo dormiu. 💻 Alarme e câmeras desligados por ${window}s — QUEBRE AS VITRINES!`);
        else { Robbery.callPolice(game, 'Invasão armada: o alarme tocou', 1, true); game._flash('🔫 "TODO MUNDO NO CHÃO!" — o atirador segura os reféns. Quebre as vitrines e o cofre, rápido!'); this._gunmanActor(game, true); }
    },
    _gunmanActor(game, on) {
        if (!on) { if (this._gun) this._gun.setVisible(false); return; }
        if (typeof NpcArt === 'undefined' || !NpcArt.atlases || !NpcArt.atlases.trafic_mascarado) return;
        const o = Interiors.STAGE, d = Interiors.active.data, dc = (d.door.x0 + d.door.x1) / 2;
        if (!this._gun) this._gun = new SpriteActor(game.scene, NpcArt.sheet('trafic_mascarado'), NpcArt.row('trafic_mascarado', 1), 'heistGunman');
        const a = this._gun;
        a.setPosition(o.x + dc - 1.6, o.z + 2.2); a.mesh.computeWorldMatrix(true); a.mesh.refreshBoundingInfo(); a.setHeading(0.4); a.setVisible(true); a.mesh.position.y = 0.5;
        a.play('aim', 'shotgun') || a.play('idle', 'shotgun') || a.play('idle');
    },
    interiorTick(dt) { if (this._gun && this._gun.mesh.isEnabled()) this._gun.update(dt, 1); },

    // Saiu da joalheria (Robbery._end): estrelas da fuga, o carro de fuga na calçada e o ponto de entrega.
    onExit(game, s, how) {
        const R = this.run; this._gunmanActor(game, false);
        if (!R) return;
        const p = this.plan, J = this.get(p.store), dr = this.stars(this.member('driver', p.crew.driver));
        if (R.take <= 0) { this.onFail(game, 'saiu da joalheria de mãos vazias'); return; }
        const stealthClean = p.approach === 'stealth' && R.H && R.H.window > 0;
        if (!stealthClean && how !== 'fight') game.wanted.ensureLevel(p.approach === 'loud' ? 3 : 2);
        if (dr >= 3 && game.wanted.level >= 2) game._delayed.push({ t: 1.5, fn: () => { if (game.wanted.level >= 2) { game.wanted._set(game.wanted.level - 1, 'driver'); game._flash('🚗 Lia Volante conhece as rotas: a polícia perdeu uma estrela de pista'); } } });
        R.stage = 'escape';
        this._spawnGetaway(game, J, dr);
        const drop = this.dropPoint();
        if (game.careers.job instanceof HeistRunJob) game.careers.job.escape(drop);
        game._flash(`💰 Malote com ${brl(R.take)} em joias e dinheiro. ENTRE NO CARRO DE FUGA e leve até o ponto de entrega${stealthClean ? ' — ninguém sabe de nada ainda' : ''}!`);
    },
    _spawnGetaway(game, J, dr) {
        const p = this.plan, model = p.car ? p.car.model : ['sedan_popular', 'sedan_popular', 'hatch_esportivo', 'esportivo'][dr], paint = p.car ? p.car.paint : 3 + dr;
        const slot = Garage.curbSlots(J.x, J.z, 3).find((q) => !game.vehicleManager.vehicles.some((c) => hypot(c.position.x - q.x, c.position.z - q.z) < 3.4));
        const at = slot || { x: J.x + 4, z: J.z, h: 0 };
        const car = Garage.spawnCar(game, model, paint, at.x, at.z, at.h);
        if (car) { car.fuel = car.tank; car._heistCar = true; this.run.car = car; }
    },
    dropPoint() { const c = Careers.instance; return c ? c.favelaSpot(9301, 0.12, 0.3) : { x: 0, z: 0 }; },

    // Chegou ao ponto de entrega sem estrelas: o receptador paga, a equipe recebe e o azar de quem é ruim pesa.
    payout(game) {
        const R = this.run, p = this.plan, J = this.get(p.store), lines = [];
        if (typeof WorldMemory !== 'undefined' && J) WorldMemory.crime('heist', J.x, J.z, { place: J.name, value: Math.round(R.take || 0) });
        let gross = R.take;
        const gm = this.stars(this.member('gunman', p.crew.gunman)), dr = this.stars(this.member('driver', p.crew.driver)), hk = this.stars(this.member('hacker', p.crew.hacker));
        if (Math.random() < [0, 0.3, 0.1, 0][gm]) { const l = Math.round(gross * 0.15); gross -= l; lines.push(`🩸 ${this.member('gunman', p.crew.gunman).name} tomou um tiro na fuga e a bolsa dele ficou: −${brl(l)}`); }
        if (Math.random() < [0, 0.22, 0.08, 0][dr]) { const l = Math.round(gross * 0.1); gross -= l; lines.push(`💥 ${this.member('driver', p.crew.driver).name} bateu a van da equipe: −${brl(l)}`); }
        if (Math.random() < [0, 0.2, 0.05, 0][hk]) { game.heat.fileEvidence('cybercrime'); lines.push(I18n.t('heat.heist.digitalTrail', { name: this.member('hacker', p.crew.hacker).name })); }
        const fenced = Math.round(gross * 0.85), cutPct = this.cuts(), cuts = Math.round(fenced * cutPct), mine = fenced - cuts;
        const pay = game.careers.payout(game.careers.by.robber, mine);
        game.inventory.addCash(pay);
        for (const r of ['hacker', 'driver', 'gunman']) this.xp[p.crew[r]] = (this.xp[p.crew[r]] || 0) + 1;
        this.done++; this.best = Math.max(this.best, pay);
        this.history.unshift({ store: J.name, day: Economy.day, take: R.take, pay });
        this.history = this.history.slice(0, 6);
        this.cool[J.id] = Economy.day + 3;
        const R2 = game.careers.by.robber; R2.addXp(600 + pay / 120);
        R2.data.total = (R2.data.total || 0) + pay; R2.data.best = Math.max(R2.data.best || 0, pay);
        if (game.achievements && game.achievements.bump) game.achievements.bump('heists');
        if (game.skills) game.skills.addXp(300);
        this._result(game, { J, take: R.take, gross, fenced, cutPct, cuts, pay, lines });
        if (R.car && !R.car.trunk) R.car.keep = false;                       // (o carro de fuga volta a ser um carro qualquer da rua)
        this.run = null; this.carryKg = 0; this.plan = null;
        return pay;
    },
    onFail(game, why) {
        if (!this.run) return;
        const p = this.plan, J = p && this.get(p.store);
        if (this.run.car && !this.run.car.trunk) this.run.car.keep = false;
        this.run = null; this.carryKg = 0;
        if (J) this.cool[J.id] = Economy.day + 3;
        if (p) { p.scouted = false; p.photos = {}; p.prep = {}; p.car = null; }        // (a joalheria troca a segurança: replaneje)
        this._gunmanActor(game, false);
        const j = game.careers.job;
        if (j instanceof HeistRunJob && !j._disposing) j.fail(why);
        game._flash(`✖ GOLPE FRACASSADO: ${why} — o malote se perdeu e a joalheria reforçou a segurança`);
    },

    _result(game, r) {
        if (!this._rp) this._rp = new Panel('heistResult', { width: 520, onAct: () => this._rp.close() });
        const kv = Panel.kv;
        this._rp.show('💎 GOLPE CONCLUÍDO', `${r.J.name} · dia ${Economy.day}`,
            `${kv('Malote (joias e dinheiro)', brl(r.take))}${r.lines.map((l) => `<p class="dm-note" style="color:#fda4af">${l}</p>`).join('')}
             ${kv('Receptador (85%)', brl(r.fenced))}${kv(`Cortes da equipe (${Math.round(r.cutPct * 100)}%)`, '−' + brl(r.cuts))}
             <div class="dm-kv" style="font-size:16px"><span>SUA PARTE (dinheiro sujo)</span><b style="color:#fde68a">${brl(r.pay)}</b></div>
             <p class="dm-note">A equipe ganhou experiência. A joalheria fica fechada 3 dias. Lave o dinheiro nos seus negócios.</p>
             <div class="dm-btns" style="justify-content:center">${Panel.btn('ok', 'Fechar', { pri: true })}</div>`);
    },

    // ---------------------------------------------------------------- quadro do golpe
    summary(g) {
        const p = this.plan, J = p && this.get(p.store);
        const line = (k, v) => `<div class="cr-row"><span>${k}</span><b>${v}</b></div>`;
        return line('Golpes feitos', this.done) + line('Maior parte sua', brl(this.best)) + line('Plano atual', J ? `${J.name}${this.ready() ? ' — PRONTO' : ''}` : '—');
    },

    openBoard(game) {
        this.build(game);
        if (!this._bp) this._bp = new Panel('heistBoard', { width: 900, onAct: (a, arg) => this._act(game, a, arg) });
        this._renderBoard(game);
    },
    _renderBoard(game) {
        const P = this._bp, p = this.plan, R = game.careers.by.robber, B = Panel.btn, kv = Panel.kv;
        const stars = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
        let h = '';
        if (R.rank < 2) h += `<p class="dm-note" style="color:#fda4af;text-align:center">Golpes planejados pedem a patente PROFISSIONAL (Assaltante). Você é ${R.rankName}: assalte lojas para subir.</p>`;
        // 1. alvo
        h += '<div class="dm-sec">1 · ALVO</div><div class="dm-grid">';
        for (const J of this.list) {
            const est = this.estimate(J), mine = typeof Business !== 'undefined' && Business.isOwned(J.door), lock = R.rank < this.rankFor(J), shut = (this.cool[J.id] || 0) > Economy.day, on = p && p.store === J.id;
            h += `<div class="dm-card${on ? ' on' : ''}"><h4>💎 ${J.name}<small>${game.empire ? game.empire.dName(game.empire.districtAt(J.x, J.z)) : ''}</small></h4>
                <p>Segurança ${stars(J.sec)} · malote estimado ${brl(est[0])}–${brl(est[1])}</p>
                <div class="dm-btns">${on ? '<span class="dm-tag g">ALVO ESCOLHIDO</span>' : B('target', mine ? 'É seu negócio' : lock ? `Pede ${R.ranks[this.rankFor(J)].name}` : shut ? `Fechada até o dia ${this.cool[J.id]}` : 'Escolher', { arg: J.id, on: !mine && !lock && !shut && !this.run })}${B('mark', '📍 Mapa', { arg: J.id })}</div></div>`;
        }
        h += '</div>';
        if (p) {
            const J = this.get(p.store), job = game.careers.job;
            // 2. reconhecimento
            h += `<div class="dm-sec">2 · RECONHECIMENTO</div><div class="dm-card${p.scouted ? ' on' : ''}"><p>Entre na ${J.name} no horário (10h–20h), SEM ARMA NA MÃO, e fotografe (E) as vitrines, as câmeras e o cofre. Revela o layout e libera a abordagem.</p>
                <div class="dm-btns">${p.scouted ? '<span class="dm-tag g">✔ FEITO</span>' : B('scout', job instanceof HeistScoutJob ? 'Em andamento' : 'Começar o reconhecimento', { on: !job })}</div></div>`;
            // 3. abordagem
            h += '<div class="dm-sec">3 · ABORDAGEM</div><div class="dm-grid">';
            for (const [ap, t, d] of [['stealth', '🧪 FURTIVA (gás)', 'Gás pelo duto: clientes e funcionários dormem. O hacker desliga alarme e câmeras por um tempo (★ do hacker). Sem reféns para controlar; saindo antes do alarme, ninguém liga por 1 minuto.'],
                ['loud', '🔫 AGRESSIVA (invasão)', 'Entrada armada: o alarme toca na hora (3 estrelas na saída). O atirador segura os reféns e o segurança; o hacker atrasa a polícia.']]) {
                h += `<div class="dm-card${p.approach === ap ? ' on' : ''}"><h4>${t}</h4><p>${d}</p><div class="dm-btns">${p.approach === ap ? '<span class="dm-tag g">ESCOLHIDA</span>' : B('approach', 'Escolher', { arg: ap, on: p.scouted && !this.run })}</div></div>`;
            }
            h += '</div>';
            // 4. preparação
            if (p.approach) {
                h += '<div class="dm-sec">4 · PREPARAÇÃO</div><div class="dm-grid">';
                for (const k of this.prepsFor(p.approach)) {
                    const D = this.PREP[k], ok = p.prep[k], mine = job && job.prepKey === k;
                    h += `<div class="dm-card${ok ? ' on' : ''}"><h4>${D.icon} ${D.name}</h4><p>${D.desc}</p><div class="dm-btns">${ok ? `<span class="dm-tag g">✔ ${k === 'car' && p.car ? CarSheet.MODELS[p.car.model].model : 'PRONTO'}</span>` : B('prep', mine ? 'Em andamento' : 'Começar', { arg: k, on: !job })}</div></div>`;
                }
                h += '</div>';
            }
            // 5. equipe
            h += '<div class="dm-sec">5 · EQUIPE (o corte sai do bruto)</div><div class="dm-grid">';
            for (const role of ['hacker', 'driver', 'gunman']) {
                h += `<div class="dm-card"><h4>${this.ROLE[role]}</h4>`;
                for (const m of this.CREW[role]) {
                    const sel = p.crew && p.crew[role] === m.id, lock = m.elite && R.rank < 3;
                    h += `<div class="dm-row"><div class="t"><b>${m.name}</b> <span style="color:var(--gold)">${stars(this.stars(m))}</span> · ${Math.round(m.cut * 100)}%<small>${m.desc}${this.xp[m.id] ? ` · ${this.xp[m.id]} golpe(s)` : ''}</small></div>${sel ? '<span class="dm-tag g">NA EQUIPE</span>' : B('crew', lock ? 'Mestre' : 'Chamar', { arg: role + ':' + m.id, on: !lock && !this.run })}</div>`;
                }
                h += '</div>';
            }
            h += '</div>';
            // 6. executar
            const est = this.estimate(J), cut = this.cuts();
            h += `<div class="dm-sec">6 · EXECUTAR</div><div class="dm-card${this.ready() ? ' on' : ''}">
                ${kv('Malote estimado', `${brl(est[0])} – ${brl(est[1])}`)}${kv('Receptador', '85%')}${kv('Cortes da equipe', Math.round(cut * 100) + '%')}
                ${kv('Sua parte estimada', `${brl(est[0] * 0.85 * (1 - cut))} – ${brl(est[1] * 0.85 * (1 - cut))}`)}
                <p>Leve balaclava, luvas e uma bolsa grande. Ponto de entrega: na favela (marcado ao sair da loja).</p>
                <div class="dm-btns">${this.run ? '<span class="dm-tag y">GOLPE EM ANDAMENTO</span>' : B('go', '🔥 EXECUTAR O GOLPE', { pri: true, on: this.ready() && !job })}${B('cancel', 'Desistir do plano', { on: !this.run })}</div></div>`;
        }
        if (this.history.length) h += '<div class="dm-sec">ÚLTIMOS GOLPES</div>' + this.history.map((x) => kv(`Dia ${x.day} · ${x.store}`, `malote ${brl(x.take)} · sua parte ${brl(x.pay)}`)).join('');
        P.show('🗺 QUADRO DO GOLPE', `ASSALTANTE · ${R.rankName.toUpperCase()} · ${game.careers.job ? 'trabalho em andamento: ' + game.careers.job.title : 'sem trabalho em andamento'}`, h);
    },

    _act(game, a, arg) {
        const P = this._bp, p = this.plan, C = game.careers;
        const say = (m, ok = true) => { P.msg(m, ok); this._renderBoard(game); P.msg(m, ok); };
        if (a === 'target') { this.plan = { store: arg, scouted: false, photos: {}, approach: null, prep: {}, car: null, crew: {} }; return say(`Alvo: ${this.get(arg).name}. Agora o reconhecimento.`); }
        if (a === 'mark') { const J = this.get(arg); game.setGps(J.x, J.z, J.name); return say('Marcado no mapa'); }
        if (a === 'approach') { p.approach = arg; return say(arg === 'stealth' ? 'Abordagem furtiva: gás e uniformes.' : 'Abordagem agressiva: armamento pesado.'); }
        if (a === 'crew') { const [role, id] = arg.split(':'); p.crew[role] = id; return say(`${this.member(role, id).name} entrou na equipe`); }
        if (a === 'cancel') { this.plan = null; return say('Plano descartado'); }
        let job = null;
        if (a === 'scout') job = new HeistScoutJob(C, this.get(p.store));
        else if (a === 'prep') job = new HeistPrepJob(C, arg, this.get(p.store));
        else if (a === 'go') job = new HeistRunJob(C, this.get(p.store));
        if (!job) return;
        const r = C.startExternal(job);
        if (r.ok) { P.close(); game._flash(r.msg); } else say(r.msg, false);
    },

    // ---------------------------------------------------------------- fotos do reconhecimento (dentro da joalheria)
    scouting(game) { const j = game.careers && game.careers.job; return j instanceof HeistScoutJob && Interiors.active && Interiors.active.shop.jewel === j.J ? j : null; },
    scoutPrompt(game) {
        const j = this.scouting(game); if (!j) return null;
        if (Robbery.gunInHand(game)) return '<b>GUARDE A ARMA</b><small>o segurança está de olho — reconhecimento é de mãos vazias (1)</small>';
        const u = this._scoutUse(game);
        const left = ['case', 'dvr', 'safe'].filter((k) => !j.photos[k]).map((k) => ({ case: 'vitrines', dvr: 'câmeras', safe: 'cofre' }[k])).join(', ');
        if (j.busy > 0) return `<b>FOTOGRAFANDO</b> ${crBar(1 - j.busy / 1.4)}<small>disfarça…</small>`;
        if (u) return `<b>E</b> fotografar ${{ case: 'as vitrines', dvr: 'o gravador das câmeras', safe: 'o cofre do escritório' }[u.kind]}<small>faltam: ${left}</small>`;
        return left ? `<b>RECONHECIMENTO</b><small>chegue perto e fotografe: ${left}</small>` : '<b>RECONHECIMENTO FEITO</b><small>saia da loja</small>';
    },
    _scoutUse(game) { const j = this.scouting(game); if (!j) return null; const u = Robbery._nearUse(game, 2.2); return u && ['case', 'dvr', 'safe'].includes(u.kind) && !j.photos[u.kind] ? u : null; },
    scoutInteract(game) {
        const j = this.scouting(game); if (!j || Robbery.gunInHand(game) || j.busy > 0) return !!j;
        const u = this._scoutUse(game); if (!u) return true;
        j.busy = 1.4; j.shot = u.kind;
        game.player.playAction('rummage', { lock: 0 }); if (game.player.action) game.player.action.timer = 1.4;
        AudioFX.blip(1600, 0.05, 0.12);
        return true;
    },
    scoutTick(dt, game) { const j = this.scouting(game); if (!j || !(j.busy > 0)) return; j.busy -= dt; if (j.busy <= 0) { j.photos[j.shot] = true; AudioFX.blip(1800, 0.06, 0.12); game._flash(`📸 Foto: ${{ case: 'vitrines', dvr: 'câmeras', safe: 'cofre' }[j.shot]}`); } },

    serialize() { return { plan: this.plan, xp: this.xp, cool: this.cool, done: this.done, best: this.best, hist: this.history }; },
    load(s) {
        this.plan = null; this.xp = {}; this.cool = {}; this.done = 0; this.best = 0; this.history = []; this.run = null; this.carryKg = 0;
        if (!s) return;
        this.plan = s.plan || null; this.xp = s.xp || {}; this.cool = s.cool || {}; this.done = s.done || 0; this.best = s.best || 0; this.history = s.hist || [];
        if (this.plan) this.plan.prep = this.plan.prep || {};
    },
};

// ---------------------------------------------------------------------------- etapas de campo (espaço de trabalho das carreiras)
class HeistScoutJob extends CareerJob {
    constructor(c, J) { super(c.by.robber, { title: 'RECONHECIMENTO', text: `Fotografe a ${J.name} por dentro`, limit: 900 }); this.J = J; this.photos = {}; this.busy = 0; }
    start() { this.target(this.J.x, this.J.z, this.J.name, '#c084fc'); return true; }
    status() { const n = Object.keys(this.photos).length; return n >= 3 ? 'SAIA DA LOJA' : `FOTOS ${n}/3`; }
    update(dt, pos) {
        if (Object.keys(this.photos).length >= 3 && !Interiors.active) {
            const p = Heists.plan; if (p && p.store === this.J.id) { p.scouted = true; p.photos = Object.assign({}, this.photos); }
            this.succeed(0, 180, `reconhecimento da ${this.J.name}: layout, câmeras e cofre mapeados — escolha a abordagem no quadro`);
        }
    }
}

class HeistPrepJob extends CareerJob {
    constructor(c, key, J) {
        const D = Heists.PREP[key];
        super(c.by.robber, { title: D.name.toUpperCase(), text: D.desc, limit: key === 'car' ? 900 : 540 });
        this.prepKey = key; this.J = J; this.stage = 0;
    }
    start() {
        const g = this.g, C = this.mgr, k = this.prepKey;
        if (k === 'gas') { const q = C.cityDoor(this.J, 0, 2400, (d) => d.biome === 'industrial' || d.biome === 'port') || C.cityDoor(g._playerState().pos, 150, 900); this.spot = q ? { x: q.x, z: q.z } : C.streetNear(this.J.x + 200, this.J.z, 60); }
        else if (k === 'uniforms') { const q = C.cityDoor(g._playerState().pos, 80, 600, (d) => d.biome === 'commercial' && d.district !== 'favela'); this.spot = q ? (C.streetNear(q.x + 6, q.z + 6, 14) || { x: q.x, z: q.z }) : null; }
        else if (k === 'guns') this.spot = C.favelaSpot(9302, 0.2, 0.45);
        else if (k === 'car') { const q = Garage.curbSlots(this.J.x + 30, this.J.z + 30, 1)[0] || C.streetNear(this.J.x + 30, this.J.z, 30); this.spot = q ? { x: q.x, z: q.z } : null; }
        if (!this.spot) { this.why = 'Não achei o ponto agora — tente de novo'; return false; }
        this.target(this.spot.x, this.spot.z, { gas: 'Contato do porto', uniforms: 'Van da dedetizadora', guns: 'Contato do atirador', car: 'Esconder o carro de fuga' }[k], '#c084fc');
        if (k === 'car') this.text = 'Roube um carro RÁPIDO (máx. ≥ 100 km/h) e estacione no ponto marcado';
        return true;
    }
    status() { return this.stage === 0 ? 'VÁ AO PONTO' : 'LEVE PARA A FAVELA OU PARA CASA'; }
    prompt() {
        const g = this.g, k = this.prepKey;
        if (k === 'car') { if (g.mode === 'car' && this.near(g.activeCar.position, 7)) return `<b>E</b> deixar o carro de fuga aqui<small>${g.activeCar.spec.maxSpeed * 3.6 >= 100 ? 'rápido o bastante ✔' : 'LENTO DEMAIS — a equipe quer ≥ 100 km/h'}</small>`; return ''; }
        if (g.mode !== 'player' || this.stage !== 0 || !this.near(g.player.position, 3.2)) return '';
        return { gas: `<b>E</b> pagar ${brl(4000)} e pegar as latas de gás<small>dinheiro sujo · depois leve para a favela ou para casa sem estrelas</small>`, uniforms: '<b>E</b> pegar os uniformes na van<small>se um policial vir, é crime</small>', guns: `<b>E</b> pagar ${brl(6000)} pelos fuzis da equipe<small>dinheiro sujo</small>` }[k];
    }
    interact() {
        const g = this.g, k = this.prepKey, inv = g.inventory;
        if (k === 'car') {
            if (g.mode !== 'car' || !this.near(g.activeCar.position, 7)) return false;
            const car = g.activeCar;
            if (car.spec.maxSpeed * 3.6 < 100) { g._flash('A equipe quer um carro que passe de 100 km/h'); return true; }
            if (car.ownedRec) { g._flash('Carro registrado no seu nome não serve: tem que ser carro frio (roubado)'); return true; }
            const p = Heists.plan; if (p) { p.prep.car = true; p.car = { model: car.spec.id, paint: car.visual ? car.visual.variant || 0 : 0 }; }
            g._leaveVehicle();
            g._delayed.push({ t: 2, fn: () => { if (g.activeCar !== car && g.traffic && !car.destroyed) g.traffic._relocate(car, 'parked'); } });
            this.succeed(0, 120, `carro de fuga (${car.spec.model}) escondido: ele vai estar na calçada da joalheria na hora do golpe`);
            return true;
        }
        if (g.mode !== 'player' || this.stage !== 0 || !this.near(g.player.position, 3.2)) return false;
        if (k === 'gas' || k === 'guns') {
            const price = k === 'gas' ? 4000 : 6000;
            if (inv.cash < price) { g._flash(`Faltam ${brl(price - inv.cash)} de dinheiro sujo`); return true; }
            inv.cash -= price;
            if (k === 'guns') { this._done(); return true; }
            this.stage = 1; Heists.carryKg = 12;
            g._flash('🧪 Latas de gás na mochila (12 kg) — leve para a favela ou para casa sem estrelas');
            const f = this.mgr.favelaSpot(9301, 0.12, 0.3); this.target(f.x, f.z, 'Esconderijo da equipe', '#c084fc');
            return true;
        }
        this.mgr.act('rummage', 2);
        this.stage = 1;
        if (this.mgr.copDist(g.player.position) < 24) { g.heat.commit('burglary', CrimeExposure.POLICE); g._flash('Um policial viu você mexendo na van!'); }
        const f = this.mgr.favelaSpot(9301, 0.12, 0.3); this.target(f.x, f.z, 'Esconderijo da equipe', '#c084fc');
        g._flash('🧥 Uniformes pegos — leve para a favela ou para casa');
        return true;
    }
    update(dt, pos) { if (this.stage === 1 && this.g.wanted.level === 0 && this.mgr.atBase()) this._done(); }
    _done() { const p = Heists.plan; if (p) p.prep[this.prepKey] = true; Heists.carryKg = Heists.run ? Heists.carryKg : 0; this.succeed(0, 140, `${Heists.PREP[this.prepKey].name}: pronto — veja o quadro do golpe`); }
    dispose() { if (!Heists.run) Heists.carryKg = 0; }
}

class HeistRunJob extends CareerJob {
    constructor(c, J) { super(c.by.robber, { title: 'O GOLPE', text: `Entre na ${J.name} e faça a limpa`, limit: 1500 }); this.J = J; }
    start() {
        const g = this.g;
        Heists.run = { take: 0, stage: 'go', H: null, car: null };
        Heists.carryKg = 0;
        this.target(this.J.x, this.J.z, this.J.name, '#c084fc');
        if (!Traces.fullMask()) g._flash('🥷 Dica: ponha a balaclava (K) antes de entrar');
        if (!Economy.isOpen('jewelry', g.dayNight.hour)) this.text = `A ${this.J.name} abre às 10h (fecha às 20h) — espere abrir`;
        return true;
    }
    escape(drop) { this.drop = drop; this.text = 'Fuja com o malote até o ponto de entrega — sem estrelas'; this.target(drop.x, drop.z, 'Ponto de entrega', '#fbbf24'); this.t = Math.max(this.t, 600); }
    status() { const R = Heists.run; if (!R) return ''; return R.stage === 'escape' ? `MALOTE ${brl(R.take)}${this.g.wanted.level ? ' · DESPISTE A POLÍCIA' : ''}` : R.stage === 'inside' ? 'DENTRO DA LOJA' : 'VÁ ATÉ A JOALHERIA'; }
    update(dt, pos) {
        const R = Heists.run; if (!R || R.stage !== 'escape' || !this.drop) return;
        if (hypot(pos.x - this.drop.x, pos.z - this.drop.z) < 9 && this.g.wanted.level === 0) {
            const pay = Heists.payout(this.g);
            this._paid = true;
            this.succeed(0, 0, `golpe concluído: sua parte ${brl(pay)}`);
        }
    }
    dispose() { this._disposing = true; if (!this._paid && Heists.run) { Heists.run.take = 0; Heists.onFail(this.g, this._why || 'o golpe foi abandonado'); } }
    fail(why) { this._why = why; super.fail(why); }
}
Economy.STYLES.jewelry = { label: 'Joalheria', tier: 1.15, hours: [10, 20], stock: [['of_relogio_ouro', 1, 2], ['of_corrente_ouro', 1, 2], ['of_oculos_escuros', 1, 3]] };
Economy.NAMES.jewelry = ['Joalheria'];
