// LUTA (combat/Combat.js, Game._onAttack, Config.melee): o golpe AVANÇA até o alvo (a 2,4 m o soco acerta), TRAVA nele e o chute de
// um pedestre não derruba o jogador com a vida cheia. `?luta=0`: a luta de antes (o soco no ar).
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'luta',
    async run(ctx, c) {
        const setup = (d) => {
            Tutorial.skip(); Config.time.cycleSeconds = 1e12; game.dayNight.hour = 13; game.dayNight.apply();
            const p = game.player.position, n = game.npcManager.npcs.filter((m) => m.alive && !m.rag && !m.free && m.index >= 0 && m.state === 'WANDER')
                .sort((a, b) => Math.hypot(a.position.x - p.x, a.position.z - p.z) - Math.hypot(b.position.x - p.x, b.position.z - p.z))[0];
            n.setSpeed(0); n.fsm.setState({ name: 'IDLE', update() {} });         // (parado: o teste mede o avanço do jogador)
            game.player.teleport(new BABYLON.Vector3(n.position.x - d, 0, n.position.z));
            game.player.root.rotation.y = Math.PI / 2;
            window._foe = n;
            return n.hp;
        };
        const punch = () => { game._tryPrimary(); };
        const hp = () => { const n = window._foe; return { hp: n.hp, d: Math.hypot(n.position.x - game.player.position.x, n.position.z - game.player.position.z) }; };
        const a = await boot(ctx);
        const h0 = await a.page.evaluate(setup, 2.4);
        await gameWait(a.page, 0.2);
        await a.page.evaluate(punch);
        await gameWait(a.page, 0.6);
        const r = await a.page.evaluate(hp);
        c.ok(r.hp < h0, `a 2,4 m o soco avança e acerta (vida ${h0} → ${r.hp}, distância ${r.d.toFixed(2)} m)`);
        const k = await a.page.evaluate(() => {
            const p = game.player; p.hp = p.maxHp;
            game.combat._land({ who: { position: window._foe.position }, M: Melee.kick, kind: 'kick', dmgMul: 0.75, source: 'npc', onHit: null }, p, p.position.x, p.position.z);
            return { rag: !!p.rag, hp: p.hp };
        });
        c.ok(!k.rag && k.hp < 100, `o chute de um pedestre machuca (vida ${Math.round(k.hp)}) mas não derruba com a vida cheia`);
        c.noErrors(a.errors, 'luta');
        await a.close();
        const b = await boot(ctx, { query: 'luta=0' });
        const h1 = await b.page.evaluate(setup, 2.4);
        await gameWait(b.page, 0.2);
        await b.page.evaluate(punch);
        await gameWait(b.page, 0.6);
        const o = await b.page.evaluate(hp);
        c.ok(o.hp === h1, `?luta=0: a luta de antes (a 2,4 m o soco não chega: vida ${o.hp})`);
        c.noErrors(b.errors, 'luta de antes');
        await b.close();
    },
};
