// Celular deitado (toque): HUD sem sobreposição, ✕ nas janelas, menu com acordeão.
const { boot } = require('./lib.cjs');

const overlap = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

module.exports = {
    name: 'mobile',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx, { touch: true, width: 844, height: 390 });
        c.ok(await page.evaluate(() => document.body.classList.contains('mobile')), 'modo celular ligado');
        // avisos de rastro e o 📱 não podem cobrir os atalhos do topo
        await page.evaluate(() => { game.heat.fileEvidence('armed_robbery'); Traces.desc = Object.assign(Traces.sig(), { until: Traces.now() + 48 }); Phone._gen_taunt(); });
        await page.waitForTimeout(2500);
        const R = await page.evaluate(() => { const r = (id) => { const e = document.getElementById(id); if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; }; return { top: r('tcTop'), chips: r('traceChips'), badge: r('phoneBadge'), hud: r('hud2') }; });
        c.ok(R.top, 'atalhos do topo visíveis');
        c.ok(!overlap(R.top, R.chips), 'avisos de rastro não cobrem os atalhos');
        c.ok(!overlap(R.top, R.badge), 'o 📱 não cobre os atalhos');
        c.ok(!overlap(R.hud, R.chips), 'avisos de rastro não cobrem o HUD');
        // SPRINT (como no GTA San Andreas: o padrão é trotar): botão próprio a pé, sem cobrir os outros; um toque rápido já dá impulso
        const SP = await page.evaluate(() => {
            const r = (e) => { const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; };
            const run = document.getElementById('tcRun'), on = (e) => e && !e.classList.contains('hide') && e.getClientRects().length > 0;
            return { vis: on(run), box: run && r(run), others: [...document.querySelectorAll('.tcb')].filter((e) => e !== run && on(e)).map((e) => Object.assign(r(e), { id: e.id })) };
        });
        c.ok(SP.vis, 'botão SPRINT visível a pé');
        const cover = SP.box ? SP.others.filter((o) => overlap(SP.box, o)).map((o) => o.id) : [];
        c.ok(SP.box && !cover.length, `o SPRINT não cobre os outros botões (${cover.join(', ')})`);
        if (SP.vis) {
            await page.touchscreen.tap((SP.box.left + SP.box.right) / 2, (SP.box.top + SP.box.bottom) / 2);
            const k = await page.waitForFunction(() => game.input.sprint > 0.3 && game.input.sprint, null, { timeout: 4000 }).then((h) => h.jsonValue()).catch(() => 0);
            c.ok(k > 0.3, `um toque no SPRINT dá impulso (${(+k).toFixed(2)})`);
        }
        // ✕ nas janelas
        await page.evaluate(() => { Phone.toggle(true); });
        await page.waitForTimeout(700);
        c.ok(await page.evaluate(() => !!document.querySelector('#phone > .mx-close')), 'celular tem ✕');
        await page.evaluate(() => document.querySelector('#phone > .mx-close').click());
        c.ok(await page.evaluate(() => !Phone.open), 'o ✕ fecha o celular');
        await page.evaluate(() => { game.inventory.cash = 5000; Economy.day = 13; game.dayNight.hour = 10; Calendar.betPanel(game); });
        await page.waitForTimeout(400);
        c.ok(await page.evaluate(() => { const x = document.querySelector('#calBet .mx-close'); return !!x && x.getClientRects().length > 0; }), 'painel tem ✕ visível');
        await page.evaluate(() => document.querySelector('#calBet .mx-close').click());
        c.ok(await page.evaluate(() => !Calendar._bp.open), 'o ✕ fecha o painel');
        // menu: acordeão no Status
        await page.evaluate(() => game.menu.open('status'));
        await page.waitForTimeout(800);
        const A = await page.evaluate(() => [...document.querySelectorAll('#pmStatus .acc-h')].map((h) => ({ closed: h.parentElement.classList.contains('acc-closed'), sum: (h.querySelector('.acc-sum') || {}).textContent || '' })));
        c.ok(A.length >= 8, `blocos do Status em acordeão (${A.length})`);
        c.ok(A.length && !A[0].closed && A.slice(1).every((a) => a.closed), 'no celular: só o primeiro aberto');
        c.ok(A.slice(1).every((a) => a.sum.trim().length > 0), 'todo bloco fechado tem resumo');
        await page.evaluate(() => document.querySelectorAll('#pmStatus .acc-h')[1].click());
        await page.waitForTimeout(800);                        // (o Status redesenha a cada 0,5 s: o estado tem que sobreviver)
        c.ok(await page.evaluate(() => !document.querySelectorAll('#pmStatus .px')[1].classList.contains('acc-closed')), 'toque abre o bloco e ele continua aberto após redesenhar');
        await page.evaluate(() => game.menu.close());
        c.noErrors(errors, 'celular');
        await close();
    },
};
