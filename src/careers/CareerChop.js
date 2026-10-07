// ============================================================================
// Carreira: DESMANCHE — roubo e adulteração de veículos.
//   Puxador           PUXADA: furtar um carro popular estacionado e levar ao desmanche da favela. Amassado derruba o pagamento.
//   Dublê/Adulterador ENCOMENDA DE LUXO: carro com RASTREADOR — chegar à oficina com bloqueador antes do tempo; lá, parado,
//                     clonar a placa e adulterar o chassi (barra de progresso). Estourou o tempo: a polícia vai direto no carro.
//   Mestre Mecânico   FROTA DO TRÁFICO (SUV/picape preparada) e a gestão de DESMANCHES próprios: renda diária × SUSPEITA da
//                     Receita (comprar peças demais chama atenção; "maquiar a contabilidade" exige dinheiro limpo).
// Fora dos trabalhos: qualquer carro roubado pode ser DESMANCHADO no desmanche (E, dentro do carro) e a OFICINA (tecla O dentro do
// carro, no desmanche) prepara o SEU carro com PEÇAS: funilaria, motor preparado, blindagem e fundo falso (o fundo falso faz a
// blitz da rota do bicho e a abordagem do armeiro passarem batido). Cada peça comprada sobe a suspeita; desmanches próprios
// produzem 2 peças por dia.
// Skills: MECÂNICA (ligação direta e arrombamento mais rápidos, adulteração mais curta) e DIREÇÃO (aderência e giro dos carros
// que o jogador dirige: Vehicle.playerGrip/playerTurn).
// ============================================================================

class ChopCareer extends Career {
    constructor(mgr) {
        super(mgr, {
            id: 'chop', name: 'DESMANCHE', icon: '🔧', color: '#ff9a3a',
            desc: 'Carros roubados viram peças, placas frias e frota para o crime. Dirija bem: cada batida é dinheiro perdido.',
            ranks: [
                { name: 'Puxador', xp: 0, desc: 'Furta carros populares estacionados e leva ao desmanche.' },
                { name: 'Dublê / Adulterador', xp: 1500, desc: 'Carros de luxo sob encomenda, com rastreador; clona placas e chassis.' },
                { name: 'Mestre Mecânico', xp: 6000, desc: 'Gerencia desmanches e prepara a frota do tráfico.' },
            ],
            skills: {
                mecanica: { name: 'Mecânica', desc: 'Ligação direta −0,45 s e arrombamento 7% mais fácil por nível; adulteração mais curta' },
                direcao: { name: 'Direção', desc: '+9% de aderência e +5% de giro nos carros que você dirige (drift sob controle)' },
            },
        });
        this.data = { shops: 0, suspicion: 0, parts: 0 };
    }

    // Oficina: o que dá para fazer no carro em que você está (dentro do desmanche). [id, nome, patente, peças, efeito]
    static get MODS() {
        return {
            engine: { name: 'Motor preparado', rank: 1, parts: 2, desc: '+25% de potência e +4 m/s de velocidade máxima' },
            armor: { name: 'Blindagem', rank: 2, parts: 4, desc: '+60% de resistência (aguenta tiro e batida)' },
            hidden: { name: 'Fundo falso', rank: 2, parts: 3, desc: 'esconde carga: blitz e abordagens passam batido' },
        };
    }

    // Jogador dirigindo dentro do desmanche (parado ou devagar)?
    inShop() { const g = this.g, car = g.activeCar, y = this.yard; return g.mode === 'car' && car && !car.isBoat && hypot(car.position.x - y.x, car.position.z - y.z) < 10; }
    scrapValue(car) { return Math.round(ChopCareer.value(car.spec) * 0.3 * Math.pow(Math.max(0, car.hpFrac), 1.5) / 10) * 10; }

    // Prompt no carro (tecla E): desmanchar o carro roubado.
    carPrompt() {
        if (!this.inShop()) return '';
        const car = this.g.activeCar, job = this.mgr.job;
        if (job && job.car === car) return '';
        return `<b>E</b> desmanchar este carro (${brl(this.scrapValue(car))})<small><b>O</b> oficina: funilaria, motor, blindagem, fundo falso</small>`;
    }
    carInteract() {
        if (!this.carPrompt()) return false;
        const g = this.g, car = g.activeCar, v = this.scrapValue(car);
        g._leaveVehicle();
        g._delayed.push({ t: 2.0, fn: () => { if (g.activeCar !== car && g.traffic && !car.destroyed) g.traffic._relocate(car, 'parked'); } });
        g.inventory.addCash(v);
        this.addXp(25 + v / 40);
        this.data.parts += 1;
        if (g.achievements) g.achievements.bump('scrapped');
        g._flash(`🔧 ${car.spec.model} desmanchado: +${brl(v)} e 1 peça aproveitada`);
        AudioFX.blip(640, 0.15, 0.18);
        return true;
    }

