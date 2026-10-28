// Interiores em alta definição (art/InteriorHD*.js): todas as salas (lojas, casas, bancos, joalheria e o esconderijo) são repintadas
// sem erro, num quadro Q vezes maior que a pixel art, em tempo razoável — e a repintura não muda NADA do jogo: sólidos, pontos de uso,
// onde se entra, assentos, mesas e balcões saem iguais com e sem o HD (o layout é o mesmo motor). Também entra numa loja de verdade
// (a textura sai do quadro HD) e volta à pixel art com Config.art.interiorHD = false.
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'interiores',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        const r = await page.evaluate(() => {
            const styles = ['burger', 'mart', 'pharmacy', 'clothes', 'bakery', 'gym', 'bar', 'pizza', 'fit', 'italian', 'japanese', 'guns', 'drugs',
                'home_simple', 'home_apto', 'home_cobertura', 'home_mansion', 'bank_branch', 'bank_hq', 'jewelry'];
            const sig = (d) => JSON.stringify({ obs: d.obs, uses: d.uses, spawn: d.spawn, door: d.door, life: d.life, clerk: d.clerk, patrons: d.patrons });
            const get = (st, v, lvl = 0, empty = false) => { const d = ShopStyles.get(st, v, lvl, empty); delete ShopStyles._cache[ShopStyles.key(st, v, lvl, empty)]; return d; };
            const out = { rooms: 0, diff: [], small: [], worst: 0, worstName: '', errs: [] };
            for (const st of styles) for (const v of [0, 1, 2, 3, 4]) {
                if (/^bank_hq|^bank_branch/.test(st) && v > 2) continue;
                try {
                    Config.art.interiorHD = true;
                    const t = performance.now(), hd = get(st, v), ms = InteriorHD.lastMs || 0;
                    Config.art.interiorHD = false;
                    const px = get(st, v);
                    out.rooms++;
                    if (sig(hd) !== sig(px)) out.diff.push(st + v);
                    if (!hd.canvas.hd || hd.canvas.w < px.canvas.w * 2 || hd.canvas.h < px.canvas.h * 2) out.small.push(`${st}${v} ${hd.canvas.w}×${hd.canvas.h}`);
                    if (ms > out.worst) { out.worst = ms; out.worstName = st + v; }
                    void t;
                } catch (e) { out.errs.push(st + v + ': ' + e.message); }
            }
            // casas reformadas e vazias
            for (const [st, lvl, empty] of [['home_simple', 2, false], ['home_apto', 3, false], ['home_mansion', 0, true]]) {
                try { Config.art.interiorHD = true; const hd = get(st, 1, lvl, empty); Config.art.interiorHD = false; const px = get(st, 1, lvl, empty); out.rooms++; if (sig(hd) !== sig(px)) out.diff.push(`${st} r${lvl}${empty ? ' vazia' : ''}`); }
                catch (e) { out.errs.push(st + ': ' + e.message); }
            }
            Config.art.interiorHD = true;
            const sh = HouseView.stageRoom();
            out.safe = { hd: !!sh.canvas.hd, w: sh.canvas.w };
            return out;
        });
        c.ok(!r.errs.length, `todas as salas pintam sem erro (${r.errs.slice(0, 3).join(' | ')})`);
        c.ok(r.rooms >= 90, `${r.rooms} salas repintadas`);
        c.ok(!r.diff.length, `o HD não muda o layout (sólidos, usos, entrada, assentos): ${r.diff.length ? 'difere em ' + r.diff.join(', ') : 'igual em todas'}`);
        c.ok(!r.small.length, `quadro HD pelo menos 2× maior que a pixel art (${r.small.slice(0, 3).join(', ')})`);
        c.ok(r.worst < 4000, `a sala mais cara pinta em ${Math.round(r.worst)} ms (${r.worstName})`);
        c.note(`sala mais cara: ${r.worstName} ${Math.round(r.worst)} ms`);
        c.ok(r.safe.hd && r.safe.w > 400, `esconderijo em HD (${r.safe.w} px de largura)`);
        // dentro do jogo: entra numa pizzaria (textura do quadro HD) e volta
        const shop = await page.evaluate(() => {
            Interiors.index();
            const d = Interiors._doors.find((s) => s.style === 'pizza');
            game.dayNight.hour = 13; game.player.teleport(new BABYLON.Vector3(d.x, 0, d.z)); Interiors.enter(game, d);
            return d.name;
        });
        await page.waitForFunction(() => Interiors.active && !Interiors.busy, null, { timeout: 60000 });
        const tex = await page.evaluate(() => { const t = Interiors.active.room.mesh.material.diffuseTexture, s = t.getSize(); return { w: s.width, h: s.height, cls: t.getClassName() }; });
        c.ok(tex.w > 800 && tex.h > 600, `${shop}: textura do piso em alta (${tex.w}×${tex.h}, ${tex.cls})`);
        await page.evaluate(() => Interiors.leave(game));
        await page.waitForFunction(() => !Interiors.active && !Interiors.busy, null, { timeout: 60000 });
        c.noErrors(errors, 'interiores');
        await close();
    },
};
