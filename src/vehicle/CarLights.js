// ============================================================================
// CarLights — luzes e fumaça de todos os carros, em poucos draw calls:
//   faróis (brilho + cone de luz no chão, à noite) | lanternas (luz de freio forte) |
//   setas piscando nas curvas | giroflex da polícia (azul/vermelho + reflexo no chão) |
//   fumaça do escapamento (ao acelerar e em marcha lenta).
// Lê o estado de cada Vehicle: braking, accelerating, signal, lightsOn, sirenOn, mode.
// Carros longe da câmera são ignorados (nada de custo para o que não se vê).
// ============================================================================

class CarLights {
    // maxCars: carros COM LUZ ao mesmo tempo (só os perto da câmera têm); se passar, os lotes crescem sozinhos.
    constructor(scene, maxCars = 48) {
        // under(): os faróis, lanternas e o cone no chão são luz do mundo como a dos postes — desenhados antes dos personagens 2,5D.
        // Por último, somavam luz por cima do piloto (que ficava "lavado") menos onde o quadro 3D da bicicleta/moto tapava o brilho:
        // ali o piloto ficava com a cor de verdade, mais escura, e parecia uma sombra do veículo por cima dele.
        this.glow = new GlowBatch(scene, maxCars * 10, 'carGlow', 'glow').under();
        this.cones = new GlowBatch(scene, maxCars * 2, 'carCone', 'cone').under();
        this.puffs = new PuffSystem(scene, 420);
        this.slots = new Map();          // carro -> { hl:[2], tl:[2], sig:[2], siren:[2], pool, cone }
        this.time = 0;
        this.range = 62;                 // só processa carros até esta distância do foco
    }

    _slots(car) {
        let s = this.slots.get(car);
        if (!s) {
            s = {
                hl: [this.glow.alloc(), this.glow.alloc()],
                tl: [this.glow.alloc(), this.glow.alloc()],
                sig: [this.glow.alloc(), this.glow.alloc()],
                siren: [this.glow.alloc(), this.glow.alloc()],
                pool: this.glow.alloc(),
                beam: this.glow.alloc(),
                cone: [this.cones.alloc(), this.cones.alloc()],
                lamps: car._lamps || (car._lamps = car.spec.lamps || CarSheet.lamps(car.spec.id)),      // (guardado no carro: ele entra e sai do alcance)
                puffT: Math.random(),
            };
            this.slots.set(car, s);
        }
        return s;
    }

    // O carro saiu do jogo: devolve os quads de luz dele.
    release(car) {
        const s = this.slots.get(car);
        if (!s) return;
        for (const k of ['hl', 'tl', 'sig', 'siren']) for (const i of s[k]) this.glow.free(i);
        this.glow.free(s.pool); this.glow.free(s.beam);
        if (s.neon) for (const i of s.neon) this.glow.free(i);
        for (const i of s.cone) this.cones.free(i);
        this.slots.delete(car);
        if (car.visual && car.visual.setLamps) car.visual.setLamps(0, 0, false, false, 0, false);      // (carro 3D: apaga as lâmpadas do modelo)
    }

