// ============================================================================
// TrafficCar — carro com IA de trânsito (mão direita, uma faixa por sentido).
//
// Segue uma Route (planejada cruzamento a cruzamento) por pure pursuit e escolhe a
// velocidade-alvo como o MÍNIMO entre vários limites:
//   cruzeiro do motorista | curva à frente | semáforo (para na linha) |
//   esquerda (e retorno) cede ao tráfego contrário | rotatória: cede a quem já está no anel |
//   "caixa livre" (não entra se a saída está bloqueada) | carro/pedestre à frente (mantém distância e para).
// Buzina quando fica bloqueado com a via livre, ou quando precisa frear forte.
//
// Modos: 'drive' (IA) | 'parked' (estacionado no meio-fio) | 'abandoned' (o jogador
// largou na pista: fica parado até sumir quando ele se afastar).
// ============================================================================

class TrafficCar extends Vehicle {
    // traffic = TrafficManager (obstáculos, semáforos, relógio).
    constructor(scene, physics, pos, id, carSheet, paint, heading, traffic) {
        super(scene, physics, new BABYLON.Vector3(pos.x, 0, pos.z), id, carSheet, paint, heading);
        this.traffic = traffic;
        this.mode = 'drive';
        this.route = null;

        const T = Config.traffic;
        this.cruise = (T.cruiseMin + Math.random() * (T.cruiseMax - T.cruiseMin)) * this.spec.cruise;
        this.pitch = 0.85 + Math.random() * 0.4;       // "voz" da buzina deste motorista
        this.honker = Math.random() < 0.3;             // motorista estressado: buzina mais fácil
        this.blocked = 0;
        this.honks = 0;                                // buzinadas neste bloqueio (maximo 2; depois desvia)
        this.waitAfter = 0;                            // tempo esperando depois da 2a buzinada
        this.lat = 0; this.latTarget = 0; this.latRate = 2;   // deslocamento lateral da trajetoria (+ = esquerda) usado para desviar de obstaculos
        this.detour = null;                            // { ref, half, t, emergency } desvio em andamento
        this._roadW = 10;
        this.honkCd = Math.random() * 2;
        this.stuck = 0;
        this.reason = '';                              // por que está freando (debug/HUD)
        this.root = '';                                // causa raiz da espera (propagada pela fila)
        this._pt = { x: 0, z: 0 };
    }

    // ------------------------------------------------------------------ modos
    startRoute(x, z, d, lp = null) {
        this.route = new Route(x, z, d, lp);
        this.route.ensure(2);
    }

    // Estacionado = desligado, vazio e TRANCADO (roubar exige quebrar o vidro ou arrombar).
    park() {
        this.clearDeadDriver();
        this.mode = 'parked'; this.route = null;
        this.locked = true; this.driver = false;
        this.alarm = 0; this.hazard = false;
    }

    // Motorista baleado na cabine (Combat._cabinShot): morre ao volante — o carro para (largado, freando) e a BUZINA dispara sem parar
    // (a cabeça no volante) até alguém tirar o corpo (Game._yankDriver) ou o carro sair de cena (TrafficManager, explosão).
    killDriver() {
        if (this.driver === false || this.driverDead || this.controlled) return false;
        this.driverDead = true; this.driverHp = 0; this.mode = 'abandoned'; this.route = null; this.detour = null;
        this.horn = AudioFX.hornLoop(this.pitch);
        return true;
    }
    clearDeadDriver() { if (this.horn) { this.horn.stop(); this.horn = null; } this.driverDead = false; this.driverHp = undefined; }

    // O jogador largou o carro: fica abandonado no lugar.
    setControlled(v) {
        const was = this.controlled;
        super.setControlled(v);
        if (was && !v) { this.mode = 'abandoned'; this.route = null; this.driver = false; }      // largado na pista: vazio
        if (v) this.route = null;
    }

    // Reaprende a rota a partir da posição/direção atuais (após perseguição, p. ex.).
    reroute() {
        const f = this.body.getDirection(BABYLON.Axis.Z);
        const s = RoadNet.snapToLane(this.position.x, this.position.z, f.x, f.z);
        this.route = null;
        if (!s) return false;
        this.startRoute(s.point.x, s.point.z, s.d, s);
        if (this.route.pts.length < 2) { this.route = null; return false; }     // sem cruzamento à frente
        return true;
    }

