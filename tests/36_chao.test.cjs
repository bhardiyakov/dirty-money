// CHÃO com as fotos CC0 (etapa 3 do upgrade visual; art/GroundPhotos.js): por padrão, o chão pintado do CityHD com o grão das fotos
// e o relevo delas (mapa de normais como bumpTexture dos materiais do chão). `?chao=0` = o chão só pintado de antes.
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'chao',
    async run(ctx, c) {
        const look = () => {
            const M = game.gameEngine.world.mats, kinds = ['road', 'sidewalk', 'grass', 'sand', 'concrete', 'dirt', 'rock'];
            const bump = kinds.filter((k) => M[k] && M[k].bumpTexture), ready = kinds.filter((k) => M[k] && M[k].bumpTexture && M[k].bumpTexture.isReady());
            return { on: GroundPhotos.on, mixed: GroundPhotos.mixed, relief: GroundPhotos.relief, photos: Object.keys(GroundPhotos.imgs).length, nors: Object.keys(GroundPhotos.nors).length, bump, ready, total: kinds.length };
        };
        const a = await boot(ctx);
        const d = await a.page.evaluate(look);
        c.ok(d.on && !d.mixed && d.relief, 'padrão: chão realista — a foto como base + relevo (`?chao=misto` = o pintado com o grão)');
        c.ok(d.photos >= 9 && d.nors >= 9, `fotos CC0 carregadas (${d.photos} cores, ${d.nors} relevos)`);
        c.ok(d.bump.length === d.total && d.ready.length === d.total, `relevo nos materiais do chão (${d.bump.join(', ')})`);
        c.noErrors(a.errors, 'chão com fotos');
        await a.close();
        const b = await boot(ctx, { query: 'chao=0' });
        const o = await b.page.evaluate(look);
        c.ok(!o.on && o.photos === 0 && o.bump.length === 0, '?chao=0: o chão só pintado de antes, sem baixar as fotos');
        c.noErrors(b.errors, 'chão sem fotos');
        await b.close();
    },
};
