// Flagrant and police record (police/CrimeExposure.js, CrimeRecord.js, HeatStateMachine.js):
//   (1) exposure geometry — witness cone + line of sight over the occluder grid, CCTV zones at shop facades, police read from the
//       per-frame sighting; (2) every transition of the state machine (IDLE → CRIME_COMMITTED → WANTED → INVESTIGATION/IDLE,
//       ARRESTED → PAROLE → IDLE), the mask rule, the corrupt police chief, the hacker (reduce + time decay), the lawyer, bail and
//       confiscation; (3) a burst of the same crime costs one exposure evaluation; (4) save round trip.
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
    name: 'flagrante',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx);
        await gameWait(page, 1);

        // ------------------------------------------------------------------ (1) exposure geometry
        const geo = await page.evaluate(() => {
            const E = CrimeExposure, out = {};
            const doors = Interiors._doors.filter((d) => d.district !== 'favela' && E.CCTV_STYLES.includes(d.style));
            const door = doors.find((d) => MapGeo.hasLineOfSight(d.x, d.z, d.x + Math.sin(d.face) * 8, d.z + Math.cos(d.face) * 8));
            if (!door) return { skip: 'no CCTV door with an open sidewalk' };
            const fx = Math.sin(door.face), fz = Math.cos(door.face);
            const P = { x: door.x + fx * 8, z: door.z + fz * 8 };
            out.cctvFront = E._cameraSees(P.x, P.z);
            out.cctvFar = E._cameraSees(door.x + fx * 60, door.z + fz * 60);
            // A pedestrian 9 u away on the open sidewalk, looking at the player / looking away.
            const W = { x: door.x + fx * 8 + fz * 9, z: door.z + fz * 8 - fx * 9 };
            const open = MapGeo.hasLineOfSight(W.x, W.z, P.x, P.z);
            const npc = { alive: true, position: W, heading: Math.atan2(P.x - W.x, P.z - W.z) };
            const fake = { npcManager: { npcs: [npc] }, player: { crouched: false }, dayNight: { night: false } };
            out.open = open;
            out.witnessFacing = E._witnessSees(fake, P.x, P.z);
            npc.heading += Math.PI;
            out.witnessBack = E._witnessSees(fake, P.x, P.z);
            npc.heading -= Math.PI;
            fake.npcManager.npcs = [Object.assign({}, npc, { alive: false })];
            out.witnessDead = E._witnessSees(fake, P.x, P.z);
            // A building between the witness and the player: the ray over the occluder grid stops it.
            const o = CityGrid.obstaclesNear(P.x, P.z).find((q) => q.h > 2 && q.x1 - q.x0 > 3 && q.x1 - q.x0 < 60);
            if (o) {
                const zc = (o.z0 + o.z1) / 2, A = { x: o.x0 - 2, z: zc }, B = { x: o.x1 + 2, z: zc };
                const wall = { alive: true, position: A, heading: Math.atan2(B.x - A.x, B.z - A.z) };
                out.wallLos = MapGeo.hasLineOfSight(A.x, A.z, B.x, B.z);
                out.witnessWall = E._witnessSees({ npcManager: { npcs: [wall] }, player: { crouched: false }, dayNight: { night: false } }, B.x, B.z);
            }
            out.police = E.evaluate({ policeManager: { playerSeen: true }, _playerState: () => ({ pos: P }) }) === E.POLICE;
            return out;
        });
        if (geo.skip) c.note(geo.skip);
        else {
            c.ok(geo.cctvFront, 'câmera da fachada filma quem está na calçada da frente');
            c.ok(!geo.cctvFar, 'longe da fachada a câmera não pega');
            if (geo.open) {
                c.ok(geo.witnessFacing, 'testemunha olhando (cone + linha de visada) vê o crime');
                c.ok(!geo.witnessBack, 'testemunha de costas (fora do cone) não vê');
            } else c.note('calçada sem linha de visada livre para a testemunha');
            c.ok(!geo.witnessDead, 'morto não testemunha');
            if (geo.wallLos === false) c.ok(!geo.witnessWall, 'prédio no meio corta a visão da testemunha');
            c.ok(geo.police, 'policial que te enxerga neste quadro = flagrante da polícia (sem raio extra)');
        }

        // ------------------------------------------------------------------ (2) state machine
        const fsm = await page.evaluate(() => {
            const g = game, H = g.heat, E = CrimeExposure, inv = g.inventory, out = {};
            let masked = false;
            Object.defineProperty(g.player, 'isMasked', { get: () => masked, configurable: true });
            const reset = () => { g.wanted.bust(); H.record.clear(); H.anonymous.clear(); H.paroleUntil = -Infinity; H.lawyerUntil = -Infinity; H._settle(); };
            const escape = () => g.wanted._set(0, 'escape');
            reset();
            out.start = H.state;

            H.commit('mugging', E.NONE);
            out.unseen = { state: H.state, crimes: H.record.count };

            H.commit('mugging', E.WITNESS);
            out.witness = { state: H.state, stars: g.wanted.level, crimes: H.record.count };
            escape();
            out.afterEscape = H.state;

            reset();
            masked = true;
            H.commit('armed_robbery', E.POLICE);
            out.masked = { state: H.state, stars: g.wanted.level, crimes: H.record.count, anon: H.anonymous.count };
            masked = false;
            escape();
            out.maskedEscape = { state: H.state, crimes: H.record.count, anon: H.anonymous.count };

            reset();
            masked = true;
            H.commit('homicide', E.WITNESS);
            masked = false;
            const sees = H._policeSeesWithin;
            H._policeSeesWithin = () => true;
            H.update(0.5);
            H._policeSeesWithin = sees;
            out.unmaskedInView = { crimes: H.record.count, anon: H.anonymous.count };

            reset();
            const corrupt = H.isCorruptZone;
            H.isCorruptZone = () => true;
            H.commit('homicide', E.WITNESS);
            out.shelved = { state: H.state, crimes: H.record.count };
            escape();
            out.shelvedEscape = H.state;
            H.commit('homicide', E.POLICE);
            out.shelvedLive = H.record.count;
            H.isCorruptZone = corrupt;

            // Hacker: Σ(base × severity) × frequency multiplier, cheaper as the record goes cold.
            reset();
            const now = H.now(), T = HEAT_TUNING.hacker;
            H.record.register('armed_robbery', 4, now);
            H.record.register('mugging', 3, now);
            const fresh = H.hackerQuote();
            const expected = Math.round((T.base * 4 + T.base * 3) * (1 + T.perCrime) / 50) * 50;
            H.record.lastCrimeAt = now - 72;
            const cold = H.hackerQuote();
            out.hacker = { fresh, expected, cold, floorPrice: Math.round(T.base * 7 * T.floor / 50) * 50 };
            H._settle();
            inv.cash = 100000;
            H.hireHacker();
            out.hacked = { state: H.state, crimes: H.record.count, paid: 100000 - inv.cash };

            // Arrest without a lawyer: bail, guns and contraband gone, record wiped, parole.
            reset();
            inv.cash = 20000; inv.clean = 0; inv.jewels = 3; inv.weapons.pistol.owned = true; inv.weapons.pistol.reserve = 30;
            H.commit('armed_robbery', E.POLICE);
            const bail = H.bailFor(g.wanted.level);
            const report = H.arrest(g.wanted.level);
            out.arrest = { state: H.state, stars: g.wanted.level, crimes: H.record.count, paid: 20000 - inv.cash, bail, reported: report.bail, pistol: inv.weapons.pistol.owned, jewels: inv.jewels };

            // Parole: a minor flagrant jumps to a high level; escaping keeps the parole.
            H.commit('theft', E.WITNESS);
            out.parole = { state: H.state, stars: g.wanted.level };
            escape();
            out.paroleEscape = H.state;
            H.paroleUntil = H.now() - 0.01;
            H.update(0.1);
            out.paroleOver = H.state;

            // Lawyer on retainer (clean money): half bail and the guns stay.
            reset();
            inv.clean = 5000; inv.cash = 20000; inv.weapons.pistol.owned = true;
            const hire = H.hireLawyer();
            out.lawyerPaid = 5000 - inv.clean;
            H.commit('armed_robbery', E.POLICE);
            const fullBail = (() => { const l = H.lawyerUntil; H.lawyerUntil = -Infinity; const b = H.bailFor(g.wanted.level); H.lawyerUntil = l; return b; })();
            const lr = H.arrest(g.wanted.level);
            out.lawyer = { hire: typeof hire, bail: lr.bail, fullBail, pistol: inv.weapons.pistol.owned, kept: lr.weaponsKept };

            // Killed during a chase: the police take the player in.
            reset();
            H.commit('homicide', E.POLICE);
            const down = H.onPlayerDown();
            out.down = { state: H.state, report: !!down, stars: g.wanted.level };
            reset();
            out.downIdle = { report: H.onPlayerDown(), state: H.state };

            // Stars raised elsewhere (a recognized description) start the chase; the warrant recognizes the face.
            reset();
            g.wanted.ensureLevel(1, 'desc');
            out.external = H.state;
            escape();
            for (let i = 0; i < 3; i++) H.fileEvidence(i % 2 ? 'homicide' : 'armed_robbery');
            H._policeSeesWithin = () => true; H._checkIn = 0;
            H.update(0.1);
            H._policeSeesWithin = sees;
            out.warrant = { state: H.state, stars: g.wanted.level };

            // (3) A burst of the same crime: one exposure evaluation.
            reset();
            let evals = 0;
            const evaluate = E.evaluate;
            E.evaluate = function (game) { evals++; return evaluate.call(this, game); };
            for (let i = 0; i < 12; i++) H.commit('gunfire');
            E.evaluate = evaluate;
            out.evals = evals;

            // Record: merge, capacity, statute of limitations, save round trip.
            const R = new CrimeRecord(3);
            R.register('gunfire', 2, 10); R.register('gunfire', 2, 10.2);
            out.merged = R.count;
            R.register('theft', 1, 11); R.register('homicide', 4, 12); R.register('arson', 3, 13);
            out.capacity = { count: R.count, mildestGone: !R.crimes.some((x) => x.type === 'theft') };
            R.expire(12 + 48 * 2 + 1, 48);
            out.expired = R.crimes.map((x) => x.type).join(',');
            reset();
            H.record.register('carjacking', 3, H.now()); H.paroleUntil = H.now() + 5;
            const saved = JSON.parse(JSON.stringify(H.serialize()));
            reset();
            H.load(saved);
            out.saved = { crimes: H.record.count, state: H.state };
            H.load(null, { heat: 70 });
            out.legacy = { crimes: H.record.count, severity: H.record.totalSeverity };

            delete g.player.isMasked;
            reset();
            return out;
        });
        c.eq(fsm.start, 'IDLE', 'começa em IDLE');
        c.ok(fsm.unseen.state === 'IDLE' && fsm.unseen.crimes === 0, 'crime sem ninguém ver: volta ao estado anterior, nada na ficha');
        c.ok(fsm.witness.state === 'WANTED' && fsm.witness.stars === 1 && fsm.witness.crimes === 1, 'testemunha viu sem máscara: WANTED 1★ e crime na ficha');
        c.eq(fsm.afterEscape, 'INVESTIGATION', 'fugiu com o nome sujo: INVESTIGATION');
        c.ok(fsm.masked.state === 'WANTED' && fsm.masked.stars >= 2 && fsm.masked.crimes === 0 && fsm.masked.anon === 1, 'flagrante mascarado: perseguição sem registrar o nome');
        c.ok(fsm.maskedEscape.state === 'IDLE' && fsm.maskedEscape.crimes === 0 && fsm.maskedEscape.anon === 0, 'fugiu e tirou a máscara: crime não registrado, sem inquérito');
        c.ok(fsm.unmaskedInView.crimes === 1 && fsm.unmaskedInView.anon === 0, 'tirou a máscara na frente da polícia durante a perseguição: identificado');
        c.ok(fsm.shelved.state === 'WANTED' && fsm.shelved.crimes === 0, 'delegado comprado: flagrante de testemunha vira perseguição, inquérito engavetado');
        c.eq(fsm.shelvedEscape, 'IDLE', 'zona do delegado comprado: WANTED nunca vai para INVESTIGATION');
        c.eq(fsm.shelvedLive, 1, 'polícia viu ao vivo: registra mesmo com o delegado comprado');
        c.eq(fsm.hacker.fresh, fsm.hacker.expected, `hacker: (base × gravidade) × frequência = ${fsm.hacker.expected}`);
        c.ok(fsm.hacker.cold < fsm.hacker.fresh && fsm.hacker.cold >= fsm.hacker.floorPrice, `hacker mais barato com a ficha fria (${fsm.hacker.fresh} → ${fsm.hacker.cold})`);
        c.ok(fsm.hacked.state === 'IDLE' && fsm.hacked.crimes === 0 && fsm.hacked.paid === fsm.hacker.cold, 'hacker pago: ficha apagada, volta a IDLE');
        c.ok(fsm.arrest.state === 'PAROLE' && fsm.arrest.stars === 0 && fsm.arrest.crimes === 0, 'preso: WANTED e INVESTIGATION zerados, vai para PAROLE');
        c.ok(fsm.arrest.paid === fsm.arrest.bail && fsm.arrest.reported === fsm.arrest.bail && fsm.arrest.bail > 0, `fiança cobrada (${fsm.arrest.bail})`);
        c.ok(!fsm.arrest.pistol && fsm.arrest.jewels === 0, 'armas e itens ilícitos confiscados');
        c.ok(fsm.parole.state === 'WANTED' && fsm.parole.stars >= 3, 'condicional: infração mínima com flagrante = WANTED alto na hora');
        c.eq(fsm.paroleEscape, 'PAROLE', 'fugiu durante a condicional: continua em PAROLE');
        c.eq(fsm.paroleOver, 'INVESTIGATION', 'acabou a condicional: volta ao repouso (ficha com o furto)');
        c.eq(fsm.lawyerPaid, 3500, 'advogado cobra o contrato em dinheiro limpo');
        c.ok(fsm.lawyer.bail < fsm.lawyer.fullBail && fsm.lawyer.pistol && fsm.lawyer.kept, `advogado: fiança menor (${fsm.lawyer.bail} < ${fsm.lawyer.fullBail}) e fica com as armas`);
        c.ok(fsm.down.state === 'PAROLE' && fsm.down.report && fsm.down.stars === 0, 'morto durante a perseguição: ARRESTED → PAROLE');
        c.ok(fsm.downIdle.report === null && fsm.downIdle.state === 'IDLE', 'morto sem perseguição: a ficha não muda');
        c.eq(fsm.external, 'WANTED', 'estrelas vindas de fora (descrição, alarme) entram em WANTED');
        c.ok(fsm.warrant.state === 'WANTED' && fsm.warrant.stars === 1, 'mandado: policial reconhece o rosto → 1★ (sem atirar)');
        c.eq(fsm.evals, 1, 'rajada do mesmo crime: uma avaliação de exposição só');
        c.eq(fsm.merged, 1, 'mesmo crime em seguida: uma entrada só');
        c.ok(fsm.capacity.count === 3 && fsm.capacity.mildestGone, 'ficha cheia: sai o crime mais leve');
        c.eq(fsm.expired, 'homicide,arson', 'prescrição: o crime leve (tiros) expira antes dos graves');
        c.ok(fsm.saved.crimes === 1 && fsm.saved.state === 'PAROLE', 'save: ficha e condicional voltam');
        c.ok(fsm.legacy.crimes === 1 && fsm.legacy.severity === 4, 'save antigo: inquérito de 70% vira um caso arquivado');

        c.ok(!errors.length, 'sem erros no console' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
        await close();
    },
};
