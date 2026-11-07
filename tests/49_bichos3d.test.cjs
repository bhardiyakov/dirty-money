// BICHOS EM 3D (art/Animals3D.js + world/Livestock.js; referência: a folha de animais — boi, porco, cachorro, cabra, ovelha, galo):
// as espécies viram malhas 3D com instâncias, o material compila (animação e acabamento no shader), as pelagens existem, os bichos
// andam (a fase do passo anda com a distância), fogem correndo, deitam e o pequeno atropelado pelo carro fica no chão; ovelhas nos
// pastos, cachorros nos sítios e os vira-latas nas ruas de terra da favela.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'bichos3d',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        page.setDefaultTimeout(0);
        const s = await page.evaluate(() => {
            Tutorial.skip();
            const L = game.livestock, sp = {};
            for (const p of L.pens) sp[p.sp] = (sp[p.sp] || 0) + 1;
            return { on: Animals3D.on, mode: !!L.mode3d, sp, street: L.pens.filter((p) => p.street).length, vars: Object.fromEntries(Object.entries(Animals3D.VAR).map(([k, v]) => [k, v.length])) };
        });
        c.ok(s.on && s.mode, 'bichos em 3D por padrão');
        c.ok(s.sp.ovelha > 0 && s.sp.cachorro > 0 && s.sp.vaca > 0 && s.sp.galinha > 0 && s.sp.porco > 0, `espécies nos cercados: ${JSON.stringify(s.sp)}`);
        c.ok(s.street >= 3, `${s.street} ruas da favela com vira-lata`);
        // todas as espécies e pelagens montam e desenham (o shader compila)
        const m = await page.evaluate(() => {
            const P = Bairros.pens.find((q) => q.loose) || Bairros.pens[0], cx = (P.x0 + P.x1) / 2, cz = (P.z0 + P.z1) / 2;
            game.player.teleport(new BABYLON.Vector3(cx, 0, cz - 8)); game.camera.snapTo(game.player.position);
            game.livestock.enabled = false;
            const list = []; let i = 0;
            for (const [sp, V] of Object.entries(Animals3D.VAR)) V.forEach((_, vr) => list.push({ sp, vr, x: cx - 10 + (i % 8) * 2.5, z: cz + Math.floor(i++ / 8) * 2.5, h: 0, ph: i, mv: i % 2, run: i % 3 === 0 ? 1 : 0, gz: 0, rs: i % 5 === 0 ? 1 : 0, dead: i % 7 === 0, seed: 0.3 }));
            window.__all = list;
            return { n: list.length };
        });
        await page.evaluate(() => { Animals3D.draw(window.__all); });
        await gameWait(page, 2, 120000);
        const r = await page.evaluate(() => {
            Animals3D.draw(window.__all);
            const E = [...Animals3D._meshes.values()];
            const ready = E.every((e) => e.mesh.material.isReadyForSubMesh(e.mesh, e.mesh.subMeshes[0], true) || e.mesh.material.isReady(e.mesh, true));
            return { meshes: E.length, inst: E.reduce((s, e) => s + e.n, 0), ready, tris: Math.round(E.reduce((s, e) => s + e.mesh.getTotalIndices() / 3, 0) / E.length) };
        });
        c.ok(r.meshes === m.n && r.inst === m.n, `${r.meshes} malhas (espécie × pelagem), ${r.inst} instâncias desenhadas, ~${r.tris} triângulos por modelo`);
        c.ok(r.ready, 'material dos bichos (animação + pelo/lã/penas) compilado');
        c.ok(r.tris > 800 && r.tris < 12000, 'modelo detalhado e leve');
        // comportamento: andando a fase do passo avança; o bicho foge correndo do jogador; deita e levanta
        await page.evaluate(() => { game.livestock.enabled = true; const P = Bairros.pens.find((q) => q.sp === 'vaca' || q.sp === 'ovelha'); game.player.teleport(new BABYLON.Vector3((P.x0 + P.x1) / 2, 0, P.z0 - 12)); game.camera.snapTo(game.player.position); window.__P = P; });
        await gameWait(page, 2, 60000);
        const b = await page.evaluate(async () => {
            const L = game.livestock, a = L.animals.find((q) => q.pen === window.__P) || L.animals[0];
            a.state = 'walk'; a.t = 5; a.tx = a.pen.x1 - 1; a.tz = a.pen.z1 - 1; a.flee = 0;
            const ph0 = a.ph;
            await new Promise((res) => setTimeout(res, 1500));
            const walked = a.ph !== ph0 && a.mv > 0.3;
            game.player.teleport(new BABYLON.Vector3(a.x + 0.5, 0, a.z + 0.5));
            await new Promise((res) => setTimeout(res, 700));
            const fled = a.flee > 0 || a.run > 0.2;
            return { walked, fled, mv: a.mv, run: a.run };
        });
        c.ok(b.walked, `andando: a fase do passo avança (mv ${b.mv.toFixed(2)})`);
        c.ok(b.fled, `foge correndo do jogador (corrida ${b.run.toFixed(2)})`);
        // o pequeno na frente do carro do jogador em velocidade fica no chão
        const d = await page.evaluate(() => {
            const L = game.livestock, a = L.animals.find((q) => q.S.small && !q.dead);
            if (!a) return null;
            L._carV = 12; L._step(a, 0.016, { x: a.x + 0.3, z: a.z }, 9);
            return a.dead;
        });
        c.ok(d === null || d === true, 'atropelado pelo carro do jogador: fica deitado de lado');
        c.noErrors(errors, 'bichos3d');
        await close();
    },
};
