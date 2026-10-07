// ============================================================================
// CarDoors — a porta do motorista/passageiro dos carros abrindo e fechando.
// A porta aberta é a LÂMINA do atlas (CarArt) girando em volta da dobradiça, em qualquer ângulo, mais o vão escuro que ela deixa na
// lateral — dois quads do lote de portas (CarArt.doors: uma chamada de desenho para todas). Aqui mora o estado: por carro com porta
// mexendo há { sign, t, target, blade, gap }, onde t é a abertura (0 fechada … 1 toda aberta). Fechada de vez, os quads voltam ao lote.
//   set(car, sign, open)   abre/fecha a porta do lado `sign` (-1 esquerda / +1 direita)
//   whenShut(car, fn)      chama fn quando a porta daquele carro estiver fechada (já, se já está)
//   doorPoint(car, sign)   onde o personagem fica para mexer na porta (ao lado, atrás da folha aberta)
//   reset(car)             some com a porta e o alarme do carro (carro realocado/removido)
// ============================================================================

class CarDoors {
    constructor(game) {
        this.g = game;
        this.state = new Map();        // carro -> { sign, t, target, blade, gap, shut: [fn] }
    }

    // Nada a preparar: a porta de todos os modelos já está no atlas (antes: ~30 ms para assar a folha de cada modelo).
    prewarm() {}

    // Vetores do carro no plano: frente (f) e direita (r), unitários.
    static axes(car) {
        const f = car.body.getDirection(BABYLON.Axis.Z);
        const l = hypot(f.x, f.z) || 1;
        return { fx: f.x / l, fz: f.z / l, rx: f.z / l, rz: -f.x / l };
    }

    // Posição da dobradiça no mundo.
    hingePos(car, sign) {
        const H = DoorSheet.hinge(car.spec.id, sign), A = CarDoors.axes(car), p = car.position;
        return { x: p.x + A.fx * H.z + A.rx * H.x, z: p.z + A.fz * H.z + A.rz * H.x };
    }

    // Onde o personagem fica ao lado da porta (junto do banco, atrás da folha quando aberta) e para onde ele olha.
    doorPoint(car, sign) {
        const D = DoorSheet.SPEC[car.spec.id], A = CarDoors.axes(car), p = car.position;
        const along = D.h - D.len * 0.8, out = car.halfW + 0.5;
        return {
            x: p.x + A.fx * along + A.rx * sign * out,
            z: p.z + A.fz * along + A.rz * sign * out,
            face: Math.atan2(-sign * A.rx, -sign * A.rz),         // olhando para dentro (o carro)
        };
    }

    isOpen(car) { const s = this.state.get(car); return !!s && s.target > 0; }

    set(car, sign, open) {
        if (car.isBike || car.wrecked || !car.visual || !car.visual.rotates) return;
        let s = this.state.get(car);
        if (!s) {
            if (!open) return;
            const B = CarArt.doors;
            s = { sign, t: 0, target: 0, gap: B.alloc(), blade: B.alloc(), shut: [] };
            B.hide(s.gap); B.hide(s.blade);
            this.state.set(car, s);
        }
        s.sign = sign;
        const was = s.target;
        s.target = open ? 1 : 0;
        if (open && !was) { const p = car.position; AudioFX.door(p.x, p.z, true); }
    }

    // Manda fechar a porta (se estiver aberta).
    close(car) {
        const s = this.state.get(car);
        if (s) s.target = 0;
    }

    whenShut(car, fn) {
        const s = this.state.get(car);
        if (!s) { fn(); return; }
        s.shut.push(fn);
    }

    _release(s) { CarArt.doors.free(s.gap); CarArt.doors.free(s.blade); }

    reset(car) {
        const s = this.state.get(car);
        car.alarm = 0; car.hazard = false;
        if (!s) return;
        this._release(s);
        this.state.delete(car);
        for (const fn of s.shut) fn();            // quem esperava a porta fechar segue em frente
    }

    // Desenha a porta de `car` aberta em t (0..1): o vão escuro na lateral e a lâmina girada para fora em volta da dobradiça.
    _draw(car, s) {
        const B = CarArt.doors, m = CarArt.model(car.spec.id), D = DoorSheet.SPEC[car.spec.id];
        const A = CarDoors.axes(car), H = this.hingePos(car, s.sign), vis = car.visual, y = (vis ? vis.y : 1.5) + 0.06;
        const sg = s.sign, ang = DoorSheet.MAX_ANGLE * (1 - Math.pow(1 - s.t, 2));
        // vão: faixa escura ao longo da lateral, logo atrás da dobradiça (por dentro da carroceria)
        const gl = D.len * 0.92, gw = 0.05, inX = -sg * 0.07;
        const g0x = H.x + A.rx * inX, g0z = H.z + A.rz * inX, g1x = g0x - A.fx * gl, g1z = g0z - A.fz * gl;
        const solid = CarArt.data.solid;
        const su = CarArt.uvRect([solid[0] + 2, solid[1] + 2, 4, 4]);
        B.quad(s.gap, y, g0x - A.rx * gw, g0z - A.rz * gw, g0x + A.rx * gw, g0z + A.rz * gw, g1x - A.rx * gw, g1z - A.rz * gw, g1x + A.rx * gw, g1z + A.rz * gw, su);
        // lâmina: da dobradiça (frente) até a ponta livre, girada `ang` para fora; face externa = topo da imagem (v0)
        const cs = Math.cos(ang), sn = Math.sin(ang);
        const dx = -A.fx * cs + A.rx * sg * sn, dz = -A.fz * cs + A.rz * sg * sn;      // da dobradiça para a ponta
        const ox = A.rx * sg * cs + A.fx * sn, oz = A.rz * sg * cs + A.fz * sn;       // normal para FORA
        const L = m.door.len, T = m.door.thick / 2;
        const ex = H.x + dx * L, ez = H.z + dz * L;
        // cantos na ordem do CarBatch.quad: (u1,v0) dobradiça-fora, (u1,v1) dobradiça-dentro, (u0,v0) ponta-fora, (u0,v1) ponta-dentro
        B.quad(s.blade, y + 0.02, H.x + ox * T, H.z + oz * T, H.x - ox * T, H.z - oz * T, ex + ox * T, ez + oz * T, ex - ox * T, ez - oz * T, CarArt.uvRect(m.door.r));
        const v = vis ? vis.variant : 0, sh = vis ? vis.shade : 1;
        B.color(s.gap, v, sh, 0, 0.9);
        B.color(s.blade, v, sh, 0, 1);
    }

    update(dt) {
        const speed = Config.theft.doorOpenSpeed;
        for (const [car, s] of this.state) {
            if (car.wrecked) { this.reset(car); continue; }
            if (s.t < s.target) s.t = Math.min(s.target, s.t + speed * dt);
            else if (s.t > s.target) s.t = Math.max(s.target, s.t - speed * 1.15 * dt);

            if (s.t > 0.04) this._draw(car, s);
            else { CarArt.doors.hide(s.gap); CarArt.doors.hide(s.blade); }
            if (s.t <= 0 && s.target === 0) {                         // fechou: devolve os quads e avisa quem esperava
                const fns = s.shut, p = car.position;
                this._release(s);
                this.state.delete(car);
                AudioFX.door(p.x, p.z, false);                        // batida da porta
                for (const fn of fns) fn();
            }
        }
    }
}
