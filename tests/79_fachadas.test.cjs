// FACHADAS EM POLÍGONOS (render/Walls3D.js): as texturas pintadas das fachadas (facade_*, win_*, relief_*) saem; a parede é pintada
// no shader (o material de cada estilo, a grade das janelas pela UV, a cor de cada prédio no vértice) e as peças de perto são 3D
// (moldura com o vão, peitoril, venezianas, ar-condicionado, toldo, sacada, brise, cano), com menos peças longe. Confere: nenhuma
// textura de fachada, mais de 30 estilos (materiais e janelas variados), o shader pronto em todas, os números das peças, as faixas
// de detalhe pela distância (e que acompanham a câmera), o hash inteiro igual ao do shader e as janelas que ACENDEM à noite.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'fachadas',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx, { query: 'gfx=high' });
        page.setDefaultTimeout(0);
        await page.evaluate(() => { Tutorial.skip(); game.player.invulnerable = true; Config.time.cycleSeconds = 1e12; game.dayNight.hour = 11; game.dayNight.apply(); game.weather.set('clear', true, true); game.weather.override = 1e9; });
        await gameWait(page, 2, 200000);
        const a = await page.evaluate(() => {
            const M = game.gameEngine.world.mats.facades, S = Walls3D.STYLES, st = Walls3D.stats();
            const used = new Set();
            for (const blk of CityGrid.blocks.concat(CityGrid.extraBlocks || [])) for (const l of blk.lots) if (!l.safehouse) used.add(l.facade);
            const walls = game.scene.meshes.filter((m) => /^world_walls_/.test(m.name));
            return {
                on: Walls3D.on, n: Object.keys(S).length, used: used.size,
                fams: new Set(Object.values(S).map((s) => s.fam)).size, wins: new Set(Object.values(S).map((s) => s.win)).size,
                tex: game.scene.textures.filter((t) => /^(facade_|win_|relief_)/.test(t.name)).map((t) => t.name).slice(0, 5),
                plug: Object.values(M).filter((m) => !(m.pluginManager && m.pluginManager.getPlugin('Wall3D'))).length, mats: Object.keys(M).length,
                ready: walls.filter((m) => m.isVisible && m.material && !m.material.isReady(m)).length, walls: walls.length,
                colors: walls.every((m) => m.isVerticesDataPresent('color') && m.isVerticesDataPresent('uv')), st,
            };
        });
        c.ok(a.on && a.tex.length === 0, `fachadas em polígonos, sem textura de fachada (${a.tex.join(', ') || 'nenhuma'})`);
        c.ok(a.n >= 30 && a.used >= 30 && a.fams >= 12 && a.wins >= 12, `${a.n} estilos (${a.used} no mapa): ${a.fams} materiais de parede, ${a.wins} tipos de janela`);
        c.ok(a.plug === 0 && a.mats >= a.n, `o material pintado no shader em todos os ${a.mats} estilos`);
        c.ok(a.walls > 0 && a.ready === 0 && a.colors, `paredes com a cor do prédio e a grade das janelas, shader pronto (${a.walls} malhas)`);
        c.ok(a.st && a.st.faces > 1000 && a.st.windows > 20000, `${a.st.faces} lados de prédio, ${a.st.windows} janelas`);
        c.ok(a.st.inst > 300 && a.st.draws <= 9 && a.st.tris < 400000, `peças 3D: ${a.st.inst} instâncias, ${a.st.tris} triângulos, ${a.st.draws} desenhos (${JSON.stringify(a.st.kinds)})`);

        // o hash inteiro do JS (as peças) é o mesmo do shader (o desenho): a conta inteira, sem erro de ponto flutuante
        const h = await page.evaluate(() => {
            const f32 = (x) => Math.fround(x), mod = (x, m) => f32(x - m * Math.floor(f32(x / m)));
            let bad = 0;
            for (let i = 0; i < 128; i++) for (let j = 0; j < 40; j++) for (let k = 1; k <= 31; k += 3) {
                const x = f32(i * 37 + j * 101 + k * 59 + i * j * 13 + i * i * 7 + k * j * 3), r = mod(x, 97), g = (r > 96.5 ? 0 : r) / 97;
                if (Math.abs(g - Walls3D.ih(i, j, k)) > 1e-6) bad++;
            }
            return bad;
        });
        c.ok(h === 0, `hash das janelas igual no JS e no shader (${h} diferentes)`);

        // faixas de detalhe: perto tudo, longe só sacadas e brises; acompanham a câmera
        const bands = () => page.evaluate(() => {
            const cam = game.scene.activeCamera, P = cam.globalPosition, k = Walls3D.lodScale, R = Walls3D.BUCKET * 0.72, out = { nearOk: 0, nearBad: 0, farOk: 0, farBad: 0, goneOk: 0 };
            for (const b of Walls3D._built.buckets) {
                const yc = Math.max(b.y0, Math.min(b.y1, P.y)), d = Math.max(0, Math.hypot(b.cx - P.x, yc - P.y, b.cz - P.z) - R);
                if (d < Walls3D.LOD.near * k * 0.9) b.band === 0 ? out.nearOk++ : out.nearBad++;
                else if (d > Walls3D.LOD.mid * k * 1.15 && d < Walls3D.LOD.far * k * 0.9) b.band === 2 ? out.farOk++ : out.farBad++;
                else if (d > Walls3D.LOD.far * k * 1.15) b.band === 3 ? out.goneOk++ : out.farBad++;
            }
            out.nk = Walls3D._built.buckets.filter((b) => b.band === 0).map((b) => b.key).sort().join(' ');
            return Object.assign(out, { frames: Walls3D.stats().kinds.frame });
        });
        const b1 = await bands();
        c.ok(b1.nearOk > 0 && b1.nearBad === 0 && b1.farOk > 0 && b1.goneOk > 0 && b1.farBad === 0 && b1.frames > 0, `faixas: ${b1.nearOk} baldes perto com todas as peças, ${b1.farOk} longe, ${b1.goneOk} além da névoa sem peça (${b1.nearBad + b1.farBad} errados; ${b1.frames} molduras)`);
        await page.evaluate(() => { const S = Bench.SCENES.find((s) => s.id === 'centro'), p = S.at(); game.player.teleport(new BABYLON.Vector3(p.x, 0, p.z)); game.camera.snapTo(game.player.position); });
        await gameWait(page, 3, 200000);
        const b2 = await bands();
        c.ok(b2.nearBad === 0 && b2.farBad === 0 && b2.nk !== b1.nk && b2.nearOk + b2.farOk > 20, `depois de andar, as faixas acompanham (${b2.nearOk} perto, ${b2.farOk} longe, ${b2.goneOk} além; os baldes de perto mudaram)`);

        // à noite as janelas acendem: o mesmo quadro com e sem a luz das janelas (a câmera de frente para um prédio do centro)
        const lum = await page.evaluate(() => {
            game.dayNight.hour = 21; game.dayNight.apply();
            const sc = game.scene, P = game.player.position;
            let best = null, bd = 1e9;
            for (const blk of CityGrid.blocks) for (const l of blk.lots) { const d = Math.hypot((l.x0 + l.x1) / 2 - P.x, (l.z0 + l.z1) / 2 - P.z); if (!l.safehouse && l.height >= 12 && d < bd) { bd = d; best = l; } }
            const l = best, cam = new BABYLON.FreeCamera('fcam', new BABYLON.Vector3((l.x0 + l.x1) / 2, 7, l.z0 - 16), sc);
            cam.setTarget(new BABYLON.Vector3((l.x0 + l.x1) / 2, 7, l.z0)); cam.minZ = 0.1; const old = sc.activeCamera; sc.activeCamera = cam;
            const eng = game.gameEngine.engine, gl = eng._gl, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4);
            const shot = () => { sc.render(); sc.render(); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); let s = 0; for (let i = 0; i < px.length; i += 16) s += px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11; return s / (px.length / 16); };
            const S = WindowLights.state, keep = Array.from(S), upd = WindowLights.update;
            WindowLights.update = () => {};
            S[0] = 1; S[1] = 0.7; S[3] = 0.7; const on = shot();
            S[0] = 0; const off = shot();
            WindowLights.update = upd; S.set(keep);
            sc.activeCamera = old; cam.dispose();
            game.dayNight.hour = 11; game.dayNight.apply();
            return { on, off, facade: l.facade };
        });
        c.ok(lum.on > lum.off * 1.08, `à noite as janelas acendem (${lum.facade}: brilho ${lum.off.toFixed(1)} → ${lum.on.toFixed(1)})`);
        c.noErrors(errors, 'fachadas');
        await close();
    },
};
