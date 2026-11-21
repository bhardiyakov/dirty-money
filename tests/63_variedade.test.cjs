// VARIEDADE (menos repetição): animações novas do gerador 3D (gestos de quem está parado: olhar em volta, o relógio, alongar; andares com
// personalidade: no celular, idoso, gingado) — o jogador parado um tempo faz um gesto; cada pedestre anda do seu jeito e, parado, também
// gesticula. Os trabalhos de carreira sorteiam um BÔNUS (condição extra que paga +35%). A rua ganha três acontecimentos: aviãozinho
// (entrega com prazo), turista (foto, furto da carteira enquanto posa, assalto) e carro enguiçado (mexer no motor).
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'variedade',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        page.setDefaultTimeout(0);
        await page.evaluate(() => { Tutorial.skip(); Config.time.cycleSeconds = 1e12; game.player.invulnerable = true; Weather.cur.set('clear', true, true); game.dayNight.hour = 11; if (game.dayNight.apply) game.dayNight.apply(); });

        // ------------------------------------------------------------------ clipes novos
        const cl = await page.evaluate(() => {
            const S = game.player.actor.sheet, out = {};
            for (const k of ['idle_look', 'idle_watch', 'idle_stretch', 'walk_phone', 'walk_old', 'walk_swag']) { const x = S.getClip(k, 'none'); out[k] = x ? x.name : null; }
            return out;
        });
        c.ok(Object.entries(cl).every(([k, v]) => v === k), `a folha entrega os 6 clipes novos (${Object.values(cl).join(', ')})`);
        const k3 = await page.evaluate(async () => {
            const A = game.player.char3d;
            if (!A || !A.model) return { skip: true };
            const out = {};
            for (const k of ['idle_look', 'walk_phone', 'walk_old']) {
                let K;
                for (let i = 0; i < 100; i++) { K = A.model.clip(k + ':none'); if (K && K !== 'wait') break; await new Promise((r) => setTimeout(r, 200)); }
                out[k] = K && typeof K === 'object' ? K.n : K;
            }
            return out;
        });
        if (k3.skip) c.note('boneco 3D desligado neste perfil: clipes do gerador não conferidos');
        else c.ok(k3.idle_look === 16 && k3.walk_phone === 12 && k3.walk_old === 12, `o gerador 3D faz os novos (${JSON.stringify(k3)})`);

        // ------------------------------------------------------------------ o jogador parado: um gesto; mexeu, acabou
        const fid = await page.evaluate(() => {
            const g = game, p = g.player, inp = g.input, keep = inp.getMoveAxis, out = {};
            p.action = null; p.weapon = 'none'; p.setCrouch(false);
            inp.getMoveAxis = () => ({ x: 0, z: 0 });
            p._fidgetAt = 0.6; p._stillT = 0; p._fidget = null;
            const seen = new Set();
            for (let i = 0; i < 40; i++) { g._update(1 / 30); if (p.actor.clip) seen.add(p.actor.clip.name); }
            out.during = [...seen].filter((k) => Player.FIDGETS.includes(k));
            out.fid = p._fidget;
            inp.getMoveAxis = () => ({ x: 0, z: 1 }); inp.analog.z = 1;
            for (let i = 0; i < 12; i++) g._update(1 / 30);
            out.after = p.actor.clip && p.actor.clip.name; out.cleared = !p._fidget;
            inp.getMoveAxis = keep; inp.analog.z = 0;
            for (let i = 0; i < 10; i++) g._update(1 / 30);
            return out;
        });
        c.ok(fid.during.length >= 1, `parado um tempo, o jogador faz um gesto (${fid.during.join(', ')})`);
        c.ok(fid.cleared && !Player_FIDGET(fid.after), `andou: o gesto acaba (${fid.after})`);

        // ------------------------------------------------------------------ pedestres: o jeito de andar e o gesto parado
        const np = await page.evaluate(() => {
            const g = game, L = g.npcManager.npcs.filter((n) => n.alive && n.actor && n.actor.sheet && n.actor.sheet.isNpc), count = {};
            let oldOk = true, mulOk = true;
            for (const n of L) {
                const G = n._gait();
                count[G] = (count[G] || 0) + 1;
                if (Temper.of(n).old && G !== 'walk_old') oldOk = false;
                if (G === 'walk_old' && !(n._gaitMul < 1)) mulOk = false;
            }
            // os que andam de outro jeito, andando: tocam o clipe deles (vários ao mesmo tempo: um pode estar esperando o sinal)
            const W = L.filter((n) => n._gait() !== 'walk' && !n.rag && n.index >= 0 && !n.free && n.fsm && n.fsm.name === 'WANDER').slice(0, 8);
            let walkClip = null, gait = null;
            for (let i = 0; i < 45 && !walkClip && W.length; i++) {
                g._update(1 / 30);
                for (const w of W) { const v = g.nav.crowd.getAgentVelocity(w.index); if (v && Math.hypot(v.x, v.z) > 0.55 && w.actor.clip && w.actor.clip.name === w._gait()) { walkClip = w.actor.clip.name; gait = w._gait(); break; } }
            }
            if (W.length && !gait) gait = W[0]._gait();
            // um parado: o gesto
            const s = L.find((n) => n.alive && !n.rag && n.index >= 0) || L[0];
            s._stillT = 99; s._fidgetAt = 0; s._fidget = null;
            const f = s._fidgetTick(0.1);
            return { count, oldOk, mulOk, gait, walkClip, fid: f && s.actor.clip && s.actor.clip.name };
        });
        const kinds = Object.keys(np.count).length;
        c.ok(kinds >= 2, `os pedestres andam de jeitos diferentes (${JSON.stringify(np.count)})`);
        c.ok(np.oldOk && np.mulOk, 'idoso anda curvado (walk_old) e mais devagar');
        if (np.gait) c.ok(np.walkClip === np.gait, `andando, o pedestre toca o jeito dele (${np.walkClip} = ${np.gait})`);
        c.ok(['idle_look', 'idle_watch', 'idle_stretch'].includes(np.fid), `pedestre parado um tempo: um gesto (${np.fid})`);

        // ------------------------------------------------------------------ bônus dos trabalhos
        const bo = await page.evaluate(() => {
            const g = game, C = g.careers, inv = g.inventory, out = {};
            g.wanted._set(0, 'escape');
            const mk = () => { const j = new CareerJob(C.by.chop, { title: 'Teste', text: 'teste' }); C.job = j; C._bonusFor(j); return j; };
            let j = mk();
            out.has = !!j.bonus; out.hud = j.hud().extra;
            // perdeu: disparou
            j.bonus = { id: 'tiro', label: 'sem disparar', ok: true, v0: g.combat.shots.player };
            g.combat.shots.player++;
            C._bonusTick(j);
            out.lost = !j.bonus.ok; out.hudLost = j.hud().extra;
            let c0 = inv.cash; j.succeed(1000, 100); out.payLost = inv.cash - c0;
            C.cool = 0;
            // cumpriu: sem estrelas
            j = mk(); j.bonus = { id: 'limpo', label: 'sem estrelas', ok: true, v0: 0 };
            c0 = inv.cash; j.succeed(1000, 100); out.payWon = inv.cash - c0;
            C.cool = 0;
            out.bonuses = C.bonuses || 0;
            // nunca o mesmo duas vezes seguidas
            const seq = []; for (let i = 0; i < 8; i++) { const q = new CareerJob(C.by.chop, { title: 't', text: 't' }); C._bonusFor(q); seq.push(q.bonus.id); }
            out.noRepeat = seq.every((x, i) => i === 0 || x !== seq[i - 1]);
            C.job = null;
            return out;
        });
        c.ok(bo.has && /★/.test(bo.hud), `o trabalho sorteia um bônus e o painel mostra (${bo.hud})`);
        c.ok(bo.lost && /✗/.test(bo.hudLost), `disparou num trabalho "sem disparar": perdeu o bônus (${bo.hudLost})`);
        c.ok(bo.payWon > bo.payLost * 1.3 && bo.bonuses >= 1, `cumprido, paga mais (${bo.payWon} × ${bo.payLost} sem bônus)`);
        c.ok(bo.noRepeat, 'o bônus não se repete em seguida');

        // ------------------------------------------------------------------ a rua: aviãozinho, turista, carro enguiçado
        const ev = await page.evaluate(() => {
            const g = game, SL = StreetLife, p = g.player, inv = g.inventory, out = {};
            const step = (n = 1, dt = 0.1) => { for (let i = 0; i < n && SL.ev; i++) SL._evUpdate(g, dt); };
            const near = (x, z) => { p.root.position.x = x + 1.2; p.root.position.z = z; };
            g.wanted._set(0, 'escape');
            // aviãozinho
            SL._end(g);
            // (perto de gente: o desconhecido do aviãozinho sai de quem está andando por perto)
            const calm = g.npcManager.npcs.filter((n) => SL._calm(n));
            for (let k = 0; k < 8 && !SL.ev && calm.length; k++) { const n = calm[(k * 7) % calm.length]; p.teleport(new BABYLON.Vector3(n.position.x + 9, 0, n.position.z)); SL._start_aviao(g); }
            if (SL.ev && SL.ev.kind === 'aviao') {
                const E = SL.ev;
                near(E.giver.position.x, E.giver.position.z);
                out.aviaoOffer = SL.prompt(g);
                SL.interact(g);
                out.aviaoGo = E.phase === 'go' && !!g.gps && /Entrega/.test(g.gps.label || '');
                p.root.position.x = E.dest.x + 1.5; p.root.position.z = E.dest.z;
                step(2);
                out.aviaoRecv = !!E.recv;
                out.aviaoPrompt = SL.prompt(g);
                const c0 = inv.cash; SL.interact(g); out.aviaoPaid = inv.cash - c0 === E.pay;
                SL._end(g);
            }
            // turista
            for (let k = 0; k < 6 && !SL.ev; k++) SL._start_turista(g);
            if (SL.ev && SL.ev.kind === 'turista') {
                const E = SL.ev;
                p.weapon = 'none'; p.action = null;
                near(E.x, E.z);
                out.turPrompt = SL.prompt(g);
                SL.interact(g);
                out.turPhoto = E.phase === 'photo';
                out.turSteal = SL.prompt(g);
                out.stole = SL.steal(g);
                out.turDone = E.phase === 'done';
                SL._end(g);
            }
            // carro enguiçado
            const parked = g.vehicleManager.vehicles.filter((q) => !q.isBike && !q.isBoat && !(q.spec && q.spec.boat) && !q.isChopper && !q.destroyed && !q.role && !q.controlled && q.mode === 'parked' && q.halfLen);
            for (let k = 0; k < 6 && !SL.ev && parked.length; k++) { const q = parked[k % parked.length]; p.teleport(new BABYLON.Vector3(q.position.x + 20, 0, q.position.z)); SL._start_pane(g); }
            if (SL.ev && SL.ev.kind === 'pane') {
                const E = SL.ev;
                p.action = null;
                p.root.position.x = E.x; p.root.position.z = E.z;
                out.panePrompt = SL.prompt(g);
                SL.interact(g);
                out.paneFix = E.phase === 'fix';
                step(36);
                out.paneDone = E.phase === 'done';
                SL._end(g);
            } else out.paneSkip = true;
            return out;
        });
        if (ev.aviaoOffer !== undefined) {
            c.ok(/pacote/.test(ev.aviaoOffer) && ev.aviaoGo, 'aviãozinho: E pega o pacote, o ponto vai para o GPS com o prazo');
            c.ok(ev.aviaoRecv && /entregar/.test(ev.aviaoPrompt || '') && ev.aviaoPaid, 'no ponto, o cliente aparece; E entrega e paga');
        } else c.note('aviãozinho não conferido (ninguém por perto para oferecer)');
        if (c.ok(ev.turPrompt !== undefined, 'apareceu um turista')) {
            c.ok(/foto/.test(ev.turPrompt) && ev.turPhoto, 'turista: E tira a foto (ele posa)');
            c.ok(/carteira/.test(ev.turSteal || '') && ev.stole && ev.turDone, 'posando, C furta a carteira');
        }
        if (ev.paneSkip) c.note('carro enguiçado não conferido (nenhum carro estacionado por perto)');
        else c.ok(/motor/.test(ev.panePrompt || '') && ev.paneFix && ev.paneDone, 'carro enguiçado: E mexe no motor e, em ~3 s, pega ou não');
        c.noErrors(errors, 'variedade');
        await close();
    },
};

function Player_FIDGET(name) { return ['idle_look', 'idle_watch', 'idle_stretch'].includes(name); }