    _suspect(n) {
        const d = this.data, g = this.g;
        d.suspicion = Math.min(100, d.suspicion + n * (Careers.immunity ? 0.3 : 1) * (1 - (SkillTree.m.taxHeat || 0)));
        if (d.suspicion < 100) return '';
        d.suspicion = 40;
        const fine = Math.round(Math.max(g.inventory.clean, g.inventory.cash) * 0.25);
        if (g.inventory.clean >= fine) g.inventory.clean -= fine; else g.inventory.cash = Math.max(0, g.inventory.cash - fine);
        if (d.shops > 0) d.shops--;
        return ` · 🚨 A Receita e a Polícia Civil bateram: multa de ${brl(fine)}`;
    }

    // Valor de mercado (R$) do modelo: cresce com a potência (popular ≈ 700–1.000, superesportivo ≈ 5.000+).
    static value(spec) { return Math.round(Math.pow(spec.power, 1.5) / 10000) * 10; }
    static luxury(spec) { return ChopCareer.value(spec) >= 2000; }

    get yard() { return this.mgr.favelaSpot(7701, 0.1, 0.3); }          // desmanche / oficina com bloqueador (fixo)

    // O desmanche no mundo: ponto no mapa/legenda (🔧), anel laranja no chão e placa — senão ninguém sabe onde levar o carro.
    update(dt) {
        if (this._yardOn || !this.g.physicsReady) return;
        const y = this.yard; if (!y) return;
        this._yardOn = true;
        CityGrid.addPoi({ type: 'chop', name: 'Desmanche da favela', x: y.x, z: y.z });
        const glow = this._glow = new GlowBatch(this.g.scene, 2, 'chopGlow', 'glow');
        const a = glow.alloc(), b = glow.alloc();
        glow.place(a, y.x, 0.2, y.z, 9); glow.color(a, 1, 0.5, 0.12, 1);         // área de entrega (≈ raio do "dentro do desmanche")
        glow.place(b, y.x, 0.25, y.z, 3.4); glow.color(b, 1, 0.75, 0.3, 1);
        glow.flush();
    }

    // A pé perto do desmanche: o que fazer aqui.
    prompt() {
        const g = this.g, y = this.yard;
        if (!y || g.mode !== 'player') return '';
        const p = g.player.position;
        if (hypot(p.x - y.x, p.z - y.z) > 9) return '';
        return '<b>🔧 DESMANCHE</b><small>chegue aqui DIRIGINDO um carro roubado: E desmancha (vende as peças), O abre a oficina</small>';
    }

    // Entrou num carro roubado fora de um trabalho: diz onde levar (e marca no mapa se não houver outro destino).
    onStolen(car) {
        const g = this.g;
        if (!car || car.isBoat || car.isBike || car._chopHint || car._careerTarget) return;
        car._chopHint = true;
        const y = this.yard; if (!y) return;
        if (!g.gps) { this.mgr.gpsTo(y.x, y.z, 'Desmanche'); g.gps._chopHint = true; }
        g._flash(`🔧 Leve ao Desmanche da favela para vender as peças (~${brl(this.scrapValue(car))})${g.gps && g.gps._chopHint ? ' — marcado no mapa' : ''}`);
    }

    jobs() {
        return [
            { id: 'pull', rank: 0, name: 'Puxada', pay: 'R$ 250–550', make: () => new ChopJob(this, 'pull'),
                desc: 'Furte um carro POPULAR estacionado (marcado) e leve ao desmanche da favela. Carro trancado pede ligação direta: você fica exposto alguns segundos. Cada amassado derruba o pagamento.' },
            { id: 'order', rank: 1, name: 'Encomenda de luxo', pay: 'R$ 1.500–3.500', make: () => new ChopJob(this, 'order'),
                desc: 'Carro de LUXO com rastreador. Chegue à oficina com bloqueador antes do tempo acabar, senão a polícia vai direto na coordenada do carro. Lá, fique parado para clonar a placa e adulterar o chassi.' },
            { id: 'fleet', rank: 2, name: 'Frota do tráfico', pay: 'R$ 2.500 + moral', make: () => new ChopJob(this, 'fleet'),
                desc: 'Leve uma SUV ou picape à oficina: blindagem, fundo falso e motor preparado para o tráfico.' },
        ];
    }

