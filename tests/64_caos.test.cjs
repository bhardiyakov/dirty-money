// A RUA COM VIDA PRÓPRIA (npc/Chaos.js) e MAIS PEDESTRES: o esbarrão vira bate-boca e briga; toda briga junta uma RODA (torcendo,
// filmando, preocupados) que se desfaz quando a polícia chega; na correria, quem foge DERRUBA quem está parado; as figuras — o bêbado
// (anda torto), a dança (contagia), o desmaio (junta gente, um ajoelha), o dinheiro voando (todo mundo corre para pegar).
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'caos',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        page.setDefaultTimeout(0);
        await page.evaluate(() => { Tutorial.skip(); Config.time.cycleSeconds = 1e12; game.player.invulnerable = true; Weather.cur.set('clear', true, true); game.dayNight.hour = 15; if (game.dayNight.apply) game.dayNight.apply(); Chaos._figT = 1e9; });

        // ------------------------------------------------------------------ mais gente na rua
        const cnt = await page.evaluate(() => ({ cfg: Config.npc.count, n: game.npcManager.npcs.length, level: Graphics.level }));
        const base = { low: 36, medium: 50, high: 72, hd: 72 }[cnt.level] || 36;
        c.ok(cnt.cfg >= Math.round(base * 1.4) && cnt.n >= cnt.cfg, `mais pedestres: ${cnt.cfg} no gráfico ${cnt.level} (eram ${base}); ${cnt.n} na cidade`);

        // perto de gente (as cenas acontecem em volta do jogador)
        await page.evaluate(() => {
            const g = game, L = g.npcManager.npcs.filter((n) => Chaos._calm(n));
            let best = null, bc = -1;
            for (const n of L.slice(0, 60)) { const k = L.filter((m) => Math.hypot(m.position.x - n.position.x, m.position.z - n.position.z) < 25).length; if (k > bc) { bc = k; best = n; } }
            if (best) g.player.teleport(new BABYLON.Vector3(best.position.x + 6, 0, best.position.z));
        });

        // (fim da cena: todo mundo volta a andar e o jogador vai para outro grupo de gente — as figuras precisam de plateia)
        const regroup = () => page.evaluate(() => {
            const g = game;
            for (const n of g.npcManager.npcs) if (n.alive && !n.rag && n.fsm && /^(FIGHT|WATCH|ARGUE|DANCE|DRUNK|FAINT|GRAB|FLEE)$/.test(n.fsm.name)) { n._ring = null; n.toWander(); }
            Chaos.rings.length = 0;
            const L = g.npcManager.npcs.filter((n) => Chaos._calm(n)), P = g.player.position;
            let best = null, bc = -1;
            for (const n of L.slice(0, 80)) { const k = L.filter((m) => Math.hypot(m.position.x - n.position.x, m.position.z - n.position.z) < 25).length; if (k > bc && Math.hypot(n.position.x - P.x, n.position.z - P.z) > 15) { bc = k; best = n; } }
            if (best) g.player.teleport(new BABYLON.Vector3(best.position.x + 7, 0, best.position.z));
            // (sem polícia por perto: ela desfaz a roda — isso tem o teste próprio)
            const Q = g.player.position;
            for (const o of g.policeManager.officers) if (o.alive && o.index >= 0 && Math.hypot(o.position.x - Q.x, o.position.z - Q.z) < 90) { const p = new BABYLON.Vector3(Q.x + 400, 0, Q.z + 400); o.transform.position.copyFrom(p); o.nav.crowd.agentTeleport(o.index, p); }
            return bc;
        });
        // ------------------------------------------------------------------ esbarrão → bate-boca → briga → roda
        await regroup();
        const bump = await page.evaluate(() => {
            const g = game, P = g.player.position, L = g.npcManager.npcs.filter((n) => Chaos._calm(n)).sort((a, b) => Math.hypot(a.position.x - P.x, a.position.z - P.z) - Math.hypot(b.position.x - P.x, b.position.z - P.z));
            const a = L[0], b = L[1];
            if (!a || !b) return null;
            const q = new BABYLON.Vector3(a.position.x + 0.8, 0, a.position.z);                  // (trombaram: lado a lado)
            b.transform.position.copyFrom(q); b.nav.crowd.agentTeleport(b.index, q);
            const keepR = Math.random, keepF = Chaos.fighter, seq = [0.9, 0.05, 0.5];
            Math.random = () => (seq.length ? seq.shift() : 0.5); Chaos.fighter = () => true;      // (não pediu desculpa; vai brigar)
            Chaos._bump(g, a, b);
            Math.random = keepR; Chaos.fighter = keepF;
            const out = { argue: a.fsm.name === 'ARGUE' && b.fsm.name === 'ARGUE', fight: a.fsm.current.fight };
            for (let i = 0; i < 80 && a.fsm.name === 'ARGUE'; i++) { a.fsm.update(0.1); b.fsm.update(0.1); }
            out.fought = a.fsm.name === 'FIGHT' && b.fsm.name === 'FIGHT';
            window.__ab = [a, b];
            return out;
        });
        if (c.ok(!!bump, 'dois pedestres por perto')) {
            c.ok(bump.argue && bump.fight, 'esbarraram: param e batem boca');
            c.ok(bump.fought, 'e saem no braço (um era de briga)');
        }
        const ring = await page.evaluate(() => {
            const g = game, P = g.player.position;
            const r0 = Chaos.stats.rings;
            Chaos._fights(g, P);
            const R = Chaos.rings.find((r) => r.kind === 'fight' && [...r.members].some((m) => window.__ab.includes(m)));
            if (!R) return { none: true, r0, rn: Chaos.stats.rings };
            window.__ring = R;
            // (a briga fica parada no lugar enquanto a roda chega: o teste olha a roda, não a luta)
            for (const m of R.members) if (m.fsm.current) { m.fsm.current.update = function () {}; m.setSpeed(0); }
            return { n: R.watchers.size, modes: [...R.watchers].map((w) => w.fsm.current && w.fsm.current.mode) };
        });
        if (!ring.none) await gameWait(page, 13, 300000);
        Object.assign(ring, await page.evaluate(() => {
            const R = window.__ring;
            if (!R) return {};
            const W = [...R.watchers].filter((w) => w.fsm.current && w.fsm.current.ring === R), c = R.center();
            const clips = W.map((w) => w.actor.clip && w.actor.clip.name);
            const facing = c ? W.filter((w) => { const d = Math.atan2(c.x - w.position.x, c.z - w.position.z) - w.heading; return Math.cos(d) > 0.3; }).length : 0;
            // quem já parou na roda: a pose do papel dele
            const POSE = { cheer: ['cheer', 'handsup'], film: ['phone'], worried: ['idle', 'idle_look'], help: ['kneel'] };
            const still = W.filter((w) => w.fsm.current.still), posed = still.filter((w) => (POSE[w.fsm.current.mode] || []).includes(w.actor.clip && w.actor.clip.name));
            return { clips, facing, staying: W.length, still: still.length, posed: posed.length, stillModes: still.map((w) => w.fsm.current.mode + ':' + (w.actor.clip && w.actor.clip.name)) };
        }));
        if (c.ok(!ring.none && ring.n >= 2, `a briga juntou uma roda (${ring.n || 0} pessoas)`)) {
            c.ok(ring.modes.some((m) => m === 'cheer') || ring.modes.some((m) => m === 'film'), `uns torcem, outros filmam (${ring.modes.join(', ')})`);
            c.ok(ring.still >= 1 && ring.posed === ring.still, `quem parou na roda faz a pose do seu papel (${(ring.stillModes || []).join(', ')})`);
            c.ok(ring.facing >= Math.ceil(ring.staying / 2), `de frente para a briga (${ring.facing}/${ring.staying})`);
        }
        const cops = await page.evaluate(() => {
            const g = game, R = window.__ring, pm = g.policeManager;
            if (!R || !R.center()) return null;
            const o = pm.officers.find((u) => u.alive && !u.rag && u.index >= 0);
            if (!o) return null;
            const C = R.center();
            o.transform.position.set(C.x + 8, 0, C.z); o.nav.crowd.agentTeleport(o.index, new BABYLON.Vector3(C.x + 8, 0, C.z));
            Chaos._fights(g, g.player.position);
            const W = [...R.watchers];
            return { fled: W.filter((w) => w.fsm.name === 'FLEE').length, n: W.length };
        });
        if (cops) c.ok(cops.fled >= Math.ceil(cops.n / 2), `a polícia chegou: a roda se desfaz (${cops.fled}/${cops.n} correram)`);
        await regroup();

        // ------------------------------------------------------------------ dominó na correria
        const dom = await page.evaluate(() => {
            const g = game, P = g.player.position, L = g.npcManager.npcs.filter((n) => Chaos._calm(n)).sort((a, b) => Math.hypot(a.position.x - P.x, a.position.z - P.z) - Math.hypot(b.position.x - P.x, b.position.z - P.z));
            const r = L[0], v = L[1];
            if (!r || !v) return null;
            r.panic(new BABYLON.Vector3(r.position.x - 5, 0, r.position.z), true);
            v.transform.position.set(r.position.x + 0.5, 0, r.position.z); v.nav.crowd.agentTeleport(v.index, v.transform.position.clone());
            const keepV = Chaos._vel, keepR = Math.random;
            Chaos._vel = (n) => (n === r ? { x: 4.5, z: 0 } : keepV.call(Chaos, n));
            Math.random = () => 0.1;
            Chaos._domCd = 0;
            Chaos._domino(g, P);
            Chaos._vel = keepV; Math.random = keepR;
            return { flee: r.fsm.name, down: !!v.rag, stats: Chaos.stats.dominos };
        });
        if (dom) c.ok((dom.flee === 'FLEE' || dom.flee === 'RAG') && dom.down && dom.stats >= 1, `na correria, quem foge derruba quem está parado (${JSON.stringify(dom)})`);

        // ------------------------------------------------------------------ as figuras
        await regroup();
        const fig = await page.evaluate(() => {
            const g = game, out = {};
            const f = Chaos.start('faint');
            out.faint = f && f.fsm.name === 'FAINT';
            const FR = Chaos.rings.find((r) => r.kind === 'faint');
            out.helper = !!FR && [...FR.watchers].some((w) => w.fsm.current && w.fsm.current.mode === 'help');
            const dn = Chaos.start('dance');
            out.dance = dn && dn.fsm.name === 'DANCE';
            out.danceRing = Chaos.rings.some((r) => r.kind === 'dance');
            const d = Chaos.start('drunk');
            out.drunk = d && d.fsm.name === 'DRUNK' && d._drunk;
            window.__fig = { d, dn, f };
            return out;
        });
        c.ok(fig.drunk, 'o bêbado começa a andar torto');
        c.ok(fig.dance && fig.danceRing, 'alguém começa a dançar no meio da rua (e outros param para ver)');
        c.ok(fig.faint && fig.helper, 'alguém desmaia: junta gente e um se ajoelha para ajudar');
        await gameWait(page, 2.5, 120000);
        const figClips = await page.evaluate(() => {
            const { d, dn, f } = window.__fig;
            return { drunk: d && d.actor.clip && d.actor.clip.name, dance: dn && dn.actor.clip && dn.actor.clip.name, faint: f && f.actor.clip && f.actor.clip.name };
        });
        c.ok(/walk_drunk|idle|walk/.test(figClips.drunk || '') && figClips.dance === 'dance' && /lie|hurt_b|hurt/.test(figClips.faint || ''), `as poses: bêbado ${figClips.drunk}, dançando ${figClips.dance}, desmaiado ${figClips.faint}`);

        // dinheiro voando: as notas no chão e todo mundo correndo para pegar
        await regroup();
        const cash = await page.evaluate(() => {
            const g = game, n0 = g.pickups.items.length;
            for (const k of ['__ab']) for (const m of window[k] || []) if (m.alive && m.fsm.name !== 'WANDER') m.toWander();
            const ow = Chaos.start('cash');
            if (!ow) return null;
            const E = Chaos.cash;
            return { notes: E.items.length, grabbers: E.grabbers.length, states: E.grabbers.filter((m) => m.fsm.name === 'GRAB').length, added: g.pickups.items.length - n0 };
        });
        if (c.ok(!!cash && cash.notes >= 5 && cash.added >= 5, `dinheiro voando: ${cash && cash.notes} notas no chão`)) {
            c.ok(cash.grabbers >= 2 && cash.states === cash.grabbers, `${cash.grabbers} pedestres correm para pegar`);
            await gameWait(page, 9, 240000);
            const got = await page.evaluate(() => ({ grabs: Chaos.stats.grabs, left: Chaos.cash ? Chaos.cash.items.filter((it) => Chaos.alive(it)).length : 0 }));
            c.ok(got.grabs >= 1, `pegaram notas (${got.grabs}; sobraram ${got.left})`);
        }
        c.noErrors(errors, 'caos');
        await close();
    },
};
