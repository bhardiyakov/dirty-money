// ============================================================================
// NpcGenAnims — esqueleto (cinemática direta, IK de dois ossos para braços e pernas, objetos na mão) e TODAS as animações:
// as do gerador original (porte de pose.py + anims.py) e as novas, para os movimentos que o jogo já tem:
//
//   correr armado (pistola / submetralhadora / escopeta / fuzil / taco), sacar, mirar, soco de direita e de esquerda,
//   ROUBAR CARRO (puxar o motorista), ABRIR A PORTA, ENTRAR NO CARRO, arrombar fechadura, pular grade, render-se e ajoelhar,
//   pânico (correr com as mãos pra cima), cambalhota, arremessado no ar, caído, morto com poça de sangue, FURTO (carteirada),
//   ASSALTO (anunciar com a arma), mexer na bolsa, carregar maleta/sacola, puxar mala de rodinhas, andar sobrecarregado,
//   TÁTICO: agachado (cobertura), andar agachado (furtivo), passo lateral mirando (strafe) e rolamento de esquiva.
//
// Cada animação = função que devolve uma lista de Poses (uma por quadro). Espaço do personagem: x direita, y frente, z cima (px).
// CLIPS liga o nome do clipe do JOGO ("walk:pistol", "carjack:none"…) à animação, com quadros, fps e loop.
// ============================================================================

