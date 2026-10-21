// ============================================================================
// WorldMemory — o mundo LEMBRA de você. Guardado no save (SaveGame: worldMemory).
//   • Por estabelecimento: visitas (uma por dia), quanto gastou, os assaltos (dias), as partidas de sinuca/truco ganhas e perdidas
//     ali. O atendente cumprimenta conforme isso (primeira vez, freguês, VIP, "de novo você?!"), o freguês ganha desconto, a loja
//     assaltada recusa atendimento por uns dias, põe um PM na porta, chama a polícia mais rápido e deixa pouco dinheiro no caixa.
//   • Por bairro (Empire.DISTRICTS): os crimes que você cometeu ali (com peso e esquecimento: meia-vida de ~2 semanas) viram MEDO;
//     gastar, jogar limpo e ajudar viram RESPEITO. Quem passa na rua comenta (Rumors / StreetLife) e a polícia do bairro fica de olho.
//   • Por adversário (sinuca, truco): vitórias e derrotas — revanche, provocação, "esse aí é bom no truco".
//   • Diário de acontecimentos (os últimos 60): a matéria-prima do jornal, da TV do bar e do rádio (News).
// ============================================================================

const WorldMemory = {
    shops: {}, districts: {}, opps: {}, events: [], seq: 0,
    W: { robbery: 6, heist: 12, kill: 10, cop: 15, holdup: 3, theft: 1, carjack: 2, fight: 1.5, shootout: 4 },
    HALF: 14,                        // dias: meia-vida do medo (o bairro esquece aos poucos)

    serialize() { return { shops: this.shops, districts: this.districts, opps: this.opps, events: this.events.slice(-60), seq: this.seq }; },
    load(s) {
        this.shops = (s && s.shops) || {}; this.districts = (s && s.districts) || {}; this.opps = (s && s.opps) || {};
        this.events = (s && s.events) || []; this.seq = (s && s.seq) || 0;
    },

    _day() { return typeof Economy !== 'undefined' ? Economy.day : 0; },
    _hour() { const g = window.game; return g && g.dayNight ? g.dayNight.hour : 12; },
    _dist(x, z) { const g = window.game; return g && g.empire && x != null ? g.empire.districtAt(x, z) : 'centro'; },
    shop(id) { return this.shops[id] || (this.shops[id] = { v: 0, spent: 0, robbed: [], last: -1, games: {} }); },
    district(d) { return this.districts[d] || (this.districts[d] = { ev: [], good: 0 }); },

    // ------------------------------------------------------------------ registro
    log(kind, data = {}) {
        const e = Object.assign({ n: ++this.seq, kind, day: this._day(), hour: Math.round(this._hour() * 10) / 10 }, data);
        this.events.push(e);
        if (this.events.length > 60) this.events.splice(0, this.events.length - 60);
        if (typeof News !== 'undefined' && News.onEvent) News.onEvent(e);
        if (typeof Phone !== 'undefined' && Phone.onEvent) Phone.onEvent(e);      // os contatos do celular reagem
        return e;
    },
    crime(kind, x, z, extra = {}) {
        const d = extra.district || this._dist(x, z), D = this.district(d);
        D.ev.push([this._day(), this.W[kind] || 1]);
        if (D.ev.length > 80) D.ev.splice(0, D.ev.length - 80);
        return this.log(kind, Object.assign({ district: d, x: x != null ? Math.round(x) : null, z: z != null ? Math.round(z) : null }, extra));
    },
    good(x, z, n = 1, why = '') { const d = this._dist(x, z); this.district(d).good += n; if (why) this.log('good', { district: d, why }); },

    // ------------------------------------------------------------------ ganchos
    onVisit(shop) {
        const r = this.shop(shop.id), day = this._day(), first = r.v === 0;
        if (r.last !== day) { r.v++; r.last = day; }
        r.name = shop.name;
        return { first, rec: r };
    },
    onSpend(shop, v) { if (!shop || !shop.id || !(v > 0)) return; const r = this.shop(shop.id); r.spent += v; this.good(shop.x, shop.z, v / 400); },
    onRobbed(shop, how, total) {
        const r = this.shop(shop.id); r.robbed.push(this._day()); if (r.robbed.length > 12) r.robbed.shift(); r.name = shop.name;
        this.crime('robbery', shop.x, shop.z, { place: shop.name, style: shop.style, how, value: Math.round(total || 0) });
    },
    onGame(kind, shop, opp, won, bet) {
        const k = kind + ':' + opp, o = this.opps[k] || (this.opps[k] = { w: 0, l: 0, streak: 0 });
        if (won) { o.w++; o.streak = Math.max(1, o.streak + 1); } else { o.l++; o.streak = Math.min(-1, o.streak - 1); }
        o.last = this._day(); o.lastWon = !!won;
        if (shop && shop.id) { const r = this.shop(shop.id), G = r.games[kind] || (r.games[kind] = { w: 0, l: 0 }); won ? G.w++ : G.l++; }
        if (won && bet >= 1500) this.log('bigwin', { game: kind, opp, value: bet * 2, place: shop && shop.name, district: shop ? this._dist(shop.x, shop.z) : null });
    },
    record(kind, opp) { return this.opps[kind + ':' + opp] || { w: 0, l: 0, streak: 0 }; },

    // ------------------------------------------------------------------ leituras
    daysSinceRobbed(shop) { const r = this.shops[shop.id]; if (!r || !r.robbed.length) return null; return this._day() - r.robbed[r.robbed.length - 1]; },
    guarded(shop) { const d = this.daysSinceRobbed(shop); return d != null && d <= 5; },          // PM na porta
    refuses(shop) { const d = this.daysSinceRobbed(shop); return d != null && d <= 3 && !(typeof Business !== 'undefined' && Business.isOwned(shop)); },
    tier(shop) {                                                         // 0 nunca veio · 1 conhecido · 2 freguês · 3 VIP
        const r = this.shops[shop.id]; if (!r || !r.v) return 0;
        return r.spent >= 5000 || r.v >= 15 ? 3 : r.v >= 5 || r.spent >= 800 ? 2 : 1;
    },
    // Medo e respeito no bairro (0–100).
    fame(d) {
        const D = this.districts[d]; if (!D) return { fear: 0, respect: 0 };
        const day = this._day(); let f = 0;
        for (const [t, w] of D.ev) f += w * Math.pow(0.5, (day - t) / this.HALF);
        return { fear: Math.min(100, Math.round(f * 2.2)), respect: Math.min(100, Math.round(D.good * 1.6)) };
    },
    fameAt(x, z) { return this.fame(this._dist(x, z)); },
    fameLabel(F) {
        if (F.fear >= 60) return F.respect >= 40 ? 'temido e respeitado' : 'temido';
        if (F.fear >= 25) return F.respect >= 30 ? 'conhecido (e um pouco temido)' : 'mal-falado';
        if (F.respect >= 40) return 'querido';
        if (F.respect >= 12) return 'conhecido';
        return 'desconhecido';
    },
    // Fatores de preço da memória (Economy.factors).
    priceFactors(shop) {
        const out = [], t = this.tier(shop);
        if (t === 3) out.push({ label: 'Cliente VIP da casa', mul: 0.9 });
        else if (t === 2) out.push({ label: 'Freguês da casa', mul: 0.95 });
        const d = this.daysSinceRobbed(shop);
        if (d != null && d <= 10 && d > 3) out.push({ label: 'Desconfiança (o assalto)', mul: 1.15 });
        const F = this.fame(this._dist(shop.x, shop.z));
        if (F.fear >= 60 && shop.district !== 'favela') out.push({ label: 'Medo de você (cobram menos)', mul: 0.92 });
        return out;
    },

    // ------------------------------------------------------------------ o que dizem ao te ver
    _pick(a) { return a[Math.floor(Math.random() * a.length)]; },
    greeting(shop, first) {
        const H = this._hour(), hi = H < 12 ? 'Bom dia' : H < 18 ? 'Boa tarde' : 'Boa noite';
        const d = this.daysSinceRobbed(shop);
        if (d != null && d <= 3) return { tone: 'angry', text: this._pick(['De novo você?! Some daqui antes que eu chame a polícia!', 'Eu lembro da sua cara… pode ir saindo!', 'Aqui você não é bem-vindo. Já falei com a PM.']) };
        if (d != null && d <= 10) return { tone: 'whisper', text: this._pick(['(o atendente engole seco e não tira o olho de você)', 'Pois não…? (a mão perto do telefone)', `${hi}… (desconfiado)`]) };
        const F = this.fame(this._dist(shop.x, shop.z));
        if (F.fear >= 60) return { tone: 'whisper', text: this._pick(['O-o que o senhor manda? É por conta da casa…', 'Fica à vontade, chefe. Não quero problema.', 'Seja bem-vindo, patrão…']) };
        const t = this.tier(shop), bar = shop.style === 'bar';
        if (first) return { tone: 'talk', text: this._pick([`${hi}! Primeira vez aqui? Fica à vontade.`, `${hi}! Seja bem-vindo.`, `${hi}! Pode chegar.`]) };
        const r = this.shops[shop.id], g = r && r.games;
        if (bar && g && ((g.truco && g.truco.w >= 2) || (g.pool && g.pool.w >= 2))) return { tone: 'talk', text: this._pick(['Olha ele aí! O terror do truco!', 'Chegou o craque da sinuca! Vai uma gelada?', 'Ih, lá vem o tubarão… esconde o dinheiro, pessoal!']) };
        if (t === 3) return { tone: 'talk', text: this._pick(['Meu cliente preferido! O de sempre?', `${hi}, patrão! Já separei o melhor pra você.`, 'Olha quem chegou! Hoje tem desconto especial.']) };
        if (t === 2) return { tone: 'talk', text: this._pick([`Fala, freguês! O de sempre?`, `${hi}! Sumido, hein?`, 'E aí, tudo certo? Pode pedir.']) };
        return { tone: 'talk', text: this._pick([`${hi}!`, `${hi}, pois não?`, 'Opa, tudo bem?']) };
    },
    // O que os clientes cochicham quando você entra (fama no bairro e na casa).
    murmur(shop) {
        const F = this.fame(this._dist(shop.x, shop.z)), d = this.daysSinceRobbed(shop), out = [];
        if (d != null && d <= 10) out.push('Foi ele que assaltou aqui…', 'Não olha, não olha…', 'Esse aí de novo?');
        if (F.fear >= 45) out.push('É ele… dizem que é perigoso.', 'Fala baixo, ele tá ouvindo.', 'Esse cara manda no bairro.');
        const r = this.shops[shop.id], g = r && r.games;
        if (g && g.truco && g.truco.w >= 2) out.push('Esse aí ganhou o Bigode no truco!', 'Não joga truco com ele não…');
        if (g && g.pool && g.pool.w >= 2) out.push('O cara mata qualquer bola…', 'Esse aí joga muito na sinuca.');
        if (F.respect >= 40) out.push('Gente boa esse aí.', 'Sempre deixa gorjeta.');
        return out;
    },
    // Revanche (sinuca/truco): o que o adversário diz pelo histórico.
    taunt(kind, opp) {
        const o = this.record(kind, opp);
        if (!o.w && !o.l) return '';
        if (o.lastWon && o.streak >= 2) return this._pick(['Você de novo? Hoje eu me vingo!', 'Revanche! Dessa vez não tem sorte.', `Já são ${o.w} derrotas pra você… chega!`]);
        if (o.lastWon) return this._pick(['Quero a revanche!', 'Sorte de principiante. Bora de novo?', 'Hoje eu vim preparado.']);
        if (o.streak <= -2) return this._pick(['Voltou pra perder mais?', 'Já gastou a mesada?', 'Gosto de cliente fiel.']);
        return this._pick(['Veio pegar o troco?', 'Mais uma? Tô com tempo.', 'Senta aí que eu te ensino.']);
    },
};
