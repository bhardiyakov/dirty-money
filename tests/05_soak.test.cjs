// Longa duração: deixa a cidade rodando (favela de dia, favela à noite, centro no rush) e procura o que só aparece jogando:
//   • buzina repetida no mesmo lugar (mais de 6 em 15 s de jogo — o bug dos mototáxis "buzinando sem fim")
//   • mototáxi travado à vista (> 15 s parado), entregador travado (> 25 s), carro do trânsito travado à vista (> 60 s)
//   • posição NaN (jogador, pedestre, veículo) e erros de JavaScript
// SOAK_SECONDS = segundos de JOGO por cenário (padrão 240; --quick usa 60).
const { boot, gameWait } = require('./lib.cjs');

const SCENES = [
    { name: 'favela de dia', hour: 14, where: 'favela' },
    { name: 'favela à noite (baile)', hour: 22.5, where: 'favela' },
    { name: 'centro no rush', hour: 18, where: 'city' },
];

module.exports = {
    name: 'soak',
    async run(ctx, c) {
        const secs = +(process.env.SOAK_SECONDS || 240);
        const { page, errors, close } = await boot(ctx);
        await page.evaluate(() => {
            const S = window.__soak = { honks: [], issues: {}, t: 0 };
            const o = AudioFX.honk.bind(AudioFX);
            AudioFX.honk = (x, z, pitch, ...a) => { S.honks.push([window.__gt || 0, x, z, pitch]); return o(x, z, pitch, ...a); };
            const issue = (k, msg) => { if (!S.issues[k]) S.issues[k] = msg; };
            const bad = (p) => !p || !isFinite(p.x) || !isFinite(p.z);
            setInterval(() => {
                if (!window.game || !game.player || Interiors.active) return;
                const P = game.player.position, d = (p) => Math.hypot(p.x - P.x, p.z - P.z), gt = window.__gt || 0;
                if (bad(P)) issue('nan-player', 'posição do jogador inválida (NaN)');
                for (const n of game.npcManager ? game.npcManager.npcs : []) if (n.alive && bad(n.position)) issue('nan-npc', 'pedestre com posição NaN');
                for (const v of game.vehicleManager ? game.vehicleManager.vehicles : []) {
                    if (bad(v.position)) { issue('nan-car', 'veículo com posição NaN'); continue; }
                    if (v.courier && (v.courier.stuckT || 0) > 25 && d(v.position) < 70) issue('courier:' + v.id, `entregador travado ${Math.round(v.courier.stuckT)} s em (${Math.round(v.position.x)}, ${Math.round(v.position.z)})`);
                    if (v.mode === 'drive' && !v.controlled && !v.courier && (v.blocked || 0) > 60 && d(v.position) < 60) issue('car:' + v.id, `carro do trânsito travado ${Math.round(v.blocked)} s em (${Math.round(v.position.x)}, ${Math.round(v.position.z)})`);
                }
                for (const m of game.motoTaxis ? game.motoTaxis.list : []) if (!m.down && (m.blk || 0) > 15 && Math.hypot(m.x - P.x, m.z - P.z) < 55) issue('moto:' + m.x.toFixed(0), `mototáxi travado ${Math.round(m.blk)} s à vista em (${Math.round(m.x)}, ${Math.round(m.z)})`);
                // buzina repetida: o MESMO veículo (cada um tem o seu tom — pitch) mais de 6 vezes no mesmo lugar (célula de 8 u) em 15 s de
                // jogo. Vários veículos travados juntos (ponto de mototáxi, cruzamento) buzinam cada um no máximo 2 vezes: não é o bug.
                S.honks = S.honks.filter((h) => gt - h[0] < 15);
                const cell = {};
                for (const [, x, z, pitch] of S.honks) { const k = Math.round(x / 8) + ',' + Math.round(z / 8) + '~' + (+pitch || 1).toFixed(3); cell[k] = (cell[k] || 0) + 1; if (cell[k] > 6) issue('honk:' + k, `buzina repetida: ${cell[k]} buzinadas em 15 s perto de (${Math.round(x)}, ${Math.round(z)})`); }
            }, 500);
        });
        // o detector funciona? 8 buzinas falsas no mesmo ponto têm que ser acusadas (e depois a lista é zerada)
        await page.evaluate(() => { window.__gt = window.__gt || 0; for (let k = 0; k < 8; k++) AudioFX.honk(99999, 99999, 1, 0.1); });
        await page.waitForTimeout(1500);
        c.ok(await page.evaluate(() => Object.keys(window.__soak.issues).some((k) => k.startsWith('honk:'))), 'o detector de buzina repetida acusa um caso de teste');
        await page.evaluate(() => { window.__soak.issues = {}; window.__soak.honks = []; });
        for (const S of SCENES) {
            await page.evaluate((S) => {
                game.dayNight.hour = S.hour;
                let p;
                if (S.where === 'favela') { p = SafeHouse.spawnWorld(); p = { x: p.x + 6, z: p.z }; }
                else { Interiors.index(); const d = Interiors._doors.find((q) => q.style === 'mart' && game.empire.districtAt(q.x, q.z) === 'centro') || Interiors._doors[0]; p = { x: d.x, z: d.z }; }
                game.player.teleport(new BABYLON.Vector3(p.x, 0, p.z)); game.camera.snapTo(p);
            }, S);
            const ran = await gameWait(page, secs, secs * 9000);
            const n = await page.evaluate(() => ({ npcs: game.npcManager.npcs.length, cars: game.vehicleManager.vehicles.filter((v) => v.mode === 'drive').length, motos: game.motoTaxis.list.length, couriers: game.vehicleManager.vehicles.filter((v) => v.courier).length }));
            c.note(`${S.name}: ${Math.round(ran)} s de jogo · ${n.npcs} pedestres · ${n.cars} carros andando · ${n.motos} mototáxis · ${n.couriers} entregadores`);
            c.noErrors(errors, S.name);
        }
        const issues = await page.evaluate(() => Object.values(window.__soak.issues));
        for (const i of issues) c.ok(false, i);
        await close();
    },
};
