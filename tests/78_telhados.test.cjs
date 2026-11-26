// TELHADOS EM POLÍGONOS (render/Roofs3D.js): as 27 texturas hd_roof saem; cada telhado vira painéis instanciados (telha colonial em
// fiadas, zinco ondulado, lona com rugas, chapa com nervuras, laje…) com as peças em cima, e o detalhe cai com a distância POR PAINEL
// (perto: o relevo inteiro; meio: o simples; longe: a placa lisa). Confere: nenhuma textura de telhado, os números (telhados, painéis,
// peças, triângulos, desenhos), as faixas de detalhe pela distância (e que mudam quando a câmera anda) e que o painel de perto é
// desenhado de verdade com a câmera em cima de um telhado depois de andar pelo mapa (antes o RenderCuller o arquivava pela caixa da carga).
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'telhados',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx, { query: 'gfx=high' });
        page.setDefaultTimeout(0);
        await page.evaluate(() => { Tutorial.skip(); game.player.invulnerable = true; Config.time.cycleSeconds = 1e12; game.dayNight.hour = 11; game.dayNight.apply(); });
        await gameWait(page, 2, 200000);
        const a = await page.evaluate(() => ({ on: Roofs3D.on, st: Roofs3D.stats(), tex: game.scene.textures.filter((t) => t.name === 'hd_roof').length, kinds: Roofs3D._built.kinds.map((k) => k.kind) }));
        c.ok(a.on && a.st && a.st.roofs > 1000 && a.st.panels > a.st.roofs && a.st.props > 500, `telhados em polígonos: ${a.st.roofs} telhados, ${a.st.panels} painéis, ${a.st.props} peças (${a.st.ms} ms)`);
        c.ok(a.tex === 0, `nenhuma textura de telhado (hd_roof: ${a.tex})`);
        c.ok(a.st.tris < 260000 && a.st.draws < 40, `custo na favela: ${a.st.tris} triângulos e ${a.st.draws} desenhos de telhado`);
        c.note(`tipos: ${a.kinds.join(', ')}`);

        // as faixas: perto = relevo inteiro, longe = placa; quem está perto da câmera fica na faixa 0 e quem está longe na 2
        const bands = () => page.evaluate(() => {
            const cam = game.scene.activeCamera, P = cam.globalPosition, k = Roofs3D.lodScale, R = Roofs3D.BUCKET * 0.72;
            const out = { nearOk: 0, nearBad: 0, farOk: 0, farBad: 0 };
            for (const K of Roofs3D._built.kinds) {
                if (!K.meshes[0] || !K.meshes[1] || !K.meshes[2]) continue;          // (só os tipos com as três faixas)
                for (const b of K.D.buckets) {
                    const d = Math.max(0, Math.hypot(b.cx - P.x, b.y - P.y, b.cz - P.z) - R);
                    if (d < Roofs3D.LOD.near * k * 0.9) b.band === 0 ? out.nearOk++ : out.nearBad++;
                    else if (d > Roofs3D.LOD.mid * k * 1.15) b.band === 2 ? out.farOk++ : out.farBad++;
                }
            }
            return out;
        });
        const b1 = await bands();
        c.ok(b1.nearOk > 0 && b1.nearBad === 0 && b1.farOk > 0 && b1.farBad === 0, `faixas pela distância: ${b1.nearOk} baldes perto com o relevo inteiro, ${b1.farOk} longe na placa (${b1.nearBad + b1.farBad} errados)`);

        // anda para o centro: as faixas acompanham a câmera
        await page.evaluate(() => { const S = Bench.SCENES.find((s) => s.id === 'centro'), p = S.at(); game.player.teleport(new BABYLON.Vector3(p.x, 0, p.z)); game.camera.snapTo(game.player.position); });
        await gameWait(page, 3, 200000);
        const b2 = await bands();
        c.ok(b2.nearBad === 0 && b2.farBad === 0 && b2.farOk > 0, `depois de andar, as faixas acompanham (${b2.nearOk} perto, ${b2.farOk} longe, ${b2.nearBad + b2.farBad} errados)`);

        // a câmera em cima de um telhado de zinco e de um de lona da favela (depois de ir ao centro): o painel de perto é DESENHADO
        for (const kind of ['zinc', 'tarp', 'tile']) {
            const r = await page.evaluate((kind) => {
                let best = null;
                for (const blk of CityGrid.blocks) for (const l of blk.lots) { if (l.safehouse || Roofs3D.kindOf(l.roof) !== kind || blk.district !== 'favela') continue; best = l; break; }
                if (!best) return null;
                const l = best, A = WorldBuilder.lotAnchor(l), x = (l.x0 + l.x1) / 2, z = (l.z0 + l.z1) / 2, y = l.height + (A ? A.h : 0), sc = game.scene;
                game.player.teleport(new BABYLON.Vector3(x + 6, 0, z + 6));
                let cam = window.__tc; if (!cam) { cam = window.__tc = new BABYLON.FreeCamera('tc', new BABYLON.Vector3(0, 0, 0), sc); cam.minZ = 0.05; }
                cam.position.set(x - 0.4, y + 3, z - 2.4); cam.setTarget(new BABYLON.Vector3(x, y, z + 0.6)); sc.activeCamera = cam;
                return { roof: l.roof };
            }, kind);
            if (!r) { c.note(`sem telhado de ${kind} na favela`); continue; }
            await gameWait(page, 2, 120000);
            const s = await page.evaluate((kind) => {
                const K = Roofs3D._built.kinds.find((k) => k.kind === kind), m = K.meshes[0], act = new Set(game.scene.getActiveMeshes().data);
                return { n: m.thinInstanceCount, vis: m.isVisible, act: act.has(m), ready: m.material.isReady(m, true) };
            }, kind);
            c.ok(s.n > 0 && s.vis && s.act && s.ready, `${kind} (${r.roof}) com a câmera em cima: o painel de perto é desenhado (${JSON.stringify(s)})`);
        }
        await page.evaluate(() => { game.scene.activeCamera = game.camera.camera || game.scene.cameras[0]; });
        c.noErrors(errors, 'telhados');
        await close();
    },
};