    // ----------------------------------------------------------------- frame
    update(dt, env) {
        if (this.controlled) { this.syncVisual(dt); return; }
        if (this.burning > 0 || this.wrecked) {         // pegando fogo ou carcaça: freia e fica parado
            if (!this._resting()) this.driveTo(0, 0, dt, 6, 18);
            this.syncVisual(dt);
            return;
        }
        if (this.hold || this.mode === 'parked' || this.mode === 'abandoned') {   // hold: jogador está roubando este carro
            if (!this._resting()) this.driveTo(0, 0, dt, 6, 16);              // segura o carro parado (já parado: não toca na física)
        } else {
            this.aiUpdate(dt, env);
        }
        this.syncVisual(dt);
    }

    // Já parado (de verdade)? Escrever velocidade zero num corpo parado ACORDA ele no Havok: com isso nenhum carro estacionado dormia, e
    // cada um custava simulação, sincronização da matriz e reenvio do sprite a todo passo. Parado e quieto, a física fica intocada.
    _resting() {
        const v = this.velocity;
        if (v.x * v.x + v.z * v.z > 0.0025) { this.phys._dmRest = false; return false; }
        this.braking = true; this.accelerating = false;           // (como o driveTo(0) faria: parado segurando o freio)
        this.phys._dmRest = !(this._preStepFrames > 0);           // física pode pular a releitura deste corpo (ver Physics.init)
        return true;
    }

