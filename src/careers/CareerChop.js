// ============================================================================
// Carreira: DESMANCHE — roubo e adulteração de veículos.
//   Puxador           PUXADA: furtar um carro popular estacionado e levar ao desmanche da favela. Amassado derruba o pagamento.
//   Dublê/Adulterador ENCOMENDA DE LUXO: carro com RASTREADOR — chegar à oficina com bloqueador antes do tempo; lá, parado,
//                     clonar a placa e adulterar o chassi (barra de progresso). Estourou o tempo: a polícia vai direto no carro.
//   Mestre Mecânico   FROTA DO TRÁFICO (SUV/picape preparada) e a gestão de DESMANCHES próprios: renda diária × SUSPEITA da
//                     Receita (comprar peças demais chama atenção; "maquiar a contabilidade" exige dinheiro limpo).
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
                { name: 'Dublê / Adulterador', xp: 600, desc: 'Carros de luxo sob encomenda, com rastreador; clona placas e chassis.' },
                { name: 'Mestre Mecânico', xp: 2500, desc: 'Gerencia desmanches e prepara a frota do tráfico.' },
            ],
            skills: {
                mecanica: { name: 'Mecânica', desc: 'Ligação direta −0,45 s e arrombamento 7% mais fácil por nível; adulteração mais curta' },
                direcao: { name: 'Direção', desc: '+9% de aderência e +5% de giro nos carros que você dirige (drift sob controle)' },
            },
        });
        this.data = { shops: 0, suspicion: 0 };
    }

    // Valor de mercado (R$) do modelo: cresce com a potência (popular ≈ 700–1.000, superesportivo ≈ 5.000+).
    static value(spec) { return Math.round(Math.pow(spec.power, 1.5) / 10000) * 10; }
    static luxury(spec) { return ChopCareer.value(spec) >= 2000; }

    get yard() { return this.mgr.favelaSpot(7701, 0.1, 0.3); }          // desmanche / oficina com bloqueador (fixo)

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
        if (this.rank < 2) return `<p class="cr-dim">Na patente MESTRE MECÂNICO você abre desmanches próprios: renda diária de peças, mas a Receita fica de olho.</p>`;
        const d = this.data, sus = Math.round(d.suspicion);
        return `<div class="cr-row"><span>Desmanches seus</span><b>${d.shops}/3</b></div>
            <div class="cr-row"><span>Renda por dia</span><b>${brl(d.shops * 1800)} sujo</b></div>
            <div class="cr-bar"><span>SUSPEITA DA RECEITA</span><i><s style="width:${sus}%;background:${sus > 70 ? '#ff3a2a' : '#ff9a3a'}"></s></i></div>
            <div class="cr-btns"><button data-act="buyShop" ${d.shops >= 3 ? 'disabled' : ''}>Abrir desmanche (${brl(25000)} sujo)</button>
            <button data-act="books" ${sus <= 0 ? 'disabled' : ''}>Maquiar a contabilidade (${brl(4000)} limpo, −35%)</button></div>`;
    }

    action(name) {
        const inv = this.g.inventory, d = this.data;
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
        const g = this.g, income = d.shops * 1800;
        g.inventory.addCash(income);
        d.suspicion = Math.min(100, d.suspicion + d.shops * 9 * (Careers.immunity ? 0.3 : 1));
        if (d.suspicion >= 100) {
            d.shops--; d.suspicion = 40;
            const fine = Math.round(g.inventory.clean * 0.25);
            g.inventory.clean -= fine;
            g._flash(`🚨 Receita e Polícia Civil fecharam um desmanche seu! Multa de ${brl(fine)} (restam ${d.shops})`);
        } else g._flash(`🔧 Seus desmanches renderam ${brl(income)} (suspeita ${Math.round(d.suspicion)}%)`);
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
        return /^(suv|pickup)/.test(car.spec.id) || s.cls === 'suv' || s.cls === 'pickup';
    }

    start() {
        const g = this.g;
        if (!g.physicsReady) { this.why = 'O trânsito ainda está carregando'; return false; }
        const p = g._playerState().pos;
        const cand = g.vehicleManager.vehicles.filter((v) => !v.isBike && !v.isBoat && !v.controlled && !v.destroyed && !v.wrecked && v.mode === 'parked' && this._wanted(v))
            .map((v) => ({ v, d: Math.hypot(v.position.x - p.x, v.position.z - p.z) })).filter((o) => o.d > 25 && o.d < 280).sort((a, b) => a.d - b.d);
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
            const d = Math.hypot(y.x - car.position.x, y.z - car.position.z);
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
            if (g.gps && g.gps._career && Math.hypot(g.gps.x - car.position.x, g.gps.z - car.position.z) > 6) { g.gps.x = car.position.x; g.gps.z = car.position.z; }
            return;
        }
        const y = this.c.yard, inYard = Math.hypot(car.position.x - y.x, car.position.z - y.z) < 8;
        if (g.activeCar !== car && this.stage === 1) {
            if (Math.hypot(car.position.x - pos.x, car.position.z - pos.z) > 140) { this.fail('você largou o carro'); return; }
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
