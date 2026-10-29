// ============================================================================
// NightLife — a NOITE do Morro do Mirante (C.P.C). Toda noite, das 22h às 5h, a quadra do alto do morro vira festa: o mesmo baile do
// Morro do C.V (npc/Baile.js: palco, DJ, tendas, luzes, tamborzão que abafa tiro), mas com outro público — playboy da cidade,
// turista, executivo, "famoso" de óculos escuro — que sobe para curtir e comprar droga. Na rua, carrão estacionado (TrafficManager).
// Trégua da festa: com a festa rolando, o C.P.C deixa o visitante em paz NA FESTA (a até `radius` do palco), desde que ele não esteja
// sendo procurado pela polícia nem tenha provocado o tráfico — fora dela, ou de dia, quem é do C.V continua sendo inimigo.
// ============================================================================

const NightLife = Object.assign(Object.create(Baile), {
    force: false, on: false, c: null, radius: 70,
    _built: false, _dancers: [], _meshes: [], _mats: {}, _poi: null, _partyList: [], _base: 0, _beat: 0, _step: 0,
    title: 'BAILE DO MIRANTE', poiName: 'Festa do Mirante (22h–5h)', hours: [22, 5],
    announce: '🎉 O MIRANTE está fervendo hoje (até 5h) — a galera da pista sobe para curtir; na festa o C.P.C deixa o visitante em paz',
    plan() { return typeof FavelaSul !== 'undefined' ? FavelaSul : null; },
    near(x, z, m) { const F = this.plan(); return !!F && F.built && F.distTo(x, z) <= m; },
    bounds() { const F = this.plan(); return F && F.bounds ? F.bounds : { x0: 0, z0: 0, x1: -1, z1: -1 }; },
    inside(x, z) { const F = this.plan(); return !!F && F.built && F.inTerritory(x, z); },
    // o público: gente de fora (pista, turista, executivo) e alguns moradores
    crowdStyle() { const r = Math.random(); return r < 0.3 ? 'casual' : (r < 0.5 ? 'tourist' : (r < 0.68 ? 'biz' : (r < 0.82 ? 'beach' : 'poor'))); },
    scheduled() { return true; },                                    // o Mirante ferve toda noite

    // O C.P.C tolera o jogador aqui? (festa rolando, perto do palco, sem polícia na cola e sem ter provocado a facção)
    tolerated(T, x, z) {
        if (!T || T.id !== 'cpc' || !this.on || !this.c) return false;
        const g = window.game;
        if (g && g.wanted && g.wanted.level > 0) return false;
        if (g && g.gangs && g.gangs.provoked && g.gangs.provoked.cpc > 0) return false;
        return hypot(x - this.c.x, z - this.c.z) < this.radius;
    },

    update(dt, game) {
        if (!this.plan() || !this.plan().built) return;
        Baile.update.call(this, dt, game);
        // aviso da trégua ao chegar perto da festa (uma vez por noite)
        if (!this.on) { this._told = false; return; }
        const p = game._playerState().pos;
        if (!this._told && this.c && hypot(p.x - this.c.x, p.z - this.c.z) < this.radius + 40) {
            this._told = true;
            game._flash('🎶 Festa no Mirante: aqui em cima o C.P.C deixa você curtir. Saiu da festa, é território inimigo.');
        }
    },
});
