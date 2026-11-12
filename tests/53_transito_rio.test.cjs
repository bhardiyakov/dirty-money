// TRÂNSITO DO RIO (world/RioTraffic.js — estudo em docs/transito-rio.md): binários de mão única nas ruas locais, sem esquerda da avenida
// para a rua, viagens com destino (rota de menor tempo, pelas avenidas) e o pico pendular. Confere a malha (ninguém isolado), as rotas,
// que o trânsito não anda na contramão, que o GPS respeita a mão e a sinalização (tracejado branco, setas, sentido proibido).
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'transito_rio',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        page.setDefaultTimeout(0);
        const st = await page.evaluate(() => {
            Tutorial.skip(); game.player.invulnerable = true; Config.time.cycleSeconds = 1e12;
            const E = RoadPlan.edges, ow = E.filter((e) => e.oneway);
            const base = RioTraffic._scc(false), iso = RioTraffic._isolated(base).size;
            const twoWayAve = E.filter((e) => (e.cls === 'ave' || e.cls === 'hwy' || e.cls === 'fav') && e.oneway).length;
            // binário: ruas paralelas vizinhas da grade reta da cidade em sentidos opostos
            const lines = new Map();
            for (const e of ow) if (!e.free && e.cls === 'city') { const k = (e.v ? 'v' : 'h') + (e.v ? e.a.x : e.a.z); if (!lines.has(k)) lines.set(k, Math.sign(e.oneway * (e.v ? e.b.z - e.a.z : e.b.x - e.a.x))); }
            const xs = [...lines.keys()].filter((k) => k[0] === 'v').map((k) => +k.slice(1)).sort((a, b) => a - b);
            let pairs = 0, opp = 0;
            for (let i = 0; i + 1 < xs.length; i++) { if (xs[i + 1] - xs[i] > 90) continue; pairs++; if (lines.get('v' + xs[i]) !== lines.get('v' + xs[i + 1])) opp++; }
            // viagens
            let ok = 0, n = 0, aveShare = 0;
            for (let i = 0; i < 120; i++) {
                const l = RoadNet.randomLanePoint(14); if (!l || l.e.cls === 'trail') continue; n++;
                const t = RioTraffic.trip(l.e, l.fwd, l.point.x, l.point.z); if (!t) continue; ok++;
                const L = t.reduce((s, e) => s + e.len, 0), A = t.reduce((s, e) => s + (e.cls === 'ave' || e.cls === 'hwy' || e.cls === 'bridge' ? e.len : 0), 0); aveShare += A / (L || 1);
            }
            // nenhuma manobra de rota sai pela contramão nem vira à esquerda da avenida para a rua
            let bad = 0;
            for (let i = 0; i < 60; i++) {
                const l = RoadNet.randomLanePoint(14); if (!l) continue;
                const t = RioTraffic.trip(l.e, l.fwd, l.point.x, l.point.z); if (!t) continue;
                let e = l.e, fwd = l.fwd;
                for (const nx of t) { const node = fwd ? e.b : e.a; if (!RioTraffic.canLeave(nx, node)) bad++; fwd = nx.a === node; e = nx; }
            }
            // GPS: anda só a favor da mão
            let gpsBad = 0;
            for (let i = 0; i < 20; i++) {
                const a = RoadNet.randomLanePoint(14), b = RoadNet.randomLanePoint(14); if (!a || !b) continue;
                const r = Gps.route(a.point, b.point);
                for (let k = 2; k + 2 < r.pts.length; k++) {
                    const p = r.pts[k], q = r.pts[k + 1], mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2, d = Math.hypot(q.x - p.x, q.z - p.z);
                    if (d < 6) continue;
                    const np = RoadPlan.nearestRoadPoint(mx, mz, 2); if (!np || !np.edge.oneway) continue;
                    const dot = ((q.x - p.x) * np.tx + (q.z - p.z) * np.tz) / d;
                    if (Math.abs(dot) > 0.9 && (dot > 0) !== (np.edge.oneway > 0)) gpsBad++;
                }
            }
            game.dayNight.hour = 8; const pkM = RioTraffic.peak(); game.dayNight.hour = 18; const pkT = RioTraffic.peak(); game.dayNight.hour = 3; const night = RioTraffic.densityMul();
            game.dayNight.hour = 13; game.dayNight.apply();
            return { stats: RioTraffic.stats, ow: ow.length, iso, twoWayAve, pairs, opp, trips: ok / (n || 1), aveShare: aveShare / (ok || 1), bad, gpsBad, pkM, pkT, night, deco: { noEntry: StreetDetail.stats.noEntry || 0, laneW: !!RoadArt.DECAL.laneW } };
        });
        c.ok(st.ow > 500, `${st.ow} trechos de rua local em mão única (${st.stats.onewayLen} u)`);
        c.ok(st.iso === 0, `nenhum trecho isolado pela mão única (${st.iso}; ${st.stats.reverted} voltaram a mão dupla)`);
        c.ok(st.twoWayAve === 0, 'avenidas, rodovias e a favela seguem de mão dupla');
        c.ok(st.pairs > 4 && st.opp === st.pairs, `binários: ruas paralelas vizinhas em sentidos opostos (${st.opp}/${st.pairs})`);
        c.ok(st.trips > 0.97, `viagens com rota: ${(st.trips * 100).toFixed(0)}%`);
        c.ok(st.aveShare > 0.25, `as rotas usam as avenidas (${(st.aveShare * 100).toFixed(0)}% do caminho em avenida/rodovia/ponte)`);
        c.ok(st.bad === 0, `nenhuma rota pela contramão (${st.bad})`);
        c.ok(st.gpsBad === 0, `o GPS respeita a mão (${st.gpsBad} trechos contra)`);
        c.ok(st.pkM === 'centro' && st.pkT === 'bairros' && st.night < 0.5, `pico pendular: 8h → ${st.pkM}, 18h → ${st.pkT}; madrugada ${st.night}× o trânsito`);
        c.ok(st.deco.noEntry > 50 && st.deco.laneW, `sinalização: ${st.deco.noEntry} placas de sentido proibido e o tracejado branco`);

        // o trânsito rodando: ninguém na contramão
        await page.evaluate(() => {
            window.__wrong = 0; window.__checks = 0;
            window.__iv = setInterval(() => {
                for (const car of game.vehicleManager.vehicles) {
                    if (car.mode !== 'drive' || car.controlled || !car.route || car.route.goal || car.ignoreSignals) continue;
                    const v = car.phys && car.phys.getLinearVelocity(); if (!v) continue;
                    const sp = Math.hypot(v.x, v.z); if (sp < 2) continue;
                    const q = RoadPlan.nearestRoadPoint(car.position.x, car.position.z, 3.5); if (!q || !q.edge.oneway) continue;
                    const dot = (v.x * q.tx + v.z * q.tz) / sp; if (Math.abs(dot) < 0.85) continue;
                    window.__checks++; if ((q.edge.oneway > 0) !== (dot > 0)) window.__wrong++;
                }
            }, 400);
        });
        await gameWait(page, ctx.quick ? 20 : 45, 600000);
        const run = await page.evaluate(() => { clearInterval(window.__iv); return { wrong: window.__wrong, checks: window.__checks, trips: game.vehicleManager.vehicles.filter((q) => q.mode === 'drive' && q.route && q.route.trips).length }; });
        c.ok(run.checks > 20 && run.wrong === 0, `trânsito sem contramão: ${run.wrong} de ${run.checks} amostras em ruas de mão única`);
        c.note(`${run.trips} carros em viagem; mão única em ${st.stats.ms} ms`);
        c.noErrors(errors, 'transito_rio');
        await close();
    },
};