    // night: 0..1 | focus: {x, z} (centro da câmera) | cars: todos os carros (civis + polícia)
    update(dt, night, focus, cars) {
        this.time += dt;
        const g = this.glow, c = this.cones;
        const blink = Math.floor(this.time * 2.6) % 2 === 0;
        const sirenPhase = Math.floor(this.time * 5) % 2 === 0;
        const range2 = this.range * this.range;
        // Lamps face the camera or not: the camera looks along its ground forward (CompassCamera.yaw), so a lamp pointing back at it
        // (dot of the lamp's direction with the way toward the camera) shows; turned sideways it fades; pointing away it is behind
        // the body — hidden, instead of its glow showing through the car.
        const cy = CompassCamera.yaw || 0, tcx = -Math.sin(cy), tcz = -Math.cos(cy);
        const facing = (dx, dz) => Math.max(0, Math.min(1, (dx * tcx + dz * tcz + 0.1) / 0.45));

        for (const car of cars) {
            const p = car.position;
            const dx = p.x - focus.x, dz = p.z - focus.z;
            if (dx * dx + dz * dz > range2) {                      // fora de vista: DEVOLVE os quads (o lote só guarda os carros perto
                if (this.slots.has(car)) this.release(car);        // da câmera — com centenas de carros no mapa ele não cresce)
                continue;
            }
            const s = this._slots(car);

            // Vetor frente = o da imagem DESENHADA: luzes e feixes saem exatamente das lanternas do desenho. Carro (atlas): o sprite
            // gira no ângulo exato; moto/bicicleta: a folha tem N direções (desvio de até meia direção entre o corpo físico e o sprite).
            let fx, fz;
            const vis = car.visual;
            if (vis && vis.rotates) { fx = Math.sin(vis.heading); fz = Math.cos(vis.heading); }
            else if (vis && vis.sheet && vis.sheet.dirs && !car.spec.boat) { const a = (vis.dir * Math.PI * 2) / vis.sheet.dirs; fx = Math.sin(a); fz = Math.cos(a); }
            else { const f = car.fwdToRef(this._f || (this._f = new BABYLON.Vector3())); fx = f.x; fz = f.z; const fl = hypot(fx, fz) || 1; fx /= fl; fz /= fl; }
            const rx = fz, rz = -fx;                              // direita do carro
            // 3D car: the glows sit on the model's own lamps (height, spacing, nose/tail) and stay small (the lamp materials light up
            // too); drawn car: the lamps of the sheet, at the height of the sprite plane.
            const G3 = vis && vis.lampGeom, L = G3 || s.lamps, gk = G3 ? 0.6 : 1;
            const alive = car.mode !== 'parked' && car.mode !== 'abandoned' && !car.destroyed;

            // ---- Faróis: ligados à noite para quem está em uso (circulando, dirigido pelo jogador, viatura)
            const on = (alive || (car.controlled && !car.destroyed)) && (car.lightsOn || night > 0.3);
            const pedal = car.spec.bike === 'bike';                       // bicicleta: sem farol, sem luz no chão, sem freio aceso — só o refletor
            const hazard = !!car.hazard && !car.destroyed && !pedal;      // alarme tocando: pisca-alerta + faróis piscando
            const hI = pedal ? 0 : hazard ? 0.9 : (on ? Math.min(1, (night - 0.15) / 0.5) : 0);
            const el = car.elev || 0, hy = (G3 ? G3.y : 1.7) + el;
            const front = facing(fx, fz), rear = facing(-fx, -fz), out = 0.25 * gk;          // (the glow sits just outside the body)
            for (let k = 0; k < 2; k++) {
                const sx = k === 0 ? -L.x : L.x;
                g.place(s.hl[k], p.x + fx * (L.zF + out) + rx * sx, hy, p.z + fz * (L.zF + out) + rz * sx, 1.7 * gk);
                if (hI * front > 0.02) g.color(s.hl[k], 1.0, 0.94, 0.75, 0.5 * hI * front); else g.off(s.hl[k]);
            }
            // Um cone por farol, em "V" RETO: o vértice fica na própria lâmpada e o feixe abre simetricamente ao longo do vetor
            // frente do carro (o eixo do feixe é paralelo ao do carro, sem desviar para fora). Os dois se sobrepõem à frente.
            for (let k = 0; k < 2; k++) {
                const side = k === 0 ? -1 : 1;
                if (false && hI > 0.02) {                                    // feixe em cone DESLIGADO (so o brilho do farol e a poça de luz no chão)
                    const n0 = L.zF, n1 = L.zF + 10;
                    const o0 = L.x * side, o1 = L.x * side;                     // centro do feixe: o mesmo, perto e longe (reto)
                    const hw0 = 0.65, hw1 = 3.7;                                // meia largura: ponta na lâmpada / aberto no fim
                    const cx0 = p.x + fx * n0, cz0 = p.z + fz * n0, cx1 = p.x + fx * n1, cz1 = p.z + fz * n1;
                    c.quad(s.cone[k], cx0 + rx * (o0 - hw0), 0.22, cz0 + rz * (o0 - hw0), cx0 + rx * (o0 + hw0), 0.22, cz0 + rz * (o0 + hw0),
                        cx1 + rx * (o1 - hw1), 0.22, cz1 + rz * (o1 - hw1), cx1 + rx * (o1 + hw1), 0.22, cz1 + rz * (o1 + hw1));
                    c.color(s.cone[k], 1.0, 0.88, 0.58, 0.9 * hI);
                } else c.off(s.cone[k]);
            }
            // Poça de luz no chão à frente do carro (como a dos postes): grande, macia e quente.
            if (hI > 0.02) { g.place(s.beam, p.x + fx * (L.zF - 0.8), 0.23, p.z + fz * (L.zF - 0.8), 21); g.color(s.beam, 1.0, 0.82, 0.5, 0.34 * hI); } else g.off(s.beam);   // poça morna e grande em volta do carro

            // ---- Lanternas: vermelho fraco com os faróis ligados; forte e maior ao frear.
            const braking = car.braking && (alive || car.controlled) && !pedal;
            const tI = pedal ? (night > 0.3 ? 0.22 : 0) : braking ? 1.0 : (hI > 0.02 ? 0.5 * hI : (alive || car.controlled ? 0.18 : 0));
            for (let k = 0; k < 2; k++) {
                const sx = k === 0 ? -L.x : L.x;
                g.place(s.tl[k], p.x + fx * (L.zR - out) + rx * sx, hy, p.z + fz * (L.zR - out) + rz * sx, (braking ? 2.0 : 1.2) * gk);
                // Seta traseira: o lado da curva pisca em âmbar no lugar da lanterna.
                if (rear <= 0.02) g.off(s.tl[k]);
                else if (hazard) {
                    g.color(s.tl[k], 1.0, 0.62, 0.08, 0.95 * rear);
                } else if (car.signal === (k === 0 ? -1 : 1) && alive && !pedal) {
                    if (blink) g.color(s.tl[k], 1.0, 0.62, 0.08, 0.95 * rear); else g.off(s.tl[k]);
                } else if (tI > 0.02) g.color(s.tl[k], 1.0, 0.1, 0.07, 0.95 * tI * rear);
                else g.off(s.tl[k]);
            }

            // ---- Setas dianteiras: lado da curva, um pouco para fora do farol.
            for (let k = 0; k < 2; k++) {
                const side = k === 0 ? -1 : 1;
                g.place(s.sig[k], p.x + fx * (L.zF - 0.45) + rx * side * (L.x + 0.62), hy, p.z + fz * (L.zF - 0.45) + rz * side * (L.x + 0.62), 0.7 * gk);
                if (front > 0.02 && (hazard || (car.signal === side && blink && alive && !pedal))) g.color(s.sig[k], 1.0, 0.62, 0.08, 0.95 * front); else g.off(s.sig[k]);
            }

            // ---- Giroflex (viaturas em perseguição) + reflexo colorido no chão.
            if (car.sirenOn) {
                const A = sirenPhase ? CarLights.SIREN[0] : CarLights.SIREN[1];
                const B = sirenPhase ? CarLights.SIREN[2] : CarLights.SIREN[3];
                const sz = car.spec.siren ? car.spec.siren.z : -0.1;           // giroflex desenhado no teto (atlas) ou o padrão
                const sy = (G3 ? G3.roof + 0.1 : 2.05) + el;                  // (3D: on the roof of the model)
                g.place(s.siren[0], p.x + fx * sz - rx * 0.32, sy, p.z + fz * sz - rz * 0.32, 1.9);
                g.place(s.siren[1], p.x + fx * sz + rx * 0.32, sy, p.z + fz * sz + rz * 0.32, 1.9);
                g.color(s.siren[0], A[0], A[1], A[2], 1);
                g.color(s.siren[1], B[0], B[1], B[2], 1);
                const col = sirenPhase ? CarLights.SIREN[4] : CarLights.SIREN[5];
                g.place(s.pool, p.x, 0.25, p.z, 11);
                g.color(s.pool, col[0], col[1], col[2], 0.16 + 0.1 * night);
            } else {
                g.off(s.siren[0]); g.off(s.siren[1]); g.off(s.pool);
            }

            // ---- Neon da tunagem (Tuning): luz colorida no chão, embaixo do carro ligado — fraca de dia, forte à noite.
            const nc = car.mods && car.mods.neon && typeof Tuning !== 'undefined' && Tuning.NEON[car.mods.neon];
            if (nc && (alive || car.controlled) && !car.destroyed) {
                if (!s.neon) s.neon = [g.alloc(), g.alloc(), g.alloc()];
                const a = Math.min(1, 0.4 + 0.6 * night) * (0.88 + 0.12 * Math.sin(this.time * 2.2)), hl = car.halfLen || 2, el = car.elev || 0;
                for (let k = 0; k < 3; k++) {
                    const o = (k - 1) * hl * 0.62;
                    g.place(s.neon[k], p.x + fx * o, 0.24 + el, p.z + fz * o, hl * 2.1);
                    g.color(s.neon[k], nc[0], nc[1], nc[2], a);
                }
            } else if (s.neon) for (const i of s.neon) g.off(i);

            // ---- Carro 3D: as próprias lâmpadas do modelo acendem (faróis, lanternas/freio, setas piscando, ré, giroflex, luminoso)
            if (vis && vis.setLamps) {
                const sigOn = (side) => hazard || (car.signal === side && blink && alive && !pedal);
                const rev = (alive || car.controlled) && !car.destroyed && car.forwardSpeed < -0.4;
                vis.setLamps(hI, tI, sigOn(-1), sigOn(1), car.sirenOn ? (sirenPhase ? 1 : 2) : 0, rev);
            }

            // ---- Fumaça do escapamento: sai da BOCA do cano (carro 3D: embaixo do para-choque, à esquerda; moto: ao lado da roda de
            // trás, à direita — CarArt3D.lampGeom ex/ey/ez; desenho: atrás da lanterna esquerda), para trás e para cima. Pequena e densa
            // na saída, abrindo e clareando até sumir; muitas e pequenas, num rastro contínuo (acelerando, mais e mais escura).
            // Bicicleta não tem.
            // (o carro do jogador conta com o motor ligado, mesmo tendo sido pego estacionado)
            if ((alive || (car.controlled && !car.destroyed && !car.engineDead)) && !car.spec.noExhaust) {
                const speed = Math.abs(car.forwardSpeed), acc = !!car.accelerating;
                const rate = car.sirenOn ? 16 : (acc ? 18 : (speed > 1 ? 7 : 4));
                s.puffT -= dt;
                for (let guard = 0; s.puffT <= 0 && guard < 4; guard++) {
                    s.puffT += (0.75 + Math.random() * 0.5) / rate;
                    const ez = G3 && G3.ez != null ? G3.ez : L.zR, ex = G3 && G3.ex != null ? G3.ex : -L.x * 0.75, ey = (G3 && G3.ey != null ? G3.ey : 0.32) + el;
                    const x0 = p.x + fx * ez + rx * ex, z0 = p.z + fz * ez + rz * ex, v = car.velocity, out = 1.4 + Math.random() * 1.2;
                    // (a fumaça nasce com um pouco da velocidade do carro — sai do cano, não aparece parada atrás dele)
                    this.puffs.emit(x0, ey, z0, v.x * 0.35 - fx * out + (Math.random() - 0.5) * 0.35, 0.35 + Math.random() * 0.35, v.z * 0.35 - fz * out + (Math.random() - 0.5) * 0.35,
                        0.16, acc ? 1.7 : 1.15, acc ? 1.2 + Math.random() * 0.5 : 0.9 + Math.random() * 0.45, acc ? 0.55 : 0.36, acc ? CarLights.EXHAUST_HARD : CarLights.EXHAUST);
                }
                if (s.puffT < 0) s.puffT = 0;
            }

            // ---- Chuva: o veículo em movimento levanta ÁGUA dos pneus — não fumaça: jorros de água (WaterSpray, o mesmo desenho dos
            // barcos: jato azul que sobe, estoura em espuma e cai) atrás das rodas e gotas que voam e caem (WaterFx.splash). Visto de
            // lado, o leque inclinado para trás; de trás/de frente, a coroa. Carro, moto e bicicleta, cada um no seu tamanho.
            const W = Weather.cur, wfx = this.waterFx;
            if (wfx && (alive || car.controlled) && W && W.k > 0.12 && !car.spec.boat && !Interiors.active) {
                const v = car.velocity, sp = hypot(v.x, v.z);
                if (sp > 2.5) {
                    s.sprayT = (s.sprayT || 0) - dt;
                    if (s.sprayT <= 0) {
                        const bike = car.spec.bike === 'bike', moto = !!car.isBike && !bike, kW = 0.45 + W.k;
                        s.sprayT = (bike ? 0.16 : moto ? 0.11 : 0.075) / Math.min(1.6, kW * Math.min(1.5, sp / 9));
                        const hl = car.halfLen, hw = car.halfW, vx = v.x / sp, vz = v.z / sp;
                        // roda de trás (de vez em quando a da frente); carro: um lado por vez
                        const front = Math.random() < 0.2, side = car.isBike ? 0 : (s.sprayS = -(s.sprayS || 1));
                        const wz = (front ? 0.62 : -0.66) * hl, wx = side * (hw - 0.15);
                        const px = p.x + fx * wz + rx * wx - vx * 0.25, pz = p.z + fz * wz + rz * wx - vz * 0.25;
                        const yaw = CompassCamera.yaw || 0, sx = Math.cos(yaw), sz = -Math.sin(yaw);      // ("direita" da tela, no chão)
                        const across = Math.abs(-vx * sx - vz * sz) > 0.55;                          // (água indo para o lado da tela)
                        const kind = bike ? 'kick' : moto ? 'stroke' : (across ? 'tail' : 'tailC');
                        const keep = Math.min(sp, 20) * 0.3;
                        wfx.spray.emit(px, pz, { kind, dir: [-vx, -vz], vx: vx * keep, vz: vz * keep, drag: 3.5, a: (car.isBike ? 0.6 : 0.75) + 0.25 * W.k, life: (bike ? 0.34 : 0.48) + Math.random() * 0.12 });
                        if (Math.random() < 0.5 + 0.4 * W.k) wfx.splash(px, pz, bike ? 2 : moto ? 3 : 4, (bike ? 0.55 : 0.8) + Math.min(sp, 20) * 0.02, -vx * 0.6 + vx * keep * 0.4, -vz * 0.6 + vz * keep * 0.4, 0.12);
                    }
                }
            }
        }
        this.puffs.update(dt);
        g.flush();
        c.flush();
    }
}

