// ROUBO FURTIVO DE LOJA (crime/StoreBurglary.js + Power): de madrugada, a loja fechada.
//   • a CAIXA DE FORÇA do quarteirão (E: sabotar) apaga as lojas, as vitrines e os postes; as câmeras param; as lojas abertas fecham;
//     derrubar um POSTE também apaga o quarteirão;
//   • na porta fechada: E arromba (mini-game da fechadura) e entra SEM atendente, sem cliente, sem refém — no escuro, com a lanterna;
//   • saque: caixa (troco), cofre (o apurado), prateleiras (na loja de armas: armas), gravador; barulho alto: alguém na rua ouve e liga;
//   • PISTAS: sem energia, de luvas e sem ninguém ver → a perícia não acha nada (CASO ARQUIVADO). Com energia: alarme (se não desligar a
//     central) e câmeras gravando; sem luvas: digitais → seu nome na ficha quando a perícia chega.
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'roubo_furtivo',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        page.setDefaultTimeout(0);
        await page.evaluate(() => {
            Tutorial.skip(); Interiors.autoEnter = () => {};
            Config.time.cycleSeconds = 1e12; game.player.invulnerable = true; Weather.cur.set('clear', true, true);
            game.gameEngine.engine.stopRenderLoop();
            Economy.day = 1; game.dayNight.hour = 3;
            CrimeExposure._witnessSees = () => false; CrimeExposure._policeSees = () => false; CrimeExposure._cameraSees = () => false;      // (a rua de madrugada: o teste decide quem viu)
            window.__shop = (styles, notBlock) => {
                Interiors.index();
                return Interiors._doors.find((s) => styles.includes(s.style) && StoreBurglary.tierOf(s) && !Economy.isOpen(s.style, 3) && Power.blockOf(s) !== notBlock && Power._build().some((b) => b.bid === Power.blockOf(s)));
            };
            window.__at = (x, z) => { game.player.teleport(new BABYLON.Vector3(x, 0, z)); game.player.velocity.setAll(0); game.camera.snapTo(game.player.position); };
            window.__near = (u) => {
                const O = Interiors.obstacles, free = (x, z) => !O.some((o) => x > o.x0 - 0.35 && x < o.x1 + 0.35 && z > o.z0 - 0.35 && z < o.z1 + 0.35);
                const cx = (u.x0 + u.x1) / 2, cz = (u.z0 + u.z1) / 2;
                for (const [x, z] of [[cx, u.z0 - 0.6], [cx, u.z1 + 0.6], [u.x0 - 0.6, cz], [u.x1 + 0.6, cz], [u.x0 - 0.6, u.z0 - 0.6], [u.x1 + 0.6, u.z0 - 0.6], [u.x0 - 0.6, u.z1 + 0.6], [u.x1 + 0.6, u.z1 + 0.6]]) if (free(x, z)) return { x, z };
                return { x: cx, z: u.z0 - 0.6 };
            };
        });
        const step = async (secs) => { for (let t = 0; t < secs * 6; t++) { await page.evaluate(() => { for (let i = 0; i < 10; i++) { game._update(1 / 60); const ph = game.scene.getPhysicsEngine(); if (ph && game.scene.physicsEnabled) ph._step(1 / 60); } }); await page.waitForTimeout(10); } };
        const until = async (fn, secs) => { for (let t = 0; t < secs * 6; t++) { if (await page.evaluate(fn)) return true; await step(1 / 6); } return !!(await page.evaluate(fn)); };
        // saqueia os pontos `kinds` (vai até cada um, E, espera a ação acabar)
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

        // ------------------------------------------------------------------ a loja e a caixa de força
        const A = await page.evaluate(() => {
            const shop = __shop(['bakery', 'clothes', 'pizza', 'fit', 'burger', 'bar', 'italian', 'japanese']);
            if (!shop) return null;
            window.__A = shop;
            __at(shop.x, shop.z);
            const before = Interiors.prompt(game);
            const box = Power._build().find((b) => b.bid === Power.blockOf(shop));
            __at(box.x + box.fx * 0.6, box.z + box.fz * 0.6);
            const bp = StoreBurglary.outPrompt(game);
            Outfit.give('luvas');
            const go = StoreBurglary.outInteract(game);
            return { name: shop.name, style: shop.style, before, bp, go, boxes: Power._build().length };
        });
        if (!A) { c.ok(false, 'nenhuma loja fechada de madrugada com caixa de força'); await close(); return; }
        c.ok(/arrombar/.test(A.before) && /energia ligada/.test(A.before), `${A.name} (${A.style}) fechada às 3h: "E arrombar a porta", avisando da energia ligada`);
        c.ok(A.boxes > 30 && /sabotar a caixa de força/.test(A.bp) && A.go, `caixas de força nos quarteirões com comércio (${A.boxes}); E na caixa começa a sabotagem`);
        await until(() => !StoreBurglary.box, 6);
        const P = await page.evaluate(() => {
            const shop = __A, bid = Power.blockOf(shop), W = game.gameEngine.world;
            const s = (CityGrid.blocks.find((b) => b.id === bid) || {}).slab;
            const lamps = (W.streetLamps || []).filter((l) => s && l.x > s[0] - 3 && l.x < s[2] + 3 && l.z > s[1] - 3 && l.z < s[3] + 3);
            return { out: Power.forShop(shop), cam: CrimeExposure._powerCut(shop), lamps: lamps.length, dark: lamps.filter((l) => l.dark).length, shops: (W.shopList || []).filter((q) => q.dark).length,
                msg: Interiors.check(game, shop).msg, prompt: (__at(shop.x, shop.z), Interiors.prompt(game)), mesh: !!(Power._m && Power._m.isEnabled()) };
        });
        c.ok(P.out && P.cam && /sem energia/.test(P.msg), `sabotada: o quarteirão sem energia, a câmera da fachada desligada ("${P.msg}")`);
        c.ok(P.dark === P.lamps && P.shops > 0, `postes do quarteirão apagados (${P.dark}/${P.lamps}) e vitrines sem luz (${P.shops})`);
        c.ok(/sem alarme e sem câmera/.test(P.prompt) && P.mesh, 'na porta: "sem energia: sem alarme e sem câmera"; a caixa aparece na fachada');

        // ------------------------------------------------------------------ arrombar e entrar (sem energia, de luvas)
        const cash0 = await page.evaluate(() => { Items.add(game.inventory, 'furadeira'); window.__hemiOut = game.scene.getLightByName('hemi').intensity; Interiors.interact(game); const lp = game.lockpick.active; if (lp) game.lockpick._finish('ok'); window.__lp = lp; return game.inventory.cash; });
        await until(() => Interiors.active && !Interiors.busy, 10);
        await step(0.3);
        const In = await page.evaluate(() => {
            const s = StoreBurglary.session, a = Interiors.active;
            return { lp: __lp, burgle: !!(a && a.burgle), session: !!s, power: s && s.power, alarm: s && s.alarm, people: Interiors._actors.filter((x) => x.mesh.isEnabled() && x.mesh.isVisible).length + (ShopLife.active ? ShopLife.agents.length : 0),
                lamp: !!(StoreBurglary._lamp && StoreBurglary._lamp.isEnabled()), hemi: game.scene.getLightByName('hemi').intensity, hemiOut: __hemiOut, roomLights: ((a && a.room.i3d && a.room.i3d.lights) || []).filter((l) => l.isEnabled()).length,
                uses: StoreBurglary._uses().map((u) => u.kind), prompt: Interiors.prompt(game), exp: CrimeExposure.evaluate(game) };
        });
        c.ok(In.lp && In.burgle && In.session && In.power === false && !In.alarm, `E na porta: fechadura (mini-game) e dentro, arrombada, sem energia e sem alarme`);
        c.ok(In.people === 0, `loja vazia: sem atendente, sem cliente, sem refém (${In.people})`);
        c.ok(In.lamp && In.roomLights === 0 && In.hemi < In.hemiOut * 0.3, `no escuro: luzes da loja apagadas, só a lanterna (luz do mundo ${In.hemi.toFixed(3)} × ${In.hemiOut.toFixed(3)} lá fora)`);
        c.ok(In.uses.includes('safe') && In.uses.includes('register') && In.exp === 0, `pontos de saque: ${In.uses.join(', ')}; ninguém vendo lá dentro`);
        const got = await loot(['register', 'safe', 'stock', 'dvr']);
        const L = await page.evaluate((cash0) => { const s = StoreBurglary.session; return { cash: game.inventory.cash - cash0, loot: s.loot, prints: s.prints, noise: s.noise, heard: s.heard }; }, cash0);
        c.ok(got.includes('register') && got.includes('safe') && L.cash > 300, `saque: ${got.join(', ')} → +R$ ${L.cash} em dinheiro, ${L.loot.goods ? 'R$ ' + L.loot.goods + ' em mercadoria' : 'sem mercadoria'}`);
        c.ok(L.prints === 0 && !L.heard, `de luvas: nenhuma digital (${L.prints}); ninguém ouviu (barulho ${L.noise.toFixed(0)})`);
        await page.evaluate(() => Interiors.leave(game));
        await until(() => !Interiors.active && !Interiors.busy, 10);
        await step(0.2);
        const C1 = await page.evaluate(() => { const C = StoreBurglary.cases[0]; return C ? { prints: C.prints, cam: C.cam, found: C.found, at: C.at, now: Traces.now(), wanted: game.wanted.level, rec: game.heat.record.crimes.length, closed: Robbery.robbedDay[__A.id] } : null; });
        c.ok(C1 && !C1.prints && !C1.cam && !C1.found && C1.at > C1.now && C1.wanted === 0, `saiu sem ninguém ver: caso aberto para quando a loja abrir (às ${C1 && Math.floor(C1.at % 24)}h), sem digitais nem vídeo`);
        // a loja abre, descobrem; 2 h depois, a perícia
        const S1 = await page.evaluate(() => {
            const C = StoreBurglary.cases[0], rec0 = game.heat.record.crimes.length, clean0 = StoreBurglary.stats.clean;
            game.dayNight.hour = C.at % 24 + 0.1; StoreBurglary._ct = 0; StoreBurglary.tick(0.1, game);
            const found = C.found;
            game.dayNight.hour += 2.1; StoreBurglary._ct = 0; StoreBurglary.tick(0.1, game);
            return { found, left: StoreBurglary.cases.length, clean: StoreBurglary.stats.clean - clean0, rec: game.heat.record.crimes.length - rec0, again: StoreBurglary.why(game, __A) };
        });
        c.ok(S1.found && S1.left === 0 && S1.clean === 1 && S1.rec === 0, `a loja abriu, descobriram; a perícia não achou pistas: CASO ARQUIVADO (ficha +${S1.rec})`);
        c.ok(/cadeado|perícia/.test(S1.again || ''), `não dá para arrombar a mesma loja de novo logo em seguida (${S1.again})`);

        // ------------------------------------------------------------------ com energia e sem luvas: alarme, câmeras e digitais
        await page.evaluate(() => { Economy.day = 2; game.dayNight.hour = 3; });
        const B = await page.evaluate(() => {
            const shop = __shop(['bakery', 'clothes', 'pizza', 'fit', 'burger', 'bar', 'italian', 'japanese', 'pharmacy'], Power.blockOf(__A));
            if (!shop) return null;
            window.__B = shop;
            Outfit.wear('luvas');                                                          // (tira as luvas)
            __at(shop.x, shop.z);
            Interiors.interact(game); const lp = game.lockpick.active; if (lp) game.lockpick._finish('ok');
            return { name: shop.name, gloves: StoreBurglary.gloves(), out: Power.forShop(shop), lp };
        });
        if (!B) { c.ok(false, 'nenhuma segunda loja'); await close(); return; }
        await until(() => Interiors.active && !Interiors.busy, 10);
        const B1 = await page.evaluate(() => { const s = StoreBurglary.session; return s && { power: s.power, alarmT: s.alarm && s.alarm.t, cams: s.cams, prompt: Interiors.prompt(game), hud: (document.getElementById('burgHud') || {}).textContent || '' }; });
        c.ok(B1 && !B.gloves && !B.out && B1.power && B1.alarmT > 5 && /ALARME EM/.test(B1.hud), `${B.name} com energia, sem luvas: alarme armado (${B1 && B1.alarmT.toFixed(1)} s até disparar), câmeras ${B1 && B1.cams ? 'gravando' : 'sem gravador'}`);
        await step(12);
        const B2 = await page.evaluate(() => { const s = StoreBurglary.session; return { rang: s.alarm.rang, police: s.police && s.police.t }; });
        c.ok(B2.rang && B2.police > 0, `não desligou a central: o sensor disparou, polícia em ${B2.police && B2.police.toFixed(0)} s`);
        await loot(['register']);
        await page.evaluate(() => Interiors.leave(game));
        await until(() => !Interiors.active && !Interiors.busy, 10);
        await step(0.2);
        const C2 = await page.evaluate(() => { const C = StoreBurglary.cases.find((q) => q.id === __B.id); return { prints: C && C.prints, cam: C && C.cam, found: C && C.at <= Traces.now() + 0.01, search: !!Traces.search, wanted: game.wanted.level }; });
        c.ok(C2.prints && C2.found && C2.search, `pistas: digitais${C2.cam ? ' e vídeo' : ''}; o alarme já entregou (descoberto na hora, viaturas vasculhando o bairro)`);
        const S2 = await page.evaluate(() => {
            const C = StoreBurglary.cases.find((q) => q.id === __B.id), rec0 = game.heat.record.crimes.length;
            StoreBurglary._ct = 0; StoreBurglary.tick(0.1, game);
            game.dayNight.hour = (C.lab % 24) + 0.05; StoreBurglary._ct = 0; StoreBurglary.tick(0.1, game);
            return { rec: game.heat.record.crimes.length - rec0, types: game.heat.record.crimes.map((q) => q.type), state: game.heat.state, left: StoreBurglary.cases.filter((q) => q.id === __B.id).length };
        });
        c.ok(S2.left === 0 && S2.rec >= 1 && S2.types.includes('burglary') && S2.state === 'INVESTIGATION', `a perícia achou as digitais: arrombamento na ficha (+${S2.rec}), inquérito (${S2.state})`);

        // ------------------------------------------------------------------ loja de armas: armas sem registro; barulho: alguém ouve
        await page.evaluate(() => { Economy.day = 5; game.dayNight.hour = 3; game.heat.record.crimes.length = 0; Outfit.wear('luvas'); });
        const G = await page.evaluate(() => {
            const shop = __shop(['guns'], null); if (!shop) return null;
            window.__G = shop; Power.cutBlock(Power.blockOf(shop), 'teste');
            const n = game.npcManager.npcs.find((q) => q.alive); if (n) { n.position.x = shop.x + 6; n.position.z = shop.z; }
            __at(shop.x, shop.z);
            StoreBurglary._opened(game, shop, false);
            return { name: shop.name };
        });
        if (G) {
            await until(() => Interiors.active && !Interiors.busy, 10);
            const owned0 = await page.evaluate(() => Object.keys(game.inventory.weapons).filter((k) => game.inventory.weapons[k].owned).length);
            const got3 = [];
            for (let k = 0; k < 3; k++) got3.push(...await loot(['stock']));
            const G1 = await page.evaluate((o0) => { const s = StoreBurglary.session; const pend0 = Traces.pend.length; s.noise = 90; StoreBurglary.update(0.05, game); return { guns: s.loot.guns, owned: Object.keys(game.inventory.weapons).filter((k) => game.inventory.weapons[k].owned).length - o0, heard: s.heard, pend: Traces.pend.length - pend0 }; }, owned0);
            c.ok(G1.guns.length >= 1, `loja de armas (${G.name}): prateleiras dão armas — ${G1.guns.join(', ')} (${G1.owned} novas)`);
            c.ok(G1.heard && G1.pend === 1, 'barulho alto dentro da loja: alguém na rua ouviu e vai ligar (190 a caminho)');
            await page.evaluate(() => Interiors.leave(game));
            await until(() => !Interiors.active && !Interiors.busy, 10);
        } else c.ok(false, 'nenhuma loja de armas');

        // ------------------------------------------------------------------ poste derrubado: o quarteirão apaga
        const pole = await page.evaluate(() => {
            const W = game.gameEngine.world, L = W.street.lamps;
            for (let i = 0; i < L.length; i++) {
                const l = L[i]; if (!l.alive) continue;
                const b = CityGrid._blockAtPoint(l.x + 4, l.z) || CityGrid._blockAtPoint(l.x - 4, l.z) || CityGrid._blockAtPoint(l.x, l.z + 4) || CityGrid._blockAtPoint(l.x, l.z - 4);
                if (!b || Power.isOutBlock(b.id) || !(b.lots || []).some((q) => (q.shops || []).length)) continue;
                const n0 = Power.stats.poles;
                W.street.breakLamp(i, 1, 0);
                return { block: Power.isOutBlock(b.id), poles: Power.stats.poles - n0 };
            }
            return null;
        });
        c.ok(pole && pole.block && pole.poles === 1, 'derrubar um poste apaga o quarteirão de comércio em volta');

        // ------------------------------------------------------------------ a luz volta; salvar e carregar
        const R = await page.evaluate(() => {
            const sv = StoreBurglary.serialize(), n = Object.keys(sv.power.out).length;
            StoreBurglary.load(JSON.parse(JSON.stringify(sv)));
            const back = Object.keys(Power.out).length;
            game.dayNight.hour += 12; Power._t = 0; Power.update(0.1, game);
            const W = game.gameEngine.world;
            return { n, back, left: Object.keys(Power.out).length, dark: (W.streetLamps || []).filter((l) => l.dark).length, open: Interiors.check(game, __A).ok || Interiors.check(game, __A).msg };
        });
        c.ok(R.n >= 2 && R.back === R.n && R.left === 0 && R.dark === 0, `salvo e carregado (${R.back}/${R.n} quarteirões sem luz); horas depois a companhia religa tudo (postes apagados: ${R.dark})`);
        c.noErrors(errors, 'roubo_furtivo');
        await close();
    },
};
