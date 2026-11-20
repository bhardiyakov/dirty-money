// CONTROLES E OPÇÕES (item 4): Ajustes › Teclas troca a tecla de uma ação (a tecla lógica que o jogo lê continua a mesma; a tecla
// antiga deixa de fazer aquilo; tecla de outra ação = as duas trocam; Esc cancela sem fechar o menu; padrão volta tudo), e as dicas e
// o Guia mostram a tecla nova (KeyBinds); sensibilidade e inversão da câmera (Game._look); vibração desligável (InputManager.rumble);
// tamanho do HUD (Hud.setScale) e dos botões do celular (--u do TouchControls). Tudo guardado em Ajustes.
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'controles',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        page.setDefaultTimeout(0);
        const key = (k, type = 'keydown') => page.evaluate(([k, type]) => window.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true })), [k, type]);
        await page.evaluate(() => { Tutorial.skip(); game.gameEngine.engine.stopRenderLoop(); KeyBinds.reset(); game.menu.settings.keys = {}; });

        // --- trocar a tecla de "interagir" (E) para U pela tela de Ajustes
        const open = await page.evaluate(() => {
            game.menu.open('settings');
            const M = game.menu, i = PauseMenu.SET_KEYS.indexOf('keys');
            M.setRow = i; M._setAdjust(0);
            const el = document.getElementById('pmSet'), row = el.querySelector('[data-k="e"]');
            row.click();
            return { view: !!M._keysView, waiting: !!game.input.capture, txt: row && el.querySelector('[data-k="e"]').textContent };
        });
        c.ok(open.view && open.waiting && /aperte/.test(open.txt), `Ajustes › Teclas abre a lista e espera a tecla nova (${open.txt})`);
        await key('u');
        const st1 = await page.evaluate(() => ({ e: KeyBinds.key('e'), saved: JSON.stringify(game.menu.settings.keys), stored: JSON.stringify((Store.getJSON('settings', {}) || {}).keys || {}), open: game.menu.isOpen }));
        c.ok(st1.e === 'u' && /"e":"u"/.test(st1.saved) && /"e":"u"/.test(st1.stored) && st1.open, `E → U, guardado em Ajustes (${st1.saved})`);
        // Esc esperando a tecla: cancela, e o menu continua aberto
        await page.evaluate(() => document.getElementById('pmSet').querySelector('[data-k="f"]').click());
        await key('escape');
        const st2 = await page.evaluate(() => ({ f: KeyBinds.key('f'), open: game.menu.isOpen, waiting: !!game.input.capture }));
        c.ok(st2.f === 'f' && st2.open && !st2.waiting, 'Esc esperando a tecla cancela sem fechar o menu');
        // tecla de outra ação: as duas trocam
        await page.evaluate(() => document.getElementById('pmSet').querySelector('[data-k="f"]').click());
        await key('u');
        const st3 = await page.evaluate(() => ({ e: KeyBinds.key('e'), f: KeyBinds.key('f') }));
        c.ok(st3.f === 'u' && st3.e === 'f', `pôr "veículo" no U (que era do interagir): trocam (veículo ${st3.f.toUpperCase()}, interagir ${st3.e.toUpperCase()})`);
        // número é fixo
        await page.evaluate(() => document.getElementById('pmSet').querySelector('[data-k="m"]').click());
        await key('3');
        const st4 = await page.evaluate(() => KeyBinds.key('m'));
        c.ok(st4 === 'm', 'números (armas) não podem receber ação');
        await page.evaluate(() => game.menu.close());

        // --- no jogo: U = veículo (lógica f), F = interagir (lógica e), E não faz nada
        const ingame = await page.evaluate(() => {
            const inp = game.input, out = {};
            const press = (k) => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); const r = { e: !!inp.keys.e, f: !!inp.keys.f, u: !!inp.keys.u, jp: Object.keys(inp.justPressed).filter((x) => inp.justPressed[x]) }; window.dispatchEvent(new KeyboardEvent('keyup', { key: k })); inp.justPressed = {}; return r; };
            out.u = press('u'); out.F = press('f'); out.E = press('e');
            out.prompt = KeyBinds.render('<b>F</b> entrar no carro · <b>E</b> assaltar · <b>WASD</b> mover');
            out.guide = /<kbd>U<\/kbd>/.test(game.menu.guide ? game.menu.guide.page('controls') : GuideUI.prototype.page.call({ careerPage() { return ''; } }, 'controls'));
            return out;
        });
        c.ok(ingame.u.f && !ingame.u.e && !ingame.u.u, `apertar U = a ação "veículo" (${JSON.stringify(ingame.u)})`);
        c.ok(ingame.F.e && !ingame.F.f, `apertar F = "interagir" (${JSON.stringify(ingame.F)})`);
        c.ok(!ingame.E.e && !ingame.E.f && !ingame.E.jp.length, 'a tecla E (que ficou sem ação) não faz nada');
        c.ok(/<b>U<\/b> entrar no carro/.test(ingame.prompt) && /<b>F<\/b> assaltar/.test(ingame.prompt) && /<b>WASD<\/b>/.test(ingame.prompt), `as dicas mostram a tecla nova (${ingame.prompt})`);
        c.ok(ingame.guide, 'o Guia (Controles) também');
        const rs = await page.evaluate(() => { const M = game.menu; M.open('settings'); M._keysView = true; M._renderSettings(); document.getElementById('pmSet').querySelector('[data-k="reset"]').click(); const r = { e: KeyBinds.key('e'), f: KeyBinds.key('f'), saved: JSON.stringify(M.settings.keys) }; M.close(); return r; });
        c.ok(rs.e === 'e' && rs.f === 'f' && rs.saved === '{}', 'padrão: tudo volta');

        // --- câmera: sensibilidade e inversão
        const cam = await page.evaluate(() => {
            const M = game.menu, s = M.settings, out = {}, turn = game.camera.turn.bind(game.camera);
            let got = 0; game.camera.turn = (d) => { got += d; };
            const once = () => { got = 0; game._lookD = 0.1; game._lookDY = 0; game._look(1 / 30); return got; };
            s.camSens = 1; s.camInvX = false; M.applySettings(); out.base = once();
            s.camSens = 2; M.applySettings(); out.fast = once();
            s.camInvX = true; M.applySettings(); out.inv = once();
            s.camSens = 1; s.camInvX = false; M.applySettings();
            game.camera.turn = turn;
            out.rows = ['camSens', 'camInvX', 'camInvY', 'vibration', 'hudScale', 'keys'].every((k) => PauseMenu.SET_KEYS.includes(k));
            return out;
        });
        c.ok(Math.abs(cam.fast - cam.base * 2) < 1e-6 && Math.abs(cam.inv + cam.base * 2) < 1e-6, `sensibilidade 200% dobra o giro e inverter vira o lado (${cam.base.toFixed(2)} → ${cam.fast.toFixed(2)} → ${cam.inv.toFixed(2)})`);
        c.ok(cam.rows, 'Ajustes: sensibilidade, inverter (2), vibração, tamanho do HUD e teclas');

        // --- vibração desligável
        const vib = await page.evaluate(() => {
            const inp = game.input, M = game.menu, keep = { pc: inp.padConnected, pad: inp._pad };
            let n = 0; inp.padConnected = true; inp._pad = () => ({ vibrationActuator: { playEffect() { n++; return Promise.resolve(); } } });
            inp.rumble(0.5, 0.5, 100); const on = n;
            M.settings.vibration = false; M.applySettings(); inp.rumble(0.5, 0.5, 100); const off = n - on;
            M.settings.vibration = true; M.applySettings();
            inp.padConnected = keep.pc; inp._pad = keep.pad;
            return { on, off };
        });
        c.ok(vib.on === 1 && vib.off === 0, `vibração desligada: o controle não vibra (${vib.on} → ${vib.off})`);

        // --- tamanho do HUD e dos botões do celular
        const hud = await page.evaluate(() => {
            const M = game.menu, s = M.settings;
            const t0 = document.getElementById('hud2').style.transform;
            s.hudScale = 1.3; s.touchSize = 1.3; M.applySettings();
            const out = { t0, t1: document.getElementById('hud2').style.transform, mm: document.getElementById('minimap').style.transform, tu: document.getElementById('touchUI') ? document.getElementById('touchUI').style.getPropertyValue('--u') : 'sem touchUI' };
            s.hudScale = 1; s.touchSize = 1; M.applySettings();
            out.back = document.getElementById('minimap').style.transform;
            return out;
        });
        const sc = (t) => +((t.match(/scale\(([\d.]+)\)/) || [])[1] || 0);
        c.ok(Math.abs(sc(hud.t1) / sc(hud.t0) - 1.3) < 0.01 && hud.mm === 'scale(1.3)' && hud.back === '', `HUD 130%: o cartão e o minimapa crescem (${hud.t0} → ${hud.t1}; mapa ${hud.mm})`);
        c.ok(/\* 1\.3\)/.test(hud.tu), `botões do celular 130% (${hud.tu})`);
        c.noErrors(errors, 'controles');
        await close();
    },
};
