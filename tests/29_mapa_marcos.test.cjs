// O mapa reestruturado (como a referência) com os nomes do jogo: a LAGOA a oeste do Centro, o MARACANÃ, o CRISTO no Corcovado, o PÃO DE
// AÇÚCAR com o bondinho na ponta da praia do sul (calçadão, quiosques), píeres com barcos no canal, pontes estaiadas, a Rodovia da
// Lagoa e a Via Expressa (laranja no mapa). E o mapa/GPS pintados em HD (MapPaint): mar com degradê, relevo, ladrilhos por zoom.
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'mapa_marcos',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        const s = await page.evaluate(() => {
            const L = Landmarks, B = WorldMap.B, P = WorldMap.PAO, S = L.stadium, roads = (re) => RoadPlan.edges.filter((e) => re.test(e.name || ''));
            const poiTypes = [...new Set(CityGrid.pois.map((p) => p.type))];
            const pier = L.piers[0];
            return {
                stadium: !!S, cristo: !!L.cristo, strips: L.beach ? L.beach.strips.length : 0, kiosks: L.kiosks.length, piers: L.piers.length, boats: L.boats.length, pylons: L.pylons.length,
                pois: ['estadio', 'cristo', 'bondinho'].filter((t) => poiTypes.includes(t)).length,
                missing: poiTypes.filter((t) => !PauseMenu.POI_TYPES[t]),
                lagoa: WorldMap.isLand(-404, -590) ? 'terra' : 'água',
                pao: WorldMap.isLand(P.x, P.z) && WorldMap.biomeAt(P.x, P.z) === B.ROCK && WorldMap.heightAt(P.x, P.z) > 25,
                corcovado: (() => { let h = 0; for (let x = -1080; x <= -870; x += 10) for (let z = 630; z <= 840; z += 10) h = Math.max(h, WorldMap.heightAt(x, z)); return h > 40; })(),
                beach: WorldMap.biomeAt(100, -960) === B.SAND,
                paoSolid: CityGrid.obstaclesAround(P.x, P.z, 10).some((o) => o.x0 < P.x && o.x1 > P.x && o.z0 < P.z && o.z1 > P.z),
                onPier: !!pier && MapGeo.onDock((pier.x0 + pier.x1) / 2, (pier.z0 + pier.z1) / 2),
                hwyLagoa: roads(/Rodovia da Lagoa/).length, express: RoadPlan.edges.filter((e) => e.express).length,
                estadio: roads(/Av\. do Estádio/).length, trilha: roads(/Estrada do Corcovado/).length,
                speedway: !!Speedway.site,
                labels: WorldMap.regions.map((r) => r.name).filter((n) => /MARACANÃ|LAGOA|PÃO DE AÇÚCAR|CORCOVADO|CENTRO|FAVELA DO MORRO|ILHA PRAIANA/.test(n)).length,
                meshes: ['stadiumPitch', 'paoDeAcucar', 'calcadao', 'bondinho0'].filter((n) => game.scene.getMeshByName(n)).length,
            };
        });
        c.ok(s.stadium && s.cristo, 'Maracanã e Cristo Redentor no lugar');
        c.ok(s.strips >= 2 && s.kiosks >= 3, `calçadão na praia do sul (${s.strips} trechos, ${s.kiosks} quiosques)`);
        c.ok(s.piers >= 3 && s.boats >= 6 && s.pylons === 4, `píeres (${s.piers}) com barcos (${s.boats}) e 2 pontes estaiadas (${s.pylons} pilones)`);
        c.eq(s.pois, 3, 'pontos no mapa: estádio, Cristo, bondinho');
        c.eq(s.missing.join(','), '', 'todo tipo de ponto do mapa tem ícone (a vila da roça não derruba mais o mapa da pausa)');
        c.eq(s.lagoa, 'água', 'a Lagoa a oeste do Centro');
        c.ok(s.pao && s.paoSolid, 'Pão de Açúcar: penedo de pedra, alto e sólido');
        c.ok(s.corcovado && s.beach, 'Corcovado alto e a areia da praia do sul');
        c.ok(s.onPier, 'anda-se no píer como em terra');
        c.ok(s.hwyLagoa > 2 && s.express > 5, `Rodovia da Lagoa (${s.hwyLagoa} trechos) e Via Expressa (${s.express})`);
        c.ok(s.estadio >= 1 && s.trilha >= 1, 'acesso ao estádio e Estrada do Corcovado (em laço: sem beco)');
        c.ok(s.speedway, 'o autódromo achou lugar');
        c.eq(s.labels, 7, 'nomes dos lugares no mapa (antigos e novos)');
        c.eq(s.meshes, 4, 'malhas dos marcos (gramado, penedo, calçadão, bondinho)');

        // o bondinho anda
        const bonde = await page.evaluate(() => { const m = Landmarks._cabins[0].mesh, a = m.position.clone(); Landmarks.update(5); return BABYLON.Vector3.Distance(a, m.position); });
        c.ok(bonde > 0.3, `o bondinho sobe e desce (${bonde.toFixed(2)} u em 5 s)`);

        // ligados ao jogo: barcos de verdade nos píeres e na Lagoa, os quiosques vendem, o passeio de bondinho (pago), o calçadão cheio
        const live = await page.evaluate(() => {
            const g = game, L = Landmarks, pl = g.player, out = {};
            out.pierBoats = g.boats.stats.pier; out.lagoaBoats = g.boats.stats.lagoa;
            out.boatAtPier = L.boats.every((b) => g.vehicleManager.boats.some((q) => Math.hypot(q.position.x - b.x, q.position.z - b.z) < 2));
            out.lagoaWater = g.vehicleManager.boats.filter((q) => Math.hypot((q.position.x + 404) / 92, (q.position.z + 590) / 190) < 1.3 && !WorldMap.isLand(q.position.x, q.position.z)).length;
            const kiosks = Stands.list.filter((s) => s.id.startsWith('kiosk'));
            out.kioskStands = kiosks.length === L.kiosks.length;
            g.dayNight.hour = 12; g.dayNight.apply();
            const k = kiosks[0]; pl.teleport(new BABYLON.Vector3(k.x, 0, k.z - 2.6));
            out.kioskPrompt = /Quiosque/.test(Stands.prompt(g));
            g.inventory.cash = 100; pl.hp = Math.max(1, pl.maxHp - 30); const hp0 = pl.hp;
            Stands.interact(g); out.bought = Stands.buy(g, 'coco'); out.paid = 100 - g.inventory.cash; out.healed = pl.hp > hp0;
            if (Stands._p && Stands._p.open && Stands._p.close) Stands._p.close();
            out.crowd = g.npcManager._density(k.x, k.z + 3);
            // o bondinho: E na estação da praia, paga, sobe até o alto e volta à estação
            const B = L.BONDE; pl.teleport(new BABYLON.Vector3(B.a[0] - 4, 0, B.a[1] + 5));
            out.bondePrompt = /Bondinho/.test(L.prompt(g));
            g.inventory.cash = 100; L.interact(g); out.bondePaid = 100 - g.inventory.cash; out.riding = !!L.ride && pl.frozen;
            let top = 0, n = 0; while (L.ride && n < 400) { L.update(0.25); top = Math.max(top, pl.deckH || 0); n++; }
            out.bondeTop = top; out.bondeBack = !L.ride && !pl.frozen && !pl.walk && !pl.onDeck && Math.hypot(pl.position.x - B.a[0], pl.position.z - B.a[1]) < 9;
            out.talk = Array.from({ length: 60 }, () => News.smallTalk()).some((t) => /Maracanã|Corcovado|bondinho/.test(t));
            return out;
        });
        c.ok(live.pierBoats === s.boats && live.boatAtPier, `barcos de verdade atracados nos píeres (${live.pierBoats}): roubáveis, navegáveis`);
        c.ok(live.lagoaBoats >= 2 && live.lagoaWater >= 2, `barcos na Lagoa (${live.lagoaBoats})`);
        c.ok(live.kioskStands && live.kioskPrompt && live.bought && live.paid === 7 && live.healed, `os quiosques do calçadão vendem (água de coco: R$ ${live.paid}, cura)`);
        c.eq(live.crowd, 1, 'o calçadão é movimentado (pedestres)');
        c.ok(live.bondePrompt && live.bondePaid === 30 && live.riding, `passeio de bondinho: E na estação, R$ ${live.bondePaid}`);
        c.ok(live.bondeTop > 25 && live.bondeBack, `a cabine sobe até o alto (${live.bondeTop.toFixed(1)} u) e volta à estação da praia`);
        c.ok(live.talk, 'os marcos entram na conversa da rua (News)');

        // mapa pintado: cores do mar (fundo e raso), da mata, a rodovia laranja; ladrilhos HD; o mapa da pausa no mundo inteiro
        const m = await page.evaluate(() => {
            const px = (cx, cz, k) => {
                const cv = document.createElement('canvas'); cv.width = cv.height = 64;
                const g = cv.getContext('2d');
                MapRenderer.drawView(g, 64, 64, cx, cz, k, { budget: 1e4 });
                return Array.from(g.getImageData(32, 32, 1, 1).data.slice(0, 3));
            };
            const t0 = performance.now(); MapPaint._tile(4, 2, 2); const tileMs = performance.now() - t0;
            const hw = RoadPlan.edges.find((e) => e.cls === 'hwy' && e.free && e.len > 80), hc = RoadPlan.at(hw, hw.len / 2), hp = { x: hc.x - hc.tz * 3, z: hc.z + hc.tx * 3 };      // (fora da faixa do meio)
            let fx = null;
            for (let z = 600; z < 900 && !fx; z += 9) for (let x = -1100; x < -500; x += 9) if (WorldMap.biomeAt(x, z) === WorldMap.B.FOREST && WorldMap.biomeAt(x + 12, z) === WorldMap.B.FOREST && !RoadPlan.onPavement(x, z, 6)) { fx = [x, z]; break; }
            const deep = px(Config.world.maxX - 60, Config.world.minZ + 60, 2);
            let shallow = null;
            for (let x = 200; x < 460 && !shallow; x += 2) if (!WorldMap.isLand(x, 300) && MapGeo.waterDepth(x, 300) > 1 && MapGeo.waterDepth(x, 300) < 3) shallow = px(x, 300, 4);
            const W = Config.world, pm = game.menu, keep = Object.assign({}, pm.map);
            let pause = 'ok';
            try { pm.map.scale = 0.3; pm.map.cx = (W.minX + W.maxX) / 2; pm.map.cz = (W.minZ + W.maxZ) / 2; pm._drawMap(); } catch (e) { pause = e.message; } finally { Object.assign(pm.map, keep); }
            game.minimap._baseKey = null;
            game.minimap.update(game.player.position, 0);
            const mb = game.minimap.baseCtx.getImageData(0, 0, game.minimap.base.width, game.minimap.base.height).data;
            let lit = 0; for (let i = 0; i < mb.length; i += 400) if (mb[i] + mb[i + 1] + mb[i + 2] > 60) lit++;
            return { deep, shallow, forest: fx && px(fx[0], fx[1], 4), hwy: px(hp.x, hp.z, 6), tileMs, world: [MapPaint.world().width, MapPaint.world().height], pause, mini: lit / (mb.length / 400), stats: MapPaint.stats };
        });
        c.ok(m.deep[2] > m.deep[0] + 40 && m.deep[2] > m.deep[1], `mar fundo azul-marinho (${m.deep})`);
        c.ok(!!m.shallow && m.shallow[1] > m.shallow[0] + 50 && m.shallow[1] > m.deep[1] + 30, `raso turquesa perto da costa (${m.shallow})`);
        c.ok(!!m.forest && m.forest[1] > m.forest[0] && m.forest[1] > m.forest[2], `mata verde com copas (${m.forest})`);
        c.ok(m.hwy[0] > 190 && m.hwy[1] > 110 && m.hwy[1] < 200 && m.hwy[2] < 110, `rodovia laranja no mapa (${m.hwy})`);
        c.ok(m.world[0] > 400 && m.tileMs < 1500, `terreno pintado: rascunho ${m.world.join('×')} px, ladrilho HD em ${m.tileMs.toFixed(0)} ms`);
        c.eq(m.pause, 'ok', 'mapa da pausa com o mundo inteiro (todos os ícones)');
        c.ok(m.mini > 0.9, `GPS desenhado (${(m.mini * 100).toFixed(0)}% da camada com cor)`);
        c.note(`MapPaint: ${JSON.stringify(m.stats)}`);
        c.noErrors(errors, 'mapa e marcos');
        await close();
    },
};
