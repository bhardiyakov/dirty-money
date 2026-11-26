// PERSONAGENS LOW POLY (?poly=1 — docs/personagens-3d.md, "Low poly"): o boneco 3D em triângulos de face chapada no lugar dos pontos.
// Confere: o gerador no Node (G.lowBody: corpo da malha simplificada + acessórios geométricos em triângulos, o rosto e a estampa por
// pixel, poucos milhares de triângulos por tipo) e, no jogo, o jogador e os NPCs em triângulos sem nenhum ponto, um modelo por tipo,
// o shader compilando (nenhum erro) e trocando a expressão do rosto sem recompilar.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { boot, gameWait } = require('./lib.cjs');

function gen() {
    const D = path.join(__dirname, '..', 'tools', 'asset_baker', 'generator');
    for (const f of ['NpcGenCore.js', 'NpcGenChar.js', 'NpcGenRender.js', 'NpcGenAnims.js', 'NpcGenTypes.js', 'NpcGenBuild.js', 'malha3d.js', 'malha3d_low.js', 'NpcGenMesh.js']) vm.runInThisContext(fs.readFileSync(path.join(D, f), 'utf8'), { filename: f });
    return vm.runInThisContext('(() => { const G = {}; NpcGenCore(G); NpcGenChar(G); NpcGenRender(G); NpcGenAnims(G); NpcGenTypes(G); NpcGenBuild(G); NpcGenMesh(G); return G; })()');
}

