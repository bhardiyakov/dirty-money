// ============================================================================
// PlayerLook — o VISUAL do jogador 2,5D: a ficha do gerador (src/art/npcgen) montada a partir da aparência e da roupa (Outfit) e da
// bolsa (Bags).
//
//   • COR (camiseta azul em vez de laranja, tênis vermelho, boné preto…): só a linha 0 da paleta muda — na hora, em todas as animações.
//   • FORMA (boné, regata, bermuda, chinelo, mochila, cabelo…): o desenho muda, então o atlas do jogador é GERADO DE NOVO num Worker
//     (o mesmo gerador dos NPCs): primeiro parado/andando/correndo (~2 s), depois todo o resto. Enquanto isso o jogador segue com o
//     visual anterior. Cada visual gerado fica guardado (memória e IndexedDB): voltar a ele é imediato.
//   • O visual de sempre (a roupa inicial) vem pronto: assets/npcs/protagonista.js (+ protagonista_tatico.js, o atlas COMPANHEIRO com os
//     clipes táticos — agachar, andar agachado, passo lateral, rolar —, que não cabem no principal em alta definição). Cada visual
//     gerado também ganha o seu companheiro ("hero:N:t"); a folha do jogador procura nele o que o principal não tem (extraAtlas).
//   • As ARMAS NOVAS (pistola com silenciador, RPG, lança-foguetes, minigun) moram num terceiro atlas (protagonista_armas.js; armsAtlas
//     da folha). Num visual gerado ele só é gerado quando o jogador tem uma delas ("hero:N:w", guardado como os outros); enquanto isso,
//     o desenho delas sai do visual de sempre.
//   • preview(ficha) = o boneco em todas as direções do clipe parado (16; perfil leve, 8 — tela de equipamento), num segundo Worker.
//   • Os atlas gerados saem PAGINADOS (NpcArt.paged: páginas por grupo de clipes e paridade de direção) e, no perfil leve
//     (Config.art.npcDirs = 8), só com as 8 direções pares. No aparelho (IndexedDB) cada página vai comprimida.
// ============================================================================

