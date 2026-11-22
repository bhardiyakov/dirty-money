// INVASÃO DE CASAS E APARTAMENTOS (crime/HomeBurglary.js + crime/StoreBurglary.js; interiores novos em art/HomeStylesRes.js):
//   • portas de casa e de prédio residencial pela cidade (fora a favela e os imóveis à venda), com padrão e interior pelo mercado;
//   • quem está em casa muda com a hora e o dia: de madrugada dormem, em dia útil à tarde a maioria está fora, à noite todos acordados;
//   • de tarde, casa vazia: arromba, revista (TV, notebook, gavetas, guarda-roupa, colchão) e sai — descobrem quando voltarem;
//   • de madrugada, os moradores DORMINDO na cama (bonecos deitados); barulho acorda: grita, liga 190 e vê seu rosto;
//   • casa de padrão alto com energia: alarme (dá para desligar a central ao lado da porta); casa de quarteirão sem loja tem caixa de força.
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'invasao_casa',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        page.setDefaultTimeout(0);
        await page.evaluate(() => {
            Tutorial.skip(); Interiors.autoEnter = () => {};
            Config.time.cycleSeconds = 1e12; game.player.invulnerable = true; Weather.cur.set('clear', true, true);
            game.gameEngine.engine.stopRenderLoop();
            CrimeExposure._witnessSees = () => false; CrimeExposure._policeSees = () => false; CrimeExposure._cameraSees = () => false;
            window.__at = (x, z) => { game.player.teleport(new BABYLON.Vector3(x, 0, z)); game.player.velocity.setAll(0); game.camera.snapTo(game.player.position); };
            window.__near = (u) => {
                const O = Interiors.obstacles, free = (x, z) => !O.some((o) => x > o.x0 - 0.35 && x < o.x1 + 0.35 && z > o.z0 - 0.35 && z < o.z1 + 0.35);
                const cx = (u.x0 + u.x1) / 2, cz = (u.z0 + u.z1) / 2;
                for (const [x, z] of [[cx, u.z0 - 0.6], [cx, u.z1 + 0.6], [u.x0 - 0.6, cz], [u.x1 + 0.6, cz], [u.x0 - 0.6, u.z0 - 0.6], [u.x1 + 0.6, u.z0 - 0.6], [u.x0 - 0.6, u.z1 + 0.6], [u.x1 + 0.6, u.z1 + 0.6]]) if (free(x, z)) return { x, z };
                return { x: cx, z: u.z0 - 0.6 };
            };
            window.__pick = (f) => Residences.build().find((r) => f(r) && !Interiors.shopNear(r.x, r.z, 4.5) && !(RealEstate.near && RealEstate.list.some((p) => Math.hypot(p.x - r.x, p.z - r.z) < 4)));
            window.__in = (r) => { __at(r.x, r.z); game.player.action = null; const pr = Interiors.prompt(game); Interiors.interact(game); const lp = game.lockpick.active; if (lp) game.lockpick._finish('ok'); return { pr, lp }; };
        });
        const step = async (secs) => { for (let t = 0; t < secs * 6; t++) { await page.evaluate(() => { for (let i = 0; i < 10; i++) { game._update(1 / 60); const ph = game.scene.getPhysicsEngine(); if (ph && game.scene.physicsEnabled) ph._step(1 / 60); } }); await page.waitForTimeout(10); } };
        const until = async (fn, secs) => { for (let t = 0; t < secs * 6; t++) { if (await page.evaluate(fn)) return true; await step(1 / 6); } return !!(await page.evaluate(fn)); };
        const loot = async (kinds) => {
            const done = [];
            for (const kind of kinds) {
                const ok = await page.evaluate((kind) => {
                    const u = StoreBurglary._uses().find((q) => q.kind === kind && !StoreBurglary.session.done[q.key]); if (!u) return false;
                    const p = __near(u); __at(p.x, p.z); game.player.action = null;
                    const n = StoreBurglary._nearUse(game); if (!n || n.kind !== kind) return false;
                    return StoreBurglary.interact(game) && !!StoreBurglary.session.act;
                }, kind);
                if (!ok) continue;
                await until(() => !StoreBurglary.session || !StoreBurglary.session.act, 25);
                done.push(kind);
            }
            return done;
        };
        const out = async () => { await page.evaluate(() => Interiors.leave(game)); await until(() => !Interiors.active && !Interiors.busy, 10); await step(0.2); };

        // ------------------------------------------------------------------ as portas e quem está em casa
        const R = await page.evaluate(() => {
            const L = Residences.build(), by = {}, stars = {};
            for (const r of L) { by[r.style] = (by[r.style] || 0) + 1; stars[r.stars] = (stars[r.stars] || 0) + 1; }
            const share = (h, day) => { const o = { away: 0, asleep: 0, awake: 0 }; for (const r of L) o[Residences.who(r, game, h, day)]++; for (const k in o) o[k] = +(o[k] / L.length).toFixed(2); return o; };
            const fav = L.filter((r) => r.district === 'favela' || r.biome === 'favela').length;
            const resBlocks = new Set(L.map((r) => r.block)), boxes = Power._build().filter((b) => b.shop && b.shop.res).length;
            return { n: L.length, by, stars, fav, night: share(3, 1), work: share(14, 1), eve: share(20, 1), sunSat: share(13, 5), boxes, blocks: resBlocks.size };
        });
        c.ok(R.n > 150 && R.fav === 0 && R.by.home_casa > 10 && R.by.home_kitnet > 5 && R.by.home_vovo > 5, `${R.n} residências para arrombar (fora da favela): ${Object.entries(R.by).map(([k, v]) => k.replace('home_', '') + ' ' + v).join(', ')}`);
        c.ok(R.night.asleep > 0.7 && R.work.away > 0.45 && R.eve.awake > 0.7 && R.sunSat.away > 0.4, `quem está em casa: madrugada ${R.night.asleep * 100 | 0}% dormindo · terça 14h ${R.work.away * 100 | 0}% fora · 20h ${R.eve.awake * 100 | 0}% acordados · sábado de sol ${R.sunSat.away * 100 | 0}% fora`);
        c.ok(R.boxes > 20, `quarteirões só de casas também têm caixa de força (${R.boxes})`);

        // ------------------------------------------------------------------ à noite, acordados: não dá
        const W = await page.evaluate(() => {
            Economy.day = 1; game.dayNight.hour = 20;
            const r = __pick((q) => Residences.who(q, game) === 'awake'); if (!r) return null;
            const x = __in(r);
            return { pr: x.pr, lp: x.lp, active: !!Interiors.active };
        });
        c.ok(W && /acordada/.test(W.pr) && !W.lp, `20h, gente acordada: "${W && W.pr.replace(/<[^>]+>/g, ' ').slice(0, 70)}…" — E não arromba`);

        // ------------------------------------------------------------------ dia útil, casa vazia (sem alarme)
        const A = await page.evaluate(() => {
            Economy.day = 1; game.dayNight.hour = 14;
            Outfit.give('luvas');
            const r = __pick((q) => q.style === 'home_casa' && !q.alarm && Residences.who(q, game) === 'away'); if (!r) return null;
            window.__A = r;
            const x = __in(r), cash0 = game.inventory.cash; window.__c0 = cash0;
            return { name: r.name, region: r.region, pr: x.pr, lp: x.lp };
        });
        if (!A) { c.ok(false, 'nenhuma casa vazia às 14h'); await close(); return; }
        c.ok(/arrombar/.test(A.pr) && /ninguém em casa/.test(A.pr) && A.lp, `${A.name} (${A.region}) às 14h de terça: "E arrombar a casa — ninguém em casa", fechadura`);
        await until(() => Interiors.active && !Interiors.busy, 10);
        await step(0.3);
        const I = await page.evaluate(() => { const s = StoreBurglary.session; return s && { res: s.res, who: s.who, sleepers: s.sleepers.length, alarm: !!s.alarm, day: s.day, uses: StoreBurglary._uses().map((u) => u.kind), style: Interiors.active.shop.style, i3d: !!Interiors.active.room.i3d, hud: (document.getElementById('burgHud') || {}).textContent || '' }; });
        c.ok(I && I.res && I.style === 'home_casa' && I.i3d && I.sleepers === 0 && !I.alarm && /INVASÃO/.test(I.hud), `dentro: interior novo (casa de família, em 3D), ninguém, sem alarme`);
        c.ok(I && ['tv', 'desk', 'chest', 'closet', 'bed'].every((k) => I.uses.includes(k)), `o que revistar: ${I && I.uses.join(', ')}`);
        const got = await loot(['tv', 'desk', 'chest', 'closet', 'bed']);
        const L1 = await page.evaluate(() => { const s = StoreBurglary.session; return { loot: s.loot, cash: game.inventory.cash - __c0, prints: s.prints }; });
        c.ok(got.length >= 4 && L1.loot.goods > 500 && L1.loot.kg >= 8, `revistou ${got.join(', ')}: ${'R$ ' + L1.loot.goods} em mercadoria (${L1.loot.kg} kg), +R$ ${L1.cash} em dinheiro, ${L1.loot.jv ? 'joias R$ ' + L1.loot.jv : 'sem joia'}`);
        await out();
        const C1 = await page.evaluate(() => { const C = StoreBurglary.cases.find((q) => q.id === __A.id); return C && { at: C.at % 24, prints: C.prints, found: C.found, res: C.res }; });
        c.ok(C1 && C1.res && !C1.prints && !C1.found && Math.abs(C1.at - 18.5) < 0.01, `saiu limpo: descobrem quando voltarem para casa (~${C1 && C1.at}h)`);
        const S1 = await page.evaluate(() => {
            const C = StoreBurglary.cases.find((q) => q.id === __A.id), rec0 = game.heat.record.crimes.length, k0 = StoreBurglary.stats.clean;
            game.dayNight.hour = C.at % 24 + 0.05; StoreBurglary._ct = 0; StoreBurglary.tick(0.1, game);
            game.dayNight.hour += 2.05; StoreBurglary._ct = 0; StoreBurglary.tick(0.1, game);
            return { clean: StoreBurglary.stats.clean - k0, rec: game.heat.record.crimes.length - rec0, chipGone: !StoreBurglary.cases.some((q) => q.id === __A.id) };
        });
        c.ok(S1.clean === 1 && S1.rec === 0 && S1.chipGone, 'voltaram, descobriram; a perícia não achou nada: caso arquivado');

        // ------------------------------------------------------------------ madrugada: moradores dormindo; barulho acorda
        const B = await page.evaluate(() => {
            Economy.day = 2; game.dayNight.hour = 3; game.heat.record.crimes.length = 0;
            Outfit.wear('luvas');                                                           // (sem luvas, de rosto à mostra)
            const r = __pick((q) => (q.style === 'home_casa' || q.style === 'home_vovo') && !q.alarm && Residences.who(q, game) === 'asleep' && !StoreBurglary.why(game, q)); if (!r) return null;
            window.__B = r; return Object.assign({ name: r.name }, __in(r));
        });
        if (!B) { c.ok(false, 'nenhuma casa com gente dormindo'); await close(); return; }
        c.ok(/dormindo/.test(B.pr) && B.lp, `3h: "${B.name}" — moradores dormindo, dá para entrar em silêncio`);
        await until(() => Interiors.active && !Interiors.busy, 10);
        await step(0.3);
        const Z = await page.evaluate(() => { const s = StoreBurglary.session; return { n: s.sleepers.length, vis: s.sleepers.filter((q) => q.a.mesh.isEnabled() && q.a.mesh.isVisible).length, bedFree: StoreBurglary._uses().filter((u) => u.kind === 'bed').length, beds: Interiors.active.data.uses.filter((u) => u.kind === 'bed').length, dim: StoreBurglary.dim }; });
        c.ok(Z.n >= 1 && Z.vis === Z.n && Z.bedFree === Z.beds - Z.n && Z.dim < 0.3, `${Z.n} dormindo nas camas (deitados, à vista: ${Z.vis}); não dá para revirar o colchão de quem dorme (${Z.bedFree}/${Z.beds} camas livres); escuro (luz ${Z.dim})`);
        // agachado perto da cama: sem barulho; andando em pé perto dela: barulho
        const N = await page.evaluate(() => {
            const s = StoreBurglary.session, q = s.sleepers[0], pl = game.player;
            const probe = (crouch) => { s.noise = 0; pl.crouched = crouch; pl.position.x = q.x + 1.2; pl.position.z = q.z - 1.2; for (let i = 0; i < 30; i++) { pl.speed = 1.2; HomeBurglary.tick(1 / 30, game, s); } return s.noise; };
            const a = probe(true), b = probe(false); pl.crouched = false; s.noise = 0;
            return { crouch: a, walk: b };
        });
        c.ok(N.crouch < 0.5 && N.walk > 4, `perto de quem dorme: agachado ${N.crouch.toFixed(1)} de barulho, andando ${N.walk.toFixed(1)}`);
        const WK = await page.evaluate(() => {
            const s = StoreBurglary.session, q = s.sleepers[0];
            __at(q.x + 1.5, q.z - 1.5);
            s.noise = 60; StoreBurglary.update(0.05, game);
            return { woke: s.woke, rang: s.alarm ? s.alarm.rang : !!s.police, police: s.police && s.police.t, seen: s.seen, standing: Math.abs(q.a.mesh.position.y - 0.5) < 0.01 };
        });
        c.ok(WK.woke && WK.police > 0 && WK.seen && WK.standing, `barulho acordou o morador: levantou, gritou, ligou 190 (polícia em ${WK.police && WK.police.toFixed(0)} s) e viu seu rosto`);
        await out();
        const S2 = await page.evaluate(() => {
            const C = StoreBurglary.cases.find((q) => q.id === __B.id); if (!C) return null;
            const found0 = C.at <= Traces.now() + 0.01, rec0 = game.heat.record.crimes.length;
            StoreBurglary._ct = 0; StoreBurglary.tick(0.1, game);
            game.dayNight.hour = C.lab % 24 + 0.05; StoreBurglary._ct = 0; StoreBurglary.tick(0.1, game);
            return { found0, seen: C.seen, rec: game.heat.record.crimes.length - rec0, desc: !!Traces.desc };
        });
        c.ok(S2 && S2.found0 && S2.seen && S2.rec >= 1 && S2.desc, `descoberto na hora; o morador te descreveu: invasão na ficha (+${S2 && S2.rec}) e a descrição da roupa`);

        // ------------------------------------------------------------------ padrão alto: alarme (desligar a central)
        const H = await page.evaluate(() => {
            Economy.day = 8; game.dayNight.hour = 14; Outfit.wear('luvas');
            const r = __pick((q) => q.alarm && !Power.forShop(q) && Residences.who(q, game) === 'away' && !StoreBurglary.why(game, q)); if (!r) return null;
            window.__H = r; return Object.assign({ name: r.name, stars: r.stars, cams: r.cams }, __in(r));
        });
        if (H) {
            await until(() => Interiors.active && !Interiors.busy, 10);
            const al = await page.evaluate(() => { const s = StoreBurglary.session; return { alarm: !!s.alarm, t: s.alarm && s.alarm.t, cams: s.cams, style: Interiors.active.shop.style }; });
            const g2 = await loot(['alarm']);
            const al2 = await page.evaluate(() => { const s = StoreBurglary.session; return { off: s.alarm && s.alarm.off, rang: s.alarm && s.alarm.rang }; });
            c.ok(al.alarm && g2.includes('alarm') && al2.off && !al2.rang, `${H.name} (${H.stars}★, ${al.style}): alarme armado (${al.t && al.t.toFixed(1)} s), central desligada a tempo${al.cams ? '; câmera Wi-Fi gravando' : ''}`);
            await out();
        } else c.ok(false, 'nenhuma casa com alarme vazia às 14h');
        c.noErrors(errors, 'invasao_casa');
        await close();
    },
};