    panel() {
        const d = this.data, sus = Math.round(d.suspicion), car = this.g.activeCar, shop = this.inShop();
        let html = `<div class="cr-row"><span>Peças no estoque</span><b>${d.parts}</b></div>
            <div class="cr-bar"><span>SUSPEITA DA RECEITA</span><i><s style="width:${sus}%;background:${sus > 70 ? '#ff3a2a' : '#ff9a3a'}"></s></i></div>
            <div class="cr-btns"><button data-act="parts">Comprar 1 peça (${brl(450)} sujo, +5% suspeita)</button></div>
            <h3 style="font-size:13px;margin-top:6px">OFICINA ${shop ? `— ${car.spec.model}` : ''}</h3>`;
        if (!shop) html += '<p class="cr-dim">Entre no desmanche DIRIGINDO o carro que quer preparar (ou desmanchar com E) e abra este menu com O.</p>';
        else {
            const m = car.mods || {}, rep = Math.round(ChopCareer.value(car.spec) * 0.15 * (1 - car.hpFrac) / 10) * 10;
            html += `<div class="cr-btns"><button data-act="repair" ${car.hpFrac < 0.99 ? '' : 'disabled'}>Funilaria: lataria nova (${brl(rep)})</button>`;
            for (const [k, M] of Object.entries(ChopCareer.MODS)) {
                const lock = this.rank < M.rank;
                html += `<button data-act="mod" data-arg="${k}" ${m[k] || lock || d.parts < M.parts ? 'disabled' : ''}>${m[k] ? '✔ ' : ''}${M.name} — ${M.parts} peças · ${M.desc}${lock ? ` (${this.ranks[M.rank].name})` : ''}</button>`;
            }
            html += '</div>';
        }
        if (this.rank < 2) return html + `<p class="cr-dim">Na patente MESTRE MECÂNICO você abre desmanches próprios: renda diária e peças, mas a Receita fica de olho.</p>`;
        return html + `<h3 style="font-size:13px;margin-top:6px">DESMANCHES PRÓPRIOS</h3><div class="cr-row"><span>Desmanches seus</span><b>${d.shops}/3</b></div>
            <div class="cr-row"><span>Renda por dia</span><b>${brl(d.shops * 1800)} sujo + ${d.shops * 2} peças</b></div>
            <div class="cr-btns"><button data-act="buyShop" ${d.shops >= 3 ? 'disabled' : ''}>Abrir desmanche (${brl(25000)} sujo)</button>
            <button data-act="books" ${sus <= 0 ? 'disabled' : ''}>Maquiar a contabilidade (${brl(4000)} limpo, −35%)</button></div>`;
    }

    action(name, arg) {
        const inv = this.g.inventory, d = this.data, car = this.g.activeCar;
        if (name === 'parts') {
            if (inv.cash < 450) return `Faltam ${brl(450 - inv.cash)}`;
            inv.cash -= 450; d.parts++;
            return `Peça comprada (${d.parts} no estoque)` + this._suspect(5);
        }
        if (name === 'repair') {
            if (!this.inShop()) return 'Leve o carro até o desmanche';
            const cost = Math.round(ChopCareer.value(car.spec) * 0.15 * (1 - car.hpFrac) / 10) * 10 + (car.flatCount || 0) * 80;      // (+ R$ 80 por pneu furado)
            if (inv.cash < cost) return `Faltam ${brl(cost - inv.cash)}`;
            inv.cash -= cost; car.hp = car.maxHp; car.dent = 0; car.engineDead = false; car.burning = 0; car.flat = null;      // (pneus novos também)
            return 'Funilaria feita: lataria nova';
        }
        if (name === 'mod') {
            const M = ChopCareer.MODS[arg];
            if (!M || !this.inShop()) return 'Leve o carro até o desmanche';
            if (this.rank < M.rank) return `Precisa da patente ${this.ranks[M.rank].name}`;
            const m = car.mods || (car.mods = {});
            if (m[arg]) return 'Esse carro já tem isso';
            if (d.parts < M.parts) return `Faltam ${M.parts - d.parts} peça(s)`;
            d.parts -= M.parts; m[arg] = 1;
            if (arg === 'engine') car.spec = Object.assign({}, car.spec, { power: car.spec.power * 1.25, t100: car.spec.t100 ? car.spec.t100 / 1.25 : undefined, maxSpeed: car.spec.maxSpeed + 4 });
            if (arg === 'armor') { const f = car.hpFrac; car.maxHp = Math.round(car.maxHp * 1.6); car.hp = car.maxHp * f; }
            this.addXp(40 + M.parts * 10);
            if (m.engine && m.armor && m.hidden && this.g.achievements) this.g.achievements.bump('fullmod');
            return `${M.name} instalado no ${car.spec.model}`;
        }
        if (name === 'buyShop') {
            if (this.rank < 2) return 'Só para Mestre Mecânico';
            if (d.shops >= 3) return 'Você já tem 3 desmanches';
            if (inv.cash < 25000) return `Faltam ${brl(25000 - inv.cash)} de dinheiro sujo`;
            inv.cash -= 25000; d.shops++; d.suspicion = Math.min(100, d.suspicion + 15);
            return `Desmanche aberto (${d.shops}/3): rende peças todo dia — de olho na suspeita`;
        }
        if (name === 'books') {
            if (inv.clean < 4000) return 'Precisa de R$ 4.000 de dinheiro LIMPO (lave nas fachadas)';
            inv.clean -= 4000; d.suspicion = Math.max(0, d.suspicion - 35);
            return 'Notas frias e contador comprado: suspeita −35%';
        }
        return null;
    }

