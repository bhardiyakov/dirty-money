// RETORNO E RETENÇÃO (ui/Juice.js, render/ScreenFx.js, player/Daily.js, vehicle/NearMiss.js):
//   • a gradação continua o último pós-processamento, agora com o uniform dos efeitos de tela — zerados em repouso;
//   • dinheiro e XP: o número flutuante, a pílula de XP e a faixa de nível novo;
//   • DESAFIOS DO DIA: 3 por dia de verdade, pagos ao cumprir, o bônus pelos três, o cartão, o bloco no Status, ida e volta no save,
//     o dia seguinte (sequência + bônus de chegada) e o dia pulado (sequência volta ao 1);
//   • vida baixa tira a cor da tela; o impacto some sozinho; desligar em Ajustes zera tudo;
//   • raspada no trânsito: paga XP e soma a sequência; a batida zera.
const { boot, gameWait } = require('./lib.cjs');

const BONUS0 = 500;          // o menor bônus do dia (faixa de nível mais baixa): o teste roda num jogo novo

module.exports = {
    name: 'suco_desafios',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        page.setDefaultTimeout(0);
        await page.evaluate(() => { Tutorial.skip(); game.gps = null; game.player.invulnerable = true; Config.time.cycleSeconds = 1e12; });
        await gameWait(page, 1.2, 40000);

        // 1) pós-processamento e efeitos em repouso
        const pp = await page.evaluate(() => ({ names: game.camera.camera._postProcesses.filter(Boolean).map((p) => p.name), fx: [ScreenFx.speed, ScreenFx.hit, ScreenFx.hurt], set: game.menu.settings.screenFx, row: PauseMenu.SET_KEYS.includes('screenFx') }));
        c.ok(pp.names[pp.names.length - 1] === 'luzCor', `a gradação por último (${pp.names.join(' → ')})`);
        c.ok(pp.fx.every((v) => v === 0), `efeitos de tela zerados em repouso (${pp.fx})`);
        c.ok(pp.set === true && pp.row, 'Ajustes › Efeitos de tela existe e vem ligado');

        // 2) desafios do dia montados
        const d0 = await page.evaluate(() => ({ date: Daily.date, n: Daily.list.length, ids: Daily.list.map((x) => x.id), streak: Daily.streak, uniq: new Set(Daily.list.map((x) => x.id)).size, ok: Daily.list.every((x) => x.n > 0 && !x.done && Daily._def(x.id)) }));
        c.ok(d0.n === 3 && d0.uniq === 3 && d0.ok, `3 desafios diferentes para hoje (${d0.ids.join(', ')})`);
        c.ok(d0.streak === 1 && /^\d{4}-\d\d-\d\d$/.test(d0.date), `jogo novo: dia 1 da sequência (${d0.date})`);

        // 3) dinheiro e XP: flutuante, pílula e faixa de nível
        await page.evaluate(() => { window._c0 = game.inventory.cash; game.inventory.addCash(1250); game.skills.addXp(260); });
        await page.waitForFunction(() => document.getElementById('jBanner').classList.contains('in'), null, { timeout: 60000 }).catch(() => {});
        const j = await page.evaluate(() => ({ lvl: game.skills.level, ban: document.getElementById('jBanner').className, title: document.querySelector('#jBanner .t').textContent, xp: document.getElementById('jXp').classList.contains('show'), xpT: document.getElementById('jXp').textContent }));
        c.ok(j.lvl >= 2 && j.ban === 'in' && /N[íi]vel 2/i.test(j.title), `nível novo vira faixa (${j.title})`);
        c.ok(j.xp && /NV 2/.test(j.xpT) && /\+\d+ XP/.test(j.xpT), `pílula de XP na tela (${j.xpT})`);
        await gameWait(page, 1.2, 40000);                                      // (a meta de patrimônio e os desafios que o dinheiro/XP fecham já saíram)
        const fl = await page.evaluate(() => new Promise((res) => { game.inventory.addCash(300); let n = 0; const t = setInterval(() => { const e = [...document.querySelectorAll('#jFloat .cash')].map((x) => x.textContent); if (e.length || ++n > 120) { clearInterval(t); res(e); } }, 50); }));
        c.ok(fl.some((t) => /^\+R\$/.test(t)), `dinheiro ganho sobe de cima do personagem (${fl.join(' | ') || 'nada'})`);

        // 4) cumprir os desafios paga na hora; os três pagam o bônus do dia (uma vez só)
        const r = await page.evaluate(() => {
            const inv = game.inventory, k0 = inv.medkits, c0 = inv.cash, pend = Daily.list.filter((x) => !x.done), want = pend.reduce((sum, it) => sum + Daily.reward(it).cash, 0);
            for (const it of pend) it.base -= it.n;
            Daily._t = 0; Daily.update(game, 0.016);
            const out = { pend: pend.length, all: Daily.list.every((x) => x.done), total: Daily.total, bonus: Daily.bonusPaid, kits: inv.medkits - k0, cash: inv.cash - c0, want, days: Daily.daysDone };
            const c1 = inv.cash; Daily._t = 0; Daily.update(game, 0.016); out.again = inv.cash - c1;
            return out;
        });
        c.ok(r.pend >= 1 && r.all && r.total === 3, `desafios cumpridos (${r.pend} de uma vez; ${r.total} no total)`);
        c.ok(r.bonus && r.kits === 1 && r.days === 1 && r.cash >= r.want + BONUS0, `pagos na hora, mais o bônus do dia e 1 kit médico (+${r.cash}; desafios ${r.want})`);
        c.eq(r.again, 0, 'o bônus do dia só sai uma vez');

        // 5) Status: os blocos novos, com resumo
        await page.evaluate(() => game.menu.open('status'));
        await page.waitForTimeout(700);
        const st = await page.evaluate(() => [...document.querySelectorAll('#pmStatus .px')].map((b) => ({ t: (b.querySelector('.px-title') || {}).textContent || '', sum: b.dataset.sum || '', rows: b.querySelectorAll('.sr, .sb').length })));
        const dBox = st.find((b) => b.t.includes('DESAFIOS DO DIA')), sBox = st.find((b) => b.t.includes('SUA HISTÓRIA'));
        c.ok(dBox && dBox.rows >= 5 && /3\/3/.test(dBox.sum), `Status › Desafios do dia (${dBox ? dBox.sum : 'sem bloco'})`);
        c.ok(sBox && sBox.rows >= 8 && sBox.sum.length > 0, `Status › Sua história (${sBox ? sBox.sum : 'sem bloco'})`);
        await page.evaluate(() => game.menu.close());

        // 6) save: ida e volta; o dia seguinte soma a sequência e paga a chegada; pular um dia zera
        const sv = await page.evaluate(() => {
            const s = JSON.parse(JSON.stringify(SaveGame.snapshot(game))), tz = Daily.teaser(s);
            Daily.load(s.daily);
            const back = { n: Daily.list.length, done: Daily.list.filter((x) => x.done).length, streak: Daily.streak, bonus: Daily.bonusPaid, total: Daily.total, sec: Daily.L('sec') > 0 };
            const c0 = game.inventory.cash;
            Daily._fake = new Date(Date.now() + 864e5); Daily._t = 0; Daily.update(game, 0.016);
            const next = { streak: Daily.streak, paid: game.inventory.cash - c0, fresh: Daily.list.length === 3 && Daily.list.every((x) => !x.done), bonus: Daily.bonusPaid, mul: Daily.streakMul };
            Daily._fake = new Date(Date.now() + 4 * 864e5); Daily._t = 0; Daily.update(game, 0.016);
            const skip = { streak: Daily.streak, best: Daily.best };
            Daily._fake = null;
            return { has: !!s.daily, tz, back, next, skip };
        });
        c.ok(sv.has && sv.back.n === 3 && sv.back.done === 3 && sv.back.streak === 1 && sv.back.bonus && sv.back.sec, 'os desafios e os contadores vão e voltam no save');
        c.ok(/completos/.test(sv.tz), `o menu principal anuncia o dia (${sv.tz})`);
        c.ok(sv.next.streak === 2 && sv.next.paid > 0 && sv.next.fresh && !sv.next.bonus && sv.next.mul > 1, `dia seguinte: 2 dias seguidos, bônus de chegada (+${sv.next.paid}) e desafios novos`);
        c.ok(sv.skip.streak === 1 && sv.skip.best === 2, `pulou dias: a sequência volta ao 1 (recorde ${sv.skip.best})`);

        // 7) vida baixa e impacto; desligar em Ajustes zera
        await page.evaluate(() => { game.player.hp = game.player.maxHp * 0.1; game.camera.shake(0.9); });
        const hit = await page.evaluate(() => ScreenFx.hit);
        await gameWait(page, 1.5, 40000);
        const fx = await page.evaluate(() => ({ hurt: ScreenFx.hurt, hit: ScreenFx.hit }));
        c.ok(hit > 0.5 && fx.hit < hit * 0.2, `o impacto entra com a pancada e some sozinho (${hit.toFixed(2)} → ${fx.hit.toFixed(2)})`);
        c.ok(fx.hurt > 0.4, `vida baixa tira a cor da tela (${fx.hurt.toFixed(2)})`);
        await page.evaluate(() => { game.menu.settings.screenFx = false; });
        await gameWait(page, 2.5, 60000);
        const off = await page.evaluate(() => ({ hurt: ScreenFx.hurt, cops: document.getElementById('jCops').classList.contains('on') }));
        c.ok(off.hurt < 0.05 && !off.cops, `Efeitos de tela desligado: nada na tela (${off.hurt.toFixed(2)})`);
        await page.evaluate(() => { game.menu.settings.screenFx = true; game.player.hp = game.player.maxHp; });

        // 8) raspada: paga XP, soma a sequência; a batida zera
        const nm = await page.evaluate(() => {
            const b = game.vehicleManager.vehicles.find((v) => !v.isBike && !v.isBoat && !v.controlled && v.visual && v.visual.lampGeom);
            game.player.setVisible(false); b.setControlled(true); game.activeCar = b; game.mode = 'car';
            const x0 = game.skills.xp, n0 = Daily.L('nearMiss');
            NearMiss._award(game); NearMiss._award(game);
            const out = { combo: NearMiss.combo, xp: game.skills.xp - x0, n: Daily.L('nearMiss') - n0, best: Daily.L('nearBest') };
            NearMiss.onImpact();
            out.after = NearMiss.combo;
            b.setControlled(false); game.activeCar = null; game.mode = 'player'; game.player.setVisible(true);
            return out;
        });
        c.ok(nm.combo === 2 && nm.xp >= 6 && nm.n === 2 && nm.best >= 2, `raspadas pagam XP e somam (×${nm.combo}, +${nm.xp} XP)`);
        c.eq(nm.after, 0, 'bater zera a sequência de raspadas');

        await gameWait(page, 1.5, 40000);
        c.noErrors(errors, 'retorno e desafios');
        await close();
    },
};

