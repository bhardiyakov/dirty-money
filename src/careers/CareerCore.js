// ============================================================================
// CareerCore — a base das CARREIRAS DO CRIME (além do tráfico da favela, que segue em player/Missions.js).
//
//   Career      uma carreira: patentes por XP, duas skills (0..5, compradas com pontos: 1 ponto a cada XP_PER_POINT de XP),
//               a lista de TRABALHOS (cada um vira um CareerJob) e, nas patentes altas, um painel de GESTÃO (HTML no menu de pausa).
//   CareerJob   um trabalho em andamento: alvo marcado no mapa + marcador brilhante no chão, prazo opcional, etapas, prompt e tecla E.
//   Careers     o gerenciador: um trabalho por vez (nem junto com a missão do morro), aplica as skills nos sistemas que já
//               existem (arrombamento, ligação direta, aderência dos carros, peso da carga), acha pontos no mapa, conta as
//               cenas de tiroteio recentes, roda o dia (renda/arrego/suspeita) e salva tudo no save.
// As carreiras concretas ficam em careers/Career*.js; a tela, em ui/CareerUI.js. Para aprofundar uma carreira, acrescente trabalhos
// em `jobs()` e ações no `panel()`/`action()` dela.
// ============================================================================

// Barra de texto ▮▮▯▯ para o HUD (frac fora de 0..1 é limitado — nunca gera repeat negativo).
function crBar(frac, n = 10) { const on = Math.max(0, Math.min(n, Math.floor((frac || 0) * n))); return '▮'.repeat(on) + '▯'.repeat(n - on); }

class Career {
    // def: { id, name, icon, color, desc, ranks: [{ name, xp, desc }], skills: { chave: { name, desc } } }
    constructor(mgr, def) {
        this.mgr = mgr; this.g = mgr.g;
        this.id = def.id; this.name = def.name; this.icon = def.icon; this.color = def.color; this.desc = def.desc;
        this.ranks = def.ranks;
        this.skillDefs = def.skills;
        this.xp = 0;
        this.skills = {};
        for (const k of Object.keys(def.skills)) this.skills[k] = 0;
        this.data = {};                                   // estado próprio da carreira (vai inteiro para o save)
    }

    get rank() { let r = 0; this.ranks.forEach((R, i) => { if (this.xp >= R.xp) r = i; }); return r; }
    get rankName() { return this.ranks[this.rank].name; }
    get nextRank() { return this.ranks[this.rank + 1] || null; }
    get points() { return Math.floor(this.xp / Careers.XP_PER_POINT) - Object.values(this.skills).reduce((s, v) => s + v, 0); }
    skill(k) { return this.skills[k] || 0; }

    addXp(n) {
        n = Math.max(0, Math.round(n * (1 + (SkillTree.m.xp || 0))));
        const r0 = this.rank, p0 = this.points, m0 = this.mastery;
        this.xp += n;
        if (this.g.skills) this.g.skills.addXp(n);                      // todo XP de carreira também sobe o NÍVEL DO PERSONAGEM
        if (this.rank > r0) { this.g._flash(`★ ${this.name}: promovido a ${this.rankName.toUpperCase()}! Novos trabalhos liberados (O)`); AudioFX.blip(980, 0.3, 0.24); }
        else if (this.mastery > m0) { this.g._flash(`✦ ${this.name}: MAESTRIA ${this.mastery} (+${this.mastery * 3}% de pagamento nesta carreira)`); AudioFX.blip(1100, 0.25, 0.22); }
        else if (this.points > p0) this.g._flash(`${this.name}: +1 ponto de habilidade — gaste na aba CARREIRAS (O)`);
        if (this.g.achievements) this.g.achievements.check();
    }

    // MAESTRIA: depois da última patente, níveis infinitos (cada um pede 25% a mais de XP que o anterior). +3% de pagamento por nível.
    static masteryXp(k) { return Math.round(1500 * (Math.pow(1.25, k) - 1) / 0.25); }        // XP acumulado acima do topo para a maestria k
    get topXp() { return this.ranks[this.ranks.length - 1].xp; }
    get mastery() { const over = this.xp - this.topXp; if (over < 0) return 0; let k = 0; while (Careers.masteryXpOf(k + 1) <= over) k++; return k; }
    get masteryNext() { const k = this.mastery; return { need: Careers.masteryXpOf(k + 1), have: Math.max(0, this.xp - this.topXp), base: Careers.masteryXpOf(k) }; }

