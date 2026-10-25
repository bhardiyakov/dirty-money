// Sistemas do mundo vivo, chamados direto (rápido): celular, arco do Dentinho, testemunhas e batida, calendário, personagens,
// desmanche, livro-caixa e o save de tudo isso.
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'systems',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);

        // celular: mensagens que chegam e respostas
        const ph = await page.evaluate(() => {
            game.inventory.cash = 50000; Standing.heat = 50;
            for (const k of ['invite', 'loan', 'job', 'warn', 'challenge']) Phone['_gen_' + k](game);
            const acts = []; for (const who of Object.keys(Phone.threads)) for (const m of Phone.threads[who]) if (m.actions && !m.done) { Phone._act(m, m.actions[0].act); acts.push(who + ':' + m.done); }
            return { acts, appts: Phone.appts.length, jobs: Phone.jobs.length };
        });
        c.ok(ph.acts.length >= 4 && ph.acts.every((a) => a.endsWith('true')), `respostas do celular (${ph.acts.join(' ')})`);
        c.ok(ph.appts >= 1 && ph.jobs === 1, 'compromisso e entrega aceitos');

        // arco do Dentinho: começa, abre boca, estoura, confronto, rendição e sociedade
        const arc = await page.evaluate(() => {
            Economy.day = 6; Phone.rival.l = 1; RivalArc._maybeStart(game);
            const out = { phase1: RivalArc.phase, bocas: RivalArc.alive().length };
            const b = RivalArc.bocas[0]; b.G = { x: b.x, z: b.z, size: b.size, members: [], active: true, boca: b };
            RivalArc._raze(game, b); out.razed = RivalArc.razed; out.phase2 = RivalArc.phase;
            RivalArc.razed = 3; for (const q of RivalArc.bocas) q.razed = true; RivalArc._checkFinale(game); out.phase3 = RivalArc.phase; out.qg = !!RivalArc.qg;
            RivalArc._resolve(game, 'partner'); out.outcome = RivalArc.outcome; out.partnerBocas = RivalArc.alive().length;
            return out;
        });
        c.eq(arc.phase1, 1, 'Dentinho entra no crime'); c.ok(arc.bocas >= 1, 'abre uma boca');
        c.eq(arc.phase2, 2, 'estourar a boca declara guerra'); c.ok(arc.qg && arc.phase3 === 3, 'confronto marcado no galpão');
        c.eq(arc.outcome, 'partner', 'virar sócio'); c.ok(arc.partnerBocas >= 1, 'sócio reabre bocas');

        // testemunhas: o crime gera testemunha; a ligação abre a área de busca; batida em casa (com mandado na ficha)
        const wit = await page.evaluate(() => {
            const n = game.npcManager.npcs.find((q) => q.alive && !q.rag);
            if (!n) return { skip: true };
            Traces.search = null;
            WorldMemory.crime('holdup', n.position.x + 1, n.position.z);
            const got = Witnesses.list.length;
            for (const W of Witnesses.list) W.t = 0;
            Witnesses.update(game, 0.1); Traces.update(0.1, game);
            const search = !!Traces.search;
            game.heat.record.clear();
            for (let i = 0; i < 3; i++) game.heat.fileEvidence(i % 2 ? 'homicide' : 'armed_robbery');
            let k = 0; while (!Witnesses.raid && k++ < 60) Witnesses.onNewDay();
            game.stash.boxes.safe.cash = 10000; Witnesses.raid.day = Economy.day; Witnesses.raid.h = 0; Witnesses.update(game, 0.1);
            const out = { got, search, safe: game.stash.boxes.safe.cash, raid: Witnesses.raid, possession: game.heat.record.crimes.some((c) => c.type === 'possession') };
            game.heat.record.clear(); game.heat.update(0.1);
            return out;
        });
        if (wit.skip) c.note('sem pedestre por perto para testar testemunhas');
        else c.ok(wit.search || wit.got === 0, 'a ligação da testemunha abre a área de busca');
        c.ok(wit.safe < 10000 && !wit.raid, 'batida leva dinheiro do cofre');
        c.ok(wit.possession, 'o que a batida acha vai para a ficha (posse)');

        // calendário: agenda, jogo, aposta
        const cal = await page.evaluate(() => {
            Economy.day = 9; game.dayNight.hour = 12;
            const up = Calendar.upcoming(7).map((e) => e.id);
            Economy.day = 13;
            Calendar.bets = []; game.inventory.cash = 5000; Calendar._sel = 'home'; Calendar.betPanel(game); Calendar._bet(game, 'amt', 1000); Calendar._bp.close();
            game.dayNight.hour = 16.5; Calendar._matchUpdate(game, 0.1, 16.5, 13); const live = !!Calendar.tvLive();
            Calendar._matchUpdate(game, 0.1, 18.1, 13);
            return { up, bet: Calendar.bets.length === 0 && Calendar.match && Calendar.match.over, live };
        });
        c.ok(cal.up.includes('jogo') && cal.up.includes('junina'), `agenda (${cal.up.join(',')})`);
        c.ok(cal.live, 'placar ao vivo'); c.ok(cal.bet, 'aposta resolvida no fim do jogo');

        // personagens: lugares, conversa, número
        const per = await page.evaluate(() => {
            const A = Personas._anchors(game) || {};
            return { anchors: Object.keys(A) };
        });
        c.ok(per.anchors.length >= 4, `personagens têm lugar no mapa (${per.anchors.join(',')})`);

        // desmanche: carro comprado não
        const chop = await page.evaluate(() => {
            const C = game.careers.by.chop, car = game.vehicleManager.vehicles.find((v) => !v.isBike && !v.isBoat);
            const mine = Object.create(car); mine.ownedRec = { uid: 1 };
            return { mine: C.owned(mine), stolen: C.owned(car) };
        });
        c.ok(chop.mine && !chop.stolen, 'desmanche distingue carro comprado de roubado');

        // save: tudo volta igual
        const sv = await page.evaluate(() => {
            const s = JSON.parse(JSON.stringify(SaveGame.snapshot(game)));
            const before = { arc: RivalArc.outcome, bets: Calendar.bets.length, phone: Object.keys(Phone.threads).length, v: s.v };
            SaveGame.apply(game, s);
            return { before, after: { arc: RivalArc.outcome, bets: Calendar.bets.length, phone: Object.keys(Phone.threads).length }, keys: ['phone', 'ledger', 'rivalArc', 'witnesses', 'calendar', 'personas'].filter((k) => !(k in s)) };
        });
        c.ok(!sv.keys.length, `save tem todas as seções (faltam: ${sv.keys.join(',') || 'nenhuma'})`);
        c.eq(JSON.stringify(sv.after), JSON.stringify({ arc: sv.before.arc, bets: sv.before.bets, phone: sv.before.phone }), 'salvar e carregar mantém o estado');

        // versão do save: um save antigo (v1) é convertido sem perder nada; um de versão futura não é tocado
        const mig = await page.evaluate(() => {
            const s = JSON.parse(JSON.stringify(SaveGame.snapshot(game))); s.v = 1; delete s.tutorial; const cash = s.inventory.cash;
            const u = SaveGame.upgrade(JSON.parse(JSON.stringify(s)));
            const applied = SaveGame.apply(game, JSON.parse(JSON.stringify(s)));
            return { v: u && u.v, latest: SaveGame.VERSION, tut: u && u.tutorial && u.tutorial.done, keptCash: u && u.inventory.cash === cash, applied, future: SaveGame.upgrade({ v: 999 }), noV: !!SaveGame.upgrade({ inventory: {} }) };
        });
        c.eq(mig.v, mig.latest, 'save antigo convertido para a versão atual');
        c.ok(mig.keptCash && mig.applied, 'save antigo carrega com o progresso intacto');
        c.ok(mig.tut, 'save antigo não recebe as missões de introdução');
        c.ok(mig.future === null && mig.noV, 'save de versão futura fica intocado; save sem versão é tratado como v1');

        c.noErrors(errors, 'sistemas');
        await close();
    },
};
