// ANIMAÇÕES DE REAÇÃO E TRANSIÇÃO (polimento): clipes novos do gerador (NpcGenAnims — hurt_b/l/r, leap, limp) que os atlas 2,5D ainda
// não têm: a folha (NpcSheet.ONLY3D) entrega o clipe com o nome e o tempo do novo, desenhado em 2,5D pelo parecido; o boneco 3D pede o de
// verdade ao Worker do gerador. Golpe/tiro: a reação pelo lado de onde veio (o tiro no jogador agora faz cambalear — antes a posição do
// atirador desligava a animação). O pedestre que sai da frente do carro usa o pulo; o jogador muito ferido anda mancando.
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'animacoes',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        page.setDefaultTimeout(0);
        const sh = await page.evaluate(() => {
            Tutorial.skip(); Config.time.cycleSeconds = 1e12; game.player.invulnerable = false;
            const out = {}, P = game.player, S = P.actor.sheet;
            for (const k of ['hurt_b', 'hurt_l', 'hurt_r', 'leap', 'limp']) { const x = S.getClip(k, 'none'); out[k] = x ? { name: x.name, npc: !!x.npc, as: x.only3d, loop: x.loop, dur: +(x.frames / x.fps).toFixed(2) } : null; }
            const n = game.npcManager.npcs.find((m) => m.alive && m.actor && m.actor.sheet && m.actor.sheet.isNpc);
            const nl = n && n.actor.sheet.getClip('leap', 'none');
            out.npc = n ? !!(nl && nl.npc && nl.name === 'leap') : null;
            const H = (dx, dz) => NpcSheet.hurtClip(0, dx, dz);
            out.dir = { frente: H(0, 5), costas: H(0, -5), direita: H(5, 0), esquerda: H(-5, 0) };
            return out;
        });
        c.ok(['hurt_b', 'hurt_l', 'hurt_r', 'leap', 'limp'].every((k) => sh[k] && sh[k].name === k && sh[k].as) && ['hurt_b', 'hurt_l', 'hurt_r', 'limp'].every((k) => sh[k].npc), `a folha entrega os 5 clipes novos (2,5D pelo parecido: ${['hurt_b', 'leap', 'limp'].map((k) => `${k}→${sh[k] && sh[k].as}`).join(', ')})`);
        c.ok(sh.hurt_b.dur === 0.5 && sh.leap.dur === 0.64 && sh.limp.loop, `no tempo dos novos (golpe ${sh.hurt_b.dur} s, pulo ${sh.leap.dur} s, mancar em loop)`);
        c.ok(sh.npc === true, 'pedestres também (o pulo no desenho dos pedestres, para o boneco 3D)');
        c.eq(JSON.stringify(sh.dir), JSON.stringify({ frente: 'hurt', costas: 'hurt_b', direita: 'hurt_r', esquerda: 'hurt_l' }), 'a reação pelo lado de onde veio o golpe');

        // --- o boneco 3D do jogador recebe o clipe novo do gerador (Worker) e o mostra
        const r3 = await page.evaluate(async () => {
            const P = game.player, A = P.char3d;
            if (!A || !A.model) return { skip: true };
            P.root.rotation.y = 0;
            P.takeDamage(1, { x: P.position.x, z: P.position.z - 6 });          // tiro pelas costas
            const act = P.action && P.action.name;
            let K;
            for (let i = 0; i < 100; i++) { K = A.model.clip('hurt_b:none'); if (K && K !== 'wait') break; await new Promise((r) => setTimeout(r, 200)); }
            return { act, k: K && typeof K === 'object' ? K.n : K };
        });
        c.ok(r3.act === 'hurt_b', `tiro pelas costas: o jogador cambaleia para a frente (${r3.act}) — antes, tiro não fazia cambalear`);
        if (!r3.skip) c.ok(r3.k === 6, `o boneco 3D recebeu o "golpe por trás" do gerador (${r3.k} quadros)`);

        // --- pedestre: golpe pelo lado; pulando da frente do carro
        const np = await page.evaluate(() => {
            const P = game.player.position, out = {};
            const L = game.npcManager.npcs.filter((m) => m.alive && !m.rag && !m.free && m.index >= 0 && !m._rage).sort((a, b) => Math.hypot(a.position.x - P.x, a.position.z - P.z) - Math.hypot(b.position.x - P.x, b.position.z - P.z));
            const n = L[0], m = L[1] || L[0];
            n.heading = n.transform.rotation.y = 0;
            n.hurt(new BABYLON.Vector3(n.position.x + 3, 0, n.position.z));      // pela direita dele
            n.update(1 / 30);
            out.side = n.actor.clip && n.actor.clip.name;
            m.dodge(1, 0, { x: m.position.x - 5, z: m.position.z }, 2.2);
            m.update(1 / 30);
            out.leap = m.actor.clip && m.actor.clip.name;
            return out;
        });
        c.ok(np.side === 'hurt_r', `pedestre acertado pela direita: dobra para o outro lado (${np.side})`);
        c.ok(np.leap === 'leap', `pedestre saindo da frente do carro: o pulo de lado (${np.leap})`);

        // --- o jogador muito ferido anda mancando; com vida, anda normal
        const lp = await page.evaluate(() => {
            const P = game.player, inp = game.input, keep = inp.getMoveAxis;
            P.action = null; P.weapon = 'none'; game.player.invulnerable = true;
            inp.getMoveAxis = () => ({ x: 0, z: 0.4 });                         // analógico pouco inclinado: anda
            inp.analog.x = 0; inp.analog.z = 0.4;
            // (o clipe enquanto ele anda de fato: uma parede no caminho o para)
            const walk = (hp) => { P.hp = P.maxHp * hp; const seen = {}; for (let i = 0; i < 24; i++) { game._update(1 / 30); if (P.speed > 0.5 && P.actor.clip) seen[P.actor.clip.name] = (seen[P.actor.clip.name] || 0) + 1; } return Object.keys(seen).sort((a, b) => seen[b] - seen[a])[0]; };
            const out = { hurt: walk(0.2), ok: walk(1) };
            inp.analog.z = 0;
            inp.getMoveAxis = keep;
            return out;
        });
        c.ok(lp.hurt === 'limp' && lp.ok === 'walk', `muito ferido manca (${lp.hurt}); com vida, anda (${lp.ok})`);
        c.noErrors(errors, 'animacoes');
        await close();
    },
};
