// PERSONAGENS EM 3D (art/Char3D.js — docs/personagens-3d.md): o jogador e os NPCs perto da câmera montados ao vivo na GPU com os pontos
// e o esqueleto do gerador. Confere: o jogador em 3D (e o 2,5D dele escondido), os clipes chegando do Worker com as armas na mão, os NPCs
// mais perto em 3D dentro do limite do nível gráfico (com a cor da variante deles: a linha da paleta), o jogador pilotando em 3D e que
// `?boneco=2d` volta ao desenho antigo.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'personagens3d',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx, { query: 'gfx=high' });
        page.setDefaultTimeout(0);
        await page.evaluate(() => {
            Tutorial.skip(); game.player.invulnerable = true; Config.time.cycleSeconds = 1e12; game.dayNight.hour = 13; game.dayNight.apply();
            game.player.teleport(new BABYLON.Vector3(63, 0, 30)); game.camera.snapTo(game.player.position);
        });
        await gameWait(page, 10, 400000);
        const st = await page.evaluate(() => {
            const P = game.player.char3d, a = game.player.actor, N = [...Char3D.npcs.values()], cfg = Config.art.char3d.npc;
            return {
                player: !!(P && P.shown), mask: a.mesh.layerMask, n: P && P.model && P.model.n, max: cfg.max,
                npcs: N.length, shown: N.filter((r) => r.shown).length, pal: N.filter((r) => r.pal).length,
                far: N.filter((r) => Math.hypot(r.actor.mesh.position.x - game.player.position.x, r.actor.mesh.position.z - game.player.position.z) > cfg.radius * 1.2).length,
                types: [...Char3D._types.values()].filter((M) => M.ready).length,
            };
        });
        c.ok(st.player && st.mask === 0, `o jogador em 3D (${st.n} pontos), o desenho 2,5D dele escondido (máscara ${st.mask})`);
        c.ok(st.npcs > 0 && st.npcs <= st.max && st.shown > 0 && st.pal === st.npcs, `NPCs perto em 3D: ${st.shown}/${st.npcs} (limite ${st.max}), cor pela paleta`);
        c.ok(st.far === 0, 'nenhum NPC 3D longe da câmera');
        c.note(`${st.types} tipos de NPC assados`);

        // clipe com arma: a pistola na mão
        await page.evaluate(() => { const p = game.player; p.weapon = 'pistol'; p.actor.play('aim', 'pistol'); });
        await gameWait(page, 3, 120000);
        const gun = await page.evaluate(() => { const R = game.player.char3d; return { clip: [...R.model.clips.keys()], props: [...R.props.entries()].filter(([, P]) => P && P.mesh.isEnabled()).map(([k]) => k) }; });
        await page.evaluate(() => { game.player.weapon = 'none'; });
        c.ok(gun.clip.length >= 2, `clipes chegando do gerador: ${gun.clip.join(', ')}`);
        c.note(`objetos na mão: ${gun.props.join(', ') || '—'}`);

        // pilotando: o piloto (outro ator) em 3D com o visual do jogador
        const ride = await page.evaluate(() => {
            const vm = game.vehicleManager, P = game.player.position;
            const b = vm.vehicles.find((v) => v.isBike && v.spec.bike === 'moto' && !v.controlled && v.visual && v.visual.body && v.visual.body.seat);
            let s = null;
            for (let i = 0; i < 20 && b && !s; i++) s = RoadNet.randomLanePoint(30, { x: P.x, z: P.z, rMin: 0, rMax: 150 + i * 60 }) || RoadNet.randomLanePoint(14);
            if (!s) return { b: !!b };
            game.player.teleport(new BABYLON.Vector3(s.point.x, 0, s.point.z));
            b.teleport(s.point.x, s.point.z, Math.atan2(s.d.dx, s.d.dz));
            b.riderVariant = null; b.mode = 'parked'; b.route = null;
            b.setRider(0); game.player.setVisible(false); b.setControlled(true); game.activeCar = b; game.mode = 'car';
            game.camera.snapTo(b.position); window.__bike = b; return { ok: true };
        });
        if (c.ok(ride && ride.ok, `achou uma moto (${JSON.stringify(ride)})`)) {
            await gameWait(page, 3, 120000);
            const r = await page.evaluate(() => { const a = window.__bike.visual.rider, R = Char3D.npcs.get(a); return { shown: !!(R && R.shown), same: !!(R && R.model === game.player.char3d.model), player: game.player.char3d.shown }; });
            c.ok(r.shown && r.same && !r.player, `pilotando: o piloto em 3D com o visual do jogador (${JSON.stringify(r)})`);
        }
        c.noErrors(errors, 'personagens3d');
        await close();

        // ?boneco=2d: o desenho de antes
        const b2 = await boot(ctx, { query: 'boneco=2d' });
        const off = await b2.page.evaluate(() => ({ p: !!game.player.char3d, mask: game.player.actor.mesh.layerMask }));
        c.ok(!off.p && off.mask !== 0, '?boneco=2d volta ao desenho 2,5D');
        c.noErrors(b2.errors, 'boneco 2d');
        await b2.close();
    },
};
