// ============================================================================
// CharacterRig — esqueleto procedural do personagem (visto de cima) + todos os
// clipes de animação. Cada frame é uma POSE (números) -> lista de primitivas
// 3D -> SpriteBaker -> pixel art. Animar = escrever poses, não pixels.
//
// Modelo (unidades ≈ metros, escala "cartoon" com cabeça e ombros grandes):
//   ombros ±0,5 | cabeça r=0,27 | braço 0,42+0,40 | perna 0,5+0,5
//   +Z = frente do personagem, +X = lado direito dele.
// Braços e pernas usam IK de 2 ossos: a pose só diz ONDE ficam mãos e pés.
// ============================================================================

const CharacterRig = {
    // Escala global do boneco (proporção "cartoon": maior que o real p/ ler bem em pixels).
    SCALE: 1.1,

    // Slots de rampa de cor (a paleta de cada variante define a cor de cada slot).
    MAT: { skin: 1, hair: 2, shirt: 3, pants: 4, shoes: 5, sleeve: 6, metal: 7, wood: 8, dark: 9, cap: 10, gold: 11, forearm: 12, flash: 13, blood: 14 },

    // Pose neutra (em pé, braços caídos).
    BASE: {
        bob: 0, lean: 0, torsoYaw: 0, hipYaw: 0, headYaw: 0,
        handR: [0.6, 0.74, 0.02], handL: [-0.6, 0.74, 0.02],
        footR: [0.2, 0.1, 0], footL: [-0.2, 0.1, 0],
        weapon: null,            // { kind, dir:[x,y,z], flash }
        offset: [0, 0, 0], scale: 1,
        lying: false,            // true = caído no chão (morto): ignora o resto da pose
        // Rotação do CORPO INTEIRO (cambalhota, ragdoll, moto inclinada) em torno de `pivot`:
        // pitch = para a frente (+) / para trás (−), roll = para o lado (+ = topo vai para −X).
        pitch: 0, roll: 0, pivot: [0, 1.0, 0],
    },

    // ---------------------------------------------------------------- vetores
    _add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; },
    _sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; },
    _mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; },
    _dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
    _len(a) { return hypot(a[0], a[1], a[2]); },
    _norm(a) { const l = this._len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },

    // IK de 2 ossos: devolve { elbow, end } para um membro S -> end (comprimentos L1, L2).
    // `pole` diz para que lado o cotovelo/joelho dobra.
    _ik(S, target, L1, L2, pole) {
        const d0 = this._sub(target, S);
        let d = Math.max(0.05, this._len(d0));
        const maxD = L1 + L2 - 0.002;
        let end = target;
        if (d > maxD) { end = this._add(S, this._mul(d0, maxD / d)); d = maxD; }
        const u = this._norm(this._sub(end, S));
        const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
        const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
        let p = this._sub(pole, this._mul(u, this._dot(pole, u)));
        if (this._len(p) < 1e-4) p = [0, 1, 0];
        p = this._norm(p);
        return { elbow: this._add(this._add(S, this._mul(u, a)), this._mul(p, h)), end };
    },

    // Bolsa do jogador (ver Bags): 'cross' = mala transversal (alça na diagonal do peito, bolsa no quadril esquerdo),
    // 'pack' = mochila de couro nas costas, 'tactical' = mochila tática maior, escura, com bolsos laterais.
    _bag(P, kind, tc, ty, wide) {
        const M = this.MAT, B = SpriteBaker, rot = (p) => SpriteBaker._rotY(p, ty), at = (p) => this._add(tc, rot(p));
        if (kind === 'cross') {
            P.push(B.capsule(M.dark, at([0.36 * wide, 0.3, 0.27]), at([-0.38 * wide, -0.32, 0.27]), 0.045));    // alça (frente)
            P.push(B.capsule(M.dark, at([0.36 * wide, 0.3, -0.27]), at([-0.38 * wide, -0.32, -0.27]), 0.045));  // alça (costas)
            const bc = at([-0.5 * wide, -0.4, 0.02]);
            P.push(B.box(M.wood, bc, [0.09, 0.17, 0.22], ty, 0.05));
            P.push(B.box(M.gold, this._add(bc, rot([-0.08, 0.05, 0])), [0.02, 0.04, 0.05], ty, 0.01));    // fivela
            return;
        }
        const big = kind === 'tactical';
        const bc = at([0, big ? 0.02 : 0.04, big ? -0.53 : -0.47]);
        P.push(B.box(big ? M.dark : M.wood, bc, big ? [0.4 * wide, 0.46, 0.21] : [0.32 * wide, 0.36, 0.16], ty, big ? 0.06 : 0.09));
        // alças por cima dos ombros
        for (const s of [1, -1]) P.push(B.capsule(M.dark, at([s * 0.28 * wide, 0.36, -0.2]), at([s * 0.3 * wide, -0.12, -0.24]), 0.05));
        if (big) {
            for (const s of [1, -1]) P.push(B.box(M.pants, this._add(bc, rot([s * 0.42 * wide, -0.1, 0])), [0.08, 0.2, 0.15], ty, 0.04));   // bolsos laterais
            P.push(B.box(M.pants, this._add(bc, rot([0, -0.12, -0.2])), [0.26 * wide, 0.18, 0.06], ty, 0.04));                         // bolso traseiro
            P.push(B.box(M.metal, this._add(bc, rot([0, 0.47, 0])), [0.3 * wide, 0.03, 0.12], ty, 0.01));                              // tampa
        } else {
            P.push(B.box(M.wood, this._add(bc, rot([0, -0.12, -0.16])), [0.22 * wide, 0.14, 0.05], ty, 0.04));                         // bolso de fora
            P.push(B.box(M.gold, this._add(bc, rot([0, 0.02, -0.21])), [0.16 * wide, 0.015, 0.01], ty, 0.005));                        // zíper
        }
    },

    // ----------------------------------------------------- pose -> primitivas
    // look: { hair: 'short'|'long'|'cap'|'police', build: 1 (largura dos ombros), jacket: bool }
    build(pose, look = {}) {
        if (pose.lying) return this._buildLying(look);
        if (pose.swim) return this._buildSwim(pose, look);
        if (pose.riderless) return this._finish(this._bike(pose), pose);        // só a bike/moto (estacionada ou caída)
        const M = this.MAT, B = SpriteBaker, rot = (p, a) => SpriteBaker._rotY(p, a);
        const P = [];
        const lean = pose.lean;
        const ty = pose.torsoYaw, hipY = pose.hipYaw;
        const wide = look.build || 1;

        // O quadril desce quando as pernas se afastam (a perna esticada não alcança o chão
        // de outro jeito). Comprimento total da perna = 2 × LEG.
        const LEG = 0.43;
        // (só pés apoiados no chão contam; pé levantado, como num chute, não derruba o corpo)
        const grounded = (f, hx) => (f[1] < 0.3 ? hypot(f[0] - hx, f[2]) : 0);
        const spread = Math.max(grounded(pose.footR, 0.2), grounded(pose.footL, -0.2));
        const reach = LEG * 2 * 0.97;
        const hipH = Math.max(0.5, Math.sqrt(Math.max(0, reach * reach - spread * spread)) + 0.16);
        const bob = pose.bob + (hipH - 0.99);

        // Quadril + cintura.
        const hip = [0, 0.95 + bob, lean * 0.25];
        P.push(B.ellipsoid(M.pants, hip, [0.38 * wide, 0.3, 0.26], hipY));

        // Tronco (camisa): mais fundo que a cabeça, para aparecer à frente e atrás dela.
        const tc = [0, 1.28 + bob, lean * 0.8];
        P.push(B.ellipsoid(M.shirt, tc, [0.5 * wide, 0.4, 0.34], ty));
        if (look.vest) {
            // Colete balístico com placas (por cima da camisa): volume e um tom diferente no peito e nas costas.
            P.push(B.ellipsoid(M.metal, this._add(tc, rot([0, 0.0, 0.06], ty)), [0.44 * wide, 0.34, 0.31], ty));
            P.push(B.ellipsoid(M.dark, this._add(tc, rot([0, -0.12, 0.2], ty)), [0.3 * wide, 0.1, 0.16], ty));   // bolsos de carregador
        }
        if (look.belt) P.push(B.ellipsoid(M.dark, [0, 1.0 + bob, lean * 0.4], [0.4 * wide, 0.06, 0.28], hipY * 0.5 + ty * 0.5));
        if (look.box) {
            // Baú térmico de entrega nas costas (cor `cap` da variante: vermelho) com faixa clara na tampa e alças escuras.
            const bc = this._add(tc, rot([0, 0.2, -0.58], ty));
            P.push(B.box(M.cap, bc, [0.44, 0.4, 0.3], ty, 0.07));
            P.push(B.box(M.gold, this._add(bc, [0, 0.4, 0]), [0.3, 0.02, 0.07], ty, 0.01));
            P.push(B.capsule(M.dark, this._add(tc, rot([0.3, 0.32, -0.22], ty)), this._add(tc, rot([0.32, -0.1, -0.2], ty)), 0.05));
            P.push(B.capsule(M.dark, this._add(tc, rot([-0.3, 0.32, -0.22], ty)), this._add(tc, rot([-0.32, -0.1, -0.2], ty)), 0.05));
        }
        if (look.bag) this._bag(P, look.bag, tc, ty, wide);
        const shR = this._add(tc, rot([0.54 * wide, 0.12, 0], ty));
        const shL = this._add(tc, rot([-0.54 * wide, 0.12, 0], ty));
        P.push(B.sphere(M.sleeve, shR, 0.2));
        P.push(B.sphere(M.sleeve, shL, 0.2));

        // Braços (IK): cotovelo dobra para trás e levemente para fora.
        const arm = (S, hand, side) => {
            const r = this._ik(S, hand, 0.42, 0.4, [side * 0.25, -0.5, -0.85]);
            P.push(B.capsule(M.sleeve, S, r.elbow, 0.14));
            P.push(B.capsule(M.forearm, r.elbow, r.end, 0.115));
            P.push(B.sphere(M.skin, r.end, 0.125));
            return r.end;
        };
        const handR = arm(shR, pose.handR, 1);
        const handL = arm(shL, pose.handL, -1);

        // Pernas (IK): joelho dobra para frente.
        const leg = (hx, foot) => {
            const H = [hx * wide, 0.92 + bob, lean * 0.2];
            const ankle = [foot[0], foot[1] + 0.06, foot[2]];
            const r = this._ik(H, ankle, LEG, LEG, [0, 0.35, 1]);
            P.push(B.capsule(M.pants, H, r.elbow, 0.17));
            P.push(B.capsule(M.pants, r.elbow, r.end, 0.14));
            // O sapato acompanha o fim REAL da perna (que respeita o alcance do osso).
            P.push(B.ellipsoid(M.shoes, [r.end[0], r.end[1] + 0.01, r.end[2] + 0.12], [0.16, 0.1, 0.3], 0));
        };
        leg(0.2, pose.footR);
        leg(-0.2, pose.footL);

        // Cabeça "chibi" (estilo DKC): grande o bastante para o rosto e o cabelo lerem em
        // poucos pixels. Fica um pouco à frente da linha dos ombros, como vista de cima.
        const HR = 0.31;
        const hc = [0, 1.84 + bob, lean * 1.1 + 0.08];
        const hyaw = pose.headYaw + ty * 0.6;
        P.push(B.sphere(M.skin, hc, HR));
        P.push(B.sphere(M.skin, this._add(hc, rot([HR, -0.02, 0], hyaw)), 0.075));
        P.push(B.sphere(M.skin, this._add(hc, rot([-HR, -0.02, 0], hyaw)), 0.075));
        P.push(B.sphere(M.skin, this._add(hc, rot([0, -0.04, HR], hyaw)), 0.06));
        const hairC = this._add(hc, rot([0, 0.1, -0.15], hyaw));
        if (look.hair === 'helmet') {
            // Capacete (tropa de elite/exército): calota grande que desce pela nuca e pelas laterais.
            P.push(B.ellipsoid(M.cap, this._add(hc, rot([0, 0.1, -0.04], hyaw)), [0.38, 0.27, 0.37], hyaw));
            P.push(B.ellipsoid(M.cap, this._add(hc, rot([0, -0.02, -0.2], hyaw)), [0.36, 0.2, 0.26], hyaw));
            if (look.mask) {
                // Balaclava + viseira escura cobrindo o rosto.
                P.push(B.ellipsoid(M.dark, this._add(hc, rot([0, -0.1, 0.17], hyaw)), [0.27, 0.15, 0.17], hyaw));
                P.push(B.ellipsoid(M.dark, this._add(hc, rot([0, 0.08, 0.27], hyaw)), [0.26, 0.07, 0.06], hyaw));
            }
        } else if (look.hair === 'cap' || look.hair === 'police') {
            P.push(B.ellipsoid(M.cap, this._add(hc, rot([0, 0.12, -0.06], hyaw)), [0.35, 0.22, 0.33], hyaw));
            P.push(B.ellipsoid(M.cap, this._add(hc, rot([0, 0.03, 0.3], hyaw)), [0.24, 0.05, 0.14], hyaw));   // aba
            if (look.hair === 'police') P.push(B.sphere(M.gold, this._add(hc, rot([0, 0.3, 0.1], hyaw)), 0.06));
        } else {
            P.push(B.ellipsoid(M.hair, hairC, [0.33, 0.22, 0.27], hyaw));
            if (look.hair === 'long') {
                P.push(B.ellipsoid(M.hair, this._add(hc, rot([0, 0.0, -0.22], hyaw)), [0.31, 0.22, 0.26], hyaw));
                P.push(B.ellipsoid(M.hair, this._add(hc, rot([0, -0.16, -0.3], hyaw)), [0.27, 0.17, 0.24], hyaw));
            }
        }

        // Arma na mão direita.
        if (pose.weapon) this._weapon(P, pose.weapon, handR);

        // Montado numa bicicleta/moto: o veículo vem junto no mesmo sprite.
        if (pose.ride) P.push(...this._bike(pose));

        return this._finish(P, pose);
    },

    // Nadador de crawl visto de cima (+Z = para onde nada), com a METADE DE BAIXO DO CORPO NA ÁGUA: só aparecem o dorso
    // (metade do tronco, baixo), a cabeça, os braços (um fora d'água recuperando, o outro puxando) e os pés batendo,
    // com um respingo de espuma. A fase vem de pose.swimT (0..1 = um ciclo de braçadas).
    _buildSwim(pose, look) {
        const M = this.MAT, B = SpriteBaker, rot = (p, a) => SpriteBaker._rotY(p, a), P = [];
        const wide = look.build || 1, T = pose.swimT || 0, a = 2 * Math.PI * T;
        const yawBody = 0.16 * Math.sin(a);                                            // o corpo "rola" um pouco a cada braçada

        // Dorso: só a metade de cima do tronco aflora (elipsoide baixo e curto).
        P.push(B.ellipsoid(M.shirt, [0, 0.05, -0.12], [0.5 * wide, 0.2, 0.36], yawBody));
        P.push(B.ellipsoid(M.shirt, [0, 0.0, -0.55], [0.34 * wide, 0.1, 0.26], yawBody * 0.6));      // lombar saindo da água
        const sh = (side) => this._add([side * 0.5 * wide, 0.1, 0.2], [0, 0, 0]);
        P.push(B.sphere(M.sleeve, sh(1), 0.19));
        P.push(B.sphere(M.sleeve, sh(-1), 0.19));

        // Braços: u = fase do braço; 0..0.5 recuperação (no ar, para a frente), 0.5..1 puxada (debaixo d'água, para trás).
        const arm = (side, off) => {
            const u = (T + off) % 1, S = sh(side);
            let target, pole;
            if (u < 0.5) {
                const k = u / 0.5;
                target = [side * (0.52 + 0.16 * Math.sin(Math.PI * k)), 0.06 + 0.5 * Math.sin(Math.PI * k), -0.1 + 1.15 * k];
                pole = [side * 0.7, 1, -0.1];
            } else {
                const k = (u - 0.5) / 0.5;
                target = [side * (0.7 - 0.2 * k), 0.14, 1.0 - 1.15 * k];
                pole = [side * 0.6, -0.2, -0.3];
            }
            const r = this._ik(S, target, 0.42, 0.4, pole);
            const air = u < 0.5;
            P.push(B.capsule(M.sleeve, S, r.elbow, 0.14));
            P.push(B.capsule(M.forearm, r.elbow, r.end, 0.115));
            P.push(B.sphere(M.skin, r.end, 0.13));
            if (air) P.push(B.ellipsoid(M.metal, [r.end[0], 0.0, r.end[2] - 0.05], [0.16, 0.025, 0.2], 0, { flat: true }));   // pingos
        };
        arm(1, 0); arm(-1, 0.5);

        // Cabeça de lado, respirando entre as braçadas (vira para o braço que recupera); só o topo/cabelo e a lateral.
        const turn = Math.sin(a) * 0.9, HR = 0.31, hc = [0.0, 0.2, 0.62];
        P.push(B.sphere(M.skin, hc, HR));
        P.push(B.sphere(M.skin, this._add(hc, rot([HR, -0.04, 0], turn)), 0.075));
        P.push(B.sphere(M.skin, this._add(hc, rot([-HR, -0.04, 0], turn)), 0.075));
        if (look.hair === 'helmet') P.push(B.ellipsoid(M.cap, this._add(hc, [0, 0.1, -0.04]), [0.38, 0.27, 0.37], 0));
        else if (look.hair === 'cap' || look.hair === 'police') P.push(B.ellipsoid(M.cap, this._add(hc, [0, 0.12, -0.06]), [0.35, 0.22, 0.33], 0));
        else P.push(B.ellipsoid(M.hair, this._add(hc, rot([0, 0.1, -0.12], turn)), [0.33, 0.22, 0.28], turn));

        // Pernas: só os pés (e a canela quando sobem) batem na superfície, alternados, com espuma.
        const kick = (side, ph) => {
            const s = Math.sin(2 * a + ph), up = Math.max(0, s);
            const foot = [side * 0.22, 0.08 + 0.2 * up, -1.05 - 0.1 * s];
            P.push(B.ellipsoid(M.metal, [foot[0], 0.0, foot[2] - 0.2], [0.2, 0.025, 0.16 + 0.12 * up], 0, { flat: true }));     // espuma
            {
                P.push(B.capsule(M.pants, [side * 0.17, 0.0, -0.8], foot, 0.12));
                P.push(B.ellipsoid(M.shoes, [foot[0], foot[1] + 0.02, foot[2] - 0.08], [0.15, 0.09, 0.28], 0));
            }
        };
        kick(1, 0); kick(-1, Math.PI);
        return this._finish(P, Object.assign({}, pose, { pitch: 0, roll: 0, offset: [0, 0, 0], scale: 1 }));
    },

    // Fecha o modelo: gira o corpo inteiro (pitch/roll) e aplica escala e deslocamento globais.
    _finish(P, pose) {
        if (pose.pitch || pose.roll) this._rotate(P, pose.pitch || 0, pose.roll || 0, pose.pivot || [0, 1.0, 0]);
        // Escala do personagem (× encolhimento ao entrar no carro) e deslocamento.
        const k = pose.scale * this.SCALE, o = pose.offset;
        const tf = (p) => [p[0] * k + o[0], p[1] * k + o[1], p[2] * k + o[2]];
        for (const q of P) {
            if (q.t === 's') { q.c = tf(q.c); q.r *= k; }
            else if (q.t === 'c') { q.a = tf(q.a); q.b = tf(q.b); q.r *= k; }
            else if (q.t === 'e') { q.c = tf(q.c); q.r = q.r.map((v) => v * k); }
            else { q.c = tf(q.c); q.h = q.h.map((v) => v * k); q.bevel *= k; }
        }
        return P;
    },

    // Rotação 3D de todas as primitivas: primeiro pitch (em X: para a frente +), depois roll (em Z).
    // Esferas e cápsulas giram exatas; elipsoides e caixas só têm giro em Y no baker, então giram o CENTRO e
    // elipsoides ganham os semieixos da elipse girada (boa aproximação em poucos pixels).
    _rotate(P, pitch, roll, pv) {
        const cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
        const rp = (p) => {
            const x = p[0] - pv[0], y = p[1] - pv[1], z = p[2] - pv[2];
            const y1 = y * cp - z * sp, z1 = y * sp + z * cp;
            return [x * cr - y1 * sr + pv[0], x * sr + y1 * cr + pv[1], z1 + pv[2]];
        };
        for (const q of P) {
            if (q.t === 's') q.c = rp(q.c);
            else if (q.t === 'c') { q.a = rp(q.a); q.b = rp(q.b); }
            else if (q.t === 'e') {
                q.c = rp(q.c);
                const [rx, ry, rz] = q.r;
                const ry1 = hypot(ry * cp, rz * sp), rz1 = hypot(ry * sp, rz * cp);
                q.r = [hypot(rx * cr, ry1 * sr), hypot(rx * sr, ry1 * cr), rz1];
            } else q.c = rp(q.c);
        }
    },

    // Corpo caído (morto), visto de cima: tronco, pernas e braços jogados e uma poça de sangue.
    // A cabeça fica no lado "frente" (+Z) do sprite.
    _buildLying(look) {
        const M = this.MAT, B = SpriteBaker, P = [];
        const wide = look.build || 1;
        P.push(B.ellipsoid(M.blood, [0.2, 0.04, 0.0], [1.0, 0.04, 0.82], 0.3, { flat: true }));          // poça
        P.push(B.capsule(M.pants, [0.2, 0.2, -0.45], [0.38, 0.16, -1.4], 0.16));                            // pernas
        P.push(B.capsule(M.pants, [-0.2, 0.2, -0.45], [-0.3, 0.16, -1.35], 0.16));
        P.push(B.ellipsoid(M.shoes, [0.42, 0.14, -1.58], [0.16, 0.1, 0.3], -0.15));
        P.push(B.ellipsoid(M.shoes, [-0.33, 0.14, -1.52], [0.16, 0.1, 0.3], 0.1));
        P.push(B.ellipsoid(M.shirt, [0, 0.27, 0.05], [0.5 * wide, 0.22, 0.52], 0.1));                       // tronco
        // Braços jogados para os lados.
        P.push(B.sphere(M.sleeve, [0.52 * wide, 0.3, 0.4], 0.19));
        P.push(B.capsule(M.forearm, [0.52 * wide, 0.3, 0.4], [1.1 * wide, 0.15, 0.1], 0.12));
        P.push(B.sphere(M.skin, [1.18 * wide, 0.13, 0.04], 0.12));
        P.push(B.sphere(M.sleeve, [-0.52 * wide, 0.3, 0.4], 0.19));
        P.push(B.capsule(M.forearm, [-0.52 * wide, 0.3, 0.4], [-0.95 * wide, 0.15, 0.78], 0.12));
        P.push(B.sphere(M.skin, [-1.0 * wide, 0.13, 0.86], 0.12));
        // Cabeça.
        P.push(B.sphere(M.skin, [0.05, 0.33, 0.8], 0.31));
        if (look.hair === 'police' || look.hair === 'cap' || look.hair === 'helmet') P.push(B.ellipsoid(M.cap, [0.05, 0.42, 0.72], [0.34, 0.2, 0.3], 0.2));
        else P.push(B.ellipsoid(M.hair, [0.05, 0.42, 0.7], [0.33, 0.22, 0.27], 0.2));
        const k = this.SCALE;
        for (const q of P) {
            const sc = (p) => [p[0] * k, p[1] * k, p[2] * k];
            if (q.t === 's') { q.c = sc(q.c); q.r *= k; }
            else if (q.t === 'c') { q.a = sc(q.a); q.b = sc(q.b); q.r *= k; }
            else { q.c = sc(q.c); q.r = q.r.map((v) => v * k); }
        }
        return P;
    },

    // Armas: modelos curtinhos ancorados na mão direita, apontando para `dir`.
    _weapon(P, w, hand) {
        const M = this.MAT, B = SpriteBaker;
        const dir = this._norm(w.dir || [0, 0, 1]);
        const yaw = Math.atan2(dir[0], dir[2]);
        const at = (d) => this._add(hand, this._mul(dir, d));
        const flash = (d) => { if (w.flash) P.push(B.sphere(M.flash, at(d), 0.2, { flat: true })); };

        // Armas são maiores que o real para lerem bem em poucos pixels (como o resto do boneco).
        switch (w.kind) {
            case 'pistol':
                P.push(B.box(M.metal, this._add(at(0.2), [0, 0.06, 0]), [0.075, 0.085, 0.26], yaw, 0.05));
                P.push(B.box(M.dark, this._add(at(0.02), [0, -0.04, 0]), [0.07, 0.13, 0.085], yaw, 0.04));
                P.push(B.box(M.dark, this._add(at(0.44), [0, 0.1, 0]), [0.03, 0.04, 0.03], yaw, 0.02));   // alça de mira
                flash(0.62);
                break;
            case 'smg':
                P.push(B.box(M.dark, this._add(at(0.22), [0, 0.06, 0]), [0.095, 0.1, 0.4], yaw, 0.05));
                P.push(B.box(M.metal, this._add(at(0.46), [0, 0.07, 0]), [0.05, 0.06, 0.2], yaw, 0.03));
                P.push(B.box(M.dark, this._add(at(-0.25), [0, 0.03, 0]), [0.07, 0.09, 0.18], yaw, 0.04));
                P.push(B.box(M.metal, this._add(at(0.14), [0, -0.14, 0]), [0.055, 0.15, 0.065], yaw, 0.04));
                flash(0.8);
                break;
            case 'shotgun':
                P.push(B.capsule(M.metal, this._add(at(-0.05), [0, 0.07, 0]), this._add(at(0.85), [0, 0.07, 0]), 0.075));
                P.push(B.box(M.wood, this._add(at(-0.32), [0, 0.02, 0]), [0.085, 0.1, 0.3], yaw, 0.05));
                P.push(B.box(M.wood, this._add(at(0.42), [0, 0.0, 0]), [0.095, 0.085, 0.2], yaw, 0.05));
                flash(1.12);
                break;
            case 'bat':
                P.push(B.capsule(M.wood, this._add(hand, this._mul(dir, -0.12)), this._add(hand, this._mul(dir, 1.08)), 0.075));
                P.push(B.sphere(M.wood, this._add(hand, this._mul(dir, 1.02)), 0.12));
                break;
        }
    },

    // ------------------------------------------------------- interpolação
    _lerp(a, b, t) {
        if (typeof a === 'number') return a + (b - a) * t;
        if (Array.isArray(a)) return a.map((v, i) => this._lerp(v, b[i], t));
        return t < 0.5 ? a : b;
    },

    _lerpWeapon(a, b, t) {
        if (!a && !b) return null;
        if (!a) return t >= 0.5 ? b : null;
        if (!b) return t < 0.5 ? a : null;
        return { kind: t < 0.5 ? a.kind : b.kind, dir: this._lerp(a.dir, b.dir, t), flash: t < 0.5 ? a.flash : b.flash };
    },

    // Mistura duas poses completas.
    lerpPose(a, b, t) {
        const out = {};
        for (const k of Object.keys(this.BASE)) {
            out[k] = k === 'weapon' ? this._lerpWeapon(a[k], b[k], t) : this._lerp(a[k], b[k], t);
        }
        return out;
    },

    // Amostra uma lista de keyframes { t, ...overrides } (t em 0..1) com easing suave.
    sample(keys, t, loop = false) {
        const full = keys.map((k) => Object.assign({}, this.BASE, k));
        if (loop) t = ((t % 1) + 1) % 1;
        else t = Math.max(0, Math.min(1, t));
        let i = 0;
        while (i < full.length - 2 && t > full[i + 1].t) i++;
        const a = full[i], b = full[i + 1];
        let u = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
        u = Math.max(0, Math.min(1, u));
        u = u * u * (3 - 2 * u);
        return this.lerpPose(a, b, u);
    },

    // ------------------------------------------------------------- andar etc.
    // Ciclo de locomoção. gait: 'idle' | 'walk' | 'run'. t em 0..1 (loop).
    gait(gait, t) {
        const p = 2 * Math.PI * t, s = Math.sin(p), c = Math.cos(p);
        const B = this.BASE;
        const pose = Object.assign({}, B, { offset: [0, 0, 0] });

        if (gait === 'idle') {
            pose.bob = Math.sin(p) * 0.012;
            pose.headYaw = Math.sin(p) * 0.12;
            pose.handR = [0.6, 0.74 + Math.sin(p) * 0.015, 0.02];
            pose.handL = [-0.6, 0.74 + Math.sin(p + 1) * 0.015, 0.02];
            pose.footR = [0.22, 0.1, 0.02];
            pose.footL = [-0.22, 0.1, -0.02];
        } else if (gait === 'walk') {
            const A = 0.4;
            pose.bob = Math.abs(c) * 0.045 - 0.02;
            pose.lean = 0.03;
            pose.torsoYaw = s * 0.14;
            pose.hipYaw = -s * 0.1;
            pose.headYaw = -s * 0.05;
            pose.footR = [0.2, 0.1 + Math.max(0, c) * 0.2, s * A];
            pose.footL = [-0.2, 0.1 + Math.max(0, -c) * 0.2, -s * A];
            pose.handR = [0.6, 0.76 + Math.max(0, -s) * 0.05, -s * 0.36];
            pose.handL = [-0.6, 0.76 + Math.max(0, s) * 0.05, s * 0.36];
        } else {
            const A = 0.66;
            pose.bob = Math.abs(c) * 0.09 - 0.04;
            pose.lean = 0.16;
            pose.torsoYaw = s * 0.26;
            pose.hipYaw = -s * 0.18;
            pose.headYaw = -s * 0.08;
            pose.footR = [0.2, 0.1 + Math.max(0, c) * 0.42, s * A];
            pose.footL = [-0.2, 0.1 + Math.max(0, -c) * 0.42, -s * A];
            // Braços dobrados "bombeando" à frente do corpo.
            pose.handR = [0.5, 1.1 + Math.max(0, -s) * 0.08, 0.28 - s * 0.55];
            pose.handL = [-0.5, 1.1 + Math.max(0, s) * 0.08, 0.28 + s * 0.55];
        }
        return pose;
    },

    // Como segurar cada arma enquanto anda/corre/fica parado (sobrescreve braços/arma).
    carry(pose, kind, gait) {
        if (!kind || kind === 'none') return pose;
        const sway = gait === 'run' ? 0.06 : (gait === 'walk' ? 0.03 : 0);
        const b = pose.bob;
        if (kind === 'pistol') {
            pose.handR = [0.38, 1.05 + b, 0.62 + sway];
            pose.handL = [0.02, 1.0 + b, 0.5 + sway];
            pose.weapon = { kind, dir: [0, -0.25, 1] };
        } else if (kind === 'smg' || kind === 'shotgun') {
            pose.handR = [0.3, 1.02 + b, 0.38];
            pose.handL = [-0.12, 1.1 + b, 0.9 + sway];
            pose.weapon = { kind, dir: [-0.05, -0.15, 1] };
        } else if (kind === 'bat') {
            pose.handR = [0.55, 1.3 + b, 0.1];
            pose.weapon = { kind, dir: [-0.35, 0.85, -0.3] };
        }
        return pose;
    },

    // ----------------------------------------------------------- clipes de ação
    // Mira de uma arma (pose parada, apontando para frente).
    aim(kind, recoil = 0, flash = false) {
        const k = kind;
        if (k === 'pistol') {
            return Object.assign({}, this.BASE, {
                torsoYaw: -0.12, lean: 0.02 - recoil * 0.5, headYaw: 0.08,
                handR: [0.3, 1.32, 0.8 - recoil], handL: [0.05, 1.28, 0.66 - recoil],
                footR: [0.2, 0.1, 0.2], footL: [-0.2, 0.1, -0.2],
                weapon: { kind: k, dir: [0, 0, 1], flash },
            });
        }
        // smg / shotgun: coronha no ombro, mão da frente no guarda-mão.
        return Object.assign({}, this.BASE, {
            torsoYaw: -0.18, lean: 0.02 - recoil * 0.4, headYaw: 0.12,
            handR: [0.26, 1.32, 0.42 - recoil], handL: [-0.06, 1.34, (k === 'shotgun' ? 0.95 : 0.85) - recoil],
            footR: [0.2, 0.1, 0.25], footL: [-0.2, 0.1, -0.22],
            weapon: { kind: k, dir: [0, 0, 1], flash },
        });
    },

    // ======================================================== queda, cambalhota e ragdoll
    // Cambalhota para a frente (pular de um carro em movimento): giro completo do corpo, encolhido no meio.
    // Começa e termina de pé (o giro de 2π volta à posição inicial).
    tumblePose(t) {
        const tuck = Math.sin(Math.min(1, t * 1.12) * Math.PI);
        const p = Object.assign({}, this.BASE, { offset: [0, 0, 0] });
        p.pitch = 2 * Math.PI * t;
        p.pivot = [0, 0.95, 0.05];
        p.lean = 0.06 + 0.22 * tuck;
        p.footR = [0.2, 0.1 + 0.6 * tuck, 0.05 + 0.4 * tuck];            // joelhos no peito
        p.footL = [-0.2, 0.1 + 0.6 * tuck, 0.05 + 0.4 * tuck];
        p.handR = [0.6 - 0.2 * tuck, 0.74 - 0.08 * tuck, 0.02 + 0.5 * tuck];    // mãos nas canelas
        p.handL = [-0.6 + 0.2 * tuck, 0.74 - 0.08 * tuck, 0.02 + 0.5 * tuck];
        return p;
    },

    // No ar depois de ser arremessado: corpo deitado em arco, braços e pernas jogados (ragdoll).
    flailPose(t) {
        const s = Math.sin(2 * Math.PI * t), c = Math.cos(2 * Math.PI * t);
        const p = Object.assign({}, this.BASE, { offset: [0, -0.15, 0] });
        p.pitch = 1.05 + 0.12 * s;
        p.pivot = [0, 1.0, 0];
        p.headYaw = 0.35 * c;
        p.torsoYaw = 0.18 * s;
        p.handR = [0.95, 1.5 + 0.22 * s, 0.05 + 0.3 * c];
        p.handL = [-0.95, 1.45 - 0.22 * s, 0.05 - 0.3 * c];
        p.footR = [0.46, 0.3 + 0.18 * c, -0.25 + 0.15 * s];
        p.footL = [-0.42, 0.25 - 0.18 * c, 0.2 - 0.15 * s];
        return p;
    },

    // Nado crawl visto de cima: corpo deitado na água (só o dorso e a cabeça aparecem), braços em remadas alternadas
    // por cima da cabeça e pernas batendo em pernada curta. t = fase do ciclo (0..1).
    swimPose(t) {
        return Object.assign({}, this.BASE, { swim: true, swimT: t });
    },

    // Deitado de bruços, desacordado/aturdido (sem sangue): a cabeça fica à frente (+Z), como no sprite de morto.
    liePose() {
        const p = Object.assign({}, this.BASE, { offset: [0, -0.88, 0] });
        p.pitch = Math.PI / 2;
        p.pivot = [0, 1.0, 0];
        p.handR = [0.95, 0.5, 0.35]; p.handL = [-0.95, 0.5, 0.35];
        p.footR = [0.35, 0.1, -0.05]; p.footL = [-0.38, 0.1, -0.1];
        p.torsoYaw = 0.1;
        return p;
    },

    // Levantar do chão: apoia as mãos, agacha e fica de pé.
    getupPose(t) {
        const lie = this.liePose();
        const keys = [
            { t: 0, pitch: lie.pitch, offset: lie.offset, handR: lie.handR, handL: lie.handL, footR: lie.footR, footL: lie.footL },
            { t: 0.3, pitch: 1.3, offset: [0, -0.74, 0], lean: 0.2, handR: [0.55, 0.3, 0.7], handL: [-0.55, 0.3, 0.7], footR: [0.3, 0.1, -0.25], footL: [-0.3, 0.1, -0.2] },
            { t: 0.58, pitch: 0.75, offset: [0, -0.4, 0.05], lean: 0.25, handR: [0.45, 0.55, 0.55], handL: [-0.45, 0.55, 0.55], footR: [0.22, 0.1, 0.3], footL: [-0.22, 0.1, 0.1] },
            { t: 0.82, pitch: 0.28, offset: [0, -0.14, 0], lean: 0.2, handR: [0.55, 0.7, 0.2], handL: [-0.55, 0.7, 0.2] },
            { t: 1, pitch: 0, offset: [0, 0, 0] },
        ];
        return this.sample(keys, t);
    },

    // ========================================================= bicicleta e moto (com piloto)
    // Posição do pedal (plano y-z) no ângulo `a` da pedivela.
    _pedalPos(a) { return { y: 0.38 + 0.19 * Math.cos(a), z: -0.02 + 0.19 * Math.sin(a) }; },

    // Pose de quem pedala/pilota. kind: 'bike' | 'moto' | crank: ângulo dos pedais | lean: inclinação lateral (roll).
    ridePose(kind, crank = 0, lean = 0) {
        const p = Object.assign({}, this.BASE, { offset: [0, 0, 0] });
        p.pivot = [0, 0, 0];
        p.roll = lean;
        if (kind === 'bike') {
            const a = this._pedalPos(crank), b = this._pedalPos(crank + Math.PI);
            p.bob = -0.02; p.lean = 0.34;
            p.handR = [0.42, 1.12, 0.58]; p.handL = [-0.42, 1.12, 0.58];
            p.footR = [0.2, a.y + 0.06, a.z]; p.footL = [-0.2, b.y + 0.06, b.z];
        } else {
            p.bob = -0.03; p.lean = 0.42; p.headYaw = -lean * 0.4;
            p.handR = [0.46, 1.14, 0.7]; p.handL = [-0.46, 1.14, 0.7];
            p.footR = [0.3, 0.42, -0.12]; p.footL = [-0.3, 0.42, -0.12];
        }
        p.ride = kind; p.crank = crank;
        return p;
    },

    // Subir na bike/moto: parte ao lado dela (à direita), passa a perna por cima e senta.
    // kind: 'bike' | 'moto' (chega pela direita) | 'bikeL' | 'motoL' (chega pela esquerda).
    mountPose(t, kind) {
        const left = kind.endsWith('L'), k = left ? kind.slice(0, -1) : kind;
        const seat = this.ridePose(k, 0, 0);
        const stand = Object.assign({}, this.BASE, { handR: [0.5, 1.0, 0.45], handL: [-0.5, 1.0, 0.45], lean: 0.06 });
        const u = t * t * (3 - 2 * t);
        const p = this.lerpPose(stand, seat, u);
        p.ride = k; p.crank = 0; p.roll = 0; p.pivot = [0, 0, 0];
        p.offset = [(left ? -0.95 : 0.95) * (1 - u), 0.4 * Math.sin(Math.PI * Math.min(1, u * 1.15)), -0.1 * (1 - u)];
        return p;
    },

    // Só o veículo, sem piloto: estacionado (apoiado no descanso, levemente inclinado) ou caído de lado.
    emptyBike(kind, fallen) {
        return Object.assign({}, this.BASE, {
            riderless: true, ride: kind, crank: 0.6, pivot: [0, 0, 0],
            roll: fallen ? 1.38 : (kind === 'moto' ? 0.12 : 0.2),
            offset: [fallen ? 0.55 : 0, 0, 0],
        });
    },

    // Primitivas do veículo em coordenadas do rig (+Z frente, rodas no chão y=0). Usa os slots do personagem:
    // cap = cor do quadro/tanque (muda por variante), dark = pneus/banco, metal = cromado, gold = farol, blood = lanterna.
    _bike(pose) {
        const M = this.MAT, B = SpriteBaker, P = [];
        const wheel = (z, r = 0.42, w = 0.08) => P.push(B.ellipsoid(M.dark, [0, r, z], [w, r, r + 0.03], 0));
        if (pose.ride === 'bike') {
            wheel(0.85); wheel(-0.85);
            P.push(B.capsule(M.cap, [0, 0.99, -0.42], [0, 1.02, 0.55], 0.05));          // tubo superior
            P.push(B.capsule(M.cap, [0, 0.38, -0.02], [0, 0.95, -0.42], 0.045));        // tubo do selim
            P.push(B.capsule(M.cap, [0, 0.38, -0.02], [0, 1.0, 0.52], 0.045));          // tubo diagonal
            P.push(B.capsule(M.metal, [0, 0.42, -0.85], [0, 0.4, -0.02], 0.035));       // garfo traseiro
            P.push(B.capsule(M.metal, [0, 1.06, 0.55], [0, 0.42, 0.85], 0.04));         // garfo dianteiro
            P.push(B.ellipsoid(M.dark, [0, 1.0, -0.46], [0.11, 0.05, 0.2], 0));         // selim
            P.push(B.capsule(M.metal, [-0.4, 1.12, 0.58], [0.4, 1.12, 0.58], 0.032));   // guidão
            P.push(B.sphere(M.dark, [-0.43, 1.12, 0.58], 0.055));
            P.push(B.sphere(M.dark, [0.43, 1.12, 0.58], 0.055));
            const c = pose.crank || 0;                                                   // pedais girando no plano y-z
            for (const s of [0, Math.PI]) {
                const a = this._pedalPos(c + s), sx = s === 0 ? 1 : -1;
                P.push(B.capsule(M.metal, [sx * 0.1, 0.38, -0.02], [sx * 0.15, a.y, a.z], 0.03));
                P.push(B.ellipsoid(M.dark, [sx * 0.2, a.y, a.z], [0.12, 0.03, 0.07], 0));
            }
        } else {
            wheel(1.0, 0.42, 0.1); wheel(-1.0, 0.42, 0.1);
            P.push(B.ellipsoid(M.cap, [0, 0.8, 1.0], [0.13, 0.1, 0.38], 0));            // paralama dianteiro
            P.push(B.ellipsoid(M.cap, [0, 0.84, -1.04], [0.14, 0.08, 0.4], 0));         // rabeta
            P.push(B.ellipsoid(M.metal, [0, 0.5, 0.0], [0.2, 0.22, 0.4], 0));           // motor
            P.push(B.ellipsoid(M.cap, [0, 0.98, 0.3], [0.2, 0.2, 0.42], 0));            // tanque
            P.push(B.ellipsoid(M.dark, [0, 0.92, -0.38], [0.17, 0.09, 0.5], 0));        // banco
            P.push(B.capsule(M.metal, [0, 1.1, 0.72], [0, 0.42, 1.0], 0.06));           // garfo
            P.push(B.capsule(M.metal, [-0.46, 1.12, 0.68], [0.46, 1.12, 0.68], 0.035)); // guidão
            P.push(B.sphere(M.dark, [-0.49, 1.12, 0.68], 0.06));
            P.push(B.sphere(M.dark, [0.49, 1.12, 0.68], 0.06));
            P.push(B.sphere(M.metal, [-0.44, 1.3, 0.62], 0.05));                         // retrovisores
            P.push(B.sphere(M.metal, [0.44, 1.3, 0.62], 0.05));
            P.push(B.sphere(M.gold, [0, 1.06, 0.96], 0.11));                             // farol
            P.push(B.capsule(M.metal, [0.25, 0.4, -0.1], [0.27, 0.43, -0.98], 0.075));   // escapamento
            P.push(B.sphere(M.blood, [0, 0.9, -1.42], 0.07));                            // lanterna
        }
        return P;
    },

    // Clipes: cada um tem { frames, fps, loop, weapons?, pose(t, weapon) }.
    CLIPS: {
        idle: { frames: 4, fps: 4, loop: true, armed: true, pose: (t, w) => CharacterRig.carry(CharacterRig.gait('idle', t), w, 'idle') },
        walk: { frames: 8, fps: 11, loop: true, armed: true, pose: (t, w) => CharacterRig.carry(CharacterRig.gait('walk', t), w, 'walk') },
        run:  { frames: 8, fps: 15, loop: true, armed: true, pose: (t, w) => CharacterRig.carry(CharacterRig.gait('run', t), w, 'run') },

        // Soco direto de direita: recua o ombro, estende o braço e passa o peso à frente.
        punch: {
            frames: 6, fps: 16, loop: false,
            pose: (t) => CharacterRig.sample([
                { t: 0, handR: [0.55, 1.15, 0.15], handL: [-0.35, 1.2, 0.5], torsoYaw: 0, footL: [-0.2, 0.1, 0.1], footR: [0.2, 0.1, -0.15] },
                { t: 0.22, handR: [0.6, 1.2, -0.1], handL: [-0.3, 1.25, 0.55], torsoYaw: -0.4, lean: -0.04, footL: [-0.2, 0.1, 0.12], footR: [0.2, 0.1, -0.2] },
                { t: 0.5, handR: [0.16, 1.34, 0.9], handL: [-0.3, 1.28, 0.5], torsoYaw: 0.38, lean: 0.14, footL: [-0.2, 0.1, 0.45], footR: [0.2, 0.1, -0.3] },
                { t: 0.62, handR: [0.16, 1.34, 0.95], handL: [-0.3, 1.28, 0.5], torsoYaw: 0.4, lean: 0.15, footL: [-0.2, 0.1, 0.45], footR: [0.2, 0.1, -0.3] },
                { t: 1, handR: [0.55, 1.15, 0.15], handL: [-0.35, 1.2, 0.5], torsoYaw: 0, footL: [-0.2, 0.1, 0.1], footR: [0.2, 0.1, -0.15] },
            ], t),
        },

        // Cruzado de esquerda (combo): espelho do soco.
        punchL: {
            frames: 6, fps: 16, loop: false,
            pose: (t) => CharacterRig.sample([
                { t: 0, handL: [-0.55, 1.15, 0.15], handR: [0.35, 1.2, 0.5], footR: [0.2, 0.1, 0.1], footL: [-0.2, 0.1, -0.15] },
                { t: 0.22, handL: [-0.6, 1.2, -0.1], handR: [0.3, 1.25, 0.55], torsoYaw: 0.4, lean: -0.04, footR: [0.2, 0.1, 0.12], footL: [-0.2, 0.1, -0.2] },
                { t: 0.5, handL: [-0.16, 1.34, 0.9], handR: [0.3, 1.28, 0.5], torsoYaw: -0.38, lean: 0.14, footR: [0.2, 0.1, 0.45], footL: [-0.2, 0.1, -0.3] },
                { t: 0.62, handL: [-0.16, 1.34, 0.95], handR: [0.3, 1.28, 0.5], torsoYaw: -0.4, lean: 0.15, footR: [0.2, 0.1, 0.45], footL: [-0.2, 0.1, -0.3] },
                { t: 1, handL: [-0.55, 1.15, 0.15], handR: [0.35, 1.2, 0.5], footR: [0.2, 0.1, 0.1], footL: [-0.2, 0.1, -0.15] },
            ], t),
        },

        // Chute frontal alto com a perna direita; braços abrem para equilíbrio.
        kick: {
            frames: 6, fps: 15, loop: false,
            pose: (t) => CharacterRig.sample([
                { t: 0, handR: [0.55, 1.1, 0.2], handL: [-0.55, 1.1, 0.2], footR: [0.2, 0.1, -0.1], footL: [-0.2, 0.1, 0.05] },
                { t: 0.25, handR: [0.7, 1.15, -0.1], handL: [-0.7, 1.2, 0.0], lean: -0.1, torsoYaw: -0.12, footR: [0.28, 0.85, 0.3], footL: [-0.2, 0.1, 0.0] },
                { t: 0.5, handR: [0.8, 1.1, -0.3], handL: [-0.75, 1.25, 0.1], lean: -0.1, torsoYaw: -0.18, footR: [0.22, 1.0, 0.84], footL: [-0.2, 0.1, -0.05] },
                { t: 0.65, handR: [0.8, 1.1, -0.3], handL: [-0.75, 1.25, 0.1], lean: -0.1, torsoYaw: -0.18, footR: [0.22, 0.98, 0.86], footL: [-0.2, 0.1, -0.05] },
                { t: 0.85, handR: [0.65, 1.1, 0.0], handL: [-0.65, 1.15, 0.1], lean: -0.05, footR: [0.28, 0.6, 0.4], footL: [-0.2, 0.1, 0.0] },
                { t: 1, handR: [0.55, 1.1, 0.2], handL: [-0.55, 1.1, 0.2], footR: [0.2, 0.1, -0.1], footL: [-0.2, 0.1, 0.05] },
            ], t),
        },

        // Roubo de carro: agarra a maçaneta (à frente), puxa a porta com as duas mãos e
        // joga o corpo para trás arrancando o motorista.
        carjack: {
            frames: 6, fps: 9, loop: false,
            pose: (t) => CharacterRig.sample([
                { t: 0, handR: [0.3, 1.0, 0.3], handL: [-0.55, 0.9, 0.1], lean: 0.04 },
                { t: 0.25, handR: [0.28, 1.12, 0.95], handL: [-0.4, 0.95, 0.3], lean: 0.14, torsoYaw: 0.3, footL: [-0.2, 0.1, 0.3] },
                { t: 0.45, handR: [0.3, 1.1, 1.0], handL: [-0.1, 1.1, 0.95], lean: 0.18, torsoYaw: 0.12, footL: [-0.2, 0.1, 0.32] },
                { t: 0.75, handR: [0.35, 1.1, 0.4], handL: [-0.05, 1.1, 0.4], lean: -0.14, torsoYaw: -0.1, footL: [-0.2, 0.1, -0.1], footR: [0.2, 0.1, 0.3] },
                { t: 1, handR: [0.5, 1.0, 0.2], handL: [-0.5, 1.0, 0.2], lean: -0.04 },
            ], t),
        },

        // Abrir a porta de um carro (sem ninguém dentro): estica a mão até a maçaneta e puxa.
        opendoor: {
            frames: 5, fps: 10, loop: false,
            pose: (t) => CharacterRig.sample([
                { t: 0, handR: [0.5, 1.0, 0.2], handL: [-0.5, 1.0, 0.2], lean: 0.02 },
                { t: 0.35, handR: [0.3, 1.05, 0.85], handL: [-0.45, 0.95, 0.25], lean: 0.14, torsoYaw: 0.25, footL: [-0.2, 0.1, 0.25] },
                { t: 0.7, handR: [0.38, 1.1, 0.6], handL: [-0.4, 0.95, 0.25], lean: -0.1, torsoYaw: -0.12, footL: [-0.2, 0.1, 0.0], footR: [0.2, 0.1, 0.18] },
                { t: 1, handR: [0.5, 1.0, 0.3], handL: [-0.5, 1.0, 0.2], lean: -0.02 },
            ], t),
        },

        // Arrombar na manha: debruçado sobre a fechadura, mãos mexendo no ferrolho (loop enquanto dura o mini-game).
        pick: {
            frames: 4, fps: 7, loop: true, armed: false,
            pose: (t) => {
                const s = Math.sin(2 * Math.PI * t), c = Math.cos(2 * Math.PI * t);
                return Object.assign({}, CharacterRig.BASE, {
                    lean: 0.24 + 0.02 * s, torsoYaw: 0.12, headYaw: 0.12 * c,
                    handR: [0.28 + 0.03 * c, 0.95, 0.82 + 0.05 * s], handL: [0.0, 1.0, 0.7 - 0.05 * s],
                    footR: [0.22, 0.1, 0.12], footL: [-0.22, 0.1, -0.1],
                });
            },
        },

        // Pular uma grade/muro: agacha, apoia as mãos, passa as pernas de lado por cima e cai correndo.
        vault: {
            frames: 6, fps: 10, loop: false, armed: false,
            pose: (t) => CharacterRig.sample([
                { t: 0, handR: [0.45, 1.0, 0.45], handL: [-0.45, 1.0, 0.45], lean: 0.1, footR: [0.2, 0.1, 0.1], footL: [-0.2, 0.1, -0.1] },
                { t: 0.28, handR: [0.35, 0.95, 0.85], handL: [-0.35, 0.95, 0.85], lean: 0.3, offset: [0, 0.15, 0.1], footR: [0.22, 0.55, 0.05], footL: [-0.22, 0.65, 0.2] },
                { t: 0.55, handR: [0.4, 0.9, 0.9], handL: [-0.4, 0.9, 0.9], lean: 0.34, offset: [0, 0.25, 0.25], torsoYaw: 0.2, footR: [0.7, 0.5, -0.1], footL: [0.35, 0.55, 0.0] },
                { t: 0.8, handR: [0.55, 1.05, 0.5], handL: [-0.55, 1.05, 0.3], lean: 0.2, offset: [0, 0.05, 0.1], footR: [0.22, 0.15, 0.35], footL: [-0.22, 0.2, -0.1] },
                { t: 1, handR: [0.55, 1.0, 0.1], handL: [-0.55, 1.0, 0.1], lean: 0.05, footR: [0.2, 0.1, 0.2], footL: [-0.2, 0.1, -0.15] },
            ], t),
        },

        // Rendição: ergue as mãos, vai abaixando e se ajoelha com as mãos atrás da cabeça (termina na pose `kneel`).
        surrender: {
            frames: 8, fps: 9, loop: false, armed: false,
            pose: (t) => CharacterRig.sample([
                { t: 0, handR: [0.5, 1.0, 0.2], handL: [-0.5, 1.0, 0.2] },
                { t: 0.3, handR: [0.6, 1.8, 0.1], handL: [-0.6, 1.8, 0.1], lean: -0.05, headYaw: 0 },
                { t: 0.55, handR: [0.5, 1.85, 0.05], handL: [-0.5, 1.85, 0.05], offset: [0, -0.22, 0], lean: 0.04, footR: [0.22, 0.1, -0.1], footL: [-0.22, 0.1, 0.12] },
                { t: 0.8, handR: [0.35, 1.7, 0.0], handL: [-0.35, 1.7, 0.0], offset: [0, -0.42, 0.04], lean: 0.08, footR: [0.22, 0.1, -0.4], footL: [-0.22, 0.1, -0.25] },
                { t: 1, handR: [0.24, 1.5, -0.14], handL: [-0.24, 1.5, -0.14], offset: [0, -0.5, 0.05], lean: 0.1, headYaw: 0, footR: [0.22, 0.1, -0.5], footL: [-0.22, 0.1, -0.5] },
            ], t),
        },

        // Ajoelhado, mãos atrás da cabeça (a pose final da rendição, parada).
        kneel: {
            frames: 1, fps: 1, loop: true, armed: false,
            pose: () => Object.assign({}, CharacterRig.BASE, {
                handR: [0.24, 1.5, -0.14], handL: [-0.24, 1.5, -0.14], offset: [0, -0.5, 0.05], lean: 0.1,
                footR: [0.22, 0.1, -0.5], footL: [-0.22, 0.1, -0.5],
            }),
        },

        // Entrar no carro: desliza para frente e encolhe até sumir na porta.
        enter: {
            frames: 5, fps: 10, loop: false,
            pose: (t) => CharacterRig.sample([
                { t: 0, handR: [0.5, 1.0, 0.4], handL: [-0.5, 1.0, 0.4], lean: 0.1, footR: [0.2, 0.1, 0.2], footL: [-0.2, 0.1, -0.1] },
                { t: 0.5, handR: [0.5, 1.05, 0.5], handL: [-0.5, 1.05, 0.5], lean: 0.2, offset: [0, -0.2, 0.7], scale: 0.7, footR: [0.2, 0.3, 0.4], footL: [-0.2, 0.1, 0.1] },
                { t: 1, handR: [0.5, 1.05, 0.5], handL: [-0.5, 1.05, 0.5], lean: 0.2, offset: [0, -0.5, 1.4], scale: 0.35 },
            ], t),
        },

        // Sacar a arma: mão vai ao quadril, puxa e levanta já mirando.
        draw: {
            frames: 5, fps: 14, loop: false, weapons: ['pistol', 'smg', 'shotgun'],
            pose: (t, w) => {
                const aimPose = CharacterRig.aim(w);
                const hip = Object.assign({}, CharacterRig.BASE, { handR: [0.58, 0.95, -0.12], lean: -0.03, torsoYaw: -0.1 });
                const mid = Object.assign({}, CharacterRig.BASE, {
                    handR: [0.45, 1.15, 0.35], handL: [-0.1, 1.0, 0.3], torsoYaw: -0.1,
                    weapon: { kind: w, dir: [0.2, 0.2, 1] },
                });
                if (t < 0.4) return CharacterRig.lerpPose(hip, mid, t / 0.4);
                return CharacterRig.lerpPose(mid, aimPose, (t - 0.4) / 0.6);
            },
        },

        aim: { frames: 1, fps: 1, loop: true, weapons: ['pistol', 'smg', 'shotgun'], pose: (t, w) => CharacterRig.aim(w) },

        // Tiro: coice nos primeiros frames, clarão da boca da arma no frame 0.
        shoot: {
            frames: 4, fps: 18, loop: false, weapons: ['pistol', 'smg', 'shotgun'],
            pose: (t, w) => {
                const f = Math.round(t * 3);
                if (w === 'shotgun' && f >= 2) {
                    // bombear: mão da frente puxa e empurra o guarda-mão.
                    const p = CharacterRig.aim(w, 0.02);
                    p.handL = [-0.06, 1.34, f === 2 ? 0.62 : 0.95];
                    return p;
                }
                const recoil = [0.2, 0.12, 0.05, 0][f] * (w === 'shotgun' ? 1.4 : 1);
                return CharacterRig.aim(w, recoil, f === 0);
            },
        },

        // Taco: golpe de cima do ombro para o outro lado, com o corpo girando.
        swing: {
            frames: 6, fps: 15, loop: false, weapons: ['bat'],
            pose: (t) => CharacterRig.sample([
                { t: 0, handR: [0.55, 1.3, 0.1], handL: [-0.1, 1.2, 0.2], torsoYaw: -0.1, weapon: { kind: 'bat', dir: [-0.35, 0.85, -0.3] } },
                { t: 0.25, handR: [0.7, 1.4, -0.1], handL: [0.15, 1.3, -0.05], torsoYaw: -0.55, lean: -0.05, weapon: { kind: 'bat', dir: [0.7, 0.45, -0.7] } },
                { t: 0.5, handR: [0.4, 1.25, 0.55], handL: [-0.05, 1.2, 0.5], torsoYaw: 0.05, lean: 0.1, footL: [-0.2, 0.1, 0.35], weapon: { kind: 'bat', dir: [0.1, 0.1, 1] } },
                { t: 0.7, handR: [0.0, 1.2, 0.7], handL: [-0.2, 1.15, 0.6], torsoYaw: 0.5, lean: 0.12, footL: [-0.2, 0.1, 0.38], weapon: { kind: 'bat', dir: [-0.95, 0.05, 0.3] } },
                { t: 1, handR: [0.55, 1.3, 0.1], handL: [-0.1, 1.2, 0.2], torsoYaw: 0, weapon: { kind: 'bat', dir: [-0.35, 0.85, -0.3] } },
            ], t),
        },

        // Furto (carteirada): se aproxima de lado com a mão disfarçada, estica a direita (o "pega" é no quadro 3) e recolhe.
        pickpocket: {
            frames: 6, fps: 7, loop: false, armed: false,
            pose: (t) => CharacterRig.sample([
                { t: 0, handR: [0.5, 1.0, 0.25], handL: [-0.5, 1.0, 0.2], lean: 0.05 },
                { t: 0.35, handR: [0.34, 1.12, 0.8], handL: [-0.4, 1.05, 0.3], lean: 0.2, torsoYaw: 0.18, headYaw: -0.15, footR: [0.22, 0.1, 0.3], footL: [-0.22, 0.1, -0.1] },
                { t: 0.62, handR: [0.26, 1.1, 0.98], handL: [-0.4, 1.05, 0.3], lean: 0.24, torsoYaw: 0.22, headYaw: -0.15, footR: [0.22, 0.1, 0.34], footL: [-0.22, 0.1, -0.12] },
                { t: 1, handR: [0.42, 0.98, 0.18], handL: [-0.5, 1.0, 0.2], lean: 0.04, torsoYaw: 0.02 },
            ], t),
        },

        // Vasculhar o inventário: inclina, mão esquerda abre a jaqueta, direita pega algo.
        rummage: {
            frames: 6, fps: 8, loop: true, armed: false,
            pose: (t) => {
                const s = Math.sin(2 * Math.PI * t);
                return Object.assign({}, CharacterRig.BASE, {
                    lean: 0.1, torsoYaw: 0.08 + s * 0.05, headYaw: -0.1,
                    handL: [-0.3, 1.25, 0.18], handR: [0.28 + s * 0.06, 1.18, 0.3 + s * 0.1],
                    footR: [0.22, 0.1, 0.05], footL: [-0.22, 0.1, -0.05],
                });
            },
        },

        // Levar um golpe (cambaleia para trás) e cair.
        hurt: {
            frames: 3, fps: 12, loop: false,
            pose: (t) => CharacterRig.sample([
                { t: 0, handR: [0.6, 0.9, 0.2], handL: [-0.6, 0.9, 0.2], lean: -0.1, torsoYaw: 0.2, headYaw: -0.2 },
                { t: 0.5, handR: [0.8, 1.0, -0.2], handL: [-0.8, 1.0, -0.2], lean: -0.22, torsoYaw: 0.35, headYaw: -0.3, footR: [0.2, 0.1, 0.2], footL: [-0.2, 0.1, -0.15] },
                { t: 1, handR: [0.7, 0.85, 0.0], handL: [-0.7, 0.85, 0.0], lean: -0.14, torsoYaw: 0.15 },
            ], t),
        },

        // Morto: corpo caído com poça de sangue (1 frame, fica no chão).
        dead: {
            frames: 1, fps: 1, loop: true,
            pose: () => Object.assign({}, CharacterRig.BASE, { lying: true }),
        },

        // Mãos ao alto: pânico (NPCs fugindo e assustados).
        scared: {
            frames: 8, fps: 14, loop: true,
            pose: (t) => {
                const g = CharacterRig.gait('run', t);
                const s = Math.sin(2 * Math.PI * t);
                g.handR = [0.6, 1.75, 0.15 + s * 0.12];
                g.handL = [-0.6, 1.75, 0.15 - s * 0.12];
                return g;
            },
        },

        // ---- queda e ragdoll ----
        swim:   { frames: 8, fps: 9, loop: true, armed: false, pose: (t) => CharacterRig.swimPose(t) },      // nadando (crawl)
        tumble: { frames: 10, fps: 20, loop: false, pose: (t) => CharacterRig.tumblePose(t) },   // cambalhota
        flail:  { frames: 4, fps: 12, loop: true, pose: (t) => CharacterRig.flailPose(t) },      // no ar, arremessado
        lie:    { frames: 1, fps: 1, loop: true, pose: () => CharacterRig.liePose() },            // caído, vivo
        getup:  { frames: 8, fps: 12, loop: false, pose: (t) => CharacterRig.getupPose(t) },     // levantando

        // ---- bicicleta e moto (o piloto vai no mesmo sprite) ----
        ride_bike: { frames: 8, fps: 10, loop: true, pose: (t) => CharacterRig.ridePose('bike', t * 2 * Math.PI) },
        // moto: 3 quadros de inclinação (0 = inclinada p/ a direita, 1 = reta, 2 = p/ a esquerda)
        ride_moto: { frames: 3, fps: 1, loop: true, pose: (t) => CharacterRig.ridePose('moto', 0, [-0.42, 0, 0.42][Math.round(t * 3) % 3]) },
        mount:     { frames: 6, fps: 12, loop: false, weapons: ['bike', 'moto', 'bikeL', 'motoL'], pose: (t, w) => CharacterRig.mountPose(t, w) },
        park_bike:   { frames: 1, fps: 1, loop: true, pose: () => CharacterRig.emptyBike('bike', false) },
        park_moto:   { frames: 1, fps: 1, loop: true, pose: () => CharacterRig.emptyBike('moto', false) },
        fallen_bike: { frames: 1, fps: 1, loop: true, pose: () => CharacterRig.emptyBike('bike', true) },
        fallen_moto: { frames: 1, fps: 1, loop: true, pose: () => CharacterRig.emptyBike('moto', true) },
    },

    // Qual pose do clipe `name` no instante normalizado t, com a arma `weapon`.
    clipPose(name, t, weapon) {
        const c = this.CLIPS[name];
        return c.pose(t, weapon);
    },

    // ------------------------------------------------------------------ paleta
    // Variantes de cor. Slots não listados herdam do padrão do `base`.
    SKINS: ['#f1c9a0', '#e0ac80', '#c68c5e', '#a06a42', '#6f4528', '#f6d9c0'],
    HAIRS: ['#2a1b12', '#4a2f1a', '#6b4a2a', '#caa35a', '#8a8a8e', '#a3341f', '#15151a'],
    SHIRTS: ['#d9453a', '#e8a22c', '#8e4fb8', '#2fa36a', '#e6e8ee', '#3f8fd0', '#e86aa0', '#6b7a3a', '#f0d24a', '#37c0b6'],
    PANTS: ['#3b5a8c', '#2a2a30', '#a89a6a', '#5a4632', '#6c6f78', '#7a3b3b'],
    SHOES: ['#1d1d22', '#e6e6ea', '#5a3a22', '#b83a3a'],

    // Linhas fixas da paleta: 0 = jogador, 1 = policial, 2.. = civis.
    VARIANTS: null,

    _buildVariants() {
        const out = [];
        const base = { metal: '#b4bdc9', wood: '#9a6432', dark: '#4a4d58', gold: '#e8c24a', cap: '#1b2a5a', flash: '#ffe27a', blood: '#8a1219' };
        const mk = (o) => Object.assign({}, base, o);
        // 0: jogador — jaqueta laranja forte, calça escura, cabelo preto.
        out.push(mk({ skin: '#e0ac80', hair: '#15151a', shirt: '#e8742c', sleeve: '#e8742c', forearm: '#e0ac80', pants: '#2a2f45', shoes: '#f0f0f4' }));
        // 1: policial — uniforme azul-marinho, boné e distintivo.
        out.push(mk({ skin: '#e0ac80', hair: '#2a1b12', shirt: '#26407e', sleeve: '#26407e', forearm: '#26407e', pants: '#14182e', shoes: '#101014', cap: '#1b2a5a' }));
        // 2..: civis (combinações determinísticas).
        for (let i = 0; i < 24; i++) {
            const r = Pixel.rng(500 + i * 17);
            const shirt = Pixel.pick(this.SHIRTS, r());
            const skin = Pixel.pick(this.SKINS, r());
            const longSleeve = r() < 0.4;
            out.push(mk({
                skin, hair: Pixel.pick(this.HAIRS, r()), shirt,
                sleeve: longSleeve ? shirt : shirt,
                forearm: longSleeve ? shirt : skin,
                pants: Pixel.pick(this.PANTS, r()), shoes: Pixel.pick(this.SHOES, r()),
                cap: Pixel.pick(this.SHIRTS, r()),
            }));
        }
        // Forças especiais (índices fixos: VARIANT_SWAT / VARIANT_ARMY, depois dos civis).
        // SWAT: preto de cabo a rabo, colete cinza-chumbo. Exército: verde-oliva, capacete de campanha.
        out.push(mk({ skin: '#2b2d34', hair: '#15151a', shirt: '#17191f', sleeve: '#17191f', forearm: '#101216', pants: '#181a20', shoes: '#0b0b0d',
            cap: '#23262e', metal: '#4d535d', dark: '#0e0f13' }));
        out.push(mk({ skin: '#d9a679', hair: '#2a1b12', shirt: '#56633a', sleeve: '#56633a', forearm: '#d9a679', pants: '#46512e', shoes: '#2a2820',
            cap: '#3f4a27', metal: '#59606a', dark: '#2f3322' }));
        // ---- Estilos de roupa por lugar (índices fixos depois do exército; ver VARIANT_GROUPS) ----
        const pick = (arr, r) => Pixel.pick(arr, r());
        // 28–31: executivos (paletó e calça social; sapato preto).
        for (let i = 0; i < 4; i++) {
            const r = Pixel.rng(900 + i * 13), suit = ['#22263a', '#1c1d22', '#4a4d55', '#6a5a45'][i];
            out.push(mk({ skin: pick(this.SKINS, r), hair: pick(this.HAIRS, r), shirt: suit, sleeve: suit, forearm: suit, pants: Pixel.mix(Pixel.hex(suit), [0, 0, 0], 0.15).map((v) => Math.round(v)).reduce((s, v) => s + v.toString(16).padStart(2, '0'), '#'), shoes: '#101014', cap: suit }));
        }
        // 32–39: moradores da favela (roupa desbotada, chinelo, alguns sem camisa).
        for (let i = 0; i < 8; i++) {
            const r = Pixel.rng(950 + i * 29), skin = pick(this.SKINS, r), shirtless = i % 4 === 3;
            const shirt = shirtless ? skin : ['#8a7a6a', '#6a7a8a', '#9a8a5a', '#a05a4a', '#8a8a8a', '#5a6a5a', '#b8a060'][Math.floor(r() * 7)];
            out.push(mk({ skin, hair: pick(this.HAIRS, r), shirt, sleeve: shirt, forearm: skin, pants: ['#4a5a6a', '#6a5a4a', '#3a3a40', '#7a6a50'][Math.floor(r() * 4)], shoes: i % 2 ? '#c9a45a' : skin, cap: shirt }));
        }
        // 40–45: banhistas (sem camisa, sunga/biquíni colorido).
        for (let i = 0; i < 6; i++) {
            const r = Pixel.rng(990 + i * 31), skin = pick(this.SKINS, r), sw = ['#d9453a', '#2f86d0', '#e8c22c', '#2fa36a', '#e86aa0', '#8e4fb8'][i];
            out.push(mk({ skin, hair: pick(this.HAIRS, r), shirt: i % 2 ? sw : skin, sleeve: i % 2 ? sw : skin, forearm: skin, pants: sw, shoes: skin, cap: sw }));
        }
        // 46–49: corredores (regata e short coloridos, tênis branco).
        for (let i = 0; i < 4; i++) {
            const r = Pixel.rng(1030 + i * 37), skin = pick(this.SKINS, r), tc = ['#37c0b6', '#f0d24a', '#e86aa0', '#3f8fd0'][i];
            out.push(mk({ skin, hair: pick(this.HAIRS, r), shirt: tc, sleeve: skin, forearm: skin, pants: ['#2a2a30', '#d9453a', '#3b5a8c', '#e6e8ee'][i], shoes: '#e6e6ea', cap: tc }));
        }
        // 50–52: turistas (camisa havaiana vistosa, bermuda bege, boné).
        for (let i = 0; i < 3; i++) {
            const r = Pixel.rng(1070 + i * 41), sh = ['#e86aa0', '#37c0b6', '#f0d24a'][i];
            out.push(mk({ skin: pick(this.SKINS, r), hair: pick(this.HAIRS, r), shirt: sh, sleeve: sh, forearm: pick(this.SKINS, r), pants: '#c9b98a', shoes: '#5a3a22', cap: ['#e6e8ee', '#d9453a', '#2f86d0'][i] }));
        }
        // 53–56: entregadores de aplicativo (jaqueta vermelha ou preta, capacete, baú e moto vermelhos; faixa branca no baú).
        for (let i = 0; i < 4; i++) {
            const r = Pixel.rng(1110 + i * 43), jk = i % 2 ? '#1c1d22' : '#d81f26';
            out.push(mk({ skin: pick(this.SKINS, r), hair: '#15151a', shirt: jk, sleeve: jk, forearm: jk, pants: ['#23252c', '#2f3a52', '#3a3a40', '#23252c'][i], shoes: '#111114', cap: '#e3161b', gold: '#f6f6f2' }));
        }
        return out;
    },
    VARIANT_COURIER: 53, COURIERS: 4,
    VARIANT_SWAT: 26,
    VARIANT_ARMY: 27,
    // Grupos de roupa por lugar (linhas da paleta): executivos, favela, praia, corrida, turistas e os civis comuns.
    VARIANT_GROUPS: { casual: [2, 25], biz: [28, 31], poor: [32, 39], beach: [40, 45], sport: [46, 49], tourist: [50, 52] },

    // Rampas de 5 tons de uma variante, indexadas pelo número do slot (MAT).
    rampsFor(variantIndex) {
        if (!this.VARIANTS) this.VARIANTS = this._buildVariants();
        const v = this.VARIANTS[variantIndex];
        const out = {};
        for (const slot of Object.keys(this.MAT)) {
            out[this.MAT[slot]] = slot === 'flash'
                ? [Pixel.hex(v.flash), Pixel.hex(v.flash), Pixel.hex(v.flash), Pixel.hex('#fff3b0'), Pixel.hex('#ffffff')]
                : Pixel.ramp5(v[slot]);
        }
        return out;
    },

    // Converte um frame indexado do baker em ImageData RGBA (para canvas 2D).
    // Usado pela galeria de sprites; o jogo usa o shader com a textura de paleta.
    colorize(indexed, variantIndex, shadowAlpha = 0.36) {
        const ramps = this.rampsFor(variantIndex);
        const out = new Uint8ClampedArray(indexed.length);
        for (let i = 0; i < indexed.length; i += 4) {
            if (indexed[i + 3] < 128) continue;
            if (indexed[i] > 250) { out[i + 2] = 12; out[i + 3] = Math.round(shadowAlpha * 255); continue; }
            const c = ramps[indexed[i]][indexed[i + 1]];
            out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255;
        }
        return out;
    },

    // Textura de paleta: 1 linha por variante; x = rampa*5 + nível.
    createPalette(scene) {
        if (!this.VARIANTS) this.VARIANTS = this._buildVariants();
        const RAMPS = 16, W = RAMPS * 5, H = this.VARIANTS.length;
        const data = new Uint8Array(W * H * 4);
        this.VARIANTS.forEach((v, row) => {
            const ramps = this.rampsFor(row);
            for (const idx of Object.keys(ramps)) {
                const ramp = ramps[idx];
                for (let lv = 0; lv < 5; lv++) {
                    const o = (row * W + idx * 5 + lv) * 4;
                    data[o] = ramp[lv][0]; data[o + 1] = ramp[lv][1]; data[o + 2] = ramp[lv][2]; data[o + 3] = 255;
                }
            }
        });
        SpriteIO.paletteOverlay('pal/char', data, W, H);               // cores editadas em assets/sprites/pal/char.png (se houver)
        const tex = BABYLON.RawTexture.CreateRGBATexture(data, W, H, scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
        tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        return { texture: tex, width: W, height: H };
    },
};
