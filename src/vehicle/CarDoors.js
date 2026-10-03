// ============================================================================
// CarDoors — a porta do motorista/passageiro dos carros abrindo e fechando.
// A porta aberta é um sprite à parte (DoorSheet) desenhado por cima do carro, centrado na dobradiça, com o mesmo
// heading do carro. Aqui só mora o estado: por carro com porta mexendo há { sign, t, target, actor }, onde t é a
// abertura (0 fechada … 1 toda aberta). Fechada de vez, o sprite é devolvido ao pool.
//   set(car, sign, open)   abre/fecha a porta do lado `sign` (-1 esquerda / +1 direita)
//   whenShut(car, fn)      chama fn quando a porta daquele carro estiver fechada (já, se já está)
//   doorPoint(car, sign)   onde o personagem fica para mexer na porta (ao lado, atrás da folha aberta)
//   reset(car)             some com a porta e o alarme do carro (carro realocado/removido)
// ============================================================================

class CarDoors {
    constructor(game) {
        this.g = game;
        this.state = new Map();        // carro -> { sign, t, target, actor, shut: [fn] }
        this.pool = [];                // atores livres (por folha: reaproveitados só se for a mesma)
    }

    // Folha da porta do modelo do carro, pronta (assa na hora o que faltar: ~30 ms, uma vez por modelo).
    _sheet(car) {
        const s = this.g.carLib.doorSheet(car.spec.id);
        if (!s.ready) s.bake(Infinity);
        return s;
    }

    // Pré-assa a porta do modelo em segundo plano (chamado quando o jogador chega perto de um carro).
    prewarm(car) {
        if (car && !car.isBike) this.g.carLib.doorSheet(car.spec.id);
    }

    // Vetores do carro no plano: frente (f) e direita (r), unitários.
    static axes(car) {
        const f = car.body.getDirection(BABYLON.Axis.Z);
        const l = Math.hypot(f.x, f.z) || 1;
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
        if (car.isBike || car.wrecked) return;
        let s = this.state.get(car);
        if (!s) {
            if (!open) return;
            const sheet = this._sheet(car);
            const actor = new SpriteActor(this.g.scene, sheet, car.visual ? car.visual.variant : 0, 'carDoor');
            actor.play('static');
            actor.mesh.position.y = 1.56;
            actor.setVisible(false);
            s = { sign, t: 0, target: 0, actor, shut: [] };
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

    reset(car) {
        const s = this.state.get(car);
        car.alarm = 0; car.hazard = false;
        if (!s) return;
        s.actor.dispose();
        this.state.delete(car);
        for (const fn of s.shut) fn();            // quem esperava a porta fechar segue em frente
    }

    update(dt) {
        const speed = Config.theft.doorOpenSpeed;
        for (const [car, s] of this.state) {
            if (car.wrecked) { this.reset(car); continue; }
            if (s.t < s.target) s.t = Math.min(s.target, s.t + speed * dt);
            else if (s.t > s.target) s.t = Math.max(s.target, s.t - speed * 1.15 * dt);

            const a = s.actor;
            const show = s.t > 0.07;
            a.setVisible(show);
            if (show) {
                const H = this.hingePos(car, s.sign), A = CarDoors.axes(car);
                a.setPosition(H.x, H.z);
                a.setHeading(Math.atan2(A.fx, A.fz));
                const k = Math.min(DoorSheet.ANGLES - 1, Math.floor(s.t * DoorSheet.ANGLES));
                a.setFrame((s.sign < 0 ? 0 : DoorSheet.ANGLES) + k);
            }
            if (s.t <= 0 && s.target === 0) {                         // fechou: devolve o sprite e avisa quem esperava
                const fns = s.shut, p = car.position;
                a.dispose();
                this.state.delete(car);
                AudioFX.door(p.x, p.z, false);                        // batida da porta
                for (const fn of fns) fn();
            }
        }
    }
}
