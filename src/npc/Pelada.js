// ============================================================================
// Pelada — o FUTEBOL na QUADRA da favela (FavelaPlan.squares 'quadra': cimento, linhas e traves de futsal, na beira da Estrada do
// Morro). De dia (8h–18h30, sem chuva forte), com o jogador a menos de BUILD m, os meninos jogam 5 contra 5 — CAMISA × SEM CAMISA (os sem
// camisa: civil_banhista) —, com goleiro, condução, passe, chute a gol, lateral, tiro de meta e comemoração.
//   • A BOLA tem física (gravidade, quique, atrito de rolar, trave, travessão, rede, as paredes dos barracos) e bate em quem estiver
//     no caminho: os meninos, o jogador (correndo, ele empurra a bola — conduz; com o golpe, CHUTA: soco = "mão na bola") e carro/moto.
//   • Invadir o jogo IRRITA (anger, 0–100): ficar na quadra perto do jogo, encostar na bola, chutar ela longe, trombar num menino,
//     entrar de carro. Com STOP o jogo para, eles encaram e o mais folgado vem tirar satisfação; com FIGHT (ou se você bater em um),
//     2–3 partem para a briga (FightState, a mão livre) e o resto grita em volta. Saiu da quadra e deixou eles em paz: a raiva baixa e
//     o jogo recomeça (quem fugiu ou brigou volta). Tiro por perto, arma de fogo na mão ou carro em cima: todo mundo corre. Temido no
//     bairro (WorldMemory: medo ≥ 45): reclamam baixinho e, em vez de brigar, vão embora.
//   • Na beira da quadra, a TORCIDA do morro (E.fans: a vovó, a vizinha, o tio do bar) olha a bola, comemora gol, comenta o jogo,
//     reclama de quem atrapalha e grita na briga — e também corre do tiro.
// Os meninos (e a torcida) são NPCs de verdade (NPCManager; party: não são reciclados) no modo livre (NPC.free: movidos aqui, sem o
// crowd do Recast), no estado PeladaState. Teste: Pelada.force = true (joga a qualquer hora).
// ============================================================================

class PeladaState {
    constructor(npc, kid) { this.npc = npc; this.kid = kid; this.name = 'PELADA'; }
    enter() {
        const k = this.kid, s = Pelada._spotOf(k);
        k.vx = k.vz = 0; k.kickT = 0;
        if (hypot(this.npc.position.x - s.x, this.npc.position.z - s.z) > 4) k.back = true;      // longe: volta andando pelo crowd
        else { k.back = false; if (!this.npc.free) this.npc.enterFree(); }
    }
    update() { /* (Pelada.update move os meninos — todos juntos, todo quadro) */ }
    anim(speed) { return Pelada._anim(this.kid, speed); }
    onHurt(from) { Pelada._kidHurt(this.kid, from); }
    onPanic(threat) { return Pelada._kidPanic(this.kid, threat); }      // (false: NPC.panic segue — foge pelo crowd)
    exit() { this.kid.kickT = 0; }
}