function NpcGenAnims(G) {
    'use strict';
    const { Rx, Ry, Rz, deg, nrm, V, M4, mm4, mm3, mv3, tmv3, pt4, lookRot, I3, PROP_GRIP, PROP_MUZZLE, PROP_MOUNT, ANKLE_H, SKEL, PUMP_Y, PUMP_TRAVEL, UPPER, LOWER, FIST, THIGH, SHIN } = G;
    const sin = Math.sin, cos = Math.cos, abs = Math.abs, max = Math.max, min = Math.min, PI = Math.PI, TAU = 2 * PI;
    const clip = (v, a, b) => min(max(v, a), b);

    // ------------------------------------------------------------------ esqueleto
    const RIG = Object.assign({}, SKEL);
    function setRig(rig) { for (const k of Object.keys(RIG)) delete RIG[k]; Object.assign(RIG, rig); }

    function ik2(J, T, l1, l2, pole, arm = true) {
        const D = V.sub(T, J);
        let d = V.len(D);
        const dmin = abs(l1 - l2) + 0.05, dmax = l1 + l2 - 0.02;
        const Dn = V.mul(D, 1 / max(d, 1e-9));
        d = clip(d, dmin, dmax);
        let q = V.sub(pole, V.mul(Dn, V.dot(pole, Dn)));
        if (V.len(q) < 1e-6) {
            const alt = arm ? [0, -1.0, 0] : [0, 1.0, 0];
            q = V.sub(alt, V.mul(Dn, V.dot(alt, Dn)));
            if (V.len(q) < 1e-6) q = V.sub([0, 0, 1.0], V.mul(Dn, Dn[2]));
        }
        const Qn = nrm(q);
        const ca = clip((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), sa = Math.sqrt(1 - ca * ca);
        const E = V.add(J, V.mul(V.add(V.mul(Dn, ca), V.mul(Qn, sa)), l1));
        const Tc = V.add(J, V.mul(Dn, d));
        const u = nrm(V.sub(E, J)), f = nrm(V.sub(Tc, E));
        const z = V.mul(u, -1);
        // eixo x = normal do plano do membro (o mesmo que cross(∓Qn, z) com o braço aberto); assim não vira 180° quando o braço dobra
        // além de 90° no ombro (cos < 0: mão perto do ombro — RPG no ombro), nem fica indefinido em 90°.
        const x = nrm(arm ? V.cross(Qn, Dn) : V.cross(Dn, Qn));
        const y = V.cross(z, x);
        const Ru = G.fromCols(x, y, z);
        const z2 = V.mul(f, -1), y2 = V.cross(z2, x);
        const Rf = G.fromCols(x, nrm(y2), z2);
        return [Ru, Rf];
    }

    const col = (R, c) => [R[c], R[3 + c], R[6 + c]];
    // menor rotação que leva a direção a até b (unitárias)
    function swingR(a, b) {
        const v = V.cross(a, b), c = V.dot(a, b);
        if (c < -0.999999) { const o = nrm(abs(a[0]) < 0.9 ? V.cross(a, [1, 0, 0]) : V.cross(a, [0, 1, 0])); return [2 * o[0] * o[0] - 1, 2 * o[0] * o[1], 2 * o[0] * o[2], 2 * o[1] * o[0], 2 * o[1] * o[1] - 1, 2 * o[1] * o[2], 2 * o[2] * o[0], 2 * o[2] * o[1], 2 * o[2] * o[2] - 1]; }
        const k = 1 / (1 + c), [x, y, z] = v;
        return [1 - k * (y * y + z * z), k * x * y - z, k * x * z + y, k * x * y + z, 1 - k * (x * x + z * z), k * y * z - x, k * x * z - y, k * y * z + x, 1 - k * (x * x + y * y)];
    }
    // Alvo de um braço IK levado ao esqueleto ADULTO (Pose.adult). Jo/Ja = ombro no pacote/adulto, Co/Ca = peito, hc = centro dos
    // quadris no pacote, wdz = deslocamento da água (null fora d'água). Ver Pose.arm_ik (space).
    function armTarget(T, space, Jo, Ja, Co, Ca, hc, wdz) {
        const A = G.ADULT, kl = A.leg;
        if (space === 'body') { const q = tmv3(Co.R, V.sub(T, Co.t)); return pt4(Ca, [q[0] * (A.width || 1), q[1], q[2] * A.torso]); }
        if (space === 'world') return [T[0] + (kl - 1) * hc[0], T[1] * kl, wdz !== null ? T[2] - wdz : ANKLE_H + (T[2] - ANKLE_H) * kl];
        const r = (A.arm * (UPPER + LOWER) - FIST[2] * (A.hand || 1)) / (UPPER + LOWER - FIST[2]);         // alcance adulto / do pacote
        return V.add(Ja, mv3(Ca.R, V.mul(tmv3(Co.R, V.sub(T, Jo)), r)));
    }

    class Pose {
        constructor() {
            this.pelvis_t = [0, 0, 0]; this.pelvis_R = I3(); this.chest_R = I3(); this.head_R = I3();
            this.arm = { R: ['fk', I3(), I3(), I3()], L: ['fk', I3(), I3(), I3()] };
            this.leg = { R: ['fk', I3(), I3(), I3()], L: ['fk', I3(), I3(), I3()] };
            this.props = []; this.effects = []; this.water = null; this.shadow = true; this.shadowScale = 1.0;
            this.scale = 1.0;          // encolher o personagem inteiro (entrar no carro)
            this.root = null;          // rotação do corpo inteiro em volta da pélvis (cambalhota, arremessado)
        }
        arm_fk(side, { flex = 0, abd = 0, twist = 0, elbow = 0, wrist = 0 } = {}) {
            const s = side === 'R' ? 1.0 : -1.0;
            if (G.ADULT && abd > 0 && abd <= 18) abd *= G.ARM_ABD || 1;      // braços relaxados, rente ao corpo (G.ARM_ABD; 1 = o "gorila" do pacote)
            const Ru = mm3(mm3(Rz(deg(twist) * s), Ry(-deg(abd) * s)), Rx(deg(flex)));
            this.arm[side] = ['fk', Ru, Rx(deg(elbow)), Rx(deg(wrist))];
        }
        // space = como o alvo vai para o esqueleto ADULTO (Pose.adult): 'reach' (padrão) = mesma direção e mesma fração do alcance a
        // partir do ombro (mirar, socar, gestos); 'body' = preso ao peito nas proporções do tronco adulto (alça, nuca, coldre, bolsa no
        // peito); 'world' = no mundo, como os pés (encosta, grade, chão: anda junto com o pé plantado). Membro em `abs`: já é adulto.
        arm_ik(side, target, pole = null, handR = null, space = null) {
            const s = side === 'R' ? 1.0 : -1.0;
            this.arm[side] = ['ik', target.slice(), (pole || [0.45 * s, -1.0, -0.2]).slice(), handR];
            if (space) this.arm[side].push(space);
        }
        leg_fk(side, { flex = 0, abd = 0, knee = 0, foot = 0, twist = 0 } = {}) {
            const s = side === 'R' ? 1.0 : -1.0;
            const Rt = mm3(mm3(Rz(deg(twist) * s), Ry(deg(abd) * s)), Rx(deg(flex)));
            this.leg[side] = ['fk', Rt, Rx(-deg(knee)), Rx(deg(foot))];
        }
        leg_ik(side, ankle, pole = null, footR = null) {
            const s = side === 'R' ? 1.0 : -1.0;
            this.leg[side] = ['ik', ankle.slice(), (pole || [0.12 * s, 1.0, 0.0]).slice(), footR];
        }
        bones() {
            const B = {};
            B.root = M4();
            const off = V.add(RIG.pelvis[1], this.pelvis_t);
            B.pelvis = M4(this.pelvis_R, off);
            if (this.root) {                                        // giro do corpo todo em volta do quadril
                const c = off;
                B.pelvis = mm4(mm4(M4(null, c), M4(this.root, null)), mm4(M4(null, V.mul(c, -1)), B.pelvis));
            }
            B.chest = mm4(B.pelvis, M4(this.chest_R, RIG.chest[1]));
            B.head = mm4(B.chest, M4(this.head_R, RIG.head[1]));
            for (const sd of ['R', 'L']) {
                const sh = mm4(B.chest, M4(null, RIG['uarm_' + sd][1])), J = sh.t, spec = this.arm[sd];
                let Bu, Bf, Bh;
                if (spec[0] === 'fk') {
                    Bu = mm4(B.chest, M4(spec[1], RIG['uarm_' + sd][1]));
                    Bf = mm4(Bu, M4(spec[2], RIG['farm_' + sd][1]));
                    Bh = mm4(Bf, M4(spec[3], RIG['hand_' + sd][1]));
                } else {
                    const [Ru, Rf] = ik2(J, spec[1], UPPER, LOWER - FIST[2], spec[2], true);
                    Bu = M4(Ru, J);
                    const E = V.add(J, mv3(Ru, [0, 0, -UPPER]));
                    Bf = M4(Rf, E);
                    const W = V.add(E, mv3(Rf, [0, 0, -LOWER]));
                    Bh = M4(spec[3] || Rf, W);
                }
                B['uarm_' + sd] = Bu; B['farm_' + sd] = Bf; B['hand_' + sd] = Bh;
                const hp = mm4(B.pelvis, M4(null, RIG['thigh_' + sd][1])), Hh = hp.t, ls = this.leg[sd];
                let Bt, Bs, Bfo;
                if (ls[0] === 'fk') {
                    Bt = mm4(B.pelvis, M4(ls[1], RIG['thigh_' + sd][1]));
                    Bs = mm4(Bt, M4(ls[2], RIG['shin_' + sd][1]));
                    Bfo = mm4(Bs, M4(ls[3], RIG['foot_' + sd][1]));
                } else {
                    const [Rt, Rs] = ik2(Hh, ls[1], THIGH, SHIN, ls[2], false);
                    Bt = M4(Rt, Hh);
                    const K = V.add(Hh, mv3(Rt, [0, 0, -THIGH]));
                    Bs = M4(Rs, K);
                    const A = V.add(K, mv3(Rs, [0, 0, -SHIN]));
                    Bfo = M4(ls[3] || I3(), A);
                }
                B['thigh_' + sd] = Bt; B['shin_' + sd] = Bs; B['foot_' + sd] = Bfo;
            }
            return B;
        }
        fist_world(B, side) { return pt4(B['hand_' + side], FIST); }

        // Pose no esqueleto ADULTO (G.ADULT): { B, props, effects, water }. As animações são escritas no esqueleto do pacote; aqui
        // os ângulos de cada junta passam para os ossos mais longos. A pélvis sobe na proporção das pernas (o pé no chão continua no
        // chão), os objetos seguem a mão (ou o osso) que os segura, a mão de apoio volta a pegar na arma (IK com os braços novos) e o
        // que está no chão (poça de sangue) só se afasta junto com o corpo. Na água, o corpo fica na mesma altura dos ombros.
        // Membros marcados em `this.abs` (pilotar: mãos no guidão, pés na pedaleira) têm o alvo do IK JÁ no espaço adulto. Os outros
        // braços em IK: o alvo vai para o espaço adulto (armTarget, conforme o `space` de arm_ik) e o IK é refeito com os braços novos
        // (copiar os ângulos do pacote deixava a mão fora do alvo); braço em FK copia os ângulos.
        adult() {
            const Bo = this.bones(), A = G.ADULT;
            if (!A) return { B: Bo, props: this.props, effects: this.effects, water: this.water };
            const kl = A.leg, kt = A.torso, ka = A.arm, abs_ = this.abs || {};
            const tr = (R) => [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
            const loc = (P, C) => mm3(tr(P.R), C.R);
            const inv4 = (Mx) => { const Rt = tr(Mx.R); return M4(Rt, V.mul(mv3(Rt, Mx.t), -1)); };
            const water = this.water !== null && this.water !== undefined;
            // ---- pélvis: o centro dos quadris sobe/afasta na proporção das pernas (em pé); deitado, fica na mesma altura
            const Rp = Bo.pelvis.R, down = mv3(Rp, [0, 0, -3.0]);
            const hc = V.add(Bo.pelvis.t, down), up = clip(Rp[8], 0, 1);
            let hz = ANKLE_H + (hc[2] - ANKLE_H) * kl;
            if (water) hz = hc[2];
            else hz = hc[2] + (hz - hc[2]) * up;
            const hc2 = this.absPelvis ? hc : [hc[0] * kl, hc[1] * kl, hz];
            const B = { root: Bo.root };
            B.pelvis = M4(Rp, V.sub(hc2, down));
            B.chest = mm4(B.pelvis, M4(loc(Bo.pelvis, Bo.chest), V.mul(RIG.chest[1], kt)));
            B.head = mm4(B.chest, M4(loc(Bo.chest, Bo.head), [0, 0, RIG.head[1][2] * kt + (A.neck || 0)]));
            if (A.headUp) B.head = mm4(B.head, M4(Rx(deg(A.headUp))));
            const UP2 = UPPER * ka, LO2 = LOWER * ka;
            const dzW = water ? pt4(Bo.chest, [0, 0, RIG.uarm_R[1][2]])[2] - pt4(B.chest, [0, 0, RIG.uarm_R[1][2] * kt])[2] : null;      // (o deslocamento da água, abaixo)
            const ikT = {};                                                       // alvos adultos usados nos braços IK (para medir: motion.cjs)
            for (const sd of ['R', 'L']) {
                const so = RIG['uarm_' + sd][1], arm = this.arm[sd];
                const sh = mm4(B.chest, M4(loc(Bo.chest, Bo['uarm_' + sd]), [so[0] * (A.width || 1), so[1], so[2] * kt]));
                if (arm[0] === 'ik') {                                           // IK de novo com os braços adultos, no alvo levado ao espaço adulto
                    const T = ikT[sd] = abs_['arm' + sd] ? arm[1] : armTarget(arm[1], arm[4], Bo['uarm_' + sd].t, sh.t, Bo.chest, B.chest, hc, dzW);
                    const [Ru, Rf] = ik2(sh.t, T, UP2, LO2 - FIST[2] * (A.hand || 1), arm[2], true);
                    B['uarm_' + sd] = M4(Ru, sh.t);
                    const E = V.add(sh.t, mv3(Ru, [0, 0, -UP2]));
                    B['farm_' + sd] = M4(Rf, E);
                    // a mão fica com a rotação do pacote (o objeto na mão mira para onde foi escrito); 'body'/'world': gira junto com o antebraço
                    const Rh = arm[3] || (abs_['arm' + sd] ? Rf : !arm[4] || arm[4] === 'reach' ? Bo['hand_' + sd].R : mm3(swingR(col(Bo['farm_' + sd].R, 2), col(Rf, 2)), Bo['hand_' + sd].R));
                    B['hand_' + sd] = M4(Rh, V.add(E, mv3(Rf, [0, 0, -LO2])));
                } else {
                    B['uarm_' + sd] = sh;
                    B['farm_' + sd] = mm4(sh, M4(loc(Bo['uarm_' + sd], Bo['farm_' + sd]), [0, 0, -UP2]));
                    B['hand_' + sd] = mm4(B['farm_' + sd], M4(loc(Bo['farm_' + sd], Bo['hand_' + sd]), [0, 0, -LO2]));
                }
                const ho = RIG['thigh_' + sd][1], leg = this.leg[sd];
                if (leg[0] === 'ik') {
                    // IK de novo com as pernas novas: o pé fica à mesma distância lateral do quadril (os ângulos iguais abririam
                    // as pernas), o passo e a altura do pé crescem com a perna; pé no chão continua no chão.
                    // Pé NO CHÃO (em terra): o alvo vai pelo quadril em REPOUSO (x igual, y × perna) — não pelo quadril de agora, senão
                    // o giro/deslocamento da pélvis arrastava o pé plantado ((perna − 1) × Δ do quadril: ~1 u num giro de 12°). Erguido
                    // (> 0,5 u, até 4 u) passa aos poucos para o quadril de agora (a perna acompanha o corpo: chute, nado, salto).
                    const Hh = pt4(B.pelvis, ho), Ho = pt4(Bo.pelvis, ho), a = leg[1];
                    let T = abs_['leg' + sd] ? a : [Hh[0] + (a[0] - Ho[0]), Hh[1] + (a[1] - Ho[1]) * kl, water ? Hh[2] + (a[2] - Ho[2]) * kl : ANKLE_H + (a[2] - ANKLE_H) * kl];
                    if (!abs_['leg' + sd] && !water && !this.absPelvis) {
                        const w = 1 - clip((a[2] - ANKLE_H - 0.5) / 3.5, 0, 1), s = w * w * (3 - 2 * w);
                        if (s > 0) T = [T[0] + (a[0] + (kl - 1) * RIG.pelvis[1][0] - T[0]) * s, T[1] + (a[1] * kl + (1 - kl) * ho[1] - T[1]) * s, T[2]];
                    }
                    const [Rt, Rs] = ik2(Hh, T, THIGH * kl, SHIN * kl, leg[2], false);
                    B['thigh_' + sd] = M4(Rt, Hh);
                    const K = V.add(Hh, mv3(Rt, [0, 0, -THIGH * kl]));
                    B['shin_' + sd] = M4(Rs, K);
                    B['foot_' + sd] = M4(leg[3] || I3(), V.add(K, mv3(Rs, [0, 0, -SHIN * kl])));
                } else {
                    B['thigh_' + sd] = mm4(B.pelvis, M4(loc(Bo.pelvis, Bo['thigh_' + sd]), ho));
                    B['shin_' + sd] = mm4(B['thigh_' + sd], M4(loc(Bo['thigh_' + sd], Bo['shin_' + sd]), [0, 0, -THIGH * kl]));
                    B['foot_' + sd] = mm4(B['shin_' + sd], M4(loc(Bo['shin_' + sd], Bo['foot_' + sd]), [0, 0, -SHIN * kl]));
                }
            }
            if (water) {                                                          // na água: ombros na mesma altura de antes
                const mid = (Bx) => (pt4(Bx.chest, [0, 0, RIG.uarm_R[1][2] * (Bx === B ? kt : 1)])[2]);
                const dz = mid(Bo) - mid(B);
                for (const k of Object.keys(B)) if (k !== 'root') B[k] = M4(B[k].R, V.add(B[k].t, [0, 0, dz]));
            }
            // ---- objetos: presos à mão mais perto (ou ao osso marcado); no chão, só acompanham o corpo
            const xfer = {};
            const xf = (bone) => xfer[bone] || (xfer[bone] = mm4(B[bone], inv4(Bo[bone])));
            const ground = (q) => M4(I3(), [q[0] * (kl - 1), q[1] * (kl - 1), 0]);
            const fist = { R: pt4(Bo.hand_R, FIST), L: pt4(Bo.hand_L, FIST) };
            // os objetos assados são maiores (G.propK, em volta da empunhadura): um ponto do objeto antigo → o mesmo ponto no novo
            const scaled = (name, lp) => { const g = G.propPivot(name), s = G.propK(name); return V.add(g, V.mul(V.sub(lp, g), s)); };
            const mapVia = (i, q) => pt4(props[i][1], scaled(this.props[i][0], pt4(inv4(this.props[i][1]), q)));
            const props = [], held = [];
            let lastI = -1;
            for (const pr of this.props) {
                const [name, Mp, tag] = pr;
                if (SUB_PROPS[name] && lastI >= 0) {                              // a bomba da escopeta (e a ogiva do RPG, os canos da minigun): no mesmo ponto da arma maior
                    const [pn, Po] = this.props[lastI], Pn = props[lastI][1];
                    const off = scaled(pn, pt4(inv4(Po), Mp.t));
                    props.push([name, M4(mm3(Pn.R, mm3(tr(Po.R), Mp.R)), pt4(Pn, off))]);
                    continue;
                }
                let T;
                if (tag === 'ground') T = ground(Mp.t);
                else if (tag) T = xf(tag);
                else {
                    const gp = pt4(Mp, PROP_GRIP[name] ? PROP_GRIP[name][0] : [0, 0, 0]);
                    const dR = V.len(V.sub(gp, fist.R)), dL = V.len(V.sub(gp, fist.L));
                    if (min(dR, dL) < 7) { T = xf(dR <= dL ? 'hand_R' : 'hand_L'); held.push({ side: dR <= dL ? 'R' : 'L', i: props.length }); }
                    else if (gp[2] < 4) T = ground(gp);
                    else T = xf('chest');
                }
                lastI = props.length;
                props.push([name, mm4(T, Mp)]);
            }
            // a outra mão segurava o mesmo objeto (arma longa, pistola com as duas mãos): IK de novo até o mesmo ponto dele
            for (const h of held) {
                const other = h.side === 'R' ? 'L' : 'R', arm = this.arm[other];
                if (arm[0] !== 'ik' || abs_['arm' + other]) continue;
                const lp = pt4(inv4(this.props[h.i][1]), arm[1]);
                if (abs(lp[0]) > 5 || abs(lp[2]) > (this.props[h.i][0] === 'minigun' ? 8 : 5) || lp[1] < -6 || lp[1] > 32) continue;      // (só a mão NO objeto: cano, cabo, coronha; a alça da minigun)
                const T = ikT[other] = mapVia(h.i, arm[1]), so = RIG['uarm_' + other][1];
                const J = pt4(B.chest, [so[0] * (A.width || 1), so[1], so[2] * kt]);
                const [Ru, Rf] = ik2(J, T, UP2, LO2 - FIST[2] * (A.hand || 1), arm[2], true);
                const E = V.add(J, mv3(Ru, [0, 0, -UP2]));
                B['uarm_' + other] = M4(Ru, J); B['farm_' + other] = M4(Rf, E);
                B['hand_' + other] = M4(arm[3] || Rf, V.add(E, mv3(Rf, [0, 0, -LO2])));
            }
            // ---- efeitos: clarão/cápsula vão com a arma; ondas e respingos (na linha d'água) só se afastam com o corpo
            const nearProp = (q) => {
                let best = -1, bd = 30;
                this.props.forEach(([, Mo], i) => { const d = V.len(V.sub(q, Mo.t)); if (d < bd) { bd = d; best = i; } });
                return best;
            };
            const mapPt = (q, flat = false) => {
                const i = flat ? -1 : nearProp(q);
                if (i >= 0) return mapVia(i, q);
                if (flat || q[2] < 4 || water) return pt4(ground(q), q);
                return pt4(xf('chest'), q);
            };
            const effects = this.effects.map((fx) => {
                const e = Object.assign({}, fx);
                if (fx.pos) {
                    const flat = fx.type === 'ring' || fx.type === 'splash', i = flat ? -1 : nearProp(fx.pos);
                    e.pos = mapPt(fx.pos, flat);
                    if (fx.dir) e.dir = i >= 0 ? mv3(mm3(props[i][1].R, tr(this.props[i][1].R)), fx.dir) : fx.dir;
                }
                if (fx.pts) e.pts = fx.pts.map((q) => mapPt(q));
                if (fx.r) e.r = fx.r * (1 + (kl - 1) * 0.5);
                return e;
            });
            if (water) for (const k of Object.keys(ikT)) ikT[k] = V.add(ikT[k], [0, 0, dzW]);
            return { B, props, effects, water: this.water, ik: ikT };
        }
    }

    const HEAD_TILT = 22.0;      // queixo um pouco pra cima: o rosto aparece da câmera alta
    const HEEL = [0, -3.4, -5.65], TOE = [0, 12.2, -5.65];
    const SHO_R = [16.6, 0.0, 15.6];

    // ------------------------------------------------------------------ utilitários
    const ease = (s) => 0.5 - 0.5 * cos(PI * clip(s, 0, 1));
    const lerp = (a, b, s) => (Array.isArray(a) ? V.lerp(a, b, s) : a * (1 - s) + b * s);
    // Chaves [[t, valor], ...] (número ou lista de números) → valor em t: cúbica monótona (Fritsch–Butland) que passa pelas chaves sem
    // parar nelas (velocidade contínua; o ease por trecho parava em cada chave — com mais quadros, um "anda-para") e sem passar do
    // ponto; velocidade 0 nas pontas e onde o movimento inverte (como o ease de antes): os valores nas chaves não mudam.
    function keys(frames, t) {
        const K = frames.length;
        if (t <= frames[0][0]) return frames[0][1];
        if (t >= frames[K - 1][0]) return frames[K - 1][1];
        let i = 0;
        while (i < K - 2 && t > frames[i + 1][0]) i++;
        const [t0, v0] = frames[i], [t1, v1] = frames[i + 1], h = t1 - t0;
        if (h < 1e-9) return v1;
        const u = (t - t0) / h, u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = 3 * u2 - 2 * u3, h11 = u3 - u2;
        const tan = (k, j) => {                                              // inclinação na chave k (componente j; −1 = número)
            if (k <= 0 || k >= K - 1) return 0;
            const [ta, a] = frames[k - 1], [tb, b] = frames[k], [tc, c] = frames[k + 1], ha = tb - ta, hb = tc - tb;
            if (ha < 1e-9 || hb < 1e-9) return 0;
            const da = ((j < 0 ? b : b[j]) - (j < 0 ? a : a[j])) / ha, db = ((j < 0 ? c : c[j]) - (j < 0 ? b : b[j])) / hb;
            return da * db <= 0 ? 0 : (3 * (ha + hb)) / ((2 * hb + ha) / da + (hb + 2 * ha) / db);
        };
        const one = (j) => h00 * (j < 0 ? v0 : v0[j]) + h10 * h * tan(i, j) + h01 * (j < 0 ? v1 : v1[j]) + h11 * h * tan(i + 1, j);
        return Array.isArray(v0) ? v0.map((_, j) => one(j)) : one(-1);
    }
    const footRot = (yawD, pitchD, rollD = 0.0) => mm3(mm3(Rz(deg(yawD)), Rx(deg(pitchD))), Ry(deg(rollD)));
    function groundLift(pitchD) {
        const R = Rx(deg(pitchD)), zmin = min(mv3(R, HEEL)[2], mv3(R, TOE)[2]);
        return max(0.0, -5.65 - zmin);
    }
    function base() { const p = new Pose(); p.head_R = Rx(deg(HEAD_TILT)); return p; }
    function standLegs(p, width = 12.8, fwd = [0.4, 0.4], toe = 12, drop = 0.0) {
        p.leg_ik('R', [width, fwd[0], ANKLE_H], null, footRot(-toe, 0));
        p.leg_ik('L', [-width, fwd[1], ANKLE_H], null, footRot(toe, 0));
        p.pelvis_t = V.add(p.pelvis_t, [0, 0, -drop]);
    }
    function placeFoot(p, side, pos, yawD = 0.0, pitchD = 0.0, pole = null) {
        const s = side === 'R' ? 1 : -1, [x, y, z] = pos;
        // (a sola no chão: o pé não estica no adulto, mas o Pose.adult estica a altura do tornozelo por ADULT.leg — divide antes)
        p.leg_ik(side, [x, y, ANKLE_H + z + groundLift(pitchD) / (G.ADULT ? G.ADULT.leg : 1)], pole || [0.15 * s, 1.0, 0.0], footRot(yawD, pitchD));
    }
    // Ciclo das pernas. t = 0: calcanhar DIREITO pousando na frente (o esquerdo saindo atrás) em TODO clipe de passada (andar, correr,
    // subir, escalar, pânico, furtivo, de lado, com arma/bolsa/fardo): o jogo leva a fase de um clipe de locomoção para o outro.
    // Pés direto no esqueleto ADULTO (p.abs: o que é desenhado; o pé não estica) e o ponto de apoio anda para trás na velocidade do
    // chão, exato: o calcanhar pousa e o pé baixa girando nele (u 0 → flat), pé chato, o calcanhar sobe girando na PONTA, parada no chão
    // (u roll → 1), e a ponta sai. No ar, tornozelo e inclinação do pé vão de onde a ponta largou até onde o calcanhar pousa (Hermite),
    // saindo e chegando na velocidade do apoio × retract (1 = parado em relação ao chão): sem tranco, sem salto do pé.
    // stride = metade do trecho do pé no apoio (pacote; × STRIDE_K × ADULT.leg no adulto): o pé plantado anda 2·stride em `stance` do
    // ciclo. width = do pé ao meio do corpo com o quadril padrão (7,4; o pé fica width − 7,4 por fora do quadril de cada tipo). lift =
    // altura do pé no ar (pico em u = peak do voo), kick = o calcanhar subindo cedo (correndo). slope: subindo uma rampa (m/m) — o chão à
    // frente é mais alto: o pé pousa mais alto quanto mais à frente e assenta na rampa.
    // Passada do corpo adulto 25% mais longa que a do pacote (G.ADULT): pés plantados em velocidades realistas (Config.anim).
    const STRIDE_K = () => (G.ADULT ? 1.25 : 1);
    const SOLE = ANKLE_H - 5.65;                                          // folga da sola com o pé chato
    const hermite = (a, b, ma, mb, u) => { const u2 = u * u, u3 = u2 * u; return (2 * u3 - 3 * u2 + 1) * a + (u3 - 2 * u2 + u) * ma + (3 * u2 - 2 * u3) * b + (u3 - u2) * mb; };
    const bump = (u, peak) => (u <= 0 || u >= 1 ? 0 : sin(PI * u ** (Math.log(0.5) / Math.log(peak))) ** 2);     // 0 (e parado) nas pontas, 1 em u = peak
    function gait(p, t, { stride = 7.5, lift = 3.5, width = 10.0, toe = 8, stance = 0.5, heel = 14, toeoff = -30, kick = 0.0, slope = 0.0, flat = 0.22, roll = 0.55, retract = 1.0, peak = 0.4, fwd = 0 } = {}) {
        const kl = G.ADULT ? G.ADULT.leg : 1, S = stride * STRIDE_K() * kl, F = fwd * kl, k = ((1 - stance) / stance) * retract, e = 1e-4;
        if (G.ADULT) p.abs = Object.assign(p.abs || {}, { legR: true, legL: true });
        for (const [side, s, ph0] of [['R', 1, t], ['L', -1, t + 0.5]]) {
            const ph = ((ph0 % 1) + 1) % 1, yaw = -s * toe, p0 = (Math.atan(slope * cos(deg(yaw))) * 180) / PI;
            const x = s * (abs(RIG['thigh_' + side][1][0]) + width - 7.4), R0 = footRot(yaw, p0), H0 = mv3(R0, HEEL), T0 = mv3(R0, TOE);
            const pq = (u) => (u < flat ? heel * (1 - u / flat) ** 2 : u > roll ? toeoff * ((u - roll) / (1 - roll)) ** 2 : 0);
            const st = (u) => {                                              // apoio: [tornozelo, inclinação do pé sobre a rampa]
                const y = F + S * (1 - 2 * u), A = [x, y, slope * (y + H0[1]) + SOLE - H0[2]], q = pq(u);
                if (!q) return [A, 0];
                const P = q > 0 ? HEEL : TOE, P0 = q > 0 ? H0 : T0;            // gira no calcanhar (pousando) ou na ponta (saindo), parado no chão
                return [V.sub(V.add(A, P0), mv3(footRot(yaw, p0 + q), P)), q];
            };
            let A, q;
            if (ph < stance) [A, q] = st(ph / stance);
            else {
                const u = (ph - stance) / (1 - stance), [a1, q1] = st(1), [a1e, q1e] = st(1 - e), [b0, q0] = st(0), [b0e, q0e] = st(e);
                A = [0, 1, 2].map((j) => hermite(a1[j], b0[j], ((a1[j] - a1e[j]) / e) * k, ((b0e[j] - b0[j]) / e) * k, u));
                A[2] += kl * (lift * bump(u, peak) + kick * bump(min(1, u / 0.6), 0.45));
                q = hermite(q1, q0, ((q1 - q1e) / e) * k, ((q0e - q0) / e) * k, u);
                const R = footRot(yaw, p0 + q), lo = min(...[HEEL, TOE].map((P) => { const w = V.add(A, mv3(R, P)); return w[2] - slope * w[1] - SOLE; }));
                if (lo < 0) A[2] -= lo;                                      // (rede de segurança: a sola nunca entra no chão)
            }
            p.leg_ik(side, A, [0.15 * s, 1.0, -0.6], footRot(yaw, p0 + q));       // (joelho para a frente; dobrado atrás — calcanhar alto —, para baixo)
        }
    }
    function placeProp(p, name, grip, fwd, up = [0, 0, 1]) {
        const R = lookRot(fwd, up), g = PROP_GRIP[name] ? PROP_GRIP[name][0] : [0, 0, 0];
        const t = V.sub(grip, mv3(R, g)), Mp = M4(R, t);
        p.props.push([name, Mp]);
        return Mp;
    }
    const propPt = (Mp, local) => pt4(Mp, local);
    const chestOrg = (p) => p.bones().chest.t;

    // ------------------------------------------------------------------ REAMOSTRAGEM: mais quadros, o mesmo tempo
    // resample(poses, N, { loop }): K poses-chave (a chave k no tempo k/fps antigo) → N quadros; o quadro i fica no tempo-chave
    // u = i·K/N (loop: dá a volta; sem loop: u para em K−1 — a última pose fica parada o resto do tempo). Entre as chaves: Hermite
    // monótono (C1, sem passar do ponto; tangente 0 nas pontas de um clipe sem loop: 2 chaves = ease) nas translações, alvos de IK e
    // polos, e nos quatérnios das rotações. Braço/perna FK numa chave e IK na outra: a FK vira alvo de IK (o mesmo lugar no esqueleto
    // ADULTO) e interpola como IK. Objetos: casados por índice + nome (em volta da empunhadura; os presos à mão vão com a mão; as
    // peças de uma arma vão com ela); objeto só de um lado = o da chave mais perto, levado junto com a mão/osso que o segura.
    // Efeitos (e o que é discreto: sombra, água, abs) = os da chave mais perto; um efeito de impulso (clarão, rastro… que a chave
    // vizinha não tem) sai num quadro só: o mais perto da sua chave. resample(x, K) devolve x.
    const q2m = (q) => {
        const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1, w = q[0] / n, x = q[1] / n, y = q[2] / n, z = q[3] / n;
        return [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y), 2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x), 2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)];
    };
    function m2q(R) {
        const [a, b, c, d, e, f, g, h, i] = R, t = a + e + i;
        if (t > 0) { const s = Math.sqrt(t + 1) * 2; return [0.25 * s, (h - f) / s, (c - g) / s, (d - b) / s]; }
        if (a > e && a > i) { const s = Math.sqrt(1 + a - e - i) * 2; return [(h - f) / s, 0.25 * s, (b + d) / s, (c + g) / s]; }
        if (e > i) { const s = Math.sqrt(1 + e - a - i) * 2; return [(c - g) / s, (b + d) / s, 0.25 * s, (f + h) / s]; }
        const s = Math.sqrt(1 + i - a - e) * 2; return [(d - b) / s, (c + g) / s, (f + h) / s, 0.25 * s];
    }
    const ortho = (R) => { const c0 = [R[0], R[3], R[6]], c1 = [R[1], R[4], R[7]], c2 = [R[2], R[5], R[8]]; return abs(V.dot(c0, c0) - 1) < 1e-6 && abs(V.dot(c1, c1) - 1) < 1e-6 && abs(V.dot(c2, c2) - 1) < 1e-6 && abs(V.dot(c0, c1)) < 1e-6 && abs(V.dot(c1, c2)) < 1e-6 && abs(V.dot(c0, c2)) < 1e-6; };
    const trR = (R) => [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
    const inv4 = (Mx) => { const Rt = trR(Mx.R); return M4(Rt, V.mul(mv3(Rt, Mx.t), -1)); };
    // tangente monótona numa chave (d0, d1 = degraus antes/depois): 0 nos extremos, nunca mais que 3× o menor degrau
    const slope = (d0, d1) => (d0 * d1 <= 0 ? 0 : Math.sign(d0) * min(abs(d0 + d1) / 2, 3 * min(abs(d0), abs(d1))));
    // Hermite entre b e c (a, d = vizinhas; null = ponta do clipe → tangente 0), f ∈ [0, 1]; números ou listas de números
    function herm(a, b, c, d, f) {
        const f2 = f * f, f3 = f2 * f, h00 = 2 * f3 - 3 * f2 + 1, h10 = f3 - 2 * f2 + f, h01 = -2 * f3 + 3 * f2, h11 = f3 - f2;
        const one = (A, Bv, Cv, Dv) => { const d1 = Cv - Bv; return h00 * Bv + h10 * (A === null ? 0 : slope(Bv - A, d1)) + h01 * Cv + h11 * (Dv === null ? 0 : slope(d1, Dv - Cv)); };
        if (!Array.isArray(b)) return one(a === null || a === undefined ? null : a, b, c, d === null || d === undefined ? null : d);
        return b.map((v, j) => one(a ? a[j] : null, v, c[j], d ? d[j] : null));
    }
    // rotação: quatérnios no mesmo hemisfério, Hermite por componente e normaliza (matriz que não é rotação pura: por elemento)
    function hermR(a, b, c, d, f) {
        if (![a, b, c, d].every((R) => !R || ortho(R))) return herm(a, b, c, d, f);
        const qb = m2q(b), al = (q, ref) => (q[0] * ref[0] + q[1] * ref[1] + q[2] * ref[2] + q[3] * ref[3] < 0 ? q.map((v) => -v) : q);
        const qc = al(m2q(c), qb), qa = a ? al(m2q(a), qb) : null, qd = d ? al(m2q(d), qc) : null;
        return q2m(herm(qa, qb, qc, qd, f));
    }
    function hermM(a, b, c, d, f, piv = [0, 0, 0]) {                        // matriz 4×4 em volta de um ponto local (a empunhadura)
        const g = (M) => (M ? pt4(M, piv) : null), R = hermR(a && a.R, b.R, c.R, d && d.R, f);
        return M4(R, V.sub(herm(g(a), g(b), g(c), g(d), f), mv3(R, piv)));
    }
    function clonePose(p) {
        const q = new Pose(), cp = (v) => (Array.isArray(v) ? v.map(cp) : v && typeof v === 'object' ? Object.assign({}, v, v.R && v.t ? { R: v.R.slice(), t: v.t.slice() } : {}) : v);
        for (const k of Object.keys(p)) q[k] = cp(p[k]);
        q.arm = { R: cp(p.arm.R), L: cp(p.arm.L) }; q.leg = { R: cp(p.leg.R), L: cp(p.leg.L) };
        q.props = p.props.map((pr) => [pr[0], M4(pr[1].R.slice(), pr[1].t), ...pr.slice(2)]);
        q.effects = p.effects.map((e) => Object.assign({}, e, e.pos ? { pos: e.pos.slice() } : {}, e.dir ? { dir: e.dir.slice() } : {}, e.pts ? { pts: e.pts.map((v) => v.slice()) } : {}));
        if (p.abs) q.abs = Object.assign({}, p.abs);
        return q;
    }
    function resample(P, N, { loop = false } = {}) {
        const K = P.length;
        if (!K || N === K) return P.slice();
        const bc = new Map(), ac = new Map();
        const bonesOf = (p) => { let b = bc.get(p); if (!b) bc.set(p, (b = p.bones())); return b; };
        const adultOf = (p) => { let b = ac.get(p); if (!b) ac.set(p, (b = p.adult().B)); return b; };
        const at = (k) => (loop ? P[((k % K) + K) % K] : k < 0 || k >= K ? null : P[k]);
        const us = []; for (let i = 0; i < N; i++) us.push(loop ? (i * K) / N : min((i * K) / N, K - 1));
        // ---- membro de uma chave no tipo pedido ('fk' | 'ik'); IK vindo de FK = o mesmo lugar no esqueleto adulto
        const kl = G.ADULT ? G.ADULT.leg : 1;
        function limbAs(p, kind, sd, type, space) {
            const sp = p[kind][sd];
            if (sp[0] === type) return sp;
            const B = bonesOf(p), A = G.ADULT;
            if (kind === 'arm') {
                const Bu = B['uarm_' + sd], Bf = B['farm_' + sd], Bh = B['hand_' + sd];
                if (type === 'fk') return ['fk', mm3(trR(B.chest.R), Bu.R), mm3(trR(Bu.R), Bf.R), mm3(trR(Bf.R), Bh.R)];
                let T = V.add(Bf.t, mv3(Bf.R, [0, 0, -(LOWER - FIST[2])])), pole = V.sub(Bf.t, Bu.t);
                if (A && !(p.abs && p.abs['arm' + sd])) {                   // o ponto que a FK alcança no ADULTO, de volta ao pacote (o inverso de armTarget)
                    const Ba = adultOf(p), Ta = V.add(Ba['farm_' + sd].t, mv3(Ba['farm_' + sd].R, [0, 0, -(LOWER * A.arm - FIST[2] * (A.hand || 1))]));
                    if (space === 'body') { const q = tmv3(Ba.chest.R, V.sub(Ta, Ba.chest.t)); T = pt4(B.chest, [q[0] / (A.width || 1), q[1], q[2] / A.torso]); }
                    else if (space === 'world') {                           // (na água a altura volta igual: o adulto já vem deslocado)
                        const hc = V.add(B.pelvis.t, mv3(B.pelvis.R, [0, 0, -3.0])), wet = p.water !== null && p.water !== undefined;
                        T = [Ta[0] - (kl - 1) * hc[0], Ta[1] / kl, wet ? Ta[2] : ANKLE_H + (Ta[2] - ANKLE_H) / kl];
                    } else {
                        const r = (A.arm * (UPPER + LOWER) - FIST[2] * (A.hand || 1)) / (UPPER + LOWER - FIST[2]);
                        T = V.add(Bu.t, mv3(B.chest.R, V.mul(tmv3(Ba.chest.R, V.sub(Ta, Ba['uarm_' + sd].t)), 1 / r)));
                    }
                    pole = V.sub(Ba['farm_' + sd].t, Ba['uarm_' + sd].t);
                }
                return ['ik', T, pole, Bh.R];
            }
            const Bt = B['thigh_' + sd], Bs = B['shin_' + sd], Bo = B['foot_' + sd];
            if (type === 'fk') return ['fk', mm3(trR(B.pelvis.R), Bt.R), mm3(trR(Bt.R), Bs.R), mm3(trR(Bs.R), Bo.R)];
            let T = Bo.t, pole = V.sub(Bs.t, Bt.t);
            if (A && !(p.abs && p.abs['leg' + sd])) {                       // inverso do mapeamento do pé em Pose.adult
                const Ba = adultOf(p), Fa = Ba['foot_' + sd].t, Hh = Ba['thigh_' + sd].t, Ho = Bt.t, wet = p.water !== null && p.water !== undefined;
                T = [Ho[0] + (Fa[0] - Hh[0]), Ho[1] + (Fa[1] - Hh[1]) / kl, wet ? Ho[2] + (Fa[2] - Hh[2]) / kl : ANKLE_H + (Fa[2] - ANKLE_H) / kl];
                pole = V.sub(Ba['shin_' + sd].t, Hh);
            }
            return ['ik', T, pole, Bo.R];
        }
        function limb(a, b, c, d, kind, sd, f, near) {
            const type = b[kind][sd][0] === c[kind][sd][0] ? b[kind][sd][0] : 'ik';
            const ikS = [near, b === near ? c : b].map((p) => p[kind][sd]).find((s) => s[0] === 'ik'), space = ikS && ikS[4] ? ikS : null;      // (o space da chave IK mais perto)
            const S = [a, b, c, d].map((p) => (p ? limbAs(p, kind, sd, type, space && space[4]) : null)), [sa, sb, sc, sdd] = S;
            if (type === 'fk') return ['fk', ...[1, 2, 3].map((j) => hermR(sa && sa[j], sb[j], sc[j], sdd && sdd[j], f))];
            const pn = (s) => (s ? nrm(s[2]) : null);
            let rot = null;
            if (sb[3] || sc[3]) {                                            // mão/pé com rotação dada numa das chaves: a da outra = a do IK dela
                const r = (s, p) => (s ? s[3] || (kind === 'arm' ? bonesOf(p)['hand_' + sd].R : bonesOf(p)['foot_' + sd].R) : null);
                rot = hermR(r(sa, a), r(sb, b), r(sc, c), r(sdd, d), f);
            }
            const out = ['ik', herm(sa && sa[1], sb[1], sc[1], sdd && sdd[1], f), herm(pn(sa), pn(sb), pn(sc), pn(sdd), f), rot];
            if (space) out.push(space[4]);
            return out;
        }
        // ---- objetos
        const fistOf = (p) => { const B = bonesOf(p); return { R: pt4(B.hand_R, FIST), L: pt4(B.hand_L, FIST) }; };
        const holder = (p, pr) => {                                          // quem segura o objeto nesta chave: 'hand_R' | 'hand_L' | osso | null
            if (pr[2]) return pr[2] === 'ground' ? null : pr[2];
            const g = pt4(pr[1], PROP_GRIP[pr[0]] ? PROP_GRIP[pr[0]][0] : [0, 0, 0]), F = fistOf(p), dR = V.len(V.sub(g, F.R)), dL = V.len(V.sub(g, F.L));
            return min(dR, dL) < 7 ? (dR <= dL ? 'hand_R' : 'hand_L') : g[2] < 4 ? null : 'chest';
        };
        const same = (x, y) => x && y && x[0] === y[0] && x[2] === y[2];
        function props(a, b, c, d, f, near, pose) {
            const other = near === b ? c : b, Bn = pose.bones(), out = [];
            near.props.forEach((pr, j) => {
                const [name] = pr, po = other.props[j], piv = PROP_GRIP[name] ? PROP_GRIP[name][0] : [0, 0, 0];
                const pb = b.props[j], pc = c.props[j], pa = a && same(a.props[j], pb) ? a.props[j] : null, pd = d && same(d.props[j], pc) ? d.props[j] : null;
                const sub = SUB_PROPS[name] && j > 0 && out[j - 1];
                if (sub) {                                                   // peça da arma: presa à arma (interpolada) pela relação de cada chave
                    const rel = (p, jj) => (p && p.props[jj] && p.props[jj - 1] && same(p.props[jj], pr) ? mm4(inv4(p.props[jj - 1][1]), p.props[jj][1]) : null);
                    const Lb = rel(b, j), Lc = rel(c, j), Ln = rel(near, j);
                    const L = Lb && Lc ? hermM(rel(a, j), Lb, Lc, rel(d, j), f) : Ln;
                    out.push([name, mm4(out[j - 1][1], L), ...pr.slice(2)]);
                    return;
                }
                if (same(po, pr)) {
                    const hb = holder(b, pb), hc = holder(c, pc);
                    if (hb && hb === hc) {                                   // preso ao mesmo osso nas duas chaves e parado nele: vai com o osso
                        const Lb = mm4(inv4(bonesOf(b)[hb]), pb[1]), Lc = mm4(inv4(bonesOf(c)[hc]), pc[1]);
                        if (V.len(V.sub(Lb.t, Lc.t)) < 0.3 && Lb.R.every((v, k) => abs(v - Lc.R[k]) < 0.03)) { out.push([name, mm4(Bn[hb], hermM(null, Lb, Lc, null, f)), ...pr.slice(2)]); return; }
                    }
                    out.push([name, hermM(pa && pa[1], pb[1], pc[1], pd && pd[1], f, piv), ...pr.slice(2)]);
                    return;
                }
                const h = holder(near, pr);                                  // só nesta chave: vai junto com quem o segura
                out.push([name, h ? mm4(mm4(Bn[h], inv4(bonesOf(near)[h])), pr[1]) : M4(pr[1].R.slice(), pr[1].t), ...pr.slice(2)]);
            });
            return out;
        }
        // ---- efeitos: levados junto com o objeto (ou a mão) mais perto deles na chave de origem
        function moveFx(e, src, pose) {
            const q = Object.assign({}, e);
            if (e.type === 'ring' || e.type === 'splash' || !(e.pos || e.pts)) return q;
            const ref = e.pos || e.pts[0];
            let best = -1, bd = 30;
            src.props.forEach(([, Mo], i) => { const dd = V.len(V.sub(ref, Mo.t)); if (dd < bd) { bd = dd; best = i; } });
            let D = null;
            if (best >= 0 && pose.props[best] && pose.props[best][0] === src.props[best][0]) D = mm4(pose.props[best][1], inv4(src.props[best][1]));
            else { const F = fistOf(src), sd = V.len(V.sub(ref, F.R)) <= V.len(V.sub(ref, F.L)) ? 'R' : 'L'; if (V.len(V.sub(ref, F[sd])) < 10) D = mm4(pose.bones()['hand_' + sd], inv4(bonesOf(src)['hand_' + sd])); }
            if (!D) return q;
            if (e.pos) q.pos = pt4(D, e.pos);
            if (e.dir) q.dir = mv3(D.R, e.dir);
            if (e.pts) q.pts = e.pts.map((v) => pt4(D, v));
            return q;
        }
        const impulse = (k, e) => ![k - 1, k + 1].some((j) => { const p = at(j); return p && p !== P[k] && p.effects.some((x) => x.type === e.type); });
        const out = us.map((u) => {
            const k = Math.floor(u + 1e-9), f = u - k;
            if (f < 1e-9) { const p = clonePose(at(k)); p.effects = []; p._src = at(k); return p; }
            const a = at(k - 1), b = at(k), c = at(k + 1), d = at(k + 2), near = f <= 0.5 ? b : c, p = new Pose();
            p.pelvis_t = herm(a && a.pelvis_t, b.pelvis_t, c.pelvis_t, d && d.pelvis_t, f);
            for (const r of ['pelvis_R', 'chest_R', 'head_R']) p[r] = hermR(a && a[r], b[r], c[r], d && d[r], f);
            if (b.root || c.root) { const rr = (x) => (x ? x.root || I3() : null); p.root = hermR(rr(a), rr(b), rr(c), rr(d), f); }
            const num = (x, key, dflt) => (x ? (x[key] === undefined ? dflt : x[key]) : null);
            p.scale = herm(num(a, 'scale', 1), num(b, 'scale', 1), num(c, 'scale', 1), num(d, 'scale', 1), f);
            p.shadowScale = herm(num(a, 'shadowScale', 1), num(b, 'shadowScale', 1), num(c, 'shadowScale', 1), num(d, 'shadowScale', 1), f);
            const wn = (x) => (x && typeof x.water === 'number' ? x.water : null);
            p.water = wn(b) !== null && wn(c) !== null ? herm(wn(a), wn(b), wn(c), wn(d), f) : near.water;
            p.shadow = near.shadow;
            if (near.abs) p.abs = Object.assign({}, near.abs);
            if (near.absPelvis) p.absPelvis = near.absPelvis;
            if (near.occ) p.occ = near.occ;
            for (const sd of ['R', 'L']) { p.arm[sd] = limb(a, b, c, d, 'arm', sd, f, near); p.leg[sd] = limb(a, b, c, d, 'leg', sd, f, near); }
            p.props = props(a, b, c, d, f, near, p);
            p._src = near;
            return p;
        });
        // efeitos: os contínuos vêm da chave mais perto; o impulso, só no quadro mais perto da sua chave
        const cdist = (u, k) => (loop ? min(abs(u - k), K - abs(u - k)) : abs(u - k));
        out.forEach((p) => { const src = p._src, ks = P.indexOf(src); p.effects = src.effects.filter((e) => !impulse(ks, e)).map((e) => moveFx(e, src, p)); });
        P.forEach((src, k) => {
            const imp = src.effects.filter((e) => impulse(k, e));
            if (!imp.length) return;
            let bi = 0; us.forEach((u, i) => { if (cdist(u, k) < cdist(us[bi], k) - 1e-9) bi = i; });
            for (const e of imp) out[bi].effects.push(moveFx(e, src, out[bi]));
        });
        for (const p of out) delete p._src;
        return out;
    }

    // ------------------------------------------------------------------ locomoção
    // Parado: pés na largura do quadril, joelhos quase esticados, respirando (o peito sobe e desce) e o peso balançando de leve de um pé
    // para o outro (a pélvis vai de lado; os pés ficam plantados).
    function idle(n = 6) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, b = sin(TAU * t), p = base();
            p.pelvis_t = [0.3 * b, 0, -0.2 + 0.2 * cos(TAU * t)];
            p.chest_R = Rx(deg(-1.2 * b));
            p.head_R = Rx(deg(HEAD_TILT + 1.5 * b));
            standLegs(p, 10.5, [0.4, 0.4], 10);
            p.arm_fk('R', { flex: 4 + 1.5 * b, abd: 12 + 1.6 * cos(TAU * t), elbow: 14 + 2 * b });
            p.arm_fk('L', { flex: 4 + 1.5 * b, abd: 12 + 1.6 * cos(TAU * t), elbow: 14 + 2 * b });
            out.push(p);
        }
        return out;
    }
    // Tronco e braços do andar. lean = inclinação do tronco para a FRENTE (graus; a cabeça compensa e continua olhando à frente). A
    // pélvis gira com a perna que vai à frente, o peito ao contrário; os braços balançam contra as pernas (o direito atrás quando o pé
    // direito pousa), um pouco atrasados (pêndulo), e o cotovelo dobra mais com o braço à frente.
    function walkUpper(p, t, arms = true, amp = 24, lean = 3.0) {
        const c = cos(TAU * t), ca = cos(TAU * (t - 0.04));
        p.pelvis_R = Rz(deg(5 * c));
        p.chest_R = mm3(Rz(deg(-9 * c)), Rx(deg(-lean)));
        p.head_R = mm3(Rz(deg(4 * c)), Rx(deg(HEAD_TILT + lean * 0.6)));
        if (arms) {
            p.arm_fk('R', { flex: -amp * ca + 3, abd: 11, elbow: 14 + 7 * (1 - ca) });
            p.arm_fk('L', { flex: amp * ca + 3, abd: 11, elbow: 14 + 7 * (1 + ca) });
        }
    }
    // Pernas e pélvis do andar (qualquer arma): apoio 60% do ciclo (os dois pés no chão de t 0 a 0,1 e de 0,5 a 0,6), a pélvis mais
    // baixa no apoio duplo e mais alta no meio do apoio simples, deslocando-se de leve para o lado do pé de apoio. Pé plantado a
    // 1,6 m/s com ritmo 1 (Config.anim.walk; ciclo de 0,8 s).
    const WALK = { stride: 9.4, stance: 0.6, lift: 1.5, width: 8.0, heel: 16, toeoff: -32 };
    function walkLegs(p, t, o = WALK) {
        p.pelvis_t = [0.6 * sin(TAU * (t - 0.05)), 0, -0.7 - 0.7 * cos(2 * TAU * (t - 0.05))];
        gait(p, t, o);
    }
    function walk(n = 8, arms = true) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, p = base();
            walkLegs(p, t);
            walkUpper(p, t, arms);
            out.push(p);
        }
        return out;
    }
    // Pernas e tronco da corrida (qualquer arma): apoio 38% (fase de voo: os dois pés no ar de t 0,38 a 0,5 e de 0,88 a 1), o
    // calcanhar sobe cedo no voo, pélvis mais baixa no meio do apoio (amortece) e mais alta no voo, tronco inclinado para a frente.
    // Pé plantado a 4,3 m/s com ritmo 1 (Config.anim.run; ciclo de 0,571 s).
    const RUN = { stride: 10.82, lift: 3.5, width: 7.8, stance: 0.36, heel: 8, toeoff: -38, kick: 1.5, retract: 0.8, peak: 0.45, fwd: -3.5 };
    function runLegs(p, t, o = RUN) {
        const c = cos(TAU * t);
        p.pelvis_t = [0.4 * sin(TAU * (t - 0.1)), 1.5, (G.ADULT ? -1.5 : -3.2) - 0.9 * cos(2 * TAU * (t - 0.18))];
        p.pelvis_R = mm3(Rz(deg(8 * c)), Rx(deg(-10)));
        p.chest_R = mm3(Rz(deg(-15 * c)), Rx(deg(-6)));
        p.head_R = mm3(Rz(deg(7 * c)), Rx(deg(HEAD_TILT + 12)));
        gait(p, t, o);
        return c;
    }
    function run(n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, p = base(), ca = cos(TAU * (t - 0.03));            // (braços um pouco atrasados; cotovelo fecha à frente)
            runLegs(p, t);
            p.arm_fk('R', { flex: -42 * ca + 10, abd: 14, elbow: 84 - 12 * ca });
            p.arm_fk('L', { flex: 42 * ca + 10, abd: 14, elbow: 84 + 12 * ca });
            out.push(p);
        }
        return out;
    }

    // ------------------------------------------------------------------ subida (morro, encosta)
    // Subindo (rampa 0,42): o chão à frente é mais alto (gait com slope), o corpo inclina para a frente (pélvis e peito), o joelho da
    // frente pousa dobrado, os braços trabalham mais. Pé plantado a 0,77 da velocidade do andar (SpriteActor.CLIMB.upStride).
    const WALK_UP = { stride: 7.24, stance: 0.6, lift: 4.0, width: 8.0, slope: 0.42, heel: 8, toeoff: -30, flat: 0.25 };
    function walkUp(n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, p = base();
            p.pelvis_t = [0.5 * sin(TAU * (t - 0.05)), 1.5, -2.8 - 1.1 * cos(2 * TAU * (t - 0.05))];
            walkUpper(p, t, true, 28, 9);
            p.pelvis_R = mm3(p.pelvis_R, Rx(deg(-7)));
            gait(p, t, WALK_UP);
            out.push(p);
        }
        return out;
    }
    // Encosta íngreme (0,85): escalando de quatro — tronco bem inclinado para a frente, joelhos altos, e as mãos apoiando na encosta à
    // frente, alternadas em diagonal com os pés (a mão direita apoia junto com o pé esquerdo). Mãos e pés no esqueleto ADULTO (abs),
    // plantados na encosta: andam para trás na velocidade do chão enquanto apoiam (nada desliza). Pé plantado a CLIMB_K × a do andar.
    const CLIMB = { stride: 5.6, stance: 0.62, lift: 5.0, width: 8.6, slope: 0.85, heel: 6, toeoff: -24, flat: 0.25, roll: 0.6, peak: 0.45 };
    function climb(n = 10) {
        const out = [], C = CLIMB, SL = C.slope, kl = G.ADULT ? G.ADULT.leg : 1;
        const vg = (2 * C.stride * STRIDE_K() * kl) / C.stance, hs = 0.56, L = vg * hs, Y0 = 26 * kl, HZ = 3.0, k = 0.5;
        for (let i = 0; i < n; i++) {
            const t = i / n, c = cos(TAU * t), p = base();
            p.pelvis_t = [0.5 * sin(TAU * (t - 0.05)), 3.0, -7.0 - 1.2 * cos(2 * TAU * (t - 0.05))];
            p.pelvis_R = mm3(Rz(deg(5 * c)), Rx(deg(-24)));
            p.chest_R = mm3(Rz(deg(-8 * c)), Rx(deg(-26)));
            p.head_R = mm3(Rz(deg(4 * c)), Rx(deg(HEAD_TILT + 36)));            // olha encosta acima
            gait(p, t, C);
            for (const [side, s, ph0] of [['R', 1, t + 0.5], ['L', -1, t]]) {
                const ph = ph0 % 1.0;
                let y, z = 0;
                if (ph < hs) y = Y0 - L * (ph / hs);                           // apoiada: anda para trás com o chão (o corpo passa por cima)
                else { const u = (ph - hs) / (1 - hs), m = -L / hs * (1 - hs) * k; y = hermite(Y0 - L, Y0, m, m, u); z = 5.0 * kl * bump(u, 0.5); }   // solta e agarra mais acima
                p.arm_ik(side, [s * 13.0, y, SL * y + HZ + z], [s * 1.0, -0.3, -0.5]);
            }
            if (G.ADULT) p.abs = Object.assign(p.abs || {}, { armR: true, armL: true });
            out.push(p);
        }
        return out;
    }

    // ------------------------------------------------------------------ armas
    const WEAPON_HOLD = {
        pistol: { grip: [8.0, 25.0, 9.5], chest_yaw: 12, head_yaw: -8, poleR: [1.0, -0.3, -1.0], poleL: [-1.0, -0.2, -0.9], one_hand: true },
        smg: { grip: [7.0, 4.5, 6.6], chest_yaw: -24, head_yaw: 20, poleR: [1.0, -0.6, -0.7], poleL: [-0.5, -0.1, -1.0] },
        shotgun: { grip: [7.0, 3.5, 6.2], chest_yaw: -24, head_yaw: 20, poleR: [1.0, -0.6, -0.7], poleL: [-0.5, -0.1, -1.0] },
        rifle: { grip: [7.0, 3.0, 7.0], chest_yaw: -26, head_yaw: 22, poleR: [1.0, -0.6, -0.7], poleL: [-0.5, -0.1, -1.0] },
        rifle_ak: { grip: [7.0, 3.5, 6.8], chest_yaw: -26, head_yaw: 22, poleR: [1.0, -0.6, -0.7], poleL: [-0.5, -0.1, -1.0] },
        // armas novas do jogador: a pistola com silenciador como a pistola; RPG e lança-foguetes no ombro direito (o tubo passa ao
        // lado da cabeça); a minigun na altura do quadril, as duas mãos nela
        pistol_sil: { grip: [8.0, 25.0, 9.5], chest_yaw: 12, head_yaw: -8, poleR: [1.0, -0.3, -1.0], poleL: [-1.0, -0.2, -0.9], one_hand: true },
        revolver: { grip: [8.0, 25.0, 9.5], chest_yaw: 12, head_yaw: -8, poleR: [1.0, -0.3, -1.0], poleL: [-1.0, -0.2, -0.9], one_hand: true },      // (o revólver da folha: como a pistola)
        rpg: { grip: [12.0, 0.0, 16.0], chest_yaw: -26, head_yaw: 20, poleR: [1.0, -0.3, -1.0], poleL: [-0.4, -0.3, -1.0] },
        launcher: { grip: [12.0, 0.0, 15.0], chest_yaw: -26, head_yaw: 20, poleR: [1.0, -0.3, -1.0], poleL: [-0.4, -0.3, -1.0] },
        minigun: { grip: [9.5, 7.0, -3.0], chest_yaw: -12, head_yaw: 8, poleR: [1.0, -0.6, -0.5], poleL: [-0.7, -0.2, -0.8] },
    };
    // peças que vão presas na arma anterior (Pose.adult): a bomba da escopeta, a ogiva do RPG, o feixe de canos da minigun
    const SUB_PROPS = { pump: 1, rpg_head: 1, minibar: 1 };
    const FOGOS = Object.keys(G.ARMA_PROPS || {}).filter((n) => /^molotov_fogo\d+$/.test(n)).sort();      // o fogo do molotov (quadros da folha)
    for (const n of FOGOS) SUB_PROPS[n] = 1;
    const HEAVY = (name) => name === 'rpg' || name === 'launcher' || name === 'minigun';
    // As peças móveis de cada arma: ogiva (some depois do disparo: fired) e os canos girando (spin, graus).
    function subProps(p, name, Mp, { fired = false, spin = 0 } = {}) {
        if (name === 'rpg' && !fired) p.props.push(['rpg_head', mm4(Mp, M4(null, (PROP_MOUNT && PROP_MOUNT.rpg) || [0, 13.5, 4.6]))]);
        if (name === 'minigun') p.props.push(['minibar', mm4(Mp, M4(Ry(deg(spin)), (PROP_MOUNT && PROP_MOUNT.minigun) || [0, 7.4, 2.4]))]);
    }
    const CTX = { rifle: 'rifle', melee: 'bat' };          // escolhas de arma do personagem (o build define antes de gerar as poses)
    const LONG = (name) => name === 'smg' || name === 'shotgun' || name === 'rifle' || name === 'rifle_ak' || HEAVY(name);

    // Arma na mão e os dois braços resolvidos. recoil = graus de subida do cano, kick = recuo, pump = bombear a escopeta (0..1).
    function holdWeapon(p, name, { recoil = 0.0, kick = 0.0, pump = 0.0, bob = [0, 0, 0], flash = null, casing = null, chest_extra = 0.0, aim_yaw = 0.0, keepChest = false, freeL = false, fired = false, spin = 0 } = {}) {
        const h = WEAPON_HOLD[name];
        if (!keepChest) {
            p.chest_R = mm3(Rz(deg(h.chest_yaw)), Rx(deg(-2 + chest_extra)));
            p.head_R = mm3(Rz(deg(h.head_yaw)), Rx(deg(HEAD_TILT - 4)));
        }
        const corg = chestOrg(p);
        const grip = V.add(V.add(V.add(corg, h.grip), [0, -kick, 0]), bob);
        let fwd = mv3(Rz(deg(aim_yaw)), mv3(Rx(deg(recoil)), [0, 1.0, 0]));
        if (LONG(name)) fwd = nrm(V.add(fwd, [-0.07, 0, 0]));
        const Mp = placeProp(p, name, grip, fwd);
        let lf;
        if (name === 'shotgun') {
            p.props.push(['pump', mm4(Mp, M4(null, [0, PUMP_Y - PUMP_TRAVEL * pump, 0.7]))]);
            lf = propPt(Mp, [0, PUMP_Y - PUMP_TRAVEL * pump, -1.2]);
        } else lf = propPt(Mp, PROP_GRIP[name][1]);
        subProps(p, name, Mp, { fired, spin });
        p.arm_ik('R', grip, h.poleR);
        if (freeL) { /* o braço esquerdo fica com quem chamou (carregando bolsa) */ }
        else if (h.one_hand) p.arm_fk('L', { flex: 14 + recoil * 0.3, abd: 16, elbow: 34 });
        else p.arm_ik('L', lf, h.poleL);
        if (flash) p.effects.push({ type: 'flash', pos: propPt(Mp, PROP_MUZZLE[name]), dir: fwd, size: flash[0], variant: flash[1] });
        if (casing) p.effects.push({ type: 'casing', pos: V.add(propPt(Mp, name === 'minigun' ? [3.0, 3.0, 2.4] : [0, 2.0, 2.4]), casing) });
        return Mp;
    }
    function gunIdle(name, n = 4) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, b = sin(TAU * t), p = base();
            p.pelvis_t = [0, 0, -0.9 + 0.35 * cos(TAU * t)];
            standLegs(p, 11.5, [-1.5, 2.5]);
            holdWeapon(p, name, { bob: [0, 0, 0.35 * b] });
            out.push(p);
        }
        return out;
    }
    function gunWalk(name, n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, p = base();
            walkLegs(p, t);                                                     // (as pernas e a pélvis do andar: fase e pé plantado iguais)
            p.pelvis_R = Rz(deg(4 * cos(TAU * t)));
            holdWeapon(p, name);
            p.chest_R = mm3(Rz(deg(-4 * cos(TAU * t))), p.chest_R);          // o peito desfaz a guinada da pélvis: tronco firme na mira
            p.props = [];
            holdWeapon(p, name, { keepChest: true });                         // (sem keepChest a 2ª chamada apagava a contra-rotação)
            out.push(p);
        }
        return out;
    }
    // KNEELING: o mesmo tiro com um joelho no chão (crouch_shoot: kneelLegs no lugar das pernas em pé).
    let KNEELING = false;
    function gunShoot(name, seq, standFwd = [-1.5, 2.5]) {
        return seq.map((s) => {
            const p = base();
            if (KNEELING) kneelLegs(p, 0, 0.6 * (s.kick || 0));
            else {
                p.pelvis_t = [0, name === 'shotgun' ? -0.4 * (s.kick || 0) : 0, name === 'shotgun' ? -1.0 : -0.9];
                standLegs(p, 11.5, standFwd);
            }
            holdWeapon(p, name, s);
            return p;
        });
    }
    const pistolShoot = () => gunShoot('pistol', [{ recoil: 3, kick: 0.6, flash: [1.25, 0] }, { recoil: 18, kick: 2.4, casing: [2.5, -1, 2] }, { recoil: 7, kick: 1.0, casing: [5.5, -2.5, 0] }, { recoil: 1, kick: 0.2 }]);
    const smgShoot = (name = 'smg') => gunShoot(name, [{ recoil: 4, kick: 1.4, flash: [1.3, 0], casing: [3, 0, 2] }, { recoil: 1.5, kick: 0.4, casing: [6, -2, 0] }, { recoil: 5, kick: 1.6, flash: [1.1, 1], casing: [3, 0, 2] }, { recoil: 1.5, kick: 0.5, casing: [6, -2, 0] }]);
    const shotgunShoot = () => gunShoot('shotgun', [{ recoil: 6, kick: 1.5, flash: [1.8, 0], chest_extra: 2 }, { recoil: 17, kick: 3.6, chest_extra: 7 }, { recoil: 8, kick: 1.6, chest_extra: 3 },
        { recoil: 2, kick: 0.6, pump: 1.0 }, { recoil: 2, kick: 0.6, pump: 1.0, casing: [5, -2, 2] }, { recoil: 1, kick: 0.3, pump: 0.0 }, { recoil: 0.5, kick: 0.0 }]);
    const rifleShoot = (name = CTX.rifle) => gunShoot(name, [{ recoil: 4, kick: 1.5, flash: [1.4, 0], casing: [3, 0, 2] }, { recoil: 1.5, kick: 0.5, casing: [6, -2, 0] }, { recoil: 5, kick: 1.7, flash: [1.2, 1], casing: [3, 0, 2] }, { recoil: 1.5, kick: 0.5, casing: [6, -2, 0] }]);
    // silenciador: clarão pequeno; RPG: a ogiva sai (some) e o tubo dá o tranco no ombro; lança-foguetes: tranco menor;
    // minigun (loop): os canos giram 60°/n por quadro (6 canos: o ciclo fecha em 60°; 6 quadros = 10° por quadro), clarão em todos.
    // revólver: um tiro só, mais forte (o cano sobe mais e a mão recua mais que na pistola), o clarão maior
    const revolverShoot = () => gunShoot('revolver', [{ recoil: 4, kick: 0.8, flash: [1.55, 0] }, { recoil: 26, kick: 3.2 }, { recoil: 11, kick: 1.5 }, { recoil: 2, kick: 0.3 }]);
    const silShoot = () => gunShoot('pistol_sil', [{ recoil: 2, kick: 0.5, flash: [0.55, 0] }, { recoil: 11, kick: 1.8, casing: [2.5, -1, 2] }, { recoil: 4, kick: 0.7, casing: [5.5, -2.5, 0] }, { recoil: 1, kick: 0.2 }]);
    const rpgShoot = () => gunShoot('rpg', [{ recoil: 1, kick: 0.3, flash: [2.2, 0] }, { recoil: 9, kick: 2.8, fired: true }, { recoil: 5, kick: 1.5, fired: true }, { recoil: 2, kick: 0.6, fired: true }, { recoil: 0.5, kick: 0.1, fired: true }], [-3.0, 4.0]);
    const launcherShoot = () => gunShoot('launcher', [{ recoil: 1, kick: 0.3, flash: [1.9, 0] }, { recoil: 7, kick: 2.2 }, { recoil: 3.5, kick: 1.0 }, { recoil: 1, kick: 0.2 }], [-3.0, 4.0]);
    const minigunShoot = (n = 4) => gunShoot('minigun', [...Array(n).keys()].map((f) => ({ recoil: f % 2 ? 0.8 : 1.6, kick: f % 2 ? 0.3 : 0.7, spin: (f * 60) / n, flash: [f % 2 ? 1.25 : 1.55, f % 2], casing: [3 + (f * 4) / n, 0, 2] })), [-2.5, 3.5]);

    // NOVO: correr com a arma. Pistola: na mão direita, apontada para a frente e para baixo, o braço esquerdo balança.
    // Arma longa: atravessada no peito ("posição de porte"), as duas mãos nela.
    function gunRun(name, n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, p = base(), c = runLegs(p, t);
            const corg = chestOrg(p);
            if (HEAVY(name)) {                                                  // pesada: continua no ombro / no quadril, sacudindo com a passada
                holdWeapon(p, name, { bob: [0, 0, 0.9 * abs(c) - 0.4], chest_extra: -6 });
                p.chest_R = mm3(Rz(deg(-4 * c)), p.chest_R);
                p.props = [];
                holdWeapon(p, name, { bob: [0, 0, 0.9 * abs(c) - 0.4], keepChest: true });
            } else if (!LONG(name)) {
                const grip = V.add(corg, [9.5, 12.0 + 2.0 * c, 2.5 + 1.5 * abs(c)]);
                placeProp(p, name, grip, nrm([0.05, 1.0, -0.55]));
                p.arm_ik('R', grip, [1.0, -0.4, -0.8]);
                p.arm_fk('L', { flex: 42 * c + 10, abd: 14, elbow: 78 + 18 * max(0.0, -c) });
            } else {
                p.chest_R = mm3(Rz(deg(-10 - 6 * c)), Rx(deg(-6)));
                const co = chestOrg(p);
                const grip = V.add(co, [8.0, 8.5, 2.0 + 1.2 * c]);
                const Mp = placeProp(p, name, grip, nrm([-0.62, 0.55, 0.55]));
                p.arm_ik('R', grip, [1.0, -0.6, -0.7]);
                const lf = propPt(Mp, name === 'shotgun' ? [0, PUMP_Y, -1.2] : PROP_GRIP[name][1]);
                if (name === 'shotgun') p.props.push(['pump', mm4(Mp, M4(null, [0, PUMP_Y, 0.7]))]);
                p.arm_ik('L', lf, [-0.6, -0.2, -1.0]);
            }
            out.push(p);
        }
        return out;
    }
    // Braço em FK de uma pose → alvo de IK e polo (no espaço do PEITO) que põem o braço ADULTO exatamente onde a FK o deixa (o inverso
    // de armTarget 'reach'): sair de um repouso em FK e seguir em IK sem salto. Braço já em IK: o alvo e o polo dele.
    function fkArmIK(p, sd) {
        const Bo = p.bones(), A = G.ADULT, C = Bo.chest, arm = p.arm[sd];
        let T, pole;
        if (arm[0] === 'ik') { T = arm[1]; pole = arm[2]; }                // (já em IK: o próprio alvo)
        else if (!A) { T = pt4(Bo['farm_' + sd], [0, 0, -(LOWER - FIST[2])]); pole = V.sub(Bo['farm_' + sd].t, Bo['uarm_' + sd].t); }
        else {
            const Ba = p.adult().B, Ta = pt4(Ba['farm_' + sd], [0, 0, -(LOWER * A.arm - FIST[2] * (A.hand || 1))]);
            const r = (A.arm * (UPPER + LOWER) - FIST[2] * (A.hand || 1)) / (UPPER + LOWER - FIST[2]);
            T = V.add(Bo['uarm_' + sd].t, mv3(C.R, V.mul(tmv3(Ba.chest.R, V.sub(Ta, Ba['uarm_' + sd].t)), 1 / r)));
            pole = V.sub(Ba['farm_' + sd].t, Ba['uarm_' + sd].t);
        }
        return { q: tmv3(C.R, V.sub(T, C.t)), pole: nrm(tmv3(C.R, pole)) };
    }
    // Alvo do braço puxado para dentro do alcance (k = fração do braço esticado): o braço não trava reto a caminho de um alvo longe.
    function inReach(p, sd, T, k = 0.95) {
        const J = p.bones()['uarm_' + sd].t, d = V.sub(T, J), L = V.len(d), R = k * (UPPER + LOWER - FIST[2]);
        return L > R ? V.add(J, V.mul(d, R / L)) : T;
    }
    // Pé indo da base de uma pose (A) para a de outra (B) num passinho (sobe `lift` no meio: não desliza); u = 0..1 do passo.
    function stepLeg(p, sd, A, B, u, lift = 1.2) {
        const k = clip(u, 0, 1), e = ease(k), a = A.leg[sd], b = B.leg[sd];
        p.leg_ik(sd, V.add(V.lerp(a[1], b[1], e), [0, 0, lift * sin(PI * k)]), nrm(V.lerp(a[2], b[2], e)), hermR(null, a[3] || I3(), b[3] || I3(), null, k));
    }
    // NOVO: sacar a arma — do repouso (= o 1º quadro do idle sem arma) a mão direita vai ao coldre (a arma longa: pendurada no quadril),
    // puxa, gira o cano para a frente e leva até a mira (o último quadro = aim = idle:<arma> quadro 0). A esquerda sai do repouso em IK
    // desde o ponto exato onde a FK a deixava e pega a arma longa no caminho (sem troca FK→IK); os pés vão da base do idle à da arma
    // com dois passinhos (o pé sobe, não desliza).
    function gunDraw(name, n = 5) {
        const out = [], aim = gunIdle(name, 1)[0], rest = idle(1)[0], h = WEAPON_HOLD[name];
        const rR = fkArmIK(rest, 'R'), rL = fkArmIK(rest, 'L'), hip = [13.0, 1.0, -10.0], Ca = aim.bones().chest;
        const aimL = aim.arm.L[0] === 'ik' ? tmv3(Ca.R, V.sub(aim.arm.L[1], Ca.t)) : null;          // a mão de apoio na mira (no peito)
        for (let i = 0; i < n; i++) {
            const s = i / (n - 1);
            if (i === 0) { out.push(clonePose(rest)); continue; }
            if (i === n - 1) { out.push(aim); continue; }
            const p = base(), u = clip((s - 0.08) / 0.82, 0, 1);
            p.pelvis_t = V.lerp(rest.pelvis_t, aim.pelvis_t, ease(s));
            stepLeg(p, 'R', rest, aim, (s - 0.08) / 0.37);
            stepLeg(p, 'L', rest, aim, (s - 0.4) / 0.37);
            p.chest_R = hermR(null, rest.chest_R, aim.chest_R, null, u);
            p.head_R = hermR(null, rest.head_R, aim.head_R, null, u);
            const C = p.bones().chest, corg = C.t;
            const off = keysN([[0, mv3(C.R, rR.q)], [0.24, hip], [1, h.grip]], s);         // a mão direita, em relação ao peito
            const grip = V.add(corg, off), poleR = nrm(V.lerp(mv3(C.R, rR.pole), nrm(h.poleR), ease(min(1, s / 0.5))));
            p.arm_ik('R', grip, poleR);
            let Mp = null;
            if (s >= 0.2) {                                                    // na mão desde o coldre: cano para baixo → para a frente
                const fwd = nrm(V.lerp([0.1, 0.2, -1.0], [0, 1.0, 0], ease((s - 0.28) / 0.57)));
                Mp = placeProp(p, name, grip, LONG(name) ? nrm(V.add(fwd, [-0.07, 0, 0])) : fwd);
                if (name === 'shotgun') p.props.push(['pump', mm4(Mp, M4(null, [0, PUMP_Y, 0.7]))]);
                subProps(p, name, Mp);
            }
            const restL = V.add(corg, mv3(C.R, rL.q));
            if (h.one_hand || !Mp) {
                if (h.one_hand) { const a = rest.arm.L, b = aim.arm.L; p.arm = Object.assign(p.arm, { L: ['fk', ...[1, 2, 3].map((j) => hermR(null, a[j], b[j], null, u))] }); }
                else p.arm_ik('L', restL, mv3(C.R, rL.pole));
            } else {
                // sobe até perto de onde a arma vai ficar (dentro do alcance) e só pega nela no fim, já com a arma quase na mira
                const sup = propPt(Mp, name === 'shotgun' ? [0, PUMP_Y, -1.2] : PROP_GRIP[name][1]), w1 = ease((s - 0.2) / 0.4), w2 = ease((s - 0.6) / 0.25);
                const ready = inReach(p, 'L', V.lerp(restL, V.add(corg, mv3(C.R, aimL)), 0.75), 0.92);
                p.arm_ik('L', V.lerp(V.lerp(restL, ready, w1), sup, w2), nrm(V.lerp(mv3(C.R, rL.pole), nrm(h.poleL), w1)));
            }
            out.push(p);
        }
        return out;
    }
    const gunAim = (name) => [gunIdle(name)[0]];

    // ------------------------------------------------------------------ corpo a corpo
    function fightStance(p, drop = 2.2) {
        placeFoot(p, 'R', [10.5, -4.0, 0], -22);
        placeFoot(p, 'L', [-9.5, 5.0, 0], 6);
        p.pelvis_t = V.add(p.pelvis_t, [0, 0, -drop]);
    }
    function guard(p, chestYaw = -12) {
        p.chest_R = mm3(Rz(deg(chestYaw)), Rx(deg(-4)));
        p.head_R = mm3(Rz(deg(-chestYaw * 0.7)), Rx(deg(HEAD_TILT - 6)));
        return chestOrg(p);
    }
    const G_L = [-6.5, 13.5, 11.0], G_R = [6.5, 10.0, 9.0];
    // Golpes sem arma (soco de direita, jab de esquerda, chute) que começam e acabam no REPOUSO (= o 1º quadro do idle sem arma, para
    // onde o jogo volta; sem salto ao entrar nem ao sair): os pés ficam na base do idle (o quadril gira e avança sobre eles),
    // as mãos saem do repouso (IK no ponto exato da FK: fkArmIK), sobem à guarda, golpeiam e voltam. Chaves no TEMPO (s), casadas com
    // a janela de acerto do Melee (t0..t1) e com a duração do clipe (attackT); K quadros em t = j·D/K (os do atlas: o resample os
    // mantém). A: chaves [[t, v]…] — cy/py giro do peito/pélvis, lunge/px avanço/lado, drop agachar, lean/pp inclinação do peito/pélvis
    // (+ = para trás), R/L mão (em relação ao peito; 'rest' = a do repouso), w = 0 repouso … 1 guarda; legR(p, t) = a perna do chute.
    const REST = 'rest';
    function strike(K, D, A) {
        const rest = idle(1)[0], rh = { R: fkArmIK(rest, 'R'), L: fkArmIK(rest, 'L') }, out = [];
        const PO = { R: nrm([1.0, -0.3, -0.9]), L: nrm([-1.0, -0.3, -0.9]) };
        for (let j = 0; j < K; j++) {
            const t = (j * D) / K, k = (ks) => (ks ? keys(ks, t) : 0);
            if (j === 0 || j === K - 1) { out.push(clonePose(rest)); continue; }
            const p = base(), w = k(A.w), cy = k(A.cy), lean = k(A.lean);
            p.pelvis_t = V.add(rest.pelvis_t, [k(A.px), k(A.lunge), -k(A.drop)]);
            p.pelvis_R = mm3(Rz(deg(k(A.py))), Rx(deg(k(A.pp))));
            p.leg.R = rest.leg.R.slice(); p.leg.L = rest.leg.L.slice();
            if (A.legR) A.legR(p, t);
            p.chest_R = mm3(Rz(deg(cy)), Rx(deg(-4 * w + lean)));
            p.head_R = mm3(Rz(deg(-cy * 0.7)), Rx(deg(HEAD_TILT - 6 * w - lean * 0.5)));
            const C = p.bones().chest;
            for (const sd of ['R', 'L']) {
                const ro = mv3(C.R, rh[sd].q), off = keys(A[sd].map(([tt, v]) => [tt, v === REST ? ro : v]), t);
                p.arm_ik(sd, V.add(C.t, off), nrm(V.lerp(mv3(C.R, rh[sd].pole), PO[sd], w)));
            }
            out.push(p);
        }
        return out;
    }
    // direto de direita: 0,43 s (attackT), punho esticado em 0,11–0,21 s (Melee.punch 0,09–0,25)
    const punchCross = (K = 9) => strike(K, 6 / 14, {
        w: [[0, 0], [0.06, 1], [0.28, 1], [0.375, 0]],
        cy: [[0, 0], [0.06, 6], [0.115, 30], [0.2, 28], [0.28, -6], [0.375, 0]], py: [[0, 0], [0.06, 4], [0.115, 12], [0.2, 11], [0.28, 0]],
        lunge: [[0, 0], [0.06, 0.2], [0.115, 2.4], [0.2, 2.0], [0.28, 0.5], [0.375, 0]], drop: [[0, 0], [0.115, 1.6], [0.24, 1.2], [0.375, 0]],
        R: [[0, REST], [0.06, [8.0, 6.0, 9.0]], [0.115, [1.5, 32.5, 11.5]], [0.2, [1.8, 31.0, 11.5]], [0.28, G_R], [0.375, REST]],
        L: [[0, REST], [0.1, [-7.0, 11.0, 10.0]], [0.2, [-7.0, 10.0, 10.0]], [0.28, G_L], [0.375, REST]],
    });
    // jab de esquerda: 0,36 s, punho esticado em 0,085–0,16 s (Melee.punchL 0,05–0,20)
    const punchJab = (K = 8) => strike(K, 5 / 14, {
        w: [[0, 0], [0.045, 1], [0.23, 1], [0.31, 0]],
        cy: [[0, 0], [0.04, -10], [0.085, -26], [0.16, -24], [0.23, -10], [0.31, 0]], py: [[0, 0], [0.085, -6], [0.16, -6], [0.23, 0]],
        lunge: [[0, 0], [0.085, 1.5], [0.16, 1.2], [0.23, 0.2], [0.31, 0]], drop: [[0, 0], [0.085, 1.2], [0.2, 1.0], [0.31, 0]],
        L: [[0, REST], [0.085, [-3.0, 31.0, 11.5]], [0.16, [-3.2, 30.0, 11.5]], [0.23, G_L], [0.31, REST]],
        R: [[0, REST], [0.09, G_R], [0.23, G_R], [0.31, REST]],
    });
    const punch = () => punchCross();
    // chute frontal (perna direita): 0,58 s, pé esticado em 0,15–0,25 s (Melee.kick 0,12–0,33). O peso vai para o pé esquerdo (o
    // quadril desliza sobre ele), o tronco inclina para trás como contrapeso; o pé volta ao lugar do repouso.
    function kick(K = 10) {
        const rest = idle(1)[0], f0 = rest.leg.R[1], z0 = f0[2] - ANKLE_H, s0 = [f0[0], f0[1], z0];
        const ank = [[0, s0], [0.07, [9.0, 6.0, 12.0]], [0.15, [7.0, 22.0, 18.0]], [0.25, [7.0, 21.5, 17.5]], [0.34, [9.0, 7.0, 12.0]], [0.43, [f0[0] - 0.8, f0[1] + 1.6, z0 + 2.5]], [0.49, s0]];
        const fp = [[0, 0], [0.07, -25], [0.15, 35], [0.25, 35], [0.34, -15], [0.43, -4], [0.49, 0]], fy = [[0, -12], [0.07, -10], [0.43, -10], [0.49, -12]];
        return strike(K, 7 / 12, {
            w: [[0, 0], [0.08, 1], [0.42, 1], [0.52, 0]],
            cy: [[0, 0], [0.08, -10], [0.42, -10], [0.52, 0]], lean: [[0, 0], [0.07, 6], [0.15, 14], [0.25, 14], [0.34, 6], [0.43, 2], [0.52, 0]],
            pp: [[0, 0], [0.15, 6], [0.25, 6], [0.34, 0]], px: [[0, 0], [0.07, -2.5], [0.34, -2.5], [0.45, -0.6], [0.52, 0]],
            drop: [[0, 0], [0.07, -0.6], [0.34, -0.6], [0.45, 0.6], [0.52, 0]],
            L: [[0, REST], [0.08, [-7.0, 12.0, 8.5]], [0.42, [-7.0, 12.0, 8.5]], [0.52, REST]],
            R: [[0, REST], [0.08, [8.5, 2.0, 9.0]], [0.42, [8.5, 2.0, 9.0]], [0.52, REST]],
            legR: (p, t) => {
                const a = keys(ank, t), pitch = keys(fp, t), air = clip(a[2] / 4, 0, 1);
                p.leg_ik('R', [a[0], a[1], ANKLE_H + a[2] + groundLift(pitch) * (1 - air)], nrm(V.lerp([0.12, 1.0, 0.0], [0.2, 1.0, 0.6], air)), footRot(keys(fy, t), pitch));
            },
        });
    }

    function batHoldShoulder(p) {
        const c = chestOrg(p), grip = V.add(c, [10.5, 8.0, 7.5]);
        const Mp = placeProp(p, 'bat', grip, nrm([0.30, -0.55, 0.78]));
        p.arm_ik('R', grip, [1.0, -0.2, -1.0]);
        return Mp;
    }
    function batIdle(n = 4) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, b = sin(TAU * t), p = base();
            p.pelvis_t = [0.3 * b, 0, -0.3 + 0.2 * cos(TAU * t)];
            standLegs(p, 10.5, [0.4, 0.4], 10);
            p.chest_R = Rx(deg(-1 * b));
            p.arm_fk('L', { flex: 4 + 1.5 * b, abd: 12, elbow: 14 + 2 * b });
            batHoldShoulder(p);
            out.push(p);
        }
        return out;
    }
    function batWalk(n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, ca = cos(TAU * (t - 0.04)), p = base();
            walkLegs(p, t);
            walkUpper(p, t, false);
            p.arm_fk('L', { flex: 24 * ca + 3, abd: 11, elbow: 14 + 7 * (1 + ca) });
            batHoldShoulder(p);
            out.push(p);
        }
        return out;
    }
    function batRun(n = 8) {                                                                                         // NOVO
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, p = base(), ca = cos(TAU * (t - 0.03));
            runLegs(p, t);
            p.arm_fk('L', { flex: 42 * ca + 10, abd: 14, elbow: 84 + 12 * ca });
            batHoldShoulder(p);
            out.push(p);
        }
        return out;
    }
    // ---- FACA (jogador e quem a usa): na mão direita, lâmina para a frente do punho (a direção do polegar). Parado/andando/correndo =
    // os clipes sem arma com a mão direita baixa à frente do quadril; golpe = estocada (recua, avança o corpo e a lâmina, volta);
    // anunciar o assalto = braço esticado com a lâmina apontada para a vítima.
    function knifeInHand(p) {
        const B = p.bones(), hR = B.hand_R.R;
        placeProp(p, 'knife', p.fist_world(B, 'R'), mv3(hR, [0, 1, 0]), mv3(hR, [0, 0, 1]));
    }
    // (a mão da faca acompanha o balanço do braço: atrás quando o pé direito pousa — t = 0)
    function knifeIdle(n = 6) {
        return idle(n).map((p, i) => { const c = chestOrg(p), s = sin((TAU * i) / n); p.arm_ik('R', V.add(c, [11.0, 8.0, -2.5 + 0.4 * s]), [1.0, -0.4, -0.7]); knifeInHand(p); return p; });
    }
    function knifeWalk(n = 8) {
        return walk(n).map((p, i) => { const c = chestOrg(p), k = cos(TAU * (i / n - 0.04)); p.arm_ik('R', V.add(c, [11.0, 7.5 - 2.5 * k, -3.0]), [1.0, -0.4, -0.7]); knifeInHand(p); return p; });
    }
    function knifeRun(n = 8) {
        return run(n).map((p, i) => { const c = chestOrg(p), k = cos(TAU * (i / n - 0.03)); p.arm_ik('R', V.add(c, [9.0, 8.0 - 4.0 * k, 1.0]), [1.0, -0.5, -0.6]); knifeInHand(p); return p; });
    }
    // rotação entre A e B (quatérnio normalizado; f = 0..1)
    const nlerpR = (A, B, f) => { const qa = m2q(A), qb = m2q(B), sg = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3] < 0 ? -1 : 1; return q2m(qa.map((v, i) => v * (1 - f) + sg * qb[i] * f)); };
    // ESTOCADA: do repouso com a faca (o 1º quadro do idle:knife, para onde o jogo volta) — recua a lâmina, dá um passo à frente com o
    // pé esquerdo, avança o corpo INCLINADO PARA A FRENTE e a lâmina, volta. 0,44 s; lâmina esticada em 0,18–0,25 s (Melee.stab
    // 0,12–0,32); K quadros em t = j·D/K. A faca vai no punho (a rotação sai da do repouso e volta a ela).
    function knifeStab(K = 10) {
        const D = 7 / 16, rest = knifeIdle(1)[0], rh = { R: fkArmIK(rest, 'R'), L: fkArmIK(rest, 'L') }, C0 = rest.bones().chest;
        const kR = mm3(trR(C0.R), rest.props[0][1].R);                  // a faca no peito (repouso)
        const w = [[0, 0], [0.06, 1], [0.31, 1], [0.39, 0]], cy = [[0, 0], [0.06, -22], [0.125, -6], [0.18, 6], [0.25, 8], [0.31, -4], [0.39, 0]];
        const lean = [[0, 0], [0.06, -3], [0.125, 8], [0.18, 16], [0.25, 17], [0.31, 8], [0.39, 0]], py = [[0, 0], [0.06, -6], [0.18, 4], [0.25, 4], [0.31, 0]];
        const lunge = [[0, 0], [0.06, -0.5], [0.18, 3.0], [0.25, 3.0], [0.31, 1.2], [0.39, 0]], drop = [[0, 0], [0.18, 1.8], [0.25, 1.8], [0.39, 0]];
        const hR = [[0, REST], [0.06, [11.5, -4.0, 0.5]], [0.125, [7.5, 12.0, 3.0]], [0.18, [3.0, 23.0, 5.0]], [0.25, [2.5, 24.5, 5.0]], [0.31, [7.0, 13.0, 2.0]], [0.39, REST]];
        const hL = [[0, REST], [0.06, [-8.5, 8.0, 7.0]], [0.31, [-8.5, 8.0, 7.0]], [0.39, REST]];
        const bd = [[0, [0.15, 1.0, 0.3]], [0.06, [0.15, 1.0, 0.3]], [0.125, [0.0, 1.0, 0.1]], [0.18, [-0.05, 1.0, 0.05]], [0.25, [-0.05, 1.0, 0.05]], [0.31, [0.05, 1.0, 0.2]], [0.39, [0.1, 1.0, 0.25]]];
        const fL = rest.leg.L[1], fwdL = V.add(fL, [0.8, 5.0, 0]);
        const tip = (c, t) => V.add(V.add(c, keys(hR.map(([tt, v]) => [tt, v === REST ? [11, 8, -2.5] : v]), t)), V.mul(nrm(keys(bd, t)), 9.0));
        const out = [], jt = Math.round((0.17 * K) / D);                    // o rastro: no quadro da lâmina indo à frente
        for (let j = 0; j < K; j++) {
            const t = (j * D) / K;
            if (j === 0 || j === K - 1) { out.push(clonePose(rest)); continue; }
            const p = base(), wt = keys(w, t), ln = keys(lean, t), c_ = keys(cy, t);
            p.pelvis_t = V.add(rest.pelvis_t, [0, keys(lunge, t), -keys(drop, t)]);
            p.pelvis_R = Rz(deg(keys(py, t)));
            p.leg.R = rest.leg.R.slice();
            const uf = t < 0.2 ? (t - 0.06) / 0.11 : 1 - (t - 0.27) / 0.1, uk = clip(uf, 0, 1);
            p.leg_ik('L', V.add(V.lerp(fL, fwdL, ease(uk)), [0, 0, 1.4 * sin(PI * uk)]), rest.leg.L[2], rest.leg.L[3]);
            p.chest_R = mm3(Rz(deg(c_)), Rx(deg(-ln)));                    // (Rx negativo: inclina para a FRENTE)
            p.head_R = mm3(Rz(deg(-c_ * 0.5)), Rx(deg(HEAD_TILT - 4 * wt + ln * 0.4)));
            const C = p.bones().chest;
            for (const sd of ['R', 'L']) {
                const ro = mv3(C.R, rh[sd].q), off = keys((sd === 'R' ? hR : hL).map(([tt, v]) => [tt, v === REST ? ro : v]), t);
                p.arm_ik(sd, inReach(p, sd, V.add(C.t, off), 0.97), nrm(V.lerp(mv3(C.R, rh[sd].pole), sd === 'R' ? nrm([1.0, -0.4, -0.8]) : nrm([-1.0, -0.3, -0.9]), wt)));
            }
            const B = p.bones(), Rk = nlerpR(mm3(C.R, kR), lookRot(nrm(keys(bd, t)), [0, 0, 1]), wt);
            placeProp(p, 'knife', p.fist_world(B, 'R'), mv3(Rk, [0, 1, 0]), mv3(Rk, [0, 0, 1]));
            if (j === jt) p.effects.push({ type: 'trail', pts: [0, 0.25, 0.5, 0.75, 1].map((u) => tip(C.t, t - 0.06 + 0.06 * u)) });
            out.push(p);
        }
        return out;
    }
    function knifeHoldup(n = 4) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const a = TAU * (i / n), s = sin(a), co = cos(a), p = base();
            p.pelvis_t = [0, 0, -0.35 + 0.35 * co];                          // (pés e quadril do idle:knife: ao entrar, só os braços e o peito mudam)
            standLegs(p);
            p.chest_R = Rz(deg(-10));
            p.head_R = mm3(Rz(deg(-6 + 4 * s)), Rx(deg(HEAD_TILT - 6)));
            // faca e mão livre em elipses (como no holdup da arma: sem quadros parados), a faca espeta para a frente e a mão volta alta
            const c = chestOrg(p), grip = V.add(c, [5.0, 19.0 + 1.8 * s, 6.0 + 0.6 * (1 - co)]);
            placeProp(p, 'knife', grip, nrm([-0.1, 1.0, 0.12]));
            p.arm_ik('R', grip, [1.0, -0.4, -0.8]);
            p.arm_ik('L', V.add(c, [-8.0, 20.0 + 2.5 * co, 8.0 + 2.2 * s]), [-1.0, -0.3, -0.8]);
            out.push(p);
        }
        return out;
    }
    // Golpe de taco (duas mãos) ou de cassetete (prop = 'baton': uma mão, a outra na guarda). Começa e acaba no repouso do clipe de
    // onde o jogo vem (taco: o 1º quadro do idle:bat, no ombro; cassetete: o idle sem arma com o cassetete na mão): arma atrás do ombro,
    // o quadril e o peito giram, a arma passa à frente (acerto em 0,21 s; Melee.swing 0,17–0,38 / baton 0,17–0,36), acompanha até o
    // ombro esquerdo e volta pela frente ao repouso. 0,5 s; K quadros em t = j·D/K; os pés ficam no lugar.
    function batSwing(prop = 'bat', K = 10) {
        const D = 0.5, bat = prop === 'bat', rest = bat ? batIdle(1)[0] : idle(1)[0];
        if (!bat) batonInHand(rest, -0.1);
        const C0 = rest.bones().chest, Mr = rest.props[0][1], g0 = PROP_GRIP[prop] ? PROP_GRIP[prop][0] : [0, 0, 0];
        const gq = tmv3(C0.R, V.sub(pt4(Mr, g0), C0.t)), dq = tmv3(C0.R, mv3(Mr.R, [0, 1, 0])), rh = { R: fkArmIK(rest, 'R'), L: fkArmIK(rest, 'L') };
        const hq = V.sub(rh.R.q, gq);                                         // a mão em relação à empunhadura no repouso
        const w = [[0, 0], [0.09, 1], [0.37, 1], [0.45, 0]], wL = bat ? [[0, 0], [0.1, 1], [0.36, 1], [0.45, 0]] : w;
        const cy = [[0, 0], [0.1, -48], [0.155, -12], [0.21, 16], [0.27, 42], [0.33, 46], [0.39, 12], [0.45, 0]];
        const py = [[0, 0], [0.1, -14], [0.155, -4], [0.21, 8], [0.27, 16], [0.33, 18], [0.39, 4], [0.45, 0]], drop = [[0, 0], [0.15, 2.0], [0.33, 2.0], [0.45, 0]];
        const gk = [[0, REST], [0.1, [12.0, -3.0, 13.0]], [0.155, [12.0, 9.0, 8.0]], [0.21, [3.0, 18.0, 6.5]], [0.27, [-10.0, 13.0, 7.5]], [0.33, [-11.5, 5.0, 11.0]], [0.39, bat ? [3.0, 12.0, 10.0] : [3.0, 12.0, 1.0]], [0.45, REST]];
        const dk = [[0, REST], [0.1, [0.25, -0.85, 0.45]], [0.155, [0.95, 0.25, 0.15]], [0.21, [0.15, 1.0, 0.06]], [0.27, [-0.95, 0.35, 0.1]], [0.33, [-0.65, -0.45, 0.6]], [0.39, bat ? [0.15, 0.25, 0.95] : [0.3, 0.9, 0.3]], [0.45, REST]];
        const out = [], C_ = (t, C) => [keys(gk.map(([tt, v]) => [tt, v === REST ? mv3(C.R, gq) : v]), t), nrm(keys(dk.map(([tt, v]) => [tt, v === REST ? mv3(C.R, dq) : nrm(v)]), t))];
        for (let j = 0; j < K; j++) {
            const t = (j * D) / K;
            if (j === 0 || j === K - 1) { out.push(clonePose(rest)); continue; }
            const p = base(), wt = keys(w, t), c_ = keys(cy, t);
            p.pelvis_t = V.add(rest.pelvis_t, [0, 0, -keys(drop, t)]);
            p.pelvis_R = Rz(deg(keys(py, t)));
            p.leg.R = rest.leg.R.slice(); p.leg.L = rest.leg.L.slice();
            p.chest_R = hermR(null, rest.chest_R, mm3(Rz(deg(c_)), Rx(deg(-3))), null, wt);
            p.head_R = hermR(null, rest.head_R, mm3(Rz(deg(-c_ * 0.6)), Rx(deg(HEAD_TILT - 5))), null, wt);
            const C = p.bones().chest, [off, d] = C_(t, C), grip = inReach(p, 'R', V.add(C.t, off), 0.97);
            const Mp = placeProp(p, prop, grip, d);
            p.arm_ik('R', V.add(grip, V.mul(mv3(C.R, hq), 1 - wt)), nrm(V.lerp(mv3(C.R, rh.R.pole), nrm([1.0, -0.4, -0.8]), wt)));
            const wl = keys(wL, t), restL = V.add(C.t, mv3(C.R, rh.L.q)), onL = bat ? propPt(Mp, [0, -3.9, 0]) : V.add(C.t, [-9.0, 9.0, 9.0]);
            p.arm_ik('L', V.lerp(restL, onL, wl), nrm(V.lerp(mv3(C.R, rh.L.pole), nrm(bat ? [-1.0, -0.4, -0.8] : [-1.0, -0.3, -0.9]), wl)));
            if (abs(t - 0.21) < D / K / 2 + 1e-9 || abs(t - 0.27) < D / K / 2 + 1e-9) {      // rastro da ponta (o trecho que acabou de varrer)
                const pts = [];
                for (let k = 0; k < 7; k++) { const [o2, d2] = C_(t - 0.06 + (0.06 * k) / 6, C); pts.push(V.add(V.add(C.t, o2), V.mul(d2, bat ? 24.0 : 16.0))); }
                p.effects.push({ type: 'trail', pts });
            }
            out.push(p);
        }
        return out;
    }
    function throwAnim() {
        const seq = [[-6, -2, [8.0, 9.0, 7.0], [-8.5, 7.0, 4.0], 'hand', [0, 0]], [-34, 8, [15.0, -9.0, 22.0], [-6.0, 19.0, 15.0], 'hand', [0, 0]],
            [-44, 10, [16.0, -13.0, 24.0], [-5.0, 20.0, 15.0], 'hand', [0, 2]], [8, -6, [12.0, 6.0, 28.0], [-11.0, 10.0, 8.0], 'hand', [0, 5]],
            [30, -12, [4.0, 24.0, 15.0], [-13.0, 2.0, 4.0], 'fly', [0, 6]], [34, -10, [-4.0, 16.0, 0.0], [-13.0, 0.0, 4.0], null, [0, 6]], [4, -3, [9.0, 5.0, -4.0], [-10.0, 4.0, 0.0], null, [0, 0]]];
        return seq.map(([cy, cp, rf, lf, gren, step]) => {
            const p = base();
            placeFoot(p, 'R', [10.5, -3.0, 0], -18);
            placeFoot(p, 'L', [-9.5, 3.0 + step[1], 0], 6);
            p.pelvis_t = [0, step[1] * 0.4, -1.8];
            p.pelvis_R = Rz(deg(cy * 0.35));
            p.chest_R = mm3(Rz(deg(cy * 0.65)), Rx(deg(cp)));
            p.head_R = mm3(Rz(deg(-cy * 0.5)), Rx(deg(HEAD_TILT - cp * 0.6)));
            const c = chestOrg(p);
            p.arm_ik('R', V.add(c, rf), [1.0, -0.2, -0.6]);
            p.arm_ik('L', V.add(c, lf), [-1.0, -0.2, -0.8]);
            if (gren === 'hand') {
                const B = p.bones(), fist = p.fist_world(B, 'R'), hR = B.hand_R.R;
                p.props.push(['grenade', M4(hR, V.add(fist, mv3(hR, [0, 3.4, -0.5])))]);
            } else if (gren === 'fly') p.props.push(['grenade', M4(Rx(deg(40)), V.add(c, [2.0, 38.0, 22.0])), 'chest']);
            return p;
        });
    }

    // ------------------------------------------------------------------ GRANADA e MOLOTOV (Throwables): pegar/preparar → segurar
    // mirando (enquanto a força carrega) → arremessar. Preparar começa no REPOUSO (o 1º quadro do idle sem arma, de onde o jogo vem: as
    // mãos saem em IK do ponto exato da FK) e termina na BASE do arremesso (pé direito atrás, esquerdo à frente: dois passinhos, o pé
    // sobe e não desliza) = o 1º quadro do *_hold = o 1º do *_throw; o arremesso volta ao repouso.
    // Pose de arremesso: giro (cy) e inclinação (cp, + = para trás) do tronco, alvos das mãos (rf, lf) em relação ao peito.
    function throwPose(p, cy, cp, rf, lf, step = 0) {
        placeFoot(p, 'R', [10.5, -3.0, 0], -18);
        placeFoot(p, 'L', [-9.5, 3.0 + step, 0], 6);
        p.pelvis_t = [0, step * 0.4, -1.8];
        p.pelvis_R = Rz(deg(cy * 0.35));
        p.chest_R = mm3(Rz(deg(cy * 0.65)), Rx(deg(cp)));
        p.head_R = mm3(Rz(deg(-cy * 0.5)), Rx(deg(HEAD_TILT - cp * 0.6)));
        const c = chestOrg(p);
        p.arm_ik('R', V.add(c, rf), [1.0, -0.2, -0.6]);
        p.arm_ik('L', V.add(c, lf), [-1.0, -0.2, -0.8]);
        return c;
    }
    // braço armado atrás (o tronco um pouco para trás: o peso no pé de trás), o esquerdo apontando o alvo
    const HOLD = { cy: -38, cp: 5, rf: [15.0, -11.0, 24.0], lf: [-6.0, 20.0, 14.0] }, HOLD_PR = [1.0, -0.2, -0.6], HOLD_PL = [-1.0, -0.2, -0.8];
    const RAG_T = 0.75, THROW_REL = 0.13;            // duração do molotov_hold (s: o fogo fecha o loop) · Throwables.RELEASE (o objeto sai da mão)
    // Entre o repouso (A) e a base (B), ou de volta: quadril (e = 0..1), pés (passinhos uR/uL = 0..1), tronco (cy/cp) e as mãos: chaves
    // [[t, alvo em relação ao peito | REST]…] em t; poles: o do repouso (rh) → o da base pelo peso w. Devolve o peito.
    function throwBody(p, A, B, rh, t, { e, uR, uL, cy, cp, rf, lf, w, off = [0, 0, 0] }) {
        p.pelvis_t = V.add(V.lerp(A.pelvis_t, B.pelvis_t, e), off);
        p.pelvis_R = Rz(deg(cy * 0.35));
        p.chest_R = mm3(Rz(deg(cy * 0.65)), Rx(deg(cp)));
        p.head_R = mm3(Rz(deg(-cy * 0.5)), Rx(deg(HEAD_TILT - cp * 0.6)));
        stepLeg(p, 'R', A, B, uR); stepLeg(p, 'L', A, B, uL);
        const C = p.bones().chest;
        for (const [sd, ks, po] of [['R', rf, HOLD_PR], ['L', lf, HOLD_PL]]) {
            const ro = mv3(C.R, rh[sd].q), T = keys(ks.map(([tt, v]) => [tt, v === REST ? ro : v]), t);
            p.arm_ik(sd, V.add(C.t, T), nrm(V.lerp(mv3(C.R, rh[sd].pole), nrm(po), w[sd])));
        }
        return C;
    }
    const restArms = (rest) => ({ R: fkArmIK(rest, 'R'), L: fkArmIK(rest, 'L') });
    function grenadeInHand(p) {
        const B = p.bones(), fist = p.fist_world(B, 'R'), hR = B.hand_R.R;
        p.props.push(['grenade', M4(hR, V.add(fist, mv3(hR, [0, 3.4, -0.5])))]);
    }
    // Garrafa na mão direita; `fwd` = para onde aponta o gargalo (o "para cima" do desenho varia contínuo com ele). Devolve o ponto do pano.
    const RAG_PT = (PROP_MOUNT && PROP_MOUNT.molotov) || [0, 12.6, 0];          // o pano no gargalo (a boca da garrafa da folha)
    function molotovInHand(p, fwd) {
        const B = p.bones(), fist = p.fist_world(B, 'R'), f = nrm(fwd);
        const Mp = placeProp(p, 'molotov', fist, f, nrm(V.cross([1, 0, 0], f)));
        p._mol = Mp;
        return propPt(Mp, RAG_PT);
    }
    // fogo no pano: língua (clarão para cima) que tremula no TEMPO (ts, s; não no nº do quadro): as frequências fecham o loop do
    // molotov_hold (RAG_T) e o padrão é o mesmo com qualquer nº de quadros. k = tamanho (o pano pegando fogo).
    // Com as armas da folha, o fogo é o DESENHO da folha (molotov_fogoN: um desenho por quadro, trocando no tempo como o clarão) preso na
    // boca da garrafa — logo depois dela em p.props (peça presa: Pose.adult a leva junto) — e o clarão fica menor, só o brilho em volta.
    function ragFire(p, pos, ts, k = 1) {
        const f = TAU / RAG_T, fi = Math.floor((8 * ts) / RAG_T + 1e-6);
        const sheet = FOGOS.length && p._mol && k >= 0.7;
        p.effects.push({ type: 'flash', pos, dir: [0.15 * sin(3 * f * ts), -0.25, 1.0], size: (0.6 + 0.18 * abs(sin(2 * f * ts + 0.7))) * k * (sheet ? 0.55 : 1), variant: fi % 2 });
        if (sheet) {
            const j = p.props.findIndex((q) => q[0] === 'molotov');
            if (j >= 0) p.props.splice(j + 1, 0, [FOGOS[fi % FOGOS.length], mm4(p.props[j][1], M4(null, RAG_PT))]);
        }
    }
    // Segurando (granada armada / molotov aceso) enquanto mira e carrega a força: o braço vai um pouco mais para trás e volta,
    // respirando — o esquerdo aponta o alvo. Quadro 0 = HOLD exato (as oscilações valem 0 em t = 0: o fim do pin/light e o começo do
    // throw casam com qualquer quadro 0).
    function holdLoop(n, prop) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, s_ = sin(TAU * t), q = 0.5 - 0.5 * cos(TAU * t), p = base();
            throwPose(p, HOLD.cy - 2 * s_, HOLD.cp - 2.4 * q, V.add(HOLD.rf, [0.4 * s_, -0.8 * s_, -1.2 * q]), V.add(HOLD.lf, [0, -1.2 * q, 0.5 * s_]));
            if (prop === 'grenade') grenadeInHand(p);
            else ragFire(p, molotovInHand(p, [0.1, -0.55, 0.85]), t * RAG_T);
            out.push(p);
        }
        return out;
    }
    // Pegar a granada e PUXAR O PINO: do repouso, a mão direita pega a granada na cintura e a traz ao peito, a esquerda engancha o anel e
    // puxa para fora (o pino sai junto) e larga; o corpo gira e os pés vão para a base do arremesso (termina no 1º quadro do grenade_hold).
    function grenadePin(n = 14) {
        const rest = idle(1)[0], hold = holdLoop(1, 'grenade')[0], rh = restArms(rest), out = [];
        const rf = [[0, REST], [0.16, [8.5, 7.0, 2.0]], [0.36, [6.0, 12.0, 12.0]], [0.58, [6.0, 13.0, 14.0]], [1, HOLD.rf]];
        const lf = [[0, REST], [0.3, [3.5, 13.5, 18.0]], [0.42, [3.5, 13.5, 18.0]], [0.68, [-17.0, 10.0, 16.0]], [1, HOLD.lf]];
        for (let i = 0; i < n; i++) {
            const s = i / (n - 1);
            if (i === 0) { out.push(clonePose(rest)); continue; }
            if (i === n - 1) { out.push(clonePose(hold)); continue; }
            const p = base();
            throwBody(p, rest, hold, rh, s, { e: ease(s), uR: (s - 0.5) / 0.26, uL: (s - 0.7) / 0.26, cy: keys([[0, 0], [0.55, -8], [1, HOLD.cy]], s), cp: keys([[0, 0], [0.3, -4], [0.62, -3], [1, HOLD.cp]], s),
                rf, lf, w: { R: ease(s / 0.3), L: ease((s - 0.05) / 0.25) } });
            if (s >= 0.12) grenadeInHand(p);
            if (s >= 0.34 && s <= 0.85) {                                   // o pino na mão esquerda (depois é largado)
                const B = p.bones(), fl = p.fist_world(B, 'L');
                p.props.push(['pin', M4(Rx(deg(90 * s)), V.add(fl, [0.8, 0.8, 1.0]))]);
            }
            out.push(p);
        }
        return out;
    }
    // ACENDER O MOLOTOV: do repouso, a garrafa vem em pé para a frente do peito, o isqueiro sobe até o pano, acende (chama pequena do
    // isqueiro → o pano pega fogo e cresce) e o corpo gira e os pés vão para a base do arremesso (termina no 1º quadro do molotov_hold).
    // LIGHT_T = a duração do clipe (s: o fogo tremula no tempo).
    function molotovLight(n = 16) {
        const LIGHT_T = 12 / 13, rest = idle(1)[0], hold = holdLoop(1, 'molotov')[0], rh = restArms(rest), out = [];
        const rf = [[0, REST], [0.14, [8.5, 7.0, 2.0]], [0.3, [7.0, 12.0, 9.0]], [0.7, [7.0, 12.5, 10.0]], [1, HOLD.rf]];
        const fk = [[0.08, [0.15, 0.6, 0.8]], [0.3, [0.0, 0.15, 1.0]], [0.7, [0.0, 0.2, 1.0]], [1, [0.1, -0.55, 0.85]]];
        for (let i = 0; i < n; i++) {
            const s = i / (n - 1), ts = (i * LIGHT_T) / n;
            if (i === 0) { out.push(clonePose(rest)); continue; }
            if (i === n - 1) { const p = clonePose(hold); p.effects = []; p.props = p.props.filter((q) => !SUB_PROPS[q[0]]); p._mol = p.props[0][1]; ragFire(p, pt4(p._mol, RAG_PT), ts); out.push(p); continue; }
            const p = base(), lf0 = [[0, REST], [0.12, [-7.0, 8.0, 2.0]]];
            // a mão esquerda é refeita abaixo (o alvo dela depende da garrafa): aqui só para o corpo
            const C0 = throwBody(p, rest, hold, rh, s, { e: ease(s), uR: (s - 0.55) / 0.24, uL: (s - 0.74) / 0.24, cy: keys([[0, 0], [0.7, -6], [1, HOLD.cy]], s), cp: keys([[0, 0], [0.2, -4], [0.7, -3], [1, HOLD.cp]], s),
                rf, lf: lf0, w: { R: ease(s / 0.3), L: 0 } });
            if (s < 0.08) { out.push(p); continue; }
            const rag = molotovInHand(p, keysN(fk, s)), lit = V.sub(V.add(rag, [-1.2, 0.6, -3.2]), C0.t);
            const lf = [[0, mv3(C0.R, rh.L.q)], [0.12, [-7.0, 8.0, 2.0]], [0.28, lit], [0.62, lit], [0.82, [-10.0, 10.0, 8.0]], [1, HOLD.lf]];
            p.arm_ik('L', V.add(C0.t, keys(lf, s)), nrm(V.lerp(mv3(C0.R, rh.L.pole), nrm(HOLD_PL), ease((s - 0.04) / 0.3))));
            if (s < 0.85) { const B = p.bones(), fl = p.fist_world(B, 'L'); placeProp(p, 'lighter', V.add(fl, [0, 0.3, 0.6]), [0, 1, 0]); }
            if (s >= 0.3 && s <= 0.62) p.effects.push({ type: 'flash', pos: V.add(rag, [-0.9, 0.4, -1.2]), dir: [0, 0, 1], size: 0.22, variant: i % 2 });   // chama do isqueiro
            if (s >= 0.45) ragFire(p, rag, ts, keys([[0.45, 0.45], [0.7, 1.0], [1, 1.0]], s));                                                         // o pano pegando fogo
            out.push(p);
        }
        return out;
    }
    // ARREMESSO (granada ou molotov), 0,4375 s, K quadros em t = j·D/K: da base armada o quadril avança e gira, o cotovelo passa alto
    // por cima do ombro e a mão solta à frente e no alto — o objeto sai da mão em THROW_REL (= Throwables.RELEASE: dali em diante é o
    // projétil do jogo que aparece; o desenho não mostra mais o objeto) —, o braço acompanha cruzando o corpo, o tronco inclina para a
    // frente, e os pés voltam em dois passinhos ao repouso (o último quadro = o 1º do idle sem arma, para onde o jogo volta).
    function throwRelease(prop, K = 10) {
        const D = 7 / 16, rest = idle(1)[0], hold = holdLoop(1, prop)[0], rh = restArms(rest), out = [];
        const cy = [[0, HOLD.cy], [0.045, -42], [0.09, -14], [0.13, 12], [0.19, 30], [0.26, 30], [0.33, 12], [0.39, 0]];
        const cp = [[0, HOLD.cp], [0.045, HOLD.cp + 1], [0.09, 0], [0.13, -7], [0.19, -12], [0.26, -10], [0.33, -4], [0.39, 0]];
        const rf = [[0, HOLD.rf], [0.045, [15.5, -12.5, 24.5]], [0.09, [14.0, 3.0, 29.0]], [0.13, [11.0, 19.0, 28.0]], [0.19, [2.0, 23.0, 11.0]], [0.26, [-5.0, 15.0, -2.0]], [0.33, [3.0, 9.0, -5.0]], [0.39, REST]];
        const lf = [[0, HOLD.lf], [0.045, HOLD.lf], [0.13, [-12.0, 6.0, 6.0]], [0.2, [-13.0, 1.0, 4.0]], [0.3, [-12.0, 2.0, 0.0]], [0.39, REST]];
        const wk = [[0, 1], [0.26, 1], [0.39, 0]], dy = [[0, 0], [0.13, 2.0], [0.2, 2.5], [0.3, 1.0], [0.39, 0]], dz = [[0, 0], [0.13, -0.8], [0.22, -1.0], [0.39, 0]];
        const bd = [[0, [0.1, -0.55, 0.85]], [0.045, [0.1, -0.6, 0.8]], [0.09, [0.15, 0.1, 1.0]], [0.13, [0.2, 0.6, 0.8]]];
        for (let j = 0; j < K; j++) {
            const t = (j * D) / K;
            if (j === 0) { out.push(clonePose(hold)); continue; }
            if (j === K - 1) { out.push(clonePose(rest)); continue; }
            const p = base(), e = ease((t - 0.2) / 0.19), w = keys(wk, t);
            // (de volta ao repouso: o quadril sai da base com e; o desvio dy/dz é o avanço do peso sobre o pé da frente)
            throwBody(p, hold, rest, rh, t, { e, uR: (t - 0.2) / 0.11, uL: (t - 0.28) / 0.11, cy: keys(cy, t), cp: keys(cp, t), rf, lf, w: { R: w, L: w }, off: [0, keys(dy, t), keys(dz, t)] });
            if (t < THROW_REL - 1e-6) {
                if (prop === 'grenade') grenadeInHand(p);
                else ragFire(p, molotovInHand(p, keysN(bd, t)), t);
            }
            out.push(p);
        }
        return out;
    }

    // ------------------------------------------------------------------ ACADEMIA (minigames/Gym.js): cada clipe é UMA repetição
    // (0 = posição inicial, meio = o ponto de esforço, fim = de volta). O jogador controla o quadro pelo mini-game; os frequentadores
    // repetem em loop. A "arma" do clipe é a faixa de peso (w1 leve · w2 médio · w3 pesado): muda as anilhas desenhadas.
    // Vistos de perto (128 px/m): u(t) de cada exercício = o ritmo do mini-game (os pontos de "empacar" de Gym.EX.stick dependem dele).
    const gymTier = (w) => (w === 'w2' || w === 'w3' ? w : 'w1');
    // Barra entre as duas mãos (ao longo da linha dos punhos).
    function barInHands(p, prop) {
        const B = p.bones(), fR = p.fist_world(B, 'R'), fL = p.fist_world(B, 'L');
        const c = V.mul(V.add(fR, fL), 0.5), x = nrm(V.sub(fR, fL)), z0 = [0, 0, 1];
        const y = nrm(V.cross(z0, x)), z = V.cross(x, y);
        p.props.push([prop, M4(G.fromCols(x, y, z), c)]);
        return c;
    }
    // Rosca direta: de pé, barra curta com pegada por baixo; os cotovelos colados no corpo dobram até a barra chegar ao peito e descem
    // devagar (a descida é mais lenta que a subida). O tronco fica firme: um pouco à frente embaixo e só 2,5° para trás no topo.
    function gymCurl(w, n = 12) {
        const out = [], tier = gymTier(w);
        for (let i = 0; i < n; i++) {
            const t = i / n, u = t < 0.42 ? ease(t / 0.42) : 1 - ease((t - 0.42) / 0.58);       // sobe em 42% do ciclo, desce no resto
            const p = base();
            p.pelvis_t = [0, 0, -0.4];
            standLegs(p, 13.6, [0.6, 0.6]);
            p.chest_R = Rx(deg(-1.5 + 4 * u));
            p.head_R = Rx(deg(HEAD_TILT - 3 * u));
            for (const sd of ['R', 'L']) p.arm_fk(sd, { flex: 4 + 18 * u, abd: 9, elbow: 12 + 128 * u, twist: 90 });
            barInHands(p, 'curlbar_' + tier);
            out.push(p);
        }
        return out;
    }
    // Supino: deitado no banco (cabeça para +y, junto ao suporte), pés no chão dos lados; a barra desce até o peito e sobe até os
    // braços esticarem (travados, dentro do alcance). A barra é colocada pelas mãos (o banco e o suporte vêm no clipe).
    function gymBench(w, n = 12) {
        const out = [], tier = gymTier(w), BH = 22.0;                         // altura do estofado (unidades do pacote)
        for (let i = 0; i < n; i++) {
            const t = i / n, u = t < 0.5 ? 1 - ease(t / 0.5) : ease((t - 0.5) / 0.5);           // 1 = braços esticados (começa lá em cima)
            const p = base();
            p.pelvis_t = [0, -14.0, BH + 3.5 - SKEL.pelvis[1][2]];
            p.pelvis_R = Rx(deg(-90));
            p.chest_R = Rx(deg(4));
            p.head_R = Rx(deg(-6 - 4 * (1 - u)));
            for (const [sd, s] of [['R', 1], ['L', -1]]) placeFoot(p, sd, [s * 15.0, -34.0, 0], s * 10, 0, [s * 0.5, -0.2, 1.0]);
            const co = chestOrg(p);
            for (const [sd, s] of [['R', 1], ['L', -1]]) p.arm_ik(sd, inReach(p, sd, V.add(co, [s * 15.0, 9.0, 8.0 + 18.0 * u]), 0.985), [s * 1.0, -0.4, -0.3]);
            barInHands(p, 'barbell_' + tier);
            p.props.push(['gym_bench', M4(I3(), [0, co[1] - 4.0, 0])]);
            out.push(p);
        }
        return out;
    }
    // Agachamento: barra nas costas (sobre o trapézio, presa ao peito: arm_ik 'body'), pegada larga; o quadril vai para TRÁS e para
    // baixo até as coxas ficarem paralelas ao chão, a pélvis e o tronco inclinam para a FRENTE (Rx(−): ~32° embaixo) com a cabeça olhando
    // à frente, os joelhos seguem a ponta dos pés (abertos 22°); sobe empurrando. Pés plantados. A gaiola fica em volta.
    function gymSquat(w, n = 12) {
        const out = [], tier = gymTier(w);
        for (let i = 0; i < n; i++) {
            const t = i / n, u = t < 0.55 ? ease(t / 0.55) : 1 - ease((t - 0.55) / 0.45);       // 0 = de pé, 1 = embaixo (desce devagar)
            const p = base();
            p.pelvis_t = [0, -7.0 * u, -0.5 - 13.0 * u];
            for (const [sd, s] of [['R', 1], ['L', -1]]) p.leg_ik(sd, [15.0 * s, 1.5, ANKLE_H], [0.37 * s, 0.93, 0], footRot(-22 * s, 0));
            p.pelvis_R = Rx(deg(-18 * u));
            p.chest_R = Rx(deg(-14 * u));
            p.head_R = Rx(deg(HEAD_TILT + 24 * u));
            const C = p.bones().chest;
            for (const [sd, s] of [['R', 1], ['L', -1]]) p.arm_ik(sd, V.add(C.t, mv3(C.R, [s * 21.0, -4.5, 20.5])), mv3(C.R, [s * 1.0, -0.2, -1.0]), null, 'body');
            barInHands(p, 'barbell_' + tier);
            p.props.push(['gym_rack', M4(I3(), [0, 0, 0])]);
            out.push(p);
        }
        return out;
    }

    // ------------------------------------------------------------------ reações
    // Levou um golpe: o tronco e a cabeça vão para trás (o máximo na 2ª chave), os braços abrem um pouco e tudo volta ao idle. Pés
    // parados onde o idle os põe (antes o direito escorregava 1,5 u); 4 chaves a 12 qps (o CLIPS reamostra).
    function hurt() {
        // [pélvis y, z, giro da pélvis (Rx: + = para trás), peito, cabeça, guinada da cabeça, braço R [flexão, abertura, cotovelo]]
        const K = [[-1.2, -0.6, 5, 9, 14, -6, [14, 22, 30]], [-2.0, -1.4, 7, 12, 20, -8, [22, 28, 40]], [-1.0, -0.8, 2, 3, 6, -3, [12, 18, 26]], [-0.2, -0.2, 0, 0, 1, 0, [5, 13, 16]]];
        return K.map(([py, pz, pp, cp, hp, hy, [af, aa, ae]]) => {
            const p = base();
            p.pelvis_t = [0, py, pz];
            p.pelvis_R = Rx(deg(pp));
            p.chest_R = Rx(deg(cp));
            p.head_R = mm3(Rz(deg(hy)), Rx(deg(HEAD_TILT + hp)));
            standLegs(p, 10.5, [0.4, 0.4], 10);
            p.arm_fk('R', { flex: af, abd: aa, elbow: ae });
            p.arm_fk('L', { flex: af * 0.8, abd: aa + 2, elbow: ae * 1.15 });
            return p;
        });
    }
    // Deitado de costas (a cabeça para trás, −y): costas, nádegas, panturrilhas e a nuca NO CHÃO — a malha adulta é mais grossa que o
    // pacote: a pélvis fica a LIE_Z (o 10 de antes deixava o tronco ~10 u no ar, só os calcanhares no chão) —, joelhos um pouco erguidos,
    // pés caídos para fora. O quadril fica atrás da origem (LIE_Y): o tronco ~0,45 m atrás dos pés, onde o jogo põe a poça (Blood._pool), e ao
    // levantar (getUp) os pés chegam perto da origem.
    const LIE_Z = 1.6, LIE_Y = -9.0;
    function lying(p, arms = 'spread', headYaw = 0.0) {
        p.pelvis_t = [0, LIE_Y, LIE_Z - RIG.pelvis[1][2]];
        p.pelvis_R = Rx(deg(90));
        p.chest_R = Rx(deg(-4));
        p.head_R = mm3(Rz(deg(headYaw)), Rx(deg(-12)));
        p.leg_fk('R', { flex: 5, abd: -6, knee: 10, foot: -22, twist: -14 });           // (abd do leg_fk > 0 FECHA a perna: −6 = afastadas)
        p.leg_fk('L', { flex: 4, abd: -5, knee: 8, foot: -22, twist: -12 });
        if (arms === 'spread') { p.arm_fk('R', { flex: -8, abd: 48, elbow: 22 }); p.arm_fk('L', { flex: -8, abd: 44, elbow: 28 }); }
        else { p.arm_fk('R', { flex: -7, abd: 27, elbow: 16 }); p.arm_fk('L', { flex: -7, abd: 29, elbow: 14 }); }      // (perto do 'spread': lie → dead)
    }
    // Morte (refeita: as chaves pulavam — braços 30 u por quadro, o corpo pairando 10 u acima do chão no meio da queda): o tiro joga o
    // tronco e a cabeça para trás, os joelhos cedem, senta no chão e deita de costas. Os braços vão para a frente na queda (inércia) e
    // caem abertos no chão; a cabeça tomba para o lado. Pés plantados (IK) até sentar, os calcanhares deslizam para a frente; depois as
    // pernas (FK) esticam no chão. 8 chaves a 12 qps (o CLIPS reamostra); a última = deitado (lying), igual ao `lie` no corpo.
    // Sola ADULTA (a malha): com o pé chato só a ponta encosta (o calcanhar fica ~3 u acima); erguendo a ponta, o calcanhar vira o apoio
    // e o tornozelo DESCE (o groundLift é do pé do pacote: subia). Fundo do pé abaixo do tornozelo (u adultas) por inclinação, medido
    // (igual em todos os tipos, ±0,5). heelFoot: calcanhar no chão com a ponta erguida pitchD°.
    const SOLE_A = [[0, 13.4], [10, 11.5], [20, 10.4], [30, 10.4], [45, 10.1], [60, 9.0]];
    function heelFoot(p, side, x, y, yawD, pitchD, pole = null) {
        const s = side === 'R' ? 1 : -1, kl = G.ADULT ? G.ADULT.leg : 1;
        p.leg_ik(side, [x, y, ANKLE_H - (13.4 - keys(SOLE_A, clip(pitchD, 0, 60))) / kl], pole || [0.15 * s, 1.0, 0.0], footRot(yawD, pitchD));
    }
    function death(blood = false) {
        // [pélvis y, z, giro (Rx: + = para trás), peito, cabeça, guinada da cabeça, pés (y, ponta erguida°) ou pernas FK [flexão, joelho],
        //  braço R [flexão, abertura, cotovelo] (o L vem atrasado)]
        const K = [
            [-1.0, -1.0, 6, 10, HEAD_TILT + 16, 0, [0.4, 0], [8, 22, 20]],
            [-2.0, -6.0, 16, 8, HEAD_TILT + 8, 0, [0.5, 0], [26, 36, 32]],
            [-3.0, -14.0, 32, 4, HEAD_TILT - 2, 0, [1.5, 6], [42, 40, 38]],
            [-3.6, -22.0, 52, 0, HEAD_TILT - 14, 0, [6.0, 24], [58, 44, 42]],
            [-4.0, -27.0, 70, -6, -2, 0, ['fk', 80, 122], [68, 48, 40]],
            [-4.0, -30.4, 84, -6, -9, 4, ['fk', 53, 86], [50, 54, 34]],
            [-4.0, -30.0, 90, -5, -12, 14, ['fk', 26, 51], [18, 52, 26]],
        ];
        const out = K.map(([py, pz, pp, cp, hp, hy, lg, [af, aa, ae]], i) => {
            const p = base();
            p.pelvis_t = [0, py, pz]; p.pelvis_R = Rx(deg(pp)); p.chest_R = Rx(deg(cp)); p.head_R = mm3(Rz(deg(hy)), Rx(deg(hp)));
            if (lg[0] === 'fk') { p.leg_fk('R', { flex: lg[1], abd: -6, knee: lg[2], foot: -6 - 2 * i, twist: -10 }); p.leg_fk('L', { flex: lg[1] - 3, abd: -5, knee: lg[2] - 4, foot: -6 - 2 * i, twist: -8 }); }
            else if (i < 2) standLegs(p, 10.5, [lg[0], lg[0]], 10);
            else { heelFoot(p, 'R', 10.5, lg[0], -10, lg[1]); heelFoot(p, 'L', -10.5, lg[0] + 0.5, 10, lg[1] * 0.8); }
            const lag = i < 4 ? 5 : -4;                                            // o braço esquerdo atrasa um pouco (sobe e desce depois)
            p.arm_fk('R', { flex: af, abd: aa, elbow: ae });
            p.arm_fk('L', { flex: af - lag, abd: aa + 3, elbow: ae + 4 });
            return p;
        });
        const p = base(); lying(p, 'spread', 26); out.push(p);
        if (blood) {                                                                                                   // NOVO: poça de sangue se espalhando
            out[6].props.push(['blood', M4(mm3(Rz(deg(20)), [0.7, 0, 0, 0, 0.7, 0, 0, 0, 1]), [3.0, -14.0, 0.5]), 'ground']);
            out[7].props.push(['blood', M4(Rz(deg(20)), [3.0, -14.0, 0.5]), 'ground']);
        }
        return out;
    }
    // Levantar (refeito: a chave 2→3 pulava 46 u): de costas, senta (o peito enrola, os cotovelos e depois as mãos empurram o chão, os
    // pés vêm para perto do quadril), joga o peso para a frente sobre os pés (agachado: a chave 3 — o jogo começa aqui na metade, fase
    // 0,5, depois da cambalhota) e sobe até o idle. Pés plantados (IK) do sentar em diante, já onde o idle os põe; 7 chaves a 10 qps (o CLIPS reamostra).
    function getUp() {
        const out = [];
        let p = base(); lying(p, 'side'); out.push(p);
        p = base(); lying(p, 'side');                                                         // 1: meio sentado — o peito enrola, joelhos sobem, cotovelos no chão
        p.pelvis_t = V.add(p.pelvis_t, [0, 0.5, 1.5]); p.pelvis_R = Rx(deg(72)); p.chest_R = Rx(deg(-22)); p.head_R = Rx(deg(-14));
        p.leg_fk('R', { flex: 71, abd: -6, knee: 94, foot: -6, twist: -8 }); p.leg_fk('L', { flex: 74, abd: -5, knee: 100, foot: -4, twist: -6 });
        p.arm_fk('R', { flex: -34, abd: 24, elbow: 52 }); p.arm_fk('L', { flex: -34, abd: 24, elbow: 52 });
        out.push(p);
        p = base();                                                                           // 2: sentado, mãos no chão do lado do quadril, pés plantados
        p.pelvis_t = [0, -6.0, -24.0]; p.pelvis_R = Rx(deg(46)); p.chest_R = Rx(deg(-40)); p.head_R = Rx(deg(HEAD_TILT - 8));
        placeFoot(p, 'R', [10.5, 0.4, 0], -10); placeFoot(p, 'L', [-10.5, 0.4, 0], 10);
        p.arm_ik('R', [17.0, -6.0, 0.6], [0.6, 1.0, -0.4], null, 'world'); p.arm_ik('L', [-17.0, -6.0, 0.6], [-0.6, 1.0, -0.4], null, 'world');
        out.push(p);
        p = base();                                                                           // 3: o peso vai para a frente: agachado sobre os pés, mãos no chão
        p.pelvis_t = [0, -2.0, -21.0]; p.pelvis_R = Rx(deg(-10)); p.chest_R = Rx(deg(-22)); p.head_R = Rx(deg(HEAD_TILT + 12));
        placeFoot(p, 'R', [10.5, 0.4, 0], -10); placeFoot(p, 'L', [-10.5, 0.4, 0], 10);
        p.arm_ik('R', [15.0, 5.0, 1.2], [0.8, -0.4, -0.6], null, 'world'); p.arm_ik('L', [-15.0, 5.5, 1.2], [-0.8, -0.4, -0.6], null, 'world');
        out.push(p);
        p = base();                                                                           // 4: subindo, as mãos saem do chão
        p.pelvis_t = [0, -0.8, -12.5]; p.pelvis_R = Rx(deg(-12)); p.chest_R = Rx(deg(-12)); p.head_R = Rx(deg(HEAD_TILT + 8));
        placeFoot(p, 'R', [10.5, 0.4, 0], -10); placeFoot(p, 'L', [-10.5, 0.4, 0], 10);
        p.arm_fk('R', { flex: 26, abd: 15, elbow: 40 }); p.arm_fk('L', { flex: 24, abd: 15, elbow: 42 });
        out.push(p);
        p = base();                                                                           // 5: quase em pé
        p.pelvis_t = [0, -0.2, -4.5]; p.pelvis_R = Rx(deg(-5)); p.chest_R = Rx(deg(-4)); p.head_R = Rx(deg(HEAD_TILT + 3));
        standLegs(p, 10.5, [0.4, 0.4], 10);
        p.arm_fk('R', { flex: 11, abd: 13, elbow: 24 }); p.arm_fk('L', { flex: 10, abd: 13, elbow: 24 });
        out.push(p);
        out.push(idle()[0]);
        return out;
    }
    // Mãos ao alto: as mãos sobem de onde o idle as deixa (IK desde o 1º quadro — o quadro 0 em FK pulava para o IK) até abertas acima
    // dos ombros, os cotovelos sempre para fora (o mesmo polo).
    const UP_WAY = [[0.35, [21.0, 8.0, 40.0]], [0.7, [19.0, 6.0, 57.0]], [1.0, [16.0, 3.0, 67.0]]], UP_POLE = [1.0, -0.35, -0.45];
    function armsUp(p, s, space = null) {
        const tR = keys([[0, pt4(idle()[0].bones().hand_R, FIST)]].concat(UP_WAY), s), tL = V.mulv(tR, [-1, 1, 1]);
        p.arm_ik('R', tR, UP_POLE, null, space); p.arm_ik('L', tL, V.mulv(UP_POLE, [-1, 1, 1]), null, space);
    }
    function handsUp(n = 5) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const s = i / (n - 1), p = base();
            standLegs(p, 10.5, [0.4, 0.4], 10);
            armsUp(p, s);
            p.head_R = Rx(deg(HEAD_TILT - 4 * s));
            out.push(p);
        }
        return out;
    }
    // Ajoelhar no esqueleto ADULTO: o quadril e o tornozelo vão onde se quer no desenho (o Pose.adult estica a altura e o passo pela perna).
    const KL = () => (G.ADULT ? G.ADULT.leg : 1);
    function hipAt(p, y, z, tiltD = 0) {                                       // centro dos quadris (adulto) em (0, y, z), pélvis em pé
        const R = Rx(deg(tiltD)), hc = [0, y / KL(), ANKLE_H + (z - ANKLE_H) / KL()];
        p.pelvis_R = R; p.pelvis_t = V.sub(V.add(hc, mv3(R, [0, 0, 3.0])), RIG.pelvis[1]);
    }
    function ankleAt(p, side, x, y, z, footR, pole = null) {                   // tornozelo baixo (adulto; z < ANKLE_H): plantado
        const s = side === 'R' ? 1 : -1;
        p.leg_ik(side, [x, y / KL(), ANKLE_H + (z - ANKLE_H) / KL()], pole || [0.1 * s, 1.0, 0.0], footR);
    }
    // NOVO: ajoelhado com as mãos atrás da cabeça (k: 0 = em pé, 1 = ajoelhado): os joelhos no chão (antes ficavam 2 u no ar), o peito do
    // pé deitado no chão atrás, o tronco ereto, a cabeça um pouco baixa; mãos na nuca (alvo preso ao peito: 'body').
    const KNEEL = { hipY: 8.0, hipZ: 14.9, ankY: -7.0, ankZ: 8.5, ankX: 9.5, pitch: -75 };
    function kneelPose(k) {
        const p = base(), e = ease(k), K = KNEEL;
        hipAt(p, K.hipY * e, ANKLE_H + 42.0 * (1 - e) + (K.hipZ - ANKLE_H) * e, -3 * e);
        p.chest_R = Rx(deg(4 * e));
        p.head_R = Rx(deg(HEAD_TILT - 12 * e));
        for (const [sd, s] of [['R', 1], ['L', -1]]) {
            if (k < 0.02) { placeFoot(p, sd, [s * 10.5, 0.4, 0], -s * 10); continue; }
            ankleAt(p, sd, s * (10.5 + (K.ankX - 10.5) * e), 0.7 + (K.ankY - 0.7) * e, ANKLE_H + (K.ankZ - ANKLE_H) * e, footRot(-s * 10, K.pitch * e));
        }
        armsToHead(p, 1);
        return p;
    }
    // Braços das mãos ao alto (w = 0) até as mãos na nuca (w = 1), presos ao peito ('body'): o caminho é relativo ao peito (desce junto).
    const NAPE = [7.5, -9.5, 26.0], NAPE_POLE = [1.0, 0.3, 0.2];
    function armsToHead(p, w) {
        const c = chestOrg(p), up = V.sub(UP_WAY[2][1], [0, 0, RIG.pelvis[1][2] + RIG.chest[1][2]]);
        for (const [sd, s] of [['R', 1], ['L', -1]]) {
            const m = [s, 1, 1], T = V.add(c, V.mulv(V.lerp(up, NAPE, w), m)), pole = V.mulv(V.lerp(UP_POLE, NAPE_POLE, w), m);
            p.arm_ik(sd, T, pole, null, 'body');
        }
    }
    // Render-se (refeito: pulava do FK para o IK no 1º quadro, os cotovelos viravam na 3→4 e os joelhos nunca chegavam ao chão): mãos ao
    // alto; depois o pé direito vai para trás e o joelho direito desce ao chão, o esquerdo vem (o calcanhar sobe) e as mãos descem para a
    // nuca — a pose final é `kneel`. 8 chaves a 9 qps (o CLIPS reamostra; o jogo conta 0,9 s até ajoelhado).
    function surrenderKneel() {
        const out = [];
        for (const s of [0, 0.35, 0.7, 1.0]) { const p = base(); standLegs(p, 10.5, [0.4, 0.4], 10); armsUp(p, s, 'body'); p.head_R = Rx(deg(HEAD_TILT - 4 * s)); out.push(p); }
        const K = KNEEL, kR = () => footRot(-10, K.pitch);
        let p = base();                                                                     // 4: o pé direito sai para trás
        hipAt(p, 1.5, 37.0, -2); p.head_R = Rx(deg(HEAD_TILT - 6));
        p.leg_ik('R', [10.5, -4.5, ANKLE_H + 6.0], [0.1, 1.0, 0.0], footRot(-10, -20)); placeFoot(p, 'L', [-10.5, 0.4, 0], 10);
        armsToHead(p, 0.25); out.push(p);
        p = base();                                                                         // 5: o joelho direito no chão, o esquerdo dobrado
        hipAt(p, 4.5, 18.5, -3); p.chest_R = Rx(deg(2)); p.head_R = Rx(deg(HEAD_TILT - 9));
        ankleAt(p, 'R', K.ankX, K.ankY, K.ankZ, kR()); placeFoot(p, 'L', [-10.5, 0.4, 0], 10);
        armsToHead(p, 0.65); out.push(p);
        p = base();                                                                         // 6: o esquerdo desce (calcanhar erguido)
        hipAt(p, 7.0, 15.8, -3); p.chest_R = Rx(deg(3)); p.head_R = Rx(deg(HEAD_TILT - 11));
        ankleAt(p, 'R', K.ankX, K.ankY, K.ankZ, kR()); ankleAt(p, 'L', -K.ankX, -3.0, 9.0, footRot(10, -50));
        armsToHead(p, 0.92); out.push(p);
        out.push(kneelPose(1));
        return out;
    }
    // NOVO: pânico — corre com as mãos sacudindo no alto.
    function scared(n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, p = base();
            runLegs(p, t);
            p.chest_R = mm3(Rz(deg(-8 * cos(TAU * t))), Rx(deg(-2)));
            p.head_R = mm3(Rz(deg(12 * sin(TAU * t))), Rx(deg(HEAD_TILT + 6)));
            const c = chestOrg(p), s = sin(TAU * t * 2);                        // (mãos para o alto, abanando — dentro do alcance)
            p.arm_ik('R', V.add(c, [16.0 + 2 * s, 5.0, 35.0 + 3 * s]), [1.0, -0.2, -0.3]);
            p.arm_ik('L', V.add(c, [-16.0 + 2 * s, 5.0, 35.0 - 3 * s]), [-1.0, -0.2, -0.3]);
            out.push(p);
        }
        return out;
    }
    // Arremessado no ar (explosão, atropelamento, queda do helicóptero): o corpo deitado para TRÁS (~50°: vai cair de costas — emenda com o
    // `lie`; antes ia para a frente), a cabeça erguida olhando o chão, braços e pernas se debatendo fora de fase (as pernas abertas: o
    // abd do leg_fk > 0 as cruzava). Cíclico (t = i/n); o Ragdoll dá a fase (2,5 ciclos/s).
    function flail(n = 4) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, s = sin(TAU * t), c = cos(TAU * t), s2 = sin(TAU * (t + 0.3)), c2 = cos(TAU * (t + 0.3)), p = base();
            p.pelvis_t = [0, -4.0, -1.0 + 1.5 * s];                                   // (a parte de baixo rente ao chão: no ar o jogo ergue o sprite)
            p.root = Rx(deg(48 + 5 * s));
            p.chest_R = Rx(deg(-14 + 4 * c));
            p.head_R = mm3(Rz(deg(6 * c)), Rx(deg(HEAD_TILT - 26 + 5 * s)));
            p.arm_fk('R', { flex: 92 + 34 * s, abd: 58 + 14 * c, elbow: 38 + 18 * c });
            p.arm_fk('L', { flex: 92 - 34 * s2, abd: 58 - 14 * c2, elbow: 38 - 18 * c2 });
            p.leg_fk('R', { flex: 36 + 22 * s, abd: -14, knee: 48 + 24 * c, foot: -10 });
            p.leg_fk('L', { flex: 36 - 22 * s2, abd: -14, knee: 48 - 24 * c2, foot: -10 });
            p.shadowScale = 0.75;
            out.push(p);
        }
        return out;
    }
    // Cambalhota PARA A FRENTE (antes girava Rx(+) — para trás — e o peito e a cabeça arqueavam para trás): encolhido (queixo no peito,
    // as mãos nas canelas), o corpo gira uma volta inteira em volta do centro do "bolo" (TUCK_C, rel. à pélvis) e esse centro fica na
    // altura em que a parte de baixo ROLA no chão (TUCK_R: raio de suporte da malha adulta por ângulo, de 15 em 15°, medido — mãos,
    // cabeça encolhida, costas, nádegas, pés; nada afunda nem flutua): no quadro 0 (= o fim da volta) está agachado sobre os pés,
    // o peso já à frente (como o levantar na fase 0,5, que o Ragdoll emenda depois da cambalhota).
    // Cíclico (t = i/n): o Ragdoll dá a fase (setPhase) e pode dar várias voltas. Pélvis em espaço adulto (absPelvis; membros em FK).
    const GROUND_A = -7.7;                                                     // o chão na malha adulta (a sola do pé em pé), em z do pacote
    const TUCK_C = [0, 23.0, 3.0], TUCK_R = [35.2, 33.5, 29.5, 23.7, 19.8, 21.5, 22.2, 25.3, 27.1, 27.5, 26.6, 24.5, 21.8, 23.2, 24.5, 26.8, 28.8, 30.2, 30.9, 30.2, 28.7, 28.2, 32.1, 34.7];
    const TUCK_RK = TUCK_R.map((r, k) => [15 * k, r]).concat([[360, TUCK_R[0]]]), TUCK_A0 = 20.0, TUCK_Y = 9.0;   // (quadro 0: um pouco à frente, pés perto da origem)
    function tumble(n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, a = TUCK_A0 + 360 * t, p = base(), R = Rx(deg(-a));
            p.absPelvis = true;
            p.root = R;
            p.pelvis_t = V.sub(V.sub([0, TUCK_Y, GROUND_A + keys(TUCK_RK, a % 360)], mv3(R, TUCK_C)), RIG.pelvis[1]);
            p.pelvis_R = Rx(deg(-10));
            p.chest_R = Rx(deg(-55));
            p.head_R = Rx(deg(-45));
            p.leg_fk('R', { flex: 125, abd: -4, knee: 125, foot: -18 });
            p.leg_fk('L', { flex: 121, abd: -4, knee: 121, foot: -18 });
            p.arm_fk('R', { flex: 70, abd: 16, elbow: 100 });
            p.arm_fk('L', { flex: 66, abd: 16, elbow: 104 });
            p.shadowScale = 0.9;
            out.push(p);
        }
        return out;
    }
    // NOVO: deitado, vivo (o primeiro quadro do levantar).
    const lie = () => [getUp()[0]];

    // ------------------------------------------------------------------ tático (jogador)
    // Tronco inclinado para a FRENTE (lean, graus; a pélvis inclinada à parte: pelvisLean) com a torção da arma (se houver): agachado
    // e andando agachado. A cabeça compensa quase toda a inclinação (continua olhando à frente).
    function leanFor(p, name, lean, pelvisLean = 0) {
        const h = WEAPON_HOLD[name];
        p.chest_R = mm3(Rz(deg(h ? h.chest_yaw : 0)), Rx(deg(-lean)));
        p.head_R = mm3(Rz(deg(h ? h.head_yaw : 0)), Rx(deg(HEAD_TILT + (lean + pelvisLean) * 0.75)));
        return h;
    }
    // A arma acompanha o tronco inclinado (fração k da inclinação, em volta da origem do peito), a mira continua na horizontal: deslocamento
    // para o bob do holdWeapon.
    const leanGrip = (name, lean, k) => { const g = WEAPON_HOLD[name].grip; return V.sub(mv3(Rx(deg(-lean * k)), g), g); };
    // NOVO: agachado (atrás de uma cobertura / furtivo) — joelhos bem dobrados, pé esquerdo à frente, tronco inclinado. Com arma de
    // fogo ela fica erguida, pronta (é só levantar e atirar); sem arma, os antebraços à frente. Respira devagar.
    function crouchIdle(name, n = 4) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = (i + 0.25) / n, b = sin(TAU * t), p = base(), lean = 20 + 1.5 * b;      // (¼ de quadro adiantado: com n par, sin(i/n) repetia quadros)
            standLegs(p, 12.5, [-4.5, 5.5], 16, 13.5 + 0.35 * b);
            p.pelvis_t = V.add(p.pelvis_t, [0, -2.0, 0]);
            p.pelvis_R = Rx(deg(-10));
            const h = leanFor(p, name, lean, 10);
            if (h) holdWeapon(p, name, { keepChest: true, bob: V.add(leanGrip(name, lean + 10, 0.5), [0, 0, 0.25 * b]) });
            else {
                p.arm_fk('R', { flex: 40 + 2 * b, abd: 16, elbow: 72 });
                p.arm_fk('L', { flex: 34 + 2 * b, abd: 18, elbow: 66 });
            }
            out.push(p);
        }
        return out;
    }
    // NOVO: andar agachado (furtivo) — joelhos dobrados, passos longos e lentos rolando o pé (apoio 62%), tronco inclinado.
    // Pé plantado a 0,72 da velocidade do andar (o fator do jogo).
    const SNEAK = { stride: 7.77, stance: 0.62, lift: 2.2, width: 8.6, heel: 10, toeoff: -22, flat: 0.25, roll: 0.6, peak: 0.45 };
    function sneakWalk(name, n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, c = cos(TAU * t), p = base(), lean = 16;
            p.pelvis_t = [0.5 * sin(TAU * (t - 0.06)), 0.5, -7.5 - 0.6 * cos(2 * TAU * (t - 0.06))];
            p.pelvis_R = mm3(Rz(deg(4 * c)), Rx(deg(-8)));
            const h = leanFor(p, name, lean, 8);
            gait(p, t, SNEAK);
            if (h) holdWeapon(p, name, { keepChest: true, bob: V.add(leanGrip(name, lean + 8, 0.5), [0, 0, 0.4 * cos(2 * TAU * t)]) });
            else {
                p.arm_fk('R', { flex: 34 - 8 * c, abd: 16, elbow: 74 });
                p.arm_fk('L', { flex: 34 + 8 * c, abd: 18, elbow: 70 });
            }
            out.push(p);
        }
        return out;
    }
    // Pernas do PASSO LATERAL, no esqueleto ADULTO (abs) como o gait: o pé de apoio anda de lado na velocidade do chão (plantado) e o
    // outro é levado no ar (Hermite, saindo e chegando na velocidade do apoio × retract) sem cruzar — passo e fecha, com apoio duplo:
    // t = 0 o pé direito pousa por fora (pés afastados), t = 0,5 o esquerdo pousa por dentro (pés juntos). O corpo anda para a DIREITA
    // (+x); tocado ao contrário, para a esquerda. step = metade do trecho do pé no apoio (pacote; × STRIDE_K × ADULT.leg no adulto),
    // width = do pé ao meio do corpo com o quadril padrão (7,4). Pé plantado (de lado) a 2·step/(stance·ciclo).
    function sideGait(p, t, { step = 3.5, lift = 2.4, width = 14.0, stance = 0.6, retract = 0.7 } = {}) {
        const kl = G.ADULT ? G.ADULT.leg : 1, S = step * STRIDE_K() * kl, m = ((-2 * S) / stance) * (1 - stance) * retract;
        if (G.ADULT) p.abs = Object.assign(p.abs || {}, { legR: true, legL: true });
        for (const [side, s, ph0] of [['R', 1, t], ['L', -1, t + 0.5]]) {
            const ph = ((ph0 % 1) + 1) % 1, x0 = s * (abs(RIG['thigh_' + side][1][0]) + width - 7.4);
            let x, z = 0;
            if (ph < stance) x = S * (1 - (2 * ph) / stance);
            else { const u = (ph - stance) / (1 - stance); x = hermite(-S, S, m, m, u); z = lift * kl * bump(u, 0.45); }
            p.leg_ik(side, [x0 + x, s * 0.6 * kl, ANKLE_H + z], [0.15 * s, 1.0, -0.3], footRot(-s * 10, 0));
        }
    }
    // AJOELHADO EM UM JOELHO (cobertura e tiro agachado, como o soldado atrás da mureta): o joelho DIREITO no chão com o peito do pé
    // deitado atrás, o pé ESQUERDO plantado à frente (a canela em pé), o quadril baixo. b = respiração (sobe/desce), kick = o tranco do
    // tiro empurra o quadril um tico para trás.
    function kneelLegs(p, b = 0, kick = 0) {
        const K = KNEEL;
        hipAt(p, 2.0 - kick, 20.0 + 0.3 * b, -4);
        ankleAt(p, 'R', K.ankX, K.ankY - 2.5, K.ankZ, footRot(-12, K.pitch));
        placeFoot(p, 'L', [-8.5, 10.5, 0], 8);
    }
    // MIRANDO AJOELHADO (crouch_aim): um joelho no chão, a arma no ombro apontada, o tronco um pouco à frente.
    function kneelAim(name, n = 4) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const b = sin(TAU * (i + 0.25) / n), p = base();
            kneelLegs(p, b);
            holdWeapon(p, name, { chest_extra: 5, bob: [0, 0, 0.2 * b] });
            out.push(p);
        }
        return out;
    }
    // ATIRANDO AJOELHADO (crouch_shoot): a sequência de tiro da arma (recuo, clarão, cápsula) com as pernas ajoelhadas.
    function kneelShoot(name, n) { KNEELING = true; try { return shootFn(name, n); } finally { KNEELING = false; } }
    // NA COBERTURA (cover): ajoelhado de COSTAS para a mureta (o jogo vira o corpo para fora dela), a mão esquerda espalmada na mureta
    // atrás, a cabeça virada de lado (olhando ao longo dela) e a arma baixa, pronta — o cano para baixo e para a frente; pistola junto ao
    // peito; sem arma, o antebraço apoiado no joelho. Respira devagar.
    function coverIdle(name, n = 4) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = (i + 0.25) / n, b = sin(TAU * t), p = base();
            kneelLegs(p, b);
            p.chest_R = mm3(Rz(deg(14)), Rx(deg(6 + 1.5 * b)));                // (o peito vira para a mão que vai na mureta e encosta nela)
            p.head_R = mm3(Rz(deg(32)), Rx(deg(HEAD_TILT - 2)));
            const co = chestOrg(p);
            p.arm_ik('L', V.add(co, [-13.5, -11.0, 6.0 + 0.4 * b]), [-1.0, 0.3, -0.4]);   // a mão na mureta, atrás e ao lado
            if (name !== 'none' && WEAPON_HOLD[name]) {
                if (WEAPON_HOLD[name].one_hand) {
                    const grip = V.add(co, [7.0, 9.0, -3.0 + 0.3 * b]);
                    placeProp(p, name, grip, nrm([-0.15, 0.75, -0.65]));
                    p.arm_ik('R', grip, [1.0, -0.4, -0.8]);
                } else {
                    const grip = V.add(co, [8.0, 7.5, -4.5 + 0.3 * b]);
                    const Mp = placeProp(p, name, grip, nrm([-0.35, 0.7, -0.62]));
                    if (name === 'shotgun') p.props.push(['pump', mm4(Mp, M4(null, [0, PUMP_Y, 0.7]))]);
                    subProps(p, name, Mp);
                    p.arm_ik('R', grip, [1.0, -0.6, -0.7]);
                }
            } else p.arm_fk('R', { flex: 34 + 2 * b, abd: 18, elbow: 64 });
            out.push(p);
        }
        return out;
    }
    // NOVO: andando de lado MIRANDO (strafe): passo lateral com a arma apontada; a pélvis desce com os pés afastados e sobe com eles
    // juntos. Para a frente/para trás mirando, o jogo usa o andar armado (walk:arma), normal ou ao contrário.
    function strafeWalk(name, n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, p = base();
            p.pelvis_t = [0, 0, -1.6 - 0.8 * cos(TAU * (t - 0.05))];
            p.pelvis_R = Ry(deg(2.5 * sin(TAU * t)));
            sideGait(p, t);
            holdWeapon(p, name);
            out.push(p);
        }
        return out;
    }
    // NOVO: rolamento de ESQUIVA. O jogo desliza o jogador ROLL.dist em ROLL.time com velocidade ∝ sen(πk) (player._updateRoll) e o
    // clipe inteiro dura o rolamento (o quadro i em k = i/n). Do repouso (o 1º quadro do idle sem arma): abaixa inclinando PARA A
    // FRENTE e leva os braços à frente com os pés plantados (pernas em `abs`, no espaço adulto e presas ao MUNDO: andam para trás no
    // quadro na medida em que o jogador avança — não deslizam), dá o impulso (os calcanhares sobem, os pés saem do chão), rola encolhido
    // uma volta inteira para a frente (Rx negativo: a cabeça vai à frente; o ponto mais baixo do corpo encosta no chão — nem afunda,
    // nem flutua), pousa os pés à frente e levanta passando por cima deles até o repouso (o último quadro = o 1º do idle).
    const ROLL = { dist: 4.4, time: 0.6 };                                  // = Config.tactics.rollDist / rollTime
    function dodgeRoll(n = 14) {
        const rest = idle(1)[0], U = (G.PPU || 26) / 0.5, out = [];
        if (!G.ADULT) return [...Array(n)].map(() => clonePose(rest));
        const Dk = (k) => (ROLL.dist * U * (1 - cos(PI * clip(k, 0, 1)))) / 2;        // o quanto o jogador já andou (u adultas)
        const kE = (n - 1) / n, kL = 0.79, RA = rest.adult().B;
        const foot0 = { R: RA.foot_R.t, L: RA.foot_L.t }, fr0 = { R: rest.leg.R[3], L: rest.leg.L[3] };
        const ang = [[0, 0], [0.16, 0], [0.24, -40], [0.5, -205], [0.72, -340], [kL, -360]];
        const lean = [[0, 0], [0.07, 14], [0.15, 38], [0.22, 42], [0.32, 34], [0.7, 34], [kL, 40], [0.86, 22], [kE, 0]];
        const nod = [[0, 0], [0.15, 8], [0.24, -10], [0.7, -14], [kL, 0], [0.86, 6], [kE, 0]];          // cabeça: olha à frente → queixo no peito
        const py = [[0, 0], [0.15, 4.0], [0.22, 5.5], [0.5, 3.0], [kL, 2.0], [0.86, 1.0], [kE, 0]];
        const pz = [[0, 0], [0.07, -3.5], [0.15, -9.5], [0.22, -12.5], [kL, -15.0], [0.86, -8.0], [kE, 0]];
        const armK = [[0, [4, 12, 14]], [0.15, [62, 16, 24]], [0.24, [86, 18, 30]], [0.34, [70, 22, 95]], [0.7, [70, 22, 95]], [kL, [55, 20, 60]], [0.86, [34, 16, 36]], [kE, [4, 12, 14]]];
        const TUCK = (s) => [8.0 * s, 12.6, -14.2], tuckW = [[0, 0], [0.22, 0], [0.3, 1], [0.69, 1], [kL - 0.01, 0], [1, 0]];
        const heel = [[0, 0], [0.13, 0], [0.2, 26], [0.26, 36]];           // impulso: o calcanhar sobe, a ponta empurra o chão
        // pontos do corpo (no esqueleto adulto) e o raio do volume em volta de cada um: o mais baixo não passa do chão
        const PTS = [['head', [0, 0, 9], 9], ['chest', [0, 0, 11], 11], ['pelvis', [0, 0, 0], 9], ['uarm_R', [0, 0, 0], 6], ['uarm_L', [0, 0, 0], 6], ['farm_R', [0, 0, 0], 4], ['farm_L', [0, 0, 0], 4],
            ['hand_R', [0, 0, -3], 3], ['hand_L', [0, 0, -3], 3], ['shin_R', [0, 0, 0], 5], ['shin_L', [0, 0, 0], 5], ...['R', 'L'].flatMap((sd) => [['foot_' + sd, HEEL, 0], ['foot_' + sd, TOE, 0]])];
        const lowest = (B) => min(...PTS.map(([b, o, r]) => pt4(B[b], o)[2] - r));
        for (let i = 0; i < n; i++) {
            const k = i / n;
            if (i === 0 || i === n - 1) { out.push(clonePose(rest)); continue; }
            const p = base(), th = keys(ang, k), ln = keys(lean, k), a = keys(armK, k), tw = keys(tuckW, k), air = k > 0.17 && k < kL;
            p.root = abs(th) > 1e-6 ? Rx(deg(th)) : null;
            p.chest_R = Rx(deg(-ln));
            p.head_R = Rx(deg(HEAD_TILT + keys(nod, k)));
            for (const sd of ['R', 'L']) p.arm_fk(sd, { flex: a[0], abd: a[1], elbow: a[2] });
            p.pelvis_t = [0, keys(py, k), keys(pz, k)];
            p.abs = { legR: true, legL: true };
            const legs = () => {
                const Pm = p.adult().B.pelvis;
                for (const [sd, s] of [['R', 1], ['L', -1]]) {
                    // no chão: antes do impulso, preso ao ponto do repouso (andando para trás com o jogador); depois, onde vai pousar para
                    // terminar no repouso (o último quadro)
                    const pre = k < 0.5, hl = pre ? keys(heel, k) : 0, Fw = V.add(foot0[sd], [0, pre ? -Dk(k) : Dk(kE) - Dk(k), 0]);
                    const toe = mv3(fr0[sd], TOE), lift = V.sub(toe, mv3(mm3(fr0[sd], Rx(deg(-hl))), TOE));          // girar em volta da ponta
                    const Tg = V.add(Fw, lift), Tt = pt4(Pm, TUCK(s)), T = V.lerp(Tg, Tt, ease(tw));
                    const pole = nrm(V.lerp([0.12 * s, 1.0, 0.0], mv3(Pm.R, [0.12 * s, 1.0, 0.5]), ease(tw)));
                    const Rf = nlerpR(mm3(fr0[sd], Rx(deg(-hl))), mm3(Pm.R, Rx(deg(-30))), ease(tw));
                    p.leg_ik(sd, T, pole, Rf);
                }
            };
            legs();
            if (air) for (let it = 0; it < 4; it++) {                         // no ar/rolando: o ponto mais baixo encosta no chão
                const lo = lowest(p.adult().B), dz = (0 - lo) / 1.35;
                if (abs(dz) < 0.05) break;
                p.pelvis_t = V.add(p.pelvis_t, [0, 0, dz]); legs();
            }
            p.shadowScale = air ? 0.85 : 1.0;
            out.push(p);
        }
        return out;
    }

    // NOVO: pular uma grade/muro (salto encolhido). O jogo desliza o jogador até o outro lado e levanta o desenho num arco (game._tryVault:
    // runSequence glide + arc em 0,6 s = a duração do clipe), então o clipe fica NO LUGAR: do repouso (o 1º quadro do idle sem arma)
    // impulsiona inclinando PARA A FRENTE com as mãos indo à grade, encolhe os joelhos junto ao peito (as mãos apoiam embaixo, dentro do
    // alcance), estica as pernas para pousar e termina no repouso (para onde o jogo volta). K quadros em t = j/K da duração (o resample
    // do CLIPS os mantém); tudo contínuo (pernas sempre em IK, braços em IK desde o ponto exato da FK do repouso).
    function vault(K = 9) {
        const rest = idle(1)[0], rh = { R: fkArmIK(rest, 'R'), L: fkArmIK(rest, 'L') }, out = [], E = (K - 1) / K;
        const py = [[0, 0], [0.11, 1.5], [0.33, 2.5], [0.67, 1.5], [E, 0]], pz = [[0, 0], [0.11, -3.0], [0.33, -1.0], [0.56, -1.0], [0.78, -2.0], [E, 0]];
        const lean = [[0, 0], [0.11, 17], [0.33, 30], [0.56, 22], [0.78, 8], [E, 0]], w = [[0, 0], [0.11, 1], [0.67, 1], [E, 0]];
        const hand = (s) => [[0, REST], [0.11, [9.5 * s, 11.0, -8.0]], [0.25, [8.5 * s, 12.0, -17.0]], [0.45, [8.5 * s, 10.0, -19.0]], [0.6, [12.0 * s, 9.0, -13.0]], [0.78, [14.0 * s, 10.0, -3.0]], [E, REST]];
        const foot = (s, push) => [[0, [12.8 * s, 0.4, 0]], [0.11, push ? [11.0 * s, -3.0, 3.0] : [10.0 * s, 5.0, 7.0]], [0.33, [8.0 * s, 6.0, 14.0]], [0.56, [8.5 * s, 7.0, 12.0]], [0.78, [11.0 * s, 3.0, 3.0]], [E, [12.8 * s, 0.4, 0]]];
        const pitch = [[0, 0], [0.11, -30], [0.33, -10], [0.56, -5], [0.78, 8], [E, 0]], tuck = [[0, 0], [0.22, 1], [0.6, 1], [E, 0]];
        const sh = [[0, 1], [0.22, 0.8], [0.67, 0.8], [E, 1]];
        for (let j = 0; j < K; j++) {
            const t = j / K;
            if (j === 0 || j === K - 1) { out.push(clonePose(rest)); continue; }
            const p = base(), ln = keys(lean, t), wt = keys(w, t), tk = keys(tuck, t);
            p.pelvis_t = [0, keys(py, t), keys(pz, t)];
            p.chest_R = Rx(deg(-ln));
            p.head_R = Rx(deg(HEAD_TILT + ln * 0.5));
            for (const [sd, s] of [['R', 1], ['L', -1]]) {
                const a = keys(foot(s, sd === 'R'), t), pt = keys(pitch, t) * (sd === 'R' ? 1 : 0.6);
                p.leg_ik(sd, [a[0], a[1], ANKLE_H + a[2] + groundLift(pt) * (1 - clip(a[2] / 4, 0, 1))], nrm([0.12 * s, 1.0, 0.45 * tk]), footRot(-12 * s, pt));
            }
            const C = p.bones().chest;
            for (const [sd, s] of [['R', 1], ['L', -1]]) {
                const ro = mv3(C.R, rh[sd].q), off = keys(hand(s).map(([tt, v]) => [tt, v === REST ? ro : v]), t);
                p.arm_ik(sd, inReach(p, sd, V.add(C.t, off), 0.96), nrm(V.lerp(mv3(C.R, rh[sd].pole), [1.0 * s, -0.2, -0.6], wt)));
            }
            p.shadowScale = keys(sh, t);
            out.push(p);
        }
        return out;
    }

    // ---- carro: a porta fica À FRENTE do personagem (o jogo vira o boneco para a porta antes)
    // Gestos de pé com as mãos (porta, carro, bolso): K quadros em t = j/K da duração (a sequência já no nº de quadros do CLIPS: o
    // resample dele não muda nada); o 1º e o último = o REPOUSO (idle quadro 0: sai do idle e volta para ele — e para o sitin — sem salto).
    // A = chaves [t, valor] (t = 1 → o último quadro): lean (tronco para a FRENTE, °: Rx(−)), yaw (giro do peito, + = para a esquerda),
    // py/pz (pélvis), hy (cabeça: giro além do de seguir o peito), R/L (mão: ponto em relação à origem do peito, eixos do corpo, ou REST =
    // onde a FK do repouso a deixa — o braço sai do repouso em IK sem salto), wR/wL (0 = polo do repouso … 1 = polo do gesto), fR/fL (pé
    // [x, y, z]: parado entre chaves iguais; entre diferentes sobe e anda — passo, sem deslizar). o.end = false: o último quadro não volta
    // ao repouso. fx(p, t): objetos/efeitos/escala.
    function standAct(K, A, fx = null, o = {}) {
        const rest = idle(1)[0], rh = { R: fkArmIK(rest, 'R'), L: fkArmIK(rest, 'L') }, out = [], E = (K - 1) / K, end = o.end !== false;
        const tk = (a) => a.map(([tt, v]) => [tt >= 1 ? E : tt, v]);
        const kt = (a, t, d = 0) => (a ? keys(tk(a), t) : d);
        for (let j = 0; j < K; j++) {
            const t = j / K;
            let p;
            if (j === 0 || (end && j === K - 1)) p = clonePose(rest);
            else {
                p = base();
                const ln = kt(A.lean, t), yw = kt(A.yaw, t);
                p.pelvis_t = [0, kt(A.py, t), kt(A.pz, t)];
                p.pelvis_R = mm3(Rz(deg(yw * 0.35)), Rx(deg(-ln * 0.35)));
                p.chest_R = mm3(Rz(deg(yw * 0.65)), Rx(deg(-ln * 0.65)));
                p.head_R = mm3(Rz(deg(kt(A.hy, t) - yw * 0.6)), Rx(deg(HEAD_TILT + ln * kt(A.hl, t, 0.5))));
                for (const [sd, s] of [['R', 1], ['L', -1]]) {
                    const q = A['f' + sd] ? stepAt(tk(A['f' + sd]), t) : [10.5 * s, 0.4, 0];
                    p.leg_ik(sd, [q[0], q[1], ANKLE_H + q[2]], null, footRot(-10 * s, 0));
                }
                const C = p.bones().chest;
                for (const [sd, s] of [['R', 1], ['L', -1]]) {
                    const ro = mv3(C.R, rh[sd].q), off = keys(tk(A[sd] || [[0, REST], [1, REST]]).map(([tt, v]) => [tt, v === REST ? ro : v]), t);
                    p.arm_ik(sd, inReach(p, sd, V.add(C.t, off), 0.96), nrm(V.lerp(mv3(C.R, rh[sd].pole), [s, -0.3, -0.8], kt(A['w' + sd], t))));
                }
            }
            if (fx) fx(p, t);
            out.push(p);
        }
        return out;
    }
    // Pé por chaves [t, [x, y, z]]: parado entre chaves iguais; entre diferentes anda com ease e sobe no meio (passo: o pé não desliza).
    function stepAt(K, t) {
        let i = 0;
        while (i < K.length - 2 && t > K[i + 1][0]) i++;
        const [t0, a] = K[i], [t1, b] = K[min(i + 1, K.length - 1)], u = t1 > t0 ? clip((t - t0) / (t1 - t0), 0, 1) : 1, d = V.len(V.sub(b, a));
        return d < 1e-6 ? a.slice() : V.add(V.lerp(a, b, ease(u)), [0, 0, min(1.6, 0.3 * d) * sin(PI * u)]);
    }
    // NOVO: abrir a porta — a direita vai à maçaneta (tronco para a frente), puxa a porta para fora e para trás (o quadril recua, o peito
    // gira com ela) e a esquerda segura a borda da porta que vem; as duas voltam ao repouso. O jogo dispara o puxão (a moto tombada sobe)
    // na fase 0,6 (Player.YANK): é o fim do puxão. Pés plantados.
    function openDoor(K = 8) {
        return standAct(K, {
            lean: [[0, 0], [0.18, 9], [0.38, 16], [0.46, 15], [0.6, -2], [0.8, 1], [1, 0]],
            yaw: [[0, 0], [0.38, 4], [0.6, -10], [0.8, -3], [1, 0]],
            py: [[0, 0], [0.38, 1.6], [0.6, -0.8], [1, 0]], pz: [[0, 0], [0.38, -1.4], [0.6, -0.6], [1, 0]],
            R: [[0, REST], [0.18, [8.0, 16.0, -8.0]], [0.38, [5.0, 25.0, -7.0]], [0.46, [5.5, 24.0, -7.0]], [0.6, [14.0, 11.0, -5.0]], [0.8, [15.0, 5.0, -10.0]], [1, REST]],
            L: [[0, REST], [0.3, REST], [0.5, [-7.0, 15.0, -6.0]], [0.62, [-5.0, 13.0, -4.0]], [0.82, [-10.0, 6.0, -10.0]], [1, REST]],
            wR: [[0, 0], [0.18, 1], [0.8, 1], [1, 0]], wL: [[0, 0], [0.3, 0], [0.5, 1], [0.82, 0.6], [1, 0]],
        });
    }
    // NOVO: roubar o carro — agarra a maçaneta, escancara a porta, mete as duas mãos (o pé esquerdo avança), agarra o motorista e arranca
    // ele jogando o corpo para trás (o pé volta). O jogo dispara o puxão na fase 0,5 (Player.YANK): as mãos já fecharam (0,47) e o corpo
    // começa a ir para trás; o fim do puxão em 0,62. Termina no repouso.
    function carjack(K = 9) {
        return standAct(K, {
            lean: [[0, 0], [0.15, 9], [0.27, -1], [0.39, 21], [0.47, 24], [0.62, -9], [0.8, -2], [1, 0]],
            yaw: [[0, 0], [0.15, 1], [0.27, -12], [0.39, 6], [0.47, 4], [0.62, -24], [0.8, -7], [1, 0]],
            py: [[0, 0], [0.15, 0.8], [0.27, -0.4], [0.39, 2.6], [0.47, 3.0], [0.62, -1.4], [0.8, -0.3], [1, 0]],
            pz: [[0, 0], [0.15, -0.8], [0.27, -1.0], [0.39, -2.0], [0.47, -2.2], [0.62, -1.4], [1, 0]],
            R: [[0, REST], [0.15, [7.0, 20.0, -7.0]], [0.27, [15.0, 11.0, -4.0]], [0.39, [4.0, 27.0, 3.0]], [0.47, [5.0, 26.0, 4.0]], [0.62, [10.0, 9.0, 2.0]], [0.8, [15.0, 4.0, -6.0]], [1, REST]],
            L: [[0, REST], [0.15, [-10.0, 9.0, -9.0]], [0.27, [-6.0, 14.0, -2.0]], [0.39, [-6.0, 27.0, 4.0]], [0.47, [-5.0, 26.0, 5.0]], [0.62, [-2.0, 11.0, 4.0]], [0.8, [-12.0, 5.0, -6.0]], [1, REST]],
            wR: [[0, 0], [0.15, 1], [0.8, 1], [1, 0]], wL: [[0, 0], [0.15, 0.5], [0.27, 1], [0.8, 1], [1, 0]],
            fL: [[0, [-10.5, 0.4, 0]], [0.27, [-10.5, 0.4, 0]], [0.39, [-10.0, 5.5, 0]], [0.5, [-10.0, 5.5, 0]], [0.64, [-10.5, 0.4, 0]], [1, [-10.5, 0.4, 0]]],
        });
    }
    // NOVO: entrar no carro (NPC; o jogador usa o sitin) — mãos no teto e no batente, põe o pé direito no carro, abaixa a cabeça curvando
    // o tronco e "some" pela porta (encolhe: o jogo esconde o sprite no fim). Chaves nos tempos de antes (k/6).
    function enterCar(K = 9) {
        const sc = [[0, 1], [1 / 6, 0.92], [2 / 6, 0.78], [3 / 6, 0.62], [4 / 6, 0.48], [5 / 6, 0.36]];
        return standAct(K, {
            lean: [[0, 0], [1 / 6, 10], [3 / 6, 26], [5 / 6, 32], [1, 32]], hl: [[0, 0.5], [3 / 6, 0.2], [1, 0.1]],
            py: [[0, 0], [1 / 6, 2.0], [3 / 6, 6.5], [5 / 6, 10.0], [1, 10.0]], pz: [[0, 0], [1 / 6, -1.5], [3 / 6, -5.5], [5 / 6, -9.0], [1, -9.0]],
            R: [[0, REST], [1 / 6, [10.0, 18.0, -2.0]], [3 / 6, [10.0, 21.0, 4.0]], [5 / 6, [10.0, 22.0, 4.0]], [1, [10.0, 22.0, 4.0]]],
            L: [[0, REST], [1 / 6, [-10.0, 16.0, -4.0]], [3 / 6, [-10.0, 20.0, 3.0]], [5 / 6, [-10.0, 20.0, 4.0]], [1, [-10.0, 20.0, 4.0]]],
            wR: [[0, 0], [1 / 6, 1], [1, 1]], wL: [[0, 0], [1 / 6, 1], [1, 1]],
            fR: [[0, [10.5, 0.4, 0]], [0.1, [10.5, 0.4, 0]], [3 / 6, [10.5, 14.0, 3.0]], [1, [10.5, 14.0, 3.0]]],
            fL: [[0, [-10.5, 0.4, 0]], [3 / 6, [-10.5, 0.4, 0]], [5 / 6, [-10.5, 6.0, 0]], [1, [-10.5, 6.0, 0]]],
        }, (p, t) => { const s = keys(sc, t); p.scale = s; p.shadowScale = 0.6 + 0.4 * s; }, { end: false });
    }
    // Sentar no carro (o jogador): do REPOUSO de frente para a porta aberta (o 1º quadro = idle quadro 0, onde o opendoor/carjack
    // terminam; o sitout, ao contrário, termina nele), apoia a mão no batente e a outra na porta, põe no carro o pé do lado de dentro, gira
    // o corpo para a frente do carro curvando o tronco para a FRENTE (abaixa a cabeça sob o teto), senta no banco (encostado: um pouco
    // para trás) e recolhe a outra perna; as mãos vão ao volante. w = 'L' (a frente do carro fica à ESQUERDA de quem olha para a porta:
    // porta do motorista) | 'R'. O jogo desliza o personagem da porta até o banco durante o clipe (SIT_IN.travel m, smoothstep —
    // Game._enterCar) e esconde sob a carroceria o que já entrou; aqui tudo é relativo a esse deslize, então o pé de fora fica plantado no
    // chão até subir. Tudo direto no esqueleto ADULTO (abs); os polos de cotovelos e joelhos giram junto com o quadril (sem virar o
    // cotovelo no meio do giro).
    const SIT_IN = { travel: 1.05, n: 14, fps: 14 };
    function sitIn(w = 'L', n = SIT_IN.n) {
        const f = w === 'R' ? 1 : -1, u = U(), D = SIT_IN.travel, out = [], A = G.ADULT || { arm: 1, hand: 1 };
        const sst = (s) => s * s * (3 - 2 * s);                                 // = o deslize do jogo (Player.update: _glide)
        // o repouso no adulto, em metros no referencial da porta (no 1º quadro o personagem está na porta): quadril, tornozelos, mãos
        const rest = idle(1)[0], RB = rest.adult().B, m = (q) => V.mul(q, 1 / u), arm = A.arm * (UPPER + LOWER) - FIST[2] * (A.hand || 1);
        const hip0 = m(V.add(RB.pelvis.t, mv3(RB.pelvis.R, [0, 0, -3.0]))), ank0 = (sd) => m(V.sub(RB['foot_' + sd].t, [0, 0, ANKLE_H]));
        const hand0 = (sd) => m(pt4(RB['farm_' + sd], [0, 0, -(LOWER * A.arm - FIST[2] * (A.hand || 1))])), pole0 = (sd) => nrm(V.sub(RB['farm_' + sd].t, RB['uarm_' + sd].t));
        // chaves em metros, no referencial da PORTA: x = lado (+f = frente do carro), y = para dentro do carro, z = altura
        const hipK = [[0, hip0], [0.25, [0, 0.12, hip0[2] - 0.03]], [0.5, [f * 0.06, 0.55, 0.64]], [0.75, [f * 0.12, 0.92, 0.5]], [1, [f * 0.14, D, 0.47]]];
        const yawK = [[0, 0], [0.22, -f * 18], [0.5, -f * 68], [0.75, -f * 90], [1, -f * 90]];
        const leanK = [[0, 0], [0.25, 9], [0.48, 26], [0.66, 20], [0.85, 2], [1, -8]];        // para a FRENTE (+): abaixa sob o teto; no banco, encostado
        const lead = f < 0 ? 'R' : 'L', trail = lead === 'R' ? 'L' : 'R', ls = lead === 'R' ? 1 : -1;
        const leadK = [[0, ank0(lead)], [0.2, [-f * 0.06, 0.24, 0.26]], [0.42, [f * 0.14, 0.66, 0.3]], [0.62, [f * 0.36, 0.96, 0.2]], [1, [f * 0.5, D + 0.09, 0.18]]];
        const trailK = [[0, ank0(trail)], [0.55, ank0(trail)], [0.75, [f * 0.22, 0.56, 0.36]], [1, [f * 0.5, D - 0.09, 0.18]]];
        const leadYawK = [[0, 0], [0.4, -f * 50], [0.7, -f * 90], [1, -f * 90]], trailYawK = [[0, 0], [0.55, 0], [0.8, -f * 90], [1, -f * 90]];
        // mãos: no batente (alto, à frente) e na borda da porta (a do lado da frente do carro) → no volante (à frente do banco; a direita de quem olha para +f é −f em y)
        const wheel = [f * 0.4, D, 0.9], sideR = [0, -f * 0.18, 0];
        const fh = f < 0 ? 'L' : 'R', bh = fh === 'R' ? 'L' : 'R', wh = (sd) => (sd === 'R' ? V.add(wheel, sideR) : V.sub(wheel, sideR));   // fh: a mão do lado da frente (vai à porta)
        const handK = { [bh]: [[0, hand0(bh)], [0.2, [-f * 0.05, 0.42, 1.28]], [0.35, [-f * 0.05, 0.42, 1.28]], [0.9, wh(bh)], [1, wh(bh)]],
            [fh]: [[0, hand0(fh)], [0.24, [f * 0.38, 0.28, 1.02]], [0.4, [f * 0.38, 0.28, 1.02]], [0.9, wh(fh)], [1, wh(fh)]] };
        const bump = (s, a, b) => sin(PI * clip((s - a) / (b - a), 0, 1));
        for (let i = 0; i < n; i++) {
            const s = i / (n - 1), back = D * sst(s);
            const rel = (q) => [q[0] * u, (q[1] - back) * u, q[2] * u];       // porta → relativo ao personagem (que desliza)
            const p = base(), hip = rel(keys(hipK, s)), yaw = keys(yawK, s), lean = keys(leanK, s), Ry_ = Rz(deg(yaw));
            p.shadow = s < 0.55;
            p.absPelvis = true;
            p.abs = { armR: true, armL: true, legR: true, legL: true };
            p.pelvis_R = mm3(Ry_, Rx(deg(3 * ease(s / 0.8))));
            p.pelvis_t = V.sub(V.sub(hip, mv3(p.pelvis_R, [0, 0, -3.0])), RIG.pelvis[1]);
            p.chest_R = Rx(deg(-lean));
            p.head_R = Rx(deg(HEAD_TILT + lean * 0.3));
            const w0 = ease(s / 0.2), sit = ease((s - 0.45) / 0.45);           // w0: polos do repouso → do gesto
            const lpole = (sd) => mv3(Ry_, V.lerp([0.12 * sd, 1.0, 0.0], [0, 1.0, 0.45], sit));
            const lf = rel(keys(leadK, s)), tf = rel(keys(trailK, s));
            p.leg_ik(lead, [lf[0], lf[1], ANKLE_H + lf[2]], nrm(lpole(ls)), footRot(-10 * ls + keys(leadYawK, s), 20 * bump(s, 0.1, 0.6)));
            p.leg_ik(trail, [tf[0], tf[1], ANKLE_H + tf[2]], nrm(lpole(-ls)), footRot(10 * ls + keys(trailYawK, s), 25 * bump(s, 0.6, 0.9)));
            // braços: alvo dentro do alcance ADULTO (o ombro do adulto desta pose)
            const BA = p.adult().B;
            for (const [sd, k] of [['R', 1], ['L', -1]]) {
                const J = BA['uarm_' + sd].t, T = rel(keys(handK[sd], s)), d = V.sub(T, J), L = V.len(d), Tk = L > 0.995 * arm ? V.add(J, V.mul(d, (0.995 * arm) / L)) : T;
                p.arm_ik(sd, Tk, nrm(V.lerp(pole0(sd), mv3(Ry_, [k * 1.0, -0.3, -0.7]), w0)));
            }
            out.push(p);
        }
        return out;
    }
    // NOVO: arrombar na manha — agachado e debruçado para a FRENTE sobre a fechadura, mexendo a gazua (loop). A fechadura é um ponto
    // FIXO no mundo (arm_ik 'world': as mãos ficam nela enquanto o corpo respira e balança); a gazua anda numa elipse pequena (sem
    // quadros parados) e a esquerda segura a tensão.
    function pickLock(n = 6) {
        const out = [], lean = 22, pz = -4.0;
        const ref = base();
        ref.pelvis_t = [0, 1.0, pz]; ref.pelvis_R = Rx(deg(-lean * 0.35)); ref.chest_R = Rx(deg(-lean * 0.65));
        const lock = V.add(chestOrg(ref), [1.5, 19.0, 1.0]);                       // a fechadura (à frente do peito, na altura da cintura)
        for (let i = 0; i < n; i++) {
            const t = i / n, s = sin(TAU * t), c = cos(TAU * t), p = base();
            p.leg_ik('R', [11.5, 0.0, ANKLE_H], null, footRot(-12, 0));
            p.leg_ik('L', [-11.0, 4.5, ANKLE_H], null, footRot(10, 0));
            p.pelvis_t = [0.4 * c, 1.0 + 0.3 * s, pz + 0.3 * s];
            p.pelvis_R = mm3(Rz(deg(-2 * c)), Rx(deg(-lean * 0.35)));
            p.chest_R = mm3(Rz(deg(3 * c)), Rx(deg(-lean * 0.65 - 1.2 * s)));
            p.head_R = mm3(Rz(deg(4 * s)), Rx(deg(HEAD_TILT - 2 + 1.5 * c)));
            p.arm_ik('R', V.add(lock, [3.0 + 0.9 * c, 0, 1.0 * s]), [1.0, -0.4, -0.8], null, 'world');
            p.arm_ik('L', V.add(lock, [-3.5, 0.5, 1.6 - 0.5 * s]), [-1.0, -0.4, -0.8], null, 'world');
            const B = p.bones(), hR = B.hand_R.R;
            p.props.push(['pick', M4(mm3(hR, Rx(deg(-70))), V.add(p.fist_world(B, 'R'), mv3(hR, [0, 2.4, -0.4])))]);
            out.push(p);
        }
        return out;
    }
    // NOVO: furto (carteirada) — do repouso, chega o corpo para a frente e de lado, a direita mergulha baixa no bolso da vítima, pega a
    // carteira (o jogo dispara o "pegou" na fase 0,5 — Player.YANK: a carteira aparece na mão a partir dali) e a leva ao próprio bolso;
    // a cabeça olha para o outro lado, disfarçando. Volta ao repouso (sem a carteira: guardada). Pés plantados.
    function pickpocket(K = 9) {
        return standAct(K, {
            lean: [[0, 0], [0.15, 6], [0.34, 15], [0.46, 18], [0.62, 8], [0.8, 1], [1, 0]],
            yaw: [[0, 0], [0.15, 6], [0.34, 14], [0.46, 16], [0.62, 6], [0.8, -3], [1, 0]],
            hy: [[0, 0], [0.2, -12], [0.46, -20], [0.7, -12], [1, 0]],
            py: [[0, 0], [0.34, 1.6], [0.46, 2.0], [0.7, 0.4], [1, 0]], pz: [[0, 0], [0.34, -1.4], [0.46, -1.6], [0.7, -0.4], [1, 0]],
            R: [[0, REST], [0.15, [10.0, 12.0, -14.0]], [0.34, [6.0, 23.0, -17.0]], [0.46, [5.0, 25.0, -18.0]], [0.62, [10.0, 14.0, -14.0]], [0.77, [14.0, 3.0, -15.0]], [1, REST]],
            wR: [[0, 0], [0.15, 1], [0.8, 1], [1, 0]],
        }, (p, t) => {
            if (t < 0.5 || t >= (K - 1) / K) return;
            const B = p.bones(), hR = B.hand_R.R;
            p.props.push(['wallet', M4(hR, V.add(p.fist_world(B, 'R'), mv3(hR, [0, 2.6, -0.6])))]);
        });
    }
    // NOVO: anunciar o assalto — arma apontada (empurrada para a frente e de volta: ameaça), a mão livre faz sinal de "passa tudo"
    // (loop). Pés, quadril e cabeça saem da MIRA (gunIdle quadro 0 = o fim do draw e o aim, de onde o jogo entra no holdup): ao entrar
    // só a mão livre muda de lugar.
    function holdup(name, n = 4) {
        const out = [], h = WEAPON_HOLD[name];
        for (let i = 0; i < n; i++) {
            const a = TAU * (i / n), s = sin(a), co = cos(a), p = base();
            p.pelvis_t = [0, 0, -0.9 + 0.35 * co];
            standLegs(p, 11.5, [-1.5, 2.5]);
            // arma e mão livre andam em ELIPSES (velocidade quase constante: sem quadros parados nos picos do seno); a da arma passa pela
            // mira em t = 0 (entra do aim sem salto) e empurra para a frente enquanto a mão livre volta alta ("passa tudo": sai baixa)
            const bob = [0, (h.one_hand ? 1.6 : 1.2) * s, 0.5 * (1 - co)];
            if (h.one_hand) {
                holdWeapon(p, name, { bob, freeL: true });
                const c = chestOrg(p);
                p.arm_ik('L', V.add(c, [-8.0, 20.0 + 2.5 * co, 8.0 + 2.2 * s]), [-1.0, -0.3, -0.8]);
            } else holdWeapon(p, name, { bob });
            p.head_R = mm3(Rz(deg(h.head_yaw + 4 * s)), Rx(deg(HEAD_TILT - 4)));
            out.push(p);
        }
        return out;
    }
    // NOVO: mexer na bolsa / jaqueta (inventário) — curvado um pouco para a FRENTE olhando para baixo; a esquerda abre a jaqueta e a direita
    // remexe no bolso de dentro numa volta contínua (loop; sem quadros repetidos). Mãos presas ao peito (arm_ik 'body'), pés plantados.
    function rummage(n = 9) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const a = TAU * (i / n), s = sin(a), c = cos(a), p = base();
            standLegs(p, 11.0, [0.4, 1.0], 10);
            p.pelvis_t = [0.3 * s, 0, -0.6 + 0.2 * c];
            p.pelvis_R = Rx(deg(-3));
            p.chest_R = mm3(Rz(deg(6 + 3 * s)), Rx(deg(-6 - 1.5 * c)));
            p.head_R = mm3(Rz(deg(-6 + 2 * s)), Rx(deg(HEAD_TILT - 22)));
            const C = p.bones().chest, at = (q) => V.add(C.t, mv3(C.R, q));          // (no referencial do peito)
            p.arm_ik('L', at([-6.0 + 0.6 * s, 12.5, 9.0 + 0.5 * c]), [-1.0, -0.3, -0.8], null, 'body');
            p.arm_ik('R', at([2.5 + 2.2 * c, 11.0 - 1.4 * s, 6.0 + 2.6 * s]), [1.0, -0.3, -0.8], null, 'body');
            out.push(p);
        }
        return out;
    }
    // NOVO: carregando (maleta / sacola) na mão ESQUERDA — a direita fica livre (ou com a pistola).
    function handBag(p, kind) {
        const B = p.bones(), fist = p.fist_world(B, 'L'), R = lookRot([0, 1.0, 0], [0, 0, 1]);
        p.props.push([kind, M4(kind === 'duffel' ? mm3(R, Rz(deg(90))) : R, V.add(fist, [0, 0, -0.4]))]);
    }
    // Correndo com a bolsa (ciclo de 0,615 s: 12 quadros a 19,5 qps): a passada da corrida esticada para o pé plantado a 4,3 m/s.
    const RUN_HOLD = Object.assign({}, RUN, { stride: 11.65 });
    function holdAnim(gaitKind, weapon, kind = 'briefcase', n = null) {
        const N = n || (gaitKind === 'idle' ? 4 : 8), out = [];
        for (let i = 0; i < N; i++) {
            const t = i / N, p = base(), c = cos(TAU * t), ca = cos(TAU * (t - 0.04));
            if (gaitKind === 'idle') { p.pelvis_t = [0, 0, -0.2 + 0.2 * cos(TAU * t)]; standLegs(p, 10.5, [0.4, 0.4], 10); }
            else if (gaitKind === 'walk') { walkLegs(p, t); walkUpper(p, t, false); }
            else runLegs(p, t, RUN_HOLD);
            // o tronco inclina um pouco para a frente (andando/correndo) e para o lado contrário ao peso (a bolsa à esquerda)
            p.chest_R = mm3(Ry(deg(kind ? 4 : 0)), mm3(Rz(deg(gaitKind === 'idle' ? 0 : -6 * c)), Rx(deg(gaitKind === 'run' ? -6 : gaitKind === 'walk' ? -3 : 0))));
            p.arm_fk('L', { flex: gaitKind === 'run' ? 8 * ca : gaitKind === 'walk' ? 4 * ca : 0, abd: 8, elbow: 4 });
            if (weapon === 'pistol') holdWeapon(p, 'pistol', { keepChest: true, freeL: true });
            else if (gaitKind === 'run') p.arm_fk('R', { flex: -42 * ca + 10, abd: 14, elbow: 84 - 12 * ca });
            else p.arm_fk('R', { flex: gaitKind === 'walk' ? -20 * ca + 3 : 4, abd: 11, elbow: 14 + 5 * (1 - ca) });
            if (kind) handBag(p, kind);
            out.push(p);
        }
        return out;
    }
    // NOVO: puxando a mala de rodinhas (o braço direito quase esticado para trás, a mala inclinada atrás).
    function pullAnim(gaitKind, n = null) {
        const N = n || (gaitKind === 'idle' ? 4 : 8), out = [];
        for (let i = 0; i < N; i++) {
            const t = i / N, p = base(), ca = cos(TAU * (t - 0.04));
            if (gaitKind === 'idle') { p.pelvis_t = [0, 0, -0.2 + 0.2 * cos(TAU * t)]; standLegs(p, 10.5, [0.4, 0.4], 10); }
            else { walkLegs(p, t); walkUpper(p, t, false, 20, 4.0); }
            const co = chestOrg(p);
            p.arm_ik('R', V.add(co, [15.3, -7.3, -3.4]), [1.0, 0.4, -0.6]);           // (a 97% do alcance, na direção da alça)
            p.arm_fk('L', { flex: gaitKind === 'idle' ? 4 : 22 * ca + 3, abd: 11, elbow: 14 + 7 * (1 + ca) });
            const tilt = gaitKind === 'idle' ? 0 : 1;
            const R = mm3(Rz(deg(90)), Rx(deg(-28 * tilt)));
            const B = p.bones(), fist = p.fist_world(B, 'R');
            p.props.push(['suitcase', M4(R, V.add(fist, [0.0, -0.5, 0.0]))]);
            out.push(p);
        }
        return out;
    }
    // NOVO: sobrecarregado — fardo nas costas, curvado para a frente, passos curtos e pesados (apoio 65%, ciclo de 1 s: pé plantado a
    // 0,88 m/s com ritmo 1 — o jogo toca no ritmo do andar: fator 0,55).
    const HEAVY_WALK = { stride: 7.0, stance: 0.65, lift: 1.2, width: 9.2, toe: 12, heel: 10, toeoff: -24 };
    function walkHeavy(n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, c = cos(TAU * t), p = base();
            p.pelvis_t = [0.7 * sin(TAU * (t - 0.06)), 0, -1.8 - 0.7 * cos(2 * TAU * (t - 0.06))];
            gait(p, t, HEAVY_WALK);
            p.pelvis_R = mm3(Rz(deg(4 * c)), Rx(deg(-8)));
            p.chest_R = mm3(Rz(deg(-5 * c)), Rx(deg(-14)));
            p.head_R = mm3(Rz(deg(3 * c)), Rx(deg(HEAD_TILT + 14)));
            heavyLoad(p);
            out.push(p);
        }
        return out;
    }
    // O fardo nas costas e as mãos nas alças, presas ao peito (o mesmo em parado/andando/correndo: a carga nunca some). bob: as mãos
    // sacodem.
    function heavyLoad(p, bob = 0) {
        const B = p.bones(), C = B.chest;
        p.arm_ik('R', pt4(C, [11.0, 6.0, 20.0 + bob]), [1.0, -0.3, -1.0], null, 'body');
        p.arm_ik('L', pt4(C, [-11.0, 6.0, 20.0 - bob]), [-1.0, -0.3, -1.0], null, 'body');
        p.props.push(['sack', mm4(C, M4(Rx(deg(-10)), [0, -16.0, 16.0])), 'chest']);
    }
    // NOVO: correndo com o fardo — passos mais curtos e rápidos que a corrida (ciclo de 0,47 s), tronco bem curvado para a frente
    // segurando as alças; o fardo pula a cada passada. Pé plantado a 4,3 m/s com ritmo 1 (o ritmo da corrida).
    const RUN_HEAVY = { stride: 10.4, stance: 0.42, lift: 2.5, width: 8.6, heel: 6, toeoff: -32, kick: 1.0, retract: 0.8, peak: 0.45, fwd: -3.0 };
    function runHeavy(n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, c = cos(TAU * t), p = base();
            p.pelvis_t = [0.4 * sin(TAU * (t - 0.1)), 1.0, (G.ADULT ? -2.4 : -3.8) - 0.8 * cos(2 * TAU * (t - 0.2))];
            p.pelvis_R = mm3(Rz(deg(6 * c)), Rx(deg(-12)));
            gait(p, t, RUN_HEAVY);
            p.chest_R = mm3(Rz(deg(-7 * c)), Rx(deg(-16)));
            p.head_R = mm3(Rz(deg(4 * c)), Rx(deg(HEAD_TILT + 20)));
            heavyLoad(p, 1.2 * sin(2 * TAU * (t - 0.2)));
            out.push(p);
        }
        return out;
    }
    // NOVO: parado com o fardo — curvado para a frente, respirando pesado.
    function idleHeavy(n = 6) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, b = sin(TAU * t), p = base();
            p.pelvis_t = [0, 0, -1.0 + 0.4 * cos(TAU * t)];
            standLegs(p, 11.0, [0.4, 0.4], 12);
            p.pelvis_R = Rx(deg(-6));
            p.chest_R = Rx(deg(-(12 + 2.5 * b)));
            p.head_R = Rx(deg(HEAD_TILT + 14 - 1.5 * b));
            heavyLoad(p);
            out.push(p);
        }
        return out;
    }

    // ------------------------------------------------------------------ natação
    // Na água os braços vão em IK com o alvo da mão em relação ao OMBRO, no referencial do peito e em frações do alcance — q = [para fora,
    // para a frente do peito (deitado: para baixo), para cima do peito (deitado: à frente)] — e o polo do cotovelo no mesmo referencial:
    // no adulto ('reach') o braço guarda a direção e a fração do alcance. Pernas em FK. Cada nado é uma função do ciclo que devolve o
    // ESTADO (números: quadril, inclinação, giro, cabeça, braços, pernas) e wetPose monta a Pose; as passagens (swim_in/out, dive_in/out)
    // interpolam estados: começam na pose do nado de onde saem e terminam no ÚLTIMO quadro do loop seguinte, na pose e na velocidade
    // dele (o loop segue do quadro 0 sem tranco na troca de clipe).
    const SW_REACH = UPPER + LOWER - FIST[2];                               // ombro → punho no IK (pacote)
    const SW_KEYS = [['hip', 3], ['pitch', 1], ['roll', 1], ['twist', 1], ['bend', 1], ['hturn', 1], ['htilt', 1], ['aR', 6], ['aL', 6], ['lR', 4], ['lL', 4]];
    const swFlat = (S) => SW_KEYS.flatMap(([k]) => S[k]);
    function swUnflat(v) { const S = {}; let i = 0; for (const [k, m] of SW_KEYS) { S[k] = m === 1 ? v[i] : v.slice(i, i + m); i += m; } return S; }
    const lerpN = (a, b, f) => a.map((x, i) => x + (b[i] - x) * f);              // (V.lerp é só para 3 números)
    const swMix = (A, B, f) => swUnflat(lerpN(swFlat(A), swFlat(B), f));
    const sstep = (x) => { const u = clip(x, 0, 1); return u * u * (3 - 2 * u); };
    // estado → Pose. hip = origem da pélvis (x, y, z; z = altura em relação à água); pitch/bend = quadril/peito para a FRENTE (°);
    // roll = o corpo todo girando em volta do eixo da frente (+ = lado direito para baixo); twist = o peito girando sobre a coluna;
    // hturn/htilt = cabeça virando / erguendo o queixo (além do HEAD_TILT); aR/aL = [q, polo]; lR/lL = [flex, abd, joelho, pé].
    function wetPose(S) {
        const p = base();
        p.water = 0.0;
        p.pelvis_t = [S.hip[0], S.hip[1], S.hip[2] - RIG.pelvis[1][2]];
        p.pelvis_R = mm3(Ry(deg(S.roll)), Rx(deg(-S.pitch)));
        p.chest_R = mm3(Rz(deg(S.twist)), Rx(deg(-S.bend)));
        p.head_R = mm3(Rz(deg(S.hturn)), Rx(deg(HEAD_TILT + S.htilt)));
        const B = p.bones(), C = B.chest.R;
        for (const [sd, s, a] of [['R', 1, S.aR], ['L', -1, S.aL]])
            p.arm_ik(sd, V.add(B['uarm_' + sd].t, mv3(C, [s * a[0] * SW_REACH, a[1] * SW_REACH, a[2] * SW_REACH])), mv3(C, [s * a[3], a[4], a[5]]));
        for (const [sd, l] of [['R', S.lR], ['L', S.lL]]) p.leg_fk(sd, { flex: l[0], abd: l[1], knee: l[2], foot: l[3] });
        return p;
    }
    // braço escrito no corpo DE PÉ (q e polo: x para fora, y frente, z cima) → no referencial do peito inclinado `pitch`° à frente
    const swUp = (a, pitch) => { const R = Rx(deg(-pitch)); return [...tmv3(R, a.slice(0, 3)), ...tmv3(R, a.slice(3))]; };
    // q[0] que põe o punho ADULTO a x unidades do meio do corpo (a largura dos ombros muda com o tipo; G.ADULT: braço e ombro maiores)
    function swLat(x) {
        const A = G.ADULT, so = RIG.uarm_R[1][0];
        if (!A) return (x - so) / SW_REACH;
        const r = (A.arm * (UPPER + LOWER) - FIST[2] * (A.hand || 1)) / (UPPER + LOWER - FIST[2]);
        return (x - so * (A.width || 1)) / (SW_REACH * r);
    }
    // respingo na linha d'água sob um ponto ADULTO (o Pose.adult afasta os efeitos "no chão" × perna: aqui vai ÷ perna)
    const swFx = (q) => { const kl = G.ADULT ? G.ADULT.leg : 1; return [q[0] / kl, q[1] / kl, 0.0]; };
    const swFist = (p, sd) => { const A = G.ADULT; return pt4(p.adult().B['hand_' + sd], V.mul(FIST, A ? A.hand || 1 : 1)); };
    const swDur = (name) => CLIPS[name].k / CLIPS[name].fps;                  // duração do clipe (s)
    const swEnd = (name) => -1 / (CLIPS[name].n || CLIPS[name].k);           // fase do ÚLTIMO quadro do loop: a passagem acaba nele e o loop segue do 0

    // CRAWL (Shift): o corpo deitado (10° de pernas para baixo), as costas e a nuca na linha d'água, rolando para o lado do braço que
    // puxa (quadril ±20°, ombros ±34°; a cabeça compensa); braço (fase φ = t; o esquerdo t + ½): entra à frente do ombro (φ 0), estica,
    // pega a água e puxa por baixo do peito até a coxa, sai (φ ≈ 0,64) e volta por cima com o cotovelo alto; 4 pernadas por ciclo.
    const CRAWL_Y = -1.0, CRAWL_Z = -2.6, CRAWL_PITCH = 80;
    const CRAWL_ARM = [[0, [0.10, 0.00, 0.80, 0.4, -1, 0.2]], [0.10, [0.07, 0.33, 0.87, 0.5, -1, 0]], [0.25, [0.12, 0.70, 0.52, 1, -0.6, 0.2]],
        [0.40, [-0.08, 0.70, 0.04, 1, -0.5, 0]], [0.54, [0.12, 0.42, -0.55, 0.7, -1, -0.2]], [0.64, [0.25, 0.04, -0.80, 0.5, -1, -0.3]],
        [0.77, [0.32, -0.38, -0.15, 0.5, -1, 0]], [0.89, [0.18, -0.22, 0.52, 0.4, -1, 0.1]], [1, [0.10, 0.00, 0.80, 0.4, -1, 0.2]]];
    const crawlArm = (ph) => keysN(CRAWL_ARM, ph, { loop: true });
    function crawlAt(t) {
        const w = cos(TAU * (t - 0.2)), k = (sd) => 2 * TAU * t + (sd === 'R' ? 0 : PI);
        const leg = (sd) => [3 + 13 * sin(k(sd)), 5, 9 + 13 * (0.5 + 0.5 * sin(k(sd) + 0.9)), -40];
        return { hip: [0, CRAWL_Y, CRAWL_Z + 0.5 * sin(2 * TAU * t)], pitch: CRAWL_PITCH, roll: 20 * w, twist: 14 * w, bend: 0, hturn: -20 * w, htilt: 30,
            aR: crawlArm(t), aL: crawlArm(t + 0.5), lR: leg('R'), lL: leg('L') };
    }
    function swim(n = 8) {
        const out = [], ent = { R: swFx(swFist(wetPose(crawlAt(0.02)), 'R')), L: swFx(swFist(wetPose(crawlAt(0.52)), 'L')) };
        for (let i = 0; i < n; i++) {
            const t = i / n, p = wetPose(crawlAt(t));
            for (const [sd, ph] of [['R', t], ['L', (t + 0.5) % 1.0]])          // a mão entrando na água (o jogo põe as marolas: WaterFx)
                if (ph < 0.14 || ph > 0.97) p.effects.push({ type: 'splash', pos: ent[sd], n: 9, spread: 3.0, seed: i * 7 + (sd === 'R' ? 1 : 0) });
            out.push(p);
        }
        return out;
    }

    // PARADO NA ÁGUA (boiando de pé): pernas em "bicicleta", as mãos no vai-e-vem (sculling) logo abaixo da superfície, o corpo subindo e
    // descendo de leve; duas marolas saindo do corpo.
    function treadAt(t) {
        const c = cos(TAU * t), s_ = sin(TAU * t), lean = 6;
        const arm = (sg) => swUp([swLat(20 + 5 * c), 0.40 + 0.09 * s_ * sg, -0.28 - 0.02 * s_, 1.0, -0.4, -0.5], lean);
        const leg = (ph) => { const k = 25 * sin(TAU * t + ph); return [20 + k, 18, 50 + k, -30]; };
        return { hip: [0, 0, RIG.pelvis[1][2] - 45.5 + 0.8 * s_], pitch: 0, roll: 0, twist: 0, bend: lean, hturn: 0, htilt: 4, aR: arm(1), aL: arm(-1), lR: leg(0), lL: leg(PI) };
    }
    function waterRings(p, t, at, r0, dr, a0) {                             // duas marolas defasadas (nascem fracas, somem no fim: sem emenda)
        for (let k = 0; k < 2; k++) {
            const fr = (t + k * 0.5) % 1.0;
            p.effects.push({ type: 'ring', pos: at, r: r0 + dr * fr, alpha: Math.trunc(a0 * (1 - fr) * min(1, 0.35 + fr * 4)), gaps: 8, phase: fr });
        }
    }
    function swimIdle(n = 6) {
        const out = [];
        for (let i = 0; i < n; i++) { const t = i / n, p = wetPose(treadAt(t)); waterRings(p, t, [0, 4.0, 0], 17, 12, 220); out.push(p); }
        return out;
    }

    // NADO PEITO NA SUPERFÍCIE (o nado normal; o crawl é o nado com Shift): o corpo do "parado na água" inclinado para a frente, a cabeça
    // sempre fora d'água. Ciclo: desliza (braços juntos à frente) → as mãos abrem e descem (puxada: o corpo sobe e respira) → recolhe as
    // mãos ao peito e dobra as pernas → as mãos disparam à frente com a pernada de sapo → desliza. Chaves em ciclo (sem parada na emenda).
    function breastAt(t) {
        const rise = keysN([[0, 0], [0.4, 1], [0.6, 0.6], [0.8, -0.4], [1, 0]], t, { loop: true });
        const lean = 34 - 10 * rise, bend = 6 - 4 * rise, P = lean + bend;
        const glide = [swLat(2.5), 0.84, -0.28, 1, -0.2, -0.6];
        const AK = [[0, glide], [0.22, [swLat(24), 0.78, -0.33, 1, -0.2, -0.6]], [0.42, [swLat(19), 0.40, -0.56, 1, -0.1, -0.5]], [0.54, [swLat(10), 0.50, -0.40, 0.7, -0.3, -0.9]], [0.64, [swLat(4.5), 0.70, -0.32, 0.9, -0.2, -0.7]], [0.74, glide], [1, glide]];
        const LK = [[0, [4, 6, 8, -40]], [0.3, [6, 8, 18, -36]], [0.58, [44, 30, 110, 10]], [0.74, [14, 36, 24, -24]], [0.9, [4, 6, 8, -40]], [1, [4, 6, 8, -40]]];
        const a = swUp(keysN(AK, t, { loop: true }), P), l = keysN(LK, t, { loop: true });
        return { hip: [0, -10.0 + 3 * rise, RIG.pelvis[1][2] - 41.0 + 2.6 * rise], pitch: lean, roll: 0, twist: 0, bend, hturn: 0, htilt: 4 + lean * 0.75 - 3 * rise, aR: a, aL: a, lR: l, lL: l };
    }
    function swimBreast(n = 12) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, p = wetPose(breastAt(t));
            waterRings(p, t, [0, 6.0, 0], 15, 14, 200);                       // marola em volta do peito
            if (t >= 0.6 && t < 0.78) for (const sd of ['R', 'L']) p.effects.push({ type: 'splash', pos: swFx(swFist(p, sd)), n: 5, spread: 2.2, seed: 120 + i + (sd === 'R' ? 1 : 0) });
            out.push(p);
        }
        return out;
    }

    // VADEANDO NO FUNDO (água acima da cintura): passos curtos e lentos com o joelho alto (empurra a água), apoio longo (60% do ciclo: os
    // dois pés no chão um tempo), tronco 12° à frente; os braços abertos na linha d'água puxam a água para trás, opostos às pernas.
    // Pernas próprias (não o gait): o pé plantado anda para trás a velocidade constante e o balanço sai e chega com essa mesma velocidade
    // (sem tranco); passada calibrada para o pé plantado não deslizar no fator do jogo (wade = 0,54 do walk: 0,864 m/s a ritmo 1; player.js e NPC.js).
    const WADE = { L: 8.1, lift: 5.0, width: 10.2, stance: 0.6, toe: 8 };
    function wadeLegs(p, t) {
        const { L, lift, width, stance, toe } = WADE, m = (-2 * L * (1 - stance)) / stance;
        for (const [sd, s, ph0] of [['R', 1, t], ['L', -1, t + 0.5]]) {
            const ph = ph0 % 1.0;
            let y, z, pitch;
            if (ph < stance) { const u = ph / stance; y = L * (1 - 2 * u); z = 0.0; pitch = 0.0; }      // (pé chato no apoio: girar no tornozelo arrastaria o ponto de apoio)
            else {
                const u = (ph - stance) / (1 - stance), u2 = u * u, u3 = u2 * u;
                y = (2 * u3 - 3 * u2 + 1) * -L + (u3 - 2 * u2 + u) * m + (3 * u2 - 2 * u3) * L + (u3 - u2) * m;      // Hermite: sai e chega na velocidade do apoio
                z = lift * sin(PI * u) ** 2; pitch = 8 * sin(PI * u);              // (a ponta sobe um pouco: empurra a água)
            }
            placeFoot(p, sd, [s * width, y, z], -s * toe, pitch);
        }
    }
    function wadeArm(p, sd, q, P) { const B = p.bones(), C = B.chest.R, s = sd === 'R' ? 1 : -1, a = swUp(q, P); p.arm_ik(sd, V.add(B['uarm_' + sd].t, mv3(C, [s * a[0] * SW_REACH, a[1] * SW_REACH, a[2] * SW_REACH])), mv3(C, [s * a[3], a[4], a[5]])); }
    function wadeDeep(n = 10) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, c = cos(TAU * t), p = base();
            p.pelvis_t = [0, 0.6, -2.4 + 0.5 * cos(2 * TAU * (t - 0.3))];        // mais alto no meio do apoio simples, mais baixo nos dois pés
            wadeLegs(p, t);
            p.pelvis_R = mm3(Rz(deg(4 * c)), Rx(deg(-4)));
            p.chest_R = mm3(Rz(deg(-6 * c)), Rx(deg(-8)));
            p.head_R = mm3(Rz(deg(3 * c)), Rx(deg(HEAD_TILT + 10)));
            for (const [sd, ph] of [['R', PI], ['L', 0]]) {                     // braço oposto à perna: o direito à frente com a perna esquerda
                const a = TAU * t + ph, f = cos(a);
                wadeArm(p, sd, [swLat(27 - 3 * f), 0.18 + 0.30 * f, -0.55 - 0.05 * sin(a), 1, -0.5, -0.4], 12);
            }
            out.push(p);
        }
        return out;
    }
    // PARADO NO FUNDO: de pé com a água na cintura, as mãos abertas na superfície fazendo o "sculling" (abrem e fecham) para se equilibrar,
    // o corpo balançando com a água; as mãos no meio do vai-e-vem do `wade` (trocar entre os dois não dá tranco grande).
    function wadeIdle(n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, c = cos(TAU * t), s_ = sin(TAU * t), p = base();
            p.pelvis_t = [0, 0, -1.6 + 0.5 * s_];
            standLegs(p);
            p.chest_R = mm3(Rz(deg(2 * c)), Rx(deg(-6 - 1 * s_)));
            p.head_R = Rx(deg(HEAD_TILT + 5 + 1.5 * s_));
            for (const sd of ['R', 'L']) wadeArm(p, sd, [swLat(26 + 4 * c), 0.18 + 0.06 * sin(2 * TAU * t), -0.55, 1, -0.5, -0.4], 6);
            out.push(p);
        }
        return out;
    }

    // Interpola listas de números (ângulos das juntas, alvos) por chaves [[t, [..]], ...] — o mesmo keys(), para qualquer tamanho.
    // { loop: true }: ciclo — t dá a volta e a 1ª e a última chave (t 0 e 1) são a mesma pose; as inclinações na emenda usam as chaves do
    // outro lado (passa por ela sem parar, como nas chaves de dentro).
    function keysN(K, t, o) {
        if (!o || !o.loop) return keys(K, t);
        const m = K.length - 1;                                             // chaves distintas 0..m−1 (a m é a 0 de novo, em t = 1)
        t -= Math.floor(t);
        let i = 0;
        while (i < m - 1 && t >= K[i + 1][0]) i++;
        const T = (k) => K[((k % m) + m) % m][0] + Math.floor(k / m), Vk = (k) => K[((k % m) + m) % m][1];
        const t0 = T(i), h = T(i + 1) - t0, u = (t - t0) / h, u2 = u * u, u3 = u2 * u;
        const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = 3 * u2 - 2 * u3, h11 = u3 - u2;
        const tan = (k, j) => {
            const ha = T(k) - T(k - 1), hb = T(k + 1) - T(k), a = Vk(k - 1), b = Vk(k), c = Vk(k + 1);
            const da = ((j < 0 ? b : b[j]) - (j < 0 ? a : a[j])) / ha, db = ((j < 0 ? c : c[j]) - (j < 0 ? b : b[j])) / hb;
            return da * db <= 0 ? 0 : (3 * (ha + hb)) / ((2 * hb + ha) / da + (hb + 2 * ha) / db);
        };
        const v0 = Vk(i), v1 = Vk(i + 1);
        const one = (j) => h00 * (j < 0 ? v0 : v0[j]) + h10 * h * tan(i, j) + h01 * (j < 0 ? v1 : v1[j]) + h11 * h * tan(i + 1, j);
        return Array.isArray(v0) ? v0.map((_, j) => one(j)) : one(-1);
    }

    // Do nado peito ao CRAWL (Shift): começa no 1º quadro do `swim_breast` (deslizando, braços à frente) e termina no ÚLTIMO do `swim` (o
    // loop segue do 0 sem tranco: o corpo, as pernas e os braços chegam na pose E na velocidade do crawl). O corpo deita e começa a rolar;
    // o braço esquerdo dá a 1ª puxada (por baixo do peito, até o quadril); o direito sai da água à frente, recua um pouco (o cotovelo
    // alto) e volta a esticar para entrar no 1º quadro do crawl; as pernas passam da pernada de sapo à alternada. Ao contrário
    // (swim_out = esta lista invertida) também fica natural: o esquerdo volta por baixo d'água e os dois braços se juntam à frente.
    const hermS = (a, b, va, vb, u) => { const u2 = u * u, u3 = u2 * u; return (2 * u3 - 3 * u2 + 1) * a + (u3 - 2 * u2 + u) * va + (3 * u2 - 2 * u3) * b + (u3 - u2) * vb; };
    function swimIn(n = 8) {
        const out = [], B0 = breastAt(0), tE = swEnd('swim'), cyc = swDur('swim_in') / swDur('swim');    // cyc = fase do crawl por unidade de s
        for (let i = 0; i < n; i++) {
            const s = i / (n - 1), C = crawlAt(tE + (s - 1) * cyc);        // o crawl no tempo certo (acaba no último quadro do swim)
            const S = swMix(B0, C, sstep(s / 0.75));
            const fR = s < 0.5 ? 0.1 - 0.27 * sstep(s / 0.5) : hermS(-0.17, tE, 0, cyc * 0.5, (s - 0.5) / 0.5);     // fase do braço direito
            const fL = 0.1 + hermS(0, tE + 0.5 - 0.1, 0, cyc, s);                                                      // e do esquerdo (a puxada)
            const wa = sstep(s / 0.3);
            S.aR = lerpN(B0.aR, crawlArm(fR), wa); S.aL = lerpN(B0.aL, crawlArm(fL), wa);
            out.push(wetPose(S));
        }
        return out;
    }
    // DE PÉ NO RASO (chegou ao raso nadando crawl: swim_out → ESTE → wade_idle): do último quadro do swim_out (o 1º do `swim_breast`:
    // deslizando, braços juntos à frente) ao 1º do `wade_idle`. Os joelhos encolhem para baixo do corpo e as mãos apertam a água para
    // baixo (o tronco sobe), as pernas descem e os pés acham o fundo, o tronco chega à vertical e os braços varrem para baixo e para os
    // lados (equilíbrio) e sobem à pose do sculling na superfície; os joelhos amortecem um pouco e o corpo assenta.
    // Duas réguas: nadando, a linha d'água é a origem do desenho; vadeando, os pés — e a água quem desenha é o jogo
    // (SpriteActor.setWaterline: no limite do fundo, 1 m de corpo na água). Aqui a água desenhada (p.water) sobe de 0 a esse 1 m junto
    // com o corpo: a troca de régua acontece no clipe, sem salto. O fim é o 1º quadro do wade_idle no mapeamento adulto "molhado"
    // (Pose.adult: na água a pélvis não sobe com as pernas — dz) e com as pernas em FK nas rotações do adulto seco: o mesmo desenho.
    function swStateOf(p) {                                                // estado (como o do wetPose) de uma Pose montada do mesmo jeito
        const B = p.bones(), C = B.chest.R, Pr = p.pelvis_R, Cr = p.chest_R, Hr = p.head_R, d = (r) => r / deg(1);
        const arm = (sd, s) => {
            const a = p.arm[sd], q = V.mul(tmv3(C, V.sub(a[1], B['uarm_' + sd].t)), 1 / SW_REACH), o = tmv3(C, a[2]);
            return [s * q[0], q[1], q[2], s * o[0], o[1], o[2]];
        };
        return { hip: V.add(RIG.pelvis[1], p.pelvis_t), pitch: d(Math.atan2(Pr[5], Pr[4])), roll: d(Math.atan2(-Pr[6], Pr[0])), twist: d(Math.atan2(Cr[3], Cr[0])),
            bend: -d(Math.atan2(Cr[7], Cr[8])), hturn: d(Math.atan2(Hr[3], Hr[0])), htilt: d(Math.atan2(Hr[7], Hr[8])) - HEAD_TILT, aR: arm('R', 1), aL: arm('L', -1) };
    }
    // Leg rotations of the swim's FK numbers [flex, abd, knee, foot] (thigh, shin, foot — relative to the parent bone).
    function swLegR(l, sd) { const s = sd === 'R' ? 1 : -1; return [mm3(Ry(deg(l[1]) * s), Rx(deg(l[0]))), Rx(-deg(l[2])), Rx(deg(l[3]))]; }
    // The same three rotations read from the dry adult bones A (the wade_idle standing in the water).
    function wadeLegR(A, sd) {
        const tr = (R) => [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
        return [mm3(tr(A.pelvis.R), A['thigh_' + sd].R), mm3(tr(A['thigh_' + sd].R), A['shin_' + sd].R), mm3(tr(A['shin_' + sd].R), A['foot_' + sd].R)];
    }
    // Per side, per joint, quaternion keys [t, q] of keysOf(sd) = [[t, [thigh, shin, foot]], ...], kept on one hemisphere (no flip).
    function wadeLegKeys(A, keysOf) {
        const legK = {};
        for (const sd of ['R', 'L']) {
            const Ks = keysOf(sd);
            legK[sd] = [0, 1, 2].map((j) => {
                let prev = null;
                return Ks.map(([t, Rs]) => { let q = m2q(Rs[j]); if (prev && q[0] * prev[0] + q[1] * prev[1] + q[2] * prev[2] + q[3] * prev[3] < 0) q = q.map((v) => -v); prev = q; return [t, q]; });
            });
        }
        return legK;
    }
    function swimStand(n = 10) {
        const out = [], B0 = breastAt(0), UM = ((G.PPU || 26) * 1.04) / 0.5 / (CTX.scale || 1), WZ = 1.0 * UM;       // u por metro (NpcGenBuild: charScale, PPU)
        const E = wadeIdle(1)[0], Ew = clonePose(E), A = E.adult().B;
        Ew.water = 0.0;
        const dz = A.pelvis.t[2] - Ew.adult().B.pelvis.t[2], SE = Object.assign(swStateOf(E), { lR: B0.lR, lL: B0.lL });      // (as pernas vão à parte)
        SE.hip = V.add(SE.hip, [0, 0, dz - WZ]);                           // (régua da água: o quadril WZ abaixo de onde fica com os pés no fundo)
        const z0 = B0.hip[2], zE = SE.hip[2], zf = (f) => z0 + (zE - z0) * f;
        const st = (o, a) => { const P = o.pitch + o.bend, q = swUp(a, P); return swFlat(Object.assign({}, SE, o, { aR: q, aL: q })); };
        const K = [[0, swFlat(B0)],
            [0.32, st({ hip: [0, -7, zf(0.25) + 1.5], pitch: 24, roll: 0, twist: 0, bend: 14, hturn: 0, htilt: 22 }, [swLat(15), 0.60, -0.60, 1, -0.3, -0.6])],
            [0.62, st({ hip: [0, -2.5, zf(0.8)], pitch: 8, roll: 0, twist: 1, bend: 10, hturn: 0, htilt: 10 }, [swLat(30), 0.12, -0.78, 1, -0.5, -0.4])],
            [0.84, st({ hip: [0, -0.5, zE - 1.2], pitch: 1, roll: 0, twist: 2, bend: 7, hturn: 0, htilt: 6 }, [swLat(32), 0.16, -0.62, 1, -0.5, -0.4])],
            [1, swFlat(SE)]];
        // pernas: rotações (quatérnios) por chave — das do nado peito às do adulto seco do wade_idle (em relação à pélvis)
        const LK = [[0, B0.lR], [0.34, [62, 2, 88, -15]], [0.62, [28, -2, 40, -8]], [0.84, [12, -5, 20, -2]]];
        const legK = wadeLegKeys(A, (sd) => LK.map(([t, l]) => [t, swLegR(l, sd)]).concat([[1, wadeLegR(A, sd)]]));
        const off = (s) => WZ * sstep(s);                                 // a régua: a água sobe de 0 (nadando) a WZ (vadeando)
        for (let i = 0; i < n; i++) {
            const s = n > 1 ? i / (n - 1) : 1, S = swUnflat(keysN(K, s)), w = off(s);
            S.hip = V.add(S.hip, [0, 0, w]);
            const p = wetPose(S);
            p.water = w;
            for (const sd of ['R', 'L']) p.leg[sd] = ['fk', ...legK[sd].map((Kq) => q2m(keysN(Kq, s)))];
            if (s > 0.08 && s < 0.3) for (const sd of ['R', 'L']) { const f = swFx(swFist(p, sd)); p.effects.push({ type: 'splash', pos: [f[0], f[1], w], n: 6, spread: 2.4, seed: 140 + i + (sd === 'R' ? 1 : 0) }); }
            const u = (s - 0.3) / 0.7;                                     // marola saindo do corpo enquanto ele fica de pé (some no fim)
            if (u > 0 && u < 1) p.effects.push({ type: 'ring', pos: [0, 4.0, w], r: 13 + 12 * u, alpha: Math.trunc(200 * (1 - u) * min(1, u * 4)), gaps: 8, phase: u });
            out.push(p);
        }
        return out;
    }
    // MERGULHO NO NADO (vadeando no fundo → nado peito: a água passou do peito): the way back of the swim_stand, with a push-off. From
    // the 1st frame of the wade_idle the knees bend and the arms draw back, then the legs push off the bottom while the body lunges
    // forward and the arms shoot ahead over the water; the chest lands on the surface (splash) and the body settles, gliding, into the
    // 1st frame of the swim_breast. The drawn water ruler goes the other way: from the wade's 1 m of body in the water to the swim's 0.
    function wadeDive(n = 10) {
        const out = [], B0 = breastAt(0), UM = ((G.PPU || 26) * 1.04) / 0.5 / (CTX.scale || 1), WZ = 1.0 * UM;
        const E = wadeIdle(1)[0], Ew = clonePose(E), A = E.adult().B;
        Ew.water = 0.0;
        const dz = A.pelvis.t[2] - Ew.adult().B.pelvis.t[2], SE = Object.assign(swStateOf(E), { lR: B0.lR, lL: B0.lL });
        SE.hip = V.add(SE.hip, [0, 0, dz - WZ]);
        const z0 = B0.hip[2], zE = SE.hip[2], zf = (f) => zE + (z0 - zE) * f;
        const st = (o, a) => { const P = o.pitch + o.bend, q = swUp(a, P); return swFlat(Object.assign({}, SE, o, { aR: q, aL: q })); };
        const K = [[0, swFlat(SE)],
            [0.22, st({ hip: [0, 1.0, zE - 3.0], pitch: 12, roll: 0, twist: 0, bend: 10, hturn: 0, htilt: 6 }, [swLat(20), -0.12, -0.70, 1, -0.4, -0.5])],
            [0.46, st({ hip: [0, -4.5, zf(0.45) + 1.5], pitch: 46, roll: 0, twist: 0, bend: 16, hturn: 0, htilt: -4 }, [swLat(5), 0.92, 0.28, 1, -0.3, -0.2])],
            [0.72, st({ hip: [0, -9.0, z0 + 1.2], pitch: 38, roll: 0, twist: 0, bend: 6, hturn: 0, htilt: 12 }, [swLat(3), 0.88, -0.22, 1, -0.2, -0.6])],
            [1, swFlat(B0)]];
        const LK = [[0.22, [34, -3, 62, -6]], [0.46, [-10, 4, 6, -46]], [0.72, [2, 6, 10, -40]], [1, B0.lR]];
        const legK = wadeLegKeys(A, (sd) => [[0, wadeLegR(A, sd)]].concat(LK.map(([t, l]) => [t, swLegR(l, sd)])));
        const off = (s) => WZ * (1 - sstep(s));                           // the ruler: from WZ (wading) down to 0 (swimming)
        for (let i = 0; i < n; i++) {
            const s = n > 1 ? i / (n - 1) : 1, S = swUnflat(keysN(K, s)), w = off(s);
            S.hip = V.add(S.hip, [0, 0, w]);
            const p = wetPose(S);
            p.water = w;
            for (const sd of ['R', 'L']) p.leg[sd] = ['fk', ...legK[sd].map((Kq) => q2m(keysN(Kq, s)))];
            if (s > 0.42 && s < 0.66) for (const sd of ['R', 'L']) { const f = swFx(swFist(p, sd)); p.effects.push({ type: 'splash', pos: [f[0], f[1], w], n: 7, spread: 2.6, seed: 160 + i + (sd === 'R' ? 1 : 0) }); }
            if (s > 0.55 && s < 0.8) p.effects.push({ type: 'splash', pos: [0, 4.0, w], n: 10, spread: 3.2, seed: 180 + i });      // (the chest landing)
            const u = (s - 0.5) / 0.5;
            if (u > 0 && u < 1) p.effects.push({ type: 'ring', pos: [0, 4.0, w], r: 12 + 14 * u, alpha: Math.trunc(210 * (1 - u) * min(1, u * 4)), gaps: 8, phase: u });
            out.push(p);
        }
        return out;
    }

    // SALTO DA PONTE (de cabeça): standing on the parapet, crouches and springs out with the arms swinging up, the body rotates head
    // first, and it ends streamlined, upside down, hands together over the head pointing at the water. In the air the whole clip:
    // the game raises and drops the drawing along the jump's arc (game._tryVault: runSequence glide + arc) and puts the splash on the
    // water when it lands (WaterFx.plunge). No water drawn, the shadow shrinks as the body leaves the deck.
    function bridgeDive(n = 10) {
        const out = [], zS = RIG.pelvis[1][2], down = [swLat(14), 0.04, -0.86, 1, -0.3, -0.4];
        const S0 = { hip: [0, 0, zS], pitch: 0, roll: 0, twist: 0, bend: 0, hturn: 0, htilt: 0, aR: down, aL: down, lR: [0, 4, 0, 0], lL: [0, 4, 0, 0] };
        const st = (o, a) => { const P = o.pitch + o.bend, q = swUp(a, P); return swFlat(Object.assign({}, S0, o, { aR: q, aL: q })); };
        const K = [[0, swFlat(Object.assign({}, S0, { aR: swUp(down, 0), aL: swUp(down, 0) }))],
            [0.18, st({ hip: [0, 1.5, zS - 9], pitch: 26, bend: 14, htilt: -6, lR: [58, 4, 92, -12], lL: [58, 4, 92, -12] }, [swLat(17), -0.32, -0.74, 1, -0.4, -0.4])],
            [0.4, st({ hip: [0, -3, zS + 2], pitch: 42, bend: 4, htilt: 6, lR: [-12, 4, 4, -48], lL: [-12, 4, 4, -48] }, [swLat(6), 0.30, 0.90, 1, -0.2, 0.3])],
            [0.68, st({ hip: [0, -2, zS], pitch: 112, bend: 2, htilt: -10, lR: [-6, 2, 2, -60], lL: [-6, 2, 2, -60] }, [swLat(3), 0.10, 0.96, 1, -0.2, 0.3])],
            [1, st({ hip: [0, 0, zS], pitch: 165, bend: 0, htilt: -14, lR: [-2, 1, 0, -64], lL: [-2, 1, 0, -64] }, [swLat(2), 0.04, 0.98, 1, -0.2, 0.3])]];
        const sh = [[0, 1], [0.3, 0.8], [1, 0.4]];
        for (let i = 0; i < n; i++) {
            const s = n > 1 ? i / (n - 1) : 1, p = wetPose(swUnflat(keysN(K, s)));
            p.water = null;
            p.shadowScale = keys(sh, s);
            out.push(p);
        }
        return out;
    }

    // SUBIR NO BARCO PELA ÁGUA (jet ski, lancha, barco — só o jogador): do 1º quadro do `swim_idle` (boiando de pé ao lado do casco),
    // as mãos sobem e agarram a borda (o corpo ainda na água, olhando para cima), puxa — o tronco sai da água inclinando por cima da
    // borda, as mãos descem e empurram —, a perna direita sobe e apoia no convés, o corpo passa agachado e se levanta DE PÉ no convés
    // (um pouco acima da linha d'água). A régua é a do nado do começo ao fim (a linha d'água na origem do desenho: p.water = 0 — o que
    // fica abaixo dela some), então o corpo SAI da água no próprio clipe; o jogo só desliza o jogador da borda para dentro do barco.
    // O fim é o repouso de pé no mapeamento adulto "molhado" (Pose.adult: dz, como no swim_stand), erguido à altura do convés.
    function boardBoat(n = 14) {
        const out = [], T0 = treadAt(0), zS = RIG.pelvis[1][2], UM = ((G.PPU || 26) * 1.04) / 0.5 / (CTX.scale || 1), DZ = 0.2 * UM;
        const E = idle(1)[0], Ew = clonePose(E);
        Ew.water = 0.0;
        const dz = E.adult().B.pelvis.t[2] - Ew.adult().B.pelvis.t[2], zE = zS + dz + DZ;
        const st = (o, aR, aL = aR) => { const P = o.pitch + o.bend; return swFlat(Object.assign({ roll: 0, twist: 0, hturn: 0 }, o, { aR: swUp(aR, P), aL: swUp(aL, P) })); };
        const tread = [20, 18, 50, -30];
        const K = [[0, swFlat(T0)],
            // agarra a borda: as mãos sobem à frente, acima dos ombros; olha para cima
            [0.18, st({ hip: [0, 2, zS - 43], pitch: 8, bend: 6, htilt: 14, lR: tread, lL: [24, 18, 56, -30] }, [swLat(16), 0.55, 0.62, 1, -0.3, 0.2])],
            // puxa: o tronco sai da água inclinando para a frente, cotovelos dobrados (as mãos na borda, agora na altura do peito)
            [0.38, st({ hip: [0, 4, zS - 30], pitch: 30, bend: 20, htilt: 16, lR: [12, 10, 34, -40], lL: [8, 10, 26, -40] }, [swLat(18), 0.48, -0.08, 1, -0.4, -0.3])],
            // por cima da borda: empurra com as mãos junto ao quadril; a perna direita sobe e apoia no convés
            [0.56, st({ hip: [0, 7, zS - 15 + dz * 0.4], pitch: 52, bend: 20, htilt: 20, lR: [84, 12, 104, -10], lL: [6, 8, 18, -40] }, [swLat(20), 0.18, -0.74, 1, -0.4, -0.5])],
            // agachado no convés: a outra perna vem junto, uma mão no joelho
            [0.76, st({ hip: [0, 7, zE - 21], pitch: 28, bend: 12, htilt: 8, lR: [92, 6, 118, -6], lL: [74, 8, 112, -12] }, [swLat(15), 0.36, -0.55, 1, -0.4, -0.4], [swLat(17), 0.26, -0.62, 1, -0.4, -0.4])],
            // de pé no convés (o repouso, erguido à altura dele)
            [1, st({ hip: [0, 5, zE], pitch: 0, bend: 0, htilt: 0, lR: [0, 4, 0, 0], lL: [0, 4, 0, 0] }, [swLat(14), 0.04, -0.86, 1, -0.3, -0.4])]];
        for (let i = 0; i < n; i++) {
            const t = n > 1 ? i / (n - 1) : 1, p = wetPose(swUnflat(keysN(K, t)));
            p.water = 0.0;
            if (t > 0.2 && t < 0.62) for (const sd of ['R', 'L']) p.effects.push({ type: 'splash', pos: swFx(swFist(p, sd)), n: 5, spread: 2.2, seed: 160 + i + (sd === 'R' ? 1 : 0) });
            const u = t / 0.7;                                              // marola deixada pelo corpo saindo da água (some no fim)
            if (u < 1) p.effects.push({ type: 'ring', pos: [0, 4.0, 0], r: 15 + 14 * u, alpha: Math.trunc(210 * (1 - u)), gaps: 8, phase: u });
            out.push(p);
        }
        return out;
    }

    // MERGULHO: o corpo inteiro logo abaixo da superfície (onde o desenho ainda aparece — esmaecido e azulado), quase na horizontal, nadando
    // peito: puxada (braços abrem e descem), recolhe as mãos sob o peito, estica à frente e desliza; pernada de sapo enquanto estica.
    const DIVE_Y = 0.0, DIVE_Z = -14.0;                                    // quadril (o centro do corpo abaixo da linha d'água)
    function diveAt(t) {
        // (deslizando, as mãos vão se afastando devagar — o desenho não congela na parte parada do ciclo)
        const glide = [swLat(3), 0.12, 0.88, 1, -0.6, 0], glide0 = [swLat(4), 0.13, 0.88, 1, -0.6, 0];
        const AK = [[0, glide0], [0.25, [0.35, 0.30, 0.72, 1, -0.8, 0]], [0.45, [swLat(7), 0.55, 0.05, 1, -0.5, 0.3]], [0.56, [swLat(6), 0.45, 0.30, 1, -0.4, -0.3]],
            [0.67, [swLat(5), 0.30, 0.58, 1, -0.5, -0.1]], [0.78, glide], [1, glide0]];
        const LK = [[0, [0, 6, 6, -40]], [0.3, [3, 6, 16, -36]], [0.6, [44, 32, 108, 18]], [0.78, [0, 10, 6, -40]], [1, [0, 6, 6, -40]]];
        const a = keysN(AK, t, { loop: true }), l = keysN(LK, t, { loop: true });
        return { hip: [0, DIVE_Y, DIVE_Z + 0.8 * sin(TAU * t)], pitch: 88, roll: 0, twist: 0, bend: 4, hturn: 0, htilt: -18, aR: a, aL: a, lR: l, lL: l };
    }
    function dive(n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) { const p = wetPose(diveAt(i / n)); p.shadow = false; out.push(p); }
        return out;
    }
    // Afundar (do nado peito ao mergulho — o "canivete"): do 1º quadro do `swim_breast`, o corpo dobra na cintura e a cabeça e os braços
    // descem; o quadril fica na superfície e as pernas sobem esticadas para fora d'água (o peso delas empurra o corpo para baixo); as pernas
    // afundam (respingo) e o corpo nivela logo abaixo da superfície — acaba no último quadro do `dive` (o loop segue do 0).
    function diveIn(n = 9) {
        const out = [], B0 = breastAt(0), D0 = diveAt(swEnd('dive'));
        const st = (o) => swFlat(Object.assign({}, D0, o)), z0 = B0.hip[2];
        const K = [[0, swFlat(B0)], [0.2, st({ hip: [0, -5, z0 + 1.8], pitch: 64, bend: 48, htilt: -20, lR: [-2, 6, 8, -40], lL: [-2, 6, 8, -40] })],
            [0.42, st({ hip: [0, -2, z0 + 0.5], pitch: 118, bend: 28, htilt: -22, lR: [-8, 5, 4, -48], lL: [-8, 5, 4, -48] })],
            [0.62, st({ hip: [0, -1, -12], pitch: 132, bend: 16, htilt: -21, lR: [-6, 5, 5, -46], lL: [-6, 5, 5, -46] })],
            [0.82, st({ hip: [0, 0, -16], pitch: 108, bend: 7, htilt: -19, lR: [-2, 6, 6, -42], lL: [-2, 6, 6, -42] })], [1, swFlat(D0)]];
        const frames = [];
        for (let i = 0; i < n; i++) { const s = i / (n - 1), p = wetPose(swUnflat(keysN(K, s))); p.shadow = false; frames.push([s, p]); }
        // respingo: os pés voltando para a água (o quadro em que a sola passa da linha d'água para baixo, e o seguinte)
        const fz = (p) => { const B = p.adult().B; return min(B.foot_R.t[2], B.foot_L.t[2]); };
        let hit = -1;
        for (let i = 1; i < n; i++) if (fz(frames[i - 1][1]) > 0 && fz(frames[i][1]) <= 0) { hit = i; break; }
        for (let i = 0; i < n; i++) {
            const p = frames[i][1];
            if (hit >= 0 && (i === hit || i === hit + 1)) { const B = p.adult().B; p.effects.push({ type: 'splash', pos: swFx(V.mul(V.add(B.foot_R.t, B.foot_L.t), 0.5)), n: 10, spread: 3.2, seed: 70 + i }); }
            out.push(p);
        }
        return out;
    }
    // Voltar à tona (do mergulho ao nado peito): do 1º quadro do `dive`, o corpo sobe inclinado com uma pernada, os braços abrem para
    // boiar, a cabeça sai primeiro (respingo, a respirada) e o corpo assenta no 1º quadro do `swim_breast`.
    function diveOut(n = 8) {
        const out = [], D0 = diveAt(0), B0 = breastAt(0);
        const K = [[0, swFlat(D0)], [0.35, swFlat(Object.assign({}, D0, { hip: [0, -8, -12], pitch: 66, bend: 0, htilt: 8, aR: swUp([swLat(26), 0.55, -0.45, 1, -0.2, -0.6], 66), aL: swUp([swLat(26), 0.55, -0.45, 1, -0.2, -0.6], 66), lR: [30, 25, 70, -10], lL: [30, 25, 70, -10] }))],
            [0.65, swFlat(Object.assign({}, B0, { hip: [0, -9.5, B0.hip[2] - 1.5], pitch: 42, htilt: 30, aR: swUp([swLat(14), 0.70, -0.42, 1, -0.2, -0.6], 46), aL: swUp([swLat(14), 0.70, -0.42, 1, -0.2, -0.6], 46), lR: [10, 12, 20, -36], lL: [10, 12, 20, -36] }))],
            [1, swFlat(B0)]];
        const frames = [];
        for (let i = 0; i < n; i++) { const s = i / (n - 1), p = wetPose(swUnflat(keysN(K, s))); p.shadow = false; frames.push(p); }
        // respingo: a cabeça saindo da água (o quadro em que o alto da cabeça passa da linha d'água, e o seguinte)
        const hz = (p) => pt4(p.adult().B.head, [0, 0, 16])[2];
        let hit = -1;
        for (let i = 1; i < n; i++) if (hz(frames[i - 1]) <= 0 && hz(frames[i]) > 0) { hit = i; break; }
        frames.forEach((p, i) => {
            if (hit >= 0 && (i === hit || i === hit + 1)) { const h = p.adult().B.head.t; p.effects.push({ type: 'splash', pos: swFx(h), n: 12, spread: 3.4, seed: 90 + i }); }
            out.push(p);
        });
        return out;
    }

    // ------------------------------------------------------------------ cassetete (do pacote)
    function batonInHand(p, tilt = -0.25) {
        const B = p.bones(), Rh = B.hand_R.R, fist = p.fist_world(B, 'R');
        placeProp(p, 'baton', fist, mv3(Rh, nrm([0.0, 1.0, tilt])), mv3(Rh, [0, 0, 1.0]));
    }
    function batonIdle(n = 4) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, b = sin(TAU * t), p = base();
            p.pelvis_t = [0, 0, -0.5 + 0.3 * cos(TAU * t)];
            standLegs(p);
            p.chest_R = Rx(deg(-1 * b));
            p.arm_fk('L', { flex: 4 + 1.5 * b, abd: 12, elbow: 14 + 2 * b });
            p.arm_fk('R', { flex: 14 + 1.5 * b, abd: 13, elbow: 38 });
            batonInHand(p, -0.1);
            out.push(p);
        }
        return out;
    }
    function batonWalk(n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, c = cos(TAU * t), p = base();
            p.pelvis_t = [0, 0, -1.6 - 0.9 * cos(2 * TAU * t)];
            gait(p, t, { stride: 7.8, lift: 3.6, width: 9.6 });
            walkUpper(p, t, false);
            p.arm_fk('L', { flex: 24 * c + 3, abd: 11, elbow: 14 + 14 * max(0.0, c) });
            p.arm_fk('R', { flex: -12 * c + 12, abd: 13, elbow: 36 });
            batonInHand(p, -0.1);
            out.push(p);
        }
        return out;
    }

    // ------------------------------------------------------------------ pilotando: moto, bicicleta, jet ski, lancha (NOVO)
    // O veículo é 3D (CarArt3D: assets/cars/veiculos3d.js) e o piloto 2,5D vai por cima, com a ORIGEM no BANCO do modelo (RiderActor:
    // seat do VEH3D, já na escala do jogo). Mãos e pés vão direto no esqueleto ADULTO (Pose.abs) nas manoplas, pedaleiras, assoalho,
    // pedais e timão — medidas abaixo em METROS NO JOGO a partir do banco (x = direita, y = frente; o modelo × VEH_K) e alturas (z) em
    // unidades, tiradas da malha (moto = CG 160; scooter = PCX; bike = a bicicleta urbana). seat/sh = o banco a partir do centro do
    // modelo, no chão (frente, altura: a subida e a ré). occ = as carrocerias que RECORTAM o piloto (rideOcc): o que a moto esconde daquele
    // ângulo — a perna do outro lado atrás do tanque e do motor, a coxa por dentro do tanque — não é desenhado (no jogo a moto aparece ali).
    const RIDE = {
        // moto de rua: pés nas pedaleiras (o tornozelo um pouco atrás, o peito do pé no apoio) e os JOELHOS fechados no tanque (knee: o polo)
        moto: { seat: 0.234, sh: 0.936, grip: [0.31, 0.83], gz: 19.5, peg: [0.21, 0.17], pz: -17.7, knee: [0.14, 1.0, 0.25], lean: 26, hip: 6, yaw: 4,
            occ: ['moto', 'moto_trilha', 'moto_esportiva', 'moto_custom'] },
        // scooter: sentado reto, pés à frente no assoalho, joelhos juntos atrás do escudo
        scooter: { seat: 0.316, sh: 0.913, grip: [0.31, 0.80], gz: 18.9, peg: [0.16, 0.38], pz: -22.3, knee: [0.15, 1.0, 0.4], lean: 12, hip: 6, yaw: 4, occ: ['moto_scooter'] },
        bike: { seat: 0.234, sh: 0.725, grip: [0.32, 0.83], gz: 17, crank: 0.30, cz: -15, crankR: 0.16, lean: 32, hip: 7, occ: ['bicicleta'] },      // (lean: as mãos alcançam o guidão)
        jetski: { grip: [0.48, 0.70], gz: 18, peg: [0.33, 0.12], pz: -10, lean: 20, hip: 6, yaw: 10 },
        boat: { wheel: 0.53, wz: 22, wheelR: 0.11, peg: [0.15, 0.3], pz: -9, lean: 4, hip: 8 },
    };
    // Unidades do gerador por metro no jogo (não depende da resolução). A ficha desenhada maior/menor (spec.scale: G.CTX.scale, posto
    // pelo rendererFor) aumenta o desenho todo — o alvo em metros desconta, para as mãos e os pés continuarem no veículo.
    const U = () => (G.PPU || 26) / 0.5 / ((G.CTX && G.CTX.scale) || 1);
    const VEH_K = 1.17;                                                   // m do modelo 3D → m no jogo: Config.vehicle.scale (1,3) × Bikes.SCALE (0,9)
    // Recorte (NpcGenRender: pose.occ) pelas carrocerias `ids` (vários = a interseção): a origem do desenho no BANCO de cada modelo (at =
    // 'center': o centro do modelo, no chão — a subida; 'under': o chão debaixo do banco — a ré), deitado Rb em volta dela. sweep (graus):
    // o clipe tem poucas direções (16: o desenho fica até meio passo fora do rumo da moto) — vale a interseção da moto girada de −sweep a
    // +sweep em volta da origem: só some o que ela esconde em qualquer desses rumos (nunca um buraco no piloto).
    function rideOcc(ids, at = 'seat', Rb = null, sweep = 0) {
        const s = VEH_K * U(), out = [];
        for (const id of (ids || []).filter((i) => G.vehOcc && G.vehOcc(i))) {
            const S = G.vehOcc(id).seat, t0 = at === 'center' ? [0, 0, 0] : at === 'under' ? [0, -S[0] * s, 0] : [0, -S[0] * s, -S[1] * s];
            for (const a of sweep ? [-1, -0.5, 0, 0.5, 1] : [0]) {
                const M = mm3(Rz(deg(a * sweep)), Rb || I3());
                out.push({ id, s, M, t: mv3(M, t0) });
            }
        }
        return out;
    }
    // Alvo de braço ABS (já no adulto) puxado para dentro do alcance do braço adulto, a partir do ombro desta pose (não trava reto além).
    function absReach(p, sd, T, k = 0.995) {
        const A = G.ADULT || { arm: 1, hand: 1 }, r = k * (A.arm * (UPPER + LOWER) - FIST[2] * (A.hand || 1));
        const J = p.adult().B['uarm_' + sd].t, d = V.sub(T, J), L = V.len(d);
        return L > r ? V.add(J, V.mul(d, r / L)) : T;
    }
    function rideBase(R, { hipDz = 0, leanX = 0, roll = 0, yaw = 0 } = {}) {
        const p = base();
        p.shadow = false;                                                  // (a sombra é a do veículo)
        p.absPelvis = true;
        p.abs = { armR: true, armL: true, legR: true, legL: true };
        p.pelvis_t = [-roll * 0.08, -2.0, R.hip + hipDz + 3.0 - SKEL.pelvis[1][2]];
        p.pelvis_R = mm3(Ry(deg(roll * 0.7)), Rx(deg(-6)));
        p.chest_R = mm3(mm3(Ry(deg(roll * 0.4)), Rz(deg(yaw))), Rx(deg(-(R.lean + leanX))));
        p.head_R = mm3(mm3(Ry(deg(-roll * 0.7)), Rz(deg(-yaw))), Rx(deg(HEAD_TILT + (R.lean + leanX) * 0.75)));
        return p;
    }
    // Moto e jet ski: n degraus de inclinação (n = 5: +12°, +6°, 0, −6°, −12°; o 1º inclinado para a direita, o do meio reto, o
    // último para a esquerda) — não é tempo: o jogo escolhe o quadro pela inclinação (SpriteActor.setLean; fps 0). Tudo varia LINEAR com
    // a inclinação (o guidão vira: a manopla de dentro vem para trás e a de fora vai à frente; o peito acompanha o guidão; o pé de dentro
    // sobe um pouco): o degradê entre dois degraus vizinhos não dá tranco.
    function rideLean(kind, n = 5) {
        const R = RIDE[kind], u = U();
        return [...Array(n).keys()].map((i) => 12 - (24 * i) / (n - 1)).map((roll) => {
            const st = roll / 12, p = rideBase(R, { roll, yaw: -R.yaw * st });
            for (const [sd, s] of [['R', 1], ['L', -1]]) {
                p.arm_ik(sd, absReach(p, sd, [s * R.grip[0] * u, R.grip[1] * u - s * st * 2.5, R.gz - s * st * 1.2]), [s * 1.0, -0.2, -0.7]);
                p.leg_ik(sd, [s * R.peg[0] * u, R.peg[1] * u, R.pz + 1.5 * max(0, s * st)], [s * 0.45, 1.0, 0.35], footRot(-s * 14, -12));
            }
            return p;
        });
    }
    // MOTO: n degraus de inclinação (n = 7: +BANK … 0 … −BANK; o 1º deitado para a direita, o do meio reto, o último para a esquerda;
    // fps 0 — o jogo escolhe pela inclinação: SpriteActor.setLean). O piloto deita JUNTO com a moto 3D: a pose reta INTEIRA (pélvis,
    // tronco, alvos das mãos nas manoplas e dos pés nas pedaleiras) gira em volta do eixo da frente que passa no BANCO (a origem do
    // desenho). O jogo põe essa origem no banco da moto já deitada (RiderActor._place) e a moto deita o mesmo ângulo em volta da linha
    // das rodas (CarArt3D: bank = inclinação × RIDE_BANK): corpo e moto viram uma peça só. A cabeça compensa um pouco (olha a estrada)
    // e o guidão vira para dentro da curva, como em rideLean.
    // Pernas: o tornozelo em RIDE.peg/pz (o pé apoiado na pedaleira ou no assoalho) e o joelho para a frente e só um pouco para fora
    // (RIDE.knee): fechado no tanque — a parte da coxa que entra nele some no recorte, como a de quem aperta a moto com os joelhos.
    // E o recorte (rideOcc) gira junto: a moto do desenho deita com o piloto.
    const RIDE_BANK = 0.5;                                                // rad no degrau extremo = CarArt3D (bank = lean × 0,5)
    function rideBank(kind, n = 7) {
        const R = RIDE[kind], u = U(), out = [], P0 = RIG.pelvis[1];
        const rot = (Rb, q) => mv3(Rb, q);
        for (let i = 0; i < n; i++) {
            const st = n > 1 ? 1 - (2 * i) / (n - 1) : 0, Rb = Ry(RIDE_BANK * st), p = rideBase(R, { yaw: -R.yaw * st });
            p.pelvis_t = V.sub(rot(Rb, V.add(P0, p.pelvis_t)), P0);
            p.pelvis_R = mm3(Rb, p.pelvis_R);
            p.head_R = mm3(Ry(-RIDE_BANK * st * 0.35), p.head_R);
            for (const [sd, s] of [['R', 1], ['L', -1]]) {
                const grip = rot(Rb, [s * R.grip[0] * u, R.grip[1] * u - s * st * 2.5, R.gz - s * st * 1.2]);
                p.arm_ik(sd, absReach(p, sd, grip), rot(Rb, [s * 1.0, -0.2, -0.7]));
                p.leg_ik(sd, rot(Rb, [s * R.peg[0] * u, R.peg[1] * u, R.pz]), rot(Rb, nrm([s * R.knee[0], R.knee[1], R.knee[2]])), mm3(Rb, footRot(-s * 8, -12)));
            }
            p.occ = rideOcc(R.occ, 'seat', Rb, 3.8);                  // (64 direções: até 0,68 passo fora do rumo — a histerese do SpriteActor)
            out.push(p);
        }
        return out;
    }
    // Bicicleta: pedalando (n quadros: uma volta do pedivela; o tronco balança com a pedalada).
    function rideBike(n = 12) {
        const R = RIDE.bike, u = U(), out = [];
        for (let i = 0; i < n; i++) {
            const a = (TAU * i) / n, p = rideBase(R, { hipDz: 0.6 * sin(2 * a) });
            p.chest_R = mm3(Rz(deg(4 * sin(a))), p.chest_R);
            for (const [sd, s, ph] of [['R', 1, a], ['L', -1, a + PI]]) {
                p.arm_ik(sd, absReach(p, sd, [s * R.grip[0] * u, R.grip[1] * u, R.gz]), [s * 1.0, -0.3, -0.7]);
                const ped = [s * 7.5, R.crank * u + sin(ph) * R.crankR * u, R.cz - cos(ph) * R.crankR * u];
                p.leg_ik(sd, ped, [s * 0.2, 1.0, 0.25], footRot(-s * 6, -8 + 14 * sin(ph)));
            }
            p.occ = rideOcc(R.occ, 'seat', null, 7.6);                  // (32 direções)
            out.push(p);
        }
        return out;
    }
    // Lancha: sentado no banco do timão, mãos no timão, balançando com o mar: sobe/desce (cos) e rola (sin) defasados — uma volta
    // contínua (sem quadros repetidos do seno puro) — e o timão gira um pouco atrasado.
    function rideBoat(n = 6) {
        const R = RIDE.boat, u = U(), out = [];
        for (let i = 0; i < n; i++) {
            const a = (TAU * i) / n, p = rideBase(R, { hipDz: 0.5 * cos(a), roll: 3 * sin(a) });
            const w = 0.35 * sin(a - 0.6), c = [0, R.wheel * u, R.wz], r = R.wheelR * u;      // timão girando um pouco
            for (const [sd, s] of [['R', 1], ['L', -1]]) {
                const ang = s * 1.15 + w;
                p.arm_ik(sd, [c[0] + sin(ang) * r, c[1] - 1.0, c[2] + cos(ang) * r * 0.6], [s * 1.0, -0.5, -0.6]);
                p.leg_ik(sd, [s * R.peg[0] * u, R.peg[1] * u, R.pz], [s * 0.3, 1.0, 0.3], footRot(-s * 10, -6));
            }
            out.push(p);
        }
        return out;
    }

    // Dando RÉ na moto/bicicleta (RiderActor.walkBack): de pé, montado (um pé de cada lado do veículo), andando — o jogo toca o clipe
    // AO CONTRÁRIO: anda para trás — com as DUAS MÃOS NO GUIDÃO. O sprite fica debaixo do banco, no chão: o guidão está RIDE.<tipo>.grip
    // à frente e a gz acima do banco, e o banco a RIDE.<tipo>.sh m do chão. Para alcançar, a pélvis vai BACK.fwd m à frente (os pés
    // juntos) e o tronco inclina; os braços (alvo ABS) quase não mexem com o passo. Recorte: a moto em pé com o banco em cima da origem.
    const BACK = { moto: { fwd: 0.24, lean: 26 }, bike: { fwd: 0.2, lean: 28 } };
    function rideBack(kind = 'moto', n = 8) {
        const K = kind === 'bike' ? 'bike' : 'moto', R = RIDE[K], B = BACK[K], u = U(), kl = G.ADULT ? G.ADULT.leg : 1, d = (B.fwd * u) / kl, out = [];
        const legs = Object.assign({}, WALK, { stride: 6.2, lift: 1.2, width: 11.0, fwd: d });           // (passo curto, pernas abertas: o veículo no meio)
        for (let i = 0; i < n; i++) {
            const t = i / n, c = cos(TAU * t), p = base();
            walkLegs(p, t, legs);
            p.pelvis_t = V.add(p.pelvis_t, [0, d, -1.2]);
            p.pelvis_R = mm3(Rz(deg(4 * c)), Rx(deg(-10)));
            p.chest_R = mm3(Rz(deg(-3 * c)), Rx(deg(-B.lean)));
            p.head_R = mm3(Rz(deg(2 * c)), Rx(deg(HEAD_TILT + B.lean * 0.75)));
            p.abs = Object.assign(p.abs || {}, { armR: true, armL: true });
            for (const [sd, s] of [['R', 1], ['L', -1]]) p.arm_ik(sd, absReach(p, sd, [s * R.grip[0] * u, R.grip[1] * u, R.sh * u + R.gz]), [s * 1.0, -0.3, -0.7]);
            p.occ = rideOcc(R.occ, 'under', null, 11.25);                // (16 direções)
            out.push(p);
        }
        return out;
    }

    // Subir na moto/bicicleta (o jogador): do REPOUSO de pé ao lado (idle quadro 0, no adulto), dobra o tronco e pega as manoplas (a de
    // perto primeiro; a de longe por cima do tanque), passa a perna do lado do veículo por cima do banco, por trás, enquanto o quadril
    // sobe para o banco, e recolhe a outra perna para a pedaleira/pedal. w = 'moto' | 'motoL' | 'bike' | 'bikeL' (L = chegou pela
    // esquerda). Origem no CENTRO do veículo, no chão (o jogador fica no lugar dele): o banco está RIDE.<tipo>.seat m atrás e sh m acima
    // — o último quadro é EXATAMENTE a pose de pilotar (ride_moto reto / ride_bike quadro 0) no banco da moto 3D, e o recorte (a moto em
    // pé, rideOcc 'center') esconde o que fica atrás dela durante a subida. Mãos sempre dentro do alcance adulto.
    function mountAnim(w = 'moto', n = 9) {
        const kind = String(w).startsWith('bike') ? 'bike' : 'moto', R = RIDE[kind], u = U(), sd = String(w).endsWith('L') ? -1 : 1;
        const sy = -R.seat * u, sz = R.sh * u, ss = -sd;                    // ss: lado da perna que passa por cima (a do lado do veículo)
        const swing = ss > 0 ? 'R' : 'L', stand = ss > 0 ? 'L' : 'R', near = sd > 0 ? 'R' : 'L', far = near === 'R' ? 'L' : 'R';
        const E = kind === 'bike' ? rideBike(12)[0] : rideBank('moto', 7)[3], sh = (q) => V.add(q, [0, sy, sz]);
        const A = G.ADULT || { arm: 1, hand: 1 }, rest = idle(1)[0], RB = rest.adult().B, o0 = [sd * 30, sy + 3, 0];
        const hip0 = V.add(V.add(RB.pelvis.t, mv3(RB.pelvis.R, [0, 0, -3.0])), o0), hipE = sh(V.add(V.add(RIG.pelvis[1], E.pelvis_t), mv3(E.pelvis_R, [0, 0, -3.0])));
        const ank0 = (q) => V.add(RB['foot_' + q].t, o0), hand0 = (q) => V.add(pt4(RB['farm_' + q], [0, 0, -(LOWER * A.arm - FIST[2] * (A.hand || 1))]), o0);
        const pole0 = (q) => nrm(V.sub(RB['farm_' + q].t, RB['uarm_' + q].t)), lean0 = R.lean, hz = max(hip0[2], hipE[2]);
        const hipK = [[0, hip0], [0.3, [sd * 27, sy + 1, hip0[2] - 4]], [0.55, [sd * 15, sy - 1, hz + 1]], [0.8, [sd * 4, sy - 1, hz + 3]], [1, hipE]];
        const leanK = [[0, 0], [0.3, 26], [0.55, 24], [0.8, lean0 - 4], [1, lean0]];
        const gE = (q) => sh(E.arm[q][1]), aE = (q) => sh(E.leg[q][1]);
        const handK = { [near]: [[0, hand0(near)], [0.3, gE(near)], [1, gE(near)]], [far]: [[0, hand0(far)], [0.3, V.lerp(hand0(far), gE(far), 0.6)], [0.55, gE(far)], [1, gE(far)]] };
        const legK = { [swing]: [[0, ank0(swing)], [0.12, ank0(swing)], [0.4, [sd * 18, sy - 16, sz * 0.55]], [0.62, [0, sy - 22, sz + 8]], [0.82, [ss * 15, sy - 4, sz * 0.75]], [1, aE(swing)]],
            [stand]: [[0, ank0(stand)], [0.6, ank0(stand)], [0.82, V.add(V.lerp(ank0(stand), aE(stand), 0.6), [0, 0, 6])], [1, aE(stand)]] };
        const legW = { [swing]: [0.12, 0.8], [stand]: [0.6, 1] };                // trecho em que o pé sai do chão (polo e giro do pé)
        const out = [];
        for (let i = 0; i < n; i++) {
            const s = i / (n - 1);
            if (i === n - 1) {                                              // = a pose de pilotar, no banco
                const p = clonePose(E);
                p.pelvis_t = sh(E.pelvis_t);
                p.occ = rideOcc(R.occ, 'center', null, 11.25);
                for (const q of ['R', 'L']) { p.arm[q][1] = gE(q); p.leg[q][1] = aE(q); }
                out.push(p);
                continue;
            }
            const p = base(), hip = keys(hipK, s), lean = keys(leanK, s);
            p.shadow = s < 0.75;
            p.occ = rideOcc(R.occ, 'center', null, 11.25);              // (16 direções: o jogador encara o rumo exato da moto — Player.startMount)
            p.absPelvis = true;
            p.abs = { armR: true, armL: true, legR: true, legL: true };
            p.pelvis_R = mm3(Rz(deg(-sd * 22 * sin(PI * s) * (1 - s))), Rx(deg(-6 * ease(s))));
            p.pelvis_t = V.sub(V.sub(hip, mv3(p.pelvis_R, [0, 0, -3.0])), RIG.pelvis[1]);
            p.chest_R = Rx(deg(-lean));
            p.head_R = Rx(deg(HEAD_TILT + lean * 0.75));
            for (const q of ['R', 'L']) {
                const [a, b] = legW[q], k = clip((s - a) / (b - a), 0, 1), qs = q === 'R' ? 1 : -1;
                p.leg_ik(q, keys(legK[q], s), nrm(V.lerp([0.12 * qs, 1.0, 0.0], E.leg[q][2], ease(k))), hermR(null, footRot(-10 * qs, 0), E.leg[q][3] || I3(), null, k));
            }
            for (const q of ['R', 'L']) p.arm_ik(q, absReach(p, q, keys(handK[q], s)), nrm(V.lerp(pole0(q), E.arm[q][2], ease(s / 0.3))));
            out.push(p);
        }
        return out;
    }

    // ------------------------------------------------------------------ catálogo
    // Nome no gerador original (para a prévia e a validação) → função, fps, loop.
    const ANIMS = {
        idle: [idle, 6, true], walk: [walk, 10, true], run: [run, 14, true], walk_up: [walkUp, 10, true], climb: [climb, 10, true], punch: [punch, 14, false], kick: [kick, 12, false],
        pistol_idle: [() => gunIdle('pistol'), 6, true], pistol_walk: [() => gunWalk('pistol'), 10, true], pistol_shoot: [pistolShoot, 15, false],
        smg_idle: [() => gunIdle('smg'), 6, true], smg_walk: [() => gunWalk('smg'), 10, true], smg_shoot: [() => smgShoot('smg'), 18, true],
        shotgun_idle: [() => gunIdle('shotgun'), 6, true], shotgun_walk: [() => gunWalk('shotgun'), 10, true], shotgun_shoot: [shotgunShoot, 12, false],
        bat_idle: [batIdle, 6, true], bat_walk: [batWalk, 10, true], bat_swing: [batSwing, 14, false], throw: [throwAnim, 12, false],
        hurt: [hurt, 12, false], death: [() => death(false), 12, false], get_up: [getUp, 10, false], surrender: [() => handsUp(5), 8, false],
        swim: [swim, 10, true], swim_idle: [swimIdle, 6, true],
        rifle_idle: [() => gunIdle(CTX.rifle), 6, true], rifle_walk: [() => gunWalk(CTX.rifle), 10, true], rifle_shoot: [() => rifleShoot(CTX.rifle), 16, true],
        baton_idle: [batonIdle, 6, true], baton_walk: [batonWalk, 10, true],
    };

    // Clipes do JOGO. weapon: arma (já traduzida para o objeto desenhado: 'smg' de um BOPE vira 'rifle' — ver NpcGenTypes.weaponFor).
    // n = quadros do clipe; k = os quadros de antes (o plano de 16 direções e mais quadros): fps/fpsFor são o ritmo de REFERÊNCIA com k
    // quadros (a duração do clipe = k/fps, que os pés plantados e o jogo usam) e o atlas sai com n quadros a fps·n/k (clipPoses).
    // n e k: número ou { arma desenhada: nº, '*': o resto }. fn(w, o, n): os quadros (os de ciclo/progresso são recalculados com n; as
    // sequências escritas à mão passam pelo resample). dirs: 16 em todos (o padrão de clipPoses). loopFor/fpsFor: pela arma do JOGO.
    const SHOOT = { pistol: pistolShoot, revolver: revolverShoot, shotgun: shotgunShoot, smg: () => smgShoot('smg'), pistol_sil: silShoot, rpg: rpgShoot, launcher: launcherShoot, minigun: minigunShoot };
    const shootFn = (w, n) => (w === 'minigun' ? minigunShoot(n) : resample(SHOOT[w] ? SHOOT[w]() : rifleShoot(w), n));
    const seq = (f) => (w, o, n) => resample(f(w, o), n);                // sequência escrita à mão → n quadros (o mesmo tempo)
    // ------------------------------------------------------------------ CLIENTES E ATENDENTES DAS LOJAS (world/ShopLife.js)
    // Sentado numa cadeira ou banqueta: o quadril no assento (SEAT.hip m), os pés no chão à frente, joelhos dobrados; tudo direto no
    // esqueleto ADULTO (abs, como o sitIn). A origem do personagem é o CENTRO DO ASSENTO; a mesa fica à frente (+y). Os braços também vão
    // em coordenadas adultas (m → unidades), então as mãos acertam o tampo (SEAT.table) e a boca de qualquer tipo de corpo.
    const SEAT = { hip: 0.47, footY: 0.46, footX: 0.12, table: 0.76, reach: 0.33, handX: 0.17 };
    function seatedBody(p, { sway = 0, lean = 0, yaw = 0, headYaw = 0, headPitch = 0, shade = 1 } = {}) {
        const u = U();
        p.absPelvis = true;
        p.abs = { legR: true, legL: true, armR: true, armL: true };
        p.pelvis_R = mm3(Rz(deg(yaw * 0.3)), Rx(deg(5)));                                // encostado: a pélvis um pouco para trás
        const hip = [sway * u, -0.02 * u, SEAT.hip * u];
        p.pelvis_t = V.sub(V.sub(hip, mv3(p.pelvis_R, [0, 0, -3.0])), RIG.pelvis[1]);
        p.chest_R = mm3(Rz(deg(yaw * 0.7)), Rx(deg(-lean - 5)));                        // (desfaz a pélvis para trás: tronco ereto + lean à frente)
        p.head_R = mm3(Rz(deg(headYaw)), Rx(deg(HEAD_TILT + headPitch + lean * 0.25)));
        for (const [sd, s] of [['R', 1], ['L', -1]]) p.leg_ik(sd, [s * SEAT.footX * u, SEAT.footY * u, ANKLE_H], [0.15 * s, 1.0, 0.5], footRot(-6 * s, 0));
        p.shadowScale = 0.85 * shade;
    }
    // Alvos das mãos no adulto (unidades): no tampo à frente, no colo, na boca.
    const atTable = (sd, dx = 0, dy = 0) => { const u = U(), s = sd === 'R' ? 1 : -1; return [(s * SEAT.handX + dx) * u, (SEAT.reach + dy) * u, SEAT.table * u]; };
    const onLap = (sd) => { const u = U(), s = sd === 'R' ? 1 : -1; return [s * 0.13 * u, 0.24 * u, (SEAT.hip + 0.13) * u]; };
    function mouthOf(p) { const B = p.adult().B; return pt4(B.head, [0, 0.085 * U(), 0.035 * U()]); }
    const SEAT_POLE = { R: [0.7, -0.1, -0.7], L: [-0.7, -0.1, -0.7] };
    function handTo(p, sd, T) { p.arm_ik(sd, absReach(p, sd, T), SEAT_POLE[sd]); }
    // objeto na mão (cálculo no pacote: o adult() leva junto com a mão). cup: de pé, inclinado `tilt` graus para trás (bebendo)
    function holdCup(p, sd, tilt = 0) {
        const B = p.bones(), f = p.fist_world(B, sd);
        p.props.push(['cup', M4(Rx(deg(-tilt)), V.add(f, [0, 0.4, 0.6]))]);
    }
    function holdFork(p, sd) {
        const B = p.bones(), hR = B['hand_' + sd].R;
        p.props.push(['fork', M4(hR, V.add(p.fist_world(B, sd), mv3(hR, [0, 1.2, -0.4])))]);
    }
    // Sentado à toa (esperando o pedido, conversando): respira, o tronco balança de leve e a cabeça olha em volta; as mãos no colo ou
    // (atTable) apoiadas na mesa.
    function sitIdle(n = 12, atTbl = false) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, b = sin(TAU * t), p = base();
            seatedBody(p, { sway: 0.004 * b, lean: atTbl ? 6 : 1.5 + 1.5 * b, headYaw: 16 * sin(TAU * t + 0.6), headPitch: -2 * cos(TAU * t) });
            for (const sd of ['R', 'L']) handTo(p, sd, atTbl ? atTable(sd, (sd === 'R' ? -1 : 1) * 0.03, -0.03) : onLap(sd));
            out.push(p);
        }
        return out;
    }
    // Comendo: o antebraço esquerdo apoiado no tampo; a direita leva o garfo do prato à boca (sobe rápido, mastiga parado, desce devagar)
    // e o tronco se inclina para o prato; a cabeça vai ao encontro do garfo.
    function sitEat(n = 14) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, up = t < 0.3 ? ease(t / 0.3) : t < 0.55 ? 1 : 1 - ease((t - 0.55) / 0.45), chew = t > 0.3 && t < 0.6 ? sin((t - 0.3) / 0.3 * TAU * 2) : 0, p = base();
            seatedBody(p, { lean: 12 - 4 * up, headPitch: -10 + 6 * up + 1.5 * chew });
            handTo(p, 'L', atTable('L', 0.02, -0.04));
            const plate = atTable('R', -0.08, 0.02), mouth = mouthOf(p);
            handTo(p, 'R', V.lerp(plate, V.add(mouth, [0.02 * U(), 0.05 * U(), -0.02 * U()]), up));
            holdFork(p, 'R');
            out.push(p);
        }
        return out;
    }
    // Bebendo sentado (café, refrigerante, cerveja): o copo vai à boca e inclina; entre um gole e outro fica na mesa, na mão.
    function sitDrink(n = 14) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, up = t < 0.25 ? ease(t / 0.25) : t < 0.5 ? 1 : 1 - ease((t - 0.5) / 0.3), p = base();
            seatedBody(p, { lean: 5 - 6 * up, headPitch: -4 - 10 * up, headYaw: 8 * sin(TAU * t) * (1 - up) });
            handTo(p, 'L', atTable('L', 0.03, -0.06));
            const rest = atTable('R', -0.02, -0.02), mouth = mouthOf(p);
            handTo(p, 'R', V.lerp(rest, V.add(mouth, [0.01 * U(), 0.07 * U(), -0.06 * U()]), up));
            holdCup(p, 'R', 55 * up);
            out.push(p);
        }
        return out;
    }
    // De pé (comprar, olhar, pagar, mexer no celular, beber no balcão, trabalhar): pernas paradas e respirando (o idle), o resto por
    // alvos no peito (pacote; como o standAct).
    function standBase(t, { lean = 0, yaw = 0, hy = 0, hp = 0 } = {}) {
        const b = sin(TAU * t), p = base();
        p.pelvis_t = [0.25 * b, 0, -0.2 + 0.15 * cos(TAU * t)];
        p.pelvis_R = mm3(Rz(deg(yaw * 0.35)), Rx(deg(-lean * 0.35)));
        p.chest_R = mm3(Rz(deg(yaw * 0.65)), Rx(deg(-lean * 0.65 - 1.0 * b)));
        p.head_R = mm3(Rz(deg(hy - yaw * 0.6)), Rx(deg(HEAD_TILT + hp + lean * 0.4)));
        standLegs(p, 10.5, [0.4, 0.4], 10);
        return p;
    }
    const restArm = (p, sd, b = 0) => p.arm_fk(sd, { flex: 4 + 1.5 * b, abd: 12, elbow: 14 + 2 * b });
    const chestAt = (p, off) => V.add(chestOrg(p), mv3(p.bones().chest.R, off));
    // Olhando a prateleira: a cabeça percorre a prateleira; a direita estica para pegar um produto (alto, à frente), traz para perto do
    // peito e examina (cabeça baixa), depois devolve. A esquerda fica solta.
    function browse(n = 16) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, reach = t < 0.25 ? ease(t / 0.25) : t < 0.35 ? 1 : t < 0.55 ? 1 - ease((t - 0.35) / 0.2) : t < 0.8 ? 0 : t < 0.9 ? ease((t - 0.8) / 0.1) : 1 - ease((t - 0.9) / 0.1);
            const look = t > 0.4 && t < 0.8 ? ease(Math.min(1, (t - 0.4) / 0.1)) * (1 - ease(Math.max(0, (t - 0.7) / 0.1))) : 0;
            const p = standBase(t, { lean: 4 + 6 * reach, hy: 24 * sin(TAU * t * 0.5) * (1 - look), hp: 10 * reach - 18 * look });
            restArm(p, 'L', sin(TAU * t));
            const shelf = [3.0, 23.0, 14.0], held = [2.0, 11.0, -2.0];
            const T = reach > 0.01 ? V.lerp(held, shelf, reach) : held;
            p.arm_ik('R', inReach(p, 'R', chestAt(p, T), 0.96), [1.0, -0.4, -0.7]);
            out.push(p);
        }
        return out;
    }
    // Pagando no caixa: tira a carteira (direita) e estende o cartão/dinheiro sobre o balcão, espera, recolhe.
    function payAnim(n = 12) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, f = t < 0.3 ? ease(t / 0.3) : t < 0.65 ? 1 : 1 - ease((t - 0.65) / 0.35), p = standBase(t, { lean: 5 * f, hp: -6 - 4 * f });
            p.arm_ik('L', inReach(p, 'L', chestAt(p, [-3.0, 8.0, -8.0]), 0.95), [-1.0, -0.3, -0.8]);
            p.arm_ik('R', inReach(p, 'R', chestAt(p, V.lerp([3.5, 9.0, -6.0], [2.0, 21.0, -7.0], f)), 0.96), [1.0, -0.3, -0.8]);
            const B = p.bones(), hR = B.hand_R.R;
            p.props.push(['wallet', M4(hR, V.add(p.fist_world(B, 'R'), mv3(hR, [0, 2.6, -0.6])))]);
            out.push(p);
        }
        return out;
    }
    // Celular: as duas mãos com o aparelho na frente do peito, cabeça baixa, o polegar mexendo; o peso troca de pé devagar.
    function phoneAnim(n = 10) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, b = sin(TAU * t), p = standBase(t, { hp: -20 + 2 * b, hy: 4 * b });
            const dev = [0.5, 10.5, -1.5 + 0.4 * b];
            p.arm_ik('R', inReach(p, 'R', chestAt(p, V.add(dev, [1.6, 0, 0.3 * sin(TAU * t * 3)])), 0.95), [1.0, -0.3, -0.8]);
            p.arm_ik('L', inReach(p, 'L', chestAt(p, V.add(dev, [-1.6, 0, 0])), 0.95), [-1.0, -0.3, -0.8]);
            const B = p.bones(), c = V.mul(V.add(p.fist_world(B, 'R'), p.fist_world(B, 'L')), 0.5);
            p.props.push(['phone', M4(mm3(Rx(deg(-55)), I3()), V.add(c, [0, 1.0, 1.4]))]);
            out.push(p);
        }
        return out;
    }
    // Bebendo de pé (no balcão do bar): o copo na direita, à altura do peito; gole com a cabeça para trás; a esquerda no balcão.
    function drinkStand(n = 14) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, up = t < 0.25 ? ease(t / 0.25) : t < 0.5 ? 1 : 1 - ease((t - 0.5) / 0.3), p = standBase(t, { hp: -4 - 12 * up, hy: 10 * sin(TAU * t) * (1 - up) });
            p.arm_ik('L', inReach(p, 'L', chestAt(p, [-4.0, 13.0, -7.0]), 0.95), [-1.0, -0.3, -0.8]);
            const mouth = V.add(p.bones().head.t, mv3(p.bones().head.R, [0, 4.0, 2.0]));
            p.arm_ik('R', inReach(p, 'R', V.lerp(chestAt(p, [4.0, 10.0, -3.0]), V.add(mouth, [0.5, 2.5, -2.5]), up), 0.96), [1.0, -0.3, -0.8]);
            holdCup(p, 'R', 55 * up);
            out.push(p);
        }
        return out;
    }
    // Atendente trabalhando no balcão (preparando, passando no caixa, limpando): as mãos à altura do tampo andam em elipses
    // desencontradas, o tronco curvado sobre o balcão, a cabeça baixa olhando o que faz.
    function workCounter(n = 12) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, a = TAU * t, p = standBase(t, { lean: 10, hp: -16 + 2 * sin(a), yaw: 6 * sin(a) });
            p.arm_ik('R', inReach(p, 'R', chestAt(p, [4.0 + 2.2 * cos(a), 16.0 + 2.2 * sin(a), -9.0 + 0.8 * sin(2 * a)]), 0.96), [1.0, -0.3, -0.8]);
            p.arm_ik('L', inReach(p, 'L', chestAt(p, [-4.0 + 1.6 * cos(a + 2.2), 15.0 + 1.4 * sin(a + 2.2), -9.5]), 0.96), [-1.0, -0.3, -0.8]);
            out.push(p);
        }
        return out;
    }

    const CLIPS = {
        idle: { fps: 6, loop: true, k: { none: 6, knife: 6, '*': 4 }, n: { none: 8, knife: 8, '*': 6 }, fn: (w, o, n) => (w === 'none' ? idle(n) : w === 'bat' ? batIdle(n) : w === 'knife' ? knifeIdle(n) : gunIdle(w, n)) },
        walk: { fps: 10, loop: true, k: 8, n: 12, fn: (w, o, n) => (w === 'none' ? walk(n) : w === 'bat' ? batWalk(n) : w === 'knife' ? knifeWalk(n) : gunWalk(w, n)) },
        run: { fps: 14, loop: true, k: 8, n: 12, fn: (w, o, n) => (w === 'none' ? run(n) : w === 'bat' ? batRun(n) : w === 'knife' ? knifeRun(n) : gunRun(w, n)) },
        stab: { fps: 16, loop: false, k: 7, n: 10, fn: seq(() => knifeStab()) },                 // facada (Melee.stab)
        walk_up: { fps: 10, loop: true, k: 8, n: 12, fn: (w, o, n) => walkUp(n) },
        climb: { fps: 10, loop: true, k: 10, n: 12, fn: (w, o, n) => climb(n) },
        draw: { fps: 14, loop: false, k: 5, n: 8, fn: (w, o, n) => gunDraw(w, n) },
        aim: { fps: 1, loop: true, k: 1, n: 1, fn: (w) => gunAim(w) },
        shoot: { fps: 16, loop: false, k: { shotgun: 7, rpg: 5, '*': 4 }, n: { shotgun: 10, rpg: 8, '*': 6 }, fn: (w, o, n) => shootFn(w, n), fpsFor: { pistol: 15, revolver: 13, shotgun: 12, smg: 18, pistol_sil: 15, rpg: 10, launcher: 12, minigun: 22 }, loopFor: { minigun: true } },
        holdup: { fps: 6, loop: true, k: 4, n: 6, fn: (w, o, n) => (w === 'knife' ? knifeHoldup(n) : holdup(w === 'none' ? 'pistol' : w, n)) },
        swing: { fps: 14, loop: false, k: 7, n: 10, fn: seq((w) => batSwing(w === 'baton' ? 'baton' : 'bat')) },
        punch: { fps: 14, loop: false, k: 6, n: 9, fn: seq(() => punchCross()) },
        punchL: { fps: 14, loop: false, k: 5, n: 8, fn: seq(() => punchJab()) },
        kick: { fps: 12, loop: false, k: 7, n: 10, fn: seq(() => kick()) },
        throw: { fps: 12, loop: false, k: 7, n: 7, fn: seq(() => throwAnim()) },
        gym_curl: { fps: 9, loop: true, k: 12, n: 14, fn: (w, o, n) => gymCurl(w, n) },               // academia: rosca direta (w1/w2/w3 = faixa de peso)
        gym_bench: { fps: 8, loop: true, k: 12, n: 14, fn: (w, o, n) => gymBench(w, n) },             // supino
        gym_squat: { fps: 8, loop: true, k: 12, n: 14, fn: (w, o, n) => gymSquat(w, n) },             // agachamento
        grenade_pin: { fps: 14, loop: false, k: 10, n: 14, fn: (w, o, n) => grenadePin(n) },        // pegar a granada e puxar o pino
        grenade_hold: { fps: 6, loop: true, k: 6, n: 8, fn: (w, o, n) => holdLoop(n, 'grenade') },   // armada, mirando (a força carregando)
        grenade_throw: { fps: 16, loop: false, k: 7, n: 10, fn: seq(() => throwRelease('grenade')) },
        molotov_light: { fps: 13, loop: false, k: 12, n: 16, fn: (w, o, n) => molotovLight(n) },    // acender o pano com o isqueiro
        molotov_hold: { fps: 8, loop: true, k: 6, n: 8, fn: (w, o, n) => holdLoop(n, 'molotov') },
        molotov_throw: { fps: 16, loop: false, k: 7, n: 10, fn: seq(() => throwRelease('molotov')) },
        hurt: { fps: 12, loop: false, k: 4, n: 6, fn: seq(() => hurt()) },
        dead: { fps: 12, loop: false, k: 8, n: 10, fn: seq(() => death(false)) },        // (a poça de sangue é a do jogo — Blood.deathPool —, não desenhada)
        surrender: { fps: 9, loop: false, k: 8, n: 10, fn: seq(() => surrenderKneel()) },
        kneel: { fps: 1, loop: true, k: 1, n: 1, fn: () => [kneelPose(1)] },
        handsup: { fps: 8, loop: false, k: 5, n: 5, fn: (w, o, n) => handsUp(n) },
        scared: { fps: 14, loop: true, k: 8, n: 12, fn: (w, o, n) => scared(n) },
        swim: { fps: 10, loop: true, k: 8, n: 10, fn: (w, o, n) => swim(n) },
        swim_idle: { fps: 6, loop: true, k: 6, n: 6, fn: (w, o, n) => swimIdle(n) },
        swim_breast: { fps: 12, loop: true, k: 12, n: 12, fn: (w, o, n) => swimBreast(n) },         // nado peito na superfície (o nado normal)
        wade: { fps: 10, loop: true, k: 10, n: 10, fn: (w, o, n) => wadeDeep(n) },                  // andando com a água acima da metade do corpo
        wade_idle: { fps: 6, loop: true, k: 8, n: 8, fn: (w, o, n) => wadeIdle(n) },              // parado nessa água: braços equilibrando
        swim_in: { fps: 14, loop: false, k: 8, n: 12, fn: (w, o, n) => swimIn(n) },                // nado peito → crawl (Shift)
        swim_out: { fps: 14, loop: false, k: 8, n: 12, fn: (w, o, n) => swimIn(n).reverse() },     // crawl → nado peito (soltou o Shift / chegou ao raso)
        swim_stand: { fps: 12, loop: false, k: 10, n: 10, fn: (w, o, n) => swimStand(n) },         // ficar de pé no raso (depois do swim_out; → wade_idle)
        dive_in: { fps: 12, loop: false, k: 9, n: 10, fn: (w, o, n) => diveIn(n) },                // afundar (nado peito → mergulho)
        wade_dive: { fps: 12, loop: false, k: 9, n: 10, fn: (w, o, n) => wadeDive(n) },            // vadeando no fundo → nado peito (o mergulho no nado)
        bridge_dive: { fps: 12, loop: false, k: 10, n: 10, fn: (w, o, n) => bridgeDive(n) },       // salto de cabeça da ponte (no ar: o jogo faz o arco)
        board_boat: { fps: 11, loop: false, k: 14, n: 14, fn: (w, o, n) => boardBoat(n) },        // da água para dentro do barco (jet ski, lancha, barco)
        dive: { fps: 10, loop: true, k: 12, n: 12, fn: (w, o, n) => dive(n) },                     // nado peito debaixo d'água
        dive_out: { fps: 12, loop: false, k: 8, n: 9, fn: (w, o, n) => diveOut(n) },              // voltar à tona (mergulho → nado peito)
        flail: { fps: 12, loop: true, k: 4, n: 6, fn: (w, o, n) => flail(n) },
        tumble: { fps: 16, loop: false, k: 8, n: 11, fn: (w, o, n) => tumble(n) },
        lie: { fps: 1, loop: true, k: 1, n: 1, fn: () => lie() },
        getup: { fps: 10, loop: false, k: 7, n: 10, fn: seq(() => getUp()) },
        vault: { fps: 10, loop: false, k: 6, n: 9, fn: seq(() => vault()) },
        carjack: { fps: 9, loop: false, k: 6, n: 9, fn: (w, o, n) => carjack(n) },
        opendoor: { fps: 10, loop: false, k: 5, n: 8, fn: (w, o, n) => openDoor(n) },
        enter: { fps: 10, loop: false, k: 6, n: 9, fn: (w, o, n) => enterCar(n) },
        sitin: { fps: SIT_IN.fps, loop: false, k: SIT_IN.n, n: SIT_IN.n, fn: (w, o, n) => sitIn(w, n) },
        sitout: { fps: SIT_IN.fps, loop: false, k: SIT_IN.n, n: SIT_IN.n, fn: (w, o, n) => sitIn(w, n).reverse() },     // sair do carro: o sitin ao contrário (do banco à porta)          // (só o jogador: L/R = lado da frente do carro)
        pick: { fps: 7, loop: true, k: 4, n: 6, fn: (w, o, n) => pickLock(n) },
        pickpocket: { fps: 7, loop: false, k: 6, n: 9, fn: (w, o, n) => pickpocket(n) },
        rummage: { fps: 8, loop: true, k: 6, n: 9, fn: (w, o, n) => rummage(n) },
        idle_hold: { fps: 4, loop: true, k: 4, n: 6, fn: (w, o, n) => holdAnim('idle', w, o && o.hand, n) },
        walk_hold: { fps: 10, loop: true, k: 8, n: 12, fn: (w, o, n) => holdAnim('walk', w, o && o.hand, n) },
        run_hold: { fps: 13, loop: true, k: 8, n: 12, fn: (w, o, n) => holdAnim('run', w, o && o.hand, n) },
        idle_pull: { fps: 4, loop: true, k: 4, n: 6, fn: (w, o, n) => pullAnim('idle', n) },
        walk_pull: { fps: 10, loop: true, k: 8, n: 12, fn: (w, o, n) => pullAnim('walk', n) },
        walk_heavy: { fps: 8, loop: true, k: 8, n: 12, fn: (w, o, n) => walkHeavy(n) },
        run_heavy: { fps: 17, loop: true, k: 8, n: 12, fn: (w, o, n) => runHeavy(n) },          // (passada 9,6 × 17 qps ≈ a da corrida 11,5 × 14: pés plantados no mesmo ritmo)
        idle_heavy: { fps: 4, loop: true, k: 6, n: 8, fn: (w, o, n) => idleHeavy(n) },
        baton_idle: { fps: 6, loop: true, k: 4, n: 4, fn: (w, o, n) => batonIdle(n) },
        baton_walk: { fps: 10, loop: true, k: 8, n: 8, fn: (w, o, n) => batonWalk(n) },
        // pilotando: moto = 7 degraus de inclinação, o corpo todo deitando com a moto (±28,6°: rideBank); jet ski = 5 degraus
        // (+12° … −12°) — fps 0: o jogo escolhe o quadro pela inclinação (SpriteActor.setLean); bicicleta pedalando, lancha.
        // A moto e a bicicleta giram livres (3D): o piloto tem mais direções (64 / 32) para não ficar torto em relação ao guidão.
        ride_moto: { fps: 0, loop: true, k: 7, n: 7, dirs: 64, fn: (w, o, n) => rideBank('moto', n) },
        ride_scooter: { fps: 0, loop: true, k: 7, n: 7, dirs: 64, fn: (w, o, n) => rideBank('scooter', n) },          // (scooter: pés no assoalho)
        ride_jetski: { fps: 0, loop: true, k: 5, n: 5, fn: (w, o, n) => rideLean('jetski', n) },
        ride_bike: { fps: 10, loop: true, k: 8, n: 12, dirs: 32, fn: (w, o, n) => rideBike(n) },
        ride_boat: { fps: 3, loop: true, k: 4, n: 6, fn: (w, o, n) => rideBoat(n) },
        ride_back: { fps: 10, loop: true, k: 8, n: 8, fn: (w, o, n) => rideBack(w, n) },                  // (ré: moto/bike; o jogo toca ao contrário)
        mount: { fps: 8, loop: false, k: 6, n: 12, fn: (w, o, n) => mountAnim(w, n) },          // (só o jogador: moto/motoL/bike/bikeL)
        // tático (só o jogador): agachado/cobertura, andar agachado (furtivo), passo lateral mirando e rolamento de esquiva
        crouch: { fps: 3, loop: true, k: 4, n: 6, fn: (w, o, n) => crouchIdle(w, n) },
        cover: { fps: 3, loop: true, k: 4, n: 6, fn: (w, o, n) => coverIdle(w, n) },                 // ajoelhado de costas para a cobertura
        crouch_aim: { fps: 3, loop: true, k: 4, n: 4, fn: (w, o, n) => kneelAim(w === 'none' ? 'pistol' : w, n) },     // mirando ajoelhado
        crouch_shoot: { fps: 16, loop: false, k: { shotgun: 7, rpg: 5, '*': 4 }, n: { shotgun: 10, rpg: 8, '*': 6 }, fn: (w, o, n) => kneelShoot(w, n),     // atirando ajoelhado
            fpsFor: { pistol: 15, revolver: 13, shotgun: 12, smg: 18, pistol_sil: 15, rpg: 10, launcher: 12, minigun: 22 }, loopFor: { minigun: true } },
        sneak: { fps: 9, loop: true, k: 8, n: 12, fn: (w, o, n) => sneakWalk(w, n) },
        strafe: { fps: 10, loop: true, k: 8, n: 12, fn: (w, o, n) => strafeWalk(w === 'none' ? 'pistol' : w, n) },
        roll: { fps: 16, loop: false, k: 10, n: 14, fn: (w, o, n) => dodgeRoll(n) },
        // clientes e atendentes das lojas (só os tipos loja_* — world/ShopLife.js)
        sit: { fps: 4, loop: true, k: 12, n: 12, fn: (w, o, n) => sitIdle(n, false) },              // sentado à toa (mãos no colo)
        sit_table: { fps: 4, loop: true, k: 12, n: 12, fn: (w, o, n) => sitIdle(n, true) },        // sentado à mesa, esperando (mãos no tampo)
        sit_eat: { fps: 6, loop: true, k: 14, n: 14, fn: (w, o, n) => sitEat(n) },                 // comendo (garfo do prato à boca)
        sit_drink: { fps: 5, loop: true, k: 14, n: 14, fn: (w, o, n) => sitDrink(n) },             // bebendo sentado
        browse: { fps: 5, loop: true, k: 16, n: 16, fn: (w, o, n) => browse(n) },                  // olhando a prateleira (pega, examina, devolve)
        pay: { fps: 6, loop: true, k: 12, n: 12, fn: (w, o, n) => payAnim(n) },                    // pagando no caixa
        phone: { fps: 3, loop: true, k: 10, n: 10, fn: (w, o, n) => phoneAnim(n) },                // mexendo no celular (esperando)
        drink: { fps: 5, loop: true, k: 14, n: 14, fn: (w, o, n) => drinkStand(n) },               // bebendo de pé no balcão
        work: { fps: 6, loop: true, k: 12, n: 12, fn: (w, o, n) => workCounter(n) },               // atendente trabalhando no balcão
    };
    // nº de quadros de um clipe para a arma desenhada w (n ou k da tabela)
    const nFor = (v, w) => (typeof v === 'number' ? v : v[w] !== undefined ? v[w] : v['*']);
    for (const d of Object.values(CLIPS)) { const f = d.fn; if (d.k === undefined) d.k = d.n; d.fn = (w = 'none', o = {}, n = null) => f(w, o || {}, n || nFor(d.n, w)); }
    // EXPRESSÃO do rosto em cada quadro de um clipe (NpcGenChar.FACES; null = a da ficha, parada — 'neutral' ou 'angry'). w0 = a arma
    // do JOGO: de arma na mão, cara fechada; batendo, atirando, rendendo alguém = raiva; fugindo, rendido, arremessado = medo; apanhando,
    // levantando, fazendo força = dor; caído/morto = olhos fechados (morrendo: dor e depois fechados).
    const EXPR = {};
    for (const [e, l] of Object.entries({
        rage: ['punch', 'punchL', 'kick', 'swing', 'stab', 'shoot', 'crouch_shoot', 'holdup', 'grenade_throw', 'molotov_throw', 'throw', 'carjack'],
        angry: ['aim', 'crouch_aim', 'draw', 'strafe', 'grenade_pin', 'grenade_hold', 'molotov_light', 'molotov_hold', 'baton_idle', 'baton_walk'],
        scared: ['scared', 'surrender', 'kneel', 'handsup', 'flail'],
        pain: ['hurt', 'getup', 'gym_curl', 'gym_bench', 'gym_squat', 'walk_heavy', 'run_heavy', 'climb'],
        closed: ['lie'],
    })) for (const n of l) EXPR[n] = e;
    const ARMED = new Set(['idle', 'walk', 'run', 'crouch', 'sneak', 'cover', 'walk_up']);
    function exprOf(name, w0, i, n) {
        if (name === 'dead') return i < n * 0.4 ? 'pain' : 'closed';
        if (name === 'tumble') return i < n * 0.5 ? 'scared' : 'pain';
        if (EXPR[name]) return EXPR[name];
        return ARMED.has(name) && w0 && w0 !== 'none' ? 'angry' : null;
    }
    // O clipe pronto para o atlas: as poses (n quadros), fps (= fps de referência · n/k), loop e direções. w0 = a arma do JOGO; com
    // typeId, vira a desenhada (G.weaponFor). opts: { hand } do jogador, n (forçar outro nº de quadros: o fps acompanha).
    function clipPoses(name, w0 = 'none', typeId = null, opts = {}) {
        const d = CLIPS[name];
        if (!d) throw new Error('clipe desconhecido: ' + name);
        const w = typeId && G.weaponFor ? G.weaponFor(typeId, w0) : w0;
        const poses = d.fn(w, opts, opts.n || nFor(d.n, w)), fps0 = (d.fpsFor && d.fpsFor[w0]) || d.fps;
        const tagged = new Set();                                             // (a mesma pose em dois quadros com outra expressão: uma cópia)
        poses.forEach((p, i) => {
            const e = exprOf(name, w0, i, poses.length);
            if (tagged.has(p) && p.expr !== e) poses[i] = p = clonePose(p);
            tagged.add(p); p.expr = e;
        });
        return { poses, fps: Math.round(((fps0 * poses.length) / nFor(d.k, w)) * 1e4) / 1e4, loop: d.loopFor && w0 in d.loopFor ? d.loopFor[w0] : d.loop, dirs: d.dirs || 16, n: poses.length };
    }

    Object.assign(G, { Pose, setRig, RIG, ik2, armTarget, resample, clonePose, clipPoses, exprOf, HEAD_TILT, ANIMS, CLIPS, CTX, WEAPON_HOLD, SIT_IN, anim: { idle, walk, run, gunIdle, gunWalk, gunRun, gunDraw, holdWeapon, kneelPose, death, getUp } });
    return G;
}
