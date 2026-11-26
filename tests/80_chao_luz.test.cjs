// O CHÃO SEM PLANEJAMENTO (render/GroundVariety.js) e a LUZ mais realista (sombra de contato assada, a cor da lâmpada pelo bairro,
// a luz das portas e portarias no chão). Confere: o mapa de zonas existe e varia (asfalto novo e velho, zonas de paralelepípedo, os
// quatro tipos de calçada, sujeira), o plugin está nos materiais do chão e o shader fica pronto; a faixa de contato em volta dos
// prédios (alfa no vértice, sem luz e sem sombra em tempo real); postes de sódio e de LED; as lâmpadas de porta e as portarias no
// campo de luz da noite; e que o chão variado de fato muda o quadro (o mesmo quadro com e sem o desenho).
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'chao_luz',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx, { query: 'gfx=high' });
        page.setDefaultTimeout(0);
        await page.evaluate(() => { Tutorial.skip(); game.player.invulnerable = true; Config.time.cycleSeconds = 1e12; game.dayNight.hour = 11; game.dayNight.apply(); game.weather.set('clear', true, true); game.weather.override = 1e9; });
        await gameWait(page, 2, 200000);
        const a = await page.evaluate(() => {
            const GV = GroundVariety, D = GV._data, N = GV.N, M = game.gameEngine.world.mats;
            const ages = [0, 0, 0], sides = [0, 0, 0, 0];
            let cob = 0;
            for (let k = 0; k < N * N; k++) { const ag = D[k * 4] / 255; ages[ag < 0.33 ? 0 : ag < 0.66 ? 1 : 2]++; if (D[k * 4 + 1] > 128) cob++; sides[Math.min(3, Math.floor(D[k * 4 + 2] / 255 * 4))]++; }
            const mats = ['road', 'asphalt', 'sidewalk', 'plaza', 'earth', 'dirt', 'concrete', 'sand', 'grass'];
            const plug = mats.filter((k) => M[k] && !(M[k].pluginManager && M[k].pluginManager.getPlugin('GroundVariety')));
            const ground = game.scene.meshes.filter((m) => /^world_(road|sidewalk|asphalt|open_)/.test(m.name) && m.isVisible && m.material);
            const notReady = ground.filter((m) => !m.material.isReady(m)).length;
            const ao = game.scene.meshes.filter((m) => /^world_ao/.test(m.name));
            const lamps = game.gameEngine.world.streetLamps || [];
            const sod = lamps.filter((l) => l.tint && l.tint[2] < 0.4).length, led = lamps.filter((l) => l.tint && l.tint[2] >= 0.4).length;
            NightLights._buildGrid(game.gameEngine.world);
            let doorL = 0; for (const L of NightLights._grid.G.values()) for (const o of L) if (o.t === 3) doorL++;
            return {
                on: GV.on, n: N, ages, cob, sides, plug, ground: ground.length, notReady,
                ao: ao.length, aoAlpha: ao.every((m) => m.hasVertexAlpha && !m.receiveShadows && m.material.name === 'contactAO'),
                sod, led, lamps: lamps.length, doorL, wl: (Walls3D.lamps || []).length,
            };
        });
        c.ok(a.on && a.n === 256, `chão variado ligado (mapa de zonas ${a.n}×${a.n})`);
        c.ok(a.ages.every((n) => n > 500) && a.cob > 200, `asfalto de idades diferentes (novo/médio/velho: ${a.ages.join('/')}) e zonas de paralelepípedo (${a.cob} texels)`);
        c.ok(a.sides.every((n) => n > 300), `os quatro tipos de calçada no mapa (placa/ladrilho/pedra portuguesa/quebrada: ${a.sides.join('/')})`);
        c.ok(!a.plug.length && a.ground > 0 && a.notReady === 0, `o desenho do chão nos materiais (sem: ${a.plug.join(', ') || 'nenhum'}), shader pronto em ${a.ground} malhas`);
        c.ok(a.ao > 0 && a.aoAlpha, `sombra de contato assada em volta dos prédios (${a.ao} malhas, alfa no vértice, sem sombra em tempo real)`);
        c.ok(a.sod > 20 && a.led > 20, `postes de sódio (${a.sod}) e de LED (${a.led}) pelo bairro, de ${a.lamps}`);
        c.ok(a.wl > 100 && a.doorL === a.wl, `lâmpadas de porta e portarias no campo de luz da noite (${a.doorL} de ${a.wl})`);

        // o desenho do chão muda o quadro: a câmera olhando a rua, com e sem o desenho
        const d = await page.evaluate(() => {
            const sc = game.scene, eng = game.gameEngine.engine, gl = eng._gl, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4);
            const shot = () => { sc.render(); sc.render(); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); return px.slice(); };
            const A = shot(); GroundVariety.shade = 0; const B = shot(); GroundVariety.shade = 1;
            let diff = 0, n = 0;
            for (let i = 0; i < A.length; i += 64) { diff += Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]); n++; }
            return diff / n;
        });
        c.ok(d > 1.5, `o desenho do chão muda o quadro (diferença média ${d.toFixed(1)} por pixel)`);

        // à noite, sem erro
        await page.evaluate(() => { game.dayNight.hour = 22; game.dayNight.apply(); });
        await gameWait(page, 1.5, 120000);
        c.noErrors(errors, 'chão e luz');
        await close();
    },
};