    aiUpdate(dt, env) {
        const T = Config.traffic;
        const p = this.position;
        if (!this.route && !this.reroute()) { this.driveTo(0, 0, dt, 6, 12); return; }
        const R = this.route;
        R.ensure(2);
        if (R.pts.length < 2) { this.route = null; this.driveTo(0, 0, dt, 6, 12); return; }   // sem cruzamento à frente: rota vazia
        R.trim();
        const u = R.progress(p.x, p.z);
        const v = this.forwardSpeed;

        // ---------------- direção (pure pursuit)
        const Ld = Math.max(3.5, Math.min(9, 3.2 + Math.abs(v) * 0.45));
        R.pointAt(u + Ld, this._pt);
        if (this.lat !== 0 || this.latTarget !== 0) {                                   // desvio: o alvo da perseguicao sai da faixa pela normal esquerda da rota
            const t2 = this._pt2 || (this._pt2 = { x: 0, z: 0 });
            R.pointAt(u + Ld + 1, t2);
            const tx = t2.x - this._pt.x, tz = t2.z - this._pt.z, tl = hypot(tx, tz) || 1;
            this._pt.x += (-tz / tl) * this.lat; this._pt.z += (tx / tl) * this.lat;
        }
        const f = this._fdir || (this._fdir = new BABYLON.Vector3());
        this.fwdToRef(f);                                        // (sem Vector3 novo nem matriz de mundo)
        let delta = Math.atan2(this._pt.x - p.x, this._pt.z - p.z) - Math.atan2(f.x, f.z);
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        const steer = Math.max(-1, Math.min(1, delta / 0.55));

        // ---------------- velocidade-alvo
        // Limite de velocidade pela via: rodovia rápida, avenida e ponte médias, estrada de terra e viela devagar (viatura em perseguição ignora).
        this._clsT = (this._clsT || 0) - dt;
        if (this._clsT <= 0) { this._clsT = 0.6; const n = RoadPlan.nearestRoadPoint(p.x, p.z, 14); this._clsMul = (n && TrafficCar.CLS_SPEED[n.edge.cls]) || 1; this._roadW = n ? n.edge.w : 10; }
        let vt = this.cruise * (this.ignoreSignals ? 1 : (this._clsMul || 1) * (Weather.cur ? Weather.cur.trafficMul : 1));       // chuva: motoristas mais cautelosos (viatura em perseguição ignora)
        let reason = '';
        let signal = 0;

        let jn = null;                                                  // próximo cruzamento ainda não deixado para trás
        this._inRound = false;
        for (let k = 0; k < R.junctions.length; k++) { const j = R.junctions[k]; if (R.cum[j.exitIdx] - u > -0.5) { jn = j; break; } }
        if (jn) {
            const dEntry = R.cum[jn.entryIdx] - u;
            const dStop = dEntry - (this.halfLen + 0.6); // centro do carro para o para-choque parar na linha

            // Seta: avisa a curva a ~22u do cruzamento e apaga ao sair dele.
            signal = (jn.turn !== 'straight' && dEntry < 22) ? (jn.turn === 'right' ? 1 : -1) : 0;

            // Curva (e rotatória, qualquer saída): reduz antes de entrar. Retorno: o "U" é fechado, bem devagar.
            const round = !!jn.inter.round;
            this._inRound = round && dEntry < 2;                         // no anel: sem desvio pela esquerda (seria em cima da ilha)
            if ((jn.turn !== 'straight' || round) && dEntry < 16) {
                const ts = jn.turn === 'uturn' && !round ? 0.62 : (round ? 1.1 : 1);
                vt = Math.min(vt, T.turnSpeed * ts * (this.turnMul || 1) + Math.max(0, dEntry - 5) * 0.45);
            }

            if (dStop > -0.4 && !this.ignoreSignals && !this.runsReds) {   // ainda não cruzou a linha de retenção (entregador apressado fura o sinal)
                const sig = env.signals.vehicle(jn.inter, jn.phase);
                const brakeDist = (v * v) / (2 * T.brake * 0.7);
                let must = false;
                if (sig.color === 'red') must = true;
                else if (sig.color === 'yellow') must = dStop > brakeDist * 1.05 + 0.5;   // dá pra parar com conforto?
                // O motivo só vale quando o limite realmente reduz a velocidade (não só "tem sinal lá na frente").
                const s = dStop <= 0.25 ? 0 : Math.sqrt(2 * T.brake * 0.7 * (dStop - 0.25));      // velocidade que ainda para na linha
                if (s < vt) {                                                                       // (sem closures por carro por quadro)
                    if (must) { vt = s; reason = 'sinal'; }
                    else if (round ? (dStop < 6 && this._ringBusy(jn, env)) : ((jn.turn === 'left' || jn.turn === 'uturn') && dStop < 7 && this._oncoming(jn, env))) { vt = s; reason = 'preferencial'; }
                    else if (dStop < 5 && this._exitBlocked(jn, env)) { vt = s; reason = 'saida'; }
                }
            }
        }

        // ---------------- obstáculos à frente (carros e pedestres), medidos ao longo da rota
        const look = 8 + Math.abs(v) * 1.2;
        let hitS = -1, hit = null, hitRoot = '';
        const near = this._near || (this._near = []);
        near.length = 0;
        const reach2 = (look + 6) * (look + 6);
        for (const o of env.grid.query(p.x, p.z, look + 6, TrafficCar._q1)) {
            if (o.ref === this || (o.layer || 0) !== (this.layer || 0)) continue;
            if (this.ramming && o.kind === 'car') continue;      // viatura em perseguição fura a fila (empurra o carro)
            const dx = o.x - p.x, dz = o.z - p.z;
            if (dx * dx + dz * dz < reach2) near.push(o);
        }
        if (near.length) {
            for (let s = this.halfLen + 0.2; s <= look && !hit; s += 1.5) {
                R.pointAt(u + s, this._pt);
                if (this.lat !== 0) { const t2 = this._pt2 || (this._pt2 = { x: 0, z: 0 }); R.pointAt(u + s + 0.6, t2); const tx = t2.x - this._pt.x, tz = t2.z - this._pt.z, tl = hypot(tx, tz) || 1; this._pt.x += (-tz / tl) * this.lat; this._pt.z += (tx / tl) * this.lat; }
                for (const o of near) {
                    const rad = o.kind === 'car' ? (this.halfW + o.hw) * (this.squeeze || 0.92) : (this.impatient ? 0.95 : 1.15);      // moto de entrega: passa no corredor entre os carros (e rente às pessoas)
                    const dx = o.x - this._pt.x, dz = o.z - this._pt.z;
                    if (dx * dx + dz * dz < rad * rad) { hit = o; hitS = s; break; }
                }
            }
        }
        if (hit) {
            const isCar = hit.kind === 'car';
            const centerDist = hitS + 1.0;
            const gap = centerDist - this.halfLen - (isCar ? hit.half : 0.4);
            const stopGap = isCar ? T.stopGap : 2.4;
            this._gap = gap;
            // Velocidade do da frente no sentido em que ando; limite = velocidade da qual ainda
            // dá para parar na folga restante frenando com conforto (60% do máximo).
            const lead = isCar ? Math.max(0, hit.vx * f.x + hit.vz * f.z) : 0;
            // Modelo de Gipps: maior velocidade que ainda permite parar se o da frente frear,
            // com tempo de reação de 0,5s e frenagem confortável b.
            const b = T.brake * 0.6, bt = b * 0.5;
            const lim = Math.max(0, -bt + Math.sqrt(bt * bt + lead * lead + 2 * b * Math.max(0, gap - stopGap)));
            if (lim < vt) {
                vt = lim; reason = isCar ? 'carro' : 'pedestre';
                // Causa raiz da espera: se o da frente está parado num semáforo, eu também espero
                // legitimamente (não buzino). Se ele está parado por um obstáculo de verdade, eu buzino.
                const lc = hit.ref;
                if (isCar && lc instanceof TrafficCar && lc.mode === 'drive' && !lc.controlled && !lc.hold) hitRoot = lc.root || (lc.reason || lc._asleep || Math.abs(lc.forwardSpeed) > 0.5 ? '' : 'carro');      // (parado sem motivo — viatura atendendo, carro enroscado: obstáculo de verdade, contorna)
                else hitRoot = isCar ? 'carro' : 'pedestre';
            }
            // Frenagem brusca (quase bati): buzina na hora.
            // (motoristas "buzineiros" buzinam com folga maior; os outros só quando é por um triz)
            if (v > 5 && gap < v * (this.honker ? 0.5 : 0.22) && this.honkCd <= 0 && this.honks < 2) { this.honks++; this.honk('freada', { v, gap, kind: hit.kind }); }

            // REFLEXO: em velocidade e vendo alguém/algo PARADO à frente que não dá mais para parar a tempo (ou perto demais), desvia
            // para o lado livre em vez de só frear (pedestre: acostamento da direita ou faixa contrária; carro: faixa contrária).
            if (!this.detour && !this.ignoreSignals && v > (this.impatient ? 3 : 6)) {
                const still = isCar ? lead < 1.5 : hypot(hit.vx || 0, hit.vz || 0) < 0.8;
                const stopD = (v * v) / (2 * T.brake * 0.6) + T.stopGap + 1.5;       // distancia de parada confortavel: se vai ficar curto, prefere desviar a frear em cima
                if (still && gap < stopD * 1.4 && this._startDetour(hit, env, u, true)) {
                    if (this.honkCd <= 0 && this.honks < 2) { this.honks++; this.honk('freada', { v, gap, kind: hit.kind }); }
                }
            }
            // APRESSADO (entregador): não fica atrás de ninguém mais lento — ultrapassa pela faixa contrária assim que ela está livre,
            // buzinando para o da frente; pedestre lento no caminho também é contornado sem esperar.
            if (this.impatient && !this.detour && gap < 14 && lim < this.cruise * 0.8 && (this._ovT = (this._ovT || 0) - dt) <= 0 && ((this._ovT = 0.35), this._startDetour(hit, env, u, true))) {
                if (this.honkCd <= 0) { this.honks = Math.min(1, this.honks); this.honk('freada', { v, gap, kind: hit.kind }); }
            }
        }

        // Desvio em andamento: some quando já passou do obstáculo (ou demorou demais).
        if (this.detour) {
            const d = this.detour, rp = d.ref && d.ref.position ? d.ref.position : null;
            d.t += dt;
            const along = rp ? (rp.x - p.x) * f.x + (rp.z - p.z) * f.z : -99;
            if (along < -(this.halfLen + d.half + 1.2) || d.t > 14) { this.detour = null; this.latTarget = 0; this.latRate = 1.6; this.honks = 0; this.waitAfter = 0; }
            else vt = Math.min(vt, d.emergency ? Math.max(v * 0.85, 6) : 8);        // contornando: devagar
        }
        const dl = this.latTarget - this.lat;
        if (Math.abs(dl) > 0.001) this.lat += Math.sign(dl) * Math.min(Math.abs(dl), this.latRate * dt * Math.max(1, Math.abs(dl)));

        this.reason = reason;
        this.signal = signal;
        this.root = (reason === 'carro' || reason === 'pedestre') ? hitRoot : reason;

        // ---------------- buzina por bloqueio prolongado (só por obstáculo real, não por fila de semáforo)
        const blockedNow = Math.abs(v) < 0.6 && (this.root === 'carro' || this.root === 'pedestre' || this.root === 'saida');
        this.blocked = blockedNow ? this.blocked + dt : Math.max(0, this.blocked - dt * 2);
        this.honkCd -= dt;
        if (this.blocked > (this.impatient ? 0.4 : T.honkAfter) && this.honkCd <= 0 && this.honks < 2) { this.honks++; this.honk('bloqueio', { v, blocked: this.blocked }); }
        // Buzinou 2x e continua preso por obstáculo real: manobra e contorna (tenta de novo a cada 0,5 s até haver espaço). Apressado: não
        // espera a segunda buzinada.
        if (blockedNow && (this.honks >= 2 || this.impatient) && !this.detour && hit) {
            this.waitAfter += dt;
            if (this.waitAfter > (this.impatient ? 0.5 : 1.3)) { this.waitAfter = (this.impatient ? 0.5 : 1.3) - 0.5; this._startDetour(hit, env, u, false); }
        } else if (!blockedNow && !this.detour) {
            this.waitAfter = 0;
            if (v > 4) this._freeT = (this._freeT || 0) + dt; else this._freeT = 0;
            if (this._freeT > 3) { this.honks = 0; this._freeT = 0; }         // seguiu viagem: zera a conta de buzinadas
        }

        // Preso há muito tempo sem motivo de semáforo: pede reposicionamento ao gerenciador.
        this.stuck = (Math.abs(v) < 0.3 && this.root !== 'sinal' && this.root !== 'preferencial') ? this.stuck + dt : 0;

        if (this.reverseT > 0) { this.reverseT -= dt; this.driveTo(-3, 0, dt, T.accel, T.brake); return; }
        this.driveTo(Math.max(0, vt), steer, dt, T.accel * (this.accelMul || 1), T.brake);
    }

