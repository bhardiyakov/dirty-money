// ============================================================================
// DebugTools — atalhos de desenvolvimento, ativados com ?debug na URL.
//   dbg.tp(x, z)        teleporta o jogador (e a câmera)
//   dbg.tpNear(kind, i) teleporta perto de 'npc' | 'officer' | 'car' número i
//   dbg.step(n, dt)     avança n frames manualmente (funciona mesmo com aba oculta)
//   dbg.press(k, ms)    simula uma tecla (segura por ms de jogo)
//   dbg.view(half)      zoom (metade da altura visível, em unidades)
//   dbg.hud(bool)       mostra/esconde o HUD
//   dbg.flush()         termina de assar todos os sprites pendentes
//   dbg.perf(n)         mede ms/frame (lógica, render CPU, draw calls) — a 1ª chamada por execução sai lenta
//   dbg.car(k)          k-ésimo carro civil mais próximo | dbg.runOver(car, alvo, m/s, dist) atropelamento controlado
//   dbg.stars(n)        define as ★ na hora e o rádio passa a saber onde você está (testa 1★…5★)
//   dbg.calm()          zera a polícia: sem ★, forças extras/bloqueios/helicóptero removidos
//   dbg.chaseTest(s,n)  viaturas a 90–140u sem visada perseguem o jogador (imortal) com n★; mede chegada/rés/etc.
// ============================================================================