module.exports = {
    name: 'low_poly',
    async run(ctx, c) {
        // ---- os shaders: o Babylon quebra a linha no ";" — um ";" num comentário depois do código vira código e o shader não compila
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'art', 'Char3D.js'), 'utf8'), bad = [];
        for (const m of src.matchAll(/ShadersStore\.(\w+) = `([\s\S]*?)`;/g)) m[2].split('\n').forEach((l, i) => { const k = l.indexOf('//'); if (k > 0 && l.slice(0, k).trim() && l.slice(k).includes(';')) bad.push(m[1] + ':' + (i + 1)); });
        c.ok(!bad.length, `nenhum ";" em comentário depois do código nos shaders do Char3D (${bad.join(', ') || 'ok'})`);
        // em TRIÂNGULOS, jogar um vértice para fora da tela estica a face até a borda (a faixa dourada do raio-X): o low poly corta por pixel
        const polyVS = (src.match(/char3dPolyVertexShader = `([\s\S]*?)`;/) || [])[1] || '';
        c.ok(polyVS && !/gl_Position\s*=\s*vec4\(2\.0/.test(polyVS), 'shader low poly: nenhum vértice jogado para fora da tela (o raio-X corta os pés por pixel)');

        // ---- o gerador (Node)
        const G = gen();
        const info = (t, spec) => {
            const s = spec || G.variantSpec(t, 0), L = G.lowBody(s), A = G.lowBody(s, undefined, false), M = new Set(L.mt);
            let head = 0, chest = 0;
            for (let i = 0; i < L.n; i++) { const id = L.fp[i * 4 + 3]; if (id === 1) head++; else if (id === 2) chest++; }
            return { tris: L.tris, acc: L.tris - A.tris, mats: M, head: head / 3, chest: chest / 3, face: L.face };
        };
        let worst = 0;
        for (const t of Object.keys(G.TYPES)) worst = Math.max(worst, G.lowBody(G.variantSpec(t, 0)).tris);
        c.ok(worst > 1000 && worst < 4000, `todos os ${Object.keys(G.TYPES).length} tipos em low poly: no máximo ${worst} triângulos`);
        const pm = info('pm_policial'), mb = info('civil_motoboy'), bp = info('civil_black_power'), tr = info('civil_trabalhador');
        c.ok(pm.acc >= 400 && pm.mats.has(G.M.vest) && pm.mats.has(G.M.hat), `PM: boné e colete em triângulos (+${pm.acc})`);
        c.ok(mb.acc >= 500 && mb.mats.has(G.M.bag), `motoboy: capacete, bolsa e alça (+${mb.acc})`);
        c.ok(bp.acc > 100 && bp.mats.has(G.M.hair), `cabelo geométrico (black power) em triângulos (+${bp.acc})`);
        c.ok(tr.acc === 0, 'sem acessório: só a malha');
        c.ok(pm.head > 50 && pm.chest > 50, `faces da cabeça (${pm.head}) e do peito (${pm.chest}) levam a posição para o rosto e a estampa por pixel`);
        c.ok(info('trafic_pistola').face.join() === '1,0,0,1,0,1.4,4,1,0,0', `a ficha do rosto e da estampa vai ao shader (traficante: cara fechada, óculos, camisa de time, corrente)`);
        const hurt = info('civil_trabalhador', Object.assign({}, G.variantSpec('civil_trabalhador', 0), { dmg: 3 }));
        c.ok(hurt.mats.has(G.M.flesh), 'machucado (dano 3): sangue nas faces');
        const hat = G.lowBody(G.variantSpec('civil_turista', 0)), bare = G.lowBody(Object.assign({}, G.variantSpec('civil_turista', 0), { head: null }));
        c.ok(hat.tris < bare.tris + 260, `de boné, o cabelo acima dele sai (${hat.tris} com o boné × ${bare.tris} sem)`);
        const fl = G.lowBody(G.variantSpec('civil_turista', 0)), acc = new Set([G.M.accent, G.M.accent2]);
        let chestAcc = 0;
        for (let t = 0; t < fl.tris; t++) if (fl.bones[fl.sk[t * 9]] === 'chest' && acc.has(fl.mt[t * 3])) chestAcc++;
        c.ok(chestAcc === 0, 'estampa floral: nenhuma face de peito pintada inteira (o shader pinta as flores por pixel)');

        // ---- no jogo
        const { page, errors, close } = await boot(ctx, { query: 'gfx=high&poly=1' });
        page.setDefaultTimeout(0);
        await page.evaluate(() => {
            Tutorial.skip(); game.player.invulnerable = true; Config.time.cycleSeconds = 1e12; game.dayNight.hour = 13; game.dayNight.apply();
            game.player.teleport(new BABYLON.Vector3(63, 0, 30)); game.camera.snapTo(game.player.position);
        });
        await gameWait(page, 10, 400000);
        for (let k = 0; k < 10; k++) { const n = await page.evaluate(() => [...Char3D.npcs.values()].filter((C) => C.shown).length); if (n >= 2) break; await gameWait(page, 3, 120000); }
        const st = await page.evaluate(() => {
            const P = game.player.char3d, N = [...Char3D.npcs.values()].filter((C) => C.shown), T = [...Char3D._types.keys()];
            return {
                poly: Char3D.polyOn, player: !!(P && P.shown && P.polyMesh), ptris: P && P.model && P.model.tris, ppts: P && P.model && P.model.n,
                npcs: N.length, npoly: N.filter((C) => C.polyMesh && !C.body).length, lods: T.filter((k) => !/\|[0-3]$/.test(k)).length, types: T.length,
                byLod: [0, 1, 2, 3].map((l) => [...Char3D._types.entries()].filter(([k, M]) => k.endsWith('|' + l) && M.ready).map(([, M]) => M.tris)),
                no2d: Char3D.no2d, managed: Char3D.npcs.size, pages: Object.values(NpcArt.atlases).reduce((n, A) => n + A.pages.filter((P) => P.tex || P.st === 'queued' || P.st === 'loading').length, 0),
                sprites: [...SpriteActor.live].filter((a) => a.npcType && a.mesh.isEnabled() && a.mesh.layerMask && a.clip && a.clip.npc).length,
                tris: N.map((C) => C.model.tris),
            };
        });
        c.ok(st.poly && st.player && st.ptris > 3000 && !st.ppts, `jogador em triângulos, no nível mais detalhado (${st.ptris}), sem pontos`);
        c.ok(st.npcs > 0 && st.npoly === st.npcs, `NPCs 3D em triângulos, sem pontos: ${st.npoly}/${st.npcs} (${st.tris.join(', ')})`);
        c.ok(st.types > 0 && st.lods === 0, `só os 4 níveis do low poly por tipo (L0 a L3): ${st.types} modelos`);
        const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0), lv = st.byLod.map(avg).map(Math.round), got = lv.map((v, i) => [i, v]).filter(([, v]) => v > 0);
        c.ok(got.length >= 2 && got.every(([, v], i) => i === 0 || v < got[i - 1][1]), `níveis em uso, cada um mais leve que o anterior: ${got.map(([i, v]) => 'L' + i + ' ' + v).join(', ')}`);
        // SEM 2,5D: nenhuma página pedida nem desenho na tela; todo NPC é 3D, e só os dentro da câmera são desenhados
        c.ok(st.no2d && st.pages === 0 && st.sprites === 0, `sem 2,5D: ${st.pages} páginas pedidas, ${st.sprites} desenhos de personagem na tela`);
        c.ok(st.managed >= st.npcs, `todos os NPCs em 3D (${st.managed}), desenhados só os ${st.npcs} dentro da câmera`);
        // NÍVEL PELO TAMANHO NA TELA: o mesmo NPC bem perto da câmera sobe para o L0; longe, desce para o L3
        const lodAt = async (dist) => {
            await page.evaluate((dist) => {
                const sc = game.scene, pl = game.player.position;
                let npc = window.__lodNpc;
                if (!npc) {
                    npc = window.__lodNpc = game.npcManager.npcs.find((n) => n.alive && !n.vehicle && Char3D.npcs.has(n.actor));
                    if (npc) { npc.update = () => {}; sc.onBeforeRenderObservable.add(() => { const P = window.__lodP; if (P) { npc.transform.position.x = P.x; npc.transform.position.z = P.z; npc.actor.setPosition(P.x, P.z); } }); }
                    window.__lodP = { x: pl.x + 2, z: pl.z + 2 };
                }
                // uma câmera de teste a `dist` m do NPC, olhando para ele (o nível sai do tamanho dele NA TELA desta câmera)
                let cam = window.__lodCam;
                if (!cam) { cam = window.__lodCam = new BABYLON.FreeCamera('lodcam', new BABYLON.Vector3(0, 0, 0), sc); cam.minZ = 0.1; cam.maxZ = 2000; cam.fov = 0.8; }
                const P = window.__lodP, y = npc ? npc.actor.mesh.getAbsolutePosition().y : 0;
                cam.position.set(P.x - dist * 0.7, y + 1.6 + dist * 0.15, P.z - dist * 0.7); cam.setTarget(new BABYLON.Vector3(P.x, y + 0.9, P.z));
                sc.activeCamera = cam; Char3D._pick = 0;
            }, dist);
            let r = null;
            for (let k = 0; k < 8; k++) { await gameWait(page, 1, 120000); r = await page.evaluate(() => { const n = window.__lodNpc, C = n && Char3D.npcs.get(n.actor); return C && C.model ? { lod: C.model._lod | 0, ready: C.model.ready, tris: C.model.tris, shown: C.shown } : null; }); }
            return r;
        };
        const near = await lodAt(4), far = await lodAt(120);
        await page.evaluate(() => { game.scene.activeCamera = game.camera.camera || game.scene.cameras[0]; });
        c.ok(near && far && near.lod === 0 && far.lod === 3 && near.tris > far.tris && near.shown && far.shown, `perto da câmera o detalhe sobe, longe desce (a 4 m: L${near && near.lod} ${near && near.tris} triângulos, a 120 m: L${far && far.lod} ${far && far.tris})`);
        // expressão do rosto: muda pelo uniform, sem recompilar o shader
        const ex = await page.evaluate(async () => {
            const P = game.player.char3d, e0 = P.polyMat.getEffect();
            P.model.clip('shoot:pistol'); game.player.weapon = 'pistol';
            await new Promise((r) => setTimeout(r, 4000));
            const K = P.model.clips.get('shoot:pistol');
            game.player.weapon = 'none';
            return { expr: !!(K && K.ex && Array.from(K.ex).some((e) => e > 0)), same: P.polyMat.getEffect() === e0, ready: !!(e0 && e0.isReady()) };
        });
        c.ok(ex.expr && ex.same && ex.ready, `expressão do clipe no shader low poly, sem recompilar (${JSON.stringify(ex)})`);
        // FLUIDEZ: os clipes 3D chegam com ~30 quadros por segundo (o atlas 2,5D tem 8 a 12) e a troca de clipe passa por uma pose
        // intermediária (transição de 0,2 s) em vez de pular — com 50 ms de quadro, a pose nova entra só um pouco
        for (let k = 0; k < 6; k++) { const ok = await page.evaluate(() => ['idle:none', 'walk:none', 'run:none'].every((key) => typeof game.player.char3d.model.clips.get(key) === 'object')); if (ok) break; await gameWait(page, 2, 120000); }
        const flu = await page.evaluate(() => {
            const P = game.player.char3d, M = P.model, a = P.actor, E = P.scene.getEngine(), dt0 = E.getDeltaTime;
            const K0 = M.clips.get('idle:none'), K1 = M.clips.get('run:none'), W = M.clips.get('walk:none');
            if (!(K0 && K1 && W && typeof K1 === 'object')) return { missing: true };
            const snap = () => Array.from(P._B), dist = (x, y) => Math.sqrt(x.reduce((s, v, i) => s + (v - y[i]) ** 2, 0));
            E.getDeltaTime = () => 50;
            try {
                P._fadeT = -1; P._u = 0; P._pose(K1, a, false); const B = snap();
                P._fadeT = -1; P._u = 0; P._pose(K0, a, false); const A = snap();
                P._fadeStart(); P._u = 0; P._pose(K1, a, false); const Mid = snap();
                return { walkN: W.n, walkFps: W.fps, runN: K1.n, ab: +dist(A, B).toFixed(2), am: +dist(A, Mid).toFixed(2), mb: +dist(Mid, B).toFixed(2) };
            } finally { E.getDeltaTime = dt0; P._fadeT = -1; }
        });
        c.ok(!flu.missing && flu.walkN >= 20 && flu.walkFps >= 25, `clipes 3D a ~30 quadros por segundo (andar: ${flu.walkN} quadros a ${flu.walkFps}/s, correr: ${flu.runN})`);
        c.ok(flu.am > 0.01 && flu.am < flu.ab && flu.mb < flu.ab, `troca parado → correndo passa por pose intermediária (${JSON.stringify(flu)})`);
        // MODO SIMPLES (erro repetido no quadro / modo seguro): o 3D não desliga — todos no L3, no shader SAFE, e continuam à mostra
        await page.evaluate(() => Char3D.degrade('teste'));
        await gameWait(page, 3, 120000);
        const sf = await page.evaluate(() => {
            const C = [...Char3D.npcs.values()].filter((x) => x.shown), P = game.player.char3d, mats = C.map((x) => x.polyMat).concat(P && P.polyMat ? [P.polyMat] : []).filter(Boolean);
            return { on: Char3D.on, safe: Char3D.safe, shown: C.length, player: !!(P && P.shown), safeMats: mats.filter((m) => (m.options.defines || []).includes('#define SAFE')).length, mats: mats.length, ready: mats.filter((m) => m.isReady()).length, lods: [...new Set(C.map((x) => x.model._lod | 0))] };
        });
        c.ok(sf.on && sf.safe && sf.player && sf.shown > 0 && sf.safeMats === sf.mats && sf.ready === sf.mats && sf.lods.every((l) => l === 3), `modo simples: o 3D continua (jogador e ${sf.shown} NPCs à mostra, ${sf.safeMats}/${sf.mats} materiais simples, níveis ${sf.lods.join(',')})`);
        c.noErrors(errors, 'low poly');
        await close();
    },
};
