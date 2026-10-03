// ============================================================================
// Missions — as MISSÕES DO TRÁFICO (C.V). O jogador pede serviço na BOCA DE FUMO (ShopUI → "PEDIR SERVIÇO") e recebe uma por vez:
//   • ENTREGA (aviãozinho)   leve o pacote até o ponto marcado, nas vielas, dentro do prazo. Paga em dinheiro + moral do tráfico.
//   • COBRANÇA (soldado)     vá até o devedor (sprite no ponto) e aperte E COM UMA ARMA NA MÃO (intimidação): você fica com parte
//                            do dinheiro; o tráfico gosta, a comunidade não.
//   • DEFESA (soldado)       só durante uma operação policial: derrube 3 policiais da operação.
// Patentes pelo nº de missões feitas (e pela moral do tráfico): Aviãozinho → Soldado (3 missões, tráfico ≥ 50) → Gerente de
// Frente (8 missões, tráfico ≥ 65: paga mais). Falhar (prazo, morte, prisão, abandono) custa moral do tráfico.
// A missão ativa mostra um painel no HUD e o destino vai para o GPS (Game.setGps). Salvo no save: só `Standing.missionsDone`.
// ============================================================================

class Missions {
    static get RANKS() { return ['AVIÃOZINHO', 'SOLDADO', 'GERENTE DE FRENTE']; }
    static get rank() {
        const n = Standing.missionsDone || 0;
        if (n >= 8 && Standing.traffic >= 65) return 2;
        if (n >= 3 && Standing.traffic >= 50) return 1;
        return 0;
    }
    static get rankName() { return Missions.RANKS[Missions.rank]; }

    constructor(game) {
        this.g = game;
        this.cur = null;            // missão ativa
        this.cool = 0;              // s até poder pedir outra
        this.actor = null;          // devedor (sprite)
        this._lastRank = 0;
    }

    // ---------------------------------------------------------------- pedir serviço
    // Tipos que o jogador pode receber agora.
    available() {
        const r = Missions.rank, out = ['delivery'];
        if (r >= 1) out.push('collect');
        if (r >= 1 && this.g.op && this.g.op.active) out.push('defend');
        return out;
    }

    // Ponto numa viela da favela, entre `dmin` e `dmax` u do jogador, com profundidade `d0..d1`.
    _pickPoint(dmin, dmax, d0, d1) {
        const b = Standing._bounds(), p = this.g.player.position, home = SafeHouse.spawnWorld();
        for (let t = 0; t < 80; t++) {
            const x = b.x0 + Math.random() * (b.x1 - b.x0), z = b.z0 + Math.random() * (b.z1 - b.z0);
            const r = RoadPlan.nearestRoadPoint(x, z, 30);
            if (!r || r.edge.cls !== 'fav' || !Standing.inFavela(r.x, r.z)) continue;
            const d = Standing.depth(r.x, r.z), dist = Math.hypot(r.x - p.x, r.z - p.z);
            if (d < d0 || d > d1 || dist < dmin || dist > dmax) continue;
            if (home && Math.hypot(r.x - home.x, r.z - home.z) < 40) continue;
            return { x: r.x, z: r.z };
        }
        return null;
    }

    offer() {
        const g = this.g;
        if (this.cur) return { ok: false, msg: 'Você já tem um serviço em andamento' };
        if (g.careers && g.careers.job) return { ok: false, msg: 'Termine (ou abandone) o trabalho da sua carreira antes' };
        if (this.cool > 0) return { ok: false, msg: `Volte daqui a ${Math.ceil(this.cool)}s — o chefe não tem nada agora` };
        if (!Standing.isResident(Standing.territoryAt(g.player.position.x, g.player.position.z))) return { ok: false, msg: 'Você não é do morro: ninguém te dá serviço' };
        if (Standing.traffic < 20) return { ok: false, msg: 'Seu nome está sujo com o tráfico. Pague a taxa antes' };
        const types = this.available(), type = types[Math.floor(Math.random() * types.length)], mult = 1 + Missions.rank * 0.4;
        let m = null;
        if (type === 'delivery') {
            const to = this._pickPoint(90, 280, 0.25, 0.9);
            if (!to) return { ok: false, msg: 'Sem serviço agora' };
            const route = Gps.route(g.player.position, to), limit = Math.round(route.len / 3.2 + 70);
            m = { type, title: 'ENTREGA', text: 'Leve o pacote até o ponto marcado', to, limit, t: limit, reward: Math.round((140 + Math.random() * 90) * mult) };
        } else if (type === 'collect') {
            const to = this._pickPoint(80, 260, 0.2, 0.85);
            if (!to) return { ok: false, msg: 'Sem serviço agora' };
            m = { type, title: 'COBRANÇA', text: 'Cobre o devedor — com uma arma na mão', to, limit: 360, t: 360, reward: Math.round((300 + Math.random() * 200) * 0.5 * mult) };
            this._spawnDebtor(to);
        } else {
            m = { type, title: 'DEFESA DO MORRO', text: 'Derrube 3 policiais da operação', need: 3, got: 0, limit: 0, t: 0, reward: Math.round(350 * mult) };
        }
        this.cur = m;
        if (m.to) g.setGps(m.to.x, m.to.z, m.type === 'delivery' ? 'Entrega do morro' : 'Devedor');
        return { ok: true, msg: `${m.title}: ${m.text}. Paga ${brl(m.reward)}` };
    }

