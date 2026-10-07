// ============================================================================
// TrafficSignals — semáforos de todos os cruzamentos.
//
// Cada cruzamento tem um ciclo próprio (fase aleatória, para a cidade não piscar em
// uníssono): verde N-S -> amarelo N-S -> tudo vermelho -> verde L-O -> amarelo L-O ->
// tudo vermelho. As luzes são brilhos (GlowBatch) nos postes dos 4 cantos:
//   2 lentes de veículo por poste (eixo N-S e eixo L-O) + 2 lâmpadas de pedestre.
//
// API para a IA:
//   vehicle(inter, axis)  -> { color: 'green'|'yellow'|'red', left }   (axis = 'ns' | 'ew')
//   ped(crosswalk)        -> { state: 'walk'|'flash'|'wait', left }
// O pedestre atravessa a rua 'ns' enquanto o trânsito 'ew' está verde (e vice-versa).
// ============================================================================

class TrafficSignals {
    constructor(scene) {
        const S = Config.signals;
        this.G = S.green; this.Y = S.yellow; this.A = S.allRed;
        this.half = this.G + this.Y + this.A;          // duração de uma fase (um eixo)
        this.cycle = this.half * 2;
        this.time = 0;
        this._visTimer = 0;

        // Brilhos: por poste 2 lentes de veículo (y alto) + 2 lâmpadas de pedestre (y baixo).
        const inters = CityGrid.intersections.filter((n) => n.visible);      // (só os cruzamentos urbanos têm poste e luz)
        const xzs = [];
        for (const inter of inters) for (const p of inter.poles) for (let k = 0; k < 4; k++) xzs.push([p.x, p.z]);
        this.glow = new GlowGrid(scene, 'signalGlow', xzs);                   // por região: só os da vizinhança vão para a GPU
        this._slots = [];      // por cruzamento: [{ lensNS, lensEW, pedNS, pedEW } x4 postes]
        for (const inter of inters) {
            const poles = inter.poles.map((p) => {
                const s = {
                    lensNS: this.glow.alloc(p.x, p.z), lensEW: this.glow.alloc(p.x, p.z),
                    pedNS: this.glow.alloc(p.x, p.z), pedEW: this.glow.alloc(p.x, p.z),
                };
                // Lentes sobre o cabeçote (y≈5,3), voltadas para dentro do cruzamento.
                this.glow.place(s.lensNS, p.x, 5.35, p.z - p.sz * 0.55, 0.95);
                this.glow.place(s.lensEW, p.x - p.sx * 0.55, 5.35, p.z, 0.95);
                // Lâmpadas de pedestre mais baixas, ao lado do poste.
                this.glow.place(s.pedNS, p.x - p.sx * 0.5, 2.7, p.z + p.sz * 0.1, 0.6);
                this.glow.place(s.pedEW, p.x + p.sx * 0.1, 2.7, p.z - p.sz * 0.5, 0.6);
                return s;
            });
            this._slots.push(poles);
        }
        this._refreshVisuals(true);
        this.glow.seal();
    }

    // Posição (s) dentro do ciclo do cruzamento.
    _u(inter) {
        return (this.time + inter.offset) % this.cycle;
    }

    // Estado do trânsito de um eixo ('ns' | 'ew') no cruzamento.
    vehicle(inter, axis) {
        if (!inter.signal) return { color: 'green', left: 99 };          // curva ou via reta: não há conflito, ninguém para
        let u = this._u(inter);
        if (axis === 'ew') u = (u + this.half) % this.cycle;
        // Agora u mede o ciclo do ponto de vista do eixo pedido: 0..half = a vez dele.
        if (u < this.G) return { color: 'green', left: this.G - u };
        if (u < this.G + this.Y) return { color: 'yellow', left: this.G + this.Y - u };
        return { color: 'red', left: this.cycle - u };
    }

    // Sinal de pedestre da faixa: anda quando o trânsito PARALELO à travessia está verde.
    ped(cw) {
        const parallel = cw.crosses === 'ns' ? 'ew' : 'ns';
        const v = this.vehicle(cw.inter, parallel);
        if (v.color === 'green') {
            return v.left > Config.signals.pedFlash
                ? { state: 'walk', left: v.left - Config.signals.pedFlash }
                : { state: 'flash', left: v.left };
        }
        if (v.color === 'yellow') return { state: 'flash', left: v.left };
        return { state: 'wait', left: v.left };
    }

    update(dt) {
        this.time += dt;
        this._visTimer -= dt;
        if (this._visTimer <= 0) {
            this._visTimer = 0.2;
            this._refreshVisuals(false);
        }
    }

    static _lensColor(c) {
        if (c === 'green') return TrafficSignals.C_GREEN;
        if (c === 'yellow') return TrafficSignals.C_YELLOW;
        return TrafficSignals.C_RED;
    }

    _refreshVisuals() {
        const g = this.glow;
        const blink = Math.floor(performance.now() / 350) % 2 === 0;
        const inters = this._visible || (this._visible = CityGrid.intersections.filter((n) => n.visible));
        for (let k = 0; k < inters.length; k++) {
            const inter = inters[k];
            if (!Zones.near(inter.x, inter.z, 40)) continue;           // só os cruzamentos na tela (+ margem): o resto ninguém vê
            const ns = TrafficSignals._lensColor(this.vehicle(inter, 'ns').color);
            const ew = TrafficSignals._lensColor(this.vehicle(inter, 'ew').color);
            // Pedestre: N/S atravessam a rua 'ns' (cw.crosses === 'ns'); L/O a rua 'ew'.
            const cwNs = inter.crosswalks.find((q) => q.crosses === 'ns'), cwEw = inter.crosswalks.find((q) => q.crosses === 'ew');
            const pedNs = cwNs ? this.ped(cwNs).state : 'wait';
            const pedEw = cwEw ? this.ped(cwEw).state : 'wait';
            const pc = (s) => s === 'walk' ? TrafficSignals.C_WALK : (s === 'flash' ? (blink ? TrafficSignals.C_FLASH : TrafficSignals.C_OFF) : TrafficSignals.C_WAIT);
            const cNs = pc(pedNs), cEw = pc(pedEw);
            for (const s of this._slots[k]) {
                g.color(s.lensNS, ns[0], ns[1], ns[2], 0.95);
                g.color(s.lensEW, ew[0], ew[1], ew[2], 0.95);
                g.color(s.pedNS, cNs[0], cNs[1], cNs[2], cNs[0] + cNs[1] + cNs[2] > 0 ? 0.9 : 0);
                g.color(s.pedEW, cEw[0], cEw[1], cEw[2], cEw[0] + cEw[1] + cEw[2] > 0 ? 0.9 : 0);
            }
        }
        g.flush();
    }
}
TrafficSignals.C_GREEN = [0.1, 1.0, 0.35]; TrafficSignals.C_YELLOW = [1.0, 0.82, 0.1]; TrafficSignals.C_RED = [1.0, 0.14, 0.1];
TrafficSignals.C_WALK = [0.3, 1.0, 0.55]; TrafficSignals.C_FLASH = [1.0, 0.75, 0.15]; TrafficSignals.C_OFF = [0, 0, 0]; TrafficSignals.C_WAIT = [1.0, 0.15, 0.1];
