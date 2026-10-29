// O personagem nunca fica "transparente" com o mundo: nada mais se esburaca em volta dele.
//   • copas: inteiras; embaixo delas ele aparece como a silhueta dourada (XRaySilhouette, pela máscara das copas no stencil);
//   • viaduto, ponte, túnel e cobertura de posto: o trecho em cima dele SOME inteiro (RoofCut, como o telhado de uma loja) e volta
//     quando ele sai; quem está EM CIMA (no tabuleiro) não corta nada;
//   • as divisas dos pisos em degradê (GroundBlend): faixas com a borda recortada por ruído;
//   • o assador HD não deixa mais a faixa reta de sombra em cima e embaixo dos sprites.
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'teto_divisas',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        const r = await page.evaluate(() => {
            const w = game.gameEngine.world, P = w.props, out = {};
            out.noFade = ![P.hiMaterial, P.loMaterial].some((m) => m.options && m.options.uniforms.includes('useFade'));
            out.mask = !!(P.maskMaterial && P.maskMaterial.disableColorWrite);
            out.masks = XRaySilhouette.masks.size;
            out.reveal = typeof Reveal === 'undefined';
            // peças do teto
            const U = RoofCut.units;
            out.units = U.length;
            const v = (RoadPlan.viaducts || []).find((e) => e.v && e.elev > 4);
            const test = (x, z, y) => { RoofCut._live.clear(); for (const u of U) u.k = 1; RoofCut.update(1, x, z, y); return U.filter((u) => u.on).length; };
            if (v) {
                const z = (v.a.z + v.b.z) / 2;
                out.via = { under: test(v.a.x + 2, z, 1.7), deck: test(v.a.x + 2, z, v.elev + 1.7), away: test(v.a.x + 60, z, 1.7) };
            }
            let can = null;
            for (const b of CityGrid.blocks.concat(CityGrid.extraBlocks || [])) if (b.canopies && b.canopies.length) { can = b.canopies[0]; break; }
            if (can) out.can = test((can.x0 + can.x1) / 2, (can.z0 + can.z1) / 2, 1.7);
            const br = RoadPlan.edges.find((e) => e.cls === 'bridge' && !e.v);
            if (br) { const x = (br.a.x + br.b.x) / 2; out.bridge = { under: test(x, br.a.z, 0.1), over: test(x, br.a.z, 1.7) }; }
            RoofCut._live.clear(); for (const u of U) { u.k = 1; u.on = false; }
            // divisas
            const M = w.mats;
            out.blend = ['blend_grass', 'blend_sand', 'blend_dirt'].map((k) => game.scene.meshes.filter((m) => m.material === M[k] && m.hasVertexAlpha).length);
            // assador: a sombra de um quadradinho no chão (rascunho com a oclusão = 1 em volta, como no assado) não vaza para a quina
            // da caixa dela — antes o borrão lia esse 1 fora da caixa e fazia uma faixa reta em cima e embaixo do sprite
            SpriteHD.bake(PropSprites.modelHD('boulder', 1), { size: 64, q: 1, shadowLen: 0.5 });
            const sc = SpriteHD._scratch, N = sc.N;
            sc.mat.fill(0); sc.hgt.fill(0); sc.tmp.fill(1);
            for (let y = 28; y < 36; y++) for (let x = 28; x < 36; x++) sc.mat[y * N + x] = 1;
            SpriteHD._castShadow(N, Config.art.ppu, SpriteBaker.LIGHT, 0.5, 0, null);
            const bx = sc.sbox;
            out.stale = bx ? Math.max(sc.sh[bx[1] * N + bx[0]], sc.sh[bx[3] * N + bx[2]]) : -1;
            return out;
        });
        c.ok(r.noFade && r.reveal, 'copas e estruturas sem o furo/fade em volta do jogador (RevealPlugin e useFade fora)');
        c.ok(r.mask && r.masks > 0, `máscara das copas para a silhueta dourada (${r.masks} malhas)`);
        c.ok(r.units > 10, `peças de teto registradas (viaduto, ponte, túnel, cobertura): ${r.units}`);
        c.ok(!!r.via && r.via.under >= 1 && r.via.deck === 0 && r.via.away === 0, `viaduto: some em cima de quem passa por baixo, nada para quem está no tabuleiro ou longe (${JSON.stringify(r.via)})`);
        c.eq(r.can, 1, 'cobertura do posto some com o jogador embaixo');
        c.ok(!!r.bridge && r.bridge.under >= 1 && r.bridge.over === 0, `ponte: o vão some para quem nada embaixo, não para quem anda em cima (${JSON.stringify(r.bridge)})`);
        c.ok(r.blend.every((n) => n > 0), `faixas de degradê nas divisas (grama ${r.blend[0]}, areia ${r.blend[1]}, terra ${r.blend[2]} malhas)`);
        c.ok(r.stale >= 0 && r.stale < 0.05, `assador HD: a sombra não vaza para a quina da caixa — sem a faixa reta em cima e embaixo dos sprites (${r.stale.toFixed(3)})`);

        // no quadro: debaixo de uma copa a silhueta dourada aparece; o trecho do viaduto em cima do jogador some; a divisa muda o chão
        const px = await page.evaluate(async () => {
            if (Interiors.active) Interiors.leave(game);
            if (Weather.cur) Weather.cur.set('clear', true, true);
            game.dayNight.hour = 12; game.dayNight.apply();
            game.player.invulnerable = true;
            const eng = game.gameEngine.engine, W = eng.getRenderWidth(), H = eng.getRenderHeight();
            const grab = async () => { game.scene.render(); return eng.readPixels(0, 0, W, H); };
            const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) n++; return n; };
            const go = async (x, z) => { game.player.teleport(new BABYLON.Vector3(x, 0, z)); game.camera.snapTo(game.player.position); for (let i = 0; i < 8; i++) await new Promise((res) => setTimeout(res, 120)); };
            const out = {};
            // copa: a árvore alta mais perto do começo, o jogador logo ao norte do tronco (a copa desenhada cobre ele)
            let tree = null, best = Infinity;
            const st = game.player.position;
            for (const b of CityGrid.blocks) for (const p of b.props || []) if (p.type === 'tree' && PropSprites.HEIGHT[p.kind] > 2.5) { const d = Math.hypot(p.x - st.x, p.z - st.z); if (d < best) { best = d; tree = p; } }
            if (tree) {
                await go(tree.x, tree.z + 1.2);
                game.xray.update();
                const a = await grab();
                game.xray.canopy.setEnabled(false);
                const b = await grab();
                out.canopy = diff(a, b);
                game.xray.update();
            }
            // viaduto: com e sem o corte
            const v = (RoadPlan.viaducts || []).find((e) => e.v && e.elev > 4);
            if (v) {
                await go(v.a.x + 3, (v.a.z + v.b.z) / 2 + 2);
                for (let i = 0; i < 10; i++) RoofCut.update(0.1, game.player.position.x, game.player.position.z, game.player.revealY);
                const a = await grab();
                const keep = RoofCut.units.map((u) => u.under);
                for (const u of RoofCut.units) u.under = -1;
                for (let i = 0; i < 10; i++) RoofCut.update(0.1, game.player.position.x, game.player.position.z, game.player.revealY);
                const b = await grab();
                RoofCut.units.forEach((u, i) => { u.under = keep[i]; });
                out.via = diff(a, b);
            }
            // divisa: o parque (ou mata) mais perto, 2 u para dentro do meio de uma beirada
            let park = null; best = Infinity;
            for (const b of CityGrid.blocks) if (b.open && b.ground === 'grass' && !b.organic) { const d = Math.hypot((b.slab[0] + b.slab[2]) / 2 - st.x, (b.slab[1] + b.slab[3]) / 2 - st.z); if (d < best) { best = d; park = b; } }
            if (park) {
                const s = park.slab, P = park.poly || [[s[0], s[1]], [s[2], s[1]], [s[2], s[3]], [s[0], s[3]]];
                const cx = P.reduce((a, p) => a + p[0], 0) / P.length, cz = P.reduce((a, p) => a + p[1], 0) / P.length;
                const mx = (P[0][0] + P[1][0]) / 2, mz = (P[0][1] + P[1][1]) / 2, l = Math.hypot(cx - mx, cz - mz) || 1;
                await go(mx + (cx - mx) / l * 2, mz + (cz - mz) / l * 2);
                const ms = game.scene.meshes.filter((m) => m.material && /^blend_/.test(m.material.name));
                const a = await grab();
                for (const m of ms) m.isVisible = false;
                const b = await grab();
                for (const m of ms) m.isVisible = true;
                out.blend = diff(a, b);
            }
            out.px = W * H;
            return out;
        });
        c.ok(px.canopy > 30, `silhueta dourada debaixo da copa (${px.canopy} px)`);
        c.ok(px.via > px.px * 0.02, `o trecho do viaduto em cima do jogador some (${(px.via / px.px * 100).toFixed(1)}% do quadro muda)`);
        c.ok(px.blend > 200, `divisa do parque em degradê (${px.blend} px)`);
        c.note(`silhueta sob a copa ${px.canopy} px, viaduto ${(px.via / px.px * 100).toFixed(1)}% do quadro, divisa ${px.blend} px`);
        c.noErrors(errors, 'teto e divisas');
        await close();
    },
};
