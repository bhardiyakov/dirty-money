// SONS GRAVADOS (audio/SoundBank.js + assets/sfx, todos CC0): o pacote inteiro carrega e decodifica; cada som do jogo toca a
// GRAVAÇÃO do seu grupo — passos em cada chão e com cada calçado, tiro de cada arma com a cápsula, batida leve (lataria) × forte,
// explosão perto × longe, soco, vidro, buzina de carro × de caminhão, pneu cantando (loop que sobe com a força), sirene (lamento
// longe, "yelp" colado), burburinho da rua/mercado; o MOTOR troca o ciclo sintetizado pela marcha lenta gravada da família do modelo
// (a reprodução acelera com o giro), com o arranque gravado, o "clec" do câmbio e a catraca do freio de mão; sem as gravações
// (carregando / desligadas) tudo cai no sintetizado sem erro. Os créditos aparecem no Guia.
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'sons',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        page.setDefaultTimeout(0);
        await page.evaluate(() => { Tutorial.skip(); Weather.cur.set('clear', true, true); AudioFX.init(); });

        // ------------------------------------------------------------------ o pacote carrega inteiro
        const t0 = Date.now();
        let L;
        for (;;) {
            L = await page.evaluate(() => {
                const m = SoundBank.man, total = m ? Object.values(m).reduce((s, a) => s + a.length, 0) : -1;
                return { state: AudioFX.ctx && AudioFX.ctx.state, total, loaded: SoundBank.loaded, failed: SoundBank.failed };
            });
            if (L.total > 0 && L.loaded + L.failed >= L.total) break;
            if (Date.now() - t0 > 120000) break;
            await page.waitForTimeout(500);
        }
        c.ok(L.state === 'running', `áudio rodando (${L.state})`);
        c.ok(L.total >= 100 && L.loaded === L.total && L.failed === 0, `gravações carregadas e decodificadas: ${L.loaded}/${L.total} (${L.failed} falharam) em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
        const inv = await page.evaluate(() => {
            const out = {}, bad = [];
            for (const [g, arr] of Object.entries(SoundBank.man)) {
                out[g] = arr.length;
                arr.forEach((e, i) => {
                    const b = SoundBank.bufs[g] && SoundBank.bufs[g][i];
                    if (!b || !(b.duration > 0.03)) bad.push(g + '#' + i);
                    else if (e.ls != null && !(e.ls >= 0 && e.le <= b.duration + 0.01 && e.le - e.ls > 0.8)) bad.push(g + '#' + i + ' (loop ' + e.ls + '–' + e.le + ' de ' + b.duration.toFixed(2) + ')');
                });
            }
            return { out, bad };
        });
        c.ok(!inv.bad.length, `toda gravação decodificada com duração e trecho de loop válidos${inv.bad.length ? ': ' + inv.bad.slice(0, 5).join(', ') : ''}`);
        const need = {
            passos: ['step_concrete', 'step_grass', 'step_leaves', 'step_sand', 'step_dirt', 'step_gravel', 'step_mud', 'step_water', 'step_wood', 'step_tile', 'step_heels', 'step_slipper', 'run_concrete', 'run_grass'],
            tiros: ['gun_pistol', 'gun_smg', 'gun_rifle', 'gun_shotgun', 'gun_heavy', 'casing', 'gun_reload', 'gun_cock'],
            batida: ['crash', 'car_bump', 'glass', 'punch', 'explosion', 'explosion_far'],
            rua: ['tire_screech', 'tire_squeal', 'siren_wail', 'siren_yelp', 'horn_car', 'horn_bus', 'crowd_street', 'crowd_market'],
            motor: ['eng_car', 'eng_beater', 'eng_v8', 'eng_truck', 'eng_moto', 'starter', 'gear', 'handbrake'],
        };
        for (const [k, gs] of Object.entries(need)) {
            const miss = gs.filter((g) => !inv.out[g]);
            c.ok(!miss.length, `${k}: ${gs.map((g) => g + '×' + (inv.out[g] || 0)).join(' ')}${miss.length ? ' — FALTAM ' + miss.join(', ') : ''}`);
        }
        const vari = ['step_concrete', 'step_grass', 'step_gravel', 'step_wood', 'step_tile', 'casing', 'punch', 'crash', 'gear'].filter((g) => (inv.out[g] || 0) < 3);
        c.ok(!vari.length, `variações (≥ 3) nos sons que se repetem muito${vari.length ? ' — poucas em ' + vari.join(', ') : ''}`);

        // ------------------------------------------------------------------ cada som do jogo toca a gravação certa
        const plays = await page.evaluate(() => {
            const L = AudioFX.listener, x = L.x + 3, z = L.z + 2, P = SoundBank.played, n = (g) => P[g] || 0, out = {};
            const hit = (name, g, fn) => { const a = n(g); fn(); out[name] = n(g) - a; };
            hit('pistola', 'gun_pistol', () => AudioFX.shot('pistol', x, z));
            hit('revólver', 'gun_pistol', () => AudioFX.shot('revolver', x, z));
            hit('submetralhadora', 'gun_smg', () => AudioFX.shot('smg', x, z));
            hit('fuzil', 'gun_rifle', () => AudioFX.shot('ak47', x, z));
            hit('escopeta', 'gun_shotgun', () => AudioFX.shot('shotgun', x, z));
            hit('minigun', 'gun_smg', () => AudioFX.shot('minigun', x, z));
            hit('silenciador (sintetizado)', 'gun_pistol', () => AudioFX.shot('pistol_sil', x, z));
            const cas0 = n('casing'); for (let i = 0; i < 4; i++) AudioFX.shot('pistol', x, z); out['cápsulas (4 tiros)'] = n('casing') - cas0;
            hit('batida leve (lataria)', 'car_bump', () => AudioFX.crash(x, z, 0.1));
            hit('batida forte', 'crash', () => AudioFX.crash(x, z, 0.9));
            hit('explosão perto', 'explosion', () => AudioFX.explosion(x, z));
            hit('explosão longe', 'explosion_far', () => AudioFX.explosion(L.x + 180, L.z));
            hit('soco/pancada', 'punch', () => AudioFX.thud(x, z));
            hit('vidro', 'glass', () => AudioFX.glass(x, z));
            hit('porta batendo', 'car_bump', () => AudioFX.door(x, z, false));
            hit('buzina', 'horn_car', () => AudioFX.honk(x, z, 1, 0.3));
            hit('buzina de caminhão', 'horn_bus', () => AudioFX.honk(x, z, 0.7, 0.4));
            hit('recarregar', 'gun_reload', () => AudioFX.reload(x, z, 1.2));
            hit('engatilhar', 'gun_cock', () => AudioFX.cock(x, z));
            hit('freada de outro carro', 'tire_squeal', () => AudioFX.squeal(x, z));
            hit('longe demais (nada)', 'gun_pistol', () => AudioFX.shot('pistol', L.x + 900, L.z));
            return out;
        });
        const want = { pistola: 1, 'revólver': 1, submetralhadora: 1, fuzil: 1, escopeta: 1, minigun: 1, 'silenciador (sintetizado)': 0, 'batida leve (lataria)': 1, 'batida forte': 1, 'explosão perto': 1, 'explosão longe': 1, 'soco/pancada': 1, vidro: 1, 'porta batendo': 1, buzina: 1, 'buzina de caminhão': 1, recarregar: 1, engatilhar: 1, 'freada de outro carro': 1, 'longe demais (nada)': 0 };
        const wrong = Object.keys(want).filter((k) => plays[k] !== want[k]);
        c.ok(!wrong.length, `cada efeito toca a gravação do seu grupo${wrong.length ? ' — errado: ' + wrong.map((k) => `${k}=${plays[k]} (esperado ${want[k]})`).join(', ') : ''}`);
        c.ok(plays['cápsulas (4 tiros)'] === 4, `cápsula quicando depois de cada tiro de pistola (${plays['cápsulas (4 tiros)']}/4)`);

        // passos: o chão e o calçado escolhem a gravação
        const steps = await page.evaluate(() => {
            const F = Footsteps, s0 = F.surface, h0 = F.shoe, P = SoundBank.played, out = [];
            for (const [surf, shoe, run, g] of [['concrete', 'sneaker', false, 'step_concrete'], ['concrete', 'sneaker', true, 'run_concrete'], ['grass', 'sneaker', false, 'step_grass'], ['grass', 'boot', true, 'run_grass'],
                ['leaves', 'sneaker', false, 'step_leaves'], ['sand', 'sneaker', false, 'step_sand'], ['dirt', 'boot', false, 'step_dirt'], ['gravel', 'sneaker', false, 'step_gravel'], ['mud', 'sneaker', false, 'step_mud'],
                ['water', 'sneaker', false, 'step_water'], ['wood', 'sneaker', false, 'step_wood'], ['tile', 'sneaker', false, 'step_tile'], ['concrete', 'dress', false, 'step_heels'], ['tile', 'flip', false, 'step_slipper'], ['sand', 'flip', false, 'step_sand']]) {
                F.surface = () => surf; F.shoe = () => shoe;
                const a = P[g] || 0; F.step(game, run); out.push([surf + '/' + shoe + (run ? '/correndo' : ''), g, (P[g] || 0) - a]);
            }
            F.surface = s0; F.shoe = h0;
            return out;
        });
        const sbad = steps.filter((s) => s[2] !== 1);
        c.ok(!sbad.length, `passos: ${steps.length} combinações de chão × calçado tocam a gravação certa${sbad.length ? ' — erradas: ' + sbad.map((s) => s[0] + '→' + s[1]).join(', ') : ''}`);

        // loops: sirene (longe = lamento, colada = yelp), pneu (sobe com a força), burburinho
        await page.evaluate(() => {                                         // (na rua comercial, de dia — o relógio do Ambience segue rodando)
            game.dayNight.hour = 14; Ambience.__w = Ambience._where; Ambience._where = () => ({ inside: false, shop: null, biome: 'commercial', district: 'centro', beach: 0 });
            window.__S = { siren: AudioFX.siren, screech: AudioFX.screech }; AudioFX.siren = AudioFX.screech = () => {};      // (a polícia e o carro chamam a cada quadro)
            __S.siren.call(AudioFX, true, 80); __S.screech.call(AudioFX, 0.9);
        });
        await page.waitForTimeout(1500);
        const lp1 = await page.evaluate(() => ({ w: AudioFX._rsiren && AudioFX._rsiren.wail.gain.gain.value, y: AudioFX._rsiren && AudioFX._rsiren.yelp.gain.gain.value,
            sc: AudioFX._rscreech && AudioFX._rscreech.gain.gain.value, rate: AudioFX._rscreech && AudioFX._rscreech.src.playbackRate.value,
            cm: Ambience.RC && Ambience.RC.market.gain.gain.value, cs: Ambience.RC && Ambience.RC.street.gain.gain.value }));
        await page.evaluate(() => { __S.siren.call(AudioFX, true, 10); __S.screech.call(AudioFX, 0.2); });
        await page.waitForTimeout(1500);
        const lp2 = await page.evaluate(() => ({ w: AudioFX._rsiren.wail.gain.gain.value, y: AudioFX._rsiren.yelp.gain.gain.value, sc: AudioFX._rscreech.gain.gain.value, rate: AudioFX._rscreech.src.playbackRate.value }));
        await page.evaluate(() => { __S.siren.call(AudioFX, false, Infinity); __S.screech.call(AudioFX, 0); });
        await page.waitForTimeout(1500);
        const lp3 = await page.evaluate(() => ({ w: AudioFX._rsiren.wail.gain.gain.value, y: AudioFX._rsiren.yelp.gain.gain.value, sc: AudioFX._rscreech.gain.gain.value }));
        await page.evaluate(() => { AudioFX.siren = __S.siren; AudioFX.screech = __S.screech; Ambience._where = Ambience.__w; });
        c.ok(lp1.w > 0.02 && lp1.y < 0.005, `sirene longe: lamento gravado (${(lp1.w || 0).toFixed(3)}), sem yelp (${(lp1.y || 0).toFixed(3)})`);
        c.ok(lp2.y > 0.15 && lp2.y > lp2.w, `sirene colada (10 m): troca para o yelp (${lp2.y.toFixed(3)} > lamento ${lp2.w.toFixed(3)})`);
        c.ok(lp3.w < 0.01 && lp3.y < 0.01, `sirene some quando não há viatura (${lp3.w.toFixed(3)}/${lp3.y.toFixed(3)})`);
        c.ok(lp1.sc > 0.3 && lp2.sc < lp1.sc && lp2.sc > 0.05 && lp1.rate > lp2.rate && lp3.sc < 0.01, `pneu cantando gravado: forte ${lp1.sc.toFixed(2)} (tom ${lp1.rate.toFixed(2)}) > leve ${lp2.sc.toFixed(2)} (tom ${lp2.rate.toFixed(2)}) > parado ${lp3.sc.toFixed(3)}`);
        c.ok(lp1.cm > 0.05 && lp1.cm > lp1.cs && lp1.cs > 0, `burburinho gravado no comércio: mercado ${(lp1.cm || 0).toFixed(3)} + rua ${(lp1.cs || 0).toFixed(3)}`);

        // ------------------------------------------------------------------ o motor gravado
        const fam = await page.evaluate(() => {
            const E = EngineAudio, out = {};
            for (const k of Object.keys(E.PROFILES)) out[k] = E._realOf(Object.assign({ key: k }, E.PROFILES[k]));
            return out;
        });
        c.ok(fam.sedan4 === 'eng_car' && fam.old4 === 'eng_beater' && fam.v8muscle === 'eng_v8' && fam.diesel4 === 'eng_truck' && fam.moto1 === 'eng_moto' && !fam.electric && !fam.v8marine && !fam.outboard,
            `cada perfil na sua família gravada (sedã: ${fam.sedan4}, velho: ${fam.old4}, V8: ${fam.v8muscle}, diesel: ${fam.diesel4}, moto: ${fam.moto1}; elétrico e barco: sintetizado)`);
        const eng = await page.evaluate(async () => {
            const g = game, vm = g.vehicleManager, E = EngineAudio;
            const car = vm.vehicles.find((v) => !v.isBike && !v.spec.boat && !v.isChopper && !v.controlled && !v.destroyed && E.REAL[E.profileOf(v) && E.profileOf(v).key]);
            if (!car) return null;
            const p = car.position;
            g.player.teleport(new BABYLON.Vector3(p.x + 2, 0, p.z)); g.player.setVisible(false);
            car.mode = 'parked'; car.route = null;
            car.setControlled(true); g.activeCar = car; g.mode = 'car'; car.hp = car.maxHp; car.fuel = car.tank; car.engineDead = false; car.hotwire = 0;
            if (car.cond) { car.cond.battery = 1; car.cond.engine = 1; car.cond.temp = 0; } car._ccOff = false;      // (bateria fraca sorteada: não pegaria)
            g.gameEngine.engine.stopRenderLoop();
            const st0 = SoundBank.played.starter || 0;
            for (let i = 0; i < 60 && !(car._eng && car._eng.state === 'run'); i++) { E.update(g, 0.05); await new Promise((r) => setTimeout(r, 20)); }
            const v = E.player && E.player.voice, P = v && v.P, out = { model: car.spec.id, prof: P && P.key, state: car._eng && car._eng.state, real: v && v.real, starter: !!(v && v.stR), starterPlayed: (SoundBank.played.starter || 0) - st0 };
            if (!v) return out;
            for (let i = 0; i < 40; i++) { E.update(g, 0.05); await new Promise((r) => setTimeout(r, 15)); }      // (passa a acelerada de quem acabou de ligar)
            out.rIdle = E._rate(v, P.idle); out.rMid = E._rate(v, (P.idle + P.red) / 2); out.rRed = E._rate(v, P.red); out.pm = E.PITCH[P.key];
            await new Promise((r) => setTimeout(r, 300));
            out.playRate = v.lo && v.lo.playbackRate.value; out.loopBuf = v.lo && v.lo.buffer && v.lo.buffer.duration;
            out.rpm = car._eng.rpm; out.rNow = E._rate(v, car._eng.rpm);
            out.isReal = !!(v.lo && SoundBank.bufs[v.real] && SoundBank.bufs[v.real].includes(v.lo.buffer));
            // troca de marcha e freio de mão (só no carro do jogador)
            const g0 = E.gears, gp = SoundBank.played.gear || 0;
            E._onShift(car, P, car._eng, 0.5, true); E._onShift(car, P, car._eng, 0.5, false);
            out.gear = [E.gears - g0, (SoundBank.played.gear || 0) - gp];
            const hb0 = SoundBank.played.handbrake || 0;
            car.handbrake = true; E.update(g, 0.05); E.update(g, 0.05); car.handbrake = false; E.update(g, 0.05); car.handbrake = true; E.update(g, 0.05); car.handbrake = false;
            out.hb = (SoundBank.played.handbrake || 0) - hb0;
            return out;
        });
        if (!eng) c.ok(false, 'nenhum carro com motor gravado por perto para o teste');
        else {
            c.ok(eng.state === 'run' && eng.isReal && eng.real === fam[eng.prof], `${eng.model} (${eng.prof}): motor ligado (${eng.state}) tocando a gravação ${eng.real} (${eng.isReal ? 'buffer gravado' : 'NÃO é o buffer gravado'}, loop de ${(eng.loopBuf || 0).toFixed(2)} s)`);
            c.ok(eng.starter && eng.starterPlayed >= 1, `arranque gravado na partida (${eng.starterPlayed})`);
            c.ok(Math.abs(eng.rIdle - eng.pm) < 1e-6 && eng.rMid > eng.rIdle * 1.5 && eng.rRed > eng.rMid && eng.rRed < eng.pm * 3, `giro acelera a gravação: marcha lenta ${eng.rIdle.toFixed(2)}× → meio ${eng.rMid.toFixed(2)}× → corte ${eng.rRed.toFixed(2)}×`);
            c.ok(Math.abs(eng.playRate - eng.rNow) < 0.12, `a reprodução segue o giro: ${Math.round(eng.rpm)} rpm → ${(eng.playRate || 0).toFixed(2)}× (esperado ${eng.rNow.toFixed(2)}×)`);
            c.ok(eng.gear[0] === 1 && eng.gear[1] === 1, `"clec" do câmbio só no carro do jogador (${eng.gear.join('/')})`);
            c.ok(eng.hb === 2, `catraca do freio de mão a cada puxada (${eng.hb}/2)`);
        }

        // ------------------------------------------------------------------ sem as gravações: o sintetizado, sem erro
        const off = await page.evaluate(() => {
            SoundBank.off = true;
            const P = SoundBank.played, a = JSON.stringify(P), L = AudioFX.listener;
            AudioFX.shot('pistol', L.x + 2, L.z); AudioFX.crash(L.x + 2, L.z, 0.8); AudioFX.thud(L.x, L.z); AudioFX.honk(L.x + 3, L.z); AudioFX.explosion(L.x + 5, L.z);
            Footsteps.step(game, false);
            const same = JSON.stringify(P) === a;
            SoundBank.off = false;
            return same;
        });
        c.ok(off, 'sem as gravações (carregando ou desligadas) os efeitos caem no sintetizado, sem erro');

        // ------------------------------------------------------------------ créditos
        const guide = await page.evaluate(() => GuideUI.PAGES && GuideUI.PAGES.radio ? GuideUI.PAGES.radio() : '');
        c.ok(/BigSoundBank/.test(guide) && /CC0/.test(guide) && /muted\.io/.test(guide) && /OpenGameArt/.test(guide), 'créditos dos sons no Guia (BigSoundBank, OpenGameArt, muted.io — CC0)');
        const cred = await page.evaluate(() => fetch('assets/sfx/CREDITOS.md').then((r) => r.text()));
        const used = await page.evaluate(() => Object.keys(SoundBank.man));
        const nocred = used.filter((g) => !cred.includes('`' + g + '`'));
        c.ok(!nocred.length, `todo grupo de som listado em assets/sfx/CREDITOS.md${nocred.length ? ' — faltam: ' + nocred.join(', ') : ''}`);
        c.noErrors(errors, 'sons');
        await close();
    },
};