    // Começa um desvio em volta do obstáculo `o`: escolhe o lado livre (pedestre: direita curta, depois esquerda; carro: esquerda, na faixa
    // contrária, se estiver livre). Retorna true se achou espaço.
    _startDetour(o, env, u, emergency) {
        if (this._inRound) return false;
        const W = this._roadW || 10, left = Math.min(3.4, W * 0.34), right = -Math.min(1.9, W * 0.19);
        const cands = o.kind === 'car' ? [left] : (emergency ? [right, left] : [left, right]);
        for (const off of cands) {
            if (!this._pathClear(off, o, env, u)) continue;
            this.detour = { ref: o.ref, half: o.kind === 'car' ? o.half : 0.5, t: 0, emergency };
            if (!emergency && (this._gap === undefined || this._gap < 3.2)) this.reverseT = 1.0;      // colado no obstaculo: da uma re curta para ter espaco de contornar
            this.latTarget = off;
            this.latRate = emergency ? 5 : 2.4;
            return true;
        }
        return false;
    }

    // O caminho deslocado `off` (esquerda +) está livre de outros obstáculos por ~30 u (inclui carros vindo no sentido contrário)?
    _pathClear(off, hitObj, env, u) {
        const R = this.route, T = this._pt3 || (this._pt3 = { x: 0, z: 0 }), T2 = this._pt4 || (this._pt4 = { x: 0, z: 0 });
        for (let s = this.halfLen; s <= 30; s += 2) {
            R.pointAt(u + s, T); R.pointAt(u + s + 0.6, T2);
            const tx = T2.x - T.x, tz = T2.z - T.z, tl = hypot(tx, tz) || 1;
            const px = T.x + (-tz / tl) * off, pz = T.z + (tx / tl) * off;
            for (const o of env.grid.query(px, pz, 50, TrafficCar._q2)) {                // (inclui quem chega em 1,2 s, até ~40 m/s)
                if (o.ref === this || o === hitObj || o.ref === hitObj.ref || (o.layer || 0) !== (this.layer || 0)) continue;
                const rad = o.kind === 'car' ? (this.halfW + o.hw) * 0.95 : 1.2;
                for (const k of (o.kind === 'car' ? [0, 1.2] : [0])) {                        // posição agora e daqui a 1,2 s (carro vindo de frente)
                    const dx = o.x + (o.vx || 0) * k - px, dz = o.z + (o.vz || 0) * k - pz;
                    if (dx * dx + dz * dz < rad * rad) return false;
                }
            }
        }
        return true;
    }

