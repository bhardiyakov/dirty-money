// ============================================================================
// DevMode — modo de desenvolvimento para testar todos os cenários, ambientes e funcionalidades sem precisar jogar até lá.
// Liga em  ESC → CONFIGURAÇÕES → MODO DEV  (fica salvo). Ligado, aparece o botão "DEV" no topo da tela; a tecla ` (crase) ou o
// botão abre/fecha o painel (o jogo NÃO pausa: dá para testar ao vivo). Abas:
//   LOCAIS     teletransporte: regiões, hospital, delegacia, marina, pontes, viaduto, túnel, postos, rodovia, coordenadas, GPS
//   VEÍCULOS   gerar carros (todos os modelos), moto, bicicleta, jet ski, lancha e barco à frente do jogador (e entrar neles)
//   CLIMA/HORA hora do dia (atalhos + controle), congelar o relógio, chuva fraca/forte/tempestade, raio, travar o clima
//   POLÍCIA    ★ 0–5, polícia desligada, viatura/SWAT/exército/helicóptero na hora, limpar forças
//   JOGADOR    imortal, munição/gasolina infinitas, veículo indestrutível, velocidade, todas as armas, dinheiro, itens, escala de tempo
//   MUNDO      itens no chão, matar/reviver pedestres, explodir carros, depuração (grade de navegação, wireframe)
//   INFO       CAPACIDADE (folga de CPU/picos/memória/ritmo), custo de cada sistema, culling, zonas, varredura, FPS, draw calls, memória…
// Com o modo dev ligado, a barra CAPACIDADE DE CRESCIMENTO fica sempre no canto (ver core/Perf.js); MUNDO → TESTE DE CARGA enche a cidade
// até a barra cair, para medir quanto ainda cabe.
// ============================================================================

class DevMode {
    constructor(game) {
        this.g = game;
        this.enabled = false;
        this.open = false;
        this.tab = 'LOCAIS';
        this.flags = { god: false, ammo: false, fuel: false, tough: false, noPolice: false, freezeTime: false, lockWeather: false, enterOnSpawn: true };
        this.speedMul = 1;
        this._baseSpeed = null;
        this._infoT = 0; this.drawCalls = undefined;
        this._build();
        // Draw calls POR QUADRO: o contador cru do Babylon só zera em beginFrame (fora disso, ex.: render manual, ele acumula e chega a
        // milhões). Mede a diferença do contador entre o começo e o fim de cada render real.
        const dc = game.scene.getEngine()._drawCalls;
        let d0 = 0;
        game.scene.onBeforeRenderObservable.add(() => { d0 = dc.current; });
        game.scene.onAfterRenderObservable.add(() => { const d = dc.current - d0; if (d >= 0) this.drawCalls = d; });
        window.addEventListener('keydown', (e) => {
            if (!this.enabled || e.target.tagName === 'INPUT') return;
            if (e.key === '`' || e.key === '\'' && e.code === 'Backquote') { this.toggle(); e.preventDefault(); }
        });
    }

    // ------------------------------------------------------------------ liga/desliga (configurações)
    setEnabled(on) {
        on = !!on;
        if (on === this.enabled) return;
        this.enabled = on;
        this.badge.style.display = on ? 'block' : 'none';
        this.capEl.style.display = on ? 'block' : 'none';
        if (!on) { this.open = false; this.panel.style.display = 'none'; this._resetFlags(); }
        else if (this.g.ui && this.g._flash) this.g._flash('MODO DEV ligado — tecla ` ou botão DEV');
    }

    toggle() { this.open = !this.open; this.panel.style.display = this.open && this.enabled ? 'flex' : 'none'; this.capEl.style.left = this.open ? 'min(362px, 50vw)' : '12px'; if (this.open) this._render(); }

    // Desligar o modo dev devolve tudo ao normal (velocidade, relógio, clima, escala de tempo).
    _resetFlags() {
        for (const k of Object.keys(this.flags)) this.flags[k] = k === 'enterOnSpawn';
        this._applySpeed(1); this._freezeTime(false); this._lockWeather(false); this.g.timeScale = 1;
    }

