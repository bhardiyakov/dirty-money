// Pelada na quadra da favela (npc/Pelada.js): os meninos jogando 5 × 5 (camisa × sem camisa) como NPCs de verdade, a física da bola
// (quique, rolagem, rede, trave), o jogador conduzindo a bola, e a invasão: reclamam, param o jogo, brigam — e voltam a jogar quando
// ele vai embora.
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'pelada',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        // espera pelo relógio da pelada (o jogo no navegador sem placa de vídeo anda devagar): até `cond` ou `sec` s de jogo
        const waitFor = async (cond, sec) => {
            const t0 = await page.evaluate(() => (Pelada.E ? Pelada.E.t : 0)), r0 = Date.now();
            while (Date.now() - r0 < sec * 15000) {
                const r = await page.evaluate(cond);
                if (r) return r;
                const t = await page.evaluate(() => (Pelada.E ? Pelada.E.t : 0));
                if (t - t0 >= sec) return null;
                await page.waitForTimeout(300);
            }
            return null;
        };
        const ok = await page.evaluate(() => {
            const q = Pelada.court();
            if (!q) return false;
            Tutorial.skip(); game.gps = null; game.dayNight.hour = 11; game.player.invulnerable = true; Pelada.force = true;
            game.player.teleport(new BABYLON.Vector3(q.mx + 3, 0, q.z0 + 0.4));      // na beira da quadra, fora das linhas
            game.camera.snapTo(game.player.position);
            window.__said = []; const o = Bubbles.say.bind(Bubbles); Bubbles.say = (a, t, op) => { window.__said.push(t); return o(a, t, op); };
            window.__to = null;
            game.input.getMoveAxis = () => {
                const t = window.__to; if (!t) return { x: 0, z: 0 };
                const p = game.player.position, dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz); if (d < 0.25) return { x: 0, z: 0 };
                const { forward, right } = game.camera.getGroundBasis();
                return { x: (dx * right.x + dz * right.z) / d, z: (dx * forward.x + dz * forward.z) / d };
            };
            return true;
        });
        if (!c.ok(ok, 'a favela tem a quadra (FavelaPlan)')) { await close(); return; }
        const built = await waitFor(() => !!Pelada.E, 5);
        if (!c.ok(built, 'de dia, com o jogador perto, a pelada começa')) { await close(); return; }

        // 1) os times
        const T = await page.evaluate(() => {
            const E = Pelada.E;
            return { n: E.kids.length, playing: E.kids.filter((k) => Pelada._playing(k)).length, free: E.kids.every((k) => k.npc.free),
                shirtless: E.kids.filter((k) => k.team === 0).every((k) => Temper.typeOf(k.npc) === 'civil_banhista'), inManager: E.kids.every((k) => game.npcManager.npcs.includes(k.npc) && k.npc.party),
                gk: E.kids.filter((k) => k.role === 'gk').length };
        });
        c.ok(T.n === 10 && T.playing === 10 && T.gk === 2, `5 contra 5 com goleiro (${T.playing}/${T.n} jogando)`);
        c.ok(T.shirtless, 'camisa × sem camisa (o time 0 é de banhistas)');
        c.ok(T.free && T.inManager, 'NPCs de verdade (no NPCManager, sem reciclar), movidos pela pelada (modo livre)');

        // 2) a física da bola, isolada (passos de 1/60 s, a bola guardada e devolvida)
        const F = await page.evaluate(() => {
            const E = Pelada.E, B = E.ball, q = Pelada.q, R = Pelada.R, keep = Object.assign({}, B), out = {};
            const run = (n, f) => { for (let i = 0; i < n; i++) { Pelada._ballStep(1 / 60); if (f) f(i); } };
            const put = (x, y, z, vx, vy, vz) => Object.assign(B, { x, y, z, vx, vy, vz });
            E.hold = null;
            put(q.mx, 2, q.mz + 3, 0, 0, 0); let ups = 0, prev = 0;
            run(300, () => { if (B.vy > 0.5 && prev <= 0) ups++; prev = B.vy; });
            out.drop = { ups, y: +B.y.toFixed(3), still: Math.abs(B.vy) < 0.01 && B.y < R + 0.01 };
            put(q.mx - 5, R, q.mz - 3, 6, 0, 0); run(600);
            out.roll = { d: +(B.x - (q.mx - 5)).toFixed(1), v: +Math.hypot(B.vx, B.vz).toFixed(3) };
            put(q.lx1 - 2, R, q.mz, 9, 0, 0); run(240);
            out.goal = { inNet: B.x > q.lx1 && B.x < q.lx1 + q.net && Math.abs(B.z - q.mz) < q.gw, v: +Math.hypot(B.vx, B.vz).toFixed(2) };
            put(q.lx1 - 2, R, q.mz + q.gw + 0.02, 8, 0, 0); run(30);
            out.post = { back: B.vx < 0, x: +(B.x - q.lx1).toFixed(2) };
            put(q.lx1 - 2, 3, q.mz, 8, 0, 0); run(40);
            out.over = { inNet: B.x > q.lx1 && B.x < q.lx1 + q.net && Math.abs(B.z - q.mz) < q.gw && B.y < q.gh };
            Object.assign(B, keep);
            return out;
        });
        c.ok(F.drop.ups >= 2 && F.drop.still, `a bola quica e assenta no chão (${F.drop.ups} quiques, y ${F.drop.y})`);
        c.ok(F.roll.d > 5 && F.roll.d < 20 && F.roll.v === 0, `rolando, o atrito para a bola (${F.roll.d} m a 6 m/s)`);
        c.ok(F.goal.inNet && F.goal.v < 1, `chute rasteiro entra e fica na rede (${F.goal.v} m/s lá dentro)`);
        c.ok(F.post.back, `bola na trave volta (x ${F.post.x} da linha)`);
        c.ok(!F.over.inNet, 'por cima do travessão não entra');

        // 3) o jogo rola: alguém chuta/conduz a bola
        const played = await waitFor(() => { const B = Pelada.E.ball; return B.last && B.last !== 'player' && B.last.npc ? { by: B.last.role, d: +Math.hypot(B.x - Pelada.q.mx, B.z - Pelada.q.mz).toFixed(1) } : null; }, 12);
        c.ok(!!played, `os meninos jogam: a bola anda de pé em pé (${played ? played.by + ', ' + played.d + ' m do meio' : 'ninguém tocou'})`);
        c.ok(await page.evaluate(() => Pelada.E.anger === 0 && !Pelada.E.stop), 'vendo de fora, ninguém reclama');

        // 4) o jogador corre na bola: empurra (conduz) — e isso irrita
        const push = await page.evaluate(() => {
            const E = Pelada.E, B = E.ball, p = game.player.position;
            E.hold = null; E.owner = null;
            Object.assign(B, { x: p.x + 0.6, y: Pelada.R, z: p.z + 2.2, vx: 0, vy: 0, vz: 0 });
            window.__to = { x: B.x + 0.4, z: B.z + 3 };
            return { x: B.x, z: B.z };
        });
        const pushed = await waitFor(() => { const B = Pelada.E.ball; return B.last === 'player' ? { v: +Math.hypot(B.vx, B.vz).toFixed(1) } : null; }, 4);
        c.ok(!!pushed, `o jogador esbarra na bola e ela sai rolando (${pushed ? pushed.v + ' m/s' : 'não encostou'})`);
        void push;

        // 5) invadindo: correndo atrás da bola no meio do jogo — reclamam e o jogo PARA
        const stopped = await (async () => {
            for (let i = 0; i < 60; i++) {
                await page.evaluate(() => { const B = Pelada.E.ball; window.__to = { x: B.x, z: B.z }; });
                const r = await waitFor(() => Pelada.E.stop ? { anger: Math.round(Pelada.E.anger) } : null, 0.6);
                if (r) return r;
            }
            return null;
        })();
        c.ok(!!stopped, `invadiu o jogo: param e encaram (raiva ${stopped ? stopped.anger : '?'})`);
        const said = await page.evaluate(() => __said.slice());
        const L = await page.evaluate(() => Pelada.LINES);
        c.ok(said.some((t) => L.warn.includes(t) || L.ball.includes(t) || L.argue.includes(t) || L.kicked.includes(t)), `reclamam ("${said.filter((t) => L.warn.includes(t) || L.ball.includes(t) || L.argue.includes(t)).slice(0, 2).join('" / "')}")`);

        // 6) bate num deles: a turma parte para a briga
        await page.evaluate(() => { window.__to = null; });
        const hit = await (async () => {
            for (let i = 0; i < 12; i++) {
                const r = await page.evaluate(() => {
                    const pl = game.player, k = Pelada._near(pl.position.x, pl.position.z, true);
                    if (!k) return 'ninguém';
                    const p = k.npc.position;
                    pl.teleport(new BABYLON.Vector3(p.x - 0.9, 0, p.z));
                    pl.root.rotation.y = Math.PI / 2;
                    pl.primary();
                    return null;
                });
                if (r) return null;
                const f = await waitFor(() => { const E = Pelada.E, n = E.kids.filter((k) => k.npc.fsm.name === 'FIGHT' && k.npc.fsm.current.foe === game.player).length; return n >= 2 ? { n, fight: E.fight } : null; }, 1.2);
                if (f) return f;
            }
            return null;
        })();
        c.ok(!!hit, `apanhou: ${hit ? hit.n : 0} partem para cima do jogador`);

        // 7) foi embora: a raiva baixa e o jogo recomeça
        await page.evaluate(() => { const q = Pelada.q; game.player.teleport(new BABYLON.Vector3(q.mx + 40, 0, q.mz - 40)); game.camera.snapTo(game.player.position); });
        const back = await waitFor(() => { const E = Pelada.E; if (!E) return null; const n = E.kids.filter((k) => Pelada._playing(k)).length; return !E.stop && !E.fight && n >= 6 ? { n, anger: Math.round(E.anger) } : null; }, 60);
        c.ok(!!back, `longe deles, a raiva passa e voltam a jogar (${back ? back.n + ' jogando' : JSON.stringify(await page.evaluate(() => Pelada.info()))})`);

        c.noErrors(errors, 'pelada');
        await close();
    },
};
