// VISUAL DE CONSOLE HD (PS3): imagem limpa (a TV de tubo virou opção, desligada por padrão — render/CrtFilter.js), o BRILHO DE VERDADE
// (bloom em 1/4 da resolução antes da gradação — Lighting.setBloom), o CÉU DE VERDADE na perseguição (render/SkyDome.js: degradê até a
// cor da névoa, sol, nuvens, lua e estrelas) e os carros refletindo esse céu (CarArt3D: skyZ/skyH).
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'visual_ps3',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx, { query: 'gfx=high' });
        page.setDefaultTimeout(0);
        await page.evaluate(() => {
            Tutorial.skip(); game.gps = null; game.player.invulnerable = true; Config.time.cycleSeconds = 1e12;
            game.weather.set('clear', true, true); game.weather.override = 1e9; if (game.autoQuality) game.autoQuality.off = true;
        });
        const at = (h) => page.evaluate((h) => { game.dayNight.hour = h; game.dayNight.apply(); }, h);
        await at(12);
        await gameWait(page, 1, 60000);

        // 1) a imagem limpa: sem TV de tubo, resolução do preset; a opção liga e desliga
        const crt = await page.evaluate(() => {
            const o = { on0: game.crt.enabled, lc0: !!Lighting.crt, sc0: Config.perf.renderScale, row: PauseMenu.SET_KEYS.includes('tvFilter'), set0: !!game.menu.settings.tvFilter };
            const M = game.menu; M.setRow = PauseMenu.SET_KEYS.indexOf('tvFilter'); M._setAdjust(0);
            o.on1 = game.crt.enabled; o.lc1 = !!Lighting.crt; o.sc1 = Config.perf.renderScale; o.saved = !!Store.getJSON('settings', {}).tvFilter;
            M._setAdjust(0);
            o.on2 = game.crt.enabled; o.sc2 = Config.perf.renderScale;
            return o;
        });
        c.ok(!crt.on0 && !crt.lc0 && crt.sc0 === 1 && crt.row && !crt.set0, `sem TV de tubo por padrão, resolução cheia do preset (escala ${crt.sc0})`);
        c.ok(crt.on1 && crt.lc1 && Math.abs(crt.sc1 - 0.75) < 1e-6 && crt.saved, `Ajustes › Filtro de TV antiga liga o tubo (escala ${crt.sc1}) e fica salvo`);
        c.ok(!crt.on2 && crt.sc2 === 1, 'e desliga de volta');

        // 2) o brilho de verdade: três passadas pequenas logo antes da gradação, que lê a cena da entrada delas
        const bl = await page.evaluate(() => {
            const names = game.camera.camera._postProcesses.filter(Boolean).map((p) => p.name), B = Lighting.bloomFx;
            return { names, on: !!B, opt: Lighting.grade._options, ext: B && [B.ext.width, B.ext.height], q: B && [B.bh.width, B.bh.height], k: B && B.k, preset: Config.perf.bloom };
        });
        const n = bl.names, i = n.indexOf('luzBrilhoEx');
        c.ok(bl.on && bl.preset && i >= 0 && n[i + 1] === 'luzBrilhoH' && n[i + 2] === 'luzBrilhoV' && n[i + 3] === 'luzCor' && n[n.length - 1] === 'luzCor', `brilho antes da gradação (${n.join(' → ')})`);
        c.ok(bl.opt === 0.25 && bl.q && Math.abs(bl.q[0] - bl.ext[0] / 4) <= 1, `o brilho em 1/4 (${bl.q && bl.q.join('×')} de ${bl.ext && bl.ext.join('×')}), sem escrita de tela cheia a mais`);

        // a imagem: à noite o brilho clareia em volta das luzes (média da tela mais alta com ele do que sem ele)
        await at(22);
        await gameWait(page, 1, 60000);
        const lum = await page.evaluate(async () => {
            const eng = game.gameEngine.engine, w = eng.getRenderWidth(), h = eng.getRenderHeight();
            const L = async () => { game.scene.render(); const d = await eng.readPixels(0, 0, w, h); let s = 0, n = 0; for (let i = 0; i < d.length; i += 16) { s += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; n++; } return s / n; };
            const kN = Lighting.bloomFx.k, on = await L();
            Lighting.setBloom(false);
            const names = game.camera.camera._postProcesses.filter(Boolean).map((p) => p.name), opt = Lighting.grade._options;
            const off = await L();
            Lighting.setBloom(true);
            return { on, off, kN, names, opt, back: !!Lighting.bloomFx };
        });
        c.ok(lum.kN > bl.k, `de noite o brilho é mais forte (${bl.k.toFixed(2)} de dia → ${lum.kN.toFixed(2)})`);
        c.ok(lum.on > lum.off, `à noite as luzes vazam em volta (média da tela ${lum.off.toFixed(1)} → ${lum.on.toFixed(1)} com o brilho)`);
        c.ok(!lum.names.some((x) => /Brilho/.test(x)) && lum.opt === 1 && lum.back, 'desligar tira as passadas e a gradação volta a ler a cena; religa');

        // 3) o céu: domo na perseguição, com o horizonte = a névoa; as cores seguem a hora
        await at(12);
        await gameWait(page, 1.2, 60000);
        const sky = await page.evaluate(() => {
            const D = SkyDome, f = game.scene.fogColor;
            return { has: !!D.mesh, on: D.on, en: D.mesh && D.mesh.isEnabled(), chase: CompassCamera.chase, hor: D.hor.slice(), fog: [f.r, f.g, f.b], zen: D.zen.slice(), sun: D.sunVis, night: D.night, sunY: D.sunDir[1], carH: CarArt3D._u ? CarArt3D._u.h.w : -1 };
        });
        c.ok(sky.has && sky.chase >= 0.5 && sky.on && sky.en, `domo do céu ligado na perseguição (perseguição ${sky.chase.toFixed(2)})`);
        c.ok(sky.hor.every((v, k) => Math.abs(v - sky.fog[k]) < 0.003), `o horizonte do céu é a cor da névoa (${sky.hor.map((v) => v.toFixed(2))})`);
        c.ok(sky.zen[2] > sky.zen[0] && sky.zen[2] < sky.hor[2] + 0.05 && sky.sun > 0.9 && sky.sunY > 0.8 && sky.night < 0.05, `meio-dia: zênite azul-fundo, sol alto e visível (sol ${sky.sunY.toFixed(2)})`);
        c.ok(sky.carH === 1, 'os carros refletem o céu da hora');
        await at(18.3);
        const dusk = await page.evaluate(() => ({ sunY: SkyDome.sunDir[1], vis: SkyDome.sunVis, lit: SkyDome.cloudLit.slice() }));
        c.ok(dusk.sunY < 0.2 && dusk.sunY > -0.05 && dusk.lit[0] > dusk.lit[2] + 0.1, `fim de tarde: o sol no horizonte e as nuvens alaranjadas (sol ${dusk.sunY.toFixed(2)})`);
        await at(23);
        const night = await page.evaluate(() => ({ zen: SkyDome.zen.slice(), vis: SkyDome.sunVis, night: SkyDome.night }));
        c.ok(night.night > 0.95 && night.vis === 0 && night.zen.every((v) => v < 0.08), 'noite: céu escuro, sem sol (lua e estrelas)');
        await page.evaluate(() => { game.weather.set('storm', true, true); game.dayNight.hour = 12; game.dayNight.apply(); });
        const storm = await page.evaluate(() => ({ cover: SkyDome.cover, vis: SkyDome.sunVis }));
        c.ok(storm.cover > 0.8 && storm.vis < 0.1, `tempo fechado: o céu cobre (nuvens ${storm.cover.toFixed(2)}) e o sol some`);
        await page.evaluate(() => { game.weather.set('clear', true, true); game.dayNight.apply(); });

        // fora da perseguição (dentro de um interior): o domo sai
        const ins = await page.evaluate(async () => {
            const want = typeof Interiors !== 'undefined';
            Interiors.active = Interiors.active || { fake: true }; SkyDome.frame(game, game.camera.camera);
            const off = SkyDome.mesh.isEnabled();
            if (Interiors.active && Interiors.active.fake) Interiors.active = null;
            SkyDome.frame(game, game.camera.camera);
            return { want, off, back: SkyDome.mesh.isEnabled() };
        });
        c.ok(!ins.off && ins.back, 'num interior o domo sai, e volta na rua');
        c.noErrors(errors, 'visual');
        await close();
    },
};