    upgrade(k) {
        if (!(k in this.skills) || this.points <= 0 || this.skills[k] >= 5) return false;
        this.skills[k]++;
        this.mgr.applyMods();
        return true;
    }

    jobs() { return []; }              // [{ id, name, desc, pay, rank, soon?, make: () => CareerJob }]
    panel() { return ''; }             // HTML extra da gestão (botões com data-act="ação" data-arg="…")
    action(name, arg) { return null; } // devolve a mensagem do resultado
    update(dt) {}
    onNewDay() {}
    prompt() { return ''; }            // dicas fora de trabalho (ex.: receptador)
    interact() { return false; }

    serialize() { return { xp: this.xp, skills: this.skills, data: this.data }; }
    load(s) {
        if (!s) return;
        this.xp = s.xp || 0;
        for (const k of Object.keys(this.skills)) this.skills[k] = Math.max(0, Math.min(5, (s.skills && s.skills[k]) || 0));
        Object.assign(this.data, s.data || {});
    }
}

class CareerJob {
    // o: { title, text, limit (s; 0 = sem prazo) }
    constructor(career, o) {
        this.c = career; this.mgr = career.mgr; this.g = career.g;
        this.title = o.title; this.text = o.text;
        this.limit = o.limit || 0; this.t = this.limit;
        this.stage = 0;
        this.tx = null; this.tz = null;
        this.why = '';
    }
    start() { return true; }                          // false + this.why: não deu para começar
    update(dt, pos) {}
    prompt() { return ''; }
    interact() { return false; }
    onCarEntered(car) {}
    dispose() {}
    status() { return ''; }                           // texto extra do painel (etapa atual)

