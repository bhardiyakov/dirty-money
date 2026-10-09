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
//   • preview(ficha) = o boneco nas 8 direções (tela de equipamento), num segundo Worker.
// ============================================================================

const PlayerLook = {
    game: null,
    shown: null,            // chave de forma do atlas em uso
    want: null,             // chave de forma pedida (gerando)
    ids: new Map(),         // chave de forma → id do atlas registrado no NpcArt
    tacIds: new Map(),      // chave de forma → id do atlas companheiro (clipes táticos) desse visual
    _job: 0,
    VERSION: 9,             // mude quando o gerador mudar o desenho (invalida o cache do IndexedDB) — 2: adulto, pilotando; 3: sombreado contínuo; 4: atlas HD até 4096 de lado; 5: passada longa; 6: subida (walk_up, climb); 7: corpo da malha 3D; 8: sentar no carro (sitin); 9: começar/parar de nadar e mergulho

    attach(game) { this.game = game; this.shown = null; this.sync(true); },

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
        if (!force && (key === this.shown || key === this.want)) return;
        this.want = key;
        const hero = this.game.sprites.sheets.hero;
        if (key === this.G.shapeKey(this.G.PLAYER_DEFAULT) && NpcArt.atlases.protagonista) { this._use(key, 'protagonista'); return; }
        if (this.ids.has(key)) { this._use(key, this.ids.get(key)); return; }
        void hero;
        this._load(s, key);
    },

    // Troca o atlas da folha do jogador e reinicia o clipe atual (com o desenho novo).
    _use(key, id, partial = false) {
        const hero = this.game.sprites.sheets.hero, a = this.game.player && this.game.player.actor;
        hero.extraAtlas = this.tacIds.get(key) || (partial && this.tacIds.get(this.shown)) || 'protagonista_tatico';      // (gerando: o tático do visual anterior)
        hero.setAtlas(id);
        hero.fallbackAtlas = partial ? (this.ids.get(this.shown) || 'protagonista') : 'protagonista';
        if (!partial) { this.shown = key; if (this.want === key) this.want = null; }
        if (a && a.sheet === hero && a.clip) { const n = a.clipName, w = a.clip.weapon, f = a.frame; a.clip = null; if (a.play(n, w, { restart: true })) a.setFrame(f); }
    },

    async _load(s, key) {
        const job = ++this._job;
        const cached = await this._idbGet(this._ck(key)), cachedT = cached && await this._idbGet(this._ck(key) + '|t');
        if (job !== this._job) return;
        if (cached && cachedT) { this._registerTac(key, cachedT); this._register(key, cached, false); return; }       // (sem o companheiro: gera tudo de novo)
        this._build(s, key, job);
    },
    _ck(key) { return `v${this.VERSION}.${this.k()}|${key}`; },

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
        // guarda só os 6 visuais mais recentes na memória de vídeo
        while (this.ids.size > 6) {
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

    // Gera o atlas em Workers paralelos: o 1º faz parado/andando/correndo (o visual troca em poucos segundos); o resto é dividido entre
    // todos. Os Workers devolvem os quadros já recortados; o empacotamento (rápido) é feito aqui.
    // Fila de clipes (2 por vez) puxada por vários Workers, na ordem do que mais aparece: parado/andando/correndo (com a arma da
    // mão), depois golpes, carro, tático, nadar, pilotar… e o resto. O visual novo entra assim que o 1º bloco fica pronto e vai sendo
    // completado (a cada ~1,5 s) — o que ainda falta sai do visual anterior por pouco tempo. Pronto: guardado no aparelho.
    _COMMON: /^(punch|punchL|kick|enter|sitin|opendoor|carjack|vault|crouch|sneak|roll|strafe|swim|swim_idle|hurt|draw|aim|shoot|walk_up|climb|ride_moto|ride_bike|surrender|pick)$/,
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
        const N = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 2) - 1, chunks.length));
        const got = [];
        let next = 0, left = chunks.length, firstLeft = first.length, lastPub = 0, timer = null;
        const pack = () => {
            const sorted = got.slice().sort((p, q) => idx.get(p.key) - idx.get(q.key));
            return [this._pack(sorted.filter((c) => tac.has(c.key)), k), this._pack(sorted.filter((c) => !tac.has(c.key)), k)];      // companheiro + principal
        };
        const publish = () => {
            timer = null;
            if (job !== this._job) return;
            lastPub = performance.now();
            const [t, a] = pack();
            if (left > 0) {                                                    // parcial: o que falta vem do visual anterior
                if (Object.keys(t.clips).length === tac.size) this._registerTac(key, t);       // (companheiro só completo: o que falta dele não tem para onde cair)
                this._register(key, a, true);
                return;
            }
            this._registerTac(key, t);
            this._register(key, a, false);
            this._idbPut(this._ck(key), a);
            this._idbPut(this._ck(key) + '|t', t);
        };
        const done = (m) => {
            if (job !== this._job) return;
            got.push(...m.clips);
            left--;
            for (const c of m.clips) if (first.includes(c.key)) firstLeft--;
            if (!left) { if (timer) clearTimeout(timer); publish(); return; }
            if (firstLeft > 0) return;
            const wait = 1500 - (performance.now() - lastPub);
            if (wait <= 0 || !lastPub) publish(); else if (!timer) timer = setTimeout(publish, wait);
        };
        const run = (i) => {
            const wk = this._worker('atlas' + i, true);
            const feed = () => {
                if (job !== this._job || next >= chunks.length) { wk._busy = false; return; }
                wk._busy = true;
                wk.postMessage({ type: 'clips', job, spec: s, keys: chunks[next++], k });
            };
            wk.onmessage = (e) => {
                const m = e.data;
                if (m.job !== job) return;
                if (m.error) { wk._busy = false; console.warn('[VISUAL] falhou:', m.error); if (job === this._job) this.want = null; return; }
                done(m);
                feed();
            };
            feed();
        };
        for (let i = 0; i < N; i++) run(i);
    },
    _pack(clips, k) { const a = this.G.packAtlas(clips); return { w: a.w, h: a.h, data: a.data, clips: a.clips, k, v: 2, frame: this.G.frameFor(k) }; },
    // Resolução do visual: a dos atlas prontos, ou o dobro com a alta definição ligada (NpcArt.hd).
    k() { return typeof NpcArt !== 'undefined' && NpcArt.hdOn() ? this.G.HD_K : this.G.OUT_K; },

    // O boneco nas 8 direções (parado), para a tela de equipamento: cb(frames RGBA[8], W, H).
    preview(s, cb) {
        const job = this._pj = (this._pj || 0) + 1, wk = this._worker('preview');
        wk.onmessage = (e) => { wk._busy = false; if (e.data.job === this._pj && !e.data.error) cb(e.data.frames, e.data.W, e.data.H, e.data.k); };
        wk.postMessage({ type: 'preview', job, spec: s, k: this.k() });
        return job;
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
                self.onmessage = (e) => {
                    const m = e.data;
                    try {
                        if (m.type === 'clips') {
                            const R = G.rendererFor(m.spec, { k: m.k || G.OUT_K });
                            const send = (keys, first, more) => {
                                const clips = keys.map((key) => G.renderClip(R, key, null, { hand: m.spec.hand })), buf = [];
                                for (const c of clips) for (const row of c.frames) for (const f of row) if (f.data.byteLength) buf.push(f.data.buffer);
                                self.postMessage({ job: m.job, first, more, clips }, buf);
                            };
                            send(m.keys, !!m.then, !!m.then);
                            if (m.then) send(m.then, false, false);
                        } else if (m.type === 'preview') {
                            const k = m.k || G.OUT_K, R = G.rendererFor(m.spec, { k }), pose = G.CLIPS.idle.fn(m.spec.weaponLook || 'none')[0], ramps = G.rampsFor(m.spec), frames = [];
                            for (let d = 0; d < 8; d++) frames.push(G.colorize(R.render(pose, -45 * d, false), ramps));      // (sem a sombra no chão: o pedestal já é o chão)
                            self.postMessage({ job: m.job, frames, W: G.frameFor(k), H: G.frameFor(k), k }, frames.map((f) => f.buffer));
                        } else if (m.type === 'atlas') {                   // atlas inteiro de um TIPO (alta definição: NpcArt.hdWant)
                            const a = G.buildAtlas(G.BY_ID[m.id], m.keys || G.TYPES[m.id].clips, { typeId: m.id, k: m.k });
                            self.postMessage({ job: m.job, atlas: { w: a.w, h: a.h, data: a.data, clips: a.clips, k: a.k, v: a.v, frame: a.frame } }, [a.data.buffer]);
                        }
                    } catch (err) { self.postMessage({ job: m.job, error: String(err && err.stack || err) }); }
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
    _db() {
        if (this._dbp) return this._dbp;
        return (this._dbp = new Promise((ok) => {
            try {
                const r = indexedDB.open('dirty-money-visual', 1);
                r.onupgradeneeded = () => r.result.createObjectStore('atlas');
                r.onsuccess = () => ok(r.result);
                r.onerror = () => ok(null);
            } catch (e) { ok(null); }
        }));
    },
    async _idbGet(k) {
        const db = await this._db();
        if (!db) return null;
        return new Promise((ok) => {
            try { const q = db.transaction('atlas').objectStore('atlas').get(k); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }
            catch (e) { ok(null); }
        });
    },
    async _idbPut(k, atlas) {
        const db = await this._db();
        if (!db) return;
        try {
            const st = db.transaction('atlas', 'readwrite').objectStore('atlas');
            st.put({ w: atlas.w, h: atlas.h, data: atlas.data, clips: atlas.clips, k: atlas.k, v: atlas.v, frame: atlas.frame, t: Date.now() }, k);
            const all = st.getAllKeys();
            all.onsuccess = () => { const ks = all.result.filter((x) => x !== k); if (ks.length > 10) for (const x of ks.slice(0, ks.length - 10)) st.delete(x); };
        } catch (e) { console.warn('[VISUAL] não guardou no aparelho:', e && e.message); }     // (sem espaço: segue só na memória)
    },
};