    // Há carro vindo no sentido contrário e perto do cruzamento (esquerda deve esperar)?
    _oncoming(jn, env) {
        const d = jn.d, C = jn.inter;
        for (const o of env.grid.query(C.x + d.dx * 11, C.z + d.dz * 11, 20, TrafficCar._q3)) {
            if (o.kind !== 'car' || o.ref === this || (o.layer || 0) !== (this.layer || 0)) continue;
            const along = (o.x - C.x) * d.dx + (o.z - C.z) * d.dz;      // + = à frente do centro, no meu sentido
            const lat = Math.abs((o.x - C.x) * d.dz - (o.z - C.z) * d.dx);
            if (along < -3 || along > 26 || lat > 4.8) continue;
            const towardMe = o.vx * d.dx + o.vz * d.dz;                   // < 0: vindo na minha direção
            if (towardMe < -2) return true;
        }
        return false;
    }

    // ROTATÓRIA: há carro no anel vindo pela esquerda (anti-horário) a até ~115° antes da minha entrada (th1), ou em cima dela?
    // Quem já está no anel tem a preferência.
    _ringBusy(jn, env) {
        const Rd = jn.inter.round, th1 = jn.th1 === undefined ? 0 : jn.th1, TAU = Math.PI * 2;
        const rr = (Rd.R + Rd.r) / 2, far = Math.min(2.0, 16 / rr), near = Math.min(0.6, 6 / rr);      // janela por distância no anel (praça grande: ~16 u antes)
        for (const o of env.grid.query(Rd.cx, Rd.cz, Rd.R + 3, TrafficCar._q3)) {
            if (o.kind !== 'car' || o.ref === this || (o.layer || 0) !== (this.layer || 0)) continue;
            const rx = o.x - Rd.cx, rz = o.z - Rd.cz, r = hypot(rx, rz);
            if (r < Rd.r || r > Rd.R - 0.3) continue;                                  // fora do anel (esperando na entrada, ou já saindo)
            let up = th1 - Math.atan2(rz, rx);                                         // quanto ele ainda gira até a minha entrada
            up -= Math.floor(up / TAU) * TAU;
            if (up > TAU - 0.4) return true;                                          // passando pela minha entrada agora
            if (up > far) continue;
            const tang = (-rz * (o.vx || 0) + rx * (o.vz || 0)) / (r || 1);              // velocidade no sentido do anel
            if (tang > 0.8 || up < near) return true;
        }
        return false;
    }

