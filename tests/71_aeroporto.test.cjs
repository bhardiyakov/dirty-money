// AEROPORTO, AVIÕES E PARAQUEDAS (map/Airport.js, vehicle/Plane.js, player/Parachute.js):
//   • o Aeroporto das Fazendas: pista 09/27 plana, sem estrada cortando, sem pedestre na pista, no mapa;
//   • três aviões no pátio (teco-teco, bimotor, jatinho); o balcão aluga avião, vende paraquedas e o salto do aeroclube;
//   • voar: acelerar, decolar dentro da pista (os três), subir, curvar, estolar sem velocidade, pousar devagar e nivelado, descer;
//     bater no chão rápido = explosão; decolar sem alugar = roubo (a torre chama a polícia);
//   • paraquedas: saltar do avião com ele, queda livre, abrir, frear e pousar em pé (gasta o paraquedas); sem ele, a queda mata;
//     o salto do clube termina com o prêmio do alvo.
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'aeroporto',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        page.setDefaultTimeout(0);
        await page.evaluate(() => {
            Tutorial.skip(); Interiors.autoEnter = () => {};
            Config.time.cycleSeconds = 1e12; game.dayNight.hour = 10; Weather.cur.set('clear', true, true);
            game.gameEngine.engine.stopRenderLoop();
            CrimeExposure._witnessSees = () => false;
            window.__keys = (k = {}) => { const K = game.input.keys; for (const q of ['w', 's', 'a', 'd', ' ', 'shift', 'q', 'e']) K[q] = !!k[q]; };
            window.__P = (m) => game.choppers.find((q) => q.isPlane && q.M.id === m);
            window.__st = (p) => ({ v: +(p.v * 3.6).toFixed(0), alt: +p.alt.toFixed(1), ground: p.onGround, state: p.state, x: Math.round(p.position.x), stall: p.stall, mode: game.mode });
        });
        const step = async (secs, keys = {}) => {
            for (let t = 0; t < secs * 6; t++) {
                await page.evaluate((k) => { __keys(k); for (let i = 0; i < 10; i++) { game._update(1 / 60); const ph = game.scene.getPhysicsEngine(); if (ph && game.scene.physicsEnabled) ph._step(1 / 60); } __keys({}); }, keys);
                await page.waitForTimeout(5);
            }
        };

        // ------------------------------------------------------------------ o aeroporto
        const A = await page.evaluate(() => {
            const R = Airport.RUNWAY, hs = [];
            for (let x = R.x0; x <= R.x1; x += 20) for (const dz of [-12, 0, 12]) hs.push(Relief.at(x, R.z + dz));
            let crossing = 0;
            for (const e of RoadPlan.edges) for (const p of e.pts || []) if (Airport.blocks(p.x, p.z, 0)) { crossing++; break; }
            const walk = [[-760, 140], [-700, 75], [-900, 104]].filter(([x, z]) => game.nav.walk(x, z)).length;
            const park = game.nav.walk(-800, 28), poi = CityGrid.pois.some((q) => q.type === 'aeroporto');
            const biome = WorldMap.biomeAt(-760, 140) === WorldMap.B.GRASS;
            return { built: Airport.built, len: R.x1 - R.x0, flat: +(Math.max(...hs) - Math.min(...hs)).toFixed(2), crossing, walk, park, poi, biome, solids: Airport.solids.length, glow: !!Airport._glow };
        });
        c.ok(A.built && A.len >= 400 && A.flat < 0.5 && A.biome, `Aeroporto das Fazendas: pista de ${A.len} m, plana (desnível ${A.flat} m), gramado em volta`);
        c.ok(A.crossing === 0 && A.poi, `nenhuma estrada cortando o aeroporto (${A.crossing}); no mapa como ponto de interesse`);
        c.ok(A.walk === 0 && A.park, 'pedestres fora da pista e do pátio (o estacionamento continua andável)');

        // ------------------------------------------------------------------ os aviões e o balcão
        const D = await page.evaluate(() => {
            const P = game.choppers.filter((q) => q.isPlane).map((q) => ({ id: q.M.id, name: q.M.name, on: q.onGround, rented: q.rented }));
            game.player.teleport(new BABYLON.Vector3(Airport.DESK.x, 0, Airport.DESK.z)); game.player.action = null;
            const pr = Airport.prompt(game);
            game.inventory.cash = 20000; game.inventory.clean = 20000;
            const shop = Airport.deskShop(), stock = Economy.stockFor(shop).items.map((e) => e.id);
            const ch0 = Items.count(game.inventory, 'paraquedas');
            const b1 = Economy.buy(game, shop, 'it_paraquedas'), b2 = Economy.buy(game, shop, 'air_teco'), b3 = Economy.buy(game, shop, 'air_teco');
            return { P, pr, stock, chute: Items.count(game.inventory, 'paraquedas') - ch0, b1: b1.ok, b2: b2.ok, b2m: b2.msg, b3: b3.ok, b3m: b3.msg, rented: __P('teco').rented };
        });
        c.ok(D.P.length === 3 && new Set(D.P.map((q) => q.id)).size === 3 && D.P.every((q) => q.on), `três aviões no pátio: ${D.P.map((q) => q.name).join(', ')}`);
        c.ok(/Balcão do aeroporto/.test(D.pr) && D.stock.length === 5, `balcão na porta do terminal: ${D.stock.join(', ')}`);
        c.ok(D.b1 && D.chute === 1 && D.b2 && D.rented && !D.b3, `comprou o paraquedas e alugou o teco-teco ("${D.b2m}"); alugar de novo não cobra ("${D.b3m}")`);

        // ------------------------------------------------------------------ voar o teco-teco (na pista 09, para leste)
        const B = await page.evaluate(() => {
            const p = __P('teco'); p.home = { x: -960, z: 140, heading: Math.PI / 2, model: 'teco' }; p.revive(); p.rented = true;
            game.player.teleport(new BABYLON.Vector3(-960, 0, 145)); game.player.action = null;
            game._toggleHijack();
            return { mode: game.mode, plane: game.chopper === p, hud: (() => { try { game._promptHtml = null; } catch (e) { void e; } return true; })() };
        });
        c.ok(B.mode === 'heli' && B.plane, 'F perto do teco-teco: embarca');
        await step(8, { w: 1 });
        const T1 = await page.evaluate(() => __st(__P('teco')));
        await step(4, { w: 1, ' ': 1 });
        const T2 = await page.evaluate(() => Object.assign(__st(__P('teco')), { roll: Math.round(__P('teco').position.x - (-960)) }));
        await step(5, {});
        const T3 = await page.evaluate(() => __st(__P('teco')));
        c.ok(T1.ground && T1.v > 70 && !T2.ground && T3.alt > 25, `acelera na pista (${T1.v} km/h), puxa e decola, sobe (${T3.alt} m a ${T3.v} km/h)`);
        const h0 = await page.evaluate(() => __P('teco').heading);
        await step(4, { d: 1 });
        const turn = await page.evaluate((h0) => { const p = __P('teco'); return { dh: +(p.heading - h0).toFixed(2), alt: +p.alt.toFixed(0), bank: +p.bank.toFixed(2) }; }, h0);
        c.ok(turn.dh > 0.8 && turn.alt > 15, `inclina para a direita e faz a curva (rumo +${turn.dh} rad, ${turn.alt} m)`);
        // estol: sem motor e puxando o nariz, ele perde velocidade e afunda (lá no alto)
        await page.evaluate(() => { __P('teco').y += 150; });
        await step(6, { s: 1, ' ': 1 });
        const S = await page.evaluate(() => { const p = __P('teco'); return { stall: p.stall, v: +(p.v * 3.6).toFixed(0), vy: +p.vy.toFixed(1), alt: +p.alt.toFixed(0), state: p.state }; });
        c.ok(S.stall && S.vy < -1 && S.state === 'flying', `sem motor e puxando: ESTOL (${S.v} km/h, afundando ${S.vy} m/s a ${S.alt} m)`);

        // ------------------------------------------------------------------ pouso: na reta final, devagar e nivelado
        const L = await page.evaluate(() => {
            const p = __P('teco'), R = Airport.RUNWAY;
            p.position.set(R.x0 + 40, 0, R.z); p.heading = Math.PI / 2; p.y = Relief.at(R.x0 + 40, R.z) + 6; p.v = 26; p.vy = -1.6; p.pitch = 0.04; p.bank = 0; p.onGround = false; p.throttle = 0.25; p.state = 'flying'; p.hp = p.maxHp;
            return true;
        });
        void L;
        await step(4, { shift: 1 });
        const L1 = await page.evaluate(() => Object.assign(__st(__P('teco')), { rwy: Airport.onRunway(__P('teco').position.x, __P('teco').position.z, 2) }));
        await step(8, { s: 1 });
        const L2 = await page.evaluate(() => __st(__P('teco')));
        c.ok(L1.ground && L1.state !== 'dead' && L1.rwy && L2.v < 5, `pouso na pista (${L1.v} km/h no toque) e freia até parar (${L2.v} km/h)`);
        const OUT = await page.evaluate(() => { game._toggleHijack(); const p = __P('teco'); return { mode: game.mode, d: Math.round(Math.hypot(game.player.position.x - p.position.x, game.player.position.z - p.position.z)) }; });
        c.ok(OUT.mode === 'player' && OUT.d < 8, `F parado: desce ao lado do avião (${OUT.d} m)`);

        // ------------------------------------------------------------------ queda: rápido no chão = explosão (sem ninguém dentro)
        const X = await page.evaluate(() => {
            const p = __P('bimotor'), x = -700, z = 300;
            p.position.set(x, 0, z); p.y = Relief.at(x, z) + 4; p.v = 50; p.vy = -14; p.pitch = -0.3; p.onGround = false; p.state = 'flying'; p.pilot = false;
            for (let i = 0; i < 60 && p.state !== 'dead'; i++) p.update(1 / 60, null);
            const dead = p.state === 'dead';
            p.revive();
            return { dead, back: p.alive && p.onGround };
        });
        c.ok(X.dead && X.back, 'mergulho no chão: o avião explode (e um novo aparece no pátio)');

        // ------------------------------------------------------------------ decolar sem alugar: roubo
        const W = await page.evaluate(() => { const p = __P('jato'); p.rented = false; p.stolenWarned = false; p.pilot = true; const w0 = game.wanted.level; p._takeoff(); p.pilot = false; const w = game.wanted.level; game.wanted.level = 0; if (game.wanted.clear) game.wanted.clear(); return { w0, w }; });
        c.ok(W.w >= 2, `decolagem não autorizada com o jatinho: a torre chama a polícia (${W.w0} → ${W.w} estrelas)`);

        // ------------------------------------------------------------------ jatinho e bimotor decolam dentro da pista
        for (const m of ['bimotor', 'jato']) {
            await page.evaluate((m) => {
                if (game.mode === 'heli') game._leaveChopper && (game.chopper.onGround ? game._toggleHijack() : null);
                const p = __P(m); p.home = { x: Airport.RUNWAY.x0 + 8, z: Airport.RUNWAY.z, heading: Math.PI / 2, model: m }; p.revive(); p.rented = true;
                game.player.teleport(new BABYLON.Vector3(p.position.x, 0, p.position.z + 4)); game.player.action = null; game._boardChopper(p);
            }, m);
            let lifted = null;
            for (let k = 0; k < 24 && !lifted; k++) {
                await step(0.5, { w: 1, ' ': 1 });
                lifted = await page.evaluate((m) => { const p = __P(m); return p.onGround ? null : { x: Math.round(p.position.x - Airport.RUNWAY.x0), v: Math.round(p.v * 3.6) }; }, m);
            }
            c.ok(lifted && lifted.x < 400, `${m}: decola a ${lifted ? lifted.v : '?'} km/h depois de ${lifted ? lifted.x : '?'} m de pista (de 410)`);
            await step(3, { w: 1, ' ': 1 });
        }

        // ------------------------------------------------------------------ paraquedas: saltar do jatinho lá no alto
        const J0 = await page.evaluate(() => {
            const p = game.chopper; p.y = Relief.at(p.position.x, p.position.z) + 420; p.vy = 0; p.pitch = 0;
            const n0 = Items.count(game.inventory, 'paraquedas');
            game._toggleHijack();
            return { active: Parachute.active, phase: Parachute.s && Parachute.s.phase, mode: game.mode, n0, prompt: Parachute.prompt() };
        });
        c.ok(J0.active && J0.phase === 'free' && J0.mode === 'player' && /ABRIR O PARAQUEDAS/.test(J0.prompt), 'F no alto com paraquedas: salta em queda livre ("ESPAÇO abrir o paraquedas")');
        await step(4, { w: 1 });
        const J1 = await page.evaluate(() => ({ vy: +Parachute.s.vy.toFixed(1), agl: Math.round(Parachute.agl()), air: +(game.camera.airK || 0).toFixed(2) }));
        await page.evaluate(() => Parachute.open(game));
        await step(3, {});
        const J2 = await page.evaluate(() => ({ phase: Parachute.s.phase, vy: +Parachute.s.vy.toFixed(1), canopy: Parachute._cv.isEnabled() }));
        c.ok(J1.vy < -30 && J2.phase === 'open' && J2.vy > -6 && J2.canopy, `queda livre a ${-J1.vy} m/s; abriu: o velame segura (${-J2.vy} m/s)`);
        const h1 = await page.evaluate(() => Parachute.s.heading);
        await step(2, { a: 1 });
        const J3 = await page.evaluate((h1) => +(Parachute.s.heading - h1).toFixed(2), h1);
        c.ok(J3 < -0.8, `A: o velame faz a curva (${J3} rad)`);
        // desce freando no fim
        let landed = false;
        for (let k = 0; k < 160 && !landed; k++) { const agl = await page.evaluate(() => Parachute.active ? Parachute.agl() : -1); landed = agl < 0; await step(0.5, agl < 20 ? { s: 1 } : {}); }
        const J4 = await page.evaluate((n0) => ({ active: Parachute.active, hp: game.player.hp, n: Items.count(game.inventory, 'paraquedas'), landed: Parachute.stats.landed, mode: game.mode }), J0.n0);
        c.ok(!J4.active && J4.hp > 0 && J4.landed >= 1 && J4.n === J0.n0 - 1, `pousou em pé (vida ${Math.round(J4.hp)}); o paraquedas foi gasto (${J0.n0} → ${J4.n})`);

        // ------------------------------------------------------------------ o salto do aeroclube: alvo e prêmio
        const K = await page.evaluate(() => {
            game.player.teleport(new BABYLON.Vector3(Airport.DESK.x, 0, Airport.DESK.z)); game.player.action = null; game.player.hp = game.player.maxHp;
            const shop = Airport.deskShop(), b = Economy.buy(game, shop, 'air_salto');
            return { ok: b.ok, target: !!Parachute.target };
        });
        await step(1.5, {});
        const K1 = await page.evaluate(() => {
            const s = Parachute.s, T = Parachute.target; if (!s) return null;
            const agl = Parachute.agl();
            // (a queda inteira leva um minuto: o teste leva o paraquedista aberto até perto do alvo)
            s.heading = 0; s.x = T.x; s.z = T.z - 15; s.y = Relief.at(s.x, s.z) + 10; s.phase = 'open'; s.k = 1; s.vy = -2.6; s.vx = 0; s.vz = 4; Parachute._canopy(game).setEnabled(true);
            return { agl: Math.round(agl), cash: game.inventory.cash };
        });
        for (let k = 0; k < 20 && await page.evaluate(() => Parachute.active); k++) await step(0.5, { s: 1 });
        await step(2, {});
        const K2 = await page.evaluate(() => ({ active: Parachute.active, cash: game.inventory.cash, best: Parachute.stats.best, target: !!Parachute.target }));
        c.ok(K.ok && K.target && K1 && K1.agl > 550 && !K2.active && K2.cash > K1.cash && K2.best < 5, `salto do aeroclube: saiu a ${K1 && K1.agl} m; pousou a ${K2.best} m do alvo — prêmio +R$ ${K2.cash - (K1 ? K1.cash : 0)}`);

        // ------------------------------------------------------------------ sem paraquedas: a queda
        const F = await page.evaluate(() => {
            Items.take(game.inventory, 'paraquedas', Items.count(game.inventory, 'paraquedas'));
            const p = __P('teco'); p.revive(); p.rented = true;
            game.player.teleport(new BABYLON.Vector3(p.position.x, 0, p.position.z + 3)); game.player.action = null; game.player.hp = game.player.maxHp; game._boardChopper(p);
            p.onGround = false; p.y = Relief.at(p.position.x, p.position.z) + 200; p.v = 35; p.state = 'flying';
            game._toggleHijack();
            return { fall: !!game.heliFall, chute: Parachute.active };
        });
        c.ok(F.fall && !F.chute, 'sem paraquedas, saltar é a queda (mortal em terra firme)');
        c.noErrors(errors, 'aeroporto');
        await close();
    },
};
