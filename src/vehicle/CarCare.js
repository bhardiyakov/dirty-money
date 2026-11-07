// ============================================================================
// CarCare — a MECÂNICA dos carros e motos que o jogador usa: cada veículo tem PEÇAS com desgaste (0..1) e elas mudam a direção.
//
//   MOTOR        < 50%: falha (o acelerador corta de vez em quando) e perde força; < 15%: morre sozinho; fundido (0): não liga.
//   ARREFECIMENTO  radiador ruim = o motor ESQUENTA (ponteiro no painel). Esquentou demais: perde força, solta vapor, gasta o motor e,
//                no limite, apaga até esfriar. Batida de frente e tiro no capô furam o radiador.
//   ÓLEO         gasta devagar e VAZA depois de batida forte. Pouco óleo = o motor se desgasta rápido; sem óleo = funde.
//   BATERIA      fraca: a partida falha (acelere de novo para tentar; o auxiliar de partida resolve); morta: não pega.
//   FREIOS       gastam com o uso: freio ruim para muito mais longe.
//   PNEUS        gastam com a quilometragem e a derrapagem: careca = menos aderência (pior na chuva) e pode furar; furado (tiro) = escorrega.
//   SUSPENSÃO    batida de lado desalinha: o carro PUXA para um lado e balança.
//   LATARIA      a vida de sempre (Vehicle.hp): funilaria.
// Painel (#dash) dirigindo: HUD LIMPO — só os AVISOS, quando há (cartões piscando: combustível baixo com a barra, problema no motor,
// esquentando, óleo, bateria, freio, pneu, suspensão, lataria; no PC embaixo à direita, no celular embaixo no centro); carro bom = nada. A pé, perto do carro: E abre o CAPÔ (diagnóstico e
// troca de peças pelo próprio jogador — economy/Mechanic.js vende as peças) ou o PORTA-MALAS (guardar itens, como o baú: ui/StashUI.js).
// Carro seu (garagem) guarda peças e porta-malas no save; carro de rua só enquanto existir. Preso perto do carro: a polícia revista o
// porta-malas (o FUNDO FALSO do desmanche esconde tudo).
// ============================================================================

