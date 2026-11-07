// ============================================================================
// TrafficSignals — semáforos de todos os cruzamentos.
//
// Cada cruzamento tem um ciclo próprio (fase aleatória, para a cidade não piscar em
// uníssono): verde N-S -> amarelo N-S -> tudo vermelho -> verde L-O -> amarelo L-O ->
// tudo vermelho. Com diagonais (RoadPlan: nó com perna livre), cada par de pernas opostas
// é uma fase e o ciclo tem 3 (ou mais) delas. As luzes são brilhos (GlowBatch) nos postes:
//   grade: 4 cantos, 2 lentes de veículo por poste (eixo N-S e eixo L-O) + 2 lâmpadas de pedestre;
//   nó com diagonal: 1 poste por perna (lente da fase dela + lâmpada da faixa dela).
//
// API para a IA:
//   vehicle(inter, phase) -> { color: 'green'|'yellow'|'red', left }   (phase = 0, 1, 2... ou 'ns' | 'ew')
//   ped(crosswalk)        -> { state: 'walk'|'flash'|'wait', left }
// O pedestre atravessa a rua 'ns' enquanto o trânsito 'ew' está verde (e vice-versa); na faixa de uma perna
// com diagonal, enquanto a fase daquela perna está no vermelho.
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
        for (const inter of inters) for (const p of inter.poles) for (let k = 0; k < (inter.gen ? 2 : 4); k++) xzs.push([p.x, p.z]);
        this.glow = new GlowGrid(scene, 'signalGlow', xzs);                   // por região: só os da vizinhança vão para a GPU
        this._slots = [];      // por cruzamento: [{ lensNS, lensEW, pedNS, pedEW } x4 postes] | nó com diagonal: [{ lens, ped, phase, cw }]
        // (as posições das lentes saem do desenho do poste — StreetFurniture.heads: a caixa no fim do braço projetado e as de pedestre)
        const SF = StreetFurniture;
        // (relevo: o poste é RÍGIDO, na altura do pé dele — WorldBuilder._signalPoles; o brilho soma a altura do chão sob a lente: dy corrige)
        const R = typeof Relief !== 'undefined' && Relief.on, fix = (p, list) => { for (const h of list) h.dy = R ? Relief.at(p.x, p.z) - Relief.at(h.x + (h.fx || 0) * 0.11, h.z + (h.fz || 0) * 0.11) : 0; return list; };
        for (const inter of inters) {
            if (inter.gen) {
                this._slots.push(inter.poles.map((p) => {
                    const [v, pd] = fix(p, SF.heads(p, true)), s = { lens: this.glow.alloc(p.x, p.z), ped: this.glow.alloc(p.x, p.z), phase: p.phase, cw: p.cw, hv: v, c: null };
                    this._face(s.lens, v, SF.LENS_Y.red, TrafficSignals.LENS);
                    this._face(s.ped, { x: pd.x + pd.fx * 0.11, z: pd.z + pd.fz * 0.11, fx: pd.fx, fz: pd.fz, dy: pd.dy }, 2.5, TrafficSignals.PED);
                    return s;
                }));
                continue;
            }
            const poles = inter.poles.map((p) => {
                const H = fix(p, SF.heads(p, false)), at = (k) => H.find((h) => h.key === k);
                const s = {
                    lensNS: this.glow.alloc(p.x, p.z), lensEW: this.glow.alloc(p.x, p.z),
                    pedNS: this.glow.alloc(p.x, p.z), pedEW: this.glow.alloc(p.x, p.z),
                    hNS: at('NS'), hEW: at('EW'), cNS: null, cEW: null,
                };
                // Lentes na frente da caixa pendurada no braço (a altura muda com a cor: _lens); pedestre nas caixinhas do poste.
                this._face(s.lensNS, s.hNS, SF.LENS_Y.red, TrafficSignals.LENS);
                this._face(s.lensEW, s.hEW, SF.LENS_Y.red, TrafficSignals.LENS);
                const pn = at('pNS'), pe = at('pEW');
                this._face(s.pedNS, { x: pn.x + pn.fx * 0.11, z: pn.z + pn.fz * 0.11, fx: pn.fx, fz: pn.fz, dy: pn.dy }, 2.5, TrafficSignals.PED);
                this._face(s.pedEW, { x: pe.x + pe.fx * 0.11, z: pe.z + pe.fz * 0.11, fx: pe.fx, fz: pe.fz, dy: pe.dy }, 2.25, TrafficSignals.PED);
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

    // Estado do trânsito de uma fase (0, 1, 2... | 'ns' = 0, 'ew' = 1) no cruzamento. Ciclo = fases × (verde + amarelo + tudo vermelho).
    vehicle(inter, phase) {
        if (!inter.signal) return { color: 'green', left: 99 };          // curva ou via reta: não há conflito, ninguém para
        const ph = phase === 'ns' ? 0 : (phase === 'ew' ? 1 : (phase || 0)), cycle = this.half * (inter.phases || 2);
        let u = (this.time + inter.offset) % cycle;
        u = (u - ph * this.half + cycle) % cycle;
        // Agora u mede o ciclo do ponto de vista da fase pedida: 0..half = a vez dela.
        if (u < this.G) return { color: 'green', left: this.G - u };
        if (u < this.G + this.Y) return { color: 'yellow', left: this.G + this.Y - u };
        return { color: 'red', left: cycle - u };
    }

    // Sinal de pedestre da faixa: anda quando o trânsito PARALELO à travessia está verde (faixa de perna com diagonal: quando a fase
    // da perna atravessada está no vermelho, menos o tempo de piscar).
    ped(cw) {
        if (cw.phase !== undefined) {
            const v = this.vehicle(cw.inter, cw.phase), F = Config.signals.pedFlash, A = this.A;
            if (v.color !== 'red') return { state: 'wait', left: v.left };
            if (v.left > F + A) return { state: 'walk', left: v.left - F - A };
            return v.left > A ? { state: 'flash', left: v.left - A } : { state: 'wait', left: v.left };
        }
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

    // A lente acesa: cor e altura (vermelho em cima, amarelo no meio, verde embaixo — só reposiciona quando a cor muda).
    _lens(s, key, slot, h, color) {
        const c = TrafficSignals._lensColor(color);
        if (s[key] !== color) { s[key] = color; this._face(slot, h, StreetFurniture.LENS_Y[color] || StreetFurniture.LENS_Y.red, TrafficSignals.LENS); }
        this.glow.color(slot, c[0], c[1], c[2], 0.95);
    }
    // O brilho da lente EM PÉ, virado para quem chega (h.fx, h.fz) e inclinado ~35° para cima (a câmera vê de cima e de trás), um
    // pouco À FRENTE da face da caixa. (Antes: um quadrado deitado no meio da face — metade dentro da caixa, metade fora: com a
    // câmera inclinada, a face e o brilho disputavam a profundidade e a luz piscava.)
    _face(slot, h, y, size) {
        const fx = h.fx || 0, fz = h.fz || 0, t = 0.6, ct = Math.cos(t), st = Math.sin(t), s = size / 2;
        const cx = h.x + fx * 0.05, cz = h.z + fz * 0.05;
        const cy = y + (h.dy || 0) + (typeof Relief !== 'undefined' && Relief.on ? Relief.at(h.x, h.z) : 0);
        const rx = fz * s, rz = -fx * s, vx = -fx * st * s, vy = ct * s, vz = -fz * st * s;
        this.glow.quad(slot, cx - rx - vx, cy - vy, cz - rz - vz, cx + rx - vx, cy - vy, cz + rz - vz, cx - rx + vx, cy + vy, cz - rz + vz, cx + rx + vx, cy + vy, cz + rz + vz);
    }

    _refreshVisuals() {
        const g = this.glow;
        const blink = Math.floor(performance.now() / 350) % 2 === 0;
        const inters = this._visible || (this._visible = CityGrid.intersections.filter((n) => n.visible));
        for (let k = 0; k < inters.length; k++) {
            const inter = inters[k];
            if (!Zones.near(inter.x, inter.z, 40)) continue;           // só os cruzamentos na tela (+ margem): o resto ninguém vê
            if (inter.gen) {
                for (const s of this._slots[k]) {
                    this._lens(s, 'c', s.lens, s.hv, this.vehicle(inter, s.phase).color);
                    const st = s.cw ? this.ped(s.cw).state : 'wait', pc = st === 'walk' ? TrafficSignals.C_WALK : (st === 'flash' ? (blink ? TrafficSignals.C_FLASH : TrafficSignals.C_OFF) : TrafficSignals.C_WAIT);
                    g.color(s.ped, pc[0], pc[1], pc[2], pc[0] + pc[1] + pc[2] > 0 ? 0.9 : 0);
                }
                continue;
            }
            const ns = this.vehicle(inter, 'ns').color, ew = this.vehicle(inter, 'ew').color;
            // Pedestre: N/S atravessam a rua 'ns' (cw.crosses === 'ns'); L/O a rua 'ew'.
            const cwNs = inter.crosswalks.find((q) => q.crosses === 'ns'), cwEw = inter.crosswalks.find((q) => q.crosses === 'ew');
            const pedNs = cwNs ? this.ped(cwNs).state : 'wait';
            const pedEw = cwEw ? this.ped(cwEw).state : 'wait';
            const pc = (s) => s === 'walk' ? TrafficSignals.C_WALK : (s === 'flash' ? (blink ? TrafficSignals.C_FLASH : TrafficSignals.C_OFF) : TrafficSignals.C_WAIT);
            const cNs = pc(pedNs), cEw = pc(pedEw);
            for (const s of this._slots[k]) {
                this._lens(s, 'cNS', s.lensNS, s.hNS, ns);
                this._lens(s, 'cEW', s.lensEW, s.hEW, ew);
                g.color(s.pedNS, cNs[0], cNs[1], cNs[2], cNs[0] + cNs[1] + cNs[2] > 0 ? 0.9 : 0);
                g.color(s.pedEW, cEw[0], cEw[1], cEw[2], cEw[0] + cEw[1] + cEw[2] > 0 ? 0.9 : 0);
            }
        }
        g.flush();
    }
}
TrafficSignals.LENS = 0.6; TrafficSignals.PED = 0.36;      // (tamanho do brilho: lente do carro e lâmpada do pedestre)
TrafficSignals.C_GREEN = [0.1, 1.0, 0.35]; TrafficSignals.C_YELLOW = [1.0, 0.82, 0.1]; TrafficSignals.C_RED = [1.0, 0.14, 0.1];
TrafficSignals.C_WALK = [0.3, 1.0, 0.55]; TrafficSignals.C_FLASH = [1.0, 0.75, 0.15]; TrafficSignals.C_OFF = [0, 0, 0]; TrafficSignals.C_WAIT = [1.0, 0.15, 0.1];
