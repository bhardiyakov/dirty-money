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
//
// TAPETE DE PREGOS (Config.police.spikes): antes de cada bloqueio, do lado de fora, uma faixa de pregos atravessa a rua. Quem tenta
// passar por ali (pela calçada ou de raspão) pisa nela: os pneus que encostaram furam (tick, todo quadro; blindado não fura).
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
    // (perna em qualquer ângulo: ao longo do trecho; rotatória: fora do disco)
    _spot(inter, a) { const s = inter.round ? a.cut + 10 : Math.max(15, a.cut + 9), p = RoadNet.armPoint(inter, a, Math.min(s, a.e.len / 2)); return { x: p.x, z: p.z, dx: p.dx, dz: p.dz }; }

    // Pernas candidatas ao anel em volta de `pos`: rua do outro lado existe, ainda não fechada, longe da tela,
    // sem carro em cima, a 70–125u do jogador e a ≥ 40u dos outros bloqueios.
    _pick(pos, vel, n) {
        const m = this.m, f = m.game.camera.target;
        const cands = [];
        const speed = hypot(vel.x, vel.z);
        for (const inter of CityGrid.intersections) {
            for (const a of inter.arms) {
                if (a.e.len < 30 || RoadNet.isClosed(inter, a)) continue;
                const d = { dx: a.dx, dz: a.dz }, di = a.idx;
                const s = this._spot(inter, a);
                const dist = hypot(s.x - pos.x, s.z - pos.z);
                if (dist < 70 || dist > 125) continue;
                if (hypot(s.x - f.x, s.z - f.z) < 60) continue;                // fora da tela
                if (this.list.some((b) => this._dist(b, s.x, s.z) < 40)) continue;
                if (!m.traffic._clear(s.x, s.z, 7)) continue;
                // Prefere o que está à frente da fuga e perto de 100u.
                const ahead = speed > 1 ? ((s.x - pos.x) * vel.x + (s.z - pos.z) * vel.z) / (dist * speed) : 0;
                cands.push({ inter, di, d, a, s, score: Math.abs(dist - 100) - ahead * 25 });
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
        const m = this.m, { inter, s } = c, d = { dx: s.dx, dz: s.dz };              // (direção da perna ali, para fora do cruzamento)
        const n = { x: d.dz, z: -d.dx };                                            // lateral à perna
        const heading = Math.atan2(n.x, n.z);                                        // viatura de lado (eixo longo na lateral)
        const b = { inter, di: c.di, arm: c.a, x: s.x, z: s.z, cars: [], guards: [] };
        for (const side of [-1, 1]) {
            const car = m.makeBlockCar(s.x + n.x * side * 2.4, s.z + n.z * side * 2.4, heading);
            b.cars.push(car);
            // Guarda atrás da viatura (lado do cruzamento): um da SWAT e um soldado.
            const gx = s.x - d.dx * 3.6 + n.x * side * 2.4, gz = s.z - d.dz * 3.6 + n.z * side * 2.4;
            const kind = side < 0 ? 'swat' : 'army';
            const g = m.makeGuard(gx, gz, kind);
            if (g) b.guards.push(g);
        }
        RoadNet.setClosed(inter, c.a, true);
        const SP = Config.police.spikes;
        if (SP && (m.level || 0) >= SP.minLevel) b.spikes = this._spikes(s.x + d.dx * SP.ahead, s.z + d.dz * SP.ahead, d, n, SP);
        this.list.push(b);
    }

    // A faixa de pregos: retângulo no chão, comprido na lateral da rua (n), fino no sentido dela (d).
    _spikes(x, z, d, n, SP) {
        const scene = this.m.scene, y = (typeof WorldMap !== 'undefined' ? WorldMap.heightAt(x, z) * (Config.world.heightScale || 1) : 0) + 0.05;
        const mesh = BABYLON.MeshBuilder.CreateGround('spikes', { width: SP.depth, height: SP.len }, scene);
        mesh.position.set(x, y, z);
        mesh.rotation.y = Math.atan2(n.x, n.z);                       // (o comprimento do chão, o eixo Z local, ao longo de n)
        mesh.material = Roadblocks._spikeMat(scene);
        mesh.isPickable = false;
        return { x, z, dx: d.dx, dz: d.dz, nx: n.x, nz: n.z, hl: SP.len / 2, hd: SP.depth / 2 + 0.2, mesh, hits: 0 };
    }

    // Material do tapete (uma vez por cena): a borracha escura com as pontas de metal em fileira.
    static _spikeMat(scene) {
        if (scene._spikeMat) return scene._spikeMat;
        const tex = new BABYLON.DynamicTexture('spikesTex', { width: 32, height: 512 }, scene, true);
        const c = tex.getContext();
        c.fillStyle = '#1b1c1f'; c.fillRect(0, 0, 32, 512);
        c.fillStyle = '#d4a017'; c.fillRect(0, 0, 3, 512); c.fillRect(29, 0, 3, 512);      // (as bordas amarelas: dá para ver de longe)
        for (let yy = 4; yy < 512; yy += 16) {
            for (const xx of [9, 23]) {
                c.fillStyle = '#f1f4f9'; c.beginPath(); c.moveTo(xx - 5, yy + 12); c.lineTo(xx, yy); c.lineTo(xx + 5, yy + 12); c.closePath(); c.fill();
                c.fillStyle = '#7d838f'; c.beginPath(); c.moveTo(xx, yy); c.lineTo(xx + 5, yy + 12); c.lineTo(xx, yy + 12); c.closePath(); c.fill();
            }
        }
        tex.update();
        const m = new BABYLON.StandardMaterial('spikesMat', scene);
        m.diffuseTexture = tex; m.specularColor = new BABYLON.Color3(0.25, 0.25, 0.28); m.emissiveColor = new BABYLON.Color3(0.12, 0.12, 0.14);
        scene._spikeMat = m;
        return m;
    }

    // Todo quadro: o carro do jogador passou por cima de um tapete? Fura o pneu de cada roda que encostou nele.
    tick() {
        if (!this.list.length) return;
        const g = this.m.game, car = g.mode === 'car' ? g.activeCar : null;
        if (!car || !car.puncture || car.isBike || car.isBoat || Math.abs(car.speed) < 1.5) return;
        for (const b of this.list) {
            const S = b.spikes;
            if (!S || Math.abs(car.position.x - S.x) > S.hl + 4 || Math.abs(car.position.z - S.z) > S.hl + 4) continue;
            let n = 0;
            for (let i = 0; i < 4; i++) {
                const w = car.wheelWorld(i), ox = w.x - S.x, oz = w.z - S.z;
                if (Math.abs(ox * S.dx + oz * S.dz) > S.hd || Math.abs(ox * S.nx + oz * S.nz) > S.hl) continue;
                if (!car.puncture(i)) continue;
                n++;
                if (typeof SparkFx !== 'undefined') SparkFx.burst(g, w.x, w.z, car);
            }
            if (n) {
                S.hits += n; g.spiked = (g.spiked || 0) + n;
                AudioFX.thud(S.x, S.z);
                if (g.camera) g.camera.shake(0.25);
                if (g.input) g.input.rumble(0.8, 0.8, 260);
                const k = car.flatCount;
                g._flash(`💥 Tapete de pregos! ${k} pneu${k > 1 ? 's furados' : ' furado'} — o carro vai escorregar`);
            }
        }
    }

    // Desmonta um bloqueio: reabre a rua e remove viaturas e guardas.
    _dismantle(b) {
        const m = this.m;
        const i0 = this.list.indexOf(b);
        if (i0 >= 0) this.list.splice(i0, 1);            // (primeiro sai da lista: _removeCar chama forgetCar)
        RoadNet.setClosed(b.inter, b.arm, false);
        if (b.spikes) { b.spikes.mesh.dispose(); b.spikes = null; }
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