    hud() {
        const p = this.g._playerState().pos, parts = [];
        if (this.limit > 0) { const s = Math.max(0, Math.ceil(this.t)); parts.push(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`); }
        if (this.tx !== null) parts.push(`${Math.round(hypot(p.x - this.tx, p.z - this.tz))} M`);
        const st = this.status();
        if (st) parts.push(st);
        return { title: `${this.c.name} · ${this.title}`, text: this.text, extra: parts.join(' · '), low: this.limit > 0 && this.t < 30 };
    }

    // Alvo da etapa: marcado no mapa + marcador no chão.
    target(x, z, label, color) { this.tx = x; this.tz = z; this.mgr.mark(x, z, color || this.c.color); if (label) this.mgr.gpsTo(x, z, label); }
    near(pos, r) { return this.tx !== null && hypot(pos.x - this.tx, pos.z - this.tz) < r; }
    succeed(money, xp, msg) { this.mgr._finish(this, true, money, xp, msg); }
    fail(why) { this.mgr._finish(this, false, 0, 0, why); }
}

class Careers {
    static get XP_PER_POINT() { return 400; }
    static masteryXpOf(k) { return Career.masteryXp(k); }

    constructor(game) {
        this.g = game;
        Careers.instance = this;
        this.list = [new ChopCareer(this), new BurglarCareer(this), new RobberCareer(this), new GunsmithCareer(this), new ScamCareer(this), new BichoCareer(this)];
        this.by = {};
        for (const c of this.list) this.by[c.id] = c;
        this.job = null;
        this.cool = 0;
        this.jobsDone = 0;
        this.jobsBy = {}; this.jobTypes = {};
        this.scenes = [];                 // cenas de tiroteio recentes: { x, z, age }
        this._dead = new WeakSet();
        this._scanT = 0;
        this._glow = null; this._mk = -1; this._mkOn = false; this._mkT = 0;
        this.ui = new CareerUI(this);
        this.applyMods();
    }

    // ---------------------------------------------------------------- skills → sistemas existentes
    applyMods() {
        const d = this.by.chop.skill('direcao');
        Vehicle.playerGrip = 1 + 0.09 * d + (SkillTree.m.grip || 0);      // menos derrapagem lateral (carreira + habilidade Piloto)
        Vehicle.playerTurn = 1 + 0.05 * d;                   // giro mais vivo
        const mods = this.by.gunsmith.data.mods || {}, mb = this.g.inventory.magBonus = {};      // pente estendido
        for (const k of Object.keys(mods)) if (mods[k].ext) mb[k] = 1;
    }
    silenced(weapon) { const m = this.by.gunsmith.data.mods; return !!(m && m[weapon] && m[weapon].sil); }
    lockpickMul() { return Math.max(0.4, 1 - 0.07 * this.by.chop.skill('mecanica') - (SkillTree.m.lockpick || 0)); }                 // dificuldade do arrombamento (G)
    hotwireTime() { return Math.max(0.6, 3.2 - 0.45 * this.by.chop.skill('mecanica') - (SkillTree.m.hotwire || 0)); }   // s de ligação direta (carro trancado)

    // ---------------------------------------------------------------- trabalhos
    canStart() {
        const g = this.g;
        if (this.job) return 'Você já está num trabalho — termine ou abandone (aba CARREIRAS)';
        if (g.missions && g.missions.cur) return 'Termine o serviço do morro antes';
        if (g.wanted.level > 0) return 'A polícia está atrás de você — despiste antes';
        if (g.arrest || g.death) return 'Agora não dá';
        if (this.cool > 0) return `Espere ${Math.ceil(this.cool)}s — seus contatos estão quietos`;
        return null;
    }

    start(careerId, jobId) {
        const c = this.by[careerId];
        const def = c && c.jobs().find((j) => j.id === jobId);
        if (!def || def.soon) return { ok: false, msg: 'Esse trabalho ainda não existe' };
        if (c.rank < def.rank) return { ok: false, msg: `Precisa da patente ${c.ranks[def.rank].name}` };
        const block = this.canStart() || (def.check && def.check());
        if (block) return { ok: false, msg: block };
        const job = def.make();
        job.defId = def.id;
        if (!job.start()) { job.dispose(); this.unmark(); return { ok: false, msg: job.why || 'Sem trabalho agora' }; }
        this.job = job;
        AudioFX.blip(700, 0.15, 0.18);
        return { ok: true, msg: `${c.name} · ${job.title}: ${job.text}` };
    }

    // Missão de fora das carreiras (malha de influência do Império): ocupa o mesmo espaço de trabalho.
    startExternal(job) {
        const block = this.canStart();
        if (block) return { ok: false, msg: block };
        if (!job.start()) { job.dispose(); this.unmark(); return { ok: false, msg: job.why || 'Sem trabalho agora' }; }
        this.job = job;
        AudioFX.blip(700, 0.15, 0.18);
        return { ok: true, msg: `${job.title}: ${job.text}` };
    }

    abandon() {
        if (!this.job) return { ok: false, msg: 'Nenhum trabalho em andamento' };
        this.job.fail('você abandonou o trabalho');
        return { ok: true, msg: 'Trabalho abandonado' };
    }

    _finish(job, ok, money, xp, msg) {
        if (this.job !== job) return;
        const g = this.g;
        job.dispose();
        this.job = null;
        this.unmark();
        if (g.gps && g.gps._career) g.gps = null;
        if (ok) {
            money = this.payout(job.c, money);
            if (money > 0) g.inventory.addCash(Math.round(money));
            job.c.addXp(xp);
            if (g.empire) g.empire.spend(6, 5);
            this.jobsDone++;
            this.jobsBy[job.c.id] = (this.jobsBy[job.c.id] || 0) + 1;
            if (job.defId) this.jobTypes[job.defId] = (this.jobTypes[job.defId] || 0) + 1;
            this.cool = 8;
            g._flash(`✔ ${job.c.name}: ${msg || job.title + ' concluído'}${money > 0 ? ` +${brl(money)}` : ''} · +${Math.round(xp)} XP`);
            AudioFX.blip(900, 0.2, 0.2);
        } else {
            this.cool = 20;
            g._flash(`✖ ${job.c.name}: ${msg}`);
            AudioFX.blip(170, 0.3, 0.2);
        }
    }

    // Pagamento final: maestria da carreira (+3%/nível), notoriedade do personagem e habilidades de pagamento (Magnata, Contatos, Prestígio).
    payout(c, money) {
        if (!(money > 0)) return 0;
        const sk = this.g.skills;
        return Math.round(money * (1 + 0.03 * c.mastery) * (sk ? sk.payMul : 1) * (1 + (SkillTree.m.jobPay || 0)));
    }

    // ---------------------------------------------------------------- quadro
    // Uma carreira com defeito não pode travar o jogo: erro no quadro vira aviso no console e o trabalho é encerrado.
    update(dt) {
        try { this._update(dt); }
        catch (e) { console.error('[CARREIRAS]', e); if (this.job) { const j = this.job; this.job = null; try { j.dispose(); } catch (e2) { /* nada */ } this.unmark(); } }
    }

    _update(dt) {
        const g = this.g;
        if (this.cool > 0) this.cool -= dt;
        this._scanScenes(dt);
        for (const c of this.list) c.update(dt);
        const job = this.job;
        if (job) {
            if (g.death) job.fail('você caiu');
            else if (g.arrest) job.fail('você foi preso');
            else {
                if (job.limit > 0) { job.t -= dt; if (job.t <= 0) { job.fail('estourou o prazo'); return; } }
                job.update(dt, g._playerState().pos);
            }
        }
        this._pulse(dt);
    }

    hud() { try { return this.job ? this.job.hud() : null; } catch (e) { console.error('[CARREIRAS] hud', e); return null; } }

    prompt() {
        try {
            if (this.job) { const p = this.job.prompt(); if (p) return p; }
            for (const c of this.list) { const p = c.prompt(); if (p) return p; }
        } catch (e) { console.error('[CARREIRAS] prompt', e); }
        return '';
    }

    interact() {
        if (this.job && this.job.interact()) return true;
        for (const c of this.list) if (c.interact()) return true;
        return false;
    }

    onCarEntered(car) { if (this.job) this.job.onCarEntered(car); else if (this.by.chop) this.by.chop.onStolen(car); }

    // Dentro de um carro (tecla E): por enquanto só o desmanche usa (desmanchar o carro roubado).
    carPrompt() { try { return this.by.chop.carPrompt(); } catch (e) { console.error('[CARREIRAS] carPrompt', e); return ''; } }
    carInteract() { return this.by.chop.carInteract(); }
    onPickpocket(npc, pos) { this.by.scam.onPickpocket(npc, pos); }
    onNewDay() { for (const c of this.list) c.onNewDay(); }
    onWanted(n, prev) { this.by.bicho.onWanted(n, prev); }

    // Ação de botão da tela (ui/CareerUI.js).
    uiAction(act, careerId, arg) {
        const c = this.by[careerId];
        if (act === 'job') { const r = this.start(careerId, arg); this.g._flash(r.msg); if (r.ok) this.g.menu.close(); return; }
        if (act === 'guide') { const m = this.g.menu; m.guide = m.guide || new GuideUI(this.g); m.guide.sel = 'career_' + careerId; m.setTab('guide'); return; }
        if (act === 'abandon') { this.g._flash(this.abandon().msg); return; }
        if (act === 'skill' && c) { this.g._flash(c.upgrade(arg) ? `${c.skillDefs[arg].name} nível ${c.skill(arg)}` : 'Sem pontos de habilidade (ou já no máximo)'); return; }
        if (c) { const msg = c.action(act, arg); if (msg) this.g._flash(msg); }
    }

    // ---------------------------------------------------------------- lugares
    // Ponto numa viela da favela (fixo para a mesma `seed`), com profundidade d0..d1 (0 = entrada, 1 = fundo).
    favelaSpot(seed, d0 = 0.15, d1 = 0.4) {
        const key = '_fs' + seed + '_' + d0 + '_' + d1;
        if (this[key]) return this[key];
        const b = Standing._bounds(), rng = Pixel.rng(seed);
        for (let t = 0; t < 400; t++) {
            const x = b.x0 + rng() * (b.x1 - b.x0), z = b.z0 + rng() * (b.z1 - b.z0);
            const r = RoadPlan.nearestRoadPoint(x, z, 30);
            if (!r || !Standing.inFavela(r.x, r.z)) continue;
            const d = Standing.depth(r.x, r.z);
            if (d < d0 || d > d1) continue;
            const home = SafeHouse.spawnWorld();
            if (home && hypot(r.x - home.x, r.z - home.z) < 25) continue;
            return (this[key] = { x: r.x, z: r.z });
        }
        return (this[key] = { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 });
    }

    // Porta de loja (na calçada) entre rMin e rMax de `near`, que passe no filtro; aleatória entre as válidas.
    cityDoor(near, rMin, rMax, ok = null) {
        Interiors.index();
        const pool = Interiors._doors.filter((d) => { const r = hypot(d.x - near.x, d.z - near.z); return r >= rMin && r <= rMax && (!ok || ok(d)); });
        return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    }

    // Casa/apartamento de gente rica (imóvel à venda, não seu) entre rMin e rMax.
    richHome(near, rMin, rMax, minStars = 4) {
        const pool = RealEstate.list.filter((p) => p.stars >= minStars && !RealEstate.isOwned(p) && hypot(p.x - near.x, p.z - near.z) >= rMin && hypot(p.x - near.x, p.z - near.z) <= rMax);
        return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    }

    // Cena de tiroteio recente (policial/traficante morto) entre rMin e rMax.
    recentScene(near, rMin, rMax) {
        let best = null;
        for (const s of this.scenes) { const d = hypot(s.x - near.x, s.z - near.z); if (d >= rMin && d <= rMax && (!best || s.age < best.age)) best = s; }
        return best;
    }

    _scanScenes(dt) {
        for (const s of this.scenes) s.age += dt;
        this._scanT -= dt;
        if (this._scanT > 0) return;
        this._scanT = 0.5;
        this.scenes = this.scenes.filter((s) => s.age < 240);
        const units = [].concat(this.g.policeManager ? this.g.policeManager.officers : [], this.g.gangs ? this.g.gangs.members : []);
        for (const u of units) {
            if (u.alive || this._dead.has(u)) continue;
            this._dead.add(u);
            const p = u.position;
            if (!this.scenes.some((s) => hypot(s.x - p.x, s.z - p.z) < 20)) this.scenes.push({ x: p.x, z: p.z, age: 0 });
        }
    }

    // Animação de trabalho por `seconds` (os clipes 'pick' e 'rummage' são em loop: sem o timer o jogador ficaria ocupado para sempre).
    act(clip, seconds) { const pl = this.g.player; if (pl.busy) return false; const ok = pl.playAction(clip, { lock: 0 }); if (ok) pl.action.timer = seconds; return ok; }

    // Ponto onde o jogador cabe (fora de prédios/muros) e em terra firme.
    walkable(x, z) { const q = { x, z }; return MapGeo.isLand(x, z) && !MapGeo.resolveCircle(q, 0.7); }
    // Ponto de rua/viela (sempre transitável) perto de (x, z), ou null.
    streetNear(x, z, r = 14) { const q = RoadPlan.nearestRoadPoint(x, z, r); return q ? { x: q.x, z: q.z } : null; }

    // Policial mais perto (u) e pedestre olhando (dentro de r) — para os desafios de "ser visto".
    copDist(pos) { return this.g.policeManager ? this.g.policeManager.nearestDist(pos) : Infinity; }
    watcher(pos, r) { return this.g.npcManager ? this.g.npcManager.nearestTarget(pos, r, (n) => !n.fleeing && n.state !== 'HURT') : null; }
    calm() { const g = this.g; return g.mode === 'player' && !g.input.isSprinting() && g.player.weapon === 'none' && g.wanted.level === 0; }
    atBase() { const p = this.g.player.position; return Standing.inFavela(p.x, p.z) || HouseView.inside || !!(Interiors.active && Interiors.active.shop.home); }

    // ---------------------------------------------------------------- Marcador no mapa e no chão
    gpsTo(x, z, label) { this.g.setGps(x, z, label); if (this.g.gps) this.g.gps._career = true; }

    mark(x, z, color = '#ffd23a') {
        if (!this._glow) { this._glow = new GlowBatch(this.g.scene, 2, 'careerGlow', 'glow'); this._mk = this._glow.alloc(); }
        const c = BABYLON.Color3.FromHexString(color);
        this._mkPos = { x, z }; this._mkCol = c; this._mkOn = true;
        this._glow.place(this._mk, x, 0.25, z, 3.2);
    }
    unmark() { this._mkOn = false; if (this._glow) { this._glow.off(this._mk); this._glow.flush(); } }
    _pulse(dt) {
        if (!this._glow || !this._mkOn) return;
        this._mkT += dt;
        const k = 0.55 + 0.45 * Math.sin(this._mkT * 5), c = this._mkCol;
        this._glow.place(this._mk, this._mkPos.x, 0.25, this._mkPos.z, 2.6 + k * 1.2);
        this._glow.color(this._mk, c.r * k, c.g * k, c.b * k, 1);
        this._glow.flush();
    }

    // ---------------------------------------------------------------- save
    serialize() {
        const out = { jobsDone: this.jobsDone, jobsBy: this.jobsBy, jobTypes: this.jobTypes, c: {} };
        for (const c of this.list) out.c[c.id] = c.serialize();
        return out;
    }
    load(s) {
        if (!s) return;
        this.jobsDone = s.jobsDone || 0; this.jobsBy = s.jobsBy || {}; this.jobTypes = s.jobTypes || {};
        for (const c of this.list) c.load(s.c && s.c[c.id]);
        this.applyMods();
    }
}
