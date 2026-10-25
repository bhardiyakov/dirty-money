// Corridas (racing/StreetRacing, RaceCar, Speedway, RaceHUD): o autódromo e os pontos de racha existem e estão no mapa; cada ponto
// de racha monta os traçados (reta do racha, corrida pela cidade, circuito em volta do quarteirão — sem meia-volta nem trecho por
// cima de outro); no autódromo, a prova dos estreantes larga com semáforo (o jogador fica segurado no grid), os rivais andam de
// verdade pelo oval, o takedown conta, a chegada dá o resultado (reputação, estatística) e o fim devolve o carro ao portão e
// os rivais ao mundo. Batida de Burnout: acima de rollAlways o carro capota; acima de explodeDv explode; carro contra carro vale a
// velocidade de aproximação (batida na porta de um estacionado faz ele rolar). A reputação vai no save.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'racha',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        await page.evaluate(() => { Tutorial.skip(); Weather.cur.set('clear', true, true); });
        await gameWait(page, 0.4);

        // ---- lugares
        const world = await page.evaluate(() => ({
            site: !!Speedway.site, meshes: (Speedway.meshes || []).length, built: StreetRacing.built,
            street: StreetRacing.meets.filter((m) => m.kind === 'street').length, arena: StreetRacing.meets.some((m) => m.kind === 'speedway'),
            pois: { sw: CityGrid.pois.some((q) => q.type === 'speedway'), rm: CityGrid.pois.filter((q) => q.type === 'racemeet').length },
            legend: !!PauseMenu.POI_TYPES.speedway && !!PauseMenu.POI_TYPES.racemeet,
        }));
        c.ok(world.site && world.meshes > 0, `autódromo construído (${world.meshes} malhas)`);
        c.ok(world.built && world.street >= 3 && world.arena, `pontos de racha: ${world.street} na rua + o do autódromo`);
        c.ok(world.pois.sw && world.pois.rm === world.street && world.legend, 'autódromo e rachas no mapa (e na legenda)');

        // ---- traçados da rua
        const routes = await page.evaluate(() => {
            StreetRacing.rep = 9999;
            const out = [];
            for (const m of StreetRacing.meets.filter((q) => q.kind === 'street')) {
                const evs = StreetRacing.events(m), r = {};
                for (const ev of evs) {
                    const rt = StreetRacing._route(m, ev);
                    r[ev.type] = rt ? { len: Math.round(rt.len), sane: StreetRacing._sane(rt.pts, !!rt.loop), loop: !!rt.loop } : null;
                }
                out.push(r);
            }
            StreetRacing.rep = 0;
            return out;
        });
        const all = (t) => routes.filter((r) => r[t]).length;
        c.ok(all('drag') === routes.length && routes.every((r) => !r.drag || (r.drag.len >= 255 && r.drag.len <= 405)), `reta do racha em todos os pontos (${routes.map((r) => r.drag && r.drag.len).join(', ')} m)`);
        c.ok(all('sprint') === routes.length && routes.every((r) => !r.sprint || r.sprint.sane), `corrida pela cidade em todos os pontos (${routes.map((r) => r.sprint && r.sprint.len).join(', ')} m)`);
        c.ok(all('circuit') >= routes.length - 1 && routes.every((r) => !r.circuit || (r.circuit.sane && r.circuit.loop)), `circuito fechado sem meia-volta (${routes.map((r) => r.circuit && r.circuit.len).join(', ')} m)`);

        // ---- autódromo: entra no carro no portão, abre a lista, larga a prova dos estreantes
        const st = await page.evaluate(() => {
            const meet = StreetRacing.meets.find((m) => m.kind === 'speedway');
            const b = Garage.spawnCar(game, 'esportivo', 0, meet.x, meet.z, 0);
            game.player.teleport(new BABYLON.Vector3(meet.x, 0, meet.z));
            game.player.setVisible(false); b.setControlled(true); game.activeCar = b; game.mode = 'car'; game.camera.snapTo(b.position);
            const prompt = StreetRacing.carPrompt(game);
            StreetRacing.open(game, meet);
            const board = StreetRacing._p.open && document.querySelectorAll('#raceBoard [data-act="race"]').length;
            const ev = StreetRacing.events(meet)[0];
            StreetRacing._p.close();
            const r = StreetRacing.start(game, meet, ev), C = StreetRacing.cur;
            return { prompt: !!prompt, board, ok: r.ok, n: C && C.rivals.length, phase: C && C.phase, hud: getComputedStyle(document.getElementById('raceHud')).display };
        });
        c.ok(st.prompt && st.board === 4, `no portão: E abre as 4 provas do autódromo`);
        c.ok(st.ok && st.n === 4 && st.phase === 'count' && st.hud !== 'none', 'prova dos estreantes larga: 4 rivais, semáforo e HUD');
        // (as esperas têm folga grande de tempo real: no fim da bateria de testes o Chromium por software anda devagar)
        await page.keyboard.down('w');
        await gameWait(page, 1.5, 60000);
        const held = await page.evaluate(() => ({ v: game.activeCar.speed, rivals: StreetRacing.cur.rivals.every((r) => r.speed < 0.5) }));
        c.ok(held.v < 0.5 && held.rivals, `todos segurados no grid durante o semáforo (${held.v.toFixed(2)} m/s)`);
        await page.keyboard.up('w');
        const go = await page.waitForFunction(() => StreetRacing.cur && StreetRacing.cur.phase === 'race', null, { timeout: 180000 }).then(() => true, () => false);
        const s0 = await page.evaluate(() => ({ s: StreetRacing.cur.rivals.map((r) => r.R.s + r.R.lap * StreetRacing.cur.path.len) }));
        c.ok(go, 'VAI! — a corrida começou');
        const t = await gameWait(page, 6, 240000);
        const s1 = await page.evaluate(() => ({ s: StreetRacing.cur.rivals.map((r) => r.R.s + r.R.lap * StreetRacing.cur.path.len), v: StreetRacing.cur.rivals.map((r) => r.speed), off: StreetRacing.cur.rivals.map((r) => r.R.off || 0) }));
        const moved = s1.s.map((s, i) => s - s0.s[i]);
        c.ok(moved.every((m) => m > 4 * t), `os rivais correm pelo oval (${moved.map((m) => Math.round(m)).join(', ')} m em ${t.toFixed(1)} s)`);
        c.ok(s1.off.every((o) => o < 9), `e ficam na pista (${s1.off.map((o) => o.toFixed(1)).join(', ')} m do eixo)`);

        // takedown: o jogador bate num rival e ele capota
        const td = await page.evaluate(() => {
            const r = StreetRacing.cur.rivals[0];
            StreetRacing.onImpact(game, r, 12, 'player');
            r.rollover(30, 1, 0);
            return !!r.tumble;
        });
        await gameWait(page, 0.4, 30000);
        c.ok(td && (await page.evaluate(() => StreetRacing.cur.takedowns)) === 1, 'takedown: rival capotado depois da sua batida conta');

        // chegada: resultado (reputação, estatística), e o fim devolve tudo
        await page.evaluate(() => StreetRacing._finishPlayer(game));
        await page.waitForFunction(() => StreetRacing._p.open, null, { timeout: 120000 }).catch(() => {});
        const res = await page.evaluate(() => ({ open: StreetRacing._p.open, title: StreetRacing._p.$h.textContent, rep: StreetRacing.rep, races: StreetRacing.stats.races, td: StreetRacing.stats.takedowns }));
        c.ok(res.open && /LUGAR|VENCEU/.test(res.title), `resultado na tela: "${res.title}"`);
        c.ok(res.rep > 0 && res.races === 1 && res.td === 1, `reputação +${res.rep}, 1 corrida, 1 takedown`);
        const fin = await page.evaluate(() => {
            StreetRacing._p.close();
            const g = Speedway.site.gate, p = game.activeCar.position;
            return { cur: StreetRacing.cur, gate: Math.hypot(p.x - g.x, p.z - g.z), hud: getComputedStyle(document.getElementById('raceHud')).display, kept: game.vehicleManager.vehicles.filter((v) => v.R && !v.R.retired).length };
        });
        c.ok(fin.cur === null && fin.hud === 'none' && fin.kept === 0 && fin.gate < 12, `fim: HUD fechado, rivais liberados, carro no portão (${fin.gate.toFixed(1)} m)`);

        // ---- Burnout: capota acima de rollAlways, explode acima de explodeDv
        const crash = await page.evaluate(() => {
            const P = game.player.position, cars = game.vehicleManager.vehicles.filter((v) => !v.controlled && !v.isBike && !v.spec.boat && !v.destroyed && !v.R).slice(0, 2);
            if (cars.length < 2) return null;
            const [a, b] = cars, C = Config.crash;
            for (const [i, car] of [a, b].entries()) { car.teleport(P.x + 30 + i * 12, P.z + 30, 0); car.mode = 'parked'; car.route = null; }
            game._onCarImpact(a, C.rollAlways + 1, 10, C.rollAlways + 1, 0);
            game._onCarImpact(b, C.explodeDv + 2, 10, C.explodeDv + 2, 0);
            return { roll: !!a.tumble, boom: b.burning > 0 || b.destroyed };
        });
        if (c.ok(!!crash, 'achou carros para bater')) c.ok(crash.roll && crash.boom, 'batida forte capota; muito forte, explode');
        // carro contra carro: o dv medido fica baixo (~11 m/s), vale a velocidade de aproximação — a 90 km/h na porta de um carro
        // estacionado (que nem registra batida própria), ele rola
        const tb = await page.evaluate(() => {
            const P = game.player.position, cars = game.vehicleManager.vehicles.filter((v) => !v.controlled && !v.isBike && !v.spec.boat && !v.destroyed && !v.tumble && !v.R && v.mode !== 'abandoned').slice(2, 4);
            if (cars.length < 2) return null;
            const [vic, att] = cars, x = P.x - 40, z = P.z + 40;
            vic.teleport(x, z, 0); vic.mode = 'parked'; vic.route = null;
            att.teleport(x - vic.halfW - att.halfLen - 0.3, z, Math.PI / 2);
            att._cmd = new BABYLON.Vector3(25, 0, 0); vic._burnT = att._burnT = 0;
            game._onCarImpact(att, 11, 5, -11, 0);
            return { vic: !!vic.tumble, att: !!att.tumble };
        });
        if (c.ok(!!tb, 'achou carros para a batida de lado')) c.ok(tb.vic && !tb.att, `batida na porta a 90 km/h: o atingido rola${tb.att ? ' (e quem bateu de frente também capotou — não devia)' : ''}`);

        // ---- save
        const save = await page.evaluate(() => { const s = SaveGame.snapshot(game); const r = s.racing; StreetRacing.load(null); const z = StreetRacing.rep; StreetRacing.load(r); return { r: r && r.rep, z, back: StreetRacing.rep }; });
        c.ok(save.r > 0 && save.z === 0 && save.back === save.r, 'reputação vai no save e volta');

        c.noErrors(errors, 'racha');
        await close();
    },
};