    onNewDay() {
        const d = this.data;
        if (!d.shops) return;
        const g = this.g, income = Math.round(d.shops * 1800 * (1 + (SkillTree.m.income || 0)));
        g.inventory.addCash(income);
        d.parts += d.shops * 2;
        const raid = this._suspect(d.shops * 9);
        g._flash(`🔧 Seus desmanches renderam ${brl(income)} e ${d.shops * 2} peças (suspeita ${Math.round(d.suspicion)}%)${raid}${raid ? ` — sobraram ${d.shops} desmanche(s)` : ''}`);
    }
}

class ChopJob extends CareerJob {
    constructor(c, kind) {
        const T = { pull: ['PUXADA', 'Furte o carro marcado e leve ao desmanche', 480], order: ['ENCOMENDA DE LUXO', 'Roube o carro de luxo — ele tem rastreador', 0], fleet: ['FROTA DO TRÁFICO', 'Traga uma SUV/picape para preparar', 600] }[kind];
        super(c, { title: T[0], text: T[1], limit: T[2] });
        this.kind = kind;
        this.car = null;
        this.track = 0; this.tracked = false; this._alertT = 0;
        this.prog = 0;
    }

    _wanted(car) {
        const s = car.spec, v = ChopCareer.value(s);
        if (this.kind === 'pull') return v <= 1300;
        if (this.kind === 'order') return ChopCareer.luxury(s);
        return s.cls === 'suv' || s.cls === 'pickup';
    }

    start() {
        const g = this.g;
        if (!g.physicsReady) { this.why = 'O trânsito ainda está carregando'; return false; }
        const p = g._playerState().pos;
        const cand = g.vehicleManager.vehicles.filter((v) => !v.isBike && !v.isBoat && !v.controlled && !v.destroyed && !v.wrecked && v.mode === 'parked' && this._wanted(v))
            .map((v) => ({ v, d: hypot(v.position.x - p.x, v.position.z - p.z) })).filter((o) => o.d > 25 && o.d < 280).sort((a, b) => a.d - b.d);
        if (!cand.length) { this.why = this.kind === 'order' ? 'Nenhum carro de luxo estacionado por perto — tente nos bairros nobres ou na orla' : 'Nenhum carro desse tipo estacionado por perto — ande um pouco e tente de novo'; return false; }
        this.car = cand[Math.min(cand.length - 1, Math.floor(Math.random() * Math.min(3, cand.length)))].v;
        this.car._careerTarget = true;
        this.text = `Roube: ${this.car.spec.name} ${this.car.spec.model} (vale ~${brl(ChopCareer.value(this.car.spec))})`;
        this.target(this.car.position.x, this.car.position.z, 'Carro encomendado');
        return true;
    }