    abandon() {
        if (!this.cur) return { ok: false, msg: 'Nenhum serviço em andamento' };
        this._fail('Você abandonou o serviço');
        return { ok: true, msg: 'Serviço abandonado (moral do tráfico −3)' };
    }

    // ---------------------------------------------------------------- andamento
    _spawnDebtor(to) {
        const g = this.g, [va, vb] = CharacterRig.VARIANT_GROUPS.poor;
        this.actor = new SpriteActor(g.scene, g.sprites.sheets.civB, va + Math.floor(Math.random() * (vb - va + 1)), 'devedor');
        this.actor.play('idle', 'none'); this.actor.setPosition(to.x, to.z); this.actor.setHeading(Math.random() * Math.PI * 2);
    }

    _clear() {
        if (this.actor) { this.actor.dispose(); this.actor = null; }
        this.cur = null;
        if (this.g.gps) this.g.gps = null;
    }

    _fail(why) {
        Standing.add('traffic', this.cur && this.cur.type === 'defend' ? -2 : -3);
        this._clear(); this.cool = 30;
        this.g._flash(`✖ Serviço falhou: ${why}`);
        AudioFX.blip(160, 0.3, 0.2);
    }

    _done(extra = '') {
        const m = this.cur, g = this.g;
        g.inventory.addCash(m.reward);
        Standing.missionsDone = (Standing.missionsDone || 0) + 1;
        Standing.add('traffic', m.type === 'defend' ? 12 : (m.type === 'collect' ? 8 : 6));
        const rank = Missions.rank;
        g._flash(`✔ ${m.title} cumprida: +${brl(m.reward)}${extra}`);
        if (rank > this._lastRank) g._flash(`★ Promovido a ${Missions.rankName}!`);
        this._lastRank = rank;
        AudioFX.blip(900, 0.2, 0.2);
        this._clear(); this.cool = 45;
    }

    onCopKilled() {
        const m = this.cur;
        if (!m || m.type !== 'defend') return;
        m.got++;
        if (m.got >= m.need) this._done();
    }

    update(dt, pos) {
        const g = this.g;
        if (this.cool > 0) this.cool -= dt;
        const m = this.cur;
        if (!m) return;
        if (g.death) { this._fail('você caiu'); return; }
        if (g.arrest) { this._fail('você foi preso'); return; }
        if (m.type === 'defend') {
            if (!(g.op && g.op.active)) this._fail('a operação acabou');
            return;
        }
        m.t -= dt;
        if (m.t <= 0) { this._fail('estourou o prazo'); return; }
        if (this.actor) this.actor.update(dt, 1);
        if (m.type === 'delivery' && Math.hypot(pos.x - m.to.x, pos.z - m.to.z) < 4.5 && g.mode === 'player') this._done();
    }

    // ---------------------------------------------------------------- cobrança (tecla E)
    nearDebtor(maxD = 2.8) {
        const m = this.cur, p = this.g.player.position;
        return !!(m && m.type === 'collect' && this.actor && Math.hypot(p.x - m.to.x, p.z - m.to.z) < maxD);
    }

    interact() {
        if (!this.nearDebtor()) return false;
        const g = this.g, m = this.cur;
        if (g.player.weapon === 'none') { g._flash('Saque uma arma pra cobrar: é na intimidação'); return true; }
        const amount = 300 + Math.floor(Math.random() * 200);
        this.actor.play('surrender', 'none', { restart: true });
        Standing.add('community', -4);
        Standing.addHeat(2, 'cobrança a morador');
        this._done(` (cobrou ${brl(amount)}, sua parte: o resto vai pro morro · comunidade −4)`);
        return true;
    }

    prompt() {
        if (!this.nearDebtor()) return '';
        return this.g.player.weapon === 'none'
            ? '<b>E</b> cobrar o devedor<small>precisa de arma na mão (intimidação)</small>'
            : '<b>E</b> cobrar o devedor<small>ele paga na hora — mas a comunidade não gosta</small>';
    }

    // Linhas do painel do HUD.
    hud() {
        const m = this.cur;
        if (!m) return null;
        let extra = '';
        if (m.type === 'defend') extra = `${m.got}/${m.need} POLICIAIS`;
        else {
            const p = this.g.player.position, d = Math.round(Math.hypot(p.x - m.to.x, p.z - m.to.z)), s = Math.max(0, Math.ceil(m.t));
            extra = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} · ${d} M`;
        }
        return { title: m.title, text: m.text, extra, low: m.type !== 'defend' && m.t < 30 };
    }
}
