// ============================================================================
// CarDoors — a porta do motorista/passageiro dos carros abrindo e fechando.
// A porta aberta é a LÂMINA do atlas (CarArt) girando em volta da dobradiça, em qualquer ângulo, mais o vão escuro que ela deixa na
// lateral — dois quads do lote de portas (CarArt.doors: uma chamada de desenho para todas). CARRO 3D (CarArt3D — todos os modelos hoje):
// a porta é de POLÍGONOS — a folha (a lataria na cor da pintura, o vidro em cima, a moldura) girando em volta da dobradiça e o vão
// escuro na lateral do carro, instâncias de dois modelos (todas as portas abertas = 2 desenhos: _3d). Aqui mora o estado: por carro com porta
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

    static is3d(car) { return typeof Car3DActor !== 'undefined' && car.visual instanceof Car3DActor; }

    set(car, sign, open) {
        if (car.isBike || car.wrecked || !car.visual || !car.visual.rotates) return;
        let s = this.state.get(car);
        if (!s) {
            if (!open) return;
            if (CarDoors.is3d(car)) s = { sign, t: 0, target: 0, gap: null, blade: null, shut: [], d3: true };
            else {
                const B = CarArt.doors2d();
                s = { sign, t: 0, target: 0, gap: B.alloc(), blade: B.alloc(), shut: [] };
                B.hide(s.gap); B.hide(s.blade);
            }
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

    _release(s) { if (s.d3) return; CarArt.doors.free(s.gap); CarArt.doors.free(s.blade); }

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

    // ---- a porta em POLÍGONOS (carro 3D): os dois modelos (folha e vão), uma vez; as instâncias são remontadas a cada quadro
    _3d(scene) {
        if (this._m3 && !this._m3.leaf.isDisposed()) return this._m3;
        const mk = (name, build, flat) => {
            const b = new MeshBatch();
            build(b);
            const m = new BABYLON.Mesh(name, scene), vd = new BABYLON.VertexData();
            vd.positions = b.pos; vd.normals = b.nor; vd.indices = b.idx; vd.colors = b.col;
            vd.applyToMesh(m, false);
            const mat = new BABYLON.StandardMaterial(name + 'Mat', scene);
            mat.specularColor = new BABYLON.Color3(0.35, 0.35, 0.35); mat.specularPower = 48;
            if (flat) { mat.disableLighting = true; mat.specularColor = BABYLON.Color3.Black(); mat.emissiveColor = BABYLON.Color3.White(); }      // (sem luz: a cor do vértice sai pela emissão)
            m.material = mat; m.useVertexColors = true; m.isPickable = false; m.alwaysSelectAsActiveMesh = true;
            m._cap = 4; m._M = new Float32Array(m._cap * 16); m._C = new Float32Array(m._cap * 4);
            m.thinInstanceSetBuffer('matrix', m._M, 16, false);
            m.thinInstanceSetBuffer('color', m._C, 4, false);
            m.thinInstanceCount = 0; m.isVisible = false;
            return m;
        };
        // folha: x de 0 (dobradiça) a 1 (ponta), y de 0 (soleira) a 1 (alto da janela), z de −0,5 a 0,5 (a espessura)
        const leaf = mk('carDoor3d', (b) => {
            b.solid(0, -0.5, 1, 0.5, 0, 0.6, [1, 1, 1]);                                  // a lataria (× a pintura)
            b.solid(0, -0.5, 0.06, 0.5, 0.6, 0.97, [1, 1, 1]);                           // a coluna da frente
            b.solid(0.94, -0.5, 1, 0.5, 0.6, 0.97, [1, 1, 1]);                           // a de trás
            b.solid(0, -0.5, 1, 0.5, 0.97, 1.0, [1, 1, 1]);                              // a moldura de cima
            b.solid(0.06, -0.25, 0.94, 0.25, 0.6, 0.97, [0.09, 0.11, 0.13]);             // o vidro (escuro: quase não pega a cor)
            for (const z of [-0.75, 0.5]) b.solid(0.62, z, 0.74, z + 0.25, 0.42, 0.47, [0.75, 0.75, 0.76]);      // as maçanetas
        });
        // o vão: o de dentro do carro, sem luz — a soleira, o assento (o encosto mais para trás) e o escuro do alto (caixas lado a lado,
        // sem se sobrepor: nada briga no mesmo plano)
        const gap = mk('carDoorGap3d', (b) => {
            const seat = [0.15, 0.13, 0.12], back = [0.12, 0.105, 0.1], dark = [0.035, 0.035, 0.04];
            b.solid(0, -0.5, 1, 0.5, 0, 0.07, [0.24, 0.24, 0.25]);                      // a soleira
            b.solid(0, -0.5, 1, 0.5, 0.07, 0.48, seat);                                  // o assento
            b.solid(0, -0.5, 0.5, 0.5, 0.48, 1, dark);
            b.solid(0.5, -0.5, 0.9, 0.5, 0.48, 0.86, back);                              // o encosto
            b.solid(0.9, -0.5, 1, 0.5, 0.48, 0.86, dark);
            b.solid(0.5, -0.5, 1, 0.5, 0.86, 1, dark);
        }, true);
        return (this._m3 = { leaf, gap, list: [] });
    }
    _put3d(car, s) {
        const vis = car.visual, D3 = CarArt3D._defs[vis.modelId], spec = DoorSheet.SPEC[car.spec.id], A = CarDoors.axes(car), p = car.position;
        const Hc = (D3 && D3.h ? D3.h : 1.4) * vis.k, road = vis.y - 1.5 - (vis.lower || 0), sg = s.sign;
        const y0 = road + 0.24 * Hc, hd = 0.68 * Hc, L = spec.len, hx = sg * vis.hw * 0.985, hz = spec.h;
        const Hx = p.x + A.fx * hz + A.rx * hx, Hz = p.z + A.fz * hz + A.rz * hx;
        const ang = DoorSheet.MAX_ANGLE * (1 - Math.pow(1 - s.t, 2)), cs = Math.cos(ang), sn = Math.sin(ang);
        const dx = -A.fx * cs + A.rx * sg * sn, dz = -A.fz * cs + A.rz * sg * sn;      // da dobradiça para a ponta (gira para fora)
        const P = CarSheet.PAINTS[vis.variant] || CarSheet.PAINTS[0], h = parseInt(P.paint.slice(1), 16), col = [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255, 1];
        // (z = x × y normalizado × espessura: o determinante é sempre positivo — as faces para fora dos dois lados do carro)
        const M = (ox, oz, ax, az, len, ht, th) => { const cx = -az, cz = ax, l = Math.hypot(cx, cz) || 1; return [ax * len, 0, az * len, 0, 0, ht, 0, 0, cx / l * th, 0, cz / l * th, 0, ox, y0, oz, 1]; };
        const T = 0.07, out = 0.012;
        this._m3.list.push(['leaf', M(Hx + A.rx * sg * T * 0.5, Hz + A.rz * sg * T * 0.5, dx, dz, L, hd, T), col]);
        this._m3.list.push(['gap', M(Hx + A.rx * sg * out, Hz + A.rz * sg * out, -A.fx, -A.fz, L * 0.94, hd * 0.96, 0.02), [1, 1, 1, 1]]);
    }
    _flush3d() {
        const S = this._m3;
        if (!S) return;
        for (const key of ['leaf', 'gap']) {
            const m = S[key], L = S.list.filter((e) => e[0] === key), n = L.length;
            if (n > m._cap) { m._cap = Math.max(n, m._cap * 2); m._M = new Float32Array(m._cap * 16); m._C = new Float32Array(m._cap * 4); m.thinInstanceSetBuffer('matrix', m._M, 16, false); m.thinInstanceSetBuffer('color', m._C, 4, false); }
            L.forEach((e, i) => { m._M.set(e[1], i * 16); m._C.set(e[2], i * 4); });
            m.thinInstanceCount = n; m.isVisible = n > 0;
            if (n) { m.thinInstanceBufferUpdated('matrix'); m.thinInstanceBufferUpdated('color'); }
        }
        S.list.length = 0;
    }

    update(dt) {
        const speed = Config.theft.doorOpenSpeed;
        for (const [car, s] of this.state) {
            if (car.wrecked) { this.reset(car); continue; }
            if (s.t < s.target) s.t = Math.min(s.target, s.t + speed * dt);
            else if (s.t > s.target) s.t = Math.max(s.target, s.t - speed * 1.15 * dt);

            if (s.d3) { if (s.t > 0.04 && car.visual) { this._3d(this.g.scene); this._put3d(car, s); } }
            else if (s.t > 0.04) this._draw(car, s);
            else { CarArt.doors.hide(s.gap); CarArt.doors.hide(s.blade); }
            if (s.t <= 0 && s.target === 0) {                         // fechou: devolve os quads e avisa quem esperava
                const fns = s.shut, p = car.position;
                this._release(s);
                this.state.delete(car);
                AudioFX.door(p.x, p.z, false);                        // batida da porta
                for (const fn of fns) fn();
            }
        }
        this._flush3d();
    }
}
