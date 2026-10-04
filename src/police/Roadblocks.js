// ============================================================================
// Roadblocks — bloqueios de rua do 5★ ("inimigo do estado").
//
// Um bloqueio fecha UMA PERNA de um cruzamento: duas viaturas paradas de lado, com o giroflex ligado,
// cobrem a pista (corpos físicos ESTÁTICOS: nem o seu carro nem o trânsito passam) e dois combatentes
// (um da SWAT e um do exército) montam guarda atrás delas. A perna entra em RoadNet.closed, então
// nenhum carro — civil ou policial — planeja uma rota por ali.
//
// Os bloqueios formam um anel em volta de você (a ~70–125u) e acompanham sua fuga: os que ficam para
// trás são desmontados e novos surgem à frente (sempre fora da tela, para não "aparecerem do nada").
// ============================================================================

class Roadblocks {
    constructor(manager) {
        this.m = manager;
        this.list = [];            // { inter, di, x, z, cars:[PoliceCar], guards:[PoliceOfficer] }
        this._at = 0;              // não monta nada antes deste instante
        this._check = 0;
    }

    get active() { return this.list.length; }

    // Distância do bloqueio ao ponto.
    _dist(b, x, z) { return hypot(b.x - x, b.z - z); }

    // Posição do bloqueio de uma perna: 15u do centro do cruzamento, rumo à saída.
    _spot(inter, d) { return { x: inter.x + d.dx * 15, z: inter.z + d.dz * 15 }; }

    // Pernas candidatas ao anel em volta de `pos`: rua do outro lado existe, ainda não fechada, longe da tela,
    // sem carro em cima, a 70–125u do jogador e a ≥ 40u dos outros bloqueios.
    _pick(pos, vel, n) {
        const m = this.m, f = m.game.camera.target;
        const cands = [];
        const speed = hypot(vel.x, vel.z);
        for (const inter of CityGrid.intersections) {
            for (let di = 0; di < 4; di++) {
                const d = RoadNet.DIRS[di];
                const nb = inter.nbr[di];
                if (!nb || inter.edge[di].len < 30 || RoadNet.isClosed(inter, d)) continue;
                const s = this._spot(inter, d);
                const dist = hypot(s.x - pos.x, s.z - pos.z);
                if (dist < 70 || dist > 125) continue;
                if (hypot(s.x - f.x, s.z - f.z) < 60) continue;                // fora da tela
                if (this.list.some((b) => this._dist(b, s.x, s.z) < 40)) continue;
                if (!m.traffic._clear(s.x, s.z, 7)) continue;
                // Prefere o que está à frente da fuga e perto de 100u.
                const ahead = speed > 1 ? ((s.x - pos.x) * vel.x + (s.z - pos.z) * vel.z) / (dist * speed) : 0;
                cands.push({ inter, di, d, s, score: Math.abs(dist - 100) - ahead * 25 });
            }
        }
        cands.sort((a, b) => a.score - b.score);
        const out = [];
        for (const c of cands) {
            if (out.length >= n) break;
            if (out.some((o) => hypot(o.s.x - c.s.x, o.s.z - c.s.z) < 40)) continue;
            out.push(c);
        }
        return out;
    }

    _build(c) {
        const m = this.m, { inter, d, s } = c;
        const n = { x: d.dz, z: -d.dx };                                            // lateral à perna
        const heading = Math.atan2(n.x, n.z);                                        // viatura de lado (eixo longo na lateral)
        const b = { inter, di: c.di, x: s.x, z: s.z, cars: [], guards: [] };
        for (const side of [-1, 1]) {
            const car = m.makeBlockCar(s.x + n.x * side * 2.4, s.z + n.z * side * 2.4, heading);
            b.cars.push(car);
            // Guarda atrás da viatura (lado do cruzamento): um da SWAT e um soldado.
            const gx = s.x - d.dx * 3.6 + n.x * side * 2.4, gz = s.z - d.dz * 3.6 + n.z * side * 2.4;
            const kind = side < 0 ? 'swat' : 'army';
            const g = m.makeGuard(gx, gz, kind);
            if (g) b.guards.push(g);
        }
        RoadNet.setClosed(inter, d, true);
        this.list.push(b);
    }

    // Desmonta um bloqueio: reabre a rua e remove viaturas e guardas.
    _dismantle(b) {
        const m = this.m;
        const i0 = this.list.indexOf(b);
        if (i0 >= 0) this.list.splice(i0, 1);            // (primeiro sai da lista: _removeCar chama forgetCar)
        RoadNet.setClosed(b.inter, RoadNet.DIRS[b.di], false);
        for (const c of b.cars) m._removeCar(c);
        for (const g of b.guards) {
            const i = m.officers.indexOf(g);
            if (i >= 0) { g.dispose(); m.officers.splice(i, 1); }
        }
    }

    dismantleAll() { while (this.list.length) this._dismantle(this.list[0]); }

    // Alguma das viaturas deste bloqueio já saiu do jogo (limpeza do gerenciador)? Então reabre a rua.
    forgetCar(car) {
        for (const b of this.list.slice()) {
            if (!b.cars.includes(car)) continue;
            b.cars = b.cars.filter((c) => c !== car);
            if (!b.cars.length) this._dismantle(b);
        }
    }

    // L: configuração do nível (L.blocks = quantos bloqueios) | pos/vel: do jogador.
    update(L, pos, vel) {
        const m = this.m;
        if (!L || !L.blocks) {
            // Sem ★ nesse nível: mantém até a poeira baixar (o gerenciador remove) — só reabre ao remover.
            return;
        }
        if (m.time < this._at || m.time < this._check) return;
        this._check = m.time + 2.5;

        // Solta os que ficaram para trás (longe demais).
        for (const b of this.list.slice()) if (this._dist(b, pos.x, pos.z) > 190) this._dismantle(b);

        // Completa o anel (um por vez, para não pesar o quadro).
        if (this.list.length < L.blocks) {
            const [c] = this._pick(pos, vel, 1);
            if (c) this._build(c);
        }
    }

    // Instante em que o 5★ foi atingido: os primeiros bloqueios demoram um pouco a ser montados.
    arm(time) { this._at = time + 4; }
}
