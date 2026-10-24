// Corrida como no GTA San Andreas: o padrão é TROTAR (sem gastar fôlego); o SPRINT (Shift · L3 · botão do celular) gasta fôlego e é
// PROPORCIONAL (cada toque soma, segurar mantém um sprint médio — InputManager.sprintTick); analógico pouco inclinado anda; nos
// interiores só anda (menos em assalto/missão/fuga — Game._walkIndoors). O mesmo impulso faz o crawl no nado e pedala forte a bicicleta.
const { boot, gameWait, leave } = require('./lib.cjs');

module.exports = {
    name: 'corrida',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx, { outside: false });
        // amostra (dt, velocidade, estado, impulso, fôlego) a cada quadro; o teste dirige o jogador por __dir (mundo) e __tilt
        await page.evaluate(() => {
            Tutorial.skip(); game.gps = null; game.player.invulnerable = true;
            window.__S = []; window.__dir = null; window.__tilt = 1; window.__tap = false;
            const o = game._update.bind(game);
            game._update = (dt) => {
                if (window.__tap) { window.__tapOn = !window.__tapOn; game.input.setVirtual('shift', window.__tapOn, 'test'); }      // toque a cada quadro
                const r = o(dt), p = game.player, car = game.mode === 'car' && game.activeCar;
                window.__S.push({ dt: dt || 0, v: car ? car.forwardSpeed : p.speed, st: p.state, k: game.input.sprint, sta: p.stamina, swim: !!p.swimming, crawl: !!p._crawl });
                return r;
            };
            game.input.getMoveAxis = () => {
                const d = window.__dir; if (!d) return { x: 0, z: 0 };
                if (game.mode === 'car') return { x: 0, z: window.__tilt };
                const { forward, right } = game.camera.getGroundBasis();
                return { x: (d.x * right.x + d.z * right.z) * window.__tilt, z: (d.x * forward.x + d.z * forward.z) * window.__tilt };
            };
        });
        const tilt = (t) => page.evaluate((t) => { window.__tilt = t; game.input.analog.x = 0; game.input.analog.z = t; }, t);
        const sprintKey = (on) => page.evaluate((on) => { window.__tap = false; game.input.setVirtual('shift', on, 'test'); }, on);
        // roda `sec` s de jogo e resume a 2ª metade: velocidade média, estado mais comum, impulso médio, fôlego gasto por segundo
        const phase = async (sec) => {
            await page.evaluate(() => { window.__S = []; });
            await gameWait(page, sec);
            return page.evaluate(() => {
                const S = window.__S, T = S.reduce((a, s) => a + s.dt, 0), H = []; let t = 0;
                for (const s of S) { t += s.dt; if (t >= T / 2) H.push(s); }
                const n = Math.max(1, H.length), cnt = {};
                for (const s of H) cnt[s.st] = (cnt[s.st] || 0) + 1;
                const sta = S.length > 1 ? (S[S.length - 1].sta - S[0].sta) / Math.max(1e-3, T - S[0].dt) : 0;
                return { v: H.reduce((a, s) => a + s.v, 0) / n, vmax: Math.max(0, ...S.map((s) => s.v)), st: Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0], k: H.reduce((a, s) => a + s.k, 0) / n,
                    kmax: Math.max(0, ...S.map((s) => s.k)), kend: S.length ? S[S.length - 1].k : 0, sprint: S.filter((s) => s.st === 'sprint').length / Math.max(1, S.length), dsta: sta, swim: H.filter((s) => s.swim).length / n, crawl: H.filter((s) => s.crawl).length / n };
            });
        };
        const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);

        // 0) a conta do impulso (síncrono: nenhum quadro roda no meio)
        const K = await page.evaluate(() => {
            const I = game.input, P = Config.player, keep = { s: I.sprint, w: I._sprintWas, k: I.keys['shift'] }, out = {};
            const tick = (held, dt) => { I.keys['shift'] = held; return I.sprintTick(dt); };
            I.sprint = 0; I._sprintWas = false;
            for (let i = 0; i < 60; i++) tick(true, 1 / 60);
            out.hold = I.sprint;
            for (let i = 0; i < 60; i++) tick(false, 1 / 60);
            out.release = I.sprint;
            for (let i = 0; i < 40; i++) tick(i % 6 < 3, 1 / 60);                 // ~10 toques por segundo
            out.taps = I.sprint;
            I.sprint = 0; I._sprintWas = false; tick(true, 1 / 60); out.one = I.sprint; tick(false, 1 / 60);
            I.sprint = keep.s; I._sprintWas = keep.w; I.keys['shift'] = keep.k;
            out.P = { hold: P.sprintHold };
            return out;
        });
        c.ok(Math.abs(K.hold - K.P.hold) < 1e-6, `segurando o sprint: impulso médio (${K.hold.toFixed(2)})`);
        c.ok(K.release === 0, 'soltou: o impulso zera (volta ao trote)');
        c.ok(K.taps > 0.85, `tocando repetido: o impulso vai ao máximo (${K.taps.toFixed(2)})`);
        c.ok(K.one > K.P.hold * 0.5 && K.one < K.P.hold + 0.1, `um toque dá um impulso na hora (${K.one.toFixed(2)})`);

        // 1) na safe house: só anda, mesmo com o sprint apertado (e sem gastar fôlego)
        const V = await page.evaluate(() => {
            const O = Outfit.m, k = (1 + (O.walk || 0)) * Physique.speedMul();
            return { inside: !!Interiors.active, walk: Config.player.maxSpeed * k, jog: Config.player.jogSpeed * k, fwd: (() => { const { forward } = game.camera.getGroundBasis(); return { x: forward.x, z: forward.z }; })() };
        });
        c.ok(V.inside, 'começa dentro da safe house');
        await page.evaluate((f) => { window.__dir = f; }, V.fwd);
        await tilt(1); await sprintKey(true);
        const In = await phase(1.2);
        c.ok(In.vmax <= V.walk * 1.04 && In.st === 'walk' && In.dsta >= -0.01, `nos interiores, só anda (${f1(In.vmax)} m/s ≤ ${f1(V.walk)}, ${In.st}, fôlego ${f1(In.dsta)}/s)`);
        const W = await page.evaluate(() => {
            const g = game, out = {}, keep = { h: Heists.run, r: Robbery.session, m: g.missions.cur };
            out.free = g._walkIndoors();
            Heists.run = {}; out.heist = g._walkIndoors(); Heists.run = keep.h;
            Robbery.session = {}; out.rob = g._walkIndoors(); Robbery.session = keep.r;
            g.missions.cur = {}; out.mission = g._walkIndoors(); g.missions.cur = keep.m;
            return out;
        });
        c.ok(W.free && !W.heist && !W.rob && !W.mission, `golpe, assalto ou missão liberam a corrida lá dentro (${JSON.stringify(W)})`);
        await page.evaluate(() => { game.__walkIn = game._walkIndoors; game._walkIndoors = () => false; window.__dir = { x: -window.__dir.x, z: -window.__dir.z }; });
        const InRun = await phase(1.0);
        await page.evaluate(() => { game._walkIndoors = game.__walkIn; });
        c.ok(InRun.vmax > V.walk * 1.4, `em assalto/missão, lá dentro também corre (${f1(InRun.vmax)} m/s)`);
        await sprintKey(false);
        await page.evaluate(() => { window.__dir = null; });
        await leave(page);

        // 2) na rua, numa reta: trote (padrão), andar (analógico pouco inclinado), sprint segurado e tocado
        const st = await page.evaluate(() => {
            const P = game.player.position, flat = (q) => { for (let t = 0; t <= 45; t += 5) if (Math.abs(MapGeo.slopeAlong(q.point.x + q.d.dx * t, q.point.z + q.d.dz * t, q.d.dx, q.d.dz)) > 0.03) return false; return true; };
            for (let i = 0; i < 80; i++) {                                    // (uma reta plana: a ladeira do morro freia o passo — MapGeo.slopeSpeed)
                const s = RoadNet.randomLanePoint(45, { x: P.x, z: P.z, rMin: 0, rMax: 200 + i * 10 });
                if (s && flat(s)) { window.__start = { x: s.point.x, z: s.point.z, d: { x: s.d.dx, z: s.d.dz } }; return true; }
            }
            return false;
        });
        if (!c.ok(st, 'achou uma reta para correr')) { await close(); return; }
        const restart = (pen = false) => page.evaluate((pen) => {
            const s = window.__start, pl = game.player;
            pl.teleport(new BABYLON.Vector3(s.x, 0, s.z)); pl.root.rotation.y = Math.atan2(s.d.x, s.d.z);
            game.camera.snapTo(pl.position); window.__dir = s.d;
            if (pen) { pl.stamina = pl.staminaMax || 100; pl.winded = false; }
        }, pen);
        await restart(true); await tilt(1); await sprintKey(false);
        const jog = await phase(1.6);
        c.ok(jog.st === 'jog' && jog.v > V.jog * 0.8 && jog.v < V.jog * 1.08, `por padrão TROTA (${f1(jog.v)} m/s ≈ ${f1(V.jog)}, ${jog.st})`);
        c.ok(jog.dsta >= -0.01, `trotar não gasta fôlego (${f1(jog.dsta)}/s)`);
        await restart(); await tilt(0.4);
        const walk = await phase(1.2);
        c.ok(walk.st === 'walk' && walk.v < V.walk * 1.08 && walk.v > V.walk * 0.7, `analógico pouco inclinado: anda (${f1(walk.v)} m/s, ${walk.st})`);
        await restart(true); await tilt(1); await sprintKey(true);
        const hold = await phase(2.4);                                   // (do zero ao pique leva ~1,4 s: Config.player.moveAccel)
        await sprintKey(false);
        c.ok(hold.st === 'sprint' && hold.v > V.jog * 1.3, `segurando o sprint: corre (${f1(hold.v)} m/s, ${hold.st}, impulso ${hold.k.toFixed(2)})`);
        c.ok(hold.dsta < -0.5, `o sprint gasta fôlego (${f1(hold.dsta)}/s)`);
        await restart(true);
        await page.evaluate(() => { window.__tap = true; });
        const taps = await phase(2.4);
        await sprintKey(false);
        c.ok(taps.k > 0.85 && taps.vmax > hold.vmax * 1.12, `tocando repetido: corre mais (${f1(taps.vmax)} m/s contra ${f1(hold.vmax)} segurando; impulso ${taps.k.toFixed(2)})`);
        c.ok(taps.dsta < hold.dsta, `e gasta mais fôlego (${f1(taps.dsta)}/s contra ${f1(hold.dsta)}/s)`);
        await restart();
        const back = await phase(1.6);
        c.ok(back.st === 'jog' && back.kend === 0 && back.v < V.jog * 1.08, `soltou: volta ao trote (${f1(back.v)} m/s)`);

        // 3) sem fôlego: não tem sprint, mas trota
        await restart();
        await page.evaluate(() => { const pl = game.player; pl.stamina = 0; pl.winded = true; });
        await sprintKey(true);
        const tired = await phase(1.2);
        await sprintKey(false);
        c.ok(tired.st === 'jog' && tired.v < V.jog * 1.05, `sem fôlego, o sprint não sai: trota (${f1(tired.v)} m/s, ${tired.st})`);

        // 4) teclado: Shift é o sprint
        await restart(true);
        await page.keyboard.down('Shift');
        const kb = await phase(1.6);                                     // (do trote ao sprint ~0,7 s: vale o pico, não o estado mais comum)
        await page.keyboard.up('Shift');
        c.ok(kb.sprint > 0 && kb.vmax > V.jog * 1.15 && kb.kmax >= 0.5, `teclado: Shift dá o sprint (pico ${f1(kb.vmax)} m/s, ${Math.round(kb.sprint * 100)}% em sprint, impulso ${kb.kmax.toFixed(2)} → ${kb.kend.toFixed(2)})`);

        // 5) controle: L3 é o sprint, R3 agacha, ↓ arromba/furta (controle "standard" de mentira)
        await page.evaluate(() => {
            window.__pad = { b: {} };
            const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', connected: true, mapping: 'standard', index: 0, axes: [0, -1, 0, 0],
                get buttons() { return Array.from({ length: 17 }, (_, i) => ({ pressed: !!window.__pad.b[i], value: window.__pad.b[i] ? 1 : 0 })); } };
            window.__padGet = navigator.getGamepads; navigator.getGamepads = () => [pad];
            game.input._lastPadCheck = 0;
        });
        await restart(true);
        await page.evaluate(() => { window.__pad.b[10] = true; });
        const pad = await phase(1.6);
        const padKeys = await page.evaluate(() => { const k = game.input.keys; return { shift: !!k['shift'], q: !!k['q'], h: !!k['h'], src: game.input._virt['shift'] }; });
        await page.evaluate(() => { window.__pad.b[10] = false; window.__pad.b[11] = true; });
        await gameWait(page, 0.2);
        const r3 = await page.evaluate(() => { const k = game.input.keys; return { q: !!k['q'], shift: !!k['shift'] }; });
        await page.evaluate(() => { window.__pad.b[11] = false; window.__pad.b[13] = true; });
        await gameWait(page, 0.2);
        const down = await page.evaluate(() => ({ steal: !!game.input.keys['padsteal'], g: !!game.input.keys['g'] }));
        await page.evaluate(() => { window.__pad.b = {}; navigator.getGamepads = () => []; game.input._lastPadCheck = 0; });
        await gameWait(page, 0.2);
        await page.evaluate(() => { navigator.getGamepads = window.__padGet; if (game.player.crouched) game.player.setCrouch(false); });
        c.ok(padKeys.shift && padKeys.src === 'pad' && !padKeys.q && pad.sprint > 0 && pad.vmax > V.jog * 1.15, `controle: L3 é o sprint (pico ${f1(pad.vmax)} m/s, ${Math.round(pad.sprint * 100)}% em sprint, ${JSON.stringify(padKeys)})`);
        c.ok(r3.q && !r3.shift, `controle: R3 agacha (${JSON.stringify(r3)})`);
        c.ok(down.steal, 'controle: ↓ arromba o carro encostado ou furta');

        // 6) nadando: o mesmo impulso faz o crawl (e mais rápido tocando)
        const sea = await page.evaluate(() => {
            const P = game.player.position, W = Config.water, deep = (x, z) => MapGeo.waterDepth(x, z) > W.wadeDepth + 0.8;
            for (let r = 40; r < 3000; r += 30) for (let a = 0; a < 24; a++) {
                const x = P.x + r * Math.cos(a / 24 * Math.PI * 2), z = P.z + r * Math.sin(a / 24 * Math.PI * 2);
                if (!deep(x, z)) continue;
                for (let b = 0; b < 8; b++) {
                    const dx = Math.cos(b / 8 * Math.PI * 2), dz = Math.sin(b / 8 * Math.PI * 2);
                    let ok = true; for (let s = 4; s <= 40 && ok; s += 4) ok = deep(x + dx * s, z + dz * s);
                    if (ok) return { x, z, d: { x: dx, z: dz } };
                }
            }
            return null;
        });
        if (c.ok(!!sea, 'achou mar fundo para nadar')) {
            await page.evaluate((s) => { window.__start = s; }, sea);
            await restart(true); await sprintKey(false);
            const breast = await phase(1.4);
            await restart(true); await sprintKey(true);
            const crawl = await phase(1.8);
            await sprintKey(false);
            await restart(true);
            await page.evaluate(() => { window.__tap = true; });
            const crawlT = await phase(1.8);
            await sprintKey(false);
            c.ok(breast.swim > 0.9 && breast.crawl === 0, `nadando sem sprint: nado peito (${f1(breast.v)} m/s)`);
            c.ok(crawl.crawl > 0.5 && crawl.v > breast.v * 1.2, `sprint na água: crawl (${f1(crawl.v)} m/s contra ${f1(breast.v)} no peito)`);
            c.ok(crawlT.v > crawl.v * 1.05, `tocando repetido, o crawl acelera (${f1(crawlT.v)} m/s contra ${f1(crawl.v)} segurando)`);
        }

        // 7) bicicleta: o sprint pedala forte (mais rápido, gasta fôlego)
        const bk = await page.evaluate(() => {
            const vm = game.vehicleManager, pl = game.player, s0 = RoadNet.randomLanePoint(45, { x: pl.position.x, z: pl.position.z, rMin: 0, rMax: 300 });
            const free = () => vm.vehicles.find((v) => v.spec && v.spec.bike === 'bike' && !v.controlled);
            // (o trânsito sorteia as bicicletas: sem nenhuma solta agora, uma estacionada no meio-fio, como o TrafficManager põe)
            for (let i = 0; i < 20 && !free(); i++) game.traffic._spawnBike('bicycle', 'parked', null, { x: pl.position.x, z: pl.position.z, rMin: 0, rMax: 400 });
            const b = free();
            if (!b || !s0) return null;
            window.__start = { x: s0.point.x, z: s0.point.z, d: { x: s0.d.dx, z: s0.d.dz } };
            b.riderVariant = null; b.mode = 'parked'; b.route = null;
            b.teleport(s0.point.x, s0.point.z, Math.atan2(s0.d.dx, s0.d.dz));
            pl.teleport(new BABYLON.Vector3(s0.point.x, 0, s0.point.z));
            b.setRider(0); pl.setVisible(false); b.setControlled(true); game.activeCar = b; game.mode = 'car';
            game.camera.snapTo(b.position); window.__b = b; window.__dir = { x: 0, z: 1 };
            pl.stamina = pl.staminaMax || 100; pl.winded = false;
            return { top: b.spec.maxSpeed * (1 + (SkillTree.m.topSpeed || 0)) };
        });
        if (c.ok(!!bk, 'achou uma bicicleta')) {
            await tilt(1); await sprintKey(false);
            const cruise = await phase(7);
            await page.evaluate(() => { window.__tap = true; });
            const pedal = await phase(5);
            await sprintKey(false);
            const bm = await page.evaluate(() => game.input.bikeMode);
            c.ok(bm, 'na bicicleta, o controle sabe que está pedalando (L3 = sprint, não buzina)');
            c.ok(cruise.vmax <= bk.top * 0.82 && cruise.dsta >= -0.01, `pedalando normal: ${f1(cruise.vmax)} m/s (até 80% de ${f1(bk.top)}) sem gastar fôlego`);
            c.ok(pedal.vmax > cruise.vmax + 0.6 && pedal.dsta < -0.3, `sprint na bicicleta: pedala forte (${f1(pedal.vmax)} m/s, fôlego ${f1(pedal.dsta)}/s)`);
        }

        c.noErrors(errors, 'corrida');
        await close();
    },
};
