// MODO SEGURO QUE NÃO FICA PRESO (core/SafeMode.js): o que ficou guardado numa revisão anterior do desenho (ou há mais de 14 dias) é
// tentado de novo com tudo ligado —
//   • a imagem chega: o modo seguro é esquecido e os efeitos de tela continuam;
//   • a imagem não chega: os degraus voltam um a um e ficam guardados com a revisão, a data e o motivo (mostrados no diagnóstico);
//   • não dá para saber (tela escura): volta ao que estava guardado e tenta na próxima abertura.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'modo_seguro',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx, { width: 800, height: 450, query: 'gfx=medium' });
        page.setDefaultTimeout(0);
        // (o Chromium por software daqui leva de 5 s a mais de 1 min num quadro: menos checagens e uma vigia mais longa que no jogo)
        await page.evaluate(() => { Tutorial.skip(); game.player.invulnerable = true; Config.time.cycleSeconds = 1e12; game.dayNight.hour = 13; game.dayNight.apply(); if (game.autoQuality) game.autoQuality.off = true; SafeMode.GOOD_N = 2; SafeMode.WATCH_MS = 1e7; });
        const idle = () => page.waitForFunction(() => !SafeMode._obs, null, { timeout: 600000 });
        await gameWait(page, 1, 60000);
        const pp = () => page.evaluate(() => game.camera.camera._postProcesses.filter(Boolean).length);
        const pp0 = await pp();

        // 0) a vigia: com a cidade na tela não acusa; só o jogador no meio e o resto na cor do céu (o notebook Iris Xe) acusa
        const v = await page.evaluate(() => {
            const sc = game.scene, eng = game.gameEngine.engine;
            sc.render(); const ok = SafeMode._blank(sc, eng);
            const hid = sc.meshes.filter((m) => m.isVisible && !/^jogador3d|^player/.test(m.name));
            for (const m of hid) m.isVisible = false;
            const pp = game.camera.camera._postProcesses.filter(Boolean).length;
            sc.render(); const bad = SafeMode._blank(sc, eng);
            for (const m of hid) m.isVisible = true;
            return { ok, bad, hid: hid.length, pp };
        });
        c.ok(v.ok === false && v.bad === true, `vigia: cidade na tela = imagem ok; só o jogador no meio e o céu em volta = imagem não chega (${v.hid} malhas escondidas)`);

        // 1) o que ficou guardado numa versão antiga (sem revisão nem data): tenta de novo com tudo ligado
        const a = await page.evaluate(() => {
            SafeMode.applied = new Set();
            Store.setJSON('safeMode', { gpu: SafeMode._gpu(), steps: ['pp'] });
            SafeMode.init(game);
            return { retry: !!SafeMode.retry, applied: SafeMode.applied.size, detail: SafeMode.detail(), watching: !!SafeMode._obs };
        });
        c.ok(a.retry && a.applied === 0 && a.watching && /tentando de novo/.test(a.detail), `modo seguro de uma versão antiga: tenta de novo com tudo ligado («${a.detail}»)`);
        await idle();
        const a2 = await page.evaluate(() => ({ stored: Store.get('safeMode'), applied: SafeMode.applied.size, retry: SafeMode.retry, d: SafeMode.describe() }));
        const pp1 = await pp();
        c.ok(a2.stored === null && a2.applied === 0 && !a2.retry && pp1 === pp0 && pp0 > 0, `a imagem chegou: modo seguro esquecido (${a2.d}) e os ${pp1} efeitos de tela continuam`);

        // 2) a regra de "tentar de novo": outra revisão, sem data ou mais de 14 dias
        const st = await page.evaluate(() => {
            const R = SafeMode.REV, now = Date.now();
            const P = ['pp'];
            return { old: SafeMode._stale({ steps: P }), rev: SafeMode._stale({ rev: R - 1, when: now, steps: P }), aged: SafeMode._stale({ rev: R, when: now - 15 * 864e5, steps: P }), fresh: SafeMode._stale({ rev: R, when: now - 3 * 864e5, steps: P }),
                flagAged: SafeMode._stale({ rev: R, when: now - 60 * 864e5, steps: [], noParallel: true }), flagRev: SafeMode._stale({ rev: R - 1, when: now, steps: [], noParallel: true }) };
        });
        c.ok(st.old && st.rev && st.aged && !st.fresh, 'tenta de novo: sem revisão, revisão anterior ou guardado há 15 dias — guardado há 3 dias na revisão atual fica');
        c.ok(!st.flagAged && st.flagRev, 'só os pedidos de abertura (sem compilação paralela…) não vencem pela data — só com uma revisão nova');

        // 3) tentando de novo e a imagem NÃO chega: o degrau volta e fica guardado com a revisão, a data e o motivo
        const t0 = await page.evaluate(() => {
            SafeMode.applied = new Set();
            Store.setJSON('safeMode', { gpu: SafeMode._gpu(), steps: ['pp'], rev: 1, when: Date.now() - 864e5 });
            window.__blank = SafeMode._blank; SafeMode._blank = () => true;       // (simula a tela só com a cor do céu)
            SafeMode.init(game);
            return Date.now();
        });
        await page.waitForFunction(() => SafeMode.applied.has('pp'), null, { timeout: 600000 });
        const b = await page.evaluate(() => { SafeMode._blank = window.__blank; return { REV: SafeMode.REV, s: Store.getJSON('safeMode'), retry: SafeMode.retry, detail: SafeMode.detail(), steps: [...SafeMode.applied], pp: game.camera.camera._postProcesses.filter(Boolean).length }; });
        const S = b.s || {};
        c.ok(b.steps.join() === 'pp' && b.pp === 0 && !b.retry, `a imagem não chegou: desligou os efeitos de tela de novo (${b.steps.join(', ')})`);
        c.ok(S.rev === b.REV && S.when >= t0 && S.steps && S.steps.join() === 'pp' && /céu/.test(S.why || ''), `guardado com revisão ${S.rev}, data e motivo («${S.why}»)`);
        c.ok(/desde \d/.test(b.detail) && b.detail.includes('revisão ' + b.REV), `o diagnóstico conta desde quando e por quê («${b.detail}»)`);
        await idle();

        // 4) tentando de novo sem dar para saber (tela escura): volta ao que estava guardado, sem apagar
        const r0 = await page.evaluate(() => {
            SafeMode.applied = new Set();
            Store.setJSON('safeMode', { gpu: SafeMode._gpu(), steps: ['char3d'], rev: 1, when: 1 });
            window.__blank = SafeMode._blank; SafeMode._blank = () => null;
            SafeMode.RETRY_UNKNOWN = 2;
            SafeMode.init(game);
            return !!SafeMode.retry && SafeMode.applied.size === 0;
        });
        await idle();
        const d = await page.evaluate((r0) => {
            SafeMode._blank = window.__blank; SafeMode.RETRY_UNKNOWN = 8;
            const s = Store.getJSON('safeMode');
            return { r0, steps: [...SafeMode.applied], c3d: Char3D.on, kept: !!s && s.when === 1 && s.steps.join() === 'char3d', retry: SafeMode.retry };
        }, r0);
        c.ok(d.r0 && d.steps.join() === 'char3d' && !d.c3d && d.kept && !d.retry, `sem veredito: voltou ao guardado (${d.steps.join(', ')}) e tenta de novo na próxima abertura`);

        // 5) o TESTE DA CENA (core/SceneProbe.js): simulado, o mundo só "aparece" sem névoa — uma suspeita por vez, a que resolve fica
        const e = await page.evaluate(async () => {
            const s = game.scene, cam = s.activeCamera;
            const id = await SceneProbe.run(game, () => !SceneProbe.noFog);
            return { id, order: SceneProbe.results.map((r) => r.join('=')).join(' '), fog: !SceneProbe.noFog, cam: s.activeCamera === cam, rtt: s.renderTargetsEnabled, nl: !NightLights.off, label: SceneProbe.label };
        });
        c.ok(e.id === 'fog' && e.order === 'rtt=céu fog=IMAGEM' && !e.fog, `teste da cena: ${e.order} → fica sem névoa`);
        c.ok(e.cam && e.rtt && e.nl, 'as suspeitas que não resolveram voltaram como estavam (texturas fora da tela, luz da noite)');
        // ...e pela vigia: acha sozinho, lembra o degrau e o diagnóstico conta
        const f = await page.evaluate(() => {
            SceneProbe.kept = null; SceneProbe.noFog = false;
            SafeMode.applied = new Set(); SafeMode._probed = false; Store.remove('safeMode');
            window.__blank = SafeMode._blank; SafeMode._blank = () => !SceneProbe.noFog;
            SafeMode.init(game);
        });
        await page.waitForFunction(() => SafeMode.applied.has('x:fog'), null, { timeout: 600000 });
        await idle();
        const h = await page.evaluate(() => { SafeMode._blank = window.__blank; const st = Store.getJSON('safeMode'); return { steps: st && st.steps, fog: !SceneProbe.noFog, d: Diag.report(game), desc: SafeMode.describe() }; });
        c.ok(h.steps && h.steps.join() === 'x:fog' && !h.fog && /sem névoa/.test(h.desc), `a vigia rodou o teste da cena e guardou o que resolveu (${h.desc})`);
        c.ok(/teste da cena: o mundo voltou sem névoa/.test(h.d) && /erros de desenho \(1 quadro\): nenhum em \d+ desenhos/.test(h.d), 'o diagnóstico conta o teste da cena e os erros de desenho por malha');

        c.noErrors(errors, 'modo seguro');
        await close();
    },
};