// Cores da fumaça do escapamento: cinza claro em marcha lenta, mais escura acelerando forte.
CarLights.EXHAUST = [0.78, 0.79, 0.82];
CarLights.EXHAUST_HARD = [0.56, 0.57, 0.6];

// Cores do giroflex (azul forte/fraco, vermelho fraco/forte) e do reflexo no chão (azul/vermelho): constantes, sem array novo por quadro.
CarLights.SIREN = [[0.2, 0.45, 1.0], [0.12, 0.2, 0.5], [0.5, 0.08, 0.08], [1.0, 0.18, 0.15], [0.15, 0.3, 0.9], [0.9, 0.12, 0.1]];

// ----------------------------------------------------------------------------
// PuffSystem — pool de baforadas de fumaça (escapamento, pneu cantando, motor quebrado, fogo, explosões): uma malha só (1 draw call).
// Cada baforada é um quad VIRADO PARA A CÂMERA (billboard, montado no shader a partir do centro, do canto e do tamanho) e desenhado
// MACIO: o alfa cai como uma gaussiana até a borda (sem disco recortado) e uma névoa de ruído — diferente em cada baforada e girando
// devagar com a idade — faz o volume de fumaça; o lado de cima, mais claro (a luz vem de cima). Muitas baforadas pequenas se somam
// num rastro contínuo e borrado. A profundidade é puxada para a câmera (meia baforada): a parte de baixo, perto do chão, não some
// dentro dele, e o carro 3D na frente continua escondendo a fumaça que sai atrás dele.
// ----------------------------------------------------------------------------
class PuffSystem {
    static register() {
        if (BABYLON.Effect.ShadersStore.smokePuffVertexShader) return;
        BABYLON.Effect.ShadersStore.smokePuffVertexShader = `
            precision highp float;
            attribute vec3 position;         // centro da baforada (o mesmo nos 4 cantos)
            attribute vec2 uv;               // canto (0..1)
            attribute vec4 color;
            attribute vec3 data;             // tamanho (m), semente, idade (0..1)
            uniform mat4 view;
            uniform mat4 projection;
            varying vec2 vUV;
            varying vec4 vColor;
            varying vec3 vData;
            void main(void) {
                vUV = uv; vColor = color; vData = data;
                vec4 p = view * vec4(position, 1.0);
                p.xy += (uv - 0.5) * vec2(1.0, -1.0) * data.x * 1.35;            // (a borda macia: o quad passa do tamanho visível)
                p.z -= data.x * 0.5;                                          // (puxada para a câmera: não entra no chão)
                gl_Position = projection * p;
            }`;
        BABYLON.Effect.ShadersStore.smokePuffFragmentShader = `
            precision highp float;
            varying vec2 vUV;
            varying vec4 vColor;
            varying vec3 vData;
            uniform vec3 tint;
            float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float vnoise(vec2 p) {
                vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
                return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
            }
            void main(void) {
                if (vColor.a <= 0.003) discard;
                vec2 p = vUV * 2.0 - 1.0;
                float r2 = dot(p, p);
                if (r2 >= 1.0) discard;
                float a = exp(-r2 * 2.2) * sqrt(1.0 - r2);                       // gaussiana que chega a 0 na borda: sem contorno
                float ang = vData.y * 6.2832 + vData.z * 1.4, cs = cos(ang), sn = sin(ang);
                vec2 q = mat2(cs, -sn, sn, cs) * p * 1.9 + vData.y * 37.0;
                float n = vnoise(q) * 0.55 + vnoise(q * 2.07 + 11.0) * 0.3 + vnoise(q * 4.3 + 23.0) * 0.15;   // volume (três oitavas)
                float lump = smoothstep(0.18, 0.78, n + 0.32 * (1.0 - r2) - 0.12 * vData.z);                    // tufos, que se desfazem
                a *= mix(1.0, 0.04 + 1.45 * lump, 0.95 - 0.3 * vData.z);
                float shade = 0.78 + 0.22 * lump + 0.12 * clamp(-p.y, -1.0, 1.0); // (miolo dos tufos claro, frestas e base mais escuras)
                gl_FragColor = vec4(vColor.rgb * shade * tint, clamp(a, 0.0, 1.0) * vColor.a);
            }`;
    }

