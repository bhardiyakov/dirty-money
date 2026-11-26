// Troca de roupa na hora (sem 2,5D — o personagem é o boneco 3D montado da ficha, src/art/Char3D.js): uma roupa de FORMA nova (regata
// em vez de camiseta) vira um modelo 3D novo em poucos segundos, sem desenhar atlas nenhum (nada de atlas ao vivo, nada de páginas); trocar
// de novo no meio entra o modelo mais novo; voltar à roupa de sempre também.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'roupa',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx, { outside: false });
        await gameWait(page, 1);
        const st = () => page.evaluate(() => {
            const P = game.player.char3d, M = P && P.model;
            return { sig: Char3D._pSig, model: M && M.mid, ready: !!(M && M.ready), next: Char3D._pNext && Char3D._pNext.mid, shown: !!(P && P.shown),
                tris: M && M.tris, live: !!PlayerLook.live, want: PlayerLook.want, pages: Object.values(NpcArt.atlases).reduce((n, A) => n + A.pages.filter((p) => p.tex || p.st === 'queued').length, 0),
                liveAtlas: Object.keys(NpcArt.atlases).some((k) => /^hero:live/.test(k)) };
        });
        const s0 = await st();
        c.ok(s0.shown && s0.ready && s0.tris > 3000, `o jogador é o boneco 3D (${s0.tris} triângulos)`);
        // regata: forma nova — um modelo 3D novo, em segundo plano, que entra quando fica pronto (sem piscar)
        const t0 = Date.now();
        await page.evaluate(() => { Outfit.owned.add('regata_academia'); Outfit.wear('regata_academia'); });
        await page.waitForFunction((m0) => { const P = game.player.char3d; return !!(P && P.model && P.model.mid !== m0 && P.model.ready && P.model === Char3D._pNext); }, s0.model, { timeout: 90000 }).catch(() => {});
        const dt = (Date.now() - t0) / 1000, s1 = await st();
        c.note(`roupa nova no personagem em ${dt.toFixed(1)} s`);
        c.ok(s1.model !== s0.model && s1.ready && s1.shown && s1.sig !== s0.sig && dt < 30, `com a roupa nova em ${dt.toFixed(1)} s (modelo ${s0.model} → ${s1.model})`);
        c.ok(!s1.live && !s1.want && s1.pages === 0 && !s1.liveAtlas, 'nenhum desenho 2,5D: sem atlas ao vivo, sem páginas, nada para o guarda-roupa desenhar');
        // trocou de novo: entra o modelo mais novo
        await page.evaluate(() => { Outfit.owned.add('moletom_capuz'); Outfit.wear('moletom_capuz'); });
        await page.waitForFunction((m1) => { const P = game.player.char3d; return !!(P && P.model && P.model.mid !== m1 && P.model.ready && P.model === Char3D._pNext); }, s1.model, { timeout: 90000 }).catch(() => {});
        const s2 = await st();
        c.ok(s2.model !== s1.model && s2.ready && s2.shown, `trocar de novo entra o modelo mais novo (${s1.model} → ${s2.model})`);
        // de volta à roupa de sempre
        await page.evaluate(() => Outfit.wear('camiseta_branca'));
        await page.waitForFunction((m2) => { const P = game.player.char3d; return !!(P && P.model && P.model.mid !== m2 && P.model.ready); }, s2.model, { timeout: 90000 }).catch(() => {});
        await gameWait(page, 0.5);
        const s3 = await st();
        c.ok(s3.model !== s2.model && s3.shown && !s3.live && s3.pages === 0, 'a roupa de sempre volta, também em 3D e sem desenho 2,5D');
        c.noErrors(errors, 'roupa');
        await close();
    },
};