    // ----------------------------------------------------------------------- DOM
    _build() {
        const css = document.createElement('style');
        css.textContent = `
            #devBadge { position: fixed; top: 4px; left: 50%; transform: translateX(-50%); z-index: 45; display: none; padding: 5px 14px; cursor: pointer; font: 700 13px 'Silkscreen', monospace;
                color: #0b1f12; background: #6dff8a; border: 3px solid #07090d; box-shadow: 0 0 0 2px #2f6a47; }
            #devPanel { position: fixed; top: 38px; left: 8px; bottom: 8px; width: min(340px, 94vw); z-index: 44; display: none; flex-direction: column; color: #e9fff0;
                font: 12px/1.35 'Silkscreen', 'Courier New', monospace; background: rgba(8,14,12,0.9); border: 3px solid #2f6a47; box-shadow: 0 0 0 2px #07090d; }
            #devPanel .dt { display: flex; flex-wrap: wrap; gap: 3px; padding: 5px; background: #0b1f12; }
            #devPanel .dt div { padding: 4px 7px; cursor: pointer; background: #14301f; border: 2px solid #07090d; font-weight: 700; }
            #devPanel .dt div.on { background: #6dff8a; color: #0b1f12; }
            #devBody { flex: 1; overflow: auto; padding: 6px; }
            #devBody h5 { margin: 8px 0 4px; color: #ffe27a; font-size: 12px; letter-spacing: 1px; }
            #devBody .row { display: flex; flex-wrap: wrap; gap: 4px; }
            #devBody .b { padding: 5px 8px; cursor: pointer; background: #1a2b22; border: 2px solid #07090d; box-shadow: inset 0 0 0 1px #3a6a50; }
            #devBody .b:hover { background: #26493a; color: #6dff8a; } #devBody .b:active { background: #6dff8a; color: #0b1f12; }
            #devBody .b.on { background: #1f6a3a; color: #eaffef; box-shadow: inset 0 0 0 2px #6dff8a; }
            #devBody input[type=number] { width: 70px; background: #0b1f12; color: #e9fff0; border: 2px solid #3a6a50; padding: 3px; font: inherit; }
            #devBody input[type=range] { width: 100%; accent-color: #6dff8a; }
            #devBody pre { white-space: pre-wrap; margin: 0; color: #cfeedd; }
            #devCap { position: fixed; top: 12px; left: 12px; z-index: 45; display: none; width: min(360px, 80vw); padding: 7px 10px 8px;
                font: 600 11px/1.3 Inter, system-ui, sans-serif; color: #e8eef7; background: rgba(10,14,22,0.82); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px;
                -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); pointer-events: none; }
            #devCap .t { display: flex; justify-content: space-between; letter-spacing: 0.04em; }
            #devCap .t b { font-size: 13px; font-variant-numeric: tabular-nums; }
            #devCap .bar { position: relative; height: 9px; margin: 5px 0 4px; border-radius: 99px; background: rgba(255,255,255,0.1); overflow: hidden; }
            #devCap .bar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 99px; transition: width .4s ease, background .4s ease; }
            #devCap .s { display: flex; justify-content: space-between; color: #9aa7b8; font-weight: 500; font-variant-numeric: tabular-nums; }
            #devPanel .hint { padding: 4px 8px; color: #8fb09c; font-size: 10px; border-top: 2px solid #1d3a2a; }`;
        document.head.appendChild(css);
        const badge = this.badge = document.createElement('div');
        badge.id = 'devBadge'; badge.textContent = 'DEV';
        badge.addEventListener('click', () => this.toggle());
        document.body.appendChild(badge);
        // Barra de CAPACIDADE (sempre visível com o modo dev ligado): quanto o jogo ainda pode crescer sem perder 30 FPS/travar (ver core/Perf.js).
        const cap = this.capEl = document.createElement('div');
        cap.id = 'devCap';
        cap.innerHTML = '<div class="t"><span>CAPACIDADE DE CRESCIMENTO</span><b id="dcPct">–</b></div><div class="bar"><i id="dcBar"></i></div><div class="s"><span id="dcA"></span><span id="dcB"></span></div>';
        document.body.appendChild(cap);
        const p = this.panel = document.createElement('div');
        p.id = 'devPanel';
        p.innerHTML = '<div class="dt" id="devTabs"></div><div id="devBody"></div><div class="hint">` abre/fecha · o jogo continua rodando · ESC → CONFIGURAÇÕES desliga o modo dev</div>';
        document.body.appendChild(p);
        for (const t of ['keydown', 'keyup']) p.addEventListener(t, (e) => e.stopPropagation());       // digitar nos campos não mexe no jogo
        this.tabsEl = p.querySelector('#devTabs'); this.body = p.querySelector('#devBody');
        for (const name of ['LOCAIS', 'VEÍCULOS', 'CLIMA/HORA', 'POLÍCIA', 'JOGADOR', 'MUNDO', 'INFO']) {
            const d = document.createElement('div'); d.textContent = name; d.dataset.t = name;
            d.addEventListener('click', () => { this.tab = name; this._render(); });
            this.tabsEl.appendChild(d);
        }
    }

