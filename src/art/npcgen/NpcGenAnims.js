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
    const { Rx, Ry, Rz, deg, nrm, V, M4, mm4, mm3, mv3, pt4, lookRot, I3, PROP_GRIP, PROP_MUZZLE, ANKLE_H, SKEL, PUMP_Y, PUMP_TRAVEL, UPPER, LOWER, FIST, THIGH, SHIN } = G;
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
        const F = arm ? V.mul(Qn, -1) : Qn;
        const z = V.mul(u, -1);
        let x = V.cross(F, z);
        if (V.len(x) < 1e-6) x = [1.0, 0, 0];
        x = nrm(x);
        const y = V.cross(z, x);
        const Ru = G.fromCols(x, y, z);
        const z2 = V.mul(f, -1), y2 = V.cross(z2, x);
        const Rf = G.fromCols(x, nrm(y2), z2);
        return [Ru, Rf];
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
        arm_ik(side, target, pole = null, handR = null) {
            const s = side === 'R' ? 1.0 : -1.0;
            this.arm[side] = ['ik', target.slice(), (pole || [0.45 * s, -1.0, -0.2]).slice(), handR];
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
        // Membros marcados em `this.abs` (pilotar: mãos no guidão, pés na pedaleira) têm o alvo do IK JÁ no espaço adulto.
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
            const UP2 = UPPER * ka, LO2 = LOWER * ka;
            for (const sd of ['R', 'L']) {
                const so = RIG['uarm_' + sd][1], arm = this.arm[sd];
                const sh = mm4(B.chest, M4(loc(Bo.chest, Bo['uarm_' + sd]), [so[0] * (A.width || 1), so[1], so[2] * kt]));
                if (abs_['arm' + sd] && arm[0] === 'ik') {                        // alvo no espaço adulto: IK com os braços novos
                    const [Ru, Rf] = ik2(sh.t, arm[1], UP2, LO2 - FIST[2] * (A.hand || 1), arm[2], true);
                    B['uarm_' + sd] = M4(Ru, sh.t);
                    const E = V.add(sh.t, mv3(Ru, [0, 0, -UP2]));
                    B['farm_' + sd] = M4(Rf, E);
                    B['hand_' + sd] = M4(arm[3] || Rf, V.add(E, mv3(Rf, [0, 0, -LO2])));
                } else {
                    B['uarm_' + sd] = sh;
                    B['farm_' + sd] = mm4(sh, M4(loc(Bo['uarm_' + sd], Bo['farm_' + sd]), [0, 0, -UP2]));
                    B['hand_' + sd] = mm4(B['farm_' + sd], M4(loc(Bo['farm_' + sd], Bo['hand_' + sd]), [0, 0, -LO2]));
                }
                const ho = RIG['thigh_' + sd][1], leg = this.leg[sd];
                if (leg[0] === 'ik') {
                    // IK de novo com as pernas novas: o pé fica à mesma distância lateral do quadril (os ângulos iguais abririam
                    // as pernas), o passo e a altura do pé crescem com a perna; pé no chão continua no chão.
                    const Hh = pt4(B.pelvis, ho), Ho = pt4(Bo.pelvis, ho), a = leg[1];
                    const T = abs_['leg' + sd] ? a : [Hh[0] + (a[0] - Ho[0]), Hh[1] + (a[1] - Ho[1]) * kl, water ? Hh[2] + (a[2] - Ho[2]) * kl : ANKLE_H + (a[2] - ANKLE_H) * kl];
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
                if (name === 'pump' && lastI >= 0) {                              // a bomba da escopeta: no mesmo ponto da arma maior
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
                if (abs(lp[0]) > 5 || abs(lp[2]) > 5 || lp[1] < -6 || lp[1] > 32) continue;      // (só a mão NO objeto: cano, cabo, coronha)
                const T = mapVia(h.i, arm[1]), so = RIG['uarm_' + other][1];
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
            return { B, props, effects, water: this.water };
        }
    }

    const HEAD_TILT = 22.0;      // queixo um pouco pra cima: o rosto aparece da câmera alta
    const HEEL = [0, -3.4, -5.65], TOE = [0, 12.2, -5.65];
    const SHO_R = [16.6, 0.0, 15.6];

    // ------------------------------------------------------------------ utilitários
    const ease = (s) => 0.5 - 0.5 * cos(PI * clip(s, 0, 1));
    const lerp = (a, b, s) => (Array.isArray(a) ? V.lerp(a, b, s) : a * (1 - s) + b * s);
    function keys(frames, t) {
        if (t <= frames[0][0]) return frames[0][1];
        for (let i = 0; i < frames.length - 1; i++) {
            const [t0, v0] = frames[i], [t1, v1] = frames[i + 1];
            if (t0 <= t && t <= t1) return lerp(v0, v1, ease((t - t0) / max(t1 - t0, 1e-9)));
        }
        return frames[frames.length - 1][1];
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
        p.leg_ik(side, [x, y, ANKLE_H + z + groundLift(pitchD)], pole || [0.15 * s, 1.0, 0.0], footRot(yawD, pitchD));
    }
    // Ciclo das pernas. t = 0: calcanhar direito pousando na frente, pé esquerdo atrás.
    // Passada do corpo adulto 25% mais longa que a do pacote (G.ADULT): andar e correr com pés plantados em velocidades realistas
    // (o jogo casa o ritmo da animação com a velocidade — Config.anim).
    const STRIDE_K = () => (G.ADULT ? 1.25 : 1);
    // slope: subindo uma rampa (m/m) — o chão à frente é mais alto: o pé pousa mais alto quanto mais à frente e o pé acompanha o chão.
    function gait(p, t, { stride = 7.5, lift = 3.5, width = 10.0, toe = 8, stance = 0.5, heel = 14, toeoff = -30, kick = 0.0, slope = 0.0 } = {}) {
        stride *= STRIDE_K();
        const sDeg = Math.atan(slope) * 180 / PI;
        for (const [side, s, ph0] of [['R', 1, t], ['L', -1, t + 0.5]]) {
            const ph = ph0 % 1.0;
            let y, z, pitch;
            if (ph < stance) {
                const u = ph / stance;
                y = stride * (1 - 2 * u); z = 0.0;
                pitch = heel * max(0.0, 1 - u * 3.0) ** 2 + (toeoff * 0.45 * max(0.0, u - 0.75)) / 0.25;
            } else {
                const u = (ph - stance) / (1 - stance);
                y = -stride + 2 * stride * ease(u);
                z = lift * sin(PI * u) + (u < 0.56 ? kick * sin(PI * min(1.0, u * 1.8)) : 0);
                pitch = toeoff * (1 - u) ** 1.6 + heel * u ** 2.5;
            }
            placeFoot(p, side, [s * width, y, z + slope * y], -s * toe, pitch + sDeg);
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

    // ------------------------------------------------------------------ locomoção
    function idle(n = 6) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, b = sin(TAU * t), p = base();
            p.pelvis_t = [0, 0, -0.35 + 0.35 * cos(TAU * t)];
            p.chest_R = Rx(deg(-1.2 * b));
            p.head_R = Rx(deg(HEAD_TILT + 1.5 * b));
            standLegs(p);
            p.arm_fk('R', { flex: 4 + 1.5 * b, abd: 12 + 1.6 * cos(TAU * t), elbow: 14 + 2 * b });
            p.arm_fk('L', { flex: 4 + 1.5 * b, abd: 12 + 1.6 * cos(TAU * t), elbow: 14 + 2 * b });
            out.push(p);
        }
        return out;
    }
    function walkUpper(p, t, arms = true, amp = 24, lean = 3.0) {
        const c = cos(TAU * t);
        p.pelvis_R = Rz(deg(5 * c));
        p.chest_R = mm3(Rz(deg(-9 * c)), Rx(deg(lean)));
        p.head_R = mm3(Rz(deg(4 * c)), Rx(deg(HEAD_TILT - lean * 0.6)));
        if (arms) {
            p.arm_fk('R', { flex: -amp * c + 3, abd: 11, elbow: 14 + 14 * max(0.0, -c) });
            p.arm_fk('L', { flex: amp * c + 3, abd: 11, elbow: 14 + 14 * max(0.0, c) });
        }
    }
    function walk(n = 8, arms = true) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, p = base();
            p.pelvis_t = [0, 0, -1.6 - 0.9 * cos(2 * TAU * t)];
            gait(p, t, { stride: 7.8, lift: 3.6, width: 9.6 });
            walkUpper(p, t, arms);
            out.push(p);
        }
        return out;
    }
    function runLegs(p, t) {
        const c = cos(TAU * t);
        p.pelvis_t = [0, 1.5, (G.ADULT ? -4.6 : -3.2) - 1.6 * cos(2 * TAU * (t - 0.17))];          // (adulto: mais agachado — alcança a passada longa)
        p.pelvis_R = mm3(Rz(deg(8 * c)), Rx(deg(-10)));
        p.chest_R = mm3(Rz(deg(-15 * c)), Rx(deg(-6)));
        p.head_R = mm3(Rz(deg(7 * c)), Rx(deg(HEAD_TILT + 12)));
        gait(p, t, { stride: 11.5, lift: 5.0, width: 8.6, stance: 0.38, heel: 8, toeoff: -38, kick: 6.5 });
        return c;
    }
    function run(n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, p = base(), c = runLegs(p, t);
            p.arm_fk('R', { flex: -42 * c + 10, abd: 14, elbow: 78 + 18 * max(0.0, c) });
            p.arm_fk('L', { flex: 42 * c + 10, abd: 14, elbow: 78 + 18 * max(0.0, -c) });
            out.push(p);
        }
        return out;
    }

    // ------------------------------------------------------------------ subida (morro, encosta)
    // Subindo: o chão à frente é mais alto (gait com slope), o corpo inclina para a frente, o passo encurta e sobe mais, os braços
    // trabalham. Passada 0,77 da do andar (SpriteActor.CLIMB.upStride: o jogo corrige o ritmo).
    function walkUp(n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, p = base();
            p.pelvis_t = [0, 1.0, -2.6 - 1.1 * cos(2 * TAU * t)];
            gait(p, t, { stride: 6.0, lift: 4.8, width: 9.6, slope: 0.42, heel: 6, toeoff: -34 });
            walkUpper(p, t, true, 30, 17);
            out.push(p);
        }
        return out;
    }
    // Encosta íngreme / paredão: escalando — tronco bem curvado, joelhos altos, e as mãos apoiando na encosta à frente, alternadas
    // (a mão oposta ao pé que sobe agarra mais acima e puxa o corpo). Passada 0,59 da do andar (SpriteActor.CLIMB.climbStride).
    function climb(n = 10) {
        const out = [], SL = 0.85;
        for (let i = 0; i < n; i++) {
            const t = i / n, c = cos(TAU * t), p = base();
            p.pelvis_t = [0, 2.5, -8.0 - 1.4 * cos(2 * TAU * t)];
            gait(p, t, { stride: 4.6, lift: 6.5, width: 10.6, slope: SL, heel: 0, toeoff: -22 });
            p.pelvis_R = Rz(deg(5 * c));
            p.chest_R = mm3(Rz(deg(-9 * c)), Rx(deg(48)));
            p.head_R = mm3(Rz(deg(4 * c)), Rx(deg(HEAD_TILT - 26)));            // olha encosta acima
            for (const [side, s, ph0] of [['R', 1, t + 0.5], ['L', -1, t]]) {
                const ph = ph0 % 1.0;
                let y, z;
                if (ph < 0.5) { const u = ph / 0.5; y = 17.0 - 9.0 * u; z = 0.0; }            // apoiada: o corpo passa por cima, a mão "vai para trás"
                else { const u = (ph - 0.5) / 0.5; y = 8.0 + 9.0 * ease(u); z = 4.5 * sin(PI * u); }   // solta e agarra mais acima
                p.arm_ik(side, [s * 12.0, y, ANKLE_H * 0.4 + SL * y + z], [s * 1.0, -0.3, -0.5]);
            }
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
    };
    const CTX = { rifle: 'rifle', melee: 'bat' };          // escolhas de arma do personagem (o build define antes de gerar as poses)
    const LONG = (name) => name === 'smg' || name === 'shotgun' || name === 'rifle' || name === 'rifle_ak';

    // Arma na mão e os dois braços resolvidos. recoil = graus de subida do cano, kick = recuo, pump = bombear a escopeta (0..1).
    function holdWeapon(p, name, { recoil = 0.0, kick = 0.0, pump = 0.0, bob = [0, 0, 0], flash = null, casing = null, chest_extra = 0.0, aim_yaw = 0.0, keepChest = false, freeL = false } = {}) {
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
        p.arm_ik('R', grip, h.poleR);
        if (freeL) { /* o braço esquerdo fica com quem chamou (carregando bolsa) */ }
        else if (h.one_hand) p.arm_fk('L', { flex: 14 + recoil * 0.3, abd: 16, elbow: 34 });
        else p.arm_ik('L', lf, h.poleL);
        if (flash) p.effects.push({ type: 'flash', pos: propPt(Mp, PROP_MUZZLE[name]), dir: fwd, size: flash[0], variant: flash[1] });
        if (casing) p.effects.push({ type: 'casing', pos: V.add(propPt(Mp, [0, 2.0, 2.4]), casing) });
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
            p.pelvis_t = [0, 0, -1.6 - 0.9 * cos(2 * TAU * t)];
            p.pelvis_R = Rz(deg(4 * cos(TAU * t)));
            gait(p, t, { stride: 7.4, lift: 3.4, width: 9.4 });
            holdWeapon(p, name);
            p.chest_R = mm3(Rz(deg(-4 * cos(TAU * t))), p.chest_R);
            p.props = [];
            holdWeapon(p, name);
            out.push(p);
        }
        return out;
    }
    function gunShoot(name, seq, standFwd = [-1.5, 2.5]) {
        return seq.map((s) => {
            const p = base();
            p.pelvis_t = [0, name === 'shotgun' ? -0.4 * (s.kick || 0) : 0, name === 'shotgun' ? -1.0 : -0.9];
            standLegs(p, 11.5, standFwd);
            holdWeapon(p, name, s);
            return p;
        });
    }
    const pistolShoot = () => gunShoot('pistol', [{ recoil: 3, kick: 0.6, flash: [1.25, 0] }, { recoil: 18, kick: 2.4, casing: [2.5, -1, 2] }, { recoil: 7, kick: 1.0, casing: [5.5, -2.5, 0] }, { recoil: 1, kick: 0.2 }]);
    const smgShoot = (name = 'smg') => gunShoot(name, [{ recoil: 4, kick: 1.4, flash: [1.3, 0], casing: [3, 0, 2] }, { recoil: 1.5, kick: 0.4, casing: [6, -2, 0] }, { recoil: 5, kick: 1.6, flash: [1.1, 1], casing: [3, 0, 2] }, { recoil: 1.5, kick: 0.5, casing: [6, -2, 0] }]);
    const shotgunShoot = () => gunShoot('shotgun', [{ recoil: 6, kick: 1.5, flash: [1.8, 0], chest_extra: 2 }, { recoil: 17, kick: 3.6, chest_extra: 7 }, { recoil: 8, kick: 1.6, chest_extra: 3 },
        { recoil: 2, kick: 0.6, pump: 1.0 }, { recoil: 2, kick: 0.6, pump: 1.0, casing: [5, -2, 2] }, { recoil: 1, kick: 0.3, pump: 0.0 }, { recoil: 0.5, kick: 0.0 }]);
    const rifleShoot = (name = CTX.rifle) => gunShoot(name, [{ recoil: 4, kick: 1.5, flash: [1.4, 0], casing: [3, 0, 2] }, { recoil: 1.5, kick: 0.5, casing: [6, -2, 0] }, { recoil: 5, kick: 1.7, flash: [1.2, 1], casing: [3, 0, 2] }, { recoil: 1.5, kick: 0.5, casing: [6, -2, 0] }]);

    // NOVO: correr com a arma. Pistola: na mão direita, apontada para a frente e para baixo, o braço esquerdo balança.
    // Arma longa: atravessada no peito ("posição de porte"), as duas mãos nela.
    function gunRun(name, n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, p = base(), c = runLegs(p, t);
            const corg = chestOrg(p);
            if (!LONG(name)) {
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
    // NOVO: sacar a arma — mão no quadril, puxa e levanta até a mira (termina na pose de mirar).
    function gunDraw(name, n = 5) {
        const out = [], aim = gunIdle(name)[0];
        for (let i = 0; i < n; i++) {
            const s = i / (n - 1), p = base();
            p.pelvis_t = [0, 0, -0.9];
            standLegs(p, 11.5, [-1.5 * s, 2.5 * s]);
            if (s >= 0.99) { out.push(aim); continue; }
            const h = WEAPON_HOLD[name];
            p.chest_R = mm3(Rz(deg(h.chest_yaw * ease(s))), Rx(deg(-2 * s)));
            p.head_R = mm3(Rz(deg(h.head_yaw * ease(s))), Rx(deg(HEAD_TILT - 4 * s)));
            const corg = chestOrg(p);
            const hip = V.add(corg, [13.0, 1.0, -10.0]), aimG = V.add(corg, h.grip);
            const grip = V.lerp(hip, aimG, ease(s * 1.15));
            const fwd = nrm(V.lerp([0.1, 0.2, -1.0], [0, 1.0, 0], ease(s * 1.2)));
            const Mp = placeProp(p, name, grip, LONG(name) ? nrm(V.add(fwd, [-0.07, 0, 0])) : fwd);
            p.arm_ik('R', grip, h.poleR);
            if (h.one_hand || s < 0.5) p.arm_fk('L', { flex: 6 + 10 * s, abd: 14, elbow: 20 + 14 * s });
            else p.arm_ik('L', propPt(Mp, name === 'shotgun' ? [0, PUMP_Y, -1.2] : PROP_GRIP[name][1]), h.poleL);
            if (name === 'shotgun') p.props.push(['pump', mm4(Mp, M4(null, [0, PUMP_Y, 0.7]))]);
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
    const PUNCH_SEQ = [
        [-12, G_L, G_R, 0, 0.0], [-26, [-3.0, 31.0, 11.5], G_R, -6, 1.5], [-24, [-3.2, 30.0, 11.5], G_R, -6, 1.2], [-10, G_L, G_R, 0, 0.0],
        [6, G_L, [8.0, 6.0, 9.0], 4, 0.0], [30, [-7.0, 10.0, 10.0], [1.5, 32.5, 11.5], 12, 2.4], [28, [-7.0, 10.0, 10.0], [1.8, 31.0, 11.5], 11, 2.0], [-6, G_L, G_R, 0, 0.5],
    ];
    function punchFrames(seq) {
        return seq.map(([cy, lf, rf, py, lunge]) => {
            const p = base();
            fightStance(p);
            p.pelvis_R = Rz(deg(py));
            p.pelvis_t = V.add(p.pelvis_t, [0, lunge, 0]);
            const c = guard(p, cy);
            p.arm_ik('L', V.add(c, lf), [-1.0, -0.3, -0.9]);
            p.arm_ik('R', V.add(c, rf), [1.0, -0.3, -0.9]);
            return p;
        });
    }
    const punch = () => punchFrames(PUNCH_SEQ);
    const punchJab = () => punchFrames([PUNCH_SEQ[0], PUNCH_SEQ[1], PUNCH_SEQ[2], PUNCH_SEQ[3], PUNCH_SEQ[0]]);           // NOVO: só o jab de esquerda
    const punchCross = () => punchFrames([PUNCH_SEQ[3], PUNCH_SEQ[4], PUNCH_SEQ[5], PUNCH_SEQ[6], PUNCH_SEQ[7], PUNCH_SEQ[0]]);   // NOVO: só o direto de direita

    function kick() {
        const seq = [[[10.5, -4.0, 0.0], 0, 0, 0], [[8.0, 6.0, 13.0], -25, 6, 0], [[6.0, 22.0, 18.0], 35, 14, 6], [[6.0, 21.5, 17.5], 35, 14, 6],
            [[8.0, 7.0, 12.0], -15, 6, 0], [[10.0, 1.0, 2.5], 0, 2, 0], [[10.5, -4.0, 0.0], 0, 0, 0]];
        return seq.map(([ank, fp, lean, pp], i) => {
            const p = base();
            placeFoot(p, 'L', [-9.5, 5.0, 0], 6);
            p.pelvis_t = [0, 0, -2.2 + (i >= 1 && i <= 4 ? 1.0 : 0.0)];
            p.pelvis_R = Rx(deg(pp));
            if (ank[2] > 0.5) p.leg_ik('R', [ank[0], ank[1], ANKLE_H + ank[2]], [0.2, 1.0, 0.6], footRot(-10, fp));
            else placeFoot(p, 'R', ank, -22);
            guard(p, -10);
            p.chest_R = mm3(Rz(deg(-10)), Rx(deg(lean)));
            p.head_R = mm3(Rz(deg(7)), Rx(deg(HEAD_TILT - 6 - lean * 0.5)));
            const c = chestOrg(p);
            p.arm_ik('L', V.add(c, [-7.0, 12.0, 11.0 - lean * 0.2]), [-1.0, -0.3, -0.9]);
            p.arm_ik('R', V.add(c, [8.5, 6.0 - lean * 0.3, 9.0]), [1.0, -0.3, -0.9]);
            return p;
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
            p.pelvis_t = [0, 0, -0.5 + 0.3 * cos(TAU * t)];
            standLegs(p);
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
            const t = i / n, c = cos(TAU * t), p = base();
            p.pelvis_t = [0, 0, -1.6 - 0.9 * cos(2 * TAU * t)];
            gait(p, t, { stride: 7.8, lift: 3.6, width: 9.6 });
            walkUpper(p, t, false);
            p.arm_fk('L', { flex: 24 * c + 3, abd: 11, elbow: 14 + 14 * max(0.0, c) });
            batHoldShoulder(p);
            out.push(p);
        }
        return out;
    }
    function batRun(n = 8) {                                                                                         // NOVO
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, p = base(), c = runLegs(p, t);
            p.arm_fk('L', { flex: 42 * c + 10, abd: 14, elbow: 78 + 18 * max(0.0, -c) });
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
    function knifeIdle() {
        return idle().map((p, i) => { const c = chestOrg(p), s = sin(TAU * i / 6); p.arm_ik('R', V.add(c, [11.0, 8.0, -2.5 + 0.4 * s]), [1.0, -0.4, -0.7]); knifeInHand(p); return p; });
    }
    function knifeWalk() {
        return walk().map((p, i) => { const c = chestOrg(p), s = sin(TAU * i / 8); p.arm_ik('R', V.add(c, [11.0, 7.5 + 2.5 * s, -3.0]), [1.0, -0.4, -0.7]); knifeInHand(p); return p; });
    }
    function knifeRun() {
        return run().map((p, i) => { const c = chestOrg(p), s = sin(TAU * i / 8); p.arm_ik('R', V.add(c, [9.0, 8.0 + 4.0 * s, 1.0]), [1.0, -0.5, -0.6]); knifeInHand(p); return p; });
    }
    function knifeStab() {
        // [giro do peito, mão (relativa ao peito), direção da lâmina, inclinação, passo]
        const seq = [[-8, [9.0, 4.0, -1.0], [0.1, 1.0, 0.25], 0, 0], [-22, [11.5, -4.0, 0.5], [0.15, 1.0, 0.3], -4, 0], [-6, [7.5, 12.0, 3.0], [0.0, 1.0, 0.1], 8, 3],
            [6, [3.0, 23.0, 5.0], [-0.05, 1.0, 0.05], 16, 6], [8, [2.5, 24.5, 5.0], [-0.05, 1.0, 0.05], 18, 6], [-4, [7.0, 13.0, 2.0], [0.05, 1.0, 0.2], 8, 3], [-8, [9.0, 4.5, -1.0], [0.1, 1.0, 0.25], 0, 0]];
        return seq.map(([cy, off, bd, lean, step], i) => {
            const p = base();
            fightStance(p, 2.0);
            if (step) placeFoot(p, 'L', [-11.0, 4.0 + step, 0], 14);
            p.chest_R = mm3(Rz(deg(cy)), Rx(deg(lean)));
            p.head_R = mm3(Rz(deg(-cy * 0.5)), Rx(deg(HEAD_TILT - 4 - lean * 0.4)));
            const c = chestOrg(p), grip = V.add(c, off), d = nrm(bd);
            placeProp(p, 'knife', grip, d);
            p.arm_ik('R', grip, [1.0, -0.4, -0.8]);
            p.arm_ik('L', V.add(c, [-8.5, 8.0, 7.0]), [-1.0, -0.3, -0.9]);
            if (i === 3) p.effects.push({ type: 'trail', pts: [0, 0.25, 0.5, 0.75, 1].map((s) => V.add(V.add(c, V.lerp(seq[2][1], off, s)), V.mul(d, 9.0))) });
            return p;
        });
    }
    function knifeHoldup(n = 4) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, s = sin(TAU * t), p = base();
            p.pelvis_t = [0, 1.0, -1.4];
            standLegs(p, 12.0, [-2.0, 4.0]);
            p.chest_R = Rz(deg(-10));
            p.head_R = mm3(Rz(deg(-6 + 4 * s)), Rx(deg(HEAD_TILT - 6)));
            const c = chestOrg(p), grip = V.add(c, [5.0, 19.0 + 1.5 * s, 6.0 + 0.6 * s]);
            placeProp(p, 'knife', grip, nrm([-0.1, 1.0, 0.12]));
            p.arm_ik('R', grip, [1.0, -0.4, -0.8]);
            p.arm_ik('L', V.add(c, [-8.0, 20.0 + 2 * s, 8.0 + 3 * s]), [-1.0, -0.3, -0.8]);
            out.push(p);
        }
        return out;
    }
    // Golpe de taco (duas mãos) ou de cassetete (prop = 'baton': uma mão, a outra na guarda).
    function batSwing(prop = 'bat') {
        const seq = [[-28, [11.0, 2.0, 12.0], [0.30, -0.45, 0.85], -8], [-48, [12.0, -3.0, 13.0], [0.25, -0.85, 0.45], -14], [-12, [12.0, 9.0, 8.0], [0.95, 0.25, 0.15], -4],
            [16, [3.0, 18.0, 6.5], [0.15, 1.0, 0.06], 8], [42, [-10.0, 13.0, 7.5], [-0.95, 0.35, 0.1], 16], [46, [-11.5, 5.0, 11.0], [-0.65, -0.45, 0.6], 18], [-10, [10.0, 6.0, 10.0], [0.35, -0.3, 0.88], -2]];
        return seq.map(([cy, off, bd, py], i) => {
            const p = base();
            fightStance(p, 2.0);
            p.pelvis_R = Rz(deg(py));
            p.chest_R = mm3(Rz(deg(cy)), Rx(deg(-3)));
            p.head_R = mm3(Rz(deg(-cy * 0.6)), Rx(deg(HEAD_TILT - 5)));
            const c = chestOrg(p), grip = V.add(c, off), d = nrm(bd);
            const Mp = placeProp(p, prop, grip, d);
            p.arm_ik('R', grip, [1.0, -0.4, -0.8]);
            if (prop === 'bat') p.arm_ik('L', propPt(Mp, [0, -3.9, 0]), [-1.0, -0.4, -0.8]);
            else p.arm_ik('L', V.add(c, [-9.0, 9.0, 9.0]), [-1.0, -0.3, -0.9]);
            if (i === 3 || i === 4) {
                const pts = [];
                for (let k = 0; k < 7; k++) {
                    const s = k / 6.0, [, off0, bd0] = seq[i - 1];
                    pts.push(V.add(V.add(c, V.lerp(off0, off, s)), V.mul(nrm(V.lerp(bd0, bd, s)), 24.0)));
                }
                p.effects.push({ type: 'trail', pts });
            }
            return p;
        });
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
    // mirando (enquanto a força carrega) → arremessar. Todos na mesma base: pé direito atrás, esquerdo à frente, tronco girando.
    // Pose de arremesso: giro (cy) e inclinação (cp) do tronco, alvos das mãos (rf, lf) em relação ao peito.
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
    const HOLD = { cy: -38, cp: 10, rf: [15.0, -11.0, 24.0], lf: [-6.0, 20.0, 14.0] };      // braço armado atrás, o esquerdo apontando o alvo
    function grenadeInHand(p) {
        const B = p.bones(), fist = p.fist_world(B, 'R'), hR = B.hand_R.R;
        p.props.push(['grenade', M4(hR, V.add(fist, mv3(hR, [0, 3.4, -0.5])))]);
    }
    // Garrafa na mão direita; `fwd` = para onde aponta o gargalo. Devolve o ponto do pano (onde fica o fogo).
    function molotovInHand(p, fwd) {
        const B = p.bones(), fist = p.fist_world(B, 'R');
        const Mp = placeProp(p, 'molotov', fist, nrm(fwd), Math.abs(fwd[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1]);
        return propPt(Mp, [0, 12.6, 0]);
    }
    function ragFire(p, pos, i, k = 1) {                                     // fogo no pano: língua (clarão para cima) que tremula
        p.effects.push({ type: 'flash', pos, dir: [0.15 * sin(i * 2.1), -0.25, 1.0], size: (0.6 + 0.18 * abs(sin(i * 1.7))) * k, variant: i % 2 });
    }
    // Pegar a granada e PUXAR O PINO: traz a granada ao peito, a mão esquerda engancha o anel e puxa para fora (o pino sai junto) e
    // larga; o corpo já gira para a posição de arremesso (termina no 1º quadro do grenade_hold).
    function grenadePin(n = 10) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const s = i / (n - 1), p = base();
            const cy = keys([[0, -2], [0.55, -10], [1, HOLD.cy]], s), cp = keys([[0, -4], [0.55, -2], [1, HOLD.cp]], s);
            const rf = keysN([[0, [6.0, 12.0, 12.0]], [0.55, [6.0, 13.0, 14.0]], [1, HOLD.rf]], s);
            const lf = keysN([[0, [-6.0, 11.0, 8.0]], [0.3, [3.5, 13.5, 18.0]], [0.42, [3.5, 13.5, 18.0]], [0.68, [-17.0, 10.0, 16.0]], [1, HOLD.lf]], s);
            throwPose(p, cy, cp, rf, lf);
            grenadeInHand(p);
            if (s >= 0.34 && s <= 0.85) {                                   // o pino na mão esquerda (depois é largado)
                const B = p.bones(), fl = p.fist_world(B, 'L');
                p.props.push(['pin', M4(Rx(deg(90 * s)), V.add(fl, [0.8, 0.8, 1.0]))]);
            }
            out.push(p);
        }
        return out;
    }
    // Segurando (granada armada / molotov aceso) enquanto mira e carrega a força: o braço vai um pouco mais para trás e volta,
    // respirando — o esquerdo aponta o alvo.
    function holdLoop(n, prop) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, s_ = sin(TAU * t), c = cos(TAU * t), p = base();
            throwPose(p, HOLD.cy - 2 * s_, HOLD.cp + 1.2 * c, V.add(HOLD.rf, [0.4 * s_, -0.8 * s_, 0.6 * c]), V.add(HOLD.lf, [0, 0.6 * c, 0.5 * s_]));
            if (prop === 'grenade') grenadeInHand(p);
            else ragFire(p, molotovInHand(p, [0.1, -0.55, 0.85]), i);
            out.push(p);
        }
        return out;
    }
    // ACENDER O MOLOTOV: garrafa em pé na frente do peito, o isqueiro sobe até o pano, acende (chama pequena do isqueiro → o pano
    // pega fogo e cresce) e o corpo gira para a posição de arremesso (termina no 1º quadro do molotov_hold).
    function molotovLight(n = 12) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const s = i / (n - 1), p = base();
            const cy = keys([[0, -4], [0.7, -8], [1, HOLD.cy]], s), cp = keys([[0, -2], [0.7, 0], [1, HOLD.cp]], s);
            const rf = keysN([[0, [7.0, 12.0, 9.0]], [0.7, [7.0, 12.5, 10.0]], [1, HOLD.rf]], s);
            throwPose(p, cy, cp, rf, HOLD.lf);                               // (a mão esquerda é refeita abaixo, depois da garrafa)
            const fwd = keysN([[0, [0.0, 0.15, 1.0]], [0.7, [0.0, 0.2, 1.0]], [1, [0.1, -0.55, 0.85]]], s);
            const rag = molotovInHand(p, fwd);
            const c = chestOrg(p), lit = rag.slice();
            const lf = keysN([[0, [-8.0, 9.0, 4.0]], [0.28, V.sub(V.add(lit, [-1.2, 0.6, -3.2]), c)], [0.62, V.sub(V.add(lit, [-1.2, 0.6, -3.2]), c)], [0.82, [-10.0, 10.0, 8.0]], [1, HOLD.lf]], s);
            p.arm_ik('L', V.add(c, lf), [-1.0, -0.2, -0.8]);
            if (s < 0.85) { const B = p.bones(), fl = p.fist_world(B, 'L'); placeProp(p, 'lighter', V.add(fl, [0, 0.3, 0.6]), [0, 1, 0]); }
            if (s >= 0.3 && s <= 0.62) p.effects.push({ type: 'flash', pos: V.add(rag, [-0.9, 0.4, -1.2]), dir: [0, 0, 1], size: 0.22, variant: i % 2 });   // chama do isqueiro
            if (s >= 0.45) ragFire(p, rag, i, keys([[0.45, 0.45], [0.7, 1.0], [1, 1.0]], s));                                                         // o pano pegando fogo
            out.push(p);
        }
        return out;
    }
    // ARREMESSO (granada ou molotov): do braço armado, o tronco gira, o braço passa por cima do ombro e solta à frente (o objeto
    // sai voando no 3º quadro — o jogo cria o projétil nesse instante: Throwables.RELEASE) e acompanha o movimento até voltar.
    function throwRelease(prop) {
        const seq = [[HOLD.cy, HOLD.cp, HOLD.rf, HOLD.lf, 'hand', 0], [-10, 4, [13.0, 0.0, 28.0], [-10.0, 12.0, 9.0], 'hand', 3],
            [18, -8, [7.0, 18.0, 22.0], [-12.0, 5.0, 5.0], 'fly', 5], [32, -12, [2.0, 22.0, 12.0], [-13.0, 1.0, 4.0], null, 6],
            [34, -10, [-4.0, 16.0, 0.0], [-13.0, 0.0, 4.0], null, 6], [16, -6, [5.0, 10.0, -2.0], [-11.0, 3.0, 2.0], null, 3], [4, -3, [9.0, 5.0, -4.0], [-10.0, 4.0, 0.0], null, 0]];
        return seq.map(([cy, cp, rf, lf, held, step], i) => {
            const p = base();
            const c = throwPose(p, cy, cp, rf, lf, step);
            if (held === 'hand') { if (prop === 'grenade') grenadeInHand(p); else ragFire(p, molotovInHand(p, i === 0 ? [0.1, -0.55, 0.85] : [0.2, 0.3, 0.9]), i); }
            else if (held === 'fly') {
                const at = V.add(c, [3.0, 36.0, 26.0]);
                if (prop === 'grenade') p.props.push(['grenade', M4(Rx(deg(40)), at), 'chest']);
                else { const Mp = placeProp(p, 'molotov', at, nrm([0.1, 0.8, 0.5])); ragFire(p, propPt(Mp, [0, 12.6, 0]), i); }
            }
            return p;
        });
    }

    // ------------------------------------------------------------------ ACADEMIA (minigames/Gym.js): cada clipe é UMA repetição
    // (0 = posição inicial, meio = o ponto de esforço, fim = de volta). O jogador controla o quadro pelo mini-game; os frequentadores
    // repetem em loop. A "arma" do clipe é a faixa de peso (w1 leve · w2 médio · w3 pesado): muda as anilhas desenhadas.
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
    // devagar (a descida é mais lenta que a subida). No topo, o tronco "rouba" um pouco para trás.
    function gymCurl(w, n = 12) {
        const out = [], tier = gymTier(w);
        for (let i = 0; i < n; i++) {
            const t = i / n, u = t < 0.42 ? ease(t / 0.42) : 1 - ease((t - 0.42) / 0.58);       // sobe em 42% do ciclo, desce no resto
            const p = base();
            p.pelvis_t = [0, 0, -0.4];
            standLegs(p, 13.6, [0.6, 0.6]);
            p.chest_R = Rx(deg(-2 - 5 * u));
            p.head_R = Rx(deg(HEAD_TILT - 3 * u));
            for (const sd of ['R', 'L']) p.arm_fk(sd, { flex: 4 + 18 * u, abd: 9, elbow: 12 + 128 * u, twist: 90 });
            barInHands(p, 'curlbar_' + tier);
            out.push(p);
        }
        return out;
    }
    // Supino: deitado no banco (cabeça para +y, junto ao suporte), pés no chão dos lados; a barra desce até o peito e sobe até os
    // braços esticarem. A barra é colocada pelas mãos (o banco e o suporte vêm no clipe).
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
            for (const [sd, s] of [['R', 1], ['L', -1]]) p.arm_ik(sd, V.add(co, [s * 15.0, 9.0, 8.0 + 24.0 * u]), [s * 1.0, -0.4, -0.3]);
            barInHands(p, 'barbell_' + tier);
            p.props.push(['gym_bench', M4(I3(), [0, co[1] - 4.0, 0])]);
            out.push(p);
        }
        return out;
    }
    // Agachamento: barra nas costas (sobre o trapézio), pegada larga; desce até as coxas ficarem paralelas ao chão, o tronco inclina
    // para a frente na descida e sobe empurrando. A gaiola fica em volta (os postes dos lados).
    function gymSquat(w, n = 12) {
        const out = [], tier = gymTier(w);
        for (let i = 0; i < n; i++) {
            const t = i / n, u = t < 0.55 ? ease(t / 0.55) : 1 - ease((t - 0.55) / 0.45);       // 0 = de pé, 1 = embaixo (desce devagar)
            const p = base();
            p.pelvis_t = [0, -6.0 * u, -0.5 - 15.5 * u];
            standLegs(p, 15.0, [1.5, 1.5], 22);
            p.pelvis_R = Rx(deg(14 * u));
            p.chest_R = Rx(deg(22 * u));
            p.head_R = Rx(deg(HEAD_TILT - 20 * u));
            const co = chestOrg(p);
            for (const [sd, s] of [['R', 1], ['L', -1]]) p.arm_ik(sd, V.add(co, mv3(Rx(deg(36 * u)), [s * 21.0, -4.5, 20.5])), [s * 1.0, -0.2, -1.0]);
            barInHands(p, 'barbell_' + tier);
            p.props.push(['gym_rack', M4(I3(), [0, 0, 0])]);
            out.push(p);
        }
        return out;
    }

    // ------------------------------------------------------------------ reações
    function hurt() {
        const seq = [[12, 16, 14, [0, -1.0, -0.4]], [18, 24, 22, [0, -2.0, -1.0]], [8, 10, 12, [0, -1.0, -0.6]], [2, 2, 4, [0, -0.2, 0]]];
        return seq.map(([pp, hp, arm, off], i) => {
            const p = base();
            p.pelvis_t = off.slice();
            p.pelvis_R = Rx(deg(pp * 0.4));
            p.chest_R = Rx(deg(pp * 0.6));
            p.head_R = mm3(Rz(deg(-hp * 0.4)), Rx(deg(HEAD_TILT + hp)));
            standLegs(p, 12.0, [-1.5 * (i < 3 ? 1 : 0), 1.0]);
            p.arm_fk('R', { flex: 8 + arm, abd: 12 + arm * 1.1, elbow: 18 + arm });
            p.arm_fk('L', { flex: 8 + arm * 0.6, abd: 12 + arm, elbow: 18 + arm * 1.2 });
            return p;
        });
    }
    function lying(p, arms = 'spread', headYaw = 0.0) {
        p.pelvis_t = [0, -3.0, 10.0 - SKEL.pelvis[1][2]];
        p.pelvis_R = Rx(deg(90));
        p.chest_R = Rx(deg(-6));
        p.head_R = mm3(Rz(deg(headYaw)), Rx(deg(-14)));
        p.leg_fk('R', { flex: -10, abd: 10, knee: 6, foot: -8 });
        p.leg_fk('L', { flex: -10, abd: 10, knee: 6, foot: -8 });
        if (arms === 'spread') { p.arm_fk('R', { flex: -12, abd: 62, elbow: 22 }); p.arm_fk('L', { flex: -12, abd: 58, elbow: 28 }); }
        else { p.arm_fk('R', { flex: -8, abd: 20, elbow: 12 }); p.arm_fk('L', { flex: -8, abd: 20, elbow: 12 }); }
    }
    function death(blood = false) {
        const out = [];
        let p = base();
        p.pelvis_t = [0, -1.0, -0.6]; p.pelvis_R = Rx(deg(8)); p.chest_R = Rx(deg(10)); p.head_R = Rx(deg(HEAD_TILT + 24));
        standLegs(p, 12.0, [1.0, 1.0]);
        p.arm_fk('R', { flex: -15, abd: 40, elbow: 30 }); p.arm_fk('L', { flex: -10, abd: 44, elbow: 34 });
        out.push(p);
        p = base();
        p.pelvis_t = [0, -2.0, -6.5]; p.pelvis_R = Rx(deg(22)); p.chest_R = Rx(deg(10)); p.head_R = Rx(deg(HEAD_TILT + 20));
        placeFoot(p, 'R', [12.0, 2.0, 0], -12, 0, [0.3, 1, 0]); placeFoot(p, 'L', [-12.0, 2.0, 0], 12, 0, [-0.3, 1, 0]);
        p.arm_fk('R', { flex: 35, abd: 48, elbow: 40 }); p.arm_fk('L', { flex: 40, abd: 50, elbow: 44 });
        out.push(p);
        p = base();
        p.pelvis_t = [0, -3.5, -13.5]; p.pelvis_R = Rx(deg(46)); p.chest_R = Rx(deg(6)); p.head_R = Rx(deg(HEAD_TILT + 10));
        placeFoot(p, 'R', [12.0, 5.0, 0.5], -12, 10, [0.3, 1, 0.3]); placeFoot(p, 'L', [-12.0, 5.5, 0.5], 12, 10, [-0.3, 1, 0.3]);
        p.arm_fk('R', { flex: 70, abd: 50, elbow: 40 }); p.arm_fk('L', { flex: 75, abd: 52, elbow: 44 });
        out.push(p);
        p = base();
        p.pelvis_t = [0, -3.5, -19.0]; p.pelvis_R = Rx(deg(70)); p.chest_R = Rx(deg(2)); p.head_R = Rx(deg(0));
        p.leg_fk('R', { flex: 40, abd: 10, knee: 50, foot: 10 }); p.leg_fk('L', { flex: 46, abd: 10, knee: 56, foot: 10 });
        p.arm_fk('R', { flex: 95, abd: 55, elbow: 30 }); p.arm_fk('L', { flex: 100, abd: 55, elbow: 34 });
        out.push(p);
        p = base(); lying(p);
        p.pelvis_t = V.add(p.pelvis_t, [0, 0, 0.4]);
        p.leg_fk('R', { flex: 28, abd: 12, knee: 34, foot: 10 }); p.leg_fk('L', { flex: 34, abd: 12, knee: 40, foot: 10 });
        p.arm_fk('R', { flex: 110, abd: 50, elbow: 30 }); p.arm_fk('L', { flex: 105, abd: 52, elbow: 34 });
        p.head_R = Rx(deg(-24));
        out.push(p);
        p = base(); lying(p);
        p.pelvis_t = V.add(p.pelvis_t, [0, 0, 1.4]); p.pelvis_R = Rx(deg(86));
        p.leg_fk('R', { flex: 10, abd: 12, knee: 20, foot: 0 }); p.leg_fk('L', { flex: 14, abd: 12, knee: 24, foot: 0 });
        p.arm_fk('R', { flex: 40, abd: 60, elbow: 28 }); p.arm_fk('L', { flex: 36, abd: 60, elbow: 30 });
        out.push(p);
        p = base(); lying(p, 'spread', 10); out.push(p);
        p = base(); lying(p, 'spread', 28); out.push(p);
        if (blood) {                                                                                                   // NOVO: poça de sangue se espalhando
            out[6].props.push(['blood', M4(mm3(Rz(deg(20)), [0.7, 0, 0, 0, 0.7, 0, 0, 0, 1]), [3.0, -14.0, 0.5]), 'ground']);
            out[7].props.push(['blood', M4(Rz(deg(20)), [3.0, -14.0, 0.5]), 'ground']);
        }
        return out;
    }
    function getUp() {
        const out = [];
        let p = base(); lying(p, 'side'); out.push(p);
        p = base(); lying(p, 'side');
        p.pelvis_t = [0, -2.5, 10.0 - SKEL.pelvis[1][2]]; p.chest_R = Rx(deg(-38)); p.head_R = Rx(deg(-10));
        p.leg_fk('R', { flex: 8, abd: 10, knee: 40 }); p.leg_fk('L', { flex: 10, abd: 10, knee: 44 });
        p.arm_fk('R', { flex: -30, abd: 26, elbow: 20 }); p.arm_fk('L', { flex: -30, abd: 26, elbow: 20 });
        out.push(p);
        p = base();
        p.pelvis_t = [0, -2.0, 9.5 - SKEL.pelvis[1][2]]; p.pelvis_R = Rx(deg(42)); p.chest_R = Rx(deg(-24)); p.head_R = Rx(deg(HEAD_TILT - 10));
        placeFoot(p, 'R', [11.0, 6.0, 0], -10, 0, [0.3, 1, 0.8]); placeFoot(p, 'L', [-11.0, 6.5, 0], 10, 0, [-0.3, 1, 0.8]);
        p.arm_fk('R', { flex: -28, abd: 22, elbow: 8 }); p.arm_fk('L', { flex: -28, abd: 22, elbow: 8 });
        out.push(p);
        p = base();
        p.pelvis_t = [0, -1.0, -15.5]; p.pelvis_R = Rx(deg(-14)); p.chest_R = Rx(deg(-22)); p.head_R = Rx(deg(HEAD_TILT + 18));
        placeFoot(p, 'R', [11.0, 4.0, 0], -10, 0, [0.3, 1, 0]); placeFoot(p, 'L', [-11.0, 4.5, 0], 10, 0, [-0.3, 1, 0]);
        p.arm_fk('R', { flex: 40, abd: 20, elbow: 50 }); p.arm_fk('L', { flex: 40, abd: 20, elbow: 50 });
        out.push(p);
        p = base();
        p.pelvis_t = [0, -1.5, -9.0]; p.pelvis_R = Rx(deg(-10)); p.chest_R = Rx(deg(-14)); p.head_R = Rx(deg(HEAD_TILT + 10));
        placeFoot(p, 'R', [11.5, 2.0, 0], -12); placeFoot(p, 'L', [-11.5, 2.5, 0], 12);
        p.arm_fk('R', { flex: 22, abd: 16, elbow: 36 }); p.arm_fk('L', { flex: 22, abd: 16, elbow: 36 });
        out.push(p);
        p = base();
        p.pelvis_t = [0, -0.5, -3.5]; p.pelvis_R = Rx(deg(-4)); p.chest_R = Rx(deg(-5)); p.head_R = Rx(deg(HEAD_TILT + 4));
        standLegs(p, 12.2, [1.0, 1.2]);
        p.arm_fk('R', { flex: 8, abd: 14, elbow: 20 }); p.arm_fk('L', { flex: 8, abd: 14, elbow: 20 });
        out.push(p);
        out.push(idle()[0]);
        return out;
    }
    // Mãos ao alto (o original): erguer os braços em 5 quadros.
    function handsUp(n = 5) {
        const out = [], restR = [19.5, 3.0, 24.0];
        const way = [[0.0, restR], [0.35, [22.0, 9.0, 40.0]], [0.7, [19.0, 7.0, 60.0]], [1.0, [15.0, 3.0, 70.0]]];
        for (let i = 0; i < n; i++) {
            const s = i / (n - 1), p = base();
            standLegs(p);
            const tR = keys(way, s), tL = V.mulv(tR, [-1, 1, 1]);
            if (s < 0.05) { p.arm_fk('R', { flex: 4, abd: 12, elbow: 14 }); p.arm_fk('L', { flex: 4, abd: 12, elbow: 14 }); }
            else { p.arm_ik('R', tR, [1.0, -0.3, -0.5 + 0.4 * s]); p.arm_ik('L', tL, [-1.0, -0.3, -0.5 + 0.4 * s]); }
            p.head_R = Rx(deg(HEAD_TILT - 4 * s));
            out.push(p);
        }
        return out;
    }
    // NOVO: ajoelhado com as mãos atrás da cabeça (k: 0 = em pé, 1 = ajoelhado).
    function kneelPose(k) {
        const p = base();
        const drop = 15.5 * ease(k);
        p.pelvis_t = [0, -2.0 * k, -drop];
        p.pelvis_R = Rx(deg(-4 * k));
        p.chest_R = Rx(deg(6 * k));
        p.head_R = Rx(deg(HEAD_TILT - 8 * k));
        // joelhos no chão (pé esticado atrás) conforme desce
        for (const [sd, s] of [['R', 1], ['L', -1]]) {
            const knee = [s * 11.0, 2.0 + 4.0 * k, ANKLE_H + 11.4 * (1 - ease(k))];
            if (k < 0.05) placeFoot(p, sd, [s * 12.8, 0.4, 0], -s * 12);
            else p.leg_ik(sd, V.lerp([s * 12.8, 0.4, ANKLE_H], [s * 11.0, -9.0, 4.2], ease(k)), [0.12 * s, 1.0, -0.2], footRot(-s * 10, 60 * ease(k)));
            void knee;
        }
        const c = chestOrg(p);
        p.arm_ik('R', V.add(c, [6.5, -4.0, 30.0]), [1.0, 0.6, 0.2]);
        p.arm_ik('L', V.add(c, [-6.5, -4.0, 30.0]), [-1.0, 0.6, 0.2]);
        return p;
    }
    // NOVO: render-se — mãos ao alto, depois ajoelha com as mãos atrás da cabeça (a pose final é `kneel`).
    function surrenderKneel() {
        const up = handsUp(5).slice(0, 4);
        const out = up.slice();
        for (const k of [0.35, 0.7, 1.0, 1.0]) out.push(kneelPose(k));
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
            const c = chestOrg(p), s = sin(TAU * t * 2);
            p.arm_ik('R', V.add(c, [17.0 + 2 * s, 4.0, 40.0 + 4 * s]), [1.0, -0.2, -0.3]);
            p.arm_ik('L', V.add(c, [-17.0 + 2 * s, 4.0, 40.0 - 4 * s]), [-1.0, -0.2, -0.3]);
            out.push(p);
        }
        return out;
    }
    // NOVO: arremessado no ar (explosão, atropelamento): corpo inclinado, braços e pernas se debatendo.
    function flail(n = 4) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, s = sin(TAU * t), c = cos(TAU * t), p = base();
            p.pelvis_t = [0, 0, 8.0 + 2.0 * s];
            p.root = Rx(deg(-35 + 8 * s));
            p.chest_R = Rx(deg(-10));
            p.head_R = Rx(deg(HEAD_TILT - 20));
            p.arm_fk('R', { flex: 120 + 40 * s, abd: 55 + 15 * c, elbow: 30 + 20 * c });
            p.arm_fk('L', { flex: 120 - 40 * s, abd: 55 - 15 * c, elbow: 30 - 20 * c });
            p.leg_fk('R', { flex: 25 + 25 * s, abd: 18, knee: 35 + 25 * c });
            p.leg_fk('L', { flex: 25 - 25 * s, abd: 18, knee: 35 - 25 * c });
            p.shadowScale = 0.75;
            out.push(p);
        }
        return out;
    }
    // NOVO: cambalhota — encolhido, o corpo gira uma volta inteira para a frente.
    function tumble(n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, p = base(), a = 360 * t;
            p.pelvis_t = [0, 6.0 * t, -11.0 + 4.0 * sin(PI * t)];
            p.root = Rx(deg(a));
            p.chest_R = Rx(deg(30));
            p.head_R = Rx(deg(30));
            p.leg_fk('R', { flex: 100, abd: 12, knee: 120, foot: -20 });
            p.leg_fk('L', { flex: 100, abd: 12, knee: 120, foot: -20 });
            p.arm_fk('R', { flex: 70, abd: 20, elbow: 90 });
            p.arm_fk('L', { flex: 70, abd: 20, elbow: 90 });
            out.push(p);
        }
        return out;
    }
    // NOVO: deitado, vivo (o primeiro quadro do levantar).
    const lie = () => [getUp()[0]];

    // ------------------------------------------------------------------ tático (jogador)
    // Tronco inclinado para a frente com a torção da arma (se houver): agachado e andando agachado.
    function leanFor(p, name, lean) {
        const h = WEAPON_HOLD[name];
        p.chest_R = mm3(Rz(deg(h ? h.chest_yaw : 0)), Rx(deg(lean)));
        p.head_R = mm3(Rz(deg(h ? h.head_yaw : 0)), Rx(deg(HEAD_TILT - lean * 0.7)));
        return h;
    }
    // NOVO: agachado (atrás de uma cobertura / furtivo) — joelhos bem dobrados, pé esquerdo à frente, tronco inclinado. Com arma de
    // fogo ela fica erguida, pronta (é só levantar e atirar); sem arma, os antebraços à frente. Respira devagar.
    function crouchIdle(name, n = 4) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, b = sin(TAU * t), p = base();
            standLegs(p, 13.5, [-4.5, 5.5], 18, 13.5 + 0.35 * b);
            p.pelvis_t = V.add(p.pelvis_t, [0, -2.0, 0]);
            p.pelvis_R = Rx(deg(-8));
            const h = leanFor(p, name, 22 + 1.2 * b);
            if (h) holdWeapon(p, name, { keepChest: true, bob: [0, 0, 0.25 * b] });
            else {
                p.arm_fk('R', { flex: 40 + 2 * b, abd: 16, elbow: 72 });
                p.arm_fk('L', { flex: 34 + 2 * b, abd: 18, elbow: 66 });
            }
            out.push(p);
        }
        return out;
    }
    // NOVO: andar agachado (furtivo) — passos curtos e baixos, joelhos dobrados, tronco inclinado, pés rolando devagar.
    // Passada 0,72 da do andar (o jogo corrige o ritmo).
    function sneakWalk(name, n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, c = cos(TAU * t), p = base();
            p.pelvis_t = [0, 0.5, -7.5 - 0.6 * cos(2 * TAU * t)];
            gait(p, t, { stride: 5.6, lift: 2.6, width: 10.6, heel: 6, toeoff: -18 });
            p.pelvis_R = mm3(Rz(deg(3 * c)), Rx(deg(-6)));
            const h = leanFor(p, name, 16);
            if (h) holdWeapon(p, name, { keepChest: true, bob: [0, 0, 0.4 * cos(2 * TAU * t)] });
            else {
                p.arm_fk('R', { flex: 34 - 8 * c, abd: 16, elbow: 74 });
                p.arm_fk('L', { flex: 34 + 8 * c, abd: 18, elbow: 70 });
            }
            out.push(p);
        }
        return out;
    }
    // Pernas do PASSO LATERAL: cada pé desliza de lado no apoio e é levado para o outro lado no ar, sem cruzar (t = 0: pé direito
    // pousando por fora). O corpo anda para a DIREITA (+x); tocado ao contrário, para a esquerda.
    function sideGait(p, t, { step = 4.2, lift = 3.0, width = 10.4, stance = 0.5 } = {}) {
        step *= STRIDE_K();
        for (const [side, s, ph0] of [['R', 1, t], ['L', -1, t + 0.5]]) {
            const ph = ph0 % 1.0;
            let x, z;
            if (ph < stance) { const u = ph / stance; x = step * (1 - 2 * u); z = 0.0; }
            else { const u = (ph - stance) / (1 - stance); x = -step + 2 * step * ease(u); z = lift * sin(PI * u); }
            placeFoot(p, side, [s * width + x, s * 0.6, z], -s * 10, 0);
        }
    }
    // NOVO: andando de lado MIRANDO (strafe): passo lateral com a arma apontada. Para a frente/para trás mirando, o jogo usa o
    // andar armado (walk:arma), normal ou ao contrário.
    function strafeWalk(name, n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, p = base();
            p.pelvis_t = [0, 0, -1.8 - 0.8 * cos(2 * TAU * t)];
            p.pelvis_R = Ry(deg(2.5 * sin(TAU * t)));
            sideGait(p, t);
            holdWeapon(p, name);
            out.push(p);
        }
        return out;
    }
    // NOVO: rolamento de ESQUIVA — abaixa, mergulha encolhido dando uma volta inteira para a frente e levanta já de pé.
    function dodgeRoll(n = 10) {
        const out = [];
        const tuck = (p) => {
            p.leg_fk('R', { flex: 100, abd: 12, knee: 120, foot: -20 });
            p.leg_fk('L', { flex: 100, abd: 12, knee: 120, foot: -20 });
            p.arm_fk('R', { flex: 70, abd: 20, elbow: 90 });
            p.arm_fk('L', { flex: 70, abd: 20, elbow: 90 });
        };
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1), p = base();
            if (t < 0.15) {                                            // abaixando, tronco indo à frente
                const k = ease(t / 0.15);
                standLegs(p, 12.0, [-2.0 - 3.0 * k, 3.0 + 3.0 * k], 14, 10.0 * k);
                p.chest_R = Rx(deg(38 * k)); p.head_R = Rx(deg(HEAD_TILT + 12 * k));
                p.arm_fk('R', { flex: 20 + 50 * k, abd: 16, elbow: 30 + 60 * k });
                p.arm_fk('L', { flex: 20 + 50 * k, abd: 16, elbow: 30 + 60 * k });
            } else if (t < 0.8) {                                      // encolhido, girando uma volta inteira
                const u = (t - 0.15) / 0.65;
                p.pelvis_t = [0, 0, -11.0 + 4.0 * sin(PI * u)];
                p.root = Rx(deg(-360 * u));                            // (Rx negativo: a cabeça vai para a FRENTE)
                p.chest_R = Rx(deg(30)); p.head_R = Rx(deg(30));
                tuck(p);
                p.shadowScale = 0.85;
            } else {                                                   // levantando
                const k = ease((t - 0.8) / 0.2);
                standLegs(p, 12.4, [-3.0 * (1 - k) + 0.4 * k, 4.0 * (1 - k) + 0.4 * k], 14 - 2 * k, 10.0 * (1 - k));
                p.chest_R = Rx(deg(28 * (1 - k))); p.head_R = Rx(deg(HEAD_TILT + 8 * (1 - k)));
                p.arm_fk('R', { flex: 60 * (1 - k) + 4 * k, abd: 14, elbow: 80 * (1 - k) + 14 * k });
                p.arm_fk('L', { flex: 60 * (1 - k) + 4 * k, abd: 14, elbow: 80 * (1 - k) + 14 * k });
            }
            out.push(p);
        }
        return out;
    }

    // NOVO: pular uma grade/muro — agacha, apoia as mãos, passa as pernas de lado por cima e cai.
    function vault() {
        const seq = [
            { pz: -6.0, py: 0, lean: 10, hands: [[9, 16, -14], [-9, 16, -14]], legs: 'plant', rot: 0 },
            { pz: 2.0, py: 4, lean: 26, hands: [[9, 18, -22], [-9, 18, -22]], legs: 'tuck', rot: 0 },
            { pz: 12.0, py: 9, lean: 30, hands: [[9, 12, -30], [-6, 12, -30]], legs: 'side', rot: 25 },
            { pz: 10.0, py: 14, lean: 20, hands: [[16, 6, -12], [-6, 8, -28]], legs: 'side2', rot: 20 },
            { pz: 0.0, py: 16, lean: 8, hands: [[14, 10, 0], [-14, 10, 0]], legs: 'land', rot: 0 },
            { pz: -4.0, py: 16, lean: 4, hands: [[13, 4, -2], [-13, 4, -2]], legs: 'plant', rot: 0 },
        ];
        return seq.map((s) => {
            const p = base();
            p.pelvis_t = [0, s.py, s.pz];
            p.pelvis_R = mm3(Rz(deg(s.rot)), Rx(deg(-s.lean * 0.4)));
            p.chest_R = Rx(deg(s.lean * 0.6));
            p.head_R = Rx(deg(HEAD_TILT - s.lean * 0.3));
            const c = chestOrg(p);
            p.arm_ik('R', V.add(c, s.hands[0]), [1.0, -0.2, -0.6]);
            p.arm_ik('L', V.add(c, s.hands[1]), [-1.0, -0.2, -0.6]);
            if (s.legs === 'plant') { placeFoot(p, 'R', [11.5, s.py, 0], -12); placeFoot(p, 'L', [-11.5, s.py + 1, 0], 12); }
            else if (s.legs === 'land') { placeFoot(p, 'R', [11.5, s.py + 2, 0], -12); placeFoot(p, 'L', [-11.5, s.py - 3, 1.5], 12, -20); }
            else if (s.legs === 'tuck') { p.leg_fk('R', { flex: 60, abd: 10, knee: 80 }); p.leg_fk('L', { flex: 40, abd: 10, knee: 70 }); }
            else if (s.legs === 'side') { p.leg_fk('R', { flex: 85, abd: 50, knee: 30 }); p.leg_fk('L', { flex: 80, abd: 30, knee: 50 }); }
            else { p.leg_fk('R', { flex: 40, abd: 35, knee: 20 }); p.leg_fk('L', { flex: 60, abd: 20, knee: 40 }); }
            p.shadowScale = s.pz > 4 ? 0.85 : 1.0;
            return p;
        });
    }

    // ---- carro: a porta fica À FRENTE do personagem (o jogo vira o boneco para a porta antes)
    // NOVO: abrir a porta — estica a mão até a maçaneta e puxa a porta para trás.
    function openDoor() {
        const seq = [
            { r: [8.0, 6.0, -10.0], l: null, lean: 2, step: 0 },
            { r: [6.0, 22.0, -6.0], l: null, lean: 12, step: 3 },
            { r: [5.0, 26.0, -6.5], l: [-8, 10, -6], lean: 16, step: 5 },
            { r: [14.0, 12.0, -5.0], l: [-6, 12, -4], lean: -6, step: 2 },
            { r: [16.0, 6.0, -8.0], l: null, lean: -2, step: 0 },
        ];
        return seq.map((s) => {
            const p = base();
            placeFoot(p, 'R', [11.5, 0.4, 0], -12);
            placeFoot(p, 'L', [-11.5, s.step, 0], 10);
            p.pelvis_t = [0, s.step * 0.4, -1.0];
            p.pelvis_R = Rx(deg(s.lean * 0.4));
            p.chest_R = mm3(Rz(deg(s.lean * 0.5)), Rx(deg(s.lean * 0.6)));
            p.head_R = Rx(deg(HEAD_TILT - s.lean * 0.3));
            const c = chestOrg(p);
            p.arm_ik('R', V.add(c, s.r), [1.0, -0.3, -0.8]);
            if (s.l) p.arm_ik('L', V.add(c, s.l), [-1.0, -0.3, -0.8]);
            else p.arm_fk('L', { flex: 6, abd: 14, elbow: 18 });
            return p;
        });
    }
    // NOVO: roubar o carro — agarra a maçaneta, escancara a porta, mete as duas mãos e arranca o motorista jogando o corpo para trás.
    function carjack() {
        const seq = [
            { r: [6.0, 20.0, -6.0], l: [-9.0, 8.0, -8.0], lean: 10, step: 2, yaw: 0 },
            { r: [14.0, 12.0, -5.0], l: [-6.0, 14.0, -2.0], lean: -4, step: 1, yaw: -14 },
            { r: [4.0, 27.0, 2.0], l: [-6.0, 27.0, 3.0], lean: 22, step: 6, yaw: 6 },
            { r: [5.0, 26.0, 4.0], l: [-5.0, 26.0, 5.0], lean: 26, step: 7, yaw: 4 },
            { r: [10.0, 8.0, 2.0], l: [-2.0, 10.0, 4.0], lean: -14, step: -2, yaw: -30 },
            { r: [16.0, 4.0, -4.0], l: [-14.0, 6.0, -4.0], lean: -4, step: 0, yaw: -8 },
        ];
        return seq.map((s) => {
            const p = base();
            placeFoot(p, 'R', [11.5, -1.0 + min(0, s.step), 0], -14);
            placeFoot(p, 'L', [-11.0, max(0, s.step), 0], 8);
            p.pelvis_t = [0, s.step * 0.45, -1.8];
            p.pelvis_R = mm3(Rz(deg(s.yaw * 0.4)), Rx(deg(s.lean * 0.35)));
            p.chest_R = mm3(Rz(deg(s.yaw * 0.6)), Rx(deg(s.lean * 0.65)));
            p.head_R = mm3(Rz(deg(-s.yaw * 0.3)), Rx(deg(HEAD_TILT - s.lean * 0.3)));
            const c = chestOrg(p);
            p.arm_ik('R', V.add(c, s.r), [1.0, -0.3, -0.8]);
            p.arm_ik('L', V.add(c, s.l), [-1.0, -0.3, -0.8]);
            return p;
        });
    }
    // NOVO: entrar no carro — abaixa a cabeça, encolhe e "some" pela porta (o jogo esconde o sprite no fim).
    function enterCar() {
        const seq = [[0.0, 1.0], [0.3, 0.92], [0.55, 0.78], [0.75, 0.62], [0.9, 0.48], [1.0, 0.36]];
        return seq.map(([k, sc]) => {
            const p = base();
            p.pelvis_t = [0, 10.0 * k, -2.0 - 8.0 * k];
            p.pelvis_R = Rx(deg(-12 * k));
            p.chest_R = Rx(deg(34 * k));
            p.head_R = Rx(deg(HEAD_TILT + 10 * k));
            placeFoot(p, 'R', [10.5, 4.0 + 12.0 * k, 3.0 * k], -10, -10 * k);
            placeFoot(p, 'L', [-10.5, 1.0 + 6.0 * k, 0], 10);
            const c = chestOrg(p);
            p.arm_ik('R', V.add(c, [10.0, 16.0 + 6 * k, -4.0 + 8 * k]), [1.0, -0.3, -0.8]);
            p.arm_ik('L', V.add(c, [-10.0, 14.0 + 6 * k, -6.0 + 10 * k]), [-1.0, -0.3, -0.8]);
            p.scale = sc;
            p.shadowScale = 0.6 + 0.4 * sc;
            return p;
        });
    }
    // Sentar no carro (o jogador): de frente para a porta aberta, apoia a mão no batente, põe no carro o pé do lado de dentro, gira o
    // corpo para a frente do carro abaixando a cabeça, senta no banco e recolhe a outra perna; as mãos vão ao volante. w = 'L' (a
    // frente do carro fica à ESQUERDA de quem olha para a porta: porta do motorista) | 'R'. O jogo desliza o personagem da porta até o
    // banco durante o clipe (SIT_IN.travel m, smoothstep — Game._enterCar) e esconde sob a carroceria o que já entrou; aqui tudo é
    // relativo a esse deslize, então o pé de fora fica plantado no chão até subir.
    const SIT_IN = { travel: 1.05, n: 10, fps: 10 };
    function sitIn(w = 'L') {
        const f = w === 'R' ? 1 : -1, u = U(), D = SIT_IN.travel, out = [], n = SIT_IN.n;
        const sst = (s) => s * s * (3 - 2 * s);                                 // = o deslize do jogo (Player.update: _glide)
        // chaves em metros, no referencial da PORTA: x = lado (+f = frente do carro), y = para dentro do carro, z = altura
        const hipK = [[0, [0, 0, 0.88]], [0.25, [0, 0.12, 0.86]], [0.5, [f * 0.06, 0.55, 0.64]], [0.75, [f * 0.12, 0.92, 0.5]], [1, [f * 0.14, D, 0.47]]];
        const yawK = [[0, 0], [0.22, -f * 18], [0.5, -f * 68], [0.75, -f * 90], [1, -f * 90]];
        const leanK = [[0, 4], [0.25, 14], [0.5, 34], [0.75, 22], [1, -6]];
        const leadK = [[0, [-f * 0.13, 0, 0]], [0.2, [-f * 0.06, 0.24, 0.26]], [0.42, [f * 0.14, 0.66, 0.3]], [0.62, [f * 0.36, 0.96, 0.2]], [1, [f * 0.5, D + 0.09, 0.18]]];
        const trailK = [[0, [f * 0.13, 0, 0]], [0.55, [f * 0.13, 0, 0]], [0.75, [f * 0.22, 0.56, 0.36]], [1, [f * 0.5, D - 0.09, 0.18]]];
        const footYawK = [[0, 0], [0.4, -f * 50], [0.7, -f * 90], [1, -f * 90]];
        const lead = f < 0 ? 'R' : 'L', trail = lead === 'R' ? 'L' : 'R', ls = lead === 'R' ? 1 : -1;
        for (let i = 0; i < n; i++) {
            const s = i / (n - 1), back = D * sst(s);
            const rel = (q) => [q[0] * u, (q[1] - back) * u, q[2] * u];       // porta → relativo ao personagem (que desliza)
            const p = base(), hip = rel(keys(hipK, s)), yaw = keys(yawK, s), lean = keys(leanK, s);
            p.shadow = s < 0.55;
            p.absPelvis = true;
            p.abs = { armR: true, armL: true, legR: true, legL: true };
            p.pelvis_t = [hip[0], hip[1], hip[2] + 3.0 - SKEL.pelvis[1][2]];
            p.pelvis_R = mm3(Rz(deg(yaw)), Rx(deg(-8 * ease(s / 0.8))));
            p.chest_R = Rx(deg(lean));
            p.head_R = Rx(deg(HEAD_TILT - lean * 0.4));
            const fy = keys(footYawK, s), sit = ease((s - 0.45) / 0.45);
            const pole = (sd) => V.lerp([0.15 * sd, 1.0, 0.0], [f * 1.0, 0.0, 0.45], sit);
            const lf = rel(keys(leadK, s)), tf = rel(keys(trailK, s));
            p.leg_ik(lead, [lf[0], lf[1], ANKLE_H + lf[2]], pole(ls), footRot(fy, s > 0.1 && s < 0.6 ? 20 : 0));
            p.leg_ik(trail, [tf[0], tf[1], ANKLE_H + tf[2]], pole(-ls), footRot(s > 0.55 ? fy : 0, s > 0.6 && s < 0.9 ? 25 : 0));
            // mãos: no batente (alto, à frente) e na porta → no volante (à frente do banco; a direita de quem olha para +f é −f em y)
            const wheel = rel([f * 0.4, D, 0.9]), sideR = [0, -f * 0.18 * u, 0];
            const hR = V.lerp(rel([-f * 0.05, 0.42, 1.28]), V.add(wheel, sideR), ease((s - 0.35) / 0.55));
            const hL = V.lerp(rel([f * 0.38, 0.28, 1.02]), V.sub(wheel, sideR), ease((s - 0.4) / 0.5));
            p.arm_ik('R', hR, V.lerp([1.0, -0.3, -0.6], [0.3, 1.0, -0.6], sit));
            p.arm_ik('L', hL, V.lerp([-1.0, -0.3, -0.6], [-0.3, 1.0, -0.6], sit));
            out.push(p);
        }
        return out;
    }
    // NOVO: arrombar na manha — debruçado sobre a fechadura, mexendo a gazua (loop).
    function pickLock(n = 4) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, s = sin(TAU * t), c = cos(TAU * t), p = base();
            placeFoot(p, 'R', [11.5, 1.0, 0], -12);
            placeFoot(p, 'L', [-11.5, 4.0, 0], 10);
            p.pelvis_t = [0, 1.5, -4.0];
            p.pelvis_R = Rx(deg(-6));
            p.chest_R = mm3(Rz(deg(4 * c)), Rx(deg(26)));
            p.head_R = mm3(Rz(deg(6 * s)), Rx(deg(HEAD_TILT - 12)));
            const co = chestOrg(p);
            const r = V.add(co, [5.0 + 0.8 * c, 21.0, 2.0 + 1.0 * s]);
            p.arm_ik('R', r, [1.0, -0.4, -0.8]);
            p.arm_ik('L', V.add(co, [-3.0, 21.0, 4.0 - 1.0 * s]), [-1.0, -0.4, -0.8]);
            const B = p.bones(), hR = B.hand_R.R;
            p.props.push(['pick', M4(mm3(hR, Rx(deg(-70))), V.add(p.fist_world(B, 'R'), mv3(hR, [0, 2.4, -0.4])))]);
            out.push(p);
        }
        return out;
    }
    // NOVO: furto (carteirada) — chega de lado, a direita mergulha no bolso da vítima (quadro 3 = pegou) e volta com a carteira.
    function pickpocket() {
        const seq = [
            { r: [12.0, 4.0, -12.0], lean: 2, yaw: 0, w: false },
            { r: [9.0, 16.0, -14.0], lean: 10, yaw: 10, w: false },
            { r: [6.0, 24.0, -17.0], lean: 18, yaw: 16, w: false },
            { r: [5.0, 26.0, -18.0], lean: 20, yaw: 18, w: true },
            { r: [10.0, 14.0, -12.0], lean: 8, yaw: 6, w: true },
            { r: [13.0, 2.0, -6.0], lean: 0, yaw: -4, w: true },
        ];
        return seq.map((s) => {
            const p = base();
            placeFoot(p, 'R', [11.5, 0.4 + s.lean * 0.2, 0], -12);
            placeFoot(p, 'L', [-11.5, -1.0, 0], 12);
            p.pelvis_t = [0, s.lean * 0.15, -1.2 - s.lean * 0.08];
            p.pelvis_R = Rz(deg(s.yaw * 0.4));
            p.chest_R = mm3(Rz(deg(s.yaw * 0.6)), Rx(deg(s.lean * 0.6)));
            p.head_R = mm3(Rz(deg(-s.yaw * 1.4)), Rx(deg(HEAD_TILT)));          // olha para o outro lado, disfarçando
            const c = chestOrg(p);
            p.arm_ik('R', V.add(c, s.r), [1.0, -0.3, -0.6]);
            p.arm_fk('L', { flex: 8, abd: 14, elbow: 20 });
            if (s.w) {
                const B = p.bones(), hR = B.hand_R.R;
                p.props.push(['wallet', M4(hR, V.add(p.fist_world(B, 'R'), mv3(hR, [0, 2.6, -0.6])))]);
            }
            return p;
        });
    }
    // NOVO: anunciar o assalto — arma apontada, a mão livre faz sinal de "passa tudo" (loop).
    function holdup(name, n = 4) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, s = sin(TAU * t), p = base();
            p.pelvis_t = [0, 1.0, -1.4];
            standLegs(p, 12.0, [-2.0, 4.0]);
            if (WEAPON_HOLD[name] && WEAPON_HOLD[name].one_hand) {
                holdWeapon(p, name, { bob: [0, 1.0 * s, 0.4 * s], freeL: true });
                const c = chestOrg(p);
                p.arm_ik('L', V.add(c, [-8.0, 20.0 + 2 * s, 8.0 + 3 * s]), [-1.0, -0.3, -0.8]);
            } else holdWeapon(p, name, { bob: [0, 1.2 * s, 0.4 * s] });
            p.head_R = mm3(Rz(deg(-6 + 4 * s)), Rx(deg(HEAD_TILT - 6)));
            out.push(p);
        }
        return out;
    }
    // NOVO: mexer na bolsa / jaqueta (inventário) — inclinado, mãos no peito (loop).
    function rummage(n = 6) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, s = sin(TAU * t), p = base();
            standLegs(p, 12.0, [0.4, 1.0]);
            p.pelvis_t = [0, 0, -0.8];
            p.chest_R = mm3(Rz(deg(6 + 4 * s)), Rx(deg(14)));
            p.head_R = mm3(Rz(deg(-6)), Rx(deg(HEAD_TILT - 26)));
            const c = chestOrg(p);
            p.arm_ik('L', V.add(c, [-5.0, 14.0, 10.0]), [-1.0, -0.3, -0.8]);
            p.arm_ik('R', V.add(c, [4.0 + 2.5 * s, 13.0, 6.0 + 3.0 * s]), [1.0, -0.3, -0.8]);
            out.push(p);
        }
        return out;
    }
    // NOVO: carregando (maleta / sacola) na mão ESQUERDA — a direita fica livre (ou com a pistola).
    function handBag(p, kind) {
        const B = p.bones(), hL = B.hand_L.R;
        const fist = p.fist_world(B, 'L');
        const R = lookRot([0, 1.0, 0], [0, 0, 1]);
        p.props.push([kind, M4(kind === 'duffel' ? mm3(R, Rz(deg(90))) : R, V.add(fist, [0, 0, -0.4]))]);
        void hL;
    }
    function holdAnim(gaitKind, weapon, kind = 'briefcase', n = null) {
        const N = n || (gaitKind === 'idle' ? 4 : 8), out = [];
        for (let i = 0; i < N; i++) {
            const t = i / N, p = base();
            let c = cos(TAU * t);
            if (gaitKind === 'idle') { p.pelvis_t = [0, 0, -0.4 + 0.3 * cos(TAU * t)]; standLegs(p); }
            else if (gaitKind === 'walk') { p.pelvis_t = [0, 0, -1.6 - 0.9 * cos(2 * TAU * t)]; gait(p, t, { stride: 7.4, lift: 3.4, width: 9.6 }); walkUpper(p, t, false); }
            else c = runLegs(p, t);
            p.chest_R = mm3(Rz(deg(gaitKind === 'idle' ? 0 : -6 * c)), Rx(deg(2)));
            if (kind) p.chest_R = mm3(Ry(deg(-5)), p.chest_R);                            // pende para o lado do peso
            p.arm_fk('L', { flex: gaitKind === 'run' ? 8 * c : 4 * c, abd: 8, elbow: 4 });
            if (weapon === 'pistol') holdWeapon(p, 'pistol', { keepChest: true, freeL: true });
            else if (gaitKind === 'run') p.arm_fk('R', { flex: -42 * c + 10, abd: 14, elbow: 78 + 18 * max(0.0, c) });
            else p.arm_fk('R', { flex: gaitKind === 'walk' ? -20 * c + 3 : 4, abd: 11, elbow: 14 + 10 * max(0.0, -c) });
            if (kind) handBag(p, kind);
            out.push(p);
        }
        return out;
    }
    // NOVO: puxando a mala de rodinhas (mão direita para trás, a mala inclinada atrás).
    function pullAnim(gaitKind) {
        const N = gaitKind === 'idle' ? 4 : 8, out = [];
        for (let i = 0; i < N; i++) {
            const t = i / N, p = base();
            if (gaitKind === 'idle') { p.pelvis_t = [0, 0, -0.4 + 0.3 * cos(TAU * t)]; standLegs(p); }
            else { p.pelvis_t = [0, 0, -1.6 - 0.9 * cos(2 * TAU * t)]; gait(p, t, { stride: 7.2, lift: 3.2, width: 9.6 }); walkUpper(p, t, false, 20, 4.0); }
            const c = cos(TAU * t), co = chestOrg(p);
            const hand = V.add(co, [15.0, -12.0, -16.0]);
            p.arm_ik('R', hand, [1.0, 0.4, -0.6]);
            p.arm_fk('L', { flex: gaitKind === 'idle' ? 4 : 22 * c + 3, abd: 11, elbow: 14 + 14 * max(0.0, c) });
            const tilt = gaitKind === 'idle' ? 0 : 1;
            const R = mm3(Rz(deg(90)), Rx(deg(-28 * tilt)));
            const B = p.bones(), fist = p.fist_world(B, 'R');
            p.props.push(['suitcase', M4(R, V.add(fist, [0.0, -0.5, 0.0]))]);
            out.push(p);
        }
        return out;
    }
    // NOVO: sobrecarregado — fardo nas costas, curvado, passos curtos.
    function walkHeavy(n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, c = cos(TAU * t), p = base();
            p.pelvis_t = [0, 0, -3.0 - 1.0 * cos(2 * TAU * t)];
            gait(p, t, { stride: 5.6, lift: 2.6, width: 10.4, toe: 12 });
            p.pelvis_R = Rz(deg(4 * c));
            p.chest_R = mm3(Rz(deg(-5 * c)), Rx(deg(20)));
            p.head_R = mm3(Rz(deg(3 * c)), Rx(deg(HEAD_TILT + 4)));
            heavyLoad(p);
            out.push(p);
        }
        return out;
    }
    // O fardo nas costas e as mãos nas alças (o mesmo em parado/andando/correndo: a carga nunca some). bob: as mãos sacodem.
    function heavyLoad(p, bob = 0) {
        const co = chestOrg(p);
        p.arm_ik('R', V.add(co, [11.0, 6.0, 20.0 + bob]), [1.0, -0.3, -1.0]);
        p.arm_ik('L', V.add(co, [-11.0, 6.0, 20.0 - bob]), [-1.0, -0.3, -1.0]);
        const B = p.bones();
        p.props.push(['sack', mm4(B.chest, M4(Rx(deg(-10)), [0, -16.0, 16.0])), 'chest']);
    }
    // NOVO: correndo com o fardo — as pernas da corrida (passada um pouco mais curta e mais baixa), tronco bem curvado para
    // a frente segurando as alças; o fardo pula a cada passada.
    function runHeavy(n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, c = cos(TAU * t), p = base();
            p.pelvis_t = [0, 1.0, (G.ADULT ? -5.2 : -3.8) - 1.3 * cos(2 * TAU * (t - 0.17))];
            p.pelvis_R = Rz(deg(6 * c));
            gait(p, t, { stride: 9.6, lift: 4.0, width: 9.2, stance: 0.4, heel: 6, toeoff: -32, kick: 5.0 });
            p.chest_R = mm3(Rz(deg(-7 * c)), Rx(deg(26)));
            p.head_R = mm3(Rz(deg(4 * c)), Rx(deg(HEAD_TILT - 6)));
            heavyLoad(p, 1.2 * sin(2 * TAU * t));
            out.push(p);
        }
        return out;
    }
    // NOVO: parado com o fardo — curvado, respirando pesado.
    function idleHeavy(n = 6) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, b = sin(TAU * t), p = base();
            p.pelvis_t = [0, 0, -1.4 + 0.5 * cos(TAU * t)];
            standLegs(p);
            p.chest_R = Rx(deg(16 + 2.5 * b));
            p.head_R = Rx(deg(HEAD_TILT + 2 - 1.5 * b));
            heavyLoad(p);
            out.push(p);
        }
        return out;
    }

    // ------------------------------------------------------------------ natação
    function swim(n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, p = base();
            p.water = 0.0;
            p.pelvis_t = [0, -20.0, -6.0 - SKEL.pelvis[1][2] + 0.6 * sin(2 * TAU * t)];
            const roll = 16 * sin(TAU * t);
            p.pelvis_R = mm3(Ry(deg(roll * 0.6)), Rx(deg(-70)));
            p.chest_R = Ry(deg(roll * 0.6));
            p.head_R = mm3(Rz(deg(-roll * 0.5)), Rx(deg(44)));
            for (const [side, ph0] of [['R', t], ['L', t + 0.5]]) {
                const ph = ph0 % 1.0;
                let flex, abd, elbow;
                if (ph < 0.5) { const u = ph / 0.5; flex = 178 - 165 * ease(u); abd = 8; elbow = 10 + 40 * sin(PI * u); }
                else { const u = (ph - 0.5) / 0.5; flex = 13 - 195 * ease(u); abd = 10 + 40 * sin(PI * u); elbow = 20 + 70 * sin(PI * u); }
                p.arm_fk(side, { flex, abd, elbow });
                const k = 16 * sin(2 * TAU * t + (side === 'R' ? 0 : PI));
                p.leg_fk(side, { flex: k, abd: 5, knee: 12 + 8 * max(0.0, sin(2 * TAU * t + (side === 'R' ? 0 : PI))), foot: -40 });
            }
            const B = p.bones();
            for (const [side, ph] of [['R', t], ['L', (t + 0.5) % 1.0]]) {
                if (ph < 0.13 || ph > 0.94) { const f = p.fist_world(B, side); p.effects.push({ type: 'splash', pos: [f[0], f[1], 0.0], n: 9, spread: 3.0, seed: i * 7 + (side === 'R' ? 1 : 0) }); }
            }
            out.push(p);                                                       // (marolas: as do jogo, em arco na direção do nado — WaterFx)
        }
        return out;
    }
    function swimIdle(n = 6) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, c = cos(TAU * t), s_ = sin(TAU * t), p = base();
            p.water = 0.0;
            p.pelvis_t = [0, 0, -45.5 + 0.8 * s_];
            p.chest_R = Rx(deg(-6));
            p.head_R = Rx(deg(HEAD_TILT + 4));
            for (const [side, sg] of [['R', 1], ['L', -1]]) {
                p.arm_ik(side, [sg * (17 + 5 * c), 12 + 3 * s_ * sg, -1.5 - 0.8 * s_], [sg * 1.0, -0.4, -0.5]);
                const k = 25 * sin(TAU * t + (side === 'R' ? 0 : PI));
                p.leg_fk(side, { flex: 20 + k, abd: 18, knee: 50 + k, foot: -30 });
            }
            for (let k = 0; k < 2; k++) {
                const fr = (t + k * 0.5) % 1.0;
                p.effects.push({ type: 'ring', pos: [0, 4.0, 0], r: 17 + 12 * fr, alpha: Math.trunc(190 * (1 - fr) + 30), gaps: 8, phase: fr });
            }
            out.push(p);
        }
        return out;
    }

    // NADO PEITO NA SUPERFÍCIE (o nado normal; o crawl é o nado com Shift): o corpo do "parado na água" (swimIdle) inclinado para a
    // frente, a cabeça sempre fora d'água. Ciclo: puxada (as mãos abrem e descem, o corpo sobe e respira) → recolhe as mãos ao peito e
    // dobra as pernas → as mãos disparam à frente com a pernada de sapo → desliza. Chaves com ease (sem trancos) e 12 quadros.
    function swimBreast(n = 12) {
        const out = [];
        // braços: alvo da mão (x lateral, y frente, z altura em relação à água)
        const AK = [[0, [5, 30, -2.5]], [0.22, [22, 25, -3.5]], [0.42, [17, 13, -9]], [0.56, [6, 10, -4]], [0.74, [5, 30, -2.5]], [1, [5, 30, -2.5]]];
        // pernas: [flex, abd, joelho, pé]
        const LK = [[0, [4, 6, 8, -40]], [0.42, [10, 10, 30, -30]], [0.6, [46, 30, 112, 12]], [0.76, [14, 36, 24, -24]], [0.9, [4, 6, 8, -40]], [1, [4, 6, 8, -40]]];
        for (let i = 0; i < n; i++) {
            const t = i / n, p = base();
            p.water = 0.0;
            const rise = keys([[0, 0], [0.4, 1], [0.6, 0.6], [0.8, -0.4], [1, 0]], t);      // sobe na puxada, afunda de leve no deslize
            const lean = 34 - 10 * rise;
            p.pelvis_t = [0, -7.0 - 3 * (1 - rise), -41.0 + 2.6 * rise];
            p.pelvis_R = Rx(deg(-lean));
            p.chest_R = Rx(deg(-6 + 4 * rise));
            p.head_R = Rx(deg(HEAD_TILT + 4 + lean * 0.75 - 3 * rise));
            const a = keysN(AK, t), l = keysN(LK, t);
            for (const [sd, sg] of [['R', 1], ['L', -1]]) {
                p.arm_ik(sd, [sg * a[0], a[1], a[2]], [sg * 1.0, -0.2, -0.6]);
                p.leg_fk(sd, { flex: l[0], abd: l[1], knee: l[2], foot: l[3] });
            }
            const fr = t;                                                                   // marola em volta do peito
            p.effects.push({ type: 'ring', pos: [0, 6.0, 0], r: 15 + 14 * fr, alpha: Math.trunc(170 * (1 - fr) + 30), gaps: 8, phase: fr });
            if (t > 0.6 && t < 0.8) { const B = p.bones(); for (const sd of ['R', 'L']) { const f = p.fist_world(B, sd); p.effects.push({ type: 'splash', pos: [f[0], f[1], 0.0], n: 5, spread: 2.2, seed: 120 + i + (sd === 'R' ? 1 : 0) }); } }
            out.push(p);
        }
        return out;
    }
    // VADEANDO NO FUNDO (água acima da metade do corpo): o andar fica pesado — passada curta, tronco à frente, e os braços abertos
    // na altura da água vão PUXANDO a água para trás, alternados com as pernas (como quem anda numa piscina funda).
    function wadeDeep(n = 10) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, c = cos(TAU * t), p = base();
            p.pelvis_t = [0, 0.6, -2.2 - 0.7 * cos(2 * TAU * t)];
            gait(p, t, { stride: 5.4, lift: 2.4, width: 10.2 });
            p.pelvis_R = Rz(deg(4 * c));
            p.chest_R = mm3(Rz(deg(-10 * c)), Rx(deg(12)));
            p.head_R = mm3(Rz(deg(5 * c)), Rx(deg(HEAD_TILT - 6)));
            const co = chestOrg(p);
            for (const [sd, sg, ph] of [['R', 1, 0], ['L', -1, PI]]) {
                const u = cos(TAU * t + ph), w = sin(TAU * t + ph);            // u > 0: mão à frente (entrando); depois puxa para trás
                p.arm_ik(sd, V.add(co, [sg * (27 - 4 * u), 4 + 15 * u, 5 - 2 * max(0, -w)]), [sg * 0.6, -1.0, -0.4]);
            }
            out.push(p);
        }
        return out;
    }
    // PARADO NO FUNDO: de pé com a água no peito/cintura, os braços abertos na superfície fazendo o "sculling" (vai e vem) para se
    // equilibrar, o corpo balançando com a água.
    function wadeIdle(n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = i / n, c = cos(TAU * t), s_ = sin(TAU * t), p = base();
            p.pelvis_t = [0, 0, -1.6 + 0.6 * s_];
            standLegs(p);
            p.chest_R = mm3(Rz(deg(2 * c)), Rx(deg(5)));
            p.head_R = Rx(deg(HEAD_TILT + 2 - 1.5 * s_));
            const co = chestOrg(p);
            for (const [sd, sg] of [['R', 1], ['L', -1]]) p.arm_ik(sd, V.add(co, [sg * (28 + 2 * c), 10 + 6 * s_ * sg, 5 + 0.6 * c]), [sg * 0.6, -1.0, -0.4]);
            out.push(p);
        }
        return out;
    }

    // Interpola listas de números (ângulos das juntas) por chaves [[t, [..]], ...] — como keys(), para qualquer tamanho.
    function keysN(K, t) {
        if (t <= K[0][0]) return K[0][1];
        for (let i = 0; i < K.length - 1; i++) {
            const [t0, a] = K[i], [t1, b] = K[i + 1];
            if (t0 <= t && t <= t1) { const u = ease((t - t0) / max(t1 - t0, 1e-9)); return a.map((v, k) => v + (b[k] - v) * u); }
        }
        return K[K.length - 1][1];
    }
    // Do nado peito ao CRAWL (Shift): o corpo, inclinado no peito (1º quadro do `swim_breast`), deita de vez, um braço vai à frente e o
    // outro para trás e as pernas começam a bater — termina no 1º quadro do `swim`. swim_out = o mesmo ao contrário (crawl → peito;
    // e também do crawl para ficar de pé no raso, que parte da mesma pose inclinada).
    function swimIn(n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const s = i / (n - 1), e = ease(s), p = base();
            p.water = 0.0;
            p.pelvis_t = V.lerp([0, -10.0, -41.0], [0, -20.0, -6.0 - SKEL.pelvis[1][2]], e);
            p.pelvis_R = Rx(deg(-34 - 36 * e));
            p.chest_R = Rx(deg(-6 * (1 - e) + 5 * sin(PI * s)));
            p.head_R = Rx(deg(HEAD_TILT + 29.5 + 14.5 * e));
            const aR = keysN([[0, [124, 10, 10]], [0.5, [150, 14, 16]], [1, [178, 8, 10]]], s);
            const aL = keysN([[0, [124, 10, 10]], [0.5, [70, 24, 40]], [1, [13, 10, 20]]], s);
            p.arm_fk('R', { flex: aR[0], abd: aR[1], elbow: aR[2] }); p.arm_fk('L', { flex: aL[0], abd: aL[1], elbow: aL[2] });
            for (const [sd, ph] of [['R', 0], ['L', PI]]) {
                const k = 16 * sin(TAU * s + ph) * e;
                p.leg_fk(sd, { flex: 4 * (1 - e) + k, abd: 6 - 1 * e, knee: 8 * (1 - e) + 12 * e, foot: -40 });
            }
            if (i === 3) { const B = p.bones(); for (const sd of ['R', 'L']) { const f = p.fist_world(B, sd); p.effects.push({ type: 'splash', pos: [f[0], f[1], 0.0], n: 8, spread: 3.0, seed: 40 + i + (sd === 'R' ? 1 : 0) }); } }
            out.push(p);
        }
        return out;
    }
    // MERGULHO: o corpo inteiro logo abaixo da superfície (até 10 unidades, onde o desenho ainda aparece — esmaecido e azulado, como as
    // pernas no crawl), quase na horizontal, nadando peito: puxada (braços abrem e descem), recolhe as mãos ao peito, estica à frente e
    // desliza; as pernas fazem a pernada de sapo enquanto os braços esticam.
    const DIVE_Z = -14.0;                                                   // centro do corpo abaixo da linha d'água
    function divePose(p) {
        p.water = 0.0;
        p.shadow = false;
        p.pelvis_t = [0, -20.0, DIVE_Z - SKEL.pelvis[1][2]];
        p.pelvis_R = Rx(deg(-88));
        p.chest_R = Rx(deg(-4));                                            // (as costas curvadas para baixo, a cabeça entre os braços)
        p.head_R = Rx(deg(HEAD_TILT - 18));
    }
    function dive(n = 8) {
        const out = [];
        const AK = [[0, [178, 10, 8]], [0.3, [112, 66, 58]], [0.45, [42, 22, 128]], [0.62, [178, 10, 8]], [1, [178, 10, 8]]];
        const LK = [[0, [0, 6, 6, -40]], [0.4, [0, 6, 6, -40]], [0.58, [46, 34, 112, 20]], [0.78, [0, 10, 6, -40]], [1, [0, 6, 6, -40]]];
        for (let i = 0; i < n; i++) {
            const t = i / n, p = base();
            divePose(p);
            p.pelvis_t = V.add(p.pelvis_t, [0, 0, 0.8 * sin(TAU * t)]);
            const a = keysN(AK, t), l = keysN(LK, t);
            for (const sd of ['R', 'L']) {
                p.arm_fk(sd, { flex: a[0], abd: a[1], elbow: a[2] });
                p.leg_fk(sd, { flex: l[0], abd: l[1], knee: l[2], foot: l[3] });
            }
            out.push(p);
        }
        return out;
    }
    // Afundar (do nado peito ao mergulho — "golfinho"): a cabeça desce, o quadril sobe e as pernas saem da água por um instante
    // (respingo) e o corpo assenta logo abaixo da superfície, na pose do `dive`. (Voltar à tona: diveOut, que termina no nado peito.)
    const BREAST_Z = -41.0 + SKEL.pelvis[1][2];                            // altura do quadril no 1º quadro do swimBreast (no mesmo referencial do diveIn)
    function diveIn(n = 9) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const s = i / (n - 1), p = base();
            p.water = 0.0;
            const z = keys([[0, BREAST_Z], [0.45, -2.0], [1, DIVE_Z]], s), rx = keys([[0, -34], [0.45, -128], [1, -88]], s);
            p.pelvis_t = [0, keys([[0, -10.0], [1, -20.0]], s), z - SKEL.pelvis[1][2]];
            p.pelvis_R = Rx(deg(rx));
            p.chest_R = Rx(deg(keys([[0, -6], [0.45, 14], [1, -4]], s)));
            p.head_R = Rx(deg(HEAD_TILT + keys([[0, 30], [0.45, 10], [1, -18]], s)));
            const aR = keysN([[0, [124, 10, 10]], [0.45, [150, 30, 30]], [1, [178, 10, 8]]], s), aL = aR;
            p.arm_fk('R', { flex: aR[0], abd: aR[1], elbow: aR[2] }); p.arm_fk('L', { flex: aL[0], abd: aL[1], elbow: aL[2] });
            const lg = keysN([[0, [4, 6, 8, -40]], [0.45, [-12, 4, 2, -50]], [1, [0, 6, 6, -40]]], s);
            for (const sd of ['R', 'L']) p.leg_fk(sd, { flex: lg[0], abd: lg[1], knee: lg[2], foot: lg[3] });
            p.shadow = false;
            if (i === 4 || i === 5) { const B = p.bones(); const ft = B.foot_R.t; p.effects.push({ type: 'splash', pos: [ft[0], ft[1], 0.0], n: 10, spread: 3.2, seed: 70 + i }); }
            out.push(p);
        }
        return out;
    }

    // Voltar à tona (do mergulho ao nado peito): o corpo sobe inclinado, a cabeça sai primeiro (respingo, a respirada), os braços abrem
    // para boiar e o corpo assenta na pose do 1º quadro do `swim_breast` — sem as pernas saírem da água (isso é só ao afundar).
    function diveOut(n = 8) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const s = i / (n - 1), p = base();
            p.water = 0.0;
            p.shadow = false;
            p.pelvis_t = [0, keys([[0, -20.0], [1, -10.0]], s), keys([[0, DIVE_Z], [0.5, -9.0], [1, BREAST_Z]], s) - SKEL.pelvis[1][2]];
            p.pelvis_R = Rx(deg(keys([[0, -88], [0.5, -58], [1, -34]], s)));
            p.chest_R = Rx(deg(keys([[0, -4], [0.5, -16], [1, -6]], s)));
            p.head_R = Rx(deg(HEAD_TILT + keys([[0, -18], [0.4, 34], [1, 30]], s)));
            const aR = keysN([[0, [178, 10, 8]], [0.5, [110, 55, 50]], [1, [124, 10, 10]]], s), aL = aR;
            p.arm_fk('R', { flex: aR[0], abd: aR[1], elbow: aR[2] }); p.arm_fk('L', { flex: aL[0], abd: aL[1], elbow: aL[2] });
            const lg = keysN([[0, [0, 6, 6, -40]], [0.5, [30, 25, 70, -10]], [1, [4, 6, 8, -40]]], s);
            for (const sd of ['R', 'L']) p.leg_fk(sd, { flex: lg[0], abd: lg[1], knee: lg[2], foot: lg[3] });
            if (i === 3) { const B = p.bones(), h = B.head.t; p.effects.push({ type: 'splash', pos: [h[0], h[1], 0.0], n: 12, spread: 3.4, seed: 90 + i }); }
            out.push(p);
        }
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
    // O veículo é o desenho do atlas dos carros (visto de cima, "achatado" no chão) e o piloto 2,5D vai por cima, com a ORIGEM no
    // banco. Para casar com um desenho sem altura, o banco fica rente ao chão (quadris em z ≈ 6): o tronco sobe dele e as pernas
    // descem um pouco abaixo, abraçando o veículo. Mãos e pés vão direto no esqueleto ADULTO (Pose.abs) nas manoplas, pedaleiras,
    // pedais e timão do desenho — medidas abaixo em METROS NO JOGO a partir do banco (x = direita, y = frente; o veículo já na escala
    // do jogo: Config.vehicle.scale × Bikes.SCALE) e alturas (z) em unidades. 16 direções (o veículo gira livre).
    const RIDE = {
        moto: { seat: 0.151, grip: [0.35, 0.81], gz: 19, peg: [0.19, 0.07], pz: -14, lean: 30, hip: 6 },
        bike: { seat: 0.317, grip: [0.32, 0.83], gz: 17, crank: 0.30, cz: -15, crankR: 0.16, lean: 24, hip: 7 },
        jetski: { grip: [0.48, 0.70], gz: 18, peg: [0.33, 0.12], pz: -10, lean: 16, hip: 6 },
        boat: { wheel: 0.53, wz: 22, wheelR: 0.11, peg: [0.15, 0.3], pz: -9, lean: 4, hip: 8 },
    };
    const U = () => (G.PPU || 26) / 0.5;                                  // unidades do gerador por metro no jogo (não depende da resolução)
    function rideBase(R, { hipDz = 0, leanX = 0, roll = 0 } = {}) {
        const p = base();
        p.shadow = false;                                                  // (a sombra é a do veículo)
        p.absPelvis = true;
        p.abs = { armR: true, armL: true, legR: true, legL: true };
        p.pelvis_t = [-roll * 0.08, -2.0, R.hip + hipDz + 3.0 - SKEL.pelvis[1][2]];
        p.pelvis_R = mm3(Ry(deg(roll * 0.7)), Rx(deg(-6)));
        p.chest_R = mm3(Ry(deg(roll * 0.4)), Rx(deg(-(R.lean + leanX))));
        p.head_R = mm3(Ry(deg(-roll * 0.7)), Rx(deg(HEAD_TILT + (R.lean + leanX) * 0.75)));
        return p;
    }
    // Moto e jet ski: 3 quadros (inclinado para a direita, reto, para a esquerda — Vehicle._animateBike).
    function rideLean(kind) {
        const R = RIDE[kind], u = U();
        return [12, 0, -12].map((roll) => {
            const p = rideBase(R, { roll });
            const st = roll / 12;                                          // guidão virado: a manopla de dentro vem para trás
            for (const [sd, s] of [['R', 1], ['L', -1]]) {
                p.arm_ik(sd, [s * R.grip[0] * u, R.grip[1] * u - s * st * 3.0, R.gz - s * st * 1.5], [s * 1.0, -0.2, -0.7]);
                p.leg_ik(sd, [s * R.peg[0] * u, R.peg[1] * u, R.pz + (s * st > 0 ? 1.5 : 0)], [s * 0.45, 1.0, 0.35], footRot(-s * 14, -12));
            }
            return p;
        });
    }
    // Bicicleta: pedalando (8 quadros: uma volta do pedivela).
    function rideBike(n = 8) {
        const R = RIDE.bike, u = U(), out = [];
        for (let i = 0; i < n; i++) {
            const a = (TAU * i) / n, p = rideBase(R, { hipDz: 0.6 * sin(2 * a) });
            p.chest_R = mm3(Rz(deg(4 * sin(a))), p.chest_R);
            for (const [sd, s, ph] of [['R', 1, a], ['L', -1, a + PI]]) {
                p.arm_ik(sd, [s * R.grip[0] * u, R.grip[1] * u, R.gz], [s * 1.0, -0.3, -0.7]);
                const ped = [s * 7.5, R.crank * u + sin(ph) * R.crankR * u, R.cz - cos(ph) * R.crankR * u];
                p.leg_ik(sd, ped, [s * 0.2, 1.0, 0.25], footRot(-s * 6, -8 + 14 * sin(ph)));
            }
            out.push(p);
        }
        return out;
    }
    // Lancha: sentado no banco do timão, mãos no timão, balançando com o mar (4 quadros).
    function rideBoat(n = 4) {
        const R = RIDE.boat, u = U(), out = [];
        for (let i = 0; i < n; i++) {
            const a = (TAU * i) / n, p = rideBase(R, { hipDz: 0.5 * sin(a), roll: 3 * sin(a) });
            const w = 0.35 * sin(a), c = [0, R.wheel * u, R.wz], r = R.wheelR * u;      // timão girando um pouco
            for (const [sd, s] of [['R', 1], ['L', -1]]) {
                const ang = s * 1.15 + w;
                p.arm_ik(sd, [c[0] + sin(ang) * r, c[1] - 1.0, c[2] + cos(ang) * r * 0.6], [s * 1.0, -0.5, -0.6]);
                p.leg_ik(sd, [s * R.peg[0] * u, R.peg[1] * u, R.pz], [s * 0.3, 1.0, 0.3], footRot(-s * 10, -6));
            }
            out.push(p);
        }
        return out;
    }

    // Subir na moto/bicicleta (o jogador): de pé ao lado, segura o guidão, passa a perna por cima e senta (6 quadros). w = 'moto' |
    // 'motoL' | 'bike' | 'bikeL' (L = chegou pela esquerda). Origem no CENTRO do veículo (o jogador fica no lugar dele): o banco está
    // RIDE.<tipo>.seat m atrás — o último quadro é a pose de pilotar (ride_moto / ride_bike) no banco.
    function mountAnim(w = 'moto', n = 6) {
        const kind = String(w).startsWith('bike') ? 'bike' : 'moto', R = RIDE[kind], u = U(), sd = String(w).endsWith('L') ? -1 : 1;
        const sy = -R.seat * u, ss = -sd;                                   // ss: lado da perna que passa por cima (a do lado do veículo)
        const end = kind === 'bike'
            ? { R: [7.5, sy + R.crank * u, R.cz - R.crankR * u], L: [-7.5, sy + R.crank * u, R.cz + R.crankR * u] }
            : { R: [R.peg[0] * u, sy + R.peg[1] * u, R.pz], L: [-R.peg[0] * u, sy + R.peg[1] * u, R.pz] };
        const swing = ss > 0 ? 'R' : 'L', stand = ss > 0 ? 'L' : 'R';
        const hipK = [[0, [sd * 30, sy + 3, 44]], [0.35, [sd * 22, sy + 1, 46]], [0.7, [sd * 7, sy, 24]], [1, [0, sy, R.hip]]];
        const leanK = [[0, 4], [0.35, 16], [0.7, 22], [1, R.lean]];
        const swingK = [[0, [sd * 30 + ss * 8, sy + 3, ANKLE_H]], [0.35, [sd * 16 + ss * 2, sy - 16, 34]], [0.7, [ss * 18, sy + 2, 8]], [1, end[swing]]];
        const standK = [[0, [sd * 30 - ss * 8, sy + 3, ANKLE_H]], [0.35, [sd * 30 - ss * 8, sy + 3, ANKLE_H]], [0.7, [sd * 24, sy + 4, ANKLE_H]], [1, end[stand]]];
        const out = [];
        for (let i = 0; i < n; i++) {
            const s = i / (n - 1), p = base(), hip = keys(hipK, s), lean = keys(leanK, s);
            p.shadow = s < 0.75;
            p.absPelvis = true;
            p.abs = { armR: true, armL: true, legR: true, legL: true };
            p.pelvis_t = [hip[0], hip[1], hip[2] + 3.0 - SKEL.pelvis[1][2]];
            p.pelvis_R = mm3(Rz(deg(-sd * 25 * sin(PI * s))), Rx(deg(-6 * s)));
            p.chest_R = Rx(deg(-lean));
            p.head_R = Rx(deg(HEAD_TILT + lean * 0.75));
            const g = min(1, s / 0.35);                                     // as mãos vão ao guidão
            for (const [sdd, k] of [['R', 1], ['L', -1]]) {
                const grip = [k * R.grip[0] * u, sy + R.grip[1] * u, R.gz], rest = [hip[0] + k * 17, hip[1] + 6, hip[2] - 6];
                p.arm_ik(sdd, V.lerp(rest, grip, ease(g)), [k * 1.0, -0.3, -0.7]);
            }
            const sw = keys(swingK, s), stn = keys(standK, s);
            p.leg_ik(swing, sw, [ss * 0.3, 1.0, 0.4], footRot(-ss * 10, s > 0.2 && s < 0.8 ? 30 : -10));
            p.leg_ik(stand, stn, [-ss * 0.3, 1.0, 0.3], footRot(ss * 10, s > 0.8 ? -10 : 0));
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

    // Clipes do JOGO. weapon: arma (já traduzida para o objeto desenhado: 'smg' de um BOPE vira 'rifle' — ver NpcGenBuild.weaponFor).
    const gunFn = { idle: gunIdle, walk: gunWalk, run: gunRun, draw: gunDraw, aim: gunAim, holdup };
    const shootFn = (w) => (w === 'pistol' ? pistolShoot() : w === 'shotgun' ? shotgunShoot() : w === 'smg' ? smgShoot('smg') : rifleShoot(w));
    const CLIPS = {
        idle: { fps: 6, loop: true, fn: (w) => (w === 'none' ? idle() : w === 'bat' ? batIdle() : w === 'knife' ? knifeIdle() : gunIdle(w)) },
        walk: { fps: 10, loop: true, fn: (w) => (w === 'none' ? walk() : w === 'bat' ? batWalk() : w === 'knife' ? knifeWalk() : gunWalk(w)) },
        run: { fps: 14, loop: true, fn: (w) => (w === 'none' ? run() : w === 'bat' ? batRun() : w === 'knife' ? knifeRun() : gunRun(w)) },
        stab: { fps: 16, loop: false, fn: () => knifeStab() },                 // facada (Melee.stab)
        walk_up: { fps: 10, loop: true, fn: () => walkUp() },
        climb: { fps: 10, loop: true, fn: () => climb() },
        draw: { fps: 14, loop: false, fn: (w) => gunDraw(w) },
        aim: { fps: 1, loop: true, fn: (w) => gunAim(w) },
        shoot: { fps: 16, loop: false, fn: (w) => shootFn(w), fpsFor: { pistol: 15, shotgun: 12, smg: 18 } },
        holdup: { fps: 6, loop: true, fn: (w) => (w === 'knife' ? knifeHoldup() : holdup(w === 'none' ? 'pistol' : w)) },
        swing: { fps: 14, loop: false, fn: (w) => batSwing(w === 'baton' ? 'baton' : 'bat') },
        punch: { fps: 14, loop: false, fn: () => punchCross() },
        punchL: { fps: 14, loop: false, fn: () => punchJab() },
        kick: { fps: 12, loop: false, fn: () => kick() },
        throw: { fps: 12, loop: false, fn: () => throwAnim() },
        gym_curl: { fps: 9, loop: true, fn: (w) => gymCurl(w) },               // academia: rosca direta (w1/w2/w3 = faixa de peso)
        gym_bench: { fps: 8, loop: true, fn: (w) => gymBench(w) },             // supino
        gym_squat: { fps: 8, loop: true, fn: (w) => gymSquat(w) },             // agachamento
        grenade_pin: { fps: 14, loop: false, fn: () => grenadePin() },        // pegar a granada e puxar o pino
        grenade_hold: { fps: 6, loop: true, fn: () => holdLoop(6, 'grenade') },   // armada, mirando (a força carregando)
        grenade_throw: { fps: 16, loop: false, fn: () => throwRelease('grenade') },
        molotov_light: { fps: 13, loop: false, fn: () => molotovLight() },    // acender o pano com o isqueiro
        molotov_hold: { fps: 8, loop: true, fn: () => holdLoop(6, 'molotov') },
        molotov_throw: { fps: 16, loop: false, fn: () => throwRelease('molotov') },
        hurt: { fps: 12, loop: false, fn: () => hurt() },
        dead: { fps: 12, loop: false, fn: () => death(false) },        // (a poça de sangue é a do jogo — Blood.deathPool —, não desenhada)
        surrender: { fps: 9, loop: false, fn: () => surrenderKneel() },
        kneel: { fps: 1, loop: true, fn: () => [kneelPose(1)] },
        handsup: { fps: 8, loop: false, fn: () => handsUp(5) },
        scared: { fps: 14, loop: true, fn: () => scared() },
        swim: { fps: 10, loop: true, fn: () => swim() },
        swim_idle: { fps: 6, loop: true, fn: () => swimIdle() },
        swim_breast: { fps: 12, loop: true, fn: () => swimBreast() },         // nado peito na superfície (o nado normal)
        wade: { fps: 10, loop: true, fn: () => wadeDeep() },                  // andando com a água acima da metade do corpo
        wade_idle: { fps: 6, loop: true, fn: () => wadeIdle() },              // parado nessa água: braços equilibrando
        swim_in: { fps: 14, loop: false, fn: () => swimIn() },                // nado peito → crawl (Shift)
        swim_out: { fps: 14, loop: false, fn: () => swimIn().reverse() },     // crawl → nado peito (soltou o Shift / chegou ao raso)
        dive_in: { fps: 12, loop: false, fn: () => diveIn() },                // afundar (nado peito → mergulho)
        dive: { fps: 10, loop: true, fn: () => dive(12) },                     // nado peito debaixo d'água (12 quadros: suave)
        dive_out: { fps: 12, loop: false, fn: () => diveOut() },              // voltar à tona (mergulho → nado peito)
        flail: { fps: 12, loop: true, fn: () => flail() },
        tumble: { fps: 16, loop: false, fn: () => tumble() },
        lie: { fps: 1, loop: true, fn: () => lie() },
        getup: { fps: 10, loop: false, fn: () => getUp() },
        vault: { fps: 10, loop: false, fn: () => vault() },
        carjack: { fps: 9, loop: false, fn: () => carjack() },
        opendoor: { fps: 10, loop: false, fn: () => openDoor() },
        enter: { fps: 10, loop: false, fn: () => enterCar() },
        sitin: { fps: SIT_IN.fps, loop: false, fn: (w) => sitIn(w) },
        sitout: { fps: SIT_IN.fps, loop: false, fn: (w) => sitIn(w).reverse() },     // sair do carro: o sitin ao contrário (do banco à porta)          // (só o jogador: L/R = lado da frente do carro)
        pick: { fps: 7, loop: true, fn: () => pickLock() },
        pickpocket: { fps: 7, loop: false, fn: () => pickpocket() },
        rummage: { fps: 8, loop: true, fn: () => rummage() },
        idle_hold: { fps: 4, loop: true, fn: (w, o) => holdAnim('idle', w, o && o.hand) },
        walk_hold: { fps: 10, loop: true, fn: (w, o) => holdAnim('walk', w, o && o.hand) },
        run_hold: { fps: 13, loop: true, fn: (w, o) => holdAnim('run', w, o && o.hand) },
        idle_pull: { fps: 4, loop: true, fn: () => pullAnim('idle') },
        walk_pull: { fps: 10, loop: true, fn: () => pullAnim('walk') },
        walk_heavy: { fps: 8, loop: true, fn: () => walkHeavy() },
        run_heavy: { fps: 17, loop: true, fn: () => runHeavy() },          // (passada 9,6 × 17 qps ≈ a da corrida 11,5 × 14: pés plantados no mesmo ritmo)
        idle_heavy: { fps: 4, loop: true, fn: () => idleHeavy() },
        baton_idle: { fps: 6, loop: true, fn: () => batonIdle() },
        baton_walk: { fps: 10, loop: true, fn: () => batonWalk() },
        // pilotando (16 direções): moto/jet ski = 3 quadros de inclinação (o jogo escolhe pelo guidão), bicicleta pedalando, lancha
        ride_moto: { fps: 1, loop: true, dirs: 16, fn: () => rideLean('moto') },
        ride_jetski: { fps: 1, loop: true, dirs: 16, fn: () => rideLean('jetski') },
        ride_bike: { fps: 10, loop: true, dirs: 16, fn: () => rideBike() },
        ride_boat: { fps: 3, loop: true, dirs: 16, fn: () => rideBoat() },
        mount: { fps: 12, loop: false, dirs: 16, fn: (w) => mountAnim(w) },          // (só o jogador: moto/motoL/bike/bikeL)
        // tático (só o jogador): agachado/cobertura, andar agachado (furtivo), passo lateral mirando e rolamento de esquiva
        crouch: { fps: 3, loop: true, fn: (w) => crouchIdle(w) },
        sneak: { fps: 9, loop: true, fn: (w) => sneakWalk(w) },
        strafe: { fps: 10, loop: true, fn: (w) => strafeWalk(w === 'none' ? 'pistol' : w) },
        roll: { fps: 16, loop: false, fn: () => dodgeRoll() },
    };

    Object.assign(G, { Pose, setRig, RIG, ik2, HEAD_TILT, ANIMS, CLIPS, CTX, WEAPON_HOLD, SIT_IN, anim: { idle, walk, run, gunIdle, gunWalk, gunRun, gunDraw, holdWeapon, kneelPose, death, getUp } });
    return G;
}
