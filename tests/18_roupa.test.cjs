// Troca de roupa na hora (Wardrobe + NpcArt.liveAtlas): uma roupa de FORMA nova (regata em vez de camiseta) é desenhada em segundo plano
// e o jogador já a veste enquanto ela é desenhada — o clipe que ele está tocando chega primeiro, num atlas ao vivo; trocar de novo no
// meio descarta o atlas anterior; voltar à roupa de sempre volta aos atlas prontos.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'roupa',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx, { outside: false });
        await gameWait(page, 1);
        const live = () => page.evaluate(() => {
            const a = game.player.actor, L = PlayerLook.live, A = L && NpcArt.atlases[L.id];
            return { id: L && L.id, clip: a.clip && a.clip.atlas, drawn: !!(a._pg && L && a._pg.A.id === L.id && a._pg.tex), clips: A ? Object.keys(A.data.clips) : [],
                chain: game.sprites.sheets.hero.atlasList(), want: PlayerLook.want, workers: Wardrobe.ws.length };
        });
        // o armário abre o Equipamento: os Workers já ficam prontos (a partida a frio do gerador)
        await page.evaluate(() => { game.menu.open('inventory'); game.menu.setInvView('equip'); });
        c.ok(await page.evaluate(() => Wardrobe.active && Wardrobe.ws.length > 0), 'a tela de equipamento liga e aquece os Workers do guarda-roupa');
        await page.waitForTimeout(8000);
        const t0 = Date.now();
        await page.evaluate(() => { Outfit.owned.add('regata_academia'); Outfit.wear('regata_academia'); game.menu.close(); });
        await page.waitForFunction(() => { const a = game.player.actor, L = PlayerLook.live; return !!(L && a._pg && a._pg.A.id === L.id && a._pg.tex); }, null, { timeout: 90000 }).catch(() => {});
        const dt = (Date.now() - t0) / 1000, s1 = await live();
        c.note(`roupa nova no personagem em ${dt.toFixed(1)} s`);
        c.ok(s1.drawn && s1.clip === s1.id && dt < 15, `com a roupa nova em ${dt.toFixed(1)} s (< 15 s no Chromium por software), sem esperar o visual inteiro (atlas ao vivo ${s1.id}, clipe ${s1.clip})`);
        c.ok(s1.chain[0] === s1.id && !!s1.want, 'a folha do jogador procura primeiro no atlas ao vivo enquanto o visual é desenhado');
        c.ok(s1.workers > 0, 'fora da tela o guarda-roupa continua desenhando, em segundo plano');
        await page.waitForFunction(() => { const A = PlayerLook.live && NpcArt.atlases[PlayerLook.live.id]; return !!(A && A.data.clips['walk:none'] && A.data.clips['run:none']); }, null, { timeout: 180000 }).catch(() => {});
        const s2 = await live();
        c.note(`andar e correr ao vivo em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
        c.ok(s2.clips.includes('walk:none') && s2.clips.includes('run:none'), `andar e correr chegam logo depois (${s2.clips.length} clipes ao vivo)`);
        // andou para outra direção: a direção que ainda não foi desenhada mostra a mais próxima já pronta (nunca some)
        const turned = await page.evaluate(() => { const a = game.player.actor; a.setHeading(a.heading + Math.PI); a._applyUV(); return { vis: a.mesh.isVisible, pg: !!(a._pg && a._pg.tex) }; });
        c.ok(turned.vis && turned.pg, 'virando para trás o personagem continua desenhado');
        // trocou de novo no meio: o atlas ao vivo anterior sai, o novo entra
        await page.evaluate(() => { Outfit.owned.add('moletom_capuz'); Outfit.wear('moletom_capuz'); });
        await page.waitForFunction((old) => PlayerLook.live && PlayerLook.live.id !== old && !NpcArt.atlases[old] && game.sprites.sheets.hero.atlasList()[0] === PlayerLook.live.id, s2.id, { timeout: 30000 }).catch(() => {});
        const s3 = await live();
        c.ok(s3.id && s3.id !== s2.id && s3.chain[0] === s3.id && !s3.chain.includes(s2.id), `trocar de novo no meio descarta o atlas ao vivo anterior (${s2.id} → ${s3.id}; folha ${s3.chain.join(',')})`);
        // de volta à roupa de sempre: os atlas prontos, sem atlas ao vivo
        await page.evaluate(() => Outfit.wear('camiseta_branca'));
        await page.waitForFunction(() => !PlayerLook.live && !PlayerLook.want, null, { timeout: 30000 }).catch(() => {});
        await gameWait(page, 0.5);
        const s4 = await live();
        c.ok(!s4.id && !s4.want && s4.chain[0] === 'protagonista' && !(await page.evaluate(() => Object.keys(NpcArt.atlases).some((k) => /^hero:live/.test(k)))), 'a roupa de sempre volta aos atlas prontos e o atlas ao vivo sai da memória');
        c.noErrors(errors, 'roupa');
        await close();
    },
};
