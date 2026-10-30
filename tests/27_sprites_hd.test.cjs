// Sprites do mapa em alta definição (art/SpriteHD.js) e o rastro de pneu na grama e na areia (world/TireTracks.js):
//   • árvores, guarda-sóis, pedras e tufos de grama saem do assador HD (borda macia, sem os degraus da pixel art) e balançam no
//     vento pelo shader (sem atlas de animação);
//   • tufos de grama nos quarteirões de grama; pássaros e bichos da roça em HD (os bichos assados aos poucos, durante o jogo);
//   • o chão do mundo grande em HD (atlas de perto + atlas de longe) e os pisos novos (mata, cerrado, brejo, roça) sem emenda;
//   • o chão certo para o rastro: grama e areia sim; asfalto, calçada e água não;
//   • um carro andando na areia deixa o rastro (e o quadro muda onde ele passou); no asfalto, nada.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'sprites_hd',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        const r = await page.evaluate(async () => {
            const out = { errs: [] }, w = game.gameEngine.world, P = w.props;
            out.on = SpriteHD.on; out.Q = SpriteHD.Q; out.hd = !!(P && P.hd);
            out.mat = P && P.hiMaterial && P.hiMaterial.getClassName();
            out.tuftKind = PropSprites.FRAMES.filter((f) => f.kind === 'tuft').length;
            // borda macia: no atlas HD sobra alfa intermediário (a pixel art só tem 0 ou 255)
            const d = await P.atlas.readPixels();
            let soft = 0, solid = 0;
            for (let i = 3; i < d.length; i += 4) { const a = d[i]; if (a > 245) solid++; else if (a > 10) soft++; }
            out.soft = soft / Math.max(1, solid);
            // tufos de grama nos quarteirões de grama
            out.tufts = 0;
            for (const b of CityGrid.blocks) for (const p of b.props || []) if (p.type === 'tuft') out.tufts++;
            const bm = (game.birds.mesh && game.birds.mesh.material) || game.birds.material;
            out.birds = !!(bm && bm.hd);
            out.atlas2 = TerrainSplat.tex.atlas2 && TerrainSplat.tex.atlas2.getSize().width;
            out.atlas = TerrainSplat.tex.atlas && TerrainSplat.tex.atlas.getSize().width;
            // pisos novos do mundo grande: repetem sem emenda
            const seam = (t) => {
                const g = t.cv.getContext('2d'), W = t.cv.width, H = t.cv.height, D = g.getImageData(0, 0, W, H).data;
                const px = (x, y) => { const i = (y * W + x) * 4; return D[i] * 0.3 + D[i + 1] * 0.59 + D[i + 2] * 0.11; };
                let edge = 0, mid = 0;
                for (let y = 0; y < H; y++) { edge += Math.abs(px(W - 1, y) - px(0, y)); mid += Math.abs(px(W >> 1, y) - px((W >> 1) + 1, y)); }
                for (let x = 0; x < W; x++) { edge += Math.abs(px(x, H - 1) - px(x, 0)); mid += Math.abs(px(x, H >> 1) - px(x, (H >> 1) + 1)); }
                return { edge: edge / (W + H), mid: mid / (W + H) };
            };
            out.seams = [];
            for (const [n, ...a] of [['forest', 171], ['scrub', 161], ['swamp', 121], ['farm', 131, 0], ['farm', 141, 1], ['farm', 151, 2]]) {
                try { const s = seam(CityHD.paint(n, ...a)); if (s.edge > s.mid * 2.5 + 6) out.seams.push(`${n} ${a.join()}: borda ${s.edge.toFixed(1)} × miolo ${s.mid.toFixed(1)}`); }
                catch (e) { out.errs.push(n + ': ' + e.message); }
            }
            CityHD.release();
            // chão do rastro
            const inner = (want) => {
                for (const b of CityGrid.blocks) {
                    if (!b.open || b.organic || b.biome !== want) continue;
                    const [x0, z0, x1, z1] = b.slab;
                    for (let k = 0; k < 40; k++) { const x = x0 + 2 + Math.random() * (x1 - x0 - 4), z = z0 + 2 + Math.random() * (z1 - z0 - 4); let ok = true; for (let dz = -2; dz <= 4 && ok; dz += 0.5) for (const dx of [-1, 0, 1]) if (!TireTracks.surface(x + dx, z + dz)) ok = false; if (ok) return [x, z]; }
                }
                return null;
            };
            const lane = RoadNet.randomLanePoint(45, { x: game.player.position.x, z: game.player.position.z, rMin: 0, rMax: 400 });
            const park = inner('park'), beach = inner('beach');
            let wsand = null, sea = null;
            for (let t = 0; t < 30000 && (!wsand || !sea); t++) {
                const x = -3000 + Math.random() * 6000, z = -3000 + Math.random() * 6000;
                if (!wsand && !CityGrid._blockAtPoint(x, z) && WorldMap.biomeAt(x, z) === WorldMap.B.SAND && MapGeo.waterDepth(x, z) <= 0 && !RoadPlan.onPavement(x, z, 3)) {
                    let ok = true;
                    for (let dx = -10; dx <= 10 && ok; dx += 2) for (let dz = -10; dz <= 30 && ok; dz += 2) if ((TireTracks.surface(x + dx, z + dz) & 3) !== 2) ok = false;
                    if (ok) wsand = [x, z];
                }
                if (!sea && MapGeo.waterDepth(x, z) > 1) sea = [x, z];
            }
            out.surf = {
                road: lane ? TireTracks.surface(lane.point.x, lane.point.z) : -1,
                park: park ? TireTracks.surface(park[0], park[1]) : -1,
                beach: beach ? TireTracks.surface(beach[0], beach[1]) : -1,
                wsand: wsand ? TireTracks.surface(wsand[0], wsand[1]) : -1,
                sea: sea ? TireTracks.surface(sea[0], sea[1]) : -1,
            };
            // um "carro" passando: rastro na grama do parque, nada no asfalto
            const fake = (x, z) => ({ position: { x, z }, isBike: false, spec: {}, halfLen: 2.2, halfW: 0.9, visual: { tire: { x: 0.75, z: 1.35, wid: 0.2 } }, speed: 6, velocity: { x: 0, z: 6 }, elev: 0 });
            const drive = (p, dirX, dirZ, len) => {
                const n0 = TireTracks.next, car = fake(p[0], p[1]);
                TireTracks.focus = { x: p[0], z: p[1] };
                for (let s = 0; s <= len; s += 0.1) { car.position.x = p[0] + dirX * s; car.position.z = p[1] + dirZ * s; TireTracks.vehicle(car, dirX, dirZ, 0); }
                return (TireTracks.next - n0 + TireTracks.N) % TireTracks.N;
            };
            game.player.teleport(new BABYLON.Vector3(park ? park[0] : 0, 0, park ? park[1] : 0));
            game.camera.snapTo(game.player.position);
            out.segPark = park ? drive(park, 0, 1, 3) : -1;
            if (lane) { game.player.teleport(new BABYLON.Vector3(lane.point.x, 0, lane.point.z)); game.camera.snapTo(game.player.position); }
            out.segRoad = lane ? drive([lane.point.x, lane.point.z], lane.d.dx, lane.d.dz, 3) : -1;
            out.wsand = wsand;
            return out;
        });
        c.ok(r.on && r.hd, 'sprites do mapa em alta definição (SpriteHD)');
        c.ok(!r.errs.length, `pintores do mundo grande sem erro (${r.errs.slice(0, 3).join(' | ')})`);
        c.eq(r.mat, 'ShaderMaterial', 'props HD: vento pelo shader (deformação), sem atlas de animação');
        c.ok(r.tuftKind > 0, `tufos de grama no atlas (${r.tuftKind} quadros)`);
        c.ok(r.soft > 0.05, `bordas macias nos sprites HD (${(r.soft * 100).toFixed(0)}% de pixels semitransparentes por opaco)`);
        c.ok(r.tufts > 50, `tufos de grama nos quarteirões de grama (${r.tufts})`);
        c.ok(r.birds, 'pássaros em HD');
        c.ok(r.atlas2 > 0 && r.atlas2 * 2 === r.atlas, `chão do mundo em HD: atlas de perto ${r.atlas} px e de longe ${r.atlas2} px`);
        c.ok(!r.seams.length, `pisos do mundo sem emenda (${r.seams.join(' | ')})`);
        c.eq(r.surf.road, 0, 'asfalto: sem rastro');
        c.eq(r.surf.sea, 0, 'água: sem rastro');
        c.eq(r.surf.park, 5, 'grama do parque: rastro (na altura da calçada)');
        c.eq(r.surf.beach, 6, 'areia da praia da cidade: rastro');
        c.eq(r.surf.wsand, 2, 'areia do mundo grande: rastro');
        c.ok(r.segPark >= 10, `carro na grama deixa o rastro das duas rodas de trás (${r.segPark} trechos em 3 m)`);
        c.eq(r.segRoad, 0, 'carro no asfalto: nenhum trecho de rastro');

        // no jogo: um carro de verdade na areia do mundo deixa o rastro, e o quadro muda onde ele passou (a mistura 2× origem × destino)
        if (c.ok(!!r.wsand, 'achou areia aberta no mundo grande')) {
            const st = await page.evaluate(async ([x, z]) => {
                if (Weather.cur) Weather.cur.set('clear', true, true);
                game.dayNight.hour = 13; game.dayNight.apply();
                game.player.invulnerable = true;
                const vm = game.vehicleManager, b = vm.vehicles.find((v) => !v.isBike && !v.spec.boat && !v.controlled && v.visual);
                if (!b) return null;
                game.player.teleport(new BABYLON.Vector3(x, 0, z));
                b.teleport(x, z, 0); b.riderVariant = null; b.mode = 'parked'; b.route = null;
                game.player.setVisible(false); b.setControlled(true); game.activeCar = b; game.mode = 'car';
                game.camera.snapTo(b.position);
                window.__b = b; window.__ax = { x: 0, z: 0.8 }; window.__n0 = TireTracks.next;
                game.input.getMoveAxis = () => window.__ax;
                return { id: b.spec.id };
            }, r.wsand);
            if (c.ok(!!st, 'carro para dirigir na areia')) {
                await gameWait(page, 2.5);
                const dr = await page.evaluate(async () => {
                    window.__ax = { x: 0, z: 0 };
                    const b = __b, n = (TireTracks.next - __n0 + TireTracks.N) % TireTracks.N;
                    return { n, surf: (b._tt || []).map((s) => s && s.c) };
                });
                c.ok(dr.n >= 4 && dr.surf.every((s) => s === 2), `carro de verdade na areia deixa rastro (${dr.n} trechos; chão ${dr.surf.join(',')})`);
                // o quadro com o rastro e sem ele: muda onde o carro passou
                const lum = await page.evaluate(async () => {
                    const eng = game.gameEngine.engine, w = eng.getRenderWidth(), h = eng.getRenderHeight();
                    const grab = async () => { game.scene.render(); return eng.readPixels(0, 0, w, h); };
                    const a = await grab(); TireTracks.mesh.isVisible = false;
                    const b = await grab(); TireTracks.mesh.isVisible = true;
                    let diff = 0, n = 0;
                    for (let i = 0; i < a.length; i += 4) { const dd = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); if (dd > 12) diff++; n++; }
                    return { frac: diff / n };
                });
                c.ok(lum.frac > 0.0005 && lum.frac < 0.2, `o rastro aparece no quadro (${(lum.frac * 100).toFixed(2)}% dos pixels mudam)`);
            }
        }

        // bichos da roça: assados aos poucos (HD) e desenhados sem erro nos cercados
        const pen = await page.evaluate(() => {
            const L = game.livestock;
            if (!L || !L.pens.length) return null;
            const p = L.pens[0];
            if (game.activeCar) { game.activeCar.setControlled(false); game.activeCar = null; game.mode = 'player'; game.player.setVisible(true); }
            game.player.teleport(new BABYLON.Vector3((p.x0 + p.x1) / 2, 0, (p.z0 + p.z1) / 2 - 6));
            game.camera.snapTo(game.player.position);
            return { hd: !!L._hdJob || !!(L.material && L.material.getClassName() === 'ShaderMaterial') };
        });
        if (pen) {
            c.ok(pen.hd, 'bichos da roça em HD');
            await gameWait(page, 4, 240000);
            const lv = await page.evaluate(async () => {
                const L = game.livestock, t0 = Date.now();
                while (L._hdJob && Date.now() - t0 < 180000) await new Promise((res) => setTimeout(res, 500));
                await new Promise((res) => setTimeout(res, 1500));
                return { job: !!L._hdJob, animals: L.animals.length, mat: !!L.mesh.material, drawn: L._drawn };
            });
            c.ok(!lv.job && lv.mat, 'bichos da roça assados em HD durante o jogo');
            c.ok(lv.animals > 0 && lv.drawn, `bichos no cercado desenhados (${lv.animals})`);
        } else c.note('sem cercados de bichos neste mapa');
        c.noErrors(errors, 'sprites HD');
        await close();
    },
};