    onCarEntered(car) {
        if (car !== this.car || this.stage !== 0) return;
        this.stage = 1;
        const y = this.c.yard;
        this.text = this.kind === 'pull' ? 'Leve ao desmanche sem amassar' : 'Leve à oficina com bloqueador de sinal';
        this.target(y.x, y.z, 'Desmanche');
        if (this.kind === 'order') {
            const d = hypot(y.x - car.position.x, y.z - car.position.z);
            this.track = Math.round(40 + d / 9);
            this.g._flash(`📡 RASTREADOR ATIVO: ${this.track}s até a seguradora passar a localização à polícia`);
        }
    }

    status() {
        if (this.stage === 0) return 'ACHE O CARRO';
        if (this.stage === 2) return `ADULTERANDO ${crBar(this.prog)}`;
        const hp = Math.round((this.car ? this.car.hpFrac : 0) * 100);
        if (this.kind === 'order') return this.tracked ? `RASTREADO! · LATARIA ${hp}%` : `RASTREADOR ${Math.ceil(this.track)}s · LATARIA ${hp}%`;
        return `LATARIA ${hp}%`;
    }

    hud() { const h = super.hud(); if (this.kind === 'order' && this.stage === 1 && (this.tracked || this.track < 20)) h.low = true; return h; }

    update(dt, pos) {
        const car = this.car, g = this.g;
        if (!car || car.destroyed || car.wrecked || car.burning > 0) { this.fail('o carro foi destruído'); return; }
        if (this.stage === 0) {
            this.mgr.mark(car.position.x, car.position.z, this.c.color);
            this.tx = car.position.x; this.tz = car.position.z;
            if (g.gps && g.gps._career && hypot(g.gps.x - car.position.x, g.gps.z - car.position.z) > 6) { g.gps.x = car.position.x; g.gps.z = car.position.z; }
            return;
        }
        const y = this.c.yard, inYard = hypot(car.position.x - y.x, car.position.z - y.z) < 8;
        if (g.activeCar !== car && this.stage === 1) {
            if (hypot(car.position.x - pos.x, car.position.z - pos.z) > 140) { this.fail('você largou o carro'); return; }
        }
        if (this.kind === 'order' && !this.tracked && this.stage === 1) {
            this.track -= dt;
            if (this.track <= 0) {
                this.tracked = true;
                g.wanted.addStars(2, 'rastreador');
                g._flash('🚨 RASTREADO! A polícia recebeu a coordenada do carro — corra para o bloqueador');
            }
        }
        if (this.tracked && this.stage === 1) {
            this._alertT -= dt;
            if (this._alertT <= 0) { this._alertT = 4; if (g.policeManager) g.policeManager.alertNear(car.position, 420); }
        }
        if (this.stage === 1 && inYard && car.speed < 2.5 && g.activeCar === car) {
            if (this.kind === 'pull') { this._deliver(); return; }
            this.stage = 2; this.prog = 0;
            this.text = 'Fique parado: clonando a placa e adulterando o chassi';
            if (this.tracked) g._flash('Bloqueador ligado: o sinal do rastreador sumiu');
            this.tracked = false;
        }
        if (this.stage === 2) {
            const dur = Math.max(4, 12 - 1.2 * this.c.skill('mecanica'));
            if (inYard && car.speed < 2) this.prog += dt / dur;
            else if (!inYard) { this.stage = 1; this.text = 'Volte à oficina e fique parado'; }
            if (this.prog >= 1) this._deliver();
        }
    }

    _deliver() {
        const car = this.car, g = this.g, hp = Math.max(0, Math.min(1, car.hpFrac)), v = ChopCareer.value(car.spec);
        let pay, xp;
        if (this.kind === 'pull') { pay = v * 0.5 * Math.pow(hp, 1.6); xp = 60 + 40 * hp; }
        else if (this.kind === 'order') { pay = v * 0.6 * (0.35 + 0.65 * Math.pow(hp, 1.3)); xp = 150 + 80 * hp; }
        else { pay = 2500 * (0.5 + 0.5 * hp); xp = 220; Standing.add('traffic', 5); }
        pay = Math.round(pay / 10) * 10;
        if (g.activeCar === car) g._leaveVehicle();
        car._careerTarget = false;
        g._delayed.push({ t: 2.0, fn: () => { if (g.activeCar !== car && g.traffic && !car.destroyed) g.traffic._relocate(car, 'parked'); } });         // o carro "some" no desmanche
        this.succeed(pay, xp, `${car.spec.model} entregue (lataria ${Math.round(hp * 100)}%)`);
    }

    dispose() { if (this.car) this.car._careerTarget = false; }
}
memoStatics(ChopCareer, 'MODS');