const Pelada = {
    force: false,
    on: false, E: null, q: null,
    R: 0.12,                                   // raio da bola (futsal: ~22 cm; desenhada um pouco maior — VIS — para aparecer na câmera de cima)
    VIS: 1.35,
    STOP: 30, FIGHT: 70,                       // raiva: o jogo para / partem para a briga
    BUILD: 70, DROP: 100,                      // monta o jogo a BUILD m da quadra e desmonta a DROP (a quadra aparece na tela a ~35 m; a casa
                                               // do começo do jogo fica a ~110 m: lá não pesa)
    TYPES_B: ['civil_estudante', 'civil_mano', 'civil_torcedor', 'civil_skatista', 'civil_topete'],      // time com camisa
    FANS: [['civil_vovo', -9, 1], ['civil_black_power', -3.5, 1], ['civil_trabalhador', 4, 1], ['civil_trancas', 9.5, 1], ['civil_senhor', 6.5, -1]],      // torcida: [tipo, x do meio, lado (1 = norte)]
    ROLES: [['gk', 0.03, 0], ['fixo', 0.24, 0], ['ala', 0.46, -0.62], ['ala', 0.46, 0.62], ['pivo', 0.7, 0]],      // [papel, u, v] (u: do gol dele, 0, ao do outro, 1)
    LINES: {
        play: ['Toca! Toca!', 'Passa a bola, fominha!', 'Olha a marcação!', 'Chuta, chuta!', 'Tô livre! Tô livre!', 'Volta, volta!', 'É meu! Deixa!', 'Ladrão! Foi falta!'],
        goal: ['GOOOOOL!', 'GOLAÇO!', 'É GOL, PORRA!', 'Chupa! Chupa!', 'No ângulo!'],
        warn: ['Ô, tio! Sai da quadra que tá tendo jogo!', 'Ô, maluco, tá atrapalhando!', 'Sai da frente aí, pô!', 'Aqui é quadra, não é rua não!'],
        ball: ['Devolve a bola!', 'Ô, a bola! Larga a bola!', 'Qual é, mano? A bola é nossa!', 'Quer jogar? Então pede, pô!'],
        kicked: ['Tá maluco?! Vai buscar!', 'Chutou longe, vai buscar agora!', 'Qual foi?! Foi de propósito!'],
        bump: ['Olha por onde anda!', 'Ô, cuidado aí!', 'Tá cego?!'],
        argue: ['Vai ficar de graça aí? Vaza!', 'Tá de sacanagem com a nossa cara?', 'Sai fora, tio! Última vez!', 'Tá procurando confusão?'],
        fight: ['Agora tu vai ver!', 'Pega ele! Pega!', 'Vem, que aqui é nós!'],
        crowd: ['Porrada! Porrada!', 'Ihhh, deu ruim!', 'Pega ele, pega!', 'Deixa, deixa!'],
        fear: ['Fala baixo… é aquele cara.', 'Deixa ele, mano. Deixa…', 'Vamo embora, vamo embora.'],
        resume: ['Bora, bora! Continua!', 'Bola no meio, recomeça!', 'Valeu… bora jogar.'],
        invite: ['Ô, tio! Quer jogar? Fica no gol!', 'Chega aí, falta um!'],
        fan: ['Esse moleque joga muito!', 'Ô juiz! Cadê o juiz?', 'Bota o menor no gol!', 'Vai, Dudu! Vai!', 'Toca pro lado, menino!', 'Olha a bola na janela, hein!', 'Na minha época era descalço!'],
        fanGoal: ['GOOOL!', 'Uhuuu! Golaço!', 'Isso, moleque!', 'Aí sim!'],
        fanStop: ['Ih, vai dar ruim…', 'Deixa os menino jogar, moço!', 'Sai daí, rapaz!', 'Ô, respeita a pelada!'],
        car: ['Tá maluco?! Vai atropelar a gente?!', 'SAI COM ESSE CARRO DAÍ!'],
    },

    // ---------------------------------------------------------------- a quadra
    court() {
        if (this.q) return this.q;
        const s = typeof FavelaPlan !== 'undefined' && FavelaPlan.built && FavelaPlan.squares.find((o) => o.kind === 'quadra');
        if (!s) return null;
        const m = 1.2, lx0 = s.x0 + m, lx1 = s.x1 - m, lz0 = s.z0 + m, lz1 = s.z1 - m;          // as linhas (WorldBuilder: margem 1,2)
        return (this.q = { x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1, lx0, lx1, lz0, lz1, mx: (s.x0 + s.x1) / 2, mz: (s.z0 + s.z1) / 2, gw: 1.6, gh: 2.0, net: 0.9 });
    },
    // (x, z) no jogo do time t: u do gol dele (0) ao do outro (1), v da lateral −1 à +1.
    _at(t, u, v) {
        const q = this.q, ox = t === 0 ? q.lx0 : q.lx1, d = t === 0 ? 1 : -1;
        return { x: ox + d * u * (q.lx1 - q.lx0), z: q.mz + v * (q.lz1 - q.lz0) / 2 };
    },
    _uOf(t, x) { const q = this.q; return t === 0 ? (x - q.lx0) / (q.lx1 - q.lx0) : (q.lx1 - x) / (q.lx1 - q.lx0); },
    _inLines(x, z, m = 0) { const q = this.q; return x > q.lx0 - m && x < q.lx1 + m && z > q.lz0 - m && z < q.lz1 + m; },
    scheduled(g) {
        if (this.force) return true;
        const h = g.dayNight.hour, rain = typeof Weather !== 'undefined' && Weather.cur ? Weather.cur.k : 0;
        return h >= 8 && h < 18.5 && rain < 0.3;
    },

    // ---------------------------------------------------------------- ciclo
    update(dt, g) {
        this.g = g;
        if (!this.court() || !g.npcManager || !g.aiReady) return;
        const q = this.q, p = g._playerState().pos, dist = hypot(p.x - q.mx, p.z - q.mz);
        this.on = this.scheduled(g);
        const E = this.E;
        if (!E) { if (this.on && dist < this.BUILD && !Interiors.active) this._build(g); return; }
        const fighting = E.kids.some((k) => k.npc.alive && k.npc.fsm.name === 'FIGHT');
        if (!fighting && (dist > this.DROP || Interiors.active || (!this.on && dist > 40) || E.over && dist > 60)) { this._destroy(); return; }
        dt = Math.min(dt, 0.1);
        E.t += dt;
        this._ballStep(dt);
        this._contacts(dt);
        this._referee(dt);
        this._mood(dt);
        this._ai(dt);
        this._chatter(dt);
        this._ballDraw();
    },

    _build(g) {
        const q = this.q, M = g.npcManager, sc = g.scene, kids = [];
        const E = this.E = { t: 0, kids, anger: 0, stop: false, fight: false, over: false, scared: 0, score: [0, 0], pause: 1.5, kickoff: Math.random() < 0.5 ? 0 : 1,
            restart: null, hold: null, meshes: [], sayT: 2, touchT: 0, warned: 0, owner: null, cool: 0, lastSeen: null };
        for (let t = 0; t < 2; t++) this.ROLES.forEach(([role, u, v], i) => {
            const s = this._at(t, u, v), pos = g.nav.closestPoint(new BABYLON.Vector3(s.x, 0, s.z), 6) || new BABYLON.Vector3(s.x, 0, s.z);
            const npc = new NPC(sc, g.nav, pos, 13000 + (this._id = (this._id || 0) + 1), g.sprites, g.npcCtx, null);
            const type = t === 0 ? 'civil_banhista' : this.TYPES_B[i % this.TYPES_B.length];
            if (typeof NpcArt !== 'undefined' && NpcArt.atlases && NpcArt.atlases[type]) npc.wearLook(NpcArt.sheet(type), NpcArt.row(type, Math.floor(Math.random() * (NpcData.nvar(type) || 1))));
            npc.party = true;
            M.npcs.push(npc);
            const k = { npc, team: t, role, u, v, vx: 0, vz: 0, kickT: 0, touchCd: 0, bumpCd: 0, sayCd: 0, back: false, gone: false, st: null };
            k.st = new PeladaState(npc, k);
            npc.fsm.setState(k.st);
            npc.heading = t === 0 ? Math.PI / 2 : -Math.PI / 2;
            kids.push(k);
        });
        // a torcida na beira (fora das linhas), virada para o jogo
        E.fans = [];
        for (const [type, dx, sd] of this.FANS) {
            const x = q.mx + dx, z = sd > 0 ? q.z1 - 0.45 : q.z0 + 0.45, pos = g.nav.closestPoint(new BABYLON.Vector3(x, 0, z), 2);
            if (!pos || hypot(pos.x - x, pos.z - z) > 1.5) continue;
            const npc = new NPC(sc, g.nav, pos, 13000 + (this._id = (this._id || 0) + 1), g.sprites, g.npcCtx, null);
            if (typeof NpcArt !== 'undefined' && NpcArt.atlases && NpcArt.atlases[type]) npc.wearLook(NpcArt.sheet(type), NpcArt.row(type, Math.floor(Math.random() * (NpcData.nvar(type) || 1))));
            npc.party = true;
            M.npcs.push(npc);
            const k = { npc, team: -1, role: 'fan', home: { x: pos.x, z: pos.z }, vx: 0, vz: 0, kickT: 0, touchCd: 0, bumpCd: 0, sayCd: 0, back: false, gone: false, st: null };
            k.st = new PeladaState(npc, k);
            npc.fsm.setState(k.st);
            npc.heading = sd > 0 ? Math.PI : 0;
            E.fans.push(k);
        }
        // a bola (gomos pretos num branco) e a sombra dela; as redes atrás das traves
        const R = this.R, ball = BABYLON.MeshBuilder.CreateSphere('peladaBall', { diameter: 2 * R * this.VIS, segments: 12 }, sc);
        ball.material = this._ballMat(sc); ball.isPickable = false;
        const sh = BABYLON.MeshBuilder.CreateDisc('peladaBallSh', { radius: R * this.VIS * 1.1, tessellation: 14 }, sc);
        sh.rotation.x = Math.PI / 2; sh.material = this._shadowMat(sc); sh.isPickable = false;
        E.ball = { x: q.mx, y: R, z: q.mz, vx: 0, vy: 0, vz: 0, m: ball, sh, last: null, lastTeam: -1 };
        E.meshes.push(ball, sh, ...this._nets(sc));
        this._kickoffSpot();
    },
    _destroy() {
        const E = this.E; this.E = null;
        if (!E) return;
        for (const k of E.kids.concat(E.fans || [])) { try { this.g.npcManager.removeNpc(k.npc); } catch (e) { /* ok */ } }
        for (const m of E.meshes) { try { m.dispose(); } catch (e) { /* ok */ } }
    },

    _ballMat(sc) {
        if (sc._peladaBallMat) return sc._peladaBallMat;
        const tex = new BABYLON.DynamicTexture('peladaBallT', { width: 128, height: 64 }, sc, false), c = tex.getContext();
        c.fillStyle = '#f4f4f0'; c.fillRect(0, 0, 128, 64);
        c.fillStyle = '#16161a';
        for (const [x, y] of [[16, 16], [48, 40], [80, 16], [112, 40], [32, 56], [96, 56], [64, 4]]) {
            c.beginPath(); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - Math.PI / 2; c.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); } c.closePath(); c.fill();
        }
        tex.update();
        const m = sc._peladaBallMat = new BABYLON.StandardMaterial('peladaBallM', sc);
        m.diffuseTexture = tex; m.emissiveColor = new BABYLON.Color3(0.32, 0.32, 0.32); m.specularColor = new BABYLON.Color3(0.15, 0.15, 0.15);
        return m;
    },
    _shadowMat(sc) {
        if (sc._peladaShMat) return sc._peladaShMat;
        const m = sc._peladaShMat = new BABYLON.StandardMaterial('peladaShM', sc);
        m.diffuseColor = BABYLON.Color3.Black(); m.specularColor = BABYLON.Color3.Black(); m.alpha = 0.35; m.disableLighting = true;
        return m;
    },
    // Rede de cada gol: fundo, laterais e teto (malha branca translúcida) atrás das traves que o WorldBuilder desenha.
    _nets(sc) {
        const q = this.q, out = [];
        let m = sc._peladaNetMat;
        if (!m) {
            const tex = new BABYLON.DynamicTexture('peladaNetT', { width: 64, height: 64 }, sc, false), c = tex.getContext();
            c.clearRect(0, 0, 64, 64); c.strokeStyle = 'rgba(240,240,236,0.9)'; c.lineWidth = 2;
            for (let i = 0; i <= 64; i += 8) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 64); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(64, i); c.stroke(); }
            tex.hasAlpha = true; tex.update();
            m = sc._peladaNetMat = new BABYLON.StandardMaterial('peladaNetM', sc);
            m.diffuseTexture = tex; m.useAlphaFromDiffuseTexture = true; m.emissiveColor = new BABYLON.Color3(0.6, 0.6, 0.6); m.backFaceCulling = false; m.specularColor = BABYLON.Color3.Black();
        }
        for (const [gx, d] of [[q.lx0, -1], [q.lx1, 1]]) {
            const bx = gx + d * q.net, w = 2 * q.gw, add = (mesh, uS, vS) => { mesh.material = m; mesh.isPickable = false; out.push(mesh); return mesh; };
            const back = add(BABYLON.MeshBuilder.CreatePlane('peladaNet', { width: w, height: q.gh }, sc));
            back.position.set(bx, q.gh / 2, q.mz); back.rotation.y = Math.PI / 2;
            for (const s of [-1, 1]) {
                const side = add(BABYLON.MeshBuilder.CreatePlane('peladaNet', { width: q.net, height: q.gh }, sc));
                side.position.set(gx + d * q.net / 2, q.gh / 2, q.mz + s * q.gw);
            }
            const top = add(BABYLON.MeshBuilder.CreatePlane('peladaNet', { width: q.net, height: w }, sc));
            top.position.set(gx + d * q.net / 2, q.gh, q.mz); top.rotation.x = Math.PI / 2;
        }
        return out;
    },

    // ---------------------------------------------------------------- a bola
    // Passos de ≤ 1/60 s: gravidade e quique (amortece), atrito de rolar no chão, ar; paredes (MapGeo.resolveCircle: a normal do
    // empurrão reflete a velocidade); traves, travessão e rede.
    _ballStep(dt) {
        const B = this.E.ball, R = this.R, n = Math.max(1, Math.ceil(dt * 60)), h = dt / n;
        if (this.E.hold) return;                                                   // (na mão do goleiro)
        for (let i = 0; i < n; i++) {
            const px = B.x, py = B.y, pz = B.z;
            const air = B.y > R + 0.005 || B.vy > 0.01;
            if (air) { B.vy -= 9.8 * h; const k = 1 - 0.08 * h; B.vx *= k; B.vz *= k; }
            B.x += B.vx * h; B.y += B.vy * h; B.z += B.vz * h;
            if (B.y < R) {
                B.y = R;
                if (B.vy < -1.2) { B.vy = -B.vy * 0.55; B.vx *= 0.9; B.vz *= 0.9; if (B.vy > 2) this._thump(0.12); }
                else B.vy = 0;
            }
            if (B.y <= R + 0.005 && B.vy === 0) {                                  // rolando: atrito (mais forte em velocidade alta: o quique raso)
                const s = hypot(B.vx, B.vz), ns = Math.max(0, s - (0.8 + 0.18 * s) * h);
                if (s > 1e-4) { B.vx *= ns / s; B.vz *= ns / s; } else { B.vx = B.vz = 0; }
            }
            if (B.y < 2.6) {                                                        // paredes dos barracos, muros
                const o = this._tmp || (this._tmp = { x: 0, z: 0 });
                o.x = B.x; o.z = B.z;
                if (MapGeo.resolveCircle(o, R)) {
                    const nx = o.x - B.x, nz = o.z - B.z, l = hypot(nx, nz);
                    if (l > 1e-6) { const ux = nx / l, uz = nz / l, vn = B.vx * ux + B.vz * uz; if (vn < 0) { B.vx -= 1.6 * vn * ux; B.vz -= 1.6 * vn * uz; if (vn < -3) this._thump(0.18); } }
                    B.x = o.x; B.z = o.z;
                }
            }
            this._goalFrame(px, py, pz);
        }
        B.spinX = (B.spinX || 0) + B.vz * dt / R; B.spinZ = (B.spinZ || 0) - B.vx * dt / R;
    },
    // Traves (círculos de 8 cm), travessão e a rede (a caixa atrás da linha: entrou pela boca do gol, fica presa e amortece; bateu por fora,
    // volta). A linha do gol cruzada pela boca vira GOL em _referee.
    _goalFrame(px, py, pz) {
        const B = this.E.ball, q = this.q, R = this.R;
        for (const [gx, d] of [[q.lx0, -1], [q.lx1, 1]]) {
            if (Math.abs(B.x - gx) > q.net + 1.5 || Math.abs(B.z - q.mz) > q.gw + 1.5) continue;
            for (const s of [-1, 1]) {                                              // traves
                const cz = q.mz + s * q.gw, dx = B.x - gx, dz = B.z - cz, dd = hypot(dx, dz), rr = R + 0.08;
                if (B.y < q.gh && dd < rr && dd > 1e-6) {
                    const ux = dx / dd, uz = dz / dd, vn = B.vx * ux + B.vz * uz;
                    B.x = gx + ux * rr; B.z = cz + uz * rr;
                    if (vn < 0) { B.vx -= 1.7 * vn * ux; B.vz -= 1.7 * vn * uz; this._thump(0.3, 1400); }
                }
            }
            const inside = (x, z) => (x - gx) * d > 0 && (x - gx) * d < q.net && Math.abs(z - q.mz) < q.gw;
            const wasIn = inside(px, pz), isIn = inside(B.x, B.z);
            if (!isIn && !wasIn) {
                if ((B.x - gx) * d > 0 && (B.x - gx) * d < q.net + R && Math.abs(B.z - q.mz) < q.gw + R && B.y < q.gh + R && (px - gx) * d >= q.net) {      // bateu na rede por trás
                    B.x = px; B.vx = -B.vx * 0.3;
                }
                continue;
            }
            if (!wasIn && isIn) {                                                   // entrando: pela boca (abaixo do travessão) ou por cima/lado
                const mouth = (px - gx) * d <= 0 && py < q.gh - R;
                if (!mouth) { B.x = px; B.z = pz; B.vx = -B.vx * 0.3; B.vz = -B.vz * 0.3; continue; }
                if (B.y > q.gh - R && B.vy > -1) { B.vy = -Math.abs(B.vy) * 0.4; }   // (raspou o travessão)
            }
            // dentro da rede: amortece e não sai pelo fundo, lados nem teto
            const k = Math.exp(-6 / 60);
            B.vx *= k; B.vz *= k;
            if ((B.x - gx) * d > q.net - R) { B.x = gx + d * (q.net - R); B.vx = -B.vx * 0.15; }
            if (Math.abs(B.z - q.mz) > q.gw - R) { B.z = q.mz + Math.sign(B.z - q.mz) * (q.gw - R); B.vz = -B.vz * 0.15; }
            if (B.y > q.gh - R) { B.y = q.gh - R; B.vy = Math.min(0, B.vy); }
        }
    },
    _thump(vol, f0 = 900) {
        const B = this.E.ball;
        if (typeof AudioFX !== 'undefined' && AudioFX._burst) AudioFX._burst(B.x, B.z, { vol, dur: 0.05, f0, f1: 280, maxDist: 45 });
    },
    _ballDraw() {
        const B = this.E.ball, q = this.E.hold;
        if (q) { const n = q.kid.npc, a = n.heading; B.x = n.position.x + Math.sin(a) * 0.32; B.z = n.position.z + Math.cos(a) * 0.32; B.y = 0.95; B.vx = B.vy = B.vz = 0; }      // (no colo do goleiro: acima de quem corre nela)
        B.m.position.set(B.x, B.y + this.R * (this.VIS - 1), B.z); B.m.rotation.x = B.spinX || 0; B.m.rotation.z = B.spinZ || 0;
        const k = Math.max(0.45, 1 - (B.y - this.R) * 0.25);
        B.sh.position.set(B.x + 0.04, 0.03, B.z - 0.04); B.sh.scaling.set(k, k, 1);
    },
    // Chute: a bola sai a `sp` m/s para (dx, dz) (normalizado aqui) com `up` m/s para cima.
    _kick(dx, dz, sp, up, who, team) {
        const B = this.E.ball, l = hypot(dx, dz) || 1;
        B.vx = dx / l * sp; B.vz = dz / l * sp; B.vy = up;
        if (up > 0 && B.y < this.R + 0.01) B.y = this.R + 0.01;
        B.last = who; B.lastTeam = team;
        this.E.hold = null;
        this._thump(Math.min(0.35, 0.08 + sp * 0.018), 700 + sp * 30);
    },

    // ---------------------------------------------------------------- contatos: meninos, jogador, carro
    _contacts(dt) {
        const E = this.E, B = E.ball, g = this.g, pl = g.player, R = this.R;
        if (E.cool > 0) E.cool -= dt;
        // meninos em jogo (e a torcida na beira): a bola bate nas pernas de quem não a está conduzindo
        for (const k of E.kids.concat(E.fans)) {
            if (k.bumpCd > 0) k.bumpCd -= dt;
            if (k.touchCd > 0) k.touchCd -= dt;
            if (k.kickT > 0) k.kickT -= dt;
            if (!this._playing(k) || E.hold || k.back || E.owner === k || k.touchCd > 0) continue;      // (quem acabou de tocar não rebate a própria bola)
            const p = k.npc.position, dx = B.x - p.x, dz = B.z - p.z, d = hypot(dx, dz);
            if (B.y < 0.9 && d < 0.3 + R && d > 1e-6) this._deflect(dx / d, dz / d, k.vx, k.vz, 0.3 + R, p, 0.35);
        }
        // o jogador a pé
        if (g.mode === 'player' && pl.alive && !pl.rag && !pl.frozen) {
            const p = pl.position, v = pl.velocity, dx = B.x - p.x, dz = B.z - p.z, d = hypot(dx, dz), r = (Config.player.radius || 0.35) + R;
            const A = pl.action;
            if (A && A !== E.lastSeen && /^(kick|punch|punchL|swing|stab)$/.test(A.name)) {          // golpe perto da bola: chuta (soco = mão na bola)
                E.lastSeen = A;
                const h = pl.root.rotation.y, fx = Math.sin(h), fz = Math.cos(h), front = d > 1e-6 ? (dx * fx + dz * fz) / d : 1;
                if (d < 1.35 && B.y < 1.4 && (front > 0.2 || d < 0.45)) {
                    const hard = A.name === 'kick' || A.name === 'swing';
                    this._kick(fx + dx / (d || 1) * 0.3, fz + dz / (d || 1) * 0.3, hard ? 15 + Math.random() * 4 : 7, hard ? 3 + Math.random() * 2.5 : 1.2, 'player', -1);
                    this._annoy(hard ? 22 : 14, hard ? 'kicked' : 'ball');
                    if (!hard) this._say(this._near(p.x, p.z), 'Mão na bola, ô tio?!', 'angry');
                }
            }
            if (B.y < 0.8 && d < r && d > 1e-6) {                                  // correu na bola: empurra (conduz)
                const ux = dx / d, uz = dz / d, vn = v.x * ux + v.z * uz;
                B.x = p.x + ux * r; B.z = p.z + uz * r;
                B.vx = v.x * 1.15 + ux * (Math.max(0, vn) * 0.5 + 0.8); B.vz = v.z * 1.15 + uz * (Math.max(0, vn) * 0.5 + 0.8);
                if (hypot(v.x, v.z) > 3.5 && B.vy === 0) B.vy = 0.6;
                B.last = 'player'; B.lastTeam = -1; E.hold = null;
                if (E.touchT <= 0) { E.touchT = 0.7; this._annoy(9, 'ball'); }
            }
            if (E.touchT > 0) E.touchT -= dt;
            // trombou num menino
            for (const k of E.kids) {
                if (!this._playing(k)) continue;
                const q = k.npc.position, ex = q.x - p.x, ez = q.z - p.z, e = hypot(ex, ez);
                if (e < 0.62 && e > 1e-6) {
                    q.x = p.x + ex / e * 0.62; q.z = p.z + ez / e * 0.62;
                    if (hypot(v.x, v.z) > 2.2 && k.bumpCd <= 0) { k.bumpCd = 1.5; this._annoy(8); this._say(k, this._pick(this.LINES.bump), 'angry'); }
                }
            }
        }
        // carro/moto: leva a bola e espalha os meninos
        const car = g.mode === 'car' && g.activeCar;
        if (car && car.position) {
            const c = car.position, sp = Math.abs(car.forwardSpeed || 0), dx = B.x - c.x, dz = B.z - c.z, d = hypot(dx, dz), r = car.isBike ? 0.7 : 1.6;
            if (d < r && d > 1e-6 && B.y < 1.2) { const v = car.velocity || { x: 0, z: 0 }; this._kick(v.x * 1.3 + dx / d * 2, v.z * 1.3 + dz / d * 2, Math.max(4, sp * 1.4), 2 + sp * 0.15, 'player', -1); }
            if (this._inLines(c.x, c.z, 1.5) && sp > 1) {
                this._annoy(40 * dt, null);
                if (E.cool <= 0) { E.cool = 3; this._say(this._near(c.x, c.z), this._pick(this.LINES.car), 'shout'); }
                for (const k of E.kids) if (this._playing(k) && hypot(k.npc.position.x - c.x, k.npc.position.z - c.z) < 5) k.npc.panic(c, true);
            }
        }
    },
    // A bola bateu em alguém parado/andando (círculo de raio r em `p`, velocidade vx/vz): sai para fora e reflete (e = elasticidade).
    _deflect(ux, uz, vx, vz, r, p, e) {
        const B = this.E.ball, rvx = B.vx - vx, rvz = B.vz - vz, vn = rvx * ux + rvz * uz;
        B.x = p.x + ux * r; B.z = p.z + uz * r;
        if (vn < 0) { B.vx -= (1 + e) * vn * ux; B.vz -= (1 + e) * vn * uz; }
    },

    // ---------------------------------------------------------------- juiz: gol, lateral, fundo
    _referee(dt) {
        const E = this.E, B = E.ball, q = this.q;
        if (E.goalT > 0) {                                                          // comemorando
            if ((E.goalT -= dt) <= 0) { this._kickoffSpot(); E.pause = 2; }
            return;
        }
        if (E.restart) { this._restartTick(dt); return; }
        if (E.pause > 0 || E.stop) return;
        // GOL: a bola dentro da rede
        for (const [gx, d, t] of [[q.lx0, -1, 1], [q.lx1, 1, 0]]) {
            if ((B.x - gx) * d > this.R && (B.x - gx) * d < q.net && Math.abs(B.z - q.mz) < q.gw && B.y < q.gh) { this._goal(t); return; }
        }
        // saiu: lateral (pelos lados) ou fundo (atrás do gol) — o time que não tocou por último repõe
        const outSide = B.z < q.lz0 - this.R || B.z > q.lz1 + this.R, outEnd = B.x < q.lx0 - this.R || B.x > q.lx1 + this.R;
        if (!outSide && !outEnd) return;
        const team = B.lastTeam === 0 ? 1 : B.lastTeam === 1 ? 0 : (B.x < q.mx ? 0 : 1);
        let spot;
        if (outEnd && !outSide) {                                                   // tiro de meta (do goleiro do lado) ou escanteio
            const side = B.x < q.mx ? 0 : 1, gkTeam = side;
            if (team === gkTeam) spot = { x: side === 0 ? q.lx0 + 1.2 : q.lx1 - 1.2, z: q.mz + (B.z > q.mz ? 1 : -1) * 1.5, kind: 'meta' };
            else spot = { x: side === 0 ? q.lx0 + 0.25 : q.lx1 - 0.25, z: B.z > q.mz ? q.lz1 - 0.25 : q.lz0 + 0.25, kind: 'canto' };
        } else spot = { x: Math.max(q.lx0 + 0.5, Math.min(q.lx1 - 0.5, B.x)), z: B.z < q.mz ? q.lz0 + 0.2 : q.lz1 - 0.2, kind: 'lateral' };
        const by = B.last === 'player' ? 'player' : null;
        E.restart = { team, spot, t: 0, taker: null, by, far: hypot(B.x - spot.x, B.z - spot.z) > 7 };
        if (by && E.restart.far) this._annoy(18, 'kicked');
    },
    _restartTick(dt) {
        const E = this.E, B = E.ball, Rs = E.restart;
        Rs.t += dt;
        if (!Rs.taker || !this._playing(Rs.taker)) {
            const L = E.kids.filter((k) => this._playing(k) && k.team === Rs.team && (k.role !== 'gk' || Rs.spot.kind === 'meta'));
            if (!L.length) { E.restart = null; return; }
            Rs.taker = L.sort((a, b) => hypot(a.npc.position.x - B.x, a.npc.position.z - B.z) - hypot(b.npc.position.x - B.x, b.npc.position.z - B.z))[0];
        }
        const p = Rs.taker.npc.position, dBall = hypot(p.x - B.x, p.z - B.z), moving = hypot(B.vx, B.vz) > 0.4;
        if (!Rs.placed && (dBall < 0.7 && !moving || Rs.t > 14)) {                   // pegou a bola (ou demorou demais): põe no lugar
            Rs.placed = Rs.t; B.x = Rs.spot.x; B.z = Rs.spot.z; B.y = this.R; B.vx = B.vy = B.vz = 0;
        }
        if (Rs.placed && Rs.t - Rs.placed > 0.9 && hypot(p.x - B.x, p.z - B.z) < 0.8) {      // repõe: passa para um companheiro
            const mate = this._passTarget(Rs.taker);
            if (mate) this._kick(mate.x - B.x, mate.z - B.z, Math.min(12, 3 + hypot(mate.x - B.x, mate.z - B.z) * 1.3), Rs.spot.kind === 'meta' ? 2 : 0.4, Rs.taker, Rs.taker.team);
            else this._kick(Rs.team === 0 ? 1 : -1, 0, 8, 0.5, Rs.taker, Rs.taker.team);
            Rs.taker.kickT = 0.45; Rs.taker.touchCd = 0.6;
            E.restart = null;
        }
    },
    _goal(team) {
        const E = this.E;
        E.score[team]++;
        E.goalT = 4.5; E.owner = null;
        const scorer = E.ball.last && E.ball.last !== 'player' ? E.ball.last : null;
        E.celebrate = { team, scorer };
        const s = scorer && scorer.team === team ? scorer : E.kids.find((k) => this._playing(k) && k.team === team);
        if (E.ball.last === 'player') this._say(this._near(E.ball.x, E.ball.z), 'Não valeu! Não valeu, foi o tio!', 'angry');
        else if (s) { this._say(s, this._pick(this.LINES.goal), 'shout'); setTimeout(() => this.E && this._say(this._near(this.q.mx, this.q.mz), `${E.score[0]} a ${E.score[1]}!`, 'talk'), 1300); }
        const fan = this._pick(E.fans.filter((f) => this._playing(f)).concat([null]));
        if (fan && E.ball.last !== 'player') setTimeout(() => this.E && this._say(fan, this._pick(this.LINES.fanGoal), 'shout'), 700);
        E.kickoff = team === 0 ? 1 : 0;
    },
    _kickoffSpot() {
        const E = this.E, B = E.ball, q = this.q;
        B.x = q.mx; B.z = q.mz; B.y = this.R; B.vx = B.vy = B.vz = 0; B.last = null; B.lastTeam = -1;
        E.hold = null; E.owner = null; E.restart = null; E.celebrate = null;
    },

    // ---------------------------------------------------------------- humor: invasão, briga, recomeço
    _annoy(n, kind = null) {
        const E = this.E;
        if (!E || E.over || E.scared > 0) return;
        E.anger = Math.min(100, E.anger + n);
        if (kind && E.sayT <= 0) { E.sayT = 2.2; const k = this._near(this.g.player.position.x, this.g.player.position.z); this._say(k, this._pick(this.LINES[kind]), 'angry'); }
    },
    _mood(dt) {
        const E = this.E, g = this.g, pl = g.player, p = pl.position, q = this.q;
        if (E.sayT > 0) E.sayT -= dt;
        if (E.scared > 0) E.scared -= dt;
        const onFoot = g.mode === 'player' && pl.alive, inCourt = onFoot && this._inLines(p.x, p.z, 0.3);
        const nearPlay = inCourt && (hypot(p.x - E.ball.x, p.z - E.ball.z) < 7 || E.kids.some((k) => this._playing(k) && hypot(k.npc.position.x - p.x, k.npc.position.z - p.z) < 3));
        const fear = typeof WorldMemory !== 'undefined' ? WorldMemory.fameAt(q.mx, q.mz).fear : 0;
        if (inCourt && !E.over) {
            E.anger = Math.min(100, E.anger + dt * (nearPlay ? 5 : 1.5));
            if (E.anger > 8 && E.warned < 1 && E.sayT <= 0) { E.warned = 1; E.sayT = 3; this._say(this._near(p.x, p.z), this._pick(fear >= 45 ? this.LINES.fear : this.LINES.warn), fear >= 45 ? 'whisper' : 'shout'); }
        } else {
            const far = !onFoot || hypot(p.x - q.mx, p.z - q.mz) > 18;
            E.anger = Math.max(0, E.anger - dt * (far ? 7 : 4));
            if (E.anger < 4) E.warned = 0;
        }
        // arma de fogo na mão perto da quadra, depois de irritar: correm
        if (onFoot && E.anger >= this.STOP && !E.fight && hypot(p.x - q.mx, p.z - q.mz) < 20 && Temper.threat(pl, g) === 'gun') { this._scatter(p); return; }
        if (!E.stop && E.anger >= this.STOP) {
            E.stop = true; E.argueT = 0;
            this._say(this._near(p.x, p.z), this._pick(fear >= 45 ? this.LINES.fear : this.LINES.argue), fear >= 45 ? 'whisper' : 'angry');
            const fan = E.fans.find((f) => this._playing(f));
            if (fan && fear < 45) setTimeout(() => this.E && this._say(fan, this._pick(this.LINES.fanStop), 'talk'), 1500);
        }
        if (E.stop && !E.fight && E.anger >= this.FIGHT) {
            if (fear >= 45) { this._quit(); return; }
            this._fight();
        }
        if (E.stop && !E.fight && E.anger < 12) { E.stop = false; this._say(this._near(q.mx, q.mz), this._pick(this.LINES.resume), 'talk'); E.pause = Math.max(E.pause, 1); }
        if (E.fight) {
            const busy = E.kids.some((k) => k.npc.alive && /^(FIGHT|HURT)$/.test(k.npc.fsm.name));
            if (!busy && E.anger < 25) { E.fight = false; E.stop = E.anger >= 12; }
            if (busy && E.sayT <= 0) { E.sayT = 2.6; const w = E.kids.concat(E.fans).filter((k) => this._playing(k)); if (w.length) this._say(this._pick(w), this._pick(this.LINES.crowd), 'shout'); }
        }
        // quem fugiu, brigou ou caiu volta para o jogo quando o clima esfria (vivo, de pé e calmo)
        if (!E.fight && !E.over && E.scared <= 0 && E.anger < this.STOP && (!inCourt)) {
            for (const k of E.kids.concat(E.fans)) {
                const n = k.npc;
                if (k.gone || !n.alive) { k.gone = true; continue; }
                if (n.fsm.current === k.st || n.rag || n.fsm.name !== 'WANDER' || hypot(n.position.x - q.mx, n.position.z - q.mz) > 90) continue;
                k.st = new PeladaState(n, k);
                n.fsm.setState(k.st);
            }
        }
        if (E.kids.filter((k) => k.npc.alive && !k.gone).length < 4 && !E.over) this._quit();
    },
    // Partem para cima do jogador: o que veio tirar satisfação e mais um ou dois dos maiores por perto.
    _fight() {
        const E = this.E, g = this.g, pl = g.player, p = pl.position;
        E.fight = true; E.anger = 100;
        const L = E.kids.filter((k) => this._playing(k) && k.role !== 'gk').sort((a, b) => hypot(a.npc.position.x - p.x, a.npc.position.z - p.z) - hypot(b.npc.position.x - p.x, b.npc.position.z - p.z));
        L.slice(0, 2 + (Math.random() < 0.5 ? 1 : 0)).forEach((k, i) => {
            const n = k.npc;
            n.leaveFree();
            n._hitBy = 'player'; n._hitKind = 'punch';
            n.fsm.setState(new FightState(n, pl, { weapon: 'none' }));
            if (i === 0) Bubbles.say(n, this._pick(this.LINES.fight), { tone: 'angry', ms: 2400 });
        });
        if (g.npcManager) g.npcManager.alertViolence(p, 8, E.kids.concat(E.fans).map((k) => k.npc));
    },
    // Bateram nele: revida (com a turma) ou, machucado, foge. Na torcida (a vovó, a vizinha): ela reage como qualquer pedestre e a
    // molecada parte para cima de quem bateu.
    _kidHurt(k, from) {
        const E = this.E, n = k.npc, g = this.g;
        if (!E) return;
        n.leaveFree();
        if (k.role === 'fan') {
            n.fsm.setState(new HurtState(n));
            if (n._hitBy === 'player' && g.mode === 'player' && !E.fight) { E.stop = true; E.anger = this.FIGHT; this._fight(); }
            return;
        }
        if (n._hitBy === 'player' && n.hp >= n.maxHp * 0.4 && g.mode === 'player') {
            E.stop = true; E.anger = this.FIGHT;
            n.fsm.setState(new FightState(n, g.player, { weapon: 'none' }));
            n.fsm.current.onHurt();
            if (!E.fight) this._fight();
        } else { n.fsm.setState(new HurtState(n)); E.scared = Math.max(E.scared, 20); }
    },
    // Susto (NPC.panic). Briga de MÃO perto do jogador (ele socou alguém ali: Game avisa as testemunhas) não espanta a molecada —
    // encaram, e a raiva vai às alturas (a turma parte para cima); arma, tiro, explosão, carro: correm. → true = tratado (não foge).
    _kidPanic(k, threat) {
        const E = this.E, g = this.g, pl = g.player;
        if (!E) return false;
        if (g.mode === 'player' && pl.alive && !pl.rag && threat && hypot(threat.x - pl.position.x, threat.z - pl.position.z) < 4 && Temper.threat(pl, g) === 'hand') {
            this._annoy(35);
            return true;
        }
        this._kidScared(k, threat);
        return false;
    },
    // Um se assustou: sai do modo livre (foge pelo crowd) e a turma toda corre junto.
    _kidScared(k, threat) {
        const E = this.E;
        if (!E) return;
        k.npc.leaveFree();
        E.scared = Math.max(E.scared, 30);
        if (E._scattering) return;
        E._scattering = true;
        try { for (const o of E.kids.concat(E.fans)) if (o !== k && this._playing(o)) o.npc.panic(threat, true); } finally { E._scattering = false; }
    },
    // Todo mundo corre (tiro, arma de fogo, carro): o jogo acaba por agora.
    _scatter(from) {
        const E = this.E;
        E.scared = 40;
        for (const k of E.kids.concat(E.fans)) if (this._playing(k)) k.npc.panic(from, true);
    },
    // Vão embora (temido no bairro, ou sobrou pouca gente): o jogo acabou por hoje.
    _quit() {
        const E = this.E;
        E.over = true; E.stop = true;
        const w = E.kids.find((k) => this._playing(k));
        if (w) this._say(w, this._pick(this.LINES.fear), 'whisper');
        for (const k of E.kids.concat(E.fans)) if (this._playing(k)) { k.npc.leaveFree(); k.npc.toWander(); }
    },

    // ---------------------------------------------------------------- os meninos: posição, corrida, toque na bola
    _playing(k) { return k.npc.alive && !k.npc.rag && k.npc.fsm.current === k.st; },
    _spotOf(k) { return k.home || this._at(k.team, k.u, k.v); },
    _ai(dt) {
        const E = this.E, B = E.ball, q = this.q, pl = this.g.player;
        const kids = E.kids.filter((k) => this._playing(k));
        // dono da bola: quem tocou por último e está colado nela
        if (E.owner && (!this._playing(E.owner) || hypot(E.owner.npc.position.x - B.x, E.owner.npc.position.z - B.z) > 1.3)) E.owner = null;
        const chaser = [null, null];
        if (!E.stop && !(E.pause > 0) && !E.goalT && !E.restart) {
            for (const t of [0, 1]) {
                let best = null, bd = Infinity;
                for (const k of kids) {
                    if (k.team !== t || k.back) continue;
                    if (k.role === 'gk' && !(this._uOf(t, B.x) < 0.2 && Math.abs(B.z - q.mz) < q.gw + 2)) continue;     // goleiro só sai na área dele
                    const d = hypot(k.npc.position.x - B.x, k.npc.position.z - B.z);
                    if (d < bd) { bd = d; best = k; }
                }
                chaser[t] = best;
            }
        }
        const bu = [this._uOf(0, B.x), this._uOf(1, B.x)], bv = (B.z - q.mz) / ((q.lz1 - q.lz0) / 2);
        const own = E.owner ? E.owner.team : B.lastTeam;
        const pausing = E.pause > 0 && !E.stop && !E.goalT && !E.restart;
        if (pausing) E.pause -= dt;
        for (const k of kids) {
            const n = k.npc, p = n.position;
            if (k.back) {                                                           // voltando de longe (crowd): até perto do lugar dele
                const s = this._spotOf(k);
                n.setSpeed(2.6);
                if ((k.repath = (k.repath || 0) - dt) <= 0) { k.repath = 0.6; n.gotoTarget(new BABYLON.Vector3(s.x, 0, s.z)); }
                if (hypot(p.x - s.x, p.z - s.z) < 3 && this._inLines(p.x, p.z, 1)) { k.back = false; n.enterFree(); }
                continue;
            }
            let tx, tz, sp = 3.2, face = null;
            if (E.goalT > 0 && E.celebrate) {                                      // comemoração: o time do gol corre para o artilheiro
                const c = E.celebrate, s = c.scorer && this._playing(c.scorer) ? c.scorer.npc.position : { x: q.mx, z: q.mz };
                if (k.team === c.team && k.role !== 'gk') { tx = s.x + Math.sin(k.npc.id) * 1.2; tz = s.z + Math.cos(k.npc.id) * 1.2; sp = 4.5; if (c.scorer === k) { tx = q.mx + (k.team === 0 ? 4 : -4); tz = q.mz + Math.sin(E.t) * 3; } }
                else { const s2 = this._spotOf(k); tx = s2.x; tz = s2.z; sp = 1.4; }
            } else if (E.stop) {                                                    // jogo parado: encaram o jogador; o primeiro vem tirar satisfação
                const pp = pl.position, near = this._near(pp.x, pp.z, true), close = this.g.mode === 'player' && this._inLines(pp.x, pp.z, 3);
                face = Math.atan2(pp.x - p.x, pp.z - p.z);
                if (k === near && !E.over && close) { const d = hypot(pp.x - p.x, pp.z - p.z) || 1; tx = pp.x - (pp.x - p.x) / d * 1.4; tz = pp.z - (pp.z - p.z) / d * 1.4; sp = 2.2; }
                else { tx = p.x; tz = p.z; sp = 0; }
                if (k === near && close && (E.argueT = (E.argueT || 0) - dt) <= 0) { E.argueT = 3.2; this._say(k, this._pick(this.LINES.argue), 'angry'); }
            } else if (E.restart) {
                const Rs = E.restart;
                if (Rs.taker === k) { tx = Rs.placed ? Rs.spot.x - (Rs.team === 0 ? 0.45 : -0.45) : B.x; tz = Rs.placed ? Rs.spot.z + (Rs.spot.z > q.mz ? 0.3 : -0.3) : B.z; sp = Rs.far ? 4.2 : 3; face = Math.atan2(q.mx - p.x, q.mz - p.z); }
                else { const s = this._formation(k, bu[k.team], bv, own); tx = s.x; tz = s.z; sp = 2.4; }
            } else if (pausing) {                                                   // saída de bola: cada um no seu lado; o pivô de quem sai rola para o lado
                const s = this._formation(k, 0.5, 0, -1), kick = k.team === E.kickoff && k.role === 'pivo';
                tx = kick ? q.mx - (k.team === 0 ? 0.35 : -0.35) : s.x; tz = kick ? q.mz : s.z; sp = 3;
                if (k.u > 0.5 && k.role !== 'pivo') { const s2 = this._at(k.team, Math.min(k.u, 0.46), k.v); tx = s2.x; tz = s2.z; }
                if (E.pause <= 0 && kick) { const mate = this._passTarget(k); if (mate) this._kick(mate.x - B.x, mate.z - B.z, 6, 0.2, k, k.team); k.kickT = 0.45; k.touchCd = 0.5; }
            } else if (k.role === 'gk' && (this._keeper(k, dt) || chaser[k.team] !== k)) {      // goleiro: na linha, entre a bola e o meio do gol (ou com ela no colo)
                const s = this._at(k.team, 0.025, 0), d = k.team === 0 ? 1 : -1, near = bu[k.team] < 0.35;
                tx = s.x + d * (near ? 0.9 : 0.4); tz = q.mz + Math.max(-q.gw * 0.8, Math.min(q.gw * 0.8, (B.z - q.mz) * (near ? 0.6 : 0.3))); sp = 4;
                face = E.hold && E.hold.kid === k ? Math.atan2(q.mx - p.x, q.mz - p.z) : Math.atan2(B.x - p.x, B.z - p.z);
            } else if (chaser[k.team] === k) {                                      // o mais perto da bola vai nela
                tx = B.x + B.vx * 0.25; tz = B.z + B.vz * 0.25; sp = E.owner === k ? 4.3 : 5;
                face = Math.atan2(B.x - p.x, B.z - p.z);
                const d = hypot(p.x - B.x, p.z - B.z);
                if (d < 0.6 && B.y < 0.55 && k.touchCd <= 0) this._touch(k);
            } else {
                const s = this._formation(k, bu[k.team], bv, own); tx = s.x; tz = s.z; sp = 3.4;
                face = Math.atan2(B.x - p.x, B.z - p.z);
            }
            this._move(k, tx, tz, sp, face, dt, kids);
        }
        for (const f of E.fans) {                                                   // torcida: no lugar dela, olhando a bola (ou o jogador, se ele aprontar)
            if (!this._playing(f)) continue;
            const p = f.npc.position, pp = pl.position;
            if (f.back) {
                f.npc.setSpeed(1.6);
                if ((f.repath = (f.repath || 0) - dt) <= 0) { f.repath = 0.8; f.npc.gotoTarget(new BABYLON.Vector3(f.home.x, 0, f.home.z)); }
                if (hypot(p.x - f.home.x, p.z - f.home.z) < 1.5) { f.back = false; f.npc.enterFree(); }
                continue;
            }
            const face = E.stop || E.fight ? Math.atan2(pp.x - p.x, pp.z - p.z) : Math.atan2(B.x - p.x, B.z - p.z);
            this._move(f, f.home.x, f.home.z, 1.4, face, dt, E.fans);
        }
    },
    // Lugar do menino: a formação dele puxada para a bola (avança com a posse do time, recua sem ela).
    // (os dois times em faixas laterais um pouco diferentes: o ala de um não para em cima do ala do outro)
    _formation(k, bu, bv, own) {
        const att = own === k.team ? 0.12 : own === -1 ? 0 : -0.1, side = k.role === 'gk' ? 0 : k.team ? 0.2 : -0.2;
        const u = Math.max(0.08, Math.min(0.9, k.u * 0.62 + bu * 0.38 + att)), v = Math.max(-0.92, Math.min(0.92, k.v * 0.85 + side + bv * 0.35));
        return this._at(k.team, u, v);
    },
    // Anda/corre até (tx, tz): acelera, chega devagar, desvia dos outros (e do jogador), não atravessa parede.
    _move(k, tx, tz, sp, face, dt, kids) {
        const n = k.npc, p = n.position, dx = tx - p.x, dz = tz - p.z, d = hypot(dx, dz);
        let wx = 0, wz = 0;
        if (d > 0.15 && sp > 0) { const s = Math.min(sp, d * 2.2); wx = dx / d * s; wz = dz / d * s; }
        const sep = sp > 4 ? 0.7 : 1.15;                                            // (disputando a bola chegam perto; parados, cada um no seu espaço)
        for (const o of kids) {                                                     // separação
            if (o === k) continue;
            const ox = p.x - o.npc.position.x, oz = p.z - o.npc.position.z, od = hypot(ox, oz);
            if (od < sep && od > 1e-6) { wx += ox / od * (sep - od) * 5; wz += oz / od * (sep - od) * 5; }
        }
        const ex = wx - k.vx, ez = wz - k.vz, el = hypot(ex, ez), st = Math.min(el, 14 * dt);      // aceleração de gente (~14 m/s²)
        if (el > 1e-6) { k.vx += ex / el * st; k.vz += ez / el * st; }
        if (k.kickT > 0) { const f = Math.exp(-8 * dt); k.vx *= f; k.vz *= f; }
        p.x += k.vx * dt; p.z += k.vz * dt;
        MapGeo.resolveCircle(p, Config.npc.radius || 0.3);
        const v = hypot(k.vx, k.vz);
        const want = v > 1.2 ? Math.atan2(k.vx, k.vz) : face != null ? face : n.heading;
        n.heading = n._lerpAngle(n.heading, want, 1 - Math.exp(-10 * dt));
        n._freeV = v;
    },
    // Na bola: chuta a gol (perto), passa (marcado ou com alguém livre na frente) ou conduz (um toque à frente, fugindo da marcação).
    _touch(k) {
        const E = this.E, B = E.ball, q = this.q, p = k.npc.position, d = k.team === 0 ? 1 : -1;
        const gx = k.team === 0 ? q.lx1 : q.lx0, toGoal = hypot(gx - p.x, q.mz - p.z);
        const foes = E.kids.filter((o) => this._playing(o) && o.team !== k.team);
        const press = foes.reduce((m, o) => Math.min(m, hypot(o.npc.position.x - p.x, o.npc.position.z - p.z)), 99);
        k.touchCd = 0.32;
        if (toGoal < 10 && Math.random() < (toGoal < 6 ? 0.7 : 0.35)) {             // chute
            const az = q.mz + (Math.random() * 2 - 1) * q.gw * 0.85, err = (Math.random() - 0.5) * 0.16, ang = Math.atan2(gx - p.x, az - p.z) + err;
            this._kick(Math.sin(ang), Math.cos(ang), 10 + Math.random() * 6, Math.random() < 0.25 ? 2.5 + Math.random() * 2 : Math.random() * 1.2, k, k.team);
            k.kickT = 0.45; k.touchCd = 0.7; E.owner = null;
            return;
        }
        const mate = (press < 1.6 || Math.random() < 0.3) && this._passTarget(k);
        if (mate) {
            const l = hypot(mate.x - B.x, mate.z - B.z), err = (Math.random() - 0.5) * 0.12, ang = Math.atan2(mate.x - B.x, mate.z - B.z) + err;
            this._kick(Math.sin(ang), Math.cos(ang), Math.min(13, 3.5 + l * 1.25), l > 9 ? 2.2 : 0.2, k, k.team);
            k.kickT = 0.4; k.touchCd = 0.55; E.owner = null;
            return;
        }
        // condução: para o gol, escapando de quem marca
        let dx = d, dz = (q.mz - p.z) * 0.08;
        const o = foes.sort((a, b) => hypot(a.npc.position.x - p.x, a.npc.position.z - p.z) - hypot(b.npc.position.x - p.x, b.npc.position.z - p.z))[0];
        if (o) { const ox = p.x - o.npc.position.x, oz = p.z - o.npc.position.z, od = hypot(ox, oz) || 1; if (od < 3) { dx += ox / od * 0.6; dz += oz / od * 0.9; } }
        if (p.z < q.lz0 + 1.2) dz += 0.6; if (p.z > q.lz1 - 1.2) dz -= 0.6;
        this._kick(dx, dz, Math.max(2.2, hypot(k.vx, k.vz) + 1.4), 0, k, k.team);
        E.owner = k;
    },
    // Um companheiro para o passe: mais à frente, livre (ninguém do outro time perto da linha), não longe demais.
    _passTarget(k) {
        const E = this.E, B = E.ball, foes = E.kids.filter((o) => this._playing(o) && o.team !== k.team);
        let best = null, bs = -Infinity;
        for (const m of E.kids) {
            if (m === k || m.team !== k.team || !this._playing(m) || m.back) continue;
            const mp = m.npc.position, l = hypot(mp.x - B.x, mp.z - B.z);
            if (l < 2 || l > 16) continue;
            let block = 99;
            for (const o of foes) {
                const op = o.npc.position, sx = mp.x - B.x, sz = mp.z - B.z, t = Math.max(0, Math.min(1, ((op.x - B.x) * sx + (op.z - B.z) * sz) / (l * l)));
                block = Math.min(block, hypot(B.x + sx * t - op.x, B.z + sz * t - op.z));
            }
            const s = (this._uOf(k.team, mp.x) - this._uOf(k.team, B.x)) * 10 + Math.min(block, 3) * 2 - l * 0.15 + (m.role === 'gk' ? -4 : 0) + Math.random();
            if (s > bs) { bs = s; best = { x: mp.x + m.vx * 0.3, z: mp.z + m.vz * 0.3, kid: m }; }
        }
        return best;
    },
    // Goleiro: bola chegando nele (perto, baixa, na área dele) — segura; um tempo depois, repõe com a mão para um companheiro. → true
    // enquanto está com ela no colo.
    _keeper(k, dt) {
        const E = this.E, B = E.ball, p = k.npc.position;
        if (E.hold && E.hold.kid === k) {
            if ((E.hold.t -= dt) <= 0) {
                E.hold = null; B.y = 0.95;
                const m = this._passTarget(k);
                if (m) this._kick(m.x - B.x, m.z - B.z, Math.min(11, 4 + hypot(m.x - B.x, m.z - B.z)), 2, k, k.team); else this._kick(k.team === 0 ? 1 : -1, 0, 9, 3, k, k.team);
                k.touchCd = 0.8;
                return false;
            }
            return true;
        }
        if (!E.hold && hypot(p.x - B.x, p.z - B.z) < 0.75 && B.y < 1.6 && k.touchCd <= 0 && this._uOf(k.team, B.x) < 0.2 && B.last !== k) {
            E.hold = { kid: k, t: 1.2 }; E.owner = null; B.last = k; B.lastTeam = k.team;
            return true;
        }
        return false;
    },
    // Desenho: chutando, correndo, andando, parado.
    _anim(k, speed) {
        if (k.kickT > 0) return { clip: 'kick', w: 'none', rate: 1.3 };
        if (speed > 2.6) return { clip: 'run', w: 'none', rate: Math.max(0.6, speed / Config.anim.run) };
        if (speed > 0.35) return { clip: 'walk', w: 'none', rate: Math.max(0.5, speed / Config.anim.walk) };
        return { clip: 'idle', w: 'none', rate: 1 };
    },

    // ---------------------------------------------------------------- falas
    _chatter(dt) {
        const E = this.E, g = this.g, p = g.player.position, q = this.q;
        E.chatT = (E.chatT || 3) - dt;
        if (E.chatT > 0 || E.stop || E.goalT > 0) return;
        E.chatT = 4 + Math.random() * 5;
        const L = E.kids.filter((k) => this._playing(k));
        if (!L.length) return;
        const watching = g.mode === 'player' && !this._inLines(p.x, p.z, 0.3) && hypot(p.x - q.mx, p.z - q.mz) < 14 && E.anger < 1;
        if (watching && Math.random() < 0.25) { this._say(this._near(p.x, p.z), this._pick(this.LINES.invite), 'talk'); return; }
        const F = E.fans.filter((f) => this._playing(f));
        if (F.length && Math.random() < 0.3) { this._say(this._pick(F), this._pick(this.LINES.fan), 'talk'); return; }
        this._say(this._pick(L), this._pick(this.LINES.play), Math.random() < 0.3 ? 'shout' : 'talk');
    },
    _say(k, text, tone = 'talk') {
        if (!k || !k.npc || !k.npc.alive || typeof Bubbles === 'undefined') return;
        if (k.sayCd > (this.E ? this.E.t : 0)) return;
        k.sayCd = (this.E ? this.E.t : 0) + 1.6;
        Bubbles.say(k.npc, text, { tone, ms: 2200 });
    },
    // O menino em jogo mais perto de (x, z) (field: só os de linha).
    _near(x, z, field = false) {
        let best = null, bd = Infinity;
        for (const k of this.E ? this.E.kids : []) {
            if (!this._playing(k) || (field && k.role === 'gk')) continue;
            const d = hypot(k.npc.position.x - x, k.npc.position.z - z);
            if (d < bd) { bd = d; best = k; }
        }
        return best;
    },
    _pick(a) { return a[Math.floor(Math.random() * a.length)]; },

    // A bola da pelada ao alcance de um chute de quem está em (p.x, p.z) olhando para `h` (rad)? (Player.primary: desarmado, chuta a bola
    // em vez do soco; Game._onAttack: o chute não acerta ninguém — a Pelada chuta a bola.)
    ballNear(p, h) {
        const E = this.E;
        if (!E || E.hold) return false;
        const B = E.ball, dx = B.x - p.x, dz = B.z - p.z, d = hypot(dx, dz);
        return d < 1.3 && B.y < 0.9 && (d < 0.45 || (dx * Math.sin(h) + dz * Math.cos(h)) / d > -0.2);
    },
    // Para testes/ferramentas: estado resumido.
    info() {
        const E = this.E;
        if (!E) return null;
        return { kids: E.kids.filter((k) => this._playing(k)).length, anger: Math.round(E.anger), stop: E.stop, fight: E.fight, over: E.over, score: E.score.slice(),
            ball: { x: +E.ball.x.toFixed(2), y: +E.ball.y.toFixed(2), z: +E.ball.z.toFixed(2), v: +hypot(E.ball.vx, E.ball.vz).toFixed(2) } };
    },
};