    constructor(scene, capacity) {
        PuffSystem.register();
        this.n = capacity;
        this.pos = new Float32Array(capacity * 12);
        this.col = new Float32Array(capacity * 16);
        this.dat = new Float32Array(capacity * 12);
        const uv = new Float32Array(capacity * 8), idx = new Uint32Array(capacity * 6);
        for (let i = 0; i < capacity; i++) {
            const u = i * 8, b = i * 4, o = i * 6;
            uv[u + 2] = 1; uv[u + 5] = 1; uv[u + 6] = 1; uv[u + 7] = 1;         // (0,0) (1,0) (0,1) (1,1)
            idx[o] = b; idx[o + 1] = b + 1; idx[o + 2] = b + 2; idx[o + 3] = b + 2; idx[o + 4] = b + 1; idx[o + 5] = b + 3;
        }
        const mesh = this.mesh = new BABYLON.Mesh('puffs', scene), vd = new BABYLON.VertexData();
        vd.positions = this.pos; vd.colors = this.col; vd.uvs = uv; vd.indices = idx;
        vd.applyToMesh(mesh, true);
        mesh.setVerticesData('data', this.dat, true, 3);
        const m = new BABYLON.ShaderMaterial('puffsMat', scene, { vertex: 'smokePuff', fragment: 'smokePuff' }, {
            attributes: ['position', 'uv', 'color', 'data'], uniforms: ['view', 'projection', 'tint'], needAlphaBlending: true,
        });
        m.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
        m.backFaceCulling = false;
        m.disableDepthWrite = true;
        m.setColor3('tint', SpriteMaterial.sharedTint());
        mesh.material = m;
        mesh.renderingGroupId = 1;
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.doNotSyncBoundingInfo = true;
        this.p = [];
        for (let i = 0; i < capacity; i++) this.p.push({ on: false, age: 0, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s0: 0.3, s1: 1, a0: 0.4, seed: 0 });
        this.next = 0;
        this.live = 0;
    }

