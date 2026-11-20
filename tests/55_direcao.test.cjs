// Direção e rádio do carro: o FREIO DE MÃO (Espaço / RB / botão no celular) trava a traseira — com o volante virado o carro gira bem
// mais e derrapa, reto ele só freia arrastando; já derrapando, acelerar com o volante para dentro da curva MANTÉM o drift e aliviar o pé
// devolve a aderência. A câmera de trás do carro, derrapando, olha para onde o carro VAI (a velocidade), não para o nariz. O RÁDIO: cada
// carro tem a sua estação, R troca (passando pelo desligado), cada estação toca as faixas dela (assets/music) num relógio próprio —
// sintonizar entra no meio da faixa no ar; no fim, vinheta e a próxima —, todas creditadas no Guia, o boletim abaixa a música, moto não
// tem rádio. A física anda em passos fixos de 1/60 s (game._update + Havok), sem esperar o desenho (o Chromium por software é lento).
const { boot } = require('./lib.cjs');

module.exports = {
    name: 'direcao',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        page.setDefaultTimeout(0);
        const ok = await page.evaluate(() => {
            Tutorial.skip(); Weather.cur.set('clear', true, true);
            AudioFX.init();
            const S = Speedway;
            if (!S.site) return null;
            // a reta mais longa da pista
            let best = null;
            for (let s = 0; s < S.L; s += 5) {
                const a = S.at(s), b = S.at(s + 60);
                const turn = Math.abs(Math.atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz));
                if (!best || turn < best.turn) best = { s, turn };
            }
            const p = S.at(best.s), vm = game.vehicleManager;
            const car = vm.vehicles.find((v) => !v.isBike && !v.spec.boat && !v.isChopper && !v.controlled && !v.destroyed && !v.spec.armored);
            if (!car) return null;
            game.player.teleport(new BABYLON.Vector3(p.x, 0, p.z));
            car.teleport(p.x, p.z, Math.atan2(p.tx, p.tz)); car.mode = 'parked'; car.route = null;
            game.player.setVisible(false); car.setControlled(true); game.activeCar = car; game.mode = 'car'; game.camera.snapTo(car.position);
            car.hp = car.maxHp; car.fuel = car.tank; car.engineDead = false; car.hotwire = 0;
            window.__start = { x: p.x, z: p.z, tx: p.tx, tz: p.tz };
            game.gameEngine.engine.stopRenderLoop();
            const wrap = CompassCamera.wrap;
            window.__head = () => { const f = game.activeCar.fwdToRef(new BABYLON.Vector3()); return Math.atan2(f.x, f.z); };
            // Anda `secs` s de jogo com as teclas `keys` (w/a/s/d/espaço) — passos de 1/60 s.
            window.__drive = (secs, keys = {}) => {
                const inp = game.input, K = ['w', 'a', 's', 'd', ' '];
                for (const k of K) inp.keys[k] = !!keys[k];
                for (let i = 0; i < Math.round(secs * 60); i++) { game._update(1 / 60); game.scene.getPhysicsEngine()._step(1 / 60); Vehicle.physFrame++; }
                for (const k of K) inp.keys[k] = false;
                const v = game.activeCar.velocity;
                return { sp: Math.hypot(v.x, v.z), slide: game.activeCar.slide, head: window.__head(), braking: game.activeCar.braking };
            };
            // Põe o carro de volta no começo da reta a `v` m/s.
            window.__reset = (v) => {
                const P = window.__start, car = game.activeCar, h = Math.atan2(P.tx, P.tz);
                car.teleport(P.x, P.z, h); car.slide = 0; car._yaw = 0; car.handbrake = false;
                const lv = new BABYLON.Vector3(P.tx * v, 0, P.tz * v);
                car.phys.setLinearVelocity(lv); car._cmd = lv.clone(); car.phys.setAngularVelocity(BABYLON.Vector3.Zero());
                for (let i = 0; i < 6; i++) { game._update(1 / 60); game.scene.getPhysicsEngine()._step(1 / 60); Vehicle.physFrame++; car.phys.setLinearVelocity(lv); car._cmd = lv.clone(); }
                game.camera.snapTo(car.position);
                return window.__head();
            };
            window.__wrap = wrap;
            return { s: best.s, turn: best.turn };
        });
        if (!c.ok(!!ok, 'achou a reta do autódromo e um carro')) { await close(); return; }

        // motor ligado (a partida leva até ~1,5 s)
        await page.evaluate(() => window.__drive(2.5, {}));

        // --- curva sem e com freio de mão (mesma velocidade, mesmo volante)
        const r = await page.evaluate(() => {
            const out = {};
            let h0 = window.__reset(18); let e = window.__drive(0.7, { w: true, d: true });
            out.plain = { turn: Math.abs(window.__wrap(e.head - h0)), slide: e.slide, sp: e.sp };
            h0 = window.__reset(18); e = window.__drive(0.7, { w: true, d: true, ' ': true });
            out.hb = { turn: Math.abs(window.__wrap(e.head - h0)), slide: e.slide, sp: e.sp, braking: e.braking };
            // câmera derrapando: olha mais para a velocidade que para o nariz
            const car = game.activeCar, v = car.velocity, vd = Math.atan2(v.x, v.z), h = window.__head();
            const aim = game.camera._aimYaw(car, h, 0);
            out.cam = { nose: Math.abs(window.__wrap(h - vd)), aim: Math.abs(window.__wrap(aim - vd)) };
            // drift: rápido, um toque no freio de mão para soltar a traseira; solto, acelerando com o volante para dentro — a derrapagem fica;
            // depois alivia o pé — some
            window.__reset(24); window.__drive(0.25, { w: true, d: true, ' ': true });
            e = window.__drive(0.6, { w: true, d: true }); out.hold = e.slide; out.holdSp = e.sp;
            e = window.__drive(1.5, {}); out.release = e.slide;
            // reto com freio de mão: freia arrastando, quase sem girar
            h0 = window.__reset(18); e = window.__drive(1.0, { ' ': true });
            out.straight = { turn: Math.abs(window.__wrap(e.head - h0)), sp: e.sp };
            return out;
        });
        c.note(`curva normal: giro ${r.plain.turn.toFixed(2)} rad, derrapagem ${r.plain.slide.toFixed(2)} · com freio de mão: giro ${r.hb.turn.toFixed(2)} rad, derrapagem ${r.hb.slide.toFixed(2)}, ${r.hb.sp.toFixed(1)} m/s`);
        c.ok(r.hb.turn > r.plain.turn * 1.25, `freio de mão + volante: o carro gira mais (${r.hb.turn.toFixed(2)} × ${r.plain.turn.toFixed(2)} rad)`);
        c.ok(r.hb.slide > 0.6, `freio de mão + volante: a traseira solta (derrapagem ${r.hb.slide.toFixed(2)})`);
        c.ok(r.hb.sp < r.plain.sp - 1, `freio de mão perde velocidade (${r.hb.sp.toFixed(1)} × ${r.plain.sp.toFixed(1)} m/s)`);
        c.ok(r.hb.braking, 'freio de mão acende a luz de freio');
        c.ok(r.cam.aim < r.cam.nose, `derrapando, a câmera olha para onde o carro vai (${r.cam.aim.toFixed(2)} rad da velocidade; o nariz está a ${r.cam.nose.toFixed(2)})`);
        c.ok(r.hold > 0.3, `drift: acelerando com o volante para dentro, a derrapagem se mantém (${r.hold.toFixed(2)} a ${r.holdSp.toFixed(1)} m/s)`);
        c.ok(r.release < 0.15, `aliviando o pé, a aderência volta (${r.release.toFixed(2)})`);
        c.ok(r.straight.turn < 0.25 && r.straight.sp < 12, `reto, o freio de mão só freia (giro ${r.straight.turn.toFixed(2)} rad, ${r.straight.sp.toFixed(1)} m/s depois de 1 s)`);

        // --- rádio: faixas de verdade (assets/music), cada estação no seu relógio
        const rd = await page.evaluate(() => {
            const out = {}, car = game.activeCar;
            game._update(1 / 60);
            out.has = Radio.car === car && car.radio !== undefined && Radio.cur === car.radio;
            car.radio = -1; Radio.car = null; game._update(1 / 60);                 // (reentra: desligado)
            out.offPaused = !Radio.el || Radio.el.paused;
            Radio.step(game, 1);
            out.first = Radio.cur; out.label = Radio.label;
            out.card = (document.getElementById('radioCard') || {}).textContent || '';
            out.carKeeps = car.radio === Radio.cur;
            const seen = new Set([Radio.cur]);
            for (let i = 0; i < 4; i++) { Radio.step(game, 1); seen.add(Radio.cur); }
            out.cycle = [...seen].sort();
            Radio.clock = 0; for (const s of Radio.STATIONS) s.off = 0;               // (relógio no começo: a 1ª faixa, do início)
            Radio.step(game, 1);                                                       // de volta à primeira (Baile)
            out.back = Radio.cur;
            return out;
        });
        c.ok(rd.has, 'entrar no carro liga o rádio na estação daquele carro');
        c.ok(rd.offPaused, 'desligado, o rádio não toca');
        c.ok(rd.first === 0 && /BAILE 150/.test(rd.label || '') && /Baile 150/.test(rd.card), `R troca: do desligado para a Baile 150 FM, com o cartão (${rd.card.slice(0, 40)})`);
        c.ok(rd.carKeeps, 'o carro guarda a estação escolhida');
        c.eq(JSON.stringify(rd.cycle), JSON.stringify([-1, 0, 1, 2, 3]), 'as 4 estações e o desligado em sequência');
        const pl = await page.waitForFunction(() => Radio.el && !Radio.el.paused && Radio.el.currentTime > 1, null, { timeout: 60000 }).then(() => true, () => false);
        const rd2 = await page.evaluate(() => ({ src: Radio.el.src, t: Radio.el.currentTime, now: Radio.now && Radio.now.tr.t, card: (document.getElementById('radioCard') || {}).textContent || '', ctx: AudioFX.ctx && AudioFX.ctx.state }));
        c.ok(pl && /assets\/music\/baile-[a-z-]+\.mp3$/.test(rd2.src), `a Baile toca uma faixa dela de verdade (${rd2.src.split('/').pop()}, ${rd2.t.toFixed(1)} s; áudio ${rd2.ctx})`);
        c.ok(!!rd2.now && rd2.card.includes(rd2.now), `o cartão mostra a faixa e o autor (${rd2.card.slice(0, 70)})`);
        // fim da faixa: a vinheta e a próxima da lista
        const rd3 = await page.evaluate(() => new Promise((res) => {
            const k0 = Radio.now.k, st = Radio.now.st;
            Radio.el.dispatchEvent(new Event('ended'));
            const gap = Radio.now === null;
            setTimeout(() => res({ gap, k0, k1: Radio.now && Radio.now.k, n: st.order.length, src: Radio.el.src }), 2600);
        }));
        c.ok(rd3.gap && rd3.k1 === (rd3.k0 + 1) % rd3.n, `acabou a faixa: vinheta e a próxima (${rd3.k0} → ${rd3.k1}, ${rd3.src.split('/').pop()})`);
        // como uma rádio de verdade: sintonizar com o relógio andando entra no meio de uma faixa
        const rd4 = await page.evaluate(() => {
            const st = Radio.STATIONS[1]; Radio._list(st); st.off = 0;
            Radio.clock = st.tracks[st.order[0]].d + Radio.GAP + 60;                // 1 min dentro da 2ª faixa da lista
            Radio.step(game, 1);
            return { cur: Radio.cur, src: Radio.el.src, want: st.tracks[st.order[1]].f };
        });
        c.ok(rd4.cur === 1 && rd4.src.includes(rd4.want + '.mp3#t=60'), `sintonizar entra no meio da faixa que está no ar (${rd4.src.split('/').pop()})`);
        const rd5 = await page.evaluate(async () => {
            const out = {};
            const files = Radio.STATIONS.flatMap((s) => s.tracks.map((t) => t.f));
            const st = await Promise.all(files.map((f) => fetch(Radio.BASE + f + '.mp3', { method: 'HEAD' }).then((r) => r.status, () => 0)));
            out.files = files.length; out.missing = files.filter((f, i) => st[i] !== 200);
            const cred = GuideUI.PAGES.radio();
            out.credited = files.length - Radio.STATIONS.flatMap((s) => s.tracks).filter((t) => cred.includes(t.t) && cred.includes(t.a)).length;
            out.lic = Radio.STATIONS.flatMap((s) => s.tracks).every((t) => Radio.LICENSES[t.l] && /^https:\/\//.test(t.u));
            Radio.step(game, 1); Radio.step(game, 1);                                  // Rádio Cidade
            out.cidade = Radio.cur === 3;
            News.bulletin(game);
            out.duck = Radio._duckT > 0;
            out.news = ((document.getElementById('newsRadio') || {}).textContent || '').slice(0, 40);
            const bike = game.vehicleManager.vehicles.find((v) => v.isBike);
            out.bike = bike ? !Radio.has(bike) : true;
            out.row = PauseMenu.SET_KEYS.includes('radio');
            game.mode = 'player'; game.activeCar.setControlled(false); game.activeCar = null; game._update(1 / 60);
            out.off = Radio.cur === -1 && !Radio.car;
            await new Promise((r) => setTimeout(r, 400));
            out.paused = Radio.el.paused;
            return out;
        });
        c.ok(rd5.missing.length === 0, `as ${rd5.files} músicas estão em assets/music${rd5.missing.length ? ' (faltam: ' + rd5.missing.join(', ') + ')' : ''}`);
        c.ok(rd5.credited === 0 && rd5.lic, `todas creditadas no Guia › Rádio e músicas, com licença e fonte${rd5.credited ? ` (${rd5.credited} sem crédito)` : ''}`);
        c.ok(rd5.cidade && rd5.duck && /RÁDIO CIDADE/.test(rd5.news), `boletim na Rádio Cidade: a música abaixa e o cartão diz a estação (${rd5.news})`);
        c.ok(rd5.bike, 'moto/bicicleta não tem rádio');
        c.ok(rd5.row, 'Ajustes › Rádio do carro');
        c.ok(rd5.off && rd5.paused, 'saindo do carro, o rádio desliga');
        c.noErrors(errors, 'direcao');
        await close();
    },
};
