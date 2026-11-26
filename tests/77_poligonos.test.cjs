// O resto do 2,5D em POLÍGONOS: as aves da cidade em 3D (art/Animals3D.js, espécie 'ave' — asa dobrada no corpo pousada, aberta
// e batendo no voo), o helicóptero com o disco borrado e a sombra em polígonos (HeliArt.blurMesh / shadowMesh — o corpo já era o
// modelo 3D) e o atlas dos props (PropSprites, ~23 MB no HD) que só é montado se algum tipo sem modelo 3D pedir o desenho — com as
// árvores 3D, nenhum (a mancha do chão também tem modelo: Trees3D 'stain'). Confere que nenhuma dessas texturas existe. E as
// plantas com o nível de detalhe pela distância (Trees3D LOD): a gêmea leve de longe, a rasteira some longe.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'poligonos',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx, { query: 'gfx=high' });
        page.setDefaultTimeout(0);
        await page.evaluate(() => { Tutorial.skip(); game.player.invulnerable = true; Config.time.cycleSeconds = 1e12; game.dayNight.hour = 11; game.dayNight.apply(); game.weather.set('clear', true, true); game.weather.override = 1e9; });
        await gameWait(page, 2, 200000);

        // AVES: as 4 espécies postas em volta do jogador — no chão (dobradas), bicando e voando (asa aberta e batendo)
        const birds = await page.evaluate(() => {
            const B = game.birds, P = game.player.position;
            B._threat = () => null; B._spawn = () => false;
            for (const b of B.birds.slice()) B._remove(b);
            const mk = (sp, dx, dz, st, o = {}) => { const b = Object.assign({ sp, x: P.x + dx, z: P.z + dz, y: 0.3, h: 0.5, state: st, t: 99, peck: 0, step: 0, walk: false, fl: 0, perch: null, target: null, fly: 99, cruise: 9, v: 0, stay: 99, glideT: 0, ph: 1 }, o); B.birds.push(b); return b; };
            for (let s = 0; s < 4; s++) { mk(s, 3 + s, 3, 'ground', { peck: 99 }); mk(s, 3 + s, 6, 'fly', { y: 4 }); }
            B._step = (b, dt) => { if (b.state === 'fly') b.fl += dt; };
            return { mode3d: B.mode3d, n: B.birds.length };
        });
        await gameWait(page, 1.5, 120000);
        const bs = await page.evaluate(() => {
            const E = [...Animals3D._meshes.entries()].filter(([k]) => k.startsWith('ave|')).map(([, e]) => e);
            const L = game.birds._list || [], gnd = L.filter((a) => a.y === 0), air = L.filter((a) => a.y > 1);
            const flap1 = air.map((a) => a.flap);
            return {
                meshes: E.length, inst: E.reduce((s, e) => s + e.n, 0), tris: E.length ? E[0].mesh.getTotalIndices() / 3 : 0,
                ready: E.every((e) => e.mesh.material.isReady(e.mesh)), shadow: E.every((e) => !game.gameEngine.world.shadow || (game.gameEngine.world.shadow.getShadowMap().renderList || []).includes(e.mesh)),
                folded: gnd.every((a) => a.rs < 0.05), peck: gnd.every((a) => a.gz === 1), open: air.every((a) => a.rs > 0.9), flap1,
                tex: game.scene.textures.filter((t) => /bird/i.test(t.name)).map((t) => t.name),
            };
        });
        await gameWait(page, 0.3, 60000);
        const flap2 = await page.evaluate(() => (game.birds._list || []).filter((a) => a.y > 1).map((a) => a.flap));
        c.ok(birds.mode3d && bs.meshes === 4 && bs.inst === 8 && bs.ready, `aves em 3D: ${bs.meshes} espécies, ${bs.inst} aves, ${bs.tris} triângulos cada`);
        c.ok(bs.folded && bs.peck && bs.open, `pousadas com a asa dobrada e bicando, voando com a asa aberta (${JSON.stringify({ folded: bs.folded, peck: bs.peck, open: bs.open })})`);
        c.ok(flap2.some((f, i) => Math.abs(f - bs.flap1[i]) > 0.01), `a asa bate no voo (${bs.flap1.map((f) => f.toFixed(2)).join(' ')} → ${flap2.map((f) => f.toFixed(2)).join(' ')})`);
        c.ok(bs.shadow, 'as aves projetam a sombra de verdade (mapa de sombra)');
        c.ok(bs.tex.length === 0, `sem textura de aves (${bs.tex.join(', ') || 'nenhuma'})`);

        // HELICÓPTERO: corpo 3D, disco borrado e sombra em polígonos (sem textura nenhuma de helicóptero)
        const h = await page.evaluate(() => {
            const pm = game.policeManager, P = game.player.position;
            if (pm.heli) pm.removeHeli();
            const heli = pm.heli = new Helicopter(pm.scene, null, pm, P.x + 6, P.z + 6), V = heli.visual;
            for (let i = 0; i < 10; i++) heli.update(0.1);
            return { solid: !!V.solid, blurV: V.blur.getTotalVertices(), blurTex: !!(V.blur.material && V.blur.material.diffuseTexture), shV: V.shadow.getTotalVertices(), shTex: !!(V.shadow.material && V.shadow.material.diffuseTexture),
                alpha: V.blur.hasVertexAlpha && V.shadow.hasVertexAlpha, tex: game.scene.textures.filter((t) => /heli/i.test(t.name)).map((t) => t.name) };
        });
        c.ok(h.solid && h.blurV > 100 && h.shV > 100 && !h.blurTex && !h.shTex && h.alpha, `helicóptero: corpo 3D, disco (${h.blurV} vértices) e sombra (${h.shV}) em polígonos`);
        c.ok(h.tex.length === 0, `sem textura de helicóptero (${h.tex.join(', ') || 'nenhuma'})`);
        await page.evaluate(() => game.policeManager.removeHeli());

        // PROPS: o atlas não foi montado (nenhum quad o usa) e a mancha do chão tem modelo 3D
        const pr = await page.evaluate(() => {
            const P = game.gameEngine.world.props;
            return { lazy: !!P.lazy, built: P.built, tex: game.scene.textures.filter((t) => /^props/i.test(t.name)).map((t) => t.name), stain: Trees3D.wants('stain'),
                all: [...new Set(PropSprites.FRAMES.map((f) => f.kind))].filter((k) => !Trees3D.wants(k)) };
        });
        c.ok(pr.lazy && !pr.built && pr.tex.length === 0, `atlas dos props não montado (${JSON.stringify(pr.tex)})`);
        c.ok(pr.stain && pr.all.length === 0, `todo tipo de prop tem modelo 3D (sem modelo: ${pr.all.join(', ') || 'nenhum'})`);
        // PLANTAS de longe (Trees3D LOD): na mata, as perto no modelo cheio, as longe no modelo leve; a rasteira longe some
        await page.evaluate(() => { const S = Bench.SCENES.find((x) => x.id === 'mata'), p = S.at(); game.player.teleport(new BABYLON.Vector3(p.x, 0, p.z)); game.camera.snapTo(game.player.position); });
        await gameWait(page, 5, 300000);
        const lod = await page.evaluate(() => {
            const L = (Trees3D._lod || []).filter((e) => !e.m.isDisposed()), F = L.filter((e) => e.far);
            const nearOn = F.filter((e) => !e.isFar && e.m.isVisible && !e.far.isVisible).length, farOn = F.filter((e) => e.isFar && !e.m.isVisible && e.far.isVisible).length;
            const both = F.filter((e) => e.m.isVisible && e.far.isVisible).length;
            const lighter = F.every((e) => e.far.getTotalIndices() < e.m.getTotalIndices());
            const C = L.filter((e) => e.cover), cHid = C.filter((e) => !e.m.isVisible).length;
            // o MANTO de copas (bem longe): a copa numa bolha só — nunca duas versões da mesma planta à mostra
            const Mn = F.filter((e) => e.manto), mOn = Mn.filter((e) => e.manto.isVisible).length;
            const two = F.filter((e) => (e.m.isVisible ? 1 : 0) + (e.far.isVisible ? 1 : 0) + (e.manto && e.manto.isVisible ? 1 : 0) > 1).length;
            const mLight = Mn.every((e) => e.manto.getTotalIndices() < e.far.getTotalIndices());
            return { n: L.length, pairs: F.length, nearOn, farOn, both, lighter, cover: C.length, cHid, manto: Mn.length, mOn, two, mLight };
        });
        c.ok(lod.pairs > 0 && lod.nearOn > 0 && lod.farOn > 0 && lod.both === 0 && lod.lighter, `plantas: ${lod.nearOn} perto no modelo cheio, ${lod.farOn} longe no leve (${lod.pairs} pares, nunca as duas)`);
        c.ok(lod.cover > 0 && lod.cHid > 0 && lod.cHid < lod.cover, `rasteira longe some (${lod.cHid} de ${lod.cover} malhas escondidas)`);
        c.ok(lod.manto > 0 && lod.mLight && lod.two === 0, `manto de copas bem longe: ${lod.manto} malhas com o manto, ${lod.mOn} à mostra agora, mais leve que a de longe (${lod.two} com duas versões)`);
        c.noErrors(errors, 'polígonos');
        await close();
    },
};