    // A faixa de saída do cruzamento está ocupada (carro parado ou quase, onde o meu ainda não caberia)? Não entra na "caixa" sem
    // lugar do outro lado: senão fica no meio do cruzamento e trava quem cruza.
    _exitBlocked(jn, env) {
        const X = this.route.pts[jn.exitIdx], d = jn.dOut, room = 2 * this.halfLen + 4;
        for (const o of env.grid.query(X.x + d.dx * room / 2, X.z + d.dz * room / 2, room / 2 + 5, TrafficCar._q3)) {
            if (o.kind !== 'car' || o.ref === this || (o.layer || 0) !== (this.layer || 0)) continue;
            const along = (o.x - X.x) * d.dx + (o.z - X.z) * d.dz;
            const lat = Math.abs((o.x - X.x) * d.dz - (o.z - X.z) * d.dx);
            if (along > -1 && along < room && lat < 1.9 && hypot(o.vx, o.vz) < 3) return true;
        }
        return false;
    }

    // why: 'bloqueio' (ficou parado com a via livre) | 'freada' (precisou frear forte).
    honk(why = 'bloqueio', info = {}) {
        this.honkCd = this.honks === 1 ? 1.8 : Config.traffic.honkCooldown;          // 1a buzinada: a 2a vem logo (sao no maximo duas)
        const p = this.position;
        AudioFX.honk(p.x, p.z, this.pitch);
        this.traffic.onHonk(this, why, info);
    }
}

// Multiplicador da velocidade de cruzeiro por classe de via.
TrafficCar.CLS_SPEED = { hwy: 1.5, ave: 1.15, bridge: 1.2, city: 1.0, isl: 0.9, dirt: 0.62, fav: 0.5 };
// Listas de consulta à grade de obstáculos (reaproveitadas: sem lixo por quadro). Uma por ponto de uso.
TrafficCar._q1 = []; TrafficCar._q2 = []; TrafficCar._q3 = [];
