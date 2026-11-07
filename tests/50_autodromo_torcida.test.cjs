// AUTÓDROMO (racing/Speedway.js + racing/StandCrowd.js): nenhum pedestre anda na pista (a grade de navegação bloqueia o asfalto,
// as áreas de escape e a pit lane) e, nas corridas, a ARQUIBANCADA fica viva — uma torcida em lote (instâncias, não NPCs) que só
// aparece durante a corrida no autódromo e vibra mais com o carro passando.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'autodromo_torcida',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        page.setDefaultTimeout(0);
        const r = await page.evaluate(() => {
            Tutorial.skip();
            const S = Speedway;
            if (!S.site) return null;
            let walk = 0, n = 0;
            for (let s = 0; s < S.L; s += 3) for (const lat of [-S.W / 2 + 1, 0, S.W / 2 - 1]) { const p = S.at(s, lat); n++; if (game.nav.walk(p.x, p.z)) walk++; }
            const near = game.npcManager.npcs.filter((q) => q.position && S.covers(q.position.x, q.position.z) && Math.abs(S.project(q.position.x, q.position.z).lat) < S.W / 2).length;
            return { walk, n, near };
        });
        if (!c.ok(!!r, 'o mapa tem autódromo')) { await close(); return; }
        c.ok(r.walk === 0, `pista bloqueada para os pedestres (${r.walk} de ${r.n} pontos do asfalto andáveis)`);
        // a torcida: só na corrida do autódromo
        const t = await page.evaluate(() => {
            const g = Speedway.site.gate;
            game.player.teleport(new BABYLON.Vector3(g.x, 0, g.z)); game.camera.snapTo(game.player.position);
            Speedway.init(game);
            const prev = StreetRacing.cur;
            StandCrowd.update(game, 0.1);
            const off0 = !StandCrowd.on;
            StreetRacing.cur = { ev: { type: 'oval' }, phase: 'race', car: null, rivals: [] };
            for (let k = 0; k < 10; k++) StandCrowd.update(game, 0.1);
            const on = StandCrowd.on && StandCrowd._mesh.isEnabled() && StandCrowd.E > 0.3, count = StandCrowd.count, inst = StandCrowd._mesh.thinInstanceCount + StandCrowd._flag.thinInstanceCount;
            const snd = StandCrowd.sound(Speedway.site.cx, Speedway.site.cz);
            window.__keepCrowd = true;
            StreetRacing.cur = prev;
            return { off0, on, count, inst, snd };
        });
        c.ok(t.off0, 'fora de corrida a torcida em lote não existe');
        c.ok(t.on && t.count > 800 && t.inst === t.count, `na corrida: ${t.count} torcedores na arquibancada (lote de instâncias)`);
        c.ok(t.snd > 0.05, `o som da torcida perto do autódromo (${t.snd.toFixed(3)})`);
        // desenha sem erro (o shader compila) e desliga depois da corrida
        await page.evaluate(() => { StreetRacing.cur = { ev: { type: 'oval' }, phase: 'race', car: null, rivals: [] }; });
        await gameWait(page, 2, 60000);
        const ok = await page.evaluate(() => {
            const ready = StandCrowd._mat.isReady(StandCrowd._mesh, true);
            StreetRacing.cur = null; StandCrowd._end = 0;
            StandCrowd.update(game, 0.1);
            return { ready, off: !StandCrowd.on };
        });
        c.ok(ok.ready, 'material da torcida (animação no shader) compilado');
        c.ok(ok.off, 'acabou a corrida: a torcida em lote some');
        c.noErrors(errors, 'autodromo_torcida');
        await close();
    },
};
