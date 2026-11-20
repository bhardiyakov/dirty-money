// HUD E MENUS, CELULAR PRIMEIRO (item 6): "o que fazer agora" sempre na tela (ui/Objective.js — destino marcado com distância e seta,
// senão a próxima meta com a barrinha) embaixo, no meio; a fila de metas e o painel de missão saem no celular; UM aviso grande por vez
// (a chegada no bairro espera a faixa da meta; a faixa esconde a pílula de XP; a meta não repete a mesma frase no alto); as mensagens
// curtas embaixo; o cartão de desafios abaixo do minimapa (sem cobri-lo); no menu, as abas cabem numa linha (só o ícone, menos a aberta).
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'hud',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx, { touch: true, width: 844, height: 390 });
        page.setDefaultTimeout(0);
        const rect = (sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(), s = getComputedStyle(e); return { x: r.left, y: r.top, w: r.width, h: r.height, b: r.bottom, r: r.right, disp: s.display, vis: s.visibility, op: +s.opacity }; }, sel);
        const tick = (n = 1) => page.evaluate((n) => { for (let i = 0; i < n; i++) Objective.update(game, 1); }, n);
        await page.evaluate(() => { Tutorial.skip(); game.gps = null; });

        // --- o que fazer agora: o destino marcado
        await page.evaluate(() => { const P = game.player.position; game.setGps(P.x + 90, P.z + 40, 'Boca de fumo'); });
        await tick();
        const ch = await page.evaluate(() => { const e = document.getElementById('objChip'); return { on: e.classList.contains('on'), txt: e.textContent, arrow: getComputedStyle(e.querySelector('.oa')).display !== 'none', rot: e.querySelector('.oa').style.transform }; });
        const cr = await rect('#objChip');
        c.ok(ch.on && /Boca de fumo/.test(ch.txt) && /\d+ m/.test(ch.txt) && ch.arrow && /rotate/.test(ch.rot), `o destino na linha de baixo, com distância e seta (${ch.txt.trim()})`);
        c.ok(cr && cr.b > 390 - 60 && Math.abs(cr.x + cr.w / 2 - 422) < 30, `no celular, embaixo e no meio (${cr && Math.round(cr.x)},${cr && Math.round(cr.y)} ${cr && Math.round(cr.w)}×${cr && Math.round(cr.h)})`);
        // sem destino: a próxima meta, com a barrinha
        await page.evaluate(() => { game.gps = null; });
        await tick();
        const goal = await page.evaluate(() => { const e = document.getElementById('objChip'); return { on: e.classList.contains('on'), txt: e.textContent, bar: getComputedStyle(e.querySelector('.op')).display !== 'none' }; });
        c.ok(goal.on && /Meta/.test(goal.txt) && goal.bar, `sem destino: a próxima meta (${goal.txt.trim()})`);
        const hid = await page.evaluate(() => ({ goalBox: (() => { const e = document.getElementById('goalBox'); return !e || getComputedStyle(e).display === 'none'; })(), mission: (() => { const e = document.getElementById('hMission'); return !e || getComputedStyle(e).display === 'none'; })() }));
        c.ok(hid.goalBox && hid.mission, 'a fila de metas e o painel de missão saem no celular (o chip diz o que fazer)');

        // --- um aviso grande por vez
        const ban = await page.evaluate(() => {
            const out = {};
            Juice.banner('goal', 'Juntar R$ 9', '+R$ 1');
            Juice.update(game, 0.05);
            out.jban = document.body.classList.contains('jban');
            EmpireUI.arrive('BAIRRO TESTE', 'sub');
            const a = document.getElementById('arrive');
            out.arriveDuring = !!(a && a.classList.contains('show'));
            for (let i = 0; i < 80 && (Juice._cur || Juice._q.length); i++) Juice.update(game, 0.1);
            out.jbanAfter = document.body.classList.contains('jban');
            return out;
        });
        await page.waitForTimeout(800);
        const after = await page.evaluate(() => { const a = document.getElementById('arrive'); return !!(a && a.classList.contains('show')) && /BAIRRO TESTE/.test(a.textContent); });
        c.ok(ban.jban && !ban.jbanAfter, 'a faixa esconde a pílula de XP enquanto está no ar');
        c.ok(!ban.arriveDuring && after, 'a chegada no bairro espera a faixa sair (um aviso grande por vez)');
        // a meta batida: a faixa, sem repetir a frase no alto
        const dup = await page.evaluate(() => {
            const G = game.goals, p = G.pending().find((x) => x.key === 'money');
            if (!p) return null;
            let flashed = ''; const f = game._flash.bind(game); game._flash = (m) => { flashed += m; f(m); };
            game.inventory.addCash(p.target + 10); G._t = 0; G.update(1);
            game._flash = f;
            return { flashed, banner: Juice._q.concat(Juice._cur ? [Juice._cur] : []).some((b) => b.kind === 'goal') };
        });
        c.ok(dup && dup.banner && !/META:/.test(dup.flashed), `meta batida: a faixa, sem a mesma frase repetida no alto (${dup ? JSON.stringify(dup.flashed.slice(0, 40)) : 'sem meta'})`);

        // --- mensagens curtas embaixo; desafios do dia abaixo do minimapa
        await page.evaluate(() => game._flash('Pegou: teste'));
        const to = await rect('#toast'), mm = await rect('#minimap');
        c.ok(to && to.disp !== 'none' && to.y > 390 / 2, `no celular, as mensagens curtas ficam embaixo (y ${to && Math.round(to.y)})`);
        await page.evaluate(() => { Daily._showT = 6; Daily._card(game, true); });
        const dl = await rect('#dailyBox');
        c.ok(dl && mm && dl.y >= mm.b - 2, `desafios do dia abaixo do minimapa, sem cobri-lo (cartão em y ${dl && Math.round(dl.y)}, mapa até ${mm && Math.round(mm.b)})`);

        // --- menu: as abas cabem numa linha (só o ícone; o nome na aberta)
        const tabs = await page.evaluate(() => {
            game.menu.open('status');
            const T = [...document.querySelectorAll('.pm-tab')], last = T[T.length - 1].getBoundingClientRect(), first = T[0].getBoundingClientRect();
            const label = (t) => getComputedStyle(t.querySelector('.tl')).display !== 'none';
            const r = { n: T.length, oneRow: Math.abs(last.top - first.top) < 2, fits: last.right <= innerWidth - 50, labels: T.filter(label).map((t) => t.dataset.tab), minW: Math.min(...T.map((t) => t.getBoundingClientRect().width)), minH: Math.min(...T.map((t) => t.getBoundingClientRect().height)) };
            game.menu.close();
            return r;
        });
        c.ok(tabs.oneRow && tabs.fits, `as ${tabs.n} abas numa linha, dentro da tela`);
        c.ok(tabs.labels.length === 1 && tabs.labels[0] === 'status', `só a aba aberta mostra o nome (${tabs.labels.join(',')})`);
        c.ok(tabs.minW >= 38 && tabs.minH >= 34, `abas fáceis de tocar (${Math.round(tabs.minW)}×${Math.round(tabs.minH)} px no mínimo)`);
        c.noErrors(errors, 'hud');
        await close();
    },
};