const PlayerLook = {
    game: null,
    shown: null,            // chave de forma do atlas em uso
    want: null,             // chave de forma pedida (gerando)
    ids: new Map(),         // chave de forma → id do atlas registrado no NpcArt
    tacIds: new Map(),      // chave de forma → id do atlas companheiro (clipes táticos) desse visual
    armsIds: new Map(),     // chave de forma (sem o dano) → id do atlas das armas novas desse visual
    _clean: new Map(),      // chave de forma → a mesma sem o dano pintado (as armas novas não têm versão machucada)
    _job: 0,
    VERSION: 17,             // mude quando o gerador mudar o desenho (invalida o cache do IndexedDB) — 2: adulto, pilotando; 3: sombreado contínuo; 4: atlas HD até 4096 de lado; 5: passada longa; 6: subida (walk_up, climb); 7: corpo da malha 3D; 8: sentar no carro (sitin); 9: começar/parar de nadar e mergulho; 10: sair do carro (sitout) e faca; 11: fardo correndo e parado (run_heavy, idle_heavy); 12: nado peito, vadear fundo, mergulho suave; 13: granada e molotov; 14: braços soltos, cabeça maior, silhueta feminina, luz mais marcada; 15: visual 3D (sem contorno preto, borda suavizada, sombra macia); 16: 16 direções, mais quadros, atlas paginado (páginas comprimidas); 17: levantar da água (swim_stand)

    attach(game) {
        this.game = game; this.shown = null; this._t0 = performance.now();       // (_calm: o tempo de jogo)
        if (!this._gpaceT) this._gpaceT = setInterval(() => this._gpace(), 2000);  // (desde já: o ritmo SEM gerar é a referência)
        const a = game.player && game.player.actor;
        if (a) a.onCond = () => this.sync();                                // estado de dano mudou: o visual pintado (ficha.dmg)
        this.sync(true);
    },

    get G() { return NpcArt.gen(); },
    get ok() { return typeof NpcArt !== 'undefined' && !!(this.game && this.game.sprites && this.game.sprites.npc); },

    // Bolsa nas costas (Bags.look → peça do gerador) e bolsa da mão.
    BAG: { cross: 'cross', pack: 'backpack', tactical: 'tactical' },
    BAG_COLOR: { cross: 'roupa_preta', pack: 'mochila', tactical: 'oliva' },

    // Ficha completa do jogador (aparência + roupa + bolsa). over = { worn, bag, appearance, tint } para a prévia do "e se eu trocar?".
    spec(over = {}) {
        const G = this.G, s = Object.assign({}, G.PLAYER_DEFAULT, Outfit.lookSpec(over.worn, over.appearance, over.tint));
        const inv = this.game && this.game.inventory, bagId = over.bag !== undefined ? over.bag : (inv && inv.bag) || 'none';
        const D = (typeof Bags !== 'undefined' && Bags.DEFS[bagId]) || {};
        s.bag = D.look ? this.BAG[D.look] || null : null;
        if (D.look) { s.bag_color = (Outfit.tint && Outfit.tint.bag) || this.BAG_COLOR[D.look]; s.cargo_color = D.look === 'tactical' ? 'tatico' : 'alca'; }
        s.hand = D.hand || null;
        // estado de dano (Blood.cond): pintado na roupa e na pele — a prévia do equipamento (over) mostra limpo
        const pa = this.game && this.game.player && this.game.player.actor;
        const dmg = over.dmg !== undefined ? over.dmg : (pa && pa.wounds ? pa.wounds.cond : 0);
        if (dmg) s.dmg = dmg;                                                 // (sem dano, a chave fica igual à do visual pronto)
        if (s.hand) s.cargo_color = s.hand === 'briefcase' ? 'cromo' : s.hand === 'suitcase' ? 'roupa_preta' : 'verde';
        return s;
    },

    // Clipes do jogador para uma ficha (os de carregar só com bolsa na mão).
    clipsFor(s) {
        const G = this.G, out = G.PLAYER_CLIPS.concat(G.PLAYER_HEAVY);
        if (s.hand) out.push(...G.PLAYER_HAND);
        if (s.hand === 'suitcase') out.push(...G.PLAYER_PULL);
        return out;
    },

    // Aplica o visual: cores já; forma (se mudou) → atlas pronto, guardado ou gerado.
    sync(force = false) {
        if (!this.ok) return;
        const s = this.spec(), key = this.G.shapeKey(s);
        NpcArt.setPlayerColors(s);
        if (!this._clean.has(key)) this._clean.set(key, s.dmg ? this.G.shapeKey(this._noDmg(s)) : key);
        this.wantArms();
        if (!force && key === this.shown && this.want && this.want !== key) {   // voltou ao visual que já está na tela (ex.: curou antes de o
            this.want = null; this._job++; this._gpump();                      // machucado ficar pronto): cancela a geração e tira a parcial
            const id = key === this.G.shapeKey(this.G.PLAYER_DEFAULT) && NpcArt.atlases.protagonista ? 'protagonista' : this.ids.get(key);
            if (id) this._use(key, id);
            this._ready(s);
            return;
        }
        if (!force && (key === this.shown || key === this.want)) return;
        this.want = key;
        if (this._preFor && this._preFor !== this._clean.get(key)) {          // roupa nova: as machucadas de antemão da antiga não servem
            this._preJob = (this._preJob || 0) + 1; this._preFor = null; clearTimeout(this._preT);      // mais (sai da fila; machucou: continua)
        }
        this._job++; this._gpump();                                          // (cancela a geração em andamento: o visual pedido mudou — ex.: curou)
        if (key === this.G.shapeKey(this.G.PLAYER_DEFAULT) && NpcArt.atlases.protagonista) { this._use(key, 'protagonista'); this._ready(s); return; }
        if (this.ids.has(key)) { this._use(key, this.ids.get(key)); this._ready(s); return; }
        this._load(s, key);
    },
    // Visual completo em uso: sem a parcial de uma geração cancelada e, se ele está limpo, as versões machucadas desta roupa já vão
    // sendo preparadas em segundo plano (um tiro mostra o dano na hora, sem esperar gerar).
    _ready(s) {
        if (this._partialId) { NpcArt.dropAtlas(this._partialId); this._partialId = null; }
        if (s.dmg) return;
        clearTimeout(this._preT);
        if (!NpcArt.canZip) return;                                          // (sem compressão o aparelho guarda cru, ~4× maior: só o que foi usado — _idbPut)
        this._preT = setTimeout(() => this._prefetch(s), 3000);
    },

    // Troca o atlas da folha do jogador e reinicia o clipe atual (com o desenho novo).
    _use(key, id, partial = false) {
        const hero = this.game.sprites.sheets.hero, a = this.game.player && this.game.player.actor;
        hero.extraAtlas = this.tacIds.get(key) || (partial && this.tacIds.get(this.shown)) || 'protagonista_tatico';      // (gerando: o tático do visual anterior)
        hero.setAtlas(id);
        hero.fallbackAtlas = partial ? (this.ids.get(this.shown) || 'protagonista') : 'protagonista';
        hero.armsAtlas = this.armsIds.get(this._clean.get(key) || key) || (NpcArt.atlases.protagonista_armas ? 'protagonista_armas' : null);
        if (!partial) { this.shown = key; if (this.want === key) this.want = null; }
        if (a && a.sheet === hero && a.clip) a.replay();                   // (o mesmo clipe no atlas novo, na mesma fase: o número de quadros pode mudar)
    },

    async _load(s, key) {
        const job = ++this._job;
        const cached = await this._idbGet(this._ck(key)), cachedT = cached && await this._idbGet(this._ck(key) + '|t');
        if (job !== this._job) return;
        if (cached && cachedT) { this._registerTac(key, cachedT); this._register(key, cached, false); this._ready(s); return; }       // (sem o companheiro: gera tudo de novo)
        this._build(s, key, job);
    },
    _ck(key) { return `v${this.VERSION}.${this.k()}.${this.dirs() || 'n'}|${key}`; },
    // Direções dos atlas gerados: 8 no perfil leve (só as pares); senão as do gerador (0 = sem forçar).
    dirs() { return typeof NpcArt !== 'undefined' && NpcArt.lite ? 8 : 0; },

    // Atlas gerado → NpcArt (textura + material) e em uso. partial = só os primeiros clipes (o resto vem do atlas anterior).
    _register(key, atlas, partial) {
        const id = 'hero:' + (this._seq = (this._seq || 0) + 1);
        NpcArt.addAtlas(id, atlas);
        const old = this.ids.get(key);
        if (!partial) this.ids.set(key, id);
        this._use(key, id, partial);
        if (old && old !== id) NpcArt.dropAtlas(old);
        if (this._partialId && this._partialId !== id) { NpcArt.dropAtlas(this._partialId); this._partialId = null; }
        if (partial) this._partialId = id;
        // guarda só os visuais mais recentes na memória de vídeo (16 direções: ~60–80 MB cada; os outros voltam do IndexedDB)
        while (this.ids.size > (NpcArt.lite ? 2 : 3)) {
            const [k, v] = this.ids.entries().next().value;
            if (k === this.shown) break;
            this.ids.delete(k); NpcArt.dropAtlas(v);
            const t = this.tacIds.get(k); if (t) { this.tacIds.delete(k); NpcArt.dropAtlas(t); }
        }
    },
    // Atlas companheiro (clipes táticos) do visual `key`: registrado antes do principal (o _use já o encontra).
    _registerTac(key, atlas) {
        const id = 'hero:' + (this._seq = (this._seq || 0) + 1) + ':t', old = this.tacIds.get(key);
        NpcArt.addAtlas(id, atlas);
        this.tacIds.set(key, id);
        if (old && old !== id) NpcArt.dropAtlas(old);
    },

    // Gera o atlas no orçamento de geração (gen: poucos Workers, com folga): primeiro parado/andando/correndo (o visual troca assim que
    // eles ficam prontos); depois o resto. Os Workers devolvem os quadros já recortados; o empacotamento (rápido) é feito aqui.
    // Fila de clipes (2 por vez), na ordem do que mais aparece: parado/andando/correndo (com a arma da
    // mão), depois golpes, carro, tático, nadar, pilotar… e o resto. O visual novo entra assim que o 1º bloco fica pronto e vai sendo
    // completado (a cada ~1,5 s) — o que ainda falta sai do visual anterior por pouco tempo. Pronto: guardado no aparelho.
    _COMMON: /^(punch|punchL|kick|enter|sitin|opendoor|carjack|vault|crouch|sneak|roll|strafe|swim|swim_idle|swim_breast|wade|wade_idle|hurt|draw|aim|shoot|walk_up|climb|ride_moto|ride_bike|surrender|pick)$/,
    _build(s, key, job) {
        const G = this.G, all = this.clipsFor(s).concat(G.PLAYER_TAC), pl = this.game.player, w = pl ? pl.look : 'none', k = this.k();
        const tac = new Set(G.PLAYER_TAC), idx = new Map(all.map((c, i) => [c, i]));
        const pri = (c) => {
            const [n, wp] = c.split(':');
            if (G.PLAYER_FIRST.includes(c) || (wp === w && /^(idle|walk|run)$/.test(n)) || (s.hand && G.PLAYER_HAND.slice(0, 3).includes(c))) return 0;
            if (wp === w || (this._COMMON.test(n) && (wp === 'none' || tac.has(c)))) return 1;
            return this._COMMON.test(n) ? 2 : 3;
        };
        const order = all.slice().sort((a, b) => pri(a) - pri(b) || idx.get(a) - idx.get(b));
        // os de prioridade 0, um por Worker (em paralelo); o visual só troca quando TODOS eles estão prontos
        const first = order.filter((c) => pri(c) === 0), chunks = first.map((c) => [c]);
        const rest = order.filter((c) => pri(c) !== 0);
        for (let i = 0; i < rest.length; i += 2) chunks.push(rest.slice(i, i + 2));
        const got = [], live = () => job === this._job;
        let left = chunks.length, firstLeft = first.length, lastPub = 0, pubMs = 0, timer = null;
        const pack = () => {
            const sorted = got.slice().sort((p, q) => idx.get(p.key) - idx.get(q.key));
            return [this._pack(sorted.filter((c) => tac.has(c.key)), k), this._pack(sorted.filter((c) => !tac.has(c.key)), k)];      // companheiro + principal
        };
        const publish = () => {
            timer = null;
            if (job !== this._job) return;
            lastPub = this._gpubT = performance.now();                         // (_gpace: janela com publish não vale de referência)
            const [t, a] = pack();
            if (left > 0) {                                                    // parcial: o que falta vem do visual anterior
                if (Object.keys(t.clips).length === tac.size) this._registerTac(key, t);       // (companheiro só completo: o que falta dele não tem para onde cair)
                this._register(key, a, true);
                pubMs = performance.now() - lastPub;                           // (empacotar + subir as páginas: o intervalo cresce com o custo)
                return;
            }
            this._registerTac(key, t);
            this._register(key, a, false);
            this._idbPut(this._ck(key), a);
            this._idbPut(this._ck(key) + '|t', t);
            this._ready(s);                                                     // (limpo: as versões machucadas, em segundo plano)
        };
        const done = (m) => {
            if (job !== this._job) return;
            got.push(...m.clips);
            left--;
            for (const c of m.clips) if (first.includes(c.key)) firstLeft--;
            if (!left) { if (timer) clearTimeout(timer); publish(); return; }
            if (firstLeft > 0) return;
            const wait = Math.max(1500, pubMs * 25) - (performance.now() - lastPub);      // (no máximo ~4% da thread principal)
            if (wait <= 0 || !lastPub) publish(); else if (!timer) timer = setTimeout(publish, wait);
        };
        // no orçamento de geração (gen): os 1ºs clipes na frente (PRI.first), o resto atrás deles; um visual novo cancela este (live)
        for (const keys of chunks) {
            const pri = first.includes(keys[0]) ? this.PRI.first : this.PRI.look;
            this.gen(pri, { type: 'clips', spec: s, keys, k, dirs: this.dirs() }, live).then((m) => {
                if (!m || !live()) return;
                if (m.error) { console.warn('[VISUAL] falhou:', m.error); this.want = null; this._job++; this._gpump(); return; }
                done(m);
            });
        }
    },
    // Gera e guarda no aparelho (sem trocar o visual) as versões MACHUCADAS (dmg 2, 1, 3) do visual `s`, devagar e só com o jogo folgado
    // (_calm: depois de Config.art.genPreDelay s de jogo, ritmo bom, nenhum visual sendo gerado): um nível por vez, num pedido só (o
    // Worker desenha e empacota), na prioridade mais baixa e solo — qualquer outro desenho para este, que continua depois de onde parou.
    // Quando ele se machucar, o desenho já está pronto (senão é gerado na hora, como uma roupa nova). Recomeça se o visual mudar.
    async _prefetch(s) {
        const G = this.G, k = this.k(), forKey = G.shapeKey(s);
        if (this._preFor === forKey) return;                                  // (já preparando esta roupa)
        const job = this._preJob = (this._preJob || 0) + 1, live = () => job === this._preJob;
        this._preFor = forKey;
        const end = () => { if (job === this._preJob) this._preFor = null; };
        for (const lv of [2, 1, 3]) {
            const sp = Object.assign({}, s, { dmg: lv }), key = G.shapeKey(sp);
            if (!live()) return end();
            if (await this._idbHas(this._ck(key) + '|t')) continue;
            if (!(await this._calmWait(live))) return end();
            const m = await this.gen(this.PRI.pre, { type: 'look', spec: sp, keys: this.clipsFor(sp).concat(G.PLAYER_TAC), tac: G.PLAYER_TAC, k, dirs: this.dirs() }, live, true);
            if (!m || !live()) return end();
            if (m.error) { console.warn('[VISUAL] machucado falhou:', m.error); return end(); }
            await this._idbPut(this._ck(key) + '|t', this._paged(m.atlases[0], k));
            await this._idbPut(this._ck(key), this._paged(m.atlases[1], k));
        }
        end();
    },
    // ---------------------------------------------------------------- atlas das armas novas do visual gerado (só quando é preciso)
    // Pede quando o jogador TEM uma das armas novas (comprou, achou) e o visual não é o de sempre. Num Worker à parte (não atrapalha a
    // geração da roupa); a arma que está na mão primeiro.
    _noDmg(s) { const o = Object.assign({}, s); delete o.dmg; return o; },     // (a ficha limpa: a chave igual à do visual sem machucado)
    ownsArms() {
        const inv = this.game && this.game.inventory, G = this.G;
        return !!inv && G.ARMS_LOOKS.some((w) => inv.owned(w));
    },
    wantArms() {
        if (!this.ok || !this.ownsArms()) return;
        if (this.want) { clearTimeout(this._armsT); this._armsT = setTimeout(() => this.wantArms(), 2000); return; }      // (a roupa nova primeiro)
        const s = this._noDmg(this.spec()), key = this.G.shapeKey(s);
        if (key === this.G.shapeKey(this.G.PLAYER_DEFAULT) || this.armsIds.has(key) || this._armsFor === key) return;
        this._armsFor = key;
        this._buildArms(s, key);
    },
    async _buildArms(s, key) {
        const job = this._armsJob = (this._armsJob || 0) + 1, G = this.G, k = this.k(), ck = this._ck(key) + '|w';
        const fin = (a) => {
            if (job !== this._armsJob) return;
            this._armsFor = null;
            const id = 'hero:' + (this._seq = (this._seq || 0) + 1) + ':w', old = this.armsIds.get(key);
            NpcArt.addAtlas(id, a);
            this.armsIds.set(key, id);
            if (old && old !== id) NpcArt.dropAtlas(old);
            while (this.armsIds.size > (NpcArt.lite ? 1 : 2)) { const [k0, v0] = this.armsIds.entries().next().value; this.armsIds.delete(k0); NpcArt.dropAtlas(v0); }
            if (this.shown) this._use(this.shown, this.ids.get(this.shown) || 'protagonista');
        };
        const cached = await this._idbGet(ck);
        if (job !== this._armsJob) return;
        if (cached) { fin(cached); return; }
        const pl = this.game.player, w = pl ? pl.look : 'none', all = G.PLAYER_ARMS, idx = new Map(all.map((c, i) => [c, i]));
        const order = all.slice().sort((a, b) => (b.endsWith(':' + w) - a.endsWith(':' + w)) || idx.get(a) - idx.get(b));
        const chunks = [];
        for (let i = 0; i < order.length; i += 3) chunks.push(order.slice(i, i + 3));
        const got = [], live = () => job === this._armsJob;
        let left = chunks.length;
        for (const keys of chunks) {
            this.gen(this.PRI.arms, { type: 'clips', spec: s, keys, k, dirs: this.dirs() }, live).then((m) => {
                if (!m || !live()) return;
                if (m.error) { console.warn('[VISUAL] armas falharam:', m.error); this._armsFor = null; this._armsJob++; this._gpump(); return; }
                got.push(...m.clips);
                if (--left === 0) {
                    const a = this._pack(got.sort((p, q) => idx.get(p.key) - idx.get(q.key)), k);
                    this._idbPut(ck, a);
                    fin(a);
                }
            });
        }
    },
    // Empacota os quadros recortados (vindos dos Workers) no atlas PAGINADO (G.packPages; o empacotador antigo, uma página só, se o
    // gerador ainda não tiver o novo).
    _pack(clips, k) { return this._paged(this.G.packPages ? this.G.packPages(clips) : this.G.packAtlas(clips), k); },
    _paged(a, k) {
        const G = this.G;
        return NpcArt.paged(a.pages ? { k, v: 2, frame: G.frameFor(k), clips: a.clips, pages: a.pages } : { w: a.w, h: a.h, data: a.data, clips: a.clips, k, v: 2, frame: G.frameFor(k) }, k, G.frameFor(k));
    },
    // Resolução do visual: a dos atlas prontos, ou o dobro com a alta definição ligada (NpcArt.hdOn).
    k() { return typeof NpcArt !== 'undefined' && NpcArt.hdOn() ? this.G.HD_K : this.G.OUT_K; },

    // O boneco em todas as direções do clipe parado (as do atlas do jogador: 16; perfil leve, 8), para a tela de equipamento:
    // cb(frames RGBA[D], W, H, k) — frames[d] = direção d (0 = de costas, sentido horário).
    preview(s, cb) {
        const job = this._pj = (this._pj || 0) + 1, wk = this._worker('preview');
        wk.onmessage = (e) => { wk._busy = false; if (e.data.job === this._pj && !e.data.error) cb(e.data.frames, e.data.W, e.data.H, e.data.k); };
        wk.postMessage({ type: 'preview', job, spec: s, k: this.k(), dirs: this.previewDirs() });
        return job;
    },
    previewDirs() {
        const A = typeof NpcArt !== 'undefined' && NpcArt.atlases.protagonista, c = A && A.data.clips['idle:none'];
        return Math.min(typeof NpcArt !== 'undefined' ? NpcArt.dirs : 16, (c && c.dirs) || 8);
    },

    // ------------------------------------------------------------------ ORÇAMENTO DE GERAÇÃO (todos os atlas desenhados no jogo)
    // Os pedidos de desenho — o visual do jogador (os 1ºs clipes primeiro), as armas novas, o machucado dos NPCs (NpcArt._dmgPump) e
    // as versões machucadas preparadas de antemão — entram numa fila só, por prioridade (PRI), e rodam em no máximo genMax() Workers
    // ao mesmo tempo (os núcleos menos 2, de 1 a 3; perfil leve, até 2). Cada Worker desenha com FOLGA (duty: a fração de um
    // núcleo — _gpace a ajusta pelo ritmo do jogo) e para com a aba oculta: antes, até 11 Workers a 100% tomavam todos os núcleos por
    // minutos e o jogo engasgava. Regras da fila:
    //   • os 1ºs clipes de um visual novo (PRI.first, o jogador esperando) interrompem o que estiver rodando se não houver Worker
    //     livre — o interrompido volta à fila e continua de onde parou (os clipes prontos ficam no Worker);
    //   • quem espera há mais de 60 s passa na frente do resto (o machucado de um NPC não fica minutos atrás do resto do visual);
    //   • solo (as versões machucadas de antemão) só roda sem nada mais urgente na fila ou rodando (senão para e espera).
    PRI: { first: 0, look: 1, arms: 2, npc: 3, pre: 4 },
    _gq: [], _gs: [], _gn: 0,
    genMax() {
        const n = Config.art.genWorkers;
        if (n) return n;
        const lite = typeof NpcArt !== 'undefined' && NpcArt.lite;               // (núcleos − 2: o jogo, a GPU/compositor; o duty segura o resto)
        return Math.max(1, Math.min(lite ? 2 : 3, (navigator.hardwareConcurrency || 2) - 2));
    },
    genDuty(pri) {
        const A = Config.art;
        if (pri === this.PRI.first) return A.genDutyFirst || 1;
        return this._duty || A.genDuty || 0.5;
    },
    // Pede um desenho: msg = { type: 'clips' | 'look' | 'atlas', … } (ver _worker); live() = ainda é preciso (senão sai da fila ou é
    // interrompido). → a resposta do Worker ({ clips } | { atlases } | { atlas } | { error }) ou null (desistiu).
    gen(pri, msg, live = () => true, solo = false) {
        return new Promise((done) => {
            this._gq.push({ id: ++this._gn, at: performance.now(), pri, msg, live, solo, done, sig: JSON.stringify([msg.type, msg.spec, msg.id, msg.dmg, msg.k, msg.dirs]) });
            this._gpump();
        });
    },
    _gpump() {
        const q = this._gq, S = this._gs, now = performance.now();
        const stop = (x, again) => { x.t.stop = true; x.t.again = again; x.w.postMessage({ type: 'cancel', job: x.t.id }); };
        for (let i = q.length - 1; i >= 0; i--) if (!q[i].live()) q.splice(i, 1)[0].done(null);
        q.sort((a, b) => a.pri - b.pri || a.id - b.id);
        const top = Math.min(q.length ? q[0].pri : 9, ...S.map((x) => (x.t && !x.t.solo ? x.t.pri : 9)));
        for (const x of S) if (x.t && !x.t.stop && (!x.t.live() || (x.t.solo && top < x.t.pri))) stop(x, x.t.live());
        while (q.length) {
            let i = 0;
            if (q[0].pri > this.PRI.first) { const j = q.findIndex((t) => !t.solo && t.pri > q[0].pri && now - t.at > 60000); if (j > 0) i = j; }    // (esperou demais)
            const t = q[i];
            if (t.solo && S.some((x) => x.t && x.t.pri < t.pri)) break;
            let x = S.find((y) => !y.t && y.sig === t.sig) || S.find((y) => !y.t);      // (o mesmo pedido/ficha: o Worker já tem o boneco assado)
            if (!x && S.length < this.genMax()) x = this._gslot();
            if (!x) {                                                                // sem Worker livre: só o jogador esperando interrompe alguém
                if (t.pri !== this.PRI.first || S.some((y) => y.t.stop)) break;      // (um já está parando)
                let v = null;
                for (const y of S) if (y.t.pri > t.pri && (!v || y.t.pri > v.t.pri)) v = y;
                if (v) stop(v, true);
                break;
            }
            q.splice(i, 1);
            if (this._probe && t.pri === this.PRI.first) this._gprobeEnd();      // (o jogador esperando: a sonda acaba já)
            x.t = t; x.sig = t.sig; this._gbusy = true;
            x.w.postMessage(Object.assign({ duty: this.genDuty(t.pri) }, t.msg, { job: t.id }));
        }
    },
    _gslot() {
        const x = { w: this._worker('gen' + this._gs.length), t: null, sig: '' };
        x.w._busy = false;
        x.w.onmessage = (e) => this._gdone(x, e.data);
        x.w.onerror = (e) => { e.preventDefault && e.preventDefault(); this._gdone(x, { job: x.t && x.t.id, error: String(e.message || e) }); };
        if (!this._gvis && typeof document !== 'undefined') {                    // aba oculta: os Workers param (voltam quando ela aparece)
            this._gvis = true;
            document.addEventListener('visibilitychange', () => { for (const y of this._gs) y.w.postMessage({ type: 'pace', hidden: document.hidden }); });
        }
        if (typeof document !== 'undefined' && document.hidden) x.w.postMessage({ type: 'pace', hidden: true });
        this._gs.push(x);
        return x;
    },
    _gdone(x, m) {
        const t = x.t;
        if (!t || m.job !== t.id) return;
        x.t = null;
        if (m.cancelled && t.again && t.live()) { t.stop = t.again = false; this._gq.push(t); }      // (interrompido: volta à fila)
        else t.done(m.cancelled ? null : m);
        this._gpump();
    },
    // RITMO do jogo (a cada 2 s): quadros por segundo de fato (Perf._pk conta os quadros; um engasgo entre quadros também conta) e o
    // p95 do trabalho por quadro (Perf.p95), comparados com os do PRÓPRIO aparelho sem gerar nada (_ref) — não com o teto: um aparelho
    // que não chega ao teto nem parado (GPU fraca) deixava o duty preso no mínimo e o visual completo levava mais de 10 min.
    //   • _ref: média das janelas sem nenhum Worker desenhando; gerando direto, a cada ~45 s os Workers param duas janelas (sonda:
    //     uma para assentar, outra mede) para medi-la de novo (o jogo muda: um lugar mais pesado) — nunca com os 1ºs clipes de um
    //     visual na fila (o jogador esperando);
    //   • gerando: FPS < 78% da referência (88% sem o visual do jogador na vez) ou p95 bem acima dela → duty × 0,7 (até
    //     genDutyMin); FPS ≥ 86% (94%) e p95 perto, ou o teto seguro → duty +0,1 (até genDutyMax); janela com publish não é referência;
    //   • _calmOk (as versões machucadas de antemão): FPS perto do teto de fato e sem engasgos (aparelho folgado de verdade).
    _gpace() {
        if (typeof Perf === 'undefined' || (typeof document !== 'undefined' && document.hidden)) { this._pkT = 0; this._probe = 0; return; }
        const A = Config.art, now = performance.now(), n = Perf._pk || 0, cap = Config.perf.fpsCap || 30, p95 = Perf.p95 || 0;
        const busy = this._gs.some((x) => x.t), first = this._gs.some((x) => x.t && x.t.pri === this.PRI.first) || this._gq.some((t) => t.pri === this.PRI.first);
        const pace = (m) => { for (const x of this._gs) if ('hidden' in m || (x.t && x.t.pri !== this.PRI.first)) x.w.postMessage(Object.assign({ type: 'pace' }, m)); };
        if (this._pkT && now - this._pkT < 6000) {
            const fps = ((n - this._pkN) * 1000) / (now - this._pkT), r = this._ref;
            this._calmOk = fps >= cap * 0.9 && p95 < Perf.budgetMs;
            if (this._probe === 2 || (!this._gbusy && !busy)) {                 // janela sem gerar: a referência
                if (!(this._gpubT > this._pkT)) this._ref = r ? { fps: r.fps * 0.7 + fps * 0.3, p95: r.p95 * 0.7 + p95 * 0.3 } : { fps, p95 };
                this._refT = now;
            } else if (r && !this._probe) {
                // o visual do jogador (ele está esperando) aceita perder até ~20% do FPS; o resto (machucados), ~10%
                const look = this._gs.some((x) => x.t && x.t.pri <= this.PRI.look), lo = look ? 0.78 : 0.88, hi = look ? 0.86 : 0.94;
                const d0 = this._duty || A.genDuty || 0.5, top = fps >= cap * 0.95 && p95 < Perf.budgetMs;
                const slow = !top && (fps < r.fps * lo || p95 > r.p95 * 1.5 + 3), ok = top || (fps >= r.fps * hi && p95 <= r.p95 * 1.25 + 2);
                const d = slow ? Math.max(A.genDutyMin || 0.25, d0 * 0.7) : ok ? Math.min(A.genDutyMax || 1, d0 + 0.1) : d0;
                if (Math.abs(d - d0) > 0.01) { this._duty = d; pace({ duty: d }); }
            }
        }
        if (this._probe === 2) this._gprobeEnd();
        else if (this._probe) this._probe = 2;                                   // (1ª janela da sonda: assentar; a 2ª mede)
        else if (busy && !first && (!this._ref || now - (this._refT || 0) > 45000)) { this._probe = 1; pace({ hidden: true }); }
        this._pkT = now; this._pkN = n; this._gbusy = busy;
    },
    _gprobeEnd() { this._probe = 0; for (const x of this._gs) x.w.postMessage({ type: 'pace', hidden: false }); },    // (fim da sonda)
    // Jogo FOLGADO para gerar de antemão: Config.art.genPreDelay s de jogo, aba visível, nenhum visual/armas sendo gerado e o ritmo bom
    // (_gpace: FPS perto do teto, sem engasgos).
    _calm() {
        if ((typeof document !== 'undefined' && document.hidden) || this.want || this._armsFor) return false;
        if (performance.now() - (this._t0 || 0) < (Config.art.genPreDelay || 60) * 1000) return false;
        return !!this._calmOk;
    },
    // Espera o jogo ficar folgado (duas checagens seguidas, a cada 2,5 s). false = desistiu (live() caiu).
    async _calmWait(live) {
        let ok = 0;
        while (live()) {
            if (this._calm()) { if (++ok >= 2) return true; } else ok = 0;
            await new Promise((r) => setTimeout(r, 2500));
        }
        return false;
    },

    // Worker montado a partir do TEXTO das funções do gerador (funciona até em file://). restart = interrompe o que estiver fazendo.
    _workers: {},
    _worker(kind, restart = false) {
        let w = this._workers[kind];
        if (w && restart && w._busy) { w.terminate(); w = null; }
        if (!w) {
            const main = function () {
                const G = {};
                NpcGenCore(G); NpcGenChar(G); NpcGenRender(G); NpcGenAnims(G); NpcGenTypes(G); NpcGenBuild(G); NpcGenMesh(G);
                // FOLGA (PlayerLook.gen): depois de cada quadro desenhado o Worker descansa (1 − duty) ÷ duty × o tempo gasto — duty 0,5 ≈ meio
                // núcleo — e, com a aba oculta, para. Um pedido por vez (fila); 'cancel' interrompe entre um quadro e outro e guarda os clipes
                // já prontos (o mesmo pedido, mandado de novo, continua de onde parou).
                let duty = 1, hidden = false, t0 = 0, chain = Promise.resolve();
                const drop = new Set(), parts = new Map(), STOP = {};
                let wake = null;                                                            // ('cancel'/aba: acorda a folga já — antes, até 3 s)
                const nap = (ms) => new Promise((ok) => { const t = setTimeout(() => { wake = null; ok(); }, ms); wake = () => { clearTimeout(t); wake = null; ok(); }; });
                const rest = async (m) => {
                    const w = performance.now() - t0;
                    if (w < (duty < 1 ? 4 : 100)) return;                                   // (duty 1: só abre a porta para 'cancel'/'pace')
                    await nap(duty < 1 ? Math.min(3000, (w * (1 - duty)) / duty) : 0);
                    while (hidden && !drop.has(m.job)) await nap(250);
                    if (drop.has(m.job)) throw STOP;
                    t0 = performance.now();
                };
                // (perfil leve: só as direções pares — se o gerador não souber renderizar menos, as ímpares saem aqui)
                const fit = (m) => (c) => { if (m.dirs && c.dirs > m.dirs) { const s = c.dirs / m.dirs; c.frames = c.frames.filter((_, d) => d % s === 0); c.dirs = m.dirs; } return c; };
                // os clipes `keys` de um pedido, quadro a quadro com folga; interrompido, os prontos ficam em `parts` (pela assinatura do pedido)
                const clipsOf = async (m, R, keys, typeId, opts) => {
                    const sig = JSON.stringify([m.type, m.spec, m.id, m.dmg, m.k, m.dirs]), have = parts.get(sig) || new Map(), out = [];
                    parts.delete(sig);
                    try {
                        for (const key of keys) {
                            let c = have.get(key);
                            if (!c) {
                                const it = G.clipSteps(R, key, typeId, opts);
                                for (let r = it.next(); ; r = it.next()) { if (r.done) { c = r.value; break; } await rest(m); }
                                have.set(key, c);
                            }
                            out.push(c);
                        }
                    } catch (err) {
                        if (err === STOP) { parts.set(sig, have); while (parts.size > 2) parts.delete(parts.keys().next().value); }
                        throw err;
                    }
                    return out.map(fit(m));
                };
                const bufs = (pages) => [...new Set(pages.map((p) => p.data.buffer))];
                const run = async (m) => {
                    drop.clear();
                    if (m.duty) duty = m.duty;
                    t0 = performance.now();
                    try {
                        if (m.type === 'clips') {
                            const R = G.rendererFor(m.spec, { k: m.k || G.OUT_K });
                            await rest(m);
                            const clips = await clipsOf(m, R, m.keys, null, { hand: m.spec.hand, dirs: m.dirs || undefined }), buf = [];
                            for (const c of clips) for (const row of c.frames) for (const f of row) if (f.data.byteLength) buf.push(f.data.buffer);
                            self.postMessage({ job: m.job, clips }, buf);
                        } else if (m.type === 'look') {                    // um visual inteiro (as versões machucadas de antemão): desenha e empacota aqui
                            const R = G.rendererFor(m.spec, { k: m.k || G.OUT_K });
                            await rest(m);
                            const clips = await clipsOf(m, R, m.keys, null, { hand: m.spec.hand, dirs: m.dirs || undefined }), tac = new Set(m.tac || []);
                            const atlases = [clips.filter((c) => tac.has(c.key)), clips.filter((c) => !tac.has(c.key))].map((cs) => G.packPages(cs));      // companheiro + principal
                            self.postMessage({ job: m.job, atlases }, bufs(atlases.flatMap((a) => a.pages)));
                        } else if (m.type === 'preview') {
                            const k = m.k || G.OUT_K, R = G.rendererFor(m.spec, { k }), pose = G.CLIPS.idle.fn(m.spec.weaponLook || 'none')[0], ramps = G.rampsFor(m.spec), frames = [];
                            const D = m.dirs || 8;
                            for (let d = 0; d < D; d++) frames.push(G.colorize(R.render(pose, (-360 / D) * d, false), ramps));      // (sem a sombra no chão: o pedestal já é o chão)
                            self.postMessage({ job: m.job, frames, W: G.frameFor(k), H: G.frameFor(k), k }, frames.map((f) => f.buffer));
                        } else if (m.type === 'atlas') {                   // atlas inteiro de um TIPO (machucado: dmg — NpcArt.dmgSheet), paginado
                            const spec = m.dmg ? Object.assign({}, G.BY_ID[m.id], { dmg: m.dmg }) : G.BY_ID[m.id], R = G.rendererFor(spec, { k: m.k || G.OUT_K });
                            await rest(m);
                            const a = G.atlasOf(await clipsOf(m, R, m.keys || G.TYPES[m.id].clips, m.id, m.dirs ? { hand: null, dirs: m.dirs } : { hand: null }), m.k || G.OUT_K);
                            const pages = a.pages.map((p) => ({ w: p.w, h: p.h, g: p.g, par: p.par, data: p.data }));
                            self.postMessage({ job: m.job, atlas: { k: a.k, v: a.v, frame: a.frame, clips: a.clips, pages } }, bufs(pages));
                        }
                    } catch (err) {
                        if (err === STOP) self.postMessage({ job: m.job, cancelled: true });
                        else self.postMessage({ job: m.job, error: String(err && err.stack || err) });
                    }
                };
                self.onmessage = (e) => {
                    const m = e.data;
                    if (m.type === 'pace') { if ('hidden' in m) { hidden = !!m.hidden; if (wake) wake(); } if (m.duty) duty = m.duty; return; }
                    if (m.type === 'cancel') { drop.add(m.job); if (wake) wake(); return; }
                    chain = chain.then(() => run(m));
                };
            };
            // (a malha 3D dos personagens vai junto, como texto: o Worker não enxerga as variáveis da página)
            const mesh = typeof NPC_MESH3D !== 'undefined' ? 'const NPC_MESH3D = ' + JSON.stringify(NPC_MESH3D) + ';\n' : '';
            const src = mesh + [NpcGenCore, NpcGenChar, NpcGenRender, NpcGenAnims, NpcGenTypes, NpcGenBuild, NpcGenMesh].map(String).join('\n') + '\n(' + main + ')();';
            w = this._workers[kind] = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
        }
        w._busy = true;
        return w;
    },

    // ------------------------------------------------------------------ cache no aparelho (IndexedDB; sem ele, só na memória)
    // Cada atlas guardado com as páginas comprimidas (NpcArt.zip). No máximo 32 guardados: sai o gravado há mais tempo (o registro
    // '#t' guarda quando cada um foi gravado). Ao abrir, apaga o que é de outra VERSION. Sem CompressionStream (Safari/Firefox antigos)
    // as páginas vão cruas (~4× maiores: 16 direções em alta, ~80 MB por atlas) e ficam só os RAW_MAX gravados por último — o visual
    // em uso, o companheiro tático, as armas novas e o visual anterior; o _load/unzip lê as duas formas.
    RAW_MAX: 8,
    _db() {
        if (this._dbp) return this._dbp;
        return (this._dbp = new Promise((ok) => {
            try {
                const r = indexedDB.open('dirty-money-visual', 1);
                r.onupgradeneeded = () => r.result.createObjectStore('atlas');
                r.onsuccess = () => {
                    const db = r.result;
                    try {
                        const st = db.transaction('atlas', 'readwrite').objectStore('atlas'), q = st.getAllKeys(), pre = `v${this.VERSION}.`;
                        q.onsuccess = () => { for (const k of q.result) if (k !== '#t' && !String(k).startsWith(pre)) st.delete(k); };
                    } catch (e) { /* segue */ }
                    ok(db);
                };
                r.onerror = () => ok(null);
            } catch (e) { ok(null); }
        }));
    },
    async _idbRaw(k, count = false) {
        const db = await this._db();
        if (!db) return null;
        return new Promise((ok) => {
            try { const st = db.transaction('atlas').objectStore('atlas'), q = count ? st.count(k) : st.get(k); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }
            catch (e) { ok(null); }
        });
    },
    async _idbGet(k) {
        const v = await this._idbRaw(k);
        try { return v ? await NpcArt.unzip(v) : null; } catch (e) { return null; }
    },
    async _idbHas(k) { return !!(await this._idbRaw(k, true)); },
    async _idbPut(k, atlas) {
        const db = await this._db();
        if (!db) return;
        let v;
        try { v = await NpcArt.zip(atlas); v.t = Date.now(); } catch (e) { return; }
        const max = v.raw ? this.RAW_MAX : 32;                                // (cru: cabem menos)
        try {
            const st = db.transaction('atlas', 'readwrite').objectStore('atlas');
            st.put(v, k);
            const q = st.get('#t');
            q.onsuccess = () => {
                const T = q.result || {};
                T[k] = Date.now();
                const ks = Object.keys(T).sort((a, b) => T[a] - T[b]);
                while (ks.length > max) { const x = ks.shift(); delete T[x]; st.delete(x); }     // (cada visual: o limpo e os 3 machucados)
                st.put(T, '#t');
            };
        } catch (e) { console.warn('[VISUAL] não guardou no aparelho:', e && e.message); }     // (sem espaço: segue só na memória)
    },
};