    // Monta o conteúdo da aba atual.
    _render() {
        const body = this.body; body.innerHTML = '';
        for (const d of this.tabsEl.children) d.classList.toggle('on', d.dataset.t === this.tab);
        this._row = null;
        const H = (t) => { const h = document.createElement('h5'); h.textContent = t; body.appendChild(h); this._row = document.createElement('div'); this._row.className = 'row'; body.appendChild(this._row); };
        const B = (label, fn, on = null) => { const b = document.createElement('div'); b.className = 'b' + (on ? ' on' : ''); b.textContent = label; b.addEventListener('click', () => { fn(); if (this.tab !== 'INFO') this._render(); }); this._row.appendChild(b); return b; };
        const T = (label, key, after = null) => B(`${this.flags[key] ? '■' : '□'} ${label}`, () => { this.flags[key] = !this.flags[key]; if (after) after(this.flags[key]); }, this.flags[key]);
        const g = this.g;
        const S = this['_tab' + ['LOCAIS', 'VEÍCULOS', 'CLIMA/HORA', 'POLÍCIA', 'JOGADOR', 'MUNDO', 'INFO'].indexOf(this.tab)];
        if (S) S.call(this, H, B, T, g);
    }

    // =============================================================== LOCAIS
    _tab0(H, B, T, g) {
        H('REGIÕES');
        for (const r of WorldMap.regions) B(r.name, () => this.tp(r.x, r.z));
        H('LUGARES');
        B('Centro', () => this.tp(0, 0));
        if (SafeHouse.placed) {
            B('Safe house (dentro)', () => { const s = SafeHouse.spawnWorld(); this.tp(s.x, s.z); });
            B('Safe house (porta)', () => { const d = SafeHouse.doorWorld(); this.tp(d.x, d.z - 7); });
        }
        B('Baile funk: ligar/desligar (vira 22h)', () => { Baile.force = !Baile.force; if (Baile.force) { g.dayNight.hour = 22; g.dayNight.apply(); } g._flash('Baile ' + (Baile.force ? 'LIGADO (22h)' : 'desligado (agenda normal)')); });
        B('Ir ao ponto de mototáxi', () => { const s = MotoStands.stands && MotoStands.stands[1]; if (s) this.tp(s.x - 2, s.z); });
        B('Ir ao baile', () => { const c = Baile.site(); this.tp(c.x + 12, c.z); });
        B('Operação policial (favela)', () => { if (!g.op.start(undefined, true)) g._flash('Já em andamento'); });
        B('Encerrar operação', () => g.op.stop());
        H('IMÓVEIS'); for (const t of RealEstate.TIERS) { const p = RealEstate.list.find((q) => q.type === t.type); if (p) B(`${t.type} (${brl(RealEstate.price(p))})`, () => this.tp(p.x, p.z - 3)); }
        B('Morar: favela C.V', () => { Standing.setHome('cv'); g._flash('Safe house: favela C.V (morador)'); });
        B('Morar: asfalto (traidor)', () => { Standing.setHome(null); g._flash('Mudou para o asfalto: a favela C.V agora é hostil'); });
        B('Hospital', () => { const p = CityGrid.landmarkSpawn('hospital'); this.tp(p.x, p.z); });
        B('Delegacia', () => { const p = CityGrid.landmarkSpawn('station'); this.tp(p.x, p.z); });
        B('Marina', () => this.tp(Marina.xe + 1, Marina.ZC));
        B('Viaduto', () => this.tp(CityGrid.districts.viaduct.x, (CityGrid.districts.viaduct.z0 + CityGrid.districts.viaduct.z1) / 2));
        const tn = (RoadPlan.tunnels || [])[0]; if (tn) B('Túnel', () => this.tp((tn.x0 + tn.x1) / 2, (tn.z0 + tn.z1) / 2));
        for (const z of [714, 0, -630]) B(`Ponte z=${z}`, () => this.tp(324, z));
        B('Rodovia oeste', () => this.tp(-1200, 290));
        const sp = (CityGrid.shorePoints || [])[40]; if (sp) B('Orla / praia', () => this.tp(sp.x - sp.nx * 4, sp.z - sp.nz * 4));
        B('Mar (nadar)', () => this.tp(300, 300));
        H('POSTOS DE GASOLINA');
        const me = this._pos(); const st = (CityGrid.stations || []).slice().sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z));
        for (const s of st.slice(0, 8)) B(`${s.name} (${Math.round(Math.hypot(s.x - me.x, s.z - me.z))}u)`, () => this.tp(s.x, s.z - 9));
        H('COORDENADAS');
        const mk = (ph, v) => { const i = document.createElement('input'); i.type = 'number'; i.placeholder = ph; i.value = v; this._row.appendChild(i); return i; };
        const ix = mk('X', Math.round(me.x)), iz = mk('Z', Math.round(me.z));
        B('Ir', () => this.tp(+ix.value, +iz.value));
        if (g.gps) B('Ir ao GPS marcado', () => this.tp(g.gps.x, g.gps.z));
    }

    // =============================================================== VEÍCULOS
    _tab1(H, B, T, g) {
        H('OPÇÕES'); T('Entrar no veículo ao gerar', 'enterOnSpawn');
        H('CARROS');
        for (const id of Object.keys(CarSheet.MODELS)) B(CarSheet.MODELS[id].name, () => this.spawnCar(id));
        H('DUAS RODAS');
        B('Moto', () => this.spawnBike('moto')); B('Bicicleta', () => this.spawnBike('bicycle'));
        H('BARCOS (na água mais próxima)');
        for (const id of Object.keys(BoatSheet.MODELS)) B(BoatSheet.MODELS[id].name, () => this.spawnBoat(id));
        H('VEÍCULO ATUAL');
        B('Reparar + abastecer', () => { const c = g.activeCar; if (c) { c.hp = c.maxHp; c.burning = 0; c.wrecked = false; c.engineDead = false; c.dent = 0; c.fuel = c.tank; g._flash('Veículo reparado'); } });
        B('Esvaziar tanque', () => { const c = g.activeCar; if (c) c.fuel = 0; });
        B('Destruir (explode)', () => { const c = g.activeCar; if (c) c.takeDamage(99999, 'env'); });
        B('Sair do veículo', () => { if (g.mode === 'car') g._leaveVehicle(); });
    }

    // =============================================================== CLIMA / HORA
    _tab2(H, B, T, g) {
        H('HORA DO DIA — ' + g.dayNight.label);
        for (const [l, h] of [['Madrugada 3h', 3], ['Amanhecer 6h', 6.2], ['Manhã 9h', 9], ['Meio-dia 12h', 12], ['Tarde 16h', 16.5], ['Pôr do sol 18h', 18.4], ['Noite 22h', 22], ['Meia-noite', 0]]) B(l, () => this.setHour(h));
        const sl = document.createElement('input'); sl.type = 'range'; sl.min = 0; sl.max = 24; sl.step = 0.1; sl.value = g.dayNight.hour;
        sl.addEventListener('input', () => { this.setHour(+sl.value); body.querySelector('h5').textContent = 'HORA DO DIA — ' + g.dayNight.label; }); const body = this.body; body.appendChild(sl);
        this._row = null;
        H('RELÓGIO'); T('Congelar o relógio', 'freezeTime', (v) => this._freezeTime(v)); B('+2h', () => g.dayNight.skip(2));
        H('CLIMA — ' + g.weather.label);
        for (const [k, l] of [['clear', 'Céu limpo'], ['drizzle', 'Chuva fraca'], ['rain', 'Chuva forte'], ['storm', 'Tempestade']]) B(l, () => { g.weather.set(k, true, true); if (this.flags.lockWeather) g.weather.override = 1e9; }, g.weather.state === k);
        T('Travar o clima escolhido', 'lockWeather', (v) => this._lockWeather(v));
        B('⚡ Raio agora', () => g.weather._bolt(1, true));
        B('Sortear o dia (calendário)', () => { g.weather.override = 0; g.weather._planDay(false); g._flash(g.weather.rainyDay ? 'Hoje vai chover: ' + g.weather.plan.map((p) => `${p.s.toFixed(0)}h-${p.e.toFixed(0)}h`).join(', ') : 'Dia seco'); });
        B('Forçar chuva hoje (+1h)', () => { g.weather.override = 0; const h = g.dayNight.hour; g.weather.plan = [{ s: h + 0.2, e: Math.min(24, h + 3), peak: 'storm' }]; g.weather.rainyDay = true; });
    }

    // =============================================================== POLÍCIA
    _tab3(H, B, T, g) {
        H('NÍVEL DE PROCURADO — ' + g.wanted.level + '★');
        for (let n = 0; n <= 5; n++) B(n + '★', () => this.stars(n), g.wanted.level === n);
        T('Polícia desligada (sem ★)', 'noPolice');
        const pm = g.policeManager;
        H('FORÇAS');
        if (pm) {
            const near = () => { const p = this._pos(); return { x: p.x, z: p.z }; };
            B('+ Viatura', () => pm.spawnCar(near())); B('+ SWAT', () => pm.spawnCar(near(), PoliceManager.TEAMS.swat)); B('+ Exército', () => pm.spawnCar(near(), PoliceManager.TEAMS.army));
            B('Helicóptero', () => { if (!pm.heli) pm._spawnHeli(near()); }); B('Remover helicóptero', () => pm.removeHeli());
            B('Limpar forças', () => { g.wanted.bust(); pm.reset(); });
        }
    }

    // =============================================================== JOGADOR
    _tab4(H, B, T, g) {
        H('PROTEÇÃO'); T('Imortal', 'god'); T('Veículo indestrutível', 'tough'); T('Gasolina infinita', 'fuel'); T('Munição infinita', 'ammo');
        H('VELOCIDADE A PÉ');
        for (const m of [1, 2, 4]) B('x' + m, () => this._applySpeed(m), this.speedMul === m);
        H('ESCALA DE TEMPO (jogo)');
        for (const m of [0.25, 0.5, 1, 2]) B('x' + m, () => { g.timeScale = m; }, (g.timeScale || 1) === m);
        H('VIDA E ITENS');
        B('Curar + colete', () => { g.player.hp = g.player.maxHp; g.player.wearVest(100); });
        B('Todas as armas', () => { for (const k of Object.keys(Weapons)) if (g.inventory.weapons[k]) g.inventory.addWeapon(k, 120); g._flash('Todas as armas + munição'); });
        B('+5 kits médicos', () => { g.inventory.medkits += 5; }); B('+5 hacks', () => { g.inventory.hacks += 5; }); B('+5 chaves', () => { g.inventory.keys += 5; });
        H('DINHEIRO'); B('+R$ 1.000', () => g.inventory.addCash(1000)); B('+R$ 100.000', () => g.inventory.addCash(100000)); B('Zerar', () => { g.inventory.cash = 0; });
    }

    // =============================================================== MUNDO
    _tab5(H, B, T, g) {
        H('ITENS NO CHÃO (à frente)');
        for (const [k, t] of Object.entries(Pickups.TYPES)) B(t.label || k, () => { const p = this._ahead(3); g.pickups.add(k, { x: p.x, z: p.z }, { ttl: 0 }); });
        H('TESTE DE CARGA (barra de capacidade)');
        B('+10 pedestres', () => this._addPeds(10));
        B('+10 carros', () => this._addCars(10));
        B(this._stress ? 'Parar teste automático' : 'Teste automático', () => this._stressToggle());
        H('PEDESTRES');
        B('Matar todos', () => { for (const n of g.npcManager.npcs) if (n.alive) n.takeDamage(999, g.player.position, 'env'); });
        B('Assustar todos', () => { for (const n of g.npcManager.npcs) if (n.alive) n.panic(g.player.position); });
        B('Chuva de dinheiro', () => { for (let i = 0; i < 12; i++) { const p = this._ahead(2 + Math.random() * 6, (Math.random() - 0.5) * 8); g.pickups.add('cash', { x: p.x, z: p.z }, { amount: 100, ttl: 60 }); } });
        H('EXPLOSÕES');
        B('Explodir carros num raio de 40', () => { const p = this._pos(); for (const c of g.vehicleManager.vehicles) if (Math.hypot(c.position.x - p.x, c.position.z - p.z) < 40 && c !== g.activeCar) c.takeDamage(99999, 'player'); });
        B('Explosão à frente', () => { const p = this._ahead(8); g.carDamage._blast(p.x, p.z, 9, 'player', null, 1); AudioFX.explosion(p.x, p.z); g.camera.shake(1); });
        H('DEPURAÇÃO');
        B('Grade de navegação (N)', () => g._toggleNavDebug());
        B('Wireframe', () => { g.scene.forceWireframe = !g.scene.forceWireframe; });
        B('Esconder HUD', () => { const e = document.getElementById('hud2'); if (e) e.style.visibility = e.style.visibility === 'hidden' ? '' : 'hidden'; });
        B('Abrir mapa', () => g.menu.open('map'));
    }

    // =============================================================== INFO
    _tab6(H, B, T, g) {
        H('ESTATÍSTICAS (ao vivo)');
        const pre = document.createElement('pre'); pre.id = 'devInfo'; this.body.appendChild(pre); this._info();
    }

    _info() {
        const pre = document.getElementById('devInfo'); if (!pre) return;
        const g = this.g, e = g.gameEngine.engine, sc = g.scene, p = this._pos(), m = performance.memory;
        const pe = sc.getPhysicsEngine();
        const C = Perf.capacity(), rc = g.renderCuller, Z = Zones.count;
        pre.textContent = [
            `CAPACIDADE: ${Math.round(C.total * 100)}%  (limite: ${C.limit})`,
            `  CPU média ${Math.round(C.cpu * 100)}% · pico ${Math.round(C.peak * 100)}% · memória ${Math.round(C.mem * 100)}% · ritmo ${Math.round(C.pace * 100)}% (${Perf.interval.toFixed(0)} ms entre quadros)`,
            `  cabe ~${C.growth.toFixed(1)}× o conteúdo atual`,
            `Quadro (trabalho): ${Perf.frameAvg.toFixed(1)} ms de ${Perf.budgetMs.toFixed(1)} · p95 ${Perf.p95.toFixed(1)} ms · pior (3 s) ${Perf.peak.toFixed(1)} ms`,
            `Heap: ${Math.round(Perf.heapMB)} MB / orçamento ${Math.round(C.memBudget)} MB · tendência ${Perf.heapSlope >= 0 ? '+' : ''}${Perf.heapSlope.toFixed(1)} MB/min${Perf.heapSlope > 4 ? '  ⚠ SUBINDO' : ''}`,
            `Render: ${rc ? rc.stats.candidates + ' candidatas (' + rc.stats.static + ' estáticas na grade, ' + rc.stats.dynamic + ' dinâmicas)' : '-'}`,
            `Zonas: ativa ${Z[0]} · perto ${Z[1]} · dormindo ${Z[2]}`,
            `Varredura 3 s: ${g._sweepInfo || '-'}`,
            '— custo por sistema (ms/quadro) —',
            ...Perf.top(14).map(([k, v]) => `  ${v.toFixed(2).padStart(6)}  ${k}`),
            '',
            `FPS: ${Math.round(e.getFps())} (teto ${Config.perf.fpsCap})`, `Draw calls por quadro: ${this.drawCalls === undefined ? "-" : this.drawCalls}`, `Malhas: ${sc.meshes.length} (ativas ${sc.getActiveMeshes().length})`,
            `Corpos de física: ${pe ? pe._physicsBodies.length : '-'}`, `Memória JS: ${m ? Math.round(m.usedJSHeapSize / 1048576) + ' MB' : '-'}`,
            `Posição: ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`, `Hora: ${g.dayNight.label}  Clima: ${g.weather.label}${g.weather.rainyDay ? ' (dia chuvoso)' : ''}`,
            `Procurado: ${g.wanted.level}★  Dinheiro: ${brl(g.inventory.cash)}`,
            `Carros: ${g.vehicleManager ? g.vehicleManager.vehicles.length : 0}  Barcos: ${g.vehicleManager ? g.vehicleManager.boats.length : 0}  Polícia: ${g.policeManager ? g.policeManager.cars.length + '+' + g.policeManager.officers.length : 0}`,
            `Pedestres: ${g.npcManager ? g.npcManager.count : 0}  Colisores: ${g.colliderStream ? g.colliderStream.active.length : 0}`,
            g.activeCar ? `Veículo: ${g.activeCar.spec.name}  vel ${g.activeCar.speed.toFixed(1)} m/s  gasolina ${Math.round(g.activeCar.fuel)}/${g.activeCar.tank}  vida ${Math.round(g.activeCar.hp)}` : 'A pé',
        ].join('\n');
    }

    // Teste de carga: mais pedestres/carros em volta do jogador (somem com a reciclagem normal se você se afastar).
    _addPeds(n) {
        const g = this.g, M = g.npcManager;
        for (let i = 0; i < n; i++) {
            const { pos, role } = M._place(null, 10, 70);
            const npc = new NPC(M.scene, M.nav, pos, 10000 + (this._pid = (this._pid || 0) + 1), M.sprites, M.ctx, role);
            npc.setStyle(M._style(pos, role)); M.npcs.push(npc);
        }
    }
    _addCars(n) { const T = this.g.traffic; for (let i = 0; i < n; i++) T._spawnCar('drive', null, T.ring(20, 110)); }
    // Automático: a cada 4 s põe +10 pedestres e +5 carros até a capacidade cair abaixo de 15% (ou +300 entidades) e diz quanto coube.
    _stressToggle() {
        if (this._stress) { clearInterval(this._stress); this._stress = null; return; }
        const g = this.g, n0 = g.npcManager.npcs.length + g.vehicleManager.vehicles.length, c0 = Perf.capacity().total;
        g._flash(`Teste de carga: começando com ${n0} entidades, capacidade ${Math.round(c0 * 100)}%`);
        this._stress = setInterval(() => {
            const c = Perf.capacity().total, n = g.npcManager.npcs.length + g.vehicleManager.vehicles.length;
            if (c < 0.15 || n - n0 >= 300) {
                clearInterval(this._stress); this._stress = null;
                const msg = `Teste de carga: +${n - n0} entidades (total ${n}) até a capacidade chegar a ${Math.round(c * 100)}%`;
                console.log('[CARGA] ' + msg); g._flash(msg); this.stressResult = { added: n - n0, total: n, cap: c, cap0: c0 };
                if (this.open) this._render();
                return;
            }
            this._addPeds(10); this._addCars(5);
        }, 4000);
    }

    // Barra de capacidade: verde > 50%, amarelo 25–50%, vermelho < 25%.
    _cap() {
        const C = Perf.capacity(), pct = Math.round(C.total * 100), $ = (id) => document.getElementById(id);
        if (!$('dcPct')) return;
        $('dcPct').textContent = pct + '%';
        const bar = $('dcBar');
        bar.style.width = Math.max(2, pct) + '%';
        bar.style.background = pct > 50 ? 'linear-gradient(90deg,#10b981,#34d399)' : pct > 25 ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' : 'linear-gradient(90deg,#e11d48,#fb7185)';
        $('dcA').textContent = `${Perf.frameAvg.toFixed(1)} ms/quadro · p95 ${Perf.p95.toFixed(0)} ms · ~${C.growth.toFixed(1)}×`;
        $('dcB').textContent = `${Math.round(Perf.heapMB)} MB ${Perf.heapSlope > 4 ? '↑' + Perf.heapSlope.toFixed(0) + '/min' : ''} · ${C.limit}`;
    }

    // ================================================================== utilidades
    _pos() { const g = this.g; return g.mode === 'car' && g.activeCar ? g.activeCar.position : g.player.position; }

    // Ponto `d` u à frente do jogador (e `side` u para o lado).
    _ahead(d, side = 0) {
        const g = this.g, p = this._pos(), a = g.mode === 'car' && g.activeCar ? Math.atan2(g.activeCar.body.getDirection(BABYLON.Axis.Z).x, g.activeCar.body.getDirection(BABYLON.Axis.Z).z) : g.player.root.rotation.y;
        return { x: p.x + Math.sin(a) * d + Math.cos(a) * side, z: p.z + Math.cos(a) * d - Math.sin(a) * side, a };
    }

    tp(x, z) {
        const g = this.g;
        if (g.mode === 'car' && g.activeCar) { const f = g.activeCar.body.getDirection(BABYLON.Axis.Z); g.activeCar.teleport(x, z, Math.atan2(f.x, f.z)); }
        else g.player.teleport(new BABYLON.Vector3(x, 0, z));
        g.camera.snapTo({ x, z });
        g._flash(`Teletransportado: ${Math.round(x)}, ${Math.round(z)}`);
    }

    _enter(car) {
        const g = this.g;
        if (g.mode === 'car') g._dropFromCar();
        car.locked = false; car.hold = false; car.driver = false;
        car.setControlled(true);
        if (car.isBike) car.setRider(0);
        g.activeCar = car; g.mode = 'car'; g.player.setVisible(false);
        g.ui.showVehicle(car);
    }

    spawnCar(model) {
        const g = this.g, p = this._ahead(7), paints = [0, 1, 3, 4, 5, 7, 8, 9];
        const car = new TrafficCar(g.scene, g.physics, { x: p.x, z: p.z }, g.traffic._nextId++, g.carLib.sheet(model), paints[Math.floor(Math.random() * paints.length)], p.a + Math.PI / 2, g.traffic);
        if (g.gameEngine.shadowGenerator) g.gameEngine.shadowGenerator.addShadowCaster(car.body);
        g.vehicleManager.vehicles.push(car);
        car.baseMode = 'parked'; car.park(); car.locked = false; car.fuel = car.tank;
        if (this.flags.enterOnSpawn) this._enter(car);
        g._flash(`${car.spec.name} gerado`);
        return car;
    }

    spawnBike(kind) {
        const g = this.g, p = this._ahead(5), id = g.traffic._nextId++, civ = g.sprites.civilianVariants;
        const bike = new TrafficCar(g.scene, g.physics, { x: p.x, z: p.z }, id, Bikes.sheet(g.sprites, kind, 'park'), 4, p.a + Math.PI / 2, g.traffic);
        bike.baseMode = 'parked'; bike.frameVariant = 2 + (id * 5) % civ;
        if (g.gameEngine.shadowGenerator) g.gameEngine.shadowGenerator.addShadowCaster(bike.body);
        g.vehicleManager.vehicles.push(bike);
        bike.park(); bike.locked = false; bike.fuel = bike.tank;
        if (this.flags.enterOnSpawn) this._enter(bike);
        g._flash(`${bike.spec.name} gerada`);
    }

    // Barco na água mais próxima do jogador (procura em anéis crescentes).
    spawnBoat(kind) {
        const g = this.g, p = this._pos();
        let spot = null;
        for (let r = 0; r <= 400 && !spot; r += 10) {
            for (let a = 0; a < 16 && !spot; a++) {
                const x = p.x + Math.cos(a * Math.PI / 8) * r, z = p.z + Math.sin(a * Math.PI / 8) * r;
                if (!MapGeo.isLand(x, z) && WorldMap.inWorld(x, z) && WorldMap.dist[WorldMap.index(x, z)] > 8) spot = { x, z };
            }
        }
        if (!spot) { g._flash('Sem água por perto'); return; }
        const boat = g.boats._make(kind, spot.x, spot.z, Math.random() * Math.PI * 2, BoatSheet.PAINT_ROWS[kind][0], 'parked');
        if (this.flags.enterOnSpawn) { this.tp(spot.x, spot.z); this._enter(boat); }
        else g._flash(`${boat.spec.name} gerado em ${Math.round(spot.x)}, ${Math.round(spot.z)}`);
    }

    stars(n) {
        const g = this.g, pm = g.policeManager, p = this._pos();
        g.wanted.heatCd = 0; g.wanted._set(n, 'debug');
        if (pm && n > 0) pm.known = { x: p.x, z: p.z, vx: 0, vz: 0, t: pm.time };
        if (n === 0 && pm) pm.reset();
    }

    setHour(h) { this.g.dayNight.hour = h % 24; this.g.dayNight.apply(); }

    _freezeTime(on) {
        if (on) { if (this._cycle === undefined) this._cycle = Config.time.cycleSeconds; Config.time.cycleSeconds = 1e12; }
        else if (this._cycle !== undefined) { Config.time.cycleSeconds = this._cycle; this._cycle = undefined; }
    }
    _lockWeather(on) { this.g.weather.override = on ? 1e9 : 0; }

    _applySpeed(m) {
        if (!this._baseSpeed) this._baseSpeed = { w: Config.player.maxSpeed, s: Config.player.sprintSpeed };
        this.speedMul = m; Config.player.maxSpeed = this._baseSpeed.w * m; Config.player.sprintSpeed = this._baseSpeed.s * m;
    }

    // Todo frame (Game): mantém os "cheats" ligados e atualiza a aba INFO.
    update(dt) {
        if (!this.enabled) return;
        const g = this.g, F = this.flags;
        if (F.god && g.player.alive) { g.player.hp = g.player.maxHp; }
        if (F.ammo) for (const k of Object.keys(g.inventory.weapons)) { const w = g.inventory.weapons[k]; if (w.owned && g.inventory.isGun(k)) { w.mag = Weapons[k].mag; w.reserve = Math.max(w.reserve, 99); } }
        const c = g.activeCar;
        if (c && F.fuel && c.tank > 0) c.fuel = c.tank;
        if (c && F.tough && !c.wrecked) { c.hp = c.maxHp; c.burning = 0; c.dent = 0; }
        if (F.noPolice && g.wanted.level > 0) { g.wanted.bust(); if (g.policeManager) g.policeManager.reset(); }
        this._capT = (this._capT || 0) - dt;
        if (this._capT <= 0) { this._capT = 0.5; this._cap(); }
        if (this.open && this.tab === 'INFO') { this._infoT -= dt; if (this._infoT <= 0) { this._infoT = 0.25; this._info(); } }
    }
}
