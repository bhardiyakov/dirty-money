// ============================================================================
// News — o jornal, a TV do bar e o rádio do carro. Os acontecimentos da WorldMemory (assalto, morte, golpe, fuga, prisão, grande
// prêmio na mesa) viram MANCHETE algumas horas depois (a "próxima edição") e ficam quentes por uns dias; o resto é a cidade
// (a estação do ano do Empire, a previsão do tempo, o futebol, os preços). Quem está no bar comenta (chatter / ShopLife; Rumors na rua).
//   • TV (bar, lanchonete, padaria, pizzaria): letreiro passando embaixo da tela, com a vinheta do "RS Notícias".
//   • Rádio (dirigindo): um boletim a cada ~1 min de estrada, num cartão no canto (Rádio Cidade 98,1).
//   • Status (PauseMenu): as últimas manchetes.
// ============================================================================

const News = {
    pending: [],                    // eventos esperando a próxima edição
    items: [],                      // manchetes publicadas { text, day, hour, hot, kind, district, n }
    TV_STYLES: ['bar', 'burger', 'bakery', 'pizza'],
    DELAY_H: 1.5,                   // horas de jogo até o evento virar notícia

    serialize() { return { items: this.items.slice(-30), pending: this.pending.slice(-20) }; },
    load(s) { this.items = (s && s.items) || []; this.pending = (s && s.pending) || []; },

    _d(e) { return e.district && typeof Empire !== 'undefined' && Empire.DISTRICTS[e.district] ? Empire.DISTRICTS[e.district].name : 'na cidade'; },
    AT: { favela: 'na Favela do Morro', centro: 'no Distrito Financeiro', comercio: 'no Comércio', residencial: 'nos bairros residenciais', orla: 'na Orla', industrial: 'no Porto', ilha: 'na Ilha Praiana', periferia: 'na Periferia' },
    _no(e) { return (e && this.AT[e.district]) || 'na cidade'; },
    _pick(a) { return a[Math.floor(Math.random() * a.length)]; },
    _now() { return { day: typeof Economy !== 'undefined' ? Economy.day : 0, hour: window.game && window.game.dayNight ? window.game.dayNight.hour : 12 }; },
    _age(it) { const n = this._now(); return (n.day - it.day) * 24 + (n.hour - it.hour); },

    onEvent(e) {
        if (!this.headline(e)) return;
        this.pending.push(e);
        if (this.pending.length > 30) this.pending.shift();
    },
    // Manchete de um acontecimento (null: não vira notícia).
    headline(e) {
        const v = e.value ? brl(e.value) : '', at = this._no(e), p = e.place;
        switch (e.kind) {
            case 'robbery': return e.how === 'fight' ? `Tiroteio em assalto à ${p} ${at}` : e.how === 'quiet' ? `Assaltante leva ${v || 'o caixa'} da ${p} sem disparar o alarme` : `Assalto à ${p} ${at}: bandido leva ${v || 'o caixa'}`;
            case 'heist': return this._pick([`Golpe milionário na joalheria ${p}: prejuízo de ${v}`, `Quadrilha limpa as vitrines da ${p} — polícia não tem pistas`]);
            case 'kill': return this._pick([`Homem é morto a tiros ${at}`, `Violência: mais uma morte ${at}`, `Corpo é encontrado ${at}; polícia investiga`]);
            case 'cop': return this._pick([`Policial é morto em serviço ${at}; PM promete resposta`, `Luto na PM: soldado é assassinado ${at}`]);
            case 'holdup': return this._pick([`Pedestre é assaltado à mão armada ${at}`, `Moradores ${at} reclamam de assaltos na rua`]);
            case 'carjack': return this._pick([`Motorista é arrancado do carro em roubo ${at}`, `Roubo de carro ${at}: vítima é tirada à força`]);
            case 'theft': return null;                                   // (furtos: só em onda — ver _waves)
            case 'escape': return this._pick([`Suspeito despista a polícia depois de perseguição ${at}`, `Fuga cinematográfica ${at}: viaturas perdem o rastro`]);
            case 'busted': return this._pick([`Polícia prende suspeito ${at}`, `Preso em flagrante ${at} depois de perseguição`]);
            case 'tourney': return `${p ? p + ': f' : 'F'}orasteiro vence o torneio de truco de sábado e leva ${v}`;
            case 'boca': return this._pick([`Ponto de venda de drogas é destruído ${at}; moradores falam em guerra entre grupos`, `Tiroteio ${at}: boca do tráfico é desmontada`]);
            case 'rivalboca': return this._pick([`Moradores denunciam novo ponto de venda de drogas ${at}`, `Tráfico se espalha: nova boca é vista ${at}`]);
            case 'rivalwar': return 'Polícia teme guerra entre grupos rivais no porto';
            case 'rivaldead': return 'Chefe do tráfico conhecido como "Dentinho" é encontrado morto no porto';
            case 'rivalgone': return '"Dentinho", nome conhecido do crime, é visto deixando a cidade de ônibus';
            case 'rivalbetray': return 'Denúncia anônima entrega nome de suspeito à Polícia Civil';
            case 'bigwin': return e.game === 'truco' ? `Jogador fatura ${v} no truco ${p ? 'no ' + p : at} e humilha a mesa` : `Taco de ouro: apostador leva ${v} na sinuca ${p ? 'do ' + p : at}`;
            default: return null;
        }
    },

    // Publica o que já passou do atraso; ondas de furto e o medo no bairro também viram matéria.
    tick() {
        const n = this._now();
        for (const e of this.pending.slice()) {
            const age = (n.day - e.day) * 24 + (n.hour - e.hour);
            if (age < this.DELAY_H) continue;
            this.pending.splice(this.pending.indexOf(e), 1);
            const text = this.headline(e); if (!text) continue;
            this._publish({ text, kind: e.kind, district: e.district, n: e.n, mine: true });
        }
        this._waves();
    },
    _publish(it) {
        const n = this._now();
        if (this.items.some((q) => q.text === it.text && n.day - q.day < 2)) return;
        this.items.push(Object.assign({ day: n.day, hour: Math.round(n.hour * 10) / 10 }, it));
        if (this.items.length > 40) this.items.splice(0, this.items.length - 40);
    },
    _waves() {
        if (typeof WorldMemory === 'undefined') return;
        const day = this._now().day, by = {};
        for (const e of WorldMemory.events) if (e.kind === 'theft' && e.day === day) by[e.district] = (by[e.district] || 0) + 1;
        for (const [d, k] of Object.entries(by)) if (k >= 3) this._publish({ text: `Onda de furtos ${this._no({ district: d })}: ${k} casos só hoje`, kind: 'theft', district: d, mine: true });
        for (const d of Object.keys(WorldMemory.districts)) {
            const F = WorldMemory.fame(d);
            if (F.fear >= 60) this._publish({ text: `Medo ${this._no({ district: d })}: moradores falam em "um homem perigoso" rondando o bairro`, kind: 'fear', district: d, mine: true });
        }
    },

    // As notícias da cidade (não são suas): a estação, o tempo, o futebol, a economia.
    city() {
        const g = window.game, out = [];
        const sid = g && g.empire ? g.empire.seasonId : 'calmaria';
        if (sid === 'carnaval') out.push('Carnaval: blocos arrastam multidões e a PM reforça o policiamento', 'Escolas de samba fazem o último ensaio antes do desfile');
        if (sid === 'eleicoes') out.push('Eleições: candidatos fazem carreata no Centro', 'Pesquisa mostra disputa apertada para a prefeitura', 'TRE alerta para compra de votos');
        if (sid === 'intervencao') out.push('Intervenção federal: Exército faz blitz nas saídas da cidade', 'Tanques nas ruas: moradores relatam revistas nas comunidades');
        const W = typeof Weather !== 'undefined' && Weather.cur;
        if (W && W.raining) out.push('Defesa Civil alerta para chuva forte e risco de alagamento');
        else out.push('Previsão: tempo firme, calor de até 36 graus na Orla');
        const t = ['Rio Seco FC', 'Esporte Clube Morro', 'Portuários', 'Atlético da Ilha'], a = this._pick(t), b = this._pick(t.filter((x) => x !== a));
        out.push(`Futebol: ${a} vence o ${b} por ${1 + Math.floor(Math.random() * 3)} a ${Math.floor(Math.random() * 2)} no clássico`, 'Gasolina sobe pela terceira semana seguida nos postos da cidade', 'Prefeitura promete asfalto novo na Beira-Mar', 'Trânsito: lentidão na avenida do porto no fim da tarde');
        return out;
    },
    // Para a TV e o rádio: as suas (quentes primeiro) misturadas com as da cidade.
    reel(n = 6) {
        const mine = this.items.filter((it) => this._age(it) < 72).slice(-4).reverse().map((it) => it.text);
        const city = this.city().sort(() => Math.random() - 0.5);
        const out = [];
        while (out.length < n && (mine.length || city.length)) { if (mine.length && (out.length % 2 === 0 || !city.length)) out.push(mine.shift()); else out.push(city.shift()); }
        return out;
    },
    // O que alguém comenta no bar / na rua: a notícia quente do bairro, ou conversa fiada.
    chatter(district = null) {
        const hot = this.items.filter((it) => it.mine && this._age(it) < 60 && (!district || !it.district || it.district === district));
        if (hot.length && Math.random() < 0.55) {
            const it = this._pick(hot);
            return this._pick([`Viu no jornal? ${it.text}…`, `Tá sabendo? ${it.text}.`, `Dizem por aí: ${it.text.charAt(0).toLowerCase() + it.text.slice(1)}.`, `Meu Deus… ${it.text}.`]);
        }
        return this.smallTalk();
    },
    smallTalk() {
        const g = window.game, h = g && g.dayNight ? g.dayNight.hour : 12, W = typeof Weather !== 'undefined' && Weather.cur;
        const a = ['E o Rio Seco, hein? Esse técnico tem que sair.', 'Tá tudo caro, rapaz. Até o pãozinho subiu.', 'Minha sogra vem passar o fim de semana…', 'Viu o capítulo da novela ontem?', 'Esse calor tá de matar.', 'Meu chefe me fez ficar até tarde de novo.', 'Bora marcar uma pelada no domingo?', 'A gasolina tá pela hora da morte.', 'Fiz uma fezinha no bicho, deu cabra!', 'Tô devendo até a alma no cartão.'];
        if (W && W.raining) a.push('Que chuva, hein? Molhei até a alma.', 'Com essa chuva a avenida alaga de novo.');
        if (h >= 18 || h < 4) a.push('Hoje é dia de cerveja gelada!', 'Mais uma rodada aí, chefe!', 'Amanhã eu acordo cedo… mais uma só.');
        if (h < 10) a.push('Um pingado e um pão na chapa, por favor.', 'Bom dia! Que preguiça…');
        return this._pick(a);
    },

    // ------------------------------------------------------------------ TV do bar (letreiro)
    tvOn(shop) {
        if (!shop || !this.TV_STYLES.includes(shop.style)) return;
        this.tick();
        if (!this.tv) {
            const st = document.createElement('style');
            st.textContent = `
                #newsTV { position: fixed; left: 16px; top: 16px; width: min(440px, 56vw); display: none; z-index: 30; pointer-events: none;
                    border-radius: 10px; overflow: hidden; box-shadow: 0 6px 24px rgba(0,0,0,0.5); font-family: var(--font); }
                #newsTV .hd { display: flex; align-items: center; gap: 8px; padding: 4px 10px; background: linear-gradient(90deg, #b91c1c, #7f1d1d); color: #fff; font: 800 12px var(--font-d); letter-spacing: 0.08em; }
                #newsTV .hd i { width: 8px; height: 8px; border-radius: 50%; background: #fff; animation: tvblink 1s infinite; }
                #newsTV .hd span { margin-left: auto; font: 600 11px var(--font); opacity: 0.85; letter-spacing: 0; }
                #newsTV .bd { position: relative; height: 30px; background: rgba(8,10,16,0.92); color: #f8fafc; font: 600 14px var(--font); white-space: nowrap; overflow: hidden; }
                #newsTV .bd b { position: absolute; top: 6px; left: 100%; will-change: transform; }
                @keyframes tvblink { 50% { opacity: 0.25; } }
                @media (max-height: 560px) { #newsTV { top: 8px; left: 8px; } #newsTV .bd { font-size: 12px; height: 24px; } #newsTV .bd b { top: 4px; } }`;
            document.head.appendChild(st);
            const el = this.tv = document.createElement('div'); el.id = 'newsTV';
            el.innerHTML = '<div class="hd"><i></i>RS NOTÍCIAS · AO VIVO<span id="newsTVclock"></span></div><div class="bd"><b id="newsTVtx"></b></div>';
            document.body.appendChild(el);
        }
        this.tv.style.display = 'block';
        this._reel = this.reel(8); this._ri = 0; this._x = null; this._tvShop = shop;
        this._nextItem();
    },
    tvOff() { if (this.tv) this.tv.style.display = 'none'; this._tvShop = null; },
    _nextItem() {
        const tx = document.getElementById('newsTVtx'); if (!tx) return;
        if (!this._reel || !this._reel.length) this._reel = this.reel(8);
        tx.textContent = '▸ ' + this._reel[this._ri++ % this._reel.length];
        this._x = null;
    },
    // Por quadro dentro da loja (Interiors.update): o letreiro anda.
    tvUpdate(dt) {
        if (!this._tvShop || !this.tv) return;
        const tx = document.getElementById('newsTVtx'), box = tx && tx.parentElement; if (!tx) return;
        const W = box.clientWidth, w = tx.offsetWidth;
        if (this._x == null) this._x = 0;
        this._x += dt * 90;
        tx.style.transform = `translateX(${-this._x}px)`;
        if (this._x > W + w + 40) this._nextItem();
        const c = document.getElementById('newsTVclock'), g = window.game; if (c && g && g.dayNight) c.textContent = g.dayNight.label;
    },

    // ------------------------------------------------------------------ rádio do carro (boletim)
    radioUpdate(dt, g) {
        const driving = g.mode === 'car' && g.activeCar && !g.activeCar.isBike && !g.activeCar.isBoat;
        if (!driving) { this._radioT = Math.min(this._radioT == null ? 20 : this._radioT, 20); return; }
        this._radioT = (this._radioT == null ? 25 : this._radioT) - dt;
        if (this._radioT > 0) return;
        this._radioT = 55 + Math.random() * 45;
        this.tick();
        const mine = this.items.filter((it) => it.mine && this._age(it) < 48 && !it.aired);
        let text;
        if (mine.length && Math.random() < 0.7) { const it = mine[mine.length - 1]; it.aired = true; text = it.text; }
        else text = this._pick(this.city());
        this._radio(text);
    },
    _radio(text) {
        if (!this.radioEl) {
            const st = document.createElement('style');
            st.textContent = `#newsRadio { position: fixed; left: 16px; bottom: 190px; max-width: min(380px, 70vw); padding: 9px 13px 10px; border-radius: 14px; z-index: 30; pointer-events: none;
                background: var(--glass-2); border: 1px solid var(--line-2); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); color: var(--tx); font: 500 13px var(--font);
                transition: opacity .4s, transform .4s; opacity: 0; transform: translateY(8px); box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
                #newsRadio.on { opacity: 1; transform: none; } #newsRadio b { display: block; font: 800 11px var(--font-d); letter-spacing: 0.08em; color: #fbbf24; margin-bottom: 3px; }`;
            document.head.appendChild(st);
            this.radioEl = document.createElement('div'); this.radioEl.id = 'newsRadio'; document.body.appendChild(this.radioEl);
        }
        this.radioEl.innerHTML = `<b>📻 RÁDIO CIDADE 98,1 · PLANTÃO</b>${text.replace(/[<>&]/g, '')}`;
        this.radioEl.classList.add('on');
        if (typeof AudioFX !== 'undefined') { AudioFX.blip(660, 0.08, 0.06); setTimeout(() => AudioFX.blip(880, 0.08, 0.06), 110); }
        clearTimeout(this._rt); this._rt = setTimeout(() => this.radioEl.classList.remove('on'), 8000);
    },
};
