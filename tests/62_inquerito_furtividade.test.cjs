// INQUÉRITO (crime leve × pesado) E FURTIVIDADE 2.
//   Leve (soco, furto…): só o flagrante da polícia conta — 1★, nunca na ficha; pedestre/câmera vendo: nada (a polícia vem olhar).
//   Pesado (homicídio, sequestro, lesão grave…): ao vivo, estrelas e ficha; câmera: ficha na hora, sem estrela; testemunha: o relato
//   vai com ela e só entra na ficha quando ela LIGA (calada antes = sem inquérito; de rosto coberto = sem nome).
//   Furtividade (crime/Stealth.js): o barulho dos passos (de quão longe te sentem de costas); faca por trás = morte silenciosa; o corpo
//   no ombro (de pé) ou arrastado (agachado, Q troca); o porta-malas (some, vai com o carro; quem acorda bate na tampa e, solto, foge e
//   liga); a desova na água funda (afunda, ninguém acha).
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'inquerito_furtividade',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        page.setDefaultTimeout(0);
        await page.evaluate(() => { Tutorial.skip(); Config.time.cycleSeconds = 1e12; game.player.invulnerable = true; Weather.cur.set('clear', true, true); });

        // ------------------------------------------------------------------ inquérito
        const inq = await page.evaluate(() => {
            const g = game, H = g.heat, CE = CrimeExposure, keep = CE.evaluate, W = Witnesses;
            let EX = 0;
            CE.evaluate = () => EX;
            const coal = () => { H._coalesce = {}; };
            const reset = () => { g.wanted._set(0, 'escape'); H.record.clear(); H._settle(); coal(); };
            const out = {};
            reset();
            // leve visto por pedestre: nada
            EX = CE.WITNESS; H.commit('assault');
            out.lightWit = { stars: g.wanted.level, rec: H.record.count, st: H.state };
            coal();
            // leve visto pela polícia: 1★, sem ficha; fugiu = acabou
            EX = CE.POLICE; H.commit('assault');
            out.lightLive = { stars: g.wanted.level, rec: H.record.count };
            g.wanted._set(0, 'escape');
            out.lightAfter = { st: H.state, rec: H.record.count };
            reset();
            // pesado visto por uma testemunha: o relato vai com ela; liga → ficha
            const P = g.player.position, n = g.npcManager.npcs.find((m) => m.alive && !m.rag && !m.witness && m.index >= 0);
            const mkW = () => { const w = { id: ++W._id, npc: n, kind: 'kill', x: P.x + 2, z: P.z, t: 30, ping: 0 }; n.witness = w; W.list.push(w); return w; };
            let w = mkW();
            EX = CE.WITNESS; H.commit('homicide');
            out.heavyWit = { stars: g.wanted.level, rec: H.record.count, attached: !!w.report };
            w.t = 0; W.update(g, 0.05);
            out.heavyCall = { rec: H.record.count, st: H.state, type: H.record.crimes[0] && H.record.crimes[0].type };
            reset();
            // calada antes de ligar: sem inquérito
            w = mkW();
            EX = CE.WITNESS; H.commit('homicide');
            W._end(w);                                                         // (intimidada/subornada)
            W.update(g, 40);
            out.silenced = { rec: H.record.count, stars: g.wanted.level };
            reset();
            // de rosto coberto: a testemunha liga, mas sem nome
            Object.defineProperty(H, 'isMasked', { get: () => true, configurable: true });
            w = mkW();
            EX = CE.WITNESS; H.commit('homicide');
            w.t = 0; W.update(g, 0.05);
            out.masked = { rec: H.record.count };
            delete H.isMasked;
            reset();
            // câmera: ficha na hora, sem estrela, a polícia vem procurar
            const pend0 = Traces.pend.length;
            EX = CE.CAMERA; H.commit('armed_assault');
            out.camera = { rec: H.record.count, stars: g.wanted.level, call: Traces.pend.length > pend0, st: H.state };
            reset();
            // pesado ao vivo: estrelas e ficha
            EX = CE.POLICE; H.commit('homicide');
            out.heavyLive = { stars: g.wanted.level, rec: H.record.count };
            reset();
            CE.evaluate = keep;
            Traces.pend.length = 0; Traces.search = null; Traces.desc = null;
            if (n) n.witness = null;
            return out;
        });
        c.ok(inq.lightWit.stars === 0 && inq.lightWit.rec === 0 && inq.lightWit.st === 'IDLE', `soco visto por um pedestre: sem estrela e sem ficha (${JSON.stringify(inq.lightWit)})`);
        c.ok(inq.lightLive.stars === 1 && inq.lightLive.rec === 0, `soco na frente da polícia: 1★, mas nada na ficha (${JSON.stringify(inq.lightLive)})`);
        c.ok(inq.lightAfter.st === 'IDLE' && inq.lightAfter.rec === 0, 'fugiu do delito leve: acabou (sem inquérito)');
        c.ok(inq.heavyWit.stars === 0 && inq.heavyWit.rec === 0 && inq.heavyWit.attached, 'homicídio visto por pedestre: sem estrela na hora — o relato vai com a testemunha');
        c.ok(inq.heavyCall.rec === 1 && inq.heavyCall.st === 'INVESTIGATION' && inq.heavyCall.type === 'homicide', `ela ligou: inquérito aberto (${JSON.stringify(inq.heavyCall)})`);
        c.ok(inq.silenced.rec === 0 && inq.silenced.stars === 0, 'testemunha calada antes de ligar: sem inquérito');
        c.ok(inq.masked.rec === 0, 'de rosto coberto: ela liga, mas seu nome não vai para a ficha');
        c.ok(inq.camera.rec === 1 && inq.camera.stars === 0 && inq.camera.call, `câmera: ficha na hora, sem estrela, a polícia vem procurar (${JSON.stringify(inq.camera)})`);
        c.ok(inq.heavyLive.stars >= 2 && inq.heavyLive.rec === 1, `homicídio na frente da polícia: ${inq.heavyLive.stars}★ e ficha`);

        // ------------------------------------------------------------------ modo furtivo: o barulho dos passos
        const noise = await page.evaluate(() => {
            const g = game, p = g.player, pm = g.policeManager, P = p.position, out = {};
            for (const [k, sp, cr] of [['agachado', 2, true], ['parado', 0, false], ['andando', 2.2, false], ['trotando', 5, false], ['correndo', 10, false]]) {
                p.setCrouch(cr); p.speed = sp;
                pm.update(1 / 60, P, new BABYLON.Vector3(), 0);
                out[k] = pm.nearS;
            }
            p.setCrouch(false); p.speed = 0;
            return out;
        });
        c.ok(noise.agachado < noise.parado && noise.parado <= noise.andando && noise.andando < noise.trotando && noise.trotando < noise.correndo,
            `de costas te sentem pelo barulho: ${Object.entries(noise).map(([k, v]) => `${k} ${v} m`).join(', ')}`);

        // ------------------------------------------------------------------ faca por trás, corpo no ombro, porta-malas, desova
        const st = await page.evaluate(() => {
            const g = game, p = g.player, P = p.position, CE = CrimeExposure, keepE = CE.evaluate, out = {};
            CE.evaluate = () => 0;                                                   // (ninguém olhando: só a mecânica)
            g.wanted._set(0, 'escape'); g.heat.record.clear(); g.heat._settle();
            const L = g.npcManager.npcs.filter((n) => n.alive && !n.rag && !n.free && n.index >= 0 && !n.fleeing && !n._rage && !n.mugger && !n.witness)
                .sort((a, b) => Math.hypot(a.position.x - P.x, a.position.z - P.z) - Math.hypot(b.position.x - P.x, b.position.z - P.z));
            const behind = (n) => { n.fsm.setState({ name: 'TEST', update() {} }); const h = n.heading; p.teleport(new BABYLON.Vector3(n.position.x - Math.sin(h) * 1.1, 0, n.position.z - Math.cos(h) * 1.1)); p.setCrouch(true); p.action = null; };
            // faca por trás
            const v = L[0];
            behind(v);
            const wkeep = p.weapon; p.weapon = 'knife';
            out.prompt = Stealth.prompt(g);
            Stealth.interact(g);
            p.weapon = wkeep;
            for (let i = 0; i < 24; i++) g._update(1 / 30);
            out.knife = { dead: !v.alive && !v.ko && v.fsm.name === 'DEAD', stars: g.wanted.level, rec: g.heat.record.count };
            // no ombro (de pé)
            p.action = null; p.teleport(new BABYLON.Vector3(v.position.x + 0.8, 0, v.position.z)); p.setCrouch(false);
            Stealth.interact(g);
            Stealth.update(g, 1 / 30);
            const D = Stealth.drag;
            out.carry = { mode: D && D.mode, carrying: !!p.carrying, y: +(v.actor.mesh.position.y - 0.5).toFixed(2), off: +Math.hypot(v.position.x - P.x, v.position.z - P.z).toFixed(2) };
            g._update(1 / 30);
            out.carryClip = p.actor.clip && p.actor.clip.name;
            // Q: agacha e arrasta
            p.setCrouch(true); Stealth.update(g, 1 / 30);
            out.dragMode = Stealth.drag && Stealth.drag.mode; out.dragY = +(v.actor.mesh.position.y - 0.5).toFixed(2);
            p.setCrouch(false); Stealth.update(g, 1 / 30);
            // porta-malas: um carro parado, você atrás dele
            const car = g.vehicleManager.vehicles.find((q) => !q.isBike && !q.isBoat && !q.spec.boat && !q.isChopper && !q.destroyed && !q.role && !q.controlled && q.halfLen && (q.mode === 'parked' || q.speed < 0.5));
            if (car) {
                car.mode = 'parked'; car.route = null; car.phys.setLinearVelocity(BABYLON.Vector3.Zero()); Vehicle.physFrame++;
                const f = car.fwdToRef(new BABYLON.Vector3());
                p.root.position.x = car.position.x - f.x * (car.halfLen + 0.9); p.root.position.z = car.position.z - f.z * (car.halfLen + 0.9);
                Stealth.update(g, 1 / 30);
                out.trunkPrompt = Stealth.prompt(g);
                Stealth.interact(g);
                out.stowed = { inTrunk: v._inTrunk === car, hidden: !v.actor.mesh.isEnabled(), holding: !!Stealth.drag };
                out.trunkPrompt2 = Stealth.prompt(g);
                Stealth.interact(g);
                out.unstowed = { visible: v.actor.mesh.isEnabled(), holding: !!(Stealth.drag && Stealth.drag.b === v), free: !v._inTrunk };
                // desacordado no porta-malas: acorda e bate; aberto, foge e liga
                Stealth.drop(g, true);
                const k = L.find((m) => m !== v && m.alive && !m.rag && m.index >= 0 && !m.witness);
                if (k) {
                    behind(k);
                    Stealth.interact(g);
                    for (let i = 0; i < 24; i++) g._update(1 / 30);
                    p.action = null; p.teleport(new BABYLON.Vector3(k.position.x + 0.8, 0, k.position.z)); p.setCrouch(false);
                    if (Stealth.drag) Stealth.drop(g, true);
                    Stealth.grab(g, k);                                                  // (ele mesmo — não outro corpo que esteja perto)
                    car.fwdToRef(f);                                                    // (o carro pode ter sido movido pelo trânsito nesse meio-tempo)
                    car.phys.setLinearVelocity(BABYLON.Vector3.Zero()); Vehicle.physFrame++;
                    p.root.position.x = car.position.x - f.x * (car.halfLen + 0.9); p.root.position.z = car.position.z - f.z * (car.halfLen + 0.9);
                    const dbg = { drag: !!(Stealth.drag && Stealth.drag.b === k), tc: Stealth.trunkCar(g) === car, has: Stealth.trunks.has(car), busy: p.busy, act: Stealth._canAct(g), sp: +car.speed.toFixed(2), ko: k.ko && k.ko.phase };
                    Stealth.interact(g);
                    const inT = k._inTrunk === car;
                    k.ko.dur = k.ko.t;
                    const pm = g.policeManager, keepA = pm.alertNear.bind(pm); let alerted = 0;
                    pm.alertNear = (pos, r) => { alerted++; return keepA(pos, r); };
                    // um policial perto do carro ouve as batidas
                    const o = pm.officers.find((u) => u.alive && !u.rag && u.index >= 0);
                    if (o) { o.transform.position.set(car.position.x + 6, 0, car.position.z); o.nav.crowd.agentTeleport(o.index, new BABYLON.Vector3(car.position.x + 6, 0, car.position.z)); }
                    for (let i = 0; i < 6; i++) k.update(0.5);
                    pm.alertNear = keepA;
                    out.bang = { inT, phase: k.ko && k.ko.phase, heard: alerted > 0, dbg };
                    out.openPrompt = Stealth.prompt(g);
                    const w0 = Witnesses.list.length;
                    Stealth.interact(g);
                    const W = Witnesses.list.find((x) => x.npc === k && !x.done);
                    out.freed = { alive: k.alive, witness: !!W && Witnesses.list.length > w0, rep: W && W.report && W.report.type };
                }
            }
            // desova: o corpo solto na água funda afunda
            let deep = null;
            for (let r = 40; r < 2600 && !deep; r += 40) for (let a = 0; a < 24 && !deep; a++) { const x = P.x + Math.sin(a * Math.PI / 12) * r, z = P.z + Math.cos(a * Math.PI / 12) * r; if (MapGeo.waterDepth(x, z) >= 1.2) deep = { x, z }; }
            const b = g.npcManager.npcs.find((m) => !m.alive && !m.ko && m.deadTimer > 0 && !m._inTrunk) || v;
            if (deep && b && !b.alive) {
                if (Stealth.drag && Stealth.drag.b !== b) Stealth.drop(g, true);
                if (!Stealth.drag) { Stealth.drag = { b, mode: 'drag', reported: false }; p.dragging = b; Stealth.bodies.add(b); }
                Stealth.drag.mode = 'drag';                                              // (arrastando: o corpo fica onde está — na água)
                b.transform.position.set(deep.x, 0, deep.z);
                const s0 = Stealth.sunk || 0;
                Stealth.drop(g);
                out.sink = { bid: b.id, sunk: (Stealth.sunk || 0) === s0 + 1, gone: !Stealth.bodies.has(b) && !(Math.hypot(b.position.x - deep.x, b.position.z - deep.z) < 1 && !b.alive) };
            } else out.sink = { skip: !deep ? 'sem água funda' : 'sem corpo' };
            CE.evaluate = keepE;
            return out;
        });
        c.ok(/faca/.test(st.prompt || ''), `faca na mão, por trás: "${(st.prompt || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 40)}"`);
        c.ok(st.knife.dead && st.knife.stars === 0 && st.knife.rec === 0, `faca por trás: morte silenciosa — sem ninguém olhando, nem estrela nem ficha (${JSON.stringify(st.knife)})`);
        c.ok(st.carry.mode === 'carry' && st.carry.carrying && st.carry.y > 1 && st.carry.off < 0.3, `de pé, o corpo vai no ombro (${JSON.stringify(st.carry)})`);
        c.ok(st.carryClip === 'carry' || st.carryClip === 'carry_idle', `o personagem segura o peso (clipe ${st.carryClip})`);
        c.ok(st.dragMode === 'drag' && st.dragY === 0, 'Q: agachado, arrasta pelo chão');
        if (c.ok(!!st.stowed, 'achou um carro parado')) {
            c.ok(/porta-malas/.test(st.trunkPrompt || ''), 'atrás do carro: "pôr o corpo no porta-malas"');
            c.ok(st.stowed.inTrunk && st.stowed.hidden && !st.stowed.holding, 'no porta-malas: some da vista');
            c.ok(/tirar/.test(st.trunkPrompt2 || '') && st.unstowed.visible && st.unstowed.holding && st.unstowed.free, 'E de novo: tira (volta para o ombro)');
            if (st.bang) {
                c.ok(st.bang.inT && st.bang.phase === 'bang' && st.bang.heard, `desacordado no porta-malas acorda e bate na tampa; o policial perto ouve (${JSON.stringify(st.bang)})`);
                c.ok(/abrir/.test(st.openPrompt || '') && st.freed.alive && st.freed.witness && st.freed.rep === 'kidnapping', `aberto, ele foge e vai ligar (sequestro) (${JSON.stringify(st.freed)})`);
            }
        }
        if (st.sink.skip) c.note(`desova não conferida: ${st.sink.skip}`);
        else c.ok(st.sink.sunk && st.sink.gone, `corpo solto na água funda: afunda e some (${JSON.stringify(st.sink)})`);
        c.noErrors(errors, 'inquerito_furtividade');
        await close();
    },
};