const DebugTools = {
    install(game) {
        const g = game;
        // Erros não capturados com pilha completa (o console do painel só mostra a mensagem).
        window.__errStacks = [];
        window.addEventListener('error', (e) => {
            const s = e.error && e.error.stack ? e.error.stack.split('\n').slice(0, 8).join(' | ') : e.message;
            window.__errStacks.push(s);
        });
        const dbg = {
            game: g,

            tp(x, z) {
                const p = new BABYLON.Vector3(x, 0, z);
                g.player.teleport(p);
                g.camera.snapTo(p);
                return [x, z];
            },

            // Teleporta para uma região do mapa grande pelo nome (trecho, sem acento/caixa): dbg.tpRegion('favela'), 'ilha', 'serra do sul'...
            tpRegion(name) {
                const n = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
                const r = WorldMap.regions.find((q) => n(q.name).includes(n(name)));
                if (!r) return WorldMap.regions.map((q) => q.name);
                this.tp(r.x, r.z);
                this.step(40, 0.05);
                return { region: r.name, biome: WorldMap.biomeAt(r.x, r.z), h: +WorldMap.heightAt(r.x, r.z).toFixed(1), terrain: g.gameEngine.world.terrain.info };
            },

            tpNear(kind, i = 0, dx = 3, dz = 0) {
                const list = kind === 'npc' ? g.npcManager.npcs
                    : kind === 'officer' ? g.policeManager.officers
                    : kind === 'car' ? g.vehicleManager.vehicles
                    : g.policeManager.cars;
                const t = list[i % list.length];
                return this.tp(t.position.x + dx, t.position.z + dz);
            },

            // Simula `seconds` de jogo medindo a saúde do trânsito: menor distância entre carros,
            // contatos (< 2,3u entre centros), desvio das faixas e carros parados sem motivo.
            monitor(seconds = 10, dt = 1 / 20) {
                const cars = g.vehicleManager.vehicles.concat(g.policeManager ? g.policeManager.cars : []);
                const pt = { x: 0, z: 0 };
                const stat = { minDist: 1e9, contacts: 0, offLane: 0, samples: 0, maxDev: 0, honks0: g.traffic.honks };
                const steps = Math.round(seconds / dt);
                const e = g.gameEngine.engine, orig = e.getDeltaTime;
                e.stopRenderLoop();
                e.getDeltaTime = () => dt * 1000;
                try {
                    for (let k = 0; k < steps; k++) {
                        g._update(dt); g._render(dt);
                        if (k % 5 !== 0) continue;
                        for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
                            const d = BABYLON.Vector3.Distance(cars[i].position, cars[j].position);
                            if (d < stat.minDist) stat.minDist = d;
                            if (d < 2.3) stat.contacts++;
                        }
                        for (const c of cars) if (c.mode === 'drive' && c.route) {
                            stat.samples++;
                            const p = c.position; const u = c.route.progress(p.x, p.z); c.route.pointAt(u, pt);
                            const dev = hypot(pt.x - p.x, pt.z - p.z);
                            if (dev > stat.maxDev) stat.maxDev = dev;
                            if (dev > 2.2) stat.offLane++;
                        }
                    }
                } finally { e.getDeltaTime = orig; g._start(); }
                stat.honks = g.traffic.honks - stat.honks0;
                stat.minDist = +stat.minDist.toFixed(2); stat.maxDev = +stat.maxDev.toFixed(2);
                stat.t = +g.signals.time.toFixed(0);
                return stat;
            },

            // Define a hora do dia (0–24) e aplica na hora.
            time(h) { g.dayNight.hour = h % 24; g.dayNight.apply(); return g.dayNight.label; },

            // Panorama do trânsito: quantos carros, velocidades, motivos de parada, buzinas.
            traffic() {
                const cars = g.vehicleManager.vehicles;
                const byMode = {}, byReason = {};
                let moving = 0, vsum = 0;
                for (const c of cars) {
                    byMode[c.mode || 'player'] = (byMode[c.mode || 'player'] || 0) + 1;
                    if (c.mode === 'drive') {
                        const v = Math.abs(c.forwardSpeed);
                        vsum += v; if (v > 1) moving++;
                        byReason[c.reason || 'livre'] = (byReason[c.reason || 'livre'] || 0) + 1;
                    }
                }
                const driving = byMode.drive || 0;
                return { total: cars.length, byMode, byReason, moving, avgSpeed: driving ? +(vsum / driving).toFixed(1) : 0, honks: g.traffic.honks, audio: AudioFX.honkCount, last: g.traffic.lastHonk };
            },

            // Estado dos sinais de um cruzamento (padrão: o mais próximo do jogador).
            signal(idx) {
                const p = g.player.position;
                const inter = idx === undefined ? CityGrid.intersectionNear(p.x, p.z, 1e9) : CityGrid.intersections[idx];
                const S = g.signals;
                return {
                    id: inter.id, at: [inter.x, inter.z],
                    ns: S.vehicle(inter, 'ns'), ew: S.vehicle(inter, 'ew'),
                    peds: inter.crosswalks.map((c) => [c.arm, S.ped(c).state, +S.ped(c).left.toFixed(1)]),
                };
            },

            // Monta uma travessia: n pedestres começam na ponta A da faixa `arm` (0=N,1=S,2=E,3=O)
            // do cruzamento `idx`, com destino na ponta B. Útil para ver espera no meio-fio.
            crossTest(idx = 0, arm = 0, n = 3) {
                const inter = CityGrid.intersections[idx];
                const cw = inter.crosswalks[arm];
                const ax = cw.axis === 'x';
                const mid = ax ? (cw.z0 + cw.z1) / 2 : (cw.x0 + cw.x1) / 2;
                const a0 = ax ? cw.x0 : cw.z0, a1 = ax ? cw.x1 : cw.z1;
                const mk = (along, lat) => g.nav.closestPoint(new BABYLON.Vector3(ax ? along : lat, 0, ax ? lat : along));
                const npcs = g.npcManager.npcs.slice(0, n);
                npcs.forEach((npc, k) => {
                    g.nav.crowd.agentTeleport(npc.index, mk(a0 - 3 - k * 1.2, mid + (k - 1) * 0.6));
                    npc.toWander();
                    npc.gotoTarget(mk(a1 + 4, mid));
                    npc.fsm.current.timer = 999;
                    npc.waiting = null; npc.crossing = null;
                });
                this.tp(ax ? (a0 + a1) / 2 : mid + 6, ax ? mid + 6 : (a0 + a1) / 2);
                return { cw: cw.arm, from: a0, to: a1, npcs: npcs.map((x) => x.id) };
            },

            // Avança n frames de `dt` segundos. O Havok usa engine.getDeltaTime() (tempo real do
            // frame), então ele é substituído por `dt` — senão a física anda mais devagar que a IA.
            step(n = 30, dt = 0.033) {
                const e = g.gameEngine.engine;
                e.stopRenderLoop();
                const orig = e.getDeltaTime;
                e.getDeltaTime = () => dt * 1000;
                try { for (let k = 0; k < n; k++) { g._update(dt); g._render(dt); } }
                finally { e.getDeltaTime = orig; g._start(); }
            },

            // Congela a lógica do jogo (a tela continua sendo desenhada → dá para tirar screenshots) e avança quadro a
            // quadro com adv(n). thaw() devolve o tempo real. (O Havok ainda anda um pouco a cada desenho.)
            freeze() {
                if (this._frozen) return;
                this._frozen = true; this._origUpdate = g._update.bind(g); g._update = () => {};
            },
            adv(n = 1, dt = 1 / 30) {
                const u = this._origUpdate || g._update.bind(g), e = g.gameEngine.engine, orig = e.getDeltaTime;
                e.getDeltaTime = () => dt * 1000;
                try { for (let i = 0; i < n; i++) { u(dt); g._render(dt); } } finally { e.getDeltaTime = orig; }
            },
            thaw() {
                if (!this._frozen) return;
                this._frozen = false; g._update = this._origUpdate;
            },

            // Mantém `key` apertada por `seconds` de jogo, avançando frames.
            press(key, seconds = 0.5, dt = 0.033) {
                const e = g.gameEngine.engine;
                e.stopRenderLoop();
                const orig = e.getDeltaTime;
                e.getDeltaTime = () => dt * 1000;
                window.dispatchEvent(new KeyboardEvent('keydown', { key }));
                try { for (let t = 0; t < seconds; t += dt) { g._update(dt); g._render(dt); } }
                finally { window.dispatchEvent(new KeyboardEvent('keyup', { key })); e.getDeltaTime = orig; g._start(); }
            },

            tap(key) {
                window.dispatchEvent(new KeyboardEvent('keydown', { key }));
                window.dispatchEvent(new KeyboardEvent('keyup', { key }));
            },

            view(half) { g.camera.viewHalf = half; g.camera._applyFov(); },

            hud(show) {
                const h = document.getElementById('hud');
                if (h) h.style.display = show ? '' : 'none';
                const m = document.getElementById('minimap');
                if (m) m.style.display = show ? '' : 'none';
                for (const id of ['hud2', 'vehPop', 'toast']) { const e = document.getElementById(id); if (e) e.style.visibility = show ? '' : 'hidden'; }
            },

            flush() { while (g.sprites.pump(50)) { /* assa tudo */ } },

            // Perseguição de ponta a ponta: jogador (imortal) numa calçada DENTRO de um quarteirão, as 3 viaturas
            // aparecem a 90–140u sem visada para ele, armas liberadas. Mede em quantos segundos cada viatura
            // chega a < 25u, quantas rés/empurrões/reposicionamentos precisou e onde paramos ao fim.
            // k-ésimo carro civil mais próximo do jogador (para testar batida, fogo e atropelamento).
            car(k = 0) {
                const p = g._playerState().pos;
                return g.vehicleManager.vehicles.filter((c) => !c.wrecked && !c.isBike).sort((a, b) => a.position.subtract(p).length() - b.position.subtract(p).length())[k];
            },

            // k-ésimo carro ESTACIONADO (trancado) mais próximo; dbg.beside(car, sign) põe o jogador ao lado da porta.
            parked(k = 0) {
                const p = g._playerState().pos;
                return g.vehicleManager.vehicles.filter((c) => !c.isBike && c.mode === 'parked' && !c.wrecked)
                    .sort((a, b) => a.position.subtract(p).length() - b.position.subtract(p).length())[k];
            },
            beside(car, sign = 1, dist = 1.6) {
                const A = CarDoors.axes(car), c = car.position;
                return this.tp(c.x + A.rx * sign * (car.halfW + dist), c.z + A.rz * sign * (car.halfW + dist));
            },

            // k-ésima bicicleta ('bicycle') ou moto ('moto') mais próxima; mode: 'drive' | 'parked' (opcional).
            bike(kind = 'moto', k = 0, mode = null) {
                const p = g._playerState().pos;
                return g.vehicleManager.vehicles.filter((c) => c.isBike && c.spec.id === kind && !c.wrecked && (!mode || c.baseMode === mode))
                    .sort((a, b) => a.position.subtract(p).length() - b.position.subtract(p).length())[k];
            },

            // k-ésimo barco ('jetski' | 'lancha' | 'barco', ou null = qualquer) mais próximo; mode: 'parked' | 'drive' (opcional).
            boat(kind = null, k = 0, mode = null) {
                const p = g._playerState().pos;
                return g.vehicleManager.boats.filter((c) => !c.wrecked && (!kind || c.spec.id === kind) && (!mode || c.mode === mode))
                    .sort((a, b) => a.position.subtract(p).length() - b.position.subtract(p).length())[k];
            },
            // Clima: dbg.weather('clear' | 'drizzle' | 'rain' | 'storm') troca na hora; sem argumento devolve o estado.
            weather(state = null) {
                const w = g.weather;
                if (state) w.set(state, true, true);
                return { state: w.state, k: +w.k.toFixed(2), grip: +w.gripMul.toFixed(2), sight: +w.sightMul.toFixed(2), rainyDay: w.rainyDay, plan: (w.plan || []).map((p) => `${p.s.toFixed(1)}-${p.e.toFixed(1)} ${p.peak}`), hour: +g.dayNight.hour.toFixed(1) };
            },
            // Dispara um raio agora (clarão + trovão).
            bolt(power = 1) { g.weather._bolt(power, true); return 'raio'; },

            // Leva o jogador ao cais da marina (ou ao k-ésimo barco, ao lado do casco).
            // Helicoptero do jogador: dbg.heli(i) leva ao i-esimo heliponto; dbg.heliBoard() embarca; dbg.heliFail() forca a pane; dbg.heliJump() pula.
            heli(i = 0) { const c = g.choppers[i]; if (!c) return "sem heliponto"; this.tp(c.position.x + 4, c.position.z); return c.position.x + "," + c.position.z; },
            heliBoard(i = 0) { const c = g.choppers[i]; if (c) g._boardChopper(c); return g.mode; },
            heliFail() { if (g.chopper) g.chopper.fail("Pane forcada"); return g.chopper && g.chopper.state; },
            heliJump() { g._leaveChopper(); return g.heliFall && g.heliFall.h0; },
            tpMarina() { const M = Marina; return this.tp(M.xe + 1, M.ZC); },

            // Atropelamento controlado: coloca o carro `car` a `dist`u do alvo (jogador/NPC/policial) em linha reta,
            // acelera até `speed` m/s e mede o resultado. Devolve { hpAntes, hpDepois, ... }.
            runOver(car, target, speed = 12, dist = 14) {
                const tp = target.position;
                const heading = 0;                                           // carro vai para +Z (norte)
                car.mode = 'abandoned'; car.setControlled(true);             // o teste dirige (TrafficCar.update não interfere)
                car.teleport(tp.x, tp.z - dist, heading);
                this.step(3, 1 / 30);
                const hp0 = target.hp;
                const out = { speed, hit: false, minD: 1e9 };
                for (let i = 0; i < 90 && !out.hit; i++) {
                    car.phys.setLinearVelocity(new BABYLON.Vector3(0, car.phys.getLinearVelocity().y, speed));
                    this.step(1, 1 / 30);
                    const d = hypot(car.position.x - tp.x, car.position.z - tp.z);
                    out.minD = Math.min(out.minD, d);
                    if (target.hp < hp0 || target.alive === false) out.hit = true;
                }
                out.hpBefore = hp0; out.hpAfter = target.hp; out.alive = target.alive !== false;
                car.setControlled(false); car.mode = 'abandoned';
                return out;
            },

            // Define as estrelas na hora e faz o rádio "saber" onde você está (como se uma testemunha avisasse).
            stars(n) {
                const pm = g.policeManager, p = g._playerState().pos;
                g.wanted.heatCd = 0;
                g.wanted._set(n, 'debug');
                if (pm && n > 0) pm.known = { x: p.x, z: p.z, vx: 0, vz: 0, t: pm.time };
                return n;
            },

            // Zera tudo da polícia (sem ★, forças extras removidas, sem memória) e deixa o jogador imortal ou não.
            calm() { g.wanted.bust(); g.policeManager.reset(); return 'calmo'; },

            chaseTest(seconds = 30, stars = 3) {
                const pm = g.policeManager, pl = g.player;
                this.calm();
                const q = g.nav.randomWalkable(); this.tp(q.x, q.z); pl.hp = 100;
                const spots = [];
                for (let k = 0; k < 400 && spots.length < pm.cars.length; k++) {
                    const l = RoadNet.randomLanePoint(14); if (!l) continue;
                    const d = hypot(l.point.x - q.x, l.point.z - q.z);
                    if (d > 90 && d < 140 && !MapGeo.hasLineOfSight(l.point.x, l.point.z, q.x, q.z)) spots.push(l);
                }
                pm.cars.forEach((c, i) => { const s = spots[i]; if (s) { c.teleport(s.point.x, s.point.z, Math.atan2(s.d.dx, s.d.dz)); c.route = null; } });
                this.step(30, 1 / 30);
                this.stars(stars);

                const n = pm.cars.length;
                const first = new Array(n).fill(null), rev = new Array(n).fill(0), ram = new Array(n).fill(0), reloc = new Array(n).fill(0);
                const lastRev = new Array(n).fill(0), lastRam = new Array(n).fill(false);
                const origTD = pl.takeDamage.bind(pl); pl.takeDamage = () => {};
                const origReloc = pm.cars.map((c) => c._relocate.bind(c));
                pm.cars.forEach((c, i) => { c._relocate = () => { const ok = origReloc[i](); if (ok) reloc[i]++; return ok; }; });
                const log = [];
                try {
                    for (let k = 0; k < seconds; k++) {
                        for (let s = 0; s < 3; s++) {
                            this.step(10, 1 / 30);
                            pm.cars.forEach((c, i) => {
                                if (c._reverseT > 0 && lastRev[i] <= 0) rev[i]++;
                                lastRev[i] = c._reverseT;
                                if (c.ramming && !lastRam[i]) ram[i]++;
                                lastRam[i] = c.ramming;
                                if (first[i] === null && c.distanceTo(pl.position) < 25) first[i] = k + 1;
                            });
                        }
                        if (k % 4 === 3) log.push((k + 1) + 's: ' + pm.cars.map((c) => Math.round(c.distanceTo(pl.position)) + (c.route ? 'R' : 'D') + (c.ramming ? '!' : '') + '/' + Math.round(c.forwardSpeed) + (c.reason ? ':' + c.reason : '')).join('  '));
                    }
                } finally {
                    pm.cars.forEach((c, i) => { c._relocate = origReloc[i]; });
                    pl.takeDamage = origTD;
                }
                return {
                    player: [Math.round(q.x), Math.round(q.z)], spots: spots.length, within25At: first, reverses: rev, rams: ram, relocs: reloc,
                    end: pm.cars.map((c) => Math.round(c.distanceTo(pl.position))), stoppedNear: pm.cars.filter((c) => c.stoppedNear).length,
                    reinforcements: pm.officers.filter((o) => o.temp).length, log,
                };
            },

            perf(n = 40) {
                const e = g.gameEngine.engine, s = g.scene, gl = e._gl;
                const si = new BABYLON.SceneInstrumentation(s);
                si.captureActiveMeshesEvaluationTime = true; si.captureRenderTargetsRenderTime = true;
                si.captureRenderTime = true; si.captureDrawCalls = true;
                e.stopRenderLoop();
                const px = new Uint8Array(4);
                let tUpdate = 0;
                const t0 = performance.now();
                for (let i = 0; i < n; i++) { const a = performance.now(); g._update(0.016); tUpdate += performance.now() - a; s.render(); }
                gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);   // força a GPU a terminar
                const out = {
                    totalMs: +((performance.now() - t0) / n).toFixed(1),
                    updateMs: +(tUpdate / n).toFixed(1),
                    renderCpuMs: +si.renderTimeCounter.average.toFixed(1),
                    shadowMs: +si.renderTargetsRenderTimeCounter.average.toFixed(1),
                    activeEvalMs: +si.activeMeshesEvaluationTimeCounter.average.toFixed(1),
                    draws: si.drawCallsCounter.current,
                    meshes: s.meshes.length,
                };
                si.dispose();
                g._start();
                return out;
            },
        };
        window.dbg = dbg;
        console.log('%c[debug] window.dbg disponível (tp, tpNear, step, press, view, hud, flush, perf)', 'color:#ffd23f');
        return dbg;
    },
};
