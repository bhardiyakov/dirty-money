// Gente dentro das lojas (world/ShopLife): com a loja lotada (clientes no máximo da capacidade), a fila tem no máximo 3 pessoas (o do
// caixa e mais 2), nenhum lugar da fila fica perto da porta, ninguém passa muito tempo parado na porta (quem entra e quem sai passam
// um pelo outro; antes travavam: 4, 5 pessoas paradas na saída por 40 s), ninguém fica travado atrás de alguém e os corpos de quem
// está na porta não fecham a saída para o jogador.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'lojas',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        await page.evaluate(() => {
            Tutorial.skip(); game.dayNight.hour = 12.5; game.player.invulnerable = true;
            ShopLife.targetCustomers = function () { return Economy.isOpen(this.shop.style, this.game.dayNight.hour) ? this.capacity() : 0; };
        });
        for (const style of ['burger', 'mart']) {
            const name = await page.evaluate((st) => {
                Interiors.index();
                const d = Interiors._doors.find((s) => s.style === st);
                if (!d) return null;
                game.dayNight.hour = 12.5; game.player.teleport(new BABYLON.Vector3(d.x, 0, d.z)); Interiors.enter(game, d);
                return d.name || d.style;
            }, style);
            if (!c.ok(!!name, `achou uma loja ${style}`)) continue;
            await page.waitForFunction(() => Interiors.active && !Interiors.busy && ShopLife.active, null, { timeout: 60000 }).catch(() => {});
            const lay = await page.evaluate(() => {
                const S = ShopLife, P = S.points, D = P.door;
                return { slots: P.queue.length + 1, nearDoor: P.queue.filter((q) => Math.hypot(q.x - D.x, q.z - D.z) < S.DOOR_CLEAR).length };
            });
            c.ok(lay.slots <= 3 && lay.nearDoor === 0, `${name}: fila de no máximo 3 lugares, nenhum perto da porta (${lay.slots} lugares)`);
            // amostra a cada 0,5 s de jogo (no próprio laço do jogo)
            await page.evaluate(() => {
                const m = window.__m = { q: 0, doorT: 0, blocked: 0, body: 0, n: 0 }, inDoor = new Map(), o = Interiors.STAGE;
                let acc = 0;
                const upd = ShopLife.update.bind(ShopLife);
                ShopLife.update = (dt, g) => {
                    upd(dt, g);
                    if (!ShopLife.active || (acc += dt) < 0.5) return;
                    acc = 0;
                    const S = ShopLife, D = S.points.door, cust = S.agents.filter((a) => a.role === 'customer' && a.state !== 'gone' && a.fade > 0.3);
                    m.q = Math.max(m.q, S.queue.length); m.n = Math.max(m.n, cust.length);
                    for (const a of cust) {
                        const t = S.inDoorway(a) && a.z > 0.35 ? (inDoor.get(a) || 0) + 0.5 : 0;
                        inDoor.set(a, t); m.doorT = Math.max(m.doorT, t);
                        if ((a.blockedT || 0) > 5) m.blocked++;
                    }
                    // corpo de cliente na porta, como obstáculo do jogador?
                    for (const b of Interiors.obstacles) if (b.person && Math.hypot((b.x0 + b.x1) / 2 - o.x - D.x, (b.z0 + b.z1) / 2 - o.z - D.z) < S.DOOR_CLEAR - 0.3) m.body++;
                };
                window.__restore = () => { ShopLife.update = upd; };
            });
            await gameWait(page, 45, 240000);
            const m = await page.evaluate(() => { window.__restore(); return window.__m; });
            c.ok(m.q <= 3, `${name}: lotada (${m.n} clientes), a fila não passou de 3 (máx ${m.q})`);
            c.ok(m.doorT <= 6, `${name}: ninguém fica na porta (o máximo foi ${m.doorT.toFixed(1)} s)`);
            c.ok(m.blocked === 0, `${name}: ninguém travado atrás de alguém (${m.blocked} amostras com alguém parado há mais de 5 s)`);
            c.ok(m.body === 0, `${name}: nenhum cliente fecha a saída para o jogador (${m.body})`);
            await page.evaluate(() => Interiors.leave(game));
            await page.waitForFunction(() => !Interiors.active && !Interiors.busy, null, { timeout: 60000 }).catch(() => {});
        }
        c.noErrors(errors, 'lojas');
        await close();
    },
};