const CarCare = {
    PARTS: ['engine', 'cool', 'oil', 'battery', 'brakes', 'susp'],
    NAME: { engine: 'Motor', cool: 'Arrefecimento (radiador)', oil: 'Óleo', battery: 'Bateria', brakes: 'Freios', susp: 'Suspensão e alinhamento', tires: 'Pneus', body: 'Lataria' },
    ICON: { engine: '⚙️', cool: '🌡️', oil: '🛢️', battery: '🔋', brakes: '🛑', susp: '🔩', tires: '🛞', body: '🚗' },
    // peça do inventário que conserta cada componente, % que ela devolve e tempo (s) da troca feita pelo jogador
    FIX: { battery: ['bateria', 1, 6], cool: ['radiador', 1, 14], oil: ['oleo', 1, 4], brakes: ['pastilha', 1, 11], engine: ['velas', 0.85, 10], susp: ['amortecedor', 1, 16], tires: ['pneu', 1, 9] },
    TRUNK: { hatch: 10, old: 10, sedan: 14, taxi: 12, suv: 18, pickup: 24, van: 30, sports: 6, super: 4, police: 10 },
    game: null,

    usable(car) { return !!car && !car.isBoat && !car.isChopper && car.spec && car.spec.bike !== 'bike' && !car.display; },
    isMoto(car) { return !!(car && car.spec && car.spec.bike === 'moto'); },
    nTires(car) { return this.isMoto(car) ? 2 : 4; },

    // Condição do veículo (criada na 1ª vez que o jogador encosta nele): carro velho vem gasto; esportivo de luxo, bem cuidado.
    cond(car) {
        if (!this.usable(car)) return null;
        if (car.cond) return car.cond;
        const rec = car.ownedRec;
        if (rec && rec.cond) return (car.cond = JSON.parse(JSON.stringify(rec.cond)));
        const cls = car.spec.cls, base = rec ? 0.97 : cls === 'old' ? 0.55 : cls === 'super' || cls === 'sports' || car.spec.id === 'sedan_luxo' ? 0.9 : 0.74;
        const r = () => Math.max(0.12, Math.min(1, base + (Math.random() - 0.5) * 0.45));
        const c = { engine: r(), cool: this.isMoto(car) ? 1 : r(), oil: Math.max(0.3, r()), battery: Math.random() < 0.08 && !rec ? 0.22 : r(), brakes: r(), susp: Math.min(1, r() + 0.1), tread: [], leak: 0, temp: 0.3, pull: Math.random() < 0.5 ? -1 : 1 };
        for (let i = 0; i < this.nTires(car); i++) c.tread.push(Math.max(0.15, r()));
        return (car.cond = c);
    },
    // Pior peça (0..1) — o "estado geral" para a tela.
    worst(c) { return Math.min(c.engine, c.cool, c.oil, c.battery, c.brakes, c.susp, ...c.tread); },

    // ---------------------------------------------------------------- partida
    // Entrou no veículo (Vehicle.setControlled): tenta dar a partida.
    onEnter(car) {
        const c = this.cond(car); if (!c) return;
        car._ccOff = false; car._ccWhy = '';
        this._tryStart(car, true);
    },
    _tryStart(car, first = false) {
        const c = car.cond, g = this.game;
        if (c.engine <= 0.02) { car._ccOff = true; car._ccWhy = 'fundido'; if (g) g._flash('⚙️ O motor está FUNDIDO: não liga — guincho até a oficina (ou empurre)'); return false; }
        if (c.temp > 0.95) { car._ccOff = true; car._ccWhy = 'quente'; if (g && !first) g._flash('🌡️ O motor está quente demais: espere esfriar'); return false; }
        if (car._boost) { car._boost = false; car._ccOff = false; return true; }
        const b = c.battery, p = b >= 0.35 ? 1 : b < 0.1 ? 0 : (b - 0.1) / 0.25;
        c.battery = Math.max(0, b - 0.004);
        if (Math.random() < p) { car._ccOff = false; car._ccWhy = ''; return true; }
        car._ccOff = true; car._ccWhy = 'bateria';
        if (g) g._flash(b < 0.1 ? '🔋 Bateria MORTA: o carro não pega — troque a bateria ou use o auxiliar de partida (a pé, E no capô)' : '🔋 A bateria está fraca: o motor não pegou — solte e acelere de novo para tentar');
        return false;
    },

    // ---------------------------------------------------------------- por quadro (Vehicle.drive, só o veículo do jogador)
    // Devolve o acelerador que chega ao motor e deixa os multiplicadores do quadro em car._cc* (lidos por Vehicle.drive/_applyMotion).
    tick(car, throttle, dt) {
        const c = this.cond(car); if (!c) return throttle;
        const g = this.game, sp = Math.abs(car.forwardSpeed || car.speed || 0), top = car.spec.maxSpeed || 25, thr = Math.abs(throttle);
        // tentar ligar de novo: nova pisada no acelerador com o motor apagado
        const press = thr > 0.1, edge = press && !c._pressed; c._pressed = press;
        if (car._ccOff) {
            if (car._ccWhy === 'quente' && c.temp < 0.75) car._ccWhy = 'esfriou';
            if (edge && car._ccWhy !== 'fundido') this._tryStart(car);
        }
        // temperatura: sobe com o motor puxando e com o radiador ruim; esfria parado/desligado
        const running = !car._ccOff && !car.engineDead && !(car.tank > 0 && car.fuel <= 0);
        const want = running ? 0.32 + 0.28 * thr * (0.4 + 0.6 * Math.min(1, sp / top)) + (1 - c.cool) * 0.85 - Math.min(0.12, sp / top * 0.15) : 0.15;
        c.temp += (want - c.temp) * Math.min(1, dt * (want > c.temp ? 0.09 : 0.05));
        if (running && c.temp > 1.0) {
            c.engine = Math.max(0, c.engine - 0.012 * dt);
            if (!c._hotWarn) { c._hotWarn = true; if (g) g._flash('🌡️ SUPERAQUECENDO! Pare para esfriar — o motor está sendo danificado (radiador ruim)'); }
            if (c.temp > 1.22) { car._ccOff = true; car._ccWhy = 'quente'; if (g) g._flash('🌡️ O motor apagou de tão quente — espere esfriar e conserte o radiador'); }
            if (g && g.carLights && Math.random() < dt * 6) this._steam(car);
        } else if (c.temp < 0.85) c._hotWarn = false;
        // óleo: consumo + vazamento; sem óleo o motor se desgasta
        if (running) {
            c.oil = Math.max(0, c.oil - (c.leak + 0.00025 * thr) * dt);
            if (c.oil < 0.2) c.engine = Math.max(0, c.engine - (c.oil <= 0 ? 0.03 : 0.004 * (0.2 - c.oil) / 0.2 * 5) * dt);
            if (c.oil < 0.15 && !c._oilWarn) { c._oilWarn = true; if (g) g._flash('🛢️ Luz do óleo acesa: o motor vai fundir — complete o óleo (a pé, E no capô)'); }
            if (c.oil > 0.3) c._oilWarn = false;
            c.engine = Math.max(0, c.engine - 0.000012 * thr * sp * dt);
        }
        if (running && c.engine < 0.02) { car._ccOff = true; car._ccWhy = 'fundido'; if (g) g._flash('⚙️ O MOTOR FUNDIU'); }
        // freios e pneus gastam com o uso
        if (car.braking) c.brakes = Math.max(0, c.brakes - 0.0011 * Math.min(1, sp / 20) * dt);
        const wearT = (0.000035 * sp + 0.0025 * (car.slide || 0)) * dt;
        for (let i = 0; i < c.tread.length; i++) {
            c.tread[i] = Math.max(0, c.tread[i] - wearT * (i < 2 ? 1 : 0.8));
            if (c.tread[i] < 0.1 && sp > 12 && Math.random() < 0.0015 * dt * 60 && car.puncture && !this.isMoto(car)) { if (car.puncture(i) && g) g._flash('💥 Um pneu careca estourou! Troque pelo estepe (a pé, E no capô)'); }
        }
        // falha do motor e "apagão"
        let out = car._ccOff ? 0 : throttle;
        if (running && c.engine < 0.45 && press) {
            c._mis = (c._mis || 0) - dt;
            if (c._mis <= 0) {
                if (Math.random() < (0.45 - c.engine) * 2.2 * 0.5) { c._cut = 0.18 + Math.random() * 0.3; if (c.engine < 0.15 && Math.random() < 0.3) { car._ccOff = true; car._ccWhy = 'morreu'; if (g) g._flash('⚙️ O motor morreu — acelere de novo (precisa de ignição nova / oficina)'); } }
                c._mis = 0.5;
            }
        }
        if (c._cut > 0) { c._cut -= dt; out *= 0.05; }
        // multiplicadores do quadro
        const avgT = c.tread.reduce((a, t) => a + t, 0) / c.tread.length;
        car._ccPow = (0.5 + 0.5 * Math.min(1, c.engine / 0.8)) * (c.temp > 1 ? 0.55 : 1) * (c.oil <= 0 ? 0.6 : 1);
        car._ccTop = 0.75 + 0.25 * Math.min(1, c.engine / 0.7);
        car._ccBrake = 0.35 + 0.65 * Math.min(1, c.brakes / 0.6);
        car._ccGrip = (0.68 + 0.32 * Math.min(1, avgT / 0.5)) * (Weather.cur && Weather.cur.gripMul < 0.95 && avgT < 0.3 ? 0.85 : 1);
        car._ccPull = c.susp < 0.75 ? (0.75 - c.susp) * 0.45 * c.pull * (1 + (c.susp < 0.35 ? 0.6 * Math.sin(performance.now() / 260) : 0)) : 0;
        return out;
    },

    _steam(car) {
        const L = this.game.carLights; if (!L || !L.puffs || !L.puffs.emit) return;
        const f = car.fwdToRef(this._f || (this._f = new BABYLON.Vector3())), s = car.halfLen - 0.6;
        L.puffs.emit(car.position.x + f.x * s, 1.3, car.position.z + f.z * s, (Math.random() - 0.5) * 0.6, 1.4 + Math.random() * 0.8, (Math.random() - 0.5) * 0.6, 0.7, 2.4, 1.1 + Math.random() * 0.6, 0.5, [0.92, 0.93, 0.95]);      // vapor branco do radiador
    },

    // ---------------------------------------------------------------- dano (batida e tiro)
    onImpact(car, dv, dmg, dvx, dvz) {
        const c = car.cond; if (!c || car.isBoat) return;
        const f = car.fwdToRef(this._fi || (this._fi = new BABYLON.Vector3())), L = hypot(dvx, dvz) || 1;
        const front = -(dvx * f.x + dvz * f.z) / L;                    // > 0: freou de frente (bateu com o nariz)
        const k = Math.min(1, dmg / 40);
        if (front > 0.5) { c.cool = Math.max(0, c.cool - 0.22 * k); c.engine = Math.max(0, c.engine - 0.08 * k); if (Math.random() < 0.15 * k) c.battery = Math.max(0, c.battery - 0.3); }
        else c.susp = Math.max(0, c.susp - 0.25 * k);
        if (dv > 11) { c.leak = Math.min(0.004, c.leak + 0.0012 * k); c.susp = Math.max(0, c.susp - 0.1 * k); }
        if (this.game && car === this.game.activeCar && k > 0.35 && !c._hitWarn) { c._hitWarn = true; this.game._delayed.push({ t: 1.2, fn: () => { c._hitWarn = false; this.game._flash(`🔧 A batida ${front > 0.5 ? 'pegou o radiador e o motor' : 'desalinhou a suspensão'}${c.leak > 0.001 ? ' · está vazando óleo' : ''} — veja no capô (a pé, E)`); } }); }
    },
    onDamage(car, amount, source) { const c = car.cond; if (!c || source !== 'shot') return; if (Math.random() < 0.35) c.cool = Math.max(0, c.cool - amount * 0.01); if (Math.random() < 0.1) c.leak = Math.min(0.004, c.leak + 0.0008); },

    // ---------------------------------------------------------------- texto do diagnóstico
    status(car) {
        const c = this.cond(car); if (!c) return [];
        const out = [], st = (v) => v > 0.7 ? ['bom', 'g'] : v > 0.4 ? ['gasto', 'y'] : v > 0.12 ? ['ruim', 'r'] : ['quebrado', 'r'];
        const why = {
            engine: c.engine < 0.15 ? 'morrendo sozinho' : c.engine < 0.45 ? 'falhando e sem força' : '',
            cool: c.cool < 0.45 ? 'radiador furado: o motor esquenta' : '', oil: c.oil < 0.2 ? 'quase sem óleo' : c.leak > 0.0005 ? 'vazando' : '',
            battery: c.battery < 0.1 ? 'morta' : c.battery < 0.35 ? 'fraca: a partida falha' : '', brakes: c.brakes < 0.35 ? 'pastilha no fim' : '',
            susp: c.susp < 0.45 ? `puxando para a ${c.pull > 0 ? 'esquerda' : 'direita'}` : '',
        };
        for (const k of this.PARTS) { if (k === 'cool' && this.isMoto(car)) continue; const s = st(c[k]); out.push({ k, v: c[k], label: s[0], col: s[1], why: why[k] }); }
        const F = car.flat || [], names = this.isMoto(car) ? ['dianteiro', 'traseiro'] : ['dianteiro esq.', 'dianteiro dir.', 'traseiro esq.', 'traseiro dir.'];
        c.tread.forEach((t, i) => { const s = F[i] ? ['FURADO', 'r'] : st(t); out.push({ k: 'tires', i, v: F[i] ? 0 : t, label: s[0], col: s[1], name: 'Pneu ' + names[i], why: F[i] ? 'furado' : t < 0.15 ? 'careca' : '' }); });
        const h = car.hpFrac; out.push({ k: 'body', v: h, label: h > 0.75 ? 'boa' : h > 0.4 ? 'amassada' : 'detonada', col: h > 0.75 ? 'g' : h > 0.4 ? 'y' : 'r', why: h < 0.35 ? 'soltando fumaça' : '' });
        return out;
    },

    // Conserto aplicado (o jogador ou a oficina): componente k (pneu: índice i) para `to`.
    fix(car, k, to = 1, i = null) {
        const c = this.cond(car); if (!c) return;
        if (k === 'tires') {
            const idx = i == null ? [...c.tread.keys()] : [i];
            for (const j of idx) { c.tread[j] = Math.max(c.tread[j], to); if (car.flat) car.flat[j] = 0; }
            if (car.visual && car.visual.setFlat && car.flat) car.visual.setFlat(car.flat);
        } else if (k === 'oil') { c.oil = Math.max(c.oil, to); }
        else if (k === 'leak') { c.leak = 0; }
        else if (k === 'body') { car.hp = car.maxHp; car.dent = 0; car._warnedSmoke = false; }
        else c[k] = Math.max(c[k], to);
        if (k === 'battery' || k === 'engine' || k === 'cool') { if (car._ccWhy !== 'fundido' || c.engine > 0.05) { car._ccOff = false; car._ccWhy = ''; } }
        this.syncRec(car);
    },
    syncRec(car) { if (car.ownedRec && car.cond) { car.ownedRec.cond = JSON.parse(JSON.stringify(car.cond)); delete car.ownedRec.cond._pressed; } },

    // ---------------------------------------------------------------- a pé: capô e porta-malas
    // Carro em que o jogador pode mexer: o dele, um que ele já dirigiu ou um destrancado parado sem motorista.
    _ok(car) { return this.usable(car) && !car.destroyed && !car.controlled && car.driver !== true && (car.ownedRec || car.cond || (!car.locked && car.driver === false)) && car.speed < 1; },
    // { car, end: 'hood' | 'trunk' } ao alcance (a até ~1,6 u da frente/traseira), ou null.
    near(game) {
        if (game.mode !== 'player' || !game.vehicleManager) return null;
        const p = game.player.position;
        let best = null, bd = 1.7;
        for (const car of game.vehicleManager.vehicles) {
            if (Math.abs(car.position.x - p.x) > 7 || Math.abs(car.position.z - p.z) > 7 || !this._ok(car)) continue;
            const f = car.fwdToRef(this._fn || (this._fn = new BABYLON.Vector3())), l = hypot(f.x, f.z) || 1, fx = f.x / l, fz = f.z / l;
            for (const [end, s] of [['hood', 1], ['trunk', -1]]) {
                const ex = car.position.x + fx * s * (car.halfLen + 0.35), ez = car.position.z + fz * s * (car.halfLen + 0.35), d = hypot(p.x - ex, p.z - ez);
                if (d < bd) { bd = d; best = { car, end }; }
            }
        }
        return best;
    },
    prompt(game) {
        if (game.player.busy) return this.job ? `<b>${this.job.label.toUpperCase()}</b> ${crBar(this.job.t / this.job.dur)}<small>mexendo no carro…</small>` : '';
        const n = this.near(game); if (!n) return '';
        const c = this.cond(n.car), w = c ? this.worst(c) : 1;
        return n.end === 'hood' ? `<b>E</b> ${this.isMoto(n.car) ? 'mexer na moto' : 'abrir o capô'}<small>${n.car.spec.name} ${n.car.spec.model} · ${w < 0.4 ? '⚠ tem coisa ruim' : w < 0.7 ? 'umas peças gastas' : 'tudo em ordem'} · trocar peças você mesmo</small>`
            : `<b>E</b> abrir o ${this.isMoto(n.car) ? 'baú da moto' : 'porta-malas'}<small>${this.trunkCap(n.car)} espaços · guarde armas, dinheiro, peças</small>`;
    },
    interact(game) {
        if (this.job) return true;
        const n = this.near(game); if (!n) return false;
        if (n.end === 'trunk') { game.stashUI.show('trunk', this.trunk(n.car), this.isMoto(n.car) ? 'BAÚ DA MOTO' : `PORTA-MALAS · ${n.car.spec.model}`); AudioFX.door(n.car.position.x, n.car.position.z, true); return true; }
        Mechanic.hood(game, n.car);
        return true;
    },

    trunkCap(car) { return this.isMoto(car) ? 3 : (this.TRUNK[car.spec.cls] || 10); },
    trunk(car) {
        if (car.trunk) return car.trunk;
        const t = new Stash(); t.boxes.trunk = {}; t.limit = { trunk: this.trunkCap(car) };
        const rec = car.ownedRec;
        if (rec && rec.trunk) { t.boxes.trunk = Object.assign({}, rec.trunk.b || {}); t.jv = rec.trunk.jv || 0; t.wstate = Object.assign({}, rec.trunk.w || {}); }
        car.trunk = t; car.keep = true;                                        // (com coisa dentro, o trânsito não recicla o carro)
        return t;
    },
    syncTrunk(car) { if (car.ownedRec && car.trunk) car.ownedRec.trunk = { b: car.trunk.boxes.trunk, jv: car.trunk.jv, w: car.trunk.wstate }; },

    // Trabalho de mecânica do jogador (trocar peça): parado, animação, depois aplica.
    startJob(game, car, k, i, part, dur) {
        const pl = game.player;
        if (pl.busy) return 'Agora não dá';
        const mec = game.careers ? game.careers.by.chop.skill('mecanica') : 0;
        dur *= Math.max(0.5, 1 - 0.08 * mec - (SkillTree.m.hotwire || 0) * 0.3);
        this.job = { car, k, i, part, t: 0, dur, label: `trocando: ${part ? Items.label(part) : this.NAME[k]}`, x: pl.position.x, z: pl.position.z };
        pl.playAction('rummage', { lock: 0 }); if (pl.action) pl.action.timer = dur + 0.3;
        AudioFX.blip(500, 0.08, 0.12);
        return null;
    },
    _jobTick(game, dt) {
        const J = this.job; if (!J) return;
        const p = game.player.position;
        if (game.mode !== 'player' || game.wanted.level > 0 || hypot(p.x - J.x, p.z - J.z) > 0.8 || J.car.controlled || J.car.destroyed) { this.job = null; game._flash('Conserto interrompido'); if (game.player.action && game.player.action.name === 'rummage') game.player.action.timer = 0; return; }
        J.t += dt;
        if (J.t < J.dur) return;
        this.job = null;
        if (J.part && !Items.take(game.inventory, J.part, 1)) { game._flash('A peça sumiu da mochila'); return; }
        const F = this.FIX[J.k];
        this.fix(J.car, J.k, F ? F[1] : 1, J.i);
        if (J.k === 'oil') { const c = J.car.cond; c.oil = Math.min(1, c.oil + 0.6); }
        if (game.careers) game.careers.by.chop.addXp(15);
        AudioFX.blip(880, 0.12, 0.16);
        game._flash(`🔧 Pronto: ${{ tires: 'pneu trocado', oil: 'óleo completado', battery: 'bateria nova', cool: 'radiador novo', brakes: 'freios novos', engine: 'ignição nova', susp: 'suspensão nova' }[J.k] || 'peça trocada'} — ${J.car.spec.model}`);
    },

    // Usar consumível perto do carro (galão, auxiliar de partida).
    use(game, car, id) {
        const inv = game.inventory;
        if (id === 'galao') {
            if (!(car.tank > 0) || car.electric) return car.electric ? 'Carro elétrico: recarregue num eletroposto 🔌' : 'Esse não usa gasolina';
            if (car.fuel >= car.tank - 0.5) return 'O tanque já está cheio';
            if (!Items.take(inv, 'galao', 1)) return 'Sem galão';
            car.fuel = Math.min(car.tank, car.fuel + 5);
            return `⛽ +5 L no tanque (${Math.round(car.fuel)}/${car.tank} L)`;
        }
        if (id === 'booster') {
            if (!Items.has(inv, 'booster')) return 'Sem auxiliar de partida';
            const st = inv.boosterUses = (inv.boosterUses || Items.DEFS.booster.uses) - 1;
            if (st <= 0) { Items.take(inv, 'booster', 1); inv.boosterUses = 0; }
            car._boost = true; car._ccOff = false; car._ccWhy = '';
            return `🔌 Auxiliar ligado na bateria: a próxima partida pega${st > 0 ? ` (${st} carga(s))` : ' (acabou a carga)'}`;
        }
        return null;
    },

    // Preso perto do carro: a polícia revista o porta-malas (fundo falso esconde).
    onBusted(game, car) {
        if (!car || !car.trunk || car.destroyed) return '';
        const p = game.player.position;
        if (car !== game.activeCar && hypot(car.position.x - p.x, car.position.z - p.z) > 15) return '';
        if (car.mods && car.mods.hidden) return ' · o fundo falso do porta-malas passou batido';
        const B = car.trunk.boxes.trunk, took = [];
        for (const id of Object.keys(B)) if (id === 'cash' || id === 'jewels' || id.startsWith('weapon:') || id.startsWith('ammo:') || id === 'hack' || id === 'key' || (id.startsWith('item:') && (Items.def(id.slice(5)) || {}).cat === 'crime')) { took.push(id); delete B[id]; }
        if (!B.jewels) car.trunk.jv = 0;
        this.syncTrunk(car);
        return took.length ? ' · revistaram o porta-malas e levaram armas, dinheiro e joias' : '';
    },

    // ---------------------------------------------------------------- painel (dirigindo)
    hud(game, dt) {
        this._jobTick(game, dt);
        let el = this._el;
        const car = game.mode === 'car' ? game.activeCar : null, show = !!car && this.usable(car) && !Interiors.active && !game.menu.isOpen;
        if (!el) {
            const st = document.createElement('style');
            st.textContent = `
                #dash { position: fixed; right: 16px; bottom: 16px; z-index: 11; width: 300px; pointer-events: none; display: none; font-family: var(--font); color: var(--tx);
                    flex-direction: column; gap: 8px; }
                #dash .cw { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: var(--r); background: var(--glass); border: 1px solid var(--line-2);
                    box-shadow: var(--shadow-s); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); animation: cwBlink 1.1s ease-in-out infinite; }
                #dash .cw .ic { font-family: var(--emoji); font-size: 26px; width: 34px; text-align: center; flex: none; filter: drop-shadow(0 0 6px rgba(249,115,22,0.6)); }
                #dash .cw .tx { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
                #dash .cw b { font: 800 15px var(--font-d); letter-spacing: 0.04em; text-transform: uppercase; color: #fff; }
                #dash .cw small { font: 600 12px var(--font); letter-spacing: 0.06em; text-transform: uppercase; color: var(--tx-2); }
                #dash .cw i { display: block; height: 7px; border-radius: 99px; background: rgba(255,255,255,0.1); overflow: hidden; } #dash .cw i s { display: block; height: 100%; border-radius: 99px; background: #f97316; }
                #dash .cw.r { border-color: rgba(244,63,94,0.75); } #dash .cw.r .ic { filter: drop-shadow(0 0 8px rgba(244,63,94,0.85)); } #dash .cw.r i s { background: #f43f5e; }
                #dash .cw.y { border-color: rgba(251,146,60,0.65); }
                @keyframes cwBlink { 0%,100% { opacity: 1; } 50% { opacity: 0.42; } }
                body.mobile #dash { right: auto; left: 50%; bottom: 52px; transform: translateX(-50%); width: min(60vw, 280px); gap: 5px; }
                body.mobile #dash .cw { padding: 5px 10px; gap: 8px; } body.mobile #dash .cw .ic { font-size: 17px; width: 22px; } body.mobile #dash .cw b { font-size: 12px; } body.mobile #dash .cw small { font-size: 10px; }
                #vehPop.dashup { bottom: 150px; }`;
            document.head.appendChild(st);
            el = this._el = document.createElement('div'); el.id = 'dash'; document.body.appendChild(el);
        }
        if (!show) { if (el.style.display !== 'none') el.style.display = 'none'; const vp0 = document.getElementById('vehPop'); if (vp0) vp0.classList.remove('dashup'); return; }
        this._ht = (this._ht || 0) - dt; if (this._ht > 0) return; this._ht = 0.2;
        const c = this.cond(car), fuel = car.tank > 0 ? car.fuel / car.tank : 1;
        // [ícone, título, detalhe, gravidade (r vermelho | y laranja), barra 0..1 ou null] — o mais grave primeiro, no máximo 3
        const W = [];
        if (car._ccOff) W.push(['🔑', 'Motor desligado', car._ccWhy === 'fundido' ? 'motor fundido — não pega' : 'acelere para dar a partida', 'r', null, 9]);
        if (car.tank > 0 && fuel < 0.15) W.push([car.electric ? '🔋' : '⛽', car.electric ? 'Bateria baixa' : fuel < 0.02 ? 'Sem combustível' : 'Baixo combustível', fuel < 0.05 ? (car.electric ? 'procure um eletroposto' : 'procure um posto') : '', fuel < 0.05 ? 'r' : 'y', fuel, 8]);
        if (c.engine < 0.5 || car._ccWhy === 'fundido') W.push(['🛠️', 'Problema no motor', car._ccWhy === 'fundido' || c.engine <= 0 ? 'motor fundido' : c.engine < 0.2 ? 'o motor está morrendo' : 'falha do motor', c.engine < 0.2 ? 'r' : 'y', null, 7]);
        if (c.temp > 0.85 && !this.isMoto(car)) W.push(['🌡️', c.temp > 1 ? 'Superaquecido' : 'Motor esquentando', c.temp > 1 ? 'pare e deixe esfriar' : 'radiador', c.temp > 1 ? 'r' : 'y', null, 6]);
        if (c.oil < 0.25) W.push(['🛢️', 'Óleo baixo', 'troque o óleo', 'r', null, 5]);
        if ((car.flatCount || 0) > 0) W.push(['🛞', 'Pneu furado', 'o carro escorrega', 'r', null, 5]);
        else if (c.tread.some((t) => t < 0.15)) W.push(['🛞', 'Pneu careca', 'menos aderência', 'y', null, 3]);
        if (c.battery < 0.35 && !car.electric) W.push(['🔋', 'Bateria fraca', 'a partida pode falhar', c.battery < 0.15 ? 'r' : 'y', null, 4]);
        if (c.brakes < 0.3) W.push(['🛑', 'Freio gasto', 'para mais longe', 'r', null, 4]);
        if (car.hpFrac < 0.35) W.push(['🚗', 'Lataria danificada', 'leve à oficina', car.hpFrac < 0.15 ? 'r' : 'y', null, 3]);
        if (c.susp < 0.45) W.push(['🔩', 'Suspensão desalinhada', 'o carro puxa para um lado', 'y', null, 2]);
        W.sort((a, b) => b[5] - a[5]);
        const L = W.slice(0, document.body.classList.contains('mobile') ? 2 : 3);      // (celular: os 2 mais graves)
        el.style.display = L.length ? 'flex' : 'none';
        const vp = document.getElementById('vehPop'); if (vp) vp.classList.toggle('dashup', L.length > 0);
        const html = L.map((w) => `<div class="cw ${w[3]}"><span class="ic">${w[0]}</span><div class="tx"><b>${w[1]}</b>${w[2] ? `<small>${w[2]}</small>` : ''}${w[4] != null ? `<i><s style="width:${Math.max(3, Math.round(w[4] * 100 / 0.15))}%"></s></i>` : ''}</div></div>`).join('');
        if (html !== this._h) { this._h = html; el.innerHTML = html; }
    },
};
