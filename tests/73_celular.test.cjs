// CELULAR MODESTO (até 4 GB — core/Graphics.js, PHONE) e as economias de memória que valem para todos:
//   • o perfil: 30 FPS, tela até 1,25×, sem sombras/brilho/espelho/paralaxe/rasteiras, MSAA 2×, atlas 2,5D em meia resolução com 64 MB,
//     bonecos 3D só os 4 mais perto, malhas maiores (vegetação 256 u, acabamentos 128 u), vida da cidade baixa, interface na metade;
//   • vegetação 3D: as células dividem os buffers do modelo (render/Trees3D.js, _gpu/_share), cada uma com a sua Geometry;
//   • mundo estático: normal e cor em 8 bits e a cópia na RAM solta depois da carga (map/MeshBatch.js: _compactTo, releaseStatic);
//   • carga: o MeshBatch despeja o que empilhou em pedaços tipados (_spill) e emenda no build — o resultado é o mesmo.
// (`?celular` força o perfil: o navegador dos testes não informa deviceMemory.)
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'celular',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx, { touch: true, width: 915, height: 412, query: 'gfx=medium&celular' });
        page.setDefaultTimeout(0);
        await page.evaluate(() => { Tutorial.skip(); game.player.invulnerable = true; Config.time.cycleSeconds = 1e12; game.dayNight.hour = 14; game.dayNight.apply(); if (game.autoQuality) game.autoQuality.off = true; RenderStats.enable(game); });
        await gameWait(page, 3, 120000);

        // 1) o perfil
        const p = await page.evaluate(() => {
            const P = Config.perf, A = Config.art, N = A.char3d.npc, F = Object.values(game.gameEngine.world.mats.facades || {});
            const mm = game.uiLoop.tasks.get('minimap');
            return {
                on: Graphics.phoneOn, level: Graphics.level, fps: P.fpsCap, shadows: P.shadows, bloom: !!Lighting.bloomFx, samples: Smooth.pp ? Smooth.pp.samples : 0, dpr: P.dprCap,
                half: A.npcHalf, vram: A.vramMB, n3d: N.max, mirror: !!Water.mirror, pom: F.filter((m) => m && m.useParallaxOcclusion).length,
                cover: Trees3D.coverOn, coverVis: Trees3D._cover.filter((m) => m.isVisible).length, cell: Trees3D.CELL, trim: Config.world.trimChunk,
                life: Life.level(), mmHz: mm ? Math.round(1 / mm.period) : 0, trails: !!(game.trails && A.trails.on), bump: !!A.groundBump, chaseFar: Config.camera.chase.far,
            };
        });
        c.ok(p.on && p.level === 'medium' && p.fps === 30 && p.dpr === 1.25, `celular modesto no Medium: 30 FPS, tela até ${p.dpr}× (${p.level})`);
        c.ok(!p.shadows && !p.bloom && p.samples <= 2 && !p.mirror && p.pom === 0 && !p.trails && !p.bump, `sem sombras, brilho, espelho, paralaxe, borrão nem relevo do chão; MSAA ${p.samples}×`);
        c.ok(p.half && p.vram === 64 && p.n3d === 4, `atlas 2,5D em meia resolução (${p.vram} MB) e bonecos 3D só os ${p.n3d} mais perto`);
        c.ok(!p.cover && p.coverVis === 0 && p.cell === 256 && p.trim === 128, `menos malhas: vegetação em células de ${p.cell} u, acabamentos de ${p.trim} u, sem rasteiras`);
        c.ok(p.life === 'baixa' && p.mmHz === 10 && p.chaseFar === 75, `vida da cidade ${p.life}, minimapa a ${p.mmHz} Hz, névoa a ${p.chaseFar} m`);

        // 2) memória e desenhos
        const m = await page.evaluate(() => { const s = RenderStats.sample(); return { geo: s.geoMB, tex: s.texMB, npc: s.npcMB, draws: s.drawCalls, meshes: game.scene.meshes.length }; });
        c.ok(m.geo < 230 && m.npc <= 72 && m.draws < 260 && m.meshes < 5000, `geometria ${m.geo.toFixed(0)} MB, atlas dos personagens ${m.npc} MB, ${m.draws} desenhos, ${m.meshes} malhas`);

        // 3) mundo estático compacto e sem a cópia na RAM; vegetação dividindo os buffers
        const w = await page.evaluate(() => {
            const VB = BABYLON.VertexBuffer, S = game.scene.meshes;
            const trim = S.find((x) => x.name.startsWith('world_trim') && x.geometry), wall = S.find((x) => x.name.startsWith('world_walls') && x.geometry);
            const nb = trim.getVertexBuffer(VB.NormalKind), cb = trim.getVertexBuffer(VB.ColorKind);
            const veg = S.filter((x) => /^world_veg_hi.*_(oak|mango|palm|bush)@/.test(x.name) && x.geometry);
            const byModel = new Map(); for (const v of veg) { const k = v.name.replace(/^.*_(\w+)@.*$/, '$1'); if (!byModel.has(k)) byModel.set(k, []); byModel.get(k).push(v); }
            let shared = 0, own = 0; for (const L of byModel.values()) if (L.length > 1) { if (L[0].getVertexBuffer(VB.PositionKind).getWrapperBuffer() === L[1].getVertexBuffer(VB.PositionKind).getWrapperBuffer()) shared++; if (L[0].geometry !== L[1].geometry) own++; }
            return { nType: nb.type, nStride: nb.byteStride, cType: cb && cb.type, cStride: cb && cb.byteStride, wallPos: wall.getVerticesData(VB.PositionKind), wallIdx: wall.getTotalIndices(), shared, own, models: [...byModel.keys()].length };
        });
        c.ok(w.nType === BYTE && w.nStride === 4 && w.cType === UBYTE && w.cStride === 4, `acabamentos com normal e cor em 8 bits (passo de ${w.nStride} e ${w.cStride} bytes)`);
        c.ok(w.wallPos === null && w.wallIdx > 0, `paredes do mundo sem a cópia na RAM (${w.wallIdx} índices na placa)`);
        c.ok(w.shared >= 1 && w.own === w.shared, `vegetação: células do mesmo modelo dividem os vértices na placa, cada uma com a sua geometria (${w.shared} modelos)`);

        // 4) o despejo do MeshBatch dá o mesmo lote que empilhar tudo de uma vez
        const sp = await page.evaluate(() => {
            const make = (spill) => {
                const keep = MeshBatch.SPILL; MeshBatch.SPILL = spill;
                const b = new MeshBatch();
                for (let i = 0; i < 3000; i++) { const x = i * 0.37, z = (i % 50) * 0.9; b.quad([x, 0, z + 1], [x + 1, 0, z + 1], [x, 0, z], [x + 1, 0, z], [0, 1, 0], [[0, 0], [1, 0], [0, 1], [1, 1]], [i / 3000, 0.5, 1 - i / 3000]); if (i % 7 === 0) b.tri([x, 1, z], [x + 1, 1, z], [x, 2, z], [0, 0, 1], [[0, 0], [1, 0], [0, 1]]); }
                const segs = b._seg ? b._seg.pos.length : 0;
                const mesh = b.build('teste_despejo' + spill, game.scene, game.gameEngine.world.mats.solid, { vertexColors: true, relief: false });
                MeshBatch.SPILL = keep;
                const P = mesh.getVerticesData('position'), C = mesh.getVerticesData('color'), I = mesh.getIndices();
                let h = 0; for (let i = 0; i < P.length; i += 7) h = (h + P[i] * 13 + (C[i % C.length] || 0) * 7) % 1e6; for (let i = 0; i < I.length; i += 5) h = (h + I[i] * 3) % 1e6;
                const r = { n: P.length / 3, ni: I.length, max: Math.max(...I), h: Math.round(h * 1000), segs };
                mesh.dispose();
                return r;
            };
            return { a: make(2048), b: make(1e9) };
        });
        c.ok(sp.a.segs > 3 && sp.a.n === sp.b.n && sp.a.ni === sp.b.ni && sp.a.max === sp.a.n - 1 && sp.a.h === sp.b.h, `despejo em pedaços (${sp.a.segs}) = o lote inteiro: ${sp.a.n} vértices, ${sp.a.ni} índices, mesmo conteúdo`);

        c.noErrors(errors, 'celular');
        await close();
    },
};
const BYTE = 5120, UBYTE = 5121;