    // color: [r,g,b] da baforada (padrão: cinza do escapamento); fumaça de motor quebrado/fogo usa tons escuros.
    emit(x, y, z, vx, vy, vz, s0, s1, life, alpha, color = null) {
        for (let k = 0; k < this.n; k++) {
            const q = this.p[(this.next + k) % this.n];
            if (q.on) continue;
            q.on = true; q.age = 0; q.life = life; q.c = color; q.seed = Math.random();
            q.x = x; q.y = y; q.z = z; q.vx = vx; q.vy = vy; q.vz = vz; q.s0 = s0; q.s1 = s1; q.a0 = alpha;
            this.next = (this.next + k + 1) % this.n;
            this.live++;
            return;
        }
    }

    update(dt) {
        if (!this.live && !this._drawn) return;
        const P = this.pos, C = this.col, D = this.dat;
        let live = 0;
        for (let i = 0; i < this.n; i++) {
            const q = this.p[i];
            if (!q.on) continue;
            q.age += dt;
            if (q.age >= q.life) { q.on = false; for (let k = 3; k < 16; k += 4) C[i * 16 + k] = 0; continue; }
            live++;
            const t = q.age / q.life;
            const damp = Math.exp(-1.8 * dt);
            q.vx *= damp; q.vz *= damp; q.vy *= Math.exp(-0.6 * dt);
            q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
            const size = q.s0 + (q.s1 - q.s0) * Math.sqrt(t);
            const a = q.a0 * Math.min(1, t * 8) * (1 - t) * (1 - t * 0.4);     // (nasce em 1/8 da vida: sem "estalo" no escapamento)
            const c = q.c, r = c ? c[0] : 0.8, g = c ? c[1] : 0.8, b = c ? c[2] : 0.82;
            for (let k = 0; k < 4; k++) {
                const o = i * 12 + k * 3, oc = i * 16 + k * 4;
                P[o] = q.x; P[o + 1] = q.y; P[o + 2] = q.z;
                D[o] = size; D[o + 1] = q.seed; D[o + 2] = t;
                C[oc] = r; C[oc + 1] = g; C[oc + 2] = b; C[oc + 3] = a;
            }
        }
        const m = this.mesh;
        m.updateVerticesData(BABYLON.VertexBuffer.PositionKind, P, false, false);
        m.updateVerticesData(BABYLON.VertexBuffer.ColorKind, C, false, false);
        m.updateVerticesData('data', D, false, false);
        m.isVisible = live > 0;
        this._drawn = live > 0;
        this.live = live;
    }
}
