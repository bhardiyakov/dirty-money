// PERSEGUIÇÕES E FURTIVIDADE (polimento): a viatura dá a batida PIT de verdade (encosta na quina de trás e o carro RODA —
// Vehicle.spinOut); os bloqueios estendem um TAPETE DE PREGOS (os pneus que passam por cima furam); a 5★ o helicóptero põe a MIRA
// LASER antes do tiro do atirador de elite (sair da vista cancela). A pé (crime/Stealth.js): agachado por trás de quem não te vê, E
// derruba em silêncio (desacordado, sem sangue, fora da visão da polícia; acorda depois); E arrasta o corpo (vem atrás, devagar); corpo à
// vista é achado (a polícia vem ao lugar); o olho no alto da tela diz se estão te vendo (vermelho), quase (amarelo) ou ninguém.
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'perseguicao_furtividade',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        page.setDefaultTimeout(0);
        await page.evaluate(() => { Tutorial.skip(); Config.time.cycleSeconds = 1e12; game.player.invulnerable = true; Weather.cur.set('clear', true, true); });

        // ------------------------------------------------------------------ PIT
        const pit = await page.evaluate(() => {
            const vm = game.vehicleManager, P = game.player.position, pm = game.policeManager;
            const b = vm.vehicles.find((v) => !v.isBike && !v.spec.boat && !v.controlled && !v.spec.armored);
            const pc = pm.cars.find((q) => q.role === 'patrol' && !q.destroyed);
            if (!b || !pc) return null;
            const s = RoadNet.randomLanePoint(60, { x: P.x, z: P.z, rMin: 0, rMax: 300 });
            const h = Math.atan2(s.d.dx, s.d.dz);
            const run = (withPit) => {
                b.teleport(s.point.x, s.point.z, h); b.mode = 'parked'; b.route = null; b._pitSpin = null; b.flat = null;
                game.player.setVisible(false); b.setControlled(true); game.activeCar = b; game.mode = 'car'; game.camera.snapTo(b.position);
                game._update(1 / 30);
                const f = b.fwdToRef(new BABYLON.Vector3()), ux = f.x, uz = f.z, rx = uz, rz = -ux;
                b.phys.setLinearVelocity(new BABYLON.Vector3(ux * 14, 0, uz * 14));
                const h0 = Math.atan2(f.x, f.z);
                let hit = false;
                if (withPit) {
                    // a viatura encostada na quina de trás do lado direito dele, mesmo rumo; a perseguição já sabe onde ele está
                    const hl = b.halfLen, hw = b.halfW, qx = b.position.x - ux * hl * 0.75 + rx * hw, qz = b.position.z - uz * hl * 0.75 + rz * hw;
                    pc.teleport(qx + rx * 0.3 - ux * pc.halfLen, qz + rz * 0.3 - uz * pc.halfLen, h);
                    pc.setTarget(b.position, new BABYLON.Vector3(ux * 14, 0, uz * 14));
                    pc._pitHit = false;
                    pc._pit(b, { x: ux * 14, z: uz * 14 }, 14, 1 / 30);
                    hit = !!b._pitSpin;
                }
                for (let i = 0; i < 36; i++) { game._update(1 / 60); game.scene.getPhysicsEngine()._step(1 / 60); Vehicle.physFrame++; }      // (física em passos fixos)
                const f1 = b.fwdToRef(new BABYLON.Vector3());
                let d = Math.atan2(f1.x, f1.z) - h0; d = Math.atan2(Math.sin(d), Math.cos(d));
                b.setControlled(false); game.activeCar = null; game.mode = 'player'; game.player.setVisible(true);
                return { hit, turn: +Math.abs(d).toFixed(2), slid: +(b.slide || 0).toFixed(2) };
            };
            const ctl = run(false), p = run(true);
            return { ctl, p, pits: game.pits || 0 };
        });
        if (c.ok(!!pit, 'achou carro e viatura')) {
            c.ok(pit.p.hit && pit.pits >= 1, `a viatura encostou na quina de trás: batida PIT (${pit.pits})`);
            c.note(`PIT: rodou ${pit.p.turn} rad em 0,6 s (sem a batida, ${pit.ctl.turn})`);
            c.ok(pit.p.turn > 0.7 && pit.p.turn > pit.ctl.turn + 0.5, `o carro rodou (${pit.p.turn} rad em 0,6 s; sem a batida, ${pit.ctl.turn})`);
        }

        // ------------------------------------------------------------------ tapete de pregos
        const sp = await page.evaluate(() => {
            const pm = game.policeManager, P = game.player.position, B = pm.blocks;
            pm.level = 4;
            const far = RoadNet.randomLanePoint(60, { x: P.x, z: P.z, rMin: 250, rMax: 700 });      // (longe da câmera: o bloqueio só nasce fora da tela)
            const [cand] = far ? B._pick(far.point, { x: 0, z: 0 }, 1) : [];
            if (!cand) return { none: true };
            B._build(cand);
            const blk = B.list[B.list.length - 1], S = blk.spikes;
            if (!S) return { noSpikes: true };
            const vm = game.vehicleManager;
            const b = vm.vehicles.find((v) => !v.isBike && !v.spec.boat && !v.controlled && !v.spec.armored);
            b.flat = null;
            // vem de fora, em direção ao bloqueio, cruzando a faixa de pregos
            const h = Math.atan2(-S.dx, -S.dz), x0 = S.x + S.dx * 6, z0 = S.z + S.dz * 6;
            game.player.setVisible(false); b.setControlled(true); game.activeCar = b; game.mode = 'car';
            const before = game.spiked || 0;
            for (let k = 0; k <= 48; k++) {
                const d = k * 0.25;
                b.teleport(x0 - S.dx * d, z0 - S.dz * d, h);
                b.phys.setLinearVelocity(new BABYLON.Vector3(-S.dx * 9, 0, -S.dz * 9));
                Vehicle.physFrame++;
                B.tick();
            }
            const out = { flat: b.flatCount, n: (game.spiked || 0) - before, mesh: !!(S.mesh && !S.mesh.isDisposed()), len: S.hl * 2 };
            b.setControlled(false); game.activeCar = null; game.mode = 'player'; game.player.setVisible(true); b.flat = null;
            B._dismantle(blk);
            out.gone = S.mesh.isDisposed();
            pm.level = 0;
            return out;
        });
        if (c.ok(!sp.none && !sp.noSpikes, `bloqueio de 4★ montado com tapete de pregos${sp.none ? ' (sem lugar)' : ''}`)) {
            c.ok(sp.mesh && sp.len >= 10, `a faixa atravessa a rua (${sp.len} m)`);
            c.ok(sp.flat === 4 && sp.n === 4, `passou por cima: os 4 pneus furaram (${sp.flat})`);
            c.ok(sp.gone, 'desmontado o bloqueio, o tapete sai junto');
        }

        // ------------------------------------------------------------------ atirador de elite (5★)
        const sn = await page.evaluate(() => {
            const pm = game.policeManager, P = game.player.position, H = Config.heli.sniper;
            game.wanted.level = 5; pm.level = 5;
            if (pm.heli) pm.removeHeli();
            const heli = pm.heli = new Helicopter(pm.scene, null, pm, P.x + 4, P.z + 4);
            pm.playerPos.copyFrom(P); pm.playerVel.set(0, 0, 0);
            heli.fireCd = 0;
            const shots0 = game.combat.shots.police, out = { laserOn: false, early: 0 };
            for (let t = 0; t < H.aim - 0.25; t += 0.1) { heli.update(0.1); pm.playerPos.copyFrom(P); }
            out.laserOn = !!(heli.laser && heli.laser.isEnabled());
            out.early = game.combat.shots.police - shots0;
            for (let t = 0; t < 0.6; t += 0.1) heli.update(0.1);
            out.fired = game.combat.shots.police - shots0;
            out.laserAfter = !!(heli.laser && heli.laser.isEnabled());
            // de novo; no meio da mira ele se esconde (caçamba sem ser visto): a mira cai, sem tiro
            heli.fireCd = 0; heli.aimT = 0;
            for (let t = 0; t < 0.6; t += 0.1) heli.update(0.1);
            const mid = !!(heli.laser && heli.laser.isEnabled());
            game.hiding = { seen: false, phase: 'hidden' };
            const s1 = game.combat.shots.police;
            for (let t = 0; t < 2; t += 0.1) heli.update(0.1);
            out.cancel = mid && !(heli.laser && heli.laser.isEnabled()) && game.combat.shots.police === s1;
            game.hiding = null;
            pm.removeHeli(); game.wanted.level = 0; pm.level = 0;
            return out;
        });
        c.ok(sn.laserOn && sn.early === 0, 'a 5★ a mira laser fica em você antes do tiro (ainda sem disparar)');
        c.ok(sn.fired === 1 && !sn.laserAfter, `depois da mira, um tiro só (${sn.fired}) e o laser apaga`);
        c.ok(sn.cancel, 'saiu da vista no meio da mira (escondido): a mira cai e não vem tiro');

        // ------------------------------------------------------------------ derrubar por trás
        const td = await page.evaluate(() => {
            const g = game, p = g.player, P = p.position, pm = g.policeManager;
            g.wanted.level = 0;
            const L = g.npcManager.npcs.filter((n) => n.alive && !n.rag && !n.free && n.index >= 0 && !n.fleeing && !n._rage && !n.mugger)
                .sort((a, b) => Math.hypot(a.position.x - P.x, a.position.z - P.z) - Math.hypot(b.position.x - P.x, b.position.z - P.z));
            const n = L[0];
            if (!n) return null;
            const place = (dist, front) => {
                const h = n.heading, s = front ? 1 : -1;
                p.teleport(new BABYLON.Vector3(n.position.x + Math.sin(h) * dist * s, 0, n.position.z + Math.cos(h) * dist * s));
                p.root.rotation.y = h + (front ? Math.PI : 0);
                p.setCrouch(true);                                              // (o teleporte levanta)
            };
            n.fsm.setState({ name: 'TEST', update() {} });                  // (parado onde está, olhando para a frente)
            place(1.1, true);
            const front = Stealth.target(g);
            place(1.1, false);
            const okBehind = Stealth.target(g) === n;
            p.setCrouch(false);
            const standing = Stealth.target(g);
            p.setCrouch(true);
            const mt = pm.units.map((u) => (u.mind ? u.mind.t : -1e9));
            // (sem testemunha nem câmera nem polícia olhando — aqui só importa o barulho)
            const CE = CrimeExposure, keep = [CE._witnessSees, CE._cameraSees, CE._policeSees];
            CE._witnessSees = CE._cameraSees = CE._policeSees = () => false;
            const did = Stealth.interact(g);
            const out = { front: !!front, okBehind, standing: !!standing, did, ko: !!n.ko, alive: n.alive, clip: n.actor.clip && n.actor.clip.name, act: p.action && p.action.name };
            for (let i = 0; i < 24; i++) g._update(1 / 30);
            out.lie = n.actor.clip && n.actor.clip.name;
            [CE._witnessSees, CE._cameraSees, CE._policeSees] = keep;
            out.heard = pm.units.some((u, i) => u.mind && u.mind.t !== mt[i] && u.mind.t > -1e8);
            out.wanted = g.wanted.level;
            out.n = n.id;
            return out;
        });
        if (c.ok(!!td, 'achou um pedestre')) {
            c.ok(!td.front && td.okBehind && !td.standing, `só por trás e agachado (de frente: ${td.front}; de pé: ${td.standing})`);
            c.ok(td.did && td.ko && !td.alive && /takedown|punch/.test(td.act || ''), `E: o mata-leão (${td.act}) — ele apaga`);
            c.ok(td.lie === 'lie', `cai desacordado, sem sangue (clipe ${td.lie})`);
            c.ok(!td.heard && td.wanted === 0, 'em silêncio: nenhum policial ouviu (sem ninguém olhando, nenhuma estrela)');
        }
        // o boneco 3D do jogador tem o clipe novo do gerador
        const k3 = await page.evaluate(async () => {
            const A = game.player.char3d;
            if (!A || !A.model) return { skip: true };
            let K;
            for (let i = 0; i < 100; i++) { K = A.model.clip('takedown:none'); if (K && K !== 'wait') break; await new Promise((r) => setTimeout(r, 200)); }
            return { k: K && typeof K === 'object' ? K.n : K };
        });
        if (k3.skip) c.note('boneco 3D desligado neste perfil gráfico: clipe do gerador não conferido');
        if (!k3.skip) c.ok(k3.k === 12, `o boneco 3D faz o mata-leão do gerador (${k3.k} quadros)`);

        // ------------------------------------------------------------------ arrastar e corpo achado
        const dr = await page.evaluate(() => {
            const g = game, p = g.player, n = g.npcManager.npcs.find((m) => m.ko);
            if (!n) return null;
            p.setCrouch(false); p.action = null;
            p.teleport(new BABYLON.Vector3(n.position.x + 1, 0, n.position.z));
            const near = Stealth.bodyNear(g) === n;
            Stealth.interact(g);
            const grabbed = Stealth.drag && Stealth.drag.b === n;
            const b0 = { x: n.position.x, z: n.position.z };
            // anda para longe do corpo (o eixo de movimento simulado), em linha com mais espaço livre
            let best = null;
            const free = (a) => { for (let d = 0.5; d <= 7; d += 0.5) { const q = new BABYLON.Vector3(p.position.x + Math.sin(a) * d, 0, p.position.z + Math.cos(a) * d), x = q.x, z = q.z; MapGeo.resolveCircle(q, 0.5); if (Math.hypot(q.x - x, q.z - z) > 0.01) return false; } return true; };
            for (const k of [0, 1, -1, 2, -2, 3, -3, 4]) { const a = Math.PI / 2 + k * Math.PI / 4; if (free(a)) { best = a; break; } }
            const inp = g.input, keep = inp.getMoveAxis, yaw = CompassCamera.yaw || 0, a = (best == null ? 0 : best) - yaw;
            inp.getMoveAxis = () => ({ x: Math.sin(a), z: Math.cos(a) });
            let vmax = 0;
            for (let i = 0; i < 60; i++) { g._update(1 / 30); vmax = Math.max(vmax, p.speed || 0); }
            inp.getMoveAxis = keep;
            const out = { near, grabbed, moved: +Math.hypot(n.position.x - b0.x, n.position.z - b0.z).toFixed(2), gap: +Math.hypot(n.position.x - p.position.x, n.position.z - p.position.z).toFixed(2), vmax: +vmax.toFixed(2), jog: Config.player.jogSpeed };
            Stealth.interact(g);
            out.dropped = !Stealth.drag && !p.dragging;
            // um pedestre de frente para o corpo, a 6 m, sem parede: acha
            n._found = false;
            const w = g.npcManager.npcs.find((m) => m !== n && m.alive && !m.rag && !m.free && m.index >= 0);
            let spot = null;
            for (let k = 0; k < 16 && !spot; k++) { const aa = k * Math.PI / 8, x = n.position.x + Math.sin(aa) * 6, z = n.position.z + Math.cos(aa) * 6; if (MapGeo.hasLineOfSight(x, z, n.position.x, n.position.z)) spot = { x, z }; }
            if (w && spot) {
                w.nav.crowd.agentTeleport(w.index, new BABYLON.Vector3(spot.x, 0, spot.z)); w.transform.position.set(spot.x, 0, spot.z);
                w.heading = Math.atan2(n.position.x - spot.x, n.position.z - spot.z);
                w.fsm.setState({ name: 'TEST', update() {} });
                const f0 = Stealth.found;
                Stealth.bodies.add(n);
                Stealth._findTick(g);
                out.found = n._found && Stealth.found === f0 + 1;
            }
            // acorda: em pé de novo, de volta ao NavMesh
            n.ko.dur = n.ko.t + 0.05;
            for (let i = 0; i < 40 && n.ko; i++) g._update(1 / 30);
            out.woke = n.alive && !n.ko && n.index >= 0;
            return out;
        });
        if (c.ok(!!dr, 'o desacordado ainda está lá')) {
            c.ok(dr.near && dr.grabbed, 'E perto do corpo: arrasta');
            c.ok(dr.moved > 2 && dr.gap < 1.6, `o corpo vem atrás (andou ${dr.moved} m, a ${dr.gap} m de você)`);
            c.note(`arrastando: ${dr.vmax} m/s, o corpo andou ${dr.moved} m`);
            c.ok(dr.vmax > 0.3 && dr.vmax <= dr.jog * 0.62, `arrastando, anda devagar (${dr.vmax} m/s; trote ${dr.jog})`);
            c.ok(dr.dropped, 'E de novo: solta');
            c.ok(dr.found === true, 'um pedestre olhando acha o corpo (e liga para a polícia)');
            c.ok(dr.woke, 'passado o tempo, ele acorda e volta a andar');
        }

        // policial: derrubado sai da visão da polícia
        const cop = await page.evaluate(() => {
            const g = game, p = g.player, pm = g.policeManager;
            const o = pm.officers.find((u) => u.alive && !u.rag && u.index >= 0 && !u.guard && !u.temp && !u.arrest);
            if (!o) return null;
            o.fsm.setState({ name: 'TEST', update() {} }); o.mind = o.mind || {}; o.mind.sees = false;
            p.action = null;
            p.teleport(new BABYLON.Vector3(o.position.x - Math.sin(o.heading) * 1.1, 0, o.position.z - Math.cos(o.heading) * 1.1));
            p.setCrouch(true);
            const t = Stealth.target(g) === o;
            if (!o.ko && !t) return { t, ko: false, unit: true, back: false };
            Stealth.interact(g);
            const out = { t, ko: !!o.ko, unit: pm.units.includes(o) };
            if (!o.ko) return out;
            o.ko.dur = o.ko.t + 0.6;
            for (let i = 0; i < 60 && o.ko; i++) g._update(1 / 30);
            out.back = o.alive && !o.ko && pm.units.includes(o);
            p.setCrouch(false);
            return out;
        });
        if (cop) {
            c.ok(cop.t && cop.ko && !cop.unit, 'policial derrubado por trás: fora da visão da polícia enquanto desacordado');
            c.ok(cop.back, 'acorda e volta à ronda');
        }

        // ------------------------------------------------------------------ "estão me vendo"
        const eye = await page.evaluate(() => {
            const g = game, p = g.player, pm = g.policeManager, P = p.position;
            g.wanted.level = 0;
            const o = pm.officers.find((u) => u.alive && !u.rag && u.index >= 0);
            if (!o) return null;
            p.setCrouch(true); p.action = null;
            const R = () => pm.sightR || 15;
            const put = (dist) => {
                // uma direção com linha de visada livre até esta distância
                for (let k = 0; k < 16; k++) {
                    const a = k * Math.PI / 8, x = P.x + Math.sin(a) * dist, z = P.z + Math.cos(a) * dist;
                    if (!MapGeo.hasLineOfSight(P.x, P.z, x, z)) continue;
                    o.transform.position.set(x, 0, z); o.nav.crowd.agentTeleport(o.index, new BABYLON.Vector3(x, 0, z));
                    o.heading = Math.atan2(P.x - x, P.z - z);
                    return true;
                }
                return false;
            };
            const look = () => {
                o.fsm.setState({ name: 'TEST', update() {} });
                for (const u of pm.units) if (u !== o && u.mind) { u.mind.sees = false; u.mind.near = false; }
                const h = o.heading;
                pm.update(1 / 30, P, new BABYLON.Vector3(), 0);
                o.heading = h;
                for (const u of pm.units) if (u !== o && u.mind) { u.mind.sees = false; u.mind.near = false; }
                Stealth._seeTick(g);
                const e = document.getElementById('seeEye'), ring = [...document.querySelectorAll('#seeRing b')].filter((b) => b.style.display !== 'none');
                return { on: e.classList.contains('on'), see: e.classList.contains('see'), near: e.classList.contains('near'), txt: e.textContent, arrows: ring.length, red: ring.some((b) => b.classList.contains('see')) };
            };
            const out = {};
            if (put(R() * 0.5)) out.see = look();
            if (put(R() * 1.25)) out.near = look();
            o.transform.position.set(P.x + 300, 0, P.z + 300); o.nav.crowd.agentTeleport(o.index, new BABYLON.Vector3(P.x + 300, 0, P.z + 300));
            out.none = look();
            p.setCrouch(false);
            Stealth._seeTick(g);
            out.offStanding = !document.getElementById('seeEye').classList.contains('on');
            return out;
        });
        if (c.ok(!!eye && eye.see && eye.near, 'policial posto na frente')) {
            c.ok(eye.see.on && eye.see.see && eye.see.red && eye.see.arrows >= 1, `de frente, perto: "${eye.see.txt.trim()}" (vermelho, seta apontando)`);
            c.ok(eye.near.on && eye.near.near && !eye.near.see && eye.near.arrows >= 1, `um pouco além do alcance: "${eye.near.txt.trim()}" (amarelo)`);
            c.ok(eye.none.on && !eye.none.see && !eye.none.near && eye.none.arrows === 0 && /ningu/i.test(eye.none.txt), `longe: "${eye.none.txt.trim()}"`);
            c.ok(eye.offStanding, 'de pé, sem estrelas e sem corpo: o olho some (não polui a tela)');
        }
        c.noErrors(errors, 'perseguicao_furtividade');
        await close();
    },
};
