// Assalto a loja (crime/Robbery.js): a resposta da polícia tem o tamanho da loja. Padaria (porte 1): a viatura demora mais, chegando
// junto com a sua saída dá só 1★ (a polícia não atira se você não atirar), crime leve na ficha e busca curta; saindo atirando, 2★
// sem tiro livre extra. Restaurante de luxo (porte 3): polícia mais rápida, 2★ na porta e 3★ atirando, com 30 s de tiro livre.
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'assalto',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        await page.evaluate(() => {
            Tutorial.skip(); game.dayNight.hour = 15; game.player.invulnerable = true;
            WorldMemory.guarded = () => false;
            const R = game.careers && game.careers.by.robber; if (R) R.rank = Math.max(R.rank, 3);
            game.player.weapon = 'pistol';
        });
        const table = await page.evaluate(() => Robbery.HEAT.slice(1).map((h) => ({ police: h.police, door: h.door, fight: h.fight, crime: h.crime })));
        c.ok(table.every((h, i) => !i || (h.police < table[i - 1].police && h.door >= table[i - 1].door && h.fight >= table[i - 1].fight)),
            `quanto maior a loja, mais rápida a polícia e mais estrelas (${table.map((h) => `${h.police}s ${h.door}/${h.fight}★`).join(' · ')})`);

        // Um assalto do começo ao fim: entra, anuncia, chamam a polícia, sai do jeito `how`.
        const rob = (style, how) => page.evaluate(async ([st, how]) => {
            const g = game, H = g.heat, pm = g.policeManager;
            g.wanted.bust(); H.record.clear(); H.anonymous.clear(); H.paroleUntil = -Infinity; H._settle();
            if (pm) pm.weaponsFreeUntil = -1;
            Traces.pend = []; Traces.search = null; Robbery.robbedDay = {};
            Interiors.index();
            const d = Interiors._doors.find((s) => s.style === st && s.district !== 'favela');
            if (!d) return null;
            g.player.teleport(new BABYLON.Vector3(d.x, 0, d.z)); Interiors.enter(g, d);
            const until = (f) => new Promise((ok) => { const t0 = performance.now(), w = () => (f() || performance.now() - t0 > 60000 ? ok() : setTimeout(w, 100)); w(); });
            await until(() => Interiors.active && !Interiors.busy);
            if (!Robbery.start(g)) return { name: d.name, started: false };
            const s = Robbery.session, tier = s.tier;
            Robbery.callPolice(g, 'O atendente apertou o alarme');
            const T = s.police.T;
            s.loot.cash += 900;
            if (how === 'fight') { Robbery._startSiege(g); Robbery.negotiate(g, 'fight'); }
            else { if (how === 'door') s.police.t = 5; else { s.police = null; } Interiors.leave(g); }
            await until(() => !Interiors.active && !Interiors.busy);
            const crime = H.record.crimes[H.record.crimes.length - 1], call = Traces.pend[Traces.pend.length - 1];
            return {
                name: d.name, started: true, tier, T: Math.round(T), stars: g.wanted.level, free: pm ? pm.weaponsFree : null,
                freeFor: pm ? Math.max(0, pm.weaponsFreeUntil - pm.time) : 0, sev: crime ? crime.severity : 0, search: Traces.search,
                call: call ? { r: call.r, T: call.T, R: call.R, t: call.t } : null,
            };
        }, [style, how]);

        const bDoor = await rob('bakery', 'door');
        if (c.ok(bDoor && bDoor.started, `assaltou a padaria (${bDoor && bDoor.name})`)) {
            c.ok(bDoor.tier === 1 && bDoor.T >= 90, `padaria: a viatura leva ${bDoor.T} s para chegar (≥ 90)`);
            c.ok(bDoor.stars === 1 && bDoor.free === false, `padaria, polícia chegando na saída: ${bDoor.stars}★ e a polícia não atira (${bDoor.free ? 'atira' : 'segura o fogo'})`);
            c.ok(bDoor.sev === 2, `padaria: crime leve na ficha (gravidade ${bDoor.sev})`);
            c.ok(bDoor.search && bDoor.search.r <= 120 && bDoor.search.t <= 110, `padaria: busca curta (${bDoor.search && Math.round(bDoor.search.r)} m, ${bDoor.search && Math.round(bDoor.search.t)} s)`);
        }
        const bQuiet = await rob('bakery', 'quiet');
        if (bQuiet && bQuiet.started) c.ok(bQuiet.call && bQuiet.call.r <= 170 && bQuiet.call.R <= 120, `padaria, saiu antes de chamarem: a ligação alerta ${bQuiet.call && bQuiet.call.r} m e busca ${bQuiet.call && bQuiet.call.R} m`);
        const bFight = await rob('bakery', 'fight');
        if (bFight && bFight.started) c.ok(bFight.stars === 2 && bFight.freeFor < 1, `padaria, saindo atirando: ${bFight.stars}★ sem tiro livre extra (${bFight.freeFor.toFixed(0)} s)`);

        const iDoor = await rob('italian', 'door');
        if (c.ok(iDoor && iDoor.started, `assaltou o restaurante de luxo (${iDoor && iDoor.name})`)) {
            c.ok(iDoor.tier === 3 && iDoor.T < bDoor.T, `luxo: a polícia chega mais rápido (${iDoor.T} s < ${bDoor.T} s)`);
            c.ok(iDoor.stars === 2 && iDoor.free === true, `luxo, polícia chegando na saída: ${iDoor.stars}★ e a polícia atira`);
            c.ok(iDoor.sev === 4, `luxo: assalto à mão armada na ficha (gravidade ${iDoor.sev})`);
        }
        const iFight = await rob('italian', 'fight');
        if (iFight && iFight.started) c.ok(iFight.stars === 3 && iFight.freeFor > 25, `luxo, saindo atirando: ${iFight.stars}★ e ${iFight.freeFor.toFixed(0)} s de tiro livre`);
        c.noErrors(errors, 'assalto');
        await close();
    },
};
